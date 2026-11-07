// Review findings B17, B18, B19 (2 Nov 2026): a slide's readiness belongs to the GL context generation; the slides beside the one
// landing are prepared after the landing; a preparation step that throws or rejects ends failed, never "preparing" and never a success.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const keepUp = setInterval(() => {}, 1000);
after(() => clearInterval(keepUp));
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 2000) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await sleep(5); };
const prepUrl = new URL('../src/ui/slide-prep.js', import.meta.url);
const { createSlidePrep } = await import(prepUrl.href);
const spec = /from '(\.\/prep-budget\.js[^']*)'/.exec(readFileSync(prepUrl, 'utf8'))[1];
const { prepJob, prepReset, prepStats } = await import(new URL(spec, prepUrl).href);
const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const ok = { state: () => Promise.resolve({}), glyphs: () => Promise.resolve({}), tool: () => {}, shaders: () => 0 };

// ── B17 ──
test('B17: a slide ready in one GL context generation is not ready in the next, and is prepared afresh', async () => {
  prepReset();
  let epoch = 1;
  const calls = [];
  const prep = createSlidePrep({ count: () => 6, identity: () => `deck|${epoch}`, steps: { ...ok, state: (i) => { calls.push(i); return Promise.resolve({}); } } });
  prep.aim(2, 'next');
  await until(() => prep.ready(2) && prep.ready(3));
  assert.equal(prep.ready(2), true);
  epoch = 2;   // (a context lost and restored: only the generation moved)
  assert.equal(prep.ready(2), false, 'the old generation\'s readiness is not trusted');
  assert.equal(prep.state(2), 'unprepared');
  const before = calls.length;
  prep.refresh();
  await until(() => prep.ready(2));
  assert.equal(prep.ready(2), true, 'prepared again against the new generation');
  assert.ok(calls.length > before, 'its steps ran again');
});

test('B17: a job running when the generation moves stops, and refresh() leaves nothing prepared against the old one', async () => {
  prepReset();
  let epoch = 1, release;
  const prep = createSlidePrep({ count: () => 6, identity: () => `d|${epoch}`, steps: { ...ok, state: () => new Promise((r) => { release = () => r({}); }) } });
  prep.aim(1, 'next');
  await until(() => !!release);
  epoch = 2;
  release();
  await sleep(40);
  assert.equal(prep.ready(1), false);
  assert.equal(prep.manifest(1), null);
});

test('B17: the presenter\'s identity carries the GL epoch and a restore refreshes the preparation', () => {
  assert.match(PZ, /identity: \(\) => `\$\{deck\?\.id \?\? ''\}[^`]*\$\{glEpoch\(\)\}`/);
  assert.match(PZ, /onGLRestored\(\(\) => slidePrep\.refresh\(\)\)/);
  const gs = readFileSync(new URL('../src/ui/gl-state.js', import.meta.url), 'utf8');
  assert.match(gs, /r\.gen\+\+; epoch\+\+;/, 'a loss and a restore both advance the epoch');
  assert.match(gs, /webglcontextrestored[^\n]*epochFns/);
});

// ── B18 ──
test('B18: the change landing (its alive turning false) does not cancel the neighbours\' preparation', async () => {
  prepReset();
  const log = [];
  let landed = false, release;
  const gate = new Promise((r) => { release = r; });
  const prep = createSlidePrep({ count: () => 8, steps: { ...ok, state: (i) => { log.push(i); return i === 4 ? gate.then(() => ({})) : Promise.resolve({}); } } });
  prep.aim(3, 'next', () => !landed);
  await until(() => prep.ready(3));
  await until(() => log.includes(4));
  landed = true;   // (the current slide has landed; slide 4's state is still pending)
  release();
  await until(() => prep.ready(4));
  assert.equal(prep.ready(4), true, 'ready without another Next');
  await until(() => prep.ready(2));
  assert.equal(prep.ready(2), true, 'the one behind too');
});

test('B18: a newer aim still stops the older neighbours', async () => {
  prepReset();
  const log = [];
  let release;
  const prep = createSlidePrep({ count: () => 12, steps: { ...ok, state: (i) => { log.push(i); return i === 4 ? new Promise((r) => { release = () => r({}); }) : Promise.resolve({}); } } });
  prep.aim(3, 'next');
  await until(() => log.includes(4));
  prep.aim(9, 'jump');
  release();
  await until(() => prep.ready(9));
  assert.equal(prep.manifest(4), null);
  assert.ok(!log.includes(5), 'the old direction goes no further');
});

// ── B19 ──
test('B19: a step that throws before it returns a promise, and one that rejects, end failed, not preparing and not done', async () => {
  prepReset();
  for (const [name, steps] of [
    ['sync state', { ...ok, state: () => { throw new Error('boom'); } }],
    ['sync glyphs', { ...ok, glyphs: () => { throw new Error('boom'); } }],
    ['rejecting state', { ...ok, state: () => Promise.reject(new Error('no')) }],
    ['rejecting tool', { ...ok, tool: () => Promise.reject(new Error('no')) }],
    ['sync tool', { ...ok, tool: () => { throw new Error('boom'); } }],
    ['sync shaders', { ...ok, shaders: () => { throw new Error('boom'); } }],
  ]) {
    const prep = createSlidePrep({ count: () => 3, steps });
    prep.aim(1, 'next');
    await until(() => prep.state(1) === 'failed');
    assert.equal(prep.state(1), 'failed', name);
    assert.equal(prep.ready(1), false, name);
    await sleep(30);
    assert.ok(prep.stats().done === 0, `${name}: not counted as a completed job`);
    assert.ok(prep.stats().failed >= 1, name);
    assert.ok(!['preparing'].includes(prep.state(1)), name);
    prep.cancel();
  }
});

test('B19: a shader step that never publishes ends failed after its tries, and the next aim tries the slide afresh', async () => {
  prepReset();
  let waiting = true;
  const prep = createSlidePrep({ count: () => 3, steps: { ...ok, shaders: () => (waiting ? 1 : 0) } });
  prep.aim(1, 'next');
  await until(() => prep.state(1) === 'failed', 5000);
  assert.equal(prep.state(1), 'failed');
  waiting = false;
  prep.aim(1, 'next');
  await until(() => prep.ready(1));
  assert.equal(prep.ready(1), true);
});

test('B19: a failing slide does not stop the next slide\'s preparation', async () => {
  prepReset();
  const prep = createSlidePrep({ count: () => 6, steps: { ...ok, state: (i) => { if (i === 2) throw new Error('boom'); return Promise.resolve({}); } } });
  prep.aim(2, 'next');
  await until(() => prep.ready(3));
  assert.equal(prep.state(2), 'failed');
  assert.equal(prep.ready(3), true);
});

test('B19: prepJob fails on a throwing or rejecting step: iterator closed, onFail told once, done false, nothing queued', async () => {
  prepReset();
  for (const bad of [() => { throw new Error('x'); }, () => Promise.reject(new Error('x'))]) {
    const ran = [];
    let closed = false, told = 0;
    function* steps() { try { yield () => ran.push('a'); yield bad; yield () => ran.push('never'); } finally { closed = true; } }
    const j = prepJob('t-fail', steps(), { onFail: () => told++ });
    assert.equal(await j.done, false);
    assert.deepEqual(ran, ['a']);
    assert.equal(closed, true, 'the generator\'s cleanup ran');
    assert.equal(told, 1);
    assert.ok(j.error() instanceof Error);
    assert.equal(prepStats().queued, 0);
  }
  assert.equal(prepStats().failed, 2);
});
