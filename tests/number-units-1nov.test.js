// Numbers and units in cards (1 Nov): the hover tip's rows share three columns (name / number / unit) so the numbers' points line up
// whatever the unit; the action card's number-to-unit gap is the Readouts tiles' 3 px, not 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the hover tip rows line up their numbers in one column and their units in another', () => {
  assert.match(css, /\.hover-tip \.rows \{ display: grid; grid-template-columns: 1fr minmax\(5ch, auto\) auto;/);
  assert.match(css, /\.hover-tip \.r, \.hover-tip \.r b \{ display: contents; \}/);
  assert.match(css, /\.hover-tip \.r \.u \{ grid-column: 3; text-align: left; \}/);
});

test('the action card reading keeps 3 px between its number and unit, and 10 px before its change', () => {
  assert.match(css, /\.ac-num \{ display: inline-flex; align-items: baseline; gap: 0;/);
  assert.match(css, /\.ac-value \.unit \{ font-size: var\(--fs-12\); margin-left: 3px; \}/);
  assert.match(css, /\.ac-delta \{ margin-left: 10px;/);
});
