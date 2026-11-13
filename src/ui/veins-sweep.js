// The vessel binning for a stretch of the change between the Anatomy and the Circuit (2 Nov 2026, "Move everything to GPU": the morph
// on the GPU). binVeins (veins-bin.js) lists, in each square cell, the vessel segments and joins that can draw there, for the vessels
// where they are now; every frame of the change had binned every vessel again and sent the 4 MB list up (his iPhone, 1 Nov). Here the
// lists hold every segment and join that can draw in a cell anywhere along a stretch of the change, so one binning serves all of the
// stretch's frames: the shader reads the vessels' points and the joins as they are in each frame from the same texture (the rows after
// the lists: posBase, joinBase), sent up each frame in a few rows (veins-gl setMorphFrame).
//
// A stretch is given as its samples: each vessel's points at a few moments of it (`path`: P0, P1, … Pm, each the vessel's samples as
// binned). Between two moments the stage checks that every point lies within `slack` of the straight line between its two samples
// (stage.js morphFrame); a segment drawn then lies within the four points' hull widened by the slack, and a cell lists it when that
// region comes within its reach. The lists are a superset of what binVeins gives at any moment of the stretch: a segment out of a
// pixel's reach is passed over by the shader as before.
//
// The entries are binVeins' (the same eight floats, the same heads, runs and joins), with these differences, which the vessel shader
// reads only with morphOn (veins-gl):
//   - a segment entry's points are the first sample's; the shader reads the points from the frame's rows instead. Its head's circle
//     and its runs' radii hold the points of every sample, and the slack, so the passes they let the shader skip stay safe.
//   - a join entry's first float is the join's index: its centre, reach, blend width and fillet are read from the frame's rows.
//   - (tight) a head's spare floats hold a circle about the middle point of its segments as the frame has it (A.w its radius, B.z that
//     point's index), and a run's first entry holds its own in A.zw (radius, index), which the shader tests as well as the swept ones. Swept over the whole stretch, the
//     heads' and runs' circles held a vessel in every cell it passes through anywhere in the stretch, so a pixel walked every entry of
//     every vessel that would pass it in the stretch (mid-change 4 to 5 times the entries a pixel walks in the Anatomy at rest); about
//     the frame's own points, the vessels not near in this frame are passed over at their head (8 Nov 2026, "anatomy to circuit 10fps").

import { CELL, ENT_W, RUN } from './veins-bin.js';

const d2 = (x, y) => x * x + y * y;
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  const ex = ax + dx * h - px, ey = ay + dy * h - py;
  return ex * ex + ey * ey;
}
const cross = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const a = cross(ax, ay, bx, by, px, py), b = cross(bx, by, cx, cy, px, py), c = cross(cx, cy, ax, ay, px, py);
  return !((a < 0 || b < 0 || c < 0) && (a > 0 || b > 0 || c > 0));
}
/** Squared distance from (px, py) to the convex hull of four points (0 inside it). */
export function hull4Dist2(px, py, ax, ay, bx, by, cx, cy, dx, dy) {
  if (inTri(px, py, ax, ay, bx, by, cx, cy) || inTri(px, py, ax, ay, bx, by, dx, dy) || inTri(px, py, ax, ay, cx, cy, dx, dy) || inTri(px, py, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(segDist2(px, py, ax, ay, bx, by), segDist2(px, py, cx, cy, dx, dy), segDist2(px, py, ax, ay, cx, cy),
    segDist2(px, py, bx, by, dx, dy), segDist2(px, py, ax, ay, dx, dy), segDist2(px, py, bx, by, cx, cy));
}
/** Squared distance from (px, py) to segment i of a vessel anywhere between its samples (path: P0 … Pm). */
export function sweptDist2(px, py, path, i) {
  if (path.length === 1) { const P = path[0]; return segDist2(px, py, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]); }
  let best = Infinity;
  for (let j = 0; j + 1 < path.length && best > 0; j++) {
    const P = path[j], Q = path[j + 1];
    best = Math.min(best, hull4Dist2(px, py, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], Q[i][0], Q[i][1], Q[i + 1][0], Q[i + 1][1]));
  }
  return best;
}
/**
 * Whether (px, py) lies within sqrt(lim2) of segment i of a vessel anywhere between its samples: sweptDist2(...) <= lim2, found without
 * the distance. Each pair of neighbouring moments' hull is first passed over when the point lies farther than the limit from the box
 * about its four points (`box`: the boxes of the segment's hulls, 4 numbers each, from hullBoxes), and the answer is given at the first
 * hull that holds the point or has a side within the limit. (R1, 10 Nov 2026: the stretches' binning is the longest part of making the
 * change between the views ready, and the exact distance to every hull was 60% of it. The same cells are listed, but for a segment with
 * two samples on one point: every cross product of its hull is zero, which hull4Dist2 took as holding every point, so its cells out of
 * its reach were listed; they are not now.)
 */
function sweptWithin(px, py, path, i, lim2, box) {
  if (path.length === 1) { const P = path[0]; return segDist2(px, py, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]) <= lim2; }
  // (A margin past the root, so a rounding of it never passes over a hull that is exactly at the limit.)
  const L = Math.sqrt(lim2) * (1 + 1e-9) + 1e-9;
  for (let j = 0, b = 0; j + 1 < path.length; j++, b += 4) {
    if (px < box[b] - L || px > box[b + 2] + L || py < box[b + 1] - L || py > box[b + 3] + L) continue;
    const P = path[j], Q = path[j + 1], ax = P[i][0], ay = P[i][1], bx = P[i + 1][0], by = P[i + 1][1], cx = Q[i][0], cy = Q[i][1], dx = Q[i + 1][0], dy = Q[i + 1][1];
    if (inTri(px, py, ax, ay, bx, by, cx, cy) || inTri(px, py, ax, ay, bx, by, dx, dy) || inTri(px, py, ax, ay, cx, cy, dx, dy) || inTri(px, py, bx, by, cx, cy, dx, dy)) return true;
    if (segDist2(px, py, ax, ay, bx, by) <= lim2 || segDist2(px, py, cx, cy, dx, dy) <= lim2 || segDist2(px, py, ax, ay, cx, cy) <= lim2 ||
      segDist2(px, py, bx, by, dx, dy) <= lim2 || segDist2(px, py, ax, ay, dx, dy) <= lim2 || segDist2(px, py, bx, by, cx, cy) <= lim2) return true;
  }
  return false;
}
/** The box about each hull of segment i (minX, minY, maxX, maxY for each pair of neighbouring moments) into `box`. */
function hullBoxes(path, i, box) {
  for (let j = 0, b = 0; j + 1 < path.length; j++, b += 4) {
    const P = path[j], Q = path[j + 1], a = P[i], c = P[i + 1], d = Q[i], e = Q[i + 1];
    box[b] = Math.min(a[0], c[0], d[0], e[0]); box[b + 1] = Math.min(a[1], c[1], d[1], e[1]);
    box[b + 2] = Math.max(a[0], c[0], d[0], e[0]); box[b + 3] = Math.max(a[1], c[1], d[1], e[1]);
  }
}
function polyDist2(px, py, C) {
  if (C.length === 1) return d2(px - C[0][0], py - C[0][1]);
  let best = Infinity;
  for (let j = 0; j + 1 < C.length; j++) best = Math.min(best, segDist2(px, py, C[j][0], C[j][1], C[j + 1][0], C[j + 1][1]));
  return best;
}
const up = (r) => (Math.fround(r) < r ? r * (1 + 1e-6) + 1e-6 : r);

/**
 * tubes: [{ id (row), path: [P0, … Pm] (each nSamples points [x, y]), reach, core }]; joins: [{ path: [[x, y], …] (its centre at each
 * sample), reach (the most it reaches anywhere in the stretch), k, fillet, members, trunk, fork }]. opts: { rows (vessel rows the frame's
 * points cover), samples (points a vessel), slack (world units), tight (the heads' and runs' circles about a point of the frame too: see
 * fitSwept; for frames that lie between two neighbouring moments) }. Returns binVeins' result, with `posBase` and `joinBase` (texel
 * indices of the frame's points and joins in `ent`, filled with the first sample's) and `nJoins`.
 */
export function binSwept(tubes, joins, { rows, samples, slack = 2, tight = false }) {
  const HALF = CELL * Math.SQRT1_2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tubes) {
    const r = t.reach + slack;
    for (const P of t.path) for (const q of P) { x0 = Math.min(x0, q[0] - r); y0 = Math.min(y0, q[1] - r); x1 = Math.max(x1, q[0] + r); y1 = Math.max(y1, q[1] + r); }
  }
  const posTexels = rows * samples / 2, posRows = (n) => Math.ceil((posTexels + n) / ENT_W);
  if (!tubes.length) {
    const ent = new Float32Array(posRows(joins.length) * ENT_W * 4);
    return { ent, rows: Math.max(1, posRows(joins.length)), cells: new Float32Array(0), nCells: 0, nEnt: 0, blood: new Float32Array(0), nBlood: 0, bloodQ: new Float32Array(0), nBloodQ: 0, posBase: 0, joinBase: posTexels, nJoins: joins.length };
  }
  x0 = Math.floor(x0 / CELL) * CELL; y0 = Math.floor(y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
  // Pass 1: each vessel's (cell, sample) pairs, and the cells (and quarters) its lumen can reach.
  const per = tubes.map((t) => {
    const { path, reach, core } = t, n = path[0].length;
    const R = reach + slack, lim2 = (R + HALF) ** 2, limC2 = core == null ? Infinity : (Math.min(core, reach) + slack + HALF) ** 2;
    const limQ2 = core == null ? Infinity : (Math.min(core, reach) + slack + HALF / 2) ** 2;
    const cs = [], ss = [], bc = [], bq = [], box = new Float64Array(4 * Math.max(1, path.length - 1));
    for (let i = 0; i < n - 1; i++) {
      let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
      for (const P of path) { const a = P[i], b = P[i + 1]; ax0 = Math.min(ax0, a[0], b[0]); ay0 = Math.min(ay0, a[1], b[1]); ax1 = Math.max(ax1, a[0], b[0]); ay1 = Math.max(ay1, a[1], b[1]); }
      const cx0 = Math.max(0, Math.floor((ax0 - R - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((ax1 + R - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((ay0 - R - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((ay1 + R - y0) / CELL));
      hullBoxes(path, i, box);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const mx = x0 + (cx + 0.5) * CELL, my = y0 + (cy + 0.5) * CELL;
        if (!sweptWithin(mx, my, path, i, lim2, box)) continue;
        cs.push(cy * nx + cx); ss.push(i);
        if (sweptWithin(mx, my, path, i, limC2, box)) {
          bc.push(cy * nx + cx);
          if (core != null) for (let q = 0; q < 4; q++) {
            if (sweptWithin(x0 + (cx + 0.25 + 0.5 * (q & 1)) * CELL, y0 + (cy + 0.25 + 0.5 * (q >> 1)) * CELL, path, i, limQ2, box)) bq.push((cy * nx + cx) * 4 + q);
          }
        }
      }
    }
    return { n: cs.length, cs, ss, bc, bq };
  });
  const jCell = [];
  joins.forEach((j, ji) => {
    let jx0 = Infinity, jy0 = Infinity, jx1 = -Infinity, jy1 = -Infinity;
    for (const c of j.path) { jx0 = Math.min(jx0, c[0]); jy0 = Math.min(jy0, c[1]); jx1 = Math.max(jx1, c[0]); jy1 = Math.max(jy1, c[1]); }
    const R = j.reach + slack, lim2 = (R + HALF) ** 2;
    const cx0 = Math.max(0, Math.floor((jx0 - R - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((jx1 + R - x0) / CELL));
    const cy0 = Math.max(0, Math.floor((jy0 - R - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((jy1 + R - y0) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (polyDist2(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, j.path) > lim2) continue;
      jCell.push(cy * nx + cx, ji);
    }
  });
  // Pass 2: as binVeins, a counting sort by cell, each vessel's stretch of a cell's list headed by its head entry.
  let nSeg = 0;
  for (const p of per) nSeg += p.n;
  const cellOf = new Int32Array(nSeg), segOf = new Int32Array(nSeg), tubeOf = new Int32Array(nSeg);
  for (let ti = 0, o = 0; ti < tubes.length; ti++) { const { n, cs, ss } = per[ti]; cellOf.set(cs, o); segOf.set(ss, o); tubeOf.fill(ti, o, o + n); o += n; }
  const NC = nx * ny, segCount = new Int32Array(NC), jCount = new Int32Array(NC), lastId = new Float64Array(NC).fill(-Infinity);
  for (let k = 0; k < nSeg; k++) {
    const c = cellOf[k], id = tubes[tubeOf[k]].id;
    if (lastId[c] !== id) { lastId[c] = id; segCount[c]++; }
    segCount[c]++;
  }
  for (let k = 0; k < jCell.length; k += 2) jCount[jCell[k]]++;
  const segStart = new Int32Array(NC), jStart = new Int32Array(NC);
  let o = 0, nCells = 0;
  for (let c = 0; c < NC; c++) { segStart[c] = o; o += segCount[c]; if (segCount[c]) nCells++; }
  for (let c = 0; c < NC; c++) { jStart[c] = o; o += segCount[c] ? jCount[c] : 0; }
  const nEnt = o, entRows = Math.max(1, Math.ceil((nEnt * 2) / ENT_W));
  const posBase = entRows * ENT_W, joinBase = posBase + posTexels;
  const total = entRows + posRows(joins.length);
  const ent = new Float32Array(total * ENT_W * 4);
  const fill = segStart.slice(), fillJ = jStart.slice(), tubeAt = new Map(tubes.map((t, ti) => [t.id, ti]));
  lastId.fill(-Infinity);
  for (let k = 0; k < nSeg; k++) {
    const c = cellOf[k], t = tubes[tubeOf[k]];
    if (lastId[c] !== t.id) { lastId[c] = t.id; const h = fill[c]++; ent[h * 8 + 4] = t.id; ent[h * 8 + 5] = -1; }
    const e = fill[c]++, i = segOf[k], P = t.path[0], q = e * 8;
    ent[q] = P[i][0]; ent[q + 1] = P[i][1]; ent[q + 2] = P[i + 1][0]; ent[q + 3] = P[i + 1][1];
    ent[q + 4] = t.id; ent[q + 5] = i;
  }
  // Heads and runs: their circles hold the points of every sample, widened by the slack.
  for (let c = 0; c < NC; c++) {
    const e1 = segStart[c] + segCount[c];
    for (let e = segStart[c]; e < e1;) {
      const id = ent[e * 8 + 4], path = tubes[tubeAt.get(id)].path;
      let g = e + 1;
      while (g < e1 && ent[g * 8 + 4] === id && ent[g * 8 + 5] !== -1) g++;
      ent[e * 8 + 7] = g - e - 1;
      fitSwept(ent, e, g, path, slack, tight);
      e = g;
    }
  }
  for (let k = 0; k < jCell.length; k += 2) {
    const c = jCell[k];
    if (!segCount[c]) continue;
    const e = fillJ[c]++, ji = jCell[k + 1], j = joins[ji], q = e * 8;
    ent[q] = ji; ent[q + 1] = 0; ent[q + 2] = j.reach; ent[q + 3] = Math.round(j.k * 100) + 0.99 * Math.min(1, Math.max(0, j.fillet ?? 1));
    for (let m = 0; m < 4; m++) ent[q + 4 + m] = j.members[m] == null ? -1 : j.members[m] + (j.trunk === j.members[m] ? (j.fork ? 0.375 : 0.25) : 0);
  }
  // The frame's rows, as the first sample has them (the stage sends each frame's own).
  for (const t of tubes) writePoints(ent, posBase, samples, t.id, t.path[0]);
  joins.forEach((j, ji) => writeJoinNow(ent, joinBase, ji, j.path[0][0], j.path[0][1], j.reach, j.k, j.fillet));
  // The cells a lumen can reach, and the cell records, as binVeins makes them.
  const wet = new Uint8Array(NC), wetQ = new Uint8Array(NC * 4);
  tubes.forEach((t, ti) => {
    const { n, cs, bc, bq } = per[ti];
    if (t.core == null) for (let k = 0; k < n; k++) { wet[cs[k]] = 1; wetQ.fill(1, cs[k] * 4, cs[k] * 4 + 4); }
    else { for (const c of bc) wet[c] = 1; for (const q of bq) wetQ[q] = 1; }
  });
  for (let k = 0; k < jCell.length; k += 2) { wet[jCell[k]] = 1; wetQ.fill(1, jCell[k] * 4, jCell[k] * 4 + 4); }
  const cells = new Float32Array(nCells * 6), wetAt = [], quarters = [];
  let ci = 0;
  for (let c = 0; c < NC; c++) {
    if (!segCount[c]) continue;
    cells[ci] = x0 + (c % nx) * CELL; cells[ci + 1] = y0 + Math.floor(c / nx) * CELL;
    cells[ci + 2] = segStart[c]; cells[ci + 3] = segCount[c]; cells[ci + 4] = jStart[c]; cells[ci + 5] = jCount[c];
    if (wet[c]) wetAt.push(ci);
    for (let q = 0; q < 4; q++) if (wetQ[c * 4 + q]) quarters.push(cells[ci] + (q & 1) * (CELL / 2), cells[ci + 1] + (q >> 1) * (CELL / 2));
    ci += 6;
  }
  const nBlood = wetAt.length, blood = new Float32Array(nBlood * 6);
  wetAt.forEach((at, b) => blood.set(cells.subarray(at, at + 6), b * 6));
  const nBloodQ = quarters.length / 2, bloodQ = new Float32Array(nBloodQ * 6);
  for (let k = 0; k < nBloodQ; k++) { bloodQ[k * 6] = quarters[k * 2]; bloodQ[k * 6 + 1] = quarters[k * 2 + 1]; }
  return { ent, rows: total, cells, nCells, nEnt, blood, nBlood, bloodQ, nBloodQ, posBase, joinBase, nJoins: joins.length, entRows, tight };
}

// A stretch's head (h, its stretch running to g) and runs, fitted to every sample's points of its segments.
// (tight) How far any point of the list `idx` (sample indices) can lie from point r of the same vessel in a frame between two neighbouring
// moments of the stretch: each point of such a frame lies within the slack of the line between its own two samples (stage-vessels.js
// frameFrom), at a share of the way of its own, and the farthest two points on two segments are at two of their ends, so the farthest
// is the most of the four distances between the ends at each pair of neighbouring moments, and the slack of each of the two points.
function tightR(path, idx, r, slack) {
  let R2 = 0;
  if (path.length === 1) { const P = path[0]; for (const j of idx) R2 = Math.max(R2, d2(P[j][0] - P[r][0], P[j][1] - P[r][1])); }
  for (let s = 0; s + 1 < path.length; s++) {
    const A = path[s], B = path[s + 1], ax = A[r][0], ay = A[r][1], bx = B[r][0], by = B[r][1];
    for (const j of idx) {
      const p = A[j], q = B[j];
      R2 = Math.max(R2, d2(p[0] - ax, p[1] - ay), d2(p[0] - bx, p[1] - by), d2(q[0] - ax, q[1] - ay), d2(q[0] - bx, q[1] - by));
    }
  }
  return up(Math.sqrt(R2) + 2 * slack);
}
const IDX = [];
// The sample half way between the first and the last of a list's (any sample will do: the frame has every one of the vessel's points).
function midIdx(idx) {
  let lo = Infinity, hi = -Infinity;
  for (const i of idx) { if (i < lo) lo = i; if (i > hi) hi = i; }
  return Math.round((lo + hi) / 2);
}
function fitSwept(ent, h, g, path, slack, tight = false) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let f = h + 1; f < g; f++) {
    const i = ent[f * 8 + 5];
    for (const P of path) { const a = P[i], b = P[i + 1]; bx0 = Math.min(bx0, a[0], b[0]); bx1 = Math.max(bx1, a[0], b[0]); by0 = Math.min(by0, a[1], b[1]); by1 = Math.max(by1, a[1], b[1]); }
  }
  const cx = Math.fround((bx0 + bx1) / 2), cy = Math.fround((by0 + by1) / 2);
  let R2 = 0;
  for (let f = h + 1; f < g; f++) { const i = ent[f * 8 + 5]; for (const P of path) R2 = Math.max(R2, d2(P[i][0] - cx, P[i][1] - cy), d2(P[i + 1][0] - cx, P[i + 1][1] - cy)); }
  ent[h * 8] = cx; ent[h * 8 + 1] = cy; ent[h * 8 + 2] = up(Math.sqrt(R2) + slack);
  // (tight: the head's circle about the middle point of its segments as the frame has it (that point's index in the head's spare float
  // B.z), its radius in A.w; read by the shader with morphOn 2, as well as the swept one.)
  if (tight) {
    IDX.length = 0;
    for (let f = h + 1; f < g; f++) { const i = ent[f * 8 + 5]; IDX.push(i, i + 1); }
    const r = midIdx(IDX);
    ent[h * 8 + 3] = tightR(path, IDX, r, slack); ent[h * 8 + 6] = r;
  }
  for (let e = h + 1; e < g;) {
    const q0 = e * 8, ax = ent[q0], ay = ent[q0 + 1], n = Math.min(RUN, g - e);
    let rho2 = 0;
    for (let k = 0; k < n; k++) { const i = ent[(e + k) * 8 + 5]; for (const P of path) rho2 = Math.max(rho2, d2(P[i][0] - ax, P[i][1] - ay), d2(P[i + 1][0] - ax, P[i + 1][1] - ay)); }
    ent[q0 + 6] = up(Math.sqrt(rho2) + slack); ent[q0 + 7] = n;
    // (tight: the run's circle about the middle point of its segments as the frame has it, its radius in A.z and that point's index in
    // A.w: with morphOn the shader reads the segment's ends from the frame's rows, never the entry's own.)
    if (tight) {
      IDX.length = 0;
      for (let k = 0; k < n; k++) { const i = ent[(e + k) * 8 + 5]; IDX.push(i, i + 1); }
      const r = midIdx(IDX);
      ent[q0 + 2] = tightR(path, IDX, r, slack); ent[q0 + 3] = r;
    }
    e += n;
  }
}

/** A vessel's points (samples of them) into the frame's rows of `ent` (or of a buffer laid out as they are, from posBase). */
export function writePoints(ent, posBase, samples, row, P) {
  const o = (posBase + row * samples / 2) * 4;
  for (let i = 0; i < samples; i++) { ent[o + i * 2] = P[i][0]; ent[o + i * 2 + 1] = P[i][1]; }
}
/** A join as it is now into the frame's rows: centre, reach, and the blend width with its fillet (as binVeins writes a join entry). */
export function writeJoinNow(ent, joinBase, ji, x, y, reach, k, fillet) {
  const o = (joinBase + ji) * 4;
  ent[o] = x; ent[o + 1] = y; ent[o + 2] = reach; ent[o + 3] = Math.round(k * 100) + 0.99 * Math.min(1, Math.max(0, fillet ?? 1));
}
