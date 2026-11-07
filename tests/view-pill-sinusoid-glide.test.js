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
