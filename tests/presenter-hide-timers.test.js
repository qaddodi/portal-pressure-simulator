// The presenter's cards that fade out and are then hidden by a timer (the data card, the case card), and the
// words that fade for a change of panel width: a timer of an earlier leaving never hides a card in the middle of a later fade, and
// the words are always brought back. (Source pins, as the presenter is one closure; the behaviour was looked at in a browser.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const between = (a, b) => { const i = src.indexOf(a); assert.ok(i > 0, a); const j = src.indexOf(b, i); assert.ok(j > i, b); return src.slice(i, j); };

test('two quick panel-width changes bring the words back', () => {
  const fn = between('function setPanelWidth(w) {', '// (The page carries it too');
  // Whether the fade out is this function's is found once, by the first change, and kept by the ones that follow within the 240 ms.
  assert.match(src, /let widthT = 0, widthOwn = false;/);
  assert.match(fn, /if \(!widthOwn\) widthOwn = !ui\.text\.classList\.contains\('pz-leave'\);/);
  assert.doesNotMatch(fn, /const had = /);
  // The words come back once the width is applied and a frame has passed, unless a newer change is waiting (its own timer brings them back).
  assert.match(fn, /widthT = 0;\s*if \(!ui\) \{ widthOwn = false; return; \}[^\n]*\n\s*apply\(\);\s*(?:\/\/ alloc-rare[^\n]*\s*)*nextFrame\(\(\) => \{ if \(widthT \|\| !widthOwn\) return; widthOwn = false; ui\?\.text\.classList\.remove\('pz-leave'\); \}\);/);
  // Each change still clears the timer of the one before it, and the fade is the same 240 ms.
  assert.match(fn, /clearTimeout\(widthT\);/);
  assert.match(fn, /\}, 240\);/);
});

test('a data card shown again is not hidden by the timer of its last leaving, and the timer of a second leaving is the first fade\'s', () => {
  assert.match(src, /let dataHideT = 0;/);
  const fn = between('function dataIn(', 'const showTool = ');
  // Shown (or about to be, while its cards wait): the timer is cleared before the card's state is looked at.
  assert.match(fn, /clearTimeout\(dataHideT\); dataHideT = 0;[^\n]*\n\s*if \(data\.hidden\) \{ data\.hidden = false;/);
  // Leaving: one timer, started by the first leaving; it hides the card only if it still fades out, and says it has run.
  assert.match(fn, /dataHideT \|\|= setTimeout\(\(\) => \{ dataHideT = 0; if \(data\.classList\.contains\('pz-hide'\)\) \{ data\.hidden = true; ui\?\.tools\.hide\(\); \} \}, D_SMALL \+ 20\);/);
  assert.doesNotMatch(fn, /\n\s*setTimeout\(\(\) => \{ if \(data\.classList\.contains\('pz-hide'\)\)/);
  // The case card hides the faded data card at once behind it: nothing is left to run later.
  assert.match(src, /if \(ui\.data\.classList\.contains\('pz-hide'\) && !ui\.data\.hidden\) \{ clearTimeout\(dataHideT\); dataHideT = 0; ui\.data\.hidden = true; ui\.tools\.hide\(\); \}/);
});

test('the case card, one element for every case, is not hidden by the timer of an earlier leaving', () => {
  assert.match(src, /let caseLift = null, caseCard = null, caseHideT = 0;/);
  // Up again: the old timer has nothing left to hide. Leaving again: the old timer is replaced by this leaving's own.
  assert.match(between('function cardUp(', 'async function caseRun('), /clearTimeout\(caseHideT\); caseHideT = 0;/);
  const shut = between('function caseShut() {', 'function caseFly(');
  assert.match(shut, /clearTimeout\(caseHideT\);\s*caseHideT = setTimeout\(\(\) => \{ caseHideT = 0; if \(!card\.c\.classList\.contains\('on'\)\) card\.c\.hidden = true; \}, ms\);/);
  // (Still hidden only once the card has gone: the remaining flight of a flung card, or the card's own fade.)
  assert.match(shut, /const ms = card\.flown \? Math\.max\(0, Math\.ceil\(card\.flown - performance\.now\(\)\)\) : card\.ms;/);
});
