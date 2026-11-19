// The live readings of an open panel or card (moved out of inspector.js, 17 Nov 2026, so the card's own details view and the patient chart
// share them): a number is worded once, by the place value it shows, and a frame that shows it again builds nothing.
import { fmt, fmtFlow, fp, ff, units } from './util.js';

// ── Live readings ─────────────────────────────────
// A reading on an open panel is written every frame, so its words are made once per number it shows: each keeps a cell
// {k, s, t, u, tv, ts} (the number last shown by its place value, the words made from it, every number's words so far, the unit those
// are in, and the words of a value that lay on a rounding tie) and a frame that shows the same number again, or one it has shown
// before, builds nothing. The key is the number as it shows, in units of its last place; a value within 1e-9 of a rounding tie
// has no key (TIE) and is worded from itself, as fmt does it, so the words are exactly what fmt prints, never one place off.
export const UNSET = {}, TIE = {};   // (UNSET: no number shown yet, unlike any number, NaN or missing value)
export const newCell = () => ({ k: UNSET, s: '', t: new Map(), u: '', tv: UNSET, ts: '' });   // alloc-rare: one per reading, made when its panel is built (a selection opens)
const madeText = (c, key, make, v, a, b) => { const s = make(key, v, a, b); if (c.t.size > 512) c.t.clear(); c.t.set(key, s); return s; };   // alloc-rare: each number a reading shows is built once, then reused
const tieText = (c, make, v, a, b) => {
  if (Object.is(c.tv, v)) return c.ts;
  c.tv = v;
  return (c.ts = make(TIE, v, a, b));   // alloc-rare: only a value that lies on a rounding tie, and only while it changes
};
export const cachedText = (c, key, make, v, a, b) => {
  if (key === TIE) return tieText(c, make, v, a, b);
  if (Object.is(c.k, key)) return c.s;
  c.k = key;
  return (c.s = c.t.get(key) ?? madeText(c, key, make, v, a, b));
};
const POW10 = [1, 10, 100];
const numMake = (k, v, d, suffix) => `${fmt(k === TIE ? v : Number.isFinite(k) ? k / POW10[d] : k, d)}${suffix}`;
/** The number to d places (0 to 2) and the suffix after it, as fmt prints it. */
export const numText = (c, v, d, suffix) => cachedText(c, keyed(v, POW10[d], false), numMake, v, d, suffix);
// (A reading in the person's units: the key is the number as that unit shows it, in units of its last place, so the words are what
// fp / ff / fmtFlow print. The scale of each unit is the factor and places of util's table; tests/inspector-live-text.test.js holds them to it.)
const PRESS_KEY = { mmHg: 10, cmH2O: 13.6, kPa: 13.33 };
const FLOW_KEY = { 'L/min': 10, 'mL/min': 1000 };
const pressMake = (k, v) => fp(v).join(' ');   // alloc-rare: built once per number shown
const flowMake = (k, v) => ff(v).join(' ');   // alloc-rare: built once per number shown
const lpmMake = (k, v) => `${fmtFlow(v)} L/min`;   // alloc-rare: built once per number shown
const TINY_FLOW = 0.5;   // (fmtFlow reads a small real flow as "< 0.1": its own key, which no whole number takes)
const keyed = (v, scale, tiny) => {
  if (!Number.isFinite(v)) return v;
  if (tiny) { const a = Math.abs(v); if (a > 0.0005 && a < 0.05) return v < 0 ? -TINY_FLOW : TINY_FLOW; }
  const x = Math.abs(v) * scale, f = Math.floor(x), r = x - f;
  if (Math.abs(r - 0.5) < 1e-9) return TIE;
  const key = r > 0.5 ? f + 1 : f;
  return v < 0 && key ? -key : key;
};
const unitKept = (c, name) => { if (c.u !== name) { c.u = name; c.k = UNSET; c.tv = UNSET; c.t.clear(); } };
/** A pressure as fp prints it, with its unit. */
export function pressText(c, v) { const u = units.pressure; unitKept(c, u); return cachedText(c, keyed(v, PRESS_KEY[u], false), pressMake, v); }
/** A flow in L/min as ff prints it, in the person's flow unit. */
export function flowText(c, v) { const u = units.flow; unitKept(c, u); return cachedText(c, keyed(v, FLOW_KEY[u], u === 'L/min'), flowMake, v); }
/** A flow in L/min with its unit, whatever the person's flow unit is. */
export const lpmText = (c, v) => cachedText(c, keyed(v, 10, true), lpmMake, v);
export const readings = { newCell, numText, pressText, flowText, lpmText };   // (for tests/inspector-live-text.test.js, which still reads it from inspector.js)
export const Pof = (f) => f.Pf || f.P, Qof = (f) => f.Qf || f.Q;   // (the smoothed pressures and flows, as the vessel card and the figure read them: the raw ones swing with each beat)
