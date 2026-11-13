// Mac heat rec 7 (13 Nov 2026, picked by Mohammad): the Doppler, the pressure strip and the vitals strip are rest-paced by frame.js restGapFor,
// as the figure's blood is. Left alone for 4 s they draw 30 a second (20 in a talk left 30 s), and between their frames they wait on a timer
// (restPark), so the page is not woken for the screen frames between. Their sweeps are drawn from the clock, so only the steps are fewer:
// the strip moves as fast as before. Any input gives the full rate back.
// No browser: a fake page, a fake clock and fake timers; frames made as the worker makes them. The Doppler's loop and the wiring a unit test
// cannot reach without the page are pinned in scripts/rules-lint.mjs.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasObserver } from './canvas-observer.js';
import { createCore } from '../src/worker-core.js';

async function modelFrames(preset) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'frame' && m.samples?.t.length) out.push(m); });
  await core.handle({ type: 'preset', id: preset });
  core.handle({ type: 'run', running: true });
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && out.length < 20) await new Promise((r) => setTimeout(r, 40));
  core.dispose();
  return out;
}
const healthy = await modelFrames('healthy');

// ── the fake page: a clock, the screen's frames and timers, all driven by the test ──
let T = 100000, frameQueue = [], timers = [], tid = 0;
performance.now = () => T;
globalThis.requestAnimationFrame = (fn) => { frameQueue.push(fn); return frameQueue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.setTimeout = (fn, ms = 0) => { timers.push({ id: ++tid, fn, at: T + ms }); return tid; };
globalThis.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
globalThis.window.devicePixelRatio = 2;
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: () => '#808080' });
function fakeCtx() {
  const fns = { measureText: (s) => ({ width: String(s).length * 7 }), createLinearGradient: () => ({ addColorStop() {} }), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), isPointInStroke: () => false };
  return new Proxy({}, { get: (t, k) => (k in fns ? fns[k] : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 420; this.offsetParent = {}; this.parent = null;
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
  closest() { return null; }
  getBoundingClientRect() { return { width: 420, height: 220, left: 0, top: 0 }; }
  testPen() { return this.getContext(); }
  getContext() { return (this.ctx ??= fakeCtx()); }
  remove() {}
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = CanvasObserver;

const f = await import('../src/ui/frame.js');
const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');
const { createPressureTime } = await import('../src/ui/pressure-time.js');
const { recorderGL } = await import('./vitals-recorder.js');
f.setRestTouch(true);
f.setRestOff(false);

/** `ms` of a `hz` screen: the timers due run first, then the frame if one was asked for. Returns the page's wakes (frames run and timers fired). */
function screen(hz, ms) {
  let wakes = 0;
  for (const end = T + ms; T + 1000 / hz <= end + 1e-6;) {
    T += 1000 / hz;
    let woke = false;
    for (;;) {
      let due = null;
      for (const t of timers) if (t.at <= T && (!due || t.at < due.at)) due = t;
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      woke = true;
    }
    if (frameQueue.length) { const q = frameQueue; frameQueue = []; for (const fn of q) fn(T); woke = true; }
    if (woke) wakes++;
  }
  return wakes;
}
const drawn = (tag) => f.perf().totals.drawn[tag] || 0;
/** Draws and wakes of `tag` over a second of a `hz` screen. */
function second(tag, hz) { const d0 = drawn(tag), wakes = screen(hz, 1000); return { draws: drawn(tag) - d0, wakes }; }
const near = (v, want, give, what) => assert.ok(Math.abs(v - want) <= give, `${what}: ${v}, want about ${want}`);

async function liveVitals() {
  const v = createVitalsMonitor({ makeGL: recorderGL });
  await new Promise((r) => queueMicrotask(r));   // (on screen)
  v.update({ ...healthy[0], running: true, speed: 1 });
  return v;
}
async function livePressure() {
  const pt = createPressureTime();
  pt.configure({ kind: 'trace', range: 'beats' }, null);
  await new Promise((r) => queueMicrotask(r));
  pt.update({ ...healthy[0], running: true, speed: 1 });
  return pt;
}

for (const [tag, make] of [['vitals-monitor', liveVitals], ['pressure-time', livePressure]]) {
  test(`${tag}: every frame while touched; 30 a second at rest, woken only for those; 20 in a talk left 30 s; full rate on the frame after an input`, async () => {
    f.setRestTalk(() => false);
    f.noteInput(T);
    const s = await make();
    screen(60, 100);
    const busy = second(tag, 60);
    near(busy.draws, 60, 2, 'touched, 60 Hz screen: drawn');
    screen(60, 4000);   // (4 s untouched)
    const rest = second(tag, 60);
    near(rest.draws, 30, 2, 'at rest, 60 Hz screen: drawn');
    near(rest.wakes, 30, 3, 'at rest, 60 Hz screen: the page woken (timers between, not every frame)');
    const rest120 = second(tag, 120);
    near(rest120.draws, 30, 2, 'at rest, 120 Hz screen: drawn');
    assert.ok(rest120.wakes <= 62, `at rest, 120 Hz screen: woken ${rest120.wakes} times, not 120`);
    f.noteInput(T);
    screen(60, 50);   // (at most one rest frame's wait already set)
    const back = second(tag, 60);
    near(back.draws, 60, 2, 'after an input: drawn at the full rate again');
    f.setRestTalk(() => true);
    screen(60, 31000);   // (a talk, the slide left 31 s)
    const talk = second(tag, 60);
    near(talk.draws, 20, 2, 'a talk left 30 s, 60 Hz screen: drawn');
    near(talk.wakes, 20, 3, 'and woken');
    f.setRestTalk(() => false);
    s.dispose();
    screen(60, 200);
    assert.equal(timers.filter((t) => t.at > T).length, 0, 'no timer left once let go');
    assert.equal(frameQueue.length, 0, 'no frame asked for once let go');
  });
}

test('the vitals strip at rest sweeps as fast as before: on the frames both draw, its trace is in the same place at 30 a second as at 60', async () => {
  // (The same model frames at the same times, once at the full rate (?rest=off) and once at rest: each drawn frame's oldest point, by the time
  // since the start. Were the sweep stepped a frame at a time, the rest run's trace would be half as far along.)
  const run = async (rest) => {
    f.setRestTalk(() => false);
    f.setRestOff(!rest);
    screen(60, 5000);   // (untouched for 5 s)
    const log = [], t0 = T;
    const makeGL = (cv) => { const g = recorderGL(cv); return { ...g, draw(D) { const r = g.draw(D); if (D.line) log.push([Math.round((T - t0) * 100), D.line.pts[0] / D.dpr]); return r; } }; };
    const v = createVitalsMonitor({ makeGL });
    await new Promise((r) => queueMicrotask(r));
    for (let k = 0; k < healthy.length; k++) { v.update({ ...healthy[k], running: true, speed: 1 }); screen(60, 100); }
    v.dispose();
    f.setRestOff(false);
    return log;
  };
  const full = await run(false), rest = await run(true);
  assert.ok(full.length > rest.length * 1.6, `fewer drawn at rest (${full.length} against ${rest.length})`);
  const at = new Map(full);
  let same = 0;
  for (const [t, x] of rest) {
    if (!at.has(t)) continue;
    assert.ok(Math.abs(at.get(t) - x) < 0.01, `${t / 100} ms in: the trace at ${x.toFixed(2)} px at rest, ${at.get(t).toFixed(2)} px at the full rate`);
    same++;
  }
  assert.ok(same >= rest.length - 2 && same > 5, `${same} of ${rest.length} rest frames held against the full-rate run`);
  const xs = rest.map((r) => r[1]);
  assert.ok(xs[xs.length - 1] < xs[0] - 5, 'and the trace moved');
});
