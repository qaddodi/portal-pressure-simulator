// The Tube's patch keeps the depth of the pixels inside its shape that it leaves clear (11 Nov 2026 fault 1: pale discs where a vessel in a higher
// tier ends on a see-through one). Where a tier's vessel is drawn by the tier above it (its keep 0), the patch of that tier left the pixel clear
// and, with the colour masked in the prepass, discarded it: the vessel's own strips, which see no join, then drew it whole under the copy.
// The Mesh's key pass wrote the patch's key there; the Tube's prepass (tubeKey 2) returns instead of discarding. Node cannot compile GLSL.
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

const tubePatch = vesselFS(false, 2, 1), tubeStrip = vesselFS(true, 1, 1);
const claim = /if \(tubeKey == 2 && !mLum && mC\.a < 0\.002 && mD < 0\.0\) \{[^}]*return; \}/;
const partTest = /\(tubePart == 0\) == \(mLum \|\| mD < 0\.0\)/;

test('the Tube builds keep the shape distance and return, not discard, in a shape prepass for a pixel inside the patch\'s shape', () => {
  for (const [k, src] of Object.entries({ patch: tubePatch, strip: tubeStrip })) {
    assert.equal(src.split('float mD = 1e9;').length - 1, 1, `${k}: mD declared once`);
    assert.equal(src.split('mD = D;').length - 1, 1, `${k}: mD set where the tier's shape is kept`);
    assert.match(src, claim, `${k}: the claim`);
    assert.ok(k === 'strip' || partTest.test(src), 'the patch\'s parts are told apart by the shape too');
    assert.ok(src.indexOf('tubeKey == 2 && !mLum') < src.indexOf('if (!mLum && mC.a < 0.002) discard;'), `${k}: before the discard`);
    assert.deepEqual(lintGLSL(preprocess(src)), [], k);
  }
});

test('the Mesh builds are untouched by it', () => {
  for (const src of [vesselFS(true, 1), vesselFS(false, 2)]) assert.ok(!src.includes('mD') && !src.includes('tubeKey'));
});

test('both Tube builds carry the Tube\'s declaration and tail (tubeKey: the glow prepass and the shape prepass), the Mesh builds the Mesh\'s', () => {
  for (const src of [tubePatch, tubeStrip]) {
    assert.equal(src.split('uniform int tubeKey;').length - 1, 1);
    assert.match(src, /lgm\.a <= 0\.0 && tubeKey == 1 && sd\[0\] < swall\[0\]/);
  }
});
