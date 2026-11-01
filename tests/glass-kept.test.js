// Settings › Figure performance › Callout glass kept (30 Oct): with it on, a frame where only the figure under a callout was drawn
// again (the blood) reads no box and no style; a write to a callout, a parent's change, a resize, the layout watch or a transition
// reads them again. Off, every frame reads them, as before.
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
const docListeners = new Map();
globalThis.document = {
  documentElement: { hasAttribute: () => false },
  addEventListener: (t, f) => docListeners.set(f, t), removeEventListener: (t, f) => docListeners.delete(f),
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


// (Every box and style read, counted.)
let reads = 0;
for (const o of [glassCanvas, card, glass, source]) { const f = o.getBoundingClientRect; o.getBoundingClientRect = () => { reads++; return f(); }; }
const gcs = globalThis.getComputedStyle;
globalThis.getComputedStyle = (el) => { reads++; return gcs(el); };
let keepOn = true, dueOn = false;
const G = createGlassGL(wrap, source, [layer], { version: () => seq, capture() {}, onFigure: (f) => { figure.add(f); return () => figure.delete(f); }, keep: () => keepOn, due: () => dueOn });
const blood = async (k) => { for (let i = 0; i < k; i++) { seq++; for (const f of figure) f(); frame(); await flush(); } };
const moOf = () => [...observers][0];

test('on: the blood moving under a still callout reads nothing, yet the glass follows the figure', async () => {
  await frames(4);
  assert.ok(n.draw > 0);
  await frames(3);
  const r = reads, k = copies, d = n.draw;
  await blood(6);
  assert.equal(reads, r, 'no box or style read');
  assert.ok(copies - k >= 5, 'a new copy of the figure nearly every frame');
  assert.ok(n.draw - d >= 5, 'and the glass drawn with it');
  assert.ok(resizers.size >= 1 && docListeners.size >= 2, 'its watchers are up (the scroll, and any transition or animation starting or ending on the page)');
});

test('on: a write to a callout reads it again, and its new place is drawn', async () => {
  const r = reads, d = n.draw;
  card.getBoundingClientRect = () => { reads++; return rect(140, 100, 200, 80); }; glass.getBoundingClientRect = () => { reads++; return rect(140, 100, 200, 80); };
  moOf().cb([]); frame(); await flush();
  assert.ok(reads > r, 'read again');
  assert.equal(n.draw, d + 1, 'drawn in the next frame');
  await frames(4);
  const r2 = reads;
  await blood(3);
  assert.equal(reads, r2, 'kept again after');
});

test('on: a parent\'s change, a resize, a scroll, the layout watch and a transition each read again', async () => {
  for (const poke of [
    () => { for (const o of observers) if (o !== moOf()) o.cb([]); },
    () => { for (const o of resizers) o.cb([]); },
    () => { for (const [f] of docListeners) f({ type: 'transitionend', target: card }); },
    () => { dueOn = true; },
    () => { for (const [f] of layer.m) f({ type: 'transitionend', target: card }); },   // (the layers' transition, animation and pointer events share one listener: an end reads where it ended)
  ]) {
    await frames(4); clock += 1000;
    const r = reads;
    poke();
    await blood(1);
    // (a read asked for inside a frame waits for the frame to end: it runs from a timer, never in the frame)
    for (const [id, t] of [...timers]) if (!t.ms) { timers.delete(id); t.f(); }
    dueOn = false;
    assert.ok(reads > r, String(poke));
  }
});

test('a glide written as a translation is followed with no read: the glass is drawn where the callout now is', async () => {
  await frames(4); clock += 1000; await frames(2);
  const r = reads, d = n.draw;
  let st = 'transform: translate(0px, 0px)';
  card.style = { transform: 'translate(0px, 0px)', translate: '', opacity: '' };
  card.getAttribute = () => st;
  // (written once, so the page is read with the translation in place: from then on it is the motion's)
  moOf().cb([]); await frames(2);
  const r1 = reads;
  for (let x = 4; x <= 40; x += 4) {
    const was = st;
    st = `transform: translate(${x}px, 0px)`; card.style.transform = `translate(${x}px, 0px)`;
    moOf().cb([{ type: 'attributes', attributeName: 'style', target: card, oldValue: was }]);
    seq++; for (const f of figure) f(); frame(); await flush();
  }
  assert.ok(r1 >= r);
  assert.equal(reads, r1, 'no box or style read for the whole glide');
  assert.ok(n.draw > d, 'drawn as it went');
});

test('let go, its watchers go with it', async () => {
  G.dispose();
  assert.equal(observers.size, 0); assert.equal(resizers.size, 0); assert.equal(docListeners.size, 0);
});
