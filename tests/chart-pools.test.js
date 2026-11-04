// The chart pipeline's shared contexts (trace-gl.js, review pass item 6, 2 Nov 2026): charts of different sizes drawn in the same frames
// stop resizing one shared buffer (one pool, grown in steps, U2), coverage is
// one grow-only target per pool, a picture of the same size is written into its storage (texSubImage2D), and every picture handed over
// is counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let clock = 0;
globalThis.performance = { now: () => clock };
const timers = [];
globalThis.setTimeout = (f) => { timers.push(f); return timers.length; };
globalThis.clearTimeout = () => {};
const runTimers = () => { for (const f of timers.splice(0)) f(); };
const calls = [];
const fb = { status: 'FRAMEBUFFER_COMPLETE', alive: true };   // (what the fake driver says of the coverage target)
function fakeGL() {
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'isContextLost') return () => false;
      if (k === 'getExtension') return () => null;
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'checkFramebufferStatus') return () => fb.status;
      if (k === 'isTexture' || k === 'isFramebuffer') return () => fb.alive;
      return (...a) => { calls.push([k, ...a]); return k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined; };
    },
  });
}
const contexts = [];
globalThis.OffscreenCanvas = class { constructor(w, h) { this.w = w; this.h = h; this.resized = 0; } get width() { return this.w; } set width(v) { this.w = v; } get height() { return this.h; } set height(v) { this.h = v; } getContext() { const g = fakeGL(); contexts.push(g); return g; } transferToImageBitmap() { return {}; } addEventListener() {} };
globalThis.Image = class { set src(v) { this._s = v; this.width = 64; this.height = 64; queueMicrotask(() => this.onload?.()); } };
const elem = () => ({ width: 1, height: 1, style: {}, setAttribute() {}, remove() {}, addEventListener() {}, getContext: (k) => (k === 'bitmaprenderer' ? { transferFromImageBitmap() {} } : fakeGL()) });
globalThis.document = { createElement: elem };
globalThis.MutationObserver = class { observe() {} disconnect() {} }; globalThis.ResizeObserver = class { observe() {} disconnect() {} }; globalThis.IntersectionObserver = class { observe() {} disconnect() {} }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} }); globalThis.devicePixelRatio = 2; globalThis.innerWidth = 800; globalThis.innerHeight = 600; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.window = globalThis; globalThis.requestAnimationFrame = () => 0; globalThis.Element = class {}; globalThis.HTMLElement = class {}; globalThis.HTMLCanvasElement = class {};
globalThis.location = { search: '' };
const { createTraceGL, sharedStats, capOf } = await import('../src/ui/trace-gl.js');
await new Promise((r) => setImmediate(r)); runTimers();

const host = () => ({ style: {}, after() {} });
const draw = (c, w, h) => { const ctx = c.ctx2d(w, h, w * 2, h * 2); if (ctx) { c.line([0, w], [0, h], 2, '#fff', 1); c.end(); } return !!ctx; };

test('capacity steps', () => {
  assert.equal(capOf(1), 256); assert.equal(capOf(256), 256); assert.equal(capOf(257), 512);
});

test('charts of mixed sizes share ONE context and one grow-only buffer: no resize after warm-up (U2)', async () => {
  const made = contexts.length;
  const A = createTraceGL(host()), B = createTraceGL(host()), C = createTraceGL(host()), D = createTraceGL(host());
  assert.ok(A && B && C && D);
  const frame = (k) => { clock += 16; for (const [c, w, h] of [[A, 300, 120], [B, 200, 90], [C, 250 + (k % 5), 100], [D, 640, 300]]) assert.ok(draw(c, w, h)); runTimers(); };
  for (let i = 0; i < 6; i++) frame(i);
  const r0 = sharedStats.resizes;
  for (let i = 0; i < 60; i++) frame(i);
  assert.equal(sharedStats.resizes - r0, 0, `resizes in 60 frames: ${sharedStats.resizes - r0}`);
  assert.ok(contexts.length - made <= 1, `one shared context for all the charts, made ${contexts.length - made}`);
  assert.ok(sharedStats.transfers >= 264, 'every picture handed over is counted');
  for (const c of [A, B, C, D]) c.dispose();
});

test('coverage: one grow-only target per pool, never reallocated by a smaller chart', () => {
  const C = createTraceGL(host());
  clock += 3000;
  draw(C, 400, 200);
  const n = sharedStats.covAllocs;
  for (let i = 0; i < 20; i++) { clock += 16; draw(C, 400 - i * 7, 200 - i * 3); }
  assert.equal(sharedStats.covAllocs, n, 'smaller strokes fit the target there');
  C.dispose();
});

test('a picture of the same size again is written into its storage', () => {
  const C = createTraceGL(host());
  clock += 3000;
  const src = { width: 32, height: 16 };
  const ctx = C.ctx2d(100, 50, 200, 100);
  assert.ok(ctx);
  C.upload(src, 'k', 1); C.upload(src, 'k', 2); C.upload(src, 'k', 3);
  C.end();
  assert.ok(sharedStats.subUploads >= 2, `sub uploads: ${sharedStats.subUploads}`);
  C.dispose();
});

test('a coverage target the driver lost, or never completed, is made again, so strokes cannot silently stop while fills draw', () => {
  const C = createTraceGL(host());
  clock += 3000;
  assert.ok(draw(C, 400, 200));
  const base = sharedStats.covAllocs, remade = sharedStats.covRemade;
  for (let i = 0; i < 40; i++) { clock += 16; assert.ok(draw(C, 400, 200)); }
  assert.equal(sharedStats.covAllocs, base, 'a healthy target is kept: nothing made again');
  fb.alive = false;
  clock += 16; draw(C, 400, 200);
  fb.alive = true;
  assert.equal(sharedStats.covRemade, remade + 1, 'a lost target is noticed in the next frame');
  assert.ok(sharedStats.covAllocs > base, 'and allocated again');
  const a2 = sharedStats.covAllocs;
  fb.status = 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT';
  clock += 16; draw(C, 1100, 700);   // (a chart larger than the target: it grows, and the driver refuses)
  fb.status = 'FRAMEBUFFER_COMPLETE';
  for (let i = 0; i < 3; i++) { clock += 16; draw(C, 1100, 700); }
  const a3 = sharedStats.covAllocs;
  assert.ok(a3 > a2, 'an incomplete target is not kept: it is tried again');
  for (let i = 0; i < 20; i++) { clock += 16; draw(C, 1100, 700); }
  assert.equal(sharedStats.covAllocs, a3, 'once complete it is kept for good');
  C.dispose();
});
