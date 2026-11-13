// A procedure slide's numbered steps carry two marks (Mohammad, 13 Nov 2026): the fill is the step the animation is on (it follows the catheter or the
// scope and catches up); the ring is the step Next or Back has navigated to (set at once). presenter.js keeps each with the slide it belongs to
// (procShown/procShownAt, procRing/procRingAt), paints them on the live card (procPaint) and on a card built afresh (procEl); styles/app.css draws them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = read('../src/ui/presenter.js'), css = read('../styles/app.css');

test('the ring is an outline in the accent a hair outside the circle, nothing animated, and the row starts a ring in so the card\'s clip never cuts it', () => {
  assert.match(css, /\n\.pz-proc\.at \.pz-step \{ outline: 1\.5px solid var\(--accent\); outline-offset: 1px; \}/);
  assert.match(css, /\n\.pz-procs \{ --pz-ring: 3px; padding: 0 0 2px var\(--pz-ring\); \}/, 'the words\' card clips at its own edge: a step that opens a row needs the ring\'s width, the last row 2px below');
  assert.match(css, /\n\.pz-proc\.on \.pz-step \{ background: var\(--accent\); color: var\(--on-accent\); \}/, 'the fill is the step the animation is on');
  assert.doesNotMatch(css.match(/\n\.pz-proc \.pz-step \{([^}]*)\}/)?.[1] || '', /outline|box-shadow/, 'no transition: the ring moves with a tap');
});

test('each mark belongs to its slide and shows on the live card and on a card built afresh', () => {
  assert.match(src, /const procAtOf = \(i\) => \(procShownAt === i \? procShown : -1\), procRingOf = \(i\) => \(procRingAt === i \? procRing : -1\);/);
  assert.match(src, /const cur = procAtOf\(want\), ring = procRingOf\(want\);/);
  assert.match(src, /b\.classList\.toggle\('at', k === ring\); if \(k === ring\) b\.setAttribute\('aria-current', 'step'\)/);
  assert.match(src, /const steps = procSteps\(s\), cur = procAtOf\(i\), ring = procRingOf\(i\);/, 'a card rebuilt (a resize, a theme) keeps both');
  assert.match(src, /class: `pz-proc\$\{k === cur \? ' on' : ''\}\$\{k < cur \? ' done' : ''\}\$\{k === ring \? ' at' : ''\}`/);
  assert.doesNotMatch(src, /procRun && k === procShown/, 'neither depends on a run in flight: both stay on the last step once played through');
});

test('the fill follows the animation, the ring follows the taps', () => {
  assert.match(src, /onStep: \(k\) => \{ if \(procRun === run\) \{ procShown = base \+ k; procShownAt = i; procPaint\(\); \} \}/, 'the fill: the step the catheter is on');
  assert.match(src, /const procTarget = \(\) => \{ if \(!procHeld\(\)\) return; procRing = procRunBase \+ procRun\.at; procRingAt = want; procPaint\(\); \};/, 'the ring: the run\'s target step');
  assert.match(src, /if \(procRun\) \{ const ok = procRun\.next\(\); if \(ok\) procTarget\(\); return ok \|\| procChain\(\); \}/, 'Next rings its step at once');
  assert.match(src, /!procRun\.back\(\)\) return false; procTarget\(\); return true;/, 'Back moves the ring back at once');
  assert.match(src, /if \(!park\) \{ procShown = base - 1; procShownAt = i; procRing = base; procRingAt = i; \}/, 'a run that starts rings its first step and fills none yet, never the step another slide ended on');
});

test('Back to the start, a reading, a slide opened forward or back onto a played-through one, a stopped run: both marks agree with the slide', () => {
  assert.match(src, /if \(rewound && mine\(\) && isThen\) \{ procThenAt = i; procShown = base - 1; procShownAt = i; procRing = base - 1; procRingAt = i; \}/);
  assert.match(src, /procShown = -1; procShownAt = -1; procRing = -1; procRingAt = -1; procDoneAt = -1; \}/, 'Back past the first step marks none');
  assert.match(src, /procShown = procRing = procDoneAt === to \? procSteps\(s\)\.length - 1 : -1; procShownAt = procRingAt = procDoneAt === to \? to : -1;/, 'Back onto a played-through slide marks its last step; forward marks none');
  assert.match(src, /procRun = null; procShown = -1; procShownAt = -1; procRing = -1; procRingAt = -1; procPaint\(\);/, 'stopping a run at home clears both');
});
