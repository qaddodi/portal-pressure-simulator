// The HVPG catheter's one clock (pure, no DOM). The balloon, the pressure tracing and the WHVP reading all follow
// the same value: how far the balloon is inflated (0 down … 1 wedged). The pressure starts to climb the moment the
// balloon starts to fill, rides it up, and holds its plateau once the vein is wedged; deflating runs it back the same way.

// The procedure's sequence, in ms from the start.
// (settle: the wedged pressure has reached its plateau and the still column starts to fill; callout: the column
// is full and the trace has held on the plateau, so only now is WHVP read and shown, then the result follows; sum: both readings
// have travelled to the summary, and after a beat the HVPG fades in.)
export const T = { travel0: 300, travel1: 4300, zoom: 4300, free: 5100, inflate: 8200, wedge: 10000, settle: 10700, callout: 12400, result: 14600, sum: 15350, back: 20100, end: 20900 };

const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const k01 = (t, a, b) => clamp01((t - a) / (b - a));

/** How far the balloon stands at time tt on the procedure's clock. */
export const balloonAt = (tt) => ease(k01(tt, T.inflate, T.wedge));
/** The time on the procedure's clock at which the balloon stands at b (the inverse of balloonAt). */
export function timeOfBalloon(b) {
  if (b <= 0) return T.inflate;
  if (b >= 1) return T.wedge;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (ease(mid) < b) lo = mid; else hi = mid; }
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
const BEAT_MS = 850, BREATH_MS = 3600;

/** The catheter pressure at time tt: the free level with the venous pulse (a, c, v waves) and the swing of breathing (the hepatic
 *  venous pressure falls with each breath in); as the balloon fills it climbs to the wedged level in step with it, the waves damped
 *  by the still column, which carries only a softened, delayed trace of the sinusoids' pulse. */
export function pressureAt(tt, v) {
  const wave = venousAt(tt / BEAT_MS) + Math.sin(tt / BREATH_MS * 2 * Math.PI) * 0.45;
  const b = balloonAt(tt);
  return v.fhvp + (v.whvp - v.fhvp) * b + wave * (1 - 0.85 * b);
}
