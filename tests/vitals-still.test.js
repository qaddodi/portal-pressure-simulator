// Laptop-heat Q6: the vitals monitor's still parts (the panel, the baseline and the strip's name; the vitals' names, numbers and units) are drawn
// into pictures of their own while what they are drawn from holds (still-layer.js); the EKG strip is drawn over the first, every frame. The pictures
// must change no pixel: the same drawing calls, in the same order, with the same state, reach the screen with them as without. No browser: a
// recording context writes every call down with the state it was made in, and the two ways are compared frame by frame.
import { test } from 'node:test';
import { CanvasObserver } from './canvas-observer.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
let frameQueue = [];
globalThis.requestAnimationFrame = (fn) => { frameQueue.push(fn); return frameQueue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.window.devicePixelRatio = 2;
let T = 1000;
const realNow = performance.now.bind(performance);
// (The page's clock stands still but for the steps a test takes, so two charts see the same time; the model above runs on the real one.)
const stillClock = () => { performance.now = () => T; };
const realClock = () => { performance.now = realNow; };
// (Every colour token its own colour, so a swapped token shows.)
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
globalThis.getComputedStyle = () => ({
  fontSize: '14px',
  getPropertyValue: (n) => (n === '--ramp-pressure' ? '#DCEBF7 0, #99C2ED 5, #718EDF 10, #8671CF 12, #9B2B6A 20, #661030 30' : `#${(0x1000000 | (hash(n) & 0xffffff)).toString(16).slice(1)}`),
});

// (What each kind of call reads from the context: a stroke does not read the fill colour, so two states that differ only there draw the same pixels.)
const READS = {
  fill: ['fillStyle', 'globalAlpha'], fillRect: ['fillStyle', 'globalAlpha'],
  stroke: ['strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'], strokeRect: ['strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'],
  fillText: ['font', 'fillStyle', 'textAlign', 'textBaseline', 'globalAlpha'], strokeText: ['font', 'strokeStyle', 'lineWidth', 'lineJoin', 'textAlign', 'textBaseline', 'globalAlpha'],
  clearRect: [],
};
const DASHED = new Set(['stroke', 'strokeRect', 'strokeText']);
class Grad { constructor(a) { this.a = a; this.s = []; } addColorStop(o, c) { this.s.push([o, c]); } toJSON() { return ['gradient', this.a, this.s]; } }
// A context that writes down every call that puts something on the canvas, with the state it was made in: the properties, the dash, the clips
// (each the path it was made from) and the transform. A picture's context keeps what its last drawing wrote; laying it down on the chart writes
// that among the chart's own.
let picBuilds = 0;   // (how many times a picture was cleared to be made again)
function recorder(sink, isPic) {
  const st = { font: '10px sans-serif', fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1, textAlign: 'start', textBaseline: 'alphabetic' };
  let dash = [], clips = [], path = [], tf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [];
  const snap = (kind) => JSON.stringify([READS[kind].map((k) => st[k]), DASHED.has(kind) ? dash : null, clips, tf]);
  const pathOps = ['moveTo', 'lineTo', 'rect', 'arc', 'arcTo', 'ellipse', 'roundRect', 'bezierCurveTo', 'quadraticCurveTo', 'closePath'];
  const fns = {
    save: () => { stack.push({ st: { ...st }, dash: [...dash], clips: [...clips], tf: { ...tf } }); },
    restore: () => { const s = stack.pop(); if (s) { Object.assign(st, s.st); dash = s.dash; clips = s.clips; tf = s.tf; } },
    setTransform: (a, b, c, d, e, f) => { tf = { a, b, c, d, e, f }; },
    getTransform: () => ({ ...tf }),
    setLineDash: (a) => { dash = [...a]; },
    getLineDash: () => [...dash],
    beginPath: () => { path = []; },
    clip: () => { clips = [...clips, JSON.stringify(path)]; },
    fill: () => { sink.push(`fill ${JSON.stringify(path)} ${snap('fill')}`); },
    stroke: () => { sink.push(`stroke ${JSON.stringify(path)} ${snap('stroke')}`); },
    fillRect: (...a) => { sink.push(`fillRect ${a} ${snap('fillRect')}`); },
    strokeRect: (...a) => { sink.push(`strokeRect ${a} ${snap('strokeRect')}`); },
    fillText: (...a) => { sink.push(`fillText ${a} ${snap('fillText')}`); },
    strokeText: (...a) => { sink.push(`strokeText ${a} ${snap('strokeText')}`); },
    clearRect: (...a) => { if (isPic) { sink.length = 0; picBuilds++; } else sink.push(`clearRect ${a} ${snap('clearRect')}`); },
    drawImage: (img) => { if (img?.recOps) sink.push(...img.recOps); },
    measureText: (s) => ({ width: String(s).length * (parseFloat(/(\d+(\.\d+)?)px/.exec(st.font)?.[1]) || 10) * 0.55 }),
    createLinearGradient: (...a) => new Grad(a),
    createRadialGradient: (...a) => new Grad(a),
  };
  for (const k of pathOps) fns[k] = (...a) => { path.push([k, ...a]); };
  return new Proxy(st, {
    get(t, k) { if (k in fns) return fns[k]; if (k in t) return t[k]; return () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 400; this.offsetParent = {}; this.parent = null; this.slide = false; this.listeners = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...k) { for (const c of k) { this.kids.push(c); if (c && typeof c === 'object') c.parent = this; } }
  appendChild(c) { this.append(c); return c; }
  replaceChildren(...k) { this.kids = []; this.append(...k); }
  addEventListener(t, fn) { this.listeners[t] = fn; }
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest(sel) { for (let n = this; n; n = n.parent) if (n.slide && sel.includes('.pz-tool')) return n; return null; }
  getBoundingClientRect() { return { width: this.bw ?? 400, height: this.bh ?? 220, left: 0, top: 0 }; }
  getContext() {
    if (!this.ctx) { this.recOps = this.parent ? this.sink : []; this.ctx = recorder(this.recOps, !this.parent); }
    return this.ctx;
  }
  remove() {}
}
let current = null;   // (the chart being drawn: its canvas writes into its list)
Object.defineProperty(Node.prototype, 'sink', { get() { return current.ops; } });
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = CanvasObserver;   // (canvases report their box as a browser's observer does: tests/canvas-observer.js)

const runFrames = () => { const q = frameQueue; frameQueue = []; for (const fn of q) fn(T); };
const find = (n, test) => { if (test(n)) return n; for (const k of n.kids || []) { const r = find(k, test); if (r) return r; } return null; };
const canvasOf = (el) => find(el, (n) => n.tag === 'canvas');


const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');
await Promise.resolve();

const ph1 = (c) => c - Math.floor(c);
/** The worker's frames: the model running (4 ms samples, 8 to a frame) at a heart rate that walks, with the pressure and the output moving. */
function frames(n, { hr0 = 68, hr1 = 68, map0 = 84, map1 = 84, co0 = 5.2, co1 = 5.2 } = {}) {
  const out = [], m = { t: 10, cyc: 0.3 };
  for (let f = 0; f < n; f++) {
    const u = f / Math.max(1, n - 1), hr = hr0 + (hr1 - hr0) * u, t = [], ph = [];
    for (let k = 0; k < 8; k++) { t.push(m.t); ph.push(ph1(m.cyc)); m.t += 0.004; m.cyc += (hr / 60) * 0.004; }
    out.push({ running: true, clock: 'hemo', speed: 1, morphing: false, metrics: { hr, map: map0 + (map1 - map0) * u, co: co0 + (co1 - co0) * u, ra: 4, blood: { hb: 12.4 } }, phase: ph1(m.cyc), samples: { t, ph } });
  }
  return out;
}

/** Draws the frames one by one on a monitor; the list of what each frame put on the canvas, and how many times a picture was made. */
function drive(stillLayer, sc, fr) {
  const ops = [], perFrame = [];
  current = { ops };
  T = 1000; picBuilds = 0;
  stillClock();
  const vm = createVitalsMonitor({ stillLayer });
  const cv = canvasOf(vm.el);
  cv.bw = sc.bw; cv.bh = sc.bh;
  vm.configure(sc.tool || {});
  if (sc.pin) vm.pin(sc.pin);
  fr.forEach((f) => {
    T += 33;
    vm.update(f);
    runFrames();
    perFrame.push(ops.splice(0));
    (perFrame.buildsAt ??= []).push(picBuilds);
  });
  vm.dispose();
  realClock();
  perFrame.builds = picBuilds;
  return perFrame;
}

const SCENARIOS = [
  { name: 'steady, 420x200', bw: 420, bh: 200, fr: frames(40) },
  { name: 'the numbers moving (heart rate and pressure walk), 420x200', bw: 420, bh: 200, fr: frames(60, { hr0: 62, hr1: 118, map0: 90, map1: 58, co0: 5.4, co1: 3.1 }) },
  { name: 'a narrow card, 300x170', bw: 300, bh: 170, fr: frames(30, { hr0: 70, hr1: 96 }) },
  { name: 'a wide card, 640x260, two vitals', bw: 640, bh: 260, tool: { show: ['hr', 'map'] }, fr: frames(30, { hr0: 70, hr1: 96 }) },
  { name: 'all four asked for, three shown, 420x240', bw: 420, bh: 240, tool: { show: ['hr', 'map', 'co', 'hb'] }, fr: frames(30) },
  { name: 'too small to draw, 100x80', bw: 100, bh: 80, fr: frames(5) },
];

for (const sc of SCENARIOS) {
  test(`the monitor puts the same calls on the canvas with the pictures as without: ${sc.name}`, () => {
    const off = drive(false, sc, sc.fr), on = drive(true, sc, sc.fr);
    assert.equal(on.length, off.length);
    for (let i = 0; i < off.length; i++) assert.deepEqual(on[i], off[i], `frame ${i}`);
    if (sc.bw >= 120) assert.ok(off.some((f) => f.some((o) => /^fillText/.test(o))), 'it draws words');
  });
}

test('the pictures are made once while nothing they are drawn from changes, and the strip is drawn every frame', () => {
  const sc = SCENARIOS[0], on = drive(true, sc, sc.fr);
  assert.ok(on.builds <= 6, `${on.builds} pictures made in ${on.length} frames`);
  const b = on.buildsAt;
  assert.equal(b[b.length - 1], b[b.length - 11], 'none made in the last ten frames');
  const has = on.map((f) => f.some((o) => /^stroke /.test(o) && /1\.6/.test(o))); assert.ok(has.slice(22).every(Boolean), `the strip stroke is drawn on every frame: ${has.map(Number).join('')}`);
});

test('moving numbers make the number picture again only when a printed digit changes', () => {
  const sc = SCENARIOS[1], on = drive(true, sc, sc.fr);
  assert.ok(on.builds < sc.fr.length, `${on.builds} pictures in ${sc.fr.length} frames`);
});

test('the monitor sets its pictures from one place: the first lays the panel under the strip, the second the readings', () => {
  const src = read('../src/ui/vitals-monitor.js');
  assert.match(src, /const stillTop = createStill\(cv, \{ on: stillLayer \}\), stillCells = createStill\(cv, \{ on: stillLayer \}\);/);
  assert.ok(src.indexOf('stillTop.lay(') < src.indexOf('ekgSeries(') && src.indexOf('ekgSeries(') < src.indexOf('stillCells.lay('), 'panel, strip, readings');
  assert.match(src, /stillTop\.drop\(\); stillCells\.drop\(\);/);
});
