// M2 (implicit-state-machines.md): one "is the view moving?" answer. The table is the spec: each motion source alone, then none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewMovingOf } from '../src/ui/view-moving.js';

const src = (on = {}) => ({ glide: () => !!on.glide, cam: () => !!on.cam, view: () => !!on.view, hand: () => !!on.hand, panning: () => !!on.panning });

test('every source moves the view', () => {
  for (const k of ['glide', 'cam', 'view', 'hand', 'panning']) assert.equal(viewMovingOf(src({ [k]: true }), true), true, k);
});
test('nothing moving is at rest', () => assert.equal(viewMovingOf(src(), true), false));
test('the old test ignores a pinch, wheel zoom, fling and view change', () => {
  assert.equal(viewMovingOf(src({ hand: true }), false), false);
  assert.equal(viewMovingOf(src({ view: true }), false), false);
  assert.equal(viewMovingOf(src({ glide: true }), false), true);
  assert.equal(viewMovingOf(src({ cam: true }), false), true);
  assert.equal(viewMovingOf(src({ panning: true }), false), true);
});
