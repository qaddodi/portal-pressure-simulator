// The Tests card's strips and status words ease instead of popping: the comparison line and the pick-a-second hint open and
// fold shut (util.js foldHidden), the status beside the name and the Doppler's vessel crossfade, and Scope view / Wall
// mechanics fade up. (The UI files need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dock = read('../src/ui/dock.js'), util = read('../src/ui/util.js');

test('the comparison line and the pick hint open and fold, never toggle hidden', () => {
  assert.match(dock, /foldHidden\(comparison, hideCmp\)/);
  assert.match(dock, /foldHidden\(pickHint, true\)/);
  assert.match(dock, /foldHidden\(pickHint, false\)/);
  assert.doesNotMatch(dock, /pickHint\.hidden = |comparison\.hidden = /);
});

test('foldHidden animates height and fades, turns round mid-way, and falls back to a plain switch when nothing is drawn', () => {
  const fn = util.slice(util.indexOf('export function foldHidden'), util.indexOf('/** Text that crossfades'));
  assert.match(fn, /height: '0px'/);
  assert.match(fn, /if \(!drawn\) \{ el\.hidden = hide; return; \}/);
  assert.match(fn, /cur\.anim\.cancel\(\)/, 'a second call takes over from what is drawn');
  assert.match(fn, /if \(hide\) el\.hidden = true/, 'hidden only once folded');
  assert.match(fn, /reduceMotionMQ\.matches/, 'Reduce Motion: a fade without movement');
});

test('the status beside the name crossfades between kinds and counts on within one; the probe name crossfades', () => {
  assert.match(dock, /swapText\(live, txt\)/);
  assert.match(dock, /putText\(live, txt\)/);
  assert.match(dock, /swapText\(l, txt\)/);
});

test('Scope view / Wall mechanics fade the view that comes in', () => {
  assert.match(dock, /\(v === 'wall' \? wall\.el : endoscopy\.el\)\.animate\?\./);
});
