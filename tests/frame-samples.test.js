// The cards that read the painted frame (the presenter's instruments) get every beat, whatever the paint gate paints.
// The paint gate takes every frame in but paints only the newest, and leaves a quiet frame near the last paint unpainted, so a card that
// drew from painted frames lost the samples of the rest: the heartbeat wrapped in a hole and the EKG strip showed one beat, a long flat
// stretch, then crowded beats (carvedilol deck, bleed slide, iPhone). frame-samples.js hands the painted frame every sample taken in
// since the last paint; the heart also goes on from the beat it is at when a slide's state is restored (worker-core.js keepBeat).
// No browser: a fake page, frames made as the worker makes them, and the strip's polyline read back from the points sent to the GPU.
import { test } from 'node:test';
import { CanvasObserver } from './canvas-observer.js';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { recorderGL } from './vitals-recorder.js';
import { createSampleOwing, joinSamples } from '../src/ui/frame-samples.js';
import { createCore } from '../src/worker-core.js';

let now = 1000, queue = [];
performance.now = () => now;
globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.window.devicePixelRatio = 1;
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: (n) => ({ '--mon-bg': '#050608', '--mon-text': '#9aa4ad', '--mon-bright': '#7cf08c', '--mon-alarm': '#ff5a4d', '--mon-grid': '#1c232a' }[n] ?? '#808080') });

// A context that records the strip: the one stroke drawn at 1.6 px.
function fakeCtx(rec) {
  const state = {};
  let path = [];
  const fns = {
    beginPath: () => { path = []; },
    moveTo: (x, y) => path.push({ x, y }),
    lineTo: (x, y) => path.push({ x, y }),
    stroke: () => { if (state.lineWidth === 1.6) rec.strip = path.slice(); },
    measureText: (s) => ({ width: String(s).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(state, { get: (t, k) => (k in fns ? fns[k] : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 400; this.offsetParent = {}; this.rec = { strip: null };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...k) { for (const c of k) this.kids.push(c); }
  appendChild(c) { this.kids.push(c); return c; }
  replaceChildren(...k) { this.kids = [...k]; }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
  getBoundingClientRect() { return { width: 420, height: 200, left: 0, top: 0 }; }
  testPen() { return this.getContext(); }   // (util.js fitCanvas: the recorder stands for the pen the charts draw with)
  getContext() { return (this.ctx ??= fakeCtx(this.rec)); }
  remove() {}
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = CanvasObserver;   // (canvases report their box as a browser's observer does: tests/canvas-observer.js)
const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');
await Promise.resolve();

const canvasOf = (el) => el.kids.find((k) => k.tag === 'canvas');
const PAD = 14, EW = 420 - 2 * PAD, SPAN = 6, PX_S = EW / SPAN;
const ph1 = (c) => c - Math.floor(c);

/** The R peaks on the strip as seconds before its head, newest first: runs of points high on the strip that the line then leaves. */
function peaksOf(strip) {
  const out = [];
  if (!strip) return out;
  for (let i = 0, from = -1; i < strip.length; i++) {
    const hi = strip[i].y < 46;
    if (hi && from < 0) from = i;
    if (!hi && from >= 0) {
      let m = from; for (let k = from; k < i; k++) if (strip[k].y < strip[m].y) m = k;
      out.push((PAD + EW - strip[m].x) / PX_S); from = -1;
    }
  }
  return out.reverse();
}


// ── the helper on its own ──
const frameOf = (gen, t0, n, extra = {}) => ({ gen, clock: 'hemo', morphing: false, samples: { t: Float64Array.from({ length: n }, (_, i) => t0 + i * 0.004), ph: Float64Array.from({ length: n }, (_, i) => (i / 100) % 1) }, ...extra });

test('joinSamples puts the frames\' samples in order, key by key', () => {
  const a = frameOf(1, 0, 3).samples, b = frameOf(1, 1, 2).samples;
  const j = joinSamples([a, b]);
  assert.deepEqual([...j.t], [0, 0.004, 0.008, 1, 1.004]);
  assert.equal(j.ph.length, 5);
});

test('a painted frame carries the samples of the frames taken in since the last paint, and nothing twice', () => {
  const o = createSampleOwing();
  const f1 = frameOf(1, 0, 4), f2 = frameOf(1, 0.1, 4), f3 = frameOf(1, 0.2, 4);
  for (const f of [f1, f2, f3]) o.take(f);
  const p = o.forPaint(f3);
  assert.notEqual(p, f3, 'a copy that carries all of them');
  assert.equal(p.samples.t.length, 12);
  assert.ok(p.samples.t.every((t, i) => i === 0 || t > p.samples.t[i - 1]), 'in order');
  assert.equal(f3.samples.t.length, 4, 'the frame taken in is left as it was (the dock and the lazy panes hold it)');
  const f4 = frameOf(1, 0.3, 4); o.take(f4);
  assert.equal(o.forPaint(f4), f4, 'a frame alone is painted as it is');
  assert.equal(o.pending, 0);
});

test('a new patient, a clock change or an easing does not carry the old stream over', () => {
  const o = createSampleOwing();
  o.take(frameOf(1, 0, 4)); o.take(frameOf(2, 50, 4));
  const g = frameOf(2, 50.1, 4); o.take(g);
  assert.equal(o.forPaint(g).samples.t.length, 8, 'only the new patient\'s');
  o.take(frameOf(2, 60, 4)); const d = frameOf(2, 61, 1, { clock: 'disease' }); o.take(d);
  assert.equal(o.forPaint(d), d, 'a time-lapse\'s parked sample is its own');
  o.take(frameOf(2, 70, 4)); const m = frameOf(2, 70.1, 0, { morphing: true, samples: null }); o.take(m);
  assert.equal(o.forPaint(m), m);
  assert.equal(o.pending, 0);
});

test('a frame with no samples of its own is painted with those owed', () => {
  const o = createSampleOwing();
  o.take(frameOf(3, 0, 5));
  const q = frameOf(3, 0, 0, { samples: null }); o.take(q);
  assert.equal(o.forPaint(q).samples.t.length, 5);
});

// ── the strip behind a paint gate that skips frames ──
/** The model at `hr` for `secs`, frames about every 95 ms carrying their 4 ms samples (the worker's frames). */
function* liveFrames(secs, hr, m = { t: 10, cyc: 0.3 }) {
  for (let f = 0; f < Math.round(secs / 0.095); f++) {
    const t = [], ph = [];
    for (let k = 0; k < 24; k++) { t.push(m.t); ph.push(m.cyc - Math.floor(m.cyc)); m.t += 0.004; m.cyc += (hr / 60) * 0.004; }
    yield { gen: 1, running: true, clock: 'hemo', speed: 1, morphing: false, changed: false, metrics: { hr, map: 80, co: 6 }, phase: ph[23], samples: { t: Float64Array.from(t), ph: Float64Array.from(ph) } };
  }
}

/** Frames through the gate: every frame is taken in, only the ones `paints` says are painted (and the newest after a stall) reach the card. */
function run(paints, owing) {
  const v = createVitalsMonitor({ makeGL: recorderGL });
  v.configure({ kind: 'vitals', show: ['hr', 'map', 'co'] });
  const cv = canvasOf(v.el), o = owing ? createSampleOwing() : null;
  let worst = [9, 0], n = 0, last = [];
  for (const f of liveFrames(14, 89)) {
    n++;
    o?.take(f);
    now += 95;
    if (paints(n)) { cv.rec.strip = null; v.update(o ? o.forPaint(f) : f); }
    const q = queue; queue = []; for (const fn of q) fn(now);
    const pk = peaksOf(cv.rec.strip);
    if (n > 70 && pk.length > 2) { const gaps = pk.slice(1).map((s, i) => s - pk[i]); worst = [Math.min(worst[0], ...gaps), Math.max(worst[1], ...gaps)]; last = pk; }
  }
  v.dispose();
  return { worst, last };
}
// (what the gate did: one frame of three painted; and a stall of 2.4 s in which only the newest was)
const gate = (n) => (n >= 40 && n < 65 ? n === 64 : n % 3 === 0);

test('the EKG strip shows a steady 89 a minute behind a gate that skips frames, with every beat', () => {
  const a = run(gate, true);
  assert.ok(a.worst[0] > 0.64 && a.worst[1] < 0.71, `every gap between beats is 0.67 s: ${a.worst.map((x) => x.toFixed(2))}`);
  assert.ok(a.last.length >= 8, `a full strip: ${a.last.length} beats`);
});

test('and without the samples the painted frames skipped, it did not (the bug)', () => {
  const b = run(gate, false);
  assert.ok(b.worst[0] < 0.6 || b.worst[1] > 0.76, `a beat was lost or crowded: ${b.worst.map((x) => x.toFixed(2))}`);
});

// ── the beat goes on when a slide's state is restored ──
test('a restore as an easing lands keeps the heart where it is (keepBeat), and a plain restore does not', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const core = createCore(() => {});
  t.after(() => core.dispose());
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 });
  const e = core.engine(), snap = e.snapshot();
  e.cyc = 41.37;
  await core.handle({ type: 'restore', snap, keepBeat: true });
  assert.ok(Math.abs(e.cyc - 41.37) < 1e-9, `kept: ${e.cyc}`);
  await core.handle({ type: 'restore', snap });
  assert.ok(Math.abs(e.cyc - (snap.cyc || 0)) < 1e-9, 'a plain restore sets the beat the snapshot had');
  e.cyc = 9.9;
  await core.handle({ type: 'morph', snap, ms: 0 });
  assert.ok(Math.abs(e.cyc - 9.9) < 1e-9, 'a change with no easing keeps the beat too');
});

test('the wiring: every frame is taken in, the painted one carries them, the presenter restores with keepBeat', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const main = read('../src/ui/main.js'), pres = read('../src/ui/presenter.js');
  assert.match(main, /dock\?\.ingest\(f\);[^\n]*\n\s+sampleOwing\.take\(f\);/, 'taken in with every frame');
  assert.match(main, /function paintFrame\(f\) \{\s+f = sampleOwing\.forPaint\(f\);/, 'the painted frame carries them');
  assert.match(pres, /type: 'restore', snap: st\.snap, keepBeat: true/);
});
