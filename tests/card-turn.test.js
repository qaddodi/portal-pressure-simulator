// The slide-change card motion: every kind of slide gets the same leave and entrance (Mohammad, 1 Nov: a question card next
// made every card pop out), the glass fades on the words' own clock in place, and the words never move past the glass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const body = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('every kind of slide coming turns the words the same way: question, case, visual and new patient included', () => {
  const g = body('glassTurn'), on = g.slice(g.indexOf('const on ='), g.indexOf(';', g.indexOf('const on =')));
  for (const left of ['!ask', '!ct', '!s.visual', '!s.vignette']) assert.ok(!on.includes(left), `${left} would leave that kind of slide out of the motion`);
  assert.match(on, /const on = up && !booting && !reduce\.matches/);
});

test('every leave says which way the words go, set with the leave itself', () => {
  const w = body('wordsOut');
  assert.match(w, /if \(!keepNow\.text\) ui\.text\.dataset\.out = turnNow;/);
  assert.ok(w.indexOf('dataset.out = turnNow') < w.indexOf("el.classList.add('pz-leave')"));
});

test('the words move the slide\'s own step, and nothing is clipped or resized in view', () => {
  assert.match(body('glassTurn'), /setProperty\('--pz-turn-d', `\$\{turnRoom\(\)/);
  assert.ok(!/clipPath|clip-path/.test(body('pullTo') + body('pullLet') + body('wordsTurnIn') + body('wordsFreeze')));
  assert.ok(!/\.pz-shade[^{]*\.pz-turn[^f][^{]*\{[^}]*var\(--d-camera\)/.test(css), 'the glass never eases its size over the camera');
});

test('the glass fades in place on the words’ own curve on a turn', () => {
  assert.match(body('setTurn'), /ui\.shade\.classList\.toggle\('pz-turnfade', on\)/);
  assert.doesNotMatch(src, /GLASS_STAY|glassStays|stayTurn|glassstay/);
  assert.match(css, /\.pz-turnfade:is\(\.pz-card, \.stack\) \{ transform: none; \}/);
  assert.match(css, /\.pz-turnfade:is\(\.pz-card, \.stack\)\.pz-leave \{ transition-timing-function: var\(--ease-in\)/);
  assert.match(css, /\.pz-turnfade:is\(\.pz-card, \.stack\):not\(\.pz-leave\) \{ transition-timing-function: var\(--ease-arrive\)/);
});

test('the words follow the finger only on a swipe that changes the slide (never a procedure step, beat, time-lapse or case lift)', () => {
  const i = src.indexOf('const turnsSlide = (dx) =>'), t = src.slice(i, src.indexOf(';', i));
  for (const k of ['!caseLift', '!lapseOn', '!procRun', '!procWait', '!slides[want]?.procedure', 'beat >= lastBeat(want)', 'beat === 0']) assert.ok(t.includes(k), k);
  assert.match(src, /const pullCan = \(dx\) => turnsSlide\(dx\) && !!ui && !changing\(\)/);
  assert.match(src, /!pullCan\(dx\)\) return;/);
});
