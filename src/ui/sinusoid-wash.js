// The wedged column's wash (HVPG and PPG, slide 5, "In cirrhosis, the wedged pressure approximates the sinusoidal pressure"). The balloon holds a still column of
// blood from the hepatic vein back through the central vein into the sinusoids, so once the view has landed the wedge's amber spreads from the central vein out
// along the sinusoids. The slide's camera is the lobule (lobule-wash.js draws it there, on the Tube's recolour); a dive on into the sinusoid view carries the same wash
// along the one sinusoid, from its central end to its portal end, the flow's streaks stilling as it goes (this file's timing, sinusoid-gl.js's uWedge). Only a slide that
// says `wash` turns it on (the store's sinusoidWash, set by the presenter); every other use of either view draws as before.
// Pure: the view reads the clock, this turns the time since the view landed into how far the wash has come (0 to 1).

/** Ms after the view lands before the wash begins (the eye finds the vessel first), and how long it takes to run its length. */
export const WASH_DELAY_MS = 700, WASH_MS = 3400;

/** How far the wash has come, 0..1 (eased), `elapsed` ms after the view landed; reduced motion: the finished wash at once. */
export function washProgress(elapsed, reduced = false) {
  if (reduced) return 1;
  const k = Math.min(1, Math.max(0, (elapsed - WASH_DELAY_MS) / WASH_MS));
  return k * k * (3 - 2 * k);
}
