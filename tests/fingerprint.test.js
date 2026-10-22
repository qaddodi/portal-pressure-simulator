// One fingerprint (engine/fingerprint.js) for the worker's slide states and the presenter's live model during a time-lapse. Before 22 Oct they were
// two lists that had drifted: the live one read the breath-averaged RA, lacked the albumin, central vein, hepatic encephalopathy and liver
// resistance keys (a tile bound to one showed "—" mid time-lapse), and the worker's lacked the clot.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf, liverRes } from '../src/engine/fingerprint.js';
import { createCore } from '../src/worker-core.js';
import { fluidOf } from '../src/ui/tool-fluid.js';
import { TILE } from '../src/ui/table-marks.js';

const FLUID_ONLY = ['lymphOver', 'lymphBack', 'lymphNet'];   // (needs the engine's starling())
const engineSide = (e) => fingerprintOf(computeMetrics(e), {
  P: e.Pf || e.P, Q: e.Qf || e.Q, D: Float32Array.from(e.edges, (ed) => e.diameter(ed.id)), copy: true, params: e.params, fluid: e.starling() });
// (What the presenter has of the same moment: a frame as the worker posts it.)
const frameSide = (e, m) => {
  const fr = { metrics: m, P: Float32Array.from(e.P), Pf: Float32Array.from(e.Pf || e.P), Q: Float32Array.from(e.Q), Qf: Float32Array.from(e.Qf || e.Q), D: Float32Array.from(e.edges, (ed) => e.diameter(ed.id)) };
  return fingerprintOf(fr.metrics, { P: fr.Pf || fr.P, Q: fr.Qf || fr.Q, D: fr.D, params: e.params });
};
const cirrhotic = () => { const e = new Engine(); e.loadPreset('cirr-decomp'); e.settle(); return e; };

test('the live fingerprint has every key the worker\'s has, and the same value for all but the engine-only lymph terms', () => {
  for (const e of [new Engine(), cirrhotic()]) {
    const m = computeMetrics(e), a = engineSide(e), b = frameSide(e, m);
    assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
    for (const k of Object.keys(a)) {
      if (k === 'at' || FLUID_ONLY.includes(k)) continue;
      assert.ok(Math.abs(a[k] - b[k]) < 1e-5 || Object.is(a[k], b[k]), `${k}: ${a[k]} vs ${b[k]}`);
    }
    for (const k of FLUID_ONLY) { assert.equal(b[k], undefined, `${k} is the engine's alone (undefined: tool-fluid reads a null as 0)`); assert.ok(Number.isFinite(a[k]), `${k} on the engine side`); }
  }
});

test('every tile key is in the live fingerprint (a tile bound to a missing one read "—" during a time-lapse)', () => {
  const e = cirrhotic(), fp = frameSide(e, computeMetrics(e));
  for (const k of Object.keys(TILE)) assert.ok(k in fp, `${k} is a tile, and missing from the live fingerprint`);
  for (const k of ['salb', 'aalb', 'sigma', 'hepLymph', 'splLymph', 'cv', 'he', 'rih', 'lymphCap', 'clot']) assert.ok(Number.isFinite(fp[k]), `${k} is a number`);
});

test('the right atrial pressure is the breath-averaged one, on both sides', () => {
  const e = cirrhotic(), m = computeMetrics(e);
  const fp = fingerprintOf({ ...m, ra: 4, vitals: { ...m.vitals, ra: 7.5 } });
  assert.equal(fp.ra, 7.5);
  assert.equal(fingerprintOf({ ...m, ra: 4, vitals: undefined }).ra, 4, 'no vitals yet: the instantaneous one');
  assert.equal(engineSide(e).ra, m.vitals.ra);
});

test('the liver resistance is the circuit view\'s: each lobe in series, the two in parallel', () => {
  const e = cirrhotic(), P = e.Pf || e.P, Q = e.Qf || e.Q;
  const lobe = (ids) => ids.reduce((s, id) => { const k = e.ei[id], ed = e.edges[k]; return s + (P[e.ni[ed.from]] - P[e.ni[ed.to]]) / Math.max(1e-6, Math.abs(Q[k]) * 0.06); }, 0);
  const want = 1 / (1 / Math.max(1e-6, lobe(['PRE_R', 'SIN_RR', 'POST_R_RHV'])) + 1 / Math.max(1e-6, lobe(['PRE_L', 'SIN_LL', 'POST_L_LHV'])));
  assert.ok(Math.abs(liverRes(P, Q) - want) < 1e-9, `${liverRes(P, Q)} vs ${want}`);
});

test('the fluid card follows the live frames mid time-lapse and pins to a slide\'s state at rest, as before', () => {
  const e = cirrhotic();
  assert.equal(fluidOf(frameSide(e, computeMetrics(e))), null);
  assert.ok(fluidOf(engineSide(e)));
});

test('the worker\'s slide states carry the same fingerprint (the clot included)', async () => {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m.fp; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: [{ preset: 'cirr-decomp' }, { preset: 'cirr-decomp', params: { thrombus: { PV_TRUNK: 0.6 } } }], reqId: 1 });
  core.dispose();
  assert.equal(out[0].clot, 0);
  assert.ok(Math.abs(out[1].clot - 0.6) < 1e-9);
  for (const k of ['salb', 'cv', 'he', 'rih', 'lymphNet']) assert.ok(Number.isFinite(out[0][k]), k);
  assert.ok(out[0].at.P instanceof Float32Array && out[0].at.D instanceof Float32Array);
});

test('neither the presenter nor the worker keeps a key list of its own', () => {
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('worker-core.js'), /fingerprintOf\(m,/);
  assert.match(src('ui/presenter.js'), /const liveFp = \(fr\) => fingerprintOf\(/);
  assert.doesNotMatch(src('worker-core.js'), /pvFlow: m\.pvFlowMean/);
  assert.doesNotMatch(src('ui/presenter.js'), /pvFlow: m\.pvFlowMean/);
});
