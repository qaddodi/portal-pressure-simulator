import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceFlow } from '../src/ui/flow-motion.js';

test('pulse modulation is suppressed without changing model input', () => {
  const x = { sp: 36 };
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 1200; i++) {
    advanceFlow(x, 12 + 2.4 * Math.sin(i / 60 * Math.PI * 2), 1 / 60);
    if (i > 600) { min = Math.min(min, x.flowVelocity); max = Math.max(max, x.flowVelocity); }
  }
  assert.ok(max - min < 0.3, `display oscillation ${max - min}`);
});

test('reversal crosses zero and preserves continuous tracer positions', () => {
  const x = { sp: 36 };
  advanceFlow(x, 12, 0);
  let reversed = false, slow = false;
  for (let i = 0; i < 600; i++) {
    const before = x.flowPhase;
    advanceFlow(x, -12, 1 / 60);
    const delta = Math.abs(((x.flowPhase - before + 1.5) % 1) - 0.5);
    assert.ok(delta < 0.02, `phase jumped ${delta}`);
    if (Math.abs(x.flowVelocity) < 0.2) slow = true;
    if (x.flowDirection === -1) reversed = true;
  }
  assert.ok(slow && reversed);
});

test('zero flow has no decorative drift; pause freezes phase and smoothing', () => {
  const x = { sp: 36, row: 5 };
  advanceFlow(x, 0, 0);
  const still = x.flowPhase;
  for (let i = 0; i < 60; i++) advanceFlow(x, 0, 1 / 60);
  assert.equal(x.flowPhase, still);
  assert.equal(x.flowDirection, 0);
  advanceFlow(x, 12, 1);
  const phase = x.flowPhase, velocity = x.flowVelocity;
  advanceFlow(x, -12, 0);
  assert.equal(x.flowPhase, phase);
  assert.equal(x.flowVelocity, velocity);
});
