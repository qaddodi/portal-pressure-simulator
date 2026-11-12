// The callouts' glass drawn into the figure's canvas (recs A1, glass; glass-gl setHost): while the host says it may, the glass takes no
// copy of the canvas and its own canvas stands aside; each picture the figure lays draws the glass from that picture, blurred again only
// when the figure under it was drawn again. When the host says no, or a glass crosses what lies between, it goes back to the browser's
// glass at once (no canvas or copy of its own since G5, 4 Nov 2026), never a frame with both glasses or none.
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
let presents = 0, may = true, between = [];
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
const present = () => { presents++; for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
const blood = async (k) => { for (let i = 0; i < k; i++) { seq++; for (const f of figure) f(); present(); frame(); await flush(); } };

test('without a host, the glass is the browser\'s and not hosted', async () => {
  await frames(4);
  assert.equal(G.hosted, false);
});

test('with one, the next frame draws it into the figure\'s picture, from that picture: from that picture', async () => {
  G.setHost({ gl: fig.gl, canvas: source, add, order: 2, now: present, active: () => may, over: () => between });
  assert.equal(tops.length, 1, 'one turn in the figure\'s picture');
  const p = presents;
  await frames(2);
  assert.equal(G.hosted, true);
  assert.ok(presents > p, 'the picture laid again at once, with the glass');
  assert.ok(fig.n.blit >= 2 && fig.n.blur === 1 && fig.n.draw === 1, `taken from the picture, averaged, drawn (${fig.n.blit}, ${fig.n.blur}, ${fig.n.draw})`);
  assert.ok(glass.attrs.has('data-gl'), 'still marked: the browser\'s blur never shows with it');
  await frames(4);
  const first = fig.n.calls.find((c) => c[0] === 'blitFramebuffer');
  // (Shared copy, blur-share.js, on the whole canvas's grid of 128 device px a texel (the field's 64 CSS px, SMOOTH, since 12 Nov 2026): the part
  // made is the callout's box (104..696 × 104..456 device px) grown by two texels and held in the copy: columns 0..7, rows 0..5 from its top,
  // which in the canvas's own rows (y up, the copy's top at 1152) is 512 up to 1152.)
  assert.deepEqual(first.slice(1, 5), [0, 1152 - 5 * 128, 7 * 128, 1152], 'the region around the callout, in the canvas\'s own rows');
  const flip = fig.n.calls.filter((c) => c[0] === 'blitFramebuffer').at(-1);
  assert.ok(flip[6] > flip[8], 'turned over on its last step');
});

test('the blood moving under it: each picture blurs again, with no frame of the glass\'s own', async () => {
  await frames(4);
  const b = fig.n.blur, d = fig.n.draw, r = rafs.length;
  await blood(5);
  assert.equal(fig.n.blur - b, 5, 'a copy a picture');
  assert.equal(fig.n.draw - d, 5);
  assert.equal(r, 0); assert.equal(rafs.length, 0, 'asleep: the figure does not wake it');
});

test('a picture laid again over the same figure keeps the blur, and still draws the glass', async () => {
  const b = fig.n.blur, d = fig.n.draw;
  present(); present();
  assert.equal(fig.n.blur, b);
  assert.equal(fig.n.draw, d + 2);
});

test('a callout moved: read in the glass\'s frame and laid at once at its new place', async () => {
  const p = presents;
  at = rect(160, 100, 200, 80);
  [...observers][0].cb([]);
  frame(); await flush();
  assert.equal(presents, p + 1);
});

test('the host says no: that picture has no glass, the browser\'s shows at once, and it stays there', async () => {
  may = false;
  const d = fig.n.draw;
  present();
  assert.equal(fig.n.draw, d, 'not drawn into the picture');
  assert.equal(glass.attrs.has('data-gl'), false, 'given back to the browser\'s glass in the same task');
  assert.equal(G.hosted, false);
  await frames(3);
  assert.equal(G.hosted, false);
  assert.equal(glass.attrs.has('data-gl'), false, 'no glass of its own to take over');
});

test('let go: its objects in the figure\'s context are deleted, and the picture laid once more without it', async () => {
  may = true;
  G.setHost({ gl: fig.gl, canvas: source, add, order: 2, now: present, active: () => may, over: () => between });
  await frames(3);
  assert.equal(G.hosted, true);
  const del = fig.n.deleted, p = presents;
  G.dispose();
  assert.ok(fig.n.deleted > del);
  assert.equal(presents, p + 1);
  assert.equal(tops.length, 0, 'its turn taken out');
  const d = fig.n.draw;
  present();
  assert.equal(fig.n.draw, d);
});
