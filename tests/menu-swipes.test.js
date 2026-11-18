// The menu on a touch screen (Mohammad, 18 Oct): a drag down closes it, a sideways swipe pages between Present and Patients
// the way the Tests card pages between its tabs. menu.js needs a DOM to import, so it is read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageGo } from '../src/ui/swipe.js';

const menu = readFileSync(new URL('../src/ui/menu.js', import.meta.url), 'utf8');

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

test('every menu (sheet or popover) gets the pull down and the sideways paging, each time it is built', () => {
  assert.equal((menu.match(/dragToClose\(el\); swipeTabs\(el\);/g) || []).length, 2);
  // Sideways only once the move is clearly sideways; the search box keeps its own drags.
  // The list swiped into place does not play its entrance again.
});


