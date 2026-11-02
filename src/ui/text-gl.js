// Text for the GPU: words laid out from Inter's own glyph outlines (glyph-data.js, cut from the app's font by scripts/glyphs.py) as
// polylines, which the shape drawer fills on the GPU (shape-gl.js, through organ-paint's painter), so no word is painted on a 2D
// canvas. Advances, tabular figures and kerning are the font's, as the browser lays them; the weight is the nearest one cut.
//
//   const t = textPolys('7.2', 0, 12, { weight: 700, size: 12, tnum: true });   // { polys: [{ pts, closed }], w }
//   textWidth('kPa', { weight: 600, size: 12 });
//   (after loadGlyphs() has resolved: glyphsReady())
//
// The app's one door to GPU text, with two ways of drawing behind it (1 Nov 2026):
//  - outlines (above): exact, for words drawn once into a picture (a probe's screen, a halo's number, a label's picture);
//  - the SDF atlas (sdfAtlas, made by scripts/glyph-atlas.mjs): one texture of soft-edged glyphs, for text that changes every frame
//    (a chart's ticks, a monitor's live number: trace-gl.js), where a fresh outline fill each frame would cost more.
// No other module imports glyphs-inter.js or its PNG (tests/text-gl.test.js).

import { flattenPath } from './shape-gl.js?v=785ee20a7f';
import { GLYPHS as SDF_GLYPHS, KERN as SDF_KERN, BASELINES as SDF_BASELINES, BASE as SDF_BASE, RADIUS as SDF_RADIUS, CUTOFF as SDF_CUTOFF, ATLAS_W as SDF_W, ATLAS_H as SDF_H } from './glyphs-inter.js?v=d7a58fccac';
import { ATLAS_PNG as SDF_PNG } from './glyphs-inter-png.js?v=2e096d3c99';

/** The SDF atlas for text that changes every frame: metrics (em), kerning, baselines, its size and its PNG (a data URL). */
export const sdfAtlas = Object.freeze({ GLYPHS: SDF_GLYPHS, KERN: SDF_KERN, BASELINES: SDF_BASELINES, BASE: SDF_BASE, RADIUS: SDF_RADIUS, CUTOFF: SDF_CUTOFF, ATLAS_W: SDF_W, ATLAS_H: SDF_H, ATLAS_PNG: SDF_PNG });
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

/** Whether every character of the text has its outline here (at every weight cut: they are cut alike), so none is drawn as '?'. */
export function textCovers(text) {
  if (!GLYPHS) return false;
  const set = GLYPHS[WEIGHTS[0]].chars;
  for (const ch of String(text)) if (!set[ch]) return false;
  return true;
}
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

// (recs-production-120hz §9: a readout that changes draws each glyph from a path made once per weight, figure style, character and size,
// placed by a translation, so a new number builds no polygons and no path string, and its paths' flattening is cached by the painter
// (svg-gl.js shapePath). textPolys stays for setup and unusual text.)
const glyphD = new Map();
function glyphPathOf(w, ch, tnum, size) {
  const key = `${w}|${tnum ? 't' : ''}|${size}|${ch}`;
  let d = glyphD.get(key);
  if (d === undefined) {
    const g = outline(w, ch, tnum), s = size / UPM;
    d = '';
    if (g) for (const p of g.polys) {
      for (let k = 0; k < p.pts.length; k += 2) d += `${k ? 'L' : 'M'}${(p.pts[k] * s).toFixed(2)} ${(-p.pts[k + 1] * s).toFixed(2)}`;
      if (p.closed) d += 'Z';
    }
    if (glyphD.size > 4096) glyphD.clear();
    glyphD.set(key, d);
  }
  return d;
}
/** Text as one cached path per glyph and the x of each (px from `x`), on a baseline at 0: { glyphs: [[d, x], ...], w }. */
export function glyphRun(text, x = 0, { weight = 400, size = 12, tnum = false, ls = 0 } = {}, out = []) {
  const w = weightOf(weight), s = size / UPM, cs = [...String(text)];
  let at = x;
  out.length = 0;
  cs.forEach((ch, i) => {
    const g = outline(w, ch, tnum);
    if (!g) return;
    if (g.polys.length) out.push([glyphPathOf(w, ch, tnum, size), at]);
    at += g.adv * s + ls + (i < cs.length - 1 ? kernOf(w, ch, cs[i + 1], tnum) * s : 0);
  });
  return { glyphs: out, w: cs.length ? at - x - ls : 0 };
}

/**
 * The box SVG text's getBBox() gives, worked out in script (2 Nov 2026): its advances for the width, and Inter's ascent and descent
 * (hhea 1984 and 494 of 2048) each rounded to whole pixels at the size the text has on screen, as the browser rounds them, for the
 * height. `x`, `y`: the baseline's anchor point; `anchor`: 'start', 'middle' or 'end'; `k`: screen px per unit of the text's own
 * space. Null until the outlines are here.
 */
export function textBox(text, x, y, { anchor = 'start', weight = 400, size = 12, tnum = false, ls = 0, k = 1 } = {}) {
  if (!GLYPHS) return null;
  const w = textWidth(text, { weight, size, tnum, ls }), px = size * k;
  const asc = Math.round((1984 / 2048) * px) / k, desc = Math.round((494 / 2048) * px) / k;
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { x: x0, y: y - asc, width: w, height: asc + desc };
}
