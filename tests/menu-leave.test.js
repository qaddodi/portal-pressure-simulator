// A menu put away while it is still coming in (sprint 1 Nov, menu open/close): src/ui/menu-leave.js plays its exit from the look it
// had at that instant, not from its resting look. Here: the hand-over against a stand-in for the page (an entrance running, an
// entrance finished, the exit moving nothing the entrance had moved), and that the three places a menu leaves from
// (util.js popover, menu.js, why.js) go through it and keep their class names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const calls = [];
// A stand-in for the page: the animationstart listener menu-leave.js installs, and elements that record their animate() calls.
const listeners = [];
globalThis.addEventListener = (t, f) => { if (t === 'animationstart') listeners.push(f); };
globalThis.document = { documentElement: { classList: { contains: () => false } } };
let clock = 1000;
globalThis.performance = { now: () => clock };
const fake = (...cls) => ({
  classList: { contains: (c) => cls.includes(c) },
  style: { getPropertyValue: () => '' },
  animate: (kf, o) => { calls.push({ kf, o }); return {}; },
});
const begin = (el, animationName, t) => { for (const f of listeners) f({ target: el, animationName, timeStamp: t }); };
const { leaveFromHere } = await import('../src/ui/menu-leave.js');
const { easeArrive, D_FLIP, D_SMALL, EASE_IN } = await import('../src/ui/ease.js');

test('mid entrance: the exit runs from the look worked out from the entrance\'s time and curve to the exit\'s own end', () => {
  calls.length = 0;
  const el = fake('menu'); begin(el, 'scale-settle', 1000);
  clock = 1060;   // half of the 120 ms entrance
  let left = 0;
  assert.equal(leaveFromHere(el, () => { left++; }), true);
  assert.equal(left, 1, 'the leaving class is set exactly once');
  const k = +easeArrive(0.5).toFixed(4);
  assert.deepEqual(calls[0].kf, [{ opacity: k }, { opacity: 0 }]);
  assert.deepEqual(calls[0].o, { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });

test('a sheet that slides in leaves from where it had slid, by its own edge variables; the main menu\'s sheet leaves on --d-small', () => {
  calls.length = 0;
  const el = fake('umenu', 'sheet'); begin(el, 'slide-from-edge', 2000);
  clock = 2000 + D_SMALL / 2;
  assert.equal(leaveFromHere(el, () => {}), true);
  const k = +easeArrive(0.5).toFixed(4), j = +(1 - k).toFixed(4);
  assert.equal(calls[0].kf[0].transform, `translate(calc(var(--edge-x, 0px) * ${j}), calc(var(--edge-y, 0px) * ${j}))`);
  assert.equal(calls[0].kf[1].transform, 'translate(var(--edge-x, 0px), var(--edge-y, 0px))');
  assert.equal(calls[0].o.duration, D_SMALL);
});

test('the scrim fades from its look', () => {
  calls.length = 0;
  const scrim = fake('um-scrim'); begin(scrim, 'crossfade', 3000);
  clock = 3000 + D_SMALL / 4;
  assert.equal(leaveFromHere(scrim, () => {}), true);
  assert.deepEqual(calls[0].kf, [{ opacity: +easeArrive(0.25).toFixed(4) }, { opacity: 0 }]);
});
});

test('an entrance that had finished, or one never seen: the leave is today\'s, nothing is played', () => {
  calls.length = 0;
  const el = fake('menu'); begin(el, 'scale-settle', 5000);
  clock = 5000 + D_FLIP;
  let left = 0;
  assert.equal(leaveFromHere(el, () => left++), false);
  assert.equal(leaveFromHere(fake('menu'), () => left++), false);
  assert.equal(left, 2);
  assert.equal(calls.length, 0);
});

test('nothing in menu-leave.js asks the page for a layout or style value', () => {
  const src = read('src/ui/menu-leave.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /getComputedStyle|getAnimations|getComputedTiming|getBoundingClientRect|offset(Width|Height)/);
});

test('an element without the Web Animations API just leaves', () => {
  let left = 0;
  assert.equal(leaveFromHere({}, () => left++), false);
  assert.equal(left, 1);
});

test('the three places a menu leaves from go through it, and keep their classes', () => {
  assert.match(read('src/ui/util.js'), /leaveFromHere\(el, leave\)/);
  assert.match(read('src/ui/util.js'), /if \(el\.dataset\.swiped\) leave\(\)/, 'a swiped sheet is already moving: it leaves as it did');
  assert.match(read('src/ui/why.js'), /leaveFromHere\(pop, \(\) => \{ pop\.classList\.remove\('show'\); pop\.classList\.add\('leaving'\); \}\)/);
  const m = read('src/ui/menu.js');
  assert.match(m, /leaveFromHere\(panel, \(\) => panel\.classList\.add\('out'\)\)/);
  assert.match(m, /leaveFromHere\(scrim, \(\) => scrim\.classList\.add\('out'\)\)/);
  assert.doesNotMatch(m, /menuLeaveOff|menuleave=0/, 'opened again while fading: the old panel is left to finish, never removed at once');
  assert.match(m, /\n\s+panel\.inert = true;/);
  assert.match(m, /\n\s+placeAt\(el, anchor, \{ margin: 12, flip: false \}\);/, 'the main menu is placed by the one placer');
});
