// Time-lapse trails, calmed where they are made (worker-core.js sequence). Pure: loads in node for the unit tests.
import { clamp } from '../ui/num.js';
// The model's day-by-day readings are taken in quiet steps, whatever the beat's and the breath's phase is at that moment, so each carries a
// ripple of a few tenths of a mmHg that is no part of a slow trend: drawn as they come, a line zigzags and steps (the Carvedilol slide's HVPG,
// Mohammad, 16 Nov 2026; until then only the one slide that asked for it, view.smooth, was calmed). Every time-lapse of CALM_MIN days or more
// is calmed in the worker, at the one place its readings are made, so every chart that draws them (flow-time.js, the all-patients chart) gets the same calm line: each day is the local straight-line fit (tricube weights, twice over) of the days
// within `h` of it, which takes the ripple out without flattening a slope or cutting a corner short at the ends; the first and last readings
// are then pinned to what they were (the numbers beside the chart), the gap to the fit eased out over 2h days.
export const CALM_MIN = 16;
export const calmRadius = (n) => clamp(Math.round(n / 12), 3, 30);
function fitPass(a, h, out) {
  const n = a.length, W = h + 1;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - h), hi = Math.min(n - 1, i + h);
    let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
    for (let k = lo; k <= hi; k++) {
      const u = Math.abs(k - i) / W, w = (1 - u * u * u) ** 3, d = k - i;
      s0 += w; s1 += w * d; s2 += w * d * d; t0 += w * a[k]; t1 += w * d * a[k];
    }
    const det = s0 * s2 - s1 * s1;
    out[i] = det > 1e-9 * s0 * s0 ? (t0 * s2 - t1 * s1) / det : t0 / s0;
  }
  return out;
}
/** One series (equally spaced) calmed with radius h, its two end values kept. A copy. */
export function calmed(a, h) {
  const n = a.length;
  if (!(h > 0) || n < 3) return a.slice();
  const p1 = fitPass(a, h, new Array(n)), out = fitPass(p1, h, new Array(n)), d0 = a[0] - out[0], d1 = a[n - 1] - out[n - 1], t = 2 * h;
  for (let i = 0; i < n; i++) {
    const k0 = i, k1 = n - 1 - i;
    out[i] += (k0 < t ? 0.5 * (1 + Math.cos(Math.PI * k0 / t)) * d0 : 0) + (k1 < t ? 0.5 * (1 + Math.cos(Math.PI * k1 / t)) * d1 : 0);
  }
  out[0] = a[0]; out[n - 1] = a[n - 1];
  return out;
}
/** The trail's rows ([day, ...readings]) with each reading calmed (only a time-lapse of CALM_MIN rows or more: a meal's few days are as the
 *  model made them). radius: given (0: none), else calmRadius. */
export function calmTrail(rows, nCols, radius) {
  const n = rows.length;
  if (n < CALM_MIN || radius === 0) return rows;
  const h = radius > 0 ? radius : calmRadius(n), cols = Array.from({ length: nCols }, (_, c) => calmed(rows.map((r) => r[1 + c]), h));
  return rows.map((r, i) => [r[0], ...cols.map((c) => c[i])]);
}
