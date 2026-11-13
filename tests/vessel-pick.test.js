import { stageSource } from './stage-src.js';
// Vessel picking on the vessels' own data (vessel-pick.js): a course is a stroke of its hit width with round caps; on a stroke the
// one drawn on top (highest rank) wins, near one the nearest within slop CSS px; the stage picks through it, not through elements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesselPick, dist2 } from '../src/ui/vessel-pick.js';

const A = [[0, 0], [100, 0]], B = [[50, -50], [50, 50]], C = [[200, 0], [300, 0]];
const each = (list) => (visit) => { for (const [id, rank, r, P] of list) visit(id, rank, r, P); };

test('distance to a course: along it, past its end (round cap) and to one point', () => {
  assert.equal(dist2(A, 50, 3), 9);
  assert.equal(dist2(A, 103, 4), 25);
  assert.equal(dist2([[1, 1]], 4, 5), 25);
});

test('on a stroke the highest rank wins, whatever order the courses come in', () => {
  const p = createVesselPick(each([['top', 20, 5, B], ['under', 10, 5, A]]));
  assert.equal(p.pick(50, 0, 1), 'top');
  const q = createVesselPick(each([['under', 10, 5, A], ['top', 20, 5, B]]));
  assert.equal(q.pick(50, 0, 1), 'top');
  assert.equal(q.pick(10, 2, 1), 'under');
});

test('off every stroke: nothing, or the nearest within slop CSS px (scaled by the camera)', () => {
  const p = createVesselPick(each([['a', 1, 5, A], ['c', 2, 5, C]]));
  assert.equal(p.pick(150, 0, 1), null);
  assert.equal(p.pick(150, 0, 1, 50), 'a');   // (45 px past a's edge, 45 past c's: the first nearest stays)
  assert.equal(p.pick(160, 0, 1, 50), 'c');
  assert.equal(p.pick(150, 0, 2, 50), null, 'at 2 px per unit the gap is 90 px');
  assert.equal(p.pick(150, 0, 0), null, 'no camera, no pick');
});

test('a course left out (no points, no width) is skipped', () => {
  const p = createVesselPick(each([['none', 9, 5, null], ['empty', 9, 5, []], ['thin', 9, 0, A], ['a', 1, 5, A]]));
  assert.equal(p.pick(50, 0, 1), 'a');
});

test('the stage picks vessels on their data: no hit element, path text or style read', () => {
  const st = stageSource();
  const fn = st.slice(st.indexOf('  function edgeFromEvent(ev) {'), st.indexOf('  // Organs under a point (anatomy only).'));
  assert.match(fn, /const vesselPick = createVesselPick\(/);
  assert.match(fn, /if \(!x\.vis \|\| x\.noHit\) continue;/);
  assert.match(fn, /rank = pickTier\(x\) \* GL_ROWS \+ x\.row/, 'drawn on top = the GPU\'s tier, then its row');
  assert.doesNotMatch(fn, /getElementsByClassName|getAttribute\('d'\)|--hit-w|chainMat|closest\('\.vg/);
});
