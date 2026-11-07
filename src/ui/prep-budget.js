// One budget for every piece of preparation the main thread does between frames (review pass 2, priority 1; 2 Nov 2026).
//
// The frame watchdog (frame.js) holds a frame's own callbacks to the frame budget, but preparation also runs outside frames: rest
// passes (rest-pass.js, a MessageChannel task), slide preparation (slide-prep.js, idle callbacks and the promise continuations after a
// patient's state arrives), observers that hand their work to a rest pass. Each had a limit of its own, so together they could fill a
// frame interval several times over. Here they draw from one ledger: in each frame interval (frameBudget(), 8.3 ms at 120 Hz) all of them
// together may spend what the frame's own script left of WATCH_SHARE of it while something moves (at least PREP_FLOOR_MS), and REST_CAP_MS
// at rest, where nothing is drawn against a deadline.
//
// A watchdog cannot stop a function once it has started, so work is admitted only in chunks, before each one: a job is a list of steps
// (an iterator), each step one small piece, and the deadline is checked between steps with the step's own predicted cost (the last
// costs of that job's tag, a moving average) — a step predicted not to fit waits for the next interval. A step that returns a promise
// (a worker's answer, a font) parks its job until it settles; its continuation is admitted through the same ledger, never run in the
// microtask that settled it. A job's alive() is checked before every step and after every promise, so a cancelled generation spends
// nothing more. Fairness: jobs take turns, the one waiting longest first, and one that has waited STARVE_MS is admitted on its next turn
// whatever the ledger says (one step), so nothing is deferred forever. prepStats() counts admitted and deferred steps, starved ones, the
// longest wait, and what was spent.
//
//   prepJob(tag, steps, { alive, onFail }) → { cancel(), done: Promise<boolean>, error() }   (steps: iterable of () => void | Promise)
//   (B19: a step that throws, or whose promise rejects, FAILS its job: the job stops at once, its iterator is closed (a generator's
//   finally runs), onFail(error) is told once, error() answers it, and done settles false, never as a completion. The same with
//   ?prepbudget=0.)
//   prepLeft() → ms left in this interval        prepSpend(ms) charges work done elsewhere (a rest pass)
import { frameBudget, inMotion, watchdogStats, WATCH_SHARE } from './frame.js';

/** The target frame interval (ms), for the rest passes' slice (rest-pass.js reads it here: its one import). */
export const frameMs = () => frameBudget();
export const PREP_BUDGET = true;   // (switch deleted; kept for rest-pass.js until its own pass)
export const REST_CAP_MS = 6;
export const PREP_FLOOR_MS = 1;
export const STARVE_MS = 250;
const now = () => performance.now();

let windowAt = -Infinity, spent = 0;
const stats = { admitted: 0, deferred: 0, starved: 0, cancelled: 0, failed: 0, spentMs: 0, maxWait: 0, maxStep: 0, windows: 0 };
/** The ledger's counts since the page opened. */
export const prepStats = () => ({ ...stats, queued: jobs.length });

function roll(t) {
  if (t - windowAt >= frameBudget()) { windowAt = t; spent = 0; stats.windows++; }
}
/** What preparation may spend in this frame interval (ms) in all: less while something moves. */
export function prepCap() {
  if (!inMotion()) return REST_CAP_MS;
  const b = frameBudget(), frameUsed = watchdogStats().last || 0;
  return Math.max(PREP_FLOOR_MS, WATCH_SHARE * b - frameUsed);
}
/** The ms preparation has left in this frame interval (negative once overspent). */
export function prepLeft(t = now()) { roll(t); return prepCap() - spent; }
/** When this interval ends (ms from now): when an over-budget queue may try again. */
export const prepWindowLeft = (t = now()) => { roll(t); return Math.max(0, windowAt + frameBudget() - t); };
/** Charges ms of preparation done elsewhere (a rest pass) to this interval. */
export function prepSpend(ms) { roll(now()); spent += ms; stats.spentMs += ms; }
/** For the tests: forget the interval and the counts. */
export function prepReset() { windowAt = -Infinity; spent = 0; for (const k of Object.keys(stats)) stats[k] = 0; jobs.length = 0; cost.clear(); clearTimeout(timer); timer = 0; posted = false; }

// ── Jobs: resumable lists of steps, taking turns ──
const jobs = [];          // (waiting their turn: { tag, it, alive, since, park, res })
const cost = new Map();   // (tag → moving average of one step's ms)
let posted = false, timer = 0, port = null;
const predict = (tag) => cost.get(tag) || 0;
function learn(tag, ms) { const c = cost.get(tag); cost.set(tag, c == null ? ms : c * 0.7 + ms * 0.3); }

function post(delay = 0) {
  if (posted) return;
  posted = true;
  if (delay > 0) { timer = setTimeout(pump, delay); return; }
  if (!port && typeof MessageChannel !== 'undefined') { const ch = new MessageChannel(); ch.port1.onmessage = pump; ch.port1.unref?.(); port = ch.port2; }
  if (port) port.postMessage(0); else timer = setTimeout(pump, 0);
}
function close(it) { try { it.return?.(); } catch { /* a cleanup that throws ends nothing more */ } }
function finish(j, ok) { if (j.over) return; j.over = true; const i = jobs.indexOf(j); if (i >= 0) jobs.splice(i, 1); if (!ok) close(j.it); j.res(ok); }
/** A step threw or rejected: the job is failed (told once), its iterator closed, and it leaves the queue. */
function failJob(j, e) { if (j.over) return; j.err = e ?? new Error('prep step failed'); stats.failed++; try { j.onFail?.(j.err); } catch { /* the hook's own error */ } finish(j, false); }
function pump() {
  posted = false; timer = 0;
  // (A parked job whose generation has gone is dropped now, even if its promise never settles: the queue never keeps the dead.)
  for (const j of jobs.slice()) if (j.park && !j.alive()) { stats.cancelled++; finish(j, false); }
  for (;;) {
    const ready = jobs.filter((j) => !j.park);
    if (!ready.length) return;
    // (The one waiting longest first.)
    let j = ready[0];
    for (const k of ready) if (k.since < j.since) j = k;
    if (!j.alive()) { stats.cancelled++; finish(j, false); continue; }
    const t = now(), waited = t - j.since, left = prepLeft(t);
    const starved = waited >= STARVE_MS;
    if (!starved && left < Math.max(0.05, predict(j.tag))) { stats.deferred++; post(Math.max(1, prepWindowLeft(t))); return; }
    if (starved && left < predict(j.tag)) stats.starved++;
    stats.maxWait = Math.max(stats.maxWait, waited);
    let r, step;
    try { step = j.it.next(); } catch (e) { failJob(j, e); continue; }
    if (step.done) { finish(j, true); continue; }
    const t0 = now();
    let threw = false;
    try { r = typeof step.value === 'function' ? step.value() : step.value; } catch (e) { threw = true; r = null; j.err = e; }
    const ms = now() - t0;
    prepSpend(ms); learn(j.tag, ms); stats.admitted++; stats.maxStep = Math.max(stats.maxStep, ms);
    if (threw) { failJob(j, j.err); continue; }
    j.since = now();   // (its turn taken: to the back of the line)
    if (r && typeof r.then === 'function') {
      j.park = true;
      // (The continuation comes back through the ledger: the job is only marked ready here, and a pump is asked for. A rejection is kept
      // and fails the job there, in its turn, rather than being swallowed.)
      let bad = false, why;
      r.then(() => {}, (e) => { bad = true; why = e; }).then(() => {
        if (j.over) return;
        if (bad) { failJob(j, why); return; }
        j.park = false;
        if (!j.alive()) { stats.cancelled++; finish(j, false); return; }
        j.since = now(); post();
      });
    }
  }
}

/**
 * Runs steps (an iterable of functions, each one small piece) through the shared budget, one at a time, between frames.
 * alive(): checked before each step and after each promise; false ends the job with done → false.
 */
export function prepJob(tag, steps, { alive = () => true, onFail } = {}) {
  const it = steps[Symbol.iterator] ? steps[Symbol.iterator]() : steps;
  let res;
  const done = new Promise((r) => { res = r; });
  let dead = false;
  const j = { tag, it, alive: () => !dead && alive(), since: now(), park: false, res, onFail, err: undefined };
  jobs.push(j);
  post();
  return { cancel: () => { if (dead) return; dead = true; if (jobs.includes(j)) { stats.cancelled++; finish(j, false); } }, done, error: () => j.err };
}
