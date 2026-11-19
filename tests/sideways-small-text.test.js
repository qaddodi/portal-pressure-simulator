// Lettering on a phone held sideways (844 x 390) stays 12 px or more where a fit could take it under (19 Nov 2026, the deck sweep: 402 findings under 12 px; Mohammad:
// teaching text stays at least 12 px and never shrinks to fit). Pure parts here, the page's rules read from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitMins } from '../src/ui/card-type.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('a sideways phone fits its outline panel down to its 12 px floor and no further; every other screen keeps the usual last resort', () => {
  assert.deepEqual(fitMins([0.5], 1, true), [1], 'text already at 12 px cannot zoom at all');
  assert.deepEqual(fitMins([0.8, 0.5], 0.8, true), [0.8], 'the 12 px zoom is the only floor');
  assert.deepEqual(fitMins([0.8, 0.5], 0.8, false), [0.8, 0.5]);
  assert.deepEqual(fitMins([0.5], 0, true), [0.5], 'no known floor: the usual list');
});

test('the fit applies the 12 px floor to the outline panel on a phone on its side', () => {
  const z = src('src/ui/presenter-zoom.js');
  assert.match(z, /fitMins\(mins, shortFloor \|\| tableFloor \|\| textFloor\(el\), true\)/);
  assert.match(z, /sidePhone && !!el\.querySelector\(':scope > \.pz-outline/);
});

test('the outline gets its room from layout on a short landscape screen: two columns, the deck title on one line, tighter lists (never a zoom)', () => {
  const css = src('styles/app-05-presenter-cards.css');
  const m = /@media \(orientation: landscape\) and \(max-height: 500px\) \{\s*\.pz-outline \{ grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 250px\), 1fr\)\)[\s\S]*?\n\}/.exec(css);
  assert.ok(m, 'the sideways outline block');
  assert.match(m[0], /\.pz-panel\[data-visual="outline"\] \.pz-dtitle \{ font-size: var\(--s-big\)/);
  assert.ok(css.indexOf(m[0]) > css.indexOf('.pz.stack .pzo-obj {'), 'after the rules it overrides (same specificity: the later one wins)');
});

test('the unit under the belly instrument\'s volume never goes under 12 px (half of a 23.7 px number was 11.9)', () => {
  assert.match(src('styles/app-08-cards.css'), /\.ab \.ab-belly > \.ab-big > b small \{[^}]*font-size: max\(12px, \.5em\) !important/);
});

test('on a phone on its side, lettering a fit zooms down is set at the size the zoom brings to 12 px (--pz-min), never under its own size', () => {
  const css = src('styles/guideline-sides.css');
  const m = /@media \(orientation: landscape\) and \(max-height: 500px\) \{[\s\S]*?\n\}/.exec(css);
  assert.ok(m);
  assert.match(m[0], /--pz-min: calc\(12\.02px \/ var\(--pz-fit, 1\)\)/);
  for (const k of ['.pz-ab-cap', '.pz-side-who', '.pz-side-p', '.pz-step', '.pz-cell-t', '.pz-rail-liver span', '.pz-cite', '.pze-src']) assert.ok(m[0].includes(k), `${k} keeps 12 px under a fit`);
  assert.equal((m[0].match(/var\(--pz-min\)/g) || []).length >= 5, true);
});
