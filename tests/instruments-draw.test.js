// The new instruments (deck rebuild plan A3, A4) run against a fake DOM: a real model's frames go in, the real drawing code runs, and a 2D
// context that records what it was asked to write comes out. No browser: this catches a throw or a missing number, not how it looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { createCore } from '../src/worker-core.js';

// ── a fake page ──
let frameQueue = [];
globalThis.requestAnimationFrame = (fn) => { frameQueue.push(fn); return frameQueue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.window.devicePixelRatio = 2;
globalThis.getComputedStyle = () => ({
  fontSize: '14px',
  getPropertyValue: (n) => ({ '--mon-bg': '#050608', '--mon-text': '#9aa4ad', '--mon-bright': '#7cf08c', '--mon-alarm': '#ff5a4d', '--mon-grid': '#1c232a', '--mon-line': '#2a323a', '--white': '#ffffff', '--black': '#000000', '--text': '#222222', '--bg': '#ffffff', '--muted': '#667788' }[n] ?? '#808080'),
});

// A context that accepts every call and property and writes down the words and the colours it was given.
function fakeCtx(log) {
  const state = {};
  const fns = {
    fillText: (s, x, y) => { log.texts.push({ s: String(s), x, y, font: state.font, fill: state.fillStyle }); if (!(Number.isFinite(x) && Number.isFinite(y))) log.bad.push(`fillText ${s} at ${x},${y}`); },
    strokeText: () => {},
    measureText: (s) => ({ width: String(s).length * 7 }),
    createLinearGradient: () => { log.gradients++; return { addColorStop() {} }; },
  };
  const num = (a) => a.every((v) => typeof v !== 'number' || Number.isFinite(v));
  return new Proxy(state, {
    get(t, k) {
      if (k in fns) return fns[k];
      if (k in t) return t[k];
      return (...a) => { if (!num(a)) log.bad.push(`${String(k)}(${a.join(',')})`); log.calls++; };
    },
    set(t, k, v) { t[k] = v; if (k === 'font') log.fonts.push(v); return true; },
  });
}

class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 400; this.offsetParent = {}; this.parent = null; this.slide = false;
    this.log = { texts: [], fonts: [], bad: [], calls: 0, gradients: 0 };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...k) { for (const c of k) { this.kids.push(c); if (c && typeof c === 'object') c.parent = this; } }
  appendChild(c) { this.append(c); return c; }
  replaceChildren(...k) { this.kids = []; this.append(...k); }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest(sel) { for (let n = this; n; n = n.parent) if (n.slide && sel.includes('.pz-tool')) return n; return null; }
  getBoundingClientRect() { return { width: this.bw ?? 400, height: this.bh ?? 220, left: 0, top: 0 }; }
  getContext() { return (this.ctx ??= fakeCtx(this.log)); }
  remove() {}
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
// (a browser reports an observed box a moment later, never inside observe())
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const runFrames = (now = performance.now()) => { const q = frameQueue; frameQueue = []; for (const fn of q) fn(now); };
const texts = (node) => node.log.texts.map((t) => t.s);
const fresh = (node) => { node.log.texts.length = 0; node.log.bad.length = 0; node.log.fonts.length = 0; };
const canvasOf = (el) => el.kids.find((k) => k.tag === 'canvas') || (function find(n) { for (const k of n.kids || []) { if (k.tag === 'canvas') return k; const r = find(k); if (r) return r; } return null; })(el);

// ── the model's own frames ──
async function modelFrames(preset, secs = 3) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'frame' && m.samples?.t.length) out.push(m); });
  await core.handle({ type: 'preset', id: preset });
  core.handle({ type: 'run', running: true });
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000 && out.length < 12) await new Promise((r) => setTimeout(r, 40));
  core.dispose();
  return out;
}
const healthy = await modelFrames('healthy');
const csph = await modelFrames('csph');

const { createSpleenUS } = await import('../src/ui/spleen-us.js');
const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');
const { createHvpgCard } = await import('../src/ui/tool-hvpg.js');
const { createPressureTime } = await import('../src/ui/pressure-time.js');

test('the model produced frames to draw with', () => {
  assert.ok(healthy.length >= 2 && csph.length >= 2, `healthy ${healthy.length}, csph ${csph.length} frames`);
  assert.ok(healthy[0].metrics && healthy[0].samples.ph.length === healthy[0].samples.t.length);
});

test('the spleen ultrasound writes the length in cm, holds still within 0.1 cm and says when there is no spleen', () => {
  const sp = createSpleenUS();
  const cv = canvasOf(sp.el);
  cv.bw = 420; cv.bh = 220;
  sp.update({ metrics: { spleen: { length: 14.2 } } });
  assert.ok(texts(cv).includes('14.2') && texts(cv).includes('cm'), `wrote ${texts(cv)}`);
  assert.deepEqual(cv.log.bad, [], 'every number handed to the canvas is finite');
  fresh(cv);
  sp.update({ metrics: { spleen: { length: 14.24 } } });
  assert.deepEqual(texts(cv), [], 'a change under 0.1 cm is not redrawn');
  sp.update({ metrics: { spleen: { length: 18.6 } } });
  for (let i = 0; i < 80 && frameQueue.length; i++) runFrames(performance.now() + i * 16);
  assert.ok(texts(cv).includes('18.6'), 'eased to the new length');
  assert.ok(cv.log.fonts.every((f) => parseFloat(/(\d+(\.\d+)?)px/.exec(f)?.[1]) >= 12), 'no lettering under 12 px');
  assert.equal(cv.log.gradients, 0, 'no gradient');
  sp.pin({ spleen: 0 });
  for (let i = 0; i < 80 && frameQueue.length; i++) runFrames(performance.now() + i * 16);
  assert.ok(texts(cv).includes('Spleen removed'));
  assert.match(cv.attrs['aria-label'], /no spleen/);
  sp.dispose();
});

test('the vitals monitor draws the strip and its readings from a live frame, then from a slide\'s pinned numbers', () => {
  for (const show of [undefined, ['hr', 'map', 'co']]) {
    const v = createVitalsMonitor();
    v.configure({ kind: 'vitals', show });
    const cv = canvasOf(v.el);
    cv.bw = 420; cv.bh = 200;
    for (const f of healthy) v.update({ ...f, running: true, speed: 1 });
    runFrames();
    const ts = texts(cv);
    assert.ok(ts.includes('EKG'), 'the strip is named');
    assert.ok(ts.includes('HR') && ts.includes('MAP'), `readings named: ${ts}`);
    assert.ok(ts.some((s) => /^\d+$/.test(s)), 'a heart rate is written');
    assert.deepEqual(cv.log.bad, [], 'every number handed to the canvas is finite');
    assert.ok(cv.log.fonts.every((f) => parseFloat(/(\d+(\.\d+)?)px/.exec(f)?.[1]) >= 12), 'no lettering under 12 px');
    fresh(cv);
    v.pin({ map: 62, hr: 131, co: 4.1, hb: 9.2, ra: 4 });
    for (let i = 0; i < 60 && frameQueue.length; i++) runFrames(performance.now() + i * 16);
    assert.ok(texts(cv).includes('131') || texts(cv).some((s) => /^13\d$/.test(s) || /^12\d$/.test(s)), `the pinned heart rate is on the monitor: ${texts(cv)}`);
    v.clear(); v.restart();
    v.dispose();
  }
});

test('the HVPG card shows the finished tracing at once when jumped to, eases to new levels, and plays the sweep going forward', async () => {
  const card = createHvpgCard();
  const cv = canvasOf(card.el);
  cv.bw = 420; cv.bh = 240;
  card.arrive({ forward: false });
  card.pin({ fhvp: 8.2, whvp: 19.6, hvpg: 11.4 });
  runFrames();
  assert.ok(texts(cv).includes('11.4'), `the HVPG is the difference as printed: ${texts(cv)}`);
  assert.deepEqual(cv.log.bad, [], 'every number handed to the canvas is finite');
  fresh(cv);
  card.pin({ fhvp: 8.2, whvp: 22.0, hvpg: 13.8 });
  for (let i = 0; i < 120 && frameQueue.length; i++) runFrames(performance.now() + i * 16);
  assert.ok(texts(cv).includes('13.8'), `eased to the new levels: ${texts(cv)}`);
  card.dispose();
  // Forward onto the slide it starts from the free pressure and has not reached the result yet.
  const sweep = createHvpgCard();
  const cv2 = canvasOf(sweep.el);
  cv2.bw = 420; cv2.bh = 240;
  sweep.arrive({ forward: true, again: false });
  sweep.pin({ fhvp: 8.2, whvp: 19.6, hvpg: 11.4 });
  runFrames();
  assert.ok(!texts(cv2).includes('11.4'), 'the result waits for the sweep');
  assert.deepEqual(cv2.log.bad, []);
  sweep.dispose();
});

test('the pressure trace draws the EKG strip and the HVPG lane on a slide and in Patients mode', () => {
  for (const onSlide of [true, false]) {
    for (const bh of [320, 220, 150]) {
      const pt = createPressureTime();
      const cv = canvasOf(pt.el);
      cv.bw = 420; cv.bh = bh;
      if (onSlide) pt.el.slide = true;
      if (onSlide) { let n = cv; while (n.parent) n = n.parent; n.slide = true; }
      pt.configure?.({ kind: 'trace', range: 'beats' });
      for (const f of healthy) pt.update({ ...f, running: true, speed: 1, clock: 'hemo' });
      runFrames();
      const ts = texts(cv);
      assert.deepEqual(cv.log.bad, [], `${onSlide ? 'slide' : 'Patients'} ${bh} px: every number handed to the canvas is finite`);
      assert.ok(ts.includes('mmHg'), `${onSlide ? 'slide' : 'Patients'} ${bh} px: the pressures are labelled`);
      assert.ok(cv.log.fonts.every((f) => parseFloat(/(\d+(\.\d+)?)px/.exec(f)?.[1]) >= 12), 'no lettering under 12 px');
      if (onSlide && bh >= 220) assert.ok(ts.includes('HR'), `slide ${bh} px: the EKG strip reads the heart rate: ${ts}`);
      pt.dispose();
    }
  }
});
