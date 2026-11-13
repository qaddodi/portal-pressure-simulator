// The view switch drawn lower (12 Nov 2026, Mohammad's Mac at Figure size Full): the share a morph frame is drawn at and the corner's size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { morphLowK, morphLowSize, TRIGGER_MP, TARGET_MP, LOWEST } from '../src/ui/morph-low.js';

test('the default sizes are never lowered; Full on a Retina Mac is held near the target', () => {
  assert.equal(morphLowK(1.5e6), 0, 'Mac and iPad default, 1.5 MP');
  assert.equal(morphLowK(0.5e6), 0, 'phone default, 0.5 MP');
  assert.equal(morphLowK(TRIGGER_MP * 1e6), 0, 'at the trigger');
  const k = morphLowK(3840 * 2346);
  assert.ok(k > 0.5 && k < 0.7, `Full, 9 MP: ${k}`);
  assert.ok(Math.abs(k * k * 3840 * 2346 / 1e6 - TARGET_MP) < 0.05, 'about the target in MP');
  assert.equal(morphLowK(40e6), LOWEST, 'never under the lowest share');
  assert.ok(morphLowK(4.5e6) < 1 && morphLowK(4.5e6) > 0.75);
});

test('the corner is at least 1 px and never past the layer', () => {
  const out = [0, 0];
  assert.deepEqual(morphLowSize(3840, 2346, 0.577, out), [Math.ceil(3840 * 0.577), Math.ceil(2346 * 0.577)]);
  assert.deepEqual(morphLowSize(1, 1, 0.5, out), [1, 1]);
  assert.deepEqual(morphLowSize(100, 100, 1, out), [100, 100]);
  assert.deepEqual(morphLowSize(100, 100, 5, out), [100, 100]);
});
