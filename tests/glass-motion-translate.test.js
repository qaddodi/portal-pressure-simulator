// An animation of the translate property (the dock glide's, the words' glide) moves the glass as a transform's does: its keyframes are
// followed from the clock, and it stands for the element's inline translate while it plays (3 Nov 2026: without this the glass jumped to the
// glide's end, the inline value, and ran ahead of its card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('glass-gl lets the animated translate stand for the inline one, and keeps no end translation of it', () => {
  const gl = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(AM\.hasT\) \{ tx = AM\.tx; ty = AM\.ty; hasT = true; byProp = AM\.prop; \}/);
  assert.match(gl, /if \(byProp\) \{[^}]*\} else if \(!inlineTranslate\(im, s\.translate\)\) flag\.bad = true; else \{ tx \+= im\.ux; ty \+= im\.uy; \}/);
  assert.match(gl, /t: AM\.hasT && !AM\.prop \? \[AM\.tx, AM\.ty\] : was\.t \|\| null/);
});
