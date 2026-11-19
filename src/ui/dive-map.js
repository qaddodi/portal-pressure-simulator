// The zoom into a sinusoid (lobule-zoom.js, sinusoid-view.js) as one map taken a share g of the way: the lobule is grown by Z**g and turned by rot * g
// about its sinusoid's point p, and p itself goes straight to where the sinusoid view draws it (c). At g = 1 it is the whole similarity that takes p to c,
// turned by rot and grown by Z, so the picture the zoom lands on (and the one the zoom out sets off from) is what it has always been.
// (Until 15 Nov 2026 the same similarity was taken a share at a time about its fixed point q, which turns every point of the lobule round q as it grows:
// the sinusoid it was zooming into travelled a spiral, an arc of up to half a turn when the lobule had to be turned to lie along the screen. Mohammad,
// 15 Nov: "going around in circles while zooming in".)

/**
 * How far along the straight line from p to c the point has come at g (0..1, the zoom's eased progress): tied to the growth, (Z**g - 1) / (Z - 1), as every
 * glide of the stage ties its pan to its zoom (cam-arc.js lerpInto). With no turn this is exactly the zoom about one fixed point.
 */
export const diveAlong = (Z, g) => (Z === 1 ? g : (Z ** g - 1) / (Z - 1));

/** The map at g, written into `out`: p' = o + t + Z**g R(rot g) (p - o), with o = the sinusoid's point (the origin of the turn and growth) and t the straight step. */
export function diveMapInto(p, c, rot, Z, g, out) {
  const a = diveAlong(Z, g);
  out.rot = rot * g; out.Z = Z ** g; out.ox = p[0]; out.oy = p[1]; out.tx = a * (c[0] - p[0]); out.ty = a * (c[1] - p[1]);
  return out;
}
