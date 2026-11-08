// The ?perf frame panel (frame-hud.js), redesigned 8 Nov 2026 (Mohammad: "fix the ?perf to give us exactly what we're looking for in terms
// of fps"): its verdict in plain words, the goal this browser allows, the activity words, the physics row, the GPU fences' timing of each
// whole vessel redraw, and the panel itself written from frames run through the app's scheduler on a small stand-in for the DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attrs = {}; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...k) { this.children.push(...k); }
  remove() {}
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
globalThis.window = globalThis;
globalThis.document = { createElement: (t) => new El(t), body: new El('body'), addEventListener() {}, hidden: false, documentElement: { dataset: {}, style: { setProperty() {} } } };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.Element = class { };
globalThis.HTMLElement = globalThis.Element;
globalThis.ResizeObserver = class { observe() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 4);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.requestIdleCallback = (cb) => setTimeout(() => cb({ timeRemaining: () => 10, didTimeout: false }), 0);

const hud = await import('../src/ui/frame-hud.js');
const fence = await import('../src/ui/gpu-fence.js');
const { counts, tally } = await import('../src/ui/frame-counts.js');
const { frameFor } = await import('../src/ui/frame.js');
const { diagnose, goalOf, activityText, ACT, physicsText, plainStep, isWebKit } = hud;

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const st = (o) => ({ fps: 30, low1: 20, p50: 33.3, p95: 40, p99: 50, max: 60, s50: 2, s95: 3, smax: 5, n: 60, ...o });
const gpuOf = (steps, phases = [0, 0, 0, 0, 0]) => ({ n: 16, every: 30, steps: steps.map(([name, med, max]) => ({ name, med, max: max ?? med, n: 16 })), phases: phases.map((med, i) => ({ name: ['frame start', 'early phase', 'late phase', 'final phase', 'frame end'][i], med, max: med })), total: steps.reduce((a, s) => a + s[1], 0) + phases.slice(1).reduce((a, b) => a + b, 0), backlog: phases[0] });

test('the goal is what this browser gives the page: Safari and iOS at most 60, not the 120 the engine budgets against', () => {
  assert.ok(isWebKit(SAFARI) && !isWebKit(CHROME));
  const g = goalOf({ maxHz: 60, ua: SAFARI });
  assert.equal(g.hz, 60); assert.match(g.why, /Safari gives web pages at most 60/);
  assert.equal(goalOf({ maxHz: 120, ua: CHROME }).hz, 120);
  assert.equal(goalOf({ maxHz: 0, ua: CHROME }).hz, 60, 'not measured yet: 60 assumed');
});

test('a GPU-bound Mac readout names the GPU step that takes the frame, in plain words, with its ms and a fix', () => {
  const goal = goalOf({ maxHz: 60, ua: SAFARI });
  const d = diagnose({ st: st({ fps: 28, p50: 35, s50: 2.1 }), goal, gpu: gpuOf([['present copy', 26, 33], ['blood pass', 4], ['glasses and labels', 2]], [3, 0.1, 0, 0, 0.2]), surfaces: [['stage', 1.2], ['labels', 0.4]], whole: { perFrame: 0, rate: 0, med: 0 } });
  assert.match(d.head, /^GPU-BOUND/);
  assert.match(d.head, /kept figure picture copied onto the screen canvas \("present copy"\) 26\.0 ms/);
  assert.equal(d.top.length, 3);
  assert.deepEqual(d.top.map((c) => c.name), ['present copy', 'blood pass', 'glasses and labels']);
  assert.match(d.fix, /figure pixel/);
});

test('whole vessel redraws are a cost of their own, spread over the frames, and a spike names its redraw and reason', () => {
  const goal = goalOf({ maxHz: 60, ua: SAFARI });
  const whole = { perFrame: 9, rate: 3, med: 90, worst: { ms: 163, why: 'radii changed' } };
  const d = diagnose({ st: st({ fps: 40, p50: 17, s50: 3 }), goal, gpu: gpuOf([['blood pass', 3]]), surfaces: [['stage', 2]], whole, worst: { gap: 170, cause: 'GPU whole vessel redraw (radii changed) 163.0 ms', fix: 'redraw only the vessels whose widths moved' } });
  assert.match(d.head, /^SPIKES: most frames are on time/);
  assert.match(d.head, /170\.0 ms frame: GPU whole vessel redraw \(radii changed\) 163\.0 ms/);
  assert.equal(d.top[0].name, 'whole vessel redraw');
  assert.match(d.fix, /widths moved/);
});

test('script-bound, held by the browser, at rest and hidden each read as such', () => {
  const goal = goalOf({ maxHz: 120, ua: CHROME });
  assert.match(diagnose({ st: st({ fps: 40, p50: 25, s50: 20 }), goal, gpu: gpuOf([['blood pass', 2]]), surfaces: [['charts', 14], ['stage', 4]] }).head, /^SCRIPT-BOUND.*charts 14\.0 ms/);
  const held = diagnose({ st: st({ fps: 30, p50: 33, s50: 2 }), goal: goalOf({ maxHz: 60, ua: SAFARI }), gpu: gpuOf([['blood pass', 3]]), surfaces: [['stage', 1]] });
  assert.match(held.head, /^HELD BY THE BROWSER/); assert.match(held.fix, /Low Power Mode/);
  assert.match(diagnose({ st: st({ n: 0 }), goal, idle: true }).head, /^AT REST/);
  assert.match(diagnose({ st: st(), goal, hidden: true }).head, /^PAGE HIDDEN/);
  assert.match(diagnose({ st: st({ fps: 118, p50: 8.4 }), goal, gpu: null, surfaces: [] }).head, /^OK: 118\.0 fps/);
});

test('the activity words: a view switch with its pieces ready, a glide, a menu, at rest', () => {
  assert.equal(activityText(0), 'at rest (nothing moving)');
  assert.equal(activityText(ACT.viewSwitch | ACT.camera, { ready: 4, of: 6 }), 'view switch (pieces ready 4 of 6)');
  assert.equal(activityText(ACT.glide | ACT.menu), 'camera glide + menu open');
  assert.match(activityText(ACT.camera), /camera moving \(hand\)/);
});

test('the physics row reads the worker\'s own counts per second, apart from the display probe', () => {
  const t = physicsText({ secs: 1, ticks: 30, steps: 7500, busy: 60, maxBusy: 4, maxGap: 40, late: 0, dropped: 0, frames: 10, params: 1, held: 0, samples: 24, days: 0, jobs: { sequence: 120 }, jobMs: 120, running: true, visible: true, ticking: true, clock: 'hemo', speed: 1, edges: 80 }, { n: 10, params: 1, jumps: 0 }).join('\n');
  assert.match(t, /30\.0 ticks\/s/); assert.match(t, /7500\.0 steps\/s/); assert.match(t, /states posted 10\.0\/s/); assert.match(t, /page received 10\.0\/s/); assert.match(t, /sequence 120 ms/);
  assert.match(physicsText(null)[0], /no answer yet/);
  assert.equal(plainStep('one-pass picture'), 'vessels + blood drawn in one pass (zoom or turn frames) ("one-pass picture")');
});

// A stand-in for the figure's context: a fence's call waits as long as `gpuMs` says (the GPU's queue), as Safari's does.
function fakeGl() {
  const g = { gpuMs: 0, SYNC_GPU_COMMANDS_COMPLETE: 1, isContextLost: () => false, flush() {}, deleteSync() {},
    fenceSync() { const t = performance.now() + g.gpuMs; while (performance.now() < t) { /* the GPU's queue */ } g.gpuMs = 0; return {}; } };
  return g;
}

test('a whole vessel redraw is timed on the GPU with its frame, at most one per EVENT_GAP_MS, and its wait is the readout\'s, not the page\'s', async () => {
  const gl = fakeGl();
  fence.setFenceContext(gl); fence.setFences(true);
  const seq0 = fence.wholeSeq();
  let wait = -1;
  await new Promise((done) => frameFor('test-draw')(() => {
    gl.gpuMs = 3; tally(counts.why, 'radii changed');   // (3 ms queued ahead of it)
    gl.gpuMs = 12; fence.fencePart('whole picture');    // (12 ms its own)
    tally(counts.why, 'radii changed');                 // (inside EVENT_GAP_MS: counted, not timed)
    setTimeout(() => { wait = fence.forcedWait(); done(); }, 0);
  }));
  const ev = fence.wholeEvents(seq0);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].why, 'radii changed'); assert.equal(ev[0].to, 'whole picture');
  assert.ok(ev[0].ms >= 11 && ev[0].before >= 2.5, `${ev[0].ms} ${ev[0].before}`);
  assert.ok(fence.wholeTally['radii changed'][0] >= 2 && fence.wholeTally['radii changed'][1] >= 1);
  assert.ok(wait === 0 || wait >= 14, 'the waits are kept as the frame\'s readout wait (cleared at the next frame)');
  fence.setFences(false); fence.setFenceContext(null);
});

test('the panel writes its summary and every row from frames run through the scheduler', async () => {
  const gl = fakeGl();
  fence.setFenceContext(gl);
  let n = 0;
  globalThis.pps = { host: { on() {}, request: async () => ({ secs: 1, ticks: 30, steps: 7500, busy: 30, maxBusy: 2, maxGap: 35, late: 0, dropped: 0, frames: 10, params: 0, held: 0, samples: 24, days: 0, jobs: {}, jobMs: 0, running: true, visible: true, ticking: true, clock: 'hemo', speed: 1, edges: 80 }) },
    stage: { viewChanging: () => true, gliding: () => false, morphStats: () => ({ gpu: 3, cpu: 1, miss: { 'not ready': 1 }, ready: 4, of: 6, failed: [] }) } };
  const el = hud.startFrameHud();
  const spin = () => frameFor('test-spin')(() => { if (++n % 20 === 0) tally(counts.why, 'radii changed'); if (n < 400) spin(); });
  spin();
  await new Promise((done) => setTimeout(done, 2300));
  const text = globalThis.pps.hud();
  el.stop(); fence.setFenceContext(null);
  for (const head of ['== WHY ==', 'NOW: view switch (pieces ready 4 of 6)', 'GOAL:', '== WORST FRAMES', '== PAGE (main thread) ==', 'PHYSICS WORKER', '== GPU', 'whole vessel redraws:', 'display probe']) assert.ok(text.includes(head), `${head} in:\n${text}`);
  assert.match(text, /7500\.0 steps\/s/);
});

test('the live organ layer\'s repaint is its own GPU step, in plain words, apart from the present copy (9 Nov 2026)', () => {
  const goal = goalOf({ maxHz: 60, ua: SAFARI });
  const d = diagnose({ st: st({ fps: 16, p50: 59, s50: 3 }), goal, gpu: gpuOf([['organ layer', 50, 60], ['present copy', 1], ['blood pass', 1]]), surfaces: [['stage', 1.9]], whole: { perFrame: 0, rate: 0, med: 0, worst: null }, worst: null, idle: false, hidden: false });
  assert.match(d.head, /live organs \(liver, spleen, diaphragm\) painted again at the figure's size \("organ layer"\) 50\.0 ms/);
  assert.equal(d.top[0].name, 'organ layer');
  assert.match(plainStep('organ layer'), /live organs/);
});

test('an organ layer repaint is counted with its reason, for the GPU section\'s "organ layer painted" line', () => {
  const n0 = counts.organ, r0 = counts.organWhy['live organ changed'] || 0;
  counts.organ++; tally(counts.organWhy, 'live organ changed');
  assert.equal(counts.organ, n0 + 1);
  assert.equal(counts.organWhy['live organ changed'], r0 + 1);
});
