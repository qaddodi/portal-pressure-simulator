// The vector renderer's persistent vessel graph (docs/recommendations/vector-renderer-plan.md section 3; workstream A). One record a vessel row,
// kept: its centreline (N_SAMPLES points), its radius along the course, its tier / depth / flags / casing / glow / selection / hover, and the
// joins ("connected here": members, trunk, fork, fillet) the binning holds. CPU only, no GL, nothing drawn here.
//
// Where it comes from (the same inputs veins-gl already receives, so nothing upstream changes):
//   fromBins(bins, nTubes)  the binned entries (setGeometry): the points by pointsFromEntries, the joins by joinEntryList + patchGroups
//   patch(bins)             a binning patched in place (patchGeometry): the rows whose points moved, the joins whose numbers moved
//   attrs(tubeNow)          the tube attribute array (setTubes, 13 texels × 4 floats a row), read in place
//   radii(radAll)           the radius mirror (setRadii: N_SAMPLES × 4 floats a row, r[i] first), read in place
// Each call returns the rows it changed (a kept list, g.list / g.n), so the compiler (vec-compile.js) recompiles only those. Nothing allocates
// on a repeated call: arrays are made on the first call and grown only when too small (`// alloc-rare:`).
import { pointsFromEntries, joinEntryList, patchGroups, TUBE_FLOATS, F_SHADOW } from './veins-mesh-data.js';
import { N_SAMPLES, N_QUADS } from './veins-mesh.js';

// Tube attribute floats (veins-gl.js, the layout above TUBE_TEXELS: texel t, component c is float 4 t + c).
export const A_CASING = 3, A_ALPHA = 7, A_TIER = 8, A_Z = 9, A_FLAGS = 10, A_HOVER = 39, A_GLOW = 43, A_GLOW_W = 47, A_SEL = 48;
export { TUBE_FLOATS, F_SHADOW };
export const MAX_TIERS = 20;
/** Largest member count of one join entry (veins-bin writeJoin). */
export const JOIN_MEMBERS = 4;

const tierOf = (v) => { const t = Math.floor(v + 0.5); return t < 0 ? 0 : t >= MAX_TIERS ? MAX_TIERS - 1 : t; };

export function createVecGraph() {
  const g = {
    nRows: 0,
    /** Per row, N_SAMPLES points (x, y): row r point i at pts[(r * N_SAMPLES + i) * 2]. */
    pts: new Float32Array(0),
    /** Per row, the lumen radius at each sample: rad[r * N_SAMPLES + i]. */
    rad: new Float32Array(0),
    /** Per row, whether segment i (points i, i + 1) is in the binning: seg[r * N_QUADS + i] (a row with all of them is whole; none: the row is off). */
    seg: new Uint8Array(0),
    rows: [],               // the records, one a row (kept, written in place)
    joins: { n: 0, x: new Float32Array(0), y: new Float32Array(0), reach: new Float32Array(0), k: new Float32Array(0), fillet: new Float32Array(0),
      mem: new Int32Array(0), trunk: new Int32Array(0), fork: new Uint8Array(0) },
    list: new Int32Array(0), n: 0,         // the rows the last call changed
    jlist: new Int32Array(0), nj: 0,       // the joins the last fromBins / patch read with numbers or members different from before
    version: 0,
    fromBins, patch, attrs, radii,
  };
  const pe = {}, jl = {}, jg = {};         // pointsFromEntries' / joinEntryList's / patchGroups' kept outputs
  const seenRow = { mark: new Uint8Array(0) };
  let joinKey = new Float32Array(0);        // the joins as last read, 12 floats each (x, y, reach, w, members × 4, then trunk, fork), to tell what moved

  function size(nRows) {
    if (g.pts.length < nRows * N_SAMPLES * 2) {
      g.pts = new Float32Array(nRows * N_SAMPLES * 2);   // alloc-rare: grown with the vessel rows
      g.rad = new Float32Array(nRows * N_SAMPLES);       // alloc-rare: as above
      g.seg = new Uint8Array(nRows * N_QUADS);           // alloc-rare: as above
    }
    if (g.list.length < nRows) g.list = new Int32Array(nRows);   // alloc-rare: as above
    if (seenRow.mark.length < nRows) seenRow.mark = new Uint8Array(nRows);   // alloc-rare: as above
    while (g.rows.length < nRows) {
      const r = g.rows.length;
      g.rows.push({   // alloc-rare: one record a vessel row, made once
        row: r, on: 0, tier: 0, z: 0, flags: 0, casing: 0, alpha: 1, glow: 0, glowW: 0, sel: 0, hover: 0, rmax: 0, rmin: 0,
        pts: null, rad: null,
      });
    }
    for (let r = 0; r < nRows; r++) {
      const rec = g.rows[r];
      if (!rec.pts || rec.pts.buffer !== g.pts.buffer) { rec.pts = g.pts.subarray(r * N_SAMPLES * 2, (r + 1) * N_SAMPLES * 2); rec.rad = g.rad.subarray(r * N_SAMPLES, (r + 1) * N_SAMPLES); }   // alloc-rare: views, made with the arrays
    }
    g.nRows = nRows;
  }

  // Reads the points out of the binning into g.pts. fresh: every row counts as changed. Returns nothing; g.list / g.n hold the changed rows.
  function readPoints(bins, nRows, fresh) {
    pointsFromEntries(bins.ent, bins.cells, bins.nCells, nRows, pe);
    const P = pe.pts;
    let n = 0;
    for (let r = 0; r < nRows; r++) {
      const rec = g.rows[r], on = pe.on[r];
      let diff = fresh || rec.on !== on;
      const o = r * N_SAMPLES * 2;
      for (let i = 0; i < N_SAMPLES; i++) {
        const a = (r * (N_SAMPLES / 2) + (i >> 1)) * 4 + (i & 1) * 2, x = on ? P[a] : 0, y = on ? P[a + 1] : 0;
        if (g.pts[o + 2 * i] !== x || g.pts[o + 2 * i + 1] !== y) { diff = true; g.pts[o + 2 * i] = x; g.pts[o + 2 * i + 1] = y; }
      }
      for (let i = 0; i < N_QUADS; i++) {
        const v = on ? pe.seen[r * N_QUADS + i] : 0;
        if (g.seg[r * N_QUADS + i] !== v) { diff = true; g.seg[r * N_QUADS + i] = v; }
      }
      rec.on = on;
      if (diff) g.list[n++] = r;
    }
    g.n = n;
  }

  // The joins out of the binning: patchGroups' unique joins (repeats of a join in every cell it reaches, and joins with no reach or no member, left out).
  // Returns the count of joins whose numbers differ from the last read (all of them when `fresh`), their indices appended to `moved`.
  function readJoins(bins, fresh) {
    const list = joinEntryList(bins.cells, bins.nCells, jl);
    patchGroups(bins.ent, list, jg, -1);
    const J = g.joins, n = jg.j.length / 8;
    if (J.x.length < n) {   // alloc-rare: grown with the joins
      J.x = new Float32Array(n); J.y = new Float32Array(n); J.reach = new Float32Array(n); J.k = new Float32Array(n); J.fillet = new Float32Array(n);
      J.mem = new Int32Array(n * JOIN_MEMBERS); J.trunk = new Int32Array(n); J.fork = new Uint8Array(n);
    }
    if (joinKey.length < n * 12) joinKey = new Float32Array(n * 12);   // alloc-rare: as above
    if (g.jlist.length < n) g.jlist = new Int32Array(n);   // alloc-rare: as above
    g.nj = 0;
    const sameCount = !fresh && n === J.n;
    for (let j = 0; j < n; j++) {
      const q = j * 8, w = jg.j[q + 3], I = Math.floor(w);
      J.x[j] = jg.j[q]; J.y[j] = jg.j[q + 1]; J.reach[j] = jg.j[q + 2];
      J.k[j] = I / 100; J.fillet[j] = Math.min(1, Math.max(0, (w - I) / 0.99));
      let trunk = -1, fork = 0;
      for (let m = 0; m < JOIN_MEMBERS; m++) {
        const v = jg.j[q + 4 + m];
        if (!(v > -0.5)) { J.mem[j * JOIN_MEMBERS + m] = -1; continue; }
        const row = Math.floor(v + 0.5);
        J.mem[j * JOIN_MEMBERS + m] = row;
        if (v - row > 0.1) { trunk = row; fork = v - row > 0.3 ? 1 : 0; }
      }
      J.trunk[j] = trunk; J.fork[j] = fork;
      const key = j * 12;
      let diff = !sameCount;
      for (let f = 0; f < 8; f++) { const v = jg.j[q + f]; if (joinKey[key + f] !== v) { diff = true; joinKey[key + f] = v; } }
      if (diff) g.jlist[g.nj++] = j;
    }
    J.n = n;
    return g.nj > 0;
  }

  /**
   * A whole binning (veins-gl setGeometry): the graph is made again from it. Returns the graph. g.list / g.n: every row with points.
   * `moved` (g.joinsMoved) is set: the joins read this time differ from the last.
   */
  function fromBins(bins, nTubes) {
    size(nTubes);
    for (let r = 0; r < nTubes; r++) { const rec = g.rows[r]; rec.on = 0; }
    readPoints(bins, nTubes, true);
    g.joinsMoved = readJoins(bins, true);
    g.version++;
    return g;
  }

  /**
   * A binning patched in place (veins-gl patchGeometry: the same ent / cells, entries written over). Compares with what the graph holds:
   * g.list / g.n the rows whose points moved, and g.joinsMoved whether any join's numbers or members changed (then the compiler recompiles
   * every member's row: g.joinRows / g.nJoinRows).
   */
  function patch(bins) {
    if (!g.nRows) return g;
    readPoints(bins, g.nRows, false);
    const was = g.joins.n;
    g.joinsMoved = readJoins(bins, false);
    g.version++;
    void was;
    return g;
  }

  /** The tube attribute array, read in place (veins-gl tubeNow / setTubes). Writes each record's fields; g.list / g.n the rows whose tier, casing or flags changed (what a compile reads). */
  function attrs(tube) {
    let n = 0;
    const nRows = Math.min(g.nRows, Math.floor(tube.length / TUBE_FLOATS));
    for (let r = 0; r < nRows; r++) {
      const rec = g.rows[r], o = r * TUBE_FLOATS;
      const tier = tierOf(tube[o + A_TIER]), casing = tube[o + A_CASING], flags = Math.floor(tube[o + A_FLAGS] + 0.5);
      if (tier !== rec.tier || casing !== rec.casing) g.list[n++] = r;   // (a tier or a casing is what a compile reads; the flags and the rest are the shader's)
      rec.tier = tier; rec.casing = casing; rec.flags = flags; rec.z = tube[o + A_Z]; rec.alpha = tube[o + A_ALPHA];
      rec.glow = tube[o + A_GLOW]; rec.glowW = tube[o + A_GLOW_W]; rec.sel = tube[o + A_SEL]; rec.hover = tube[o + A_HOVER];
    }
    g.n = n;
    return g;
  }

  /** The radius mirror (veins-gl radAll: N_SAMPLES × 4 floats a row, r[i] first), read in place. g.list / g.n the rows whose radii changed. */
  function radii(radAll) {
    let n = 0;
    const nRows = Math.min(g.nRows, Math.floor(radAll.length / (N_SAMPLES * 4)));
    for (let r = 0; r < nRows; r++) {
      const rec = g.rows[r], o = r * N_SAMPLES * 4, d = r * N_SAMPLES;
      let diff = false, mx = 0, mn = Infinity;
      for (let i = 0; i < N_SAMPLES; i++) {
        const v = radAll[o + i * 4];
        if (g.rad[d + i] !== v) { diff = true; g.rad[d + i] = v; }
        if (v > mx) mx = v;
        if (v < mn) mn = v;
      }
      rec.rmax = mx; rec.rmin = mn === Infinity ? 0 : mn;
      if (diff) g.list[n++] = r;
    }
    g.n = n;
    return g;
  }

  g.joinsMoved = false;
  return g;
}
