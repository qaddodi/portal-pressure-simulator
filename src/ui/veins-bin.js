// Vessel binning for the WebGL vessels (veins-gl.js): which vessel samples and joins can draw in each square cell of the
// figure. Kept apart from the renderer so it runs (and is tested) without a page.

export const CELL = 16;                       // cell size, world units
export const ENT_W = 2048;                    // texels per row of the entry texture
export const RUN = 4;                         // segments of one vessel per run (see the runs below)

// Distance from point (px, py) to segment a→b.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(ax + dx * h - px, ay + dy * h - py);
}

/**
 * Bins vessels into cells. `tubes`: [{ id (row), pts: [[x, y]] × N_SAMPLES, reach }] where reach
 * is how far from the centerline the vessel can draw (radius, casing, shadow, fillet, glow);
 * `joins`: [{ x, y, reach, k, members: [row, …] (≤ 4) }]. Returns the entry texels and the cells.
 */
export function binVeins(tubes, joins, memo = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tubes) for (const [x, y] of t.pts) { x0 = Math.min(x0, x - t.reach); y0 = Math.min(y0, y - t.reach); x1 = Math.max(x1, x + t.reach); y1 = Math.max(y1, y + t.reach); }
  if (!tubes.length) return { ent: new Float32Array(0), rows: 1, cells: new Float32Array(0), nCells: 0, nEnt: 0 };
  x0 = Math.floor(x0 / CELL) * CELL; y0 = Math.floor(y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const HALF = CELL * Math.SQRT1_2;
  // Pass 1: (cell, tube, sample) triples in vessel-major order, so a cell's list stays grouped by vessel.
  let cap = 1 << 16, nSeg = 0, cellOf = new Int32Array(cap), tubeOf = new Int32Array(cap), segOf = new Int32Array(cap);
  const push = (c, t, i) => {
    if (nSeg === cap) {
      cap *= 2;
      const grow = (a) => { const b = new Int32Array(cap); b.set(a); return b; };
      cellOf = grow(cellOf); tubeOf = grow(tubeOf); segOf = grow(segOf);
    }
    cellOf[nSeg] = c; tubeOf[nSeg] = t; segOf[nSeg] = i; nSeg++;
  };
  // (memo: a Map kept by the caller. A vessel whose points and reach are the same as last time, on the same grid, reuses
  // its (cell, sample) pairs instead of testing every cell again; the result is the same, entry for entry.)
  const grid = `${x0},${y0},${nx},${ny}`;
  if (memo && memo.grid !== grid) { memo.clear(); memo.grid = grid; memo.last = null; }
  let fresh = 0;
  for (let ti = 0; ti < tubes.length; ti++) {
    const { id, pts, reach } = tubes[ti];
    const m = memo?.get(id);
    if (m && m.reach === reach && m.pts.length === pts.length * 2 && pts.every((q, i) => q[0] === m.pts[i * 2] && q[1] === m.pts[i * 2 + 1])) {
      for (let k = 0; k < m.n; k++) push(m.cs[k], ti, m.ss[k]);
      continue;
    }
    const from = nSeg;
    fresh++;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - y0) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        if (segDist(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, ax, ay, bx, by) > reach + HALF) continue;
        push(cy * nx + cx, ti, i);
      }
    }
    if (memo) memo.set(id, { reach, pts: Float64Array.from(pts.flat()), n: nSeg - from, cs: cellOf.slice(from, nSeg), ss: segOf.slice(from, nSeg) });
  }
  // Nothing changed since the last call (same vessels, points, reaches and joins): the last result itself, so the caller
  // can skip the upload.
  const sameKey = memo && `${tubes.map((t) => t.id).join(',')}|${joins.map((j) => `${j.x},${j.y},${j.reach},${j.k},${j.fillet},${j.members.join('.')}`).join(';')}`;
  if (memo && !fresh && memo.last && memo.key === sameKey) return memo.last;
  const jCell = [];
  joins.forEach((j, ji) => {
    const cx0 = Math.max(0, Math.floor((j.x - j.reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((j.x + j.reach - x0) / CELL));
    const cy0 = Math.max(0, Math.floor((j.y - j.reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((j.y + j.reach - y0) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (Math.hypot(x0 + (cx + 0.5) * CELL - j.x, y0 + (cy + 0.5) * CELL - j.y) > j.reach + HALF) continue;
      jCell.push(cy * nx + cx, ji);
    }
  });
  // Pass 2: counting sort by cell (stable). Each vessel's stretch of a cell's list (a run of one vessel id) starts with a head
  // entry (see below), counted here with the stretch.
  const NC = nx * ny, segCount = new Int32Array(NC), jCount = new Int32Array(NC), lastId = new Float64Array(NC).fill(-Infinity);
  for (let k = 0; k < nSeg; k++) {
    const c = cellOf[k];
    const id = tubes[tubeOf[k]].id;
    if (lastId[c] !== id) { lastId[c] = id; segCount[c]++; }
    segCount[c]++;
  }
  for (let k = 0; k < jCell.length; k += 2) jCount[jCell[k]]++;
  const segStart = new Int32Array(NC), jStart = new Int32Array(NC);
  let o = 0, nCells = 0;
  for (let c = 0; c < NC; c++) { segStart[c] = o; o += segCount[c]; if (segCount[c]) nCells++; }
  for (let c = 0; c < NC; c++) { jStart[c] = o; o += segCount[c] ? jCount[c] : 0; }
  const nEnt = o;
  const rows = Math.max(1, Math.ceil((nEnt * 2) / ENT_W));
  const ent = new Float32Array(rows * ENT_W * 4);
  const fillS = segStart.slice(), fillJ = jStart.slice();
  lastId.fill(-Infinity);
  for (let k = 0; k < nSeg; k++) {
    const c = cellOf[k], t = tubes[tubeOf[k]];
    if (lastId[c] !== t.id) { lastId[c] = t.id; const h = fillS[c]++ * 8; ent[h + 4] = t.id; ent[h + 5] = -1; }
    const e = fillS[c]++, i = segOf[k], a = t.pts[i], b = t.pts[i + 1], q = e * 8;
    ent[q] = a[0]; ent[q + 1] = a[1]; ent[q + 2] = b[0]; ent[q + 3] = b[1];
    ent[q + 4] = t.id; ent[q + 5] = i;
  }
  // A radius that holds every point measured, nudged past float32 rounding (the shader reads it as float32).
  const up = (r) => (Math.fround(r) < r ? r * (1 + 1e-6) + 1e-6 : r);
  // Each vessel's stretch of a cell's list starts with a head entry: a circle (centre, radius) holding every point of the
  // stretch, and the stretch's length (segment index -1 marks it), so the shader can pass over a vessel that lies wholly
  // out of reach of a pixel. Then the stretch in runs of up to RUN segments: the run's first entry holds (in its two spare
  // floats) a radius around its start that holds every point of the run, and the run's length, so the shader can pass
  // over a run that lies wholly too far away to change anything (veins-gl).
  for (let c = 0; c < NC; c++) {
    const e1 = segStart[c] + segCount[c];
    for (let e = segStart[c]; e < e1;) {
      if (ent[e * 8 + 5] === -1) {
        const h = e * 8, id = ent[h + 4];
        let g = e + 1, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (; g < e1 && ent[g * 8 + 4] === id && ent[g * 8 + 5] !== -1; g++) {
          const q = g * 8;
          bx0 = Math.min(bx0, ent[q], ent[q + 2]); bx1 = Math.max(bx1, ent[q], ent[q + 2]);
          by0 = Math.min(by0, ent[q + 1], ent[q + 3]); by1 = Math.max(by1, ent[q + 1], ent[q + 3]);
        }
        const cx = Math.fround((bx0 + bx1) / 2), cy = Math.fround((by0 + by1) / 2);
        let R = 0;
        for (let f = e + 1; f < g; f++) { const q = f * 8; R = Math.max(R, Math.hypot(ent[q] - cx, ent[q + 1] - cy), Math.hypot(ent[q + 2] - cx, ent[q + 3] - cy)); }
        ent[h] = cx; ent[h + 1] = cy; ent[h + 2] = up(R); ent[h + 7] = g - e - 1;
        e++;
        continue;
      }
      const q0 = e * 8, id = ent[q0 + 4], ax = ent[q0], ay = ent[q0 + 1];
      let n = 0, rho = 0;
      while (n < RUN && e + n < e1 && ent[(e + n) * 8 + 4] === id && ent[(e + n) * 8 + 5] !== -1) {
        const q = (e + n) * 8;
        rho = Math.max(rho, Math.hypot(ent[q] - ax, ent[q + 1] - ay), Math.hypot(ent[q + 2] - ax, ent[q + 3] - ay));
        n++;
      }
      ent[q0 + 6] = up(rho); ent[q0 + 7] = n;
      e += n;
    }
  }
  for (let k = 0; k < jCell.length; k += 2) {
    const c = jCell[k];
    if (!segCount[c]) continue;
    const e = fillJ[c]++, j = joins[jCell[k + 1]], q = e * 8;
    ent[q] = j.x; ent[q + 1] = j.y; ent[q + 2] = j.reach; ent[q + 3] = Math.round(j.k * 100) + 0.99 * Math.min(1, Math.max(0, j.fillet ?? 1));   // the blend width, and (as the fraction) how much of it rounds the shape
    for (let m = 0; m < 4; m++) ent[q + 4 + m] = j.members[m] ?? -1;
  }
  const cells = new Float32Array(nCells * 6);
  let ci = 0;
  for (let c = 0; c < NC; c++) {
    if (!segCount[c]) continue;
    cells[ci] = x0 + (c % nx) * CELL; cells[ci + 1] = y0 + Math.floor(c / nx) * CELL;
    cells[ci + 2] = segStart[c]; cells[ci + 3] = segCount[c]; cells[ci + 4] = jStart[c]; cells[ci + 5] = jCount[c];
    ci += 6;
  }
  const out = { ent, rows, cells, nCells, nEnt };
  if (memo) { memo.last = out; memo.key = sameKey; }
  return out;
}
