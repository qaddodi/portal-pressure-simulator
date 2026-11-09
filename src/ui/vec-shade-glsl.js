// The vector renderer's single-vessel shading (docs/recommendations/vector-renderer-plan.md, sections 4 and 5.1; workstream B).
//
// What this module is: the shader text that every vector program shares. The ordinary-stretch fragment shader (vec-stretch-glsl.js) and the
// interaction-region fragment shader (workstream C, vec-region-glsl.js) both include it, so a pixel that only one vessel reaches is
// shaded by the very same function on both sides of a cell edge: that is what makes the edges seamless.
//
//   VEC_PRECISION                    the first lines of every vector fragment shader (#version, default precisions).
//   VEC_SHADE_GLSL(K)                the shared text, in this order (a program puts nothing of its own between them):
//        1. the host declarations: samplers ent, rad, tube, organ; the uniforms listed in VEC_SHADE_UNIFORMS; T(), PT(), alongAt(), over(),
//           LAST, WIN_MAX, N_SAMPLES (blood's text, workstream D, goes AFTER this and must not declare them again);
//        2. the cell test: uniforms cellTex, inv, gridO, gridN, const CELL; vec2 vecWorld(); uvec4 vecCellAt(vec2 p);
//        3. shadeGLSL (veins-mesh-glsl.js, imported, packFlow cut): segNear, vesAttrs, glowAmt, shadowOf, tubeShade, ditherOut;
//        4. struct VecNear; vecNearNone(); vecNear(); vecNearMore(); vecOccl(); vecStreamAt(); vecShadeOne().
//   VEC_SHADE_UNIFORMS               the uniform names of 1 and 2: what the renderer core (E) sets.
//
// It is a function of K, not a string, because the flags (F_*) and VEIL_K live in veins-gl.js, which will import the renderer: importing
// it here would be a cycle. E passes them from the instance:
//   K = { F_DIFFUSE, F_EDGE, F_SHADOW, F_SPEC, F_VEIL, F_WHOLE, F_SEL, F_DOTTED, F_NOCASE, VEIL_K }
//
// ── The signatures (C and D code against these) ──
//   struct VecNear { float d, h, r, u, x, v; vec2 g; float aM, aW, aU; };
//        d the lumen's signed distance (the wall's), h the contact shadow's, r the radius, u the arc fraction 0 … 1 (it runs on past the
//        ends), x the signed distance across the nearest segment's line, v the soft along (the glow's and the lift's fade), g the unit
//        direction from the centreline to the pixel; aM, aW, aU the soft along's running sums (vecNearMore continues them).
//   VecNear vecNearNone();                                                    nothing seen yet
//   VecNear vecNear(int row, int i0, int i1, vec2 p, vec2 ps);                the segments i0 … i1 (at most WIN_MAX) of the vessel row
//   VecNear vecNearMore(VecNear a, int row, int i0, int i1, vec2 p, vec2 ps); the same, folded into what a has seen (a hairpin's second run)
//   float vecOccl(vec2 p);                                                    how far the organs cover the vessels at p (0 without them)
//   vec4 vecShadeOne(int row, VecNear nr, vec2 p, float occl, out float lum, out vec3 lumCol);
//        the vessel's whole contribution at p, premultiplied, before the dither and with no blood; vec4(0.0) where it draws nothing.
//        lum: the lumen's coverage × the vessel's alpha where blood may show (0 for a dotted collateral or under 0.02); lumCol: the colour
//        of the pixel unpremultiplied. The blood is laid by the caller: vis = clamp(lum / max(o.a, 1e-3), 0.0, 1.0) where vis > 0.005 and
//        o.a > 0.01 (classic's own visibility for the composite).
//   vec4 vecShadeBits(int row, VecNear nr, vec2 p, float occl, int bits, out float lum, out vec3 lumCol);
//        vecShadeOne for a pixel whose surviving runs reach it by the contributions in `bits` (C_* from vec-contract.js, a union): the glow only
//        when C_GLOW is set, the shape (shadow, ring, casing, lumen) only when one of C_LUMEN, C_SHADOW, C_RING is, and tubeShade (casing, lumen,
//        lines, rim, hover) only when C_LUMEN is; a pixel past the lumen's bound has no casing and no lumen, so shadow and ring alone are laid,
//        which is tubeShade's own first two lines. vecShadeOne is vecShadeBits with C_ALL.
//   vec3 vecStreamAt(int row, VecNear nr);                                    (arc length s in world units, across y −1 … 1, drawn radius R)
//   ps = p − shOff (the contact shadow's point); the dither (ditherOut(o, gl_FragCoord.xy)) is the caller's, once, last.
//
// What vecShadeOne is: the classic vessel shader's tier loop (veins-gl.js vesselFS) for one vessel and no join, the arithmetic in the
// same order: where it has one vessel the slot search, the joins, the copies across tiers, the blend of members and the crossing's
// knock-out all reduce to nothing, and what is left is the glow band, the tier's shape (shadow, ring, casing, lumen, lines, rim, hover,
// lift), the veil and organ cover, the group (behind the organs / the network / lifted) and the final laying of the three.
import { shadeGLSL } from './veins-mesh-glsl.js';
import { N_SAMPLES } from './veins-mesh.js';
import { MAX_TIERS } from './veins-mesh-data.js';
import { CELL, ENT_W } from './veins-bin.js';
import { EDGE_GLSL } from './edge.js';
import { LIFT_EASE_SHARE, LIFT_EASE_MAX } from './highlight-math.js';
import { WIN_MAX, CELL_EMPTY, CELL_SIMPLE, CELL_REGION, C_LUMEN, C_SHADOW, C_GLOW, C_RING } from './vec-contract.js';

/** Every contribution (what vecShadeOne shades): the bits of a pixel no bound has narrowed. */
export const C_ALL = C_LUMEN | C_SHADOW | C_GLOW | C_RING;

export const VEC_PRECISION = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp usampler2D;\n';

/** The uniforms the host block and the cell test declare (a program using VEC_SHADE_GLSL declares these and no others from it). */
export const VEC_SHADE_UNIFORMS = Object.freeze([
  'ent', 'rad', 'tube', 'organ', 'organRect', 'useOrgan', 'organK', 'px', 'shOff', 'casing', 'shadow', 'sheenInk', 'shadeInk', 'rimInk',
  'paperInk', 'ring', 'light', 'netAlpha', 'fx', 'tierAlpha', 'tierGroup', 'posBase',
  'cellTex', 'inv', 'gridO', 'gridN',
]);

/** The same list for the hierarchy's programs (vec-hier-glsl.js declares the cell tables, the grid and the shadow offset (uVecShOff, in place of shOff) itself; the pixel's world point stays inv's). */
export const VEC_SHADE_UNIFORMS_LEAF = Object.freeze(VEC_SHADE_UNIFORMS.filter((n) => !['cellTex', 'gridO', 'gridN', 'shOff'].includes(n)));

const f1 = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** The host declarations and helpers shadeGLSL needs (section 1 of the file's header). */
const hostGLSL = (leaf) => `
uniform highp sampler2D ent;           // the entry texture: the frame's points from posBase (PT)
uniform highp sampler2D rad;           // per vessel row (y), per sample (x): radius in .rg, the along curve in .ba
uniform highp sampler2D tube;          // per vessel row: the tube texels (veins-gl.js layout)
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them
uniform float px;                      // world units per device pixel
${leaf ? '' : 'uniform vec2 shOff;                    // contact shadow offset (world)\n'}uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;
uniform vec4 sheenInk;
uniform vec4 shadeInk;
uniform vec4 rimInk;                   // a dark lumen's light rim (alpha 0 on the light looks)
uniform vec4 paperInk;                 // the figure's ground
uniform vec4 ring;                     // selection ring
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity
uniform int fx;                        // 1: shading and shadows
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
const float LAST = ${N_SAMPLES - 1}.0;
const int N_SAMPLES = ${N_SAMPLES};
const int WIN_MAX = ${WIN_MAX};
const int ENT_W = ${ENT_W};
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }
float alongAt(int id, float u) {
  float ui = u * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
`;

/**
 * The cell test (plan section 4). One formula for every vector program: the pixel's own centre through `inv` (the matrix that takes
 * gl_FragCoord.xy, window pixels with y up, to world; it holds the y flip), then floor((world − gridO) / CELL), then the cell texel
 * (RGBA16UI: kind, vessel row or region index, i0, i1; see vec-contract.js). Outside the grid: kind 0 (empty).
 */
const cellGLSL = () => `
uniform highp usampler2D cellTex;       // the cell grid (vec-contract.js GRID_W wide)
uniform highp mat3 inv;                // gl_FragCoord.xy → world
uniform highp vec2 gridO;              // the grid's origin corner (world)
uniform highp vec2 gridN;              // cells across, down
const float CELL = ${f1(CELL)};
const uint CELL_EMPTY = ${CELL_EMPTY}u;
const uint CELL_SIMPLE = ${CELL_SIMPLE}u;
const uint CELL_REGION = ${CELL_REGION}u;
vec2 vecWorld() { return (inv * vec3(gl_FragCoord.xy, 1.0)).xy; }
uvec4 vecCellAt(vec2 p) {
  vec2 c = floor((p - gridO) / CELL);
  if (c.x < 0.0 || c.y < 0.0 || c.x >= gridN.x || c.y >= gridN.y) return uvec4(0u);
  return texelFetch(cellTex, ivec2(c), 0);
}
`;

/** The pixel's world point alone (the hierarchy's programs: vec-hier-glsl.js does the rest of the lookup from it). */
const worldGLSL = () => `
uniform highp mat3 inv;                // gl_FragCoord.xy → world
vec2 vecWorld() { return (inv * vec3(gl_FragCoord.xy, 1.0)).xy; }
`;

/** shadeGLSL with the flow-target packing cut (the vector renderer writes no flow targets). */
function shadePart(K) {
  const s = shadeGLSL({
    F_DIFFUSE: K.F_DIFFUSE, F_EDGE: K.F_EDGE, F_SHADOW: K.F_SHADOW, F_SPEC: K.F_SPEC, F_VEIL: K.F_VEIL, F_WHOLE: K.F_WHOLE,
    LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2: 0, ROW2_BITS: 0, VEIL_K: K.VEIL_K,
  });
  const cut = s.indexOf('uvec4 packFlow(');
  return cut < 0 ? s : s.slice(0, s.lastIndexOf('\n//', cut));
}

const nearGLSL = (K) => `
struct VecNear { float d; float h; float r; float u; float x; float v; vec2 g; float aM; float aW; float aU; };
VecNear vecNearNone() { return VecNear(1e9, 1e9, 0.0, 0.0, 0.0, 0.0, vec2(0.0), 1e9, 0.0, 0.0); }
VecNear vecNearMore(VecNear a, int row, int i0, int i1, vec2 p, vec2 ps) {
  vec4 clip = T(row, 5);
  bool dotted = (int(T(row, 2).z + 0.5) & ${K.F_DOTTED}) != 0;
  float bd = a.d, bs = a.h, br = a.r, bu = a.u, bx = a.x, aM = a.aM, aW = a.aW, aU = a.aU;
  vec2 bg = a.g;
  for (int k = 0; k < WIN_MAX; k++) {
    int j = i0 + k;
    if (j > i1 || j > N_SAMPLES - 2) break;
    segNear(row, float(j), vec4(PT(row, j), PT(row, j + 1)), p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
  }
  return VecNear(bd, bs, br, bu, bx, aW > 0.0 ? aU / aW : bu, bg, aM, aW, aU);
}
VecNear vecNear(int row, int i0, int i1, vec2 p, vec2 ps) { return vecNearMore(vecNearNone(), row, i0, i1, p, ps); }
float vecOccl(vec2 p) { return useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${K.VEIL_K} * organK : 0.0; }
vec3 vecStreamAt(int row, VecNear nr) { return vec3(nr.u * T(row, 5).z, clamp(nr.x / max(nr.r, 1e-3), -1.0, 1.0), nr.r); }

vec4 vecShadeBits(int row, VecNear nr, vec2 p, float occl, int bits, out float lum, out vec3 lumCol) {
  lum = 0.0;
  lumCol = vec3(0.0);
  // Nothing to draw here: no glow band within reach, and the wall and the shadow both past what the shape draws (classic's early out).
  bool lit = T(row, 10).a > 0.0 && nr.d - T(row, 0).w < 15.7;
  if (!lit && nr.d > 8.01 + 2.0 * px && nr.h > 6.01 + 2.0 * px) return vec4(0.0);
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(row, nr.u, nr.v, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  int ti = int(aTier + 0.5);
  int grp = tierGroup[ti];
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0), topC = vec4(0.0);
  int topGrp = 1;
  // The glow: one thin soft band hugging a lit vessel's wall, down with the vessel's own tier (a vessel alone has no other lit lumen to cut it).
  vec4 lg = vec4(0.0), lgU = vec4(0.0);
  vec4 gc = vec4(0.0), ge = vec4(0.0);
  float gv = (bits & ${C_GLOW}) != 0 ? glowAmt(row, nr.d, aWall, nr.v, aA, gc, ge) : 0.0;
  if (gv > 0.0 && gc.a > 0.0) {
    vec4 glw = vec4((ge.z > 0.5 ? aCol : gc.rgb) * gv, gv);
    if (ge.w > 5.0) lgU = glw; else lg = glw;
  }
  if (lgU.a > topC.a) { topC = lgU; topGrp = grp; }
  if (lg.a > 0.0) {
    if (grp == 0) accB = over(lg, accB);
    else if (grp == 1) accN = over(lg * min(1.0 / max(netAlpha, 1e-3), 1.0 / lg.a), accN);   // (accN is faded by netAlpha as a whole)
    else accT = over(lg, accT);
  }
  // The tier's shape.
  if ((bits & ${C_LUMEN | C_SHADOW | C_RING}) != 0 && !(nr.d > 8.0 + 2.0 * px && nr.h > 6.0 + 2.0 * px)) {
    int flags = int(aFlag + 0.5);
    bool sel = (flags & ${K.F_SEL}) != 0;
    float cA = (flags & ${K.F_NOCASE}) != 0 ? 0.0 : (flags & ${K.F_DOTTED}) != 0 ? 0.35 : 1.0;
    float aa = px * ${EDGE_GLSL};
    float aL = clamp(0.5 - nr.d / aa, 0.0, 1.0);
    vec2 g = length(nr.g) > 1e-5 ? normalize(nr.g) : vec2(0.0);
    // (A pixel past the lumen's bound has no casing and no lumen, so only the shadow and the ring remain: tubeShade's first two lines.)
    vec4 c;
    if ((bits & ${C_LUMEN}) != 0) c = tubeShade(nr.d, nr.h, nr.r, aWall, aCol, g, flags, sel, cA, grp, row, nr.v, aHov, aEdge, 0.0, 0.0, aa, aL);
    else {
      c = shadowOf(nr.h, aWall, flags, sel, aa);
      if (sel) { float ar = ring.a * clamp(0.5 - (nr.d - aWall - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
    }
    c *= aA * tierAlpha[ti];
    float wsel = grp == 1 ? aSel : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
    float gf = grp == 0 ? 1.0 - occl * aOf : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
    float lumA = aL * aA * tierAlpha[ti] * gf;
    if (lumA > 0.02 && (flags & ${K.F_DOTTED}) == 0) lum = lumA;
    if (grp == 0) { c *= 1.0 - occl * aOf; accB = over(c, accB); }
    else if (grp == 1) { accN = over(c, accN); if (wsel > 0.0) accT = over(c * wsel, accT); }
    else accT = over(c, accT);
  }
  if (topC.a > 0.0) {
    if (topGrp == 0) accB = over(topC, accB);
    else if (topGrp == 1) accN = over(topC * min(1.0 / max(netAlpha, 1e-3), 1.0 / topC.a), accN);
    else accT = over(topC, accT);
  }
  vec4 o = over(accT, over(accN * netAlpha, accB));
  if (o.a < 0.002) { lum = 0.0; return vec4(0.0); }
  lumCol = o.a > 0.01 ? o.rgb / o.a : vec3(0.0);
  return o;
}
vec4 vecShadeOne(int row, VecNear nr, vec2 p, float occl, out float lum, out vec3 lumCol) { return vecShadeBits(row, nr, p, occl, ${C_ALL}, lum, lumCol); }
`;

/** The shared text (see the file's header). K: the flags and VEIL_K from veins-gl.js. leaf: without the fixed cell test (the hierarchy's programs, which add HIER_GLSL). */
export const VEC_SHADE_GLSL = (K, leaf = false) => hostGLSL(leaf) + (leaf ? worldGLSL() : cellGLSL()) + shadePart(K) + nearGLSL(K);
