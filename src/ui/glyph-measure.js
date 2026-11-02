// A word's width as Inter sets it, from the GPU atlas's own metrics (glyphs-inter.js, made by scripts/glyph-atlas.mjs): no canvas and no
// page needed, so layout code and the tests measure words the way the GPU sets them.
import { sdfAtlas } from './text-gl.js?v=f983c94e6f';   // (the app's one door to GPU text)
const { GLYPHS, KERN } = sdfAtlas;

// The font a chart names ("650 12.5px Inter, …"): its weight, the nearest the atlas holds, and its size.
const WEIGHTS = Object.keys(GLYPHS).map(Number);
const fonts = new Map();
export function fontOf(font) {
  let f = fonts.get(font);
  if (!f) {
    const m = /(?:^|\s)(\d{3})\s/.exec(' ' + font + ' '), z = /([\d.]+)px/.exec(font);
    const want = m ? +m[1] : /bold/.test(font) ? 700 : 400;
    f = { w: WEIGHTS.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)), px: z ? +z[1] : 10 };
    fonts.set(font, f);
  }
  return f;
}
const widthsOf = new Map();
/** A word's width in CSS px in `font`, from the atlas's own advances and kerning (Inter, as the browser sets it), with no canvas. */
export function measure(str, font) {
  str = String(str);
  const key = font + '\u0001' + str;
  let w = widthsOf.get(key);
  if (w === undefined) {
    const f = fontOf(font), g = GLYPHS[f.w], kw = KERN[f.w];
    let em = 0, prev = '';
    for (const ch of str) { em += (g[ch] || g['?'])[0] + (prev ? kw[prev + ch] || 0 : 0); prev = ch; }
    w = em * f.px;
    if (widthsOf.size > 4000) widthsOf.clear();
    widthsOf.set(key, w);
  }
  return w;
}

// (the atlas's padding round each glyph, atlas px at BASE: scripts/glyph-atlas.mjs PAD)
const PAD = 9;
const { BASE, BASELINES } = sdfAtlas;
const inks = new Map(), B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/**
 * The ink of words set centred on (0, 0) with the middle baseline, as the 2D canvas sets them with textAlign 'center' and textBaseline
 * 'middle': [[top, bottom, left, right], …] (CSS px from that point), one span for each band two atlas px tall of each glyph's ink, from
 * the atlas's own record of it (no canvas is drawn and read back).
 */
export function inkBox(str, font) {
  const key = font + '\u0001' + str;
  let rows = inks.get(key);
  if (rows) return rows;
  const f = fontOf(font), g = GLYPHS[f.w], kw = KERN[f.w], s = f.px / BASE, width = measure(str, font);
  const by = (BASELINES[f.w].middle ?? 0) * f.px;
  let x = -width / 2, prev = '';
  rows = [];
  for (const ch of String(str)) {
    const e = g[ch] || g['?'], ink = e[7] || '';
    if (prev) x += (kw[prev + ch] || 0) * f.px;
    const gl = x + (PAD - e[5]) * s, gt = by + (PAD - e[6]) * s;
    for (let i = 0; i + 1 < ink.length; i += 2) {
      const l = B64.indexOf(ink[i]), r = B64.indexOf(ink[i + 1]);
      if (l > 0) rows.push([gt + i * s, gt + (i + 2) * s, gl + (l - 1) * s, gl + r * s]);
    }
    x += e[0] * f.px; prev = ch;
  }
  if (!rows.length) rows.push([0, 0, 0, 0]);
  if (inks.size > 500) inks.clear();
  inks.set(key, rows);
  return rows;
}
