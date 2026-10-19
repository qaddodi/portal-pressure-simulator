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
 *  each placed at its latest moment within 3% of the swing, so the marks sit on the newest beat that reaches them and the
 *  older one stays on screen as long as it can. { hi: [t, v], lo: [t, v], pi }, or null with too little record or no flow. */
export function caliperPick(buf, t0, t1) {
  let hi = -Infinity, lo = Infinity, n = 0;
  for (const p of buf) { if (p[0] < t0 || p[0] > t1) continue; n++; if (p[1] > hi) hi = p[1]; if (p[1] < lo) lo = p[1]; }
  if (n < 8 || Math.max(Math.abs(hi), Math.abs(lo)) < 1) return null;
  const tol = Math.max(0.03 * (hi - lo), 0.05);
  let th = null, tl = null;
  for (let i = buf.length - 1; i >= 0 && (th == null || tl == null); i--) {
    const [t, v] = buf[i];
    if (t > t1) continue;
    if (t < t0) break;
    if (th == null && v >= hi - tol) th = t;
    if (tl == null && v <= lo + tol) tl = t;
  }
  return { hi: [th, hi], lo: [tl, lo], pi: pulsatility(hi, lo) };
}

/** Whether a held caliper pick should give way to a new one: a mark about to leave the trace's left edge, or, once it has
 *  been up CAL_HOLD seconds (held is how long), a reading that has moved on (a what-if or a new state: the index differs by
 *  more than 0.1, or an extreme by more than 15% of the larger). Breath to breath the extremes swing a little; that alone
 *  never moves the marks. */
export const CAL_HOLD = 2;
export function caliperStale(cal, now, edge, held = Infinity) {
  if (Math.min(cal.hi[0], cal.lo[0]) < edge) return true;
  if (!now || held < CAL_HOLD) return false;
  const span = Math.max(Math.abs(cal.hi[1]), Math.abs(cal.lo[1]), 1);
  return Math.abs(now.pi - cal.pi) > 0.1 || Math.abs(now.hi[1] - cal.hi[1]) > 0.15 * span || Math.abs(now.lo[1] - cal.lo[1]) > 0.15 * span;
}

/** The vessel the paired trace shows: the right hepatic vein under a portal vein or anything else, the main portal vein under
 *  a hepatic vein or the IVC. (The worker samples only these two beside the probe.) */
export const pairOf = (kind) => (kind === 'hepatic' || kind === 'ivc' ? 'PV_TRUNK' : 'RHV_IVC');

/** The paired trace's band, px, under a trace area hAll px tall: about a third of it, 30 to 72 px, and none where the
 *  main trace would be left under 60 px (the card keeps its size, so the main trace gets shorter, never the words). */
export const PAIR_GAP = 8;
export const pairBand = (hAll) => { const b = Math.min(72, Math.max(30, Math.round(hAll * 0.3))); return hAll - b - PAIR_GAP < 60 ? 0 : b; };

/** The paired trace's scale (cm/s on its larger side) and baseline (a fraction of its band from the top) for its drawn
 *  extremes above (pos) and below (neg) the baseline, on the scanner's own steps, as the main trace chooses its own. */
export function pairScale(pos, neg) {
  const base = pos + neg < 1 ? 0.5 : neg < pos * 0.08 ? 0.88 : pos < neg * 0.08 ? 0.12 : Math.min(0.88, Math.max(0.12, 0.1 + 0.8 * (pos / (pos + neg))));
  return { scale: scaleFor(Math.max(pos, neg)), base: Math.round(base * 10) / 10 };
}
