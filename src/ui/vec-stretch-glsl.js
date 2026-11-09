// The vector renderer's ordinary-stretch program (docs/recommendations/vector-renderer-plan.md section 5.1; workstream B).
//
// A vessel that is alone in a cell is drawn by its retained strip: one instanced strip a vessel row (veins-mesh.js geometry, placed in the
// vertex shader from the points texture), whose fragments draw ONLY inside the cells the compiler (workstream A) gave that vessel as its
// ordinary stretch. The vertex shader pads the strip by the vessel's reach; the fragment shader
//   1. finds its cell from its own pixel centre (the one formula, vec-shade-glsl.js: inv × gl_FragCoord, floor, gridO, CELL) and discards
//      unless the cell is an ordinary cell of this strip's row (so a vessel's contribution reaches a pixel once, with no seam to a region);
//   2. vecNear: the exact capsule distances over the cell's run of segments (the mesh's segNear maths, shadeGLSL);
//   3. vecShadeOne: the classic single-vessel result (shadow, casing, lumen, lines, rim, hover, ring, lift, glow, fades, veil, organ cover,
//      dotted, recolour, drawn part), premultiplied;
//   4. in the lumen, vecBlood (workstream D) at (row, s, y) from the geometry, laid over the lumen colour;
//   5. writes once, dithered once (the pixel's only vessel write).
//
// The three variants (vec-contract.js V_FULL, V_BASE, V_BLOOD):
//   V_FULL   steps 1 to 5: everything, the blood included (camera, morph and deforming frames). Drawn into the picture over the organs
//            (blend ONE, ONE_MINUS_SRC_ALPHA), depth LESS and depth write on (the strip's constant depth per row drops the second
//            fragment of the same vessel at a pixel, where one strip's triangles overlap at a bend).
//   V_BASE   as V_FULL without step 4: the kept still picture.
//   V_BLOOD  only the lumen strip (the vertex pad is padU alone: the caller sets it to a pixel or two), blend off: reads the kept base
//            (uniform keptBase, the picture's size, no y flip) at the pixel, adds the change the blood makes (alpha × (lit − unlit)),
//            and lays the over-blood overlays (G's vecAboveAt(p)) on the result. A pixel with no blood showing is discarded: the picture
//            already holds base + overlays there. Not dithered again (the base carries the dither).
//
// The uniforms, for the renderer core (E): VEC_SHADE_UNIFORMS (vec-shade-glsl.js) in every fragment shader, keptBase in V_BLOOD, and the
// blood's and the overlays' own (D's VEC_BLOOD_UNIFORMS, G's). The vertex shader's: world (world → device px, y down), size (the picture, px),
// tube, ent, rad, posBase, padU, selPad (vecStretchUniformNames below).
import { STRIP_VS_GLSL } from './veins-mesh.js';
import { VEC_PRECISION, VEC_SHADE_GLSL, VEC_SHADE_UNIFORMS } from './vec-shade-glsl.js';
import { V_FULL, V_BASE, V_BLOOD } from './vec-contract.js';

/** The vertex shader writes a depth that is the vessel row's alone, on (0, 1): a row's second fragment at a pixel fails depth LESS. */
export const ROW_DEPTH_ROWS = 32768;

/** Stand-in for D's `vecBlood` until its text is passed in: no blood. Same signature, a premultiplied layer, the stub's is empty. */
export const VEC_BLOOD_STUB = `
vec4 vecBlood(int row, float s, float y, float R, vec3 lumenCol, float px) { return vec4(0.0); }
`;
/** Stand-in for G's `vecAboveAt` until its text is passed in: nothing over the blood. */
export const VEC_ABOVE_STUB = `
vec4 vecAboveAt(vec2 p) { return vec4(0.0); }
`;

const VS_HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

/**
 * The vertex shader (the mesh's STRIP_VS_GLSL / meshWorld, imported). One instance a vessel row. pad: V_FULL and V_BASE the vessel's reach
 * (its casing + padU + selPad when selected: padU = shadow offset + glow + 2 px, as veins-mesh.js padOf), V_BLOOD the lumen strip (padU).
 * K: { F_SEL }.
 */
export const vecStretchVS = (variant, K) => `${VS_HEAD}layout(location=0) in vec4 aV;         // (kind, sample, side, corner): veins-mesh.js stripIndex
layout(location=1) in float aRow;      // the vessel row (per instance)
uniform mat3 world;                    // world → device pixels (y down)
uniform vec2 size;                     // the picture, device pixels
uniform highp sampler2D tube;
uniform float padU;                    // world units past the casing the pass can draw (V_BLOOD: past the lumen)
${variant === V_BLOOD ? '' : 'uniform float selPad;                  // and more for a selected vessel (its ring, 4 past its wall)\n'}${STRIP_VS_GLSL.replace(/#define ENT_W (\d+)/, 'const int ENT_W = $1;')}
flat out int vRow;
void main() {
  int id = int(aRow + 0.5);
  vRow = id;
  ${variant === V_BLOOD
    ? 'float pad = padU;'
    : `bool sel = (int(texelFetch(tube, ivec2(2, id), 0).z + 0.5) & ${K.F_SEL}) != 0;
  float pad = texelFetch(tube, ivec2(0, id), 0).w + padU + (sel ? selPad : 0.0);`}
  vec2 w = meshWorld(id, aV, pad);
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, (float(id) + 0.5) / ${ROW_DEPTH_ROWS}.0 * 2.0 - 1.0, 1.0);
}`;

/** The uniform names of the program for a variant, for the renderer core: { vs, fs } (the blood's and overlays' own come from D and G). */
export const vecStretchUniformNames = (variant) => ({
  vs: ['world', 'size', 'tube', 'padU', ...(variant === V_BLOOD ? [] : ['selPad']), 'ent', 'rad', 'posBase'],
  fs: [...VEC_SHADE_UNIFORMS, ...(variant === V_BLOOD ? ['keptBase'] : [])],
});

/**
 * The fragment shader of a variant. K: the flags and VEIL_K (vec-shade-glsl.js). parts: { blood, above } the text of D's VEC_BLOOD_GLSL and G's
 * vec-overlays text (declarations and functions; vecBlood / vecAboveAt); defaults are the stubs above.
 */
export function vecStretchFS(variant, K, parts = {}) {
  const blood = parts.blood ?? VEC_BLOOD_STUB, above = parts.above ?? VEC_ABOVE_STUB;
  const head = `${VEC_PRECISION}${VEC_SHADE_GLSL(K)}${variant === V_BASE ? '' : blood}${variant === V_BLOOD ? `${above}
uniform sampler2D keptBase;            // the kept still picture (V_BASE's output), the picture's size
` : ''}flat in int vRow;
layout(location=0) out vec4 outColor;
`;
  const lay = `
  float vis = clamp(lum / max(o.a, 1e-3), 0.0, 1.0);`;
  const body = variant === V_BLOOD ? `${lay}
  if (!(vis > 0.005 && o.a > 0.01)) discard;
  vec3 st = vecStreamAt(vRow, nr);
  vec4 bl = vecBlood(vRow, st.x, st.y, st.z, lumCol, px);
  vec3 lit = bl.rgb * vis + lumCol * (1.0 - bl.a * vis);
  vec4 b = texelFetch(keptBase, ivec2(gl_FragCoord.xy), 0);
  vec4 r = vec4(b.rgb + o.a * (lit - lumCol), b.a);
  r = vec4(min(max(r.rgb, vec3(0.0)), vec3(r.a)), r.a);
  outColor = over(vecAboveAt(p), r);` : variant === V_FULL ? `${lay}
  if (vis > 0.005 && o.a > 0.01) {
    vec3 st = vecStreamAt(vRow, nr);
    vec4 bl = vecBlood(vRow, st.x, st.y, st.z, lumCol, px);
    vec3 lit = bl.rgb * vis + lumCol * (1.0 - bl.a * vis);
    o = vec4(lit * o.a, o.a);
  }
  outColor = ditherOut(o, gl_FragCoord.xy);` : `
  outColor = ditherOut(o, gl_FragCoord.xy);`;
  return `${head}void main() {
  vec2 p = vecWorld();
  uvec4 cell = vecCellAt(p);
  if (cell.x != CELL_SIMPLE || int(cell.y) != vRow) discard;
  VecNear nr = vecNear(vRow, int(cell.z), int(cell.w), p, p - shOff);
  float lum;
  vec3 lumCol;
  vec4 o = vecShadeOne(vRow, nr, p, vecOccl(p), lum, lumCol);
  if (o.a < 0.002) discard;${body}
}`;
}

export { V_FULL, V_BASE, V_BLOOD };
