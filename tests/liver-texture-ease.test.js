import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liverSurface, smooth01 } from '../src/ui/liver-morph.js';

// The cirrhotic liver's surface (its nodules and septa, and the gloss going) follows the scarring through the liver's ease, read past
// its ends (c / 0.5 at full scarring is 2). The Doppler's own unclamped ease, destructured into the stage's scope by the S1.3 split,
// stood in for the clamped one: above half scarring the nodules faded out (a negative opacity past 0.75) and the healthy gloss came back
// over a nodular outline (Mohammad, 6 Nov 2026, stiffness slide 3). The congestion's dusk and tint read it the same way. The stage's parts
// now import it themselves, and rules-lint (shadow) refuses a part's result that binds a name its file imports.

test('the liver\'s ease is clamped at both ends', () => {
  assert.equal(smooth01(-1), 0);
  assert.equal(smooth01(2), 1);
  assert.equal(smooth01(5), 1);
  assert.equal(smooth01(0.5), 0.5);
});

test('more scarring never brings the gloss back or fades the nodules', () => {
  let g0 = Infinity, n0 = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const c = i / 200, { gloss, nod } = liverSurface(c);
    assert.ok(gloss >= 0 && gloss <= 1 && nod >= 0 && nod <= 1, `c ${c}: gloss ${gloss}, nodules ${nod} within 0 … 1`);
    assert.ok(gloss <= g0 + 1e-12, `c ${c}: the gloss came back (${g0} → ${gloss})`);
    assert.ok(nod >= n0 - 1e-12, `c ${c}: the nodules faded (${n0} → ${nod})`);
    g0 = gloss; n0 = nod;
  }
});

test('full scarring: the nodules whole and a quarter of the gloss; healthy: all gloss, no nodules', () => {
  assert.deepEqual({ ...liverSurface(1) }, { gloss: 0.25, nod: 1 });
  assert.deepEqual({ ...liverSurface(0) }, { gloss: 1, nod: 0 });
  // (The compensated preset, 0.4, as before the fix: the slide's starting look is unchanged.)
  const s = liverSurface(0.4);
  assert.equal(s.gloss.toFixed(3), '0.444');
  assert.equal(s.nod.toFixed(3), '0.654');
});
