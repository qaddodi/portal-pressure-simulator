import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolFade, POOL_MIN } from '../src/ui/fluid-step.js';
import { ascitesGrade } from '../src/engine/metrics.js';

// The figure draws no ascites while the Ascites test grades the belly "None" (a belly refilling after a drain read
// 0.0 L "None" under a drawn pool), and the pool then fades in without a jump.

test('no pool is drawn at any volume the readout grades "None"', () => {
  for (let v = 0; v <= 200; v += 0.05) if (ascitesGrade(v).grade === 0) assert.equal(poolFade(v), 0, `${v} mL`);
  assert.equal(poolFade(0), 0);
  assert.equal(poolFade(49), 0);   // (shown as 0.0 L)
});

test('past the "None" grade the pool fades in smoothly to its full look', () => {
  let prev = 0;
  for (let v = POOL_MIN; v <= 400; v += 1) {
    const f = poolFade(v);
    assert.ok(f >= prev && f - prev < 0.01, `${v} mL: ${f}`);
    prev = f;
  }
  assert.equal(poolFade(300), 1);
  assert.equal(poolFade(5000), 1);
});
