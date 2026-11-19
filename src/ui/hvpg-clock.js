// The HVPG catheter's one clock (pure, no DOM). The balloon, the pressure tracing and the WHVP reading all follow
// the same value: how far the balloon is inflated (0 down … 1 wedged). The pressure starts to climb the moment the
// balloon starts to fill, rides it up, and holds its plateau once the vein is wedged; deflating runs it back the same way.

import { easeIn, easeMove } from './motion.js';

// ── The procedure timing table ──
// One rhythm for every procedure (motion recommendations, item 8): a catheter or scope travels at one speed, so a longer route takes longer
// and moves at the same pace; every balloon fills over BALLOON_IN_MS and lets down over BALLOON_OUT_MS, on one curve (easeMove).
// proc-anim.js builds each procedure's step table from these; the HVPG's is below.
/** How fast a catheter or scope travels (figure units a second). The old legs ran between 68 (HVPG) and 117 (BATO) a second; 80 keeps BRTO's
 *  6.2 s exactly and puts the others within a second of what they were, but for BATO's long route (proc-anim.js lists old and new). */
export const TRAVEL_SPEED = 80;
/** The time a travel leg takes over a route of this length (figure units), to the nearest 100 ms. */
export const legMs = (len) => Math.max(1000, Math.round((len / TRAVEL_SPEED) * 10) * 100);
/** A balloon fills over this long, and lets down over this long (ms): BRTO's and BATO's, which Mohammad has watched, so theirs do not move. Before: filling 1200 (TIPS),
 *  1600 (BRTO, BATO), 1800 (HVPG); letting down 800 (TIPS), 1200 (BRTO, BATO). The tamponade tube's balloons are held to the engine's seal time (balloon-eso.js BALLOON_MS) and keep theirs. */
export const BALLOON_IN_MS = 1600, BALLOON_OUT_MS = 1200;
/**
 * How far each tip travels, in figure units: from where it sits before it moves to where the leg ends, along the real routes (the vessels'
 * own courses: proc-routes.js rawRoute, read by tests/proc-timing.test.js, which keeps these within 3% of the figure's outlines).
 * hvpg: the HVPG catheter's (stage-cath.js cathRoute); tips: the TIPS catheter to where the tract leaves the hepatic vein, tipsOver: on over
 * the wire into the right portal vein, tipsCoil: from there on to where the TIPS that coils pushes its coil out in the coronary vein; brto, bato: to the balloon's place; eus, eusglue: the scope to its station.
 */
export const ROUTE_LEN = { hvpg: 274, tips: 246, tipsOver: 209, tipsCoil: 170, brto: 494, brtoC6: 555, bato: 728, eus: 414, eusglue: 499, ivc: 154, perc: 346 };
/**
 * A travel leg's progress at t (0..1 of its time): the speed ramps up over the first r of the time, holds steady, then ramps down over the
 * last r, on cosine ramps so speed and acceleration both stay continuous. At r = 0.2 the peak speed is 1.25 times the mean (the cubic
 * in-out it replaces peaked at three) and the first fifth of the time covers 12.5% of the route. For travel only: balloons, needles and
 * columns ease and hold (easeMove).
 */
const cruiseRamp = (u, r, v) => v * (u / 2 - (r / (2 * Math.PI)) * Math.sin((Math.PI * u) / r));   // (a plain function: a closure made inside cruise would be made again every frame)
export const cruise = (t, r = 0.2) => {
  t = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const v = 1 / (1 - r);
  return t < r ? cruiseRamp(t, r, v) : t > 1 - r ? 1 - cruiseRamp(1 - t, r, v) : v * (r / 2 + (t - r));
};

/** How much of the catheter is left, k (0..1) of the way through its fade-out: the leave curve (a leave takes the step below its entrance). The GPU draws'
 *  alpha and the SVG fallback's group opacity both take this one value in the same frame (stage-cath.js cathFadeOut). */
export const cathFadeAlpha = (k) => 1 - easeIn(k);

// The HVPG procedure's sequence, in ms from the start, laid out from the table above.
// (settle: the wedged pressure has reached its plateau and the still column starts to fill; callout: the column
// is full and the trace has held on the plateau, so only now is WHVP read and shown, then the result follows; sum: both readings
// have travelled to the summary, and after a beat the HVPG fades in.)
const TRAVEL1 = 300 + legMs(ROUTE_LEN.hvpg), INFLATE = TRAVEL1 + 800 + 3100, WEDGE = INFLATE + BALLOON_IN_MS;
const SETTLE = WEDGE + 700, CALLOUT = SETTLE + 1700, RESULT = CALLOUT + 2200, SUM = RESULT + 750, BACK = SUM + 4750;
export const T = { travel0: 300, travel1: TRAVEL1, zoom: TRAVEL1, free: TRAVEL1 + 800, inflate: INFLATE, wedge: WEDGE, settle: SETTLE, callout: CALLOUT, result: RESULT, sum: SUM, back: BACK, end: BACK + 800 };

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** The one in-out curve (the needle, the column, the sweeps, the balloons: what eases and holds): easeMove, the quintic, not the cubic it was. */
export const ease = easeMove;
export const k01 = (t, a, b) => clamp01((t - a) / (b - a));

/** How far the balloon stands at time tt on the procedure's clock. */
export const balloonAt = (tt) => easeMove(k01(tt, T.inflate, T.wedge));
/** The time on the procedure's clock at which the balloon stands at b (the inverse of balloonAt). */
export function timeOfBalloon(b) {
  if (b <= 0) return T.inflate;
  if (b >= 1) return T.wedge;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (easeMove(mid) < b) lo = mid; else hi = mid; }
  return T.inflate + ((lo + hi) / 2) * (T.wedge - T.inflate);
}

// ── The catheter's pressure wave (Mohammad, 17 Nov 2026: the old trace was "a zigzag" that "doesn't reflect the real heart beat of the patient") ──
// What a pressure transducer on a catheter tip draws, in mmHg about the reading (the mean), from the patient's own heart rate and breath:
//  - the cardiac pulse of a free hepatic vein, the IVC or the right atrium (they are one column of blood): the a wave as the atrium contracts (the
//    tallest), the small c wave as the tricuspid valve bulges back, the x descent of ventricular systole, the rounder v wave as the atrium fills
//    against the closed valve, the y descent as it empties, then the slow diastolic rise to the next a wave. The systolic events keep their time
//    after the a wave (scaled with the square root of the beat's length, as systole is), so a faster heart shortens diastole, not the whole beat.
//  - the breath: a dip as the patient breathes in (the pressure in the chest falls) and a long flat end-expiration, one breath every 4 s, the model's.
//  - the heart quickens a little with each breath in (sinus arrhythmia) and no two beats are quite the same height: a real patient's beat-to-beat variation.
//  - damped (damp 0..1): the pulse a wedged catheter or a portal needle sees. The still column (or the sinusoids and the portal bed) filter the
//    sharp a/c/v complex into a small, smooth, slightly late ripple at the heart rate; the breath passes through whole. A WHVP trace is a smooth
//    line that rises and falls with the breath, with only a faint beat on it (Groszmann, Hepatology 2004; Bosch, J Hepatol 2009).
// The size is what the monitor shows at its usual scale, kept modest (Mohammad, 12 Nov 2026: a free baseline should not heave).
/** The free (undamped) cardiac pulse, peak to peak, and the breath's swing, peak to peak (mmHg). */
export const CARDIAC_PP = 0.9, BREATH_PP = 0.8;
/** How much of the cardiac pulse a wedged catheter loses (0..1): the wedged trace keeps its breath but little of its beat. */
export const WEDGE_DAMP = 0.8;
/** How much of the cardiac pulse a needle or catheter in the portal vein loses: portal pressure is nearly non-pulsatile; its breath stays. */
export const PORTAL_DAMP = 0.7;
/** The model's breath is a 4 s cycle (engine.js computeExt), and its right atrium contracts, the a wave, at cardiac phase 0.88 (physiology.js raWave). */
export const BREATH_S = 4, A_WAVE_PHASE = 0.88;
/** With no model beside it (a test, a card with no frame): a 70/min heart and the model's 4 s breath on the procedure's own clock. */
export const BEAT_MS = 60000 / 70, BREATH_MS = BREATH_S * 1000;
const TAU = 2 * Math.PI;
const wrapHalf = (x) => x - Math.round(x);   // (a phase difference, in cycles, to -0.5..0.5)
const frac = (x) => x - Math.floor(x);
// The a/c/x/v/y events: [time after the a wave's peak (s, at 70/min), width (s), height (relative)].
const EVENTS = [[0, 0.05, 1.0], [0.13, 0.032, 0.32], [0.255, 0.065, -0.55], [0.42, 0.075, 0.62], [0.6, 0.075, -0.5]];
const RR70 = 60 / 70, SQRTPI = Math.sqrt(Math.PI);
function venousRaw(tau, rr) {
  const s = Math.min(1.15, Math.max(0.6, Math.sqrt(rr / RR70)));
  let y = 0;
  for (let i = 0; i < EVENTS.length; i++) {
    const [at, wide, high] = EVENTS[i], c = at * s, w = wide * s;
    for (let k = -1; k <= 1; k++) { const d = (tau - c - k * rr) / w; y += high * Math.exp(-d * d); }
  }
  // (its mean over the beat, taken out exactly so the trace's mean is the reading)
  let m = 0;
  for (let i = 0; i < EVENTS.length; i++) m += EVENTS[i][2] * EVENTS[i][1] * s * SQRTPI;
  return y - m / rr;
}
// (scaled so the free pulse is CARDIAC_PP peak to peak at 70/min: measured once)
const VEN_PP = (() => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < 600; i++) { const y = venousRaw((i / 600) * RR70, RR70); lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; })();
// The breath: a dip on the breath in, centred where the model's breath sine is lowest (phase 0.75 of its 4 s), with a long flat end-expiration.
const BREATH_AT = 0.72, BREATH_W = 0.17;
const breathRaw = (psi) => { const d = wrapHalf(psi - BREATH_AT) / BREATH_W; return -Math.exp(-d * d); };
const BR = (() => { let lo = Infinity, hi = -Infinity, s = 0; for (let i = 0; i < 800; i++) { const y = breathRaw(i / 800); lo = Math.min(lo, y); hi = Math.max(hi, y); s += y; } return { mean: s / 800, pp: hi - lo }; })();
/** Sinus arrhythmia: the beat's phase leads by up to this much (cycles) through the breath, so the rate rises about 4/min with each breath in. */
export const RSA = 0.045;
/** Beat-to-beat height: each beat's own factor, 1 ± BEAT_VAR, from its number (the same beat is always the same height). */
export const BEAT_VAR = 0.07;
const beatH = (k) => { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return 1 + BEAT_VAR * (2 * (s - Math.floor(s)) - 1); };

/** The breath's part of the trace at breath phase psi (cycles; 0.72 the breath in): mmHg about the mean, BREATH_PP peak to peak. */
export const breathWave = (psi) => ((breathRaw(psi) - BR.mean) / BR.pp) * BREATH_PP;
/**
 * The cardiac part of the trace at beat phase phi (cycles from an a wave's peak; continuous, so phi's whole part counts the beats), at heart rate
 * hr (/min), damped by damp (0 the free venous pulse; to WEDGE_DAMP and beyond, a small smooth ripple): mmHg about the mean.
 */
export function cardiacWave(phi, hr, damp) {
  const rr = 60 / Math.min(200, Math.max(30, hr > 0 ? hr : 70)), f = frac(phi), k = Math.floor(phi);
  // (each beat its own height, eased into the next one's through diastole, never in the middle of a wave)
  const hk = f < 0.72 ? beatH(k) : beatH(k) + (beatH(k + 1) - beatH(k)) * easeMove((f - 0.72) / 0.28);
  const soft = Math.min(1, Math.max(0, damp / 0.5));
  const sharp = soft < 1 ? venousRaw(f * rr, rr) / VEN_PP : 0, smooth = 0.5 * Math.cos(TAU * (f - 0.1));
  return ((1 - soft) * sharp + soft * smooth) * CARDIAC_PP * Math.max(0, 1 - damp) * hk;
}
/** The whole wave at beat phase phi and breath phase psi (cycles), heart rate hr, damped by damp; breath 0 while the patient does not breathe. */
export const traceWave = (phi, psi, hr, damp, breath = 1) => cardiacWave(phi + RSA * Math.sin(TAU * (psi - BREATH_AT)) * breath, hr, damp) + breathWave(psi) * breath;
/** The wave on a procedure's own clock alone (tt ms; a 70/min heart, the 4 s breath): what a trace recorded with no model beside it draws. */
export const clockWave = (tt, damp) => traceWave(tt / BEAT_MS, tt / BREATH_MS, 70, damp, 1);
/** Where a recorded trace's beat and breath should be at procedure time tt (ms), from the model's clock w (syncWave), else the procedure's own.
 *  out: [beat phase (a wave at whole numbers), breath phase, heart rate, breath on]. Pure. */
export function wavePhaseAt(tt, w, out) {
  if (w && w.on) {
    const age = (w.t - tt) / 1000;
    out[0] = w.cyc - A_WAVE_PHASE - (age * w.hr) / 60; out[1] = (w.m - age) / BREATH_S; out[2] = w.hr; out[3] = w.breath;
  } else { out[0] = tt / BEAT_MS; out[1] = tt / BREATH_MS; out[2] = 70; out[3] = 1; }
  return out;
}
export { wrapHalf };

/**
 * The model's beat and breath for a recorded trace (trace-tape.js), so the trace, the EKG and the Doppler pulse together:
 *   t: the procedure's ms at the head; m: the model's seconds there; cyc: the model's cardiac phase there; hr: beats a minute; breath: 1 while
 *   the model breathes; on: the model has been read at least once.
 */
export const newWave = () => ({ on: false, t: 0, m: 0, cyc: 0, hr: 70, breath: 1, f: null, at: 0 });
/**
 * Read the model's frame f into w for a head at procedure time t (ms), wall time now (ms). The model's clock between frames is carried on at the
 * rate it runs (so a draw between two frames has the beat where it is, not where the last frame left it); while the model is paused it is held,
 * and the waves go on by the procedure's clock as they did. Returns w.
 */
export function syncWave(w, f, t, now) {
  if (!f || !Number.isFinite(f.t) || !Number.isFinite(f.phase)) return w;
  if (f !== w.f) { w.f = f; w.at = now; }
  const rate = f.running === false ? 0 : f.clock === 'disease' ? 1 : f.speed > 0 ? f.speed : 1;
  if (rate <= 0 && w.on) return w;
  const hr = f.metrics?.hr, el = rate > 0 ? Math.min(0.25, Math.max(0, now - w.at) / 1000) * rate : 0;
  w.hr = hr > 20 ? hr : 70;
  w.m = f.t + el; w.cyc = f.phase + (el * w.hr) / 60; w.t = t;
  w.breath = f.resp === false ? 0 : 1;
  w.on = true;
  return w;
}

/** The HVPG catheter's mean level at tt: the free level, then, as the balloon fills, climbing in step with it to the wedged level. */
export const levelAt = (tt, v) => v.fhvp + (v.whvp - v.fhvp) * balloonAt(tt);
/** How much of its cardiac pulse the HVPG catheter's trace has lost at tt: none while free, WEDGE_DAMP once the balloon is up. */
export const dampAt = (tt) => WEDGE_DAMP * balloonAt(tt);
/** The catheter pressure at time tt on the procedure's own clock (no model): the level with its beat and breath. A recorded trace
 *  (trace-tape.js) draws the same wave on the patient's own heart rate and breath; this is that trace with no model beside it. */
export function pressureAt(tt, v) {
  return levelAt(tt, v) + clockWave(tt, dampAt(tt));
}
