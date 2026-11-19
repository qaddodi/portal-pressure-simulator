// A stent that has stopped is stopped everywhere, from one state the engine keeps (engine.js stentState .still, with its memory): no flow, no velocity at
// any gate or at the waist, no friction or jet in the loss bar or the trace, while the pressure across it stays (the blockage holds it). A flow hovering at
// the cut-off does not flip it (play-test 17 Nov 2026, 88 %: "Stasis" turning "Patent"; the Doppler said "No flow" beside a distal 23 cm/s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { deepMerge, sanitizeParams } from '../src/engine/portal/scenario.js';
import { FLOW_CUTS, stentStill, stentStillHeld } from '../src/engine/portal/flow-cuts.js';

const at = (s) => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d: 10 }, stenosis: { TIPS: s } }))); e.settle(3); return e; };

test('a stopped stent: no flow, no velocity, no loss parts, the gradient held', () => {
  const t = computeMetrics(at(0.99)).tips;
  assert.equal(t.still, true);
  for (const k of ['q', 'flow', 'vOpen', 'vWaist', 'vPeak']) assert.equal(t[k], 0, k);
  assert.deepEqual([...t.peaks], [0, 0, 0]);
  for (const k of ['tract', 'wall', 'entry', 'jet', 'inlet', 'total']) assert.equal(t.parts[k], 0, `parts.${k}`);
  assert.ok(t.dp > 5, `the blockage holds the gradient (${t.dp.toFixed(1)} mmHg)`);
});

test('a stent narrowed hard but still flowing is not stopped: its jet is real', () => {
  const t = computeMetrics(at(0.88)).tips;
  assert.equal(t.still, false);
  assert.ok(t.q > FLOW_CUTS.stillOffQ && t.vPeak > 90 && t.parts.jet > 1, `q ${t.q.toFixed(2)} mL/s, peak ${t.vPeak.toFixed(0)} cm/s`);
});

test('the state has a memory: a flow between the two cut-offs keeps what it was', () => {
  const q = (FLOW_CUTS.stillQ + FLOW_CUTS.stillOffQ) / 2;
  assert.equal(stentStillHeld(q, true), true); assert.equal(stentStillHeld(q, false), false);
  assert.equal(stentStill(q), false);
  const e = at(0.5), k = e.ei.TIPS;
  (e.Qf || e.Q)[k] = q;
  assert.equal(e.stentState('TIPS').still, false, 'a fresh reading at that flow: flowing');
  assert.equal(e.stentState('TIPS', { parts: {}, geom: {}, still: true }).still, true, 'the live record that had stopped: still stopped');
  (e.Qf || e.Q)[k] = FLOW_CUTS.stillOffQ * 1.2;
  assert.equal(e.stentState('TIPS', { parts: {}, geom: {}, still: true }).still, false, 'above the upper cut-off it flows again');
});

test('a TIPS drains to the cava past the right hepatic vein: the right lobe keeps draining forward into the RHV (17 Nov 2026)', () => {
  for (const preset of ['cirr-decomp', 'cirr-comp', 'schisto']) for (const d of [8, 10, 12]) {
    const e = new Engine(); e.loadPreset(preset);
    e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d } }))); e.settle(3);
    const Q = e.Qf || e.Q, P = e.Pf || e.P;
    assert.ok(Q[e.ei.POST_R_RHV] > 0.5, `${preset} ${d} mm: the right lobe's central veins drain into the RHV (${Q[e.ei.POST_R_RHV].toFixed(2)} mL/s)`);
    assert.ok(P[e.ni.RHV] < P[e.ni.CV_R], `${preset} ${d} mm: the RHV (${P[e.ni.RHV].toFixed(2)}) stays below the central veins (${P[e.ni.CV_R].toFixed(2)})`);
    assert.ok(Q[e.ei.RHV_IVC] > 0, 'the RHV runs to the cava');
  }
});
