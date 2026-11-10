import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUBE_CAP, TUBE_ARC, TUBE_ACROSS, TUBE_RINGS, TUBE_HEX, TUBE_KIND, GRID_VERTS, DOME_VERTS, DOME_BASE, TRAP_BASE, TUBE_VERTS, TUBE_LEVEL,
  tubeIndex, tubeVertex, tubeSampleOf, tubeWidth, tubeStripVS, TUBE_FADE, tubeAlpha, tubeFadeLevel,
} from '../src/ui/tube-geo.js';
import { N_SAMPLES, N_QUADS, MIN_RADIUS, STRIP_VS_GLSL, stripVertex, bevelled } from '../src/ui/veins-mesh.js';
import { MP } from '../src/ui/veins-mesh-glsl.js';
import { lintGLSL, uniformsOf } from './glsl-lint.js';

// The Tube vessel renderer's geometry (docs/recommendations/tube-renderer-plan.md, brief A). Node only: the vertex shader's placement is
// judged on its JS twin (tubeVertex), and the shader text on the GLSL lint and on what the module exports.

const L = TUBE_LEVEL;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const M = tubeIndex(8);
const area2 = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** A polyline of N_SAMPLES points spaced `step`, heading +x, turned by `turn` degrees at sample `at` (a single joint), radius rw all along. */
function bent(step, rw, turn, at = 32) {
  const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES).fill(rw);
  let x = 0, y = 0, h = 0;
  for (let i = 0; i < N_SAMPLES; i++) { P[2 * i] = x; P[2 * i + 1] = y; if (i === at) h = (turn * Math.PI) / 180; x += Math.cos(h) * step; y += Math.sin(h) * step; }
  return { P, R };
}
const OPT = (w, hRef, glow = false) => ({ w, hRef, glow });
/** Every vertex of the instance: Float64Array (x, y, f) a vertex. */
function place(P, R, o) {
  const V = new Float64Array(TUBE_VERTS * 3);
  for (let v = 0; v < TUBE_VERTS; v++) { const q = tubeVertex(P, R, M.attr.subarray(v * 4, v * 4 + 4), o); V[3 * v] = q[0]; V[3 * v + 1] = q[1]; V[3 * v + 2] = q[2]; }
  return V;
}
function triangles(V) {
  const T = [];
  for (let t = 0; t < M.index.length; t += 3) {
    const a = M.index[t], b = M.index[t + 1], c = M.index[t + 2];
    const ax = V[3 * a], ay = V[3 * a + 1], bx = V[3 * b], by = V[3 * b + 1], cx = V[3 * c], cy = V[3 * c + 1];
    T.push({ a2: area2(ax, ay, bx, by, cx, cy), ax, ay, bx, by, cx, cy, x0: Math.min(ax, bx, cx), x1: Math.max(ax, bx, cx), y0: Math.min(ay, by, cy), y1: Math.max(ay, by, cy) });
  }
  return T;
}
function covered(T, x, y, eps) {
  for (const t of T) {
    if (t.a2 === 0 || x < t.x0 - eps || x > t.x1 + eps || y < t.y0 - eps || y > t.y1 + eps) continue;
    const s = t.a2 > 0 ? 1 : -1;
    const e1 = s * area2(t.ax, t.ay, t.bx, t.by, x, y) / (Math.hypot(t.bx - t.ax, t.by - t.ay) || 1e-300);
    const e2 = s * area2(t.bx, t.by, t.cx, t.cy, x, y) / (Math.hypot(t.cx - t.bx, t.cy - t.by) || 1e-300);
    const e3 = s * area2(t.cx, t.cy, t.ax, t.ay, x, y) / (Math.hypot(t.ax - t.cx, t.ay - t.cy) || 1e-300);
    if (e1 >= -eps && e2 >= -eps && e3 >= -eps) return true;
  }
  return false;
}
function segDist(P, j, x, y) {
  const ax = P[2 * j], ay = P[2 * j + 1], bx = P[2 * j + 2], by = P[2 * j + 3], dx = bx - ax, dy = by - ay;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-300)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
const v = (r, a) => r * TUBE_ACROSS + a;   // a grid vertex

test('tubeIndex: counts, indices in range, no degenerate triple, the row ids, the attribute encoding', () => {
  assert.equal(TUBE_CAP, 6); assert.equal(TUBE_ARC, 7); assert.equal(TUBE_ACROSS, 11); assert.equal(TUBE_RINGS, 76); assert.equal(TUBE_HEX, 6);
  assert.equal(TUBE_RINGS, TUBE_CAP + N_SAMPLES + TUBE_CAP);
  assert.equal(GRID_VERTS, 836); assert.equal(DOME_VERTS, 7); assert.equal(DOME_BASE, 836); assert.equal(TRAP_BASE, 836 + 62 * 7); assert.equal(TUBE_VERTS, 1270 + 63 * 4); assert.equal(TUBE_VERTS, 1522);
  assert.equal(M.nVerts, TUBE_VERTS); assert.equal(M.attr.length, TUBE_VERTS * 4);
  assert.equal(M.nIndex, 75 * 10 * 6 + 62 * 6 * 3 + 63 * 6); assert.equal(M.nIndex, 5994);
  assert.ok(M.index instanceof Uint16Array); assert.equal(M.index.length, M.nIndex); assert.equal(M.nIndex % 3, 0);
  assert.ok(TUBE_VERTS < 65536);
  for (const i of M.index) assert.ok(i < TUBE_VERTS);
  for (let t = 0; t < M.index.length; t += 3) {
    const [a, b, c] = [M.index[t], M.index[t + 1], M.index[t + 2]];
    assert.ok(a !== b && b !== c && a !== c, `degenerate triple at ${t}`);
  }
  // every vertex is used
  const used = new Uint8Array(TUBE_VERTS);
  for (const i of M.index) used[i] = 1;
  assert.equal(used.reduce((s, x) => s + x, 0), TUBE_VERTS);
  assert.equal(M.rows.length, 8); assert.equal(M.rows[7], 7); assert.equal(tubeIndex(300).rows[299], 299);
  // the encoding: a grid vertex is (0, ring, across, 0); a dome is (1, sample, 0 centre / 1 rim, corner)
  for (let r = 0; r < TUBE_RINGS; r++) for (let a = 0; a < TUBE_ACROSS; a++) assert.deepEqual(Array.from(M.attr.subarray(4 * v(r, a), 4 * v(r, a) + 4)), [TUBE_KIND.GRID, r, a, 0]);
  for (let i = 1; i < N_SAMPLES - 1; i++) {
    const b = DOME_BASE + (i - 1) * DOME_VERTS;
    assert.deepEqual(Array.from(M.attr.subarray(4 * b, 4 * b + 4)), [TUBE_KIND.DOME, i, 0, 0]);
    for (let u = 0; u < TUBE_HEX; u++) assert.deepEqual(Array.from(M.attr.subarray(4 * (b + 1 + u), 4 * (b + 1 + u) + 4)), [TUBE_KIND.DOME, i, 1, u]);
  }
  for (let j = 0; j < N_QUADS; j++) for (let k = 0; k < 4; k++) {
    const q = TRAP_BASE + 4 * j + k;
    assert.deepEqual(Array.from(M.attr.subarray(4 * q, 4 * q + 4)), [TUBE_KIND.TRAP, j, k & 1, k >> 1]);
  }
  // the row ids: the same ring of every row, one fixed grid
  assert.equal(tubeIndex(1).nIndex, M.nIndex);
});

test('vI: the body sample for a body ring, 0 for the start cap, N_SAMPLES - 1 for the end cap, the sample for a dome', () => {
  for (let r = 0; r < TUBE_CAP; r++) assert.equal(tubeSampleOf(TUBE_KIND.GRID, r), 0);
  for (let i = 0; i < N_SAMPLES; i++) assert.equal(tubeSampleOf(TUBE_KIND.GRID, TUBE_CAP + i), i);
  for (let r = TUBE_CAP + N_SAMPLES; r < TUBE_RINGS; r++) assert.equal(tubeSampleOf(TUBE_KIND.GRID, r), N_SAMPLES - 1);
  for (let i = 1; i < N_SAMPLES - 1; i++) assert.equal(tubeSampleOf(TUBE_KIND.DOME, i), i);
  for (let j = 0; j < N_QUADS; j++) { assert.equal(tubeSampleOf(TUBE_KIND.TRAP, j, 0), j); assert.equal(tubeSampleOf(TUBE_KIND.TRAP, j, 1), j + 1); }
});

test('the triangles are counter-clockwise as stripIndex\'s quads: a straight vessel has no clockwise triangle', () => {
  const { P, R } = bent(5, 3, 0);
  const T = triangles(place(P, R, OPT(1.58, 3)));
  for (const t of T) assert.ok(t.a2 >= -1e-9, `clockwise: ${t.a2}`);
  assert.ok(T.some((t) => t.a2 > 1));
});

test('a straight vessel: the arc is a half circle, the level rises to the centre, the skirt steps down and reaches w past the lumen', () => {
  const rw = 3, w = 1.58, hRef = 3.5;
  const { P, R } = bent(5, rw, 0);
  const V = place(P, R, OPT(w, hRef));
  for (let i = 0; i < N_SAMPLES; i++) {
    const r = TUBE_CAP + i, px = P[2 * i], py = P[2 * i + 1];
    let prev = -1;
    for (let k = 0; k < TUBE_ARC; k++) {
      const q = v(r, 2 + k), d = V[3 * q + 1] - py, f = V[3 * q + 2], h = ((f - L.LUMEN0) / L.LUMEN_H) * hRef;
      assert.ok(Math.abs(V[3 * q] - px) < 1e-9, 'a straight ring is across the travel direction');
      assert.ok(Math.abs(d * d + h * h - rw * rw) < 1e-9, `arc vertex ${k} off the half circle: d ${d}, h ${h}`);
      assert.ok(Math.abs(d - rw * Math.sin(((k / 6) - 0.5) * Math.PI)) < 1e-9);
      if (k <= 3) assert.ok(f >= prev - 1e-12, 'the level rises toward the centre'); else assert.ok(f <= prev + 1e-12, 'and falls past it');
      prev = f;
    }
    assert.ok(Math.abs(V[3 * v(r, 2 + 3) + 2] - (L.LUMEN0 + L.LUMEN_H * (rw / hRef))) < 1e-12, 'the centre is at the full height');
    assert.ok(Math.abs(V[3 * v(r, 2) + 2] - L.LUMEN0) < 1e-12 && Math.abs(V[3 * v(r, 8) + 2] - L.LUMEN0) < 1e-12, 'the lumen edge is at LUMEN0');
    // skirt: outer, inner on the left; inner, outer on the right
    const col = (a) => [V[3 * v(r, a) + 1] - py, V[3 * v(r, a) + 2]];
    assert.deepEqual(col(0).map((x, n) => (n ? x : +x.toFixed(9))), [-(rw + w), L.CASE0]);
    assert.deepEqual(col(1).map((x, n) => (n ? x : +x.toFixed(9))), [-rw, L.CASE1]);
    assert.deepEqual(col(9).map((x, n) => (n ? x : +x.toFixed(9))), [rw, L.CASE1]);
    assert.deepEqual(col(10).map((x, n) => (n ? x : +x.toFixed(9))), [rw + w, L.CASE0]);
  }
  // the height is clamped at hRef: a lumen taller than the reference reaches the top level and no more
  const V2 = place(P, R, OPT(w, 1));
  assert.ok(Math.abs(V2[3 * v(TUBE_CAP + 10, 5) + 2] - (L.LUMEN0 + L.LUMEN_H)) < 1e-12);
});

test('the caps carry on past the end point: the last ring is rw past it with a skirt of w, no cap ring is taller than the body', () => {
  const rw = 3, w = 1.58, hRef = 3;
  const { P, R } = bent(5, rw, 0);
  const V = place(P, R, OPT(w, hRef));
  const ex = P[2 * (N_SAMPLES - 1)], sx = P[0];
  const bodyTop = V[3 * v(TUBE_CAP + 10, 5) + 2];
  for (let c = 1; c <= TUBE_CAP; c++) {
    const end = TUBE_CAP + N_SAMPLES + c - 1, start = TUBE_CAP - c, ph = (c / TUBE_CAP) * Math.PI / 2, rc = rw * Math.cos(ph);
    for (const [r, x0, sgn] of [[end, ex, 1], [start, sx, -1]]) {
      for (let a = 0; a < TUBE_ACROSS; a++) assert.ok(Math.abs(V[3 * v(r, a)] - (x0 + sgn * rw * Math.sin(ph))) < 1e-9, `cap ring ${r} sits at the sphere's slice`);
      for (let k = 0; k < TUBE_ARC; k++) {
        const q = v(r, 2 + k), d = V[3 * q + 1], h = ((V[3 * q + 2] - L.LUMEN0) / L.LUMEN_H) * hRef;
        assert.ok(Math.abs(d * d + h * h - rc * rc) < 1e-9, 'the cap ring is a half circle of radius rc');
        assert.ok(V[3 * q + 2] <= bodyTop + 1e-12, 'never taller than the body');
      }
      assert.ok(Math.abs(V[3 * v(r, 10) + 1] - (rc + w)) < 1e-9 && Math.abs(V[3 * v(r, 0) + 1] + (rc + w)) < 1e-9, 'the skirt is rc + w');
      assert.ok(Math.abs(V[3 * v(r, 9) + 1] - rc) < 1e-9);
    }
  }
  // the last ring: a point rw past the end, with a skirt of width w round it
  const last = TUBE_RINGS - 1, first = 0;
  assert.ok(Math.abs(V[3 * v(last, 5)] - (ex + rw)) < 1e-9 && Math.abs(V[3 * v(first, 5)] - (sx - rw)) < 1e-9);
  for (let k = 0; k < TUBE_ARC; k++) { assert.ok(Math.abs(V[3 * v(last, 2 + k) + 1]) < 1e-9); assert.ok(Math.abs(V[3 * v(last, 2 + k) + 2] - L.LUMEN0) < 1e-9); }
  assert.ok(Math.abs(V[3 * v(last, 10) + 1] - w) < 1e-9 && Math.abs(V[3 * v(last, 0) + 1] + w) < 1e-9);
});

test('a gentle vessel: no dome or segment quad has any area, every joint is a mitre (no bevel), no triangle is clockwise', () => {
  const { P, R } = bent(5, 3, 17);
  const w = 1.58;
  for (let i = 1; i < N_SAMPLES - 1; i++) assert.equal(bevelled(P, R, i, w), false);
  const V = place(P, R, OPT(w, 3)), T = triangles(V);
  const nBody = 75 * 10 * 2;
  for (let t = nBody; t < T.length; t++) assert.equal(T[t].a2, 0, `extra triangle ${t - nBody} has an area`);
  for (const t of T) assert.ok(t.a2 >= -1e-9, 'a clockwise triangle');
  // the mitre ring is the Mesh strip's own: its outer skirt vertex is stripVertex at pad = w (right side exactly, both sides at constant radius)
  const i = 32, r = TUBE_CAP + i;
  const sv = stripVertex(P, R, i, 1, w), sm = stripVertex(P, R, i, -1, w);
  assert.ok(Math.hypot(V[3 * v(r, 10)] - sv[0], V[3 * v(r, 10) + 1] - sv[1]) < 1e-9, 'right outer = the Mesh strip\'s +side vertex');
  assert.ok(Math.hypot(V[3 * v(r, 0)] - sm[0], V[3 * v(r, 0) + 1] - sm[1]) < 1e-9, 'left outer = the Mesh strip\'s -side vertex');
  // a ring at the corner reaches the outside corner: the mitre is longer than the straight offset
  assert.ok(Math.hypot(V[3 * v(r, 10)] - P[2 * i], V[3 * v(r, 10) + 1] - P[2 * i + 1]) > 3 + w);
});

test('a tapering vessel: the right outer vertex of a mitred ring is the Mesh strip\'s own', () => {
  const { P, R } = bent(5, 3, 17);
  for (let i = 0; i < N_SAMPLES; i++) R[i] = 3 - 0.02 * i;   // 0.004 of the distance travelled: a real taper is 0.02 of it
  const w = 1.2, V = place(P, R, OPT(w, 3));
  for (const i of [10, 31, 32, 33, 50]) {
    const sv = stripVertex(P, R, i, 1, w), r = TUBE_CAP + i;
    // the Mesh strip's vertex is p + (rw + w) * mitre; the Tube's d for the outer skirt is rw + w too
    assert.ok(Math.hypot(V[3 * v(r, 10)] - sv[0], V[3 * v(r, 10) + 1] - sv[1]) < 1e-9, `sample ${i}`);
  }
});

test('a bevelled joint: the ring takes the plain average of the two normals, unit length and no mitre stretch; the dome is drawn and covers the turn', () => {
  const { P, R } = bent(3, 3, 150);
  const w = 1.58, V = place(P, R, OPT(w, 3)), T = triangles(V);
  assert.equal(bevelled(P, R, 32, w), true);
  const i = 32, r = TUBE_CAP + i, px = P[2 * i], py = P[2 * i + 1];
  // the two normals of the segments either side (left of travel): the ring is across their average
  const na = [0, 1], hb = (150 * Math.PI) / 180, nb = [-Math.sin(hb), Math.cos(hb)];
  let ax = 0.5 * (na[0] + nb[0]), ay = 0.5 * (na[1] + nb[1]); const al = Math.hypot(ax, ay); ax /= al; ay /= al;
  for (const a of [0, 1, 9, 10]) {
    const d = [-(3 + w), -3, 3, 3 + w][[0, 1, 9, 10].indexOf(a)];
    assert.ok(Math.hypot(V[3 * v(r, a)] - (px + d * ax), V[3 * v(r, a) + 1] - (py + d * ay)) < 1e-6, `column ${a}`);
  }
  // the dome of sample 32: its centre at the sample, its rim a hexagon of circumradius (rw + w) / cos(30 degrees)
  const b = DOME_BASE + (i - 1) * DOME_VERTS;
  assert.deepEqual([V[3 * b], V[3 * b + 1]], [px, py]);
  assert.ok(Math.abs(V[3 * b + 2] - (L.LUMEN0 + L.LUMEN_H * 1)) < 1e-12, 'the centre at the lumen\'s level');
  for (let u = 0; u < TUBE_HEX; u++) {
    assert.ok(Math.abs(Math.hypot(V[3 * (b + 1 + u)] - px, V[3 * (b + 1 + u) + 1] - py) - (3 + w) / Math.cos(Math.PI / 6)) < 1e-9);
    assert.equal(V[3 * (b + 1 + u) + 2], L.CASE0);
  }
  // a dome far from the turn collapses to its sample
  const b2 = DOME_BASE + (10 - 1) * DOME_VERTS;
  for (let u = 0; u <= TUBE_HEX; u++) assert.deepEqual([V[3 * (b2 + u)], V[3 * (b2 + u) + 1]], [P[20], P[21]]);
  assert.ok(T.slice(75 * 10 * 2).some((t) => Math.abs(t.a2) > 1), 'the dome has area at the turn');
  // an average that vanishes (the second segment doubles back exactly) falls to the first segment's normal
  const B = bent(3, 3, 180);
  const rr = TUBE_CAP + 32, Vb = place(B.P, B.R, OPT(w, 3));
  assert.ok(Math.abs(Vb[3 * v(rr, 10)] - B.P[64]) < 1e-9 && Math.abs(Vb[3 * v(rr, 10) + 1] - (B.P[65] + 3 + w)) < 1e-9, 'the first segment\'s normal');
});

test('coverage: bends and hairpins leave no point within rw + w - aaPad of the polyline outside the triangles, at segment lengths from 0.2 to 5 times rw + w', () => {
  const casing = 0.8, celK = 1.6, aaPad = 0.3, w = tubeWidth(casing, celK, 0, aaPad, 0, false);
  // Segment length as a multiple of rw + w (the half-width of the whole tube). A joint turned past what a mitre can take is bevelled: its ring takes
  // the average normal, a dome covers the outside of the turn and a quad on each segment's own normal covers the rest, at any segment length.
  const cases = [[17, 3, 3], [17, 6, 1], [17, 1, 3], [17, 1, 0.3], [17, 3, 5], [150, 3, 0.6], [150, 3, 0.5], [150, 3, 0.25], [150, 6, 0.6], [150, 6, 0.4], [150, 1.2, 0.6], [150, 1.2, 0.2], [150, 8, 0.6], [175, 3, 1], [175, 8, 1],
    ...[100, 120, 150].flatMap((t) => [2, 5].flatMap((k) => [1.2, 3, 8].map((rw) => [t, rw, k]))), [175, 3, 2], [175, 3, 5], [90, 3, 2], [60, 3, 5], [130, 5, 1.2], [140, 2, 3.3]];
  for (const [turn, rw, ratio] of cases) {
    const step = ratio * (rw + w), { P, R } = bent(step, rw, turn);
    const T = triangles(place(P, R, OPT(w, rw)));
    const reach = rw + w - aaPad;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const span = ratio <= 1 ? 8 : 3;   // (samples either side of the joint the grid covers)
    for (let i = 32 - span; i <= 32 + span; i++) { x0 = Math.min(x0, P[2 * i]); x1 = Math.max(x1, P[2 * i]); y0 = Math.min(y0, P[2 * i + 1]); y1 = Math.max(y1, P[2 * i + 1]); }
    const gs = Math.max(0.05, reach / (ratio <= 1 ? 24 : 14));
    let n = 0;
    for (let x = x0 - reach; x <= x1 + reach; x += gs) {
      for (let y = y0 - reach; y <= y1 + reach; y += gs) {
        let near = false;
        for (let j = 31 - span; j < 33 + span && !near; j++) near = segDist(P, j, x, y) <= reach;
        if (!near) continue;
        n++;
        assert.ok(covered(T, x, y, 1e-6), `uncovered point (${x.toFixed(2)}, ${y.toFixed(2)}): turn ${turn}, rw ${rw}, step ${step}`);
      }
    }
    assert.ok(n > 500, `the grid should hold points (${n})`);
  }
});

test('levels: every f is in 0..1; lumen above casing above glow; a glow pass has a level of its own', () => {
  assert.ok(L.GLOW0 < L.GLOW_WALL && L.GLOW_WALL < L.GLOW1 && L.GLOW1 < L.CASE0 && L.CASE0 < L.CASE1 && L.CASE1 < L.LUMEN0 && L.LUMEN0 + L.LUMEN_H <= 1 && L.LUMEN0 + L.LUMEN_H < L.PATCH && L.PATCH < 1 && L.GLOW0 > 0);
  const types = ['smooth', 'wiggly', 'hairpin'];
  for (let seed = 1; seed <= 60; seed++) {
    const rand = rng(seed * 7919), type = types[seed % 3];
    const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES);
    let x = 0, y = 0, h = rand() * 6, step = 0.3 + rand() * 6;
    for (let i = 0; i < N_SAMPLES; i++) {
      P[2 * i] = x; P[2 * i + 1] = y;
      h += type === 'smooth' ? (rand() - 0.5) * 0.2 : type === 'wiggly' ? (rand() - 0.5) * 2 : (rand() < 0.1 ? Math.PI * (0.7 + 0.3 * rand()) : (rand() - 0.5) * 0.1);
      x += Math.cos(h) * step; y += Math.sin(h) * step;
      R[i] = 0.1 + rand() * 6;   // (a radius below MIN_RADIUS reads as MIN_RADIUS)
    }
    const hRef = 0.5 + rand() * 12, w = rand() * 5;
    for (const glow of [false, true]) {
      const V = place(P, R, OPT(w, hRef, glow));
      for (let q = 0; q < TUBE_VERTS; q++) {
        const f = V[3 * q + 2];
        assert.ok(f >= 0 && f <= 1, `f ${f}`);
        assert.ok(Number.isFinite(V[3 * q]) && Number.isFinite(V[3 * q + 1]));
        if (glow) assert.ok(f === L.GLOW0 || f === L.GLOW_WALL || f === L.GLOW1);
        else assert.ok(f >= L.CASE0 && f <= L.LUMEN0 + L.LUMEN_H + 1e-12);
      }
      for (let r = 0; r < TUBE_RINGS; r++) {
        const arcMin = Math.min(...[2, 3, 4, 5, 6, 7, 8].map((a) => V[3 * v(r, a) + 2])), skirtMax = Math.max(...[0, 1, 9, 10].map((a) => V[3 * v(r, a) + 2]));
        if (!glow) assert.ok(arcMin >= L.LUMEN0 - 1e-12 && skirtMax <= L.CASE1, 'lumen above casing');
        else {
          assert.ok(arcMin >= L.GLOW1 && skirtMax <= L.GLOW_WALL, 'glow: the middle above the skirt');
          // the skirt slopes: the outer columns at GLOW0, the wall columns at GLOW_WALL (the nearest wall is the nearest surface)
          assert.deepEqual([0, 10].map((a) => V[3 * v(r, a) + 2]), [L.GLOW0, L.GLOW0], 'glow: the outer edge');
          assert.deepEqual([1, 9].map((a) => V[3 * v(r, a) + 2]), [L.GLOW_WALL, L.GLOW_WALL], 'glow: the wall');
        }
      }
    }
    // the radius floor: a radius under MIN_RADIUS draws as MIN_RADIUS
    assert.ok(MIN_RADIUS > 0.1);
  }
});

test('a dome\'s levels: the centre at its lumen\'s height, the rim at CASE0; in a glow pass GLOW1 and GLOW0', () => {
  const { P, R } = bent(3, 3, 150);
  const b = DOME_BASE + 31 * DOME_VERTS;
  const lit = place(P, R, OPT(1.5, 6)), glow = place(P, R, OPT(1.5, 6, true));
  assert.ok(Math.abs(lit[3 * b + 2] - (L.LUMEN0 + L.LUMEN_H * 0.5)) < 1e-12);
  assert.equal(glow[3 * b + 2], L.GLOW1);
  for (let u = 1; u <= TUBE_HEX; u++) { assert.equal(lit[3 * (b + u) + 2], L.CASE0); assert.equal(glow[3 * (b + u) + 2], L.GLOW0); }
});

test('a segment quad: collapsed to the samples unless either end is bevelled, then at +-(rw + w) on the segment\'s own normal, level CASE0 (GLOW0 in a glow pass)', () => {
  const rw = 3, w = 1.58, { P, R } = bent(3, rw, 150);
  const V = place(P, R, OPT(w, 3)), G = place(P, R, OPT(w, 3, true));
  assert.equal(bevelled(P, R, 32, w), true);
  for (const j of [10, 40]) for (let k = 0; k < 4; k++) {
    const q = TRAP_BASE + 4 * j + k, e = j + (k >> 1);
    assert.deepEqual([V[3 * q], V[3 * q + 1]], [P[2 * e], P[2 * e + 1]], `segment ${j} collapses`);
  }
  for (const j of [31, 32]) {   // the segments either side of the bevelled sample 32 (segment j runs from sample j to j + 1)
    const tx = (P[2 * j + 2] - P[2 * j]), ty = (P[2 * j + 3] - P[2 * j + 1]), len = Math.hypot(tx, ty);
    const nx = -ty / len, ny = tx / len;
    for (let k = 0; k < 4; k++) {
      const q = TRAP_BASE + 4 * j + k, e = j + (k >> 1), s = k & 1 ? 1 : -1;
      assert.ok(Math.hypot(V[3 * q] - (P[2 * e] + s * (rw + w) * nx), V[3 * q + 1] - (P[2 * e + 1] + s * (rw + w) * ny)) < 1e-9, `segment ${j}, vertex ${k}`);
      assert.equal(V[3 * q + 2], L.CASE0); assert.equal(G[3 * q + 2], L.GLOW0);
    }
  }
  const T = triangles(V);
  const first = (75 * 10 + 62 * 6) ;
  assert.ok(T.slice(first + 31 * 2, first + 33 * 2).some((t) => Math.abs(t.a2) > 1) && T.slice(first + 31 * 2, first + 33 * 2).every((t) => t.a2 >= 0));
});

test('a fading vessel\'s lumen sits below every opaque lumen and above its own casing, and never steps as the alpha changes', () => {
  const F = TUBE_FADE;
  assert.ok(F.L0 > L.CASE1 && F.L0 + F.H < L.LUMEN0, 'the low band is between the casing and the lumens');
  // casing and glow levels are never moved; an opaque lumen is not moved
  for (const f of [L.GLOW0, L.GLOW_WALL, L.GLOW1, L.CASE0, L.CASE1]) for (const a of [0, 0.2, 0.7, 1]) assert.equal(tubeFadeLevel(f, a), f);
  for (const f of [L.LUMEN0, 0.45, L.LUMEN0 + L.LUMEN_H]) assert.equal(tubeFadeLevel(f, 1), f);
  // wholly faded: every lumen level lands in the band, in the same order
  let prev = -1;
  for (let k = 0; k <= 10; k++) {
    const f = L.LUMEN0 + (L.LUMEN_H * k) / 10, g = tubeFadeLevel(f, F.A);
    assert.ok(g >= F.L0 - 1e-12 && g <= F.L0 + F.H + 1e-12 && g > prev, `level ${f} -> ${g}`);
    prev = g;
    assert.equal(tubeFadeLevel(f, 0), g, 'at or under FADE_A the same');
  }
  // between: continuous and falling as the alpha falls
  for (const f of [L.LUMEN0, 0.5, 0.8]) {
    let last = tubeFadeLevel(f, 1);
    for (let a = 1; a >= 0; a -= 0.01) { const g = tubeFadeLevel(f, a); assert.ok(g <= last + 1e-12 && last - g < 0.02, `a ${a.toFixed(2)}: ${last} -> ${g}`); last = g; }
  }
});

test('tubeAlpha: the row\'s alpha as vesAttrs reads it (base, linear fade, radial fade, dip)', () => {
  const t3 = [0, 0, 100, 0];
  assert.equal(tubeAlpha({ a: 0.6, t3, t4: [0, 0, 0, 0] }, 50, 7), 0.6);
  // linear: from t4.y at t4.x of the way along to t4.z at the end
  const lin = { a: 1, t3, t4: [0.2, 1, 0, 1] };
  assert.equal(tubeAlpha(lin, 10, 0), 1);
  assert.ok(Math.abs(tubeAlpha(lin, 60, 0) - 0.5) < 1e-12);
  assert.equal(tubeAlpha(lin, 100, 0), 0);
  // radial (t3.z the reach from t3.xy): t4.y at the centre falling to 0 at the reach
  const rad = { a: 1, t3: [10, 10, 20, 0], t4: [0, 0.8, 0.5, 2] };
  assert.ok(Math.abs(tubeAlpha(rad, 10, 10) - 0.8) < 1e-12);
  assert.ok(Math.abs(tubeAlpha(rad, 10 + 9, 10) - 0.5) < 1e-12);
  assert.ok(Math.abs(tubeAlpha(rad, 10 + 20, 10)) < 1e-12);
  // dip: down to t4.z at t4.x along, back to solid at the end
  const dip = { a: 0.9, t3, t4: [0.5, 1, 0.2, 3] };
  assert.ok(Math.abs(tubeAlpha(dip, 0, 0) - 0.9) < 1e-12);
  assert.ok(Math.abs(tubeAlpha(dip, 50, 0) - 0.9 * 0.2) < 1e-12);
  assert.ok(Math.abs(tubeAlpha(dip, 100, 0) - 0.9) < 1e-12);
});

test('a faded branch overlapping its trunk: every lumen vertex of the fading branch is below every lumen vertex of the opaque trunk', () => {
  const trunk = bent(5, 4, 0), branch = bent(5, 3, 20);
  const o = (fade) => ({ w: 1.58, hRef: 4, fade });
  const Vt = place(trunk.P, trunk.R, o({ a: 1, t3: [0, 0, 1, 0], t4: [0, 0, 0, 0] }));
  for (const base of [0.3, 0.6, 0.9]) {
    const Vb = place(branch.P, branch.R, o({ a: base, t3: [0, 0, 1, 0], t4: [0, 0, 0, 0] }));
    let tMin = 1, bMax = 0, bMin = 1;
    for (let r = 0; r < TUBE_RINGS; r++) for (let a = 2; a <= 8; a++) {
      tMin = Math.min(tMin, Vt[3 * v(r, a) + 2]); bMax = Math.max(bMax, Vb[3 * v(r, a) + 2]); bMin = Math.min(bMin, Vb[3 * v(r, a) + 2]);
    }
    assert.ok(Math.abs(tMin - L.LUMEN0) < 1e-12, 'the opaque trunk keeps its levels');
    if (base <= TUBE_FADE.A + 0.01) assert.ok(bMax < tMin, `alpha ${base}: faded lumen ${bMax} under the trunk's lowest ${tMin}`);
    assert.ok(bMin > L.CASE1, 'and above its own casing');
    // its casing skirt and everything but the lumen is as before
    const Vp = place(branch.P, branch.R, { w: 1.58, hRef: 4 });
    for (let r = 0; r < TUBE_RINGS; r++) for (const a of [0, 1, 9, 10]) assert.equal(Vb[3 * v(r, a) + 2], Vp[3 * v(r, a) + 2]);
  }
  // a glow pass is not touched
  const Vg = place(branch.P, branch.R, { w: 1.58, hRef: 4, glow: true, fade: { a: 0.1, t3: [0, 0, 1, 0], t4: [0, 0, 0, 0] } });
  for (let q = 0; q < TUBE_VERTS; q++) assert.ok([L.GLOW0, L.GLOW_WALL, L.GLOW1].includes(Vg[3 * q + 2]));
  // a vessel fading along its length steps by no more than a smooth ease from ring to ring
  const lin = { a: 1, t3: [0, 0, 63 * 5, 0], t4: [0, 1, 0.1, 1] }, V1 = place(trunk.P, trunk.R, o(lin));
  let last = V1[3 * v(TUBE_CAP, 5) + 2];
  for (let i = 1; i < N_SAMPLES; i++) { const g = V1[3 * v(TUBE_CAP + i, 5) + 2]; assert.ok(Math.abs(g - last) < 0.05, `ring ${i}: ${last} -> ${g}`); last = g; }
});

test('tubeWidth: casing * celK + selection pad (selected rows only) + aaPad + padU', () => {
  assert.equal(tubeWidth(0.8, 1.6, 4, 0.3, 2, false), 0.8 * 1.6 + 0.3 + 2);
  assert.equal(tubeWidth(0.8, 1.6, 4, 0.3, 2, true), 0.8 * 1.6 + 4 + 0.3 + 2);
});

// ---- The GLSL ----

/** lintGLSL follows no directives: expand the one #define the strip text holds (ENT_W) the way the compiler would. */
function expanded(src) {
  const defs = [...src.matchAll(/^#define (\w+) (.*)$/gm)];
  let out = src.replace(/^#define .*$/gm, '');
  for (const [, name, value] of defs) out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), value);
  return out;
}
const VS = tubeStripVS(STRIP_VS_GLSL, 1);

test('the vertex shader lints clean, with the interface of meshStripVS and no uniform the fragment shader declares', () => {
  assert.deepEqual(lintGLSL(expanded(VS)), []);
  assert.deepEqual(lintGLSL(expanded(tubeStripVS(STRIP_VS_GLSL, 4))), []);
  assert.ok(VS.startsWith('#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n'));
  assert.ok(VS.includes('layout(location=0) in vec4 aV;') && VS.includes('layout(location=1) in float aRow;'));
  assert.ok(VS.includes('out float vI;') && VS.includes('flat out int vRow;'));
  const names = uniformsOf(VS);
  for (const u of ['world', 'size', 'lOff', 'tube', 'mPass', 'padU', 'selPad', 'tubeBase', 'tubeH', 'hRef', 'celK', 'aaPad', 'ent', 'rad', 'posBase']) {
    assert.equal(names.filter((n) => n === u).length, 1, `uniform ${u} is declared once`);
  }
  for (const bad of ['keyBase', 'keyH', 'px', 'keyShape']) assert.ok(!names.includes(bad), `${bad} belongs to the fragment shader`);
  assert.ok(VS.includes('uniform float tubeBase;') && VS.includes('uniform float tubeH;') && VS.includes('uniform float hRef;') && VS.includes('uniform float celK;') && VS.includes('uniform float aaPad;'));
  assert.ok(!VS.includes('gl_FragDepth'));
});

test('the GLSL holds the numbers of the JS twin: levels, grid sizes, the depth formula, the glow fold', () => {
  for (const [name, val] of Object.entries(L)) assert.ok(VS.includes(`const float L_${name} = ${val};`), `L_${name}`);
  assert.ok(VS.includes(`const int T_CAP = ${TUBE_CAP};`) && VS.includes(`const int T_ARC = ${TUBE_ARC};`) && VS.includes(`const int T_ACROSS = ${TUBE_ACROSS};`) && VS.includes(`const int T_HEX = ${TUBE_HEX};`));
  assert.ok(VS.includes(`const int T_DOME = ${TUBE_KIND.DOME};`));
  assert.ok(VS.includes('2.0 * (tubeBase + (1.0 - q.z) * tubeH) - 1.0'), 'depth01 = base + (1 - f) * H, z = 2 * depth01 - 1');
  assert.ok(VS.includes('d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0'));
  assert.ok(VS.includes('vec3 d = world * vec3(q.xy, 1.0);') && VS.includes('d.xy += lOff;'));
  assert.ok(VS.includes(`bool glow = mPass <= ${MP.UP};`) && VS.includes(`mPass >= ${MP.UP_K}`) && VS.includes('gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;'));
  assert.ok(VS.includes('texelFetch(tube, ivec2(0, id), 0).w * celK + (sel ? selPad : 0.0) + aaPad + padU'));
  assert.ok(VS.includes('(int(texelFetch(tube, ivec2(2, id), 0).z + 0.5) & 1) != 0'));
  assert.ok(tubeStripVS(STRIP_VS_GLSL, 128).includes('& 128) != 0'));
  // the placement's arithmetic, in the order of the JS twin
  assert.ok(VS.includes('float th = (float(ac - 2) / float(T_ARC - 1) - 0.5) * M_PI;'));
  assert.ok(VS.includes('float ph = float(c) / float(T_CAP) * M_PI / 2.0;'));
  assert.ok(VS.includes('float rr = (rw + w) / cos(M_PI / float(T_HEX));'));
  assert.ok(VS.includes('n = al < 1e-6 ? na : av / al;'));
  assert.ok(VS.includes('vI = kind == T_TRAP ? aV.y + aV.w : kind == T_DOME ? float(ring) : float(clamp(ring - T_CAP, 0, N_SAMPLES - 1));'));
  assert.ok(VS.includes(`const int T_TRAP = ${TUBE_KIND.TRAP};`));
  assert.ok(VS.includes('if (!(mBevelled(id, r, w) || mBevelled(id, r + 1, w))) return vec3(q, lv);'));
  assert.ok(VS.includes('mRW(id, r + cn, w) * mNrm(mSeg(id, r, w), ac == 1 ? 1.0 : -1.0)'));
  assert.ok(VS.includes(`const float L_FADE_A = ${TUBE_FADE.A};`) && VS.includes(`const float L_FADE0 = ${TUBE_FADE.L0};`) && VS.includes(`const float L_FADE_H = ${TUBE_FADE.H};`));
  assert.ok(VS.includes('if (!glow) q.z = tubeFadeLevel(q.z, tubeAlpha(id, q.xy));'));
  assert.ok(VS.includes('a *= v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));'));
  assert.ok(VS.includes('return mix(L_FADE0 + L_FADE_H * k, f, s);'));
  // it places by the Mesh's own functions
  for (const fn of ['mSeg(', 'mNrm(', 'mMitreAB(', 'mDiscOn(', 'PT(', 'mRW(']) assert.ok(VS.includes(fn), fn);
  assert.ok(!VS.replace(STRIP_VS_GLSL, '').includes('meshWorld('), 'the Mesh\'s placement is replaced, not called');
});

test('no name is declared both in the Tube\'s GLSL and in STRIP_VS_GLSL', () => {
  const mine = VS.replace(STRIP_VS_GLSL, '');
  assert.ok(mine.length < VS.length);
  const decl = /^(?:(?:const|uniform|out|in|flat|highp|layout\([^)]*\))\s+)*(?:void|bool|int|float|vec[234]|ivec[234]|mat3|MSeg|sampler2D)\s+(\w+)\s*(?:[=(;[]|$)/;
  const names = (src) => {
    const out = new Set();
    for (const line of src.split('\n')) {
      const m = decl.exec(line);
      if (m) out.add(m[1]);
      const s = /^struct\s+(\w+)/.exec(line);
      if (s) out.add(s[1]);
    }
    return out;
  };
  const a = names(STRIP_VS_GLSL), b = names(mine);
  assert.ok(a.size > 20 && b.size > 25, `the declarations were read (${a.size}, ${b.size})`);
  for (const n of b) assert.ok(!a.has(n), `${n} is declared in both`);
  // (only the names that stay in mine are the shader's interface and its own tube* / T_* / L_* helpers)
  for (const n of ['tubePlace', 'tubeAcross', 'T_CAP', 'L_LUMEN0', 'vI', 'vRow', 'main']) assert.ok(b.has(n), n);
});
