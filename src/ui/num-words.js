// A number's words, from tables made once at load: a frame that shows a gliding reading picks its words, it never builds them
// (toFixed, a template or a concatenation makes a string each time: garbage in a frame, 2 Nov 2026 zero-allocation pass).
//
//   numWords(v, d)     v to d decimals, a minus sign (U+2212) for a negative: '12.4', '−3.0', '7'
//   signedWords(v, d)  the same with a plus sign for a rise, and a bare zero for what rounds to nothing: '+3.2', '−0.4', '0.0'
//
// d is 0, 1 or 2; a value beyond the table's reach (±3000 whole, ±300 at one decimal, ±50 at two) is shown at its edge, which no reading
// the tools draw comes near (the largest is a few hundred whole percent or tens of mmHg). Not a number: zero.
const SPAN = [3000, 300, 50];

const build = (d) => {
  const k = Math.pow(10, d), n = SPAN[d] * k, plain = [], signed = [];
  for (let i = -n; i <= n; i++) {
    const a = Math.abs(i) / k, w = a.toFixed(d);
    plain.push(i < 0 ? `−${w}` : w);
    signed.push(i === 0 ? w : i < 0 ? `−${w}` : `+${w}`);
  }
  return { k, n, plain, signed };
};
const TABLES = [build(0), build(1), build(2)];

/** v to d decimals (d 0 to 2), minus sign U+2212 for a negative. */
export function numWords(v, d) {
  const T = TABLES[d] || TABLES[1];
  let i = Math.round(v * T.k);
  if (i !== i) i = 0;
  return T.plain[(i > T.n ? T.n : i < -T.n ? -T.n : i) + T.n];
}
/** The same, with + for a rise; what rounds to nothing is a bare zero. */
export function signedWords(v, d) {
  const T = TABLES[d] || TABLES[1];
  let i = Math.round(v * T.k);
  if (i !== i) i = 0;
  return T.signed[(i > T.n ? T.n : i < -T.n ? -T.n : i) + T.n];
}

// ── Style values a strip writes each frame: the words for a whole percent, from a table ──
/** '0%' to '100%' for a whole percent (clamped; not a number: 0%). */
const PCTS = [];
for (let i = 0; i <= 100; i++) PCTS.push(`${i}%`);
export const pctWords = (v) => { const i = Math.round(v); return PCTS[i > 100 ? 100 : i > 0 ? i : 0]; };
