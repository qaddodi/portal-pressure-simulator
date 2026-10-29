// The presenter's camera path between two framings. A short move (the two views overlap) zooms evenly on a log scale with
// the pan tied to the zoom, as it always has. A long one, from one close-up to another far across the figure (Varices at 3.2×
// to the rectum), pulls back to a view that holds both and comes in to the target, so the figure never streams past at full
// zoom: the "smooth and efficient" path of van Wijk and Nuij (2003). It never pulls back past the whole figure's fit.
//
// A view (vt) maps a world point p to p·k + (x, y) in viewBox units. Its geometry here: the world point at the middle of the
// viewBox (cx, cy) and the world width it shows (w). `vb` names the viewBox units the stage really shows: { w, h, cx, cy }.

/** The even glide: zoom on a log scale, the pan in step with the zoom (a pure pan follows u itself). */
export function lerpVT(from, to, u) {
  const k = from.k * Math.pow(to.k / from.k, u), a = to.k === from.k ? u : (k - from.k) / (to.k - from.k);
  return { k, x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a };
}

export const viewGeom = (v, vb) => ({ cx: (vb.cx - v.x) / v.k, cy: (vb.cy - v.y) / v.k, w: vb.w / v.k });
export const geomView = (g, vb) => { const k = vb.w / g.w; return { k, x: vb.cx - g.cx * k, y: vb.cy - g.cy * k }; };

/** Whether the parts of the world two views show overlap at all. */
export function viewsOverlap(a, b, vb) {
  const ga = viewGeom(a, vb), gb = viewGeom(b, vb), ha = ga.w * vb.h / vb.w, hb = gb.w * vb.h / vb.w;
  return Math.abs(ga.cx - gb.cx) < (ga.w + gb.w) / 2 && Math.abs(ga.cy - gb.cy) < (ha + hb) / 2;
}

// The van Wijk-Nuij path for widths w0, w1 a distance d apart (rho: how far it pulls back for the distance).
function vanWijk(w0, w1, d, rho) {
  const r2 = rho * rho, r4 = r2 * r2;
  const b = (wi, sign) => (w1 * w1 - w0 * w0 + sign * r4 * d * d) / (2 * wi * r2 * d);
  const r = (bi) => Math.log(-bi + Math.sqrt(bi * bi + 1));
  const r0 = r(b(w0, 1)), r1 = r(b(w1, -1));
  const S = (r1 - r0) / rho, c0 = Math.cosh(r0), s0 = Math.sinh(r0);
  // (The widest the view gets: where cosh(rho·s + r0) is least, inside the path, or else at an end.)
  const peak = r0 <= 0 && r1 >= 0 ? w0 * c0 : Math.max(w0, w1);
  return {
    S, peak,
    at: (s) => ({ u: (w0 / r2) * (c0 * Math.tanh(rho * s + r0) - s0), w: (w0 * c0) / Math.cosh(rho * s + r0) }),
  };
}

export const ARC_RHO = Math.SQRT2;
/** How much longer a long move may take than the glide asked for (it travels further). */
export const ARC_STRETCH = 1.3;

/**
 * The path from one view to another: { arc, stretch, at(u) } with u the eased progress (0 to 1). A plain glide when the views
 * overlap; else the arc, pulled back no wider than `wMax` (world width: the fit's, or the wider end's if that is wider).
 */
export function camPath(from, to, vb, wMax = Infinity) {
  const plain = { arc: false, stretch: 1, at: (u) => (u >= 1 ? { ...to } : lerpVT(from, to, u)) };
  if (viewsOverlap(from, to, vb)) return plain;
  const g0 = viewGeom(from, vb), g1 = viewGeom(to, vb);
  const dx = g1.cx - g0.cx, dy = g1.cy - g0.cy, d = Math.hypot(dx, dy);
  if (!(d > 1e-9)) return plain;
  const cap = Math.max(wMax, g0.w, g1.w);
  // (The furthest pull-back the cap allows: rho is lowered until the widest view fits under it. A smaller rho pulls back less.)
  let p = vanWijk(g0.w, g1.w, d, ARC_RHO);
  if (p.peak > cap * 1.0001) {
    let lo = 0.05, hi = ARC_RHO;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (vanWijk(g0.w, g1.w, d, m).peak > cap) hi = m; else lo = m; }
    p = vanWijk(g0.w, g1.w, d, lo);
  }
  if (!Number.isFinite(p.S) || p.S <= 0) return plain;
  const stretch = Math.min(ARC_STRETCH, Math.max(1, 0.85 + p.S * 0.15));
  return {
    arc: true, stretch, peak: p.peak,
    at: (u) => {
      if (u >= 1) return { ...to };
      if (u <= 0) return { ...from };
      const q = p.at(u * p.S), f = q.u / d;
      return geomView({ cx: g0.cx + dx * f, cy: g0.cy + dy * f, w: q.w }, vb);
    },
  };
}

/**
 * A refit while a path runs (the cards settled, the screen turned): the new path takes over gradually from progress uR, so the
 * view never jumps and the move keeps its pace. Blended on the geometry: the centre in a line, the width on a log scale.
 */
export function blendPaths(older, newer, uR, vb) {
  return (u) => {
    if (u >= 1) return newer(1);
    const t = Math.min(1, Math.max(0, (u - uR) / Math.max(1e-6, 1 - uR))), a = t * t * (3 - 2 * t);
    if (a <= 0) return older(u);
    const g0 = viewGeom(older(u), vb), g1 = viewGeom(newer(u), vb);
    return geomView({ cx: g0.cx + (g1.cx - g0.cx) * a, cy: g0.cy + (g1.cy - g0.cy) * a, w: g0.w * Math.pow(g1.w / g0.w, a) }, vb);
  };
}
