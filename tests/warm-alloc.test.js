import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The warm-frame harness (scripts/warm-alloc.mjs, 2 Nov 2026): the page's frame functions run thousands of times in node and the garbage they
// make once V8 has compiled them is measured, against the limits in scripts/warm-alloc-limits.json. It found drop-front.js turning every
// number array it served into an array of heap numbers once compiled (pressure-time's fine buffers: 5 KB of garbage a frame, a new heap
// number for each value pushed), which the browser profile, running a few frames a second and never compiling anything, could not tell from
// the interpreter's own boxing.
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

test('dropFront keeps an array of numbers an array of numbers', async () => {
  const { dropFront } = await import('../src/ui/drop-front.js');
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
});
