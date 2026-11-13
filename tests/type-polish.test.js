// Premium feel R9: the last five percent of the type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('R9 card and dialog titles balance their lines; long prose keeps a lone word off its last line', () => {
  assert.match(css, /:is\(\.p-title h2, \.modal h2\) \{ text-wrap: balance; \}/);
  assert.match(css, /:is\(\.pz-check, \.pz-outline :is\(ol, ul\), \.pzc-row, \.ac-about\) \{ text-wrap: pretty; \}/);
  assert.match(css, /:is\(\.pz-h, \.pz-panel \.pz-dtitle, \.modal h2, \.p-title h2\) \{ hanging-punctuation: first; \}/);
});

test('R9 slide titles stay pretty: balanced, a three-line title kept to the left 60 % of a wide card (Mohammad, 19 Oct)', () => {
  const rule = css.match(/^\.pz-h \{[^}]*\}/m)[0];
  assert.match(rule, /text-wrap: pretty;/);
  assert.doesNotMatch(rule, /text-wrap: balance/);
});

test('R9 optical sizing and kerning are on for the whole interface', () => {
  assert.match(css, /body \{ font-optical-sizing: auto; font-kerning: normal; \}/);
  // (Nothing may turn them off further down: no font-variation-settings, no `none` optical sizing, no kerning off.)
  assert.doesNotMatch(css, /font-optical-sizing: none|font-kerning: none/);
  assert.doesNotMatch(css, /font-variation-settings:\s*['"]opsz/);
});
