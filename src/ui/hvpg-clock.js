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
 * the wire into the right portal vein; brto, bato: to the balloon's place; eus, eusglue: the scope to its station.
 */
export const ROUTE_LEN = { hvpg: 274, tips: 286, tipsOver: 190, brto: 494, bato: 728, eus: 414, eusglue: 499 };
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
/** The cubic in-out (the needle, the column, the sweeps: what eases and holds). Balloons use easeMove. */
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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

// The venous pulse the free catheter tip sees, as a fraction of its height over one beat (850 ms, about 70/min): the a wave as the
// right atrium contracts, the small c wave as the tricuspid valve closes, the x descent, the v wave as the atrium fills against
// the closed valve, the y descent as it empties. The shape of a hepatic vein's (or central venous) tracing, with its mean taken out
// so the number the monitor reads stays the level itself.
const around = (ph, at) => ((ph - at + 1.5) % 1) - 0.5;
const bump = (ph, at, wide, high) => high * Math.exp(-((around(ph, at) / wide) ** 2));
const venousRaw = (ph) => bump(ph, 0.0, 0.07, 0.72) + bump(ph, 0.17, 0.045, 0.22) + bump(ph, 0.31, 0.08, -0.5) + bump(ph, 0.56, 0.1, 0.58) + bump(ph, 0.78, 0.07, -0.42);
const VENOUS_MEAN = (() => { let s = 0; for (let i = 0; i < 400; i++) s += venousRaw(i / 400); return s / 400; })();
export const venousAt = (ph) => venousRaw(((ph % 1) + 1) % 1) - VENOUS_MEAN;
// (With no model beside it, a test or a card with no frame: the trace's own 850 ms beat and 3.6 s breath on the procedure's clock.)
const BEAT_MS = 850, BREATH_MS = 3600;
/** The model's breath is a 4 s sine (engine.js computeExt), and its right atrium contracts, the a wave, at cardiac phase 0.88 (physiology.js raWave). */
export const BREATH_S = 4, A_WAVE_PHASE = 0.88;
const BREATH_AMP = 0.45;

/**
 * The trace's waves on the model's own clock (item 9), so the trace, the EKG and the Doppler pulse together. The waves belong to model time,
 * not to the procedure's: a sample taken `age` seconds before the head (the trace's newest point, at procedure time t) is the model's beat and
 * breath `age` seconds before its own now, so Back, a rewind to the free level or a long frame never plays them backwards.
 *   t: the procedure's ms at the head; m: the model's seconds there; cyc: the model's cardiac phase there; hr: beats a minute; breath: 1 while
 *   the model breathes; on: the model has been read at least once (until then pressureAt keeps its own beat and breath).
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

/** The catheter pressure at time tt: the free level with the venous pulse (a, c, v waves) and the swing of breathing (the hepatic
 *  venous pressure falls with each breath in); as the balloon fills it climbs to the wedged level in step with it, the waves damped
 *  by the still column, which carries only a softened, delayed trace of the sinusoids' pulse. w: the model's clock (syncWave), else the
 *  waves run on the procedure's own. */
export function pressureAt(tt, v, w = null) {
  let wave;
  if (w && w.on) {
    const age = (w.t - tt) / 1000;
    wave = venousAt(w.cyc - A_WAVE_PHASE - (age * w.hr) / 60) + Math.sin(((w.m - age) / BREATH_S) * 2 * Math.PI) * BREATH_AMP * w.breath;
  } else wave = venousAt(tt / BEAT_MS) + Math.sin(tt / BREATH_MS * 2 * Math.PI) * BREATH_AMP;
  const b = balloonAt(tt);
  return v.fhvp + (v.whvp - v.fhvp) * b + wave * (1 - 0.85 * b);
}
