// The anatomy's slow eases toward the patient: the liver's shape, congestion and tint (an exponential, 0.4 s) and the ascites
// (a critically damped spring on the drawn scale, volume^0.6). Shared by the drawn figure and by the figure hidden under the
// lobule or the sinusoid, which keeps easing on the same clock without drawing (stage.js, followHidden), so zooming out shows
// the state reached by then, not an ease that starts from the patient before.

export const LIVER_TAU = 0.4;   // s
/** One step of the liver's ease: `v` toward `target` over `dt` seconds, landing exactly once within 0.004. */
export function easeTo(v, target, dt, tau = LIVER_TAU) {
  const n = v + (target - v) * -Math.expm1(-dt / tau);
  return Math.abs(target - n) < 0.004 ? target : n;
}

/** One step of the ascites spring (at most 50 ms): { shown, vel }, with shown landing exactly on `target` once at rest. */
export function fluidSpring(shown, vel, target, dt) {
  const w = 4.2, h = Math.min(dt, 0.05), vs = Math.pow(shown, 0.6), vt = Math.pow(target, 0.6);
  vel += (-w * w * (vs - vt) - 2 * w * vel) * h;
  const nv = Math.max(0, vs + vel * h);
  if (Math.abs(nv - vt) < 0.2 && Math.abs(vel) < 0.5) return { shown: target, vel: 0 };
  return { shown: Math.pow(nv, 1 / 0.6), vel };
}
/** The spring run over `dt` seconds in 50 ms steps (a hidden figure catching up on time it was not drawn), stopping once at rest. */
export function fluidSpringFor(shown, vel, target, dt) {
  let r = { shown, vel };
  for (let left = dt; left > 1e-6 && r.shown !== target; left -= 0.05) r = fluidSpring(r.shown, r.vel, target, Math.min(left, 0.05));
  return r;
}
