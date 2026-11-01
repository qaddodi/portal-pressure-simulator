// Text for the GPU: words laid out from Inter's own glyph outlines (glyph-data.js, cut from the app's font by scripts/glyphs.py) as
// polylines, which the shape drawer fills on the GPU (shape-gl.js, through organ-paint's painter), so no word is painted on a 2D
// canvas. Advances, tabular figures and kerning are the font's, as the browser lays them; the weight is the nearest one cut.
//
//   const t = textPolys('7.2', 0, 12, { weight: 700, size: 12, tnum: true });   // { polys: [{ pts, closed }], w }
//   textWidth('kPa', { weight: 600, size: 12 });
//   (after loadGlyphs() has resolved: glyphsReady())

import { flattenPath } from './shape-gl.js?v=f7d920b7d0';
// (The outlines, 200 kB, are fetched when text is first wanted, loadGlyphs: never with the page itself.)
let GLYPHS = null, UPM = 2048, WEIGHTS = [], loading = null;
/** Fetches the outlines once; resolves when text can be drawn. */
export function loadGlyphs() {
  return (loading ||= import('./glyph-data.js?v=10f8176c7c').then((m) => { GLYPHS = m.GLYPHS; UPM = m.UPM; WEIGHTS = Object.keys(GLYPHS).map(Number); }));
}
/** Whether the outlines are here (text can be drawn now). */
export const glyphsReady = () => !!GLYPHS;
/** The weight cut nearest a CSS weight ('bold', 'normal', or a number). */
export function weightOf(w) {
  const n = w === 'bold' ? 700 : w === 'normal' || w == null || w === '' ? 400 : Number(w) || 400;
  return WEIGHTS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), WEIGHTS[0]);
}
// (Each glyph's outline flattened once, in font units, finely enough for text far larger than the app draws: UPM / 1000.)
const flat = new Map();
function outline(w, ch, tnum) {
  const key = `${w}|${tnum ? 't' : ''}${ch}`;
  let g = flat.get(key);
  if (g === undefined) {
    const set = GLYPHS[w], src = (tnum && set.tnum[ch]) || set.chars[ch] || set.chars['?'];
    g = src ? { adv: src[0], polys: src[1] ? flattenPath(src[1], UPM / 1000) : [] } : null;
    flat.set(key, g);
  }
  return g;
}
const kernOf = (w, a, b, tnum) => (tnum && /\d/.test(a + b) ? 0 : GLYPHS[w].kern[a + b] || 0);

/** The width (px) of text set in the given weight and size: its advances, its kerning and its letter spacing. */
export function textWidth(text, { weight = 400, size = 12, tnum = false, ls = 0 } = {}) {
  const w = weightOf(weight), s = size / UPM, cs = [...String(text)];
  let x = 0;
  cs.forEach((ch, i) => { const g = outline(w, ch, tnum); x += (g ? g.adv : 0) * s + ls + (i < cs.length - 1 ? kernOf(w, ch, cs[i + 1], tnum) * s : 0); });
  return cs.length ? x - ls : 0;
}

/**
 * Text as polylines (px, y down) with its baseline's start at (x, y): every glyph's outline placed, ready for one non-zero fill.
 * { polys, w } (w: its width, as textWidth).
 */
export function textPolys(text, x, y, { weight = 400, size = 12, tnum = false, ls = 0 } = {}) {
  const w = weightOf(weight), s = size / UPM, cs = [...String(text)], polys = [];
  let at = x;
  cs.forEach((ch, i) => {
    const g = outline(w, ch, tnum);
    if (!g) return;
    for (const p of g.polys) {
      const q = new Float32Array(p.pts.length);
      for (let k = 0; k < q.length; k += 2) { q[k] = at + p.pts[k] * s; q[k + 1] = y - p.pts[k + 1] * s; }
      polys.push({ pts: q, closed: p.closed });
    }
    at += g.adv * s + ls + (i < cs.length - 1 ? kernOf(w, ch, cs[i + 1], tnum) * s : 0);
  });
  return { polys, w: cs.length ? at - x - ls : 0 };
}
