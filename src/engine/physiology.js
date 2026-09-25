// Constitutive laws (blueprint §7.3). Pure functions, no state.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sig = (x) => 1 / (1 + Math.exp(-x));

/** Normalized lumen area vs transmural pressure (tube law). Collapses below ~0.5 mmHg. */
export function tubeArea(ptm, kd = 0.03) {
  const s = sig((ptm - 0.5) / 0.6);
  return Math.max(0.004, s * (1 + kd * Math.max(0, ptm)));
}

/** Resistance multiplier from both ends' transmural pressures, relative to reference. */
export function tubeResistanceFactor(ptmFrom, ptmTo, refFrom, refTo, kd) {
  const a1 = tubeArea(refFrom, kd) / tubeArea(ptmFrom, kd);
  const a2 = tubeArea(refTo, kd) / tubeArea(ptmTo, kd);
  return Math.min(2500, 0.5 * (a1 * a1 + a2 * a2));
}

/** Stressed volume vs transmural pressure: linear to the knee, then stiffening (log). */
export function volumeOf(ptm, C, Pk, Ps) {
  if (ptm <= Pk) return C * ptm;
  const e = Math.exp(4), lim = Pk + Ps * (e - 1);
  if (ptm <= lim) return C * Pk + C * Ps * Math.log(1 + (ptm - Pk) / Ps);
  return C * Pk + C * Ps * 4 + C * (ptm - lim) / e;
}
const XMAX = 4; // beyond Pk + Ps·(e^4 − 1) the wall is at its stiffest; continue linearly
export function ptmOf(V, C, Pk, Ps) {
  if (V <= C * Pk) return V / C;
  const x = (V - C * Pk) / (C * Ps);
  if (x <= XMAX) return Pk + Ps * (Math.exp(x) - 1);
  const e = Math.exp(XMAX);
  return Pk + Ps * (e - 1) + (x - XMAX) * Ps * e;
}
export function complianceAt(ptm, C, Pk, Ps) {
  if (ptm <= Pk) return C;
  return C / Math.min(Math.exp(XMAX), 1 + (ptm - Pk) / Ps);
}

/** Poiseuille multiplier for a stenosis fraction s (0..1), with a turbulence term > 70 %. */
export function stenosisFactor(s) {
  if (s <= 0) return 1;
  if (s >= 0.995) return Infinity;
  const base = 1 / Math.pow(1 - s, 4);
  const turb = s > 0.7 ? 1 + 3 * (s - 0.7) / 0.3 : 1;
  return base * turb;
}

/** Frank–Starling venous-return pump: flow (mL/s) and its derivative vs RA transmural pressure. */
export const HEART = { Qmax: 200, s: 2.5, P50: 0 };
{
  // Solve P50 so that 83.33 mL/s flows at RA transmural 3.0 mmHg with Qmax 200.
  const f = 83.333 / HEART.Qmax;
  HEART.P50 = 3.0 + HEART.s * Math.log(1 / f - 1);
}
export function heartFlow(ptmRA, capacity) {
  const f = sig((ptmRA - HEART.P50) / HEART.s);
  const Q = capacity * HEART.Qmax * f;
  const dQ = capacity * HEART.Qmax * f * (1 - f) / HEART.s;
  return [Q, dQ];
}

/** Right-heart filling pattern over the cardiac cycle (phase 0..1), mean 1. */
const RAW_G = (ph) => (ph < 0.35 ? 0 : 1.0 * Math.exp(-(((ph - 0.47) / 0.08) ** 2)) + 0.25 + 0.7 * Math.exp(-(((ph - 0.9) / 0.04) ** 2)));
const RAW_H = (ph) => (ph >= 0.04 && ph <= 0.36 ? Math.sin(Math.PI * (ph - 0.04) / 0.32) : 0);
function meanOf(fn) { let s = 0; const n = 2000; for (let i = 0; i < n; i++) s += fn((i + 0.5) / n); return s / n; }
const G_MEAN = meanOf(RAW_G), H_MEAN = meanOf(RAW_H);
export const fillShape = (ph) => RAW_G(ph) / G_MEAN;
export const systoleShape = (ph) => RAW_H(ph) / H_MEAN;
/** RA external-pressure modulation (x descent, a wave). */
export const raWave = (ph) => -2.5 * Math.exp(-(((ph - 0.2) / 0.07) ** 2)) + 2.5 * Math.exp(-(((ph - 0.88) / 0.04) ** 2));

/** Intra-abdominal pressure from ascites volume (mL). */
export function iapFromAscites(V) {
  const L = Math.max(0, V) / 1000;
  return 5 + 1.2 * L + 0.8 * Math.pow(Math.max(0, L - 5), 1.5);
}

/** Seeded RNG (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = () => a;
  rng.setState = (s) => { a = s >>> 0; };
  return rng;
}
