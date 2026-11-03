// The EKG strips keep ONE continuous sweep (Mohammad, 2 Nov 2026: "the EKG monitors everywhere with time lapse or changing conditions just reset
// in place and look like they are not moving"). A state change used to hold the vitals and beat-by-beat cards, clear their strips and fill the
// window again from the new state's steady beats; the beat chart also wiped itself on every day of a time-lapse, set its time back with a
// restored state, and stopped at its last sample while the model's clock stood still for an easing.
// No browser: a fake page and a fake clock, frames made as the worker makes them, the strip's polyline read back from a recording context.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CanvasObserver } from './canvas-observer.js';
import { createBeatClock } from '../src/ui/ekg.js';
import { createFreewheel } from '../src/ui/freewheel.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ph1 = (c) => c - Math.floor(c);

// ── the freewheel on its own ──
const KEYS = ['P', 'Q'];
/** A record of a steady heart at `bpm`: samples every 20 ms, a pressure P that peaks once a beat, the beat clock fed from them. */
function record(bpm, secs) {
  const fine = { t: [], ph: [], P: [], Q: [] }, clock = createBeatClock();
  for (let t = 0; t < secs; t += 0.02) {
    const ph = ph1((t * bpm) / 60);
    fine.t.push(t); fine.ph.push(ph); fine.P.push(10 + 5 * Math.sin(2 * Math.PI * ph)); fine.Q.push(1 + ph); clock.push(t, ph);
  }
  return { fine, clock };
}
function push(fine, clock, o) {
  for (let i = 0; i < o.t.length; i++) { fine.t.push(o.t[i]); fine.ph.push(o.ph[i]); fine.P.push(o.P[i]); fine.Q.push(o.Q[i]); clock.push(o.t[i], o.ph[i]); }
}

test('the freewheel lays the last beat over the wait, in step with the wall clock, the beats closing in with the rate, and lands on the phase the model resumes at', () => {
  const { fine, clock } = record(70, 8), w = createFreewheel(KEYS);
  const lastReal = fine.t.at(-1), beats0 = clock.times.length;
  let now = 1000, head = lastReal - 0.12;
  const park = 2.4, resume = 0.35;
  let first = true;
  for (let s = 0; s < park; s += 1 / 60) {
    now += 1000 / 60;
    const lastT = fine.t.at(-1);
    const o = w.advance(now, fine, clock.times, lastT, first ? head : 0, 0.12, 70 + 30 * (s / park), resume, park - s);
    first = false;
    if (o) push(fine, clock, o);
  }
  assert.ok(w.on && w.laid, 'it is running and has laid beats');
  // it keeps the data the lag ahead of the head, which has moved on by the wall time
  assert.ok(Math.abs(w.head() - (head + park)) < 0.03, `the head moved ${(w.head() - head).toFixed(2)} s in ${park} s`);
  assert.ok(Math.abs(fine.t.at(-1) - (w.head() + 0.12)) < 0.035, 'and the record runs the lag ahead of it');
  assert.ok(fine.t.every((t, i) => i === 0 || t > fine.t[i - 1]), 'in order');
  assert.ok(fine.P.every(Number.isFinite) && fine.Q.every(Number.isFinite), 'every value finite');
  assert.ok(Math.max(...fine.P) <= 15.01 && Math.min(...fine.P) >= 4.99, 'the values stay within the beat replayed');
  const newBeats = clock.times.slice(beats0 - 1), gaps = newBeats.slice(1).map((t, i) => t - newBeats[i]);
  assert.ok(gaps.length >= 2, `${gaps.length} beats laid in ${park} s`);
  assert.ok(gaps.every((g) => g > 0.55 && g < 1.0), `plausible gaps: ${gaps.map((g) => g.toFixed(2))}`);
  assert.ok(gaps[0] > gaps.at(-1) - 0.001, 'the beats close in as the rate climbs');
  const err = Math.abs(((fine.ph.at(-1) - resume + 1.5) % 1) - 0.5);
  assert.ok(err < 0.06, `ends ${err.toFixed(3)} of a beat from the phase the model resumes at`);
  // landing: the freewheel is let go and the live samples follow
  w.land();
  assert.ok(!w.on && !w.laid);
});

test('the beat replayed moves up with the model\'s readings as they change, glided, and starts from where it was', () => {
  const { fine, clock } = record(70, 8), w = createFreewheel(KEYS);
  let now = 1000, first = true;
  const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const lvl = [20, 3];
  const before = meanOf(fine.P.slice(-40));
  for (let s = 0; s < 3; s += 1 / 60) {
    now += 1000 / 60;
    lvl[0] = 20 + 6 * Math.min(1, s / 2); lvl[1] = 3;
    const o = w.advance(now, fine, clock.times, fine.t.at(-1), first ? fine.t.at(-1) - 0.12 : 0, 0.12, 70, NaN, NaN, lvl);
    first = false;
    if (o) push(fine, clock, o);
  }
  const after = meanOf(fine.P.slice(-60));
  assert.ok(after - before > 4.5 && after - before < 7, `the pressure rose ${(after - before).toFixed(2)} for a reading that rose 6`);
  const q = meanOf(fine.Q.slice(-60)), q0 = meanOf(fine.Q.slice(100, 160));
  assert.ok(Math.abs(q - q0) < 0.2, 'a reading that did not move leaves its trace where it was');
  assert.ok(Math.abs(fine.P[fine.t.findIndex((t) => t > 8.0)] - fine.P[fine.t.findIndex((t) => t > 8.0) - 1]) < 2, 'no step at the start');
});

test('the freewheel has nothing to replay without a whole beat on the record, and makes nothing then', () => {
  const w = createFreewheel(KEYS), fine = { t: [0, 0.1], ph: [0.1, 0.2], P: [1, 1], Q: [1, 1] };
  assert.equal(w.advance(1000, fine, [], 0.1, 0, 0.12, 70, NaN, NaN), null);
  assert.ok(!w.on);
});

// ── the beat chart against a fake page ──
let now = 1000, queue = [];
performance.now = () => now;
globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.window.devicePixelRatio = 1;
const TOKENS = { '--mon-bg': '#050608', '--mon-text': '#9aa4ad', '--mon-bright': '#7cf08c', '--mon-alarm': '#ff5a4d', '--mon-grid': '#1c232a', '--text': '#222222', '--bg': '#ffffff', '--muted': '#667788' };
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: (n) => TOKENS[n] ?? '#808080' });
globalThis.document.styleSheets = [{ cssRules: [{ style: Object.keys(TOKENS) }] }];
function fakeCtx(rec) {
  const state = {};
  let path = [];
  const fns = {
    beginPath: () => { path = []; },
    moveTo: (x, y) => path.push({ x, y }),
    lineTo: (x, y) => path.push({ x, y }),
    stroke: () => { if ((state.lineWidth === 1.6 || state.lineWidth === 1.5) && path.length > 8) rec.strip = path.slice(); },
    measureText: (s) => ({ width: String(s).length * 7 }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    isPointInStroke: () => false,
  };
  return new Proxy(state, { get: (t, k) => (k in fns ? fns[k] : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 420; this.offsetParent = {}; this.parent = null; this.rec = { strip: null };
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
  closest(sel) { return sel.includes('.pz-tool') ? SLIDE : null; }
  getBoundingClientRect() { return { width: 420, height: 230, left: 0, top: 0 }; }
  testPen() { return this.getContext(); }
  getContext() { return (this.ctx ??= fakeCtx(this.rec)); }
  remove() {}
}
const SLIDE = new Node('div');
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = CanvasObserver;   // (canvases report their box as a browser's observer does: tests/canvas-observer.js)
const { createPressureTime } = await import('../src/ui/pressure-time.js');
await Promise.resolve();
const canvasOf = (el) => (function find(n) { for (const k of n.kids || []) { if (k.tag === 'canvas') return k; const r = find(k); if (r) return r; } return null; })(el);

/** The strip's R peaks: seconds before its head, newest first is not needed; as the x of each peak in px. */
function peaksOf(strip) {
  if (!strip) return [];
  const ys = strip.map((p) => p.y), lo = Math.min(...ys), hi = Math.max(...ys), cut = lo + (hi - lo) * 0.25, out = [];
  for (let i = 0, from = -1; i < strip.length; i++) {
    const high = strip[i].y < cut;
    if (high && from < 0) from = i;
    if (!high && from >= 0) { let m = from; for (let k = from; k < i; k++) if (strip[k].y < strip[m].y) m = k; out.push(strip[m].x); from = -1; }
  }
  return out;
}

/** The worker's frames: the model running, then parked for an easing (no samples, parkSecs counting down, the beat's phase it resumes at), then running on
 *  with its clock set to `snapT` as the easing ends and (optionally) a new day. */
function* scenario({ live0 = 6, hr0 = 70, hr1 = 96, park = 1.6, after = 4, snapT = 3, dayAfter = 0, lapse = false } = {}) {
  const m = { t: 20, cyc: 0.3 };
  const run = function* (n, hr, day = 0) {
    for (let f = 0; f < n; f++) {
      const t = [], ph = [], P = [];
      for (let k = 0; k < 8; k++) { t.push(m.t); ph.push(ph1(m.cyc)); P.push(10 + 5 * Math.sin(2 * Math.PI * ph1(m.cyc))); m.t += 0.004; m.cyc += (hr / 60) * 0.004; }
      yield { running: true, clock: 'hemo', speed: 1, morphing: false, day, t: m.t, metrics: { hr, whvp: 15, fhvp: 5, hvpg: 10, pv: 18 }, phase: ph1(m.cyc), samples: { t, ph, whvp: P, RHV: P, CONF: P } };
    }
  };
  yield* run(Math.round(live0 * 30), hr0);
  const p0 = ph1(m.cyc), n = Math.round(park * 30);
  for (let i = 0; i < n; i++) yield { running: true, clock: 'hemo', speed: 1, morphing: true, day: 0, t: m.t, metrics: { hr: hr0 + (hr1 - hr0) * (i / (n - 1)), whvp: 15, fhvp: 5, hvpg: 10, pv: 18 }, phase: p0, parkSecs: Math.max(0, park - i / 30), samples: null };
  m.t = snapT;
  yield* run(Math.round(after * 30), hr1, dayAfter);
  if (lapse) {
    // (A time-lapse: a year in a few seconds on the disease clock, the beat parked, the days running and the heart rate climbing; then the model runs on.)
    const t0 = m.t, p1 = ph1(m.cyc), n = Math.round(lapse * 30);
    for (let i = 0; i < n; i++) yield { running: true, clock: 'disease', speed: 36.5, morphing: false, day: 10 + i * 4, t: t0, metrics: { hr: hr1 + 20 * (i / (n - 1)), whvp: 15 + i / 10, fhvp: 5, hvpg: 10 + i / 10, pv: 18 }, phase: p1, parkSecs: Math.max(0, lapse - i / 30), samples: { t: [t0], ph: [p1] } };
    yield* run(Math.round(after * 30), hr1 + 20, 10 + n * 4);
  }
}

function play(opts) {
  const pt = createPressureTime();
  pt.configure({ kind: 'trace', range: 'beats' }, null);
  const cv = canvasOf(pt.el);
  const draws = [], g = scenario(opts);
  let done = false;
  for (let i = 0; !done; i++) {
    now += 1000 / 60;
    const frame = i % 2 === 0;
    if (frame) { const f = g.next(); if (f.done) done = true; else { cv.rec.strip = null; pt.update(f.value); draws.push({ at: now, phase: f.value.morphing ? 'park' : f.value.clock === 'disease' ? 'lapse' : 'live' }); } }
    const q = queue; queue = []; for (const fn of q) fn(now);
    if (frame && !done) draws.at(-1).peaks = peaksOf(cv.rec.strip);
  }
  pt.dispose();
  return draws;
}

for (const [snapT, dayAfter, where] of [[3, 0, 'back'], [500, 0, 'forward'], [3, 400, 'back on a new day']]) test(`the beat chart's EKG strip sweeps on through an easing and the model's clock set ${where}: no stall, jump or restart`, () => {
  const draws = play({ snapT, dayAfter });
  assert.ok(draws.length > 300, `${draws.length} frames`);
  const parked = draws.filter((d) => d.phase === 'park');
  assert.ok(parked.every((d) => d.peaks.length >= 3), 'the strip is full of beats all through the easing, never empty');
  assert.ok(draws.slice(-10).every((d) => d.peaks.length >= 3), 'and after it');
  let checked = 0;
  for (let i = 1; i < draws.length; i++) {
    const a = draws[i - 1], b = draws[i];
    if (a.phase === 'live' && b.phase === 'live' && i < 100) continue;   // (the plain running, before anything is parked, has its own test elsewhere)
    // The strip scrolls left at one speed: the same beats are found again, shifted by the same px (a few px of give for the lag the frames glide).
    const shifts = [];
    for (const x of a.peaks) { const near = b.peaks.filter((x2) => x2 < x + 0.5 && x2 > x - 40); if (near.length) shifts.push(x - near.reduce((p, q) => (Math.abs(q - (x - 6)) < Math.abs(p - (x - 6)) ? q : p))); }
    if (!shifts.length) continue;
    checked++;
    const med = shifts.sort((p, q) => p - q)[shifts.length >> 1];
    assert.ok(med > 0, `frame ${i} (${b.phase}): the strip stood still or ran back (${med.toFixed(1)} px)`);
    assert.ok(med < 14, `frame ${i} (${b.phase}): the strip jumped ${med.toFixed(1)} px`);
  }
  assert.ok(checked > 200, `${checked} frames followed`);
});

test('a slide\'s beat card stays as it is through a time-lapse: its strip sweeps on in the same place, and carries on after it with no restart', () => {
  const draws = play({ lapse: 3 });
  const lapse = draws.filter((d) => d.phase === 'lapse');
  assert.ok(lapse.length > 80, `${lapse.length} frames of the time-lapse`);
  assert.ok(lapse.every((d) => d.peaks.length >= 3), 'the strip is full of beats all through the time-lapse');
  const first = draws.findIndex((d) => d.phase === 'lapse'), end = draws.length - 1;
  let checked = 0;
  for (let i = first; i <= end; i++) {   // (from the first frame of the time-lapse: the card's layout does not change under the strip)
    const a = draws[i - 1], b = draws[i];
    const shifts = [];
    for (const x of a.peaks) { const near = b.peaks.filter((x2) => x2 < x + 0.5 && x2 > x - 40); if (near.length) shifts.push(x - near.reduce((p, q) => (Math.abs(q - (x - 6)) < Math.abs(p - (x - 6)) ? q : p))); }
    if (!shifts.length) continue;
    checked++;
    const med = shifts.sort((p, q) => p - q)[shifts.length >> 1];
    assert.ok(med > 0 && med < 14, `frame ${i} (${b.phase}): the strip moved ${med.toFixed(1)} px`);
  }
  assert.ok(checked > 150, `${checked} frames followed through the time-lapse and after it`);
});

test('the wiring: the EKG cards are not held, cleared or refilled by a change of state; the beat chart keeps its beats through days and clock changes', () => {
  const tools = read('../src/ui/presenter-tools.js'), pt = read('../src/ui/pressure-time.js');
  assert.match(tools, /const SWEEPS = \['beats', 'vitals'\];/);
  assert.doesNotMatch(tools, /for \(const k of RECORDS\) made\[k\]\?\.restart/, 'a held state restarts nothing that sweeps');
  assert.doesNotMatch(pt, /if \(f\.day !== dayNow\) \{ clearHemo\(\)/, 'a day of a time-lapse does not wipe the beats');
  assert.doesNotMatch(pt, /if \(smp\.t\[0\] < lastT - 1e-9\) clearHemo\(\);/, 'a clock that was set does not wipe them either');
  assert.match(pt, /record\(smp, off\);/, 'the trace\'s time is moved on instead');
  assert.match(pt, /setRange\(clock === 'disease' && !beatCardNow\(\) \? 'days' : userRange\);/, 'a slide\'s beat card keeps its layout through a time-lapse');
  assert.match(pt, /if \(wheel\.on\) return wheel\.head\(\);/, 'and the head follows the freewheel while the model stands still');
  assert.match(pt, /off \|\| wheel\.laid\) return false;/, 'a strip that went on by itself is not backfilled');
});
