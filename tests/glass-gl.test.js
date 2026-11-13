// The callouts' frosted glass drawn on the GPU (glass-gl.js, his "GPU glass" pick of 25 Oct): the same blur, saturation and tint
// as the CSS glass it stands in for, the browser's glass kept wherever this cannot run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as GL from '../src/ui/glass-gl.js';
import { CARD, SMOOTH, parseShadow, glassWanted } from '../src/ui/glass-gl.js';

const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const SRC = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');

test('one glass look: CARD is the only look glass-gl.js exports, and every stand-in fill for the glass is the one tint', () => {
  // (Unification audit 13, 13 Nov 2026: the callouts' GLASS repeated CARD and the liver pane's PANE had no caller; both went with the pane option.)
  const looks = Object.entries(GL).filter(([, v]) => v && typeof v === 'object' && 'blur' in v && 'sat' in v).map(([k]) => k);
  assert.deepEqual(looks, ['CARD'], 'a second glass look');
  assert.equal(CARD.blur, 22, 'the one glass: 22 px (16 px before 11 Nov 2026)');
  assert.equal(CARD.sat, 1.15);
  assert.equal(CARD.tint, 0.66);
  // (The one tint: the surface at --pz-frost, 66 %, the GPU's CARD.tint; the callouts' glass, the menus' and the tooltip's declare it.)
  assert.match(CSS, /:root \{ --pz-frost: 66%; \}/);
  assert.equal(0.66, +/--pz-frost: (\d+)%/.exec(CSS)[1] / 100);
  assert.match(CSS, /\.cl-glass \{[^}]*background: var\(--glass-tint\);/);
  assert.match(CSS, /\.tooltip \{ --gl-tint: var\(--glass-tint\);/);
  // (Where the browser has no backdrop-filter, the stand-in fill is that tint too, never a 90-odd % of its own.)
  for (const line of CSS.split('\n').filter((l) => l.startsWith('@supports not ((backdrop-filter'))) assert.doesNotMatch(line, /color-mix\([^)]*9\d%/, line.slice(0, 160));
});

test('its filter is the field (12 Nov 2026, his F4): 72 px cells over a copy averaged at 64 px a texel, its reads inside the parts made', () => {
  assert.deepEqual([SMOOTH.scale, SMOOTH.cell], [64, 72]);
  // (The parts are each glass's box grown by two texels (sharePlan's keep, with no blur taps): a bilinear read within one texel of the box stays inside.)
  assert.ok(SMOOTH.reach <= SMOOTH.scale, 'reads held within a texel of the glass');
});

test('a callout\'s shadow is read from its computed style', () => {
  assert.deepEqual(parseShadow('rgba(16, 20, 30, 0.22) 0px 8px 24px 0px'), { c: [16 / 255, 20 / 255, 30 / 255, 0.22], x: 0, y: 8, blur: 24, spread: 0 });
  assert.equal(parseShadow('none'), null);
  assert.equal(parseShadow('rgba(0, 0, 0, 0.2) 0px 0px 4px 0px inset'), null);
  assert.equal(parseShadow('rgb(0, 0, 0) 1px 2px').blur, 0);
});

test('the browser\'s glass stays with the blur effect off, reduced transparency, or no backdrop blur', () => {
  const doc = (noglass) => ({ documentElement: { hasAttribute: (k) => k === 'data-noglass' && noglass } });
  const win = (reduce, can = true) => ({ matchMedia: () => ({ matches: reduce }), CSS: { supports: () => can } });
  assert.equal(glassWanted(doc(false), win(false)), true);
  assert.equal(glassWanted(doc(true), win(false)), false);
  assert.equal(glassWanted(doc(false), win(true)), false);
  assert.equal(glassWanted(doc(false), win(false, false)), false);
});

test('the glass shader works out the drop-shadow covers only where the card does not fully cover the pixel (Perf A6)', () => {
  const main = SRC.slice(SRC.indexOf('float m = uMode == 1 ? boxCover'), SRC.indexOf('if (m <= 0.0) { if (sa <= 0.001)'));
  const guard = main.indexOf('if (m < 1.0) {');
  assert.ok(guard > 0, 'the shadow covers sit inside an m < 1.0 branch');
  for (const k of ['float d0 =', 'float d1 =', 'sa = 1.0 - (1.0 - d0)', 'sc = sa > 0.0']) assert.ok(main.indexOf(k) > guard, k + ' is inside the branch');
  assert.ok(main.indexOf('float sa = 0.0;') < guard && main.indexOf('vec3 sc = vec3(0.0);') < guard, 'sa and sc start at 0 before the branch');
});
