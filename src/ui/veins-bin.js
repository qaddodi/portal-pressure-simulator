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
 * cells without one) or listing a join, where the moving blood is drawn (veins-gl composite); and `bloodQ` (nBloodQ of them, the
 * same six floats with only the origin used): those cells' quarters (CELL / 2 squares) a lumen can reach, tested as the cells
 * are but against the quarter (review/blood-shading-ideas item 8), every quarter of a cell that lists a join or holds a vessel
 * without a core.
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
  if (!tubes.length) return { ent: new Float32Array(0), rows: 1, cells: new Float32Array(0), nCells: 0, nEnt: 0, blood: new Float32Array(0), nBlood: 0, bloodQ: new Float32Array(0), nBloodQ: 0 };
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
  const moved = [], changed = [];
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
    // (A quarter's centre is HALF / 2 from its corners: a lumen pixel in it within core of a segment puts the segment within
    // core + HALF / 2 of the centre, and then within core + HALF of the cell's centre, so only cells that pass limC2 are tried.)
    const limQ2 = core == null ? Infinity : (Math.min(core, reach) + HALF / 2) ** 2;
    const bc = [];   // (the cells its lumen can reach: see `blood`)
    const bq = [];   // (and their quarters: cell × 4 + quarter, 0 1 above, 2 3 below)
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - y0) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const dd = segDist2(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, ax, ay, bx, by);
        if (dd > lim2) continue;
        push(cy * nx + cx, i);
        if (dd <= limC2) {
          bc.push(cy * nx + cx);
          if (core != null) for (let q = 0; q < 4; q++) {
            if (segDist2(x0 + (cx + 0.25 + 0.5 * (q & 1)) * CELL, y0 + (cy + 0.25 + 0.5 * (q >> 1)) * CELL, ax, ay, bx, by) <= limQ2) bq.push((cy * nx + cx) * 4 + q);
          }
        }
      }
    }
    const n = nSeg, cs = cellOf.slice(0, n), ss = segOf.slice(0, n);
    // (Its lumen's cells must be the same too: a patch keeps the last result's blood cells.)
    if (m && m.reach === reach && m.core === core && m.n === n && cs.every((c, k) => c === m.cs[k]) && ss.every((q, k) => q === m.ss[k]) && sameArr(bc, m.bc) && sameArr(bq, m.bq)) { moved.push(ti); freshMoved++; } else if (m) changed.push({ ti, old: m });
    per[ti] = { n, cs, ss, bc, bq };
    if (memo) memo.set(id, { reach, core, pts: Float64Array.from(pts.flat()), at: Float64Array.from(drawn.flat()), n, cs, ss, bc, bq });
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
  const layoutSame = memo?.last && memo.place && memo.ids === tubes.map((t) => t.id).join(',') &&
    memo.jm === joins.map((j) => j.members.join('.') + (j.trunk != null ? 't' + j.trunk + (j.fork ? 'f' : '') : '')).join(';') && memo.jCell.length === jCell.length && jCell.every((v, k) => v === memo.jCell[k]);
  const sameLayout = layoutSame && !(fresh - freshMoved);
  // (A vessel whose cells changed, in a binning that keeps room in its cells' lists (memo.relay): its entries written again in
  // only the cells it left or entered, when all of them are cells that list something and have room. See relay below.)
  const relayed = !sameLayout && layoutSame && memo.relay && memo.place.cap && changed.length === fresh - freshMoved ? relay(memo, tubes, changed, per, jCell) : null;
  const jv = memo && Float64Array.from(joins.flatMap((j) => [j.x, j.y, j.reach, j.k, j.fillet ?? 1, j.trunk ?? -1, j.fork ? 1 : 0]));
  if (sameLayout || relayed) {
    // Nothing changed since the last call (same vessels, points, reaches and joins): the last result itself, so the caller
    // can skip the upload.
    const jMoved = [];
    for (let ji = 0; ji < joins.length; ji++) for (let f = 0; f < 7; f++) if (jv[ji * 7 + f] !== memo.jv[ji * 7 + f]) { jMoved.push(ji); break; }
    if (!relayed && !moved.length && !jMoved.length) return memo.last;
    // Only moved vessels or joins that keep their cells: the same entries in the same places, so the vessels' points are
    // written over the last result's and their heads and runs fitted again (as below), the joins written again, and only the
    // rows of entries that changed are uploaded again (`patch`: [first row, last row] spans). Entry for entry what a whole
    // binning of the same tubes and joins gives: a coiling collateral was a whole binning of every vessel and a 4 MB upload
    // at every model frame of its coil, for 20–35 s after a patient change or a talk start (round 2 review, G1-3).
    const { ent } = memo.last, { es, hs, js } = memo.place, rowsOf = new Set();
    const mark = (e) => rowsOf.add((e * 2) / ENT_W | 0);
    if (relayed) { for (const e of relayed.touched) mark(e); for (const { ti } of changed) moved.push(ti); }
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
    // (patchTubes: the vessels whose points moved, by id; patchJoins: how many joins were written again, and patchJoinEnts their
    // entries. Every pixel that can change is in a cell that lists one of those vessels or holds one of those entries: a cell is
    // drawn from its own list alone. veins-gl patchGeometry.)
    const patchJoinEnts = [];
    for (const ji of jMoved) patchJoinEnts.push(...js[ji]);
    // (patchRows: those vessels and the joins' members, the rows the figure names to its next draw so that one is made.)
    const patchTubes = moved.map((ti) => tubes[ti].id), patchRows = new Set(patchTubes);
    for (const ji of jMoved) { for (const r of joins[ji].members) patchRows.add(r); if (joins[ji].trunk != null) patchRows.add(joins[ji].trunk); }
    const out = { ...memo.last, patch, patchTubes, patchJoins: jMoved.length, patchJoinEnts, patchRows: [...patchRows], patchCells: relayed ? relayed.cells : [], patchBlood: !!relayed?.blood, ...(relayed?.blood || {}) };
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
  // (With memo.relay each cell keeps room beyond its list, so a vessel that enters or leaves it later is written in place:
  // `cap` entries are reserved, `segCount` are listed, and the joins' entries follow the reserve. Nothing reads past the count.)
  const segCap = memo?.relay ? new Int32Array(NC) : segCount;
  if (memo?.relay) for (let c = 0; c < NC; c++) if (segCount[c]) segCap[c] = segCount[c] + Math.max(2, segCount[c] >> 2);
  let o = 0, nCells = 0;
  for (let c = 0; c < NC; c++) { segStart[c] = o; o += segCap[c]; if (segCount[c]) nCells++; }
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
  const { wet, wetQ } = wetOf(tubes, per, jCell, NC);
  const cells = new Float32Array(nCells * 6), wetAt = [], quarters = [], recOf = memo?.relay ? new Int32Array(NC).fill(-1) : null;
  let ci = 0;
  for (let c = 0; c < NC; c++) {
    if (!segCount[c]) continue;
    if (recOf) recOf[c] = ci / 6;
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
  const out = { ent, rows, cells, nCells, nEnt, blood, nBlood, bloodQ, nBloodQ };
  if (memo) {
    memo.last = out; memo.ids = tubes.map((t) => t.id).join(','); memo.jm = joins.map((j) => j.members.join('.') + (j.trunk != null ? 't' + j.trunk + (j.fork ? 'f' : '') : '')).join(';'); memo.jCell = jCell; memo.jv = jv;
    memo.place = { es: tubes.map((_, ti) => entOf.slice(tFrom[ti], tFrom[ti + 1])), hs, js, cap: memo.relay ? segCap : null, rec: recOf, nx };
  }
  return out;
}

/**
 * The cells (binVeins' `cells`, by their index there) whose join lists hold any of the entries `ents`: a mark per cell (Uint8Array)
 * and how many are marked. A join's entries lie in the join part of a cell's list (first join, count), and those parts follow
 * one another in the cells' order.
 */
export function cellsOfJoinEntries(cells, nCells, ents, mark = new Uint8Array(nCells)) {
  let k = 0;
  for (const e of ents) {
    let lo = 0, hi = nCells - 1, c = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (cells[mid * 6 + 4] <= e) { c = mid; lo = mid + 1; } else hi = mid - 1; }
    // (The last cell whose join part starts at or before e: a cell with no join starts where the next one does, so no cell after the
    // one holding e starts at or before e.)
    if (c >= 0 && e < cells[c * 6 + 4] + cells[c * 6 + 5] && !mark[c]) { mark[c] = 1; k++; }
  }
  return { mark, k };
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

/** The grid cells (and their quarters) a lumen can reach: a flag each. See `blood` in binVeins. */
function wetOf(tubes, per, jCell, NC) {
  const wet = new Uint8Array(NC), wetQ = new Uint8Array(NC * 4);
  for (let ti = 0; ti < tubes.length; ti++) {
    const { n, cs, bc, bq } = per[ti];
    if (tubes[ti].core == null) for (let k = 0; k < n; k++) { wet[cs[k]] = 1; wetQ.fill(1, cs[k] * 4, cs[k] * 4 + 4); }
    else { for (const c of bc) wet[c] = 1; for (const q of bq) wetQ[q] = 1; }
  }
  for (let k = 0; k < jCell.length; k += 2) { wet[jCell[k]] = 1; wetQ.fill(1, jCell[k] * 4, jCell[k] * 4 + 4); }
  return { wet, wetQ };
}

/**
 * A binning kept with room in its cells' lists (memo.relay), updated in place for vessels whose cells changed: each such vessel's
 * entries are taken out of the cells it left and written in the cells it entered (and in the cells where its samples moved between
 * cells), keeping the list's order (by vessel, then sample) and the other vessels' stretches as they were, so the lists hold what a
 * binning of the same tubes gives, cell for cell. `changed`: [{ ti, old (the memo record before this call) }]; `per`: the new
 * (cell, sample) pairs. Returns { cells: the indices of the cell records whose count changed or list was written, touched: entries
 * whose rows must go up again }, or null (nothing written) when a cell it needs has no record, lists nothing after, or has no room, or
 * a vessel's lumen cells (blood) changed, which a full binning handles.
 */
function relay(memo, tubes, changed, per, jCell) {
  const { cap, rec, es, hs } = memo.place, { ent, cells } = memo.last;
  let bloodMoved = false;
  const KEY = 1 << 12;
  const tiOf = new Map(tubes.map((t, ti) => [t.id, ti])), chIdx = new Set(changed.map((c) => c.ti));
  const A = new Set(), fresh = new Map(), newEs = new Map();
  for (const { ti, old } of changed) {
    const p = per[ti];
    if (!sameArr(p.bc, old.bc) || !sameArr(p.bq, old.bq)) bloodMoved = true;
    // (The cells where its pairs differ: a pair (cell, sample) in only one of the two lists puts its cell in A.)
    const was = new Map();
    for (let k = 0; k < old.cs.length; k++) was.set(old.cs[k] * KEY + old.ss[k], k);
    const now = new Set(), by = new Map();
    for (let k = 0; k < p.cs.length; k++) {
      const c = p.cs[k], key = c * KEY + p.ss[k];
      now.add(key);
      let a = by.get(c); if (!a) by.set(c, a = []); a.push(p.ss[k]);
      if (!was.has(key)) A.add(c);
    }
    for (let k = 0; k < old.cs.length; k++) if (!now.has(old.cs[k] * KEY + old.ss[k])) A.add(old.cs[k]);
    fresh.set(ti, by);
    newEs.set(ti, { was, old: es[ti] });
  }
  if (!A.size) return null;
  const inA = new Uint8Array(cap.length);
  for (const c of A) inA[c] = 1;
  // Every vessel's pair indices in the cells of A (ascending: the order of its entries in a cell).
  const ks = new Map();
  for (let ti = 0; ti < tubes.length; ti++) {
    const cs = per[ti].cs;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (!inA[c]) continue;
      let m = ks.get(c); if (!m) ks.set(c, m = new Map());
      let a = m.get(ti); if (!a) m.set(ti, a = []);
      a.push(k);
    }
  }
  const plans = [];
  for (const c of A) {
    const r = rec[c];
    if (r < 0 || !cap[c]) return null;
    const start = cells[r * 6 + 2], count = cells[r * 6 + 3], keep = [], list = [];
    for (let e = start; e < start + count;) {
      let g = e + 1;
      while (g < start + count && ent[g * 8 + 5] !== -1) g++;
      const ti = tiOf.get(ent[e * 8 + 4]);
      if (ti === undefined) return null;
      keep.push({ ti, e0: e, n: g - e });
      if (!chIdx.has(ti)) {
        // (An unchanged vessel's stretch must match its pairs here, or the bookkeeping would not.)
        if ((ks.get(c)?.get(ti)?.length ?? 0) !== g - e - 1) return null;
        list.push({ ti, e0: e, n: g - e });
      }
      e = g;
    }
    for (const [ti, by] of fresh) { const a = by.get(c); if (a) list.push({ ti, samples: a, n: 1 + a.length }); }
    list.sort((a, b) => a.ti - b.ti);
    let total = 0;
    for (const x of list) total += x.n;
    if (!total || total > cap[c]) return null;
    // The cell's new list, written to a copy.
    const tmp = new Float32Array(cap[c] * 8);
    let pos = 0;
    for (const x of list) {
      if (x.e0 != null) tmp.set(ent.subarray(x.e0 * 8, (x.e0 + x.n) * 8), pos * 8);
      else {
        const t = tubes[x.ti], h = pos;
        tmp[h * 8 + 4] = t.id; tmp[h * 8 + 5] = -1; tmp[h * 8 + 7] = x.samples.length;
        x.samples.forEach((i, j) => { const a = t.pts[i], b = t.pts[i + 1], q = (h + 1 + j) * 8; tmp[q] = a[0]; tmp[q + 1] = a[1]; tmp[q + 2] = b[0]; tmp[q + 3] = b[1]; tmp[q + 4] = t.id; tmp[q + 5] = i; });
        fitStretch(tmp, h);
      }
      x.at = pos;
      pos += x.n;
    }
    plans.push({ c, r, start, keep, list, total, tmp });
  }
  // Each changed vessel's entries outside A are where they were: found by their (cell, sample) in the old pairs.
  for (const { ti } of changed) {
    const p = per[ti], { was, old } = newEs.get(ti), out = new Int32Array(p.cs.length);
    for (let k = 0; k < out.length; k++) {
      if (inA[p.cs[k]]) continue;
      const k0 = was.get(p.cs[k] * KEY + p.ss[k]);
      if (k0 === undefined) return null;
      out[k] = old[k0];
    }
    newEs.get(ti).out = out;
  }
  // Written: nothing below can fail.
  const gone = new Set(), heads = new Map(), touched = [], recs = [];
  for (const { c, r, start, keep, list, total, tmp } of plans) {
    ent.set(tmp, start * 8);
    cells[r * 6 + 3] = total;
    recs.push(r);
    touched.push(start, start + cap[c] - 1);
    for (const x of keep) gone.add(x.e0);
    for (const x of list) {
      const h = start + x.at;
      let a = heads.get(x.ti); if (!a) heads.set(x.ti, a = []);
      a.push(h);
      const kk = ks.get(c).get(x.ti), out = newEs.get(x.ti)?.out || es[x.ti];
      for (let j = 0; j < kk.length; j++) out[kk[j]] = h + 1 + j;
    }
    for (const x of keep) if (!heads.has(x.ti)) heads.set(x.ti, []);
  }
  for (const [ti, news] of heads) hs[ti] = hs[ti].filter((h) => !gone.has(h)).concat(news);
  for (const [ti, v] of newEs) es[ti] = v.out;
  // The blood's squares, where a lumen's cells changed: made again from the flags, in the cells' order (the rows are copies of the
  // cells' own).
  let blood = null;
  if (bloodMoved) {
    const { wet, wetQ } = wetOf(tubes, per, jCell, cap.length), wetAt = [], quarters = [];
    for (let c = 0, r = 0; c < cap.length; c++) {
      if (rec[c] < 0) continue;
      const ci = r++ * 6;
      if (wet[c]) wetAt.push(ci);
      for (let q = 0; q < 4; q++) if (wetQ[c * 4 + q]) quarters.push(cells[ci] + (q & 1) * (CELL / 2), cells[ci + 1] + (q >> 1) * (CELL / 2));
    }
    const nBlood = wetAt.length, rows = new Float32Array(nBlood * 6);
    wetAt.forEach((at, b) => rows.set(cells.subarray(at, at + 6), b * 6));
    const nBloodQ = quarters.length / 2, rowsQ = new Float32Array(nBloodQ * 6);
    for (let k = 0; k < nBloodQ; k++) { rowsQ[k * 6] = quarters[k * 2]; rowsQ[k * 6 + 1] = quarters[k * 2 + 1]; }
    blood = { blood: rows, nBlood, bloodQ: rowsQ, nBloodQ };
  }
  return { cells: recs, touched, blood };
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
