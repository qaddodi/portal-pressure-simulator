import { stageSource } from './stage-src.js';
// The first minute after a load (2 Nov 2026, Mohammad: "15-60 seconds of lagginess then it becomes fast"): the start-up jobs that
// ran as long tasks are cheaper, split or off the main thread. Profile them with scripts/cold-load.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.location ??= { search: '' };
const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('a path\'s box is kept by its element: unchanged d is not parsed again, a changed d is', async () => {
  const { elBox } = await import('../src/ui/shape-gl.js');
  let reads = 0, d = 'M0 0 L10 0 L10 5 Z';
  const path = { localName: 'path', children: [], style: {}, hasAttribute: () => false, getAttribute: (k) => (k === 'd' ? (reads++, d) : null) };
  assert.deepEqual(elBox(path), { x: 0, y: 0, width: 10, height: 5 });
  assert.deepEqual(elBox(path), { x: 0, y: 0, width: 10, height: 5 });
  d = 'M0 0 L20 0 L20 8 Z';
  assert.deepEqual(elBox(path), { x: 0, y: 0, width: 20, height: 8 }, 'an eased outline gets its new box');
  assert.ok(reads >= 3);
  // (Many distinct shapes no longer clear the shared table whole: the oldest leave one at a time.)
  for (let i = 0; i < 1000; i++) elBox({ ...path, getAttribute: (k) => (k === 'd' ? `M0 0 L${i + 1} 1` : null) });
  assert.deepEqual(elBox(path), { x: 0, y: 0, width: 20, height: 8 });
  assert.doesNotMatch(src('shape-gl.js'), /BOX_D\.clear\(\)/);
});

test('start-up jobs: one pass over the joins a task, idle-gated; the lobule\'s binning goes to the worker', () => {
  const st = stageSource();
  assert.match(src('vein-joins.js'), /function nearCourse\(pts, q, lim\)/);
  assert.match(src('vein-joins.js'), /nearCourse\(y\.pts, q, y\.obj\.glMaxR \+ 0\.5 \* rq \+ 2 \+ margin\)/);
  assert.match(st, /\(inMotion\(\) \|\| sinceInput\(\) < 700\) && snaps\.length < 2 \* ENV_AT\.length/);
  assert.match(st, /if \(!part\) \{ const items = envItemsAt\(w, sp\); part = /);
  assert.match(st, /const lzBinAway = \(tubes, joins\) => sweepBin\(\{ kind: 'bin', tubes, joins \}\);[\s\S]*binAway: lzBinAway/);
  assert.match(src('sweep-worker.js'), /kind === 'bin' \? binVeins\(tubes, joins\)/);
  const lz = src('lobule-zoom.js');
  assert.match(lz, /\(\) => prebin\(\)\);/);
  assert.match(lz, /if \(binning\) \{ q\.unshift\(first\); return; \}/);
});
