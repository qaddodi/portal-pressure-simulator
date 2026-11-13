// Blur effect off (28 Oct, Mohammad: "the non blur effect in the lobule sucks ... it looks childish now, i don't like the glow"):
// the lit lobule and sinusoid names keep their pill and ring on a solid fill, and no label glows in its own colour any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const noglass = css.split('\n').filter((l) => l.startsWith(':root[data-noglass]'));

test('with the blur off, a lit lobule or sinusoid name is the same outlined text as with it: no pill in either setting', () => {
  // (13 Nov 2026, unification audit 12: the pill went in both settings; the lit ink is one rule, figure-names-no-pill.test.js.)
  assert.ok(!noglass.some((l) => /\.lz-lab, \.lz-zone, \.sv-region\)::before/.test(l)), 'no blur-off pill rule');
});

test('with the blur off, nothing glows in its own colour: no radial cloud, no drop shadow on a label, no glowing words', () => {
  for (const l of noglass) {
    assert.doesNotMatch(l, /radial-gradient/, l.slice(0, 90));
    assert.doesNotMatch(l, /drop-shadow|text-shadow/, l.slice(0, 90));
  }
  assert.doesNotMatch(css, /@keyframes glow-in/);
  assert.doesNotMatch(css, /animation: glow-in/);
});

test('the resistance and problem pills and the figure\'s focus and term labels are not restyled by the blur setting', () => {
  assert.equal(noglass.filter((l) => /\.lz-call|#labels/.test(l)).length, 0);
});
