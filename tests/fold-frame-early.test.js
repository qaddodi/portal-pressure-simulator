// Mohammad, 30 Oct (iPhone): "The view still snaps/jumps when I untuck a stacked card". On a phone or an upright iPad the readings' card
// coming out or tucking away changes the room the figure has. The camera framed that room only once the card had come to rest (foldStill,
// 450 ms or more after the tap): the card slid over the figure and stopped, then the figure moved off from under it. And on a slide framed
// at the fit, the stage's home look, taken on the model's frames, measured the card part way and glided the figure to a room the card was
// only passing through, before the presenter's own refit moved it on. Now the camera starts as the card does, for the room it will leave,
// and the home look waits for the card to rest. (Code only: nobody has looked on screen.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const presenter = read('src/ui/presenter.js'), stage = read('src/ui/stage.js');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i); assert.ok(j > i, b); return src.slice(i, j); };

test('a stacked card that folds frames the camera as it starts to move, between its layout and its slide', () => {
  const split = between(presenter, 'if (splitSheet(data)) {', 'clearTimeout(foldT); foldT = setTimeout(foldStill');
  const lay = split.indexOf('layout();'), meas = split.indexOf('measureUnder(data);'), frame = split.indexOf('foldFrame();'), fold = split.indexOf("data.dataset.folding = '';"), slide = split.indexOf('slideUnder(u0');
  assert.ok(lay >= 0 && meas > lay && frame > meas, 'framed once the card is laid out and measured as it will rest');
  assert.ok(fold > frame && slide > frame, 'and before the slide begins: the card still stands where it will rest, not part way');
});

test('the early framing reads the handle where it will rest and refits as the card\'s own refit does', () => {
  const f = between(presenter, 'const foldFrame = () => {', 'let foldT = 0;');
  assert.ok(f.indexOf('placeLip();') >= 0 && f.indexOf('placeLip();') < f.indexOf('reframe(400);'), 'the handle at the card\'s foot first: it counts in the room');
  for (const g of ['shown.i !== want', 'shown.gen !== gen', '(busy && !playing)', 'leaving', 'dock.to !== 0', 'dock.lvl !== 0', 'zoomOn()', 'reframeT'])
    assert.ok(f.includes(g), `left to the old path when ${g}`);
});

test('the refit once the card rests leaves a glide to the same view alone, so the camera is not started again', () => {
  assert.match(stage, /if \(!to \|\| sameView\(to, vtGliding \? vtTarget : vt\)\) return;/, 'frameBox');
  assert.match(stage, /fitSlow\(ms = 1300, opt = \{\}\) \{[^\n]*if \(!sameView\(to, vtGliding \? vtTarget : vt\)\) animateVT/, 'fitSlow');
});

test('the stage\'s home look waits while a slide\'s stacked card folds, and looks again once it rests', () => {
  const h = between(stage, 'function followHome(', 'let homeResizeT');
  const skip = h.indexOf(".pz-data[data-folding], .pz-data.pz-sliding"), stamp = h.indexOf('homeCheck = now;');
  assert.ok(skip > 0 && skip < stamp, 'skipped before the look is stamped, so the next frame may look again');
  assert.match(h, /store\.get\(\)\.presenting && document\.querySelector/, 'only while presenting: Explore\'s cards keep their own rules');
  // (foldStill clears the fold and lays the cards out, which announces the new room: the look's watch is touched.)
  const still = between(presenter, 'const foldStill = () => {', 'const fold = h(');
  assert.match(still, /delete data\.dataset\.folding; fitDone\.delete\(data\); onResize\(\);/);
  assert.match(stage, /addEventListener\('pps:occ', watch\.touch\)/);
});
