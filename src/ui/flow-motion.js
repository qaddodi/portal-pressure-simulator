// Continuous vessel motion. Keep phase independent of velocity and lens changes:
// changing spacing or re-chaining phases every beat makes the whole stream jump.
export const FLOW_STYLES = {
  streaks: ['Soft streaks', 'A gentle trail makes direction easy to follow.'],
  dashes: ['Short dashes', 'Clean, rounded marks with very little visual texture.'],
  dots: ['Small dots', 'Quiet tracers; follow their movement to see direction.'],
};
export const flowStyleNumber = (style) => style === 'dots' ? 3 : style === 'dashes' ? 2 : 1;

export function advanceFlow(x, velocity, dt, speed = 1) {
  if (x.flowVelocity == null) x.flowVelocity = velocity;
  // A three-second low-pass suppresses pulse/respiratory modulation of the display.
  // The model and its measurements retain their original time resolution.
  x.flowVelocity += (velocity - x.flowVelocity) * -Math.expm1(-dt / 3);
  const v = Math.abs(x.flowVelocity) < 0.03 ? 0 : x.flowVelocity;
  const drift = Math.sign(v) * 15 * Math.log1p(Math.abs(v) / 1.5);
  if (x.flowPhase == null) x.flowPhase = ((x.row || 0) * 0.61803398875) % 1;
  x.flowPhase = (x.flowPhase + drift * speed * dt / (x.sp || 36)) % 1;
  x.flowDirection = v === 0 ? 0 : Math.sign(v);
}
