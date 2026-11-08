// The vessel mesh renderer's data builders (8 Nov 2026, docs/veins-mesh-plan.md): pure JS, no GL. They turn what the vessel renderer
// already holds (the binned segment entries, the tube attributes, the join patches) into what the mesh passes draw from: each row's
// centreline points, the rows grouped by tier with the tier's flags, and the join patches grouped by tier.
// None of them allocates on a repeated call: every output is an object or typed array the caller keeps (`out`), made on the first call and
// grown only when too small, and each such growth is marked `// alloc-rare: <reason>`.
import { ENT_W } from './veins-bin.js';
import { N_SAMPLES, N_QUADS } from './veins-mesh.js';

export const MAX_TIERS = 20;           // as veins-gl (kept here so this file imports no GL code)
export const F_SHADOW = 4;             // as veins-gl
export const TUBE_FLOATS = 52;         // 13 texels of 4 floats a row (veins-gl TUBE_TEXELS)
const T_ALPHA = 7, T_TIER = 8, T_FLAGS = 10, T_GLOW = 43, T_GLOW_W = 47, T_SEL = 48;
const UP_GLOW = 5;                     // a glow width over this is an "up" glow (the group's, drawn after the whole group)
const TEXELS_ROW = N_SAMPLES / 2;      // texels a row's points take (two points a texel)

const tierOf = (tube, o) => { const t = Math.floor(tube[o + T_TIER] + 0.5); return t < 0 ? 0 : t >= MAX_TIERS ? MAX_TIERS - 1 : t; };

/**
 * Each row's N_SAMPLES centreline points, rebuilt from the binned segment entries (veins-bin: an entry is 8 floats, A = ent[e*8 .. +3],
 * B = ent[e*8+4 .. +7]; a segment entry has B.x the row, B.y the segment index i >= 0, A.xy point i and A.zw point i + 1; a head has
 * B.y = -1 and is skipped). A cell record is 6 floats: x, y, segStart, segCount, joinStart, joinCount. A segment listed in several cells
 * is written once over (the same values). Points are laid as veins-sweep writePoints lays them with posBase 0: row r, point i at floats
 * (r * 32 + (i >> 1)) * 4 + (i & 1) * 2, in whole ENT_W-texel rows.
 * out: { pts (Float32Array), rows (texture rows of ENT_W texels), on (Uint8Array nTubes: 1 for a row with segments),
 *        missing (rows with some segments but not all N_QUADS of them: their absent points stay 0) }.
 * A row with no entry at all is simply off (on 0), not counted as missing.
 */
export function pointsFromEntries(ent, cells, nCells, nTubes, out) {
  const rows = Math.max(1, Math.ceil((nTubes * TEXELS_ROW) / ENT_W)), need = rows * ENT_W * 4;
  if (!out.pts || out.pts.length < need) out.pts = new Float32Array(need);   // alloc-rare: grown to the vessel rows' texture, never on a steady frame
  if (!out.on || out.on.length < nTubes) out.on = new Uint8Array(nTubes);   // alloc-rare: grown with the vessel rows
  if (!out.cnt || out.cnt.length < nTubes) out.cnt = new Uint8Array(nTubes);   // alloc-rare: grown with the vessel rows
  if (!out.seen || out.seen.length < nTubes * N_QUADS) out.seen = new Uint8Array(nTubes * N_QUADS);   // alloc-rare: grown with the vessel rows
  const { pts, on, cnt, seen } = out;
  pts.fill(0, 0, need); on.fill(0, 0, nTubes); cnt.fill(0, 0, nTubes); seen.fill(0, 0, nTubes * N_QUADS);
  for (let c = 0; c < nCells; c++) {
    const e0 = cells[c * 6 + 2], e1 = e0 + cells[c * 6 + 3];
    for (let e = e0; e < e1; e++) {
      const q = e * 8, i = ent[q + 5], r = ent[q + 4];
      if (!(i >= 0) || i >= N_QUADS || !(r >= 0) || r >= nTubes) continue;   // a head (B.y = -1) or an entry outside the rows
      const s = r * N_QUADS + i;
      if (seen[s] === 0) { seen[s] = 1; cnt[r]++; }
      const a = (r * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2, b = (r * TEXELS_ROW + ((i + 1) >> 1)) * 4 + ((i + 1) & 1) * 2;
      pts[a] = ent[q]; pts[a + 1] = ent[q + 1];
      pts[b] = ent[q + 2]; pts[b + 1] = ent[q + 3];
    }
  }
  let missing = 0;
  for (let r = 0; r < nTubes; r++) { if (cnt[r] > 0) { on[r] = 1; if (cnt[r] < N_QUADS) missing++; } }
  out.rows = rows; out.missing = missing;
  return out;
}

/**
 * Every entry index in the cells' join ranges [joinStart, joinStart + joinCount) (an entry listed by several cells appears once a cell),
 * as an Int32Array view, the count in out.n.
 */
export function joinEntryList(cells, nCells, out) {
  let n = 0;
  for (let c = 0; c < nCells; c++) n += cells[c * 6 + 5];
  if (!out.list || out.list.length < n) { out.list = new Int32Array(n); out.view = null; }   // alloc-rare: grown with the join entries
  const list = out.list;
  let k = 0;
  for (let c = 0; c < nCells; c++) {
    const j0 = cells[c * 6 + 4], jn = cells[c * 6 + 5];
    for (let j = 0; j < jn; j++) list[k++] = j0 + j;
  }
  if (!out.view || out.view.length !== n) out.view = list.subarray(0, n);   // alloc-rare: a new view only when the count changed
  out.n = n;
  return out.view;
}

/**
 * The drawable rows grouped by tier. tube: the tube attribute array (13 texels x 4 floats a row, row r at r * 52: tier +8, z +9, flags +10,
 * alpha +7, glow amount +43, glow width +47, selection +48). Rows with on 0 or alpha <= 0 are left out.
 * out: { rows (Float32Array of row ids, tier ascending, row order within a tier), start[t], count[t] (Int32Array MAX_TIERS),
 *        lit[t] (a glow that is not up), litUp[t], sel[t], shadow[t] (Uint8Array MAX_TIERS) }, and out.n the rows in all.
 */
export function tierBuckets(tube, on, nTubes, out) {
  if (!out.rows || out.rows.length < nTubes) out.rows = new Float32Array(nTubes);   // alloc-rare: grown with the vessel rows
  if (!out.start) {   // alloc-rare: the per-tier arrays, once
    out.start = new Int32Array(MAX_TIERS); out.count = new Int32Array(MAX_TIERS); out.cur = new Int32Array(MAX_TIERS);
    out.lit = new Uint8Array(MAX_TIERS); out.litUp = new Uint8Array(MAX_TIERS); out.sel = new Uint8Array(MAX_TIERS); out.shadow = new Uint8Array(MAX_TIERS);
  }
  const { rows, start, count, cur, lit, litUp, sel, shadow } = out;
  count.fill(0); lit.fill(0); litUp.fill(0); sel.fill(0); shadow.fill(0);
  for (let r = 0; r < nTubes; r++) {
    const o = r * TUBE_FLOATS;
    if (!on[r] || !(tube[o + T_ALPHA] > 0)) continue;
    const t = tierOf(tube, o);
    count[t]++;
    if (tube[o + T_GLOW] > 0) { if (tube[o + T_GLOW_W] > UP_GLOW) litUp[t] = 1; else lit[t] = 1; }
    if (tube[o + T_SEL] > 0) sel[t] = 1;
    if ((Math.floor(tube[o + T_FLAGS] + 0.5) & F_SHADOW) !== 0) shadow[t] = 1;
  }
  let at = 0;
  for (let t = 0; t < MAX_TIERS; t++) { start[t] = at; cur[t] = at; at += count[t]; }
  for (let r = 0; r < nTubes; r++) {
    const o = r * TUBE_FLOATS;
    if (!on[r] || !(tube[o + T_ALPHA] > 0)) continue;
    rows[cur[tierOf(tube, o)]++] = r;
  }
  out.n = at;
  return out;
}

// The tiers (a bit mask) of the members of one patch; a member of -1 (or below) is empty, a row outside the tube array is ignored.
function patchTiers(patchData, p, tube, nRows) {
  let mask = 0;
  for (let m = 4; m < 8; m++) {
    const v = patchData[p * 8 + m];
    if (!(v > -0.5)) continue;
    const row = Math.floor(v + 0.5);
    if (row < 0 || row >= nRows) continue;
    mask |= 1 << tierOf(tube, row * TUBE_FLOATS);
  }
  return mask;
}

/**
 * Join patches grouped by tier. patchData: patchInstances(...).data (8 floats a patch; floats 4..7 are member values, row = floor(v + 0.5),
 * -1 none), count patches. A patch with members in several tiers is copied into each of them (once a tier). out: { data (Float32Array,
 * 8 floats a copy, tier ascending), start[t], count[t] (Int32Array MAX_TIERS, in patches) }, and out.n the copies in all.
 */
export function patchesByTier(patchData, count, tube, out) {
  const nRows = Math.floor(tube.length / TUBE_FLOATS);
  if (!out.start) { out.start = new Int32Array(MAX_TIERS); out.count = new Int32Array(MAX_TIERS); out.cur = new Int32Array(MAX_TIERS); }   // alloc-rare: the per-tier arrays, once
  const { start, count: cnt, cur } = out;
  cnt.fill(0);
  for (let p = 0; p < count; p++) {
    const mask = patchTiers(patchData, p, tube, nRows);
    for (let t = 0; t < MAX_TIERS; t++) if (mask & (1 << t)) cnt[t]++;
  }
  let at = 0;
  for (let t = 0; t < MAX_TIERS; t++) { start[t] = at; cur[t] = at; at += cnt[t]; }
  if (!out.data || out.data.length < at * 8) out.data = new Float32Array(at * 8);   // alloc-rare: grown with the patches
  const data = out.data;
  for (let p = 0; p < count; p++) {
    const mask = patchTiers(patchData, p, tube, nRows);
    for (let t = 0; t < MAX_TIERS; t++) {
      if (!(mask & (1 << t))) continue;
      const o = cur[t]++ * 8, q = p * 8;
      for (let k = 0; k < 8; k++) data[o + k] = patchData[q + k];
    }
  }
  out.n = at;
  return out;
}
