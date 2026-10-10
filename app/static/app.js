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

function toast(msg, kind = "", action = null) {
  const t = h("div", { class: "toast " + kind }, msg,
    action ? h("button", { class: "tbtn", onclick: async () => { t.remove(); await action.fn(); } }, action.label) : null);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), action ? 9000 : kind === "bad" ? 6000 : 3200);
}
/** "Ersetzt ✓ [Rückgängig]": the previous poster is in the trash for 30 days, one tap brings it back. */
function undoToast(msg, r, draw) {
  toast(msg, "ok", r && r.trash ? { label: "Rückgängig", fn: async () => {
    try {
      const res = await api(`/trash/${r.trash}/restore`, { method: "POST" });
      toast("Wiederhergestellt ✓", "ok");
      if (res.item) { S.rain.add(res.item.id + "|poster"); draw ? draw(res.item) : loadItems().then(renderGrid); }
      else loadItems().then(renderGrid);
    } catch (e) { toast(e.message, "bad"); }
  } } : null);
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
  folder: [{ d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" }],
  // two arrows chasing each other in a circle (rotates while a scan is running)
  sync: [{ d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }, { d: "M21 3v5h-5" }, { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }, { d: "M8 16H3v5" }],
  terminal: [{ d: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" }, { d: "M6.5 9.5l3 2.5-3 2.5" }, { d: "M12.5 15.5h4.5", cls: "cur" }],
  list: [{ d: "M8 6h13" }, { d: "M8 12h13" }, { d: "M8 18h13" }, { d: "M3 6h.01" }, { d: "M3 12h.01" }, { d: "M3 18h.01" }],
  gear: [{ d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }, { c: [12, 12, 3] }],
  back: [{ d: "M19 12H5" }, { d: "M12 19l-7-7 7-7" }],
  file: [{ d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" }, { d: "M14 2v6h6" }, { d: "M8 13h8" }, { d: "M8 17h6" }],
  search: [{ c: [11, 11, 8] }, { d: "M21 21l-4.3-4.3" }],
  download: [{ d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }, { d: "M7 10l5 5 5-5" }, { d: "M12 15V3" }],
  undo: [{ d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }, { d: "M3 3v5h5" }],
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
const S = { st: null, langs: [], items: [], total: 0, filter: "all", q: "", lib: "", letter: null, letters: {}, allTotal: 0, req: 0, pending: 0, ctl: null, stats: null, nopost: false, io: null, hist: [], dimTries: 0, world: "", poll: null, step: "", reached: 0, rain: new Set(), view: "" };
const cfg = () => S.st.config;
const curWorld = () => cfg().worlds.find(w => w.id === S.world) || cfg().worlds[0];
const weakDefault = { wOn: true, w: 1000, rOn: true };
const weakCfg = () => { try { return { ...weakDefault, ...JSON.parse(localStorage.getItem("p5weak") || "{}") }; } catch { return { ...weakDefault }; } };
const saveWeak = v => { try { localStorage.setItem("p5weak", JSON.stringify(v)); } catch { /* private mode */ } };
/** A poster is "weak" if it is narrower than the chosen width and/or not 2:3 (same rule as the server's). */
function weakSlot(it) {
  const c = weakCfg();
  for (const [k, sl] of Object.entries(it.slots || {})) {
    if (sl.extra || !sl.exists || !sl.w) continue;
    if ((c.wOn && sl.w < c.w) || (c.rOn && Math.abs(sl.w / sl.h - 2 / 3) > 0.04)) return { key: k, w: sl.w, h: sl.h };
  }
  return null;
}
const scopeStats = () => S.stats || worldStats();
const worldStats = () => (S.st.summary.worlds || {})[S.world] || { items: 0, slots: 0, missing: 0, complete_items: 0 };

const worldColor = w => { const hue = w && w.hue != null ? w.hue : 140, t = themeOf(hue); return `hsl(${hue} ${t.sat}% ${t.lit}%)`; };
const hueVars = w => { const hue = w && w.hue != null ? w.hue : 140, t = themeOf(hue); return `--h:${hue};--sat:${t.sat}%;--lit:${t.lit}%`; };
function setAccent() {
  const w = curWorld();
  const hue = w && w.hue != null ? w.hue : 140, t = themeOf(hue), st = document.documentElement.style;
  st.setProperty("--h", hue); st.setProperty("--sat", t.sat + "%"); st.setProperty("--lit", t.lit + "%");
}

async function loadState() {
  S.st = await api("/state");
  const saved = (() => { try { return localStorage.getItem("p5world"); } catch { return null; } })();
  if (!cfg().worlds.some(w => w.id === S.world)) S.world = cfg().worlds.some(w => w.id === saved) ? saved : cfg().worlds[0].id;
  setAccent();
}
async function savePatch(patch) { const r = await api("/config", { json: { patch } }); S.st.config = r; return r; }

const weakParams = () => { const c = weakCfg(), p = {}; if (c.wOn) p.weak_w = c.w; if (c.rOn) p.weak_r = "1"; return p; };
const AZ_MIN = 150;   // from this many titles on the list is split by first letter instead of one endless page
async function loadItems(append = false) {
  // S.lib is "lib:<Plex library>" or "src:<Sonarr/Radarr instance>"
  const id = ++S.req, q = S.q.trim();
  if (S.ctl) S.ctl.abort();                   // typing fast: the answer to an older keystroke is not needed any more
  const ctl = S.ctl = new AbortController(), sig = { signal: ctl.signal };
  S.pending++;
  try { return await loadItemsInner(append, id, q, sig); }
  catch (e) { if (e.name === "AbortError") return; throw e; }
  finally { S.pending--; }
}
async function loadItemsInner(append, id, q, sig) {
  // S.lib: "" = all | "type:movie|show" = all movie/series sources combined | "lib:<Plex library>" | "src:<Sonarr/Radarr instance>"
  const scope = { type: S.lib.startsWith("type:") ? S.lib.slice(5) : "", library: S.lib.startsWith("lib:") ? S.lib.slice(4) : "", source: S.lib.startsWith("src:") ? S.lib.slice(4) : "" };
  const query = (letter, limit, offset) => new URLSearchParams({ world: S.world, q: S.q, filter: S.filter, letter, ...scope,
    ...(S.filter === "comingsoon" && S.nopost ? { nopost: "1" } : {}), ...weakParams(), offset, limit });
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
      if (S.view === "dash") { updateHero(); if (was && !S.st.summary.running) { S.dimTries = 0; await loadItems(); renderGrid(); checkAlerts(); loadHistory(); } }
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
      h("a", { href: "#", onclick: e => { e.preventDefault(); checkNews(true); } }, "Neuigkeiten"),
      h("a", { href: "#", onclick: e => { e.preventDefault(); location.reload(); } }, "Neu laden"),
      link("GitHub ↗", v.repo));
  } catch { /* footer is optional */ }
}

/* ----------------------------------------------- trash / orphans / cleanup --- */
/** "1 Titel" / "3 Titel": the number with the right singular or plural form. */
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** Verb form that goes with a count: "1 Kachel fehlt", "3 Kacheln fehlen". */
const fehlt = n => n === 1 ? "fehlt" : "fehlen";
const fmtBytes = b => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const fmtWhen = ts => new Date(ts * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const REASON = { replace: "ersetzt", delete: "gelöscht", orphan: "verwaister Ordner", restore: "vor Wiederherstellung" };

/** "✕" that clears a search field with one tap (only visible while there is text); Esc in the field does the same. */
function clearBtn(input) {
  const btn = h("button", { type: "button", class: "sclear", "aria-label": "Suche leeren", title: "Suche leeren", hidden: !input.value,
    onclick: () => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); btn.hidden = true; input.focus(); } }, "✕");
  input.addEventListener("input", () => { btn.hidden = !input.value; });
  input.addEventListener("keydown", e => { if (e.key === "Escape" && input.value) { e.stopPropagation(); btn.click(); } });
  return btn;
}
const normText = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const LIST_SEARCH_MIN = 8;      // a search field is only worth it for longer lists
/** Small search field for a list inside a window; calls onInput(normalized text) while typing. */
function listSearch(onInput) {
  const input = h("input", { type: "search", placeholder: "Suchen …", autocomplete: "off", enterkeyhint: "search", oninput: e => onInput(normText(e.target.value).trim()) });
  return h("div", { class: "search lsearch" }, icon("search", 16), input, clearBtn(input));
}

/** "Papierkorb & Aufräumen": the trash (replaced/deleted posters, 30 days) and folders that belong to no title any more. */
function openCleanup(initial = "trash") {
  let tab = initial;
  const body = h("div"), tabs = h("div", { class: "tabs", style: "position:static" });
  const m = modal("Papierkorb & Aufräumen", h("div", {}, tabs, body));
  const slotNames = g => (g.slot || "").split(", ").filter(Boolean).map(k => { try { return slotLabel(k, g.type || "show"); } catch { return k; } }).join(", ");
  const refresh = () => { loadItems().then(renderGrid); api("/status").then(r => { S.st.summary = r; updateHero(); }); };

  async function drawTrash() {
    fill(body, h("div", { class: "empty", style: "padding:30px" }, h("span", { class: "spin" })));
    const r = await api("/trash"), gs = r.groups;
    const total = gs.reduce((a, g) => a + g.size, 0);
    const list = h("div"), count = h("span", { class: "hint", style: "margin:0" });
    const rowEl = g => {
      const file = g.files.find(f => !f.dir);
      const days = Math.max(0, Math.ceil((g.expires * 1000 - Date.now()) / 86400000));
      const slots = slotNames(g);
      return h("div", { class: "trow" },
        file ? h("img", { loading: "lazy", alt: "", src: `/api/trash/${g.id}/file/${file.n}` }) : h("div", { class: "noth" }, g.files.some(f => f.dir) ? "📁" : "＋"),
        h("div", { class: "grow" }, h("b", {}, g.title || "—"), h("div", { class: "hint", style: "margin:0" }, [slots, REASON[g.reason] || g.reason].filter(Boolean).join(" · ")),
          h("div", { class: "hint", style: "margin:0" }, `${fmtWhen(g.ts)} · ${fmtBytes(g.size)} · noch ${pl(days, "Tag", "Tage")}`)),
        h("button", { class: "btn sm primary", onclick: async e => {
          try { await busy(e.currentTarget, () => api(`/trash/${g.id}/restore`, { method: "POST" })); toast("Wiederhergestellt ✓", "ok"); refresh(); drawTrash(); }
          catch (err) { toast(err.message, "bad"); }
        } }, "Wiederherstellen"),
        h("button", { class: "btn sm danger", title: "Endgültig löschen", onclick: async () => { await api("/trash/" + g.id, { method: "DELETE" }); drawTrash(); } }, icon("trash", 14)));
    };
    const items = gs.map(g => ({ el: rowEl(g), hay: normText([g.title, slotNames(g), REASON[g.reason] || g.reason, ...g.files.map(f => f.orig)].join(" ")) }));
    const apply = q => {
      const vis = items.filter(i => !q || i.hay.includes(q));
      fill(list, vis.length ? vis.map(i => i.el) : h("div", { class: "empty", style: "padding:30px" }, "Nichts gefunden."));
      count.textContent = (q ? `${vis.length} von ${gs.length} ${gs.length === 1 ? "Eintrag" : "Einträgen"}` : pl(gs.length, "Eintrag", "Einträge")) + ` · ${fmtBytes(total)}`;
    };
    apply("");
    fill(body,
      h("p", { class: "hint", style: "margin-top:0" }, `Ersetzte und gelöschte Poster bleiben ${pl(r.keep_days, "Tag", "Tage")} hier (höchstens 2 GB). „Wiederherstellen“ legt das alte Bild zurück.`),
      gs.length ? h("div", { class: "row wrap", style: "margin-bottom:10px" }, count, h("span", { class: "spacer" }),
        gs.length >= LIST_SEARCH_MIN ? listSearch(apply) : null,
        h("button", { class: "btn sm danger", onclick: async () => { if (!confirm("Papierkorb ganz leeren? Das kann nicht rückgängig gemacht werden.")) return; await api("/trash", { method: "DELETE" }); drawTrash(); } }, "Papierkorb leeren")) : null,
      gs.length ? list : h("div", { class: "empty", style: "padding:30px" }, "Der Papierkorb ist leer."));
  }

  async function drawOrphans() {
    fill(body, h("div", { class: "empty", style: "padding:30px" }, h("span", { class: "spin" }), " Suche verwaiste Ordner …"));
    const r = await api("/orphans?world=" + encodeURIComponent(S.world));
    if (!r.folders) { fill(body, h("div", { class: "empty" }, "Verwaiste Ordner lassen sich nur bei Ordner-Struktur (asset_folders) prüfen.")); return; }
    if (r.blocked) { fill(body, h("div", { class: "status bad" }, "⚠ " + r.blocked)); return; }
    const sel = new Set();
    const list = h("div"), go = h("button", { class: "btn primary", disabled: true });
    let visible = [], filtered = false;
    const items = r.orphans.map(o => {
      const input = h("input", { type: "checkbox", onchange: e => { e.target.checked ? sel.add(o.path) : sel.delete(o.path); sync(); } });
      return { o, input, hay: normText(o.name + " " + o.path),
        el: h("label", { class: "trow orph" }, input,
          h("div", { class: "grow" }, h("b", {}, o.name), h("div", { class: "hint", style: "margin:0" }, `${o.path} · ${pl(o.files, "Datei", "Dateien")} · ${fmtBytes(o.size)} · ${fmtWhen(o.mtime)}`))) };
    });
    const toggleAll = h("button", { class: "btn sm", onclick: () => {
      const all = visible.length && visible.every(i => sel.has(i.o.path));
      visible.forEach(i => { i.input.checked = !all; i.input.dispatchEvent(new Event("change")); });
    } }, "Alle wählen");
    const sync = () => {
      go.textContent = `${sel.size} in den Papierkorb`; go.disabled = !sel.size;
      const all = visible.length && visible.every(i => sel.has(i.o.path));
      toggleAll.textContent = (filtered ? "Treffer " : "Alle ") + (all ? "abwählen" : "wählen");
    };
    const count = h("span", { class: "hint", style: "margin:0" });
    const apply = q => {
      filtered = !!q; visible = items.filter(i => !q || i.hay.includes(q));
      fill(list, visible.length ? visible.map(i => i.el) : h("div", { class: "empty", style: "padding:30px" }, "Nichts gefunden."));
      count.textContent = q ? `${visible.length} von ${items.length} ${items.length === 1 ? "Ordner" : "Ordnern"}` : pl(items.length, "Ordner", "Ordner");
      sync();
    };
    go.onclick = async () => {
      if (!confirm(`${pl(sel.size, "Ordner", "Ordner")} in den Papierkorb verschieben? ${sel.size === 1 ? "Er lässt" : "Sie lassen"} sich dort 30 Tage lang wiederherstellen.`)) return;
      const res = await busy(go, () => api("/orphans/trash", { json: { world: S.world, paths: [...sel] } }));
      toast(`${pl(res.moved, "Ordner", "Ordner")} im Papierkorb`, "ok", res.trash ? { label: "Rückgängig", fn: async () => { await api(`/trash/${res.trash}/restore`, { method: "POST" }); toast("Wiederhergestellt ✓", "ok"); } } : null);
      drawOrphans();
    };
    apply("");
    fill(body,
      h("p", { class: "hint", style: "margin-top:0" }, `Ordner in „${curWorld().name}“ mit Postern oder Staffelbildern, zu denen es keinen Titel mehr gibt: weder in Plex noch in Sonarr/Radarr. Titel, die Sonarr oder Radarr noch kennen (auch angekündigte), bleiben geschützt.`),
      r.orphans.length ? [h("div", { class: "row wrap", style: "margin-bottom:8px" }, toggleAll, count, h("span", { class: "spacer" }),
          r.orphans.length >= LIST_SEARCH_MIN ? listSearch(apply) : null, go), list]
        : h("div", { class: "empty", style: "padding:30px" }, "🎉 Keine verwaisten Ordner gefunden."));
  }

  const draw = () => {
    fill(tabs, [["trash", "Papierkorb"], ["orphans", "Verwaiste Ordner"]].map(([k, label]) => h("button", { class: "tab" + (tab === k ? " on" : ""), onclick: () => { tab = k; draw(); } }, label)));
    (tab === "trash" ? drawTrash : drawOrphans)().catch(e => fill(body, h("div", { class: "status bad" }, e.message)));
  };
  draw();
}

/* ------------------------------------------------------------ what's new --- */
/** "Neu in diesem Update": entries from news.json that the user has not seen yet, each with an optional "set up / try" action. */
async function checkNews(all = false) {
  try {
    const r = await api("/news"), list = all ? r.all : r.unseen;
    if (!list.length) { if (all) toast("Keine Neuigkeiten", "ok"); return; }
    openNews(list, all);
  } catch { /* optional */ }
}
const markNewsSeen = ids => api("/news/seen", { json: { ids } }).catch(() => {});

function openNews(list, all) {
  const m = modal(all ? "Neuigkeiten" : "Neu in diesem Update", h("div", {},
    all ? null : h("p", { class: "hint", style: "margin-top:0" }, "Das hat sich seit deinem letzten Besuch geändert. Wo es passt, kannst du es gleich ausprobieren oder einrichten."),
    list.map(e => h("div", { class: "newsrow" },
      h("div", { class: "grow" }, h("b", {}, e.title, e.seen ? h("span", { class: "tag", style: "margin-left:8px" }, "gesehen") : null), h("div", { class: "hint", style: "margin:3px 0 0" }, e.text)),
      e.action ? h("button", { class: "btn sm primary", onclick: () => { m.close(); markNewsSeen([e.id]); runNewsAction(e.action.target); } }, e.action.label) : null))),
    all ? null : [h("button", { class: "btn primary", onclick: () => { markNewsSeen(list.map(e => e.id)); m.close(); } }, "Alles gelesen"),
      h("button", { class: "btn", onclick: () => m.close() }, "Später erinnern")]);
}

async function runNewsAction(target) {
  const [kind, arg] = target.split(":");
  if (kind === "settings") { await wizard(true); goStep(arg); }
  else if (kind === "cleanup") openCleanup(arg);
  else if (kind === "tab") { if (S.view !== "dash") dashboard(); S.filter = arg; renderChips(); await loadItems(); renderGrid(); }
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
      h("div", { class: "logo" }, h("i", { class: "logomark", "aria-hidden": "true" }, "p5"), h("span", {}, "logs", h("u", {}, "_"))),
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
          h("div", { class: "grow", style: "min-width:240px" }, h("label", { class: "f", style: "margin-top:0" }, "Logs durchsuchen"), h("div", { class: "clearwrap" }, q, clearBtn(q))),
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
  const qInput = h("input", { type: "search", placeholder: "Titel suchen …", id: "q", value: S.q, autocomplete: "off", enterkeyhint: "search", "aria-label": "Titel suchen", oninput: debounce(async e => { S.q = e.target.value; await loadItems(); renderGrid(); }, 150) });
  setAccent();
  const ws = cfg().worlds;
  fill(app,
    h("header", { class: "top" }, h("div", { class: "in" },
      h("div", { class: "logo" }, h("i", { class: "logomark", "aria-hidden": "true" }, "p5"), h("span", {}, "assets", h("u", {}, "_"))),
      ws.length > 1 ? h("div", { class: "worlds", title: "Welt wechseln" }, ws.map(w =>
        h("button", { class: w.id === S.world ? "on" : "", style: `--c:${worldColor(w)}`, title: w.name, onclick: () => switchWorld(w.id) }, planetSvg(w.hue ?? 140, 20), w.name))) : null,
      h("div", { class: "spacer" }),
      // desktop: one small group with two pickers (images/ZIP, whole folder); touch devices: the single normal button
      h("div", { class: "upgroup" }, h("span", { class: "uplab" }, "Bilder hochladen:"),
        h("button", { class: "upb", title: "Bilder oder ZIP wählen – p5assets ordnet sie automatisch den Titeln zu", "aria-label": "Bilder oder ZIP wählen", onclick: () => pickFiles(f => importFiles(f), true) }, icon("file", 18)),
        h("button", { class: "upb", title: "Ordner wählen – oder Ordner und Dateien einfach ins Fenster ziehen", "aria-label": "Ordner wählen", onclick: () => pickFiles(f => importFiles(f), true, true) }, icon("folder", 18))),
      h("button", { class: "btn tb uptouch", title: "Bilder oder ZIPs wählen – p5assets ordnet sie automatisch den Titeln zu", onclick: () => pickFiles(f => importFiles(f), true) }, icon("upload"), h("span", { class: "lbl" }, "Bilder hochladen")),
      h("span", { class: "vsep" }),
      h("button", { class: "btn tb", id: "scanbtn", title: "Plex, Sonarr/Radarr und die Assets-Ordner neu einlesen", onclick: doScan }, icon("sync"), h("span", { class: "lbl" }, "Scannen")),
      h("button", { class: "btn tb icon", title: "Papierkorb & Aufräumen: ersetzte Poster zurückholen (30 Tage) und verwaiste Ordner entfernen", onclick: () => openCleanup() }, icon("trash", 20)),
      h("button", { class: "btn tb icon logbtn", id: "logbtn", title: "Logs", onclick: logsPage }, icon("terminal", 20), h("span", { class: "lbadge" })),
      h("button", { class: "btn tb icon", title: "Einstellungen", onclick: () => wizard(true) }, icon("gear", 20)),
    )),
    h("main", {}, h("div", { id: "hero" }), h("div", { id: "tabrow", class: "tabrow" }, h("div", { id: "chips" }), h("div", { class: "search" }, icon("search", 16), qInput, clearBtn(qInput))), h("div", { id: "az", class: "azbar" }), h("div", { id: "grid" }), h("div", { id: "az2", class: "azbar" })),
  );
  updateHero();
  S.dimTries = 0; loadHistory();
  checkAlerts();
  if (!S.newsChecked) { S.newsChecked = true; setTimeout(checkNews, 1500); }
  loadItems().then(renderGrid);
  if (S.st.summary.running) startPolling();
  else if (!S.st.summary.scanned_at) doScan();
}

function switchWorld(id) {
  if (id === S.world) return;
  const w = cfg().worlds.find(x => x.id === id);
  worldTransition(w, async () => {
    S.world = id; S.filter = "all"; S.q = ""; S.lib = ""; S.letter = null; S.letters = {}; S.stats = null; S.nopost = false; S.hist = [];
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
      stat(ws.complete_items, "Vollständig")),
    sparkline());
  const sig = JSON.stringify([S.world, S.lib, c.libraries.map(l => [l.title, l.enabled, l.world]), c.arr.map(a => [a.name, a.world])]);
  if (box.dataset.sig !== sig) { box.dataset.sig = sig; fill($("#hsrc"), sourceSelect()); }
  const hasSrc = !!$("#hsrc").firstChild;
  box.classList.toggle("hassrc", hasSrc);
  fill($("#hhint"), s.scanned_at ? "Zuletzt gescannt\n" + new Date(s.scanned_at * 1000).toLocaleString("de-DE") : "");
  renderChips();
}
const stat = (n, label, cls = "") => h("div", { class: "stat " + cls }, h("b", {}, n ?? 0), h("span", {}, label));

/** Coverage over time (one point per scan) of the world: a small line under the numbers. */
async function loadHistory() {
  try { S.hist = (await api("/history?world=" + encodeURIComponent(S.world) + "&days=90")).points; } catch { S.hist = []; }
  if (S.view === "dash") updateHero();
}
function sparkline() {
  const pts = (S.hist || []).filter(p => p[2] > 0).map(p => [p[0], Math.round((p[2] - p[3]) / p[2] * 1000) / 10]);
  if (pts.length < 2) return null;
  const W = 200, H = 34, t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
  const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), span = Math.max(hi - lo, 2);
  const xy = ([t, v]) => [4 + (t - t0) / Math.max(1, t1 - t0) * (W - 8), H - 5 - (v - lo) / span * (H - 10)];
  const line = pts.map(p => xy(p).map(n => n.toFixed(1)).join(",")).join(" ");
  const [lx, ly] = xy(pts[pts.length - 1]), first = pts[0][1], last = pts[pts.length - 1][1], diff = Math.round((last - first) * 10) / 10;
  const days = Math.max(1, Math.round((t1 - t0) / 86400));
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("class", "spark-svg");
  svg.innerHTML = `<polyline points="${line} ${lx.toFixed(1)},${H} 4,${H}" fill="var(--dim)" stroke="none"/><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="var(--accent)"/>`;
  return h("div", { class: "spark", title: `Abdeckung ${first}% → ${last}% in ${days} Tag${days === 1 ? "" : "en"} (ganze Welt, ein Punkt pro Scan)` },
    svg, h("span", {}, `Abdeckung ${pl(days, "Tag", "Tage")}: `, h("b", {}, `${last}%`), h("span", { class: diff >= 0 ? "up" : "down" }, ` ${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)}`)));
}

/** Source filter in the statistic block: all / all movie / all series sources (combined, every title counted once) /
 *  single Plex libraries / single Sonarr+Radarr instances. Ring, numbers and tab counters follow the selection. */
function sourceSelect() {
  const c = cfg();
  const libs = c.libraries.filter(l => l.enabled && l.world === S.world), arrs = c.arr.filter(a => a.world === S.world);
  const hasMovie = libs.some(l => l.type === "movie") || arrs.some(a => a.kind === "radarr");
  const hasShow = libs.some(l => l.type === "show") || arrs.some(a => a.kind === "sonarr");
  const groups = [
    hasMovie && hasShow ? [null, [{ v: "type:movie", label: "Alle Filmquellen (kombiniert)" }, { v: "type:show", label: "Alle Serienquellen (kombiniert)" }]] : null,
    libs.length ? ["Plex-Bibliotheken", libs.map(l => ({ v: "lib:" + l.title, label: l.title }))] : null,
    arrs.length ? ["Sonarr / Radarr", arrs.map(a => ({ v: "src:" + a.name, label: a.name }))] : null,
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

/** The user decides what counts as weak: minimum width and/or aspect ratio. */
function weakOptions() {
  const c = weakCfg(), dm = (S.stats && S.stats.dims) || { known: 0, total: 0 };
  const change = async patch => { saveWeak({ ...weakCfg(), ...patch }); renderChips(); await loadItems(); renderGrid(); };
  if (dm.known < dm.total && S.dimTries < 8) {       // the sizes are read in the background after a scan: look again shortly
    clearTimeout(S.dimTimer); S.dimTries++;
    S.dimTimer = setTimeout(async () => { await loadItems(); renderGrid(); }, 4000);
  }
  return h("div", { class: "weakopts" },
    h("label", { class: "opt compact" }, h("input", { type: "checkbox", checked: c.wOn, onchange: e => change({ wOn: e.target.checked }) }), "Breite unter",
      h("select", { onchange: e => change({ w: +e.target.value, wOn: true }) }, [600, 800, 1000, 1200, 1500].map(v => h("option", { value: v, selected: v === c.w }, v + " px")))),
    h("label", { class: "opt compact" }, h("input", { type: "checkbox", checked: c.rOn, onchange: e => change({ rOn: e.target.checked }) }), "Seitenverhältnis nicht 2:3"),
    dm.known < dm.total ? h("span", { class: "hint" }, `Bildgrößen werden geprüft … ${dm.known} von ${dm.total}`) : null);
}

function renderChips() {
  const el = $("#chips"); if (!el) return;
  const c = cfg(), cnt = (S.stats && S.stats.counts) || {};
  const hasExtra = c.arr.some(a => a.world === S.world);
  const chip = (label, key, n, title) => h("button", { class: "chip" + (S.filter === key ? " on" : ""), title, onclick: async () => { S.filter = key; renderChips(); await loadItems(); renderGrid(); } },
    label, n != null ? h("small", {}, n) : null);
  fill(el,
    chip("Alle", "all", cnt.all),
    chip("Fehlende", "missing", cnt.missing),
    chip("In Plex, Poster fehlt", "plexmissing", cnt.plexmissing, "In Plex vorhanden, aber bei Kometa fehlt ein Poster oder eine Staffel (ohne Titel, die nur in Sonarr/Radarr stehen)"),
    chip("Vollständig", "complete", cnt.complete),
    cnt.comingsoon > 0 || S.filter === "comingsoon" ? chip("Coming Soon", "comingsoon", cnt.comingsoon, "Coming-Soon-Poster ({edition-Coming Soon}): in Plex schon sichtbar, brauchen zeitnah ein Poster") : null,
    hasExtra || cnt.notplex > 0 || S.filter === "notplex" ? chip("Noch nicht in Plex", "notplex", cnt.notplex, "Sonarr/Radarr kennen den Titel, in Plex ist er noch nicht (noch keine Datei, noch nicht erschienen oder noch nicht eingelesen)") : null,
    chip("Schwache Poster", "weak", cnt.weak, "Bilder, die zu schmal sind oder nicht das Seitenverhältnis 2:3 haben (Schwellwerte wählst du selbst)"),
    S.filter === "weak" ? weakOptions() : null,
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
      !worldStats().items ? [h("h2", {}, "Hier ist noch nichts"), "Ordne dieser Welt unter ⚙ Bibliotheken oder Sonarr/Radarr zu."] :
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

const NOT_IN_PLEX = "Noch nicht in Plex";   // one label for everything Sonarr/Radarr know but Plex does not have yet (no file, not released …)

/** Status of a title as tag descriptors; the colour says what it means (ok = green, warn = yellow, bad = red). */
function statusTags(it) {
  const t = [];
  if (!it.in_plex) t.push({ text: NOT_IN_PLEX, cls: "warn" });
  if (it.coming_soon) t.push({ text: "Coming Soon", cls: "warn" });
  if (it.monitored != null) {
    t.push(it.monitored ? { text: "überwacht", cls: "ok" } : { text: "nicht überwacht", cls: "" });
  }
  t.push(it.missing ? { text: `${pl(it.missing, "Kachel", "Kacheln")} ${fehlt(it.missing)}`, cls: "bad" } : { text: "vollständig", cls: "ok" });
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
  if (bad) box.append(h("span", { class: "badge bad" }, `${bad} ${fehlt(bad)}`));
  box.title = metaText(item);
  if (!item.in_plex) box.append(h("span", { class: "badge warn b", title: "Sonarr/Radarr kennen den Titel, in Plex ist er noch nicht" }, NOT_IN_PLEX));
  else if (item.coming_soon) box.append(h("span", { class: "badge warn b", title: "In Plex als Coming-Soon-Platzhalter sichtbar" }, "Coming Soon"));
  if (S.filter === "weak") { const wk = weakSlot(item); if (wk) box.append(h("span", { class: "badge warn r", title: `${slotLabel(wk.key, item.type)}: ${wk.w} × ${wk.h} px` }, `${wk.w}×${wk.h}`)); }
  // a movie has one poster: no detail view, title/year and poster open the preview; the action buttons are built on first use
  const info = h("div", { class: "info", onclick: movie ? () => openPreview(item, "poster", changed) : null, title: movie ? "Vorschau öffnen" : null },
    h("div", { class: "t", title: item.title }, item.title),
    h("div", { class: "s" }, [item.year, item.type === "show" ? pl(item.season_count, "Staffel", "Staffeln") : "Film"].filter(Boolean).join(" · ")));
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
    const tpdb = h("button", { class: "btn sm", title: "ThePosterDB durchsuchen: im Fenster öffnest du die Suche und legst danach das heruntergeladene Set ab", onclick: () => openPosterDbSet(it, draw) }, icon("search", 14), "ThePosterDB");
    return h("div", { class: "dlbar row wrap" }, selMode ? null : upload, selMode ? null : tpdb,
      !have.length ? null : selMode ? [
        h("span", { class: "hint", style: "margin:0" }, `${sel.size} von ${have.length} ausgewählt – Kacheln antippen`),
        h("button", { class: "btn sm", onclick: () => { if (sel.size === have.length) sel.clear(); else have.forEach(k => sel.add(k)); draw(it); } }, sel.size === have.length ? "Alle abwählen" : "Alle wählen"),
        h("button", { class: "btn sm primary", disabled: !sel.size, onclick: () => zip([...sel]) }, icon("download", 14), `Auswahl als ZIP (${sel.size})`),
        h("button", { class: "btn sm", onclick: () => { selMode = false; sel.clear(); draw(it); } }, "Fertig")]
      : isTouch() ? [] : [h("button", { class: "btn sm", title: "Poster in Originalqualität herunterladen", onclick: () => {
          const m = modal("Herunterladen", h("div", {},
            h("p", { class: "hint", style: "margin-top:0" }, "Die Poster werden unverändert aus dem Assets-Ordner geladen (Originalqualität)."),
            h("div", { class: "row wrap" },
              h("button", { class: "btn primary", onclick: () => { m.close(); zip(have); } }, icon("download", 16), `Alle als ZIP (${have.length})`),
              h("button", { class: "btn", onclick: () => { m.close(); selMode = true; draw(it); } }, "Einzelne Poster auswählen …")),
            h("p", { class: "hint" }, "Ein einzelnes Poster lädst du über „Herunterladen“ auf seiner Kachel.")));
        } }, icon("download", 14), "Herunterladen")]);
  }

  function slotView(it, key, known) {
    const sl = it.slots[key], exists = !!(sl && sl.exists);
    const box = posterBox(it, key, known);
    if (known && !exists) box.append(h("span", { class: "badge bad" }, "fehlt"));      // a poster that is there needs no tag
    if (sl && sl.only_arr) box.append(h("span", { class: "badge warn b", title: "Diese Staffel kennt bisher nur Sonarr – in Plex gibt es sie noch nicht" }, NOT_IN_PLEX));
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
        undoToast(`${slotLabel(src.slot, it.type)} → ${slotLabel(key, it.type)} kopiert ✓`, r, draw);
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

/** Save an asset (original file, no re-encoding) or a ZIP with a normal download link (desktop).
 *  On iPhone/iPad (touch) a link to a file ends in the iOS file page with no way back (home-screen app, plain http: no share sheet),
 *  so there the original opens inside p5assets instead (see openPreview: long press → "Zu Fotos hinzufügen"). */
const isTouch = () => matchMedia("(hover: none)").matches;
function downloadUrl(url) {
  const a = h("a", { href: url, download: "", hidden: true });
  document.body.append(a); a.click(); a.remove();
}
const downloadSlot = (it, key, draw) => isTouch() ? openPreview(it, key, draw) : downloadUrl(`/api/download/${it.id}/${key}`);

/** Hover/tap overlay of a poster tile with its actions (series tiles in the detail view, movie posters on the dashboard). */
function slotActions(it, key, box, draw) {
  const exists = !!(it.slots[key] && it.slots[key].exists);
  const pick = () => pickFiles(files => uploadSlot(it, key, files, draw), false);
  const del = async () => { if (confirm(`${slotLabel(key, it.type)} wirklich löschen?`)) { const r = await api(`/items/${it.id}/${key}`, { method: "DELETE" }); draw(r.item); undoToast("Gelöscht", r, draw); } };
  const ob = (label, fn, cls = "") => h("button", { class: "ov-btn " + cls, onclick: e => { e.stopPropagation(); box.classList.remove("show"); fn(); } }, label);
  return h("div", { class: "hover" },
    h("div", { class: "ovbtns" }, exists
      ? [ob("Ersetzen", pick), ob("Vorschau", () => openPreview(it, key, draw)), ob("Online suchen", () => searchOnline(it, key, draw)),
         ob("Herunterladen", () => downloadSlot(it, key, draw)),
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
    h("div", { class: "lbox" },
     h("header", { class: "lbhead" }, h("h2", { class: "grow" }, "Vorschau"), h("button", { class: "btn ghost sm", "aria-label": "Schließen", onclick: () => close() }, "✕")),     // the one close button: same place on desktop and phone
     h("div", { class: "lbbody" }, h("div", { class: "limg" }, img,
        touch && exists ? h("div", { class: "hint", style: "text-align:center" }, "Bild lange drücken → „Zu Fotos hinzufügen“ (Originalqualität)") : null),
      h("div", { class: "lside" },
        metaGroups(it),
        (it.mirror_folders || []).length ? h("div", { style: "margin-top:8px" }, h("span", { class: "tag ok", title: "Coming-Soon-Platzhalter: Poster werden auch im echten Film-Ordner abgelegt" }, "Coming Soon gespiegelt")) : null,
        h("dl", {}, rows.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]), src ? [h("dt", {}, "Auflösung"), res] : null),
        h("div", { class: "row wrap", style: "margin-top:20px" },
          it.folder ? h("button", { class: "btn sm primary", onclick: pick }, exists ? "Ersetzen" : "Hochladen") : null,
          exists && !touch ? h("button", { class: "btn sm", onclick: () => downloadSlot(it, key) }, icon("download", 14), "Herunterladen") : null,
          draw && it.folder ? h("button", { class: "btn sm", onclick: () => { close(); searchOnline(it, key, draw); } }, "Online suchen") : null,
          draw && exists && it.type === "show" ? h("button", { class: "btn sm", onclick: () => { close(); openApplyAll(it, key, draw); } }, "Auf alle …") : null,
          draw && exists ? h("button", { class: "btn sm danger", onclick: async () => {
            if (!confirm(`${slotLabel(key, it.type)} wirklich löschen?`)) return;
            close(); const r = await api(`/items/${it.id}/${key}`, { method: "DELETE" }); draw(r.item); undoToast("Gelöscht", r, draw);
          } }, "Löschen") : null),
        !it.folder ? h("div", { class: "status bad" }, "Für diesen Titel ist kein Ordnername bekannt – Upload nicht möglich.") : null))));
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
      ? `${pl(targets.length, "Kachel", "Kacheln")} ${targets.length === 1 ? "wird" : "werden"} mit „${label}“ gefüllt${overwritten.length ? `, davon ${overwritten.length} überschrieben` : ""}.`
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
    radio("range", "known", "Nur vorhandene Kacheln dieser Serie", `${pl(known, "weitere Kachel", "weitere Kacheln")} (Poster + bekannte Staffeln laut Plex/Sonarr)`, opt.range === "known", v => { opt.range = v; }),
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
    if (overwritten.length && !confirm(`${pl(overwritten.length, "bereits belegte Kachel", "bereits belegte Kacheln")} ${overwritten.length === 1 ? "wird" : "werden"} überschrieben. Fortfahren?`)) return;
    try {
      const r = await busy(go, () => api(`/items/${it.id}/copy-all`, { json: { source: key, targets, overwrite: opt.overwrite } }));
      m.close();
      undoToast(`${pl(r.written.length, "Kachel", "Kacheln")} gesetzt ✓`, r, draw);
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
    undoToast("Ersetzt ✓", r, draw); if (r.warning) toast("Plex: " + r.warning, "bad");
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
        try { const res = await api(`/items/${it.id}/${slot}/url`, { json: { url: img.url } }); undoToast("Übernommen ✓", res, draw); m.close(); S.rain.add(it.id + "|" + slot); draw(res.item); }
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
  // Series: once the search is open in its tab the window has done its job (the download goes in via "Set hochladen" / the tile / dragging).
  // Movies: the window stays and has its own upload button, a handy workflow for a single poster.
  const movie = it.type === "movie";
  if (!movie) link.addEventListener("click", () => setTimeout(done, 150));
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
    else importFiles(files, it.id, draw, it, true);                                           // several files: review dialog, title fixed
  };
  const zone = h("div", { class: "tpzone" }, h("b", {}, "＋"),
    h("div", {}, "Heruntergeladenes Poster hier ablegen"),
    h("small", {}, "Ein einzelnes Bild ersetzt das Poster dieses Films. Ein ZIP oder mehrere Bilder öffnen den Prüfdialog."),
    h("div", { class: "row wrap", style: "justify-content:center;margin-top:10px" },
      h("button", { class: "btn sm primary", onclick: () => pickFiles(handle, true) }, "Hochladen")));
  if (movie) makeDropTarget(zone, handle);
  return h("div", { class: "tpdb" },
    h("ol", { class: "tpsteps" },
      h("li", {}, "Auf ThePosterDB suchen, Sprache und Set wählen und dort (angemeldet) herunterladen."),
      h("li", {}, movie ? "Die heruntergeladene Datei danach hier hochladen oder ablegen: p5assets benennt sie Kometa-konform und legt sie ab."
        : slot ? "Das Bild danach über „Ersetzen“ bzw. „Hochladen“ dieser Kachel wählen oder auf die Kachel ziehen: p5assets benennt es Kometa-konform und legt es ab."
        : "Das Set danach über „Set hochladen“ wählen oder einfach in die Serien-Ansicht ziehen: p5assets benennt es Kometa-konform und legt es ab.")),
    h("label", { class: "f" }, "Suchbegriff (englischer Ordnername aus Sonarr/Radarr)"),
    h("div", { class: "row wrap" }, h("div", { class: "grow", style: "min-width:220px" }, term), link),
    h("div", { class: "row", style: "margin-top:8px" }, h("div", { class: "grow" }, url), copy),
    h("div", { class: "hint", style: "margin:2px 0 0" }, "Falls der Button blockiert wird: Link kopieren und in einen neuen Tab einfügen."),
    h("label", { class: "opt", style: "margin-top:8px" }, ids, h("div", {}, "Kennung wie {tvdb-123} mitsuchen", h("small", {}, "Ohne Kennung (Standard) wird nur „Titel (Jahr)“ gesucht."))),
    h("p", { class: "hint" }, "ThePosterDB bietet Downloads nur für angemeldete Nutzer an – deshalb lädt p5assets dort nichts selbst und braucht keine Zugangsdaten."),
    movie ? zone : null);
}

function openPosterDbSet(it, draw) {
  const m = modal(`ThePosterDB durchsuchen – Set für ${it.title}`, posterDbPanel(it, null, draw, () => m.close()));
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
      h("button", { class: "btn primary", onclick: () => { m.close(); pickFiles(cb, true, true); } }, icon("folder", 16), "Ordner wählen"),
      h("button", { class: "btn", onclick: () => { m.close(); pickFiles(cb, true); } }, icon("upload", 16), "ZIP / Bilder wählen"))));
}

/* ------------------------------------------------------------ import --- */
async function importFiles(files, itemId, onDone, item, review) {
  if (!files || !files.length) return;
  const fd = new FormData();
  if (itemId) fd.append("item_id", itemId); else fd.append("world", S.world);
  files.forEach(f => fd.append("files", f.file, f.path));
  const bar = h("i", { style: "width:0%" });
  const m = modal("Lade hoch …", h("div", {}, h("p", {}, `${pl(files.length, "Datei", "Dateien")} ${files.length === 1 ? "wird" : "werden"} übertragen`), h("div", { class: "progress" }, bar)));
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
    if (clash.length && !confirm(`${pl(clash.length, "Kachel", "Kacheln")} ${clash.length === 1 ? "ist" : "sind"} schon belegt (${clash.slice(0, 6).map(k => slotLabel(k, "show")).join(", ")}${clash.length > 6 ? " …" : ""}) und ${clash.length === 1 ? "wird" : "werden"} überschrieben. Fortfahren?`)) {
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
    if (r.done.length) toast(`${pl(r.done.length, "Asset", "Assets")} gespeichert ✓`, "ok");
    r.failed.forEach(f => toast(f.error, "bad"));
    r.done.filter(d => d.warning).forEach(d => toast("Plex: " + d.warning, "bad"));
    assignments.forEach(a => S.rain.add(a.item_id + "|" + a.slot));
    S.st.summary = r.summary; updateHero();
    if (onDone) onDone(await api("/items/" + assignments[0].item_id));
    await loadItems(); renderGrid();
  } catch (e) { toast(e.message, "bad"); }
}

/** "Staffeln 1–3, 5" / "Staffel 3" / "Specials, Staffel 2": readable list of season numbers (0 = Specials). */
function seasonList(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b), ns = sorted.filter(n => n > 0), parts = [];
  for (let i = 0; i < ns.length;) {
    let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    parts.push(j - i >= 2 ? `${ns[i]}–${ns[j]}` : ns.slice(i, j + 1).join(", ")); i = j + 1;
  }
  const out = [];
  if (sorted.includes(0)) out.push("Specials");
  if (ns.length) out.push(`${ns.length === 1 ? "Staffel" : "Staffeln"} ${parts.join(", ")}`);
  return out.join(" und ");
}

/** Is a set complete? Compares the files of ONE series with the seasons Plex (and Sonarr) know. `t` = public item, `rows` = used rows. */
function checkSet(t, rows) {
  const inSet = new Set(rows.map(r => r.slot));
  const known = Object.entries(t.slots).filter(([k, v]) => /^season-\d+$/.test(k) && !v.extra).map(([k, v]) => ({ n: +k.split("-")[1], exists: !!v.exists, arr: !!v.only_arr || !t.in_plex }));
  const plexNums = known.filter(s => !s.arr && s.n > 0).map(s => s.n), arrNums = known.filter(s => s.arr && s.n > 0).map(s => s.n);
  const relevant = t.in_plex ? plexNums : arrNums;            // what the set should cover (everything Plex has; for titles not in Plex: what Sonarr knows)
  const has = n => inSet.has("season-" + n), existing = n => known.some(s => s.n === n && s.exists);
  const missing = relevant.filter(n => !has(n)), covered = relevant.filter(has);
  const existsNote = miss => {      // missing in the set, but the tile already has an image in the assets folder
    const ex = miss.filter(existing);
    if (!ex.length) return "";
    return ex.length === miss.length ? ` – im Assets-Ordner ${miss.length === 1 ? "ist sie" : "sind sie"} schon vorhanden` : ` – ${seasonList(ex)} ${ex.length === 1 && ex[0] > 0 ? "ist" : "sind"} schon im Assets-Ordner vorhanden`;
  };
  const posterMissing = !inSet.has("poster"), posterExists = !!(t.slots.poster && t.slots.poster.exists);
  const early = [...arrNums.filter(has), ...rows.map(r => r.slot).filter(k => /^season-\d+$/.test(k) && !known.some(s => "season-" + s.n === k)).map(k => +k.split("-")[1])].filter(n => n > 0);
  const lines = [];
  lines.push({ cls: "", text: t.in_plex
    ? `Plex kennt ${pl(plexNums.length, "Staffel", "Staffeln")}${arrNums.length ? `, Sonarr kennt zusätzlich ${seasonList(arrNums)}` : ""}.`
    : `Noch nicht in Plex – Sonarr kennt ${pl(arrNums.length, "Staffel", "Staffeln")}.` });
  lines.push({ cls: missing.length ? "bad" : "ok", text: relevant.length
    ? `Das Set deckt ${covered.length} von ${pl(relevant.length, "Staffel", "Staffeln")} ab${missing.length ? ` – es ${missing.length === 1 ? "fehlt" : "fehlen"}: ${seasonList(missing)}${existsNote(missing)}` : ""}.`
    : "Keine Staffeln bekannt – nur das Serienposter lässt sich prüfen." });
  lines.push({ cls: posterMissing ? "bad" : "ok", text: posterMissing ? `Serienposter ${posterExists ? "fehlt im Set (im Assets-Ordner ist eins vorhanden)" : "fehlt im Set"}.` : "Serienposter ist enthalten." });
  if (known.some(s => s.n === 0)) lines.push({ cls: "", text: has(0) ? "Specials sind enthalten." : "Specials sind nicht im Set (optional)." });
  if (early.length) lines.push({ cls: "", text: `${seasonList(early)} ${early.length === 1 ? "gibt" : "geben"} es in Plex noch nicht – wird vorab abgelegt.` });
  const bySlot = {};
  rows.forEach(r => { (bySlot[r.slot] = bySlot[r.slot] || []).push(r.name.split("/").pop()); });
  const dups = Object.entries(bySlot).filter(([, names]) => names.length > 1);
  if (dups.length) lines.push({ cls: "bad", text: `Doppelt belegt – ${dups.map(([k, names]) => `${slotLabel(k, "show")}: ${names.join(" und ")}`).join("; ")}. Bei einem der Bilder das Häkchen entfernen (eine Kachel kann nur ein Bild haben).` });
  const replaced = rows.filter(r => t.slots[r.slot] && t.slots[r.slot].exists).length;
  if (replaced) lines.push({ cls: "warn", text: `${replaced === 1 ? "Ein vorhandenes Bild wird" : `${replaced} vorhandene Bilder werden`} ersetzt.` });
  return { ok: !missing.length && !posterMissing && !dups.length, dups: dups.length, lines };
}

function reviewImport(res, onDone, fixed) {
  const rows = res.entries.map(e => ({ ...e, use: !!e.item_id && e.kind !== "ignore" }));
  const targets = { ...(res.targets || {}) };
  if (fixed && !targets[fixed.id]) targets[fixed.id] = fixed;
  const list = h("div"), summary = h("div");
  const count = () => rows.filter(r => r.use && r.item_id).length;
  const apply = h("button", { class: "btn primary" });
  let dupBlock = false;     // two files for the same tile: the review must be fixed first (a tile holds one image)
  const refreshBtn = () => {
    const n = count(); apply.textContent = `${pl(n, "Asset", "Assets")} übernehmen`; apply.disabled = !n || dupBlock;
    apply.title = dupBlock ? "Erst die doppelt belegten Kacheln auflösen: bei einem der Bilder das Häkchen entfernen" : "";
  };
  const ensureTarget = async id => { if (!targets[id]) { try { targets[id] = await api("/items/" + id); } catch { /* the check is optional */ } } };

  const fixedSlots = () => fixed ? ["poster", ...Array.from({ length: (fixed.max_season ?? 50) + 1 }, (_, n) => "season-" + n), ...Object.keys(fixed.slots).filter(k => !/^season-\d+$/.test(k) && k !== "poster")]
    .map(k => ({ slot: k, label: slotLabel(k, fixed.type) })) : null;
  const dupSlots = () => { const c = {}; rows.filter(r => r.use && r.item_id).forEach(r => { c[r.slot] = (c[r.slot] || 0) + 1; }); return c; };

  function buildRow(r, dups) {
    const t = r.item_id ? targets[r.item_id] : null;
    const sel = h("select", { onchange: e => { r.slot = e.target.value; draw(); } });
    const fillSlots = opts => fill(sel, opts.map(o => h("option", { value: o.slot, selected: o.slot === r.slot }, o.label)));
    const input = h("input", { type: "text", placeholder: "Titel suchen …", value: r.item_id ? `${r.item_title}${r.item_year ? " (" + r.item_year + ")" : ""}` : "" });
    const list2 = h("div", { class: "list", hidden: true });
    if (fixed && r.item_id) fillSlots(fixedSlots());
    else if (r.item_id) {
      fillSlots([{ slot: r.slot, label: slotLabel(r.slot, t ? t.type : "show") }]);
      api(`/slots?world=${res.world}&q=` + encodeURIComponent(r.item_title || "")).then(os => { const o = os.find(x => x.id === r.item_id); if (o) fillSlots(o.slots); });
    }
    input.oninput = debounce(async () => {
      const opts = await api(`/slots?world=${res.world}&q=` + encodeURIComponent(input.value));
      list2.hidden = !opts.length;
      fill(list2, opts.map(o => h("div", { onclick: async () => {
        r.item_id = o.id; r.item_title = o.title; r.item_year = o.year; r.use = true;
        const want = r.kind === "poster" ? "poster" : r.season != null ? "season-" + r.season : "poster";
        r.slot = o.slots.some(s => s.slot === want) ? want : "poster";
        list2.hidden = true; await ensureTarget(o.id); draw();
      } }, `${o.title}${o.year ? " (" + o.year + ")" : ""} `, h("span", { class: "pill" }, o.type === "movie" ? "Film" : "Serie"))));
    }, 200);
    input.onblur = () => setTimeout(() => (list2.hidden = true), 150);
    const chk = h("input", { type: "checkbox", checked: r.use, title: "Übernehmen", onchange: e => { r.use = e.target.checked; draw(); } });
    const pills = [];
    if (r.use && t && t.slots[r.slot] && t.slots[r.slot].exists) pills.push(h("span", { class: "pill warn", title: "Für diese Kachel gibt es schon ein Bild" }, "ersetzt vorhandenes Bild"));
    if (r.use && r.item_id && dups[r.item_id + "|" + r.slot] > 1) pills.push(h("span", { class: "pill bad", title: "Mehrere Dateien für dieselbe Kachel – nur die letzte bleibt" }, "doppelt belegt"));
    return h("div", { class: "imp" + (r.use ? "" : " skip") },
      h("img", { src: `/api/import/${res.session}/${r.id}`, loading: "lazy" }),
      h("div", { class: "fn" }, r.name, r.kind === "ignore" ? h("div", {}, h("span", { class: "pill bad" }, "Hintergrund/Banner – ignoriert")) : null),
      fixed && r.item_id
        ? h("div", { class: "c3 fixedtitle" }, h("b", {}, fixed.title + (fixed.year ? ` (${fixed.year})` : "")), h("span", { class: "pill ok" }, "diese Serie"), pills)
        : h("div", { class: "ac c3" }, input, list2, pills.length ? h("div", { class: "pills" }, pills) : null),
      h("div", { class: "c4" }, sel), chk);
  }

  function draw() {
    const dups = {};
    rows.filter(r => r.use && r.item_id).forEach(r => { const k = r.item_id + "|" + r.slot; dups[k] = (dups[k] || 0) + 1; });
    // groups: one per series (with the completeness check), movies, and everything without a title
    const series = new Map(), movies = [], loose = [];
    for (const r of rows) {
      const t = r.item_id ? targets[r.item_id] : null;
      if (t && t.type === "show") { if (!series.has(r.item_id)) series.set(r.item_id, []); series.get(r.item_id).push(r); }
      else if (t) movies.push(r); else loose.push(r);
    }
    const checks = [...series].map(([id, rs]) => ({ id, rs, t: targets[id], chk: checkSet(targets[id], rs.filter(r => r.use)) }));
    const dupN = checks.filter(c => c.chk.dups).length, okN = checks.filter(c => c.chk.ok).length, incN = checks.length - okN - dupN;
    const movieDup = movies.some(r => r.use && dups[r.item_id + "|" + r.slot] > 1);
    dupBlock = Object.values(dups).some(n => n > 1);
    fill(summary,
      checks.length > 1 ? h("div", { class: "setsum" }, h("b", {}, pl(checks.length, "Serie", "Serien") + ":"),
        h("span", { class: "pill ok" }, `${okN} vollständig`), incN ? h("span", { class: "pill warn" }, `${incN} unvollständig`) : null,
        dupN ? h("span", { class: "pill bad" }, `${dupN} mit doppelt belegten Kacheln`) : null) : null,
      dupBlock ? h("div", { class: "status bad", style: "margin-bottom:10px" }, "⚠ Eine Kachel kann nur ein Bild haben: Bei doppelt belegten Bildern (rot markiert) bitte ein Häkchen entfernen oder eine andere Kachel wählen.") : null);
    const group = (title, pillEl, open, body, lines) => h("details", { class: "impgroup", open },
      h("summary", {}, h("b", {}, title), h("span", { class: "grow" }), pillEl),
      lines ? h("ul", { class: "setcheck" }, lines.map(l => h("li", { class: l.cls }, l.text))) : null, body);
    fill(list,
      checks.map(c => group(`${c.t.title}${c.t.year ? ` (${c.t.year})` : ""} · ${pl(c.rs.length, "Bild", "Bilder")}`,
        h("span", { class: "pill " + (c.chk.dups ? "bad" : c.chk.ok ? "ok" : "warn") }, c.chk.dups ? "doppelt belegt" : c.chk.ok ? "Set vollständig" : "unvollständig"),
        checks.length === 1 || !c.chk.ok, c.rs.map(r => buildRow(r, dups)), c.chk.lines)),
      movies.length ? group(`Filme · ${pl(movies.length, "Bild", "Bilder")}`, movieDup ? h("span", { class: "pill bad" }, "doppelt belegt") : null, true, movies.map(r => buildRow(r, dups))) : null,
      loose.length ? group(`${checks.length || movies.length ? "Nicht zugeordnet" : "Bilder"} · ${pl(loose.length, "Bild", "Bilder")}`, loose.some(r => r.kind !== "ignore") ? h("span", { class: "pill warn" }, "bitte Titel wählen") : null, true, loose.map(r => buildRow(r, dups))) : null);
    refreshBtn();
  }
  draw();
  const m = modal(`${pl(rows.length, "Bild", "Bilder")} erkannt`, h("div", {},
    h("p", { class: "hint" }, fixed ? `Alle Bilder gehören zu „${fixed.title}“. Die Zuordnung zu Poster und Staffeln erkennt p5assets an den Dateinamen – prüfe oder ändere sie. Die Dateien werden Kometa-konform benannt (poster, Season01 …).`
      : "Zuordnung automatisch anhand von Datei- und Ordnernamen (nur Titel dieser Welt). Prüfe oder ändere sie – die Dateien werden Kometa-konform benannt (poster, Season01 …)."), summary, list),
    [apply, h("button", { class: "btn", onclick: () => { api("/import/" + res.session, { method: "DELETE" }); m.close(); } }, "Abbrechen"),
      h("span", { class: "spacer" }),
      h("span", { class: "hint" }, `${rows.filter(r => r.item_id).length} von ${rows.length} zugeordnet`)]);
  apply.onclick = async () => { m.close(); await applyImport(res.session, rows.filter(r => r.use && r.item_id), onDone); };
}

/* ======================================================= wizard / setup === */
const STEP_LABELS = { welcome: "Start", plex: "Plex", libs: "Bibliotheken", arr: "Sonarr/Radarr", worlds: "Welten", assign: "Zuordnung", apis: "Quellen", notify: "Benachrichtigungen", done: "Fertig" };
// "Zuordnung" only exists when there is more than one world
const stepList = () => ["welcome", "plex", "libs", "arr", "worlds", ...(cfg().worlds.length > 1 ? ["assign"] : []), "apis", "notify", "done"];

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
  const view = { welcome: wWelcome, plex: wPlex, libs: wLibs, arr: wArr, worlds: wWorlds, assign: wAssign, apis: wApis, notify: wNotify, done: wDone }[S.step];
  // labelled step navigation: in settings every step is reachable, during onboarding only the ones visited so far
  const shown = list.map((name, i) => ({ name, i })).filter(s => !(S.wizSettings && (s.name === "welcome" || s.name === "done")));
  fill(app, h("div", { class: "wiz" },
    h("div", { class: "logo" }, h("i", { class: "logomark", "aria-hidden": "true" }, "p5"), h("span", {}, "assets", h("u", {}, "_"))),
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
    plex: [c.plex.url, c.plex.server_name, c.plex.token],
    libs: c.libraries.map(l => [l.key, l.enabled, l.world]),
    worlds: c.worlds.map(w => [w.id, w.assets_path, w.search_depth, w.mirror_coming_soon]),
    arr: c.arr.map(a => [a.id, a.kind, a.name, a.url, a.api_key, a.world, a.hide_unmonitored]),
    assets: [c.assets.asset_folders, c.assets.ignore_specials],
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
    // all worlds side by side: planet + name, the chosen one lights up and the world card takes over its colour
    const hue = h("div", { class: "worldpick", role: "radiogroup", "aria-label": "Farbe der Welt" }, WORLD_THEMES.map(t =>
      h("button", { type: "button", class: "wp" + (w.hue === t.hue ? " on" : ""), role: "radio", "aria-checked": w.hue === t.hue ? "true" : "false", title: t.name,
        style: `--c:hsl(${t.hue} ${t.sat}% ${t.lit}%)`, onclick: async () => { w.hue = t.hue; await persist(); drawWiz(); } },
        planetSvg(t.hue, 40), t.name)));
    const st = statusEl(), fsBox = h("div");
    const check = async () => {
      const r = await api("/path/check", { json: { path: path.value } });
      if (!r.exists) setStatus(st, false, "Ordner existiert nicht (im Container gemountet?)");
      else if (!r.writable) setStatus(st, false, "Ordner ist nicht beschreibbar");
      else setStatus(st, true, `Ordner bereit (${pl(r.entries, "Eintrag", "Einträge")})`);
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
    return h("div", { class: "apirow w hue", style: `--c:${worldColor(w)};${hueVars(w)}` },
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
      const b = h("div", { class: "bubble world target hue", style: hueVars(w), title: "Hier ablegen" },
        h("h4", {}, w.name, h("small", { style: "text-transform:none;letter-spacing:0;color:var(--muted)" }, `  ${w.assets_path}`)),
        mine.length ? h("div", { class: "chips2" }, mine.map(chipEl)) : h("div", { class: "hintline" }, "Chips hier hineinziehen"));
      dropOn(b, ch => place(ch, w.id), () => true);
      return b;
    }));
  }
  draw();
  const unplaced = () => chips.filter(ch => !placed(ch)).length;
  const next = () => {
    if (unplaced() && !confirm(`${pl(unplaced(), "Eintrag ist", "Einträge sind")} noch nicht zugeordnet und ${unplaced() === 1 ? "landet" : "landen"} in „${worlds[0].name}“. Fortfahren?`)) return;
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

/** Notifications after a scan: Discord, Telegram, ntfy. Only three events are reported (see the text), no further options. */
function wNotify(nav, c) {
  const n = c.notify;
  const field = (ch, key, label, opts = {}) => {
    const inp = h("input", { type: opts.secret ? "password" : "text", value: n[ch][key] || "", placeholder: opts.ph || "", autocomplete: "off", onchange: () => savePatch({ notify: { [ch]: { [key]: inp.value.trim() } } }) });
    return [h("label", { class: "f" }, label), inp];
  };
  const card = (ch, name, how, fields) => {
    const st = statusEl();
    const state = h("span", { class: "state" }, n[ch].enabled ? "An" : "Aus");
    const on = h("input", { type: "checkbox", checked: !!n[ch].enabled, onchange: e => {
      const sw = e.target.closest(".switch"); state.textContent = e.target.checked ? "An" : "Aus"; sw.classList.toggle("on", e.target.checked);
      savePatch({ notify: { [ch]: { enabled: e.target.checked } } });
    } });
    const test = h("button", { class: "btn", onclick: async e => {
      const btn = e.currentTarget;
      for (const i of btn.closest(".apirow").querySelectorAll("input")) i.dispatchEvent(new Event("change"));      // save what was typed last
      try { await new Promise(r => setTimeout(r, 250)); await busy(btn, () => api("/notify/test", { json: { channel: ch } })); setStatus(st, true, "Testnachricht gesendet – schau in deinen Kanal"); }
      catch (err) { setStatus(st, false, err.message); }
    } }, "Testnachricht senden");
    return h("div", { class: "apirow" }, h("div", { class: "row" }, h("h3", { class: "grow" }, name), h("label", { class: "switch" + (n[ch].enabled ? " on" : ""), title: "Kanal ein- oder ausschalten" }, state, on, h("i"))),
      h("details", { class: "how" }, h("summary", {}, "So richtest du es ein"), h("div", { class: "hint" }, how)),
      fields, h("div", { class: "row", style: "margin-top:12px" }, test), st);
  };
  return h("div", {}, h("h1", {}, "Benachrichtigungen"),
    h("p", { class: "lead" }, "Optional: p5assets meldet sich nach einem Scan, wenn es etwas Neues gibt. Du kannst diesen Schritt überspringen und später in den Einstellungen nachholen."),
    h("div", { class: "status ok", style: "display:block;font-size:13px;line-height:1.7" }, "Es gibt genau drei Anlässe: ",
      h("b", {}, "① neue Titel ohne Poster"), " (Coming-Soon-Titel sind markiert, alles in einer Nachricht), ", h("b", {}, "② Fehler beim Scan"), " (einmal pro Fehler) und ",
      h("b", {}, "③ neue Einträge in „In Plex, Poster fehlt“"), ". Beim ersten Scan merkt sich p5assets nur den Ausgangsstand und schickt nichts."),
    card("discord", "Discord", "Server-Einstellungen → Integrationen → Webhooks → „Neuer Webhook“ → „Webhook-URL kopieren“ und hier einfügen.",
      field("discord", "webhook", "Webhook-URL", { secret: true, ph: "https://discord.com/api/webhooks/…" })),
    card("telegram", "Telegram", "Schreibe dem @BotFather „/newbot“ und folge den Fragen: du bekommst den Bot-Token. Schreibe deinem neuen Bot eine Nachricht und rufe https://api.telegram.org/bot<TOKEN>/getUpdates auf: die Zahl bei „chat“ → „id“ ist deine Chat-ID.",
      [field("telegram", "token", "Bot-Token", { secret: true, ph: "123456:ABC…" }), field("telegram", "chat_id", "Chat-ID", { ph: "z. B. 123456789" })]),
    card("ntfy", "ntfy", "Installiere die ntfy-App, abonniere ein eigenes, schwer zu erratendes Topic und trage es hier ein. Eigener Server: Adresse ändern; geschütztes Topic: Zugangs-Token eintragen.",
      [field("ntfy", "url", "Server", { ph: "https://ntfy.sh" }), field("ntfy", "topic", "Topic", { ph: "z. B. p5assets-mein-geheimes-topic" }), field("ntfy", "token", "Zugangs-Token (optional)", { secret: true })]),
    h("div", { class: "apirow" }, h("h3", {}, "Link in der Nachricht (optional)"),
      h("div", { class: "hint" }, "Adresse, unter der du p5assets im Heimnetz erreichst – wird als Link an die Nachricht gehängt."),
      h("input", { type: "text", value: n.base_url || "", placeholder: "http://192.168.1.10:8484", onchange: e => savePatch({ notify: { base_url: e.target.value.trim() } }) })),
    nav(null, "Weiter"));
}

function wDone() {
  return h("div", { style: "text-align:center" }, h("div", { class: "big" }, "🚀"), h("h1", {}, "Alles bereit!"),
    h("p", { class: "lead" }, "p5assets scannt jetzt deine Bibliotheken und zeigt dir, was fehlt."),
    h("button", { class: "btn primary", onclick: async () => { await api("/onboarding/finish", { method: "POST" }); await loadState(); S.filter = "all"; dashboard(); } }, "Scan starten"),
    h("div", { style: "margin-top:16px" }, h("button", { class: "btn ghost", onclick: stepPrev }, "Zurück")));
}

/* ------------------------------------------- pull to refresh (home-screen app) --- */
// An app added to the iPhone/iPad home screen has no browser pull-to-refresh: pulling down at the top reloads the page instead.
(function pullToRefresh() {
  const bar = h("div", { id: "ptr" }, "↓ Zum Aktualisieren ziehen");
  document.body.appendChild(bar);
  let y0 = null, dist = 0;
  const THRESHOLD = 90;
  const blocked = t => t.closest && t.closest(".drawer, .modalwrap, textarea, input, select");
  addEventListener("touchstart", e => { y0 = (window.scrollY <= 0 && e.touches.length === 1 && !blocked(e.target)) ? e.touches[0].clientY : null; dist = 0; }, { passive: true });
  addEventListener("touchmove", e => {
    if (y0 == null) return;
    dist = e.touches[0].clientY - y0;
    if (dist <= 0 || window.scrollY > 0) { bar.style.transform = ""; return; }
    const d = Math.min(dist / 2, THRESHOLD + 20);
    bar.style.transform = `translateY(${d}px)`;
    bar.textContent = d >= THRESHOLD / 2 + 10 ? "↑ Loslassen zum Aktualisieren" : "↓ Zum Aktualisieren ziehen";
  }, { passive: true });
  addEventListener("touchend", () => {
    if (y0 != null && dist / 2 >= THRESHOLD / 2 + 10) { bar.textContent = "Lade neu …"; location.reload(); }
    bar.style.transform = ""; y0 = null; dist = 0;
  }, { passive: true });
})();

boot();
