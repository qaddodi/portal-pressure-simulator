// Writes inside a card do not keep the glass awake (13 Nov 2026, the ?lap on Mohammad's iPhone: glass-cards called back 60 times a second at rest).
// A tile's bar or mark written with a translation (the shown state, 30 to 40 times a second), or a word's fade, on an element INSIDE a glass cannot
// move the glass or change its box, so the glass loop sleeps through it; the same write on the glass itself (a card sliding) still wakes it.
// A node replay through the real glass-gl.js and frame.js, frame by frame (the page faked: boxes, inline styles, classes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
const rafs = [];
let clock = 1000;
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
const timers = new Map(); let tid = 0;
globalThis.setTimeout = (f, ms = 0) => { timers.set(++tid, { f, at: clock + (ms || 0) }); return tid; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
const runTimers = (upTo = clock) => { for (;;) { let best = null; for (const [id, t] of timers) if (t.at <= upTo && (!best || t.at < best[1].at)) best = [id, t]; if (!best) return; timers.delete(best[0]); best[1].f(); } };
// MutationObserver: records queued by the fake elements' writes, delivered in a microtask, or taken by takeRecords.
const MOs = new Set();
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.q = []; this.roots = []; this.posted = false; } observe(n, o = {}) { this.roots.push({ n, o }); MOs.add(this); } disconnect() { MOs.delete(this); } takeRecords() { const q = this.q; this.q = []; return q; } };
// (As the browser's: a root sees its own attribute writes, its descendants' only with `subtree`, and only the attributes in `attributeFilter`.)
const record = (target, r) => { for (const o of MOs) { let hit = false; for (const { n, o: opt } of o.roots) { if (opt.attributeFilter && r.attributeName && !opt.attributeFilter.includes(r.attributeName)) continue; for (let e = target; e; e = e.parentElement) if (e === n && (e === target || opt.subtree)) { hit = true; break; } if (hit) break; } if (!hit) continue; o.q.push({ target, ...r }); if (!o.posted) { o.posted = true; queueMicrotask(() => { o.posted = false; const q = o.takeRecords(); if (q.length) o.cb(q); }); } } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.devicePixelRatio = 2; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
globalThis.CSS = { supports: () => true }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.WebGL2RenderingContext = class {}; globalThis.Path2D = class {};
globalThis.createImageBitmap = () => Promise.resolve({ close() {} });
globalThis.document = { documentElement: { hasAttribute: () => false, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {}, timeline: { get currentTime() { return clock; } }, hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

let progs = 0;
const fig = new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z0-9_]+$/.test(k)) return k;
  if (k === 'isContextLost') return () => false;
  if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
  if (k === 'createProgram') return () => ({ n: ++progs });
  return (...a) => (k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined);
} });
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t });

// A card: its rest box, inline style (transform / opacity / transition, with priorities), classes and attributes.
function card(name, r) {
  const props = new Map();
  const text = () => [...props].map(([k, p]) => `${k}: ${p.v}${p.imp ? ' !important' : ''};`).join(' ');
  const e = {
    name, rest: r, isConnected: true, parentElement: null, attrs: new Map(), cls: new Set(), nodeType: 1,
    getAnimations: () => [], animate: null,
    style: {
      setProperty(k, v, imp) { const was = text(); props.set(k, { v: String(v), imp: imp === 'important' }); if (text() !== was) record(e, { type: 'attributes', attributeName: 'style', oldValue: was }); },
      removeProperty(k) { const was = text(); props.delete(k); if (text() !== was) record(e, { type: 'attributes', attributeName: 'style', oldValue: was }); },
      getPropertyValue: (k) => props.get(k)?.v ?? '', getPropertyPriority: (k) => (props.get(k)?.imp ? 'important' : ''),
      get transform() { return props.get('transform')?.v ?? ''; }, get opacity() { return props.get('opacity')?.v ?? ''; }, get translate() { return ''; }, get transition() { return props.get('transition')?.v ?? ''; },
    },
    classList: { add: (c) => { if (!e.cls.has(c)) { e.cls.add(c); record(e, { type: 'attributes', attributeName: 'class' }); } }, remove: (c) => { if (e.cls.delete(c)) record(e, { type: 'attributes', attributeName: 'class' }); }, contains: (c) => e.cls.has(c), toggle: (c, on) => (on ?? !e.cls.has(c)) ? e.classList.add(c) : e.classList.remove(c) },
    getAttribute: (k) => (k === 'style' ? text() : e.attrs.get(k) ?? null), hasAttribute: (k) => e.attrs.has(k), setAttribute: (k, v = '') => e.attrs.set(k, String(v)), removeAttribute: (k) => e.attrs.delete(k),
    get dataset() { return {}; },
    x: () => { const m = /translateX\((-?[\d.]+)px\)/.exec(props.get('transform')?.v || ''); return m ? +m[1] : 0; },
    o: () => { const p = props.get('opacity'); if (p && (p.imp || !e.cls.has('pz-leave'))) return +p.v; return e.cls.has('pz-leave') ? 0 : 1; },
    getBoundingClientRect() { const x = e.x(); return rect(e.rest.left + x, e.rest.top, e.rest.width, e.rest.height); },
    contains: (n) => n === e,
  };
  return e;
}
const stage = { nodeType: 1, parentElement: null, isConnected: true, getAnimations: () => [], style: {}, contains: () => false, addEventListener() {}, removeEventListener() {} };
const shade = card('shade', rect(40, 300, 360, 260)), data = card('data', rect(820, 200, 300, 420));
shade.parentElement = stage; data.parentElement = stage;
const cardLook = (e) => ({ display: 'block', visibility: 'visible', get opacity() { return String(e.o()); }, filter: 'none', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px', borderBottomLeftRadius: '16px',
  getPropertyValue: (k) => (k === '--gl-glass' ? '1' : k === '--gl-tint' ? 'rgba(250, 250, 250, 0.66)' : '') });
globalThis.getComputedStyle = (e) => (e === shade || e === data ? cardLook(e) : { backgroundColor: 'rgba(0, 0, 0, 0)', display: 'block', visibility: 'visible', getPropertyValue: (k) => (k === '--stage-bg' ? '#101820' : ''), opacity: '1', boxShadow: 'none' });
const source = { addEventListener() {}, removeEventListener() {}, width: 2400, height: 1600, getBoundingClientRect: () => rect(0, 0, 1200, 800), getAnimations: () => [], style: {}, parentElement: null, nodeType: 1 };

const F = await import('../src/ui/frame.js');
const { createGlassGL } = await import('../src/ui/glass-gl.js');

// The host: the figure lays a picture every frame (blood moving) in the frame's finals; a glass's ask (now) folds into the same frame's end.
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
let seq = 1, pend = false;
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
const figFrame = F.frameFor('figure');
const figLoop = () => { seq++; present(); figFrame(figLoop); };
F.onFrameFinal(() => { if (pend) { pend = false; present(); } });
const G = createGlassGL(stage, source, [], { cards: { find: () => [shade, data], watch: [stage], before: { parentNode: stage }, low: shade }, version: () => seq });
G.setHost({ gl: fig, canvas: source, add, now: () => { if (F.framePhase()) pend = true; else present(); }, active: () => true, order: { low: 1, high: 3 }, low: (g) => g === shade, over: () => [], view: () => null });
stage.contains = () => false;

const settle = () => new Promise((r) => setImmediate(r));
const log = [];
let fno = 0;
let stallAt = -1, stallMs = 0;
async function frame(note = '') {
  runTimers(clock);
  await settle();
  clock += fno === stallAt ? stallMs : 16.7;
  runTimers(clock - 0.1);
  await settle();
  const q = rafs.splice(0);
  for (const cb of q) cb(clock);
  await settle();   // (microtasks after the frame: the observers)
  // What this frame shows.
  const d = G.drawn();
  for (const el of [shade, data]) {
    const o = el.o(), x = el.x(), p = d.panes.find((q) => q.el === el);
    const st = el.attrs.has('data-gl') ? 'gl' : el.attrs.has('data-gl-wait') ? 'bare' : 'solid';
    let bad = '';
    if (o <= 0.001 && p && p.a > 0.02) bad = `GLASS ALONE ${p.a.toFixed(3)}`;
    if (o > 0.001) {
      if (st === 'solid') bad = 'SOLID';
      else if (st === 'bare' || !p) bad = 'NO GLASS';
      else if (Math.abs(p.a - o) > 0.02) bad = `ALPHA glass ${p.a.toFixed(3)} card ${o.toFixed(3)}`;
      else if (Math.abs(p.x - (el.rest.left + x)) > 0.5 || Math.abs(p.w - el.rest.width) > 0.5 || Math.abs(p.h - el.rest.height) > 0.5) bad = `BOX glass ${p.x.toFixed(1)},${p.w}x${p.h} card ${(el.rest.left + x).toFixed(1)},${el.rest.width}x${el.rest.height}`;
    }
    log.push({ f: fno, el: el.name, o: +o.toFixed(3), x: +x.toFixed(1), st, ga: p ? +p.a.toFixed(3) : null, gx: p ? +p.x.toFixed(1) : null, seq: d.seq, sty: el.getAttribute('style'), bad, note });
  }
  fno++;
}
figLoop();
for (let i = 0; i < 20; i++) await frame('rest');


// A bar inside the shade card (a descendant; not a glass).
const bar = card('bar', rect(60, 320, 100, 6));
bar.parentElement = shade; shade.contains = (n) => n === shade || n === bar;
const asks = () => F.perf().totals.asks['glass-cards'] || 0;
const writeBar = (i) => bar.style.setProperty('transform', `translateX(${i % 7}px)`);

test('a translation written on an element inside a card, every frame, does not keep the glass loop asking for frames', async () => {
  for (let i = 0; i < 30; i++) await frame('quiet');
  const q0 = asks();
  for (let i = 0; i < 20; i++) await frame('quiet');
  assert.ok(asks() - q0 <= 4, 'the glass sleeps when nothing is written (its look once a second)');
  const a0 = asks(); 
  for (let i = 0; i < 40; i++) { writeBar(i); await frame('bar'); }
  const spent = asks() - a0;
  assert.ok(spent <= 6, `the glass loop was asked ${spent} times in 40 frames of writes inside a card (it sleeps through them)`);
});

test('the same writes on the card itself (it slides) still wake the glass every frame', async () => {
  for (let i = 0; i < 8; i++) await frame('quiet');
  const a0 = asks();
  for (let i = 0; i < 40; i++) { shade.style.setProperty('transform', `translateX(${-(i % 9) * 5}px)`); await frame('slide'); }
  const spent = asks() - a0;
  assert.ok(spent >= 30, `a sliding card keeps its glass looking every frame (${spent} of 40)`);
  const last = log.filter((r) => r.el === 'shade').at(-1);
  assert.equal(last.bad, '', 'the glass follows the card');
});

test('a write that changes a size inside a card still reads the page again', async () => {
  for (let i = 0; i < 8; i++) await frame('quiet');
  const a0 = asks();
  bar.style.setProperty('height', '40px');
  for (let i = 0; i < 3; i++) await frame('resized');
  assert.ok(asks() - a0 >= 1, 'a size write inside a card wakes the glass loop');
});
