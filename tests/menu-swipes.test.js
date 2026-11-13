// The menu on a touch screen (Mohammad, 18 Oct): a drag down closes it, a sideways swipe pages between Present and Patients
// the way the Tests card pages between its tabs. menu.js needs a DOM to import, so it is read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageGo } from '../src/ui/swipe.js';

const menu = readFileSync(new URL('../src/ui/menu.js', import.meta.url), 'utf8');
const dock = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('a page drag goes on past a third of the width or after a quick flick, and springs back otherwise', () => {
  assert.equal(pageGo(-150, 600, 400), true);
  assert.equal(pageGo(150, 600, 400), true);
  assert.equal(pageGo(-60, 100, 400), true);
  assert.equal(pageGo(-60, 400, 400), false);
  assert.equal(pageGo(-30, 20, 400), false);
  assert.equal(pageGo(NaN, 100, 400), false);
  assert.equal(pageGo(-200, 100, 0), false);
});

test('a page drag is also judged by how fast the finger was going as it lifted: a quick flick at the end goes on, one flung back springs back', () => {
  // (the finger's speed along +x, px/ms: a drag to the left, dx < 0, goes on when the finger is still moving left)
  assert.equal(pageGo(-60, 1500, 400, -0.8), true, 'slow drag, quick flick left at the end');
  assert.equal(pageGo(60, 1500, 400, 0.8), true, '(and right)');
  assert.equal(pageGo(-60, 1500, 400, -0.2), false, 'a slow lift is not a flick');
  assert.equal(pageGo(-30, 1500, 400, -2), false, 'a twitch is never a page');
  assert.equal(pageGo(-60, 100, 400, 0.8), false, 'a quick drag flung back the way it came springs back');
  assert.equal(pageGo(-200, 400, 400, 0.9), false, 'so does a far one');
  assert.equal(pageGo(-200, 400, 400, 0.3), true, 'a slight roll back off the glass as it lifts does not');
  assert.equal(pageGo(-200, 400, 400, NaN), true, 'no speed is the drag alone');
});

test('the Tests card and the menu share the same paging rule, and carry the finger\'s speed into the settle', () => {
  assert.match(dock, /pageGo\(s\.dx, ms, s\.w, v\)/);
  assert.match(menu, /pageGo\(s\.dx, performance\.now\(\) - s\.t, s\.w, v\)/);
  for (const src of [dock, menu]) {
    assert.match(src, /const v = releaseSpeed\(s\.trail, performance\.now\(\)\);/);
    assert.match(src, /carryCurve\(s\.nb \? v : v \/ 3, \(go \? -d \* s\.w : 0\) - s\.dx, D_SMALL\)/);
    // (The last 8 points of the finger as [time, x] pairs: pushed new, or, as in the menu, written over the oldest of a set made at the touch.)
    assert.match(src, /\(sw\.trail \|\|= \[\]\)\.push\(\[performance\.now\(\), t\.clientX\]\)|const tp = sw\.trail\.length >= 8 \? sw\.trail\.shift\(\) : sw\.pool\.pop\(\);\s+tp\[0\] = performance\.now\(\); tp\[1\] = t\.clientX;\s+sw\.trail\.push\(tp\);/);
  }
});

test('every menu (sheet or popover) gets the pull down and the sideways paging, each time it is built', () => {
  assert.match(menu, /function dragToClose\(panel\) \{\n\s*swipeSheet\(panel, \(\) => close\(\{ dragged: true \}\)\);/);
  assert.equal((menu.match(/dragToClose\(el\); swipeTabs\(el\);/g) || []).length, 2);
  // Sideways only once the move is clearly sideways; the search box keeps its own drags.
  assert.match(menu, /Math\.abs\(dx\) < Math\.abs\(dy\) \* 1\.2\) \{ sw = null; return; \}/);
  assert.match(menu, /!ownsSideways\(e\.target, \{ stop: panel \}\)/);
  // The list swiped into place does not play its entrance again.
  assert.match(menu, /setTab\(TABS\[s\.j\], false, true\)/);
});

test('upright, the sheet follows the finger down (the compositor, no --sink) and the other list shows beside the open one while dragging', () => {
  assert.doesNotMatch(css, /html\.thumb-ui \.umenu\.sheet \{ translate: 0 var\(--sink/);
  assert.match(css, /\.umenu\[data-tab\] \.um-col\[data-col\]\.um-peer \{ display: block; position: absolute;/);
  assert.match(css, /\.um-cols \{ position: relative; overflow-x: clip; \}/);
});

test('a popover pulled down fades as it slides, instead of being removed mid-slide', () => {
  assert.match(menu, /if \(!sheet\) panel\.style\.opacity = '0';/);
  assert.match(menu, /\n\s+setTimeout\(done, afterMs\(sheet \|\| o\.dragged \? D_SMALL : D_FLIP\)\);/);
});
