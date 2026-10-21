import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
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

// The card layout follows one body size B (audit/card-layout-recs.md): one margin on every edge, a gap of 0.6 margin, one padding.
test('one margin, padding, gap and card width, all from the body size', () => {
  assert.match(css, /--pz-cm: clamp\(16px, min\(calc\(2\.6vw \/ var\(--vz\)\), calc\(1\.8 \* var\(--pz-b\)\)\), 60px\)/);
  assert.match(css, /--pz-cp: clamp\(18px, calc\(1\.4 \* var\(--pz-b\)\), 40px\)/);
  assert.match(css, /--pz-cw: min\(calc\(clamp\(340px, min\(calc\(38vw \/ var\(--vz\)\), calc\(23\.5 \* var\(--pz-b\)\)\), 640px\)/);
  assert.match(css, /\.pz\.pz-card:not\(\.stack\) \.pz-data \{ padding: var\(--pz-cp\); \}/, 'both cards share one padding');
  assert.match(css, /\.pz-bar\.pzb-pill \{[^}]*right: var\(--pz-cm\); bottom: max\(var\(--pz-cm\)/, 'the nav pill sits one margin from the right and the bottom');
  assert.match(js, /gap = Math\.round\(0\.6 \* sl\)/);
  assert.match(js, /const top0 = cardOn && t \? sl : 0;/, 'the cards start one margin from the top');
  assert.match(js, /: cardOn && t \? \(d && !below \? d\.top - wr\.top : off\(dd\) \? Math\.max\(sl, \(H - t\.height - 2 \* pad\) \/ 2\) : top0 \+ shift\) \+ pad : null;/, 'a teaching card alone is centred top to bottom, at least one margin from each edge');
  assert.match(js, /shift = Math\.max\(0, Math\.min\(\(H - stackH\) \/ 2 - top0, foot - top0 - stackH\)\);/, 'the stacked pair shorter than the screen is centred as one, never past one margin or the controls');
});

test('a tight slide shrinks in fixed steps and the data card never moves to the top right', () => {
  assert.match(js, /const DK = \[0\.9, 0\.8, 0\.7, 0\.6\];/);
  assert.match(js, /const title = \(\) => put\(1, 1\) \|\| put\(WIDE\.title, WIDE\.words\);/, 'the words at Regular or Compact, nothing in between');
  assert.match(js, /if \(!below\) \{ put\(WIDE\.title, WIDE\.words\); below = true; \}/);
  assert.doesNotMatch(js, /let lo = 0\.4/, 'no continuous search down to 0.4');
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

// iPad landscape (15 Oct): when the smallest steps still leave the pair too tall, the instrument folds behind Show, as on a phone.
test('a pair that does not fit at the smallest steps folds the instrument behind Show on a wide screen', () => {
  assert.match(js, /if \(!below && canFold && !held\) \{ setFolds\(true\);[^\n]*below = title\(\); if \(!below\) ladder\(\); \}/);
  assert.match(js, /canFold = dd\.classList\.contains\('has-tool'\) && !dd\.classList\.contains\('tool-only'\) && !dd\.classList\.contains\('tool-lead'\);/);
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

// A phone held sideways (Mohammad, 17 Oct, I23): the words sit in the floating card as on every other screen, not a panel at the
// edge; the data card stays its own card at the top right, never stacked under the words; the card fades out behind a case card.
test('a sideways phone puts its words in the floating card, level with the data card, the tab clear of the title', () => {
  assert.match(js, /const low = !p && W > H && H <= 500;/);
  assert.match(js, /const cardOn = TEXT_CARD && !p;/);
  assert.match(js, /ui\.root\.classList\.toggle\('low', low\); ui\.shade\.classList\.toggle\('low', low\);/);
  assert.match(js, /if \(cardOn && !low && t && !off\(dd\)\) \{/, 'never stacked under the words: no height for that');
  assert.match(js, /const lvl = cardOn && low && t \? \(d \? d\.top - wr\.top : Math\.max\(vm, \(H - t\.height - pad - padT\) \/ 2\)\) \+ padT/);
  assert.match(js, /padT = Math\.max\(pad0, tab\?\.offsetHeight \? \(tab\.offsetHeight \+ 6\) \* k : 0\);/, 'the top padding holds the deck tab clear of the title');
  assert.match(js, /ui\.shade\.style\.height = !p && cardOn && t \? `\$\{\(t\.height \+ pad \+ padT\) \/ k\}px` : '';/);
  assert.match(css, /\.pz\.low \.pz-text, \.pz-shade\.low \{ --pz-cm: 10px; --pz-cp: 14px; --pz-cw: min\(340px, calc\(42vw \/ var\(--vz\) \+ 28px\)\); \}/);
  assert.match(css, /\.pz-shade\.pz-card\.low \{ left: max\(10px, env\(safe-area-inset-left, 0px\)\); \}/, 'clear of the notch');
  assert.match(css, /\.pz\.low \{ --pz-cp: 14px; \}/, 'the data card keeps its 14 px padding');
  assert.match(css, /\.pz\.pz-card:not\(\.stack\):not\(\.low\) \.pz-text \{ --s-title:/, 'the wide sizes leave the sideways phone its own');
  assert.match(css, /\.pz-shade\.pz-card\.pz-leave:not\(\.stack\) \{ opacity: 0 !important;/, 'it fades out whole, behind a case card too');
});

// Sites 9 on a Mac (17 Oct): a ladder card folded behind Show was unfolded and folded again on every layout pass until the slide
// was shown, its foot row under the words made anew each time; the words fitted without the row and the next pass came at once,
// so the data card flashed in and out and the teaching card jumped. A card folded for this slide at this size stays folded.
test('a data card folded for the slide at this size stays folded until the words lock', () => {
  assert.match(js, /const held = !lock && foldHeld === foldKey && dd\.classList\.contains\('pz-folds'\);/);
  assert.match(js, /if \(!lock && !held && dd\.classList\.contains\('pz-folds'\)\) setFolds\(false\);/);
  assert.match(js, /if \(held\) step\(1\);/);
  assert.match(js, /if \(!below && canFold && !held\) \{ setFolds\(true\);/);
  assert.match(js, /foldHeld = dd\.classList\.contains\('pz-folds'\) \? foldKey : null;/);
  assert.doesNotMatch(js, /if \(!lock && dd\.classList\.contains\('pz-folds'\)\) setFolds\(false\);/, 'never unfolded unconditionally on an unlocked pass');
});

// iPad decks (Mohammad, 17 Oct): "the teaching card appears then it snaps to its size". The words' lock was keyed only once the
// slide was shown, so every pass while the cards eased in measured afresh. It is now keyed from the cards' last unseen layout.
test('the teaching card keeps the size it came in at: the lock starts with the last unseen layout', () => {
  assert.match(js, /const at = shown \|\| entering, lockKey = at \? `\$\{at\.gen\}:\$\{at\.i\}:/);
  assert.match(js, /function cardsIn\(at\) \{ if \(ui\) \{ if \(at\) \{ entering = at; layout\(\); \} reFit\(\);/, 'keyed before the cards show');
  assert.match(js, /bare = false; cardsIn\(\{ i: to, gen: g \}\);/);
  assert.match(js, /if \(!bare\) \{ await caseEnd\(cut\); if \(cut\(\)\) return; cardsIn\(\{ i: to, gen: g \}\); \}/);
  assert.match(js, /shown = null; entering = null;\n/, 'a new slide starts unlocked');
  assert.match(js, /if \(bare\) \{ bare = false; layout\(\); cardsIn\(\); \}/, 'a cut transition never locks the next slide early');
  // (The one fold left is the instrument's, decided in the locked layout: nothing folds after the fit once the slide is shown.)
  assert.doesNotMatch(js, /layout\(\); return; \}\s*if \(beside && !tabBeside\(\)\)/, 'no second layout pass after the fit');
  assert.match(js, /fitCards\(ui\.data, ui\.panel\);\s*if \(beside && !tabBeside\(\)\)/);
});

test('a time-lapse keeps the words where they came in: the phone\'s cap and the stacked pair\'s centring hold while its days run and after', () => {
  // (Re-planned as the data card's readings changed with the days, a varix appearing on the scope, the words' cap stepped and the
  // teaching card bounced as the days passed: Endoscopy 3 on an iPhone, 18 Oct.)
  assert.match(js, /const readingsOnly = \(\) => liveOff \|\| lapseOn \|\| \(!!shown && shown\.i === want && !!slides\[want\]\?\.lapse\);/);
  assert.match(js, /if \(lockKey && shiftLock\?\.key === lockKey && readingsOnly\(\)\) shift = shiftLock\.v; else if \(lockKey\) shiftLock = \{ key: lockKey, v: shift \};\n\s*if \(shift > 0\.5\)/);
  // (Declared before the layout that reads them.)
  assert.ok(js.indexOf('const readingsOnly') < js.indexOf('function layout()'));
});

test('a time-lapse slide in view never lays its cards out again as its readings change: only the data card refits in its own room', () => {
  // (Every reading that measured the data card a hair different ran the whole layout again, many times a second while the days ran,
  // and on an iPhone the teaching card vibrated: Endoscopy 3, 18 Oct.)
  assert.match(js, /const cardsStill = \(\) => !!shown && shown\.i === want && \(liveOff \|\| !!slides\[want\]\?\.lapse\) && !!ui && !ui\.root\.classList\.contains\('pz-prep'\);/);
  assert.match(js, /clearRO \|\|= new ResizeObserver\(\(\) => \{ cancelFrame\(paneRaf\); paneRaf = nextFrame\(\(\) => \{ if \(!ui\) return; if \(cardsStill\(\)\) fitCards\(ui\.data\); else layout\(\); \}\); soon\(\); \}\);/);
  assert.match(js, /fitRaf = nextFrame\(\(\) => \{ if \(ui && cardsStill\(\)\) \{ fitCards\(ui\.data\); return; \}/);
  assert.ok(js.indexOf('const cardsStill') < js.indexOf('function layout()'));
});

test('a what-if slider or compare button never lays the cards out again as the readings change: the teaching card holds still', () => {
  // (Each reading that measured the data card a hair different ran the whole layout and fitted the words afresh, and on an iPhone
  // the teaching card's text shook while Tricuspid leak moved, slide 60 of the test-all deck, 19 Oct.)
  const still = js.match(/const cardsStill = \(\) => ([^;]+);/)?.[1] || '';
  assert.match(still, /liveOff/, 'a slider or button driving the live model counts as readings only');
  // (Both observers that lay the cards out after a resize hold the words while it does.)
  assert.equal((js.match(/cardsStill\(\)\) (?:\{ )?fitCards\(ui\.data\)/g) || []).length, 2);
  // (The slider drives the live model through liveSet, which sets liveOff before its first reading.)
  const live = js.match(/async function liveSet\(s, i, patch\) \{[\s\S]*?\n {2}\}/)[0];
  assert.ok(live.indexOf('liveOff = true') < live.indexOf('dataTo('));
  assert.match(js, /if \(!raf\) raf = nextFrame\(\(\) => \{ raf = 0; liveSet\(s, i, patchOf\(\+input\.value\)\); \}\);/);
});
