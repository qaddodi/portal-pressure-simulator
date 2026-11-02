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

// ── Style values a strip writes each frame (a part's place, its length as a scale, its strength): the words for them from tables too ──
// A place is held to a quarter of a CSS pixel (under one device pixel at any scale a screen has, so an ease still reads as smooth),
// within ±TX_SPAN px; a scale to 1/512; a strength to 1/1000. Each helper returns the index; the table holds the words.
const TX_SPAN = 1536, TX_STEP = 4;
const TX = [];
for (let i = -TX_SPAN * TX_STEP; i <= TX_SPAN * TX_STEP; i++) TX.push(`${(i / TX_STEP).toFixed(2)}px 0`);
const SX = [];
for (let i = 0; i <= 512; i++) SX.push(`${(i / 512).toFixed(4)} 1`);
const OP = [];
for (let i = 0; i <= 1000; i++) OP.push((i / 1000).toFixed(3));
/** The table index of a place x (px). */
export const txIndex = (x) => { const i = Math.round(x * TX_STEP); return (i > TX_SPAN * TX_STEP ? TX_SPAN * TX_STEP : i < -TX_SPAN * TX_STEP ? -TX_SPAN * TX_STEP : i === i ? i : 0) + TX_SPAN * TX_STEP; };
/** What `style.translate` is written for that index: 'x.xxpx 0'. */
export const txWords = (i) => TX[i];
/** The table index of a scale s (0 to 1; 512 is whole size). */
export const sxIndex = (s) => { const i = Math.round(s * 512); return i > 512 ? 512 : i > 0 ? i : 0; };
export const SX_WHOLE = 512;
/** What `style.scale` is written for that index: 'x.xxxx 1'. */
export const sxWords = (i) => SX[i];
/** The words for a strength 0 to 1: '0.250'. */
export const opWords = (v) => { const i = Math.round(v * 1000); return OP[i > 1000 ? 1000 : i > 0 ? i : 0]; };

/** '0%' to '100%' for a whole percent (clamped; not a number: 0%). */
const PCTS = [];
for (let i = 0; i <= 100; i++) PCTS.push(`${i}%`);
export const pctWords = (v) => { const i = Math.round(v); return PCTS[i > 100 ? 100 : i > 0 ? i : 0]; };
