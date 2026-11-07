// Laptop-heat recs H3: the Pressure chart's still parts (panel, grid, thresholds, and a slide card's column of readings) are drawn once into a
// picture of their own while their key holds, and laid down whole each frame (still-layer.js). The picture must change no pixel: the same
// drawing calls, with the same arguments and the same state (colours, line ends, clip), reach the screen with it as without it.
// No browser: a recording context writes every drawing call down with the state it was made in, and the two ways are compared frame by frame.
import { test } from 'node:test';
import { CanvasObserver } from './canvas-observer.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { createStill } from '../src/ui/still-layer.js';
import { createCore } from '../src/worker-core.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── the picture itself ──
function fakeCanvas() {
  const log = [];
  const ctx = new Proxy({}, { get: (_, k) => (...a) => { log.push([String(k), ...a]); }, set: () => true });
  return { width: 0, height: 0, log, getContext: () => ctx };
}
function hostCtx(m = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) {
  const log = [];
  return { log, getTransform: () => m, save: () => log.push(['save']), restore: () => log.push(['restore']), setTransform: (...a) => log.push(['setTransform', ...a]), drawImage: (...a) => log.push(['drawImage', ...a]) };
}

test('the still parts are drawn straight onto the chart\'s own context, kept apart by a save and a restore: no 2D picture (1 Nov)', () => {
  let drawn = 0;
  const still = createStill({ width: 800, height: 400 });
  const ctx = hostCtx();
  for (let i = 0; i < 3; i++) still.lay(ctx, 'k', (c) => { assert.equal(c, ctx); drawn++; });
  assert.equal(drawn, 3, 'drawn every frame, by the GPU\'s pen');
  assert.deepEqual(ctx.log, [['save'], ['restore'], ['save'], ['restore'], ['save'], ['restore']]);
  const src = read('../src/ui/still-layer.js');
  assert.doesNotMatch(src, /getContext|drawImage|createElement/, 'no canvas of its own');
});

test('switched off, the parts are drawn straight onto the chart every time and no picture is made', () => {
  let made = 0, drawn = 0;
  const still = createStill({ width: 10, height: 10 }, { on: false, make: () => { made++; return fakeCanvas(); } });
  const ctx = hostCtx();
  for (let i = 0; i < 3; i++) still.lay(ctx, 'k', (c) => { assert.equal(c, ctx); drawn++; });
  assert.equal(drawn, 3);
  assert.equal(made, 0);
  assert.deepEqual(ctx.log, [['save'], ['restore'], ['save'], ['restore'], ['save'], ['restore']], 'each drawing is kept apart from the chart\'s own state, as a picture\'s context is');
});

// ── the Pressure chart, with and without the picture ──
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
  testPen() { return this.getContext(); }   // (util.js fitCanvas: the recorder stands for the pen the charts draw with)
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

async function modelFrames(preset, secs = 3) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'frame' && m.samples?.t.length) out.push(m); });
  await core.handle({ type: 'preset', id: preset });
  core.handle({ type: 'run', running: true });
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000 && out.length < 9) await new Promise((r) => setTimeout(r, 40));
  core.dispose();
  return out;
}
const healthy = await modelFrames('healthy');
const csph = await modelFrames('csph');
const { createPressureTime } = await import('../src/ui/pressure-time.js');

/** Draws `frames` one by one on a chart set up by `sc`; the list of what each frame put on the canvas, and how many times the picture was made. */
function drive(stillLayer, sc, frames) {
  const ops = [], perFrame = [];
  current = { ops };
  T = 1000; picBuilds = 0;
  stillClock();
  const pt = createPressureTime({ stillLayer });
  const cv = canvasOf(pt.el);
  cv.bw = sc.bw; cv.bh = sc.bh;
  if (sc.slide) { pt.el.slide = true; let n = cv; while (n.parent) n = n.parent; n.slide = true; }
  const press = (pred) => { const b = find(pt.el, pred); b.listeners.click({ preventDefault() {} }); };
  if (sc.range) press((n) => n.attrs?.['data-range'] === sc.range);
  if (sc.ekg) press((n) => n.attrs?.['data-lane'] === 'ekg');
  pt.configure({ kind: 'trace', ...sc.tool }, sc.ref ? { ref: sc.ref } : undefined);
  if (sc.pin) pt.pin(sc.pin);
  frames.forEach((f, i) => {
    T += 120;
    pt.update({ ...f, running: true, speed: 1, clock: 'hemo' });
    runFrames();
    perFrame.push(ops.splice(0));
    (perFrame.buildsAt ??= []).push(picBuilds);
    if (sc.after && i === sc.after.at) sc.after.do(pt, cv);
  });
  pt.dispose();
  realClock();
  perFrame.builds = picBuilds;
  return perFrame;
}

const was = { whvp: 21, fhvp: 8, hvpg: 13, hr: 62 };
const SCENARIOS = [
  { name: 'Patients dock, last beats, 420x320', bw: 420, bh: 320, has: /fillText \d+,/ },
  { name: 'Patients dock, last beats with the EKG strip, 640x300', bw: 640, bh: 300, ekg: true },
  { name: 'Patients dock, narrow 300x240', bw: 300, bh: 240 },
  { name: 'Patients dock, a short lane 420x150', bw: 420, bh: 150 },
  { name: 'Patients dock, two minutes', bw: 420, bh: 260, range: 'minutes' },
  { name: 'Patients dock, disease clock with no days yet (the panel and its words alone)', bw: 420, bh: 260, range: 'days', min: 3 },
  { name: 'slide, two minutes', bw: 420, bh: 260, slide: true, range: 'minutes', has: /fillText HVPG, mmHg,/ },
  { name: 'slide, the beat card, wide, with the change since', bw: 640, bh: 300, slide: true, ref: was, tool: {}, has: /fillText HEART RATE,/, hasToo: /fillText ▼|fillText ▲/ },
  { name: 'slide, the beat card, wide, no earlier state', bw: 640, bh: 300, slide: true, has: /fillText HEART RATE,/ },
  { name: 'slide, the beat card, wide, a low card (the bare column)', bw: 520, bh: 172, slide: true, ref: was, has: /fillText HEART RATE,/ },
  { name: 'slide, the beat card, wide, no EKG strip', bw: 640, bh: 300, slide: true, tool: { ekg: false }, ref: was },
  { name: 'slide, the beat card, wide, pinned numbers', bw: 640, bh: 300, slide: true, pin: { hr: 131, whvp: 30, fhvp: 9 }, has: /fillText 1,[^\n]*\nfillText 3,[^\n]*\nfillText 1,/ },   // (the heart rate in tabular digits, one at a time)
  { name: 'slide, the beat card, narrow (the line on top)', bw: 360, bh: 260, slide: true, ref: was, has: /fillText HR,/, not: /fillText HEART RATE,/ },
];
const sorted = (a) => [...a].sort();

for (const sc of SCENARIOS) {
  for (const [label, frames] of [['healthy', healthy], ['portal hypertension', csph]]) {
    test(`${sc.name} (${label}): the same drawing reaches the canvas with the picture as without it, every frame`, () => {
      const off = drive(false, sc, frames), on = drive(true, sc, frames);
      assert.equal(on.length, off.length);
      assert.ok(off.every((f) => f.length > (sc.min ?? 10)), 'every frame draws');
      const all = off[off.length - 1].join('\n');
      if (sc.has) assert.match(all, sc.has, 'the still words are on the canvas');
      if (sc.hasToo) assert.match(all, sc.hasToo);
      if (sc.not) assert.doesNotMatch(all, sc.not);
      for (let i = 0; i < off.length; i++) {
        const a = sorted(off[i]), b = sorted(on[i]);
        if (a.length !== b.length || a.some((x, j) => x !== b[j])) {
          const only = (p, q) => p.filter((x) => !q.includes(x)).slice(0, 3).map((x) => x.slice(0, 400));
          assert.fail(`frame ${i}: ${a.length} calls without the picture, ${b.length} with it\nonly without: ${only(a, b).join('\n  ')}\nonly with: ${only(b, a).join('\n  ')}`);
        }
      }
    });
  }
}

test('the chart lets the picture go with itself, and a chart can be made without one', () => {
  const src = read('../src/ui/pressure-time.js');
  assert.match(src, /still\.drop\(\);/);
  assert.match(src, /createPressureTime\(\{ marks = \(\) => \[\], stillLayer = true \} = \{\}\)/);
  assert.match(src, /const still = createStill\(cv, \{ on: stillLayer \}\);/);
  // The panel is drawn once: in the picture, or by the card that draws none.
  assert.equal(src.split('plotFill(').length - 1, 3, 'the general picture, the beat picture and the helper of the two cards with no picture');
});
