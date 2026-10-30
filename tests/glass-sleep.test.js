// The GPU glass sleeps once settled (heat, 26 Oct, step 9): over a figure that stands still (paused) and callouts that do not
// move, it asks for no frames and draws nothing; the figure drawn again or a callout written wakes it; with no glass showing it
// clears once and stops; and let go, it leaves no frame, timer, observer, listener or GPU object behind.
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
const winListeners = new Map();
globalThis.addEventListener = (t, f) => winListeners.set(f, t);
globalThis.removeEventListener = (t, f) => winListeners.delete(f);
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.CSS = { supports: () => true };
globalThis.matchMedia = () => ({ matches: false });
globalThis.WebGL2RenderingContext = class {};
globalThis.Path2D = class {};
let copies = 0;
globalThis.createImageBitmap = () => { copies++; return Promise.resolve({ close() {} }); };

function fakeGL() {
  const n = { draw: 0, blur: 0, clear: 0, deleted: 0, lostCtx: 0 };
  let progs = 0, prog = null;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return 1;
      if (k === 'getExtension') return () => ({ loseContext() { n.lostCtx++; } });
      if (k === 'isContextLost') return () => false;
      if (k === 'getProgramParameter') return () => true;
      if (k === 'createProgram') return () => ({ n: ++progs });
      if (k === 'useProgram') return (p) => { prog = p; };
      return (...a) => {
        if (k === 'drawArrays') { if (prog?.n === 2) n.draw++; else n.blur++; }   // (the glass itself; the blur passes apart)
        if (k === 'clear') n.clear++;
        if (k.startsWith('delete')) n.deleted++;
        return k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined;
      };
    },
  });
  return { gl, n };
}
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const { gl, n } = fakeGL();
const listen = () => { const m = new Map(); return { m, addEventListener: (t, f) => m.set(f, t), removeEventListener: (t, f) => m.delete(f) }; };
const glassCanvas = { ...listen(), width: 0, height: 0, setAttribute() {}, getContext: () => gl, getBoundingClientRect: () => rect(0, 0, 800, 600), removed: false, remove() { this.removed = true; } };
const ctx2d = { fillStyle: '', setTransform() {}, fill() {} };
globalThis.document = {
  documentElement: { hasAttribute: () => false },
  createElement: () => (glassCanvas.made ? { width: 0, height: 0, getContext: () => ctx2d } : Object.assign(glassCanvas, { made: true })),
};
const css = new Map();
globalThis.getComputedStyle = (el) => css.get(el) || { backgroundColor: '#101820', getPropertyValue: () => '', boxShadow: 'none' };
const card = { getBoundingClientRect: () => rect(100, 100, 200, 80) };
const glass = { parentElement: card, isConnected: true, style: { width: '200px', height: '80px' }, attrs: new Set(),
  firstChild: { firstChild: { getAttribute: () => 'M0 0H200V80H0Z' } }, getBoundingClientRect: () => rect(100, 100, 200, 80),
  hasAttribute(k) { return this.attrs.has(k); }, setAttribute(k) { this.attrs.add(k); }, removeAttribute(k) { this.attrs.delete(k); } };
const look = { display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => '#ffffff' };
css.set(glass, look);
const layer = { ...listen(), list: [glass], getElementsByClassName() { return this.list; }, before() {} };
const wrap = { classList: { contains: () => true } };
let seq = 1;
const figure = new Set();
const source = { width: 1600, height: 1200, getBoundingClientRect: () => rect(0, 0, 800, 600) };

const { createGlassGL } = await import('../src/ui/glass-gl.js');
const flush = async () => { await new Promise((r) => setImmediate(r)); };
const frame = () => { clock += 16; const q = rafs.splice(0); for (const cb of q) cb(clock); };
const frames = async (k) => { for (let i = 0; i < k; i++) { frame(); await flush(); } };

const G = createGlassGL(wrap, source, [layer], { version: () => seq, capture() {}, onFigure: (f) => { figure.add(f); return () => figure.delete(f); } });

test('a paused figure under still callouts: the glass settles and asks for nothing more', async () => {
  assert.ok(G);
  await frames(4);   // (the first copy taken, blurred, drawn)
  assert.ok(n.draw > 0, 'drawn once its copy is in');
  await frames(3);
  assert.equal(rafs.length, 0, 'no frame asked for');
  const d = n.draw, c = n.clear, k = copies;
  await frames(5);
  assert.deepEqual([n.draw, n.clear, copies], [d, c, k], 'no draw, clear or copy while settled');
  // Its slow look (once a second) reads the page and draws nothing.
  const slow = [...timers.values()];
  assert.equal(slow.length, 1); assert.equal(slow[0].ms, 1000);
  timers.clear(); slow[0].f();
  await frames(3);
  assert.deepEqual([n.draw, copies], [d, k], 'the slow look drew nothing');
  assert.equal(rafs.length, 0);
});

test('the figure drawn again wakes it: a new copy, one draw, then asleep again', async () => {
  const d = n.draw, k = copies;
  seq++; for (const f of figure) f();
  await frames(4);
  assert.equal(copies, k + 1, 'one new copy of the figure');
  assert.equal(n.draw, d + 1, 'its glass drawn once');
  await frames(3);
  assert.equal(rafs.length, 0, 'asleep again');
});

test('while the blood moves (the figure drawn every frame), the glass follows it every frame', async () => {
  const k = copies, d = n.draw;
  for (let i = 0; i < 6; i++) { seq++; for (const f of figure) f(); frame(); await flush(); }
  assert.ok(copies - k >= 5, `a copy nearly every frame (${copies - k})`);
  assert.ok(n.draw - d >= 5, `drawn nearly every frame (${n.draw - d})`);
  await frames(4);
  assert.equal(rafs.length, 0, 'asleep once the figure stands still');
});

test('a callout written wakes it at once, and draws only when its glass changed', async () => {
  const d = n.draw;
  const mo = [...observers][0];
  card.getBoundingClientRect = () => rect(120, 100, 200, 80); glass.getBoundingClientRect = () => rect(120, 100, 200, 80);
  mo.cb([]); await flush();
  assert.equal(n.draw, d, 'no draw of its own after the write (review H4b)');
  frame(); await flush();
  assert.equal(n.draw, d + 1, 'drawn in the next frame, before it shows');
  await frames(4);
  assert.equal(n.draw, d + 2, 'and once more with the copy of its new place');
  mo.cb([]); await flush();
  await frames(4);
  assert.equal(n.draw, d + 2, 'the same picture is not drawn again');
  assert.equal(rafs.length, 0);
});

test('with no glass showing it clears once and stops', async () => {
  look.opacity = '0';
  const c = n.clear, d = n.draw;
  [...observers][0].cb([]); frame(); await flush();
  assert.equal(n.clear, c + 1, 'cleared once');
  await frames(4);
  assert.equal(n.clear, c + 1); assert.equal(n.draw, d);
  assert.equal(rafs.length, 0, 'no frames');
  // (The figure drawn again is not its business while nothing shows.)
  seq++; for (const f of figure) f();
  assert.equal(rafs.length, 0);
  look.opacity = '1';
});

test('let go, it leaves nothing running or held', async () => {
  [...observers][0].cb([]); await flush();
  assert.ok(rafs.length || timers.size, 'awake again before');
  G.dispose();
  assert.equal(observers.size, 0, 'observers disconnected');
  assert.equal(figure.size, 0, 'no longer told of the figure');
  assert.equal(layer.m.size, 0, 'listeners removed');
  assert.equal(winListeners.size, 0, 'resize listener removed');
  assert.equal(timers.size, 0, 'no timer');
  assert.ok(n.deleted >= 8, 'GPU objects deleted');
  assert.equal(n.lostCtx, 1, 'context given back');
  assert.ok(glassCanvas.removed, 'canvas removed');
  assert.equal(glass.attrs.size, 0, 'the browser\'s glass shows again');
  const d = n.draw;
  await frames(3);
  assert.equal(n.draw, d); assert.equal(rafs.length, 0);
});
