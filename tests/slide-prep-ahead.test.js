// T3, prepare ahead (13 Nov 2026): while a slide is on screen the next two slides and the one before are prepared in the quiet, never while
// anything moves. The slide going in is prepared at once whatever moves; each neighbour waits for calm() and takes its turn after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createSlidePrep } = await import('../src/ui/slide-prep.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(10); };
const steps = (seen = []) => ({ state: (i) => { seen.push(i); return Promise.resolve({}); }, glyphs: () => Promise.resolve(), tool: () => null, shaders: () => 0, shadersFailed: () => 0 });
const readyList = (p, n) => Array.from({ length: n }, (_, i) => (p.ready(i) ? i : -1)).filter((i) => i >= 0);

test('going forward, the slide and the two after it and the one before are prepared; no others', async () => {
  const p = createSlidePrep({ count: () => 9, steps: steps() });
  p.aim(4, 'next');
  await until(() => [3, 4, 5, 6].every((i) => p.ready(i)));
  await sleep(100);
  assert.deepEqual(readyList(p, 9), [3, 4, 5, 6]);
});

test('going back, the slide and the two before it and the one after it', async () => {
  const p = createSlidePrep({ count: () => 9, steps: steps() });
  p.aim(4, 'back');
  await until(() => [2, 3, 4, 5].every((i) => p.ready(i)));
  await sleep(100);
  assert.deepEqual(readyList(p, 9), [2, 3, 4, 5]);
});

test('the ends of the deck are respected', async () => {
  const p = createSlidePrep({ count: () => 3, steps: steps() });
  p.aim(0, 'next');
  await until(() => [0, 1, 2].every((i) => p.ready(i)));
  assert.deepEqual(readyList(p, 3), [0, 1, 2]);
});

test('the slide going in is prepared at once while things move; its neighbours wait for calm and then go', async () => {
  let calm = false;
  const seen = [];
  const p = createSlidePrep({ count: () => 9, steps: steps(seen), calm: () => calm });
  p.aim(4, 'next');
  await until(() => p.ready(4));
  await sleep(400);   // (more than three looks of the wait)
  assert.deepEqual(readyList(p, 9), [4], 'only the slide going in, while something moves');
  assert.deepEqual(seen, [4], 'no step of a neighbour ran in the motion');
  calm = true;
  await until(() => [3, 4, 5, 6].every((i) => p.ready(i)));
  assert.deepEqual(readyList(p, 9), [3, 4, 5, 6]);
});

test('a newer aim ends the older wait: the old neighbours are not prepared when the quiet comes', async () => {
  let calm = false;
  const seen = [];
  const p = createSlidePrep({ count: () => 20, steps: steps(seen), calm: () => calm });
  p.aim(2, 'next');
  await until(() => p.ready(2));
  p.aim(10, 'next');
  await until(() => p.ready(10));
  await sleep(200);
  calm = true;
  await until(() => [9, 10, 11, 12].every((i) => p.ready(i)));
  await sleep(150);
  assert.ok(![3, 4, 1].some((i) => seen.includes(i)), `the first aim's neighbours were left alone: ${seen}`);
  assert.deepEqual(readyList(p, 20).filter((i) => i > 5), [9, 10, 11, 12]);
});

test('a slide further than two away is dropped; the two either side are kept for a turn the other way', async () => {
  const p = createSlidePrep({ count: () => 20, steps: steps() });
  p.aim(4, 'next');
  await until(() => [3, 4, 5, 6].every((i) => p.ready(i)));
  p.aim(5, 'back');
  await until(() => [3, 4, 5, 6].every((i) => p.ready(i)) && p.ready(3));
  assert.ok(p.ready(6), 'the slide two ahead of the old aim stays, it is one behind the new');
  p.aim(9, 'next');
  await until(() => p.ready(9));
  assert.equal(p.ready(4), false, 'the old slide 4 is gone');
});
