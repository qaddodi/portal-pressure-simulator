// The mesh vessel pass (veins-mesh.js, veins-gl.js meshPass): its vessel quads must over-cover what the classic vessel shader keeps at a
// pixel, so a pixel marked "one vessel" is one where the classic shader keeps at most one, and a pixel marked "none" one where it keeps
// none. Then the one-vessel build and the skipped pixels give the classic picture exactly. Pure JS, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maskCorner, maskPad, maskDepth, segEntries, MASK_VS, MASK_FS, ZERO_FS, MASK_MARGIN_PX, S_ONE, S_MANY, S_COUNT, S_DRAWN } from '../src/ui/veins-mesh.js';
import { binVeins, CELL, ENT_W } from '../src/ui/veins-bin.js';

const N = 64;
const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

// A small seeded random, so a failure can be run again.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12, h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return { d: Math.hypot(px - ax - dx * h, py - ay - dy * h), h };
};
// Whether p lies inside the convex quad of a segment's four corners (maskCorner at 0/1, 0/1).
function inQuad(px, py, ax, ay, bx, by, R) {
  const c = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => maskCorner(ax, ay, bx, by, R, x, y));
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % 4], cr = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
    if (Math.abs(cr) < 1e-9) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

test('a segment quad holds the whole capsule, short and zero-length segments too', () => {
  const r = rng(7);
  for (let k = 0; k < 400; k++) {
    const ax = r() * 200, ay = r() * 200, L = k % 10 === 0 ? 0 : k % 5 === 0 ? r() * 0.01 : r() * 80, a = r() * Math.PI * 2;
    const bx = ax + Math.cos(a) * L, by = ay + Math.sin(a) * L, R = 0.5 + r() * 30;
    for (let j = 0; j < 60; j++) {
      const px = ax - 40 + r() * (L + 80), py = ay - 40 + r() * (L + 80);
      if (segDist(px, py, ax, ay, bx, by).d < R * 0.9999) assert.ok(inQuad(px, py, ax, ay, bx, by, R), `capsule point (${px}, ${py}) outside its quad`);
    }
  }
});

test('the pad holds the classic reach, its 2 px, the shadow offset and the margin', () => {
  const px = 0.37, sh = [1.2, -0.9];
  assert.equal(maskPad(10, sh, px), 10 + (2 + MASK_MARGIN_PX) * px + Math.hypot(1.2, 0.9));
  assert.equal(maskPad(10, null, px), 10 + (2 + MASK_MARGIN_PX) * px);
  assert.ok(MASK_MARGIN_PX >= 1);
});

test('the depth names each row: strictly increasing, inside (0, 1), as the vertex shader writes it', () => {
  const n = 400;
  for (let i = 1; i < n; i++) assert.ok(maskDepth(i, n) > maskDepth(i - 1, n));
  assert.ok(maskDepth(0, n) > 0 && maskDepth(n - 1, n) < 1);
  const vs = MASK_VS(N, ENT_W);
  assert.match(vs, /float\(id \+ 1\) \* zK \* 2\.0 - 1\.0/);
  assert.match(gl, /UC\.f1\(u\.zK, 1 \/ \(nTubes \+ 2\)\)/, 'veins-gl gives zK as maskDepth does');
});

test('the vertex shader places corners as maskCorner does and reads the entries as the vessel shader does', () => {
  const vs = MASK_VS(N, ENT_W);
  assert.match(vs, /float s = -R \+ corner\.x \* \(L \+ 2\.0 \* R\), n = -R \+ corner\.y \* 2\.0 \* R;/);
  assert.match(vs, /vec2 w = A\.xy \+ t \* s \+ vec2\(-t\.y, t\.x\) \* n;/);
  assert.match(vs, /float R = max\(rr\.x, rr\.y\) \+ pad;/);
  // (The same drawn-part test and the same morph points as the vessel shader: a segment it passes over, the quads pass over too.)
  assert.ok(vs.includes('u1 < clip.x || u0 > clip.y'));
  assert.ok(gl.includes('if (u1 < clip.x || u0 > clip.y) continue;'));
  const pt = (s) => s.match(/vec2 PT\(int id, int i\) \{[^\n]*\}/)[0].replaceAll(String(ENT_W), 'ENT_W').replace('${N_SAMPLES / 2}', String(N / 2));
  assert.equal(pt(vs), pt(gl), 'PT reads the frame\'s points the same way');
  assert.ok(gl.includes('if (morphOn >= 1) { int si = int(B.y + 0.5); A = vec4(PT(id, si), PT(id, si + 1)); }'));
  assert.ok(vs.includes(`ivec2(t % ${ENT_W}, t / ${ENT_W})`));
  assert.match(MASK_FS, /void main\(\) \{\}/);
  for (const k of ['o0', 'o1', 'o2', 'o3']) assert.ok(ZERO_FS.includes(`${k} = `), `the zero shader writes ${k}`);
  assert.equal(S_ONE | S_MANY, S_COUNT);
  assert.equal(S_DRAWN & S_COUNT, 0, 'the one-pass mark stays clear of the count');
});

// The classic shader's "in reach" (vesselFS): a vessel is kept at p when min(nearest wall, nearest shadow wall) < reach + 2 px, over the
// segments its cell lists, each with its radius mixed between the segment's two.
function classicCount(bins, rad, p, reachU, shOff, px) {
  const reach = reachU + 2 * px, { cells, nCells, ent } = bins;
  let c = -1;
  for (let i = 0; i < nCells; i++) if (p[0] >= cells[i * 6] && p[0] < cells[i * 6] + CELL && p[1] >= cells[i * 6 + 1] && p[1] < cells[i * 6 + 1] + CELL) c = i;
  if (c < 0) return 0;
  const s0 = cells[c * 6 + 2], n = cells[c * 6 + 3], best = new Map();
  for (let e = s0; e < s0 + n; e++) {
    const q = e * 8, id = ent[q + 4], si = ent[q + 5];
    if (si < -0.5) continue;
    const [r0, r1] = rad(id, si);
    const a = segDist(p[0], p[1], ent[q], ent[q + 1], ent[q + 2], ent[q + 3]), b = segDist(p[0] - shOff[0], p[1] - shOff[1], ent[q], ent[q + 1], ent[q + 2], ent[q + 3]);
    const d = Math.min(a.d - (r0 + (r1 - r0) * a.h), b.d - (r0 + (r1 - r0) * b.h));
    best.set(id, Math.min(best.get(id) ?? Infinity, d));
  }
  let k = 0;
  for (const d of best.values()) if (d < reach) k++;
  return k;
}
// The mesh pass's count: the distinct rows whose quads hold p (every segment entry, as the instanced draw).
function maskCount(bins, rad, p, reachU, shOff, px) {
  const { ent, cells, nCells } = bins, pad = maskPad(reachU, shOff, px), rows = new Set();
  for (let e = 0; e < segEntries(cells, nCells); e++) {
    const q = e * 8;
    if (ent[q + 5] < -0.5) continue;
    let zero = true;
    for (let f = 0; f < 8; f++) if (ent[q + f] !== 0) zero = false;
    if (zero) continue;
    const id = ent[q + 4], [r0, r1] = rad(id, ent[q + 5]);
    if (inQuad(p[0], p[1], ent[q], ent[q + 1], ent[q + 2], ent[q + 3], Math.max(r0, r1) + pad)) rows.add(id);
  }
  return rows.size;
}

test('every pixel the classic shader keeps a vessel at is counted, and every pixel it keeps two at is counted two', () => {
  for (const seed of [1, 2, 3]) {
    const r = rng(seed), tubes = [], radii = new Map();
    // Vessels with hairpins, near-parallel runs, crossings and very short ones.
    for (let t = 0; t < 6; t++) {
      const pts = [], x0 = 40 + r() * 120, y0 = 40 + r() * 120, L = t === 5 ? 3 : 60 + r() * 140, a0 = r() * 6.3, bend = (r() - 0.5) * (t === 2 ? 0.4 : 0.08);
      let x = x0, y = y0, a = a0;
      for (let i = 0; i < N; i++) { pts.push([x, y]); a += bend; x += Math.cos(a) * L / (N - 1); y += Math.sin(a) * L / (N - 1); }
      const R = Array.from({ length: N }, (_, i) => 1 + r() * 6 + (i === 30 ? 4 : 0));
      radii.set(t, R);
      tubes.push({ id: t, pts, reach: 22 + 12 });
    }
    const bins = binVeins(tubes, []);
    const rad = (id, i) => { const R = radii.get(id); return [R[i], R[Math.min(N - 1, i + 1)]]; };
    const reachU = 15.6, shOff = [1.4, 2.1], px = 0.5;
    let ones = 0, many = 0;
    for (let k = 0; k < 700; k++) {
      const p = [r() * 360, r() * 360];
      const want = classicCount(bins, rad, p, reachU, shOff, px), got = maskCount(bins, rad, p, reachU, shOff, px);
      if (want >= 1) assert.ok(got >= 1, `seed ${seed}: a kept vessel at (${p}) is not counted`);
      if (want >= 2) assert.ok(got >= 2, `seed ${seed}: two kept vessels at (${p}) counted ${got}`);
      if (got === 1) ones++; if (got >= 2) many++;
    }
    assert.ok(ones > 0, `seed ${seed}: some one-vessel pixels`);
    void many;
  }
});

test('segEntries ends the segment entries where the joins begin, and every listed segment lies before it', () => {
  const pts = (x0, y0, dx, dy) => Array.from({ length: N }, (_, i) => [x0 + dx * i, y0 + dy * i]);
  const tubes = [{ id: 0, pts: pts(0, 0, 2, 0), reach: 20 }, { id: 1, pts: pts(126, 0, 0, 2), reach: 20 }];
  const joins = [{ x: 126, y: 0, reach: 16, k: 6, members: [0, 1] }];
  const bins = binVeins(tubes, joins), end = segEntries(bins.cells, bins.nCells);
  assert.ok(end > 0);
  for (let c = 0; c < bins.nCells; c++) {
    const s0 = bins.cells[c * 6 + 2], n = bins.cells[c * 6 + 3], j0 = bins.cells[c * 6 + 4], jn = bins.cells[c * 6 + 5];
    assert.ok(s0 + n <= end, 'segments before the joins');
    if (jn) assert.ok(j0 >= end, 'joins after the segments');
  }
  assert.equal(segEntries(null, 0), 0);
});

test('veins-gl: the mesh pass keeps the lobule and software GL on the classic pass, and falls back when its shaders fail', () => {
  assert.match(gl, /mesh: who === 'stage' \? startProgram\(gl, MASK_VS\(N_SAMPLES, ENT_W\), MASK_FS\) : null/);
  assert.match(gl, /if \(software\) return 'software GL';/);
  assert.match(gl, /if \(!vesselMesh\(\)\) return 'off in Settings';/);
  assert.match(gl, /console\.warn\('Veins renderer: the mesh vessel shaders failed; the vessels keep the classic pass\.', e\);/);
  assert.match(gl, /if \(meshed\) return;/);
});
