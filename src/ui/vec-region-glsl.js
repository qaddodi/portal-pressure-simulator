// The vector vessel renderer's interaction region shader (docs/recommendations/vector-renderer-plan.md, sections 4 and 5.2, workstream C).
//
// A region is a cell of the compiled grid (vec-contract.js) where vessels interact: a connected junction, an unconnected crossing, a
// cross-tier junction, a hairpin or self-overlap, a long run, a close approach, a morph. One instanced quad per region cell, the cell's exact
// square. The fragment finds its cell from its own pixel centre (the one formula every Vector program uses: world = inv × gl_FragCoord.xy,
// cell = floor((world − gridO) / CELL)), draws only when that cell is this quad's own region cell, reads the region record, and over the
// region's members alone does what the classic vessel shader does today (veins-gl.js vesselFS, lines 280 to 896, read, not edited):
//   1. each member's nearest point over its own run (B's vecNear, and vecNearMore for a vessel's other runs), several runs of one vessel merged into one; the nearest SLOTS kept;
//   2. the joins: which members are joined here and how widely (fillet width jk, its share js, reach fall-off jf);
//   3. the cross-tier hand-off (keep, pres): a tributary ending on a trunk of a lower tier draws a copy of the trunk near the join;
//   4. the tiers back to front: glow, the tier's shape (smin fillet between joined members, corner(), trunk and fork roles, run-on stretches,
//      the deep blend), the owner of the pixel (a crossing: the front lumen), the trunk's lumen over a copied vein's end (tin), the
//      knock-out ring (kn, kcas), tubeShade; the network group composited whole (accN) then faded once by netAlpha, the selected vessel's own
//      share laid over it (accT): the group's alpha applies once, wherever vessels overlap;
//   5. the blood: the stream of the owning lumen, and (at a confluence) the next lumen's, each in its own (row, along, across), blended by
//      D's vecBloodMix with weights that sum to one; at an unconnected crossing the front lumen's stream only (the other is not in `conn`);
//   6. one dithered, premultiplied write.
// A pixel where only one member reaches calls B's vecShadeOne and D's vecBlood unchanged, which is what makes a cell edge seamless: the
// stretch shader on the other side of the edge calls the very same functions on the very same inputs.
//
// The shader pieces it builds on come from the other workstreams and are passed in (`deps`), so each can land in its own time:
//   deps.shade  B (vec-shade-glsl.js VEC_SHADE_GLSL(K), already applied to the instance's flag values): the host declarations every Vector
//               fragment shader shares (rad, tube, organ, px, shOff, reachU, netAlpha, fx, the inks, tierAlpha[], tierGroup[]; T(), over()),
//               shadeGLSL's functions (vesAttrs, glowAmt, shadowOf, tubeShade, ditherOut), the one cell test (uniforms cells, inv, gridO,
//               gridN; vec2 vecWorld(); uvec4 vecCellAt(vec2 p), kind 0 outside the grid), and
//                 struct VecNear { float d, h, r, u, x, v; vec2 g; float aM, aW, aU; };
//                 VecNear vecNear(int row, int i0, int i1, vec2 p, vec2 ps);       VecNear vecNearMore(VecNear acc, int row, int i0, int i1, vec2 p, vec2 ps);
//                 vec4 vecShadeOne(int row, VecNear nr, vec2 p, float occl, out float lum, out vec3 lumCol);   // premultiplied, no blood, no dither
//                 vec3 vecStreamAt(int row, VecNear nr);   // (s, y, R) for the blood
//                 float vecOccl(vec2 p);                   // how far an organ covers p (the veil)
//   deps.blood  D (vec-blood-glsl.js VEC_BLOOD_GLSL): both return a premultiplied blood layer, laid over the lumen at coverage lum
//               (col = layer.rgb * lum + col * (1 - layer.a * lum)):
//                 vec4 vecBlood(int row, float s, float y, float R, vec3 lumenCol, float px);
//                 vec4 vecBloodMix(int n, int rows[2], float s[2], float y[2], float R[2], float w[2], vec3 lumenCol, float px);   // normalises w itself
//   deps.above  G (vec-overlays-glsl.js), the V_BLOOD variant only:  vec4 vecAboveAt(vec2 w);  (world point, premultiplied)
//   deps.k      the instance's flag values { F_SEL, F_NOCASE, F_DOTTED, F_VEIL } (veins-gl.js owns them; importing it here would be circular).
// This file declares only what is its own (the region texture, the kept base under the blood), and smin() and corner(), the join
// arithmetic, which are the region shader's alone. The region quad carries its cell; the fragment draws only where the cell test
// finds that cell's own region, so a pixel is drawn by exactly one program.
import {
  GRID_W, CELL_REGION, MAX_MEMBERS, MAX_JOINS, SLOTS, JOIN0, REGION_TEXELS, K_JOIN, K_CROSS, K_HAIRPIN, K_CROSSTIER, K_NEAR, K_LONG, K_MORPH,
  M_LUMEN, M_JOINED, M_TRUNK, V_FULL, V_BASE, V_BLOOD,
} from './vec-contract.js';
import { CELL } from './veins-bin.js';
import { EDGE_GLSL } from './edge.js';

/** The uniforms this file declares (E sets them; the host declarations of B's text are B's and E's to agree). */
export const REGION_UNIFORMS = Object.freeze({
  vertex: ['world', 'size', 'gridO'],
  fragment: ['regionTex'],   // (the cell grid, inv, gridO and gridN are B's text's: the one cell test)
  blood: ['uBase'],   // the V_BLOOD variant only: the kept base picture under the blood
});

/** Attributes of the vertex shader (a TRIANGLE_STRIP of 4, instanced per region cell): location 0 the unit corner (0 … 1), location 1 the region cell (cells across, cells down), per instance. */
export const REGION_ATTRIBS = Object.freeze({ aC: 0, aCell: 1 });

/**
 * The region quad's vertex shader: the cell's exact square, `gridO + (cell + corner) · CELL`. `world` maps world → device pixels (y down),
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

const NEED = (what) => { throw new Error(`vecRegionFS: ${what} is not provided: pass the other workstreams' shader pieces as deps ({ shade, blood, above })`); };

/**
 * The region fragment shader for a variant (V_FULL, V_BASE, V_BLOOD: vec-contract.js). FULL lays blood in the lumen; BASE leaves it out;
 * BLOOD draws the lumen's blood alone over the kept base picture and then what lies over the blood, and nothing outside a lumen.
 */
export const vecRegionFS = (variant, deps = {}) => {
  if (variant !== V_FULL && variant !== V_BASE && variant !== V_BLOOD) throw new RangeError(`vecRegionFS: unknown variant ${variant}`);
  const shade = deps.shade ?? NEED('B\'s shade text'), blood = variant === V_BASE ? '' : (deps.blood ?? NEED('D\'s blood text'));
  const above = variant === V_BLOOD ? (deps.above ?? NEED('G\'s vecAboveAt')) : '';
  const isBlood = variant === V_BLOOD, k = deps.k ?? NEED('the flag values deps.k ({ F_SEL, F_NOCASE, F_DOTTED, F_VEIL })');
  const { F_SEL, F_NOCASE, F_DOTTED, F_VEIL } = k;
  const bloodOf1 = 'vecBlood(sid[0], st1.x, st1.y, st1.z, lumCol1, px)';
  // One vessel reaches the pixel: the very same functions the stretch shader calls.
  const single = isBlood ? `    if (lum1 <= 0.02) discard;
    outColor = over(vecAboveAt(p), over(${bloodOf1} * lum1, texelFetch(uBase, ivec2(gl_FragCoord.xy), 0)));
    return;` : `    if (c1.a < 0.002) discard;
${variant === V_FULL ? `    if (lum1 > 0.02) c1 = over(${bloodOf1} * lum1, c1);\n` : ''}    outColor = ditherOut(c1, gl_FragCoord.xy);
    return;`;
  const bloodCall = variant === V_BASE ? '' : `  if (gRow >= 0 && gW > 0.01) {
    if (gRow2 >= 0) {
      int rws[2]; float ss[2], yy[2], rr[2], ww[2];
      rws[0] = gRow; ss[0] = gS; yy[0] = gY; rr[0] = gR; ww[0] = 1.0 - gB;
      rws[1] = gRow2; ss[1] = gS2; yy[1] = gY2; rr[1] = gR2; ww[1] = gB;
      bl = vecBloodMix(2, rws, ss, yy, rr, ww, gCol, px);
    } else bl = vecBlood(gRow, gS, gY, gR, gCol, px);
    bl *= gW;
  }`;
  const finish = `${bloodCall}
${isBlood ? `  if (bl.a < 0.002) discard;
  outColor = over(vecAboveAt(p), over(bl, texelFetch(uBase, ivec2(gl_FragCoord.xy), 0)));` : `  vec4 o = over(accT, over(accN * netAlpha, accB));
  o = over(bl, o);
  if (o.a < 0.002) discard;
  outColor = ditherOut(o, gl_FragCoord.xy);`}
`;
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
const int MAXS = ${SLOTS};
const int MAXJ = ${MAX_JOINS};
const int MAXM = ${MAX_MEMBERS};
const int JOIN0 = ${JOIN0};
uniform highp sampler2D regionTex;        // the regions: REGION_TEXELS wide, one region a row (vec-contract.js)
${isBlood ? 'uniform sampler2D uBase;               // the kept base picture (everything under the blood)' : ''}
${shade}
${blood}
${above}
flat in ivec2 vCell;
layout(location=0) out vec4 outColor;

vec4 RG(int r, int k) { return texelFetch(regionTex, ivec2(k, r), 0); }
float smin(float a, float b, float k) {
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
void main() {
  // ── The partition: this pixel's cell, from its own centre. Drawn only by this cell's own region quad. ──
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
    VecNear nr = sn[0];
    nr.v = sv[0];
    float lum1;
    vec3 lumCol1;
    vec3 st1 = vecStreamAt(sid[0], nr);
    vec4 c1 = vecShadeOne(sid[0], nr, p, occl, lum1, lumCol1);
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
  for (int k = 0; k < MAXJ; k++) {
    if (k >= njr || jn == MAXJ) break;
    vec4 A = RG(rg, JOIN0 + 2 * k), B = RG(rg, JOIN0 + 2 * k + 1);
    float dc = length(p - A.xy);
    if (dc > A.w) continue;
    // (B.x the member mask's bits 0 … 15, B.z its bits 16 … 31; B.y the trunk member, plus 64 at a fork, −1 none; B.w the fillet)
    int mmask = int(B.x + 0.5) | (int(B.z + 0.5) << 16), mask = 0, c = 0, tm = 0, tfm = 0;
    int tmi = int(B.y + 0.5) & 63;
    bool fork = B.y > 63.5;
    for (int m = 0; m < MAXM; m++) {
      if ((mmask & (1 << m)) == 0 || msl[m] < 0) continue;
      int s = msl[m];
      if ((mask & (1 << s)) != 0) continue;
      mask |= 1 << s; c++;
      if (B.y > -0.5 && m == tmi) { tm |= 1 << s; if (fork) tfm |= 1 << s; }
    }
    if (c < 2) continue;
    jm[jn] = mask; jt[jn] = tm; jtf[jn] = tfm; js[jn] = clamp(B.w, 0.0, 1.0);
    jk[jn] = A.z * (1.0 - smoothstep(0.55 * A.w, A.w, dc)); jf[jn] = 1.0 - smoothstep(0.3 * A.w, 0.85 * A.w, dc); jn++;
  }
  // Where a trunk runs on into the next stretch of its course at a fork (joined with no fillet), the trunk beside this pixel
  // is whichever of the two lies nearer: tn[s], for a vessel s the others end on (corner() reads its geometry).
  int tn[MAXS];
  for (int s = 0; s < MAXS; s++) tn[s] = s;
  for (int j = 0; j < MAXJ; j++) if (j < jn && js[j] < 0.01)
    for (int s = 0; s < MAXS; s++) if ((jm[j] & (1 << s)) != 0)
      for (int m = 0; m < MAXS; m++) if (m != s && (jm[j] & (1 << m)) != 0 && sd[m] < sd[tn[s]]) tn[s] = m;

  // ── Nothing to draw here: settled now, without the tiers below ──
  {
    float pull = 0.0, dMin = 1e9, sMin = 1e9;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0) pull = max(pull, jk[j] * js[j] * 0.25);
    bool lit = false;
    for (int s = 0; s < MAXS; s++) {
      if (s >= n) break;
      dMin = min(dMin, sd[s]); sMin = min(sMin, sh[s]);
      if (T(sid[s], 10).a > 0.0 && sd[s] - T(sid[s], 0).w < 15.7) lit = true;
    }
    if (!lit && dMin - pull > 8.01 + 2.0 * px && sMin - pull > 6.01 + 2.0 * px) discard;
  }

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

  // ── Hand-off at a join across tiers ──
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

  // ── Tiers, back to front ──
  // accB: behind the organs; accN: the network, composited whole and faded once by netAlpha below; accT: the lifted tier and the selected
  // vessel's own share. A fade or a focus therefore never darkens twice where vessels overlap.
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  vec4 topC = vec4(0.0);
  int topGrp = 1;
  float last = -1.0;
  // The frontmost lumen (for the blood laid in it) and how much of it shows; a second lumen joined to it, and its share.
  int gRow = -1, gRow2 = -1;
  float gS = 0.0, gY = 0.0, gW = 0.0, gS2 = 0.0, gY2 = 0.0, gB = 0.0, gR = 1.0, gR2 = 1.0;
  vec3 gCol = vec3(0.0);
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
      if (s >= n || stier[s] != tt) continue;
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
    // Members: this tier's vessels, and (except in the lifted tier) vessels of lower tiers that share a junction with one of them, faded
    // out with distance from that junction.
    float pres[MAXS];
    int mem = 0;
    for (int s = 0; s < MAXS; s++) { pres[s] = 0.0; if (s < n && stier[s] == tt) { mem |= 1 << s; pres[s] = keep[s]; } }
    int base = mem;
    if (grp != 2) for (int j = 0; j < MAXJ; j++) {
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
    // The tier's shape: plain union, filleted between vessels that share a junction, only in the corners between them.
    float D = 1e9, Ds = 1e9;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0) { D = min(D, sd[s]); Ds = min(Ds, sh[s]); }
    for (int j = 0; j < MAXJ; j++) {
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
    if (D > 8.0 + 2.0 * px && Ds > 6.0 + 2.0 * px) continue;
    // Which vessel owns this pixel: the nearest, unless it lies inside the lumen of an unjoined vessel drawn above it in the tier (a
    // crossing: the front lumen). A copy from a lower tier lies under every one of this tier's own vessels, whatever its z.
    int ow = -1;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0 && (ow < 0 || sd[s] < sd[ow])) ow = s;
    int conn = 0;
    float kc = 0.0;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || sd[s] >= 0.0 || (conn & (1 << s)) != 0) continue;
      bool sOwn = stier[s] == tt, oOwn = stier[ow] == tt;
      if (sOwn != oOwn ? !sOwn : sz[s] <= sz[ow]) continue;
      ow = s; conn = 0; kc = 0.0;
      for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    }
    // Inside the lumen of a copied trunk (the cava under the hepatic veins), the trunk owns the pixel: a vein's end does not show through
    // it as a second, brighter stub, so the join reads as one shape.
    float tin[MAXS];
    for (int s = 0; s < MAXS; s++) {
      tin[s] = 0.0;
      if ((mem & (1 << s)) == 0 || stier[s] == tt || grp != 1 || tierGroup[int(stier[s] + 0.5)] != 0) continue;
      tin[s] = clamp(-sd[s] / max(0.35 * sr[s], px), 0.0, 1.0) * step(1e-3, pres[s]);
      if (tin[s] > 0.5 && stier[ow] == tt) {
        ow = s; conn = 0; kc = 0.0;
        for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
      }
    }
    conn = (conn | (1 << ow)) & mem;
    // Attributes blended across the join by the same distances (soft weights), so colour, caliber and shading run on through the fillet.
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
    g = length(g) > 1e-5 ? normalize(g) : vec2(0.0);
    int flags = int(sflag[ow] + 0.5);
    bool sel = (flags & ${F_SEL}) != 0;
    float cA = (flags & ${F_NOCASE}) != 0 ? 0.0 : (flags & ${F_DOTTED}) != 0 ? 0.35 : 1.0;
    float aa = px * ${EDGE_GLSL};
    // Where vessels of one tier cross, the one drawn above is cut out of the one below by a ring of the figure's ground, with its casing
    // across the cut (the atlas convention). Only inside the lower lumen, never at a join, never for a vessel without a casing.
    float kn = 0.0, kcas = 0.0;
    if (fx == 1 && paperInk.a > 0.0) for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || (conn & (1 << s)) != 0 || stier[s] != tt || sz[s] <= sz[ow] || sd[s] < 0.0) continue;
      int fl = int(sflag[s] + 0.5);
      if ((fl & (${F_NOCASE} | ${F_DOTTED})) != 0) continue;
      float reachK = swall[s] + 2.5 * px, fa = clamp(sa[s] * pres[s], 0.0, 1.0) * ((fl & ${F_VEIL}) != 0 ? 0.5 : 1.0);
      kn = max(kn, fa * paperInk.a * clamp(0.5 - (sd[s] - reachK) / aa, 0.0, 1.0));
      kcas = max(kcas, fa * clamp(0.5 - (sd[s] - swall[s]) / aa, 0.0, 1.0));
    }
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    vec4 c = tubeShade(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL);
    c *= alpha * tierAlpha[ti];
    float wsel = grp == 1 ? ssel[ow] : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
    float gf = grp == 0 ? 1.0 - occl * sof[ow] : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
    float lumA = aL * (1.0 - kn) * alpha * tierAlpha[ti] * gf;
    if (lumA > 0.02 && (flags & ${F_DOTTED}) == 0) {
      // The stream shown here: the two joined lumens with the largest share, by nearness and by how far past its own end each one runs.
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
        gRow = id; gS = su[o1] * T(id, 5).z; gY = clamp(sx[o1] / max(sr[o1], 1e-3), -1.0, 1.0); gW = lumA; gR = sr[o1]; gCol = col;
        gRow2 = -1; gB = 0.0;
        if (o2 >= 0 && w2 > 0.01 * w1) {
          gRow2 = sid[o2]; gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gR2 = sr[o2]; gB = w2 / (w1 + w2);
        }
      }
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

  // ── The blood, from the lumens' own coordinates: the owning lumen's stream, and a joined lumen's, mixed by weights that sum to one ──
  vec4 bl = vec4(0.0);
${finish}
}`;
};

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

export {
  REGION_TEXELS, JOIN0, K_JOIN, K_CROSS, K_HAIRPIN, K_CROSSTIER, K_NEAR, K_LONG, K_MORPH, M_LUMEN, M_JOINED, M_TRUNK, GRID_W,
};
