// The origin and first-pass colours ease when they change (15 Nov 2026, Mohammad: "the shift in origin still doesn't transition nicely, it pops when things change").
// originFractionsInto works out where each vessel's blood comes from once a model frame, and a change of patient, a slide's setting or the switch between the two lenses
// moved every vessel to its new blend in one frame. The figure shows the fractions (and the blends each vessel ends in) eased toward those targets over ORIGIN_EASE_S, the
// way every other colour on the figure follows its model (nothing pops, Reduce Motion included: a fade is allowed, an instant swap is not).
export const ORIGIN_EASE_S = 0.35;
const SNAP = 5e-4;
/** Moves `shown` toward `target` (equal-length arrays) by the share k; true while it is still on its way. Snaps the last bit, so it stops. */
export function easeArray(shown, target, k) {
  let far = 0;
  for (let i = 0; i < shown.length; i++) { const d = target[i] - shown[i]; if (Math.abs(d) > far) far = Math.abs(d); }
  if (far <= SNAP) { if (far > 0) shown.set(target); return false; }
  for (let i = 0; i < shown.length; i++) shown[i] += (target[i] - shown[i]) * k;
  return true;
}
/**
 * One step of the figure's origin colours toward the targets: `shown` / `target` are { origins, down, pe } (Float32Arrays; the ends' blends and Péclet numbers).
 * A vessel's ramp (its Péclet number, the shader's profile into its `down` blend) stays on while its blend is still easing to its own, so the ramp
 * never switches off under a colour that is not yet there. True while anything is still moving.
 */
export function easeOrigins(shown, target, dt, n) {
  const k = 1 - Math.exp(-dt / ORIGIN_EASE_S);
  const a = easeArray(shown.origins, target.origins, k), b = easeArray(shown.down, target.down, k);
  let c = false;
  for (let e = 0; e < shown.pe.length; e++) {
    const t = target.pe[e];
    if (t !== 0) { shown.pe[e] = t; continue; }
    if (shown.pe[e] === 0) continue;
    let d = 0;
    for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(shown.down[e * n + i] - shown.origins[e * n + i]));
    if (d > SNAP) c = true; else shown.pe[e] = 0;
  }
  return a || b || c;
}
