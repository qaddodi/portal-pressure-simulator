import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The cards' text levels stay close together on every layout (audit/card-layout-recs.md).
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('wide screens: title 2.4 times the body, captions shrink with the words and never under 12 px, site tag at the caption size', () => {
  assert.match(css, /\.pz\.pz-card:not\(\.stack\):not\(\.low\) \.pz-text \{ --s-title: calc\(clamp\(32px, calc\(5\.546 \* var\(--pzh\)/);
  assert.match(css, /--s-cap: max\(12px, calc\([^;]*var\(--pz-bk, 1\)\)\);/);
  assert.match(css, /\.pz:not\(\.stack\) \.pz-site \{ font-size: var\(--s-cap\); \}/);
  assert.match(css, /\.pz:not\(\.stack\) \.pz-eq math \{ font-size: calc\(var\(--s-body\) \* 1\.15 \* var\(--eq-k, 1\)\); \}/);
});

test('phones and upright iPad: data card labels closer to the words, quick-check questions at the line size', () => {
  assert.match(css, /\.pz\.stack \.pz-data \{ --s-cap: calc\(var\(--t-cap\) \* var\(--ts, 1\) \* 1\.15\)/);
  assert.match(css, /\.pz\.stack\.tab \.pz-data \{ --s-cap: calc\(var\(--t-cap\) \* var\(--ts, 1\) \* 1\.3\)/);
  assert.match(css, /\.pz\.stack \.pz-check \{[^}]*font-size: var\(--s-lab\)/);
  assert.match(css, /\.pz\.stack\.tab \.pz-bar \{ right: calc\(15% \+ 13px\); \}/, 'pill lined up with the words on upright iPad');
});

test('a phone held sideways uses the phone sizes for its words', () => {
  assert.match(css, /\.pz\.low \.pz-text \{ --pk: 1\.4; --s-cap: calc\(var\(--t-cap\)/);
  assert.match(css, /\.pz\.low \.pz-text \.pz-h \{ font-size: calc\(var\(--s-val\) \* var\(--pz-ptk, 1\)\); \}/);
});

// Mohammad, 17 Oct ("17 px body"): a phone's slide words 1.45 times the roles (a 17.4 px body on a 390 px phone), an upright
// iPad its own 1.39 (a 19 px body, as sideways); one line spacing, 1.4, with pills slim enough to sit inside it.
test('phone slide words at 1.45, upright iPad at 1.39, one line spacing with slim pills', () => {
  assert.match(css, /\.pz\.stack \.pz-text, \.pz\.stack \.pz-panel \{ --pk: 1\.45; \}/);
  assert.match(css, /\.pz\.stack\.tab \.pz-text, \.pz\.stack\.tab \.pz-panel \{ --pk: 1\.39; \}/);
  assert.doesNotMatch(css, /--pk: 1\.7/);
  assert.match(css, /\.pz-line \{ margin: 0; font: 400 var\(--s-body\)\/1\.4 /);
  assert.doesNotMatch(css, /\.pz-line:has\(/, 'a pill no longer sets its whole paragraph wider apart');
  assert.match(css, /\.pz-val, \.pz-term \{[^}]*padding: \.04em \.45em; margin-inline: 0 \.14em;[^}]*line-height: 1\.15;/);
  assert.match(css, /\.pz-stop > :is\(\.pz-val, \.pz-term\) \{ margin-inline-end: \.08em; \}/, 'a stop sits close after its pill');
});

// A tight phone slide (upright or on its side): the title steps down first, then the body by one step, and only then further.
test('a tight phone slide shrinks its title first and its body by one step before anything else', () => {
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(js, /const mins = small \? \[\.\.\.new Set\(\[Math\.max\(floor, 0\.9\), floor, phone\(\) \? floor : 0\.5\]\)\] : \[floor\];/);
  assert.match(js, /if \(small\) \{ el\.style\.removeProperty\('--pz-ptk'\); for \(const tk of TK\.slice\(1\)\)/);
  assert.match(css, /\.pz\.stack \.pz-h \{ font-size: calc\(var\(--s-val\) \* var\(--pz-ptk, 1\)\); \}/);
});

test('a phone\'s captions under the words read smaller than the words, never under 12 px', () => {
  assert.match(css, /\.pz:is\(\.stack, \.low\) \.pz-text :is\(\.pz-eqk, \.pz-caveat\) \{ font-size: max\(12px, calc\(var\(--s-lab\) \* \.8\)\); \}/);
});
