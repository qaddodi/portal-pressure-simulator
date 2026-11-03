// The glass reports what its last drawn frame put on the GPU (glass-gl drawn(), read by the motion gate): which glass, where in page CSS px
// with its motion applied, and its opacity, counted per drawn frame. Same fake page and figure as glass-host.test.js.
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
  let progs = 0, prog = null;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'getExtension') return () => ({ loseContext() {} });
      if (k === 'isContextLost') return () => false;
      if (k === 'getProgramParameter') return () => true;
      if (k === 'createProgram') return () => ({ n: ++progs, name });
      if (k === 'useProgram') return (p) => { prog = p; };
      return (...a) => {
        n.calls.push([k, ...a]);
        if (k === 'drawArrays' && a[0] !== 'TRIANGLES') { if (prog?.n % 2 === 0) n.draw++; else n.blur++; }   // (the glass's program is the second of each pair; a mask's fill, TRIANGLES, apart)
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
globalThis.getComputedStyle = (el) => (el === glass ? look : { backgroundColor: '#101820', getPropertyValue: () => '', boxShadow: 'none', opacity: '1' });
let at = rect(100, 100, 200, 80);
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

const { createGlassGL } = await import('../src/ui/glass-gl.js');
const flush = async () => { await new Promise((r) => setImmediate(r)); };
const frame = () => { clock += 16; const q = rafs.splice(0); for (const cb of q) cb(clock); };
const frames = async (k) => { for (let i = 0; i < k; i++) { frame(); await flush(); } };

const G = createGlassGL(wrap, source, [layer], { version: () => seq, capture() {}, onFigure: (f) => { figure.add(f); return () => figure.delete(f); } });
// (The figure's picture laid: its top hooks (veins-gl top.add) blur, then draw the glass; the host's now() lays one at once.)
let may = true, between = [];
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };

test('before any frame is drawn: sequence 0, no panes', () => {
  const d = G.drawn();
  assert.equal(d.seq, 0); assert.deepEqual(d.panes, []);
});

test('hosted, a drawn frame is reported with the glass element, its place and its opacity', async () => {
  G.setHost({ gl: fig.gl, canvas: source, add, order: 2, now: present, active: () => may, over: () => between });
  await frames(3);
  const d = G.drawn();
  assert.ok(d.seq > 0 && d.t > 0);
  assert.equal(d.panes.length, 1);
  const p = d.panes[0];
  assert.equal(p.el, glass);
  assert.deepEqual([p.x, p.y, p.w, p.h, p.a], [100, 100, 200, 80, 1]);
});

test('a frame drawn again counts up; a card moved is reported where it was drawn', async () => {
  const before = G.drawn().seq;
  at = rect(160, 100, 200, 80);
  [...observers][0].cb([]);
  await frames(2);
  const d = G.drawn();
  assert.ok(d.seq > before);
  assert.equal(d.panes[0].x, 160);
  assert.notEqual(G.drawn().panes, d.panes, 'built on the call: the caller may keep it');
});

test('a faded glass reports its opacity', async () => {
  look.opacity = '0.5';
  [...observers][0].cb([]);
  await frames(2);
  assert.equal(G.drawn().panes[0].a, 0.5);
  look.opacity = '1';
});

test('a frame with no glass drawn is reported empty, not as the old picture', async () => {
  layer.list = [];
  [...observers][0].cb([]);
  await frames(3);
  const d = G.drawn();
  assert.deepEqual(d.panes, []);
  layer.list = [glass];
});
