// B16 (bugs-recs, 2 Nov 2026): a required tool or shader that fails never makes a manifest ready.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createSlidePrep } = await import('../src/ui/slide-prep.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 1500) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(10); };
const ok = { state: () => Promise.resolve({}), glyphs: () => Promise.resolve(), tool: () => null, shaders: () => 0 };

test('a tool that throws, or rejects, ends failed, not ready', async () => {
  for (const tool of [() => { throw new Error('x'); }, () => Promise.reject(new Error('x'))]) {
    const p = createSlidePrep({ count: () => 3, steps: { ...ok, tool } });
    p.aim(1, 'next');
    await until(() => p.state(1) === 'failed');
    assert.equal(p.state(1), 'failed');
    assert.equal(p.ready(1), false);
  }
});

test('a shader publication that failed is not proof of readiness although the waiting set is empty', async () => {
  let failed = 0;
  const p = createSlidePrep({ count: () => 3, steps: { ...ok, shaders: () => { failed++; return 0; }, shadersFailed: () => failed } });
  p.aim(1, 'next');
  await until(() => p.state(1) !== 'preparing' && p.state(1) !== 'unprepared');
  assert.equal(p.state(1), 'failed');
  const q = createSlidePrep({ count: () => 3, steps: { ...ok, shaders: () => { throw new Error('x'); } } });
  q.aim(1, 'next');
  await until(() => q.state(1) === 'failed');
  assert.equal(q.state(1), 'failed');
  const g = createSlidePrep({ count: () => 3, steps: { ...ok, shadersFailed: () => 0 } });
  g.aim(1, 'next');
  await until(() => g.ready(1));
  assert.equal(g.ready(1), true, 'the healthy path still reaches ready');
});

test('a state or glyph step that throws synchronously marks the manifest failed', async () => {
  const p = createSlidePrep({ count: () => 3, steps: { ...ok, state: () => { throw new Error('x'); } } });
  p.aim(1, 'next');
  await until(() => p.state(1) === 'failed');
  assert.equal(p.state(1), 'failed');
});
