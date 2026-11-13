// The step a procedure slide's Next or Back last reached is ringed on the card's numbered steps (Mohammad, 13 Nov 2026: "a small circle outside
// the current step ... so I know where I skipped to"). presenter.js keeps the step and the slide it belongs to (procShown, procShownAt), paints
// it on the live card (procPaint) and on a card built afresh (procEl); styles/app.css draws the ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = read('../src/ui/presenter.js'), css = read('../styles/app.css');

test('the ringed step is the lit one: an outline in the accent a hair outside the circle, nothing animated', () => {
  const rule = css.match(/\n\.pz-proc\.on \.pz-step \{ outline:([^}]*)\}/)?.[1] || '';
  assert.match(rule, /1\.5px solid var\(--accent\)/);
  assert.match(rule, /outline-offset: 1px/);
  assert.doesNotMatch(css.match(/\n\.pz-proc \.pz-step \{([^}]*)\}/)?.[1] || '', /outline|box-shadow/, 'the ring has no transition: it moves with the fill');
});

test('a step is lit only on the slide it belongs to, on the live card and on a card built afresh', () => {
  assert.match(src, /const procAtOf = \(i\) => \(procShownAt === i \? procShown : -1\);/);
  assert.match(src, /const cur = procAtOf\(want\);\n\s+ui\?\.text\.querySelectorAll\('\.pz-proc'\)/, 'procPaint reads the step of the slide on show');
  assert.match(src, /const steps = procSteps\(s\), cur = procAtOf\(i\);/, 'a card rebuilt (a resize, a theme) keeps the ring');
  assert.match(src, /class: `pz-proc\$\{k === cur \? ' on' : ''\}\$\{k < cur \? ' done' : ''\}`/);
  assert.doesNotMatch(src, /procRun && k === procShown/, 'the ring does not depend on a run in flight: it stays on the last step once played through');
});

test('every move of the step sets its slide: Next, Back to the start, a reading, a slide opened forward or back onto a played-through one', () => {
  assert.match(src, /onStep: \(\) => \{ if \(procRun === run\) \{ procShown = base \+ run\.at; procShownAt = i; procPaint\(\); \} \}/, 'the run\'s target step, not the one the catheter is passing');
  assert.match(src, /const procTarget = \(\) => \{ if \(!procHeld\(\)\) return; procShown = procRunBase \+ procRun\.at; procShownAt = want; procPaint\(\); \};/);
  assert.match(src, /if \(procRun\) \{ const ok = procRun\.next\(\); if \(ok\) procTarget\(\); return ok \|\| procChain\(\); \}/, 'Next rings its step at once');
  assert.match(src, /!procRun\.back\(\)\) return false; procTarget\(\); return true;/, 'Back moves the ring back at once');
  assert.match(src, /if \(rewound && mine\(\) && isThen\) \{ procThenAt = i; procShown = base - 1; procShownAt = i; \}/);
  assert.match(src, /procShown = -1; procShownAt = -1; procDoneAt = -1; \}/, 'Back past the first step rings none');
  assert.match(src, /if \(!park\) \{ procShown = base - 1; procShownAt = i; \}/, 'a run that starts never lights the step another slide ended on');
  assert.match(src, /procShown = procDoneAt === to \? procSteps\(s\)\.length - 1 : -1; procShownAt = procDoneAt === to \? to : -1;/, 'Back onto a played-through slide rings its last step; forward rings none');
  assert.match(src, /procRun = null; procShown = -1; procShownAt = -1; procPaint\(\);/, 'stopping a run at home clears it');
});
