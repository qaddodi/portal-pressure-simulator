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

test('HVPG steps, the Ascites albumin and Drain words crossfade, and the gastric-varix procedure buttons fade up', () => {
  const proc = read('../src/ui/hvpg-proc.js'), instr = read('../src/ui/instruments.js'), css = read('../styles/app.css');
  assert.match(proc, /swapText\(caption, say\)/);
  assert.match(proc, /swapText\(note, n\)/);
  assert.match(instr, /swapText\(albS, albTxt\)/);
  assert.match(instr, /putText\(albS, albTxt\)/, 'the grams count on within one kind');
  assert.match(instr, /swapText\(drain, hasFluid \? 'Drain' : 'No ascites'\)/);
  assert.match(css, /\.hvpg-proc-btn:not\(\[hidden\]\) \{ animation: crossfade/);
});

test('the Doppler tab\'s mode name, sweep length and vessel note crossfade', () => {
  const dop = read('../src/ui/doppler.js');
  assert.match(dop, /swapText\(sweepBtn\.lastChild,/);
  assert.match(dop, /swapText\(noteEl, it\.note\)/);
  assert.match(dop, /swapText\(noteEl, ''\)/);
});
