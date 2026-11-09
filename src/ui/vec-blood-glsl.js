// The vector renderer's blood material (workstream D, docs/recommendations/vector-renderer-plan.md section 5.3), as GLSL for the two
// shaders that draw lumens (B's ordinary stretch, C's interaction region) to call with the vessel's own coordinates, and for the heads'
// quads. It is the blood of COMP_FS (veins-gl.js) ported, not edited: the same arithmetic in the same order, with the flow images gone
// (the row, the arc along and the position across come from the geometry) and the streaks filtered by their own footprint.
//
// ── THE TWO ENTRY POINTS (published first, B and C code against them) ──
//   vec4 vecBlood(int row, float s, float y, float R, vec3 lumenCol, float px)
//   vec4 vecBloodMix(int n, int rows[N], float s[N], float y[N], float R[N], float w[N], vec3 lumenCol, float px)
//     N is a compile-time constant of the program: 2 and SLOTS (8) in VEC_BLOOD_GLSL, or vecBloodGLSL(SLOTS_WIDE) (32) for the wide leaves.
//     row/rows : the vessel's row in the flow and tube textures (the same row the geometry draws).
//     s        : arc length along that vessel at the pixel (world units; may run past either end, as the lumen's does into a join).
//     y        : the position across the lumen, −1 … 1 (the geometry's own coordinate).
//     R        : the drawn lumen radius at s (world units).
//     lumenCol : the lumen's colour at the pixel, straight rgb (the origin lens judges its lightness; the streaks' inks follow the
//                vessel's own colour, which the function reads from the tube texture).
//     px       : world units per device pixel (the footprint of one pixel; for textureGrad, never dFdx: valid in any control flow).
//     n, w     : (vecBloodMix) 1 … N members, and each one's share of the pixel. w need not sum to 1: the function normalises it after
//                weighting each member by whether its blood runs toward the junction (an upstream member supplies it; a reversal
//                swaps them, eased through the speed's zero). Each member's stream is sampled in its OWN (row, s, y), then the layers are
//                blended: streams are blended, never coordinates.
//   Both return a PREMULTIPLIED blood layer (rgb already times a, and a) for a pixel inside the lumen. Origin tint, streaks, lymph, dye,
//   glue cast and in-lumen arrowheads are all in it. The caller lays it over the lumen at the lumen's coverage `lum` (0 … 1):
//       col = layer.rgb * lum + col * (1.0 - layer.a * lum);
//   Pass nothing for a pixel outside the lumen (lum 0): skip the call.
//   Other entry points: vecBloodAt(vec2 world) (set the pixel's world point before vecBlood when the arrowheads are drawn in the lumen,
//   vbChevQuad 0, so the figure readings' cut-outs apply), vecBleed(vec2 world, float px) (the stomach's pool and the bleed's stream,
//   premultiplied, drawn under the vessels).
//
// ── WHAT THE HOST DECLARES, AND WHAT THIS DECLARES ──
// The host shader declares, before this text, `precision highp float; precision highp int;` and the two samplers it shares with its own
// shading: `uniform highp sampler2D rad, tube;` (rad: N_SAMPLES samples a row, r in .r and the along curve in .ba; tube: 13 texels a row).
// This text declares everything else it reads (VEC_BLOOD_UNIFORMS lists them, for the renderer core's uniform setter). Every name here is
// vb/vec-prefixed (plus the blood tile's own noiseT, lnWb, lnWf, lnS), so none clashes with shadeGLSL or the region shader; the text
// holds no preprocessor directive.
//
// ── THE FILTERING (brief section 6) ──
// The streaks read blood-tile.js's mipmapped tile in two phases (D_GLSL dNoise), with textureGrad and the footprint worked out from px
// (never dFdx). The footprint along is px / (50 cells) in tile texels. The fine octave's share falls smoothly from 1 at half a texel to
// 0 at one and a half, the coarse octave's from 3 to 6 texels toward the lumen's mean, the spread kept level: nothing steps, and a streak
// never shimmers or runs backwards as it shrinks under a pixel. See vec-blood-math.js for the same arithmetic in JavaScript.
import { D_GLSL, E_GLSL, TILE_W, TILE_V_PER_ROW } from './blood-tile.js';
import { CHEV_GLSL } from './chevron-glsl.js';
import { SLOT, DYE_BINS, PERIOD, DRIFT_PERIOD, DRIFT_RATE } from './blood.js';
import { LUMEN, STO_Y0, STO_DY, STO_N } from './stomach-lumen.js';
import { N_SAMPLES } from './veins-mesh.js';
import { LANE_K, FINE_LO, FINE_HI, COARSE_LO, COARSE_HI, SHARE_B, SHARE_F, SPREAD_K, FLOOR_W, INFLOW_RANGE } from './vec-blood-math.js';
import { headVS } from './blood-heads.js';
import { SLOTS } from './vec-contract.js';

const ORIGIN_GREY = 0.62;   // the lumen's colour while the blood is coloured by origin (veins-gl.js ORIGIN_GREY; a test holds them equal)
const f1 = (x) => Number(x).toFixed(4);

/**
 * The uniforms and samplers VEC_BLOOD_GLSL declares (the renderer core sets them once a frame; `from` names the COMP_FS uniform each
 * one is, so the setter can be the composite's own code with the names changed). type: GLSL type; n: array length (omitted: a scalar).
 */
export const VEC_BLOOD_UNIFORMS = Object.freeze([
  { name: 'vbFlow', type: 'sampler2D', from: 'flow', note: 'per vessel row, FLOW_TEXELS texels (x = texel, y = row); shared with the instance' },
  { name: 'vbBend', type: 'sampler2D', from: 'bend', note: 'the axis curvature at each sample, for the arrowheads (setBend)' },
  { name: 'vbDye', type: 'sampler2D', from: 'dye', note: 'dye concentration along each vessel (setDye)' },
  { name: 'noiseT', type: 'sampler2D', from: 'noiseT', note: "blood-tile.js's baked tile (look D)" },
  { name: 'vbOn', type: 'int', from: 'blood', note: '1: draw the blood' },
  { name: 'vbChev', type: 'int', from: 'chev', note: '1: flow arrowheads' },
  { name: 'vbChevQuad', type: 'int', from: 'chevQuad', note: '1: the arrowheads are the quads of the heads program, not in the lumen' },
  { name: 'vbStill', type: 'int', from: 'still', note: '1: reduced motion' },
  { name: 'vbLenOn', type: 'int', from: 'lenOn', note: '1: a streak length follows its vessel speed' },
  { name: 'vbOrigin', type: 'int', from: 'origin', note: '1: colour the blood by where it came from' },
  { name: 'vbDyeOn', type: 'int', from: 'dyeOn', note: '1: the dye bolus' },
  { name: 'vbStyle', type: 'int', from: 'bloodStyle', note: '1: look D (the tile), 2: look E (sines); 0: the glow along the axis only' },
  { name: 'vbFlowA', type: 'float', from: 'flowA', note: 'how visible the moving blood is (0 … 1)' },
  { name: 'vbBlendA', type: 'vec3', from: 'blendA', note: 'the streaks, the arrowheads and the origin colours fading (0 … 1 each)' },
  { name: 'vbClock', type: 'float', from: 'clock', note: 'seconds (wrapped), the bleed' },
  { name: 'vbBT', type: 'float', from: 'bT', note: 'the blood clock (highp)' },
  { name: 'vbCssPx', type: 'float', from: 'cssPx', note: 'canvas px per CSS px' },
  { name: 'vbDyeRows', type: 'float', from: 'rows', note: 'the dye texture height' },
  { name: 'vbOriginCol', type: 'vec3', n: 5, from: 'originCol', note: 'the five origin colours' },
  { name: 'vbDyeCol', type: 'vec3', from: 'dyeCol' },
  { name: 'vbRevCol', type: 'vec3', from: 'revCol', note: 'moving blood where flow runs backwards' },
  { name: 'vbInkLight', type: 'vec3', from: 'inkLight' },
  { name: 'vbInkDark', type: 'vec3', from: 'inkDark' },
  { name: 'vbChevInk', type: 'vec3', from: 'chevInk' },
  { name: 'vbChevLight', type: 'vec3', from: 'chevLight' },
  { name: 'vbBleedE', type: 'vec4', n: 24, from: 'bleedE' },
  { name: 'vbBleedB', type: 'vec4', n: 24, from: 'bleedB' },
  { name: 'vbBleedN', type: 'int', from: 'bleedN' },
  { name: 'vbBleedCol', type: 'vec3', n: 3, note: 'the bleed tokens, 0 … 1: --bleed-spray, --bleed-fresh, --bleed-deep (COMP_FS reads them in when it is built)' },
  { name: 'vbNoChev', type: 'vec4', n: 12, from: 'noChev', note: 'world boxes with no arrowhead' },
  { name: 'vbNoChevN', type: 'int', from: 'noChevN' },
  { name: 'vbChevHole', type: 'vec4', n: 16, from: 'chevHole' },
  { name: 'vbChevHoleR', type: 'float', n: 16, from: 'chevHoleR' },
  { name: 'vbChevHoleN', type: 'int', from: 'chevHoleN' },
]);
const uniformText = VEC_BLOOD_UNIFORMS.map((u) => `uniform ${u.type === 'sampler2D' ? 'highp ' : u.name === 'vbBT' ? 'highp ' : ''}${u.type} ${u.name}${u.n ? `[${u.n}]` : ''};`).join('\n');

// ── Pieces shared with the heads' quads (blood-heads.js headVS wants them under the composite's own names) ──
// names(N) maps the function and uniform names, so the library has them as vbRadAt … and the heads' vertex shader as radAt …
const NAMES_VB = { radAt: 'vbRadAt', alongAt: 'vbAlongAt', flowD: 'vbFlowD', flowDrift: 'vbFlowDrift', rootDD: 'vbRootDD', chevOrange: 'vbChevOrange', chevInks: 'vbChevInks',
  flow: 'vbFlow', bT: 'vbBT', origin: 'vbOrigin', blendA: 'vbBlendA', revCol: 'vbRevCol', chevInk: 'vbChevInk', chevLight: 'vbChevLight', inkLight: 'vbInkLight' };
const NAMES_COMP = { radAt: 'radAt', alongAt: 'alongAt', flowD: 'flowD', flowDrift: 'flowDrift', rootDD: 'rootDD', chevOrange: 'chevOrange', chevInks: 'chevInks',
  flow: 'flow', bT: 'bT', origin: 'origin', blendA: 'blendA', revCol: 'revCol', chevInk: 'chevInk', chevLight: 'chevLight', inkLight: 'inkLight' };
const LAST = N_SAMPLES - 1;
// (The caliber at s between its samples; the colour's place along; the stream's distance and drift on the blood clock from where the CPU last
// anchored them; a chained vessel's root stream: veins-gl.js radAt, alongAt, flowD, flowDrift, rootDD, the same text. None reads a drawn radius
// to move a stream: radAt is for the heads' size and spacing only.)
const rowsGLSL = (N) => `
float ${N.radAt}(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${LAST}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return max(mix(texelFetch(rad, ivec2(i0, id), 0).r, texelFetch(rad, ivec2(i0 + 1, id), 0).r, ui - float(i0)), 0.3);
}
float ${N.alongAt}(int id, float u) {
  float ui = u * ${LAST}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}
float ${N.flowD}(int id, float D, float vd) {
  vec3 a = texelFetch(${N.flow}, ivec2(6, id), 0).xyz;
  float t = ${N.bT} - a.x;
  return a.y == 0.0 ? D : mod(D + (vd + 0.5 * a.z * t) * a.y * t, ${PERIOD}.0);
}
float ${N.flowDrift}(int id, float dr, float stasis) {
  vec2 a = texelFetch(${N.flow}, ivec2(6, id), 0).xy;
  return a.y == 0.0 ? dr : mod(dr + stasis * ${DRIFT_RATE} * (${N.bT} - a.x), ${DRIFT_PERIOD}.0);
}
vec2 ${N.rootDD}(int rid, vec2 ch) {
  vec3 a = texelFetch(${N.flow}, ivec2(6, rid), 0).xyz;
  if (a.y == 0.0) return ch;
  vec4 r0 = texelFetch(${N.flow}, ivec2(0, rid), 0);
  float tr = ${N.bT} - a.x;
  return vec2(mod(r0.x + (r0.y + 0.5 * a.z * tr) * a.y * tr, ${PERIOD}.0),
              mod(texelFetch(${N.flow}, ivec2(3, rid), 0).z + r0.w * ${DRIFT_RATE} * (${N.bT} - a.x), ${DRIFT_PERIOD}.0));
}`;
// (How orange a colour is, and a head's two inks: veins-gl.js CHEV_ORANGE_GLSL.)
const orangeGLSL = (N) => `
float ${N.chevOrange}(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}
void ${N.chevInks}(vec3 vc, float rv, out vec3 core, out vec3 rim) {
  float rk = ${N.origin} == 1 ? rv * (1.0 - ${N.blendA}.z) : rv;
  float dark = 1.0 - smoothstep(0.38, 0.46, dot(vc, vec3(0.299, 0.587, 0.114)));
  float warm = rk * ${N.chevOrange}(vc);
  vec3 ink = mix(${N.chevInk}, vc * 0.3, 0.2);
  core = mix(mix(mix(ink, ${N.chevLight}, dark), ${N.revCol}, rk), ${N.chevLight}, warm);
  rim = mix(${N.inkLight}, vc * 0.45, max(dark, warm));
}`;
// (The streaks' numbers that follow the zoom alone: veins-gl.js ZOOM_VS zoomOut, as a function of the pixel's world size.)
const ZOOM_MATH = `
void vbZoomNums(float pxw, out vec4 zA, out vec3 zB) {
  float slot = ${SLOT}.0;
  float Lg = max(2.6, 5.0 * pxw);
  float lx = clamp(log2(max(pxw, 1e-4) * 8.0 / slot), -1.0, 3.0);
  float li = smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx);
  float lb = min(floor(li), 1.0), lf = li - lb;
  float sA = slot * exp2(lb), sB = slot * exp2(lb + 1.0);
  float cellA = 5.12 * sA, cellB = 5.12 * sB;
  zA = vec4(Lg, sA, sB, lf);
  zB = vec3(smoothstep(1.2 * pxw, 2.0 * pxw, cellA * 0.5), smoothstep(1.2 * pxw, 2.0 * pxw, cellB * 0.5), mix(sA, sB, lf));
}`;

const STO_TEXT = LUMEN.map(([l, r]) => `vec2(${l.toFixed(2)}, ${r.toFixed(2)})`).join(', ');

/**
 * vecBloodMix for up to N contributing streams (N a compile-time constant of the program: 2, SLOTS = 8, or SLOTS_WIDE = 32 for C's wide
 * leaves, the central vein's sinusoids): each member's share, times whether that member's blood runs toward the junction (the end its pixel
 * is nearest to), eased through the speed's zero so a reversal swaps the contributors smoothly; a member running away keeps FLOOR_W of its
 * share. Then normalised over ALL n members (none dropped). Each member's stream is sampled in its own (row, s, y); a member whose weight is
 * 0 costs nothing. Arrays of different sizes are different types, so the sizes overload; n above N is cut to N.
 */
const mixGLSL = (N) => `vec4 vecBloodMix(int n, int rows[${N}], float s[${N}], float y[${N}], float R[${N}], float w[${N}], vec3 lumenCol, float px) {
  vbZoomSet(px);
  if (n <= 1) return vbOne(rows[0], s[0], y[0], R[0], lumenCol, px);
  int m = min(n, ${N});
  float wn[${N}];
  float tot = 0.0;
  for (int i = 0; i < ${N}; i++) {
    wn[i] = 0.0;
    if (i >= m) break;
    int id = rows[i];
    float vd = texelFetch(vbFlow, ivec2(0, id), 0).y;
    float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
    float toEnd = s[i] > 0.5 * len ? vd : -vd;
    wn[i] = max(w[i], 0.0) * (${FLOOR_W} + ${1 - FLOOR_W} * smoothstep(-${INFLOW_RANGE}.0, ${INFLOW_RANGE}.0, toEnd));
    tot += wn[i];
  }
  float even = 1.0 / float(m);
  for (int i = 0; i < ${N}; i++) {
    if (i >= m) break;
    wn[i] = tot > 0.0 ? wn[i] / tot : even;
  }
  vec4 acc = vec4(0.0);
  for (int i = 0; i < ${N}; i++) {
    if (i >= m) break;
    if (wn[i] > 0.0) acc += vbOne(rows[i], s[i], y[i], R[i], lumenCol, px) * wn[i];
  }
  return acc;
}`;

/** The blood material's GLSL (see the header). */
export const vecBloodGLSL = (...sizes) => `
// ── vec-blood-glsl.js: VEC_BLOOD_GLSL ──
${uniformText}
const float VB_BINS = ${DYE_BINS}.0;
const float VB_GREY = ${ORIGIN_GREY};
const float VB_STO_Y0 = ${STO_Y0}.0, VB_STO_DY = ${STO_DY}.0;
const int VB_STO_N = ${STO_N};
const vec2 VB_STO[${STO_N}] = vec2[${STO_N}](${STO_TEXT});
const float VB_LANE_K[7] = float[7](${LANE_K.map(f1).join(', ')});
// The octaves' shares of the streaks' noise (blood-tile.js dNoise reads lnWb, lnWf, lnS) and the zoom's numbers, worked out once a call.
float lnWb = ${SHARE_B}, lnWf = ${SHARE_F}, lnS = 1.0;
float vbWb = ${SHARE_B}, vbWf = ${SHARE_F};
vec4 vbZA = vec4(0.0);
vec3 vbZB = vec3(0.0);
vec2 vbW = vec2(-1.0e9);
${D_GLSL}
${E_GLSL}
${ZOOM_MATH}
${rowsGLSL(NAMES_VB)}
${CHEV_GLSL}
${orangeGLSL(NAMES_VB)}
vec4 vbOver(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
void vbZoomSet(float px) { vbZoomNums(px, vbZA, vbZB); }
void vecBloodAt(vec2 world) { vbW = world; }

// The axis's signed curvature at arc length s (1 / world units).
float vbBendAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${LAST}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return mix(texelFetch(vbBend, ivec2(i0, id), 0).r, texelFetch(vbBend, ivec2(i0 + 1, id), 0).r, ui - float(i0));
}
// Lymph in its channel (a row whose f1.x is -1): soft dashes along it with an amber albumin core (COMP_FS lymphAt).
void vbLymph(float s, float y, vec4 f0, float len, float R, float px, out float cover, out float core) {
  float pitch = max(f0.y, 1.0);
  float x = (fract((s - f0.x) / pitch) - 0.5) * pitch;
  float hl = pitch * 0.17, r = R * 0.52, aa = max(px, 1e-3) * 0.75, ya = y * R;
  cover = 1.0 - smoothstep(r - aa, r + aa, length(vec2(max(abs(x) - max(hl - r, 0.0), 0.0), ya)));
  float rc = r * 0.46;
  core = (1.0 - smoothstep(rc - aa, rc + aa, length(vec2(max(abs(x) - max(hl * 0.55 - rc, 0.0), 0.0), ya)))) * (0.2 + 0.55 * clamp(f0.z, 0.0, 1.0));
  float e = smoothstep(0.0, pitch * 1.2, min(s, len - s));
  cover *= e; core *= e;
}
// How much of a lumen is an opaque cast at arc length s (the EUS glue): the blood draws nothing inside it.
float vbCast(int id, float s, float len) {
  vec4 tc = texelFetch(tube, ivec2(8, id), 0);
  if (tc.w < 1.5) return 0.0;
  vec4 tr = texelFetch(tube, ivec2(9, id), 0);
  return smoothstep(tr.x * len - tr.z, tr.x * len + tr.z, s) * (1.0 - smoothstep(tr.y * len - tr.z, tr.y * len + tr.z, s));
}
// The vessel's own colour at arc length s (not the shaded pixel's: its highlights would flip a streak between white and dark).
vec3 vbVesselCol(int id, float s, float len) {
  return mix(texelFetch(tube, ivec2(0, id), 0).rgb, texelFetch(tube, ivec2(1, id), 0).rgb, vbAlongAt(id, clamp(s / len, 0.0, 1.0)));
}

// The streaks' noise at one stream position, filtered by the pixel's footprint (see the header): the tile's two octaves are read as
// dNoise reads them, with their shares renormalised as the fine octave's weight falls (the spread kept level), and the whole going to the
// mean as the coarse octave's does. dxu: the tile's U per device pixel; dyv: its V per device pixel.
float vbNoiseD(int id, float s, float qy, float D, float ay, float cell, float drift, float dxu, float dyv) {
  float fp = dxu * ${TILE_W}.0;
  float wf = 1.0 - smoothstep(${FINE_LO}, ${FINE_HI}, fp);
  float wc = 1.0 - smoothstep(${COARSE_LO}.0, ${COARSE_HI}.0, fp);
  float ff = vbWf * wf, tt = vbWb + ff;
  lnWb = vbWb / tt; lnWf = ff / tt;
  lnS = sqrt(${SPREAD_K} / (lnWb * lnWb + lnWf * lnWf));
  float n = dNoise(id, s, qy, D, ay, cell, drift, dxu, dyv);
  return 0.5 + (n - 0.5) * wc;
}

// Moving blood in one lumen at arc length s and across y: the parcels' colour and coverage (straight rgb, a), to be laid over the lumen
// colour col (COMP_FS bloodAt: styles D and E, stasis smoke, reversed colour, chains, length with speed).
vec4 vbStreak(int id, float s, float y, vec3 col, vec4 f0, vec4 f1, float len, float R, vec3 vc, float px) {
  float D = f0.x, vd = f0.y, flux = f0.z, stasis = f0.w;
  vbWb = ${SHARE_B}; vbWf = ${SHARE_F};
  lnWb = ${SHARE_B}; lnWf = ${SHARE_F}; lnS = 1.0;
  if (vbLenOn == 1) {
    float kk = mix(clamp(sqrt(abs(vd) / 36.0), 0.6, 1.6), 1.0, stasis);
    float lu = clamp(kk >= 1.0 ? (kk - 1.0) / 0.6 : (kk - 1.0) / 0.4, -1.0, 1.0);
    lnWf = lu >= 0.0 ? 0.38 * (1.0 - lu) : 0.38 - 0.27 * lu;
    lnWb = 1.0 - lnWf;
    lnS = sqrt(${SPREAD_K} / (lnWb * lnWb + lnWf * lnWf));
    vbWb = lnWb; vbWf = lnWf;
  }
  float Lg = vbZA.x;
  float lc = clamp(1.7 * R / Lg, 1.0, 7.0) - 1.0;
  int lk = min(int(lc), 5);
  float sumK = mix(VB_LANE_K[lk], VB_LANE_K[lk + 1], lc - float(lk));
  float pale = vbOrigin == 0 ? smoothstep(0.58, 0.66, dot(vc, vec3(0.299, 0.587, 0.114))) : 0.0;
  vec3 core = mix(mix(col, vbInkLight, 0.62), mix(col, vbInkDark, 0.45), pale);
  vec3 halo = mix(mix(col, vbInkLight, 0.3), mix(col, vbInkDark, 0.2), pale);
  float rev = vbOrigin == 1 ? 0.0 : f1.w;
  if (rev > 0.0) { core = mix(core, mix(vbRevCol, vbInkLight, 0.18), rev); halo = mix(halo, mix(col, vbRevCol, 0.7), rev); }
  float ay = clamp(abs(y), 0.0, 1.0);
  float qy = y * R / max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * px);
  float drift = vbFlowDrift(id, texelFetch(vbFlow, ivec2(3, id), 0).z, stasis);
  float sw = 6.2831853 * 1.2 * drift;
  qy += stasis * 0.6 * (sin(sw) * sin(s * 0.021 + float(id) * 1.7) + cos(sw) * sin(s * 0.034 + float(id) * 0.9 + 2.0));
  vec4 ch4 = texelFetch(vbFlow, ivec2(4, id), 0);
  float cw = ch4.w;
  float sA = vbZA.y, sB = vbZA.z, lf = vbZA.w;
  float nz = 0.0;
  if (vbStyle == 1) {
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * px);
    float cA = 5.12 * sA, cB = 5.12 * sB, dxA = px / (50.0 * cA), dxB = px / (50.0 * cB), dyv = px / laneW * ${TILE_V_PER_ROW};
    if (cw < 1.0) {
      nz = vbNoiseD(id, s, qy, D, ay, cA, drift, dxA, dyv);
      if (lf > 0.0) nz = mix(nz, vbNoiseD(id, s, qy, D, ay, cB, drift, dxB, dyv), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = vbRootDD(rid, texelFetch(vbFlow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3);
      float nc = vbNoiseD(rid, se, qy, ch5.x, ay, cA, ch5.y, dxA * bs, dyv);
      if (lf > 0.0) nc = mix(nc, vbNoiseD(rid, se, qy, ch5.x, ay, cB, ch5.y, dxB * bs, dyv), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  } else if (vbStyle == 2) {
    float cA = 5.12 * sA, cB = 5.12 * sB;
    if (cw < 1.0) {
      nz = eNoise(id, s, qy, D, ay, cA, drift, px / cA);
      if (lf > 0.0) nz = mix(nz, eNoise(id, s, qy, D, ay, cB, drift, px / cB), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = vbRootDD(rid, texelFetch(vbFlow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3);
      float nc = eNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, px / cA * bs);
      if (lf > 0.0) nc = mix(nc, eNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, px / cB * bs), lf);
      nz = cw >= 1.0 ? nc : mix(nz, nc, cw);
    }
  }
  float sx = vbZB.z;
  float p = max(min(1.0, flux * sx / (max(abs(vd), 2.0) * sumK)), 0.6 * stasis);
  float ends = min(f1.x > 0.5 ? smoothstep(0.0, 1.5 * sx, s) : 1.0, f1.y > 0.5 ? smoothstep(0.0, 1.5 * sx, len - s) : 1.0);
  float ovS = max(flux * sx / (max(abs(vd), 2.0) * sumK), 1.0);
  float gS = 1.0 + 0.35 * clamp(2.885 * (ovS - 1.0) / (ovS + 1.0), 0.0, 1.0);
  float dens = sqrt(clamp(p, 0.0, 1.0)) * gS;
  float streak = smoothstep(0.46 - 0.08 * dens, 0.9, nz);
  float wall = 1.0 - smoothstep(0.7, 1.0, ay);
  float glowCore = 0.22 * (1.0 - ay * ay) * (1.0 - ay * ay);
  float a = clamp(streak * (0.32 + 0.26 * dens) + glowCore, 0.0, 0.75) * wall * ends * f1.z * mix(1.0, 0.76, stasis);
  vec4 sOut = vec4(mix(halo, core, smoothstep(0.0, 0.7, streak)), a);
  if (vbStyle != 1) return sOut;
  // Look D's tube light: a soft highlight a third of the way across, a darker rim at the wall and a faint glow along the axis.
  float lit = f1.z * ends;
  float hl = exp(-2.4 * (y + 0.38) * (y + 0.38) * 4.0) * (1.0 - smoothstep(0.75, 1.0, ay));
  float rim = smoothstep(0.62, 1.0, ay);
  float ha = 0.12 * hl * lit, ra = 0.2 * rim * lit;
  vec4 under = vbOver(vec4(vbInkDark * ra, ra), vec4(mix(col, vbInkLight, 0.7) * ha, ha));
  vec4 top = vec4(sOut.rgb * sOut.a, sOut.a);
  vec4 res = vbOver(top, under);
  return res.a > 0.0 ? vec4(res.rgb / res.a, res.a) : vec4(0.0);
}

// Where a lumen's blood comes from, as streams side by side (COMP_FS originAt): SMV, IMV, splenic vein, hepatic artery, the rest.
vec3 vbOriginAt(int id, float s, float y, float R, float px) {
  vec4 f2 = texelFetch(vbFlow, ivec2(2, id), 0);
  float pe = texelFetch(vbFlow, ivec2(6, id), 0).w;
  if (pe != 0.0) {
    float x = clamp(s / max(texelFetch(tube, ivec2(5, id), 0).z, 1.0), 0.0, 1.0), P = abs(pe);
    if (pe < 0.0) x = 1.0 - x;
    float g = P >= 10.0 ? smoothstep(P - 10.03, P - 9.97, x) : P < 0.05 ? x : (exp(P * x) - 1.0) / (exp(P) - 1.0);
    f2 = mix(f2, texelFetch(vbFlow, ivec2(7, id), 0), g);
  }
  float u = clamp((y + 1.0) * 0.5, 0.0, 1.0), e = clamp(0.6 * px / max(R, 0.3), 0.01, 0.12);
  float c1 = f2.x, c2 = c1 + f2.y, c3 = c2 + f2.z, c4 = c3 + f2.w;
  vec3 c = vbOriginCol[0];
  c = mix(c, vbOriginCol[1], smoothstep(c1 - e, c1 + e, u));
  c = mix(c, vbOriginCol[2], smoothstep(c2 - e, c2 + e, u));
  c = mix(c, vbOriginCol[3], smoothstep(c3 - e, c3 + e, u));
  c = mix(c, vbOriginCol[4], smoothstep(c4 - e, c4 + e, u));
  return c;
}
// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall.
float vbDyeAt(int id, float s, float y, float R) {
  float vd = texelFetch(vbFlow, ivec2(0, id), 0).y;
  float len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float sp = s - dir * (2.0 * (1.0 - y * y) - 1.0) * 1.4 * R;
  float u = clamp(sp / len, 0.0, 1.0);
  return textureLod(vbDye, vec2((u * (VB_BINS - 1.0) + 0.5) / VB_BINS, (float(id) + 0.5) / vbDyeRows), 0.0).r;
}
// The bolus's leading edge (0 … 1): how much thinner the dye is four pixels ahead along the flow.
float vbDyeEdge(int id, float s, float y, float R, float c, float px) {
  float ahead = (texelFetch(vbFlow, ivec2(0, id), 0).y < 0.0 ? -4.0 : 4.0) * px;
  return clamp((c - vbDyeAt(id, s + ahead, y, R)) * 3.0, 0.0, 1.0);
}

// One vessel's flow arrowheads along the axis, placed by a stream's pattern (COMP_FS chevOne). se = A + B s the arc along that stream.
vec2 vbChevOne(int id, float s, float y, vec4 f0, vec4 f1, float len, float Rs, float R, float se, float Bm, float Dm, float Rsp, vec2 ends, float px) {
  float vd = f0.y, dir = vd < 0.0 ? -1.0 : 1.0;
  float lv = max(0.0, log2(max(3.6 * Rsp, 60.0 * px) / 28.0));
  if (vbStill == 1) lv = max(lv, texelFetch(vbFlow, ivec2(3, id), 0).y);
  float Pc = 28.0 * exp2(lv);
  lv += 1.3219281;
  float n = floor(lv), fr = lv - n;
  float P = 28.0 * exp2(n);
  float xe = mod(se - Dm + 0.5 * P, P) - 0.5 * P;
  float x = xe / Bm, u = x * dir;
  float sc = s - x;
  float odd = mod(floor((se - xe - Dm) / P + 0.5), 2.0);
  float keep = odd > 0.5 ? 1.0 - smoothstep(0.15, 0.85, fr) : 1.0;
  float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * vbCssPx * px, 8.0 * vbCssPx * px)), L = 1.6 * hw;
  if (abs(x) > (0.6 + 0.4 * f1.w) * L + 0.15 * hw + 4.0 * px) return vec2(0.0);
  float yd = y * Rs, ay = abs(yd);
  float Rl = vbRadAt(id, sc, len);
  u *= clamp(1.0 - vbBendAt(id, sc, len) * yd, 0.25, 2.5);
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
  float fade = smoothstep(0.5, 3.0, abs(vd)) * f1.z * texelFetch(vbFlow, ivec2(3, id), 0).x * keep * endF * smoothstep(1.3 * px, 2.4 * px, R);
  fade *= smoothstep(0.85 * hw, 1.15 * hw, Rl);
  return chevHead(u, ay, hw, px, f1.w) * fade;
}
vec2 vbChevAt(int id, float s, float y, vec4 f0, vec4 f1, float len, float Rs, float px) {
  float R = max(texelFetch(rad, ivec2(${LAST / 2 | 0}, id), 0).r, 0.3);
  if (R < 1.3 * px) return vec2(0.0);
  vec4 ch4 = texelFetch(vbFlow, ivec2(4, id), 0), ch5 = texelFetch(vbFlow, ivec2(5, id), 0);
  float cw = vbStill == 1 ? 0.0 : ch4.w;
  vec2 c = vec2(0.0);
  if (cw < 1.0) c = vbChevOne(id, s, y, f0, f1, len, Rs, R, s, 1.0, f0.x, R, ch5.zw, px);
  if (cw > 0.0) {
    int rid = int(ch4.x + 0.5) - 1;
    float Rr = max(texelFetch(rad, ivec2(${LAST / 2 | 0}, rid), 0).r, 0.3);
    vec2 cc = vbChevOne(id, s, y, f0, f1, len, Rs, R, ch4.y + ch4.z * s, ch4.z, vbRootDD(rid, ch5.xy).x, Rr, ch5.zw, px);
    c = cw >= 1.0 ? cc : mix(c, cc, cw);
  }
  return c;
}

// One vessel's blood layer at (s, y): origin tint, streaks (less the glue cast), lymph, dye, then the arrowheads when they are in the lumen.
// Premultiplied, for a pixel wholly inside the lumen; each stage is the mix COMP_FS made, as an over, so the stack equals the mixes.
vec4 vbOne(int id, float s, float y, float R, vec3 col0, float px) {
  vec4 lay = vec4(0.0);
  if (vbOn == 0 && vbDyeOn == 0 && vbChev == 0 && vbOrigin == 0) return lay;
  vec3 col = col0;
  vec4 f0 = vec4(0.0), f1 = vec4(0.0);
  float len = 1.0;
  vec3 vc = vec3(0.0);
  bool isLy = false;
  if (vbOn == 1 || vbChev == 1 || vbOrigin == 1 || vbDyeOn == 1) {
    f0 = texelFetch(vbFlow, ivec2(0, id), 0); f1 = texelFetch(vbFlow, ivec2(1, id), 0);
    f0.x = vbFlowD(id, f0.x, f0.y);
    len = max(texelFetch(tube, ivec2(5, id), 0).z, 1.0);
    vc = vbVesselCol(id, s, len);
    isLy = f1.x < -0.5;
  }
  if (vbOrigin == 1) {
    // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey. A vessel that carries no blood keeps its colour.
    float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / VB_GREY, 0.55, 1.45);
    vec3 oc = texelFetch(vbFlow, ivec2(2, id), 0).x < -0.5 ? col : min(vbOriginAt(id, s, y, R, px) * shade, vec3(1.0));
    float ao = clamp(vbBlendA.z, 0.0, 1.0);
    lay = vbOver(vec4(oc * ao, ao), lay);
    col = mix(col, oc, ao);
  }
  if (vbOn == 1 && vbBlendA.x > 0.0 && f1.z > 0.0 && !isLy) {
    vec4 A = vbStreak(id, s, y, col, f0, f1, len, R, vc, px);
    float aS = clamp(A.a * (1.0 - vbCast(id, s, len)) * vbFlowA * vbBlendA.x, 0.0, 1.0);
    lay = vbOver(vec4(A.rgb * aS, aS), lay);
  }
  if (vbOn == 1 && isLy && f1.z > 0.0) {
    float lc, lk;
    vbLymph(s, y, f0, len, R, px, lc, lk);
    vec3 ink = mix(vc, f0.w > 0.5 ? vec3(0.78, 0.95, 0.70) : vec3(0.30, 0.56, 0.28), 0.62);
    vec3 amber = f0.w > 0.5 ? vec3(0.95, 0.71, 0.29) : vec3(0.89, 0.60, 0.12);
    float aL = clamp(f1.z * vbFlowA, 0.0, 1.0);
    lay = vbOver(vec4(ink * lc * aL, lc * aL), lay);
    lay = vbOver(vec4(amber * lk * aL, lk * aL), lay);
  }
  if (vbDyeOn == 1) {
    float c = vbDyeAt(id, s, y, R);
    float ad = clamp(c, 0.0, 1.0) * 0.9;
    lay = vbOver(vec4(vbDyeCol * ad, ad), lay);
    if (c > 0.02) {
      float de = vbDyeEdge(id, s, y, R, c, px);
      float ae = de * 0.55 * clamp(c, 0.0, 1.0);
      lay = vbOver(vec4(vc * 0.45 * ae, ae), lay);
    }
  }
  if (vbChev == 1 && vbChevQuad == 0 && f1.z > 0.0 && !isLy) {
    vec2 c = vbChevAt(id, s, y, f0, f1, len, R, px);
    if (c.x + c.y > 0.0) {
      for (int i = 0; i < 12; i++) {
        if (i >= vbNoChevN) break;
        vec2 q = abs(vbW - (vbNoChev[i].xy + vbNoChev[i].zw) * 0.5) - (vbNoChev[i].zw - vbNoChev[i].xy) * 0.5;
        c *= smoothstep(-px, px, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
      }
      for (int i = 0; i < 16; i++) {
        if (i >= vbChevHoleN) break;
        vec4 h = vbChevHole[i];
        float hr = vbChevHoleR[i], dh;
        if (hr < 0.0) { vec2 ab = h.zw - h.xy; float t = clamp(dot(vbW - h.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); dh = length(vbW - h.xy - ab * t) + hr; }
        else dh = length(max(max(h.xy - vbW, vbW - h.zw), 0.0)) - hr;
        c *= smoothstep(-px, px, dh);
      }
    }
    if (c.x + c.y > 0.0) {
      vec3 hCore, hRim;
      vbChevInks(vc, f1.w, hCore, hRim);
      float ar = clamp(c.y * 0.75 * vbFlowA * vbBlendA.y, 0.0, 1.0), ac = clamp(c.x * vbFlowA * vbBlendA.y, 0.0, 1.0);
      lay = vbOver(vec4(hRim * ar, ar), lay);
      lay = vbOver(vec4(hCore * ac, ac), lay);
    }
  }
  return lay;
}

// ── The entry points ──
vec4 vecBlood(int row, float s, float y, float R, vec3 lumenCol, float px) {
  vbZoomSet(px);
  return vbOne(row, s, y, R, lumenCol, px);
}
${sizes.map(mixGLSL).join('\n')}

// ── The bleed (COMP_FS, its stream and the stomach's pool) ──
// Premultiplied, at world point w: the pool inside the stomach's lumen below a flat surface that ripples where the stream lands, and the
// stream, a thread of blood that falls to the pool, thinning and breaking into drops. Drawn under the vessels; nothing at vbBleedN 0.
vec4 vecBleed(vec2 w, float px) {
  vec4 inner = vec4(0.0);
  vec3 bc = vbBleedCol[0], bf = vbBleedCol[1], bd = vbBleedCol[2];
  for (int i = 0; i < 24; i++) {
    if (i >= vbBleedN) break;
    vec4 bE = vbBleedE[i], bB = vbBleedB[i];
    float a;
    vec3 bcol;
    if (bB.w > 1.5) {
      float u = max(w.y - bE.y, 0.0), lam = 26.0;
      float fall = clamp(u / max(bE.w - bE.y, 1.0), 0.0, 1.0);
      float sw = (bE.z - bE.x) * exp(-u / lam);
      float xc = bE.z - sw + 0.7 * sin(w.y * 0.06 - vbClock * 2.3) * smoothstep(0.1, 0.6, fall);
      float slope = sw / lam;
      float brk = bB.y * smoothstep(0.25, 0.85, fall);
      float ph = (w.y * 0.31 * (1.0 + 0.22 * sin(w.y * 0.047 + 1.3)) - vbClock * 9.0) / 6.2831853;
      float cell = floor(ph), bead = pow(max(sin(3.14159265 * (ph - cell)), 0.0), 0.55);
      float hv = fract(sin(cell * 12.9898 + 4.1) * 43758.5453);
      float r = bB.x * mix(1.0, 0.55, smoothstep(0.0, 0.9, fall)) * mix(1.0, 0.12 + (0.9 + 0.5 * hv) * bead, brk);
      float d = abs(w.x - xc) / sqrt(1.0 + slope * slope) - r;
      float lum = mix(0.5 + 0.5 * sin(w.y * 0.42 - vbClock * 13.0), bead, brk);
      a = (1.0 - smoothstep(-0.75 * px, 0.75 * px, d)) * bB.z * smoothstep(0.0, 3.0, w.y - bE.y) * (1.0 - smoothstep(bE.w - 1.5, bE.w + 0.5, w.y));
      bcol = mix(bc * 0.85, bf, 0.55 * lum + 0.35 * smoothstep(0.1, 0.9, clamp(-d / max(r, 1e-3), 0.0, 1.0)));
    } else {
      float dxl = w.x - bE.z;
      float sy = bE.x + bE.y * sin(w.x * 0.16 + vbClock * 1.7) + bE.w * (0.9 * sin(abs(dxl) * 0.4 - vbClock * 6.0) * exp(-abs(dxl) / 38.0) - 1.3 * exp(-dxl * dxl / 50.0));
      float ud = w.y - sy;
      float fy = clamp((w.y - VB_STO_Y0) / VB_STO_DY, 0.0, float(VB_STO_N - 1));
      int i0 = int(floor(fy)), i1 = min(i0 + 1, VB_STO_N - 1);
      vec2 s0 = VB_STO[i0], s1 = VB_STO[i1], sp = mix(s0, s1, fy - float(i0)), sl = (s1 - s0) / VB_STO_DY;
      float dIn = min((w.x - sp.x - bB.x) / sqrt(1.0 + sl.x * sl.x), (sp.y - bB.x - w.x) / sqrt(1.0 + sl.y * sl.y));
      float depth = clamp(ud / 95.0, 0.0, 1.0);
      bcol = mix(bc, bd, smoothstep(0.0, 1.0, depth));
      bcol = mix(bcol, bf * 1.2, 0.5 * smoothstep(0.4, 1.4, ud) * (1.0 - smoothstep(1.4, 3.6, ud)));
      bcol = mix(bcol, bd * 0.7, 0.5 * (1.0 - smoothstep(0.0, 9.0, dIn)));
      a = bB.z * smoothstep(-0.75 * px, 0.75 * px, dIn) * smoothstep(-0.75 * px, 0.75 * px, ud);
    }
    if (a > 0.0) inner = vbOver(vec4(min(bcol, vec3(1.0)) * a, a), inner);
  }
  return inner;
}
`;

/** The default text: vecBloodMix for 2 and SLOTS contributing streams (the current ordinary programs). C's wide-leaf program asks vecBloodGLSL(SLOTS_WIDE). */
export const VEC_BLOOD_GLSL = vecBloodGLSL(2, SLOTS);

// ── The heads' quads (Phase 1 "heads", blood-heads.js) ──
// ZOOM for the heads' vertex shader under the composite's names, so blood-heads.js headVS places each head exactly as the composite's
// does: the same spacing, the same stream, the same run on through a chained join.
const HEADS_ZOOM = `
precision highp float;
uniform float pxW;
flat out vec4 zoomA;
flat out vec3 zoomB;
${ZOOM_MATH}
void zoomOut() { vbZoomNums(pxW, zoomA, zoomB); }`;
/** The heads' vertex shader (blood-heads.js headVS over this module's rows, orange and zoom pieces under the composite's names). */
export const VEC_HEADS_VS = () => headVS({ zoom: HEADS_ZOOM, along: '', rows: rowsGLSL(NAMES_COMP), orange: orangeGLSL(NAMES_COMP), nSamples: N_SAMPLES });

/**
 * The uniforms the heads' program reads beyond the vertex shader's own (blood-heads.js headVS declares world, size, flow, rad, tube, axis,
 * bT, still, cssPx, chevInk, chevLight, revCol, inkLight, blendA, origin; pxW is shared by both stages). Composite names, since headVS has
 * them; `axis` is the bend texture (veins-gl setBend binds it there too). inv is the renderer core's own (gl_FragCoord.xy, y up → world).
 */
export const VEC_HEADS_UNIFORMS = Object.freeze(['inv', 'pxW', 'flowA', 'blendA', 'rad', 'noChev', 'noChevN', 'chevHole', 'chevHoleR', 'chevHoleN']);
/** The default hooks of the heads' fragment shader. */
export const HEAD_WEIGHT_ONE = 'float vecHeadWeight(int row, vec2 w) { return 1.0; }';
export const HEAD_ABOVE_NONE = 'vec4 vecAboveAt(vec2 p) { return vec4(0.0); }';
/**
 * The heads' fragment shader (blood-heads.js: one quad a head, premultiplied, blended ONE, ONE_MINUS_SRC_ALPHA over the picture after the
 * lumens; in the BLOOD pass limited by the stencil the lumens wrote, so only pixels the pass redrew get a head). It lays the head's shape
 * (chevHead, as COMP_FS's quads), clipped to its vessel's lumen across the axis, cut by the figure readings' boxes and holes, under the
 * over-blood overlays (G's vecAboveAt).
 *   weight (GLSL text): `float vecHeadWeight(int row, vec2 w)`, everything else that scales a head at a pixel and only the renderer's
 *   cell and tube data know: the vessel's own fade and dimming (a faded network must dim its heads: COMP_FS had the lumen's alpha), and
 *   where another vessel joins (no head there unless the two draw one pattern). The default is 1. Until the renderer core passes one,
 *   draw the arrowheads in the lumen instead (vbChevQuad 0): vecBlood then has the lumen's own alpha and ownership.
 *   above (GLSL text): vecAboveAt(vec2 p), premultiplied, what lies over the blood (G).
 */
export const VEC_HEADS_FS = (weight = HEAD_WEIGHT_ONE, above = HEAD_ABOVE_NONE) => `#version 300 es
precision highp float;
precision highp int;
uniform mat3 inv;                      // gl_FragCoord.xy (y up) → world
uniform float pxW;
uniform float flowA;
uniform vec3 blendA;
uniform highp sampler2D rad;
uniform vec4 noChev[12];
uniform int noChevN;
uniform vec4 chevHole[16];
uniform float chevHoleR[16];
uniform int chevHoleN;
flat in vec4 hC;
flat in vec4 hS;
flat in vec3 hInk, hRim;
out vec4 outColor;
${CHEV_GLSL}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
${weight}
${above}
void main() {
  vec2 w = (inv * vec3(gl_FragCoord.xy, 1.0)).xy;
  vec2 dw = w - hC.xy;
  float along = dot(dw, hC.zw), across = abs(dot(dw, vec2(-hC.w, hC.z)));
  vec2 c = chevHead(along, across, hS.x, pxW, hS.w) * hS.y;
  if (c.x + c.y <= 0.0) discard;
  int id = int(hS.z + 0.5);
  c *= vecHeadWeight(id, w);
  // Only inside the head's own lumen (its caliber midway, which sized the head): the rim never spills onto the casing of a thin vessel.
  float Rm = max(texelFetch(rad, ivec2(${LAST / 2 | 0}, id), 0).r, 0.3);
  c *= 1.0 - smoothstep(Rm - 0.5 * pxW, Rm + 0.5 * pxW, across);
  for (int i = 0; i < 12; i++) {
    if (i >= noChevN) break;
    vec2 qb = abs(w - (noChev[i].xy + noChev[i].zw) * 0.5) - (noChev[i].zw - noChev[i].xy) * 0.5;
    c *= smoothstep(-pxW, pxW, length(max(qb, 0.0)) + min(max(qb.x, qb.y), 0.0));
  }
  for (int i = 0; i < 16; i++) {
    if (i >= chevHoleN) break;
    vec4 hh = chevHole[i];
    float hr = chevHoleR[i], dh;
    if (hr < 0.0) { vec2 ab = hh.zw - hh.xy; float t = clamp(dot(w - hh.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); dh = length(w - hh.xy - ab * t) + hr; }
    else dh = length(max(max(hh.xy - w, w - hh.zw), 0.0)) - hr;
    c *= smoothstep(-pxW, pxW, dh);
  }
  float k = flowA * blendA.y;
  float ar = clamp(c.y * 0.75 * k, 0.0, 1.0), ac = clamp(c.x * k, 0.0, 1.0);
  vec4 hd = over(vec4(hInk * ac, ac), vec4(hRim * ar, ar));
  if (hd.a <= 0.0) discard;
  // Under the over-blood overlays (the ascites): sent through them so the blend lands where the lumen's own would.
  vec4 ab = vecAboveAt(w);
  hd.rgb = hd.rgb * (1.0 - ab.a) + hd.a * ab.rgb;
  outColor = hd;
}`;
