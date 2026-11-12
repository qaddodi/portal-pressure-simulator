// The PPG by interventional radiology (proc-anim.js MEASURES.irppg): a direct portal vein reading by the transjugular route with no stent. The catheter goes in
// to the right hepatic vein, a needle crosses the liver into the right portal vein, the wire and the catheter follow, the manometer reads; the catheter is drawn
// back to the IVC and reads again; the gradient is the PPG the tiles show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { MEASURES, PROCS, PROC_KINDS, READS, specOf, procFrame, stepAt, stepMarks, markAt, procBlocked, procOffered } from '../src/ui/proc-anim.js';

const M = MEASURES.irppg, T = M.T;
const times = Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);
const STOPS = { SVC_RA: [-0.5, -0.1], IVCS_RA: [-0.1, 0.1], IVC_IS: [0.1, 0.45], hv: [0.45, 0.6], tract: [0.6, 0.85], rpv: [0.85, 0.93], trunk: [0.93, 1] };
const live = (preset) => { const e = new Engine(); e.loadPreset(preset); e.settle(); return { metrics: computeMetrics(e) }; };

test('a reading, not a treatment: offered always, blocked by a clotted hepatic vein or a stent already in, the model left as it was', () => {
  assert.ok(!PROC_KINDS.includes('irppg') && !PROCS.irppg, 'not among the HVPG card’s treatment buttons');
  assert.equal(specOf('irppg'), M); assert.equal(M.measure, true); assert.equal(M.route, 'tips', 'it travels the TIPS route');
  assert.equal(procOffered('irppg', {}), true);
  assert.equal(procBlocked('irppg', {}), '');
  assert.match(procBlocked('irppg', { thrombus: { RHV_IVC: 1 } }), /clotted/);
  assert.match(procBlocked('irppg', { tips: { on: true } }), /TIPS/);
  const p = {};
  assert.equal(M.apply(p), p); assert.equal(M.had(p), false);
});

test('in to the tract, the needle across and the wire on, the catheter over them into the portal vein, back to the IVC, out', () => {
  let prev = null;
  for (const t of times) {
    const f = procFrame('irppg', t, STOPS);
    for (const k of ['u', 'opacity', 'needle', 'wire']) assert.ok(f[k] >= 0 && f[k] <= 1, `${k} at ${t}: ${f[k]}`);
    if (prev) assert.ok(Math.abs(f.u - prev.u) < 0.06, `u jumps at ${t} ms`);
    assert.equal(f.balloon + f.column + f.fan + f.aim, 0, `no balloon, stent or scope at ${t}`);
    if (f.needle) assert.ok(f.needle > f.u, `the needle is ahead of the catheter at ${t}`);
    prev = f;
  }
  const at = (t) => procFrame('irppg', t, STOPS);
  assert.equal(at(0).u, 0);
  assert.ok(Math.abs(at(T.travel1).u - STOPS.tract[0]) < 1e-9, 'parked where the tract leaves the hepatic vein');
  assert.ok(at(T.needle1).needle > STOPS.tract[1], 'the needle reaches the right portal vein');
  assert.ok(at(T.flash0 + 100).flash > 0 && at(T.flash1 + 50).flash === 0, 'the portal hit flashes once');
  assert.ok(at(T.wire1).wire > at(T.wire1).u, 'the wire runs on ahead of the catheter');
  assert.ok(at(T.pvRead0).u > STOPS.rpv[0] && at(T.pvRead0).u <= STOPS.rpv[1], 'the catheter reads inside the right portal vein');
  assert.equal(at(T.pvRead0).needle, 0, 'the needle is back in the catheter by then');
  assert.equal(at(T.pull0).wire, 0, 'the wire is out before the catheter is drawn back');
  const iv = at(T.ivRead0).u;
  assert.ok(iv > STOPS.IVC_IS[0] && iv < STOPS.IVC_IS[1], 'drawn back into the IVC stretch');
  assert.equal(at(T.ivRead1).u, iv, 'it waits there while it reads');
  assert.ok(at(T.ivRead0).needle === 0 && at(T.ivRead0).wire === 0, 'only the catheter is out');
  assert.ok(procFrame('irppg', T.ivRead0, null).u > 0, 'without the stage’s stops it still has a place');
  const end = at(T.end);
  assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.step, -1);
});

test('four steps in order; each reading is taken still; the result stands while the catheter waits and goes as it comes out', () => {
  assert.equal(M.steps.length, 4); assert.equal(M.stops.length, 4); assert.equal(M.markT.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(M.stops[i] > M.stops[i - 1]);
  assert.equal(M.stops.at(-1), T.end); assert.ok(M.stops[0] > T.travel1);
  assert.ok(T.travel1 < T.needle0 && T.needle1 < T.over0 && T.over1 < T.pvRead0 && T.pvRead1 < T.wireOut0 && T.wireOut1 < T.pull0 && T.pull1 < T.ivRead0 && T.ivRead1 < T.res0 && T.res0 < T.back && T.back < T.end);
  assert.equal(stepAt('irppg', T.needle0), 1); assert.equal(stepAt('irppg', T.pvRead0), 1); assert.equal(stepAt('irppg', T.ivRead0), 2); assert.equal(stepAt('irppg', T.res0), 3);
  assert.ok(markAt('irppg', 1) >= T.pvRead1 && markAt('irppg', 1) <= M.stops[1]);
  assert.ok(markAt('irppg', 2) >= T.ivRead1 && markAt('irppg', 2) <= M.stops[2]);
  assert.ok(markAt('irppg', 3) > M.stops[2] && markAt('irppg', 3) < T.back);
  for (const t of times) {
    const f = procFrame('irppg', t, STOPS);
    assert.equal(f.read, t >= T.pvRead0 && t < T.pvRead1 ? 1 : t >= T.ivRead0 && t < T.ivRead1 ? 2 : 0, `read at ${t}`);
  }
  for (let i = 0; i < 4; i++) assert.equal(stepMarks('irppg', i).length, 0, `step ${i}: no mark on the vessels`);
});

test('the callouts read the live frame, then the readings taken: portal vein, IVC, then the PPG the tiles show', () => {
  const f = live('csph'), m = f.metrics, rd = READS.irppg, L = [];
  for (const k in rd) rd[k] = NaN;
  assert.equal(M.labels(0, rd, f, L).length, 0, 'none while the catheter travels');
  M.labels(T.pvRead0 + 50, rd, f, L);
  assert.deepEqual(L.map((x) => x.kicker), ['PORTAL VEIN']); assert.equal(L[0].text, (Math.round(m.pv * 10) / 10).toFixed(1));
  M.capture(1, rd, f); M.capture(2, rd, f); M.capture(3, rd, f);
  assert.equal(rd.pv, Math.round(m.pv * 10) / 10); assert.equal(rd.iv, Math.round(m.ivc * 10) / 10);
  assert.ok(Number.isFinite(rd.ppg) && Math.abs(rd.ppg - (rd.pv - rd.iv)) < 0.11, 'the PPG is the portal vein less the IVC at one decimal');
  M.labels(T.ivRead0 + 50, rd, f, L);
  assert.deepEqual(L.map((x) => x.kicker), ['IVC']);
  M.labels(markAt('irppg', 3) + 10, rd, f, L);
  assert.deepEqual(L.map((x) => x.kicker), ['PPG']); assert.equal(L[0].text, rd.ppg.toFixed(1));
  assert.match(L[0].cls, /danger/, 'csph: a PPG over 12 mmHg is red on the PPG cut-offs');
  M.labels(T.back + 10, rd, f, L);
  assert.equal(L.length, 0, 'gone as the catheter comes out');
});
