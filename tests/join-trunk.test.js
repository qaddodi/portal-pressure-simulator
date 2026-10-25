import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binVeins } from '../src/ui/veins-bin.js';

// Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk, so the
// shader's corner test asks only what matters there (the tributary's centreline lies off the trunk's toward the pixel).
// With both tests the fillet was cut off in the last units before the vein's wall, and the IVC's wall, swollen by the
// fillet just above, ended in a spike (the owner's screenshot, 22 Oct).
// At a fork the trunk is the vessel that runs on through the node (the cava above the heart, where the azygos arch ends on it):
// its entry carries three eighths, not a quarter, so the shader also reads the nearer of the trunk's two stretches there and
// eases the corner's edge over a wider band (the fillet came in saw-teeth along the arch, as it read the arch's own nearest
// segment, which turns at each of its short segments).
const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const scene = (trunk, fork) => ({
  tubes: [
    { id: 0, pts: line(10, 10, 30, 8, 3), reach: 14 },
    { id: 1, pts: line(400, 20, 25, -5, 9), reach: 11 },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 1, members: [0, 1], ...(trunk == null ? {} : { trunk }), ...(fork ? { fork } : {}) }],
});

test('a join writes its trunk as a quarter added to that member\'s row, and no other float differs', () => {
  const plain = binVeins(scene().tubes, scene().joins);
  for (const trunk of [0, 1]) {
    const t = binVeins(scene(trunk).tubes, scene(trunk).joins);
    const diff = [];
    for (let i = 0; i < plain.ent.length; i++) if (!Object.is(plain.ent[i], t.ent[i])) diff.push([i, plain.ent[i], t.ent[i]]);
    assert.ok(diff.length >= 1, 'the trunk is written into the join entries');
    for (const [, was, now] of diff) assert.equal(now, was + 0.25, 'only the trunk member gains its quarter');
    assert.ok(diff.every(([, was]) => was === trunk), 'on the trunk member alone');
  }
});

test('a fork\'s trunk gets three eighths instead, still only on that member', () => {
  const plain = binVeins(scene().tubes, scene().joins);
  for (const trunk of [0, 1]) {
    const t = binVeins(scene(trunk, true).tubes, scene(trunk, true).joins);
    const diff = [];
    for (let i = 0; i < plain.ent.length; i++) if (!Object.is(plain.ent[i], t.ent[i])) diff.push([plain.ent[i], t.ent[i]]);
    assert.ok(diff.length >= 1);
    for (const [was, now] of diff) { assert.equal(now, was + 0.375); assert.equal(was, trunk); }
  }
});

test('the shader reads either fraction as int(row + 0.5), so the vessel is the same one, and tells them apart by 0.1 and 0.3', () => {
  for (const row of [0, 1, 7, 150, 400, 4000]) for (const f of [0.25, 0.375]) {
    const v = Math.fround(row + f);
    assert.equal(Math.floor(v + 0.5), row);
    assert.ok(v - Math.floor(v) > 0.1);
    assert.equal(v - Math.floor(v) > 0.3, f === 0.375);
  }
});

test('a join whose trunk changed is binned again, entry for entry what a fresh binning gives', () => {
  const memo = new Map();
  const a = binVeins(scene().tubes, scene().joins, memo);
  assert.equal(binVeins(scene().tubes, scene().joins, memo), a, 'nothing changed: the same result');
  const b = binVeins(scene(1).tubes, scene(1).joins, memo);
  assert.notEqual(b, a, 'a trunk set: a new result, so the figure uploads it');
  assert.deepEqual(Array.from(b.ent), Array.from(binVeins(scene(1).tubes, scene(1).joins).ent));
  const c = binVeins(scene(0).tubes, scene(0).joins, memo);
  assert.notEqual(c, b, 'another trunk: a new result');
  assert.deepEqual(Array.from(c.ent), Array.from(binVeins(scene(0).tubes, scene(0).joins).ent));
  const d = binVeins(scene(0, true).tubes, scene(0, true).joins, memo);
  assert.notEqual(d, c, 'the same trunk now at a fork: a new result');
  assert.deepEqual(Array.from(d.ent), Array.from(binVeins(scene(0, true).tubes, scene(0, true).joins).ent));
});

test('the figure names a trunk only for a vein ending on another vessel, not on another stretch of its own', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /add\(\[\[it, i\], \[y, null\]\], q, y\.x\.e\.id === it\.x\.e\.id \? undefined : y\.row\)/);
  assert.match(stage, /joins\.push\(\{[^}]*members: g\.members\.map\(\(i\) => rows\[i\]\.row\), trunk: g\.trunk != null \? rows\[g\.trunk\]\.row : trunk, fork: g\.trunk != null \}\)/);
});

test('the shader tests only the tributary-off-trunk side where a trunk is named, and both at a node', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /float corner\(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role, float kw\)/);
  assert.match(gl, /smoothstep\(0\.25 \* rm, 0\.25 \* rm \+ max\(0\.35 \* rm, 0\.9 \* kw\), off\)/);
  assert.match(gl, /float off = role == 1 \? o1 : role == 2 \? o2 : min\(o1, o2\);/);
  assert.match(gl, /if \(fract\(B\[m\]\) > 0\.1\) \{ tm \|= 1 << s; if \(fract\(B\[m\]\) > 0\.3\) tfm \|= 1 << s; \}/);
  // Both callers (the fillet, and the blend of caliber and shading) pass the role of the pair in its join.
  assert.match(gl, /int ro = \(jt\[j\] & \(1 << a\)\) != 0 \? 1 : \(jt\[j\] & \(1 << b\)\) != 0 \? 2 : 0;/);
  assert.match(gl, /corner\(p, sg\[ta\], sd\[ta\], sr\[ta\], sg\[tb\], sd\[tb\], sr\[tb\], ro, kw\)/);
  assert.match(gl, /corner\(p, sg\[ts\], sd\[ts\], sr\[ts\], sg\[to\], sd\[to\], sr\[to\], role, kw\)/);
  // The nearer of a fork trunk's two stretches stands in for it (only where the entry marks a fork's trunk).
  assert.match(gl, /int ta = fa \? tn\[a\] : a, tb = fb \? tn\[b\] : b;/);
});
