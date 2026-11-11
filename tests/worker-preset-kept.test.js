// A deck loads the same patient on many slides (encephalopathy loads cirr-decomp 5 times). The worker keeps the snapshot a load
// leaves, per (preset, days, seed), and restores it: a chain's later loads cost nothing. The healthy reference the load measured
// against comes back with it (without it, restoring into another model differed from the load by 1.7e-4 mmHg), so a restored
// patient, settled as every slide of a chain is, is the loaded one: no drift measured for any of the 19 presets after two other
// patients (and after a TIPS slide), and TOL here
// is only float noise.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { PRESETS } from '../src/engine/scenario.js';
import { createCore } from '../src/worker-core.js';

const TOL = 1e-9;
const flat = (o, p = '', out = {}) => { if (typeof o === 'number') out[p] = o; else if (o && typeof o === 'object') for (const k of Object.keys(o)) flat(o[k], `${p}.${k}`, out); return out; };
const same = (a, b, what) => {
  const fa = flat(a), fb = flat(b);
  assert.deepEqual(Object.keys(fb), Object.keys(fa));
  for (const k of Object.keys(fa)) assert.ok(Math.abs(fa[k] - fb[k]) <= TOL * Math.max(1, Math.abs(fa[k])) || (Number.isNaN(fa[k]) && Number.isNaN(fb[k])), `${what} ${k}: ${fa[k]} vs ${fb[k]}`);
};
// (Counts the loads that really ran.)
const counting = () => {
  const real = Engine.prototype.loadPresetSteps, seen = [];
  Engine.prototype.loadPresetSteps = function (id, o) { seen.push(`${id}|${o?.days ?? ''}`); return real.call(this, id, o); };
  return { seen, off: () => { Engine.prototype.loadPresetSteps = real; } };
};

test('a chain loads each (preset, days) once, and the later loads match the first', async () => {
  const c = counting();
  try {
    const out = [];
    const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
    core.handle({ type: 'run', running: false });
    const steps = [{ preset: 'cirr-decomp' }, { preset: 'healthy' }, { preset: 'cirr-decomp' }, { preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } } }, { preset: 'cirr-decomp' }, { preset: 'cirr-decomp', presetDays: 10 }];
    await core.handle({ type: 'sequence', steps, reqId: 1 });
    core.dispose();
    assert.deepEqual(c.seen, ['cirr-decomp|', 'healthy|', `cirr-decomp|${PRESETS.find((p) => p.id === 'cirr-decomp').days + 10}`], 'one load for each patient and number of days');
    same(out[0].fp, out[2].fp, 'third step');
    same(out[0].fp, out[4].fp, 'fifth step, after a slide that changed the patient');
    assert.notEqual(out[3].fp.ppg, out[0].fp.ppg, 'the slide between did change the model');
    assert.deepEqual(out[2].params, out[0].params);
  } finally { c.off(); }
});

test('presetMetrics answers a patient it has loaded before from the kept snapshot', async () => {
  const c = counting();
  try {
    const got = [];
    const core = createCore((m) => { if (m.type === 'presetMetrics') got.push(m.result); });
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'presetMetrics', ids: ['cirr-comp', 'csph'], reqId: 1 });
    await core.handle({ type: 'presetMetrics', ids: ['csph', 'cirr-comp'], reqId: 2 });
    core.dispose();
    assert.equal(c.seen.length, 2, 'the second request loads nothing');
    same(got[0]['cirr-comp'], got[1]['cirr-comp'], 'cirr-comp');
    same(got[0].csph, got[1].csph, 'csph');
  } finally { c.off(); }
});
