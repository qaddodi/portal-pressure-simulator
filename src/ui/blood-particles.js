// Blood style P (10 Nov 2026, the Tube renderer plan, brief C): the blood as particles, a third style in the composite beside D and E.
//
// Round cells when slow, stretched into short streaks by their speed, a brighter head and a fading tail, in two layers for depth
// (the shape of the "Depth tube mock" parts(): a capsule along the flow, radius 0.34 to 0.54 of the mock's unit, the mock's head ramp).
// It moves exactly as style E's pattern moves (blood-tile.js eNoise): the same two flow-map phases half a cycle apart with triangle
// weights, the same lane speeds by distance from the axis, the stream's distance D and drift, the same cell scales, so chained
// streams (a child carrying its root's pattern), stasis, reversal and the casts keep working with no other change. Only what is drawn
// in a cell changes: one particle, placed by an integer hash of (cell, lane, row). No sin hash, no texture read.
//
// pNoise has eNoise's arguments and one more, vd (the vessel's display speed, signed: its sign says which end is the head, its size
// how far the particle stretches). Three numbers the composite sets just before the call (as lnWb / lnWf / lnS are set for the
// streaks) because the call's arguments have no room for them: pLaneW (the world width of one lane: qy is across in lanes), pInvR (1 / the
// lumen's radius: the lane's distance from the axis, for its speed) and pDens (bloodAt's dens: how many cells hold a particle).
//
// dens thins the cells by a hash against it (the cell's own random number against 0.78 * dens, the mock's 78 % at a dens of 1), with a
// short soft edge so a change of dens fades particles in and out instead of popping them. The same expression feeds the mean.
//
// Amendment 1 (10 Nov, after the first look at the fitted view, "not enough streaks"): a particle is never under 0.9 px across and is
// always a dash (at least 2.2 radii of half-length), longer with speed, so the blood reads as streaks at the fitted view. The field
// fades to its exact mean coverage (density times the capsule's area over the cell's area) only where a whole cell is under 3 to 5
// pixels long and cannot show a dash.
import { D_CYCLE } from './blood-tile.js';

export const STYLE_P = 3;

/** The constants both the shader and its JS twin read (the mock's unit: a cell of 9 world units, particles 0.34 to 0.54 of it). */
export const P = {
  CYCLE: D_CYCLE,
  UNIT: 9,                    // the mock's cell length; a layer's cell here is the composite's cell (cellA), so one mock unit = cell / UNIT
  SIZE0: 0.34, SIZE1: 0.2,    // particle radius = (SIZE0 + SIZE1 h) mock units, kept to CAP of the lane's height
  CAP: 0.3,
  TAIL: 0.12,                 // half-length per unit of display speed (world units), kept to HL_MAX of the cell
  HL_MAX: 0.34,
  FLOOR_PX: 0.9,              // a particle is never narrower than this many pixels (radius)
  DASH: 2.2,                  // and its half-length is at least this many radii: always a dash
  MEAN_N: 8,                  // the mean's quadrature over the random size
  BRIGHT0: 0.6, BRIGHT1: 0.4, // a particle's brightness 0.6 to 1
  HEAD0: 0.4,                 // the tail's share of the head's brightness
  OCC: 0.78,                  // the share of cells that hold a particle at a dens of 1
  SOFT: 6,                    // the thinning's slope: a particle fades over 1/6 of the random number's range
  FRONT: { laneK: 2.0, sc: 1.0, tsc: 1.0, bright: 1.0, seed: 0 },
  BACK: { laneK: 1.25, sc: 0.7, tsc: 0.72, bright: 0.7, seed: 0x5bd1e995 },   // (more, smaller lanes: 5 against 8; slower; 0.7 of the brightness)
  CELL_PX: [3, 5],            // the cell's length in pixels: under the first the field is the mean, over the second the dashes are drawn
};

const f = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));

/** GLSL (no #version) that defines pNoise; needs `precision highp int` in the host. */
export const P_GLSL = `
const float P_CYCLE = ${f(P.CYCLE)};
float pLaneW = 1.0, pInvR = 1.0, pDens = 1.0;
uint pHash(uint a, uint b, uint c) {
  uint h = a * 0x9e3779b1u ^ b * 0x85ebca6bu ^ c * 0xc2b2ae35u;
  h ^= h >> 15; h *= 0x2c1b3c6du; h ^= h >> 12; h *= 0x297a2d39u; h ^= h >> 15;
  return h;
}
float pOn(float t, float h) { return clamp((t - h) * ${f(P.SOFT)}, 0.0, 1.0); }
float pOnMean(float t) {
  float lo = clamp(t - ${1 / P.SOFT}, 0.0, 1.0), hi = clamp(t, 0.0, 1.0);
  return lo + (hi - lo) * ${f(P.SOFT)} * (t - 0.5 * (lo + hi));
}
// The lane speed, as eNoise: 2 on the axis, a quarter of it at the wall.
float pLaneG(float ay) { return max(2.0, 16.0 * (1.0 - 0.64 * ay * ay)) * 0.125; }
// One layer at one flow-map phase (f: 0 to 1): the coverage of the particle in the pixel's cell and, where one could reach it, its neighbours'.
float pLayer(int id, float s, float qw, float f, float cell, float drift, float vd, float px, float t, float laneK, float sc, float tsc, uint seed) {
  float laneH = laneK * pLaneW, cl = cell * sc, kr = cl / ${f(P.UNIT)};
  float lane = floor(qw / laneH), qc = (lane + 0.5) * laneH;
  float g = pLaneG(min(abs(qc) * pInvR, 1.0));
  uint ul = uint(int(lane)), ui = uint(id);
  float lo = float(pHash(ul, ui, seed) & 0xffffu) / 65536.0 * 31.0;
  float u = ((s - g * f * P_CYCLE * tsc) / cell + drift) / sc + lo;
  float i = floor(u), fr = u - i;
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float hl0 = min(abs(vd) * g * 0.5 * tsc * ${f(P.TAIL)}, ${f(P.HL_MAX)} * cl);   // (the speed's half-length; a dash is never shorter than its radii, below)
  float rb = max(${f(P.SIZE0 + P.SIZE1)} * kr, ${f(P.FLOOR_PX)} * px);
  float reach = (min(max(hl0, ${f(P.DASH)} * rb), ${f(P.HL_MAX)} * cl) + rb) / cl;   // (how far a particle reaches from its place, in cells; the largest it can be)
  float a = 0.0;
  for (int k = -1; k <= 1; k++) {
    if (k == -1 && fr >= reach - 0.28) continue;   // (a place is 0.28 to 0.72 along its cell: the neighbour on either side is drawn only where it can reach)
    if (k == 1 && fr <= 1.28 - reach) continue;
    uint h1 = pHash(uint(int(i) + k), ul, ui + seed);
    uint h2 = pHash(h1, ul, seed + 7u);
    float hx = float(h1 & 0xffffu) / 65536.0, hy = float(h1 >> 16) / 65536.0;
    float hz = float(h2 & 0x7ffu) / 2048.0, hw = float((h2 >> 11) & 0x7ffu) / 2048.0, hb = float(h2 >> 22) / 1024.0;
    float r0 = min((${f(P.SIZE0)} + ${f(P.SIZE1)} * hz) * kr, ${f(P.CAP)} * laneH);
    r0 = max(r0, ${f(P.FLOOR_PX)} * px);                                   // (never under 0.9 px across at the fitted view)
    float hl = min(max(hl0, ${f(P.DASH)} * r0), ${f(P.HL_MAX)} * cl);   // (always a dash)
    float dx = (fr - float(k) - (0.28 + 0.44 * hx)) * cl;
    float dy = qw - qc - (hy - 0.5) * (laneH - 2.0 * r0) * 0.85;
    float d = length(vec2(max(abs(dx) - hl, 0.0), dy)) - r0;
    float head = mix(${f(P.HEAD0)}, 1.0, smoothstep(-hl - r0, hl + r0, dx * dir));
    a = max(a, clamp(0.5 - d / px, 0.0, 1.0) * pOn(t, hw) * (${f(P.BRIGHT0)} + ${f(P.BRIGHT1)} * hb) * head);
  }
  return a;
}
// A layer's mean coverage: the share of cells holding a particle, its mean brightness (0.8) and head ramp (0.7), times the capsule's mean
// area (pi r^2 + 4 hl r) over the cell's. The radius and half-length are the drawn ones, floored and dashed as pLayer has them; the mean over
// the random size is taken at MEAN_N midpoints.
float pMean(float cell, float ay, float vd, float t, float laneK, float sc, float tsc, float px) {
  float laneH = laneK * pLaneW, cl = cell * sc, kr = cl / ${f(P.UNIT)};
  float cap = ${f(P.CAP)} * laneH, a = ${f(P.SIZE0)} * kr, b = ${f(P.SIZE1)} * kr;
  float hl0 = min(abs(vd) * pLaneG(ay) * 0.5 * tsc * ${f(P.TAIL)}, ${f(P.HL_MAX)} * cl);
  float area = 0.0;
  for (int j = 0; j < ${P.MEAN_N}; j++) {
    float r = max(min(a + b * (float(j) + 0.5) / ${f(P.MEAN_N)}, cap), ${f(P.FLOOR_PX)} * px);
    float hl = min(max(hl0, ${f(P.DASH)} * r), ${f(P.HL_MAX)} * cl);
    area += 3.14159265 * r * r + 4.0 * hl * r;
  }
  return min(pOnMean(t) * ${f(P.BRIGHT0 + P.BRIGHT1 * 0.5)} * ${f((1 + P.HEAD0) / 2)} * area / (${f(P.MEAN_N)} * cl * laneH), 1.0);   // (a lane under a few pixels across is full)
}
// The blood as particles: the coverage 0 to 1 at arc length s and across qy (lanes), in eNoise's own arguments. vd: the display speed.
float pNoise(int id, float s, float qy, float D, float ay, float cell, float drift, float pxCell, float vd) {
  float qw = qy * pLaneW, px = max(pxCell * cell, 1e-6);
  float t = clamp(${f(P.OCC)} * pDens, 0.0, 1.0) * ${f(1 + 1 / P.SOFT)};
  float f0 = fract(D / P_CYCLE), f1 = fract(f0 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * f0), w1 = 1.0 - abs(1.0 - 2.0 * f1);
  float mF = pMean(cell, ay, vd, t, ${f(P.FRONT.laneK)}, ${f(P.FRONT.sc)}, ${f(P.FRONT.tsc)}, px);
  float mB = pMean(cell, ay, vd, t, ${f(P.BACK.laneK)}, ${f(P.BACK.sc)}, ${f(P.BACK.tsc)}, px);
  // (The mean only where a whole cell is under a few pixels long and cannot show a dash.)
  float kF = smoothstep(${f(P.CELL_PX[0])}, ${f(P.CELL_PX[1])}, cell * ${f(P.FRONT.sc)} / px), kB = smoothstep(${f(P.CELL_PX[0])}, ${f(P.CELL_PX[1])}, cell * ${f(P.BACK.sc)} / px);
  float F = mF, B = mB;
  if (kF > 0.0) {
    float c = 0.0;
    if (w0 > 0.0) c += w0 * pLayer(id, s, qw, f0, cell, drift, vd, px, t, ${f(P.FRONT.laneK)}, ${f(P.FRONT.sc)}, ${f(P.FRONT.tsc)}, ${P.FRONT.seed}u);
    if (w1 > 0.0) c += w1 * pLayer(id, s, qw, f1, cell, drift, vd, px, t, ${f(P.FRONT.laneK)}, ${f(P.FRONT.sc)}, ${f(P.FRONT.tsc)}, ${P.FRONT.seed}u);
    F = mix(mF, c, kF);
  }
  if (kB > 0.0) {
    float c = 0.0;
    if (w0 > 0.0) c += w0 * pLayer(id, s, qw, f0, cell, drift, vd, px, t, ${f(P.BACK.laneK)}, ${f(P.BACK.sc)}, ${f(P.BACK.tsc)}, ${P.BACK.seed}u);
    if (w1 > 0.0) c += w1 * pLayer(id, s, qw, f1, cell, drift, vd, px, t, ${f(P.BACK.laneK)}, ${f(P.BACK.sc)}, ${f(P.BACK.tsc)}, ${P.BACK.seed}u);
    B = mix(mB, c, kB);
  }
  return clamp(1.0 - (1.0 - F) * (1.0 - ${f(P.BACK.bright)} * B), 0.0, 1.0);
}`;

// ---- The JS twin (tests): the same arithmetic as P_GLSL, line for line. cfg = { laneW, invR, dens } is pLaneW, pInvR, pDens. ----
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const fract = (x) => x - Math.floor(x);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const u32 = (x) => x >>> 0;
/** pHash: the integer hash (uint multiply and xor-shift, as ditherOut does). */
export function pHash(a, b, c) {
  let h = u32(Math.imul(u32(a), 0x9e3779b1) ^ Math.imul(u32(b), 0x85ebca6b) ^ Math.imul(u32(c), 0xc2b2ae35));
  h = u32(h ^ (h >>> 15)); h = u32(Math.imul(h, 0x2c1b3c6d));
  h = u32(h ^ (h >>> 12)); h = u32(Math.imul(h, 0x297a2d39));
  return u32(h ^ (h >>> 15));
}
const pOn = (t, h) => clamp((t - h) * P.SOFT, 0, 1);
export function pOnMean(t) {
  const lo = clamp(t - 1 / P.SOFT, 0, 1), hi = clamp(t, 0, 1);
  return lo + (hi - lo) * P.SOFT * (t - 0.5 * (lo + hi));
}
export const pLaneG = (ay) => Math.max(2, 16 * (1 - 0.64 * ay * ay)) * 0.125;
/** The random numbers of one cell: place along (hx), place across (hy), size (hz), the thinning draw (hw), brightness (hb), all 0..1. */
export function pCellRand(i, lane, id, seed) {
  const ul = u32(lane | 0), ui = u32(id);
  const h1 = pHash(u32(i | 0), ul, u32(ui + seed)), h2 = pHash(h1, ul, u32(seed + 7));
  return { hx: (h1 & 0xffff) / 65536, hy: (h1 >>> 16) / 65536, hz: (h2 & 0x7ff) / 2048, hw: ((h2 >>> 11) & 0x7ff) / 2048, hb: (h2 >>> 22) / 1024 };
}
/** One cell's particle, in world units relative to its lane: where it sits (cx along from the cell's start, cy across from the lane's centre), its radius and half-length. */
export function pParticle(r, cell, vd, cfg, L, lane = 0, ay = 0, px = 0) {
  const laneH = L.laneK * cfg.laneW, cl = cell * L.sc, kr = cl / P.UNIT;
  const g = pLaneG(ay);
  const r0 = Math.max(Math.min((P.SIZE0 + P.SIZE1 * r.hz) * kr, P.CAP * laneH), P.FLOOR_PX * px);
  const hl = Math.min(Math.max(Math.min(Math.abs(vd) * g * 0.5 * L.tsc * P.TAIL, P.HL_MAX * cl), P.DASH * r0), P.HL_MAX * cl);
  return { cx: (0.28 + 0.44 * r.hx) * cl, cy: (r.hy - 0.5) * (laneH - 2 * r0) * 0.85, r0, hl, laneH, lane };
}
function pLayerJS(id, s, qw, fph, cell, drift, vd, px, t, L, cfg) {
  const laneH = L.laneK * cfg.laneW, cl = cell * L.sc, kr = cl / P.UNIT;
  const lane = Math.floor(qw / laneH), qc = (lane + 0.5) * laneH;
  const g = pLaneG(Math.min(Math.abs(qc) * cfg.invR, 1));
  const lo = (pHash(u32(lane | 0), u32(id), L.seed) & 0xffff) / 65536 * 31;
  const u = ((s - g * fph * P.CYCLE * L.tsc) / cell + drift) / L.sc + lo;
  const i = Math.floor(u), fr = u - i;
  const dir = vd < 0 ? -1 : 1;
  const hl0 = Math.min(Math.abs(vd) * g * 0.5 * L.tsc * P.TAIL, P.HL_MAX * cl);
  const rb = Math.max((P.SIZE0 + P.SIZE1) * kr, P.FLOOR_PX * px);
  const reach = (Math.min(Math.max(hl0, P.DASH * rb), P.HL_MAX * cl) + rb) / cl;
  let a = 0;
  for (let k = -1; k <= 1; k++) {
    if (k === -1 && fr >= reach - 0.28) continue;
    if (k === 1 && fr <= 1.28 - reach) continue;
    const r = pCellRand(i + k, lane, id, L.seed);
    const r0 = Math.max(Math.min((P.SIZE0 + P.SIZE1 * r.hz) * kr, P.CAP * laneH), P.FLOOR_PX * px);
    const hl = Math.min(Math.max(hl0, P.DASH * r0), P.HL_MAX * cl);
    const dx = (fr - k - (0.28 + 0.44 * r.hx)) * cl;
    const dy = qw - qc - (r.hy - 0.5) * (laneH - 2 * r0) * 0.85;
    const d = Math.hypot(Math.max(Math.abs(dx) - hl, 0), dy) - r0;
    const head = mix(P.HEAD0, 1, smoothstep(-hl - r0, hl + r0, dx * dir));
    a = Math.max(a, clamp(0.5 - d / px, 0, 1) * pOn(t, r.hw) * (P.BRIGHT0 + P.BRIGHT1 * r.hb) * head);
  }
  return a;
}
/** A layer's mean coverage (pMean). */
export function pMeanJS(cell, ay, vd, t, L, cfg, px) {
  const laneH = L.laneK * cfg.laneW, cl = cell * L.sc, kr = cl / P.UNIT;
  const cap = P.CAP * laneH, a = P.SIZE0 * kr, b = P.SIZE1 * kr;
  const hl0 = Math.min(Math.abs(vd) * pLaneG(ay) * 0.5 * L.tsc * P.TAIL, P.HL_MAX * cl);
  let area = 0;
  for (let j = 0; j < P.MEAN_N; j++) {
    const r = Math.max(Math.min(a + b * (j + 0.5) / P.MEAN_N, cap), P.FLOOR_PX * px);
    const hl = Math.min(Math.max(hl0, P.DASH * r), P.HL_MAX * cl);
    area += Math.PI * r * r + 4 * hl * r;
  }
  return Math.min(pOnMean(t) * (P.BRIGHT0 + P.BRIGHT1 * 0.5) * ((1 + P.HEAD0) / 2) * area / (P.MEAN_N * cl * laneH), 1);
}
/** The thinning threshold for a dens (pNoise's t). */
export const pThreshold = (dens) => clamp(P.OCC * dens, 0, 1) * (1 + 1 / P.SOFT);
/** pNoise, in JS: the same arguments as the shader's. cfg = { laneW, invR, dens }. */
export function pNoiseJS(id, s, qy, D, ay, cell, drift, pxCell, vd, cfg) {
  const qw = qy * cfg.laneW, px = Math.max(pxCell * cell, 1e-6), t = pThreshold(cfg.dens);
  const f0 = fract(D / P.CYCLE), f1 = fract(f0 + 0.5);
  const w0 = 1 - Math.abs(1 - 2 * f0), w1 = 1 - Math.abs(1 - 2 * f1);
  const layer = (L) => {
    const m = pMeanJS(cell, ay, vd, t, L, cfg, px);
    const k = smoothstep(P.CELL_PX[0], P.CELL_PX[1], cell * L.sc / px);
    if (!(k > 0)) return m;
    let c = 0;
    if (w0 > 0) c += w0 * pLayerJS(id, s, qw, f0, cell, drift, vd, px, t, L, cfg);
    if (w1 > 0) c += w1 * pLayerJS(id, s, qw, f1, cell, drift, vd, px, t, L, cfg);
    return mix(m, c, k);
  };
  const F = layer(P.FRONT), B = layer(P.BACK);
  return clamp(1 - (1 - F) * (1 - P.BACK.bright * B), 0, 1);
}
/** The mean of the whole field (union of the two layers' means, as pNoise gives it where the particles are too small to draw). */
export function pFieldMean(cell, ay, vd, cfg, px) {
  const t = pThreshold(cfg.dens);
  return 1 - (1 - pMeanJS(cell, ay, vd, t, P.FRONT, cfg, px)) * (1 - P.BACK.bright * pMeanJS(cell, ay, vd, t, P.BACK, cfg, px));
}
