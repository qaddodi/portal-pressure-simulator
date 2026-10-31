// The frosted glasses drawn inside the figure's canvas (round 2, 2.1, 31 Oct; glass-gl copy: false, setHost): no canvas or context of
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
globalThis.setTimeout = () => 0;
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
let prog = null, progs = 0;
const fig = new Proxy({}, {
  get(_, k) {
    if (typeof k !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(k)) return k;
    if (k === 'isContextLost') return () => false;
    if (k === 'getProgramParameter') return () => true;
    if (k === 'createProgram') return () => ({ n: ++progs });
    if (k === 'useProgram') return (p) => { prog = p; };
    return (...a) => {
      if (k === 'drawArrays') { if (prog?.n % 2 === 0) n.draw++; else n.blur++; }
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

const G = createGlassGL(wrap, source, [], { cards: { find: () => [shade, data], watch: [root], before: { parentNode: null } }, version: () => seq, copy: false });

test('with no copy of its own it makes no canvas and no context, and without a host every card keeps the browser\'s glass', async () => {
  assert.ok(G);
  assert.equal(G.canvas, null);
  assert.equal(made, 1, 'only the colour parser\'s 2D canvas');
  await frames(3);
  assert.equal(shade.attrs.has('data-gl') || data.attrs.has('data-gl'), false);
  assert.equal(n.draw + n.blur, 0);
});

test('hosted: two turns around the callouts\', one blur taken before any glass is drawn, both cards marked', async () => {
  G.setHost({ gl: fig, canvas: source, add, now: present, active: () => may, order: { low: 1, high: 3 }, low: (g) => g === shade, over: (lv) => (lv === 'low' ? low : high) });
  assert.deepEqual(tops.map((t) => t.order), [1, 2, 3]);
  assert.ok(tops[0].prep && !tops[2].prep, 'the blur once, in the first turn');
  await frames(2);
  assert.equal(G.hosted, true);
  assert.equal(n.blur, 2, 'blurred in two passes');
  assert.equal(n.draw, 2, 'each card drawn once');
  assert.ok(shade.attrs.has('data-gl') && data.attrs.has('data-gl'));
  assert.deepEqual(seen.at(-1), [true, false], 'the shade is drawn before the callouts\' turn, the data card after it');
  assert.equal(copies, 0);
});

test('the blood moving under it: the blur taken again from each new picture; a picture of the same figure keeps it', async () => {
  const b = n.blur, d = n.draw;
  seq++; present();
  assert.equal(n.blur - b, 2); assert.equal(n.draw - d, 2);
  present();
  assert.equal(n.blur - b, 2, 'kept'); assert.equal(n.draw - d, 4);
});

test('a card crossing what lies between goes back to the browser\'s glass alone, in the same picture', async () => {
  high = [rect(600, 200, 20, 20)];
  [...observers][0].cb([]);
  const p = presents;
  await frames(1);
  assert.equal(presents, p + 1, 'laid again at once');
  assert.equal(data.attrs.has('data-gl'), false, 'the data card: the browser\'s');
  assert.equal(shade.attrs.has('data-gl'), true, 'the shade: still the figure\'s');
  assert.equal(G.hosted, true);
  high = [];
  [...observers][0].cb([]);
  await frames(1);
  assert.equal(data.attrs.has('data-gl'), true, 'clear again: drawn in the figure\'s canvas');
});

test('the figure\'s canvas cannot take them (a fade, a dive): every card back to the browser\'s glass in that picture', async () => {
  may = false;
  present();
  assert.equal(G.hosted, false);
  assert.equal(shade.attrs.has('data-gl') || data.attrs.has('data-gl'), false);
  const d = n.draw;
  await frames(3);
  assert.equal(n.draw, d, 'nothing drawn meanwhile');
  assert.equal(copies, 0, 'and no copy taken');
  may = true;
  [...observers][0].cb([]);
  await frames(1);
  assert.equal(G.hosted, true);
  assert.ok(shade.attrs.has('data-gl') && data.attrs.has('data-gl'));
});

test('release(): given back at once, before the stage copies its picture', () => {
  G.release();
  assert.equal(G.hosted, false);
  assert.equal(shade.attrs.has('data-gl') || data.attrs.has('data-gl'), false);
  const d = n.draw;
  present();
  assert.equal(n.draw, d, 'the copy\'s picture has no glass');
});

test('let go: both turns taken out of the figure\'s picture', () => {
  G.dispose();
  assert.deepEqual(tops.map((t) => t.order), [2]);
});

test('one edge softness for the vessels and the organ painter (V3 b): one device pixel, the same pixels as before', async () => {
  const { readFileSync } = await import('node:fs');
  const { EDGE_PX, EDGE_GLSL } = await import('../src/ui/edge.js');
  assert.equal(EDGE_PX, 1);
  assert.equal(EDGE_GLSL, '1.0000');
  const VG = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8'), SG = readFileSync(new URL('../src/ui/shape-gl.js', import.meta.url), 'utf8');
  assert.match(VG, /float aa = px \* \$\{EDGE_GLSL\};/);
  assert.match(SG, /float cover\(float d0, vec2 n\) \{\n\s+float d = d0 \/ \$\{EDGE_GLSL\};/);
});
