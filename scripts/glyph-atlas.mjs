// The GPU's words: an SDF (signed distance field) atlas of Inter, made once here and shipped as a PNG with its metrics, so the charts and
// monitors set their words on the GPU with no canvas 2D in the app at all (the owner, 1 Nov 2026: nothing off the GPU).
//
// A real browser (Playwright's Chromium) sets every glyph of the set in Inter at each weight the charts use, as page text with the page's
// own type settings (stylistic sets cv11 and ss01, tabular figures, the optical size of small text), at BASE px; each glyph's distance field is worked out from its pixels (the
// Felzenszwalb–Huttenlocher transform, with the edge's sub-pixel coverage, as Mapbox's tiny-sdf does) and packed into one atlas. Its
// advance, its box, the pairs' kerning and the baselines' offsets are measured by the same browser.
//
//   node scripts/glyph-atlas.mjs        writes src/ui/glyphs-inter.js (metrics) and src/ui/glyphs-inter-png.js (the atlas, a data URL)
//   node scripts/glyph-atlas.mjs --display   writes src/ui/glyphs-inter-display.js and src/ui/glyphs-inter-display-png.js: the big readouts'
//                                        characters (digits and their signs) set at DISPLAY_BASE px, for a number drawn large (FibroScan's kPa,
//                                        a monitor's heart rate). At BASE 32 a 72 px number on a 3x phone is the field magnified almost 7 times,
//                                        and its edge and outline came out stepped (Mohammad, 6 Nov 2026: "Fibroscan number rendered has jagged
//                                        edges"); from this field it is magnified about twice. Same browser, font, features and optical size as
//                                        the main atlas, so the shapes are the same glyphs; advances and kerning stay the main atlas's.

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { serve } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DISPLAY = process.argv.includes('--display');
// (The display field: RADIUS 20 at BASE 96 reaches 15 atlas px outside a glyph, past the widest outline a readout asks for, 0.08 em a side.)
export const DISPLAY_BASE = 96, DISPLAY_RADIUS = 20, DISPLAY_CHARS = '0123456789.,:/%+-−–×<>≤≥~≈°';
export const BASE = DISPLAY ? DISPLAY_BASE : 32, RADIUS = DISPLAY ? DISPLAY_RADIUS : 8, CUTOFF = 0.25, PAD = RADIUS + 1;
const WEIGHTS = [400, 500, 600, 650, 700];
const CHARS = DISPLAY ? DISPLAY_CHARS : [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), ...'−·–—≥≤▲▼×°µ±→←’‘“”…≈Δ½²³√•§©¹¼¾éøΣαβγδθκλμπρστφω⁴⁵⁻₂↑↓↔↗↘⇄⇅∘∝∞✓✕'].join('');

// (each glyph set in a cell of its own, its pen at (PX, PY) in it; at BASE 32: 80, 22, 52)
const CELL = BASE * 2.5, PX = Math.round(BASE * 0.6875), PY = Math.round(BASE * 1.625), COLS = 32;
const server = await serve(ROOT);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const rows = Math.ceil((WEIGHTS.length * [...CHARS].length) / COLS);
const page = await browser.newPage({ viewport: { width: COLS * CELL, height: rows * CELL }, deviceScaleFactor: 1 });
// Inter is a variable font with an optical size axis (opsz 14–32): the browser sets text at the charts' sizes (9–16 px) at opsz 14, wider
// and sturdier than at 32 px. The glyphs are set as the page sets them (DOM text, the page's features), held at opsz 14 at the atlas's
// size, so their shapes, advances and kerning are those of the charts' words, scaled.
const STYLE = `font-family: Inter; font-feature-settings: 'cv11', 'ss01'; font-variant-numeric: tabular-nums; font-optical-sizing: none; font-variation-settings: 'opsz' 14;`;
await page.goto(server.url + 'fonts/fonts.css');
await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${server.url}fonts/fonts.css">
<style>html, body { margin: 0; background: transparent; } body { ${STYLE} color: #fff; } .g { position: absolute; white-space: pre; line-height: 1; } .g i { display: inline-block; width: 0; height: 0; }
#m { position: absolute; left: 0; top: 0; white-space: pre; visibility: hidden; }</style></head><body><span id="m"></span><canvas id="c"></canvas></body></html>`);
const set = await page.evaluate(async ({ BASE, WEIGHTS, CHARS, CELL, PX, PY, COLS }) => {
  for (const w of WEIGHTS) await document.fonts.load(`${w} ${BASE}px Inter`, CHARS);
  await document.fonts.ready;
  const chars = [...CHARS], m = document.getElementById('m'), x = document.getElementById('c').getContext('2d');
  const widthOf = (s) => { m.textContent = s; return m.getBoundingClientRect().width; };
  const kern = {}, base = {}, adv = {}, cells = [];
  let n = 0;
  for (const w of WEIGHTS) {
    m.style.fontWeight = w; m.style.fontSize = BASE + "px";
    const a = (adv[w] = {});
    for (const ch of chars) a[ch] = widthOf(ch);
    const kw = (kern[w] = {});
    for (const p of chars) for (const q of chars) { const k = widthOf(p + q) - a[p] - a[q]; if (Math.abs(k) > 0.01) kw[p + q] = Math.round((k / BASE) * 1e4) / 1e4; }
    // (the baselines' offsets from the alphabetic one: the font's metrics, the same at every optical size)
    x.font = `${w} ${BASE}px Inter`; x.textBaseline = 'alphabetic';
    const capA = x.measureText('H').actualBoundingBoxAscent;
    base[w] = {};
    for (const b of ['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom']) { x.textBaseline = b; base[w][b] = (capA - x.measureText('H').actualBoundingBoxAscent) / BASE; }
    for (const ch of chars) {
      const cx = (n % COLS) * CELL, cy = Math.floor(n / COLS) * CELL;
      const el = document.createElement('span'); el.className = 'g'; el.style.fontWeight = w; el.style.fontSize = BASE + "px";
      el.textContent = ch; const mark = document.createElement('i'); el.append(mark); document.body.append(el);
      el.style.left = cx + PX + 'px'; el.style.top = cy + 'px';
      const dy = cy + PY - mark.getBoundingClientRect().top; el.style.top = cy + dy + 'px';
      const r = el.getBoundingClientRect(), pen = mark.getBoundingClientRect();
      cells.push({ w, ch, adv: a[ch] / BASE, cx, cy, penX: r.left - cx, penY: pen.top - cy });
      n++;
    }
  }
  return { kern, base, cells };
}, { BASE, WEIGHTS, CHARS, CELL, PX, PY, COLS });
const shot = await page.screenshot({ omitBackground: true, fullPage: true });
const out = await page.evaluate(async ({ png, cells, RADIUS, CUTOFF, PAD, CELL }) => {
  const im = new Image(); im.src = 'data:image/png;base64,' + png; await im.decode();
  const cv = document.getElementById('c'); cv.width = im.width; cv.height = im.height;
  const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
  const all = x.getImageData(0, 0, im.width, im.height).data, IW = im.width;
  const INF = 1e20;
  // (tiny-sdf's 1D and 2D squared distance transforms)
  function edt1d(grid, offset, stride, length, f, v, z) {
    v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
    for (let q = 1, k = 0, s; q < length; q++) {
      f[q] = grid[offset + q * stride];
      const q2 = q * q;
      do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < length; q++) { while (z[k + 1] < q) k++; const r = v[k], qr = q - r; grid[offset + q * stride] = f[r] + qr * qr; }
  }
  function edt(data, w, h) {
    const n = Math.max(w, h), f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
    for (let xx = 0; xx < w; xx++) edt1d(data, xx, w, h, f, v, z);
    for (let yy = 0; yy < h; yy++) edt1d(data, yy * w, 1, w, f, v, z);
  }
  const alpha = (px, py) => all[(py * IW + px) * 4 + 3] / 255;
  const glyphs = [], B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (const c of cells) {
    // (the glyph's ink in its cell)
    let l = CELL, r = -1, t = CELL, b = -1;
    for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) if (alpha(c.cx + xx, c.cy + yy) > 0) { l = Math.min(l, xx); r = Math.max(r, xx); t = Math.min(t, yy); b = Math.max(b, yy); }
    if (r < 0) { l = Math.round(c.penX); r = l - 1; t = Math.round(c.penY); b = t - 1; }
    const gw = r - l + 1 + 2 * PAD, gh = b - t + 1 + 2 * PAD, N = gw * gh;
    const outer = new Float64Array(N), inner = new Float64Array(N);
    for (let yy = 0; yy < gh; yy++) for (let xx = 0; xx < gw; xx++) {
      const sx = l - PAD + xx, sy = t - PAD + yy, i = yy * gw + xx;
      const al = sx < 0 || sy < 0 || sx >= CELL || sy >= CELL ? 0 : alpha(c.cx + sx, c.cy + sy);
      if (al === 1) { outer[i] = 0; inner[i] = INF; }
      else if (al === 0) { outer[i] = INF; inner[i] = 0; }
      else { const dd = 0.5 - al; outer[i] = dd > 0 ? dd * dd : 0; inner[i] = dd < 0 ? dd * dd : 0; }
    }
    edt(outer, gw, gh); edt(inner, gw, gh);
    const sdf = new Array(N);
    for (let i = 0; i < N; i++) { const dist = Math.sqrt(outer[i]) - Math.sqrt(inner[i]); sdf[i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (dist / RADIUS + CUTOFF)))); }
    // (its ink in bands two atlas px tall from its top: each band's first and last inked column from its left, + 1, as two characters of
    // B64; '' for a band with none: what a name's placement reads as its shape, glyph-measure.js inkBox)
    let ink = '';
    if (r >= 0) for (let y0 = t; y0 <= b; y0 += 2) {
      let bl = -1, br = -1;
      for (let yy = y0; yy < Math.min(y0 + 2, b + 1); yy++) for (let xx = l; xx <= r; xx++) if (alpha(c.cx + xx, c.cy + yy) > 0.03) { if (bl < 0 || xx < bl) bl = xx; if (xx > br) br = xx; }
      ink += bl < 0 ? B64[0] + B64[0] : B64[Math.min(63, bl - l + 1)] + B64[Math.min(63, br - l + 1)];
    }
    glyphs.push({ ink, w: c.w, ch: c.ch, adv: c.adv, ox: Math.round((c.penX - (l - PAD)) * 100) / 100, oy: Math.round((c.penY - (t - PAD)) * 100) / 100, gw, gh, sdf });
  }
  return { glyphs };
}, { png: shot.toString('base64'), cells: set.cells, RADIUS, CUTOFF, PAD, CELL });
out.kern = set.kern; out.base = set.base;
await browser.close(); server.close?.();

// Packed in shelves, tallest first.
const W = 1024;
const order = out.glyphs.map((g, i) => i).sort((a, b) => out.glyphs[b].gh - out.glyphs[a].gh);
let sx = 0, sy = 0, sh = 0;
for (const i of order) {
  const g = out.glyphs[i];
  if (sx + g.gw > W) { sx = 0; sy += sh; sh = 0; }
  g.x = sx; g.y = sy; sx += g.gw; sh = Math.max(sh, g.gh);
}
const H = DISPLAY ? Math.ceil((sy + sh) / 4) * 4 : 1 << Math.ceil(Math.log2(sy + sh));   // (the display field as tall as it needs: WebGL 2 takes any size)
const atlas = new Uint8Array(W * H);
for (const g of out.glyphs) for (let yy = 0; yy < g.gh; yy++) for (let xx = 0; xx < g.gw; xx++) atlas[(g.y + yy) * W + g.x + xx] = g.sdf[yy * g.gw + xx];

// A greyscale PNG.
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((W + 1) * H);
for (let yy = 0; yy < H; yy++) { raw[yy * (W + 1)] = 0; Buffer.from(atlas.buffer, yy * W, W).copy(raw, yy * (W + 1) + 1); }
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);

const glyphs = {};
if (DISPLAY) {
  // (the pictures only: [atlas x, y, w, h, pen x, pen y] at DISPLAY_BASE px; trace-gl.js lays them out by the main atlas's advances and kerning)
  for (const g of out.glyphs) if (g.gw > 2 * PAD) (glyphs[g.w] ||= {})[g.ch] = [g.x, g.y, g.gw, g.gh, g.ox, g.oy];
  const head = `// Made by scripts/glyph-atlas.mjs --display (do not edit): the big readouts' glyphs of Inter, an SDF field at DISPLAY_BASE px (text-gl.js).\n`;
  writeFileSync(join(ROOT, 'src/ui/glyphs-inter-display.js'), `${head}// glyph: [atlas x, y, w, h, pen x, pen y] (px in this atlas, at DISPLAY_BASE px); its advance and kerning are the main atlas's (glyphs-inter.js).\n`
    + `export const DISPLAY_BASE = ${BASE}, DISPLAY_RADIUS = ${RADIUS}, DISPLAY_CUTOFF = ${CUTOFF}, DISPLAY_W = ${W}, DISPLAY_H = ${H};\n`
    + `export const DISPLAY_GLYPHS = ${JSON.stringify(glyphs)};\n`);
  writeFileSync(join(ROOT, 'src/ui/glyphs-inter-display-png.js'), `${head}export const DISPLAY_PNG = 'data:image/png;base64,${png.toString('base64')}';\n`);
  console.log(`display glyph atlas: ${out.glyphs.length} glyphs, ${W}×${H}, PNG ${(png.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}
for (const g of out.glyphs) (glyphs[g.w] ||= {})[g.ch] = [Math.round(g.adv * 1e4) / 1e4, g.x, g.y, g.gw, g.gh, g.ox, g.oy, g.ink];
const head = `// Made by scripts/glyph-atlas.mjs (do not edit): Inter's SDF atlas metrics for the GPU's words (trace-gl.js).\n`;
writeFileSync(join(ROOT, 'src/ui/glyphs-inter.js'), `${head}// glyph: [advance (em), atlas x, y, w, h, pen x, pen y (px in the atlas, at BASE px), ink (bands 2 px tall: first, last column + 1, B64)]; kern: pair → em; base: baseline → em offset of the alphabetic one.\n`
  + `export const BASE = ${BASE}, RADIUS = ${RADIUS}, CUTOFF = ${CUTOFF}, ATLAS_W = ${W}, ATLAS_H = ${H};\n`
  + `export const GLYPHS = ${JSON.stringify(glyphs)};\nexport const KERN = ${JSON.stringify(out.kern)};\nexport const BASELINES = ${JSON.stringify(out.base)};\n`);
writeFileSync(join(ROOT, 'src/ui/glyphs-inter-png.js'), `${head}export const ATLAS_PNG = 'data:image/png;base64,${png.toString('base64')}';\n`);
console.log(`glyph atlas: ${out.glyphs.length} glyphs, ${W}×${H}, PNG ${(png.length / 1024).toFixed(0)} KB`);
process.exit(0);
