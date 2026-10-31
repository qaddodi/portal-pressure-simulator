// The hosted glass blurs the figure under it again at most every REBLUR_MS when only that figure has been drawn again (laptop-heat Q5, 31 Oct):
// a plain blood frame never counts as the figure drawn again (veins-gl pictured), so what is left are the frames that are not plain blood
// (the ascites ripple, a catheter, dye, an eased colour), each of which re-blurred the region behind the glasses. A pan, a zoom or a glide
// (the view key) or a card's region moving blurs at once; the last change is blurred when the time is up.
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
globalThis.createImageBitmap = () => Promise.resolve({ close() {} });
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

const { createGlassGL, REBLUR_MS } = await import('../src/ui/glass-gl.js');
const flush = async () => { await new Promise((r) => setImmediate(r)); };
const frame = () => { clock += 16; const q = rafs.splice(0); for (const cb of q) cb(clock); };
const frames = async (k) => { for (let i = 0; i < k; i++) { frame(); await flush(); } };

const G = createGlassGL(wrap, source, [layer], { version: () => seq, capture() {}, onFigure: (f) => { figure.add(f); return () => figure.delete(f); } });
// (The figure's picture laid: its top hooks (veins-gl top.add) blur, then draw the glass; the host's now() lays one at once.)
let presents = 0, may = true, between = [], viewKey = 'v0';
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
const present = () => { presents++; for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };

test('only the figure drawn again, over and over: one blur per REBLUR_MS, and the glass drawn from the blur it has in between', async () => {
  G.setHost({ gl: fig.gl, canvas: source, add, order: 2, now: present, active: () => may, over: () => between, view: () => viewKey });
  await frames(4);
  assert.equal(G.hosted, true);
  const b0 = fig.n.blur, d0 = fig.n.draw;
  // 60 pictures at 16 ms each, the figure drawn again every one (as under the ripple): about a second.
  for (let i = 0; i < 60; i++) { seq++; for (const f of figure) f(); present(); frame(); await flush(); }
  const blurs = (fig.n.blur - b0) / 2, draws = fig.n.draw - d0;
  assert.ok(blurs >= 15 && blurs <= 22, `about twenty a second, not sixty (${blurs})`);
  assert.ok(draws >= 60, `the glass still drawn into every picture (${draws})`);
});

const waiting = () => [...timers].filter(([, t]) => t.ms <= REBLUR_MS + 1);
test('the last change is blurred when the time is up, with no picture of the figure to carry it', async () => {
  await frames(2);
  clock += 100; seq++; for (const f of figure) f(); present();      // long enough after the last blur: taken at once
  const b = fig.n.blur;
  clock += 5; seq++; for (const f of figure) f(); present();        // the final change, 5 ms later: held
  assert.equal(fig.n.blur, b, 'held');
  assert.equal(waiting().length, 1, 'one look booked for when the time is up');
  const p = presents;
  clock += REBLUR_MS;
  for (const [id, t] of waiting()) { timers.delete(id); t.f(); }
  assert.equal(presents, p + 1, 'a picture laid for it');
  assert.equal(fig.n.blur - b, 2, 'blurred once more, the figure as it ended');
  assert.equal(waiting().length, 0, 'and nothing booked after');
});

test('a pan, a zoom or a glide (the view key) blurs at once, every picture', async () => {
  await frames(2);
  clock += 100; seq++; for (const f of figure) f(); present();
  const b = fig.n.blur;
  for (let i = 0; i < 6; i++) { clock += 16; viewKey = `v${i + 1}`; seq++; for (const f of figure) f(); present(); }
  assert.equal(fig.n.blur - b, 12, 'two passes a picture, none held');
});

test('a glass moving to another region blurs at once', async () => {
  await frames(2);
  clock += 100; seq++; for (const f of figure) f(); present();
  const b = fig.n.blur;
  at = rect(400, 300, 200, 80);
  [...observers][0].cb([]);
  frame(); await flush();
  clock += 5; seq++; for (const f of figure) f(); present();
  assert.ok(fig.n.blur - b >= 2, 'the new region taken without waiting');
  at = rect(160, 100, 200, 80);
});

test('a picture over the same figure keeps the blur, the view key or not', async () => {
  const b = fig.n.blur;
  present(); present();
  assert.equal(fig.n.blur, b);
});

test('let go: the waiting blur is cancelled', async () => {
  clock += 100; seq++; for (const f of figure) f(); present();
  clock += 5; seq++; for (const f of figure) f(); present();
  assert.equal(waiting().length, 1);
  G.dispose();
  assert.equal(waiting().length, 0, 'no timer left for it');
});
