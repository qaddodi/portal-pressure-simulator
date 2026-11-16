// A stent's drawn waist and the pressure colour's steps along it (17 Nov 2026, the TIPS geometry on the figure; plan
// /mnt/project-files/tips-geometry/tips-geometry-plan.md, Phase 3). The stent is always drawn at its anatomical length: a longer waist
// lengthens the narrowed stretch inside it (waist/len of the drawn path, its ends tapering over trans/len) and never stretches the stent.
// The profile is src/engine/stent-geom.js profileAt, the one the engine, the Doppler gates and the cards read; here it is smoothed a little
// (about 0.3 of the drawn width) so the GPU tube has no kinks, and kept as a table made when a number changes, not in a frame.
import { clamp } from '../engine/physiology.js';
import { profileAt, waistSpan } from '../engine/stent-geom.js';

/** The smoothing, as a share of the stent's drawn width (the Gaussian's sigma). */
export const WAIST_SMOOTH = 0.3;
/** The narrowest flat bottom the drawing keeps, in sigmas: a waist of no length is still drawn, as a pinch. */
const FLAT_MIN = 4;
const M = 128;   // the table's cells

const memo = new Map();   // stent id → { key numbers, fn }: the same function while the numbers hold (alloc-rare: one record per stent, ever)
const REC = { len: 0, waist: 0, trans: 0 };

/**
 * The lumen's radius factor along the stent's drawn path (u from 0, the portal end, to 1): 1 in the open stent, 1 − s in the waist, the
 * transitions between, smoothed. `g` is the stent's geometry (len, waist, trans, cm), `s` its narrowing, `site` the site's fraction of the
 * path (topology.js STENT_SITES), `wPx` its drawn width and `lenPx` its drawn length (world units).
 */
export function stentWaist(id, g, s, site, wPx, lenPx) {
  let m = memo.get(id);
  if (m && m.s === s && m.site === site && m.w === wPx && m.L === lenPx && m.len === g.len && m.waist === g.waist && m.trans === g.trans) return m.fn;
  const sig = clamp((WAIST_SMOOTH * wPx) / Math.max(1, lenPx), 1 / M, 0.2);   // (in fractions of the stent)
  REC.len = g.len; REC.trans = g.trans; REC.waist = Math.max(g.waist, FLAT_MIN * sig * g.len);
  const t = new Float64Array(M + 1), K = Math.ceil(3 * sig * M), wt = new Float64Array(2 * K + 1);   // alloc-rare: made when a number changes (a slider's step, an ease's frame), never in a drawn frame otherwise
  let ws = 0;
  for (let k = -K; k <= K; k++) { wt[k + K] = Math.exp(-0.5 * ((k / M) / sig) ** 2); ws += wt[k + K]; }
  for (let j = 0; j <= M; j++) {
    let a = 0;
    for (let k = -K; k <= K; k++) { const u = (j + k) / M; a += wt[k + K] * (u < 0 || u > 1 ? 1 : profileAt(REC, s, site, u)); }
    t[j] = a / ws;
  }
  const fn = (u) => { const x = clamp(u, 0, 1) * M, i = Math.min(M - 1, Math.floor(x)); return t[i] + (t[i + 1] - t[i]) * (x - i); };
  if (!m) { m = {}; memo.set(id, m); }   // alloc-rare: the stent's first draw
  m.s = s; m.site = site; m.w = wPx; m.L = lenPx; m.len = g.len; m.waist = g.waist; m.trans = g.trans; m.fn = fn;
  return fn;
}

/**
 * Where a stent's pressure falls, as shares of the stent's whole drop and where along the drawn path (the colour's step):
 * out.jet, the waist's exit jet and inlet loss (a share, 0 to 1), at out.at (the fraction of the path where the waist ends downstream,
 * the flow's sign choosing the end), and out.ends, the device's entrance and exit loss, taken half at each end. `parts` is stentParts' record,
 * in any one unit (a pressure each, or a resistance each). `dir` is the flow's sign along the drawn path (+1: from the portal end).
 */
export function lossShares(parts, g, site, dir, out) {
  const tot = parts.total > 0 ? parts.total : 1, w = waistSpan(g, site, out.span || (out.span = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 }));   // alloc-rare: the record's first use
  out.jet = clamp((parts.jet + parts.inlet) / tot, 0, 1);
  out.ends = clamp(parts.entry / tot, 0, 1);
  out.at = dir >= 0 ? w.b0 : w.a0;
  out.dir = dir >= 0 ? 1 : -1;
  return out;
}
