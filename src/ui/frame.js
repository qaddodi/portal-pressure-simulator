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

import { gpuProbe } from './gpu-probe.js';
import { createFrameRecorder } from './frame-stats.js';
import { createInputLatency, describeTarget } from './input-latency.js';
import { caught } from './caught.js';
// A batch of asked-for callbacks, in request order (plan "Holding 120 Hz, always" rev 2 §2.8: zero allocation on the frame path). Three
// parallel arrays that keep their length from frame to frame, so an ask writes three slots and allocates nothing, and running a batch
// walks it by index (the Map of [tag, cb] pairs it replaces made one array per ask and one entry array per callback run). A cancelled
// or run slot is emptied (cb null) and skipped; clear() empties the batch for its next use as a spare.
class Batch {
  constructor() { this.ids = new Array(64).fill(0); this.tags = new Array(64).fill(null); this.cbs = new Array(64).fill(null); this.n = 0; this.size = 0; }
  add(id, tag, cb) { const i = this.n++; this.ids[i] = id; this.tags[i] = tag; this.cbs[i] = cb; this.size++; }
  delete(id) {
    for (let i = this.n - 1; i >= 0; i--) if (this.ids[i] === id) { if (!this.cbs[i]) return false; this.cbs[i] = null; this.tags[i] = null; this.size--; return true; }
    return false;
  }
  clear() { for (let i = 0; i < this.n; i++) { this.cbs[i] = null; this.tags[i] = null; } this.n = 0; this.size = 0; }
  /** The tags of the callbacks still waiting (perf().waiting; not on the frame path). */
  waitingTags(into) { for (let i = 0; i < this.n; i++) if (this.cbs[i]) into.add(this.tags[i]); return into; }
}
let queue = new Batch();   // in request order
let current = null;      // the batch running now
// Asked for with lateFrame: run after every other callback of the frame (one asked for while that frame's callbacks run still
// runs in it), so a surface that draws what the others set up (the figure's one render pass) draws their final state, once.
let late = new Batch(), lateNow = null;
// Asked for with finalFrame: run after the late ones (the glass over the figure: every writer of the frame, the figure's own pass
// included, has run by then, so it is drawn once, over their final state).
let fin = new Batch(), finalNow = null;
// Asked for with readFrame: run first in the next frame, before every other callback (1 Nov 2026, "Move everything to GPU": zero layout
// inside the frame). The page's layout is still the one the browser computed for the last frame, so a box read there costs nothing,
// where the same read after the frame's first writes forced a layout of the page. Read only: a callback asked for from one runs in the
// same frame (its early phase), after every read.
let reads = new Batch(), readsNow = null;
let next = 1, pending = 0;
let spareQ = new Batch(), spareL = new Batch(), spareF = new Batch(), spareR = new Batch();
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
export function framePart(tag, fn, a, b, c) {
  if (!watchers.size) return fn(a, b, c);
  const t0 = performance.now();
  try { return fn(a, b, c); } finally {
    const e = [tag, parts ? 'in' : 'outside', performance.now() - t0];   // alloc-rare: only while frames are watched (the ?perf readout, the gates): the early return above skips it
    if (parts) parts.push(e); else if (outsideParts.length < 64) outsideParts.push(e);
  }
}

// (gpuProbe's named steps, stage.js's 'update: geometry', 'organ picture: draw' and the rest, are such pieces too.)
gpuProbe.part = framePart;

// (An error thrown by a callback is raised again from a timer of its own, so one surface's error never stops the others. One function for
// all the places that catch; the closure is made only when something threw.)
function rethrow(e) {
  setTimeout(() => { throw e; });   // alloc-rare: only when a callback or a watcher threw
}

function flush(now) {
  const taskT0 = performance.now();
  pending = 0;
  paceStep();
  frames++; allFrames++;
  if (chained && lastNow && now > lastNow) noteGap(now - lastNow);
  frameT0 = performance.now();
  const watching = watchers.size > 0, t0 = watching ? performance.now() : 0;
  parts = watching ? outsideParts.splice(0) : null;
  timeFrame = watching || TIME_ALL || allFrames % TIME_EVERY === 0;
  // (Each queue swaps with its spare, emptied as it ran: no new batch a frame (plan "Holding 120 Hz" §3.1). A batch is emptied as it runs,
  // and one cut short by a throw is cleared before it becomes the spare.)
  if (reads.size) {
    readsNow = reads;
    reads = spareR.size ? new Batch() : spareR;   // (asked for while they run: the next frame)
    try { run(readsNow, now, 'read'); } finally { readsNow.clear(); spareR = readsNow; readsNow = null; }
  }
  current = queue;
  queue = spareQ.size ? new Batch() : spareQ;   // asked for while running: the next frame, as with requestAnimationFrame
  try {
    run(current, now, 'early');
    lateNow = late;
    late = spareL.size ? new Batch() : spareL;   // asked for while the late ones run: the next frame
    run(lateNow, now, 'late');
    finalNow = fin;
    fin = spareF.size ? new Batch() : spareF;    // (likewise)
    run(finalNow, now, 'final');
    if (finals.size) for (const w of finals) try { w(now); } catch (e) { rethrow(e); }   // (after the last callback, before the frame is judged: the ink lays itself on the figure as drawn)
    runMay(now);
  } finally {
    current.clear(); spareQ = current; current = null;
    if (lateNow) { lateNow.clear(); spareL = lateNow; lateNow = null; }
    if (finalNow) { finalNow.clear(); spareF = finalNow; finalNow = null; }
  }
  const script = watching ? performance.now() - t0 : 0;
  lastScript = performance.now() - frameT0; frameT0 = 0;
  overLast = lastScript > SCRIPT_SHARE * frameBudget();
  overStreak = lastScript > frameBudget() ? overStreak + 1 : 0;
  govLevel = govFrameLevel; govFrameLevel = 0;
  if (FPS_LOG) logOverrun(now, lastScript, parts);
  globalThis.__frameProbe?.(now);   // (the tests read the camera here, once every frame has been drawn)
  roll(now);
  if (watching) {
    const f = { now, gap: chained ? now - lastNow : 0, script, parts };   // alloc-rare: only while a watcher is on (watching), for the ?perf readout and the gates
    for (const w of watchers) try { w(f); } catch (e) { rethrow(e); }
  }
  // (recs-production-120hz §14: the cheap end-of-frame signal the adaptive tiers and the GPU budget run on. No parts are kept for it, so
  // ordinary rendering allocates no per-part records; detailed tracing (watchFrames) is opt-in, for ?perf and the gates. One object,
  // reused. The observers' own time is measured: lastTask is the whole frame task, scheduler bookkeeping and observers included.)
  if (ends.size) {
    endF.now = now; endF.gap = chained ? now - lastNow : 0; endF.script = lastScript;
    for (const w of ends) try { w(endF); } catch (e) { rethrow(e); }
  }
  lastTask = performance.now() - taskT0;
  parts = null; lastNow = now;
  if ((queue.size || late.size || fin.size || reads.size || mayDue() || FPS_FORCE) && !pending && !(FPS_FORCE && document.hidden)) pending = requestAnimationFrame(flush);
  else if (!pending) mayTimer();
  chained = !!pending;
}

// (Rev 2 §2.8: each callback's own time is read only where something uses it: every callback while frames are watched (?perf, the
// gates, perf().frames) or under ?fps= and ?perf; otherwise one frame in TIME_EVERY, its times counted TIME_EVERY times over in
// totals.ms (an estimate of the same sum), plus the deferrable surfaces, whose predicted cost the watchdog judges by. The other frames
// make no performance.now() pair per callback.)
export const TIME_EVERY = 30;
const TIME_ALL = typeof location !== 'undefined' && /[?&](perf|fps)(?=[=&#]|$)/.test(location.search || '');
let timeFrame = false;
/** Whether this frame's callbacks are each timed (every frame while watched or under ?perf/?fps, else one in TIME_EVERY). */
export const framesTimed = () => timeFrame;
// (The early batch runs by priority, 0 then 2 then 3, so the one rule judges the lower ones with the higher ones' time already spent.)
const EARLY_PASSES = [0, 2, 3], ONE_PASS = [-1];
function run(batch, now, phase) {
  const passes = phase === 'early' ? EARLY_PASSES : ONE_PASS;
  for (let p = 0; p < passes.length; p++) runPass(batch, now, phase, passes[p]);
}
// (A callback timed by the GPU probe, which only the ?perf readout turns on: the name and the closure are made for it alone.)
function probed(tag, cb, now) {
  gpuProbe.time(null, `${tag} (script)`, () => cb(now));   // alloc-rare: only while the ?perf readout measures (gpuProbe.on)
}
function runPass(batch, now, phase, prio) {
  for (let i = 0; i < batch.n; i++) {
    const cb = batch.cbs[i];
    if (!cb) continue;
    const tag = batch.tags[i];
    if (prio >= 0 && priorityOf(tag) !== prio) continue;
    batch.cbs[i] = null; batch.tags[i] = null; batch.size--;
    if (phase === 'early' && shedding(tag)) { queue.add(batch.ids[i], tag, cb); continue; }   // (carried to the next frame: see the watchdog)
    counts.set(tag, (counts.get(tag) || 0) + 1); totals.asks[tag] = (totals.asks[tag] || 0) + 1;
    const learn = phase === 'early' && prio > 0, timed = timeFrame || learn;
    const t0 = timed ? performance.now() : 0;
    try { if (gpuProbe.on) probed(tag, cb, now); else cb(now); } catch (e) { rethrow(e); }   // one surface's error never stops the others
    if (!timed) continue;
    const ms = performance.now() - t0;
    if (learn) learnCost(tag, ms);
    if (timeFrame) totals.ms[tag] = (totals.ms[tag] || 0) + (parts || TIME_ALL ? ms : ms * TIME_EVERY);
    parts?.push([tag, phase, ms]);   // alloc-rare: only while frames are watched (parts is null otherwise)
  }
}

/** Calls fn({ now, gap, script, parts }) after every frame the scheduler runs (frame-stats.js has the shape). Returns the stop.
 *  Detailed: while anyone watches, every callback's time is kept per part. For ?perf, the gates and tests only. */
export function watchFrames(fn) { watchers.add(fn); return () => watchers.delete(fn); }
const finals = new Set();
/** Calls fn(now) at the very end of every frame the scheduler runs, after the final callbacks and before the frame is judged: for a surface that must
 *  follow whatever the others drew this frame (the pen's ink). Returns the stop. Costs nothing while nobody listens. */
export function onFrameFinal(fn) { finals.add(fn); return () => finals.delete(fn); }
const ends = new Set(), endF = { now: 0, gap: 0, script: 0 };
let lastTask = 0;
/** Calls fn({ now, gap, script }) at the end of every frame, cheaply (no parts; the object is reused, read it in the call). Returns the stop. */
export function onFrameEnd(fn) { ends.add(fn); return () => ends.delete(fn); }
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
// (Rev 2 §2.8: the same rule as refreshFrom, on a scratch array kept for it, so the check every 30 frames allocates nothing.)
const gapSort = new Float32Array(240);
function refreshFromRing() {
  let k = 0;
  for (let i = 0; i < gapN; i++) { const d = gapRing[i]; if (d > 2 && d < 100) gapSort[k++] = d; }
  if (k < 20) return 0;
  gapSort.fill(Infinity, k); gapSort.sort();
  const hz = 1000 / gapSort[Math.floor(k / 4)];
  let best = REFRESH_RATES[0];
  for (let i = 1; i < REFRESH_RATES.length; i++) if (Math.abs(REFRESH_RATES[i] - hz) < Math.abs(best - hz)) best = REFRESH_RATES[i];
  return best;
}
function noteGap(dt) {
  gapRing[gapAt] = dt; gapAt = (gapAt + 1) % gapRing.length; if (gapN < gapRing.length) gapN++;
  if (++hzAt >= 30) { hzAt = 0; hzNow = refreshFromRing(); if (gapN >= 120) hzMax = Math.max(hzMax, hzNow); }
}
/** The cadence the page's frames are observed at now (Hz; 0 until enough frames have run). A diagnostic: never the budget. */
export const refreshHz = () => hzNow;
/** The highest refresh seen offered on this page (Hz): the panel can do at least this, so less now is a throttle. */
export const refreshMaxHz = () => Math.max(hzMax, +globalThis.screen?.refreshRate || 0);
/** The intervals of the last frames that ran one after another (ms, oldest first). */
export const recentGaps = () => { const a = Array.from(gapRing.subarray(0, gapN)); return gapN < gapRing.length ? a : [...a.slice(gapAt), ...a.slice(0, gapAt)]; };
// The target (recs-production-120hz §1, §5; 2 Nov 2026): one fixed rate the engine holds itself to, never the rate it happens to get.
// A slow stretch of frames is a miss against 120 Hz, not a reason to allow 33 ms a frame: the watchdog, the governor, the tiers and the
// prep ledger all judge against this interval. refreshHz() stays an observation for the ?perf panel only.
const TARGET_HZ = 120;
/** The rate the engine targets (Hz): 120. Fixed for the page's life. */
export const targetHz = () => TARGET_HZ;
/** One frame's time at the target (ms): 8.333 at 120 Hz, whatever cadence the page observes. */
export const frameBudget = () => 1000 / TARGET_HZ;

// ── One policy for what runs in a frame (plan "Holding 120 Hz" rev 2 step 2; Mohammad, 2 Nov 2026) ──
// Every callback has a priority. 0: the camera, the input's answer, the blood, the vessels, labels, the catheter, card and glass motion
// (never carried over). 1: the model frame's application (its may tasks, mayTask). 2: the instruments beside the figure (P2). 3: the
// chrome that does not draw the moving picture (P3). One rule judges priorities 1 to 3, before each callback starts (a running one cannot
// be stopped): it runs when the frame's script so far plus its predicted cost (the moving average of its own runs; CARRY_SEED_MS until it
// has run once, so a first heavy run is not let through blind) stays within its share of the budget (SHARE_OF: SCRIPT_SHARE, 3.5 ms of 8.3 at 120 Hz, the
// main thread's whole share; the instruments 85 %). Otherwise it is carried to the next frame, at most CARRY_MAX frames in a row, then runs, so none starves (and
// the count of those, `forced`, is a miss to fix by making the work smaller, never a limit to raise). A surface animating on screen
// (frameAnimating) is never carried: a carried frame of a moving picture is a hitch. The higher priorities are judged first in the frame
// (the early batch runs priority 0, then 2, then 3; the may tasks after the final phase). This replaces the watchdog's 70 %, the governor's
// 85 % and 50 %, the may tasks' 42 %, SHED_MAX, SEC_MAX and MAY_WAIT, and the Locked, Balanced and Quality modes: one behaviour, hold the
// refresh.
export const SCRIPT_SHARE = 0.42, CARRY_MAX = 2, CARRY_SEED_MS = 1;
// (The one rule's share by priority. The instruments beside the figure (2) draw moving traces (the Doppler's sweep, the pressure strips, the
// sinusoid's view) and keep the share they had, 85 %: judged at 42 % they were carried in most frames of a busy phone and their sweep
// stepped. Everything else (1, 3) keeps to SCRIPT_SHARE.)
const SHARE_OF = [1, SCRIPT_SHARE, 0.85, SCRIPT_SHARE];
/** (The prep ledger's share of the frame: the same.) */
export const WATCH_SHARE = SCRIPT_SHARE;
export const DEFERRABLE = new Set(['credit', 'timeline', 'scroll-edges', 'inspector', 'dock', 'figkey', 'scale select', 'menu-profile', 'menu', 'vitals-monitor', 'main', 'debug', 'perf readout']);
export const SECONDARY = new Set(['charts', 'doppler', 'fibroscan', 'plane plot', 'pressure-time', 'flow-time', 'tool-curve', 'tool-causes', 'col-wave', 'scope-tile', 'sinusoid-view', 'lumen']);
const PRIO = new Map([...[...SECONDARY].map((t) => [t, 2]), ...[...DEFERRABLE].map((t) => [t, 3])]);
/** A frame callback's priority by its tag (0, 2 or 3; the may tasks are 1). */
export const priorityOf = (tag) => PRIO.get(tag) || 0;
let overStreak = 0, govLevel = 0, govFrameLevel = 0, govShed = 0;
/** The one behaviour left ('locked': hold the refresh). Kept for the readouts. */
export const perfMode = () => 'locked';
let frameT0 = 0, lastScript = 0, overLast = false;
const shedRun = new Map(), shedBy = new Map();
let shedTotal = 0, carryForced = 0;
const animatingTags = new Map();   // (tag → how many of its surfaces animate now: each on is paired with one off)
// The page at idle rest (idle-rest.js, main.js: 30 s with no input in Explore): the model's worker is stopped, so no sample comes and a
// strip that scrolls "while the model runs" would redraw the same picture on every screen frame for as long as the page sits (idle heat,
// 4 Nov 2026). A surface that loops on its own asks pageRest() in its live(), and registers onPageWake to start again at the first input.
let pageRestOn = false;
const pageWake = new Set();
/** Whether the page is at idle rest: nothing new comes, so a loop that only repeats the last picture stops. */
export const pageRest = () => pageRestOn;
/** Idle rest begins (true) or ends (false); ending calls each registered wake, once, in the input's own event. */
export function setPageRest(on) { on = !!on; if (on === pageRestOn) return; pageRestOn = on; if (!on) for (const fn of pageWake) fn(); }
/** fn is called when idle rest ends (a surface starts its loop again). Returns the remover. */
export function onPageWake(fn) { pageWake.add(fn); return () => pageWake.delete(fn); }
/** A surface animating on screen (on) or still (off): its frames are never carried over while it animates. */
export function frameAnimating(tag, on) {
  const n = (animatingTags.get(tag) || 0) + (on ? 1 : -1);
  if (n > 0) animatingTags.set(tag, n); else animatingTags.delete(tag);
}
/** True when the last frame's script went over the share: drop detail that can wait. */
export const overBudget = () => overLast;
/** The last frame's main-thread script time (ms), and how many callbacks have been carried over (and forced after CARRY_MAX) since the page opened. */
export const watchdogStats = () => ({ last: lastScript, shed: shedTotal, predicted: shedPredicted, forced: carryForced, mode: 'locked', budget: frameBudget(), task: lastTask, governor: govLevel, streak: overStreak, yielded: govShed });
/** What was carried over, per surface, and the surfaces animating now (never carried over). */
export const shedStats = () => ({ byTag: Object.fromEntries(shedBy), animating: [...animatingTags.keys()] });
const costEma = new Map();
function learnCost(tag, ms) { const c = costEma.get(tag); costEma.set(tag, c == null ? ms : c * 0.7 + ms * 0.3); }
/** A surface's predicted cost per callback (ms; 0 until it has run). */
export const costOf = (tag) => costEma.get(tag) || 0;
const predicted = (tag) => costEma.get(tag) ?? CARRY_SEED_MS;
let shedPredicted = 0;
/** Whether a callback of priority `prio` and tag `tag` waits with `used` ms of the frame gone (the one rule, for the tests). */
export function waits(tag, used, prio = priorityOf(tag), budget = frameBudget()) {
  return prio > 0 && used + predicted(tag) > SHARE_OF[prio] * budget;
}
/** (Kept names for the checks: the rule for a chrome callback, and for an instrument's.) */
export const wouldShed = (tag, used, budget = frameBudget()) => DEFERRABLE.has(tag) && waits(tag, used, 3, budget);
export const wouldYield = (tag, used, budget = frameBudget()) => SECONDARY.has(tag) && waits(tag, used, 2, budget);
function shedding(tag) {
  const prio = priorityOf(tag);
  if (!prio || !frameT0 || animatingTags.has(tag)) { if (shedRun.size) shedRun.delete(tag); return false; }
  const n = shedRun.get(tag) || 0, used = performance.now() - frameT0;
  if (!waits(tag, used, prio)) { if (n) shedRun.delete(tag); return false; }
  if (n >= CARRY_MAX) { shedRun.delete(tag); carryForced++; return false; }
  if (used < SCRIPT_SHARE * frameBudget()) shedPredicted++;
  shedRun.set(tag, n + 1); shedTotal++; shedBy.set(tag, (shedBy.get(tag) || 0) + 1);
  if (prio === 2) { govShed++; govFrameLevel = 2; } else if (!govFrameLevel) govFrameLevel = 1;
  return true;
}

// ── Must and may (plan "Holding 120 Hz, always" §3.1; Mohammad, 2 Nov 2026) ──
// Everything asked with frame/lateFrame/finalFrame is MUST (priority 0, or 2 and 3 by tag, above). Work that can wait a frame or two is
// MAY, priority 1: mayTask(tag, fn, { notBefore, maxWait }). It runs after the frame's must work under the same one rule (SCRIPT_SHARE with
// its predicted cost), carried at most maxWait frames (CARRY_MAX) and then run. fn(leftMs) returns true when it has more to do (a sliced
// task: it goes on next frame) and anything else when done. One task per tag: asking again before it ran replaces its fn (the newest work
// only, as a model frame's paint). notBefore (a performance.now() time) makes it a timer that runs in a frame, never in a task of its own.
export const MAY_SHARE = SCRIPT_SHARE, MAY_WAIT = CARRY_MAX;
const mays = new Map();   // tag -> { tag, fn, waited, notBefore, maxWait, at, cancel }
// (One record per tag, made at the tag's first ask and kept: a may task asked again after it ran writes into it, so an ask allocates
// nothing. `at`: the pass of runMay it was last put in the queue in, so one asked again while a pass runs waits for the next frame, as
// a new record would. `cancel`: the function mayTask returns, made once with the record.)
const mayRecs = new Map();
let mayPass = 0;
const mayCost = new Map(), mayBatch = [];
const mayStat = { ran: 0, waited: 0, aged: 0 };
let mayT = 0, mayTAt = 0;
function newMayRec(tag) {
  const m = { tag, fn: null, waited: 0, notBefore: 0, maxWait: MAY_WAIT, at: 0, cancel: () => cancelMay(tag) };   // alloc-rare: once per tag, at its first ask
  mayRecs.set(tag, m);
  return m;
}
export function mayTask(tag, fn, opts) {
  const notBefore = opts === undefined || opts.notBefore === undefined ? 0 : opts.notBefore;
  const maxWait = opts === undefined || opts.maxWait === undefined ? MAY_WAIT : opts.maxWait;
  let m = mays.get(tag);
  if (m) { m.fn = fn; m.notBefore = notBefore; m.maxWait = maxWait; }
  else {
    m = mayRecs.get(tag) || newMayRec(tag);
    m.fn = fn; m.waited = 0; m.notBefore = notBefore; m.maxWait = maxWait; m.at = mayPass;
    mays.set(tag, m);
  }
  if (!notBefore || notBefore <= performance.now()) { if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush); }
  else if (!pending) mayTimer();
  return m.cancel;
}
/** Drops the may task of `tag` that has not run yet. */
export function cancelMay(tag) { mays.delete(tag); }
/** Whether a may task of `tag` waits to run. */
export const mayWaiting = (tag) => mays.has(tag);
/** The may tasks run, carried to a later frame and run past their wait since the page opened; the ones waiting now. */
export const mayStats = () => ({ ...mayStat, queued: mays.size });
function mayDue() {
  if (!mays.size) return false;
  const t = performance.now();
  for (const m of mays.values()) if (!m.notBefore || m.notBefore <= t) return true;
  return false;
}
// (Only timers in the future and no frame coming: one timeout asks for the frame the first of them is due in.)
function mayTimer() {
  if (!mays.size) return;
  let at = Infinity;
  for (const m of mays.values()) if (m.notBefore && m.notBefore < at) at = m.notBefore;
  if (at === Infinity || (mayT && mayTAt <= at)) return;
  clearTimeout(mayT); mayTAt = at;
  mayT = setTimeout(mayFire, Math.max(0, at - performance.now()));
}
function mayFire() { mayT = 0; if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush); }
function runMay(now) {
  if (!mays.size) return;
  const limit = MAY_SHARE * frameBudget();
  // (The tasks due as the pass starts, once each: one asked again while the pass runs, or going on (more), waits for the next frame.)
  mayBatch.length = 0;
  mayPass++;
  for (const m of mays.values()) mayBatch.push(m);
  for (let i = 0; i < mayBatch.length; i++) {
    const m = mayBatch[i], tag = m.tag;
    if (mays.get(tag) !== m || m.at === mayPass) continue;   // (cancelled, or asked again since the pass began: the next frame's)
    const t = performance.now();
    if (m.notBefore && m.notBefore > t) continue;
    const used = t - frameT0, aged = m.waited >= m.maxWait;
    if (!aged && used + (mayCost.get(tag) ?? CARRY_SEED_MS) > limit) { m.waited++; mayStat.waited++; continue; }
    if (aged) mayStat.aged++;
    mays.delete(tag); mayStat.ran++;
    counts.set(tag, (counts.get(tag) || 0) + 1); totals.asks[tag] = (totals.asks[tag] || 0) + 1;
    let more = false;
    try { more = m.fn(Math.max(0, limit - used), now) === true; } catch (e) { rethrow(e); }
    const ms = performance.now() - t, c = mayCost.get(tag);
    mayCost.set(tag, c == null ? ms : c * 0.7 + ms * 0.3);
    totals.ms[tag] = (totals.ms[tag] || 0) + ms;
    parts?.push([tag, 'may', ms]);   // alloc-rare: only while frames are watched (parts is null otherwise)
    if (more && !mays.has(tag)) { m.waited = 0; m.notBefore = 0; m.at = mayPass; mays.set(tag, m); }   // (the same record goes on: nothing new a slice)
  }
  mayBatch.length = 0;
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
  const top = (list || []).slice().sort((a, b) => b[2] - a[2]).slice(0, 5).map(([t, ph, ms]) => `${t} (${ph}) ${ms.toFixed(1)}`).join(', ');   // alloc-rare: only under ?fps=, for a frame that overran (a measuring log)
  console.warn(`[fps] overrun at ${(now / 1000).toFixed(2)} s: interval ${gap.toFixed(1)} ms, script ${script.toFixed(1)} ms (budget ${per.toFixed(1)} ms at ${Math.round(1000 / per)} Hz)${top ? `: ${top}` : ''}`);   // alloc-rare: only under ?fps=, for a frame that overran
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
  queue.add(id, tag, cb);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

/** As frame(), but run before every other callback of the next frame, while the layout is still the last frame's (see `reads`). */
export function readFrame(cb, tag = 'other') {
  const id = next++;
  reads.add(id, tag, cb);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

/** As frame(), but run after every other callback of its frame (see `late`). */
export function lateFrame(cb, tag = 'other') {
  const id = next++;
  late.add(id, tag, cb);
  if (!pending && !current && !readsNow) pending = requestAnimationFrame(flush);
  return id;
}

/** As lateFrame(), but run after the late ones too (see `fin`). */
export function finalFrame(cb, tag = 'other') {
  const id = next++;
  fin.add(id, tag, cb);
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
// in performance.now()'s timebase while nothing has been held back.
export const PACE_CAP = 50;
export const PACED = true;   // (switch deleted; kept for stage.js, presenter.js and lobule-zoom.js until their own pass)
// (Only a frame long against the ones before it is held back: the cap is twice the usual interval of the last frames that ran one
// after another, PACE_CAP at least and PACE_MAX at most, so a device that draws a slow scene at 10 frames a second keeps its eases at
// their own speed, and only its sudden long frames are smoothed over.)
export const PACE_MAX = 1000;   // (a software renderer's frames, a second apart, run at their own speed)
let paceReal = 0, paceBase = 0, paceCap = PACE_CAP;
const paceGaps = new Float64Array(9), paceSort = new Float64Array(9);
let paceAt = 0, paceN = 0;
const wall = () => performance.now();
// ── One honest clock (recs_cgpt R20, 2 Nov 2026) ── easeNow() is the wall clock, one time per frame (every surface of a frame reads
// the same), never held back: a long frame shows the ease where the wall clock puts it, so a transition ends when its own duration
// says and the deferred work's holds (holdMotion, which run on the wall clock) agree with what is on screen. What a paced clock would
// have hidden is still counted (clockStats: long frames, ms it would have held back), so a jump is reported, not smoothed over.
// Transitions own their state (beginMotion → end): deferrable work waits for the real end, not a timer's guess, with a bounded
// recovery (MOTION_MAX_MS) for a transition that never says it ended.
export const clockStats = { frames: 0, long: 0, lostMs: 0, worstMs: 0, transitions: 0, overdue: 0, lastMs: 0, lastName: '' };
function paceStep() {
  const t = wall();
  if (!paceReal) { paceReal = paceBase = t; return; }
  const gap = Math.max(0, t - paceReal);
  clockStats.frames++;
  if (gap > paceCap) { clockStats.long++; clockStats.lostMs += gap - paceCap; clockStats.worstMs = Math.max(clockStats.worstMs, gap); }
  paceBase = paceReal = t;
  if (chained) paceNote(gap);
}
// (The median of the last 9 intervals, kept in a ring and sorted in a scratch array: no array made a frame, rev 2 §2.8.)
function paceNote(gap) {
  paceGaps[paceAt] = gap; paceAt = (paceAt + 1) % 9; if (paceN < 9) paceN++;
  paceSort.set(paceGaps); paceSort.fill(Infinity, paceN); paceSort.sort();
  paceCap = Math.min(PACE_MAX, Math.max(PACE_CAP, 2 * paceSort[paceN >> 1]));
}
/** The eases' clock (ms): performance.now() while frames come promptly, held to PACE_CAP ms of progress from frame to frame. */
export function easeNow() {
  const t = wall();
  if (!paceReal) { paceReal = paceBase = t; return t; }
  if (current || lateNow || finalNow || readsNow) return paceBase;   // (one time for every surface in a frame, as the frame's timestamp is)
  return t;
}
// A move on screen that a long frame would spoil (the slide's cards fading in, a dive landing): work that can wait (a sharper
// picture painted ahead, the anatomy's raster under the lobule, the lobule's preparation pieces) waits until it is over.
let holdUntil = 0;
/** Keeps deferrable work out of the next `ms` (the longest of the holds asked for wins). */
export function holdMotion(ms) { holdUntil = Math.max(holdUntil, wall() + ms); }
export const MOTION_MAX_MS = 5000;
const moving = new Map();   // (transition token → { name, t0, until })
/** A transition begins: deferrable work waits until the returned end() is called (or MOTION_MAX_MS passes, counted as overdue). */
export function beginMotion(name = 'move', maxMs = MOTION_MAX_MS) {
  // alloc-rare: once per transition (a slide change, a dive), when it begins; never in a frame
  const tok = {}, t0 = wall();
  moving.set(tok, { name, t0, until: t0 + maxMs });   // alloc-rare: the transition's record, made with its begin
  clockStats.transitions++;
  // alloc-rare: the transition's end function, made with its begin
  return () => { if (!moving.delete(tok)) return; clockStats.lastMs = wall() - t0; clockStats.lastName = name; };
}
function anyMoving(t) {
  for (const [tok, m] of moving) if (t >= m.until) { moving.delete(tok); clockStats.overdue++; }
  return moving.size > 0;
}
/** True while a move asked to be left alone (holdMotion), or a transition begun with beginMotion has not ended. */
export const inMotion = () => { const t = wall(); return t < holdUntil || (moving.size > 0 && anyMoving(t)); };
/** Calls fn once no move holds the page (polled with timers, never a frame loop); returns a cancel. */
export function afterMotion(fn, poll = 60) {
  let t = 0, dead = false;
  const go = () => { t = 0; if (dead) return; if (inMotion()) t = setTimeout(go, Math.max(poll, holdUntil - wall())); else fn(); };   // alloc-rare: once per wait, not per frame: a caller starts one at a time (stage.js holdValues keeps heldWait)
  go();
  return () => { dead = true; clearTimeout(t); };   // alloc-rare: once per wait, with the closure above
}

export const framePhase = () => (finalNow ? 'final' : lateNow ? 'late' : current ? 'early' : readsNow ? 'read' : null);

// (The asker for a tag is made once and kept: a surface that asks `lateFrameFor('x')(cb)` in a frame gets the same function each time.)
const askers = { frame: new Map(), read: new Map(), late: new Map(), final: new Map() };
const keepAsker = (m, tag, f) => { m.set(tag, f); return f; };
export const frameFor = (tag) => askers.frame.get(tag) || keepAsker(askers.frame, tag, (cb) => frame(cb, tag));   // alloc-rare: only at a tag's first use
export const readFrameFor = (tag) => askers.read.get(tag) || keepAsker(askers.read, tag, (cb) => readFrame(cb, tag));   // alloc-rare: only at a tag's first use
export const lateFrameFor = (tag) => askers.late.get(tag) || keepAsker(askers.late, tag, (cb) => lateFrame(cb, tag));   // alloc-rare: only at a tag's first use
export const finalFrameFor = (tag) => askers.final.get(tag) || keepAsker(askers.final, tag, (cb) => finalFrame(cb, tag));   // alloc-rare: only at a tag's first use

// A surface that paces itself (asks every frame, draws only some) notes each frame it really drew, for perf().drawn.
export function noteDraw(tag) { draws.set(tag, (draws.get(tag) || 0) + 1); totals.drawn[tag] = (totals.drawn[tag] || 0) + 1; }

// Per-surface callbacks per second over the last full second, the frames each pacing surface really drew in it,
// which surfaces wait for a frame, and the running totals of both since the page opened (for checks over any span;
// totals.frames: the browser frames the scheduler ran, so a surface's draws can be held against the frames on offer;
// totals.ms: the main-thread time each surface's callbacks took, in ms: CPU time issuing work, not the GPU's own time).
export function perf() {
  roll(performance.now());
  // (A report: read by the ?perf readout, the gates and the tests, never by a frame of the figure.)
  return { fps, surfaces: Object.fromEntries(rates), drawn: Object.fromEntries(drawRates), totals: { asks: { ...totals.asks }, drawn: { ...totals.drawn }, ms: { ...totals.ms }, frames: allFrames }, waiting: [...fin.waitingTags(late.waitingTags(queue.waitingTags(new Set())))],   // alloc-rare: a report for the ?perf readout, the gates and the tests
    get inputToPaint() { return inputMeasure(); }, frames: frameRecording };   // alloc-rare: part of the same report
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
try { localStorage.removeItem('pps.saver'); } catch (e) { caught('frame:564', e); /* storage unavailable */ }
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
try { const t = localStorage.getItem('pps.renderScale'), v = t === 'auto' ? t : +t; if (RENDER_SCALES.includes(v)) renderK = v; } catch (e) { caught('frame:577', e); /* storage unavailable */ }
const renderSubs = new Set();
/** The chosen setting: 'auto' or a fixed share. */
export const renderSetting = () => renderK;
/** The fixed share of the pixels (1 under Auto, which only the anatomy applies, by its zoom). */
export const renderScale = () => (renderK === 'auto' ? 1 : renderK);
export function setRenderScale(k) {
  if (!RENDER_SCALES.includes(k) || k === renderK) return;
  renderK = k;
  try { if (k === 1) localStorage.removeItem('pps.renderScale'); else localStorage.setItem('pps.renderScale', String(k)); } catch (e) { caught('frame:586', e); /* storage unavailable */ }
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
  try { const t = localStorage.getItem(`pps.fig.${k}`), v = t === 'true' ? true : +t; if (t != null && FIG_OPTS[k].includes(v)) figOpts[k] = v; } catch (e) { caught('frame:602', e); /* storage unavailable */ }
}
export const figOpt = (k) => figOpts[k];
export function setFigOpt(k, v) {
  if (!FIG_OPTS[k]?.includes(v) || figOpts[k] === v) return;
  figOpts[k] = v;
  try { if (v === FIG_OPTS[k][0]) localStorage.removeItem(`pps.fig.${k}`); else localStorage.setItem(`pps.fig.${k}`, String(v)); } catch (e) { caught('frame:608', e); /* storage unavailable */ }
  for (const f of renderSubs) f(renderK);
}
// Figure performance (30 Oct, Round 3 of the review, each off until chosen; Settings › Figure performance). Unlike the options above,
// none of these changes the canvas's size, so a change is told only to its own listeners (onFigLab), never to the resolution's.
// motion60: steady motion (the blood, the lobule, the sinusoid, the instruments) is drawn at most about 60 times a second on a faster
//   screen; pans, zooms, glides and labels stay at the screen's rate. A 60 Hz screen draws as before. ON by default since 4 Nov 2026
//   (Mac heat, mac-thermal-recs R1: the GPU never idled at 120 a second); setFigLab('motion60', false) brings every frame back.
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
export const FIG_LAB = { motion60: [true, false], glassCache: [false, true], creditLean: [true, false], lymphBoxes: [false, true], pinchReuse: [0, 2, 3], upscale: [false, true], lightArt: [false, true], pinchLow: [false, true] };
const figLabs = Object.fromEntries(Object.entries(FIG_LAB).map(([k, v]) => [k, v[0]]));
for (const k of Object.keys(figLabs)) {
  try { const t = localStorage.getItem(`pps.fig.${k}`), v = t === 'true' ? true : t === 'false' ? false : +t; if (t != null && FIG_LAB[k].includes(v)) figLabs[k] = v; } catch (e) { caught('frame:631', e); /* storage unavailable */ }
}
const labSubs = new Set();
export const figLab = (k) => figLabs[k];
export function setFigLab(k, v) {
  if (!FIG_LAB[k]?.includes(v) || figLabs[k] === v) return;
  figLabs[k] = v;
  try { if (v === FIG_LAB[k][0]) localStorage.removeItem(`pps.fig.${k}`); else localStorage.setItem(`pps.fig.${k}`, String(v)); } catch (e) { caught('frame:638', e); /* storage unavailable */ }
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
export const paceMs = () => frameGapFor('glide');

// ── The frame-rate governor (pure-gpu-plan C4, 4 Nov 2026) ── 120 Hz only where it pays: while a finger or trackpad drives the camera
// ('hand'), the screen's own rate; for glides and motion the app runs itself (slide changes, view switches, the blood while things move)
// 60 Hz ('glide'); for the blood alone at rest 30 Hz ('flow'); nothing when nothing moves ('still', or a hidden or resting page).
// frameRateFor(reason) is the rate in Hz (0: no frame wanted; the screen's maximum for 'hand'); frameGapFor(reason) the least time in ms
// between two drawn frames of that kind, which a surface that paces itself compares with its last drawn frame (no phase is carried: a
// 120 Hz screen draws every 2nd frame at 60 and every 4th at 30; a 60 Hz screen draws all at 60 and every 2nd at 30). Battery saver
// caps every kind at its own 15 Hz. Settings › Figure performance › Motion at 60 off lifts the 'glide' and 'flow' caps (every frame).
export const FRAME_HZ = { hand: 0, glide: 60, flow: 30, still: 0, hidden: 0 };
const FRAME_GAP_MS = { hand: 0, glide: MOTION60_MS, flow: 28, still: 0, hidden: 0 };
let handProbe = null;
/** The surface that knows a hand is on the camera (a drag, a flick, a wheel, a pinch) registers its test once. */
export function setHandProbe(fn) { handProbe = fn; }
export const handDriven = () => !!handProbe && !!handProbe();
/** What the frame is for now: 'hand', 'glide' (a move or a transition is running), 'flow' (only the blood), 'still' (a hidden or resting page). */
export function frameReason() {
  if (pageRestOn || (typeof document !== 'undefined' && document.hidden)) return 'hidden';
  if (handDriven()) return 'hand';
  return inMotion() ? 'glide' : 'flow';
}
/** Rate in Hz for a reason (a reason of its own, or none: the one now). 0 means no frame; 'hand' is the screen's full rate. */
export function frameRateFor(reason = frameReason()) {
  if (reason === 'hand') return saverOn ? 15 : refreshMaxHz() || 60;
  const hz = FRAME_HZ[reason] ?? 0;
  if (!hz) return 0;
  return saverOn ? Math.min(15, hz) : hz;
}
/** The least ms between two drawn frames of a reason: 0 (every frame) for 'hand' and where Motion at 60 is off. */
export function frameGapFor(reason = frameReason()) {
  if (saverOn) return reason === 'still' || reason === 'hidden' ? 0 : SAVER_MS;
  if (reason === 'hand' || !figLabs.motion60) return 0;
  return FRAME_GAP_MS[reason] || 0;
}
