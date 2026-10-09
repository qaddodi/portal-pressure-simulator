// The sinusoid view on the GPU (WebGL2): the tissue is one full-screen shader, evaluated per pixel in
// the sinusoid's own frame (micrometres, x along the flow, y across), and what moves through the wall
// (albumin, plasma water) is a second pass of shaded point sprites over it.
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

const COMMON = `
uniform vec3 uI0, uI1;          // device px → local µm
uniform vec2 size;
uniform vec4 uReveal;           // the dive: tube alpha, tube half-length (µm), tissue alpha, -
uniform vec4 uMask;             // the dive's tissue reveal: centre (device px), inner and outer radius
float sat(float x) { return clamp(x, 0.0, 1.0); }
float revealA(vec2 l, vec2 dev, bool tube) {
  float t = tube ? uReveal.x * (1.0 - smoothstep(uReveal.y * 0.7, uReveal.y, abs(l.x))) : 0.0;
  float s = uReveal.z * (1.0 - smoothstep(uMask.z, uMask.w, length(dev - uMask.xy)));
  return max(t, s);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vP;
out vec4 o;
${COMMON}
uniform float uPx;              // µm per device px
uniform float uLum, uPinch, uXs, uXk, uKy, uHscA, uCol, uBm, uMv, uAct, uPor, uFlow, uLym, uDir, uDark, uShim, uStreak;
uniform vec2 uLight;            // toward the light, local frame
uniform vec3 cBg, cLumen, cLymph, cCell, cUnder, cNuc, cCol, cBm, cBile, cEndo, cMem, cEndoN, cHscQ, cHscA, cHscN, cKup, cKupN, cChev;
uniform float aBm;

const float ENDO = ${UM.endo.toFixed(2)}, DISSE = ${UM.disse.toFixed(2)}, HEP = ${UM.hep.toFixed(1)}, LUM0 = ${UM.lum.toFixed(1)};
const float SLOT = ${SLOT.toFixed(2)}, CELL = ${CELL.toFixed(1)}, TAU = 6.2831853;

uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h1(int i, int s) { return float(hsh((uint(i + 1048576) * 0x9e3779b1u) ^ hsh(uint(s))) >> 8) / 16777216.0; }
float hf(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hf(i), hf(i + vec2(1, 0)), u.x), mix(hf(i + vec2(0, 1)), hf(i + vec2(1, 1)), u.x), u.y);
}
float cov(float d) { return 1.0 - smoothstep(-0.7 * uPx, 0.7 * uPx, d); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdE(vec2 p, vec2 ab) { float k0 = length(p / ab), k1 = length(p / (ab * ab)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdTaper(vec2 p, vec2 a, vec2 b, float ra, float rb) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h); }
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

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
// Signed distance to the endothelium of a lining at |y| = a (lumen face at hw): a band with the open
// fenestrae cut through it, lips rounded, and the nuclei bulging into the lumen.
float sdEndo(float x, float a, float hw, int sd, int nsd, bool skipK, out float dN) {
  float d = abs(a - (hw + ENDO * 0.5)) - ENDO * 0.36;
  int j = int(floor(x / SLOT));
  for (int k = -1; k <= 1; k++) {
    float px;
    float w = poreOpen(j + k, sd, px);
    if (w > 0.02) d = smax(d, -(abs(x - px) - 0.5 * w), 0.16);
  }
  dN = 1e3;
  if (nsd > 0) {
    int n = int(floor(x / 38.0));
    for (int k = -1; k <= 1; k++) {
      float c = 38.0 * float(n + k) + 8.0 + 22.0 * h1(n + k, nsd);
      if (skipK && abs(c - uXk) < 12.0) continue;
      d = smin(d, sdE(vec2(x - c, a - hw + 0.05), vec2(3.8, 1.05)), 0.6);
      dN = min(dN, sdE(vec2(x - c - 0.3, a - hw + 0.18), vec2(2.7, 0.5)));
    }
  }
  return d;
}
vec3 endoInk(vec3 under, float d, float dN) {
  vec3 c = mix(cEndo, cMem, smoothstep(-0.13, -0.02, d) * 0.8);
  float n = cov(dN);
  if (n > 0.0) c = mix(c, mix(cEndoN, cMem, smoothstep(-0.12, 0.0, dN) * 0.6) , n);
  return mix(under, c, cov(d));
}

// ── The lumen: pressure colour, its laminar shimmer, chevrons down the middle ──
vec3 lumen(float x, float y, float hw, int lane0, bool chev) {
  vec3 c = cLumen;
  float r = clamp(y / hw, -1.0, 1.0);
  c *= 1.0 - 0.09 * pow(abs(r), 5.0);
  c = mix(c, vec3(1.0), 0.16 * exp(-pow((y + hw - 0.55) / 0.22, 2.0)) * (0.6 + 0.4 * uShim / 0.3));
  c = mix(c, c * 0.82, exp(-pow((y - hw + 0.5) / 0.25, 2.0)) * 0.5);
  // Streaks in lanes, each lane at the parabolic profile's speed (faster in the middle).
  const float NL = 9.0;
  float u = (r * 0.5 + 0.5) * NL, li = min(floor(u), NL - 1.0), lc = (li + 0.5) / NL * 2.0 - 1.0;
  int id = int(li) + lane0;
  float prof = 1.5 * (1.0 - lc * lc) + 0.08, P = 15.0 + 7.0 * h1(id, 7);
  float sx = x - uFlow * prof + h1(id, 8) * P, k = floor(sx / P), xx = sx - k * P;
  int ki = int(k);
  float hk = h1(ki * 31 + id, 9), Ls = 3.0 + 4.0 * hk, x0 = (P - Ls) * h1(ki + id * 977, 10);
  float e = (xx - x0) / Ls;
  float along = smoothstep(0.0, 0.3, e) * (1.0 - smoothstep(0.55, 1.0, e));
  float yc = (lc + (h1(ki, id + 11) - 0.5) * 0.6 / NL) * hw, wd = max(0.13, 0.9 * uPx);
  float acr = exp(-pow((y - yc) / wd, 2.0));
  c = mix(c, vec3(1.0), along * acr * step(0.25, hk) * uShim);
  if (chev) {
    float cw = min(1.0, hw * 0.24), xc = mod(x - uFlow, 16.0) - 8.0;
    vec2 q = vec2(xc * uDir, abs(y));
    float d = max(max((q.x - (cw - 1.6 * q.y)) / 1.887, ((-0.15 * cw - 0.45 * q.y) - q.x) / 1.039), q.y - cw);
    c = mix(c, cChev, cov(d) * 0.42);
  }
  return c;
}

// ── The space of Disse: lymph running back to the portal triad, collagen, microvilli ──
vec3 disse(float x, float a, float wi, float hi, int side, bool main) {
  float t = (a - wi) / max(hi - wi, 1e-3);
  vec3 c = mix(cLymph, cLymph * 0.97, t);
  for (int j = 0; j < 3; j++) {
    float P = 8.0 + 3.0 * float(j), sx = x - uLym * (0.8 + 0.12 * float(j)) + 4.1 * float(j) + (main ? 0.0 : 3.0), k = floor(sx / P), xx = sx - k * P;
    float L = 2.0 + 1.6 * h1(int(k) * 7 + j, 21 + side), x0 = (P - L) * h1(int(k) + j * 131, 23 + side), e = (xx - x0) / L;
    float al = smoothstep(0.0, 0.35, e) * (1.0 - smoothstep(0.6, 1.0, e));
    float ac = mix(wi, hi, 0.22 + 0.28 * float(j)), wd = max(0.1, 0.8 * uPx);
    c = mix(c, vec3(1.0), al * exp(-pow((a - ac) / wd, 2.0)) * uStreak);
  }
  if (main) {
    // Collagen: first a pale fill as it takes the space the lymph had, then banded fibres, each at its own stage.
    if (uCol > 0.02) {
      c = mix(c, cCol, 0.55 * smoothstep(0.1, 0.9, uCol));
      float near = side < 0 ? exp(-pow((x - uXs) / 26.0, 2.0)) * uAct * 0.08 : 0.0;
      for (int i = 0; i < 9; i++) {
        float al = smoothstep(float(i) / 9.0 * 0.85, float(i) / 9.0 * 0.85 + 0.18, uCol);
        if (al < 0.01) continue;
        int sd = side < 0 ? 91 : 92;
        float v = 0.15 + 0.7 * h1(i, sd), f = 0.12 + 0.12 * h1(i, sd + 7), ph = TAU * h1(i, sd + 9);
        float tc = clamp(v + 0.12 * sin(x * f + ph) + near, 0.05, 0.95);
        float tc2 = clamp(tc + 0.05 * sin(x * f * 2.7 + ph * 1.7), 0.05, 0.95);
        float d = abs(a - mix(wi, hi, tc2)) - 0.5 * (0.16 + 0.12 * al);
        float band = 0.93 + 0.07 * sin(x * TAU / 0.67);
        c = mix(c, cCol * 0.78 * band, cov(d) * 0.75 * al);
      }
    }
    // Microvilli: fine hairs from the hepatocytes' face, flattened as the space fills with collagen.
    if (uMv > 0.02) {
      float pi = floor(x / 0.8), hx = (pi + 0.5) * 0.8 + 0.22 * (h1(int(pi), 61 + side) - 0.5);
      float len = (hi - wi) * 0.52 * uMv * (0.55 + 0.45 * h1(int(pi), 63 + side));
      float d = sdTaper(vec2(x, a), vec2(hx, hi + 0.2), vec2(hx + 0.12 * sin(pi), hi - len), 0.1, 0.07);
      c = mix(c, mix(cCell, cUnder, 0.35) * 0.96, cov(d));
    }
    // The basement membrane, as the sinusoid becomes a capillary.
    if (uBm > 0.02) c = mix(c, cBm, cov(abs(a - wi - 0.3) - 0.5 * (0.3 + 0.2 * uBm)) * uBm * aBm);
  }
  return c;
}

// ── A hepatocyte plate: v from its face on Disse (0) to its far side (HEP) ──
float cellEdge(int j, int sd) { return CELL * float(j) + 7.0 * (h1(j, sd) - 0.5); }
vec3 plate(float x, float v, int sd) {
  int j = int(floor(x / CELL));
  if (x < cellEdge(j, sd)) j--; else if (x >= cellEdge(j + 1, sd)) j++;
  float x0 = cellEdge(j, sd), x1 = cellEdge(j + 1, sd), cx = 0.5 * (x0 + x1);
  vec2 q = vec2(x - cx, v - 0.5 * HEP), hb = vec2(0.5 * (x1 - x0) - 0.45, 0.5 * HEP - 0.45);
  float d = sdRB(q, hb, 2.6);
  float tone = h1(j, sd + 5);
  vec3 c = cCell * (0.95 + 0.07 * tone);
  // A soft cushion: a little darker toward the membrane, a fine light line just inside it, granular cytoplasm.
  c *= 1.0 - 0.07 * smoothstep(-3.5, 0.0, d);
  c = mix(c, vec3(1.0), 0.12 * exp(-pow((d + 0.4) / 0.2, 2.0)) * (1.0 - uDark * 0.6));
  c *= 0.97 + 0.06 * vn(vec2(x, v) * 1.4 + float(sd));
  // Nucleus (two in some): envelope, chromatin, a nucleolus.
  bool bi = h1(j, sd + 4) < 0.12;
  float nu = 0.3 + 0.4 * h1(j, sd + 1), nv = 0.4 + 0.2 * h1(j, sd + 2), nr = 2.6 + 0.5 * h1(j, sd + 3);
  for (int k = 0; k < 2; k++) {
    if (k == 1 && !bi) break;
    float uu = bi ? nu + (k == 0 ? -0.15 : 0.15) : nu, vv = nv + (k == 1 ? 0.04 : 0.0), rr = bi ? nr * 0.82 : nr;
    vec2 nc = vec2(mix(x0 + 2.0, x1 - 2.0, uu), mix(2.0, HEP - 2.0, vv));
    vec2 nq = vec2(x, v) - nc;
    float dn = length(nq) - rr * (1.0 + 0.02 * sin(atan(nq.y, nq.x) * 3.0 + float(j)));
    vec3 nk = mix(c, cNuc, 0.26 + 0.08 * vn(nq * 6.0 + float(j) * 3.1) + 0.06 * smoothstep(0.55, 0.85, vn(nq * 3.0 - float(j))));
    nk = mix(nk, cNuc, smoothstep(-0.3, -0.04, dn) * 0.3);
    nk = mix(nk, cNuc * 0.85, cov(length(nq - vec2(0.3, -0.25) * rr) - 0.17 * rr) * 0.55);
    c = mix(c, nk, cov(dn));
  }
  vec3 outC = mix(cUnder, c, cov(d));
  // Bile canaliculi between neighbouring cells, mid-plate.
  for (int k = 0; k < 2; k++) {
    float bx = k == 0 ? x0 : x1;
    float db = sdE(vec2(x - bx, v - 0.5 * HEP), vec2(0.55, 0.4));
    outC = mix(outC, mix(cUnder, vec3(1.0), 0.3), cov(db - 0.25) * 0.5);
    outC = mix(outC, cBile, cov(db) * 0.85);
  }
  return outC;
}

// ── The stellate cell (Ito cell), in the upper Disse; p = (x, depth from the lumen's axis) ──
float sdHsc(vec2 p) {
  float L = 4.0 + 2.6 * uAct, Wd = 2.2 - 0.6 * uAct;
  float d = sdE(p - vec2(uXs, uHscA), vec2(L, Wd));
  for (int i = 0; i < 2; i++) {
    float sg = i == 0 ? -1.0 : 1.0, len = 15.0 + 8.0 * uAct, w0 = 0.65 + 0.45 * uAct;
    float u = (sg * (p.x - uXs) - L * 0.55) / len;
    if (u < -0.4 || u > 1.2) continue;
    float uc = sat(u), xx = uXs + sg * (L * 0.55 + len * uc);
    float ac = halfW(xx) + ENDO + 0.5 + 0.2 * sin(uc * 3.0 + sg);
    float hw2 = 0.5 * (w0 * pow(1.0 - uc, 1.2) + 0.07);
    float dd = u > 1.0 ? length(vec2((u - 1.0) * len, p.y - ac)) - 0.035 : abs(p.y - ac) - hw2;
    d = smin(d, dd, 1.4);
  }
  // A short, soft foot into the recess between the two hepatocytes.
  if (uAct < 0.95) d = smin(d, sdTaper(p, vec2(uXs + 0.4, uHscA + 0.6), vec2(uXs + 0.8, uHscA + 2.0), 0.8 * (1.0 - uAct), 0.4 * (1.0 - uAct)) + 0.6 * uAct, 1.2);
  return d;
}
vec3 hsc(vec3 under, vec2 p) {
  float d = sdHsc(p);
  if (d > 2.0 * uPx + 0.05) return under;
  float e = 0.06;
  vec2 n = normalize(vec2(sdHsc(p + vec2(e, 0.0)) - sdHsc(p - vec2(e, 0.0)), sdHsc(p + vec2(0.0, e)) - sdHsc(p - vec2(0.0, e))) + 1e-6);
  vec3 c = mix(cHscQ, cHscA, uAct);
  float rim = smoothstep(-1.1, 0.0, d);
  c *= 1.0 - 0.16 * rim;
  vec2 Lu = vec2(uLight.x, -uLight.y);   // (depth runs against y on this side)
  c += 0.16 * rim * max(0.0, dot(n, Lu)) * (1.0 - 0.5 * uDark);
  c = mix(c, c * 0.62, smoothstep(-0.12, -0.02, d));
  // Stress fibres as it becomes a myofibroblast.
  float L = 4.0 + 2.6 * uAct, Wd = 2.2 - 0.6 * uAct;
  float body = sdE(p - vec2(uXs, uHscA), vec2(L, Wd));
  c = mix(c, c * 0.8, uAct * 0.5 * smoothstep(0.38, 0.48, abs(fract((p.y - uHscA) / 0.42) - 0.5)) * smoothstep(0.2, -0.4, body));
  // Nucleus, pressed by the droplets; then the vitamin A droplets, which go as it activates.
  vec2 nc = vec2(uXs - L * 0.18, uHscA + 0.15);
  float dn = sdE(p - nc, vec2(1.45 + 0.6 * uAct, 0.82 - 0.12 * uAct));
  float dr = pow(1.0 - uAct, 0.8);
  vec3 drops[5] = vec3[5](vec3(0.25, -0.3, 0.85), vec3(0.55, 0.25, 0.7), vec3(0.05, 0.42, 0.55), vec3(-0.55, -0.35, 0.62), vec3(0.78, -0.25, 0.5));
  for (int i = 0; i < 5; i++) dn = smax(dn, -(length(p - vec2(uXs + drops[i].x * L * 0.8, uHscA + drops[i].y * Wd * 0.9)) - drops[i].z * dr - 0.15), 0.25);
  c = mix(c, mix(cHscN, cHscN * 0.7, smoothstep(-0.18, 0.0, dn)) * (0.9 + 0.2 * vn(p * 3.0)), cov(dn) * 0.9);
  if (dr > 0.03) for (int i = 0; i < 5; i++) {
    vec2 dc = vec2(uXs + drops[i].x * L * 0.8, uHscA + drops[i].y * Wd * 0.9), dq = p - dc;
    float r = drops[i].z * dr, dd = length(dq) - r;
    vec3 lip = mix(vec3(0.98, 0.9, 0.55), vec3(0.88, 0.7, 0.25), sat(length(dq) / max(r, 1e-3)));
    lip = mix(lip, vec3(1.0), cov(length(dq - Lu * r * 0.4) - r * 0.28) * 0.8);
    c = mix(c, lip, cov(dd) * min(1.0, dr * 1.4));
  }
  return mix(under, c, cov(d) * 0.96);
}

// ── The Kupffer cell: a macrophage on the lower lining, reaching into the stream ──
float sdKup0(vec2 q) {
  float d = sdE(q - vec2(0.0, -1.9), vec2(3.3, 2.0));
  d = smin(d, sdE(q - vec2(-2.7, -0.95), vec2(2.2, 1.2)), 1.0);
  d = smin(d, sdE(q - vec2(2.9, -1.05), vec2(2.4, 1.3)), 1.0);
  d = smin(d, sdE(q - vec2(0.0, -0.2), vec2(5.6, 0.62)), 0.8);
  d = smin(d, sdTaper(q, vec2(-3.2, -1.9), vec2(-6.9, -3.1), 0.85, 0.32), 1.0);
  d = smin(d, sdTaper(q, vec2(2.6, -2.7), vec2(5.4, -4.2), 0.8, 0.3), 1.0);
  d = smin(d, sdTaper(q, vec2(0.2, -3.4), vec2(-0.7, -5.3), 0.7, 0.28), 0.9);
  d = smin(d, sdTaper(q, vec2(4.4, -1.4), vec2(7.2, -1.6), 0.55, 0.22), 0.9);
  return d + 0.035 * sin(q.x * 3.1 + q.y * 2.3) * smoothstep(-1.2, 0.0, d);
}
float kupK() { return clamp(uKy / 5.2, 0.6, 1.0); }
float sdKup(vec2 p) { float k = kupK(); return sdKup0((p - vec2(uXk, uKy)) / k) * k; }
vec3 kupffer(vec3 under, vec2 p) {
  float k = kupK();
  // Its contact shadow on the lumen.
  float ds = sdKup(p + uLight * 0.45);
  under = mix(under, under * 0.72, 0.4 * (1.0 - smoothstep(-0.2, 1.0, ds)));
  float d = sdKup(p);
  if (d > 2.0 * uPx + 0.05) return under;
  float e = 0.06;
  vec2 n = normalize(vec2(sdKup(p + vec2(e, 0.0)) - sdKup(p - vec2(e, 0.0)), sdKup(p + vec2(0.0, e)) - sdKup(p - vec2(0.0, e))) + 1e-6);
  vec2 q = (p - vec2(uXk, uKy)) / k;
  vec3 c = cKup * (0.96 + 0.08 * vn(q * 2.2));
  float rim = smoothstep(-1.3, 0.0, d);
  c *= 1.0 - 0.18 * rim;
  c += 0.2 * rim * max(0.0, dot(n, uLight)) * (1.0 - 0.5 * uDark);
  // Lysosomes: small dark granules.
  vec2 g = floor(q / 0.85), gq = q - (g + 0.25 + 0.5 * vec2(hf(g), hf(g + 7.3))) * 0.85;
  float hg = hf(g + 3.1);
  if (hg < 0.42) c = mix(c, cKupN * 1.05, cov(length(gq) - (0.12 + 0.1 * hg)) * 0.75 * smoothstep(0.0, -0.6, d));
  // A phagosome with something it has taken up.
  float dp = length(q - vec2(-2.5, -1.25)) - 0.78;
  c = mix(c, mix(c, vec3(1.0), 0.55), cov(dp) * 0.9);
  c = mix(c, vec3(0.62, 0.36, 0.26), cov(length(q - vec2(-2.35, -1.35)) - 0.34) * 0.9);
  c = mix(c, c * 0.7, cov(abs(dp) - 0.05) * 0.6);
  // The nucleus: a kidney shape, its chromatin clumped at the envelope.
  float dn = smax(sdE(q - vec2(0.7, -2.15), vec2(1.95, 1.08)), -(length(q - vec2(1.0, -3.35)) - 0.75), 0.35);
  vec3 nk = mix(cKupN, cKupN * 0.75, smoothstep(-0.3, 0.0, dn)) * (0.88 + 0.24 * smoothstep(0.4, 0.75, vn(q * 3.4)));
  c = mix(c, nk, cov(dn));
  c = mix(c, c * 0.6, smoothstep(-0.12, -0.02, d));
  return mix(under, c, cov(d));
}

void main() {
  vec3 dv = vec3(vP, 1.0);
  float x = dot(uI0, dv), y = dot(uI1, dv), a = abs(y);
  int side = y < 0.0 ? -1 : 1;
  float hw = halfW(x), wi = hw + ENDO, dw = disseW(x), hi = wi + dw;
  vec3 c = cBg;
  bool tube = a < hi;
  if (a < hw) c = lumen(x, y, hw, 0, true);
  else if (a < wi) c = mix(mix(cLumen, vec3(1.0), 0.25), cLymph, (a - hw) / ENDO);
  else if (a < hi) c = disse(x, a, wi, hi, side, true);
  else {
    float v = a - hi;
    int sd = side < 0 ? ${SEED.plateUp} : ${SEED.plateDn};
    // The plate, then the next sinusoid beyond it (quietly: its Disse, lining and lumen), then the next plate.
    const float D = DISSE, E = ENDO, L = LUM0;
    if (v < HEP) c = plate(x, v, sd);
    else {
      float b = v - HEP;
      if (b < D) c = disse(x, D - b + E, E, D + E, side, false);
      else if (b < D + 2.0 * E + 2.0 * L) {
        float yl = b - (D + E + L), al = abs(yl);
        c = al < L ? lumen(x, yl, L, 40, false) : mix(mix(cLumen, vec3(1.0), 0.25), cLymph, (al - L) / E);
        float dN, de = sdEndo(x, al, L, side < 0 ? 7 : 9, 0, false, dN);
        c = endoInk(c, de, dN);
      }
      else if (b < 2.0 * D + 2.0 * E + 2.0 * L) c = disse(x, b - (D + 2.0 * E + 2.0 * L) + E, E, D + E, side, false);
      else if (b < 2.0 * D + 2.0 * E + 2.0 * L + HEP) c = plate(x, b - (2.0 * D + 2.0 * E + 2.0 * L), sd + 13);
      else c = cUnder;
    }
  }
  // The main lining over all that, then the stellate cell, then the Kupffer cell.
  if (a < wi + 0.6 && a > hw - 1.4) {
    float dN, de = sdEndo(x, a, hw, side < 0 ? ${SEED.poreUp} : ${SEED.poreDn}, side < 0 ? ${SEED.nucUp} : ${SEED.nucDn}, side > 0, dN);
    c = endoInk(c, de, dN);
  }
  if (side < 0 && abs(x - uXs) < 34.0 && a > hw && a < hi + 10.0) c = hsc(c, vec2(x, a));
  if (side > 0 && abs(x - uXk) < 10.0 && a < uKy + 1.0) c = kupffer(c, vec2(x, y));
  // Focus: beyond this sinusoid's own plates the tissue fades into the page.
  float f0 = uLum + ENDO + disseW(0.0) + HEP * 0.85;
  c = mix(c, cBg, smoothstep(f0, f0 + 18.0, a) * (0.72 + 0.06 * uDark));
  float al = revealA(vec2(x, y), vP, tube);
  o = vec4(c * al, al);
}`;

// Point sprites: albumin (amber spheres), plasma water (small clear droplets), and the flash where albumin meets a sealed wall.
const PVS = `#version 300 es
layout(location=0) in vec4 aP;   // x, y (µm), radius (µm), alpha
layout(location=1) in float aK;  // kind
${COMMON}
uniform vec3 uF0, uF1;          // local µm → device px
uniform float uK;               // device px per µm
out float vA; out float vK; out float vR;
void main() {
  vec2 d = vec2(dot(uF0, vec3(aP.xy, 1.0)), dot(uF1, vec3(aP.xy, 1.0)));
  vR = aP.z * uK; vK = aK;
  vA = aP.w * revealA(aP.xy, d, true);
  gl_PointSize = 2.0 * vR + 3.0;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
const PFS = `#version 300 es
precision highp float;
in float vA; in float vK; in float vR;
uniform vec3 cAlb, cAlbE, cWat, cWatE;
uniform vec2 uLightS;           // toward the light, screen
out vec4 o;
void main() {
  vec2 q = (gl_PointCoord * 2.0 - 1.0) * (vR + 1.5);
  float r = length(q), a;
  vec3 c;
  if (vK > 1.5) {          // the flash: a thin ring
    a = (1.0 - smoothstep(0.55, 1.25, abs(r - vR))) * 0.9;
    c = vec3(1.0);
  } else {
    a = 1.0 - smoothstep(vR - 0.75, vR + 0.75, r);
    vec2 n = q / max(vR, 1.0);
    float lit = clamp(dot(n, uLightS), -1.0, 1.0);
    bool alb = vK < 0.5;
    c = alb ? cAlb : cWat;
    c *= 0.86 + 0.18 * lit;
    c = mix(c, alb ? cAlbE : cWatE, smoothstep(vR - 1.6, vR - 0.2, r) * (alb ? 0.75 : 0.6));
    c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, vR * 0.38, length(q - uLightS * vR * 0.42))) * (alb ? 0.6 : 0.8));
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
  let T, P, quad, vao, pvao, pbuf;
  function init() {
    T = program(VS, FS); P = program(PVS, PFS);
    if (!T || !P) return false;
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
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
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else if (v.length === 3) gl.uniform3fv(l, v);
    else gl.uniform4fv(l, v);
  };
  return {
    get ok() { return ok; },
    /** u: uniforms by name; pts: Float32Array of (x, y, r, alpha, kind) × n. */
    draw(u, pts, n) {
      if (!ok) return;
      const W = canvas.width, H = canvas.height;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.useProgram(T.p);
      set(T.U, 'size', [W, H]);
      for (const k in u) set(T.U, k, u[k]);
      gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (n > 0) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(P.p);
        set(P.U, 'size', [W, H]);
        for (const k in u) set(P.U, k, u[k]);
        gl.bindVertexArray(pvao); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
        gl.bufferData(gl.ARRAY_BUFFER, pts.subarray(0, n * 5), gl.STREAM_DRAW);
        gl.drawArrays(gl.POINTS, 0, n);
      }
      gl.bindVertexArray(null);
    },
  };
}
