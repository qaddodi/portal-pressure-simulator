// The callouts' frosted glass drawn on the GPU (glass-gl.js, his "GPU glass" pick of 25 Oct): the same blur, saturation and tint
// as the CSS glass it stands in for, the browser's glass kept wherever this cannot run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLASS, parseShadow, gaussTaps, glassWanted } from '../src/ui/glass-gl.js';

const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const SRC = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');

test('the GPU glass draws the CSS glass\'s own blur, saturation and tint', () => {
  // (Since 1 Nov 2026 the CSS declares no blur at all: the GPU's is the only one, the browser's look it was matched to kept here.)
  const m = /\.cl-glass \{[^}]*background: color-mix\(in srgb, var\(--surface\) (\d+)%, transparent\);/.exec(CSS);
  assert.ok(m, 'the CSS glass');
  assert.equal(+m[1] / 100, GLASS.tint);
  assert.equal(GLASS.blur, 22, 'the one glass: the cards\' 22 px (16 px before 11 Nov 2026)');
  assert.equal(GLASS.sat, 1.15);
});

test('its blur weights are a Gaussian summing to one', () => {
  const w = gaussTaps(4);
  assert.equal(w.length, 13);
  assert.ok(Math.abs(w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(w.every((v, i) => !i || v < w[i - 1]), 'falling off from the middle');
  assert.ok(w[12] < w[0] * 0.02, 'three sigmas wide');
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
