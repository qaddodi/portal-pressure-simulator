// num-move.js: an element moved by a number, with a kept paused animation per axis (a fake element and animation here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mover, moverOf, cancelMoves, driven, onMove } from '../src/ui/num-move.js';

const fakeEl = () => {
  const el = { made: [], animate(kf, opts) {
    const a = { kf, opts, currentTime: null, paused: false, cancelled: false, pause() { this.paused = true; }, cancel() { this.cancelled = true; } };
    el.made.push(a);
    return a;
  } };
  return el;
};
const live = (el) => el.made.filter((a) => !a.cancelled);
// What the animation shows at its currentTime: its two keyframes, linear (the first number of the pair is x, the second y).
const at = (a) => {
  const num = (s) => s.match(/-?\d+(\.\d+)?/g).map(Number);
  const k0 = a.kf[0].translate ?? a.kf[0].transform, k1 = a.kf[1].translate ?? a.kf[1].transform;
  const p = a.currentTime / a.opts.duration, A = num(k0), B = num(k1);
  return A.map((v, i) => v + (B[i] - v) * p);
};

test('a y mover is one paused, linear, fill-both animation whose currentTime is the offset: 1 px per ms', () => {
  const el = fakeEl(), m = new Mover(el, 'translate', 'y');
  m.set(0, 123.456);
  const [a] = live(el);
  assert.equal(el.made.length, 1);
  assert.equal(a.paused, true);
  assert.equal(a.opts.fill, 'both');
  assert.equal(a.opts.easing, 'linear');
  assert.equal(a.opts.composite, 'replace');
  assert.match(a.kf[0].translate, /^0px -?\d+px$/);
  assert.ok(Math.abs(at(a)[1] - 123.456) < 1e-9, `shown ${at(a)[1]}`);
  assert.ok(Math.abs(a.opts.duration - (parseFloat(a.kf[1].translate.split(' ')[1]) - parseFloat(a.kf[0].translate.split(' ')[1]))) < 1e-9, 'one px per ms');
});

test('later writes are numbers on the same animation: none is made, fractions are kept', () => {
  const el = fakeEl(), m = new Mover(el, 'translate', 'y');
  m.set(0, 10);
  const [a] = live(el);
  for (const y of [0, 0.25, 99.999, 640, 1.5, -300.125]) { m.set(0, y); assert.ok(Math.abs(at(a)[1] - y) < 1e-9, `${y}`); }
  assert.equal(el.made.length, 1, 'no animation made after the first');
});

test('a value out of the window re-arms around it, the old animation cancelled; the shown value is right either side', () => {
  const el = fakeEl(), m = new Mover(el, 'translate', 'y');
  m.set(0, 0);
  m.set(0, 5000);
  assert.equal(el.made.length, 2);
  assert.equal(el.made[0].cancelled, true);
  assert.ok(Math.abs(at(live(el)[0])[1] - 5000) < 1e-9);
  m.set(0, -7000.5);
  assert.equal(live(el).length, 1);
  assert.ok(Math.abs(at(live(el)[0])[1] + 7000.5) < 1e-9);
});

test('a 2D translate is an x animation that replaces and a y animation that adds, armed together (x first)', () => {
  const el = fakeEl(), m = new Mover(el, 'translate', 'xy');
  m.set(37.5, -12.25);
  const [ax, ay] = live(el);
  assert.equal(ax.opts.composite, 'replace');
  assert.equal(ay.opts.composite, 'add');
  assert.ok(Math.abs(at(ax)[0] - 37.5) < 1e-9 && at(ax)[1] === 0);
  assert.ok(at(ay)[0] === 0 && Math.abs(at(ay)[1] + 12.25) < 1e-9);
  // (x leaves its window: both are made again, in the same order, or the add would sit under the replace)
  m.set(9000, -12.25);
  const [bx, by] = live(el);
  assert.equal(live(el).length, 2);
  assert.equal(bx.opts.composite, 'replace'); assert.equal(by.opts.composite, 'add');
  assert.ok(el.made.indexOf(bx) < el.made.indexOf(by));
});

test('a transform mover keeps to one axis and runs translateX or translateY', () => {
  const el = fakeEl(), m = new Mover(el, 'transform', 'x');
  m.set(-80.5, 0);
  const [a] = live(el);
  assert.match(a.kf[0].transform, /^translateX\(-?\d+px\)$/);
  assert.ok(Math.abs(at(a)[0] + 80.5) < 1e-9);
  assert.throws(() => new Mover(fakeEl(), 'transform', 'xy'));
  assert.throws(() => new Mover(fakeEl(), 'opacity', 'x'));
  const e2 = fakeEl(), v = new Mover(e2, 'transform', 'y');
  v.set(0, 3);
  assert.match(live(e2)[0].kf[0].transform, /^translateY\(/);
});

test('cancel lets go of everything and the next write arms afresh', () => {
  const el = fakeEl(), m = new Mover(el, 'translate', 'xy');
  m.set(1, 2);
  m.cancel();
  assert.equal(live(el).length, 0);
  m.cancel();   // (twice is harmless)
  m.set(3, 4);
  assert.equal(live(el).length, 2);
});

test('moverOf keeps one mover per element and kind; cancelMoves cancels all of an element\'s', () => {
  const el = fakeEl();
  const a = moverOf(el, 'translate', 'y'), b = moverOf(el, 'translate', 'y'), c = moverOf(el, 'transform', 'x');
  assert.equal(a, b); assert.notEqual(a, c);
  a.set(0, 5); c.set(5, 0);
  assert.equal(live(el).length, 2);
  cancelMoves(el);
  assert.equal(live(el).length, 0);
  cancelMoves({});   // (an element that never moved)
});

test('a glass mover tells the glass its numbers and wakes it; it is not driven once cancelled', () => {
  const el = fakeEl(), m = new Mover(el, 'translate', 'xy', true);
  let woken = 0;
  const off = onMove(() => { woken++; });
  assert.equal(driven(el), null, 'not before it has moved');
  m.set(4, 9);
  const d = driven(el);
  assert.deepEqual([d.x, d.y], [4, 9]);
  assert.equal(woken, 1);
  m.set(5, 10);
  assert.deepEqual([driven(el).x, driven(el).y], [5, 10]);
  assert.equal(woken, 2);
  m.cancel();
  assert.equal(driven(el), null);
  assert.equal(woken, 3, 'letting go wakes the glass once, so it stops drawing the offset');
  off();
  m.set(1, 1);
  assert.equal(woken, 3, 'a woken function stopped is not called');
  // (a mover that is not the glass's is not announced)
  const q = new Mover(fakeEl(), 'transform', 'x');
  q.set(3, 0);
  assert.equal(woken, 3);
});
