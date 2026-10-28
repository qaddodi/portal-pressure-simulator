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
globalThis.Path2D = class { moveTo() {} lineTo() {} bezierCurveTo() {} };
globalThis.getComputedStyle = () => ({
  fontSize: '14px',
  getPropertyValue: (n) => ({ '--mon-bg': '#050608', '--mon-text': '#9aa4ad', '--mon-bright': '#7cf08c', '--mon-alarm': '#ff5a4d', '--mon-grid': '#1c232a', '--mon-line': '#2a323a', '--white': '#ffffff', '--black': '#000000', '--text': '#222222', '--bg': '#ffffff', '--muted': '#667788', '--ramp-pressure': '#DCEBF7 0, #99C2ED 5, #718EDF 10, #8671CF 12, #9B2B6A 20, #661030 30' }[n] ?? '#808080'),
});

// A context that accepts every call and property and writes down the words and the colours it was given.
function fakeCtx(log) {
  const state = {};
  // (A turn of the page is followed, so a name written turned is placed where it lands: translate, then rotate, inside save and restore.)
  let tr = { x: 0, y: 0, rot: 0 }; const trs = [];
  const fns = {
    roundRect: (...a) => { log.rounds.push(a); },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    save: () => { trs.push({ ...tr }); },
    restore: () => { tr = trs.pop() || { x: 0, y: 0, rot: 0 }; },
    translate: (x, y) => { tr.x += x; tr.y += y; },
    rotate: (a) => { tr.rot += a; },
    isPointInStroke: () => false,
    fillText: (s, x, y) => { log.texts.push({ s: String(s), x, y, font: state.font, fill: state.fillStyle, align: state.textAlign, turn: tr.rot ? { ...tr } : null }); if (!(Number.isFinite(x) && Number.isFinite(y))) log.bad.push(`fillText ${s} at ${x},${y}`); },
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
    this.log = { texts: [], fonts: [], bad: [], calls: 0, gradients: 0, rounds: [] };
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
const fresh = (node) => { node.log.texts.length = 0; node.log.bad.length = 0; node.log.fonts.length = 0; node.log.rounds.length = 0; };
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

const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');
const { createHvpgCard } = await import('../src/ui/tool-hvpg.js');
const { createPressureTime } = await import('../src/ui/pressure-time.js');
const { createProfile } = await import('../src/ui/charts.js');

test('the model produced frames to draw with', () => {
  assert.ok(healthy.length >= 2 && csph.length >= 2, `healthy ${healthy.length}, csph ${csph.length} frames`);
  assert.ok(healthy[0].metrics && healthy[0].samples.ph.length === healthy[0].samples.t.length);
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

test('an HVPG card that follows the catheter shows the slide\'s step, rides the figure\'s balloon and plays nothing of its own', () => {
  const fp = { fhvp: 8.2, whvp: 19.6, hvpg: 11.4 };
  const card = createHvpgCard();
  const cv = canvasOf(card.el);
  cv.bw = 420; cv.bh = 240;
  let clock = performance.now();
  const play = (frames = 500) => { for (let i = 0; i < frames && frameQueue.length; i++) runFrames(clock += 16); };
  const step = (cath, balloon) => { card.configure({ kind: 'hvpg', catheter: true }, { slide: { cath } }); card.balloon(balloon); card.arrive({ forward: true, again: false }); card.pin(fp); };
  // Free: stepped onto going forward, it would sweep on its own clock; following the catheter it shows the free pressure and waits.
  fresh(cv); step('free', 0); play();
  assert.ok(texts(cv).includes('FHVP') && texts(cv).includes('8.2'), `the free pressure: ${texts(cv)}`);
  assert.ok(!texts(cv).includes('WHVP') && !texts(cv).includes('11.4'), 'nothing climbs without the balloon');
  // Wedge: the next slide keeps the card; the trace waits at the free level until the figure's balloon starts to fill.
  fresh(cv); step('wedge', 0); play();
  assert.ok(!texts(cv).includes('WHVP') && !texts(cv).includes('11.4'), `the wedge waits for the balloon: ${texts(cv)}`);
  card.balloon(1); fresh(cv); play();
  assert.ok(texts(cv).includes('WHVP') && texts(cv).includes('19.6'), `the balloon up, the wedged pressure: ${texts(cv)}`);
  // Result: the HVPG, the difference as the slide prints it.
  fresh(cv); step('result', 1); play();
  assert.ok(texts(cv).includes('HVPG') && texts(cv).includes('11.4'), `the result: ${texts(cv)}`);
  assert.deepEqual(cv.log.bad, [], 'every number handed to the canvas is finite');
  // Off the screen (another slide's card, or none) it draws nothing more, whatever the figure's balloon does.
  card.park(); fresh(cv);
  card.balloon(0); card.pin({ fhvp: 5, whvp: 9, hvpg: 4 }); play();
  assert.deepEqual(texts(cv), [], 'a parked card is left alone');
  // A step it cannot follow (no catheter option, or a slide whose catheter is not at a reading) plays as any HVPG card does.
  const own = createHvpgCard(), cv2 = canvasOf(own.el);
  cv2.bw = 420; cv2.bh = 240;
  own.configure({ kind: 'hvpg' }, { slide: { cath: 'free' } }); own.arrive({ forward: false }); own.pin(fp); runFrames();
  assert.ok(texts(cv2).includes('11.4'), 'without catheter: true the finished tracing at once, as before');
  own.dispose(); card.dispose();
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

// The Explore dock's charts, on the rounded panel (his G2 look, 27 Oct; plot-look.js): the panel is laid first, the chart's whole box in the tile tone,
// and every number and name is written on it, 8 px or more in from its edge, the times and the unit clear of the bottom and the top.
const onPanel = (cv, W, H, tag) => {
  const first = cv.log.rounds[0];
  assert.ok(first, `${tag}: a rounded panel is laid`);
  assert.deepEqual(first, [0, 0, W, H, Math.min(10, W / 4, H / 4)], `${tag}: the panel is the box's whole size, corners 10 px`);
  for (const t of cv.log.texts) {
    const w = 7 * t.s.length;
    let x0, x1, yTop, yBot;
    if (t.turn) {
      // (A name turned 30°, ending at its pivot: its start is down and left of it, and the glyphs' height adds 3 px each way.)
      const a = t.turn.x - w * Math.cos(t.turn.rot), b = t.turn.y - w * Math.sin(t.turn.rot);
      x0 = Math.min(a, t.turn.x) - 3; x1 = Math.max(a, t.turn.x) + 3; yTop = Math.min(b, t.turn.y) - 3; yBot = Math.max(b, t.turn.y) + 3;
    } else {
      x0 = t.align === 'right' ? t.x - w : t.align === 'center' ? t.x - w / 2 : t.x; x1 = x0 + w; yTop = t.y - 6; yBot = t.y + 3;
    }
    assert.ok(x0 >= 8 - 1e-6 && x1 <= W - 8 + 1e-6, `${tag}: "${t.s}" (${x0.toFixed(1)} to ${x1.toFixed(1)}) stands 8 px or more inside the panel's edge of ${W}`);
    assert.ok(yTop >= 4 && yBot <= H - 4, `${tag}: "${t.s}" (${yTop.toFixed(1)} to ${yBot.toFixed(1)}) is inside the panel's top and bottom of ${H}`);
  }
};

test('Over time sits on the rounded panel with its numbers, unit, times and end readings inside it (dock and slide)', () => {
  for (const onSlide of [false, true]) {
    for (const [bw, bh] of [[420, 220], [640, 260], [300, 240]]) {
      const pt = createPressureTime();
      const cv = canvasOf(pt.el);
      cv.bw = bw; cv.bh = bh;
      if (onSlide) { pt.el.slide = true; let n = cv; while (n.parent) n = n.parent; n.slide = true; }
      pt.configure?.({ kind: 'trace', range: 'beats' });
      for (const f of healthy) pt.update({ ...f, running: true, speed: 1, clock: 'hemo' });
      runFrames();
      const tag = `${onSlide ? 'slide' : 'dock'} ${bw}x${bh}`;
      onPanel(cv, bw, bh, tag);
      assert.ok(cv.log.texts.some((t) => t.s === 'mmHg' && t.x === 8), `${tag}: the unit stands 8 px in`);
      assert.ok(cv.log.texts.some((t) => t.s === 'now'), `${tag}: the times are written`);
      assert.deepEqual(cv.log.bad, [], `${tag}: every number handed to the canvas is finite`);
      pt.dispose();
    }
  }
});

test('the pressure profile sits on the rounded panel, its numbers in a strip 8 px in, its station names inside it, no axis line', () => {
  for (const [bw, bh] of [[640, 300], [420, 260], [340, 230]]) {
    const p = createProfile();
    const cv = canvasOf(p.el);
    cv.bw = bw; cv.bh = bh;
    p.update({ ...healthy[healthy.length - 1], running: true, speed: 1 });
    runFrames();
    const tag = `profile ${bw}x${bh}`;
    onPanel(cv, bw, bh, tag);
    assert.ok(cv.log.texts.some((t) => t.s === 'mmHg' && t.x === 8), `${tag}: the unit stands 8 px in`);
    const ticks = cv.log.texts.filter((t) => t.align === 'right' && /^\d+$/.test(t.s));
    assert.ok(ticks.length >= 2, `${tag}: the axis is numbered`);
    assert.equal(new Set(ticks.map((t) => t.x)).size, 1, `${tag}: the numbers share one right edge`);
    assert.ok(Math.min(...ticks.map((t) => t.x - 7 * t.s.length)) >= 8 - 1e-6, `${tag}: and the widest starts 8 px in`);
    assert.deepEqual(cv.log.bad, [], `${tag}: every number handed to the canvas is finite`);
    assert.ok(cv.log.fonts.every((f) => parseFloat(/(\d+(\.\d+)?)px/.exec(f)?.[1]) >= 12), `${tag}: no lettering under 12 px`);
  }
});
