import { stageSource } from './stage-src.js';
// Leftover phone layout bugs, 1 Nov 2026 (source pins, nobody looked at these in a test browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('an upright phone gives the name the room the widest key leaves it, so it wraps the same on every lens', () => {
  assert.match(css, /\.app\.thumb \.topbar \.tb-id \{ max-width: calc\(100% - 136px - clamp\(48px, calc\(100vw - 302px\), 88px\)\); \}/);
});

test('a label shortened past the round\'s allowance is put back whole (a rescue keeps the number)', () => {
  assert.match(stage, /if \(\(it\.short \|\| 0\) <= maxShort\) return placeMulti\(it, dirs, passes, from, to, final, maxShort\); Object\.assign\(it, whole\)/);
});

test('menu rows keep their own height; the menu scrolls instead of squeezing them onto the next row', () => {
  assert.match(css, /\.menu > :is\(\.menu-item, \.lens-opt, \.menu-title, \.menu-group\) \{ flex-shrink: 0; \}/);
});

test('a small Ascites belly is 84 px (its mL/day line cleared the circle by less than the text)', () => {
  const ins = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(ins, /\n\s+el\.dataset\.belly = '84';/);
  assert.doesNotMatch(ins, /belly=0/);
  assert.match(css, /\.pz-tool \.ab\[data-belly\] \.ab-belly \{ width: clamp\(84px, calc\(10 \* var\(--pzh\)\), 120px\); height: clamp\(84px, calc\(10 \* var\(--pzh\)\), 120px\); \}/);
});
