import { stageSource } from './stage-src.js';
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
        if (k === 'drawArrays') { if (prog?.n % 2 === 0) n.draw++; else n.blur++; }   // (the glass's program is the second of each pair)
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
const docListeners = new Map();
globalThis.document = {
  documentElement: { hasAttribute: () => false },
  addEventListener: (t, f) => { if (!docListeners.has(t)) docListeners.set(t, new Set()); docListeners.get(t).add(f); },
  removeEventListener: (t, f) => docListeners.get(t)?.delete(f),
  createElement: () => (glassCanvas.made ? { width: 0, height: 0, getContext: () => ctx2d } : Object.assign(glassCanvas, { made: true })),
};
globalThis.getComputedStyle = (el) => (el === glass ? look : { backgroundColor: '#101820', getPropertyValue: () => '', boxShadow: 'none', opacity: '1' });
let at = rect(100, 100, 200, 80), reads = 0;
const card = { getBoundingClientRect: () => { reads++; return at; } };
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
let presents = 0;
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
const present = () => { presents++; for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
const blood = async (k) => { for (let i = 0; i < k; i++) { seq++; for (const f of figure) f(); present(); frame(); await flush(); } };


const fire = (t) => { for (const f of docListeners.get(t) || []) f({ type: t }); };
// What the glass drawn in the figure's canvas reads from the page (hostReads, 1 Nov 2026): read again only when something may have moved it,
// never on a frame where only the figure (the blood) changed; every way a glass can move still reads it.
test('hosted: a still callout over moving blood reads no box after it has settled', async () => {
  G.setHost({ gl: fig.gl, canvas: source, add, order: 2, now: present, active: () => true, over: () => [] });
  await frames(4);
  clock += 1000; await frames(4);   // (past the 0.6 s after the last change)
  const r = reads;
  await blood(6);
  for (let i = 0; i < 6; i++) { G.redraw(); frame(); await flush(); }
  assert.equal(reads, r, 'no box read');
});

test('hosted: a write to the callout reads it again and lays its new place', async () => {
  const r = reads, p = presents;
  at = rect(180, 100, 200, 80);
  for (const o of observers) o.cb([]);
  frame(); await flush();
  assert.ok(reads > r, 'read again');
  assert.ok(presents > p, 'laid at once');
});

test('hosted: a CSS transition anywhere on the page is followed with no read while it runs, read once where it ended, then still', async () => {
  clock += 1000; await frames(3);
  let r = reads;
  fire('transitionrun');
  await frames(3);
  assert.equal(reads, r, 'no read while it runs');
  fire('transitionend');
  assert.equal(reads, r, 'not read in the event itself (2 Nov 2026: in the next frame\'s read phase, frame.js readFrame)');
  await frames(1);
  assert.ok(reads > r, 'read once where it ended, first thing in the next frame');
  clock += 700; await frames(3);
  r = reads;
  G.redraw(); await frames(3);
  assert.equal(reads, r, 'still again afterwards');
});

test('hosted: a font coming in, a resize of a glass, and the slow look while asleep each read again', async () => {
  for (const [kind, poke] of [['resize', () => { for (const o of resizers) o.cb([]); }], ['window resize', () => { for (const [f, t] of winListeners) if (t === 'resize') f(); }], ['slow look', () => { for (const [id, t] of [...timers]) if (t.ms === 1000) { timers.delete(id); t.f(); } }]]) {
    clock += 1000; await frames(3);
    const r = reads;
    poke();
    await frames(2);
    assert.ok(reads > r, kind);
  }
});

test('let go: its page-wide listeners go with it', () => {
  G.dispose();
  for (const [t, s] of docListeners) assert.equal(s.size, 0, t);
});

test('what lies between the figure and a glass (stage.js frostOver) is kept until something there may have moved', async () => {
  const { readFileSync } = await import('node:fs');
  const st = stageSource();
  const f = st.slice(st.indexOf('  function frostOver(level) {'), st.indexOf('  function frostOverRead(level) {'));
  assert.doesNotMatch(st, /FROST_KEEP|glassreads=/);
  assert.doesNotMatch(f, /return frostOverRead\(level\);/);
  assert.match(f, /if \(k && k\.dirty === frostDirty && k\.vk === vk && k\.lost === lost && k\.pres === pres && k\.boxes === boxes\) return k\.out;/);
  assert.match(f, /veins\?\.viewKey/);
  assert.doesNotMatch(f, /getAnimations|frostUntil/);
  assert.doesNotMatch(st, /document\.addEventListener\(t, frostTouch/);
  assert.match(st, /const frostListen = \(el\) => \{ for \(const t of FROST_EVS\) el\.addEventListener\(t, frostTouch, true\); \};/);
  assert.match(st, /for \(let i = 0; i < 4; i\+\+\) if \(FROST_EL\[i\]\) frostMo\.observe\(FROST_EL\[i\], FROST_OBS_ALL\);/);
});
