// The HVPG catheter's balloon fitted inside the vein (pure, no DOM). The balloon is an ellipse on the catheter's
// course; the vein around it can narrow or bend along the balloon's length, so its half height is held to what fits
// between the walls at every point it covers, a little shy of the lumen's edge so the latex never crosses a wall.

/** How far inside the lumen's radius the balloon stops (the drawn caliber pulses a little with the pressure). */
export const BALLOON_MARGIN = 0.94;

/**
 * The balloon's half height: ryWant, or less where the vein would not hold it.
 * at(d): the route at length d, { p: the catheter's point, t: its unit direction, w: the vein's own centre there, r: the lumen's radius }.
 * dC: the balloon centre's length along the route; rx: its half length; floor: never thinner than this (the shaft it sits on).
 */
export function balloonRy(at, dC, rx, ryWant, { margin = BALLOON_MARGIN, floor = 0, n = 24 } = {}) {
  const c = at(dC), tx = c.t[0], ty = c.t[1], nx = -ty, ny = tx;
  let lim = Infinity;
  for (let i = 0; i <= n; i++) {
    const q = at(dC - rx + (2 * rx * i) / n), w = q.w || q.p;
    const dx = w[0] - c.p[0], dy = w[1] - c.p[1], a = dx * tx + dy * ty, o = Math.abs(dx * nx + dy * ny);
    const s = 1 - (a / rx) * (a / rx);
    if (s <= 0.0025) continue;
    lim = Math.min(lim, (q.r * margin - o) / Math.sqrt(s));
  }
  return Math.max(floor, Math.min(ryWant, lim));
}
