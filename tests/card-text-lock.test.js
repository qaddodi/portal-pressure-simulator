import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';

const js = unsnap(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the teaching card text sizes settle once per slide and are reused while it is in view', () => {
  assert.match(js, /textLock = \{ key: lockKey/);
  assert.match(js, /if \(lock\) \{\s*for \(const \[n, v\] of lock\.vars\)/);
  assert.match(js, /if \(!below\) ladder\(\);/);
});

test('the teaching and data cards keep one width on every slide: the column never widens', () => {
  assert.doesNotMatch(js, /widen\(\)/);
  assert.match(js, /dd\.style\.width = cw \? /);
  assert.match(js, /dd\.style\.maxWidth = cw \? 'none'/);
  assert.doesNotMatch(js, /--pz-sw|--pz-cwr/);
  assert.doesNotMatch(css, /--pz-sw|--pz-cwr/);
  assert.match(js, /below = title\(\);\s*if \(!below\) ladder\(\);/);
  assert.match(css, /\.pz\.pz-card:not\(\.stack\) \.pz-text \{ top: calc\(var\(--pz-cm\) \+ var\(--pz-cp\)\);[^}]*width: calc\(var\(--pz-cw\) - 2 \* var\(--pz-cp\)\)/, 'teaching card width from the one card width');
});

test('a tight slide shrinks in fixed steps and the data card never moves to the top right', () => {
  assert.match(js, /const DK = \[0\.9, 0\.8, 0\.7, 0\.6\];/);
  assert.match(js, /if \(!below\) \{ put\(WIDE\.title, WIDE\.words\); below = true; \}/);
  assert.doesNotMatch(js, /let lo = 0\.4/, 'no continuous search down to 0.4');
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

// iPad landscape (15 Oct): when the smallest steps still leave the pair too tall, the instrument folds behind Show, as on a phone.
test('a pair that does not fit at the smallest steps folds the instrument behind Show on a wide screen', () => {
  assert.match(js, /if \(!below && canFold && !held\) \{ setFolds\(true\);[^\n]*below = title\(\); if \(!below\) ladder\(\); \}/);
  assert.match(js, /canFold = dd\.classList\.contains\('has-tool'\) && !dd\.classList\.contains\('tool-only'\) && !dd\.classList\.contains\('tool-lead'\) && !dd\.classList\.contains\('pz-sheet'\);/);
  assert.match(js, /if \(lock\.folds\) setFolds\(true\);/, 'the fold is part of the slide\'s locked layout');
  assert.match(js, /folds: dd\.classList\.contains\('pz-folds'\)/);
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-data\.pz-folds:not\(\.tool-open\) > \.pz-tool \{ max-height: 0; opacity: 0;/);
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-data\.pz-folds \.pz-dh > \.pz-fold \{ display: inline-flex;/);
});

// One chart (Mohammad, 21 Oct): the Gut to heart chart is an instrument, so a card folds only as an instrument card does; the old
// ladder card's own fold (its plot behind Show once its zoom failed, Treatment 2 at 200 % text) went with the ladder.
test('only an instrument card folds behind Show: no ladder fold is left', () => {
  assert.doesNotMatch(js, /ladderFold|footFold|pz-foldstrip|pz-footfold/);
  assert.doesNotMatch(css, /pz-ladder|pz-strip|pz-footfold|pz-foldstrip|pz-tfold/);
  assert.doesNotMatch(css, /\.pz-data\.pz-folds[^{]*:not\(\.has-tool\)/, 'no fold rule for a card without an instrument');
  assert.match(js, /data\.classList\.toggle\('has-tool', !!s\.tool\);/);
});

test('a phone keeps the words\' height cap while a what-if slider or compare button drives the live model', () => {
  // (Re-planned on each live reading, the cap stepped as the data card's numbers changed and the teaching card shook under the finger.)
  assert.match(js, /if \(held && \(held\.shut \|\| gone \|\| readingsOnly\(\)\)\) \{ phoneShut = held\.shut; phoneFig = held\.fig; return held\.cap; \}/);
  assert.match(js, /const readingsOnly = \(\) => liveOff \|\| /);
  assert.match(js, /async function liveSet\(s, i, patch\) \{[^}]*liveOff = true;/);
  assert.match(js, /async function livePatient\(s, i, o\) \{[\s\S]{0,250}liveOff = true;/);
});

// Sites 9 on a Mac (17 Oct): a ladder card folded behind Show was unfolded and folded again on every layout pass until the slide
// was shown, its foot row under the words made anew each time; the words fitted without the row and the next pass came at once,
// so the data card flashed in and out and the teaching card jumped. A card folded for this slide at this size stays folded.
test('a data card folded for the slide at this size stays folded until the words lock', () => {
  assert.match(js, /const held = !lock && foldHeld === foldKey && dd\.classList\.contains\('pz-folds'\);/);
  assert.match(js, /if \(!lock && !held && dd\.classList\.contains\('pz-folds'\)\) setFolds\(false\);/);
  assert.match(js, /if \(held\) stepDk\(1\);/);
  assert.match(js, /if \(!below && canFold && !held\) \{ setFolds\(true\);/);
  assert.match(js, /foldHeld = dd\.classList\.contains\('pz-folds'\) \? foldKey : null;/);
  assert.doesNotMatch(js, /if \(!lock && dd\.classList\.contains\('pz-folds'\)\) setFolds\(false\);/, 'never unfolded unconditionally on an unlocked pass');
});

// iPad decks (Mohammad, 17 Oct): "the teaching card appears then it snaps to its size". The words' lock was keyed only once the
// slide was shown, so every pass while the cards eased in measured afresh. It is now keyed from the cards' last unseen layout.
test('the teaching card keeps the size it came in at: the lock starts with the last unseen layout', () => {
  assert.match(js, /const at = shown \|\| entering, lockKey = at \? `\$\{at\.gen\}:\$\{at\.i\}:/);
  assert.match(js, /function cardsIn\(at\) \{ if \(ui\) \{ if \(!reduce\.matches\) holdMotion\(D_SURFACE \+ 220\); if \(at\) \{ entering = at; layout\(\); \} reFit\(\);/, 'keyed before the cards show');
  assert.match(js, /bare = false; cardsIn\(\{ i: to, gen: g \}\);/);
  assert.match(js, /shown = null; entering = null;\n/, 'a new slide starts unlocked');
  assert.match(js, /if \(mine && bare && want === to\) \{ bare = false; layout\(\); cardsIn\(\); \}/, 'a move that ends without a newer slide brings its cards in, never locking the next slide early (no `at`)');
  // (The one fold left is the instrument's, decided in the locked layout: nothing folds after the fit once the slide is shown.)
  assert.doesNotMatch(js, /layout\(\); return; \}\s*if \(beside && !tabBeside\(\)\)/, 'no second layout pass after the fit');
  assert.match(js, /fitCards\(ui\.data, ui\.panel\);\s*if \(beside && !tabBeside\(\)\)/);
});

test('a time-lapse keeps the words where they came in: the phone\'s cap and the stacked pair\'s centring hold while its days run and after', () => {
  // (Re-planned as the data card's readings changed with the days, a varix appearing on the scope, the words' cap stepped and the
  // teaching card bounced as the days passed: Endoscopy 3 on an iPhone, 18 Oct.)
  assert.match(js, /const readingsOnly = \(\) => liveOff \|\| handOn \|\| lapseOn \|\| \(!!shown && shown\.i === want && !!slides\[want\]\?\.lapse\);/);
  assert.match(js, /if \(lockKey && shiftLock\?\.key === lockKey && readingsOnly\(\)\) shift = shiftLock\.v; else if \(lockKey\) shiftLock = \{ key: lockKey, v: shift \};\n(?:\s*\/\/ alloc-rare[^\n]*\n)*\s*if \(shift > 0\.5\)/);
  // (Declared before the layout that reads them.)
  assert.ok(js.indexOf('const readingsOnly') < js.indexOf('function layout()'));
});

test('a time-lapse slide in view never lays its cards out again as its readings change: only the data card refits in its own room', () => {
  // (Every reading that measured the data card a hair different ran the whole layout again, many times a second while the days ran,
  // and on an iPhone the teaching card vibrated: Endoscopy 3, 18 Oct.)
  assert.match(js, /const cardsStill = \(\) => !!shown && shown\.i === want && \(liveOff \|\| handOn \|\| !!slides\[want\]\?\.lapse\) && !!ui && !ui\.root\.classList\.contains\('pz-prep'\);/);
  assert.match(js, /clearRO \|\|= new ResizeObserver\(\(\) => \{ cancelRest\(paneRaf\); paneRaf = restPass\(\(\) => \{ if \(!ui\) return; if \(cardMoving\(\)\) \{ if \(thrown\(\)\) layoutAtLanding\(\); return; \} if \(cardsStill\(\)\) fitCards\(ui\.data\); else layout\(\); \}\); soon\(\); \}\);/);
  assert.match(js, /fitRaf = restPass\(\(\) => \{ if \(ui && cardMoving\(\)\) \{ if \(thrown\(\)\) layoutAtLanding\(\); return; \} if \(ui && cardsStill\(\)\) \{ fitCards\(ui\.data\); return; \}/);
  assert.ok(js.indexOf('const cardsStill') < js.indexOf('function layout()'));
});

test('a what-if slider or compare button never lays the cards out again as the readings change: the teaching card holds still', () => {
  // (Each reading that measured the data card a hair different ran the whole layout and fitted the words afresh, and on an iPhone
  // the teaching card's text shook while Tricuspid leak moved, slide 60 of the test-all deck, 19 Oct.)
  const still = js.match(/const cardsStill = \(\) => ([^;]+);/)?.[1] || '';
  assert.match(still, /liveOff/, 'a slider or button driving the live model counts as readings only');
  // (Both observers that lay the cards out after a resize hold the words while it does.)
  assert.equal((js.match(/cardsStill\(\)\) (?:\{ )?fitCards\(ui\.data\)/g) || []).length, 3);   // (the two observers, and R14's pass at the cards' landing)
  // (The slider drives the live model through liveSet, which sets liveOff before its first reading.)
  const live = js.match(/async function liveSet\(s, i, patch\) \{[\s\S]*?\n {2}\}/)[0];
  assert.ok(live.indexOf('liveOff = true') < live.indexOf('dataTo('));
  // (Paced to the frames; the model change runs in a task of its own straight after the frame, store setSoon's rule, 2 Nov 2026.)
  assert.match(js, /const sliderLive = \(\) => liveSet\(s, i, patchOf\(\+input\.value\)\);\n\s+const sliderFrame = \(\) => \{ raf = 0; runSoon\(sliderLive\); \};/);
  assert.match(js, /if \(!raf\) raf = nextFrame\(sliderFrame\);/);
});
