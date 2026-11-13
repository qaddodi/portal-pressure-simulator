// T4 (13 Nov 2026): a glide follows the vessel. When two consecutive slides sit on the same vessel path (the portal vein, the splenic
// vein, the coronary vein to the varices), the camera travels along the path the blood takes instead of cutting across the organs.
// This file is the arithmetic: the named paths (chains of the circuit's vessels), their course as one polyline from the figure's own
// geometry, and the camera's path along one (alongPath). stage-glide.js asks for it on a presenter's move between neighbouring slides.
import { geomInto, viewInto } from './cam-arc.js';

/** The vessel paths a glide may follow, each a chain of vessels in the order the blood (or the catheter) runs. */
export const ROUTES = Object.freeze({
  portal: ['V_INT', 'SMV_CONF', 'PV_TRUNK', 'PVH_R'],
  splenic: ['V_SPL', 'SV_MID', 'SV_CONF', 'PV_TRUNK', 'PVH_R'],
  coronary: ['PVH_R', 'PV_TRUNK', 'LGV_CONF', 'C1a', 'C1b', 'AZY_SVC'],
  gastric: ['PV_TRUNK', 'SV_CONF', 'C2', 'C5', 'LRV_IVC'],
  umbilical: ['PV_TRUNK', 'PVH_L', 'C3', 'EPI_ILI'],
  tips: ['PV_TRUNK', 'PVH_R', 'TIPS', 'RHV_IVC', 'IVCS_RA'],
});

/** How near the middle of each framing the path must run (a share of the framing's width) for the glide to follow it. */
export const ALONG_NEAR = 0.4;
/** A path shorter than this (a share of the smaller framing's width) between the two framings is not worth following: the plain glide. */
export const ALONG_MIN = 0.25;
/** The most a path may lengthen the glide's time, and the longest a glide along a path takes (ms): a path is longer than a straight move. */
export const ALONG_STRETCH = 1.6, ALONG_MAX_MS = 1800;

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** One polyline through the chain's vessels, each turned to run on from the end of the one before. `ptsOf(id)` gives a vessel's
 *  course ([[x, y], ...] in the figure's units) or nothing; a chain with a vessel missing (a collateral the patient lacks) is null. */
export function routeLine(ids, ptsOf) {
  const parts = ids.map((id) => ptsOf(id));
  if (parts.some((p) => !p || p.length < 2)) return null;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i];
    if (i === 0) {
      // (The first runs toward the second: the end nearer the next vessel's ends is its end.)
      const q = parts[1];
      if (q && Math.min(d2(p[0], q[0]), d2(p[0], q[q.length - 1])) < Math.min(d2(p[p.length - 1], q[0]), d2(p[p.length - 1], q[q.length - 1]))) p = [...p].reverse();
    } else {
      const end = out[out.length - 1];
      if (d2(p[p.length - 1], end) < d2(p[0], end)) p = [...p].reverse();
    }
    for (const pt of p) out.push([pt[0], pt[1]]);
  }
  return out;
}

/** Where on the polyline `pts` the point c lies nearest: { s (distance along it), d (distance off it) }. */
export function project(pts, c) {
  let best = Infinity, bs = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 ? Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / L2)) : 0;
    const px = a[0] + dx * t, py = a[1] + dy * t, dd = (c[0] - px) ** 2 + (c[1] - py) ** 2;
    if (dd < best) { best = dd; bs = acc + L * t; }
    acc += L;
  }
  return { s: bs, d: Math.sqrt(best) };
}
/** The point at distance s along `pts`. */
export function pointAlong(pts, s, out = [0, 0]) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= s || i === pts.length - 1) { const t = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0; out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; return out; }
    acc += L;
  }
  out[0] = pts[0][0]; out[1] = pts[0][1];
  return out;
}

/**
 * The camera's path from view `from` to view `to` along one of `lines` (polylines in world units), or null when no path runs near the
 * middle of both framings, or the stretch between them is too short to follow. vb: the viewBox units the stage shows ({ w, h, cx, cy }).
 * → { at(u) → view, stretch (the path's length over the straight move's, ≥ 1) }. The centre runs along the path, carrying each framing's
 * own offset from it (the cards' room) across; the zoom eases on a log scale, as the plain glide's does.
 */
export function alongPath(from, to, lines, vb) {
  const g0 = geomInto(from, vb, { cx: 0, cy: 0, w: 0 }), g1 = geomInto(to, vb, { cx: 0, cy: 0, w: 0 });
  const c0 = [g0.cx, g0.cy], c1 = [g1.cx, g1.cy], wMin = Math.min(g0.w, g1.w), straight = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  let pick = null;
  for (const pts of lines) {
    if (!pts || pts.length < 2) continue;
    const a = project(pts, c0), b = project(pts, c1);
    if (a.d > ALONG_NEAR * g0.w || b.d > ALONG_NEAR * g1.w) continue;
    const far = Math.max(a.d / g0.w, b.d / g1.w);
    if (!pick || far < pick.far) pick = { pts, a, b, far };
  }
  if (!pick || Math.abs(pick.b.s - pick.a.s) < ALONG_MIN * wMin) return null;
  const { pts, a, b } = pick;
  const p0 = pointAlong(pts, a.s, [0, 0]), p1 = pointAlong(pts, b.s, [0, 0]);
  const o0 = [c0[0] - p0[0], c0[1] - p0[1]], o1 = [c1[0] - p1[0], c1[1] - p1[1]];
  const stretch = straight > 1e-6 ? Math.min(ALONG_STRETCH, Math.max(1, Math.abs(b.s - a.s) / straight)) : 1;
  const P = [0, 0], G = { cx: 0, cy: 0, w: 0 };
  return {
    stretch,
    at(u, out = { k: 0, x: 0, y: 0 }) {
      if (u >= 1) { out.k = to.k; out.x = to.x; out.y = to.y; return out; }
      pointAlong(pts, a.s + (b.s - a.s) * u, P);
      G.cx = P[0] + o0[0] + (o1[0] - o0[0]) * u; G.cy = P[1] + o0[1] + (o1[1] - o0[1]) * u;
      G.w = g0.w * Math.pow(g1.w / g0.w, u);
      return viewInto(G, vb, out);
    },
  };
}
