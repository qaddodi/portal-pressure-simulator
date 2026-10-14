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
  assert.match(css, /--pz-cw: min\(calc\(clamp\(340px, min\(calc\(34vw \/ var\(--vz\)\), calc\(23\.5 \* var\(--pz-b\)\)\), 640px\)/);
  assert.match(css, /\.pz\.pz-card:not\(\.stack\) \.pz-data \{ padding: var\(--pz-cp\); \}/, 'both cards share one padding');
  assert.match(css, /\.pz-bar\.pzb-pill \{[^}]*right: var\(--pz-cm\); bottom: max\(var\(--pz-cm\)/, 'the nav pill sits one margin from the right and the bottom');
  assert.match(js, /gap = Math\.round\(0\.6 \* sl\)/);
  assert.match(js, /const top0 = cardOn && t \? sl : 0;/, 'the cards start one margin from the top');
  assert.match(js, /const lvl = cardOn && t \? \(d && !below \? d\.top - wr\.top : top0\) \+ pad : null;/, 'a teaching card alone stays at the top left, never centred');
});

test('a tight slide shrinks in fixed steps and the data card never moves to the top right', () => {
  assert.match(js, /const DK = \[\[0\.9, 0\.95\], \[0\.8, 0\.9\], \[0\.7, 0\.88\], \[0\.6, 0\.88\]\], TK = \[1, 0\.95, 0\.9, 0\.85, 0\.8\];/);
  assert.match(js, /if \(!below\) \{ put\(TK\[TK\.length - 1\], DK\[DK\.length - 1\]\[1\]\); below = true; \}/);
  assert.doesNotMatch(js, /let lo = 0\.4/, 'no continuous search down to 0.4');
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
