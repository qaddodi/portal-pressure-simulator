// One number roll for a figure reading (review LBL-7, 15 Nov 2026: "one way"): a number that takes a new value counts to it over COUNT_MS on easeArrive
// (motion.js: the owner's one roll, 0.4 s), as the data card's tiles, Explore's numbers and the figure's site readings do; within `tol` of the number shown
// (the live model breathing, a slider being dragged) it simply follows, and a number just shown, or under reduced motion, takes its value at once.
// The figure's site readings (stage-sites-paint.js siteCount) and its station labels (stage-label-items.js nodeItem, through labelRoll) both step here.
import { COUNT_MS, easeArrive } from './motion.js';

/** A roll's record: v the number shown (null before the first), from/to/t0 the count in flight, on whether one is. Made once per reading, written in place. */
export const newRoll = () => ({ v: null, from: 0, to: 0, t0: 0, on: false, seen: 0 });

/** The number to show at `now` for the model's `to`. `still`: take it at once (reduced motion, a reading that is hidden). Writes r; allocates nothing. */
export function rollStep(r, to, tol, now, still = false) {
  if (!Number.isFinite(to)) { r.v = null; r.on = false; return to; }
  if (r.v == null || still) { r.on = false; return (r.v = to); }
  if (r.on ? Math.abs(to - r.to) > tol : Math.abs(to - r.v) > tol) { r.on = true; r.from = r.v; r.to = to; r.t0 = now; }
  if (!r.on) return (r.v = to);
  r.to = to;
  const u = now >= r.t0 + COUNT_MS ? 1 : (now - r.t0) / COUNT_MS;
  r.v = r.from + (r.to - r.from) * easeArrive(u);
  if (u >= 1) r.on = false;
  return r.v;
}

// The station labels' rolls, by label key. A label not asked for in GONE_MS (hidden, or its view left) counts from nothing: it is shown at its value.
const GONE_MS = 1500, labels = new Map();
let wake = null;
/** The function that gets a frame while a label's number is counting (stage-labels.js writes the new value into the label). */
export const onLabelRoll = (fn) => { wake = fn; };
/** A station label's number for the model's `to` at `now`: the roll's, asking for the next frame while it counts. */
export function labelRoll(key, to, tol, now, still = false) {
  let r = labels.get(key);
  if (!r) labels.set(key, r = newRoll());
  if (now - r.seen > GONE_MS) { r.v = null; r.on = false; }
  r.seen = now;
  const v = rollStep(r, to, tol, now, still);
  if (r.on) wake?.();
  return v;
}
