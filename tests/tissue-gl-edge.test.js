// A faint one-pixel line ran along the edge of the lobule's tissue bitmap (a 2.6 R square round the lobule): full height at the left of
// a lobule slide, and a square round the lobule in the views that show it whole (Mohammad, 27 Oct, screenshot of Lobule 5/9). Measured
// in that screenshot: a line one device pixel wide, in the bitmap's average colour, 1.28 R from the lobule's centre, where the bitmap's
// box ends. The shader looked the bitmap up inside the test for being in its box, where the derivatives that pick a mipmap level are
// undefined, so a pixel along the edge could take the coarsest level. The lookups carry their own gradients now. (Diagnosed from the
// screenshot and the code; no GPU ran here.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tissueFS } from '../src/ui/tissue-gl.js';

// (The shader exists in two forms: the bitmap over the surround, and the same with the lobule drawn live added; the edge of the
// bitmap's box is the same in both.)
const FORMS = [['bitmap only', tissueFS(false)], ['with the live lobule', tissueFS(true)]];

test('the bitmap is looked up with explicit gradients, never with implicit ones inside the box test', () => {
  for (const [, FS] of FORMS) {
    assert.doesNotMatch(FS, /\btexture\(uW,|\btexture\(uWO,/, 'no implicit-derivative lookup of either bitmap');
    assert.match(FS, /vec2 gx = vec2\(1\.0 \/ uRect\.z, 0\.0\), gy = vec2\(0\.0, 1\.0 \/ uRect\.z\);/, 'one device px in the bitmap\'s own coordinates');
    assert.equal(FS.match(/textureGrad\(uW, w, gx, gy\)/g).length, 1);
    assert.equal(FS.match(/textureGrad\(uWO, w, gx, gy\)/g).length, 1);
    // The lookups with implicit derivatives that remain sit in uniform control flow (the surround's tiles; the last state's, behind a uniform).
    const implicit = FS.match(/\btexture\([^)]*\)/g);
    assert.deepEqual(implicit, ['texture(uQA, uv)', 'texture(uQB, uv)', 'texture(uQO, uv)']);
  }
});

test('the outermost two device pixels of the box fade out, so an edge pixel that held anything could not show', () => {
  for (const [, FS] of FORMS) {
    assert.match(FS, /float e = clamp\(min\(min\(w\.x, 1\.0 - w\.x\), min\(w\.y, 1\.0 - w\.y\)\) \* uRect\.z \/ 2\.0, 0\.0, 1\.0\);/);
    assert.match(FS, /l \*= e;\n\s+c = l\.rgb \+ c \* \(1\.0 - l\.a\);/, 'before it is laid over the surround');
  }
  // (the same expression: 0 on the edge, 1 two device px in, whatever the box's size)
  const e = (wx, wy, z) => Math.min(1, Math.max(0, Math.min(Math.min(wx, 1 - wx), Math.min(wy, 1 - wy)) * z / 2));
  for (const z of [800, 2400, 7000]) {
    assert.equal(e(0, 0.5, z), 0);
    assert.equal(e(1, 0.5, z), 0);
    assert.equal(e(0.5, 0, z), 0);
    assert.ok(Math.abs(e(1 / z, 0.5, z) - 0.5) < 1e-12, 'one device px in: half');
    assert.equal(e(2 / z, 0.5, z), 1);
    assert.equal(e(0.5, 0.5, z), 1, 'the lobule\'s own picture lies far inside the box (the hexagon is 1 R of its 1.3 R)');
  }
});

test('the fade into the page and the grey grade still follow the bitmap, as before', () => {
  for (const [, FS] of FORMS) {
    const at = (s) => FS.indexOf(s);
    assert.ok(at('if (uGrey.x < 1.0') < at('vec4 l = textureGrad(uW') && at('l *= e;') < at('float s = clamp('));
  }
});
