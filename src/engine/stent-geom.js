// A stent's geometry and its hydraulics: the one calculation the engine, the Doppler, the figure, the lumen cards and the curves read
// (16 Nov 2026, external review: "a short focal narrowing and a long narrow segment can have different hemodynamics despite having the
// same minimum diameter"; plan /mnt/project-files/tips-geometry/tips-geometry-plan.md). Pure: no DOM, no state, nothing made per call
// unless the caller brings no record to write into.
//
// A stent (the TIPS, the DIPS, a stent drawn with the stent tool) is a conduit of diameter d (mm) and hydraulic length len (cm). It may
// hold one waist: a narrowing s of the diameter (params.stenosis × params.thrombus, engine.js occlusion), so the waist's diameter is
// Dw = d·(1 − s), over a length `waist` (cm), reached through a transition of length `trans` (cm) at each end (0: an abrupt step).
// Where the waist sits is params.stenosisSite (proximal, mid, distal: 1/6, 1/2 and 5/6 of the stent), its centre slid inward so a long
// waist and its transitions stay inside the stent.
//
// The pressure across it, ΔP = R_lin·Q + B·Q|Q| (the engine solves it as a conductance with B lagged on |Q|), is made of five parts, each
// counted once and each with its reference velocity named:
//   tract    a fixed series term for the vein ends of the circuit (TIPS 0.12, DIPS 0.07, a drawn stent none), PRU × viscosity. It does not
//            follow the stent's length: it is what makes wide stents plateau, not the stent's lumen.
//   wall     distributed friction, C_WALL·visc·∫(10/D(x))⁴dx (D in mm, x in cm): the open stent, the waist and both cones, integrated in
//            closed form. C_WALL is 0.005 PRU per cm at 10 mm, about 4.7 times ideal Poiseuille for blood at 3.5 cP: an effective value,
//            calibrated to the stent's Doppler and gradient (the flow is still developing along the whole stent; its entrance length,
//            about 0.06·Re·D, is some 45 cm).
//   entry    the device's entrance and exit, K_ENTRY at the stent's own velocity Q/A: ½ρ·K·(Q/A)² (TIPS and DIPS; a drawn stent has none).
//   jet      the waist's exit: the jet slows into the wider stent (Borda–Carnot), k_exp(θ)·½ρ(v_w − v)², referenced to the difference of the
//            waist's and the stent's velocities. k_exp is 1 for an abrupt step and falls for a gentle cone (a diffuser's loss, after
//            Gibson's data). It depends on the area ratio and the cone's angle only, never on the waist's length, so a waist of no length
//            keeps it (the short-waist limit).
//   inlet    the waist's inlet (a contraction), K_C·(1 − a)·½ρv_w², referenced to the waist's velocity. K_C is 0 for now: provisional,
//            to be fitted to measured reductions (plan, decision D1).
// The waist's friction is the plain (1 − s)⁻⁴ of Poiseuille: no turbulence factor, which would count the jet's loss twice (the waist's
// Reynolds number is about 500 even at 80 %; plan, decision D2). The coefficients are model values, not validated predictions.
//
// Units: pressure mmHg; flow mL/s; resistance PRU (mmHg·s/mL); diameters mm; lengths cm; visc relative to blood at a hematocrit of 0.42.

import { clamp } from './physiology.js';

/** Distributed friction, PRU per cm of stent at 10 mm and viscosity 1. */
export const C_WALL = 0.005;
/** ½ρ·K_ENTRY in mmHg per (mL/s ÷ mm²)²: ½ · 1060 kg/m³ · 1.5 / 133.322 Pa per mmHg (a velocity of 1 mL/s per mm² is 1 m/s). */
export const KIN = 5.96;
export const K_ENTRY = 1.5;
/** The waist's inlet loss, × (1 − a) at the waist's velocity: 0 until reductions with measured pressures calibrate it (provisional). */
export const K_C = 0;
/** The waist a stent has when nothing sets one: this share of its length (1 cm of an 8 cm TIPS), as the model always had it. */
export const PINCH = 0.125;
/** Tapered ends, cm each side (the card's "Tapered"). */
export const TAPER_CM = 1;
/** Ranges (cm). The waist and both transitions always fit inside the stent (geomOf). */
export const GEOM_RANGE = { len: [4, 10], waist: [0, 6], trans: [0, 2] };
// The fixed series term (PRU) and whether the device has its own entrance and exit loss, by kind of stent.
const KIND = {
  tips: { tract: 0.12, entry: true, len: 8 },
  dips: { tract: 0.07, entry: true, len: 8 },   // (its shorter caudate tract is in `tract`; its wall keeps the 8 cm it always had: plan, decision D3)
  custom: { tract: 0, entry: false, len: 10 },  // (a drawn stent: 0.05·(10/d)⁴ as it always was, the same 0.005 per cm over 10 cm)
};
export const STENT_KINDS = Object.keys(KIND);
export const kindOf = (e) => (e && KIND[e.shunt] ? e.shunt : null);
export const tractOf = (kind) => KIND[kind]?.tract ?? 0;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A stent's geometry when none is set: its length, a waist of PINCH of it, abrupt ends. */
export const geomDefault = (kind, out = null) => {
  const len = KIND[kind]?.len ?? 8, o = out || {};   // alloc-rare: only a caller that brings no record (a test, a card's setter)
  o.len = len; o.waist = PINCH * len; o.trans = 0;
  return o;
};

/** A geometry made whole and consistent: each field clamped, the transitions then the waist shortened so they fit inside the stent. */
export function geomFix(g, kind, out = null) {
  const d = KIND[kind]?.len ?? 8, o = out || {};   // alloc-rare: only a caller that brings no record
  const len = clamp(num(g?.len, d), GEOM_RANGE.len[0], GEOM_RANGE.len[1]);
  const trans = clamp(num(g?.trans, 0), 0, Math.min(GEOM_RANGE.trans[1], len / 2));
  const waist = clamp(num(g?.waist, PINCH * len), 0, Math.min(GEOM_RANGE.waist[1], len - 2 * trans));
  o.len = len; o.waist = waist; o.trans = trans;
  return o;
}

/** Whether a geometry is the short focal narrowing every stent has by default: a waist of PINCH of its length with abrupt ends. Any other
 *  waist (a longer or shorter one, tapered ends) is a waist the stent is narrowed along on purpose, and that always sits mid stent
 *  (topology.js stentSite; Mohammad, 17 Nov 2026: "when we narrow the waist it really should only be mid TIPS"). A stenosis at the portal or
 *  hepatic vein end stays the short focal one. */
export const isFocal = (g) => !g || (!(g.trans > 0) && Math.abs(g.waist - PINCH * g.len) < 1e-9);

/** The geometry of stent `id` (an edge of kind `kind`) in params: params.stentGeom[id] over its defaults, made consistent. */
export const geomOf = (params, id, kind, out = null) => geomFix(params?.stentGeom?.[id], kind, out);

/** Mean of (d/D)⁴ over a linear cone from d to d·(1 − s): ((1 − s)⁻³ − 1)/(3s), 1 as s → 0. */
export const coneFactor = (s) => (s < 1e-6 ? 1 + 2.5 * s : (1 / Math.pow(1 - s, 3) - 1) / (3 * s));

/** The cone's total angle in degrees, from d to d·(1 − s) over trans cm (180 for an abrupt step). */
export const coneAngle = (d, s, trans) => (trans > 0 ? (2 * Math.atan((d * s) / (2 * trans * 10)) * 180) / Math.PI : 180);

/** The jet's loss as a share of the abrupt step's (Borda–Carnot): 1 for an abrupt step, 0.12 for a very gentle cone. Provisional. */
export const kExp = (theta) => {
  if (theta >= 45) return 1;
  const u = clamp((theta - 8) / 37, 0, 1);
  return 0.12 + 0.88 * u * u * (3 - 2 * u);
};

/**
 * The stent's resistance and its parts (PRU, so × Q gives mmHg) at flow q (mL/s, the step's lagged flow), viscosity visc, narrowing s:
 * { tract, wall, entry, jet, inlet, total, waistWall } written into `out` (waistWall: the share of `wall` added by the waist and its cones).
 * With the defaults (waist PINCH·len, no transitions) it is the model's stent as it always was, to the last bit (tests/stent-geom.test.js).
 */
export function stentParts(kind, d, q, visc, s, g, out = null) {
  const K = KIND[kind] || KIND.custom, o = out || {};   // alloc-rare: only a caller that brings no record (a test, a card); the engine brings one
  const A = Math.PI * d * d / 4, kq = KIN * Math.abs(q) / (A * A);
  const len = g ? g.len : K.len;
  // (Written as the model always wrote it: 0.04 or 0.05 over the stent's own default length, × (10/d)⁴ × visc; the same 0.005 per cm.)
  const wall = C_WALL * K.len * (len / K.len) * Math.pow(10 / d, 4) * visc;
  const entry = K.entry ? kq : 0;
  let waistWall = 0, jet = 0, inlet = 0;
  if (s > 0) {
    const a = (1 - s) * (1 - s), Lw = g ? g.waist : PINCH * len, Lt = g ? g.trans : 0;
    waistWall = wall * (Lw / len) * (1 / Math.pow(1 - s, 4) - 1);
    if (Lt > 0) waistWall += wall * ((2 * Lt) / len) * (coneFactor(s) - 1);
    const k = kExp(coneAngle(d, s, Lt));
    jet = k * (kq / K_ENTRY) * (1 / a - 1) * (1 / a - 1);
    // (A gentle cone loses less at the inlet as at the exit: the same angle factor, so Ends eases the loss with no step.)
    if (K_C > 0) inlet = k * K_C * (1 - a) * (kq / K_ENTRY) / (a * a);
  }
  o.tract = K.tract * visc; o.wall = wall + waistWall; o.waistWall = waistWall; o.entry = entry; o.jet = jet; o.inlet = inlet;
  o.total = K.tract * visc + wall + entry + (waistWall + jet + inlet);
  return o;
}

/** The waist along the stent, as fractions of its length from the portal end: the contraction starts at a0, the waist runs a1 to b1,
 *  the expansion ends at b0. `site` is the site's fraction (topology.js STENT_SITES), the centre slid inward so all of it fits. */
export function waistSpan(g, site, out = null) {
  const o = out || {};   // alloc-rare: only a caller that brings no record
  // (In fractions of the stent, so a waist left where its site puts it is centred on the site's own number: a Doppler gate there reads it.)
  const w = g.waist / 2 / g.len, half = w + g.trans / g.len;
  const c = clamp(site, half, 1 - half);
  o.c = c; o.a0 = c - half; o.a1 = c - w; o.b1 = c + w; o.b0 = c + half;
  return o;
}

const SPAN = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 };   // alloc-rare: made once (profileAt's span, read at once)
/** The lumen's diameter at fraction u of the stent, as a share of d (1 in the open stent, 1 − s in the waist, linear in the cones). */
export function profileAt(g, s, site, u) {
  if (!(s > 0)) return 1;
  const w = waistSpan(g, site, SPAN);
  if (u >= w.a1 && u <= w.b1) return 1 - s;
  if (u > w.a0 && u < w.a1) return 1 - s * (u - w.a0) / (w.a1 - w.a0);
  if (u > w.b1 && u < w.b0) return 1 - s * (w.b0 - u) / (w.b0 - w.b1);
  return 1;
}

/** The fixed pressure difference (mmHg) the tube-alone line holds across the stent: a bench, not a patient (stentState .bench, the fingerprint's tipsBench, the curve's dashed line). */
export const BENCH_DP = 7;
const BENCH = { tract: 0, wall: 0, waistWall: 0, entry: 0, jet: 0, inlet: 0, total: 0 };   // alloc-rare: made once (benchFlow's parts)
/** Flow (mL/s) through the stent alone at a fixed pressure difference dP (mmHg) across it: the tube on a bench, not in the patient.
 *  ΔP = R·Q + B·Q|Q| solved in its stable form, Q = 2ΔP / (R + √(R² + 4B|ΔP|)); its sign follows ΔP, and no gradient gives no flow. */
export function benchFlow(kind, d, visc, s, g, dP) {
  if (!(Math.abs(dP) > 0)) return 0;
  const R = stentParts(kind, d, 0, visc, s, g, BENCH).total;
  const B = stentParts(kind, d, 1, visc, s, g, BENCH).total - R;
  const m = Math.abs(dP);
  return Math.sign(dP) * (2 * m) / (R + Math.sqrt(R * R + 4 * B * m));
}

// ── The Doppler's usual peak velocity for a stent, by its diameter (17 Nov 2026) ──
// The 90 to 190 cm/s the scan reports for a working stent is for 8 to 10 mm stents (Mitchell et al., Abdom Radiol 2025, and the surveillance literature the TIPS
// Doppler talk teaches). A narrower stent runs faster at the same flow (velocity goes with 1 / diameter²: a patent 6 mm stent in a decompensated patient reads 205 to
// 228 cm/s, wrongly "High velocity" against 190), a wider one slower. Nothing published gives a range for any other diameter, so the band is scaled from the
// 8 to 10 mm one, and every number made this way is provisional:
//   8 to 10 mm   the reference band as it stands (the same array, so nothing that reads it moves).
//   over 10 mm   both edges × (10 / d)²: the stent's flow barely rises past 10 mm (1.2 to 1.8 L/min at 12 mm), so a wider lumen is a slower velocity.
//   under 8 mm   the ceiling × (8 / d)². The floor stays: a narrower stent carries less flow (the model's 6 mm stent carries about three quarters of an 8 mm one's),
//                so its velocity rises less than 1 / d², and a floor scaled that way would call a patent 6 mm stent in a compensated patient, or in schistosomiasis,
//                "slow" (the model's 6 mm stents read 113 to 126 and 146 to 171 cm/s there against a floor of 160).
// A narrowing is not the stent's diameter: the band follows the open stent's d (params.tips.d), and the waist's jet is what it is read against.
/** The reference diameters (mm) the reference band belongs to: inside them the band is the reference band. */
export const STENT_BAND_D = Object.freeze([8, 10]);
/** The narrowest stent the tool offers (mm, scenario.js): under it, while a stent opens or closes, the band is the one at this width. */
export const STENT_BAND_MIN_D = 6;
/**
 * A stent's usual peak velocity range [lo, hi] (cm/s) at its open diameter d (mm), from the reference band `ref` (its 8 to 10 mm range).
 * Inside 8 to 10 mm (and for no diameter) it is `ref` itself; otherwise the numbers are written into `out` (rounded to whole cm/s) and `out` is returned.
 * Pure and allocation-free given an `out`.
 */
export function stentBand(d, ref, out = null) {
  if (!(d > 0) || (d >= STENT_BAND_D[0] && d <= STENT_BAND_D[1])) return ref;
  if (d < STENT_BAND_MIN_D) d = STENT_BAND_MIN_D;   // (a stent opening or closing eases through every width, stent-ease.js: its band stops at the narrowest the tool offers)
  const o = out || [0, 0];   // alloc-rare: only a caller that brings no list (a test); the drawn paths pass one
  if (d > STENT_BAND_D[1]) { const k = (STENT_BAND_D[1] / d) ** 2; o[0] = Math.round(ref[0] * k); o[1] = Math.round(ref[1] * k); }
  else { o[0] = ref[0]; o[1] = Math.round(ref[1] * (STENT_BAND_D[0] / d) ** 2); }
  return o;
}
/** Whether the band at diameter d is the reference band (no scaling): true for 8 to 10 mm and for a stent not in. */
export const stentBandIsRef = (d) => !(d > 0) || (d >= STENT_BAND_D[0] && d <= STENT_BAND_D[1]);
/** The card's two setters, kept here so Where, Waist length and Ends always tell one story (17 Nov 2026): params with stent `id`'s waist field
 *  `f` ('waist' or 'trans') set to v, which moves the narrowing to Mid (a waist set along the stent is mid stent); and params with the
 *  narrowing moved to `site`, which at Proximal or Distal puts back the short focal waist. Both write into and return `p` (a copy the caller made). */
export function withWaist(p, id, kind, f, v) {
  p.stentGeom = { ...(p.stentGeom || {}), [id]: { ...geomOf(p, id, kind), [f]: v } };   // alloc-rare: a card's setter, run on its own input event, never in a frame
  p.stenosisSite = { ...(p.stenosisSite || {}), [id]: 'mid' };   // alloc-rare: the same setter
  return p;
}
export function withSite(p, id, kind, site) {
  p.stenosisSite = { ...(p.stenosisSite || {}), [id]: site };   // alloc-rare: a card's setter, run on its own tap, never in a frame
  if (site !== 'mid' && p.stentGeom?.[id]) { const g = geomOf(p, id, kind); p.stentGeom = { ...p.stentGeom, [id]: { len: g.len, waist: PINCH * g.len, trans: 0 } }; }   // alloc-rare: the same setter
  return p;
}
