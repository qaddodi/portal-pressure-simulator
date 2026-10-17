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

/**
 * The route's lumen radii read again from the vessels' caliber now (it eases with the pressure), so the balloon
 * follows the walls as the vein widens and narrows. src: each source point's [vessel id, fraction along it];
 * map: for each route sample, j and u in turn (it lies between source points j - 1 and j, u of the way);
 * radOf(id, f): that vessel's lumen radius there now. Writes into out (one radius per route sample) and returns it.
 */
export function routeRadii(src, map, radOf, out = []) {
  const rs = src.map(([id, f]) => radOf(id, f));
  for (let i = 0, k = 0; k < map.length; i++, k += 2) {
    const j = map[k], u = map[k + 1];
    out[i] = rs[j - 1] + (rs[j] - rs[j - 1]) * u;
  }
  return out;
}

/**
 * The balloon's outline as it inflates: samples along it, each { c: the centre point, t: the unit direction it runs,
 * h: its half width there, s: where along it (-1 at the back, 1 at the front) }. Deflated (bl 0) it is the ellipse
 * ry0 tall on the catheter's course; inflated (bl 1) it is wedged: it lies on the vein's own centreline, follows the
 * vein's direction and fills the lumen to the wall at every point it covers (half width the lumen's radius there),
 * with rounded ends. at, dC, rx as balloonRy; floor: never thinner than this (the shaft it sits on).
 */
export function balloonOutline(at, dC, rx, ry0, bl, { floor = 0, n = 40 } = {}) {
  const out = [], p = 2 + 2 * bl, e = Math.max(1.2, rx * 0.1);
  for (let i = 0; i <= n; i++) {
    // Denser toward the ends, where the outline turns.
    const s = -Math.cos((Math.PI * i) / n), d = dC + rx * s, q = at(d);
    const w = q.w || q.p, a = at(d - e), b = at(d + e), wa = a.w || a.p, wb = b.w || b.p;
    let vx = wb[0] - wa[0], vy = wb[1] - wa[1], l = Math.hypot(vx, vy);
    if (l < 1e-9) { vx = q.t[0]; vy = q.t[1]; l = 1; }
    let tx = q.t[0] + (vx / l - q.t[0]) * bl, ty = q.t[1] + (vy / l - q.t[1]) * bl;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const c = [q.p[0] + (w[0] - q.p[0]) * bl, q.p[1] + (w[1] - q.p[1]) * bl];
    // Never past the wall: what the lumen leaves on the far side of the centre's offset from the vein's own centre.
    const off = Math.hypot(c[0] - w[0], c[1] - w[1]);
    const prof = Math.abs(s) >= 1 ? 0 : (1 - Math.abs(s) ** p) ** (1 / p);
    const h = Math.max(Math.min(ry0 + (q.r - ry0) * bl, q.r - off), floor) * prof;
    out.push({ c, t: [tx, ty], h, s });
  }
  return out;
}
