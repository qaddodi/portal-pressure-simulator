import { stageSource } from './stage-src.js';
// Mohammad, 29 Oct (iPhone): "when I untuck and tuck card stacked ... the view is snapping into new camera position instead of easing".
// The camera's refit to a card that moved begins just after the layout and label passes the same change sets off, on a phone a frame or
// two of 100 ms or more. Timed on the wall clock, such a frame carried the glide a third of the way in one step. A refit glide now runs on
// glideClock: the first frame draws the start, and no frame advances it by more than STEP_MAX. (Code only: nobody has looked on screen.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glideClock, STEP_MAX } from '../src/ui/glide-clock.js';
import { presenterSource } from './split-src.js';

// (A function's text from its head to its closing brace, the braces of its default parameters passed over.)
const fn = (src, head) => {
  const i = src.indexOf(head);
  assert.ok(i >= 0, head);
  let d = 0, j = src.indexOf(') {', i) + 2;
  const from = j;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
  return src.slice(i, j + 1) + src.slice(from, from);
};

test('the first frame draws the start of the glide, however late it comes', () => {
  const c = glideClock();
  assert.equal(c(5000), 0);
  assert.equal(c(5016), 16);
});

test('at ordinary frame rates the clock is the wall clock', () => {
  const c = glideClock();
  let t = 1000;
  c(t);
  for (let i = 1; i <= 24; i++) { t += 16.7; assert.ok(Math.abs(c(t) - 16.7 * i) < 1e-9); }
  const c30 = glideClock(); t = 0; c30(t);
  for (let i = 1; i <= 12; i++) { t += 33.3; assert.ok(Math.abs(c30(t) - 33.3 * i) < 1e-9); }
});

test('a slow frame advances the glide by STEP_MAX at most, and the frames after it go on from there', () => {
  const c = glideClock();
  c(0); c(16);
  assert.equal(c(316), 16 + STEP_MAX, 'a 300 ms frame counts as STEP_MAX');
  assert.equal(c(332), 16 + STEP_MAX + 16);
  assert.ok(STEP_MAX >= 33 && STEP_MAX <= 50, 'above a 30 fps frame, below a visible jump');
});

test('a clock that goes back (a timestamp from before the glide began) never runs the glide backwards', () => {
  const c = glideClock();
  c(100);
  assert.equal(c(90), 0);
  assert.equal(c(106), 16, 'and goes on from the earlier time');
});

// ── Where it is used ──
const stage = stageSource(), presenter = presenterSource();


test('the refits to cards that moved are steady: the presenter\'s, the catheter\'s and a procedure\'s shot, the stage\'s own home and Tests-card refits', () => {
  assert.equal((fn(stage, 'function cathFocus(').match(/steady/g) || []).length, 6, 'a treatment\'s shots, BRTO and BATO\'s (oblitFocus), EUS coils and glue\'s (glueFocus), the TIPS that coils\' (coilFocus) and the route\'s framing pass it on');
});

test('a slide\'s own framing, the buttons and the catheter\'s trips keep the wall clock, so each ends when the presenter waits for it', () => {
  assert.equal((stage.match(/steady: true/g) || []).length, 4, 'only the four refits in the stage ask for it: the Tests card closing, the cards\' refit of a fitted view, the pan that keeps a zoom clear of the cards (17 Nov), and the tubes\' option');
});



// A card that only folded, docked or settled changes neither the projector size nor the text size: the label passes (every label laid out
// again and every stage style read again) are left out of the layout pass that begins the camera's glide.
test('a layout pass that is no resize leaves the label passes out when the sizes are the same', () => {
  assert.equal((presenter.match(/setLabels\(\)/g) || []).length, 3, 'the start, a new text size and a new card width lay the labels out in full');
});
