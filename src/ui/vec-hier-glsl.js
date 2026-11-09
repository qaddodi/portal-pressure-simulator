// The leaf lookup every vector program shares (docs/recommendations/vector-renderer-plan-r1.md section 2.3 and 2.4; workstream K). GLSL ES 3.00
// source only, no GL. The strip shader (B), the region shaders (C) and the blood pass read the hierarchy through these functions and no other
// way, so a pixel finds its leaf by one rule: the cell by floor((world − gridO) / CELL), then down the nodes comparing `world` with each
// node's centre (the centre is exact halving from the cell's corner). The JS mirror is leafAt(tables, wx, wy) in vec-leaves.js, with the same
// arithmetic in the same order, and tests/vec-leaves.test.js runs this very text against it.
//
// What a program does with it (reviewer's order, plan 2.4):
//   int leaf = vecLeafAt(world);  if (leaf < 0) discard / draw nothing;      VecLeaf lf = vecLeafRead(leaf);
//   for (int n = 0; n < lf.runCount; n++) {
//     uint ref = vecRunRef(lf.runStart + n);  int bits = vecRefBits(ref);  VecRun run = vecRunRead(vecRefRun(ref));
//     if ((bits & VEC_C_LUMEN) != 0 && vecBoundHit(run, VEC_C_LUMEN, world)) { …the lumen's segments run.i0 … run.i1 of row run.row… }
//     …one test per contribution bit the ref lists…
//   }
// (the join part, HIER_JOIN_GLSL:)
//   for (int j = 0; j < lf.joinCount; j++) { VecJoin jn = vecJoinRead(vecJoinRef(lf.joinStart + j)); if (vecJoinHit(jn, world)) … }
//
// The host (E) declares nothing of these: HIER_GLSL carries the samplers and uniforms below; the host binds them by name (HIER_UNIFORMS).
// Six samplers in all (16 fragment texture units on a phone and a Mac; E, 9 Nov): cells, nodes, leaves, ONE ref list (run refs and join refs, joinStart an
// absolute index into it) and ONE float table (A's runs, and the joins in rows below them, from uVecJoinRow0). Two parts so a program that never reads a
// join (the strips, B) leaves the join code out: HIER_LOOKUP_GLSL (leaf, runs, bounds) and HIER_JOIN_GLSL (joins; needs the lookup part first). HIER_GLSL is both.
// `world` is the caller's: inv × gl_FragCoord.xy (B's vecWorld()).
import {
  CELL_SIZE, CELL_LEAF, JOIN_TEXELS, JOIN_PER_ROW, NODE_W, MAX_DEPTH, LEAF_ROW, LIST_W, RUNS_PER_ROW, RUN_TEXELS, C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN,
  L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS, SLOTS_WIDE, R_ON, BOUND_HEADROOM, NO_OWNER,
} from './vec-leaves-pack.js';

const f1 = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));

/**
 * Samplers and uniforms the lookup reads. Textures: cells RGBA16UI, nodes RGBA32UI, leaves RGBA32UI, the ref list R32UI (run refs and join refs together),
 * the float table RGBA32F (A's runs, then the joins from row uVecJoinRow0; combineRunJoin in vec-leaves-pack.js makes it).
 */
export const HIER_LOOKUP_UNIFORMS = Object.freeze(['uVecCells', 'uVecNodes', 'uVecLeaves', 'uVecRunRefs', 'uVecRuns', 'uVecGridO', 'uVecGridN', 'uVecShOff']);
/** The join part's uniform: the first row of the joins in uVecRuns (the number of vessel rows; an int). */
export const HIER_JOIN_UNIFORMS = Object.freeze(['uVecJoinRow0']);
export const HIER_UNIFORMS = Object.freeze([...HIER_LOOKUP_UNIFORMS, ...HIER_JOIN_UNIFORMS]);

export const HIER_LOOKUP_DECLS = `
uniform highp usampler2D uVecCells;
uniform highp usampler2D uVecNodes;
uniform highp usampler2D uVecLeaves;
uniform highp usampler2D uVecRunRefs;
uniform highp sampler2D uVecRuns;
uniform vec2 uVecGridO;
uniform ivec2 uVecGridN;
uniform vec2 uVecShOff;

const float VEC_CELL = ${f1(CELL_SIZE)};
const int VEC_MAX_DEPTH = ${MAX_DEPTH};
const int VEC_CELL_LEAF = ${CELL_LEAF};
const int VEC_C_LUMEN = ${C_LUMEN};
const int VEC_C_SHADOW = ${C_SHADOW};
const int VEC_C_GLOW = ${C_GLOW};
const int VEC_C_RING = ${C_RING};
const int VEC_C_JOIN = ${C_JOIN};
const int VEC_L_SINGLE = ${L_SINGLE};
const int VEC_L_LAYERED = ${L_LAYERED};
const int VEC_L_CROSS = ${L_CROSS};
const int VEC_L_JOIN = ${L_JOIN};
const int VEC_L_WIDE = ${L_WIDE};
const int VEC_L_MORPH = ${L_MORPH};
const int VEC_SLOTS = ${SLOTS};
const int VEC_SLOTS_WIDE = ${SLOTS_WIDE};
const int VEC_R_ON = ${R_ON};
const float VEC_BOUND_HEADROOM = ${f1(BOUND_HEADROOM)};

struct VecLeaf { int cls; bool crossTier; int runStart; int runCount; int joinStart; int joinCount; int candMax; int depth; int owner; };
struct VecRun { int id; int row; int i0; int i1; int flags; vec4 chord; vec4 rad; vec4 box; };
`;

export const HIER_LOOKUP_FUNCS = `
// The leaf at a world point, or -1 (outside the grid, or an empty cell or node). The one rule: every program calls this with its own
// inv × gl_FragCoord.xy, so exactly one leaf owns a pixel. Node n is texel (n % ${NODE_W}, n / ${NODE_W}); a child is kind << 30 | index (1 leaf, 2 node, 0 empty).
int vecLeafAt(vec2 world) {
  int cx = int(floor((world.x - uVecGridO.x) / VEC_CELL));
  int cy = int(floor((world.y - uVecGridO.y) / VEC_CELL));
  if (cx < 0 || cy < 0 || cx >= uVecGridN.x || cy >= uVecGridN.y) return -1;
  uvec4 cell = texelFetch(uVecCells, ivec2(cx, cy), 0);
  int kind = int(cell.x);
  if (kind == 0) return -1;
  int idx = int(cell.y) | (int(cell.z) << 16);
  if (kind == VEC_CELL_LEAF) return idx;
  float ox = uVecGridO.x + float(cx) * VEC_CELL;
  float oy = uVecGridO.y + float(cy) * VEC_CELL;
  float h = VEC_CELL * 0.5;
  for (int d = 0; d < VEC_MAX_DEPTH; d++) {
    int qx = world.x >= ox + h ? 1 : 0;
    int qy = world.y >= oy + h ? 1 : 0;
    int q = 2 * qy + qx;
    uvec4 nd = texelFetch(uVecNodes, ivec2(idx & ${NODE_W - 1}, idx >> ${Math.log2(NODE_W)}), 0);
    uint ch = q == 0 ? nd.x : q == 1 ? nd.y : q == 2 ? nd.z : nd.w;
    int ck = int(ch >> 30u);
    int ci = int(ch & 1073741823u);
    if (ck == 0) return -1;
    if (ck == 1) return ci;
    idx = ci;
    ox += float(qx) * h;
    oy += float(qy) * h;
    h *= 0.5;
  }
  return -1;
}

// Leaf l: two texels, (2 · (l % ${LEAF_ROW}) + t, l / ${LEAF_ROW}). owner is the vessel row of an L_SINGLE leaf, else -1.
VecLeaf vecLeafRead(int leaf) {
  int x = (leaf & ${LEAF_ROW - 1}) * 2;
  int y = leaf >> ${Math.log2(LEAF_ROW)};
  uvec4 t0 = texelFetch(uVecLeaves, ivec2(x, y), 0);
  uvec4 t1 = texelFetch(uVecLeaves, ivec2(x + 1, y), 0);
  VecLeaf r;
  r.cls = int(t0.x & 255u);
  r.crossTier = (t0.x & 256u) != 0u;
  r.runStart = int(t0.y);
  r.runCount = int(t0.z);
  r.joinStart = int(t0.w);
  r.joinCount = int(t1.x);
  r.candMax = int(t1.y);
  r.depth = int(t1.z);
  r.owner = t1.w == ${NO_OWNER}u ? -1 : int(t1.w);
  return r;
}

// A run reference (absolute index into the run-ref list: lf.runStart + n): runId | bits << 24. One reference a run, all its bits together.
uint vecRunRef(int i) {
  return texelFetch(uVecRunRefs, ivec2(i & ${LIST_W - 1}, i >> ${Math.log2(LIST_W)}), 0).x;
}
int vecRefRun(uint ref) { return int(ref & 16777215u); }
int vecRefBits(uint ref) { return int(ref >> 24u); }

// A run (A's run table, ${RUN_TEXELS} texels a run at (k · ${RUN_TEXELS} + t, row), runId = row · ${RUNS_PER_ROW} + k): chord = a.xy, b.xy; rad = the bound radii
// (lumen, shadow, glow, ring; 0: that contribution has no bound here); i0, i1 = the run's first and last segment; box = the morph box.
VecRun vecRunRead(int runId) {
  int row = runId >> ${Math.log2(RUNS_PER_ROW)};
  int x = (runId & ${RUNS_PER_ROW - 1}) * ${RUN_TEXELS};
  vec4 t2 = texelFetch(uVecRuns, ivec2(x + 2, row), 0);
  VecRun r;
  r.id = runId;
  r.row = row;
  r.i0 = int(t2.x);
  r.i1 = int(t2.y);
  r.flags = int(t2.z);
  r.chord = texelFetch(uVecRuns, ivec2(x, row), 0);
  r.rad = texelFetch(uVecRuns, ivec2(x + 1, row), 0);
  r.box = texelFetch(uVecRuns, ivec2(x + 3, row), 0);
  return r;
}

// Whether the pixel at \`world\` is inside the run's bound for one contribution (the point-to-capsule distance, squared, against the radius,
// squared). Shadow: the capsule is the chord moved by uVecShOff. VEC_C_JOIN: true
// (a junction's bound is its disc: the join part). A zero radius is no bound: false. The caller passes the pixel, never the shadow's shifted point.
bool vecBoundHit(VecRun run, int contribution, vec2 world) {
  if (contribution == VEC_C_JOIN) return true;
  vec2 p = world;
  float r = run.rad.x;
  if (contribution == VEC_C_SHADOW) { p = world - uVecShOff; r = run.rad.y; }
  else if (contribution == VEC_C_GLOW) r = run.rad.z;
  else if (contribution == VEC_C_RING) r = run.rad.w;
  if (r <= 0.0) return false;
  vec2 a = run.chord.xy;
  vec2 ab = run.chord.zw - a;
  vec2 ap = p - a;
  float l2 = dot(ab, ab);
  float h = l2 > 0.0 ? clamp(dot(ap, ab) / l2, 0.0, 1.0) : 0.0;
  vec2 d = ap - ab * h;
  return dot(d, d) <= r * r;
}

// The same question for a morph set's leaf (class VEC_L_MORPH): the run's bound is its morph box (texel 3), which already holds every contribution's
// reach over the whole stretch, so it is inside-the-box for any contribution the run has (a zero radius is none). Use it in a morph set's programs only.
bool vecBoundHitBox(VecRun run, int contribution, vec2 world) {
  if (contribution == VEC_C_JOIN) return true;
  float r = contribution == VEC_C_LUMEN ? run.rad.x : contribution == VEC_C_SHADOW ? run.rad.y : contribution == VEC_C_GLOW ? run.rad.z : run.rad.w;
  return r > 0.0 && world.x >= run.box.x && world.y >= run.box.y && world.x <= run.box.z && world.y <= run.box.w;
}
`;

export const HIER_JOIN_DECLS = `
uniform int uVecJoinRow0;
struct VecJoin { vec2 c; float k; float reach; ivec4 rows; int trunk; int trunkIdx; bool fork; float fillet; };
`;

export const HIER_JOIN_FUNCS = `
// A join reference (absolute index into the ref list: lf.joinStart + j): the join's index in the join records.
int vecJoinRef(int i) {
  return int(texelFetch(uVecRunRefs, ivec2(i & ${LIST_W - 1}, i >> ${Math.log2(LIST_W)}), 0).x);
}

// Where join j's first texel is in the float table: x = (j % ${JOIN_PER_ROW}) · ${JOIN_TEXELS}, y = uVecJoinRow0 + j / ${JOIN_PER_ROW}.
int vecJoinTexelX(int j) { return (j % ${JOIN_PER_ROW}) * ${JOIN_TEXELS}; }
int vecJoinTexelY(int j) { return uVecJoinRow0 + j / ${JOIN_PER_ROW}; }

// A join (A's join record, ${JOIN_TEXELS} texels in the float table below the runs, at vecJoinTexelX/Y): c = x, y; k = the blend width; reach; rows = the member rows (-1 none); trunk = the trunk
// member as A stores it, trunkIdx = its index 0..3 in rows (-1 none); fork; fillet.
VecJoin vecJoinRead(int j) {
  int x = vecJoinTexelX(j);
  int y = vecJoinTexelY(j);
  vec4 t0 = texelFetch(uVecRuns, ivec2(x, y), 0);
  vec4 t1 = texelFetch(uVecRuns, ivec2(x + 1, y), 0);
  vec4 t2 = texelFetch(uVecRuns, ivec2(x + 2, y), 0);
  VecJoin r;
  r.c = t0.xy;
  r.k = t0.z;
  r.reach = t0.w;
  r.rows = ivec4(t1);
  r.trunk = int(t2.x);
  r.trunkIdx = r.rows.x == r.trunk ? 0 : r.rows.y == r.trunk ? 1 : r.rows.z == r.trunk ? 2 : r.rows.w == r.trunk ? 3 : -1;
  r.fork = t2.y > 0.5;
  r.fillet = t2.z;
  return r;
}

// Whether the pixel is inside the join's disc: reach × BOUND_HEADROOM (classic's cut-off; the junction's bound, contribution VEC_C_JOIN; A's joinDisc, plan r1.1).
bool vecJoinHit(VecJoin jn, vec2 world) {
  vec2 d = world - jn.c;
  float r = jn.reach * VEC_BOUND_HEADROOM;
  return dot(d, d) <= r * r;
}
`;

export const HIER_DECLS = HIER_LOOKUP_DECLS + HIER_JOIN_DECLS;
export const HIER_FUNCS = HIER_LOOKUP_FUNCS + HIER_JOIN_FUNCS;
/** The lookup without any join (the strips' programs): samplers, uniforms and vecLeafAt, vecLeafRead, vecRunRef, vecRefRun, vecRefBits, vecRunRead, vecBoundHit, vecBoundHitBox. */
export const HIER_LOOKUP_GLSL = HIER_LOOKUP_DECLS + HIER_LOOKUP_FUNCS;
/** The join part (the region shaders'): uVecJoinRow0, VecJoin, vecJoinRef, vecJoinRead, vecJoinHit. Put it after HIER_LOOKUP_GLSL. */
export const HIER_JOIN_GLSL = HIER_JOIN_DECLS + HIER_JOIN_FUNCS;
/** The whole lookup: both parts. Put it after the program's precision statements and before any use. */
export const HIER_GLSL = HIER_LOOKUP_GLSL + HIER_JOIN_GLSL;
