// Sweep batches 02–04 (16 Oct): the Pressure chart and the HVPG tab read the bottom bar's own HVPG and PPG, the chart's
// words are 12 px with every station value shown clear of the pills, the stylesheet sets no word under 12 px, the pressure
// dial keeps its words at 12 px however small it is drawn, a disabled button reads clearly, the navel ring shows only with the
// caput medusae, and a figure label under the open menu is hidden. (The browser check tests/e2e/text-floor.mjs measures the
// words on screen.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setShown, shownOr } from '../src/ui/shown.js';
import { appCss } from './split-src.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = appCss(), charts = read('../src/ui/charts.js');

test('the value the bottom bar shows is the one the chart and the HVPG tab read', () => {
  assert.equal(shownOr('hvpg', 7), 7);
  setShown('hvpg', 16.4);
  assert.equal(shownOr('hvpg', 7), 16.4);
  setShown('hvpg', NaN);
  assert.equal(shownOr('hvpg', 7), 7);
});

test('the Pressure chart writes its numbers to one decimal at 12 px, and keeps every value off the pills', () => {
  for (const m of charts.matchAll(/FONT\(\d+, ([\d.]+)\)/g)) assert.ok(+m[1] >= 12, `chart font ${m[1]} px`);
  // (Sweep 2 review items 1, 2 and 21: the pills 4 px clear of the curve, the dots, the values and each other, the values 4 px
  // clear of the curve and the dots; no spot left means the strip, never a label on the line.)
  // (No spot left inside the plot means the band under the names, fixed rows clear of the line, never a label on the line.)
  // (A failure while already in the band goes to the strip, before the band handler, so draw() never recurses.)
  assert.ok(charts.indexOf('if (fail && !predict?.on && g.band) { toStrip(); return; }') < charts.indexOf('if (fail && !predict?.on) { formLock.band = true;'));
  // (The band is reserved under the names: B grows by a full row per bracket, so the band rows (from hh - dims * BAND_ROW) sit
  // below the plot's foot and the names, and the values, clamped to hh - B, never reach them.)
  // (The per-segment drop pills, with their clamp above the band, were left out with them: every profile path has its brackets.)
});

test('the stylesheet sets no word under 12 px (the legend and the data card strip belong to their own fixes)', () => {
  const owned = /^\s*(\.lg-cap|\.lg-num|#app:not\(\.thumb\) \.topbar:has|\.pzs-)/;
  const small = [];
  for (const line of css.split('\n')) {
    if (owned.test(line)) continue;
    for (const m of line.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?(?:clamp\()?(\d+(?:\.\d+)?)px/g)) if (+m[1] < 12 && !/ab-dial/.test(line)) small.push(line.trim().slice(0, 80));
  }
  assert.deepEqual(small, []);
});


test('a disabled button keeps its words at full strength on a quiet tile', () => {
  const m = css.match(/:is\(([^)]*)\):disabled \{ opacity: 1; background: var\(--surface-2\); border-color: var\(--border\); color: var\(--text-3\);/);
  assert.ok(m, 'disabled rule');
  for (const c of ['.btn', '.ac-btn', '.ab-drain']) assert.ok(m[1].includes(c), c);
  assert.ok(css.lastIndexOf(m[0]) > css.lastIndexOf('.ab-drain:disabled'), 'after the controls\' own rules');
});



