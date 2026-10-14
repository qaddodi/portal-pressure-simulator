// The Doppler talk's meal slide (slide 4 with the outline) shows a steady portal trace: breathing is off for it, and
// the later slides load their own patients, so the setting does not leak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOPPLER } from '../src/ui/decks/doppler.js';
import { Engine } from '../src/engine/engine.js';
import { EDGES } from '../src/engine/topology.js';

test('the meal slide turns breathing off, and the next slide loads a fresh patient', () => {
  const i = DOPPLER.slides.findIndex((s) => s.id === 'meal');
  assert.equal(DOPPLER.slides[i].params?.respiration, false);
  assert.ok(DOPPLER.slides[i + 1].preset, 'the slide after loads its own preset, which restores breathing');
});

test('without breathing the portal trunk flow is steady', () => {
  const swing = (respiration) => {
    const e = new Engine(); e.loadPreset('healthy'); e.setParams({ ...e.params, respiration });
    const k = EDGES.findIndex((x) => x.id === 'PV_TRUNK');
    let mn = Infinity, mx = -Infinity;
    for (let n = 0; n < 1200; n++) { e.step(0.01); if (n > 400) { mn = Math.min(mn, e.Q[k]); mx = Math.max(mx, e.Q[k]); } }
    return (mx - mn) / Math.max(Math.abs(mx), Math.abs(mn));
  };
  assert.ok(swing(false) < 0.15, 'steady: pulsatility index under the Doppler "Phasic" cut-off');
  assert.ok(swing(true) > 0.15);
});
