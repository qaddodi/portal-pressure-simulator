// The Warren shunt's flare toward the renal vein's wall (fork-joins.js flareScale): 1 well away, FLARE_K at the wall, rising smoothly, never past it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLARE_K, FLARE_SPAN, flareScale } from '../src/ui/fork-joins.js';

test('the flare is 1 far from the vein, rises smoothly, and holds at 1 + FLARE_K from the wall inward', () => {
  const h = 6;
  assert.equal(flareScale(100, h), 1);
  assert.equal(flareScale(0, h), 1 + FLARE_K);
  assert.ok(Math.abs(flareScale(0.6 * h, h) - (1 + FLARE_K)) < 1e-9);
  let prev = 1;
  for (let d = 0.6 * h + FLARE_SPAN * h; d >= 0; d -= 0.5) { const f = flareScale(d, h); assert.ok(f >= prev - 1e-12 && f <= 1 + FLARE_K + 1e-12, `monotone at ${d}`); prev = f; }
  assert.equal(flareScale(5, 0), 1, 'no host, no flare');
});
