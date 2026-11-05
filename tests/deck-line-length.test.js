// One idea per slide (docs/deck-authoring-guide.md rule 1): a slide's line stays short enough to read from the back of
// the room. The 19 lines of 45 words or more were trimmed in U20 (16 Oct): the longer sentences moved to their notes
// (and on 5 Nov the "colored by" phrases left the lines: the key names the view).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

// (Every line is 30 words or fewer: tests/deck-shape.test.js, which replaced the 45-word test.)
test('no deck has more than four objectives', () => {
  for (const d of DECKS) assert.ok((d.objectives || []).length <= 4, `${d.id}: ${d.objectives.length}`);
});
