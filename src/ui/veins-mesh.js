// The vessel mesh renderer (Settings › Display › Mesh vessel renderer, on by default; veins-gl.js meshPass). Option 1 of the
// render redesign, built so the picture cannot change: docs/veins-mesh-plan.md.
//
// The classic vessel pass draws one square per cell, and every pixel of the square runs the whole vessel shader: it searches the
// cell's list (up to 2048 entries) for the vessels in reach, then runs the joins and tiers with eight slots. Most of those pixels
// are empty (no vessel within reach: zoomed in, most of each square), or lie near one vessel only, where the one-vessel build
// (vesselFS(true)) gives the same picture with none of the slot work. The mesh pass finds which is which on the GPU first, from the
// vessels' own geometry, then lets each pixel run only the shader it needs:
//
// 1. The vessel quads: one instanced quad per segment entry of the binning (the very entries the vessel shader reads, so a moved,
//    patched, coiling or morphing vessel needs nothing uploaded), the segment's capsule box widened by everything that can make the
//    classic shader keep that vessel at a pixel (the radius, the reach, the contact shadow's offset, two device pixels). Each quad
//    is drawn at a depth that names its vessel row.
//    Pass A: depth test LESS, stencil 1 where any quad lands (the depth keeps the lowest row there).
//    Pass B: the same quads, depth test NOTEQUAL, stencil 2 where a quad of any OTHER row lands.
//    So the stencil says 0: no vessel can be in reach; 1: one vessel row at most; 2: two or more. A vessel's own quads overlap
//    (bends, the round ends, the same segment listed in several cells) at the same depth, so they never count twice.
// 2. The cells, under the stencil test: the one-vessel build where the stencil is 1 (the same arithmetic the general build does
//    with one vessel in reach and so no join: vesselFS's own note), the general build where it is 2, nothing where it is 0 (the
//    classic shader discards there; a redraw over a kept picture writes those pixels empty with the zero shader below, as the
//    classic redraw does).
// The boxes only ever over-cover, so a pixel is marked 2 wherever the classic shader could keep two vessels, and 0 only where it keeps
// none: the picture is the classic one, pixel for pixel. What over-covering costs is a pixel shaded by the general build that the
// one-vessel build could have drawn, never a different pixel.

/** Device pixels added to each quad beyond the classic shader's own reach (its 2 px), for rounding in the two transforms. */
export const MASK_MARGIN_PX = 2;

/**
 * A segment quad's corner (JS reference of MASK_VS): segment a→b (world), half-width R (the radius plus the pad), corner (cx, cy)
 * in 0…1. The quad is the capsule's box: R past each end along the segment, R to each side. Into `out` ([x, y]).
 */
export function maskCorner(ax, ay, bx, by, R, cx, cy, out = [0, 0]) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  const tx = L > 1e-6 ? dx / L : 1, ty = L > 1e-6 ? dy / L : 0;
  const s = -R + cx * (L + 2 * R), n = -R + cy * 2 * R;
  out[0] = ax + tx * s - ty * n; out[1] = ay + ty * s + tx * n;
  return out;
}
/** How far the quads reach past a lumen (world): the classic reach and its 2 px, the shadow's offset, and the margin. */
export function maskPad(reachU, shOff, px) {
  return reachU + (2 + MASK_MARGIN_PX) * px + Math.hypot(shOff?.[0] || 0, shOff?.[1] || 0);
}
/** The depth (0…1, window) that names a vessel row: rows < nRows. Strictly increasing, inside (0, 1). */
export const maskDepth = (row, nRows) => (row + 1) / (nRows + 2);

// The quads' vertex shader. ent / rad / tube / PT as the vessel shader reads them (veins-gl.js vesselFS).
export const MASK_VS = (N_SAMPLES, ENT_W) => `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 corner;
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform mat3 world;
uniform vec2 size;
uniform vec2 lOff;
uniform float pad;
uniform float zK;                      // 1 / (rows + 2): see maskDepth
uniform int morphOn;
uniform int posBase;
const float LAST = ${N_SAMPLES - 1}.0;
vec4 E(int e, int k) { int t = e * 2 + k; return texelFetch(ent, ivec2(t % ${ENT_W}, t / ${ENT_W}), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${ENT_W}, t / ${ENT_W}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
void main() {
  vec4 A = E(gl_InstanceID, 0), B = E(gl_InstanceID, 1);
  // (A head entry (segment −1), or a list's spare room, all zero: no segment.)
  bool none = B.y < -0.5 || (A == vec4(0.0) && B == vec4(0.0));
  int id = int(B.x + 0.5), si = int(B.y + 0.5);
  float i = float(si), u0 = i / LAST, u1 = (i + 1.0) / LAST;
  vec4 clip = texelFetch(tube, ivec2(5, id), 0);
  // (A segment wholly outside the drawn part is passed over by the vessel shader: the same test.)
  if (none || u1 < clip.x || u0 > clip.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (morphOn >= 1) A = vec4(PT(id, si), PT(id, si + 1));
  vec2 rr = texelFetch(rad, ivec2(si, id), 0).rg;
  float R = max(rr.x, rr.y) + pad;
  vec2 d = A.zw - A.xy;
  float L = length(d);
  vec2 t = L > 1e-6 ? d / L : vec2(1.0, 0.0);
  float s = -R + corner.x * (L + 2.0 * R), n = -R + corner.y * 2.0 * R;
  vec2 w = A.xy + t * s + vec2(-t.y, t.x) * n;
  vec3 dv = world * vec3(w, 1.0);
  dv.xy += lOff;
  gl_Position = vec4(dv.x / size.x * 2.0 - 1.0, 1.0 - dv.y / size.y * 2.0, float(id + 1) * zK * 2.0 - 1.0, 1.0);
}`;
// (Depth and stencil only: the colour writes are masked while the quads draw.)
export const MASK_FS = `#version 300 es
precision mediump float;
void main() {}`;
// A redraw over a kept picture writes the pixels no vessel reaches empty, in all four targets, as the classic shader does there.
export const ZERO_FS = `#version 300 es
precision mediump float;
layout(location=0) out vec4 o0;
layout(location=1) out uvec4 o1;
layout(location=2) out uvec4 o2;
layout(location=3) out vec4 o3;
void main() { o0 = vec4(0.0); o1 = uvec4(0u); o2 = uvec4(0u); o3 = vec4(0.0); }`;

/** The segment entries of a binning (veins-bin cells: 6 floats each): every entry before the first cell's joins. */
export const segEntries = (cells, nCells) => (cells && nCells > 0 ? cells[4] : 0);

// The stencil values (low two bits: the count; bit 2: a one-pass zoom frame's mark that a cell drew the pixel, veins-gl composite).
export const S_ONE = 1, S_MANY = 2, S_COUNT = 3, S_DRAWN = 4;
