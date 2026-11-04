import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathCmds, flattenCmds, flattenPath, newCmds, cmdsReset, cmdM, cmdL, cmdQ, cmdZ, cmdsToArrays } from '../src/ui/shape-gl.js';
import { ORGANS } from '../src/ui/anatomy.js';

// A path's commands (pathCmds) are the form the app hands its own shapes to the GPU painter in (the liver: stage.js morphLiver),
// so a shape cut from them must be the one its text gives: flattenPath is pathCmds then flattenCmds.
const same = (a, b) => JSON.stringify(a.map((q) => [...q.pts, q.closed])) === JSON.stringify(b.map((q) => [...q.pts, q.closed]));

test('every command form comes out absolute, in six forms', () => {
  assert.deepEqual(cmdsToArrays(pathCmds('M1 2 h3 v4 H0 V1 l1 1 2 2 z')), [['M', 1, 2], ['L', 4, 2], ['L', 4, 6], ['L', 0, 6], ['L', 0, 1], ['L', 1, 2], ['L', 3, 4], ['Z']]);
  assert.deepEqual(cmdsToArrays(pathCmds('M0 0 C1 1 2 1 3 0 S5 -1 6 0')), [['M', 0, 0], ['C', 1, 1, 2, 1, 3, 0], ['C', 4, -1, 5, -1, 6, 0]]);
  assert.deepEqual(cmdsToArrays(pathCmds('M0 0 Q1 2 2 0 T4 0')), [['M', 0, 0], ['Q', 1, 2, 2, 0], ['Q', 3, -2, 4, 0]]);
  assert.deepEqual(cmdsToArrays(pathCmds('M0 0 a2 3 30 1 0 4 4')), [['M', 0, 0], ['A', 2, 3, 30, 1, 0, 4, 4]]);
  assert.deepEqual(cmdsToArrays(pathCmds('M0 0 L1 1 Z 5 5')), [['M', 0, 0], ['L', 1, 1], ['Z']], 'stray numbers after a Z are skipped');
});

test("a path cut from its commands is the path cut from its text, for every organ's outline", () => {
  const src = readFileSync(new URL('../src/ui/anatomy.js', import.meta.url), 'utf8');
  const ds = [...ORGANS.map((o) => o.d).filter(Boolean), ...[...src.matchAll(/'(M[^']{6,})'/g)].map((m) => m[1])];
  assert.ok(ds.length > 40);
  for (const d of ds) for (const tol of [0.5, 0.125, 0.01]) assert.ok(same(flattenCmds(pathCmds(d), tol), flattenPath(d, tol)), d.slice(0, 40));
});

test("the liver's outline and nodules are handed to the painter as the numbers their text says", () => {
  const stage = stageSource();
  assert.match(stage, /cmds = cmdsReset\(liverMorphCmds\);\n\s+for \(let i = 0; i < xy\.length; i\+\+\) \(i \? cmdL : cmdM\)\(cmds, \+xy\[i\]\[0\], \+xy\[i\]\[1\]\);\n\s+cmdZ\(cmds\);/);
  assert.match(stage, /d = 'M' \+ xy\.map\(\(\[x, y\]\) => `\$\{x\} \$\{y\}`\)\.join\(' L'\) \+ ' Z';/);
  assert.match(stage, /for \(const el of liverPaths\) \{ el\.setAttribute\('d', d\); bindShape\(el, src\); \}/);
  assert.match(stage, /d \+= `Q\$\{qx\} \$\{qy\} \$\{mx\} \$\{my\}`;\n\s+cmdQ\(cmds, \+qx, \+qy, \+mx, \+my\);/);
  assert.match(stage, /lv\.nod\.setAttribute\('d', nod\); bindShape\(lv\.nod, reshape\(nodSrc, nod, nodCmds\)\);/);
  // The numbers parse back from the text exactly (each is the number its digits say), so the shape is the text's to the bit.
  const xy = [[123.45, 67.891], [0.05, 9.95], [1000.25, 3.14159]].map(([x, y]) => [x.toFixed(1), y.toFixed(1)]);
  const d = 'M' + xy.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z';
  assert.deepEqual(cmdsToArrays(pathCmds(d)), [...xy.map(([x, y], i) => [i ? 'L' : 'M', +x, +y]), ['Z']]);
});

test('a command buffer is written in place: the same arrays for every shape, grown only past any earlier one, and cut the same as the parse', () => {
  const c = newCmds(), op0 = c.op, v0 = c.v;
  cmdsReset(c); cmdM(c, 0, 0); cmdL(c, 4, 0); cmdQ(c, 5, 2, 4, 4); cmdL(c, 0, 4); cmdZ(c);
  assert.equal(c.op, op0); assert.equal(c.v, v0, 'a short shape fits the first arrays');
  assert.deepEqual(cmdsToArrays(c), [['M', 0, 0], ['L', 4, 0], ['Q', 5, 2, 4, 4], ['L', 0, 4], ['Z']]);
  assert.ok(same(flattenCmds(c, 0.05), flattenPath('M0 0 L4 0 Q5 2 4 4 L0 4 Z', 0.05)));
  cmdsReset(c);
  for (let i = 0; i < 500; i++) (i ? cmdL : cmdM)(c, i, i % 7);
  cmdZ(c);
  assert.equal(c.n, 501); assert.equal(c.nv, 1000);
  assert.ok(c.op.length >= 501 && c.v.length >= 1000, 'grown past 500 points');
  const grownOp = c.op;
  cmdsReset(c); cmdM(c, 1, 1); cmdL(c, 2, 2);
  assert.equal(c.op, grownOp, 'kept once grown, never shrunk');
  // pathCmds writes into a buffer of the caller's, and flattenPath reads through one of its own
  const into = newCmds();
  assert.equal(pathCmds('M1 1 L2 2', into), into);
  assert.deepEqual(cmdsToArrays(into), [['M', 1, 1], ['L', 2, 2]]);
  assert.equal(pathCmds('M3 3', into), into); assert.deepEqual(cmdsToArrays(into), [['M', 3, 3]], 'written again, not appended');
});
