import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('./dom-shim.js');   // (svg-gl.js loads with a page)
const { batchHeld, CAM_BEAT_MS } = await import('../src/ui/svg-gl.js');

// Mohammad, 16 Nov 2026 (Varices slide 3, a 10 s time-lapse whose camera moves all through it): "this chart was not drawing in real time as the time
// passes; once the time passed the whole chart just popped into existence". A card's chart is handed over less often while the figure's camera moves
// (svg-gl.js batchRun), but it was held for as long as the camera moved: the lapse's lines, its numbers and its day count all waited for the end.
// batchRun asks batchHeld(cameraMoving, ms since the last hand-over) every CAM_HOLD_MS (100 ms): run the same loop here.
const HOLD_MS = 100;
function handOvers(totalMs, moving) {
  const at = []; let last = 0;
  for (let t = HOLD_MS; t <= totalMs; t += HOLD_MS) if (!batchHeld(moving(t), t - last)) { at.push(t); last = t; }
  return at;
}

test('while the camera moves all through a time-lapse, the card\'s chart is still handed over, at least every CAM_BEAT_MS', () => {
  const lapse = 10000, at = handOvers(lapse, () => true);
  assert.ok(at.length >= lapse / (CAM_BEAT_MS + HOLD_MS) - 1, `${at.length} hand-overs in ${lapse} ms with the camera moving the whole time`);
  const gaps = at.map((t, i) => t - (at[i - 1] ?? 0));
  assert.ok(Math.max(...gaps) <= CAM_BEAT_MS + HOLD_MS, `the longest wait was ${Math.max(...gaps)} ms`);
  // The trail grows with the clock: the share of the lapse drawn at each hand-over rises through it, and the last one before the end is near the end.
  const drawn = at.map((t) => t / lapse);
  assert.ok(drawn.every((v, i) => !i || v > drawn[i - 1]) && drawn.at(-1) > 0.95 && drawn.some((v) => v > 0.4 && v < 0.6), 'the picture shows the lapse partway as well as at its end');
});

test('a camera at rest holds nothing, and a move that stops is followed at once', () => {
  assert.equal(batchHeld(false, 0), false);
  assert.equal(batchHeld(true, CAM_BEAT_MS), false, 'a hand-over is due once the beat has passed');
  assert.equal(batchHeld(true, 10), true, 'and held a little while just after one');
  assert.equal(handOvers(1000, (t) => t < 300).length > 0, true);
});
