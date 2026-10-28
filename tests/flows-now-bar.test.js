// The flows card (tool-flows.js) shows the Healthy bar alone while the Now bar reads the same: the same parts with the same
// whole percents, decided on what the card shows so a 0.1% wobble never flickers it; the Now bar returns when any share differs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/topology.js';
import { sameShares, flowParts } from '../src/ui/tool-flows.js';

const inflow = (pv, ha) => [{ id: 'portal', name: 'Portal vein', tone: '--vein-portal', pct: pv }, { id: 'artery', name: 'Hepatic artery', tone: '--artery', pct: ha }];

test('splits read the same on whole percents, in any order, and differ on any share or part', () => {
  assert.ok(sameShares(inflow(73, 27), inflow(73, 27)));
  assert.ok(sameShares(inflow(73, 27), [...inflow(73, 27)].reverse()));
  assert.ok(!sameShares(inflow(73, 27), inflow(72, 28)));
  assert.ok(!sameShares(inflow(100, 0), inflow(73, 27)));
  assert.ok(sameShares([{ id: 'liver', pct: 100 }], [{ id: 'liver', pct: 100 }]));
  assert.ok(!sameShares([{ id: 'liver', pct: 91 }, { id: 'var', pct: 9 }], [{ id: 'liver', pct: 100 }]));
  assert.ok(!sameShares(null, inflow(73, 27)) && !sameShares(inflow(73, 27), null));
});

test('the percents the card shows decide: a model wobble that rounds to the same whole percents never flickers the Now bar', () => {
  const idx = Object.fromEntries(EDGES.map((e, k) => [e.id, k]));
  const fp = (pv, ha) => { const Q = new Array(EDGES.length).fill(0); Q[idx.PRE_R] = pv / 2; Q[idx.PRE_L] = pv / 2; Q[idx.A_HR] = ha / 2; Q[idx.A_HL] = ha / 2; return { at: { Q } }; };
  const healthy = flowParts(fp(73, 27), 'inflow');
  assert.ok(sameShares(flowParts(fp(73.3, 26.7), 'inflow'), healthy), '0.3% of wobble reads the same');
  assert.ok(sameShares(flowParts(fp(72.8, 27.2), 'inflow'), healthy));
  assert.ok(!sameShares(flowParts(fp(70, 30), 'inflow'), healthy), 'a 3% move shows');
});

test('a different split is not the same as Healthy, so the Now bar returns', () => {
  assert.ok(!sameShares(inflow(20, 80), inflow(73, 27)));
  assert.ok(!sameShares(inflow(73, 27), null), 'no Healthy bar yet: the Now bar shows');
});
