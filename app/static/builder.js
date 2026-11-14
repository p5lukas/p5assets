"use strict";
/* p5assets poster builder: a textless background, a clear logo (or the title as text) and a "Season One" line, drawn in the browser
 * (canvas) and saved as a 1000 × 1500 JPG through the normal upload. Loaded after app.js (uses its helpers). */

const BW = 1000, BH = 1500;
// id = file name in /static/fonts and part of the CSS family "p5-<id>"; the list must match FONTS in app/styles.py
const BUILD_FONTS = [["montserrat", "Montserrat", 700], ["raleway", "Raleway", 700], ["oswald", "Oswald", 700], ["bebas-neue", "Bebas Neue", 400],
  ["anton", "Anton", 400], ["cinzel", "Cinzel", 700], ["playfair-display", "Playfair Display", 700], ["lato", "Lato", 700]];
const BUILD_DEFAULT = { font: "montserrat", upper: true, mode: "logo", titleScale: 0.7, titleY: 0.82, seasonScale: 0.9, gap: 0.02, tracking: 0.22, titleColor: "#ffffff" };     // same on all posters; only the colour of the season line is per poster

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
  // The title (logo or text) sits at the same height on every poster; the season line hangs below it. Room for the line is always reserved so
  // that the clamp near the edges is the same with and without a line.
  const fsS = W * 0.05 * st.seasonScale, gapPx = st.gap * H, lineH = fsS * 1.15;
  const top = Math.min(Math.max(st.titleY * H - titleH / 2, H * 0.03), H * 0.97 - (titleH + gapPx + lineH));
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
/** The editor. opts = { item, slots: [{ key, season, label }], multi, onSaved(lastItem, keys, trashId), onCancel }. Returns the DOM element.
 *  Size, position and fonts are the same on every poster (consistency); only the background and the colour of the season line belong to a poster. */
function makeBuilder(opts) {
  const it = opts.item, multi = !!opts.multi, slots = opts.slots;
  const G = { ...BUILD_DEFAULT };                                   // the look shared by all posters
  let titleText = it.title, logo = null /* { url, preview, source } */, logoRes = null, logoNote = "", presets = {}, sel = slots[0].key, saving = false;
  const P = Object.fromEntries(slots.map(s => [s.key, { bg: null, line: s.season == null ? "" : seasonLine(s.season), color: null, checked: true, auto: null }]));
  const colorOf = key => P[key].color || P[key].auto || "#f1f1ee";

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
    drawBuilt(out, { bg, logo: lg, title: titleText, line: p.line, st: G, color: colorOf(key) });
    return out;
  }
  const paintAll = () => slots.forEach(s => paint(s.key));

  /* --- backgrounds ------------------------------------------------------ */
  async function setBg(key, bg) { P[key].bg = bg; P[key].auto = null; cards[key].draggable = !!bg; await paint(key); syncControls(); }
  const bgFromFile = (key, files) => {
    const f = (files || []).map(x => x.file).find(x => x && /^image\//.test(x.type));
    if (!f) { toast(T("Keine Bilder gefunden"), "bad"); return; }
    const u = URL.createObjectURL(f); setBg(key, { url: u, preview: u, name: f.name });
  };
  const bgOnline = key => searchOnline(it, key, null, { pick: img => setBg(key, { url: img.url, preview: img.preview || img.url, name: img.source }), title: T("Hintergrund wählen") });
  const copyBg = (from, to) => { if (from !== to && P[from].bg) setBg(to, { ...P[from].bg }); };
  function bgForAll() {
    const src = P[sel].bg; if (!src) return;
    const others = slots.filter(s => s.key !== sel), filled = others.filter(s => P[s.key].bg);
    const replace = filled.length ? confirm(TP(filled.length, "Ein Poster hat schon einen Hintergrund. Auch dieses ersetzen? (Abbrechen = nur leere Poster füllen)",
      "{0} Poster haben schon einen Hintergrund. Auch diese ersetzen? (Abbrechen = nur leere Poster füllen)")) : false;
    others.filter(s => replace || !P[s.key].bg).forEach(s => setBg(s.key, { ...src }));
  }

  /* --- logo ------------------------------------------------------------- */
  async function loadLogos() {
    try {
      logoRes = await api(`/items/${it.id}/logos`);
      const first = logoRes.images[0];
      if (!first) { logoNote = T("Kein Logo gefunden – der Titel wird als Text gesetzt"); if (!logo) G.mode = "text"; }
      else if (!logo) { logo = { url: first.url, preview: first.preview, source: first.source }; G.mode = "logo"; }
    } catch (e) { logoRes = { images: [], providers: [], languages: [] }; logoNote = e.message; if (!logo) G.mode = "text"; }
    syncControls(); paintAll();
  }
  function useLogo(l) { logo = l; G.mode = "logo"; syncControls(); paintAll(); }
  function logoFromFile(files) {
    const f = (files || []).map(x => x.file).find(Boolean);
    if (!f) return;
    if (!/\.(png|webp)$/i.test(f.name) && !/^image\/(png|webp)$/.test(f.type)) { toast(T("Nur PNG oder WebP mit Transparenz – ein JPG hat keinen transparenten Hintergrund"), "bad"); return; }
    const u = URL.createObjectURL(f); useLogo({ url: u, preview: u, source: f.name });
  }
  function pickLogoFile() {
    const i = h("input", { type: "file", accept: "image/png,image/webp,.png,.webp", onchange: () => { if (i.files[0]) logoFromFile([{ file: i.files[0], path: i.files[0].name }]); } });
    i.click();
  }
  /** Same layout as the poster search: sources as tabs on top, the logos below grouped by language. */
  function pickLogo() {
    const r = { images: [], providers: [], languages: [], ...(logoRes || {}) };
    const body = h("div", {}), tabs = h("div", { class: "tabs" }), content = h("div");
    const byCode = Object.fromEntries(S.langs.map(l => [l.code, l]));
    const langTitle = code => { const l = byCode[code]; if (code === "xx") return T("Ohne Sprache"); const name = !l ? code : l.native && l.native !== l.name ? `${l.name} (${l.native})` : l.name; return `${code} • ${name}`; };
    let tab = "*";
    const m = modal(T("Logo wählen"), body, [h("button", { class: "btn", onclick: () => { m.close(); pickLogoFile(); } }, icon("upload", 14), T("Logo hochladen")),
      h("button", { class: "btn", onclick: () => { G.mode = "text"; m.close(); syncControls(); paintAll(); } }, T("Titel als Text verwenden")), h("button", { class: "btn ghost", onclick: () => m.close() }, T("Schließen"))]);
    const pick = l => h("div", { class: "pick" + (logo && logo.url === l.url ? " on" : ""), onclick: () => { m.close(); useLogo({ url: l.url, preview: l.preview, source: l.source }); } },
      h("img", { src: proxied(l.preview || l.url), alt: "", loading: "lazy" }));
    function render() {
      fill(tabs, [{ name: "*", label: T("Alle"), state: "ok", count: r.images.length }, ...r.providers].map(pv => h("button", {
        class: "tab" + (tab === pv.name ? " on" : "") + (pv.state !== "ok" ? " off" : ""), disabled: pv.state === "nokey",
        title: pv.state === "nokey" ? T("Kein API-Key hinterlegt (Einstellungen → Quellen)") : pv.state === "error" ? pv.error : "",
        onclick: () => { tab = pv.name; render(); } },
        pv.label || pv.name, h("small", {}, pv.state === "nokey" ? T("kein Key") : pv.state === "error" ? T("Fehler") : pv.count))));
      const list = tab === "*" ? r.images : r.images.filter(i => i.source === tab);
      const groups = r.languages.map(l => ({ code: l.code, imgs: list.filter(i => i.lang === l.code) }));
      const others = {};
      list.filter(i => !r.languages.some(l => l.code === i.lang)).forEach(i => (others[i.lang || "xx"] ||= []).push(i));
      Object.keys(others).sort((a, b) => others[b].length - others[a].length).forEach(code => groups.push({ code, imgs: others[code], other: true }));
      const prov = r.providers.find(p => p.name === tab);
      fill(content,
        prov && prov.state === "error" ? h("div", { class: "status bad" }, `[ !! ] ${prov.name}: ${prov.error}`) : null,
        tab === "*" ? r.providers.filter(p => p.state === "error").map(p => h("div", { class: "status bad" }, `[ !! ] ${p.name}: ${p.error}`)) : null,
        groups.filter(g => g.imgs.length).map((g, n) => h("div", { class: "langgroup" },
          h("h4", {}, g.other ? T("Weitere Sprache · ") : `${n + 1}. `, langTitle(g.code), h("small", {}, ` ${g.imgs.length}`)),
          h("div", { class: "picks logos" }, g.imgs.map(pick)))),
        list.length ? null : h("div", { class: "empty" }, logoNote || T("Keine Logos gefunden.")));
    }
    fill(body, tabs, content); render();
  }

  /* --- controls --------------------------------------------------------- */
  const ctl = {};
  /** A slider row: label, slider, value, "Default" button. The row always has the same layout so the sliders keep the same length. */
  function slider(label, attr, min, max, step, fmt) {
    const def = BUILD_DEFAULT[attr], out = h("span", { class: "bval" });
    const show = v => { out.textContent = fmt(v); reset.classList.toggle("dim", Math.abs(v - def) < step / 2); };
    const inp = h("input", { type: "range", min, max, step, oninput: () => { G[attr] = +inp.value; show(G[attr]); paintAll(); } });
    const reset = h("button", { class: "btn sm breset", type: "button", title: T("Auf Standard zurücksetzen"), onclick: () => { inp.value = def; G[attr] = def; show(def); paintAll(); } }, T("Standard"));
    const row = h("div", { class: "brow srow" }, h("span", { class: "blab" }, label), inp, out, reset);
    ctl[attr] = () => { inp.value = G[attr]; show(G[attr]); };
    ctl[attr].row = row;
    return row;
  }
  const pct = v => Math.round(v * 100) + " %";
  const fontSel = h("select", { onchange: async e => { G.font = e.target.value; await ensureFont(G.font); paintAll(); } }, BUILD_FONTS.map(f => h("option", { value: f[0] }, f[1])));
  const upperChk = h("input", { type: "checkbox", onchange: e => { G.upper = e.target.checked; paintAll(); } });
  const textInp = h("input", { type: "text", maxlength: 120, oninput: e => { titleText = e.target.value; paintAll(); } });
  const lineInp = h("input", { type: "text", maxlength: 40, oninput: e => { P[sel].line = e.target.value; paint(sel); } });
  const setColor = c => { P[sel].color = c; syncControls(); paint(sel); };
  const colorInp = h("input", { type: "color", oninput: e => setColor(e.target.value) });
  const colorAuto = h("button", { class: "btn sm", type: "button", title: T("Die Farbe passend zum Poster automatisch wählen"), onclick: () => setColor(null) }, T("Auto"));
  const titleColorInp = h("input", { type: "color", oninput: e => { G.titleColor = e.target.value; paintAll(); } });
  const modeLogo = h("button", { class: "seg", type: "button", onclick: () => { if (logo) { G.mode = "logo"; syncControls(); paintAll(); } else pickLogo(); } }, T("Logo"));
  const modeText = h("button", { class: "seg", type: "button", onclick: () => { G.mode = "text"; syncControls(); paintAll(); } }, T("Text"));
  const logoBtn = h("button", { class: "btn sm", type: "button", onclick: pickLogo }, T("Logo wählen …"));
  const logoUp = h("button", { class: "btn sm", type: "button", onclick: pickLogoFile }, icon("upload", 14), T("Logo hochladen"));
  const bgName = h("span", { class: "hint bgname" });
  const allBtn = h("button", { class: "btn sm", type: "button", onclick: bgForAll }, T("Für alle übernehmen"));
  const copySel = h("select", { class: "bcopy", "aria-label": T("Hintergrund übernehmen von …"), onchange: e => { const k = e.target.value; e.target.value = ""; if (k) copyBg(k, sel); } });
  const presetSel = h("select", { onchange: e => { const p = presets[e.target.value]; if (!p) return; applyPreset(p); e.target.value = ""; } });
  function applyPreset(p) {
    Object.assign(G, BUILD_DEFAULT, p); delete G.color; if (!logo) G.mode = "text";
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
    logoBtn.textContent = logo ? T("Anderes Logo …") : T("Logo wählen …");
    textInp.closest(".brow").hidden = G.mode === "logo"; titleColorInp.closest(".brow").hidden = G.mode === "logo";
    titleColorInp.value = G.titleColor || "#ffffff"; colorInp.value = colorOf(key);
    lineInp.value = P[key].line; lineInp.closest(".brow").hidden = !seasonSlot;
    colorInp.closest(".brow").hidden = !seasonSlot;
    for (const a of ["seasonScale", "gap", "tracking"]) ctl[a].row.hidden = !seasonSlot;
    controls.querySelector(".bseason").hidden = !seasonSlot;
    for (const k of Object.keys(ctl)) ctl[k]();
    colorAuto.classList.toggle("on", P[key].color == null);
    bgName.textContent = P[key].bg ? P[key].bg.name : T("noch kein Hintergrund");
    if (multi) {
      allBtn.disabled = !P[key].bg || slots.length < 2;
      const from = slots.filter(s => s.key !== key && P[s.key].bg);
      fill(copySel, h("option", { value: "" }, T("Hintergrund übernehmen von …")), from.map(s => h("option", { value: s.key }, s.label)));
      copySel.disabled = !from.length;
    }
    root.querySelector(".bedit").textContent = slots.find(s => s.key === key).label;
    root.querySelector(".bnote").textContent = logoNote;
    const n = slots.filter(s => P[s.key].checked && P[s.key].bg).length;
    saveBtn.disabled = saving || !n; saveBtn.textContent = TP(n, "Ein Poster speichern", "{0} Poster speichern");
  }

  /* --- cards ------------------------------------------------------------ */
  function selectSlot(key) { sel = key; syncControls(); }
  const SLOT_DRAG = "application/x-p5slot";
  const grid = h("div", { class: "bgrid" }, slots.map(s => {
    const cv = h("canvas", { width: 300, height: 450 }); canvases[s.key] = cv;
    const chk = h("input", { type: "checkbox", checked: true, title: T("Dieses Poster speichern"), onclick: e => e.stopPropagation(), onchange: e => { P[s.key].checked = e.target.checked; syncControls(); } });
    const zoom = h("button", { class: "bzoom", type: "button", title: T("Groß ansehen"), "aria-label": T("Groß ansehen"), onclick: e => { e.stopPropagation(); selectSlot(s.key); openZoom(slots, s.key, k => paint(k, true)); } }, icon("search", 14));
    const card = h("div", { class: "bcard", "data-key": s.key, onclick: () => selectSlot(s.key), ondblclick: () => openZoom(slots, s.key, k => paint(k, true)) },
      h("div", { class: "poster bposter", "data-key": it.id + "|" + s.key }, cv, zoom),
      h("div", { class: "blabel" }, multi ? chk : null, h("span", {}, s.label)));
    makeDropTarget(card, files => bgFromFile(s.key, files));
    if (multi) {                                                    // drag a poster onto another one: it gets the same background
      card.addEventListener("dragstart", e => { e.dataTransfer.setData(SLOT_DRAG, s.key); e.dataTransfer.effectAllowed = "copy"; });
      card.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes(SLOT_DRAG)) { e.preventDefault(); card.classList.add("dropping"); } });
      card.addEventListener("dragleave", () => card.classList.remove("dropping"));
      card.addEventListener("drop", e => { const from = e.dataTransfer.getData(SLOT_DRAG); card.classList.remove("dropping"); if (from) { e.preventDefault(); copyBg(from, s.key); } });
    }
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
  const titleSec = h("div", { class: "bsec" }, h("h4", {}, T("Titel")),
    h("div", { class: "row wrap" }, h("div", { class: "segs" }, modeLogo, modeText), logoBtn, logoUp),
    h("div", { class: "hint" }, T("PNG oder WebP mit Transparenz, auch per Drag & Drop hier ablegen")),
    h("div", { class: "hint bnote" }),
    h("label", { class: "brow" }, h("span", { class: "blab" }, T("Text")), textInp),
    h("label", { class: "brow" }, h("span", { class: "blab" }, T("Titelfarbe")), titleColorInp),
    h("label", { class: "brow" }, h("span", { class: "blab" }, T("Schrift")), fontSel, h("label", { class: "bchk" }, upperChk, T("Großbuchstaben"))),
    slider(T("Titelgröße"), "titleScale", 0.4, 1.6, 0.01, pct),
    slider(T("Titelhöhe"), "titleY", 0.1, 0.9, 0.005, pct));
  makeDropTarget(titleSec, logoFromFile);
  const controls = h("div", { class: "bcontrols" },
    h("div", { class: "bhead" }, h("span", { class: "hint", style: "margin:0" }, T("Bearbeitet:")), h("b", { class: "bedit" })),
    h("div", { class: "bsec" }, h("h4", {}, T("Hintergrund")),
      h("div", { class: "row wrap" }, h("button", { class: "btn sm", type: "button", onclick: () => bgOnline(sel) }, icon("search", 14), T("Online suchen")),
        h("button", { class: "btn sm", type: "button", onclick: () => pickFiles(files => bgFromFile(sel, files), false) }, icon("upload", 14), T("Datei wählen")),
        multi ? allBtn : null, multi ? copySel : null),
      h("div", { class: "hint" }, bgName, " · ", T("oder ein Bild auf ein Poster ziehen"))),
    titleSec,
    h("div", { class: "bsec bseason" }, h("h4", {}, T("Staffeltext")),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Text")), lineInp),
      slider(T("Textgröße"), "seasonScale", 0.5, 2.4, 0.01, pct), slider(T("Abstand zum Titel"), "gap", 0, 0.1, 0.002, pct), slider(T("Laufweite"), "tracking", 0, 0.4, 0.005, pct),
      h("label", { class: "brow" }, h("span", { class: "blab" }, T("Farbe")), colorInp, colorAuto)),
    h("div", { class: "bsec" }, h("h4", {}, T("Vorlagen")),
      h("div", { class: "row wrap" }, presetSel, h("button", { class: "btn sm", type: "button", onclick: savePreset }, T("Als Vorlage speichern …")), h("button", { class: "btn sm ghost", type: "button", onclick: deletePreset }, T("Vorlage löschen …")))),
    h("div", { class: "row wrap bfoot" }, saveBtn, opts.onCancel ? h("button", { class: "btn", type: "button", onclick: opts.onCancel }, T("Abbrechen")) : null, status));
  root.append(grid, controls);

  (async () => {
    try { const st = await api("/styles"); presets = st.presets || {}; if (st.last) { Object.assign(G, st.last); delete G.color; } } catch { /* optional */ }
    drawPresets(); syncControls(); paintAll(); loadLogos();
  })();
  return root;
}

/** Large view of one poster in full resolution (what will be saved), with arrows / arrow keys to flip through the series. */
function openZoom(slots, startKey, render) {
  let i = Math.max(0, slots.findIndex(s => s.key === startKey)), token = 0;
  const holder = h("div", { class: "zoomcv" }), title = h("div", { class: "zoomtitle" });
  const prev = h("button", { class: "btn zoomnav zoomprev", type: "button", "aria-label": T("Vorheriges Poster"), onclick: () => go(-1) }, "‹");
  const next = h("button", { class: "btn zoomnav zoomnext", type: "button", "aria-label": T("Nächstes Poster"), onclick: () => go(1) }, "›");
  const wrap = h("div", { class: "zoomwrap", onclick: e => { if (e.target === wrap || e.target === holder) close(); } },
    h("button", { class: "btn zoomclose", type: "button", "aria-label": T("Schließen"), onclick: () => close() }, "✕"), prev, holder, next, title);
  function onKey(e) {
    if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.key === "Escape") close(); else go(e.key === "ArrowLeft" ? -1 : 1);
  }
  function close() { wrap.remove(); document.removeEventListener("keydown", onKey, true); }
  async function show() {
    const my = ++token;
    prev.hidden = next.hidden = slots.length < 2;
    title.textContent = slots[i].label + (slots.length > 1 ? `  ·  ${i + 1} / ${slots.length}` : "");
    fill(holder, h("div", { class: "empty" }, h("span", { class: "spin" }), T(" Poster wird gezeichnet …")));
    const cv = await render(slots[i].key);
    if (my === token) fill(holder, cv);
  }
  function go(d) { i = (i + d + slots.length) % slots.length; show(); }
  document.addEventListener("keydown", onKey, true);
  document.body.append(wrap); show();
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
