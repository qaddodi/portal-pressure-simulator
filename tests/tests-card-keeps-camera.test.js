// Opening or closing a card keeps the zoom and pans the view (Mohammad, 17 Nov 2026: "opening the test card should not zoom to fit automatically on
// mac at least", then "even on phone", then: "the zoom should remain the same when opening the cards; but the view should shift to keep as much as
// possible within the available window"). It reverses the 13 Nov U3 rule, which fitted (resized) the figure to the room the cards leave.
// Root cause: the framing counted the open cards in the room it SIZED the figure in, so every card change (main.js refitStage, the card's pps:occ, the
// resize after it) glided the figure to a smaller fit; the lobule did the same with its own free room (finding 21: zoomed in on a Mac, Tests blanked it).
// Now the size comes from the bars' room alone (stage-fit.js fIns, lobule-zoom.js liveFreeInto) and the cards only pan (card-clear.js panInto).
import test from 'node:test';
import assert from 'node:assert/strict';
import { panInto } from '../src/ui/card-clear.js';


test('panInto: inside stays, narrower moves just far enough, wider is centred (equal loss at both ends)', () => {
  assert.equal(panInto(100, 400, 0, 1000), 0, 'already inside');
  assert.equal(panInto(700, 1100, 0, 1000), -100, 'a card took the right: just clear of it');
  assert.equal(panInto(-50, 300, 0, 1000), 50, 'off the left edge: brought in');
  assert.equal(panInto(0, 1200, 0, 700), -250, 'wider than the room: centred in it, the zoom is not touched');
  assert.equal(panInto(0, 1200, 500, 1200), 250, 'centre to centre');
  assert.equal(panInto(5, 5, 0, 10), 0, 'an empty span asks nothing');
  assert.equal(panInto(0, 10, 5, 5), 0, 'an empty room asks nothing');
});
