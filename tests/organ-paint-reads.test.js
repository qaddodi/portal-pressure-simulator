import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDash, reshape, shapeSource, matAttrTo, elMatTo, cssLocal, mulTo } from '../src/ui/organ-paint.js';

test('a dash pattern is read in place: the browser\'s computed forms, an odd count doubled, anything else not drawn', () => {
  assert.deepEqual(parseDash('6px, 4px', '0px'), { a: [6, 4], off: 0 });
  assert.deepEqual(parseDash('3.5 2', '1.5px'), { a: [3.5, 2], off: 1.5 });
  assert.deepEqual(parseDash('5', '0'), { a: [5, 5], off: 0 }, 'one number: on and off alike');
  assert.deepEqual(parseDash('2, 1, 3', '0'), { a: [2, 1, 3, 2, 1, 3], off: 0 }, 'an odd count is the pattern twice');
  assert.equal(parseDash('10%, 5%', '0'), null, 'a percentage is not drawn');
  assert.equal(parseDash('0 0', '0'), null, 'nothing to draw');
  assert.equal(parseDash('-1 2', '0'), null);
  assert.equal(parseDash('1e-1 2', '0'), null, 'an exponent is not read');
  assert.equal(parseDash('', '0'), null);
});

test('reshape names a kept shape record anew without making one', () => {
  const s = shapeSource('M0 0', [['M', 0, 0]]);
  const id = s.id;
  const t = reshape(s, 'M1 1', [['M', 1, 1]]);
  assert.equal(t, s, 'the same record');
  assert.equal(s.d, 'M1 1');
  assert.ok(s.id > id, 'a new name, so a mesh is cut for the new shape');
});

test('matAttrTo writes an element\'s transform into the given array and shares the identity where there is none', () => {
  const none = matAttrTo([9, 9, 9, 9, 9, 9], {});
  assert.deepEqual(none, [1, 0, 0, 1, 0, 0]);
  const o = [0, 0, 0, 0, 0, 0];
  const el = { transform: { baseVal: { numberOfItems: 1, consolidate: () => ({ matrix: { a: 2, b: 0, c: 0, d: 3, e: 4, f: 5 } }) } } };
  assert.equal(matAttrTo(o, el), o);
  assert.deepEqual(o, [2, 0, 0, 3, 4, 5]);
  assert.equal(elMatTo(o, {}), none, 'no attribute: the shared identity');
});

test('cssLocal is the element\'s frame undone by its parent\'s, written into the record it had', () => {
  const m = (a, b, c, d, e, f) => ({ a, b, c, d, e, f });
  const el = { getCTM: () => m(2, 0, 0, 2, 10, 20), parentNode: { getCTM: () => m(2, 0, 0, 2, 0, 0) } };
  const first = cssLocal(el);
  assert.deepEqual(first.map((v) => +v.toFixed(6)), [1, 0, 0, 1, 5, 10]);
  const kept = [0, 0, 0, 0, 0, 0];
  assert.equal(cssLocal(el, kept), kept, 'written in place');
  assert.deepEqual(kept.map((v) => +v.toFixed(6)), [1, 0, 0, 1, 5, 10]);
  assert.equal(cssLocal({ getCTM: () => null, parentNode: { getCTM: () => m(1, 0, 0, 1, 0, 0) } }), null);
  assert.deepEqual(mulTo([0, 0, 0, 0, 0, 0], [1, 0, 0, 1, 1, 1], [1, 0, 0, 1, 2, 2]), [1, 0, 0, 1, 3, 3]);
});
