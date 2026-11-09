// The organs under the vector renderer (docs/recommendations/vector-renderer-plan.md section 6, workstream F): the shader strings that
// draw their retained geometry. Nothing here draws; vec-organs.js owns the buffers and the order.
//
// What is drawn (all of it straight into the figure's one pass, no render target between two shapes):
//   · a FILL is its prepared triangles (the interior, exact) plus a ring strip along its boundary whose coverage ramps over EXT_PX
//     device pixels each side of the true edge (the same box-filter coverage as shape-gl.js, `cover()`); the strip and the interior meet
//     with no seam and no pixel is drawn twice by one shape (a depth test, below);
//   · a STROKE is one instanced quad per segment, its coverage analytic from the pixel's distance to the segment (shape-gl.js SEG_FS'
//     stroke arithmetic: round joints as a wedge on the outside of the turn, butt, round or square ends);
//   · both read their frame, opacity and paint (a colour, or a linear or radial gradient with up to 8 stops) from the OPS texture, one
//     row an op, so a camera move writes one matrix uniform and an organ's ease writes the rows that changed;
//   · a shape is drawn once per op: the op's index sets the fragment's depth (later ops nearer to zero), the depth test is LESS, so the
//     second primitive of the same op over a pixel (the strip's overlap at a bend, a stroke's joints) is dropped, and a later op is
//     never dropped by an earlier one. The depth buffer is the pass's own; vec-organs.js clears it before and after.
//   · a clip is the clip shape's triangles marked in the stencil (vec-organs.js); a mask is a texture of its luminance, redrawn when
//     its shape changes (`uMode` 2 draws into it, `uMode` 1 draws the organ covers).
import { COVER_GLSL } from './shape-gl.js';
import { PLATE_GLSL } from './vec-overlays-glsl.js';

/** Texels a row of the OPS texture takes (one op a row). */
export const OP_TEXELS = 20;
/** The row's texels: [a b c d] of the op's frame (shape units → world), [e f alpha kind] (kind 0 solid, 1 linear, 2 radial), the solid
 *  colour (straight rgba), the gradient's ends (x1 y1 x2 y2 | cx cy r 0), its matrix (shape units → gradient space: [a b c d], [e f n 0]),
 *  two texels of stop offsets, eight of stop colours (straight rgba), the stroke's [half width in shape units, half width in device px
 *  for a non-scaling stroke (0: none), 0, 0]. */
export const T_M = 0, T_E = 1, T_COL = 2, T_GP = 3, T_GM0 = 4, T_GM1 = 5, T_SO = 6, T_SC = 8, T_W = 16;
/** Ops a depth step is made for (their depth is 1 − (op + 1) / OP_DEPTHS, strictly falling with the op's index). */
export const OP_DEPTHS = 16384;
/** The ramp of a fill's edge: device pixels each side of the true edge (shape-gl.js drew its edge 1.5 px out the same way). */
export const EXT_PX = 1.5;

// ── Shared pieces ──
const OP_FETCH = `
uniform highp sampler2D uOps;
mat3 opWorld(int op) {
  vec4 a = texelFetch(uOps, ivec2(${T_M}, op), 0), b = texelFetch(uOps, ivec2(${T_E}, op), 0);
  return mat3(a.x, a.y, 0.0, a.z, a.w, 0.0, b.x, b.y, 1.0);
}`;
const CLIP_Y = `
uniform vec2 uSize;
uniform float uFlip;   // 1: device rows run down the picture (the figure); -1: they run up the texture (a mask, the covers)
vec4 toClip(vec2 d, float op) {
  float y = d.y / uSize.y * 2.0 - 1.0;
  return vec4(d.x / uSize.x * 2.0 - 1.0, uFlip > 0.0 ? -y : y, 1.0 - 2.0 * (op + 1.0) / ${OP_DEPTHS}.0, 1.0);
}`;
const PAINT = `
uniform int uMode;          // 0 the organ's colour; 1 the covers (alpha only); 2 a mask (luminance of the premultiplied colour, in red)
uniform sampler2D uMask;
uniform vec4 uMaskRect;     // the mask's rectangle in its frame (x, y, w, h)
uniform mat3 uMaskInv;      // world → the mask's frame
uniform int uMaskOn;
vec4 stopC(int op, int i) { return texelFetch(uOps, ivec2(${T_SC} + i, op), 0); }
float stopO(int op, int i) {
  int j = i / 4, k = i - j * 4;
  vec4 v = texelFetch(uOps, ivec2(${T_SO} + j, op), 0);
  return k == 0 ? v.x : k == 1 ? v.y : k == 2 ? v.z : v.w;
}
vec4 gradColour(int op, float t, int n) {
  if (t <= stopO(op, 0)) return stopC(op, 0);
  for (int i = 1; i < 8; i++) {
    if (i >= n) break;
    float oi = stopO(op, i);
    if (t <= oi) {
      float o1 = stopO(op, i - 1), w = oi - o1;
      return w > 0.0 ? mix(stopC(op, i - 1), stopC(op, i), (t - o1) / w) : stopC(op, i);
    }
  }
  return stopC(op, n - 1);
}
// The op's colour (straight rgba) at a point of its shape.
vec4 paintAt(int op, vec2 p) {
  vec4 e = texelFetch(uOps, ivec2(${T_E}, op), 0);
  if (e.w < 0.5) return texelFetch(uOps, ivec2(${T_COL}, op), 0);
  vec4 gp = texelFetch(uOps, ivec2(${T_GP}, op), 0), m0 = texelFetch(uOps, ivec2(${T_GM0}, op), 0), m1 = texelFetch(uOps, ivec2(${T_GM1}, op), 0);
  vec2 g = vec2(m0.x * p.x + m0.z * p.y + m1.x, m0.y * p.x + m0.w * p.y + m1.y);
  float t;
  if (e.w < 1.5) { vec2 d = gp.zw - gp.xy; float L2 = dot(d, d); t = L2 > 0.0 ? dot(g - gp.xy, d) / L2 : 0.0; }
  else t = gp.z > 0.0 ? length(g - gp.xy) / gp.z : 1.0;
  return gradColour(op, clamp(t, 0.0, 1.0), int(m1.z + 0.5));
}
// What an op writes for a coverage: premultiplied, scaled by its alpha, the mask and the coverage.
vec4 shade(int op, vec2 p, vec2 world, float cov) {
  float a = texelFetch(uOps, ivec2(${T_E}, op), 0).z * cov;
  if (uMaskOn == 1) {
    vec2 q = (uMaskInv * vec3(world, 1.0)).xy, uv = (q - uMaskRect.xy) / uMaskRect.zw;
    a *= (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) ? texture(uMask, uv).r : 0.0;
  }
  if (a <= 0.0) discard;
  vec4 c = uMode == 1 ? vec4(0.0, 0.0, 0.0, 1.0) : paintAt(op, p);
  a *= c.a;
  if (a <= 0.0) discard;
  vec3 pm = c.rgb * a;
  if (uMode == 2) return vec4(dot(pm, vec3(0.2125, 0.7154, 0.0721)), 0.0, 0.0, a);
  return vec4(pm, a);
}`;

// ── Fills: interior triangles and the boundary ring ──
// A vertex: aPos (shape units), aDir (the ring's miter direction, unit, pointing out of the filled side; 0 for the interior), aOff (−1 on
// the inside of the ring, +1 outside, 0 on the edge and in the interior), aN (the segment's outward unit normal; 0 in the interior),
// aOp (the op's index). A morphing fill (the liver) also carries the second outline's aPosB, aDirB, aNB, and `uT` blends them.
/** The vertex shader of fills; `morph`: the vertex also carries the outline it blends to. */
export function fillVS(morph = false) {
  return `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aDir;
layout(location=2) in float aOff;
layout(location=3) in vec2 aN;
layout(location=4) in float aOp;
${morph ? `layout(location=5) in vec2 aPosB;
layout(location=6) in vec2 aDirB;
layout(location=7) in vec2 aNB;
uniform float uT;` : ''}
uniform mat3 uCam;      // world → device px (y down)
uniform float uExt;     // the ring's half width, device px
${OP_FETCH}
${CLIP_Y}
out vec2 vShape;
out vec2 vWorld;
out float vSd;
out vec2 vN;
flat out float vOp;
void main() {
  int op = int(aOp + 0.5);
  mat3 W = opWorld(op), M = uCam * W;
  float sc = sqrt(abs(M[0][0] * M[1][1] - M[0][1] * M[1][0]));
  ${morph ? 'vec2 p0 = mix(aPos, aPosB, uT), dir = mix(aDir, aDirB, uT), n0 = mix(aN, aNB, uT);' : 'vec2 p0 = aPos, dir = aDir, n0 = aN;'}
  vec2 p = p0 + dir * (aOff * uExt / max(sc, 1e-6));
  vShape = p;
  vWorld = (W * vec3(p, 1.0)).xy;
  vSd = -aOff * uExt;
  vec2 nd = mat2(M) * n0;
  vN = dot(nd, nd) > 1e-12 ? normalize(nd) : vec2(0.0);
  vOp = aOp;
  gl_Position = toClip((M * vec3(p, 1.0)).xy, aOp);
}`;
}
/** The fragment shader of fills (the same for a morphing one). */
export const FILL_FS = `#version 300 es
precision highp float;
in vec2 vShape;
in vec2 vWorld;
in float vSd;
in vec2 vN;
flat in float vOp;
${OP_FETCH}
${PAINT}
${COVER_GLSL}
${PLATE_GLSL}
out vec4 o;
void main() {
  int op = int(vOp + 0.5);
  float cov = dot(vN, vN) < 0.25 ? 1.0 : cover(vSd, vN);
  if (cov <= 0.0) discard;
  o = shade(op, vShape, vWorld, cov);
  if (uMode == 0) o = vecPlate(o);   // the plate's grey-down, as COMP_FS applies it to the organs
}`;

// ── Strokes: one instanced quad a segment ──
// An instance: aSeg (a, b in shape units), aCaps (a's and b's cap: 0 butt, 1 round, 2 square), aNbr (the directions of the segments before
// a and after b), aOp. A morphing stroke also carries the other outline's segment and neighbours, and `uT` blends them.
/** The vertex shader of strokes; `morph`: the instance also carries the outline it blends to. */
export function strokeVS(morph = false) {
  return `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;   // (0 or 1 along, -1 or 1 across)
layout(location=1) in vec4 aSeg;
layout(location=2) in vec2 aCaps;
layout(location=3) in vec4 aNbr;
layout(location=4) in float aOp;
${morph ? `layout(location=5) in vec4 aSegB;
layout(location=6) in vec4 aNbrB;
uniform float uT;` : ''}
uniform mat3 uCam;
${OP_FETCH}
${CLIP_Y}
out vec2 vP;
out vec2 vWorld;
out vec2 vShape;
flat out vec4 vSeg;
flat out vec2 vCaps;
flat out vec4 vNbr;
flat out float vHw;
flat out float vOp;
void main() {
  int op = int(aOp + 0.5);
  mat3 W = opWorld(op), M = uCam * W;
  float sc = sqrt(abs(M[0][0] * M[1][1] - M[0][1] * M[1][0]));
  vec4 wd = texelFetch(uOps, ivec2(${T_W}, op), 0);
  float hw = wd.y > 0.0 ? wd.y : wd.x * sc;
  ${morph ? 'vec4 sg = mix(aSeg, aSegB, uT), nb = mix(aNbr, aNbrB, uT);' : 'vec4 sg = aSeg, nb = aNbr;'}
  vec2 a = (M * vec3(sg.xy, 1.0)).xy, b = (M * vec3(sg.zw, 1.0)).xy;
  vec2 d = b - a;
  float L = length(d), ext = max(hw, 0.5) + ${EXT_PX.toFixed(1)};
  vec2 t = L > 1e-6 ? d / L : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  vec2 p = mix(a - t * ext, b + t * ext, aCorner.x) + n * ext * aCorner.y;
  mat2 lin = mat2(M);
  vec2 pa = lin * nb.xy, pb = lin * nb.zw;
  vNbr = vec4(length(pa) > 1e-9 ? normalize(pa) : vec2(0.0), length(pb) > 1e-9 ? normalize(pb) : vec2(0.0));
  vP = p; vSeg = vec4(a, b); vCaps = aCaps; vHw = hw; vOp = aOp;
  mat3 Mi = inverse(M);
  vShape = (Mi * vec3(p, 1.0)).xy;
  vWorld = (W * vec3(vShape, 1.0)).xy;
  gl_Position = toClip(p, aOp);
}`;
}
/** The fragment shader of strokes: shape-gl.js SEG_FS' stroke coverage, written as colour. */
export const STROKE_FS = `#version 300 es
precision highp float;
in vec2 vP;
in vec2 vWorld;
in vec2 vShape;
flat in vec4 vSeg;
flat in vec2 vCaps;
flat in vec4 vNbr;
flat in float vHw;
flat in float vOp;
${OP_FETCH}
${PAINT}
${COVER_GLSL}
${PLATE_GLSL}
out vec4 o;
void main() {
  int op = int(vOp + 0.5);
  vec2 a = vSeg.xy, ba = vSeg.zw - vSeg.xy, pa = vP - a;
  float L2 = dot(ba, ba), L = sqrt(L2);
  float h = L2 > 1e-12 ? dot(pa, ba) / L2 : 0.0;
  vec2 foot = ba * clamp(h, 0.0, 1.0), r = pa - foot;
  float d = length(r);
  vec2 t = L > 1e-6 ? ba / L : vec2(1.0, 0.0), nrm = vec2(-t.y, t.x);
  vec2 n = (h >= 0.0 && h <= 1.0) || d < 1e-6 ? nrm : r / d;
  float c;
  float past = h < 0.0 ? -h * L : h > 1.0 ? (h - 1.0) * L : 0.0, cap = h < 0.0 ? vCaps.x : h > 1.0 ? vCaps.y : 1.0;
  if (past > 0.0 && cap != 1.0) {
    float across = L > 1e-6 ? abs(pa.x * ba.y - pa.y * ba.x) / L : d;
    c = band(vHw, across, nrm) * cover((cap == 2.0 ? vHw : 0.0) - past, t);
  } else c = band(vHw, d, n);
  if (past > 0.0 && cap == 1.0) {
    vec2 nb = h < 0.0 ? vNbr.xy : vNbr.zw;
    if (dot(nb, nb) > 0.5 && (h < 0.0 ? dot(vP - vSeg.xy, nb) < 0.0 : dot(vP - vSeg.zw, nb) > 0.0)) c = 0.0;
  }
  if (c <= 0.0) discard;
  o = shade(op, vShape, vWorld, c);
  if (uMode == 0) o = vecPlate(o);
}`;

// ── Clips: a shape's triangles marked in the stencil, no colour ──
/** The clip's vertex shader: the clip's own frame (shape units → device px) is a uniform; the position is all it needs. */
export const CLIP_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat3 uClip;     // the clip shape's units → device px (y down)
uniform vec2 uSize;
uniform float uFlip;
void main() {
  vec2 d = (uClip * vec3(aPos, 1.0)).xy;
  float y = d.y / uSize.y * 2.0 - 1.0;
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, uFlip > 0.0 ? -y : y, 0.0, 1.0);
}`;
export const CLIP_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;
