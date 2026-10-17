import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The organs reach the GPU from a canvas of their own. Handed to the GPU as a canvas, Safari stalled up to 750 ms on each
// patient change (HVPG slides 8 and 9, 17 Oct): the pixels are read from a canvas kept in memory and sent a strip per frame
// (plate-upload.js), into a texture shown only once full. Every raster draws into a canvas of its own, so a quick second
// raster (a view switch, a slide, a resize, a theme change) never has its drawing wiped by an earlier one.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a plate raster draws into a canvas of its own and sends it as pixel strips, one per frame', () => {
  assert.match(stage, /const c = document\.createElement\('canvas'\);\n\s+c\.width = W; c\.height = H;\n\s+const g = c\.getContext\('2d', \{ willReadFrequently: true \}\);\n\s+gpuProbe\.time\(null, 'organ picture: draw', \(\) => g\.drawImage\(img, 0, 0, W, H\)\);/);
  const body = stage.slice(stage.indexOf('async function rasterPlate'), stage.indexOf('function plateStateKey'));
  assert.match(body, /for \(const \[y, rows\] of plateStrips\(W, H\)\) \{\n\s+if \(y\) await new Promise\(\(res\) => nextFrame\(res\)\);/);
  assert.match(body, /if \(seq !== plateSeq \|\| drops !== plateDrops \|\| v !== veins \|\| v\.lost\) return false;/, 'a raster overtaken on its way in is given up');
  assert.match(body, /v\.plateRows\(job, y, rows, gpuProbe\.time\(null, 'organ picture: read', \(\) => premultiply\(g\.getImageData\(0, y, W, rows\)\.data\)\)\);/);
  assert.match(body, /v\.setPlate\(slot, job, rect\); job = null;/, 'shown only once every strip is in');
  assert.match(body, /finally \{ if \(job && !v\.lost\) v\.dropJob\(job\); c\.width = c\.height = 0; \}/);
  assert.doesNotMatch(stage, /veins\.setPlate\(slot, c,/);
  assert.match(stage, /function hidePlate\(\) \{\n\s+plateDrops\+\+;/, 'a dropped plate gives up the raster on its way in');
});

test('the ascites cavity reaches the GPU as row half-widths, never as a canvas', () => {
  // (Copying a fresh canvas of its outline into a texture took Safari about 220 ms on each step of a fluid ease.)
  assert.match(stage, /veins\.setFluidSpans\(cavityHalfWidths\(bulge, /);
  assert.doesNotMatch(stage, /setFluidMask/);
});

test('the GPU fills a plate texture of its own and swaps it in whole', () => {
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /plateJob\(W, H\) \{\n\s+const tex = dataTex\(gl, gl\.LINEAR\);\n\s+gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA8, W, H, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, null\);/);
  assert.match(gl, /gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, y, job\.W, rows, gl\.RGBA, gl\.UNSIGNED_BYTE, pixels\);/);
  assert.match(gl, /setPlate\(slot, job, rect\) \{\n\s+if \(plates\[slot\]\) gl\.deleteTexture\(plates\[slot\]\.tex\);\n\s+plates\[slot\] = \{ tex: job\.tex, rect \};/);
  assert.doesNotMatch(gl, /UNPACK_PREMULTIPLY_ALPHA_WEBGL, true/, 'the strips come premultiplied');
});
