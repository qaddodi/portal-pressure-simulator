import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The warm-frame harness (scripts/warm-alloc.mjs, 2 Nov 2026): the page's frame functions run thousands of times in node and the garbage they
// make once V8 has compiled them is measured, against the limits in scripts/warm-alloc-limits.json. The browser profile runs a few frames a
// second and never compiles anything, so it cannot tell this from the interpreter's own boxing. Each case runs in a process whose young
// generation is sized so that nothing is collected over the measure (a collection frees the garbage being counted: the first version of the
// harness let scavenges run and read low, and passed a copyWithin in drop-front.js that made a heap number for every item it moved, 3 Nov 2026).
test('the frame functions make no more garbage, compiled, than their limits', () => {
  const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=128', new URL('../scripts/warm-alloc.mjs', import.meta.url).pathname, '--json'], { encoding: 'utf8', timeout: 180000 });
  assert.ok(r.stdout, `the harness printed nothing: ${r.stderr}`);
  const results = JSON.parse(r.stdout.trim().split('\n').pop());
  const limits = JSON.parse(readFileSync(new URL('../scripts/warm-alloc-limits.json', import.meta.url), 'utf8'));
  assert.deepEqual(results.map((x) => x.name).sort(), Object.keys(limits).sort(), 'every case has a limit and every limit a case');
  for (const x of results) {
    assert.ok(!x.error, `${x.name}: ${x.error}`);
    assert.ok(x.bytes <= limits[x.name], `${x.name}: ${x.bytes} B a frame, over its limit of ${limits[x.name]}`);
  }
});

test('dropFront and dropFrontNums drop the first items in place', async () => {
  const { dropFront, dropFrontNums } = await import('../src/ui/drop-front.js');
  // (Served by number arrays and by arrays of objects alike, compiled with both: the case that turned the numbers into heap numbers.)
  const nums = [], objs = [], ref = [];
  for (let round = 0; round < 3000; round++) {
    for (let i = 0; i < 40; i++) { nums.push(i + round * 0.001); objs.push({ i }); ref.push(i + round * 0.001); }
    dropFront(nums, 30); dropFront(objs, 30); ref.splice(0, 30);
  }
  assert.deepEqual(nums, ref);
  assert.equal(objs.length, ref.length);
  assert.deepEqual(dropFront([1, 2, 3], 5), []);
  assert.deepEqual(dropFront([1, 2, 3], 0), [1, 2, 3]);
  assert.deepEqual(dropFront([1, 2, 3, 4], 2), [3, 4]);
  assert.deepEqual(dropFrontNums([1, 2, 3, 4], 2), [3, 4]);
  assert.deepEqual(dropFrontNums([1, 2, 3], 5), []);
  assert.deepEqual(dropFrontNums([1, 2, 3], 0), [1, 2, 3]);
  const a = [], b = [];
  for (let round = 0; round < 500; round++) { for (let i = 0; i < 40; i++) { a.push(i * 0.5 + round); b.push(i * 0.5 + round); } dropFrontNums(a, 30); b.splice(0, 30); }
  assert.deepEqual(a, b);
});
