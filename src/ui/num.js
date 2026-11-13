// The app's number helpers in one pure module (unification audit 17, 13 Nov 2026): no DOM, so the tests and the pure chart builders load it
// in Node as the page does. util.js re-exports fmt from here.
//   text    fmt(v, d): a value to d decimals with a true minus (U+2212) and never "−0", NOT_SHOWN for a missing one; minusFixed(v, d): the
//           same text with a true minus but kept as toFixed gives it otherwise ("−0.0" for a small negative, no dash for a missing value);
//           fix1, round1, tenths, printedKey: toFixed(1) and its number from a table of tenths (fix-text.js until 13 Nov 2026)

// (The text a value that is not there (null, NaN, ±Infinity) is shown as: one glyph, kept with the bands' words in pressure-cuts.js.)
import { NOT_SHOWN } from '../engine/pressure-cuts.js';
export { NOT_SHOWN };

// (A value's text is made once and kept for the repeats: a readout that holds its value, or comes back to one, asks for the same text on
// every frame. Keyed by the number itself, so the text is exactly what toFixed gave; cut when it grows.)
const fmtTexts = [new Map(), new Map(), new Map(), new Map()];
/** v to d decimals, with a true minus, and "0.0", never "−0.0", for a value that rounds to zero; NOT_SHOWN for no number. */
export function fmt(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return NOT_SHOWN;
  const m = fmtTexts[d] || (fmtTexts[d] = new Map());   // alloc-rare: a precision met for the first time
  let r = m.get(v);
  if (r !== undefined) return r;
  const t = v.toFixed(d);
  // A value that rounds to zero has no sign ("−0" reads as an error).
  r = /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace('-', '−');   // alloc-rare: the same new value, signed text made once
  if (m.size > 4096) m.clear();
  m.set(v, r);
  return r;
}
/** |v| to d decimals after a true minus for any v below zero: "−0.0" for −0.04, and toFixed's own "NaN" or "Infinity" (fmt's rules are not
 *  applied; the chart tools have always printed their axes and bars this way). */
export const minusFixed = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

// ── toFixed(1) from a table of tenths (fix-text.js until 13 Nov 2026) ──
// Numbers as the one-decimal text toFixed(1) gives, from a table of the tenths already met, so a number that moves every frame (a head on a
// chart, a reading easing to its value) makes no new string for a tenth it has shown before. toFixed rounds the exact decimal value of the
// double; a plain rounding of it can part from that only within an ulp of a half tenth, so those values (and any below zero or out of the
// table's range) are made the long way and everything else is the same text. (liver-morph.js keeps its own fix1, a whole table made at load
// and a tie read exactly, for the nodules' path on every frame of the ease: about 1.6 times this one's speed.)
const FIX = [];
const POW10 = [1, 10, 100, 1000];

/** The tenth x rounds to as toFixed(1) rounds it, or -1 where a plain rounding could part from it, below zero or out of the table's range. */
export function tenths(x) {
  const q = x * 10, f = Math.floor(q) + 0;   // (+ 0: a minus zero is zero)
  return x >= 0 && q < 1e5 && Math.abs(q - f - 0.5) > 1e-6 ? (q - f < 0.5 ? f : f + 1) : -1;
}
/** x.toFixed(1). */
export function fix1(x) {
  const k = tenths(x);
  // alloc-rare: a tenth's text is made the first time it is met (the table then holds it); a value off the table is made the long way
  return k >= 0 ? FIX[k] || (FIX[k] = (k / 10).toFixed(1)) : x.toFixed(1);
}
/** +x.toFixed(1): the number a coordinate is written as. */
export function round1(x) {
  const k = tenths(x);
  // alloc-rare: only for a value off the table (below zero, or within 1e-6 of a half tenth)
  return k >= 0 ? k / 10 : +x.toFixed(1);
}
/** What v rounds to at d decimals (0 to 3), as a whole number, or NaN where that is not certain: the same number is the same text. */
export function printedKey(v, d) {
  const q = v * POW10[d], f = Math.floor(q);
  return v >= 0 && q < 1e15 && Math.abs(q - f - 0.5) > 1e-6 ? (q - f < 0.5 ? f : f + 1) : NaN;
}
