/*
 * XLNC Care service worker.
 * Serves "/_blob/<id>" (attachments, photos, PDF forms) from the private Supabase
 * Storage bucket "files", using the signed-in user's access token, which the page
 * posts here ({type:"token"}). Requests wait until a token arrives.
 * Everything else goes to the network untouched.
 */
let TOKEN = null, URL0 = null, KEY = null;
let waiters = [];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "token" && d.token && d.url) {
    TOKEN = d.token; URL0 = String(d.url).replace(/\/+$/, ""); KEY = d.key || null;
    const w = waiters; waiters = []; w.forEach(f => f());
  }
});

async function askForToken() {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of list) { try { c.postMessage({ type: "need-token" }); } catch (e) {} }
}

function tokenReady(ms) {
  if (TOKEN) return Promise.resolve(true);
  askForToken();
  return new Promise(resolve => {
    const t = setTimeout(() => { waiters = waiters.filter(f => f !== go); resolve(!!TOKEN); }, ms);
    const go = () => { clearTimeout(t); resolve(true); };
    waiters.push(go);
  });
}

async function serveBlob(id) {
  if (!(await tokenReady(15000))) return new Response("Please sign in to XLNC Care first.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const src = `${URL0}/storage/v1/object/authenticated/files/${encodeURIComponent(id)}`;
  const get = () => fetch(src, { headers: Object.assign({ Authorization: "Bearer " + TOKEN }, KEY ? { apikey: KEY } : {}), cache: "no-store" });
  let r = await get();
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    // token may have expired: ask an open page for a fresh one and retry once
    const old = TOKEN; TOKEN = null; await tokenReady(8000); if (!TOKEN) TOKEN = old;
    if (TOKEN !== old) r = await get();
  }
  if (!r.ok) return new Response("File not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const h = new Headers();
  h.set("Content-Type", r.headers.get("Content-Type") || "application/octet-stream");
  const len = r.headers.get("Content-Length"); if (len) h.set("Content-Length", len);
  h.set("Content-Disposition", "inline");
  h.set("Cache-Control", "private, max-age=300");
  return new Response(r.body, { status: 200, headers: h });
}

self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin || e.request.method !== "GET") return;
  const m = u.pathname.match(/\/_blob\/([A-Za-z0-9_-]+)$/);
  if (!m) return;
  e.respondWith(serveBlob(m[1]));
});
