// The treatment procedures played on the anatomy (proc-anim.js): each eases in and back out, its step order holds, the model
// takes the change the Treat buttons make, one the patient cannot have says why, and built-in slides use it only where adopted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROCS, PROC_KINDS, procBlocked, procFrame } from '../src/ui/proc-anim.js';
import { defaultParams } from '../src/engine/scenario.js';
import { isOccluded } from '../src/engine/topology.js';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';

const times = (T) => Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

test('every procedure eases: no value jumps between frames, and it starts and ends out of sight', () => {
  for (const k of PROC_KINDS) {
    let prev = null;
    for (const t of times(PROCS[k].T)) {
      const f = procFrame(k, t);
      for (const key of ['u', 'balloon', 'column', 'opacity']) {
        assert.ok(f[key] >= 0 && f[key] <= 1, `${k} ${key} at ${t}: ${f[key]}`);
        if (prev) assert.ok(Math.abs(f[key] - prev[key]) < 0.08, `${k} ${key} jumps at ${t} ms`);
      }
      prev = f;
    }
    assert.equal(procFrame(k, 0).u, 0);
    const end = procFrame(k, PROCS[k].T.end);
    assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.balloon, 0); assert.equal(end.column, 0);
    assert.equal(end.step, -1);
  }
});

test('the steps run in order, the work happens with the catheter in, and the change lands before it leaves', () => {
  for (const k of PROC_KINDS) {
    const T = PROCS[k].T;
    let last = 0;
    for (const t of times(T)) { const s = procFrame(k, t).step; if (s >= 0) { assert.ok(s >= last, `${k}: step back at ${t}`); last = s; } }
    assert.equal(last, PROCS[k].steps.length - 1);
    assert.ok(T.apply < T.back, `${k}: applied before the catheter starts out`);
    assert.equal(procFrame(k, T.apply - 1).u, 1, `${k}: the tip is all the way in while it works`);
    assert.equal(procFrame(k, T.apply).step, PROCS[k].steps.length - 1);
  }
  // The TIPS's needle crosses the tract between the hepatic vein and the portal vein (the route's stops).
  const stops = { tract: [0.5, 0.8] };
  assert.equal(procFrame('tips', PROCS.tips.T.needle0, stops).u, 0.5);
  assert.equal(procFrame('tips', PROCS.tips.T.needle1, stops).u, 0.8);
  assert.ok(procFrame('tips', (PROCS.tips.T.inflate0 + PROCS.tips.T.inflate1) / 2, stops).balloon > 0.3);
  assert.equal(procFrame('brto', PROCS.brto.T.fill1).column, 1);
});

test('the change each one leaves matches the Treat buttons', () => {
  const p = defaultParams();
  const tips = PROCS.tips.apply(structuredClone(p));
  assert.equal(tips.tips.on, true); assert.equal(tips.tips.d, 8);
  for (const k of ['brto', 'bato']) {
    const q = PROCS[k].apply(structuredClone({ ...p, spontaneous: { ...p.spontaneous, C5: true } }));
    assert.equal(q.occluded.C5, true);
    assert.ok(isOccluded(q, 'C5') && isOccluded(q, 'C2'), `${k} closes the shunt and its gastric feeder`);
  }
});

test('one the patient cannot have says why', () => {
  const p = defaultParams();   // (no gastrorenal shunt by default)
  assert.equal(procBlocked('tips', p), '');
  assert.match(procBlocked('tips', { ...p, tips: { on: true, d: 8 } }), /already/);
  assert.match(procBlocked('tips', { ...p, thrombus: { RHV_IVC: 1 } }), /clotted/);
  assert.match(procBlocked('brto', p), /no gastrorenal shunt/);
  const grs = { ...p, spontaneous: { C5: true, C6: false } };
  assert.equal(procBlocked('brto', grs), ''); assert.equal(procBlocked('bato', grs), '');
  assert.match(procBlocked('brto', { ...grs, occluded: { C5: true } }), /already closed/);
  assert.match(procBlocked('bato', { ...grs, thrombus: { PV_TRUNK: 1 } }), /portal vein is clotted/);
  assert.ok(procBlocked('nope', p));
});

test('built-in slides use procedure only where adopted, each naming a known one', () => {
  for (const d of DECKS) for (const s of d.slides) {
    if (s.procedure == null) continue;
    assert.ok(adopted(d, s, 'procedure'), `${d.id}/${s.id} uses procedure without being listed in tests/deck-adopted.js`);
    const k = typeof s.procedure === 'string' ? s.procedure : s.procedure.kind;
    assert.ok(PROCS[k], `${d.id}/${s.id}: unknown procedure ${k}`);
  }
});
