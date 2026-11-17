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
const { diagnose, goalOf, activityText, ACT, physicsText, plainStep, isWebKit, loopText, lumenText } = hud;

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
  for (const head of ['== WHY ==', 'NOW: view switch (pieces ready 4 of 6)', 'GOAL:', '== WORST FRAMES', '== PAGE (main thread) ==', 'PHYSICS WORKER', '== GPU', 'whole vessel redraws:', 'display probe', 'figure loop: ', 'lobule loop: ', 'blood drawn by the tubes (lumen pass), figure:', 'after the script: the browser\'s rendering p50', 'DOM changes a second:', 'CSS animations:', 'webgl contexts:']) assert.ok(text.includes(head), `${head} in:\n${text}`);
  assert.match(text, /\d+ frames shown of the \d+ the goal gives in that time \(\d+ missed\)/);
  assert.doesNotMatch(text, /frames missed in 2 s/);
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

test('R3: a loop\'s line puts frames asked against frames drawn beside the browser\'s interval, and says who holds the page', () => {
  const kept = loopText('figure', 60, 60, 16.7, 60, 60);
  assert.match(kept, /^figure loop: asked for 60 frames\/s, drew 60\/s; the browser's frame interval 16\.7 ms \(page frames at 60 Hz, display probe 60 Hz\): keeping up/);
  const held = loopText('figure', 31, 31, 32.3, 31, 60);
  assert.match(held, /asked for 31 frames\/s, drew 31\/s.*32\.3 ms.*HELD BY THE GPU OR THE BROWSER.*31 of the display's 60/);
  const skipped = loopText('figure', 120, 60, 8.3, 120, 120);
  assert.match(skipped, /the APP skipped 60 frames\/s on purpose/);
  assert.match(loopText('lobule', 0, 0, 16, 60, 60), /^lobule loop: not asking for frames/);
});

test('R3: the lumen pass has its own GPU step, and a line with its strips, webs, rows, exact rows and join ends, from the sampled frame', () => {
  const gl = fakeGl();
  fence.setFenceContext(gl); fence.setFences(true);
  assert.deepEqual(fence.lumenSummary(), { figure: null, lobule: null });
  const feed = (a) => (out) => { for (let k = 0; k < a.length; k++) out[k] = a[k]; };
  fence.fenceFrame(1); fence.fenceLumen(false, feed([9, 9, 9, 9, 9]));   // (not a sampled frame: nothing kept)
  assert.equal(fence.lumenSummary().figure, null);
  fence.fenceFrame(30);   // (a sampled frame)
  fence.fencePart('before lumen pass'); fence.fencePart('lumen pass'); fence.fenceLumen(false, feed([41, 35, 76, 20, 12]));
  fence.fencePart('lobule lumen pass'); fence.fenceLumen(true, feed([156, 310, 156, 138, 90, 1.04, 0.5]));
  const l = fence.lumenSummary();
  assert.deepEqual(l.figure, { strips: 41, webs: 35, rows: 76, exact: 20, ended: 12, mp: 0, share: 0 });
  assert.deepEqual(l.lobule, { strips: 156, webs: 310, rows: 156, exact: 138, ended: 90, mp: 1.04, share: 0.5 });
  const line = lumenText('figure', l.figure, 4.25);
  assert.match(line, /blood drawn by the tubes \(lumen pass\), figure: 41 strips, 35 webs \(joins\), 76 rows of which 20 exact and 12 with a join end; GPU 4\.3 ms/);
  assert.match(lumenText('lobule', l.lobule, null), /156 strips.*with a join end; target 1\.04 MP at 0\.50 of the vessel layer's size$/);
  assert.match(lumenText('lobule', null, null), /not drawn on a sampled frame yet.*1 frame in 30/);
  assert.match(plainStep('lumen pass'), /^blood drawn by the tubes \(lumen pass\).*\("lumen pass"\)$/);
  fence.setFences(false); fence.setFenceContext(null);
  assert.deepEqual(fence.lumenSummary(), { figure: null, lobule: null });
});

test('R3: WHY picks the lumen pass when it is the largest GPU step, and says plainly that Safari\'s fences can hide a step', () => {
  const chrome = goalOf({ maxHz: 120, ua: CHROME });
  const d = diagnose({ st: st({ fps: 40, p50: 25, s50: 2 }), goal: chrome, gpu: gpuOf([['lumen pass', 18], ['blood pass', 3], ['heads', 1]]), surfaces: [['stage', 1]], whole: { perFrame: 0, rate: 0, med: 0, worst: null } });
  assert.match(d.head, /^GPU-BOUND.*Biggest: blood drawn by the tubes \(lumen pass\), the figure's \("lumen pass"\) 18\.0 ms/);
  assert.equal(d.top[0].name, 'lumen pass'); assert.match(d.fix, /second pass over the strips and webs/);
  // (Frames missed, script small, the sampled GPU small too: held by the browser, with the largest step named.)
  const safari = goalOf({ maxHz: 60, ua: SAFARI });
  const h = diagnose({ st: st({ fps: 30, p50: 33, s50: 2 }), goal: safari, gpu: gpuOf([['lumen pass', 9], ['blood pass', 1]]), surfaces: [['stage', 1]] });
  assert.match(h.head, /^HELD BY THE BROWSER.*largest GPU step sampled: blood drawn by the tubes \(lumen pass\).*9\.0 ms.*Safari's fences/);
  assert.match(h.fix, /lumen pass is a second pass/);
  const none = diagnose({ st: st({ fps: 30, p50: 33, s50: 2 }), goal: chrome, gpu: gpuOf([['blood pass', 0.5]]), surfaces: [['stage', 1]] });
  assert.doesNotMatch(none.head, /Safari/); assert.match(none.fix, /power saving/);   // (a small step is no cause: the browser advice stands)
});

test('view switch frames are sampled on the GPU apart from the rest (1 in BURST_EVERY while one runs), and the readout names their largest step (12 Nov 2026)', () => {
  const gl = fakeGl();
  fence.setFenceContext(gl); fence.setFences(true);
  let switching = false;
  fence.setFenceBurst(() => switching);
  const run = (frame, organMs) => {
    fence.fenceFrame(frame);
    gl.gpuMs = organMs; fence.fencePart('organ layer');
    for (let i = 1; i <= 4; i++) fence.fenceMark(i);
  };
  run(30, 1);                                   // (a rest sample: 1 in 30)
  assert.equal(fence.fenceBurstSummary(), null, 'no switch frame sampled yet');
  run(31, 50);                                  // (not a sample: neither 1 in 30 nor a switch)
  switching = true;
  run(32, 40); run(33, 40); run(34, 60);        // (32 and 34 are burst samples; 33 is not)
  switching = false;
  const b = fence.fenceBurstSummary(), r = fence.fenceSummary();
  assert.equal(b.n, 2); assert.equal(b.every, fence.BURST_EVERY);
  assert.ok(b.steps[0].name === 'organ layer' && b.steps[0].max >= 59, JSON.stringify(b.steps));
  assert.ok(b.maxTotal >= 59 && b.maxTotal < 200, `worst ${b.maxTotal}`);
  assert.equal(r.n, 1, 'the rest keeps its own sample');
  assert.ok(r.steps[0].med < 20, 'the rest\'s numbers are not the switch\'s');
  const sw = { frames: 40, gaps: 4000, worst: 268, ended: 1000, c: { draw: 1, composite: 2, whole: 0, organ: 0, blur: 0, why: {}, organWhy: {} }, d: { draw: 41, composite: 42, whole: 40, organ: 40, blur: 0, why: { 'no kept layer': 39 }, organWhy: { 'view moved': 40 } } };
  const t = hud.switchText(b, sw, 3000).join('\n');
  assert.match(t, /last view switch \(2\.0 s ago\): 40 frames in 4000\.0 ms, 100\.0 ms a frame, worst 268\.0 ms/);
  assert.match(t, /vessel draws 40 \(whole: no kept layer 39\)/);
  assert.match(t, /organ layer painted 40 \(view moved 40\)/);
  assert.match(t, /view switch frames on the GPU \(2 sampled, 1 in 2 while a switch runs\)/);
  assert.match(t, /largest steps: .*organ layer/);
  assert.match(hud.switchText(null, sw, 3000).join('\n'), /none sampled yet/);
  assert.deepEqual(hud.switchText(null, null, 0), []);
  fence.setFenceBurst(null); fence.setFences(false); fence.setFenceContext(null);
  assert.equal(fence.fenceBurstSummary(), null);
});

// 12 Nov 2026 (his Mac at rest: "present copy" 20 ms, "organ layer painted: 17 (page changed 17)"): the readout names which write made the
// organ layer paint again (netWho: the element and attribute netChanged found changed).
test('netChanged says which element and attribute changed', async () => {
  const { netChanged, netWho } = await import('../src/ui/idle-keys.js');
  const el = { nodeType: 1, getAttribute: (k) => (k === 'transform' ? 'scale(1.1)' : null) };
  assert.equal(netChanged([{ type: 'attributes', target: el, attributeName: 'transform', oldValue: 'scale(1)' }]), true);
  assert.equal(netWho.target, el); assert.equal(netWho.key, 'transform');
  netWho.target = null;
  assert.equal(netChanged([{ type: 'attributes', target: el, attributeName: 'transform', oldValue: 'scale(1.1)' }]), false);
  assert.equal(netWho.target, null, 'a write that left the value as it was names nobody');
});

// 15 Nov 2026, his Safari paste (8.4 fps, 15 ms of script, 4 ms of GPU, "127 ms not in script"): the readout's own errors, and the time after
// the script measured instead of guessed.
const frame = await import('../src/ui/frame.js');
const { missedOf, heldAtHalf, heldWords, cssAnimText, nodeName } = hud;

test('frames missed are the goal\'s frames in the time against the frames shown, never more than their own whole ("128 of 17")', () => {
  const gaps = Array(17).fill(2000 / 17);
  const m = missedOf(gaps, 1000 / 72);
  assert.deepEqual(m, { shown: 17, slots: 144, missed: 127 });
  assert.ok(m.missed < m.slots);
  assert.deepEqual(missedOf(Array(120).fill(1000 / 60), 1000 / 60), { shown: 120, slots: 120, missed: 0 });
  assert.deepEqual(missedOf([0, 0], 16.7), { shown: 0, slots: 0, missed: 0 });
});

test('the goal never passes the screen\'s rate by the display probe (72 fps seen once on a 60 Hz screen)', () => {
  const g = goalOf({ maxHz: 72, ua: SAFARI, probeHz: 60 });
  assert.equal(g.hz, 60); assert.match(g.why, /screen's own rate/);
  assert.equal(goalOf({ maxHz: 120, ua: CHROME, probeHz: 120 }).hz, 120);
  assert.equal(goalOf({ maxHz: 60, ua: SAFARI, probeHz: 30 }).hz, 60, 'a probe held low itself is no cap');
});

test('a slow cadence is read as itself, not as 30 Hz: frames 50 ms apart are 20 Hz', () => {
  assert.equal(frame.snapRate(20), 20);
  assert.equal(frame.snapRate(1000 / 90), 11);
  assert.equal(frame.snapRate(58), 60);
  assert.equal(frame.snapRate(31), 30);
  assert.equal(frame.refreshFrom(Array(40).fill(50)), 20);
  assert.equal(frame.refreshFrom(Array(40).fill(16.7)), 60);
});

test('Safari\'s hold at half the screen\'s rate is told from the frames\' spans: every one an even number of the screen\'s frames', () => {
  const held = heldAtHalf([33, 34, 67, 100, 33, 66, 33, 101, 134, 33], 60, 60);
  assert.deepEqual(held, { hz: 30, probe: 60, n: 10 });
  assert.match(heldWords(held), /every second refresh of the 60 Hz screen \(30 fps at most\).*Low Power Mode/);
  assert.equal(heldAtHalf([17, 33, 50, 17, 17, 84, 17, 33, 17, 17], 60, 60), null, 'frames on single refreshes: no hold');
  assert.equal(heldAtHalf([33, 50, 83, 117, 150, 50, 83, 117, 33, 50], 60, 60), null, 'odd counts of frames: the work, not a hold');
  assert.equal(heldAtHalf(Array(12).fill(16.7), 120, 60), null, 'Safari\'s 60 on a 120 Hz screen is its ceiling, not a hold');
  assert.equal(heldAtHalf([33, 67], 60, 60), null, 'too few frames to tell');
});

test('the verdict names the browser\'s rendering after the script when it fills the frame, and Safari\'s hold with how to check it', () => {
  const goal = goalOf({ maxHz: 60, ua: SAFARI, probeHz: 60 });
  const r = diagnose({ st: st({ fps: 9, p50: 102, s50: 15 }), goal, gpu: gpuOf([['present copy', 2]]), surfaces: [['stage', 6]], render: { p50: 60, wait: 27, n: 17 } });
  assert.match(r.head, /^BROWSER RENDERING: .*script takes 15\.0 ms and the browser's own rendering after it 60\.0 ms/);
  assert.match(r.fix, /DOM changes a second/);
  const h = diagnose({ st: st({ fps: 20, p50: 50, s50: 6 }), goal, gpu: gpuOf([['present copy', 2]]), surfaces: [['stage', 6]], render: { p50: 3, wait: 40, n: 17 }, held: { hz: 30, probe: 60, n: 20 } });
  assert.match(h.head, /^HELD BY SAFARI: .*every second refresh of the 60 Hz screen/);
  assert.match(h.fix, /Low Power Mode/); assert.match(h.fix, /Settings > Battery/);
  const w = diagnose({ st: st({ fps: 20, p50: 50, s50: 6 }), goal, gpu: gpuOf([['present copy', 2]]), surfaces: [['stage', 6]], render: { p50: 3, wait: 40, n: 17 } });
  assert.match(w.head, /^HELD BY THE BROWSER: .*rendering after it \(3\.0 ms\).*waits 40\.0 ms for the next/);
});

test('a surface with two callbacks in one frame counts one frame it ran in (the figure "asked for 19, drew 10" at 8.4 fps)', async () => {
  const t0 = frame.perf().totals;
  await new Promise((done) => {
    frame.frameFor('test-twice')(() => {});
    frame.lateFrameFor('test-twice')(() => {});
    frame.finalFrameFor('test-twice')(() => setTimeout(done, 0));
  });
  const t1 = frame.perf().totals;
  assert.equal((t1.asks['test-twice'] || 0) - (t0.asks['test-twice'] || 0), 3, 'three callbacks');
  assert.equal((t1.ran['test-twice'] || 0) - (t0.ran['test-twice'] || 0), 1, 'one frame');
  assert.ok('framesRan' in frame.perf());
});

test('the browser\'s rendering after a frame is measured by a message posted at the frame\'s end, for that frame', async () => {
  const got = [];
  const stop = frame.watchRender((fno, ms) => got.push([fno, ms]));
  const stopW = frame.watchFrames(() => {});
  let fno = 0;
  await new Promise((done) => frame.frameFor('test-render')(() => { fno = frame.frameCount(); setTimeout(done, 10); }));
  stop(); stopW();
  assert.equal(got.length, 1);
  assert.equal(got[0][0], fno); assert.ok(got[0][1] >= 0 && got[0][1] < 50, String(got[0][1]));
});

test('CSS animations off the compositor are named with their property and element; transform and opacity are not', () => {
  const el = { id: '', localName: 'i', classList: ['look-spin'] };
  const anim = (name, props, playState = 'running') => ({ playState, animationName: name, effect: { target: el, getKeyframes: () => [{ offset: 0, easing: 'linear', ...props }] } });
  assert.equal(cssAnimText({ getAnimations: () => [anim('pz-spin', { transform: 'none' })] }), '1 running, all on the compositor (transform, opacity)');
  assert.match(cssAnimText({ getAnimations: () => [anim('monAlarm', { backgroundColor: 'red' }), anim('x', { opacity: 1 }, 'paused')] }), /^1 running, 1 repainting their element every frame: monAlarm \(backgroundColor\) on i\.look-spin$/);
  assert.equal(cssAnimText({ getAnimations: () => [] }), 'none running');
  assert.equal(cssAnimText({}), 'not listed by this browser');
  assert.equal(nodeName({ id: 'stage' }), '#stage');
  const grp = { localName: 'g', classList: [], parentElement: { localName: 'g', classList: [], parentElement: { localName: 'g', id: 'ov-clamps', classList: [] } } };
  assert.equal(nodeName(grp), 'g in #ov-clamps', 'a bare group is named by its nearest named ancestor');
  assert.equal(nodeName({ localName: 'g', classList: ['halos'] }), 'g.halos');
});

// 17 Nov 2026, his Safari at rest ("present copy 16.0 ms, max 18.0" on every sample, every other step 0.0, a 1567x957 picture onto a 1567x957
// screen): a step that is one screen refresh long, every time, is a sync wait the fence times, and the readout says so instead of ranking it a cost.
test('a GPU step as long as one screen refresh on every sample is called a sync wait, not draw work', async () => {
  const { onBeat } = hud;
  const g60 = { ms: 1000 / 60 };
  assert.equal(onBeat({ med: 16.0, max: 18.0 }, g60), true);
  assert.equal(onBeat({ med: 33.0, max: 34.0 }, g60), true, 'two refreshes');
  assert.equal(onBeat({ med: 20.0, max: 21.0 }, g60), false, 'not on the beat');
  assert.equal(onBeat({ med: 16.0, max: 40.0 }, g60), false, 'a step that sometimes takes far longer is work');
  assert.equal(onBeat({ med: 18.0, max: 18.0 }, g60, 25), false, 'frames as long as the step: a GPU-bound frame, real work');
  assert.equal(onBeat({ med: 16.0, max: 18.0 }, g60, 8), true, 'frames at half the step: it cannot be work every frame');
  assert.equal(onBeat({ med: 4.0, max: 4.5 }, g60), false, 'a small step is never one');
  assert.equal(onBeat({ med: 8.0, max: 8.5 }, { ms: 1000 / 120 }), true, 'one refresh of a 120 Hz screen');
  const d = diagnose({ st: st({ fps: 126, p50: 8, s50: 0.5 }), goal: { hz: 60, ms: 1000 / 60 }, gpu: gpuOf([['present copy', 16, 18], ['fence floor', 0.0, 0.0], ['blood pass', 0]]), surfaces: [['stage', 0.6]], whole: { perFrame: 0, rate: 0, med: 0 } });
  assert.match(d.top[0].words, /sync wait, not draw work; a second fence straight after it read 0\.0 ms/);
  assert.ok(!d.top.some((c) => c.name === 'fence floor'), 'the fence probe is never ranked as a cost');
  assert.match(d.top[0].fix, /browser holding the canvas/);
});
