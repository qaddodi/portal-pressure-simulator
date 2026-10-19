// Deck visuals package D (review/deck-visuals-recs.md V22, V23, V15): the teaching card's and the summary tables' opt-in
// fields, as pure functions the unit tests load. presenter.js and handout.js call them; a deck that sets none of these fields
// looks as before.
import { TILE, RATE, rateOf } from './table-marks.js?v=810c0a1575';

// ── V22: the case's numbers inside an equation ──────────────────────────────
// A token {key} (or {key@slide}) inside a slide's eq MathML is the slide's own reading, to the decimals its tile prints, so
// the equation reads "18.0 − 6.0 = 12.0" under "HVPG = WHVP − FHVP". A token may stand bare or as the content of an <mn> or <mi>.
export const EQ_TOKEN = /(?:<m[in]>\s*)?\{(\w+)(?:@([\w-]+))?\}(?:\s*<\/m[in]>)?/g;
// (The ascites albumin has no tile: it is in the fingerprint, g/dL, for the SAAG equation.)
const EXTRA = { aalb: { d: 1 } };
// The differences a slide shows as an equation: each is the difference of its two readings as shown, so the numbers add up
// (as the tiles' tenthGap does). The ascites albumin is the one the screen shows nowhere else, so it is the SAAG's free term:
// serum albumin less SAAG, both as their tiles print them.
const GAPS = { hvpg: ['whvp', 'fhvp'], ppg: ['pv', 'ivc'] };
// Only an equation's results take their rating colour (the readings that feed them stay plain).
const RATED = new Set(['hvpg', 'ppg', 'saag']);

const fmtOf = (k) => TILE[k] || EXTRA[k] || null;
export const eqKnows = (k) => !!fmtOf(k);
const num = (v, d) => { const t = (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d); return t.replace('-', '−'); };
// A reading as its tile shows it, back as a number (its scale undone), or null when the fingerprint lacks it.
function shownNum(k, f) {
  const T = fmtOf(k), v = f?.[k];
  if (!T || v == null || !Number.isFinite(v)) return null;
  const d = T.d ?? 1, x = T.x ?? 1;
  return +(+(v * x).toFixed(d)).toFixed(d);
}
/** The number an equation shows for key k on fingerprint f, in display units (null when not known). */
export function eqValue(k, f) {
  const d = fmtOf(k)?.d ?? 1;
  if (GAPS[k]) {
    const [a, b] = GAPS[k].map((x) => shownNum(x, f));
    if (a != null && b != null) return +(a - b).toFixed(d);
  }
  if (k === 'aalb') {
    const s = shownNum('salb', f), g = shownNum('saag', f);
    if (s != null && g != null) return +(s - g).toFixed(d);
  }
  return shownNum(k, f);
}
/** The text of that number, a true minus, "—" when not known. */
export const eqText = (k, f) => { const v = eqValue(k, f); return v == null ? '—' : num(v, fmtOf(k)?.d ?? 1); };
/** A result's rating (hi, mid, ok) for its colour, judged on the number shown; null for a plain reading. */
export const eqRate = (k, f) => {
  const v = eqValue(k, f);
  return RATED.has(k) && v != null && RATE[k] ? rateOf(k, { ...f, [k]: v })[0] || null : null;
};
/** True when an equation's MathML carries a token the presenter fills. */
export const eqFilled = (ml) => typeof ml === 'string' && [...ml.matchAll(EQ_TOKEN)].some(([, k]) => eqKnows(k));
/** The MathML with each known token as an <mn> holding the number (class eq-v, data-k its key, data-at another slide's id,
 *  data-rate a result's rating). fp: the slide's numbers; at(id): another slide's. plain: numbers only (the handout). */
export function fillEq(ml, fp, at = () => null, plain = false) {
  return String(ml ?? '').replace(EQ_TOKEN, (all, k, id) => {
    if (!eqKnows(k)) return all;
    const f = id ? at(id) : fp, rate = plain ? null : eqRate(k, f);
    return plain ? `<mn>${eqText(k, f)}</mn>` : `<mn class="eq-v" data-k="${k}"${id ? ` data-at="${id}"` : ''}${rate ? ` data-rate="${rate}"` : ''}>${eqText(k, f)}</mn>`;
  });
}
// The equation's numbers as one line of text, the tags dropped ("18.0 − 6.0 = 12.0 mmHg").
const flat = (ml, fp, at) => fillEq(ml, fp, at, true).replace(/<mo>([^<]*)<\/mo>/g, ' $1 ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const N = String.raw`−?\d+(?:\.\d+)?`, OP = String.raw`[−+×·⋅]`;
const SIDE = String.raw`${N}(?:\s*${OP}\s*${N})*`;
const evalSide = (t) => {
  const parts = t.match(new RegExp(`${N}|${OP}`, 'g')).map((x) => x.replace('−', '-'));
  // (a lone "-" between two numbers is the operator; a number's own sign stays with it)
  let v = +parts[0];
  for (let j = 1; j < parts.length; j += 2) {
    const o = parts[j], b = +parts[j + 1];
    v = o === '-' ? v - b : o === '+' ? v + b : v * b;
  }
  return v;
};
/** Every "numbers = numbers" run in the filled equation holds, to the decimals shown (true when there is none). */
export function eqAddsUp(ml, fp, at = () => null) {
  const t = flat(ml, fp, at).replace(/(\d)\s*−\s*(?=\d)/g, '$1 − ');
  for (const m of t.matchAll(new RegExp(`(${SIDE})\\s*=\\s*(${SIDE})`, 'g'))) {
    const dp = Math.max(0, ...(m[0].match(/\d+\.(\d+)/g) || []).map((x) => x.split('.')[1].length));
    if (Math.abs(evalSide(m[1]) - evalSide(m[2])) > 0.5 * 10 ** -dp + 1e-9) return false;
  }
  return true;
}

// ── V23: a source line ─────────────────────────────────────────────────────
// cite: 'Baveno VIII 1.15, 1.16'. The decks cite Baveno VIII (never VII), EASL 2025 or AASLD 2024.
export const citeText = (c) => (typeof c === 'string' ? c.trim() : '');
export const citeOk = (c) => !!citeText(c) && !/\bBaveno\s+VII(?!I)\b/i.test(c);

// ── V15: the summary table's cells ──────────────────────────────────────────
// cells: 'values' prints each number with its small arrow; 'change' prints "18 → 10" against the row's vs (or the first row).
export const cellsMode = (s) => (s?.cells === 'values' || s?.cells === 'change' ? s.cells : null);
// bars: true (with cells) puts a faint flat bar behind each number, its length the number's share of its column's largest.
export const barsOn = (s) => !!s?.bars && !!cellsMode(s);
/** Each value's share of the largest in its column (by size, so a reversed flow counts too); 0 when the column is all zero. */
export function barShares(vals) {
  const hi = Math.max(0, ...vals.filter((v) => Number.isFinite(v)).map(Math.abs));
  return vals.map((v) => (Number.isFinite(v) && hi > 0 ? Math.min(1, Math.abs(v) / hi) : 0));
}
/** focusRow: '<slide id>' lights that row; the rest recede. */
export const focusOf = (s) => (typeof s?.focusRow === 'string' && s.focusRow ? s.focusRow : null);

// ── V24: the ladder's earlier state ─────────────────────────────────────────
// ladderFrom: true (the slide before) or '<slide id>'. Returns { prev: true } or { id }, or null when the slide does not ask.
export const ladderFromOf = (s) => (s?.ladderFrom === true ? { prev: true } : typeof s?.ladderFrom === 'string' && s.ladderFrom ? { id: s.ladderFrom } : null);
