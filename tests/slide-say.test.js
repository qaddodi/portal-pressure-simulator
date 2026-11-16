// The bar's count and the reader's line are one source (play-test, 16 Nov 2026): a case or question card standing for a slide
// tells the reader that slide at once, so "2 / n" on the bar never stands beside "Slide 1" in the hidden line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slideCount, slideCountLabel, slideSay, slideSaid } from '../src/ui/slide-say.js';


test('the count, its label and the reader\'s line name the same slide number', () => {
  for (const [i, n] of [[0, 12], [1, 12], [11, 12]]) {
    assert.equal(slideCount(i, n), `${i + 1} / ${n}`);
    assert.ok(slideCountLabel(i, n).startsWith(`Slide ${i + 1} of ${n}`));
    assert.ok(slideSay(i, n, 'Title').startsWith(`Slide ${i + 1} of ${n}`));
  }
  assert.equal(slideSay(1, 9, 'Choose'), 'Slide 2 of 9: Choose');
  assert.equal(slideSay(1, 9, ''), 'Slide 2 of 9');
});

test('a case card is the slide on screen only for the slide it came up for', () => {
  assert.equal(slideSaid({ want: 1, card: { i: 1 } }), true);
  assert.equal(slideSaid({ want: 2, card: { i: 1 } }), false, 'a card left from the slide before says nothing of this one');
  assert.equal(slideSaid({ want: 1, card: null }), false);
  assert.equal(slideSaid({ want: 0, card: { i: 0 } }), true);
});
