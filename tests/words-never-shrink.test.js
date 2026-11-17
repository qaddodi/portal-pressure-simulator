// No layout step takes the teaching card's words down for another card's height (Mohammad, 17 Nov 2026, "Fix this issue everywhere"): not a phone's plan
// (tests/phone-words-plan.test.js), not the Mac and iPad stack (tests/wide-words-regular.test.js), and not, last of the three, the step at a text size above
// 100 %, where the words' card zoomed down (12 px at most) to leave a data card its room. The one fit left on the words is fitCards's own, for words taller
// than their own card; a phone on its side keeps its steps (sidewaysWords), which Mohammad asked for on 3 Nov.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ladders = readFileSync(new URL('../src/ui/presenter-ladders.js', import.meta.url), 'utf8');
const code = ladders.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

test('the layout never zooms the words down to make room for a data card at a larger text size', () => {
  assert.doesNotMatch(code, /wordsFloor\(|wordsHeightAt\(/, 'no call that asks how far the words may shrink');
  assert.doesNotMatch(code, /labelScale\(\) > 1/, 'no step that runs only at a text size above 100 %');
  assert.doesNotMatch(code, /wordsCap = room/, 'the words\' card is never held to what the data card lacks');
});
