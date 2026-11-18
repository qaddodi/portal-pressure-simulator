// A compare button that switches the patient brings its words with it (presenter-question.js variantWords). A slide's title and line
// are written for one patient, so a button that changed only the figure left them describing the other one: Collaterals and varices 8,
// Budd-Chiari under the heart-failure title; Two lesions 8, the "Both" numbers under "Clot only" (Mohammad's play-test, 16 Nov 2026).
// Every button that switches the patient (a preset, another slide's state, or the slide's own beside such buttons) must therefore say
// what its words are: a title and a line of its own, the words of the slide it names (slide:), or same: true (the slide's words hold for
// every patient it lists, as a table that compares them all).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { TILE } from '../src/ui/table-marks.js';

const switches = (o) => !!(o.preset || o.slide);
const buttons = [];
for (const d of DECKS) for (const s of d.slides) if (s.compare?.some(switches)) for (const o of s.compare) if (!o.own && switches(o)) buttons.push({ deck: d, s, o, where: `${d.id}/${s.id} "${o.label}"` });

test('there are slides whose buttons switch the patient (so this test holds something)', () => {
  assert.ok(buttons.length >= 20, `${buttons.length} buttons`);
});

test('every patient-switching compare button gives its words: its own title and line, another slide, or same: true', () => {
  for (const { deck, o, where } of buttons) {
    if (o.slide) { assert.ok(deck.slides.some((x) => x.id === o.slide), `${where}: no slide "${o.slide}"`); continue; }
    if (o.same) { assert.ok(!o.title && !o.line, `${where}: same: true with words of its own`); continue; }
    assert.ok(o.title || o.line, `${where}: the button switches the patient but the title and line stay the other patient's (give it title and line, or same: true)`);
  }
});

test('a button\'s own line reads values the tiles know, and a title names no number', () => {
  for (const { o, where } of buttons) {
    for (const m of (o.line || '').matchAll(/\{([^}@:]+)(?:@[\w-]+)?(?::0)?\}/g)) {
      if (/^[<>≥≤]/.test(m[1]) || /\d/.test(m[1])) continue;
      assert.ok(TILE[m[1]], `${where}: {${m[1]}} is no reading`);
    }
    assert.ok(!/\{|\d/.test(o.title || ''), `${where}: the title carries a number`);
  }
});
