import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { softwareYield, softwareGL } from '../src/ui/sw-yield.js';

// A software renderer's yield (src/ui/sw-yield.js): where WebGL is drawn on the CPU, a vessel frame that held the page
// T ms is followed by T ms without one, so the page's timers and workers keep running (16 Oct: on a CI runner each frame
// held the page 0.4 to 3 s and a slide's timed steps ran 10 to 20 times late). On a GPU there is no yield at all.
const SRC = new URL('../src/ui/', import.meta.url);

// The renderer test the stage reads (veins-gl.js: software), as written there.
const softwareTest = () => {
  const js = readFileSync(new URL('veins-gl.js', SRC), 'utf8');
  const m = js.match(/software = \/(.+?)\/(\w*)\.test\(String\(gl\.getParameter\(ri \? ri\.UNMASKED_RENDERER_WEBGL : gl\.RENDERER\)\)\)/);
  assert.ok(m, 'veins-gl.js decides software from the WebGL renderer string alone');
  return new RegExp(m[1], m[2]);
};

test('only a software rasterizer named by the WebGL renderer counts as software', () => {
  const re = softwareTest();
  // (the lobule, the sinusoid view and the anatomy ask the same question: sw-yield.js's test is veins-gl.js's)
  const own = readFileSync(new URL('sw-yield.js', SRC), 'utf8').match(/const SOFTWARE = \/(.+?)\/(\w*);/);
  assert.ok(own && own[1] === re.source && own[2] === re.flags, 'sw-yield.js tests the renderer as veins-gl.js does');
  const asGL = (name, masked = false) => ({ RENDERER: 1, getExtension: () => (masked ? null : { UNMASKED_RENDERER_WEBGL: 2 }), getParameter: (p) => (p === 2 || masked ? name : 'WebKit WebGL') });
  assert.equal(softwareGL(asGL('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')), true);
  assert.equal(softwareGL(asGL('Apple GPU')), false);
  assert.equal(softwareGL(asGL('WebKit WebGL', true)), false, 'a renderer name withheld is a GPU');
  assert.equal(softwareGL({ getExtension() { throw new Error('lost'); } }), false, 'a context that cannot answer is a GPU');
  for (const s of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',   // (the CI runners')
    'Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa softpipe',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Software Rasterizer',
  ]) assert.ok(re.test(s), `software: ${s}`);
  for (const s of [
    'Apple GPU',   // (Safari on a Mac, iPad and iPhone masks the renderer to this)
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)', 'Apple M1',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel(R) UHD Graphics 620',
    'Mali-G78', 'Adreno (TM) 740', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon Pro 5500M OpenGL Engine',
    'WebKit WebGL', 'Mozilla', '',
  ]) assert.ok(!re.test(s), `a GPU: ${s}`);
});

test('a GPU makes no yield', () => {
  assert.equal(softwareYield(false), null);
  assert.equal(softwareYield(undefined), null);
});

test('on a GPU the frame loop never enters the yield', () => {
  const js = readFileSync(new URL('stage.js', SRC), 'utf8');
  // (the yield exists only from the software test, and every use of it is guarded by its existence)
  assert.match(js, /const swYield = softwareYield\(SOFTWARE, SOFTWARE && !FIGW \? vCanvas\.getContext\('webgl2'\) : null\);/);
  assert.match(js, /const SOFTWARE = !!veins\?\.software;/);
  const uses = js.match(/swYield\b[^;]*/g).slice(1);
  assert.ok(uses.length >= 3, 'the yield is used in the frame loop');
  for (const u of uses) assert.match(u, /^swYield(\?\.drew\(now\)|\s*&&\s*!swYield\.ready\()/, `unguarded use: ${u}`);
  // The lobule and the sinusoid view the same: a yield only from their own context's software test, every use guarded.
  const lob = readFileSync(new URL('lobule-zoom.js', SRC), 'utf8');
  assert.match(lob, /lzYield = softwareYield\(!!gl\?\.software, gl\?\.software \? glCv\.getContext\('webgl2'\) : null\);/);
  for (const u of lob.match(/lzYield\b[^;]*/g).slice(2)) assert.match(u, /^lzYield(\?\.drew\(now\)|\s*&&\s*!lzYield\.ready\()/, `lobule-zoom.js: unguarded use: ${u}`);
  const sv = readFileSync(new URL('sinusoid-view.js', SRC), 'utf8');
  assert.match(sv, /svYield = swGL && softwareGL\(swGL\) \? softwareYield\(true, swGL\) : null;/);
  for (const u of sv.match(/svYield\b[^;]*/g).slice(1)) assert.match(u, /^svYield(\?\.drew\(performance\.now\(\)\)|\s*&&\s*!dive && !drewNow && !svYield\.ready\()/, `sinusoid-view.js: unguarded use: ${u}`);
});

test('a pan, zoom, glide or forced draw is drawn in its own frame, never held by the yield', () => {
  // (veins-gesture: a moved view drawn a frame late shows the vessels behind the rest of the figure)
  const js = readFileSync(new URL('stage.js', SRC), 'utf8');
  assert.match(js, /swYield && !swYield\.ready\(now, forceDraw \|\| drawOnce \|\| viewVersion !== drawnView\)/);
  const lob = readFileSync(new URL('lobule-zoom.js', SRC), 'utf8');
  assert.match(lob, /lzYield && !lzYield\.ready\(now, viewVer !== pacedVer\)/);
  // The sinusoid's zoom is drawn by place(), in step with the lobule, with no yield at all; the loop's wait skips the zoom.
  const sv = readFileSync(new URL('sinusoid-view.js', SRC), 'utf8');
  assert.match(sv, /if \(opacity > 0 && model\) \{ draw\(0, false\); drewNow = true; \}/);
  // And forced, a frame is drawn whatever the last one and its fence: right after a slow frame, and with the GPU busy.
  let signalled = false;
  const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3, fenceSync: () => ({}), flush() {}, deleteSync() {}, isContextLost: () => false, getSyncParameter: () => (signalled ? 3 : 0) };
  const y = softwareYield(true, gl);
  y.drew(0);
  for (let t = 16; t < 3000; t += 16) assert.equal(y.ready(t, true), true);
  signalled = true;
});

test('after a vessel frame that held the page T ms, the next waits T ms', () => {
  const y = softwareYield(true);
  assert.ok(y.ready(1000));
  y.drew(1000);
  // (the next frame starts 800 ms later: the draw held the page that long)
  assert.equal(y.ready(1800), false);
  assert.equal(y.ready(2599), false);
  assert.ok(y.ready(2600));
  y.drew(2600);
  // A quick frame waits as little: no rate of its own.
  assert.equal(y.ready(2617), false);
  assert.ok(y.ready(2634));
  y.drew(2634); assert.ok(y.ready(2634));   // (a frame no slower than nothing: no wait)
});

test('a resize or forced draw is drawn at once; a long hold never stalls the vessels past 2 s', () => {
  const y = softwareYield(true);
  y.drew(0);
  assert.equal(y.ready(1500), false);
  assert.ok(y.ready(1600, true), 'forced');
  y.drew(10000);
  assert.equal(y.ready(30000), false);   // (a page held 20 s by something else)
  assert.equal(y.ready(31999), false);
  assert.ok(y.ready(32000));
});

test('no frame was drawn: no wait', () => {
  const y = softwareYield(true);
  for (const t of [0, 16, 33, 50]) assert.ok(y.ready(t));
});

// A fake WebGL2 context: fences that signal when the test says the GPU has finished.
const fakeGL = () => {
  const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3, UNSIGNALED: 4, live: new Set(), flushed: 0, lost: false,
    fenceSync() { const f = { done: false }; gl.live.add(f); return f; }, getSyncParameter(f) { return f.done ? gl.SIGNALED : gl.UNSIGNALED; },
    deleteSync(f) { gl.live.delete(f); }, flush() { gl.flushed++; }, isContextLost() { return gl.lost; } };
  return gl;
};

test('a vessel frame waits until the last one has finished on the GPU (an unseen canvas piles up no frames)', () => {
  const gl = fakeGL(), y = softwareYield(true, gl);
  assert.ok(y.ready(0));
  y.drew(0);
  assert.equal(gl.live.size, 1, 'a fence follows the frame');
  assert.equal(gl.flushed, 1, 'and is sent');
  // (a hidden canvas: the frame did not hold the page, so only the GPU is waited for)
  assert.equal(y.ready(16), false);
  assert.equal(y.ready(5000), false, 'not finished: no new frame however long');
  [...gl.live][0].done = true;
  assert.ok(y.ready(5016));
  assert.equal(gl.live.size, 0, 'the finished fence is deleted');
  y.drew(5016); y.drew(5032);
  assert.equal(gl.live.size, 1, 'a forced second frame replaces the fence, none leak');
  assert.ok(y.ready(5048, true), 'a forced draw does not wait for the GPU');
  gl.lost = true;
  assert.ok(y.ready(9000), 'a lost context never stalls the loop');
});
