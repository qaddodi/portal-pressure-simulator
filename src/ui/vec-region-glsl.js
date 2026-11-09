// The vector vessel renderer's interaction region shaders (docs/recommendations/vector-renderer-plan.md, sections 4 and 5.2, and the
// revision, vector-renderer-plan-r1.md, sections 2.3 and 2.4; workstream C).
//
// TWO PROGRAMS LIVE HERE until E's switch-over:
//   · the current one, vecRegionFS(variant, K, parts): one quad per region cell of the fixed 16-unit grid, a member loop over the region's
//     record (up to MAX_MEMBERS, the nearest SLOTS kept). It keeps building so E's visibility fix keeps working;
//   · the revision's, vecRegionFS(variant, leafClass, K, parts): one program per LEAF CLASS (L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH), one
//     instanced quad per leaf of that class (K's LEAF_BOX), each fragment drawing only where the leaf lookup finds its own leaf.
//
// The revision's fragment is the reviewer's five steps, in order (plan r1 section 2.4):
//   1. reject the leaf: the pixel finds its leaf by the one formula every Vector program uses (world = inv × gl_FragCoord.xy, the cell, the
//      nodes by exact halving: vecLeafIdAt), and draws only if that is the quad's own leaf;
//   2. reject runs: each run reference of the leaf lists the contributions the run reaches the leaf with (lumen, shadow, glow, ring, join);
//      the pixel is tested against the capsule bound of each (vecBoundHit); a run that survives no bound is skipped;
//   3. distances for survivors only: B's vecNear over the surviving runs' segments (4 each), a vessel's several runs merged into its one
//      nearest point (vecNearMore); the candidates are the vessels with a surviving run;
//   4. junctions and depth: only the joins whose disc covers the pixel, each with the members the compiler listed as required; tiers and z as
//      before;
//   5. shade: each candidate only for the contributions it survived (a vessel that survives only by its glow adds only its glow), composed
//      in classic's order, so the picture is the classic one; then the blood (D's vecBloodMix over the lumens joined to the owner).
// No candidate is ever dropped: the candidate array holds SLOTS (8), or SLOTS_WIDE (32) in the L_WIDE program; a pixel that finds more
// survivors than its array holds (or more covering joins than MAX_JOINS) is drawn MAGENTA, loud, not hidden: a compiler bug to report. In the
// blood variant such a pixel is left alone (the magenta of the picture under it stays).
//
// Per class, only the work the class needs (the same classic arithmetic, unused parts not emitted):
//   L_LAYERED  vessels whose lumens cannot meet and no join: tier order, the nearest owns, no crossing depth, no fillet, no ring;
//   L_CROSS    lumens or casings that overlap, not connected: depth by z (the front lumen owns), the casing, the knock-out ring, the front stream;
//   L_JOIN     a connected junction (cross-tier included): the complete resolve over the leaf's joins: smin fillet, corner(), trunk and fork,
//              run-on stretches, the cross-tier copies (keep, pres, tin), the blend and the streams joined to the owner;
//   L_WIDE     L_JOIN with SLOTS_WIDE candidates (a genuine multiway junction or pile);
//   L_MORPH    L_JOIN whose joins (centre, reach, blend width, fillet) come from the frame's join rows, and whose run bounds are the morph box.
// The groups are composited whole (accB behind the organs, accN the network, faded ONCE by netAlpha, accT the lifted tier and the selected
// vessel's own share): wherever vessels overlap, the group's alpha applies once.
//
// A pixel one vessel reaches calls B's vecShadeOne and D's vecBlood unchanged, which is what makes a leaf edge seamless with the strips.

// ── The current program (kept until E's switch-over), described in its own header: ──
//
// A region is a cell of the compiled grid (vec-contract.js) where vessels interact: a connected junction, an unconnected crossing, a
// cross-tier junction, a hairpin or self-overlap, a long run, a close approach, a morph. One instanced quad per region cell, the cell's exact
// square. The fragment finds its cell from its own pixel centre (the one formula every Vector program uses: world = inv × gl_FragCoord.xy,
// cell = floor((world − gridO) / CELL)), draws only when that cell is this quad's own region cell, reads the region record, and over the
// region's members alone does what the classic vessel shader does today (veins-gl.js vesselFS, lines 280 to 896, read, not edited):
//  1. each member's nearest point over its own run (B's vecNear, and vecNearMore for a vessel's other runs), several runs of one vessel merged into one; the nearest SLOTS kept;
//  2. the joins: which members are joined here and how widely (fillet width jk, its share js, reach fall-off jf);
//  3. the cross-tier hand-off (keep, pres): a tributary ending on a trunk of a lower tier draws a copy of the trunk near the join;
//  4. the tiers back to front: glow, the tier's shape (smin fillet between joined members, corner(), trunk and fork roles, run-on stretches,
//     the deep blend), the owner of the pixel (a crossing: the front lumen), the trunk's lumen over a copied vein's end (tin), the
//     knock-out ring (kn, kcas), tubeShade; the network group composited whole (accN) then faded once by netAlpha, the selected vessel's own
//     share laid over it (accT): the group's alpha applies once, wherever vessels overlap;
//  5. the blood: the stream of the owning lumen, and (at a confluence) the next lumen's, each in its own (row, along, across), blended by
//     D's vecBloodMix with weights that sum to one; at an unconnected crossing the front lumen's stream only (the other is not in `conn`);
//  6. one dithered, premultiplied write.
// A pixel where only one member reaches calls B's vecShadeOne and D's vecBlood unchanged, which is what makes a cell edge seamless: the
// stretch shader on the other side of the edge calls the very same functions on the very same inputs.
//
// What it builds on is the shared text of workstream B (vec-shade-glsl.js, VEC_SHADE_GLSL(K), K the instance's flags and VEIL_K): the host
// declarations, the one cell test (vecWorld(), vecCellAt(p)), shadeGLSL (vesAttrs, glowAmt, shadowOf, tubeShade, ditherOut) and
//  struct VecNear { float d, h, r, u, x, v; vec2 g; float aM, aW, aU; };  vecNear / vecNearMore (a vessel's other runs) / vecNearNone,
//  vecOccl(p), vecStreamAt(row, nr), and vecShadeOne(row, nr, p, occl, out lum, out lumCol): the pixel one vessel makes, premultiplied,
// and of workstream D's blood text (vecBlood, vecBloodMix; premultiplied layers) and workstream G's vecAboveAt(w) for the V_BLOOD variant.
// The blood is laid as B's stretch shader lays it (vis = lum / o.a, lit = layer.rgb * vis + lumCol * (1 - layer.a * vis)), so a pixel one
// vessel reaches is the very same value from either program. This file declares only what is its own (the region texture, reachU for the
// slot admission as classic's, the kept base under the blood is B's vecBase), and smin() and corner(), the join arithmetic.
// The region quad carries its cell; the fragment draws only where the cell test finds that cell's own region, so a pixel is drawn by one program.

import { CELL } from './veins-bin.js';
import { EDGE_GLSL } from './edge.js';
import { VEC_PRECISION, VEC_SHADE_GLSL } from './vec-shade-glsl.js';
import { VEC_ABOVE_GLSL } from './vec-stretch-glsl.js';
import { VEC_BLOOD_GLSL } from './vec-blood-glsl.js';
import { HIER_GLSL, HIER_UNIFORMS } from './vec-hier-glsl.js';
import {
  GRID_W, CELL_REGION, MAX_MEMBERS, MAX_JOINS, SLOTS, JOIN0, REGION_TEXELS, K_JOIN, K_CROSS, K_HAIRPIN, K_CROSSTIER, K_NEAR, K_LONG, K_MORPH,
  M_LUMEN, M_JOINED, M_TRUNK, FORK_BIT, MASK_SPLIT, V_FULL, V_BASE, V_BLOOD,
  // contract v2 (vector-renderer-plan-r1.md section 2.5)
  C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS_WIDE,
  REGION_QUAD_PAD_PX,
} from './vec-contract.js';
export { C_LUMEN, C_SHADOW, C_GLOW, C_RING, C_JOIN, L_SINGLE, L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH, SLOTS_WIDE, HIER_UNIFORMS };

/** The classes this file builds a program for, and what each needs: slots (the candidate array), joins (the junction resolve), cross (depth and the knock-out ring), morph. */
export const LEAF_CLASSES = Object.freeze({
  [L_LAYERED]: Object.freeze({ name: 'L_LAYERED', slots: SLOTS, joins: false, cross: false, morph: false }),
  [L_CROSS]: Object.freeze({ name: 'L_CROSS', slots: SLOTS, joins: false, cross: true, morph: false }),
  [L_JOIN]: Object.freeze({ name: 'L_JOIN', slots: SLOTS, joins: true, cross: true, morph: false }),
  [L_WIDE]: Object.freeze({ name: 'L_WIDE', slots: SLOTS_WIDE, joins: true, cross: true, morph: false }),
  [L_MORPH]: Object.freeze({ name: 'L_MORPH', slots: SLOTS, joins: true, cross: true, morph: true }),
});

/** The uniforms the CURRENT program declares (E sets them; the host declarations of B's text are B's and E's to agree). */
export const REGION_UNIFORMS = Object.freeze({
  vertex: ['world', 'size', 'gridO'],
  fragment: ['regionTex', 'reachU', 'morphOn', 'joinBase'],   // (the cell grid, inv, gridO, gridN and vecBase are B's text's, the others are shared: VEC_SHADE_UNIFORMS)
});

/** Attributes of the current vertex shader (a TRIANGLE_STRIP of 4, instanced per region cell): location 0 the unit corner (0 … 1), location 1 the region cell (cells across, cells down), per instance. */
export const REGION_ATTRIBS = Object.freeze({ aC: 0, aCell: 1 });

/**
 * The current region quad's vertex shader: the cell's exact square, `gridO + (cell + corner) · CELL`. `world` maps world → device pixels (y down),
 * as the classic layer's does; the fragment reads the cell again from its own pixel centre, so a vertex position never decides a cell.
 */
export const vecRegionVS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 aC;         // the unit corner, 0 … 1
layout(location=1) in vec2 aCell;      // the region cell: cells across, cells down (per instance)
uniform mat3 world;                    // world → device pixels
uniform vec2 size;                     // the picture, device pixels
uniform vec2 gridO;                    // the grid's origin (world)
flat out ivec2 vCell;
void main() {
  vCell = ivec2(aCell + 0.5);
  vec2 w = gridO + (aCell + aC) * ${CELL.toFixed(1)};
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;

/** Attributes of the leaf vertex shader (a TRIANGLE_STRIP of 4, instanced per leaf of the class): location 0 the unit corner, location 1 K's LEAF_BOX row (x0, y0, size, leaf index), per instance. */
export const LEAF_REGION_ATTRIBS = Object.freeze({ aC: 0, aBox: 1 });

/**
 * The leaf quad's vertex shader: the leaf's exact square, `box.xy + corner · box.z`, padded by REGION_QUAD_PAD_PX device pixels when the
 * contract has one (the fragment's own leaf lookup still decides every pixel, so a pad never makes two programs draw one pixel).
 * `world` maps world → device pixels (y down).
 */
export const vecLeafRegionVS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 aC;         // the unit corner, 0 … 1
layout(location=1) in vec4 aBox;       // the leaf: x0, y0, size (world), leaf index (per instance)
uniform mat3 world;                    // world → device pixels
uniform vec2 size;                     // the picture, device pixels
flat out int vLeaf;
void main() {
  vLeaf = int(aBox.w + 0.5);
  float pad = ${REGION_QUAD_PAD_PX.toFixed(1)} / max(length(world[0].xy), 1e-6);   // (world units of the pad)
  vec2 w = aBox.xy + (aC * 2.0 - 1.0) * pad + aC * aBox.z;
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;


// ── The leaf hierarchy's GLSL is K's (vec-hier-glsl.js, HIER_GLSL): the declarations (samplers, uniforms, VecLeaf, VecRun, VecJoin) and
//    int vecLeafAt(vec2 world)                          the leaf of the pixel (cell → nodes by exact halving), -1 where none
//    VecLeaf vecLeafRead(int leaf)                      { cls, crossTier, runStart, runCount, joinStart, joinCount, candMax, depth, owner }
//    uint vecRunRef(int i)                              the i-th run reference (absolute index into the list): runId | bits << 24
//    int vecRefRun(uint ref), int vecRefBits(uint ref)
//    VecRun vecRunRead(int runId)                       { id, row, i0, i1 (first and last segment), flags, chord, rad (rL rS rG rR), box }
//    bool vecBoundHit(VecRun, int contribution, vec2 world)      the pixel against the capsule bound of one contribution (the shadow's: the chord moved by shOff)
//    bool vecBoundHitBox(VecRun, int contribution, vec2 world)   the same for a morph set's leaf: the run's box over the stretch
//    int vecJoinRef(int i);  VecJoin vecJoinRead(int j)  { c, k, reach, rows (ivec4, -1 none), trunk (a row), trunkIdx, fork, fillet }
// This file declares none of it again. ──
/** What each class's program declares of its own (E sets them): the hierarchy's tables, and for L_MORPH the frame's join rows. */
export const leafRegionUniforms = (leafClass, hierUniforms = HIER_UNIFORMS) => {
  const cfg = LEAF_CLASSES[leafClass];
  if (!cfg) throw new RangeError(`leafRegionUniforms: unknown leaf class ${leafClass}`);
  return { vertex: ['world', 'size'], fragment: [...hierUniforms, ...(cfg.morph ? ['morphOn', 'joinBase'] : [])] };
};


/**
 * The shared fragment builder. cfg.kind 'legacy': the current program (region records, member loop, every contribution of every member);
 * cfg.kind 'leaf': one leaf class's program (the five steps; cfg.slots candidates, cfg.joins the junction resolve, cfg.cross depth and the
 * knock-out ring, cfg.morph the frame's joins and the morph box). The tier loop and the groups' compositing are the same text in both.
 */
function buildRegionFS(variant, K, parts, cfg) {
  if (variant !== V_FULL && variant !== V_BASE && variant !== V_BLOOD) throw new RangeError(`vecRegionFS: unknown variant ${variant}`);
  const legacy = cfg.kind === 'legacy';
  const J = legacy || cfg.joins, X = legacy || cfg.cross, G = !legacy;   // J: joins, X: depth and the ring, G: contributions gated by the bits that survived
  const slots = legacy ? SLOTS : cfg.slots;
  const isBlood = variant === V_BLOOD;
  const blood = variant === V_BASE ? '' : (parts.blood ?? VEC_BLOOD_GLSL), above = isBlood ? (parts.above ?? VEC_ABOVE_GLSL) : '';
  const hier = legacy ? '' : (parts.hier ?? HIER_GLSL);
  const { F_SEL, F_NOCASE, F_DOTTED, F_VEIL } = K;
  // The blood laid over the pixel o (lum: the lumen's coverage where blood may show; lumCol: the pixel's colour unpremultiplied), as B's stretch shader lays it.
  // `streams` computes `bl` (the blood layer) from the stream or streams of the lumen.
  const lay = (streams) => variant === V_BASE ? '  outColor = ditherOut(o, gl_FragCoord.xy);' : isBlood ? `  float vis = clamp(lum / max(o.a, 1e-3), 0.0, 1.0);
  if (!(vis > 0.005 && o.a > 0.01)) discard;
${streams}
  vec3 lit = bl.rgb * vis + lumCol * (1.0 - bl.a * vis);
  vec4 b = texelFetch(vecBase, ivec2(gl_FragCoord.xy), 0);
  vec4 r = vec4(b.rgb + o.a * (lit - lumCol), b.a);
  r = vec4(min(max(r.rgb, vec3(0.0)), vec3(r.a)), r.a);
  outColor = over(vecAboveAt(p), r);` : `  float vis = clamp(lum / max(o.a, 1e-3), 0.0, 1.0);
  if (vis > 0.005 && o.a > 0.01) {
${streams}
    vec3 lit = bl.rgb * vis + lumCol * (1.0 - bl.a * vis);
    o = vec4(lit * o.a, o.a);
  }
  outColor = ditherOut(o, gl_FragCoord.xy);`;
  // One vessel reaches the pixel: the very same functions the stretch shader calls, laid the same way.
  const single = `    vec4 o = ${legacy ? 'vecShadeOne(sid[0], sn[0], p, occl, lum, lumCol)' : 'vecShadeBits(sid[0], sn[0], p, occl, sbits[0], lum, lumCol)'};
    if (o.a < 0.002) discard;
${lay('    vec3 st = vecStreamAt(sid[0], sn[0]);\n    vecBloodAt(p);\n    vec4 bl = vecBlood(sid[0], st.x, st.y, st.z, lumCol, px);')}
    return;`;
  // Several reach it: the lumen in front, and a joined lumen's stream beside it, mixed by D's weights.
  const multi = lay(`    vecBloodAt(p);
    vec4 bl;
    if (gRow2 >= 0) {
      int rws[2]; float ss[2], yy[2], rr[2], ww[2];
      rws[0] = gRow; ss[0] = gS; yy[0] = gY; rr[0] = gR; ww[0] = 1.0 - gB;
      rws[1] = gRow2; ss[1] = gS2; yy[1] = gY2; rr[1] = gR2; ww[1] = gB;
      bl = vecBloodMix(2, rws, ss, yy, rr, ww, lumCol, px);
    } else bl = vecBlood(gRow, gS, gY, gR, lumCol, px);`);
  const shape = G ? ` && (sbits[s] & SHAPE_BITS) != 0` : '';   // a candidate that survived only by its glow is not in the tier's shape
  const glowOnly = G ? ` || (sbits[s] & ${C_GLOW}) == 0` : '';    // and a glow is computed only for a candidate whose glow bound reaches the pixel
  // Who is joined to the owner (the join loops), or only the owner.
  const connOf = J ? `for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }` : '';

  // ── The front: which candidates reach the pixel, and the joins ──
  const frontLegacy = `  // ── The partition: this pixel's cell, from its own centre. Drawn only by this cell's own region quad. ──
  vec2 p = vecWorld();
  uvec4 ct = vecCellAt(p);
  uvec4 own = vecCellAt(gridO + (vec2(vCell) + 0.5) * ${CELL.toFixed(1)});   // (this quad's own cell: a pixel centre that finds another cell is that cell's)
  if (int(ct.r) != ${CELL_REGION} || int(own.r) != ${CELL_REGION} || ct.g != own.g) discard;
  int rg = int(ct.g);
  vec4 r0 = RG(rg, 0);
  vec2 ps = p - shOff;
  float reach = reachU + 2.0 * px;

  // ── Nearest point of each member vessel (several runs of one vessel merged), the nearest MAXS kept ──
  int nm = min(int(r0.y + 0.5), MAXM);
  int n = 0;
  int sid[MAXS];
  float sk[MAXS];
  VecNear sn[MAXS];
  int mrow[MAXM];
  for (int m = 0; m < MAXM; m++) mrow[m] = -1;
  for (int m = 0; m < MAXM; m++) {
    if (m >= nm) break;
    vec4 mt = RG(rg, 1 + m);
    int row = int(mt.x + 0.5);
    mrow[m] = row;
    int at = -1;
    for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == row) at = s;
    if (at >= 0) { sn[at] = vecNearMore(sn[at], row, int(mt.y + 0.5), int(mt.z + 0.5), p, ps); sk[at] = sn[at].d - (T(row, 10).a > 0.0 ? 16.0 : 0.0); continue; }
    VecNear nr = vecNear(row, int(mt.y + 0.5), int(mt.z + 0.5), p, ps);
    if (min(nr.d, nr.h) < reach) {
      // When the slots are full, the vessel that matters least here gives way: the farthest, a glowing one counting as nearer by its glow's width.
      int slot = n;
      float key = nr.d - (T(row, 10).a > 0.0 ? 16.0 : 0.0);
      if (n == MAXS) {
        slot = 0;
        for (int s = 1; s < MAXS; s++) if (sk[s] > sk[slot]) slot = s;
        if (key >= sk[slot]) slot = -1;
      } else n++;
      if (slot >= 0) { sk[slot] = key; sid[slot] = row; sn[slot] = nr; }
    }
  }
  if (n == 0) discard;
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS], sx[MAXS], sv[MAXS];
  vec2 sg[MAXS];
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    sd[s] = sn[s].d; sh[s] = sn[s].h; sr[s] = sn[s].r; su[s] = sn[s].u; sx[s] = sn[s].x; sg[s] = sn[s].g;
    sv[s] = sn[s].aW > 0.0 ? sn[s].aU / sn[s].aW : sn[s].u;
  }
  float occl = vecOccl(p);

  // ── One vessel reaches this pixel: the very same functions the stretch shader calls ──
  if (n == 1) {
    float lum;
    vec3 lumCol;
${single}
  }

  // ── Members to slots (a vessel's several runs share its slot) ──
  int msl[MAXM];
  for (int m = 0; m < MAXM; m++) {
    msl[m] = -1;
    if (m >= nm) continue;
    for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == mrow[m]) msl[m] = s;
  }

  // ── Junctions: which of these vessels are joined here, and how widely ──
  int jn = 0;
  int jm[MAXJ], jt[MAXJ], jtf[MAXJ];  // (jt: the members that are the trunk the others end on; jtf: those of them at a fork)
  float jk[MAXJ], jf[MAXJ], js[MAXJ];
  int njr = min(int(r0.z + 0.5), MAXJ);
  bool morph = morphOn >= 1 && (int(r0.x + 0.5) & ${K_MORPH}) != 0;
  for (int k = 0; k < MAXJ; k++) {
    if (k >= njr || jn == MAXJ) break;
    vec4 A = RG(rg, JOIN0 + 2 * k), B = RG(rg, JOIN0 + 2 * k + 1);
    // (A morph region: the join as this frame has it. The record's A.x is its row in the frame's joins; the row holds centre, reach, and the
    // blend width and fillet packed as the entries do.)
    if (morph) { vec4 F = JT(int(A.x + 0.5)); A = vec4(F.xy, floor(F.w) * 0.01, F.z); B.w = fract(F.w) / 0.99; }
    float dc = length(p - A.xy);
    if (dc > A.w) continue;
    // (B.x the member mask's bits 0 … MASK_SPLIT−1, B.z its bits MASK_SPLIT …; B.y the trunk member, plus FORK_BIT at a fork, −1 none; B.w the fillet)
    int mlo = int(B.x + 0.5), mhi = int(B.z + 0.5), mask = 0, c = 0, tm = 0, tfm = 0;
    int tmi = int(B.y + 0.5) & (FORK_BIT - 1);
    bool fork = B.y > float(FORK_BIT) - 0.5;
    for (int m = 0; m < MAXM; m++) {
      if ((m < MASK_SPLIT ? (mlo & (1 << m)) : (mhi & (1 << (m - MASK_SPLIT)))) == 0 || msl[m] < 0) continue;
      int s = msl[m];
      if ((mask & (1 << s)) != 0) continue;
      mask |= 1 << s; c++;
      if (B.y > -0.5 && m == tmi) { tm |= 1 << s; if (fork) tfm |= 1 << s; }
    }
    if (c < 2) continue;
    jm[jn] = mask; jt[jn] = tm; jtf[jn] = tfm; js[jn] = clamp(B.w, 0.0, 1.0);
    jk[jn] = A.z * (1.0 - smoothstep(0.55 * A.w, A.w, dc)); jf[jn] = 1.0 - smoothstep(0.3 * A.w, 0.85 * A.w, dc); jn++;
  }`;

  const bound = cfg.morph ? 'vecBoundHitBox' : 'vecBoundHit';
  const joinOf = cfg.morph ? `// (A morph leaf: the join as this frame has it. The frame's join row for join j holds centre, reach, and the blend width and fillet packed as the
// entries do; the row is the join's own index (A: packJoins writes the table in graph order, the binning's ent rows from joinBase).)
VecJoin joinOf(int j) {
  VecJoin J = vecJoinRead(j);
  if (morphOn >= 1) { vec4 F = JT(j); J.c = F.xy; J.k = floor(F.w) * 0.01; J.reach = F.z; J.fillet = fract(F.w) / 0.99; }
  return J;
}` : 'VecJoin joinOf(int j) { return vecJoinRead(j); }';
  const frontLeaf = `  // ── 1. Reject the leaf: this pixel's leaf, from its own centre by the one formula. Drawn only by this leaf's own quad. ──
  vec2 p = vecWorld();
  int leaf = vecLeafAt(p);
  if (leaf < 0 || leaf != vLeaf) discard;
  VecLeaf L = vecLeafRead(leaf);
  vec2 ps = p - shOff;
  bool overflow = false;   // more survivors than the array holds: the pixel is magenta, nothing is dropped
${J ? `
  // ── 4a. Joins whose disc covers this pixel (the others cannot change it) ──
  int jcov = 0;
  int jix[MAXJ];
  float jdc[MAXJ];
  for (int i = 0; i < L.joinCount; i++) {
    int ji = vecJoinRef(L.joinStart + i);
    VecJoin Jr = joinOf(ji);
    float dc = length(p - Jr.c);
    if (dc > Jr.reach) continue;
    if (jcov == MAXJ) { overflow = true; continue; }
    jix[jcov] = ji; jdc[jcov] = dc; jcov++;
  }
` : ''}
  // ── 2 and 3. Reject runs by the bound of each contribution they reach the leaf with; vecNear for the survivors only, a vessel's runs merged ──
  int n = 0;
  int sid[MAXS];
  int sbits[MAXS];   // the contributions each candidate survived
  VecNear sn[MAXS];
  for (int i = 0; i < L.runCount; i++) {
    uint ref = vecRunRef(L.runStart + i);
    VecRun R = vecRunRead(vecRefRun(ref));
    int bits = vecRefBits(ref), sb = 0;
    for (int b = 0; b < 4; b++) {
      int bit = 1 << b;
      if ((bits & bit) != 0 && ${bound}(R, bit, p)) sb |= bit;
    }
${J ? `    // (a run listed for a join survives where a join covering this pixel lists its vessel: the join's required members)
    if ((bits & ${C_JOIN}) != 0) for (int j = 0; j < MAXJ; j++) {
      if (j >= jcov) break;
      VecJoin Jr = joinOf(jix[j]);
      for (int m = 0; m < 4; m++) if (Jr.rows[m] == R.row) sb |= ${C_JOIN};
    }
` : ''}    if (sb == 0) continue;
    int at = -1;
    for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == R.row) at = s;
    if (at < 0) {
      if (n == MAXS) { overflow = true; continue; }
      at = n; n++;
      sid[at] = R.row; sbits[at] = 0; sn[at] = vecNearNone();
    }
    sn[at] = vecNearMore(sn[at], R.row, R.i0, R.i1, p, ps);
    sbits[at] |= sb;
  }
  if (overflow) {
${isBlood ? '    discard;   // (the picture under the blood already carries the magenta)' : '    outColor = vec4(1.0, 0.0, 1.0, 1.0);\n    return;'}
  }
  if (n == 0) discard;
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS], sx[MAXS], sv[MAXS];
  vec2 sg[MAXS];
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    sd[s] = sn[s].d; sh[s] = sn[s].h; sr[s] = sn[s].r; su[s] = sn[s].u; sx[s] = sn[s].x; sg[s] = sn[s].g;
    sv[s] = sn[s].aW > 0.0 ? sn[s].aU / sn[s].aW : sn[s].u;
  }
  float occl = vecOccl(p);

  // ── One vessel reaches this pixel: the very same functions the stretch shader calls ──
  if (n == 1) {
    float lum;
    vec3 lumCol;
${single}
  }
${J ? `
  // ── 4b. The joins that cover this pixel, over the candidates (a member that is not a candidate cannot be: the compiler lists the required ones) ──
  int jn = 0;
  int jm[MAXJ], jt[MAXJ], jtf[MAXJ];  // (jt: the members that are the trunk the others end on; jtf: those of them at a fork)
  float jk[MAXJ], jf[MAXJ], js[MAXJ];
  for (int i = 0; i < MAXJ; i++) {
    if (i >= jcov) break;
    VecJoin Jr = joinOf(jix[i]);
    float dc = jdc[i];
    int mask = 0, c = 0, tm = 0, tfm = 0;
    for (int m = 0; m < 4; m++) {
      int row = Jr.rows[m];
      if (row < 0) continue;
      int s = -1;
      for (int t = 0; t < MAXS; t++) if (t < n && sid[t] == row) s = t;
      if (s < 0 || (mask & (1 << s)) != 0) continue;
      mask |= 1 << s; c++;
      if (Jr.trunk >= 0 && row == Jr.trunk) { tm |= 1 << s; if (Jr.fork) tfm |= 1 << s; }
    }
    if (c < 2) continue;
    jm[jn] = mask; jt[jn] = tm; jtf[jn] = tfm; js[jn] = Jr.fillet;
    jk[jn] = Jr.k * (1.0 - smoothstep(0.55 * Jr.reach, Jr.reach, dc)); jf[jn] = 1.0 - smoothstep(0.3 * Jr.reach, 0.85 * Jr.reach, dc); jn++;
  }` : ''}`;

  // ── The tier loop and the compositing (the same text for both programs; the parts a class does not need are not emitted) ──
  const tn = J ? `  // Where a trunk runs on into the next stretch of its course at a fork (joined with no fillet), the trunk beside this pixel
  // is whichever of the two lies nearer: tn[s], for a vessel s the others end on (corner() reads its geometry).
  int tn[MAXS];
  for (int s = 0; s < MAXS; s++) tn[s] = s;
  for (int j = 0; j < MAXJ; j++) if (j < jn && js[j] < 0.01)
    for (int s = 0; s < MAXS; s++) if ((jm[j] & (1 << s)) != 0)
      for (int m = 0; m < MAXS; m++) if (m != s && (jm[j] & (1 << m)) != 0 && sd[m] < sd[tn[s]]) tn[s] = m;
` : '';
  const nothing = `  // ── Nothing to draw here: settled now, without the tiers below ──
  {
    float pull = 0.0, dMin = 1e9, sMin = 1e9;
${J ? '    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0) pull = max(pull, jk[j] * js[j] * 0.25);\n' : ''}    bool lit = false;
    for (int s = 0; s < MAXS; s++) {
      if (s >= n) break;
      dMin = min(dMin, sd[s]); sMin = min(sMin, sh[s]);
      if (T(sid[s], 10).a > 0.0 && sd[s] - T(sid[s], 0).w < 15.7) lit = true;
    }
    if (!lit && dMin - pull > 8.01 + 2.0 * px && sMin - pull > 6.01 + 2.0 * px) discard;
  }`;
  const keep = J ? `  // ── Hand-off at a join across tiers ──
  // A vessel that ends on one in a lower tier draws a copy of that one near the junction, so the join is one filleted shape; the lower
  // tier draws that vessel only for what the copy leaves (the hepatic veins on the cava): never "whichever was drawn last".
  float keep[MAXS];
  for (int s = 0; s < MAXS; s++) keep[s] = 1.0;
  for (int j = 0; j < MAXJ; j++) {
    if (j >= jn || jf[j] <= 0.0) continue;
    for (int t = 0; t < MAXS; t++) {
      if (t >= n || (jm[j] & (1 << t)) == 0) continue;
      int ti = int(stier[t] + 0.5);
      if (tierGroup[ti] == 2) continue;
      for (int s = 0; s < MAXS; s++) {
        if (s >= n || (jm[j] & (1 << s)) == 0 || stier[s] >= stier[t]) continue;
        int lt = int(stier[s] + 0.5);
        if (tierGroup[lt] == 2) continue;
        float shown = tierAlpha[lt] * (tierGroup[lt] == 0 ? 1.0 - occl * sof[s] : 1.0);
        float aC = sa[s] * jf[j] * min(tierAlpha[ti], shown), aO = sa[s] * shown;
        if (aO > 1e-4) keep[s] = min(keep[s], clamp((1.0 - aC / aO) / max(1.0 - aC, 1e-4), 0.0, 1.0));
      }
    }
  }
` : '';
  const lowerCopies = J ? `    if (grp != 2) for (int j = 0; j < MAXJ; j++) {
      int own = jm[j] & base;
      if (j >= jn || own == 0 || jf[j] <= 0.0) continue;
      for (int s = 0; s < MAXS; s++) {
        if (s >= n || (jm[j] & (1 << s)) == 0 || stier[s] >= tt) continue;
        int lt = int(stier[s] + 0.5);
        if (tierGroup[lt] == 2) continue;
        mem |= 1 << s;
        float shown = tierAlpha[lt] * (tierGroup[lt] == 0 ? 1.0 - occl * sof[s] : 1.0);
        pres[s] = max(pres[s], jf[j] * min(1.0, shown / max(tierAlpha[ti], 1e-3)) / (grp == 1 && tierGroup[lt] == 0 ? max(netAlpha, 1e-3) : 1.0));
      }
    }
` : '';
  const fillets = J ? `    for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || jk[j] <= 0.0) continue;
      int jj = jm[j] & mem;
      for (int a = 0; a < MAXS; a++) {
        if ((jj & (1 << a)) == 0) continue;
        for (int b = a + 1; b < MAXS; b++) {
          if ((jj & (1 << b)) == 0) continue;
          int ro = (jt[j] & (1 << a)) != 0 ? 1 : (jt[j] & (1 << b)) != 0 ? 2 : 0;
          bool fa = ro == 1 && (jtf[j] & (1 << a)) != 0, fb = ro == 2 && (jtf[j] & (1 << b)) != 0;
          int ta = fa ? tn[a] : a, tb = fb ? tn[b] : b;
          float kw = fa || fb ? jk[j] * js[j] : 0.0;
          float kk = jk[j] * js[j] * corner(p, sg[ta], sd[ta], sr[ta], sg[tb], sd[tb], sr[tb], ro, kw);
          D = min(D, smin(sd[a], sd[b], kk));
          Ds = min(Ds, smin(sh[a], sh[b], kk));
        }
      }
    }
` : '';
  // Which vessel owns this pixel: the nearest, unless it lies inside the lumen of an unjoined vessel drawn above it in the tier (a crossing: the front lumen).
  const owner = `    int ow = -1;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0 && (ow < 0 || sd[s] < sd[ow])) ow = s;
    int conn = 0;
    float kc = 0.0;
${J ? `    ${connOf}\n` : ''}${X ? `    for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || sd[s] >= 0.0 || (conn & (1 << s)) != 0) continue;
      bool sOwn = stier[s] == tt, oOwn = stier[ow] == tt;
      if (sOwn != oOwn ? !sOwn : sz[s] <= sz[ow]) continue;
      ow = s; conn = 0; kc = 0.0;
${J ? `      ${connOf}\n` : ''}    }
` : ''}${J ? `    // Inside the lumen of a copied trunk (the cava under the hepatic veins), the trunk owns the pixel: a vein's end does not show through
    // it as a second, brighter stub, so the join reads as one shape.
    float tin[MAXS];
    for (int s = 0; s < MAXS; s++) {
      tin[s] = 0.0;
      if ((mem & (1 << s)) == 0 || stier[s] == tt || grp != 1 || tierGroup[int(stier[s] + 0.5)] != 0) continue;
      tin[s] = clamp(-sd[s] / max(0.35 * sr[s], px), 0.0, 1.0) * step(1e-3, pres[s]);
      if (tin[s] > 0.5 && stier[ow] == tt) {
        ow = s; conn = 0; kc = 0.0;
        ${connOf}
      }
    }
` : ''}    conn = (conn | (1 << ow)) & mem;`;
  const blend = J ? `    // Attributes blended across the join by the same distances (soft weights), so colour, caliber and shading run on through the fillet.
    float m = 1e9;
    for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0) m = min(m, sd[s]);
    float tau = 0.3 * kc + 1e-3, W = 0.0, Wg = 0.0, R = 0.0, wall = 0.0, alpha = 0.0;
    vec3 col = vec3(0.0);
    vec2 g = vec2(0.0);
    for (int s = 0; s < MAXS; s++) {
      if ((conn & (1 << s)) == 0) continue;
      float w = s == ow && kc <= 0.0 ? 1.0 : exp(-(sd[s] - m) / tau);
      for (int t = 0; t < MAXS; t++) if ((conn & (1 << t)) != 0 && t != s) w *= 1.0 - tin[t];
      w = max(w, tin[s]);
      // (Two stretches of one course running on into each other, joined with less than a full fillet, blend all through.)
      bool run = false;
      for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && js[j] < 0.98 && (jm[j] & (1 << s)) != 0 && (jm[j] & (1 << ow)) != 0) run = true;
      // (Deep in the lumens, away from every wall, they blend all through too, so the shading runs on into a tributary.)
      float deep = 1.0 - smoothstep(-0.6 * sr[ow], -0.25 * sr[ow], max(sd[ow], sd[s]));
      int role = 0;
      float kw = 0.0;
      bool fk = false;
      for (int j = 0; j < MAXJ; j++) if (j < jn && (jm[j] & (1 << s)) != 0 && (jm[j] & (1 << ow)) != 0) {
        role = (jt[j] & (1 << s)) != 0 ? 1 : (jt[j] & (1 << ow)) != 0 ? 2 : role;
        if ((role == 1 && (jtf[j] & (1 << s)) != 0) || (role == 2 && (jtf[j] & (1 << ow)) != 0)) { fk = true; kw = jk[j] * js[j]; }
      }
      int ts = fk && role == 1 ? tn[s] : s, to = fk && role == 2 ? tn[ow] : ow;
      float wg = s == ow || run ? w : w * max(max(corner(p, sg[ts], sd[ts], sr[ts], sg[to], sd[to], sr[to], role, kw), deep), tin[s]);
      W += w; Wg += wg; R += wg * sr[s]; wall += wg * swall[s]; alpha += w * sa[s] * pres[s]; col += w * scol[s]; g += wg * sg[s];
    }
    R /= Wg; wall /= Wg; alpha /= W; col /= W;
    g = length(g) > 1e-5 ? normalize(g) : vec2(0.0);` : `    // No join here: the owner alone gives the shape's colour, caliber and direction (the blend of joined members is the owner's own).
    float R = sr[ow], wall = swall[ow], alpha = sa[ow] * pres[ow];
    vec3 col = scol[ow];
    vec2 g = length(sg[ow]) > 1e-5 ? normalize(sg[ow]) : vec2(0.0);`;
  const ring = X ? `    // Where vessels of one tier cross, the one drawn above is cut out of the one below by a ring of the figure's ground, with its casing
    // across the cut (the atlas convention). Only inside the lower lumen, never at a join, never for a vessel without a casing.
    float kn = 0.0, kcas = 0.0;
    if (fx == 1 && paperInk.a > 0.0) for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || (conn & (1 << s)) != 0 || stier[s] != tt || sz[s] <= sz[ow] || sd[s] < 0.0) continue;
      int fl = int(sflag[s] + 0.5);
      if ((fl & (${F_NOCASE} | ${F_DOTTED})) != 0) continue;
      float reachK = swall[s] + 2.5 * px, fa = clamp(sa[s] * pres[s], 0.0, 1.0) * ((fl & ${F_VEIL}) != 0 ? 0.5 : 1.0);
      kn = max(kn, fa * paperInk.a * clamp(0.5 - (sd[s] - reachK) / aa, 0.0, 1.0));
      kcas = max(kcas, fa * clamp(0.5 - (sd[s] - swall[s]) / aa, 0.0, 1.0));
    }` : `    float kn = 0.0, kcas = 0.0;   // (lumens and casings cannot meet in this class: no ring)`;
  const streams = J ? `      // The stream shown here: the two joined lumens with the largest share, by nearness and by how far past its own end each one runs.
      // Only the lumens joined to the owner (conn) count: an unconnected crossing's other lumen is never in the mix, the front lumen's
      // stream alone shows.
      float tb = max(0.7 * sr[ow], 1.5), w1 = 0.0, w2 = 0.0;
      int o1 = -1, o2 = -1;
      for (int s = 0; s < MAXS; s++) {
        if ((conn & (1 << s)) == 0 || (int(sflag[s] + 0.5) & ${F_DOTTED}) != 0) continue;
        float L2 = max(T(sid[s], 5).z, 1.0), ext = max(0.0, max(-su[s], su[s] - 1.0)) * L2;
        float wv = exp(-max(sd[s] - sd[ow], 0.0) / tb) * (s == ow ? 1.0 : pres[s]) * (1.0 - smoothstep(0.0, 1.1 * sr[s] + 1.5, ext)) + 1e-4;
        for (int t = 0; t < MAXS; t++) if ((conn & (1 << t)) != 0 && t != s) wv *= 1.0 - tin[t];   // inside the trunk, its stream
        if (wv > w1) { w2 = w1; o2 = o1; w1 = wv; o1 = s; }
        else if (wv > w2) { w2 = wv; o2 = s; }
      }
      if (o1 < 0) { o1 = ow; o2 = -1; }
      // A copy of a lower tier's vessel (a trunk under the veins that end on it) adds to the lumen that tier already showed and keeps its
      // stream: the blood runs on at full strength across the join instead of fading to what the copy alone covers.
      bool lower = stier[o1] != tt && gRow >= 0;
      if (lower) {
        bool same = false;
        for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0 && sid[s] == gRow) same = true;
        lower = same;
      }
      if (lower) {
        gW = min(1.0, lumA + gW * (1.0 - c.a * gf));
        if (o2 >= 0 && stier[o2] == tt && w2 > 0.01 * w1) {
          gRow2 = sid[o2]; gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gR2 = sr[o2]; gB = w2 / (w1 + w2);
        }
      } else {
        int id = sid[o1];
        gRow = id; gS = su[o1] * T(id, 5).z; gY = clamp(sx[o1] / max(sr[o1], 1e-3), -1.0, 1.0); gW = lumA; gR = sr[o1];
        gRow2 = -1; gB = 0.0;
        if (o2 >= 0 && w2 > 0.01 * w1) {
          gRow2 = sid[o2]; gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gR2 = sr[o2]; gB = w2 / (w1 + w2);
        }
      }` : `      // No join here: the owner's own stream alone shows (a crossing's front lumen; the other lumen is never in the mix).
      int id = sid[ow];
      gRow = id; gS = su[ow] * T(id, 5).z; gY = clamp(sx[ow] / max(sr[ow], 1e-3), -1.0, 1.0); gW = lumA; gR = sr[ow];
      gRow2 = -1; gB = 0.0;`;

  return `${VEC_PRECISION}const int MAXS = ${slots};
const int MAXJ = ${MAX_JOINS};
${legacy ? `const int MAXM = ${MAX_MEMBERS};
const int JOIN0 = ${JOIN0};
const int FORK_BIT = ${FORK_BIT};
const int MASK_SPLIT = ${MASK_SPLIT};
uniform highp sampler2D regionTex;     // the regions: REGION_TEXELS wide, one region a row (vec-contract.js)
uniform float reachU;                  // how far from a lumen anything is drawn (world): the slot admission, as classic's
` : `const int SHAPE_BITS = ${C_LUMEN | C_SHADOW | C_RING | C_JOIN};   // the contributions that make the tier's shape (a candidate with only its glow adds only its glow)
`}${legacy || cfg.morph ? `uniform int morphOn;                   // 1: a morph set (veins-sweep.js) is in use: the joins of its regions come from the frame's join rows
uniform int joinBase;                  // (morphOn) the texel of the frame's joins in ent: one a join (centre, reach, blend width and fillet, as the entries)
` : ''}${VEC_SHADE_GLSL(K)}${hier}${blood}${above}${isBlood ? 'uniform sampler2D vecBase;            // the kept still picture\n' : ''}${legacy ? 'flat in ivec2 vCell;' : 'flat in int vLeaf;'}
layout(location=0) out vec4 outColor;

${legacy ? 'vec4 RG(int r, int k) { return texelFetch(regionTex, ivec2(k, r), 0); }\n' : ''}${legacy || cfg.morph ? 'vec4 JT(int j) { int t = joinBase + j; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }\n' : ''}${J ? `float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
// How far two joined vessels make a corner at p (0 … 1): classic's corner(), unchanged (veins-gl.js): whether each one's centreline lies off
// the other's toward p. role 1: a is the trunk the other ends on, 2: b is, 0: a node either may lead; kw the fillet's width at a fork.
float corner(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role, float kw) {
  vec2 ca = p - ga * (da + ra), cb = p - gb * (db + rb);
  float o1 = dot(cb - ca, ga), o2 = dot(ca - cb, gb), rm = max(min(ra, rb), 0.5);
  float off = role == 1 ? o1 : role == 2 ? o2 : min(o1, o2);
  return smoothstep(0.25 * rm, 0.25 * rm + max(0.35 * rm, 0.9 * kw), off);
}
` : ''}${legacy || !J ? '' : joinOf + '\n'}void main() {
${legacy ? frontLegacy : frontLeaf}
${J ? tn : ''}
${nothing}

  // ── Per-vessel attributes ──
  float stier[MAXS], sz[MAXS], sflag[MAXS], sa[MAXS], swall[MAXS], shov[MAXS], ssel[MAXS], sof[MAXS];
  vec3 scol[MAXS], sedge[MAXS];
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
    vec3 aCol, aEdge;
    vesAttrs(sid[s], su[s], sv[s], p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
    stier[s] = aTier; sz[s] = aZ; sflag[s] = aFlag; swall[s] = aWall; sof[s] = aOf; scol[s] = aCol; shov[s] = aHov; ssel[s] = aSel; sedge[s] = aEdge;
    sa[s] = aA;
  }

${keep}  // ── Tiers, back to front ──
  // accB: behind the organs; accN: the network, composited whole and faded once by netAlpha below; accT: the lifted tier and the selected
  // vessel's own share. A fade or a focus therefore never darkens twice where vessels overlap.
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  vec4 topC = vec4(0.0);
  int topGrp = 1;
  float last = -1.0;
  // The frontmost lumen (for the blood laid in it) and how much of it shows; a second lumen joined to it, and its share.
  int gRow = -1, gRow2 = -1;
  float gS = 0.0, gY = 0.0, gW = 0.0, gS2 = 0.0, gY2 = 0.0, gB = 0.0, gR = 1.0, gR2 = 1.0;
  for (int it = 0; it < MAXS; it++) {
    float tt = 1e9;
    for (int s = 0; s < MAXS; s++) if (s < n && stier[s] > last && stier[s] < tt) tt = stier[s];
    if (tt > 1e8) break;
    last = tt;
    int ti = int(tt + 0.5);
    int grp = tierGroup[ti];
    // ── Glow: one thin soft band hugging a lit vessel's wall on both sides, down with the lit vessel's own tier.
    vec4 lg = vec4(0.0), lgU = vec4(0.0);
    for (int s = 0; s < MAXS; s++) {
      if (s >= n || stier[s] != tt${glowOnly}) continue;
      vec4 gc, ge;
      float gv = glowAmt(sid[s], sd[s], swall[s], sv[s], sa[s], gc, ge);
      if (gc.a <= 0.0) continue;
      bool up = ge.w > 5.0;
      // None inside another lit vessel's lumen: each band ends at the other's wall.
      for (int u = 0; u < MAXS; u++) if (u != s && u < n && T(sid[u], 10).a > 0.0) gv *= smoothstep(-0.6, 0.6, sd[u] - swall[u]);
      if (up) { if (gv > lgU.a) lgU = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv); }
      else if (gv > lg.a) lg = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv);
    }
    if (lgU.a > topC.a) { topC = lgU; topGrp = grp; }
    if (lg.a > 0.0) {
      if (grp == 0) accB = over(lg, accB);
      else if (grp == 1) accN = over(lg * min(1.0 / max(netAlpha, 1e-3), 1.0 / lg.a), accN);   // (accN is faded by netAlpha as a whole)
      else accT = over(lg, accT);
    }
    // Members: this tier's vessels${J ? ', and (except in the lifted tier) vessels of lower tiers that share a junction with one of them, faded\n    // out with distance from that junction' : ''}.
    float pres[MAXS];
    int mem = 0;
    for (int s = 0; s < MAXS; s++) { pres[s] = 0.0; if (s < n && stier[s] == tt${shape}) { mem |= 1 << s; pres[s] = ${J ? 'keep[s]' : '1.0'}; } }
    int base = mem;
${lowerCopies}    // The tier's shape: plain union${J ? ', filleted between vessels that share a junction, only in the corners between them' : ''}.
    float D = 1e9, Ds = 1e9;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0) { D = min(D, sd[s]); Ds = min(Ds, sh[s]); }
${fillets}    if (D > 8.0 + 2.0 * px && Ds > 6.0 + 2.0 * px) continue;
${owner}
${blend}
    int flags = int(sflag[ow] + 0.5);
    bool sel = (flags & ${F_SEL}) != 0;
    float cA = (flags & ${F_NOCASE}) != 0 ? 0.0 : (flags & ${F_DOTTED}) != 0 ? 0.35 : 1.0;
    float aa = px * ${EDGE_GLSL};
${ring}
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    vec4 c = tubeShade(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL);
    c *= alpha * tierAlpha[ti];
    float wsel = grp == 1 ? ssel[ow] : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
    float gf = grp == 0 ? 1.0 - occl * sof[ow] : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
    float lumA = aL * (1.0 - kn) * alpha * tierAlpha[ti] * gf;
    if (lumA > 0.02 && (flags & ${F_DOTTED}) == 0) {
${streams}
    } else gW *= 1.0 - c.a * gf;
    if (grp == 0) { c *= 1.0 - occl * sof[ow]; accB = over(c, accB); }
    else if (grp == 1) { accN = over(c, accN); if (wsel > 0.0) accT = over(c * wsel, accT); }
    else accT = over(c, accT);
  }
  if (topC.a > 0.0) {
    if (topGrp == 0) accB = over(topC, accB);
    else if (topGrp == 1) accN = over(topC * min(1.0 / max(netAlpha, 1e-3), 1.0 / topC.a), accN);
    else accT = over(topC, accT);
  }

  // ── The pixel, and the blood from the lumens' own coordinates: the owning lumen's stream, and a joined lumen's, mixed by D's weights ──
  vec4 o = over(accT, over(accN * netAlpha, accB));
  if (o.a < 0.002) discard;
  float lum = gRow >= 0 ? gW : 0.0;
  vec3 lumCol = o.a > 0.01 ? o.rgb / o.a : vec3(0.0);
${multi}
}`;
}

/**
 * The region fragment shader. Two forms:
 *   vecRegionFS(variant, K, parts)             the CURRENT program (region cells of the fixed grid), kept until E's switch-over;
 *   vecRegionFS(variant, leafClass, K, parts)  the revision's: one program for a leaf class (L_LAYERED, L_CROSS, L_JOIN, L_WIDE, L_MORPH).
 * variant: V_FULL lays blood in the lumen; V_BASE leaves it out; V_BLOOD adds the blood's change to the kept base picture and lays what lies
 * over the blood, and draws nothing where no blood shows. K: the flags and VEIL_K (vec-shade-glsl.js). parts: { blood, above, hier } the text
 * of D's and G's libraries and K's hierarchy lookup; the defaults are D's VEC_BLOOD_GLSL, B's VEC_ABOVE_GLSL and this file's provisional one.
 */
export const vecRegionFS = (variant, a, b, c) => {
  if (typeof a === 'number') {
    const cls = LEAF_CLASSES[a];
    if (!cls) throw new RangeError(`vecRegionFS: unknown leaf class ${a}`);
    return buildRegionFS(variant, b, c ?? {}, { kind: 'leaf', ...cls });
  }
  return buildRegionFS(variant, a, b ?? {}, { kind: 'legacy' });
};

/** What the renderer core takes as `parts.region` for the CURRENT program: { vs, fs(variant) }, for an instance's flags K (and D's and G's texts when they are ready). */
export const vecRegionParts = (K, parts = {}) => ({ vs: vecRegionVS, fs: (variant) => vecRegionFS(variant, K, parts) });

/** The revision's programs: { vs, fs(variant, leafClass), classes } for an instance's flags K (and D's, G's and K's texts when they are ready). */
export const vecLeafRegionParts = (K, parts = {}) => ({
  vs: vecLeafRegionVS, fs: (variant, leafClass) => vecRegionFS(variant, leafClass, K, parts), classes: Object.keys(LEAF_CLASSES).map(Number),
});


// ── JS mirrors of the compositing, for the tests (the GLSL above does the same arithmetic) ──

// ── JS mirrors, for the tests (the GLSL above does the same arithmetic) ──────────────────────────────────────────────────────────────

/** premultiplied "over": top + under · (1 − top.a). */
export const over = (top, under) => [top[0] + under[0] * (1 - top[3]), top[1] + under[1] * (1 - top[3]), top[2] + under[2] * (1 - top[3]), top[3] + under[3] * (1 - top[3])];

/**
 * The tier and group compositing of the region shader (accB, accN, accT): `layers` are the tiers' shapes back to front, each
 * { grp: 0 behind the organs, 1 the network, 2 lifted, c: premultiplied [r, g, b, a] (already times the vessel's alpha and tier alpha),
 * wsel: the selected vessel's own share (network layers) }. The network is composited whole and faded once by netAlpha; the selected
 * vessel's share is laid over it. Returns the premultiplied pixel.
 */
export function compositeGroups(layers, netAlpha) {
  let accB = [0, 0, 0, 0], accN = [0, 0, 0, 0], accT = [0, 0, 0, 0];
  for (const L of layers) {
    if (L.grp === 0) accB = over(L.c, accB);
    else if (L.grp === 1) { accN = over(L.c, accN); if ((L.wsel ?? 0) > 0) accT = over(L.c.map((v) => v * L.wsel), accT); }
    else accT = over(L.c, accT);
  }
  return over(accT, over(accN.map((v) => v * netAlpha), accB));
}

/**
 * Which member owns a pixel of one tier, as the shader decides it: the nearest, unless the pixel lies inside the lumen (sd < 0) of an
 * unjoined member drawn above it (greater z; a member of the tier outranks a copy from a lower tier). members: [{ sd, z, own (the tier's
 * own vessel, not a copy), joined: Set of member indexes it is joined to }]. Returns the index.
 */
export function pixelOwner(members) {
  let ow = -1;
  members.forEach((m, s) => { if (ow < 0 || m.sd < members[ow].sd) ow = s; });
  const connOf = (o) => members[o].joined ?? new Set();
  let conn = connOf(ow);
  members.forEach((m, s) => {
    if (s === ow || m.sd >= 0 || conn.has(s)) return;
    const sOwn = m.own !== false, oOwn = members[ow].own !== false;
    if (sOwn !== oOwn ? !sOwn : m.z <= members[ow].z) return;
    ow = s; conn = connOf(ow);
  });
  return ow;
}

/**
 * The stream shown at a pixel: the two lumens joined to the owner with the largest shares (nearness to the owner, fall-off past a
 * vessel's own end, the copy's presence), as the shader's weights w1, w2; the lumens not joined to the owner (an unconnected crossing's
 * other vessel) never take part. Returns [{ member, weight }] with weights summing to one: one entry (the owner or the strongest) or two.
 * members: [{ sd, r, u, len, pres, tin, dotted }]; conn: Set of the owner's joined members (the owner included); ow: the owner.
 */
export function pixelStreams(members, ow, conn) {
  const tb = Math.max(0.7 * members[ow].r, 1.5);
  let w1 = 0, w2 = 0, o1 = -1, o2 = -1;
  members.forEach((m, s) => {
    if (!conn.has(s) || m.dotted) return;
    const L2 = Math.max(m.len ?? 1, 1), ext = Math.max(0, Math.max(-m.u, m.u - 1)) * L2;
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    let wv = Math.exp(-Math.max(m.sd - members[ow].sd, 0) / tb) * (s === ow ? 1 : (m.pres ?? 1)) * (1 - sm(0, 1.1 * m.r + 1.5, ext)) + 1e-4;
    members.forEach((t, ti) => { if (conn.has(ti) && ti !== s) wv *= 1 - (t.tin ?? 0); });
    if (wv > w1) { w2 = w1; o2 = o1; w1 = wv; o1 = s; } else if (wv > w2) { w2 = wv; o2 = s; }
  });
  if (o1 < 0) return [{ member: ow, weight: 1 }];
  if (o2 >= 0 && w2 > 0.01 * w1) return [{ member: o1, weight: 1 - w2 / (w1 + w2) }, { member: o2, weight: w2 / (w1 + w2) }];
  return [{ member: o1, weight: 1 }];
}

// ── JS mirrors of the revision's candidate selection, for the tests (the GLSL above does the same arithmetic) ──────────────────────────

/** Squared distance from p to the capsule's axis, the segment a … b (the GLSL's vecCapsuleD2). */
export function capsuleD2(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], den = Math.max(abx * abx + aby * aby, 1e-12);
  const h = Math.min(1, Math.max(0, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / den));
  const dx = p[0] - a[0] - abx * h, dy = p[1] - a[1] - aby * h;
  return dx * dx + dy * dy;
}

/** Whether the pixel p is inside one contribution's bound of a run (vecBoundHit; the shadow's is tested at p − shOff). run: { chord: [ax, ay, bx, by], radii: [rL, rS, rG, rR] }. */
export function boundHit(run, bit, p, shOff = [0, 0]) {
  const r = bit === C_LUMEN ? run.radii[0] : bit === C_SHADOW ? run.radii[1] : bit === C_GLOW ? run.radii[2] : run.radii[3];
  const q = bit === C_SHADOW ? [p[0] - shOff[0], p[1] - shOff[1]] : p;
  return capsuleD2(q, [run.chord[0], run.chord[1]], [run.chord[2], run.chord[3]]) <= r * r;
}

/**
 * Steps 2 and 3 of the fragment for one pixel: the candidates of a leaf. leaf: { refs: [{ row, bits, chord, radii }], joins: [{ c: [x, y], reach, rows: [...] }] }.
 * Returns { cands: [{ row, bits, runs }] (the vessels with a surviving run, their survived contribution bits, and the runs that survived),
 * joins: the indexes of the joins whose disc covers p, overflow: more survivors than `slots` (or covering joins than MAX_JOINS): the pixel is
 * magenta in the program, nothing is dropped from `cands` here either (the overflow flag says the array would have been too small) }.
 */
export function leafCandidates(leaf, p, slots = SLOTS, shOff = [0, 0], bound = boundHit) {
  const covering = [];
  (leaf.joins ?? []).forEach((j, i) => { if (Math.hypot(p[0] - j.c[0], p[1] - j.c[1]) <= j.reach) covering.push(i); });
  const cands = [];
  (leaf.refs ?? []).forEach((ref, i) => {
    let sb = 0;
    for (const bit of [C_LUMEN, C_SHADOW, C_GLOW, C_RING]) if ((ref.bits & bit) !== 0 && bound(ref, bit, p, shOff)) sb |= bit;
    if ((ref.bits & C_JOIN) !== 0 && covering.some((ji) => leaf.joins[ji].rows.includes(ref.row))) sb |= C_JOIN;
    if (sb === 0) return;
    let c = cands.find((x) => x.row === ref.row);
    if (!c) { c = { row: ref.row, bits: 0, runs: [] }; cands.push(c); }
    c.bits |= sb; c.runs.push(i);
  });
  return { cands, joins: covering, overflow: cands.length > slots || covering.length > MAX_JOINS };
}

/** Whether a pixel with this many survivors is drawn magenta by the program of a class (the count L takes from the node replay): more than the class's array. */
export const overflowsClass = (survivors, leafClass) => survivors > (LEAF_CLASSES[leafClass]?.slots ?? SLOTS);

/** The contributions a candidate adds in the shader, from the bits it survived: the tier's shape (lumen, shadow, ring, join) and the glow, separately. */
export const contributionsOf = (bits) => ({ shape: (bits & (C_LUMEN | C_SHADOW | C_RING | C_JOIN)) !== 0, glow: (bits & C_GLOW) !== 0 });

export {
  REGION_TEXELS, JOIN0, K_JOIN, K_CROSS, K_HAIRPIN, K_CROSSTIER, K_NEAR, K_LONG, K_MORPH, M_LUMEN, M_JOINED, M_TRUNK, GRID_W,
};
