// The compositor's Tube builds (COMP_FS with tube = 1, brief S3-X, 10 Nov 2026): where the lumen section was, one read of the lumen layer and one mix.
// Judged by what the module exports: the four builds' text, and the JS twin of the mix.
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
const { COMP_FS } = await import('../src/ui/veins-gl.js');
const { tubeLumenMixJS, compLumenUniforms, compLumenFns } = await import('../src/ui/comp-glsl.js');

const noComments = (t) => t.replace(/\/\/.*$/gm, '');
const BUILDS = {
  'COMP_FS(false, false, false, 1)': COMP_FS(false, false, false, 1),
  'COMP_FS(true, false, false, 1)': COMP_FS(true, false, false, 1),
  'COMP_FS(false, true, false, 1)': COMP_FS(false, true, false, 1),
  'COMP_FS(false, false, true, 1)': COMP_FS(false, false, true, 1),
};
const WHOLE = ['COMP_FS(false, false, false, 1)', 'COMP_FS(true, false, false, 1)', 'COMP_FS(false, true, false, 1)'];

test('the four Tube builds lint clean (comments out, directives followed)', () => {
  for (const [name, t] of Object.entries(BUILDS)) assert.deepEqual(lintGLSL(preprocess(noComments(t))), [], name);
});

test('the Tube builds of the full, plain and streak compositor read the lumen layer and nothing of the flow targets', () => {
  for (const name of WHOLE) {
    const t = noComments(BUILDS[name]);
    assert.ok(/uniform sampler2D lumenL;/.test(t), `${name}: declares lumenL`);
    assert.equal((t.match(/\b(?:texelFetch|texture)\(lumenL\b/g) || []).length, 3, `${name}: lumenL read at the layer's texel, filtered on a tier frame, or filtered at a share of the layer's size`);
    assert.ok(!/bloodAt\(/.test(t), `${name}: no bloodAt`);
    assert.ok(!/\bgbuf2\b/.test(t), `${name}: no gbuf2`);
    assert.ok(!/\bhalfL\b/.test(t), `${name}: no halfL`);
    for (const f of ['originAt(', 'dyeAt(', 'dyeEdge(', 'lymphAt(', 'castAt(']) assert.ok(!t.includes(f), `${name}: no ${f}`);
    // gbuf is read once, and only for a still lumen's test, the arrowheads drawn here or the mask of a lumen layer at a share of the layer's size.
    assert.equal((t.match(/texelFetch\(gbuf\b/g) || []).length, 1, `${name}: one gbuf read`);
    assert.ok(/if \(inL && \(\(bloodOnly == 1 && stillOn == 1\) \|\| chevC \|\| lumM\)\) g = texelFetch\(gbuf, lp, 0\);/.test(t), `${name}: gbuf read only where needed`);
  }
});

test('at most 16 samplers in a Tube build, counted by declaration', () => {
  for (const name of WHOLE) {
    const names = [...noComments(BUILDS[name]).matchAll(/^uniform\s+(?:highp\s+)?[iu]?sampler2D\s+([^;]+);/gm)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
    assert.ok(names.length <= 16, `${name}: ${names.length} samplers (${names.join(' ')})`);
    assert.ok(names.includes('lumenL') && names.includes('gbuf') && names.includes('base'));
  }
});

test('the streak and arrowhead builds have no Tube text of their own', () => {
  assert.equal(COMP_FS(false, true, false, 1), COMP_FS(false, false, false, 1));
  assert.equal(COMP_FS(false, false, true, 1), COMP_FS(false, false, true));
  assert.notEqual(COMP_FS(false, false, false, 1), COMP_FS(false, false, false));
});

test('the Tube build keeps the text after the lumen section: the bleed, the layering and the outlines', () => {
  const t = BUILDS[WHOLE[0]], o = COMP_FS();
  const tail = (s) => s.slice(s.indexOf('  // An active bleed.'));
  assert.equal(tail(t), tail(o));
  assert.ok(tail(t).includes('vec4 o = over(fluidC, over(v, over(inner, pl)));'));
});

test('the helpers the lumen shader shares are exported whole', () => {
  assert.ok(/uniform highp sampler2D flow;/.test(compLumenUniforms()));
  assert.ok(/zoomA/.test(compLumenUniforms()));
  for (const f of ['bloodAt(', 'originAt(', 'dyeAt(', 'dyeEdge(', 'lymphAt(', 'castAt(', 'radAt(', 'bendAt(']) assert.ok(compLumenFns().includes(f), f);
});

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const C0 = [0.2, 0.5, 0.3], F = [0.9, 0.1, 0.4], Cc = [0.1, 0.1, 0.6];   // lumen colour as the layer holds it, the lumen's final colour, a casing
const prem = (c, a) => [c[0] * a, c[1] * a, c[2] * a, a];

test('mix twin: a lumen at full opacity becomes its final colour, alpha untouched', () => {
  const r = tubeLumenMixJS(prem(C0, 1), prem(F, 1));
  for (let i = 0; i < 3; i++) assert.ok(near(r[i], F[i]));
  assert.equal(r[3], 1);
});

test('mix twin: a whole vessel at 40% opacity (layer and lumen layer both 0.4) becomes its final colour at 0.4', () => {
  const r = tubeLumenMixJS(prem(C0, 0.4), prem(F, 0.4));
  for (let i = 0; i < 3; i++) assert.ok(near(r[i], F[i] * 0.4));
  assert.equal(r[3], 0.4);
});

test('mix twin: a lumen at 40% over an opaque casing moves the layer toward the final colour by 0.4 and leaves the alpha', () => {
  const v = prem(C0.map((c, i) => 0.4 * c + 0.6 * Cc[i]), 1);
  const r = tubeLumenMixJS(v, prem(F, 0.4));
  for (let i = 0; i < 3; i++) assert.ok(near(r[i], 0.6 * v[i] + 0.4 * F[i]));
  assert.equal(r[3], 1);
});

test('mix twin: where there is no lumen (a casing pixel) the layer is exactly as it was', () => {
  const v = prem(Cc, 1);
  assert.deepEqual(tubeLumenMixJS(v, [0, 0, 0, 0]), v);
  assert.deepEqual(tubeLumenMixJS([0.1, 0.1, 0.1, 0.005], prem(F, 1)), [0.1, 0.1, 0.1, 0.005]);
});

test('mix twin: 8-bit rounding that puts the lumen layer a hair above the layer, or its colour above 1, cannot overshoot', () => {
  const r = tubeLumenMixJS(prem(C0, 0.5), [1, 1, 1, 0.5004]);
  for (let i = 0; i < 3; i++) assert.ok(r[i] <= 0.5 + 1e-12 && r[i] >= 0);
});
