// Sweep batches 02–04 (16 Oct): the Pressure chart and the HVPG tab read the bottom bar's own HVPG and PPG, the chart's
// words are 12 px with every station value shown clear of the pills, the stylesheet sets no word under 12 px, the pressure
// dial keeps its words at 12 px however small it is drawn, a disabled button reads clearly, the navel ring shows only with the
// caput medusae, and a figure label under the open menu is hidden. (The browser check tests/e2e/text-floor.mjs measures the
// words on screen.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setShown, shownOr } from '../src/ui/shown.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), charts = read('../src/ui/charts.js'), hvpg = read('../src/ui/hvpg-proc.js'), dock = read('../src/ui/dock.js');
const stage = read('../src/ui/stage.js'), main = read('../src/ui/main.js'), instr = read('../src/ui/instruments.js');

test('the value the bottom bar shows is the one the chart and the HVPG tab read', () => {
  assert.equal(shownOr('hvpg', 7), 7);
  setShown('hvpg', 16.4);
  assert.equal(shownOr('hvpg', 7), 16.4);
  setShown('hvpg', NaN);
  assert.equal(shownOr('hvpg', 7), 7);
  assert.match(dock, /setShown\(t\.id, v\)/);
  assert.match(charts, /shownOr\(d\.hiM, m\[d\.hiM\]\)/);
  assert.match(charts, /tenthGap\(/);   // (each bracket is the difference of the two readings shown at its ends)
  assert.match(hvpg, /shownOr\('whvp', v\.whvp\)/);
  assert.match(hvpg, /shownOr\('fhvp', v\.fhvp\)/);
});

test('the Pressure chart writes its numbers to one decimal at 12 px, and keeps every value off the pills', () => {
  for (const m of charts.matchAll(/FONT\(\d+, ([\d.]+)\)/g)) assert.ok(+m[1] >= 12, `chart font ${m[1]} px`);
  assert.match(charts, /const txt = fmt\(now\[d\.i\], 1\)/);
  // (Sweep 2 review items 1, 2 and 21: the pills 4 px clear of the curve, the dots, the values and each other, the values 4 px
  // clear of the curve and the dots; no spot left means the strip, never a label on the line.)
  assert.match(charts, /const overlap4 = \(r, o\) => r\.x0 < o\.x1 \+ 4/);
  assert.match(charts, /taken\.some\(\(o\) => overlap4\(r, o\)\) \|\| claimed\.some\(\(o\) => overlap4\(r, o\)\) \|\| nearCurve\(r, 4\)/);
  assert.match(charts, /\|\| nearCurve\(q, 4\)/);
  assert.match(charts, /if \(!best\) \{ fail = true;/);
  // (No spot left inside the plot means the band under the names, fixed rows clear of the line, never a label on the line.)
  assert.match(charts, /if \(fail && !predict\?\.on\) \{ formLock\.band = true; bandFade\(\); draw\(\); return; \}/);
  // (A failure while already in the band goes to the strip, before the band handler, so draw() never recurses.)
  assert.match(charts, /if \(fail && !predict\?\.on && g\.band\) \{ toStrip\(\); return; \}/);
  assert.ok(charts.indexOf('if (fail && !predict?.on && g.band) { toStrip(); return; }') < charts.indexOf('if (fail && !predict?.on) { formLock.band = true;'));
  // (The band is reserved under the names: B grows by a full row per bracket, so the band rows (from hh - dims * BAND_ROW) sit
  // below the plot's foot and the names, and the values, clamped to hh - B, never reach them.)
  assert.match(charts, /B = \(stagger \? Math\.ceil\(tilt\) \+ 20 : 26\) \+ \(band \? \(path\.dims \|\| \[\]\)\.length \* BAND_ROW \+ 2 : 0\);/);
  assert.match(charts, /const yy = Math\.max\(T \+ th \/ 2, Math\.min\(hh - B - th \/ 2, cy\)\);/);
  assert.match(charts, /if \(!g\.band\) \{\s*\n\s*ctx\.strokeStyle = col;/);   // (no leaders from the band across the names)
  assert.match(charts, /if \(g\.band\) best = \{ yy: hh - \(dimN - k\) \* BAND_ROW \+ BAND_ROW \/ 2, lx: cx \};/);
  assert.doesNotMatch(charts, /__cf|__why/);
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

test('the pressure dial sets its words to 12 px on screen at least, and leaves out its word only when it does not fit', () => {
  assert.match(instr, /Math\.max\(base, 12\.2 \* k\)/);
  assert.match(instr, /new ResizeObserver\(fit\)\.observe\(svg\)/);
  assert.match(instr, /word\.style\.display = tw > 0 &&/);
});

test('a disabled button keeps its words at full strength on a quiet tile', () => {
  const m = css.match(/:is\(([^)]*)\):disabled \{ opacity: 1; background: var\(--surface-2\); border-color: var\(--border\); color: var\(--text-3\);/);
  assert.ok(m, 'disabled rule');
  for (const c of ['.btn', '.ac-btn', '.ab-drain']) assert.ok(m[1].includes(c), c);
  assert.ok(css.lastIndexOf(m[0]) > css.lastIndexOf('.ab-drain:disabled'), 'after the controls\' own rules');
});

test('the navel ring follows the caput medusae and is part of the organ picture\'s key', () => {
  assert.match(stage, /opacity: o\.id === 'umbilicus' \? 0 : null/);
  assert.match(stage, /findingHidden\('coll'\) \? 0 : clamp\(\(c3 - 0\.15\) \/ 0\.3, 0, 1\)/);
  assert.match(stage, /organEls\.umbilicus\?\.getAttribute\('opacity'\)/);
});

test('a figure label under the open menu is hidden, not left as a sliver', () => {
  assert.match(main, /function labelsUnderMenu\(on\)/);
  // (It fades out over .16 s rather than blinking, motion review P9; still unseen and untouchable once faded.)
  assert.match(css, /#labels \.lb\.under-menu \{ opacity: 0; pointer-events: none; transition-duration: \.16s; \}/);
});

test('a Pressure chart too short for its plot shows the compact strip, and the full chart where it has room', () => {
  assert.match(charts, /const PLOT_MIN = 130;/);
  assert.match(charts, /const BAND_PLOT_MIN = 72, BAND_ROW = 22;/);
  assert.match(charts, /const stripNow = \(g\) => !predict\?\.on && g\.hh - g\.T - g\.B < \(g\.band \? BAND_PLOT_MIN : PLOT_MIN\);/);
  assert.match(charts, /const band = !predict\?\.on && stripNow\(geometry\(\)\);/);   // (a half sheet starts with the brackets in the band)
  assert.match(charts, /if \(stripNow\(g\) \|\| \(formLock\.strip && !predict\?\.on\)\) \{ toStrip\(\); return; \}/);
  assert.match(charts, /cv\.animate\?\.\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);   // (eased, never a jump)
});
