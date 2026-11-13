import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A sheet pulled down by a finger is carried by the compositor (src/ui/sheet-pull.js): the pull is one paused animation whose clock a move of
// the finger sets, the let-go one animation on the curve that carries the finger's speed on. Nothing is written to the panel's style in a
// move, and the let-go carries the pull's own clock on, frame by frame, so the GPU frost takes the same number (3 and 13 Nov 2026).
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
const classes = new Set();
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} }, classList: { contains: (c) => classes.has(c) } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
const { pullRelease, pullAt, pullStop } = await import('../src/ui/sheet-pull.js');
const { moverOf } = await import('../src/ui/num-move.js');
const { swipeSheet } = await import('../src/ui/util.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// An element that animates the way the page does, as far as the pull needs: each animation keeps its keyframes, options and clock.
function fakeEl() {
  const made = [];
  const writes = [];
  const el = {
    made, writes,
    style: new Proxy({}, { set(_, k, v) { writes.push([k, v]); return true; }, get: () => '' }),
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    animate(kf, opts) {
      const a = { kf, opts, currentTime: 0, paused: false, cancelled: false, onfinish: null, pause() { this.paused = true; }, cancel() { this.cancelled = true; } };
      made.push(a);
      return a;
    },
  };
  return el;
}

test('a pull is the mover\'s one paused animation (num-move.js): a number per move, no style', () => {
  const el = fakeEl();
  const m = moverOf(el, 'translate', 'y');
  m.set(0, 30);
  assert.equal(el.made.length, 1);
  const a = el.made[0];
  assert.equal(a.paused, true);
  assert.equal(a.opts.easing, 'linear');
  assert.deepEqual(Object.keys(a.kf[0]), ['translate']);
  const at = (y) => a.kf[0].translate && Number(a.kf[0].translate.split(' ')[1].replace('px', '')) + a.currentTime;
  assert.equal(at(), 30, 'it starts where the sheet is');
  m.set(0, 75);
  assert.equal(at(), 75);
  assert.equal(el.made.length, 1, 'one animation for the drag');
  assert.equal(el.writes.length, 0, 'the panel\'s style is never written');
});

// Where a pull's animation draws the panel: its first key's offset plus its clock (one px to each ms).
const posOf = (a) => Number(String(Object.values(a.kf[0])[0]).replace(/^(0px )?(translateY\()?/, '').replace(/(px|px\))$/, '')) + a.currentTime;

// The let-go of a pull is the pull's own number carried on frame by frame on the shared scheduler (frame.js), so the sheet and its GPU frost take
// the same number in the same frame (13 Nov 2026, iPhone: a swipe-down close "flickers and goes blank": the frost trailed a compositor let-go).
// A clock and a frame queue stand in for the page's here.
let now = 1000;
const frames = [];
globalThis.performance.now = () => now;
globalThis.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
const tick = (ms) => { now += ms; const q = frames.splice(0); for (const f of q) f(now); };
const runOut = (ms) => { for (let t = 0; t < ms; t += 16) tick(16); };

test('a let-go carries the pull\'s own animation to rest frame by frame and hands the panel back to the stylesheet at its end', () => {
  const el = fakeEl();
  const pull = moverOf(el, 'translate', 'y');
  pull.set(0, 40);
  let done = 0;
  const r = pullRelease(el, 'translate', pull, 40, 0, 240, 'cubic-bezier(.2, .1, .2, 1)', () => { done++; });
  assert.equal(el.made.length, 1, 'no second animation: the pull itself is carried');
  const a = el.made[0];
  tick(120);
  const mid = posOf(a);
  assert.ok(mid > 0 && mid < 40, `part way back: ${mid}`);
  assert.equal(done, 0);
  runOut(200);
  assert.equal(done, 1);
  assert.equal(a.cancelled, true, 'back at rest the animation lets go of the panel');
  runOut(200);
  assert.equal(done, 1, 'its end is told once');
  assert.equal(pullAt(r), 0);
});

test('a sheet let go away stays where it lands until the menu takes it off the page', () => {
  const el = fakeEl();
  const pull = moverOf(el, 'translate', 'y');
  pull.set(0, 0);
  let done = 0;
  const r = pullRelease(el, 'translate', pull, 120, 600, 220, 'ease', () => { done++; });
  runOut(240);
  assert.equal(done, 1);
  assert.equal(el.made[0].cancelled, false, 'it holds at the sheet\'s height');
  assert.equal(posOf(el.made[0]), 600);
  assert.equal(pullAt(r), 600);
});

test('where a let-go has the panel now comes from its own clock and curve, never the page', () => {
  const el = fakeEl();
  const r = pullRelease(el, 'translate', null, 80, 0, 200, 'cubic-bezier(0, 0, 1, 1)', () => {});
  const a = el.made[0];
  a.currentTime = 0; assert.ok(Math.abs(pullAt(r) - 80) < 1e-6);
  a.currentTime = 100; assert.ok(Math.abs(pullAt(r) - 40) < 0.5, `halfway on a straight curve: ${pullAt(r)}`);
  a.currentTime = 200; assert.equal(pullAt(r), 0);
  pullStop(r);
  assert.equal(a.cancelled, true);
  assert.equal(a.onfinish, null, 'a stopped let-go never tells its end');
  assert.equal(pullAt(null), 0);
});


// swipeSheet on a panel that animates as above: a touch, moves, a lift.
function rig({ thumb = false, h = 600 } = {}) {
  classes.clear(); if (thumb) classes.add('thumb-ui');
  const el = fakeEl();
  const on = {};
  el.addEventListener = (type, fn) => { on[type] = fn; };
  el.parentElement = null;
  el.offsetHeight = h;
  el.scrollHeight = 0; el.clientHeight = 0; el.scrollTop = 0;
  const closed = [];
  globalThis.getComputedStyle = () => ({ overflowY: 'visible', transform: 'none' });
  swipeSheet(el, () => closed.push(1));
  const target = { closest: () => null, parentElement: null, scrollHeight: 0, clientHeight: 0, scrollTop: 0 };
  const ev = (y) => ({ pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 50, clientY: y, target, cancelable: true, preventDefault() {} });
  return { el, on, closed, target, ev };
}

test('swipeSheet: a pull sets one clock per move and writes no style', () => {
  for (const thumb of [true, false]) {
    const { el, on, ev } = rig({ thumb });
    on.pointerdown(ev(100));
    on.pointermove(ev(104));   // (under 8 px: not a pull yet)
    assert.equal(el.made.length, 0);
    on.pointermove(ev(120));
    assert.equal(el.made.length, 1, 'the pull begins at the first move past a tap');
    const a = el.made[0];
    assert.deepEqual(Object.keys(a.kf[0]), [thumb ? 'translate' : 'transform']);
    assert.equal(posOf(a), 0, 'the sheet is where the finger took it: the 8 px a tap may wobble are not pulled');
    for (const y of [140, 170, 200]) { on.pointermove(ev(y)); assert.equal(posOf(a), y - 120); }
    assert.equal(el.made.length, 1, 'one animation for the whole drag');
    assert.deepEqual(el.writes.filter(([k]) => k !== 'animation'), [], 'no style is written in the moves');
  }
});

test('swipeSheet: a short slow pull eases back, a long one goes and the menu is told', () => {
  let r = rig();
  r.on.pointerdown(r.ev(100));
  r.on.pointermove(r.ev(120)); r.on.pointermove(r.ev(140));
  r.on.pointerup(r.ev(0));
  assert.equal(r.closed.length, 0);
  assert.equal(r.el.made.length, 1, 'the pull is carried back, no second animation');
  tick(239);
  assert.ok(posOf(r.el.made[0]) > 0, 'still on its way at 239 ms');
  runOut(64);
  assert.equal(r.el.made[0].cancelled, true, 'it eased back to rest within one D_SMALL');

  r = rig({ thumb: true, h: 600 });
  r.on.pointerdown(r.ev(100));
  r.on.pointermove(r.ev(150)); r.on.pointermove(r.ev(260));
  r.on.pointerup(r.ev(0));
  assert.equal(r.closed.length, 1, 'past the line the menu is told');
  runOut(260);
  assert.equal(posOf(r.el.made[0]), 608, 'it goes to its own height and the dock\'s 8 px, in one sheet time, D_SMALL, over the dock too (W4)');
});

test('swipeSheet: a touch while the let-go eases takes the sheet over from where it is drawn, without a jump', () => {
  const r = rig();
  r.on.pointerdown(r.ev(100));
  r.on.pointermove(r.ev(120)); r.on.pointermove(r.ev(150));
  r.on.pointerup(r.ev(0));
  tick(120);   // (part way back)
  const a = r.el.made[0];
  const here = posOf(a);
  assert.ok(here > 0 && here < 30, `${here}`);
  r.on.pointerdown(r.ev(100 + here));
  r.on.pointermove(r.ev(100 + here + 10));
  assert.ok(a.paused);
  const at = posOf(r.el.made[r.el.made.length - 1]);
  assert.ok(Math.abs(at - here) < 1e-6, `the new pull carries on from where the sheet was drawn: ${at} vs ${here}`);
  runOut(400);
  assert.ok(Math.abs(posOf(r.el.made[r.el.made.length - 1]) - here) < 1e-6, 'and the old let-go no longer moves it');
});

test('the sheet\'s drag source writes no style or variable in a move and starts no frame loop', () => {
  const util = read('src/ui/util.js');
  const swipe = util.slice(util.indexOf('export function swipeSheet'), util.indexOf('export function menuItem'));
  assert.doesNotMatch(swipe, /\.style\.(setProperty|transform|translate)/, 'the finger moves the compositor\'s clock, not the panel\'s style');
  assert.doesNotMatch(swipe, /--sink|sinkTo|frame\(/);
  assert.match(swipe, /s\.pull\.set\(0, s\.dy\)/);
});
