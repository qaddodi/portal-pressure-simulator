// One idea per slide (docs/deck-authoring-guide.md rule 1): a slide's line stays short enough to read from the back of
// the room. The 19 lines of 45 words or more were trimmed in U20 (16 Oct): the longer sentences moved to their notes
// (and on 5 Nov the "colored by" phrases left the lines: the key names the view).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, withOverview } from '../src/ui/decks.js';

// (Every line is 30 words or fewer: tests/deck-shape.test.js, which replaced the 45-word test.)
// The opening "Outline and objectives" slide has to fit an iPhone card without scrolling (Mohammad, 17 Nov: the HVPG talk listed
// all twelve slide titles and four objectives). So every deck, as the app builds the slide (withOverview): 3 to 5 outline items,
// each a short section name (a deck with fewer than 3 or more than 5 kicker groups sets `sections`), and 2 to 3 objectives of
// about two phone lines each.
test('every deck opens on a short outline and two or three short objectives', () => {
  for (const d of DECKS) {
    const o = withOverview(d).slides[0];
    assert.ok(o.outline.length >= 3 && o.outline.length <= 5, `${d.id}: ${o.outline.length} outline items (set \`sections\`): ${o.outline.join(' | ')}`);
    for (const k of o.outline) assert.ok(k.length <= 32, `${d.id}: outline item too long (${k.length}): ${k}`);
    assert.ok(o.objectives.length >= 2 && o.objectives.length <= 3, `${d.id}: ${o.objectives.length} objectives`);
    for (const x of o.objectives) assert.ok(x.length <= 100, `${d.id}: objective too long (${x.length}): ${x}`);
  }
});
