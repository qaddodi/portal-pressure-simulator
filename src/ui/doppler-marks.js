// Deck visuals, package G: the maths behind a slide's Doppler options (doppler.js configure), in plain functions Node tests load.
//   calipers (V21): two marks at the highest and lowest velocity of the last 3 s, as the reading takes them, and the
//                   pulsatility index between them, the same number the reading's pattern is named from.
//   pair (V29):     a second slim trace under the main one, the vessel the worker always samples beside it (the main portal
//                   vein and the right hepatic vein, worker-core.js sample), drawn over the same seconds.

import { scaleFor } from './dopplerWindow.js';
import { D_SURFACE, easeMove } from './motion.js';

/** The pulsatility index the reading names the pattern from (doppler.js interpret): the swing over the larger extreme. */
export const pulsatility = (hi, lo) => { const big = Math.max(Math.abs(hi), Math.abs(lo)); return big > 0.5 ? (hi - lo) / big : 0; };

/** The window the calipers read, as the reading does: the last 3 s. */
export const CAL_SECS = 3;

/** The caliper marks in a record buf ([[t, v], …], sorted by t) between t0 and t1: the highest and the lowest velocity there,
 *  each on its own sample (the newest, where beats tie), so a mark sits on the trace exactly where the extreme is drawn.
 *  { hi: [t, v], lo: [t, v], pi }, or null with too little record or no flow. */
// (The result is one kept object, with its two marks, rewritten by each call: the monitor reads it in the frame that asked.)
const PICK = { hi: [0, 0], lo: [0, 0], pi: 0, t0: 0, t1: 0 };
export function caliperPick(buf, t0, t1) {
  let hi = null, lo = null, n = 0;
  for (const p of buf) {
    if (p[0] < t0) continue;
    if (p[0] > t1) break;
    n++;
    if (!hi || p[1] >= hi[1]) hi = p;
    if (!lo || p[1] <= lo[1]) lo = p;
  }
  if (n < 8 || Math.max(Math.abs(hi[1]), Math.abs(lo[1])) < 1) return null;
  PICK.hi[0] = hi[0]; PICK.hi[1] = hi[1]; PICK.lo[0] = lo[0]; PICK.lo[1] = lo[1]; PICK.pi = pulsatility(hi[1], lo[1]);
  return PICK;
}

/** The seconds the calipers read at tNow: the last 3 s, as the reading does, cut to the part of a sweep (seconds across W px)
 *  where a whole mark (markPx wide, centred on its sample) fits on the trace, so a mark is never pinned to an edge. */
const WINDOW = [0, 0];   // (kept, rewritten by each call)
export function caliperWindow(tNow, sweep, W, markPx) {
  const half = (markPx / 2 + 1) * sweep / Math.max(1, W);
  WINDOW[0] = Math.max(tNow - CAL_SECS, tNow - sweep + half); WINDOW[1] = tNow - half;
  return WINDOW;
}

/** One frame's calipers: the marks, the index the strip shows beside them and the window they come from, all from one pick. */
/** b0, b1 (optional): one beat inside the window to read instead of the whole window, a portal vein's, whose index is read within a beat
 *  (doppler.js medianBeat); left out, or not inside the window, the whole window is read. */
export function caliperFrame(buf, tNow, sweep, W, markPx, b0 = NaN, b1 = NaN) {
  const win = caliperWindow(tNow, sweep, W, markPx), beat = b0 >= win[0] && b1 <= win[1] && b1 > b0;
  const t0 = beat ? b0 : win[0], t1 = beat ? b1 : win[1];
  const c = t1 > t0 ? caliperPick(buf, t0, t1) : null;
  if (c) { c.t0 = t0; c.t1 = t1; }
  return c;
}

/** How the calipers change without jumping (Mohammad, 19 Oct): no flat marks; a dashed line at the peak and one at the
 *  trough run across the whole trace, from one upright caliper fixed at the trace's left end to its right end, where the
 *  Doppler stops. When a level changes, its line and the upright's end tick ease there over CAL_FADE seconds (a surface step, on the move curve: the line travels). */
export const CAL_FADE = D_SURFACE / 1000;
export const caliperEase = (since, dur = CAL_FADE) => easeMove(since / dur);
/** A level (a velocity) `since` seconds after it began easing from `from` to `to`. */
export const caliperLevel = (from, to, since, dur = CAL_FADE) => from + (to - from) * caliperEase(since, dur);
/** The upright caliper's fixed x, px: at the left end of a trace that starts at padL, its end ticks (tick px each side) whole
 *  inside it. */
export const caliperX = (padL, tick) => Math.round(padL + tick + 1) + 0.5;

/** The vessel the paired trace shows: the right hepatic vein under a portal vein or anything else, the main portal vein under
 *  a hepatic vein or the IVC. (The worker samples only these two beside the probe.) */
export const pairOf = (kind) => (kind === 'hepatic' || kind === 'ivc' ? 'PV_TRUNK' : 'RHV_IVC');

/** The paired trace's band, px, under a trace area hAll px tall: about a third of it, 30 to 72 px, and none where the
 *  main trace would be left under 60 px (the card keeps its size, so the main trace gets shorter, never the words). */
export const PAIR_GAP = 16;   // (its name sits in this gap, 12 px type)
export const pairBand = (hAll) => { const b = Math.min(72, Math.max(30, Math.round(hAll * 0.3))); return hAll - b - PAIR_GAP < 60 ? 0 : b; };

/** The paired trace's scale (cm/s on its larger side) and baseline (a fraction of its band from the top) for its drawn
 *  extremes above (pos) and below (neg) the baseline, on the scanner's own steps, as the main trace chooses its own. */
const PAIR = { scale: 0, base: 0 };   // (kept, rewritten by each call: the monitor copies it at once)
export function pairScale(pos, neg) {
  const base = pos + neg < 1 ? 0.5 : neg < pos * 0.08 ? 0.88 : pos < neg * 0.08 ? 0.12 : Math.min(0.88, Math.max(0.12, 0.1 + 0.8 * (pos / (pos + neg))));
  PAIR.scale = scaleFor(Math.max(pos, neg)); PAIR.base = Math.round(base * 10) / 10;
  return PAIR;
}
