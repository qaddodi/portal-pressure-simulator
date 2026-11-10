// The Tube renderer's row data and web data (10 Nov 2026, docs/recommendations/tube-renderer-stage2-3-plan.md, brief S2-J): pure JS, no GL.
// They turn what the vessel renderer holds (the tube attributes, the binned join entries, each row's points) into what the Tube's passes draw from:
//   tubeRows       the per-row record of the plan's contract, 4 floats a row: (row, endStart, endEnd, kind + 2). kind 0 plain, 1 exact (a row whose fragment
//                  shader can leave a pixel empty other than by vD: dotted, clipped, or ending on another vessel); the + 2 so a one-float buffer, which
//                  WebGL pads with (0, 0, 1), reads as "no ends". endStart / endEnd: an open end on a trunk (trunk row * 64 + the trunk's sample there), the
//                  continuation of another row (-(2 + the partner row * 64 + its end sample): both rows end at the bisector plane of the break), or -1
//                  (tube-join-glsl.js has the codes).
//   tubeBuckets    the rows by tier as tierBuckets gives them, each tier's plain rows first (plain[t] of its count[t]), as 4-float records.
//   webInstances   the webs of tube-joint.js: WEB_FLOATS (12) floats a web, from the join entries. websByTier groups them by tier as patchesByTier does.
// None of them allocates on a repeated call: every output is an object or typed array the caller keeps (`out`), made on the first call and grown only
// when too small, each growth marked `// alloc-rare: <reason>`. tubeRows, webInstances and the legs behind them run once per binning (a geometry upload);
// tubeBuckets and websByTier run in a frame and make nothing at all.
import { N_SAMPLES, memberOf } from './veins-mesh.js';
import { MAX_TIERS, TUBE_FLOATS } from './veins-mesh-data.js';
import { WEB_FLOATS, WEB_MIN_DEG, WEB_MAX_DEG, legDirection } from './tube-joint.js';
import { endTrunk, endContinues } from './tube-join-glsl.js';

export const TUBE_ROW_FLOATS = 4;             // a row record: row, endStart, endEnd, kind + 2
export const TUBE_NO_END = -1;
export const F_DOTTED = 8;                    // the flags (tube texel 2, z) of veins-gl.js: dotted. Kept here so this file imports no GL code (a test pins the value)
const T_ALPHA = 7, T_TIER = 8, T_FLAGS = 10, T_GLOW = 43, T_GLOW_W = 47, T_SEL = 48, T_CLIP0 = 20, T_CLIP1 = 21;
const F_SHADOW = 4, UP_GLOW = 5;
const TEXELS_ROW = N_SAMPLES / 2;
const DEG = Math.PI / 180;
const CLIP_EPS = 1e-6;
const SNAP_SAMPLES = 12, SNAP_REACH = 0.3;

const tierOf = (tube, o) => { const t = Math.floor(tube[o + T_TIER] + 0.5); return t < 0 ? 0 : t >= MAX_TIERS ? MAX_TIERS - 1 : t; };
const ptX = (pts, row, i) => pts[(row * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2];
const ptY = (pts, row, i) => pts[(row * TEXELS_ROW + (i >> 1)) * 4 + (i & 1) * 2 + 1];
/** Whether a row has points in `pts` (a row with no entry is all zero; both its end samples at the origin). */
const hasPoints = (pts, row) => pts.length >= (row * TEXELS_ROW + TEXELS_ROW) * 4 && (ptX(pts, row, 0) !== 0 || ptY(pts, row, 0) !== 0 || ptX(pts, row, N_SAMPLES - 1) !== 0 || ptY(pts, row, N_SAMPLES - 1) !== 0);

// ---- Legs: where each member of a join leaves it ----------------------------------------------------------------------------

// Scratch for one join (at most 4 members, 2 legs each), kept: nothing is made while joins are read.
const LEG_MAX = 8;
const S = { row: new Int32Array(LEG_MAX), sample: new Int32Array(LEG_MAX), dir: new Int8Array(LEG_MAX), mark: new Float32Array(LEG_MAX), ang: new Float64Array(LEG_MAX), order: new Int8Array(LEG_MAX), n: 0 };

function nearestSample(pts, row, x, y, from = 0, to = N_SAMPLES - 1) {
  let best = from, bd = Infinity;
  for (let i = from; i <= to; i++) { const d = Math.hypot(ptX(pts, row, i) - x, ptY(pts, row, i) - y); if (d < bd) { bd = d; best = i; } }
  return best;
}
/** The length of the stretch of a row from its end sample `from` to sample `to` (a few samples). */
function stubLength(pts, row, from, to) {
  let len = 0;
  const step = to > from ? 1 : -1;
  for (let i = from; i !== to; i += step) len += Math.hypot(ptX(pts, row, i + step) - ptX(pts, row, i), ptY(pts, row, i + step) - ptY(pts, row, i));
  return len;
}
/** A row's points flat (x0, y0, x1, y1 ...) as legDirection reads them, for one row, into `into` (N_SAMPLES * 2 floats). */
function rowFlat(pts, row, into) { for (let i = 0; i < N_SAMPLES; i++) { into[2 * i] = ptX(pts, row, i); into[2 * i + 1] = ptY(pts, row, i); } return into; }
const FLAT = new Float64Array(N_SAMPLES * 2), FLAT2 = new Float64Array(N_SAMPLES * 2);
const CONT_DEG = 45;                          // two rows meeting end to end are one surface when they bend by no more than this

/**
 * The legs of the join whose entry starts at float q of `ent` (writeJoin's layout: x, y, reach, k * 100 + fillet share, four member values), into the
 * kept scratch S: a member whose nearest sample is interior runs on through the join (a trunk, a quarter or three eighths added to its row, always does; so do
 * other members the join does not mark): two legs, one each way, at that sample; a member whose nearest sample is an end ends there: one leg, leaving inward.
 * Members outside the rows, without points, or listed twice are left out. Returns the number of legs; S.row, S.sample, S.dir, S.mark hold them.
 */
function legsOf(ent, q, pts, nRows) {
  const x = ent[q], y = ent[q + 1];
  let n = 0;
  for (let m = 0; m < 4; m++) {
    const mem = memberOf(ent[q + 4 + m]);
    if (!mem || mem.row < 0 || mem.row >= nRows || !hasPoints(pts, mem.row)) continue;
    let dup = false;
    for (let a = 0; a < n; a++) if (S.row[a] === mem.row) dup = true;
    if (dup) continue;
    const row = mem.row;
    let i = nearestSample(pts, row, x, y);
    // (A nearest sample close to an end, the stretch from that end to it shorter than SNAP_REACH of the join's reach, is that end: the join's node lies a little
    // past where two rows touch, and the row's stub beyond it is not a vessel running on.)
    const reach = ent[q + 2];
    if (i > 0 && i <= SNAP_SAMPLES && stubLength(pts, row, 0, i) <= SNAP_REACH * reach) i = 0;
    else if (i < N_SAMPLES - 1 && i >= N_SAMPLES - 1 - SNAP_SAMPLES && stubLength(pts, row, N_SAMPLES - 1, i) <= SNAP_REACH * reach) i = N_SAMPLES - 1;
    // (A member whose nearest sample is interior runs on through the join, whether or not the join marks it the trunk: the lobule's vessels do, and so do some
    // of the figure's, a vessel meeting a node part-way along: two legs. One whose nearest sample is an end ends there: one leg, leaving inward.)
    if (i === 0 || i === N_SAMPLES - 1) { S.row[n] = row; S.sample[n] = i; S.dir[n] = i === 0 ? 1 : -1; S.mark[n++] = mem.mark; }
    else {
      S.row[n] = row; S.sample[n] = i; S.dir[n] = 1; S.mark[n++] = mem.mark;
      S.row[n] = row; S.sample[n] = i; S.dir[n] = -1; S.mark[n++] = mem.mark;
    }
  }
  S.n = n;
  return n;
}

/** The legs of the join entry starting at float q (see legsOf) as { row, sample, dir, mark } arrays of length n, for the tests and the diagnostics. */
export function joinLegs(ent, q, pts, nRows) {
  const n = legsOf(ent, q, pts, nRows);
  return { n, row: Array.from(S.row.subarray(0, n)), sample: Array.from(S.sample.subarray(0, n)), dir: Array.from(S.dir.subarray(0, n)), mark: Array.from(S.mark.subarray(0, n)) };   // alloc-rare: tests only
}

// ---- Rows -------------------------------------------------------------------------------------------------------------------

/**
 * The Tube's row records (4 floats a row, nRows rows) into out.rows. tubeData: the tube attribute array (TUBE_FLOATS a row); joinEntries: join entries in
 * writeJoin's layout (8 floats an entry; repeats are fine); pts: the rows' points as pointsFromEntries lays them (needed for the ends; without it no row has an
 * end). A row is exact when it is dotted, clipped (its drawn part, texel 5, is not 0..1), ends on a vessel or continues another row; plain otherwise. A row ends on a
 * vessel at an end when that end is a leg of a join with a row that runs through it (the join's marked trunk, else the first member with two legs); it continues
 * another row when a join is two rows' ends and the two bend by no more than CONT_DEG; the first such join wins. out.exact: the exact rows' count; out.ended: the rows with a join end.
 */
export function tubeRows(tubeData, nRows, joinEntries, out, pts = null) {
  if (!out.rows || out.rows.length < nRows * TUBE_ROW_FLOATS) out.rows = new Float32Array(nRows * TUBE_ROW_FLOATS);   // alloc-rare: grown with the vessel rows
  const rows = out.rows;
  for (let r = 0; r < nRows; r++) {
    const o = r * TUBE_FLOATS, b = r * TUBE_ROW_FLOATS;
    const dotted = (Math.floor(tubeData[o + T_FLAGS] + 0.5) & F_DOTTED) !== 0;
    const clipped = tubeData[o + T_CLIP0] > CLIP_EPS || tubeData[o + T_CLIP1] < 1 - CLIP_EPS;
    rows[b] = r; rows[b + 1] = TUBE_NO_END; rows[b + 2] = TUBE_NO_END; rows[b + 3] = dotted || clipped ? 3 : 2;
  }
  if (pts) {
    const n = Math.floor(joinEntries.length / 8);
    for (let e = 0; e < n; e++) {
      const q = e * 8;
      if (!(joinEntries[q + 2] > 0) || legsOf(joinEntries, q, pts, nRows) < 2) continue;
      const nl = S.n;
      const setEnd = (a, code) => {   // a: a leg that is an end of its row; the first end given wins
        const b = S.row[a] * TUBE_ROW_FLOATS + (S.sample[a] === 0 ? 1 : 2);
        if (rows[b] === TUBE_NO_END) { rows[b] = code; rows[S.row[a] * TUBE_ROW_FLOATS + 3] = 3; return true; }
        return false;
      };
      const isEnd = (a) => (S.sample[a] === 0 || S.sample[a] === N_SAMPLES - 1) && !(a + 1 < nl && S.row[a + 1] === S.row[a]) && !(a > 0 && S.row[a - 1] === S.row[a]);
      let marked = -1, interior = -1;
      for (let a = 0; a < nl; a++) if (S.mark[a] > 0.1) { marked = a; break; }
      for (let a = 0; a + 1 < nl; a++) if (S.row[a] === S.row[a + 1] && S.dir[a] !== S.dir[a + 1]) { interior = a; break; }
      let pairA = -1, pairB = -1;
      if (interior < 0) {
        // No row runs through: two rows' ends that continue each other (bent by at most CONT_DEG; the straightest pair) are one surface; both or neither.
        let best = -Math.cos(CONT_DEG * DEG);
        for (let a = 0; a < nl; a++) {
          if (!isEnd(a)) continue;
          for (let c = a + 1; c < nl; c++) {
            if (!isEnd(c) || S.row[c] === S.row[a]) continue;
            const dA = legDirection(rowFlat(pts, S.row[a], FLAT), S.sample[a], S.dir[a]), dB = legDirection(rowFlat(pts, S.row[c], FLAT2), S.sample[c], S.dir[c]);
            const dot = dA[0] * dB[0] + dA[1] * dB[1];
            if (dot <= best) { best = dot; pairA = a; pairB = c; }
          }
        }
        if (pairA >= 0) {
          const bA = S.row[pairA] * TUBE_ROW_FLOATS + (S.sample[pairA] === 0 ? 1 : 2), bB = S.row[pairB] * TUBE_ROW_FLOATS + (S.sample[pairB] === 0 ? 1 : 2);
          if (rows[bA] === TUBE_NO_END && rows[bB] === TUBE_NO_END) {   // (both ends free: the pair is mutual or not at all)
            setEnd(pairA, endContinues(S.row[pairB], S.sample[pairB])); setEnd(pairB, endContinues(S.row[pairA], S.sample[pairA]));
          } else pairA = pairB = -1;
        }
      }
      // The row the other ends in the join end on: the join's trunk if it marks one, else the member that runs through it, else (no row runs through) the pair's first row.
      const t = marked >= 0 ? marked : interior >= 0 ? interior : pairA;
      if (t < 0) continue;
      const tRow = S.row[t], tSample = S.sample[t];
      for (let a = 0; a < nl; a++) {
        if (a === pairA || a === pairB || S.row[a] === tRow || S.mark[a] > 0.1 || !isEnd(a)) continue;
        setEnd(a, endTrunk(tRow, tSample));
      }
    }
  }
  let exact = 0, ended = 0;
  for (let r = 0; r < nRows; r++) {
    const b = r * TUBE_ROW_FLOATS;
    if (rows[b + 3] > 2.5) exact++;
    if (rows[b + 1] !== TUBE_NO_END || rows[b + 2] !== TUBE_NO_END) ended++;
  }
  out.exact = exact; out.n = nRows; out.ended = ended;   // (ended: rows with a join end at either end, for the ?perf panel's lumen line)
  return out;
}

/** Whether a record (from tubeRows) is an exact row. */
export const rowIsExact = (rows, r) => rows[r * TUBE_ROW_FLOATS + 3] > 2.5;

/**
 * tierBuckets with the Tube's records. tube: the tube attribute array; on: 1 for a row with points; nTubes; rowData: tubeRows' out.rows. Rows with on 0 or alpha <= 0
 * are left out. out: { rows (Float32Array, TUBE_ROW_FLOATS a record in tier order, each tier's plain rows first and then its exact rows, row order within each),
 * start[t], count[t], plain[t] (Int32Array MAX_TIERS; start and count are in records), lit[t], litUp[t], sel[t], shadow[t] (Uint8Array MAX_TIERS) }, out.n the records in all.
 */
export function tubeBuckets(tube, on, nTubes, rowData, out) {
  if (!out.rows || out.rows.length < nTubes * TUBE_ROW_FLOATS) out.rows = new Float32Array(nTubes * TUBE_ROW_FLOATS);   // alloc-rare: grown with the vessel rows
  if (!out.start) {   // alloc-rare: the per-tier arrays, once
    out.start = new Int32Array(MAX_TIERS); out.count = new Int32Array(MAX_TIERS); out.plain = new Int32Array(MAX_TIERS);
    out.curP = new Int32Array(MAX_TIERS); out.curX = new Int32Array(MAX_TIERS);
    out.lit = new Uint8Array(MAX_TIERS); out.litUp = new Uint8Array(MAX_TIERS); out.sel = new Uint8Array(MAX_TIERS); out.shadow = new Uint8Array(MAX_TIERS);
  }
  const { rows, start, count, plain, curP, curX, lit, litUp, sel, shadow } = out;
  count.fill(0); plain.fill(0); lit.fill(0); litUp.fill(0); sel.fill(0); shadow.fill(0);
  for (let r = 0; r < nTubes; r++) {
    const o = r * TUBE_FLOATS;
    if (!on[r] || !(tube[o + T_ALPHA] > 0)) continue;
    const t = tierOf(tube, o);
    count[t]++;
    if (!(rowData[r * TUBE_ROW_FLOATS + 3] > 2.5)) plain[t]++;
    if (tube[o + T_GLOW] > 0) { if (tube[o + T_GLOW_W] > UP_GLOW) litUp[t] = 1; else lit[t] = 1; }
    if (tube[o + T_SEL] > 0) sel[t] = 1;
    if ((Math.floor(tube[o + T_FLAGS] + 0.5) & F_SHADOW) !== 0) shadow[t] = 1;
  }
  let at = 0;
  for (let t = 0; t < MAX_TIERS; t++) { start[t] = at; curP[t] = at; curX[t] = at + plain[t]; at += count[t]; }
  for (let r = 0; r < nTubes; r++) {
    const o = r * TUBE_FLOATS;
    if (!on[r] || !(tube[o + T_ALPHA] > 0)) continue;
    const t = tierOf(tube, o), b = r * TUBE_ROW_FLOATS;
    const at2 = (rowData[b + 3] > 2.5 ? curX[t]++ : curP[t]++) * TUBE_ROW_FLOATS;
    rows[at2] = rowData[b]; rows[at2 + 1] = rowData[b + 1]; rows[at2 + 2] = rowData[b + 2]; rows[at2 + 3] = rowData[b + 3];
  }
  out.n = at;
  return out;
}

// ---- Webs -------------------------------------------------------------------------------------------------------------------

/**
 * The webs of a binning (tube-joint.js, the record layout in its header) into out.data (WEB_FLOATS a web), out.count. joinEntries: join entries in writeJoin's
 * layout with the join's place in x, y (between the views, a join entry's x is its index: the caller passes entries with the frame's place filled in); repeats of a
 * join are left out, as are joins with no reach, no fillet or fewer than two legs. tubeData: the tube attribute array (its length gives the rows); pts: the rows'
 * points as pointsFromEntries lays them. For each join: its legs (see legsOf), sorted by the angle of their direction about the join; each pair of neighbours in that
 * order (round the circle) whose directions differ by at least WEB_MIN_DEG and under WEB_MAX_DEG makes one web, between the first leg's wall on its left and the
 * second's on its right. owner: 0 or 1 if exactly one of the two legs is a trunk, else 2 (the larger radius, decided in the shader where the radii are).
 * out.at: each web's join place (x, y), for the tests and the diagnostics only. out.joins: the joins read; out.empty: pairs left out for an angle outside the range; out.kinds: webs by the number of legs of their join.
 */
export function webInstances(joinEntries, tubeData, pts, out) {
  const nRows = Math.floor(tubeData.length / TUBE_FLOATS), nj = Math.floor(joinEntries.length / 8);
  if (!out.data || out.data.length < nj * 8 * WEB_FLOATS) out.data = new Float32Array(nj * 8 * WEB_FLOATS);   // alloc-rare: grown with the joins (up to 8 legs, 8 webs, a join), only on a new binning
  if (!out.at || out.at.length < nj * 8 * 2) out.at = new Float32Array(nj * 8 * 2);   // alloc-rare: grown with the joins, only on a new binning
  if (!out.kinds) out.kinds = new Int32Array(LEG_MAX + 1);   // alloc-rare: once
  out.kinds.fill(0);
  const seen = new Set();   // alloc-rare: geometry upload: once per binning, sized by the joins, never on a steady frame
  const data = out.data;
  let count = 0, joins = 0, skipped = 0;
  for (let e = 0; e < nj; e++) {
    const q = e * 8;
    if (!(joinEntries[q + 2] > 0)) continue;
    const key = joinEntries.slice(q, q + 8).join(',');   // alloc-rare: same as above
    if (seen.has(key)) continue;
    seen.add(key);
    const n = legsOf(joinEntries, q, pts, nRows);
    if (n < 2) continue;
    joins++;
    const x0 = joinEntries[q], y0 = joinEntries[q + 1], v = joinEntries[q + 3], k = Math.floor(v) * 0.01, share = Math.min(1, Math.max(0, (v - Math.floor(v)) / 0.99)), rho0 = k * share;
    if (!(rho0 > 0)) continue;
    // The legs' directions about the join, in order.
    for (let a = 0; a < n; a++) {
      const flat = rowFlat(pts, S.row[a], FLAT), d = legDirection(flat, S.sample[a], S.dir[a]);
      S.ang[a] = Math.atan2(d[1], d[0]); S.order[a] = a;
    }
    for (let a = 1; a < n; a++) { const o = S.order[a]; let b = a - 1; while (b >= 0 && S.ang[S.order[b]] > S.ang[o]) { S.order[b + 1] = S.order[b]; b--; } S.order[b + 1] = o; }
    for (let a = 0; a < n; a++) {
      const la = S.order[a], lb = S.order[(a + 1) % n];
      if (la === lb) continue;
      let gap = S.ang[lb] - S.ang[la];
      if (gap < 0) gap += 2 * Math.PI;
      if (gap < WEB_MIN_DEG * DEG || gap >= WEB_MAX_DEG * DEG) { skipped++; continue; }
      const o = count * WEB_FLOATS;
      data[o] = S.row[la]; data[o + 1] = S.sample[la]; data[o + 2] = S.dir[la]; data[o + 3] = 1;
      data[o + 4] = S.row[lb]; data[o + 5] = S.sample[lb]; data[o + 6] = S.dir[lb]; data[o + 7] = -1;
      data[o + 8] = rho0; data[o + 9] = joinEntries[q + 2];
      out.at[count * 2] = x0; out.at[count * 2 + 1] = y0;
      const ta = S.mark[la] > 0.1, tb = S.mark[lb] > 0.1;
      data[o + 10] = ta !== tb ? (ta ? 0 : 1) : 2; data[o + 11] = 0;
      count++;
      out.kinds[n]++;
    }
  }
  out.count = count; out.joins = joins; out.empty = skipped;
  return out;
}

/**
 * The webs grouped by tier (patchesByTier's way): a web is drawn in the higher of its two rows' tiers, once. A web is left out when either row is off (on[row] 0, when `on` is
 * given) or not drawn (alpha <= 0). out: { data (WEB_FLOATS a web, tier ascending), start[t], count[t] (Int32Array MAX_TIERS, in webs) }, out.n the webs in all.
 */
export function websByTier(webData, count, tube, out, on = null) {
  const nRows = Math.floor(tube.length / TUBE_FLOATS);
  if (!out.start) { out.start = new Int32Array(MAX_TIERS); out.count = new Int32Array(MAX_TIERS); out.cur = new Int32Array(MAX_TIERS); }   // alloc-rare: the per-tier arrays, once
  const { start, count: cnt, cur } = out;
  cnt.fill(0);
  for (let p = 0; p < count; p++) { const t = webTier(webData, p, tube, nRows, on); if (t >= 0) cnt[t]++; }
  let at = 0;
  for (let t = 0; t < MAX_TIERS; t++) { start[t] = at; cur[t] = at; at += cnt[t]; }
  if (!out.data || out.data.length < at * WEB_FLOATS) out.data = new Float32Array(Math.max(at, 1) * WEB_FLOATS);   // alloc-rare: grown with the webs
  const data = out.data;
  for (let p = 0; p < count; p++) {
    const t = webTier(webData, p, tube, nRows, on);
    if (t < 0) continue;
    const o = cur[t]++ * WEB_FLOATS, q = p * WEB_FLOATS;
    for (let k = 0; k < WEB_FLOATS; k++) data[o + k] = webData[q + k];
  }
  out.n = at;
  return out;
}
/** The tier a web is drawn in, or -1 when it is not drawn. */
function webTier(webData, p, tube, nRows, on) {
  const q = p * WEB_FLOATS, ra = Math.floor(webData[q] + 0.5), rb = Math.floor(webData[q + 4] + 0.5);
  if (ra < 0 || ra >= nRows || rb < 0 || rb >= nRows) return -1;
  if (on && (!on[ra] || !on[rb])) return -1;
  const oa = ra * TUBE_FLOATS, ob = rb * TUBE_FLOATS;
  if (!(tube[oa + T_ALPHA] > 0) || !(tube[ob + T_ALPHA] > 0)) return -1;
  return Math.max(tierOf(tube, oa), tierOf(tube, ob));
}
