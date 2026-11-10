// The Tube's join patch is drawn in two parts, so a join's outline never shows across another vessel's inside: the outline's pixels (no lumen) at a
// depth under every lumen and over every casing, the lumen's pixels over them all. In the shader: tubePart, and one test of mLum per pixel.
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
const { meshFS } = await import('../src/ui/veins-mesh-glsl.js');
const { TUBE_LEVEL } = await import('../src/ui/tube-geo.js');

const K = { EDGE: '1.0', F_DOTTED: 1, F_NOCASE: 2, F_SEL: 4, F_VEIL: 8, VEIL_K: 0.5 };
const keeps = (part, mLum, mD = 1) => !((part === 0) === (mLum || mD < 0));   // the shader's discard test: (tubePart == 0) == (mLum || mD < 0.0)

test('the Tube text takes the patch\'s two parts apart by one test, in the patch build only; the Mesh text has none of it', () => {
  const tube = meshFS({ ...K, tube: 1 }), mesh = meshFS(K);
  assert.match(tube.decl, /#if MESH == 2\nuniform int tubePart;[^\n]*\n#endif/);
  assert.match(tube.out, /#if MESH == 2\n {2}if \(mPass >= MP_SHAPE_K && \(tubePart == 0\) == \(mLum \|\| mD < 0\.0\)\) discard;/);
  assert.ok(!mesh.decl.includes('tubePart') && !mesh.out.includes('tubePart'));
  const strip = preprocess(vesselFS(true, 1, 1)), patch = preprocess(vesselFS(false, 2, 1));
  assert.ok(!strip.includes('tubePart'), 'the strip build has no part');
  assert.ok(patch.includes('uniform int tubePart;') && patch.includes('(tubePart == 0) == (mLum || mD < 0.0)'), 'the patch build has it');
  for (const src of [strip, patch]) assert.deepEqual(lintGLSL(src), []);
});

test('each patch pixel is kept by exactly one of the two draws: no lumen, the outline part; a lumen, the lumen part', () => {
  for (const mLum of [false, true]) assert.equal([0, 1].filter((part) => keeps(part, mLum)).length, 1);
  assert.equal(keeps(0, false), true, 'outline pixels in part 0');
  assert.equal(keeps(1, true), true, 'lumen pixels in part 1');
  for (const part of [0, 1]) assert.equal(keeps(part, false, -1), part === 1, 'a pixel inside the shape with no lumen shown (a copy replaces it) is the lumen part\'s, which keeps its depth (tubeKey 2)');
});

test('the outline part\'s depth level lies over every casing and under every lumen, the lumen part\'s over every lumen', () => {
  const ring = (TUBE_LEVEL.CASE1 + TUBE_LEVEL.LUMEN0) / 2;
  assert.ok(ring > TUBE_LEVEL.CASE1 && ring < TUBE_LEVEL.LUMEN0 && TUBE_LEVEL.PATCH > TUBE_LEVEL.LUMEN0 + TUBE_LEVEL.LUMEN_H);
});
