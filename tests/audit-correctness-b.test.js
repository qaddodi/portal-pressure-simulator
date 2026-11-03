// Third-pass audit, correctness bugs B1-B9 (docs/glitch-audit.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeParams, defaultParams } from '../src/engine/scenario.js';
import { store } from '../src/ui/store.js';

const read = (p) => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');
const main = read('main.js');
async function isolatedHost() {
  const hostURL = new URL('../src/ui/host.js', import.meta.url);
  const source = readFileSync(hostURL, 'utf8').replace(/import\.meta\.url/g, JSON.stringify(hostURL.href))
    .replace(/import\('([^']+)'\)/g, (_, path) => `import('${new URL(path, hostURL).href}')`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`);
}

// ── B1, B2: a load that was replaced or failed applies and announces nothing ──
test('B1/B2: loadPreset says whether it applied; a link, "Restarted" and a patient toast wait for that', () => {
  const lp = main.slice(main.indexOf('async function loadPreset('), main.indexOf('function encodeShare'));
  assert.match(lp, /catch \{.*return false;/, 'a failed load answers false');
  assert.match(lp, /if \(gen !== presetGen\) return false;/, 'a replaced load answers false');
  assert.match(lp, /return true;\s*\/\/[^\n]*\n\}/, 'an applied load answers true');
  const ls = main.slice(main.indexOf('async function loadShared('), main.indexOf('// The orange PREVIEW pill'));
  assert.ok(ls.indexOf('if (!(await loadPreset(s.preset))) return false;') > 0 && ls.indexOf('if (!(await loadPreset(s.preset)))') < ls.indexOf('s.params'), 'the link stops before its settings when its patient did not load');
  const rs = main.slice(main.indexOf('async function restartPatient('), main.indexOf('function resetEverything'));
  assert.ok(rs.indexOf('if (!(await loadPreset(id))) return;') < rs.indexOf('toast(`Restarted'), 'no Restarted toast for a load that did not apply');
  assert.match(main, /if \(await loadPreset\(id\)\) toast\(store\.get\(\)\.presetList/, 'the palette toasts the patient only when it loaded');
});

// ── B3: sends during a restart are kept and told in order ──
function fakeWorkerClass(workers, sentOf) {
  return class FakeWorker {
    constructor() { workers.push(this); this.sent = []; sentOf?.(this); }
    postMessage(m) {
      this.sent.push(m);
      if (m.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
    }
    terminate() { this.dead = true; }
  };
}
test('B3: messages sent while the engine restarts reach the new engine in order', async (t) => {
  const workers = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: fakeWorkerClass(workers) });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; });
  const { startHost, host, restartHost } = await isolatedHost();
  await startHost();
  workers[0].onerror({ message: 'boom', preventDefault() {} });
  const restarting = restartHost();   // (impl is empty until the new worker answers)
  host.send({ type: 'run', speed: 2 });
  host.send({ type: 'probe', id: 'SV' });
  await restarting;
  assert.deepEqual(workers[1].sent.map((m) => m.type), ['init', 'run', 'probe'], 'told after init, in order');
  assert.equal(workers[1].sent[2].id, 'SV');
  assert.match(main, /if \(s\.frame\?\.probe\) host\.send\(\{ type: 'probe', id: s\.frame\.probe \}\)/, 'restartPatient tells the probe vessel again');
});

// ── B5: no worker: an engine error is a crash, not an exception in the sender ──
test('B5: on the main-thread fallback an engine error is reported as a crash and not thrown at the sender', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: class { constructor() { throw new Error('no worker here'); } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; });
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });   // (the fallback engine's clock does not run, and keeps nothing alive)
  const warn = console.warn; console.warn = () => {}; t.after(() => { console.warn = warn; });
  const { startHost, host, hostFailed } = await isolatedHost();
  assert.equal(await startHost(), 'main');
  const crashes = [];
  host.on('crash', (m) => crashes.push(m.message));
  assert.doesNotThrow(() => host.send({ type: 'params', onFail() {} }), 'the sender is not thrown at (a message the engine cannot take)');
  assert.equal(crashes.length, 1, 'the page is told');
  assert.equal(hostFailed(), true, 'the crash card can offer Restart');
});

// ── B4: a snapshot that fails is marked and shown ──
test('B4: a failed timeline snapshot marks the entry and the History row says it cannot be gone back to', () => {
  const tl = read('timeline.js');
  const s = tl.slice(tl.indexOf('async function snapInto('), tl.indexOf('function truncateFuture'));
  assert.match(s, /try \{ \(\{ snap \} = await host\.request\('snapshot'\)\); \} catch \{ snap = null; \}/);
  assert.match(s, /e\.snapFailed = true/);
  assert.match(tl, /e\.snapFailed && !e\.snap \? h\('div', \{ class: 'tl-pop-d tl-nogo' \}, 'Can’t go back here/);
});

// ── B6: a link pasted into an open tab is applied ──
test('B6: a new #s= in the address of an open tab is read and loaded as at start', () => {
  const at = main.indexOf("window.addEventListener('hashchange'");
  assert.ok(at > 0, 'there is a hashchange handler');
  const h = main.slice(at, at + 600);
  assert.match(h, /readShare\(\)/);
  assert.match(h, /loadShared\(next\)/);
});

// ── B7: unknown vessels and keys are dropped ──
test('B7: sanitizeParams keeps only vessels the model has, and no keys it has no parameter for', () => {
  const p = defaultParams();
  p.stenosis = { PV_OLD: 0.5, PV_TRUNK: 0.4 };
  p.thrombus = { GONE: 1, SV_CONF: 1 };
  p.stenosisSite = { PV_OLD: 'mid', PV_TRUNK: 'mid' };
  p.customShunts = { NOPE: 8, PV_TRUNK: 8 };   // (PV_TRUNK is not a custom-shunt vessel)
  p.spontaneous = { C5: true, X9: true };
  p.occluded = { C5: true, X9: true };
  p.madeUp = { a: 1 };
  const out = sanitizeParams(p);
  assert.deepEqual(out.stenosis, { PV_TRUNK: 0.4 });
  assert.deepEqual(out.thrombus, { SV_CONF: 1 });
  assert.deepEqual(out.stenosisSite, { PV_TRUNK: 'mid' });
  assert.deepEqual(out.customShunts, {});
  assert.deepEqual(out.spontaneous, { C5: true, C6: false });
  assert.deepEqual(out.occluded, { C5: true });
  assert.equal('madeUp' in out, false);
  assert.deepEqual(Object.keys(out).sort(), Object.keys(defaultParams()).sort());
});

// ── B8: the oldest talk goes first, whatever its id looks like ──
test('B8: Resume evicts by age, so an all-digit deck id is not always the oldest', async (t) => {
  const mem = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) } });
  t.after(() => { delete globalThis.localStorage; });
  const { noteResume, resumeFor } = await import('../src/ui/resume.js');
  noteResume('2024', 3, 10);                                            // (an integer-like id: object order puts it first)
  for (let i = 0; i < 39; i++) noteResume(`deck${i}`, 3, 10);           // 40 now: the digit deck is the newest but one... the oldest is 2024
  noteResume('2024', 4, 10);                                            // heard again: now the newest
  noteResume('late', 3, 10);                                            // one over: the oldest goes (deck0), not 2024
  assert.deepEqual(resumeFor('2024', 10), { at: 4, n: 10 }, 'the digit deck, newest again, is kept');
  assert.equal(resumeFor('deck0', 10), null, 'the oldest talk is the one forgotten');
  assert.deepEqual(resumeFor('late', 10), { at: 3, n: 10 });
});

// ── B9: a listener removed during a change does not hear it ──
test('B9: a store listener removed by an earlier one in the same change is not called', () => {
  const heard = [];
  let offB;
  const a = () => { heard.push('a'); offB(); };
  const b = () => heard.push('b');
  const offA = store.on('b9key', a);
  offB = store.on('b9key', b);
  store.set({ b9key: 1 });
  assert.deepEqual(heard, ['a'], 'b was removed before its turn');
  store.set({ b9key: 2 });
  assert.deepEqual(heard, ['a', 'a'], 'and stays removed');
  offA();
  // Subscribed again later, a listener hears changes again.
  const off2 = store.on('b9key', b);
  store.set({ b9key: 3 });
  assert.deepEqual(heard, ['a', 'a', 'b']);
  off2();
});

test('B9: leaving one key does not silence the same listener on another key in that change', () => {
  const heard = [];
  const shared = (v) => heard.push(v);
  let offOne;
  const first = () => offOne();
  store.on('b9x', first);
  offOne = store.on('b9x', shared);
  store.on('b9y', shared);
  store.set({ b9x: 'x', b9y: 'y' });
  assert.deepEqual(heard, ['y'], 'removed from b9x, still heard on b9y in the same change');
});
