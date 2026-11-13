// The Tube patch's depth is the fragment's (docs/recommendations/tube-renderer-lobule-plan.md "The rules", brief L-D): a lumen by the patch's z (zK) and then
// the height (hK), an outline under every lumen with the nearest wall nearest. The strips write none (their depth is their geometry's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';
import { preprocess } from './glsl-pp.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { vesselFS } = await import('../src/ui/veins-gl.js');
const { TUBE_FS_LEVEL } = await import('../src/ui/veins-mesh-glsl.js');
const { TUBE_LEVEL } = await import('../src/ui/tube-geo.js');

const patch = preprocess(vesselFS(false, 2, 1)), strip = preprocess(vesselFS(true, 1, 1));

test('the numbers the patch text uses are tube-geo.js\'s levels', () => {
  for (const k of Object.keys(TUBE_FS_LEVEL)) assert.equal(TUBE_FS_LEVEL[k], TUBE_LEVEL[k], k);
});

test('the patch writes gl_FragDepth from the table (outline under every lumen, lumen by zK * z + hK), the strip none; both lint', () => {
  assert.equal(strip.includes('gl_FragDepth'), false);
  const m = patch.match(/gl_FragDepth = keyBase \+ \(1\.0 - \(tubePart == 0 \? 0\.2 \+ 0\.05 \* \(1\.0 - clamp\(Dk \/ 255\.0, 0\.0, 1\.0\)\) : 0\.3 \+ 0\.5 \* clamp\(zK \* zmx \+ hK, 0\.0, 1\.0\) \+ 0\.02\)\) \* keyH;/);
  assert.ok(m, 'the key block\'s line');
  assert.match(patch, /uniform highp float zK;/);
  assert.match(patch, /uniform highp float hK;/);
  assert.deepEqual(lintGLSL(patch), []);
  assert.deepEqual(lintGLSL(strip), []);
});

test('every path of the patch has written gl_FragDepth before it can return: a guard at the top of main, before the key block\'s line and every return', () => {
  const main = patch.slice(patch.indexOf('void main() {'));
  const first = main.indexOf('gl_FragDepth');
  assert.ok(first > 0 && /^gl_FragDepth = gl_FragCoord\.z;/.test(main.slice(first)), 'the guard');
  assert.ok(first < main.indexOf('return;'), 'before the first return');
  assert.ok(first < main.indexOf('discard'), 'and the first discard');
});

test('the outline\'s depth stays under the lowest a fading lumen takes and over every casing; the patch lumen over every strip lumen on the figure', () => {
  const outlineMax = TUBE_LEVEL.CASE1 + 0.05, outlineMin = TUBE_LEVEL.CASE1;
  assert.ok(outlineMin >= TUBE_LEVEL.CASE1 && outlineMax < 0.26, 'between the casings (to .20) and the fading band (from .26)');
  const patchLumenFigure = TUBE_LEVEL.LUMEN0 + TUBE_LEVEL.LUMEN_H * 1 + 0.02;
  assert.ok(patchLumenFigure > TUBE_LEVEL.LUMEN0 + TUBE_LEVEL.LUMEN_H, 'over the tallest strip lumen (.80)');
});
