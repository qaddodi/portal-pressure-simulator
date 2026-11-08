// Varices and bands on the figure (docs/recommendations/visual-style.md V3, D8): the fundal beads' period, the red wale amount, the second
// harmonic on the tortuosity, and the ligation bands laid on the drawn esophagus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAD_LAMBDA, BEAD_LAMBDA_FUNDAL, BEAD_SITE, WALE_MAX, beadLambda, beadRadius, varixBead, varixWale } from '../src/ui/varix-bead.js';
import { WIGGLE_A2, WIGGLE_K2, wiggleAt } from '../src/ui/wiggle-math.js';
import { BAND, bandRing } from '../src/ui/band-ring.js';
import { esoAt } from '../src/ui/balloon-eso.js';

test('the fundal channels bead on a longer period than the esophageal ones, and each follows its own varix', () => {
  assert.equal(BEAD_LAMBDA_FUNDAL, 30);
  assert.equal(beadLambda('C1a'), BEAD_LAMBDA);
  assert.equal(beadLambda('C2'), 30);
  assert.equal(beadLambda('C5'), 30);
  assert.deepEqual(Object.keys(BEAD_SITE).sort(), ['C1a', 'C2', 'C5']);
  assert.equal(BEAD_SITE.C2, 'gastricVarix');
  assert.equal(BEAD_SITE.C5, 'gastricVarix');
  // the swell crosses the resting radius every half period: 15 units apart on a fundal channel, 11 on an esophageal one
  const len = 120, r = 2, b = 0.3, at = (x, lam) => beadRadius(r, b, x / len, len, 0, 0, lam);
  for (const x of [15, 30, 45]) assert.ok(Math.abs(at(x, 30) - r) < 1e-9, `fundal ${x}`);
  for (const x of [11, 22, 33]) assert.ok(Math.abs(at(x, 22) - r) < 1e-9, `esophageal ${x}`);
  assert.ok(Math.abs(at(15, 22) - r) > 0.05, 'the esophageal period does not cross at 15');
  // a smaller varix beads less, none at rest
  assert.ok(varixBead(8.5) > varixBead(7) && varixBead(7) > varixBead(6.5) && varixBead(6.5) > 0);
  assert.equal(varixBead(3), 0);
  // the default period is the esophageal one
  assert.equal(beadRadius(2, 0.2, 0.3, 100, 0.5), beadRadius(2, 0.2, 0.3, 100, 0.5, 0, BEAD_LAMBDA));
});

test('the red wale tint is off when the reading is off, and grows with the wall ratio and the varix size', () => {
  assert.equal(varixWale(false, 0.95, 1), 0);
  assert.equal(varixWale(true, NaN, 1), 0);
  assert.equal(varixWale(true, 0.7, 1), 0, 'no pop as the ratio crosses the cut-off');
  assert.ok(varixWale(true, 0.74, 1) > 0);
  assert.ok(varixWale(true, 0.8, 1) > varixWale(true, 0.74, 1));
  assert.equal(varixWale(true, 0.9, 1), WALE_MAX);
  // a smaller varix wears less of it
  assert.ok(varixWale(true, 0.9, 0.2) < varixWale(true, 0.9, 1));
  assert.ok(varixWale(true, 0.9, 0) > 0 && varixWale(true, 0.9, 0) < varixWale(true, 0.9, 0.5));
  assert.ok(varixWale(true, 0.9, 1) <= WALE_MAX);
});

test('the tortuosity has a second harmonic at a third of the amplitude on an incommensurate period', () => {
  assert.ok(Math.abs(WIGGLE_A2 - 1 / 3) < 1e-9);
  assert.ok(WIGGLE_K2 > 1 && Math.abs(WIGGLE_K2 - Math.round(WIGGLE_K2)) > 0.1, 'not a whole number of the base');
  const k = (2 * Math.PI) / 90, amp = 4;
  // not one pure sine: it differs from the base wave, by at most a third of the amplitude
  let maxDiff = 0, peak = 0;
  for (let d = 0; d < 600; d += 0.5) {
    const w = wiggleAt(amp, 1, d, k, 0.7), base = amp * Math.sin(d * k + 0.7);
    maxDiff = Math.max(maxDiff, Math.abs(w - base)); peak = Math.max(peak, Math.abs(w));
  }
  assert.ok(maxDiff > 0.9 * amp / 3 && maxDiff <= amp / 3 + 1e-9, `second harmonic ${maxDiff}`);
  assert.ok(peak <= amp * (1 + 1 / 3) + 1e-9);
  // it does not repeat after the base period
  assert.ok(Math.abs(wiggleAt(amp, 1, 20, k, 0.7) - wiggleAt(amp, 1, 20 + 90, k, 0.7)) > 0.05);
  // the envelope and the amplitude still scale it, and a flat vessel stays flat
  assert.ok(wiggleAt(amp, 0, 33, k, 1) === 0);
  assert.ok(wiggleAt(0, 1, 33, k, 1) === 0);
  assert.ok(Math.abs(wiggleAt(2 * amp, 1, 33, k, 1) - 2 * wiggleAt(amp, 1, 33, k, 1)) < 1e-9);
});

test('the ligation bands lie on the drawn esophagus, inside its walls, turned to its line', () => {
  for (let i = 0; i < 4; i++) {
    const b = bandRing(i), e = esoAt(b.cy);
    assert.ok(b.cy + BAND.ry + BAND.stroke / 2 < 251, `band ${i} is above the esophagus's end (y 251)`);
    assert.ok(Math.abs(b.cx - e.c) < 1e-9, 'centred on the esophagus');
    assert.ok(b.rx > 5 && b.rx < e.h, `band ${i} spans most of the lumen (${b.rx} of ${e.h})`);
    for (const [x, y] of b.pts) { const w = esoAt(y); assert.ok(Math.abs(x - w.c) <= w.h - BAND.stroke / 2, `band ${i} point ${x},${y} is inside the walls`); }
    assert.match(b.d, /^M.* Z$/);
  }
  // the first sits on the esophagus and the next ones climb it
  assert.ok(bandRing(0).cy > bandRing(1).cy && bandRing(1).cy > bandRing(2).cy);
  // the ring turns with the esophagus: it is not a level ellipse (its axis follows the centreline's lean)
  const b = bandRing(0), lo = b.pts.reduce((m, p) => (p[1] < m[1] ? p : m)), hi = b.pts.reduce((m, p) => (p[1] > m[1] ? p : m));
  assert.ok(b.lean > 0.02, 'the esophagus leans right as it goes down');
  assert.ok(Math.abs(hi[0] - lo[0]) > 0 && hi[1] - lo[1] > 2 * BAND.ry - 0.5);
  // the old straight line ran past the right wall
  const old = (y) => 789 + (y - 24) * 0.066, o = esoAt(240);
  assert.ok(old(240) + 11 > o.c + o.h - 1, 'the old band poked past the wall');
});
