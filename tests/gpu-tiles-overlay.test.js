// The lobule's field tile copies and its overlay (the ductules, the lymph) drawn on the GPU (tile-gl.js, fx-gl.js), with no 2D canvas
// for either since 1 Nov (Mohammad, 1 Nov: "Move everything to GPU"). The shaders are checked without a GPU (tests/glsl-lint.js); the rest pins what keeps the picture the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { copyFS, tileCopy, isTileCopy } from '../src/ui/tile-gl.js';
import { fxShaders, MAX_DUCTS } from '../src/ui/fx-gl.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const lz = read('../src/ui/lobule-zoom.js'), tgl = read('../src/ui/tile-gl.js'), fgl = read('../src/ui/fx-gl.js');
const VS = '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0.0, 1.0); }';

test('the GPU tile copy and overlay shaders pass the lint', () => {
  assert.deepEqual(lintGLSL(copyFS), []);
  assert.deepEqual(lintGLSL(VS), []);
  for (const [k, src] of Object.entries(fxShaders)) assert.deepEqual(lintGLSL(src), [], k);
});

test('every uniform the shaders declare is located by the JavaScript', () => {
  const located = (src, js) => { for (const u of uniformsOf(src)) assert.match(js, new RegExp(`'${u}'`), u); };
  located(copyFS, tgl);
  located(fxShaders.capVS + fxShaders.capFS, fgl);
  located(fxShaders.compFS, fgl);
  assert.equal(MAX_DUCTS >= 6, true, 'the six portal tracts\' ductules');
});

test('a quiet copy is the old quiet tile\'s steps, on the GPU: the wrapped blur, the grey blend 0.45, the page at 0.42, then NEIGHBOUR_FLAT', () => {
  assert.match(lz, /const quietCopy = \(t, bg\) => \{[\s\S]*?gpuCopy\(t, 'quietG', bg\.join\(','\), \{ blur: neighbourBlur\(t\.R\), sat: 0\.45, tone: bg, toneA: 0\.42, flat: NEIGHBOUR_FLAT \}\);/);
  assert.match(lz, /\{ blur: 0, sat: 0\.45, tone, toneA: 0\.42, flat: 0 \}/, 'the liver copy: the same quieting with the liver tone, no blur');
  assert.doesNotMatch(lz, /function (quietTile|blurTile|liverTile|fieldQuiet|fieldFill|fieldFade|fieldGrey|tileBlank)\(/, 'no 2D copy left (1 Nov)');
  // The canvas's saturation blend with a grey source is the backdrop's luminosity (W3C weights), mixed in by the source's alpha.
  assert.match(copyFS, /float l = dot\(c\.rgb, vec3\(0\.3, 0\.59, 0\.11\)\);\n\s+vec3 t = mix\(c\.rgb, vec3\(l\), uK\.x\);/);
  assert.match(copyFS, /ivec2 a = \(q \+ uDir \* i\) % size, b = \(q - uDir \* i \+ size \* 64\) % size;/, 'wrapping at the repeat: no seam');
});

test('a copy stands where a canvas did: its size, given back by free(), told apart from a canvas', () => {
  const src = { width: 60, height: 35 }, c = tileCopy(src, 60, 35, { blur: 0 });
  assert.equal(isTileCopy(c), true); assert.equal(isTileCopy(src), false); assert.equal(isTileCopy(null), false);
  assert.equal(c.width, 60); assert.equal(c.height, 35);
  assert.match(read('../src/ui/field-gl.js'), /if \(isTileCopy\(cv\)\) \{\n\s+const tex = copier\.make\(cv\);/);
  assert.match(read('../src/ui/tissue-gl.js'), /if \(isTileCopy\(cv\)\) \{/);
  assert.match(lz, /const freeCopies = \(q\) => \{ if \(q\.quietG\) \{ free\(q\.quietG\.cv\); q\.quietG = null; \} if \(q\.liverG\) \{ free\(q\.liverG\.cv\); q\.liverG = null; \} \};/);
  assert.doesNotMatch(lz, /drawImage\(surOld|surOld\.cv\.getContext/, 'no 2D canvas lays a tile (1 Nov: the tissue is the GPU\'s alone)');
});

test('the tile is a picture recorded for the GPU, painted into the copier\'s texture: no canvas, no ?tilegpu=0', () => {
  assert.doesNotMatch(tgl, /TILE_GPU|tilegpu/);
  assert.doesNotMatch(lz, /TILE_GPU/);
  assert.match(lz, /const rec = recordPaint\(tw, th, \(c\) => \{/);
  assert.match(lz, /Object\.assign\(t, \{ tw, th, TW, TH, cv: gpuPicture\(rec, \+\+texVer\), blank: false, blankAt: 0 \}\);/);
  const dt = lz.slice(lz.indexOf('function drawTile('), lz.indexOf('function paintField('));
  assert.doesNotMatch(dt, /getContext|document\.createElement|OffscreenCanvas|getImageData|createPattern/, 'drawn into nothing on the CPU');
  assert.match(tgl, /if \(isGpuPicture\(src\)\) \{\n\s+const tex = paintGL\(gl\)\.paint\(src\.rec, \{ mip: false \}\);/);
  assert.match(tgl, /return null; {3}\/\/ \(every tile is a recorded picture: no canvas is sent\)/);
  assert.doesNotMatch(tgl, /texSubImage2D/, 'no canvas sent to the copier');
  assert.match(fgl, /export const FX_GPU = true;/);
  assert.match(lz, /const g = can && FX_GPU \? fxGLOn\(\) : null;\n\s+if \(!g\) \{ fxGLShow\(false\); return false; \}/);
});

test('one context for the lobule: the tissue is drawn in the vessels\' context and laid under them at each present', () => {
  const vgl = read('../src/ui/veins-gl.js'), tgl = read('../src/ui/tissue-gl.js');
  // The vessels' renderer: an under pass on the cleared canvas, the kept picture laid over it premultiplied, pixel for pixel.
  assert.match(vgl, /if \(!up && under && under\.on\(\) && underLay\(\)\)/);
  assert.match(vgl, /gl\.clearColor\(0, 0, 0, 0\); gl\.clear\(gl\.COLOR_BUFFER_BIT\);\n\s+try \{ under\.draw\(\); \}/);
  assert.match(vgl, /under\(u\) \{ under = u; auxStart\('lay'\);/, 'its laying program compiled ahead');
  // The tissue: no context of its own, a picture of its own in the host's, the host's state put back after every call.
  assert.match(tgl, /if \(host\) \{ gl = host\.gl; canvas = host\.canvas; \}/);
  assert.match(tgl, /if \(!host\) canvas\.addEventListener\('webglcontextlost'/);
  assert.match(tgl, /hostT = makeTarget\(W, H\); tgt\.width = W; tgt\.height = H; pictured = false;/);
  assert.match(tgl, /gl\.blitFramebuffer\(0, 0, tgt\.width, tgt\.height, 0, ch - dh, dw, ch, gl\.COLOR_BUFFER_BIT, k === 1 \? gl\.NEAREST : gl\.LINEAR\);/);
  assert.match(tgl, /if \(!host\) gl\.getExtension\('WEBGL_lose_context'\)\?\.loseContext\(\); return null;/, 'a failed build never takes the host\'s context');
  // The lobule: made with the vessels' renderer, laid while it shows (or for a wide tile drawn on the GPU), and a frame that drew it
  // but not the vessels lays a picture.
  assert.match(lz, /tissueGL = createTissueGL\(tissueG, \{ onLive: liveCompiled, host: gl\.top \}\) \|\| null;[^\n]*\n\s+tisHostOff = tissueGL \? gl\.top\.under\(\{ on: tisUnder, draw: \(\) => tissueGL\.under\(gl\?\.software \? 0\.5 : 1\) \}\) : null;/);
  assert.match(lz, /const tisUnder = \(\) => !!tissueGL && tissueGL\.pictured && \(wideBuild \? tisWide : tissueOnGL && tissueG\.style\.visibility !== 'hidden'\);/);
  assert.match(lz, /if \(g && !g\.lost && laid !== undefined && g\.top\.presents === laid && \(fxOn \|\| \(tisHostFor && tissueDrew\)\)\) g\.present\(\);/);
});
