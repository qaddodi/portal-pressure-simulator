import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { detectEvents } from '../src/engine/events.js';

test('paused and hidden engines are idle, but mutations and resume publish immediately', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const messages = [];
  const core = createCore((m) => messages.push(structuredClone(m)));
  t.after(() => core.dispose());
  const advance = (ms) => { now += ms; t.mock.timers.tick(ms); };
  const frames = () => messages.filter((m) => m.type === 'frame');

  core.handle({ type: 'init' });
  core.handle({ type: 'run', running: false });
  const paused = core.engine().t;
  const count = frames().length;
  advance(1000);
  assert.equal(core.engine().t, paused);
  assert.equal(frames().length, count, 'pause must not send periodic frames');

  core.handle({ type: 'setParams', params: { cirrhosis: 0.5 }, settle: true });
  assert.equal(frames().length, count + 1);
  assert.equal(frames().at(-1).changed, true);
  assert.equal(frames().at(-1).params, undefined, 'do not echo UI parameters');
  core.handle({ type: 'snapshot', reqId: 1 });
  assert.equal(frames().length, count + 1, 'queries must not repaint');

  core.handle({ type: 'run', running: true });
  advance(33);
  advance(99);
  assert.ok(core.engine().t > paused);
  core.handle({ type: 'visibility', visible: false });
  const hiddenTime = core.engine().t, hiddenCount = frames().length;
  advance(1000);
  assert.equal(core.engine().t, hiddenTime);
  assert.equal(frames().length, hiddenCount);
  core.handle({ type: 'visibility', visible: true });
  assert.equal(frames().length, hiddenCount + 1);
  advance(33);
  assert.equal(core.engine().t, hiddenTime, 'resume does not integrate hidden wall time');
  advance(33);
  assert.ok(core.engine().t > hiddenTime);
});

test('worker timeout terminates and disconnects the worker before main-thread fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.mock.method(console, 'warn', () => {});
  let worker;
  class SlowWorker {
    constructor() { worker = this; }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: SlowWorker });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; });
  // Resolve the module's relative URLs for an isolated host instance.
  const hostURL = new URL('../src/ui/host.js', import.meta.url);
  const source = readFileSync(hostURL, 'utf8').replace(/import\.meta\.url/g, JSON.stringify(hostURL.href))
    .replace(/import\('([^']+)'\)/g, (_, path) => `import('${new URL(path, hostURL).href}')`);
  const { startHost } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const ready = startHost();
  t.mock.timers.tick(4000);
  assert.equal(await ready, 'main');
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
  assert.equal(worker.onerror, null);
});

test('long jobs yield to the event loop and queued snapshots see the completed state', async (t) => {
  const messages = [];
  const core = createCore((m) => messages.push(structuredClone(m)));
  t.after(() => core.dispose());
  await core.handle({ type: 'run', running: false });
  const reference = new Engine();
  reference.loadPreset('cirr-decomp');
  // Mirror the host's frame reads, including event hysteresis and the derived
  // diameter cache, so the complete snapshots can be compared exactly.
  const referenceFrame = () => {
    detectEvents(reference);
    for (const edge of reference.edges) reference.diameter(edge.id);
    return reference.snapshot();
  };
  let yielded = false;
  const heartbeat = setTimeout(() => { yielded = true; }, 0);
  const loading = core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 10 });
  const snapshot = core.handle({ type: 'snapshot', reqId: 11 });
  await Promise.all([loading, snapshot]);
  clearTimeout(heartbeat);
  assert.equal(yielded, true, 'long preset preparation must let other tasks run');
  assert.deepEqual(messages.find((m) => m.reqId === 11).snap, referenceFrame());
  assert.ok(messages.findIndex((m) => m.reqId === 10) < messages.findIndex((m) => m.reqId === 11));

  // Match the existing host's 30-day chunk boundaries, including its final settle.
  reference.advanceDays(30);
  await core.handle({ type: 'advance', days: 30 });
  assert.deepEqual(core.engine().snapshot(), referenceFrame());
  for (let seconds = 0; seconds < 2; seconds += 0.1) reference.step(0.1);
  await core.handle({ type: 'preroll', seconds: 2, reqId: 12 });
  assert.deepEqual(core.engine().snapshot(), referenceFrame());
});
