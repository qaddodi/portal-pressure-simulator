// The live SVG organs dim and grey exactly as the GPU copy of them does (a lens other than pressure, a selected vessel), through
// an SVG filter that Safari draws: its CSS filter functions on SVG elements did nothing, so the organs flashed back to full colour
// whenever the live drawing showed (a patient change in the Sites deck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organDimMatrix, LUMA } from '../src/ui/organ-dim.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stage = read('../src/ui/stage.js');
const app = read('../styles/app.css');
const gl = read('../src/ui/veins-gl.js');

// feColorMatrix on an unpremultiplied colour.
const apply = (m, [r, g, b, a]) => { const v = m.split(' ').map(Number); return [0, 1, 2, 3].map((i) => v[i * 5] * r + v[i * 5 + 1] * g + v[i * 5 + 2] * b + v[i * 5 + 3] * a + v[i * 5 + 4]); };
// The GPU's plate grade (veins-gl.js), unpremultiplied.
const shader = ([r, g, b, a], dim, sat) => { const l = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b; return [l + (r - l) * sat, l + (g - l) * sat, l + (b - l) * sat, a * dim]; };

test('the filter matches the GPU plate grade', () => {
  assert.match(gl, /float l = dot\(pl\.rgb \/ pl\.a, vec3\(0\.299, 0\.587, 0\.114\)\); pl = vec4\(mix\(vec3\(l\) \* pl\.a, pl\.rgb, plateSat\), pl\.a\) \* plateAlpha;/, 'the shader the filter copies');
  for (const [dim, sat] of [[0.72, 0.12], [0.6, 1], [0.432, 0.12], [0.85, 0.5]]) {
    for (const c of [[0.9, 0.6, 0.5, 1], [0.2, 0.4, 0.8, 0.5], [1, 1, 1, 0.3]]) {
      const got = apply(organDimMatrix(dim, sat), c), want = shader(c, dim, sat);
      got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-4, `${dim}/${sat} ${c}: ${got} vs ${want}`));
    }
  }
  assert.deepEqual(apply(organDimMatrix(1, 1), [0.3, 0.5, 0.7, 0.9]).map((v) => +v.toFixed(5)), [0.3, 0.5, 0.7, 0.9], 'identity when nothing dims');
});

test('the live organs grey through an SVG filter on each organ and dim through the groups\' opacity, never CSS filter functions', () => {
  assert.match(stage, /<filter id="organDim" filterUnits="userSpaceOnUse" x="\$\{ORGAN_DIM_RECT\[0\]\}" y="\$\{ORGAN_DIM_RECT\[1\]\}" width="\$\{ORGAN_DIM_RECT\[2\]\}" height="\$\{ORGAN_DIM_RECT\[3\]\}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"\/><\/filter>/);
  assert.match(stage, /const ORGAN_DIM_RECT = \[200, -200, 1020, 1320\];/);
  assert.match(stage, /const PLATE_RECT = \[200, -200, 1020, 1320\];/, 'the same rectangle as the GPU copy');
  assert.match(stage, /const organParts = \(\) => \[\.\.\.gOrgans\.children, \.\.\.gBackdrop\.children\];/);
  assert.match(stage, /if \(grey !== wasGrey\) for \(const el of organParts\(\)\) \{ if \(grey\) el\.setAttribute\('filter', 'url\(#organDim\)'\); else el\.removeAttribute\('filter'\); \}/);
  assert.match(stage, /organDimFx\.setAttribute\('values', organDimMatrix\(1, plateSat\)\)/, 'the filter greys only');
  assert.match(stage, /organDimA = on \? plateDim : 1; paintOrganAlpha\(\);/, 'the dim is the groups\' opacity');
  assert.match(stage, /const a = String\(organMorphA \* organDimA\);\n\s+for \(const g of \[gOrgans, gBackdrop\]\) if \(g\.style\.opacity !== a\) g\.style\.opacity = a;/, 'times the morph\'s fade');
  assert.match(stage, /organMorphA = 1 - t; paintOrganAlpha\(\);/);
  assert.doesNotMatch(stage, /gOrgans\.style\.opacity = String\(1 - t\)/);
  assert.doesNotMatch(stage, /g\.setAttribute\('filter', 'url\(#organDim\)'\)/, 'no filter on a whole group (Safari drew every organ again on each frame)');
  assert.doesNotMatch(app, /#organs[^{]*\{[^}]*filter:/, 'no CSS filter on the organs (it would override the attribute in Chrome)');
  assert.doesNotMatch(app, /#backdrop[^{,]*\{[^}]*filter:/);
  assert.match(stage, /c\.removeAttribute\('filter'\);/, 'the GPU copy is cloned without it (dimmed there instead)');
  assert.match(stage, /for \(const k of c\.children\) if \(k\.getAttribute\('filter'\) === 'url\(#organDim\)'\) k\.removeAttribute\('filter'\);/);
});

test('grey on each organ, then the group dimmed, is the same picture as the old matrix on the whole group', () => {
  // Two organs overlapping in one group, over nothing: premultiplied source-over, the matrix on unpremultiplied colour.
  const over = (s, d) => s.map((v, i) => v + d[i] * (1 - s[3]));
  const pre = ([r, g, b, a]) => [r * a, g * a, b * a, a], un = ([r, g, b, a]) => (a ? [r / a, g / a, b / a, a] : [0, 0, 0, 0]);
  for (const [dim, sat] of [[0.72, 0.12], [0.6, 1], [0.432, 0.12]]) {
    for (const [c1, c2] of [[[0.9, 0.6, 0.5, 1], [0.2, 0.4, 0.8, 0.5]], [[1, 1, 1, 0.3], [0.1, 0.7, 0.2, 0.8]], [[0.5, 0.2, 0.9, 0.6], [0.8, 0.8, 0.1, 0]]]) {
      const old = pre(apply(organDimMatrix(dim, sat), un(over(pre(c2), pre(c1)))));
      const g = (c) => pre(apply(organDimMatrix(1, sat), c));
      const now = over(g(c2), g(c1)).map((v) => v * dim);
      old.forEach((v, i) => assert.ok(Math.abs(v - now[i]) < 1e-6, `${dim}/${sat}: ${old} vs ${now}`));
    }
  }
});

test('the filter is on only while the live drawing shows, and follows every plate switch', () => {
  assert.match(stage, /wrap\.classList\.toggle\('gl-plate', on && veins\.hasPlate\(0\)\);\n {4}syncOrganDim\(\);/);
  assert.match(stage, /wrap\.classList\.remove\('gl-plate'\); veinsDirty = true; syncPlateLook\(\);/, 'hidePlate');
  assert.match(stage, /wrap\.classList\.add\('gl-plate'\); syncPlateLook\(\);/, 'a raster landing');
  assert.match(stage, /if \(!plateEasing\(\)\) \{ plateFrom = null; return; \}/, 'eases without the GPU too');
});
