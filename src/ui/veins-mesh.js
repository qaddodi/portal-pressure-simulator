// The vessel mesh renderer's geometry (8 Nov 2026, the deleted docs/veins-mesh-plan.md, Phase 1): pure JS plus GLSL strings, no GL calls here.
// One vessel row is drawn as ONE instance of a fixed mesh (stripIndex), placed by the vertex shader from the row's points and radii:
//   - the strip: N_SAMPLES samples, two vertices each (vertex k: sample i = k >> 1, side s = (k & 1) ? +1 : -1), 63 quads, with
//     the corner of each joint at the averaged (mitre) offset;
//   - two round end caps (a fan each);
//   - the bevel: where a joint is too tight for a mitre (a turn past what MITRE_LIMIT allows, a hairpin, or a segment too short for
//     its inner corner) the strip pinches to the centreline there and a hexagon fan around the sample plus the full side-quads of its
//     two segments cover what the pinch gave up. Everywhere else those extra triangles collapse to a point (zero area, never drawn).
// The mesh covers the capsule union of the vessel widened by `pad` (the shaders find the exact distance themselves; this only has to
// reach every pixel they can colour): the union, over the segments, of the discs of radius r(t) + pad along a segment, r running
// straight between the two samples' radii. Taper: a radius changing by more than TILT_MAX of the distance travelled is outside the
// guarantee (real vessels change 0.02); the tangent quads use the tilted normal so a tapering vessel is covered, not only a constant one.
// stripVertex / meshVertex are the JS twin of STRIP_VS_GLSL, same arithmetic in the same order; the tests run the JS one.
// Draw note: overlapping triangles of one vessel (inside of a bend, bevel over strip) shade the same pixel twice with the same colour;
// the vessel passes must not blend twice (depth test LESS with depth = z, as the plan's tier order has it).
import { ENT_W } from './veins-bin.js';

export const N_SAMPLES = 64;
export const N_QUADS = N_SAMPLES - 1;
export const MITRE_LIMIT = 2;     // the longest mitre, in half-widths (a turn of 120 degrees); tighter joints are bevelled
export const CAP_SEGS = 8;        // the arcs of a round end cap
export const DISC_SEGS = 6;       // the sides of a bevel disc (circumscribed)
export const MIN_RADIUS = 0.3;    // radAt's floor
export const TILT_MAX = 0.9;      // the steepest taper the tangent normals follow (radius change over distance)
export const SEG_EPS = 1e-9;      // a segment shorter than this has no direction of its own (it borrows a neighbour's)
export const KIND = { BODY: 0, CAP: 1, DISC: 2, TRAP: 3 };

// The vertex layout of one instance (attribute a = (kind, i, s, u), four floats a vertex).
export const CAP_VERTS = CAP_SEGS + 3;                    // centre + the rim: two tangent points and CAP_SEGS corners between
export const BODY_VERTS = N_SAMPLES * 2;
export const CAP_BASE = BODY_VERTS;                       // cap e (0: the start, 1: the end) at CAP_BASE + e * CAP_VERTS
export const DISC_BASE = CAP_BASE + 2 * CAP_VERTS;        // sample i (1 .. N_SAMPLES - 2) at DISC_BASE + (i - 1) * DISC_SEGS
export const TRAP_BASE = DISC_BASE + (N_SAMPLES - 2) * DISC_SEGS;   // segment j (0 .. N_QUADS - 1) at TRAP_BASE + 4 * j
export const N_VERTS = TRAP_BASE + 4 * N_QUADS;

const DISC_R = 1 / Math.cos(Math.PI / DISC_SEGS);

/** The static buffers, built once: per-vertex attributes (4 floats a vertex), the triangle index (CCW), and the row ids 0 .. maxRows - 1 for the instance attribute. */
export function stripIndex(maxRows) {
  const attr = new Float32Array(N_VERTS * 4);
  const put = (v, kind, i, s, u) => { attr[v * 4] = kind; attr[v * 4 + 1] = i; attr[v * 4 + 2] = s; attr[v * 4 + 3] = u; };
  for (let k = 0; k < BODY_VERTS; k++) put(k, KIND.BODY, k >> 1, (k & 1) ? 1 : -1, 0);
  for (let e = 0; e < 2; e++) for (let u = 0; u < CAP_VERTS; u++) put(CAP_BASE + e * CAP_VERTS + u, KIND.CAP, e ? N_SAMPLES - 1 : 0, 0, u);
  for (let i = 1; i < N_SAMPLES - 1; i++) for (let u = 0; u < DISC_SEGS; u++) put(DISC_BASE + (i - 1) * DISC_SEGS + u, KIND.DISC, i, 0, u);
  for (let j = 0; j < N_QUADS; j++) for (let k = 0; k < 4; k++) put(TRAP_BASE + 4 * j + k, KIND.TRAP, j, (k & 1) ? 1 : -1, k >> 1);
  const tri = [];
  const quad = (a, b, c, d) => { tri.push(a, c, b, b, c, d); };    // a (u0, s-), b (u0, s+), c (u1, s-), d (u1, s+), counter-clockwise
  for (let q = 0; q < N_QUADS; q++) quad(2 * q, 2 * q + 1, 2 * q + 2, 2 * q + 3);
  for (let e = 0; e < 2; e++) {
    const c = CAP_BASE + e * CAP_VERTS;
    for (let m = 0; m <= CAP_SEGS; m++) { if (e === 0) tri.push(c, c + 1 + m, c + 2 + m); else tri.push(c, c + 2 + m, c + 1 + m); }
  }
  for (let i = 1; i < N_SAMPLES - 1; i++) {
    const b = DISC_BASE + (i - 1) * DISC_SEGS;
    for (let k = 1; k < DISC_SEGS - 1; k++) tri.push(b, b + k, b + k + 1);
  }
  for (let j = 0; j < N_QUADS; j++) quad(TRAP_BASE + 4 * j, TRAP_BASE + 4 * j + 1, TRAP_BASE + 4 * j + 2, TRAP_BASE + 4 * j + 3);
  const rows = new Float32Array(maxRows);
  for (let r = 0; r < maxRows; r++) rows[r] = r;
  return { attr, index: Uint16Array.from(tri), nVerts: N_VERTS, nIndex: tri.length, rows };
}

/** The points of a vessel as the flat array (x0, y0, x1, y1, ...) the functions below read (PT()'s order). */
export function flatPoints(P, out = new Float64Array(P.length * 2)) {
  for (let i = 0; i < P.length; i++) { out[2 * i] = P[i][0]; out[2 * i + 1] = P[i][1]; }
  return out;
}

/** pad = casing + |shadow offset| + glow reach + 2 px (px: one pixel in world units). */
export function padOf(casing, shadowOff, glowReach, px) {
  return casing + Math.hypot(shadowOff[0], shadowOff[1]) + glowReach + 2 * px;
}

const rwAt = (R, i, pad) => Math.max(R[i], MIN_RADIUS) + pad;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function dirRaw(P, j) { const dx = P[2 * j + 2] - P[2 * j], dy = P[2 * j + 3] - P[2 * j + 1]; return [dx, dy, Math.hypot(dx, dy)]; }
/** Segment j (samples j, j + 1): unit direction (a segment without one borrows the one before, else the one after, else +x), length, taper tilt, cosine of the tilt's angle. */
function segOf(P, R, j, pad) {
  let d = dirRaw(P, j);
  const L = d[2];
  if (!(L > SEG_EPS)) {
    d = j > 0 ? dirRaw(P, j - 1) : [0, 0, 0];
    if (!(d[2] > SEG_EPS) && j < N_QUADS - 1) d = dirRaw(P, j + 1);
    if (!(d[2] > SEG_EPS)) d = [1, 0, 1];
  }
  const tilt = L > SEG_EPS ? clamp((rwAt(R, j, pad) - rwAt(R, j + 1, pad)) / L, -TILT_MAX, TILT_MAX) : 0;
  return { tx: d[0] / d[2], ty: d[1] / d[2], L, tilt, c: Math.sqrt(1 - tilt * tilt) };
}
/** The normal of the tangent line of the segment's side s: tilted so that it touches both end discs of a tapering segment. */
const nrmX = (g, s) => s * g.c * -g.ty + g.tilt * g.tx;
const nrmY = (g, s) => s * g.c * g.tx + g.tilt * g.ty;

/** The mitre offset (in widths) at interior sample i, side s, or null when the joint is bevelled. */
function mitre(P, R, i, s, pad) { return mitreAB(segOf(P, R, i - 1, pad), segOf(P, R, i, pad), rwAt(R, i, pad), s); }
function mitreAB(a, b, rw, s) {
  const ax = nrmX(a, s), ay = nrmY(a, s), bx = nrmX(b, s), by = nrmY(b, s);
  const sx = ax + bx, sy = ay + by, m2 = sx * sx + sy * sy;
  if (m2 < 1e-12) return null;
  const inv = 1 / Math.sqrt(m2), dx = sx * inv, dy = sy * inv;
  const cosH = dx * ax + dy * ay;
  if (cosH < 1 / MITRE_LIMIT) return null;
  const mx = dx / cosH, my = dy / cosH;
  // the corner may sit along either segment no further than half-way to the neighbouring sample, so the quads never fold over each other
  if (Math.abs(rw * (mx * a.tx + my * a.ty)) > 0.5 * a.L || Math.abs(rw * (mx * b.tx + my * b.ty)) > 0.5 * b.L) return null;
  return [mx, my];
}
/** An end sample whose tangent points sit further along the segment than half its length (a taper steep for the sample spacing): its vertices pinch. */
function endPinched(P, R, i, pad) {
  const g = segOf(P, R, i === 0 ? 0 : N_QUADS - 1, pad);
  return Math.abs(rwAt(R, i, pad) * g.tilt) > 0.5 * g.L;
}
/** Whether sample i is a bevelled joint (interior: too tight for a mitre) or a pinched end. */
export function bevelled(P, R, i, pad) {
  if (i === 0 || i === N_SAMPLES - 1) return endPinched(P, R, i, pad);
  const a = segOf(P, R, i - 1, pad), b = segOf(P, R, i, pad), rw = rwAt(R, i, pad);
  return mitreAB(a, b, rw, 1) === null || mitreAB(a, b, rw, -1) === null;
}
/** Whether the hexagon at sample i is drawn: its own joint is bevelled, or a neighbour's is (a pinched quad leaves the wedge beside it bare). */
function discOn(P, R, i, pad) { return bevelled(P, R, i - 1, pad) || bevelled(P, R, i, pad) || bevelled(P, R, i + 1, pad); }

/** Strip vertex (sample i, side s = +1 left of the travel direction / -1 right) in world units. */
export function stripVertex(P, R, i, s, pad) {
  const rw = rwAt(R, i, pad), px = P[2 * i], py = P[2 * i + 1];
  if (i === 0 || i === N_SAMPLES - 1) {
    if (endPinched(P, R, i, pad)) return [px, py];
    const g = segOf(P, R, i === 0 ? 0 : N_QUADS - 1, pad);
    return [px + rw * nrmX(g, s), py + rw * nrmY(g, s)];
  }
  const mp = mitre(P, R, i, 1, pad), mm = mitre(P, R, i, -1, pad);
  if (mp === null || mm === null) return [px, py];   // bevelled: pinched, the extra triangles cover the joint
  const m = s > 0 ? mp : mm;
  return [px + rw * m[0], py + rw * m[1]];
}

/** Any vertex of the instance: v = (kind, i, s, u) as stripIndex writes it. */
export function meshVertex(P, R, kind, i, s, u, pad) {
  if (kind === KIND.BODY) return stripVertex(P, R, i, s, pad);
  const px = P[2 * i], py = P[2 * i + 1], rw = rwAt(R, i, pad);
  if (kind === KIND.CAP) {
    const first = i === 0, g = segOf(P, R, first ? 0 : N_QUADS - 1, pad);
    const ox = first ? -g.tx : g.tx, oy = first ? -g.ty : g.ty, nx = -g.ty, ny = g.tx;
    const skew = (first ? -1 : 1) * Math.asin(g.tilt);
    const step = (Math.PI - 2 * skew) / CAP_SEGS;
    if (u === 0) { const h = rw * Math.sin(skew); return [px + h * ox, py + h * oy]; }
    const m = u - 1;
    let th, rad = rw;
    if (m === 0) th = skew; else if (m === CAP_SEGS + 1) th = skew + CAP_SEGS * step; else { th = skew + (m - 0.5) * step; rad = rw / Math.cos(step / 2); }
    return [px + rad * (Math.cos(th) * nx + Math.sin(th) * ox), py + rad * (Math.cos(th) * ny + Math.sin(th) * oy)];
  }
  if (kind === KIND.DISC) {
    if (!discOn(P, R, i, pad)) return [px, py];
    const th = (2 * Math.PI * u) / DISC_SEGS;
    return [px + rw * DISC_R * Math.cos(th), py + rw * DISC_R * Math.sin(th)];
  }
  // TRAP: segment i, side s, end u: the tangent points of the segment's two end discs (only where a joint of the segment is bevelled)
  const qx = P[2 * (i + u)], qy = P[2 * (i + u) + 1];
  if (!(bevelled(P, R, i, pad) || bevelled(P, R, i + 1, pad))) return [qx, qy];
  const g = segOf(P, R, i, pad), r2 = rwAt(R, i + u, pad);
  return [qx + r2 * nrmX(g, s), qy + r2 * nrmY(g, s)];
}

// ---- Patches: one instanced quad over each join's blend zone --------------------------------------------------------------------

/** The patch quad's corners as a triangle strip: instance centre + corner * half-size. */
export const PATCH_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
/** Copy join entries (entries `list` of an entry array) into a flat run in writeJoin's layout, the input of patchInstances. */
export function joinEntriesOf(ent, list) {
  const out = new Float32Array(list.length * 8);
  for (let n = 0; n < list.length; n++) for (let k = 0; k < 8; k++) out[n * 8 + k] = ent[list[n] * 8 + k];
  return out;
}
/** A join entry's member value -> { row, mark (0: a branch, 0.25: the trunk the others end on, 0.375: the trunk at a fork) } or null for an empty slot. */
export function memberOf(v) {
  if (!(v > -0.5)) return null;
  const row = Math.floor(v + 0.5);   // (row + 0.25 or + 0.375 marks the trunk; the shader reads int(v + 0.5))
  return { row, mark: v - row };
}
/**
 * Patch instances from join entries (veins-bin writeJoin layout: 8 floats an entry: x, y, reach, blend width * 100 + fillet, then up to four
 * member rows). Each instance keeps the entry's eight floats, with the reach replaced by the patch's half-size: reach + pad. Entries
 * without a reach (an off join: reach <= 0) or without a member are left out, and so are repeats: binVeins writes a join's entry in every
 * cell it reaches, one patch is drawn for it. Returns { data (8 floats an instance), count }.
 */
export function patchInstances(joinEntries, pad) {
  const n = Math.floor(joinEntries.length / 8);
  const data = new Float32Array(n * 8);
  const seen = new Set(); // alloc-rare: geometry upload: once per binning, sized by the joins, never on a steady frame
  let count = 0;
  for (let e = 0; e < n; e++) {
    const q = e * 8;
    if (!(joinEntries[q + 2] > 0)) continue;
    const key = joinEntries.slice(q, q + 8).join(',');   // alloc-rare: same as above
    if (seen.has(key)) continue;
    seen.add(key);
    let any = false;
    for (let m = 0; m < 4; m++) if (joinEntries[q + 4 + m] > -0.5) any = true;
    if (!any) continue;
    const o = count * 8;
    data[o] = joinEntries[q]; data[o + 1] = joinEntries[q + 1];
    data[o + 2] = joinEntries[q + 2] + pad;
    data[o + 3] = joinEntries[q + 3];
    for (let m = 0; m < 4; m++) data[o + 4 + m] = joinEntries[q + 4 + m];
    count++;
  }
  return { data: data.subarray(0, count * 8), count };
}

// ---- The vertex shader's world position: the same maths, in GLSL ---------------------------------------------------------------

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/**
 * GLSL (no #version, no main): the vertex placement. The program supplies `ent`, `rad`, `posBase` as the vessel shader has them (PT() reads
 * two points a texel, N_SAMPLES / 2 texels a row, from posBase, as veins-gl does) and calls
 *     vec2 meshWorld(int id, vec4 a, float pad)      // a = the vertex attribute (kind, i, s, u), id = the vessel row, pad in world units
 * and does the camera and the layer's offset itself.
 */
export const STRIP_VS_GLSL = `
const int N_SAMPLES = ${N_SAMPLES};
const int N_QUADS = ${N_QUADS};
const float MITRE_LIMIT = ${f(MITRE_LIMIT)};
const int CAP_SEGS = ${CAP_SEGS};
const int DISC_SEGS = ${DISC_SEGS};
const float MIN_RADIUS = ${f(MIN_RADIUS)};
const float TILT_MAX = ${f(TILT_MAX)};
const float SEG_EPS = ${SEG_EPS.toExponential()};
const int K_BODY = ${KIND.BODY};
const int K_CAP = ${KIND.CAP};
const int K_DISC = ${KIND.DISC};
const int K_TRAP = ${KIND.TRAP};
const float M_PI = 3.14159265358979;
#define ENT_W ${ENT_W}
uniform sampler2D ent;                 // the entry texture (veins-gl): the frame's points from posBase
uniform sampler2D rad;                 // per vessel row (y), per sample (x): the radius in .r
uniform int posBase;
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }
float mRW(int id, int i, float pad) { return max(texelFetch(rad, ivec2(i, id), 0).r, MIN_RADIUS) + pad; }
vec3 mDir(int id, int j) { vec2 d = PT(id, j + 1) - PT(id, j); return vec3(d, length(d)); }
struct MSeg { vec2 t; float L; float tilt; float c; };
MSeg mSeg(int id, int j, float pad) {
  vec3 d = mDir(id, j);
  float L = d.z;
  if (!(L > SEG_EPS)) {
    d = vec3(0.0);
    if (j > 0) d = mDir(id, j - 1);
    if (!(d.z > SEG_EPS) && j < N_QUADS - 1) d = mDir(id, j + 1);
    if (!(d.z > SEG_EPS)) d = vec3(1.0, 0.0, 1.0);
  }
  float tilt = L > SEG_EPS ? clamp((mRW(id, j, pad) - mRW(id, j + 1, pad)) / L, -TILT_MAX, TILT_MAX) : 0.0;
  return MSeg(d.xy / d.z, L, tilt, sqrt(1.0 - tilt * tilt));
}
vec2 mNrm(MSeg g, float s) { return vec2(s * g.c * -g.t.y + g.tilt * g.t.x, s * g.c * g.t.x + g.tilt * g.t.y); }
bool mMitreAB(MSeg a, MSeg b, float rw, float s, out vec2 M) {
  vec2 na = mNrm(a, s), nb = mNrm(b, s), sm = na + nb;
  float m2 = dot(sm, sm);
  M = vec2(0.0);
  if (m2 < 1e-12) return false;
  vec2 dr = sm / sqrt(m2);
  float cosH = dot(dr, na);
  if (cosH < 1.0 / MITRE_LIMIT) return false;
  vec2 mv = dr / cosH;
  if (abs(rw * dot(mv, a.t)) > 0.5 * a.L || abs(rw * dot(mv, b.t)) > 0.5 * b.L) return false;
  M = mv;
  return true;
}
bool mEndPinched(int id, int i, float pad) {
  MSeg g = mSeg(id, i == 0 ? 0 : N_QUADS - 1, pad);
  return abs(mRW(id, i, pad) * g.tilt) > 0.5 * g.L;
}
bool mBevelled(int id, int i, float pad) {
  if (i == 0 || i == N_SAMPLES - 1) return mEndPinched(id, i, pad);
  MSeg a = mSeg(id, i - 1, pad), b = mSeg(id, i, pad);
  float rw = mRW(id, i, pad);
  vec2 m;
  return !mMitreAB(a, b, rw, 1.0, m) || !mMitreAB(a, b, rw, -1.0, m);
}
bool mDiscOn(int id, int i, float pad) { return mBevelled(id, i - 1, pad) || mBevelled(id, i, pad) || mBevelled(id, i + 1, pad); }
vec2 meshWorld(int id, vec4 a, float pad) {
  int kind = int(a.x + 0.5), i = int(a.y + 0.5), u = int(a.w + 0.5);
  float s = a.z;
  vec2 p = PT(id, i);
  float rw = mRW(id, i, pad);
  if (kind == K_BODY) {
    if (i == 0 || i == N_SAMPLES - 1) return mEndPinched(id, i, pad) ? p : p + rw * mNrm(mSeg(id, i == 0 ? 0 : N_QUADS - 1, pad), s);
    MSeg sa = mSeg(id, i - 1, pad), sb = mSeg(id, i, pad);
    vec2 mp, mm;
    if (!mMitreAB(sa, sb, rw, 1.0, mp) || !mMitreAB(sa, sb, rw, -1.0, mm)) return p;
    return p + rw * (s > 0.0 ? mp : mm);
  }
  if (kind == K_CAP) {
    bool first = i == 0;
    MSeg g = mSeg(id, first ? 0 : N_QUADS - 1, pad);
    vec2 o = first ? -g.t : g.t, n = vec2(-g.t.y, g.t.x);
    float skew = (first ? -1.0 : 1.0) * asin(g.tilt);
    float step = (M_PI - 2.0 * skew) / float(CAP_SEGS);
    if (u == 0) return p + rw * sin(skew) * o;
    int m = u - 1;
    float th, rd = rw;
    if (m == 0) th = skew;
    else if (m == CAP_SEGS + 1) th = skew + float(CAP_SEGS) * step;
    else { th = skew + (float(m) - 0.5) * step; rd = rw / cos(step * 0.5); }
    return p + rd * (cos(th) * n + sin(th) * o);
  }
  if (kind == K_DISC) {
    if (!mDiscOn(id, i, pad)) return p;
    float th = 2.0 * M_PI * float(u) / float(DISC_SEGS);
    return p + rw * (1.0 / cos(M_PI / float(DISC_SEGS))) * vec2(cos(th), sin(th));
  }
  // K_TRAP: segment i, side s, end u
  vec2 q = PT(id, i + u);
  if (!(mBevelled(id, i, pad) || mBevelled(id, i + 1, pad))) return q;
  return q + mRW(id, i + u, pad) * mNrm(mSeg(id, i, pad), s);
}
`;
