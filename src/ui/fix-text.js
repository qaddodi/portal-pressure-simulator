// Numbers as the one-decimal text toFixed(1) gives, from a table of the tenths already met, so a number that moves every frame (a head on a
// chart, a reading easing to its value) makes no new string for a tenth it has shown before. toFixed rounds the exact decimal value of the
// double; a plain rounding of it can part from that only within an ulp of a half tenth, so those values (and any below zero or out of the
// table's range) are made the long way and everything else is the same text.
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
