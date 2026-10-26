/*
 * XLNC Care web app — header controls (who is signed in, Sign out) and the
 * owner-only screens: 👥 Team (roles) and ⬆ Import data (from the claude.ai export).
 */
(function () {
  "use strict";
  const X = window.XLNC;
  if (!X || !X.sb || !X.boot) return;
  const sb = X.sb, esc = X.esc;

  const css = `
  .xl-hc{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center}
  .xl-hc button.pill{border:0;cursor:pointer;font:800 12.5px var(--body,Inter,system-ui,sans-serif)}
  .xl-hc .xl-me{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#3B2A4A!important}
  .xl-hc .xl-out{background:#8E5CC4!important;color:#fff!important}
  .xl-sheet{position:fixed;inset:0;z-index:2147482000;background:rgba(43,23,64,.42);display:flex;align-items:flex-end;justify-content:center}
  @media (min-width:700px){.xl-sheet{align-items:center;padding:24px}}
  .xl-box{background:#FBF6F9;color:#3B2A4A;width:100%;max-width:760px;max-height:92vh;display:flex;flex-direction:column;border-radius:24px 24px 0 0;box-shadow:0 -10px 40px -10px rgba(43,23,64,.4);font:14.5px/1.5 Inter,"Nunito Sans",system-ui,sans-serif}
  @media (min-width:700px){.xl-box{border-radius:24px}}
  .xl-hd{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #E6DDE9}
  .xl-hd h2{margin:0;flex:1;font:800 22px/1.15 "Baloo 2",system-ui,sans-serif;color:#5B2E8C}
  .xl-x{border:0;background:#F3EEF6;color:#5B2E8C;border-radius:999px;width:36px;height:36px;font:700 16px system-ui;cursor:pointer}
  .xl-bd{padding:16px 18px 22px;overflow:auto;display:flex;flex-direction:column;gap:14px}
  .xl-bd>*{flex-shrink:0}
  .xl-card{background:#fff;border-radius:16px;padding:14px;box-shadow:0 1px 0 #E6DDE9}
  .xl-card h3{margin:0 0 6px;font:800 16px "Baloo 2",system-ui,sans-serif;color:#5B2E8C}
  .xl-card p{margin:6px 0}
  .xl-card ol{margin:6px 0;padding-left:20px}
  .xl-row{display:grid;grid-template-columns:1fr;gap:8px;align-items:center;background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 1px 0 #E6DDE9}
  @media (min-width:640px){.xl-row{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 130px auto}}
  .xl-row .em{font-weight:700;overflow-wrap:anywhere}
  .xl-row .em small{display:block;font-weight:500;color:#7c6a86}
  .xl-in,.xl-sel{width:100%;box-sizing:border-box;border:1.5px solid #E6DDE9;border-radius:12px;padding:9px 11px;font:15px Inter,system-ui,sans-serif;background:#fff;color:#3B2A4A}
  .xl-in:focus,.xl-sel:focus{outline:2px solid #C9A6F0;border-color:#8E5CC4}
  .xl-go{border:0;border-radius:999px;padding:10px 18px;font:700 14.5px Inter,system-ui,sans-serif;background:#8E5CC4;color:#fff;cursor:pointer}
  .xl-go:disabled{opacity:.5;cursor:default}
  .xl-go.ghost{background:#F3EEF6;color:#5B2E8C}
  .xl-msg{min-height:1.2em;font-weight:600;color:#2F7D57}
  .xl-msg.bad{color:#C0392B}
  .xl-badge{display:inline-block;border-radius:999px;padding:1px 9px;font:700 12px Inter,system-ui;background:#F3EEF6;color:#5B2E8C}
  .xl-badge.pending{background:#FFF0B3;color:#7a5a00}
  .xl-file{display:flex;flex-direction:column;gap:6px}
  .xl-file input{font:14px Inter,system-ui,sans-serif;max-width:100%}
  .xl-bar{height:12px;border-radius:999px;background:#F3EEF6;overflow:hidden}
  .xl-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8E5CC4,#E58BB7);transition:width .2s}
  .xl-log{font:12.5px/1.45 ui-monospace,Menlo,monospace;background:#fff;border-radius:12px;padding:10px;max-height:180px;overflow:auto;white-space:pre-wrap;margin:0}
  .xl-sum{display:flex;flex-wrap:wrap;gap:6px}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function sheet(title, id) {
    const old = document.getElementById(id); if (old) old.remove();
    const s = document.createElement("div"); s.className = "xl-sheet"; s.id = id;
    s.innerHTML = `<section class="xl-box" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="xl-hd"><h2>${esc(title)}</h2><button type="button" class="xl-x" aria-label="Close">✕</button></header><div class="xl-bd"></div></section>`;
    const close = () => { s.remove(); document.documentElement.style.overflow = ""; document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    s.querySelector(".xl-x").addEventListener("click", close);
    s.addEventListener("click", e => { if (e.target === s) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(s); document.documentElement.style.overflow = "hidden";
    setTimeout(() => s.querySelector(".xl-x").focus(), 20);
    return { el: s, body: s.querySelector(".xl-bd"), close };
  }

  /* ------------------------------------------------------------------ Team */
  const ROLES = [["owner", "Owner — everything"], ["staff", "Staff — residents, notes, meds, visits, calendar"], ["manager", "Manager — view only"], ["pending", "No access yet"]];
  async function openTeam() {
    const { body } = sheet("👥 Team", "xlTeam");
    body.innerHTML = `<div class="xl-card"><h3>Add someone</h3>
      <p>Open <b>supabase.com</b> → your project → <b>Authentication</b> → <b>Users</b> → <b>Add user</b>, then either:</p>
      <ol><li><b>Send invitation</b> — they get an email to set their own password (needs email set up, see SETUP.md step 4), or</li>
      <li><b>Create new user</b> — type their email and a temporary password, tick <b>Auto Confirm User</b>, and give them the password. They can change it with <b>🔑 Password</b> after signing in.</li></ol>
      <p>After they sign in once, they show up below as <span class="xl-badge pending">No access yet</span>. Pick their role and tap <b>Save</b>. Sign-ups are turned off, so nobody can join without you adding them. To remove someone, set them to <b>No access yet</b> (or delete the user in Supabase).</p></div>
      <p class="xl-msg" id="xlTeamMsg">Loading…</p><div id="xlTeamList" style="display:flex;flex-direction:column;gap:10px"></div>`;
    const msg = (t, bad) => { const m = body.querySelector("#xlTeamMsg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
    const { data, error } = await sb.from("profiles").select("id,email,name,role,created_at").order("created_at");
    if (error) return msg("Couldn't load the team — check your connection and try again.", true);
    msg(`${data.length} ${data.length === 1 ? "person" : "people"}`);
    const list = body.querySelector("#xlTeamList");
    for (const p of data) {
      const row = document.createElement("div"); row.className = "xl-row"; row.dataset.id = p.id;
      const me = p.id === X.user.id;
      row.innerHTML = `<div class="em">${esc(p.email || "(no email)")}${me ? ' <span class="xl-badge">you</span>' : ""}<small>${p.role === "pending" ? '<span class="xl-badge pending">No access yet</span>' : ""}</small></div>
        <input class="xl-in" data-k="name" placeholder="Display name" aria-label="Display name for ${esc(p.email)}">
        <select class="xl-sel" data-k="role" aria-label="Role for ${esc(p.email)}">${ROLES.map(([v, l]) => `<option value="${v}">${esc(l.split(" — ")[0])}</option>`).join("")}</select>
        <button type="button" class="xl-go">Save</button>`;
      row.querySelector('[data-k="name"]').value = p.name || "";
      const sel = row.querySelector('[data-k="role"]'); sel.value = p.role || "pending"; sel.title = (ROLES.find(r => r[0] === sel.value) || [])[1] || "";
      sel.addEventListener("change", () => { sel.title = (ROLES.find(r => r[0] === sel.value) || [])[1] || ""; });
      row.querySelector(".xl-go").addEventListener("click", async e => {
        const name = row.querySelector('[data-k="name"]').value.trim(), role = sel.value;
        if (me && role !== "owner" && !confirm("You are about to remove your own owner access. You will not be able to undo this yourself. Continue?")) { sel.value = "owner"; return; }
        e.target.disabled = true; msg("Saving…");
        const { data: up, error: er } = await sb.from("profiles").update({ name, role }).eq("id", p.id).select("id");
        e.target.disabled = false;
        if (er || !up || !up.length) return msg("Not saved — only the owner can change roles.", true);
        msg(`✓ Saved ${p.email} as ${role}`);
        row.querySelector(".em small").innerHTML = role === "pending" ? '<span class="xl-badge pending">No access yet</span>' : "";
        if (me) setTimeout(() => location.reload(), 600);
      });
      list.appendChild(row);
    }
    const roleHelp = document.createElement("div"); roleHelp.className = "xl-card";
    roleHelp.innerHTML = `<h3>What each role can do</h3><p><b>Owner</b> — everything, including SSI, grocery, behaviourist, e-billing, Team and Import.</p><p><b>Staff</b> — sees residents, homes, forms, schedule, calendar and visits; writes daily notes, meds (eMAR), in &amp; out, incidents, visits and calendar.</p><p><b>Manager</b> — sees everything except people's private logins; cannot change anything.</p>`;
    body.appendChild(roleHelp);
  }

  /* ------------------------------------------------------------------ Import */
  const EXT = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
    csv: "text/csv", json: "application/json", txt: "text/plain", md: "text/markdown", css: "text/css", js: "text/javascript", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
  function openImport() {
    const { body } = sheet("⬆ Import data", "xlImport");
    body.innerHTML = `<div class="xl-card"><h3>Bring in your data from claude.ai</h3>
      <p>1. Pick the export file <b>xlnc-care-data.json</b>.</p><p>2. Pick the attachment files (the <b>files</b> folder — select all files inside it, or pick the folder).</p>
      <p>3. Tap <b>Start import</b>. Safe to run again: records are overwritten with the same data and files already uploaded are skipped.</p></div>
      <div class="xl-card xl-file"><label><b>Export file (.json)</b><br><input type="file" id="xlImpJson" accept=".json,application/json"></label><div class="xl-sum" id="xlImpSum"></div></div>
      <div class="xl-card xl-file"><b>Attachments</b>
        <label>Pick files: <input type="file" id="xlImpFiles" multiple></label>
        <label>…or pick the folder: <input type="file" id="xlImpDir" webkitdirectory directory multiple></label>
        <span id="xlImpFsum"></span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="xl-go" id="xlImpGo" disabled>Start import</button><button type="button" class="xl-go ghost" id="xlImpReload" hidden>↻ Reload the app</button></div>
      <div class="xl-bar" aria-hidden="true"><i id="xlImpBar"></i></div>
      <p class="xl-msg" id="xlImpMsg" role="status"></p><pre class="xl-log" id="xlImpLog" hidden></pre>`;
    const $ = id => body.querySelector("#" + id);
    let parsed = null, files = [];
    const msg = (t, bad) => { $("xlImpMsg").textContent = t; $("xlImpMsg").classList.toggle("bad", !!bad); };
    const log = t => { const l = $("xlImpLog"); l.hidden = false; l.textContent += t + "\n"; l.scrollTop = l.scrollHeight; };
    const bar = f => { $("xlImpBar").style.width = Math.round(f * 100) + "%"; };
    const refresh = () => { $("xlImpGo").disabled = !parsed && !files.length; };
    async function readJson(file) {
      try {
        const d = JSON.parse(await file.text());
        if (!d || typeof d !== "object" || Array.isArray(d)) throw 0;
        parsed = d;
        const sum = $("xlImpSum"); sum.innerHTML = "";
        for (const [k, v] of Object.entries(d)) { if (!v || typeof v !== "object") continue; const n = k === "_private_ebill_owner" ? 1 : Object.keys(v).length; const b = document.createElement("span"); b.className = "xl-badge"; b.textContent = `${k === "_private_ebill_owner" ? "your private e-billing logins" : k}: ${n}`; sum.appendChild(b); }
        msg(`✓ ${file.name} ready`);
      } catch (e) { parsed = null; msg("That file isn't a XLNC Care export (.json).", true); }
      refresh();
    }
    $("xlImpJson").addEventListener("change", e => { const f = e.target.files[0]; if (f) readJson(f); });
    const pickFiles = list => {
      const all = [...list], keep = [];
      for (const f of all) {
        const m = f.name.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9]+)$/);
        if (f.name === "xlnc-care-data.json" && !parsed) { readJson(f); continue; }
        if (m && /^[0-9a-f]{32}$/i.test(m[1]) && EXT[m[2].toLowerCase()]) keep.push(f);
      }
      files = keep;
      $("xlImpFsum").textContent = `${keep.length} attachment${keep.length === 1 ? "" : "s"} selected` + (all.length - keep.length > 0 ? ` (${all.length - keep.length} other files ignored)` : "");
      refresh();
    };
    $("xlImpFiles").addEventListener("change", e => pickFiles(e.target.files));
    $("xlImpDir").addEventListener("change", e => pickFiles(e.target.files));
    $("xlImpReload").addEventListener("click", () => location.reload());
    $("xlImpGo").addEventListener("click", async () => {
      $("xlImpGo").disabled = true; $("xlImpLog").textContent = ""; bar(0);
      const rows = [];
      if (parsed) for (const [k, v] of Object.entries(parsed)) {
        if (!v || typeof v !== "object" || Array.isArray(v)) continue;
        if (k === "_private_ebill_owner") { rows.push({ coll: "data/users/" + X.user.id, id: "ebill", data: v }); continue; }
        if (k.startsWith("_") || !/^[A-Za-z0-9_\-.~:@+]+$/.test(k)) { log(`skipped "${k}"`); continue; }
        for (const [id, data] of Object.entries(v)) { if (data && typeof data === "object" && !Array.isArray(data)) rows.push({ coll: k, id, data }); else log(`skipped ${k}/${id} (not an object)`); }
      }
      const total = rows.length + files.length; let done = 0, fail = 0, up = 0, skip = 0;
      const step = () => { done++; bar(total ? done / total : 1); };
      try {
        for (let i = 0; i < rows.length; i += 50) {
          const chunk = rows.slice(i, i + 50);
          msg(`Saving records ${i + 1}–${i + chunk.length} of ${rows.length}…`);
          const { error } = await sb.from("docs").upsert(chunk, { onConflict: "coll,id" });
          if (error) { fail += chunk.length; log(`records ${i + 1}–${i + chunk.length}: ${error.message}`); }
          chunk.forEach(step);
        }
        if (rows.length) log(`${rows.length - fail} of ${rows.length} records saved`);
        let have = new Set();
        if (files.length) {
          msg("Checking which files are already uploaded…");
          for (let off = 0; ; off += 1000) {
            const { data, error } = await sb.storage.from("files").list("", { limit: 1000, offset: off });
            if (error || !data) break; data.forEach(o => have.add(o.name)); if (data.length < 1000) break;
          }
        }
        for (const [n, f] of files.entries()) {
          const [, id, ext] = f.name.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9]+)$/);
          msg(`Uploading file ${n + 1} of ${files.length}: ${f.name}`);
          if (have.has(id)) { skip++; step(); continue; }
          const { error } = await sb.storage.from("files").upload(id, f, { contentType: EXT[ext.toLowerCase()], upsert: true, cacheControl: "3600" });
          if (error) { fail++; log(`${f.name}: ${error.message}`); } else up++;
          step();
        }
        if (files.length) log(`${up} files uploaded, ${skip} already there`);
        bar(1);
        msg(fail ? `Finished with ${fail} problem${fail === 1 ? "" : "s"} — see the list below. You can run the import again.` : `✓ All done — ${rows.length} records and ${up + skip} files are in XLNC Care.`, !!fail);
        if (X.resyncAll) X.resyncAll();
        $("xlImpReload").hidden = false;
      } catch (e) { msg("Import stopped: " + (e && e.message || e) + ". You can run it again.", true); }
      $("xlImpGo").disabled = false;
    });
  }


  /* ------------------------------------------------------------------ change my password */
  function openPassword() {
    const { body } = sheet("🔑 Change my password", "xlPw");
    body.innerHTML = `<div class="xl-card"><label><b>New password</b> (at least 8 characters)<br><input class="xl-in" type="password" id="xlPw1" autocomplete="new-password"></label>
      <label style="display:block;margin-top:10px"><b>Type it again</b><br><input class="xl-in" type="password" id="xlPw2" autocomplete="new-password"></label>
      <p class="xl-msg" id="xlPwMsg" role="status"></p><button type="button" class="xl-go" id="xlPwGo">Save new password</button></div>`;
    const $ = id => body.querySelector("#" + id), msg = (t, bad) => { $("xlPwMsg").textContent = t; $("xlPwMsg").classList.toggle("bad", !!bad); };
    $("xlPwGo").addEventListener("click", async () => {
      const a = $("xlPw1").value, b = $("xlPw2").value;
      if (a.length < 8) return msg("Use at least 8 characters.", true);
      if (a !== b) return msg("The two passwords don't match.", true);
      $("xlPwGo").disabled = true; msg("Saving…");
      const { error } = await sb.auth.updateUser({ password: a });
      $("xlPwGo").disabled = false;
      if (error) return msg(/different/i.test(error.message) ? "Please choose a password you haven't used here before." : "Not saved: " + error.message, true);
      msg("✓ Password changed. Use it next time you sign in."); $("xlPw1").value = $("xlPw2").value = "";
    });
  }

  /* ------------------------------------------------------------------ header controls */
  X.openTeam = openTeam; X.openImport = openImport; X.openPassword = openPassword;
  X.boot.then(prof => {
    const host = document.querySelector(".fhero .fh-r") || document.querySelector(".fhero");
    if (!host || !prof) return;
    const box = document.createElement("span"); box.className = "xl-hc";
    const nm = (prof.name || "").trim() || (X.user.email || "").split("@")[0];
    const roleL = { owner: "Owner", staff: "Staff", manager: "Manager" }[X.role] || "";
    box.innerHTML = `<span class="pill xl-me" title="${esc(X.user.email)}">👤 ${esc(nm)}${roleL ? ` · ${roleL}` : ""}</span>`;
    const mk = (t, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "pill " + cls; b.textContent = t; b.addEventListener("click", fn); box.appendChild(b); return b; };
    if (X.role === "owner") { mk("👥 Team", "xl-team", openTeam); mk("⬆ Import data", "xl-imp", openImport); }
    mk("🔑 Password", "xl-pw", openPassword);
    mk("Sign out", "xl-out", () => X.signOut());
    host.appendChild(box);
  });
})();
