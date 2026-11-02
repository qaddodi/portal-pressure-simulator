// The chart pipeline's shared contexts (trace-gl.js, review pass item 6, 2 Nov 2026): charts of different sizes drawn in the same frames
// stop resizing one shared buffer (the chart asking moves to a pool at its size, made ready in a timer, never in its frame), coverage is
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
function fakeGL() {
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'isContextLost') return () => false;
      if (k === 'getExtension') return () => null;
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'checkFramebufferStatus') return () => 'FRAMEBUFFER_COMPLETE';
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
const { createTraceGL, sharedStats, capOf, poolFor } = await import('../src/ui/trace-gl.js');
await new Promise((r) => setImmediate(r)); runTimers();

const host = () => ({ style: {}, after() {} });
const draw = (c, w, h) => { const ctx = c.ctx2d(w, h, w * 2, h * 2); if (ctx) { c.line([0, w], [0, h], 2, '#fff', 1); c.end(); } return !!ctx; };

test('capacity steps and the pool a thrashing chart moves to', () => {
  assert.equal(capOf(1), 256); assert.equal(capOf(256), 256); assert.equal(capOf(257), 512);
  const mk = (w, h, sizedAt, ready = true) => ({ canvas: { width: w, height: h }, sizedAt, started: ready ? {} : null, atlasIn: ready, dead: false });
  const a = mk(100, 100, 0), b = mk(300, 200, 990), c = mk(50, 50, 0);
  b.sizedAt = 1400;
  assert.equal(poolFor([a, b, c], a, 300, 200, 1500), b, 'one already at its size');
  assert.equal(poolFor([a, b], a, 640, 480, 1500), null, 'b was sized less than a second ago, and a is the one asking: none');
  assert.equal(poolFor([a, b, c], a, 640, 480, 1500), c, 'an idle one');
  assert.equal(poolFor([a, mk(640, 480, 0, false)], a, 640, 480, 5000), null, 'never one still compiling or without its glyphs');
});

test('a chart sharing a pool with one of another size moves to the pool at its own size, and the resizes stop', async () => {
  // (Three pools; the fourth chart is given the least used one, the first chart's, and is 200 x 90 as the second chart is.)
  const A = createTraceGL(host()), B = createTraceGL(host()), C = createTraceGL(host()), D = createTraceGL(host());
  assert.ok(A && B && C && D);
  const frame = () => { clock += 16; for (const [c, w, h] of [[A, 300, 120], [B, 200, 90], [C, 250, 100], [D, 200, 90]]) assert.ok(draw(c, w, h)); runTimers(); };
  for (let i = 0; i < 6; i++) frame();
  const r0 = sharedStats.resizes;
  for (let i = 0; i < 60; i++) frame();
  assert.ok(sharedStats.moves >= 1, 'moved');
  assert.equal(sharedStats.resizes - r0, 0, `resizes in 60 frames: ${sharedStats.resizes - r0}`);
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
