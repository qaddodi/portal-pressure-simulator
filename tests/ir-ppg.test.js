// The PPG by interventional radiology (proc-anim.js MEASURES.irivc and irpv): two approaches, each a catheter of its own. A transjugular catheter reads the IVC; then the portal
// vein is reached directly through the skin and the liver (percutaneous transhepatic) and read there. The gradient is the portal reading less the IVC reading, the PPG the tiles show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { MEASURES, PROCS, PROC_KINDS, READS, specOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';
import { legMs, ROUTE_LEN } from '../src/ui/hvpg-clock.js';

const A = MEASURES.irivc, B = MEASURES.irpv;
const live = (preset) => { const e = new Engine(); e.loadPreset(preset); e.settle(); return { metrics: computeMetrics(e) }; };
const times = (T) => Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

test('two readings, not treatments: offered always, each on a route of its own, the model left as it was; the old TIPS-route reading is gone', () => {
  for (const [k, P, route] of [['irivc', A, 'ivcread'], ['irpv', B, 'ppgperc']]) {
    assert.ok(!PROC_KINDS.includes(k) && !PROCS[k], `${k}: not among the HVPG card’s treatment buttons`);
    assert.equal(specOf(k), P); assert.equal(P.measure, true); assert.equal(P.route, route);
    assert.equal(procOffered(k, {}), true); assert.equal(procBlocked(k, {}), '');
    const p = {}; assert.equal(P.apply(p), p); assert.equal(P.had(p), false);
  }
  assert.notEqual(A.route, B.route, 'two separate approaches');
  assert.equal(specOf('irppg'), null);
  assert.match(procBlocked('irpv', { thrombus: { PV_TRUNK: 1 } }), /thrombosed/);
  assert.equal(procBlocked('irivc', { thrombus: { PV_TRUNK: 1 } }), '', 'the IVC reading does not need the portal vein');
  assert.equal(legMs(ROUTE_LEN.ivc), A.T.travel1 - A.T.travel0); assert.equal(legMs(ROUTE_LEN.perc), B.T.travel1 - B.T.travel0);
});

test('each catheter goes in, waits still while it reads, and goes out; nothing else is out', () => {
  for (const [k, P] of [['irivc', A], ['irpv', B]]) {
    const T = P.T; let prev = null;
    for (const t of times(T)) {
      const f = procFrame(k, t);
      for (const q of ['u', 'opacity']) assert.ok(f[q] >= 0 && f[q] <= 1, `${k} ${q} at ${t}: ${f[q]}`);
      if (prev) assert.ok(Math.abs(f.u - prev.u) < 0.06, `${k}: u jumps at ${t} ms`);
      assert.equal(f.needle + f.wire + f.flash + f.balloon + f.column + f.fan + f.aim, 0, `${k}: only the catheter at ${t}`);
      assert.equal(f.read, t >= T.read0 && t < T.read1 ? P.readAs : 0, `${k}: read at ${t}`);
      if (f.read) assert.equal(f.u, 1, `${k}: still, all the way in, while it reads`);
      prev = f;
    }
    assert.equal(procFrame(k, 0).u, 0); assert.equal(procFrame(k, T.travel1).u, 1);
    const end = procFrame(k, T.end); assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.step, -1);
    assert.ok(T.travel1 < T.read0 && T.read1 < T.back && T.back < T.end);
  }
  assert.equal(A.readAs, 2, 'the IVC reading’s ring is the IVC’s'); assert.equal(B.readAs, 1, 'the portal reading’s ring is the portal vein’s');
});

test('steps in order, each reading taken still; the portal slide ends on the gradient, which stands while the catheter waits', () => {
  assert.equal(A.steps.length, 2); assert.equal(B.steps.length, 3);
  for (const [k, P] of [['irivc', A], ['irpv', B]]) {
    assert.equal(P.stops.length, P.steps.length); assert.equal(P.markT.length, P.steps.length);
    for (let i = 1; i < P.stops.length; i++) assert.ok(P.stops[i] > P.stops[i - 1]);
    assert.equal(P.stops.at(-1), P.T.end); assert.ok(P.stops[0] > P.T.travel1, `${k}: the first step holds once the way in is over`);
    assert.equal(stepAt(k, P.T.read0), 1, `${k}: the reading is step 2`);
    for (let i = 0; i < P.steps.length; i++) assert.equal(stepMarks(k, i).length, 0, `${k} step ${i}: no mark on the vessels`);
  }
  assert.ok(markAt('irivc', 1) >= A.T.read1 && markAt('irivc', 1) < A.T.back);
  assert.ok(markAt('irpv', 1) >= B.T.read1 && markAt('irpv', 1) <= B.stops[1]);
  assert.ok(markAt('irpv', 2) > B.stops[1] && markAt('irpv', 2) < B.T.back);
  assert.equal(stepAt('irpv', B.T.res0), 2);
});

test('the callouts read the live frame, then the readings taken: the IVC, then the portal vein and the PPG the tiles show', () => {
  const f = live('csph'), m = f.metrics, L = [], rd = READS.irivc, rp = READS.irpv, one = (x) => (Math.round(x * 10) / 10).toFixed(1);
  for (const k in rd) rd[k] = NaN; for (const k in rp) rp[k] = NaN;
  assert.equal(A.labels(0, rd, f, L).length, 0, 'none while the catheter travels');
  A.labels(A.T.read0 + 50, rd, f, L);
  assert.deepEqual(L.map((x) => x.kicker), ['IVC']); assert.equal(L[0].text, one(m.ivc));
  A.capture(1, rd, f); assert.equal(rd.iv, Math.round(m.ivc * 10) / 10);
  A.labels(A.T.back + 10, rd, f, L); assert.equal(L.length, 0, 'gone as the catheter comes out');
  B.labels(B.T.read0 + 50, rp, f, L);
  assert.deepEqual(L.map((x) => x.kicker), ['PORTAL VEIN']); assert.equal(L[0].text, one(m.pv));
  B.capture(1, rp, f); B.capture(2, rp, f);
  assert.equal(rp.pv, Math.round(m.pv * 10) / 10);
  assert.ok(Number.isFinite(rp.ppg) && Math.abs(rp.ppg - (rp.pv - rp.iv)) < 0.11, 'the PPG is the portal vein less the IVC at one decimal');
  B.labels(markAt('irpv', 2) + 10, rp, f, L);
  assert.deepEqual(L.map((x) => x.kicker), ['PPG']); assert.equal(L[0].text, rp.ppg.toFixed(1));
  assert.match(L[0].cls, /danger/, 'csph: a PPG over 12 mmHg is red on the PPG cut-offs');
  B.labels(B.T.back + 10, rp, f, L); assert.equal(L.length, 0);
});
