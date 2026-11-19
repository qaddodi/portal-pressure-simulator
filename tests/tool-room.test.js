// An instrument's pictures are sized against the room its data card really has (--pz-room), never the window, and a card is fitted again when its
// instrument grows after the first fit (deck sweep, 19 Nov 2026: 71 "content runs past its box" findings, stiffness 8 74 px over on a 1440 x 780 Mac).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toolRoomOf } from '../src/ui/tool-room.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the room is the card cap less its padding, its other parts and its gaps; never negative, never the instrument', () => {
  // (a 396 px card, 2 x 25 padding, a 32 px header, one 6 px gap between the two parts)
  assert.equal(toolRoomOf({ cap: 396, pad: 50, parts: [32], gap: 6 }), 308);
  assert.equal(toolRoomOf({ cap: 396, pad: 28, parts: [32], gap: 6 }), 330);
  assert.equal(toolRoomOf({ cap: 100, pad: 50, parts: [80], gap: 6 }), 0);
  assert.equal(toolRoomOf({ cap: 0, pad: 0, parts: [] }), 0);
  assert.equal(toolRoomOf({ cap: 300.9, pad: 0, parts: [] }), 300);
  // (no other part: one row, no gap)
  assert.equal(toolRoomOf({ cap: 200, pad: 20, parts: [] }), 180);
});

test('a data card is fitted again when its instrument changes height, not only when the card box does', () => {
  const z = read('src/ui/presenter-zoom.js');
  assert.match(z, /classList\.contains\('pz-tool'\) \|\| readStyle\(c\)\.maxHeight !== 'none' \? ':' \+ readMetric\(c, 'offsetHeight'\)/, 'fitSig counts the instrument\'s own height');
});

test('the data card\'s fit floor counts only the lettering its zoom reaches (an instrument is never zoomed)', () => {
  const z = read('src/ui/presenter-zoom.js');
  assert.match(z, /function minText\(el, zoomed = false\)/);
  assert.match(z, /if \(zoomed && e\?\.closest\('\.pz-tool\[data-kind\]'\)\) continue;/);
  assert.match(z, /function dataFloor\(el\) \{\s*const L = minText\(el, true\);/);
});

test('every picture whose height does not follow the card\'s fit takes the card\'s room as its ceiling', () => {
  const css = read('styles/app-11-deck-visuals.css');
  for (const [what, re] of [
    ['profile', /\[data-kind="profile"\] \.pz-prof \{ max-height: var\(--pz-room, none\); \}/],
    ['plane', /\.pze-plot\.pze-incard \{[^}]*var\(--pz-room, 9999px\)/],
    ['plane without a key', /\.pze-plot\.pze-incard\.pze-ownwords \{[^}]*var\(--pz-room, 9999px\)/],
    ['stent', /\.pz-data\.col \.sc > \.sc-stage \{[^}]*var\(--pz-room, 9999px\)/],
  ]) assert.match(css, re, `${what} reads --pz-room`);
  assert.match(read('src/ui/tool-path.js'), /getPropertyValue\('--pz-room'\)/, 'path card reads --pz-room');
  assert.match(read('src/ui/visual-plane.js'), /getPropertyValue\('--pz-room'\)/, 'Baveno plane reads --pz-room');
  assert.doesNotMatch(read('src/ui/tool-path.js'), /const room = Math\.max\(300, viewSize\(\)\.h \* FIT_SHARE\);/, 'path no longer budgets by the window alone');
});

test('a short window stands an instrument card tighter top and bottom', () => {
  assert.match(read('styles/app-09-tests.css'), /\.pz\.short:not\(\.stack\):not\(\.low\) \.pz-data\.pz-lt\.has-tool \{ padding-block: 14px; \}/);
});
