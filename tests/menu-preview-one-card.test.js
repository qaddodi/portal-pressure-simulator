// The "/" find menu's preview card is one card at a time, and its words come in cleanly (8 Nov 2026, Mohammad: "it's showing two case cards at a time from
// the menu"). A second hover before the first card's fade had finished left two cards of words in the flow; a card still going out from a hide stood
// beside the new one. Read from the source (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/menu.js', import.meta.url), 'utf8');

test('every card of words still in the preview leaves the flow at once, not only the first', () => {
  assert.match(src, /for \(let i = olds\.length - 1; i >= 0; i--\)/);
  assert.match(src, /classNow\(o, 'um-pv-old', true\)/);
  assert.doesNotMatch(src, /classSoon\(old, 'um-pv-old'/);
});

test('a preview card still going out is taken off when a new one is made, and the first words do not fade in twice', () => {
  assert.match(src, /pvGone\?\.remove\(\); pvGone = null;/);
  assert.match(src, /if \(!fade\) next\.style\.animation = 'none';/);
});
