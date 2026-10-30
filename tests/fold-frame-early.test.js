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

// ── 30 Oct, second round: "The view still jumps on phone when I untuck the stacked card". Started with the card, the camera was still a
// glide of its own beside the card's slide, and a finger's pull slid the card over a figure that moved only once it was let go. Now the view
// follows the readings' card frame by frame, at the share of its travel the card has made, under the finger too.
const fnBody = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };

test('the stage can say where a framing would go without moving, and follows a card between two framings', () => {
  const anim = between(stage, 'function animateVT(', 'let at = (u)');
  assert.ok(anim.indexOf('if (aiming) {') < anim.indexOf('cancelFrame(vtAnim)'), 'asked only where it would go: nothing is cancelled or moved');
  assert.ok(anim.indexOf('following = false;') < anim.indexOf('cancelFrame(vtAnim)'), 'any glide or framing set outright ends a follow');
  const at = fnBody(stage, 'function followAt(');
  assert.match(at, /if \(!following\) return;/);
  assert.match(at, /const f = clamp\(u, 0, 1\)/);
  assert.match(at, /vt = \{ k: a\.k \+ \(b\.k - a\.k\) \* f, x: a\.x \+ \(b\.x - a\.x\) \* f, y: a\.y \+ \(b\.y - a\.y\) \* f \};/, 'every point of the figure moves in step with the card');
  const start = fnBody(stage, 'function followStart(');
  assert.match(start, /sameView\(v0, v1\) \|\| !viewNow\(\)\) return false;/, 'nothing follows where the framings agree (Mac, iPad on its side) or the view is moving');
  assert.match(start, /drifting = true;/, 'the labels ride, as with a slow push');
  assert.match(fnBody(stage, 'function followEnd('), /driftEnd\(\);/, 'and are solved again once it ends');
  assert.match(stage, /const viewNow = \(\) => \(following \|\| vtGliding \|\| drifting \|\| lobuleOn \|\| morphTarget !== 0 \|\| morph > 0 \|\| diveT > 0 \? null/);
});

test('the card\'s every move sets the view: a tap\'s ease, the finger, the end of the slide', () => {
  for (const call of ["liftTo(from); slideTell(); camAt(from);", "d.style.setProperty('--pz-u', u.toFixed(4)); liftTo(u); camAt(u); slip.raf", "el.style.setProperty('--pz-u', u.toFixed(4)); liftTo(u); camAt(u); return;", "ui.data.classList.remove('pz-sliding'); liftTo(underU(ui.data)); camAt(underU(ui.data));"])
    assert.ok(presenter.includes(call), call);
  assert.match(presenter, /const camAt = \(u\) => \{ if \(!stage\.following\?\.\(\)\) return; if \(camSlide === `\$\{want\}\|\$\{gen\}` && shown\?\.i === want\) stage\.followAt\(u\); else stage\.followEnd\?\.\(\); \};/, 'another slide ends it');
});

test('a tap frames the new state and follows from the view as it stood; a finger works out the other state as it takes the card', () => {
  const split = between(presenter, 'if (splitSheet(data)) {', 'clearTimeout(foldT); foldT = setTimeout(foldStill');
  assert.ok(split.indexOf('stage.viewNow?.()') < split.indexOf('stopUnder();'), 'the view taken before anything moves');
  assert.match(split, /if \(!stage\.following\?\.\(\) && !\(vNow && camFollow\(vNow, open\)\)\) foldFrame\(\);/, 'the glide only where nothing follows; a finger let go follows on');
  const follow = fnBody(presenter, 'function camFollow(');
  assert.match(follow, /stage\.follow\?\.\(open \? vNow : vTo, open \? vTo : vNow\)/, 'v0 the readings tucked, v1 out');
  const grab = fnBody(presenter, 'function camGrab(');
  assert.match(grab, /finally \{ d\.classList\.toggle\('tool-open', open\); placeLip\(\); ui\.lipMO\?\.takeRecords\(\); \}/, 'the card is put back before anything is drawn');
  assert.match(grab, /stage\.follow\?\.\(open \? vOther : vNow, open \? vNow : vOther\)/);
  assert.match(presenter, /if \(gg\.split && \(gg\.u0 === 0 \|\| gg\.u0 === 1\)\) camGrab\(\); hold\(true\);/, 'only from rest, before the card is held');
  const ok = between(presenter, 'const camFollowOk = () =>', 'const camAim');
  for (const g of ['reduce.matches', 'dock.to === 0', 'dock.lvl === 0', '!zoomOn()', '(cath.on && cath.cam)', 'procRun?.running', 'push.until', 'store.get().lobule', 'LOBULE_CAM'])
    assert.ok(ok.includes(g), g);
  const still = between(presenter, 'const foldStill = () => {', 'const fold = h(');
  assert.ok(still.indexOf('stage.followEnd?.();') < still.indexOf('onResize();'), 'ended at rest, before the refit that finds the view already there');
});
