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
  assert.match(js, /below = title\(1\);\s*if \(!below\) ladder\(\);/);
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
  assert.match(js, /const lvl = cardOn && t \? \(d && !below \? d\.top - wr\.top : off\(dd\) \? Math\.max\(sl, \(H - t\.height - 2 \* pad\) \/ 2\) : top0 \+ shift\) \+ pad : null;/, 'a teaching card alone is centred top to bottom, at least one margin from each edge');
  assert.match(js, /shift = Math\.max\(0, Math\.min\(\(H - stackH\) \/ 2 - top0, foot - top0 - stackH\)\);/, 'the stacked pair shorter than the screen is centred as one, never past one margin or the controls');
});

test('a tight slide shrinks in fixed steps and the data card never moves to the top right', () => {
  assert.match(js, /const DK = \[\[0\.9, 0\.95\], \[0\.8, 0\.9\], \[0\.7, 0\.88\], \[0\.6, 0\.88\]\], TK = \[1, 0\.95, 0\.9, 0\.85, 0\.8\];/);
  assert.match(js, /if \(!below\) \{ put\(TK\[TK\.length - 1\], DK\[DK\.length - 1\]\[1\]\); below = true; \}/);
  assert.doesNotMatch(js, /let lo = 0\.4/, 'no continuous search down to 0.4');
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

// iPad landscape (15 Oct): when the smallest steps still leave the pair too tall, the instrument folds behind Show, as on a phone.
test('a pair that does not fit at the smallest steps folds the instrument behind Show on a wide screen', () => {
  assert.match(js, /if \(!below && canFold\) \{ setFolds\(true\);[^\n]*below = title\(1\); if \(!below\) ladder\(\); \}/);
  assert.match(js, /canFold = \(dd\.classList\.contains\('has-tool'\) \|\| \(!dd\.classList\.contains\('tiles-only'\) && ladderFold === foldKey\)\) && !dd\.classList\.contains\('tool-only'\) && !dd\.classList\.contains\('tool-lead'\)/);
  assert.match(js, /if \(lock\.folds\) setFolds\(true\);/, 'the fold is part of the slide\'s locked layout');
  assert.match(js, /folds: dd\.classList\.contains\('pz-folds'\)/);
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-data\.pz-folds:not\(\.tool-open\) > \.pz-tool \{ max-height: 0; opacity: 0;/);
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-data\.pz-folds \.pz-dh > \.pz-fold \{ display: inline-flex;/);
});

// Treatment slide 2 at 200% text (15 Oct, option B): a ladder card folds its plot only once its own zoom has failed to fit it,
// so at 100% text, where the zoom always fits, it never folds; folded, the plot and key hide, and shown, the plot takes the tiles' place.
test('a ladder card folds its plot only when its own fit fails, and shown it swaps plot for tiles', () => {
  assert.match(js, /fitCards\(ui\.data, ui\.panel\);[\s\S]{0,400}ladderFold !== foldKey[\s\S]{0,400}\(overflowOf\(dd\)\)\) \{ ladderFold = foldKey; textLock = null; layout\(\); return; \}/);
  assert.match(css, /\.pz-data\.pz-folds:not\(\.has-tool\):not\(\.tool-open\) > :is\(\.pz-ladder, \.pz-strip\)/);
  assert.match(css, /\.pz-data\.pz-folds\.tool-open:not\(\.has-tool\) > \.pz-tiles \{ display: none; \}/);
});
