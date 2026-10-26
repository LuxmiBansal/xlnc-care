/*
 * XLNC Care — host shim.
 *
 * The app page (app.html) was written for claude.ai, where it reaches its host only
 * through  window.claude.use(name). This file provides the same  window.claude.use
 * on top of Supabase, so the page code itself stays unchanged:
 *
 *   use("db")        -> table public.docs (coll, id, data jsonb)  + Supabase Realtime
 *   use("user")      -> auth user + public.profiles.role  (owner / staff / manager / pending)
 *   use("assets")    -> private Storage bucket "files", object name = 32-hex asset id
 *   use("downloads") -> ordinary browser download
 *   use("sample")    -> null (Claude AI features only work inside claude.ai)
 *
 * "<site>/_blob/<id>" links (window.BLOB_BASE + id, so the site works under any sub-path,
 * e.g. GitHub Pages' https://user.github.io/repo/) are served by sw.js (service worker), which fetches the object
 * from Storage with the signed-in user's token.
 *
 * Also used by index.html (window.XLNC_PAGE = "login"): there it only creates the
 * Supabase client and shows the "Setup needed" screen when config.js is not filled in.
 */
(function () {
  "use strict";
  const PAGE = window.XLNC_PAGE || "app";
  // Base for attachment links: "/_blob/" on a root site, "/<repo>/_blob/" on a GitHub Pages project site.
  window.BLOB_BASE = new URL("_blob/", location.href).pathname;
  const CFG = window.XLNC_CONFIG || {};
  const URL0 = String(CFG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const KEY = String(CFG.SUPABASE_ANON_KEY || "").trim();
  const configured = !!URL0 && !!KEY && !/PASTE_HERE/i.test(URL0 + KEY) && /^https?:\/\//.test(URL0);
  const XLNC = (window.XLNC = { configured, page: PAGE, url: URL0, key: KEY, sb: null, role: null, profile: null, user: null });
  // email links (invite / password reset) put tokens in the address; keep a copy before the client clears it
  XLNC.initialHash = location.hash; XLNC.initialSearch = location.search;

  /* ---------------- full-screen messages (setup needed / waiting / offline) ---------------- */
  const STYLE = `
  .xlnc-full{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow:auto;
    background:radial-gradient(60% 50% at 100% 0%,#FFF0B3 0%,transparent 60%),radial-gradient(60% 50% at 0% 100%,#D6E8FF 0%,transparent 65%),linear-gradient(140deg,#FFE1D6,#F3D9F2);
    font:15px/1.5 Inter,"Nunito Sans",system-ui,sans-serif;color:#3B2A4A;box-sizing:border-box}
  .xlnc-full *{box-sizing:border-box}
  .xlnc-card{background:#fff;border-radius:24px;box-shadow:0 18px 50px -20px rgba(91,46,140,.35);padding:26px 22px;max-width:520px;width:100%}
  .xlnc-card h1{font:800 26px/1.15 "Baloo 2",system-ui,sans-serif;margin:0 0 8px;color:#5B2E8C}
  .xlnc-card p{margin:8px 0}
  .xlnc-card code{background:#F3EEF6;border-radius:6px;padding:1px 6px;font-size:13px}
  .xlnc-card ol{padding-left:20px;margin:10px 0}
  .xlnc-card li{margin:4px 0}
  .xlnc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:999px;padding:11px 20px;font:700 15px Inter,system-ui,sans-serif;background:#8E5CC4;color:#fff;cursor:pointer;margin-top:10px;text-decoration:none}
  .xlnc-btn.ghost{background:#F3EEF6;color:#5B2E8C}
  html.xlnc-wait body{visibility:hidden}`;
  function addStyle() {
    if (document.getElementById("xlnc-shim-style")) return;
    const s = document.createElement("style"); s.id = "xlnc-shim-style"; s.textContent = STYLE;
    (document.head || document.documentElement).appendChild(s);
  }
  addStyle();
  function onReady(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn, { once: true }); }
  XLNC.fullScreen = function (html, id) {
    onReady(() => {
      let el = document.getElementById("xlnc-full");
      if (!el) { el = document.createElement("div"); el.id = "xlnc-full"; el.className = "xlnc-full"; document.body.appendChild(el); }
      el.innerHTML = `<div class="xlnc-card" role="alert" data-screen="${id || ""}">${html}</div>`;
      document.documentElement.classList.remove("xlnc-wait");
      document.body.style.visibility = "visible";
      for (const c of document.body.children) if (c !== el && c.tagName !== "SCRIPT") c.setAttribute("aria-hidden", "true");
    });
  };
  XLNC.setupScreen = function () {
    XLNC.fullScreen(`<h1>⚙️ Setup needed</h1>
      <p><b>Put your Supabase URL and key in <code>config.js</code></b>, then save it on GitHub (or send the two values to Claude).</p>
      <ol><li>Open your project at <b>supabase.com</b> → <b>Project Settings</b> → <b>API</b>.</li>
      <li>Copy the <b>Project URL</b> into <code>SUPABASE_URL</code>.</li>
      <li>Copy the <b>anon public</b> key into <code>SUPABASE_ANON_KEY</code>.</li>
      <li>Save <code>config.js</code> in the GitHub repository — the site updates in 1–2 minutes.</li></ol>
      <p>Step-by-step help is in <b>SETUP.md</b> (step 2).</p>`, "setup");
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  XLNC.esc = esc;

  if (!configured) {
    XLNC.setupScreen();
    window.claude = { use: () => Promise.resolve(null) };
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    XLNC.fullScreen(`<h1>Can't load</h1><p>The sign-in library didn't load. Check your internet connection and reload the page.</p><button class="xlnc-btn" onclick="location.reload()">↻ Reload</button>`, "nolib");
    window.claude = { use: () => Promise.resolve(null) };
    return;
  }

  const sb = (XLNC.sb = window.supabase.createClient(URL0, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: PAGE === "login", storageKey: "xlnc-care-auth" },
  }));
  if (PAGE === "login") return; // index.html only needs the client

  /* ======================================================================================
   *  APP PAGE
   * ==================================================================================== */
  document.documentElement.classList.add("xlnc-wait");
  let session = null;

  /* ---------- service worker for /_blob/<id> ---------- */
  const swOK = "serviceWorker" in navigator && window.isSecureContext;
  function swPostToken(target) {
    const t = target || (swOK && navigator.serviceWorker.controller);
    if (!t || !session) return;
    try { t.postMessage({ type: "token", token: session.access_token, url: URL0, key: KEY }); } catch (e) {}
  }
  const swReady = !swOK ? Promise.resolve(false) : new Promise(resolve => {
    let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
    navigator.serviceWorker.register("sw.js", { scope: "./" }).then(reg => {
      if (navigator.serviceWorker.controller) fin(true);
      if (reg && reg.active) swPostToken(reg.active);
      if (!reg) fin(false);
    }).catch(e => { console.warn("XLNC: service worker not registered", e); fin(false); });
    navigator.serviceWorker.addEventListener("controllerchange", () => { swPostToken(); fin(true); });
    navigator.serviceWorker.addEventListener("message", e => {
      if (e.data && e.data.type === "need-token") swPostToken(e.source || navigator.serviceWorker.controller);
    });
    setTimeout(() => fin(!!navigator.serviceWorker.controller), 5000);
  });

  /* fallback when no service worker controls the page (old browser, private mode): fetch("/_blob/…") */
  const blobIdOf = u => { try { const x = new URL(u, location.href); if (x.origin !== location.origin) return null; const m = x.pathname.match(/\/_blob\/([A-Za-z0-9_-]+)$/); return m ? m[1] : null; } catch (e) { return null; } };
  async function fetchBlobDirect(id) {
    const r = await window.fetch(`${URL0}/storage/v1/object/authenticated/files/${encodeURIComponent(id)}`, { headers: { Authorization: "Bearer " + (session && session.access_token), apikey: KEY } });
    return r.ok ? r : new Response("Not found", { status: 404 });
  }
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const u = typeof input === "string" ? input : input && input.url;
    const id = u && blobIdOf(u);
    if (id && !(swOK && navigator.serviceWorker.controller)) return fetchBlobDirect(id);
    return origFetch(input, init);
  };
  document.addEventListener("click", async e => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return; const id = blobIdOf(a.getAttribute("href"));
    if (!id || (swOK && navigator.serviceWorker.controller)) return;
    e.preventDefault(); const w = window.open("", "_blank");
    try { const b = await (await fetchBlobDirect(id)).blob(); const u = URL.createObjectURL(b); if (w) w.location = u; else location.href = u; } catch (err) { if (w) w.close(); }
  }, true);

  /* ---------- boot: session -> profile -> role ---------- */
  function goLogin() { location.replace("index.html"); }
  async function loadProfile(uid) {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await sb.from("profiles").select("id,email,name,role").eq("id", uid).maybeSingle();
      if (!error) return data;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
    throw new Error("profile");
  }
  XLNC.signOut = async function () { try { await sb.auth.signOut(); } catch (e) {} goLogin(); };
  const boot = (XLNC.boot = (async () => {
    const { data } = await sb.auth.getSession();
    session = data && data.session;
    if (!session) { goLogin(); return new Promise(() => {}); }
    XLNC.user = session.user;
    let prof;
    try { prof = await loadProfile(session.user.id); }
    catch (e) {
      XLNC.fullScreen(`<h1>Can't reach the server</h1><p>Check your internet connection and try again.</p><button class="xlnc-btn" onclick="location.reload()">↻ Try again</button> <button class="xlnc-btn ghost" onclick="XLNC.signOut()">Sign out</button>`, "offline");
      return new Promise(() => {});
    }
    XLNC.profile = prof || { id: session.user.id, email: session.user.email, name: "", role: "pending" };
    XLNC.role = XLNC.profile.role || "pending";
    if (XLNC.role === "pending") {
      XLNC.fullScreen(`<h1>👋 Almost there</h1><p>You're signed in as <b>${esc(session.user.email)}</b>, but your account hasn't been given access yet.</p>
        <p>Ask Laxmi to open <b>👥 Team</b> in XLNC Care and set your role. Then reload this page.</p>
        <button class="xlnc-btn" onclick="location.reload()">↻ Reload</button> <button class="xlnc-btn ghost" onclick="XLNC.signOut()">Sign out</button>`, "pending");
      return new Promise(() => {});
    }
    await swReady; swPostToken();
    onReady(() => { document.documentElement.classList.remove("xlnc-wait"); });
    return XLNC.profile;
  })());
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "SIGNED_OUT") { session = null; goLogin(); return; }
    if (s) { session = s; swPostToken(); }
  });

  /* ======================================================================================
   *  db
   * ==================================================================================== */
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  function splitPath(p, want) {
    if (typeof p !== "string" || !p) throw new TypeError(`db: path must be a non-empty string`);
    if (p.length > 1000) throw new TypeError("db: path longer than 1000 bytes");
    const s = p.split("/");
    if (s.length > 16) throw new TypeError("db: more than 16 path segments");
    for (const x of s) if (!SEG.test(x) || x === "." || x === ".." || x.length > 200) throw new TypeError(`db: bad path segment "${x}" in "${p}"`);
    if (want === "doc" && s.length % 2) throw new TypeError(`db: a document path needs an even number of segments ("${p}" has ${s.length})`);
    if (want === "coll" && !(s.length % 2)) throw new TypeError(`db: a collection path needs an odd number of segments ("${p}" has ${s.length})`);
    return s;
  }
  const uid = () => (session && session.user && session.user.id) || null;
  /* "data/users/me/..." and "data/users/<my id>/..." -> the signed-in user's private rows */
  function mapColl(path) {
    const s = path.split("/");
    if (s[0] === "data" && s[1] === "users" && s.length >= 3) {
      if (s[2] === "me" || s[2] === uid()) s[2] = uid() || "anon";
      else return { coll: s.join("/"), foreign: true };
    }
    return { coll: s.join("/"), foreign: false };
  }
  const err = (code, message) => ({ code, message: message || code });
  function mapErr(e) {
    if (!e) return err("unavailable", "Unknown error");
    if (e.code && typeof e.code === "string" && /^(invalid_argument|resource_exhausted|quota_exceeded|unavailable|revoked)$/.test(e.code)) return e;
    const c = String(e.code || ""), m = String(e.message || e.details || e);
    if (c === "42501" || /row-level security|permission denied/i.test(m)) return err("invalid_argument", "Not allowed for your role: " + m);
    if (c === "P0002" || c === "PGRST116" || /^22|^23/.test(c)) return err("invalid_argument", m);
    if (c === "54000" || /too large|payload/i.test(m)) return err("invalid_argument", m);
    if (c === "53400") return err("quota_exceeded", m);
    return err("unavailable", m);
  }
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  function deepMerge(base, patch) {
    const out = isObj(base) ? { ...base } : {};
    for (const k of Object.keys(patch)) out[k] = isObj(patch[k]) && isObj(out[k]) ? deepMerge(out[k], patch[k]) : clone(patch[k]);
    return out;
  }
  function checkBody(data) {
    if (!isObj(data)) throw err("invalid_argument", "Document body must be a plain object");
    let s; try { s = JSON.stringify(data); } catch (e) { throw err("invalid_argument", "Document body is not JSON"); }
    if (new Blob([s]).size > 256 * 1024) throw err("invalid_argument", "Document over 256 KiB");
    return JSON.parse(s);
  }
  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });
  const META_P = Object.freeze({ fromCache: false, hasPendingWrites: true });
  function mkSnap(id, data, pending) {
    const d = data === undefined ? undefined : deepFreeze(clone(data));
    return Object.freeze({ id, exists: d !== undefined, data: () => d, metadata: pending ? META_P : META, get: f => (d ? d[f] : undefined) });
  }
  const missingSnap = id => mkSnap(id, undefined);

  async function waitBoot() { await boot; }
  async function fetchColl(coll) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("docs").select("id,data").eq("coll", coll).order("id").range(from, from + 999);
      if (error) throw mapErr(error);
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function fetchRow(coll, id) {
    const { data, error } = await sb.from("docs").select("id,data").eq("coll", coll).eq("id", id).maybeSingle();
    if (error) throw mapErr(error);
    return data;
  }

  /* One live state per collection, shared by every listener on it (collection or doc listeners). */
  const states = new Map();
  let chanN = 0;
  class CollState {
    constructor(coll) { this.coll = coll; this.docs = new Map(); this.pending = new Map(); this.wseq = new Map(); this.listeners = new Set(); this.ready = null; this.channel = null; this.subOnce = false; this.poll = null; }
    start() {
      if (this.ready) return this.ready;
      this.ready = (async () => {
        for (let i = 0; ; i++) {
          try { this.replaceAll(await fetchColl(this.coll), true); break; }
          catch (e) { if (e && e.code === "invalid_argument") throw e; await new Promise(r => setTimeout(r, Math.min(30000, 2000 * (i + 1)))); }
        }
        this.subscribe();
      })();
      return this.ready;
    }
    subscribe() {
      const coll = this.coll, onRow = p => this.onRow(p);
      this.channel = sb.channel(`docs-${++chanN}-${coll.replace(/[^A-Za-z0-9_-]/g, "_")}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "docs", filter: `coll=eq.${coll}` }, onRow)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "docs", filter: `coll=eq.${coll}` }, onRow)
        // DELETE events cannot be filtered by Realtime; old record carries the primary key (coll, id)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "docs" }, p => { const o = p && p.old; if (o && o.coll === coll && o.id != null) this.applyRemote(o.id, undefined); })
        .subscribe(status => {
          if (status === "SUBSCRIBED") { if (this.subOnce) this.resync(); this.subOnce = true; if (this.poll) { clearInterval(this.poll); this.poll = null; } }
          else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !this.poll && this.listeners.size) this.poll = setInterval(() => this.resync(), 30000);
        });
    }
    stop() {
      if (this.channel) { try { sb.removeChannel(this.channel); } catch (e) {} this.channel = null; }
      if (this.poll) clearInterval(this.poll); this.poll = null; this.ready = null; this.subOnce = false; this.docs.clear();
      states.delete(this.coll);
    }
    async onRow(p) {
      const n = p && p.new; if (!n || n.coll !== this.coll || n.id == null) return;
      if (this.pending.get(n.id)) return; // our own write in flight: its result is applied when it settles
      let data = n.data;
      if (!isObj(data)) { try { const r = await fetchRow(this.coll, n.id); data = r ? r.data : undefined; } catch (e) { return; } }
      this.applyRemote(n.id, data);
    }
    applyRemote(id, data) {
      if (this.pending.get(id)) return;
      this.put(id, data, false);
    }
    put(id, data, pending) {
      const cur = this.docs.get(id);
      if (data === undefined) { if (!cur) return; this.docs.delete(id); }
      else {
        if (cur && JSON.stringify(cur.data()) === JSON.stringify(data)) return; // unchanged: keep the same snapshot object
        this.docs.set(id, mkSnap(id, data, pending));
      }
      this.emit();
    }
    replaceAll(rows, silent) {
      const seen = new Set();
      for (const r of rows) {
        seen.add(r.id); if (this.pending.get(r.id)) continue;
        const cur = this.docs.get(r.id);
        if (!cur || JSON.stringify(cur.data()) !== JSON.stringify(r.data)) this.docs.set(r.id, mkSnap(r.id, r.data, false));
      }
      for (const id of [...this.docs.keys()]) if (!seen.has(id) && !this.pending.get(id)) this.docs.delete(id);
      if (!silent) this.emit();
    }
    async resync() { try { this.replaceAll(await fetchColl(this.coll)); } catch (e) {} }
    emit() { for (const l of [...this.listeners]) { try { l.deliver(); } catch (e) { console.error(e); } } }
  }
  function stateFor(coll) { let s = states.get(coll); if (!s) { s = new CollState(coll); states.set(coll, s); } return s; }
  XLNC.resyncAll = () => Promise.all([...states.values()].map(s => s.resync()));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") XLNC.resyncAll(); });
  window.addEventListener("online", () => XLNC.resyncAll());

  function addListener(coll, listener) {
    const st = stateFor(coll);
    let dead = false;
    const l = {
      deliver: () => { if (!dead) listener.deliver(st); },
      fail: e => { if (dead) return; dead = true; st.listeners.delete(l); try { listener.error ? listener.error(e) : console.error("db listener", e); } catch (x) {} },
    };
    (async () => {
      try { await waitBoot(); if (dead) return; st.listeners.add(l); await st.start(); if (!dead) l.deliver(); }
      catch (e) { l.fail(mapErr(e)); }
    })();
    return () => { if (dead) return; dead = true; st.listeners.delete(l); if (!st.listeners.size) setTimeout(() => { if (!st.listeners.size && !st.pending.size) st.stop(); }, 1000); };
  }

  /* write helpers — optimistic local apply, then the server result (or a re-read on failure) */
  async function withPending(coll, id, local, op) {
    const st = states.get(coll), live = st && st.ready;
    let seq = 0;
    if (live) { st.pending.set(id, (st.pending.get(id) || 0) + 1); seq = (st.wseq.get(id) || 0) + 1; st.wseq.set(id, seq); if (local) st.put(id, local.data, true); }
    try { const res = await op(); return res; }
    finally {
      if (live) {
        const n = (st.pending.get(id) || 1) - 1; n ? st.pending.set(id, n) : st.pending.delete(id);
        // re-read the saved row, unless a newer write to this document started meanwhile (its own re-read wins)
        if (!n) { try { const r = await fetchRow(coll, id); if (st.wseq.get(id) === seq && !st.pending.get(id)) st.put(id, r ? r.data : undefined, false); } catch (e) {} }
      }
    }
  }

  function makeQuery(path, coll, foreign, filters, order, lim) {
    const apply = st => {
      let list = [...st.docs.values()];
      for (const [f, op, v] of filters) list = list.filter(s => { const x = s.data()[f]; switch (op) {
        case "==": return JSON.stringify(x) === JSON.stringify(v); case "!=": return x !== undefined && JSON.stringify(x) !== JSON.stringify(v);
        case "<": return x < v; case "<=": return x <= v; case ">": return x > v; case ">=": return x >= v;
        case "in": return Array.isArray(v) && v.some(y => JSON.stringify(y) === JSON.stringify(x)); case "not-in": return Array.isArray(v) && x !== undefined && !v.some(y => JSON.stringify(y) === JSON.stringify(x));
        case "array-contains": return Array.isArray(x) && x.some(y => JSON.stringify(y) === JSON.stringify(v)); default: return false; } });
      if (order) { const [f, dir] = order, k = dir === "desc" ? -1 : 1; list.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; if (x === undefined && y === undefined) return a.id < b.id ? -1 : 1; if (x === undefined) return 1; if (y === undefined) return -1; return x < y ? -k : x > y ? k : a.id < b.id ? -1 : 1; }); }
      else list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (lim) list = list.slice(0, lim);
      return list;
    };
    const qsnap = (list, changes) => Object.freeze({ docs: list, size: list.length, empty: !list.length, docChanges: () => changes, metadata: list.some(s => s.metadata.hasPendingWrites) ? META_P : META, forEach: f => list.forEach(f) });
    const q = {
      where(f, op, v) { if (filters.length >= 10) throw new TypeError("db: at most 10 filters"); return makeQuery(path, coll, foreign, [...filters, [f, op, v]], order, lim); },
      orderBy(f, dir) { return makeQuery(path, coll, foreign, filters, [f, dir || "asc"], lim); },
      limit(n) { return makeQuery(path, coll, foreign, filters, order, Math.max(1, Math.min(1000, n | 0))); },
      async get() {
        await waitBoot();
        if (foreign) return qsnap([], []);
        const st = states.get(coll);
        if (st && st.ready && st.listeners.size) { await st.ready; const l = apply(st); return qsnap(l, l.map((d, i) => ({ type: "added", doc: d, oldIndex: -1, newIndex: i }))); }
        const tmp = new CollState(coll); tmp.replaceAll(await fetchColl(coll), true);
        const l = apply(tmp); return qsnap(l, l.map((d, i) => ({ type: "added", doc: d, oldIndex: -1, newIndex: i })));
      },
      onSnapshot(next, error) {
        if (foreign) { let dead = false; Promise.resolve().then(() => { if (!dead) next(qsnap([], [])); }); return () => { dead = true; }; }
        let prev = null;
        return addListener(coll, {
          error,
          deliver: st => {
            const list = apply(st), changes = [];
            const prevIdx = new Map((prev || []).map((s, i) => [s.id, i])), nowIdx = new Map(list.map((s, i) => [s.id, i]));
            if (prev) for (const [id, i] of prevIdx) if (!nowIdx.has(id)) changes.push({ type: "removed", doc: prev[i], oldIndex: i, newIndex: -1 });
            list.forEach((s, i) => { if (!prev || !prevIdx.has(s.id)) changes.push({ type: "added", doc: s, oldIndex: -1, newIndex: i }); else if (prev[prevIdx.get(s.id)] !== s) changes.push({ type: "modified", doc: s, oldIndex: prevIdx.get(s.id), newIndex: i }); });
            if (prev && !changes.length) return;
            prev = list;
            next(qsnap(list, changes));
          },
        });
      },
    };
    return q;
  }

  function docRef(path) {
    const s = splitPath(path, "doc"), id = s[s.length - 1], cpath = s.slice(0, -1).join("/");
    const { coll, foreign } = mapColl(cpath);
    const deny = () => Promise.reject(err("invalid_argument", "That is another person's private data"));
    return Object.freeze({
      id, path,
      async get() { await waitBoot(); if (foreign) return missingSnap(id); const r = await fetchRow(coll, id); return r ? mkSnap(id, r.data) : missingSnap(id); },
      async set(data) {
        await waitBoot(); if (foreign) return deny(); const body = checkBody(data);
        await withPending(coll, id, { data: body }, async () => {
          const { error } = await sb.from("docs").upsert({ coll, id, data: body }, { onConflict: "coll,id" });
          if (error) throw mapErr(error);
        });
      },
      async update(patch) {
        await waitBoot(); if (foreign) return deny(); const body = checkBody(patch);
        const st = states.get(coll), cur = st && st.ready && st.docs.get(id);
        await withPending(coll, id, cur ? { data: deepMerge(cur.data(), body) } : null, async () => {
          // server-side recursive merge (public.docs_merge); fails if the document does not exist
          const { error } = await sb.rpc("docs_merge", { p_coll: coll, p_id: id, p_patch: body });
          if (error) throw mapErr(error);
        });
      },
      async delete() {
        await waitBoot(); if (foreign) return deny();
        await withPending(coll, id, { data: undefined }, async () => {
          const { data, error } = await sb.from("docs").delete().match({ coll, id }).select("id");
          if (error) throw mapErr(error);
          if (!data || !data.length) { const still = await fetchRow(coll, id).catch(() => null); if (still) throw err("invalid_argument", "Not allowed for your role"); }
        });
      },
      async acquire(opts) {
        // Best-effort cooperative lease (not used by XLNC Care): stored in the document's _lease field.
        await waitBoot(); if (foreign) return deny();
        const holder = String(opts && opts.holder || ""), ttl = Math.max(1000, Math.min(600000, (opts && opts.ttlMs) || 30000));
        const r = await fetchRow(coll, id); const L = r && r.data && r.data._lease;
        if (L && L.holder !== holder && Date.parse(L.expiresAt) > Date.now()) return { acquired: false, expiresAt: L.expiresAt };
        const expiresAt = new Date(Date.now() + ttl).toISOString();
        const body = { ...(r ? r.data : {}), ...((opts && opts.data) || {}), _lease: { holder, expiresAt } };
        const { error } = await sb.from("docs").upsert({ coll, id, data: body }, { onConflict: "coll,id" });
        if (error) throw mapErr(error);
        return { acquired: true, version: Date.now(), expiresAt, holder };
      },
      onSnapshot(next, error) {
        if (foreign) { let dead = false; Promise.resolve().then(() => { if (!dead) next(missingSnap(id)); }); return () => { dead = true; }; }
        let prev = null, first = true;
        return addListener(coll, { error, deliver: st => { const sn = st.docs.get(id) || null; if (!first && sn === prev) return; first = false; prev = sn; next(sn || missingSnap(id)); } });
      },
      collection(sub) { return collRef(path + "/" + sub); },
    });
  }
  function collRef(path) {
    splitPath(path, "coll");
    const { coll, foreign } = mapColl(path);
    const q = makeQuery(path, coll, foreign, [], null, 0);
    return Object.freeze({
      ...q, path,
      doc(id) { return docRef(path + "/" + (id == null ? "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) : id)); },
      async add(data) { const r = this.doc(); await r.set(data); return r; },
    });
  }
  const dbApi = Object.freeze({ doc: docRef, collection: collRef });

  /* ======================================================================================
   *  user
   * ==================================================================================== */
  const role = () => XLNC.role || "pending";
  const nameOf = () => (XLNC.profile && XLNC.profile.name) || ((session && session.user.email) || "").split("@")[0] || "Me";
  const safe = (fn, dflt) => async (...a) => { try { await boot; return await fn(...a); } catch (e) { return dflt; } };
  const userApi = Object.freeze({
    isOwner: safe(() => role() === "owner", false),
    canEdit: safe(() => role() === "owner", false),
    can: safe(c => c === "data.write" ? (role() === "owner" || role() === "staff") : c === "assets.write" ? role() === "owner" : c === "data.read" ? role() !== "pending" : null, null),
    id: safe(() => uid(), null),
    me: safe(() => ({ id: uid(), name: nameOf(), avatarUrl: "", color: "#8E5CC4", email: session.user.email || null, isOwner: role() === "owner", canEdit: role() === "owner" }),
      { id: null, name: "", avatarUrl: "", color: "#8E5CC4", email: null, isOwner: false, canEdit: false }),
    name: safe(() => nameOf(), ""),
    email: safe(() => session.user.email || null, null),
    avatarUrl: safe(() => null, null),
    profiles: safe(async ids => {
      const list = Array.isArray(ids) ? ids : [ids]; const out = {};
      const { data } = await sb.from("profiles").select("id,email,name").in("id", list);
      for (const p of data || []) out[p.id] = { id: p.id, name: p.name || (p.email || "").split("@")[0], avatarUrl: "", color: "#8E5CC4", email: p.email, isMe: p.id === uid(), guest: false };
      return out;
    }, {}),
    search: safe(async q => {
      const { data } = await sb.from("profiles").select("id,email,name"); const t = String(q || "").toLowerCase();
      return (data || []).filter(p => (p.name + " " + p.email).toLowerCase().includes(t)).slice(0, 20).map(p => ({ id: p.id, name: p.name || p.email, avatarUrl: "", color: "#8E5CC4", email: p.email, isMe: p.id === uid(), guest: false }));
    }, []),
  });

  /* ======================================================================================
   *  assets  (private bucket "files"; object name = 32-hex id)
   * ==================================================================================== */
  const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "video/mp4", "video/webm", "application/pdf", "font/woff2", "font/woff", "font/ttf", "font/otf", "text/csv", "text/markdown", "application/json", "text/plain", "text/css", "text/javascript"]);
  const hex32 = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); };
  const aerr = (code, message) => ({ code, message: message || code });
  function mapStorageErr(e) {
    const m = String((e && (e.message || e.error)) || e), st = Number(e && (e.statusCode || e.status));
    if (st === 413 || /too large|exceeded the maximum/i.test(m)) return aerr("too_large", m);
    if (st === 403 || /row-level security|unauthori[sz]ed|not allowed/i.test(m)) return aerr("not_granted", m);
    if (/mime|content type|invalid_mime/i.test(m)) return aerr("unsupported_type", m);
    if (st === 401) return aerr("upstream_auth", m);
    if (st === 429) return aerr("rate_limited", m);
    return aerr("upstream_error", m);
  }
  const assetsApi = Object.freeze({
    async upload(blob, options) {
      if (!(blob instanceof Blob)) throw aerr("invalid_request", "upload() needs a Blob or File");
      if (!blob.size) throw aerr("invalid_request", "The file is empty");
      const type = String((options && options.type) || blob.type || "").trim();
      if (!type) throw aerr("invalid_request", "No content type: pass {type}");
      if (!TYPES.has(type)) throw aerr("unsupported_type", type + " is not accepted");
      const max = type === "image/svg+xml" ? 2 : /^text\/(css|javascript)$/.test(type) ? 16 : 20;
      if (blob.size > max * 1024 * 1024) throw aerr("too_large", `Over ${max} MiB`);
      const id = hex32();
      const { error } = await sb.storage.from("files").upload(id, blob, { contentType: type, upsert: false, cacheControl: "3600" });
      if (error) throw mapStorageErr(error);
      return { id, url: window.BLOB_BASE + id, sizeBytes: blob.size, contentType: type };
    },
    async list() {
      const assets = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await sb.storage.from("files").list("", { limit: 1000, offset: off, sortBy: { column: "created_at", order: "asc" } });
        if (error) throw mapStorageErr(error);
        for (const o of data || []) if (o.id || o.metadata) assets.push({ id: o.name, url: window.BLOB_BASE + o.name, contentType: (o.metadata && o.metadata.mimetype) || "", sizeBytes: (o.metadata && o.metadata.size) || 0, createdAt: o.created_at });
        if (!data || data.length < 1000) break;
      }
      return { assets, usage: { files: assets.length, bytes: assets.reduce((a, b) => a + b.sizeBytes, 0), maxFiles: 100000, maxBytes: 1024 * 1024 * 1024 } };
    },
    async delete(ref) {
      const id = String(ref || "").replace(/^.*\/_blob\//, "");
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw aerr("invalid_request", "Not an asset id");
      if (role() !== "owner") throw aerr("not_uploader", "Only the owner can delete files");
      const { data, error } = await sb.storage.from("files").remove([id]);
      if (error) throw mapStorageErr(error);
      return { deleted: !!(data && data.length) };
    },
  });

  /* ======================================================================================
   *  downloads
   * ==================================================================================== */
  const MIME = { gif: "image/gif", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", txt: "text/plain", json: "application/json", md: "text/markdown",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", epub: "application/epub+zip", csv: "text/csv", ttf: "font/ttf", html: "text/html", svg: "image/svg+xml", pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip" };
  const downloadsApi = Object.freeze({
    async save(req) {
      const filename = req && req.filename, data = req && req.data;
      if (typeof filename !== "string" || !filename || filename.length > 512) throw { code: "bad_request", message: "Bad filename" };
      const ext = (filename.split(".").pop() || "").toLowerCase();
      if (!MIME[ext] || !filename.includes(".")) throw { code: "rejected_extension", message: "Extension not allowed: " + ext };
      let blob;
      if (data instanceof Blob) blob = new Blob([data], { type: MIME[ext] });
      else if (typeof data === "string" || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) blob = new Blob([data], { type: MIME[ext] });
      else throw { code: "bad_request", message: "Bad data" };
      if (!blob.size) throw { code: "bad_request", message: "Empty file" };
      const name = filename.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, "").replace(/\s+/g, " ").trim() || "download." + ext;
      const u = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = u; a.download = name; a.rel = "noopener"; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      return { status: "saved" };
    },
  });

  /* ======================================================================================
   *  sample  (Claude API through the Supabase Edge Function "ai"; the API key stays on the server)
   * ==================================================================================== */
  const AI_URL = URL0 + "/functions/v1/ai";
  const serr = (code, message, extra) => Object.assign({ code, message: message || code }, extra || {});
  async function aiPost(body, signal) {
    let r;
    try {
      r = await origFetch(AI_URL, { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (session && session.access_token), apikey: KEY }, body: JSON.stringify(body) });
    } catch (e) { if (e && e.name === "AbortError") throw serr("cancelled", "Cancelled"); throw serr("upstream_error", "Can't reach the AI service"); }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const code = (j && j.error) || (r.status === 401 ? "session_expired" : r.status === 403 ? "not_granted" : r.status === 429 ? "rate_limited" : r.status === 413 ? "prompt_too_large" : r.status === 503 ? "sampling_disabled" : "upstream_error");
      throw serr(code === "not_configured" ? "sampling_disabled" : code, (j && j.message) || "AI error " + r.status);
    }
    return j || {};
  }
  const b64 = blob => new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1] || ""); fr.onerror = () => bad(fr.error); fr.readAsDataURL(blob); });
  const IMG_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  async function toImages(images) {
    if (!images) return [];
    const list = images instanceof Blob ? [images] : Array.from(images);
    if (list.length > 8) throw serr("invalid_request", "At most 8 images");
    const out = [];
    for (const b of list) {
      if (!IMG_OK.includes(b.type)) throw serr("image_rejected", "Images must be JPEG, PNG, WEBP or GIF");
      if (b.size > 3.5 * 1024 * 1024) throw serr("image_rejected", "Image over 3.5 MB");
      out.push({ media_type: b.type, data: await b64(b) });
    }
    return out;
  }
  async function sampleCall(input, options) {
    const o = options || {};
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : Array.isArray(input) ? input.map(m => ({ role: m.role, content: String(m.content) })) : null;
    if (!messages || !messages.length) throw serr("invalid_request", "input must be a string or messages");
    if (JSON.stringify(messages).length > 600000) throw serr("prompt_too_large", "Prompt too large");
    const tier = o.modelTier === "complex" ? "complex" : o.modelTier === "quick" ? "quick" : "default";
    const j = await aiPost({ messages, tier, images: await toImages(o.images) }, o.signal);
    const text = String(j.text || "");
    if (typeof o.onText === "function") try { o.onText({ text, delta: text }); } catch (e) {}
    return { text, truncated: !!j.truncated, modelTierApplied: tier, modelApplied: j.model };
  }
  /* first JSON object/array in a reply (ignores prose or ```json fences around it) */
  function firstJson(t) {
    const s = String(t || "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i]; if (c !== "{" && c !== "[") continue;
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < s.length; j++) {
        const ch = s[j];
        if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true; else if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") { if (--depth === 0) { try { return { ok: true, v: JSON.parse(s.slice(i, j + 1)) }; } catch (e) { break; } } }
      }
    }
    return { ok: false };
  }
  async function sampleJson(input, options) {
    const r1 = await sampleCall(input, options), p1 = firstJson(r1.text);
    if (p1.ok) return p1.v;
    // one retry, telling Claude its reply was not valid JSON
    const msgs = typeof input === "string" ? [{ role: "user", content: input }] : input.map(m => ({ role: m.role, content: String(m.content) }));
    const r2 = await sampleCall([...msgs, { role: "assistant", content: r1.text.slice(0, 20000) || "(empty)" }, { role: "user", content: "That reply was not valid JSON. Reply again with ONLY the JSON, no other text." }], options);
    const p2 = firstJson(r2.text);
    if (p2.ok) return p2.v;
    throw serr("invalid_json", "Claude's reply was not valid JSON", { text: r2.text });
  }
  const sampleApi = (() => {
    const f = (input, options) => sampleCall(input, options);
    f.json = sampleJson;
    f.limits = async () => ({ maxPromptBytes: 600000, images: { maxCount: 8, maxInputBytes: 3.5 * 1024 * 1024, mediaTypes: IMG_OK.slice() } });
    return Object.freeze(f);
  })();
  /* Probe once per page load: null when the function isn't deployed, has no API key, or this role can't use it. */
  async function probeSample() {
    if (!(role() === "owner" || role() === "staff")) return null;
    try { const j = await aiPost({ probe: true }); return j && j.ok ? sampleApi : null; }
    catch (e) { return null; }
  }
  XLNC.firstJson = firstJson;

  /* ======================================================================================
   *  window.claude.use
   * ==================================================================================== */
  const memo = {};
  function use(name) {
    if (memo[name]) return memo[name];
    let p;
    switch (name) {
      case "db": p = boot.then(() => dbApi); break;
      case "user": p = boot.then(() => userApi); break;
      case "assets": p = boot.then(() => (role() === "owner" || role() === "staff" ? assetsApi : null)); break;
      case "downloads": p = Promise.resolve(downloadsApi); break;
      case "sample": p = boot.then(probeSample); break; // null unless the "ai" Edge Function is set up
      default: return Promise.resolve(null);
    }
    return (memo[name] = p);
  }
  window.claude = Object.freeze({ use });
})();
