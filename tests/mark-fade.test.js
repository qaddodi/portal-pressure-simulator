import { stageSource } from './stage-src.js';
// The treatment marks on the figure (a stent's mesh, sutures, the tie on a divided vein, the cross on a closed shunt, the splenic
// patches, the variceal bands) come and go with a fade, not a pop (src/ui/mark-fade.js; stage.js putMark, updateOverlays, olStep).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markFade, markEase, MARK_IN_MS, MARK_OUT_MS } from '../src/ui/mark-fade.js';
import { D_SMALL, D_SURFACE } from '../src/ui/ease.js';

const build = (f, keys, canLeave) => { f.begin(); for (const k of keys) { f.want(k, { vessel: 'V' }); f.hold(k, { k }); } return f.end(canLeave); };

test('what is there at the first build shows whole at once (a patient loaded, the page opened)', () => {
  const f = markFade();
  f.begin();
  assert.equal(f.want('stent:TIPS'), 1);
  f.end();
  assert.equal(f.moving(), false);
});

test('a mark that comes after the first build fades in over D_SURFACE, eased, and a leave takes the step below it', () => {
  assert.equal(MARK_IN_MS, D_SURFACE);
  assert.equal(MARK_OUT_MS, D_SMALL);
  const f = markFade();
  build(f, []);
  f.begin(); assert.equal(f.want('band:0'), 0); f.hold('band:0', { k: 'b' }); f.end();
  assert.equal(f.moving(), true);
  f.step(MARK_IN_MS / 2);
  assert.equal(f.amount('band:0'), markEase(0.5));
  assert.equal(f.step(MARK_IN_MS).moving, false);
  assert.equal(f.amount('band:0'), 1);
  // not wanted any more: it fades out over D_SMALL and its element is handed back to be drawn again
  const left = build(f, []);
  assert.deepEqual(left.map(([k]) => k), ['band:0']);
  assert.equal(f.step(MARK_OUT_MS / 2).moving, true);
  assert.equal(f.amount('band:0'), markEase(0.5));
  const r = f.step(MARK_OUT_MS);
  assert.equal(r.moving, false);
  assert.deepEqual(r.gone, [{ k: 'b' }]);
  assert.equal(f.has('band:0'), false);
});

test('a mark wanted again while it fades out turns round from where it stands, not from nothing', () => {
  const f = markFade();
  build(f, ['a']);
  build(f, []);            // 'a' starts out
  f.step(MARK_OUT_MS / 2);
  const mid = f.amount('a');
  assert.ok(mid > 0 && mid < 1);
  f.begin(); assert.equal(f.want('a'), mid); f.end();
  f.step(MARK_IN_MS / 4);
  assert.ok(f.amount('a') > mid);
});

test('a mark that cannot fade where it stands (its vessel gone, the view changed) goes at once', () => {
  const f = markFade();
  build(f, ['a']);
  const left = build(f, [], () => false);
  assert.deepEqual(left, []);
  assert.equal(f.has('a'), false);
});

test('canLeave is asked again at each build for a mark already fading, and told that it is', () => {
  const f = markFade();
  build(f, ['a']);
  const asked = [];
  assert.equal(build(f, [], (k, meta, fading) => { asked.push(fading); return true; }).length, 1);
  f.step(MARK_OUT_MS / 4);
  assert.equal(build(f, [], (k, meta, fading) => { asked.push(fading); return false; }).length, 0);
  assert.deepEqual(asked, [false, true]);
  assert.equal(f.has('a'), false);
});

test('a mark that had not started to show when it was dropped does not fade out from nothing', () => {
  const f = markFade();
  build(f, []);
  f.begin(); f.want('x'); f.hold('x', {}); f.end();   // a = 0
  assert.equal(build(f, []).length, 0);
  assert.equal(f.has('x'), false);
});

test('Reduce Motion: marks land at once, and a new one shows whole', () => {
  const f = markFade();
  build(f, []);
  f.begin(); assert.equal(f.want('s', null, true), 1); f.hold('s', {}); f.end();
  build(f, ['t']);
  build(f, []);
  const r = f.step(1, true);
  assert.equal(r.moving, false);
  assert.equal(f.has('t'), false);
});

test('a step never overshoots, and a mark at rest costs no frames', () => {
  const f = markFade();
  build(f, []);
  f.begin(); f.want('a'); f.hold('a', {}); f.end();
  f.step(100000);
  assert.equal(f.amount('a'), 1);
  assert.equal(f.moving(), false);
  assert.equal(f.step(16).moving, false);
});

// The wiring in stage.js, pinned in the source (the stage cannot be built without a browser).
const stage = stageSource();
test('stage.js: every treatment mark is built through putMark, so none is added to its group bare', () => {
  assert.doesNotMatch(stage, /ov\.(stents|plugs|bands)\.append\(/, 'a mark appended without a fade');
  for (const key of ['`stent:${id}`', '`suture:${id}`', '`tie:${id}`', '`plug:${id}`', "'spleen:patches'", "'spleen:cross'", '`band:${i}`']) assert.ok(stage.includes(key), `${key} is a mark`);
});
test('stage.js: the GPU draws a mark at its key\'s amount, the loop stays awake while one moves, and a finished one is taken out and read again', () => {
  assert.match(stage, /el\.closest\('\[data-(?:live\.)?mk\]'\)\?\.dataset\.mk/);
  assert.match(stage, /c\.alpha = d\.alpha \* fadeEase\(d\.fade\)/);
  assert.equal((stage.match(/markA\.moving\(\)/g) || []).length >= 3, true);
  assert.match(stage, /for \(const el of r\.gone\) el\.remove\(\); (?:live\.)?(?:live\.)?mk\.ver\+\+;/);
  assert.match(stage, /markA\.end\(\(key, m, fading\) => m\.t === t && \(anat \|\| !m\.anatOnly\) && \(fading \|\| !m\.vessel \|\| E\[m\.vessel\]\?\.vis\)\)/);
});
test('stage.js: the GPU copy takes the amount on the draw and never as the group\'s opacity (or each step would be read as a new look)', () => {
  assert.match(stage, /if \(glLines\) \{ if \(el\.hasAttribute\('opacity'\)\) el\.removeAttribute\('opacity'\); return; \}/);
});

// The band count the varices' strands are drawn from (src/ui/band-ease.js; stage.js stepBands, widthWrites, stepWidths).
import { bandsStep, BANDS_TAU, BANDS_SNAP } from '../src/ui/band-ease.js';
test('a band closes its strand over about D_SMALL, not in one frame', () => {
  assert.equal(bandsStep(null, 1, 0.016), 1);               // nothing drawn yet: the model's count
  let shown = 0, frames = 0;
  const seen = [];
  while (shown !== 1 && frames < 200) { shown = bandsStep(shown, 1, 1 / 60); seen.push(shown); frames++; }
  assert.ok(frames > 8 && frames < 40, `${frames} frames at 60 Hz`);
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]), 'only forward');
  assert.ok(seen[0] > 0 && seen[0] < 0.2, 'the first frame moves a little');
  // the first strand is live while the count is under 1: its opacity runs 1 → 0 through the frames
  assert.ok(seen.some((v) => 1 - v > 0.2 && 1 - v < 0.8), 'it passes through the middle');
});
test('a slough (the count falling a few hundredths a frame) is taken as it is, and Reduce Motion lands at once', () => {
  assert.equal(bandsStep(0.99, 0.97, 1 / 60), 0.97);
  assert.equal(bandsStep(0, 1, 1 / 60, true), 1);
  assert.equal(bandsStep(1, 1, 1 / 60), 1);
  assert.ok(BANDS_SNAP < 0.1 && BANDS_TAU > 0.05 && BANDS_TAU < 0.15);
});
test('a long frame moves the count no further than its own time (no jump when the page was away)', () => {
  assert.ok(bandsStep(0, 1, 0.05) < 0.6);
  assert.equal(bandsStep(0, 1, 5), 1);
  assert.equal(bandsStep(0, 1, -1), 0);
});
test('stage.js: the strand reads the drawn count, and the width step stands aside while it moves', () => {
  assert.match(stage, /sd\.live = e\.code === 'C1' \? clamp\(i \+ 1 - \(bandsShown \?\? \(f\.bands \|\| 0\)\), 0, 1\)/);
  assert.match(stage, /(?:live\.)?catchUp \|\| bandsMoving\(\) \|\| lesionsMoving\(\)\) return false;/);
  assert.match(stage, /if \(stepBands\(f, dtW\)\) (?:live\.)?(?:live\.)?widthEasing = true;/);
});
