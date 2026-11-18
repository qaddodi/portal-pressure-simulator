// The direction word on a collateral's card (play-test, vessel round 2, 17 Nov 2026): the periportal bypass (C8) carries portal blood round the clot INTO the liver,
// so in portal vein thrombosis it is hepatopetal; every other collateral carries it away from the liver (hepatofugal).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { cardFor } from '../src/ui/actions.js';

const CTX = { canShunt: () => true, injectDye: () => {}, canDye: () => true };
function frameOf(preset) {
  const e = new Engine(); e.loadPreset(preset); e.settle();
  const D = new Float32Array(e.E); for (let k = 0; k < e.E; k++) D[k] = e.diameter(e.edges[k].id);
  return { P: e.P, Pf: e.Pf || e.P, Q: e.Q, Qf: e.Qf || e.Q, D, metrics: computeMetrics(e), slow: e.slow };
}
const word = (f, id) => cardFor({ type: 'edge', id }, CTX).status(f)?.[1];

test('the periportal collaterals read hepatopetal in portal vein thrombosis; the coronary vein route stays hepatofugal', () => {
  for (const preset of ['pvt-acute', 'pvt-chronic']) {
    const f = frameOf(preset);
    assert.equal(word(f, 'C8'), 'Hepatopetal', preset);
    assert.equal(word(f, 'C1a'), 'Hepatofugal', preset);
  }
  assert.equal(word(frameOf('cirr-decomp'), 'C3'), 'Hepatofugal');
});
