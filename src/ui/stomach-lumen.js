// The stomach's lumen as rows of the figure's own outline, for blood that collects in it (blood.js bleedShapes, veins-gl.js).
// One span (left x, right x) at each of STO_N heights from STO_Y0 down in steps of STO_DY, read off the stomach drawn with the
// esophagus (anatomy.js SEAM_D); a row below the stomach's lowest point is empty. Pure geometry, no DOM.
import { SEAM_D } from './anatomy.js?v=9f55a095a6';

export const STO_Y0 = 258, STO_DY = 4, STO_N = 80;

// SEAM_D as a polygon (its curves cut into short chords).
function outline() {
  const toks = SEAM_D.match(/[MLCZ]|-?\d+(?:\.\d+)?/g), pts = [];
  let i = 0, cur = [0, 0];
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    const c = toks[i++];
    if (c === 'M' || c === 'L') { cur = [num(), num()]; pts.push(cur); }
    else if (c === 'C') {
      const p1 = [num(), num()], p2 = [num(), num()], p3 = [num(), num()];
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, s = 1 - t, a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t;
        pts.push([a * cur[0] + b * p1[0] + d * p2[0] + e * p3[0], a * cur[1] + b * p1[1] + d * p2[1] + e * p3[1]]);
      }
      cur = p3;
    }
  }
  return pts;
}

/** The lumen's rows: [[left x, right x], ...], STO_N of them, the first at STO_Y0; an empty row has both equal. */
export function lumenRows() {
  const pts = outline(), bottom = Math.max(...pts.map((p) => p[1]));
  const rows = [];
  let lastMid = 0;
  for (let r = 0; r < STO_N; r++) {
    const y = STO_Y0 + r * STO_DY, xs = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length];
      if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    if (xs.length && y < bottom) { const lo = Math.min(...xs), hi = Math.max(...xs); rows.push([lo, hi]); lastMid = (lo + hi) / 2; }
    else rows.push([lastMid, lastMid]);
  }
  return rows;
}
export const LUMEN = lumenRows();
export const LUMEN_BOTTOM = STO_Y0 + (LUMEN.findIndex((r) => r[1] - r[0] < 1e-6) - 1) * STO_DY;

// Area below each row's top edge (world units squared), summed up from the bottom: AREA[r] is what lies under row r.
const AREA = (() => {
  const a = new Array(STO_N + 1).fill(0);
  for (let r = STO_N - 1; r >= 0; r--) a[r] = a[r + 1] + (LUMEN[r][1] - LUMEN[r][0]) * STO_DY;
  return a;
})();
export const LUMEN_AREA = AREA[0];

/** The height (y, down the page) of a flat surface that has the given share (0..1) of the lumen's area under it. */
export function lumenSurface(share) {
  const want = Math.min(1, Math.max(0, share)) * LUMEN_AREA;
  for (let r = STO_N - 1; r >= 0; r--) {
    if (AREA[r] >= want) {
      const w = AREA[r] - AREA[r + 1];
      return STO_Y0 + (r + 1) * STO_DY - (w > 0 ? (want - AREA[r + 1]) / w : 0) * STO_DY;
    }
  }
  return STO_Y0;
}

/** The lumen's left and right x at height y (rows interpolated), [x, x] where there is none. */
export function lumenAt(y) {
  const f = Math.min(STO_N - 1, Math.max(0, (y - STO_Y0) / STO_DY)), i = Math.floor(f), j = Math.min(STO_N - 1, i + 1), u = f - i;
  return [LUMEN[i][0] + (LUMEN[j][0] - LUMEN[i][0]) * u, LUMEN[i][1] + (LUMEN[j][1] - LUMEN[i][1]) * u];
}
