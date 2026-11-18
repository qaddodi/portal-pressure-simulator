// A deck opens under the "Preparing the slides" cover and the cover lifts only on a finished slide (play-test, 16 Nov 2026, build ca029399: the
// first card ghosted behind the cover for about 5 s, then popped in). The wait is src/ui/cover-lift.js; here it runs against a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calmFrames, cardsLanded, createFrameGates } from '../src/ui/cover-lift.js';

// A frame-polled wait on a fake clock: pred is asked every 16 ms until true or ms have passed; resolves with the time it took.
const clock = () => { const c = { t: 0, until: async (pred, ms) => { const t0 = c.t; while (!pred() && c.t - t0 < ms) c.t += 16; return c.t - t0; } }; return c; };

test('the cover waits for a card that is still coming in, however late its entrance runs', async () => {
  const c = clock(); const landsAt = 1800;   // (a slow machine: the card's fade ends 1.8 s after the cover would have lifted)
  const took = await cardsLanded({ until: c.until, alive: () => true, entering: () => c.t < landsAt });
  assert.ok(took >= landsAt && took < landsAt + 32, `waited ${took} ms for a card that lands at ${landsAt}`);
});

test('a card that never lands does not hold the cover for ever (the longest wait is 3 s)', async () => {
  const c = clock();
  const took = await cardsLanded({ until: c.until, alive: () => true, entering: () => true });
  assert.ok(took >= 3000 && took < 3032, String(took));
});

test('the cover does not wait once the talk is over, and with no card entering it lifts at once', async () => {
  const c = clock();
  assert.equal(await cardsLanded({ until: c.until, alive: () => false, entering: () => true }), 0);
  assert.equal(await cardsLanded({ until: c.until, alive: () => true, entering: () => false }), 0);
});

test('the cover\'s own fade starts on smooth frames: the presenter\'s smooth gate, cut when the talk is over, at most 600 ms', async () => {
  let cut, ms;
  const smooth = async (c, m) => { cut = c; ms = m; };
  let up = true;
  await calmFrames({ smooth, alive: () => up });
  assert.equal(ms, 600);
  assert.equal(cut(), false); up = false; assert.equal(cut(), true);
});

test('smooth waits for two prompt frames in a row (under 40 ms apart) and gives up after ms; painted never waits more than 100 ms for a hidden tab', async () => {
  const { smooth, painted } = createFrameGates((cb) => setTimeout(cb, 1));   // (frames 1 ms apart: prompt)
  const t0 = performance.now(); await smooth(() => false, 700);
  assert.ok(performance.now() - t0 < 300, 'prompt frames: returns after two of them, not the whole 700 ms');
  const hidden = createFrameGates(() => {});   // (a hidden tab paints none)
  const t1 = performance.now(); await hidden.painted();
  assert.ok(performance.now() - t1 >= 90 && performance.now() - t1 < 400);
  const slow = createFrameGates((cb) => setTimeout(cb, 80));   // (long frames: never two prompt ones)
  const t2 = performance.now(); await slow.smooth(() => false, 300);
  assert.ok(performance.now() - t2 >= 280, 'long frames: waits out the cap');
  assert.equal(typeof painted, 'function');
});
