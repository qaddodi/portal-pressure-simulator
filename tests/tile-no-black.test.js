import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldFS } from '../src/ui/field-gl.js';
import { tissueFS } from '../src/ui/tissue-gl.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Mohammad, 1 Nov (iPhone): zooming out of the lobule to the anatomy, the neighbouring lobules flashed black. A tile canvas the browser
// could not give memory to is transparent, and the shaders read only its rgb (0): solid black. Now each tile is laid over the page's
// colour by its own alpha (an opaque tile: the same picture), and a blank tile is drawn again instead of being kept.
test('the shaders lay the neighbour tiles over the page, so a blank tile is never black', () => {
  for (const [name, fs] of [['field', fieldFS()], ['tissue', tissueFS(false)], ['tissue live', tissueFS(true)]]) {
    assert.match(fs, /vec3 over\(vec4 t\) \{ return t\.rgb \* t\.a \+ uBg \* \(1\.0 - t\.a\); \}/, name);
    assert.doesNotMatch(fs, /texture\(uQ?[AB], uv(, bias)?\)\.rgb/, `${name}: no tile read by its rgb alone`);
  }
  assert.match(fieldFS(), /vec3 c = mix\(over\(texture\(uA, uv, bias\)\), over\(texture\(uB, uv, bias\)\), uMix\);/);
  assert.match(fieldFS(), /c = mix\(c, mix\(over\(texture\(uQA, uv, bias\)\), over\(texture\(uQB, uv, bias\)\), uMix\), uQuiet\);/);
  assert.match(tissueFS(false), /vec3 c = mix\(over\(texture\(uQA, uv\)\), over\(texture\(uQB, uv\)\), uMix\);/);
  for (const f of ['field-gl.js', 'tissue-gl.js']) assert.doesNotMatch(src(`src/ui/${f}`), /TILE_OVER|tileover/, f);
});

test('a blank tile is not kept: it is drawn again, at most every TILE_RETRY ms', () => {
  const lz = src('src/ui/lobule-zoom.js');
  // (Since 1 Nov a tile is a picture recorded for the GPU, never a canvas the browser can leave blank; the retry stays for any marked so.)
  assert.match(lz, /const TILE_RETRY = 250;\n\s+const tileDue = \(q\) => !!q && !!q\.blank && performance\.now\(\) >= q\.blankAt \+ TILE_RETRY;/);
  assert.match(lz, /cv: gpuPicture\(rec, \+\+texVer\), blank: false, blankAt: 0 \}\);/);
  assert.match(lz, /if \(t\.cv && tileDue\(t\)\) \{ free\(t\.cv\); t\.cv = null;/);
  assert.match(lz, /const blank = !t\.cv \|\| !t\.cv\.width \|\| t\.blank;/, 'a copy of a missing tile is clear, never black');
});

// Mohammad, 1 Nov (iPhone): once the lobule settled, the hepatocytes and the neighbours went black for a moment. A texture the GPU
// could not take (no memory for the sharper bitmap) has no level 0 and reads opaque black. Now the level is made clear first, the canvas
// laid into it, the GPU asked whether it went, and a draw with any texture that did not go returns false (the 2D canvas draws instead).
test('a texture the GPU could not take is never drawn: the draw returns false, and the send is tried again only after a while', async () => {
  const { sendCanvas } = await import('../src/ui/field-gl.js');
  const { createTissueGL } = await import('../src/ui/tissue-gl.js');
  let fail = false;
  const calls = [];
  const gl = new Proxy({}, { get(_, p) {
    if (typeof p !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(p)) return p;
    if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
    if (p === 'isContextLost') return () => false;
    if (p === 'getExtension' || p === 'getParameter') return () => null;
    if (p === 'getError') return () => (fail ? 'OUT_OF_MEMORY' : 'NO_ERROR');
    return (...a) => { calls.push([p, ...a]); return {}; };
  } });
  // (The send: the level made clear at the canvas's size, then the canvas laid into it.)
  const cv = { width: 16, height: 8 };
  assert.equal(sendCanvas(gl, cv), true);
  assert.deepEqual(calls.at(-2).slice(1), ['TEXTURE_2D', 0, 'RGBA8', 16, 8, 0, 'RGBA', 'UNSIGNED_BYTE', null]);
  assert.deepEqual(calls.at(-1), ['texSubImage2D', 'TEXTURE_2D', 0, 0, 0, 'RGBA', 'UNSIGNED_BYTE', cv]);
  assert.doesNotMatch(src('src/ui/field-gl.js'), /TEX_SAFE|texsafe/, 'every send checked');
  const g = createTissueGL({ width: 0, height: 0, addEventListener() {} }, { gl });
  const q = { width: 4, height: 4 }, w = { width: 64, height: 64 };
  const frame = (wVer) => ({ W: 100, H: 100, qa: q, qb: null, mix: 0, w, wVer, rect: [0, 0, 100], ox: 50, oy: 50, rd: 40, fade: [44, 128], mid: 0.5, bg: [1, 1, 1] });
  assert.equal(g.draw(frame(1)), true);
  fail = true;
  assert.equal(g.draw(frame(2)), true, 'the new bitmap did not go, the canvas not showing: still drawn on the GPU (the clear texture in its place), never the 2D canvas');
  fail = false;
  const n = calls.length;
  assert.equal(g.draw(frame(2)), true, 'drawn on the GPU without it, not sent again at once');
  assert.equal(calls.slice(n).filter((c) => c[0] === 'texSubImage2D').length, 0);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(g.draw(frame(2)), true, 'sent again after a while, and drawn');
});

test('showing, a frame whose texture did not go keeps the last picture: no black, and no step down to the 2D canvas', async () => {
  const { createTissueGL } = await import('../src/ui/tissue-gl.js');
  let fail = false;
  const calls = [];
  const gl = new Proxy({}, { get(_, p) {
    if (typeof p !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(p)) return p;
    if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
    if (p === 'isContextLost') return () => false;
    if (p === 'getExtension' || p === 'getParameter') return () => null;
    if (p === 'getError') return () => (fail ? 'OUT_OF_MEMORY' : 'NO_ERROR');
    return (...a) => { calls.push([p, ...a]); return {}; };
  } });
  const canvas = { width: 0, height: 0, getContext: () => gl, addEventListener() {} };
  const g = createTissueGL(canvas, { gl });
  const q = { width: 4, height: 4 }, w = { width: 64, height: 64 };
  const frame = (wVer, W = 100) => ({ W, H: 100, qa: q, qb: null, mix: 0, w, wVer, rect: [0, 0, 100], ox: 50, oy: 50, rd: 40, fade: [44, 128], mid: 0.5, bg: [1, 1, 1], hold: true });
  assert.equal(g.draw(frame(1)), true);
  fail = true;
  const n = calls.length;
  assert.equal(g.draw(frame(2)), 'held');
  assert.equal(calls.slice(n).filter((c) => c[0] === 'drawArrays' || c[0] === 'viewport').length, 0, 'the canvas untouched: its last frame stays');
  assert.equal(canvas.width, 100);
  assert.equal(g.draw(frame(3, 120)), true, 'at another size there is no picture to keep: drawn on the GPU without the texture, not on the 2D canvas');
});

test('the GPU canvas taking over leaves the 2D canvas whole under it for a moment', () => {
  const lz = src('src/ui/lobule-zoom.js');
  assert.match(lz, /const HANDOFF_MS = 160;/);
  assert.match(lz, /if \(on && !rimDrawn\) \{\n\s+tissueOnGL = true;\n/);
  assert.doesNotMatch(lz, /HANDOFF &&|handoff=0/);
  assert.match(lz, /handoffT = setTimeout\(\(\) => \{ handoffT = 0; if \(tissueOnGL\) free\(tissue\); \}, HANDOFF_MS\);/);
  assert.match(lz, /if \(!\(\(!tissueOnGL \|\| handoffT\) && !rimDrawn\)\) free\(tissue\);/);
  assert.match(lz, /A\.hold = tissueOnGL;/);
});

test('the zoom into and out of a sinusoid keeps the tissue on the GPU (the only painter since 1 Nov)', () => {
  const lz = src('src/ui/lobule-zoom.js');
  assert.doesNotMatch(lz, /SIN_GPU|singpu|keep2D/);
  assert.match(lz, /showTissueGL\(paintTissue\(W, H, dpr, dark, cs, !g, g \? tissueGLOn\(\) : null\)\);/);
  assert.match(lz, /fxOnGPU\(W, H, dpr, dark, dt, g && !g\.lost\);/);
});
