import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Settings › Figure performance › Sharper upscaling (30 Oct, off by default): under Full the canvas stays at Full and the picture,
// drawn at its share into the renderer's own buffer, is upscaled onto it by UP_FS. Off, the canvas is the picture, as before.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

function fakeGL() {
  const calls = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'getContextAttributes') return { stencil: true };
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}
// (Written for the canvas that keeps its own picture: pinned to ?vesselbuf=keep. The kept-picture default is covered by veins-own-buffer.test.js.)
globalThis.location = { search: '?vesselbuf=keep' };
const mod = await import('../src/ui/veins-gl.js');
delete globalThis.location;
function renderer() {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, canvas, look };
}
const binds = (f, n0) => f.calls.slice(n0).filter((c) => c[0] === 'bindFramebuffer');
const viewports = (f, n0) => f.calls.slice(n0).filter((c) => c[0] === 'viewport').map((c) => c.slice(1));
// (A pass at the picture's size, or into the vessel layer at its own: since 31 Oct the layer is as large as the figure where that is
// less than the picture, here 64 px steps across the two vessels' cells.)
const at = (g, [x, y, w, h], W, H) => x === 0 && y === 0 && ((w === W && h === H) || (w === g.layerLayout.size[0] && h === g.layerLayout.size[1]));

test('off: no buffer of its own, the picture drawn on the canvas at its size, nothing copied or upscaled', () => {
  const { g, f, look } = renderer();
  const n0 = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  assert.equal(f.calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer').length, 0);
  assert.deepEqual(binds(f, n0).at(-1), ['bindFramebuffer', f.gl.FRAMEBUFFER, null]);
  assert.ok(g.layerLayout.size[1] < 600 && g.layerLayout.size[1] % 64 === 0, 'the layer as tall as the figure');
  assert.ok(viewports(f, n0).every((v) => at(g, v, 800, 600)), 'every pass at the canvas size, or the layer\'s');
  assert.ok(viewports(f, n0).some(([, , w, h]) => w === 800 && h === 600));
  assert.deepEqual(g.picSize(), [800, 600]);
  g.setPicture(null); g.setPicture([800, 600]);   // (the canvas's own size: the same as off)
  assert.deepEqual(g.picSize(), [800, 600]);
});

test('on: every pass at the picture\'s size into its own buffer, then one pass onto the whole canvas', () => {
  const { g, f, look } = renderer();
  g.setPicture([400, 300]);
  assert.deepEqual(g.picSize(), [400, 300]);
  const n0 = f.calls.length;
  g.draw([0.5, 0, 0, 0.5, 0, 0], look, { on: false });
  const vp = viewports(f, n0);
  assert.deepEqual(vp.at(-1), [0, 0, 800, 600], 'the last pass covers the canvas');
  assert.ok(vp.slice(0, -1).every((v) => at(g, v, 400, 300)), 'the rest at the picture\'s size, or the layer\'s');
  assert.ok(vp.slice(0, -1).some(([, , w, h]) => w === 400 && h === 300));
  // (The own buffer made at the picture's size; the upscale reads it, filtered, and draws onto the canvas.)
  assert.ok(f.calls.slice(n0).some((c) => c[0] === 'texImage2D' && c[4] === 400 && c[5] === 300 && c[3] === f.gl.RGBA8));
  const last = f.calls.slice(n0).map((c) => c[0]);
  assert.equal(last.lastIndexOf('drawArrays') > last.lastIndexOf('viewport'), true);
  assert.deepEqual(binds(f, n0).at(-1), ['bindFramebuffer', f.gl.FRAMEBUFFER, null]);
  assert.equal(f.calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer').length, 0, 'not a plain copy');
  // A blood frame upscales again; capture() too (an export reads the whole canvas).
  const n1 = f.calls.length;
  g.composite(look, { on: true });
  assert.deepEqual(viewports(f, n1).at(-1), [0, 0, 800, 600]);
  const n2 = f.calls.length;
  g.capture();
  assert.deepEqual(viewports(f, n2), [[0, 0, 800, 600]]);
});

test('off again: the buffer is given back and the picture goes on the canvas directly', () => {
  const { g, f, look } = renderer();
  g.setPicture([400, 300]);
  g.draw([0.5, 0, 0, 0.5, 0, 0], look, { on: false });
  const n0 = f.calls.length;
  g.setPicture(null);
  const del = f.calls.slice(n0).map((c) => c[0]);
  assert.ok(del.includes('deleteTexture') && del.includes('deleteFramebuffer'));
  const n1 = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  assert.ok(viewports(f, n1).every((v) => at(g, v, 800, 600)));
  assert.deepEqual(binds(f, n1).at(-1), ['bindFramebuffer', f.gl.FRAMEBUFFER, null]);
});

test('the upscale filter: Catmull-Rom in five reads, held within the four nearest pixels, premultiplied', () => {
  const v = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  const fs = v.slice(v.indexOf('const UP_FS = `'), v.indexOf('}`;', v.indexOf('const UP_FS = `')));
  assert.equal((fs.match(/texture\(uT/g) || []).length, 5);
  assert.equal((fs.match(/texelFetch\(uT/g) || []).length, 4);
  assert.match(fs, /col = clamp\(col, min\(min\(n0, n1\), min\(n2, n3\)\), max\(max\(n0, n1\), max\(n2, n3\)\)\);/);
  assert.match(fs, /o = vec4\(min\(col\.rgb, vec3\(col\.a\)\), col\.a\);/);
  // (The weights of a Catmull-Rom spline sum to 1 at every phase.)
  for (const t of [0, 0.25, 0.5, 0.9]) {
    const w0 = t * (-0.5 + t * (1 - 0.5 * t)), w1 = 1 + t * t * (-2.5 + 1.5 * t), w2 = t * (0.5 + t * (2 - 1.5 * t)), w3 = t * t * (-0.5 + 0.5 * t);
    assert.ok(Math.abs(w0 + w1 + w2 + w3 - 1) < 1e-12);
  }
});

test('the stage: off, the canvas and its early return are as before; on, the canvas stays at Full under a smaller picture', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const fn = stage.slice(stage.indexOf('  function resizeCanvas() {'), stage.indexOf('  new ResizeObserver(resizeCanvas).observe(wrap);'));
  assert.match(fn, /else if \(figLab\('upscale'\) && veins\?\.setPicture && !SOFTWARE && vdpr < base - 1e-9\) \{ bw = Math\.max\(1, Math\.round\(r\.width \* base\)\); bh = Math\.max\(1, Math\.round\(r\.height \* base\)\); \}/);
  assert.match(fn, /const pic = bw !== pw \|\| bh !== ph \? \[pw, ph\] : null;/);
  assert.match(fn, /if \(resizeReady && bw === vCanvas\.width && bh === vCanvas\.height && vdpr === was && `\$\{pic\}` === `\$\{picNow\}` && lin === picLin\) \{/, 'off: pic and picNow both null, the old test');
  assert.match(fn, /if \(pic \|\| picNow\) \{ picNow = pic; picLin = lin; veins\?\.setPicture\?\.\(pic, lin\); \}/, 'off: never called');
  // (The overlays on the GPU, wherever the GPU draws them: the canvas at the screen's density, the picture upscaled by a plain filtered copy.)
  assert.match(fn, /const full = OVER_GPU && veins\?\.overlay && \(!SOFTWARE \|\| OVER_ASK\) \? devicePixelRatio \|\| 1 : 0;\n\s+let lin = false;\n\s+if \(full && vdpr < full - 1e-9\) \{ bw = Math\.max\(1, Math\.round\(r\.width \* full\)\); bh = Math\.max\(1, Math\.round\(r\.height \* full\)\); lin = !figLab\('upscale'\); \}/);
  assert.match(stage, /const OVER_GPU = !\(typeof location !== 'undefined' && \/\[\?&\]stageover=svg\\b\/\.test\(location\.search\)\);/);
  assert.match(stage, /if \(picNow\) veins\?\.setPicture\?\.\(picNow, picLin\);/, 'a restored context draws at the same share');
  assert.match(stage, /const \[roomW, roomH\] = picNow \|\| \[vCanvas\.width, vCanvas\.height\];/, 'the organ picture sized for the picture, not the larger canvas');
});
