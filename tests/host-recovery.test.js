import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// B12: a terminated engine worker must be replaced by Restart patient, and nothing may wait on it for ever.
async function isolatedHost() {
  const hostURL = new URL('../src/ui/host.js', import.meta.url);
  const source = readFileSync(hostURL, 'utf8').replace(/import\.meta\.url/g, JSON.stringify(hostURL.href))
    .replace(/import\('([^']+)'\)/g, (_, path) => `import('${new URL(path, hostURL).href}')`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('after the worker dies, requests are refused, then Restart makes a replacement that answers', async (t) => {
  const workers = [];
  class FakeWorker {
    constructor() { workers.push(this); this.sent = []; }
    postMessage(m) {
      this.sent.push(m);
      if (m.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
      else if (m.reqId && !this.dead) queueMicrotask(() => this.onmessage?.({ data: { type: 'reply', reqId: m.reqId } }));
    }
    terminate() { this.terminated = true; this.dead = true; }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; });
  const { startHost, host, hostFailed, restartHost } = await isolatedHost();

  assert.equal(await startHost(), 'worker');
  const crashes = [];
  host.on('crash', (m) => crashes.push(m.message));
  assert.equal((await host.request('ping')).type, 'reply');

  // A request is in flight when the worker dies: it is rejected, the old worker is let go, and the page is told.
  workers[0].dead = true;
  const inFlight = host.request('slow');
  workers[0].onerror({ message: 'boom', preventDefault() {} });
  await assert.rejects(inFlight, /boom/);
  assert.equal(hostFailed(), true);
  assert.equal(workers[0].terminated, true);
  assert.equal(crashes.length, 1);
  await assert.rejects(host.request('preset'), /not running/, 'a failed host refuses at once, it does not wait');
  const sentBefore = workers[0].sent.length;
  host.send({ type: 'run', running: true });
  assert.equal(workers[0].sent.length, sentBefore, 'nothing is posted to the dead worker');

  // Restart patient: a replacement worker, the same subscriptions, and requests answer again.
  assert.equal(await restartHost(), 'worker');
  assert.equal(workers.length, 2);
  assert.equal(hostFailed(), false);
  assert.equal((await host.request('preset', { id: 'healthy' })).type, 'reply');
  assert.equal(workers[1].sent.at(-1).type, 'preset');
});

test('a request the engine never answers is rejected after REQUEST_WAIT', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  class MuteWorker {
    postMessage(m) { if (m.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); }
    terminate() {}
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: MuteWorker });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; });
  const { startHost, host, REQUEST_WAIT } = await isolatedHost();
  await startHost();
  const waiting = host.request('preset');
  t.mock.timers.tick(REQUEST_WAIT);
  await assert.rejects(waiting, /did not answer/);
});

test('Restart patient restarts a failed host before loading the patient', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(hostFailed\(\)\) \{[\s\S]{0,300}await restartHost\(\)[\s\S]*?await loadPreset\(id\)/);
});
