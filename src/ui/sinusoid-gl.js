// The sinusoid view on the GPU (WebGL2): the tissue is one full-screen shader, evaluated per pixel in
// the sinusoid's own frame (micrometres, x along the flow, y across), and what moves through the wall
// (albumin, plasma water) is a pass of flat point sprites over it, with the stellate and Kupffer cells drawn over those.
//
// Every repeated structure (the hepatocytes of each plate, the fenestrae, the endothelial nuclei) is
// placed by an integer hash that this file also exports to JavaScript, so the traffic (sinusoid-view.js)
// goes through the same pores the shader opens, and the labels point at the same cells.
//
// createSinusoidGL(canvas) returns null when WebGL2 is unavailable.

// ── Shared placement (identical in GLSL and JavaScript) ──
const hsh = (x) => {
  x >>>= 0;
  x = (x ^ (x >>> 16)) >>> 0; x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
/** A hash of (i, seed) in [0, 1), 24 bits, as the shader's h1. */
import { CHEV_GLSL } from './chevron-glsl.js?v=96ec7c6666';
export const h1 = (i, s) => (hsh((Math.imul((i + 1048576) >>> 0, 0x9e3779b1) ^ hsh(s)) >>> 0) >>> 8) / 16777216;
export const SLOT = 1;                    // fenestra slots (µm), ten to a stretch of lining with a sieve plate in it
export const CELL = 24;                   // hepatocyte pitch along a plate (µm)
/** The fenestra in slot j of a lining (seed), or null: its centre, full width and closing threshold. */
export function poreAt(j, sd) {
  const G = Math.floor(j / 10), k = j - 10 * G;
  if (h1(G, sd) >= 0.8 || k < 3 || k > 7 || h1(j, sd + 1) >= 0.8) return null;
  return { x: SLOT * j + 0.5 + 0.2 * (h1(j, sd + 2) - 0.5), w: 0.32 + 0.16 * h1(j, sd + 3), th: h1(j, sd + 4) };
}
/** Boundary j of a plate's cells (seed). */
export const cellEdge = (j, sd) => CELL * j + 7 * (h1(j, sd) - 0.5);
/** The cell of a plate (seed) holding x: its ends and its nucleus (u along, v across, radius, two nuclei). */
export function cellAt(x, sd) {
  let j = Math.floor(x / CELL);
  if (x < cellEdge(j, sd)) j--; else if (x >= cellEdge(j + 1, sd)) j++;
  return { j, x0: cellEdge(j, sd), x1: cellEdge(j + 1, sd), nu: 0.3 + 0.4 * h1(j, sd + 1), nv: 0.4 + 0.2 * h1(j, sd + 2), nr: 2.6 + 0.5 * h1(j, sd + 3), bi: h1(j, sd + 4) < 0.12 };
}
// Seeds: the main sinusoid's linings (upper, lower), its plates (upper, lower; the next plate out adds 13).
export const SEED = { poreUp: 3, poreDn: 5, nucUp: 41, nucDn: 42, plateUp: 29, plateDn: 71 };
export const UM = { lum: 5, endo: 0.8, disse: 3.4, hep: 20 };

const VS = `#version 300 es
layout(location=0) in vec2 corner;
uniform vec2 size;
out vec2 vP;
void main() { vP = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5) * size; gl_Position = vec4(corner, 0.0, 1.0); }`;


// The zoom from the lobule (see sinusoid-view.js): where the view is shown yet (the vessel, then the
// plates along it, then everything), and how much of its detail has come in, from the middle out.
const COMMON = `
uniform vec3 uI0, uI1;          // device px → local µm
uniform vec2 size;
uniform float uPx;              // µm per device px
uniform vec4 uRev;              // shown: alpha, from x (µm, toward the portal side), to x, half-height |y|
uniform float uAll;             // shown everywhere
uniform float uFocus;           // how far the tissue beyond its own plates fades into the page (eased in as the zoom lands)
uniform vec2 uDet;              // detail: amount, half-length (µm) of the stretch that has it
float sat(float x) { return clamp(x, 0.0, 1.0); }
float revealA(vec2 l) {
  // Soft edges (µm): long at the ends of the run, so the vessel fades into the lobule's own; short across it.
  float ex = max(8.0, 14.0 * uPx), ey = max(2.0, 5.0 * uPx);
  float inX = smoothstep(uRev.y - ex, uRev.y + ex, l.x) * (1.0 - smoothstep(uRev.z - ex, uRev.z + ex, l.x));
  float inY = 1.0 - smoothstep(uRev.w - ey, uRev.w + ey, abs(l.y));
  return max(uRev.x * inX * inY, uAll);
}
float detailAt(float x) { return uDet.x * (1.0 - smoothstep(uDet.y, uDet.y + 30.0, abs(x))); }`;

const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vP;
out vec4 o;
${COMMON}
uniform int uPass;              // 0: the tissue; 1: the cells that lie over the moving particles (stellate, Kupffer)
uniform float uLum, uPinch, uXs, uXk, uKy, uHscA, uCol, uBm, uMv, uAct, uPor, uFlow, uLym, uDir, uDark, uShim, uStreak;
uniform vec3 cBg, cShade, cLumen, cLymph, cCell, cUnder, cNuc, cCol, cBm, cBile, cEndo, cEndoN, cHscQ, cHscA, cHscN, cKup, cKupN, cKupE, cRbc, cChev, cRev, cEndF, cEndE;
uniform float aBm;
uniform vec4 uEnd;               // the end arrows: portal x, central x (µm), size (µm), alpha
uniform vec2 uLab;               // the lumen's own name: x and half length (µm), kept clear of the arrowheads

const float ENDO = ${UM.endo.toFixed(2)}, DISSE = ${UM.disse.toFixed(2)}, HEP = ${UM.hep.toFixed(1)}, LUM0 = ${UM.lum.toFixed(1)};
const float SLOT = ${SLOT.toFixed(2)}, CELL = ${CELL.toFixed(1)};

uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h1(int i, int s) { return float(hsh((uint(i + 1048576) * 0x9e3779b1u) ^ hsh(uint(s))) >> 8) / 16777216.0; }
float cov(float d) { return 1.0 - smoothstep(-0.7 * uPx, 0.7 * uPx, d); }
float line(float d, float w) { return cov(abs(d) - max(0.5 * w, 0.55 * uPx)); }   // a line at least about a pixel wide
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdE(vec2 p, vec2 ab) { float k0 = length(p / ab), k1 = length(p / (ab * ab)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdTaper(vec2 p, vec2 a, vec2 b, float ra, float rb) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * sat(dot(v0, e0) / dot(e0, e0)), q1 = v1 - e1 * sat(dot(v1, e1) / dot(e1, e1)), q2 = v2 - e2 * sat(dot(v2, e2) / dot(e2, e2));
  float sg = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), sg * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), sg * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), sg * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float dot2(vec2 v) { return dot(v, v); }
// The distance to a quadratic Bézier (A, control B, C) and where along it (t), for smooth tapered processes.
vec2 sdBez(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A, b = A - 2.0 * B + C, c = a * 2.0, d = A - pos;
  float kk = 1.0 / max(dot(b, b), 1e-6), kx = kk * dot(a, b), ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0, kz = kk * dot(d, a);
  float p = ky - kx * kx, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz, h = q * q + 4.0 * p * p * p;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0, uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = sat(uv.x + uv.y - kx);
    return vec2(length(d + (c + b * t) * t), t);
  }
  float z = sqrt(-p), v = acos(clamp(q / (p * z * 2.0), -1.0, 1.0)) / 3.0, m = cos(v), n = sin(v) * 1.732050808;
  vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
  float d1 = dot2(d + (c + b * t.x) * t.x), d2 = dot2(d + (c + b * t.y) * t.y);
  return d1 < d2 ? vec2(sqrt(d1), t.x) : vec2(sqrt(d2), t.y);
}
// A smooth process: a Bézier stroke tapering from radius ra to rb.
float sdProc(vec2 p, vec2 A, vec2 B, vec2 C, float ra, float rb) { vec2 r = sdBez(p, A, B, C); return r.x - mix(ra, rb, r.y); }
${CHEV_GLSL}
// Flat fill, no outline, as the lobule draws its cells: a shape reads by its colour against what is under it.
vec3 paint(vec3 under, vec3 fill, float d) { return mix(under, fill, cov(d)); }

float halfW(float x) { return uLum * (1.0 - uPinch * exp(-pow((x - uXs) / 11.0, 2.0))) + 0.15 * sin(x * 0.11 + 1.3); }
float disseW(float x) { return DISSE * (1.0 + 0.25 * uCol) + 0.2 * sin(x * 0.07); }

// ── Fenestrae (as poreAt) and the endothelium ──
float poreOpen(int j, int sd, out float px) {
  int G = int(floor(float(j) / 10.0)), k = j - 10 * G;
  px = 0.0;
  if (h1(G, sd) >= 0.8 || k < 3 || k > 7 || h1(j, sd + 1) >= 0.8) return 0.0;
  px = SLOT * float(j) + 0.5 + 0.2 * (h1(j, sd + 2) - 0.5);
  float th = h1(j, sd + 4);
  return (0.32 + 0.16 * h1(j, sd + 3)) * smoothstep(th - 0.14, th + 0.14, uPor);
}
// The endothelium of a lining at |y| = a (lumen face at hw): one thin, even sheet, the open fenestrae cut through it
// as small round-ended pores (they close, one by one, as it defenestrates), and the flat nuclei bulging gently into
// the lumen; with little detail (as the lobule draws it) a hairline casing.
float sdEndo(float x, float a, float hw, int sd, int nsd, bool skipK, float det, out float dN) {
  float th = mix(0.1, 0.16, det) * (1.0 + 0.45 * (1.0 - uPor));   // half its thickness (a little thicker as it capillarizes)
  float d = abs(a - (hw + ENDO * 0.5)) - th;
  dN = 1e3;
  if (det < 0.02) return d;
  int j = int(floor(x / SLOT));
  for (int k = -1; k <= 1; k++) {
    float px;
    float w = poreOpen(j + k, sd, px) * det;
    if (w > 0.02) d = smax(d, -(abs(x - px) - 0.5 * w), th);
  }
  if (nsd > 0) {
    int n = int(floor(x / 38.0));
    for (int k = -1; k <= 1; k++) {
      float c = 38.0 * float(n + k) + 8.0 + 22.0 * h1(n + k, nsd);
      if (skipK && abs(c - uXk) < 12.0) continue;
      d = smin(d, sdE(vec2(x - c, a - (hw + ENDO * 0.5)), vec2(4.6, th + 0.55 * det)), 1.6);
      dN = min(dN, sdE(vec2(x - c, a - (hw + ENDO * 0.5) + 0.12 * det), vec2(3.0, 0.32 * det + 0.01)));
    }
  }
  return d;
}
// The endothelial cells: one flat, slightly translucent sheet (the lumen and Disse tint it; no outline, so the pores
// read as clean gaps, not boxes), the nucleus a deeper, smooth lens.
vec3 endoInk(vec3 under, float d, float dN, float x, float det) {
  vec3 c = mix(under, mix(cEndo, cEndoN, 0.3 * det), cov(d) * mix(0.95, 0.85, det));
  c = mix(c, mix(cEndoN, cEndo, 0.4), cov(dN) * 0.8);
  return mix(c, cEndoN, line(dN, 0.05) * 0.35 * det);
}

// ── The lumen, flat as the lobule's: pressure colour, a thin light line and a thin dark one, the streaks and chevrons ──
vec3 lumen(float x, float y, float hw, int lane0, bool chev) {
  vec3 c = cLumen;
  c = mix(c, vec3(1.0), 0.28 * line(y + hw - 0.5, 0.16));
  c = mix(c, vec3(0.0), 0.1 * line(y - hw + 0.5, 0.16));
  // Streaks in lanes, each at its lane's speed (the parabolic profile: fastest in the middle).
  const float NL = 9.0;
  float r = clamp(y / hw, -1.0, 1.0), u = (r * 0.5 + 0.5) * NL, li = min(floor(u), NL - 1.0), lc = (li + 0.5) / NL * 2.0 - 1.0;
  int id = int(li) + lane0;
  float prof = 1.8 * (1.0 - lc * lc) + 0.05, P = 15.0 + 7.0 * h1(id, 7);
  float sx = x - uFlow * prof + h1(id, 8) * P, k = floor(sx / P), xx = sx - k * P;
  int ki = int(k);
  float hk = h1(ki * 31 + id, 9), Ls = 4.0 + 6.0 * hk, x0 = (P - Ls) * h1(ki + id * 977, 10);
  float e = (xx - x0) / Ls;
  float along = smoothstep(0.0, 0.35, e) * (1.0 - smoothstep(0.55, 1.0, e));
  float yc = (lc + (h1(ki, id + 11) - 0.5) * 0.6 / NL) * hw;
  // As the app's shimmer: soft streaks of light (not painted lines) over a faint glow along the axis.
  float wy = min(max(0.35, 2.8 * uPx), 0.3 * hw / NL), acr = exp(-pow((y - yc) / wy, 2.0));
  float rr = 1.0 - r * r;
  c = mix(c, vec3(1.0), 0.07 * rr * rr * uShim / 0.5);
  // (Wide and soft, so a streak glides across pixel rows instead of flickering; each breathes in and out gently.)
  float tw = 0.7 + 0.3 * sin(uFlow * 0.15 + hk * 6.2832);
  c = mix(c, vec3(1.0), along * acr * step(0.25, hk) * uShim * 0.42 * tw);
  if (chev) {
    // The flow's arrowheads, the app's own (chevHead, as every vessel draws them): a slim filled head with a notched
    // back, dark (orange where the flow runs backwards) with a faint light rim, one fixed shape, moving with the blood.
    // Sized as they show on the anatomy's veins; none by the ends' labels, and none over the Kupffer cell.
    float cw = min(0.5 * uLum, 0.42 * uEnd.z), L = 1.6 * cw, Pc = 24.0;
    float xc = mod(x - uFlow + 0.5 * Pc, Pc) - 0.5 * Pc, xh = x - xc;
    vec2 ch = chevHead(xc * uDir, abs(y), cw, uPx);
    // (Long, soft fades: a head moving past one dims over a good stretch of its path, it never blinks out. Each end's
    // name lies beyond its arrow, toward its venule.)
    float s = uEnd.z, fe = smoothstep(4.0 * s, 6.5 * s, abs(xh - uEnd.x)) * smoothstep(4.0 * s, 6.5 * s, abs(xh - uEnd.y));
    float fade = uEnd.w > 0.0 ? fe : 1.0;
    fade *= smoothstep(uLab.y + 0.3 * L, uLab.y + 3.0 * L, abs(xh - uLab.x));
    fade *= smoothstep(7.0, 11.0, abs(xh - uXk));
    c = mix(c, vec3(1.0), ch.y * 0.75 * fade);
    c = mix(c, uDir < 0.0 ? cRev : cChev, ch.x * fade);
  }
  return c;
}

// ── The space of Disse: lymph running back to the portal triad; collagen and microvilli as the detail comes in ──
vec3 disse(float x, float a, float wi, float hi, int side, bool main, float det) {
  vec3 c = cLymph;
  for (int j = 0; j < 2; j++) {
    float P = 9.0 + 3.0 * float(j), sx = x - uLym * (0.8 + 0.12 * float(j)) + 4.1 * float(j) + (main ? 0.0 : 3.0), k = floor(sx / P), xx = sx - k * P;
    float L = 2.2 + 1.6 * h1(int(k) * 7 + j, 21 + side), x0 = (P - L) * h1(int(k) + j * 131, 23 + side), e = (xx - x0) / L;
    float al = smoothstep(0.0, 0.3, e) * (1.0 - smoothstep(0.65, 1.0, e));
    c = mix(c, vec3(1.0), al * line(a - mix(wi, hi, 0.3 + 0.36 * float(j)), 0.18) * uStreak);
  }
  if (!main) return c;
  // Collagen: a pale fill as it takes the space the lymph had, then banded fibre bundles laid down by the
  // stellate cell: they start at it and spread along Disse, each thickening at its own stage.
  if (uCol > 0.02) {
    c = mix(c, cCol, (0.36 - 0.08 * uDark) * smoothstep(0.1, 0.9, uCol));
    float near = side < 0 ? exp(-pow((x - uXs) / 26.0, 2.0)) * uAct * 0.08 : 0.0;
    float reach = 14.0 + 320.0 * smoothstep(0.0, 0.8, uCol) * (side < 0 ? 1.0 : 0.8);
    float spread = 1.0 - smoothstep(reach - 30.0, reach, abs(x - uXs - (side < 0 ? 0.0 : 18.0)));
    float bd = smoothstep(0.3, 0.1, uPx) * det;                   // the cross-banding, only once it is resolved
    vec3 fib = cCol * 0.9, fibE = cCol * 0.72;
    for (int i = 0; i < 7; i++) {
      float al = smoothstep(float(i) / 7.0 * 0.8, float(i) / 7.0 * 0.8 + 0.22, uCol) * det * spread;
      if (al < 0.01) continue;
      int sd = side < 0 ? 91 : 92;
      float v = 0.15 + 0.7 * h1(i, sd), f = 0.12 + 0.12 * h1(i, sd + 7), ph = 6.2831853 * h1(i, sd + 9);
      float tc = clamp(v + 0.12 * sin(x * f + ph) + 0.05 * sin(x * f * 2.7 + ph * 1.7) + near, 0.08, 0.92);
      float w = (0.2 + (0.5 + 0.3 * h1(i, sd + 3)) * al * uCol) * (hi - wi) * 0.22;
      float d = abs(a - mix(wi, hi, tc)) - 0.5 * w;
      if (d > 0.4) continue;
      // Striated like collagen under the microscope: light and dark bands across the bundle, and a fibril seam along it.
      float band = 0.5 + 0.5 * sin(6.2831853 * x / 1.1 + ph);
      vec3 fc = mix(fib, fibE, (0.05 + 0.15 * band) * bd);
      fc = mix(fc, fibE, line(a - mix(wi, hi, tc) - 0.18 * w * sin(x * 0.9 + ph), 0.06) * 0.15 * bd);
      c = mix(c, fc, cov(d) * al * 0.5);           // translucent, like the lobule's fibrous bands
      c = mix(c, fibE, line(d, 0.06) * al * 0.18);
    }
  }
  // Microvilli: fine strokes from the hepatocytes' face, flattened as the space fills with collagen.
  if (uMv * det > 0.02) {
    float pi = floor(x / 0.8), hx = (pi + 0.5) * 0.8 + 0.22 * (h1(int(pi), 61 + side) - 0.5);
    float len = (hi - wi) * 0.5 * uMv * det * (0.55 + 0.45 * h1(int(pi), 63 + side));
    float d = sdTaper(vec2(x, a), vec2(hx, hi + 0.2), vec2(hx + 0.1 * sin(pi), hi - len), 0.075, 0.06);
    c = mix(c, mix(cCell, cUnder, 0.25), cov(d));
  }
  // The basement membrane, as the sinusoid becomes a capillary.
  if (uBm > 0.02) c = mix(c, cBm, line(a - wi - 0.3, 0.3 + 0.2 * uBm) * uBm * aBm * det);
  return c;
}

// ── A hepatocyte plate: v from its face on Disse (0) to its far side (HEP) ──
// Tidy polygonal cells, as a textbook draws them: each border a straight line with one gentle bend (so neighbours
// fit like tiles), rounded corners, a flat fill a shade lighter inside, a fine membrane, and a round nucleus.
float cellEdge(int j, int sd) { return CELL * float(j) + 7.0 * (h1(j, sd) - 0.5); }
float edgeAt(int j, int sd, float v) {
  float vm = HEP * (0.3 + 0.4 * h1(j, sd + 9)), bend = 4.0 * (h1(j, sd + 10) - 0.5), tilt = 2.6 * (h1(j, sd + 11) - 0.5);
  return cellEdge(j, sd) + bend * (abs(v - vm) / (0.5 * HEP) - 0.5) + tilt * (v / HEP - 0.5);
}
vec3 plate(float x, float v, int sd, float det) {
  int j = int(floor(x / CELL));
  if (x < edgeAt(j, sd, v)) j--; else if (x >= edgeAt(j + 1, sd, v)) j++;
  float x0 = cellEdge(j, sd), x1 = cellEdge(j + 1, sd);
  float inner = smin(smin(x - edgeAt(j, sd, v), edgeAt(j + 1, sd, v) - x, 2.4), smin(v, HEP - v, 2.4), 2.4);
  float d = 0.5 - inner;
  vec3 c = cCell * (0.975 + 0.04 * h1(j, sd + 5));
  c = mix(c, vec3(1.0), (0.05 - 0.03 * uDark) * smoothstep(-1.5, -6.0, d));     // a shade lighter inside
  c = mix(c, cUnder, 0.16 * smoothstep(-1.2, 0.0, d));                          // and deeper at the membrane
  c = mix(c, mix(cUnder, cNuc, 0.3), line(d + 0.2, 0.1) * 0.3 * det);          // the membrane, fine
  bool bi = h1(j, sd + 4) < 0.12;
  float nu = 0.3 + 0.4 * h1(j, sd + 1), nv = 0.4 + 0.2 * h1(j, sd + 2), nr = 2.6 + 0.5 * h1(j, sd + 3);
  for (int k = 0; k < 2; k++) {
    if (k == 1 && !bi) break;
    float uu = bi ? nu + (k == 0 ? -0.15 : 0.15) : nu, vv = nv + (k == 1 ? 0.04 : 0.0), rr = bi ? nr * 0.82 : nr;
    vec2 nq = vec2(x, v) - vec2(mix(x0 + 2.0, x1 - 2.0, uu), mix(2.0, HEP - 2.0, vv));
    // The nucleus: a flat, deeper disc with a fine envelope and a nucleolus.
    float dn = length(nq) - rr;
    c = mix(c, mix(c, cNuc, 0.24), cov(dn));
    c = mix(c, mix(c, cNuc, 0.45), line(dn + 0.08, 0.14) * det);
    c = mix(c, mix(c, cNuc, 0.6), cov(length(nq - vec2(0.3, -0.25) * rr) - 0.16 * rr) * det);
  }
  vec3 outC = mix(cUnder, c, cov(d) * 0.96);
  // Bile canaliculi between neighbouring cells, mid-plate.
  for (int k = 0; k < 2; k++) outC = mix(outC, cBile, cov(sdE(vec2(x - edgeAt(j + k, sd, 0.5 * HEP), v - 0.5 * HEP), vec2(0.5, 0.36))) * 0.75 * det);
  return outC;
}

// ── The stellate (Ito) cell, in the upper Disse; p = (x, depth from the axis) ──
// Drawn as a textbook figure: one smooth, continuous membrane around a body lying along the sinusoid and its tapered
// processes, which curve down onto the endothelium and run along it; inside, only its nucleus (as NEJM draws it).
// Quiescent it is plump and pale; activated (a myofibroblast) it lengthens and darkens, and its processes grow long,
// with finer branches reaching up between the hepatocytes.
float hscL() { return 4.4 + 2.4 * uAct; }
float hscW() { return 1.4 - 0.2 * uAct; }
float hscWall(float x) { return halfW(x) + ENDO + 0.42; }
float sdHsc(vec2 p) {
  float L = hscL(), Wd = hscW();
  vec2 b = p - vec2(uXs, uHscA);
  float d = sdE(b, vec2(L, Wd));
  for (int i = 0; i < 2; i++) {
    float sg = i == 0 ? -1.0 : 1.0;
    // Down from the body's flank onto the wall, then along it (two Bézier strokes that meet at the same width).
    float xA = uXs + sg * 0.62 * L, xB = uXs + sg * (L + 0.6), xC = uXs + sg * (L + 4.2);
    float len = 5.0 + 11.0 * uAct, xE = xC + sg * len, xD = 0.5 * (xC + xE);
    vec2 A = vec2(xA, uHscA - 0.1 * Wd), B = vec2(xB, hscWall(xB) + 0.15), C = vec2(xC, hscWall(xC)), E = vec2(xE, hscWall(xE));
    float rA = 0.62 + 0.1 * uAct, rC = 0.28 + 0.08 * uAct;
    d = smin(d, sdProc(p, A, B, C, rA, rC), 1.0);
    d = smin(d, sdProc(p, C, vec2(xD, hscWall(xD)), E, rC, 0.06), 0.25);
    // Activated: a finer branch curving up between the hepatocytes (it grows out of the process, never pops in).
    if (uAct > 0.02) {
      float xF = xC + sg * 1.2, wF = hscWall(xF);
      d = smin(d, sdProc(p, vec2(xF, wF), vec2(xF + sg * 2.6, wF + 0.4), vec2(xF + sg * 3.4, wF + disseW(xF) * 0.85), 0.2, 0.05) + 0.8 * (1.0 - uAct), 0.3);
    }
  }
  return d;
}
vec4 hsc(vec2 p) {
  float d = sdHsc(p);
  if (d > 0.3) return vec4(0.0);
  float L = hscL(), Wd = hscW();
  vec3 c = mix(cHscQ, cHscA, uAct);
  c = mix(c, mix(c, vec3(1.0), 0.18 - 0.08 * uDark), smoothstep(-0.2, -1.2, d));   // a shade lighter inside
  // Activated: faint stress fibres along the body.
  if (uAct > 0.05) {
    float fb = 0.0;
    for (int i = -1; i <= 1; i++) fb = max(fb, line(p.y - uHscA - float(i) * 0.38 * Wd - 0.1 * sin((p.x - uXs) * 0.5 + float(i) * 2.0), 0.06));
    c = mix(c, cHscN, fb * 0.28 * uAct * cov(d + 0.35));
  }
  // The nucleus: a smooth oval, a fine envelope and a nucleolus.
  vec2 nc = vec2(uXs, uHscA);
  float dn = sdE(p - nc, vec2(1.15 + 0.9 * uAct, 0.5 + 0.05 * uAct));
  c = mix(c, mix(c, cHscN, 0.7), cov(dn));
  c = mix(c, cHscN, line(dn, 0.06) * 0.5);
  c = mix(c, cHscN * 0.8, cov(length(p - nc - vec2(0.3, 0.0)) - 0.18) * 0.6);
  // One continuous membrane around body and processes alike.
  float mem = line(d, 0.08);
  c = mix(c, cHscN, mem * 0.55);
  // Slightly translucent, as a journal figure's cells: what passes beneath shows faintly through.
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)) * max(0.84, mem));
}

// ── The Kupffer cell: a macrophage anchored on the lower lining, reaching into the stream ──
// A smooth, rounded body on a foot spread over the endothelium, two short blunt pseudopods, a kidney-shaped nucleus,
// a phagosome holding a red cell it has taken up, a few lysosomes; flat, slightly translucent, a fine membrane line.
float sdKup0(vec2 q) {
  float d = sdE(q - vec2(0.0, -2.5), vec2(2.9, 2.2));                                   // the body, a smooth dome
  d = smin(d, sdE(q - vec2(0.0, -0.4), vec2(3.4, 0.45)), 1.4);                          // its foot, a gentle skirt on the lining
  // A few slender pseudopods, tapering out of the body: two along the lining, two reaching into the stream.
  d = smin(d, sdTaper(q, vec2(-2.4, -0.7), vec2(-6.6, -0.35), 0.62, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(2.4, -0.7), vec2(6.4, -0.3), 0.6, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(-1.7, -3.9), vec2(-4.1, -6.1), 0.55, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(1.8, -4.0), vec2(3.4, -6.3), 0.5, 0.1), 0.9);
  return d;
}
float kupK() { return clamp(uKy / 5.2, 0.6, 1.0); }
vec4 kupffer(vec2 p) {
  float k = kupK();
  vec2 q = (p - vec2(uXk, uKy)) / k;
  float d = sdKup0(q) * k;
  if (d > 0.3) return vec4(0.0);
  // Faded and translucent, as the stellate cell: a pale body, a shade lighter inside, its nucleus low in it (clear of its name).
  vec3 c = mix(cKup, vec3(1.0), 0.18 - 0.08 * uDark);
  c = mix(c, mix(cKup, vec3(1.0), 0.32 - 0.12 * uDark), smoothstep(-0.2, -1.4, d));
  float dn = sdE(q - vec2(0.9, -1.5), vec2(1.25, 0.7)) * k;
  c = mix(c, cKupN, cov(dn) * 0.55);
  c = mix(c, cKupE, line(dn, 0.06) * 0.35);
  float mem = line(d, 0.08);
  c = mix(c, cKupE, mem * 0.5);
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)) * max(0.74, mem * 0.85));
}

void main() {
  vec3 dv = vec3(vP, 1.0);
  float x = dot(uI0, dv), y = dot(uI1, dv), a = abs(y);
  int side = y < 0.0 ? -1 : 1;
  float hw = halfW(x), wi = hw + ENDO, dw = disseW(x), hi = wi + dw;
  float det = detailAt(x), show = revealA(vec2(x, y));
  if (uPass == 1) {
    // The stellate and Kupffer cells, over the particles.
    vec4 cl = vec4(0.0);
    if (side < 0 && abs(x - uXs) < 42.0 && a > hw && a < hi + 4.0) cl = hsc(vec2(x, a));
    if (abs(x - uXk) < 9.0 && y > uKy - 7.0 && y < uKy + 1.0) cl = kupffer(vec2(x, y));
    float al = cl.a * det * show;
    o = vec4(cl.rgb * al, al);
    return;
  }
  vec3 c = cBg;
  if (a < hw) {
    c = lumen(x, y, hw, 0, true);
    // The arrows at the ends, beside their labels: the blood coming in from the portal venule and going out to the central venule.
    for (int i = 0; i < 2; i++) {
      float s = uEnd.z;
      // Each points toward its vessel, off the view: the portal venule's back upstream, the central venule's on downstream.
      vec2 q = vec2((x - (i == 0 ? uEnd.x : uEnd.y)) * uDir * (i == 0 ? -1.0 : 1.0), y);
      // A thick, laid-down arrow: a short
      // broad shaft and a wide head, softly rounded, in the labels' ink faded into the blood, as a journal figure marks flow.
      float dA = min(sdRB(q - vec2(-0.3 * s, 0.0), vec2(0.28 * s, 0.17 * s), 0.05 * s),
                     sdTri(q, vec2(0.52 * s, 0.0), vec2(0.0, 0.46 * s), vec2(0.0, -0.46 * s)) - 0.03 * s);
      c = mix(c, cEndE, cov(dA - 0.08 * s) * 0.3 * uEnd.w);
      c = mix(c, cEndF, cov(dA) * 0.5 * uEnd.w);
    }
  }
  else if (a < wi) c = mix(mix(cLumen, vec3(1.0), 0.3), cLymph, (a - hw) / ENDO);
  else if (a < hi) c = disse(x, a, wi, hi, side, true, det);
  else {
    float v = a - hi;
    int sd = side < 0 ? ${SEED.plateUp} : ${SEED.plateDn};
    // The plate, then the next sinusoid beyond it (its Disse, lining and lumen), then the next plate.
    const float D = DISSE, E = ENDO, L = LUM0;
    if (v < HEP) c = plate(x, v, sd, det);
    else {
      // (Repeating outward, so the tissue fills any screen, also while the zoom from the lobule still shows it small.)
      float b = mod(v - HEP, 2.0 * D + 2.0 * E + 2.0 * L + HEP);
      if (b < D) c = disse(x, D - b + E, E, D + E, side, false, 0.0);
      else if (b < D + 2.0 * E + 2.0 * L) {
        float yl = b - (D + E + L), al = abs(yl);
        c = al < L ? lumen(x, yl, L, 40, false) : mix(mix(cLumen, vec3(1.0), 0.3), cLymph, (al - L) / E);
        float dN, de = sdEndo(x, al, L, side < 0 ? 7 : 9, 0, false, 0.0, dN);
        c = endoInk(c, de, dN, x, 0.0);
      }
      else if (b < 2.0 * D + 2.0 * E + 2.0 * L) c = disse(x, b - (D + 2.0 * E + 2.0 * L) + E, E, D + E, side, false, 0.0);
      else c = plate(x, b - (2.0 * D + 2.0 * E + 2.0 * L), sd + 13, 0.0);
    }
  }
  // The main lining over all that.
  if (a < wi + 0.6 && a > hw - 1.4) {
    float dN, de = sdEndo(x, a, hw, side < 0 ? ${SEED.poreUp} : ${SEED.poreDn}, side < 0 ? ${SEED.nucUp} : ${SEED.nucDn}, side > 0, det, dN);
    c = endoInk(c, de, dN, x, det);
  }
  // Focus: beyond this sinusoid's own plates the tissue fades to dark (the page in dark mode, a deep shade in light).
  float f0 = uLum + ENDO + disseW(0.0) + HEP * 0.85;
  c = mix(c, cShade, smoothstep(f0, f0 + 18.0, a) * (0.72 + 0.06 * uDark) * uFocus);
  o = vec4(c * show, show);
}`;

// Particles: albumin (amber), plasma water (small clear specks), and the ring where albumin meets a sealed wall; flat, outlined.
const PVS = `#version 300 es
layout(location=0) in vec4 aP;   // x, y (µm), radius (µm), alpha
layout(location=1) in float aK;  // kind
${COMMON}
uniform vec3 uF0, uF1;          // local µm → device px
uniform float uK;               // device px per µm
uniform float uKs;              // device px per µm for the particles' size (capped on a large screen, so they stay specks)
out float vA; out float vK; out float vR;
void main() {
  vec2 d = vec2(dot(uF0, vec3(aP.xy, 1.0)), dot(uF1, vec3(aP.xy, 1.0)));
  vR = max(aP.z * uKs, 1.2); vK = aK;
  vA = aP.w * revealA(aP.xy) * detailAt(aP.x);
  gl_PointSize = 2.0 * vR + 3.0;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
const PFS = `#version 300 es
precision highp float;
in float vA; in float vK; in float vR;
uniform vec3 cAlb, cAlbE, cWat, cWatE;
out vec4 o;
void main() {
  float r = length((gl_PointCoord * 2.0 - 1.0) * (vR + 1.5)), a;
  vec3 c;
  if (vK > 1.5) { a = (1.0 - smoothstep(0.25 * vR, vR + 1.0, r)) * 0.5; c = mix(vec3(1.0), cAlb, 0.3); }   // a soft glow where it meets the wall
  else {
    bool alb = vK < 0.5;
    a = 1.0 - smoothstep(vR - 0.7, vR + 0.7, r);
    c = mix(alb ? cAlb : cWat, alb ? cAlbE : cWatE, smoothstep(vR - 1.7, vR - 0.6, r) * (alb ? 0.6 : 0.7));
  }
  a *= vA;
  o = vec4(c * a, a);
}`;

export function createSinusoidGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch { gl = null; }
  if (!gl) return null;
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) { console.error('sinusoid shader:', gl.getShaderInfoLog(sh)); return null; }
    return sh;
  };
  const program = (vs, fs) => {
    const p = gl.createProgram(), a = compile(gl.VERTEX_SHADER, vs), b = compile(gl.FRAGMENT_SHADER, fs);
    if (!a || !b) return null;
    gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) { console.error('sinusoid program:', gl.getProgramInfoLog(p)); return null; }
    const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; U[nm] = gl.getUniformLocation(p, nm); }
    return { p, U };
  };
  let T, P, vao, pvao, pbuf;
  function init() {
    T = program(VS, FS); P = program(PVS, PFS);
    if (!T || !P) return false;
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    pvao = gl.createVertexArray(); gl.bindVertexArray(pvao);
    pbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);
    return true;
  }
  let ok = init();
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ok = false; });
  canvas.addEventListener('webglcontextrestored', () => { ok = init(); });
  const set = (U, k, v) => {
    const l = U[k];
    if (l == null) return;
    if (k === 'uPass') gl.uniform1i(l, v);
    else if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else if (v.length === 3) gl.uniform3fv(l, v);
    else gl.uniform4fv(l, v);
  };
  const tissue = (u, pass) => {
    gl.useProgram(T.p);
    set(T.U, 'size', [canvas.width, canvas.height]);
    for (const k in u) set(T.U, k, u[k]);
    set(T.U, 'uPass', pass);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  return {
    get ok() { return ok; },
    /** u: uniforms by name; pts: Float32Array of (x, y, r, alpha, kind) × n. The tissue, the particles, then the cells over them. */
    draw(u, pts, n) {
      if (!ok) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      tissue(u, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (n > 0) {
        gl.useProgram(P.p);
        set(P.U, 'size', [canvas.width, canvas.height]);
        for (const k in u) set(P.U, k, u[k]);
        gl.bindVertexArray(pvao); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
        gl.bufferData(gl.ARRAY_BUFFER, pts.subarray(0, n * 5), gl.STREAM_DRAW);
        gl.drawArrays(gl.POINTS, 0, n);
      }
      tissue(u, 1);
      gl.bindVertexArray(null);
    },
  };
}
