import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAtlasPacker } from '../src/ui/atlas-pack.js';
import { planRepack, stepRepack, reconcileRepack, commitRepack } from '../src/ui/label-repack.js';

const mk = (n, w, h) => {
  const p = createAtlasPacker({ size: 256, pad: 2, maxPages: 2 });
  const live = [];
  for (let i = 0; i < n; i++) live.push({ slot: p.alloc(w, h), ver: 1, id: i });
  return { p, live };
};
const copies = () => { const c = []; return { c, f: (from, to, w, h) => c.push({ from: { page: from.page, x: from.x, y: from.y }, to: { page: to.page, x: to.x, y: to.y }, w, h }) }; };

test('a fragmented atlas is laid out again beside the old one; no label loses its place until the swap', () => {
  const { p, live } = mk(40, 20, 16);
  for (let i = 0; i < 40; i += 2) { p.free(live[i].slot); live[i].slot = null; }   // (every other label gone: holes)
  const alive = live.filter((s) => s.slot), before = alive.map((s) => s.slot);
  const next = createAtlasPacker({ size: 256, pad: 2, maxPages: 2 });
  const rp = planRepack(alive, next);
  assert.ok(rp);
  const { c, f } = copies();
  assert.equal(stepRepack(rp, f, () => 0, 1, 1000), true);
  assert.equal(c.length, alive.length);
  alive.forEach((s, i) => assert.equal(s.slot, before[i], 'still in the old atlas while copying'));
  assert.equal(reconcileRepack(rp, alive, f), true);
  assert.equal(c.length, alive.length, 'nothing changed meanwhile: nothing copied again');
  commitRepack(rp);
  alive.forEach((s) => assert.ok(s.slot.w === 20 && s.slot.h === 16));
  assert.equal(new Set(alive.map((s) => s.slot)).size, alive.length);
});

test('the copy is in bounded steps: the clock decides, at least the minimum goes each time', () => {
  const { live } = mk(30, 20, 16);
  const rp = planRepack(live, createAtlasPacker({ size: 256, pad: 2, maxPages: 2 }));
  const { c, f } = copies();
  let t = 0;
  const clock = () => (t += 1);   // (each look at the clock is a millisecond)
  let steps = 0;
  while (!stepRepack(rp, f, clock, 5, 2)) { steps++; assert.ok(steps < 30); }
  assert.ok(steps >= 2, 'spread over several steps');
  assert.equal(c.length, 30);
});

test('a label painted again, removed or added while the copy ran is put right before the swap', () => {
  const { p, live } = mk(10, 20, 16);
  const next = createAtlasPacker({ size: 256, pad: 2, maxPages: 2 });
  const rp = planRepack(live, next);
  const { c, f } = copies();
  stepRepack(rp, f, () => 0, 1, 1000);
  assert.equal(c.length, 10);
  live[3].ver++;                                  // painted again in its place
  p.free(live[5].slot); live[5].slot = null; const gone = live.splice(5, 1)[0];   // removed
  const fresh = { slot: p.alloc(30, 12), ver: 1 }; live.push(fresh);                // new
  assert.equal(reconcileRepack(rp, live, f), true);
  assert.equal(c.length, 12, 'the painted-again one and the new one copied');
  commitRepack(rp);
  assert.ok(live.every((s) => s.slot && s.slot !== gone.slot));
  assert.equal(new Set(live.map((s) => `${s.slot.page}:${s.slot.x}:${s.slot.y}`)).size, live.length, 'no two labels in one place');
});

test('a plan that will not fit leaves everything as it was (null)', () => {
  const { live } = mk(20, 20, 16);
  const tiny = createAtlasPacker({ size: 32, pad: 2, maxPages: 1 });
  assert.equal(planRepack(live, tiny), null);
  assert.ok(tiny.alloc(20, 16), 'the new packer gave back what it took');
});

// label-gl wiring (source checks, as the other label-gl tests: the layer needs a GL context).
import { readFileSync } from 'node:fs';
const lg = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
test('R12: a full atlas is packed beside the old one on the GPU; no reset, no SVG stand-in, the label keeps its picture', () => {
  assert.doesNotMatch(lg, /function repack\(\)/);
  assert.doesNotMatch(lg, /needRepack = true; st\.mode = 'svg'/);
  assert.match(lg, /gl\.copyTexSubImage2D\(gl\.TEXTURE_2D, 0, to\.x, to\.y, from\.x, from\.y, w, h\)/);
  assert.match(lg, /slot = packer\.alloc\(sw, lay\.h\); if \(slot\) \{ packer\.free\(st\.slot\); st\.slot = slot; \}/);
  assert.match(lg, /needRepack = true; st\.wait = true; retry\.add\(g\);/);
  assert.match(lg, /\(\(pending\.size > 0 && pending\.has\(g\)\) \|\| \(todo\.size > 0 && todo\.has\(g\)\) \|\| \(st\?\.wait && !stuck && st\.rot === rot\)\)/);
  assert.match(lg, /commitRepack\(rp\);/);
});
test('R11: the pass builds in chunks within a time budget, new labels first, and leaves the rest pending (not the SVG)', () => {
  assert.match(lg, /const REBUILD_MS = 4, REBUILD_LEAST = 12;/);
  assert.match(lg, /if \(\(pass === 0\) !== !st\) continue;/);
  assert.match(lg, /if \(did >= REBUILD_LEAST && now >= lookHoldUntil && performance\.now\(\) - now > REBUILD_MS\) \{ over = true; break; \}/);
  assert.match(lg, /if \(over\) for \(const g of todo\.keys\(\)\) pending\.add\(g\);/);
});
