// The vitals monitor's strip through a disease time-lapse (a year in ten seconds with the model's beat parked) and the easing after it.
// The strip used to stall and jump there; now it scrolls on its own clock and lays beats at the heart rate shown, landing on the live beat.
// No browser: a fake page and a fake clock, frames made as the worker makes them, and the strip's polyline read back from a recording 2D context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { createBeatClock, beatWalk, walkBeats, seedBeats } from '../src/ui/ekg.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── the helpers on their own ──
test('walkBeats lays beats that close in as the rate climbs, and brings the beat to the phase the model resumes at', () => {
  const times = [], w = beatWalk(0, 0.4, 68);
  const secs = 10, dt = 1 / 60;
  for (let s = 0; s < secs; s += dt) walkBeats(w, dt, 68 + 21 * (s / secs), times, { ph: 0.15, left: secs - s });
  assert.ok(times.length >= 10 && times.length <= 13, `${times.length} beats in ten seconds at 68 to 89 a minute`);
  assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]), 'in order');
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps[0] > gaps.at(-1) + 0.08, `the beats close in: ${gaps[0].toFixed(2)} s first, ${gaps.at(-1).toFixed(2)} s last`);
  assert.ok(gaps.every((g) => g > 0.55 && g < 1.0), `no gap far from the rate: ${gaps.map((g) => g.toFixed(2))}`);
  const err = Math.abs(((w.ph - 0.15 + 1.5) % 1) - 0.5);
  assert.ok(err < 0.03, `ends ${err.toFixed(3)} of a beat from the phase the model resumes at`);
  assert.ok(Math.abs(w.x - secs) < 0.02, 'the walk is the time it was given');
});

test('walkBeats steers by a third of the rate at most, and does not steer without a target', () => {
  const free = [], pulled = [], a = beatWalk(0, 0.1, 60), b = beatWalk(0, 0, 60);
  for (let i = 0; i < 100; i++) { walkBeats(a, 0.02, 60, free); walkBeats(b, 0.02, 60, pulled, { ph: 0.5, left: 2 - i * 0.02 }); }
  assert.ok(Math.abs(a.ph - 0.1) < 1e-6 && free.length === 2, `free: two seconds at 60 a minute is two beats, got ${free.length}`);
  assert.ok(Math.abs(b.ph - 0.5) < 0.03, `pulled to the half-way phase: ${b.ph.toFixed(3)}`);
  assert.ok(pulled.every((t, i) => i === 0 || t - pulled[i - 1] > 0.6), 'and no beat comes close on the last');
  const c = beatWalk(0, 0, 60); walkBeats(c, 0.5, 60, [], { ph: 0.5, left: 0.5 });
  assert.ok(c.ph - 0.5 <= 0.5 / 3 + 1e-9 + 0.0001 || c.ph < 0.5 + 0.0001, `a short wait takes a third of the rate at most: ${c.ph}`);
  const d = beatWalk(0, 0, 60); walkBeats(d, 0.3, 60, [], { ph: NaN, left: NaN });
  assert.ok(Math.abs(d.ph - 0.3) < 1e-9, 'no target, no steering');
});

test('seedBeats lays steady beats in front of the first, back to the window\'s edge', () => {
  const times = [10];
  const n = seedBeats(times, 0.8, 4.5);
  assert.ok(n >= 7 && times[0] <= 4.5 + 1e-9, `${n} beats, the first at ${times[0]}`);
  assert.ok(times.every((t, i) => i === 0 || Math.abs(t - times[i - 1] - 0.8) < 1e-9 || i === n), 'a steady period');
  assert.equal(seedBeats([], 0.8, 0), 0, 'nothing to start from, nothing laid');
});

test('the beat clock keeps its beats in order and can start a new run', () => {
  const c = createBeatClock();
  c.push(0, 0.9); c.push(0.1, 0.05);
  assert.equal(c.times.length, 1);
  c.restart();
  c.push(5, 0.95); c.push(5.1, 0.1);
  assert.equal(c.times.length, 2, 'a new run after a gap');
  assert.ok(c.times[1] > c.times[0]);
  c.restart(); c.push(0.05, 0.9); c.push(0.12, 0.02);
  assert.equal(c.times.length, 2, 'a beat that would come before the last is not laid');
});

// ── the monitor against a fake page ──
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
  getContext() { return (this.ctx ??= fakeCtx(this.rec)); }
  remove() {}
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
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

/** The worker's frames: the model running (4 ms samples, a frame about every 33 ms), parked on a frozen beat (a time-lapse, an easing), then running on. */
function* scenario({ lapse = true, ease = true, live0 = 5, hr0 = 68, hr1 = 89, secs = 10, after = 6, snapT = 3 } = {}) {
  const m = { t: 10, cyc: 0.3 };
  const run = function* (n, hr) {
    for (let f = 0; f < n; f++) {
      const t = [], ph = [];
      for (let k = 0; k < 8; k++) { t.push(m.t); ph.push(ph1(m.cyc)); m.t += 0.004; m.cyc += (hr / 60) * 0.004; }
      yield { running: true, clock: 'hemo', speed: 1, morphing: false, metrics: { hr, map: 80, co: 6 }, phase: ph1(m.cyc), samples: { t, ph } };
    }
  };
  yield* run(Math.round(live0 * 30), hr0);
  if (lapse) {
    const t0 = m.t, p0 = ph1(m.cyc), n = Math.round(secs * 30);
    for (let i = 0; i < n; i++) {
      const hr = hr0 + (hr1 - hr0) * (i / (n - 1));
      yield { running: true, clock: 'disease', speed: 36.5, morphing: false, metrics: { hr }, phase: p0, parkSecs: Math.max(0, secs - i / 30), samples: { t: [t0], ph: [p0] } };
    }
  }
  if (ease) {
    yield* run(5, hr1);
    const p0 = ph1(m.cyc);
    for (let i = 0; i < 18; i++) yield { running: true, clock: 'hemo', speed: 1, morphing: true, metrics: { hr: hr1 }, phase: p0, parkSecs: Math.max(0, 0.6 - i / 30), samples: null };
    // (The end state's own clock is put in as the easing ends, the model steps on a few frames, and the presenter restores the state once more:
    // the model's time goes back by what it stepped, and the beat's phase goes on, as engine.restore leaves it.)
    m.t = snapT;
    yield* run(2, hr1);
    m.t = snapT;
  }
  yield* run(Math.round(after * 30), lapse || ease ? hr1 : hr0);
}

/** Play a scenario at 60 draws a second (a frame every other draw), reading the strip after every draw. */
function play(opts, setup) {
  const v = createVitalsMonitor();
  v.configure({ kind: 'vitals', show: ['hr', 'map', 'co'] });
  const cv = canvasOf(v.el);
  setup?.(v);
  const draws = [], g = scenario(opts);
  let done = false;
  for (let i = 0; !done; i++) {
    now += 1000 / 60;
    const frame = i % 2 === 0;   // (a frame every other draw; the strip is read after the draw that follows a frame)
    if (frame) { const f = g.next(); if (f.done) done = true; else { cv.rec.strip = null; v.update(f.value); draws.push({ at: now, phase: f.value.clock === 'disease' ? 'lapse' : f.value.morphing ? 'ease' : 'live' }); } }
    const q = queue; queue = []; for (const fn of q) fn(now);
    if (frame && !done) { const d = draws.at(-1); d.peaks = peaksOf(cv.rec.strip); }
  }
  v.dispose();
  return draws;
}

for (const [snapT, where] of [[3, 'back'], [500, 'forward']]) test(`through the year-long time-lapse every beat on the strip scrolls at one steady speed, with no stall, jump or restart at either end, the model's clock set ${where} as the easing ends`, () => {
  const draws = play({ snapT });
  assert.ok(draws.length > 600, `${draws.length} frames`);
  let checked = 0;
  for (let i = 1; i < draws.length; i++) {
    const a = draws[i - 1], b = draws[i], dt = (b.at - a.at) / 1000, shift = dt * PX_S;
    for (const s of a.peaks) {
      const x = PAD + EW - s * PX_S, want = x - shift;   // (where this beat should be now, in px)
      if (want < PAD + 6 || s < 0.15) continue;   // (leaving at the left, or only just arriving at the head)
      checked++;
      const near = b.peaks.some((s2) => Math.abs(PAD + EW - s2 * PX_S - want) <= 1.0);
      assert.ok(near, `frame ${i} (${b.phase}): the beat ${s.toFixed(2)} s back did not move on by ${shift.toFixed(2)} px`);
    }
  }
  assert.ok(checked > 1500, `${checked} beat positions followed`);
});

test('the beats on the strip keep to the heart rate shown through the time-lapse and land on the live beat, with no gap or crowded beat', () => {
  const draws = play({});
  const gapsOf = (d) => d.peaks.slice(1).map((s, i) => s - d.peaks[i]);
  const at = (k) => draws.find((d, i) => d.phase === 'lapse' && draws.slice(0, i).filter((e) => e.phase === 'lapse').length >= k);
  const early = gapsOf(at(60)), late = gapsOf(at(280));
  assert.ok(early.length >= 4 && late.length >= 4, 'a strip of beats all through');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(early) > mean(late) + 0.08, `the beats close in as the number climbs: ${mean(early).toFixed(2)} s apart, then ${mean(late).toFixed(2)} s`);
  assert.ok(mean(early) > 0.76 && mean(early) < 0.9, `early: 68 to 74 a minute is 0.8 to 0.88 s a beat, got ${mean(early).toFixed(2)}`);
  assert.ok(mean(late) > 0.64 && mean(late) < 0.75, `late: 86 to 89 a minute is about 0.68 s a beat, got ${mean(late).toFixed(2)}`);
  let worst = [1, 0];
  for (const d of draws) for (const g of gapsOf(d)) { worst = [Math.min(worst[0], g), Math.max(worst[1], g)]; }
  assert.ok(worst[0] > 0.55 && worst[1] < 1.0, `every gap between beats, from the first frame to the last, is a plausible one: ${worst.map((x) => x.toFixed(2))}`);
  assert.ok(draws.at(-1).peaks.length >= 7, 'and the strip is full at the end');
});

test('a time-lapse opening on an empty strip is given its window of the steady state it starts from; an easing is not', () => {
  const cut = (opts) => [...scenario(opts)];
  const first = (opts, n) => { const v = createVitalsMonitor(); v.configure({ kind: 'vitals', show: ['hr', 'map', 'co'] }); const cv = canvasOf(v.el); const fs = cut(opts); let p = []; for (const f of fs.slice(0, n)) { v.update(f); now += 17; const q = queue; queue = []; for (const fn of q) fn(now); p = peaksOf(cv.rec.strip); } v.dispose(); return p; };
  const lapsed = first({ live0: 0 }, 3);
  assert.ok(lapsed.length >= 5, `a window of beats from the first frame: ${lapsed.length}`);
  assert.ok(lapsed.slice(1).every((s, i) => Math.abs(s - lapsed[i] - 60 / 68) < 0.1), 'at the rate the time-lapse starts from');
  const eased = (() => {
    const v = createVitalsMonitor(); v.configure({ kind: 'vitals', show: ['hr', 'map', 'co'] }); const cv = canvasOf(v.el);
    for (let i = 0; i < 6; i++) { v.update({ running: true, clock: 'hemo', speed: 1, morphing: true, metrics: { hr: 70 }, phase: 0.4, parkSecs: 0.5, samples: null }); now += 17; const q = queue; queue = []; for (const fn of q) fn(now); }
    v.dispose(); return peaksOf(cv.rec.strip);
  })();
  assert.equal(eased.length, 0, 'nothing is made up while a state eases in on a strip with nothing on it');
});

test('the strip with an easing and no time-lapse also scrolls on through the easing', () => {
  const draws = play({ lapse: false });
  let checked = 0;
  for (let i = 1; i < draws.length; i++) {
    const a = draws[i - 1], b = draws[i], shift = ((b.at - a.at) / 1000) * PX_S;
    if (b.phase !== 'ease' && a.phase !== 'ease') continue;
    for (const s of a.peaks) {
      const want = PAD + EW - s * PX_S - shift;
      if (want < PAD + 6 || s < 0.15) continue;
      checked++;
      assert.ok(b.peaks.some((s2) => Math.abs(PAD + EW - s2 * PX_S - want) <= 1.0), `frame ${i}: a beat jumped during the easing`);
    }
  }
  assert.ok(checked > 20, `${checked} positions followed through the easing`);
});

test('the wiring: the frame says how long the model stands still, a time-lapse ends a history under way, a strip that ran on its own is not backfilled', () => {
  const core = read('../src/worker-core.js'), vm = read('../src/ui/vitals-monitor.js'), ekg = read('../src/ui/ekg.js');
  assert.match(core, /parkSecs: parkSecs\(\),/, 'every frame carries it');
  assert.match(core, /lapse\(\{ days, speed: s, ramp, bedside \}\) \{\s+endHistory\(false\);/, 'a time-lapse cancels the history of the state it leaves');
  assert.match(vm, /if \(f\.clock === 'disease' \|\| f\.morphing\) \{ if \(f\.running && !synth\) startSynth\(head\); return; \}/, 'a parked model sends the strip onto its own clock');
  assert.match(vm, /if \(synth\) return synth\.w\.x - LAG_S;/, 'the head follows that clock, not the days a second');
  assert.match(vm, /\|\| synth \|\| synthed \|\| off\) return false;/, 'a strip that ran on its own keeps its beats');
  assert.doesNotMatch(vm, /lastT = -Infinity; firstT = Infinity; off = 0; \}\s+\/\/ \(the model's clock went back/, 'a clock that was set does not wipe the strip');
  assert.match(vm, /off = lastT \+ \(s\.t\.length > 1 \? s\.t\[1\] - s\.t\[0\] : STEP_S\) - s\.t\[0\];/, 'it moves the strip\'s time on instead');
  assert.match(vm, /clock\.restart\(\);/, 'the live beats start a new run');
  assert.match(ekg, /restart\(\) \{ prevT = prevPh = NaN; \}/);
});
