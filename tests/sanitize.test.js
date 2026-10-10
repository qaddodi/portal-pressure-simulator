// Hand-edited share links: out-of-range or malformed values are clamped, and the model stays finite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeParams, defaultParams } from '../src/engine/scenario.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

test('share-link params are clamped to the control ranges', () => {
  const p = sanitizeParams({ systemicTone: 0, cirrhosis: 7, albumin: 'x', drugs: 'yes', tips: { on: 1, d: 99 }, thrombus: { PV_TRUNK: -3 } });
  assert.equal(p.systemicTone, 0.4);
  assert.equal(p.cirrhosis, 1);
  assert.equal(p.albumin, defaultParams().albumin);
  assert.deepEqual(p.drugs, defaultParams().drugs);
  assert.deepEqual(p.tips, { on: true, d: 12 });
  assert.equal(p.thrombus.PV_TRUNK, 0);
});

test('a non-finite run does not leak into the next patient', () => {
  const e = new Engine();
  e.setParams({ ...defaultParams(), systemicTone: 0 }); e.settle();
  e.loadPreset('healthy');
  for (let i = 0; i < 20; i++) e.step(0.05);
  const m = computeMetrics(e);
  assert.ok(Number.isFinite(m.hvpg) && Number.isFinite(m.co), `hvpg ${m.hvpg} co ${m.co}`);
});

test('decompensated cirrhosis is hyperdynamic and RA pressure stays non-negative in severe outflow blocks', () => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  let m = computeMetrics(e);
  assert.ok(m.co > 6 && m.svr < 14, `CO ${m.co} SVR ${m.svr}`);
  for (const patch of [{ stenosis: { IVCS_RA: 0.95 } }, { thrombus: { RHV_IVC: 1, MHV_IVC: 1, LHV_IVC: 1 } }, { fibrosis: { R: { pre: 1, sin: 40, post: 1 }, L: { pre: 1, sin: 40, post: 1 } } }]) {
    e.loadPreset('healthy'); e.setParams({ ...e.params, ...patch }); e.settle();
    m = computeMetrics(e);
    assert.ok(m.ra >= 0, `RA ${m.ra} for ${JSON.stringify(patch)}`);
  }
});
