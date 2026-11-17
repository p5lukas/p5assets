"use strict";
/* p5assets poster builder: a textless background, a clear logo (or the title as text) and a "Season One" line, drawn in the browser
 * (canvas) and saved as a 1000 × 1500 JPG through the normal upload. Loaded after app.js (uses its helpers). */

const BW = 1000, BH = 1500;
// id = file name in /static/fonts and part of the CSS family "p5-<id>"; the list must match FONTS in app/styles.py
const BUILD_FONTS = [["montserrat", "Montserrat", 700], ["raleway", "Raleway", 700], ["oswald", "Oswald", 700], ["bebas-neue", "Bebas Neue", 400],
  ["anton", "Anton", 400], ["cinzel", "Cinzel", 700], ["playfair-display", "Playfair Display", 700], ["lato", "Lato", 700]];
const BUILD_FIT = { zoom: 1, x: 0.5, y: 0.5, fill: "auto", color: "#12161c" };
const BUILD_DEFAULT = { seasonOn: true, edgeCut: 0, font: "montserrat", upper: true, mode: "logo", trim: true, logoColorMode: "off", logoColor: "#ffffff", tint: "off", tintA: "#101a2e", tintB: "#ffd9a0", tintAmount: 1, blend: "off", blendAmount: 0.7, blendHeight: 0.35, titleScale: 0.7, titleY: 0.82, seasonScale: 0.9, gap: 0.02, seasonPos: "below", seasonY: 0.92, tracking: 0.22, titleColor: "#ffffff" };     // same on all posters; only the colour of the season line is per poster

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

/** The automatic colours for the season line of one poster: the hues come from the whole picture (its palette); lightness is adjusted so that they can be read
 *  on the strip behind the line (drawn as it will look: crop, filter, fade). Returns { auto, palette (up to three) }. */
function autoColorAt(bg, st, fit, yc) {
  const w = 100, h = 150, c = document.createElement("canvas"); c.width = w; c.height = h;
  drawBuilt(c, { bg, logo: null, title: "", line: "", st: { ...st, mode: "text" }, color: null, fit });
  const y0 = Math.max(0, Math.round((yc - 0.06) * h)), y1 = Math.min(h, Math.round((yc + 0.06) * h));
  const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, y0, w, Math.max(1, y1 - y0)).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { sum += relLum(d[i], d[i + 1], d[i + 2]); n++; }
  const bgL = n ? sum / n : 0.1, pal = imageInfo(bg).palette;
  const palette = pal.map(p => legibleColor(p.hue, p.sat, bgL));
  if (pal.length && palette.length < 3) for (let k = palette.length; k < 3; k++) palette.push(legibleColor(pal[0].hue + 25 * k, pal[0].sat, bgL));   // a quiet picture: neighbours of its main hue
  return { auto: palette[0] || (contrastOf(1, bgL) >= contrastOf(0, bgL) ? "#f1f1ee" : "#1a1a1a"), palette: palette.slice(0, 3) };
}
function hslHex(hue, s, l) {
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + hue / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("");
}

function hexHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, ch = mx - mn;
  if (!ch) return [0, 0, l];
  const hue = mx === r ? ((g - b) / ch + 6) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
  return [hue * 60, ch / (1 - Math.abs(2 * l - 1)), l];
}
/** Colour suggestions for the season line, derived from the picture: its main colour, a light and a strong variant, the opposite hue, white, near-black. */
function colorChoices(auto) {
  const [hu] = hexHsl(auto || "#f1f1ee"), base = auto || "#f1f1ee";
  return [base, hslHex(hu, 0.6, 0.88), hslHex(hu, 0.85, 0.5), hslHex((hu + 180) % 360, 0.7, 0.72), "#ffffff", "#141414"];
}

/** The visible part of a logo: transparent margins are cut off (alpha below ~3 % counts as empty, plus 1 % of safety margin), so size and height refer to what you see.
 *  A picture without real transparency is returned as it is. */
const trimCache = new Map();
function trimTransparent(img) {
  if (trimCache.has(img)) return trimCache.get(img);
  let out = img;
  try {
    const w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, 500 / Math.max(w, h)), sw = Math.max(1, Math.round(w * sc)), sh = Math.max(1, Math.round(h * sc));
    const c = document.createElement("canvas"); c.width = sw; c.height = sh;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, sw, sh);
    const d = x.getImageData(0, 0, sw, sh).data;
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) if (d[(yy * sw + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    if (x1 >= 0) {
      const m = Math.ceil(Math.max(sw, sh) * 0.01);
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(sw - 1, x1 + m); y1 = Math.min(sh - 1, y1 + m);
      const bx = Math.floor(x0 / sc), by = Math.floor(y0 / sc), bw = Math.min(w - bx, Math.ceil((x1 - x0 + 1) / sc)), bh = Math.min(h - by, Math.ceil((y1 - y0 + 1) / sc));
      if (bw < w * 0.98 || bh < h * 0.98) {
        const t = document.createElement("canvas"); t.width = bw; t.height = bh;
        t.getContext("2d").drawImage(img, bx, by, bw, bh, 0, 0, bw, bh); out = t;
      }
    }
  } catch { /* cannot read the pixels: use the logo as it is */ }
  trimCache.set(img, out);
  return out;
}

/* ------------------------------------------------------ background helpers --- */
/** The main colours of a picture (RGBA pixels): hue sectors weighted by how vivid and mid-bright their pixels are; grey, near-black and near-white are ignored.
 *  Returns up to three { hue, sat } of clearly different hues, strongest first. */
function paletteOf(d) {
  const sectors = Array.from({ length: 12 }, () => ({ w: 0, hs: 0, ss: 0 }));
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const [hu, sa, l] = hexHsl("#" + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, "0")).join(""));
    if (sa < 0.12 || l < 0.08 || l > 0.95) continue;
    const wt = (0.3 + sa) * (1 - Math.abs(2 * l - 1)), k = Math.floor(hu / 30) % 12;
    sectors[k].w += wt; sectors[k].hs += hu * wt; sectors[k].ss += sa * wt;
  }
  const out = [];
  for (const sec of sectors.filter(x => x.w > 0).sort((a, b) => b.w - a.w)) {
    const hue = sec.hs / sec.w;
    if (out.every(o => Math.min(Math.abs(o.hue - hue), 360 - Math.abs(o.hue - hue)) >= 28)) out.push({ hue, sat: sec.ss / sec.w });
    if (out.length === 3) break;
  }
  return out;
}
const lin = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrastOf = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** A colour of the given hue that can be read on a background of relative luminance bgL (contrast ≥ 4.5 where possible): lighter on dark, darker on light. */
function legibleColor(hue, sat, bgL) {
  const s = Math.min(0.9, Math.max(0.55, sat)), light = contrastOf(1, bgL) >= contrastOf(0, bgL);
  let best = null, bestC = 0;
  for (let i = 0; i <= 12; i++) {
    const hex = hslHex(hue, s, light ? 0.62 + i * 0.03 : 0.4 - i * 0.03), [r, g, b] = hexRgb(hex), c = contrastOf(relLum(r, g, b), bgL);
    if (c >= 4.5) return hex;
    if (c > bestC) { bestC = c; best = hex; }
  }
  return bestC >= 3 ? best : light ? "#f1f1ee" : "#1a1a1a";
}
const infoCache = new WeakMap();
/** A tiny copy of a picture: its average colour, the colour of each edge and whether it has transparency (all read from ~32 px). */
function imageInfo(img) {
  if (infoCache.has(img)) return infoCache.get(img);
  const info = { avg: "#f1f1ee", edges: {}, transparent: false, tiny: null, palette: [] };
  try {
    const w = 48, h = Math.max(4, Math.round(48 * img.naturalHeight / img.naturalWidth)), c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, mean = (x0, y0, x1, y1) => {
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4, al = d[i + 3] / 255; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; }
      return a > 0.5 ? [r / a, g / a, b / a] : null;
    };
    const k = Math.max(1, Math.round(w / 16)), kh = Math.max(1, Math.round(h / 16));
    info.edges = { l: mean(0, 0, k, h), r: mean(w - k, 0, w, h), t: mean(0, 0, w, kh), b: mean(0, h - kh, w, h) };
    const all = mean(0, 0, w, h);
    if (all) info.avg = "#" + all.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { info.transparent = true; break; }
    info.palette = paletteOf(d);
    info.tiny = c;
  } catch { /* unreadable: neutral values */ }
  infoCache.set(img, info);
  return info;
}
const rgbCss = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
const hexRgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** What is behind a picture that does not cover the poster (zoomed out, or with transparency). */
function fillFree(ctx, img, f, W, H, dx, dy, dw, dh) {
  const info = imageInfo(img), dark = "#0b1a12";
  if (f.fill === "black") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
  if (f.fill === "white") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); return; }
  if (f.fill === "color") { ctx.fillStyle = f.color || BUILD_FIT.color; ctx.fillRect(0, 0, W, H); return; }
  if (f.fill === "blur" && info.tiny) {                           // a soft, enlarged copy of the picture behind itself
    const t = info.tiny, mid = document.createElement("canvas"); mid.width = 96; mid.height = Math.max(8, Math.round(96 * t.height / t.width));
    const m = mid.getContext("2d"); m.imageSmoothingQuality = "high"; m.drawImage(t, 0, 0, mid.width, mid.height);
    const s = Math.max(W / mid.width, H / mid.height);
    ctx.save(); ctx.imageSmoothingQuality = "high"; ctx.drawImage(mid, (W - mid.width * s) / 2, (H - mid.height * s) / 2, mid.width * s, mid.height * s); ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H);
    return;
  }
  // auto: the colour of the picture's edge continues into the free area, a little darker towards the poster edge
  const e = info.edges, have = Object.values(e).filter(Boolean);
  const base = have.length ? have.reduce((a, c) => [a[0] + c[0] / have.length, a[1] + c[1] / have.length, a[2] + c[2] / have.length], [0, 0, 0]) : null;
  ctx.fillStyle = base ? rgbCss(base, 0.8) : dark; ctx.fillRect(0, 0, W, H);
  const side = (c, x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
    if (!c) return;
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, rgbCss(c)); g.addColorStop(1, rgbCss(c, 0.55));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  if (dx > 0.5) side(e.l, 0, 0, dx, H, dx, 0, 0, 0);
  if (dx + dw < W - 0.5) side(e.r, dx + dw, 0, W, H, dx + dw, 0, W, 0);
  if (dy > 0.5) side(e.t, 0, 0, W, dy, 0, dy, 0, 0);
  if (dy + dh < H - 0.5) side(e.b, 0, dy + dh, W, H, 0, dy + dh, 0, H);
}
/** Colour filter over everything drawn so far: black & white, a one-colour tone, or a duotone (shadows → highlights). */
function applyTint(ctx, W, H, st) {
  const a = st.tintAmount ?? 1, img = ctx.getImageData(0, 0, W, H), d = img.data;
  let c1 = null, c2 = null;
  if (st.tint === "duotone") { c1 = hexRgb(st.tintA); c2 = hexRgb(st.tintB); }
  else if (st.tint === "tint") { const c = hexRgb(st.tintB); c1 = c.map(v => v * 0.12); c2 = c.map(v => v + (255 - v) * 0.55); }
  const lut = c1 ? Array.from({ length: 256 }, (_, l) => c1.map((v, k) => v + (c2[k] - v) * l / 255)) : null;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]), t = lut ? lut[l] : [l, l, l];
    d[i] += (t[0] - d[i]) * a; d[i + 1] += (t[1] - d[i + 1]) * a; d[i + 2] += (t[2] - d[i + 2]) * a;
  }
  ctx.putImageData(img, 0, 0);
}

/** The logo as a one-colour silhouette: its transparency is the stencil. */
function tintedLogo(logo, color, w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(logo, 0, 0, w, h); x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, w, h);
  return c;
}

/* -------------------------------------------------------------- drawing --- */
/** Draws one poster. o = { bg, logo, title, line, st (merged style), color } – images are already loaded (or null). */
function drawBuilt(canvas, o) {
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext("2d"), st = o.st;
  const def = BUILD_FONTS.find(f => f[0] === st.font) || BUILD_FONTS[0], fam = `"p5-${def[0]}", sans-serif`;
  ctx.clearRect(0, 0, W, H);
  if (o.bg) {                                                      // cover fit
    const f = o.fit || BUILD_FIT, ec = st.edgeCut || 0, fw = o.bg.naturalWidth, fh = o.bg.naturalHeight;          // edgeCut: the same share cut off every side (a frame in the picture)
    const sx = fw * ec, sy = fh * ec, nw = fw - 2 * sx, nh = fh - 2 * sy, s = Math.max(W / nw, H / nh) * f.zoom, dw = nw * s, dh = nh * s;
    const dx = (W - dw) * f.x, dy = (H - dh) * f.y;                              // cover fit, then zoomed and shifted (x, y: 0 = left / top edge, 1 = right / bottom edge)
    if (dw < W - 0.5 || dh < H - 0.5 || imageInfo(o.bg).transparent) fillFree(ctx, o.bg, f, W, H, dx, dy, dw, dh);       // zoomed out (or cut-out): something has to be behind
    ctx.drawImage(o.bg, sx, sy, nw, nh, dx, dy, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b1a12"); g.addColorStop(1, "#03100a"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (st.tint && st.tint !== "off") applyTint(ctx, W, H, st);
  if (st.blend === "dark" || st.blend === "light") {               // a soft fade from the bottom edge for busy pictures
    const hgt = H * st.blendHeight, g = ctx.createLinearGradient(0, H, 0, H - hgt), rgb = st.blend === "dark" ? "0,0,0" : "255,255,255";
    [[0, 1], [0.3, 0.78], [0.6, 0.38], [0.85, 0.1], [1, 0]].forEach(([t, k]) => g.addColorStop(t, `rgba(${rgb},${(k * st.blendAmount).toFixed(3)})`));
    ctx.fillStyle = g; ctx.fillRect(0, H - hgt, W, hgt);
  }
  const upper = t => st.upper ? t.toUpperCase() : t;
  // title: logo or text lines
  let titleH = 0, drawTitle = () => {};
  if (st.mode === "logo" && o.logo) {
    const lw = o.logo.naturalWidth || o.logo.width, lh = o.logo.naturalHeight || o.logo.height;
    const s = Math.min(W * 0.8 * st.titleScale / lw, H * 0.28 * st.titleScale / lh, W * 0.94 / lw), dw = lw * s, dh = lh * s;
    const src = st.logoColorMode === "color" ? tintedLogo(o.logo, st.logoColor, Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh))) : o.logo;
    titleH = dh; drawTitle = top => ctx.drawImage(src, (W - dw) / 2, top, dw, dh);
  } else if (o.title && st.mode !== "none") {
    let fs = W * 0.095 * st.titleScale, lines;
    const maxW = W * 0.84, measure = () => { ctx.font = `${def[2]} ${fs}px ${fam}`; lines = wrapLines(ctx, upper(o.title), maxW); return Math.max(...lines.map(l => ctx.measureText(l).width)); };
    while (measure() > maxW && fs > 8) fs *= 0.94;
    const lh = fs * 1.1; titleH = lines.length * lh;
    drawTitle = top => {
      ctx.font = `${def[2]} ${fs}px ${fam}`; ctx.fillStyle = st.titleColor || "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lh * i + fs * 0.86));
    };
  }
  // The title (logo or text) sits at the same height on every poster. The season line either hangs below it ("below") or is placed freely over the whole
  // poster ("free"). In "below" room for the line is always reserved so that the clamp near the edges is the same with and without a line.
  const fsS = W * 0.05 * st.seasonScale, gapPx = titleH ? st.gap * H : 0, lineH = fsS * 1.15, free = st.seasonPos === "free";      // without a title the line sits where it would be
  const top = Math.min(Math.max(st.titleY * H - titleH / 2, 0), H - titleH);     // may reach both edges of the poster (but not leave it)
  drawTitle(top);
  if (o.line && st.seasonOn !== false) {
    const lineTop = free ? Math.min(Math.max(st.seasonY * H - lineH / 2, H * 0.03), H * 0.97 - lineH) : Math.min(top + titleH + gapPx, H * 0.985 - lineH);
    ctx.font = `400 ${fsS}px "p5-source-sans-3", sans-serif`; ctx.fillStyle = o.color || "#ffffff"; ctx.textBaseline = "alphabetic";
    drawTracked(ctx, upper(o.line), W / 2, lineTop + fsS * 0.86, st.tracking * fsS);
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

/** A number field (in percent) with − / + buttons for steps of 1 %: next to every slider, to type a value or click in single steps.
 *  onSet(v) gets the new value (0–1 scale, clamped), or null when the text is not a number (then show the old value again). */
function numField(min, max, onSet) {
  let cur = min;
  const clamp = v => Math.min(max, Math.max(min, v)), pctOf = v => Math.round(v * 100);
  const inp = h("input", { type: "number", class: "bnum-in", min: pctOf(min), max: pctOf(max), step: 1, inputmode: "numeric", "aria-label": T("Wert in Prozent") });
  const commit = () => { const n = parseFloat(inp.value); if (Number.isNaN(n)) onSet(null); else onSet(clamp(Math.round(n) / 100)); };
  const bump = d => onSet(clamp((pctOf(cur) + d) / 100));
  inp.addEventListener("change", commit);
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter") { commit(); inp.blur(); }
    else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); bump(e.key === "ArrowUp" ? 10 : -10); }
  });
  const stepBtn = (label, text, d) => {
    let t = null, iv = null;
    const stop = () => { clearTimeout(t); clearInterval(iv); t = iv = null; };
    return h("button", { class: "bstep", type: "button", "aria-label": label, title: label, onpointerdown: e => {
      e.preventDefault(); bump(d); stop();
      t = setTimeout(() => { iv = setInterval(() => bump(d), 70); }, 380);                       // held: repeats
    }, onpointerup: stop, onpointerleave: stop, onpointercancel: stop, onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bump(d); } } }, text);
  };
  return { el: h("span", { class: "bnum" }, stepBtn(T("Um 1 % verringern"), "−", -1), inp, stepBtn(T("Um 1 % erhöhen"), "+", 1)),
    set: v => { cur = v; inp.value = pctOf(v); } };
}

/* -------------------------------------------------------------- builder --- */
/** The editor. opts = { item, slots: [{ key, season, label }], multi, onSaved(lastItem, keys, trashId), onCancel }. Returns the DOM element.
 *  Backgrounds belong to a poster and are chosen on its tile. Logo, size and height are the same on all posters unless "for all posters" is switched off;
 *  the colour of the season line is always per poster; font and the fine tuning of the season line are the same everywhere. */
function makeBuilder(opts) {
  const it = opts.item, multi = !!opts.multi, slots = opts.slots;
  // collection builder: every poster is another film (slot.item); each has its own logo and title, everything else is one look
  const col = !!opts.collection, projId = opts.builderKey || it.id;
  const tileKeyOf = key => { const cp = (slots.find(s => s.key === key) || {}).colPoster; return cp ? "colposter|" + cp.cid : itemOf(key).id + "|" + apiSlot(key); };
  const itemOf = key => (slots.find(s => s.key === key) || {}).item || it, apiSlot = key => col ? "poster" : key;
  const G = { ...BUILD_DEFAULT };                                   // the look shared by all posters
  let titleText = it.title, logo = null /* { url, preview, source } */, logoRes = null, logoNote = "", presets = {}, sel = opts.start && slots.some(s => s.key === opts.start) ? opts.start : slots[0].key, saving = false, allTitle = true;
  const newP = s => ({ title: s.title ?? (s.item ? s.item.title : ""), bg: null, line: s.season == null ? "" : seasonLine(s.season), color: null, auto: null, palette: [], autoSig: "", fit: { ...BUILD_FIT }, ov: {} });
  const P = Object.fromEntries(slots.map(s => [s.key, newP(s)]));
  const TITLE_OV = ["titleScale", "titleY", "mode", "logo", "trim", "blend", "blendAmount", "blendHeight", "tint", "tintA", "tintB", "tintAmount", "logoColorMode", "logoColor", "edgeCut", "seasonOn"];        // what a single poster may do differently (when "for all posters" is off)
  const val = (key, a) => a in P[key].ov ? P[key].ov[a] : a === "logo" ? logo : G[a];
  const style = key => ({ ...G, ...Object.fromEntries(TITLE_OV.filter(a => a !== "logo").map(a => [a, val(key, a)])) });
  const colorOf = key => P[key].color || P[key].auto || "#f1f1ee";
  const titleOf = key => col ? P[key].title : titleText;
  const custom = key => Object.keys(P[key].ov).filter(k => !(col && (k === "logo" || k === "mode"))).length > 0;
  const clearOv = s => { const o = P[s.key].ov; P[s.key].ov = col ? Object.fromEntries(["logo", "mode"].filter(k => k in o).map(k => [k, o[k]])) : {}; };

  const root = h("div", { class: "builder" });
  const cards = {}, canvases = {};
  const status = h("div", { class: "hint bstatus", "aria-live": "polite" });

  /* --- drawing ---------------------------------------------------------- */
  /** Draws poster `key` on its tile; full = a new 1000 × 1500 canvas with the original pictures; size = a new canvas of that width (preview pictures, for the comparison). */
  async function paint(key, full = false, bgOnly = false, size = 0) {
    const p = P[key], cv = canvases[key], lg0 = val(key, "logo"), useLogoImg = lg0 && val(key, "mode") === "logo", orig = full && !size;
    await ensureFont(G.font);
    const [bg, lg0img] = await Promise.all([p.bg ? loadImage(proxied(orig ? p.bg.url : p.bg.preview || p.bg.url)).catch(() => null) : null,
      useLogoImg ? loadImage(proxied(orig ? lg0.url : lg0.preview || lg0.url)).catch(() => null) : null]);
    const lg = lg0img && val(key, "trim") ? trimTransparent(lg0img) : lg0img, st = style(key);
    if (bg) { const info = imageInfo(bg); p.avg = info.avg; p.transp = info.transparent; p.nat = [bg.naturalWidth, bg.naturalHeight]; }
    if (bg) {                                                       // the automatic colour follows the picture where the line stands
      const yc = st.seasonPos === "free" ? st.seasonY : Math.min(st.titleY + 0.07, 0.97);
      const sig = [p.bg.url, p.fit.zoom, p.fit.x, p.fit.y, st.blend, st.blendAmount, st.blendHeight, yc].join("|");
      if (p.autoSig !== sig) { Object.assign(p, autoColorAt(bg, st, p.fit, yc)); p.autoSig = sig; }
    }
    const out = full || size ? Object.assign(document.createElement("canvas"), size ? { width: size, height: Math.round(size * 1.5) } : { width: BW, height: BH }) : cv;
    drawBuilt(out, { bg, logo: bgOnly ? null : lg, title: bgOnly ? "" : titleOf(key), line: bgOnly ? "" : p.line, st, color: colorOf(key), fit: p.fit });
    return out;
  }
  const paintAll = () => slots.forEach(s => paint(s.key));
  const repaintTitle = () => allTitle ? paintAll() : paint(sel);

  /* --- backgrounds (chosen on the tiles) -------------------------------- */
  async function setBg(key, bg, fit) { cards[key].classList.toggle("nobg", !bg); P[key].bg = bg; P[key].auto = null; P[key].autoSig = ""; P[key].fit = { ...(fit || BUILD_FIT) }; cards[key].draggable = !!bg; await paint(key); syncControls(); }
  const bgFromFile = (key, files) => {
    const f = (files || []).map(x => x.file).find(x => x && /^image\//.test(x.type));
    if (!f) { toast(T("Keine Bilder gefunden"), "bad"); return; }
    const u = URL.createObjectURL(f); setBg(key, { url: u, preview: u, name: f.name, file: f });
  };
  const slotOf = key => slots.find(s => s.key === key) || {};
  const bgOnline = key => searchOnline(itemOf(key), apiSlot(key), null, { ...(slotOf(key).colPoster ? { collection: { type: "collection", id: slotOf(key).colPoster.cid, title: P[key].title }, searchPath: `/collection-search?id=${encodeURIComponent(slotOf(key).colPoster.cid)}`, heading: `${T("Hintergrund wählen")} – ${P[key].title}` } : {}), pick: img => setBg(key, { url: img.url, preview: img.preview || img.url, name: img.label ? `${img.source} · ${img.label}` : img.source, ...(img.file ? { file: img.file } : {}) }), title: T("Hintergrund wählen"), scopes: slotOf(key).colPoster ? collectionScopes(slotOf(key).colPoster.cid, slotOf(key).colPoster.members, apiSlot(key)) : col ? null : slots.map(x => ({ key: x.key, label: x.label })) });
  const copyBg = (from, to) => { if (from !== to && P[from].bg) setBg(to, { ...P[from].bg }, P[from].fit); };
  function bgForAll(from) {
    const src = P[from].bg; if (!src) return;
    const others = slots.filter(s => s.key !== from), filled = others.filter(s => P[s.key].bg);
    const replace = filled.length ? confirm(TP(filled.length, "Ein Poster hat schon einen Hintergrund. Auch dieses ersetzen? (Abbrechen = nur leere Poster füllen)",
      "{0} Poster haben schon einen Hintergrund. Auch diese ersetzen? (Abbrechen = nur leere Poster füllen)")) : false;
    others.filter(s => replace || !P[s.key].bg).forEach(s => setBg(s.key, { ...src }, P[from].fit));
  }

  /* --- title: logo / text, size, height (for all posters, or for one) ---- */
  function setTitle(attr, v) {
    if (col && (attr === "logo" || attr === "mode")) { P[sel].ov[attr] = v; return; }          // every film has its own logo (or title as text)
    if (allTitle) { if (attr === "logo") logo = v; else G[attr] = v; slots.forEach(s => delete P[s.key].ov[attr]); } else P[sel].ov[attr] = v;   // the shared logo lives in `logo`, not in G
  }
  function setLogoMode(mode, l) {
    if (l) setTitle("logo", l);
    setTitle("mode", mode);
    syncControls(); col ? paint(sel) : repaintTitle();
  }
  const logoResBy = {}, logoNoteBy = {};
  const resFor = key => col ? logoResBy[key] : logoRes, noteFor = key => col ? logoNoteBy[key] || "" : logoNote;
  async function loadLogos() {
    if (col) {                                                      // one logo search per film, in parallel
      await Promise.all(slots.map(async s => {
        if (s.colPoster) { if (!("mode" in P[s.key].ov)) P[s.key].ov.mode = "text"; return; }      // the poster of the collection itself: its name as the title
        try {
          const r = logoResBy[s.key] = await api(`/items/${s.item.id}/logos`);
          const first = r.images.find(i => i.lang !== "xx") || r.images[0];
          if ("mode" in P[s.key].ov) return;                         // a kept look decides
          if (first) { P[s.key].ov.logo = { url: first.url, preview: first.preview, source: first.source }; P[s.key].ov.mode = "logo"; }
          else { P[s.key].ov.mode = "text"; logoNoteBy[s.key] = T("Kein Logo gefunden – der Titel wird als Text gesetzt"); }
        } catch (e) { logoResBy[s.key] = { images: [], providers: [], languages: [] }; logoNoteBy[s.key] = e.message; if (!("mode" in P[s.key].ov)) P[s.key].ov.mode = "text"; }
      }));
      syncControls(); paintAll(); return;
    }
    try {
      logoRes = await api(`/items/${it.id}/logos`);
      const first = logoRes.images.find(i => i.lang !== "xx") || logoRes.images[0];     // preferred language first, a logo without language only as a fallback
      if (!first) { logoNote = T("Kein Logo gefunden – der Titel wird als Text gesetzt"); if (!logo && G.mode !== "none") G.mode = "text"; }
      else if (!logo) { logo = { url: first.url, preview: first.preview, source: first.source }; if (G.mode !== "none") G.mode = "logo"; }
    } catch (e) { logoRes = { images: [], providers: [], languages: [] }; logoNote = e.message; if (!logo && G.mode !== "none") G.mode = "text"; }
    syncControls(); paintAll();
  }
  const useLogo = l => setLogoMode("logo", l);
  function logoFromFile(files) {
    const f = (files || []).map(x => x.file).find(Boolean);
    if (!f) return;
    if (!/\.(png|webp)$/i.test(f.name) && !/^image\/(png|webp)$/.test(f.type)) { toast(T("Nur PNG oder WebP mit Transparenz – ein JPG hat keinen transparenten Hintergrund"), "bad"); return; }
    const u = URL.createObjectURL(f); useLogo({ url: u, preview: u, source: f.name, file: f });
  }
  function pickLogoFile() {
    const i = h("input", { type: "file", accept: "image/png,image/webp,.png,.webp", onchange: () => { if (i.files[0]) logoFromFile([{ file: i.files[0], path: i.files[0].name }]); } });
    i.click();
  }
  /** Same layout as the poster search: sources as tabs on top, the logos below grouped by language. */
  function pickLogo() {
    const r = { images: [], providers: [], languages: [], ...(resFor(sel) || {}) };
    const body = h("div", {}), tabs = h("div", { class: "tabs" }), content = h("div");
    const byCode = Object.fromEntries(S.langs.map(l => [l.code, l]));
    const langTitle = code => { const l = byCode[code]; if (code === "xx") return T("Ohne Sprache"); const name = !l ? code : l.native && l.native !== l.name ? `${l.name} (${l.native})` : l.name; return `${code} • ${name}`; };
    let tab = "*";
    const m = modal(T("Logo wählen"), body, [h("button", { class: "btn", onclick: () => { m.close(); pickLogoFile(); } }, icon("upload", 14), T("Logo hochladen")),
      h("button", { class: "btn", onclick: () => { m.close(); setLogoMode("text"); } }, T("Titel als Text verwenden")), h("button", { class: "btn ghost", onclick: () => m.close() }, T("Schließen"))]);
    const cur = val(sel, "logo");
    const pick = l => h("div", { class: "pick" + (cur && cur.url === l.url ? " on" : ""), onclick: () => { m.close(); useLogo({ url: l.url, preview: l.preview, source: l.source }); } },
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
      groups.sort((a, b) => (a.code === "xx") - (b.code === "xx"));       // logos without a language last (for posters "xx" = textless and comes first)
      const prov = r.providers.find(p => p.name === tab);
      fill(content,
        prov && prov.state === "error" ? h("div", { class: "status bad" }, `[ !! ] ${prov.name}: ${prov.error}`) : null,
        tab === "*" ? r.providers.filter(p => p.state === "error").map(p => h("div", { class: "status bad" }, `[ !! ] ${p.name}: ${p.error}`)) : null,
        groups.filter(g => g.imgs.length).map((g, n) => h("div", { class: "langgroup" },
          h("h4", {}, g.other ? T("Weitere Sprache · ") : `${n + 1}. `, langTitle(g.code), h("small", {}, ` ${g.imgs.length}`)),
          h("div", { class: "picks logos" }, g.imgs.map(pick)))),
        list.length ? null : h("div", { class: "empty" }, noteFor(sel) || T("Keine Logos gefunden.")));
    }
    fill(body, tabs, content); render();
  }

  /* --- controls --------------------------------------------------------- */
  const ctl = {};
  /** A slider row: label, slider, value, "Default" button. Always the same layout, so the sliders keep the same length.
   *  perPoster = the value may differ per poster (size and height of the title, when "for all posters" is off). */
  function slider(label, attr, min, max, step, fmt, perPoster) {
    const def = BUILD_DEFAULT[attr];
    const cur = () => perPoster ? val(sel, attr) : G[attr];
    const show = v => { num.set(v); reset.classList.toggle("dim", Math.abs(v - def) < step / 2); };
    const put = v => { if (perPoster) setTitle(attr, v); else G[attr] = v; show(v); perPoster ? repaintTitle() : paintAll(); if (perPoster) syncCustom(); };
    const num = numField(min, max, v => { if (v == null) { show(cur()); return; } inp.value = v; put(v); });
    const inp = h("input", { type: "range", min, max, step, oninput: () => put(+inp.value) });
    const reset = h("button", { class: "btn sm breset", type: "button", title: T("Auf Standard zurücksetzen"), onclick: () => { inp.value = def; put(def); } }, T("Standard"));
    const row = h("div", { class: "brow srow" }, h("span", { class: "blab" }, label), inp, num.el, reset);
    ctl[attr] = () => { inp.value = cur(); show(cur()); };
    ctl[attr].row = row;
    return row;
  }
  const pct = v => Math.round(v * 100) + " %";
  const fontSel = h("select", { onchange: async e => { G.font = e.target.value; await ensureFont(G.font); paintAll(); } }, BUILD_FONTS.map(f => h("option", { value: f[0] }, f[1])));
  const upperChk = h("input", { type: "checkbox", onchange: e => { G.upper = e.target.checked; paintAll(); } });
  const textInp = h("input", { type: "text", maxlength: 120, oninput: e => { if (col) { P[sel].title = e.target.value; paint(sel); } else { titleText = e.target.value; paintAll(); } } });
  const lineInp = h("input", { type: "text", maxlength: 40, oninput: e => { P[sel].line = e.target.value; paint(sel); } });
  const setColor = c => { P[sel].color = c; syncControls(); paint(sel); };
  const colorInp = h("input", { type: "color", title: T("Eigene Farbe"), oninput: e => setColor(e.target.value) });
  const colorAuto = h("button", { class: "btn sm", type: "button", title: T("Die Farbe passend zum Poster automatisch wählen"), onclick: () => setColor(null) }, T("Auto"));
  const swatches = h("div", { class: "swatches" });
  const pipette = h("button", { class: "btn sm", type: "button", title: T("Farbe aus dem Poster aufnehmen"), onclick: async () => {
    const key = sel, cv = await paint(key, true, true);
    pickFromPoster(cv, hex => { sel = key; setColor(hex); });
  } }, icon("eye", 14), T("Pipette"));
  const titleColorInp = h("input", { type: "color", oninput: e => { G.titleColor = e.target.value; paintAll(); } });
  const modeLogo = h("button", { class: "seg", type: "button", onclick: () => { if (val(sel, "logo")) setLogoMode("logo"); else pickLogo(); } }, T("Logo"));
  const modeText = h("button", { class: "seg", type: "button", onclick: () => setLogoMode("text") }, T("Text"));
  const modeNone = h("button", { class: "seg", type: "button", title: T("Weder Logo noch Titel zeichnen"), onclick: () => setLogoMode("none") }, T("Aus"));
  const dropHint = h("div", { class: "hint" }, T("PNG oder WebP mit Transparenz, auch per Drag & Drop hier ablegen"));
  const noteEl = h("div", { class: "hint bnote" });
  const seasonChk = h("input", { type: "checkbox", checked: true, onchange: e => { setTitle("seasonOn", e.target.checked); syncControls(); repaintTitle(); syncCustom(); } });
  const seasonBody = h("div", { class: "bseasonbody" });
  const logoBtn = h("button", { class: "btn sm", type: "button", onclick: pickLogo }, T("Logo wählen …"));
  const logoUp = h("button", { class: "btn sm", type: "button", onclick: pickLogoFile }, icon("upload", 14), T("Logo hochladen"));
  const blendBtn = (v, label) => h("button", { class: "seg", type: "button", onclick: () => { setTitle("blend", v); syncControls(); repaintTitle(); syncCustom(); } }, label);
  const blendOff = blendBtn("off", T("Aus")), blendDark = blendBtn("dark", T("Dunkel")), blendLight = blendBtn("light", T("Hell"));
  const setPos = v => { G.seasonPos = v; syncControls(); paintAll(); };
  const posBelow = h("button", { class: "seg", type: "button", onclick: () => setPos("below") }, T("Unter dem Titel")), posFree = h("button", { class: "seg", type: "button", onclick: () => setPos("free") }, T("Frei"));
  const trimChk = h("input", { type: "checkbox", onchange: e => { setTitle("trim", e.target.checked); syncControls(); repaintTitle(); syncCustom(); } });
  const allChk = h("input", { type: "checkbox", checked: true, onchange: e => {
    if (e.target.checked && slots.some(s => custom(s.key)) && !confirm(T("Die abweichenden Einstellungen einzelner Poster gehen verloren. Fortfahren?"))) { e.target.checked = false; return; }
    allTitle = e.target.checked;
    if (allTitle) slots.forEach(clearOv);
    syncControls(); paintAll();
  } });
  const presetSel = h("select", { onchange: e => { const p = presets[e.target.value]; if (!p) return; applyPreset(p); e.target.value = ""; } });
  const fitCtl = {};
  /** Slider for the crop of the selected poster's background (zoom, shift): per poster, with its own "Default" button. */
  function fitSlider(label, prop, min, max, step, fmt) {
    const def = BUILD_FIT[prop];
    const show = v => { num.set(v); reset.classList.toggle("dim", Math.abs(v - def) < step / 2); };
    const num = numField(min, max, v => { if (v == null) { show(P[sel].fit[prop]); return; } inp.value = v; put(v); });
    const put = v => { P[sel].fit[prop] = v; show(v); paint(sel); fillRows.hidden = !(P[sel].fit.zoom < 0.999 || P[sel].transp); };     // zoomed out: the free area needs a fill
    const inp = h("input", { type: "range", min, max, step, oninput: () => put(+inp.value) });
    const reset = h("button", { class: "btn sm breset", type: "button", title: T("Auf Standard zurücksetzen"), onclick: () => { inp.value = def; put(def); } }, T("Standard"));
    fitCtl[prop] = () => { const v = P[sel].fit[prop]; inp.value = v; show(v); };
    return h("div", { class: "brow srow" }, h("span", { class: "blab" }, label), inp, num.el, reset);
  }
  const pctOf = v => Math.round(v * 100) + " %";
  const setFit = patch => { P[sel].fit = { ...P[sel].fit, ...patch }; syncControls(); paint(sel); };
  const fillBtns = [["auto", T("Auto")], ["black", T("Schwarz")], ["white", T("Weiß")], ["color", T("Farbe")], ["blur", T("Unscharf")]].map(([v, l]) => {
    const b = h("button", { class: "seg", type: "button", onclick: () => setFit({ fill: v }) }, l); b.dataset.v = v; return b;
  });
  const fillSwatches = h("div", { class: "swatches" });
  const fillColorInp = h("input", { type: "color", title: T("Eigene Farbe"), oninput: e => setFit({ fill: "color", color: e.target.value }) });
  const fillPipette = h("button", { class: "btn sm", type: "button", title: T("Farbe aus dem Poster aufnehmen"), onclick: async () => {
    const key = sel, cv = await paint(key, true, true);
    pickFromPoster(cv, hex => { sel = key; setFit({ fill: "color", color: hex }); });
  } }, icon("eye", 14), T("Pipette"));
  const fitAll = h("button", { class: "btn sm", type: "button", title: T("Das ganze Bild sichtbar machen"), onclick: () => {
    const nat = P[sel].nat; if (!nat) return;
    const r = Math.min(BW / nat[0], BH / nat[1]) / Math.max(BW / nat[0], BH / nat[1]);
    setFit({ zoom: Math.min(1, Math.max(0.3, r)), x: 0.5, y: 0.5 });
  } }, T("Einpassen"));
  const fillRows = h("div", { class: "bfillrows" },
    h("div", { class: "brow" }, h("span", { class: "blab" }, T("Freier Bereich")), h("div", { class: "segs" }, fillBtns)),
    h("div", { class: "brow bfillcolor" }, h("span", { class: "blab" }, T("Farbe")), fillSwatches, fillPipette, fillColorInp));
  const fitSec = h("div", { class: "bsec bfit" }, h("h4", {}, T("Bildausschnitt")),
    slider(T("Rand abschneiden"), "edgeCut", 0, 0.15, 0.005, pct, true),
    fitSlider(T("Zoom"), "zoom", 0.3, 3, 0.01, pctOf), fitSlider(T("Links / rechts"), "x", 0, 1, 0.005, pctOf), fitSlider(T("Oben / unten"), "y", 0, 1, 0.005, pctOf),
    h("div", { class: "row wrap" }, fitAll), fillRows);
  /* --- colour filter (a look setting like the fade: for all posters, or for one) --- */
  const tintChange = () => { syncControls(); repaintTitle(); syncCustom(); };
  const tintBtns = [["off", T("Aus")], ["mono", T("Schwarzweiß")], ["tint", T("Tönung")], ["duotone", T("Duoton")]].map(([v, l]) => {
    const b = h("button", { class: "seg", type: "button", onclick: () => { setTitle("tint", v); tintChange(); } }, l); b.dataset.v = v; return b;
  });
  const tintAInp = h("input", { type: "color", oninput: e => { setTitle("tintA", e.target.value); repaintTitle(); syncCustom(); } });
  const tintBInp = h("input", { type: "color", oninput: e => { setTitle("tintB", e.target.value); repaintTitle(); syncCustom(); } });
  const tintLabelB = h("span", { class: "blab" }, T("Licht"));
  const tintPresets = [["#101a2e", "#ffd9a0"], ["#1a0f2e", "#ff9ec4"], ["#0b2a2a", "#b8ffe0"], ["#2a0f0f", "#ffe3b0"], ["#0a1a3a", "#ffffff"]].map(([a, b]) =>
    h("button", { class: "tintpreset", type: "button", title: `${a} → ${b}`, "aria-label": `${a} → ${b}`, style: `background:linear-gradient(90deg,${a},${b})`,
      onclick: () => { setTitle("tint", "duotone"); setTitle("tintA", a); setTitle("tintB", b); tintChange(); } }));
  const tintRowA = h("div", { class: "brow" }, h("span", { class: "blab" }, T("Schatten")), tintAInp), tintRowB = h("div", { class: "brow" }, tintLabelB, tintBInp);
  const tintRowP = h("div", { class: "brow" }, h("span", { class: "blab" }, T("Vorschläge")), h("div", { class: "swatches" }, tintPresets));
  const tintSec = h("div", { class: "bsec" }, h("h4", {}, T("Farbfilter")), h("div", { class: "row wrap" }, h("div", { class: "segs" }, tintBtns)),
    tintRowP, tintRowA, tintRowB, slider(T("Stärke"), "tintAmount", 0.1, 1, 0.01, pct, true));
  /* --- logo colour: the logo as a one-colour silhouette (handy for white logos) --- */
  const logoColorBtns = [["off", T("Original")], ["color", T("Einfärben")]].map(([v, l]) => {
    const b = h("button", { class: "seg", type: "button", onclick: () => { setTitle("logoColorMode", v); tintChange(); } }, l); b.dataset.v = v; return b;
  });
  const logoColorInp = h("input", { type: "color", title: T("Eigene Farbe"), oninput: e => { setTitle("logoColorMode", "color"); setTitle("logoColor", e.target.value); repaintTitle(); syncCustom(); } });
  const logoSwatches = h("div", { class: "swatches" });
  const logoPipette = h("button", { class: "btn sm", type: "button", title: T("Farbe aus dem Poster aufnehmen"), onclick: async () => {
    const key = sel, cv = await paint(key, true, true);
    pickFromPoster(cv, hex => { sel = key; setTitle("logoColorMode", "color"); setTitle("logoColor", hex); tintChange(); });
  } }, icon("eye", 14), T("Pipette"));
  const logoModeRow = h("div", { class: "brow" }, h("span", { class: "blab" }, T("Logofarbe")), h("div", { class: "segs" }, logoColorBtns));
  const logoColorRow = h("div", { class: "brow" }, h("span", { class: "blab" }, T("Farbe")), logoSwatches, logoPipette, logoColorInp);
  function resetAll() {
    if (!confirm(T("Alle Einstellungen auf Standard zurücksetzen? Hintergründe und Logo bleiben."))) return;
    for (const k of Object.keys(G)) delete G[k];
    Object.assign(G, BUILD_DEFAULT); if (!logo) G.mode = "text";
    allTitle = true; slots.forEach(s => { clearOv(s); P[s.key].color = null; P[s.key].autoSig = ""; });
    syncControls(); paintAll();
  }
  /* --- the look of this title is kept between visits -------------------- */
  const blobCache = new Map();
  /** A picture reference that can be kept: online pictures stay links, pictures from this computer are stored on the server once. */
  async function stored(r) {
    if (!r) return null;
    const keep = { name: r.name, source: r.source };
    if (!r.url.startsWith("blob:") || !r.file) return r.url.startsWith("blob:") ? null : { url: r.url, preview: r.preview || r.url, ...keep };
    if (!blobCache.has(r.url)) blobCache.set(r.url, (async () => {
      const fd = new FormData();                                    // (the file itself: the page may not fetch blob: addresses)
      fd.append("file", r.file);
      return (await api(`/items/${projId}/builder/file`, { method: "POST", body: fd })).url;
    })());
    const url = await blobCache.get(r.url);
    return { url, preview: url, ...keep };
  }
  async function saveProject() {
    const posters = {};
    for (const s of slots) {
      const p = P[s.key], ov = { ...p.ov };
      if (ov.logo) ov.logo = await stored(ov.logo);
      posters[s.key] = { bg: await stored(p.bg), line: p.line, title: col ? p.title : "", color: p.color, fit: p.fit, ov };
    }
    await api(`/items/${projId}/builder`, { method: "PUT", json: { look: G, allTitle, titleText: col ? "" : titleText, logo: await stored(logo), posters } });
  }
  function applyProject(pr) {
    Object.assign(G, BUILD_DEFAULT, pr.look); delete G.color;
    allTitle = pr.allTitle; titleText = pr.titleText || it.title; logo = pr.logo || null;
    for (const [k, v] of Object.entries(pr.posters || {})) {
      const p = P[k]; if (!p) continue;
      p.bg = v.bg; if (v.line) p.line = v.line; if (col && v.title) p.title = v.title;
      p.color = v.color; p.fit = { ...BUILD_FIT, ...v.fit }; p.ov = v.ov || {}; p.autoSig = "";
      cards[k].draggable = !!v.bg; cards[k].classList.toggle("nobg", !v.bg);
    }
  }
  const lookNote = h("div", { class: "blook", hidden: true }, h("span", {}, T("Gespeicherter Look dieser Serie geladen")),
    h("button", { class: "btn sm ghost", type: "button", onclick: async () => {
      if (!confirm(T("Den gespeicherten Look dieser Serie löschen? Die fertigen Poster bleiben unverändert."))) return;
      try { await api(`/items/${projId}/builder`, { method: "DELETE" }); lookNote.hidden = true; toast(T("Gespeicherter Look gelöscht"), "ok"); } catch (e) { toast(e.message, "bad"); }
    } }, T("Look löschen")));
  function applyPreset(p) {
    Object.assign(G, BUILD_DEFAULT, p); delete G.color; if (!logo) G.mode = "text"; slots.forEach(clearOv);
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
  function syncCustom() {
    slots.forEach(s => { cards[s.key].classList.toggle("custom", custom(s.key)); });
  }
  function syncControls() {
    const key = sel, seasonSlot = P[key].line !== "" || slots.find(s => s.key === key).season != null, mode = val(key, "mode");
    root.querySelectorAll(".bcard").forEach(c => c.classList.toggle("editing", c.dataset.key === key));
    syncCustom();
    fontSel.value = G.font; upperChk.checked = !!G.upper; textInp.value = titleOf(key);
    modeLogo.classList.toggle("on", mode === "logo"); modeText.classList.toggle("on", mode === "text"); modeNone.classList.toggle("on", mode === "none");
    logoBtn.textContent = val(key, "logo") ? T("Anderes Logo …") : T("Logo wählen …");
    const none = mode === "none";                                  // title off: only the controls for its height stay
    logoBtn.hidden = logoUp.hidden = dropHint.hidden = noteEl.hidden = fontRow.hidden = none;
    textInp.closest(".brow").hidden = mode !== "text"; titleColorInp.closest(".brow").hidden = mode !== "text";
    ctl.titleScale.row.hidden = none;
    const son = val(key, "seasonOn") !== false; seasonChk.checked = son; seasonBody.hidden = !son;
    titleColorInp.value = G.titleColor || "#ffffff"; colorInp.value = colorOf(key);
    const lm = val(key, "logoColorMode"), lc = val(key, "logoColor");
    logoColorBtns.forEach(b => b.classList.toggle("on", b.dataset.v === lm));
    logoModeRow.hidden = mode !== "logo"; logoColorRow.hidden = mode !== "logo" || lm !== "color"; logoColorInp.value = lc;
    fill(logoSwatches, [...(P[key].palette || []), "#ffffff", "#141414"].map(c => h("button", { type: "button", class: "swatch" + (lm === "color" && lc.toLowerCase() === c.toLowerCase() ? " on" : ""),
      style: `background:${c}`, title: c, "aria-label": c, onclick: () => { setTitle("logoColorMode", "color"); setTitle("logoColor", c); tintChange(); } })));
    const tn = val(key, "tint");
    tintBtns.forEach(b => b.classList.toggle("on", b.dataset.v === tn));
    tintRowP.hidden = tn === "off" || tn === "mono"; tintRowA.hidden = tn !== "duotone"; tintRowB.hidden = tn === "off" || tn === "mono";
    ctl.tintAmount.row.hidden = tn === "off"; tintLabelB.textContent = tn === "duotone" ? T("Licht") : T("Farbe");
    tintAInp.value = val(key, "tintA"); tintBInp.value = val(key, "tintB");
    const bl = val(key, "blend");
    blendOff.classList.toggle("on", bl === "off"); blendDark.classList.toggle("on", bl === "dark"); blendLight.classList.toggle("on", bl === "light");
    ctl.blendAmount.row.hidden = ctl.blendHeight.row.hidden = bl === "off";
    posBelow.classList.toggle("on", G.seasonPos !== "free"); posFree.classList.toggle("on", G.seasonPos === "free");
    ctl.gap.row.hidden = G.seasonPos === "free"; ctl.seasonY.row.hidden = G.seasonPos !== "free";
    trimChk.checked = !!val(key, "trim"); trimChk.closest("label").hidden = mode !== "logo";
    allChk.checked = allTitle; allChk.closest("label").hidden = !multi;
    lineInp.value = P[key].line;
    controls.querySelector(".bseason").hidden = !seasonSlot;
    for (const k of Object.keys(ctl)) ctl[k]();
    fitSec.hidden = !P[key].bg; for (const k of Object.keys(fitCtl)) fitCtl[k]();
    {
      const f = P[key].fit, needs = f.zoom < 0.999 || P[key].transp;
      fillRows.hidden = !needs; fillBtns.forEach(b => b.classList.toggle("on", b.dataset.v === f.fill));
      fillRows.querySelector(".bfillcolor").hidden = f.fill !== "color"; fillColorInp.value = f.color;
      fill(fillSwatches, colorChoices(P[key].avg || "#808080").map(c => h("button", { type: "button", class: "swatch" + (f.fill === "color" && f.color.toLowerCase() === c.toLowerCase() ? " on" : ""),
        style: `background:${c}`, title: c, "aria-label": c, onclick: () => setFit({ fill: "color", color: c }) })));
    }
    colorAuto.classList.toggle("on", P[key].color == null);
    fill(swatches, [...(P[key].palette || []), "#ffffff", "#141414"].map(c => h("button", { type: "button", class: "swatch" + (P[key].color && P[key].color.toLowerCase() === c.toLowerCase() ? " on" : ""),
      style: `background:${c}`, title: c, "aria-label": c, onclick: () => setColor(c) })));
    root.querySelector(".bedit").textContent = slots.find(s => s.key === key).label;
    root.querySelector(".bnote").textContent = noteFor(key);
    const n = slots.filter(s => P[s.key].bg).length;
    saveBtn.disabled = saving || !n; saveBtn.textContent = TP(n, "Ein Poster speichern", "{0} Poster speichern");
  }

  /* --- cards ------------------------------------------------------------ */
  function selectSlot(key) {
    sel = key;
    if (cards[key]) cards[key].scrollIntoView({ block: "nearest", inline: "nearest" });     // the poster column scrolls for itself
    root.querySelectorAll(".bposter.show").forEach(e => { if (e.closest(".bcard").dataset.key !== key) e.classList.remove("show"); });
    syncControls();
  }
  const SLOT_DRAG = "application/x-p5slot";
  const currentUrl = key => {
    const cp = slotOf(key).colPoster;
    if (cp) return cp.exists ? `/api/collection-poster?id=${encodeURIComponent(cp.cid)}&v=${cp.v}` : null;
    const item = itemOf(key), k = apiSlot(key), sl = item.slots[k];
    return !sl ? null : sl.exists ? `/api/asset/${item.id}/${k}?v=${sl.mtime}` : sl.plex_thumb ? `/api/season-thumb/${item.id}/${k}` : null;
  };
  const zoom = key => openZoom(slots, key, k => paint(k, true), currentUrl);
  function makeCard(s) {
    const cv = h("canvas", { width: 300, height: 450 }); canvases[s.key] = cv;
    const ov = (name, label, fn) => h("button", { class: "ov-btn bov", type: "button", title: label, "aria-label": label, onclick: e => { e.stopPropagation(); box.classList.remove("show"); selectSlot(s.key); fn(); } }, icon(name, 16), h("span", {}, label));
    const box = h("div", { class: "poster bposter", "data-key": tileKeyOf(s.key) }, cv,
      h("div", { class: "hover" }, h("div", { class: "ovbtns" },
        ov("search", T("Online suchen"), () => bgOnline(s.key)),
        ov("upload", T("Datei wählen"), () => pickFiles(files => bgFromFile(s.key, files), false)),
        ov("eye", T("Vorschau"), () => zoom(s.key)),
        multi ? ov("copy", T("Für alle übernehmen"), () => bgForAll(s.key)) : null)));
    const act = (name, label, fn) => h("button", { class: "btn sm bempty-btn", type: "button", title: label, "aria-label": label, onclick: e => { e.stopPropagation(); selectSlot(s.key); fn(); } }, icon(name, 14), h("span", {}, label));
    box.append(h("div", { class: "bempty" }, act("search", T("Online suchen"), () => bgOnline(s.key)), act("upload", T("Datei wählen"), () => pickFiles(files => bgFromFile(s.key, files), false))));
    const card = h("div", { class: "bcard nobg", "data-key": s.key, onclick: () => { selectSlot(s.key); if (matchMedia("(hover:none)").matches) box.classList.toggle("show"); }, ondblclick: () => zoom(s.key) },
      box, h("div", { class: "blabel" }, h("span", {}, s.label), h("small", { class: "bcustom" }, T("angepasst"))));
    makeDropTarget(card, files => bgFromFile(s.key, files));
    if (multi) {                                                    // drag a poster onto another one: it gets the same background
      card.addEventListener("dragstart", e => { e.dataTransfer.setData(SLOT_DRAG, s.key); e.dataTransfer.effectAllowed = "copy"; });
      card.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes(SLOT_DRAG)) { e.preventDefault(); card.classList.add("dropping"); } });
      card.addEventListener("dragleave", () => card.classList.remove("dropping"));
      card.addEventListener("drop", e => { const from = e.dataTransfer.getData(SLOT_DRAG); card.classList.remove("dropping"); if (from) { e.preventDefault(); copyBg(from, s.key); } });
    }
    cards[s.key] = card; return card;
  }
  const grid = h("div", { class: "bgrid" }, slots.map(makeCard));
  // a series without Specials (season 0) can get a Specials poster too
  const addSpecials = multi && it.type === "show" && !slots.some(s => s.season === 0) ? h("button", { class: "btn sm baddsp", type: "button", onclick: () => {
    const s = { key: "season-0", season: 0, label: slotLabel("season-0", "show") };
    P[s.key] = newP(s); slots.splice(1, 0, s);
    grid.insertBefore(makeCard(s), grid.children[1]);
    addSpecials.remove(); selectSlot(s.key); paint(s.key);
  } }, "＋ ", T("Specials hinzufügen")) : null;
  if (addSpecials) grid.append(addSpecials);
  const saveBtn = h("button", { class: "btn primary", type: "button", onclick: () => save() }, "");

  /* --- saving ----------------------------------------------------------- */
  async function save() {
    const keys = slots.filter(s => P[s.key].bg).map(s => s.key);
    if (!keys.length || saving) return;
    const overwritten = keys.filter(k => { const cp = slotOf(k).colPoster; if (cp) return cp.exists; const sl = itemOf(k).slots[apiSlot(k)]; return sl && sl.exists; });
    if (overwritten.length && !confirm(TP(overwritten.length, "Ein vorhandenes Poster wird ersetzt (das alte liegt 30 Tage im Papierkorb). Fortfahren?", "{0} vorhandene Poster werden ersetzt (die alten liegen 30 Tage im Papierkorb). Fortfahren?"))) return;
    saving = true; syncControls();
    let last = null, trash = null, done = 0;
    try {
      for (const key of keys) {
        const tileKey = tileKeyOf(key), cp = slotOf(key).colPoster;
        busyTile(tileKey, true);
        status.textContent = T("Speichere … {0} von {1}", done + 1, keys.length);
        try {
          const cv = await paint(key, true);
          const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.92));
          const fd = new FormData(); fd.append("file", new File([blob], "poster.jpg", { type: "image/jpeg" }));
          let r = null;
          if (cp) {                                                   // the poster of the collection itself: into its folder in the collections folder
            const url = create => `/collection-poster?id=${encodeURIComponent(cp.cid)}${create ? "&create=true" : ""}`;
            try { r = await api(url(false), { method: "POST", body: fd }); }
            catch (e) {
              if (!(e.status === 409 && e.data && e.data.needs_folder)) throw e;
              if (confirm(T("Der Ordner „{0}“ existiert noch nicht im Collection-Ordner. Jetzt anlegen?", e.data.needs_folder))) {
                const fd2 = new FormData(); fd2.append("file", new File([blob], "poster.jpg", { type: "image/jpeg" })); r = await api(url(true), { method: "POST", body: fd2 });
              } else { toast(T("Das Collection-Poster wurde nicht gespeichert: Der Ordner fehlt."), "bad"); continue; }
            }
            cp.exists = true; cp.v = Date.now();
          } else r = await api(`/items/${itemOf(key).id}/${apiSlot(key)}/upload`, { method: "POST", body: fd });
          last = r.item || last; trash = r.trash; done++; S.rain.add(tileKey);
          if (r.warning) toast(T("Plex: ") + r.warning, "bad");
        } finally { busyTile(tileKey, false); }
      }
      try { await saveProject(); } catch (e) { toast(T("Der Look konnte nicht gespeichert werden: {0}", e.message), "bad"); }
      toast(TP(done, "Poster gespeichert ✓", "{0} Poster gespeichert ✓"), "ok", trash && done === 1 ? { label: T("Rückgängig"), fn: async () => { try { await api(`/trash/${trash}/restore`, { method: "POST" }); loadItems().then(renderGrid); } catch (e) { toast(e.message, "bad"); } } } : null);
      if (opts.onSaved) opts.onSaved(last, keys, trash);
    } catch (e) { toast(e.message, "bad"); }
    finally { saving = false; status.textContent = ""; syncControls(); }
  }

  /* --- layout ----------------------------------------------------------- */
  const fontRow = h("label", { class: "brow" }, h("span", { class: "blab" }, T("Schrift")), fontSel, h("label", { class: "bchk" }, upperChk, T("Großbuchstaben")));
  const titleSec = h("div", { class: "bsec" }, h("h4", {}, T("Titel")),
    col ? h("div", { class: "hint", style: "margin:0" }, T("Logo und Titeltext gelten für den gewählten Film, alles andere für alle Poster.")) : null,
    h("div", { class: "row wrap" }, h("div", { class: "segs" }, modeLogo, modeText, modeNone), logoBtn, logoUp),
    dropHint,
    h("label", { class: "bchk btrim" }, trimChk, T("Transparenten Rand abschneiden")),
    logoModeRow, logoColorRow,
    noteEl,
    h("label", { class: "brow" }, h("span", { class: "blab" }, T("Text")), textInp),
    h("label", { class: "brow" }, h("span", { class: "blab" }, T("Titelfarbe")), titleColorInp),
    fontRow,
    slider(T("Titelgröße"), "titleScale", 0.4, 1.6, 0.01, pct, true),
    slider(T("Titelhöhe"), "titleY", 0, 1, 0.005, pct, true));
  seasonBody.append(
    h("label", { class: "brow" }, h("span", { class: "blab" }, T("Text")), lineInp),
    h("div", { class: "brow" }, h("span", { class: "blab" }, T("Farbe")), swatches, pipette, colorInp, colorAuto),
    h("div", { class: "brow" }, h("span", { class: "blab" }, T("Position der Zeile")), h("div", { class: "segs" }, posBelow, posFree)),
    slider(T("Abstand zum Titel"), "gap", 0, 0.1, 0.002, pct), slider(T("Texthöhe"), "seasonY", 0.03, 0.97, 0.005, pct),
    slider(T("Textgröße"), "seasonScale", 0.5, 2.4, 0.01, pct), slider(T("Laufweite"), "tracking", 0, 0.4, 0.005, pct));
  makeDropTarget(titleSec, logoFromFile);
  const compareBtn = multi && slots.length > 1 ? h("button", { class: "btn sm", type: "button", title: T("Alle Poster nebeneinander ansehen"), onclick: () => openCompare(slots, k => paint(k, true, false, 360), k => { selectSlot(k); zoom(k); }) }, icon("eye", 14), T("Vergleichen")) : null;
  const controls = h("div", { class: "bcontrols" },
    h("div", { class: "bhead" }, h("span", { class: "hint", style: "margin:0" }, T("Bearbeitet:")), h("b", { class: "bedit" }), h("span", { class: "spacer" }), compareBtn),
    lookNote,
    h("div", { class: "hint bbghint" }, T("Hintergrund: über ein Poster fahren (am Handy antippen) – suchen, Datei wählen, Vorschau. Ein Poster auf ein anderes ziehen kopiert den Hintergrund.")),
    h("label", { class: "bchk ballchk" }, allChk, T("Einstellungen für alle Poster")),
    fitSec,
    titleSec,
    h("div", { class: "bsec" }, h("h4", {}, T("Überblendung")),
      h("div", { class: "row wrap" }, h("div", { class: "segs" }, blendOff, blendDark, blendLight)),
      slider(T("Stärke"), "blendAmount", 0.1, 1, 0.01, pct, true), slider(T("Höhe"), "blendHeight", 0.1, 0.8, 0.01, pct, true)),
    tintSec,
    h("div", { class: "bsec bseason" }, h("h4", {}, T("Staffeltext")),
      h("label", { class: "bchk" }, seasonChk, T("Staffeltext anzeigen")),
      seasonBody),
    h("div", { class: "bsec" }, h("h4", {}, T("Vorlagen")),
      h("div", { class: "row wrap" }, presetSel, h("button", { class: "btn sm", type: "button", onclick: savePreset }, T("Als Vorlage speichern …")), h("button", { class: "btn sm ghost", type: "button", onclick: deletePreset }, T("Vorlage löschen …")),
        h("span", { class: "spacer" }), h("button", { class: "btn sm ghost", type: "button", title: T("Alle Einstellungen auf Standard, Hintergründe und Logo bleiben"), onclick: resetAll }, T("Alles zurücksetzen")))),
    h("div", { class: "row wrap bfoot" }, saveBtn, opts.onCancel ? h("button", { class: "btn", type: "button", onclick: opts.onCancel }, T("Abbrechen")) : null, status));
  root.append(grid, controls);

  (async () => {
    try { presets = (await api("/styles")).presets || {}; } catch { /* optional */ }
    try { const pr = (await api(`/items/${projId}/builder`)).project; if (pr) { applyProject(pr); lookNote.hidden = false; } } catch { /* optional */ }
    drawPresets(); syncControls(); paintAll(); loadLogos();
    if (cards[sel]) cards[sel].scrollIntoView({ block: "nearest" });
  })();
  return root;
}

/** Pick a colour from the picture itself: the poster is shown large, the colour under the pointer is previewed, a click / tap takes it (mean of a small patch). */
function pickFromPoster(canvas, onPick) {
  const tip = h("div", { class: "pipetip" }), hint = h("div", { class: "zoomtitle" }, T("Klicke auf eine Stelle des Posters, deren Farbe übernommen werden soll"));
  const holder = h("div", { class: "zoomcv pipecv" }, canvas);
  const wrap = h("div", { class: "zoomwrap", onclick: e => { if (e.target === wrap) close(); } },
    h("button", { class: "btn zoomclose", type: "button", "aria-label": T("Schließen"), onclick: () => close() }, "✕"), holder, hint, tip);
  let done = false;
  const colorAt = e => {
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    const x = Math.round((e.clientX - r.left) / r.width * canvas.width), y = Math.round((e.clientY - r.top) / r.height * canvas.height), k = 2;
    const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(Math.max(0, x - k), Math.max(0, y - k), 2 * k + 1, 2 * k + 1).data;
    let R = 0, Gc = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; Gc += d[i + 1]; B += d[i + 2]; n++; }
    return "#" + [R, Gc, B].map(v => Math.round(v / n).toString(16).padStart(2, "0")).join("");
  };
  const show = e => {
    const c = colorAt(e); tip.hidden = !c; if (!c) return;
    tip.style.background = c; tip.textContent = c; tip.style.left = e.clientX + "px"; tip.style.top = (e.clientY + (e.pointerType === "touch" ? -70 : 26)) + "px";
    const [, , l] = hexHsl(c); tip.style.color = l > 0.55 ? "#000" : "#fff";
  };
  const take = e => { const c = colorAt(e); if (!c || done) return; done = true; close(); onPick(c); };
  // the colour is taken when the pointer is released (tap, click, or drag with a finger / the mouse), where it is released
  canvas.addEventListener("pointermove", show);
  canvas.addEventListener("pointerdown", e => { try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ } show(e); });
  canvas.addEventListener("pointerup", take);
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
  function onKey(e) { if (e.key !== "Escape") return; e.stopImmediatePropagation(); e.preventDefault(); close(); }
  function close() { wrap.remove(); document.removeEventListener("keydown", onKey, true); }
  document.addEventListener("keydown", onKey, true);
  tip.hidden = true; document.body.append(wrap);
}

/** Large view of one poster in full resolution (what will be saved), with arrows / arrow keys to flip through the series.
 *  current(key) = address of the poster that exists now (or null): then a switch shows the draft or the existing poster. */
function openZoom(slots, startKey, render, current) {
  let i = Math.max(0, slots.findIndex(s => s.key === startKey)), token = 0, showCurrent = false;
  const holder = h("div", { class: "zoomcv" }), title = h("div", { class: "zoomtitle" });
  const prev = h("button", { class: "btn zoomnav zoomprev", type: "button", "aria-label": T("Vorheriges Poster"), onclick: () => go(-1) }, "‹");
  const next = h("button", { class: "btn zoomnav zoomnext", type: "button", "aria-label": T("Nächstes Poster"), onclick: () => go(1) }, "›");
  const segDraft = h("button", { class: "seg on", type: "button", onclick: () => setView(false) }, T("Entwurf")), segNow = h("button", { class: "seg", type: "button", onclick: () => setView(true) }, T("Vorhanden"));
  const toggle = current ? h("div", { class: "segs zoomtoggle" }, segDraft, segNow) : null;
  const wrap = h("div", { class: "zoomwrap", onclick: e => { if (e.target === wrap || e.target === holder) close(); } },
    h("button", { class: "btn zoomclose", type: "button", "aria-label": T("Schließen"), onclick: () => close() }, "✕"), prev, holder, next, toggle, title);
  function onKey(e) {
    if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.key === "Escape") close(); else go(e.key === "ArrowLeft" ? -1 : 1);
  }
  function close() { wrap.remove(); document.removeEventListener("keydown", onKey, true); }
  function setView(now) { showCurrent = now; segDraft.classList.toggle("on", !now); segNow.classList.toggle("on", now); show(); }
  async function show() {
    const my = ++token;
    prev.hidden = next.hidden = slots.length < 2;
    title.textContent = slots[i].label + (slots.length > 1 ? `  ·  ${i + 1} / ${slots.length}` : "");
    if (showCurrent) {
      const u = current(slots[i].key);
      fill(holder, u ? h("img", { src: u, alt: "" }) : h("div", { class: "empty" }, T("Für dieses Poster gibt es noch kein vorhandenes Poster.")));
      return;
    }
    fill(holder, h("div", { class: "empty" }, h("span", { class: "spin" }), T(" Poster wird gezeichnet …")));
    const cv = await render(slots[i].key);
    if (my === token) fill(holder, cv);
  }
  function go(d) { i = (i + d + slots.length) % slots.length; show(); }
  document.addEventListener("keydown", onKey, true);
  document.body.append(wrap); show();
}

/** All posters of the series in one row, to check that they belong together; a click opens the large view of that poster. */
function openCompare(slots, render, onPick) {
  const row = h("div", { class: "cmprow" });
  const wrap = h("div", { class: "zoomwrap cmpwrap", onclick: e => { if (e.target === wrap || e.target === row) close(); } },
    h("button", { class: "btn zoomclose", type: "button", "aria-label": T("Schließen"), onclick: () => close() }, "✕"), row,
    h("div", { class: "zoomtitle" }, T("Alle Poster nebeneinander – anklicken zum Vergrößern")));
  function onKey(e) { if (e.key !== "Escape") return; e.stopImmediatePropagation(); e.preventDefault(); close(); }
  function close() { wrap.remove(); document.removeEventListener("keydown", onKey, true); }
  for (const s of slots) {
    const cell = h("button", { class: "cmpcell", type: "button", onclick: () => { close(); onPick(s.key); } },
      h("div", { class: "cmpph" }, h("span", { class: "spin" })), h("span", { class: "cmplabel" }, s.label));
    row.append(cell);
    render(s.key).then(cv => cell.querySelector(".cmpph").replaceWith(cv));
  }
  document.addEventListener("keydown", onKey, true);
  document.body.append(wrap);
}

/* ---------------------------------------------------------- entry points --- */
/** The tiles of a title that can be built: the series poster / movie poster and all seasons, in order. */
function buildSlotsFor(it) {
  const keys = Object.keys(it.slots).filter(k => (it.type === "show" || k === "poster") && (!it.slots[k].extra || k === "season-0"));
  // Specials are offered whenever the series has a season 0, even when they are not monitored (then they are no tile of their own)
  if (it.type === "show" && (it.seasons || []).some(x => x.number === 0) && !keys.includes("season-0")) keys.push("season-0");
  keys.sort((a, b) => seasonNum(a) - seasonNum(b));
  return keys.map(k => ({ key: k, season: k === "poster" ? null : seasonNum(k), label: slotLabel(k, it.type) }));
}
/** Movies: a window with one poster. */
function openMovieBuilder(it, draw) {
  const m = modal(T("Poster bauen – {0}", it.title), h("div", {}));
  const b = makeBuilder({ item: it, multi: false, slots: buildSlotsFor(it), onSaved: item => { m.close(); if (draw) draw(item); }, onCancel: () => m.close() });
  const notes = h("div", { class: "bnotes" });
  m.el.querySelector(".modal").classList.add("wide");
  m.el.querySelector(".body").replaceChildren(notes, b);
  // a film of a Plex collection: offer the collection builder (all films in one look), this film preselected
  collectionsOf(it).then(list => fill(notes, list.map(g => h("div", { class: "blook" }, h("span", {}, T("Teil der Collection „{0}“ ({1} Filme)", g.title, g.total)),
    h("button", { class: "btn sm primary", type: "button", onclick: () => { m.close(); openCollection(g.id, { build: true, start: it.id }); } }, icon("build", 14), T("Collection bauen")))))).catch(() => {});
}
/** Collections: the detail view of the collection turns into the build mode, one poster per film (data = the answer of /collection). */
function openCollectionBuilder({ data, drawer, close, back, start }) {
  matrixSwap(() => {
    const slots = data.members.map(m => ({ key: m.id, season: null, label: m.year ? `${m.title} (${m.year})` : m.title, item: m }));
    // the poster of the collection itself comes first (only when the world has a collections folder): the name of the collection as the title
    if (data.poster) slots.unshift({ key: "__col", season: null, label: T("Collection-Poster"), item: data.members[0], title: data.title, colPoster: { cid: data.id, exists: data.poster.exists, v: data.poster.v, members: data.members.map(m => ({ id: m.id, title: m.title })) } });
    const pseudo = { id: data.builder_key, title: data.title, type: "collection", slots: {} };
    const b = makeBuilder({ item: pseudo, builderKey: data.builder_key, collection: true, multi: true, start, slots, onSaved: () => back(), onCancel: () => back() });
    fill(drawer, h("header", {}, h("button", { class: "btn ghost", "aria-label": T("Schließen"), onclick: close }, "✕"),
      h("div", { class: "grow" }, h("h2", {}, T("Poster bauen – {0}", data.title)), h("div", { class: "hint", style: "margin:2px 0" }, T("Alle Filme der Collection in einem Look: Hintergrund, Logo oder Titel"),
        data.poster ? null : [" · ", T("Für das Poster der Collection selbst: Collection-Ordner unter Einstellungen → Welten angeben")]))),
      h("div", { class: "body" }, b));
    drawer.scrollTop = 0;
  });
}
/** Series: the detail view turns into the build mode (same window); the letters scramble on the way in and out. */
function openSeriesBuilder({ it, drawer, close, back, start }) {
  matrixSwap(() => {
    const b = makeBuilder({ item: it, multi: true, start, slots: buildSlotsFor(it), onSaved: item => back(item), onCancel: () => back() });
    fill(drawer, h("header", {}, h("button", { class: "btn ghost", "aria-label": T("Schließen"), onclick: close }, "✕"),
      h("div", { class: "grow" }, h("h2", {}, T("Poster bauen – {0}", it.title)), h("div", { class: "hint", style: "margin:2px 0" }, T("Alle Poster der Serie in einem Look: Hintergrund, Logo oder Titel, Staffeltext")))),
      h("div", { class: "body" }, b));
    drawer.scrollTop = 0;
  });
}
