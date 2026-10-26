/*
 * XLNC Care — connection settings.
 *
 * 1. Open your Supabase project → Project Settings → API (or "Data API").
 * 2. Copy "Project URL" into SUPABASE_URL  (looks like https://abcdxyz.supabase.co)
 * 3. Copy the "anon public" key into SUPABASE_ANON_KEY (a long text starting with eyJ...)
 *
 * The anon key is meant to be public: the database rules in supabase/schema.sql
 * decide who can see what. NEVER paste the "service_role" key here.
 */
window.XLNC_CONFIG = {
  SUPABASE_URL: "PASTE_HERE",
  SUPABASE_ANON_KEY: "PASTE_HERE"
};
