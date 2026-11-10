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
//  4. (Mohammad's device screenshots, 10 Nov: fins and spikes at the TIPS ends, where the hepatic veins enter the cava and at the portal fork.) The wall
//     line is not taken at the join's sample but at the corner: webGeometry starts from the join's lines, then WEB_REFIT times moves each leg to the frame of its
//     vessel nearest the corner C (webFrameAt, searched WEB_SPAN segments along the leg) and meets the two lines again, so a vessel that bends away from its first
//     line no longer carries the web's corner and tangent points off its real wall into empty space. The fillet's tangent length stops where the real wall leaves
//     its straight line by more than WEB_DEV of the larger radius (webWallSpan), and a corner more than WEB_OVER of a radius beyond the end of a leg's vessel
//     (a vessel's end is not a wall) makes the web empty. On the real figure and lobule the 90th percentile of the straight edges' gap to the real walls fell
//     from 0.25..0.66 of a radius to 0.06..0.22, the worst from 2.6 to 0.4 (tests/tube-web-real.test.js).
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
import { JOIN_WEB_OUT_GLSL, JOIN_WEB_SET_GLSL } from './tube-join-glsl.js';

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
export const WEB_SPAN = 32;                      // samples a leg's corner search looks along (the corner of the real walls lies near its join)
export const WEB_REFIT = 3;                      // passes that move each leg's wall line to where the real wall is at the corner
export const WEB_DEVN = 16;                      // samples ahead of the corner a fillet's tangent length is checked against
export const WEB_OVER = 0.25;                    // C may lie this share of the larger radius beyond the end of a leg's vessel (a vessel's end is not a wall)
export const WEB_DEV = 0.06;                     // the real wall may leave a leg's straight wall line by this share of the larger radius within the fillet
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
 * The leg's frame at the point of the leg's vessel nearest to c (searched over WEB_SPAN segments from the join's sample, in the leg's direction): the point p
 * on the centreline, the direction d of the segment there (along the leg), the wall normal n, the radius r there, and the segment's first sample (seg).
 * The straight wall line of a web is taken at the corner, where the real walls are, not at the join's sample: a vessel that bends leaves its first line.
 */
export function webFrameAt(P, R, leg0, sample, dir, side, c) {
  let best = null, bd = Infinity;
  for (let m = 0; m < WEB_SPAN; m++) {
    const a = sample + dir * m, b = a + dir;
    if (b < 0 || b >= N_SAMPLES || a < 0 || a >= N_SAMPLES) break;
    const vx = P[2 * b] - P[2 * a], vy = P[2 * b + 1] - P[2 * a + 1], l2 = vx * vx + vy * vy;
    if (!(l2 > 1e-12)) continue;
    const t = clamp(((c[0] - P[2 * a]) * vx + (c[1] - P[2 * a + 1]) * vy) / l2, 0, 1);
    const px = P[2 * a] + vx * t, py = P[2 * a + 1] + vy * t, dd = (c[0] - px) * (c[0] - px) + (c[1] - py) * (c[1] - py);
    if (dd < bd) { bd = dd; best = { a, t, vx, vy, l: Math.sqrt(l2), px, py, over: t >= 1 && (b === 0 || b === N_SAMPLES - 1) ? Math.max(0, ((c[0] - P[2 * b]) * vx + (c[1] - P[2 * b + 1]) * vy) / Math.sqrt(l2)) : 0 }; }
  }
  if (!best) return { ...leg0, seg: sample, over: 0 };
  const sd = side > 0 ? 1 : -1, dx = best.vx / best.l, dy = best.vy / best.l;
  const r0 = Math.max(R[best.a], MIN_RADIUS), r = r0 + (Math.max(R[best.a + dir], MIN_RADIUS) - r0) * best.t;
  return { p: [best.px, best.py], d: [dx, dy], n: [-sd * dy, sd * dx], r, len: leg0.len, seg: best.a, over: best.over };
}
/** How far along a frame's straight wall line (from the frame's wall point) the real wall stays within eps of it: the real wall's samples from the frame's segment on. */
export function webWallSpan(P, R, f, dir, side, eps) {
  const sd = side > 0 ? 1 : -1, w0x = f.p[0] + f.n[0] * f.r, w0y = f.p[1] + f.n[1] * f.r;
  let prevE = 0, prevU = 0;
  for (let k = 1; k <= WEB_DEVN; k++) {
    const j = f.seg + dir * k;
    if (j < 0 || j >= N_SAMPLES) return prevU;   // the vessel ends: so does its wall
    const j2 = j + dir, jj = j2 >= 0 && j2 < N_SAMPLES ? j2 : j - dir;
    let dx = (P[2 * jj] - P[2 * j]) * (jj === j2 ? 1 : -1), dy = (P[2 * jj + 1] - P[2 * j + 1]) * (jj === j2 ? 1 : -1);
    const l = Math.hypot(dx, dy);
    if (!(l > 1e-6)) continue;
    dx /= l; dy /= l;
    const r = Math.max(R[j], MIN_RADIUS), wx = P[2 * j] - sd * dy * r - w0x, wy = P[2 * j + 1] + sd * dx * r - w0y;
    const e = Math.abs(wx * f.d[1] - wy * f.d[0]), u = wx * f.d[0] + wy * f.d[1];
    if (e > eps) return prevU + (u - prevU) * clamp((eps - prevE) / (e - prevE), 0, 1);
    prevE = e; prevU = u;
  }
  return 1e9;
}

/**
 * The whole web of an instance record `inst` (WEB_FLOATS numbers) between leg A (PA, RA: the row's points flat and its radii) and leg B (PB, RB):
 * { empty, A, B, ownB (the owner is leg B), theta, C, O, rho, Ta, Tb, arc (WEB_PTS points), w, Rm, vDapex }. aaPad: two device pixels in world units.
 * An empty web has C = the first leg's wall point and nothing else of use. A and B are the legs' frames at the corner (webFrameAt), after WEB_REFIT passes
 * that start from the join's own samples; the fillet's tangent length stops where a real wall leaves its straight line by more than WEB_DEV of the larger radius.
 */
export function webGeometry(PA, RA, PB, RB, inst, aaPad) {
  const A0 = legOf(PA, RA, inst, 0), B0 = legOf(PB, RB, inst, 4);
  const sA = Math.round(inst[1]), dA = inst[2] > 0 ? 1 : -1, sB = Math.round(inst[5]), dB = inst[6] > 0 ? 1 : -1;
  const wall = (L) => [L.p[0] + L.n[0] * L.r, L.p[1] + L.n[1] * L.r];
  const meet = (A, B) => {
    const cr = cross2(A.d[0], A.d[1], B.d[0], B.d[1]);
    if (Math.abs(cr) < 1e-12) return null;
    const a = wall(A), b = wall(B), t = cross2(b[0] - a[0], b[1] - a[1], B.d[0], B.d[1]) / cr;
    return [a[0] + t * A.d[0], a[1] + t * A.d[1]];
  };
  let A = { ...A0, seg: sA }, B = { ...B0, seg: sB };
  const own = inst[10], ownB = own > 1.5 ? B.r > A.r : own > 0.5;
  const Rm = Math.max(A0.r, B0.r);
  const out = { empty: true, A, B, ownB, theta: 0, C: wall(A0), O: wall(A0), rho: 0, Ta: wall(A0), Tb: wall(A0), arc: [], w: 0, Rm, vDapex: 0, wa: wall(A0), wb: wall(B0) };
  let C = meet(A, B);
  if (!C) return out;
  for (let it = 0; it < WEB_REFIT; it++) {
    const A1 = webFrameAt(PA, RA, A0, sA, dA, inst[3], C), B1 = webFrameAt(PB, RB, B0, sB, dB, inst[7], C);
    const C1 = meet(A1, B1);
    if (!C1) break;
    A = A1; B = B1; C = C1;
  }
  out.A = A; out.B = B; out.wa = wall(A); out.wb = wall(B); out.C = C;
  const cr = cross2(A.d[0], A.d[1], B.d[0], B.d[1]), cs = A.d[0] * B.d[0] + A.d[1] * B.d[1];
  const theta = Math.atan2(Math.abs(cr), cs);
  out.theta = theta;
  if (theta < WEB_MIN_DEG * DEG || theta >= WEB_MAX_DEG * DEG) return out;
  if (Math.max(A.over, B.over) > WEB_OVER * Rm) return out;
  if (Math.max(Math.hypot(C[0] - A0.p[0], C[1] - A0.p[1]), Math.hypot(C[0] - B0.p[0], C[1] - B0.p[1])) > WEB_FAR * Rm) return out;
  const th2 = Math.tan(0.5 * theta);
  const eps = WEB_DEV * Rm, wA = wall(A), wB = wall(B);
  const tlMax = Math.min(webWallSpan(PA, RA, A, dA, inst[3], eps) - ((C[0] - wA[0]) * A.d[0] + (C[1] - wA[1]) * A.d[1]), webWallSpan(PB, RB, B, dB, inst[7], eps) - ((C[0] - wB[0]) * B.d[0] + (C[1] - wB[1]) * B.d[1]));
  const rho = Math.min(inst[8], Math.min(WEB_CUT * Math.min(A0.len, B0.len) * th2, Math.min(inst[9] * th2, tlMax * th2)));
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
  const px = 0.5 * aaPad;
  const w = Math.min(clamp(0.14 * Rm, 1.5 * px, 3 * px) + aaPad, 0.98 * rho);
  // (the skirt's width at each end is its own arm's outline's, so the web's outline meets each arm's without a step: the arms' radii differ, the outline's width follows the radius)
  out.skirt = (k) => Math.min(clamp(0.14 * (A0.r + (B0.r - A0.r) * (k / WEB_ARC)), 1.5 * px, 3 * px) + aaPad, 0.98 * rho);
  out.empty = false; out.O = O; out.rho = rho; out.Ta = Ta; out.Tb = Tb; out.arc = arc; out.w = w; out.bis = bis;
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
  else if (kind === WEB_KIND.OUT) { const wk = g.skirt(k); res.x = q[0] + ux * wk; res.y = q[1] + uy * wk; res.f = L.CASE0; res.vD = wk; }
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
const int W_SPAN = ${WEB_SPAN};
const int W_REFIT = ${WEB_REFIT};
const int W_DEVN = ${WEB_DEVN};
const float W_DEV = ${f(WEB_DEV)};
const float W_OVER = ${f(WEB_OVER)};
${ZOOM_VS ? `${ZOOM_VS}\n` : ''}out float vI;
flat out int vRow;
out float vD;
out vec2 vG;
out float vRad;
flat out vec2 vEnd;
${JOIN_WEB_OUT_GLSL}
invariant gl_Position;
struct WLeg { vec2 p; vec2 d; vec2 n; float r; float len; int seg; float over; };
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
  g.seg = i;
  g.over = 0.0;
  return g;
}
float wCross(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
// The leg's frame at the point of its vessel nearest to c (WEB_SPAN segments from sample i0 in direction s): webFrameAt's twin.
WLeg wFrameAt(int id, WLeg g0, int i0, int s, float sd, vec2 c) {
  float bd = 1e30, bt = 0.0, bl = 1.0, bover = 0.0;
  bool have = false;
  vec2 bp = vec2(0.0), bv = vec2(1.0, 0.0);
  int ba = i0;
  for (int m = 0; m < W_SPAN; m++) {
    int a = i0 + s * m, b = a + s;
    if (b < 0 || b >= N_SAMPLES || a < 0 || a >= N_SAMPLES) break;
    vec2 pa = PT(id, a), pb = PT(id, b);
    vec2 v = pb - pa;
    float l2 = dot(v, v);
    if (!(l2 > 1e-12)) continue;
    float t = clamp(dot(c - pa, v) / l2, 0.0, 1.0);
    vec2 pp = pa + v * t, e = c - pp;
    float dd = dot(e, e);
    if (dd < bd) {
      bd = dd; have = true; ba = a; bt = t; bp = pp; bv = v; bl = sqrt(l2);
      bover = (t >= 1.0 && (b == 0 || b == N_SAMPLES - 1)) ? max(0.0, dot(c - pb, v) / bl) : 0.0;
    }
  }
  if (!have) { g0.seg = i0; g0.over = 0.0; return g0; }
  WLeg g;
  g.p = bp;
  g.d = bv / bl;
  g.n = sd * vec2(-g.d.y, g.d.x);
  float r0 = mRW(id, ba, 0.0), r1 = mRW(id, ba + s, 0.0);
  g.r = r0 + (r1 - r0) * bt;
  g.len = g0.len;
  g.seg = ba;
  g.over = bover;
  return g;
}
// How far along the frame's straight wall line the real wall stays within eps of it: webWallSpan's twin.
float wSpan(int id, WLeg f, int s, float sd, float eps) {
  vec2 w0 = f.p + f.n * f.r;
  float prevE = 0.0, prevU = 0.0;
  for (int k = 1; k <= W_DEVN; k++) {
    int j = f.seg + s * k;
    if (j < 0 || j >= N_SAMPLES) return prevU;
    int j2 = j + s;
    bool fw = j2 >= 0 && j2 < N_SAMPLES;
    vec2 pj = PT(id, j);
    vec2 dv = fw ? PT(id, j2) - pj : pj - PT(id, j - s);
    float l = length(dv);
    if (!(l > 1e-6)) continue;
    dv /= l;
    vec2 w = pj + sd * vec2(-dv.y, dv.x) * mRW(id, j, 0.0) - w0;
    float e = abs(wCross(w, f.d)), u = dot(w, f.d);
    if (e > eps) return prevU + (u - prevU) * clamp((eps - prevE) / (e - prevE), 0.0, 1.0);
    prevE = e; prevU = u;
  }
  return 1e9;
}
vec3 wMeet(WLeg A, WLeg B) {   // (1, C) when the wall lines meet, else (0, 0, 0)
  float cr = wCross(A.d, B.d);
  if (abs(cr) < 1e-12) return vec3(0.0);
  vec2 a = A.p + A.n * A.r, b = B.p + B.n * B.r;
  return vec3(1.0, a + (wCross(b - a, B.d) / cr) * A.d);
}
void main() {
  int kind = int(aV.x + 0.5), k = int(aV.y + 0.5);
  WLeg A = wLeg(aLegA), B = wLeg(aLegB);
  bool ownB = aWeb.z > 1.5 ? B.r > A.r : aWeb.z > 0.5;
  vRow = int((ownB ? aLegB.x : aLegA.x) + 0.5);${ZOOM_VS ? '\n  zoomOut();' : ''}
  vI = ownB ? aLegB.y : aLegA.y;
  vEnd = vec2(-1.0);
  ${JOIN_WEB_SET_GLSL}
  vD = 0.0; vG = vec2(0.0);
  float Rm = max(A.r, B.r);
  vRad = 4.0 * Rm;
  if (mPass < ${MP.SHAPE_K}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // no glow, up-glow or shadow of a web
  int idA = int(aLegA.x + 0.5), iA = int(aLegA.y + 0.5), sA = aLegA.z > 0.0 ? 1 : -1, idB = int(aLegB.x + 0.5), iB = int(aLegB.y + 0.5), sB = aLegB.z > 0.0 ? 1 : -1;
  float dA = aLegA.w > 0.0 ? 1.0 : -1.0, dB = aLegB.w > 0.0 ? 1.0 : -1.0;
  WLeg A0 = A, B0 = B;
  bool empty = false;
  vec2 C = A.p + A.n * A.r;
  vec3 m0 = wMeet(A, B);
  if (m0.x < 0.5) empty = true; else C = m0.yz;
  for (int it = 0; it < W_REFIT; it++) {
    if (empty) break;
    WLeg A1 = wFrameAt(idA, A0, iA, sA, dA, C), B1 = wFrameAt(idB, B0, iB, sB, dB, C);
    vec3 m1 = wMeet(A1, B1);
    if (m1.x < 0.5) break;
    A = A1; B = B1; C = m1.yz;
  }
  vec2 wa = A.p + A.n * A.r;
  float cr = wCross(A.d, B.d);
  float theta = atan(abs(cr), dot(A.d, B.d));
  empty = empty || theta < W_MIN || theta >= W_MAX;
  vec2 O = wa, bis = vec2(0.0);
  float rho = 0.0;
  if (!empty) {
    if (max(A.over, B.over) > W_OVER * Rm) empty = true;
    if (max(distance(C, A0.p), distance(C, B0.p)) > W_FAR * Rm) empty = true;
  }
  float th2 = 0.0;
  if (!empty) {
    th2 = tan(0.5 * theta);
    float eps = W_DEV * Rm;
    vec2 wA = A.p + A.n * A.r, wB = B.p + B.n * B.r;
    float tlMax = min(wSpan(idA, A, sA, dA, eps) - dot(C - wA, A.d), wSpan(idB, B, sB, dB, eps) - dot(C - wB, B.d));
    rho = min(aWeb.x, min(W_CUT * min(A0.len, B0.len) * th2, min(aWeb.y * th2, tlMax * th2)));
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
    float rk = mix(A0.r, B0.r, float(k) / float(W_ARC));   // (the skirt's width follows the radius along the arc: each arm's own outline at its end)
    float w = min(clamp(0.14 * rk, 1.5 * px, 3.0 * px) + aaPad, 0.98 * rho);
    if (kind == W_APEX) { q = vec3(C, W_LEVEL); vD = min(-(length(C - O) - rho), -2.0 * aaPad); vG = bis; }
    else if (kind == W_FILL) { q = vec3(pt, W_LEVEL); vG = up; }
    else if (kind == W_IN) { q = vec3(pt, W_CASE1); vG = up; }
    else { q = vec3(pt + up * w, W_CASE0); vD = w; vG = up; }
  }
  vec3 d = world * vec3(q.xy, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0, 1.0);
}`;
