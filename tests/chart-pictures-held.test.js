// GPU-1, GPU-2 (19 Nov 2026 whole-app review). A chart, readout or callout hands its picture to its own bitmap canvas, which holds the pool's WHOLE buffer until the next hand-over: 9.4 MB
// on a phone (1536 x 1536), twenty on a slide, none of it in the memory registry. Now each drawer counts what its canvas holds (gpu-budget.js 'chart pictures'), gives it back when the
// picture is cleared or the drawer disposed, and a readout draws in a pool of its own whose buffer is a readout's size. A lost pool context that does not come back clears the picture
// and shows the page's drawing within 1.5 s (GPU-2), never the last picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let clock = 0;
globalThis.performance = { now: () => clock };
const timers = [];
globalThis.setTimeout = (f, ms = 0) => { timers.push({ f, at: clock + ms }); return timers.length; };
globalThis.clearTimeout = (id) => { if (id > 0 && timers[id - 1]) timers[id - 1] = { f: () => {}, at: Infinity }; };
const advance = (ms) => { clock += ms; for (let i = 0; i < timers.length; i++) { const t = timers[i]; if (t && t.at <= clock) { timers[i] = { f: () => {}, at: Infinity }; t.f(); } } };
function fakeGL() {
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'isContextLost') return () => false;
      if (k === 'getExtension') return () => null;
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'checkFramebufferStatus') return () => 'FRAMEBUFFER_COMPLETE';
      return (...a) => (k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined);
    },
  });
}
const pools = [];
globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.w = w; this.h = h; this.ls = []; pools.push(this); }
  get width() { return this.w; } set width(v) { this.w = v; } get height() { return this.h; } set height(v) { this.h = v; }
  getContext() { return fakeGL(); }
  transferToImageBitmap() { return { bytes: this.w * this.h * 4, close() {} }; }
  addEventListener(t, f) { this.ls.push([t, f]); }
  fire(t) { for (const [n, f] of this.ls) if (n === t) f({ preventDefault() {} }); }
};
globalThis.Image = class { set src(v) { this.width = 64; this.height = 64; queueMicrotask(() => this.onload?.()); } };
const shownCanvases = [];   // (each drawer's bitmap canvas: what it holds now)
const elem = () => {
  const c = { width: 1, height: 1, style: {}, held: 0, setAttribute() {}, remove() {}, addEventListener() {}, getContext: (k) => (k === 'bitmaprenderer' ? { transferFromImageBitmap: (b) => { c.held = b ? b.bytes : 0; } } : fakeGL()) };
  shownCanvases.push(c);
  return c;
};
globalThis.document = { createElement: elem };
globalThis.MutationObserver = class { observe() {} disconnect() {} }; globalThis.ResizeObserver = class { observe() {} disconnect() {} }; globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
Object.assign(globalThis, { devicePixelRatio: 3, innerWidth: 390, innerHeight: 844, screen: { width: 390, height: 844 }, addEventListener: () => {}, removeEventListener: () => {}, window: globalThis, requestAnimationFrame: () => 0, Element: class {}, HTMLElement: class {}, HTMLCanvasElement: class {}, location: { search: '' } });
const { createTraceGL } = await import('../src/ui/trace-gl.js');
const { budget, picturesHeld, PICTURE_OWNER } = await import('../src/ui/gpu-budget.js');
await new Promise((r) => setImmediate(r)); advance(50);

const host = () => ({ style: {}, after() {} });
const draw = (c, w, h, k = 3) => { const ctx = c.ctx2d(w, h, w * k, h * k); if (ctx) { c.line([0, w], [0, h], 2, '#fff', 1); c.end(); } return !!ctx; };
const heldByCanvases = () => shownCanvases.reduce((a, c) => a + c.held, 0);

test('each picture a canvas holds is counted in the registry, and the count is what the canvases hold', () => {
  const before = picturesHeld();
  const cs = [createTraceGL(host()), createTraceGL(host()), createTraceGL(host())];
  clock += 5000;
  for (const c of cs) assert.ok(draw(c, 358, 330));
  const now = picturesHeld();
  assert.equal(now.n - before.n, 3);
  assert.equal(now.bytes - before.bytes, heldByCanvases(), 'the registry reads what the canvases hold');
  assert.equal(now.bytes - before.bytes, 3 * 1536 * 1536 * 4, 'a phone card picture holds the whole 1536 x 1536 buffer: 9.4 MB each');
  const b = budget();
  assert.ok(b.owners.some((o) => o.owner === PICTURE_OWNER && o.n >= 3), `'${PICTURE_OWNER}' is listed in pps.budget().owners`);
  assert.ok(b.picturesMb >= 28, 'and in its total');
  for (const c of cs) c.dispose();
});

test('a cleared picture and a disposed drawer give their bytes back at once', () => {
  const a = createTraceGL(host()), b = createTraceGL(host());
  clock += 5000;
  draw(a, 358, 330); draw(b, 358, 330);
  const full = picturesHeld().bytes;
  assert.ok(a.clearShown());
  assert.equal(picturesHeld().bytes, full - 1536 * 1536 * 4, 'clearShown');
  const held = heldByCanvases();
  b.dispose();
  assert.equal(picturesHeld().bytes, full - 2 * 1536 * 1536 * 4, 'dispose releases the canvas bitmap (transferFromImageBitmap(null)) and the count');
  assert.equal(heldByCanvases(), held - 1536 * 1536 * 4, 'the canvas itself holds nothing any more');
  a.dispose();
});

test('a readout draws in a pool of its own: its picture is a readout\'s size, not a card\'s', () => {
  const card = createTraceGL(host()), words = Array.from({ length: 12 }, () => createTraceGL(host(), { small: true }));
  clock += 5000;
  draw(card, 358, 330);
  const cardBytes = picturesHeld().bytes;
  for (const w of words) assert.ok(draw(w, 90, 30));   // (a number with its room: 270 x 90 device px)
  const readouts = picturesHeld().bytes - cardBytes;
  assert.ok(readouts <= 12 * 1024 * 512 * 4, `twelve readouts hold ${(readouts / 1e6).toFixed(1)} MB, at most 12 x 2.1 MB`);
  assert.ok(readouts < 12 * 1536 * 1536 * 4 / 4, 'under a quarter of what twelve card-size pictures hold (113 MB)');
  for (const w of words) w.dispose();
  card.dispose();
  assert.equal(picturesHeld().bytes, 0, 'everything is back');
});

test('a pool context lost and not restored shows the page\'s drawing within the deadline, and a restore takes the picture again (GPU-2)', () => {
  const h = host(), redrawn = [];
  const c = createTraceGL(h, { redraw: () => redrawn.push(1) });
  clock += 5000;
  assert.ok(draw(c, 358, 330));
  assert.equal(h.style.opacity, '0', 'the picture is on show, the page\'s canvas hidden');
  pools[0].fire('webglcontextlost');
  advance(1000);
  assert.equal(h.style.opacity, '0', 'inside the deadline the picture stays (a restore is on its way)');
  advance(600);
  assert.equal(h.style.opacity, '', 'past it the page\'s own drawing shows');
  assert.equal(picturesHeld().bytes, 0, 'and the old picture is cleared');
  assert.ok(redrawn.length >= 1, 'the chart is asked to draw on the page\'s canvas');
  c.dispose();
  // (a restore inside the deadline gives up nothing)
  const h2 = host();
  const d = createTraceGL(h2, { redraw: () => {} });
  clock += 5000;
  assert.ok(draw(d, 358, 330));
  pools[0].fire('webglcontextlost'); advance(800); pools[0].fire('webglcontextrestored'); advance(2000);
  assert.equal(h2.style.opacity, '0', 'restored in time: the picture stays');
  d.dispose();
});
