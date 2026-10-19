// Deck visuals, package G: the maths behind a slide's Doppler options (doppler.js configure), in plain functions Node tests load.
//   calipers (V21): two marks at the highest and lowest velocity of the last 3 s, as the reading takes them, and the
//                   pulsatility index between them, the same number the reading's pattern is named from.
//   pair (V29):     a second slim trace under the main one, the vessel the worker always samples beside it (the main portal
//                   vein and the right hepatic vein, worker-core.js sample), drawn over the same seconds.

import { scaleFor } from './dopplerWindow.js?v=2067b803a2';

/** The pulsatility index the reading names the pattern from (doppler.js interpret): the swing over the larger extreme. */
export const pulsatility = (hi, lo) => { const big = Math.max(Math.abs(hi), Math.abs(lo)); return big > 0.5 ? (hi - lo) / big : 0; };

/** The window the calipers read, as the reading does: the last 3 s. */
export const CAL_SECS = 3;

/** The caliper marks in a record buf ([[t, v], …], sorted by t) between t0 and t1: the highest and the lowest velocity there,
 *  each on its own sample (the newest, where beats tie), so a mark sits on the trace exactly where the extreme is drawn.
 *  { hi: [t, v], lo: [t, v], pi }, or null with too little record or no flow. */
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
  return { hi: [hi[0], hi[1]], lo: [lo[0], lo[1]], pi: pulsatility(hi[1], lo[1]) };
}

/** The seconds the calipers read at tNow: the last 3 s, as the reading does, cut to the part of a sweep (seconds across W px)
 *  where a whole mark (markPx wide, centred on its sample) fits on the trace, so a mark is never pinned to an edge. */
export function caliperWindow(tNow, sweep, W, markPx) {
  const half = (markPx / 2 + 1) * sweep / Math.max(1, W);
  return [Math.max(tNow - CAL_SECS, tNow - sweep + half), tNow - half];
}

/** One frame's calipers: the marks, the index the strip shows beside them and the window they come from, all from one pick. */
export function caliperFrame(buf, tNow, sweep, W, markPx) {
  const [t0, t1] = caliperWindow(tNow, sweep, W, markPx);
  const c = t1 > t0 ? caliperPick(buf, t0, t1) : null;
  return c && { ...c, t0, t1 };
}

/** How long a caliper mark takes to glide to a new pick, in seconds, and how far from its target ([dx, dy] px) it is drawn
 *  `since` seconds after the glide began from `off`: an ease-out (cubic) that lands exactly on the target at CAL_GLIDE. */
export const CAL_GLIDE = 0.15;
export function caliperGlide(off, since, dur = CAL_GLIDE) {
  const u = Math.min(1, Math.max(0, since / dur)), left = (1 - u) ** 3;
  return [off[0] * left, off[1] * left];
}

/** The vessel the paired trace shows: the right hepatic vein under a portal vein or anything else, the main portal vein under
 *  a hepatic vein or the IVC. (The worker samples only these two beside the probe.) */
export const pairOf = (kind) => (kind === 'hepatic' || kind === 'ivc' ? 'PV_TRUNK' : 'RHV_IVC');

/** The paired trace's band, px, under a trace area hAll px tall: about a third of it, 30 to 72 px, and none where the
 *  main trace would be left under 60 px (the card keeps its size, so the main trace gets shorter, never the words). */
export const PAIR_GAP = 16;   // (its name sits in this gap, 12 px type)
export const pairBand = (hAll) => { const b = Math.min(72, Math.max(30, Math.round(hAll * 0.3))); return hAll - b - PAIR_GAP < 60 ? 0 : b; };

/** The paired trace's scale (cm/s on its larger side) and baseline (a fraction of its band from the top) for its drawn
 *  extremes above (pos) and below (neg) the baseline, on the scanner's own steps, as the main trace chooses its own. */
export function pairScale(pos, neg) {
  const base = pos + neg < 1 ? 0.5 : neg < pos * 0.08 ? 0.88 : pos < neg * 0.08 ? 0.12 : Math.min(0.88, Math.max(0.12, 0.1 + 0.8 * (pos / (pos + neg))));
  return { scale: scaleFor(Math.max(pos, neg)), base: Math.round(base * 10) / 10 };
}
