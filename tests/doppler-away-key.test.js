// The Doppler's colour key (S3): which side of the baseline is "away", in two lengths, and the brighter away blue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};

test('the colour modes carry no caption under the baseline (Mohammad, 8 Nov: remove "below the line: away from the probe…")', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /awayKey|SL\.key/);
});

test('away is the brighter blue and the red wale one cherry red, each a token', () => {
  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  assert.match(css, /--dop-away: #5072E0;/);
  assert.match(css, /--red-wale: #E8404A;/);
  assert.doesNotMatch(css, /--endo-red-wale/, 'one token for the figure and the scope');
});
