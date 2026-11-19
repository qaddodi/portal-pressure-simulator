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
const fb = { status: 'FRAMEBUFFER_COMPLETE', alive: true, asked: 0 };   // (what the fake driver says of the coverage target)
function fakeGL() {
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'isContextLost') return () => false;
      if (k === 'getExtension') return () => null;
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'checkFramebufferStatus') return () => fb.status;
      if (k === 'isTexture' || k === 'isFramebuffer') return () => { fb.asked++; return fb.alive; };
      return (...a) => { calls.push([k, ...a]); return k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined; };
    },
  });
}
const contexts = [];
const canvases = [];   // (every pool canvas made, with the listeners it was given: a test fires the pool's own)
globalThis.OffscreenCanvas = class { constructor(w, h) { this.w = w; this.h = h; this.resized = 0; this.ls = []; canvases.push(this); } get width() { return this.w; } set width(v) { this.w = v; } get height() { return this.h; } set height(v) { this.h = v; } getContext() { const g = fakeGL(); contexts.push(g); return g; } transferToImageBitmap() { return {}; } addEventListener(t, f) { this.ls.push([t, f]); } };
globalThis.Image = class { set src(v) { this._s = v; this.width = 64; this.height = 64; queueMicrotask(() => this.onload?.()); } };
const elem = () => ({ width: 1, height: 1, style: {}, setAttribute() {}, remove() {}, addEventListener() {}, getContext: (k) => (k === 'bitmaprenderer' ? { transferFromImageBitmap() {} } : fakeGL()) });
globalThis.document = { createElement: elem };
globalThis.MutationObserver = class { observe() {} disconnect() {} }; globalThis.ResizeObserver = class { observe() {} disconnect() {} }; globalThis.IntersectionObserver = class { observe() {} disconnect() {} }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} }); globalThis.devicePixelRatio = 2; globalThis.innerWidth = 800; globalThis.innerHeight = 600; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.window = globalThis; globalThis.requestAnimationFrame = () => 0; globalThis.Element = class {}; globalThis.HTMLElement = class {}; globalThis.HTMLCanvasElement = class {};
globalThis.location = { search: '' };
const { createTraceGL, sharedStats, capOf, poolFloor } = await import('../src/ui/trace-gl.js');
await new Promise((r) => setImmediate(r)); runTimers();

const host = () => ({ style: {}, after() {} });
const draw = (c, w, h, k = 2) => { const ctx = c.ctx2d(w, h, w * k, h * k); if (ctx) { c.line([0, w], [0, h], 2, '#fff', 1); c.end(); } return !!ctx; };

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

test('a coverage target from before a context was made again, or never completed, is made again, so strokes cannot silently stop while fills draw (asked of the context generation, never of the driver: GPU-6)', () => {
  const C = createTraceGL(host());
  clock += 3000;
  assert.ok(draw(C, 400, 200));
  const base = sharedStats.covAllocs, remade = sharedStats.covRemade;
  for (let i = 0; i < 40; i++) { clock += 16; assert.ok(draw(C, 400, 200)); }
  assert.equal(sharedStats.covAllocs, base, 'a healthy target is kept: nothing made again');
  assert.equal(fb.asked, 0, 'no synchronous object query was made in those frames');
  // (the pool's context restored: its generation moves on, the pool's own listener is the first it was given)
  canvases[0].ls.find(([t]) => t === 'webglcontextrestored')[1]();
  clock += 16; draw(C, 400, 200);
  assert.equal(sharedStats.covRemade, remade + 1, 'a target of an older context is noticed in the next frame');
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

test('one full-screen chart does not leave every small chart handing over a full-screen buffer: the buffer shrinks back after a quiet second', () => {
  const big = createTraceGL(host()), small = createTraceGL(host());
  clock += 3000;
  assert.ok(draw(big, 1860, 1200));   // (the lobule's leader layer on a Mac: 3720 x 2400 device px)
  const r0 = sharedStats.resizes;
  for (let i = 0; i < 10; i++) { clock += 16; assert.ok(draw(small, 200, 90)); }
  for (let i = 0; i < 200; i++) { clock += 16; assert.ok(draw(small, 200, 90)); }
  assert.ok(sharedStats.resizes - r0 >= 1, 'cut back once the big chart stopped drawing (at once since 8 Nov 2026: a big layer never holds the buffer)');
  const r1 = sharedStats.resizes;
  for (let i = 0; i < 200; i++) { clock += 16; assert.ok(draw(small, 200, 90)); }
  assert.equal(sharedStats.resizes, r1, 'and then left alone');
  big.dispose(); small.dispose();
});

test('a screen-size layer with a pool of its own and the small pictures never resize one buffer in turn (the lobule view at rest: 10 to 16 resizes in 6.5 s, each dearer than the last; the tester, 17 Nov 2026)', () => {
  const big = createTraceGL(host(), { big: true }), small = createTraceGL(host());
  assert.ok(big && small);
  clock += 5000;
  // (warm-up: each draws once and finds its size)
  for (let i = 0; i < 5; i++) { clock += 16; assert.ok(draw(big, 1860, 1200)); assert.ok(draw(small, 200, 90)); }
  const r0 = sharedStats.resizes;
  // (a minute and a half of the lobule at rest: the leader layer draws now and then, the card's picture between, past every quiet spell the shared buffer used to be cut back in)
  for (let i = 0; i < 5400; i++) {
    clock += 16;
    if (i % 90 === 0) assert.ok(draw(big, 1860, 1200));
    if (i % 7 === 0) assert.ok(draw(small, 200, 90));
  }
  assert.equal(sharedStats.resizes - r0, 0, `buffer resizes while at rest: ${sharedStats.resizes - r0}`);
  big.dispose(); small.dispose();
});

test('without a pool of its own the same alternation does resize (what the tester saw), so the test above holds the pool to it', () => {
  const big = createTraceGL(host()), small = createTraceGL(host());
  clock += 5000;
  for (let i = 0; i < 5; i++) { clock += 16; draw(big, 1860, 1200); draw(small, 200, 90); }
  const r0 = sharedStats.resizes;
  for (let i = 0; i < 5400; i++) {
    clock += 16;
    if (i % 90 === 0) draw(big, 1860, 1200);
    if (i % 7 === 0) draw(small, 200, 90);
  }
  assert.ok(sharedStats.resizes - r0 >= 10, `one shared buffer: ${sharedStats.resizes - r0} resizes`);
  big.dispose(); small.dispose();
});

test('card-size pictures of every size a card makes never resize the shared buffer once it is at its floor, however the sizes come and go (the tester, a lobule pick: 13 to 21 resizes in 6.5 s)', () => {
  const cs = [createTraceGL(host()), createTraceGL(host()), createTraceGL(host()), createTraceGL(host())];
  clock += 5000;
  const sizes = [[100, 40], [250, 100], [180, 160], [400, 150], [120, 90], [500, 190], [60, 60]];   // (css px; device px twice that: up to 1000 x 380)
  // (warm-up: the buffer finds its size)
  for (let i = 0; i < 20; i++) { clock += 16; for (const c of cs) { const [w, h] = sizes[(i * 3 + cs.indexOf(c)) % sizes.length]; draw(c, w, h); } }
  const r0 = sharedStats.resizes;
  // (many picks: a different picture each time, alone in its burst, with long quiet spells between, past SHRINK_MS: the buffer used to follow the one picture's size, up and down)
  for (let pick = 0; pick < 40; pick++) {
    clock += 2500;
    const [w, h] = sizes[(pick * 3) % sizes.length], c = cs[pick % cs.length];
    for (let f = 0; f < 6; f++) { clock += 16; draw(c, w, h); }
  }
  assert.equal(sharedStats.resizes - r0, 0, `resizes over 40 picks: ${sharedStats.resizes - r0}`);
  for (const c of cs) c.dispose();
});

test("the shared buffer's floor is this screen's card pictures: a phone's three-pixel cards need no growth after the first pick (the tester, 390 px: 9 resizes cold, 2 warmed, one frame 602 ms)", () => {
  assert.deepEqual(poolFloor(390, 844, 3), [1536, 1536], 'a phone: 1170 px wide cards, 1266 tall at most');
  assert.deepEqual(poolFloor(1440, 900, 2), [1536, 1024], 'a laptop: cards are capped at 620 x 460 css px');
  assert.deepEqual(poolFloor(0, 0, 1), [1024, 768], 'no window: the least floor');
  assert.deepEqual(poolFloor(320, 480, 1), [1024, 768], 'never below the least floor');
  const was = [globalThis.innerWidth, globalThis.innerHeight, globalThis.devicePixelRatio];
  globalThis.innerWidth = 390; globalThis.innerHeight = 844; globalThis.devicePixelRatio = 3;
  try {
    const cs = [createTraceGL(host()), createTraceGL(host()), createTraceGL(host())];
    clock += 5000;
    const sizes = [[330, 120], [358, 200], [150, 90], [340, 400], [60, 40], [300, 360]];   // (css px, 3 device px each: up to 1074 x 1200)
    for (let i = 0; i < 6; i++) { clock += 16; draw(cs[0], ...sizes[0], 3); }
    const r0 = sharedStats.resizes;
    for (let pick = 0; pick < 40; pick++) {
      clock += 2500;
      const [w, h] = sizes[(pick * 5) % sizes.length];
      for (let f = 0; f < 4; f++) { clock += 16; draw(cs[pick % cs.length], w, h, 3); }
    }
    assert.equal(sharedStats.resizes - r0, 0, `resizes over 40 picks on a phone: ${sharedStats.resizes - r0}`);
    for (const c of cs) c.dispose();
  } finally { [globalThis.innerWidth, globalThis.innerHeight, globalThis.devicePixelRatio] = was; if (was[0] === undefined) { delete globalThis.innerWidth; delete globalThis.innerHeight; delete globalThis.devicePixelRatio; } }
});

test("on a phone a card's chart is not a big layer, and a small chart beside it draws in the floor: no buffer of its own size, no resize (the tester, 390 px: 1 to 11 resizes after the first pick)", () => {
  const was = { w: globalThis.innerWidth, h: globalThis.innerHeight, d: globalThis.devicePixelRatio, s: globalThis.screen };
  globalThis.innerWidth = 390; globalThis.innerHeight = 844; globalThis.devicePixelRatio = 3; globalThis.screen = { width: 390, height: 844 };
  try {
    const card = createTraceGL(host()), small = createTraceGL(host());
    clock += 5000;
    for (let i = 0; i < 6; i++) { clock += 16; draw(card, 358, 330, 3); draw(small, 80, 30, 3); }
    const r0 = sharedStats.resizes;
    for (let i = 0; i < 300; i++) { clock += 16; if (i % 40 === 0) draw(card, 358, 330, 3); draw(small, 80, 30, 3); if (i % 97 === 0) clock += 1500; }
    assert.equal(sharedStats.resizes - r0, 0, `resizes: ${sharedStats.resizes - r0}`);
    card.dispose(); small.dispose();
  } finally {
    for (const [k, v] of [['innerWidth', was.w], ['innerHeight', was.h], ['devicePixelRatio', was.d], ['screen', was.s]]) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
});
