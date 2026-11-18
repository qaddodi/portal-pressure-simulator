// A card's first mark waits for its glass to be on screen, not only drawn (18 Nov 2026, Mohammad on his Mac and iPhone: "all vessel and tips etc cards show text before card still").
// data-gl takes the page's own card off; it used to be set in the frame the glass was first drawn, and the browser presents the figure's canvas on its own beat, a frame or more later when the GPU
// is behind: the words showed over a card taken away and a glass not yet there. The card keeps its paper (data-gl-wait) until two animation frames have passed since the draw (glass-gl.js applyMark).
// The frosted glasses drawn inside the figure's canvas (round 2, 2.1, 31 Oct; glass-gl setHost): no canvas or context of
// their own and no copy of the figure; each picture the figure lays blurs once (prep) and draws each glass in its turn, the teaching
// card's shade in the low turn and the other cards in the high one, sharing one set of marks. A card that crosses what the page lays
// between the figure's canvas and it goes back to the browser's glass alone, in the same picture; when the figure's canvas cannot
// take them, every card does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
let clock = 0;
globalThis.performance = { now: () => clock };
const timers = [];
globalThis.setTimeout = (f) => { timers.push(f); return timers.length; };
globalThis.clearTimeout = () => {};
const observers = new Set();
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; } observe() { observers.add(this); } disconnect() { observers.delete(this); } takeRecords() { return []; } };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.CSS = { supports: () => true };
globalThis.matchMedia = () => ({ matches: false });
globalThis.WebGL2RenderingContext = class {};
globalThis.Path2D = class {};
let copies = 0, made = 0;
globalThis.createImageBitmap = () => { copies++; return Promise.resolve({ close() {} }); };
const n = { draw: 0, blur: 0, blit: 0 };
let progs = 0;
const fig = new Proxy({}, {
  get(_, k) {
    if (typeof k !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(k)) return k;
    if (k === 'isContextLost') return () => false;
    if (k === 'getProgramParameter') return () => true;
    if (k === 'createProgram') return () => ({ n: ++progs });
    if (k === 'useProgram') return () => {};
    return (...a) => {
      if (k === 'drawArrays') n.draw++;   // (the glass's one program since 12 Nov 2026 (the field): no blur passes)
      if (k === 'blitFramebuffer' && a[5] > a[7]) n.blur++;   // (a copy made: its last blit, turned over)
      if (k === 'blitFramebuffer') n.blit++;
      return k.startsWith('create') || k === 'getUniformLocation' ? {} : a.length ? undefined : undefined;
    };
  },
});
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const ctx2d = { fillStyle: '', setTransform() {}, fill() {} };
globalThis.document = {
  documentElement: { hasAttribute: () => false },
  addEventListener() {}, removeEventListener() {},
  createElement: () => { made++; return { width: 0, height: 0, getContext: () => ctx2d }; },
};
const el = (r) => ({ r, isConnected: true, parentElement: null, attrs: new Set(), getBoundingClientRect() { return this.r; },
  hasAttribute(k) { return this.attrs.has(k); }, setAttribute(k) { this.attrs.add(k); }, removeAttribute(k) { this.attrs.delete(k); } });
const shade = el(rect(0, 0, 300, 600)), data = el(rect(500, 100, 250, 300));
const cardLook = { display: 'block', visibility: 'visible', opacity: '1', filter: 'none', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px', borderBottomLeftRadius: '16px',
  getPropertyValue: (k) => (k === '--gl-glass' ? '1' : k === '--gl-tint' ? '#ffffff' : '') };
globalThis.getComputedStyle = (e) => (e === shade || e === data ? cardLook : { backgroundColor: '#101820', getPropertyValue: () => '', opacity: '1' });
const listen = () => ({ addEventListener() {}, removeEventListener() {} });
const root = { ...listen(), getAnimations: () => [] };
const wrap = { classList: { contains: () => true } };
const source = { ...listen(), width: 1600, height: 1200, getBoundingClientRect: () => rect(0, 0, 800, 600) };
let seq = 1, may = true, low = [], high = [], presents = 0;
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
// (The callouts' turn (2) between the cards' two: it records what it finds marked, as a picture laid in the page's order would show.)
const seen = [];
add({ order: 2, draw: () => seen.push([shade.attrs.has('data-gl'), data.attrs.has('data-gl')]) });
const present = () => { presents++; for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };

const { createGlassGL } = await import('../src/ui/glass-gl.js');
const flush = async () => { await new Promise((r) => setImmediate(r)); };
const frames = async (k) => { for (let i = 0; i < k; i++) { clock += 16; for (const cb of rafs.splice(0)) cb(clock); await flush(); } };

// (The whole region blurred in one go (the option full): the counts below are its two passes. By default each part of it a glass reads is
// blurred alone, two passes a part, to the same texels: tests/glass-parts.test.js.)
const G = createGlassGL(wrap, source, [], { cards: { find: () => [shade, data], watch: [root], before: { parentNode: null } }, version: () => seq, full: true });
const marks = (g) => [g.attrs.has('data-gl-wait'), g.attrs.has('data-gl')];

test('the first mark waits two animation frames after the glass is drawn: the card keeps its paper meanwhile, so the words always have a card under them', async () => {
  G.setHost({ gl: fig, canvas: source, add, now: present, active: () => may, order: { low: 1, high: 3 }, low: (g) => g === shade, over: (lv) => (lv === 'low' ? low : high) });
  await frames(1);
  assert.ok(n.draw >= 2, 'both cards drawn in the first frame');
  assert.deepEqual(marks(data), [true, false], 'drawn but not yet presented: the paper stays, the page\'s card is not taken off');
  assert.deepEqual(marks(shade), [true, false]);
  await frames(1);
  assert.deepEqual(marks(data), [true, false], 'one animation frame after the draw is not yet the presented one');
  await frames(1);
  assert.deepEqual(marks(data), [false, true], 'two: the page\'s card is taken off and the glass stands');
  assert.deepEqual(marks(shade), [false, true]);
});

test('a card given back before its glass was presented loses its paper and its mark together: never a card left bare, never one left marked', async () => {
  G.release();
  assert.deepEqual(marks(data), [false, false]);
  G.setHost({ gl: fig, canvas: source, add, now: present, active: () => may, order: { low: 1, high: 3 }, low: (g) => g === shade, over: (lv) => (lv === 'low' ? low : high) });
  await frames(1);
  assert.deepEqual(marks(data), [true, false]);
  G.release();
  assert.deepEqual(marks(data), [false, false], 'given back at once: the browser\'s glass');
  for (const f of timers.splice(0)) f();   // (the held mark's timer, still queued)
  assert.deepEqual(marks(data), [false, false], 'its queued timer sets nothing on a card given back');
});

test('a page that runs no animation frames (a hidden one) still takes the card off, by its timer', async () => {
  G.setHost({ gl: fig, canvas: source, add, now: present, active: () => may, order: { low: 1, high: 3 }, low: (g) => g === shade, over: (lv) => (lv === 'low' ? low : high) });
  await frames(1);
  assert.deepEqual(marks(data), [true, false]);
  rafs.length = 0;
  for (const f of timers.splice(0)) f();
  assert.deepEqual(marks(data), [false, true]);
});
