// The live SVG organs dim and grey exactly as the GPU copy of them does (a lens other than pressure, a selected vessel), through
// an SVG filter that Safari draws: its CSS filter functions on SVG elements did nothing, so the organs flashed back to full colour
// whenever the live drawing showed (a patient change in the Sites deck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organDimMatrix, LUMA } from '../src/ui/organ-dim.js';
import { parseColor, greyOf, paintRef } from '../src/ui/organ-grey.js';


// feColorMatrix on an unpremultiplied colour.
const apply = (m, [r, g, b, a]) => { const v = m.split(' ').map(Number); return [0, 1, 2, 3].map((i) => v[i * 5] * r + v[i * 5 + 1] * g + v[i * 5 + 2] * b + v[i * 5 + 3] * a + v[i * 5 + 4]); };
// The GPU's plate grade (veins-gl.js), unpremultiplied.
const shader = ([r, g, b, a], dim, sat) => { const l = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b; return [l + (r - l) * sat, l + (g - l) * sat, l + (b - l) * sat, a * dim]; };

test('the filter matches the GPU plate grade', () => {
  for (const [dim, sat] of [[0.72, 0.12], [0.6, 1], [0.432, 0.12], [0.85, 0.5]]) {
    for (const c of [[0.9, 0.6, 0.5, 1], [0.2, 0.4, 0.8, 0.5], [1, 1, 1, 0.3]]) {
      const got = apply(organDimMatrix(dim, sat), c), want = shader(c, dim, sat);
      got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-4, `${dim}/${sat} ${c}: ${got} vs ${want}`));
    }
  }
  assert.deepEqual(apply(organDimMatrix(1, 1), [0.3, 0.5, 0.7, 0.9]).map((v) => +v.toFixed(5)), [0.3, 0.5, 0.7, 0.9], 'identity when nothing dims');
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

