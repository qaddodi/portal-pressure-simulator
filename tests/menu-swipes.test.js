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

test('the Tests card and the menu share the same paging rule', () => {
  assert.match(dock, /pageGo\(s\.dx, ms, s\.w\)/);
  assert.match(menu, /pageGo\(s\.dx, performance\.now\(\) - s\.t, s\.w\)/);
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

test('upright, the sheet follows the finger down (--sink) and the other list shows beside the open one while dragging', () => {
  assert.match(css, /html\.thumb-ui \.umenu\.sheet \{ translate: 0 var\(--sink, 0px\); \}/);
  assert.match(css, /\.umenu\[data-tab\] \.um-col\[data-col\]\.um-peer \{ display: block; position: absolute;/);
  assert.match(css, /\.um-cols \{ position: relative; overflow-x: clip; \}/);
});

test('a popover pulled down fades as it slides, instead of being removed mid-slide', () => {
  assert.match(menu, /if \(!sheet\) panel\.style\.opacity = '0';/);
  assert.match(menu, /leaveT = setTimeout\(done, sheet \|\| o\.dragged \? 280 : 120\);/);
});
