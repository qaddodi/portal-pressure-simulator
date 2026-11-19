// Time-lapse trails, calmed where they are made (worker-core.js sequence). Pure: loads in node for the unit tests.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));   // (the engine imports nothing from src/ui: scripts/source-shapes/engine-no-ui-19nov.mjs)
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

// ── The Days chart's trend (ui/pressure-time.js): a series with CHANGES in it ──
// A treatment is a step, not a slope. A centred fit smears a step both ways: a TIPS on day 180 of an HVPG of 18 that falls to 8 was drawn falling from
// day 143, reading 13.1 the day before the stent (LOOK-2, 19 Nov 2026), the opposite of what the chart teaches. So a series is cut at every change (a
// treatment or a procedure: ui/pressure-time.js notes it as the frame arrives) and each piece is calmed alone, its own two ends pinned to the readings,
// and the change day holds both values, the last before and the first after, so the step is vertical.
/** One series calmed in pieces: `starts` are the indexes where a new piece begins. A piece shorter than CALM_MIN stays as it was read. */
export function calmedPieces(a, starts = []) {
  const n = a.length, cuts = [0, ...[...new Set(starts)].filter((i) => i > 0 && i < n).sort((x, y) => x - y), n], out = new Array(n);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k], hi = cuts[k + 1], piece = a.slice(lo, hi), c = piece.length >= CALM_MIN ? calmed(piece, calmRadius(piece.length)) : piece;
    for (let j = 0; j < c.length; j++) out[lo + j] = c[j];
  }
  return out;
}
/** The Days list's one trace, calmed: days is [{ day, v: { key: reading }, start? }] (start: a change began a new piece here). Returns { x, mid }. */
export function calmedDays(days, key) {
  const x = [], v = [], starts = [];
  for (const d of days) { if (d.v[key] == null) continue; if (d.start && x.length) starts.push(x.length); x.push(d.day); v.push(d.v[key]); }
  return { x, mid: calmedPieces(v, starts) };
}
/** Today's reading into the Days list. A new day is a new point. On the same day a reading just goes on updating today's point (a slider, the
 *  model settling), unless `stepped`: a change (a treatment or a procedure) came with it, and the point before it stays as it was read while the change
 *  starts a point of its own on the same day, so the step is vertical and the days before it are not touched. Returns true when the list's points changed
 *  (a day or a step added, one dropped, or the clock went back), false when only today's point moved. `max`: the days kept. */
export function recordDay(days, day, v, stepped = false, max = 1500) {
  const last = days[days.length - 1];
  let grew = false;
  if (last && day < last.day) { days.length = 0; grew = true; }
  const t = days[days.length - 1];
  if (!t || t.day !== day || (stepped && days.length)) {
    days.push(stepped && days.length ? { day, v: { ...v }, start: true } : { day, v: { ...v } });
    grew = true;
    if (days.length > max) days.shift();
  } else Object.assign(t.v, v);   // (in place: no record made for a frame that only moves today's point)
  return grew;
}
