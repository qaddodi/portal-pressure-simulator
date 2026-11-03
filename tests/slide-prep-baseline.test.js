// R04: the shader-failure baseline is taken before the eager shader call, and a required state that settles with nothing is not ready.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createSlidePrep } = await import('../src/ui/slide-prep.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 1500) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(10); };
const ok = { state: () => Promise.resolve({}), glyphs: () => Promise.resolve(), tool: () => null, shaders: () => 0 };

test('one failure during the eager shader call, then empty waiting sets, fails the slide', async () => {
  let failed = 0, calls = 0;
  const shaders = () => { if (calls++ === 0) failed++; return 0; };   // (only the eager call fails)
  const p = createSlidePrep({ count: () => 3, steps: { ...ok, shaders, shadersFailed: () => failed } });
  p.aim(1, 'next');
  await until(() => p.state(1) === 'failed' || p.ready(1));
  assert.equal(p.state(1), 'failed');
  assert.equal(p.ready(1), false);
});

test('a required state that settles with nothing is not ready, and the next aim tries afresh', async () => {
  for (const none of [null, undefined]) {
    let calls = 0;
    const p = createSlidePrep({ count: () => 3, steps: { ...ok, state: () => (calls++ ? Promise.resolve({}) : Promise.resolve(none)) } });
    p.aim(1, 'next');
    await until(() => p.state(1) === 'failed');
    assert.equal(p.state(1), 'failed');
    assert.equal(p.ready(1), false);
    p.aim(1, 'next');
    await until(() => p.ready(1));
    assert.equal(p.ready(1), true);
  }
});

test('a tool warm that settles with nothing is still ready (no work)', async () => {
  const p = createSlidePrep({ count: () => 3, steps: { ...ok, tool: () => Promise.resolve(null) } });
  p.aim(1, 'next');
  await until(() => p.ready(1));
  assert.equal(p.ready(1), true);
});

test('the healthy path still prepares the neighbours', async () => {
  const p = createSlidePrep({ count: () => 3, steps: { ...ok, shadersFailed: () => 0 } });
  p.aim(1, 'next');
  await until(() => p.ready(0) && p.ready(1) && p.ready(2));
  assert.deepEqual([p.ready(0), p.ready(1), p.ready(2)], [true, true, true]);
});
