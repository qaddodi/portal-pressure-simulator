// Hand-built scenes for the Tube's webs and rows (tests/tube-joint.test.js, tests/tube-data.test.js; brief S2-J): vessels as 64-sample polylines laid in the
// points texture the way pointsFromEntries lays them, the tube attribute array, and join entries in writeJoin's layout. Not a *.test.js.
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { TUBE_FLOATS } from '../src/ui/veins-mesh-data.js';

const TEXELS_ROW = N_SAMPLES / 2;
export const DEG = Math.PI / 180;

/** A vessel: 64 samples from (x0, y0) to (x1, y1), radius r all along (or a function of the sample). Coordinates are kept exactly representable in float32 by the callers. */
export function straight(x0, y0, x1, y1, r) {
  const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES);
  for (let i = 0; i < N_SAMPLES; i++) { const t = i / (N_SAMPLES - 1); P[2 * i] = Math.fround(x0 + (x1 - x0) * t); P[2 * i + 1] = Math.fround(y0 + (y1 - y0) * t); R[i] = typeof r === 'function' ? r(i) : r; }
  return { P, R };
}
/** A vessel from a polyline of corner points, spread over the 64 samples by arc length. */
export function polyline(corners, r) {
  const L = [0];
  for (let i = 1; i < corners.length; i++) L.push(L[i - 1] + Math.hypot(corners[i][0] - corners[i - 1][0], corners[i][1] - corners[i - 1][1]));
  const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES);
  for (let i = 0; i < N_SAMPLES; i++) {
    const s = (i / (N_SAMPLES - 1)) * L[L.length - 1];
    let k = 1;
    while (k < L.length - 1 && L[k] < s) k++;
    const t = (s - L[k - 1]) / (L[k] - L[k - 1] || 1);
    P[2 * i] = Math.fround(corners[k - 1][0] + (corners[k][0] - corners[k - 1][0]) * t); P[2 * i + 1] = Math.fround(corners[k - 1][1] + (corners[k][1] - corners[k - 1][1]) * t);
    R[i] = typeof r === 'function' ? r(i) : r;
  }
  return { P, R };
}
/** A vessel leaving (x, y) at `deg` degrees for `len` units, radius r. */
export const ray = (x, y, deg, len, r) => straight(x, y, x + len * Math.cos(deg * DEG), y + len * Math.sin(deg * DEG), r);

/**
 * rows: [{ P, R, tier?, alpha?, flags?, clip? [from, to] }]; joins: [{ x, y, reach, k, fillet, members: [row...], trunk?, fork? }].
 * Returns { rows, pts (the points texture array), tube (the tube attribute array), ent (join entries, 8 floats each), nRows, P (each row's points as the texture holds them) }.
 */
export function scene(rows, joins) {
  const nRows = rows.length;
  const pts = new Float32Array(Math.max(1, Math.ceil((nRows * TEXELS_ROW) / 2048)) * 2048 * 4);
  const tube = new Float32Array(nRows * TUBE_FLOATS);
  const flat = [];
  rows.forEach((r, row) => {
    const f = new Float64Array(N_SAMPLES * 2);
    for (let i = 0; i < N_SAMPLES; i++) {
      const a = (row * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2;
      pts[a] = r.P[2 * i]; pts[a + 1] = r.P[2 * i + 1];
      f[2 * i] = pts[a]; f[2 * i + 1] = pts[a + 1];
    }
    flat.push(f);
    const o = row * TUBE_FLOATS;
    tube[o + 7] = r.alpha ?? 1; tube[o + 8] = r.tier ?? 0; tube[o + 10] = r.flags ?? 0;
    tube[o + 20] = r.clip ? r.clip[0] : 0; tube[o + 21] = r.clip ? r.clip[1] : 1;
  });
  const ent = new Float32Array(joins.length * 8);
  joins.forEach((j, n) => {
    const q = n * 8;
    ent[q] = j.x; ent[q + 1] = j.y; ent[q + 2] = j.reach; ent[q + 3] = Math.round(j.k * 100) + 0.99 * Math.min(1, Math.max(0, j.fillet ?? 1));
    for (let m = 0; m < 4; m++) ent[q + 4 + m] = j.members[m] == null ? -1 : j.members[m] + (j.trunk === j.members[m] ? (j.fork ? 0.375 : 0.25) : 0);
  });
  return { rows, pts, tube, ent, nRows, P: flat, R: rows.map((r) => r.R) };
}

/** The distance from (x, y) to the polyline P (flat, 64 points). */
export function polyDist(P, x, y) {
  let best = Infinity;
  for (let j = 0; j < N_SAMPLES - 1; j++) {
    const ax = P[2 * j], ay = P[2 * j + 1], dx = P[2 * j + 2] - ax, dy = P[2 * j + 3] - ay;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-300)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
/** The distance from (x, y) to the infinite line through (px, py) along the unit (dx, dy). */
export const lineDist = (px, py, dx, dy, x, y) => Math.abs((x - px) * dy - (y - py) * dx);

/** A capture of tests/tube-web-capture.mjs (rows { id, P, R }, joins (entries), tube, nRows) as the arrays the Tube's data builders read: pts (the points texture array), tube, ent, P and R by row id. */
export function loadCapture(c) {
  const pts = new Float32Array(Math.max(1, Math.ceil((c.nRows * TEXELS_ROW) / 2048)) * 2048 * 4);
  const P = {}, R = {};
  for (const r of c.rows) {
    const f = new Float64Array(N_SAMPLES * 2);
    for (let i = 0; i < N_SAMPLES; i++) {
      const a = (r.id * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2;
      pts[a] = r.P[2 * i]; pts[a + 1] = r.P[2 * i + 1];
      f[2 * i] = pts[a]; f[2 * i + 1] = pts[a + 1];
    }
    P[r.id] = f; R[r.id] = Float64Array.from(r.R);
  }
  return { pts, tube: Float32Array.from(c.tube), ent: Float32Array.from(c.joins.flat()), P, R, nRows: c.nRows, rows: c.rows };
}
