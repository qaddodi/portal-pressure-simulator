// The test clock, for the page (16 Nov 2026). pps.testClock(true | false | rate | { rate }) puts the page on a clock that runs the same in a window
// that is not in front, so play-tests and pps.cameraGate run at full pace and judge moves in the app's own time (src/test-clock.js says how).
// Loaded when asked: by pps.testClock, by pps.cameraGate, or at boot by ?testclock (test-boot.js has already swapped the clocks then).
//   ?testclock          the page starts on the test clock (rate 1 until the figure is up, then the rate below)
//   ?testclock=8        the same, at most 8 times real pace (default 5; 1 is real pace, immune to a throttled pane)
//   await pps.testClock(true)    await pps.testClock({ rate: 10 })    await pps.testClock(false)    pps.testClock() → the state
// The engine runs in a worker with clocks of its own: every 16 ms of app time it is sent the time (worker.js runs its timers up to it) and
// the loop waits when the worker is more than a few ticks behind, so the model's time and the page's stay together.
import { createTestClock } from '../test-clock.js';
import { host } from './host.js';
import { retimeFrames } from './frame.js';

const DEFAULT_RATE = 5, BEAT_MS = 16, LAG_TICKS = 4, LAG_REAL_MS = 1500;
let clock = null, stopBeat = null, sent = 0, acked = 0, ackAt = 0, linked = false, wantRate = DEFAULT_RATE;

const engineKind = () => document.querySelector('[data-engine]')?.dataset.engine;
const state = () => ({ on: !!clock?.on, rate: clock?.rate ?? 0, engine: linked ? 'worker on the test clock' : engineKind() || 'not up yet', ...(clock ? { ...clock.stats(), offset: Math.round(clock.offset) } : {}) });

function beat() {
  if (engineKind() === 'worker') {
    // (Each tick says it is on: a worker that was restarted catches up from its first one.)
    host.send({ type: 'testclock', on: true, now: clock.now(), seq: ++sent });
    if (!linked) { linked = true; ackAt = clock.real(); host.send({ type: 'visibility', visible: true }); }
  }
}
function link() {
  host.on('testclockAck', (m) => { acked = Math.max(acked, m.seq); ackAt = clock.real(); });
  clock.hooks.gate = () => !linked || sent - acked <= LAG_TICKS || clock.real() - ackAt > LAG_REAL_MS;   // (a worker that stops answering does not hold the page for ever)
  stopBeat = clock.every(beat, BEAT_MS);
}

/** Turns the test clock on or off, or sets its rate; answers its state. `arg` is true, false, a rate or { rate }. */
export async function testClock(arg) {
  if (arg === undefined) return state();
  const off = arg === false || arg === 0;
  const rate = typeof arg === 'number' && arg >= 1 ? arg : arg && typeof arg === 'object' && arg.rate >= 1 ? +arg.rate : null;
  if (off) {
    if (clock?.on) {
      stopBeat?.(); stopBeat = null; clock.hooks.gate = null;
      if (linked) host.send({ type: 'testclock', off: true });
      linked = false;
      retimeFrames(() => clock.dispose());
      if (engineKind() === 'worker') host.send({ type: 'visibility', visible: !document.hidden });
    }
    clock = null;
    return state();
  }
  if (rate) wantRate = rate;
  if (!clock) {
    const boot = window.ppsTestClock;   // (the clock ?testclock made at boot: test-boot.js)
    if (boot?.on) { clock = boot; wantRate = rate || boot.wanted || wantRate; }
    else { clock = createTestClock(window, { rate: wantRate }); retimeFrames(() => clock.install()); clock.start(); }
    link();
  }
  clock.rate = wantRate;
  return state();
}

/** For a gate: the clock is on for the run, and put back after it if the gate was what turned it on. Returns the function that puts it back. */
export async function withTestClock(rate) {
  const was = !!clock?.on;
  await testClock(rate || true);
  return () => (was ? state() : testClock(false));
}
