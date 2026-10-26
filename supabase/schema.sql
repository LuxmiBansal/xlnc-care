-- =====================================================================
-- XLNC Care — database setup for Supabase.
-- Run this ONCE: Supabase dashboard → SQL Editor → New query → paste all → Run.
-- (Running it again is safe: it only (re)creates what is missing / updates rules.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. People and roles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  role       text not null default 'pending' check (role in ('owner', 'staff', 'manager', 'pending')),
  created_at timestamptz not null default now()
);

-- New sign-in account (invited in Authentication → Users) → profile with no access yet
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for accounts that existed before this script was run
insert into public.profiles (id, email, name)
select u.id, u.email, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

-- The signed-in person's role ('pending' when unknown)
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending');
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles: owner reads all" on public.profiles;
create policy "profiles: owner reads all" on public.profiles
  for select to authenticated using (public.my_role() = 'owner');

drop policy if exists "profiles: owner updates" on public.profiles;
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- Only name and role may be changed from the app
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, role) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. All app data: one row per document
-- ---------------------------------------------------------------------
create table if not exists public.docs (
  coll       text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  updated_by uuid default auth.uid(),
  primary key (coll, id),
  constraint docs_data_is_object check (jsonb_typeof(data) = 'object')
);

create or replace function public.docs_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch
  before insert or update on public.docs
  for each row execute function public.docs_touch();

-- Who may READ a collection
--   data/users/<id>  : only that person (private, e.g. e-billing logins)
--   owner, manager   : every shared collection
--   staff            : res, facilities, forms, mar, marsig, visits, hcal, fsched
create or replace function public.docs_can_read(p_coll text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.my_role() = 'pending' then false
    when starts_with(p_coll, 'data/users/') then p_coll = 'data/users/' || auth.uid()::text
    when public.my_role() in ('owner', 'manager') then true
    when public.my_role() = 'staff' then p_coll in ('res', 'facilities', 'forms', 'mar', 'marsig', 'visits', 'hcal', 'fsched')
    else false
  end;
$$;

-- Who may WRITE a collection
--   data/users/<id>  : only that person
--   owner            : every shared collection
--   staff            : res, mar, marsig, visits, hcal
--   manager, pending : nothing shared
create or replace function public.docs_can_write(p_coll text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.my_role() = 'pending' then false
    when starts_with(p_coll, 'data/users/') then p_coll = 'data/users/' || auth.uid()::text
    when public.my_role() = 'owner' then true
    when public.my_role() = 'staff' then p_coll in ('res', 'mar', 'marsig', 'visits', 'hcal')
    else false
  end;
$$;

alter table public.docs enable row level security;

drop policy if exists "docs: read" on public.docs;
create policy "docs: read" on public.docs
  for select to authenticated using (public.docs_can_read(coll));

drop policy if exists "docs: insert" on public.docs;
create policy "docs: insert" on public.docs
  for insert to authenticated with check (public.docs_can_write(coll));

drop policy if exists "docs: update" on public.docs;
create policy "docs: update" on public.docs
  for update to authenticated using (public.docs_can_write(coll)) with check (public.docs_can_write(coll));

drop policy if exists "docs: delete" on public.docs;
create policy "docs: delete" on public.docs
  for delete to authenticated using (public.docs_can_write(coll));

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

-- Recursive JSON merge used by "update" (objects merge key by key; anything else replaces)
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_object_agg(
              coalesce(ka, kb),
              case
                when va is null then vb
                when vb is null then va
                when jsonb_typeof(va) = 'object' and jsonb_typeof(vb) = 'object' then public.jsonb_deep_merge(va, vb)
                else vb
              end)
       from jsonb_each(a) e1(ka, va)
       full join jsonb_each(b) e2(kb, vb) on ka = kb),
    '{}'::jsonb);
$$;

-- db "update": merge a patch into an EXISTING document (runs with the caller's rights, so the rules above apply)
create or replace function public.docs_merge(p_coll text, p_id text, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'patch must be an object' using errcode = '22023';
  end if;
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch)
   where coll = p_coll and id = p_id
  returning data into result;
  if not found then
    raise exception 'document %/% does not exist (or you may not change it)', p_coll, p_id using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.docs_merge(text, text, jsonb) from public, anon;
grant execute on function public.docs_merge(text, text, jsonb) to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.docs_can_read(text) to authenticated;
grant execute on function public.docs_can_write(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Live updates (Realtime)
-- ---------------------------------------------------------------------
alter table public.docs replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Files (photos, PDFs, attachments) — private bucket "files"
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "files: read" on storage.objects;
create policy "files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and public.my_role() in ('owner', 'staff', 'manager'));

drop policy if exists "files: upload" on storage.objects;
create policy "files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and public.my_role() in ('owner', 'staff'));

drop policy if exists "files: owner replaces" on storage.objects;
create policy "files: owner replaces" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and public.my_role() = 'owner')
  with check (bucket_id = 'files' and public.my_role() = 'owner');

drop policy if exists "files: owner deletes" on storage.objects;
create policy "files: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and public.my_role() = 'owner');

-- ---------------------------------------------------------------------
-- 5. AI writing log (only used if you turn on AI writing — see SETUP.md).
--    The "ai" Edge Function writes one row per Claude call and refuses more
--    than 60 calls per person per hour. People can read their own rows; the
--    owner can read everyone's (to see usage). Nobody can change rows from the app.
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  id            bigserial primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  model         text,
  tier          text,
  ok            boolean,
  input_tokens  integer,
  output_tokens integer
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using (user_id = auth.uid() or public.my_role() = 'owner');

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- ---------------------------------------------------------------------
-- 6. Make Laxmi the owner.
--    FIRST invite yourself (Authentication → Users → Invite user) and sign in once,
--    THEN remove the two dashes at the start of the next line and run just that line.
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'owner' where email = 'laxmi@xlncexotic.com';
