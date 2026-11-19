// "Decompensated cirrhosis + TIPS" (17 Nov 2026): one tap in the scenario menu loads the sickest cirrhosis the model has (severity 100%, decompensated)
// with the default stent (8 mm, uniform, covered) already in place, settled, so the TIPS cards open as they do after switching a TIPS on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { PRESETS, defaultParams } from '../src/engine/portal/scenario.js';
import { endOf, geomOf } from '../src/engine/portal/stent-geom.js';
import { SNAPSHOTS } from '../src/ui/snapshots.js';

const ID = 'cirr-decomp-tips';
const pr = PRESETS.find((p) => p.id === ID);

test('the preset is in the list: named naturally, next to decompensated cirrhosis, a decompensated case', () => {
  assert.ok(pr, 'present');
  assert.equal(pr.label, 'Decompensated cirrhosis + TIPS');
  assert.equal(pr.group, 'Sinusoidal');
  assert.equal(pr.facts.decompensated, true);
  const ids = PRESETS.map((p) => p.id);
  assert.equal(ids.indexOf(ID), ids.indexOf('cirr-decomp') + 1, 'listed right after Decompensated cirrhosis');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(SNAPSHOTS[ID], 'the Home snapshot exists (node scripts/snapshots.mjs)');
});

test('it loads at 100% severity with the default uniform 8 mm stent, no lesion on it', () => {
  const e = new Engine();
  e.loadPreset(ID);
  const p = e.params;
  assert.equal(p.cirrhosis, 1);
  assert.deepEqual(p.tips, { on: true, d: defaultParams().tips.d });
  assert.equal(p.tips.d, 8);
  assert.equal(p.dips.on, false);
  assert.ok(!p.stenosis.TIPS && !p.thrombus.TIPS, 'no end stenosis or clot');
  assert.equal(endOf(p, 'TIPS'), 0, 'no end narrowing');
  assert.equal(geomOf(p, 'TIPS', 'tips').red, 0, 'no waist: the stent is uniform');
});

test('it is settled: a load leaves nothing to relax, and the TIPS lowers the portal pressure below the same patient without it', () => {
  const e = new Engine();
  e.loadPreset(ID);
  const m0 = computeMetrics(e);
  e.advanceDays(3, { noRupture: true, silent: true });
  const m1 = computeMetrics(e);
  for (const k of ['hvpg', 'ppg', 'pv', 'pvFlow', 'ra']) assert.ok(Math.abs(m1[k] - m0[k]) < 0.15, `${k} moved ${m0[k]} to ${m1[k]} in 3 days`);
  assert.ok(Math.abs(m1.ascites.volume - m0.ascites.volume) < 60, 'the ascites is not still clearing or filling');
  const bare = new Engine();
  bare.loadPreset('cirr-decomp', { preset: { ...pr, apply: (q) => { const r = pr.apply(q); r.tips.on = false; return r; } } });
  assert.ok(m0.ppg < computeMetrics(bare).ppg - 4, `PPG ${m0.ppg} with the TIPS, ${computeMetrics(bare).ppg} without`);
});
