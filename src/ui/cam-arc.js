// The presenter's camera path between two framings. A short move (the two views overlap) zooms evenly on a log scale with
// the pan tied to the zoom, as it always has. A long one, from one close-up to another far across the figure (Varices at 3.2×
// to the rectum), pulls back to a view that holds both and comes in to the target, so the figure never streams past at full
// zoom: the "smooth and efficient" path of van Wijk and Nuij (2003). It never pulls back past the whole figure's fit.
//
// A view (vt) maps a world point p to p·k + (x, y) in viewBox units. Its geometry here: the world point at the middle of the
// viewBox (cx, cy) and the world width it shows (w). `vb` names the viewBox units the stage really shows: { w, h, cx, cy }.

// The working code (lerpInto, geomInto, viewInto, CamPath, blendInto) allocates nothing while it runs: the working numbers live in kept
// objects (the module's scratch, or a path's own fields) and results are written into an object the caller passes (`out`). The names
// without the suffix (lerpVT, viewGeom, geomView, camPath, blendPaths) keep the old contract, a fresh result per call, for callers that
// keep what they get; they are thin wrappers over the same code.

// (Scratch for the functions that finish with it before returning: none of them calls another that uses the same one.)
const GA = { cx: 0, cy: 0, w: 0 }, GB = { cx: 0, cy: 0, w: 0 };

/** The even glide: zoom on a log scale, the pan in step with the zoom (a pure pan follows u itself), written into `out`. */
export function lerpInto(from, to, u, out) {
  const k = from.k * Math.pow(to.k / from.k, u), a = to.k === from.k ? u : (k - from.k) / (to.k - from.k);
  const x = from.x + (to.x - from.x) * a, y = from.y + (to.y - from.y) * a;
  out.k = k; out.x = x; out.y = y;
  return out;
}
/** The even glide as a fresh view. */
export function lerpVT(from, to, u) { return lerpInto(from, to, u, { k: 0, x: 0, y: 0 }); }

export function geomInto(v, vb, out) { out.cx = (vb.cx - v.x) / v.k; out.cy = (vb.cy - v.y) / v.k; out.w = vb.w / v.k; return out; }
export function viewInto(g, vb, out) { const k = vb.w / g.w, x = vb.cx - g.cx * k, y = vb.cy - g.cy * k; out.k = k; out.x = x; out.y = y; return out; }
export const viewGeom = (v, vb) => geomInto(v, vb, { cx: 0, cy: 0, w: 0 });
export const geomView = (g, vb) => viewInto(g, vb, { k: 0, x: 0, y: 0 });
const copyView = (v, out) => { out.k = v.k; out.x = v.x; out.y = v.y; return out; };

/** Whether the parts of the world two views show overlap at all. */
export function viewsOverlap(a, b, vb) {
  const ga = geomInto(a, vb, GA), gb = geomInto(b, vb, GB), ha = ga.w * vb.h / vb.w, hb = gb.w * vb.h / vb.w;
  return Math.abs(ga.cx - gb.cx) < (ga.w + gb.w) / 2 && Math.abs(ga.cy - gb.cy) < (ha + hb) / 2;
}

// The van Wijk-Nuij path for widths w0, w1 a distance d apart (rho: how far it pulls back for the distance), kept in this object's
// fields: S (its length in the path's own units), peak (the widest the view gets: where cosh(rho·s + r0) is least, inside the path, or
// else at an end), and what u(s) and w(s) need.
const vwB = (w0, w1, wi, sign, r4, r2, d) => (w1 * w1 - w0 * w0 + sign * r4 * d * d) / (2 * wi * r2 * d);
const vwR = (bi) => Math.log(-bi + Math.sqrt(bi * bi + 1));
class VanWijk {
  constructor() { this.S = 0; this.peak = 0; this.w0 = 0; this.rho = 0; this.r2 = 0; this.r0 = 0; this.c0 = 0; this.s0 = 0; }
  fill(w0, w1, d, rho) {
    const r2 = rho * rho, r4 = r2 * r2;
    const r0 = vwR(vwB(w0, w1, w0, 1, r4, r2, d)), r1 = vwR(vwB(w0, w1, w1, -1, r4, r2, d));
    const c0 = Math.cosh(r0);
    this.w0 = w0; this.rho = rho; this.r2 = r2; this.r0 = r0; this.c0 = c0; this.s0 = Math.sinh(r0);
    this.S = (r1 - r0) / rho;
    this.peak = r0 <= 0 && r1 >= 0 ? w0 * c0 : Math.max(w0, w1);
    return this;
  }
  /** How far along the line (in distance) the path has come at s. */
  uAt(s) { return (this.w0 / this.r2) * (this.c0 * Math.tanh(this.rho * s + this.r0) - this.s0); }
  /** The width the view shows at s. */
  wAt(s) { return (this.w0 * this.c0) / Math.cosh(this.rho * s + this.r0); }
}
const TRY = new VanWijk();   // (the trial paths of the pull-back search: only their peak is read)

export const ARC_RHO = Math.SQRT2;
/** How much longer a long move may take than the glide asked for (it travels further). */
export const ARC_STRETCH = 1.3;

/**
 * One path from one view to another, kept in the fields of this object and refilled by `fill` (a presenter's move builds one, and a
 * refit fills the next): `arc` (false: the plain glide), `stretch`, `peak`, and `at(u, out)` writing the view at eased progress u
 * (0 to 1) into `out`. A plain glide when the views overlap; else the arc, pulled back no wider than `wMax` (world width: the fit's, or
 * the wider end's if that is wider).
 */
export class CamPath {
  constructor() {
    this.arc = false; this.stretch = 1; this.peak = 0;
    this.from = null; this.to = null; this.vb = null;
    this.vw = new VanWijk();
    this.g0cx = 0; this.g0cy = 0; this.dx = 0; this.dy = 0; this.d = 0;
  }
  fill(from, to, vb, wMax = Infinity) {
    this.from = from; this.to = to; this.vb = vb; this.arc = false; this.stretch = 1;
    if (viewsOverlap(from, to, vb)) return this;
    const g0 = geomInto(from, vb, GA), g1 = geomInto(to, vb, GB);
    const dx = g1.cx - g0.cx, dy = g1.cy - g0.cy, d = Math.hypot(dx, dy);
    if (!(d > 1e-9)) return this;
    const cap = Math.max(wMax, g0.w, g1.w), p = this.vw.fill(g0.w, g1.w, d, ARC_RHO);
    // (The furthest pull-back the cap allows: rho is lowered until the widest view fits under it. A smaller rho pulls back less.)
    if (p.peak > cap * 1.0001) {
      let lo = 0.05, hi = ARC_RHO;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (TRY.fill(g0.w, g1.w, d, m).peak > cap) hi = m; else lo = m; }
      p.fill(g0.w, g1.w, d, lo);
    }
    if (!Number.isFinite(p.S) || p.S <= 0) return this;
    this.arc = true; this.stretch = Math.min(ARC_STRETCH, Math.max(1, 0.85 + p.S * 0.15)); this.peak = p.peak;
    this.g0cx = g0.cx; this.g0cy = g0.cy; this.dx = dx; this.dy = dy; this.d = d;
    return this;
  }
  at(u, out) {
    if (!this.arc) return u >= 1 ? copyView(this.to, out) : lerpInto(this.from, this.to, u, out);
    if (u >= 1) return copyView(this.to, out);
    if (u <= 0) return copyView(this.from, out);
    const p = this.vw, s = u * p.S, f = p.uAt(s) / this.d, k = this.vb.w / p.wAt(s);
    out.k = k; out.x = this.vb.cx - (this.g0cx + this.dx * f) * k; out.y = this.vb.cy - (this.g0cy + this.dy * f) * k;
    return out;
  }
}

/**
 * The path from one view to another: { arc, stretch, at(u) } with u the eased progress (0 to 1), each `at` a fresh view (a caller that
 * keeps what it gets). A move that builds a CamPath once and asks it `at(u, out)` allocates nothing per frame.
 */
export function camPath(from, to, vb, wMax = Infinity) {
  const path = new CamPath().fill(from, to, vb, wMax);
  return path.arc ? { arc: true, stretch: path.stretch, peak: path.peak, at: (u) => path.at(u, { k: 0, x: 0, y: 0 }) }
    : { arc: false, stretch: 1, at: (u) => path.at(u, { k: 0, x: 0, y: 0 }) };
}

/**
 * Where a refit puts the view at u (see blendPaths), written into `out`: older(u) and newer(u) are the two paths' views at u (each a view
 * object, read at once, so either may itself be a blend).
 */
export function blendInto(older, newer, uR, vb, u, out) {
  if (u >= 1) return copyView(newer(1), out);
  const t = Math.min(1, Math.max(0, (u - uR) / Math.max(1e-6, 1 - uR))), a = t * t * (3 - 2 * t);
  if (a <= 0) return copyView(older(u), out);
  const vo = older(u), ocx = (vb.cx - vo.x) / vo.k, ocy = (vb.cy - vo.y) / vo.k, ow = vb.w / vo.k;
  const vn = newer(u), ncx = (vb.cx - vn.x) / vn.k, ncy = (vb.cy - vn.y) / vn.k, nw = vb.w / vn.k;
  const cx = ocx + (ncx - ocx) * a, cy = ocy + (ncy - ocy) * a, k = vb.w / (ow * Math.pow(nw / ow, a));
  out.k = k; out.x = vb.cx - cx * k; out.y = vb.cy - cy * k;
  return out;
}

/**
 * A refit while a path runs (the cards settled, the screen turned): the new path takes over gradually from progress uR, so the
 * view never jumps and the move keeps its pace. Blended on the geometry: the centre in a line, the width on a log scale.
 */
export function blendPaths(older, newer, uR, vb) {
  return (u) => blendInto(older, newer, uR, vb, u, { k: 0, x: 0, y: 0 });
}

/** A slow push's progress (a time-lapse's drift, lapse.cam): it gathers speed over the first fifth, moves evenly, and settles over
 *  the last fifth, so a push of several seconds neither crawls at its ends nor rushes in its middle as an ease-in-out would. */
export function driftEase(u, ramp = 0.2) {
  u = Math.min(1, Math.max(0, u));
  const v = 1 / (1 - ramp);   // (the even speed: the ramps give up half their width each)
  if (u < ramp) return (v * u * u) / (2 * ramp);
  if (u > 1 - ramp) return 1 - (v * (1 - u) ** 2) / (2 * ramp);
  return v * (u - ramp / 2);
}
