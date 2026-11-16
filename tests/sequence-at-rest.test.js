// A slide's readings are the ones the live figure settles to (play-test B12, 16 Nov 2026: the words said PPG 7.7 where the card settled at 8.0 after about 20 s).
// The slide states the page is handed are read from a model run at the bedside clock's own steps, not from the quiet settle (no breath, no pulse),
// which sits 0.1 to 0.6 mmHg off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSteps } from './deck-states.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS } from '../src/engine/scenario.js';

test('a slide state reads what the patient settles to at the bedside', async () => {
  const ids = ['cirr-decomp', 'csph', 'cirr-comp'], fps = await runSteps(ids.map((preset) => ({ preset })));
  ids.forEach((id, i) => {
    const e = new Engine(); e.loadPreset(id); e.beat = true;
    for (let k = 0; k < 12000; k++) e.step(0.004);
    const rest = computeMetrics(e);
    assert.ok(Math.abs(fps[i].hvpg - rest.hvpg) <= 0.2, `${id}: HVPG ${fps[i].hvpg} on the slide, ${rest.hvpg.toFixed(2)} at rest`);
    assert.ok(Math.abs(fps[i].ppg - rest.ppg) <= 0.25, `${id}: PPG ${fps[i].ppg} on the slide, ${rest.ppg.toFixed(2)} at rest`);
    assert.ok(Math.abs(fps[i].map - rest.map) <= 1, `${id}: MAP ${fps[i].map} on the slide, ${rest.map.toFixed(1)} at rest`);
  });
  assert.ok(PRESETS.length > 3);
});
