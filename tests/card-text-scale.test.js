import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The cards' text levels stay close together on every layout (audit/card-layout-recs.md).
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('wide screens: title 2.4 times the body, captions shrink with the words and never under 12 px, site tag at the caption size', () => {
  assert.match(css, /\.pz\.pz-card:not\(\.stack\) \.pz-text \{ --s-title: calc\(clamp\(32px, calc\(5\.546 \* var\(--pzh\)/);
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
  assert.match(css, /\.pz\.low \.pz-text \.pz-h \{ font-size: var\(--s-val\); \}/);
});
