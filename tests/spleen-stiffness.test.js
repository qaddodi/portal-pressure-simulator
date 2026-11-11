// Spleen stiffness (metrics.ssm, ssm-cuts.js): worked out from the spleen's pressure and size, so it moves with the portal pressure
// wherever the block lies, and the tile, the FibroScan card and the decks read the one set of cut-offs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { SSM_CUTS, ssmOf, ssmZone } from '../src/engine/ssm-cuts.js';
import { RATE, TILE, SCALE } from '../src/ui/table-marks.js';

const preset = (id) => { const e = new Engine(); e.loadPreset(id); return e; };
const M = (e) => computeMetrics(e);
const patch = (e, p) => { e.setParams(deepMerge(e.params, p)); e.settle(); return e; };

test('a healthy spleen reads about 17 kPa, under every rule-out', () => {
  const m = M(new Engine());
  assert.ok(m.ssm > 14 && m.ssm < 21, `healthy SSM ${m.ssm}`);
  assert.equal(ssmZone(m.ssm), 'spare');
});

test('in cirrhosis it climbs with the HVPG, across the indeterminate zone into the rule-in', () => {
  let prev = 0;
  for (const c of [0, 0.3, 0.5, 0.6, 0.7, 0.8, 1]) {
    const e = patch(new Engine(), { cirrhosis: c }); e.advanceDays(365);
    const m = M(e);
    assert.ok(m.ssm > prev, `cirrhosis ${c}: ${m.ssm} after ${prev}`);
    prev = m.ssm;
    if (m.hvpg < 6) assert.ok(m.ssm < SSM_CUTS.spareScope, `HVPG ${m.hvpg} reads ${m.ssm}`);
    if (m.hvpg >= 15) assert.ok(m.ssm > SSM_CUTS.ruleIn, `HVPG ${m.hvpg} reads ${m.ssm}`);
  }
  const csph = M(preset('csph'));
  assert.ok(csph.ssm > 40 && csph.ssm < 60, `CSPH preset ${csph.ssm}`);
});

test('pre-hepatic and presinusoidal disease stiffen the spleen while the liver stays soft', () => {
  for (const id of ['pvt-chronic', 'svt', 'schisto']) {
    const m = M(preset(id));
    assert.ok(m.lsm < 10, `${id}: liver ${m.lsm}`);
    assert.ok(m.ssm >= 50, `${id}: spleen ${m.ssm}`);
  }
});

test('a TIPS lowers it at once and further as the spleen shrinks; a beta-blocker lowers it; a splenectomy leaves none', () => {
  const before = M(preset('cirr-decomp')).ssm;
  const e = patch(preset('cirr-decomp'), { tips: { on: true } });
  const now = M(e).ssm; e.advanceDays(180); const later = M(e).ssm;
  assert.ok(now < before - 5 && later < now - 5, `TIPS: ${before} → ${now} → ${later}`);
  assert.ok(M(patch(preset('csph'), { drugs: { carvedilol: true } })).ssm < M(preset('csph')).ssm - 3, 'carvedilol');
  assert.equal(M(patch(preset('csph'), { splenicRx: 2 })).ssm, null);
  assert.equal(ssmOf(20, 0), null);
  assert.ok(ssmOf(60, 25) <= SSM_CUTS.max);
});

test('the tile reads the same cut-offs as the card and the decks', () => {
  assert.ok(TILE.ssm && SCALE.ssm);
  assert.deepEqual(SCALE.ssm[2], [SSM_CUTS.resolved, SSM_CUTS.spareScope, SSM_CUTS.ruleIn]);
  assert.equal(RATE.ssm(SSM_CUTS.ruleIn + 0.1)[1], 'CSPH');
  assert.equal(RATE.ssm(SSM_CUTS.ruleIn)[1], 'Indeterminate');
  assert.equal(RATE.ssm(SSM_CUTS.spareScope - 0.1)[0], 'ok');
});
