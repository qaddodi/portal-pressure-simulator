// A stent's geometry and its hydraulics: the one calculation the engine, the Doppler, the figure, the lumen cards and the curves read
// (16 Nov 2026, external review: "a short focal narrowing and a long narrow segment can have different hemodynamics despite having the
// same minimum diameter"; plan /mnt/project-files/tips-geometry/tips-geometry-plan.md). Pure: no DOM, no state, nothing made per call
// unless the caller brings no record to write into.
//
// A stent (the TIPS, the DIPS, a stent drawn with the stent tool) is a conduit of diameter d (mm) and hydraulic length len (cm). It may
// hold two narrowings, clinically different and set apart on its card (Mohammad, 17 Nov 2026: "Stenosis the distal or proximal end should be a
// different option than making a waist with some length"):
//   the end stenosis   dysfunction: params.stenosis × params.thrombus (engine.js occlusion), s, at the portal (proximal) or hepatic vein (distal)
//                      end (params.stenosisSite, distal if unset), always short and focal: PINCH of the stent's length, abrupt.
//   the waist          a reduction made on purpose, always mid stent: params.stentGeom[id].red, the share of the diameter it takes (the waist's
//                      diameter is d·(1 − red)), over a length `waist` (cm), reached through a transition of `trans` (cm) at each end (0: an abrupt step).
// Either, both or neither may be there. Each is counted on its own (its friction along it and the jet leaving it), and they add in series.
//
// The pressure across it, ΔP = R_lin·Q + B·Q|Q| (the engine solves it as a conductance with B lagged on |Q|), is made of five parts, each
// counted once and each with its reference velocity named:
//   tract    a fixed series term for the vein ends of the circuit (TIPS 0.18, DIPS 0.07, a drawn stent none), PRU × viscosity. It does not
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

import { clamp } from '../core/physiology.js';

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
/** The waist length's step (cm): the slider moves by it, and every number that prints a waist length shows it on that step, a glide's too (Mohammad, 17 Nov:
 *  "Waist cm in 0.5 increments on slider"; the figures' labels counted 3.1, 3.2, 3.3 through a glide from 3 to 3.5). */
export const WAIST_STEP = 0.5;
/** A waist length as it is printed: on the slider's step. */
export const waistShown = (cm) => Math.round(cm / WAIST_STEP) * WAIST_STEP;
/** A lumen's step (mm), the narrowings' too: their sliders move by it and every number that prints a lumen left shows it on that step, a glide's too
 *  (Mohammad, 17 Nov: "0.5 mm steps too / For lumen"; the waist lumen had read 6.3 and 4.4 mm). */
export const LUMEN_STEP = 0.5;
/** A lumen as it is printed (mm): on its step. */
export const lumenShown = (mm) => Math.round(mm / LUMEN_STEP) * LUMEN_STEP;
/** The share narrowed that leaves lumen `mm` in a stent of diameter `d` (0 when it leaves the stent open), kept to 6 places so the lumen reads back on its step. */
export const shareFor = (mm, d) => (mm >= d - 1e-6 ? 0 : +Math.max(0, 1 - mm / d).toFixed(6));
/** The waist a stent of length `len` has when nothing sets one: PINCH of its length on the waist's step (1 cm of an 8 cm TIPS or DIPS, 1.5 cm of a
 *  drawn 10 cm stent, never the 1.25 cm that was off the slider's grid; coordinator, 17 Nov), at least one step. */
export const waistDefault = (len) => Math.max(WAIST_STEP, waistShown(PINCH * len));
/** Ranges (cm). The waist and both transitions always fit inside the stent (geomOf). */
export const GEOM_RANGE = { len: [4, 10], waist: [0, 6], trans: [0, 2], red: [0, 0.95] };
/** The waist the stent card offers: up to 80 % of the diameter (the model takes up to GEOM_RANGE.red, as a stenosis's 95 %). */
export const WAIST_MAX = 0.8;
// The fixed series term (PRU) and whether the device has its own entrance and exit loss, by kind of stent.
const KIND = {
  tips: { tract: 0.18, entry: true, len: 8 },   // (0.12 until 17 Nov 2026, when the TIPS stopped draining through the whole right hepatic vein's resistance (topology.js TIPS eto): its outlet stretch is here now, docs/tips-stent-model.md)
  dips: { tract: 0.07, entry: true, len: 8 },   // (its shorter caudate tract is in `tract`; its wall keeps the 8 cm it always had: plan, decision D3)
  custom: { tract: 0, entry: false, len: 10 },  // (a drawn stent: 0.05·(10/d)⁴ as it always was, the same 0.005 per cm over 10 cm)
};
export const STENT_KINDS = Object.keys(KIND);
export const kindOf = (e) => (e && KIND[e.shunt] ? e.shunt : null);
export const tractOf = (kind) => KIND[kind]?.tract ?? 0;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A stent's geometry when none is set: its length, no waist (red 0; were one set, waistDefault of the length long with abrupt ends). */
export const geomDefault = (kind, out = null) => {
  const len = KIND[kind]?.len ?? 8, o = out || {};   // alloc-rare: only a caller that brings no record (a test, a card's setter)
  o.len = len; o.waist = waistDefault(len); o.trans = 0; o.red = 0;
  return o;
};

/** A geometry made whole and consistent: each field clamped, the transitions then the waist shortened so they fit inside the stent. */
export function geomFix(g, kind, out = null) {
  const d = KIND[kind]?.len ?? 8, o = out || {};   // alloc-rare: only a caller that brings no record
  const len = clamp(num(g?.len, d), GEOM_RANGE.len[0], GEOM_RANGE.len[1]);
  const trans = clamp(num(g?.trans, 0), 0, Math.min(GEOM_RANGE.trans[1], len / 2));
  const waist = clamp(num(g?.waist, waistDefault(len)), 0, Math.min(GEOM_RANGE.waist[1], len - 2 * trans));
  o.len = len; o.waist = waist; o.trans = trans; o.red = clamp(num(g?.red, 0), GEOM_RANGE.red[0], GEOM_RANGE.red[1]);
  return o;
}

/** The geometry of stent `id` (an edge of kind `kind`) in params: params.stentGeom[id] over its defaults, made consistent (its waist: red, waist, trans). */
export const geomOf = (params, id, kind, out = null) => geomFix(params?.stentGeom?.[id], kind, out);

/** The end stenosis of stent `id` in params: its stenosis with its clot, 1 − (1 − stenosis)(1 − thrombus), as engine.js occlusion reads it. */
export const endOf = (params, id) => 1 - (1 - (params?.stenosis?.[id] || 0)) * (1 - (params?.thrombus?.[id] || 0));
/** The end the stenosis sits at: 'proximal' (the portal end) or 'distal' (the hepatic vein end, where a TIPS usually narrows; the default). */
export const endSiteOf = (params, id) => (params?.stenosisSite?.[id] === 'proximal' ? 'proximal' : 'distal');

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

// One narrowing's share of the resistance: its friction along it (over Lw at 1 − s and its cones of Lt each side) and its exit jet and inlet,
// written into LES (read at once by stentParts).
const LES = { wall: 0, jet: 0, inlet: 0 };   // alloc-rare: made once
function lesion(wall, len, kq, d, s, Lw, Lt, b = 1, bIn = 1) {
  const a = (1 - s) * (1 - s);
  if (b < 1 || bIn < 1) {
    // (A stenosis inside the waist: its jet expands into the waist's lumen, area share b, so its loss is (1/a − 1/b)² and its inlet's (1 − a/b), b the waist's
    // lumen at its exit and its entry, and one no tighter than the waist there adds nothing. Its friction is counted once with the waist's: stentParts' overlap.)
    const w0 = wall * (Lw / len) * (1 / Math.pow(1 - s, 4) - 1);
    LES.wall = w0;
    const k = kExp(coneAngle(d, s, Lt));
    LES.jet = a < b ? k * (kq / K_ENTRY) * (1 / a - 1 / b) * (1 / a - 1 / b) : 0;
    LES.inlet = K_C > 0 && a < bIn ? k * K_C * (1 - a / bIn) * (kq / K_ENTRY) / (a * a) : 0;
    return LES;
  }
  let ww = wall * (Lw / len) * (1 / Math.pow(1 - s, 4) - 1);
  if (Lt > 0) ww += wall * ((2 * Lt) / len) * (coneFactor(s) - 1);
  const k = kExp(coneAngle(d, s, Lt));
  LES.wall = ww;
  LES.jet = k * (kq / K_ENTRY) * (1 / a - 1) * (1 / a - 1);
  // (A gentle cone loses less at the inlet as at the exit: the same angle factor, so Ends eases the loss with no step.)
  LES.inlet = K_C > 0 ? k * K_C * (1 - a) * (kq / K_ENTRY) / (a * a) : 0;
  return LES;
}

/**
 * The stent's resistance and its parts (PRU, so × Q gives mmHg) at flow q (mL/s, the step's lagged flow), viscosity visc, end stenosis s,
 * geometry g (its waist: g.red over g.waist with g.trans ends): { tract, wall, entry, jet, inlet, total, waistWall, jetEnd, jetWaist, wallEnd,
 * wallWaist } written into `out`. waistWall is the share of `wall` the two narrowings add, wallEnd and wallWaist each one's part of it; jetEnd
 * and jetWaist each one's jet and inlet (jet + inlet = jetEnd + jetWaist), where the pressure colour steps and a trace puts each loss.
 * With no waist (red 0) and an end stenosis it is the model's stent as it always was, to the last bit (tests/stent-geom.test.js).
 */
export function stentParts(kind, d, q, visc, s, g, out = null, site = END_U.distal) {
  const K = KIND[kind] || KIND.custom, o = out || {};   // alloc-rare: only a caller that brings no record (a test, a card); the engine brings one
  const A = Math.PI * d * d / 4, kq = KIN * Math.abs(q) / (A * A);
  const len = g ? g.len : K.len;
  // (Written as the model always wrote it: 0.04 or 0.05 over the stent's own default length, × (10/d)⁴ × visc; the same 0.005 per cm.)
  const wall = C_WALL * K.len * (len / K.len) * Math.pow(10 / d, 4) * visc;
  const entry = K.entry ? kq : 0;
  let waistWall = 0, jet = 0, inlet = 0, jetEnd = 0, jetWaist = 0, wallEnd = 0, wallWaist = 0;
  const red = g ? g.red || 0 : 0;
  // Where the two narrowings overlap (a long waist reaching the end stenosis), the lumen is the narrower of the two and is counted once: the friction
  // is the one combined profile's (profileAt) integrated once, and the stenosis's jet expands into the waist's lumen, not the open stent's.
  let lap = 0, b = 1, bIn = 1;
  if (s > 0 && red > 0) {
    const e = endSpan(g, site, SPAN_E), w = waistSpan(g, SPAN_W);
    if (e.a0 < w.b0 && w.a0 < e.b0) {
      lap = overlapFriction(e, s, w, red, Math.max(e.a0, w.a0), Math.min(e.b0, w.b0));
      // (The waist's lumen at the stenosis's ends, area shares: its jet expands into the lumen at its exit, its inlet contracts from the one at its
      // entry. The flow taken portal to hepatic, as a working stent's runs.)
      const ro = spanAt(w, red, e.b0), ri = spanAt(w, red, e.a0);
      b = ro * ro; bIn = ri * ri;
    }
  }
  if (s > 0) {
    // (The end stenosis: focal, PINCH of the length, abrupt.)
    const r = lesion(wall, len, kq, d, s, PINCH * len, 0, b, bIn);
    waistWall = r.wall; jet = r.jet; inlet = r.inlet; jetEnd = r.jet + r.inlet; wallEnd = r.wall;
  }
  if (red > 0) {
    const r = lesion(wall, len, kq, d, red, g.waist, g.trans);
    waistWall += r.wall; jet += r.jet; inlet += r.inlet; jetWaist = r.jet + r.inlet; wallWaist = r.wall;
  }
  if (lap > 0) {
    // (The overlap's friction was in both lesions; the smaller of the two is taken off, from the stenosis's share first, as it lies inside the waist.)
    const cut = wall * lap, fromEnd = Math.min(cut, wallEnd);
    wallEnd -= fromEnd; wallWaist -= cut - fromEnd; waistWall -= cut;
  }
  o.tract = K.tract * visc; o.wall = wall + waistWall; o.waistWall = waistWall; o.entry = entry; o.jet = jet; o.inlet = inlet;
  o.jetEnd = jetEnd; o.jetWaist = jetWaist; o.wallEnd = wallEnd; o.wallWaist = wallWaist;
  o.total = K.tract * visc + wall + entry + (waistWall + jet + inlet);
  return o;
}

/** The waist along the stent, as fractions of its length from the portal end: the contraction starts at a0, the waist runs a1 to b1, the
 *  expansion ends at b0. The waist is always mid stent (its centre c at 1/2; a waist and its cones never longer than the stent: geomFix). */
export function waistSpan(g, out = null) {
  const o = out && typeof out === 'object' ? out : {};   // alloc-rare: only a caller that brings no record (or one still passing the site the waist once took)
  const w = g.waist / 2 / g.len, half = w + g.trans / g.len;
  const c = clamp(0.5, half, 1 - half);
  o.c = c; o.a0 = c - half; o.a1 = c - w; o.b1 = c + w; o.b0 = c + half;
  return o;
}
/** The end stenosis along the stent, the same record as waistSpan: PINCH of the length, abrupt (a0 = a1, b1 = b0), centred on `site` (the
 *  site's fraction, topology.js STENT_SITES, or an eased one between them), slid inward so it stays inside the stent. */
export function endSpan(g, site, out = null) {
  const o = out || {};   // alloc-rare: only a caller that brings no record
  const w = PINCH / 2, c = clamp(site, w, 1 - w);
  o.c = c; o.a0 = c - w; o.a1 = c - w; o.b1 = c + w; o.b0 = c + w;
  return o;
}

const SPAN = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 };   // alloc-rare: made once (profileAt's span, read at once)
const spanAt = (w, s, u) => {
  if (u >= w.a1 && u <= w.b1) return 1 - s;
  if (u > w.a0 && u < w.a1) return 1 - s * (u - w.a0) / (w.a1 - w.a0);
  if (u > w.b1 && u < w.b0) return 1 - s * (w.b0 - u) / (w.b0 - w.b1);
  return 1;
};
const SPAN_E = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 }, SPAN_W = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 };   // alloc-rare: made once (stentParts' spans, read at once)
const f4 = (r) => 1 / (r * r * r * r) - 1;
/** The friction both lesions counted over [u0, u1], where they overlap, as a share of the open stent's wall friction per unit length: ∫ min(f(r1), f(r2)) du
 *  with f(r) = 1/r⁴ − 1 (Simpson, 48 steps; the profile is linear between its corners). Taking it off leaves ∫ f(min(r1, r2)), the combined profile. */
function overlapFriction(e, s, w, red, u0, u1) {
  if (!(u1 > u0)) return 0;
  const n = 48, hh = (u1 - u0) / n;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const u = u0 + i * hh, m = Math.min(f4(spanAt(e, s, u)), f4(spanAt(w, red, u)));
    acc += m * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return (acc * hh) / 3;
}
/** The end stenosis's fractions along the stent, as topology.js STENT_SITES places them (stentParts' default: distal). */
export const END_U = Object.freeze({ proximal: 1 / 6, distal: 5 / 6 });

/** The lumen's diameter at fraction u of the stent, as a share of d: 1 in the open stent, 1 − s in the end stenosis (at `site`, its fraction),
 *  1 − g.red in the waist (mid stent), linear in the waist's cones; where both reach, the narrower. */
export function profileAt(g, s, site, u) {
  let r = 1;
  if (s > 0) r = spanAt(endSpan(g, site, SPAN), s, u);
  const red = g ? g.red || 0 : 0;
  if (red > 0) { const x = spanAt(waistSpan(g, SPAN), red, u); if (x < r) r = x; }
  return r;
}

/** The fixed pressure difference (mmHg) the tube-alone line holds across the stent: a bench, not a patient (stentState .bench, the fingerprint's tipsBench, the curve's dashed line). */
export const BENCH_DP = 7;
const BENCH = { tract: 0, wall: 0, waistWall: 0, entry: 0, jet: 0, inlet: 0, total: 0 };   // alloc-rare: made once (benchFlow's parts)
/** Flow (mL/s) through the shunt alone at a fixed pressure difference dP (mmHg) from its portal end to its hepatic end: the bench, not the patient.
 *  It is the whole branch the engine solves (every part of stentParts: the tract, the wall, the ends and any narrowing), the same resistances the
 *  patient's shunt has, so the only difference between the two lines is the circulation's answer (external review, 17 Nov 2026: say what it includes).
 *  ΔP = R·Q + B·Q|Q| solved in its stable form, Q = 2ΔP / (R + √(R² + 4B|ΔP|)); its sign follows ΔP, and no gradient gives no flow. */
export function benchFlow(kind, d, visc, s, g, dP, site = END_U.distal) {
  if (!(Math.abs(dP) > 0)) return 0;
  const R = stentParts(kind, d, 0, visc, s, g, BENCH, site).total;
  const B = stentParts(kind, d, 1, visc, s, g, BENCH, site).total - R;
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
/** The card's setters (17 Nov 2026): the end stenosis and the waist are two controls, and neither moves the other. withWaist sets stent `id`'s
 *  waist field `f` ('red', 'waist' or 'trans') to v; withEnd moves the stenosis to `site` ('proximal' or 'distal'). Both write into and return
 *  `p` (a copy the caller made); the stent's other numbers are left as they are. */
export function withWaist(p, id, kind, f, v) {
  p.stentGeom = { ...(p.stentGeom || {}), [id]: { ...geomOf(p, id, kind), [f]: v } };   // alloc-rare: a card's setter, run on its own input event, never in a frame
  return p;
}
export function withEnd(p, id, site) {
  p.stenosisSite = { ...(p.stenosisSite || {}), [id]: site === 'proximal' ? 'proximal' : 'distal' };   // alloc-rare: a card's setter, run on its own tap, never in a frame
  return p;
}

// ── Whose jet a Doppler gate reads (17 Nov 2026, external review: "a deliberate reduction's jet should read as intended, not as stenosis") ──
// The waist (params.stentGeom[id].red) is a reduction made on purpose, always mid stent; the end stenosis (stenosis × thrombus, at stenosisSite proximal or distal) is
// dysfunction. A gate over the stent's range that sits on the reduction reads the reduction's jet; a stent can have both. engine.stentState names the same kinds
// (gateKind: tests/stent-band.test.js keeps the two equal); the readers that hold only numbers (the fingerprint's tipsStn, tipsRed, tipsStnSite) use these.
/** The kind of lesion at each Doppler gate [proximal, mid, distal]: 'stenosis', 'reduction' or null, from the end stenosis `end` (0 to 1) at `site` and the waist `red`. */
export function gateKindsOf(end, red, site, out = null) {
  const o = out || [null, null, null];   // alloc-rare: only a caller that brings no list (a test); the drawn paths pass one
  o[0] = end > 0.004 && site === 'proximal' ? 'stenosis' : null;
  o[1] = red > 0.004 ? 'reduction' : null;
  o[2] = end > 0.004 && site !== 'proximal' ? 'stenosis' : null;
  return o;
}
/** The kinds for stent `id` of `kind` in params (the same as gateKindsOf from its end stenosis, waist and site). */
export const gateKindsFromParams = (params, id, kind, out = null) => gateKindsOf(endOf(params, id), kind ? geomOf(params, id, kind, KIND_GEOM).red : 0, endSiteOf(params, id), out);
const KIND_GEOM = { len: 0, waist: 0, trans: 0, red: 0 };   // alloc-rare: made once (gateKindsFromParams reads its red at once)
/** Whether the gates over `hi` (cm/s) read only the deliberate reduction's jet: at least one gate is over, and every gate that is over sits on the reduction.
 *  A gate over its range anywhere else (an end stenosis, or fast flow with no lesion) is read as it always was. `peaks`: the three gate velocities. */
export function reductionJet(peaks, kinds, hi) {
  let over = false;
  for (let i = 0; i < 3; i++) if (peaks[i] > hi) { if (kinds[i] !== 'reduction') return false; over = true; }
  return over;
}
