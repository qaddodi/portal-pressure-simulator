// Work backward's refinement as the screen sees it (src/ui/inverse-remote.js), and the worker that serves it (src/ui/inverse-worker.js): the
// ranking is always there at once, a worker only adds patients, a stale reply is dropped, a silent or failed worker leaves the grid's
// ranking and says so, and the real worker's first round sends back patients that were not in the library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInverseRemote, REFINE_TIMEOUT_MS } from '../src/ui/inverse-remote.js';
import { LIBRARY } from '../src/engine/inverse-library.js';
import { keyOf, FAMILY } from '../src/engine/inverse-families.js';
import { pointsOf, MIN_READINGS } from '../src/engine/inverse.js';

const A = { whvp: 8.0, fhvp: 4.5, ppg: 14, spleen: 16, plt: 78, lsm: 6.5, ssm: 68, asc: 0 };
const libKeys = new Set(pointsOf(LIBRARY).map((p) => keyOf(p.f, p.p)));

class FakeWorker {
  constructor() { this.sent = []; this.ended = false; }
  postMessage(m) { this.sent.push(m); }
  terminate() { this.ended = true; }
}
const withWorker = (fn) => {
  const had = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  try { return fn(); } finally { if (had) globalThis.Worker = had; else delete globalThis.Worker; }
};
// A timer that runs only when the test says so.
const fakeTimer = () => { const t = { fn: null, set(fn) { t.fn = fn; return 1; }, clear() { t.fn = null; } }; return t; };

test('with no worker the ranking is the grid\'s and the status says so', () => {
  const r = createInverseRemote(null);
  assert.equal(r.status(), 'library');
  const res = r.set(A);
  assert.equal(res.ready, true);
  assert.equal(res.families[0].id, 'presin');
});

test('too few readings start no refinement', () => withWorker(() => {
  const w = new FakeWorker(), r = createInverseRemote(() => w);
  r.set({ whvp: 8 });
  assert.equal(w.sent.length, 0);
  assert.equal(r.status(), 'idle');
  assert.equal(MIN_READINGS, 2);
}));

test('enough readings rank at once and start a refinement; its rounds add patients and rank again', () => withWorker(() => {
  const w = new FakeWorker(), r = createInverseRemote(() => w), seen = [];
  r.on((res) => seen.push(res));
  const first = r.set(A);
  assert.equal(first.ready, true, 'the ranking is there before the worker has said anything');
  assert.equal(r.status(), 'refining');
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].t, 'refine');
  assert.deepEqual(Object.keys(w.sent[0].readings).sort(), Object.keys(A).sort());
  const seq = w.sent[0].seq, base = first.families.find((f) => f.id === 'presin').count;
  // a patient the worker ran: one step off the library's best presinusoidal point
  const row = ['presin', [55, 2.2], pointsOf(LIBRARY).find((p) => p.f === 'presin' && p.p.pre === 50 && p.p.sin === 2.2).r];
  row[2] = Object.values(row[2]);
  w.onmessage({ data: { t: 'points', seq, rows: [row], round: 1, rounds: 3, done: false } });
  assert.equal(seen.length, 1);
  assert.equal(r.status(), 'refining');
  assert.equal(r.progress().round, 1);
  assert.ok(r.result().families.find((f) => f.id === 'presin').count >= base);
  w.onmessage({ data: { t: 'points', seq, rows: [], round: 3, rounds: 3, done: true } });
  assert.equal(r.status(), 'done');
  assert.equal(seen.length, 2);
}));

test('a reply to an older request is dropped', () => withWorker(() => {
  const w = new FakeWorker(), r = createInverseRemote(() => w);
  r.set(A);
  const old = w.sent[0].seq;
  r.set({ ...A, lsm: 7 });
  let n = 0;
  r.on(() => n++);
  w.onmessage({ data: { t: 'points', seq: old, rows: [], round: 3, rounds: 3, done: true } });
  assert.equal(n, 0);
  assert.equal(r.status(), 'refining');
}));

test('a worker that errors or goes silent leaves the grid\'s ranking and the status "library"', () => withWorker(() => {
  const w = new FakeWorker(), t = fakeTimer(), r = createInverseRemote(() => w, { setTimer: t.set, clearTimer: t.clear });
  r.set(A);
  assert.ok(t.fn, 'a silence timer is running while it refines');
  t.fn();
  assert.equal(r.status(), 'library');
  assert.equal(w.sent.at(-1).t, 'cancel');
  assert.equal(r.result().ready, true, 'the ranking stays');
  const w2 = new FakeWorker(), r2 = createInverseRemote(() => w2);
  r2.set(A);
  w2.onmessage({ data: { t: 'error', seq: w2.sent[0].seq, message: 'boom' } });
  assert.equal(r2.status(), 'library');
  assert.ok(REFINE_TIMEOUT_MS >= 20000);
}));

test('the worker is made on the first refinement, not before; one that cannot be made leaves the ranking on the page; dispose ends one', () => withWorker(() => {
  let made = 0;
  const w = new FakeWorker(), r = createInverseRemote(() => { made++; return w; });
  assert.equal(made, 0, 'opening the screen makes no worker');
  r.peek(A); r.set({ whvp: 8 });
  assert.equal(made, 0, 'nor do too few readings');
  r.set(A);
  assert.equal(made, 1);
  r.set({ ...A, lsm: 7 });
  assert.equal(made, 1, 'one worker for the life of the screen');
  r.dispose();
  assert.equal(w.ended, true);
  assert.equal(r.status(), 'library');
  const bad = createInverseRemote(() => { throw new Error('no worker'); });
  assert.equal(bad.status(), 'idle');
  assert.equal(bad.set(A).ready, true, 'the ranking is there whatever the worker does');
  assert.equal(bad.status(), 'library');
}));

test('peek ranks without starting anything', () => withWorker(() => {
  const w = new FakeWorker(), r = createInverseRemote(() => w);
  assert.equal(r.peek(A).ready, true);
  assert.equal(w.sent.length, 0);
  assert.equal(r.status(), 'idle');
}));

test('the real worker runs the engine near the best fit and sends back patients that were not in the library', async () => {
  const got = [];
  globalThis.self = { postMessage: (m) => got.push(m) };
  await import('../src/ui/inverse-worker.js');
  const done = new Promise((resolve) => { const t = setInterval(() => { if (got.some((m) => m.t === 'points' && m.rows.length)) { clearInterval(t); resolve(); } }, 200); });
  globalThis.self.onmessage({ data: { t: 'refine', seq: 7, readings: A } });
  await done;
  globalThis.self.onmessage({ data: { t: 'cancel' } });
  const m = got.find((x) => x.rows?.length);
  assert.equal(m.seq, 7);
  assert.equal(m.round, 1);
  assert.ok(m.rows.length > 0 && m.rows.length <= 14);
  const pts = pointsOf(m.rows);
  for (const pt of pts) assert.ok(!libKeys.has(keyOf(pt.f, pt.p)), 'a refined patient is a new one: ' + keyOf(pt.f, pt.p));
  assert.ok(pts.every((pt) => FAMILY[pt.f]));
  const n = got.length;
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(got.length - n <= 0, 'a cancelled refinement sends nothing more');
});
