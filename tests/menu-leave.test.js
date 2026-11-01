// A menu put away while it is still coming in (sprint 1 Nov, menu open/close): src/ui/menu-leave.js plays its exit from the look it
// had at that instant, not from its resting look. Here: the hand-over against a stand-in for the page (an entrance running, an
// entrance finished, the exit moving nothing the entrance had moved), the off switch, and that the three places a menu leaves from
// (util.js popover, menu.js, why.js) go through it and keep their class names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const calls = [];
// A stand-in element: `anims` is what getAnimations() returns before the leave, `exit` what it returns after; computed style is by phase.
function fake({ coming, exit, now, end }) {
  let phase = 'now';
  const e = {
    getAnimations: () => (phase === 'now' ? (coming ? [{ animationName: 'scale-settle' }] : []) : [exit]),
    animate: (kf, o) => { calls.push({ kf, o }); return {}; },
    _leave() { phase = 'left'; },
    _cs: () => (phase === 'now' ? now : end),
  };
  return e;
}
globalThis.getComputedStyle = (el) => { const v = el._cs(); return { ...v, getPropertyValue: (k) => v[k] ?? '' }; };
const exitAnim = (state) => ({
  animationName: 'scale-settle-out', effect: { getTiming: () => ({ duration: 120, easing: 'ease-in-curve' }) }, state,
  pause() { this.state.paused = true; }, play() { this.state.played = true; }, cancel() { this.state.cancelled = true; },
  set currentTime(t) { this.state.t = t; },
});
const { leaveFromHere, menuLeaveOff } = await import('../src/ui/menu-leave.js');

test('mid entrance: the exit runs from the look it had to the exit\'s own end, on the exit\'s own time and curve', () => {
  calls.length = 0;
  const st = {}, el = fake({ coming: true, exit: exitAnim(st), now: { opacity: '0.5', transform: 'matrix(0.99,0,0,0.99,0,0)', '--sink': '0px' }, end: { opacity: '0', transform: 'matrix(0.98,0,0,0.98,0,0)', '--sink': '0px' } });
  let left = 0;
  assert.equal(leaveFromHere(el, () => { left++; el._leave(); }), true);
  assert.equal(left, 1, 'the leaving class is set exactly once');
  assert.deepEqual(calls[0].kf, [{ opacity: '0.5', transform: 'matrix(0.99,0,0,0.99,0,0)' }, { opacity: '0', transform: 'matrix(0.98,0,0,0.98,0,0)' }], '--sink did not change, so it is not animated');
  assert.deepEqual(calls[0].o, { duration: 120, easing: 'ease-in-curve', fill: 'forwards' });
  assert.equal(st.cancelled, true, 'the stylesheet\'s exit hands over');
});

test('an entrance that had finished: the leave is today\'s, nothing is read or played', () => {
  calls.length = 0;
  const el = fake({ coming: false, exit: exitAnim({}), now: { opacity: '1' }, end: { opacity: '0' } });
  let left = 0;
  assert.equal(leaveFromHere(el, () => { left++; el._leave(); }), false);
  assert.equal(left, 1);
  assert.equal(calls.length, 0);
});

test('an exit that moves nothing the entrance had moved is left to the stylesheet', () => {
  calls.length = 0;
  const st = {}, el = fake({ coming: true, exit: exitAnim(st), now: { opacity: '1', transform: 'none' }, end: { opacity: '1', transform: 'none' } });
  assert.equal(leaveFromHere(el, () => el._leave()), false);
  assert.equal(calls.length, 0);
  assert.equal(st.played, true, 'the exit it had paused to read is put back and plays');
  assert.equal(st.cancelled, undefined);
});

test('?menuleave=0 is read from the search string; an element without the Web Animations API just leaves', () => {
  assert.equal(menuLeaveOff('?menuleave=0'), true);
  assert.equal(menuLeaveOff('?a=1&menuleave=0'), true);
  assert.equal(menuLeaveOff('?menuleave=1'), false);
  assert.equal(menuLeaveOff(''), false);
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
  assert.match(m, /if \(leaveT && menuLeaveOff\(location\.search\)\)/, 'opened again while fading: the old panel is only removed at once with the flag off');
});
