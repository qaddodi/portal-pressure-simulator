// The compositor's lumen section, in one place both shaders include (Tube stage 3, brief S3-X; 10 Nov 2026): the compositor's
// COMP_FS (veins-gl.js) and the Tube's lumen shader (tube-lumen-glsl.js) draw the blood, the dye, the origin colours and the lymph
// from the same text, so the two cannot drift. Moved here as written (COMP_FS stays byte for byte what it was: tests/comp-fs-old-builds.test.js).
//
// None of these read the compositor's own layer targets (base, gbuf, gbuf2, halfL): they are given a row, an arc length s and an across y.
// They need the lumen uniforms (COMP_U, or compLumenUniforms() whole), `#define PLAIN 0|1` before them (the origin and dye switches
// are constants 0 when it is 1). The includer declares its own outputs; `rows` (the vessel rows count) is in COMP_U.rows.
import { SLOT, DYE_BINS, PERIOD, DRIFT_PERIOD, DRIFT_RATE } from './blood.js';
import { D_GLSL, E_GLSL, TILE_V_PER_ROW } from './blood-tile.js';
import { P_GLSL } from './blood-particles.js';

export const N_SAMPLES = 64;
export const ORIGIN_GREY = 0.62;       // the lumen's color while the blood is colored by origin
const SLOT_W = SLOT;
const S_OFF = 96;                      // arc length is stored offset by this, so it can run on past a vessel's start
export { S_OFF };
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

// Where along a vessel its colour stands at arc fraction u (pressure-along.js): the plain u for a row with no waist (its rad
// texels' b is −1), else the along curve between its samples. In both the vessel shader and the composite.
export const ALONG_GLSL = `
float alongAt(int id, float u) {
  float ui = u * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`;
// The vessels' rows as the composite and the arrowheads' quads read them (flow, rad: see COMP_FS): the caliber at s, a stream's
// distance and drift now, a chained vessel's root stream. One text for both shaders, so the two place every head alike.
export const ROWS_GLSL = `
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

// The uniforms (and the zoom's varyings and the blood tile) the lumen text above reads, as the compositor declared them, in pieces so
// COMP_FS can lay each where it always stood. Together (compLumenUniforms) they are every declaration the lumen text needs.
export const COMP_U = {
  samplers: `uniform highp sampler2D flow;          // per vessel: FLOW_TEXELS texels
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform highp sampler2D bend;          // per vessel: the axis's signed curvature at each sample (setBend)
uniform sampler2D dye;                 // per vessel: dye concentration along the course`,
  pxW: `uniform float pxW;                     // world units per device pixel`,
  speed: `uniform int lenOn;                     // 1: a streak's length follows its vessel's display speed (streak length with speed; ?streaklen=0 turns it off)
#if PLAIN == 0
uniform int origin;                    // 1: color parcels by where their blood came from
uniform int dyeOn;
#else
const int origin = 0, dyeOn = 0;
#endif`,
  ink: `uniform float clock;                   // seconds (wrapped), for the drift of stagnant blood
uniform highp float bT;                // the blood's own clock, from the stage's epoch (flowD: the streams advance here, not on the CPU)
uniform vec3 originCol[5];
uniform vec3 dyeCol;
uniform vec3 revCol;                   // the moving blood's color where flow runs backwards
uniform vec3 inkLight, inkDark;`,
  rows: `uniform float rows;`,
  zoom: `flat in vec4 zoomA;                    // the zoom's numbers for the streaks, worked out per vertex (ZOOM_VS)
flat in vec3 zoomB;
uniform highp sampler2D noiseT;        // blood style D's baked tile (blood-tile.js)
uniform int bloodStyle;                // 2: blood style E (blood-tile.js eNoise): the same streaks from sines, no texture read. 1: blood style D (blood-tile.js): the streaks from the baked tile, which then sits on the noise unit; (style D until its tile is baked: style E)`,
};
export const compLumenUniforms = () => [COMP_U.samplers, COMP_U.pxW, COMP_U.speed, COMP_U.ink, COMP_U.rows, COMP_U.zoom].join('\n');

// The constants it reads (SLOT, BINS, S_OFF, ORIGIN_GREY, N_LAST, LANE_K).
export const compConsts = () => `const float SLOT = ${SLOT_W}.0;
const float BINS = ${DYE_BINS}.0;
const float S_OFF = ${S_OFF}.0;
const float ORIGIN_GREY = ${ORIGIN_GREY};
const int N_LAST = ${N_SAMPLES - 1};
const float LANE_K[7] = float[7](${LANE_K.map((k) => k.toFixed(4)).join(', ')});`;
// hsh, h01 and over: the hash and the blend the noise and the layering use.
export const compBasics = () => `uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }`;
// The blood: the noise styles, the particles, the rows' readers (radAt, flowD, flowDrift, rootDD), lymphAt, castAt, bloodAt, originAt.
export const compBloodFns = () => `// The octaves' shares of the shimmer's noise (0.62 coarse, 0.38 fine), set per vessel by bloodAt: with the streaks' length following the
// vessel's speed (lenOn) the fine octave's share falls toward 0 for a fast vessel (its streaks run long) and rises for a slow one (short
// dashes), and lnS evens the spread (lnS 1: as always). Only the shares change, never a coordinate, so nothing in a streak moves for it.
float lnWb = 0.62, lnWf = 0.38, lnS = 1.0;
${D_GLSL}
${E_GLSL}
${P_GLSL}
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
  } else if (bloodStyle == 3) {
    // Style P (blood-particles.js pNoise): particles in eNoise's own pattern coordinates, so the chained stream, stasis and reversal work
    // as in E. dens (computed below for every style, the same arithmetic again here) thins the cells through pDens; pLaneW and pInvR give the
    // lanes' width and their distance from the axis. A chained child's particles stretch by its root's speed.
    float laneW = max(0.55 * 1.6 * R / clamp(1.7 * R / Lg, 1.0, 7.0), 3.2 * pxW);
    float cA = 5.12 * sA, cB = 5.12 * sB;
    float sxP = zoomB.z, ovP = max(flux * sxP / (max(abs(vd), 2.0) * sumK), 1.0);
    pLaneW = laneW; pInvR = 1.0 / max(R, 1e-3);
    pDens = sqrt(clamp(max(min(1.0, flux * sxP / (max(abs(vd), 2.0) * sumK)), 0.6 * stasis), 0.0, 1.0)) * (1.0 + 0.35 * clamp(2.885 * (ovP - 1.0) / (ovP + 1.0), 0.0, 1.0));
    if (cw < 1.0) {
      nz = pNoise(id, s, qy, D, ay, cA, drift, pxW / cA, vd);
      if (lf > 0.0) nz = mix(nz, pNoise(id, s, qy, D, ay, cB, drift, pxW / cB, vd), lf);
    }
    if (cw > 0.0) {
      int rid = int(ch4.x + 0.5) - 1;
      vec2 ch5 = rootDD(rid, texelFetch(flow, ivec2(5, id), 0).xy);
      float se = ch4.y + ch4.z * s, bs = max(abs(ch4.z), 1e-3), vr = texelFetch(flow, ivec2(0, rid), 0).y;
      float nc = pNoise(rid, se, qy, ch5.x, ay, cA, ch5.y, pxW / cA * bs, vr);
      if (lf > 0.0) nc = mix(nc, pNoise(rid, se, qy, ch5.x, ay, cB, ch5.y, pxW / cB * bs, vr), lf);
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
  if (bloodStyle == 3) streak = nz;   // (style P: the particles' coverage as it is)
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
}`;
// The axis's signed curvature (the arrowheads and the lumen both read it).
export const compBendFn = () => `// The axis's signed curvature at arc length s (1 / world units; positive turning toward +y).
float bendAt(int id, float s, float len) {
  float ui = clamp(s / len, 0.0, 1.0) * ${N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${N_SAMPLES - 2});
  return mix(texelFetch(bend, ivec2(i0, id), 0).r, texelFetch(bend, ivec2(i0 + 1, id), 0).r, ui - float(i0));
}`;
// The dye's column and its leading edge.
export const compDyeFns = () => `// Dye concentration in one lumen: the column's front is bullet-shaped, the axis ahead of the wall
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
}`;
// The whole of it for another shader: the constants, the basics, the blood, the bend and the dye, after compLumenUniforms().
export const compLumenFns = () => [compConsts(), compBasics(), compBloodFns(), compBendFn(), compDyeFns()].join('\n');
