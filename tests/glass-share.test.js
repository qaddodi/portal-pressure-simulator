// One blur per look per picture (blur-share.js, review pass item 7, 2 Nov 2026): two glasses of the same look drawn into the figure's
// canvas share one copy, one pair of passes and one set of targets per picture; the targets are sized by the canvas, so a glass moving
// never reallocates them; a picture whose glasses and figure are unchanged is not blurred again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
let clock = 0;
globalThis.performance = { now: () => clock };
const timers = new Map();
let tid = 0;
globalThis.setTimeout = (f, ms) => { timers.set(++tid, { f, ms }); return tid; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const observers = new Set();
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; } observe() { observers.add(this); } disconnect() { observers.delete(this); } takeRecords() { return []; } };
const resizers = new Set();
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { resizers.add(this); } disconnect() { resizers.delete(this); } };
const winListeners = new Map();
globalThis.addEventListener = (t, f) => winListeners.set(f, t);
globalThis.removeEventListener = (t, f) => winListeners.delete(f);
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.CSS = { supports: () => true };
globalThis.matchMedia = () => ({ matches: false });
globalThis.WebGL2RenderingContext = class {};
globalThis.Path2D = class {};
globalThis.createImageBitmap = () => { return Promise.resolve({ close() {} }); };
function fakeGL(name) {
  const n = { draw: 0, blur: 0, blit: 0, clear: 0, deleted: 0, calls: [] };
  let progs = 0;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'getExtension') return () => ({ loseContext() {} });
      if (k === 'isContextLost') return () => false;
      if (k === 'getProgramParameter') return () => true;
      if (k === 'createProgram') return () => ({ n: ++progs, name });
      if (k === 'useProgram') return () => {};
      return (...a) => {
        n.calls.push([k, ...a]);
        if (k === 'drawArrays' && a[0] !== 'TRIANGLES') n.draw++;   // (the glass's one program since 12 Nov 2026 (the field): no blur passes; a mask's fill, TRIANGLES, apart)
        if (k === 'blitFramebuffer' && a[5] > a[7]) n.blur++;   // (a copy made: its last blit, turned over (the copy's top row the region's top), one a part)
        if (k === 'blitFramebuffer') n.blit++;
        if (k === 'clear') n.clear++;
        if (k.startsWith('delete')) n.deleted++;
        return k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined;
      };
    },
  });
  return { gl, n };
}
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const own = fakeGL('own'), fig = fakeGL('figure');
const listen = () => { const m = new Map(); return { m, addEventListener: (t, f) => m.set(f, t), removeEventListener: (t, f) => m.delete(f) }; };
const glassCanvas = { ...listen(), width: 0, height: 0, style: { visibility: '' }, setAttribute() {}, getContext: () => own.gl, getBoundingClientRect: () => rect(0, 0, 800, 600), removed: false, remove() { this.removed = true; } };
const ctx2d = { fillStyle: '', setTransform() {}, fill() {} };
globalThis.document = {
  documentElement: { hasAttribute: () => false },
  addEventListener() {}, removeEventListener() {},
  createElement: () => (glassCanvas.made ? { width: 0, height: 0, getContext: () => ctx2d } : Object.assign(glassCanvas, { made: true })),
};
globalThis.getComputedStyle = (el) => (el === glass || el === glass2 ? look : { backgroundColor: '#101820', getPropertyValue: () => '', boxShadow: 'none', opacity: '1' });
let at = rect(100, 100, 200, 80), glass2 = null;
const card = { getBoundingClientRect: () => at };
const glass = { parentElement: card, isConnected: true, style: { width: '200px', height: '80px' }, attrs: new Set(),
  firstChild: { firstChild: { getAttribute: () => 'M0 0H200V80H0Z' } }, getBoundingClientRect: () => at,
  hasAttribute(k) { return this.attrs.has(k); }, setAttribute(k) { this.attrs.add(k); }, removeAttribute(k) { this.attrs.delete(k); } };
const look = { display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => '#ffffff' };
const layer = { ...listen(), list: [glass], getElementsByClassName() { return this.list; }, before() {} };
const wrap = { classList: { contains: () => true } };
let seq = 1;
const figure = new Set();
const source = { ...listen(), width: 1600, height: 1200, getBoundingClientRect: () => rect(0, 0, 800, 600) };

const { createGlassGL, shareStats } = await import('../src/ui/glass-gl.js');
const flush = async () => { await new Promise((r) => setImmediate(r)); };
const frame = () => { clock += 16; const q = rafs.splice(0); for (const cb of q) cb(clock); };
const frames = async (k) => { for (let i = 0; i < k; i++) { frame(); await flush(); } };


// (A second glass of the same look, on a layer of its own; no canvas of its own, as the cards'.)
let at2 = rect(180, 150, 160, 70);   // (near the first: their parts are one)
const card2 = { getBoundingClientRect: () => at2 };
glass2 = { ...glass, parentElement: card2, attrs: new Set(), getBoundingClientRect: () => at2 };
const layer2 = { ...listen(), list: [glass2], getElementsByClassName() { return this.list; }, before() {} };
const A = createGlassGL(wrap, source, [layer], { version: () => seq, onFigure: (f) => { figure.add(f); return () => figure.delete(f); } });
const B = createGlassGL(wrap, source, [layer2], { version: () => seq, onFigure: (f) => { figure.add(f); return () => figure.delete(f); } });
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
const blood = async (k) => { for (let i = 0; i < k; i++) { seq++; present(); frame(); await flush(); } };
const texAllocs = () => fig.n.calls.filter((c) => c[0] === 'texImage2D').length;

test('two glasses of one look: one blur a picture, not one each', async () => {
  for (const g of [A, B]) g.setHost({ gl: fig.gl, canvas: source, add, order: 2, now: present, active: () => true, over: () => [] });
  await frames(4);
  assert.equal(A.hosted && B.hosted, true);
  const b = fig.n.blur, d = fig.n.draw;
  await blood(5);
  assert.equal(fig.n.blur - b, 5, 'one copy a picture, for both glasses together');
  assert.equal(fig.n.draw - d, 10, 'each glass drawn on each picture');
  const s = Object.values(shareStats(fig.gl));
  assert.equal(s.length, 1, 'one share for the look');
  assert.ok(s[0].blurs >= 5);
});

test('the same picture with nothing moved is not blurred again', async () => {
  const b = fig.n.blur, d = fig.n.draw;
  present(); present();
  assert.equal(fig.n.blur, b, 'kept');
  assert.equal(fig.n.draw - d, 4, 'still drawn');
});

test('a glass sliding across the figure reallocates no blur target', async () => {
  await blood(1);
  const t0 = texAllocs(), a0 = Object.values(shareStats(fig.gl))[0].allocs;
  for (let i = 0; i < 20; i++) { at2 = rect(500 - i * 13, 300 + i * 7, 160 + i, 70); for (const o of observers) o.cb([]); await blood(1); }
  assert.equal(Object.values(shareStats(fig.gl))[0].allocs, a0, 'the shared targets kept their size');
  assert.equal(texAllocs(), t0, 'no texImage2D while it slid');
});
