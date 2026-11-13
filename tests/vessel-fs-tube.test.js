// The Tube builds of the vessel shader (veins-gl.js vesselFS(simple, mesh, 1); docs/tube-renderer.md): the strip build is vesselFS(true, 1, 1),
// the patch build vesselFS(false, 2, 1). They are the Mesh's text with the cartoon shading in place of the tube shading and no depth write
// (the Tube's depth comes from its vertices). Node cannot compile GLSL: the lint is what finds a mistake here.
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
const { meshPatchVS, meshFS } = await import('../src/ui/veins-mesh-glsl.js');
const { STRIP_VS_GLSL } = await import('../src/ui/veins-mesh.js');

const builds = { 'strip (true, 1, 1)': vesselFS(true, 1, 1), 'patch (false, 2, 1)': vesselFS(false, 2, 1) };

test('both Tube fragment builds pass the lint', () => {
  for (const [k, src] of Object.entries(builds)) assert.deepEqual(lintGLSL(preprocess(src)), [], k);
});

test('the patch vertex shader passes the lint and takes its depth from zU', () => {
  const vs = meshPatchVS(STRIP_VS_GLSL);
  assert.deepEqual(lintGLSL(preprocess(vs)), []);
  assert.match(vs, /uniform float zU;/);
  assert.match(vs, /vec4\(d\.x \/ size\.x \* 2\.0 - 1\.0, 1\.0 - d\.y \/ size\.y \* 2\.0, zU, 1\.0\)/);
  assert.match(vs, /vec4\(2\.0, 2\.0, 2\.0, 1\.0\)/, 'the folded position stays');
});

test('no Tube build writes depth or uses the tube shading; both use the cartoon shading', () => {
  for (const [k, src] of Object.entries(builds)) {
    const writes = preprocess(src).split('gl_FragDepth').length - 1;
    // (The strip's depth is its geometry's: none. The patch writes its own, per fragment (the lobule plan's rules): the guard at the top of main so that every path of it
    // has written one, and the key block's, the depth that counts.)
    assert.equal(writes, k.startsWith('strip') ? 0 : 2, `${k}: gl_FragDepth writes`);
    // (The function tubeShade is still defined, in the shared shading text; no call of it is left: celShade is called in its place.)
    assert.equal(src.split('tubeShade(').length - 1, 1, `${k}: tubeShade( only where it is defined, never called`);
    assert.match(src, /vec4 tubeShade\(/, `${k}: ...and that is the definition`);
    assert.ok(src.includes('celShade('), `${k}: celShade(`);
  }
});

test('the Mesh builds still write depth and use the tube shading (the Tube is not in them)', () => {
  for (const src of [vesselFS(true, 1), vesselFS(false, 2)]) {
    assert.ok(src.includes('gl_FragDepth') && src.includes('tubeShade(') && !src.includes('celShade('));
  }
});

test('the Tube strip build declares the second-lumen target, so the strip and the patch write the same four targets', () => {
  for (const [k, src] of Object.entries(builds)) {
    assert.match(src, /layout\(location=0\) out vec4 outColor;/, k);
    assert.match(src, /layout\(location=1\) out uvec4 outFlow;/, k);
    assert.match(src, /layout\(location=2\) out uvec4 outFlow2;/, k);
    assert.match(src, /layout\(location=3\) out vec4 outDep;/, k);
  }
});

test('the Tube key block keeps every discard of the Mesh\'s and drops only the depth writes and the _K return', () => {
  const parts = { EDGE: '1.0', F_DOTTED: 4, F_NOCASE: 2, F_SEL: 8, F_VEIL: 16, VEIL_K: 0.5 };
  const mesh = meshFS(parts).key, tube = meshFS({ ...parts, tube: 1 }).key;
  const lines = (t) => t.split('\n').filter((l) => l.trim());
  assert.equal((tube.match(/discard/g) || []).length, (mesh.match(/discard/g) || []).length, 'every discard kept');
  assert.deepEqual(lines(mesh).filter((l) => !lines(tube).includes(l)).map((l) => l.trim().split(' ')[0]).sort(), ['gl_FragDepth', 'gl_FragDepth', 'if'].sort(), 'the three lines left out: two depth writes and the _K return');
  assert.deepEqual(lines(tube).filter((l) => !lines(mesh).includes(l)).map((l) => l.trim().slice(0, 14)), ['gl_FragDepth ='], 'added: the patch\'s own depth line, in the patch branch');
  // (The Tube's glow prepass: tubeKey, one added declaration and one added line in the part laid at the end; tests/tube-glow.test.js.)
  const noKey = (t) => t.replace(/\nuniform int tubeKey;[^\n]*\n#if MESH == 2\nuniform int tubePart;[^\n]*\nuniform highp float zK;[^\n]*\nuniform highp float hK;[^\n]*\n#endif/, '')
    .replace(/#if MESH == 2\n {2}if \(mPass >= MP_SHAPE_K && \(tubePart[^\n]*\n#endif\n/, '').split('\n').filter((l) => !l.includes('tubeKey')).join('\n');
  assert.equal(meshFS(parts).out, noKey(meshFS({ ...parts, tube: 1 }).out), 'the part laid at the end is the same');
  assert.equal(meshFS(parts).decl, noKey(meshFS({ ...parts, tube: 1 }).decl), 'and the declarations');
});
