// Where the vessels meet, for the GPU's blending (stage.js): the joins (ends that meet at a model node, and ends that lie on another
// vessel's course) and the courses redrawn smooth where one vessel runs on into the next. It runs on every frame of a vessel morph
// (stage.js frameFrom: joinsOf), so it makes nothing in a frame: every list below is kept and written in place, and the answer is
// a store (newJoinStore) whose records and arrays are written again by the next call that is given it. A caller that keeps an
// answer (the morph's stretches, the figure's binning) is given a store of its own, so nothing it holds is written over; the frame
// path flips between two stores (stage.js), so the courses a frame handed to the renderer are not written over while it reads them.
// (Written first with a fresh array, Map and Set for every node and every join; tests/vein-joins.test.js holds a copy of that code
// and checks this against it on random figures, join for join and point for point.)
import { clamp } from './num.js';
import { nodeJoinsInto, newJoinAnswer } from './fork-joins.js';
import { END_HOSTS, STRAND_SOFT } from './anatomy.js';

/** The courses redrawn smooth where two vessels run on into each other. Read as `get(row)`: the course, or undefined for a vessel left as drawn. */
class RowCourses {
  constructor() {
    this.arr = [];   // alloc-rare: made once for a store
    this.gen = [];   // alloc-rare: made once for a store
    this.cur = 1;
  }
  get(row) { return this.gen[row] === this.cur ? this.arr[row] : undefined; }
}

/** A store for one answer: the joins, the pairs that run on (`straight`) and the smoothed courses. */
export function newJoinStore() {
  // alloc-rare: a store is made once for each of the stage's two frame stores, and when the vessels are binned again or a stretch is made (the callers that keep their answer)
  return { pool: [], out: [], nOut: 0, straightPool: [], straight: [], courses: new RowCourses(), res: { J: null, smooth: null, reach: null } };
}

/** A join by what it joins: its members, the trunk they end on, a fork. */
// alloc-rare: the key string of a join, built when a join record is new or its members or trunk changed (setKey below), and by the tests
export const joinKeyOf = (j) => j.members.join('.') + (j.trunk != null ? 't' + j.trunk + (j.fork ? 'f' : '') : '');
// The key of a join the store made: kept on the record and rebuilt only when what it is made of changed.
function setKey(r) {
  const m = r.members, n = m.length, km = r.km;
  let same = r.key !== '' && km.length === n && r.kt === r.trunk && r.kf === r.fork;
  if (same) for (let i = 0; i < n; i++) if (km[i] !== m[i]) { same = false; break; }
  if (same) return;
  km.length = n;
  for (let i = 0; i < n; i++) km[i] = m[i];
  r.kt = r.trunk; r.kf = r.fork;
  r.key = joinKeyOf(r);
}


// Whether q lies within `lim` of a drawn course: the distance to it below lim, in squared lengths and stopping at the
// first segment near enough (start-up profile, 2 Nov 2026: Math.hypot on every segment of every vessel near every end was 1.4 s
// of the first 20 s of a cold load, headless).
export function nearCourse(pts, q, lim) {
  if (!(lim > 0)) return false;
  const qx = q[0], qy = q[1], L2 = lim * lim;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], ax = a[0], ay = a[1], dx = b[0] - ax, dy = b[1] - ay;
    const u = clamp(((qx - ax) * dx + (qy - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), ex = ax + dx * u - qx, ey = ay + dy * u - qy;
    if (ex * ex + ey * ey < L2) return true;
  }
  return false;
}

// ── Kept lists, used inside one call (the pass is not re-entered) ──────────────────────────────────────────────────────
const NODE_ID = new Map();   // alloc-rare: made once; a node's number is given the first time the node is seen (the model's few dozen nodes)
let SLOT = new Int32Array(64).fill(-1);   // alloc-rare: made once, grown only when more nodes than ever appear (node number × 2 + artery: the group there)
const GROUPS = [];   // the ends at each node: { it, i, n, slot }
let nGroups = 0;
const NIT = [], NI = [];   // the ends of one cluster (item, 0|1; -1 for a course the end lies on)
const UIT = [], UI = [];   // the same, a vessel once
const PEND = [];   // { dir, d, strand } for each end of a join, as fork-joins.js reads them
const OUT = newJoinAnswer();
const ROWIT = [];   // the item of each row, for smoothRunOn
let BX = new Float64Array(256);   // alloc-rare: made once, grown only when more items than ever appear (each item's box)
let ART = new Uint8Array(64);   // alloc-rare: made once, grown only when more items than ever appear
// The pairs already joined: a hash of (low row, high row) with a generation, so none is cleared.
let HL = new Int32Array(1024), HH = new Int32Array(1024), HG = new Uint32Array(1024), HGEN = 1, HN = 0;   // alloc-rare: made once, doubled only when more pairs than ever are joined
function pairFind(lo, hi) {
  const mask = HL.length - 1;
  let h = (lo * 7919 + hi * 31) & mask;
  while (HG[h] === HGEN) { if (HL[h] === lo && HH[h] === hi) return h; h = (h + 1) & mask; }
  return -1 - h;
}
function pairAdd(a, b) {
  const lo = a < b ? a : b, hi = a < b ? b : a;
  let h = pairFind(lo, hi);
  if (h >= 0) return;
  if ((HN + 1) * 2 > HL.length) {
    const ol = HL, oh = HH, og = HG, gen = HGEN, n = ol.length * 2;
    HL = new Int32Array(n); HH = new Int32Array(n); HG = new Uint32Array(n); HGEN = 1; HN = 0;   // alloc-rare: doubled only when more pairs than ever are joined
    for (let i = 0; i < ol.length; i++) if (og[i] === gen) pairAdd(ol[i], oh[i]);
    h = pairFind(lo, hi);
  }
  h = -1 - h;
  HL[h] = lo; HH[h] = hi; HG[h] = HGEN; HN++;
}
const pairHas = (a, b) => pairFind(a < b ? a : b, a < b ? b : a) >= 0;

// The spread and radii of the ends (those that are not strands, when skipStrands) of the join at (cx, cy): its reach.
let R_SPREAD = 0, R_MIN = 0, R_MAX = 0;
function reachOfEnds(nu, skipStrands, cx, cy, N) {
  let spread = 0, rMin = Infinity, rMax = 0;
  for (let u = 0; u < nu; u++) {
    const it = UIT[u], i = UI[u];
    if (skipStrands && it.kind === 's') continue;
    let qx = cx, qy = cy, r;
    if (i < 0) r = it.obj.glMaxR;
    else {
      const P = it.pts, q = i ? P[P.length - 1] : P[0];
      qx = q[0]; qy = q[1]; r = it.obj.glR[i ? N - 1 : 0];
    }
    spread = Math.max(spread, Math.hypot(qx - cx, qy - cy));
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  R_SPREAD = spread; R_MIN = rMin; R_MAX = rMax;
}
const kOf = (rMin) => clamp(1.2 * rMin + 1.2, 1.5, 11);

const ghostAt = (u) => UI[u] === 0 && UIT[u].ghost0 === true;   // (an end of the joined vessels by place among them: the start of a vein whose cut-away start still counts in choosing the groups)
// One join (or several: the groups a node's ends fall into) at (cx, cy) of the nn ends in NIT/NI.
function addJoin(st, nn, cx, cy, trunk, N) {
  // (A vessel once: its place the first time it is named, the end it is named by the last.)
  let nu = 0;
  for (let k = 0; k < nn; k++) {
    const it = NIT[k];
    let at = -1;
    for (let u = 0; u < nu; u++) if (UIT[u].row === it.row) { at = u; break; }
    if (at < 0) { UIT[nu] = it; UI[nu++] = NI[k]; } else { UIT[at] = it; UI[at] = NI[k]; }
  }
  if (nu < 2) return;
  let strands = 0;
  for (let u = 0; u < nu; u++) if (UIT[u].kind === 's') strands++;
  reachOfEnds(nu, false, cx, cy, N);
  const allSpread = R_SPREAD, allMin = R_MIN, allMax = R_MAX;
  let ownMin = allMin;
  if (strands) { reachOfEnds(nu, true, cx, cy, N); ownMin = R_MIN; }
  // Which ends blend into which (fork-joins.js): a vessel running on into the next is not filleted to it, in a fork too.
  // (A collateral's strands, which end where it does, are left out of that: nodeJoins.)
  for (let u = 0; u < nu; u++) {
    const it = UIT[u], i = UI[u];
    let e = PEND[u];
    if (!e) { e = { dir: null, d: [0, 0], strand: false, soft: false }; PEND[u] = e; }   // alloc-rare: an end's record, made the first time a join has that many ends
    e.strand = it.kind === 's';
    e.soft = e.strand && STRAND_SOFT.has(it.x?.e?.id);
    if (i < 0) { e.dir = null; continue; }
    const P = it.pts, n = P.length, a = i ? P[n - 1] : P[0], b = i ? P[Math.max(0, n - 4)] : P[Math.min(n - 1, 3)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    e.d[0] = (b[0] - a[0]) / L; e.d[1] = (b[1] - a[1]) / L;
    e.dir = e.d;
  }
  nodeJoinsInto(PEND, nu, OUT);
  // (A cut-away start that still counts in choosing the groups, as the portal trunk's does at the portocaval confluence: the groups are the ones the whole
  // junction gives, then the ghost leg is taken out of them, so no run-on bends a drawn vein toward a stretch that is not drawn and no web is owned by it. 13 Nov 2026.)
  if (OUT.ra >= 0 && !ghostAt(OUT.ra) && !ghostAt(OUT.rb)) {
    let s = st.straightPool[st.straight.length];
    if (!s) { s = { a: 0, ia: 0, b: 0, ib: 0, fork: false, x: 0, y: 0, o: [] }; st.straightPool.push(s); }   // (o: the strands that end on the node, row and end in turn)   // alloc-rare: a run-on record, made the first time a figure has that many
    s.a = UIT[OUT.ra].row; s.ia = UI[OUT.ra]; s.b = UIT[OUT.rb].row; s.ib = UI[OUT.rb]; s.fork = nu - strands > 2;
    s.x = cx; s.y = cy; s.o.length = 0;
    for (let u = 0; u < nu; u++) if (UIT[u].kind === 's' && UI[u] >= 0) s.o.push(UIT[u].row, UI[u]);
    st.straight.push(s);
  }
  for (let a = 0; a < nu; a++) for (let b = a + 1; b < nu; b++) pairAdd(UIT[a].row, UIT[b].row);
  for (let gi = 0; gi < OUT.ng; gi++) {
    const g = OUT.groups[gi];
    let live = 0;
    for (let q = 0; q < g.members.length; q++) if (!ghostAt(g.members[q])) live++;
    if (live < 2) continue;
    // (The vessels' own groups take the blend width their own radii give, the strands' pairs the one all the ends give, as before.)
    const k = kOf(g.strand ? allMin : ownMin), reach = allSpread + 2 * allMax + k + 6;
    let r = st.pool[st.nOut];
    if (!r) { r = { x: 0, y: 0, reach: 0, k: 0, fillet: 0, members: [], trunk: undefined, fork: false, key: '', km: [], kt: undefined, kf: false }; st.pool.push(r); }   // alloc-rare: a join's record, made the first time a figure has that many
    const ms = g.members, m = r.members;
    let nm = 0;
    for (let q = 0; q < ms.length; q++) if (!ghostAt(ms[q])) m[nm++] = UIT[ms[q]].row;
    if (m.length !== nm) m.length = nm;
    r.x = cx; r.y = cy; r.reach = reach; r.k = k; r.fillet = g.fillet;
    const tk = g.trunk >= 0 && !ghostAt(g.trunk);
    r.trunk = tk ? UIT[g.trunk].row : trunk;
    r.fork = tk;
    setKey(r);
    st.out[st.nOut++] = r;
  }
}

/**
 * Junctions: ends that meet at a model node (clustered by where the drawn courses actually end), and ends that lie on another
 * vessel's course (a tributary on its trunk, a vein drawn onto the side of another). Arteries join only arteries. The joins are
 * st.out (st.nOut of them; the array's length is set to that), the pairs that run on st.straight. A margin widens the box and the
 * reach of an end meeting a course by that much and keeps every contact of a pair (the stretches' wide pass, made ahead).
 */
// A divided vein (the splenic vein in a Warren shunt, the portal trunk in a portocaval shunt) has its first stretch cut away: `it.cut` is that
// stretch's length (stage-vessels.js, 0 for the rest). Its drawn start is the stump's round end, so the cut-away start joins nothing, and no other
// vessel's end ends on the stretch that is not drawn. Without this the vein that turns down into the shunt counted the cut vein as its partner:
// it ended flat against nothing, and the shunt's start inside it was dropped, leaving a dark hole at the turn (13 Nov 2026, Mohammad's shot of 15c335a).
const cutAway = (y, x, yy) => y.cut > 0 && Math.hypot(x - y.pts[0][0], yy - y.pts[0][1]) < 20;
export function veinJoins(items, N, st, margin = 0) {
  st.nOut = 0; st.straight.length = 0;
  HGEN++; HN = 0;
  if (HGEN === 0xffffffff) { HG.fill(0); HGEN = 1; }
  const n = items.length;
  // The ends at each model node, in the order the nodes are first met (a node's artery side apart from its vein side).
  nGroups = 0;
  for (let k = 0; k < n; k++) {
    const it = items[k];
    if (it.kind === 'f') continue;
    const art = it.x.isArt ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      if (i === 0 && it.cut > 0) continue;   // (a divided vein's cut-away start meets nothing: see cutAway)
      const node = i ? it.endNode || it.x.e.to : it.x.e.from;
      let id = NODE_ID.get(node);
      if (id === undefined) { id = NODE_ID.size; NODE_ID.set(node, id); }
      const slot = id * 2 + art;
      if (slot >= SLOT.length) { const s = new Int32Array(Math.max(slot + 1, SLOT.length * 2)).fill(-1); s.set(SLOT); SLOT = s; }   // alloc-rare: grown only when more nodes than ever appear
      let gi = SLOT[slot];
      if (gi < 0) {
        gi = nGroups++;
        let g = GROUPS[gi];
        if (!g) { g = { it: [], i: [], n: 0, slot: 0 }; GROUPS[gi] = g; }   // alloc-rare: a node's list, made the first time a figure has that many nodes
        g.n = 0; g.slot = slot;
        SLOT[slot] = gi;
      }
      const g = GROUPS[gi];
      g.it[g.n] = it; g.i[g.n++] = i;
    }
  }
  for (let gi = 0; gi < nGroups; gi++) SLOT[GROUPS[gi].slot] = -1;
  for (let gi = 0; gi < nGroups; gi++) {
    const g = GROUPS[gi], gIt = g.it, gI = g.i;
    let m = g.n;
    while (m > 0) {
      const q0 = gI[0] ? gIt[0].pts[gIt[0].pts.length - 1] : gIt[0].pts[0], x0 = q0[0], y0 = q0[1];
      let nn = 0, keep = 0;
      for (let k = 0; k < m; k++) {
        const it = gIt[k], i = gI[k], P = it.pts, q = i ? P[P.length - 1] : P[0];
        if (k === 0 || Math.hypot(q[0] - x0, q[1] - y0) < 20) { NIT[nn] = it; NI[nn++] = i; } else { gIt[keep] = it; gI[keep++] = i; }
      }
      m = keep;
      if (nn < 2) continue;
      let cx = 0, cy = 0;
      for (let k = 0; k < nn; k++) {
        const P = NIT[k].pts, q = NI[k] ? P[P.length - 1] : P[0];
        cx = cx + q[0] / nn; cy = cy + q[1] / nn;
      }
      addJoin(st, nn, cx, cy, undefined, N);
    }
  }
  // (Every end against every course's box, in flat arrays: the same tests in the same order as with a Map of boxes, which with
  // ~300 items made this loop most of a joins pass, start-up profile 2 Nov 2026.)
  if (BX.length < 4 * n) { BX = new Float64Array(4 * n * 2); ART = new Uint8Array(n * 2); }   // alloc-rare: grown only when more items than ever appear
  const bx = BX, art = ART;
  for (let k = 0; k < n; k++) {
    const it = items[k], P = it.pts, m = it.obj.glMaxR + 4 + margin;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let q = 0; q < P.length; q++) { const p = P[q]; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    bx[4 * k] = x0 - m; bx[4 * k + 1] = y0 - m; bx[4 * k + 2] = x1 + m; bx[4 * k + 3] = y1 + m;
    art[k] = it.x.isArt ? 1 : 0;
  }
  for (let a = 0; a < n; a++) {
    const it = items[a], P = it.pts;
    for (let i = 0; i < 2; i++) {
      if (i === 0 && it.cut > 0) continue;
      const q = i ? P[P.length - 1] : P[0], qx = q[0], qy = q[1], rq = it.obj.glR[i ? N - 1 : 0];
      for (let k = 0; k < n; k++) {
        if (k === a || art[k] !== art[a] || qx < bx[4 * k] || qx > bx[4 * k + 2] || qy < bx[4 * k + 1] || qy > bx[4 * k + 3]) continue;
        const y = items[k];
        if (y === it || (!margin && pairHas(it.row, y.row)) || cutAway(y, qx, qy)) continue;
        const hosts = END_HOSTS[it.x.e.id];
        if (hosts && y.x.e.id !== it.x.e.id && !hosts.includes(y.x.e.id)) continue;   // (an end that may lie only on the courses it is drawn onto: END_HOSTS)   // (a stretch's wide pass keeps every contact of two vessels, not the first: which comes first depends on the widths)
        if (nearCourse(y.pts, q, y.obj.glMaxR + 0.5 * rq + 2 + margin)) {
          NIT[0] = it; NI[0] = i; NIT[1] = y; NI[1] = -1;
          addJoin(st, 2, qx, qy, y.x.e.id === it.x.e.id ? undefined : y.row, N);   // (the trunk, unless it is another stretch of the same vessel: the azygos arch's bend)
        }
      }
    }
  }
  if (st.out.length !== st.nOut) st.out.length = st.nOut;
  return st.out;
}

// Where one vessel runs on into the next, the two courses meet at a slight corner: the last few
// samples either side are redrawn as one smooth curve (a cubic through the join, following each
// course's own direction), so the tube bends through the join instead of kinking.
export const runOnSamples = (it, n) => (it.ra ? Math.max(2, Math.round(n * (1 - it.f))) : n);
// A vessel's points copied into the store's own course for its row (the pairs are kept, written again).
function copyCourse(co, row, src) {
  let dst = co.arr[row];
  if (!dst) { dst = []; co.arr[row] = dst; }   // alloc-rare: a vessel's smoothed course, made the first time the store smooths it, then written in place
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const s = src[i];
    let d = dst[i];
    if (!d) { d = [0, 0]; dst[i] = d; }   // alloc-rare: a sample's pair, made once per store
    for (let k = 0; k < s.length; k++) d[k] = s[k];
    if (d.length !== s.length) d.length = s.length;
  }
  if (dst.length !== n) dst.length = n;
  return dst;
}
// The samples over which a strand's end is moved with the node: its end goes to where the smoothed trunk now passes, easing back to its own course.
export const STRAND_SNAP = 12;
// How near (world units) a run-on's smoothed curve must pass to the join it smooths.
export const RUN_ON_MISS = 2;
// How near the cubic (p0 … p3) passes to (jx, jy): the least distance over its middle half, where the join lies.
export function runOnMiss(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, jx, jy) {
  let m = Infinity;
  for (let k = 0; k <= 10; k++) {
    const t = 0.25 + 0.05 * k, u = 1 - t;
    const x = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
    const y = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
    const d = (x - jx) * (x - jx) + (y - jy) * (y - jy);
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}
/** The courses of the pairs in `straight` redrawn smooth (st.courses.get(row)); a vessel not in a pair is not in it. */
export function smoothRunOn(items, straight, st) {
  const co = st.courses, E = 10;
  co.cur++;
  for (let k = 0; k < items.length; k++) ROWIT[items[k].row] = items[k];
  for (let q = 0; q < straight.length; q++) {
    const { a, ia, b, ib } = straight[q];
    const A = ROWIT[a], B = ROWIT[b];
    if (!A || !B) continue;
    const PA = co.gen[a] === co.cur ? co.arr[a] : copyCourse(co, a, A.pts), PB = co.gen[b] === co.cur ? co.arr[b] : copyCourse(co, b, B.pts);
    if (PA.length < 2 * E + 2 || PB.length < 2 * E + 2) continue;
    // From E samples into A, through the join, to E samples into B (fewer into the cava drawn as one,
    // whose samples lie farther apart: about as far along as into its last stretch alone).
    // Where the two courses bend hard through the join (the short gastric feeder arching over into the gastrorenal shunt at the
    // fundal varices, 6 Nov) the cubic over E samples cut the bend by 12 units, so the trunk passed under the node and the
    // varices' strands, which end on the node, hung off it unjoined. The stretch is shortened (10 → 6 → 4 → 2 samples) until
    // the curve passes within RUN_ON_MISS of the join; every other run-on in the figure already does at 10.
    const ea = ia ? PA[PA.length - 1] : PA[0], eb = ib ? PB[PB.length - 1] : PB[0];
    const jx = (ea[0] + eb[0]) / 2, jy = (ea[1] + eb[1]) / 2;
    let e = E, Ea, Eb, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y;
    for (;;) {
      Ea = runOnSamples(A, e); Eb = runOnSamples(B, e);
      const a0 = ia ? PA[PA.length - 1 - Ea] : PA[Ea], a1 = ia ? PA[PA.length - 1 - (Ea + 1)] : PA[Ea + 1];
      const b0 = ib ? PB[PB.length - 1 - Eb] : PB[Eb], b1 = ib ? PB[PB.length - 1 - (Eb + 1)] : PB[Eb + 1];
      // (The four points as numbers: the course they lie in is written over below.)
      p0x = a0[0]; p0y = a0[1]; p3x = b0[0]; p3y = b0[1];
      const L = Math.hypot(p3x - p0x, p3y - p0y) / 3;
      const tax = p0x - a1[0], tay = p0y - a1[1], tbx = p3x - b1[0], tby = p3y - b1[1];
      const na = Math.hypot(tax, tay) || 1, nb = Math.hypot(tbx, tby) || 1;
      p1x = p0x + (tax / na) * L; p1y = p0y + (tay / na) * L; p2x = p3x + (tbx / nb) * L; p2y = p3y + (tby / nb) * L;
      if (e <= 2 || runOnMiss(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, jx, jy) <= RUN_ON_MISS) break;
      e = Math.max(2, Math.round(e * 0.6));
    }
    // A's samples E … 0 (toward its end) take t 0 … 0.5, B's 0 … E take 0.5 … 1.
    for (let i = 0; i <= Ea; i++) {
      const t = 0.5 * (1 - i / Ea), u = 1 - t, d = PA[ia ? PA.length - 1 - i : i];
      d[0] = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
      d[1] = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
      if (d.length !== 2) d.length = 2;
    }
    for (let i = 0; i <= Eb; i++) {
      const t = 0.5 + 0.5 * (i / Eb), u = 1 - t, d = PB[ib ? PB.length - 1 - i : i];
      d[0] = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
      d[1] = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y;
      if (d.length !== 2) d.length = 2;
    }
    co.gen[a] = co.cur; co.gen[b] = co.cur;
    // The strands that end on this node end on the trunk where it passes now: the smoothed trunk may pass the node by up to RUN_ON_MISS, and a strand's round end is as thick as the
    // trunk, so left on the node it stood out of the trunk's wall, a stair in the outline on each side of the node (the fundal varices' arch, 13 Nov 2026). Its last STRAND_SNAP samples ease from the move to none.
    const o = straight[q].o;
    if (o && o.length) {
      const nx = 0.5 * 0.5 * 0.5 * p0x + 3 * 0.5 * 0.5 * 0.5 * p1x + 3 * 0.5 * 0.5 * 0.5 * p2x + 0.5 * 0.5 * 0.5 * p3x - straight[q].x;
      const ny = 0.5 * 0.5 * 0.5 * p0y + 3 * 0.5 * 0.5 * 0.5 * p1y + 3 * 0.5 * 0.5 * 0.5 * p2y + 0.5 * 0.5 * 0.5 * p3y - straight[q].y;
      for (let k = 0; k < o.length; k += 2) {
        const row = o[k], end = o[k + 1], it = ROWIT[row];
        if (!it) continue;
        const P = co.gen[row] === co.cur ? co.arr[row] : copyCourse(co, row, it.pts);
        for (let j = 0; j <= STRAND_SNAP && j < P.length; j++) {
          const w = 1 - j / STRAND_SNAP, k2 = w * w * (3 - 2 * w), d = P[end ? P.length - 1 - j : j];
          d[0] += nx * k2; d[1] += ny * k2;
        }
        co.gen[row] = co.cur;
      }
    }
  }
  for (let k = 0; k < items.length; k++) ROWIT[items[k].row] = undefined;
  return co;
}
