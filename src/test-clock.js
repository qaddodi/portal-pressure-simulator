// The test clock (16 Nov 2026): the page's time, taken out of the browser's hands.
//
// A play-test pane that is not the front window is throttled by the browser: animation frames and timers come about once a second, so
// every move the camera gate times looks stalled and is marked NOT TIMED. This replaces the clocks the app reads (performance.now,
// Date.now, setTimeout, setInterval, requestAnimationFrame, requestIdleCallback, an event's timeStamp) with one virtual clock that a
// MessageChannel loop drives. The loop is not throttled in a background tab, so frames come every 16.7 ms of app time and a timer
// fires when it is due, whatever the window is doing. Nothing in the app changes: it asks the page for the time and gets this.
//
//   const clock = createTestClock(window, { rate: 5 });   clock.install();   clock.start();     (test-mode.js does this for the page)
//
// Time is the page's real clock plus an offset, so it keeps flowing (work inside a frame costs what it costs, an event's timeStamp
// still lines up) and the loop only ever moves the offset forward, to the next frame or timer that is due. It may skip waiting, but
// never faster than `rate` times real time (the credit rule below): the work the page waits on outside this clock (the engine's
// answer, a module arriving, a shader compiling) still has real time to finish in, a 60 s limit being 12 s of it at rate 5.
// Frames are 60 a second of app time. A frame whose work takes longer than that in real time stretches the app's time by as much, as it
// would on a screen, so a slow frame still shows as a stall; only the waiting between frames is skipped.
//
// Not covered: what the browser itself does on its own clock (a CSS transition or Web Animation is finished from here when its time
// is up, test-mode: animations), observers (ResizeObserver, IntersectionObserver) that only report when the page is drawn, and the
// engine's worker, which test-mode.js ticks with this clock's time (worker.js). `dispose()` puts the page's own clocks back.

const STEP = 1000 / 60;        // one frame of app time
const BASE = 2 ** 30;          // ids start here: none meets one the page's own clock handed out before the swap
const CAP_MS = 100;            // the most real time credit the loop keeps (it never banks a long wait into one big skip)
const BUSY_MS = 2000;          // a timer due inside this keeps the loop going; a clock with only far timers waits in real time
const WAIT_MS = 50;            // how long an idle loop sleeps (real time) before it looks again

/**
 * @param {any} g  the global object (window, a worker's self, or a stand-in under test)
 * @param {{ rate?: number, realNow?: () => number, page?: boolean }} [opts]  rate: the most app time per real time (1 = real pace);
 *   realNow: the real clock (tests pass a still one); page: also take over the document's visibility, an event's timeStamp
 *   and the running animations (default: when there is a document).
 */
export function createTestClock(g = globalThis, opts = {}) {
  const perf = g.performance;
  const bind = (f) => (typeof f === 'function' ? f.bind(g) : null);
  const nat = {
    now: bind(perf.now.bind(perf)), setTimeout: bind(g.setTimeout), clearTimeout: bind(g.clearTimeout), setInterval: bind(g.setInterval), clearInterval: bind(g.clearInterval),
    raf: bind(g.requestAnimationFrame), caf: bind(g.cancelAnimationFrame), ric: bind(g.requestIdleCallback), cic: bind(g.cancelIdleCallback), dateNow: g.Date.now.bind(g.Date),
  };
  const realNow = opts.realNow || nat.now;
  const doc = opts.page === false ? null : g.document || null;
  const hooks = { gate: null };   // gate(): false holds the loop for a moment (the engine's worker is behind: test-mode.js)
  const timers = new Map(), rafs = new Map();
  let current = null, on = false, driving = false, queued = false, waitT = 0, rate = Math.max(1, Number(opts.rate) || 5);
  let offset = 0, credit = 0, lastReal = 0, frameAt = -Infinity, seq = BASE, ord = 0, frames = 0, nowBase = 0, dateBase = 0;
  let port = null;
  const now = () => realNow() + offset;

  // ---- timers ----
  function addTimer(cb, delay, args, every, internal) {
    const id = ++seq;
    if (typeof cb !== 'function') return id;   // (a string to evaluate: the app has none)
    const d = Math.max(1, Number(delay) || 0);
    timers.set(id, { id, due: now() + d, ord: ++ord, cb, args, every: every ? d : 0, internal: !!internal });
    poke();
    return id;
  }
  function nextTimer(external) {
    let best = null;
    for (const t of timers.values()) if ((!external || !t.internal) && (!best || t.due < best.due || (t.due === best.due && t.ord < best.ord))) best = t;
    return best;
  }
  const dueOf = (external) => nextTimer(external)?.due ?? Infinity;
  const frameDue = () => (rafs.size ? frameAt + STEP : Infinity);
  // (A callback that throws is raised again from a real timer of its own, so one never stops the others and the page's error handlers see it.)
  const call = (fn, args) => { try { fn(...args); } catch (e) { nat.setTimeout(() => { throw e; }); } };
  function runTimers(limit) {
    for (let t, guard = 0; (t = nextTimer()) && t.due <= limit && guard++ < 50000;) {
      const n = now();
      if (t.due > n) offset += t.due - n;
      if (t.every) { t.due += t.every; t.ord = ++ord; } else timers.delete(t.id);
      call(t.cb, t.args);
    }
  }
  function runFrame() {
    const t = now();
    frameAt = t; frames++;
    current = new Map(rafs); rafs.clear();
    for (const [id, cb] of [...current]) { if (current.has(id)) call(cb, [t]); }   // (one cancelled by an earlier callback of this frame is skipped)
    current = null;
  }

  // ---- the loop ----
  function poke() {
    if (!driving || queued) return;
    queued = true;
    port.postMessage(0);
  }
  function step() {
    queued = false;
    if (!driving) return;
    if (waitT) { nat.clearTimeout(waitT); waitT = 0; }
    const r = realNow();
    credit = Math.min(CAP_MS, credit + (r - lastReal) * (rate - 1));
    lastReal = r;
    if (hooks.gate && !hooks.gate()) { poke(); return; }
    const n = now(), E = Math.min(dueOf(false), frameDue());
    if (E === Infinity) return;   // (nothing asked for: the next setTimeout or frame request wakes the loop)
    if (E > n) {
      if (!rafs.size && dueOf(true) > n + BUSY_MS) { waitT = nat.setTimeout(() => { waitT = 0; poke(); }, Math.min(E - n, WAIT_MS)); return; }   // (idle: look again in real time, nothing to skip)
      const give = Math.min(E - n, credit);
      offset += give; credit -= give;
      if (E > now()) { poke(); return; }   // (the credit ran out first: real time goes by, then another look)
    }
    runTimers(now());
    if (rafs.size && frameDue() <= now()) runFrame();
    poke();
  }

  /** Runs the clock to `target` (app time) at once, ignoring the rate: every timer and frame due on the way runs, in order. (The engine's worker, and the tests.) */
  function advanceTo(target) {
    for (let guard = 0; guard++ < 100000;) {
      const E = Math.min(dueOf(false), frameDue());
      if (E > target) break;
      const n = now();
      if (E > n) offset += E - n;
      runTimers(now());
      if (rafs.size && frameDue() <= now()) runFrame();
    }
    const n = now();
    if (target > n) offset += target - n;
  }

  // ---- the page ----
  const saved = {};
  const swallow = (e) => e.stopImmediatePropagation();
  function installPage() {
    // (The page is shown to the app as always in front: the many `document.hidden` pauses, the engine told it is hidden, none apply.)
    Object.defineProperty(doc, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => 'visible' });
    g.addEventListener('visibilitychange', swallow, true);   // (the browser's own change of it is not heard)
    const E = g.Event?.prototype, d = E && Object.getOwnPropertyDescriptor(E, 'timeStamp');
    if (d?.get) { saved.timeStamp = d; Object.defineProperty(E, 'timeStamp', { configurable: true, get() { return d.get.call(this) + offset; } }); }
  }
  function uninstallPage() {
    delete doc.hidden; delete doc.visibilityState;
    g.removeEventListener('visibilitychange', swallow, true);
    if (saved.timeStamp) Object.defineProperty(g.Event.prototype, 'timeStamp', saved.timeStamp);
    saved.timeStamp = null;
  }
  // Animations the browser runs on its own clock (el.animate, CSS transitions): set to their time on this clock every 16 ms and finished when it is up, so a
  // `finished` promise or an `onfinish` the page waits on arrives in a pane the browser is not drawing. Looked at every 16 ms of app time.
  const seen = new WeakMap();
  function syncAnimations() {
    if (!doc?.getAnimations) return;
    const t = now();
    for (const a of doc.getAnimations()) {
      if (a.playState !== 'running' || a.timeline !== doc.timeline) continue;
      const rt = a.playbackRate;
      let rec = seen.get(a);
      if (!rec || rec.rt !== rt) { rec = { v0: t, c0: Number(a.currentTime) || 0, rt }; seen.set(a, rec); }
      const end = Number(a.effect?.getComputedTiming?.().endTime);
      if (!(end > 0) || end === Infinity) continue;
      const cur = rec.c0 + (t - rec.v0) * rt;
      if (rt > 0 ? cur >= end : cur <= 0) { try { a.finish(); } catch { /* (an animation that cannot finish) */ } continue; }
      // (Taken there on the way, not only at its end: a pane the browser is not drawing does not run the animation's clock, so a fade the page
      // left to the browser stood at its first frame until its end and then jumped (a Compare bar at 0 for 280 ms and then 1, a sheet's close at 1 for 130 ms and then 0),
      // which a play-test read as a pop. Where the browser does run it, its time and this one agree and nothing is written.)
      const at = Number(a.currentTime);
      if (Number.isFinite(at) && Math.abs(at - cur) > 2) { try { a.currentTime = cur; } catch { /* (one that will not be set) */ } }
    }
  }

  function install() {
    if (on) return;
    on = true; offset = 0; nowBase = now(); dateBase = nat.dateNow();
    saved.perfNow = Object.getOwnPropertyDescriptor(perf, 'now');
    perf.now = () => now();
    g.setTimeout = (cb, d, ...a) => addTimer(cb, d, a, false);
    g.setInterval = (cb, d, ...a) => addTimer(cb, d, a, true);
    const clear = (nativeClear) => (id) => { if (id >= BASE) timers.delete(id); else nativeClear?.(id); };
    g.clearTimeout = clear(nat.clearTimeout); g.clearInterval = clear(nat.clearInterval);
    g.Date.now = () => Math.floor(dateBase + (now() - nowBase));
    if (nat.raf) {
      g.requestAnimationFrame = (cb) => { const id = ++seq; rafs.set(id, cb); poke(); return id; };
      g.cancelAnimationFrame = (id) => { if (id >= BASE) { rafs.delete(id); current?.delete(id); } else nat.caf?.(id); };
    }
    if (nat.ric) {
      // (An idle callback runs a few ms on, told it has the time: the browser holds them back in a pane it is not drawing.)
      g.requestIdleCallback = (cb, o) => addTimer(() => cb({ didTimeout: false, timeRemaining: () => 8 }), Math.min(Number(o?.timeout) || 4, 4), [], false);
      g.cancelIdleCallback = (id) => { if (id >= BASE) timers.delete(id); else nat.cic?.(id); };
    }
    if (doc) { installPage(); addTimer(syncAnimations, STEP, [], true, true); }
  }

  function start() {
    if (!on || driving) return;
    driving = true; lastReal = realNow(); credit = 0;
    if (!port) {
      const ch = new (g.MessageChannel || MessageChannel)();
      ch.port1.onmessage = step; ch.port1.unref?.();
      port = ch.port2;
    }
    poke();
  }
  function stop() { driving = false; if (waitT) { nat.clearTimeout(waitT); waitT = 0; } }

  function dispose() {
    if (!on) return;
    stop(); on = false;
    if (saved.perfNow) Object.defineProperty(perf, 'now', saved.perfNow); else delete perf.now;
    g.Date.now = (...a) => nat.dateNow(...a);
    g.setTimeout = nat.setTimeout; g.setInterval = nat.setInterval; g.clearTimeout = nat.clearTimeout; g.clearInterval = nat.clearInterval;
    if (nat.raf) { g.requestAnimationFrame = nat.raf; g.cancelAnimationFrame = nat.caf; }
    if (nat.ric) { g.requestIdleCallback = nat.ric; g.cancelIdleCallback = nat.cic; }
    // (What was waiting goes back to the browser's own clock for what is left of its time; the page's ids for them are not known to it,
    // so a clear after this does not reach them.)
    const n = now();
    for (const t of timers.values()) if (!t.internal) call(() => (t.every ? nat.setInterval(t.cb, t.every, ...t.args) : nat.setTimeout(t.cb, Math.max(0, t.due - n), ...t.args)), []);
    for (const cb of rafs.values()) nat.raf?.(cb);
    timers.clear(); rafs.clear();
    if (doc) uninstallPage();
  }

  return {
    install, dispose, start, stop, advanceTo, advance: (ms) => advanceTo(now() + ms), now, real: realNow, hooks,
    /** A timer of the clock's own (the animation look, the engine's tick): it fires when due but never keeps the loop spinning. Returns a stop function. */
    every(fn, ms) { const id = addTimer(fn, ms, [], true, true); return () => timers.delete(id); },
    get rate() { return rate; }, set rate(v) { rate = Math.max(1, Number(v) || 1); },
    get on() { return on; }, get running() { return driving; }, get offset() { return offset; },
    stats: () => ({ now: now(), offset, timers: timers.size, frames: rafs.size, framesRun: frames, rate, running: driving }),
    syncAnimations,
  };
}
