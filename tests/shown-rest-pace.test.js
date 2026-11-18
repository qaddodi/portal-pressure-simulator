// A running model's tiles, bars and marks follow it on the page's one shown state (shown.js). At rest (frame.js restGapFor: 4 s with no input
// and nothing moving) they step 30 a second and wait on a timer between steps, not on every screen frame: on Mohammad's iPhone at rest
// (the ?lap of 13 Nov 2026) the shown state called back 40 times a second, wrote the cards each time, and woke the glass and the readers beside
// them. The filter is exact in time, so the glide lands where it did. Any input gives the full rate back.
// A fake page: a clock, the screen's frames and the timers, all driven by the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
let T = 100000, rafs = [], timers = [], tid = 0;
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true });
globalThis.setTimeout = (f, ms = 0) => { timers.push({ id: ++tid, f, at: T + ms }); return tid; };
globalThis.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: { hasAttribute: () => false } };

const F = await import('../src/ui/frame.js');
const { shownState } = await import('../src/ui/shown.js');

// One screen frame (16.7 ms): due timers run first, then the frame's callbacks.
const screenFrame = () => {
  T += 16.7;
  for (const t of timers.filter((x) => x.at <= T)) { timers = timers.filter((x) => x !== t); t.f(); }
  const q = rafs; rafs = [];
  for (const cb of q) cb(T);
};
const OPTS = { small: 0.05, eps: 0.005 };

test('at rest the shown state steps on a timer at the rest rate, not on every screen frame, and lands on the same value', () => {
  T += 6000;   // (the page has been left alone for 6 s: rest pacing is on)
  assert.ok(F.restGapFor(T) > 0, 'rest pacing is on');
  const before = F.perf().totals.asks.shown || 0;
  shownState.set('tile', 10, OPTS);
  shownState.set('tile', 14, OPTS);   // (a real step: it glides)
  assert.ok(shownState.moving);
  let steps = 0, frames = 0;
  const unsub = shownState.on(() => { steps++; });
  while (shownState.moving && frames < 600) { screenFrame(); frames++; }
  unsub();
  assert.equal(shownState.get('tile'), 14, 'lands exactly on the target');
  const asked = (F.perf().totals.asks.shown || 0) - before;
  assert.ok(steps >= 5, `it stepped (${steps})`);
  assert.ok(asked <= steps, `a frame is asked for each step only (${asked} asks, ${steps} steps), not one per screen frame (${frames})`);
  assert.ok(steps < frames * 0.75, `fewer steps (${steps}) than screen frames (${frames}) at rest`);
});

test('after an input the full rate is back: a step on every screen frame', () => {
  F.noteInput(T);
  assert.equal(F.restGapFor(T), 0, 'no rest gap just after a touch');
  shownState.set('tile', 20, OPTS);
  shownState.set('tile', 24, OPTS);
  let steps = 0, frames = 0;
  const unsub = shownState.on(() => { steps++; });
  while (shownState.moving && frames < 40 && F.restGapFor(T) === 0) { screenFrame(); frames++; }
  unsub();
  assert.ok(frames >= 5 && steps >= frames - 1, `a step a screen frame: ${steps} steps in ${frames} frames`);
});
