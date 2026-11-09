// Veins on the GPU (WebGL2): the anatomy's vessels drawn from signed distances instead of SVG
// tubes, so vessels that meet merge into one smooth, filleted shape.
//
// Each vessel (vein, artery, cavernoma strand, tributary) is its sampled centerline as a chain of
// round-capped segments (capsules) whose radius follows its drawn caliber (junction easing,
// stenosis waist). The world is cut into square cells, and each cell lists the segments (grouped
// by vessel) and junctions that can reach it; one instanced quad per non-empty cell runs the
// fragment shader, which loops over only that cell's list: per vessel the exact distance to its
// nearest segment, then a smooth minimum between vessels that share a junction (a fillet), a
// plain minimum otherwise.
//
// The picture is composited in depth tiers, back to front, each tier as one shape: a soft
// contact shadow, the casing band just outside the lumen, the pressure-colored lumen and the
// flat, textbook shading: a thin light line and a thin dark line, placed by the across-tube
// coordinate. Vessels in different tiers pass over or under each other with their own casings; where a
// vessel ends on one in a lower tier, the lower one is copied into the upper tier near the
// junction and fades out with distance, so that join is filleted too. Tiers behind the organs
// are faded where an organ covers them (the organ covers are a texture), as the SVG's ghost did.
//
// Geometry (the entries) is uploaded when the layout changes; radii when a vessel's width
// changes; colors, tiers and flags on every model frame (a few kilobytes).
//
// Shape apart from colour: beside each pixel's colour the shader notes whether any lumen colour reaches it (a fourth
// target). A change of some vessels' lumen colours alone (the pulse, the lymph's tint) then draws again only the pixels
// so marked, in the cells that list those vessels, with this same shader (see tintPass): every other pixel's colour does
// not depend on them, so it is already what a whole draw would give. The picture is the one a whole draw makes, pixel
// for pixel, without drawing the shape-only pixels (casings, shadows, the space between vessels) again.
//
// The moving blood (see blood.js) is drawn by the composite pass further down, from a lumen buffer
// this shader writes beside the color.
//
// createVeinsGL(canvas) returns null only when WebGL2 is unavailable altogether.

import { glGet, glCap, glOkBefore, glOkAfter, fbComplete } from './gl-state.js';
import { CHEV_GLSL } from './chevron-glsl.js';
import { setFenceContext, fencePart } from './gpu-fence.js';
import { LIGHT } from './light.js';
import { EDGE_GLSL, EDGE_PX } from './edge.js';
import { SLOT, DYE_BINS, PERIOD, DRIFT_PERIOD, DRIFT_RATE } from './blood.js';
import { cssRGB } from './util.js';
import { LIFT_EASE_SHARE, LIFT_EASE_MAX } from './highlight-math.js';
import { LUMEN, STO_Y0, STO_DY, STO_N } from './stomach-lumen.js';
import { CELL, ENT_W, binVeins, splitRows, simpleCells, splitCells, cellsOfJoinEntries } from './veins-bin.js';
import { gpuProbe, COUNTED } from './gpu-probe.js';
import { changedRows } from './flow-rows.js';
import { leftAlone, whenQuiet } from './quiet.js';
import { uniformCache } from './uniform-cache.js';
import { createDirtyTiles } from './dirty-tiles.js';
import { createKeep } from './lobule-keep.js';
import { PUBLISH_QUIET_MS, SHADER_WARM, exerciseDraw } from './gl-compile.js';
import { createShapeGL, flattenPath, ellipsePoly, polyMeshInto } from './shape-gl.js';
import { createOrganStack, prestartOrganStack, prestartLayer } from './organs-gl.js';
import { warmFade } from './res-fade-gl.js';
import { fusedVS, fusedFS } from './veins-fuse.js';
import { shadeGLSL, meshFS, meshStripVS, meshPatchVS, MESH_LAY_FS, MP } from './veins-mesh-glsl.js';
import { STRIP_VS_GLSL, stripIndex, PATCH_QUAD } from './veins-mesh.js';
import { pointsFromEntries, joinEntryList, tierBuckets, patchesByTier, patchGroups, PG_W, PG_M } from './veins-mesh-data.js';
import { createBloodTile, D_GLSL, E_GLSL, STYLE_D, STYLE_E, TILE_V_PER_ROW } from './blood-tile.js';
import { headVS, headMain, createHeadList } from './blood-heads.js';
import { softwareGL } from './sw-yield.js';
import { createVecRenderer, createVecLobule, vecParts } from './vec-seam.js';
import { indexFlow } from './vec-lobule.js';
import { frameCount, framePhase, onFrameFinal, onFrameEnd, frameFor, vesselMesh, vesselRenderer } from './frame.js';
import { keepScreen } from './keep-screen.js';
import { caught } from './caught.js';
import { counts, tally } from './frame-counts.js';
const ORGAN_MESH = { tri: null, seg: null, nTri: 0, nSeg: 0 };   // alloc-rare: made once (the organ texture's shapes are meshed into it one at a time, each released after its draw)

export { binVeins };

export const N_SAMPLES = 64;
export const FLOW_TEXELS = 8;          // per-vessel blood: see stage.js (stepBlood, chainRows)
// Where along a vessel its colour stands at arc fraction u (pressure-along.js): the plain u for a row with no waist (its rad
// texels' b is −1), else the along curve between its samples. In both the vessel shader and the composite.
const ALONG_GLSL = `
float alongAt(int id, float u) {
  float ui = u * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`;
const SLOT_W = SLOT;
export const TUBE_TEXELS = 13;         // texels of per-vessel attributes (see the layout below)
export const MAX_TIERS = 20;
const S_OFF = 96;                      // arc length is stored offset by this, so it can run on past a vessel's start
// The lumen buffer's row (x) carries this bit where the second lumen target holds a lumen too (near a join): the composite
// masks it off, and reads the second target only where it is set (review/blood-shading-ideas item 6).
export const LUMEN2 = 0x8000;
// The second lumen target (RG16UI, 4 bytes a pixel, where it was RGBA16UI's 8): x, its row + 1 in the low ROW2_BITS bits and the top
// five bits of its across (7 bits, 0–127); y, 4 × (arc + S_OFF) in the top 14 bits and the across's low two. Its share sits in the
// first target's w with the front lumen's visibility (8 bits each). Only the dye and the origin colours read the second lumen (the
// streaks are the front lumen's alone, at full precision), and 128 steps across are over four per lane of the seven (LANE_K).
export const ROW2_BITS = 11, ROW2_MASK = (1 << ROW2_BITS) - 1;
export const ORIGIN_GREY = 0.62;       // the lumen's color while the blood is colored by origin
// The streaks' density divisor: the lanes' weights summed, for each whole lane count 1 … 7 (lane i of n stands at
// yl = ((i + 0.5) / n · 2 − 1) · 0.8 and weighs max(2, round(16 (1 − yl²))) / 8). The shader and the lobule read it between
// the counts, from the same continuous count as the lane width, so the density never steps as the count moves with
// zoom, a taper or the breath (round 2 review, BM9).
export const LANE_K = Array.from({ length: 7 }, (_, j) => {
  const n = j + 1;
  let k = 0;
  for (let i = 0; i < n; i++) { const yl = n === 1 ? 0 : (((i + 0.5) / n) * 2 - 1) * 0.8; k += n === 1 ? 1 : Math.max(2, Math.floor(16 * (1 - yl * yl) + 0.5)) / 8; }
  return k;
});
// (R: the lumen's radius, pxW: world units per device pixel; as bloodAt's sumK in the shader.)
export function laneSum(R, pxW) {
  const x = Math.min(Math.max((1.7 * R) / Math.max(2.6, 5 * pxW), 1), 7) - 1, i = Math.min(Math.floor(x), 5);
  return LANE_K[i] + (LANE_K[i + 1] - LANE_K[i]) * (x - i);
}
const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
// One GPU context for the lobule (1 Nov, docs/gpu-practices.md, "one WebGL context for the whole figure"): its overlay (the ductules and
// the lymph, fx-gl.js) drawn in its vessel canvas over the vessels instead of in a canvas and context of its own.
// Settings › Figure performance › Pinch frame reuse (frame.js pinchReuse, off by default; stage.js passes it only while a hand zooms):
// on some of the one-pass zoom frames, the last picture the one-pass shader drew is laid again, moved and scaled by the zoom since,
// instead of shading the figure afresh. REUSE_FS maps each pixel of the canvas now to where the same world point was in that picture
// (device px, y down) and reads it there, filtered.
const REUSE_VS = `#version 300 es
layout(location = 0) in vec2 aQ;
void main() { gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0); }`;
const REUSE_FS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform vec2 uSize;
uniform mat3 uMap;
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 q = (uMap * vec3(p, 1.0)).xy;
  o = texture(uT, vec2(q.x / uSize.x, 1.0 - q.y / uSize.y));
}`;
// The figure's overlays (organ-paint's ops, organs-gl's stack over the canvas: see `overlay`) laid over the canvas, pixel for pixel,
// premultiplied (the stack's texture is the canvas's size, its rows as the canvas's).
// (Plan "Holding 120 Hz" §3.6: colour-only work in half precision, which Apple's GPUs run at twice the rate. LAY_FS reads by whole pixel;
// UP_FS keeps its positions highp and does its weights and colour in mediump.)
const LAY_FS = `#version 300 es
precision mediump float;
uniform sampler2D uT;
out vec4 o;
void main() { o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0); }`;
// The camera and alpha of the final present (moved off CSS on the canvas, 4 Nov 2026: a CSS scale or opacity on the canvas takes the glass drawn in
// it along): a picture (own, or the overlays') laid onto the canvas scaled by uCam.x about (uCam.y, uCam.z) (canvas px, y up) and weighed by
// uA, premultiplied; outside the picture, clear. Filtered, so a zoom is smooth.
const CAM_FS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform highp vec2 uDst;
uniform highp vec3 uCam;
uniform float uA;
out vec4 o;
void main() {
  highp vec2 q = (gl_FragCoord.xy - uCam.yz) / uCam.x;
  highp vec2 uv = q / uDst;
  o = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uT, uv) * uA;
}`;
// A shared renderer's picture (the lobule's) laid over the canvas: it spans the canvas (uDst px), and goes where p' = M p + t puts it (canvas px,
// y down; uM the inverse of M, row by row, uTr = t), weighed by uA, premultiplied; outside it, clear. Filtered. (Both y up in the framebuffers.)
const LAYT_FS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform highp vec2 uDst;
uniform highp vec4 uM;
uniform highp vec2 uTr;
uniform float uA;
out vec4 o;
void main() {
  highp vec2 dd = vec2(gl_FragCoord.x, uDst.y - gl_FragCoord.y) - uTr;
  highp vec2 s = vec2(uM.x * dd.x + uM.y * dd.y, uM.z * dd.x + uM.w * dd.y);
  highp vec2 uv = vec2(s.x / uDst.x, 1.0 - s.y / uDst.y);
  o = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uT, uv) * uA;
}`;
// Sharper upscaling: the picture (uSrc px) onto the canvas (uDst px), each pixel a Catmull-Rom of the picture's 4 × 4 around it, in five
// filtered reads (the corner taps left out, their weights folded away), then held within the four picture pixels nearest it so an
// edge never rings. Premultiplied in and out. (Both framebuffers run y up, so no flip.)
const UP_FS = `#version 300 es
precision mediump float;
uniform sampler2D uT;
uniform highp vec2 uSrc, uDst;
out vec4 o;
void main() {
  highp vec2 p = gl_FragCoord.xy * uSrc / uDst, tc = p - 0.5, b = floor(tc) + 0.5;
  vec2 f = fract(tc);
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  highp vec2 t0 = (b - 1.0) / uSrc, t3 = (b + 2.0) / uSrc, t12 = (b + w2 / w12) / uSrc;
  float a = w12.x * w0.y, bb = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
  vec4 col = texture(uT, vec2(t12.x, t0.y)) * a + texture(uT, vec2(t0.x, t12.y)) * bb + texture(uT, t12) * c
           + texture(uT, vec2(t3.x, t12.y)) * d + texture(uT, vec2(t12.x, t3.y)) * e;
  col /= a + bb + c + d + e;
  ivec2 q = ivec2(floor(tc)), mx = ivec2(uSrc) - 1;
  vec4 n0 = texelFetch(uT, clamp(q, ivec2(0), mx), 0), n1 = texelFetch(uT, clamp(q + ivec2(1, 0), ivec2(0), mx), 0);
  vec4 n2 = texelFetch(uT, clamp(q + ivec2(0, 1), ivec2(0), mx), 0), n3 = texelFetch(uT, clamp(q + ivec2(1, 1), ivec2(0), mx), 0);
  col = clamp(col, min(min(n0, n1), min(n2, n3)), max(max(n0, n1), max(n2, n3)));
  o = vec4(min(col.rgb, vec3(col.a)), col.a);
}`;
/** Device px now → device px in the picture drawn with `then` (both world → device [a, b, c, d, e, f]): then ∘ now⁻¹, or null. */
export function reuseMap(then, now, out = [0, 0, 0, 0, 0, 0]) {   // (`out`: where the answer is written; a frame passes a kept one)
  const a = now[0], b = now[1], c = now[2], d = now[3], e = now[4], f = now[5], det = a * d - b * c;
  if (!det) return null;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det, ie = (c * f - d * e) / det, iff = (b * e - a * f) / det;
  const A = then[0], B = then[1], C = then[2], D = then[3], E = then[4], G = then[5];
  out[0] = A * ia + C * ib; out[1] = B * ia + D * ib; out[2] = A * ic + C * id; out[3] = B * ic + D * id; out[4] = A * ie + C * iff + E; out[5] = B * ie + D * iff + G;
  return out;
}
/** Whether the picture mapped by `k` (reuseMap) covers a w × h canvas: every corner lands inside it (half a pixel's slack). */
export function reuseCovers(k, w, h) {
  if (!k) return false;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? w : 0, y = i & 2 ? h : 0;
    const qx = k[0] * x + k[2] * y + k[4], qy = k[1] * x + k[3] * y + k[5];
    if (!(qx >= -0.5 && qx <= w + 0.5 && qy >= -0.5 && qy <= h + 0.5)) return false;
  }
  return true;
}
// The composite's per-frame uniform arrays, filled in place: it ran six `new Float32Array`s a frame. (Each is uploaded at once,
// so one set serves every renderer.)
// The origin colours flattened once per palette (the palette is one object for the page's life), not every frame (P8).
const OC = new WeakMap();
const originColOf = (src) => { let a = OC.get(src); if (!a) OC.set(src, a = new Float32Array(src.flat())); return a; };
const SCRATCH = { world: new Float32Array(9), inv: new Float32Array(9), be: new Float32Array(96), bb: new Float32Array(96), ncv: new Float32Array(48), hb: new Float32Array(64), hr: new Float32Array(16) };
const ORIGIN_WHITE = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]];
// The composite's defaults and scratch, made once (it made an array for each default it fell back on, a rest list for its
// signature and a list of passes, in every frame: 2 Nov 2026, scripts/frame-alloc.mjs). None is written to by a reader.
const NONE = [], NOBLOOD = {}, INV1 = [0], INVC = [0];
const R_UNIT = [0, 0, 1, 1], V4_ZERO = [0, 0, 0, 0], LV_DEF = [1, 0], CHEV_INK = [0.08, 0.08, 0.1], CHEV_LIGHT = [1, 0.93, 0.86];
const DYE_COL = [0.8, 0.95, 0.2], REV_COL = [1, 0.55, 0.16], INK_LIGHT = [1, 1, 1], INK_DARK = [0.1, 0.1, 0.16];
/** A 2D transform [a b c d e f] written as the 3×3 the shaders take, into dst, in place. */
const m3put = (dst, a, b, c, d, e, f) => { dst[0] = a; dst[1] = b; dst[2] = 0; dst[3] = c; dst[4] = d; dst[5] = 0; dst[6] = e; dst[7] = f; dst[8] = 1; return dst; };

// Flags (tube texel 2, z).
// Stream flags (tube texel 5, w): the stream runs on at the upstream / downstream end; reversed flow.
export const F_UP = 1, F_DN = 2, F_REV = 4;
export const F_SEL = 1, F_DIFFUSE = 2, F_SHADOW = 4, F_DOTTED = 8, F_NOCASE = 16, F_SPEC = 32, F_EDGE = 64, F_VEIL = 128, F_WHOLE = 256;   // F_EDGE: the casing takes its own color (texel 6) and is opaque; F_VEIL: faded along its whole course as if behind an organ; F_WHOLE: a vessel behind the organs shown whole (the cava, selected or spotlit): the organs do not fade it, yet it stays in its tier, behind every vessel of the network
// How much an organ fades a vessel behind it (and a veiled vessel along its course): to 1 − VEIL_K of full. 0.5 read as a
// translucent organ with vessels inside it; 0.6 leaves the lumen's ghost and says "behind" (looks review, vessels behind organs, 31 Oct).
export const VEIL_K = 0.6;
// (What the vector renderer's shaders take of the flags above: vec-seam.js VEC_K_NAMES.)
const VEC_K = { F_SEL, F_DIFFUSE, F_SHADOW, F_DOTTED, F_NOCASE, F_SPEC, F_EDGE, F_VEIL, F_WHOLE, VEIL_K };

const VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;        // cell origin (world)
layout(location=2) in vec4 range;      // first segment entry, count, first junction entry, count
uniform mat3 world;                    // world → device pixels
uniform vec2 size;
uniform float cell;
uniform vec2 lOff;                     // where the layer holds a screen pixel: its place in the layer minus its place on screen (device px, y down; see wrapPieces)
out vec2 vW;
flat out ivec4 vR;
void main() {
  vec2 w = org + corner * cell;
  vec3 d = world * vec3(w, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vW = w; vR = ivec4(range + 0.5);
}`;

// The shading the classic and mesh vessel shaders share (veins-mesh-glsl.js), with the renderer's constants.
const SHADE_GLSL = shadeGLSL({ F_DIFFUSE, F_EDGE, F_SHADOW, F_SPEC, F_VEIL, F_WHOLE, LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2, ROW2_BITS, VEIL_K });
// The mesh passes' parts of the same text (veins-mesh-glsl.js meshFS; vesselFS(simple, mesh) puts them in).
const MESH_GLSL = meshFS({ EDGE: EDGE_GLSL, F_DOTTED, F_NOCASE, F_SEL, F_VEIL, VEIL_K });
const MESH_FS_DECL = MESH_GLSL.decl, MESH_FS_KEY = MESH_GLSL.key, MESH_FS_OUT = MESH_GLSL.out;
// Tube attributes, TUBE_TEXELS texels per vessel (row = vessel):
//   0: color at the start (rgb), casing width (world)
//   1: color at the end (rgb), alpha
//   2: tier, z (draw order within a tier), flags, 0 (unused)
//   3: fade: linear from (x, y) to (x, y), or radial: center (x, y), radius
//   4: fade: offset, alpha at the start, alpha at the end (radial: at 45 %), mode (0 none, 1 linear, 2 radial, 3 linear with a dip: faintest at the offset, solid at the end)
//   5: drawn part along the vessel (0–1): from, to; arc length (world); stream flags (F_UP, F_DN, F_REV)
//   6: the casing's own color with F_EDGE (rgb), streak course length (world)
//   7: flow streaks: phase at the upstream end, spacing (world), direction (±1, from → to), strength (0 off)
//   8: a stretch recolored (the HVPG's wedged vein): color (rgb), amount (0 none)
//   9: that stretch along the vessel (0–1): from, to; its soft edge (world); hover (0–1: the lumen a little brighter)
//  10: glow (a hovered, focused or highlighted vessel): color (rgb), amount (0 none)
//  11: the glow's fade at the start, at the end (world; 0: runs on into the next glowing vessel; both −(1 + u): only the
//      stretch between the two u glows, 0–1 along the vessel); 1: its own color;
//      its width (× the usual, 0 or 1 usual; at most 1.3: 15.6 past the wall, inside the vessel's cells)
//  12: selection: how far the vessel stands out of the dimmed network (0–1), whether it eases back into it toward its
//      start, toward its end (1: over a third of its length, at most 60, as the hover's brightening; 0: it runs on at full)
// The vessel shader, in two builds from this one text: the general one (`simple` false), and one for the cells that list a
// single vessel and no join (veins-bin simpleCells), with one vessel slot and the join code left out. In such a cell the
// general build fills one slot and finds no join, so every loop over the other slots and over joins does nothing: the
// simple build is the same arithmetic on the same inputs, without the work that cannot change anything there.
export const vesselFS = (simple, mesh = 0) => `#version 300 es
precision highp float;
precision highp int;
#define SIMPLE ${simple ? 1 : 0}
#define MESH ${mesh}
#if MESH == 0
in vec2 vW;
flat in ivec4 vR;
#else
#if MESH == 1
in float vI;                           // (mesh strip) the sample index along the vessel, interpolated across the strip
flat in int vRow;                      // (mesh strip) its vessel row
#else
flat in vec4 vM0;                      // (mesh patch) its vessels, rows (-1 none): the first four
flat in vec4 vM1;                      // (mesh patch) and the next four
flat in ivec4 vWa;                     // (mesh patch) each vessel's first segment near the patch's joins (vessels 0-3)
flat in ivec4 vWb;                     // (mesh patch) and its last
flat in ivec4 vWa2;                    // (mesh patch) the same, vessels 4-7
flat in ivec4 vWb2;
flat in ivec4 vR;                      // (mesh patch) its joins: z the first in pjTex, w their count (read by E() below)
flat in int vNJ;                       // (mesh patch) its joins' count, for the test below
uniform highp sampler2D pjTex;         // (mesh patch) the patches' join entries, one a texel row (A, B), as the binned entries hold them
#endif
#endif
#if MESH
${MESH_FS_DECL}
#endif
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D rmax;           // per vessel: its largest lumen radius now
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform vec4 invA;                     // device pixels → world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen (see the vertex shader)
uniform vec2 sizeF;                    // the layer, device pixels
uniform float reachU;                  // how far from a lumen anything is drawn (world)
uniform vec2 shOff;                    // contact shadow offset (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 rimInk;                   // a dark lumen's light rim: rgb, alpha (0 on the light looks)
uniform vec4 paperInk;                 // the figure's ground: rgb, alpha (the knock-out ring where vessels of one tier cross)
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture (drawRows), not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw (tintPass): only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int morphOn;                   // 1: a binning made for a stretch of the change between the views (veins-sweep.js): the points and joins from the frame's rows; 2: the same, its heads and runs with circles about the frame's points (tight)
uniform int posBase;                   // (morphOn) the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
uniform int joinBase;                  // (morphOn) the texel of the frame's joins: one a join (centre, reach, blend width and fillet)
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 × (arc length + S_OFF), across (0–65535), visibility (high byte) | the second lumen's share (low byte)
#if SIMPLE == 0
layout(location=2) out uvec4 outFlow2; // near a join, the lumen it joins, packed (ROW2_BITS): row + 1 | across's top bits, 4 × (arc + S_OFF) | across's low bits
#else
uvec4 outFlow2;                        // (one vessel and no join: never a second lumen, always zero; the one-vessel build's draws leave that target as it stands, zero: see vesselDraw)
#endif
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

#define MAXS ${simple ? 1 : 8}
#define MAXJ ${simple ? 1 : 6}
#define ENT_W ${ENT_W}
const float LAST = ${N_SAMPLES - 1}.0;
const float S_OFF = ${S_OFF}.0;

#if MESH == 2
vec4 E(int e, int k) { return texelFetch(pjTex, ivec2(k, e), 0); }   // (a patch: its joins' entries)
#else
vec4 E(int e, int k) { int t = e * 2 + k; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
#endif
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }
vec4 JT(int j) { int t = joinBase + j; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
${ALONG_GLSL}
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
// How far two joined vessels make a corner at p (0 … 1): whether each one's centreline lies off the other's toward p.
// On a trunk's far wall, opposite a tributary that ends inside it, the tributary's centreline ends on the trunk's own: 0
// there, so that wall is the trunk's alone (no fillet swelling it, no blend of the tributary's caliber or shading); 1 in
// the corners beside the tributary and inside it. (ga, gb: unit directions from each centreline to p; da, db: the
// distances from each wall; ra, rb: the radii.)
// Where one of the two is the trunk the other ends on (role 1: a, 2: b), only the test that matters there is made: the
// tributary's centreline lies off the trunk's toward p. The trunk's off the tributary's toward p fails in the corner itself
// when the tributary ends well inside the trunk (the hepatic veins on the IVC): the vein's round end is the nearest point
// there, so the fillet was cut off on the wall's last few units short of the vein's wall, and the wall above it, swollen
// by the fillet, ended in a spike. (role 0: two vessels meeting at a node, either may lead: both tests.)
// At a fork (kw: the fillet's width there, 0 elsewhere) the trunk is the vessel that runs on through the node, the cava
// above the heart where the azygos arch ends on it. Both tests had read the arch's own nearest segment, which turns at each
// of its short segments, so the corner switched on and off along the arch in saw-teeth; and the corner's edge, a fifth or so of the
// radius wide, left the wall a step where the fillet ended. At a fork the corner now asks only the trunk test (the nearer of
// the trunk's two stretches stands in for it: tn) and eases its edge over about the fillet's own width.
float corner(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role, float kw) {
  vec2 ca = p - ga * (da + ra), cb = p - gb * (db + rb);
  float o1 = dot(cb - ca, ga), o2 = dot(ca - cb, gb), rm = max(min(ra, rb), 0.5);
  float off = role == 1 ? o1 : role == 2 ? o2 : min(o1, o2);
  return smoothstep(0.25 * rm, 0.25 * rm + max(0.35 * rm, 0.9 * kw), off);
}

${SHADE_GLSL}
void main() {
#if MESH
  // (The ring's mark: the tier's lumens, by their keys: this depth over a lumen's, the depth test GREATER, sets the stencil.)
  if (mPass == MP_MARK) { gl_FragDepth = keyShape + 0.5 * keyH; return; }
#endif
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself (not interpolated across the cell): a pixel showing
  // the same spot of the figure after a pan by whole pixels gets exactly the same position, so the layer shifted by
  // those pixels is exactly the layer drawn there (see draw).
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y), ps = p - shOff;
  float reach = reachU + 2.0 * px;

  // ── Nearest point of each vessel in this cell ──
  int n = 0;
  int sid[MAXS];
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS], sx[MAXS], sv[MAXS], sk[MAXS];
  vec2 sg[MAXS];
  int cur = -1;
  // bx: signed distance across the nearest segment's line (the lumen's across coordinate, also
  // past the vessel's ends); bu: how far along (0–1), running on past either end.
  float bd = 1e9, bs = 1e9, br = 0.0, bu = 0.0, bx = 0.0;
  // aU / aW: how far along, smooth off the wall: each nearby segment's course carried on straight past its ends,
  // weighted softly by how near it is. (The nearest segment's own is constant across the fan off a bend's
  // outside, and the glow's fade along the vessel, read from it, drew stripes there.)
  float aM = 1e9, aW = 0.0, aU = 0.0;
  vec2 bg = vec2(0.0);
  vec4 clip = vec4(0.0, 1.0, 1.0, 0.0);
  bool dotted = false;
  float rmx = 0.0;
#if MESH == 0
  int cnt = min(vR.y, 2048);
  for (int k = 0; k <= cnt; k++) {
    int id = -2;
    vec4 A = vec4(0.0), B = vec4(0.0);
    if (k < cnt) { A = E(vR.x + k, 0); B = E(vR.x + k, 1); id = int(B.x + 0.5); }
    if (id != cur) {
      if (cur >= 0 && min(bd, bs) < reach) {
        int slot = n;
        // When the slots are full, the vessel that matters least here gives way: the farthest, a glowing one
        // counting as nearer by its glow's width (or a crowded join, the hepatic veins' at the IVC, drops its glow in blocks).
        float key = bd - (T(cur, 10).a > 0.0 ? 16.0 : 0.0);
        if (n == MAXS) {
          slot = 0;
          for (int s = 1; s < MAXS; s++) if (sk[s] > sk[slot]) slot = s;
          if (key >= sk[slot]) slot = -1;
        } else n++;
        if (slot >= 0) { sk[slot] = key; sid[slot] = cur; sd[slot] = bd; sh[slot] = bs; sr[slot] = br; su[slot] = bu; sg[slot] = bg; sx[slot] = bx; sv[slot] = aW > 0.0 ? aU / aW : bu; }
      }
      cur = id; bd = 1e9; bs = 1e9; aM = 1e9; aW = 0.0; aU = 0.0;
      if (id >= 0) { clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${F_DOTTED}) != 0; rmx = texelFetch(rmax, ivec2(0, id), 0).r; }
    }
    if (k == cnt) break;
    // The head of this vessel's stretch of the list (segment index -1: a circle holding every point of the stretch, and
    // its length; see veins-bin). When every point lies out of reach, by the wall and by the shadow, the vessel would not
    // be kept here whatever its segments, so they are passed over.
    if (B.y < -0.5) {
      // (Between the views, tight: also the circle about the head's middle point as it is in this frame (veins-sweep.js fitSwept). Each
      // circle holds every point of the head's segments in this frame, so a pixel out of reach of either is out of reach of them all.)
      float hd = min(length(p - A.xy), length(ps - A.xy)) - A.z;
      if (morphOn == 2) { vec2 hc = PT(id, int(B.z + 0.5)); hd = max(hd, min(length(p - hc), length(ps - hc)) - A.w); }
      if (hd - rmx > reach + 0.01) k += int(B.w + 0.5);
      continue;
    }
    // A run of this vessel's segments (B.w of them, every point within B.z of this one's start: see veins-bin) that lies
    // wholly past what could change anything here is passed over: each of its segments would be farther than this
    // vessel's nearest so far by more than the 12 the along-course blend reads, and its shadow farther than the nearest
    // shadow, so it would change nothing. (Never the vessel's first run: the nearest so far starts unset.)
    if (B.w > 1.5) {
      float lo = length(p - A.xy) - B.z - rmx, los = length(ps - A.xy) - B.z - rmx;
      if (morphOn == 2) { vec2 rc = PT(id, int(A.w + 0.5)); lo = max(lo, length(p - rc) - A.z - rmx); los = max(los, length(ps - rc) - A.z - rmx); }
      if (lo > aM + 12.01 && los > bs + 0.01) { k += int(B.w + 0.5) - 1; continue; }
    }
    // (Between the views, the segment as it is in this frame: the entry holds a sample's, for the passes above.)
    if (morphOn >= 1) { int si = int(B.y + 0.5); A = vec4(PT(id, si), PT(id, si + 1)); }
    segNear(id, B.y, A, p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
  }
#else
#if MESH == 1
  // (A strip: its own vessel alone, the segments about the strip's sample: the nearest point of the vessel lies on one of them, since the
  // strip's triangles about each segment are what cover the pixels nearest it; the prepass keeps the nearest of the overlapping ones.)
  {
    int id = vRow;
    clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${F_DOTTED}) != 0;
    int ic = clamp(int(vI), 0, ${N_SAMPLES - 2});
    for (int j = max(0, ic - MESH_WIN); j <= min(${N_SAMPLES - 2}, ic + MESH_WIN); j++)
      segNear(id, float(j), vec4(PT(id, j), PT(id, j + 1)), p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
    if (min(bd, bs) < reach) { sk[0] = bd; sid[0] = id; sd[0] = bd; sh[0] = bs; sr[0] = br; su[0] = bu; sg[0] = bg; sx[0] = bx; sv[0] = aW > 0.0 ? aU / aW : bu; n = 1; }
  }
#else
  // (A patch: a pixel outside every one of its joins' reach is drawn by the strips alone: there no join changes the shape (the join
  // loop below skips a join farther than its reach), and the strips' keys stand. Only the pixels inside one are worked out here.)
  {
    bool inJ = false;
    for (int k = 0; k < 6; k++) {
      if (k >= vNJ) break;
      vec4 A = E(vR.z + k, 0);
      if (morphOn >= 1) A = JT(int(A.x + 0.5));
      if (length(p - A.xy) <= A.z) inJ = true;
    }
    if (!inJ) discard;
  }
  // (A patch: its joins' vessels, each over its segments near them (the vertex shader found them).)
  for (int m = 0; m < 8; m++) {
    int mi = m < 4 ? m : m - 4;
    float mv = m < 4 ? vM0[mi] : vM1[mi];
    if (mv < -0.5) continue;
    int id = int(mv + 0.5), wa = m < 4 ? vWa[mi] : vWa2[mi], wb = m < 4 ? vWb[mi] : vWb2[mi];
    bool dup = false;
    for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == id) dup = true;
    if (dup) continue;
    bd = 1e9; bs = 1e9; br = 0.0; bu = 0.0; bx = 0.0; aM = 1e9; aW = 0.0; aU = 0.0; bg = vec2(0.0);
    clip = T(id, 5); dotted = (int(T(id, 2).z + 0.5) & ${F_DOTTED}) != 0;
    for (int j = wa; j <= wb; j++) segNear(id, float(j), vec4(PT(id, j), PT(id, j + 1)), p, ps, clip, dotted, bd, bs, br, bu, bx, bg, aM, aW, aU);
    if (min(bd, bs) < reach) { int s = n; sk[s] = bd; sid[s] = id; sd[s] = bd; sh[s] = bs; sr[s] = br; su[s] = bu; sg[s] = bg; sx[s] = bx; sv[s] = aW > 0.0 ? aU / aW : bu; n++; }
  }
#endif
#endif
  if (n == 0) { if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; } discard; }

  // ── Junctions: which of these vessels are joined here, and how widely ──
  int jn = 0;
  int jm[MAXJ], jt[MAXJ], jtf[MAXJ];  // (jt: the members that are the trunk the others end on; jtf: those of them at a fork)
  float jk[MAXJ], jf[MAXJ], js[MAXJ];
#if SIMPLE == 0
  for (int k = 0; k < min(vR.w, 64); k++) {
    if (jn == MAXJ) break;
    vec4 A = E(vR.z + k, 0), B = E(vR.z + k, 1);
    if (morphOn >= 1) A = JT(int(A.x + 0.5));
    float dc = length(p - A.xy);
    if (dc > A.z) continue;
    int mask = 0, c = 0, tm = 0, tfm = 0;
    for (int m = 0; m < 4; m++) {
      if (B[m] < -0.5) continue;
      int id = int(B[m] + 0.5);
      for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == id && (mask & (1 << s)) == 0) { mask |= 1 << s; c++; if (fract(B[m]) > 0.1) { tm |= 1 << s; if (fract(B[m]) > 0.3) tfm |= 1 << s; } }
    }
    if (c < 2) continue;
    jm[jn] = mask; jt[jn] = tm; jtf[jn] = tfm; js[jn] = fract(A.w) / 0.99; jk[jn] = floor(A.w) * 0.01 * (1.0 - smoothstep(0.55 * A.z, A.z, dc)); jf[jn] = 1.0 - smoothstep(0.3 * A.z, 0.85 * A.z, dc); jn++;
  }
#endif
  // Where a trunk runs on into the next stretch of its course at a fork (joined with no fillet), the trunk beside this pixel
  // is whichever of the two lies nearer: tn[s], for a vessel s the others end on (corner() reads its geometry).
  int tn[MAXS];
  for (int s = 0; s < MAXS; s++) tn[s] = s;
  for (int j = 0; j < MAXJ; j++) if (j < jn && js[j] < 0.01)
    for (int s = 0; s < MAXS; s++) if ((jm[j] & (1 << s)) != 0)
      for (int m = 0; m < MAXS; m++) if (m != s && (jm[j] & (1 << m)) != 0 && sd[m] < sd[tn[s]]) tn[s] = m;
#if MESH
${MESH_FS_KEY}
#endif

  // ── Nothing to draw here: settled now, without the tiers below ──
  // Where every vessel in reach lies past what any of them draws, the tiers below would add nothing: no glow band (it ends
  // 15.6 past a wall), and every tier skipped by its own test (D past 8 + 2 px, Ds past
  // 6 + 2 px; a fillet pulls a shape in by at most a quarter of its width). The pixel is left empty, exactly as they
  // would leave it, at the cost of a few reads. (Zoomed in, most of the pixels the cells cover are like this.)
  {
    float pull = 0.0, dMin = 1e9, sMin = 1e9;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0) pull = max(pull, jk[j] * js[j] * 0.25);
    bool lit = false;
    for (int s = 0; s < MAXS; s++) {
      if (s >= n) break;
      dMin = min(dMin, sd[s]); sMin = min(sMin, sh[s]);
      if (T(sid[s], 10).a > 0.0 && sd[s] - T(sid[s], 0).w < 15.7) lit = true;
    }
    if (!lit && dMin - pull > 8.01 + 2.0 * px && sMin - pull > 6.01 + 2.0 * px) {
      if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
      discard;
    }
  }

  // ── Per-vessel attributes ──
  float stier[MAXS], sz[MAXS], sflag[MAXS], sa[MAXS], swall[MAXS], shov[MAXS], ssel[MAXS], sof[MAXS];
  vec3 scol[MAXS], sedge[MAXS];
  // (A vessel behind an organ fades to about 0.4 of full where the organ covers it, an atlas's structure seen through another;
  // the hepatic veins and sinusoids lie inside the liver, in their own tiers, and are not faded by it.)
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${VEIL_K} * organK : 0.0;
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
    vec3 aCol, aEdge;
    vesAttrs(sid[s], su[s], sv[s], p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
    stier[s] = aTier; sz[s] = aZ; sflag[s] = aFlag; swall[s] = aWall; sof[s] = aOf; scol[s] = aCol; shov[s] = aHov; ssel[s] = aSel; sedge[s] = aEdge;
    sa[s] = aA;
  }

  // Whether a lumen colour (scol) reaches this pixel: through a lumen drawn here (aL > 0) or a glow in its vessel's
  // own colour. Where neither does, the colour comes from the casings, shadows, rings and inks alone.
  bool dep = false;
  // (A lit vessel's glow, the thin soft band hugging its wall, is laid down with its own tier below.)

  // ── Hand-off at a join across tiers ──
  // A vessel that ends on one in a lower tier draws a copy of that one near the junction (see
  // below), so the join is one filleted shape. The copy is drawn as the lower vessel shows in its
  // own tier (behind the organs: as faded as they leave it), and the lower tier draws that vessel
  // only for what the copy leaves, so the merged shape is filled once: no brighter, doubled patch
  // where the two overlap (the hepatic veins on the cava).
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
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  // (A glow asked to lie on top (the Doppler's, wide + 10): over every vessel of its group it crosses, the ones above its own too.)
  vec4 topC = vec4(0.0);
  int topGrp = 1;
  float last = -1.0;
  // The frontmost lumen (for the blood drawn in it later) and how much of it shows.
  uint gId = 0u, gId2 = 0u;
  float gS = 0.0, gY = 0.0, gW = 0.0, gS2 = 0.0, gY2 = 0.0, gB = 0.0;
#if MESH
  // (What this pass's tier draws: its glows, its shadow, its shape, the selected vessel's lift, and whether a lumen of it shows here.)
  vec4 mLg = vec4(0.0), mLgU = vec4(0.0), mSh = vec4(0.0), mC = vec4(0.0);
  float mWs = 0.0;
  bool mLum = false;
#endif
  for (int it = 0; it < MAXS; it++) {
    float tt = 1e9;
    for (int s = 0; s < MAXS; s++) if (s < n && stier[s] > last && stier[s] < tt) tt = stier[s];
    if (tt > 1e8) break;
    last = tt;
    int ti = int(tt + 0.5);
    int grp = tierGroup[ti];
#if MESH
    if (ti > tierNow) break;   // (the mesh draws one tier a pass; a patch runs the tiers below it only for the stream it hands on)
    if (ti < tierNow && mPass < MP_SHAPE_K) continue;   // (a glow or shadow pass: no stream, so not those)
#endif
    // ── Glow: one thin soft band hugging a lit vessel's wall on both sides, fading to nothing at a free end.
    // Every highlight (hover, a slide's or step's vessels, the Doppler's) is this band, in its colour. It goes
    // down with the lit vessel's own tier: over every vessel in the tiers beneath, under the lit vessel itself,
    // so where it crosses another vessel its glow is not cut by that vessel's body.
    vec4 lg = vec4(0.0), lgU = vec4(0.0);
    for (int s = 0; s < MAXS; s++) {
      if (s >= n || stier[s] != tt) continue;
      vec4 gc, ge;
      float gv = glowAmt(sid[s], sd[s], swall[s], sv[s], sa[s], gc, ge);
      if (gc.a <= 0.0) continue;
      bool up = ge.w > 5.0;
      // None inside another lit vessel's lumen (the cava's two lengths, lit together): each band ends at the
      // other's wall, so a lit vessel's round end does not show as a disc in the next one's lumen.
      for (int u = 0; u < MAXS; u++) if (u != s && u < n && T(sid[u], 10).a > 0.0) gv *= smoothstep(-0.6, 0.6, sd[u] - swall[u]);
      if (gv > 0.0 && ge.z > 0.5) dep = true;
      if (up) { if (gv > lgU.a) lgU = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv); }
      else if (gv > lg.a) lg = vec4((ge.z > 0.5 ? scol[s] : gc.rgb) * gv, gv);
    }
#if MESH
    if (ti == tierNow) { mLg = lg; mLgU = lgU; }
#endif
    if (lgU.a > topC.a) { topC = lgU; topGrp = grp; }
    if (lg.a > 0.0) {
      if (grp == 0) accB = over(lg, accB);
      else if (grp == 1) accN = over(lg * min(1.0 / max(netAlpha, 1e-3), 1.0 / lg.a), accN);   // (accN is faded by netAlpha as a whole)
      else accT = over(lg, accT);
    }
    // Members: this tier's vessels, and (except in the lifted tier) vessels of lower tiers that
    // share a junction with one of them, faded out with distance from that junction.
    float pres[MAXS];
    int mem = 0;
    for (int s = 0; s < MAXS; s++) { pres[s] = 0.0; if (s < n && stier[s] == tt) { mem |= 1 << s; pres[s] = keep[s]; } }
    // A copy is drawn as translucent as the vessel it copies shows in its own tier (a back vessel's copy into the
    // network divided by the network's own dimming, which the tier applies again), never capped by the fade of the
    // vessel joining it: a fading hepatic or renal vein must not thin the cava's lumen where it joins it.
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
    // The tier's shape: plain union, filleted between vessels that share a junction. The fillet fills only the corners
    // between them, where each vessel's centreline lies off the other's toward this pixel: on a trunk's far wall, opposite
    // a tributary that ends inside it, the tributary's centreline ends on the trunk's own, so no fillet swells that wall into
    // a nub (the IMV and the splenorenal shunt on the splenic vein, the shunt on the renal vein), and none swells the seam
    // where one stretch of a vessel runs on into the next.
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
    // Which vessel owns this pixel: the nearest, unless it lies inside the lumen of an unjoined
    // vessel drawn above it in the tier (a crossing). A copy from a lower tier lies under every one of this tier's
    // own vessels, whatever its z: it never crosses over one, and one of them crosses over it. (A cavernoma strand
    // copied into the portal tier at the coronary vein's join, or at the confluence where the joins outnumber MAXJ,
    // took the pixels of its lumen from the portal vein it runs under, by its higher z; as a faded strand it then
    // drew almost nothing there, so dark lines cut through the vein: Portal vein clots, slide 5, 7 Nov 2026.)
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
    // Inside the lumen of a copied trunk (a vein behind the organs that this tier's veins end on:
    // the cava under the hepatic veins), the trunk owns the pixel: a vein's end does not show
    // through it as a second, brighter stub, so the join reads as one shape.
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
    // Attributes blended across the join by the same distances (soft weights), so color,
    // caliber and shading run on through the fillet.
    float m = 1e9;
    for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0) m = min(m, sd[s]);
    // (The caliber, wall and shading blend only where the two make a corner (corner()): a trunk's far wall opposite a
    // tributary's end is the trunk's own. The colour and alpha blend all through, so a lumen's colour still runs on.)
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

    float aa = px * ${EDGE_GLSL};   // (the figure's one edge softness, device px: edge.js, shared with the organ painter)
    // Where vessels of one tier cross, the one drawn above is cut out of the one below by a ring of the figure's ground 2.5 device px wide, outside its
    // casing, with its casing across the cut (the atlas convention): without it the two lumens swapped colour at an edge with no line. Only inside the
    // lower lumen (the ring is a cut in it), never at a join, never for a vessel without a casing.
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
    if (aL > 0.0) dep = true;
#if MESH
    int fSh = flags;
    flags &= ~${F_SHADOW};   // (the mesh lays the tier's shadow in a pass of its own, under the whole tier: shadowOf below)
#endif
#if MESH
    // (A glow or shadow pass draws neither the tier's shape nor its stream: the shading is left out there.)
    vec4 c = mPass >= MP_SHAPE_K ? tubeShade(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL) : vec4(0.0);
#else
    vec4 c = tubeShade(D, Ds, R, wall, col, g, flags, sel, cA, grp, sid[ow], sv[ow], shov[ow], sedge[ow], kn, kcas, aa, aL);
#endif
    c *= alpha * tierAlpha[ti];
#if MESH
    flags = fSh;
#endif
    float wsel = grp == 1 ? ssel[ow] : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
    float gf = grp == 0 ? 1.0 - occl * sof[ow] : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
    float lumA = aL * (1.0 - kn) * alpha * tierAlpha[ti] * gf;
#if MESH
    if (mPass < MP_SHAPE_K) lumA = 0.0;
#endif
    if (lumA > 0.02 && (flags & ${F_DOTTED}) == 0) {
      // The stream shown here: the two joined lumens with the largest share, by nearness and by how
      // far past its own end each one runs (a vessel's streaks fade out beyond its end, so at a fork
      // the trunk's hand over to each branch along its own course instead of running on straight
      // across it). Equal where two lumens meet, fading over about a radius, so the stream and the
      // dye pass from one vessel into the next instead of stopping at a seam.
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
      // Where a copy of a lower tier's vessel (a trunk under the veins that end on it) leads, it adds to
      // the lumen that tier already showed and keeps its stream: the blood and chevrons run on at full
      // strength across the join instead of fading to what the copy alone covers or switching streams
      // where the copy fades out.
      bool lower = stier[o1] != tt && gId > 0u;
      if (lower) {
        bool same = false;
        for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0 && uint(sid[s] + 1) == gId) same = true;
        lower = same;
      }
      if (lower) {
        gW = min(1.0, lumA + gW * (1.0 - c.a * gf));
        // Toward a vein of this tier, its stream joins in as it does from the vein's side.
        if (o2 >= 0 && stier[o2] == tt && w2 > 0.01 * w1) {
          gId2 = uint(sid[o2] + 1); gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gB = w2 / (w1 + w2);
        }
      } else {
        int id = sid[o1];
        gId = uint(id + 1); gS = su[o1] * T(id, 5).z; gY = clamp(sx[o1] / max(sr[o1], 1e-3), -1.0, 1.0); gW = lumA;
        gId2 = 0u; gB = 0.0;
        if (o2 >= 0 && w2 > 0.01 * w1) {
          gId2 = uint(sid[o2] + 1); gS2 = su[o2] * T(sid[o2], 5).z; gY2 = clamp(sx[o2] / max(sr[o2], 1e-3), -1.0, 1.0); gB = w2 / (w1 + w2);
        }
      }
    } else gW *= 1.0 - c.a * gf;
    if (grp == 0) { c *= 1.0 - occl * sof[ow]; accB = over(c, accB); }
    else if (grp == 1) { accN = over(c, accN); if (wsel > 0.0) accT = over(c * wsel, accT); }
    else accT = over(c, accT);
#if MESH
    if (ti == tierNow) { mC = c; mWs = wsel; mLum = lumA > 0.02 && (flags & ${F_DOTTED}) == 0; mSh = shadowOf(Ds, wall, flags, sel, aa) * alpha * tierAlpha[ti] * (grp == 0 ? gf : 1.0); break; }
#endif
  }
#if MESH
${MESH_FS_OUT}
#endif
  if (topC.a > 0.0) {
    if (topGrp == 0) accB = over(topC, accB);
    else if (topGrp == 1) accN = over(topC * min(1.0 / max(netAlpha, 1e-3), 1.0 / topC.a), accN);
    else accT = over(topC, accT);
  }
  vec4 o = over(accT, over(accN * netAlpha, accB));
  if (o.a < 0.002) { if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; } discard; }
  outColor = ditherOut(o, q);
  outDep = vec4(dep ? 1.0 : 0.0);
  bool fl = gId > 0u && gW > 0.01;
  outFlow = fl ? packFlow(gId, gId2, gS, gY, gW, gB) : uvec4(0u);
  outFlow2 = fl && gId2 > 0u ? packFlow2(gId2, gS2, gY2) : uvec4(0u);
}`;

// ── Composite: the picture on screen, every frame ──
// One full-screen pass over the vessel layer (rendered above into a texture when something
// changes): the plate under it, the vessels, the blood moving in each lumen, the dye, and an
// active bleed. Only this pass runs per animation frame, so the cost of moving blood is a few
// texture reads per pixel, not the vessel shader.
//
// Blood, per lumen pixel (from the vessel layer's second target: which vessel, how far along it,
// where across it): the lumen is cut into laminar lanes (more when zoomed in), each running at its
// Poiseuille speed (2× the mean at the axis) in eighths of the mean, so one stream distance D per
// vessel moves every lane (D is kept modulo a period that is a multiple of all of them). Each lane
// is a row of slots; a slot holds a parcel when its hash is under the occupancy that makes the
// parcels crossing a section each second proportional to flow (see blood.js). Stagnant blood
// drifts and clumps (smoke); with `origin` each parcel is colored by where its blood came from.
// The HVPG catheter (stage.js builds it): tubes, discs and ellipsoids in world units, drawn over the
// picture with the same transform, so it moves with the anatomy on every frame of a pan or zoom.
// Per vertex: the world position, a direction (a tube's across, a disc's axis) and local coords
// (a tube: across −1..1 and the length along it; a disc: −1..1 on both axes).
const CATH_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 dir;
layout(location=2) in vec2 uv;
uniform mat3 world;
uniform vec2 size;
out vec2 vDir;
out vec2 vUV;
void main() {
  vec3 d = world * vec3(pos, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vDir = dir; vUV = uv;
}`;
// mode 0: soft shadow · 1: still blood column · 2: catheter shaft · 3: marker band · 4: rounded tip
// 5: balloon (translucent, lit at its rim) · 6: a reading ripple · 7, 8: a tube's, a disc's flat edge · 9: an ultrasound sector.
const CATH_FS = `#version 300 es
precision highp float;
in vec2 vDir;
in vec2 vUV;
uniform int mode;
uniform vec3 col;
uniform float alpha;
uniform vec2 light;
uniform vec2 fade;   // tubes: fade in over the first fade.x of the length, out over the last fade.y before len
uniform float len;
out vec4 o;
void main() {
  vec3 L = normalize(vec3(light * 0.85, 0.95)), H = normalize(L + vec3(0.0, 0.0, 1.0));
  float a = alpha;
  vec3 c = col, n;
  if (mode <= 3 || mode == 7) {
    float v = clamp(vUV.x, -1.0, 1.0), e = 1.0 - abs(vUV.x);
    float aa = clamp(e / max(fwidth(vUV.x), 1e-4), 0.0, 1.0);
    a *= aa * smoothstep(0.0, max(fade.x, 1e-4), vUV.y) * clamp((len - vUV.y) / max(fade.y, 1e-4), 0.0, 1.0);
    n = vec3(vDir * v, sqrt(max(0.0, 1.0 - v * v)));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), mode == 3 ? 60.0 : 34.0);
    if (mode == 0) { a *= pow(1.0 - v * v, 2.2); }
    else if (mode == 7) { c = col; }
    else if (mode == 1) {
      // Blood standing in the vein: deep at the walls, a soft sheen down its middle.
      c = col * (0.62 + 0.42 * dif) + vec3(0.16) * pow(max(dot(n, H), 0.0), 12.0);
      a *= smoothstep(0.0, 0.35, e);
    } else {
      // Polymer (2) or a metal band (3); the dark rim that draws its edge thins out when the tube is a
      // few pixels across, where it would turn the whole tube grey.
      float wpx = 2.0 / max(fwidth(vUV.x), 1e-4), rim = smoothstep(2.5, 9.0, wpx);
      if (mode == 2) {
        // Satin polymer: a broad soft sheen, the sides falling off gently into the hairline edge drawn under it.
        float sat = pow(max(dot(n, H), 0.0), 14.0);
        c = col * (0.66 + 0.38 * dif) + vec3(1.0) * sat * 0.28;
        c = mix(c, col * 0.62, smoothstep(0.55, 1.0, abs(v)) * 0.55 * rim);
      } else {
        // Brushed platinum: a cool grey with one narrow glint.
        c = col * (0.55 + 0.6 * dif) + vec3(1.0) * sp * 0.7;
        c = mix(c, col * 0.45, smoothstep(0.6, 1.0, abs(v)) * 0.6 * rim);
      }
    }
  } else {
    float r2 = dot(vUV, vUV), r = sqrt(r2);
    float aa = clamp((1.0 - r) / max(fwidth(r), 1e-4), 0.0, 1.0);
    vec2 w = vDir * vUV.x + vec2(-vDir.y, vDir.x) * vUV.y;
    float z = sqrt(max(0.0, 1.0 - r2));
    n = normalize(vec3(w, z + 1e-3));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), 34.0);
    if (mode == 8) { c = col; a *= aa; }
    else if (mode == 4) {
      // The rounded end shades like the shaft it closes (a cylinder across its width, not a ball), so
      // it reads as part of the tube rather than a glossy bead stuck on.
      float v = clamp(vUV.y, -1.0, 1.0);
      vec3 nc = vec3(vec2(-vDir.y, vDir.x) * v, sqrt(max(0.0, 1.0 - v * v)));
      float dc = max(dot(nc, L), 0.0), sc = pow(max(dot(nc, H), 0.0), 34.0);
      float sat = pow(max(dot(nc, H), 0.0), 14.0);
      c = col * (0.66 + 0.38 * dc) + vec3(1.0) * sat * 0.28;
      c = mix(c, col * 0.62, smoothstep(0.55, 1.0, r) * 0.55);
      a *= aa;
    } else if (mode == 5) {
      // Thin latex over contrast: clear in the middle, bright at the rim, a hard highlight up-left.
      // Clear latex over dilute contrast: see-through in the middle, denser toward its walls, a crisp thin rim, one small glint.
      float fr = pow(1.0 - z, 1.6), sp2 = pow(max(dot(n, H), 0.0), 160.0), edge = smoothstep(0.9, 0.99, r);
      c = col * (0.72 + 0.32 * dif) + vec3(1.0) * (sp * 0.12 + sp2 * 0.45);
      c = mix(c, col * vec3(0.42, 0.46, 0.52), edge * 0.85);
      float k = 0.46 + 0.36 * fr + 0.3 * sp2 + edge * 0.5;
      a *= aa * clamp(k, 0.0, 1.0);
    } else if (mode == 9) {
      // EUS-PPG's ultrasound sector (eus-scope.js): a fan from the transducer, uv its own frame (x along its middle, the arc at r 1)
      // and len its half angle; soft at its sides and its far edge, faint near the transducer, a few depth arcs across it.
      float ang = abs(atan(vUV.y, vUV.x)) / max(len, 1e-3), fw = max(fwidth(r * 6.0), 1e-4);
      float arcs = 1.0 - 0.35 * (1.0 - smoothstep(0.0, fw * 1.5, 0.5 - abs(fract(r * 6.0) - 0.5)));
      c = col;
      a *= aa * (1.0 - smoothstep(0.8, 1.0, ang)) * smoothstep(0.0, 0.14, r) * (0.45 + 0.55 * (1.0 - smoothstep(0.55, 1.0, r))) * arcs;
    } else {
      float d = abs(r - 0.86), fw = max(fwidth(r), 1e-4);
      a *= clamp((0.07 - d) / fw + 0.5, 0.0, 1.0) * 0.9 + exp(-d * d * 160.0) * 0.35;
      a *= step(r, 1.0);
    }
  }
  o = vec4(c * a, a);
}`;
// The streaks' numbers that follow the zoom alone (bloodAt: the lane spacing, the two parcel scales and the cross-fade between
// them, the fine octave's fade at each scale), worked out per vertex and handed to every pixel flat, instead of again at every
// lumen pixel (two log2/exp2 and four smoothsteps). The same expressions in the same precision as bloodAt and shimN had them.
// The vessels' rows as the composite and the arrowheads' quads read them (flow, rad: see COMP_FS): the caliber at s, a stream's
// distance and drift now, a chained vessel's root stream. One text for both shaders, so the two place every head alike.
const ROWS_GLSL = `
float radAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return max(mix(texelFetch(rad, ivec2(i0, id), 0).r, texelFetch(rad, ivec2(i0 + 1, id), 0).r, ui - float(i0)), 0.3);
}
// The blood on the GPU (plan "Holding 120 Hz" §3.7): a stream's distance and its stagnant blood's drift as they stand at the blood
// clock bT, from where the CPU last anchored them (flow texel 6: that clock B0 and the display speed's factor). Between anchors a
// stream runs at the speed and stasis it was anchored with, so a steady flow sends nothing a frame. A factor of 0 (the lobule) is the CPU's own distance and drift, as before.
float flowD(int id, float D, float vd) {
  vec3 a = texelFetch(flow, ivec2(6, id), 0).xyz;
  // (a.z: how fast the display speed was changing at the anchor, so a beat's swing is integrated here and not re-sent every frame.)
  float t = bT - a.x;
  return a.y == 0.0 ? D : mod(D + (vd + 0.5 * a.z * t) * a.y * t, ${PERIOD}.0);
}
float flowDrift(int id, float dr, float stasis) {
  vec2 a = texelFetch(flow, ivec2(6, id), 0).xy;
  return a.y == 0.0 ? dr : mod(dr + stasis * ${DRIFT_RATE} * (bT - a.x), ${DRIFT_PERIOD}.0);
}
// A chained vessel's root stream (row rid): its distance and drift now, from its own row (ch: the CPU's copy, flow texel 5).
vec2 rootDD(int rid, vec2 ch) {
  vec3 a = texelFetch(flow, ivec2(6, rid), 0).xyz;
  if (a.y == 0.0) return ch;
  vec4 r0 = texelFetch(flow, ivec2(0, rid), 0);
  float tr = bT - a.x;
  return vec2(mod(r0.x + (r0.y + 0.5 * a.z * tr) * a.y * tr, ${PERIOD}.0),
              mod(texelFetch(flow, ivec2(3, rid), 0).z + r0.w * ${DRIFT_RATE} * (bT - a.x), ${DRIFT_PERIOD}.0));
}
`;
// How orange a vessel's colour is (see chevAt), for the composite and the arrowheads' quads alike.
const CHEV_ORANGE_GLSL = `
float chevOrange(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}
// A head's two inks, from the colour of the vessel it is on (vc) and that vessel's eased reversed flag (rv): the core and the light-or-dark
// rim. By the lumen's lightness, over a small band so a vessel whose colour eases never pops (visual-style B1): a dark head with a light rim
// on a pale lumen, a near-white head (chevLight) with a dark rim on a dark one (a dark head on a 30 mmHg lumen is 1.49:1, on 20 mmHg
// 2.64:1). The band sits at luma .38 to .46 (the 20 mmHg stop is .39, the arteries .33 to .40, so they flip). A reversed head stays orange (revCol) on any lumen but an orange one, where it takes the same near-white flip (chevOrange, as before). In the origin
// lens the head keeps its own ink (an orange head on the SMV's amber is 1.01:1): the » pair behind it (chevHead) alone says reversed there.
void chevInks(vec3 vc, float rv, out vec3 core, out vec3 rim) {
  float rk = origin == 1 ? rv * (1.0 - blendA.z) : rv;
  float dark = 1.0 - smoothstep(0.38, 0.46, dot(vc, vec3(0.299, 0.587, 0.114)));
  float warm = rk * chevOrange(vc);
  vec3 ink = mix(chevInk, vc * 0.3, 0.2);
  core = mix(mix(mix(ink, chevLight, dark), revCol, rk), chevLight, warm);
  rim = mix(inkLight, vc * 0.45, max(dark, warm));
}
`;
const ZOOM_VS = `
precision highp float;
uniform float pxW;
flat out vec4 zoomA;                   // the lane spacing Lg, the parcel scales sA and sB, the cross-fade lf between them
flat out vec3 zoomB;                   // the fine octave's fade at sA and at sB, and the scale between them (sx)
const float SLOT = ${SLOT_W}.0;
void zoomOut() {
  float Lg = max(2.6, 5.0 * pxW);
  float lx = clamp(log2(max(pxW, 1e-4) * 8.0 / SLOT), -1.0, 3.0);
  float li = smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx);   // 0 … 2
  float lb = min(floor(li), 1.0), lf = li - lb;
  float sA = SLOT * exp2(lb), sB = SLOT * exp2(lb + 1.0);
  float cellA = 5.12 * sA, cellB = 5.12 * sB;
  zoomA = vec4(Lg, sA, sB, lf);
  zoomB = vec3(smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5), smoothstep(1.2 * pxW, 2.0 * pxW, cellB * 0.5), mix(sA, sB, lf));
}`;
const COMP_VS = `#version 300 es
layout(location=0) in vec2 corner;
${ZOOM_VS}
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); zoomOut(); }`;
// The same pass over just the vessel cells (what moves between full redraws): the canvas keeps
// the rest of the picture (preserveDrawingBuffer), so a frame repaints only around the vessels.
const COMP_CELL_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;
uniform mat3 world;
uniform vec2 size;
uniform float cell;
${ZOOM_VS}
void main() {
  vec3 d = world * vec3(org + corner * cell, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  zoomOut();
}`;
// A function: the bleed's colour token (--bleed-spray) is written in when the shader is built. Two builds from this one text
// (addendum §9, a small fixed set rather than one per switch): the full one, and `plain`, for the frames with no dye, no
// origin colours and no bleed, where those three switches are constants 0 instead of uniforms, so the compiler drops the
// code they gate. The composite picks plain only when those are its uniforms' values (see composite): the same arithmetic,
// without the branches that do nothing in such a frame.
// Less work a lumen pixel (26 Oct, review/blood-shading-ideas): the shimmer look alone (the app never draws the beads: main.js),
// the layers under a lumen skipped where it is opaque, the arrowheads' cut-outs tested only where a head is.
export const COMP_FS = (plain = false, streak = false, heads = false) => `#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${plain ? 1 : 0}
#define STREAK ${streak ? 1 : 0}   // 1: the half-size pass that works out the streaks alone (see HALF in composite)
precision highp usampler2D;
uniform sampler2D base;                // the vessel layer (premultiplied)
uniform usampler2D gbuf;               // its frontmost lumen per pixel
uniform usampler2D gbuf2;              // near a join, the lumen it joins and its share
uniform ivec2 lA, lWrap, lSize;        // the layer holds the screen pixels from lA (device px, y down) lSize on, pixel s in texel (s − lA + lWrap) wrapped at lSize
uniform vec2 lowS;                     // R10: a tier frame's layer read straight from its small targets: their share of the layer (0: the layer itself)
uniform ivec2 lowSz;                   // (the share's texels: the corner of the small targets the tier drew in)
uniform vec2 lowT;                     // (the small targets' size, texels: the colour is read filtered at uv inside them)
uniform int lH;                        // the picture's height (device px)
uniform highp sampler2D flow;          // per vessel: FLOW_TEXELS texels
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D bend;          // per vessel: the axis's signed curvature at each sample (setBend)
uniform sampler2D dye;                 // per vessel: dye concentration along the course
uniform sampler2D plate0, plate1;
uniform vec4 plateRect0, plateRect1;
uniform int plates;                    // bit 0: whole plate, bit 1: sharp view
// (The organs drawn layer by layer instead (organs-gl.js), device pixels, premultiplied, are read from plate1's unit while they are on
// (stackOn): the plate rasters are not then, so one unit holds either. The freed unit 14 holds the half-size streaks, halfL.)
uniform sampler2D halfL;               // the streaks of the wide lumens at half size, premultiplied (rgb × a, a); read where halfOn
uniform int halfOn;
uniform float halfR;                   // a lumen at least this many device px in radius takes its streaks from halfL
uniform int stackOn;
uniform float plateAlpha, plateSat;
uniform highp sampler2D fluidMask;     // the peritoneal cavity: its half-width about the middle of fluidRect, row by row down it
uniform vec4 fluidRect;
uniform vec4 fluidS;                   // ascites: floor, height, ripple amplitude, ripple phase (world units, radians)
uniform vec4 fluidInk;                 // its straw color (straight) and opacity at depth; a = 0: none
uniform vec2 fluidLv;                  // the liver's scale about 560 350, and how far the fluid is kept off it (its lower edge: fluidMask row 1)
uniform mat3 inv;                      // device pixels → world
uniform float H;                       // canvas height, device pixels
uniform float pxW;                     // world units per device pixel
// The circuit's map, under everything (2 Nov 2026, the figure's SVG model as data): the dot grid running on past the figure and fading
// out in steps, the two tinted pressure zones and a slide's lit zone (mapAt). mapA: its opacity (the morph's t; 0 draws and reads none).
uniform float mapA;
uniform vec4 mapDot, mapFx;            // straight rgb and alpha: the grid's dots, the lit zone (its fade in the alpha)
uniform vec4 mapZone[3];               // straight rgb and alpha of the three tinted zones, before the liver, the liver, after it (the chart's own zone bands)
uniform vec4 mapAlt;                   // the portal veins' and the hepatic veins' x spans (world); the liver's lies between them
uniform vec2 mapFxX;                   // the lit zone's x span
uniform vec4 mapRot;                   // cos, sin of the map's turn from the vessels' (it turns upright at once, never with the morph), its centre
uniform int blood;                     // 1: draw the blood
uniform int chev;                      // 1: flow chevrons on top (dark; orange where flow is reversed, cream on an orange vessel)
uniform int chevQuad;                  // 1: the chevrons are drawn by their own quads after this pass (blood-heads.js), not tested here on every lumen pixel
uniform int still;                     // 1: reduced motion (the chevrons stand still, spaced by flow)
uniform vec3 chevInk;
uniform vec3 chevLight;                // a reversed chevron's head on an orange vessel (near-white cream)
uniform float cssPx;                   // canvas px per CSS px (stage.js vdpr, at most 2)
uniform float flowA;                   // 0..1: how visible the moving blood and chevrons are (they fade in once the view is still)
uniform vec3 blendA;                   // 0..1 each: the streaks, the chevrons and the origin colours fading in or out (switched on or off)
uniform int lenOn;                     // 1: a streak's length follows its vessel's display speed (streak length with speed; ?streaklen=0 turns it off)
#if PLAIN == 0
uniform int origin;                    // 1: color parcels by where their blood came from
uniform int dyeOn;
#else
const int origin = 0, dyeOn = 0;
#endif
uniform float clock;                   // seconds (wrapped), for the drift of stagnant blood
uniform highp float bT;                // the blood's own clock, from the stage's epoch (flowD: the streams advance here, not on the CPU)
uniform vec3 originCol[5];
uniform vec3 dyeCol;
uniform vec3 revCol;                   // the moving blood's color where flow runs backwards
uniform vec3 inkLight, inkDark;
uniform vec4 bleedE[24];               // an active bleed (stage.js bleedSpray, blood.js bleedShapes): the pool: its surface's height, ripple, where the stream lands, the stream's strength; the stream: its start, where it lands, the pool's surface
uniform vec4 bleedB[24];               // alpha in z, kind in w (0 pool, 2 stream); the pool: its inset from the wall; the stream: its radius, how far it breaks into drops
#if PLAIN == 0
uniform int bleedN;
#else
const int bleedN = 0;
#endif
uniform vec4 noChev[12];               // world boxes (x0, y0, x1, y1) where no flow arrowhead is drawn: a figure reading sits there
uniform int noChevN;
uniform vec4 chevHole[16];             // world boxes the flow's arrowheads keep out of (x0, y0, x1, y1), each grown by chevHoleR;
uniform float chevHoleR[16];           // a negative radius makes it a line from (x0, y0) to (x1, y1) instead, that far round
uniform int chevHoleN;
uniform float rows;
uniform sampler2D lineL;               // the organ outlines, drawn once per change (premultiplied, device pixels)
uniform int lineOn;
uniform sampler2D glowL;               // soft glows behind the plate (an organ a slide points at), same drawing
uniform int glowOn;
uniform sampler2D warmL;               // warm glows over the plate and under the vessels (the edges of a lit organ's loops), same drawing
uniform int warmOn;
uniform int bloodOnly;                // 1: a frame where only the blood moved (composite): a pixel with no lumen is left as drawn
flat in vec4 zoomA;                    // the zoom's numbers for the streaks, worked out per vertex (ZOOM_VS)
flat in vec3 zoomB;
uniform highp sampler2D noiseT;        // blood style D's baked tile (blood-tile.js)
uniform int bloodStyle;                // 2: blood style E (blood-tile.js eNoise): the same streaks from sines, no texture read. 1: blood style D (blood-tile.js): the streaks from the baked tile, which then sits on the noise unit; (style D until its tile is baked: style E)
uniform int stillOn;                   // 1: the uniforms are the last picture's; flow column FLOW_TEXELS says which rows moved since
out vec4 outColor;

const float SLOT = ${SLOT_W}.0;
const float BINS = ${DYE_BINS}.0;
const float S_OFF = ${S_OFF}.0;
const float ORIGIN_GREY = ${ORIGIN_GREY};
const int N_LAST = ${N_SAMPLES - 1};
const float LANE_K[7] = float[7](${LANE_K.map((k) => k.toFixed(4)).join(', ')});
const float STO_Y0 = ${STO_Y0}.0, STO_DY = ${STO_DY}.0;
const int STO_N = ${STO_N};
const vec2 STO[${STO_N}] = vec2[${STO_N}](${LUMEN.map(([l, r]) => `vec2(${l.toFixed(2)}, ${r.toFixed(2)})`).join(', ')});

uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
// The circuit's map at world point w, premultiplied (see mapA). The grid: a dot of radius 0.9 every 20 units (at 10, 10 in each square),
// its alpha by the frame it lies in (MAP_STEPS: how far outside the figure's frame, the larger of the two axes); under a pixel's size a dot
// keeps its area (wider, fainter), as the browser's antialiasing had it. Then the tinted zones and the lit zone over it, edges a pixel soft.
vec4 mapAt(vec2 w) {
  w = vec2(mapRot.x * (w.x - mapRot.z) - mapRot.y * (w.y - mapRot.w), mapRot.y * (w.x - mapRot.z) + mapRot.x * (w.y - mapRot.w)) + mapRot.zw;
  float e = max(max(30.0 - w.x, w.x - 1370.0), max(30.0 - w.y, w.y - 730.0));
  float op = e <= 0.0 ? 0.9 : e <= 200.0 ? 0.7 : e <= 450.0 ? 0.5 : e <= 750.0 ? 0.3 : e <= 1100.0 ? 0.15 : e <= 1500.0 ? 0.06 : 0.0;
  vec4 c = vec4(0.0);
  if (op > 0.0) {
    float d = length(w - (floor(w / 20.0) * 20.0 + 10.0)), rr = max(0.9, 0.7 * pxW);
    float a = mapDot.a * op * clamp((rr - d) / pxW + 0.5, 0.0, 1.0) * min(1.0, 0.81 / (rr * rr));
    c = vec4(mapDot.rgb * a, a);
  }
  float iy = clamp(min(w.y - 40.0, 730.0 - w.y) / pxW + 0.5, 0.0, 1.0);
  if (iy > 0.0) {
    float zp = clamp(min(w.x - mapAlt.x, mapAlt.y - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[0].a;
    float zl = clamp(min(w.x - mapAlt.y, mapAlt.z - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[1].a;
    float zh = clamp(min(w.x - mapAlt.z, mapAlt.w - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[2].a;
    c = over(vec4(mapZone[0].rgb * zp, zp), c);
    c = over(vec4(mapZone[1].rgb * zl, zl), c);
    c = over(vec4(mapZone[2].rgb * zh, zh), c);
    float f = clamp(min(w.x - mapFxX.x, mapFxX.y - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapFx.a;
    c = over(vec4(mapFx.rgb * f, f), c);
  }
  return c * mapA;
}
// The octaves' shares of the shimmer's noise (0.62 coarse, 0.38 fine), set per vessel by bloodAt: with the streaks' length following the
// vessel's speed (lenOn) the fine octave's share falls toward 0 for a fast vessel (its streaks run long) and rises for a slow one (short
// dashes), and lnS evens the spread (lnS 1: as always). Only the shares change, never a coordinate, so nothing in a streak moves for it.
float lnWb = 0.62, lnWf = 0.38, lnS = 1.0;
${D_GLSL}
${E_GLSL}
// The caliber at arc length s, interpolated between its samples (not the nearest one), so nothing scaled by it steps along the vessel.
${ALONG_GLSL}
${ROWS_GLSL}
// Lymph in its channel (a row whose f1.x is -1: lobule-zoom.js lymph rows): soft dashes run along it, each with an amber albumin core
// that is stronger the richer the protein. The row holds the dashes' phase (f0.x, world units), their pitch (f0.y, world), the protein
// (f0.z, 0 … 1) and the dark theme (f0.w, 1 or 0). cover: the dash's coverage; core: the albumin core's. The dashes are drawn in
// the channel's own frame, so they follow the zoom and the pan with it and never lag the vessel they sit in.
void lymphAt(float s, float y, vec4 f0, float len, float R, out float cover, out float core) {
  float pitch = max(f0.y, 1.0);
  float x = (fract((s - f0.x) / pitch) - 0.5) * pitch;
  float hl = pitch * 0.17, r = R * 0.52, aa = max(pxW, 1e-3) * 0.75, ya = y * R;   // (thin and short: about half the channel's width, never filling it)
  cover = 1.0 - smoothstep(r - aa, r + aa, length(vec2(max(abs(x) - max(hl - r, 0.0), 0.0), ya)));
  float rc = r * 0.46;
  core = (1.0 - smoothstep(rc - aa, rc + aa, length(vec2(max(abs(x) - max(hl * 0.55 - rc, 0.0), 0.0), ya)))) * (0.2 + 0.55 * clamp(f0.z, 0.0, 1.0));
  float e = smoothstep(0.0, pitch * 1.2, min(s, len - s));
  cover *= e; core *= e;
}
// How much of a lumen is an opaque cast at arc length s (the EUS glue: its tint's w is 2, the same stretch and soft ends as the lumen colour's
// own tint in the vessel pass): the blood draws nothing inside it.
float castAt(int id, float s, float len) {
  vec4 tc = texelFetch(tube, ivec2(8, id), 0);
  if (tc.w < 1.5) return 0.0;
  vec4 tr = texelFetch(tube, ivec2(9, id), 0);
  return smoothstep(tr.x * len - tr.z, tr.x * len + tr.z, s) * (1.0 - smoothstep(tr.y * len - tr.z, tr.y * len + tr.z, s));
}
// Moving blood in one lumen at arc length s (world, may run past either end) and across y (−1 … 1):
// the parcels' color and coverage, to be laid over the lumen color col. Read once in main for it and the arrowheads alike
// (they were read by each): the vessel's flow texels f0 and f1 (f1.z > 0: main draws neither where it is not), its length,
// the caliber R at s (radAt) and its own colour vc at s.
vec4 bloodAt(int id, float s, float y, vec3 col, vec4 f0, vec4 f1, float len, float R, vec3 vc) {
  float D = f0.x, vd = f0.y, flux = f0.z, stasis = f0.w;
  float dir = vd < 0.0 ? -1.0 : 1.0;
  // Streak length with speed: a fast vessel's streaks run long, a slow one's are short dashes, so a still frame (a paused model, a
  // screenshot, a handout) shows speed too. The factor is the square root of the display speed (the speed the streaks travel at, eased
  // like them) over the healthy portal trunk's 36, kept to 0.6 … 1.6 and let go to 1 as the vessel stagnates (the smoke is as it was). It
  // moves the octaves' shares (lnWb, lnWf) from today's 0.62 / 0.38: the fine octave fades out toward 1.6 (the streaks about 1.45 times as long)
  // and grows toward 0.6 (about 0.75 times), the spread kept level (lnS) so the streaks' number and brightness hold within 7 %.
  lnWb = 0.62; lnWf = 0.38; lnS = 1.0;
  if (lenOn == 1) {
    float kk = mix(clamp(sqrt(abs(vd) / 36.0), 0.6, 1.6), 1.0, stasis);
    float lu = clamp(kk >= 1.0 ? (kk - 1.0) / 0.6 : (kk - 1.0) / 0.4, -1.0, 1.0);   // 0 at today's length, +1 longest, −1 shortest
    lnWf = lu >= 0.0 ? 0.38 * (1.0 - lu) : 0.38 - 0.27 * lu;
    lnWb = 1.0 - lnWf;
    lnS = sqrt(0.5288 / (lnWb * lnWb + lnWf * lnWf));
  }
  // Lanes ~5 device pixels apart (more when zoomed in), parcels at least ~8 apart along a lane.
  float Lg = zoomA.x;
  float lc = clamp(1.7 * R / Lg, 1.0, 7.0) - 1.0;   // (the continuous lane count, less one: LANE_K, laneSum)
  int lk = min(int(lc), 5);
  float sumK = mix(LANE_K[lk], LANE_K[lk + 1], lc - float(lk));
  // Light or dark ink from the vessel's own color (not the shaded pixel, whose highlights would flip a streak
  // between white and dark as it passes), eased across a range so a vessel near the cut-off never switches.
  float pale = origin == 0 ? smoothstep(0.58, 0.66, dot(vc, vec3(0.299, 0.587, 0.114))) : 0.0;   // the origin streams always take light ink
  // The streaks read as bright light on a dark lumen, deep ink on a pale one.
  vec3 core = mix(mix(col, inkLight, 0.62), mix(col, inkDark, 0.45), pale);
  vec3 halo = mix(mix(col, inkLight, 0.3), mix(col, inkDark, 0.2), pale);
  // Flow running backwards: the moving blood warms to orange (not over the origin streams, whose
  // amber it would be lost in).
  float rev = origin == 1 ? 0.0 : f1.w;
  if (rev > 0.0) { core = mix(core, mix(revCol, inkLight, 0.18), rev); halo = mix(halo, mix(col, revCol, 0.7), rev); }
  // Shimmer: long, soft streaks of light, like light on a flowing liquid, each carried at its own
  // lane's laminar speed (fastest on the axis, so the sheen visibly shears), over a faint glow
  // along the core. Brighter and denser where more blood passes; stagnant blood barely stirs.
  float ay = clamp(abs(y), 0.0, 1.0), yl = ay * 0.8;
  float k8 = max(2.0, 16.0 * (1.0 - yl * yl));
  float k0 = floor(k8), t = smoothstep(0.2, 0.8, k8 - k0);
  // Its scale follows the zoom without steps: the lane width from a continuous lane count, and the
  // cell size cross-fading between the slot scales (1, 2, 4 slots) over a band of zoom, so it never steps.
  float qy = y * R / max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
  float drift = flowDrift(id, texelFetch(flow, ivec2(3, id), 0).z, stasis);   // (anchored per stream on the CPU: blood.js drift, flowDrift)
  // Stagnant blood swirls (visual-style B6): besides sliding along, its lanes sway across the vessel on two slow eddies a quarter turn apart,
  // each standing at its own place along it, turned by the drift itself (so by the stasis: none at 0, and no pop in or out as it eases; 60
  // whole turns to the drift's 50-cell period, so the wrap is seamless, about 20 s a turn at full stasis).
  float sw = 6.2831853 * 1.2 * drift;
  qy += stasis * 0.6 * (sin(sw) * sin(s * 0.021 + float(id) * 1.7) + cos(sw) * sin(s * 0.034 + float(id) * 0.9 + 2.0));
  // A stream carried on from another vessel (flow texel 4: the root's row + 1, A, B, its weight cw; texel 5: the root's distance
  // and drift): the root's pattern at s_e = A + B s, mixed with the vessel's own by cw while a link forms or lets go.
  vec4 ch4 = texelFetch(flow, ivec2(4, id), 0);
  float cw = ch4.w;
  float sA = zoomA.y, sB = zoomA.z, lf = zoomA.w;
  float nz = 0.0;
  if (bloodStyle == 1) {
    // Style D: the baked tile read twice (dNoise), one zoom scale (mips do the rest), the pattern placed by the stream's distance as ever,
    // so a chained child carries its root's pattern on (the flow-time coordinate of the plan, through the existing chain).
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
    // (The cell size is world-fixed: two fixed scales cross-faded by lf, as the lattice does, never a size that follows the zoom, so
    // a pinch cannot slide the streaks along the vessel. "Lobule glitch", 6 Nov: round 3 review B1.)
    float cA = 5.12 * sA, cB = 5.12 * sB, dxA = pxW / (50.0 * cA), dxB = pxW / (50.0 * cB), dyv = pxW / laneW * ${TILE_V_PER_ROW};
    if (cw < 1.0) {
      nz = dNoise(id, s, qy, D, ay, cA, drift, dxA, dyv);
      if (lf > 0.0) nz = mix(nz, dNoise(id, s, qy, D, ay, cB, drift, dxB, dyv), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = rootDD(rid, texelFetch(flow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3);
      float nc = dNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, dxA * bs, dyv);
      if (lf > 0.0) nc = mix(nc, dNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, dxB * bs, dyv), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  } else if (bloodStyle == 2) {
    // Style E: style D's flow-map with sines (eNoise), no texture read; chained children carry the root's pattern on, as in D.
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
    float cA = 5.12 * sA, cB = 5.12 * sB;
    if (cw < 1.0) {
      nz = eNoise(id, s, qy, D, ay, cA, drift, pxW / cA);
      if (lf > 0.0) nz = mix(nz, eNoise(id, s, qy, D, ay, cB, drift, pxW / cB), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = rootDD(rid, texelFetch(flow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3);
      float nc = eNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, pxW / cA * bs);
      if (lf > 0.0) nc = mix(nc, eNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, pxW / cB * bs), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  }
  float sx = zoomB.z;
  float p = max(min(1.0, flux * sx / (max(abs(vd), 2.0) * sumK)), 0.6 * stasis);   // (the density floor of stagnant blood: 0.45 until visual-style B6)
  float ends = min(f1.x > 0.5 ? smoothstep(0.0, 1.5 * sx, s) : 1.0, f1.y > 0.5 ? smoothstep(0.0, 1.5 * sx, len - s) : 1.0);
  // Past a packed lane (B2): the streaks denser and brighter, up to 35 % more, by about log2 of the overflow (2.885 (x − 1) / (x + 1),
  // the series of log2 near 1, within 4 % of it up to 2, with no transcendental a pixel; at most one doubling), so a TIPS carrying
  // twice a packed lane's flow reads as more blood than a portal vein just packed. Continuous in the flow: it never pops; 1 at or
  // under a packed lane.
  float ovS = max(flux * sx / (max(abs(vd), 2.0) * sumK), 1.0);
  float gS = 1.0 + 0.35 * clamp(2.885 * (ovS - 1.0) / (ovS + 1.0), 0.0, 1.0);
  float dens = sqrt(clamp(p, 0.0, 1.0)) * gS;
  // Soft-edged and subdued, so up close the sheen reads as moving light, not as stripes painted on the tube;
  // a steady glow along the axis carries most of the brightness.
  float streak = smoothstep(0.46 - 0.08 * dens, 0.9, nz);
  float wall = 1.0 - smoothstep(0.7, 1.0, ay);
  float glowCore = 0.22 * (1.0 - ay * ay) * (1.0 - ay * ay);
  float a = clamp(streak * (0.32 + 0.26 * dens) + glowCore, 0.0, 0.75) * wall * ends * f1.z * mix(1.0, 0.76, stasis);   // (stagnant blood's alpha: 0.6 until visual-style B6)
  vec4 sOut = vec4(mix(halo, core, smoothstep(0.0, 0.7, streak)), a);
  if (bloodStyle != 1) return sOut;
  // Style D's tube light (arithmetic only): a soft highlight a third of the way across, a darker rim at the wall and a faint glow along
  // the axis, laid under the streaks, so the lumen reads as a round tube. Strength follows the streaks' own (ends, stream strength).
  float lit = f1.z * ends;
  float hl = exp(-2.4 * (y + 0.38) * (y + 0.38) * 4.0) * (1.0 - smoothstep(0.75, 1.0, ay));
  float rim = smoothstep(0.62, 1.0, ay);
  float ha = 0.12 * hl * lit, ra = 0.2 * rim * lit;
  vec4 under = over(vec4(inkDark * ra, ra), vec4(mix(col, inkLight, 0.7) * ha, ha));
  vec4 top = vec4(sOut.rgb * sOut.a, sOut.a);
  vec4 res = over(top, under);
  return res.a > 0.0 ? vec4(res.rgb / res.a, res.a) : vec4(0.0);
}
// Where a lumen's blood comes from, as streams side by side (laminar flow keeps them apart): SMV,
// IMV, splenic vein, hepatic artery, then the rest of the body, each as wide as its share of the flow.
// A vessel whose blood sloshes to and fro (flow texel 6, w: its Péclet number, signed by the flow from → to; 0 for one blood all
// along) mixes from its upstream junction's blend (texel 2) into its downstream one's (texel 7) along its length, as the dye mixes:
// (e^(Pe x) − 1) / (e^Pe − 1) of the way, x from the upstream end (blood.js originEnds). Two reads more, only in such a vessel.
vec3 originAt(int id, float s, float y, float R) {
  vec4 f2 = texelFetch(flow, ivec2(2, id), 0);
  float pe = texelFetch(flow, ivec2(6, id), 0).w;
  if (pe != 0.0) {
    float x = clamp(s / max(texelFetch(tube, ivec2(5, id), 0).z, 1.0), 0.0, 1.0), P = abs(pe);
    if (pe < 0.0) x = 1.0 - x;
    // (Pe from 10: a shunt runs into the vein part-way, at 10 less Pe of its length from the upstream end; its blend from there on, blood.js originEnds join.)
    float g = P >= 10.0 ? smoothstep(P - 10.03, P - 9.97, x) : P < 0.05 ? x : (exp(P * x) - 1.0) / (exp(P) - 1.0);
    f2 = mix(f2, texelFetch(flow, ivec2(7, id), 0), g);
  }
  float u = clamp((y + 1.0) * 0.5, 0.0, 1.0), e = clamp(0.6 * pxW / max(R, 0.3), 0.01, 0.12);
  float c1 = f2.x, c2 = c1 + f2.y, c3 = c2 + f2.z, c4 = c3 + f2.w;
  vec3 c = originCol[0];
  c = mix(c, originCol[1], smoothstep(c1 - e, c1 + e, u));
  c = mix(c, originCol[2], smoothstep(c2 - e, c2 + e, u));
  c = mix(c, originCol[3], smoothstep(c3 - e, c3 + e, u));
  c = mix(c, originCol[4], smoothstep(c4 - e, c4 + e, u));
  return c;
}
${CHEV_GLSL}
// How orange a vessel's colour is (0..1): a bright red channel well above the blue, with green between a red's and a
// yellow's, eased at each edge (the reversed orange and the heat ramp's orange 1; teal, wine, red, yellow and grey 0).
${CHEV_ORANGE_GLSL}
// Flow arrowheads along the axis, pointing and moving with the mean flow: a slim filled head with
// a notched back. Returns its coverage (x) and a soft rim just outside it (y).
// The axis's signed curvature at arc length s (1 / world units; positive turning toward +y).
float bendAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return mix(texelFetch(bend, ivec2(i0, id), 0).r, texelFetch(bend, ivec2(i0 + 1, id), 0).r, ui - float(i0));
}
// (f0, f1, len and Rs, the caliber at s: read once in main, as for bloodAt.)
// One vessel's heads, placed by a stream's pattern: se = A + B s its arc along that stream (B = 1, se = s for the vessel's own),
// Dm the stream's distance, Rsp the caliber its spacing is set by (the stream's own, so a chain of vessels shares one spacing).
// ends: the weights of a link at the from and to end (flow texel 5, z and w; above 0: a chained end, through which the heads
// run instead of fading out).
vec2 chevOne(int id, float s, float y, vec4 f0, vec4 f1, float len, float Rs, float R, float se, float Bm, float Dm, float Rsp, vec2 ends) {
  // (The heads point by the speed that moves them: the stream distance D integrates vd, so a head points the way it travels.)
  float vd = f0.y, dir = vd < 0.0 ? -1.0 : 1.0;
  // Spacing: a power-of-two multiple of 28 world units (it divides the stream's period: no jump on
  // wrap), at least ~60 px on screen. Zooming out, every other head fades away before the spacing
  // doubles (the coarser heads are a subset of the finer ones), so nothing jumps or pops.
  float lv = max(0.0, log2(max(3.6 * Rsp, 60.0 * pxW) / 28.0));
  // Reduced motion: the heads stand still, so their spacing carries the flow instead: closer where more blood passes
  // (flow texel 3, y: a coarser level for less flow). Never closer than the zoom allows.
  if (still == 1) lv = max(lv, texelFetch(flow, ivec2(3, id), 0).y);
  // The heads stand 2.5 times as far apart as the zoom and the flow alone set them (Mohammad, 31 Oct: "too many chevrons"), on every vessel,
  // zoom and device: a constant added to the level (log2 2.5), so the doubling and its fade of every other head ease exactly as before, only
  // 2.5 times wider. The ends' fade-in below keeps the spacing it had (Pc), so a short vessel's heads do not dim for want of room.
  float Pc = 28.0 * exp2(lv);
  lv += 1.3219281;
  float n = floor(lv), fr = lv - n;
  float P = 28.0 * exp2(n);
  float xe = mod(se - Dm + 0.5 * P, P) - 0.5 * P;
  float x = xe / Bm, u = x * dir;
  float sc = s - x;
  float odd = mod(floor((se - xe - Dm) / P + 0.5), 2.0);
  float keep = odd > 0.5 ? 1.0 - smoothstep(0.15, 0.85, fr) : 1.0;
  float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * cssPx * pxW, 8.0 * cssPx * pxW)), L = 1.6 * hw;            // half width, length: one fixed shape per vessel, never stretched
  // Past the head and its soft rim along the course (|u| > 0.55 L + 0.19 hw + 3.4 px reaches nothing): no more reads.
  if (abs(x) > (0.6 + 0.4 * f1.w) * L + 0.15 * hw + 4.0 * pxW) return vec2(0.0);   // (a reversed head's » pair reaches 0.4 L further behind)
  // Across, and the lumen where the head sits (so none overhangs a narrowing vessel), between the radius samples.
  float yd = y * Rs, ay = abs(yd);
  float Rl = radAt(id, sc, len);
  // On a bend the arc length runs along the axis, so off it the same span of s is shorter on the inside and longer on
  // the outside: measured in s alone a head squashes and bends with the vessel. Its true distance along, at yd across,
  // is the span of s times (1 − κ yd), so the head keeps its one straight shape wherever it sits.
  u *= clamp(1.0 - bendAt(id, sc, len) * yd, 0.25, 2.5);
  // Toward either end a head fades out (and the next vessel's fade in), never cut by a join; through a chained end it runs on.
  float lo = 0.6 * L, ramp = max(2.0 * L, 0.3 * Pc), endF;
  if (ends.x <= 0.0 && ends.y <= 0.0) {
    float e = min(sc, len - sc);
    if (e < lo) return vec2(0.0);
    endF = smoothstep(lo, lo + ramp, e);
  } else {
    float a0 = sc < lo ? 0.0 : smoothstep(lo, lo + ramp, sc), a1 = len - sc < lo ? 0.0 : smoothstep(lo, lo + ramp, len - sc);
    endF = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0)));
    if (endF <= 0.0) return vec2(0.0);
  }
  float fade = smoothstep(0.5, 3.0, abs(vd)) * f1.z * texelFetch(flow, ivec2(3, id), 0).x * keep * endF * smoothstep(1.3 * pxW, 2.4 * pxW, R);
  // Where the lumen is narrower than the head, the head fades out instead of squeezing to fit.
  fade *= smoothstep(0.85 * hw, 1.15 * hw, Rl);
  return chevHead(u, ay, hw, pxW, f1.w) * fade;
}
vec2 chevAt(int id, float s, float y, vec4 f0, vec4 f1, float len, float Rs) {
  // One size and one spacing for the whole vessel (from its caliber midway), so every head is the
  // same shape and they keep an even distance; they move at the vessel's own speed, whatever the zoom.
  float R = max(texelFetch(rad, ivec2(N_LAST / 2, id), 0).r, 0.3);
  if (R < 1.3 * pxW) return vec2(0.0);
  // A stream carried on from another vessel (createStreamChain): its heads are the root's, spaced by the root's caliber, so they
  // run from one vessel into the next; mixed with the vessel's own by the link's weight while it forms or lets go. (Reduced
  // motion: the still heads are spaced by each vessel's own flow, so each keeps its own.)
  vec4 ch4 = texelFetch(flow, ivec2(4, id), 0), ch5 = texelFetch(flow, ivec2(5, id), 0);
  float cw = still == 1 ? 0.0 : ch4.w;
  vec2 c = vec2(0.0);
  if (cw < 1.0) c = chevOne(id, s, y, f0, f1, len, Rs, R, s, 1.0, f0.x, R, ch5.zw);
  if (cw > 0.0) {
    int rid = int(ch4.x + 0.5) - 1;
    float Rr = max(texelFetch(rad, ivec2(N_LAST / 2, rid), 0).r, 0.3);
    vec2 cc = chevOne(id, s, y, f0, f1, len, Rs, R, ch4.y + ch4.z * s, ch4.z, rootDD(rid, ch5.xy).x, Rr, ch5.zw);
    c = cw >= 1.0 ? cc : mix(c, cc, cw);
  }
  return c;
}
// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall
// (laminar flow).
float dyeAt(int id, float s, float y) {
  float vd = texelFetch(flow, ivec2(0, id), 0).y;
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  // (The caliber between its samples, as the chevrons take it: the nearest sample stepped the front's bullet at each one; B11.)
  float R = radAt(id, s, len);
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float sp = s - dir * (2.0 * (1.0 - y * y) - 1.0) * 1.4 * R;
  float u = clamp(sp / len, 0.0, 1.0);
  return texture(dye, vec2((u * (BINS - 1.0) + 0.5) / BINS, (float(id) + 0.5) / rows)).r;
}

// The bolus's leading edge (0 … 1) where the dye c is: how much thinner the dye is four pixels ahead along the flow, so a band a few
// pixels wide on the front's own side, soft as the front is.
float dyeEdge(int id, float s, float y, float c) {
  float ahead = (texelFetch(flow, ivec2(0, id), 0).y < 0.0 ? -4.0 : 4.0) * pxW;
  return clamp((c - dyeAt(id, s + ahead, y)) * 3.0, 0.0, 1.0);
}

// Ascites at world point w, premultiplied (its own colour whatever the lens; see main): over the plate and the vessels. Also the
// arrowheads' quads (HEADS), which lay a head under it as main does.
vec4 fluidAt(vec2 w) {
  vec4 fluidC = vec4(0.0);
  if (fluidInk.a > 0.0) {
    vec2 fu = (w - fluidRect.xy) / fluidRect.zw;
    if (all(greaterThanEqual(fu, vec2(0.0))) && all(lessThanEqual(fu, vec2(1.0)))) {
      float c = (w.x - 712.0) / 400.0;
      float s = fluidS.x - fluidS.y * (0.8 + 0.2 * c * c * clamp(fluidS.y / 485.0, 0.0, 1.0)) + (sin(w.x / 38.0 + fluidS.w) * 0.7 + sin(w.x / 23.0 - fluidS.w * 1.3) * 0.3) * fluidS.z;
      float d = w.y - s;
      // Inside the cavity: the row's half-width (between the two nearest rows) less the distance from the mirror line, over
      // the edge's slope there to give the distance across it, smoothed over a world unit or a pixel, whichever is more
      // (the raster it replaces was a world unit to the texel).
      float nR = float(textureSize(fluidMask, 0).x), fy = fu.y * (nR - 1.0);
      int r0 = int(min(floor(fy), nR - 2.0));
      float h0 = texelFetch(fluidMask, ivec2(r0, 0), 0).r, h1 = texelFetch(fluidMask, ivec2(r0 + 1, 0), 0).r;
      float sl = (h1 - h0) * (nR - 1.0) / fluidRect.w;
      float cav = (mix(h0, h1, fy - float(r0)) - abs(w.x - fluidRect.x - 0.5 * fluidRect.z)) / sqrt(1.0 + sl * sl);
      float e = smoothstep(-pxW, pxW, d) * clamp(0.5 + cav / max(pxW, 1.0), 0.0, 1.0);
      // Off the congested liver (organ picks, 20 Oct): above its lower edge, column by column across fluidRect in the
      // liver's own frame, the fluid is cut by fluidLv.y.
      if (fluidLv.y > 0.0 && e > 0.0) {
        vec2 lu = (w - vec2(560.0, 350.0)) / fluidLv.x + vec2(560.0, 350.0);
        float lx = clamp((lu.x - fluidRect.x) / fluidRect.z, 0.0, 1.0) * (nR - 1.0);
        int l0 = int(min(floor(lx), nR - 2.0));
        float lb = mix(texelFetch(fluidMask, ivec2(l0, 1), 0).r, texelFetch(fluidMask, ivec2(l0 + 1, 1), 0).r, lx - float(l0));
        e *= 1.0 - fluidLv.y * (1.0 - smoothstep(-pxW, pxW, lu.y - lb));
      }
      if (e > 0.0) {
        // Fluid, not a floor (looks review, 31 Oct): two stops of its own depth, more see-through at its upper edge than deeper down
        // (0.55 of the ink at the surface, full by about 28 units under it), and a thin pale meniscus along the surface in place of
        // the denser band that made the edge read as a rim.
        float a = fluidInk.a * (0.55 + 0.45 * smoothstep(0.0, 28.0, d));
        float men = exp(-d * d / 10.0);
        a = min(a, 1.0) * e;
        vec3 fc = mix(fluidInk.rgb, mix(fluidInk.rgb, vec3(1.0), 0.45), men);
        fluidC = vec4(fc * a, a);
      }
    }
  }
  return fluidC;
}
${heads ? '#if 0   // (the arrowheads\' build: its own main, below)\n' : ''}void main() {
#if STREAK
  outColor = vec4(0.0);
  vec2 FC = gl_FragCoord.xy * 2.0;   // (a texel of the half-size target lies at the corner of 2 × 2 pixels: their mean position)
#else
  vec2 FC = gl_FragCoord.xy;
#endif
  ivec2 ip = ivec2(FC);
  // (The vessel layer's texel for this pixel, lp, if the layer holds it (inL); a pixel outside it holds nothing, as the layer's own
  // cleared pixels. With lA and lWrap zero and the layer the picture's size, lp is the pixel itself.)
  ivec2 rel = ivec2(ip.x, lH - 1 - ip.y) - lA;
  bool inL = rel.x >= 0 && rel.y >= 0 && rel.x < lSize.x && rel.y < lSize.y;
  ivec2 lt = rel + lWrap;
  if (lt.x >= lSize.x) lt.x -= lSize.x;
  if (lt.y >= lSize.y) lt.y -= lSize.y;
  ivec2 lp = ivec2(lt.x, lSize.y - 1 - lt.y);
  // (R10: on a tier frame the layer is its small targets, read where the stretch would have laid each pixel: the lumens' integers
  // at the nearest texel, the colour filtered, as the blit up had done; no full-size copy of the layer is made.)
  vec2 lowUV = (vec2(lp) + 0.5) * lowS / max(lowT, vec2(1.0));
  if (lowSz.x > 0) lp = min(ivec2(vec2(lp) * lowS), lowSz - 1);
  uvec4 g = (inL ? texelFetch(gbuf, lp, 0) : uvec4(0u));
  // Between whole redraws a pixel with no lumen comes out as the last frame left it: everything it is made of (the plate, the
  // glows, the vessel layer, still fluid, the outlines) is unchanged, and the blood, chevrons, dye and origin colours are drawn
  // only where a lumen is (g.x > 0). So it is not drawn again: the blood squares' other pixels were most of each frame's work
  // zoomed in (Mohammad's Mac at rest, zoom 4.24, 21 Oct: 86 frames in 2 s against 121 at 3.08), for the same picture.
  if (bloodOnly == 1 && g.x == 0u) discard;
  // (The row's top bit says a second lumen is written beside it, near a join: the vessel shader's outFlow. Set only where the row
  // is, so the test above holds either way.)
  bool two = (g.x & ${LUMEN2}u) != 0u;
  g.x &= ${LUMEN2 - 1}u;
  // ...and, in the same pass, a lumen whose vessels' rows have not changed since the last picture, which had the same uniforms
  // (stillOn: composite checks them): it would come out as it is (see moved in createVeinsGL).
  if (bloodOnly == 1 && stillOn == 1 && texelFetch(flow, ivec2(${FLOW_TEXELS}, int(g.x) - 1), 0).x == 0.0
      && (!two || texelFetch(flow, ivec2(${FLOW_TEXELS}, int((inL ? texelFetch(gbuf2, lp, 0) : uvec4(0u)).x & ${ROW2_MASK}u) - 1), 0).x == 0.0)) discard;
  vec2 w = (inv * vec3(FC.x, H - FC.y, 1.0)).xy;
  vec4 v = (inL ? texelFetch(base, lp, 0) : vec4(0.0));
  if (lowSz.x > 0 && inL) v = texture(base, lowUV);   // (R10: a tier frame's colour, filtered as the blit up filtered it)
  // Under a fully opaque vessel pixel (the inside of nearly every lumen) nothing laid below it can show: over(v, under) is
  // v + under × (1 − 1), exactly v. So the plate, its grey-down, the glows, the organ layers and the pool are not read there.
  // The vessel layer's alpha is 8-bit, so 1.0 is exact; an edge, a faded tube or a ghosted tier (alpha under 1) lays them all.
#if STREAK
  bool under = false;
  vec4 pl = vec4(0.0), fluidC = vec4(0.0);
#else
  bool under = v.a < 1.0;
  vec4 pl = vec4(0.0);
  // The plate: the sharp view raster where it lies, else the whole-plate one.
  if (under) {
    if (stackOn == 1) pl = texelFetch(plate1, ip, 0);
    else if ((plates & 2) != 0) {
      vec2 uv = (w - plateRect1.xy) / plateRect1.zw;
      if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) pl = texture(plate1, uv);
      else if ((plates & 1) != 0) pl = texture(plate0, (w - plateRect0.xy) / plateRect0.zw);
    } else if ((plates & 1) != 0) {
      vec2 uv = (w - plateRect0.xy) / plateRect0.zw;
      if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) pl = texture(plate0, uv);
    }
    if (pl.a > 0.0) { float l = dot(pl.rgb / pl.a, vec3(0.299, 0.587, 0.114)); pl = vec4(mix(vec3(l) * pl.a, pl.rgb, plateSat), pl.a) * plateAlpha; }
    // A glow lies behind the organs: the liver and the vessels pass over it.
    // The circuit's map lies under it all, the organs and their glows over it (as the SVG grid lay under the organs).
    if (mapA > 0.0) pl = over(pl, mapAt(w));
    if (glowOn == 1) pl = over(pl, texelFetch(glowL, ip, 0));
    // A warm glow lies on the organs, under the vessels: added after the plate's dimming, so it keeps one strength whatever the lens
    // greys the organs to, and with or without the plate (the page's own organs show under it then).
    if (warmOn == 1) pl = over(texelFetch(warmL, ip, 0), pl);
  }
  // Ascites over the plate and the vessels (they show through it), in its own color whatever the lens: a meniscus (highest at the flanks)
  // with a slow two-part ripple, deeper fluid a little denser, a soft brighter band just under the surface.
  vec4 fluidC = fluidAt(w);

#endif
#if STREAK
  float vis = g.x > 0u ? 1.0 : 0.0;   // (the lumen's edge coverage is the full pass's: here a texel is in the lumen or not)
#else
  float vis = g.x > 0u ? clamp(float(g.w >> 8u) / 255.0 / max(v.a, 1e-3), 0.0, 1.0) : 0.0;
#endif
  if ((blood == 1 || dyeOn == 1 || chev == 1 || origin == 1) && (vis > 0.005 || (dyeOn == 1 && g.x > 0u)) && v.a > 0.01) {
    vec3 col = v.rgb / v.a;
    // This lumen, and near a join the one it joins, cross-faded by its share.
    // (Read only where there is one: everywhere else that target is zero, as the vessel shader writes it.)
    uvec4 g2 = two ? (inL ? texelFetch(gbuf2, lp, 0) : uvec4(0u)) : uvec4(0u);
    // (The second lumen unpacked (ROW2_BITS): its row, its arc in quarters, its across at the middle of its 128th; its share beside the
    // front lumen's visibility.)
    uint r2 = g2.x & ${ROW2_MASK}u;
    float b = r2 > 0u ? float(g.w & 255u) / 255.0 : 0.0;
    int id1 = int(g.x) - 1, id2 = int(r2) - 1;
    float s1 = float(g.y) / 16.0 - S_OFF, y1 = float(g.z) / 32767.5 - 1.0;
    float s2 = float(g2.y >> 2u) / 4.0 - S_OFF, y2 = (float(((g2.x >> ${ROW2_BITS}u) << 2u) | (g2.y & 3u)) + 0.5) / 64.0 - 1.0;
    if (origin == 1) {
      // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey.
      float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / ORIGIN_GREY, 0.55, 1.45);
      // A vessel that carries no blood (origin fractions marked −1, e.g. a lymphatic) keeps its own color.
      vec3 oc = texelFetch(flow, ivec2(2, id1), 0).x < -0.5 ? col : min(originAt(id1, s1, y1, max(texelFetch(rad, ivec2(N_LAST / 2, id1), 0).r, 0.3)) * shade, vec3(1.0));
      if (b > 0.004) oc = mix(oc, texelFetch(flow, ivec2(2, id2), 0).x < -0.5 ? col : min(originAt(id2, s2, y2, max(texelFetch(rad, ivec2(N_LAST / 2, id2), 0).r, 0.3)) * shade, vec3(1.0)), b);
      col = mix(col, oc, vis * blendA.z);
    }
    // The front lumen's flow, length, caliber here and own colour, read once for the streaks and the arrowheads. Neither is drawn
    // in a vessel whose strength (f1.z) is not above zero.
    vec4 f0 = vec4(0.0), f1 = vec4(0.0);
    float len1 = 1.0, R1 = 0.3;
    vec3 vc1 = vec3(0.0);
    if (blood == 1 || chev == 1) {
      f0 = texelFetch(flow, ivec2(0, id1), 0); f1 = texelFetch(flow, ivec2(1, id1), 0);
      f0.x = flowD(id1, f0.x, f0.y);   // (the distance now: flowD)
      if (f1.z > 0.0) {
        len1 = max(texelFetch(tube, ivec2(5, id1), 0).z, 1.0);
        R1 = radAt(id1, s1, len1);
        vc1 = mix(texelFetch(tube, ivec2(0, id1), 0).rgb, texelFetch(tube, ivec2(1, id1), 0).rgb, alongAt(id1, clamp(s1 / len1, 0.0, 1.0)));
      }
    }
    // Near a join: whether the two lumens draw one pattern there (rel, 0..1: one is carried on from the other, or both from the
    // same parent; createStreamChain), and whether either is the minor inflow where a chained vessel takes the other's blood (mn).
    // Both 0 where nothing is chained (?bloodchain=0, the lobule).
    float rel = 0.0, mn = 0.0;
    vec4 f0b = vec4(0.0), f1b = vec4(0.0);
    float len2 = 1.0, R2 = 0.3;
    if (b > 0.004 && (blood == 1 || chev == 1)) {
      float p1 = texelFetch(flow, ivec2(3, id1), 0).w - 1.0, p2 = texelFetch(flow, ivec2(3, id2), 0).w - 1.0;
      float w1 = texelFetch(flow, ivec2(4, id1), 0).w, w2 = texelFetch(flow, ivec2(4, id2), 0).w;
      if (p1 > -0.5 && abs(p1 - float(id2)) < 0.5) rel = w1;
      else if (p2 > -0.5 && abs(p2 - float(id1)) < 0.5) rel = w2;
      else if (p1 > -0.5 && abs(p1 - p2) < 0.5) rel = min(w1, w2);
      // (Each lumen's weight at the end nearer this pixel: a vessel is the minor inflow at one end only.)
      vec2 e1 = texelFetch(flow, ivec2(5, id1), 0).zw, e2 = texelFetch(flow, ivec2(5, id2), 0).zw;
      len2 = max(texelFetch(tube, ivec2(5, id2), 0).z, 1.0);
      float lenA = max(texelFetch(tube, ivec2(5, id1), 0).z, 1.0);
      mn = max(-min(s1 < 0.5 * lenA ? e1.x : e1.y, 0.0), -min(s2 < 0.5 * len2 ? e2.x : e2.y, 0.0));
      if (rel > 0.0) {
        f0b = texelFetch(flow, ivec2(0, id2), 0); f1b = texelFetch(flow, ivec2(1, id2), 0);
        f0b.x = flowD(id2, f0b.x, f0b.y);
        if (f1b.z > 0.0) R2 = radAt(id2, s2, len2);
        else rel = 0.0;
      }
    }
    bool isLy = f1.x < -0.5;   // (a lymph row: dashes, never blood streaks or arrowheads)
    if (blood == 1 && blendA.x > 0.0 && f1.z > 0.0 && !isLy) {   // (blendA.x: the streaks' own switch; the lobule keeps blood.on for its lymph dashes with the streaks off)
      // One streak field (the dominant lumen's), eased down toward the join, so two patterns never ghost over each other. Where
      // both lumens draw one pattern, the two are mixed by share instead (the same mix from either side of the seam) and nothing
      // dims; the minor inflow into a chained vessel dims half as much.
#if STREAK
      if (R1 >= 0.9 * halfR * pxW) {
#else
      if (halfOn == 1 && R1 >= halfR * pxW) {
        // A wide lumen: its streaks from the half-size pass (the colour and share it worked out for the texel nearest here, filtered; the
        // lumen's own edge and the rest of its pixel stay full size).
        vec4 hs = texture(halfL, FC / (2.0 * vec2(textureSize(halfL, 0))));
        col = col * (1.0 - hs.a * vis) + hs.rgb * vis;
      } else {
#endif
      vec4 A = bloodAt(id1, s1, y1, col, f0, f1, len1, R1, vc1);
      if (rel > 0.0) {
        vec3 vc2 = mix(texelFetch(tube, ivec2(0, id2), 0).rgb, texelFetch(tube, ivec2(1, id2), 0).rgb, alongAt(id2, clamp(s2 / len2, 0.0, 1.0)));
        vec4 A2 = bloodAt(id2, s2, y2, col, f0b, f1b, len2, R2, vc2);
        float bb = b * rel, aa = mix(A.a, A2.a, bb);
        A = vec4((A.rgb * A.a * (1.0 - bb) + A2.rgb * A2.a * bb) / max(aa, 1e-4), aa);
      }
      float dimK = mix(mix(0.6, 0.3, mn), 0.0, rel);
      float a = A.a * (1.0 - dimK * smoothstep(0.02, 0.5, b)) * (1.0 - castAt(id1, s1, len1));
#if STREAK
      float aS = clamp(a * flowA * blendA.x, 0.0, 1.0);
      outColor = vec4(A.rgb * aS, aS);
#else
      if (a > 0.0) col = mix(col, A.rgb, clamp(a * vis * flowA * blendA.x, 0.0, 1.0));
#endif
      }
    }
#if STREAK
    return;
#endif
    if (blood == 1 && isLy && f1.z > 0.0) {
      float lc, lk;
      lymphAt(s1, y1, f0, len1, R1, lc, lk);
      // The dash's ink: clearly deeper than the channel's own green (lighter in the dark theme); the core a visible but quiet albumin amber.
      vec3 ink = mix(vc1, f0.w > 0.5 ? vec3(0.78, 0.95, 0.70) : vec3(0.30, 0.56, 0.28), 0.62);
      vec3 amber = f0.w > 0.5 ? vec3(0.95, 0.71, 0.29) : vec3(0.89, 0.60, 0.12);
      float aL = clamp(f1.z * vis * flowA, 0.0, 1.0);   // (not blendA.x: the streaks' switch, which the lymph does not follow)
      col = mix(col, ink, lc * aL);
      col = mix(col, amber, lk * aL);
    }
    if (dyeOn == 1) {
      float dc1 = dyeAt(id1, s1, y1), dc2 = b > 0.004 ? dyeAt(id2, s2, y2) : 0.0;
      float c = dc1 * (1.0 - b) + dc2 * b;
      // A rich, slightly glowing column: the dye tints the lumen and lifts it a little.
      // The wall line across a join (the end cap of the vessel) knocks vis to zero, which read as a seam; across
      // the lumen (away from the side walls) the dye fills regardless, and along the walls it follows vis.
      float inLumen = 1.0 - smoothstep(0.6, 0.85, abs(y1));
      float dyeK = max(smoothstep(0.0, 0.2, vis), inLumen);
      col = mix(col, dyeCol, clamp(c, 0.0, 1.0) * 0.9 * dyeK);
      // The bolus's leading edge, a few pixels of the lumen's own deep shade where the dye thins out ahead of it (the lime is told from a
      // pale lumen by hue alone: 1.04:1 on the lowest stop; visual-style B4). Only where there is dye, so a clear lumen costs no read.
      if (c > 0.02) {
        float de = dyeEdge(id1, s1, y1, dc1) * (1.0 - b) + (b > 0.004 ? dyeEdge(id2, s2, y2, dc2) * b : 0.0);
        col = mix(col, vc1 * 0.45, de * 0.55 * clamp(c, 0.0, 1.0) * dyeK);
      }
    }
    if (chev == 1 && chevQuad == 0 && f1.z > 0.0 && !isLy) {
      vec2 c = chevAt(id1, s1, y1, f0, f1, len1, R1);
      // None where another vessel joins, except where the two draw one pattern: there the heads run on from one into the other,
      // mixed by share as the streaks are.
      if (rel > 0.0) c = mix(c, chevAt(id2, s2, y2, f0b, f1b, len2, R2), b * rel);
      c *= 1.0 - smoothstep(0.02, 0.25, b) * (1.0 - rel);
      // (The cut-outs below only ever scale a head down: where there is none, c stays zero whatever they say, so they are not
      // tested at all. Most lumen pixels have no head.)
      if (c.x + c.y > 0.0) {
      // None under a figure reading on its vessel (stage.js noChevBoxes): cut along the box's edge with a pixel of antialiasing,
      // as the stent points' holes are, instead of a hard unantialiased edge through a head (round 2 review, B8).
      for (int i = 0; i < 12; i++) {
        if (i >= noChevN) break;
        vec2 q = abs(w - (noChev[i].xy + noChev[i].zw) * 0.5) - (noChev[i].zw - noChev[i].xy) * 0.5;
        c *= smoothstep(-pxW, pxW, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
      }
      // (none under a stent point's callout or round its dot: stage.js chevHoles)
      for (int i = 0; i < 16; i++) {
        if (i >= chevHoleN) break;
        vec4 h = chevHole[i];
        float hr = chevHoleR[i], dh;
        if (hr < 0.0) { vec2 ab = h.zw - h.xy; float t = clamp(dot(w - h.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); dh = length(w - h.xy - ab * t) + hr; }
        else dh = length(max(max(h.xy - w, w - h.zw), 0.0)) - hr;
        c *= smoothstep(-pxW, pxW, dh);
      }
      }
      if (c.x + c.y > 0.0) {
        // A faint rim lifts the head off the lumen. By the vessel's own colour (a lumen's lightness, an orange vessel) and the eased
        // reversed flag, not a switch, so a head follows the vessel's colour as that eases and never pops: a dark core with a light rim
        // on a pale lumen, near-white with a dark rim on a dark one, orange if reversed (chevInks).
        vec3 hCore, hRim;
        chevInks(vc1, f1.w, hCore, hRim);
        col = mix(col, hRim, c.y * 0.75 * vis * flowA * blendA.y);
        col = mix(col, hCore, c.x * vis * flowA * blendA.y);
      }
    }
    v = vec4(col * v.a, v.a);
  }
#if STREAK
  return;
#endif
  // An active bleed. Inside the stomach, under the vessels that cross it (so the plate's depth holds): the pool, the stomach's own
  // lumen (STO, row by row) below a flat surface that ripples where the stream lands, lighter and thinner at the surface, darker
  // with depth and toward the wall; and the stream, a thread of blood that leaves the tear, curves out and falls to the pool,
  // thinning as it goes and breaking into drops when it is slow. It flows, but never pulses: no jets or drops at the tear.
  vec3 bc = vec3(${cssRGB('--bleed-spray').map((v) => v.toFixed(1)).join(', ')}) / 255.0;
  vec3 bf = vec3(${cssRGB('--bleed-fresh').map((v) => v.toFixed(1)).join(', ')}) / 255.0;
  vec3 bd = vec3(${cssRGB('--bleed-deep').map((v) => v.toFixed(1)).join(', ')}) / 255.0;
  vec4 inner = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= bleedN || !under) break;
    vec4 bE = bleedE[i], bB = bleedB[i];
    float a;
    vec3 bcol;
    if (bB.w > 1.5) {
      float u = max(w.y - bE.y, 0.0), lam = 26.0;
      float fall = clamp(u / max(bE.w - bE.y, 1.0), 0.0, 1.0);
      float sw = (bE.z - bE.x) * exp(-u / lam);
      float xc = bE.z - sw + 0.7 * sin(w.y * 0.06 - clock * 2.3) * smoothstep(0.1, 0.6, fall);
      float slope = sw / lam;
      // Lower down it pinches into drops, each swelling in the middle and trailing a thin neck to the next, uneven in size and
      // spacing, sliding down as they fall.
      float brk = bB.y * smoothstep(0.25, 0.85, fall);
      float ph = (w.y * 0.31 * (1.0 + 0.22 * sin(w.y * 0.047 + 1.3)) - clock * 9.0) / 6.2831853;
      float cell = floor(ph), bead = pow(max(sin(3.14159265 * (ph - cell)), 0.0), 0.55);
      float hv = fract(sin(cell * 12.9898 + 4.1) * 43758.5453);
      float r = bB.x * mix(1.0, 0.55, smoothstep(0.0, 0.9, fall)) * mix(1.0, 0.12 + (0.9 + 0.5 * hv) * bead, brk);
      float d = abs(w.x - xc) / sqrt(1.0 + slope * slope) - r;
      float lum = mix(0.5 + 0.5 * sin(w.y * 0.42 - clock * 13.0), bead, brk);
      a = (1.0 - smoothstep(-0.75 * pxW, 0.75 * pxW, d)) * bB.z * smoothstep(0.0, 3.0, w.y - bE.y) * (1.0 - smoothstep(bE.w - 1.5, bE.w + 0.5, w.y));
      bcol = mix(bc * 0.85, bf, 0.55 * lum + 0.35 * smoothstep(0.1, 0.9, clamp(-d / max(r, 1e-3), 0.0, 1.0)));
    } else {
      float dxl = w.x - bE.z;
      float sy = bE.x + bE.y * sin(w.x * 0.16 + clock * 1.7) + bE.w * (0.9 * sin(abs(dxl) * 0.4 - clock * 6.0) * exp(-abs(dxl) / 38.0) - 1.3 * exp(-dxl * dxl / 50.0));
      float under = w.y - sy;
      float f = clamp((w.y - STO_Y0) / STO_DY, 0.0, float(STO_N - 1));
      int i0 = int(floor(f)), i1 = min(i0 + 1, STO_N - 1);
      vec2 s0 = STO[i0], s1 = STO[i1], sp = mix(s0, s1, f - float(i0)), sl = (s1 - s0) / STO_DY;
      float dIn = min((w.x - sp.x - bB.x) / sqrt(1.0 + sl.x * sl.x), (sp.y - bB.x - w.x) / sqrt(1.0 + sl.y * sl.y));
      float depth = clamp(under / 95.0, 0.0, 1.0);
      bcol = mix(bc, bd, smoothstep(0.0, 1.0, depth));
      bcol = mix(bcol, bf * 1.2, 0.5 * smoothstep(0.4, 1.4, under) * (1.0 - smoothstep(1.4, 3.6, under)));
      bcol = mix(bcol, bd * 0.7, 0.5 * (1.0 - smoothstep(0.0, 9.0, dIn)));
      a = bB.z * smoothstep(-0.75 * pxW, 0.75 * pxW, dIn) * smoothstep(-0.75 * pxW, 0.75 * pxW, under);
    }
    if (a > 0.0) inner = over(vec4(min(bcol, vec3(1.0)) * a, a), inner);
  }
  vec4 o = over(fluidC, over(v, over(inner, pl)));
  if (lineOn == 1) o = over(texelFetch(lineL, ip, 0), o);
  outColor = o;
}${heads ? `\n#endif\n${headMain({ LUMEN2, ROW2_MASK, FLOW_TEXELS })}` : ''}`;

// Organ outlines (a selected or hovered organ): a stroke of world width, drawn with the figure so a
// pan or zoom moves it in the same frame. Widened in device pixels so a hairline still covers its
// pixels (its alpha thins instead), and antialiased across both edges.
const LINE_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 nrm;
layout(location=2) in vec2 sideW;   // side (−1 or 1), half width (world units); a fill's edge fringe: (0 or 1, −1)
uniform mat3 world;
uniform vec2 size;
uniform float pack;   // 1: a warm glow, whose half width carries its fade too (64 x the fade in 63 steps + the width), so a run's ends can fade out
out float vD;
out float vW;
out float vF;
out float vY;
void main() {
  vY = pos.y;
  vec2 n = (world * vec3(nrm, 0.0)).xy;
  float k = max(length(n), 1e-6);
  float w = sideW.y;
  vF = 1.0;
  if (pack > 0.5 && w > 0.0) { float c = floor(w / 64.0); vF = c / 63.0; w -= 64.0 * c; }
  vW = w * k;
  float e = max(vW, 0.5) + 1.0;
  if (sideW.y < 0.0) { vW = 0.5; e = 1.0; }   // fading from the fill's edge to nothing one device pixel out
  vec2 d = (world * vec3(pos, 1.0)).xy + n / k * sideW.x * e;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vD = sideW.x * e;
}`;
const LINE_FS = `#version 300 es
precision highp float;
in float vD;
in float vW;
in float vF;
in float vY;
uniform vec4 col;   // rgb, alpha
uniform vec2 endFade;   // an outline or glow fades out between these two heights (the rectum's end: (0, 0) for none)
uniform float soft;   // 1: a glow, strongest on the edge and easing out as a Gaussian over its width (vD runs 0 to the full reach)
out vec4 o;
void main() {
  float a;
  float fe = (endFade.y > endFade.x ? clamp((endFade.y - vY) / (endFade.y - endFade.x), 0.0, 1.0) : 1.0);
  if (soft > 0.5) {
    float t = clamp(abs(vD) / (vW + 1.0), 0.0, 1.0);
    a = col.a * vF * exp(-4.5 * t * t) * (1.0 - smoothstep(0.55, 1.0, t)) * fe;
    // A hair of noise, so a long faint ramp does not step in 8-bit colour.
    a = max(a + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0, 0.0) * step(0.0005, a);
  } else a = col.a * clamp(max(vW, 0.5) + 0.5 - abs(vD), 0.0, 1.0) * fe;   // (a stroke is at least one device pixel wide, at full strength: the stent's struts and rails, a balloon's rim, visual-style D3)
  o = vec4(col.rgb * a, a);
}`;

// A program is started (its shaders compiled and linked) and finished (its status read) apart: every program of a context is
// started first, then each is finished, so with KHR_parallel_shader_compile the driver compiles them side by side instead of
// one wait each; a shader object can be shared (the composite's fragment shader serves both of its programs, compiled once).
// (The lobule's prewarm compile was a 2.4–3.6 s task; round 2 review, P10.)
function shader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}
function startProgram(gl, vs, fs) {
  const sh = [typeof vs === 'string' ? shader(gl, gl.VERTEX_SHADER, vs) : vs, typeof fs === 'string' ? shader(gl, gl.FRAGMENT_SHADER, fs) : fs];
  const p = gl.createProgram();
  for (const x of sh) gl.attachShader(p, x);
  gl.linkProgram(p);
  return { p, sh };
}
function finishProgram(gl, { p, sh }) {
  // (Only the link's status when it went (?shaderwarm=0: each shader's first, as before): a shader's is read only to say why it failed.)
  if (!SHADER_WARM) for (const x of sh) if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    for (const x of sh) if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
    throw new Error(gl.getProgramInfoLog(p));
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

function dataTex(gl, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * Signed curvature of a polyline at each of its N_SAMPLES points into out (1 / world units), positive turning toward the
 * side the shader's across coordinate calls +y (cross(along, offset) > 0); lightly smoothed, the ends copy their neighbours.
 */
export function bendCurvature(pts, out = new Float32Array(N_SAMPLES)) {
  // (The unsmoothed curvature in a scratch kept on the function, made on the first call and rewritten whole by each.)
  const n = Math.min(pts?.length || 0, N_SAMPLES), k = (bendCurvature.scratch ||= new Float32Array(N_SAMPLES)).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1], bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
    const ds = 0.5 * (Math.hypot(ax, ay) + Math.hypot(bx, by));
    k[i] = ds > 1e-6 ? Math.atan2(ax * by - ay * bx, ax * bx + ay * by) / ds : 0;
  }
  if (n > 2) { k[0] = k[1]; k[n - 1] = k[n - 2]; }
  for (let i = 0; i < N_SAMPLES; i++) out[i] = i < n ? (k[Math.max(0, i - 1)] + 2 * k[i] + k[Math.min(n - 1, i + 1)]) / 4 : 0;
  return out;
}

// The pieces of a screen rectangle r ([x, y, w, h], device px, y down, at most the W × H layer's size) as a layer wrapped by o
// ([ox, oy], whole pixels: screen pixel s is held in texel (s + o) mod size) holds it: [x, y, w, h, sx, sy] each, the piece in the
// layer's texels (y down) and its shift, its place in the layer minus its place on screen. Up to two a side, four in all; none is
// empty, and together they hold every pixel of r once.
export function wrapPieces(r, o, W, H) {
  const axis = (a, n, off, S) => {
    const s0 = (((a + off) % S) + S) % S, sh = s0 - a, n1 = Math.min(n, S - s0), out = [[s0, n1, sh]];
    if (n > n1) out.push([0, n - n1, sh - S]);
    return out;
  };
  const out = [];
  if (!(r[2] > 0 && r[3] > 0)) return out;
  for (const [x, w, sx] of axis(r[0], r[2], o[0], W)) for (const [y, h, sy] of axis(r[1], r[3], o[1], H)) out.push([x, y, w, h, sx, sy]);
  return out;
}

// The world box [x0, y0, x1, y1] of n cells (binVeins' cells: 6 floats each, the cell's origin first) of side `cell`; null for none.
export function boxOfCells(cells, n, cell) {
  if (!cells || !(n > 0)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = cells[i * 6], y = cells[i * 6 + 1];
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1 + cell, y1 + cell];
}

/**
 * The overlay stack's bounds `ob` (its picture's px, y down, pw × ph) as laid through the camera p' = k p + (ex, eyUp) on a canvas cw × ch (px, y up),
 * the box camDraw's scissor is cut to, into `o` (x0, y0, x1, y1): grown by what the texture's filtered read reaches (a texel, at the camera's scale)
 * and a pixel, cut to the canvas. False when the stack holds nothing or none of it is on the canvas.
 */
export function camLayBox(o, ob, k, ex, eyUp, cw, ch, pw, ph) {
  if (!(ob[2] > ob[0] && ob[3] > ob[1])) return false;
  const kx = cw / pw, ky = ch / ph, pad = Math.ceil(Math.abs(k) * Math.max(kx, ky)) + 1;
  const xa = k * ob[0] * kx + ex, xb = k * ob[2] * kx + ex, ya = k * (ch - ob[3] * ky) + eyUp, yb = k * (ch - ob[1] * ky) + eyUp;
  o[0] = Math.max(0, Math.floor(Math.min(xa, xb)) - pad); o[2] = Math.min(cw, Math.ceil(Math.max(xa, xb)) + pad);
  o[1] = Math.max(0, Math.floor(Math.min(ya, yb)) - pad); o[3] = Math.min(ch, Math.ceil(Math.max(ya, yb)) + pad);
  return o[2] > o[0] && o[3] > o[1];
}
// The vector vessel renderer's factory (vec-renderer.js createVecRenderer(gl, shared)); the seam's tests give it another.
// Settings › Display › Vessel renderer › Vector hands the figure's draw, drawRows and composite to what it makes (the seam below).
let vecFactory = createVecRenderer;
export function setVectorFactory(f) { vecFactory = typeof f === 'function' ? f : null; }
export function createVeinsGL(canvas, { tubes: nTubes, force = false, who = 'stage', onPlate = null, share = null }) {
  // share (the lobule, 4 Nov 2026: one GPU context for the figure): another renderer's `top` ({ gl, canvas }). This one then makes no context
  // and no canvas of its own: it draws in the host's context, and what it would put on its canvas goes to a texture and framebuffer of
  // its own (scr, SCR() where a canvas is bound), which the host lays in its present (target). `canvas` is then only the size carrier
  // (width and height as the owner sets them); its loss events are the host's canvas's.
  const hostCv = share?.canvas || null;
  const scr = share ? { tex: null, fbo: null, w: 0, h: 0, gen: 0 } : null;   // (gen: how many times the texture was made again, which clears it: the kept picture's, keepNote)
  // The framebuffer a present lays on: null (the canvas) or, shared, the texture's, sized to the canvas as it is now (made and sized here, lazily).
  function SCR() {
    if (!scr) return null;
    const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
    if (!scr.fbo) { scr.tex = gl.createTexture(); scr.fbo = gl.createFramebuffer(); }
    if (scr.w !== w || scr.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, scr.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scr.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scr.tex, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      scr.w = w; scr.h = h; scr.gen++;
    }
    return scr.fbo;
  }
  // A pass that is about to write every pixel of its target says so first, so a tile GPU (Apple's, under Safari's Metal) does not load the
  // target's old picture into the pass: the canvas (the default framebuffer, or the host's texture when shared) or a framebuffer object's colour.
  // (Where the renderer keeps the canvas (keep-screen.js), "the canvas" here is its screen texture; the shown surface is never invalidated.)
  function noLoad(target, onCanvas) {
    INVC[0] = onCanvas && !scr ? gl.COLOR : gl.COLOR_ATTACHMENT0;
    gl.invalidateFramebuffer(target, INVC);
  }
  // (A row is written in ROW2_BITS bits in the second lumen target: many more rows than the figure has, about two hundred.)
  if (nTubes + 1 > ROW2_MASK) { console.warn(`Veins renderer: ${nTubes} vessel rows do not fit the second lumen target.`); return null; }
  // (For the ?perf readout: who asked for a whole draw or a target sized again, gpu-probe.js BY.)
  const askedBy = () => (who === 'lobule' ? 'lobule' : gpuProbe.by || 'stage, outside a draw call');
  const noteAlloc = (kb) => { gpuProbe.note(COUNTED.fboAlloc, kb); gpuProbe.note(COUNTED.fboAllocBy + askedBy()); };
  // (The kept picture is the stage's, and the lobule's where the lobule's other GPU layers are drawn in its vessel canvas (its
  // overlay over the vessels, at each present, as the figure's glass and labels are over the figure's); every reader of that canvas
  // outside the task that drew it calls capture() first.)
  // (Such a canvas keeps no picture of its own: it is made without preserveDrawingBuffer, and the picture the frames repaint in part
  // is kept in a texture of the renderer's own, copied whole to the canvas each time it is drawn on (see present). Nor a stencil: the
  // one-pass frames mark their cells in that buffer's stencil, never the canvas's.)
  const ownBuf = who === 'stage' || who === 'lobule';
  // (The canvas keeps its picture all the same (preserveDrawingBuffer, 4 Nov 2026): Mohammad caught a frame on the HVPG slide with the figure
  // wholly black, no vessels, organs or labels, the cards and charts drawn. A canvas that does not keep its picture is cleared once the page has
  // shown it, so any frame that touches it without the whole kept picture laid first (a pass, a glass or a cover drawing on its own, a draw of
  // nothing) shows a cleared figure. Kept, such a frame shows the last picture under it. Every present still lays the kept picture whole.)
  // (Not kept again where ownBuf is (8 Nov 2026, Mohammad's Mac: 26 fps, GPU-bound, the sampled gpu line "present copy 33 ms, whole picture 66").
  // WebKit makes a canvas that keeps its picture draw into a separate full-size buffer of its own, and at each display copies that buffer whole
  // into the surface the page shows (WebGLDefaultFramebuffer resolveColorIntoResult): with our own whole copy, two full-screen copies a frame
  // (5.9 MP each on a 14-inch MacBook Pro) and 24 MB more held. Not kept, the canvas is that surface: the present's copy is the only one. The
  // black frame's cause was the lone pass clearing the canvas (presentSelf's soloOn gate, 4 Nov), and every write to this canvas is a whole lay
  // (the present's copy, a camera or under lay, a whole picture drawn straight onto it, a clear) or rides one in the same present (the overlays,
  // the tops); a reader outside the task goes through capture(). A renderer with no kept picture of its own still keeps the canvas's.)
  // (Kept by the browser again for an hour (500f38c, 15 fps): without it the figure had flickered (3f414f4's guard and ebb62bb's no canvas
  // invalidate did not end it). Now the renderer keeps it itself (keep-screen.js, below): the speed of f56992f, and the shown surface gets one
  // whole copy a frame and nothing else.)
  const KEEP_CANVAS = !ownBuf;
  let gl = null;
  try { gl = share ? share.gl : canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: !ownBuf, preserveDrawingBuffer: KEEP_CANVAS, failIfMajorPerformanceCaveat: !force }); } catch { gl = null; }
  if (gl && !share) setFenceContext(gl);   // (?perf's GPU fences are planted in the figure's own context, gpu-fence.js)
  if (!gl) return null;
  // (The canvas not kept by the browser, the renderer keeps it (keep-screen.js): every bind of the canvas binds a texture its size, and the
  // frame's end copies that onto the canvas once, whole. The canvas the browser shows gets one write a frame; nothing else ever touches it.)
  const askShow = frameFor('figure-canvas-shown');
  const noop = () => {};
  const screenKeep = !KEEP_CANVAS && !share ? keepScreen(gl, canvas, { onEnd: onFrameEnd, ask: () => { if (!framePhase()) { try { askShow(noop); } catch (e) { caught('veins-gl:show', e); /* (no frames here: node) */ } } } }) : null;
  // The composite's per-frame uniforms are sent only when they changed (uniform-cache.js; laptop-heat Q2). They are set nowhere else.
  const UC = uniformCache(gl);
  // Settings › Figure performance › Sharper upscaling (frame.js upscale, off by default): the picture's own size, [w, h], when the stage
  // draws the figure under Full into a buffer of its own and the canvas stays at Full (setPicture); null otherwise, and then the picture
  // is the canvas, as ever. Every size inside reads PW() and PH().
  const UP_SIZE = [0, 0];
  let up = null, upLin = false;   // (upLin: the picture upscaled by a plain filtered copy, not Sharper upscaling's filter: setPicture)
  // (overM: the figure's transform as last given to draw or drawRows, before whole(): the overlays are drawn at it.)
  let overM = null, overCss = 1, overSnap = false;   // (overCss: device px per CSS px, set by the stage: overlay.cssPx; overSnap: overlay.snap)
  // What is drawn over the figure in this canvas at each present (the frosted glasses, glass-gl.js host: round 2, 2.1), in their order:
  // each { order, prep?, draw }. Every prep runs first (each glass takes its blur from the picture just laid, before any glass is drawn
  // on it), then every draw, lowest order first.
  const tops = [];
  // (2 Nov 2026, bug sweep: one throw had taken a hook out for good, so a single bad frame of the cards' glass left every card solid
  // until a reload. A hook that throws is told once and kept; only one failing TOP_FAILS pictures in a row is taken out.)
  const TOP_FAILS = 30;
  const topFailed = (t, e) => {
    t.fails = (t.fails || 0) + 1;
    if (t.fails === 1) console.warn('Veins renderer: what is drawn over the figure failed.', e);
    if (t.fails >= TOP_FAILS) { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); console.warn(`Veins renderer: what is drawn over the figure failed. It failed ${TOP_FAILS} pictures in a row and is taken out.`); }
  };
  // What is drawn under the figure in this canvas (the lobule's tissue, tissue-gl.js host): { on(), draw() }. With one, each
  // present lays it on the cleared canvas first and the kept picture over it (premultiplied, pixel for pixel), then the tops; null: the
  // kept picture is copied as it is. presents counts the pictures laid, so an owner can tell whether a frame laid one.
  let under = null, presents = 0;
  // The lobule's kept picture (lobule-keep.js, lobule lag rec 1): its texture (scr) holds the whole picture a present laid, and a frame where
  // only the blood moved repaints the blood's squares in it (keepBlood) instead of laying the picture whole. keepSrc: the lobule's account of
  // what else the picture is made of ({ read(ks) } → fills the record below; top.keep); kept: what scr held at the last whole present.
  const keep = who === 'lobule' && share ? createKeep(gl) : null;
  let keepSrc = null;
  const kept = { on: false, pic: -1, gen: -1, v1: -1, v2: -1, v3: -1 };
  // (ks: tex, w, h: the tissue's picture; v1, v2, v3: the tissue's, the overlay's and the ductules' version numbers; dyn: something else is
  // drawn into the picture and moves; ducts, view, lum, cell, edge, nuc, width, alpha: the overlay's ductules, as fx-gl.js takes them.)
  const KS = { tex: null, w: 0, h: 0, v1: 0, v2: 0, v3: 0, dyn: false, ducts: null, view: null, lum: null, cell: null, edge: null, nuc: null, width: 0, alpha: 0 };
  // What stands in for the whole picture while it shows (the lobule's wide copy through a station dive, wide-gl.js host): { on(), draw() }.
  // While on(), each present clears the canvas and draws only it (the canvas's own size need not match the kept picture's then).
  let replace = null;
  const PW = () => (up ? up[0] : canvas.width), PH = () => (up ? up[1] : canvas.height);
  const pcx = gl.getExtension('KHR_parallel_shader_compile');
  let started;
  try {
    const compFS = shader(gl, gl.FRAGMENT_SHADER, COMP_FS()), compVS = shader(gl, gl.VERTEX_SHADER, COMP_VS), compCellVS = shader(gl, gl.VERTEX_SHADER, COMP_CELL_VS);
    const plainText = COMP_FS(true), plainFS = shader(gl, gl.FRAGMENT_SHADER, plainText);
    // (The two vessel builds share one vertex shader object, so a cell's corners land on the same device positions whichever
    // program draws it: neighbouring cells drawn by different programs meet edge to edge, no pixel left out or drawn twice.)
    const vesVS = shader(gl, gl.VERTEX_SHADER, VS);
    // (The one-pass builds: the vessel cells' vertex shader with the composite's zoom numbers, and one program per
    // vessel build. Not needed to draw, so a text that cannot be made only leaves them out.)
    let fuse = null;
    try { const cf = plainText; fuse = { vs: fusedVS(VS, ZOOM_VS), gen: fusedFS(vesselFS(false), cf, false), one: fusedFS(vesselFS(true), cf, true) }; }
    catch (e) { console.warn('Veins renderer: the one-pass shader could not be made; zoom frames keep two passes.', e); }
    const fuseVS = fuse && shader(gl, gl.VERTEX_SHADER, fuse.vs);
    // (The half-size streaks: one fragment shader, drawn whole or over the blood's squares alone.)
    const streakFS = who === 'stage' || who === 'lobule' ? shader(gl, gl.FRAGMENT_SHADER, COMP_FS(false, true)) : null;
    started = { fuseGen: fuse && startProgram(gl, fuseVS, fuse.gen), fuseOne: fuse?.one ? startProgram(gl, fuseVS, fuse.one) : null,
      prog: startProgram(gl, vesVS, vesselFS(false)), simple: startProgram(gl, vesVS, vesselFS(true)), comp: startProgram(gl, compVS, compFS), compCell: startProgram(gl, compCellVS, compFS), streak: streakFS ? startProgram(gl, compVS, streakFS) : null, streakCell: streakFS ? startProgram(gl, compCellVS, streakFS) : null,
      // (The arrowheads' quads (blood-heads.js): the stage's figure only, the one renderer given the vessels' axes.)
      heads: who === 'stage' ? startProgram(gl, headVS({ zoom: ZOOM_VS, along: ALONG_GLSL, rows: ROWS_GLSL, orange: CHEV_ORANGE_GLSL, nSamples: N_SAMPLES }), COMP_FS(false, false, true)) : null, plain: startProgram(gl, compVS, plainFS), plainCell: startProgram(gl, compCellVS, plainFS), cath: startProgram(gl, CATH_VS, CATH_FS), line: startProgram(gl, LINE_VS, LINE_FS) };
    // (The mesh vessel renderer's programs, the stage's figure only: a strip a vessel, a patch a join, and the scratch layers' laying. Not
    // needed to draw: until they are published, or if they fail, the classic vessel pass draws.)
    if (who === 'stage') { try { started.meshStrip = startProgram(gl, meshStripVS(STRIP_VS_GLSL, F_SEL), vesselFS(true, 1)); started.meshPatch = startProgram(gl, meshPatchVS(STRIP_VS_GLSL), vesselFS(false, 2)); started.meshLay = startProgram(gl, REUSE_VS, MESH_LAY_FS); } catch (e) { console.warn('Veins renderer: the mesh vessel shaders could not be made; the classic vessel pass draws.', e); delete started.meshStrip; delete started.meshPatch; delete started.meshLay; } }
  } catch (e) { console.warn('Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.', e); return null; }
  // Every other program this context will draw with, started now beside these, before any is read (GPU practice §2, docs/gpu-practices.md;
  // ?shaderwarm=0: each compiled where it is first made or drawn, as before): the organs' stack, painter and shapes (taken up just below,
  // their compiles run while these finish), and the variants of the canvas's own presents (the overlays' laying, Sharper upscaling,
  // pinch reuse: aux below, each published by prepare() once the driver has it, with one small draw, never compiled in a gesture's frame).
  if (SHADER_WARM) try { prestartOrganStack(gl); } catch (e) { caught('veins-gl:1918', e); /* (only a head start: each is compiled where it is made, as before) */ }
  // (Shaders are freed with the programs that hold them, once no program is still to be finished: see prepare.)
  const freeShaders = () => { for (const x of new Set(Object.values(started).filter(Boolean).flatMap((st) => st.sh))) gl.deleteShader(x); };
  // The optional builds (the one-vessel vessel program, the plain composite) are not needed to draw: every cell and every
  // frame can be drawn by the general ones. With KHR_parallel_shader_compile they are left compiling here and published by
  // prepare() once the driver says they are done, never waited on (addendum §10.1); until then the general ones draw, the
  // same picture. Without the extension they are finished here with the rest, as before.
  const later = pcx ? [...(started.simple ? ['simple'] : []), 'plain', ...(started.streak ? ['streak'] : []), ...(started.fuseGen ? ['fused'] : []), ...(started.heads ? ['heads'] : []), ...(started.meshLay ? ['mesh'] : [])] : [];
  // (Each optional build's programs, by its name in `later`.)
  const startsOf = (k) => (k === 'mesh' ? [started.meshStrip, started.meshPatch, started.meshLay] : k === 'heads' ? [started.heads] : k === 'streak' ? [started.streak, started.streakCell] : k === 'plain' ? [started.plain, started.plainCell] : k === 'fused' ? [started.fuseGen, started.fuseOne].filter(Boolean) : [started.simple]);
  let prog;
  try { prog = finishProgram(gl, started.prog); } catch (e) { console.warn('Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.', e); freeShaders(); return null; }
  // The one-vessel build (see vesselFS): null when it failed, and every cell keeps the general program.
  let simpleP = null;
  const finishSimple = () => {
    try { simpleP = finishProgram(gl, started.simple); } catch (e) { console.warn('Veins renderer: the one-vessel shader failed; every cell keeps the general one.', e); gl.deleteProgram(started.simple.p); simpleP = null; }
  };
  if (started.simple && !later.includes('simple')) finishSimple();
  let comp, compCell;
  try { comp = finishProgram(gl, started.comp); compCell = finishProgram(gl, started.compCell); } catch (e) { console.warn('Veins renderer: composite shader failed.', e); freeShaders(); return null; }
  // The plain composite (see COMP_FS), both passes or neither: null when it failed, and every frame keeps the full one.
  let plain = null, plainCell = null;
  const finishPlain = () => {
    try { plain = finishProgram(gl, started.plain); plainCell = finishProgram(gl, started.plainCell); } catch (e) {
      console.warn('Veins renderer: the plain composite failed; every frame keeps the full one.', e);
      gl.deleteProgram(started.plain.p); gl.deleteProgram(started.plainCell.p); plain = plainCell = null;
    }
  };
  if (!later.includes('plain')) finishPlain();
  // The half-size streak pass (see COMP_FS, HALF in composite): null when off or failed, and every frame keeps the streaks at full size.
  let streakP = null, streakCellP = null, halfUse = null, halfWas = false;   // (halfWas: the last composite drew the half-size streaks)
  const HALF_R = 32;   // device px of lumen radius from which the streaks are worked out at half size
  const half = { tex: null, fbo: null, w: 0, h: 0, ok: false };
  const finishStreak = () => {
    try { streakP = finishProgram(gl, started.streak); } catch (e) { console.warn('Veins renderer: the half-size streak shader failed; the streaks keep full size.', e); gl.deleteProgram(started.streak.p); streakP = null; }
    // (Its squares-only build: without it, each frame draws the half-size picture whole, as before.)
    try { streakCellP = streakP ? finishProgram(gl, started.streakCell) : null; } catch (e) { caught('veins-gl:streakCell', e); gl.deleteProgram(started.streakCell.p); streakCellP = null; }
    if (!streakP) gl.deleteProgram(started.streakCell.p);
  };
  if (started.streak && !later.includes('streak')) finishStreak();
  // The arrowheads' quads (blood-heads.js): null while compiling, off or failed, and the composite keeps testing every lumen pixel for a head.
  let headP = null;
  const finishHeads = () => {
    try { headP = finishProgram(gl, started.heads); } catch (e) { console.warn('Veins renderer: the arrowheads\' quad shader failed; the composite keeps drawing them.', e); gl.deleteProgram(started.heads.p); headP = null; }
  };
  if (started.heads && !later.includes('heads')) finishHeads();
  // The mesh vessel renderer's programs (Settings › Display › Mesh vessel renderer): all three or none. meshWhy: why the classic pass draws.
  let meshS = null, meshPt = null, meshL = null, meshWhy = who === 'stage' ? 'compiling' : 'not the figure';
  const finishMesh = () => {
    try { meshS = finishProgram(gl, started.meshStrip); meshPt = finishProgram(gl, started.meshPatch); meshL = finishProgram(gl, started.meshLay); meshWhy = ''; } catch (e) {
      console.warn('Veins renderer: the mesh vessel shaders failed; the figure keeps the classic vessel pass.', e);
      for (const st of startsOf('mesh')) gl.deleteProgram(st.p);
      meshS = meshPt = meshL = null; meshWhy = 'shader failed';
    }
  };
  if (started.meshLay && !later.includes('mesh')) finishMesh();
  function halfReady(rebind) {
    const w = Math.ceil(PW() / 2), h = Math.ceil(PH() / 2);
    if (!half.tex) { half.tex = dataTex(gl, gl.LINEAR); half.fbo = gl.createFramebuffer(); }
    if (half.w !== w || half.h !== h) {
      half.w = w; half.h = h; halfWas = false;   // (made again, empty: drawn whole next)
      gl.bindTexture(gl.TEXTURE_2D, half.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, half.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, half.tex, 0);
      half.ok = fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', w, h);
      rebind();
    }
    return half.ok;
  }
  const rowMaxR = [];
  let rMaxVal = 0, rMaxDirty = true;
  const rMaxAll = () => { if (rMaxDirty) { rMaxVal = 0; for (let i = 0; i < rowMaxR.length; i++) if (rowMaxR[i] > rMaxVal) rMaxVal = rowMaxR[i]; rMaxDirty = false; } return rMaxVal; };
  // The one-pass builds (one-pass zoom frames), both or neither (the one-vessel one only where that build draws cells): null when off
  // or failed, and every zoom frame keeps the two passes.
  let fuseGen = null, fuseOne = null;
  const finishFuse = () => {
    try { fuseGen = finishProgram(gl, started.fuseGen); fuseOne = started.fuseOne ? finishProgram(gl, started.fuseOne) : null; } catch (e) {
      console.warn('Veins renderer: the one-pass shader failed; zoom frames keep two passes.', e);
      for (const st of startsOf('fused')) gl.deleteProgram(st.p);
      fuseGen = fuseOne = null;
    }
  };
  if (started.fuseGen && !later.includes('fused')) finishFuse();
  const plates = [null, null];   // [whole plate, sharp view] : { tex, rect }
  // (Whether the whole plate is held (a raster, or the organs' layers: hasPlate(0)) as the owner last heard: it is told, by onPlate, in the call
  // that changes it, and not otherwise: the figure's `gl-plate` class is looked at only when it has been told.)
  let plateSeen = false;
  const notePlate = () => { const h = !!plates[0] || !!stack?.has(0); if (h !== plateSeen) { plateSeen = h; onPlate?.(h); } };
  // The organs as layers instead of one picture (the ?perf switch "GPU organs", stage.js): null where it cannot be made.
  const stack = createOrganStack(gl);
  // ── The vector renderer's state (the seam proper is below, before the mesh renderer's) ──
  let vec = null, vecFailed = false, vecChoice = '', binsNow = null, geoSkipped = false;
  // (The organ and overlay inputs as the stack and the overlay were last given them, kept as references: what the Vector renderer starts from when it
  // is chosen after they came, and what the stack is given when another renderer is chosen after Vector skipped the picture draws.)
  const vecOps = { bakes: [new Map(), new Map()], commits: [null, null], paint: null, overlay: null, live: null, masks: null, liveAll: null, order: null, shift: {}, lines: undefined, cath: undefined, spans: null, liver: undefined };
  // (What Vector skipped, for the stack and the covers: the baked layers, the commits, the cover's shapes, the overlays' groups.)
  const vecSkip = { bakes: [new Map(), new Map()], commits: [null, null], paint: null, overlay: null };
  /** Vector is drawing now (made, and still the choice): the skips below are decided on this, never on making it (that is a draw's). */
  const vecNow = () => !!vec && vesselRenderer() === 'vector';
  const VEC_JOB = { step: () => true, drop() {} };   // (a layer's bake under Vector: nothing to paint, it is whole at once)
  let vecGen = 0;   // (how many Vector renderers have been made: a morph set of an earlier one is made again)
  // (Whether Vector holds layer pictures for a slot: the ones it was told to show, standing in for the stack's staged ones.)
  const vecHeld = (slot) => !!vec && vesselRenderer() === 'vector' && !!vecOps.commits[slot]?.length;
  // (The stage is told whether the GPU holds the plate: with Vector, its layers count, though the stack holds none of their pictures.)
  const onPlateTo = onPlate;
  if (onPlateTo) onPlate = (h) => onPlateTo(h || vecHeld(0));
  const plateTell = () => { const h = !!plates[0] || !!stack?.has(0) || vecHeld(0); if (h !== plateSeen) { plateSeen = h; onPlateTo?.(h); } };
  // The figure's overlays (stage.js: the lowest groups of #stageOver it can read), painted by the organs' painter at the canvas's
  // own size into a stack of their own, laid over the picture as it goes onto the canvas (present). Only with a kept picture of
  // its own (the canvas is then drawn whole at each present, the overlays with it). Made when first asked for (overlay.set).
  const overOK = !!stack?.painter && ownBuf;
  // The present's variants, started ahead (see above): name → started program, until prepare() publishes it (or a frame that cannot do
  // without it takes it, auxTake). The overlays' stack program too, for their first set. The tasks of what is drawn over the figure in
  // this canvas (warmIn: the resolution fade's program, the glass's) are published in the same free moments.
  const aux = {}, freeTasks = [];
  const AUX_FS = { lay: LAY_FS, up: UP_FS, reuse: REUSE_FS };
  const auxStart = (k) => { if (!SHADER_WARM || aux[k] || lost || (k === 'lay' ? layP : k === 'up' ? upP : rz.P) !== null) return; try { aux[k] = startProgram(gl, REUSE_VS, AUX_FS[k]); } catch (e) { caught('veins-gl:1970', e); /* (compiled at its first use, as before) */ }
    // (Where the driver cannot say when it is done, it is finished now, where the switch is set, as the optional builds are: never in a frame.)
    if (!pcx && aux[k]) publishAux(k, false);
  };
  let over = null, layP = null, overShown = false;
  if (overOK && SHADER_WARM) { try { prestartLayer(gl); } catch (e) { caught('veins-gl:1975', e); /* (a head start only) */ } }
  let cathP = null;
  try { cathP = finishProgram(gl, started.cath); } catch (e) { console.warn('Veins renderer: catheter shader failed.', e); }
  const cathBuf = gl.createBuffer(), cathVAO = gl.createVertexArray();
  gl.bindVertexArray(cathVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, cathBuf);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 2, gl.FLOAT, false, 24, i * 8); }
  gl.bindVertexArray(null);
  let cath = null, cathWas = false, cathCap = 0, cathBase = null;   // cathCap: bytes the catheter's buffer holds (refilled in place while it fits); cathBase: the base it holds
  let cathAt = null;   // (the box the catheter was last drawn in, device px of the picture: [x0, y0, x1, y1], y down; see cathBox)
  let lineP = null;
  try { lineP = finishProgram(gl, started.line); } catch (e) { console.warn('Veins renderer: outline shader failed.', e); }
  if (!later.length) freeShaders();
  const lineBuf = gl.createBuffer(), lineVAO = gl.createVertexArray();
  gl.bindVertexArray(lineVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 2, gl.FLOAT, false, 24, i * 8); }
  gl.bindVertexArray(null);
  const lineVers = [0, 0, 0];
  // (The signatures of the three line layers' draws: the numbers of the last call (SIG_KEPT, SIG_KN of them) and of this one (SIG_NOW, SIG_N), grown as needed.)
  const SIG_NOW = [new Float64Array(64), new Float64Array(64), new Float64Array(64)], SIG_KEPT = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
  const SIG_N = [0, 0, 0], SIG_KN = [0, 0, 0];
  const sigPut = (i, x) => {
    let a = SIG_NOW[i];
    if (SIG_N[i] >= a.length) { const b = new Float64Array(a.length * 2); b.set(a); SIG_NOW[i] = a = b; }
    a[SIG_N[i]++] = x;
  };
  let skipped = false;
  let pictureSeq = 0;   // counts the times the canvas was drawn on (composite, clear): what the glass compares to know its copy of the figure is still current
  const onPicture = new Set();   // (told each time: the glass over the figure, asleep while the figure stands still, wakes)
  // (A frame of the moving blood alone, `blood` (see composite: only lumens repainted, every uniform as the last picture's, no dye, origin
  // colours, bleed or catheter), is not counted: under the glass's blur, a quarter-size copy blurred by 16 px, the parcels' streaks are
  // one even colour, so a copy taken again showed the same glass, at a readback a frame (30 Oct, review H4). bloodSeq counts those.)
  // (figVer: counts the uploads a blood frame could show, other than the blood's own rows: geometry, radii, curvature, attributes, dye, the
  // fluid's cells. A composite after any of them is counted as the figure drawn again, whatever it repaints.)
  let bloodSeq = 0, figVer = 0, figAt = 0;
  // (Where each of the last BD_N blood-alone frames drew: the union of its squares' boxes, in device px from the canvas's top left, or
  // unknown (an empty record of -1). The glass blurs again only the parts of its copy that a blood frame since its last blur reached.)
  const BD_N = 16, bdRect = new Float32Array(BD_N * 4), bdSeq = new Float64Array(BD_N).fill(-1), bdKnown = new Uint8Array(BD_N);
  const bdTiles = createDirtyTiles(BD_N);   // (the same frames as tiles: where the squares lie, not just their union; dirty-tiles.js)
  // (Render-cost plan 3b: where each of the last BD_N pictures (drawSeq) drew, as tiles, when it was a part of the canvas drawn again at the
  // same view (a vessel row's cells, a tint, an organ's box, the fluid's cells, the catheter's box, with the blood's squares). Every other
  // picture (a whole one, a camera, a new view, a reuse, a scene camera, a clear) is unknown, and the glass then blurs all it reads, as before.)
  const picTiles = createDirtyTiles(BD_N), picM = new Float64Array(6).fill(NaN);
  let picKnownM = false, underAt = NaN;   // (underAt: the under host's picture number (under.ver) at the last counted picture; NaN: none, or a host with no number)
  // (Marks into `T` (begun) the device boxes of n world cells (origins at cells[q * stride], [q * stride + 1]) of side `size` under m; `mark`, when
  // given, picks the cells (mark[q] set).)
  function markCells(T, cells, n, stride, m, size, mark = null) {
    const a = m[0] * size, b = m[1] * size, c = m[2] * size, d = m[3] * size;
    for (let q = 0; q < n; q++) {
      if (mark && !mark[q]) continue;
      const x = m[0] * cells[q * stride] + m[2] * cells[q * stride + 1] + m[4], y = m[1] * cells[q * stride] + m[3] * cells[q * stride + 1] + m[5];
      T.add(Math.min(x, x + a, x + c, x + a + c) - 1, Math.min(y, y + b, y + d, y + b + d) - 1, Math.max(x, x + a, x + c, x + a + c) + 1, Math.max(y, y + b, y + d, y + b + d) + 1);
    }
  }
  // (Marks into `T` the device box of the world box x0, y0, x1, y1 under m.)
  function markWorld(T, x0, y0, x1, y1, m) {
    let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
    for (let i = 0; i < 4; i++) {
      const wx = i & 1 ? x1 : x0, wy = i & 2 ? y1 : y0, x = m[0] * wx + m[2] * wy + m[4], y = m[1] * wx + m[3] * wy + m[5];
      if (x < lx) lx = x; if (x > hx) hx = x; if (y < ly) ly = y; if (y > hy) hy = y;
    }
    T.add(lx - 1, ly - 1, hx + 1, hy + 1);
  }
  // (A picture just counted (pictured): where it drew, when that is known, at the view the last known picture was drawn at.)
  // (whole: drawn whole, at m (known after, unknown itself); odd: drawn in a way that leaves the canvas not the picture at m (one pass, upscaled,
  // under a camera, with something under or in place of it): unknown, and the next one too.)
  function picMark(was, m, whole, odd, part, dirt, pool, ripple, cathRect) {
    const same = was && m[0] === picM[0] && m[1] === picM[1] && m[2] === picM[2] && m[3] === picM[3] && m[4] === picM[4] && m[5] === picM[5];
    for (let i = 0; i < 6; i++) picM[i] = m[i];
    picKnownM = !odd;
    if (whole || odd || !same || !PW() || !PH()) return;   // (unknown, as pictured left it)
    if (part && !partMark) return;
    if (ripple && !(fluidW[2] > fluidW[0])) return;
    const T = picTiles;
    T.begin(pictureSeq, PW(), PH());
    if (nBlood) { if (!bloodCPU) { T.unknown(pictureSeq); return; } markCells(T, bloodCPU, nBlood, 6, m, bloodCell); }
    if (part) { if (!cellsCPU) { T.unknown(pictureSeq); return; } markCells(T, cellsCPU, nCells, 6, m, CELL, partMark); }
    if (dirt) markWorld(T, dirtW[0], dirtW[1], dirtW[2], dirtW[3], m);
    if (pool) markWorld(T, poolW[0], poolW[1], poolW[2], poolW[3], m);
    if (ripple) markWorld(T, fluidW[0], fluidW[1], fluidW[2], fluidW[3], m);
    if (cathRect) T.add(cathRect[0], cathRect[1], cathRect[2], cathRect[3]);
  }
  function bloodMark(seq, cells, n, m, size) {
    const i = seq % BD_N, r = i * 4;
    bdSeq[i] = seq;
    if (!cells || !m || !PW() || !PH()) { bdKnown[i] = 0; bdTiles.unknown(seq); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const W = PW(), H = PH(), a = m[0] * size, b = m[1] * size, c = m[2] * size, d = m[3] * size;
    bdTiles.begin(seq, W, H);
    for (let q = 0; q < n; q++) {
      const x = m[0] * cells[q * 6] + m[2] * cells[q * 6 + 1] + m[4], y = m[1] * cells[q * 6] + m[3] * cells[q * 6 + 1] + m[5];
      const lx = Math.min(x, x + a, x + c, x + a + c), hx = Math.max(x, x + a, x + c, x + a + c);
      const ly = Math.min(y, y + b, y + d, y + b + d), hy = Math.max(y, y + b, y + d, y + b + d);
      if (lx < x0) x0 = lx; if (hx > x1) x1 = hx; if (ly < y0) y0 = ly; if (hy > y1) y1 = hy;
      bdTiles.add(lx - 1, ly - 1, hx + 1, hy + 1);   // (render-cost plan 3a: each square's own tiles, a pixel wider for the edge)
    }
    bdKnown[i] = 1;
    // (A pixel wider each side for the edge; an empty union, no square on the canvas, is a rect with no area.)
    bdRect[r] = Math.max(0, x0 - 1); bdRect[r + 1] = Math.max(0, y0 - 1); bdRect[r + 2] = Math.min(W, x1 + 1); bdRect[r + 3] = Math.min(H, y1 + 1);
  }
  /** What the blood frames after number `from` up to `to` drew over: sets out = [x0, y0, x1, y1] (device px from the canvas's top left) and
   *  returns true, or false when that is not known (too many frames ago, or one of them drew the whole canvas or under a camera). */
  function bloodDirty(from, to, out) {
    if (!(to > from) || to - from > BD_N) return false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let s = from + 1; s <= to; s++) {
      const i = s % BD_N;
      if (bdSeq[i] !== s || !bdKnown[i]) return false;
      const r = i * 4;
      if (bdRect[r + 2] > bdRect[r] && bdRect[r + 3] > bdRect[r + 1]) { x0 = Math.min(x0, bdRect[r]); y0 = Math.min(y0, bdRect[r + 1]); x1 = Math.max(x1, bdRect[r + 2]); y1 = Math.max(y1, bdRect[r + 3]); }
    }
    out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
    return true;
  }
  const callPicture = (f) => f();
  const pictured = (blood = false) => { if (blood) { bloodSeq++; return; } pictureSeq++; picTiles.unknown(pictureSeq); picKnownM = false; onPicture.forEach(callPicture); };   // (any picture not marked by picMark leaves the next one unknown too)
  let lines = null, linesWas = false, lastPW = -1, lastPH = -1, viewId = 0;
  // (What each layer was last drawn for: its version and the view's number, which turns over when the matrix or the canvas size
  // changes. -1: none. Numbers, where a string of the matrix and the size was built in each frame.)
  let lineKV = -1, lineKI = -1, glowKV = -1, glowKI = -1, warmKV = -1, warmKI = -1;
  const lastM = new Float64Array(6).fill(NaN), passes = [];
  // The outlines are drawn into a layer of their own when they change, and the composite lays it over the picture: the
  // cells-only pass then keeps them, so an open organ card no longer repaints the whole picture every frame. Glows
  // (draws marked soft) have a layer too, which the composite lays under the organs.
  const makeLayer = () => { const tex = dataTex(gl); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return { tex, fbo: gl.createFramebuffer(), w: 0, h: 0 }; };
  const lineLayer = makeLayer(), glowLayer = makeLayer(), warmLayer = makeLayer();
  // (The layers' draws as steps the probe can time, each made once: they are asked for with the view's matrix, baseM, whichever it is then.)
  const cathT = () => drawCath(baseM), linesT = () => drawLines(baseM, false);
  let organM = null;   // (the view the organ layers are drawn at, for organT)
  const organT = () => stack.render(organM, PW(), PH());
  // Next-view pre-render: with the plate faded out whole (the circuit) and the camera at rest, the margin the change back to the anatomy
  // paints in its tap frame is painted once the page is left alone (organs-gl prepMove), for the view held now. A move, or the plate
  // shown again, calls it off. (prepBuf: that view; prepOff: the wait's cancel.)
  const prepBuf = [0, 0, 0, 0, 0, 0];   // alloc-rare: once per renderer
  let prepOff = null, prepSet = false, prepDone = false, prepT = 0;
  const prepRun = () => {   // alloc-rare: once per renderer
    prepOff = null;
    if (performance.now() - prepT < 400) { const t = setTimeout(prepRun, 400); prepOff = () => clearTimeout(t); return; }   // (the camera moved meanwhile: once it has held)   // alloc-rare: once per camera rest in the circuit
    prepDone = true;
    if (!lost && stack?.has(0)) stack.prepMove(prepBuf, PW(), PH());
  };
  function prepAhead(m, on) {
    if (!on) { if (prepOff) { prepOff(); prepOff = null; } prepSet = false; return; }
    if (!prepSet || prepBuf[0] !== m[0] || prepBuf[1] !== m[1] || prepBuf[2] !== m[2] || prepBuf[3] !== m[3] || prepBuf[4] !== m[4] || prepBuf[5] !== m[5]) {
      for (let i = 0; i < 6; i++) prepBuf[i] = m[i];
      prepSet = true; prepDone = false; prepT = performance.now();
    }
    if (!prepOff && !prepDone) prepOff = whenQuiet(prepRun, 700);   // alloc-rare: once per camera rest in the circuit, never per frame
  }
  const lineLayerT = () => renderLayer(lineLayer, baseM, false), glowLayerT = () => renderLayer(glowLayer, baseM, true), warmLayerT = () => renderLayer(warmLayer, baseM, true, true);
  // Figure resolution › Glows (setLayerScale): under 1, a glow layer's lines are drawn into a smaller target (lo) and stretched into the
  // layer by a filtered blit, so the composite reads the layer exactly as ever (its shader is the live site's). At 1 none of it runs.
  let layerK = 1;
  const lo = { tex: null, fbo: null, w: 0, h: 0 };
  // (The tests kept, so a frame makes no closure to ask whether the outlines, the glow or the warm glow have a draw.)
  const isGlowDraw = (d) => d.soft && !d.warm, isHardDraw = (d) => !d.soft, isWarmDraw = (d) => d.warm;
  const hasSoft = () => !!lines?.draws.some(isGlowDraw), hasHard = () => !!lines?.draws.some(isHardDraw), hasWarm = () => !!lines?.draws.some(isWarmDraw);
  function renderLayer(L, m, soft, warm = false) {
    if (layerK < 1 && L !== lineLayer) { renderLayerLow(L, m, soft, warm); return; }
    if (L.w !== PW() || L.h !== PH()) {
      L.w = PW(); L.h = PH();
      gl.bindTexture(gl.TEXTURE_2D, L.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, L.w, L.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
    gl.viewport(0, 0, L.w, L.h);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    drawLines(m, soft, warm);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
  }
  function renderLayerLow(L, m, soft, warm) {
    const w = Math.max(1, Math.round(PW() * layerK)), h = Math.max(1, Math.round(PH() * layerK));
    if (!lo.tex) { lo.tex = dataTex(gl); lo.fbo = gl.createFramebuffer(); }
    if (lo.w !== w || lo.h !== h) {
      lo.w = w; lo.h = h;
      gl.bindTexture(gl.TEXTURE_2D, lo.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, lo.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lo.tex, 0);
    }
    if (L.w !== PW() || L.h !== PH()) {
      L.w = PW(); L.h = PH();
      gl.bindTexture(gl.TEXTURE_2D, L.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, L.w, L.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.tex, 0);
    }
    // (The lines in the small target: their positions are in the canvas's pixels (drawLines' size), so the smaller viewport scales them.)
    gl.bindFramebuffer(gl.FRAMEBUFFER, lo.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    drawLines(m, soft, warm);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, lo.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, L.fbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, L.w, L.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, SCR());
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, SCR());
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
  }
  function freeLayer(L) {   // back to a single texel while nothing is drawn in it
    if (!L.w) return;
    L.w = L.h = 0;
    gl.bindTexture(gl.TEXTURE_2D, L.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  function drawLines(m, soft, warm = false) {
    const U = lineP.u;
    gl.useProgram(lineP.p);
    UC.m3(U.world, m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]));
    UC.f2(U.size, PW(), PH());
    UC.f1(U.soft, soft ? 1 : 0);
    UC.f1(U.pack, warm ? 1 : 0);
    gl.enable(gl.BLEND);
    // The warm glow's strips take the strongest where they meet (one colour, so max is exact on premultiplied output): overlaps never stack.
    if (warm) { gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE); } else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(lineVAO);
    for (const d of lines.draws) {
      if (d.alpha <= 0 || !!d.soft !== !!soft || !!d.warm !== warm) continue;
      UC.f4(U.col, d.col[0], d.col[1], d.col[2], d.alpha);
      UC.f2(U.endFade, d.endFade ? d.endFade[0] : 0, d.endFade ? d.endFade[1] : 0);
      gl.drawArrays(d.tri ? gl.TRIANGLES : gl.TRIANGLE_STRIP, d.first, d.count);
    }
    gl.bindVertexArray(null);
    if (warm) gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  let vao = gl.createVertexArray();
  let cellBuf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  // The cells the one-vessel build draws (veins-bin simpleCells), out of cellBuf, which holds the rest; nGen, nSimple of each.
  let simpleBuf = gl.createBuffer();
  const cellVAO = (buf) => {
    const v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return v;
  };
  let oneVAO = cellVAO(simpleBuf);
  let nGen = 0, nSimple = 0, simpleOf = null;
  // Each cell to the program that draws it: the one-vessel build where the cell's list proves it can, else the general one.
  function uploadCells() {
    simpleOf = simpleP && cellsCPU ? simpleCells(cellsCPU, nCells, entCPU) : null;
    const { gen, one, nGen: g, nOne: o } = splitCells(cellsCPU || new Float32Array(0), cellsCPU ? nCells : 0, simpleOf);
    gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gen, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, simpleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, one, gl.STATIC_DRAW);
    nGen = g; nSimple = o;
  }
  // The cells a lumen can reach (binVeins' `blood`): a frame where only the blood moved repaints these alone (see composite).
  let bloodVAO = gl.createVertexArray(), bloodBuf = gl.createBuffer();
  const bloodVAOOf = (v, buf) => {
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  };
  bloodVAOOf(bloodVAO, bloodBuf);
  let nBlood = 0, bloodCell = CELL;   // (bloodCell: the size of those squares, world units)
  // (The blood's own pass draws the quarters of its cells a lumen can reach (binVeins bloodQ).)
  function uploadBlood(bins) {
    const q = bins.bloodQ;
    bloodCell = q ? CELL / 2 : CELL;
    const bl = q ? bins.bloodQ : bins.blood || bins.cells;
    gl.bindBuffer(gl.ARRAY_BUFFER, bloodBuf);
    gl.bufferData(gl.ARRAY_BUFFER, bl, gl.STATIC_DRAW);
    nBlood = q ? bins.nBloodQ : bins.blood ? bins.nBlood : bins.nCells;
    bloodCPU = bl;
  }
  // Some of those cells, for a redraw of only the vessels that changed (see drawRows).
  const partVAO = gl.createVertexArray(), partBuf = gl.createBuffer();
  gl.bindVertexArray(partVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  // (Split as the whole layer's cells are: partBuf holds the general program's, partSBuf the one-vessel build's, partG and partS of each.)
  const partSBuf = gl.createBuffer(), partSVAO = cellVAO(partSBuf);
  let partG = 0, partS = 0, partMark = null;   // (partMark: the cells last uploaded, over cellsCPU, for the glass: render-cost plan 3b)
  // The ascites surface band: cells redrawn each frame while its ripple runs.
  const fluidBuf = gl.createBuffer(), fluidVAO = gl.createVertexArray();
  gl.bindVertexArray(fluidVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, fluidBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  // The pool below a level that moved (fluidPool): its cells composited whole once, instead of the whole picture.
  const poolBuf = gl.createBuffer(), poolVAO = gl.createVertexArray();
  gl.bindVertexArray(poolVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, poolBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  // The box of the organ stack that changed (a live organ's ease, organs-gl render): its cells composited whole once, as the pool's.
  const dirtBuf = gl.createBuffer(), dirtVAO = gl.createVertexArray();
  gl.bindVertexArray(dirtVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, dirtBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  let nDirt = 0;
  const dirtW = new Float64Array(4), poolW = new Float64Array(4), fluidW = new Float64Array(4).fill(NaN);   // (world boxes of the dirt, pool and fluid cells: render-cost plan 3b)
  // (Preallocated cell lists, recs.md item 7, 2 Nov 2026: the cells an ease redraws (the organs' changed box, the ascites pool) are
  // written into one kept Float32Array, grown by doubling only when a list outgrows it, and sent with bufferSubData into a GPU buffer
  // kept at its largest size, so a moving frame makes no array and reallocates no GPU storage.)
  const cellCap = new Map();
  const cellList = {
    a: new Float32Array(2048), n: 0,
    reset() { this.n = 0; },
    push(x, y) {
      if (this.n + 2 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
      this.a[this.n++] = x; this.a[this.n++] = y;
    },
    send(buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      if ((cellCap.get(buf) || 0) < this.n) { const cap = Math.max(this.n, 2 * (cellCap.get(buf) || 0), 512); gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW); cellCap.set(buf, cap); }
      if (this.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.a, 0, this.n);
      return this.n / 2;
    },
  };
  // (R05, review pass 2: a dynamic buffer's GPU storage is kept and its used part rewritten with bufferSubData while the data fits;
  // it is grown, to 1.5 times, only when outgrown, so a fluid ease, a row redraw or a line rebuild allocates no GPU storage. The
  // capacities are counted (keptStats) for the tests and the ?perf readout.)
  const keptStats = { sub: 0, grow: 0, bytes: 0 };
  // (`n`: the floats of `data` to send, from its start; all of it by default. A list kept longer than its content sends only the content.)
  function keepBuf(buf, data, n = data.length) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const need = n * 4, cap = (cellCap.get(buf) || 0) * 4;   // (cellCap counts floats, as cellList does)
    if (need > cap) {
      const c = Math.ceil(Math.max(need + (need >> 1), 1024) / 4) * 4;
      gl.bufferData(gl.ARRAY_BUFFER, c, gl.DYNAMIC_DRAW); cellCap.set(buf, c / 4); keptStats.grow++; keptStats.bytes += c - cap;
    } else keptStats.sub++;
    if (need) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n);
  }
  // (The same for a float texture whose height follows the data (the binned entries): kept as tall as it has been, rows written
  // with texSubImage2D, made taller (by a quarter more) only when outgrown. Its shaders fetch rows by index, never its size.)
  const texRows = new WeakMap();
  function keepRows(tex, ifmt, fmt, type, w, rows, data) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const cap = texRows.get(tex) || 0;
    if (rows > cap) {
      const c = Math.max(rows + (rows >> 2), 16);
      gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, c, 0, fmt, type, null); texRows.set(tex, c); keptStats.grow++;
    } else keptStats.sub++;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, rows, fmt, type, data);
  }
  // The cells (world origins on the CELL grid) that cover a device box under m, into dirtBuf.
  function dirtCells(b, m) {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9, ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const px = i & 1 ? b[2] : b[0], py = i & 2 ? b[3] : b[1];   // (the box's four corners)
      const dx = px - m[4], dy = py - m[5], x = ia * dx + ic * dy, y = ib * dx + id * dy;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    cellList.reset();
    for (let y = Math.floor(y0 / CELL) * CELL; y < y1; y += CELL) for (let x = Math.floor(x0 / CELL) * CELL; x < x1; x += CELL) cellList.push(x, y);
    nDirt = cellList.send(dirtBuf);
    dirtW[0] = Math.floor(x0 / CELL) * CELL; dirtW[1] = Math.floor(y0 / CELL) * CELL; dirtW[2] = Math.ceil(x1 / CELL) * CELL + CELL; dirtW[3] = Math.ceil(y1 / CELL) * CELL + CELL;   // (the cells' world box, for the glass)
  }
  const fluidTex = dataTex(gl);
  let fluidRows = null, fluidTexN = 0;   // (R05: setFluidSpans' kept rows, and the width its texture was made at)
  let fluidRect = null, nFluid = 0, fluidN = 0, fluidLiver = null, nPool = 0;
  const compVAO = gl.createVertexArray();
  gl.bindVertexArray(compVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let entTex = dataTex(gl), entNone = null;
  const radTex = dataTex(gl), rmaxTex = dataTex(gl), tubeTex = dataTex(gl), organTex = dataTex(gl, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, radTex);
  // (Per sample: the radius there and at the next sample, and the along curve there and at the next (pressure-along.js; −1
  // throughout a row with no waist: the colour mixes by arc).)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N_SAMPLES, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, rmaxTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(nTubes));
  gl.bindTexture(gl.TEXTURE_2D, tubeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TUBE_TEXELS, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, organTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  const bendTex = dataTex(gl);
  gl.bindTexture(gl.TEXTURE_2D, bendTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, N_SAMPLES, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(N_SAMPLES * nTubes));
  // (Each vessel's axis, for the arrowheads' quads (blood-heads.js): the points setBend is given, as the GPU should hold them, the span of
  // rows written since the last send, and which rows have one. The texture is made on the first send.)
  const axisAll = new Float32Array(N_SAMPLES * 2 * nTubes), axisHas = new Uint8Array(nTubes);
  let axisLo = Infinity, axisHi = -1, axisTex = null, axisN = 0;
  function flushAxis() {
    if (axisHi < axisLo) return;
    if (!axisTex) {
      axisTex = dataTex(gl);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, N_SAMPLES, nTubes, 0, gl.RG, gl.FLOAT, null);
      axisLo = 0; axisHi = nTubes - 1;
    } else gl.bindTexture(gl.TEXTURE_2D, axisTex);
    const n = axisHi - axisLo + 1;
    if (gpuProbe.on) gpuProbe.note('uploaded: axes', n * N_SAMPLES * 8 / 1024);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, axisLo, N_SAMPLES, n, gl.RG, gl.FLOAT, axisAll, axisLo * N_SAMPLES * 2);
    axisLo = Infinity; axisHi = -1;
  }
  // (The heads' quads: the corner quad and, per head, its row, place and run: createHeadList.)
  const headList = createHeadList(nTubes), headBuf = gl.createBuffer(), headVAO = gl.createVertexArray();
  gl.bindVertexArray(headVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, headBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  // The heads a frame lays over its composite (blood-heads.js), after it, in the same target and the same box; blended premultiplied.
  // stillUse: the composite left still lumens alone this frame (stillOn), and the heads on them with it.
  function drawHeads(m, layer, glow, warm, useStack, stillUse) {
    flushAxis();
    const U = headP.u;
    gl.useProgram(headP.p);
    compBind(U, layer, glow, warm, useStack);
    bindUnit(U, 12, axisTex, 'axis');   // (the curvature's unit: the quads point each head along the axis and read no curvature)
    UC.m3(U.world, m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]));
    UC.f2(U.size, PW(), PH());
    UC.i1(U.stillOn, stillUse ? 1 : 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(headVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, headList.count());
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, bendTex);
    if (gpuProbe.on) gpuProbe.gauge('arrowheads', `${headList.count()} quads`);
  }
  // (The radii as the GPU should hold them, and the span of rows written since the last send: setRadii, flushRadii.)
  const radAll = new Float32Array(N_SAMPLES * 4 * nTubes), rmaxAll = new Float32Array(nTubes);
  let radLo = Infinity, radHi = -1;
  function flushRadii() {
    if (radHi < radLo) return;
    const n = radHi - radLo + 1;
    if (gpuProbe.on) gpuProbe.note('uploaded: setRadii', n * (N_SAMPLES * 16 + 4) / 1024);
    gl.bindTexture(gl.TEXTURE_2D, radTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, radLo, N_SAMPLES, n, gl.RGBA, gl.FLOAT, radAll, radLo * N_SAMPLES * 4);
    gl.bindTexture(gl.TEXTURE_2D, rmaxTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, radLo, 1, n, gl.RED, gl.FLOAT, rmaxAll, radLo);
    radLo = Infinity; radHi = -1;
  }
  const bendRow = new Float32Array(N_SAMPLES);
  // (What the curvature texture holds, as bits: all zero, as made above; see setBend.)
  const bendRowBits = new Uint32Array(bendRow.buffer), bendBits = new Uint32Array(N_SAMPLES * nTubes);
  // Per-vessel blood (FLOW_TEXELS texels a row) and dye (DYE_BINS along the course).
  const flowTex = dataTex(gl), dyeTex = dataTex(gl, gl.LINEAR);
  let flowSent = null;   // (the blood rows as last uploaded: setFlow)
  gl.bindTexture(gl.TEXTURE_2D, flowTex);
  // (One column more than the blood's own: column FLOW_TEXELS holds, in x, whether the vessel's row moved since the last picture:
  // see `moved` below. The blood's columns go up as before.)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, FLOW_TEXELS + 1, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, dyeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, DYE_BINS, nTubes, 0, gl.RED, gl.FLOAT, new Float32Array(DYE_BINS * nTubes));
  // Blood look D's baked tile (blood-tile.js): made on the first frame a view asks for the look, read on the noise unit in those frames.
  let tileGPU = null, tileTried = false, tileNow = null, styleE = false;
  // Lumens left alone (review/blood-shading-ideas item 7). A lumen pixel is made from its vessels' rows (flow, attributes, radii,
  // curvature, dye), the vessel layer and the composite's uniforms. In the blood's own pass (bloodOnly) the vessel layer is the
  // last picture's wherever that pass draws (a cell drawn again is composited whole first), so where the uniforms are the last
  // picture's too and neither of the pixel's vessels' rows changed since, the pixel would come out as it already is: it is left
  // as drawn, as a pixel with no lumen is. `moved`: the rows changed since the last picture drawn (every setter marks the rows it
  // changes; movedAll: assume all did); stillSig: that picture's uniforms (sigOf).
  const moved = new Uint8Array(nTubes), movedUp = new Float32Array(nTubes * 4).fill(-1);
  let movedAll = true, stillSig = null, sigNow = new Float64Array(384), texVer = 0, dyeSent = null;
  let sn = 0, stillN = 0;
  // (One value at a time, taken in the order they were listed: a rest list made an array for each call.)
  const sg = (v) => {
    if (v && typeof v === 'object') { for (let i = 0; i < v.length && sn < sigNow.length; i++) sigNow[sn++] = +v[i] || 0; }
    else if (sn < sigNow.length) sigNow[sn++] = +v || 0;
  };
  const bloodRow = new Uint8Array(nTubes);   // (rows that carry blood: setFlow)
  let btLast = NaN;                          // (the blood clock of the last picture drawn: composite)
  const SPAN = [0, 0];   // (the changed span of rows changedRows writes, kept)
  // (Marks the rows of `data` that differ from `last`, `w` floats a row: before `last` takes them.)
  const markRows = (data, last, w) => {
    for (let r = 0; r < nTubes; r++) {
      if (moved[r]) continue;
      for (let k = r * w, e = k + w; k < e; k++) if (data[k] !== last[k]) { moved[r] = 1; break; }
    }
  };
  // The vessel layer, rendered when something changes: its color, and the lumen buffer.
  let fbo = gl.createFramebuffer();
  let baseTex = dataTex(gl), gTex = dataTex(gl), gTex2 = dataTex(gl), depTex = dataTex(gl);
  // (The vessel layer's four targets' formats, in ATTACH's order: colour, the front lumen, the second lumen (packed: ROW2_BITS), the depth mask.)
  const layerFmt = () => [[gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], [gl.RGBA16UI, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT], [gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT], [gl.R8, gl.RED, gl.UNSIGNED_BYTE]];
  // (depTex: whether a lumen colour reaches each pixel, see the shader. The vessel pass reads it only in a colour-only
  // redraw, into tintFbo, which holds the colour alone; otherwise it reads depNone, a texel no framebuffer holds.)
  const tintFbo = gl.createFramebuffer(), depNone = dataTex(gl);
  gl.bindTexture(gl.TEXTURE_2D, depNone);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
  let fboW = 0, fboH = 0, baseM = null, dyeAny = false, wasBleeding = false;
  // (The view the layer was drawn in: BASEM, written in place; baseM is null while there is none. viewKeyStr is its text, made when it changes.)
  const BASEM = new Float64Array(6);
  let viewKeyStr = '';
  function setBase(m) {
    let ch = !baseM;
    for (let i = 0; i < 6; i++) { if (BASEM[i] !== m[i]) { BASEM[i] = m[i]; ch = true; } }
    baseM = BASEM;
    if (ch) viewKeyStr = BASEM.join(',');   // alloc-rare: only when the view moved
  }
  // (fboPW × fboPH: the picture's size the layer was laid out for. The layer itself, fboW × fboH, can be smaller: see layoutFor.)
  let fboPW = 0, fboPH = 0;
  // (The world box of every cell of the binning uploaded: [x0, y0, x1, y1], null with none.)
  let cellBox = null;
  const ATTACH = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3];
  const ATTACH_COLOR = [gl.COLOR_ATTACHMENT0];   // (the colour target alone: a colour-only redraw, a warm-up)
  const ATTACH_ONE = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.NONE, gl.COLOR_ATTACHMENT3];   // (the one-vessel build's: see vesselDraw)
  // fboOK: the vessel layer holds a whole draw of the current geometry, radii and organ covers, at baseM, so a redraw of
  // some of its cells (drawRows) leaves it exactly as a whole draw would. Cleared by anything else the vessel pass reads.
  let fboOK = false;
  let lowLive = null;
  const LOWLIVE = [0, 0];   // (the tier's [w, h] while lowLive holds it)
  // The layer at w × h for the picture as it is now (its targets made again only when w or h changed).
  // (The mesh renderer's stencil, attached to the layer while it is the layer's size: see meshTargets. A layer made again at another size
  // takes it off first, as attachments of two sizes leave the framebuffer incomplete.)
  let meshSt = null, meshStOn = false;
  function ensureFBO(w, h) {
    if (fboW === w && fboH === h && fboPW === PW() && fboPH === PH()) return;
    fboPW = PW(); fboPH = PH(); fboOK = false; wrapNone(); lowLive = null;
    if (fboW === w && fboH === h) return;
    fboW = w; fboH = h;
    if (gpuProbe.on) noteAlloc(fboW * fboH * 17 / 1024);
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, gTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, fboW, fboH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, gTex2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, fboW, fboH, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, depTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fboW, fboH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, gTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, gTex2, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, depTex, 0);
    if (meshStOn) { gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null); meshStOn = false; }
    gl.drawBuffers(ATTACH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
  }
  // Clears the bound vessel framebuffer's four targets (within the scissor, when it is on).
  const CLR_F = new Float32Array(4), CLR_U = new Uint32Array(4);
  function clearLayer() {
    gl.clearBufferfv(gl.COLOR, 0, CLR_F);
    gl.clearBufferuiv(gl.COLOR, 1, CLR_U);
    gl.clearBufferuiv(gl.COLOR, 2, CLR_U);
    gl.clearBufferfv(gl.COLOR, 3, CLR_F);
  }

  // The catheter's box on the picture under m ([x0, y0, x1, y1], device px, y down, whole pixels, 2 px of margin), from every vertex its
  // draws use (base and frame vertices alike; a vertex's place is final, CATH_VS only transforms it), clamped to the picture; null when it
  // has none on it. Every pixel the catheter can touch is inside: a triangle covers no pixel outside its vertices' box.
  // (`into`: the kept box it is written to and returned as; the box now, the box last drawn in (cathAt) and their union are three, kept.)
  const BOX_NOW = [0, 0, 0, 0], BOX_AT = [0, 0, 0, 0], BOX_U = [0, 0, 0, 0];
  function cathBox(m, into) {
    const base = cath.base, nb = base ? base.length / 6 : 0, V = cath.verts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of cath.draws) {
      for (let i = d.first, e = d.first + d.count; i < e; i++) {
        const a = i < nb ? base : V, o = (i < nb ? i : i - nb) * 6;
        if (o + 1 >= a.length) continue;
        const x = m[0] * a[o] + m[2] * a[o + 1] + m[4], y = m[1] * a[o] + m[3] * a[o + 1] + m[5];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!(x1 >= x0 && y1 >= y0)) return null;
    const r = into;
    r[0] = Math.max(0, Math.floor(x0) - 2); r[1] = Math.max(0, Math.floor(y0) - 2); r[2] = Math.min(PW(), Math.ceil(x1) + 2); r[3] = Math.min(PH(), Math.ceil(y1) + 2);
    return r[2] > r[0] && r[3] > r[1] ? r : null;
  }
  function drawCath(m) {
    const U = cathP.u;
    gl.useProgram(cathP.p);
    UC.m3(U.world, m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]));
    UC.f2(U.size, PW(), PH());
    UC.f2a(U.light, (cath.light || LIGHT));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(cathVAO);
    for (const d of cath.draws) {
      UC.i1(U.mode, d.mode);
      UC.f3a(U.col, d.col);
      UC.f1(U.alpha, d.alpha);
      UC.f2a(U.fade, (d.fade || [0, 0]));
      UC.f1(U.len, d.len ?? 1e9);
      gl.drawArrays(d.tri ? gl.TRIANGLES : gl.TRIANGLE_STRIP, d.first, d.count);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  let nCells = 0, lost = false, organRect = null, partCells = 0, tintCells = 0;
  // ── A pan at the same scale ──
  // The transform's translation is rounded to whole device pixels (the whole figure, plate and vessels together, moves by
  // at most half a pixel), so a pan moves the vessel layer by whole pixels. Each pixel's world position comes from the
  // pixel itself (see the shader), so the layer drawn at the new spot equals the old one moved by those pixels, exactly;
  // only the strips it uncovers have to be drawn. The layer is not copied for that: it wraps around at its edges (a torus), and a
  // pan moves the wrap (wo) instead, so each spot of the figure stays in the texel it was drawn in, and the strips the pan
  // uncovers are drawn into the texels the strips it hid gave up (wrapPieces). No second set of buffers, no copy.
  // (`out`: the rounded copy is written into a scratch the caller names, not made: WM is draw's and drawRows's, WO the overlays'.)
  const WM = new Float64Array(6), WO = new Float64Array(6), OVER = new Float64Array(6), LM = new Float64Array(6);
  const whole = (m, out) => {
    if (Number.isInteger(m[4]) && Number.isInteger(m[5])) return m;
    out[0] = m[0]; out[1] = m[1]; out[2] = m[2]; out[3] = m[3]; out[4] = Math.round(m[4]); out[5] = Math.round(m[5]);
    return out;
  };
  // The first four of two transforms alike (the scale and turn: a pan leaves them, a zoom or a turn does not).
  const sameLin = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  // What the vessel pass reads from the look (anything else in it only matters to the composite): its numbers written into LKN, and
  // compared with the look the layer was drawn from (LKD), no string made.
  const NO_RIM = [0, 0, 0, 0];   // (a look without a rim, as the unit tests' looks are)
  let LKN = new Float64Array(64), LKD = new Float64Array(64), nLKN = 0, nLKD = -1;
  // (A list's numbers are copied by a loop that reads each into the array in the same breath: passed one by one across a call they were
  // boxed, 500 bytes a frame, measured warmed in node with --expose-gc.)
  const lkArr = (a) => {
    let n = nLKN;
    for (let i = 0; i < a.length; i++) LKN[n++] = a[i];
    LKN[n++] = -7.25;   // (the end of a list)
    nLKN = n;
  };
  const lookNow = (k) => {
    if (LKN.length < 512) { LKN = new Float64Array(512); LKD = new Float64Array(512); nLKD = -1; }   // alloc-rare: once, the first look
    nLKN = 0;
    LKN[nLKN++] = k.reach;
    lkArr(k.shOff); lkArr(k.casing); lkArr(k.shadow); lkArr(k.sheen); lkArr(k.shade); lkArr(k.rim || NO_RIM); lkArr(k.paper || NO_RIM); lkArr(k.ring); lkArr(k.light);
    LKN[nLKN++] = k.netAlpha; LKN[nLKN++] = k.fx ? 1 : 0;
    lkArr(k.tierAlpha); lkArr(k.tierGroup);
    LKN[nLKN++] = k.organs;
    if (nLKN !== nLKD) return false;
    for (let i = 0; i < nLKN; i++) if (LKN[i] !== LKD[i]) return false;
    return true;
  };
  const keepLook = () => { for (let i = 0; i < nLKN; i++) LKD[i] = LKN[i]; nLKD = nLKN; };
  let tubesNew = true;
  // After a one-pass frame (one-pass zoom frames) the layer is left empty (cleared once, as the picture outside the vessel cells reads it)
  // and not current: any picture but the next one-pass frame draws it whole first (see composite).
  let stale = false, fusing = false;
  const ctxStencil = !!gl.getContextAttributes()?.stencil;
  // The composite's plain build stands for this frame (no dye, no origin colours, no bleed): the one-pass builds are plain.
  const bareOf = (blood) => !!plainCell && !(dyeAny && blood.dye !== false) && !blood.origin && !blood.bleed?.length;
  const fuseReady = () => !!fuseGen && !!plain && (!nSimple || !!fuseOne) && (own ? !!own.rb && own.w === PW() && own.h === PH() : ctxStencil);
  // The layer's window and wrap: it holds the screen pixels of the window [la, la + size) (device px, y down; the whole picture
  // unless the figure is smaller: layoutFor), screen pixel s in texel (s − la + wo) mod the layer's size. A window that follows
  // the figure on an axis (lAnch) moves with it on a pan, and the layer stays as it is; one that is the picture's on an axis keeps
  // still and the wrap moves instead. After every whole draw wo is [0, 0], and with la [0, 0] and the layer the picture's size every
  // pass reads and writes the layer exactly as a layer the picture's size without a wrap.
  const wo = [0, 0], la = [0, 0], lAnch = [false, false];
  const wrapNone = () => { wo[0] = 0; wo[1] = 0; };
  // (The vessel pass's lOff while it draws one piece: see wrapPieces. Zero everywhere else.)
  const lOffNow = [0, 0];
  // Runs the vessel pass (pieceFn) once for each piece of the screen rectangle x, y, w, h (device px, y down) as the layer holds it, with the
  // scissor on that piece and the vessel pass's lOff set to its shift. One piece over the whole layer runs it once with no scissor (with no
  // window offset and no wrap, the same calls as a layer without them). `scissored`: the caller has the scissor on (a pan's strips).
  // (The pieces are wrapPieces's, worked out into AXX and AXY: the pieces of each axis, three numbers each: start, length, shift.)
  const AXX = new Float64Array(6), AXY = new Float64Array(6);
  function axisPieces(a, n, off, S, out) {
    const s0 = (((a + off) % S) + S) % S, sh = s0 - a, n1 = Math.min(n, S - s0);
    out[0] = s0; out[1] = n1; out[2] = sh;
    if (n > n1) { out[3] = 0; out[4] = n - n1; out[5] = sh - S; return 2; }
    return 1;
  }
  // (What the vessel pass draws in a piece, set by whoever asks: pMode 0 the whole layer, 1 the marked cells, 2 their colours only, 3 a pan's
  // strip, cleared first.)
  let pM = null, pLook = null, pMode = 0;
  const gA = [null, 0], oA = [null, 0];
  const pieceFn = () => {
    if (pMode >= 3) clearLayer();
    // (The mesh vessel renderer, when it is on and can draw: a whole draw, a pan's strip or a changed rows' box (4), through the same scissor;
    // a box it cannot draw is drawn whole there by the classic pass.)
    if ((pMode === 0 || pMode >= 3) && meshUse() && meshPass(pM, pLook)) return;
    if (pMode === 1 || pMode === 2) { gA[0] = partVAO; gA[1] = partG; oA[0] = partSVAO; oA[1] = partS; vesselPass(pM, pLook, gA, oA, true, pMode === 2); }
    else { gA[0] = vao; gA[1] = nGen; oA[0] = oneVAO; oA[1] = nSimple; vesselPass(pM, pLook, gA, oA); }
  };
  function eachPiece(x, y, w, h, scissored = false) {
    if (!(w > 0 && h > 0)) { lOffNow[0] = 0; lOffNow[1] = 0; return; }
    const W = fboW, H = fboH;
    const nx = axisPieces(x, w, wo[0] - la[0], W, AXX), ny = axisPieces(y, h, wo[1] - la[1], H, AXY);
    if (!scissored && nx === 1 && ny === 1 && !AXX[0] && !AXY[0] && AXX[1] === W && AXY[1] === H) {
      lOffNow[0] = AXX[2]; lOffNow[1] = AXY[2];
      pieceFn();
      lOffNow[0] = 0; lOffNow[1] = 0;
      return;
    }
    if (!scissored) gl.enable(gl.SCISSOR_TEST);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        gl.scissor(AXX[i * 3], H - AXY[j * 3] - AXY[j * 3 + 1], AXX[i * 3 + 1], AXY[j * 3 + 1]);
        lOffNow[0] = AXX[i * 3 + 2]; lOffNow[1] = AXY[j * 3 + 2];
        pieceFn();
      }
    }
    lOffNow[0] = 0; lOffNow[1] = 0;
    if (!scissored) gl.disable(gl.SCISSOR_TEST);
  }
  // The layer for the view m: [w, h, x, y, follows x, follows y]. Per axis, where the figure's cells (their device box under m, a pixel
  // of margin) take at least the picture's size, the layer is the picture's and its window the picture (x, y 0); where they take
  // less, the layer is their extent and a quarter more, rounded up to 64 px (kept as it is while it holds them and is at most twice
  // what they need, so a zoom step does not make it again) and its window starts a pixel before them, and follows them. Every pixel the vessel pass can
  // write is inside a cell's square, so a window holding the cells holds every pixel the layer would hold that is not empty. Under
  // Vessels lower while pinching the layer is the picture's (its stretch lays the whole picture).
  const LAY = [0, 0, 0, 0, false, false];
  function layoutFor(m) {
    const out = LAY, pw = PW(), ph = PH();
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = false; out[5] = false;
    if (lowK || !cellBox) { out[0] = pw; out[1] = ph; return out; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const x = cellBox[(i & 1) * 2], y = cellBox[1 + (i >> 1) * 2];
      const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5];
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    for (let k = 0; k < 2; k++) {
      const lo = k ? y0 : x0, hi = k ? y1 : x1, cur = k ? fboH : fboW, P = k ? ph : pw;
      const a = Math.floor(lo) - 1, ext = Math.ceil(hi) + 1 - a, need = Math.ceil(ext / 64) * 64;
      // (Made again with a quarter more room, so a zoom in without one-pass frames does not make it again every frame.)
      const L = cur >= need && cur < P && cur <= need * 2 ? cur : Math.ceil(ext * 1.25 / 64) * 64;
      if (!(ext > 0) || L >= P) { out[k] = P; continue; }
      out[k] = L; out[k + 2] = a; out[k + 4] = true;
    }
    return out;
  }
  // Lays the layer out as layoutFor gave it, its window where the figure is now and no wrap.
  function layOut(L) {
    ensureFBO(L[0], L[1]);
    la[0] = L[2]; la[1] = L[3]; lAnch[0] = L[4]; lAnch[1] = L[5]; wo[0] = 0; wo[1] = 0;
  }
  function shiftLayer(m, look, dx, dy) {
    // dx, dy: device pixels, y down. The figure moved by (dx, dy) on the screen. A window that follows it moves with it; on an axis
    // where the window is the picture, the layer keeps every texel where it is and the wrap moves.
    const W = fboW, H = fboH;
    if (lAnch[0]) la[0] += dx; else wo[0] = (((wo[0] - dx) % W) + W) % W;
    if (lAnch[1]) la[1] += dy; else wo[1] = (((wo[1] - dy) % H) + H) % H;
    // The uncovered strips (screen, y down, across the window): cleared, then drawn as a whole draw draws them.
    const sx = !lAnch[0] && dx !== 0, sy = !lAnch[1] && dy !== 0;
    if (!sx && !sy) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
    gl.viewport(0, 0, W, H);
    gl.enable(gl.SCISSOR_TEST);
    pM = m; pLook = look; pMode = 3;
    if (sx) { if (dx > 0) eachPiece(0, la[1], dx, H, true); else eachPiece(W + dx, la[1], -dx, H, true); }
    if (sy) { if (dy > 0) eachPiece(la[0], 0, W, dy, true); else eachPiece(la[0], H + dy, W, -dy, true); }
    gl.disable(gl.SCISSOR_TEST);
  }
  // The binned cells on the CPU, and (built when first asked) each vessel row's cells: a row's attributes can change
  // only the pixels of the cells that list it, since each pixel is drawn from its own cell's list alone.
  let cellsCPU = null, entCPU = null, rowCells = null, bloodCPU = null;
  // The rows whose radii changed since the layer was last drawn: a partial redraw has to include them all.
  const radRows = new Set();
  // The cells holding join entries a geometry patch wrote again (patchGeometry): drawn again whole with the next partial draw or pan.
  let patchMark = null, patchK = 0;
  const clearMarks = () => { radRows.clear(); patchMark = null; patchK = 0; };
  let rowsStatus = '';
  const refuse = (why) => { rowsStatus = why; tally(counts.refused, why); if (gpuProbe.on) gpuProbe.note(COUNTED.rowsRefused + why); return false; };
  const radCovered = (rows) => {
    if (!radRows.size) return true;
    if (!rows) return false;
    for (const r of radRows) if (!rows.includes(r)) return false;
    return true;
  };
  // Every vessel's attributes as last sent (tubeNow) and as the layer shows them (tubeDrawn: copied at each draw, whole or
  // partial, since the rows a partial draw is given hold every change): a row whose lumen colours alone changed is
  // recoloured (tintPass) rather than drawn again (see splitRows).
  const ROW_W = TUBE_TEXELS * 4, tubeNow = new Float32Array(nTubes * ROW_W);
  let tubeDrawn = null;
  const drawnNow = () => (tubeDrawn ||= new Float32Array(tubeNow.length)).set(tubeNow);
  // The changed rows' cells: drawn again whole (shape), and the others recoloured (tint), with the cells to do each in.
  const ROW_SPLIT = { shape: [], tint: [] };   // (kept: splitRows fills it again each time)
  // (The two lists of cells, kept and filled again: their marks are pooled in each, the picture of a partial draw.)
  const PART_A = { mark: null, k: 0 }, PART_B = { mark: null, k: 0 }, PARTS = { part: PART_A, tintPart: PART_B };
  // (draw()'s changed rows under the mesh renderer: their cells' marks and count, written in place.)
  const MESH_PARTS = { mark: null, k: 0 };
  function rowParts(rows) {
    const { shape, tint } = splitRows(rows, tubeNow, tubeDrawn, ROW_W, radRows, ROW_SPLIT);
    const part = cellsOfRows(shape, null, PART_A);
    if (patchK) for (let c = 0; c < nCells; c++) if (patchMark[c] && !part.mark[c]) { part.mark[c] = 1; part.k++; }
    cellsOfRows(tint, part.mark, PART_B);
    return PARTS;
  }
  // The mesh's partial draw: the marked cells' device boxes, on a grid of MT px tiles, as runs of tiles along each tile row (at most
  // MR_MAX; more are drawn as one box round them all), each cleared and drawn by the mesh pass through its scissor. Pixels of a tile
  // outside the marked cells are drawn as they were (nothing they read changed).
  const MT = 128, MR_MAX = 12, MR = new Int32Array(MR_MAX * 4);
  let mTiles = new Uint8Array(0);
  function meshRects(m, mark) {
    const x0w = la[0], y0w = la[1], W = fboW, H = fboH, cols = Math.ceil(W / MT), rowsN = Math.ceil(H / MT);
    if (mTiles.length < cols * rowsN) mTiles = new Uint8Array(cols * rowsN);   // alloc-rare: once per layer size
    mTiles.fill(0, 0, cols * rowsN);
    for (let c = 0; c < nCells; c++) {
      if (!mark[c]) continue;
      const cx = cellsCPU[c * 6], cy = cellsCPU[c * 6 + 1];
      let a = Infinity, b = -Infinity, e = Infinity, f = -Infinity;
      for (let i = 0; i < 4; i++) {
        const x = cx + (i & 1) * CELL, y = cy + (i >> 1) * CELL;
        const px = m[0] * x + m[2] * y + m[4] - x0w, py = m[1] * x + m[3] * y + m[5] - y0w;
        if (px < a) a = px; if (px > b) b = px; if (py < e) e = py; if (py > f) f = py;
      }
      const i0 = Math.max(0, Math.floor((a - 2) / MT)), i1 = Math.min(cols - 1, Math.floor((b + 2) / MT));
      const j0 = Math.max(0, Math.floor((e - 2) / MT)), j1 = Math.min(rowsN - 1, Math.floor((f + 2) / MT));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mTiles[j * cols + i] = 1;
    }
    let n = 0, bx0 = cols, bx1 = -1, by0 = rowsN, by1 = -1;
    for (let j = 0; j < rowsN; j++) {
      for (let i = 0; i < cols; i++) {
        if (!mTiles[j * cols + i]) continue;
        let r = i;
        while (r + 1 < cols && mTiles[j * cols + r + 1]) r++;
        if (i < bx0) bx0 = i; if (r > bx1) bx1 = r; if (j < by0) by0 = j; if (j > by1) by1 = j;
        // (A run the same as the one above it is that one made taller.)
        let same = -1;
        for (let q = 0; q < n; q++) if (MR[q * 4] === i * MT && MR[q * 4 + 2] === (r + 1 - i) * MT && MR[q * 4 + 1] + MR[q * 4 + 3] === j * MT) same = q;
        if (same >= 0) MR[same * 4 + 3] += MT;
        else if (n < MR_MAX) { MR[n * 4] = i * MT; MR[n * 4 + 1] = j * MT; MR[n * 4 + 2] = (r + 1 - i) * MT; MR[n * 4 + 3] = MT; n++; }
        else n = MR_MAX + 1;
        i = r;
      }
    }
    if (n > MR_MAX) { MR[0] = bx0 * MT; MR[1] = by0 * MT; MR[2] = (bx1 + 1 - bx0) * MT; MR[3] = (by1 + 1 - by0) * MT; n = 1; }
    for (let q = 0; q < n; q++) {
      // (Into the window, as screen pixels.)
      MR[q * 4 + 2] = Math.min(MR[q * 4 + 2], W - MR[q * 4]); MR[q * 4 + 3] = Math.min(MR[q * 4 + 3], H - MR[q * 4 + 1]);
      MR[q * 4] += x0w; MR[q * 4 + 1] += y0w;
    }
    return n;
  }
  function meshCellsPass(m, look, mark) {
    const n = meshRects(m, mark);
    if (!n) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
    gl.viewport(0, 0, fboW, fboH);
    gl.enable(gl.SCISSOR_TEST);
    pM = m; pLook = look; pMode = 4;
    for (let q = 0; q < n; q++) eachPiece(MR[q * 4], MR[q * 4 + 1], MR[q * 4 + 2], MR[q * 4 + 3], true);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
  }
  // The marked cells' quads, for partVAO (the general program's) and partSVAO (the one-vessel build's).
  const PART_SPLIT = { gen: new Float32Array(0), one: new Float32Array(0), nGen: 0, nOne: 0 };   // (kept: splitCells writes the marked cells into it)
  function uploadPart(mark) {
    const { gen, one, nGen: g, nOne: o } = splitCells(cellsCPU, nCells, simpleOf, mark, PART_SPLIT);
    keepBuf(partBuf, gen, g * 6); keepBuf(partSBuf, one, o * 6);   // (R05: storage kept, rows rewritten; the kept lists hold more than the cells' floats)
    partG = g; partS = o; partMark = mark;
  }
  // Draws the marked cells again over the layer (written whole: a pixel left empty is written empty).
  function cellsPass(m, look, part) {
    if (part.k) {
      uploadPart(part.mark);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
      gl.viewport(0, 0, fboW, fboH);
      pM = m; pLook = look; pMode = 1;
      eachPiece(la[0], la[1], fboW, fboH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    }
    partCells += part.k;
  }
  // Recolours the marked cells: the pixels a lumen colour reaches (depTex) are drawn again by the vessel pass itself, into
  // the colour target alone (their lumen and joins, flow and the colour-reach mark depend on no colour, so they stand);
  // the rest keep their colour, which depends on no lumen colour. Only for rows whose lumen colours alone changed.
  function tintPass(m, look, part) {
    if (part.k) {
      uploadPart(part.mark);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tintFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTex, 0);
      gl.drawBuffers(ATTACH_COLOR);
      gl.viewport(0, 0, fboW, fboH);
      pM = m; pLook = look; pMode = 2;
      eachPiece(la[0], la[1], fboW, fboH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    }
    tintCells += part.k;
  }
  // The cells that list any of `rows` (marked), but not those marked in `skip`.
  function cellsOfRows(rows, skip, into) {
    if (!rowCells) {
      rowCells = new Map();   // alloc-rare: the rows' cells found once per cell list (a new figure or a patch of cells)
      for (let c = 0; c < nCells; c++) {
        const s0 = cellsCPU[c * 6 + 2], n = cellsCPU[c * 6 + 3];
        let prev = -1;
        for (let e = s0; e < s0 + n; e++) {
          const row = entCPU[e * 8 + 4];
          if (row === prev) continue;   // (a cell's list is grouped by vessel)
          prev = row;
          let a = rowCells.get(row);
          if (!a) rowCells.set(row, a = []);   // alloc-rare: one list per row, when the rows' cells are found
          if (a[a.length - 1] !== c) a.push(c);
        }
      }
    }
    if (!into.mark || into.mark.length < nCells) into.mark = new Uint8Array(nCells);   // alloc-rare: once per size of the cell list (new geometry)
    const mark = into.mark;
    mark.fill(0, 0, nCells);
    let k = 0;
    for (const r of rows) { const list = rowCells.get(r); if (list) for (let i = 0; i < list.length; i++) { const c = list[i]; if (!mark[c] && !(skip && skip[c])) { mark[c] = 1; k++; } } }
    into.k = k;
    return into;
  }
  // The cells of the rows wide enough on screen to read the half-size streaks (halfL): only a lumen at least HALF_R device px in radius
  // does, so the half-size pass has no use over the cells of the narrow rows (the pass had run over every blood square). The squares are
  // kept in their own buffer, drawn again only when the set of wide rows (or the cell lists) changes.
  const halfSet = { changed: false, rows: [], scratch: [], rc: null, cells: null, nc: -1, n: 0, data: null, part: {}, buf: gl.createBuffer(), va: gl.createVertexArray() };   // alloc-rare: made once per renderer
  bloodVAOOf(halfSet.va, halfSet.buf);
  /** The squares' count, over the rows whose widest lumen is at least 0.85 × HALF_R device px at this scale (0: none found; draw whole). halfSet.changed: the set is not the last one's. */
  function halfCellsFor(scale) {
    halfSet.changed = false;
    if (!cellsCPU || !nCells || !(scale > 0)) return 0;
    const lim = 0.85 * HALF_R / scale, now = halfSet.scratch;   // (0.85: under the shader's own 0.9, so no row it reads is left out)
    now.length = 0;
    for (let r = 0; r < rowMaxR.length; r++) if (rowMaxR[r] >= lim) now.push(r);
    const was = halfSet.rows;
    let same = now.length === was.length && halfSet.cells === cellsCPU && halfSet.nc === nCells && halfSet.rc === rowCells && rowCells !== null;
    for (let i = 0; same && i < now.length; i++) if (now[i] !== was[i]) same = false;
    if (same) return halfSet.n;
    // (A different set: its cells found, their squares uploaded, and the set kept to compare with.)
    const part = cellsOfRows(now, null, halfSet.part);
    if (!halfSet.data || halfSet.data.length < part.k * 6) halfSet.data = new Float32Array(part.k * 6 + 600);   // alloc-rare: grows only when the wide rows' cells outgrow the list: a new zoom level or a new figure
    let k = 0;
    for (let c = 0; c < nCells; c++) if (part.mark[c]) { halfSet.data[k * 6] = cellsCPU[c * 6]; halfSet.data[k * 6 + 1] = cellsCPU[c * 6 + 1]; k++; }
    gl.bindBuffer(gl.ARRAY_BUFFER, halfSet.buf);
    gl.bufferData(gl.ARRAY_BUFFER, halfSet.data, gl.DYNAMIC_DRAW, 0, k * 6);
    halfSet.rows = now; halfSet.scratch = was; halfSet.cells = cellsCPU; halfSet.nc = nCells; halfSet.rc = rowCells; halfSet.n = k;
    halfSet.changed = true;
    return k;
  }
  // The vessel pass into the bound vessel framebuffer (draw() clears it first): `gen`, [vertex array, count] of cells for the
  // general program, and `one`, those for the one-vessel build (simpleCells). Each cell is drawn by exactly one of them.
  // (`size`: the target's pixels when it is not the layer's, for the vessels drawn lower while pinching: lowPass.)
  function vesselPass(m, look, gen, one, redraw = false, tint = false, size = null) {
    gl.disable(gl.BLEND);
    if (gen[1]) vesselDraw(prog, m, look, gen[0], gen[1], redraw, tint, size);
    if (one[1] && simpleP) vesselDraw(simpleP, m, look, one[0], one[1], redraw, tint, size);
  }
  function vesselDraw({ p, u }, m, look, va, count, redraw, tint, size = null) {
    vesselSet({ p, u }, m, look, redraw, tint, size);
    gl.bindVertexArray(va);
    // The one-vessel build writes no second-lumen target (8 of the layer's 21 bytes a pixel): in its cells that target is zero
    // already, as every whole draw clears it, a pan moves each pixel with the spot of the figure it shows (so within the same
    // cell), and nothing else writes there. (In a colour-only redraw only the colour target is bound anyway.)
    const skip2 = !tint && p !== prog.p;
    if (skip2) gl.drawBuffers(ATTACH_ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    if (skip2) gl.drawBuffers(ATTACH);
    gl.bindVertexArray(null);
  }
  // The vessel pass's program, uniforms and textures (vesselDraw; and the vessel half of a one-pass build, fuseBind).
  function vesselSet({ p, u }, m, look, redraw, tint, size = null) {
    const M = m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]);
    const SW = size ? size[0] : fboW, SH = size ? size[1] : fboH;   // (the layer's; a one-pass build draws onto the picture: fuseBind)
    gl.useProgram(p);
    UC.m3(u.world, M);
    UC.f2(u.size, SW, SH);
    UC.f1(u.cell, CELL);
    UC.i1(u.morphOn, geo.morph ? (geo.morph.tight ? 2 : 1) : 0);
    if (geo.morph) { UC.i1(u.posBase, geo.morph.posBase); UC.i1(u.joinBase, geo.morph.joinBase); }
    UC.f1(u.px, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    UC.f4(u.invA, m[3] / det, -m[1] / det, -m[2] / det, m[0] / det);
    UC.f2(u.tOff, m[4], m[5]);
    UC.f2(u.lOff, lOffNow[0], lOffNow[1]);
    UC.f2(u.sizeF, SW, SH);
    UC.f1(u.reachU, look.reach);
    UC.f2a(u.shOff, look.shOff);
    UC.f4a(u.casing, look.casing);
    UC.f4a(u.shadow, look.shadow);
    UC.f4a(u.sheenInk, look.sheen);
    UC.f4a(u.shadeInk, look.shade);
    UC.f4a(u.rimInk, look.rim || NO_RIM);
    UC.f4a(u.paperInk, look.paper || NO_RIM);
    UC.f4a(u.ring, look.ring);
    UC.f2a(u.light, look.light);
    UC.f1(u.netAlpha, look.netAlpha);
    UC.i1(u.fx, look.fx ? 1 : 0);
    UC.i1(u.redraw, redraw ? 1 : 0);
    UC.i1(u.tint, tint ? 1 : 0);
    UC.fv1(u.tierAlpha, look.tierAlpha);
    UC.iv1(u.tierGroup, look.tierGroup);
    UC.i1(u.useOrgan, look.organs > 0 && organRect ? 1 : 0);
    UC.f1(u.organK, +look.organs || 0);
    if (organRect) UC.f4a(u.organRect, organRect);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, entTex); UC.i1(u.ent, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, radTex); UC.i1(u.rad, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tubeTex); UC.i1(u.tube, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, organTex); UC.i1(u.organ, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, rmaxTex); UC.i1(u.rmax, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tint ? depTex : depNone); UC.i1(u.depL, 5);
  }
  // ── The seam to the vector vessel renderer (Settings › Display › Vessel renderer › Vector; docs/recommendations/vector-renderer-plan.md 9.H) ──
  // The one place this file hands over. With Vector chosen (the figure and the lobule: ownBuf), draw, drawRows and composite return what the
  // Vector renderer returns before any classic or mesh work; the invalidations (geometry, morph sets, radii, bends, tubes, blood, dye, the organs
  // and the overlays) are forwarded to it as they come, the data textures and mirrors they fill being its to read (vecShared). The classic layer's
  // four targets and the mesh's depth and scratch are given back while it is on (they are not drawn), the geometry's texture uploads and the organ
  // stack's picture draws are skipped, and all of it is made again, from what is kept here, when another renderer is chosen. Vector is pure: a
  // frame is never drawn by the other two. (Only when it cannot be made at all, no factory or a shader that does not build, the chosen renderer
  // falls to mesh or classic for the page, as mesh does without a depth buffer.)
  // E's accessor (vec-renderer.js header): the picture it draws into, the data textures, the uniforms the programs declare beyond its own, and the
  // parts the other workstreams give (vec-seam.js). Read, never written by it. (The rest are for the compiler and the blood: the mirrors the
  // textures are filled from, the binning, the camera and the look.)
  const PIC = { tex: null, w: 0, h: 0 };
  let vecEnt = null, vecParts0 = null;   // (the entry texture of the morph set in use, null: the figure's own; the parts, made when the renderer is)
  const BLEED_COL = new Float32Array(9);
  let bleedFor = null;
  function vecBleedCol() {
    const key = lastLook;
    if (bleedFor === key && key) return BLEED_COL;
    bleedFor = key;
    try {
      let o = 0;
      for (const t of ['--bleed-spray', '--bleed-fresh', '--bleed-deep']) { const c = cssRGB(t); BLEED_COL[o++] = c[0] / 255; BLEED_COL[o++] = c[1] / 255; BLEED_COL[o++] = c[2] / 255; }
    } catch (e) { caught('veins-gl:vec-bleed', e); /* the tokens are unreadable here: black */ }
    return BLEED_COL;
  }
  const vecShared = {
    nTubes, who, gl, canvas,
    picture() { if (!own || lost) return null; ownSize(); PIC.tex = own.tex; PIC.w = own.w; PIC.h = own.h; return PIC; },
    tex: {
      ent: () => vecEnt || vecPtsTex || entTex, rad: () => radTex, rmax: () => rmaxTex, tube: () => tubeTex, flow: () => flowTex, bend: () => bendTex, dye: () => dyeTex,
      organ: () => organTex,
      noiseT: () => { if (!tileTried) { tileTried = true; tileGPU = createBloodTile(gl); } return tileGPU?.bake() ? tileGPU.tex() : null; },
    },
    uniforms: {
      get organRect() { return organRect; },
      get useOrgan() { return lastLook && lastLook.organs > 0 && organRect ? 1 : 0; },
      // (The blood material's bleed colours, the tokens COMP_FS reads when it is built: read again when the look changes.)
      get vbBleedCol() { return vecBleedCol(); },
    },
    isLost: () => lost,
    get parts() { return (vecParts0 ||= vecParts(gl, VEC_K, vecShared)); },
    software: () => software, scr: () => SCR(),
    get radAll() { return radAll; }, get rmaxAll() { return rmaxAll; }, get axisAll() { return axisAll; }, get tubeNow() { return tubeNow; },
    get flowSent() { return flowSent; }, get dyeSent() { return dyeSent; }, get organRect() { return organRect; },
    get cellsCPU() { return cellsCPU; }, get entCPU() { return entCPU; }, get bloodCPU() { return bloodCPU; }, get nCells() { return nCells; }, get bins() { return binsNow; },
    get cam() { return cam; }, get look() { return lastLook; }, get picW() { return PW(); }, get picH() { return PH(); },
    get lines() { return lines; }, get cath() { return cath; }, get tops() { return tops; }, get stack() { return stack; },
  };
  /** Tells the Vector renderer a change (it takes what it needs of the data; a name it does not have is not an error while it is being built). */
  const vecTell = (name, a, b, c, d, e, f, g) => { const fn = vec?.[name]; if (typeof fn === 'function') { if (name === 'setOrgans') vecKick = true; fn.call(vec, a, b, c, d, e, f, g); } };
  // The classic and mesh targets, to a texel while Vector draws: the layer's colour and the two flow images and the depth, the mesh's depth
  // and stencil and its scratch layers. Made again at the right size by the classic layout the next time it draws (fboW is 0).
  function vecGiveBack() {
    if (lost) return;
    const one = (t, ifmt, fmt, type) => { if (!t) return; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, 1, 1, 0, fmt, type, null); };
    if (fboW) {
      one(baseTex, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE); one(gTex, gl.RGBA16UI, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT);
      one(gTex2, gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT); one(depTex, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    }
    if (meshStOn) { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, SCR()); meshStOn = false; }
    if (meshSt) { gl.bindRenderbuffer(gl.RENDERBUFFER, meshSt); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, 1, 1); }
    one(MG.scrN, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE); one(MG.scrT, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    MG.w = MG.h = MG.sw = MG.sh = -1;
    fboW = fboH = 0; fboOK = false; baseM = null; wrapNone(); lowLive = null; rz.m = null;
    stale = false;
  }
  // Another renderer chosen after Vector: what was skipped is done now, from what was kept (the geometry uploaded whole, the organ covers
  // painted, the layers' pictures baked and shown, the overlays set), and the next picture is a whole one.
  function vecLeave() {
    const was = vec; vec = null;
    if (vecLobule) { vecLobule.release(); vecLobule = null; VL_LAST.n = -1; }
    try { was?.dispose?.(); } catch (e) { caught('veins-gl:vec-dispose', e); /* a renderer going */ }
    if (lost) return;
    if (geoSkipped && binsNow) { geoSkipped = false; api.setGeometry(binsNow); }
    if (vecSkip.paint) { const { shapes, rect, k } = vecSkip.paint; vecSkip.paint = null; api.paintOrgans(shapes, rect, k); }
    if (stack) {
      for (const M of vecSkip.bakes) {
        for (const a of M.values()) { const job = stack.bake(a.slot, a.name, a.groups, a.rect, a.scale, a.at); if (job) { try { while (!job.step(Infinity)); } finally { job.drop(); } } }
        M.clear();
      }
      for (let slot = 0; slot < 2; slot++) if (vecSkip.commits[slot]) { stack.commit(slot, vecSkip.commits[slot]); vecSkip.commits[slot] = null; }
      plateTell();
    }
    if (vecSkip.overlay && overOK) { const { groups, names } = vecSkip.overlay; vecSkip.overlay = null; api.overlay.set(groups, names); }
    fboOK = false; stale = true; movedAll = true; figVer++; texVer++;
  }
  // A morph set made while Vector draws: its binning kept, its entry texture (the points the strips read, and the morph's frame rows after them)
  // and the Vector renderer's own set. (A classic one has the binning too, S.bins, and gets what it lacks when it is used under Vector.)
  const vecEntOf = (bins) => {
    const t = dataTex(gl);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, bins.rows, 0, gl.RGBA, gl.FLOAT, bins.ent);
    return t;
  };
  // The figure's own binning for Vector: the mesh's points texture (each vessel row's points, N_SAMPLES / 2 texels a row, two points a texel, posBase 0),
  // made from the entries the way the mesh does (veins-mesh-data pointsFromEntries) and sent when the binning is. The classic entry texture holds
  // the cell lists' entries, which are not points. Its own record, so the mesh's cache is left alone.
  let vecPtsTex = null;
  const VPTS = {};
  function vecPointsUpload() {
    if (lost || !entCPU || !cellsCPU) return;
    pointsFromEntries(entCPU, cellsCPU, nCells, nTubes, VPTS);
    if (!vecPtsTex) vecPtsTex = dataTex(gl);
    gl.bindTexture(gl.TEXTURE_2D, vecPtsTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, VPTS.rows, 0, gl.RGBA, gl.FLOAT, VPTS.pts, 0);
    if (gpuProbe.on) gpuProbe.note('uploaded: vector points', VPTS.rows * ENT_W * 16 / 1024);
  }
  const vecMadeSet = (bins) => ({ owner: api, bins, ent: vecEntOf(bins), vecSet: vec.makeMorphSet?.(bins) ?? null, vecGen });
  const vecCurSet = () => { for (const S of vecSets) if (S.ent === vecEnt) return S; for (const S of morphSets) if (S.ent === vecEnt) return S; return null; };
  // A Vector picture was drawn into the kept picture: counted as the other renderers' are, and laid on the canvas with what goes over it.
  function vecLaid(bloodKept = false) {
    pictured(bloodKept);
    directNow = false; ownStale = false;
    if (own && !bloodKept) present();
    vecIdleCheck();
  }
  // Idle frames (vec-renderer.js: the organs prepare their detail levels a few ms at a time, on a frame that has nothing else to draw, and
  // none is drawn until they are): the stage draws nothing on a still figure, so nothing would ever ask for one. After each Vector frame this asks
  // for a next frame while the renderer wants idle work, or the camera's scale or the organs changed (it prepares for the scale, and says so by
  // wanting idle work); that frame is an empty composite, which the renderer takes as idle. When the work is done the whole picture is drawn
  // again, now with the organs.
  const askVecIdle = frameFor('vector-idle');
  let vecIdleOn = false, vecIdleScale = 0, vecKick = false, vecBlood = null;
  function vecIdleCheck() {
    if (vecIdleOn || !vec || lost) return;
    const sc = baseM ? Math.sqrt(Math.abs(baseM[0] * baseM[3] - baseM[1] * baseM[2])) : 1;
    if (sc === vecIdleScale && !vecKick && !vec.idleWanted) return;
    vecIdleScale = sc; vecKick = false; vecIdleOn = true;
    try { askVecIdle(vecIdleRun); } catch (e) { vecIdleOn = false; caught('veins-gl:vec-idle', e); /* (no frames here: node) */ }
  }
  function vecIdleRun() {
    vecIdleOn = false;
    if (!vec || lost || !lastLook) return;
    const f0 = vec.stats?.frames;
    vec.composite(lastLook, vecBlood || NOBLOOD, false);
    const drew = vec.stats?.frames !== f0;
    if (vec.idleWanted) { if (drew) vecLaid(); else vecIdleCheck(); return; }
    // (Done: the levels the organs were waiting for are there. The whole picture again, laid.)
    vec.composite(lastLook, vecBlood || NOBLOOD, true); vecLaid();
  }
  // The lobule's kept picture under Vector (vec-lobule.js, workstream I): a frame where only the blood moved repaints the blood's boxes in the
  // texture the last whole present laid, in place of laying the picture whole. The same record, target and version stamps as the classic keep.
  let vecLobule = null;
  const VL_T = { fbo: null, gen: 0, w: 0, h: 0 }, VL_IDX = { rows: null, lymph: null, n: 0, nLymph: 0, anchored: 0 }, VL_LAST = { rows: new Uint16Array(0), n: -1 };
  const vecLobRead = () => (keepRead() ? KS : null);
  const vecLobTarget = () => { VL_T.fbo = SCR(); VL_T.gen = scr.gen; VL_T.w = scr.w; VL_T.h = scr.h; return VL_T; };
  const vecLobLaid = () => { presents++; if (gpuProbe.on) gpuProbe.note(COUNTED.pictureKept); if (share && !lost) share.present?.(); };
  /** After the Vector composite that ran a plan (frames before: f0): the blood's boxes repainted in the kept picture, true when that was all it needed. */
  function vecBloodKept(f0) {
    if (!vecLobule || !own || !vec.stats || vec.stats.frames === f0 || vec.stats.lastKinds !== 'L') return false;
    const b = vec.lastBloodBoxes?.();
    return !!b && b.n > 0 && vecLobule.keepBlood(b.boxes, b.n, own.tex);
  }
  /** The rows of the lobule's flow data that can show blood, handed to the renderer when they have changed (not every frame: it marks the blood due). */
  function vecBloodRows(flow) {
    if (!vec || who !== 'lobule') return;
    indexFlow(flow, nTubes, VL_IDX);
    const n = VL_IDX.n;
    let same = VL_LAST.n === n;
    for (let i = 0; same && i < n; i++) if (VL_LAST.rows[i] !== VL_IDX.rows[i]) same = false;
    if (same) return;
    if (VL_LAST.rows.length < n) VL_LAST.rows = new Uint16Array(VL_IDX.rows.length);   // alloc-rare: grown with the lobule's rows
    VL_LAST.rows.set(VL_IDX.rows.subarray(0, n)); VL_LAST.n = n;
    vecTell('setBloodRows', VL_IDX.rows, n);
  }
  /** Whether the Vector renderer draws now; makes it, or lets it go, when the choice has changed since the last call. */
  function vecOn() {
    const pick = vesselRenderer();
    if (pick !== vecChoice) { vecChoice = pick; vecFailed = false; }
    const want = ownBuf && pick === 'vector' && !!vecFactory && !lost && !vecFailed;
    if (want === !!vec) return want;
    if (!want) { vecLeave(); return false; }
    try {
      vec = vecFactory(gl, vecShared);
      if (!vec) throw new Error('no renderer');
      // (A renderer that says it lacks a part, or whose programs did not build, draws nothing: not used. Absent either call, it is taken as ready.)
      vec.start?.();
      const why = vec.failure || (typeof vec.status === 'function' && /^(failed|waiting for)/.test(vec.status()) ? vec.status() : '');
      if (why) throw new Error(why);
    } catch (e) {
      try { vec?.dispose?.(); } catch (e2) { caught('veins-gl:vec-dispose', e2); /* it was not made */ }
      vec = null; vecFailed = true;
      console.warn('Veins renderer: the vector vessel renderer could not be made; the chosen renderer\'s own drawing is used instead.', e);
      return false;
    }
    useMorphSet(null);
    vecGiveBack();
    vecGen++;
    if (who === 'lobule' && share && keep) { vecLobule = createVecLobule(gl, { read: vecLobRead, target: vecLobTarget, seq: () => pictureSeq, laid: vecLobLaid }); vecLobule.start(); if (flowSent) vecBloodRows(flowSent); }
    figVer++; texVer++; movedAll = true;
    if (binsNow) { vecPointsUpload(); vecTell('setGeometry', binsNow); }
    vecTell('setOrgans', 'replay', vecOps);
    if (vecOps.overlay) vecTell('setOrgans', 'overlay', vecOps.overlay.groups, vecOps.overlay.names);
    // (G's module takes the lines, the catheter and the ascites' rows from the setters directly, as it is the one that draws them.)
    const ov = vecParts0?.overlays;
    if (ov) {
      if (vecOps.lines !== undefined) ov.setLines?.(vecOps.lines);
      if (vecOps.cath !== undefined) ov.setCath?.(vecOps.cath);
      if (vecOps.spans) ov.setFluidSpans?.(vecOps.spans[0], vecOps.spans[1]);
      if (vecOps.liver !== undefined) ov.setFluidLiver?.(vecOps.liver);
    }
    return true;
  }
  // ── The mesh vessel renderer (Settings › Display › Mesh vessel renderer; docs/veins-mesh-plan.md) ──
  // Each vessel a strip of triangles placed from the textures (veins-mesh.js), each join a patch, drawn tier by tier as the classic shader
  // composites them (by group: behind the organs, the network, lifted): per tier its glows, its shadow, its shape, the selected vessel's lift
  // and the rings where its vessels cross, each pass but the last two over a prepass that keeps the fragment that draws each pixel
  // (veins-mesh-glsl.js). The four targets are written in the classic encodings. Only the figure, only on a GPU; whole draws and pans' strips
  // (a partial redraw, a recolour and a one-pass zoom frame are whole mesh draws; the pinch's lower layer stays classic).
  // (The switch as this renderer last read it: a change makes the next picture a whole draw, frame.js telling the views to draw again.)
  let meshPick = vesselMesh();
  const meshSync = () => {
    if (meshPick === vesselMesh()) return;
    meshPick = vesselMesh(); fboOK = false;
    // (Off, the layer's framebuffer gives its depth and stencil back: the classic passes would carry them through each of theirs.)
    if (!meshPick && meshStOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null); meshStOn = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    }
  };
  const MG = { ent: null, morph: null, dirty: true, pts: {}, jl: {}, patch: {}, tb: {}, pb: {}, tex: null, pj: null, texRows: 0,
    stripVAO: null, patchVAO: null, layVAO: null, rowBuf: null, patchBuf: null, rowCap: 0, patchCap: 0, nIndex: 0,
    w: 0, h: 0, ok: false, scrN: null, scrT: null, sw: 0, sh: 0, kP: 0, ref: 0,
    passes: 0, strips: 0, patches: 0 };   // alloc-rare: made once per renderer
  const MESH_TWO = [null, null], MESH_DS = [gl.DEPTH_STENCIL_ATTACHMENT];   // (the mesh programs a pass sets up, kept)
  const ONE1 = new Float32Array([1]), ONE8 = new Float32Array(8), ZERO1I = new Int32Array([0]);
  const MESH_GLOW_BUF = [gl.COLOR_ATTACHMENT0, gl.NONE, gl.NONE, gl.COLOR_ATTACHMENT3], MESH_COLOR_BUF = [gl.COLOR_ATTACHMENT0, gl.NONE, gl.NONE, gl.NONE];
  const MESH_RING_BUF = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.NONE, gl.NONE];
  const meshUse = () => {
    if (!meshPick) return false;
    if (!meshL) return false;
    if (software) { meshWhy = 'software GL'; return false; }
    if (lost || !entCPU || !cellsCPU) return false;
    if (MG.ok === null) return false;   // (its targets could not be made: meshWhy says why)
    return true;
  };
  // The mesh's own data for the binning in use: each row's points (a texture, the figure's own binning; between the views the morph set's
  // frame rows), the rows that have any, and the joins' patches. Made again when the binning is.
  function meshGeo() {
    if (!MG.dirty && MG.ent === entCPU && MG.morph === geo.morph) return MG;
    pointsFromEntries(entCPU, cellsCPU, nCells, nTubes, MG.pts);
    const list = joinEntryList(cellsCPU, nCells, MG.jl);
    patchGroups(entCPU, list, MG.patch, geo.morph ? geo.morph.joinBase : -1);
    // (The patches' join entries, a texel row each: A, B.)
    if (!MG.pj) MG.pj = dataTex(gl);
    gl.bindTexture(gl.TEXTURE_2D, MG.pj);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, Math.max(1, MG.patch.j.length / 8), 0, gl.RGBA, gl.FLOAT, MG.patch.j.length ? MG.patch.j : ONE8, 0);
    if (!geo.morph) {
      if (!MG.tex) MG.tex = dataTex(gl);
      gl.bindTexture(gl.TEXTURE_2D, MG.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, MG.pts.rows, 0, gl.RGBA, gl.FLOAT, MG.pts.pts, 0);
      if (gpuProbe.on) gpuProbe.note('uploaded: mesh points', MG.pts.rows * ENT_W * 16 / 1024);
    }
    MG.ent = entCPU; MG.morph = geo.morph; MG.dirty = false;
    return MG;
  }
  // The mesh's buffers (made once) and targets (the layer's size): the prepass's depth (read back as a texture), the stencil that lets one
  // fragment draw a pixel once, and the scratch layers (made when first needed).
  function meshTargets() {
    if (!MG.stripVAO) {
      const S = stripIndex(1);
      MG.nIndex = S.nIndex;
      MG.stripVAO = gl.createVertexArray(); MG.rowBuf = gl.createBuffer();
      gl.bindVertexArray(MG.stripVAO);
      const vb = gl.createBuffer(), ib = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, S.attr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, S.index, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.rowBuf);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4, 0); gl.vertexAttribDivisor(1, 1);
      MG.patchVAO = gl.createVertexArray(); MG.patchBuf = gl.createBuffer();
      gl.bindVertexArray(MG.patchVAO);
      const qb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, PATCH_QUAD, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PG_W * 4, 16); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, PG_W * 4, 32); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, PG_W * 4, 48); gl.vertexAttribDivisor(3, 1);
      MG.layVAO = gl.createVertexArray();
      gl.bindVertexArray(MG.layVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      meshSt = gl.createRenderbuffer();
    }
    if (MG.w === fboW && MG.h === fboH && MG.ok && meshStOn) return true;
    MG.w = fboW; MG.h = fboH;
    if (gpuProbe.on) noteAlloc(fboW * fboH * 4 / 1024);
    // (The keys' depth and the stencil, one buffer on the layer's own framebuffer: every pass of a mesh draw, prepass and pass alike, draws
    // into that one framebuffer, so a tiled GPU keeps the layer on chip through the draw rather than storing and loading it at each switch.)
    gl.bindRenderbuffer(gl.RENDERBUFFER, meshSt);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, fboW, fboH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, meshSt);
    const okS = fbComplete(gl, gl.FRAMEBUFFER, 'layer+depth+stencil', fboW, fboH);
    meshStOn = okS;
    if (!okS) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null);
    MG.ok = okS ? true : null;
    if (!MG.ok) { meshWhy = 'no depth and stencil'; console.warn(`Veins renderer: the mesh vessel renderer has ${meshWhy}; the classic vessel pass draws.`); }
    return !!MG.ok;
  }
  const MESH_NONE = [gl.NONE, gl.NONE, gl.NONE, gl.NONE];
  function meshScratch(k) {
    if (MG.sw !== fboW || MG.sh !== fboH) {
      MG.sw = fboW; MG.sh = fboH;
      for (const t of [MG.scrN, MG.scrT]) if (t) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    }
    let t = k ? MG.scrT : MG.scrN;
    if (!t) {
      t = dataTex(gl);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fboW, fboH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (gpuProbe.on) noteAlloc(fboW * fboH * 4 / 1024);
      if (k) MG.scrT = t; else MG.scrN = t;
    }
    return t;
  }
  // Which colour texture the layer's first target is (the layer's own, or a scratch while the network is drawn apart).
  const meshTarget = (t) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  // (The pass's keys' range in the depth target: each pass's below every earlier one's, so its prepass passes over what they left.)
  const KEY_PASSES = 64;
  function meshKeyNext() {
    if (MG.kP >= KEY_PASSES) { gl.depthMask(true); gl.clearBufferfv(gl.DEPTH, 0, ONE1); MG.kP = 0; }
    return 1 - ++MG.kP / KEY_PASSES;
  }
  function meshRefNext() {
    if (MG.ref >= 255) { gl.clearBufferiv(gl.STENCIL, 0, ZERO1I); MG.ref = 0; }
    return ++MG.ref;
  }
  // The world units past a vessel's casing each pass can draw (its strips are widened by it): px, one device pixel in world units.
  function meshPad(pass, look, px) {
    const aa = px * EDGE_PX;
    if (pass <= MP.UP) return 12 * 1.3 + 0.6 + aa + 2 * px;
    if (pass <= MP.SHADOW) return Math.hypot(look.shOff[0], look.shOff[1]) + 2.4 * 1.4 + aa + 2 * px;
    return aa + 2.5 * px + 2 * px;   // (the selection ring's 4 past the wall: selPad, on the selected rows alone)
  }
  // One draw of tier t's strips (and its patches) for a pass.
  function meshDraw(pass, t, base, H, shapeBase, px, look, patches) {
    const tb = MG.tb, pb = MG.pb, pad = meshPad(pass, look, px), SP = meshS, PP = meshPt;
    if (tb.count[t]) {
      const u = SP.u;
      gl.useProgram(SP.p);
      UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.keyBase, base); UC.f1(u.keyH, H); UC.f1(u.keyShape, shapeBase); UC.f1(u.padU, pad); UC.f1(u.selPad, pass >= MP.SHAPE_K ? 4 : 0);
      gl.bindVertexArray(MG.stripVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.rowBuf);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4, tb.start[t] * 4);
      // (A strip writes no second lumen: its pixels' second-lumen target is left as it stands, as the one-vessel build leaves it.)
      if (pass === MP.SHAPE) gl.drawBuffers(ATTACH_ONE);
      gl.drawElementsInstanced(gl.TRIANGLES, MG.nIndex, gl.UNSIGNED_SHORT, 0, tb.count[t]);
      MG.strips += tb.count[t];
    }
    if (patches && pb.count[t]) {
      const u = PP.u;
      gl.useProgram(PP.p);
      UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.keyBase, base); UC.f1(u.keyH, H); UC.f1(u.keyShape, shapeBase);
      gl.bindVertexArray(MG.patchVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
      const o = pb.start[t] * PG_W * 4;
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PG_W * 4, o + 16);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, PG_W * 4, o + 32);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, PG_W * 4, o + 48);
      if (pass === MP.SHAPE) gl.drawBuffers(ATTACH);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pb.count[t]);
      MG.patches += pb.count[t];
    }
    MG.passes++;
  }
  // The key unit's texture: the prepass's depth when a pass reads it, a texture no framebuffer holds while the prepass writes it.
  // A prepass and its pass for tier t, in the layer's framebuffer: the prepass writes no colour, only its keys as depth (LESS keeps the
  // lowest); returns the keys' base the pass drew with.
  function meshPair(kp, cp, t, px, look, patches, bufs) {
    const base = meshKeyNext(), H = 0.999 / KEY_PASSES;
    gl.drawBuffers(MESH_NONE);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    meshDraw(kp, t, base, H, 0, px, look, patches);
    meshColour(cp, t, base, H, 0, px, look, patches, bufs);
    return base;
  }
  // A pass that draws over the kept keys (depth EQUAL: only the fragment whose key was kept), blended premultiplied, each pixel once.
  function meshColour(cp, t, base, H, shapeBase, px, look, patches, bufs) {
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.EQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.NOTEQUAL, meshRefNext(), 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); gl.stencilMask(0xff);
    gl.drawBuffers(bufs);
    meshDraw(cp, t, base, H, shapeBase, px, look, patches);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
  }
  // The crossing ring of tier t: a mark pass sets the stencil (to M) where the tier's shape kept a lumen (its key under the lumens' top, depth
  // GREATER), then the ring draws where it is marked and the kept lumen's z is under the crossing vessel's (depth LESS), each pixel once (INCR).
  function meshRing(t, sb, px, look) {
    const H = 0.999 / KEY_PASSES;
    if (MG.ref >= 253) { gl.stencilMask(0xff); gl.clearBufferiv(gl.STENCIL, 0, ZERO1I); MG.ref = 0; }
    const M = ++MG.ref;
    MG.ref++;   // (M + 1: what a ringed pixel becomes, kept from every later pass's reference)
    gl.drawBuffers(MESH_NONE);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.GREATER); gl.depthMask(false);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.ALWAYS, M, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); gl.stencilMask(0xff);
    meshDraw(MP.MARK, t, sb, H, sb, px, look, false);
    gl.depthFunc(gl.LESS);
    gl.stencilFunc(gl.EQUAL, M, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawBuffers(MESH_RING_BUF);
    meshDraw(MP.RING, t, sb, H, sb, px, look, false);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
  }
  // A scratch layer laid over the layer's colour, weighed by k.
  function meshLay(tex, k) {
    gl.drawBuffers(MESH_COLOR_BUF);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(meshL.p);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, tex); UC.i1(meshL.u.uT, 7); UC.f1(meshL.u.uK, k);
    gl.bindVertexArray(MG.layVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    MG.passes++;
  }
  // The mesh's whole vessel pass into the layer (fbo bound, its viewport; the caller's scissor, if any, kept): false when it cannot draw, and
  // the classic pass draws instead.
  function meshPass(m, look) {
    if (!meshTargets()) return false;
    const G = meshGeo();
    const tb = tierBuckets(tubeNow, G.pts.on, nTubes, G.tb), pb = patchesByTier(G.patch.data, G.patch.count, tubeNow, G.pb, PG_W, PG_M);
    // (The rows and patches by tier, into buffers kept at their largest.)
    gl.bindBuffer(gl.ARRAY_BUFFER, MG.rowBuf);
    if (MG.rowCap < tb.rows.length) { MG.rowCap = tb.rows.length; gl.bufferData(gl.ARRAY_BUFFER, MG.rowCap * 4, gl.DYNAMIC_DRAW); }
    if (tb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, tb.rows, 0, tb.n);
    gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
    if (MG.patchCap < pb.n * PG_W) { MG.patchCap = Math.max(pb.n * PG_W, PG_W); gl.bufferData(gl.ARRAY_BUFFER, MG.patchCap * 4, gl.DYNAMIC_DRAW); }
    if (pb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, pb.data, 0, pb.n * PG_W);
    MG.passes = 0; MG.strips = 0; MG.patches = 0;
    // (Both programs' uniforms and textures as the classic pass's, then the points: the figure's own texture, or the morph set's frame rows.)
    MESH_TWO[0] = meshPt; MESH_TWO[1] = meshS;
    for (const P of MESH_TWO) {
      vesselSet(P, m, look, false, false);
      if (!geo.morph) { UC.i1(P.u.posBase, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, MG.tex); }
      UC.f1(P.u.reachU, look.reach);
      UC.i1(P.u.pjTex, 9);
    }
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, MG.pj);
    const px = 1 / Math.max(1e-6, Math.hypot(m[0], m[1]));
    // (The depth and stencil, cleared within the caller's scissor.)
    gl.depthMask(true); gl.stencilMask(0xff);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    MG.kP = 0; MG.ref = 0;
    const TG = look.tierGroup, dim = look.netAlpha < 0.999, ring = !!look.fx && (look.paper?.[3] || 0) > 0;
    for (let g = 0; g < 3; g++) {
      let any = false, sel = false, up = false;
      for (let t = 0; t < MAX_TIERS; t++) if (TG[t] === g && (tb.count[t] || pb.count[t])) { any = true; if (tb.sel[t]) sel = true; if (tb.litUp[t]) up = true; }
      if (!any) continue;
      // (The network while a vessel is focused: drawn apart and laid faded as one, so its vessels do not show through one another; the
      // selected vessel's lift drawn apart too, laid over the network.)
      const toN = g === 1 && dim, lift = g === 1 && sel;
      if (lift || toN) gl.drawBuffers(ATTACH);
      if (lift) { meshTarget(meshScratch(1)); gl.clearBufferfv(gl.COLOR, 0, CLR_F); meshTarget(baseTex); }
      if (toN) { meshTarget(meshScratch(0)); gl.clearBufferfv(gl.COLOR, 0, CLR_F); }
      for (let t = 0; t < MAX_TIERS; t++) {
        if (TG[t] !== g || !(tb.count[t] || pb.count[t])) continue;
        if (tb.lit[t]) meshPair(MP.GLOW_K, MP.GLOW, t, px, look, false, MESH_GLOW_BUF);
        if (look.fx && tb.shadow[t]) meshPair(MP.SHADOW_K, MP.SHADOW, t, px, look, true, MESH_COLOR_BUF);
        const sb = meshPair(MP.SHAPE_K, MP.SHAPE, t, px, look, true, ATTACH);
        if (lift && tb.sel[t]) { meshTarget(MG.scrT); meshColour(MP.LIFT, t, sb, 0.999 / KEY_PASSES, sb, px, look, true, MESH_COLOR_BUF); meshTarget(toN ? MG.scrN : baseTex); }
        if (ring && tb.count[t] > 1) meshRing(t, sb, px, look);
      }
      if (up) for (let t = 0; t < MAX_TIERS; t++) if (TG[t] === g && tb.litUp[t]) meshPair(MP.UP_K, MP.UP, t, px, look, false, MESH_GLOW_BUF);
      if (toN) { meshTarget(baseTex); meshLay(MG.scrN, look.netAlpha); }
      if (lift) meshLay(MG.scrT, 1);
    }
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
    gl.drawBuffers(ATTACH);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    // (The keys and the stencil are not wanted after the draw (the next one clears them): a tiled GPU need not write them out.)
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, MESH_DS);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, null);
    if (gpuProbe.on) {
      gpuProbe.note('vessels: mesh');
      gpuProbe.gauge('vessel renderer', `mesh: ${MG.passes} passes, ${MG.strips} strips, ${MG.patches} patches drawn`);
    }
    return true;
  }
  // A one-pass build ready to draw: the vessel half's uniforms and textures, then the composite's textures (compBind), and the
  // vessel textures the composite half has no unit for put on the units of the layer it no longer reads (base, gbuf, gbuf2:
  // 16 units in all, WebGL2's least). The composite half's own uniforms are set with the composite's (see composite).
  const FUSE_SIZE = [0, 0];   // (the picture's size, for the one-pass build's vessel half: written in place)
  function fuseBind(P, m, look, layer, glow, warm, useStack) {
    FUSE_SIZE[0] = PW(); FUSE_SIZE[1] = PH();
    vesselSet(P, m, look, false, false, FUSE_SIZE);
    compBind(P.u, layer, glow, warm, useStack);
    bindUnit(P.u, 0, entTex, 'ent'); bindUnit(P.u, 1, organTex, 'organ'); bindUnit(P.u, 8, rmaxTex, 'rmax');
  }
  // The picture's own copy (ownBuf): what the canvas would keep with preserveDrawingBuffer. Every composite draws
  // into it and present() copies it whole onto the canvas, so the canvas always holds a whole, current picture, whatever the
  // browser did with the last one. Null where ownBuf is not (the canvas keeps its picture itself).
  const makeOwn = () => { const o = { tex: dataTex(gl), fbo: gl.createFramebuffer(), w: 0, h: 0 }; gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return o; };
  // (Sharper upscaling makes one too, while it is on, and gives it back after: the picture is drawn there and upscaled onto the canvas.)
  let own = ownBuf ? makeOwn() : null;
  let directNow = false, ownStale = false, noDirect = false, wholeRun = 0, compLook = null, compBlood = null, directFrame = -1;
  // (The picture's and the blood's counts when it was drawn straight onto the canvas, and when a reader last took the canvas, as numbers: -1 for none.)
  let directP = -1, directB = -1;
  let capturedAt = -1, capP = -1, capB = -1, capN = -1;
  // (Sized to the canvas, cleared; true when it was just made, so the next picture is drawn whole.)
  function ownSize() {
    if (own.w === PW() && own.h === PH()) return false;
    own.w = PW(); own.h = PH();
    if (gpuProbe.on) noteAlloc(own.w * own.h * 4 / 1024);
    gl.bindTexture(gl.TEXTURE_2D, own.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, own.w, own.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, own.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, own.tex, 0);
    // (The stencil the one-pass frames mark the vessel cells in: see composite.)
    own.rb ||= gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, own.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, own.w, own.h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, own.rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    return true;
  }
  // The kept picture onto the canvas, every pixel, as it is (no scaling, no filtering).
  // (top: with what is drawn over the figure in this canvas, the labels; false for a picture of the figure alone, snapshot.)
  // (again: a glass over the figure has changed (a card come in, moved or resized) and asks to be laid now: the canvas does not hold it
  // as it is, so the picture is laid again with it even in the frame that drew it straight onto the canvas. Skipped there, the new card's
  // glass waited for the figure's next picture, which a figure at rest never draws: the card showed clear, or solid once its wait ran out
  // (2 Nov 2026, Mohammad's Mac and iPhone: "no blur", every card that opened).)
  // (One present a frame for the hosts' asks (4 Nov 2026, Mohammad's ?perf on a slide change: "kept picture onto the canvas x2", 62 MB copied on
  // the GPU every frame). A host's ask (ask: the labels', the glasses'; the figure's own present is never one) made inside a frame of the
  // scheduler waits for the frame's very end (onFrameFinal). The figure's own present is laid at once, as it always was (38c96ea took the
  // fold of that one out: a frame that touches the canvas without the whole kept picture laid first). At the frame's end the ask is dropped
  // when a picture has been laid since it was made that ran the passes drawn over the figure (presents moved, and tops with it: the
  // labels' and the glasses' own draws are in that picture, so a second copy of the whole kept picture is not needed); else it is laid
  // then. A reader that takes the canvas in the frame (capture) lays a pending one first; an ask outside a frame, or once the frame's
  // end has passed, is laid at once as before.)
  const PRES_FOLD = true;
  let presPend = 0, presFlushing = false, presDoneAt = -1, askPresents = 0, askTops = 0, topsLaid = 0;
  function flushPresent() {
    presDoneAt = frameCount();
    if (!presPend) return;
    const p = presPend;
    presPend = 0;
    if (!lost && presents !== askPresents && (!tops.length || topsLaid !== askTops)) return;   // (laid since the ask, with the passes over it)
    presFlushing = true;
    try { presentNow(true, (p & 2) !== 0); } finally { presFlushing = false; }
  }
  const offPresFinal = onFrameFinal(flushPresent);
  function present(top = true, again = false) {
    // (A present asked for by anything but a host, the figure's own: laid at once. A pending host ask rides on it: its `again` is kept, and
    // flushPresent drops the ask once this has laid the picture.)
    if (presPend && top) again = again || (presPend & 2) !== 0;
    presentNow(top, again);
  }
  // A host's ask (top.ask, stage.js labelHost and stage-glass.js frostHost): present(true, true), folded into the frame's end while a frame of the
  // scheduler runs and its end has not been reached.
  function presentAsk() {
    if (PRES_FOLD && !presFlushing && !lost && framePhase() && presDoneAt !== frameCount()) { presPend |= 3; askPresents = presents; askTops = topsLaid; return; }
    present(true, true);
  }
  function presentNow(top, again) {
    presentSelf(top, again);
    // (Shared: the picture is laid in this renderer's texture; the host lays it over the figure in its own present, which this asks for.)
    if (share && top && !lost) share.present?.();
  }
  function clearAll() { pictured(); if (own?.w) { gl.bindFramebuffer(gl.FRAMEBUFFER, own.fbo); gl.viewport(0, 0, own.w, own.h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER, SCR()); gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); nCells = nBlood = nGen = nSimple = 0; baseM = null; fboOK = false; }
  function presentSelf(top, again) {
    // (Vector lays its own picture when a host asks for the canvas again; without that call, the canvas is laid as below from the kept picture.)
    if (vecNow() && typeof vec.present === 'function') { vec.present(top, again); return; }
    presentLay(top, again);
  }
  function presentLay(top, again) {
    if (replace && !lost && replace.on()) {
      presents++;
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      try { replace.draw(); } catch (e) { console.warn('Veins renderer: what stands in for the figure failed.', e); replace = null; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
      return;
    }
    if ((!own?.w || own.w !== PW() || own.h !== PH()) && !lost && tops.some(soloOn)) {
      // (A pass that stands alone, the lobule's, in a host with no figure picture of its own: the canvas cleared and the passes laid.)
      // (Only while such a pass shows (its on()): the lobule's and its names' passes stay in the list for the rest of the page once the lobule has
      // been opened, so a present asked between a resize and the next composite (a slide's cards resizing the stage, the glass asking) cleared
      // the whole figure to black and laid passes that drew nothing: Mohammad's black frame on the HVPG slide, 4 Nov 2026.)
      presents++;
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (top) { runTops(); gl.bindFramebuffer(gl.FRAMEBUFFER, SCR()); }
      return;
    }
    // (L3, 4 Nov 2026: a pass that stands alone says it is opaque and covers the whole canvas (the lobule, faded in, carried to cover the screen): the
    // figure's kept picture, 31 MB at 3840x2230, would be laid under it and hidden. The canvas is cleared and the passes laid; the kept picture and
    // its stale mark are left as they are, so the figure is whole again, drawn or laid, the frame the pass lets go.)
    if (!lost && tops.some((t) => soloOn(t) && t.opaque?.())) {
      presents++;
      if (directNow) { directNow = false; ownStale = true; }   // (the canvas held the figure's picture itself: it is cleared here, so the figure is drawn whole again)
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (top) { runTops(); gl.bindFramebuffer(gl.FRAMEBUFFER, SCR()); }
      return;
    }
    if (!own?.w || lost) return;
    // (The camera or alpha came on after a picture was drawn straight onto the canvas: that one cannot be moved, so it is drawn again into the kept picture.)
    if (directNow && camOn()) { directNow = false; ownStale = true; }
    // (A canvas resized since the last picture holds nothing current: it is drawn whole by the next composite, which sizes the kept
    // picture first. Copied before that, the old picture would land in a corner of the new canvas.)
    if (own.w !== PW() || own.h !== PH()) return;
    // (A whole picture drawn straight onto the canvas in this frame is there already; outside that frame the kept picture is out of
    // date, so a reader then is given the canvas as it is and the next frame draws the picture whole.)
    if (!directNow && ownStale) {
      // (Asked again in the frame that drew it straight onto the canvas, with nothing drawn since: the canvas holds it whole, the glass
      // over it included, so there is nothing to lay. 2 Nov, his Mac: a reader in the same frame had the picture drawn whole a second time.)
      if (framePhase() && frameCount() === directFrame && directP === pictureSeq && directB === bloodSeq && !(again && top && tops.length)) return;
      // (Asked outside the frame that drew it: the picture is drawn whole again, into the kept picture this time, and laid from there.)
      ownStale = false;
      if (compLook) { noDirect = true; try { api.composite(compLook, compBlood, true); } finally { noDirect = false; } }
      return;
    }
    if (directNow) {
      presents++;
      gl.disable(gl.SCISSOR_TEST);
      overPrep();
      fencePart('organ layer');   // (?perf: the live organ layer's repaint, timed apart)
      overLay(true);
      if (top && tops.length) {
        runTops();
        gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
        fencePart('glasses and labels');
      }
      directNow = false; directP = pictureSeq; directB = bloodSeq;
      return;
    }
    if (gpuProbe.on) gpuProbe.note(COUNTED.present, own.w * own.h * 4 / 1024);
    // (The overlays' stack drawn again, if it changed, before the canvas is bound: drawn after the copy, its own passes stored the canvas and loaded it
    // back in the middle of the present.)
    overPrep();
    fencePart('organ layer');   // (?perf: the live organ layer's repaint, timed apart from the copy below)
    gl.disable(gl.SCISSOR_TEST);
    presents++;
    let laidUnder = false;
    if (camOn() && camDraw(own.tex, false)) { /* (laid: the kept picture under the camera and alpha) */ }
    else if (!up && under && under.on() && underLay()) laidUnder = true;   // (laid: the under picture, the kept one over it)
    else if (!(up && !upLin && upDraw())) {
      // (A picture under the canvas's size with the plain upscale: filtered, as the page's compositor scales a smaller canvas up.)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, own.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, SCR());
      if (up || (own.w === canvas.width && own.h === canvas.height)) noLoad(gl.DRAW_FRAMEBUFFER, true);   // (the copy covers the whole canvas)
      gl.blitFramebuffer(0, 0, own.w, own.h, 0, 0, up ? canvas.width : own.w, up ? canvas.height : own.h, gl.COLOR_BUFFER_BIT, up ? gl.LINEAR : gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    }
    overLay(true);
    fencePart('present copy');
    // (What is drawn over the figure in this canvas, the glasses: on every picture laid, as the overlays are.)
    if (top && tops.length) {
      runTops();
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
      fencePart('glasses and labels');
    }
    if (keep) keepNote(laidUnder && top);
    if (vecLobule) vecLobule.noteLaid(laidUnder && top);
  }
  // The lobule's kept picture (lobule-keep.js). Whether the picture in scr can be kept and repainted in part: the tissue under it, the
  // overlay over it and the vessel layer are all the ones this renderer knows (keepSrc), nothing else moves in it (every pass added here is
  // `still`), and no camera, upscale or stand-in changes how it is laid. Fills KS.
  function keepRead() {
    if (!keepSrc || lost || !keep.ready()) return false;
    for (let i = 0; i < tops.length; i++) if (!tops[i].still) return false;
    if (up || camOn() || directNow || ownStale || (replace && replace.on()) || (over && overShown) || !under || !under.on()) return false;
    if (!own || own.w !== canvas.width || own.h !== canvas.height || PW() !== canvas.width || PH() !== canvas.height) return false;
    if (!keepSrc.read(KS) || KS.dyn || !KS.tex || KS.w !== canvas.width || KS.h !== canvas.height) return false;
    return true;
  }
  // A whole picture was just laid (laid: through the tissue under it, with everything over it): what scr holds now is kept, to be
  // repainted in part until the picture, the tissue, the overlay or the texture changes.
  function keepNote(laid) {
    kept.on = false;
    if (!laid || !scr || !scr.fbo || !keepRead()) return;
    kept.on = true; kept.pic = pictureSeq; kept.gen = scr.gen; kept.v1 = KS.v1; kept.v2 = KS.v2; kept.v3 = KS.v3;
  }
  // A frame where only the blood moved (composite's bloodAlone), the vessel layer's picture as the last whole present had it: the blood's
  // squares repainted in scr from the vessel layer, the tissue and the ductules, then the stage asked to lay it. False when the picture
  // is not kept or anything it is made of has moved: the caller lays the frame whole.
  function keepBlood(m) {
    if (!kept.on || !keepRead()) return false;
    if (kept.pic !== pictureSeq || kept.gen !== scr.gen || kept.v1 !== KS.v1 || kept.v2 !== KS.v2 || kept.v3 !== KS.v3) return false;
    presents++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
    if (nBlood) keep.draw(m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]), canvas.width, canvas.height, bloodCell, bloodVAO, nBlood, own.tex, KS.tex, KS);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    if (gpuProbe.on) gpuProbe.note(COUNTED.pictureKept);
    if (share && !lost) share.present?.();
    return true;
  }
  // What is drawn over the figure in this canvas: each top's prep, then each top's draw, over the list as it stood when the phase began
  // (a top that is added or taken out meanwhile joins the next picture). The lists are kept, one for each depth a draw can lay a picture
  // from inside another's (a glass asking for the canvas), not made again.
  // (A pass that stands alone and shows now: one with no on() shows whenever it is in the list.)
  const soloOn = (t) => !!t.solo && (!t.on || !!t.on());
  const TOP_SNAPS = [[], [], [], []];
  let topDepth = 0;
  function snapTops() {
    const snap = topDepth <= TOP_SNAPS.length ? TOP_SNAPS[topDepth - 1] : [];   // (topDepth counts this call in)
    snap.length = 0;
    for (let i = 0; i < tops.length; i++) snap.push(tops[i]);
    return snap;
  }
  function runTops() {
    topDepth++; topsLaid++;
    try {
      let snap = snapTops();
      for (let i = 0; i < snap.length; i++) { const t = snap[i]; try { t.prep?.(); t.fails = 0; } catch (e) { topFailed(t, e); } }
      snap = snapTops();
      // (Render-cost plan 1, step 3: a pass that stands alone and says it is opaque over the whole canvas (the sinusoid, landed) hides every
      // pass that stands alone under it (the lobule's): those are not laid. Their prep still runs; any doubt in opaque() says no.)
      let cover = -1;
      for (let i = snap.length - 1; i >= 0; i--) { const t = snap[i]; if (t.opaque && soloOn(t)) { let op = false; try { op = !!t.opaque(); } catch { op = false; } if (op) { cover = i; break; } } }
      for (let i = 0; i < snap.length; i++) { const t = snap[i]; if (i < cover && t.solo) continue; try { t.draw(); t.fails = 0; } catch (e) { topFailed(t, e); } }
    } finally { topDepth--; if (topDepth < TOP_SNAPS.length) TOP_SNAPS[topDepth].length = 0; }
  }
  // The under picture, then the kept picture over it by the overlays' program (each pixel its own, premultiplied over). False when that
  // program cannot be made (the kept picture is then copied as it is).
  function underLay() {
    if (layP === null) {
      try { layP = auxTake('lay', true) || finishProgram(gl, startProgram(gl, REUSE_VS, LAY_FS)); } catch (e) { console.warn('Veins renderer: the overlays\' shader could not be made.', e); layP = false; }
    }
    if (!layP) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    try { under.draw(); } catch (e) { console.warn('Veins renderer: what is drawn under the figure failed.', e); under = null; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(layP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, own.tex);
    UC.i1(layP.u.uT, 0);
    gl.bindVertexArray(compVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    return true;
  }
  // The overlays over what present just laid: their stack drawn again first if anything in it changed (organs-gl render), at the
  // canvas's size under the view the vessels were last drawn in (the figure's own transform, before whole() rounds it), scaled to it.
  // (The view the overlays are drawn at, in the canvas's own pixels, into the kept OV_M: With the canvas moved by the vessels' sub-pixel
  // rest (overlay.snap), the overlays are drawn where the vessels are, at whole pixels, and the move takes both to the figure's place:
  // drawn at the figure's own transform, they were off by that rest.)
  const OV_M = new Float64Array(6);
  function overView() {
    const om = overSnap ? whole(overM, WO) : overM;
    // (The overlays are painted at the picture's density, PW × PH: under a phone's 3x canvas that is 2.25x fewer pixels to paint and to blend
    // each present, and they are laid up by a filtered copy as the figure's picture is. The labels and glass stay at the canvas's density.)
    for (let i = 0; i < 6; i++) OV_M[i] = om[i];
    return OV_M;
  }
  function overPrep() {
    if (!over || !overShown || !overM) return;
    const m = overView();
    stack.painter.cssPx = overCss * PW() / canvas.width;
    if (over.stale(m, PW(), PH())) over.render(m, PW(), PH());
  }
  // (prepped: overPrep has run already in this present.)
  function overLay(prepped = false) {
    if (!over || !overShown || !overM) return;
    if (!prepped) overPrep();
    const ob = over.bounds;
    if (camOn()) {
      // (Under a camera the box the overlays' shapes lie in is carried through it, and only that is laid: a full-canvas blend otherwise.)
      if (ob && !camBox(ob)) return;
      try { if (camDraw(over.texture, true, false, ob ? CB : null)) return; } finally { gl.disable(gl.SCISSOR_TEST); }
    }
    // (Only the box the overlays' shapes lie in is laid and blended, and nothing when it is empty: the texture is clear elsewhere.)
    if (ob) {
      const kx = canvas.width / PW(), ky = canvas.height / PH();
      OB[0] = Math.max(0, Math.floor(ob[0] * kx) - 1); OB[2] = Math.min(canvas.width, Math.ceil(ob[2] * kx) + 1);
      OB[1] = Math.max(0, canvas.height - Math.ceil(ob[3] * ky) - 1); OB[3] = Math.min(canvas.height, canvas.height - Math.floor(ob[1] * ky) + 1);
      if (!(OB[2] > OB[0] && OB[3] > OB[1])) return;
      ovBox = OB;
    }
    try {
    if (up && (PW() !== canvas.width || PH() !== canvas.height) && camDraw(over.texture, true, true)) return;
    if (layP === null) {
      // (Started at setup: taken up now if prepare() has not published it yet; waited on only here, as dropping the overlays would blink.)
      try { layP = auxTake('lay', true) || finishProgram(gl, startProgram(gl, REUSE_VS, LAY_FS)); } catch (e) { console.warn('Veins renderer: the overlays\' shader could not be made.', e); layP = false; }
    }
    if (!layP) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (ovBox) { gl.enable(gl.SCISSOR_TEST); gl.scissor(ovBox[0], ovBox[1], ovBox[2] - ovBox[0], ovBox[3] - ovBox[1]); } else gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(layP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, over.texture);
    UC.i1(layP.u.uT, 0);
    gl.bindVertexArray(compVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    } finally { gl.disable(gl.SCISSOR_TEST); ovBox = null; }
  }
  const OB = [0, 0, 0, 0], CB = [0, 0, 0, 0];
  // The overlay bounds `ob` as the box camDraw lays them in: into CB (camLayBox).
  function camBox(ob) {
    const k = cam.k * scn.k;
    return camLayBox(CB, ob, k, scn.k * cam.ex + scn.ex, canvas.height * (1 - k) - (scn.k * cam.ey + scn.ey), canvas.width, canvas.height, PW(), PH());
  }
  let ovBox = null;   // (the box the overlay lay is cut to this present: device px, y up)
  // The camera (k about (ox, oy), canvas px, y down) and alpha the final present lays the figure with: the dive's zoom and every fade of the
  // figure's canvas (a hide, the first framing), as uniforms of one pass, so the glass drawn over the figure in the same present never moves
  // or fades with it. Set by the stage; none (k 1, a 1) is the plain copy, as before.
  const cam = { k: 1, ex: 0, ey: 0, a: 1 };   // (the dive's camera, the same shape as the scene's below: p' = k p + (ex, ey) in canvas px, y down, and the alpha)
  // (The scene camera of a card's zoom, composed after the dive's: p' = k p + (ex, ey) in canvas px, y down. The glass drawn over the figure is
  // not moved by it: it is drawn from the zoomed card's own place. setScene.)
  const scn = { k: 1, ex: 0, ey: 0 };
  const camOn = () => cam.k !== 1 || cam.a !== 1 || scn.k !== 1;
  let camSeq = 0;   // (counts the cameras' changes (setCameraRec, setScene): the glass takes a kept blur as current only with no camera on and none changed)
  let camP = null;
  function camDraw(tex, blend, plain = false, box = null) {
    // (The scene's camera after the dive's, composed in y down as the scene camera records are, and flipped for the framebuffer once, at the end.
    // plain: no camera, a picture of another size laid up over the whole canvas, filtered.)
    const a = plain ? 1 : cam.a, k = plain ? 1 : cam.k * scn.k, ex = plain ? 0 : scn.k * cam.ex + scn.ex, eyUp = plain ? 0 : canvas.height * (1 - k) - (scn.k * cam.ey + scn.ey);
    if (camP === null) {
      try { camP = finishProgram(gl, startProgram(gl, REUSE_VS, CAM_FS)); } catch (e) { console.warn('Veins renderer: the camera shader could not be made.', e); camP = false; }
    }
    if (!camP) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    const sb = box || (plain ? ovBox : null);
    if (sb) { gl.enable(gl.SCISSOR_TEST); gl.scissor(sb[0], sb[1], sb[2] - sb[0], sb[3] - sb[1]); } else gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    if (blend) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else { gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (!(a > 0)) { gl.disable(gl.BLEND); return true; }   // (nothing to lay: the cleared canvas is the picture)
    gl.useProgram(camP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    UC.i1(camP.u.uT, 0);
    UC.f2(camP.u.uDst, canvas.width, canvas.height);
    UC.f3(camP.u.uCam, k, ex, eyUp);
    UC.f1(camP.u.uA, a);
    gl.bindVertexArray(compVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    return true;
  }
  // A shared renderer's texture laid over the canvas as p' = M p + t (see LAYT_FS): top.lay.
  let lyP = null;
  function layTex(tex, a, b, c, d, tx, ty, alpha) {
    if (lyP === null) {
      try { lyP = finishProgram(gl, startProgram(gl, REUSE_VS, LAYT_FS)); } catch (e) { console.warn('Veins renderer: the lobule\'s laying shader could not be made.', e); lyP = false; }
    }
    if (!lyP || !(alpha > 0)) return false;
    const det = a * d - b * c;
    if (!det) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(lyP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    UC.i1(lyP.u.uT, 0);
    UC.f2(lyP.u.uDst, canvas.width, canvas.height);
    UC.f4(lyP.u.uM, d / det, -b / det, -c / det, a / det);
    UC.f2(lyP.u.uTr, tx, ty);
    UC.f1(lyP.u.uA, alpha);
    gl.bindVertexArray(compVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    return true;
  }
  // Sharper upscaling: the kept picture onto the whole canvas by UP_FS (Catmull-Rom, held within its four nearest pixels). False when
  // its program cannot be made (the picture then goes on as a plain copy, a corner of the canvas: setPicture turns the switch off).
  let upP = null;
  function upDraw() {
    if (upP === null) {
      // (Still compiling, started when the switch came on: this frame is the plain filtered copy, never a wait.)
      let P;
      try { P = auxTake('up', false); if (P === undefined) P = finishProgram(gl, startProgram(gl, REUSE_VS, UP_FS)); } catch (e) { console.warn('Veins renderer: the upscale shader could not be made.', e); P = false; }
      if (P === null) return false;
      upP = P;
    }
    if (!upP) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    noLoad(gl.FRAMEBUFFER, true);   // (the upscale writes the whole canvas)
    gl.useProgram(upP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, own.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    UC.i1(upP.u.uT, 0);
    UC.f2(upP.u.uSrc, own.w, own.h);
    UC.f2(upP.u.uDst, canvas.width, canvas.height);
    gl.bindVertexArray(compVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    return true;
  }
  // Pinch frame reuse (REUSE_FS): every: reuse on all but 1 frame in `every` of the one-pass frames (0: off, nothing here runs); the
  // last one-pass picture kept in `rz.tex` with the transform it was drawn in (`rz.m`, null when none can be reused: any other picture
  // since, a new size, a lost context). `reused`: this draw laid the kept picture rather than shading the figure.
  let reuseEvery = 0, reuseOn = false, reuseN = 0, reused = false;
  const rz = { tex: null, fbo: null, w: 0, h: 0, m: null, P: null }, RZM = new Float64Array(6), RZK = new Float64Array(6);
  // A started variant (aux): its program finished and its shaders let go of; null while the driver is still compiling it (unless wait),
  // undefined when none was started. Throws a failed build's log.
  function auxTake(k, wait) {
    const st = aux[k];
    if (!st) return undefined;
    if (!wait && pcx && !gl.getProgramParameter(st.p, pcx.COMPLETION_STATUS_KHR)) return null;
    delete aux[k];
    try { return finishProgram(gl, st); } catch (e) { gl.deleteProgram(st.p); throw e; } finally { for (const x of st.sh) gl.deleteShader(x); }
  }
  // A variant published at a free moment (prepare): finished and drawn once into a 1 × 1 target with its own state (exerciseDraw),
  // so its first real frame has no driver work left (Metal builds a pipeline at a program's first draw).
  function publishAux(k, exercise = true) {
    let P;
    try { P = auxTake(k, false); } catch (e) { console.warn(`Veins renderer: the ${k} shader could not be made.`, e); P = false; }
    if (P === null || P === undefined) return;
    if (k === 'lay') layP = P; else if (k === 'up') upP = P; else rz.P = P;
    if (!P || !exercise) return;
    exerciseDraw(gl, () => {
      gl.useProgram(P.p);
      if (k === 'lay') { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
      if (P.u.uT) UC.i1(P.u.uT, 0);
      gl.bindVertexArray(compVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    });
  }
  function reuseKeep(m) {
    if (!rz.tex) { rz.tex = dataTex(gl, gl.LINEAR); rz.fbo = gl.createFramebuffer(); }
    if (rz.w !== PW() || rz.h !== PH()) {
      rz.w = PW(); rz.h = PH();
      gl.bindTexture(gl.TEXTURE_2D, rz.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rz.w, rz.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rz.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rz.tex, 0);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, own ? own.fbo : null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rz.fbo);
    if (!own || (own.w === rz.w && own.h === rz.h)) noLoad(gl.DRAW_FRAMEBUFFER, false);   // (the copy covers the whole target)
    gl.blitFramebuffer(0, 0, rz.w, rz.h, 0, 0, rz.w, rz.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    for (let i = 0; i < 6; i++) RZM[i] = m[i];   // (a copy: m is the frame's scratch)
    rz.m = RZM;
  }
  // The kept picture laid for the transform `m`, when it covers the whole canvas; false (nothing drawn) otherwise.
  function reuseDraw(m) {
    if (!rz.m || rz.w !== PW() || rz.h !== PH()) return false;
    const k = reuseMap(rz.m, m, RZK);
    if (!reuseCovers(k, rz.w, rz.h)) return false;
    if (rz.P === null) {
      // (Still compiling, started when reuse came on: this frame is shaded, as without reuse, never a wait.)
      let P;
      try { P = auxTake('reuse', false); if (P === undefined) P = finishProgram(gl, startProgram(gl, REUSE_VS, REUSE_FS)); } catch (e) { console.warn('Veins renderer: the pinch reuse shader could not be made; every zoom frame is shaded.', e); P = false; }
      if (P === null) return false;
      rz.P = P;
    }
    if (!rz.P) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, own ? own.fbo : null);
    gl.viewport(0, 0, PW(), PH());
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
    gl.useProgram(rz.P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rz.tex); UC.i1(rz.P.u.uT, 0);
    UC.f2(rz.P.u.uSize, PW(), PH());
    UC.m3(rz.P.u.uMap, m3put(SCRATCH.world, k[0], k[1], k[2], k[3], k[4], k[5]));
    gl.bindVertexArray(compVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    if (own) present();
    pictured();
    return true;
  }
  // Vessels lower while pinching (Settings, Figure performance; off by default): a zoom frame under a hand draws the vessel layer at
  // `lowK` of its width and height (0.71: half its pixels) into targets of its own (lw), then stretches each into the layer's: the
  // colour filtered, the flow targets and the lumen mask as they are (integers cannot be filtered; the mask stays 0 or 1). The
  // composite then lays the layer as after any whole draw, with its own shader. Such a layer is not the exact one (`soft`), so the
  // next draw at this view draws it whole: the view a pinch stops at is always shaded at Full. lowK 0: nothing here runs.
  // (Pinch frame reuse, when on, takes the zoom frames instead: its kept picture is laid only over a layer left empty.)
  // (Quality tiers, adapt-tier.js (R07): the targets are made once at the top tier's size (lowTop) and every tier draws inside them
  // at its own viewport, so stepping between tiers allocates nothing; prepLow makes them between frames, before the first is needed.)
  let lowK = 0, lowOn = false, lowMorph = false, soft = false, lowTop = 0, lowMade = 0;   // (lowMade: how often the tiers' targets were made, R10)
  // (R10, review pass 2: a tier frame's small targets are read by the composite as they are (lowLive: the tier's [w, h] while they hold
  // the layer), not stretched into the full-size layer by three blits first: the layer's full-size writes are gone from a tier frame. Any
  // other draw into the layer lets them go (draw, layOut, trim). The new path only, no off switch.)
  // (lowLive is declared with fboOK, above: the layer's own functions use it.)
  const lw = { fbo: null, tex: null, w: 0, h: 0 };
  function lowTargets(w, h) {
    if (!lw.fbo) { lw.fbo = gl.createFramebuffer(); lw.tex = ATTACH.map(() => dataTex(gl)); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, lw.fbo);
    // (R10, review pass 2: grown only, never remade because the canvas changed size: a resolution step or Figure resolution's moving
    // share mid-move had remade every target at its next zoom frame. They are made at the top tier's share of the canvas, rounded up
    // to 64 px, and kept while the canvas is smaller; each tier draws in its corner (viewport and scissor, lowPass).)
    const needW = Math.max(w, Math.round(PW() * lowTop)), needH = Math.max(h, Math.round(PH() * lowTop));
    if (lw.w < needW || lw.h < needH) {
      lw.w = Math.ceil(needW / 64) * 64; lw.h = Math.ceil(needH / 64) * 64; lowMade++;
      const fmt = layerFmt();
      lw.tex.forEach((t, i) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, fmt[i][0], lw.w, lw.h, 0, fmt[i][1], fmt[i][2], null); gl.framebufferTexture2D(gl.FRAMEBUFFER, ATTACH[i], gl.TEXTURE_2D, t, 0); });
      // (the colour read filtered by the composite on a tier frame, as the blit up filtered it; the integers stay nearest)
      { gl.bindTexture(gl.TEXTURE_2D, lw.tex[0]); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR); }
      gl.drawBuffers(ATTACH);
    }
  }
  function lowPass(m, look) {
    const w = Math.max(1, Math.round(PW() * lowK)), h = Math.max(1, Math.round(PH() * lowK));
    lowTargets(w, h);
    // (Only the tier's corner of the targets is cleared and drawn.)
    if (lw.w > w || lw.h > h) { gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h); clearLayer(); }
    // (The transform to the small target's pixels, each axis by its own share, so the stretch lays every pixel back where it belongs.)
    const kx = w / PW(), ky = h / PH();
    gl.viewport(0, 0, w, h);
    const cleared = lw.w > w || lw.h > h;
    gl.disable(gl.SCISSOR_TEST);
    if (!cleared) clearLayer();
    LM[0] = m[0] * kx; LM[1] = m[1] * ky; LM[2] = m[2] * kx; LM[3] = m[3] * ky; LM[4] = m[4] * kx; LM[5] = m[5] * ky;
    LOWLIVE[0] = w; LOWLIVE[1] = h;
    gA[0] = vao; gA[1] = nGen; oA[0] = oneVAO; oA[1] = nSimple;
    vesselPass(LM, look, gA, oA, false, false, LOWLIVE);
    lowLive = LOWLIVE; wrapNone();   // (R10: read as they are by the composite, compBind)
  }
  function lowFree() {
    lowLive = null;
    if (!lw.fbo || lost) return;
    for (const t of lw.tex) gl.deleteTexture(t);
    gl.deleteFramebuffer(lw.fbo);
    lw.fbo = lw.tex = null; lw.w = lw.h = 0;
  }
  // A texture on its unit, and the unit named in the program's uniform.
  function bindUnit(U, unit, tex, name) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); UC.i1(U[name], unit); }
  // The composite's textures, each on its unit (U: the program's uniforms; the flags: which of the layers it lays this frame).
  function compBind(U, layer, glow, warm, useStack) {
    UC.i2(U.lA, la[0], la[1]); UC.i2(U.lWrap, wo[0], wo[1]); UC.i2(U.lSize, fboW, fboH); UC.i1(U.lH, PH());
    // (R10: while the layer is a tier frame's small targets (lowLive), the composite reads them, scaled, in place of the layer.)
    // (Every composite build (COMP_FS) reads lowS; a program without it (the builds' warm-up draw, whose picture is thrown away) is
    // given the layer itself.)
    if (lowLive && !lw.fbo) lowLive = null;
    const L = lowLive && U.lowSz ? lw.tex : null;
    UC.f2(U.lowS, L ? lowLive[0] / fboW : 0, L ? lowLive[1] / fboH : 0); UC.i2(U.lowSz, L ? lowLive[0] : 0, L ? lowLive[1] : 0); UC.f2(U.lowT, L ? lw.w : 1, L ? lw.h : 1);
    bindUnit(U, 0, L ? L[0] : baseTex, 'base'); bindUnit(U, 1, L ? L[1] : gTex, 'gbuf'); bindUnit(U, 2, flowTex, 'flow'); bindUnit(U, 3, radTex, 'rad'); bindUnit(U, 4, tubeTex, 'tube');
    bindUnit(U, 5, dyeTex, 'dye'); bindUnit(U, 6, plates[0]?.tex || baseTex, 'plate0'); bindUnit(U, 7, useStack ? stack.texture : plates[1]?.tex || baseTex, 'plate1'); bindUnit(U, 8, L ? L[2] : gTex2, 'gbuf2'); bindUnit(U, 9, fluidTex, 'fluidMask');
    bindUnit(U, 10, lineLayer.tex, 'lineL'); UC.i1(U.lineOn, layer ? 1 : 0);
    bindUnit(U, 11, glowLayer.tex, 'glowL'); UC.i1(U.glowOn, glow ? 1 : 0);
    bindUnit(U, 13, warmLayer.tex, 'warmL'); UC.i1(U.warmOn, warm ? 1 : 0);
    bindUnit(U, 12, bendTex, 'bend');
    bindUnit(U, 14, halfUse || baseTex, 'halfL'); UC.i1(U.stackOn, useStack ? 1 : 0);   // (the organ layers share plate1's unit; see COMP_FS)
    // (Look D: the baked tile on the noise unit, set by composite. Until it is baked the streaks are look E's sines, which read no texture.)
    if (tileNow) bindUnit(U, 15, tileNow, 'noiseT');
    UC.i1(U.bloodStyle, !styleE && tileNow ? 1 : 2);
  }

  // ── The optional builds published when the driver has them ready (addendum §10.1) ──
  // Polled at each composite, never waited on: a build whose compile and link the driver reports done (COMPLETION_STATUS_KHR)
  // is finished (its status read, which no longer waits), drawn once into a 1 × 1 target of the layer's own formats with the
  // real state (a driver can leave work for a program's first draw), and only then used. Publishing the one-vessel build
  // sorts the cells again and asks for one whole vessel draw.
  let lastLook = null, warmT = null;
  function warmTarget() {
    if (warmT) return warmT;
    const fb = gl.createFramebuffer(), tx = ATTACH.map(() => dataTex(gl)), buf = gl.createBuffer();
    const fmt = layerFmt();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    tx.forEach((t, i) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, fmt[i][0], 1, 1, 0, fmt[i][1], fmt[i][2], null); gl.framebufferTexture2D(gl.FRAMEBUFFER, ATTACH[i], gl.TEXTURE_2D, t, 0); });
    gl.drawBuffers(ATTACH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    // (One cell far off the figure: it lists nothing, so its pixels, none of them inside the target anyway, draw nothing.)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1e6, -1e6, 0, 0, 0, 0]), gl.STATIC_DRAW);
    return (warmT = { fb, tx, buf, va: cellVAO(buf) });
  }
  function warm(k) {
    flushRadii();
    const w = warmTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, w.fb);
    gl.viewport(0, 0, 1, 1);
    gl.disable(gl.BLEND);
    if (k === 'simple' && lastLook && baseM) vesselDraw(simpleP, baseM, lastLook, w.va, 1, false, false);
    if (k === 'fused' && lastLook && baseM) {
      gl.drawBuffers(ATTACH_COLOR);
      for (const P of [fuseGen, fuseOne]) if (P) { fuseBind(P, baseM, lastLook, false, false, false, false); gl.bindVertexArray(w.va); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1); }
      gl.bindVertexArray(null);
      gl.drawBuffers(ATTACH);
    }
    if (k === 'streak') {
      gl.drawBuffers(ATTACH_COLOR);
      gl.useProgram(streakP.p);
      compBind(streakP.u, false, false, false, false);
      gl.bindVertexArray(compVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      if (streakCellP) { gl.useProgram(streakCellP.p); compBind(streakCellP.u, false, false, false, false); gl.bindVertexArray(w.va); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1); gl.bindVertexArray(null); }
      gl.drawBuffers(ATTACH);
    }
    if (k === 'plain') {
      gl.drawBuffers(ATTACH_COLOR);
      for (const [P, va] of [[plain, compVAO], [plainCell, w.va]]) {
        gl.useProgram(P.p);
        compBind(P.u, false, false, false, false);
        gl.bindVertexArray(va);
        if (va === compVAO) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); else gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
      }
      gl.bindVertexArray(null);
      gl.drawBuffers(ATTACH);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
  }
  const anyAux = () => { for (const k in aux) return true; return false; };
  function prepare() {
    if (lost || (!later.length && !freeTasks.length && !anyAux())) return;
    // (Not mid pan or pinch: a finished program's publishing is its status read, a small draw and, for the one-vessel build, every
    // cell uploaded again and the next frame whole. The general programs draw the same picture meanwhile.)
    if (!leftAlone(PUBLISH_QUIET_MS)) return;
    for (const k of Object.keys(aux)) publishAux(k);
    for (const t of freeTasks.slice()) {
      let done = true;
      try { done = t.done(); } catch (e) { caught('veins-gl:3064', e); /* (dropped) */ }
      if (!done) continue;
      freeTasks.splice(freeTasks.indexOf(t), 1);
      try { t.run(); } catch (e) { console.warn('Veins renderer: a warm-up drawn over the figure failed.', e); }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    if (!later.length) return;
    for (const k of [...later]) {
      const sts = startsOf(k);
      if (!sts.every((st) => gl.getProgramParameter(st.p, pcx.COMPLETION_STATUS_KHR))) continue;
      later.splice(later.indexOf(k), 1);
      if (k === 'streak') { finishStreak(); if (streakP) warm('streak'); }
      else if (k === 'heads') finishHeads();
      else if (k === 'plain') { finishPlain(); if (plainCell) warm('plain'); }
      else if (k === 'fused') { finishFuse(); if (fuseGen) warm('fused'); }
      else if (k === 'mesh') { finishMesh(); if (meshL) fboOK = false; }
      else { finishSimple(); if (simpleP) { warm('simple'); uploadCells(); fboOK = false; } }
    }
    if (!later.length) freeShaders();
  }
  // (Started now: the overlays' laying where there are overlays, the resolution fade where the canvas keeps its picture (res-fade-gl).)
  if (overOK) auxStart('lay');
  if (ownBuf && SHADER_WARM) { const t = warmFade(gl); if (t) freeTasks.push(t); }
  const onLost = (e) => { e.preventDefault(); lost = true; UC.reset(); };
  const onRestored = () => UC.reset();
  (hostCv || canvas).addEventListener('webglcontextlost', onLost);
  (hostCv || canvas).addEventListener('webglcontextrestored', onRestored);
  // A software renderer (no usable GPU: the browser draws on the CPU) is told apart so the stage
  // can draw less often and at a lower resolution there.
  // (One test for every view, sw-yield.js softwareGL: the renderer's name, the address's override and the browser's own answer. Never
  // the software path on a real GPU, never the GPU path on a named rasterizer; ?renderer=gpu|software overrides.)
  const software = softwareGL(gl);

  // For the ?perf readout (gpuProbe on): how much of the canvas the squares a frame repaints cover (cells: 6 floats each, the
  // square's corner first; m: world → device pixels).
  function squaresOnScreen(cells, n, m, size) {
    if (!cells) return '';
    const W = PW(), H = PH(), sx = Math.abs(m[0]) + Math.abs(m[2]), sy = Math.abs(m[1]) + Math.abs(m[3]);
    let px = 0, k = 0;
    for (let c = 0; c < n; c++) {
      const x = m[0] * cells[c * 6] + m[2] * cells[c * 6 + 1] + m[4], y = m[1] * cells[c * 6] + m[3] * cells[c * 6 + 1] + m[5];
      const x0 = Math.min(x, x + m[0] * size, x + m[2] * size, x + (m[0] + m[2]) * size), y0 = Math.min(y, y + m[1] * size, y + m[3] * size, y + (m[1] + m[3]) * size);
      const w = Math.min(W, x0 + sx * size) - Math.max(0, x0), h = Math.min(H, y0 + sy * size) - Math.max(0, y0);
      if (w > 0 && h > 0) { px += w * h; k++; }
    }
    return `${k} of ${n}, ${(px / 1e6).toFixed(1)} MP of ${(W * H / 1e6).toFixed(1)}, ${Math.round(sx * size)} px each`;
  }
  // ── Geometry sets: the binnings made ahead for the change between the views (veins-sweep.js) ──
  // A set holds what a binning puts on the GPU (the entry texture with the frame's rows after it, the cells of each build and the blood's)
  // and what the draws read of it on the CPU. One is drawn from at a time: the figure's own (main), or a morph set while the change runs
  // through its stretch (useMorphSet). A set is made and filled at a free moment (makeMorphSet), never in the change's frames.
  const geo = { morph: null };
  let geoMain = null, geoCur = null;
  const geoSave = () => ({ entTex, vao, cellBuf, simpleBuf, oneVAO, bloodVAO, bloodBuf, nGen, nSimple, simpleOf, nBlood, bloodCell, bloodCPU, cellsCPU, entCPU, nCells, cellBox, rowCells, patchMark, patchK, morph: geo.morph });
  function geoLoad(S) {
    ({ entTex, vao, cellBuf, simpleBuf, oneVAO, bloodVAO, bloodBuf, nGen, nSimple, simpleOf, nBlood, bloodCell, bloodCPU, cellsCPU, entCPU, nCells, cellBox, rowCells, patchMark, patchK } = S);
    geo.morph = S.morph;
    figVer++; fboOK = false; movedAll = true;
  }
  function useMorphSet(S) {
    if ((S || null) === geoCur || lost) return;
    if (geoCur) Object.assign(geoCur, geoSave()); else geoMain = geoSave();
    geoLoad(S || geoMain);
    geoCur = S || null;
  }
  const morphSets = new Set();
  const vecSets = new Set();   // (the morph sets made while Vector drew; a classic one is in morphSets)
  let vecSet = null;
  function dropSet(S) {
    if (geoCur === S) useMorphSet(null);
    if (!morphSets.delete(S) || lost) return;
    gl.deleteTexture(S.entTex);
    for (const b of [S.cellBuf, S.simpleBuf, S.bloodBuf]) gl.deleteBuffer(b);
    for (const v of [S.vao, S.oneVAO, S.bloodVAO]) gl.deleteVertexArray(v);
  }

  const api = {
    get lost() { return lost; },
    /** Whether the browser renders WebGL on the CPU. */
    software,
    /**
     * A binning for a stretch of the change between the views (veins-sweep.js binSwept) put on the GPU in a set of its own, for
     * useMorphSet. Made at a free moment: its upload is the size of a whole binning's.
     */
    makeMorphSet(bins) {
      if (lost) return null;
      if (vecOn()) { vecSets.add(vecSet = vecMadeSet(bins)); return vecSet; }
      const was = geoCur;
      useMorphSet(null);
      const v = gl.createVertexArray(), cb = gl.createBuffer();
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
      gl.bindVertexArray(null);
      const sb = gl.createBuffer(), bb = gl.createBuffer(), bv = gl.createVertexArray();
      bloodVAOOf(bv, bb);
      const S = { owner: api, entTex: dataTex(gl), vao: v, cellBuf: cb, simpleBuf: sb, oneVAO: cellVAO(sb), bloodVAO: bv, bloodBuf: bb, nGen: 0, nSimple: 0, simpleOf: null, nBlood: 0, bloodCell: CELL, bloodCPU: null, cellsCPU: null, entCPU: null, nCells: 0, cellBox: null, rowCells: null, patchMark: null, patchK: 0,
        morph: { posBase: bins.posBase, joinBase: bins.joinBase, entRows: bins.entRows, rows: bins.rows, tight: !!bins.tight } };
      morphSets.add(S);
      useMorphSet(S);
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, bins.rows, 0, gl.RGBA, gl.FLOAT, bins.ent);
      if (gpuProbe.on) gpuProbe.note('uploaded: morph set', bins.ent.byteLength / 1024);
      cellsCPU = bins.cells; entCPU = bins.ent; nCells = bins.nCells;
      cellBox = boxOfCells(bins.cells, bins.nCells, CELL);
      uploadCells();
      uploadBlood(bins);
      useMorphSet(was);
      S.bins = bins;
      return S;
    },
    /** Draws from a morph set (null: the figure's own binning again). */
    useMorphSet(S) {
      if (vecOn()) {
        if (S && S.owner !== api) return;
        if (S && S.vecGen !== vecGen) { S.vecSet = vec.makeMorphSet?.(S.bins) ?? null; S.vecGen = vecGen; }
        if (S && !S.ent) S.ent = vecEntOf(S.bins);
        vecEnt = S ? S.ent : null;
        vecTell('useMorphSet', S ? S.vecSet : null);
        return;
      }
      // (A set made while Vector drew has no classic texture: made now from its binning, as it is the same set.)
      if (S && S.owner === api && !S.entTex && S.bins && !lost) { const B = api.makeMorphSet(S.bins); if (B) { morphSets.delete(B); Object.assign(S, B); morphSets.add(S); } }
      if (!S || (S.owner === api && morphSets.has(S))) useMorphSet(S);
    },
    dropMorphSet(S) { if (!S) return; if (S.vecSet && S.vecGen === vecGen) vecTell('dropMorphSet', S.vecSet); if (S.ent) { if (vecEnt === S.ent) vecEnt = null; if (!lost) gl.deleteTexture(S.ent); S.ent = null; } vecSets.delete(S); dropSet(S); },
    /**
     * The frame's points and joins for the morph set in use: `rows` floats laid out as the set's rows after its entries (veins-sweep
     * writePoints / writeJoinNow from posBase). A few rows: the whole vessel layer is drawn again from them.
     */
    setMorphFrame(data) {
      if (vecNow()) {
        const cur = vecEnt && vecCurSet();
        if (cur && !lost) { gl.bindTexture(gl.TEXTURE_2D, vecEnt); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, cur.bins.entRows, ENT_W, cur.bins.rows - cur.bins.entRows, gl.RGBA, gl.FLOAT, data); }
        figVer++; movedAll = true; fboOK = false;
        vecTell('setMorphFrame', data);
        return;
      }
      const M = geo.morph;
      if (!M || lost) return;
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, M.entRows, ENT_W, M.rows - M.entRows, gl.RGBA, gl.FLOAT, data);
      if (gpuProbe.on) gpuProbe.note('uploaded: morph frame', data.byteLength / 1024);
      figVer++; fboOK = false; movedAll = true;
    },
    /** Uploads the binned geometry (from binVeins). */
    setGeometry(bins) {
      figVer++;
      binsNow = bins;
      // (Vector draws: the geometry is compiled by it from the binning; the texture and cell uploads below are for the other two, made when they are chosen.)
      if (vecNow()) {
        useMorphSet(null); vecEnt = null;
        // (The entry texture is Vector's too, its points are read from it; the cell lists and the blood's cells are the classic passes' only.)
        keepRows(entTex, gl.RGBA32F, gl.RGBA, gl.FLOAT, ENT_W, bins.rows || 1, bins.ent.length ? bins.ent : (entNone ||= new Float32Array(ENT_W * 4)));
        cellsCPU = bins.cells; entCPU = bins.ent; nCells = bins.nCells; rowCells = null; geoSkipped = true; movedAll = true;
        vecPointsUpload();
        vecTell('useMorphSet', null); vecTell('setGeometry', bins);
        return;
      }
      geoSkipped = false;
      useMorphSet(null);
      // (R05: a rebinning writes its rows into the entries' kept storage; the texture is made taller only when outgrown.)
      keepRows(entTex, gl.RGBA32F, gl.RGBA, gl.FLOAT, ENT_W, bins.rows || 1, bins.ent.length ? bins.ent : (entNone ||= new Float32Array(ENT_W * 4)));
      cellsCPU = bins.cells; entCPU = bins.ent; nCells = bins.nCells;
      cellBox = boxOfCells(bins.cells, bins.nCells, CELL);
      uploadCells();
      uploadBlood(bins);
      cellsCPU = bins.cells; entCPU = bins.ent; rowCells = null; fboOK = false; movedAll = true; patchMark = null; patchK = 0;
      MG.dirty = true;
    },
    /**
     * Uploads a binning patched in place (binVeins' `patch`: the spans of rows [r0, r1] of the entries that changed; the
     * cells did not), over the binning last uploaded, which it must be.
     */
    patchGeometry(bins) {
      figVer++;
      binsNow = bins;
      if (vecNow()) {
        gl.bindTexture(gl.TEXTURE_2D, entTex);
        for (const [r0, r1] of bins.patch) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, ENT_W, r1 - r0 + 1, gl.RGBA, gl.FLOAT, bins.ent, r0 * ENT_W * 4);
        cellsCPU = bins.cells; entCPU = bins.ent; nCells = bins.nCells; rowCells = null; geoSkipped = true; movedAll = true; vecPointsUpload(); vecTell('patchGeometry', bins);
        return;
      }
      if (geoSkipped) { api.setGeometry(bins); return; }   // (the texture does not hold the binning this patches: it is sent whole)
      useMorphSet(null);
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      for (const [r0, r1] of bins.patch) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, ENT_W, r1 - r0 + 1, gl.RGBA, gl.FLOAT, bins.ent, r0 * ENT_W * 4);   // (read from the rows' own offset: no view)
      // A patch keeps every cell and its list as they were (binVeins): only entries' values changed, and a cell is drawn from its own
      // list alone, so only the cells listing a moved vessel or holding a join entry written again can change. They are marked: the
      // moved vessels as a change of their radii is (drawRows, and a pan's shift, must be given those rows), the joins' cells to be
      // drawn again whole with them (patchMark), and the joins' members as moved (the blood's own pass). A coiling collateral had made
      // every frame of its coil a whole redraw of the vessel layer: with no join (a01bbff9), and then with its joins too, which ease
      // with the widths (his Mac readouts on the catheter slide, 30 Oct: every frame "no kept layer").
      MG.dirty = true;
      if (bins.patchTubes && bins.cells === cellsCPU && bins.ent === entCPU) {
        for (const r of bins.patchTubes) { radRows.add(r); moved[r] = 1; }
        // (Cells whose lists were written in place, a vessel having left or entered them (binVeins relay): drawn again whole, their
        // lists split again between the two programs, and the rows' cells found again from the new lists.)
        if (bins.patchCells?.length) {
          patchMark ||= new Uint8Array(nCells);
          for (const c of bins.patchCells) if (!patchMark[c]) { patchMark[c] = 1; patchK++; }
          rowCells = null;
          uploadCells();
        }
        if (bins.patchBlood) uploadBlood(bins);
        if (bins.patchJoinEnts?.length) {
          patchK += cellsOfJoinEntries(cellsCPU, nCells, bins.patchJoinEnts, patchMark ||= new Uint8Array(nCells)).k;
          for (const r of bins.patchRows || NONE) if (r >= 0 && r < nTubes) moved[r] = 1;
        }
      } else { fboOK = false; movedAll = true; }
    },
    /**
     * A vessel's lumen radius at each of its N_SAMPLES samples. `along`: where its colour stands at each (pressure-along.js
     * alongCurve), or null to mix it by arc.
     */
    setRadii(row, r, along = null) {
      figVer++;
      if (!(row >= 0 && row < nTubes)) return;
      const A = along;
      let mx = -Infinity;
      // (Written into the kept mirror of both textures and sent in ONE call each for the span of rows that changed, as a draw
      // begins (flushRadii): a frame's 174 vessels were 348 small texSubImage2D calls. Pure GPU plan C1.)
      const o = row * N_SAMPLES * 4;
      for (let i = 0; i < N_SAMPLES; i++) {
        const j = Math.min(N_SAMPLES - 1, i + 1);
        radAll[o + i * 4] = r[i]; radAll[o + i * 4 + 1] = r[j];
        radAll[o + i * 4 + 2] = A ? A[i] : -1; radAll[o + i * 4 + 3] = A ? A[j] : -1;
        if (r[i] > mx) mx = r[i];
      }
      rmaxAll[row] = mx; rowMaxR[row] = mx; rMaxDirty = true;
      if (row < radLo) radLo = row;
      if (row > radHi) radHi = row;
      // (A vessel's radii change only the pixels of the cells that list it, as its attributes do: drawRows may stand in
      // for a whole draw when it is given this row.)
      radRows.add(row); moved[row] = 1;
    },
    /** A vessel's axis (N_SAMPLES points, as binned): its signed curvature at each sample, for the flow arrowheads. */
    setBend(row, pts) {
      // (The axis itself, for the arrowheads' quads, whether or not its curvature changed: a vessel moved whole keeps its curvature.)
      const np = Math.min(pts?.length || 0, N_SAMPLES);
      if (row >= 0 && row < nTubes && np >= 2) {
        const o = row * N_SAMPLES * 2;
        let ch = !axisHas[row];
        for (let i = 0; i < N_SAMPLES; i++) {
          const p = pts[Math.min(i, np - 1)], x = +p[0] || 0, y = +p[1] || 0;
          if (axisAll[o + i * 2] !== x || axisAll[o + i * 2 + 1] !== y) { axisAll[o + i * 2] = x; axisAll[o + i * 2 + 1] = y; ch = true; }
        }
        if (!axisHas[row]) { axisHas[row] = 1; axisN++; }
        if (ch) { if (row < axisLo) axisLo = row; if (row > axisHi) axisHi = row; }
      }
      // (A row whose curvature comes out the same, bit for bit, as the texture holds is not sent again: every binning sent every
      // vessel's, 99 rows a frame while one collateral coiled; his Mac readout, 30 Oct. The texture is the same, so the picture is.)
      bendCurvature(pts, bendRow);
      const at = row * N_SAMPLES, inRange = row >= 0 && row < nTubes;
      let same = inRange;
      for (let i = 0; same && i < N_SAMPLES; i++) if (bendRowBits[i] !== bendBits[at + i]) same = false;
      if (same) return;
      if (inRange) bendBits.set(bendRowBits, at);
      if (gpuProbe.on) gpuProbe.note('uploaded: setBend', N_SAMPLES * 4 / 1024);
      figVer++;
      moved[row] = 1;
      gl.bindTexture(gl.TEXTURE_2D, bendTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, N_SAMPLES, 1, gl.RED, gl.FLOAT, bendRow);
    },
    /** Every vessel's attributes: nTubes × TUBE_TEXELS × 4 floats. */
    setTubes(data) {
      figVer++;
      tubesNew = true;
      markRows(data, tubeNow, ROW_W);
      tubeNow.set(data.length > tubeNow.length ? data.subarray(0, tubeNow.length) : data);
      gl.bindTexture(gl.TEXTURE_2D, tubeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TUBE_TEXELS, nTubes, gl.RGBA, gl.FLOAT, data);
    },
    /**
     * The organ covers painted on the GPU straight into their texture (alpha), at `k` texels per world unit over the world rectangle
     * `rect`: `shapes` [{ d (an SVG path) | circle [cx, cy, r], w (a stroke that wide, round-capped and joined; 0: filled) }], their
     * union, as the 2D canvas drew them (the shape drawer's coverage, joined by the larger). Nothing is drawn on the CPU or uploaded.
     */
    paintOrgans(shapes, rect, k) {
      const kept = vecOps.paint ||= { shapes: null, rect: null, k: 0 };
      kept.shapes = shapes; kept.rect = rect; kept.k = k;
      vecSkip.paint = null;
      // (Vector draws the organs from the shapes it is given, not from this texture: nothing is painted, the cover's rectangle is noted, and
      // the shapes are kept for the other two to paint when one is chosen.)
      if (vecNow()) { texVer++; organRect = rect; vecSkip.paint = kept; vecTell('setOrgans', 'paint', shapes, rect, k); return; }
      const W = Math.max(1, Math.round(rect[2] * k)), H = Math.max(1, Math.round(rect[3] * k));
      const fb0 = glGet(gl, gl.FRAMEBUFFER_BINDING), vp0 = glGet(gl, gl.VIEWPORT);   // (gl-state.js: the record, not the driver)
      const shape = createShapeGL(gl), fbo = gl.createFramebuffer(), st = gl.createRenderbuffer(), mesh = ORGAN_MESH;
      try {
        texVer++;
        gl.bindTexture(gl.TEXTURE_2D, organTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, st);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, W, H);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, organTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, st);
        gl.viewport(0, 0, W, H);
        gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
        gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
        // (World → the texture's rows as the sampler reads them: the rect's top at row 0, as a canvas uploaded unflipped put it.)
        const m = [k, 0, 0, -k, -rect[0] * k, H + rect[1] * k], tol = Math.min(0.5, 0.2 / k), all = [true, true, true, true];
        for (const { d, circle, w } of shapes) {
          const polys = circle ? ellipsePoly(circle[0], circle[1], circle[2], circle[2]) : flattenPath(d, tol);
          polyMeshInto(polys, w ? 1 : 0, null, mesh);
          if (w) shape.stroke(mesh, m, [W, H], all, w); else shape.fill(mesh, m, [W, H], all);
          shape.release(mesh);   // (its buffers go at once: the record is written over for the next shape)
        }
        organRect = rect; fboOK = false;
      } finally {
        shape.release(mesh);
        shape.dispose();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb0);
        gl.viewport(vp0[0], vp0[1], vp0[2], vp0[3]);
        gl.deleteFramebuffer(fbo); gl.deleteRenderbuffer(st);
      }
    },
    /**
     * A plate raster on its way in (plate-upload.js): a W × H texture of its own, filled by plateRows and shown by setPlate.
     * The texture shown meanwhile stays as it was.
     */
    plateJob(W, H) {
      const tex = dataTex(gl, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return { tex, W };
    },
    /** Rows y to y + rows of a plate raster on its way in: premultiplied RGBA pixels. */
    plateRows(job, y, rows, pixels) {
      gl.bindTexture(gl.TEXTURE_2D, job.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, job.W, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    },
    /** Shows a filled plate raster (0: the whole plate, 1: a sharper one of the view) over the world rectangle it spans. */
    setPlate(slot, job, rect) {
      if (plates[slot]) gl.deleteTexture(plates[slot].tex);
      plates[slot] = { tex: job.tex, rect };
      texVer++;
      stack?.drop(slot);
      notePlate();
    },
    /** A plate raster given up on its way in. */
    dropJob(job) { gl.deleteTexture(job.tex); },
    /**
     * The peritoneal cavity (the ascites is drawn inside it) over a world rectangle: its half-width about the rectangle's
     * middle at rows evenly from its top to its bottom (anatomy.js cavityHalfWidths).
     */
    setFluidSpans(halfWidths, rect) {
      texVer++;
      const n = halfWidths.length;
      // (R05: the rows written into one kept array, and into the texture's own storage while its width (the shader reads it) holds.)
      const rows = fluidRows?.length === n * 2 ? fluidRows : (fluidRows = new Float32Array(n * 2));
      rows.fill(-1e4); rows.set(halfWidths);
      if (fluidLiver?.length === n) rows.set(fluidLiver, n);
      gl.bindTexture(gl.TEXTURE_2D, fluidTex);
      if (fluidN === n && fluidTexN === n) { gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 2, gl.RED, gl.FLOAT, rows); keptStats.sub++; }
      else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, n, 2, 0, gl.RED, gl.FLOAT, rows); fluidTexN = n; }
      fluidRect = rect; fluidN = n;
    },
    /** The liver's lower edge (in its own frame, before its scale) at the same number of columns evenly across the cavity's rectangle. */
    setFluidLiver(bottoms) {
      texVer++;
      fluidLiver = bottoms;
      if (fluidN !== bottoms.length) return;
      gl.bindTexture(gl.TEXTURE_2D, fluidTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 1, fluidN, 1, gl.RED, gl.FLOAT, bottoms);
    },
    /**
     * The ascites level moved (or its ink faded): the next composite draws again, whole, the cells of the cavity from world row `top`
     * down, the only pixels the fluid can change (its surface, and its depth shading below it), and no whole picture for it. False
     * without a cavity: the caller repaints the whole picture.
     */
    fluidPool(top) {
      if (!fluidRect) return false;
      const [x0, y0, w, h] = fluidRect;
      cellList.reset();
      for (let y = Math.max(y0, top) - CELL; y < y0 + h + CELL; y += CELL) for (let x = x0 - CELL; x < x0 + w + CELL; x += CELL) cellList.push(x, y);
      nPool = cellList.send(poolBuf);
      poolW[0] = x0 - CELL; poolW[1] = Math.max(y0, top) - CELL; poolW[2] = x0 + w + 2 * CELL; poolW[3] = y0 + h + 2 * CELL;
      return true;
    },
    /** R05: how often a dynamic upload rewrote kept GPU storage (sub) and how often it had to grow it (grow, bytes added). */
    keptStats: () => ({ ...keptStats }),
    /** World origins (x, y pairs) of the cells the ascites surface ripples through. */
    setFluidCells(cells) {
      figVer++;
      keepBuf(fluidBuf, cells);   // (R05: every step of a fluid ease rewrote it into new storage)
      nFluid = cells.length / 2;
      { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i + 1 < cells.length; i += 2) { const x = cells[i], y = cells[i + 1]; if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } fluidW[0] = a; fluidW[1] = b; fluidW[2] = c + CELL; fluidW[3] = d + CELL; }
    },
    dropPlate(slot) { texVer++; if (plates[slot]) { gl.deleteTexture(plates[slot].tex); plates[slot] = null; } stack?.drop(slot); notePlate(); },
    hasPlate: (slot) => !!plates[slot] || !!stack?.has(slot) || vecHeld(slot),
    /** The organs' layers (organs-gl.js), or null: a filled raster job (plateJob) is staged for a slot and the set committed whole. */
    organs: stack && {
      stage(slot, name, job, rect, at = 0) { stack.stage(slot, name, job.tex, rect, at); },
      /** A layer's picture painted on the GPU from its organs' shapes (organs-gl bake): a job stepped a frame at a time, then staged. */
      bake: (slot, name, groups, rect, scale, at = 0) => {
        const rec = { slot, name, groups, rect, scale, at };
        vecOps.bakes[slot].set(name, rec); vecSkip.bakes[slot].delete(name);
        vecTell('setOrgans', 'bake', slot, name, groups, rect, scale, at);
        // (Vector draws the layer from its groups: there is no picture to paint, and the job is whole at once. The groups are kept for the other two.)
        if (vecNow()) { vecSkip.bakes[slot].set(name, rec); return VEC_JOB; }
        return stack.bake(slot, name, groups, rect, scale, at);
      },
      dropKept: () => stack.dropKept(),
      stats: () => stack.stats(),
      liveLayers: () => stack.liveLayers(),
      commit(slot, names) {
        texVer++;
        // (One kind of picture at a time: the layers replace the flattened plate of the same slot.)
        if (plates[slot]) { gl.deleteTexture(plates[slot].tex); plates[slot] = null; }
        stack.commit(slot, names);
        notePlate();
      },
      dropStaged: (slot) => { vecOps.bakes[slot].clear(); vecSkip.bakes[slot].clear(); stack.dropStaged(slot); },
      has: (slot) => stack.has(slot),
      /** Whether a slot holds pictures of its own, not only the whole set painted live (organs-gl setLive full). */
      pictured: (slot) => stack.pictured(slot),
      get full() { return stack.full; },
      /** Whether the view's sharper picture is still fading in (organs-gl): the stage draws on until it is whole. */
      get fading() { return stack.fading; },
      /** Organs painted live in the stack, and layers' live masks (organs-gl setLive); the names it lays, in order. */
      get canLive() { return stack.canLive; },
      setLive(organs, masks) { texVer++; const r = stack.setLive(organs, masks); notePlate(); return r; },
      setLiveAll(organs) { texVer++; const r = stack.setLiveAll(organs); notePlate(); return r; },
      setOrder: (names) => { texVer++; return stack.setOrder(names); },
      /** A layer gathered under a live mask now at dy world units down (the bowel's float on the ascites). */
      shift: (name, dy) => { texVer++; return stack.shift(name, dy); },
    },
    /** Per-vessel blood: nTubes × FLOW_TEXELS × 4 floats (see stage.js). */
    setFlow(data) {
      // (Only the span of rows that differ from the last upload goes up, and nothing while they all match, as when paused:
      // flow-rows.js changedRows. The first upload of this context sends every row.)
      const stride = FLOW_TEXELS * 4;
      // (Which rows carry blood now: strength (flow texel 1, z) above 0. A lumen of one is drawn again on a frame the blood's clock moved,
      // so "still lumens left alone" can be on while blood flows; composite.)
      for (let r = 0; r < nTubes; r++) bloodRow[r] = data[r * stride + 6] > 0 || data[r * stride + 8] < 0 ? 1 : 0;
      let lo = 0, hi = nTubes - 1;
      if (!flowSent) { flowSent = Float32Array.from(data.subarray(0, nTubes * stride)); movedAll = true; }
      else {
        markRows(data, flowSent, stride);
        const span = changedRows(data, flowSent, stride, nTubes, SPAN);
        if (!span) { if (gpuProbe.on) gpuProbe.note(COUNTED.flowSame); return; }
        lo = span[0]; hi = span[1];
      }
      // (The rows' floats are read from `data` at their offset: no view of them is made.)
      if (gpuProbe.on) gpuProbe.note('uploaded: setFlow', (hi - lo + 1) * stride * 4 / 1024);
      gl.bindTexture(gl.TEXTURE_2D, flowTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, lo, FLOW_TEXELS, hi - lo + 1, gl.RGBA, gl.FLOAT, data, lo * stride);
    },
    /** Dye along each vessel: nTubes × DYE_BINS floats, or null when there is none. */
    setDye(data) {
      figVer++;
      dyeAny = !!data;
      if (!data) return;
      // (Plan "Holding 120 Hz" §3.7: only the span of rows that changed goes up, as the flow table's; the first upload sends them all.)
      let lo = 0, hi = nTubes - 1;
      if (dyeSent) {
        markRows(data, dyeSent, DYE_BINS);
        const span = changedRows(data, dyeSent, DYE_BINS, nTubes, SPAN);
        if (!span) return;
        lo = span[0]; hi = span[1];
      } else { dyeSent = new Float32Array(DYE_BINS * nTubes); movedAll = true; }
      for (let k = 0, e = Math.min(DYE_BINS * nTubes, data.length); k < e; k++) dyeSent[k] = data[k];
      gl.bindTexture(gl.TEXTURE_2D, dyeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, lo, DYE_BINS, hi - lo + 1, gl.RED, gl.FLOAT, data, lo * DYE_BINS);
    },
    /**
     * Renders the vessel layer (offscreen) and then the picture. `m`: world → device-pixel
     * transform [a, b, c, d, e, f]; `look`: the theme's inks and the per-tier opacity and group.
     */
    draw(m, look, blood, rows = null) {
      if (vecOn()) { flushRadii(); lastLook = look; setBase(m); vecTell('setOverlays', look, m, PW(), PH()); vecBlood = blood; const r = vec.draw(m, look, blood, rows); vecLaid(); return r; }
      flushRadii();
      meshSync();
      counts.draw++;
      for (let i = 0; i < 6; i++) OVER[i] = m[i];
      overM = OVER;
      m = whole(m, WM);
      reused = false; soft = false;
      lastLook = look;
      if (fboPW !== PW() || fboPH !== PH()) fboOK = false;   // (the picture's size changed: the layer is laid out again below)
      const lkSame = lookNow(look);
      const dx = baseM ? m[4] - baseM[4] : 0, dy = baseM ? m[5] - baseM[5] : 0;
      // A pan at the same scale, with nothing else changed since the layer was drawn whole: the layer is moved by those
      // whole pixels and only the strips it uncovers are drawn (see shiftLayer). Otherwise it is drawn whole. `rows`
      // (as drawRows takes them): the vessels whose attributes alone changed since the last draw, when the caller knows
      // them all; the moved layer then has their cells drawn again too (a model playing while the figure is dragged).
      let parts = null;
      // (On an axis where the layer's window follows the figure, a pan of any length moves the window and draws nothing.)
      const near = (lAnch[0] || Math.abs(dx) < fboW / 2) && (lAnch[1] || Math.abs(dy) < fboH / 2);
      // (A move of no whole pixel is a pan of none (8 Nov 2026, iPhone ?perf: 23 whole vessel draws a second at rest with the model running,
      // 17 of them "same place"): a draw asked for with nothing the layer reads changed (its kept layer, size, whole-pixel view, look, tubes
      // and radii as checked here) keeps the layer and draws only the rows named, as drawRows would; the part of a pixel the view moved is
      // laid in the composite (overM), not in the layer. shiftLayer moves nothing for (0, 0).)
      const panAt = fboOK && radCovered(rows) && lkSame && near && sameLin(m, baseM);
      if (panAt && !meshUse() && (rows?.length || patchK)) { parts = rowParts(rows || NONE); if (parts.part.k > nCells * 0.6) parts = null; }
      // (The mesh renderer the same way, as its drawRows does (9 Nov 2026, Mohammad's MacBook Air M5: "tubes changed" whole mesh redraws four
      // times a second at rest, about 70 ms each, from the model's colour updates): the named rows' cells, shape and colour alike, marked
      // and drawn again by the mesh pass through their tiles' scissor over the kept layer; most of the cells, or no rows named, a whole draw.)
      else if (panAt && meshUse() && (rows?.length || patchK) && meshTargets()) {
        const { part: mp, tintPart: mt } = rowParts(rows || NONE);
        let k = mp.k;
        for (let c = 0; c < nCells; c++) if (mt.mark[c] && !mp.mark[c]) { mp.mark[c] = 1; k++; }
        if (k <= nCells * 0.6) { MESH_PARTS.mark = mp.mark; MESH_PARTS.k = k; parts = MESH_PARTS; }
      }
      const pan = panAt && (!(tubesNew || radRows.size || patchK) || parts);
      // (Vessels lower while pinching, when on and Pinch frame reuse is off: a zoom frame under a hand draws the layer lower: lowPass.)
      // (Not with the mesh renderer on: its frames are mesh frames, the classic shader draws none of them (owner, 9 Nov 2026: "No hybrid").)
      if (lowK && lowOn && !meshUse() && !reuseEvery && !pan && baseM && (lowMorph || !sameLin(m, baseM)) && !gpuProbe.skipGL && !lost) {
        if (gpuProbe.on) gpuProbe.note('vessels: lower');
        layOut(layoutFor(m));   // (the picture's size: lowK is on)
        lowPass(m, look);
        setBase(m); keepLook(); tubesNew = false; clearMarks(); drawnNow();
        fboOK = false; stale = false; soft = true; rz.m = null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
        this.composite(look, blood, true);
        return;
      }
      // A zoom or a turn with the one-pass builds (one-pass zoom frames): no vessel pass; the picture draws the vessels itself.
      if (!pan && baseM && !sameLin(m, baseM) && fuseReady() && !meshUse() && bareOf(blood || NOBLOOD) && !gpuProbe.skipGL && !lost) {
        // (Pinch frame reuse, when on: this frame lays the last one-pass picture again, moved to the view now, if it covers the canvas.
        // The layer is left stale and baseM is the view now, so the next picture at this view (the pinch let go) is shaded whole.)
        if (reuseEvery && reuseOn && stale && reuseN % reuseEvery !== 0 && reuseDraw(m)) {
          if (gpuProbe.on) gpuProbe.note('vessels: reused');
          reuseN++;
          setBase(m); fboOK = false; reused = true;
          return;
        }
        if (gpuProbe.on) gpuProbe.note('vessels: one pass');
        // (The layer kept at its size and only cleared: it is laid out again by the whole draw that follows the zoom.)
        if (!fboW || fboPW !== PW() || fboPH !== PH()) layOut(layoutFor(m));
        if (!stale) { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, fboW, fboH); gl.disable(gl.SCISSOR_TEST); clearLayer(); stale = true; }
        wrapNone(); lowLive = null;   // (the layer empty, its texels where they show)
        setBase(m); keepLook(); tubesNew = false; clearMarks(); drawnNow();
        fboOK = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
        fusing = true;
        this.composite(look, blood, true);
        if (reuseEvery && reuseOn) { reuseKeep(m); reuseN = 1; } else rz.m = null;
        return;
      }
      rz.m = null;
      if (!pan) tally(counts.why, !fboOK ? 'no kept layer' : !radCovered(rows) ? 'radii changed' : !lkSame ? 'look changed' : !near ? 'moved too far' : !sameLin(m, baseM) ? 'zoom or turn' : 'tubes changed');
      // (For the ?perf readout: a pan shift, or a whole draw and the first condition that made it one.)
      if (gpuProbe.on) {
        if (pan) gpuProbe.note(COUNTED.pan);
        else {
          gpuProbe.note(COUNTED.whole);
          gpuProbe.note(COUNTED.wholeBy + askedBy());
          gpuProbe.note(COUNTED.wholeWhy + (!fboOK ? 'no kept layer' : !radCovered(rows) ? 'radii changed' : !lkSame ? 'look changed'
            : !near ? 'moved too far' : !sameLin(m, baseM) ? 'zoom or turn' : 'tubes changed'));
        }
      }
      if (pan) {
        shiftLayer(m, look, dx, dy);
        if (parts === MESH_PARTS) { if (parts.k) meshCellsPass(m, look, parts.mark); partCells += parts.k; }
        else if (parts) { cellsPass(m, look, parts.part); tintPass(m, look, parts.tintPart); }
      }
      else {
        layOut(layoutFor(m));
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); lowLive = null;
        gl.viewport(0, 0, fboW, fboH);
        clearLayer();
        pM = m; pLook = look; pMode = 0;
        eachPiece(la[0], la[1], fboW, fboH);
      }
      setBase(m); keepLook(); tubesNew = false; clearMarks(); drawnNow();
      fboOK = true; stale = false;
      if (gpuProbe.on) gpuProbe.gauge('vessel cells, one-vessel program', simpleP ? `${nSimple} of ${nCells}` : 'off');
      if (gpuProbe.on && !meshUse()) gpuProbe.gauge('vessel renderer', `classic: ${!meshPick ? 'switched off in Settings' : meshWhy || 'not ready'}`);
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
      this.composite(look, blood, true);
    },
    /**
     * Redraws only the cells that list the vessel rows given (their attributes changed: a colour, a fade), then the
     * picture as a frame of the moving blood does. The vessel layer ends exactly as draw() would leave it: a pixel is
     * drawn from its own cell's list alone, so a row can change only its own cells. Allowed only when nothing else the
     * vessel pass reads changed since the last whole draw: transform `m` and size (checked here), geometry and organ
     * covers (each clears fboOK) and `look` (the caller checks it); `rows` must include every row whose radii changed. `full`: as composite's. Returns false, drawing nothing, when it
     * cannot stand in for draw() or would cover most of the cells anyway: the caller then calls draw(), with the same rows
     * (nothing they hold is dropped by a refusal). `rowsStatus` says which: 'drawn', or why it was refused (ROWS_REFUSED).
     */
    drawRows(m, look, blood, rows, full = false) {
      if (vecOn()) { flushRadii(); lastLook = look; setBase(m); vecTell('setOverlays', look, m, PW(), PH()); vecBlood = blood; const r = vec.drawRows(m, look, blood, rows, full); if (r) vecLaid(); return r; }
      flushRadii();
      meshSync();
      for (let i = 0; i < 6; i++) OVER[i] = m[i];
      overM = OVER;
      m = whole(m, WM);
      if (!fboOK || !baseM) return refuse('no kept layer');
      if (lost) return refuse('context lost');
      if (fboPW !== PW() || fboPH !== PH()) return refuse('size changed');
      if (!sameLin(m, baseM) || m[4] !== baseM[4] || m[5] !== baseM[5]) return refuse('moved');
      // (The caller's rows have to name every row whose radii changed, which this renderer keeps: they are not dropped here
      // to let a partial draw through.)
      if (!radCovered(rows)) return refuse('radii not listed');
      // (The mesh vessel renderer: the changed rows' cells, as boxes of whole tiles, cleared and drawn again by the mesh pass, every vessel
      // in them, so each pixel there ends as a whole draw leaves it; docs/veins-mesh-plan.md section 4.)
      if (meshUse()) {
        if (!meshTargets()) return refuse('mesh renderer');
        const { part: mp, tintPart: mt } = rowParts(rows);
        const mark = mp.mark;
        let k = mp.k;
        for (let c = 0; c < nCells; c++) if (mt.mark[c] && !mark[c]) { mark[c] = 1; k++; }
        if (k > nCells * 0.6) return refuse('most cells');
        rowsStatus = 'drawn';
        tubesNew = false; clearMarks();
        if (gpuProbe.on) gpuProbe.note(COUNTED.rows);
        meshCellsPass(m, look, mark);
        partCells += k;
        drawnNow();
        if (k) uploadPart(mark);
        this.composite(look, blood, full, k);
        return true;
      }
      // (Rows whose lumen colours alone changed are recoloured, which draws again only the pixels those colours reach:
      // however many cells list them, that costs less than a whole draw. The rest have their cells drawn again whole.)
      const { part, tintPart } = rowParts(rows);
      if (part.k > nCells * 0.6) return refuse('most cells');
      rowsStatus = 'drawn';
      tubesNew = false; clearMarks();
      if (gpuProbe.on) gpuProbe.note(COUNTED.rows);
      cellsPass(m, look, part);
      tintPass(m, look, tintPart);
      drawnNow();
      // (Only the cells drawn again are composited whole; every other cell's pixels outside a lumen read what they read last frame, so
      // the blood's own frame does for them. It was every vessel cell whole for one changed cell. External review, 21 Oct.)
      const both = part.k + tintPart.k;
      if (both) { const mark = part.mark; for (let c = 0; c < nCells; c++) if (tintPart.mark[c]) mark[c] = 1; uploadPart(mark); }
      this.composite(look, blood, full, both);
      return true;
    },
    /**
     * Pinch frame reuse: `every` (0 off, 2 or 3: all but one one-pass frame in that many lay the last picture again) and `now` (a hand
     * is zooming: only then is a picture kept or laid again). Off gives the kept picture's memory back.
     */
    setReuse(every, now) {
      reuseOn = !!now;
      if (!reuseOn) rz.m = null;
      if (every === reuseEvery) return;
      reuseEvery = every; reuseN = 0; rz.m = null;
      if (every) auxStart('reuse');   // (compiling from now, published before the next pinch)
      if (!every && rz.w && !lost) { rz.w = rz.h = 0; gl.bindTexture(gl.TEXTURE_2D, rz.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    },
    /**
     * Sharper upscaling: `size` [w, h], the picture's own size under the canvas's, or null (the picture is the canvas). On, the picture
     * is drawn into a buffer of its own (made here when the renderer has none) and upscaled onto the canvas; off, that buffer
     * goes and the canvas is drawn on directly again. Either change draws the next picture whole.
     */
    setPicture(size, linear = false) {
      // (The size it draws at, if it is not the canvas's: compared as numbers with the one kept, and kept in UP_SIZE, not as a new pair and two strings.)
      const has = !!(size && size[0] > 0 && size[1] > 0 && (size[0] !== canvas.width || size[1] !== canvas.height));
      if ((has === !!up && (!has || (size[0] === up[0] && size[1] === up[1])) && !!linear === upLin) || lost) return;
      if (has) { UP_SIZE[0] = size[0]; UP_SIZE[1] = size[1]; up = UP_SIZE; } else up = null;
      upLin = !!linear;
      if (up && !upLin) auxStart('up');   // (compiling from now: the plain copy until it is published)
      if (up && !own) own = makeOwn();
      if (!up && own && !ownBuf) { gl.deleteTexture(own.tex); gl.deleteFramebuffer(own.fbo); if (own.rb) gl.deleteRenderbuffer(own.rb); own = null; }
      fboOK = false; rz.m = null;
    },
    /**
     * The figure's overlays on the GPU (stage.js syncOver), or null where they cannot be: `set(groups, names)` paints the groups
     * (name → [{ spec (organ-paint readGroup), m (its frame → world) }]) back to front in the order of `names` over the picture at
     * every present, at the canvas's own size; with none, nothing is laid. `stale`: something they paint changed since they were
     * last drawn (a present then draws them again).
     */
    /** The canvas's own context for what is drawn over the figure in it (the glasses): add({ order, prep, draw }) puts one in at the end of
     *  each present (see tops) and returns the call that takes it out. */
    top: ownBuf ? {
      gl, canvas,
      /** The framebuffer the canvas stands in as (null; shared, the texture's): what a pass laid on this renderer's picture binds. */
      screen: SCR,
      /** Lays a texture over the canvas (blended, premultiplied) as p' = M p + t (M = [a b; c d], t = (tx, ty) in canvas px, y down), weighed by alpha: a shared renderer's picture. */
      lay(tex, a, b, c, d, tx, ty, alpha = 1) { if (!lost) layTex(tex, a, b, c, d, tx, ty, alpha); },
      /** Presents the canvas again with everything on it (a shared renderer's picture changed), at once. */
      present: () => present(true, true),
      /** A host's ask (the labels', the glasses'): the same present, folded into the end of the frame it is made in unless a picture with the
       *  passes over the figure is laid since (see presentAsk). For a host that does not read the canvas after the call. */
      ask: presentAsk,
      add(t) { if (t.solo && lyP === null && !lost) { try { lyP = finishProgram(gl, startProgram(gl, REUSE_VS, LAYT_FS)); } catch { lyP = false; } } tops.push(t); tops.sort((a, b) => (a.order || 0) - (b.order || 0)); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; },
      /** What is drawn under the figure in this canvas ({ on(), draw() }, one at a time): drawn first at each present while on() says so,
       *  onto the cleared canvas, the kept picture laid over it. Returns the call that takes it out. */
      under(u) { under = u; auxStart('lay'); return () => { if (under === u) under = null; }; },
      /** The lobule's account of what its picture is made of besides the vessels (lobule-zoom.js; { read(ks) }): with it, and every pass added here
       *  saying it is `still`, a blood-only frame repaints the blood's squares in the picture kept in this canvas's texture. Returns the call that takes it out. */
      keep(src) { keepSrc = src; kept.on = false; keep?.start(); return () => { if (keepSrc === src) { keepSrc = null; kept.on = false; } }; },
      /** What stands in for the whole picture while its on() says so ({ on(), draw() }, one at a time): the canvas cleared and only it
       *  drawn at each present. Returns the call that takes it out. */
      replace(r) { replace = r; return () => { if (replace === r) replace = null; }; },
      /** How many pictures have been laid on the canvas (present): an owner that drew under the figure lays one if a frame laid none. */
      get presents() { return presents; },
      /** Whether the picture is kept in this canvas's texture (keep): a blood-only frame then repaints only the blood's squares in it. */
      get kept() { return kept.on || !!vecLobule?.stamp.on; },
      /** A warm-up of something drawn over the figure here ({ done(), run() }): run once done() says its programs are compiled, at a free
       *  moment of the renderer (prepare: between pictures, not mid gesture), where its small draw may set any state. */
      warmIn(t) { if (t && !lost) freeTasks.push(t); },
      /** Runs fn, which covers the whole canvas (a clear and a whole picture: the resolution fade's seed on a canvas just resized). */
      whole(fn) { fn(); },
    } : null,
    overlay: overOK ? {
      set(groups, names) {
        const kept = vecOps.overlay ||= { groups: null, names: null };
        kept.groups = groups; kept.names = names; vecSkip.overlay = null;
        vecTell('setOrgans', 'overlay', groups, names);
        // (Vector draws the overlays from these groups, not from the painter's stack: none is made, the groups are kept for the other two.)
        if (vecNow()) { overShown = !!groups?.size; vecSkip.overlay = kept; return; }
        if (!over && groups?.size && !lost) over = createOrganStack(gl, { painter: stack.painter });
        if (!over) return;
        over.setOrder(names); over.setLive(groups && groups.size ? groups : null, null); overShown = !!groups?.size;
      },
      /** The groups' kept shapes (stage.js, over-records.js) were written in place: the next present draws them again. */
      touch() { over?.touch(); vecTell('setOrgans', 'overlay-touch'); },
      /** Device px per CSS px of the canvas (a non-scaling stroke's width: organ-paint cssPx). */
      set cssPx(v) { overCss = v; },
      /** Whether the stage moves the canvas by the vessels' sub-pixel rest (stage.js subPixel, below Full): the overlays then go at whole pixels too. */
      set snap(v) { overSnap = !!v; },
      get stale() {
        if (vecNow() || !overShown || !overM || !own?.w) return false;
        stack.painter.cssPx = overCss * PW() / canvas.width;
        return over.stale(overView(), PW(), PH());
      },
      get shown() { return overShown; },
    } : null,
    /** The picture's size: the canvas's, unless Sharper upscaling draws it smaller ([w, h]). */
    picSize() { return [PW(), PH()]; },
    /** Whether the last draw laid the kept picture again (Pinch frame reuse): the next one at that view has to be shaded whole. */
    get reused() { return reused; },
    /**
     * Vessels lower while pinching: `k` (0 off, else the share of the layer's width and height a zoom frame draws it at) and `now` (a
     * hand is zooming: only then). Off gives the small targets back.
     */
    setLow(k, now, top = 0, morphing = false) {
      lowOn = !!now; lowMorph = !!morphing;   // (morphing: the figure morphs between the views, so a frame with the same view is drawn lower too)
      k = k > 0 && k < 1 ? k : 0;
      lowTop = top > 0 && top < 1 ? Math.max(top, k) : k;   // (the quality tiers' top: the targets' size, so a step allocates nothing)
      if (k === lowK) return;
      lowK = k;
      if (!k && !lowTop) lowFree();
    },
    /** The quality tiers' targets made now, at `top` of the layer's width and height (between frames: adapt-tier.js asks once). */
    prepLow(top) {
      if (lost || !(top > 0 && top < 1) || PW() < 1 || PH() < 1) return;
      lowTop = Math.max(lowTop, top);
      lowTargets(Math.round(PW() * top), Math.round(PH() * top));
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
    },
    /** R10: how many times the quality tiers' targets have been made (a tier step makes none). */
    get lowMade() { return lowMade; },
    /** Whether the last draw drew the layer lower (Vessels lower while pinching): the next one at that view has to draw it whole. */
    get soft() { return soft; },
    /** The last drawRows call's outcome: 'drawn', or why it was refused (gpu-probe.js ROWS_REFUSED); '' before any. */
    get rowsStatus() { return rowsStatus; },
    /** Cells redrawn by drawRows so far (whole, and recoloured only), and the cells of the whole layer (for the checks). */
    get partCells() { return partCells; },
    get tintCells() { return tintCells; },
    /** The vessel layer's layout (tests, ?perf): its size, its window's origin (device px, y down), the wrap, and the axes its window follows the figure on. */
    get layerLayout() { return { size: [fboW, fboH], at: [...la], wrap: [...wo], follows: [...lAnch] }; },
    get nCells() { return nCells; },
    /**
     * The picture from the last vessel layer: plate, vessels, blood, dye, bleed. Cheap; runs
     * every animation frame. `blood`: { on, look, origin, clock, originCol, dyeCol, inkLight,
     * inkDark, bleed: [[x0, y0, x1, y1, r0, r1, alpha, kind]] (stage.js bleedSpray) }. Not `full`, it repaints only the cells a
     * lumen can reach (binVeins' `blood`): the moving blood, chevrons, dye and origin colours are drawn only in a lumen, and
     * every other pixel of a vessel cell comes out as the last frame left it. `part`: that many cells of partVAO first, whole: the
     * cells drawRows drew again (the vessel layer changed under them).
     */
    composite(look, blood = NOBLOOD, full = false, part = 0) {
      if (vecOn()) { flushRadii(); lastLook = look; if (baseM) vecTell('setOverlays', look, baseM, PW(), PH()); vecBlood = blood; const f0 = vec.stats?.frames; const r = vec.composite(look, blood, full, part); vecLaid(vecBloodKept(f0)); return r; }
      flushRadii();
      compLook = look; compBlood = blood;
      // (Blood look D, where the view asks for it and the tile is baked: until then, and for any other view, look E's sines.)
      tileNow = null; styleE = blood.style === STYLE_E;   // (look E reads no texture: it needs no bake)
      if (blood.style === STYLE_D && blood.on && (blood.streakA ?? 1) > 0) {   // (no streaks drawn, no tile)
        if (!tileTried) { tileTried = true; tileGPU = createBloodTile(gl); }
        if (tileGPU?.bake()) tileNow = tileGPU.tex();
      }
      if (!baseM || fboPW !== PW() || fboPH !== PH()) return;
      // (After one-pass frames the layer is empty: this picture has it drawn whole first, and is drawn whole on it. `fused`: the
      // one-pass frame itself, from draw.)
      const fused = fusing;
      fusing = false;
      if (stale && !fused) { this.draw(baseM, look, blood); return; }
      prepare();
      if (gpuProbe.on) gpuProbe.gauge('shaders still compiling', later.length ? later.join(', ') : 'none');
      // (The ?perf test switch "no GPU picture": no frame is drawn while it is on, and the first one after is whole.)
      if (gpuProbe.skipGL) { skipped = true; return; }
      if (skipped) { skipped = false; full = true; }
      // A bleed sprays outside the vessels: the whole picture is repainted while it lasts, and once after.
      const bleeding = !!blood.bleed?.length;
      if (bleeding || wasBleeding) full = true;
      // The organ outlines (over the vessels) are a layer redrawn when they or the view change, with one whole repaint
      // then and once after they go. Under the catheter's passes they are drawn last, as before, over it.
      const m = baseM;
      // While the view moves (a pan, a zoom, a slide's camera glide) every frame is a whole repaint anyway, so the outlines are drawn
      // straight onto it, as under the catheter, instead of into their layer first: that was one more full-screen pass a frame. The
      // layer is made again on the first frame the view holds still, and that frame is a whole repaint too.
      const moving = m[0] !== lastM[0] || m[1] !== lastM[1] || m[2] !== lastM[2] || m[3] !== lastM[3] || m[4] !== lastM[4] || m[5] !== lastM[5];
      if (moving || PW() !== lastPW || PH() !== lastPH) viewId++;
      for (let i = 0; i < 6; i++) lastM[i] = m[i];
      lastPW = PW(); lastPH = PH();
      // The catheter reaches past the vessel cells. While the view holds still, only the box it lies in now and the one it was last drawn in
      // are painted again as a whole picture would paint them (the picture with no outline layer, the catheter over it, the outlines over
      // that: cathPass), the rest as the frame would be without it, the outlines from their layer (30 Oct, review H6: its pulse had made
      // every frame of an HVPG slide a whole repaint). A box over half the picture, or a moving view, takes the whole repaint as before,
      // and so does the frame after it is gone.
      let cathRect = null;
      // (whole: a catheter that asks for the whole picture every frame, EUS-PPG's scope: its box was tall and wide (the scope, its sector),
      // and a frame that painted only the box after one that painted everything showed the box's edges as a rectangle that flickered
      // beside the scope, its tip and its beam: Mohammad, 6 Nov 2026.)
      if (cath && !moving && cathAt && !cath.whole) {
        const b = cathBox(m, BOX_NOW);
        if (b) {
          const u = BOX_U;
          u[0] = Math.min(b[0], cathAt[0]); u[1] = Math.min(b[1], cathAt[1]); u[2] = Math.max(b[2], cathAt[2]); u[3] = Math.max(b[3], cathAt[3]);
          if ((u[2] - u[0]) * (u[3] - u[1]) <= PW() * PH() / 2) cathRect = u;
        }
      }
      if ((cath && !cathRect) || cathWas && !cath) full = true;
      cathWas = !!cath;
      const hard = hasHard(), glow = hasSoft(), layer = hard && (!cath || !!cathRect) && !moving;
      // (Each layer has its own version: an outline's change redraws the outline layer alone, a glow's the glow's. External review, 21 Oct.)
      if (layer) {
        if (lineVers[0] !== lineKV || viewId !== lineKI) { gpuProbe.time(gl, 'outline layer', lineLayerT); lineKV = lineVers[0]; lineKI = viewId; full = true; }
      } else if (!hard) { freeLayer(lineLayer); lineKV = -1; }
      else if (moving) { lineKV = -1; full = true; }
      // (The glow lies behind the organs, so the catheter never draws over it: its layer holds whatever the catheter does.)
      if (glow) {
        if (lineVers[1] !== glowKV || viewId !== glowKI) { gpuProbe.time(gl, 'glow layer', glowLayerT); glowKV = lineVers[1]; glowKI = viewId; full = true; }
      } else { freeLayer(glowLayer); glowKV = -1; }
      // (The warm glow lies on the organs: no catheter draws under it either.)
      const warm = hasWarm();
      if (warm) {
        if (lineVers[2] !== warmKV || viewId !== warmKI) { gpuProbe.time(gl, 'warm layer', warmLayerT); warmKV = lineVers[2]; warmKI = viewId; full = true; }
      } else { freeLayer(warmLayer); warmKV = -1; }
      if (linesWas && !lines) full = true;
      linesWas = !!lines;
      wasBleeding = bleeding;
      // The organs' layers drawn into their texture when the view or the layers changed: the whole picture is drawn then.
      // (A plate faded out whole (the circuit, alpha 0) is read as no plate: every pixel it would lay is multiplied by 0, so the
      // organ layers were drawn into their texture on each frame of a pan or a zoom there, and read under every pixel, for nothing.
      // Mohammad, 26 Oct: "Circuit view in particular is slow when zoomed". The same pixels: pl stays 0, as plate × 0 was.)
      const plate = look.plate && look.plate.alpha > 0 ? look.plate : null;
      const useStack = !!(plate?.stack && stack?.has(0));
      prepAhead(m, !plate && !!look.plate?.stack && !!stack?.has(0));
      // (Only a live organ's own box changed: the cells over it are composited again, as the pool's are; the rest of the picture is as it was.)
      let dirt = 0;
      if (useStack && stack.stale(m, PW(), PH())) {
        if (gpuProbe.on) gpuProbe.note(COUNTED.organs);
        organM = m;
        const r = gpuProbe.time(gl, 'organ layers', organT);
        if (r === true) full = true;
        else if (r) { dirtCells(r, m); dirt = nDirt; if (gpuProbe.on) gpuProbe.gauge('organ layers: box', `${r[2] - r[0]}×${r[3] - r[1]} px, ${dirt} cells`); }
      }
      // (The kept picture made again, at a new canvas size: empty, so this picture is drawn whole into it.)
      if (own && ownSize()) full = true;
      // A whole picture is drawn straight onto the canvas (audit R15; Mohammad's Mac, 2 Nov: 31 MB copied a frame, "kept picture onto the
      // canvas", 1.8 GB in a 3 s slide change): drawn into the kept picture and copied whole onto the canvas, every pixel was written twice
      // and read once more. The kept picture is then out of date, so the first frame that draws only part of the picture draws it whole,
      // into the kept picture, first. Not with the upscale or the under picture (they lay the kept picture differently).
      // (Consecutive whole pictures stay on the canvas: a whole picture needs nothing from the kept one, so a stale kept picture no longer
      // sends every other whole frame through it (recs 2 Nov, sec. 7: direct, kept, direct, kept). A one-pass frame marks its cells in a
      // stencil: it goes straight onto the canvas only when the canvas's own buffer has one (recs sec. 4: the kept picture's stencil is
      // not the canvas's), else it is drawn into the kept picture, which has, and laid from there.)
      // (Not while the blood moves: the next frame is then the blood's own, drawn over the kept picture, which a direct whole picture left out of date,
      // so every whole picture cost a second one (the iPad panel, 4 Nov: 16 whole composites a second beside 14 vessel draws).)
      // (Blood moving no longer rules it out while the picture itself is changing: in a motion (the view moving, or the second whole picture running)
      // the next frame is a whole one too, so nothing needs the kept picture, and each of those frames wrote 31 MB twice (B2, pure-gpu-plan; the
      // ?perf of 4 Nov showed "composite build: plain" and the kept picture copied onto the canvas in 36 of 49 frames of a motion). A lone whole
      // picture beside blood-alone frames still goes through the kept one, as before. The frame that has to make the kept picture again after
      // a direct run (ownStale, not full) is never direct, so the run ends there.)
      // (Reverted to the kept picture while blood moves (4 Nov 2026, Mohammad: the figure flickers at rest in Anatomy): B2's direct runs beside
      // blood frames are taken out until the flicker is cleared, so a whole picture with blood on goes through the kept one again.)
      // (Back on 8 Nov 2026, performance A1.3: the canvas is kept by the renderer now (keep-screen.js, 475a76a), shown in one whole copy a frame, so a
      // direct whole picture can no longer show half drawn; the frame after a direct run makes the kept picture again (ownStale, below).)
      const direct = who !== 'lobule' && !noDirect && !!own && full && !up && !camOn() && !(under && under.on()) && !(replace && replace.on()) && !(fused && !ctxStencil);
      wholeRun = full ? wholeRun + 1 : 0;
      if (own && ownStale && !full) full = true;
      if (full) dirt = 0;
      const fl = look.fluid && fluidRect ? look.fluid : null;
      const pool = full ? 0 : nPool;
      nPool = 0;
      if (!full && !nCells && !(fl?.ripple && nFluid) && !pool && !dirt && !cath) return;
      if (gpuProbe.on) { if (full) gpuProbe.note('whole picture'); if (!look.plate) gpuProbe.note('organ picture down'); }
      counts.composite++; if (full) counts.whole++;
      if (gpuProbe.on) { gpuProbe.note(COUNTED.picture); if (full) gpuProbe.note(COUNTED.pictureWhole); }
      const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
      // device → world: the inverse of [a c e; b d f].
      const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
      const ie = -(ia * m[4] + ic * m[5]), iff = -(ib * m[4] + id * m[5]);
      if (own) gl.bindFramebuffer(gl.FRAMEBUFFER, direct ? null : own.fbo);
      directNow = direct; if (own) ownStale = direct;
      if (direct) { directFrame = frameCount(); directP = directB = -1; }
      gl.viewport(0, 0, PW(), PH());
      gl.disable(gl.BLEND);
      // (The plain build where the frame has no dye, no origin colours and no bleed: the values its constants hold.)
      const bare = bareOf(blood);
      // The streaks of the wide lumens worked out at half size (a quarter of the pixels), once a lumen is wide enough that its streaks, soft
      // at that size, read the same: one pass over the half-size target before the picture's own, which reads it where its lumen is that
      // wide. Frames with no wide lumen, no streaks or a one-pass frame draw as they always did (halfOn 0).
      const rebind = () => gl.bindFramebuffer(gl.FRAMEBUFFER, own ? (direct ? null : own.fbo) : SCR());
      const halfOn = !!streakP && !!blood.on && (blood.streakA ?? 1) > 0 && !fused && rMaxAll() * Math.hypot(m[0], m[1]) >= 0.9 * HALF_R && halfReady(rebind);
      const prg = full ? (bare ? plain : comp) : (bare ? plainCell : compCell);
      // (cathPass: the whole picture's build, for the catheter's box.)
      const cathPass = cathRect ? (bare ? plain : comp) : null;
      if (gpuProbe.on) gpuProbe.gauge('composite build', bare ? 'plain' : 'full');
      const bl = blood.bleed || NONE;
      const be = SCRATCH.be.fill(0), bb = SCRATCH.bb.fill(0);
      for (let i = 0; i < Math.min(24, bl.length); i++) for (let j = 0; j < 4; j++) { be[i * 4 + j] = bl[i][j]; bb[i * 4 + j] = bl[i][4 + j]; }
      const ncl = blood.noChev || NONE, ncN = Math.min(12, ncl.length), ncv = SCRATCH.ncv.fill(0);
      for (let i = 0; i < ncN; i++) ncv.set(ncl[i], i * 4);
      const hol = blood.holes || NONE, hoN = Math.min(16, hol.length), hb = SCRATCH.hb.fill(0), hr = SCRATCH.hr.fill(0);
      for (let i = 0; i < hoN; i++) { const x = hol[i]; for (let j = 0; j < 4; j++) hb[i * 4 + j] = x[j] ?? 0; hr[i] = x[4] || 0; }
      const pm = (plate && !useStack ? (plates[0] ? 1 : 0) | (plates[1] ? 2 : 0) : 0);
      // (The circuit's map: drawn and read only while it shows.)
      const map = look.map && look.map.a > 0 ? look.map : null;
      // (The same uniforms for the one-pass builds, on a one-pass frame: their composite half reads them as the picture's own does.)
      // (The passes, in the list kept for them: the one-pass builds, the catheter box's among them before the picture's own, so the
      // uniforms set after this loop go to the program bound last.)
      // The arrowheads as their own quads after this picture (blood-heads.js), where the program is ready and the vessels' axes are known;
      // not with a bleed (its frames repaint whole: the per-pixel heads stand).
      let quads = false;
      // (Not on a one-pass frame, the zoom's: its vessel and composite halves are one shader and write no layer for the quads to read, so
      // the heads there stay per-pixel, in the fused program. Without this the heads vanished while zooming and came back at rest.)
      if (headP && blood.chev && !bleeding && !fused && axisN > 0) {
        if (headList.update(axisHas, bloodRow, tubeNow, ROW_W, flowSent, FLOW_TEXELS * 4)) {
          gl.bindBuffer(gl.ARRAY_BUFFER, headBuf);
          gl.bufferData(gl.ARRAY_BUFFER, headList.data(), gl.DYNAMIC_DRAW, 0, headList.count() * 3);
        }
        quads = headList.count() > 0;
      }
      passes.length = 0;
      if (halfOn) { passes.push(streakP); if (streakCellP) passes.push(streakCellP); }
      if (fused) { passes.push(fuseGen); if (nSimple) passes.push(fuseOne); }
      if (cathPass && cathPass !== prg) passes.push(cathPass);
      if (quads) passes.push(headP);
      passes.push(prg);
      for (let qi = 0; qi < passes.length; qi++) {
        const P = passes[qi];
        gl.useProgram(P.p);
        const U = P.u;
        if (!full) {
          UC.m3(U.world, m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]));
          UC.f2(U.size, PW(), PH());
          UC.f1(U.cell, CELL);
        }
        UC.m3(U.inv, m3put(SCRATCH.inv, ia, ib, ic, id, ie, iff));
        UC.f1(U.H, PH());
        UC.f1(U.pxW, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
        UC.i1(U.plates, pm);
        UC.i1(U.halfOn, halfOn ? 1 : 0); UC.f1(U.halfR, HALF_R);
        UC.f1(U.plateAlpha, plate?.alpha ?? 0);
        UC.f1(U.plateSat, plate?.sat ?? 1);
        UC.f4a(U.plateRect0, plates[0]?.rect || R_UNIT);
        UC.f4a(U.plateRect1, plates[1]?.rect || R_UNIT);
        UC.f4a(U.fluidRect, fluidRect || R_UNIT);
        UC.f4a(U.fluidS, fl?.s || V4_ZERO);
        // (The fluid is drawn here with the plate off too, the live organs showing under the canvas: one look while the plate is
        // down for a slow fill and after it lands, where the page's SVG copy had a brighter surface line; Ascites slide 5, 17 Oct.)
        UC.f4a(U.fluidInk, fl ? fl.ink : V4_ZERO);
        UC.f2a(U.fluidLv, fl?.lv || LV_DEF);
        UC.i1(U.blood, blood.on ? 1 : 0);
        UC.i1(U.chev, blood.chev ? 1 : 0);
        UC.i1(U.chevQuad, quads ? 1 : 0);
        UC.i1(U.still, blood.still ? 1 : 0);
        UC.f1(U.flowA, blood.alpha ?? 1);
        UC.f3(U.blendA, blood.streakA ?? 1, blood.chevA ?? 1, blood.originA ?? 1);
        UC.f3a(U.chevInk, blood.chevInk || CHEV_INK);
        UC.f3a(U.chevLight, blood.chevLight || CHEV_LIGHT);
        UC.f1(U.cssPx, blood.vdpr || 1);
        UC.i1(U.lenOn, blood.streakLen ? 1 : 0);
        UC.i1(U.origin, blood.origin ? 1 : 0);
        UC.i1(U.dyeOn, dyeAny && blood.dye !== false ? 1 : 0);
        UC.f1(U.clock, blood.clock || 0);
        UC.f1(U.bT, blood.bt || 0);
        UC.f1(U.rows, nTubes);
        UC.fv3(U.originCol, originColOf(blood.originCol || ORIGIN_WHITE));
        UC.f3a(U.dyeCol, blood.dyeCol || DYE_COL);
        UC.f3a(U.revCol, blood.revCol || REV_COL);
        UC.f3a(U.inkLight, blood.inkLight || INK_LIGHT);
        UC.f3a(U.inkDark, blood.inkDark || INK_DARK);
        UC.fv4(U.bleedE, be);
        UC.fv4(U.bleedB, bb);
        UC.i1(U.bleedN, Math.min(24, bl.length));
        UC.fv4(U.noChev, ncv);
        UC.i1(U.noChevN, ncN);
        UC.fv4(U.chevHole, hb); UC.fv1(U.chevHoleR, hr); UC.i1(U.chevHoleN, hoN);
        UC.f1(U.mapA, map ? map.a : 0);
        if (map) { UC.f4a(U.mapDot, map.dot); UC.fv4(U.mapZone, map.zone); UC.f4a(U.mapFx, map.fx); UC.f4a(U.mapAlt, map.alt); UC.f2a(U.mapFxX, map.fxX); UC.f4a(U.mapRot, map.rot); }
      }
      const U = prg.u;
      // The still lumens (see moved): only in the blood's own pass, with no bleed (whose spray and pool move with
      // the clock, the one uniform left out here), when every uniform above and every texture under a lumen is the last picture's.
      sn = 0;
      sg(m); sigNow[sn++] = +(PW()) || 0; sigNow[sn++] = +(PH()) || 0; sigNow[sn++] = +(pm) || 0; sigNow[sn++] = +(plate?.alpha ?? 0) || 0; sigNow[sn++] = +(plate?.sat ?? 1) || 0; sg(plates[0]?.rect || R_UNIT); sg(plates[1]?.rect || R_UNIT);
      sg(fluidRect || R_UNIT); sg(fl?.s || V4_ZERO); sg(fl ? fl.ink : V4_ZERO); sg(fl?.lv || LV_DEF);
      sigNow[sn++] = +(blood.on) || 0; sigNow[sn++] = +(blood.chev) || 0; sigNow[sn++] = +(blood.still) || 0; sigNow[sn++] = +(blood.alpha ?? 1) || 0; sigNow[sn++] = +(blood.streakA ?? 1) || 0; sigNow[sn++] = +(blood.chevA ?? 1) || 0; sigNow[sn++] = +(blood.originA ?? 1) || 0;
      sg(blood.chevInk || CHEV_INK); sg(blood.chevLight || CHEV_LIGHT); sigNow[sn++] = +(blood.vdpr || 1) || 0; sigNow[sn++] = +(blood.origin) || 0; sigNow[sn++] = +(dyeAny && blood.dye !== false) || 0;
      sigNow[sn++] = +(blood.streakLen) || 0;   // (the blood's clock is left out: the rows that carry blood are marked moved below when it moved)
      sg(originColOf(blood.originCol || ORIGIN_WHITE)); sg(blood.dyeCol || DYE_COL); sg(blood.revCol || REV_COL);
      sg(blood.inkLight || INK_LIGHT); sg(blood.inkDark || INK_DARK); sg(ncv); sigNow[sn++] = +(ncN) || 0; sg(hb); sg(hr); sigNow[sn++] = +(hoN) || 0; sigNow[sn++] = +(layer) || 0; sigNow[sn++] = +(glow) || 0; sigNow[sn++] = +(warm) || 0; sigNow[sn++] = +(useStack) || 0; sigNow[sn++] = +(bare) || 0; sigNow[sn++] = +(texVer) || 0;
      sigNow[sn++] = halfOn ? 1 : 0;   // (the half-size streaks pass is on or off: a lumen drawn the other way is drawn again)
      sigNow[sn++] = quads ? 1 : 0;   // (the arrowheads drawn by their quads or by the composite: a lumen drawn the other way is drawn again)
      sigNow[sn++] = map ? map.a : 0; if (map) { sg(map.dot); sg(map.zone); sg(map.fx); sg(map.alt); sg(map.fxX); sg(map.rot); }
      // (The clock moved since the last picture: every row carrying blood changes with it, so its lumen is drawn again; the rest are left alone, so a
      // lumen whose vessels did not change is skipped while the blood flows (3c63d68; taken out in the 4 Nov 2026 flicker chase, 225c4e0, back as performance A1.2).)
      const btNow = blood.bt || 0;
      if (btNow !== btLast && (blood.on || blood.chev || blood.origin)) for (let r = 0; r < nTubes; r++) if (bloodRow[r]) moved[r] = 1;
      btLast = btNow;
      let same = !!stillSig && sn === stillN && sn < sigNow.length;
      for (let i = 0; same && i < sn; i++) if (sigNow[i] !== stillSig[i]) same = false;
      const still = !full && !movedAll && !bl.length && same;
      // Nothing to show that the canvas does not already: every uniform the last picture's, no row, texture or layer changed since,
      // nothing that moves by itself (a ripple, a pool, a bleed, the catheter, a one-pass frame) and no cells drawn again. The frame
      // is not drawn at all, so the canvas is not presented again and the compositor has nothing new to lay (the canvas keeps its
      // last picture). This is what lets a figure whose blood stands still sleep through the model's own frames (31 Oct: a running
      // model redrew the whole canvas about ten times a second though nothing on it changed).
      if (still && !fused && !part && !dirt && !pool && !(fl?.ripple && nFluid) && !cath && figVer === figAt && !moved.includes(1)) {
        if (own) gl.bindFramebuffer(gl.FRAMEBUFFER, SCR());
        if (gpuProbe.on) gpuProbe.note(COUNTED.pictureSkipped);
        return false;
      }
      // (Drawn on: counted for the glass unless it is the blood's own frame alone, the lumens repainted with every uniform as last time.)
      const figNew = figVer !== figAt;
      figAt = figVer;
      const bloodAlone = !full && !part && !dirt && !pool && !(fl?.ripple && nFluid) && !cath && bare && same && !figNew;
      const picWas = picKnownM;
      pictured(bloodAlone);
      if (bloodAlone) { bloodMark(bloodSeq, fused || up || camOn() ? null : bloodCPU, nBlood, m, bloodCell); if (fused || up || camOn()) picKnownM = false; }
      else {
        // (What lies under the figure in this canvas is the same picture as at the last counted one, when its host says so (under.ver: the lobule's tissue, 6 Nov 2026,
        // lobule lag rec 8): a part of this picture drawn again then changes the canvas only inside its tiles, which the glass over it blurs again alone. A host
        // with no ver, or a tissue drawn since, is as it was: a picture of unknown reach.)
        const underOn = !!(under && under.on()), uv = underOn && under.ver ? under.ver() : NaN, underOdd = underOn && !(uv === underAt);
        underAt = uv;
        picMark(picWas, m, full, fused || up || camOn() || underOdd || !!(replace && replace.on()), part, dirt, pool, !!(fl?.ripple && nFluid), cathRect);
      }
      if (still) {
        let ch = false;
        for (let r = 0; r < nTubes; r++) if (movedUp[r * 4] !== moved[r]) { movedUp[r * 4] = moved[r]; ch = true; }
        if (ch) { gl.bindTexture(gl.TEXTURE_2D, flowTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, FLOW_TEXELS, 0, 1, nTubes, gl.RGBA, gl.FLOAT, movedUp); }
      }
      if (halfOn) {
        // (The streaks' half-size picture: only a lumen at least HALF_R px wide reads it, so it is worked out over the squares of the cells
        // that list a wide row (halfCellsFor), where the pass had run over every blood square, or the whole canvas. The rest of the target is
        // clear: cleared whenever the set of those cells changes or the picture is whole; else the pixels that read it are those drawn again.)
        const nWide = streakCellP ? halfCellsFor(Math.hypot(m[0], m[1])) : 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, half.fbo); gl.viewport(0, 0, half.w, half.h);
        const sq = nWide > 0 && !full && halfWas && !halfSet.changed;
        const SP = nWide > 0 ? streakCellP : streakP;
        if (nWide > 0 && !sq) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.useProgram(SP.p);
        halfUse = null;
        compBind(SP.u, layer, glow, warm, useStack);
        UC.i1(SP.u.stillOn, 0); UC.i1(SP.u.bloodOnly, 0);
        if (nWide > 0) {
          // (The cell build's own uniforms, set here: a whole picture's passes leave them as the last cell frame had them.)
          UC.m3(SP.u.world, m3put(SCRATCH.world, m[0], m[1], m[2], m[3], m[4], m[5]));
          UC.f2(SP.u.size, PW(), PH());
          UC.f1(SP.u.cell, CELL);
          gl.bindVertexArray(halfSet.va); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nWide);
        } else { gl.bindVertexArray(compVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
        gl.bindVertexArray(null);
        halfUse = half.tex;
        fencePart('half-size streaks');
        rebind(); gl.viewport(0, 0, PW(), PH()); gl.useProgram(prg.p);
        if (gpuProbe.on) gpuProbe.gauge('streaks at half size', nWide > 0 ? `${half.w}×${half.h}, ${nWide} cells of wide rows${sq ? '' : ', cleared first'}` : `${half.w}×${half.h}, whole`);
      } else halfUse = null;
      halfWas = halfOn;
      // (A whole picture writes every pixel of its target, the kept picture or the canvas: the old one is not loaded into the pass. A part of a
      // picture keeps what is there.)
      if (full && own) noLoad(gl.FRAMEBUFFER, direct);
      // (With the heads drawn as quads after this pass, still lumens are left alone only on a frame whose one drawing of lumens is the blood's
      // own pass: the heads' quads then skip the pixels it skips, and lay a head once on every pixel it draws again.)
      const stillUse = still && !(quads && (part || dirt || pool || (fl?.ripple && nFluid) || cathRect));
      UC.i1(U.stillOn, stillUse ? 1 : 0);
      if (gpuProbe.on) gpuProbe.gauge('still lumens left alone', still ? `${nTubes - moved.reduce((n, v) => n + v, 0)} of ${nTubes} rows` : 'off');
      compBind(U, layer, glow, warm, useStack);
      if (fused) {
        // The one-pass frame: the vessel cells drawn by the one-pass builds, each marking its pixels in the stencil, then the
        // picture's own build over every pixel left unmarked, where the (empty) layer is what the vessel pass would have left.
        if (gpuProbe.on) gpuProbe.gauge('blood squares on screen', 'whole picture, one pass');
        gl.enable(gl.STENCIL_TEST);
        gl.stencilMask(0xff); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        // (The general cells, then the one-vessel build's: a call for each, where a list of lists was made.)
        if (nGen) { fuseBind(fuseGen, m, look, layer, glow, warm, useStack); gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nGen); }
        if (nSimple) { fuseBind(fuseOne, m, look, layer, glow, warm, useStack); gl.bindVertexArray(oneVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nSimple); }
        gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.useProgram(prg.p);
        compBind(U, layer, glow, warm, useStack);
        UC.i1(U.bloodOnly, 0);
        gl.bindVertexArray(compVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.STENCIL_TEST);
        // (The marks are spent: told so, the tile GPU (Apple's, under Safari's Metal) never writes the stencil back to memory at the end of
        // the pass; the next one-pass frame clears it before reading it: a canvas-sized buffer not written out to memory on every
        // zoom or pan frame, Apple's Metal guide "Load and Store Actions", MDN "WebGL best practices".)
        // (The enum follows the buffer bound, not whether a kept picture exists: the canvas's own takes STENCIL, a framebuffer object
        // STENCIL_ATTACHMENT.)
        INV1[0] = own && !direct ? gl.STENCIL_ATTACHMENT : gl.STENCIL; gl.invalidateFramebuffer(gl.FRAMEBUFFER, INV1);
      } else if (full) {
        UC.i1(U.bloodOnly, 0);
        if (gpuProbe.on) gpuProbe.gauge('blood squares on screen', 'whole picture');
        gl.bindVertexArray(compVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        if (gpuProbe.on) gpuProbe.gauge('blood squares on screen', squaresOnScreen(bloodCPU, nBlood, m, bloodCell));
        // (The blood's own frame skips the pixels with no lumen; the cells drawRows drew again (`part`) and the fluid's ripple, which
        // moves the whole of its cells, are drawn whole. A pixel drawn twice comes out the same: no blending, and from its own inputs.)
        UC.i1(U.bloodOnly, 0);
        if (part) { if (partG) { gl.bindVertexArray(partVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, partG); } if (partS) { gl.bindVertexArray(partSVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, partS); } }
        UC.i1(U.bloodOnly, 1);
        if (nBlood) { gl.bindVertexArray(bloodVAO); UC.f1(U.cell, bloodCell); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nBlood); UC.f1(U.cell, CELL); }
        UC.i1(U.bloodOnly, 0);
        if (fl?.ripple && nFluid) { gl.bindVertexArray(fluidVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nFluid); }
        if (pool) { gl.bindVertexArray(poolVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pool); }
        if (dirt) { gl.bindVertexArray(dirtVAO); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, dirt); }
      }
      gl.bindVertexArray(null);
      fencePart(fused ? 'one-pass picture' : full ? 'whole picture' : 'blood pass');
      if (quads) { drawHeads(m, layer, glow, warm, useStack, stillUse); fencePart('heads'); }
      // (This picture's uniforms, and every row as it now is: what the next blood pass compares with.)
      if (!stillSig) stillSig = new Float64Array(sigNow.length);
      for (let i = 0; i < sn; i++) stillSig[i] = sigNow[i];
      stillN = sn;
      moved.fill(0); movedAll = false;
      if (cathRect) {
        // (The catheter's box, as a whole picture with the catheter paints it: the picture's whole build there with no outline layer, then
        // the catheter, then the outlines over it. Outside the box, nothing here touches a pixel.)
        if (gpuProbe.on) gpuProbe.gauge('catheter box', `${cathRect[2] - cathRect[0]}×${cathRect[3] - cathRect[1]} px`);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(cathRect[0], PH() - cathRect[3], cathRect[2] - cathRect[0], cathRect[3] - cathRect[1]);
        gl.useProgram(cathPass.p);
        compBind(cathPass.u, false, glow, warm, useStack);
        UC.i1(cathPass.u.stillOn, 0);
        UC.i1(cathPass.u.bloodOnly, 0);
        gl.bindVertexArray(compVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        // (The box was painted again without its heads: they are laid on it again, under the catheter, still inside the box.)
        if (quads) drawHeads(m, false, glow, warm, useStack, false);
        gpuProbe.time(gl, 'catheter', cathT);
        if (hard) gpuProbe.time(gl, 'outlines', linesT);
        gl.disable(gl.SCISSOR_TEST);
      } else if (cath) gpuProbe.time(gl, 'catheter', cathT);
      // (Where it was drawn: what the next frame's box takes in, so no trace of it is left behind.)
      cathAt = cath ? cathBox(m, BOX_AT) : null;
      if (hard && !layer) gpuProbe.time(gl, 'outlines', linesT);
      if (own && !(bloodAlone && keep && keepBlood(m))) present();
    },
    /** Whether organ outlines can be drawn here (else stage.js keeps its SVG ones). */
    get canLines() { return !!lineP; },
    /**
     * Organ outlines, or null: { verts: Float32Array (x, y, normal x, y, side, half width per vertex; world units),
     * draws: [{ first, count, col: [r, g, b], alpha, tri (a fill: triangles, half width 1e4, side 0), soft (a glow behind the organs: side 0 on the edge and ±1 at the reach, half width = the reach), warm (with soft: the same glow on the organs and under the vessels instead of behind them) }] }.
     * Alphas may change without new verts.
     */
    setLines(spec) {
      // (rev: the same array written again in place, the circuit's station dots following the morph: sent again, nothing allocated.)
      const fresh = spec && (spec.verts !== lines?.verts || spec.rev !== lines?.rev);
      lines = lineP && spec?.draws?.length ? spec : null;
      if (!lines) return;
      // (Per layer: the outlines (0), the glow behind the organs (1) and the warm glow on them (2), as drawLines sorts the draws.)
      // (Each layer's draws as numbers in a kept list (sigPut), compared with the list kept from the last call: no string is built.)
      SIG_N[0] = SIG_N[1] = SIG_N[2] = 0;
      for (const d of lines.draws) {
        const i = d.warm ? 2 : d.soft ? 1 : 0, c = d.col;
        sigPut(i, d.first); sigPut(i, d.count); sigPut(i, d.alpha); sigPut(i, c.length);
        for (let k = 0; k < c.length; k++) sigPut(i, c[k]);
        sigPut(i, d.tri ? 1 : 0); sigPut(i, d.endFade ? 1 : 0);
      }
      for (let i = 0; i < 3; i++) {
        let same = SIG_N[i] === SIG_KN[i];
        for (let k = 0; same && k < SIG_N[i]; k++) { const a = SIG_NOW[i][k], b = SIG_KEPT[i][k]; if (a !== b && !(a !== a && b !== b)) same = false; }
        if (fresh || !same) { const t = SIG_KEPT[i]; SIG_KEPT[i] = SIG_NOW[i]; SIG_NOW[i] = t; SIG_KN[i] = SIG_N[i]; lineVers[i]++; }
      }
      if (!fresh) return;
      if (gpuProbe.on) gpuProbe.note('uploaded: setLines', lines.verts.byteLength / 1024);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, lines.verts, gl.DYNAMIC_DRAW);
    },
    /** Figure resolution › Glows: the glow layers drawn at this share of the canvas's pixels (1: every pixel, read unfiltered). */
    setLayerScale(k) {
      k = Math.min(1, Math.max(0.1, +k || 1)); if (k === layerK) return;
      layerK = k; glowKV = warmKV = -1;
      if (k === 1 && lo.tex && !lost) { lo.w = lo.h = 0; gl.bindTexture(gl.TEXTURE_2D, lo.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    },
    /** Whether the catheter can be drawn here (else stage.js keeps its SVG one). */
    get canCath() { return !!cathP; },
    /**
     * The HVPG catheter, or null: { base: Float32Array | null, verts: Float32Array (x, y, dirX, dirY, u, v per vertex),
     * draws: [{ mode, first, count, col: [r, g, b], alpha, fade: [in, out], len }], light: [x, y], whole?: true }. base: vertices that stay
     * frame to frame (the shaft along the whole route), first in the buffer and sent only when it is a new array; verts follow
     * it, sent every time; a draw's `first` counts from the start of base.
     */
    setCath(spec) {
      cath = cathP && spec?.draws?.length ? spec : null;
      if (!cath) return;
      const base = cath.base || null, at = base ? base.byteLength : 0, need = at + cath.verts.byteLength;
      if (gpuProbe.on) gpuProbe.note('uploaded: setCath', ((base && base !== cathBase ? at : 0) + cath.verts.byteLength) / 1024);
      gl.bindBuffer(gl.ARRAY_BUFFER, cathBuf);
      if (need > cathCap) { cathCap = need * 2; gl.bufferData(gl.ARRAY_BUFFER, cathCap, gl.DYNAMIC_DRAW); cathBase = null; }
      if (base && base !== cathBase) gl.bufferSubData(gl.ARRAY_BUFFER, 0, base);
      cathBase = base;
      if (cath.verts.byteLength) gl.bufferSubData(gl.ARRAY_BUFFER, at, cath.verts);
    },
    /**
     * The camera and alpha of the final present: the figure (and its overlays) laid scaled by k about (ox, oy) (canvas px from its top left)
     * and weighed by a (0 to 1), the glass over it untouched. (1, any, any, 1) is the plain copy. Lays the canvas again at once when it changed.
     */
    setCamera(k, ox, oy, a = 1) { return this.setCameraRec(k, (1 - k) * ox, (1 - k) * oy, a); },
    /** The same camera as a record (scene-cam.js): p' = k p + (ex, ey) in canvas px, y down. */
    setCameraRec(k, ex, ey, a = 1) {
      if (!(k > 0) || !(a >= 0)) return;
      a = Math.min(1, a);
      if (k === 1) ex = ey = 0;
      if (cam.k === k && cam.a === a && cam.ex === ex && cam.ey === ey) return;
      cam.k = k; cam.a = a; cam.ex = ex; cam.ey = ey; camSeq++;
      if (!lost) present(true, true);
    },
    /**
     * The scene camera of a card's zoom: the figure (and its overlays) laid scaled by k and moved by (ex, ey) (canvas px, y down), after the
     * dive's camera; (1, 0, 0) is none. Lays the canvas again at once when it changed.
     */
    setScene(k, ex = 0, ey = 0) {
      if (!(k > 0)) return;
      if (scn.k === k && (k === 1 || (scn.ex === ex && scn.ey === ey))) return;
      scn.k = k; scn.ex = k === 1 ? 0 : ex; scn.ey = k === 1 ? 0 : ey; camSeq++;
      // (The picture the glass blurs is a new one: its kept blur is of the figure where it stood, and the parts the blood reached since are the only
      // ones the glass would blur again, so a card that came over parts it never blurred drew solid black.)
      pictured();
      if (!lost) present(true, true);
    },
    get camera() { return cam; },
    /** The cameras' change count while none is on (the canvas is the picture as drawn), else -1. */
    get camKey() { return camOn() ? -1 : camSeq; },
    /** Shared (share): the texture this renderer's present lays its picture on, { tex, w, h } (null otherwise); the host lays it over its own. */
    get target() { if (!scr) return null; SCR(); return scr; },
    /** Changes whenever the canvas is drawn on again, but for a frame of the moving blood alone (the glass takes a new copy of the figure only then). */
    get drawSeq() { return pictureSeq; },
    /** The frames of the moving blood alone, which drawSeq leaves out. */
    get bloodSeq() { return bloodSeq; },
    /** Where the blood frames after number `from`, up to `to`, drew: fills out [x0, y0, x1, y1] (device px, top left origin; x0 > x1 when nowhere) and returns true; false if unknown (the glass then blurs all it reads). */
    bloodDirty,
    /** As bloodDirty, as up to MAX_RECTS boxes { x, y, w, h } (device px) written into out from pool: their count, 0 for nowhere, -1 when unknown. */
    bloodDirtyRects: (from, to, out, pool) => bdTiles.rects(from, to, out, pool),
    /** As bloodDirtyRects, for the pictures (drawSeq) after `from` up to `to`: -1 unless each was a part of the canvas drawn again at the same view. */
    pictureDirtyRects: (from, to, out, pool) => picTiles.rects(from, to, out, pool),
    /** The view the picture was last drawn for (the world matrix), as a string that changes whenever a pan, a zoom or a glide moves it (the glass blurs again at once then). */
    get viewKey() { return baseM ? viewKeyStr : ''; },
    /** Calls f each time drawSeq changes; returns the call that stops it. */
    onPicture(f) { onPicture.add(f); return () => onPicture.delete(f); },
    clear() { clearAll(); },
    /** How many times the kept screen was copied onto the canvas (keep-screen.js; 0 where the browser keeps the canvas). */
    get screenShows() { return screenKeep ? screenKeep.flushes : 0; },
    /** The current picture as a PNG data URL (call right after draw, in the same task). */
    snapshot() { if (share) return null; const c = { ...cam }; cam.k = 1; cam.ex = cam.ey = 0; cam.a = 1; try { present(false); screenKeep?.flush(); const url = canvas.toDataURL('image/png'); Object.assign(cam, c); if (tops.length || camOn()) present(); return url; } finally { Object.assign(cam, c); } },   // (the figure alone; then laid again whole, as it shows)
    /**
     * The canvas holding the whole current picture, for a reader that takes it in this same task (a download, a handout, the glass'
     * copy, drawImage, createImageBitmap, toDataURL): the kept picture is copied onto it first, so the reader
     * never depends on the canvas having kept its own picture. Every export of the figure goes through here.
     */
    // (Audit R15: the picture is laid on the canvas once a frame. A second reader in the same frame, with nothing drawn since, takes the
    // canvas as it is: the same full-screen copy and glass draw were done again for each glass that asked.)
    capture() {
      const f = frameCount();
      // (A host's ask waiting for the frame's end is laid now, and is the picture the reader takes: not laid a second time below.)
      if (presPend) { const again = (presPend & 2) !== 0; presPend = 0; presentNow(true, again); capturedAt = f; capP = pictureSeq; capB = bloodSeq; capN = presents; screenKeep?.flush(); return canvas; }
      if (f === capturedAt && capP === pictureSeq && capB === bloodSeq && capN === presents && !(replace && replace.on())) { screenKeep?.flush(); return canvas; }
      presentNow(true, false); capturedAt = f; capP = pictureSeq; capB = bloodSeq; capN = presents;
      screenKeep?.flush(); return canvas;
    },
    /**
     * Copies the kept picture onto the canvas again, so a reader of the canvas outside the frame that drew it (a copy for the glass,
     * a resolution fade, a picture taken later) reads the whole current picture. Does nothing without a kept picture (the canvas keeps
     * its own) or when the canvas was resized and not yet drawn again (it holds nothing current).
     */
    present,
    /**
     * Gives back the vessel framebuffer (21 bytes a pixel) and the outline layer while the picture is not shown;
     * everything else stays, and the next draw reallocates them.
     */
    trim() {
      if (lost) return;
      for (const t of [baseTex, gTex, gTex2, depTex]) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        if (t === baseTex) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        else if (t === depTex) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        else if (t === gTex2) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, 1, 1, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
      }
      fboW = fboH = 0; baseM = null; fboOK = false; wrapNone(); lowLive = null;
      freeLayer(lineLayer); freeLayer(glowLayer); freeLayer(warmLayer); lineKV = glowKV = warmKV = -1;
      // (The quality tiers' targets, the streaks' half-size target and, shared, the host's texture for this picture: given back too. The tiers'
      // are made again by the stage a moment after the figure is shown (stage-res lowWarm), the others by the next draw that needs them.)
      lowFree();
      if (half.tex) { gl.bindTexture(gl.TEXTURE_2D, half.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); half.w = half.h = 0; }
      if (scr?.fbo) { gl.bindTexture(gl.TEXTURE_2D, scr.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); scr.w = scr.h = 1; scr.gen++; kept.on = false; }
      stack?.trim(); over?.trim();
      if (own?.w) { own.w = own.h = 0; gl.bindTexture(gl.TEXTURE_2D, own.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    },
    /**
     * Frees every GPU object (textures, the vessel framebuffer, buffers, programs) and stops
     * listening to the canvas. The instance is dead afterwards; make a new one to draw again.
     * `lose: true` also gives the context back to the browser (WEBGL_lose_context): the canvas
     * then cannot draw until the browser restores it, so give the next instance a new canvas.
     */
    dispose({ lose = false } = {}) {
      offPresFinal(); screenKeep?.dispose(); presPend = 0;
      (hostCv || canvas).removeEventListener('webglcontextlost', onLost);
      (hostCv || canvas).removeEventListener('webglcontextrestored', onRestored);
      if (!lost) {
        try { vec?.dispose?.(); } catch (e) { caught('veins-gl:vec-dispose', e); /* going anyway */ }
        for (const S of vecSets) if (S.ent) gl.deleteTexture(S.ent);
        vec = null; vecSets.clear();
        useMorphSet(null);
        for (const S of [...morphSets]) dropSet(S);
        for (const t of [entTex, radTex, bendTex, rmaxTex, tubeTex, organTex, flowTex, dyeTex, fluidTex, baseTex, gTex, gTex2, depTex, depNone, lineLayer.tex, glowLayer.tex, warmLayer.tex, ...plates.map((x) => x?.tex)]) if (t) gl.deleteTexture(t);
        for (const b of [quad, cellBuf, simpleBuf, bloodBuf, partBuf, partSBuf, fluidBuf, poolBuf, dirtBuf, cathBuf, lineBuf]) gl.deleteBuffer(b);
        for (const v of [vao, oneVAO, bloodVAO, halfSet.va, partVAO, partSVAO, fluidVAO, poolVAO, dirtVAO, compVAO, cathVAO, lineVAO, headVAO]) gl.deleteVertexArray(v);
        gl.deleteBuffer(headBuf); if (axisTex) gl.deleteTexture(axisTex);
        for (const x of [prog, simpleP, comp, compCell, plain, plainCell, streakP, streakCellP, headP, fuseGen, fuseOne, cathP, lineP, meshS, meshPt, meshL]) if (x) gl.deleteProgram(x.p);
        for (const t of [MG.tex, MG.pj, MG.scrN, MG.scrT, vecPtsTex]) if (t) gl.deleteTexture(t);
        if (meshSt) gl.deleteRenderbuffer(meshSt);
        for (const v of [MG.stripVAO, MG.patchVAO, MG.layVAO]) if (v) gl.deleteVertexArray(v);
        for (const b of [MG.rowBuf, MG.patchBuf]) if (b) gl.deleteBuffer(b);
        if (half.tex) { gl.deleteTexture(half.tex); gl.deleteFramebuffer(half.fbo); }
        over?.dispose(); stack?.dispose(); tileGPU?.dispose();
        gl.deleteFramebuffer(fbo); gl.deleteFramebuffer(tintFbo); gl.deleteFramebuffer(lineLayer.fbo); gl.deleteFramebuffer(glowLayer.fbo); gl.deleteFramebuffer(warmLayer.fbo);
        if (own) { gl.deleteTexture(own.tex); gl.deleteFramebuffer(own.fbo); if (own.rb) gl.deleteRenderbuffer(own.rb); }
        if (rz.tex) { gl.deleteTexture(rz.tex); gl.deleteFramebuffer(rz.fbo); }
        if (rz.P) gl.deleteProgram(rz.P.p);
        for (const x of [layP, upP]) if (x) gl.deleteProgram(x.p);
        for (const k of Object.keys(aux)) { gl.deleteProgram(aux[k].p); for (const x of aux[k].sh) gl.deleteShader(x); delete aux[k]; }
        freeTasks.length = 0;
        lowFree();
        if (warmT) { for (const t of warmT.tx) gl.deleteTexture(t); gl.deleteFramebuffer(warmT.fb); gl.deleteBuffer(warmT.buf); gl.deleteVertexArray(warmT.va); }
        // (Builds still compiling: given back unpublished, with every shader.)
        if (later.length) { for (const k of later) for (const st of startsOf(k)) gl.deleteProgram(st.p); later.length = 0; freeShaders(); }
        if (scr?.fbo) { gl.deleteTexture(scr.tex); gl.deleteFramebuffer(scr.fbo); scr.fbo = scr.tex = null; scr.w = scr.h = 0; }
        if (lose && !share) gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      plates[0] = plates[1] = null; lines = cath = null; nCells = nBlood = nFluid = nGen = nSimple = 0; baseM = null; fboW = fboH = 0;
      lost = true;
    },
  };
  // (Every other input that changes what the vessels, the blood or the layers over them show is told to the Vector renderer once its own work is
  // done; it reads the data they fill from vecShared. Before it is made, and with another renderer chosen, there is nobody to tell.)
  // (The setters the overlays' module draws from (workstream G): kept as given, for when it is made, and given to it as they come.)
  const G_SETTERS = { setLines: (a) => { vecOps.lines = a; }, setCath: (a) => { vecOps.cath = a; }, setFluidSpans: (a, b) => { vecOps.spans = [a, b]; }, setFluidLiver: (a) => { vecOps.liver = a; } };
  for (const name of ['setRadii', 'setBend', 'setTubes', 'setFlow', 'setDye', 'setLines', 'setCath', 'setFluidSpans', 'setFluidLiver', 'setFluidCells', 'setCameraRec', 'setScene', 'setLayerScale', 'clear']) {
    const was = api[name];
    if (!was) continue;
    api[name] = function (a0, a1, a2, a3) {
      const r = was.call(this, a0, a1, a2, a3);
      if (name in G_SETTERS) { G_SETTERS[name](a0, a1); if (vec) vecParts0?.overlays?.[name]?.(a0, a1); }
      if (name === 'setFlow' && vec && a0) vecBloodRows(a0);
      if (vec) vecTell(name, a0, a1, a2, a3);
      return r;
    };
  }
  // (The live organs and the overlays' order, as the stack is given them: kept for Vector's start, and told to it.)
  if (api.organs) {
    const O = api.organs;
    // (A slot's layers shown: Vector is told, and takes them in place of the stack's pictures, which are not made; it counts for the plate the stage is told of.)
    const commitTo = O.commit;
    O.commit = (slot, names) => {
      const kept = vecOps.commits[slot] = names.slice();
      for (const n of vecOps.bakes[slot].keys()) if (!kept.includes(n)) { vecOps.bakes[slot].delete(n); vecSkip.bakes[slot].delete(n); }
      vecTell('setOrgans', 'commit', slot, kept);
      if (!vecNow()) { vecSkip.commits[slot] = null; commitTo(slot, names); return; }
      texVer++;
      if (plates[slot]) { gl.deleteTexture(plates[slot].tex); plates[slot] = null; }
      vecSkip.commits[slot] = kept;
      plateTell();
    };
    const hasTo = O.has, picturedTo = O.pictured;
    O.has = (slot) => hasTo(slot) || vecHeld(slot);
    O.pictured = (slot) => picturedTo(slot) || vecHeld(slot);
    const dropTo = api.dropPlate;
    api.dropPlate = (slot) => { vecOps.bakes[slot]?.clear(); vecSkip.bakes[slot]?.clear(); vecOps.commits[slot] = vecSkip.commits[slot] = null; vecTell('setOrgans', 'drop', slot); dropTo(slot); if (vec) plateTell(); };
    const noted = (name, kind, keep) => { const was = O[name]; O[name] = (a, b) => { keep(a, b); vecTell('setOrgans', kind, a, b); return was(a, b); }; };
    noted('setLive', 'live', (a, b) => { vecOps.live = a; vecOps.masks = b; vecOps.liveAll = null; });
    noted('setLiveAll', 'liveAll', (a) => { vecOps.liveAll = a; vecOps.live = vecOps.masks = null; });
    noted('setOrder', 'order', (a) => { vecOps.order = a; });
    noted('shift', 'shift', (a, b) => { vecOps.shift[a] = b; });
  }
  // (Timed for the debug overlay's GPU readout: gpu-probe.js. Off, each call costs one check.)
  const steps = { draw: 'vessels', drawRows: 'vessels', composite: 'picture', setGeometry: 'uploads', patchGeometry: 'uploads', setRadii: 'uploads', setBend: 'uploads', setTubes: 'uploads',
    paintOrgans: 'picture', plateJob: 'uploads', plateRows: 'uploads', setPlate: 'uploads', setFluidSpans: 'uploads', setFluidCells: 'uploads', setFlow: 'uploads', setDye: 'uploads' };
  // (And, for the ?perf readout, how much each upload sent, in KB: a camera-only frame should send none of the model's.)
  const kbOf = {
    setGeometry: (b) => (b.ent.byteLength + b.cells.byteLength + (b.blood?.byteLength || 0)) / 1024, setRadii: () => N_SAMPLES * 8 / 1024,
    patchGeometry: (b) => b.patch.reduce((n, [r0, r1]) => n + (r1 - r0 + 1) * ENT_W * 16, 0) / 1024,   // (setBend notes its own: only a row it sends)
    setTubes: (d) => d.byteLength / 1024, setDye: (d) => (d ? d.byteLength / 1024 : 0), setFluidCells: (c) => c.byteLength / 1024,
    plateRows: (job, y, rows, px) => px.byteLength / 1024,
  };
  // The readout's route: what the upload sent, then the call timed on the GPU.
  function probed(self, k, name, f, a) {
    if (kbOf[k]) { let kb = 0; try { kb = kbOf[k](...a); } catch (e) { caught('veins-gl:4099', e); /* a count only */ } gpuProbe.note(`uploaded: ${k}`, kb); }
    return gpuProbe.time(gl, name, () => f.apply(self, a));
  }
  for (const [k, name] of Object.entries(steps)) {
    const f = api[k];
    // (Five named arguments, the most any of them takes, passed straight on: a rest list and a call through apply made an array on every
    // call of draw, composite and every upload. The timed route, only while the readout is on, may allocate.)
    api[k] = function (a0, a1, a2, a3, a4) {
      if (!gpuProbe.on) return f.call(this, a0, a1, a2, a3, a4);
      return probed(this, k, name, f, [a0, a1, a2, a3, a4]);
    };
  }
  return api;
}
