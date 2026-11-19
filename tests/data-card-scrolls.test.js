// A data card that cannot be made to fit scrolls up and down inside its box instead of having its foot cut off (18 Nov 2026, the layout sweep:
// 31 data cards on an iPhone held sideways, 844 x 390, ran 3 to 254 px past their box; the path cards, a forest, the stent chart).
// Root cause: the stacked layout leaves the data card about 245 px under a words card of 63 px, a picture cannot be shorter than its 12 px lettering
// allows, and the card's own `overflow: clip` hid the rest with no way to reach it. This holds the pieces together (the fit sets the class, the
// stylesheet scrolls vertically and never sideways, the judge names it) and the 12 px floor of the words' zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORDS_MIN_PX } from '../src/ui/card-type.js';

const zoomSrc = readFileSync(new URL('../src/ui/presenter-zoom.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app-05-presenter-cards.css', import.meta.url), 'utf8');

test('the fit marks a stacked data card that still overflows, and clears the mark at the start of every fit', () => {
  assert.match(zoomSrc, /el\.classList\.remove\('pz-scrolls'\);\s*\n\s*fitFlowTime\(el\)/, 'removed before the card is measured');
  assert.match(zoomSrc, /if \(\(el === live\.ui\.data \|\| el === live\.ui\.panel\) && live\.ui\.root\.classList\.contains\('pz-wide'\) && ovOf\(el\)\.v > 1\) el\.classList\.add\('pz-scrolls'\);/);
});

test('a scrolling data card scrolls up and down only', () => {
  const rule = css.match(/\.pz-data\.pz-scrolls, \.pz-panel\.pz-scrolls \{([^}]*)\}/);
  assert.ok(rule, 'there is a .pz-data.pz-scrolls rule');
  assert.match(rule[1], /overflow-y:\s*auto/);
  assert.match(rule[1], /overflow-x:\s*hidden/, 'never sideways: a phone\'s swipe opens the next card');
  assert.doesNotMatch(rule[1], /overflow-x:\s*(auto|scroll)/);
  assert.match(rule[1], /overscroll-behavior:\s*contain/);
});

test('the words\' zoom never takes lettering under the 12 px floor (it was 11.5: a tile\'s unit read 11.6 px on an iPhone on its side)', () => {
  assert.equal(WORDS_MIN_PX, 12);
  assert.match(zoomSrc, /const zMin = Math\.max\(0\.5, Math\.min\(1, WORDS_MIN_PX \/ sm\)\)/);
  assert.doesNotMatch(zoomSrc, /11\.5 \/ sm/);
});

test('a visual panel on the stacked layout keeps 12 px as its floor and scrolls for the rest', () => {
  assert.match(zoomSrc, /if \(L <= 12 && el === live\.ui\.panel && live\.ui\.root\.classList\.contains\('pz-wide'\)\) return 1;/);
});
