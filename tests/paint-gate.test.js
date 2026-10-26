import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPaintGate } from '../src/ui/paint-gate.js';

// A gate with a hand-run frame, a hand-run fallback timer and a hand-set clock.
function rig(over = {}) {
  const log = { ingested: [], painted: [] };
  const clock = { t: 1000 };
  let frameCb = null, timerCb = null;
  const gate = createPaintGate({
    ingest: (f) => log.ingested.push(f.id), paint: (f) => log.painted.push(f.id),
    ask: (cb) => { frameCb = cb; return 7; }, cancel: () => { frameCb = null; },
    later: (cb) => { timerCb = cb; return 9; }, unlater: () => { timerCb = null; },
    now: () => clock.t, ...over,
  });
  return { gate, log, clock, frame: () => frameCb?.(), timer: () => timerCb?.(), pending: () => !!(frameCb || timerCb) };
}

test('snapshots that pile up before a frame paint only the newest, and every one is ingested', () => {
  const r = rig();
  for (const id of [1, 2, 3]) r.gate.push({ id, changed: true });
  assert.deepEqual(r.log.ingested, [1, 2, 3]);
  assert.deepEqual(r.log.painted, []);
  r.frame();
  assert.deepEqual(r.log.painted, [3]);
  assert.equal(r.pending(), false, 'the fallback timer is gone with the frame');
});

test('events and parameters of a dropped snapshot are in the ingest, not lost with its picture', () => {
  const seen = [];
  const r = rig({ ingest: (f) => seen.push(...(f.events || []), ...(f.params ? ['params'] : [])) });
  r.gate.push({ id: 1, events: ['bleed'], params: {} });
  r.gate.push({ id: 2, changed: true });
  r.gate.push({ id: 3, events: ['stop'] });
  assert.deepEqual(seen, ['bleed', 'params', 'stop']);
});

test('a quiet snapshot inside the gap of the last paint is ingested but never painted, as before', () => {
  const r = rig();
  r.gate.push({ id: 1, changed: true }); r.frame();
  r.clock.t += 40;
  assert.equal(r.gate.push({ id: 2 }), false);
  assert.equal(r.pending(), false);
  r.clock.t += 60;
  assert.equal(r.gate.push({ id: 3 }), true);
  r.frame();
  assert.deepEqual(r.log.painted, [1, 3]);
});

test('a change inside the gap is painted, and a quiet snapshot after it replaces it with the newer state', () => {
  const r = rig();
  r.gate.push({ id: 1, changed: true }); r.frame();
  r.clock.t += 10;
  r.gate.push({ id: 2, changed: true });
  r.gate.push({ id: 3 });
  r.frame();
  assert.deepEqual(r.log.painted, [1, 3], 'the reset snapshot is waiting, so the newer quiet one carries on from it');
});

test('a hidden tab (no frame comes) paints from the fallback timer, once', () => {
  const r = rig();
  r.gate.push({ id: 1, changed: true }); r.gate.push({ id: 2, changed: true });
  r.timer();
  assert.deepEqual(r.log.painted, [2]);
  r.frame();
  assert.deepEqual(r.log.painted, [2]);
});

test('main.js ingests every snapshot and paints through the gate; nothing is blended between snapshots', () => {
  const m = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(m, /createPaintGate\(\{ ingest: ingestFrame, paint: paintFrame,/);
  assert.match(m, /function onFrame\(f\) \{ frameGate\.push\(f\); \}/);
  const ing = m.slice(m.indexOf('function ingestFrame'), m.indexOf('function paintFrame'));
  assert.match(ing, /replaceParams\(f\.params\)/);
  assert.match(ing, /timeline\.addEvents\(ev\)/);
  assert.match(ing, /dock\?\.ingest\(f\)/);
  const gate = readFileSync(new URL('../src/ui/paint-gate.js', import.meta.url), 'utf8');
  assert.doesNotMatch(gate, /lerp|mix\(|interpolat\w+\(/);
});
