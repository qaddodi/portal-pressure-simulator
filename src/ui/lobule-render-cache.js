// Keep the vessel bitmap until a caliber change is visible at the current zoom.
// Compare with the last uploaded radii, so small changes still accumulate.
export function radiiChanged(previous, next, tolerance) {
  return !previous || previous.length !== next.length || next.some((r, i) => Math.abs(r - previous[i]) >= tolerance);
}
