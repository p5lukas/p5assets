"use strict";
/* p5assets poster builder: a textless background, a clear logo (or the title as text) and a "Season One" line, drawn in the browser
 * (canvas) and saved as a 1000 × 1500 JPG through the normal upload. Loaded after app.js (uses its helpers). */

const BW = 1000, BH = 1500;
// id = file name in /static/fonts and part of the CSS family "p5-<id>"; the list must match FONTS in app/styles.py
const BUILD_FONTS = [["montserrat", "Montserrat", 700], ["raleway", "Raleway", 700], ["oswald", "Oswald", 700], ["bebas-neue", "Bebas Neue", 400],
  ["anton", "Anton", 400], ["cinzel", "Cinzel", 700], ["playfair-display", "Playfair Display", 700], ["lato", "Lato", 700]];
const BUILD_DEFAULT = { font: "montserrat", upper: true, mode: "logo", titleScale: 0.7, titleY: 0.86, seasonScale: 0.9, gap: 0.02, tracking: 0.22, color: null, titleColor: "#ffffff" };
const BUILD_OVERRIDE = ["titleScale", "titleY", "seasonScale", "gap", "color"];     // may differ per poster; everything else is the same on all posters

/* ---------------------------------------------------------------- texts --- */
const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const numberWord = n => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "") : String(n);
/** The line under the title: "Season One" … "Season Twenty-One", "Specials" (always English, like the sets on ThePosterDB). */
const seasonLine = n => n === 0 ? "Specials" : "Season " + numberWord(n);

/* ------------------------------------------------------------ resources --- */
const fontReady = {};
function ensureFont(id) {
  const def = BUILD_FONTS.find(f => f[0] === id) || BUILD_FONTS[0];
  return fontReady[def[0]] ||= Promise.all([document.fonts.load(`${def[2]} 48px "p5-${def[0]}"`), document.fonts.load('400 48px "p5-source-sans-3"')]).catch(() => []);
}
const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) imageCache.set(src, new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("image")); i.src = src; }));
  return imageCache.get(src);
}
const proxied = url => url && url.startsWith("http") ? "/api/proxy?url=" + encodeURIComponent(url) : url;

/** A colour that fits the picture: the dominant hue of the saturated pixels, light enough to read on a dark poster. */
function autoColorOf(img) {
  const w = 24, hgt = 36, c = document.createElement("canvas"); c.width = w; c.height = hgt;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, hgt);
  const d = x.getImageData(0, 0, w, hgt).data;
  let sx = 0, sy = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, ch = mx - mn;
    if (ch < 0.04) continue;
    const hue = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
    const wt = ch * (1 - Math.abs(2 * l - 1)) + 0.001;
    sx += Math.cos(hue * Math.PI / 3) * wt; sy += Math.sin(hue * Math.PI / 3) * wt; wsum += wt;
  }
  if (wsum < w * hgt * 0.03) return "#f1f1ee";
  return hslHex(((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360, 0.82, 0.74);
}
function hslHex(hue, s, l) {
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + hue / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------- drawing --- */
/** Draws one poster. o = { bg, logo, title, line, st (merged style), color } – images are already loaded (or null). */
function drawBuilt(canvas, o) {
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext("2d"), st = o.st;
  const def = BUILD_FONTS.find(f => f[0] === st.font) || BUILD_FONTS[0], fam = `"p5-${def[0]}", sans-serif`;
  ctx.clearRect(0, 0, W, H);
  if (o.bg) {                                                      // cover fit
    const s = Math.max(W / o.bg.naturalWidth, H / o.bg.naturalHeight), dw = o.bg.naturalWidth * s, dh = o.bg.naturalHeight * s;
    ctx.drawImage(o.bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b1a12"); g.addColorStop(1, "#03100a"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const upper = t => st.upper ? t.toUpperCase() : t;
  // title: logo or text lines
  let titleH = 0, drawTitle = () => {};
  if (st.mode === "logo" && o.logo) {
    const lw = o.logo.naturalWidth, lh = o.logo.naturalHeight;
    const s = Math.min(W * 0.8 * st.titleScale / lw, H * 0.28 * st.titleScale / lh, W * 0.94 / lw), dw = lw * s, dh = lh * s;
    titleH = dh; drawTitle = top => ctx.drawImage(o.logo, (W - dw) / 2, top, dw, dh);
  } else if (o.title) {
    let fs = W * 0.095 * st.titleScale, lines;
    const maxW = W * 0.84, measure = () => { ctx.font = `${def[2]} ${fs}px ${fam}`; lines = wrapLines(ctx, upper(o.title), maxW); return Math.max(...lines.map(l => ctx.measureText(l).width)); };
    while (measure() > maxW && fs > 8) fs *= 0.94;
    const lh = fs * 1.1; titleH = lines.length * lh;
    drawTitle = top => {
      ctx.font = `${def[2]} ${fs}px ${fam}`; ctx.fillStyle = st.titleColor || "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lh * i + fs * 0.86));
    };
  }
  // season line under the title
  const fsS = W * 0.05 * st.seasonScale, gapPx = o.line ? st.gap * H : 0, lineH = o.line ? fsS * 1.15 : 0;
  const total = titleH + gapPx + lineH;
  const top = Math.min(Math.max(st.titleY * H - total / 2, H * 0.03), H * 0.97 - total);
  drawTitle(top);
  if (o.line) {
    ctx.font = `400 ${fsS}px "p5-source-sans-3", sans-serif`; ctx.fillStyle = o.color || "#ffffff"; ctx.textBaseline = "alphabetic";
    drawTracked(ctx, upper(o.line), W / 2, top + titleH + gapPx + fsS * 0.86, st.tracking * fsS);
  }
}
function wrapLines(ctx, text, maxW) {
  const lines = []; let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = cur ? cur + " " + word : word;
    if (!cur || ctx.measureText(test).width <= maxW) cur = test; else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function drawTracked(ctx, text, cx, y, track) {
  const chars = [...text], widths = chars.map(c => ctx.measureText(c).width), total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  let x = cx - total / 2; ctx.textAlign = "left";
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + track; });
}

/* -------------------------------------------------------------- builder --- */
/** The editor. opts = { item, slots: [{ key, season, label }], multi, onSaved(lastItem, keys, trashId), onCancel }. Returns the DOM element. */
function makeBuilder(opts) {
  const it = opts.item, multi = !!opts.multi, slots = opts.slots;
  const G = { ...BUILD_DEFAULT };                                   // the look shared by all posters
  let titleText = it.title, logo = null /* { url, preview, source } */, logoList = null, logoNote = "", presets = {}, scope = "all", sel = slots[0].key, saving = false;
  const P = Object.fromEntries(slots.map(s => [s.key, { bg: null, line: s.season == null ? "" : seasonLine(s.season), lineEdited: false, over: {}, checked: true, auto: null }]));
  const val = (key, attr) => attr in P[key].over ? P[key].over[attr] : G[attr];
  const style = key => ({ ...G, ...Object.fromEntries(BUILD_OVERRIDE.map(a => [a, val(key, a)])) });
  const colorOf = key => { const c = val(key, "color"); return c || P[key].auto || "#f1f1ee"; };

  const root = h("div", { class: "builder" });
  const cards = {}, canvases = {};
  const status = h("div", { class: "hint bstatus", "aria-live": "polite" });

  /* --- drawing ---------------------------------------------------------- */
  async function paint(key, full = false) {
    const p = P[key], cv = canvases[key];
    await ensureFont(G.font);
    const [bg, lg] = await Promise.all([p.bg ? loadImage(proxied(full ? p.bg.url : p.bg.preview || p.bg.url)).catch(() => null) : null,
      logo && G.mode === "logo" ? loadImage(proxied(full ? logo.url : logo.preview || logo.url)).catch(() => null) : null]);
    if (bg && !p.auto) p.auto = autoColorOf(bg);
    const out = full ? Object.assign(document.createElement("canvas"), { width: BW, height: BH }) : cv;
    drawBuilt(out, { bg, logo: lg, title: titleText, line: P[key].line, st: style(key), color: colorOf(key) });
    return out;
  }
  const paintAll = () => slots.forEach(s => paint(s.key));
  const redraw = attr => (BUILD_OVERRIDE.includes(attr) && scope === "one" ? paint(sel) : paintAll());

  /* --- backgrounds ------------------------------------------------------ */
  async function setBg(key, bg) { P[key].bg = bg; P[key].auto = null; cards[key].classList.toggle("nobg", !bg); await paint(key); syncControls(); }
  const bgFromFile = (key, files) => {
    const f = (files || []).map(x => x.file).find(x => x && /^image\//.test(x.type));
    if (!f) { toast(T("Keine Bilder gefunden"), "bad"); return; }
    const u = URL.createObjectURL(f); setBg(key, { url: u, preview: u, name: f.name });
  };
  const bgOnline = key => searchOnline(it, key, null, { pick: img => setBg(key, { url: img.url, preview: img.preview || img.url, name: img.source }), title: T("Hintergrund wählen") });
  async function autoBackgrounds() {
    const todo = slots.filter(s => !P[s.key].bg);
    if (!todo.length) { toast(T("Alle Poster haben schon einen Hintergrund"), "ok"); return; }
    let found = 0;
    for (const [i, s] of todo.entries()) {
      status.textContent = T("Suche textlose Poster … {0} von {1}", i + 1, todo.length);
      try {
        const r = await api(`/items/${it.id}/${s.key}/search`);
        const best = r.images.filter(x => x.lang === "xx").sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        if (best) { found++; await setBg(s.key, { url: best.url, preview: best.preview || best.url, name: best.source }); }
      } catch (e) { toast(e.message, "bad"); break; }
    }
    status.textContent = T("{0} von {1} textlosen Postern gefunden – die übrigen kannst du selbst suchen oder hochladen", found, todo.length);
  }

  /* --- logo ------------------------------------------------------------- */
  async function loadLogos() {
    try {
      const r = await api(`/items/${it.id}/logos`);
      logoList = r.images;
      if (!logoList.length) { logoNote = T("Kein Logo gefunden – der Titel wird als Text gesetzt"); G.mode = "text"; }
      else if (!logo) { logo = { url: logoList[0].url, preview: logoList[0].preview, source: logoList[0].source }; G.mode = "logo"; }
    } catch (e) { logoList = []; logoNote = e.message; G.mode = "text"; }
    syncControls(); paintAll();
  }
  function pickLogo() {
    const list = logoList || [];
    const grid = h("div", { class: "logogrid" }, list.map(l => h("button", { class: "logopick" + (logo && logo.url === l.url ? " on" : ""), onclick: () => { logo = { url: l.url, preview: l.preview, source: l.source }; G.mode = "logo"; m.close(); syncControls(); paintAll(); } },
      h("img", { src: proxied(l.preview || l.url), alt: "", loading: "lazy" }), h("small", {}, `${l.source}${l.lang && l.lang !== "xx" ? " · " + l.lang : ""}`))));
    const m = modal(T("Logo wählen"), h("div", {}, list.length ? grid : h("div", { class: "hint" }, logoNote || T("Kein Logo gefunden – der Titel wird als Text gesetzt"))),
      [h("button", { class: "btn", onclick: () => { G.mode = "text"; m.close(); syncControls(); paintAll(); } }, T("Titel als Text verwenden")), h("button", { class: "btn ghost", onclick: () => m.close() }, T("Schließen"))]);
  }

  /* --- controls --------------------------------------------------------- */
  const ctl = {};
  function slider(label, attr, min, max, step, fmt) {
    const out = h("span", { class: "bval" }), inp = h("input", { type: "range", min, max, step, oninput: () => {
      const v = +inp.value;
      if (BUILD_OVERRIDE.includes(attr)) { if (scope === "all") { G[attr] = v; slots.forEach(s => delete P[s.key].over[attr]); } else P[sel].over[attr] = v; } else G[attr] = v;
      out.textContent = fmt(v); redraw(attr);
    } });
    const row = h("label", { class: "brow" }, h("span", { class: "blab" }, label), inp, out);
    ctl[attr] = () => { const v = BUILD_OVERRIDE.includes(attr) ? val(sel, attr) : G[attr]; inp.value = v; out.textContent = fmt(v); };
    ctl[attr].row = row;
    return row;
  }
  const pct = v => Math.round(v * 100) + " %";
  const fontSel = h("select", { onchange: async e => { G.font = e.target.value; await ensureFont(G.font); paintAll(); } }, BUILD_FONTS.map(f => h("option", { value: f[0] }, f[1])));
  const upperChk = h("input", { type: "checkbox", onchange: e => { G.upper = e.target.checked; paintAll(); } });
  const textInp = h("input", { type: "text", maxlength: 120, oninput: e => { titleText = e.target.value; paintAll(); } });
  const lineInp = h("input", { type: "text", maxlength: 40, oninput: e => { P[sel].line = e.target.value; P[sel].lineEdited = true; paint(sel); } });
  const colorInp = h("input", { type: "color", oninput: e => setAttr("color", e.target.value) });
  const colorAuto = h("button", { class: "btn sm", type: "button", title: T("Die Farbe passend zum Poster automatisch wählen"), onclick: () => setAttr("color", null) }, T("Auto"));
  const titleColorInp = h("input", { type: "color", oninput: e => { G.titleColor = e.target.value; paintAll(); } });
  const modeLogo = h("button", { class: "seg", type: "button", onclick: () => { if (logo) { G.mode = "logo"; syncControls(); paintAll(); } else pickLogo(); } }, T("Logo"));
  const modeText = h("button", { class: "seg", type: "button", onclick: () => { G.mode = "text"; syncControls(); paintAll(); } }, T("Text"));
  const logoBtn = h("button", { class: "btn sm", type: "button", onclick: pickLogo }, T("Logo wählen …"));
  const bgName = h("span", { class: "hint bgname" });
  const scopeAll = h("input", { type: "radio", name: "bscope", checked: true, onchange: () => { scope = "all"; syncControls(); } });
  const scopeOne = h("input", { type: "radio", name: "bscope", onchange: () => { scope = "one"; syncControls(); } });
  const presetSel = h("select", { onchange: e => { const p = presets[e.target.value]; if (!p) return; applyPreset(p); e.target.value = ""; } });
  function setAttr(attr, v) {
    if (scope === "all") { G[attr] = v; slots.forEach(s => delete P[s.key].over[attr]); } else P[sel].over[attr] = v;
    syncControls(); redraw(attr);
  }
  function applyPreset(p) {
    Object.assign(G, BUILD_DEFAULT, p); if (!logo) G.mode = "text"; slots.forEach(s => { P[s.key].over = {}; });
    syncControls(); paintAll();
  }
  function drawPresets() {
    fill(presetSel, h("option", { value: "" }, T("Vorlage anwenden …")), Object.keys(presets).sort().map(n => h("option", { value: n }, n)));
  }
  async function savePreset() {
    const name = (prompt(T("Name der Vorlage")) || "").trim();
    if (!name) return;
    try { presets = (await api("/styles/presets/" + encodeURIComponent(name), { method: "PUT", json: { style: G } })).presets; drawPresets(); toast(T("Vorlage gespeichert"), "ok"); } catch (e) { toast(e.message, "bad"); }
  }
  async function deletePreset() {
    const name = presetSel.value || Object.keys(presets)[0];
    const names = Object.keys(presets).sort();
    if (!names.length) return;
    const pick = prompt(T("Welche Vorlage löschen?\n{0}", names.join(", ")), name) || "";
    if (!presets[pick]) return;
    presets = (await api("/styles/presets/" + encodeURIComponent(pick), { method: "DELETE" })).presets; drawPresets();
  }
  function syncControls() {
    const key = sel, seasonSlot = P[key].line !== "" || slots.find(s => s.key === key).season != null;
    root.querySelectorAll(".bcard").forEach(c => c.classList.toggle("editing", c.dataset.key === key));
    fontSel.value = G.font; upperChk.checked = !!G.upper; textInp.value = titleText;
    modeLogo.classList.toggle("on", G.mode === "logo"); modeText.classList.toggle("on", G.mode === "text");
    modeLogo.disabled = false; logoBtn.hidden = false; logoBtn.textContent = logo ? T("Anderes Logo …") : T("Logo wählen …");
    textInp.closest(".brow").hidden = G.mode === "logo"; titleColorInp.closest(".brow").hidden = G.mode === "logo";
    titleColorInp.value = G.titleColor || "#ffffff"; colorInp.value = colorOf(key);
    lineInp.value = P[key].line; lineInp.closest(".brow").hidden = !seasonSlot;
    colorInp.closest(".brow").hidden = !seasonSlot;
    for (const a of ["seasonScale", "gap", "tracking"]) ctl[a].row.hidden = !seasonSlot;
    controls.querySelector(".bseason").hidden = !seasonSlot;
    for (const k of Object.keys(ctl)) if (typeof ctl[k] === "function") ctl[k]();
    colorAuto.classList.toggle("on", val(key, "color") == null);
    bgName.textContent = P[key].bg ? P[key].bg.name : T("noch kein Hintergrund");
    scopeAll.checked = scope === "all"; scopeOne.checked = scope === "one";
    root.querySelector(".bedit").textContent = slots.find(s => s.key === key).label;
    root.querySelector(".bnote").textContent = logoNote;
    const n = slots.filter(s => P[s.key].checked && P[s.key].bg).length;
    saveBtn.disabled = saving || !n; saveBtn.textContent = TP(n, "Ein Poster speichern", "{0} Poster speichern");
  }

  /* --- cards ------------------------------------------------------------ */
  function selectSlot(key) { sel = key; syncControls(); }
  const grid = h("div", { class: "bgrid" }, slots.map(s => {
    const cv = h("canvas", { width: 300, height: 450 }); canvases[s.key] = cv;
    const chk = h("input", { type: "checkbox", checked: true, title: T("Dieses Poster speichern"), onclick: e => e.stopPropagation(), onchange: e => { P[s.key].checked = e.target.checked; syncControls(); } });
    const card = h("div", { class: "bcard nobg", "data-key": s.key, onclick: () => selectSlot(s.key) },
      h("div", { class: "poster bposter", "data-key": it.id + "|" + s.key }, cv,
        h("button", { class: "bplus", type: "button", title: T("Hintergrund wählen"), onclick: e => { e.stopPropagation(); selectSlot(s.key); bgOnline(s.key); } }, "＋", h("small", {}, T("Hintergrund")))),
      h("div", { class: "blabel" }, multi ? chk : null, h("span", {}, s.label)));
    makeDropTarget(card, files => bgFromFile(s.key, files));
    cards[s.key] = card; return card;
  }));
  const saveBtn = h("button", { class: "btn primary", type: "button", onclick: () => save() }, "");

  /* --- saving ----------------------------------------------------------- */
  async function save() {
    const keys = slots.filter(s => P[s.key].checked && P[s.key].bg).map(s => s.key);
    if (!keys.length || saving) return;
    const overwritten = keys.filter(k => it.slots[k] && it.slots[k].exists);
    if (overwritten.length && !confirm(TP(overwritten.length, "Ein vorhandenes Poster wird ersetzt (das alte liegt 30 Tage im Papierkorb). Fortfahren?", "{0} vorhandene Poster werden ersetzt (die alten liegen 30 Tage im Papierkorb). Fortfahren?"))) return;
    saving = true; syncControls();
    let last = null, trash = null, done = 0;
    try {
      for (const key of keys) {
        busyTile(it.id + "|" + key, true);
        status.textContent = T("Speichere … {0} von {1}", done + 1, keys.length);
        try {
          const cv = await paint(key, true);
          const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.92));
          const fd = new FormData(); fd.append("file", new File([blob], "poster.jpg", { type: "image/jpeg" }));
          const r = await api(`/items/${it.id}/${key}/upload`, { method: "POST", body: fd });
          last = r.item; trash = r.trash; done++; S.rain.add(it.id + "|" + key);
          if (r.warning) toast(T("Plex: ") + r.warning, "bad");
        } finally { busyTile(it.id + "|" + key, false); }
      }
      try { await api("/styles/last", { method: "PUT", json: { style: G } }); } catch { /* optional */ }
      toast(TP(done, "Poster gespeichert ✓", "{0} Poster gespeichert ✓"), "ok", trash && done === 1 ? { label: T("Rückgängig"), fn: async () => { try { await api(`/trash/${trash}/restore`, { method: "POST" }); loadItems().then(renderGrid); } catch (e) { toast(e.message, "bad"); } } } : null);
      if (opts.onSaved) opts.onSaved(last, keys, trash);
    } catch (e) { toast(e.message, "bad"); }
    finally { saving = false; status.textContent = ""; syncControls(); }
  }

  /* --- layout ----------------------------------------------------------- */
  const controls = h("div", { class: "bcontrols" },
    h("div", { class: "bhead" }, h("span", { class: "hint", style: "margin:0" }, T("Bearbeitet:")), h("b", { class: "bedit" }), multi ? h("span", { class: "spacer" }) : null,
      multi ? h("div", { class: "bscope", role: "radiogroup", "aria-label": T("Änderungen gelten für") }, h("label", {}, scopeAll, T("alle Poster")), h("label", {}, scopeOne, T("nur dieses"))) : null),
    h("div", { class: "bsec" }, h("h4", {}, T("Hintergrund")),
      h("div", { class: "row wrap" }, h("button", { class: "btn sm", type: "button", onclick: () => bgOnline(sel) }, icon("search", 14), T("Online suchen")),
        h("button", { class: "btn sm", type: "button", onclick: () => pickFiles(files => bgFromFile(sel, files), false) }, icon("upload", 14), T("Datei wählen")),
        multi ? h("button", { class: "btn sm", type: "button", title: T("Sucht für jedes Poster ohne Hintergrund das beste textlose Poster"), onclick: autoBackgrounds }, T("Textlose automatisch suchen")) : null),
      h("div", { class: "hint" }, bgName, " · ", T("oder ein Bild auf ein Poster ziehen"))),
    h("div", { class: "bsec" }, h("h4", {}, T("Titel")),
      h("div", { class: "row wrap" }, h("div", { class: "segs" }, modeLogo, modeText), logoBtn),
      h("div", { class: "hint bnote" }),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Text")), textInp),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Titelfarbe")), titleColorInp),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Schrift")), fontSel, h("label", { class: "bchk" }, upperChk, T("Großbuchstaben"))),
      slider(T("Titelgröße"), "titleScale", 0.4, 1.6, 0.01, pct),
      slider(T("Titelhöhe"), "titleY", 0.1, 0.9, 0.005, pct)),
    h("div", { class: "bsec bseason" }, h("h4", {}, T("Staffeltext")),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Text")), lineInp),
      slider(T("Textgröße"), "seasonScale", 0.5, 2.4, 0.01, pct), slider(T("Abstand zum Titel"), "gap", 0, 0.1, 0.002, pct), slider(T("Laufweite"), "tracking", 0, 0.4, 0.005, pct),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Farbe")), colorInp, colorAuto)),
    h("div", { class: "bsec" }, h("h4", {}, T("Vorlagen")),
      h("div", { class: "row wrap" }, presetSel, h("button", { class: "btn sm", type: "button", onclick: savePreset }, T("Als Vorlage speichern …")), h("button", { class: "btn sm ghost", type: "button", onclick: deletePreset }, T("Vorlage löschen …")))),
    h("div", { class: "row wrap bfoot" }, saveBtn, opts.onCancel ? h("button", { class: "btn", type: "button", onclick: opts.onCancel }, T("Abbrechen")) : null, status));
  root.append(grid, controls);

  (async () => {
    try { const st = await api("/styles"); presets = st.presets || {}; if (st.last) Object.assign(G, st.last); } catch { /* optional */ }
    drawPresets(); syncControls(); paintAll(); loadLogos();
  })();
  return root;
}

/* ---------------------------------------------------------- entry points --- */
/** The tiles of a title that can be built: the series poster / movie poster and all seasons, in order. */
function buildSlotsFor(it) {
  const keys = Object.keys(it.slots).filter(k => !it.slots[k].extra && (it.type === "show" || k === "poster")).sort((a, b) => seasonNum(a) - seasonNum(b));
  return keys.map(k => ({ key: k, season: k === "poster" ? null : seasonNum(k), label: slotLabel(k, it.type) }));
}
/** Movies: a window with one poster. */
function openMovieBuilder(it, draw) {
  const m = modal(T("Poster bauen – {0}", it.title), h("div", {}));
  const b = makeBuilder({ item: it, multi: false, slots: buildSlotsFor(it), onSaved: item => { m.close(); if (draw) draw(item); }, onCancel: () => m.close() });
  m.el.querySelector(".modal").classList.add("wide");
  m.el.querySelector(".body").replaceChildren(b);
}
/** Series: the detail view turns into the build mode (same window); the letters scramble on the way in and out. */
function openSeriesBuilder({ it, drawer, close, back }) {
  matrixSwap(() => {
    const b = makeBuilder({ item: it, multi: true, slots: buildSlotsFor(it), onSaved: item => back(item), onCancel: () => back() });
    fill(drawer, h("header", {}, h("button", { class: "btn ghost", "aria-label": T("Schließen"), onclick: close }, "✕"),
      h("div", { class: "grow" }, h("h2", {}, T("Poster bauen – {0}", it.title)), h("div", { class: "hint", style: "margin:2px 0" }, T("Alle Poster der Serie in einem Look: Hintergrund, Logo oder Titel, Staffeltext")))),
      h("div", { class: "body" }, b));
    drawer.scrollTop = 0;
  });
}
