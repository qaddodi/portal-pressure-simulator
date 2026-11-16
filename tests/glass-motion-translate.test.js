// An animation of the translate property (the dock glide's, the words' glide) moves the glass as a transform's does: its keyframes are
// followed from the clock, and it stands for the element's inline translate while it plays (3 Nov 2026: without this the glass jumped to the
// glide's end, the inline value, and ran ahead of its card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileKeyframes, motionAt, Motion } from '../src/ui/glass-motion.js';

const at = (T, p) => { const m = new Motion(); m.at = p; return [motionAt(T, m), m]; };

test('translate keyframes are a translation, flagged as the property\'s', () => {
  const T = compileKeyframes([{ offset: 0, translate: '0px -120px' }, { offset: 1, translate: '0px -163px' }]);
  assert.equal(T.bad, false);
  assert.equal(T.prop, true);
  const [ok, m] = at(T, 0.5);
  assert.equal(ok, true);
  assert.equal(m.hasT, true);
  assert.equal(m.prop, true);
  assert.ok(Math.abs(m.tx) < 1e-9 && Math.abs(m.ty - -141.5) < 1e-9, `${m.tx}, ${m.ty}`);
});

test('many keyframes, "none", one-value translates and a single length all read', () => {
  const T = compileKeyframes([{ offset: 0, translate: 'none' }, { offset: 0.5, translate: '10px' }, { offset: 1, translate: '10px 20px' }]);
  assert.equal(T.bad, false);
  let [, m] = at(T, 0.25); assert.deepEqual([m.tx, m.ty], [5, 0]);
  [, m] = at(T, 0.75); assert.deepEqual([m.tx, m.ty], [10, 10]);
});

test('a transform animation is not the property\'s, and one that mixes the two is not followed', () => {
  const Tf = compileKeyframes([{ offset: 0, transform: 'translateX(0px)' }, { offset: 1, transform: 'translateX(30px)' }]);
  assert.equal(Tf.prop, false);
  const [, m] = at(Tf, 0.5); assert.equal(m.prop, false); assert.equal(m.tx, 15);
  const mix = compileKeyframes([{ offset: 0, transform: 'translateX(0px)' }, { offset: 1, translate: '30px' }]);
  assert.equal(mix.bad, true);
  assert.equal(at(mix, 0.5)[0], false);
  const miss = compileKeyframes([{ offset: 0, translate: '0px' }, { offset: 1 }]);
  assert.equal(miss.bad, true);
});


// A view switch read the glasses' boxes and styles on most frames (play-test T02, 16 Nov 2026; pps.glassWhy). An inline transform that is no
// translation (a scale, a rotation) could not be put back from the numbers, so every frame it stood the glass asked for a read of the page;
// the page read with it already holds it, so it is a reason once per text, not once per frame.
import { Inline, inlineShift, inlineShiftNew, inlineShiftOk, inlineTranslate, inlineTranslateNew, inlineTranslateOk } from '../src/ui/glass-motion.js';

test('an inline transform that is no translation asks for a read once, not in every frame it stands', () => {
  const im = new Inline();
  const frame = (str) => { if (!inlineShift(im, str)) return inlineShiftNew(im, str); inlineShiftOk(im); return false; };
  assert.equal(frame('scale(1.05)'), true, 'the first frame it is seen');
  for (let i = 0; i < 20; i++) assert.equal(frame('scale(1.05)'), false, 'the same text again: the page read holds it');
  assert.equal(frame('scale(1.06)'), true, 'a new text is a new reason');
  assert.equal(frame('translate(4px, 2px)'), false, 'a translation is followed by the numbers');
  assert.equal(frame('scale(1.06)'), true, 'and its return after a translation is read again');
});

test('the same for an inline translate the numbers cannot follow', () => {
  const im = new Inline();
  const frame = (str) => { if (!inlineTranslate(im, str)) return inlineTranslateNew(im, str); inlineTranslateOk(im); return false; };
  assert.equal(frame('calc(10px + 1em) 0px'), true);
  assert.equal(frame('calc(10px + 1em) 0px'), false);
  assert.equal(frame('3px 4px'), false);
  assert.equal(frame('calc(10px + 1em) 0px'), true);
});
