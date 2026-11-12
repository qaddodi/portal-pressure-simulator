// The HVPG as one slide of four numbered steps (proc-anim.js MEASURES.hvpgcath), as the EUS-PPG is: the catheter in, the free pressure, the balloon up and the wedged pressure, the HVPG.
// Each step plays once on Next and holds; nothing shows before the tip is in the vein; the readings are the model's own (metrics.fhvp, whvp, hvpg).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { MEASURES, PROCS, PROC_KINDS, READS, specOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';
import { legMs, ROUTE_LEN, BALLOON_IN_MS } from '../src/ui/hvpg-clock.js';

const P = MEASURES.hvpgcath, T = P.T;
const live = (preset) => { const e = new Engine(); e.loadPreset(preset); e.settle(); return { metrics: computeMetrics(e) }; };
const times = Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

test('a reading, not a treatment: offered always, on the HVPG catheter’s own route, the model left as it was; a clotted right hepatic vein blocks it', () => {
  assert.ok(!PROC_KINDS.includes('hvpgcath') && !PROCS.hvpgcath);
  assert.equal(specOf('hvpgcath'), P); assert.equal(P.measure, true); assert.equal(P.route, 'hvpg');
  assert.equal(procOffered('hvpgcath', {}), true); assert.equal(procBlocked('hvpgcath', {}), '');
  assert.match(procBlocked('hvpgcath', { thrombus: { RHV_IVC: 1 } }), /clotted/);
  const p = {}; assert.equal(P.apply(p), p); assert.equal(P.had(p), false);
  assert.equal(legMs(ROUTE_LEN.hvpg), T.travel1 - T.travel0);
});

test('the catheter goes in, the balloon goes up behind the tip and the column fills after it, then all go; one thing at a time', () => {
  let prev = null;
  for (const t of times) {
    const f = { ...procFrame('hvpgcath', t) };
    for (const q of ['u', 'opacity', 'balloon', 'column']) assert.ok(f[q] >= 0 && f[q] <= 1, `${q} at ${t}: ${f[q]}`);
    if (prev) assert.ok(Math.abs(f.u - prev.u) < 0.06, `u jumps at ${t} ms`);
    assert.equal(f.needle + f.wire + f.flash + f.fan + f.aim + f.coil, 0, `only the catheter at ${t}`);
    if (f.balloon > 0) assert.equal(f.u, 1, 'the balloon only once the tip is in place');
    if (f.column > 0) assert.ok(f.balloon > 0, 'the column only behind a balloon');
    if (t < T.inflate0) assert.equal(f.balloon, 0, `no balloon before step 3 at ${t}`);
    assert.equal(f.read, t >= T.free0 && t < T.free1 ? 1 : t >= T.inflate1 && t < T.sum0 ? 2 : 0, `read at ${t}`);
    if (f.read) assert.equal(f.u, 1, 'still, all the way in, while it reads');
    prev = f;
  }
  assert.equal(procFrame('hvpgcath', 0).u, 0); assert.equal(procFrame('hvpgcath', T.travel1).u, 1);
  assert.equal(procFrame('hvpgcath', T.inflate1 + 10).balloon > 0.9, true); assert.equal(procFrame('hvpgcath', T.col1).column, 1);
  assert.equal(T.inflate1 - T.inflate0, BALLOON_IN_MS);
  const end = procFrame('hvpgcath', T.end); assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.balloon, 0); assert.equal(end.column, 0); assert.equal(end.step, -1);
});

test('four steps, each holding after it has played; callouts come as each reading is taken, never before the tip is in', () => {
  assert.equal(P.steps.length, 4); assert.equal(P.stops.length, 4); assert.equal(P.markT.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(P.stops[i] > P.stops[i - 1]);
  assert.equal(P.stops.at(-1), T.end); assert.ok(P.stops[0] > T.travel1 && P.stops[0] < T.free0, 'step 1 holds once the way in is over');
  assert.equal(stepAt('hvpgcath', T.free0 + 100), 1); assert.equal(stepAt('hvpgcath', T.inflate0), 2); assert.equal(stepAt('hvpgcath', T.sum0), 3);
  for (let i = 0; i < 4; i++) { assert.equal(stepMarks('hvpgcath', i).length, 0); assert.ok(markAt('hvpgcath', i) <= P.stops[i]); }
  assert.ok(markAt('hvpgcath', 1) > T.free0 && markAt('hvpgcath', 2) > T.col1 && markAt('hvpgcath', 3) >= T.sum0);
  const L = [], f0 = live('csph');
  for (const t of times.filter((x) => x < T.free0)) assert.equal(P.labels(t, READS.hvpgcath, f0, L).length, 0, `no reading at ${t}`);
});

test('the readings are the model’s: free, then wedged, then the HVPG as the tiles show it; the callouts follow them', () => {
  const f = live('csph'), m = f.metrics, rd = { fh: NaN, wh: NaN, hv: NaN };
  P.capture(1, rd, f); P.capture(2, rd, f); P.capture(3, rd, f);
  assert.ok(Math.abs(rd.fh - m.fhvp) < 0.06); assert.ok(Math.abs(rd.wh - m.whvp) < 0.06); assert.ok(Math.abs(rd.hv - m.hvpg) < 0.06);
  const L = [];
  P.labels(T.free1 + 200, rd, f, L); assert.deepEqual(L.map((x) => x.key), ['f']); assert.equal(L[0].text, rd.fh.toFixed(1));
  P.labels(T.wedge1 + 200, rd, f, L); assert.deepEqual(L.map((x) => x.key), ['f', 'w']); assert.equal(L[1].text, rd.wh.toFixed(1));
  P.labels(T.sum0 + 200, rd, f, L); assert.deepEqual(L.map((x) => x.key), ['s']);
  assert.equal(L[0].rows[0].text, rd.wh.toFixed(1)); assert.equal(L[0].rows[1].text, rd.fh.toFixed(1)); assert.equal(L[0].calc.text, rd.hv.toFixed(1));
  assert.match(L[0].calc.cls, /^result (ok|caution|danger)$/);
  P.labels(T.end - 200, rd, f, L); assert.equal(L.length, 0, 'the result goes as the catheter does');
  const w = [];
  P.labels(T.col0 + 900, rd, f, w); assert.ok(Number(w[1].text) > rd.fh && Number(w[1].text) < m.whvp, 'the wedged reading climbs with the column');
});
