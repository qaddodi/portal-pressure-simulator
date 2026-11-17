// A stent's state is one descriptor of one moment (external review, 17 Nov 2026): its geometry, its readings, the direction of its flow and the raw residual
// of its pressure split, with the patient's revision, so a card pins all of it together. The split is the engine's own: its parts add up to the drop across
// the stent within a stated tolerance before any display rounds them, and they are signed with the flow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { deepMerge, sanitizeParams } from '../src/engine/scenario.js';

// The residual a display may hide by scaling (the smoothed pressures and flow are not one instant): 2 % of the drop, or 0.05 mmHg.
const TOL = (dp) => Math.max(0.05, 0.02 * Math.abs(dp));
const at = (patch, beats = 0) => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d: 10 }, ...patch }))); e.settle(3);
  for (let i = 0; i < beats; i++) e.step(0.01);
  return e;
};

test('the pressure split adds up to the drop across the stent, settled and while the heart beats', () => {
  for (const patch of [{}, { tips: { on: true, d: 6 } }, { stentGeom: { TIPS: { red: 0.4, waist: 4 } } }, { stentGeom: { TIPS: { red: 0.4, waist: 1, trans: 1 } } }, { stenosis: { TIPS: 0.6 }, stenosisSite: { TIPS: 'proximal' } }]) {
    for (const beats of [0, 137]) {
      const t = computeMetrics(at(patch, beats)).tips;
      assert.ok(Math.abs(t.resid) <= TOL(t.dp), `${JSON.stringify(patch)} after ${beats} steps: residual ${t.resid.toFixed(3)} of ${t.dp.toFixed(2)} mmHg`);
      assert.ok(Math.abs(t.dp - t.parts.total - t.resid) < 1e-9, 'resid is dp less the parts, raw');
      assert.equal(t.dir, 1);
    }
  }
});

test('the parts are signed with the flow: a reversed stent has negative parts and a negative drop', () => {
  const e = at({}), k = e.ei.TIPS;
  const t0 = e.stentState('TIPS');
  (e.Qf || e.Q)[k] = -t0.q;   // (the same flow the other way: every part changes sign, its size stays)
  const t1 = e.stentState('TIPS');
  assert.equal(t1.dir, -1);
  for (const f of ['tract', 'wall', 'entry', 'total']) assert.ok(Math.abs(t1.parts[f] + t0.parts[f]) < 1e-9 && t1.parts[f] < 0, f);
});

test('one moment: the record carries its geometry and revision, and the fingerprint the geometry its numbers came from', () => {
  const e = at({ stentGeom: { TIPS: { red: 0.4, waist: 4, trans: 1 } } }), m = computeMetrics(e), t = m.tips, fp = fingerprintOf(m);
  assert.equal(t.rev, e.paramsRev | 0);
  assert.deepEqual([t.geom.len, t.geom.waist, t.geom.trans, t.red], [8, 4, 1, 0.4]);
  assert.deepEqual([fp.tipsLen, fp.tipsWaistLen, fp.tipsTrans, fp.tipsRed, fp.tipsD], [8, 4, 1, 0.4, 10]);
  assert.equal(fp.tipsResid, t.resid);
  assert.equal(fingerprintOf(computeMetrics(at({ tips: { on: false } }))).tipsLen, null, 'no stent, no geometry');
});
