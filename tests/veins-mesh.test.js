import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  N_SAMPLES, N_QUADS, MITRE_LIMIT, CAP_SEGS, DISC_SEGS, MIN_RADIUS, TILT_MAX, SEG_EPS, KIND, N_VERTS, BODY_VERTS,
  stripIndex, stripVertex, meshVertex, bevelled, padOf, patchInstances, joinEntriesOf, memberOf, PATCH_QUAD, STRIP_VS_GLSL,
} from '../src/ui/veins-mesh.js';
import { ENT_W, binVeins } from '../src/ui/veins-bin.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const GL = await import('../src/ui/veins-gl.js');

// The vessel mesh renderer's geometry (docs/veins-mesh-plan.md, Phase 1). Node only: the mesh is built from the same functions the GLSL
// twin mirrors, so the coverage is judged on the JS placement of every vertex, for random centrelines (smooth, wiggly, hairpins, zigzags,
// loops, scatter, very short vessels), radii constant and tapering, and a pad from nothing to a wide casing + glow.

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeVessel(rand, type) {
  const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES);
  const N = N_SAMPLES;
  let step = 0.2 + rand() * 12, x = rand() * 100, y = rand() * 100, h = rand() * 2 * Math.PI;
  if (type === 'short') step = (0.0005 + rand() * 0.3);
  const sigma = { smooth: 0.02 + rand() * 0.15, wiggly: 0.4 + rand() * 1.2, hairpin: 0.05, zigzag: 0, short: rand() * 0.6, loop: 0, line: 0, scatter: 0 }[type] ?? 0.1;
  const hair = new Set(); const nh = 1 + Math.floor(rand() * 3); for (let k = 0; k < nh; k++) hair.add(2 + Math.floor(rand() * (N - 4)));
  const loopTurn = (2 * Math.PI) / (N - 1) * (0.3 + rand() * 1.4) * (rand() < 0.5 ? -1 : 1);
  for (let i = 0; i < N; i++) {
    if (type === 'scatter') { x = rand() * 80; y = rand() * 80; }
    else if (i > 0) {
      if (type === 'hairpin' && hair.has(i)) h += Math.PI + (rand() - 0.5) * (rand() < 0.5 ? 0.02 : 0.6);
      else if (type === 'zigzag') h += (i % 2 ? 1 : -1) * (Math.PI - 0.001 - rand() * 1.5);
      else if (type === 'loop') h += loopTurn;
      else h += (rand() - 0.5) * 2 * sigma;
      x += Math.cos(h) * step; y += Math.sin(h) * step;
    }
    P[2 * i] = x; P[2 * i + 1] = y;
  }
  const base = 0.2 + rand() * (type === 'short' ? 4 : 12), taper = rand() < 0.5 ? 0 : (rand() - 0.5) * 0.8 * base;
  for (let i = 0; i < N; i++) R[i] = Math.max(0.05, base + taper * Math.sin((i / (N - 1)) * Math.PI * (1 + Math.floor(rand() * 2))));
  // (The guarantee holds for a radius changing by up to TILT_MAX of the distance travelled; real vessels change 0.02. Keep the rest inside it.)
  for (let i = 1; i < N; i++) {
    const L = Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]), room = 0.5 * L;
    R[i] = Math.min(R[i - 1] + room, Math.max(R[i - 1] - room, R[i]));
  }
  return { P, R };
}

function vertices(P, R, pad) {
  const { attr } = stripIndexOnce();
  const out = new Float64Array(N_VERTS * 2);
  for (let v = 0; v < N_VERTS; v++) {
    const q = meshVertex(P, R, attr[v * 4], attr[v * 4 + 1], attr[v * 4 + 2], attr[v * 4 + 3], pad);
    out[2 * v] = q[0]; out[2 * v + 1] = q[1];
  }
  return out;
}
let ONCE = null;
function stripIndexOnce() { return ONCE ??= stripIndex(8); }

const area2 = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

function triangles(V) {
  const { index } = stripIndexOnce();
  const T = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ax = V[2 * a], ay = V[2 * a + 1], bx = V[2 * b], by = V[2 * b + 1], cx = V[2 * c], cy = V[2 * c + 1];
    T.push({ a2: area2(ax, ay, bx, by, cx, cy), ax, ay, bx, by, cx, cy, x0: Math.min(ax, bx, cx), x1: Math.max(ax, bx, cx), y0: Math.min(ay, by, cy), y1: Math.max(ay, by, cy), kind: t / 3 });
  }
  return T;
}
function covered(T, x, y, eps) {
  for (const t of T) {
    if (t.a2 === 0 || x < t.x0 - eps || x > t.x1 + eps || y < t.y0 - eps || y > t.y1 + eps) continue;
    const s = t.a2 > 0 ? 1 : -1;
    // (eps: a distance; the edge function is scaled by the edge's length)
    const e1 = s * area2(t.ax, t.ay, t.bx, t.by, x, y) / (Math.hypot(t.bx - t.ax, t.by - t.ay) || 1e-300);
    const e2 = s * area2(t.bx, t.by, t.cx, t.cy, x, y) / (Math.hypot(t.cx - t.bx, t.cy - t.by) || 1e-300);
    const e3 = s * area2(t.cx, t.cy, t.ax, t.ay, x, y) / (Math.hypot(t.ax - t.cx, t.ay - t.cy) || 1e-300);
    if (e1 >= -eps && e2 >= -eps && e3 >= -eps) return true;
  }
  return false;
}

test('the static mesh: body vertex k is sample k >> 1, side by the low bit; 63 quads; every index in range', () => {
  const m = stripIndex(300);
  assert.equal(N_SAMPLES, 64);
  assert.equal(N_QUADS, 63);
  assert.equal(m.nVerts, N_VERTS);
  assert.equal(m.attr.length, N_VERTS * 4);
  assert.equal(m.rows.length, 300);
  assert.equal(m.rows[299], 299);
  for (let k = 0; k < BODY_VERTS; k++) {
    assert.equal(m.attr[k * 4], KIND.BODY);
    assert.equal(m.attr[k * 4 + 1], k >> 1);
    assert.equal(m.attr[k * 4 + 2], (k & 1) ? 1 : -1);
  }
  assert.ok(m.index instanceof Uint16Array);
  assert.equal(m.nIndex, m.index.length);
  assert.equal(m.index.length % 3, 0);
  for (const i of m.index) assert.ok(i < N_VERTS);
  // the strip body alone: 63 quads, two triangles each, on vertices 0 .. 127
  let bodyTris = 0;
  for (let t = 0; t < m.index.length; t += 3) if (m.index[t] < BODY_VERTS && m.index[t + 1] < BODY_VERTS && m.index[t + 2] < BODY_VERTS) bodyTris++;
  assert.equal(bodyTris, N_QUADS * 2);
  // the sample indices are valid for the points a row holds
  for (let v = 0; v < N_VERTS; v++) assert.ok(m.attr[v * 4 + 1] >= 0 && m.attr[v * 4 + 1] < N_SAMPLES);
});

test('N_SAMPLES and the point layout are the vessel shader\'s own', () => {
  assert.equal(N_SAMPLES, GL.N_SAMPLES);
  const PT = 'vec2 PT(int id, int i) { int t = posBase + id * 32 + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); return (i & 1) == 0 ? v.xy : v.zw; }';
  assert.ok(GL.vesselFS(false).includes(PT), 'the vessel shader\'s PT() changed: update STRIP_VS_GLSL');
  assert.ok(STRIP_VS_GLSL.includes(PT));
  assert.ok(STRIP_VS_GLSL.includes(`#define ENT_W ${ENT_W}`));
});

test('the strip covers the capsule union (widened by pad) of random centrelines, hairpins and very short vessels', () => {
  const types = ['smooth', 'wiggly', 'hairpin', 'zigzag', 'short', 'loop', 'line', 'scatter'];
  let nBevel = 0, nJoint = 0, nPts = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed * 7919);
    const type = types[seed % types.length];
    const { P, R } = makeVessel(rand, type);
    const pad = rand() < 0.15 ? 0 : rand() * (rand() < 0.5 ? 3 : 15);
    const V = vertices(P, R, pad), T = triangles(V);
    for (let i = 1; i < N_SAMPLES - 1; i++) { nJoint++; if (bevelled(P, R, i, pad)) nBevel++; }
    const rw = (i) => Math.max(R[i], MIN_RADIUS) + pad;
    let scale = 1; for (let i = 0; i < N_SAMPLES; i++) scale = Math.max(scale, Math.abs(P[2 * i]), Math.abs(P[2 * i + 1]));
    const eps = 1e-6 * scale;
    for (let n = 0; n < 220; n++) {
      const j = Math.floor(rand() * N_QUADS), t = rand() < 0.2 ? (rand() < 0.5 ? 0 : 1) : rand();
      const cx = P[2 * j] + (P[2 * j + 2] - P[2 * j]) * t, cy = P[2 * j + 1] + (P[2 * j + 3] - P[2 * j + 1]) * t;
      const r = rw(j) + (rw(j + 1) - rw(j)) * t, th = rand() * 2 * Math.PI;
      const rho = rand() < 0.5 ? 0.9999 - rand() * 0.02 : Math.sqrt(rand()) * 0.9999;
      const x = cx + Math.cos(th) * r * rho, y = cy + Math.sin(th) * r * rho;
      nPts++;
      assert.ok(covered(T, x, y, eps), `uncovered point (${type}, seed ${seed}, pad ${pad.toFixed(2)}, segment ${j}, t ${t.toFixed(3)}, rho ${rho.toFixed(4)})`);
    }
  }
  assert.ok(nPts > 80000);
  assert.ok(nBevel > 50 && nBevel < nJoint, `the sample set should bevel some joints but not all (${nBevel}/${nJoint})`);
});

test('the strip joints of a gentle vessel are plain mitres: nothing is bevelled, and the extra triangles have no area', () => {
  const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES).fill(3);
  for (let i = 0; i < N_SAMPLES; i++) { P[2 * i] = i * 5; P[2 * i + 1] = Math.sin(i * 0.08) * 20; }
  for (let i = 1; i < N_SAMPLES - 1; i++) assert.equal(bevelled(P, R, i, 4), false);
  const T = triangles(vertices(P, R, 4));
  const { index } = stripIndexOnce();
  let live = 0;
  for (let t = 0; t < T.length; t++) {
    const first = index[t * 3];
    const extra = first >= BODY_VERTS && !(first >= BODY_VERTS && first < BODY_VERTS + 22);   // discs and tangent quads (not the caps)
    if (extra && Math.abs(T[t].a2) > 1e-9) live++;
  }
  assert.equal(live, 0);
});

test('no folding: every triangle that has an area is counter-clockwise, at clamped mitres and bevels too', () => {
  const types = ['wiggly', 'hairpin', 'zigzag', 'short', 'scatter', 'smooth', 'loop'];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed * 104729);
    const { P, R } = makeVessel(rand, types[seed % types.length]);
    const pad = rand() * 8;
    const T = triangles(vertices(P, R, pad));
    let scale = 1; for (let i = 0; i < N_SAMPLES; i++) scale = Math.max(scale, Math.abs(P[2 * i]), Math.abs(P[2 * i + 1]));
    for (const t of T) assert.ok(t.a2 >= -1e-9 * scale * scale, `a clockwise triangle (${types[seed % types.length]}, seed ${seed}): area*2 ${t.a2}`);
  }
});

test('stripVertex: end samples and straight runs sit one half-width either side; a hairpin pinches', () => {
  const P = new Float64Array(N_SAMPLES * 2), R = new Float64Array(N_SAMPLES).fill(2);
  for (let i = 0; i < N_SAMPLES; i++) P[2 * i] = i * 10;
  const a = stripVertex(P, R, 10, 1, 3), b = stripVertex(P, R, 10, -1, 3);
  assert.ok(Math.abs(a[0] - 100) < 1e-9 && Math.abs(a[1] - 5) < 1e-9, `left of travel (+y) by r + pad: ${a}`);
  assert.ok(Math.abs(b[0] - 100) < 1e-9 && Math.abs(b[1] + 5) < 1e-9);
  assert.deepEqual(stripVertex(P, R, 0, 1, 3).map(Math.round), [0, 5]);
  assert.deepEqual(stripVertex(P, R, N_SAMPLES - 1, -1, 3).map(Math.round), [630, -5]);
  // a hairpin at sample 20: the sample is bevelled, its strip vertices pinch to the centreline
  for (let i = 21; i < N_SAMPLES; i++) { P[2 * i] = 200 - (i - 20) * 3; P[2 * i + 1] = 0.01; }
  assert.equal(bevelled(P, R, 20, 3), true);
  assert.deepEqual(stripVertex(P, R, 20, 1, 3), [P[40], P[41]]);
});

test('patch instances: from binVeins\' own join entries, half-size = reach + pad, every join reach inside its patch', () => {
  const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
  const tubes = [
    { id: 0, pts: line(10, 10, 30, 8, 3), reach: 14 },
    { id: 1, pts: line(400, 20, 25, -5, 9), reach: 11 },
    { id: 2, pts: line(200, 300, 40, 6, -2), reach: 9 },
  ];
  const joins = [
    { x: 250, y: 100, reach: 20, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 },
    { x: 330, y: 250, reach: 12, k: 0.2, fillet: 0.5, members: [1, 2, 0], trunk: 2, fork: true },
  ];
  const bin = binVeins(tubes, joins);
  // (the join entries are the ones written at a join's own centre and reach; one copy in each cell the join reaches)
  const list = [];
  for (let e = 0; e < bin.nEnt; e++) {
    const q = e * 8;
    if (joins.some((j) => bin.ent[q] === j.x && bin.ent[q + 1] === j.y && bin.ent[q + 2] === j.reach)) list.push(e);
  }
  assert.ok(list.length > joins.length, 'a join is listed in several cells');
  const entries = joinEntriesOf(bin.ent, list);
  const pad = 7.5;
  const { data, count } = patchInstances(entries, pad);
  assert.equal(count, joins.length, 'one patch a join, however many cells list it');
  assert.equal(data.length, count * 8);
  joins.forEach((j, n) => {
    const at = n * 8;
    assert.equal(data[at], j.x); assert.equal(data[at + 1], j.y);
    assert.ok(Math.abs(data[at + 2] - (j.reach + pad)) < 1e-4, 'half-size = reach + pad');
    assert.equal(data[at + 3], Math.fround(Math.round(j.k * 100) + 0.99 * j.fillet));
    const rows = [0, 1, 2, 3].map((m) => memberOf(data[at + 4 + m]));
    assert.deepEqual(rows.slice(0, j.members.length).map((r) => r.row), j.members);
    assert.deepEqual(rows.slice(j.members.length), new Array(4 - j.members.length).fill(null));
    rows.slice(0, j.members.length).forEach((r, m) => assert.equal(r.mark, j.members[m] === j.trunk ? (j.fork ? 0.375 : 0.25) : 0));
    // the quad (centre +- half) holds the whole disc of the join's reach, and the pad beyond it, by sampling the rim
    const half = data[at + 2];
    for (let k = 0; k < 64; k++) {
      const th = (k / 64) * 2 * Math.PI, rr = j.reach + pad;
      assert.ok(Math.abs(Math.cos(th) * rr * 0.9999) <= half && Math.abs(Math.sin(th) * rr * 0.9999) <= half);
    }
  });
  // an off join (reach <= 0) and one without a member give no patch
  const off = new Float32Array(16);
  off.set([5, 5, -1, 40.99, 1, -1, -1, -1, 6, 6, 9, 40.99, -1, -1, -1, -1]);
  assert.equal(patchInstances(off, 3).count, 0);
  assert.deepEqual(Array.from(PATCH_QUAD), [-1, -1, 1, -1, -1, 1, 1, 1]);
  assert.equal(memberOf(-1), null);
});

test('padOf: casing + |shadow offset| + glow reach + 2 px', () => {
  assert.equal(padOf(1.5, [3, 4], 6, 0.5), 1.5 + 5 + 6 + 1);
  assert.equal(padOf(0, [0, 0], 0, 0), 0);
});

test('the GLSL string holds the JS constants and the same placement functions', () => {
  const s = STRIP_VS_GLSL;
  assert.ok(s.includes(`const int N_SAMPLES = ${N_SAMPLES};`));
  assert.ok(s.includes(`const int N_QUADS = ${N_QUADS};`));
  assert.ok(s.includes(`const float MITRE_LIMIT = ${MITRE_LIMIT}.0;`));
  assert.ok(s.includes(`const int CAP_SEGS = ${CAP_SEGS};`));
  assert.ok(s.includes(`const int DISC_SEGS = ${DISC_SEGS};`));
  assert.ok(s.includes(`const float MIN_RADIUS = ${MIN_RADIUS};`));
  assert.ok(s.includes(`const float TILT_MAX = ${TILT_MAX};`));
  assert.ok(s.includes(`const float SEG_EPS = ${SEG_EPS.toExponential()};`));
  for (const [k, name] of [[KIND.BODY, 'K_BODY'], [KIND.CAP, 'K_CAP'], [KIND.DISC, 'K_DISC'], [KIND.TRAP, 'K_TRAP']]) assert.ok(s.includes(`const int ${name} = ${k};`));
  for (const fn of ['vec2 PT(int id, int i)', 'MSeg mSeg(', 'bool mMitreAB(', 'bool mBevelled(', 'vec2 meshWorld(int id, vec4 a, float pad)']) assert.ok(s.includes(fn), fn);
  // the thresholds are the JS ones
  assert.ok(s.includes('if (m2 < 1e-12) return false;'));
  assert.ok(s.includes('if (cosH < 1.0 / MITRE_LIMIT) return false;'));
  assert.ok(s.includes('> 0.5 * a.L || abs(rw * dot(mv, b.t)) > 0.5 * b.L) return false;'));
  assert.ok(s.includes('return abs(mRW(id, i, pad) * g.tilt) > 0.5 * g.L;'));
  assert.ok(s.includes('uniform sampler2D rad;'));
  assert.equal(MITRE_LIMIT, 2);
  assert.equal(TILT_MAX, 0.9);
});
