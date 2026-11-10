// The Tube vessel renderer's geometry (10 Nov 2026, docs/recommendations/tube-renderer-plan.md, brief A): pure JS plus GLSL strings, no GL calls here.
// One vessel row is ONE instance of a fixed mesh (tubeIndex): a half tube whose every vertex carries a level f in 0..1 (higher is nearer),
// which the vertex shader writes as depth, so the taller surface of a tier wins a pixel with no key prepass.
//   - Rings along, vertices across, one grid for every row: TUBE_CAP rings of cap, the N_SAMPLES body rings, TUBE_CAP rings of cap.
//   - Across a ring: skirt outer, skirt inner, TUBE_ARC arc vertices (a half circle of the lumen), skirt inner, skirt outer. The skirt is the
//     casing (the outline): it lies below the lumen and widens by `w` (casing * celK + selection pad + aaPad + padU).
//   - The caps are half spheres that carry on PAST the end point (pulling them inside the length gave pinched "sausage" joins).
//   - Where the Mesh would bevel a joint (too tight for a mitre) the ring takes the plain average of the two normals and a dome (a fan of
//     a centre and a hexagon) covers the outside of the turn; everywhere else the dome collapses to the sample's point (zero area).
//   - Per segment one quad on the segment's own normal (the Mesh's K_TRAP), collapsed unless either end of the segment is bevelled: it covers
//     what the average-normal rings and the domes leave bare beside a tight turn, whatever the segment's length.
// Stage 2 (brief S2-A): the geometry also carries what the short fragment shader needs, as varyings written for all three kinds of vertex:
//   vD    the signed distance from the lumen's wall, world units: -R on the centreline, 0 on the wall, + in the outline's skirt (grid: (|a| - 1) R
//         across the arc, +w on the skirt's outer column; a dome: dist - R along each spoke; a trap corner: +w; a cap: |vG| - R, the plan-view disc's),
//   vG    the offset from the centreline point to the vertex, world units ((0, 0) on the centreline),
//   vRad  the lumen's radius at that ring or sample (MIN_RADIUS floored, as the Mesh's mRW),
//   vEnd  flat, from the instance's attribute aRow = (row, endStart, endEnd, kind + 2): the vessel this row ends on at its start (x) and its end (y),
//         or (-1, -1). `kind + 2` is 2 for a plain row and 3 for an exact one; until the pass feeds a four-float buffer (S2-D) it feeds ONE float a
//         row, and WebGL then fills the other three with (0, 0, 1): w = 1 must read as "no ends", which `w > 1.5` gives.
// The skirt's width in a shape pass is exactly the outline's: clamp(0.14 R, 1.5 px, 3 px) + aaPad (+ selPad on a selected row), px = aaPad / 2, from the
// R of the vertex's own ring or sample (tubeWidth); a glow pass keeps the row's reach (tubeGlowWidth: casing * celK + selection + aaPad + padU).
// The compositor's zoom numbers (stage 3, thread C's lumen shader reads zoomA and zoomB): tubeStripVS(STRIP_VS_GLSL, F_SEL, ZOOM_VS) includes the host's ZOOM_VS
// text (veins-gl.js: uniform pxW, flat out zoomA / zoomB, zoomOut()) and calls zoomOut() in main; given none it writes none, and the text is what it was.
// tubeVertex is the JS twin of tubePlace (GLSL below): same arithmetic in the same order; the tests run the JS one. The mitre and bevel
// rules are the Mesh's own (STRIP_VS_GLSL: mSeg, mNrm, mMitreAB, mDiscOn), called with pad = w; segOf / nrmX / nrmY / mitreAB below are
// their JS twins (veins-mesh.js keeps its own private), pinned to veins-mesh.js's stripVertex by tests/tube-geo.test.js.
import { N_SAMPLES, N_QUADS, MITRE_LIMIT, MIN_RADIUS, TILT_MAX, SEG_EPS, bevelled } from './veins-mesh.js';
import { MP } from './veins-mesh-glsl.js';

export { N_SAMPLES };
export const TUBE_CAP = 6;                         // cap rings past each end
export const TUBE_ARC = 7;                         // arc vertices across the lumen
export const TUBE_ACROSS = 11;                     // vertices a ring: skirt outer, skirt inner, arc x TUBE_ARC, skirt inner, skirt outer
export const TUBE_RINGS = TUBE_CAP + N_SAMPLES + TUBE_CAP;   // 76
export const TUBE_HEX = 6;                         // the sides of a dome's rim (circumscribed)
export const TUBE_KIND = { GRID: 0, DOME: 1, TRAP: 2 };
// Vertex attribute aV = (kind, ring-or-sample, across index, corner):
//   GRID: (0, ring 0 .. TUBE_RINGS - 1, across 0 .. TUBE_ACROSS - 1, 0). Ring r: 0 .. TUBE_CAP - 1 the start cap (ring 0 is its tip),
//         TUBE_CAP + i the body sample i, TUBE_CAP + N_SAMPLES + c - 1 the end cap's ring c (c = TUBE_CAP is the tip).
//   DOME: (1, sample 1 .. N_SAMPLES - 2, 0 for the centre / 1 for a rim vertex, rim corner 0 .. TUBE_HEX - 1).
//   TRAP: (2, segment 0 .. N_QUADS - 1, side 0 (right of travel) / 1 (left), end 0 (the segment's first sample) / 1 (its second)); vertex 4 j + 2 end + side.
export const GRID_VERTS = TUBE_RINGS * TUBE_ACROSS;               // 836
export const DOME_VERTS = 1 + TUBE_HEX;                           // centre + hexagon
export const DOME_BASE = GRID_VERTS;                              // sample i (1 .. N_SAMPLES - 2) at DOME_BASE + (i - 1) * DOME_VERTS
export const TRAP_BASE = DOME_BASE + (N_SAMPLES - 2) * DOME_VERTS;   // segment j at TRAP_BASE + 4 * j
export const TUBE_VERTS = TRAP_BASE + 4 * N_QUADS;                // 1522
// (A glow's skirt slopes from GLOW0 at its outer edge up to GLOW_WALL at the lumen's wall, so where several lit vessels' skirts overlap the nearest
// wall's is the nearest surface: the strongest glow wins the pixel, as the Mesh's key makes it. The lumen, GLOW1, is nearer than any skirt.)
export const TUBE_LEVEL = { GLOW0: 0.02, GLOW_WALL: 0.07, GLOW1: 0.08, CASE0: 0.10, CASE1: 0.20, LUMEN0: 0.30, LUMEN_H: 0.50, PATCH: 0.95 };
const L = TUBE_LEVEL;
// A fading vessel's lumen sits BELOW every opaque vessel's lumen of its tier (and above its own casing), so where a faded branch overlaps its
// trunk beyond the join's patch the trunk's lumen wins the pixel and is not thinned by the fade (the classic shader's rule: "a fading vein must
// not thin the cava's lumen where it joins it"). FADE_A: the alpha at and under which the lumen is wholly in that low band; above it the levels
// ease back to their own, so a vessel fading along its length never steps in depth. The band lies above a join patch's outline (tube-pass.js
// PATCH_RING, (CASE1 + LUMEN0) / 2 = .25: it is drawn under every lumen, so also under a faded one) and below .30. Off where the scene is ordered by z (zK > 0, the lobule):
// there the row's z says what is in front, faded or not.
export const TUBE_FADE = { A: 0.35, L0: 0.26, H: 0.035 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** The static buffers, built once: per-vertex attributes (4 floats a vertex), the triangle index (CCW, as stripIndex's quads), and the row ids 0 .. maxRows - 1. */
export function tubeIndex(maxRows) {
  const attr = new Float32Array(TUBE_VERTS * 4);
  const put = (v, kind, a, b, c) => { attr[v * 4] = kind; attr[v * 4 + 1] = a; attr[v * 4 + 2] = b; attr[v * 4 + 3] = c; };
  for (let r = 0; r < TUBE_RINGS; r++) for (let a = 0; a < TUBE_ACROSS; a++) put(r * TUBE_ACROSS + a, TUBE_KIND.GRID, r, a, 0);
  for (let i = 1; i < N_SAMPLES - 1; i++) {
    const b = DOME_BASE + (i - 1) * DOME_VERTS;
    put(b, TUBE_KIND.DOME, i, 0, 0);
    for (let u = 0; u < TUBE_HEX; u++) put(b + 1 + u, TUBE_KIND.DOME, i, 1, u);
  }
  for (let j = 0; j < N_QUADS; j++) for (let k = 0; k < 4; k++) put(TRAP_BASE + 4 * j + k, TUBE_KIND.TRAP, j, k & 1, k >> 1);
  const tri = [];
  for (let r = 0; r < TUBE_RINGS - 1; r++) {
    for (let a = 0; a < TUBE_ACROSS - 1; a++) {
      const A = r * TUBE_ACROSS + a, B = A + 1, C = A + TUBE_ACROSS, D = C + 1;   // A (ring r, left), B (ring r, right), C (next ring, left), D
      tri.push(A, C, B, B, C, D);
    }
  }
  for (let i = 1; i < N_SAMPLES - 1; i++) {
    const b = DOME_BASE + (i - 1) * DOME_VERTS;
    for (let u = 0; u < TUBE_HEX; u++) tri.push(b, b + 1 + u, b + 1 + (u + 1) % TUBE_HEX);
  }
  for (let j = 0; j < N_QUADS; j++) {
    const A = TRAP_BASE + 4 * j, B = A + 1, C = A + 2, D = A + 3;   // A (end 0, right), B (end 0, left), C (end 1, right), D (end 1, left)
    tri.push(A, C, B, B, C, D);
  }
  if (TUBE_VERTS >= 65536) throw new Error('tube-geo: the vertex count does not fit a Uint16Array index');
  const rows = new Float32Array(maxRows);
  for (let r = 0; r < maxRows; r++) rows[r] = r;
  return { attr, index: Uint16Array.from(tri), nVerts: TUBE_VERTS, nIndex: tri.length, rows };
}

/** The body sample index the fragment shader gets as vI: 0 for the start cap's rings, N_SAMPLES - 1 for the end cap's, the sample for a body ring or a dome, the segment plus its end for a trap (corner = the end). */
export function tubeSampleOf(kind, ring, corner = 0) {
  if (kind === TUBE_KIND.TRAP) return ring + corner;
  return kind === TUBE_KIND.DOME ? ring : clamp(ring - TUBE_CAP, 0, N_SAMPLES - 1);
}

/** The outline's width in a shape pass, world units: clamp(0.14 R, 1.5 px, 3 px), px = aaPad / 2 (celShade's own rule). */
export function tubeOutline(R, aaPad) { const px = aaPad / 2; return clamp(0.14 * R, 1.5 * px, 3 * px); }
/** w in a shape pass: how far the skirt reaches past the lumen of radius R: the outline plus aaPad, plus selPad on a selected row. Per vertex, from that vertex's R. */
export function tubeWidth(R, aaPad, selPad, selected) {
  return tubeOutline(R, aaPad) + aaPad + (selected ? selPad : 0);
}
/** w in a glow pass (the row's, one for all its vertices): casing * celK + (selected ? selPad : 0) + aaPad + padU, the vertex shader's order. */
export function tubeGlowWidth(casing, celK, selPad, aaPad, padU, selected) {
  return casing * celK + (selected ? selPad : 0) + aaPad + padU;
}

// ---- JS twins of mSeg / mNrm / mMitreAB (STRIP_VS_GLSL), with pad = w ---------------------------------------------------------

const rwAt = (R, i, pad) => Math.max(R[i], MIN_RADIUS) + pad;
function dirRaw(P, j) { const dx = P[2 * j + 2] - P[2 * j], dy = P[2 * j + 3] - P[2 * j + 1]; return [dx, dy, Math.hypot(dx, dy)]; }
function segOf(P, R, j, pad) {
  let d = dirRaw(P, j);
  const len = d[2];
  if (!(len > SEG_EPS)) {
    d = j > 0 ? dirRaw(P, j - 1) : [0, 0, 0];
    if (!(d[2] > SEG_EPS) && j < N_QUADS - 1) d = dirRaw(P, j + 1);
    if (!(d[2] > SEG_EPS)) d = [1, 0, 1];
  }
  const tilt = len > SEG_EPS ? clamp((rwAt(R, j, pad) - rwAt(R, j + 1, pad)) / len, -TILT_MAX, TILT_MAX) : 0;
  return { tx: d[0] / d[2], ty: d[1] / d[2], L: len, tilt, c: Math.sqrt(1 - tilt * tilt) };
}
const nrmX = (g, s) => s * g.c * -g.ty + g.tilt * g.tx;
const nrmY = (g, s) => s * g.c * g.tx + g.tilt * g.ty;
function mitreAB(a, b, rw, s) {
  const ax = nrmX(a, s), ay = nrmY(a, s), bx = nrmX(b, s), by = nrmY(b, s);
  const sx = ax + bx, sy = ay + by, m2 = sx * sx + sy * sy;
  if (m2 < 1e-12) return null;
  const inv = 1 / Math.sqrt(m2), dx = sx * inv, dy = sy * inv;
  const cosH = dx * ax + dy * ay;
  if (cosH < 1 / MITRE_LIMIT) return null;
  const mx = dx / cosH, my = dy / cosH;
  if (Math.abs(rw * (mx * a.tx + my * a.ty)) > 0.5 * a.L || Math.abs(rw * (mx * b.tx + my * b.ty)) > 0.5 * b.L) return null;
  return [mx, my];
}

/** The across offset d (world units, positive toward the left of travel) and the level f of across column ac, for a ring whose half tube has radius rc. */
function acrossAt(ac, rc, w, hRef, glow, zz, hK) {
  if (ac === 0) return [-(rc + w), glow ? L.GLOW0 : L.CASE0];
  if (ac === 1) return [-rc, glow ? L.GLOW_WALL : L.CASE1];
  if (ac === TUBE_ACROSS - 2) return [rc, glow ? L.GLOW_WALL : L.CASE1];
  if (ac === TUBE_ACROSS - 1) return [rc + w, glow ? L.GLOW0 : L.CASE0];
  const th = ((ac - 2) / (TUBE_ARC - 1) - 0.5) * Math.PI, h = rc * Math.cos(th);
  return [rc * Math.sin(th), glow ? L.GLOW1 : L.LUMEN0 + L.LUMEN_H * clamp(zz + hK * clamp(h / hRef, 0, 1), 0, 1)];
}

const mixf = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/**
 * The row's alpha at a point, as vesAttrs reads it (its base alpha, then a dip, a radial fade or a linear one): the JS twin of tubeAlpha. fade:
 * { a: the row's texel 1's w, t3: texel 3, t4: texel 4 } (arrays of four). The veil (an organ's fade) is the fragment shader's alone.
 */
export function tubeAlpha(fade, x, y) {
  let a = fade.a;
  const [t3x, t3y, t3z, t3w] = fade.t3, [t4x, t4y, t4z, t4w] = fade.t4;
  const ddx = t3z - t3x, ddy = t3w - t3y;
  if (t4w > 2.5) {
    const v = clamp(((x - t3x) * ddx + (y - t3y) * ddy) / Math.max(ddx * ddx + ddy * ddy, 1e-6), 0, 1);
    a *= v < t4x ? mixf(t4y, t4z, smooth(0, t4x, v)) : mixf(t4z, 1, smooth(t4x, 1, v));
  } else if (t4w > 1.5) {
    const v = Math.hypot(x - t3x, y - t3y) / Math.max(t3z, 1e-3);
    a *= v < 0.45 ? mixf(t4y, t4z, v / 0.45) : mixf(t4z, 0, clamp((v - 0.45) / 0.55, 0, 1));
  } else if (t4w > 0.5) {
    const v = ((x - t3x) * ddx + (y - t3y) * ddy) / Math.max(ddx * ddx + ddy * ddy, 1e-6);
    a *= mixf(t4y, t4z, clamp((v - t4x) / Math.max(1 - t4x, 1e-4), 0, 1));
  }
  return a;
}
/** A level f at alpha a: a lumen level (f >= LUMEN0) eases into the low band as the vessel fades; casing and glow levels are left alone. The JS twin of tubeFadeLevel. */
export function tubeFadeLevel(f, a) {
  if (f < L.LUMEN0) return f;
  const k = (f - L.LUMEN0) / L.LUMEN_H, s = smooth(TUBE_FADE.A, 1, a);
  return mixf(TUBE_FADE.L0 + TUBE_FADE.H * k, f, s);
}
/**
 * Any vertex of the instance, the JS twin of tubePlace: returns [x, y, f]. P: the vertex's points flat (x0, y0, x1, y1 ... as veins-mesh flatPoints), R: its radii, a: the attribute
 * (kind, ring-or-sample, across, corner), o: { w: the skirt's width, fixed (a glow pass's, see tubeGlowWidth; or any, when `aaPad` is not given),
 * aaPad, selPad, sel: a shape pass's skirt, per vertex from its own R (see tubeWidth; a glow pass ignores them), hRef (world), glow (true in a glow pass),
 * z, zK, hK (the row's z and the lumen level's weights: LUMEN0 + LUMEN_H * clamp(zK * z + hK * clamp(h / hRef, 0, 1), 0, 1); defaults 0, 0, 1),
 * fade (optional, see tubeAlpha: the row's fade, for the depth of a fading vessel) }.
 */
export function tubeVertex(P, R, a, o) {
  const q = place(P, R, a, o);
  return o.fade && !o.glow && !(o.zK > 0) ? [q[0], q[1], tubeFadeLevel(q[2], tubeAlpha(o.fade, q[0], q[1]))] : [q[0], q[1], q[2]];
}
/** What the vertex shader writes besides the position: { vI, vD, vG: [x, y], vRad } for the same vertex (see the header), the JS twin of tubePlace's varyings. */
export function tubeVarying(P, R, a, o) {
  const q = place(P, R, a, o);
  return { vI: tubeSampleOf(Math.round(a[0]), Math.round(a[1]), Math.round(a[3])), vD: q[3], vG: [q[4], q[5]], vRad: q[6] };
}
/** The skirt's width at a vertex whose ring or sample has the lumen radius rw. */
function widthAt(o, rw) { return o.glow || o.aaPad === undefined ? o.w : tubeWidth(rw, o.aaPad, o.selPad ?? 0, !!o.sel); }
/** [x, y, f, vD, gx, gy, rad] */
function place(P, R, a, o) {
  const kind = Math.round(a[0]), r = Math.round(a[1]), ac = Math.round(a[2]), cn = Math.round(a[3]);
  const hRef = o.hRef, glow = !!o.glow, hK = o.hK ?? 1, zz = (o.zK ?? 0) * (o.z ?? 0);
  if (kind === TUBE_KIND.TRAP) {
    // segment r, side ac (1: left of travel), end cn: the segment's own normal at +-(rw + w), only where either end of it is bevelled. (The two ends may
    // have different widths: the quad is decided as a whole, by the larger, and each corner reaches its own ring's.)
    const e = r + cn, wa = widthAt(o, rwAt(R, r, 0)), wb = widthAt(o, rwAt(R, r + 1, 0)), wd = Math.max(wa, wb), we = cn === 0 ? wa : wb, rwe = rwAt(R, e, 0);
    const lv = glow ? L.GLOW0 : L.CASE0, qx = P[2 * e], qy = P[2 * e + 1];
    if (!(bevelled(P, R, r, wd) || bevelled(P, R, r + 1, wd))) return [qx, qy, lv, -rwe, 0, 0, rwe];
    const g = segOf(P, R, r, wd), s = ac === 1 ? 1 : -1, r2 = rwAt(R, e, we), ox = r2 * nrmX(g, s), oy = r2 * nrmY(g, s);
    return [qx + ox, qy + oy, lv, we, ox, oy, rwe];
  }
  if (kind === TUBE_KIND.DOME) {
    const px = P[2 * r], py = P[2 * r + 1], rw = rwAt(R, r, 0), w = widthAt(o, rw);
    if (ac === 0) return [px, py, glow ? L.GLOW1 : L.LUMEN0 + L.LUMEN_H * clamp(zz + hK * clamp(rw / hRef, 0, 1), 0, 1), -rw, 0, 0, rw];
    const lv = glow ? L.GLOW0 : L.CASE0;
    if (!(bevelled(P, R, r - 1, w) || bevelled(P, R, r, w) || bevelled(P, R, r + 1, w))) return [px, py, lv, -rw, 0, 0, rw];
    const th = (2 * Math.PI * cn) / TUBE_HEX, rr = (rw + w) / Math.cos(Math.PI / TUBE_HEX), ox = rr * Math.cos(th), oy = rr * Math.sin(th);
    return [px + ox, py + oy, lv, rr - rw, ox, oy, rw];
  }
  let c = 0, i;
  if (r < TUBE_CAP) { c = TUBE_CAP - r; i = 0; }
  else if (r >= TUBE_CAP + N_SAMPLES) { c = r - (TUBE_CAP + N_SAMPLES) + 1; i = N_SAMPLES - 1; }
  else i = r - TUBE_CAP;
  const px = P[2 * i], py = P[2 * i + 1], rw = rwAt(R, i, 0), w = widthAt(o, rw);
  if (c > 0) {
    const ph = c / TUBE_CAP * Math.PI / 2, g = segOf(P, R, i === 0 ? 0 : N_QUADS - 1, w);
    const nx = nrmX(g, 1), ny = nrmY(g, 1), ox = i === 0 ? -g.tx : g.tx, oy = i === 0 ? -g.ty : g.ty;
    const rc = rw * Math.cos(ph), e = rw * Math.sin(ph);
    const [d, f] = acrossAt(ac, rc, w, hRef, glow, zz, hK);
    const gx = ox * e + d * nx, gy = oy * e + d * ny;
    return [px + gx, py + gy, f, Math.hypot(gx, gy) - rw, gx, gy, rw];
  }
  const [d, f] = acrossAt(ac, rw, w, hRef, glow, zz, hK);
  let nx, ny;
  if (i === 0 || i === N_SAMPLES - 1) {
    const g = segOf(P, R, i === 0 ? 0 : N_QUADS - 1, w);
    nx = nrmX(g, 1); ny = nrmY(g, 1);
  } else {
    const sa = segOf(P, R, i - 1, w), sb = segOf(P, R, i, w), W = rwAt(R, i, w);
    const mp = mitreAB(sa, sb, W, 1), mm = mp ? mitreAB(sa, sb, W, -1) : null;
    if (mp && mm) { nx = mp[0]; ny = mp[1]; }
    else {
      const ax = nrmX(sa, 1), ay = nrmY(sa, 1), vx = 0.5 * (ax + nrmX(sb, 1)), vy = 0.5 * (ay + nrmY(sb, 1)), al = Math.hypot(vx, vy);
      if (al < 1e-6) { nx = ax; ny = ay; } else { nx = vx / al; ny = vy / al; }
    }
  }
  return [px + d * nx, py + d * ny, f, Math.abs(d) - rw, d * nx, d * ny, rw];
}

// ---- The vertex shader: the same placement in GLSL ----------------------------------------------------------------------------

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/**
 * The vertex shader of the Tube's strips. STRIP_VS_GLSL: veins-mesh.js's (PT, mRW, mSeg, mNrm, mMitreAB, mDiscOn). Interface as meshStripVS
 * (attributes 0 aV, 1 aRow; uniforms world, size, lOff, tube, mPass, padU, selPad; outputs vI, vRow) plus tubeBase, tubeH (the pass pair's band
 * of depth), hRef (world), celK (the outline's width as a multiple of the row's casing width), aaPad (world: 2 device pixels).
 */
export const tubeStripVS = (STRIP_VS_GLSL, F_SEL = 1, ZOOM_VS = '') => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
invariant gl_Position;                 // (so the depth prepass and the colour pass agree exactly)
layout(location=0) in vec4 aV;         // (kind, ring or sample, across, corner): tube-geo.js tubeIndex
layout(location=1) in vec4 aRow;       // per instance: (row, endStart, endEnd, kind + 2). A one-float buffer reads (row, 0, 0, 1): w = 1 is "no ends"
uniform mat3 world;                    // world → device pixels
uniform vec2 size;
uniform vec2 lOff;
uniform highp sampler2D tube;
uniform int mPass;
uniform float padU;                    // world units past the casing the pass can draw (a glow pass: the glow's reach)
uniform float selPad;                  // and more for a selected vessel
uniform float tubeBase;                // this pass pair's band of depth: tubeBase + [0, 1) * tubeH
uniform float tubeH;
uniform float hRef;                    // the height (world) that is the top of the lumen's levels
uniform float celK;                    // a glow's reach, as a multiple of the row's casing width
uniform float aaPad;                   // two device pixels, world; a shape's skirt is the outline plus this
uniform float zK;                      // the lumen level's weight on the row's z (0: the anatomy; 1: the lobule, ordered by z)
uniform float hK;                      // and on the height (1: the anatomy; 0.008 in the lobule)
${STRIP_VS_GLSL}
const int T_CAP = ${TUBE_CAP};
const int T_ARC = ${TUBE_ARC};
const int T_ACROSS = ${TUBE_ACROSS};
const int T_HEX = ${TUBE_HEX};
const int T_DOME = ${TUBE_KIND.DOME};
const int T_TRAP = ${TUBE_KIND.TRAP};
const float L_GLOW0 = ${f(L.GLOW0)};
const float L_GLOW_WALL = ${f(L.GLOW_WALL)};
const float L_GLOW1 = ${f(L.GLOW1)};
const float L_CASE0 = ${f(L.CASE0)};
const float L_CASE1 = ${f(L.CASE1)};
const float L_LUMEN0 = ${f(L.LUMEN0)};
const float L_LUMEN_H = ${f(L.LUMEN_H)};
const float L_PATCH = ${f(L.PATCH)};
const float L_FADE_A = ${f(TUBE_FADE.A)};
const float L_FADE0 = ${f(TUBE_FADE.L0)};
const float L_FADE_H = ${f(TUBE_FADE.H)};
${ZOOM_VS ? `${ZOOM_VS}\n` : ''}out float vI;
flat out int vRow;
out float vD;                          // signed distance from the lumen's wall (negative inside, 0 on the wall, positive in the skirt), world units
out vec2 vG;                           // the offset from the centreline point to this point (not unit)
out float vRad;                        // the lumen's radius at this ring or sample
flat out vec2 vEnd;                    // the vessel this row ends on at its start (x) and end (y): row * 64 + the sample there, or -1
// The across offset d and the level f of across column ac, for a ring whose half tube has radius rc.
vec2 tubeAcross(int ac, float rc, float w, float hr, bool glow, float zz) {
  if (ac == 0) return vec2(-(rc + w), glow ? L_GLOW0 : L_CASE0);
  if (ac == 1) return vec2(-rc, glow ? L_GLOW_WALL : L_CASE1);
  if (ac == T_ACROSS - 2) return vec2(rc, glow ? L_GLOW_WALL : L_CASE1);
  if (ac == T_ACROSS - 1) return vec2(rc + w, glow ? L_GLOW0 : L_CASE0);
  float th = (float(ac - 2) / float(T_ARC - 1) - 0.5) * M_PI;
  float h = rc * cos(th);
  return vec2(rc * sin(th), glow ? L_GLOW1 : L_LUMEN0 + L_LUMEN_H * clamp(zz + hK * clamp(h / hr, 0.0, 1.0), 0.0, 1.0));
}
// The skirt's width at a vertex of a ring or sample with lumen radius rw: a shape pass's is the outline (celShade's rule) plus aaPad, plus the selection's;
// a glow pass's is the row's (wr).
float tubeW(int id, int i, bool glow, float wr, float sp) {
  if (glow) return wr;
  float px = 0.5 * aaPad;
  return clamp(0.14 * mRW(id, i, 0.0), 1.5 * px, 3.0 * px) + aaPad + sp;
}
// Any vertex of the instance: (x, y) in world units, z the level; also writes vD, vG and vRad.
vec3 tubePlace(int id, vec4 a, float wr, float sp, float hr, bool glow, float zz) {
  int kind = int(a.x + 0.5), r = int(a.y + 0.5), ac = int(a.z + 0.5), cn = int(a.w + 0.5);
  if (kind == T_TRAP) {
    int e = r + cn;
    float wa = tubeW(id, r, glow, wr, sp), wb = tubeW(id, r + 1, glow, wr, sp), wd = max(wa, wb), we = cn == 0 ? wa : wb;
    float rwe = mRW(id, e, 0.0);
    vec2 q = PT(id, e);
    float lv = glow ? L_GLOW0 : L_CASE0;
    vRad = rwe;
    if (!(mBevelled(id, r, wd) || mBevelled(id, r + 1, wd))) { vG = vec2(0.0); vD = -rwe; return vec3(q, lv); }
    vec2 o = mRW(id, e, we) * mNrm(mSeg(id, r, wd), ac == 1 ? 1.0 : -1.0);
    vG = o; vD = we;
    return vec3(q + o, lv);
  }
  if (kind == T_DOME) {
    vec2 p = PT(id, r);
    float rw = mRW(id, r, 0.0), w = tubeW(id, r, glow, wr, sp);
    vRad = rw;
    if (ac == 0) { vG = vec2(0.0); vD = -rw; return vec3(p, glow ? L_GLOW1 : L_LUMEN0 + L_LUMEN_H * clamp(zz + hK * clamp(rw / hr, 0.0, 1.0), 0.0, 1.0)); }
    float lv = glow ? L_GLOW0 : L_CASE0;
    if (!mDiscOn(id, r, w)) { vG = vec2(0.0); vD = -rw; return vec3(p, lv); }
    float th = 2.0 * M_PI * float(cn) / float(T_HEX);
    float rr = (rw + w) / cos(M_PI / float(T_HEX));
    vec2 o = rr * vec2(cos(th), sin(th));
    vG = o; vD = rr - rw;
    return vec3(p + o, lv);
  }
  int c = 0, i;
  if (r < T_CAP) { c = T_CAP - r; i = 0; }
  else if (r >= T_CAP + N_SAMPLES) { c = r - (T_CAP + N_SAMPLES) + 1; i = N_SAMPLES - 1; }
  else i = r - T_CAP;
  vec2 p = PT(id, i);
  float rw = mRW(id, i, 0.0), w = tubeW(id, i, glow, wr, sp);
  vRad = rw;
  if (c > 0) {
    float ph = float(c) / float(T_CAP) * M_PI / 2.0;
    MSeg g = mSeg(id, i == 0 ? 0 : N_QUADS - 1, w);
    vec2 n = mNrm(g, 1.0), o = i == 0 ? -g.t : g.t;
    float rc = rw * cos(ph), e = rw * sin(ph);
    vec2 df = tubeAcross(ac, rc, w, hr, glow, zz);
    vec2 og = o * e + df.x * n;
    vG = og; vD = length(og) - rw;
    return vec3(p + og, df.y);
  }
  vec2 df = tubeAcross(ac, rw, w, hr, glow, zz);
  vec2 n;
  if (i == 0 || i == N_SAMPLES - 1) n = mNrm(mSeg(id, i == 0 ? 0 : N_QUADS - 1, w), 1.0);
  else {
    MSeg sa = mSeg(id, i - 1, w), sb = mSeg(id, i, w);
    float W = mRW(id, i, w);
    vec2 mp, mm;
    if (mMitreAB(sa, sb, W, 1.0, mp) && mMitreAB(sa, sb, W, -1.0, mm)) n = mp;
    else {
      vec2 na = mNrm(sa, 1.0), av = 0.5 * (na + mNrm(sb, 1.0));
      float al = length(av);
      n = al < 1e-6 ? na : av / al;
    }
  }
  vG = df.x * n; vD = abs(df.x) - rw;
  return vec3(p + vG, df.y);
}
// The row's alpha at p, as vesAttrs reads it (its base alpha, then a dip, a radial fade or a linear one; the veil is the fragment shader's).
float tubeAlpha(int id, vec2 p) {
  vec4 t1 = texelFetch(tube, ivec2(1, id), 0), t3 = texelFetch(tube, ivec2(3, id), 0), t4 = texelFetch(tube, ivec2(4, id), 0);
  float a = t1.w;
  vec2 dd = t3.zw - t3.xy;
  if (t4.w > 2.5) {
    float v = clamp(dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
    a *= v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));
  } else if (t4.w > 1.5) {
    float v = length(p - t3.xy) / max(t3.z, 1e-3);
    a *= v < 0.45 ? mix(t4.y, t4.z, v / 0.45) : mix(t4.z, 0.0, clamp((v - 0.45) / 0.55, 0.0, 1.0));
  } else if (t4.w > 0.5) {
    float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
    a *= mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
  }
  return a;
}
// A lumen level eases into the low band as the vessel fades (see TUBE_FADE); casing and glow levels stay.
float tubeFadeLevel(float f, float a) {
  if (f < L_LUMEN0) return f;
  float k = (f - L_LUMEN0) / L_LUMEN_H, s = smoothstep(L_FADE_A, 1.0, a);
  return mix(L_FADE0 + L_FADE_H * k, f, s);
}
void main() {
  int id = int(aRow.x + 0.5);
  vRow = id;${ZOOM_VS ? '\n  zoomOut();' : ''}
  vEnd = aRow.w > 1.5 ? aRow.yz : vec2(-1.0);
  int kind = int(aV.x + 0.5), ring = int(aV.y + 0.5);
  vI = kind == T_TRAP ? aV.y + aV.w : kind == T_DOME ? float(ring) : float(clamp(ring - T_CAP, 0, N_SAMPLES - 1));
  bool glow = mPass <= ${MP.UP};
  bool lit = texelFetch(tube, ivec2(10, id), 0).a > 0.0, up = texelFetch(tube, ivec2(11, id), 0).w > 5.0;
  if (glow && (!lit || up != (mPass >= ${MP.UP_K}))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  bool sel = (int(texelFetch(tube, ivec2(2, id), 0).z + 0.5) & ${F_SEL}) != 0;
  float sp = sel ? selPad : 0.0;
  float wr = texelFetch(tube, ivec2(0, id), 0).w * celK + sp + aaPad + padU;
  vec3 q = tubePlace(id, aV, wr, sp, hRef, glow, zK * texelFetch(tube, ivec2(2, id), 0).y);
  if (!glow && !(zK > 0.0)) q.z = tubeFadeLevel(q.z, tubeAlpha(id, q.xy));
  vec3 d = world * vec3(q.xy, 1.0);
  d.xy += lOff;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0, 1.0);
}`;
