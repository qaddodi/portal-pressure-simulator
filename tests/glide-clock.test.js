// Mohammad, 29 Oct (iPhone): "when I untuck and tuck card stacked ... the view is snapping into new camera position instead of easing".
// The camera's refit to a card that moved begins just after the layout and label passes the same change sets off, on a phone a frame or
// two of 100 ms or more. Timed on the wall clock, such a frame carried the glide a third of the way in one step. A refit glide now runs on
// glideClock: the first frame draws the start, and no frame advances it by more than STEP_MAX. (Code only: nobody has looked on screen.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glideClock, STEP_MAX } from '../src/ui/glide-clock.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
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
const stage = read('src/ui/stage.js'), presenter = read('src/ui/presenter.js'), lobule = read('src/ui/lobule-zoom.js'), proc = read('src/ui/proc-anim.js');

test('the stage times a steady glide by the clock, and never a drift or a move on an arc', () => {
  const a = fn(stage, 'function animateVT(');
  assert.match(a, /const clock = opt\.steady && !drift && !arcRun \? glideClock\(\) : null;/);
  assert.match(a, /clamp\(\(clock \? clock\(now\) : now - t0\) \/ ms, 0, 1\)/, 'and the step reads it');
});

test('the refits to cards that moved are steady: the presenter\'s, the catheter\'s and a procedure\'s shot, the stage\'s own home and Tests-card refits', () => {
  assert.match(fn(presenter, 'function fitAround('), /stage\.cathFocus\(cath\.cam, ms, \{ both: true, steady: true \}\)/);
  assert.match(fn(presenter, 'function fitAround('), /\{ drift: true \} : \{ steady: true \}/);
  assert.match(fn(presenter, 'function frameTo('), /stage\.fitSlow\(ms, opt\)/, 'a whole-figure refit takes it');
  assert.match(fn(stage, 'function frameBox('), /\{ arc: true, steady: !!opt\.steady, scale: !opt\.steady \}/, 'and a region\'s');
  assert.match(stage, /fitSlow\(ms = 1300, opt = \{\}\) \{[^\n]*animateVT\(to, ms, opt\.steady \? \{ steady: true \} : \{ scale: true \}\)/);
  assert.match(fn(stage, 'function cathFocus('), /\{ both = false, near = false, arc = false, steady = false \}/);
  assert.equal((fn(stage, 'function cathFocus(').match(/steady/g) || []).length, 3, 'a treatment\'s shots and the route\'s framing pass it on');
  assert.match(proc, /refit\(ms = 700\) \{[^\n]*stage\.cathFocus\(shot, ms, \{ steady: true \}\)/);
  assert.match(stage, /animateVT\(d, 400, \{ steady: true \}\)/, 'the home look');
  assert.match(fn(stage, 'function refit('), /animateVT\(to, 420, \{ steady: true \}\)/, 'the Tests card\'s refit');
});

test('a slide\'s own framing, the buttons and the catheter\'s trips keep the wall clock, so each ends when the presenter waits for it', () => {
  assert.equal((stage.match(/steady: true/g) || []).length, 3, 'only the three refits in the stage ask for it');
  assert.doesNotMatch(fn(presenter, 'async function camera('), /steady/);
});

test('the lobule\'s refit to a changed room is steady', () => {
  assert.match(lobule, /if \(atFit\) glideTo\(F0, 260, false, null, 'inOut', true\);/);
  assert.match(lobule, /glideTo\(to, 420, false, null, 'inOut', true\); atFit = fit;/);
  assert.match(fn(lobule, 'function glideTo('), /const clock = steady \? glideClock\(\) : null;[\s\S]*clamp\(\(clock \? clock\(now\) : now - t0\) \/ ms, 0, 1\)/);
});

test('the sinusoid view counts a frame at most STEP_MAX long', () => {
  assert.match(read('src/ui/sinusoid-view.js'), /const s = Math\.min\(Math\.max\(dt, 0\), STEP_MAX \/ 1000\)/);
});

// A card that only folded, docked or settled changes neither the projector size nor the text size: the label passes (every label laid out
// again and every stage style read again) are left out of the layout pass that begins the camera's glide.
test('a layout pass that is no resize leaves the label passes out when the sizes are the same', () => {
  const sl = fn(presenter, 'function setLabels(');
  assert.match(sl, /const key = `\$\{k\}\|\$\{stage\.labelScale\(\)\}`;\s*if \(unchanged && key === labelsFor\) return;\s*labelsFor = key;\s*stage\.setProjection\(k\);/);
  assert.match(presenter, /\n {4}setLabels\(!turn\);\n/, 'onResize asks for it only when no resize came');
  assert.equal((presenter.match(/setLabels\(\)/g) || []).length, 3, 'the start, a new text size and a new card width lay the labels out in full');
  assert.match(presenter, /stage\.setProjection\(false\); labelsFor = '';/, 'and the next talk starts afresh');
});
