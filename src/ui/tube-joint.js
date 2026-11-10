// The Tube renderer's joins made of geometry (10 Nov 2026, docs/recommendations/tube-renderer-stage2-3-plan.md, brief S2-J): pure JS plus a
// GLSL string, no GL calls here. A join of vessels is already a correct union under the Tube's depth test (the taller lumen wins each pixel,
// every outline lies under every lumen of its tier). What is missing is the rounding of a concave corner, where two facing walls meet at a
// point. A WEB fills it: a fan from that corner point C out to an arc tangent to both walls, with a skirt past the arc for the outline.
//
// One web is one instance of a fixed mesh (webIndex, WEB_VERTS vertices). Its inputs are 12 floats a web (tube-data.js webInstances writes
// them; the layout is WEB_FLOATS, read in the vertex shader as three vec4 attributes, locations 1 to 3, divisor 1):
//    0..3   leg A: row, sample, dir (+1: the leg leaves the join toward higher samples, -1 toward lower), side (+1: the wall to the left of dir)
//    4..7   leg B: the same
//    8      rho0: the fillet radius the join asks for (its blend width k times its fillet share; the patches' numbers)
//    9      reach: the join's reach, which caps the fillet's tangent length
//    10     owner: 0 leg A's row, 1 leg B's row, 2 whichever row's radius is larger at its leg (A on a tie). The owner gives the web its colour and
//           attributes (vRow, vI): the trunk if the join has one among the two legs, else the wider member.
//    11     unused (0)
// A leg is the centreline sample nearest the join (`sample`) and the direction `d` (unit) the vessel leaves the join in there: toward the first
// sample past it (in `dir`) that lies at least 1e-6 away. The leg's wall line runs along d through P(sample) + side * n * R, n = d turned left,
// R = max(radius, MIN_RADIUS) at the sample. C is where the two wall lines meet; theta is the angle between the two d. The web is EMPTY (all its
// vertices at the first leg's wall point: zero area) when theta is under WEB_MIN_DEG or over WEB_MAX_DEG, when C lies farther than WEB_FAR times
// the larger leg's radius from either leg's sample, or when the fillet cannot be placed (rho under 1e-5). Otherwise rho = min(rho0, 0.9 * the shorter leg's chord to its vessel's far end
// * tan(theta / 2), reach * tan(theta / 2)), so the tangent length t = rho / tan(theta / 2) is at most 0.9 of each leg's length and at most the
// reach; Ta = C + dA t, Tb = C + dB t; the arc's centre O = C + normalize(dA + dB) rho / sin(theta / 2); the arc runs Ta to Tb about O in WEB_ARC steps.
// Decisions taken on real data (the planner thread, 10 Nov 2026, for Mohammad), each a change from the brief as first written:
//  1. WEB_MIN_DEG is 20, not 3, and WEB_FAR is 4 radii of the larger leg, not 3 reaches. On the figure's and the lobule's real joins a wall line is a straight
//     line from one sample and real vessels curve: with the brief's guards the tangent point was off the real wall by a median 14 to 56 percent of the radius
//     and, in the figure's collateral bundles (vessels leaving one node about 10 degrees apart), up to 12 radii. A sliver between two legs under 20 degrees
//     apart gets no web: the plain union of the two tubes is the join there, and a thin wedge between two outlined tubes is hardly a crotch.
//  2. A member whose nearest sample is interior has two legs, trunk mark or not (tube-data.js legsOf): about a third of the lobule's members run through a join
//     without being marked its trunk.
//  3. A web takes its owner's colour and opacity (the plan's contract has no alpha varying), so next to a half-faded branch the corner is solid. Accepted; it
//     is listed under the known differences.
// Vertices (attribute aV = (kind, arc index, 0, 0), WEB_KIND):
//    APEX  C                              level WEB_LEVEL   vD min(-(|C O| - rho), -2 aaPad)   vG normalize(dA + dB)
//    FILL  arc point k                    level WEB_LEVEL   vD 0                               vG toward O from the point
//    IN    arc point k                    level CASE1       vD 0                               vG as FILL
//    OUT   arc point k moved toward O by w  level CASE0     vD +w                              vG as FILL
// with w = min(clamp(0.14 Rm, 1.5 px, 3 px) + aaPad, 0.98 rho), Rm the larger leg's radius, px = aaPad / 2 (aaPad is two device pixels, world). The fan
// is APEX with the FILL points; the skirt is IN and OUT. A web draws nothing in the glow, up-glow and shadow passes (mPass under MP.SHAPE_K).
// Varyings (the plan's contract): vI the owner's leg sample, vRow the owner's row, vD, vG, vRad 4 Rm, vEnd (-1, -1). Levels are placed in the pass's
// band exactly as tubeStripVS places a level (tubeBase, tubeH). webVertex is the JS twin of the shader's placement (same arithmetic in the same
// order; the tests run the JS one); webGeometry is the whole web it places.
import { N_SAMPLES, MIN_RADIUS } from './veins-mesh.js';
import { MP } from './veins-mesh-glsl.js';
import { TUBE_LEVEL } from './tube-geo.js';

export const WEB_ARC = 6;                        // the arc's steps
export const WEB_PTS = WEB_ARC + 1;              // its points
export const WEB_KIND = { APEX: 0, FILL: 1, IN: 2, OUT: 3 };
export const WEB_VERTS = 1 + 3 * WEB_PTS;        // 22: the apex, then the fill, skirt-inner and skirt-outer arcs
export const WEB_FILL = 1, WEB_IN = 1 + WEB_PTS, WEB_OUT = 1 + 2 * WEB_PTS;   // the first vertex of each arc
export const WEB_FLOATS = 12;                    // a web's instance record (see above)
export const WEB_LEVEL = 0.295;                  // a web's fill: over every casing and fading lumen, under every opaque lumen (TUBE_LEVEL's table is A's)
export const WEB_MIN_DEG = 20;                   // legs closer to parallel than this make no web: the plain union of the two tubes is the join there (planner, 10 Nov: B)
export const WEB_MAX_DEG = 170;                  // legs this far apart or more make none (a straight run has no corner)
export const WEB_FAR = 4;                        // C farther than this many radii (of the larger leg) from either leg's sample is an empty web (planner, 10 Nov: B; the brief said 3 reaches)
export const WEB_CUT = 0.9;                      // the tangent length is at most this share of a leg's length
export const WEB_LOOK = 8;                       // samples a leg looks along for its direction (a segment of zero length has none)
const L = TUBE_LEVEL;
const DEG = Math.PI / 180;

/** The static buffers, built once: per-vertex attributes (4 floats a vertex: kind, arc index, 0, 0) and the triangle index (Uint16). */
export function webIndex() {
  const attr = new Float32Array(WEB_VERTS * 4);
  const put = (v, kind, k) => { attr[v * 4] = kind; attr[v * 4 + 1] = k; };
  put(0, WEB_KIND.APEX, 0);
  for (let k = 0; k < WEB_PTS; k++) { put(WEB_FILL + k, WEB_KIND.FILL, k); put(WEB_IN + k, WEB_KIND.IN, k); put(WEB_OUT + k, WEB_KIND.OUT, k); }
  const tri = [];
  for (let k = 0; k < WEB_ARC; k++) tri.push(0, WEB_FILL + k, WEB_FILL + k + 1);                                              // the fan
  for (let k = 0; k < WEB_ARC; k++) tri.push(WEB_IN + k, WEB_OUT + k, WEB_IN + k + 1, WEB_IN + k + 1, WEB_OUT + k, WEB_OUT + k + 1);   // the skirt
  return { attr, index: Uint16Array.from(tri), nVerts: WEB_VERTS, nIndex: tri.length };
}

// ---- The JS twin ----------------------------------------------------------------------------------------------------------

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** The direction a leg leaves in: toward the first sample past `i` (in `dir`) at least 1e-6 away, within WEB_LOOK samples; else (dir, 0). */
export function legDirection(P, i, dir) {
  const px = P[2 * i], py = P[2 * i + 1];
  for (let k = 1; k <= WEB_LOOK; k++) {
    const j = i + dir * k;
    if (j < 0 || j >= N_SAMPLES) break;
    const qx = P[2 * j] - px, qy = P[2 * j + 1] - py, l = Math.hypot(qx, qy);
    if (l > 1e-6) return [qx / l, qy / l];
  }
  return [dir, 0];
}
/** A leg: its sample's point p, direction d, wall normal n (d turned left, times side), radius r and the chord len to its vessel's far end. */
export function webLeg(P, R, sample, dir, side) {
  const d = legDirection(P, sample, dir), r = Math.max(R[sample], MIN_RADIUS), sd = side > 0 ? 1 : -1;
  const p = [P[2 * sample], P[2 * sample + 1]], far = dir > 0 ? N_SAMPLES - 1 : 0;
  return { p, d, n: [-sd * d[1], sd * d[0]], r, len: Math.hypot(P[2 * far] - p[0], P[2 * far + 1] - p[1]) };
}
const legOf = (P, R, rec, o) => webLeg(P, R, Math.round(rec[o + 1]), rec[o + 2] > 0 ? 1 : -1, rec[o + 3]);
const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;

/**
 * The whole web of an instance record `inst` (WEB_FLOATS numbers) between leg A (PA, RA: the row's points flat and its radii) and leg B (PB, RB):
 * { empty, A, B, ownB (the owner is leg B), theta, C, O, rho, Ta, Tb, arc (WEB_PTS points), w, Rm, vDapex }. aaPad: two device pixels in world units.
 * An empty web has C = the first leg's wall point and nothing else of use.
 */
export function webGeometry(PA, RA, PB, RB, inst, aaPad) {
  const A = legOf(PA, RA, inst, 0), B = legOf(PB, RB, inst, 4);
  const wa = [A.p[0] + A.n[0] * A.r, A.p[1] + A.n[1] * A.r], wb = [B.p[0] + B.n[0] * B.r, B.p[1] + B.n[1] * B.r];
  const own = inst[10], ownB = own > 1.5 ? B.r > A.r : own > 0.5;
  const out = { empty: true, A, B, ownB, theta: 0, C: wa, O: wa, rho: 0, Ta: wa, Tb: wa, arc: [], w: 0, Rm: Math.max(A.r, B.r), vDapex: 0, wa, wb };
  const cr = cross2(A.d[0], A.d[1], B.d[0], B.d[1]), cs = A.d[0] * B.d[0] + A.d[1] * B.d[1];
  const theta = Math.atan2(Math.abs(cr), cs);
  out.theta = theta;
  if (theta < WEB_MIN_DEG * DEG || theta >= WEB_MAX_DEG * DEG) return out;
  const t = cross2(wb[0] - wa[0], wb[1] - wa[1], B.d[0], B.d[1]) / cr;
  const C = [wa[0] + t * A.d[0], wa[1] + t * A.d[1]];
  if (Math.max(Math.hypot(C[0] - A.p[0], C[1] - A.p[1]), Math.hypot(C[0] - B.p[0], C[1] - B.p[1])) > WEB_FAR * out.Rm) return out;
  const th2 = Math.tan(0.5 * theta);
  const rho = Math.min(inst[8], Math.min(WEB_CUT * Math.min(A.len, B.len) * th2, inst[9] * th2));
  if (!(rho > 1e-5)) return out;
  const tl = rho / th2;
  const bx = A.d[0] + B.d[0], by = A.d[1] + B.d[1], bl = Math.hypot(bx, by), bis = [bx / bl, by / bl];
  const s2 = Math.sin(0.5 * theta), O = [C[0] + (bis[0] * rho) / s2, C[1] + (bis[1] * rho) / s2];
  const Ta = [C[0] + A.d[0] * tl, C[1] + A.d[1] * tl], Tb = [C[0] + B.d[0] * tl, C[1] + B.d[1] * tl];
  const vax = Ta[0] - O[0], vay = Ta[1] - O[1], vbx = Tb[0] - O[0], vby = Tb[1] - O[1];
  const sgn = cross2(vax, vay, vbx, vby) >= 0 ? 1 : -1, sweep = Math.PI - theta;
  const arc = [];
  for (let k = 0; k < WEB_PTS; k++) {
    const a = (sgn * sweep * k) / WEB_ARC, c = Math.cos(a), s = Math.sin(a);
    arc.push([O[0] + vax * c - vay * s, O[1] + vax * s + vay * c]);
  }
  const px = 0.5 * aaPad, Rm = out.Rm;
  const w = Math.min(clamp(0.14 * Rm, 1.5 * px, 3 * px) + aaPad, 0.98 * rho);
  out.empty = false; out.C = C; out.O = O; out.rho = rho; out.Ta = Ta; out.Tb = Tb; out.arc = arc; out.w = w; out.bis = bis;
  out.vDapex = Math.min(-(Math.hypot(C[0] - O[0], C[1] - O[1]) - rho), -2 * aaPad);
  return out;
}

/**
 * Any vertex of a web, the JS twin of the shader's placement. inst: the record; a: the vertex attribute (kind, arc index, 0, 0). Returns
 * { x, y, f (the level), vD, gx, gy (vG), rad (vRad), sample (vI), ownB (the owner is leg B), empty }.
 */
export function webVertex(PA, RA, PB, RB, inst, a, aaPad) {
  const g = webGeometry(PA, RA, PB, RB, inst, aaPad), kind = Math.round(a[0]), k = Math.round(a[1]);
  const res = { x: g.wa[0], y: g.wa[1], f: WEB_LEVEL, vD: 0, gx: 0, gy: 0, rad: 4 * g.Rm, sample: g.ownB ? inst[5] : inst[1], ownB: g.ownB, empty: g.empty };
  if (g.empty) return res;
  if (kind === WEB_KIND.APEX) { res.x = g.C[0]; res.y = g.C[1]; res.vD = g.vDapex; res.gx = g.bis[0]; res.gy = g.bis[1]; return res; }
  const q = g.arc[k], ox = g.O[0] - q[0], oy = g.O[1] - q[1], ol = Math.hypot(ox, oy), ux = ox / ol, uy = oy / ol;
  res.x = q[0]; res.y = q[1]; res.gx = ux; res.gy = uy;
  if (kind === WEB_KIND.IN) res.f = L.CASE1;
  else if (kind === WEB_KIND.OUT) { res.x = q[0] + ux * g.w; res.y = q[1] + uy * g.w; res.f = L.CASE0; res.vD = g.w; }
  return res;
}

// ---- The vertex shader: the same placement in GLSL --------------------------------------------------------------------------

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/**
 * The vertex shader of the Tube's webs. STRIP_VS_GLSL: veins-mesh.js's (PT, mRW, N_SAMPLES, M_PI). Uniforms as tubeStripVS has them, so one draw feeds both
 * (a web reads world, size, lOff, ent, rad, posBase, mPass, tubeBase, tubeH, aaPad; the others are declared and unused). Attributes: 0 aV, then the instance
 * record as 1 aLegA, 2 aLegB, 3 aWeb. Outputs are the plan's contract: vI, vRow, vD, vG, vRad, vEnd.
 * ZOOM_VS (optional, the host's text, as tubeStripVS takes it): included before `out float vI;`, and zoomOut() is called right after vRow is written (before
 * any early return), so zoomA and zoomB are written exactly as the strip writes them; given none the text is unchanged. F_SEL is accepted so the call matches the
 * strip's (a web has no selection). A web's vG is a unit direction, not an offset (the strip's is the offset), and thread C's lumen shader tells a web by
 * vRad over twice the radius (a web writes vRad = 4 Rm); both stay as they are.
 */
export const tubeWebVS = (STRIP_VS_GLSL, F_SEL = 1, ZOOM_VS = '') => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
layout(location=0) in vec4 aV;         // (kind, arc index, 0, 0): tube-joint.js webIndex
layout(location=1) in vec4 aLegA;      // (row, sample, dir, side) of the first leg (per instance)
layout(location=2) in vec4 aLegB;      // the second leg's
layout(location=3) in vec4 aWeb;       // (rho0, reach, owner, 0)
uniform mat3 world;                    // world → device pixels
uniform vec2 size;
uniform vec2 lOff;
uniform highp sampler2D tube;
uniform int mPass;
uniform float padU;
uniform float selPad;
uniform float tubeBase;                // this pass pair's band of depth: tubeBase + [0, 1) * tubeH
uniform float tubeH;
uniform float hRef;
uniform float celK;
uniform float aaPad;                   // two device pixels, world
uniform float zK;
uniform float hK;
${STRIP_VS_GLSL}
const int W_APEX = ${WEB_KIND.APEX};
const int W_FILL = ${WEB_KIND.FILL};
const int W_IN = ${WEB_KIND.IN};
const int W_OUT = ${WEB_KIND.OUT};
const int W_ARC = ${WEB_ARC};
const int W_LOOK = ${WEB_LOOK};
const float W_LEVEL = ${f(WEB_LEVEL)};
const float W_CASE0 = ${f(L.CASE0)};
const float W_CASE1 = ${f(L.CASE1)};
const float W_MIN = ${f(WEB_MIN_DEG * DEG)};
const float W_MAX = ${f(WEB_MAX_DEG * DEG)};
const float W_FAR = ${f(WEB_FAR)};
const float W_CUT = ${f(WEB_CUT)};
${ZOOM_VS ? `${ZOOM_VS}\n` : ''}out float vI;
flat out int vRow;
out float vD;
out vec2 vG;
out float vRad;
flat out vec2 vEnd;
invariant gl_Position;
struct WLeg { vec2 p; vec2 d; vec2 n; float r; float len; };
// The direction the leg leaves in: toward the first sample past i (in s) at least 1e-6 away, else (s, 0).
vec2 wDir(int id, int i, int s) {
  vec2 p = PT(id, i);
  for (int k = 1; k <= W_LOOK; k++) {
    int j = i + s * k;
    if (j < 0 || j >= N_SAMPLES) break;
    vec2 q = PT(id, j) - p;
    float l = length(q);
    if (l > 1e-6) return q / l;
  }
  return vec2(float(s), 0.0);
}
WLeg wLeg(vec4 a) {
  int id = int(a.x + 0.5), i = int(a.y + 0.5), s = a.z > 0.0 ? 1 : -1;
  float sd = a.w > 0.0 ? 1.0 : -1.0;
  WLeg g;
  g.p = PT(id, i);
  g.d = wDir(id, i, s);
  g.r = mRW(id, i, 0.0);
  g.n = sd * vec2(-g.d.y, g.d.x);
  g.len = length(PT(id, s > 0 ? N_SAMPLES - 1 : 0) - g.p);
  return g;
}
float wCross(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
void main() {
  int kind = int(aV.x + 0.5), k = int(aV.y + 0.5);
  WLeg A = wLeg(aLegA), B = wLeg(aLegB);
  bool ownB = aWeb.z > 1.5 ? B.r > A.r : aWeb.z > 0.5;
  vRow = int((ownB ? aLegB.x : aLegA.x) + 0.5);${ZOOM_VS ? '\n  zoomOut();' : ''}
  vI = ownB ? aLegB.y : aLegA.y;
  vEnd = vec2(-1.0);
  vD = 0.0; vG = vec2(0.0);
  float Rm = max(A.r, B.r);
  vRad = 4.0 * Rm;
  if (mPass < ${MP.SHAPE_K}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // no glow, up-glow or shadow of a web
  vec2 wa = A.p + A.n * A.r, wb = B.p + B.n * B.r;
  float cr = wCross(A.d, B.d);
  float theta = atan(abs(cr), dot(A.d, B.d));
  bool empty = theta < W_MIN || theta >= W_MAX;
  vec2 C = wa, O = wa, bis = vec2(0.0);
  float rho = 0.0;
  if (!empty) {
    float t = wCross(wb - wa, B.d) / cr;
    C = wa + t * A.d;
    if (max(distance(C, A.p), distance(C, B.p)) > W_FAR * Rm) empty = true;
  }
  float th2 = 0.0;
  if (!empty) {
    th2 = tan(0.5 * theta);
    rho = min(aWeb.x, min(W_CUT * min(A.len, B.len) * th2, aWeb.y * th2));
    if (!(rho > 1e-5)) empty = true;
  }
  vec3 q = vec3(wa, W_LEVEL);
  if (!empty) {
    float tl = rho / th2;
    bis = normalize(A.d + B.d);
    O = C + bis * rho / sin(0.5 * theta);
    vec2 va = C + A.d * tl - O, vb = C + B.d * tl - O;
    float sgn = wCross(va, vb) >= 0.0 ? 1.0 : -1.0;
    float an = sgn * (M_PI - theta) * float(k) / float(W_ARC);
    float ca = cos(an), sa = sin(an);
    vec2 pt = O + vec2(va.x * ca - va.y * sa, va.x * sa + va.y * ca);
    vec2 up = normalize(O - pt);
    float px = 0.5 * aaPad;
    float w = min(clamp(0.14 * Rm, 1.5 * px, 3.0 * px) + aaPad, 0.98 * rho);
    if (kind == W_APEX) { q = vec3(C, W_LEVEL); vD = min(-(length(C - O) - rho), -2.0 * aaPad); vG = bis; }
    else if (kind == W_FILL) { q = vec3(pt, W_LEVEL); vG = up; }
    else if (kind == W_IN) { q = vec3(pt, W_CASE1); vG = up; }
    else { q = vec3(pt + up * w, W_CASE0); vD = w; vG = up; }
  }
  vec3 d = world * vec3(q.xy, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0, 1.0);
}`;
