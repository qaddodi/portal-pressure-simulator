// A card that grows keeps its top still (7d, play-test 16 Nov 2026: "The portal circulation" 11/11, Show answer re-centred the card and everything jumped 26 px).
// Root cause: .pz-panel is centred (top 50%, translate -50% -50%), so any growth moves its top up by half the growth. The rule that hangs a card that holds the quick
// check from its open height lives in scripts/source-shapes/pins-mixed-b.mjs (a pin: 7d); this holds the arithmetic it relies on.
import test from 'node:test';
import assert from 'node:assert/strict';

// (top = 50% - open/2, with no translate: a card of any height H <= open has the same top, so it only lengthens downward; the old rule moved it by (open - H) / 2.)
const topHung = (parent, open) => parent / 2 - open / 2;
const topCentred = (parent, h) => parent / 2 - h / 2;

test('hung from its open height, a card\'s top does not move as it grows; centred, it moved by half the growth', () => {
  const parent = 900, open = 480;
  for (const h of [380, 420, 454, 480]) {
    assert.equal(topHung(parent, open), 210, `${h}`);
    assert.equal(topCentred(parent, h) - topCentred(parent, open), (open - h) / 2);
  }
  assert.equal(topCentred(900, 454) - topCentred(900, 480), 13, 'the jump a 26 px growth made (Show answer, 11/11)');
});
