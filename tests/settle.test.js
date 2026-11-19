// screen/settle.js: "is the page still busy" is answered once (DBG-2). The gallery API, the packet, the Phone check and the camera bench all ask it.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pageBusy, waitQuiet, QUIET_MS, QUIET_LONG_MS } from '../src/ui/screen/settle.js';
import { isBusy } from '../src/ui/gallery/benches/camera-grid.js';
import { probeBusy } from '../src/ui/gallery/api.js';

const stage = (o = {}) => ({ gliding: () => false, ...o });

test('the lobule\'s camera is busy for every waiter (the old gallery probe missed it, so a lobule specimen could be read mid-glide)', () => {
  const lob = { stage: stage({ lobuleSettled: () => false }) }, glide = { stage: stage({ lobuleGlide: () => true }) };
  for (const pps of [lob, glide]) { assert.equal(pageBusy(pps), true); assert.equal(isBusy(pps), true); assert.equal(probeBusy(pps, { querySelector: () => null }), true); }
  assert.equal(pageBusy({ stage: stage({ lobuleSettled: () => true, lobuleGlide: () => false }) }), false);
});

test('the motion half needs no document; the page half (cards still styling, fonts, animations) needs one', () => {
  assert.equal(pageBusy(null), false);
  assert.equal(pageBusy({}, null, { changing: true }), true);
  assert.equal(pageBusy({ presenter: { busy: () => true } }), true);
  assert.equal(pageBusy({ stage: { viewChanging: () => true } }), true, 'a view change is busy for the bench too');
  const doc = (q) => ({ querySelector: (s) => (q.test(s) ? {} : null), fonts: { status: 'loaded' } });
  assert.equal(pageBusy({}, doc(/pz-prep/)), true);
  assert.equal(pageBusy({}, doc(/^$/)), false);
  assert.equal(pageBusy({}, { querySelector: () => null, fonts: { status: 'loading' } }), true);
  assert.equal(pageBusy({}, doc(/pz-prep/), { changing: false }) && pageBusy({}, null), false, 'without a document the page half is not asked');
});

test('waitQuiet resolves after one quiet window, restarts it on a new move, and gives up at the timeout', async () => {
  let t = 0;
  const clock = { now: () => t, sleep: async (ms) => { t += ms; } };
  let busyUntil = 450;
  const r = await waitQuiet(() => t < busyUntil, { ...clock, quietMs: 300, pollMs: 100, timeoutMs: 5000 });
  assert.equal(r.settled, true);
  assert.ok(r.ms >= 450 + 300 && r.ms <= 450 + 300 + 100, `${r.ms}`);
  t = 0; busyUntil = Infinity;
  const gave = await waitQuiet(() => true, { ...clock, timeoutMs: 1000 });
  assert.deepEqual([gave.settled, gave.ms >= 1000], [false, true]);
  t = 0; let n = 0;   // (a blip after a quiet stretch restarts the window)
  const blip = await waitQuiet(() => { n++; return n === 3; }, { ...clock, quietMs: 250, pollMs: 100 });
  assert.equal(blip.settled, true);
  assert.ok(blip.ms >= 3 * 100 + 250 - 100, `${blip.ms}`);
});

test('one quiet window: 300 ms for every waiter, 600 ms only for the packet', () => {
  assert.equal(QUIET_MS, 300); assert.equal(QUIET_LONG_MS, 600);
  const root = new URL('../src/', import.meta.url).pathname;
  const files = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });
  const bad = [];
  for (const f of files(root)) {
    if (f.endsWith('/screen/settle.js')) continue;
    const s = readFileSync(f, 'utf8');
    if (/\bfunction (probeBusy|isBusy|pageBusy)\b/.test(s) || /\bconst (probeBusy|pageBusy) =/.test(s)) bad.push(`${f.slice(root.length)} defines its own busy probe`);
    if (/quietMs\s*[:=]\s*\d{3}\b/.test(s) && !/test-mode|wait-quiet/.test(f)) bad.push(`${f.slice(root.length)} sets its own quiet window`);
  }
  assert.deepEqual(bad, []);
});
