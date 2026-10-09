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
uniform vec3 cBg, cLumen, cLymph, cCell, cUnder, cNuc, cCol, cBm, cBile, cEndo, cEndoN, cHscQ, cHscA, cHscN, cDrop, cKup, cKupN, cChev;
uniform float aBm;
uniform vec4 uEnd;               // the end arrows: portal x, central x (µm), size (µm), alpha

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
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
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
// The endothelium of a lining at |y| = a (lumen face at hw): a slim band with the open fenestrae cut through it and
// the nuclei bulging into the lumen; with little detail (as the lobule draws it) a thin unbroken casing.
float sdEndo(float x, float a, float hw, int sd, int nsd, bool skipK, float det, out float dN) {
  float d = abs(a - (hw + ENDO * 0.5)) - mix(0.16, ENDO * 0.36, det);
  dN = 1e3;
  if (det < 0.02) return d;
  int j = int(floor(x / SLOT));
  for (int k = -1; k <= 1; k++) {
    float px;
    float w = poreOpen(j + k, sd, px) * det;
    if (w > 0.02) d = smax(d, -(abs(x - px) - 0.5 * w), 0.16);
  }
  if (nsd > 0) {
    int n = int(floor(x / 38.0));
    for (int k = -1; k <= 1; k++) {
      float c = 38.0 * float(n + k) + 8.0 + 22.0 * h1(n + k, nsd);
      if (skipK && abs(c - uXk) < 12.0) continue;
      d = smin(d, sdE(vec2(x - c, a - hw + 0.3), vec2(4.4, 1.0 * det + 0.01)), 0.9);
      dN = min(dN, sdE(vec2(x - c - 0.2, a - hw + 0.32), vec2(2.9, 0.46 * det + 0.01)));
    }
  }
  return d;
}
vec3 endoInk(vec3 under, float d, float dN) {
  return mix(paint(under, cEndo, d), cEndoN, cov(dN));
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
  float prof = 1.5 * (1.0 - lc * lc) + 0.08, P = 15.0 + 7.0 * h1(id, 7);
  float sx = x - uFlow * prof + h1(id, 8) * P, k = floor(sx / P), xx = sx - k * P;
  int ki = int(k);
  float hk = h1(ki * 31 + id, 9), Ls = 3.0 + 4.0 * hk, x0 = (P - Ls) * h1(ki + id * 977, 10);
  float e = (xx - x0) / Ls;
  float along = smoothstep(0.0, 0.25, e) * (1.0 - smoothstep(0.6, 1.0, e));
  float yc = (lc + (h1(ki, id + 11) - 0.5) * 0.6 / NL) * hw;
  c = mix(c, vec3(1.0), along * line(y - yc, 0.2) * step(0.25, hk) * uShim);
  if (chev) {
    float cw = min(1.0, hw * 0.24), xc = mod(x - uFlow, 16.0) - 8.0;
    vec2 q = vec2(xc * uDir, abs(y));
    float d = max(max((q.x - (cw - 1.6 * q.y)) / 1.887, ((-0.15 * cw - 0.45 * q.y) - q.x) / 1.039), q.y - cw);
    c = mix(c, cChev, cov(d) * 0.45);
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
    c = mix(c, cCol, 0.45 * smoothstep(0.1, 0.9, uCol));
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
      fc = mix(fc, fibE, line(a - mix(wi, hi, tc) - 0.18 * w * sin(x * 0.9 + ph), 0.06) * 0.3 * bd);
      c = mix(c, fc, cov(d) * al * 0.5);           // translucent, like the lobule's fibrous bands
      c = mix(c, fibE, line(d, 0.06) * al * 0.4);
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

// ── A hepatocyte plate: v from its face on Disse (0) to its far side (HEP); flat cells with a nucleus ──
float cellEdge(int j, int sd) { return CELL * float(j) + 7.0 * (h1(j, sd) - 0.5); }
vec3 plate(float x, float v, int sd, float det) {
  int j = int(floor(x / CELL));
  if (x < cellEdge(j, sd)) j--; else if (x >= cellEdge(j + 1, sd)) j++;
  float x0 = cellEdge(j, sd), x1 = cellEdge(j + 1, sd);
  float d = sdRB(vec2(x - 0.5 * (x0 + x1), v - 0.5 * HEP), vec2(0.5 * (x1 - x0) - 0.5, 0.5 * HEP - 0.5), 2.6);
  vec3 c = cCell * (0.97 + 0.05 * h1(j, sd + 5));
  bool bi = h1(j, sd + 4) < 0.12;
  float nu = 0.3 + 0.4 * h1(j, sd + 1), nv = 0.4 + 0.2 * h1(j, sd + 2), nr = 2.6 + 0.5 * h1(j, sd + 3);
  for (int k = 0; k < 2; k++) {
    if (k == 1 && !bi) break;
    float uu = bi ? nu + (k == 0 ? -0.15 : 0.15) : nu, vv = nv + (k == 1 ? 0.04 : 0.0), rr = bi ? nr * 0.82 : nr;
    vec2 nq = vec2(x, v) - vec2(mix(x0 + 2.0, x1 - 2.0, uu), mix(2.0, HEP - 2.0, vv));
    c = mix(c, mix(c, cNuc, 0.3), cov(length(nq) - rr));
    c = mix(c, mix(c, cNuc, 0.5), cov(length(nq - vec2(0.3, -0.25) * rr) - 0.16 * rr) * det);
  }
  vec3 outC = mix(cUnder, c, cov(d));
  // Bile canaliculi between neighbouring cells, mid-plate.
  for (int k = 0; k < 2; k++) outC = mix(outC, cBile, cov(sdE(vec2(x - (k == 0 ? x0 : x1), v - 0.5 * HEP), vec2(0.5, 0.36))) * 0.8 * det);
  return outC;
}

// ── The stellate (Ito) cell, in the upper Disse; p = (x, depth from the axis) ──
// As the lobule draws it: a slender spindle lying along the sinusoid, its ends drawn out into long tapered
// processes that hug the wall, and a finer branch toward the plate; flat, no outline. Quiescent it is pale and
// full of vitamin A droplets; activated (a myofibroblast) it grows, darkens and loses them.
float hscL() { return 5.2 + 2.6 * uAct; }
float hscW() { return 1.2 + 0.12 * uAct; }
float sdHsc(vec2 p) {
  float L = hscL(), Wd = hscW();
  float d = sdE(p - vec2(uXs, uHscA), vec2(L, Wd));
  for (int i = 0; i < 2; i++) {
    float sg = i == 0 ? -1.0 : 1.0, len = 15.0 + 8.0 * uAct, w0 = 0.75 + 0.35 * uAct;
    float u = (sg * (p.x - uXs) - L * 0.6) / len;
    if (u < -0.4 || u > 1.2) continue;
    float uc = sat(u), xx = uXs + sg * (L * 0.6 + len * uc);
    // From the body's flank down onto the wall, then along it.
    float wall = halfW(xx) + ENDO + 0.42 + 0.12 * sin(uc * 3.0 + sg);
    float ac = mix(uHscA, wall, smoothstep(0.0, 0.3, uc));
    float hw2 = 0.5 * (w0 * pow(1.0 - uc, 1.2) + 0.07);
    float dd = u > 1.0 ? length(vec2((u - 1.0) * len, p.y - ac)) - 0.035 : abs(p.y - ac) - hw2;
    d = smin(d, dd, 1.4);
    // A finer branch, curving off toward the plate.
    float u2 = (sg * (p.x - uXs) - L * 0.6 - len * 0.3) / (len * 0.35);
    if (u2 > -0.1 && u2 < 1.1) {
      float uc2 = sat(u2), a2 = mix(wall, wall + disseW(xx) * 0.6, smoothstep(0.0, 1.0, uc2));
      d = smin(d, abs(p.y - a2) - 0.5 * (0.3 * (1.0 - uc2) + 0.06) + (u2 > 1.0 ? (u2 - 1.0) * len * 0.35 : 0.0), 0.6);
    }
  }
  return d;
}
vec4 hsc(vec2 p) {
  float d = sdHsc(p);
  if (d > 0.3) return vec4(0.0);
  float L = hscL(), Wd = hscW();
  vec3 c = mix(cHscQ, cHscA, uAct);
  // Vitamin A droplets (pale, within the body), which go as it activates; the nucleus, long and pressed aside by them.
  float dr = pow(1.0 - uAct, 0.8);
  vec3 drops[5] = vec3[5](vec3(0.34, -0.25, 0.5), vec3(0.6, 0.2, 0.42), vec3(0.12, 0.3, 0.4), vec3(-0.5, -0.2, 0.44), vec3(-0.72, 0.22, 0.32));
  float dn = sdE(p - vec2(uXs - L * 0.12, uHscA + 0.05), vec2(1.7 + 0.8 * uAct, 0.55));
  for (int i = 0; i < 5; i++) {
    vec2 dc = vec2(uXs + drops[i].x * L * 0.8, uHscA + drops[i].y * Wd);
    float rr = drops[i].z * Wd * dr;
    dn = smax(dn, -(length(p - dc) - rr - 0.1), 0.2);
    if (dr > 0.03) c = mix(c, cDrop, cov(length(p - dc) - rr) * min(1.0, dr * 1.4) * 0.85);
  }
  c = paint(c, cHscN, dn);
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)));
}

// ── The Kupffer cell: a macrophage on the lower lining, reaching into the stream ──
// A rounded body spread on the wall with a few blunt pseudopods; a kidney-shaped nucleus, pale vacuoles
// holding what it has taken up, a few lysosomes. Flat, no outline.
float sdKup0(vec2 q) {
  float d = sdE(q - vec2(0.3, -2.3), vec2(3.3, 2.3));
  d = smin(d, sdE(q - vec2(0.2, -0.4), vec2(4.8, 0.65)), 1.6);                       // spread on the lining
  d = smin(d, sdTaper(q, vec2(-2.0, -2.0), vec2(-5.6, -3.3), 1.2, 0.5), 1.5);           // pseudopods, blunt
  d = smin(d, sdTaper(q, vec2(2.4, -2.8), vec2(5.0, -4.6), 1.1, 0.45), 1.5);
  return d;
}
float kupK() { return clamp(uKy / 5.2, 0.6, 1.0); }
vec4 kupffer(vec2 p) {
  float k = kupK();
  vec2 q = (p - vec2(uXk, uKy)) / k;
  float d = sdKup0(q) * k;
  if (d > 0.3) return vec4(0.0);
  vec3 c = cKup, pale = mix(cKup, vec3(1.0), 0.32 - 0.12 * uDark);
  // Vacuoles: one with a darker fragment inside (taken up from the blood), one empty.
  c = paint(c, pale, (length(q - vec2(-2.3, -1.5)) - 0.9) * k);
  c = paint(c, mix(pale, cKupN, 0.4), sdE(q - vec2(-2.1, -1.7), vec2(0.45, 0.32)) * k);
  c = paint(c, pale, (length(q - vec2(2.6, -1.3)) - 0.55) * k);
  // Lysosomes.
  vec3 gr[4] = vec3[4](vec3(-1.0, -3.4, 0.2), vec3(2.2, -3.3, 0.18), vec3(-0.5, -0.9, 0.17), vec3(3.4, -1.7, 0.16));
  for (int i = 0; i < 4; i++) c = mix(c, cKupN, cov((length(q - gr[i].xy) - gr[i].z) * k) * 0.6);
  // The nucleus, kidney-shaped.
  float dn = smax(sdE(q - vec2(0.7, -2.2), vec2(1.9, 1.1)), -(length(q - vec2(1.0, -3.45)) - 0.75), 0.35) * k;
  c = paint(c, cKupN, dn);
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)));
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
    if (side < 0 && abs(x - uXs) < 34.0 && a > hw && a < hi + 4.0) cl = hsc(vec2(x, a));
    if (side > 0 && abs(x - uXk) < 10.0 && a < uKy + 1.0) cl = kupffer(vec2(x, y));
    float al = cl.a * det * show;
    o = vec4(cl.rgb * al, al);
    return;
  }
  vec3 c = cBg;
  if (a < hw) {
    c = lumen(x, y, hw, 0, true);
    // The arrows at the ends, beside their labels: toward the portal venule (−x) and toward the central venule (+x).
    for (int i = 0; i < 2; i++) {
      float dir = i == 0 ? -1.0 : 1.0, s = uEnd.z;
      vec2 q = vec2((x - (i == 0 ? uEnd.x : uEnd.y)) * dir, abs(y));
      float head = max(q.y - 0.55 * s * (1.0 - (q.x - 0.0) / (0.65 * s)), max(-q.x, q.x - 0.65 * s));
      float shaft = max(q.y - 0.13 * s, max(-q.x - 0.55 * s, q.x));
      c = mix(c, cChev, cov(min(head, shaft)) * uEnd.w);
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
        c = endoInk(c, de, dN);
      }
      else if (b < 2.0 * D + 2.0 * E + 2.0 * L) c = disse(x, b - (D + 2.0 * E + 2.0 * L) + E, E, D + E, side, false, 0.0);
      else c = plate(x, b - (2.0 * D + 2.0 * E + 2.0 * L), sd + 13, 0.0);
    }
  }
  // The main lining over all that.
  if (a < wi + 0.6 && a > hw - 1.4) {
    float dN, de = sdEndo(x, a, hw, side < 0 ? ${SEED.poreUp} : ${SEED.poreDn}, side < 0 ? ${SEED.nucUp} : ${SEED.nucDn}, side > 0, det, dN);
    c = endoInk(c, de, dN);
  }
  // Focus: beyond this sinusoid's own plates the tissue fades into the page.
  float f0 = uLum + ENDO + disseW(0.0) + HEP * 0.85;
  c = mix(c, cBg, smoothstep(f0, f0 + 18.0, a) * (0.72 + 0.06 * uDark) * uFocus);
  o = vec4(c * show, show);
}`;

// Particles: albumin (amber), plasma water (small clear specks), and the ring where albumin meets a sealed wall; flat, outlined.
const PVS = `#version 300 es
layout(location=0) in vec4 aP;   // x, y (µm), radius (µm), alpha
layout(location=1) in float aK;  // kind
${COMMON}
uniform vec3 uF0, uF1;          // local µm → device px
uniform float uK;               // device px per µm
out float vA; out float vK; out float vR;
void main() {
  vec2 d = vec2(dot(uF0, vec3(aP.xy, 1.0)), dot(uF1, vec3(aP.xy, 1.0)));
  vR = max(aP.z * uK, 1.2); vK = aK;
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
  if (vK > 1.5) { a = (1.0 - smoothstep(0.5, 1.2, abs(r - vR))) * 0.9; c = vec3(1.0); }
  else {
    bool alb = vK < 0.5;
    a = 1.0 - smoothstep(vR - 0.7, vR + 0.7, r);
    c = mix(alb ? cAlb : cWat, alb ? cAlbE : cWatE, smoothstep(vR - 1.7, vR - 0.6, r));
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
