// Into or out of the sinusoid the bottom bar stays (2 Nov, Mohammad: "should probably keep the timeline even in sinusoid view;
// instead of having the pause button up"). It replaces the 17 Oct design, where the dock slid away into the sinusoid and the pill
// glided to a home of its own at the screen's foot, with a play / pause button of its own in the top bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';

const read = (p) => unsnap(readFileSync(new URL(p, import.meta.url), 'utf8'));
const main = read('../src/ui/main.js');
const css = read('../styles/app.css');
const html = read('../index.html');
const dock = read('../src/ui/dock.js');

test('the sinusoid view keeps the timeline, the readouts and the view pill where the lobule has them', () => {
  // No rule hides the dock, its parts or the pill's home in the sinusoid view, and nothing slides it away.
  assert.doesNotMatch(css, /#app\.sin-focus[^{]*(#vdock|\.vdock|#timeline|#strip|#stageBottom|\.nb-views)[^{]*\{[^}]*(display: none|pointer-events: none)/);
  assert.doesNotMatch(main, /vd-out|sinMotion|vd\.style\.translate/);
  // The pill has one home off the top bar, above the dock, in every view.
  assert.match(main, /home = pres \? \$\('#stageTop \.sb-left'\) : \$\('#nbViews'\);/);
  // The framing and the published space count the dock in the sinusoid view too.
  assert.match(main, /const vdH = (readMetric\(vd, 'offsetHeight'\)|vd\.offsetHeight);/);
  // The readouts keep painting there (the strip is seen).
  assert.doesNotMatch(dock.match(/function stripUnseen\(\) \{[\s\S]*?\n\}/)[0], /sin-focus/);
});

test('the play / pause is the timeline\'s: no second one in the top bar', () => {
  assert.doesNotMatch(html, /btnSinPlay/);
  assert.doesNotMatch(main, /btnSinPlay|syncSinPlay/);
  // On a phone the top bar is the lobule's: history and settings stay in the dock's tabs, not brought up to the top bar.
  assert.doesNotMatch(css, /#app\.thumb\.sin-focus \.top-right/);
});

test('on a phone, Treat, Tests and Layers go back out to the lobule first, and open there', () => {
  assert.match(main, /const outOfSin = \(\) => \{ if \(store\.get\(\)\.sinusoid\) store\.set\(\{ sinusoid: false \}\); \};/);
  for (const t of ['treat', 'tests']) assert.match(main, new RegExp(`tab\\('${t}', [^\\n]*outOfSin\\(\\);`));
  assert.match(main, /tab\('layers', 'layers', 'Layers', menuTab\(\(a\) => \{ outOfSin\(\); openLayersMenu\(a\); \}\)\)/);
});

// (A regression from the pill's earlier fix: a card dragged aside on a wide screen is moved by translate, and closing it must clear that.)
test('a card dragged aside returns to its place when it closes', () => {
  assert.match(main, /closed: \(\) => \{ stopSheet\(el\); setSheetOffset\(el, 0\); el\.style\.translate = '';/);
  assert.match(main, /if \(!start\.phone\) \{[^\n]*\n\s*const tx = start\.tx \+ dx, ty = start\.ty \+ dy;\n\s*if \(tx !== start\.wx \|\| ty !== start\.wy\) \{ start\.wx = tx; start\.wy = ty; start\.mv\.set\(tx, ty\); \}[^\n]*\n\s*return;/);   // (the card's place is a number now, a kept paused animation, num-move.js; the release writes the inline translate it always left)
  assert.match(main, /if \(s0\.wx === s0\.wx\) el\.style\.translate = `\$\{s0\.wx\}px \$\{s0\.wy\}px`; s0\.mv\.cancel\(\);/, 'the release leaves the same inline translate, then lets the number go');   // (the same write, skipped only when the numbers are what the drag last wrote)
  assert.doesNotMatch(main, /else el\.style\.translate = `\$\{start\.tx \+ dx\}px \$\{start\.ty \+ dy\}px`;/);
});
