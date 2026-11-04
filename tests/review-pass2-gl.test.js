// Review pass 2 (2 Nov 2026), items 2, 9 and 12: the first visible frame, GL state ownership and context lifecycle.
// - Framebuffer completeness is asked once per attachment layout per context generation (gl-state.js fbComplete), never for a size of 0,
//   and a loss and restore starts a new generation that keeps none of the old verdicts or limits.
// - The record follows the driver: a call that throws leaves it as it was.
// - The warm-up draw (gl-compile.js exerciseDraw) reads what is bound from the record, not the driver, and gives the host its
//   framebuffer, viewport, program and vertex array back.
// - A started program that is slow to compile is never left to its first draw to publish: the poll keeps going.
// - A renderer that names a software rasterizer stays software, whatever the browser's performance-caveat answer says.
// - The chart and monitor glyph atlases, the Doppler monitor and the endoscopy field do no driver wait inside the frame that first draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// A WebGL2 stand-in the record accepts (gl-state.js tells WebGL2 by its class), counting the driver queries it is asked.
class W2 {}
globalThis.WebGL2RenderingContext = W2;
// (The browser's own answer for sw-yield.js: a context with failIfMajorPerformanceCaveat is given, as on a browser that calls it accelerated.)
globalThis.OffscreenCanvas = class { getContext() { return { getExtension: () => null }; } };

const { fbComplete, glGen, glGet, fbVerified, glOkBefore, glOkAfter, trackGL } = await import('../src/ui/gl-state.js');
const { exerciseDraw, publishWhenDone, startProgram } = await import('../src/ui/gl-compile.js');
const { rendererVerdict, softwareGL } = await import('../src/ui/sw-yield.js');

function fakeGL({ complete = true } = {}) {
  const ls = {};
  const gl = Object.create(W2.prototype);
  const K = { FRAMEBUFFER: 0x8d40, READ_FRAMEBUFFER: 0x8ca8, DRAW_FRAMEBUFFER: 0x8ca9, FRAMEBUFFER_COMPLETE: 0x8cd5, MAX_TEXTURE_SIZE: 0x0d33,
    READ_FRAMEBUFFER_BINDING: 0x8caa, DRAW_FRAMEBUFFER_BINDING: 0x8ca6, VIEWPORT: 0x0ba2, SCISSOR_BOX: 0x0c10, CURRENT_PROGRAM: 0x8b8d,
    VERTEX_ARRAY_BINDING: 0x85b5, ARRAY_BUFFER_BINDING: 0x8894, RENDERBUFFER_BINDING: 0x8ca7, ACTIVE_TEXTURE: 0x84e0, TEXTURE_BINDING_2D: 0x8069,
    TEXTURE0: 0x84c0, TEXTURE_2D: 0x0de1, ARRAY_BUFFER: 0x8892, RENDERBUFFER: 0x8d41, BLEND: 0x0be2, STENCIL_TEST: 0x0b90, SCISSOR_TEST: 0x0c11,
    DEPTH_TEST: 0x0b71, CULL_FACE: 0x0b44, COLOR_ATTACHMENT0: 0x8ce0, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, TEXTURE_MIN_FILTER: 0x2801, NEAREST: 0x2600,
    FRONT: 0x0404, BACK: 0x0405 };
  Object.assign(gl, K);
  const st = { fbR: null, fbD: null, vp: [0, 0, 300, 150], prog: null, vao: null, unit: K.TEXTURE0, tex: new Map() };
  gl.n = { status: 0, param: 0 };
  gl.lost = false;
  gl.canvas = { addEventListener: (t, f) => { (ls[t] ||= []).push(f); } };
  gl.fire = (t) => { for (const f of ls[t] || []) f({ preventDefault() {} }); };
  gl.checkFramebufferStatus = () => { gl.n.status++; return complete ? K.FRAMEBUFFER_COMPLETE : 0x8cd6; };
  gl.isContextLost = () => gl.lost;
  gl.isEnabled = () => false;
  gl.getParameter = (k) => {
    gl.n.param++;
    switch (k) {
      case K.MAX_TEXTURE_SIZE: return 4096;
      case K.READ_FRAMEBUFFER_BINDING: return st.fbR;
      case K.DRAW_FRAMEBUFFER_BINDING: return st.fbD;
      case K.VIEWPORT: return Int32Array.from(st.vp);
      case K.SCISSOR_BOX: return new Int32Array(4);
      case K.CURRENT_PROGRAM: return st.prog;
      case K.VERTEX_ARRAY_BINDING: return st.vao;
      case K.ACTIVE_TEXTURE: return st.unit;
      case K.TEXTURE_BINDING_2D: return st.tex.get(st.unit) ?? null;
      default: return null;
    }
  };
  gl.bindFramebuffer = (t, f) => { if (t !== K.DRAW_FRAMEBUFFER) st.fbR = f; if (t !== K.READ_FRAMEBUFFER) st.fbD = f; };
  gl.viewport = (x, y, w, h) => { st.vp = [x, y, w, h]; };
  gl.useProgram = (p) => { st.prog = p; };
  gl.bindVertexArray = (v) => { st.vao = v; };
  gl.activeTexture = (u) => { st.unit = u; };
  gl.bindTexture = (t, x) => { st.tex.set(st.unit, x); };
  for (const name of ['enable', 'disable', 'scissor', 'bindBuffer', 'bindRenderbuffer', 'blendFunc', 'blendFuncSeparate', 'blendEquation', 'blendEquationSeparate',
    'colorMask', 'clearColor', 'stencilMask', 'stencilMaskSeparate', 'texImage2D', 'texParameteri', 'framebufferTexture2D', 'deleteFramebuffer', 'deleteTexture',
    'deleteBuffer', 'deleteRenderbuffer', 'deleteVertexArray', 'drawArrays']) gl[name] = () => {};
  gl.createFramebuffer = () => ({ fb: true });
  gl.createTexture = () => ({ tex: true });
  gl.st = st;
  return trackGL(gl);
}

test('a framebuffer verdict belongs to its framebuffer, size and attachments; a loss and restore asks again (B10)', () => {
  const gl = fakeGL();
  assert.equal(glGen(gl), 1);
  const fb = { fb: 1 };
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 64), true);
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 64), true);
  assert.equal(gl.n.status, 1, 'the same framebuffer, as it was, is not asked twice');
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 65), true);
  assert.equal(gl.n.status, 2, 'resized storage is asked');
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, {}, 0);
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 65), true);
  assert.equal(gl.n.status, 3, 're-attached is asked');
  const fb2 = { fb: 2 };
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 65), true);
  assert.equal(gl.n.status, 4, 'a new framebuffer of the same layout is asked');
  gl.lost = true; gl.fire('webglcontextlost');
  assert.equal(glGen(gl), 2, 'a loss ends the generation');
  assert.equal(fbVerified(gl, fb2), false, 'no verdict survives a loss');
  gl.lost = false; gl.fire('webglcontextrestored');
  assert.equal(glGen(gl), 3);
  fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 65);
  assert.equal(gl.n.status, 5, 'the restored context is asked afresh');
});

test('B10: after one success, a second incomplete framebuffer and a failed second copy of the same layout are rejected', () => {
  const gl = fakeGL();
  gl.bindFramebuffer(gl.FRAMEBUFFER, { a: 1 });
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 32, 32), true);
  gl.checkFramebufferStatus = () => 0x8cd6;
  gl.bindFramebuffer(gl.FRAMEBUFFER, { a: 2 });
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 32, 32), false, 'the second framebuffer is its own');
  let err = 0; gl.NO_ERROR = 0; gl.getError = () => err;
  glOkBefore(gl); assert.equal(glOkAfter(gl), true);
  glOkBefore(gl); err = 0x505; assert.equal(glOkAfter(gl), false, 'the second copy is checked, not taken from the first');
});

test('a size of 0 or past the texture limit is never complete and never asked; an incomplete verdict is not kept', () => {
  const gl = fakeGL();
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 0, 64), false);
  assert.equal(fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', 64, 8192), false);
  assert.equal(gl.n.status, 0);
  const bad = fakeGL({ complete: false });
  assert.equal(fbComplete(bad, bad.FRAMEBUFFER, 'rgba8', 64, 64), false);
  assert.equal(fbComplete(bad, bad.FRAMEBUFFER, 'rgba8', 64, 64), false);
  assert.equal(bad.n.status, 2, 'an incomplete framebuffer is asked again next time');
});

test('the record follows the driver: a call that throws leaves it as the driver has it', () => {
  const gl = fakeGL();
  const fb = { fb: 1 };
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  assert.equal(glGet(gl, gl.DRAW_FRAMEBUFFER_BINDING), fb);
  // (The driver's own method replaced under the wrapper is not reachable; a wrong argument type throws from the wrapped call itself.)
  const g2 = fakeGL();
  const raw = g2.useProgram;
  const p = { p: 1 };
  g2.useProgram(p);
  assert.equal(glGet(g2, g2.CURRENT_PROGRAM), p);
  assert.equal(typeof raw, 'function');
  const src = readFileSync(new URL('../src/ui/gl-state.js', import.meta.url), 'utf8');
  assert.match(src, /own\('useProgram', \(f\) => \(p\) => \{ f\(p\); r\.prog = p; \}\);/, 'the driver first, then the record');
  assert.match(src, /own\('bindFramebuffer', \(f\) => \(t, fb\) => \{ f\(t, fb\);/);
});

test('the warm-up draw reads the record, not the driver, and gives the host its framebuffer, viewport, program and vertex array back', () => {
  const gl = fakeGL();
  const host = { fb: 'host' }, prog = { p: 'host' }, vao = { v: 'host' };
  gl.bindFramebuffer(gl.FRAMEBUFFER, host); gl.viewport(10, 20, 640, 480); gl.useProgram(prog); gl.bindVertexArray(vao);
  // (The first warm-up on a context starts its record, a sweep and one ask per texture unit not yet seen; from then on none.)
  let drew = 0;
  exerciseDraw(gl, () => { drew++; });
  const asked = gl.n.param;
  exerciseDraw(gl, () => { drew++; gl.useProgram({ p: 'warm' }); gl.bindVertexArray({ v: 'warm' }); });
  assert.equal(drew, 2);
  assert.equal(gl.n.param - asked, 0, 'no getParameter reached the driver');
  assert.equal(gl.st.fbD, host); assert.equal(gl.st.fbR, host);
  assert.deepEqual(Array.from(gl.st.vp), [10, 20, 640, 480]);
  assert.equal(gl.st.prog, prog); assert.equal(gl.st.vao, vao);
});

test('a program slow to compile is not handed to its first draw: the poll keeps asking past its tries', async () => {
  let done = false, asked = 0;
  const ext = { COMPLETION_STATUS_KHR: 0x91b1 };
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, getExtension: () => ext, isContextLost: () => false,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, createProgram: () => ({}), attachShader() {}, bindAttribLocation() {}, linkProgram() {},
    getProgramParameter: () => { asked++; return done; },
  };
  const h = startProgram(gl, 'v', 'f');
  let published = 0;
  publishWhenDone(gl, [h], () => { published++; }, 2, () => true);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(published, 0);
  done = true;
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(published, 1, 'published by the poll after its tries ran out, not left to a draw');
  assert.ok(asked >= 3);
});

test('a named software rasterizer stays software even where the browser calls WebGL accelerated; a vaguer name asks the browser', () => {
  assert.equal(rendererVerdict(true, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), true);
  assert.equal(rendererVerdict(true, 'llvmpipe (LLVM 15.0.7, 256 bits)'), true);
  assert.equal(rendererVerdict(true, 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'), true);
  assert.equal(rendererVerdict(true, 'Software Rasterizer'), false, 'the browser says accelerated: the GPU path');
  assert.equal(rendererVerdict(false, 'Apple GPU'), false);
  const asGL = (name) => ({ RENDERER: 1, getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }), getParameter: () => name });
  assert.equal(softwareGL(asGL('Google SwiftShader')), true);
  assert.equal(softwareGL(asGL('Apple GPU')), false);
});

const src = (p) => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');

test('no module asks the driver for framebuffer completeness itself: every check goes through the per-generation verdict', () => {
  const dir = new URL('../src/ui/', import.meta.url);
  const hits = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'gl-state.js').filter((f) => /\.checkFramebufferStatus\(/.test(src(f)));
  assert.deepEqual(hits, []);
  assert.match(src('wide-gl.js'), /MAX = glCap\(gl, gl\.MAX_TEXTURE_SIZE\);/, 'the wide copy\'s texture limit comes from the record');
});

test('no glyph atlas is sent and no program published inside the frame that first draws', () => {
  const trace = src('trace-gl.js');
  assert.match(trace, /if \(!atlasIn\) \{\n(?:\s+\/\/[^\n]*\n)*\s+sendAtlasSoon\(\); return false;\n\s+\}/, 'charts: the atlas goes up at an idle moment, the chart drawn then');
  assert.match(trace, /P = out; lost = false;\n\s+sendAtlas\(\);/, 'charts: the atlas goes up with the programs');
  const vitals = src('vitals-gl.js');
  assert.match(vitals, /\n\s+cancelPub = publishWhenDone\(gl, Object\.values\(progs\), \(\) => \{ cancelPub = null; if \(!dead && R && !lost && publish\(\)\) atlasReady\(\); \}\);/);
  assert.match(vitals, /atlasTakers\.delete\(taker\);/, 'a disposed monitor is let go of');
  assert.match(src('doppler-gl.js'), /if \(waitingDraw\) \{ waitingDraw = false; try \{ onReady\?\.\(\); \}/, 'the monitor is drawn again once published');
  assert.match(src('endo-gl.js'), /for \(const h of r\.holders\) if \(h\.need\) \{ h\.need = false; try \{ h\.onBack\?\.\(\); \}/, 'the field is drawn again once published');
  assert.match(src('instruments.js'), /if \(!sameKey && !gl\.pending\) \{/, 'no field is shaded while its program compiles');
});
