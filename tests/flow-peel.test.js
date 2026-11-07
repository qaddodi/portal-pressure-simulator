// The flow peel (flow-peel.js): the change between the views runs gut to heart, each point on its own share.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NODE_POS } from '../src/ui/anatomy.js';
import { PEEL_DL, peelAt, peelGlow, peelRank, peelRanks } from '../src/ui/flow-peel.js';

test('a landed view is the plain picture: every point at 0 or 1 at the ends', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    assert.equal(peelAt(0, r), 0);
    assert.equal(peelAt(1, r), 1);
    assert.equal(peelGlow(0, r), 0);
    assert.equal(peelGlow(1, r), 0);
  }
});

test('the share only grows with t, so every point stays on its own anatomy-to-circuit line (the morph pieces hold)', () => {
  for (const r of [0, 0.3, 0.7, 1]) {
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const w = peelAt(i / 200, r);
      assert.ok(w >= prev - 1e-12 && w >= 0 && w <= 1);
      prev = w;
    }
  }
});

test('the gut leaves first and the heart last; the heart starts once PEEL_DL of the change has gone', () => {
  const gut = peelRank(NODE_POS.INT[1][0]), conf = peelRank(NODE_POS.CONF[1][0]), liver = peelRank(NODE_POS.SIN_R[1][0]), heart = peelRank(NODE_POS.RA[1][0]);
  assert.ok(gut < conf && conf < liver && liver < heart);
  assert.ok(peelAt(0.3, gut) > peelAt(0.3, conf) && peelAt(0.3, conf) > peelAt(0.3, heart));
  assert.equal(peelAt(PEEL_DL * peelRank(1360) - 1e-9, peelRank(1360)), 0);
  assert.equal(peelAt(1 - PEEL_DL + PEEL_DL * 0, 0), 1);   // (the gut has landed by 0.6 of the change)
});

test('neighbouring points of a course move together (no tear): the share changes little between close ranks', () => {
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    assert.ok(Math.abs(peelAt(t, 0.5) - peelAt(t, 0.51)) < 0.03);
  }
});

test('a course gets one rank a point, from its circuit x', () => {
  const r = peelRanks([[60, 0], [710, 0], [1360, 0], [2000, 0]]);
  assert.deepEqual(Array.from(r), [0, 0.5, 1, 1]);
});
