// Vessel binning for the WebGL vessels (veins-gl.js): which vessel samples and joins can draw in each square cell of the
// figure. Kept apart from the renderer so it runs (and is tested) without a page.

export const CELL = 16;                       // cell size, world units
export const ENT_W = 2048;                    // texels per row of the entry texture
export const RUN = 4;                         // segments of one vessel per run (see the runs below)

// Squared distance from point (px, py) to segment a→b. (Squared throughout the binning, with one square root per run at
// the end: Math.hypot was most of a re-bin's time, 13–21 ms a call while a collateral coils after a patient change or a
// talk start; round 2 review, P3.)
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  const ex = ax + dx * h - px, ey = ay + dy * h - py;
  return ex * ex + ey * ey;
}
const d2 = (x, y) => x * x + y * y;

/**
 * Bins vessels into cells. `tubes`: [{ id (row), pts: [[x, y]] × N_SAMPLES, reach, core, bin }] where reach
 * is how far from the centerline the vessel can draw (radius, casing, shadow, fillet, glow), and `core` (optional) how far its
 * lumen can reach (at most `reach`);
 * `joins`: [{ x, y, reach, k, members: [row, …] (≤ 4), trunk?: row, fork?: bool }] (trunk: the member the others' ends lie on, when
 * one of them is; fork: it runs on into the rest of its course at this join). Returns the entry texels and the cells,
 * and `blood`: the cells (as `cells`, nBlood of them) a lumen can reach, those within `core` of a vessel (all of a vessel's
 * cells without one) or listing a join, where the moving blood is drawn (veins-gl composite).
 * `bin` (optional): other points, within `reach` less the vessel's own of `pts` at every sample, that the cells are
 * tested against instead (a coiling vessel's points when its coil began: see stage.js syncVeins).
 */
const same2 = (P, F) => F.length === P.length * 2 && P.every((q, i) => q[0] === F[i * 2] && q[1] === F[i * 2 + 1]);
const sameArr = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
export function binVeins(tubes, joins, memo = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tubes) {
    const P = t.bin || t.pts, r = t.reach;
    for (let i = 0; i < P.length; i++) { const x = P[i][0], y = P[i][1]; x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  }
  if (!tubes.length) return { ent: new Float32Array(0), rows: 1, cells: new Float32Array(0), nCells: 0, nEnt: 0, blood: new Float32Array(0), nBlood: 0 };
  x0 = Math.floor(x0 / CELL) * CELL; y0 = Math.floor(y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const HALF = CELL * Math.SQRT1_2;
  // Pass 1: each vessel's (cell, sample) pairs, in order of sample (see the triples below).
  let cap = 1 << 12, nSeg = 0, cellOf = new Int32Array(cap), segOf = new Int32Array(cap);
  const push = (c, i) => {
    if (nSeg === cap) {
      cap *= 2;
      const grow = (a) => { const b = new Int32Array(cap); b.set(a); return b; };
      cellOf = grow(cellOf); segOf = grow(segOf);
    }
    cellOf[nSeg] = c; segOf[nSeg] = i; nSeg++;
  };
  // (memo: a Map kept by the caller. A vessel whose points and reach are the same as last time, on the same grid, reuses
  // its (cell, sample) pairs instead of testing every cell again; the result is the same, entry for entry.)
  const grid = `${x0},${y0},${nx},${ny}`;
  if (memo && memo.grid !== grid) { memo.clear(); memo.grid = grid; memo.last = null; memo.place = null; }
  let fresh = 0, freshMoved = 0;
  // (The vessels whose points moved without changing which cells list which of their segments: a collateral coiling, tested
  // against its points when the coil began. When they are all that changed, the last result is patched in place: see below.)
  const moved = [];
  const per = new Array(tubes.length);
  for (let ti = 0; ti < tubes.length; ti++) {
    const { id, pts: drawn, reach, core } = tubes[ti], pts = tubes[ti].bin || drawn;
    const m = memo?.get(id);
    if (m && m.reach === reach && m.core === core && same2(pts, m.pts)) {
      per[ti] = m;
      if (!same2(drawn, m.at)) { moved.push(ti); m.at = Float64Array.from(drawn.flat()); }
      continue;
    }
    nSeg = 0;
    fresh++;
    const lim2 = (reach + HALF) ** 2, limC2 = core == null ? Infinity : (Math.min(core, reach) + HALF) ** 2;
    const bc = [];   // (the cells its lumen can reach: see `blood`)
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - y0) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const dd = segDist2(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, ax, ay, bx, by);
        if (dd > lim2) continue;
        push(cy * nx + cx, i);
        if (dd <= limC2) bc.push(cy * nx + cx);
      }
    }
    const n = nSeg, cs = cellOf.slice(0, n), ss = segOf.slice(0, n);
    // (Its lumen's cells must be the same too: a patch keeps the last result's blood cells.)
    if (m && m.reach === reach && m.core === core && m.n === n && cs.every((c, k) => c === m.cs[k]) && ss.every((q, k) => q === m.ss[k]) && sameArr(bc, m.bc)) { moved.push(ti); freshMoved++; }
    per[ti] = { n, cs, ss, bc };
    if (memo) memo.set(id, { reach, core, pts: Float64Array.from(pts.flat()), at: Float64Array.from(drawn.flat()), n, cs, ss, bc });
  }
  const jCell = [];
  joins.forEach((j, ji) => {
    const cx0 = Math.max(0, Math.floor((j.x - j.reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((j.x + j.reach - x0) / CELL));
    const cy0 = Math.max(0, Math.floor((j.y - j.reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((j.y + j.reach - y0) / CELL));
    const lim2 = (j.reach + HALF) ** 2;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (d2(x0 + (cx + 0.5) * CELL - j.x, y0 + (cy + 0.5) * CELL - j.y) > lim2) continue;
      jCell.push(cy * nx + cx, ji);
    }
  });
  // The layout (which entries go where) is the last result's when the vessels are the same, each lists the same segments
  // in the same cells, and each join has the same members and cells; then only values in entries can have changed.
  const sameLayout = memo?.last && memo.place && !(fresh - freshMoved) && memo.ids === tubes.map((t) => t.id).join(',') &&
    memo.jm === joins.map((j) => j.members.join('.') + (j.trunk != null ? 't' + j.trunk + (j.fork ? 'f' : '') : '')).join(';') && memo.jCell.length === jCell.length && jCell.every((v, k) => v === memo.jCell[k]);
  const jv = memo && Float64Array.from(joins.flatMap((j) => [j.x, j.y, j.reach, j.k, j.fillet ?? 1, j.trunk ?? -1, j.fork ? 1 : 0]));
  if (sameLayout) {
    // Nothing changed since the last call (same vessels, points, reaches and joins): the last result itself, so the caller
    // can skip the upload.
    const jMoved = [];
    for (let ji = 0; ji < joins.length; ji++) for (let f = 0; f < 7; f++) if (jv[ji * 7 + f] !== memo.jv[ji * 7 + f]) { jMoved.push(ji); break; }
    if (!moved.length && !jMoved.length) return memo.last;
    // Only moved vessels or joins that keep their cells: the same entries in the same places, so the vessels' points are
    // written over the last result's and their heads and runs fitted again (as below), the joins written again, and only the
    // rows of entries that changed are uploaded again (`patch`: [first row, last row] spans). Entry for entry what a whole
    // binning of the same tubes and joins gives: a coiling collateral was a whole binning of every vessel and a 4 MB upload
    // at every model frame of its coil, for 20–35 s after a patient change or a talk start (round 2 review, G1-3).
    const { ent } = memo.last, { es, hs, js } = memo.place, rowsOf = new Set();
    const mark = (e) => rowsOf.add((e * 2) / ENT_W | 0);
    for (const ti of moved) {
      const t = tubes[ti], E = es[ti], segs = memo.get(t.id).ss;
      for (let k = 0; k < E.length; k++) {
        const q = E[k] * 8, a = t.pts[segs[k]], b = t.pts[segs[k] + 1];
        ent[q] = a[0]; ent[q + 1] = a[1]; ent[q + 2] = b[0]; ent[q + 3] = b[1];
        mark(E[k]);
      }
      for (const h of hs[ti]) { fitStretch(ent, h); mark(h); }
    }
    for (const ji of jMoved) for (const e of js[ji]) { writeJoin(ent, e, joins[ji]); mark(e); }
    const rs = [...rowsOf].sort((a, b) => a - b), patch = [];
    for (const r of rs) { if (patch.length && patch[patch.length - 1][1] === r - 1) patch[patch.length - 1][1] = r; else patch.push([r, r]); }
    const out = { ...memo.last, patch };
    memo.last = out; memo.jv = jv;
    return out;
  }
  // The (cell, tube, sample) triples in vessel-major order, so a cell's list stays grouped by vessel.
  const tFrom = new Int32Array(tubes.length + 1);
  for (let ti = 0; ti < tubes.length; ti++) tFrom[ti + 1] = tFrom[ti] + per[ti].n;
  nSeg = tFrom[tubes.length];
  cellOf = new Int32Array(nSeg); segOf = new Int32Array(nSeg);
  const tubeOf = new Int32Array(nSeg);
  for (let ti = 0; ti < tubes.length; ti++) { const { n, cs, ss } = per[ti]; cellOf.set(n === cs.length ? cs : cs.subarray(0, n), tFrom[ti]); segOf.set(n === ss.length ? ss : ss.subarray(0, n), tFrom[ti]); tubeOf.fill(ti, tFrom[ti], tFrom[ti + 1]); }
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
  // (Where each vessel's entries and heads went, for a later patch: memo.place.)
  const entOf = memo ? new Int32Array(nSeg) : null, hs = memo ? tubes.map(() => []) : null;
  lastId.fill(-Infinity);
  for (let k = 0; k < nSeg; k++) {
    const c = cellOf[k], t = tubes[tubeOf[k]];
    if (lastId[c] !== t.id) { lastId[c] = t.id; const h = fillS[c]++; ent[h * 8 + 4] = t.id; ent[h * 8 + 5] = -1; hs?.[tubeOf[k]].push(h); }
    const e = fillS[c]++, i = segOf[k], a = t.pts[i], b = t.pts[i + 1], q = e * 8;
    if (entOf) entOf[k] = e;
    ent[q] = a[0]; ent[q + 1] = a[1]; ent[q + 2] = b[0]; ent[q + 3] = b[1];
    ent[q + 4] = t.id; ent[q + 5] = i;
  }
  // Each vessel's stretch of a cell's list starts with a head entry: a circle (centre, radius) holding every point of the
  // stretch, and the stretch's length (segment index -1 marks it), so the shader can pass over a vessel that lies wholly
  // out of reach of a pixel. Then the stretch in runs of up to RUN segments: the run's first entry holds (in its two spare
  // floats) a radius around its start that holds every point of the run, and the run's length, so the shader can pass
  // over a run that lies wholly too far away to change anything (veins-gl).
  for (let c = 0; c < NC; c++) {
    const e1 = segStart[c] + segCount[c];
    for (let e = segStart[c]; e < e1;) {
      // (A head entry; its stretch runs on until the vessel changes, a head, or the end of the cell's list.)
      const id = ent[e * 8 + 4];
      let g = e + 1;
      while (g < e1 && ent[g * 8 + 4] === id && ent[g * 8 + 5] !== -1) g++;
      ent[e * 8 + 7] = g - e - 1;
      fitStretch(ent, e);
      e = g;
    }
  }
  const js = memo ? joins.map(() => []) : null;
  for (let k = 0; k < jCell.length; k += 2) {
    const c = jCell[k];
    if (!segCount[c]) continue;
    const e = fillJ[c]++;
    writeJoin(ent, e, joins[jCell[k + 1]]);
    js?.[jCell[k + 1]].push(e);
  }
  // The cells a lumen can reach: within a vessel's core, or listing a join (its fillet and the lower tier's copy swell the
  // lumens there). Elsewhere a cell draws only casings, shadows and the plate, which the moving blood never changes.
  const wet = new Uint8Array(NC);
  for (let ti = 0; ti < tubes.length; ti++) {
    const { n, cs, bc } = per[ti];
    if (tubes[ti].core == null) for (let k = 0; k < n; k++) wet[cs[k]] = 1;
    else for (const c of bc) wet[c] = 1;
  }
  for (let k = 0; k < jCell.length; k += 2) wet[jCell[k]] = 1;
  const cells = new Float32Array(nCells * 6), wetAt = [];
  let ci = 0;
  for (let c = 0; c < NC; c++) {
    if (!segCount[c]) continue;
    cells[ci] = x0 + (c % nx) * CELL; cells[ci + 1] = y0 + Math.floor(c / nx) * CELL;
    cells[ci + 2] = segStart[c]; cells[ci + 3] = segCount[c]; cells[ci + 4] = jStart[c]; cells[ci + 5] = jCount[c];
    if (wet[c]) wetAt.push(ci);
    ci += 6;
  }
  const nBlood = wetAt.length, blood = new Float32Array(nBlood * 6);
  wetAt.forEach((at, b) => blood.set(cells.subarray(at, at + 6), b * 6));
  const out = { ent, rows, cells, nCells, nEnt, blood, nBlood };
  if (memo) {
    memo.last = out; memo.ids = tubes.map((t) => t.id).join(','); memo.jm = joins.map((j) => j.members.join('.') + (j.trunk != null ? 't' + j.trunk + (j.fork ? 'f' : '') : '')).join(';'); memo.jCell = jCell; memo.jv = jv;
    memo.place = { es: tubes.map((_, ti) => entOf.slice(tFrom[ti], tFrom[ti + 1])), hs, js };
  }
  return out;
}

// ── Cells the simple vessel program can draw ──
// A cell whose list holds one vessel (one head entry: a cell's list is grouped by vessel, one head per vessel, see above)
// and no join: the vessel program's slots, tier order and join work can only ever see that one vessel there, so a program
// built for one vessel and no join (veins-gl, MAXS 1) draws the cell exactly as the general one does. Decided from the
// cell's own list alone, never from how the vessels look: a vessel crossing itself is still one vessel (its nearest
// segment wins in its one slot, as in the general program), and any join, even one whose members are elsewhere, keeps
// the cell general. `cells`: binVeins' cells (6 floats each: origin, first entry, count, first join, count).
export function simpleCells(cells, nCells, ent) {
  const out = new Uint8Array(nCells);
  for (let c = 0; c < nCells; c++) {
    const s0 = cells[c * 6 + 2], n = cells[c * 6 + 3];
    if (cells[c * 6 + 5] !== 0 || n < 2) continue;
    let heads = 0;
    for (let e = s0; e < s0 + n && heads < 2; e++) if (ent[e * 8 + 5] === -1) heads++;
    out[c] = heads === 1 ? 1 : 0;
  }
  return out;
}

/**
 * The cells (all, or those marked in `mark`, a Uint8Array per cell) in two lists, each in the cells' own order: `gen`, for
 * the general vessel program, and `one`, the cells flagged in `simple` (simpleCells; null: none), for the one-vessel build.
 * Every cell given lands in exactly one of them.
 */
export function splitCells(cells, nCells, simple, mark = null) {
  let g = 0, o = 0;
  for (let c = 0; c < nCells; c++) if (!mark || mark[c]) { if (simple?.[c]) o++; else g++; }
  const gen = new Float32Array(g * 6), one = new Float32Array(o * 6);
  for (let c = 0, i = 0, j = 0; c < nCells; c++) {
    if (mark && !mark[c]) continue;
    const at = cells.subarray(c * 6, c * 6 + 6);
    if (simple?.[c]) { one.set(at, j); j += 6; } else { gen.set(at, i); i += 6; }
  }
  return { gen, one, nGen: g, nOne: o };
}

function writeJoin(ent, e, j) {
  const q = e * 8;
  ent[q] = j.x; ent[q + 1] = j.y; ent[q + 2] = j.reach; ent[q + 3] = Math.round(j.k * 100) + 0.99 * Math.min(1, Math.max(0, j.fillet ?? 1));   // the blend width, and (as the fraction) how much of it rounds the shape
  // (A member that is the trunk the others end on has a quarter added to its row, three eighths at a fork, where it runs on into
  // the rest of its course: the shader reads the row as int(v + 0.5).)
  for (let m = 0; m < 4; m++) ent[q + 4 + m] = j.members[m] == null ? -1 : j.members[m] + (j.trunk === j.members[m] ? (j.fork ? 0.375 : 0.25) : 0);
}

// A radius that holds every point measured, nudged past float32 rounding (the shader reads it as float32).
const up = (r) => (Math.fround(r) < r ? r * (1 + 1e-6) + 1e-6 : r);
// Fits one stretch of a cell's list: its head `h` (whose stretch length, float 7, is set) and its runs, from the points in
// its entries (see binVeins).
function fitStretch(ent, h) {
  const g = h + 1 + ent[h * 8 + 7];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let f = h + 1; f < g; f++) {
    const q = f * 8;
    bx0 = Math.min(bx0, ent[q], ent[q + 2]); bx1 = Math.max(bx1, ent[q], ent[q + 2]);
    by0 = Math.min(by0, ent[q + 1], ent[q + 3]); by1 = Math.max(by1, ent[q + 1], ent[q + 3]);
  }
  const cx = Math.fround((bx0 + bx1) / 2), cy = Math.fround((by0 + by1) / 2);
  let R2 = 0;
  for (let f = h + 1; f < g; f++) { const q = f * 8; R2 = Math.max(R2, d2(ent[q] - cx, ent[q + 1] - cy), d2(ent[q + 2] - cx, ent[q + 3] - cy)); }
  ent[h * 8] = cx; ent[h * 8 + 1] = cy; ent[h * 8 + 2] = up(Math.sqrt(R2));
  for (let e = h + 1; e < g;) {
    const q0 = e * 8, ax = ent[q0], ay = ent[q0 + 1], n = Math.min(RUN, g - e);
    let rho2 = 0;
    for (let k = 0; k < n; k++) { const q = (e + k) * 8; rho2 = Math.max(rho2, d2(ent[q] - ax, ent[q + 1] - ay), d2(ent[q + 2] - ax, ent[q + 3] - ay)); }
    ent[q0 + 6] = up(Math.sqrt(rho2)); ent[q0 + 7] = n;
    e += n;
  }
}

// ── What a vessel's new attributes change in the drawn layer ──
// A vessel row (see veins-gl's tube layout) whose attributes changed since the vessel layer was drawn in its two lumen
// colours alone (texels 0 and 1, rgb: floats 0–2 and 4–6) changes only the pixels that colour reaches: its shape,
// casing, alpha, flags, glow and every other attribute are as drawn, so every pixel's blending weights are too. Such a
// row is recoloured (veins-gl tintPass); any other change draws its cells again whole (cellsPass).
export const TINT_FLOATS = [0, 1, 2, 4, 5, 6];
const TINT = new Set(TINT_FLOATS);

/**
 * Sorts the changed `rows` by what changed since `drawn` (the attributes the layer shows; null: unknown): `tint`, rows
 * whose lumen colours alone changed; `shape`, rows with any other change, or with new radii (`fixed`, a Set), or any
 * row when nothing is known of the drawn layer. A row with nothing changed is in neither. `width`: floats per row.
 */
export function splitRows(rows, now, drawn, width, fixed = null) {
  const shape = [], tint = [];
  for (const r of rows) {
    if (!drawn || fixed?.has(r)) { shape.push(r); continue; }
    const o = r * width;
    let kind = 0;   // 0 nothing, 1 the colours alone, 2 anything else
    for (let i = 0; i < width && kind < 2; i++) if (!Object.is(now[o + i], drawn[o + i])) kind = TINT.has(i) ? 1 : 2;
    if (kind === 2) shape.push(r);
    else if (kind === 1) tint.push(r);
  }
  return { shape, tint };
}
