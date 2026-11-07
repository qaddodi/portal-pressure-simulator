import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Two easings that took their start time in a handler but ran on the frame scheduler's own time:
//  - that time is the frame's start, which can be a few ms before the handler's performance.now(), so (now - t0) / ms came out
//    slightly negative; the cubic ease out of util.js sinkTo (gone since W4) then drew the first frame the wrong way (about 20% of the travel at the
//    sheet's 220 ms);
//  - the portal split bar (stage.js splitTo) stopped for good when its tile had left the page, leaving it part way while _shTo
//    already held the target, so the same share asked for again returned at once and the bar stayed there;
//  - and it froze while the share kept moving: splitTo is asked every frame, with the live model's running mean, and each new share
//    cancelled the step before it ran. The bar now follows its share (display-state.js follow2), so nothing restarts.
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// splitTo with its helpers, as stage.js has them, and the surfaces they touch stubbed (the real follow2 and portalSplit).
const stage = stageSource();
const { follow2, SHOWN_TAU } = await import('../src/ui/display-state.js');
const { portalSplit } = await import('../src/ui/table-marks.js');
const splitSrc = stage.match(/const SPLIT_EPS[\s\S]*?(?=\n {2}const siteLive)/)[0];
function splitRig({ reduce = false } = {}) {
  const shown = [], queued = new Map();
  let id = 0, clock = 0;
  const easeFrame = (cb) => { queued.set(++id, cb); return id; };
  const cancelFrame = (i) => { queued.delete(i); };
  const make = new Function('portalSplit', 'follow2', 'SHOWN_TAU', 'splitShow', 'easeFrame', 'cancelFrame', 'reduceMotion', 'performance', `${splitSrc}\nreturn splitTo;`);
  const splitTo = make(portalSplit, follow2, SHOWN_TAU, (el, sh) => shown.push(sh), easeFrame, cancelFrame, { matches: reduce }, { now: () => clock });
  // Runs the scheduled step, if any, at time `at` (the callback's own clock, which may be before the easing began).
  const run = (at) => { const first = queued.entries().next().value; if (!first) return false; queued.delete(first[0]); first[1](at); return true; };
  return { splitTo, shown, queued, at: (t) => { clock = t; }, run };
}
const newEl = () => ({ dataset: {}, isConnected: true });

test('the split bar shows its first share at once, and at once under Reduce Motion', () => {
  const r = splitRig(), el = newEl();
  r.splitTo(el, 0.3);
  assert.equal(el._sh, 0.3); assert.equal(r.queued.size, 0);
  const q = splitRig({ reduce: true }), e2 = newEl();
  q.splitTo(e2, 0.3); q.splitTo(e2, 0.7);
  assert.equal(e2._sh, 0.7); assert.equal(q.queued.size, 0); assert.equal(q.shown.at(-1), 0.7);
});

test('the split bar holds still on a frame that began before its start, then glides to its share and stops asking for frames', () => {
  const r = splitRig(), el = newEl();
  r.at(1000); r.splitTo(el, 0.1);
  r.at(2000); r.splitTo(el, 0.5);
  r.run(1984);   // (16 ms early)
  assert.ok(Math.abs(el._sh - 0.1) < 1e-12, 'held at its start, not nudged by an interval run backwards');
  let prev = 0.1, t = 2000, frames = 0, biggest = 0;
  while (r.queued.size && frames++ < 600) {
    r.run(t += 16);
    assert.ok(el._sh >= prev - 1e-12, 'never backwards');
    biggest = Math.max(biggest, el._sh - prev); prev = el._sh;
  }
  assert.equal(el._sh, 0.5, 'lands on its share exactly');
  assert.equal(r.queued.size, 0, 'and asks for no more frames');
  assert.ok(biggest < 0.02, `no step is a snap (largest ${biggest.toFixed(4)} of a 0.4 move)`);
  assert.ok(t - 2000 < 2500, `lands within a couple of seconds (${t - 2000} ms)`);
});

// The live model's share changes every frame; whichever of the stage's callbacks and the bar's step the scheduler runs first.
for (const order of ['asked then stepped', 'stepped then asked']) {
  test(`a share that moves every frame is followed, never restarted, and never snaps (${order})`, () => {
    const r = splitRig(), el = newEl(), target = (f) => (f < 120 ? 0.1 + 0.4 * (f / 120) : 0.5 + 0.0003 * Math.sin(f));   // a slider move over 2 s, then a running mean's wobble
    r.at(0); r.splitTo(el, 0.1);
    let prev = 0.1, biggest = 0, midway = null;
    for (let f = 1; f <= 240; f++) {
      const t = f * 16.67; r.at(t);
      if (order === 'asked then stepped') { r.splitTo(el, target(f)); r.run(t); } else { r.run(t); r.splitTo(el, target(f)); }
      assert.ok(el._sh >= prev - (f <= 120 ? 1e-9 : 0.0006), `frame ${f}: never backwards while the share rises (afterwards it follows the wobble, which is under 0.0006)`);
      biggest = Math.max(biggest, el._sh - prev); prev = el._sh;
      if (f === 60) midway = el._sh;
    }
    assert.ok(midway > 0.15, `frozen under a moving share: at 1 s it shows ${midway.toFixed(3)}, the share is at 0.3`);
    assert.ok(biggest < 0.02, `a snap of ${biggest.toFixed(4)} in one frame`);
    assert.ok(Math.abs(el._sh - target(240)) < 0.002, `follows it home (${el._sh.toFixed(4)} against ${target(240).toFixed(4)})`);
  });
}

test('a share that changes direction mid-glide turns without a jump', () => {
  const r = splitRig(), el = newEl();
  r.at(0); r.splitTo(el, 0.2);
  let prev = 0.2, biggest = 0;
  for (let f = 1; f <= 200; f++) {
    const t = f * 16.67; r.at(t);
    if (f === 1) r.splitTo(el, 0.8); if (f === 25) r.splitTo(el, 0.3);
    r.run(t);
    biggest = Math.max(biggest, Math.abs(el._sh - prev)); prev = el._sh;
  }
  assert.ok(biggest < 0.02, `largest step ${biggest.toFixed(4)}`);
  assert.equal(el._sh, 0.3);
});

test('a model that only breathes, under what the bar and its number show, costs no frames and no styles', () => {
  const r = splitRig(), el = newEl();
  r.at(0); r.splitTo(el, 0.403);
  const drawn = r.shown.length;
  for (let f = 1; f <= 100; f++) { r.at(f * 16); r.splitTo(el, 0.403 + 0.0003 * Math.sin(f)); }
  assert.equal(r.queued.size, 0, 'no frame asked for');
  assert.equal(r.shown.length, drawn, 'nothing redrawn');
});

test('a tile that leaves the page mid-glide lands on its share, so asking for the same share again finds it there', () => {
  const r = splitRig(), el = newEl();
  r.at(0); r.splitTo(el, 0.1);
  r.at(1000); r.splitTo(el, 0.5);
  r.run(1100); r.run(1200);
  assert.ok(el._sh > 0.1 && el._sh < 0.5);
  el.isConnected = false;
  r.run(1300);
  assert.equal(el._sh, 0.5, 'landed, not left part way');
  assert.equal(r.shown.at(-1), 0.5, 'and drawn there');
  assert.equal(r.queued.size, 0, 'no more frames for a tile that is gone');
  el.isConnected = true;   // (back on the page with the same share)
  r.at(5000); r.splitTo(el, 0.5);
  assert.equal(el._sh, 0.5);
  assert.equal(r.shown.at(-1), 0.5, 'the bar shows the share it was asked for');
});

test('the same three easings are clamped at the source', () => {
  // (util.js sinkTo is gone, W4 4 Nov 2026: a vessel's card lets go on sheet-move.js glideSheet, as every sheet over the dock.)
  assert.doesNotMatch(read('src/ui/util.js'), /export function sinkTo/);
  assert.match(stage, /dt = Math\.max\(0, \(now - el\._shAt\) \/ 1000\);/);
  assert.match(stage, /follow2\(el\._sh, el\._shW, T, dt, SHOWN_TAU, SPLIT_EPS\)/);
});

// The cause of the freeze, found in a real page on 1 Nov: stage.js's grid kept a path helper called `frame` inside createStage, so
// every `frame(step, 'stage-ease')` there called it (with a function for its width), got a string back, and scheduled nothing. The split
// bar's ease and the catheter's fade-out never ran. The scheduler is now `easeFrame` (frameFor('stage-ease')) and nothing local can stand in.
test('stage.js asks the frame scheduler for its eases, and no local helper is named for it', () => {
  assert.match(stage, /^const easeFrame = frameFor\('stage-ease'\);/m);
  assert.doesNotMatch(stage, /(?:const|let|var|function) frame\b/, 'a local `frame` would shadow the scheduler for whatever calls it');
  assert.doesNotMatch(stage.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /(^|[^\w.$])frame\(/, 'a bare frame( call: use easeFrame, nextFrame or lateFrame');
  assert.match(stage, /me\.raf = easeFrame\(step\);/, 'the catheter fade-out steps on the scheduler');
  assert.match(stage, /const el = Math\.max\(0, now - t0\), k = Math\.min\(1, el \/ CATH_OUT_MS\);/);
});
