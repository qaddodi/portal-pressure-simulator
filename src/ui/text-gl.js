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

import { flattenPath } from './shape-gl.js';
import { GLYPHS as SDF_GLYPHS, KERN as SDF_KERN, BASELINES as SDF_BASELINES, BASE as SDF_BASE, RADIUS as SDF_RADIUS, CUTOFF as SDF_CUTOFF, ATLAS_W as SDF_W, ATLAS_H as SDF_H } from './glyphs-inter.js';
import { ATLAS_PNG as SDF_PNG } from './glyphs-inter-png.js';
import { DISPLAY_GLYPHS, DISPLAY_BASE, DISPLAY_RADIUS, DISPLAY_CUTOFF, DISPLAY_W, DISPLAY_H } from './glyphs-inter-display.js';
import { DISPLAY_PNG } from './glyphs-inter-display-png.js';

// (The big readouts' field, 6 Nov 2026, Mohammad: "Fibroscan number rendered has jagged edges". A number drawn large (FibroScan's 72 px
// kPa on a 3x phone, 216 device px) magnified the 32 px field almost 7 times, and its edge and dark outline came out stepped. Its digits
// and signs are also set at DISPLAY_BASE (96) px in a field of their own, laid in the same texture under the main one (rows MAIN_H up), so
// a large number reads a field magnified about twice: one texture, one draw, the same shader (the field's scale rides with each glyph).)
if (DISPLAY_W !== SDF_W || DISPLAY_CUTOFF !== SDF_CUTOFF) throw new Error('glyphs-inter-display.js: its width and cutoff must be the main atlas\'s');
const DISPLAY = Object.freeze({ GLYPHS: DISPLAY_GLYPHS, BASE: DISPLAY_BASE, RADIUS: DISPLAY_RADIUS, Y0: SDF_H, H: DISPLAY_H, PNG: DISPLAY_PNG });

/** The SDF atlas for text that changes every frame: metrics (em), kerning, baselines, its size and its PNG (a data URL); ATLAS_H is the
 *  texture's whole height, the main field's MAIN_H rows and under them the big readouts' field (DISPLAY: its glyphs' pictures, its BASE and
 *  RADIUS, and Y0, the row it starts at). */
export const sdfAtlas = Object.freeze({ GLYPHS: SDF_GLYPHS, KERN: SDF_KERN, BASELINES: SDF_BASELINES, BASE: SDF_BASE, RADIUS: SDF_RADIUS, CUTOFF: SDF_CUTOFF, ATLAS_W: SDF_W, ATLAS_H: SDF_H + DISPLAY_H, MAIN_H: SDF_H, ATLAS_PNG: SDF_PNG, DISPLAY });
/** Device px per glyph em from which a text is drawn from the display field: below it the main field is magnified 1.75 times at most. */
export const DISPLAY_FROM = 56;
/** The display field's picture of ch at weight w ([atlas x, y (from DISPLAY.Y0), w, h, pen x, pen y], at DISPLAY.BASE px), or undefined. */
export function displayGlyph(w, ch) { const g = DISPLAY_GLYPHS[w]; return g ? g[ch] : undefined; }
/** Whether every character of str has a picture in the display field at weight w (spaces need none). */
export function displayCovers(w, str) {
  const g = DISPLAY_GLYPHS[w];
  if (!g) return false;
  for (const ch of str) if (ch !== ' ' && !g[ch]) return false;
  return true;
}
// (The outlines, 200 kB, are fetched when text is first wanted, loadGlyphs: never with the page itself.)
let GLYPHS = null, OPS = null, UPM = 2048, WEIGHTS = [], loading = null;
/** Fetches the outlines once; resolves when text can be drawn. */
export function loadGlyphs() {
  // alloc-rare: the outlines are fetched once, the first time text is wanted
  return (loading ||= Promise.all([import('./glyph-data.js'), import('./glyph-data-opsz.js')]).then(([m, o]) => { OPS = o.GLYPHS_OPSZ; GLYPHS = m.GLYPHS; UPM = m.UPM; WEIGHTS = Object.keys(GLYPHS).map(Number); }, (e) => { loading = null; throw e; }));   // (a fetch that failed is forgotten: the next ask fetches again)
}
// (The metrics at each optical size, glyph-metrics.js, 140 kB: fetched only where a paragraph is laid out, never with the outlines.)
let MET = null, STOPS = [14, 32], metLoading = null;
/** Fetches the paragraph metrics once (and the outlines' weights); resolves when layoutParagraph can run. */
export function loadMetrics() {
  return (metLoading ||= Promise.all([loadGlyphs(), import('./glyph-metrics.js')]).then(([, k]) => { MET = k.METRICS; STOPS = k.STOPS; }));
}
/** Whether the outlines are here (text can be drawn now). */
export const glyphsReady = () => !!GLYPHS;
/** The weight cut nearest a CSS weight ('bold', 'normal', or a number). */
export function weightOf(w) {
  const n = w === 'bold' ? 700 : w === 'normal' || w == null || w === '' ? 400 : Number(w) || 400;
  // (A loop, not a reduce with a closure: a label a frame asks for its weight.)
  let best = WEIGHTS[0];
  for (let i = 1; i < WEIGHTS.length; i++) if (Math.abs(WEIGHTS[i] - n) < Math.abs(best - n)) best = WEIGHTS[i];
  return best;
}
// (The options a call leaves out: one frozen object, not a new {} for each call.)
const NO_OPTS = Object.freeze({});
// (The one options object textBox hands textWidth, written afresh each call: textWidth reads it at once and keeps nothing.)
const TW = { weight: 400, size: 12, tnum: false, ls: 0 };
const twOpts = (weight, size, tnum, ls) => { TW.weight = weight; TW.size = size; TW.tnum = tnum; TW.ls = ls; return TW; };
const strOf = (t) => (typeof t === 'string' ? t : String(t));   // alloc-rare: only a non-string (a number) is converted; the words drawn each frame are strings
// (The optical size a text of this size is set at: the page sets Inter at opsz = the font size (14 to 32, font-optical-sizing: auto), and the
// outlines are cut at 14 (glyph-data.js) and at 20, 24 and 32 for a readout's characters (glyph-data-opsz.js, scripts/glyphs-opsz.py). The
// nearest cut is used for the whole text, so a big number has the shapes and widths the page's own text gives it when it takes over. A
// character not cut at that size keeps its opsz-14 outline. 0: the opsz-14 cut.)
const cutOf = (size, optical, str) => {
  if (optical !== true || !OPS || size < 17) return 0;
  const o = size < 22 ? 20 : size < 28 ? 24 : 32, set = OPS[o]?.[400]?.chars;
  if (!set) return 0;
  for (const ch of str) if (!set[ch]) return 0;   // (a text with a character not cut here (a unit's letters) stays whole at opsz 14)
  return o;
};
// (Each glyph's outline flattened once, in font units, finely enough for text far larger than the app draws: UPM / 1000.)
// (One table per weight and figure style, keyed by the character: a lookup builds no key string.)
const flat = new Map();
function outline(w, ch, tnum, o = 0) {
  const wk = (w * 2 + (tnum ? 1 : 0)) * 64 + o;
  let tab = flat.get(wk);
  if (tab === undefined) { tab = new Map(); flat.set(wk, tab); }   // alloc-rare: one table per weight and figure style, the first time
  let g = tab.get(ch);
  if (g === undefined) {
    const set = GLYPHS[w], os = o ? OPS?.[o]?.[w] : null;
    const src = (os && ((tnum && os.tnum[ch]) || os.chars[ch])) || (tnum && set.tnum[ch]) || set.chars[ch] || set.chars['?'];
    g = src ? { adv: src[0], polys: src[1] ? flattenPath(src[1], UPM / 1000) : [] } : null;   // alloc-rare: each glyph's outline is flattened once, the first time it is drawn
    tab.set(ch, g);
  }
  return g;
}
// (A pair's kerning, looked up by the two characters one after the other: no 'ab' string made for each pair of each word. The font's own
// table is read once for each pair, the first time it is met.)
const kerns = new Map();
function kernOf(w, a, b, tnum, o = 0) {
  if (tnum && (GLYPHS[w].tnum[a] !== undefined || GLYPHS[w].tnum[b] !== undefined)) return 0;   // (tabular figures and the signs set on their pitch (a full stop, a comma, a minus) are not kerned: the font's own rule)
  const wk = w * 64 + o;
  let byA = kerns.get(wk);
  if (byA === undefined) { byA = new Map(); kerns.set(wk, byA); }   // alloc-rare: one table per weight, the first time
  let byB = byA.get(a);
  if (byB === undefined) { byB = new Map(); byA.set(a, byB); }   // alloc-rare: one table per first character, the first time
  let k = byB.get(b);
  if (k === undefined) { const os = o ? OPS?.[o]?.[w] : null; k = (os && os.chars[a] && os.chars[b] ? os.kern[a + b] : GLYPHS[w].kern[a + b]) || 0; byB.set(b, k); }   // alloc-rare: each pair is read from the font's table once
  return k;
}

/** Whether every character of the text has its outline here (at every weight cut: they are cut alike), so none is drawn as '?'. */
export function textCovers(text) {
  if (!GLYPHS) return false;
  const set = GLYPHS[WEIGHTS[0]].chars;
  for (const ch of strOf(text)) if (!set[ch]) return false;
  return true;
}
/** The width (px) of text set in the given weight and size: its advances, its kerning and its letter spacing. */
export function textWidth(text, { weight = 400, size = 12, tnum = false, ls = 0, optical = false } = NO_OPTS) {
  const w = weightOf(weight), s = size / UPM, str = strOf(text), o = cutOf(size, optical, str);
  // (Walked by code point with no array made of the characters, and no closure, a call a label a frame.)
  let x = 0, n = 0, ch = '', prev = '';
  for (const c of str) {
    if (n) { const g = outline(w, prev, tnum, o); x += (g ? g.adv : 0) * s + ls + kernOf(w, prev, c, tnum, o) * s; }
    prev = c; n++; ch = c;
  }
  if (n) { const g = outline(w, ch, tnum, o); x += (g ? g.adv : 0) * s + ls; }
  return n ? x - ls : 0;
}

/**
 * Text as polylines (px, y down) with its baseline's start at (x, y): every glyph's outline placed, ready for one non-zero fill.
 * { polys, w } (w: its width, as textWidth).
 */
export function textPolys(text, x, y, { weight = 400, size = 12, tnum = false, ls = 0, optical = false } = NO_OPTS) {
  const w = weightOf(weight), s = size / UPM, polys = [], str = strOf(text), o = cutOf(size, optical, str);
  let at = x, n = 0, prev = '', prevOk = false;
  // (Walked by code point, the kerning of each pair added when its second character arrives: no array made of the characters.)
  for (const ch of str) {
    if (n && prevOk) at += kernOf(w, prev, ch, tnum, o) * s;
    n++; prev = ch;
    const g = outline(w, ch, tnum, o);
    prevOk = !!g;
    if (!g) continue;
    for (const p of g.polys) {
      const q = new Float32Array(p.pts.length);
      for (let k = 0; k < q.length; k += 2) { q[k] = at + p.pts[k] * s; q[k + 1] = y - p.pts[k + 1] * s; }
      polys.push({ pts: q, closed: p.closed });
    }
    at += g.adv * s + ls;
  }
  return { polys, w: n ? at - x - ls : 0 };
}

// (recs-production-120hz §9: a readout that changes draws each glyph from a path made once per weight, figure style, character and size,
// placed by a translation, so a new number builds no polygons and no path string, and its paths' flattening is cached by the painter
// (svg-gl.js shapePath). textPolys stays for setup and unusual text.)
// (Keyed by weight and figure style, then size, then the character: a lookup builds no key string.)
const glyphD = new Map();
let glyphN = 0;
function glyphPathOf(w, ch, tnum, size, o) {
  const wk = (w * 2 + (tnum ? 1 : 0)) * 64 + o;
  let bySize = glyphD.get(wk);
  if (bySize === undefined) { bySize = new Map(); glyphD.set(wk, bySize); }   // alloc-rare: one table per weight and figure style, the first time
  let byCh = bySize.get(size);
  if (byCh === undefined) { byCh = new Map(); bySize.set(size, byCh); }   // alloc-rare: one table per size, the first time a size is drawn
  let d = byCh.get(ch);
  if (d === undefined) {
    const g = outline(w, ch, tnum, o), s = size / UPM;
    d = '';
    if (g) for (const p of g.polys) {
      for (let k = 0; k < p.pts.length; k += 2) d += `${k ? 'L' : 'M'}${(p.pts[k] * s).toFixed(2)} ${(-p.pts[k + 1] * s).toFixed(2)}`;
      if (p.closed) d += 'Z';
    }
    if (glyphN > 4096) { glyphD.clear(); glyphN = 0; bySize = new Map(); glyphD.set(wk, bySize); byCh = new Map(); bySize.set(size, byCh); }   // alloc-rare: the tables start over past 4096 glyphs, which one deck's figures never reach
    byCh.set(ch, d); glyphN++;
  }
  return d;
}
/** Text as one cached path per glyph and the x of each (px from `x`), on a baseline at 0: { glyphs: [[d, x], ...], w }. The pairs and the
 *  returned object are kept (the pairs on `out`, which the caller owns; the object is shared), so a call builds nothing once `out` has held
 *  as many glyphs: read the result before the next call. */
const RUN = { glyphs: null, w: 0 };
export function glyphRun(text, x = 0, { weight = 400, size = 12, tnum = false, ls = 0, optical = false } = NO_OPTS, out = null) {
  const w = weightOf(weight), s = size / UPM, str = strOf(text), o = cutOf(size, optical, str);
  if (out === null) out = [];   // alloc-rare: a caller with no array of its own (none today; every drawing caller keeps one)
  const pool = out.pairs || (out.pairs = []);   // alloc-rare: the pair pool is made once for each array the caller keeps
  let at = x, n = 0, count = 0, prev = '', prevOk = false;
  for (const ch of str) {
    if (n && prevOk) at += kernOf(w, prev, ch, tnum, o) * s;
    n++; prev = ch;
    const g = outline(w, ch, tnum, o);
    prevOk = !!g;
    if (!g) continue;
    if (g.polys.length) {
      const pr = pool[count] || (pool[count] = [null, 0]);   // alloc-rare: a pair is made the first time the array reaches that many glyphs
      pr[0] = glyphPathOf(w, ch, tnum, size, o); pr[1] = at;
      out[count++] = pr;
    }
    at += g.adv * s + ls;
  }
  out.length = count;
  RUN.glyphs = out; RUN.w = n ? at - x - ls : 0;
  return RUN;
}

/**
 * The box SVG text's getBBox() gives, worked out in script (2 Nov 2026): its advances for the width, and Inter's ascent and descent
 * (hhea 1984 and 494 of 2048) each rounded to whole pixels at the size the text has on screen, as the browser rounds them, for the
 * height. `x`, `y`: the baseline's anchor point; `anchor`: 'start', 'middle' or 'end'; `k`: screen px per unit of the text's own
 * space. Null until the outlines are here.
 */
export function textBox(text, x, y, { anchor = 'start', weight = 400, size = 12, tnum = false, ls = 0, k = 1 } = NO_OPTS) {
  if (!GLYPHS) return null;
  const w = textWidth(text, twOpts(weight, size, tnum, ls)), px = size * k;
  const asc = Math.round((1984 / 2048) * px) / k, desc = Math.round((494 / 2048) * px) / k;
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { x: x0, y: y - asc, width: w, height: asc + desc };
}

// ── Paragraphs (3 Nov 2026): lines broken as the browser breaks them ──
// The card's words are set by the browser today (a column of the card's width: font, size, weight, letter spacing, text-wrap); drawn on
// the GPU they must break at the same words. The browser sets Inter at the optical size of the text (opsz 14 to 32 follows the font
// size), so the advances and kerning here come from glyph-metrics.js, cut at several optical sizes and interpolated, not from the opsz-14
// outlines (those run about 2 % wide at 17 px: enough to move a break). tests/e2e/paragraph-match.mjs compares every line break of every
// deck's card words with the browser's, in Chromium.
//
//   const p = layoutParagraph([{ text: 'The portal', weight: 400, size: 17.4 }, { text: 'vein', weight: 600, size: 17.4 }], 320);
//   p.lines   // [{ start, end, w, runs: [{ run, text, x, w }] }]  (start and end: character offsets in the runs' text joined; w: the line's width)
//
// A run is { text, weight, size, tnum, ls, nowrap }: its own style, kerned within itself (the browser shapes each inline element apart).
// nowrap: the run is one unbreakable piece (a pill: .pz-nw). Spaces at a line's end hang and take no width; U+00A0 and U+2060 never break.

// (Line break classes, the part of UAX #14 the cards use: where a line may break between two characters. Anything not listed is AL, a
// letter: no break inside a word, a number, or between a word and a sign.)
const CLS = { ' ': 'SP', '\u00a0': 'GL', '\u2060': 'GL', '\u0304': 'CM', '(': 'OP', '[': 'OP', '{': 'OP', ')': 'CP', ']': 'CP', '}': 'CP', '!': 'EX', '?': 'EX',
  ',': 'IS', '.': 'IS', ';': 'IS', ':': 'IS', '/': 'SY', '-': 'HY', '\u2013': 'BA', '\u00ad': 'BA', '\u2014': 'B2', '"': 'QU', '\'': 'QU', '\u201c': 'QU',
  '\u201d': 'QU', '\u2018': 'QU', '\u2019': 'QU', '\u2212': 'PR', '+': 'PR', '$': 'PR', '\u00b1': 'PR', '\u00b0': 'PO', '%': 'PO' };
const brClass = (c) => CLS[c] || (c >= '0' && c <= '9' ? 'NU' : 'AL');
/** Whether a line may break between character a and the character b that follows it, by their classes. */
export function mayBreak(a, b) {
  const x = brClass(a), y = brClass(b);
  if (x === 'SP') return y !== 'SP' && y !== 'EX' && y !== 'CP' && y !== 'IS' && y !== 'SY' && y !== 'CM';   // (a break after spaces, but never before a stop or a closing bracket)
  if (y === 'SP' || y === 'GL' || x === 'GL' || y === 'CM' || y === 'EX' || y === 'CP' || y === 'IS' || y === 'SY' || y === 'QU' || x === 'QU' || x === 'OP') return false;
  if (x === 'B2' || y === 'B2') return true;
  if (x === 'HY') return y !== 'NU';
  if (x === 'BA') return true;
  if (x === 'SY') return y !== 'NU';
  return false;
}

// (The advance of a character at a weight and optical size, in font units: a table entry is a number, the same at every stop, or one value per stop.)
function at(v, i, f) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return f && v[i + 1] !== undefined ? v[i] + (v[i + 1] - v[i]) * f : v[i];
}
function stopOf(size) {
  const o = Math.min(STOPS[STOPS.length - 1], Math.max(STOPS[0], size));
  let i = 0;
  while (i < STOPS.length - 2 && o >= STOPS[i + 1]) i++;
  return { i, f: (o - STOPS[i]) / (STOPS[i + 1] - STOPS[i]) };
}
/** Whether every character of the text has its metrics here (so none is measured as a stand-in). */
export function metricsCover(text) {
  if (!MET) return false;
  const adv = MET[WEIGHTS[0]].adv;
  for (const ch of String(text)) if (!(ch in adv)) return false;
  return true;
}
// The widths of a run's characters, kerning included, as the browser shapes it: one number per character, the kerning with the next
// character joined to this one (it is the pair's, set between the two glyphs).
function runWidths(run) {
  const w = weightOf(run.weight), m = MET[w], { i, f } = stopOf(run.size), s = run.size / UPM, cs = [...String(run.text)], out = new Array(cs.length);
  for (let k = 0; k < cs.length; k++) {
    const ch = cs[k], tn = run.tnum && m.tnum[ch] !== undefined;   // (tabular: the figures and the signs the feature sets on their pitch)
    let a = at(tn ? m.tnum[ch] : m.adv[ch] !== undefined ? m.adv[ch] : m.adv['?'], i, f);
    if (k < cs.length - 1 && !(run.tnum && (tn || m.tnum[cs[k + 1]] !== undefined))) a += at(m.kern[ch + cs[k + 1]], i, f);
    out[k] = a * s + (run.ls || 0);
  }
  return out;
}
/**
 * Lays runs out in a column of the given width, breaking as the browser does (a greedy fill at the break opportunities above, then the
 * last lines evened out as `text-wrap: pretty` does when pretty is set). Returns { lines, width } with, per line, its character range
 * and runs (positions in px from the column's left, y down not given: the caller's line height sets it). Pure: allocates only what it returns.
 */
export function layoutParagraph(runs, width, { pretty = false } = {}) {
  const cells = [];   // { ch, run, w } per character, the run's index and the advance (px, letter spacing included)
  runs.forEach((r, ri) => {
    const ws = runWidths(r), cs = [...String(r.text)];
    cs.forEach((ch, k) => cells.push({ ch, run: ri, w: ws[k], nw: !!r.nowrap }));
  });
  // (Break opportunities: a boundary index b means a break between cells b-1 and b.)
  const ok = new Uint8Array(cells.length + 1);
  for (let b = 1; b < cells.length; b++) {
    const a = cells[b - 1], c = cells[b];
    ok[b] = (a.nw && a.run === c.run) || (c.nw && a.run === c.run) ? 0 : mayBreak(a.ch, c.ch) ? 1 : 0;
  }
  // (Prefix widths, so a line's width is a difference; its hanging spaces, at its end, take none.)
  const n = cells.length, pre = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) pre[k + 1] = pre[k] + cells[k].w;
  const fit = (s0, e) => { let t = e; while (t > s0 && cells[t - 1].ch === ' ') t--; return pre[t] - pre[s0]; };
  const lines = [];
  let start = 0;
  while (start < n) {
    let end = -1;
    for (let b = start + 1; b <= n; b++) {
      if (b < n && !ok[b]) continue;
      if (fit(start, b) <= width + 0.01) end = b; else { if (end < 0) end = b; break; }
    }
    if (end < 0) end = n;
    lines.push({ start, end });
    start = end;
    while (start < n && cells[start].ch === ' ') start++;
  }
  if (pretty) prettyEnd(lines, cells, fit, ok, width);
  return { lines: lines.map((l) => finishLine(cells, runs, l)), cells };
}
// text-wrap: pretty, as Chromium sets it (filled in below once measured against the browser).
function prettyEnd() {}
function finishLine(cells, runs, { start, end }) {
  let e = end; while (e > start && cells[e - 1].ch === ' ') e--;
  const parts = []; let x = 0;
  for (let k = start; k < e; k++) {
    const c = cells[k], last = parts[parts.length - 1];
    if (last && last.run === c.run) { last.text += c.ch; last.w += c.w; } else parts.push({ run: c.run, text: c.ch, x, w: c.w });
    x += c.w;
  }
  return { start, end: e, w: x, runs: parts };
}
