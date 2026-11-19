// A deck's slide count is one number: the slides the presenter shows (the outline before them, the quick check after), made by slideCount in
// decks.js. The Present menu said "73 slides" for a deck that opened as "1 / 74" (16 Nov 2026), because it added one by hand or counted the deck's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, slideCount, withOverview } from '../src/ui/decks.js';
import { DEMO_ALL } from '../src/ui/test-decks/demo-all-new-visuals.js';

test('the count is what the presenter shows, for every built-in deck and the demo deck', () => {
  for (const d of [...DECKS, DEMO_ALL]) assert.equal(slideCount(d), withOverview(d).slides.length, d.id);
  assert.equal(slideCount(DEMO_ALL), DEMO_ALL.slides.length + 1 + (DEMO_ALL.checks?.length ? 1 : 0));
});

test('a deck that already carries its outline (mine) is counted as it stands', () => {
  const d = withOverview(DEMO_ALL);
  assert.equal(slideCount({ ...d, mine: true }), d.slides.length);
  assert.equal(slideCount({ slides: [] }), 0);
});

test('the denominator is one number for the whole deck: the slide list the presenter holds is exactly slideCount long, for every deck and the demo', async () => {
  const { oneLadder } = await import('../src/ui/teach-extras.js');
  for (const d of [...DECKS, DEMO_ALL]) {
    const held = withOverview(d).slides.map(oneLadder);   // (what presenter-start.js holds: each step after the outline is one-to-one, so the count stays)
    assert.equal(held.length, slideCount(d), `${d.id}: the pill's n`);
    assert.equal(slideCount(d), slideCount(d), 'no hidden state');
    assert.equal(slideCount(d), d.slides.length + 1 + (d.checks?.length ? 1 : 0), `${d.id}: the deck's slides, the outline and one quick check`);
  }
});
