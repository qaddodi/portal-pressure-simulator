// A view change never lands in one jump after a long frame (16 Nov 2026, Mohammad: "going from sinusoid to lobule doesn't zoom out the first time").
// The first time the zoom out of the sinusoid runs, the lobule is drawn again at its framing while the bars and dock come back, which is a long
// frame (200 ms on a laptop with a cirrhotic liver, far more on a tablet with nothing kept yet). The zoom ran on the wall clock, so that frame
// carried it most of the way in one step and the view appeared to snap to the lobule; the next times the draw was kept and nothing showed.
// Every view change (the sinusoid zoom, the dive and rise, Anatomy to Circuit, the turn) now runs on a clock that a long frame only pauses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReversible, VIEW_STALL_MAX, FIRST_FRAMES } from '../src/ui/motion.js';
import { STALL_MAX } from '../src/ui/glide-clock.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Run a clock on frames at `gap` ms, with one long frame of `stallMs` after `at` ms; returns the biggest step the progress took in one frame. */
function maxStep(clock, { gap = 16, stallMs = 900, at = 250, total = 4000 } = {}) {
  clock.aim(1);
  let t = 0, prev = clock.tick(t), biggest = 0, stalled = false;
  while (clock.moving && t < total) {
    t += !stalled && t >= at ? (stalled = true, stallMs) : gap;
    const x = clock.tick(t);
    biggest = Math.max(biggest, x - prev); prev = x;
  }
  return { biggest, t, x: clock.x };
}

test('a long frame in the middle of a view change pauses it: the biggest step is a frame of STALL_MAX, not the stall', () => {
  const rate = 1 / 1150;
  const wall = maxStep(createReversible({ ms: 1150 }));
  assert.ok(wall.biggest > 0.5, `the plain wall clock jumps ${wall.biggest.toFixed(2)} of the move in the stalled frame (the bug)`);
  const held = maxStep(createReversible({ ms: 1150, stall: VIEW_STALL_MAX }));
  assert.ok(held.biggest <= rate * VIEW_STALL_MAX * 1.001, `a stalled frame moves it at most ${(rate * VIEW_STALL_MAX).toFixed(3)}, moved ${held.biggest.toFixed(3)}`);
  assert.equal(held.x, 1, 'and it still lands');
});

test('the view clock\'s cap is the camera\'s (STALL_MAX), and a normal frame rate is not slowed', () => {
  assert.equal(VIEW_STALL_MAX, STALL_MAX);
  const c = createReversible({ ms: 1000, stall: VIEW_STALL_MAX });
  c.aim(1);
  let t = 0; c.tick(t);
  for (let i = 0; i < FIRST_FRAMES + 3; i++) c.tick(t += 16.7);
  const before = c.x; c.tick(t + 50);
  assert.ok(Math.abs(c.x - before - 0.05) < 1e-9, 'a 50 ms frame (20 fps) advances the true 50 ms');
});

test('every clock that runs a change of view takes the cap', () => {
  const lz = read('src/ui/lobule-zoom.js'), stage = read('src/ui/stage.js');
  assert.match(lz, /sinClock = createReversible\(\{ ms: 1150, stall: VIEW_STALL_MAX \}\)/, 'the zoom into and out of the sinusoid');
  assert.match(stage, /diveClock = createReversible\(\{ ms: DIVE_FULL_MS, stall: VIEW_STALL_MAX \}\)/, 'the dive into and the rise out of the lobule');
  assert.match(stage, /viewClock = createReversible\(\{ ms: VIEW_CHANGE_S \* 1000, stall: VIEW_STALL_MAX, x: morph \}\)/, 'Anatomy to Circuit');
  assert.match(stage, /turnClock = createReversible\(\{ ms: TURN_MS, stall: VIEW_STALL_MAX, x: rotU \}\)/, 'the circuit\'s quarter turn');
  // No view clock is made without the cap: a new createReversible in the stage or the lobule must say so or carry the marker.
  for (const [name, src] of [['lobule-zoom.js', lz], ['stage.js', stage]]) {
    for (const m of src.matchAll(/createReversible\(\{[^}]*\}\)/g)) assert.match(m[0], /stall:/, `${name}: ${m[0]} is a move of the view and takes stall: VIEW_STALL_MAX`);
  }
});
