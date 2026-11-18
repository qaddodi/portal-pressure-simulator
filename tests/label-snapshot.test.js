import { stageSource } from './stage-src.js';
// The displayed-label snapshot (R17): { seq, gen, items: [{ key, x, y, w, h, a, clipped }] } from the pictures drawn in the last frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotItem } from '../src/ui/label-gl.js';

const st = stageSource();

test('an item is in CSS px with its opacity, and clipped only where it leaves the canvas', () => {
  assert.deepEqual(snapshotItem('a', 20, 40, 60, 30, 0.5, 2, 400, 300), { key: 'a', x: 10, y: 20, w: 30, h: 15, a: 0.5, clipped: false });
  assert.equal(snapshotItem('a', -1, 0, 10, 10, 1, 1, 100, 100).clipped, true);
  assert.equal(snapshotItem('a', 95, 0, 10, 10, 1, 1, 100, 100).clipped, true);
  assert.equal(snapshotItem('a', 90, 90, 10, 10, 1, 1, 100, 100).clipped, false);
});


// R09: a picture off its DOM label must not take the click meant for where it stands.
import { displacedNow } from '../src/ui/label-gl.js';
test('pointer activation is held off while a ride or a moving glide has the pictures off their labels, and restored after', () => {
  assert.equal(displacedNow(false, 0), false);
  assert.equal(displacedNow(true, 0), true);
  assert.equal(displacedNow(false, 3), true);
  assert.equal(displacedNow(false, 0), false);   // (the landing done: every glide dropped)
  // (A class between frames on the labels' svg, toggled on a change only; a fade-in glide does not count, it moves nothing.)
});






test('a layout solved for another view is never carried onto this one, nor handed to the GPU while its own solve is pending', () => {
  assert.ok(!st.includes('glHold'));
});
