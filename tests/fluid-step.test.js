import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fluidTarget, FLUID_STEP } from '../src/ui/fluid-step.js';

// The model's ascites trickles by a fraction of a mL each update; the drawn volume follows only in steps of FLUID_STEP,
// measured from the volume last drawn, so a slow drift still lands and the fluid ends where the model says.

test('a trickle under a step leaves the drawn volume as it is', () => {
  assert.equal(fluidTarget(3000, 3000.0004), 3000);
  assert.equal(fluidTarget(3000, 2999.95), 3000);
});

test('a slow drift lands once it adds up to a step from what is drawn', () => {
  let drawn = 3000;
  for (let i = 1; i <= 400; i++) drawn = fluidTarget(drawn, 3000 + i * 0.0008);
  assert.ok(Math.abs(3000 + 400 * 0.0008 - drawn) < FLUID_STEP, `drawn ${drawn}`);
  assert.ok(drawn > 3000);
});

test('the first volume, a large change and an empty abdomen are taken at once', () => {
  assert.equal(fluidTarget(null, 1234.5), 1234.5);
  assert.equal(fluidTarget(1000, 1500), 1500);
  assert.equal(fluidTarget(0.03, 0), 0);
  assert.equal(fluidTarget(0, 0), 0);
});
