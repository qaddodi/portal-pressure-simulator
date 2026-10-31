// Into or out of the lobule (Present and Patients, every deck): the ascites filling, a varix growing or the liver changing paused while
// the view zoomed and went on once it landed (Mohammad, 30 Oct: "animations should continue to play while we zoom"). Now the anatomy
// follows the patient, drawn, for as long as it shows through the dive or the rise; only once the lobule or the dive's field covers it
// does it follow unseen (followHidden), and at rest nothing under the zoom is redrawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const fn = (head) => { const i = st.indexOf(head); assert.ok(i >= 0, head); return st.slice(i, st.indexOf('\n  }\n', i) + 4); };
const line = (head) => { const i = st.indexOf(head); assert.ok(i >= 0, head); return st.slice(i, st.indexOf('\n', i)); };

test('covered means out of sight: the landed lobule, the lobule or field over it, or the dive hiding it under a whole field', () => {
  const c = line('const anatCovered = () =>');
  for (const part of ['lobuleOn && diveT >= 1', 'lz?.isOpen()', 'lz?.covers()', 'diveHid && diveT > 0 && diveT < 1']) assert.ok(c.includes(part), part);
  // Without live-painted organs an ease drops the organs' picture for the scaled SVG (Safari loses its masked groups): held as before.
  assert.ok(c.includes('lobuleOn && !liveOn()'));
  // Merely diving (lobuleOn) is not covered: the anatomy is still on screen for the first part of the zoom.
  assert.doesNotMatch(c, /\(\) => lobuleOn \|\|/);
});

test('model frames update the anatomy while it shows through the zoom, and only follow unseen once it is covered', () => {
  const inner = fn('  function updateInner(f) {');
  assert.match(inner, /const under = anatCovered\(\) && !catchUp && !risePrep;/);
  assert.match(inner, /if \(under\) \{ followHidden\(f\); return; \}/);
  assert.doesNotMatch(inner, /const under = \(lobuleOn/);
  // The display frames between model frames step the widths and the organs there too (not the whole update each frame).
  assert.match(fn('  function stepWidths() {'), /if \(anatCovered\(\) \|\| hid\.at/);
  assert.match(fn('  function stepOrgans() {'), /if \(anatCovered\(\) \|\| hid\.at/);
  // The labels, faded out through the zoom, are not laid out on every model frame of it.
  assert.match(inner, /if \(!\(diveT > 0 && diveT < 1\)\) gpuProbe\.time\(null, 'update: labels'/);
});

test('the frame loop draws what eases while the anatomy shows; at rest the zoom only moves the blood (no idle redraws)', () => {
  const ease = line('const anatEasing = () =>') + st.slice(st.indexOf('const anatEasing = () =>')).split('\n')[1];
  assert.match(ease, /liveOn\(\) && !anatCovered\(\) && !diveHid && diveFadeO !== 0/);
  for (const e of ['widthEasing', 'ascShown !== ascTarget', 'veinsDirty', 'lvMoving', 'spleenMoving()', 'plateEasing()', 'x.reveal']) assert.ok(ease.includes(e), e);
  const loop = fn('  function animate(now) {');
  const gate = loop.indexOf('if (diveT > 0 && diveT < 1 && !drawOnce && !forceDraw && !anatEasing()) {');
  assert.ok(gate > 0, 'the dive holds the figure only when nothing on it eases');
  // Falling through, the usual frame steps the fluid and the widths and draws the vessels; covered, it still sleeps or waits.
  const rest = loop.slice(gate);
  assert.ok(rest.indexOf('stepFluid(dt, st, easeDt)') > 0 && rest.indexOf('drawVeins(fluidMoved)') > 0);
  assert.ok(rest.indexOf('if (lz?.isOpen()) { trimVeins(); sleep(); return; }') < rest.indexOf('stepFluid('));
  // The plate's picture is still not made mid-dive (it waits for the landing): only the live drawing moves.
  assert.match(fn('  function platePoke() {'), /if \(\(lobuleOn && !lz\?\.isOpen\(\)\) \|\| \(diveT > 0 && diveT < 1\)\) return;/);
});

test('out of the lobule, live-painted organs do not hold the rise until they finish easing unseen', () => {
  const ready = fn('  function riseReady() {');
  assert.match(ready, /\(liveOn\(\) \|\| \(!lvMoving && !fluidEasing\(\) && !spleenMoving\(\)\)\)/);
});

// The eases themselves run on time, not on drawn frames: a fill that plays through a dive lands where it would have without one.
test('a fill eased frame by frame through the zoom and one followed unseen reach the same level', async () => {
  const { fluidSpring, fluidSpringFor } = await import('../src/ui/organ-ease.js');
  let a = { shown: 0, vel: 0 };
  for (let i = 0; i < 132; i++) a = fluidSpring(a.shown, a.vel, 6000, 1 / 60);   // 2.2 s of display frames (the dive)
  const b = fluidSpringFor(0, 0, 6000, 2.2);
  assert.ok(Math.abs(a.shown - b.shown) < 6000 * 0.01, `${a.shown} vs ${b.shown}`);
  assert.ok(a.shown > 0 && a.shown < 6000, 'still filling when the zoom lands');
});

// Nothing may flash, flicker or soften mid-zoom (30 Oct review against the Figure resolution work, every option off or on).
test('no organ picture is dropped or swapped mid-zoom: it is made once the dive or the rise has landed', () => {
  const poke = fn('  function platePoke() {');
  assert.match(poke, /if \(\(lobuleOn && !lz\?\.isOpen\(\)\) \|\| \(diveT > 0 && diveT < 1\)\) return;/);
  assert.match(poke, /\|\| \(diveT > 0 && diveT < 1\) \|\| circuitInk\(\)/, 'a raster begun before the zoom does not land in it');
  assert.match(st, /setDiveScale\(1\); lz\.setDiveZoom\(1, 0, 0\); diveLand = null;\n\s+platePoke\(\);/, 'poked once the rise lands');
});

test('Figure resolution never changes the canvas mid-zoom: no fade copy that stands still, no soft rise from While moving', () => {
  assert.match(fn('  function settleRes() {'), /if \(!leftAlone\(280\) \|\| vtGliding \|\| \(diveT > 0 && diveT < 1\)\) \{ autoT = setTimeout\(settled, 120\); return; \}/);
  assert.match(st, /if \(resizeReady && !moveLow && figOpt\('move'\) < 1 && !\(diveT > 0\)\) \{ moveLow = true;/);
  assert.match(fn('  function easeRes() {'), /!\(lz\?\.isOpen\(\) \|\| lz\?\.covers\(\)\) && !diveOrig\) \{\n[^\n]*\n\s+labelHold = true;\n\s+try \{ labelGL\?\.check\(\); if \(!FIGW\) fadeOver\(vCanvas, resFollow, \(\) => veins\?\.present\?\.\(\)\); \} finally \{ labelHold = false; \}/);
  // A redraw through the zoom keeps the camera it started with, so it never counts as a move (settleRes, Adapt's frame gaps).
  const draw = fn('  function drawVeinsNow(fullComposite) {');
  assert.ok(draw.indexOf('if (key !== veinsDrawKey) {') < draw.indexOf('settleRes();'));
});
