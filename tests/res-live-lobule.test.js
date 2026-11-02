// Figure resolution in the lobule and the sinusoid while they show (30 Oct, Mohammad: "I don't think the lobule and sinusoid are
// obeying resolutions? At least when I check manual 25% for example the lobule doesn't change"). A change made while either shows
// is taken up once it stands still, under the anatomy's FADE_MS smoothstep: the lobule's layers stacked into one opaque cover that
// fades out over them (lobule-zoom.js resSwap), the sinusoid's canvas mixed as the anatomy's is (sinusoid-view.js svSwap). These
// tests run the pixels of both through a model of the page and pin the code paths they rely on; Full (no change) runs none of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

const { viewFollow } = await import('../src/ui/res-fade.js');
const { coverFollow, layerShows } = await import('../src/ui/res-cover-gl.js');

test('viewFollow carries the picture with a pan and a zoom, and is nothing while the view stands', () => {
  assert.equal(viewFollow({ k: 2, x: 10, y: 20 }, { k: 2, x: 10, y: 20 }), '');
  const v0 = { k: 2, x: 10, y: 20 }, v = { k: 3, x: -5, y: 40 };
  const m = viewFollow(v0, v).match(/matrix\((.+)\)/)[1].split(',').map(Number);
  for (const w of [[0, 0], [7, -3], [100, 50]]) {
    const s0 = [w[0] * v0.k + v0.x, w[1] * v0.k + v0.y], s = [w[0] * v.k + v.x, w[1] * v.k + v.y];
    assert.ok(Math.abs(m[0] * s0[0] + m[2] * s0[1] + m[4] - s[0]) < 1e-9 && Math.abs(m[1] * s0[0] + m[3] * s0[1] + m[5] - s[1]) < 1e-9, `world ${w}`);
  }
});

test('the cover stacks the layers that show and skips hidden, empty or detached ones', () => {
  const c = (extra = {}) => ({ isConnected: true, width: 4, height: 4, style: { opacity: '', visibility: '' }, ...extra });
  assert.equal(layerShows(c()), true);
  assert.equal(layerShows(c({ style: { opacity: '0', visibility: '' } })), false);
  assert.equal(layerShows(c({ style: { opacity: '', visibility: 'hidden' } })), false);
  assert.equal(layerShows(c({ width: 0 })), false);
  assert.equal(layerShows(c({ isConnected: false })), false);
  assert.equal(layerShows(null), false);
});

test('coverFollow is viewFollow over the box: the picture before is laid where the view has carried it', () => {
  const v0 = { k: 2, x: 10, y: 20 }, v = { k: 3, x: -5, y: 40 }, W = 400, H = 300;
  const css = viewFollow(v0, v).match(/matrix\((.+)\)/)[1].split(',').map(Number), m = coverFollow(v0, v, W, H);
  for (const p of [[0, 0], [120, 80], [400, 300]]) {
    const q = [css[0] * p[0] + css[2] * p[1] + css[4], css[1] * p[0] + css[3] * p[1] + css[5]];
    const u = [m[0] * p[0] / W + m[3] * p[1] / H + m[6], m[1] * p[0] / W + m[4] * p[1] / H + m[7]];
    assert.ok(Math.abs(u[0] * W - q[0]) < 1e-9 && Math.abs(u[1] * H - q[1]) < 1e-9, `${p}`);
  }
});

test('res-cover-gl.js: the stack is made in its own WebGL context, kept in a texture, and the cover before laid over at its weight', () => {
  const g = src('res-cover-gl.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/getContext\('2d'\)|drawImage|getImageData|putImageData/.test(g), 'no 2D canvas');
  assert.match(g, /cv\.getContext\('webgl2'/);
  assert.match(g, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, l\);/, 'each layer taken in once');
  assert.match(g, /gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/, 'premultiplied source-over, as the page stacks them');
  assert.match(g, /if \(prev && kept\) \{ gl\.bindFramebuffer\(gl\.FRAMEBUFFER, next\.fbo\); quad\(kept\.tex, prev\.a, prev\.m, true\); \}/);
  assert.match(g, /compileDone\(gl, handle\)/, 'never waits on a compile');
});

test('lobule-zoom.js: the change waits for a still, whole lobule, and its GPU cover never touches the layers', () => {
  const lz = src('lobule-zoom.js');
  assert.match(lz, /const resSteady = \(\) => fade > 0\.98 && !diveScaled && sinU === 0 && !sinTo && !wide && !staging && !!geo && !!model;/);
  assert.match(lz, /if \(lzWant != null && resSteady\(\)\) resSwap\(\);\n\s*const drew = draw\(moving \? dt : 0\);/, 'swapped in the loop, just before the frame is drawn');
  assert.match(lz, /if \(resCover\) resCoverStep\(now\);/);
  assert.match(lz, /\(flowA === 0 \|\| flowA === 1\) && !resCover\) \{/, 'the loop sleeps only once the cover is gone');
  assert.match(lz, /if \(lzWant != null\) coverGL\(\)\?\.prepare\(\);/, 'its program compiles when the change is asked for');
  const swap = lz.slice(lz.indexOf('function resSwap()'), lz.indexOf('function resCoverStep('));
  assert.ok(!/stackInto|getContext|drawImage|hostSize\(/.test(swap), 'no 2D stack, no layout read');
  assert.ok(swap.indexOf('g?.ready && draw(0)') < swap.indexOf('g.build([tissue, tissueG, glCv, fx], prev)'), 'copied in the frame that drew it');
  assert.ok(swap.indexOf('g.build(') < swap.indexOf('lzK = k;'), 'at the share before');
  assert.match(lz, /function freshDraw\(\) \{ tissueKey = ''; drawKey = ''; glDirty = true; idleDrawn = ''; \}/, 'every layer drawn whole');
  assert.match(swap, /freshDraw\(\);[\s\S]*?freshDraw\(\);/, 'before the copy is made and again once the new resolution stands');
  assert.match(swap, /if \(!cv\.isConnected\) fx\.after\(cv\);/, 'over the layers, under the leaders and labels');
  assert.match(lz, /if \(u >= 1 \|\| diveScaled \|\| wide \|\| fade <= 0\) \{ resCoverEnd\(\); return; \}/);
  assert.match(lz, /setDiveZoom\(k, x, y, tx = x, ty = y\) \{\n\s*if \(k < 0\.9999\) resCoverEnd\(\);/, 'a dive takes it away before the layers scale');
  assert.match(lz, /function release\(\) \{\n\s*dropWide\(\);\n\s*resCoverEnd\(\);/);
  assert.match(lz, /if \(fade === 0\) \{ resCoverEnd\(\);/);
});

test('sinusoid-view.js: the change waits for the open view and is mixed on the GPU in the canvas itself (keep, mix, drop), never in 2D', () => {
  const sv = src('sinusoid-view.js'), gl = src('sinusoid-gl.js');
  assert.match(sv, /if \(!paint\) return;\n\s*if \(svWant != null && gpu && open && !dive\) svSwap\(\);/);
  const swap = sv.slice(sv.indexOf('function svSwap()'), sv.indexOf('const S = {};'));
  assert.ok(swap.indexOf("gpuKey = '';") < swap.indexOf('draw(0, false);') && swap.indexOf('draw(0, false);') < swap.indexOf('gpu.keep?.()'), 'drawn again, then kept, in one frame');
  assert.ok(!/drawImage|getContext|visibility|mixInto|SV_MIX/.test(swap), 'no 2D canvas, the canvas stays shown');
  assert.ok(!/svmix|SV_MIX|mixInto/.test(sv));
  assert.match(sv, /const sameAsLast = go === 0 && !dive && !svFade && pictureSame\(u, n\);/, 'drawn every frame while the mix runs');
  assert.match(sv, /gpuKey = go === 0 && !dive && !svFade;\n\s*if \(svFade\) svFadeStep\(\);/, 'the mix remade right after the canvas is drawn');
  assert.match(sv, /if \(u >= 1 \|\| dive\) \{ svFadeEnd\(\); return; \}/);
  assert.match(sv, /gpu\.mix\(fadeAlpha\(u\)\);/);
  assert.match(sv, /if \(opacity <= 0 && was > 0\) \{ svFadeEnd\(\);/);
  assert.match(gl, /gl\.blendColor\(0, 0, 0, Math\.min\(1, a\)\); gl\.blendFunc\(gl\.CONSTANT_ALPHA, gl\.ONE_MINUS_CONSTANT_ALPHA\);/);
  assert.match(gl, /gl\.copyTexImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, 0, 0, canvas\.width, canvas\.height, 0\);/, 'copied inside the GPU, no read back');
});
