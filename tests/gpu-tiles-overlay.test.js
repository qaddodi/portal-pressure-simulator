// The lobule's field tile copies and its overlay (the ductules, the lymph) drawn on the GPU (tile-gl.js, fx-gl.js), with the 2D canvas
// kept for where the GPU cannot draw, and ?tilegpu=0 / ?fxgpu=0 putting back the old path whole (Mohammad, 1 Nov: "Move everything to
// GPU"). The shaders are checked without a GPU (tests/glsl-lint.js); the rest pins what keeps the picture the same.
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

test('a quiet copy is the 2D quiet tile\'s steps: the wrapped blur, the grey blend 0.45, the page at 0.42, then NEIGHBOUR_FLAT', () => {
  assert.match(lz, /gpuCopy\(t, 'quietG', bg\.join\(','\), \{ blur: neighbourBlur\(t\.R\), sat: 0\.45, tone: bg, toneA: 0\.42, flat: NEIGHBOUR_FLAT \}\)/);
  assert.match(lz, /blurTile\(c, src, t\.tw, t\.th, neighbourBlur\(t\.R\)\);\n\s+fieldQuiet\(c, bg, 1, t\.tw, t\.th\);\n\s+c\.fillStyle = css\(bg, NEIGHBOUR_FLAT\);/, 'the 2D one, unchanged');
  assert.match(lz, /\{ blur: 0, sat: 0\.45, tone, toneA: 0\.42, flat: 0 \}/, 'the liver copy: fieldQuiet with the liver tone, no blur');
  assert.match(lz, /c\.globalCompositeOperation = 'saturation'; c\.fillStyle = `rgba\(128,128,128,\$\{\(0\.45 \* q\)\.toFixed\(3\)\}\)`/, 'fieldQuiet\'s grey share');
  assert.match(lz, /c\.fillStyle = css\(bg, 0\.42 \* q\)/);
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
  assert.match(lz, /const freeCopies = \(q\) => \{ for \(const k of \['quiet', 'liverQ', 'quietG', 'liverG'\]\) if \(q\[k\]\) \{ free\(q\[k\]\.cv\); q\[k\] = null; \} \};/);
  assert.match(lz, /if \(surOld\?\.cv\?\.width && !isTileCopy\(surOld\.cv\)\)/, 'the 2D canvas never lays a GPU copy');
});

test('?tilegpu=0 and ?fxgpu=0 put the old paths back whole', () => {
  assert.match(tgl, /export const TILE_GPU = !\(typeof location !== 'undefined' && \/\[\?&\]tilegpu=0\\b\/\.test/);
  assert.match(fgl, /export const FX_GPU = !\(typeof location !== 'undefined' && \/\[\?&\]fxgpu=0\\b\/\.test/);
  assert.match(lz, /const quietCopy = \(t, bg\) => \(TILE_GPU \? gpuCopy\(/);
  assert.match(lz, /if \(!TILE_GPU\) return liverTile\(t, cs, dark, bg\);/);
  assert.match(lz, /const g = can && FX_GPU \? fxGLOn\(\) : null;\n\s+if \(!g\) \{ fxGLShow\(false\); return false; \}/);
});

test('the overlay is the GPU\'s for the screen and through a GPU dive; a 2D-staged dive keeps the 2D overlay', () => {
  assert.match(lz, /const onGPU = !keep2D && \(!scaled \|\| \(DIVE_GPU && \(sinU === 0 \|\| SIN_GPU\)\)\);/);
  assert.match(lz, /const fxOn = fxOnGPU\(W, H, dpr, dark, dt, g && !g\.lost && onGPU\);\n\s+if \(g && !g\.lost\) drawGL\(W, H, dpr, dark, cs, dt\);\n\s+if \(!fxOn\) paintFx\(W, H, dpr, dark, dt, !g \|\| g\.lost\);/, 'scaled with the tissue\'s GPU canvas through the dive (DIVE_GPU) and the sinusoid\'s zoom (SIN_GPU), as it is');
  assert.match(lz, /\(fxGLShown \? true : probe\(fx\)\)/, 'a wide copy is kept when the overlay is the GPU\'s');
  assert.match(lz, /const fxG = h\('canvas', \{ class: 'lz-canvas lz-fx lz-fx-gl', 'aria-hidden': 'true', style: \{ opacity: '0', pointerEvents: 'none' \} \}\);/);
  assert.match(fgl, /failIfMajorPerformanceCaveat: true/, 'a software renderer keeps the 2D overlay');
  // The same layers in paintFx's order: ductules, drops, rings, beads, the eraser cutting all of them, the lining over.
  assert.match(fxShaders.compFS, /c = over\(c, uCLy, k\.r\);\n\s+c = over\(c, uCRing, k\.g\);\n\s+c = over\(c, uCBead, k\.b\);\n\s+c \*= 1\.0 - k\.a;\n\s+\}\n\s+if \(uLine > 0\) c = over\(c, uCLine/);
  assert.match(fgl, /gl\.blendEquation\(gl\.MAX\)/, 'each layer one union, as one path\'s fill: overlaps never darken');
});

test('one context for the lobule: the overlay is laid in the vessels\' canvas at each of their presents (?lzone=0: its own canvas)', () => {
  const vgl = read('../src/ui/veins-gl.js');
  assert.match(vgl, /export const LZ_ONE = !\(typeof location !== 'undefined' && \/\[\?&\]lzone=0\\b\/\.test/);
  assert.match(vgl, /const ownBuf = OWN_BUF && \(who === 'stage' \|\| \(who === 'lobule' && LZ_ONE\)\);/);
  assert.match(lz, /fxHostGL = createFxGL\(fxG, \{ host: gl\.top \}\);\n\s+fxHostOff = fxHostGL \? gl\.top\.add\(\{ order: 1, draw: fxHostDraw \}\) : null;/);
  assert.match(lz, /if \(!fxArgs \|\| !fxHostGL\) return;/);
  // A wide copy on the GPU lays the overlay in the vessels' canvas, set before they are drawn; the 2D tiles never have it there.
  assert.match(lz, /const fxOn = fxOnGPU\(w, hh, dpr, dark, 0, true\), fxIn = fxOn && !!fxArgs;\n\s+drawKey = ''; drawGL\(TW, TH, dpr, dark, cs, 0\);/);
  assert.match(lz, /\} \} finally \{ wideBuild = false; fxArgs = null; \}/, 'no tile\'s overlay left for the screen');
  assert.match(lz, /wideBuild = true; fxArgs = null;/, 'the 2D tiles: the overlay on the 2D canvas, not in the vessels\'');
  assert.match(fgl, /if \(host\) \{ W = canvas\.width; H = canvas\.height; if \(!W \|\| !H\) return false; \}/, 'over the whole host canvas (a wide tile is cropped from a larger one)');
  assert.match(fgl, /if \(host\) \{ gl\.enable\(gl\.BLEND\); gl\.blendEquation\(gl\.FUNC_ADD\); gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\); \}/, 'over the vessels, premultiplied');
  assert.match(fgl, /gl\.disable\(gl\.BLEND\); gl\.useProgram\(null\); gl\.bindVertexArray\(null\);/, 'the host\'s state put back');
});
