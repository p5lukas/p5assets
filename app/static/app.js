"use strict";
/* p5assets frontend – vanilla JS, no build step */

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

async function api(path, opts = {}) {
  const o = { ...opts };
  if (o.json !== undefined) { o.method = o.method || "POST"; o.headers = { "Content-Type": "application/json" }; o.body = JSON.stringify(o.json); delete o.json; }
  const r = await fetch("/api" + path, o);
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (!r.ok) throw new Error((data && data.detail) || `Fehler ${r.status}`);
  return data;
}

function toast(msg, kind = "") {
  const t = h("div", { class: "toast " + kind }, msg);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "bad" ? 6000 : 3200);
}
const esc = s => String(s ?? "");
const busy = async (btn, fn) => {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
};

/* ------------------------------------------------------------ state --- */
const S = { st: null, items: [], total: 0, filter: "missing", q: "", lib: "", type: "", loading: false, poll: null, wiz: 0 };

async function loadState() {
  S.st = await api("/state");
}

async function loadItems(append = false) {
  S.loading = true;
  const p = new URLSearchParams({ q: S.q, filter: S.filter, library: S.lib, type: S.type, offset: append ? S.items.length : 0, limit: 120 });
  const r = await api("/items?" + p);
  S.items = append ? S.items.concat(r.items) : r.items;
  S.total = r.total;
  S.loading = false;
}

function startPolling() {
  clearInterval(S.poll);
  S.poll = setInterval(async () => {
    try {
      const sum = await api("/status");
      const was = S.st.summary.running;
      S.st.summary = sum;
      if (S.view === "dash") { updateHero(); if (was && !sum.running) { await loadItems(); renderGrid(); } }
      if (!sum.running && !was) clearInterval(S.poll);
    } catch { /* ignore */ }
  }, 1500);
}

/* ------------------------------------------------------------ routing --- */
async function boot() {
  try { await loadState(); } catch (e) { app.append(h("div", { class: "empty" }, "Backend nicht erreichbar: " + e.message)); return; }
  if (!S.st.onboarded) return wizard();
  dashboard();
}

/* ========================================================== dashboard === */
function dashboard() {
  S.view = "dash";
  app.replaceChildren(
    h("header", { class: "top" }, h("div", { class: "in" },
      h("div", { class: "logo" }, h("i", {}, "p5"), "assets"),
      h("div", { class: "search" }, h("input", { type: "search", placeholder: "Titel suchen …", id: "q", value: S.q, oninput: debounce(async e => { S.q = e.target.value; await loadItems(); renderGrid(); }, 200) })),
      h("div", { class: "spacer" }),
      h("button", { class: "btn", onclick: () => pickFiles() }, "⬆ Hochladen"),
      h("button", { class: "btn", id: "scanbtn", onclick: doScan }, "↻ Scannen"),
      h("button", { class: "btn ghost", title: "Einstellungen", onclick: () => wizard(true) }, "⚙"),
    )),
    h("main", {}, h("div", { id: "hero" }), h("div", { id: "chips" }), h("div", { id: "grid" })),
  );
  updateHero();
  loadItems().then(renderGrid);
  if (S.st.summary.running) startPolling();
  else if (!S.st.summary.scanned_at) doScan();
}

async function doScan() {
  S.st.summary = await api("/scan", { method: "POST" });
  updateHero(); startPolling();
}

function updateHero() {
  const hero = $("#hero"); if (!hero) return;
  const s = S.st.summary;
  const pct = s.slots ? Math.round(((s.slots - s.missing) / s.slots) * 100) : 0;
  const sb = $("#scanbtn"); if (sb) sb.disabled = s.running;
  hero.replaceChildren(h("div", { class: "hero" },
    h("div", { class: "ring", style: `--p:${pct}` }, h("b", {}, pct + "%")),
    h("div", {},
      s.running ? h("div", { class: "row", style: "margin-bottom:10px" }, h("span", { class: "spin" }), s.progress || "Scanne …") : null,
      s.error ? h("div", { class: "status bad" }, "⚠ " + s.error) : null,
      h("div", { class: "stats" },
        stat(s.items, "Titel"), stat(s.slots - s.missing, "Assets vorhanden", "ok"), stat(s.missing, "Fehlen", s.missing ? "bad" : "ok"),
        stat(s.complete_items, "Vollständig")),
    ),
    h("div", { class: "hint", style: "text-align:right" }, s.scanned_at ? "Zuletzt gescannt\n" + new Date(s.scanned_at * 1000).toLocaleString("de-DE") : ""),
  ));
  renderChips();
}
const stat = (n, label, cls = "") => h("div", { class: "stat " + cls }, h("b", {}, n ?? 0), h("span", {}, label));

function renderChips() {
  const el = $("#chips"); if (!el) return;
  const s = S.st.summary;
  const chip = (label, on, fn, small) => h("button", { class: "chip" + (on ? " on" : ""), onclick: fn }, label, small != null ? h("small", {}, small) : null);
  const setF = f => async () => { S.filter = f; renderChips(); await loadItems(); renderGrid(); };
  const libs = S.st.config.libraries.filter(l => l.enabled);
  el.className = "chips";
  el.replaceChildren(...[
    chip("Fehlende", S.filter === "missing", setF("missing"), s.items - s.complete_items),
    chip("Alle", S.filter === "all", setF("all"), s.items),
    chip("Vollständig", S.filter === "complete", setF("complete"), s.complete_items),
    h("span", { style: "width:14px" }),
    libs.length > 1 ? h("select", { style: "width:auto", onchange: async e => { S.lib = e.target.value; await loadItems(); renderGrid(); } },
      h("option", { value: "" }, "Alle Bibliotheken"), libs.map(l => h("option", { value: l.key, selected: S.lib === l.key }, l.title))) : null,
  ].filter(Boolean));
}

function renderGrid() {
  const g = $("#grid"); if (!g) return;
  if (!S.items.length) {
    g.replaceChildren(h("div", { class: "empty" },
      S.st.summary.running ? h("h2", {}, "Scanne Plex …") :
      S.filter === "missing" && !S.q && S.st.summary.items ? [h("div", { class: "big" }, "🎉"), h("h2", {}, "Alles vollständig!"), "Für kein Poster oder keine Staffel fehlt etwas."] :
      [h("h2", {}, "Nichts gefunden"), "Passe Filter oder Suche an – oder starte einen neuen Scan."]));
    return;
  }
  g.replaceChildren(h("div", { class: "grid" }, S.items.map(card)));
  if (S.items.length < S.total) g.append(h("button", { class: "btn more", onclick: async () => { await loadItems(true); renderGrid(); } }, `Mehr laden (${S.total - S.items.length})`));
}

function posterBox(item, slot, size = "") {
  const sl = item.slots[slot];
  const wrap = h("div", { class: "poster" + (sl.exists ? "" : " miss") });
  const src = sl.exists ? `/api/asset/${item.id}/${slot}?v=${sl.mtime}` : `/api/season-thumb/${item.id}/${slot}`;
  const img = h("img", { loading: "lazy", alt: "", src, onload: e => e.target.classList.add("loaded"), onerror: e => { e.target.remove(); wrap.append(h("div", { class: "ph" }, sl.exists ? "Bild defekt" : "Kein Plex-Poster")); } });
  wrap.append(img);
  return wrap;
}

function card(item) {
  const el = h("div", { class: "card", onclick: () => openItem(item.id) });
  const box = posterBox(item, "poster");
  const bad = item.missing;
  box.append(h("span", { class: "badge " + (bad ? "bad" : "ok") }, bad ? `${bad} fehlt` : "✓"));
  el.append(box, h("div", { class: "t", title: item.title }, item.title),
    h("div", { class: "s" }, [item.year, item.type === "show" ? `${item.season_count} Staffeln` : "Film"].filter(Boolean).join(" · ")));
  makeDropTarget(el, files => importFiles(files, item.id));
  return el;
}

/* =========================================================== item view === */
async function openItem(id) {
  const item = await api("/items/" + id);
  const scrim = h("div", { class: "scrim", onclick: e => { if (e.target === scrim) close(); } });
  const drawer = h("div", { class: "drawer" });
  scrim.append(drawer);
  document.body.append(scrim);
  const onKey = e => { if (e.key === "Escape" && !$(".modalwrap")) close(); };
  document.addEventListener("keydown", onKey);
  function close() { scrim.remove(); document.removeEventListener("keydown", onKey); loadItems().then(() => { renderGrid(); }); api("/status").then(s => { S.st.summary = s; updateHero(); }); }

  function draw(it) {
    const slots = [{ slot: "poster", label: it.type === "movie" ? "Poster" : "Serienposter" }, ...(it.seasons || []).map(s => ({ slot: s.slot, label: s.label }))];
    drawer.replaceChildren(
      h("header", {},
        h("button", { class: "btn ghost", onclick: close }, "✕"),
        h("div", { class: "grow" }, h("h2", {}, it.title, it.year ? ` (${it.year})` : ""),
          h("div", { class: "hint", style: "margin:0" }, "Kometa-Ordner: ", h("code", {}, it.folder || "—"))),
      ),
      h("div", { class: "body" },
        !it.folder ? h("div", { class: "status bad" }, "Für diesen Titel konnte kein Medienpfad aus Plex gelesen werden – Upload nicht möglich.") : null,
        h("p", { class: "hint" }, "Bild auf ein Poster ziehen oder anklicken, um es zu ersetzen. Mehrere Dateien oder eine ZIP auf dieses Fenster ziehen: p5assets ordnet sie automatisch zu."),
        h("div", { class: "slots" }, slots.map(s => slotView(it, s)))),
    );
  }

  function slotView(it, s) {
    const sl = it.slots[s.slot];
    const box = posterBox(it, s.slot);
    box.append(h("span", { class: "badge " + (sl.exists ? "ok" : "bad") }, sl.exists ? "vorhanden" : "fehlt"),
      h("div", { class: "hover" }, h("div", {}, "⬆ Bild ablegen", h("br"), "oder klicken")));
    const el = h("div", { class: "slot" }, box,
      h("div", { class: "lab" }, s.label),
      h("div", { class: "acts" },
        h("button", { class: "btn sm", onclick: () => searchOnline(it, s, draw) }, "🔎 Online"),
        sl.exists ? h("button", { class: "btn sm danger", onclick: async () => { if (confirm(`${s.label} wirklich löschen?`)) { const r = await api(`/items/${it.id}/${s.slot}`, { method: "DELETE" }); draw(r.item); } } }, "Löschen") : null));
    box.onclick = () => pickFiles(files => uploadSlot(it, s.slot, files, draw), false);
    makeDropTarget(el, files => uploadSlot(it, s.slot, files, draw), true);
    return el;
  }
  makeDropTarget(drawer, files => importFiles(files, id, draw), true);
  draw(item);
}

async function uploadSlot(it, slot, files, draw) {
  const imgs = files.filter(f => /\.(jpe?g|png|webp|gif|bmp|tiff?|avif)$/i.test(f.path));
  if (imgs.length !== 1 || files.length !== 1) return importFiles(files, it.id, draw);
  const fd = new FormData(); fd.append("file", imgs[0].file, imgs[0].file.name);
  try {
    const r = await api(`/items/${it.id}/${slot}/upload`, { method: "POST", body: fd });
    toast("Ersetzt ✓", "ok"); if (r.warning) toast("Plex: " + r.warning, "bad");
    draw(r.item);
  } catch (e) { toast(e.message, "bad"); }
}

function modal(title, body, footer) {
  const wrap = h("div", { class: "modalwrap", onclick: e => { if (e.target === wrap) close(); } });
  const close = () => wrap.remove();
  wrap.append(h("div", { class: "modal" }, h("header", {}, h("h2", { class: "grow" }, title), h("button", { class: "btn ghost sm", onclick: close }, "✕")),
    h("div", { class: "body" }, body), footer ? h("footer", {}, footer) : null));
  document.body.append(wrap);
  return { close, el: wrap };
}

async function searchOnline(it, s, draw) {
  const body = h("div", {}, h("div", { class: "empty" }, h("span", { class: "spin" }), " Suche bei TMDb, TVDB und fanart.tv …"));
  const m = modal(`${it.title} – ${s.label}`, body);
  try {
    const r = await api(`/items/${it.id}/${s.slot}/search`);
    const errs = Object.entries(r.errors || {});
    body.replaceChildren(
      ...errs.map(([k, v]) => h("div", { class: "status bad" }, `⚠ ${k}: ${v}`)),
      r.images.length ? h("div", { class: "picks" }, r.images.map(img => {
        const p = h("div", { class: "pick", title: "Übernehmen", onclick: async () => {
          p.classList.add("busy");
          try { const res = await api(`/items/${it.id}/${s.slot}/url`, { json: { url: img.url } }); toast("Übernommen ✓", "ok"); m.close(); draw(res.item); }
          catch (e) { p.classList.remove("busy"); toast(e.message, "bad"); }
        } }, h("img", { loading: "lazy", src: "/api/proxy?url=" + encodeURIComponent(img.preview || img.url) }),
          h("span", {}, img.source, img.lang ? h("b", {}, img.lang) : ""));
        return p;
      })) : h("div", { class: "empty" }, "Keine Poster gefunden."));
  } catch (e) { body.replaceChildren(h("div", { class: "status bad" }, e.message)); }
}

/* ================================================== files / drag & drop === */
let dragDepth = 0;
function hasFiles(e) { return e.dataTransfer && [...e.dataTransfer.types].includes("Files"); }
window.addEventListener("dragenter", e => { if (hasFiles(e)) { dragDepth++; $("#dropveil").classList.toggle("on", S.view === "dash"); } });
window.addEventListener("dragleave", e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $("#dropveil").classList.remove("on"); } });
window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", async e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $("#dropveil").classList.remove("on");
  if (e.defaultPrevented && e._handled) return;
  if (S.view === "dash") importFiles(await collectFiles(e.dataTransfer));
});

function makeDropTarget(el, cb, inner = false) {
  let depth = 0;
  el.addEventListener("dragenter", e => { if (hasFiles(e)) { depth++; if (inner) el.classList.add("dropping"); else el.classList.add("dropping"); } });
  el.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; el.classList.remove("dropping"); } });
  el.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  el.addEventListener("drop", async e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation(); depth = 0; el.classList.remove("dropping");
    dragDepth = 0; $("#dropveil").classList.remove("on");
    cb(await collectFiles(e.dataTransfer));
  });
}

async function collectFiles(dt) {
  const out = [];
  const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...dt.files].map(f => ({ file: f, path: f.name }));
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix + entry.name + "/");
      } while (batch.length);
    }
  }
  for (const e of entries) await walk(e, "");
  return out;
}

function pickFiles(cb, multiple = true) {
  if (!cb) {
    const m = modal("Hochladen", h("div", { class: "row wrap" },
      h("button", { class: "btn primary", onclick: () => { m.close(); pickFiles(f => importFiles(f), true); } }, "Bilder / ZIP wählen"),
      h("button", { class: "btn", onclick: () => { m.close(); pickFiles(f => importFiles(f), true, true); } }, "Ordner wählen"),
      h("p", { class: "hint", style: "width:100%" }, "Oder ziehe Dateien, Ordner und ZIPs einfach irgendwo ins Fenster.")));
    return;
  }
  const inp = $("#picker");
  inp.value = ""; inp.multiple = multiple;
  inp.webkitdirectory = arguments[2] === true;
  inp.accept = inp.webkitdirectory ? "" : "image/*,.zip";
  inp.onchange = () => cb([...inp.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
  inp.click();
}

/* ------------------------------------------------------------ import --- */
async function importFiles(files, itemId, onDone) {
  if (!files || !files.length) return;
  const fd = new FormData();
  if (itemId) fd.append("item_id", itemId);
  files.forEach(f => fd.append("files", f.file, f.path));
  const bar = h("i", { style: "width:0%" });
  const m = modal("Lade hoch …", h("div", {}, h("p", {}, `${files.length} Datei(en) werden übertragen`), h("div", { class: "progress" }, bar)));
  let res;
  try {
    res = await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", "/api/import");
      x.upload.onprogress = e => { if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 100) + "%"; };
      x.onload = () => { try { const d = JSON.parse(x.responseText); x.status < 300 ? resolve(d) : reject(new Error(d.detail || x.status)); } catch { reject(new Error("Fehler " + x.status)); } };
      x.onerror = () => reject(new Error("Netzwerkfehler"));
      x.send(fd);
    });
  } catch (e) { m.close(); toast(e.message, "bad"); return; }
  m.close();
  res.errors.forEach(e => toast(e, "bad"));
  if (!res.entries.length) { toast("Keine Bilder gefunden", "bad"); return; }
  const allSet = res.entries.every(e => e.kind === "ignore" || e.item_id);
  if (itemId && allSet) return applyImport(res.session, res.entries, onDone);
  reviewImport(res, onDone);
}

async function applyImport(sid, entries, onDone) {
  const assignments = entries.filter(e => e.item_id && e.slot).map(e => ({ file: e.id, item_id: e.item_id, slot: e.slot }));
  if (!assignments.length) { api("/import/" + sid, { method: "DELETE" }); return; }
  try {
    const r = await api(`/import/${sid}/apply`, { json: { assignments } });
    if (r.done.length) toast(`${r.done.length} Asset(s) gespeichert ✓`, "ok");
    r.failed.forEach(f => toast(f.error, "bad"));
    r.done.filter(d => d.warning).forEach(d => toast("Plex: " + d.warning, "bad"));
    S.st.summary = r.summary; updateHero();
    if (onDone) { const id = assignments[0].item_id; onDone(await api("/items/" + id)); }
    await loadItems(); renderGrid();
  } catch (e) { toast(e.message, "bad"); }
}

function reviewImport(res, onDone) {
  const rows = res.entries.map(e => ({ ...e, use: !!e.item_id && e.kind !== "ignore" }));
  const list = h("div");
  const slotLabel = k => k === "poster" ? "Poster" : k === "season-0" ? "Specials" : "Staffel " + k.split("-")[1];
  const count = () => rows.filter(r => r.use && r.item_id).length;
  const apply = h("button", { class: "btn primary" });
  const refreshBtn = () => { const n = count(); apply.textContent = `${n} Asset${n === 1 ? "" : "s"} übernehmen`; apply.disabled = !n; };

  function draw() {
    list.replaceChildren(...rows.map(r => {
      const title = h("div", { class: "c2" });
      const sel = h("select", { onchange: e => { r.slot = e.target.value; } });
      const fillSlots = opts => { sel.replaceChildren(...opts.map(o => h("option", { value: o.slot, selected: o.slot === r.slot }, o.label))); };
      const input = h("input", { type: "text", placeholder: "Titel suchen …", value: r.item_id ? `${r.item_title}${r.item_year ? " (" + r.item_year + ")" : ""}` : "" });
      const list2 = h("div", { class: "list", hidden: true });
      if (r.item_id) fillSlots([{ slot: r.slot, label: slotLabel(r.slot) }]);
      // lazily load all slots for the assigned item so the user can change the target
      if (r.item_id) api("/slots?q=" + encodeURIComponent(r.item_title || "")).then(os => { const o = os.find(x => x.id === r.item_id); if (o) fillSlots(o.slots); });
      input.oninput = debounce(async () => {
        const opts = await api("/slots?q=" + encodeURIComponent(input.value));
        list2.hidden = !opts.length;
        list2.replaceChildren(...opts.map(o => h("div", { onclick: () => {
          r.item_id = o.id; r.item_title = o.title; r.item_year = o.year; r.use = true;
          const want = r.kind === "poster" ? "poster" : r.season != null ? "season-" + r.season : "poster";
          r.slot = o.slots.some(s => s.slot === want) ? want : "poster";
          input.value = `${o.title}${o.year ? " (" + o.year + ")" : ""}`; list2.hidden = true; fillSlots(o.slots); chk.checked = true; row.classList.remove("skip"); refreshBtn();
        } }, `${o.title}${o.year ? " (" + o.year + ")" : ""} `, h("span", { class: "pill" }, o.type === "movie" ? "Film" : "Serie"))));
      }, 200);
      input.onblur = () => setTimeout(() => (list2.hidden = true), 150);
      const chk = h("input", { type: "checkbox", checked: r.use, title: "Übernehmen", onchange: e => { r.use = e.target.checked; row.classList.toggle("skip", !r.use); refreshBtn(); } });
      const row = h("div", { class: "imp" + (r.use ? "" : " skip") },
        h("img", { src: `/api/import/${res.session}/${r.id}`, loading: "lazy" }),
        h("div", { class: "fn" }, r.name, r.kind === "ignore" ? h("div", {}, h("span", { class: "pill bad" }, "Hintergrund/Banner – ignoriert")) : null),
        h("div", { class: "ac c3" }, input, list2),
        h("div", { class: "c4" }, sel), chk);
      return row;
    }));
    refreshBtn();
  }
  draw();
  const m = modal(`${rows.length} Bilder erkannt`, h("div", {},
    h("p", { class: "hint" }, "Zuordnung automatisch anhand von Datei- und Ordnernamen. Prüfe oder ändere sie – die Dateien werden Kometa-konform benannt (poster, Season01 …)."), list),
    [apply, h("button", { class: "btn", onclick: () => { api("/import/" + res.session, { method: "DELETE" }); m.close(); } }, "Abbrechen"),
      h("span", { class: "spacer" }),
      h("span", { class: "hint" }, `${rows.filter(r => r.item_id).length} von ${rows.length} zugeordnet`)]);
  apply.onclick = async () => { m.close(); await applyImport(res.session, rows.filter(r => r.use && r.item_id), onDone); };
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ======================================================= wizard / setup === */
const STEPS = ["welcome", "plex", "libs", "assets", "apis", "done"];

async function wizard(settings = false) {
  S.view = "wiz";
  S.wizSettings = settings;
  S.wiz = settings ? 1 : (S.wiz || 0);
  await loadState();
  drawWiz();
}

function drawWiz() {
  const cfg = S.st.config;
  const step = STEPS[S.wiz];
  const nav = (next, label = "Weiter", disabled = false) => h("div", { class: "row", style: "margin-top:26px" },
    S.wiz > 0 && !(S.wizSettings && S.wiz <= 1) ? h("button", { class: "btn", onclick: () => { S.wiz--; drawWiz(); } }, "Zurück") : null,
    S.wizSettings ? h("button", { class: "btn ghost", onclick: () => dashboardAfterSettings() }, "Schließen") : null,
    h("span", { class: "spacer" }),
    h("button", { class: "btn primary", disabled, onclick: next || (() => { S.wiz++; drawWiz(); }) }, label));
  const view = { welcome: wWelcome, plex: wPlex, libs: wLibs, assets: wAssets, apis: wApis, done: wDone }[step];
  app.replaceChildren(h("div", { class: "wiz" },
    h("div", { class: "logo" }, h("i", {}, "p5"), "assets"),
    h("div", { class: "steps" }, STEPS.map((s, i) => h("i", { class: (i <= S.wiz ? "on " : "") + (S.wizSettings ? "click" : ""), onclick: S.wizSettings && i > 0 && i < STEPS.length - 1 ? () => { S.wiz = i; drawWiz(); } : null }))),
    h("div", { class: "wcard" }, view(nav, cfg))));
}

async function dashboardAfterSettings() {
  await loadState(); dashboard();
}

const wWelcome = nav => h("div", {},
  h("div", { class: "big" }, "🖼️"),
  h("h1", {}, "Willkommen bei p5assets"),
  h("p", { class: "lead" }, "Behalte den Überblick über fehlende Poster und Staffelcover deiner Plex-Bibliothek – und ersetze sie in Sekunden per Drag & Drop. Alle Dateien werden automatisch Kometa-konform benannt."),
  h("div", { class: "opt", style: "cursor:default" }, "🔗", h("div", {}, "Plex verbinden", h("small", {}, "per Plex-Login oder URL + Token"))),
  h("div", { class: "opt", style: "cursor:default" }, "📁", h("div", {}, "Kometa-Assets-Ordner wählen", h("small", {}, "z. B. /assets"))),
  h("div", { class: "opt", style: "cursor:default" }, "🔑", h("div", {}, "Optional: TMDb, TVDB, fanart.tv", h("small", {}, "zum Herunterladen fehlender Poster"))),
  nav(null, "Los geht's"));

function statusEl() { return h("div", { class: "status" }); }
function setStatus(el, ok, msg) { el.className = "status " + (ok ? "ok" : "bad"); el.textContent = (ok ? "✓ " : "⚠ ") + msg; }

function wPlex(nav, cfg) {
  const connected = !!cfg.plex.token && !!cfg.plex.url;
  const url = h("input", { type: "text", placeholder: "http://192.168.1.10:32400", value: cfg.plex.url });
  const token = h("input", { type: "password", placeholder: "X-Plex-Token", value: cfg.plex.token });
  const st = statusEl(); const serverList = h("div");
  if (connected) { st.className = "status ok"; st.textContent = `✓ Verbunden mit ${cfg.plex.server_name || cfg.plex.url}`; }
  const connect = async (btn, body) => {
    try {
      const r = await busy(btn, () => api("/plex/connect", { json: body }));
      setStatus(st, true, `Verbunden mit ${r.server.name} (${r.libraries.length} Bibliotheken)`);
      url.value = r.url; token.value = "********"; await loadState(); nextBtn.disabled = false; serverList.replaceChildren();
    } catch (e) { setStatus(st, false, e.message); }
  };
  const login = h("button", { class: "btn primary", onclick: async e => {
    const btn = e.currentTarget; const win = window.open("", "_blank");
    try {
      const pin = await api("/plex/pin", { method: "POST" });
      if (win) win.location = pin.auth_url; else toast("Popup blockiert – bitte erlauben", "bad");
      st.className = "status"; st.replaceChildren(h("span", { class: "spin" }), " Warte auf Plex-Login …");
      const t0 = Date.now();
      while (Date.now() - t0 < 5 * 60e3) {
        await new Promise(r => setTimeout(r, 1500));
        const c = await api("/plex/pin/" + pin.id);
        if (c.ready) {
          if (win) win.close();
          if (!c.servers.length) return setStatus(st, false, "Keine Server in diesem Account gefunden");
          st.textContent = ""; st.className = "status";
          serverList.replaceChildren(h("label", { class: "f" }, "Server wählen"), ...c.servers.map(s => h("div", { class: "srv", onclick: ev => connect(ev.currentTarget, { token: s.token, connections: s.connections }) },
            h("b", {}, s.name), h("div", { class: "hint" }, s.connections.map(x => x.uri).join("  ·  ")))));
          return;
        }
      }
      setStatus(st, false, "Zeitüberschreitung beim Login");
    } catch (e) { setStatus(st, false, e.message); }
  } }, "Mit Plex anmelden");
  const nextBtn = h("button", { class: "btn primary", disabled: !connected, onclick: () => { S.wiz++; drawWiz(); } }, "Weiter");
  const n = nav(null); n.lastChild.replaceWith(nextBtn);
  return h("div", {}, h("h1", {}, "Plex verbinden"), h("p", { class: "lead" }, "Melde dich bei Plex an oder gib die Server-Adresse und den Token manuell ein."),
    h("div", { class: "row" }, login), serverList,
    h("label", { class: "f" }, "… oder manuell"),
    h("div", { class: "row wrap" }, h("div", { class: "grow", style: "min-width:220px" }, url), h("div", { class: "grow", style: "min-width:220px" }, token),
      h("button", { class: "btn", onclick: e => connect(e.currentTarget, { url: url.value, token: token.value }) }, "Testen")),
    st, n);
}

function wLibs(nav, cfg) {
  const libs = cfg.libraries;
  const up = h("input", { type: "checkbox", checked: cfg.plex.upload_to_plex, onchange: e => api("/config", { json: { patch: { plex: { upload_to_plex: e.target.checked } } } }) });
  return h("div", {}, h("h1", {}, "Bibliotheken"), h("p", { class: "lead" }, "Welche Plex-Bibliotheken sollen überwacht werden?"),
    libs.length ? libs.map(l => h("label", { class: "opt" }, h("input", { type: "checkbox", checked: l.enabled, onchange: e => api("/plex/libraries", { json: { enabled: { [l.key]: e.target.checked } } }) }),
      h("div", {}, l.title, h("small", {}, l.type === "movie" ? "Filme" : "Serien")))) : h("div", { class: "status bad" }, "Keine Film-/Serienbibliotheken gefunden."),
    h("label", { class: "opt" }, up, h("div", {}, "Neue Poster zusätzlich direkt in Plex setzen", h("small", {}, "Kometa überschreibt sie beim nächsten Lauf ohnehin – nützlich für sofortige Anzeige"))),
    nav());
}

function wAssets(nav, cfg) {
  const a = cfg.assets;
  const path = h("input", { type: "text", value: a.path });
  const st = statusEl(); const fsBox = h("div");
  const check = async () => {
    const r = await api("/path/check", { json: { path: path.value } });
    if (!r.exists) setStatus(st, false, "Ordner existiert nicht (im Container gemountet?)");
    else if (!r.writable) setStatus(st, false, "Ordner ist nicht beschreibbar");
    else setStatus(st, true, `Ordner bereit (${r.entries} Einträge)`);
    return r.exists && r.writable;
  };
  const save = patch => api("/config", { json: { patch: { assets: patch } } });
  const browse = async p => {
    try {
      const r = await api("/fs?path=" + encodeURIComponent(p));
      path.value = r.path;
      fsBox.replaceChildren(h("div", { class: "fs" }, h("div", { onclick: () => browse(r.parent) }, "⬑ .."), r.dirs.map(d => h("div", { onclick: () => browse(r.path.replace(/\/$/, "") + "/" + d) }, "📁 " + d))));
      check();
    } catch (e) { setStatus(st, false, e.message); }
  };
  const mk = (key, title, sub) => h("label", { class: "opt" }, h("input", { type: "checkbox", checked: a[key], onchange: e => save({ [key]: e.target.checked }) }), h("div", {}, title, h("small", {}, sub)));
  const n = nav(async () => { if (await check()) { await save({ path: path.value }); S.wiz++; drawWiz(); } });
  return h("div", {}, h("h1", {}, "Kometa-Assets-Ordner"), h("p", { class: "lead" }, "Pfad innerhalb des Containers, in dem Kometa deine Assets erwartet (dein `asset_directory`)."),
    h("div", { class: "row" }, h("div", { class: "grow" }, path), h("button", { class: "btn", onclick: () => browse(path.value || "/") }, "📂 Durchsuchen")),
    fsBox, st,
    h("label", { class: "f" }, "Struktur"),
    mk("asset_folders", "Ein Ordner pro Titel (asset_folders: true)", "Ordner/poster.jpg, Ordner/Season01.jpg – Kometa-Standard"),
    mk("convert_to_jpg", "PNG/WebP immer nach JPG konvertieren", "Standardmäßig bleiben JPG und PNG unverändert"),
    mk("ignore_specials", "Specials (Season00) nicht überwachen", "Dann gelten fehlende Specials-Poster nicht als fehlend"),
    n);
}

function wApis(nav, cfg) {
  const a = cfg.apis;
  const row = (id, name, url, extra) => {
    const key = h("input", { type: "password", value: a[id], placeholder: "API Key" });
    const pin = extra ? h("input", { type: "password", value: a.tvdb_pin, placeholder: "PIN (nur bei Subscriber-Keys)", style: "margin-top:8px" }) : null;
    const st = statusEl();
    const persist = () => api("/config", { json: { patch: { apis: { [id]: key.value, ...(pin ? { tvdb_pin: pin.value } : {}) } } } });
    key.onchange = persist; if (pin) pin.onchange = persist;
    return h("div", { class: "apirow" }, h("h3", {}, name), h("div", { class: "hint" }, h("a", { href: url, target: "_blank", rel: "noopener" }, "Key anfordern ↗")),
      h("div", { class: "row" }, h("div", { class: "grow" }, key, pin), h("button", { class: "btn", onclick: async e => {
        const btn = e.currentTarget;
        await persist();
        try { await busy(btn, () => api("/test/" + id, { json: { key: key.value, pin: pin ? pin.value : "" } })); setStatus(st, true, "Funktioniert"); }
        catch (err) { setStatus(st, false, err.message); }
      } }, "Testen")), st);
  };
  const lang = h("select", { onchange: e => api("/config", { json: { patch: { apis: { language: e.target.value } } } }) },
    [["de", "Deutsch"], ["en", "English"], ["fr", "Français"], ["es", "Español"], ["it", "Italiano"], ["nl", "Nederlands"]].map(([v, l]) => h("option", { value: v, selected: a.language === v }, l)));
  const interval = h("select", { onchange: e => api("/config", { json: { patch: { scan_interval_minutes: +e.target.value } } }) },
    [[0, "Nur manuell"], [15, "alle 15 Minuten"], [60, "stündlich"], [360, "alle 6 Stunden"], [1440, "täglich"]].map(([v, l]) => h("option", { value: v, selected: cfg.scan_interval_minutes === v }, l)));
  return h("div", {}, h("h1", {}, "Poster-Quellen"), h("p", { class: "lead" }, "Optional: Mit API-Keys kann p5assets fehlende Poster direkt online suchen. Du kannst diesen Schritt überspringen."),
    row("tmdb", "TMDb", "https://www.themoviedb.org/settings/api"),
    row("tvdb", "TheTVDB", "https://thetvdb.com/dashboard/account/apikey", true),
    row("fanart", "fanart.tv", "https://fanart.tv/get-an-api-key/"),
    h("label", { class: "f" }, "Bevorzugte Sprache der Poster"), lang,
    h("label", { class: "f" }, "Automatischer Scan"), interval,
    nav(null, "Weiter"));
}

function wDone(nav) {
  return h("div", { style: "text-align:center" }, h("div", { class: "big" }, "🚀"), h("h1", {}, "Alles bereit!"),
    h("p", { class: "lead" }, "p5assets scannt jetzt deine Bibliothek und zeigt dir, was fehlt."),
    h("button", { class: "btn primary", onclick: async () => { await api("/onboarding/finish", { method: "POST" }); await loadState(); S.filter = "missing"; dashboard(); } }, "Scan starten"),
    h("div", { style: "margin-top:16px" }, h("button", { class: "btn ghost", onclick: () => { S.wiz--; drawWiz(); } }, "Zurück")));
}

boot();
