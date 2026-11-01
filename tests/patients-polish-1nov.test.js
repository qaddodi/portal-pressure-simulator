// Patients mode polish, 1 Nov: what moves must keep easing, and a round dot stays round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), util = read('src/ui/util.js'), menu = read('src/ui/menu.js'), compare = read('src/ui/compare.js');

test('the preview card\'s profile dots are round strokes, not circles stretched with the curve', () => {
  assert.doesNotMatch(menu, /sv\('circle'/);
  assert.match(menu, /class: 'hp-ring'/);
  assert.match(css, /\.hp-ring, \.hp-dot \{ fill: none; stroke-linecap: round; vector-effect: non-scaling-stroke; \}/);
});

test('the comparison table is written in place and its change column takes its colour at once', () => {
  assert.match(compare, /if \(tableEl\._key !== key\)/);
  assert.match(compare, /if \(c\.b\.textContent !== b\) c\.b\.textContent = b;/);
  assert.match(css, /\.cmp-table td\.d \{ transition: none; \}/, '(1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
});

test('a History row whose details change stays where it stands, and fades with its class', () => {
  const rec = util.slice(util.indexOf('export function reconcile'), util.indexOf('export function swapText'));
  assert.doesNotMatch(rec, /o\.replaceWith\(r\)/);
  assert.match(rec, /morphRow\(o, r,/);
  assert.match(css, /\.tl-pop-row \{ transition: opacity var\(--d-small\) var\(--ease\); \}/);
});
