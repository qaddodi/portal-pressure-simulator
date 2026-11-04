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

test('the noise table\'s GPU fill hashes as noiseBlock does: the same octaves, seeds and lattice offsets', async () => {
  const { NOISE_FS, createNoiseFiller } = await import('../src/ui/noise-gl.js');
  const { OCTAVES, NOISE_W, NOISE_H, NOISE_PER_ROW } = await import('../src/ui/blood-noise.js');
  for (const o of OCTAVES) {
    assert.match(NOISE_FS, new RegExp(`id \\* ${o.mul}u \\+ ${o.add}u`));
    assert.ok(NOISE_FS.includes(String(o.period)) && NOISE_FS.includes(String(o.rows)));
  }
  for (const k of ['0x7feb352du', '0x846ca68bu', '73856093u', '19349663u', '0xffffffu', '16777216.0', '+ 4096', `/ ${NOISE_W}`, `/ ${NOISE_H}`, `* ${NOISE_PER_ROW}`]) assert.ok(NOISE_FS.includes(k), k);
  // (No float target: no filler, the table is filled in script as before.)
  assert.equal(createNoiseFiller({ isContextLost: () => false, getExtension: () => null }), null);
  assert.equal(createNoiseFiller(null), null);
  assert.match(src('veins-gl.js'), /noiseGPU\.fill\(noiseTex, noiseW, noiseH\)/);
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
