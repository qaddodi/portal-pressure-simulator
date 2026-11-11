// The teaching card's glass is never drawn where the card is held out of sight. Mohammad, 11 Nov 2026, on the way from the outline to a deck's
// first slide: "see when i transition to first slide how the teaching card flickers". The outline hides the words, so the shade sat at layout's
// inline opacity '0' with no .pz-leave. Next adds .pz-leave (opacity 0 !important) and the shade's slide out, a transform transition, starts;
// the first slide's layout then writes the shade's inline opacity '1' (not important) while .pz-leave still holds it at 0. The glass took the
// inline value as the card's fade because an animation was running on it, though that animation moved it and left its opacity alone: an empty
// frosted panel at full strength slid off for the rest of the transition, then vanished, before the new card was thrown in.
// A node replay through the real glass-gl.js and frame.js, frame by frame (the page faked: boxes, inline styles, classes, one CSS transition).
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
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.q = []; this.roots = []; this.posted = false; } observe(n) { this.roots.push(n); MOs.add(this); } disconnect() { MOs.delete(this); } takeRecords() { const q = this.q; this.q = []; return q; } };
const record = (target, r) => { for (const o of MOs) { let hit = false; for (let e = target; e; e = e.parentElement) if (o.roots.includes(e)) { hit = true; break; } if (!hit) continue; o.q.push({ target, ...r }); if (!o.posted) { o.posted = true; queueMicrotask(() => { o.posted = false; const q = o.takeRecords(); if (q.length) o.cb(q); }); } } };
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

test('a card held at 0 by its leave class while it slides out: its inline opacity 1 never brings its glass back', async () => {
  shade.style.setProperty('opacity', '0');
  for (let i = 0; i < 10; i++) await frame('outline');
  const t0 = performance.now();
  const an = { playState: 'running', playbackRate: 1, startTime: t0, get currentTime() { return performance.now() - t0; }, ready: Promise.resolve(), addEventListener() {},
    effect: { getKeyframes: () => [{ offset: 0, computedOffset: 0, transform: 'translateX(0px)', easing: 'linear' }, { offset: 1, computedOffset: 1, transform: 'translateX(-400px)', easing: 'linear' }], getTiming: () => ({ duration: 180, delay: 0, easing: 'linear', fill: 'backwards', iterations: 1 }) } };
  shade.getAnimations = () => (performance.now() - t0 < 180 ? [an] : []);
  shade.classList.add('pz-leave');
  for (let i = 0; i < 3; i++) await frame('leaving');
  shade.style.setProperty('width', '420px'); shade.style.setProperty('opacity', '1');   // (the first slide's layout)
  for (let i = 0; i < 14; i++) await frame('laid');
  const bad = log.filter((r) => r.el === 'shade' && r.bad);
  assert.equal(bad.length, 0, `glass drawn for a card at 0: ${JSON.stringify(bad[0])}`);
  // (Let go, the card comes back with its glass.)
  shade.classList.remove('pz-leave');
  for (let i = 0; i < 6; i++) await frame('back');
  const last = log.filter((r) => r.el === 'shade').at(-1);
  assert.equal(last.o, 1); assert.equal(last.st, 'gl'); assert.equal(last.ga, 1);
});
