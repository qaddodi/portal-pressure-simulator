// The live SVG organs dim and grey exactly as the GPU copy of them does (a lens other than pressure, a selected vessel), through
// an SVG filter that Safari draws: its CSS filter functions on SVG elements did nothing, so the organs flashed back to full colour
// whenever the live drawing showed (a patient change in the Sites deck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organDimMatrix, LUMA } from '../src/ui/organ-dim.js';
import { parseColor, greyOf, paintRef } from '../src/ui/organ-grey.js';

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

test('the live organs grey through their own colours and dim through the groups\' opacity; never a CSS filter function', () => {
  assert.match(stage, /<filter id="organDim" filterUnits="userSpaceOnUse" x="200" y="-200" width="1020" height="1320" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"\/><\/filter>/, 'kept for a colour the grey cannot read');
  assert.match(stage, /const PLATE_RECT = \[200, -200, 1020, 1320\];/, 'the same rectangle as the GPU copy');
  const sync = stage.slice(stage.indexOf('function syncOrganDim'), stage.indexOf('const plateEasing'));
  assert.match(sync, /organDimA = on \? plateDim : 1; paintOrganAlpha\(\);\n\s+if \(grey\) greyOn\(plateSat\); else greyOff\(\);/);
  assert.match(stage, /for \(const g of greyList\) g\.el\.style\.setProperty\(g\.p, greyOf\(g\.c, sat\), 'important'\);/);
  assert.match(stage, /if \(!greyList\) \{ greyFilter = true; for \(const g of \[gOrgans, gBackdrop\]\) g\.setAttribute\('filter', 'url\(#organDim\)'\); \}/, 'only when a colour cannot be read');
  assert.match(stage, /const a = String\(organMorphA \* organDimA\), tr = organDimA !== 1 \? 'none' : '';\n\s+for \(const g of \[gOrgans, gBackdrop\]\) \{\n\s+if \(g\.style\.transition !== tr\) g\.style\.transition = tr;\n\s+if \(g\.style\.opacity !== a\) g\.style\.opacity = a;/, 'the dim times the morph\'s fade, set at once: the groups\' .5 s opacity transition would flash the undimmed organs');
  assert.match(app, /#organs \{ transition: opacity \.5s var\(--ease\); \}/, 'the transition the dim turns off');
  assert.match(stage, /organMorphA = 1 - t; paintOrganAlpha\(\);/);
  assert.doesNotMatch(app, /#organs[^{]*\{[^}]*filter:/, 'no CSS filter on the organs (it would override the attribute in Chrome)');
  assert.doesNotMatch(app, /#backdrop[^{,]*\{[^}]*filter:/);
  assert.match(stage, /c\.removeAttribute\('filter'\);/, 'the GPU copy is cloned without it (dimmed there instead)');
  assert.match(stage, /const greyed = !!greyList;\n\s+if \(greyed\) \{ greyClear\(\); organDimKey = ''; \}/, 'the GPU copy takes the organs\' own colours');
  assert.match(stage, /\} finally \{ if \(greyed\) syncOrganDim\(\); \}/);
  const build = stage.slice(stage.indexOf('function plateBuild('), stage.indexOf('function plateBoxes('));
  assert.doesNotMatch(build, /classList\.(remove|add|toggle)\('gl-plate'/, 'the copy is made with the plate class left as it is (a flip restyles the whole figure)');
});

test('greying each colour, then the group\'s opacity, is the same picture as the filter on the whole group', () => {
  // Two shapes overlapping in one group, over nothing: premultiplied source-over, the matrix on unpremultiplied colour.
  const over = (s, d) => s.map((v, i) => v + d[i] * (1 - s[3]));
  const pre = ([r, g, b, a]) => [r * a, g * a, b * a, a], un = ([r, g, b, a]) => (a ? [r / a, g / a, b / a, a] : [0, 0, 0, 0]);
  const col = (str) => parseColor(str);
  for (const [dim, sat] of [[0.72, 0.12], [0.6, 1], [0.432, 0.12], [0.9, 0.55]]) {
    for (const [c1, c2] of [[[0.9, 0.6, 0.5, 1], [0.2, 0.4, 0.8, 0.5]], [[1, 1, 1, 0.3], [0.1, 0.7, 0.2, 0.8]], [[0.5, 0.2, 0.9, 0.6], [0.8, 0.8, 0.1, 0]]]) {
      const old = pre(apply(organDimMatrix(dim, sat), un(over(pre(c2), pre(c1)))));
      const g = (c) => pre(col(greyOf(c, sat)));
      const now = over(g(c2), g(c1)).map((v) => v * dim);
      old.forEach((v, i) => assert.ok(Math.abs(v - now[i]) < 1e-5, `${dim}/${sat}: ${old} vs ${now}`));
    }
  }
});

test('computed colours are read in every form the browsers give them', () => {
  assert.deepEqual(parseColor('rgb(255, 128, 0)'), [1, 128 / 255, 0, 1]);
  assert.deepEqual(parseColor('rgba(255, 0, 0, 0.5)'), [1, 0, 0, 0.5]);
  assert.deepEqual(parseColor('rgb(255 0 0 / 50%)'), [1, 0, 0, 0.5]);
  assert.deepEqual(parseColor('color(srgb 0.5 0.25 1)'), [0.5, 0.25, 1, 1]);
  assert.deepEqual(parseColor('color(srgb 0.5 0.25 1 / 0.4)'), [0.5, 0.25, 1, 0.4]);
  assert.deepEqual(parseColor('transparent'), [0, 0, 0, 0]);
  assert.equal(parseColor('oklch(0.5 0.1 30)'), null, 'unread: the filter stays');
  assert.equal(paintRef('url("#texLiver")'), 'texLiver');
  assert.equal(paintRef('url(#congest) none'), 'congest');
  assert.equal(greyOf([0.2, 0.4, 0.6, 1], 1), 'color(srgb 0.2 0.4 0.6)', 'nothing greyed at full saturation');
});

test('the filter is on only while the live drawing shows, and follows every plate switch', () => {
  assert.match(stage, /wrap\.classList\.toggle\('gl-plate', on && veins\.hasPlate\(0\)\);\n {4}syncOrganDim\(\);/);
  assert.match(stage, /wrap\.classList\.remove\('gl-plate'\); veinsDirty = true; syncPlateLook\(\);/, 'hidePlate');
  assert.match(stage, /wrap\.classList\.add\('gl-plate'\); syncPlateLook\(\);/, 'a raster landing');
  assert.match(stage, /if \(!plateEasing\(\)\) \{ plateFrom = null; return; \}/, 'eases without the GPU too');
});
