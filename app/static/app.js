"use strict";
/* p5assets frontend – vanilla JS, no build step */

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const clean = kids => kids.flat(Infinity).filter(k => k != null && k !== false);

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
  for (const kid of clean(kids)) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const fill = (el, ...kids) => { el.replaceChildren(...clean(kids)); return el; };

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
const busy = async (btn, fn) => {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = p => p + Math.random().toString(36).slice(2, 8);
const seasonNum = k => k === "poster" ? -1 : parseInt(k.split("-")[1], 10);
const slotLabel = (k, type) => k === "poster" ? (type === "movie" ? "Poster" : "Serienposter") : seasonNum(k) === 0 ? "Specials" : "Staffel " + seasonNum(k);

/* ---------------------------------------------------------------- icons --- */
const ICONS = {
  upload: [{ d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }, { d: "M17 8l-5-5-5 5" }, { d: "M12 3v12" }],
  folderplus: [{ d: "M12 10v6" }, { d: "M9 13h6" }, { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }],
  // two arrows chasing each other in a circle (rotates while a scan is running)
  sync: [{ d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }, { d: "M21 3v5h-5" }, { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }, { d: "M8 16H3v5" }],
  terminal: [{ d: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" }, { d: "M6.5 9.5l3 2.5-3 2.5" }, { d: "M12.5 15.5h4.5", cls: "cur" }],
  list: [{ d: "M8 6h13" }, { d: "M8 12h13" }, { d: "M8 18h13" }, { d: "M3 6h.01" }, { d: "M3 12h.01" }, { d: "M3 18h.01" }],
  gear: [{ d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }, { c: [12, 12, 3] }],
  back: [{ d: "M19 12H5" }, { d: "M12 19l-7-7 7-7" }],
  file: [{ d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" }, { d: "M14 2v6h6" }, { d: "M8 13h8" }, { d: "M8 17h6" }],
  search: [{ c: [11, 11, 8] }, { d: "M21 21l-4.3-4.3" }],
  download: [{ d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }, { d: "M7 10l5 5 5-5" }, { d: "M12 15V3" }],
  trash: [{ d: "M3 6h18" }, { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }, { d: "M10 11v6" }, { d: "M14 11v6" }, { d: "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" }],
};
function icon(name, size = 18) {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  for (const p of ICONS[name]) {
    const el = document.createElementNS(ns, p.c ? "circle" : "path");
    if (p.cls) el.setAttribute("class", p.cls);
    if (p.c) { el.setAttribute("cx", p.c[0]); el.setAttribute("cy", p.c[1]); el.setAttribute("r", p.c[2]); } else el.setAttribute("d", p.d);
    svg.append(el);
  }
  return svg;
}

/* ------------------------------------------------------------ state --- */
const S = { st: null, langs: [], items: [], total: 0, filter: "all", q: "", lib: "", letter: null, letters: {}, allTotal: 0, req: 0, pending: 0, ctl: null, stats: null, nopost: false, io: null, world: "", poll: null, step: "", reached: 0, rain: new Set(), view: "" };
const cfg = () => S.st.config;
const curWorld = () => cfg().worlds.find(w => w.id === S.world) || cfg().worlds[0];
const scopeStats = () => S.stats || worldStats();
const worldStats = () => (S.st.summary.worlds || {})[S.world] || { items: 0, slots: 0, missing: 0, complete_items: 0 };

const worldColor = w => `hsl(${w && w.hue != null ? w.hue : 140} 100% 50%)`;
const HUES = [[140, "Grün"], [170, "Türkis"], [205, "Blau"], [270, "Violett"], [320, "Pink"], [355, "Rot"], [30, "Orange"], [55, "Gelb"]];
function setAccent() {
  const w = curWorld();
  document.documentElement.style.setProperty("--h", w && w.hue != null ? w.hue : 140);
}

async function loadState() {
  S.st = await api("/state");
  const saved = (() => { try { return localStorage.getItem("p5world"); } catch { return null; } })();
  if (!cfg().worlds.some(w => w.id === S.world)) S.world = cfg().worlds.some(w => w.id === saved) ? saved : cfg().worlds[0].id;
  setAccent();
}
async function savePatch(patch) { const r = await api("/config", { json: { patch } }); S.st.config = r; return r; }

const AZ_MIN = 150;   // from this many titles on the list is split by first letter instead of one endless page
async function loadItems(append = false) {
  // S.lib is "lib:<Plex library>" or "src:<Sonarr/Radarr instance | Eigener Ordner>"
  const id = ++S.req, q = S.q.trim();
  if (S.ctl) S.ctl.abort();                   // typing fast: the answer to an older keystroke is not needed any more
  const ctl = S.ctl = new AbortController(), sig = { signal: ctl.signal };
  S.pending++;
  try { return await loadItemsInner(append, id, q, sig); }
  catch (e) { if (e.name === "AbortError") return; throw e; }
  finally { S.pending--; }
}
async function loadItemsInner(append, id, q, sig) {
  // S.lib: "" = all | "type:movie|show" = all movie/series sources combined | "lib:<Plex library>" | "src:<Sonarr/Radarr instance | Eigener Ordner>"
  const scope = { type: S.lib.startsWith("type:") ? S.lib.slice(5) : "", library: S.lib.startsWith("lib:") ? S.lib.slice(4) : "", source: S.lib.startsWith("src:") ? S.lib.slice(4) : "" };
  const query = (letter, limit, offset) => new URLSearchParams({ world: S.world, q: S.q, filter: S.filter, letter, ...scope,
    ...(S.filter === "comingsoon" && S.nopost ? { nopost: "1" } : {}), offset, limit });
  const total = letters => Object.values(letters || {}).reduce((a, b) => a + b, 0);
  const useLetters = S.filter === "all" && !q;   // only the tab "Alle" is split by letter; the search always covers all titles
  let letter = useLetters ? (S.letter ?? "") : "";
  if (useLetters && S.letter === null) {          // first view of a big list: start with "#" (or the first letter that exists)
    const r0 = await api("/items?" + query("", 1, 0), sig);
    if (id !== S.req) return;
    S.letters = r0.letters; S.allTotal = total(r0.letters);
    const keys = Object.keys(r0.letters).sort((a, b) => a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b));
    S.letter = letter = S.allTotal <= AZ_MIN ? "" : keys[0] || "";
  }
  const r = await api("/items?" + query(letter, 120, append ? S.items.length : 0), sig);
  if (id !== S.req) return;                       // a newer request (typing, filter) has taken over
  if (useLetters) {
    S.letters = r.letters; S.allTotal = total(r.letters);
    if (letter && !r.letters[letter]) { S.letter = null; return loadItemsInner(false, id, q, sig); }   // the letter is empty in this selection
  }
  S.stats = r.stats;
  S.items = append ? S.items.concat(r.items) : r.items;
  S.total = r.total;
}

function startPolling() {
  clearInterval(S.poll);
  S.poll = setInterval(async () => {
    try {
      const was = S.st.summary.running;
      S.st.summary = await api("/status");
      if (S.view === "dash") { updateHero(); if (was && !S.st.summary.running) { await loadItems(); renderGrid(); checkAlerts(); } }
      if (!S.st.summary.running) clearInterval(S.poll);
    } catch { /* ignore */ }
  }, 1500);
}

/* =============================================================== FX === */
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾅﾆﾇﾈﾉ0123456789Z:.=*+-<>|";
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function runRain(canvas, ms, color, transparent) {
  const w = canvas.width = canvas.clientWidth || 200, hgt = canvas.height = canvas.clientHeight || 300;
  const ctx = canvas.getContext("2d"), fs = 13, cols = Math.ceil(w / fs);
  const drops = Array.from({ length: cols }, () => -Math.random() * (hgt / fs) * 0.6);
  const speed = Array.from({ length: cols }, () => 0.5 + Math.random() * 0.9);
  const t0 = performance.now();
  ctx.font = fs + "px monospace";
  (function frame(now) {
    if (now - t0 > ms) return;
    ctx.globalCompositeOperation = transparent ? "destination-out" : "source-over";
    ctx.fillStyle = transparent ? "rgba(0,0,0,.14)" : "rgba(0,0,0,.09)";
    ctx.fillRect(0, 0, w, hgt);
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * fs;
      const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      ctx.fillStyle = "#e8fff0"; ctx.fillText(g, i * fs, y);
      ctx.fillStyle = color; ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * fs, y - fs);
      drops[i] += speed[i];
      if (y > hgt && Math.random() > 0.96) drops[i] = -Math.random() * 10;
    }
    requestAnimationFrame(frame);
  })(t0);
}

/** Matrix rain that "dissolves" into the poster underneath. */
function rainEl() {
  const box = h("div", { class: "rain" }), canvas = h("canvas");
  box.append(canvas);
  if (reduced()) { setTimeout(() => box.remove(), 50); return box; }
  requestAnimationFrame(() => runRain(canvas, 1500, getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00ff66", true));
  setTimeout(() => box.remove(), 1800);
  return box;
}

function worldTransition(world, mid) {
  if (reduced()) { mid(); return; }
  const hue = world && world.hue != null ? world.hue : 140;
  const fx = h("div", { class: "worldfx", style: `--c:${worldColor(world)}` }, h("canvas"), h("div", { class: "wfplanet" }, planetSvg(hue, 256)));
  document.body.append(fx);
  requestAnimationFrame(() => runWormhole($("canvas", fx), hue, 1300));
  setTimeout(mid, 650);                 // the colour changes while the screen is covered
  setTimeout(() => fx.remove(), 1350);
}

/* --------------------------------------------------------------- footer --- */
async function loadVersion() {
  try {
    const v = await api("/version"), foot = $("#foot");
    const link = (text, href) => href ? h("a", { href, target: "_blank", rel: "noopener" }, text) : h("span", {}, text);
    fill(foot, h("span", {}, "p5assets ", h("b", {}, v.version)),
      v.branch ? link(`Branch: ${v.branch}`, v.branch_url) : null,
      v.commit_short ? link(`Commit ${v.commit_short}`, v.commit_url) : null,
      link("GitHub ↗", v.repo));
  } catch { /* footer is optional */ }
}

/* ------------------------------------------------------------ log alert --- */
// The log button shows new warnings/errors since the log page was opened last: filled button + counter + pulse
// (not only a colour, because a world can be red or orange itself).
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
async function checkAlerts(markSeen) {
  try {
    if (S.logSeen == null) S.logSeen = +(lsGet("p5logseen") || 0);
    const r = await api(`/logs/alerts?since=${S.logSeen}`);
    if (markSeen) { S.logSeen = r.seq; lsSet("p5logseen", r.seq); r.errors = 0; r.warnings = 0; }
    S.alert = r; paintAlert();
  } catch { /* the indicator is optional */ }
}
function paintAlert() {
  const b = $("#logbtn"); if (!b) return;
  const a = S.alert || { errors: 0, warnings: 0 }, hue = (curWorld() || {}).hue ?? 140;
  const nearRed = hue >= 340 || hue <= 20, nearAmber = hue > 20 && hue <= 65;
  b.classList.toggle("alert-err", a.errors > 0);
  b.classList.toggle("alert-warn", !a.errors && a.warnings > 0);
  b.classList.toggle("nearred", a.errors > 0 && nearRed);
  b.classList.toggle("nearamber", !a.errors && a.warnings > 0 && nearAmber);
  $(".lbadge", b).textContent = a.errors || a.warnings || "";
  const parts = [a.errors ? `${a.errors} neue${a.errors === 1 ? "r Fehler" : " Fehler"}` : null, a.warnings ? `${a.warnings} neue Warnung${a.warnings === 1 ? "" : "en"}` : null].filter(Boolean);
  b.title = parts.length ? "Logs – " + parts.join(", ") : "Logs";
}
setInterval(() => { if (S.view === "dash") checkAlerts(); }, 60000);

/* ------------------------------------------------------------ routing --- */
async function boot() {
  loadVersion();
  try { await loadState(); S.langs = await api("/languages"); } catch (e) { app.append(h("div", { class: "empty" }, "Backend nicht erreichbar: " + e.message)); return; }
  if (!S.st.onboarded) return wizard();
  dashboard();
}

/* =============================================================== logs === */
async function logsPage() {
  S.view = "logs";
  checkAlerts(true);
  clearInterval(S.logTimer);
  const st = { file: "p5assets.log", entries: [], offset: 0, level: "ALL", q: "", auto: true, live: true, full: false, files: await api("/logs") };
  const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"];
  const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(2) + " MB" : (b / 1024).toFixed(2) + " KB";
  const view = h("div", { class: "logview" }), count = h("span", { class: "hint" }), title = h("div"), liveBadge = h("button", { class: "livebadge" });
  const chips = h("div", { class: "lvlchips" }), fileSel = h("select"), q = h("input", { type: "search", placeholder: "Zum Filtern tippen …", value: "" });
  const toggle = h("input", { type: "checkbox", checked: true, onchange: e => { st.auto = e.target.checked; if (st.auto) view.scrollTop = view.scrollHeight; } });

  const visible = () => st.entries.filter(e => (st.level === "ALL" || e.level === st.level) && (!st.q || `${e.ts} ${e.level} ${e.src} ${e.msg}`.toLowerCase().includes(st.q.toLowerCase())));
  function renderLines() {
    const list = visible(), shown = list.slice(-5000);
    fill(view, shown.length ? shown.map(e => h("div", { class: "ll lv-" + e.level },
      e.ts ? h("span", { class: "ts" }, `[${e.ts}]`) : null, " ", h("span", { class: "lvl" }, `[${e.level}]`), " ",
      e.src ? [h("span", { class: "src" }, e.src), h("span", { class: "sep" }, " | ")] : null, h("span", { class: "msg" }, e.msg)))
      : h("div", { class: "empty", style: "padding:30px" }, st.entries.length ? "Keine Einträge für diesen Filter." : "Noch keine Einträge."));
    count.textContent = `${list.length} entries${list.length > shown.length ? ` (letzte ${shown.length} angezeigt)` : ""}`;
    if (st.auto) view.scrollTop = view.scrollHeight;
  }
  function renderHead() {
    const f = st.files.find(x => x.name === st.file) || { size: 0 };
    fill(title, h("div", { class: "row" }, icon("file", 20), h("div", {}, h("b", {}, st.file), h("div", { class: "hint", style: "margin:0" }, st.full ? "Showing all entries" : "Showing last 1000 entries"))));
    fill(fileSel, st.files.map(x => h("option", { value: x.name, selected: x.name === st.file }, `${x.name}  (${fmtSize(x.size)})`)));
    const isLive = st.live && st.file === "p5assets.log";
    liveBadge.className = "livebadge" + (isLive ? " on" : "");
    fill(liveBadge, h("i"), isLive ? "Live" : "Pausiert");
    const counts = Object.fromEntries(LEVELS.map(l => [l, st.entries.filter(e => e.level === l).length]));
    fill(chips, h("button", { class: "lvl-chip all" + (st.level === "ALL" ? " on" : ""), onclick: () => { st.level = "ALL"; renderHead(); renderLines(); } }, "All Levels", h("small", {}, st.entries.length)),
      LEVELS.map(l => h("button", { class: `lvl-chip lv-${l}` + (st.level === l ? " on" : ""), onclick: () => { st.level = l; renderHead(); renderLines(); } }, `[${l}]`, h("small", {}, counts[l]))));
  }
  async function load(full = false) {
    st.full = full;
    const r = await api(`/logs/read?file=${encodeURIComponent(st.file)}&tail=${full ? 20000 : 1000}`);
    st.entries = r.entries; st.offset = r.offset; st.files = await api("/logs"); renderHead(); renderLines();
  }
  async function tick() {
    if (S.view !== "logs") return clearInterval(S.logTimer);
    if (!st.live || st.file !== "p5assets.log") return;
    try {
      const r = await api(`/logs/read?file=${encodeURIComponent(st.file)}&offset=${st.offset}`);
      if (r.reset) { st.entries = r.entries; } else if (r.entries.length) { st.entries = st.entries.concat(r.entries).slice(-20000); }
      st.offset = r.offset;
      if (r.reset || r.entries.length) { renderHead(); renderLines(); }
    } catch { /* ignore a failed poll */ }
  }
  fileSel.onchange = async e => { st.file = e.target.value; await load(false); };
  q.oninput = debounce(e => { st.q = q.value; renderLines(); }, 150);
  liveBadge.onclick = () => { st.live = !st.live; renderHead(); };

  fill(app,
    h("header", { class: "top" }, h("div", { class: "in" },
      h("div", { class: "logo" }, h("img", { class: "logoimg", src: "/static/icon.png", alt: "" }), h("span", {}, "logs", h("u", {}, "_"))),
      h("div", { class: "spacer" }),
      h("button", { class: "btn tb", onclick: async () => { clearInterval(S.logTimer); await checkAlerts(true); dashboard(); } }, icon("back"), h("span", { class: "lbl" }, "Zurück zum Dashboard")),
      h("button", { class: "btn tb icon", title: "Einstellungen", onclick: async () => { clearInterval(S.logTimer); await checkAlerts(true); wizard(true); } }, icon("gear", 20)))),
    h("main", {},
      h("div", { class: "logcard" },
        h("div", { class: "row wrap", style: "align-items:flex-end" },
          h("div", { style: "min-width:260px;flex:1;max-width:440px" }, h("label", { class: "f", style: "margin-top:0" }, "Logdatei wählen"), fileSel),
          h("div", { class: "spacer" }),
          h("label", { class: "switch", title: "Automatisch ans Ende scrollen" }, h("span", {}, "Auto-scroll"), toggle, h("i")),
          h("button", { class: "btn", onclick: () => load(st.full) }, icon("sync", 16), "Refresh"),
          h("button", { class: "btn", onclick: () => load(true) }, icon("file", 16), "Load full log file"),
          h("a", { class: "btn", href: "#", onclick: e => { e.currentTarget.href = `/api/logs/download?file=${encodeURIComponent(st.file)}`; } }, icon("download", 16), "Download"),
          h("button", { class: "btn danger", onclick: async () => {
            if (!confirm(`„${st.file}“ wirklich leeren? Das kann nicht rückgängig gemacht werden.`)) return;
            await api(`/logs?file=${encodeURIComponent(st.file)}`, { method: "DELETE" }); await load(false); toast("Log geleert", "ok");
          } }, icon("trash", 16), "Clear")),
        h("div", { class: "row wrap", style: "align-items:flex-end;margin-top:16px;border-top:1px solid var(--line);padding-top:14px" },
          h("div", { class: "grow", style: "min-width:240px" }, h("label", { class: "f", style: "margin-top:0" }, "Logs durchsuchen"), q),
          h("div", {}, h("label", { class: "f", style: "margin-top:0" }, "Nach Level filtern"), chips))),
      h("div", { class: "logcard", style: "padding:0;margin-top:18px" },
        h("div", { class: "row loghead" }, title, h("div", { class: "spacer" }), count, liveBadge),
        h("div", { class: "loghint" }, h("b", {}, "Tipp: "), "Mit der Suche und den Level-Chips grenzt du die Anzeige ein. Warnungen und Fehler sind farbig markiert. Tokens und API-Keys werden nie ins Log geschrieben."),
        view)));
  await load(false);
  S.logTimer = setInterval(tick, 2000);
}


/* ========================================================== dashboard === */
function dashboard() {
  S.view = "dash";
  setAccent();
  const ws = cfg().worlds;
  fill(app,
    h("header", { class: "top" }, h("div", { class: "in" },
      h("div", { class: "logo" }, h("img", { class: "logoimg", src: "/static/icon.png", alt: "" }), h("span", {}, "assets", h("u", {}, "_"))),
      ws.length > 1 ? h("div", { class: "worlds", title: "Welt wechseln" }, ws.map(w =>
        h("button", { class: w.id === S.world ? "on" : "", style: `--c:${worldColor(w)}`, title: w.name, onclick: () => switchWorld(w.id) }, planetSvg(w.hue ?? 140, 20), w.name))) : null,
      h("div", { class: "search" }, icon("search", 16), h("input", { type: "search", placeholder: "Titel suchen …", id: "q", value: S.q, autocomplete: "off", enterkeyhint: "search", oninput: debounce(async e => { S.q = e.target.value; await loadItems(); renderGrid(); }, 150) })),
      h("div", { class: "spacer" }),
      h("button", { class: "btn tb", title: "Bilder, Ordner oder ZIPs hochladen – p5assets ordnet sie automatisch den Titeln zu", onclick: () => pickFiles() }, icon("upload"), h("span", { class: "lbl" }, "Bilder hochladen")),
      h("button", { class: "btn tb", title: "Einen Titel von Hand anlegen, der weder in Plex noch in Sonarr/Radarr steht", onclick: openCustom }, icon("folderplus"), h("span", { class: "lbl" }, "Titel anlegen")),
      h("span", { class: "vsep" }),
      h("button", { class: "btn tb", id: "scanbtn", title: "Plex, Sonarr/Radarr und die Assets-Ordner neu einlesen", onclick: doScan }, icon("sync"), h("span", { class: "lbl" }, "Scannen")),
      h("button", { class: "btn tb icon logbtn", id: "logbtn", title: "Logs", onclick: logsPage }, icon("terminal", 20), h("span", { class: "lbadge" })),
      h("button", { class: "btn tb icon", title: "Einstellungen", onclick: () => wizard(true) }, icon("gear", 20)),
    )),
    h("main", {}, h("div", { id: "hero" }), h("div", { id: "chips" }), h("div", { id: "az", class: "azbar" }), h("div", { id: "grid" }), h("div", { id: "az2", class: "azbar" })),
  );
  updateHero();
  checkAlerts();
  loadItems().then(renderGrid);
  if (S.st.summary.running) startPolling();
  else if (!S.st.summary.scanned_at) doScan();
}

function switchWorld(id) {
  if (id === S.world) return;
  const w = cfg().worlds.find(x => x.id === id);
  worldTransition(w, async () => {
    S.world = id; S.filter = "all"; S.q = ""; S.lib = ""; S.letter = null; S.letters = {}; S.stats = null; S.nopost = false;
    try { localStorage.setItem("p5world", id); } catch { /* ignore */ }
    setAccent(); dashboard();
  });
}

async function doScan() {
  S.st.summary = await api("/scan", { method: "POST" });
  updateHero(); startPolling();
}

function updateHero() {
  const hero = $("#hero"); if (!hero) return;
  const s = S.st.summary, ws = scopeStats(), c = cfg();
  const pct = ws.slots ? Math.round(((ws.slots - ws.missing) / ws.slots) * 100) : 0;
  const sb = $("#scanbtn"); if (sb) { sb.disabled = s.running; sb.classList.toggle("spinning", !!s.running); }
  let box = hero.firstElementChild;
  if (!box) {   // built once; only the parts are refreshed, so an open source dropdown is not torn down by a re-render
    box = h("div", { class: "hero" }, h("div", { class: "ring" }), h("div", { id: "hmain" }), h("div", { id: "hsrc", style: "display:contents" }),
      h("div", { class: "hint scanned", id: "hhint", style: "text-align:right;white-space:pre" }));
    hero.append(box);
  }
  box.firstElementChild.style.setProperty("--p", pct);
  fill(box.firstElementChild, h("b", {}, pct + "%"));
  fill($("#hmain"),
    s.running ? h("div", { class: "row", style: "margin-bottom:10px" }, h("span", { class: "spin" }), s.progress || "Scanne …") : null,
    s.error ? h("div", { class: "status bad" }, "⚠ " + s.error) : null,
    (s.warnings || []).map(w => h("div", { class: "status bad" }, "⚠ " + w)),
    h("div", { class: "stats" },
      stat(ws.items, "Titel"), stat(ws.slots - ws.missing, "Assets vorhanden", "ok"), stat(ws.missing, "Fehlen", ws.missing ? "bad" : "ok"),
      stat(ws.complete_items, "Vollständig")));
  const sig = JSON.stringify([S.world, S.lib, c.libraries.map(l => [l.title, l.enabled, l.world]), c.arr.map(a => [a.name, a.world]), c.custom.length]);
  if (box.dataset.sig !== sig) { box.dataset.sig = sig; fill($("#hsrc"), sourceSelect()); }
  const hasSrc = !!$("#hsrc").firstChild;
  box.classList.toggle("hassrc", hasSrc);
  fill($("#hhint"), s.scanned_at ? "Zuletzt gescannt\n" + new Date(s.scanned_at * 1000).toLocaleString("de-DE") : "");
  renderChips();
}
const stat = (n, label, cls = "") => h("div", { class: "stat " + cls }, h("b", {}, n ?? 0), h("span", {}, label));

/** Source filter in the statistic block: all / all movie / all series sources (combined, every title counted once) /
 *  single Plex libraries / single Sonarr+Radarr instances. Ring, numbers and tab counters follow the selection. */
function sourceSelect() {
  const c = cfg();
  const libs = c.libraries.filter(l => l.enabled && l.world === S.world), arrs = c.arr.filter(a => a.world === S.world);
  const custom = c.custom.some(x => x.world === S.world);
  const hasMovie = libs.some(l => l.type === "movie") || arrs.some(a => a.kind === "radarr") || custom;
  const hasShow = libs.some(l => l.type === "show") || arrs.some(a => a.kind === "sonarr") || custom;
  const groups = [
    hasMovie && hasShow ? [null, [{ v: "type:movie", label: "Alle Filmquellen (kombiniert)" }, { v: "type:show", label: "Alle Serienquellen (kombiniert)" }]] : null,
    libs.length ? ["Plex-Bibliotheken", libs.map(l => ({ v: "lib:" + l.title, label: l.title }))] : null,
    arrs.length || custom ? ["Sonarr / Radarr / Ordner", [...arrs.map(a => ({ v: "src:" + a.name, label: a.name })), ...(custom ? [{ v: "src:Eigener Ordner", label: "Eigene Ordner" }] : [])]] : null,
  ].filter(Boolean);
  const all = groups.flatMap(g => g[1]);
  if (S.lib && !all.some(o => o.v === S.lib)) S.lib = "";
  const opt = o => h("option", { value: o.v, selected: S.lib === o.v }, o.label);
  if (all.length < 2) return null;               // only one source: nothing to choose
  return h("div", { class: "srccell" }, h("label", { class: "srclab" }, "Quelle"),
    h("select", { title: "Statistik und Liste nach Quelle einschränken", onchange: async e => { S.lib = e.target.value; S.letter = null; await loadItems(); renderGrid(); } },
      h("option", { value: "" }, "Alle Quellen"),
      groups.map(([label, os]) => label ? h("optgroup", { label }, os.map(opt)) : os.map(opt))));
}

function renderChips() {
  const el = $("#chips"); if (!el) return;
  const c = cfg(), cnt = (S.stats && S.stats.counts) || {};
  const hasExtra = c.arr.some(a => a.world === S.world) || c.custom.some(x => x.world === S.world);
  const chip = (label, key, n, title) => h("button", { class: "chip" + (S.filter === key ? " on" : ""), title, onclick: async () => { S.filter = key; renderChips(); await loadItems(); renderGrid(); } },
    label, n != null ? h("small", {}, n) : null);
  fill(el,
    chip("Alle", "all", cnt.all),
    chip("Fehlende", "missing", cnt.missing),
    chip("In Plex, Poster fehlt", "plexmissing", cnt.plexmissing, "In Plex vorhanden, aber bei Kometa fehlt ein Poster oder eine Staffel (ohne Titel, die nur in Sonarr/Radarr stehen)"),
    chip("Vollständig", "complete", cnt.complete),
    cnt.comingsoon > 0 || S.filter === "comingsoon" ? chip("Coming Soon", "comingsoon", cnt.comingsoon, "Coming-Soon-Poster ({edition-Coming Soon}): in Plex schon sichtbar, brauchen zeitnah ein Poster") : null,
    hasExtra || cnt.notplex > 0 || S.filter === "notplex" ? chip("Noch nicht in Plex", "notplex", cnt.notplex, "Nur in Sonarr/Radarr bzw. als eigener Ordner: noch ohne Datei, nicht erschienen oder von Plex noch nicht eingelesen") : null,
    S.filter === "comingsoon" ? h("label", { class: "chip" + (S.nopost ? " on" : ""), style: "display:inline-flex;gap:8px;align-items:center;cursor:pointer" },
      h("input", { type: "checkbox", checked: S.nopost, style: "accent-color:var(--accent)", onchange: async e => { S.nopost = e.target.checked; renderChips(); await loadItems(); renderGrid(); } }), "nur ohne Poster") : null,
  );
}

function setLetter(l, fromBottom) {
  if (S.letter === l) return;
  S.letter = l; renderAz();
  loadItems().then(() => { renderGrid(); if (fromBottom) window.scrollTo({ top: Math.max(0, ($("#az").offsetTop || 0) - 80), behavior: "smooth" }); });
}

/** A–Z bar above and below the grid (only tab "Alle", only for big lists, hidden while a search is active). */
function renderAz() {
  const show = S.filter === "all" && !S.q.trim() && S.allTotal > AZ_MIN;   // letters only in the tab "Alle"
  for (const [id, bottom] of [["#az", false], ["#az2", true]]) {
    const el = $(id); if (!el) continue;
    el.hidden = !show;
    if (!show) { el.replaceChildren(); continue; }
    const b = (label, l, n) => h("button", { class: "az" + (S.letter === l ? " on" : ""), disabled: l !== "" && !n, title: l === "" ? `Alle Titel (${S.allTotal})` : n ? `${n} Titel` : "keine Titel",
      onclick: () => setLetter(l, bottom) }, label);
    fill(el, b("Alle", "", S.allTotal), b("#", "#", S.letters["#"]), "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(c => b(c, c, S.letters[c])));
  }
}

function renderGrid() {
  if (S.pending) return;                       // a newer load is on its way: keep showing the current list, no intermediate states
  updateHero();                                // statistic and tab counters belong to the chosen source
  renderAz();
  const g = $("#grid"); if (!g) return;
  g.querySelectorAll("img").forEach(i => i.removeAttribute("src"));   // cancels pictures of the old list that are still loading
  if (!S.items.length) {
    fill(g, h("div", { class: "empty" },
      S.st.summary.running ? h("h2", {}, "Scanne …") :
      S.filter === "missing" && !S.q && scopeStats().items ? [h("div", { class: "big" }, "🎉"), h("h2", {}, "Alles vollständig!"), "Für kein Poster oder keine Staffel fehlt etwas."] :
      !worldStats().items ? [h("h2", {}, "Hier ist noch nichts"), "Ordne dieser Welt unter ⚙ Bibliotheken oder Sonarr/Radarr zu – oder lege mit „＋ Ordner“ einen eigenen Titel an."] :
      [h("h2", {}, "Nichts gefunden"), "Passe Filter oder Suche an – oder starte einen neuen Scan."]));
    return;
  }
  fill(g, h("div", { class: "grid", id: "gridin" }, S.items.map(card)));
  moreControl(g);
}

/** More titles load by themselves while scrolling (120 at a time); from ~500 loaded cards on a button asks first,
 *  so phones are not overloaded. New cards are appended, the list is not rebuilt. */
const MAX_AUTO = 480;
function moreControl(g) {
  if (S.io) { S.io.disconnect(); S.io = null; }
  g.querySelectorAll(".more, .sentinel").forEach(e => e.remove());
  if (S.items.length >= S.total) return;
  const loadMore = async () => {
    const before = S.items.length, gen = S.req;
    await loadItems(true);
    if (S.req !== gen + 1 || S.items.length === before) return;      // typing/filtering took over meanwhile
    const grid = $("#gridin"); if (!grid) return;
    S.items.slice(before).forEach(it => grid.append(card(it)));
    moreControl($("#grid"));
  };
  if (S.items.length < MAX_AUTO) {
    const sentinel = h("div", { class: "sentinel" });
    g.append(sentinel);
    S.io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { S.io.disconnect(); loadMore(); } }, { rootMargin: "900px" });
    S.io.observe(sentinel);
  } else g.append(h("button", { class: "btn more", onclick: async e => { e.currentTarget.disabled = true; await loadMore(); } }, `Mehr laden (${S.total - S.items.length})`));
}

/** `known` = slot counts as "missing" when empty; otherwise it is an optional empty tile. */
function posterBox(item, slot, known = true) {
  const sl = item.slots[slot];
  const exists = !!(sl && sl.exists);
  const wrap = h("div", { class: "poster" + (!exists && known ? " miss" : "") });
  const placeholder = txt => wrap.append(h("div", { class: "ph" }, h("div", {}, h("b", {}, "＋"), txt)));
  if (exists) {
    wrap.append(h("img", { loading: "lazy", alt: "", draggable: false, src: `/api/thumb/${item.id}/${slot}?v=${sl.mtime}`, onload: e => e.target.classList.add("loaded"),
      onerror: e => { e.target.remove(); placeholder("Bild defekt"); } }));
  } else if (item.in_plex && known && sl && sl.plex_thumb) {
    wrap.append(h("img", { loading: "lazy", alt: "", draggable: false, src: `/api/season-thumb/${item.id}/${slot}`, onload: e => { e.target.classList.add("loaded"); wrap.append(h("span", { class: "badge warn b", title: "Nur Vorschau aus Plex (kann Overlays enthalten) – kein Kometa-Asset, nicht kopierbar" }, "Plex-Vorschau")); },
      onerror: e => { e.target.remove(); placeholder("fehlt"); } }));
  } else placeholder(known ? "fehlt" : "leer");
  const key = item.id + "|" + slot;
  if (S.rain.has(key)) { S.rain.delete(key); wrap.append(rainEl()); }
  return wrap;
}

/** Short label for titles that are not in Plex, based on what Sonarr/Radarr know about them. */
function notPlexLabel(item) {
  if (item.custom) return "Ordner";
  if (item.monitored === false) return "nicht überwacht";
  if (item.monitored && item.has_files === false) return item.available === false ? "nicht erschienen" : "ohne Datei";
  return "nicht in Plex";
}

/** Status of a title as tag descriptors; the colour says what it means (ok = green, warn = yellow, bad = red). */
function statusTags(it) {
  const t = [];
  if (!it.in_plex) t.push({ text: "nicht in Plex", cls: "warn" });
  if (it.coming_soon) t.push({ text: "Coming Soon", cls: "warn" });
  if (it.monitored != null) {
    t.push(it.monitored ? { text: "überwacht", cls: "ok" } : { text: "nicht überwacht", cls: "" });
    if (it.has_files === false) t.push({ text: "ohne Datei", cls: "warn" });
    if (it.available === false) t.push({ text: "noch nicht erschienen", cls: "warn" });
  }
  t.push(it.missing ? { text: `${it.missing} Kachel${it.missing === 1 ? "" : "n"} fehlen`, cls: "bad" } : { text: "vollständig", cls: "ok" });
  return t;
}
const itemWorld = it => cfg().worlds.find(w => w.id === it.world);

/** The same three labelled groups everywhere: Welt · Quellen · Status. */
function metaGroups(it) {
  const world = itemWorld(it);
  const group = (label, tags) => h("div", { class: "mg" }, h("span", { class: "mgl" }, label), h("div", { class: "mgt" }, tags));
  return h("div", { class: "metagroups" },
    world && cfg().worlds.length > 1 ? group("Welt", h("span", { class: "tag", style: `color:${worldColor(world)};border-color:${worldColor(world)}` }, world.name)) : null,
    group("Quellen", it.sources.map(s => h("span", { class: "tag" }, s))),
    group("Status", statusTags(it).map(t => h("span", { class: "tag " + t.cls }, t.text))));
}
/** Plain-text version of the groups for tooltips. */
function metaText(it) {
  const world = itemWorld(it);
  return [world && cfg().worlds.length > 1 ? `Welt: ${world.name}` : null, `Quellen: ${it.sources.join(" · ")}`, `Status: ${statusTags(it).map(t => t.text).join(" · ")}`].filter(Boolean).join("\n");
}

function card(item) {
  const movie = item.type === "movie";
  const el = h("div", { class: "card" + (movie ? " movie" : ""), onclick: movie ? null : () => openItem(item.id) });
  const box = posterBox(item, "poster");
  const bad = item.missing;
  box.append(h("span", { class: "badge " + (bad ? "bad" : "ok") }, bad ? `${bad} fehlt` : "✓"));
  box.title = metaText(item);
  if (!item.in_plex) box.append(h("span", { class: "badge warn b" }, notPlexLabel(item)));
  else if (item.coming_soon) box.append(h("span", { class: "badge warn b", title: "In Plex als Coming-Soon-Platzhalter sichtbar" }, "Coming Soon"));
  // a movie has one poster: no detail view, title/year and poster open the preview; the action buttons are built on first use
  const info = h("div", { class: "info", onclick: movie ? () => openPreview(item, "poster", changed) : null, title: movie ? "Vorschau öffnen" : null },
    h("div", { class: "t", title: item.title }, item.title),
    h("div", { class: "s" }, [item.year, item.type === "show" ? `${item.season_count} Staffeln` : "Film"].filter(Boolean).join(" · ")));
  function changed(it) {
    const i = S.items.findIndex(x => x.id === it.id);
    if (i >= 0) { S.items[i] = it; el.replaceWith(card(it)); }
    api("/status").then(r => { S.st.summary = r; updateHero(); });
  }
  if (movie && item.folder) {
    let ready = false;
    const ensure = () => { if (!ready) { ready = true; box.append(slotActions(item, "poster", box, changed)); } };
    box.addEventListener("pointerenter", ensure, { once: true });
    box.onclick = () => {
      ensure();
      if (matchMedia("(hover: none)").matches) toggleActions(box); else openPreview(item, "poster", changed);
    };
    makeDropTarget(el, files => uploadSlot(item, "poster", files, changed));
  } else if (movie) {
    box.onclick = () => openPreview(item, "poster", changed);
  } else {
    makeDropTarget(el, files => importFiles(files, item.id));
  }
  el.append(box, info);
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
  function close() {
    scrim.remove(); document.removeEventListener("keydown", onKey);
    api("/status").then(s => { S.st.summary = s; updateHero(); });
    loadItems().then(renderGrid);
  }

  let selMode = false, cur = item;
  const sel = new Set();
  function draw(it) {
    cur = it;
    const have = Object.keys(it.slots).filter(k => it.slots[k].exists);
    for (const k of [...sel]) if (!have.includes(k)) sel.delete(k);
    drawer.classList.toggle("selecting", selMode);
    const keys = ["poster", ...Object.keys(it.slots).filter(k => k !== "poster").sort((a, b) => seasonNum(a) - seasonNum(b))];
    const extra = [];
    if (it.type === "show") for (let n = 0; n <= it.max_season; n++) if (!("season-" + n in it.slots)) extra.push("season-" + n);
    fill(drawer,
      h("header", {},
        h("button", { class: "btn ghost", onclick: close }, "✕"),
        h("div", { class: "grow" }, h("h2", {}, it.title, it.year ? ` (${it.year})` : ""),
          h("div", { class: "hint", style: "margin:2px 0" }, "Kometa-Ordner: ", h("code", {}, it.folder || "—")),
          (it.mirror_folders || []).length ? h("div", { class: "hint", style: "margin:2px 0" }, "Zusätzlich gespeichert in: ", it.mirror_folders.map(f => h("code", {}, f)),
            h("span", { class: "tag ok", style: "margin-left:8px", title: "Coming-Soon-Platzhalter: Poster werden auch im echten Film-Ordner abgelegt" }, "Coming Soon gespiegelt")) : null,
          metaGroups(it)),
        it.custom ? h("button", { class: "btn sm danger", title: "Entfernt nur den Eintrag, Dateien bleiben erhalten", onclick: async () => {
          if (!confirm("Eigenen Ordner aus der Liste entfernen? Die Dateien bleiben erhalten.")) return;
          await api("/custom/" + it.id, { method: "DELETE" }); close(); toast("Entfernt", "ok");
        } }, "Eintrag entfernen") : null,
      ),
      h("div", { class: "body" },
        !it.folder ? h("div", { class: "status bad" }, "Für diesen Titel ist kein Ordnername bekannt – Upload nicht möglich.") : null,
        h("p", { class: "hint" }, "Bild auf eine Kachel ziehen oder anklicken, um es zu ersetzen. Ein vorhandenes Poster lässt sich auf eine andere Kachel ziehen, um es zu kopieren. Mehrere Dateien, Ordner oder eine ZIP auf dieses Fenster ziehen: p5assets ordnet sie automatisch zu und benennt sie Kometa-konform."),
        it.type === "show" ? downloadBar(it, have) : null,
        h("div", { class: "slots" }, keys.map(k => slotView(it, k, true))),
        extra.length ? h("details", { class: "more-seasons" },
          h("summary", {}, `Weitere Staffeln (Season00 – Season${String(it.max_season).padStart(2, "0")}) – auch für Staffeln, die Plex noch nicht kennt`),
          h("div", { class: "slots" }, extra.map(k => slotView(it, k, false)))) : null),
    );
  }

  /** Download of single tiles (via the tile buttons) or several/all as a ZIP in original quality. */
  function downloadBar(it, have) {
    const zip = keys => downloadUrl(`/api/download-zip/${it.id}?slots=${encodeURIComponent(keys.join(","))}`);
    const upload = h("button", { class: "btn sm primary", title: "Ordner oder ZIP mit allen Bildern dieser Serie – p5assets ordnet sie den Kacheln zu", onclick: () => pickSet(files => importFiles(files, it.id, draw, it, true)) }, icon("upload", 14), "Set hochladen");
    const tpdb = h("button", { class: "btn sm", title: "Set auf ThePosterDB suchen und das heruntergeladene Set hier ablegen", onclick: () => openPosterDbSet(it, draw) }, "ThePosterDB-Set");
    return h("div", { class: "dlbar row wrap" }, selMode ? null : upload, selMode ? null : tpdb,
      !have.length ? null : selMode ? [
        h("span", { class: "hint", style: "margin:0" }, `${sel.size} von ${have.length} ausgewählt – Kacheln antippen`),
        h("button", { class: "btn sm", onclick: () => { have.forEach(k => sel.add(k)); draw(it); } }, "Alle wählen"),
        h("button", { class: "btn sm primary", disabled: !sel.size, onclick: () => zip([...sel]) }, icon("download", 14), `Auswahl als ZIP (${sel.size})`),
        h("button", { class: "btn sm", onclick: () => { selMode = false; sel.clear(); draw(it); } }, "Fertig")]
      : [h("button", { class: "btn sm", title: "Alle vorhandenen Poster in Originalqualität als ZIP", onclick: () => zip(have) }, icon("download", 14), `Alle als ZIP (${have.length})`),
         h("button", { class: "btn sm", title: "Einzelne Poster auswählen und als ZIP laden", onclick: () => { selMode = true; draw(it); } }, "Auswählen …")]);
  }

  function slotView(it, key, known) {
    const sl = it.slots[key], exists = !!(sl && sl.exists);
    const box = posterBox(it, key, known);
    if (known) box.append(h("span", { class: "badge " + (exists ? "ok" : "bad") }, exists ? "vorhanden" : "fehlt"));
    else if (exists) box.append(h("span", { class: "badge ok" }, "vorhanden"));
    if (sl && sl.only_arr) box.append(h("span", { class: "badge warn b", title: "Diese Staffel kennt bisher nur Sonarr – in Plex gibt es sie noch nicht" }, "noch nicht in Plex"));
    const pick = () => pickFiles(files => uploadSlot(it, key, files, draw), false);
    box.append(slotActions(it, key, box, draw));
    const el = h("div", { class: "slot" }, box, h("div", { class: "lab" }, slotLabel(key, it.type)));
    // click on the picture itself: preview (existing) / file dialog (empty); touch screens have no hover, so a tap shows the buttons first
    box.onclick = () => {
      if (selMode) { if (!exists) return; sel.has(key) ? sel.delete(key) : sel.add(key); draw(it); return; }
      if (matchMedia("(hover: none)").matches) toggleActions(box); else if (exists) openPreview(it, key, draw); else pick();
    };
    if (selMode && exists) { box.classList.add("selectable"); if (sel.has(key)) box.classList.add("selected"); box.append(h("span", { class: "selmark" }, sel.has(key) ? "✓" : "")); }
    makeDropTarget(el, files => uploadSlot(it, key, files, draw));
    // Kometa assets can be dragged onto other tiles of this title: the file is copied and renamed Kometa-conform
    if (exists) {
      // draggable everywhere on the poster, also over the overlay buttons (buttons are draggable too, the event bubbles up)
      box.draggable = true; box.querySelectorAll(".ov-btn").forEach(b => { b.draggable = true; });
      box.addEventListener("dragstart", e => { e.dataTransfer.setData("application/x-p5-slot", JSON.stringify({ item: it.id, slot: key })); e.dataTransfer.effectAllowed = "copy"; });
    }
    const isSlotDrag = e => [...(e.dataTransfer?.types || [])].includes("application/x-p5-slot");
    let depth = 0;
    el.addEventListener("dragenter", e => { if (isSlotDrag(e)) { depth++; el.classList.add("copyover"); } });
    el.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; el.classList.remove("copyover"); } });
    el.addEventListener("dragover", e => { if (isSlotDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
    el.addEventListener("drop", async e => {
      if (!isSlotDrag(e)) return;
      e.preventDefault(); e.stopPropagation(); depth = 0; el.classList.remove("copyover");
      let src; try { src = JSON.parse(e.dataTransfer.getData("application/x-p5-slot")); } catch { return; }
      if (src.item !== it.id || src.slot === key) return;
      if (exists && !confirm(`${slotLabel(key, it.type)} ist schon belegt. Mit ${slotLabel(src.slot, it.type)} überschreiben?`)) return;
      try {
        const r = await api(`/items/${it.id}/${key}/copy`, { json: { source: src.slot } });
        toast(`${slotLabel(src.slot, it.type)} → ${slotLabel(key, it.type)} kopiert ✓`, "ok");
        if (r.warning) toast("Plex: " + r.warning, "bad");
        S.rain.add(it.id + "|" + key); draw(r.item);
      } catch (err) { toast(err.message, "bad"); }
    });
    return el;
  }
  makeDropTarget(drawer, files => importFiles(files, id, draw, cur));
  draw(item);
}

/** Touch screens: a tap shows the action buttons of one poster at a time. */
function toggleActions(box) {
  document.querySelectorAll(".poster.show").forEach(p => { if (p !== box) p.classList.remove("show"); });
  box.classList.toggle("show");
}

/** Save an asset (original file, no re-encoding) or a ZIP – a normal download link, works on iPhone/iPad too. */
function downloadUrl(url) {
  const a = h("a", { href: url, download: "", hidden: true });
  document.body.append(a); a.click(); a.remove();
}
const downloadSlot = (it, key) => downloadUrl(`/api/download/${it.id}/${key}`);

/** Hover/tap overlay of a poster tile with its actions (series tiles in the detail view, movie posters on the dashboard). */
function slotActions(it, key, box, draw) {
  const exists = !!(it.slots[key] && it.slots[key].exists);
  const pick = () => pickFiles(files => uploadSlot(it, key, files, draw), false);
  const del = async () => { if (confirm(`${slotLabel(key, it.type)} wirklich löschen?`)) { const r = await api(`/items/${it.id}/${key}`, { method: "DELETE" }); draw(r.item); } };
  const ob = (label, fn, cls = "") => h("button", { class: "ov-btn " + cls, onclick: e => { e.stopPropagation(); box.classList.remove("show"); fn(); } }, label);
  return h("div", { class: "hover" },
    h("div", { class: "ovbtns" }, exists
      ? [ob("Ersetzen", pick), ob("Vorschau", () => openPreview(it, key, draw)), ob("Online suchen", () => searchOnline(it, key, draw)),
         ob("Herunterladen", () => downloadSlot(it, key)),
         it.type === "show" ? ob("Auf alle …", () => openApplyAll(it, key, draw)) : null, ob("Löschen", del, "danger")]
      : [ob("Hochladen", pick), ob("Online suchen", () => searchOnline(it, key, draw))]),
    h("div", { class: "ovhint" }, "oder Bild hierher ziehen"));
}

/** Enlarged view of a poster (always the original file) with its details and the actions. Works for empty slots too
 *  (Plex preview or a placeholder, with "Ersetzen" / "Online suchen"). */
function openPreview(it, key, draw) {
  const sl = it.slots[key] || {}, exists = !!sl.exists;
  const src = exists ? `/api/asset/${it.id}/${key}?v=${sl.mtime}` : sl.plex_thumb ? `/api/season-thumb/${it.id}/${key}` : "";
  const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(2) + " MB" : Math.round(b / 1024) + " KB";
  const res = h("dd", {}, "…");
  const rows = [
    ["Titel", it.title + (it.year ? ` (${it.year})` : "")],
    ["Slot", slotLabel(key, it.type)],
    ["Kometa-Ordner", it.folder || "—"],
    ...((it.mirror_folders || []).length ? [["Zusätzlich gespeichert in", it.mirror_folders.join(", ")]] : []),
    ...(exists ? [
      ["Datei", sl.file],
      ...((sl.mirrors || []).length ? [["Kopie in", sl.mirrors.join(", ")]] : []),
      ["Größe", fmtSize(sl.size)],
      ["Geändert", new Date(sl.mtime * 1000).toLocaleString("de-DE")],
      ["Format", (sl.file.split(".").pop() || "").toUpperCase()]] : [["Datei", "noch kein Kometa-Asset vorhanden"]]),
  ];
  if ((it.dupes || []).length) rows.push(["Hinweis", `Ordnername auch an anderer Stelle gefunden (wird nicht genutzt): ${it.dupes.join(", ")}`]);
  const touch = matchMedia("(hover: none)").matches;
  const img = src ? h("img", { src, alt: "", onload: e => { res.textContent = `${e.target.naturalWidth} × ${e.target.naturalHeight} px${exists ? "" : " (Plex-Vorschau)"}`; } })
    : h("div", { class: "noimg" }, h("b", {}, "＋"), "kein Bild");
  const pick = () => pickFiles(files => { close(); uploadSlot(it, key, files, draw); }, false);
  const wrap = h("div", { class: "modalwrap lightbox", onclick: e => { if (e.target === wrap) close(); } },
    h("div", { class: "lbox" }, h("div", { class: "limg" }, img,
        touch && exists ? h("div", { class: "hint", style: "text-align:center" }, "Bild lange drücken → „Zu Fotos hinzufügen“ (Originalqualität)") : null),
      h("div", { class: "lside" },
        h("div", { class: "row" }, h("h3", { class: "grow" }, "Vorschau"), h("button", { class: "btn ghost sm", onclick: () => close() }, "✕")),
        metaGroups(it),
        (it.mirror_folders || []).length ? h("div", { style: "margin-top:8px" }, h("span", { class: "tag ok", title: "Coming-Soon-Platzhalter: Poster werden auch im echten Film-Ordner abgelegt" }, "Coming Soon gespiegelt")) : null,
        h("dl", {}, rows.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]), src ? [h("dt", {}, "Auflösung"), res] : null),
        h("div", { class: "row wrap", style: "margin-top:20px" },
          it.folder ? h("button", { class: "btn sm primary", onclick: pick }, exists ? "Ersetzen" : "Hochladen") : null,
          exists ? h("button", { class: "btn sm", onclick: () => downloadSlot(it, key) }, icon("download", 14), "Herunterladen") : null,
          draw && it.folder ? h("button", { class: "btn sm", onclick: () => { close(); searchOnline(it, key, draw); } }, "Online suchen") : null,
          draw && exists && it.type === "show" ? h("button", { class: "btn sm", onclick: () => { close(); openApplyAll(it, key, draw); } }, "Auf alle …") : null,
          draw && exists ? h("button", { class: "btn sm danger", onclick: async () => {
            if (!confirm(`${slotLabel(key, it.type)} wirklich löschen?`)) return;
            close(); const r = await api(`/items/${it.id}/${key}`, { method: "DELETE" }); draw(r.item);
          } }, "Löschen") : null,
          it.custom && it.type === "movie" ? h("button", { class: "btn sm danger", title: "Entfernt nur den Eintrag, Dateien bleiben erhalten", onclick: async () => {
            if (!confirm("Eigenen Ordner aus der Liste entfernen? Die Dateien bleiben erhalten.")) return;
            await api("/custom/" + it.id, { method: "DELETE" }); close(); toast("Entfernt", "ok"); await loadItems(); renderGrid();
          } }, "Eintrag entfernen") : null),
        !it.folder ? h("div", { class: "status bad" }, "Für diesen Titel ist kein Ordnername bekannt – Upload nicht möglich.") : null)));
  const onKey = e => { if (e.key === "Escape") close(); };
  function close() { wrap.remove(); document.removeEventListener("keydown", onKey); }
  document.addEventListener("keydown", onKey);
  document.body.append(wrap);
}

/** Use one existing asset for many tiles of the title at once (e.g. poster -> Season00 … Season50), named Kometa-conform. */
function openApplyAll(it, key, draw) {
  const opt = { range: "known", poster: key !== "poster", specials: true, overwrite: false, limit: 10 };
  const label = slotLabel(key, it.type);
  const compute = () => {
    let list = opt.range === "known" ? Object.keys(it.slots) : ["poster", ...Array.from({ length: opt.limit + 1 }, (_, n) => "season-" + n)];
    list = list.filter(t => t !== key && (opt.poster || t !== "poster") && (opt.specials || t !== "season-0"));
    const overwritten = list.filter(t => it.slots[t] && it.slots[t].exists);
    const targets = opt.overwrite ? list : list.filter(t => !(it.slots[t] && it.slots[t].exists));
    return { targets, overwritten: opt.overwrite ? overwritten : [] };
  };
  const summary = h("div", { class: "status", style: "font-size:14px" });
  const go = h("button", { class: "btn primary" }, "Anwenden");
  const refresh = () => {
    allSub.textContent = `Poster und Season00 – Season${String(opt.limit).padStart(2, "0")}, auch für Staffeln, die es noch nicht gibt`;
    const { targets, overwritten } = compute();
    summary.className = "status" + (targets.length ? " ok" : "");
    summary.textContent = targets.length
      ? `${targets.length} Kachel${targets.length === 1 ? "" : "n"} werden mit „${label}“ gefüllt${overwritten.length ? `, davon ${overwritten.length} überschrieben` : ""}.`
      : "Keine Kachel zu füllen – passe die Auswahl an.";
    go.disabled = !targets.length;
  };
  const radio = (name, value, text, sub, checked, onPick) => h("label", { class: "opt" },
    h("input", { type: "radio", name, checked, onchange: () => { onPick(value); refresh(); } }), h("div", {}, text, sub ? h("small", {}, sub) : null));
  const check = (text, sub, checked, onPick) => h("label", { class: "opt" },
    h("input", { type: "checkbox", checked, onchange: e => { onPick(e.target.checked); refresh(); } }), h("div", {}, text, sub ? h("small", {}, sub) : null));
  const known = Object.keys(it.slots).filter(t => t !== key).length;
  // "all tiles up to Season [n]": the upper limit is a labelled number field (default 10, max 50)
  const allSub = h("small", {});
  const allRadio = h("input", { type: "radio", name: "range", checked: opt.range === "all", onchange: () => { opt.range = "all"; refresh(); } });
  const limitInput = h("input", { type: "number", class: "numfld", min: 0, max: it.max_season, value: opt.limit, title: `Höchste Staffelnummer (0 – ${it.max_season})`,
    "aria-label": "Alle Kacheln bis Season",
    oninput: e => { const v = parseInt(e.target.value, 10); opt.limit = Number.isNaN(v) ? 10 : Math.max(0, Math.min(it.max_season, v)); opt.range = "all"; allRadio.checked = true; refresh(); },
    onchange: e => { e.target.value = opt.limit; } });
  const allRow = h("label", { class: "opt" }, allRadio, h("div", {}, "Alle Kacheln bis Season", limitInput, allSub));
  const m = modal(`„${label}“ für ${it.title} auf andere Kacheln anwenden`, h("div", {},
    h("div", { class: "row", style: "margin-bottom:6px" },
      h("img", { src: `/api/thumb/${it.id}/${key}?v=${it.slots[key].mtime}`, alt: "", style: "width:64px;border-radius:6px;border:1px solid var(--line)" }),
      h("div", { class: "hint" }, "Das Bild wird kopiert und jede Kopie Kometa-konform benannt (poster, Season00, Season01 …). Das Original bleibt unverändert.")),
    h("label", { class: "f" }, "Welche Kacheln?"),
    radio("range", "known", "Nur vorhandene Kacheln dieser Serie", `${known} weitere Kachel${known === 1 ? "" : "n"} (Poster + bekannte Staffeln laut Plex/Sonarr)`, opt.range === "known", v => { opt.range = v; }),
    allRow,
    key !== "poster" ? check("Serienposter einbeziehen", null, opt.poster, v => { opt.poster = v; }) : null,
    check("Specials (Season00) einbeziehen", null, opt.specials, v => { opt.specials = v; }),
    h("label", { class: "f" }, "Bereits belegte Kacheln"),
    radio("ow", "no", "Nur leere Kacheln füllen", "Vorhandene Bilder bleiben unangetastet", true, () => { opt.overwrite = false; }),
    radio("ow", "yes", "Auch belegte Kacheln überschreiben", null, false, () => { opt.overwrite = true; }),
    h("div", { style: "margin-top:14px" }, summary)),
    [go, h("button", { class: "btn", onclick: () => m.close() }, "Abbrechen")]);
  go.onclick = async () => {
    const { targets, overwritten } = compute();
    if (overwritten.length && !confirm(`${overwritten.length} bereits belegte Kachel(n) werden überschrieben. Fortfahren?`)) return;
    try {
      const r = await busy(go, () => api(`/items/${it.id}/copy-all`, { json: { source: key, targets, overwrite: opt.overwrite } }));
      m.close();
      toast(`${r.written.length} Kachel${r.written.length === 1 ? "" : "n"} gesetzt ✓`, "ok");
      if (r.warning) toast("Plex: " + r.warning, "bad");
      r.written.forEach(t => S.rain.add(it.id + "|" + t));
      draw(r.item);
    } catch (e) { toast(e.message, "bad"); }
  };
  refresh();
}

async function uploadSlot(it, slot, files, draw) {
  const imgs = files.filter(f => /\.(jpe?g|png|webp|gif|bmp|tiff?|avif)$/i.test(f.path));
  if (imgs.length !== 1 || files.length !== 1) return importFiles(files, it.id, draw);
  const fd = new FormData(); fd.append("file", imgs[0].file, imgs[0].file.name);
  try {
    const r = await api(`/items/${it.id}/${slot}/upload`, { method: "POST", body: fd });
    toast("Ersetzt ✓", "ok"); if (r.warning) toast("Plex: " + r.warning, "bad");
    S.rain.add(it.id + "|" + slot);
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

async function searchOnline(it, slot, draw) {
  const body = h("div", {}, h("div", { class: "empty" }, h("span", { class: "spin" }), " Suche bei TMDb, TVDB und fanart.tv …"));
  const m = modal(`${it.title} – ${slotLabel(slot, it.type)}`, body);
  const byCode = Object.fromEntries(S.langs.map(l => [l.code, l]));
  const langTitle = code => { const l = byCode[code]; const name = !l ? code : code === "xx" ? "Textless (No Text)" : l.native && l.native !== l.name ? `${l.name} (${l.native})` : l.name; return `${code} • ${name}`; };
  try {
    const r = await api(`/items/${it.id}/${slot}/search`);
    let tab = "Alle";
    const tabs = h("div", { class: "tabs" }), content = h("div");
    const pick = img => {
      const p = h("div", { class: "pick", title: "Übernehmen", onclick: async () => {
        p.classList.add("busy");
        try { const res = await api(`/items/${it.id}/${slot}/url`, { json: { url: img.url } }); toast("Übernommen ✓", "ok"); m.close(); S.rain.add(it.id + "|" + slot); draw(res.item); }
        catch (e) { p.classList.remove("busy"); toast(e.message, "bad"); }
      } }, h("img", { loading: "lazy", src: "/api/proxy?url=" + encodeURIComponent(img.preview || img.url) }),
        h("span", {}, img.source, img.width ? h("b", {}, `${img.width}×${img.height}`) : ""));
      return p;
    };
    function render() {
      fill(tabs, [{ name: "Alle", state: "ok", count: r.images.length }, ...r.providers, { name: "ThePosterDB", state: "ok", tpdb: true }].map(pv => h("button", {
        class: "tab" + (tab === pv.name ? " on" : "") + (pv.state !== "ok" ? " off" : ""), disabled: pv.state === "nokey",
        title: pv.state === "nokey" ? "Kein API-Key hinterlegt (Einstellungen → Quellen)" : pv.state === "error" ? pv.error : "",
        onclick: () => { tab = pv.name; render(); } },
        pv.name, pv.tpdb ? null : h("small", {}, pv.state === "nokey" ? "kein Key" : pv.state === "error" ? "Fehler" : pv.count))));
      if (tab === "ThePosterDB") { fill(content, posterDbPanel(it, slot, draw, () => m.close())); return; }
      const prov = r.providers.find(p => p.name === tab);
      const list = tab === "Alle" ? r.images : r.images.filter(i => i.source === tab);
      const groups = r.languages.map(l => ({ code: l.code, imgs: list.filter(i => i.lang === l.code) }));
      const others = {};
      list.filter(i => !r.languages.some(l => l.code === i.lang)).forEach(i => (others[i.lang] ||= []).push(i));
      Object.keys(others).sort((a, b) => others[b].length - others[a].length).forEach(code => groups.push({ code, imgs: others[code], other: true }));
      fill(content,
        prov && prov.state === "error" ? h("div", { class: "status bad" }, `⚠ ${prov.name}: ${prov.error}`) : null,
        tab === "Alle" ? r.providers.filter(p => p.state === "error").map(p => h("div", { class: "status bad" }, `⚠ ${p.name}: ${p.error}`)) : null,
        groups.filter(g => g.imgs.length).map((g, n) => h("div", { class: "langgroup" },
          h("h4", {}, g.other ? "Weitere Sprache · " : `${n + 1}. `, langTitle(g.code), h("small", {}, ` ${g.imgs.length}`)),
          h("div", { class: "picks" }, g.imgs.map(pick)))),
        list.length ? null : h("div", { class: "empty" }, "Keine Poster gefunden."));
    }
    fill(body, tabs, content); render();
  } catch (e) { fill(body, h("div", { class: "status bad" }, e.message), h("h4", { style: "margin:18px 0 0;color:var(--accent)" }, "ThePosterDB"), posterDbPanel(it, slot, draw, () => m.close())); }
}

/* -------------------------------------------------------- ThePosterDB --- */
/** ThePosterDB has no API and only lets signed-in users download, so p5assets does not fetch anything from there:
 *  a search link (in the arr naming of the folder) and a drop zone for what was downloaded in the browser.
 *  slot = a single tile (one poster, or a set that is then reviewed); slot = null: a whole series set. */
function posterDbPanel(it, slot, draw, done) {
  const base = (it.arr_folders && it.arr_folders[0]) || it.folder || `${it.title}${it.year ? ` (${it.year})` : ""}`;
  const bare = s => s.replace(/\s*[\{\[][^}\]]*[\}\]]/g, "").replace(/[:"&<>|\\\/*?;]+/g, " ").replace(/\s+/g, " ").trim();   // without {tvdb-…} / [...] and characters a firewall may dislike
  const enc = s => encodeURIComponent(s).replace(/[()!'*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const section = it.type === "movie" ? "movies" : "shows";
  const term = h("input", { type: "text", value: lsGet("p5tpdbids") === "1" ? base : bare(base), "aria-label": "Suchbegriff" });
  // no Referer: ThePosterDB's firewall blocked clicks coming from a local address (the same link typed by hand worked)
  const link = h("a", { class: "btn primary", target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer" }, "Auf ThePosterDB suchen ↗");
  const url = h("input", { type: "text", readOnly: true, class: "tpurl", "aria-label": "Fertige Such-Adresse", onfocus: e => e.target.select() });
  const upd = () => { link.href = url.value = `https://theposterdb.com/search?term=${enc(term.value.trim())}&section=${section}`; };
  const copy = h("button", { class: "btn sm", onclick: async () => {
    try { await navigator.clipboard.writeText(url.value); } catch { url.select(); document.execCommand("copy"); }
    toast("Link kopiert", "ok");
  } }, "Link kopieren");
  term.oninput = upd; upd();
  const ids = h("input", { type: "checkbox", checked: lsGet("p5tpdbids") === "1", onchange: e => { lsSet("p5tpdbids", e.target.checked ? "1" : "0"); term.value = e.target.checked ? base : bare(base); upd(); } });
  const handle = files => {
    if (!files || !files.length) return;
    const imgs = files.filter(f => /\.(jpe?g|png|webp|gif|bmp|tiff?|avif)$/i.test(f.path));
    done();
    if (slot && files.length === 1 && imgs.length === 1) uploadSlot(it, slot, files, draw);   // one poster for this tile
    else importFiles(files, it.id, draw, it, true);                                           // set: review dialog, series fixed
  };
  const zone = h("div", { class: "tpzone" }, h("b", {}, "＋"),
    h("div", {}, slot ? "Heruntergeladenes Poster hier ablegen" : "Heruntergeladenes Set hier ablegen"),
    h("small", {}, slot ? "Ein einzelnes Bild ersetzt diese Kachel. Ein ZIP oder mehrere Bilder öffnen den Prüfdialog." : "ZIP, Ordner oder mehrere Bilder – danach den Prüfdialog bestätigen."),
    h("div", { class: "row wrap", style: "justify-content:center;margin-top:10px" },
      h("button", { class: "btn sm primary", onclick: () => pickFiles(handle, true) }, slot ? "Poster / ZIP wählen" : "ZIP / Bilder wählen"),
      h("button", { class: "btn sm", onclick: () => pickFiles(handle, true, true) }, "Ordner wählen")));
  makeDropTarget(zone, handle);
  return h("div", { class: "tpdb" },
    h("ol", { class: "tpsteps" },
      h("li", {}, "Auf ThePosterDB suchen, Sprache und Set wählen und dort (angemeldet) herunterladen."),
      h("li", {}, "Die heruntergeladene Datei hier ablegen: p5assets benennt sie Kometa-konform und legt sie ab.")),
    h("label", { class: "f" }, "Suchbegriff (englischer Ordnername aus Sonarr/Radarr)"),
    h("div", { class: "row wrap" }, h("div", { class: "grow", style: "min-width:220px" }, term), link),
    h("div", { class: "row", style: "margin-top:8px" }, h("div", { class: "grow" }, url), copy),
    h("div", { class: "hint", style: "margin:2px 0 0" }, "Falls der Button blockiert wird: Link kopieren und in einen neuen Tab einfügen."),
    h("label", { class: "opt", style: "margin-top:8px" }, ids, h("div", {}, "Kennung wie {tvdb-123} mitsuchen", h("small", {}, "Ohne Kennung (Standard) wird nur „Titel (Jahr)“ gesucht."))),
    h("p", { class: "hint" }, "ThePosterDB bietet Downloads nur für angemeldete Nutzer an – deshalb lädt p5assets dort nichts selbst und braucht keine Zugangsdaten."),
    zone);
}

function openPosterDbSet(it, draw) {
  let m; m = modal(`ThePosterDB-Set für ${it.title}`, posterDbPanel(it, null, draw, () => m.close()));
}

/* ---------------------------------------------------- custom folder --- */
function openCustom() {
  const folder = h("input", { type: "text", placeholder: "z. B. Meine Serie (2024)" });
  const title = h("input", { type: "text", placeholder: "Anzeigename (optional)" });
  const type = h("select", {}, h("option", { value: "show" }, "Serie (Poster + Staffeln)"), h("option", { value: "movie" }, "Film (nur Poster)"));
  const st = h("div", { class: "status" });
  const go = h("button", { class: "btn primary", onclick: async e => {
    try {
      const r = await busy(e.currentTarget, () => api("/custom", { json: { world: S.world, folder: folder.value, type: type.value, title: title.value } }));
      m.close(); await loadItems(); renderGrid(); api("/status").then(s => { S.st.summary = s; updateHero(); });
      if (r.item.type === "movie") openPreview(r.item, "poster", it => { loadItems().then(renderGrid); }); else openItem(r.item.id);
    } catch (err) { st.className = "status bad"; st.textContent = "⚠ " + err.message; }
  } }, "Anlegen");
  const m = modal("Eigener Ordner", h("div", {},
    h("p", { class: "hint" }, "Für Titel, die weder in Plex noch in Sonarr/Radarr stehen. Der Ordnername muss genau so heißen, wie Kometa ihn erwartet (gleich wie der Medienordner)."),
    h("label", { class: "f" }, "Ordnername"), folder, h("label", { class: "f" }, "Typ"), type, h("label", { class: "f" }, "Anzeigename"), title, st), go);
  folder.focus();
}

/* ================================================== files / drag & drop === */
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
window.addEventListener("dragenter", e => { if (hasFiles(e)) { dragDepth++; $("#dropveil").classList.toggle("on", S.view === "dash" && !(e.target.closest && e.target.closest(".droptgt, .modalwrap"))); } });
window.addEventListener("dragleave", e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $("#dropveil").classList.remove("on"); } });
window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", async e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $("#dropveil").classList.remove("on");
  if (S.view === "dash") importFiles(await collectFiles(e.dataTransfer));
});

function makeDropTarget(el, cb) {
  let depth = 0;
  el.classList.add("droptgt");
  el.addEventListener("dragenter", e => { if (hasFiles(e)) { depth++; el.classList.add("dropping"); } });
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

function pickFiles(cb, multiple = true, directory = false) {
  if (!cb) {
    const m = modal("Hochladen", h("div", { class: "row wrap" },
      h("button", { class: "btn primary", onclick: () => { m.close(); pickFiles(f => importFiles(f), true); } }, "Bilder / ZIP wählen"),
      h("button", { class: "btn", onclick: () => { m.close(); pickFiles(f => importFiles(f), true, true); } }, "Ordner wählen"),
      h("p", { class: "hint", style: "width:100%" }, "Oder ziehe Dateien, Ordner und ZIPs einfach irgendwo ins Fenster.")));
    return;
  }
  const inp = $("#picker");
  inp.value = ""; inp.multiple = multiple;
  inp.webkitdirectory = directory;
  inp.accept = directory ? "" : "image/*,.zip";
  inp.onchange = () => cb([...inp.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
  inp.click();
}

/** "Set hochladen": ask whether a folder or a ZIP/images is meant (a folder cannot be picked in the same dialog). */
function pickSet(cb) {
  const m = modal("Set hochladen", h("div", {},
    h("p", { class: "hint", style: "margin-top:0" }, "Alle Bilder gehören zu dieser Serie. p5assets erkennt Poster und Staffeln an den Dateinamen und benennt sie Kometa-konform."),
    h("div", { class: "row wrap" },
      h("button", { class: "btn primary", onclick: () => { m.close(); pickFiles(cb, true, true); } }, icon("folderplus", 16), "Ordner wählen"),
      h("button", { class: "btn", onclick: () => { m.close(); pickFiles(cb, true); } }, icon("upload", 16), "ZIP / Bilder wählen"))));
}

/* ------------------------------------------------------------ import --- */
async function importFiles(files, itemId, onDone, item, review) {
  if (!files || !files.length) return;
  const fd = new FormData();
  if (itemId) fd.append("item_id", itemId); else fd.append("world", S.world);
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
  const used = res.entries.filter(e => e.item_id && e.slot && e.kind !== "ignore").map(e => e.slot);
  const twice = used.length !== new Set(used).size;      // two files for the same tile: let the user decide in the review
  if (review && item) return reviewImport(res, onDone, item);   // "Set hochladen": always the review dialog, series fixed
  if (itemId && allSet && !twice) {
    const clash = item ? [...new Set(used)].filter(k => item.slots[k] && item.slots[k].exists) : [];
    if (clash.length && !confirm(`${clash.length} Kachel${clash.length === 1 ? " ist" : "n sind"} schon belegt (${clash.slice(0, 6).map(k => slotLabel(k, "show")).join(", ")}${clash.length > 6 ? " …" : ""}) und ${clash.length === 1 ? "wird" : "werden"} überschrieben. Fortfahren?`)) {
      api("/import/" + res.session, { method: "DELETE" }).catch(() => {});
      return;
    }
    return applyImport(res.session, res.entries, onDone);
  }
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
    assignments.forEach(a => S.rain.add(a.item_id + "|" + a.slot));
    S.st.summary = r.summary; updateHero();
    if (onDone) onDone(await api("/items/" + assignments[0].item_id));
    await loadItems(); renderGrid();
  } catch (e) { toast(e.message, "bad"); }
}

function reviewImport(res, onDone, fixed) {
  const rows = res.entries.map(e => ({ ...e, use: !!e.item_id && e.kind !== "ignore" }));
  const list = h("div");
  const count = () => rows.filter(r => r.use && r.item_id).length;
  const apply = h("button", { class: "btn primary" });
  const refreshBtn = () => { const n = count(); apply.textContent = `${n} Asset${n === 1 ? "" : "s"} übernehmen`; apply.disabled = !n; };

  const fixedSlots = () => fixed ? ["poster", ...Array.from({ length: (fixed.max_season ?? 50) + 1 }, (_, n) => "season-" + n), ...Object.keys(fixed.slots).filter(k => !/^season-\d+$/.test(k) && k !== "poster")]
    .map(k => ({ slot: k, label: slotLabel(k, fixed.type) })) : null;
  const dupSlots = () => { const c = {}; rows.filter(r => r.use && r.item_id).forEach(r => { c[r.slot] = (c[r.slot] || 0) + 1; }); return c; };

  function draw() {
    const dups = dupSlots();
    fill(list, rows.map(r => {
      const sel = h("select", { onchange: e => { r.slot = e.target.value; if (fixed) draw(); } });
      const fillSlots = opts => fill(sel, opts.map(o => h("option", { value: o.slot, selected: o.slot === r.slot }, o.label)));
      const input = h("input", { type: "text", placeholder: "Titel suchen …", value: r.item_id ? `${r.item_title}${r.item_year ? " (" + r.item_year + ")" : ""}` : "" });
      const list2 = h("div", { class: "list", hidden: true });
      if (fixed && r.item_id) fillSlots(fixedSlots());
      else if (r.item_id) {
        fillSlots([{ slot: r.slot, label: slotLabel(r.slot, "show") }]);
        api(`/slots?world=${res.world}&q=` + encodeURIComponent(r.item_title || "")).then(os => { const o = os.find(x => x.id === r.item_id); if (o) fillSlots(o.slots); });
      }
      input.oninput = debounce(async () => {
        const opts = await api(`/slots?world=${res.world}&q=` + encodeURIComponent(input.value));
        list2.hidden = !opts.length;
        fill(list2, opts.map(o => h("div", { onclick: () => {
          r.item_id = o.id; r.item_title = o.title; r.item_year = o.year; r.use = true;
          const want = r.kind === "poster" ? "poster" : r.season != null ? "season-" + r.season : "poster";
          r.slot = o.slots.some(s => s.slot === want) ? want : "poster";
          input.value = `${o.title}${o.year ? " (" + o.year + ")" : ""}`; list2.hidden = true; fillSlots(o.slots); chk.checked = true; row.classList.remove("skip"); refreshBtn();
        } }, `${o.title}${o.year ? " (" + o.year + ")" : ""} `, h("span", { class: "pill" }, o.type === "movie" ? "Film" : "Serie"))));
      }, 200);
      input.onblur = () => setTimeout(() => (list2.hidden = true), 150);
      const chk = h("input", { type: "checkbox", checked: r.use, title: "Übernehmen", onchange: e => { r.use = e.target.checked; row.classList.toggle("skip", !r.use); refreshBtn(); if (fixed) draw(); } });
      const row = h("div", { class: "imp" + (r.use ? "" : " skip") },
        h("img", { src: `/api/import/${res.session}/${r.id}`, loading: "lazy" }),
        h("div", { class: "fn" }, r.name, r.kind === "ignore" ? h("div", {}, h("span", { class: "pill bad" }, "Hintergrund/Banner – ignoriert")) : null),
        fixed && r.item_id
          ? h("div", { class: "c3 fixedtitle" }, h("b", {}, fixed.title + (fixed.year ? ` (${fixed.year})` : "")), h("span", { class: "pill ok" }, "diese Serie"),
              r.use && fixed.slots[r.slot] && fixed.slots[r.slot].exists ? h("span", { class: "pill warn", title: "Für diese Kachel gibt es schon ein Bild" }, "ersetzt vorhandenes Bild") : null,
              r.use && dups[r.slot] > 1 ? h("span", { class: "pill bad", title: "Mehrere Dateien für dieselbe Kachel – nur die letzte bleibt" }, "doppelt belegt") : null)
          : h("div", { class: "ac c3" }, input, list2),
        h("div", { class: "c4" }, sel), chk);
      return row;
    }));
    refreshBtn();
  }
  draw();
  const m = modal(`${rows.length} Bilder erkannt`, h("div", {},
    h("p", { class: "hint" }, fixed ? `Alle Bilder gehören zu „${fixed.title}“. Die Zuordnung zu Poster und Staffeln erkennt p5assets an den Dateinamen – prüfe oder ändere sie. Die Dateien werden Kometa-konform benannt (poster, Season01 …).`
      : "Zuordnung automatisch anhand von Datei- und Ordnernamen (nur Titel dieser Welt). Prüfe oder ändere sie – die Dateien werden Kometa-konform benannt (poster, Season01 …)."), list),
    [apply, h("button", { class: "btn", onclick: () => { api("/import/" + res.session, { method: "DELETE" }); m.close(); } }, "Abbrechen"),
      h("span", { class: "spacer" }),
      h("span", { class: "hint" }, `${rows.filter(r => r.item_id).length} von ${rows.length} zugeordnet`)]);
  apply.onclick = async () => { m.close(); await applyImport(res.session, rows.filter(r => r.use && r.item_id), onDone); };
}

/* ======================================================= wizard / setup === */
const STEP_LABELS = { welcome: "Start", plex: "Plex", libs: "Bibliotheken", arr: "Sonarr/Radarr", worlds: "Welten", assign: "Zuordnung", apis: "Quellen", done: "Fertig" };
// "Zuordnung" only exists when there is more than one world
const stepList = () => ["welcome", "plex", "libs", "arr", "worlds", ...(cfg().worlds.length > 1 ? ["assign"] : []), "apis", "done"];

async function wizard(settings = false) {
  S.view = "wiz";
  S.wizSettings = settings;
  await loadState();
  S.settingsSig = settings ? scanSig() : null;     // remembered to decide on closing whether a rescan is needed
  S.step = settings ? "plex" : (stepList().includes(S.step) ? S.step : "welcome");
  S.reached = settings ? 99 : Math.max(S.reached || 0, stepList().indexOf(S.step));
  drawWiz();
}

function goStep(name) {
  const list = stepList();
  S.step = list.includes(name) ? name : "worlds";
  S.reached = Math.max(S.reached || 0, list.indexOf(S.step));
  drawWiz();
}
const stepNext = () => { const l = stepList(); goStep(l[Math.min(l.length - 1, l.indexOf(S.step) + 1)]); };
const stepPrev = () => { const l = stepList(); goStep(l[Math.max(0, l.indexOf(S.step) - 1)]); };

function drawWiz() {
  setAccent();
  const list = stepList();
  const idx = list.indexOf(S.step);
  const nav = (next, label = "Weiter", disabled = false) => h("div", { class: "row", style: "margin-top:26px" },
    idx > 0 && !(S.wizSettings && S.step === "plex") ? h("button", { class: "btn", onclick: stepPrev }, "Zurück") : null,
    S.wizSettings ? h("button", { class: "btn ghost", onclick: closeSettings }, "Schließen") : null,
    h("span", { class: "spacer" }),
    h("button", { class: "btn primary", disabled, onclick: next || stepNext }, label));
  const view = { welcome: wWelcome, plex: wPlex, libs: wLibs, arr: wArr, worlds: wWorlds, assign: wAssign, apis: wApis, done: wDone }[S.step];
  // labelled step navigation: in settings every step is reachable, during onboarding only the ones visited so far
  const shown = list.map((name, i) => ({ name, i })).filter(s => !(S.wizSettings && (s.name === "welcome" || s.name === "done")));
  fill(app, h("div", { class: "wiz" },
    h("div", { class: "logo" }, h("img", { class: "logoimg", src: "/static/icon.png", alt: "" }), h("span", {}, "assets", h("u", {}, "_"))),
    h("nav", { class: "stepnav" }, shown.map((s, n) => {
      const reachable = S.wizSettings || s.i <= (S.reached || 0);
      return h("button", { class: (s.name === S.step ? "on " : "") + (s.i < idx ? "done" : ""), disabled: !reachable, title: reachable ? `Zu „${STEP_LABELS[s.name]}“ springen` : "Erst die vorherigen Schritte abschließen",
        onclick: () => goStep(s.name) }, h("b", {}, String(n + 1).padStart(2, "0")), STEP_LABELS[s.name]);
    })),
    h("div", { class: "wcard" }, view(nav, cfg()))));
}

/** What influences the title list: if one of these changed while the settings were open, closing them rescans. */
function scanSig() {
  const c = cfg();
  return JSON.stringify({
    plex: [c.plex.url, c.plex.server_name],
    libs: c.libraries.map(l => [l.key, l.enabled, l.world]),
    worlds: c.worlds.map(w => [w.id, w.assets_path, w.search_depth, w.mirror_coming_soon]),
    arr: c.arr.map(a => [a.id, a.kind, a.name, a.url, a.world, a.hide_unmonitored]),
    assets: [c.assets.asset_folders, c.assets.ignore_specials],
    custom: c.custom.length,
  });
}

async function closeSettings() {
  const before = S.settingsSig;
  await loadState(); dashboard();
  if (before != null && before !== scanSig()) { toast("Einstellungen geändert – Bibliotheken werden neu eingelesen", "ok"); doScan(); }
  S.settingsSig = null;
}

const wWelcome = nav => h("div", {},
  h("div", { class: "big" }, "🖼️"),
  h("h1", {}, "Willkommen bei p5assets"),
  h("p", { class: "lead" }, "Behalte den Überblick über fehlende Poster und Staffelcover deiner Plex-Bibliothek – und ersetze sie in Sekunden per Drag & Drop. Alle Dateien werden automatisch Kometa-konform benannt."),
  [["🔗", "Plex verbinden", "per Plex-Login oder Adresse + Token"], ["📚", "Bibliotheken wählen", "Filme und Serien"],
   ["📡", "Optional: Sonarr & Radarr", "auch Titel und Staffeln, die noch nicht in Plex sind"],
   ["🌐", "Welten & Assets-Ordner", "z. B. HD und 4K getrennt, jede Welt mit eigenem Ordner und eigener Farbe"],
   ["🔑", "Optional: TMDb, TVDB, fanart.tv", "zum Herunterladen fehlender Poster"]]
    .map(([i, t, s]) => h("div", { class: "opt", style: "cursor:default" }, i, h("div", {}, t, h("small", {}, s)))),
  nav(null, "Los geht's"));

function statusEl() { return h("div", { class: "status" }); }
function setStatus(el, ok, msg) { el.className = "status " + (ok ? "ok" : "bad"); el.textContent = (ok ? "✓ " : "⚠ ") + msg; }

/** Address input split into protocol (dropdown), host (typed by hand) and port (own field with an example). */
function urlFields(initial, examplePort, onChange) {
  const parse = u => { let proto = "http", host = "", port = ""; if (u) { try { const x = new URL(u.includes("://") ? u : "http://" + u); proto = x.protocol.replace(":", ""); host = x.hostname; port = x.port; } catch { /* ignore */ } } return { proto, host, port }; };
  const p = parse(initial);
  const change = () => onChange && onChange();
  const proto = h("select", { style: "width:128px;flex:none", title: "Protokoll", onchange: change }, ["http", "https"].map(v => h("option", { value: v, selected: p.proto === v }, v + "://")));
  const host = h("input", { type: "text", value: p.host, placeholder: "IP-Adresse oder Hostname", onchange: change });
  const port = h("input", { type: "text", inputMode: "numeric", value: p.port, placeholder: examplePort, title: `Leer = ${examplePort}`, style: "width:110px;flex:none", onchange: change });
  return {
    el: h("div", { class: "row" }, proto, h("div", { class: "grow" }, host), h("span", {}, ":"), port),
    get: () => host.value.trim() ? `${proto.value}://${host.value.trim()}:${port.value.trim() || examplePort}` : "",
    set: u => { const q = parse(u); proto.value = q.proto; host.value = q.host; port.value = q.port; },
  };
}

function wPlex(nav, c) {
  const connected = !!c.plex.token && !!c.plex.url;
  const addr = urlFields(c.plex.url, "32400");
  const token = h("input", { type: "password", placeholder: "X-Plex-Token", value: c.plex.token });
  const st = statusEl(); const serverList = h("div");
  if (connected) { st.className = "status ok"; st.textContent = `✓ Verbunden mit ${c.plex.server_name || c.plex.url}`; }
  const connect = async (btn, body) => {
    try {
      const r = await busy(btn, () => api("/plex/connect", { json: body }));
      setStatus(st, true, `Verbunden mit ${r.server.name} (${r.libraries.length} Bibliotheken)`);
      addr.set(r.url); token.value = "********"; await loadState(); nextBtn.disabled = false; fill(serverList);
    } catch (e) { setStatus(st, false, e.message); }
  };
  const login = h("button", { class: "btn primary", onclick: async () => {
    const win = window.open("", "_blank");
    try {
      const pin = await api("/plex/pin", { method: "POST" });
      if (win) win.location = pin.auth_url; else toast("Popup blockiert – bitte erlauben", "bad");
      fill(st, h("span", { class: "spin" }), " Warte auf Plex-Login …"); st.className = "status";
      const t0 = Date.now();
      while (Date.now() - t0 < 5 * 60e3) {
        await new Promise(r => setTimeout(r, 1500));
        const r = await api("/plex/pin/" + pin.id);
        if (r.ready) {
          if (win) win.close();
          if (!r.servers.length) return setStatus(st, false, "Keine Server in diesem Account gefunden");
          st.textContent = ""; st.className = "status";
          fill(serverList, h("label", { class: "f" }, "Server wählen"), r.servers.map(s => h("div", { class: "srv", onclick: ev => connect(ev.currentTarget, { token: s.token, connections: s.connections }) },
            h("b", {}, s.name), h("div", { class: "hint" }, s.connections.map(x => x.uri).join("  ·  ")))));
          return;
        }
      }
      setStatus(st, false, "Zeitüberschreitung beim Login");
    } catch (e) { setStatus(st, false, e.message); }
  } }, "Mit Plex anmelden");
  const nextBtn = h("button", { class: "btn primary", disabled: !connected, onclick: stepNext }, "Weiter");
  const n = nav(null); n.lastChild.replaceWith(nextBtn);
  return h("div", {}, h("h1", {}, "Plex verbinden"), h("p", { class: "lead" }, "Melde dich bei Plex an oder gib die Server-Adresse und den Token manuell ein."),
    h("div", { class: "row" }, login), serverList,
    h("label", { class: "f" }, "… oder manuell"),
    h("label", { class: "f", style: "margin-top:4px" }, "Adresse (Protokoll · IP / Hostname · Port)"), addr.el,
    h("label", { class: "f" }, "Token"),
    h("div", { class: "row" }, h("div", { class: "grow" }, token),
      h("button", { class: "btn", onclick: e => connect(e.currentTarget, { url: addr.get(), token: token.value }) }, "Testen")),
    st, n);
}

function wLibs(nav, c) {
  const libs = c.libraries.map(l => ({ ...l }));
  const intervals = [[0, "Nur manuell"], [15, "alle 15 Minuten"], [60, "stündlich"], [360, "alle 6 Stunden"], [1440, "täglich"]];
  return h("div", {}, h("h1", {}, "Bibliotheken"), h("p", { class: "lead" }, "Welche Plex-Bibliotheken sollen überwacht werden?"),
    libs.length ? libs.map(l => h("label", { class: "opt" }, h("input", { type: "checkbox", checked: l.enabled, onchange: e => { l.enabled = e.target.checked; savePatch({ libraries: libs }); } }),
      h("div", {}, l.title, h("small", {}, l.type === "movie" ? "Filme" : "Serien")))) : h("div", { class: "status bad" }, "Keine Film-/Serienbibliotheken gefunden."),
    h("label", { class: "opt" }, h("input", { type: "checkbox", checked: c.plex.upload_to_plex, onchange: e => savePatch({ plex: { upload_to_plex: e.target.checked } }) }),
      h("div", {}, "Neue Poster zusätzlich direkt in Plex setzen", h("small", {}, "Kometa überschreibt sie beim nächsten Lauf ohnehin – nützlich für sofortige Anzeige"))),
    h("label", { class: "f" }, "Automatischer Scan"),
    h("select", { onchange: e => savePatch({ scan_interval_minutes: +e.target.value }) },
      intervals.map(([v, l]) => h("option", { value: v, selected: c.scan_interval_minutes === v }, l))),
    h("p", { class: "hint" }, "p5assets gleicht Plex, Sonarr/Radarr und die Assets-Ordner im Hintergrund ab und aktualisiert die Liste der fehlenden Poster. Dabei wird nichts heruntergeladen oder verändert."),
    nav());
}

function wArr(nav, c) {
  const list = c.arr.map(a => ({ ...a }));
  const box = h("div");
  const persist = () => savePatch({ arr: list });
  function draw() {
    fill(box, list.map((a, i) => {
      const example = a.kind === "sonarr" ? "8989" : "7878";
      const name = h("input", { type: "text", value: a.name, placeholder: "Name, z. B. Sonarr 4K", onchange: e => { a.name = e.target.value; persist(); } });
      const addr = urlFields(a.url, example, () => { a.url = addr.get(); persist(); });
      const key = h("input", { type: "password", value: a.api_key, placeholder: "API-Key (Einstellungen → Allgemein)", onchange: e => { a.api_key = e.target.value; persist(); } });
      const st = statusEl();
      return h("div", { class: "apirow" },
        h("div", { class: "row" }, h("h3", { class: "grow" }, a.kind === "sonarr" ? "📺 Sonarr" : "🎬 Radarr"),
          h("button", { class: "btn sm danger", onclick: () => { list.splice(i, 1); persist(); draw(); } }, "Entfernen")),
        h("label", { class: "f" }, "Name"), name, h("label", { class: "f" }, "Adresse (Protokoll · IP / Hostname · Port)"), addr.el, h("label", { class: "f" }, "API-Key"), key,
        h("label", { class: "opt", style: "margin-top:12px" }, h("input", { type: "checkbox", checked: !!a.hide_unmonitored, onchange: e => { a.hide_unmonitored = e.target.checked; persist(); } }),
          h("div", {}, "Nicht überwachte Titel ausblenden", h("small", {}, "Nur Titel anzeigen, die in " + (a.kind === "sonarr" ? "Sonarr" : "Radarr") + " überwacht werden"))),
        h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: async e => {
          const btn = e.currentTarget;
          a.name = name.value; a.url = addr.get(); a.api_key = key.value; await persist();
          try { const r = await busy(btn, () => api("/arr/test", { json: { id: a.id, kind: a.kind, url: a.url, api_key: a.api_key } })); setStatus(st, true, `${r.app} ${r.version}`); }
          catch (err) { setStatus(st, false, err.message); }
        } }, "Testen"), st));
    }));
  }
  const add = kind => { const n = list.filter(x => x.kind === kind).length; list.push({ id: uid("a"), kind, name: (kind === "sonarr" ? "Sonarr" : "Radarr") + (n ? " " + (n + 1) : ""), url: "", api_key: "" }); draw(); };
  draw();
  return h("div", {}, h("h1", {}, "Sonarr & Radarr"),
    h("p", { class: "lead" }, "Optional: Mit Sonarr und Radarr kennt p5assets auch Titel und Staffeln, die noch nicht in Plex sind – und kann dafür schon Poster ablegen. Du kannst beliebig viele Instanzen hinzufügen (z. B. HD und 4K). Ein leeres Portfeld nutzt den Beispielport."),
    box, h("div", { class: "row wrap" }, h("button", { class: "btn", onclick: () => add("sonarr") }, "＋ Sonarr"), h("button", { class: "btn", onclick: () => add("radarr") }, "＋ Radarr")),
    nav());
}

/** Priority list of poster languages for one world: drag to reorder, arrows, remove, add from a dropdown. */
function langList(w, persist) {
  const byCode = Object.fromEntries(S.langs.map(l => [l.code, l]));
  const fmt = code => { const l = byCode[code]; if (!l) return code; return code === "xx" ? "Textless (No Text)" : l.native && l.native !== l.name ? `${l.name} (${l.native})` : l.name; };
  const box = h("div", { class: "langlist" });
  let dragFrom = null;
  const move = (from, to) => { if (to < 0 || to >= w.languages.length || from === to) return; const [x] = w.languages.splice(from, 1); w.languages.splice(to, 0, x); persist(); draw(); };
  function draw() {
    const add = h("select", { onchange: e => { if (e.target.value) { w.languages.push(e.target.value); persist(); draw(); } } },
      h("option", { value: "" }, "＋ Add Language"), S.langs.filter(l => !w.languages.includes(l.code)).map(l => h("option", { value: l.code }, `${l.code} • ${fmt(l.code)}`)));
    fill(box, w.languages.map((code, i) => {
      const row = h("div", { class: "langrow", draggable: true,
        ondragstart: e => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", code); row.classList.add("dragging"); },
        ondragend: () => row.classList.remove("dragging"),
        ondragover: e => { if (dragFrom !== null) { e.preventDefault(); row.classList.add("over"); } },
        ondragleave: () => row.classList.remove("over"),
        ondrop: e => { e.preventDefault(); row.classList.remove("over"); if (dragFrom !== null) { const f = dragFrom; dragFrom = null; move(f, i); } } },
        h("span", { class: "grip", title: "Ziehen zum Sortieren" }, "⠿"), h("span", { class: "num" }, i + 1),
        h("span", { class: "lname" }, h("b", {}, code), " • ", fmt(code)),
        h("button", { class: "btn sm ghost", title: "Nach oben", disabled: i === 0, onclick: () => move(i, i - 1) }, "▲"),
        h("button", { class: "btn sm ghost", title: "Nach unten", disabled: i === w.languages.length - 1, onclick: () => move(i, i + 1) }, "▼"),
        h("button", { class: "btn sm ghost danger", title: "Entfernen", onclick: () => { w.languages.splice(i, 1); persist(); draw(); } }, "✕"));
      return row;
    }), w.languages.length ? null : h("div", { class: "hint" }, "Keine Sprache gewählt – die Online-Suche zeigt dann alles ungeordnet."), add);
  }
  draw();
  return box;
}

function wWorlds(nav, c) {
  const worlds = c.worlds.map(w => ({ ...w }));
  const persist = () => savePatch({ worlds });
  const checks = [];
  const mkOpt = (key, title, sub) => h("label", { class: "opt" }, h("input", { type: "checkbox", checked: c.assets[key], onchange: e => savePatch({ assets: { [key]: e.target.checked } }) }), h("div", {}, title, h("small", {}, sub)));

  const worldCard = (w, i) => {
    const name = h("input", { type: "text", value: w.name, onchange: async e => { w.name = e.target.value; await persist(); drawWiz(); } });
    const path = h("input", { type: "text", value: w.assets_path, onchange: e => { w.assets_path = e.target.value; persist(); check(); } });
    const hue = h("select", { onchange: async e => { w.hue = +e.target.value; await persist(); drawWiz(); } },
      HUES.map(([v, label]) => h("option", { value: v, selected: w.hue === v }, label)));
    const st = statusEl(), fsBox = h("div");
    const check = async () => {
      const r = await api("/path/check", { json: { path: path.value } });
      if (!r.exists) setStatus(st, false, "Ordner existiert nicht (im Container gemountet?)");
      else if (!r.writable) setStatus(st, false, "Ordner ist nicht beschreibbar");
      else setStatus(st, true, `Ordner bereit (${r.entries} Einträge)`);
      return r.exists && r.writable;
    };
    checks.push(async () => { w.assets_path = path.value; w.name = name.value; return check(); });
    const browse = async p => {
      try {
        const r = await api("/fs?path=" + encodeURIComponent(p));
        path.value = r.path; w.assets_path = r.path; persist();
        fill(fsBox, h("div", { class: "fs" }, h("div", { onclick: () => browse(r.parent) }, "⬑ .."), r.dirs.map(d => h("div", { onclick: () => browse(r.path.replace(/\/$/, "") + "/" + d) }, "📁 " + d))));
        check();
      } catch (e) { setStatus(st, false, e.message); }
    };
    if (w.assets_path) check();
    return h("div", { class: "apirow w hue", style: `--c:${worldColor(w)};--h:${w.hue ?? 140}` },
      h("div", { class: "row" }, h("span", { class: "swatch" }), h("h3", { class: "grow" }, "Welt ", i + 1),
        worlds.length > 1 ? h("button", { class: "btn sm danger", onclick: async () => { worlds.splice(i, 1); await persist(); drawWiz(); } }, "Entfernen") : null),
      h("label", { class: "f" }, "Name"), name,
      h("label", { class: "f" }, "Farbe"), hue,
      h("label", { class: "f" }, "Assets-Ordner (im Container)"),
      h("div", { class: "row" }, h("div", { class: "grow" }, path), h("button", { class: "btn", onclick: () => browse(path.value || "/") }, "📂 Durchsuchen")),
      fsBox, st,
      h("label", { class: "opt", style: "margin-top:14px" }, h("input", { type: "checkbox", checked: w.mirror_coming_soon !== false, onchange: e => { w.mirror_coming_soon = e.target.checked; persist(); } }),
        h("div", {}, "Coming-Soon-Poster auch im echten Film-Ordner ablegen", h("small", {}, "Gilt nur für Ordner mit {edition-Coming Soon}. Andere Editionen wie {edition-black&white} bleiben getrennt."))),
      h("label", { class: "f" }, "Bevorzugte Sprache der Poster (Reihenfolge = Priorität)"), langList(w, persist));
  };

  const next = async () => {
    if (worlds.some(w => !w.name.trim())) return toast("Jede Welt braucht einen Namen", "bad");
    const res = await Promise.all(checks.map(f => f()));
    if (res.some(ok => !ok)) return toast("Mindestens ein Assets-Ordner ist nicht erreichbar oder nicht beschreibbar", "bad");
    await persist(); await loadState(); stepNext();
  };
  return h("div", {}, h("h1", {}, "Welten & Assets-Ordner"),
    h("p", { class: "lead" }, "Eine Welt ist eine getrennte Sammlung mit eigenem Assets-Ordner und eigener Farbe – z. B. „HD“ und „4K“. Für ein einfaches Setup reicht eine Welt. Jeder Ordner muss im Container eingebunden sein (Unraid: „Add another Path“). Bei mehreren Welten ordnest du Bibliotheken und Sonarr/Radarr im nächsten Schritt zu."),
    worlds.map(worldCard),
    h("button", { class: "btn", onclick: async () => { worlds.push({ id: uid("w"), name: `Welt ${worlds.length + 1}`, assets_path: "/assets" }); await persist(); await loadState(); drawWiz(); } }, "＋ Weitere Welt"),
    h("label", { class: "f" }, "Struktur"),
    mkOpt("asset_folders", "Ein Ordner pro Titel (asset_folders: true)", "Ordner/poster.jpg, Ordner/Season01.jpg – Kometa-Standard"),
    mkOpt("convert_to_jpg", "PNG/WebP immer nach JPG konvertieren", "Standardmäßig bleiben JPG und PNG unverändert"),
    mkOpt("ignore_specials", "Specials (Season00) nicht überwachen", "Dann gelten fehlende Specials-Poster nicht als fehlend"),
    nav(next));
}

/** Assignment with bubbles: chips (libraries / Sonarr / Radarr instances) are dragged from their source bubble into a world bubble. */
function wAssign(nav, c) {
  const worlds = c.worlds;
  const libs = c.libraries.map(l => ({ ...l }));
  const arr = c.arr.map(a => ({ ...a }));
  const chips = [
    ...libs.filter(l => l.enabled).map(l => ({ id: "lib:" + l.key, kind: "plex", obj: l, label: l.title, sub: l.type === "movie" ? "Filme" : "Serien" })),
    ...arr.map(a => ({ id: "arr:" + a.id, kind: a.kind, obj: a, label: a.name || (a.kind === "sonarr" ? "Sonarr" : "Radarr"), sub: a.url ? a.url.replace(/^https?:\/\//, "") : "" })),
  ];
  const sources = [["plex", "Plex", "📚 Bibliotheken"], ["sonarr", "Sonarr", "📺 Instanzen"], ["radarr", "Radarr", "🎬 Instanzen"]];
  const placed = ch => !!ch.obj.world_set && worlds.some(w => w.id === ch.obj.world);
  let picked = null, dragged = null;
  const persist = () => {
    for (const ch of chips) if (!placed(ch)) ch.obj.world = worlds[0].id;
    savePatch({ libraries: libs, arr });
  };
  const place = (ch, worldId) => { ch.obj.world_set = true; ch.obj.world = worldId; picked = dragged = null; persist(); draw(); };
  const back = ch => { ch.obj.world_set = false; ch.obj.world = worlds[0].id; picked = dragged = null; persist(); draw(); };

  const chipEl = ch => h("div", { class: "chip2" + (picked === ch ? " picked" : ""), draggable: true, title: "Ziehen oder antippen",
    ondragstart: e => { dragged = ch; e.dataTransfer.setData("text/plain", ch.id); e.dataTransfer.effectAllowed = "move"; },
    onclick: e => { e.stopPropagation(); picked = picked === ch ? null : ch; draw(); } },
    ch.label, ch.sub ? h("small", {}, ch.sub) : null);

  const dropOn = (el, onDrop, accepts) => {
    el.addEventListener("dragover", e => { if (dragged && accepts(dragged)) { e.preventDefault(); el.classList.add("over"); } });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", e => { e.preventDefault(); el.classList.remove("over"); if (dragged && accepts(dragged)) onDrop(dragged); });
    el.addEventListener("click", () => { if (picked && accepts(picked)) onDrop(picked); });
  };

  const srcRow = h("div", { class: "srcrow" }), worldRow = h("div", { class: "worldrow" });
  function draw() {
    fill(srcRow, sources.map(([kind, title, sub]) => {
      const mine = chips.filter(ch => ch.kind === kind);
      if (!mine.length) return null;
      const open = mine.filter(ch => !placed(ch));
      const b = h("div", { class: "bubble target", title: "Hierher zurückziehen" },
        h("h4", {}, title, h("small", { style: "text-transform:none;letter-spacing:0" }, `  ${sub}`)),
        open.length ? h("div", { class: "chips2" }, open.map(chipEl)) : h("div", { class: "hintline" }, "Alles zugeordnet"));
      dropOn(b, back, ch => ch.kind === kind && placed(ch));
      return b;
    }));
    fill(worldRow, worlds.map(w => {
      const mine = chips.filter(ch => placed(ch) && ch.obj.world === w.id);
      const b = h("div", { class: "bubble world target hue", style: `--h:${w.hue ?? 140}`, title: "Hier ablegen" },
        h("h4", {}, w.name, h("small", { style: "text-transform:none;letter-spacing:0;color:var(--muted)" }, `  ${w.assets_path}`)),
        mine.length ? h("div", { class: "chips2" }, mine.map(chipEl)) : h("div", { class: "hintline" }, "Chips hier hineinziehen"));
      dropOn(b, ch => place(ch, w.id), () => true);
      return b;
    }));
  }
  draw();
  const unplaced = () => chips.filter(ch => !placed(ch)).length;
  const next = () => {
    if (unplaced() && !confirm(`${unplaced()} Eintrag/Einträge sind noch nicht zugeordnet und landen in „${worlds[0].name}“. Fortfahren?`)) return;
    persist(); stepNext();
  };
  return h("div", {}, h("h1", {}, "Zuordnung"),
    h("p", { class: "lead" }, "Ziehe Bibliotheken und Instanzen aus den Quellen in die Welt, in der sie erscheinen sollen. Antippen geht auch: erst den Eintrag, dann die Welt. Nicht zugeordnete Einträge landen in der ersten Welt."),
    h("label", { class: "f" }, "Quellen"), srcRow, h("label", { class: "f" }, "Welten"), worldRow, nav(next));
}

function wApis(nav, c) {
  const a = c.apis;
  const row = (id, name, url, extra) => {
    const key = h("input", { type: "password", value: a[id], placeholder: "API Key" });
    const pin = extra ? h("input", { type: "password", value: a.tvdb_pin, placeholder: "PIN (nur bei Subscriber-Keys)", style: "margin-top:8px" }) : null;
    const st = statusEl();
    const persist = () => savePatch({ apis: { [id]: key.value, ...(pin ? { tvdb_pin: pin.value } : {}) } });
    key.onchange = persist; if (pin) pin.onchange = persist;
    return h("div", { class: "apirow" }, h("h3", {}, name), h("div", { class: "hint" }, h("a", { href: url, target: "_blank", rel: "noopener" }, "Key anfordern ↗")),
      h("div", { class: "row" }, h("div", { class: "grow" }, key, pin), h("button", { class: "btn", onclick: async e => {
        const btn = e.currentTarget;
        await persist();
        try { await busy(btn, () => api("/test/" + id, { json: { key: key.value, pin: pin ? pin.value : "" } })); setStatus(st, true, "Funktioniert"); }
        catch (err) { setStatus(st, false, err.message); }
      } }, "Testen")), st);
  };
  return h("div", {}, h("h1", {}, "Poster-Quellen"), h("p", { class: "lead" }, "Optional: Mit API-Keys kann p5assets fehlende Poster direkt online suchen. Du kannst diesen Schritt überspringen."),
    row("tmdb", "TMDb", "https://www.themoviedb.org/settings/api"),
    row("tvdb", "TheTVDB", "https://thetvdb.com/dashboard/account/apikey", true),
    row("fanart", "fanart.tv", "https://fanart.tv/get-an-api-key/"),
    h("p", { class: "hint" }, "Die bevorzugte Sprache der Poster stellst du pro Welt unter „Welten“ ein."),
    nav(null, "Weiter"));
}

function wDone() {
  return h("div", { style: "text-align:center" }, h("div", { class: "big" }, "🚀"), h("h1", {}, "Alles bereit!"),
    h("p", { class: "lead" }, "p5assets scannt jetzt deine Bibliotheken und zeigt dir, was fehlt."),
    h("button", { class: "btn primary", onclick: async () => { await api("/onboarding/finish", { method: "POST" }); await loadState(); S.filter = "all"; dashboard(); } }, "Scan starten"),
    h("div", { style: "margin-top:16px" }, h("button", { class: "btn ghost", onclick: stepPrev }, "Zurück")));
}

boot();
