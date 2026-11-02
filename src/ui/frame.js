// One render scheduler for the whole app.
//
// Every surface (figure, glow, hover, lobule, sinusoid, charts, Doppler, FibroScan, pressure-time,
// presenter glides…) asks for its next frame here instead of calling requestAnimationFrame itself.
// All the callbacks asked for during one frame run together in a single browser frame, in the order
// they were asked, with the same timestamp: exactly what separate rAF calls would have done, so every
// loop keeps its own pacing, caps and idle stops. When nothing asks, no frame is requested at all and
// the browser can drop to its low-power state.
//
//   const raf = frameFor('lobule');   raf(cb) -> id (never 0)
//   cancelFrame(id)
//
// window.pps.perf (see perf()) reports callbacks per second for each surface over the last second.
// watchFrames(fn) hands fn every frame's timing (its interval, the script time, and each callback's surface, phase and ms): the
// ?perf readout's long-frame log and the frame-time gate (scripts/frame-gate.mjs) read frames there. Nothing is timed for it
// while nobody watches. perf().inputToPaint is the input-to-first-change measure (input-latency.js, premium-feel recs R2), made on
// its first read, so a page nobody measures has no listener for it.

import { gpuProbe } from './gpu-probe.js?v=625c2c9315';
import { createFrameRecorder } from './frame-stats.js?v=d41bb17a55';
import { createInputLatency, describeTarget } from './input-latency.js?v=3c0129b426';
let queue = new Map();   // id -> [tag, cb], in request order
let current = null;      // the batch running now
// Asked for with lateFrame: run after every other callback of the frame (one asked for while that frame's callbacks run still
// runs in it), so a surface that draws what the others set up (the figure's one render pass) draws their final state, once.
let late = new Map(), lateNow = null;
// Asked for with finalFrame: run after the late ones (the glass over the figure: every writer of the frame, the figure's own pass
// included, has run by then, so it is drawn once, over their final state).
let fin = new Map(), finalNow = null;
// Asked for with readFrame: run first in the next frame, before every other callback (1 Nov 2026, "Move everything to GPU": zero layout
// inside the frame). The page's layout is still the one the browser computed for the last frame, so a box read there costs nothing,
// where the same read after the frame's first writes forced a layout of the page. Read only: a callback asked for from one runs in the
// same frame (its early phase), after every read.
let reads = new Map(), readsNow = null;
let next = 1, pending = 0;
const counts = new Map(), rates = new Map(), draws = new Map(), drawRates = new Map(), totals = { asks: {}, drawn: {}, ms: {} };
let windowAt = 0, frames = 0, fps = 0, allFrames = 0;
// Frame watchers (watchFrames). `parts` is the running frame's callbacks (surface, phase, ms), kept only while someone watches.
// `chained`: the last frame asked for another, so the interval to this one is a frame time; `lastNow`: that frame's timestamp.
const watchers = new Set();
let parts = null, chained = false, lastNow = 0;

// A named piece of a surface's work (framePart), timed on its own only while frames are watched (the ?perf readout, the frame-time
// gate), so a long frame names what inside the surface took the time: phase 'in' (inside a callback: its time is also the surface's
// own) or 'outside' (run from a timer or an event, outside the scheduler: listed with the next frame, never in its script time).
let outsideParts = [];
export function framePart(tag, fn) {
  if (!watchers.size) return fn();
  const t0 = performance.now();
  try { return fn(); } finally {
    const e = [tag, parts ? 'in' : 'outside', performance.now() - t0];
    if (parts) parts.push(e); else if (outsideParts.length < 64) outsideParts.push(e);
  }
}

// (gpuProbe's named steps, stage.js's 'update: geometry', 'organ picture: draw' and the rest, are such pieces too.)
gpuProbe.part = framePart;

function flush(now) {
  pending = 0;
  paceStep();
  frames++; allFrames++;
  if (chained && lastNow && now > lastNow) noteGap(now - lastNow);
  frameT0 = performance.now();
  const watching = watchers.size > 0, t0 = watching ? performance.now() : 0;
  parts = watching ? outsideParts.splice(0) : null;
  if (reads.size) {
    readsNow = reads;
    reads = new Map();   // (asked for while they run: the next frame)
    try { run(readsNow, now, 'read'); } finally { readsNow = null; }
  }
  current = queue;
  queue = new Map();   // asked for while running: the next frame, as with requestAnimationFrame
  try {
    run(current, now, 'early');
    lateNow = late;
    late = new Map();   // asked for while the late ones run: the next frame
    run(lateNow, now, 'late');
    finalNow = fin;
    fin = new Map();    // (likewise)
    run(finalNow, now, 'final');
  } finally { current = null; lateNow = null; finalNow = null; }
  const script = watching ? performance.now() - t0 : 0;
  lastScript = performance.now() - frameT0; frameT0 = 0;
  overLast = lastScript > WATCH_SHARE * frameBudget();
  if (FPS_LOG) logOverrun(now, lastScript, parts);
  globalThis.__frameProbe?.(now);   // (the tests read the camera here, once every frame has been drawn)
  roll(now);
  if (watching) {
    const f = { now, gap: chained ? now - lastNow : 0, script, parts };
    for (const w of watchers) try { w(f); } catch (e) { setTimeout(() => { throw e; }); }
  }
  parts = null; lastNow = now;
  if ((queue.size || late.size || fin.size || reads.size || FPS_FORCE) && !pending && !(FPS_FORCE && document.hidden)) pending = requestAnimationFrame(flush);
  chained = !!pending;
}

function run(batch, now, phase) {
  for (const [id, [tag, cb]] of batch) {
    batch.delete(id);
    if (phase === 'early' && shedding(tag)) { queue.set(id, [tag, cb]); continue; }   // (carried to the next frame: see the watchdog)
    counts.set(tag, (counts.get(tag) || 0) + 1); totals.asks[tag] = (totals.asks[tag] || 0) + 1;
    const t0 = performance.now();
    try { if (gpuProbe.on) gpuProbe.time(null, `${tag} (script)`, () => cb(now)); else cb(now); } catch (e) { setTimeout(() => { throw e; }); }   // one surface's error never stops the others
    const ms = performance.now() - t0;
    totals.ms[tag] = (totals.ms[tag] || 0) + ms;
    parts?.push([tag, phase, ms]);
  }
}

/** Calls fn({ now, gap, script, parts }) after every frame the scheduler runs (frame-stats.js has the shape). Returns the stop. */
export function watchFrames(fn) { watchers.add(fn); return () => watchers.delete(fn); }
/** The frames the scheduler has run since the page opened (a stamp for "once a frame"). */
export const frameCount = () => allFrames;

// ── The display's refresh and the frame budget (120 Hz recs, P1; 2 Nov 2026, Mohammad: "make this game engine 120hz") ──
// The rate the browser offers the page, told from the intervals of frames that ran one after another (the lower quartile of the last
// 240, nearest of the rates screens run at: a late frame in Safari is followed by a short one, so the shortest ones lie). Until it is
// known the budget is 120 Hz's. screen.refreshRate (a few browsers have it) is taken as the panel's own rate when it is given.
export const REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
/** The refresh rate (Hz) closest to the lower quartile of `dts` (frame intervals, ms), or 0 with too few to tell. */
export function refreshFrom(dts) {
  const v = dts.filter((d) => d > 2 && d < 100).sort((a, b) => a - b);
  if (v.length < 20) return 0;
  const hz = 1000 / v[Math.floor(v.length / 4)];
  return REFRESH_RATES.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
}
const gapRing = new Float32Array(240);
let gapN = 0, gapAt = 0, hzNow = 0, hzMax = 0, hzAt = 0;
function noteGap(dt) {
  gapRing[gapAt] = dt; gapAt = (gapAt + 1) % gapRing.length; if (gapN < gapRing.length) gapN++;
  if (++hzAt >= 30) { hzAt = 0; hzNow = refreshFrom(Array.from(gapRing.subarray(0, gapN))); if (gapN >= 120) hzMax = Math.max(hzMax, hzNow); }
}
/** The refresh the browser offers the page now (Hz; 0 until enough frames have run). */
export const refreshHz = () => hzNow;
/** The highest refresh seen offered on this page (Hz): the panel can do at least this, so less now is a throttle. */
export const refreshMaxHz = () => Math.max(hzMax, +globalThis.screen?.refreshRate || 0);
/** The intervals of the last frames that ran one after another (ms, oldest first). */
export const recentGaps = () => { const a = Array.from(gapRing.subarray(0, gapN)); return gapN < gapRing.length ? a : [...a.slice(gapAt), ...a.slice(0, gapAt)]; };
/** One frame's time at the refresh offered (ms): 8.3 at 120 Hz (and until the refresh is known), 16.7 at 60. */
export const frameBudget = () => 1000 / (hzNow || 120);

// ── The frame-time watchdog (recs P3): a frame's main-thread work is held to its budget ──
// Locked (the default): once the frame's script has used WATCH_SHARE (70 %) of the budget, the surfaces that do not draw the moving
// picture (the credit's art, the timeline, the dock's strip, edges, the inspector and the like: DEFERRABLE) are carried to the next
// frame instead of run in this one, up to SHED_MAX frames in a row each, so none starves. surfaces that can drop detail ask
// overBudget(): true when the last frame went over the share. Balanced: shed only past the whole budget. Quality: never (full detail
// whatever the frame time). ?perfmode=locked|balanced|quality chooses (and is kept); ?watchdog=0 never sheds.
export const PERF_MODES = ['locked', 'balanced', 'quality'];
const WATCHDOG = !(typeof location !== 'undefined' && /[?&]watchdog=0\b/.test(location.search || ''));
export const WATCH_SHARE = 0.7;
const SHED_MAX = 3;
export const DEFERRABLE = new Set(['credit', 'timeline', 'scroll-edges', 'inspector', 'dock', 'figkey', 'scale select', 'menu-profile', 'menu', 'vitals-monitor', 'main', 'debug', 'perf readout']);
let perfModeNow = 'locked';
try {
  const q = typeof location !== 'undefined' ? /[?&]perfmode=(locked|balanced|quality)\b/.exec(location.search || '')?.[1] : null;
  if (q) { perfModeNow = q; localStorage.setItem('pps.perfMode', q); } else { const v = localStorage.getItem('pps.perfMode'); if (PERF_MODES.includes(v)) perfModeNow = v; }
} catch { /* storage unavailable */ }
/** The performance mode: 'locked' (hold the refresh, shed what can wait), 'balanced' or 'quality'. */
export const perfMode = () => perfModeNow;
export function setPerfMode(m) { if (!PERF_MODES.includes(m)) return; perfModeNow = m; try { localStorage.setItem('pps.perfMode', m); } catch { /* storage unavailable */ } }
let frameT0 = 0, lastScript = 0, overLast = false;
const shedRun = new Map();
let shedTotal = 0;
/** True when the last frame's script went over 70 % of the budget (Locked and Balanced; never in Quality): drop detail that can wait. */
export const overBudget = () => WATCHDOG && perfModeNow !== 'quality' && overLast;
/** The last frame's main-thread script time (ms), and how many callbacks the watchdog has carried over since the page opened. */
export const watchdogStats = () => ({ last: lastScript, shed: shedTotal, mode: perfModeNow, budget: frameBudget() });
function shedding(tag) {
  if (!WATCHDOG || perfModeNow === 'quality' || !frameT0 || !DEFERRABLE.has(tag)) { if (shedRun.size) shedRun.delete(tag); return false; }
  const share = perfModeNow === 'locked' ? WATCH_SHARE : 1;
  const n = shedRun.get(tag) || 0;
  if (n >= SHED_MAX || performance.now() - frameT0 < share * frameBudget()) { shedRun.delete(tag); return false; }
  shedRun.set(tag, n + 1); shedTotal++;
  return true;
}

// ── ?fps=120 (recs, quick win 1): frames asked for every refresh while the page shows, and every overrun logged ──
// The scheduler keeps its chain alive (no idle stop), and each frame whose interval passed 1.5 refreshes, or whose script passed the
// budget, is written to the console with the surfaces that ran in it (largest first). A measuring aid: it keeps the page drawing.
const FPS_Q = typeof location !== 'undefined' ? /[?&]fps=(\d+)\b/.exec(location.search || '') : null;
export const FPS_FORCE = !!FPS_Q;
const FPS_LOG = !!FPS_Q;
const FPS_HZ = FPS_Q ? +FPS_Q[1] || 120 : 0;
let fpsUnwatch = null, fpsPrev = 0;
if (FPS_LOG) fpsUnwatch = watchFrames(() => {});   // (a watcher on, so every frame's surfaces are timed for the log)
function logOverrun(now, script, list) {
  const per = 1000 / Math.max(FPS_HZ, hzNow || 0, 1), gap = chained && fpsPrev ? now - fpsPrev : 0;
  fpsPrev = now;
  if (gap <= 1.5 * per && script <= per) return;
  const top = (list || []).slice().sort((a, b) => b[2] - a[2]).slice(0, 5).map(([t, ph, ms]) => `${t} (${ph}) ${ms.toFixed(1)}`).join(', ');
  console.warn(`[fps] overrun at ${(now / 1000).toFixed(2)} s: interval ${gap.toFixed(1)} ms, script ${script.toFixed(1)} ms (budget ${per.toFixed(1)} ms at ${Math.round(1000 / per)} Hz)${top ? `: ${top}` : ''}`);
}
export const fpsLogOn = () => !!fpsUnwatch;

// Closes the per-second window once a second has passed (also when perf() is read, so a page whose surfaces all stopped
// asking reports zero rather than its last busy second).
function roll(now) {
  if (now - windowAt < 1000) return;
  const span = now - windowAt;
  rates.clear();
  for (const [tag, n] of counts) rates.set(tag, Math.round(n * 1000 / span));
  drawRates.clear();
  for (const [tag, n] of draws) drawRates.set(tag, Math.round(n * 1000 / span));
  fps = Math.round(frames * 1000 / span);
  counts.clear(); draws.clear(); frames = 0; windowAt = now;
}

export function frame(cb, tag = 'other') {
  const id = next++;
  queue.set(id, [tag, cb]);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

/** As frame(), but run before every other callback of the next frame, while the layout is still the last frame's (see `reads`). */
export function readFrame(cb, tag = 'other') {
  const id = next++;
  reads.set(id, [tag, cb]);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

/** As frame(), but run after every other callback of its frame (see `late`). */
export function lateFrame(cb, tag = 'other') {
  const id = next++;
  late.set(id, [tag, cb]);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

/** As lateFrame(), but run after the late ones too (see `fin`). */
export function finalFrame(cb, tag = 'other') {
  const id = next++;
  fin.set(id, [tag, cb]);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

// Like cancelAnimationFrame: also stops a callback of the running frame that has not run yet.
export function cancelFrame(id) {
  if (id && !queue.delete(id) && !late.delete(id) && !fin.delete(id) && !reads.delete(id) && !readsNow?.delete(id) && !current?.delete(id) && !lateNow?.delete(id)) finalNow?.delete(id);
}

/** Where the scheduler is now: 'early' (the frame's first callbacks), 'late', 'final', or null (outside a frame). A surface asked to
 *  draw while the early ones run can leave it to its own late callback, which still runs in this frame, and so draw once in it. */
// ── The eases' clock (1 Nov 2026, Mohammad: "the cards start popping in instead of smoothing in eased") ──
// An ease timed by the wall clock jumps over a long frame: a 900 ms crossfade begun just before a 400 ms frame shows its first half
// in one step, and a zoom leaps ahead by the frame's length. easeNow() runs with the wall clock while frames come promptly, and
// moves on by at most PACE_CAP ms (or twice the usual interval, see paceStep) from one frame to the next, so after a long frame an ease timed by it carries on from where the
// screen last showed it instead of landing past it. The total time runs a little longer by what the long frames held back. Monotonic,
// in performance.now()'s timebase while nothing has been held back. ?paced=0: the wall clock itself, as before.
export const PACE_CAP = 50;
export const PACED = !(typeof location !== 'undefined' && /[?&]paced=0\b/.test(location.search || ''));
// (Only a frame long against the ones before it is held back: the cap is twice the usual interval of the last frames that ran one
// after another, PACE_CAP at least and PACE_MAX at most, so a device that draws a slow scene at 10 frames a second keeps its eases at
// their own speed, and only its sudden long frames are smoothed over.)
export const PACE_MAX = 1000;   // (a software renderer's frames, a second apart, run at their own speed)
let paceReal = 0, paceBase = 0, paceCap = PACE_CAP;
const paceGaps = [];
const wall = () => performance.now();
// ── One honest clock (recs_cgpt R20, 2 Nov 2026) ── easeNow() is the wall clock, one time per frame (every surface of a frame reads
// the same), never held back: a long frame shows the ease where the wall clock puts it, so a transition ends when its own duration
// says and the deferred work's holds (holdMotion, which run on the wall clock) agree with what is on screen. What a paced clock would
// have hidden is still counted (clockStats: long frames, ms it would have held back), so a jump is reported, not smoothed over.
// Transitions own their state (beginMotion → end): deferrable work waits for the real end, not a timer's guess, with a bounded
// recovery (MOTION_MAX_MS) for a transition that never says it ended. ?honestclock=0: the paced clock, as before.
export const HONEST = !(typeof location !== 'undefined' && /[?&]honestclock=0\b/.test(location.search || ''));
export const clockStats = { frames: 0, long: 0, lostMs: 0, worstMs: 0, transitions: 0, overdue: 0, lastMs: 0, lastName: '' };
function paceStep() {
  const t = wall();
  if (!paceReal) { paceReal = paceBase = t; return; }
  const gap = Math.max(0, t - paceReal);
  if (HONEST) {
    clockStats.frames++;
    if (gap > paceCap) { clockStats.long++; clockStats.lostMs += gap - paceCap; clockStats.worstMs = Math.max(clockStats.worstMs, gap); }
    paceBase = paceReal = t;
    if (chained) {
      paceGaps.push(gap); if (paceGaps.length > 9) paceGaps.shift();
      const m = [...paceGaps].sort((a, b) => a - b)[paceGaps.length >> 1];
      paceCap = Math.min(PACE_MAX, Math.max(PACE_CAP, 2 * m));
    }
    return;
  }
  paceBase += Math.min(gap, paceCap); paceReal = t;
  if (chained) {
    paceGaps.push(gap); if (paceGaps.length > 9) paceGaps.shift();
    const m = [...paceGaps].sort((a, b) => a - b)[paceGaps.length >> 1];
    paceCap = Math.min(PACE_MAX, Math.max(PACE_CAP, 2 * m));
  }
}
/** The eases' clock (ms): performance.now() while frames come promptly, held to PACE_CAP ms of progress from frame to frame. */
export function easeNow() {
  if (!PACED) return wall();
  const t = wall();
  if (!paceReal) { paceReal = paceBase = t; return t; }
  if (current || lateNow || finalNow || readsNow) return paceBase;   // (one time for every surface in a frame, as the frame's timestamp is)
  if (HONEST) return t;
  return paceBase + Math.min(Math.max(0, t - paceReal), paceCap);
}
// A move on screen that a long frame would spoil (the slide's cards fading in, a dive landing): work that can wait (a sharper
// picture painted ahead, the anatomy's raster under the lobule, the lobule's preparation pieces) waits until it is over.
let holdUntil = 0;
/** Keeps deferrable work out of the next `ms` (the longest of the holds asked for wins). */
export function holdMotion(ms) { if (PACED) holdUntil = Math.max(holdUntil, wall() + ms); }
export const MOTION_MAX_MS = 5000;
const moving = new Map();   // (transition token → { name, t0, until })
/** A transition begins: deferrable work waits until the returned end() is called (or MOTION_MAX_MS passes, counted as overdue). */
export function beginMotion(name = 'move', maxMs = MOTION_MAX_MS) {
  if (!HONEST) return () => {};
  const tok = {}, t0 = wall();
  moving.set(tok, { name, t0, until: t0 + maxMs });
  clockStats.transitions++;
  return () => { if (!moving.delete(tok)) return; clockStats.lastMs = wall() - t0; clockStats.lastName = name; };
}
function anyMoving(t) {
  for (const [tok, m] of moving) if (t >= m.until) { moving.delete(tok); clockStats.overdue++; }
  return moving.size > 0;
}
/** True while a move asked to be left alone (holdMotion), or a transition begun with beginMotion has not ended. */
export const inMotion = () => { const t = wall(); return t < holdUntil || (HONEST && moving.size > 0 && anyMoving(t)); };
/** Calls fn once no move holds the page (polled with timers, never a frame loop); returns a cancel. */
export function afterMotion(fn, poll = 60) {
  let t = 0, dead = false;
  const go = () => { t = 0; if (dead) return; if (inMotion()) t = setTimeout(go, Math.max(poll, holdUntil - wall())); else fn(); };
  go();
  return () => { dead = true; clearTimeout(t); };
}

export const framePhase = () => (finalNow ? 'final' : lateNow ? 'late' : current ? 'early' : readsNow ? 'read' : null);

export const frameFor = (tag) => (cb) => frame(cb, tag);
export const readFrameFor = (tag) => (cb) => readFrame(cb, tag);
export const lateFrameFor = (tag) => (cb) => lateFrame(cb, tag);
export const finalFrameFor = (tag) => (cb) => finalFrame(cb, tag);

// A surface that paces itself (asks every frame, draws only some) notes each frame it really drew, for perf().drawn.
export function noteDraw(tag) { draws.set(tag, (draws.get(tag) || 0) + 1); totals.drawn[tag] = (totals.drawn[tag] || 0) + 1; }

// Per-surface callbacks per second over the last full second, the frames each pacing surface really drew in it,
// which surfaces wait for a frame, and the running totals of both since the page opened (for checks over any span;
// totals.frames: the browser frames the scheduler ran, so a surface's draws can be held against the frames on offer;
// totals.ms: the main-thread time each surface's callbacks took, in ms: CPU time issuing work, not the GPU's own time).
export function perf() {
  roll(performance.now());
  return { fps, surfaces: Object.fromEntries(rates), drawn: Object.fromEntries(drawRates), totals: { asks: { ...totals.asks }, drawn: { ...totals.drawn }, ms: { ...totals.ms }, frames: allFrames }, waiting: [...new Set([...queue.values(), ...late.values(), ...fin.values()].map(([t]) => t))],
    get inputToPaint() { return inputMeasure(); }, frames: frameRecording };
}

// Input to first change (input-latency.js; recs R2): the time from a tap, a press or a key to the frame in which the page first
// changed, kept for the last 200 inputs. perf().inputToPaint.summary() / .entries(since) / .slowest(). Browser only, and made on the
// first read of it (the ?perf readout, the frame-time gate), or at load with ?perf or ?inputs in the address (below): a page nobody
// measures has no listener for it.
let inputLatency = null;
function inputMeasure() {
  if (!inputLatency && typeof addEventListener === 'function' && typeof MutationObserver === 'function' && typeof document !== 'undefined') {
    inputLatency = createInputLatency({
      listen: (type, fn) => addEventListener(type, fn, { capture: true, passive: true }),
      watch: (onChange) => {
        let mo = null;
        return {
          start() { if (!mo) { mo = new MutationObserver(onChange); mo.observe(document, { subtree: true, attributes: true, childList: true, characterData: true }); } },
          stop() { mo?.disconnect(); mo = null; },
        };
      },
      ask: (fn) => finalFrame(fn, 'input'),
      ignore: (n) => !!(n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('#perfReadout, [data-perf-ignore]'),
      describe: describeTarget,
    }).api;
  }
  return inputLatency;
}

// (Asked for in the address, ?perf or ?inputs, it is made now, at load, before the presenter and the rest add their own window key
// listeners: a key one of them uses stops at its listener (stopImmediatePropagation), and a tracker made later never sees it.)
if (typeof location !== 'undefined' && /[?&](perf|inputs)(?=[=&#]|$)/.test(location.search || '')) inputMeasure();

// Frame recording (recs R5): perf().frames.start() records every frame the scheduler runs; .stop() returns the recording's raw
// numbers (frame-stats.js: intervals, script times, each surface's ms in each frame it ran in, each phase's) and the long frames.
// The frame-time gate (scripts/frame-gate.mjs) judges these. Nothing is timed while it is not recording.
const recorder = createFrameRecorder();
let stopRecording = null;
const frameRecording = {
  start() { recorder.reset(); stopRecording ||= watchFrames(recorder.add); },
  stop() { stopRecording?.(); stopRecording = null; return { ...recorder.raw(), long: recorder.long.slice() }; },
};

// Battery saver (no longer in Settings, 20 Oct; kept for tests): the anatomy's blood, the lobule, the sinusoid and the FibroScan
// move at 15 frames a second at a lower resolution. Each surface reads it every frame; stage.setSaver() sets it.
// Otherwise nothing is paced: steady motion (the blood and flow, a glide toward values that keep moving, an instrument's
// sweep or speckle) is drawn on every frame the screen offers, 60, 120 or more a second. Motion follows elapsed time,
// never the number of frames, so a faster screen shows the same speeds in more steps.
// (No longer a Setting, 20 Oct: always off. A value an older build stored is dropped.)
try { localStorage.removeItem('pps.saver'); } catch { /* storage unavailable */ }
let saverOn = false;
export const saver = () => saverOn;
export function setSaver(on) { saverOn = !!on; }
// (Battery saver's pacing: a little under 67 ms, so a frame lands on the screen's next refresh, not the one after.)
export const SAVER_MS = 1000 / 15 - 4;
// Render resolution (Settings, 29 Oct, an experiment): the figure's canvases (the anatomy's vessels, organs, blood and glows on
// the GPU, the lobule and the sinusoid) are drawn at this share of their usual pixels, and the browser scales them up. Words
// (labels, cards, the instruments' readings) are not on those canvases and stay sharp. 1 (Full) changes nothing.
// 'auto' (30 Oct): the anatomy follows its zoom (stage.js autoScale), 100% zoomed out down to 10% zoomed in; the lobule and the
// sinusoid stay at Full.
export const RENDER_SCALES = ['auto', 1, 0.75, 0.5, 0.25];
let renderK = 1;
try { const t = localStorage.getItem('pps.renderScale'), v = t === 'auto' ? t : +t; if (RENDER_SCALES.includes(v)) renderK = v; } catch { /* storage unavailable */ }
const renderSubs = new Set();
/** The chosen setting: 'auto' or a fixed share. */
export const renderSetting = () => renderK;
/** The fixed share of the pixels (1 under Auto, which only the anatomy applies, by its zoom). */
export const renderScale = () => (renderK === 'auto' ? 1 : renderK);
export function setRenderScale(k) {
  if (!RENDER_SCALES.includes(k) || k === renderK) return;
  renderK = k;
  try { if (k === 1) localStorage.removeItem('pps.renderScale'); else localStorage.setItem('pps.renderScale', String(k)); } catch { /* storage unavailable */ }
  for (const f of renderSubs) f(k);
}
/** Called with the new scale each time Settings changes it (and each time one of the options below changes). */
export function onRenderScale(f) { renderSubs.add(f); return () => renderSubs.delete(f); }
// The figure's further resolution options (30 Oct, experiments, all off until chosen; the anatomy's canvas only, stage.js):
// move: the share while the view moves (a pinch, a pan, a glide), Full again once it has settled; 1 = off.
// glow: the share the glow layers (an organ's soft glow, a lit organ's warm edge) are drawn at, the vessels and organs at Full.
// cap: the most megapixels the canvas holds (a big screen draws fewer, a phone is under it); 0 = off. 8 by default since 1 Nov 2026 (the
//   GPU move, step 4: a pixel budget): every laptop, iPad and phone is under it, a 16-inch MacBook's whole screen too (7.7), so none of
//   them changes; only a large external screen (a 5K one, 14.7) draws fewer pixels than its full density, and its heat with them.
// floor: the lowest share Auto goes to (10%, 25% or 50%).
// adapt: after each move, one step lower if the frames came slowly, one step back up when they came at the screen's pace.
export const FIG_OPTS = { move: [1, 0.75, 0.5, 0.25], glow: [1, 0.5, 0.25], cap: [8, 0, 4, 2], adapt: [false, true], floor: [0.1, 0.25, 0.5] };
const figOpts = { move: 1, glow: 1, cap: 8, adapt: false, floor: 0.1 };
for (const k of Object.keys(figOpts)) {
  try { const t = localStorage.getItem(`pps.fig.${k}`), v = t === 'true' ? true : +t; if (t != null && FIG_OPTS[k].includes(v)) figOpts[k] = v; } catch { /* storage unavailable */ }
}
export const figOpt = (k) => figOpts[k];
export function setFigOpt(k, v) {
  if (!FIG_OPTS[k]?.includes(v) || figOpts[k] === v) return;
  figOpts[k] = v;
  try { if (v === FIG_OPTS[k][0]) localStorage.removeItem(`pps.fig.${k}`); else localStorage.setItem(`pps.fig.${k}`, String(v)); } catch { /* storage unavailable */ }
  for (const f of renderSubs) f(renderK);
}
// Figure performance (30 Oct, Round 3 of the review, each off until chosen; Settings › Figure performance). Unlike the options above,
// none of these changes the canvas's size, so a change is told only to its own listeners (onFigLab), never to the resolution's.
// motion60: steady motion (the blood, the lobule, the sinusoid, the instruments) is drawn at most about 60 times a second on a faster
//   screen; pans and zooms stay at the screen's rate. A 60 Hz screen draws as before.
// glassCache: the callouts' GPU glass keeps each callout's box, fade and shadow until something says they changed (glass-gl.js).
// creditLean: in Present, the corner credit's once-a-second look runs only when the layout may have changed (credit.js). ON by default since
//   31 Oct (laptop heat H7): the look measures every card and label, and in Present it ran every second whatever had happened.
// pinchReuse: while a hand zooms, all but one in 2 (2) or in 3 (3) of the one-pass zoom frames lay the last shaded picture again,
//   moved and scaled to the view now (veins-gl.js reuseDraw); a zoom out, which uncovers the edges, is shaded every frame.
// upscale: under Full, the anatomy's canvas stays at Full and the figure, drawn at its share into the renderer's own buffer, is upscaled
//   onto it by a sharper filter than the browser's (veins-gl.js UP_FS). The lobule and the sinusoid are not included.
// lymphBoxes: in the lobule with the GPU's vessels, the lymph's layer is cleared and drawn again only in the tiles its drops left or
//   reached, while nothing else on it changed (lobule-zoom.js lyKey).
// lightArt: the colon's and small bowel's lines with about half their points, none more than 0.05 units off (stage.js syncArtLite).
// pinchLow: a zoom frame under a hand draws the vessel layer at PINCH_LOW_K of its width and height and stretches it; the view a
//   pinch stops at is drawn at Full (veins-gl.js lowPass). Pinch frame reuse, when on, takes those frames instead.
// (The first of a switch's values is its default.)
export const FIG_LAB = { motion60: [false, true], glassCache: [false, true], creditLean: [true, false], lymphBoxes: [false, true], pinchReuse: [0, 2, 3], upscale: [false, true], lightArt: [false, true], pinchLow: [false, true] };
const figLabs = Object.fromEntries(Object.entries(FIG_LAB).map(([k, v]) => [k, v[0]]));
for (const k of Object.keys(figLabs)) {
  try { const t = localStorage.getItem(`pps.fig.${k}`), v = t === 'true' ? true : t === 'false' ? false : +t; if (t != null && FIG_LAB[k].includes(v)) figLabs[k] = v; } catch { /* storage unavailable */ }
}
const labSubs = new Set();
export const figLab = (k) => figLabs[k];
export function setFigLab(k, v) {
  if (!FIG_LAB[k]?.includes(v) || figLabs[k] === v) return;
  figLabs[k] = v;
  try { if (v === FIG_LAB[k][0]) localStorage.removeItem(`pps.fig.${k}`); else localStorage.setItem(`pps.fig.${k}`, String(v)); } catch { /* storage unavailable */ }
  for (const f of labSubs) f(k, v);
}
/** Called with (key, value) each time one of the Figure performance switches changes. */
export function onFigLab(f) { labSubs.add(f); return () => labSubs.delete(f); }
// (Motion at 60: a frame of steady motion is skipped when the last was drawn under 10 ms ago. A 120 Hz screen's frames come 8.3 ms
// apart, so every other one is drawn; a 60 Hz screen's 16.7 ms, so all of them, as before; a 90 Hz screen's 11.1 ms, all of them.)
export const MOTION60_MS = 10;
/** Vessels lower while pinching: the share of the layer's width and height (0.71: half its pixels). */
export const PINCH_LOW_K = 0.71;
/** The least time between two drawn frames of steady motion: 0 (every frame) unless Battery saver or Motion at 60 is on. */
export const paceMs = () => (saverOn ? SAVER_MS : figLabs.motion60 ? MOTION60_MS : 0);
