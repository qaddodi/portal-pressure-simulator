import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binVeins } from '../src/ui/veins-bin.js';

// Where a vein ends on another vessel (the hepatic veins on the IVC) the join carries that vessel as its trunk, so the
// shader's corner test asks only what matters there (the tributary's centreline lies off the trunk's toward the pixel).
// With both tests the fillet was cut off in the last units before the vein's wall, and the IVC's wall, swollen by the
// fillet just above, ended in a spike (the owner's screenshot, 22 Oct).
const line = (x, y, n, dx, dy) => Array.from({ length: n }, (_, i) => [x + i * dx, y + i * dy]);
const scene = (trunk) => ({
  tubes: [
    { id: 0, pts: line(10, 10, 30, 8, 3), reach: 14 },
    { id: 1, pts: line(400, 20, 25, -5, 9), reach: 11 },
  ],
  joins: [{ x: 250, y: 100, reach: 20, k: 0.4, fillet: 1, members: [0, 1], ...(trunk == null ? {} : { trunk }) }],
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

test('the shader reads the quarter as int(row + 0.5), so the vessel is the same one', () => {
  for (const row of [0, 1, 7, 150, 400]) assert.equal(Math.floor(Math.fround(row + 0.25) + 0.5), row);
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
});

test('the figure names a trunk only for a vein ending on another vessel, not on another stretch of its own', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /add\(\[\[it, i\], \[y, null\]\], q, y\.x\.e\.id === it\.x\.e\.id \? undefined : y\.row\)/);
  assert.match(stage, /joins\.push\(\{[^}]*members: g\.members\.map\(\(i\) => rows\[i\]\.row\), trunk \}\)/);
});

test('the shader tests only the tributary-off-trunk side where a trunk is named, and both at a node', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /float corner\(vec2 p, vec2 ga, float da, float ra, vec2 gb, float db, float rb, int role\)/);
  assert.match(gl, /float off = role == 1 \? o1 : role == 2 \? o2 : min\(o1, o2\);/);
  assert.match(gl, /if \(fract\(B\[m\]\) > 0\.1\) tm \|= 1 << s;/);
  // Both callers (the fillet, and the blend of caliber and shading) pass the role of the pair in its join.
  assert.match(gl, /corner\(p, sg\[a\], sd\[a\], sr\[a\], sg\[b\], sd\[b\], sr\[b\], \(jt\[j\] & \(1 << a\)\) != 0 \? 1 : \(jt\[j\] & \(1 << b\)\) != 0 \? 2 : 0\)/);
  assert.match(gl, /corner\(p, sg\[s\], sd\[s\], sr\[s\], sg\[ow\], sd\[ow\], sr\[ow\], role\)/);
});
