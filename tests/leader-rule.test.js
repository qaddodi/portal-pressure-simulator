// The one leader rule (5 Nov 2026 review #7): every view decides a name's leader by needsLeader from the gap between the name's box and
// what it names (boxGap), on past 12 px and off below 8, a region's name never.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAD_OFF, LEAD_ON, boxGap, needsLeader } from '../src/ui/label-place.js';

const box = { x0: 100, y0: 50, x1: 160, y1: 70 };

test('the gap is measured from the box: 0 inside, the straight distance off a side, the corner distance off a corner', () => {
  assert.equal(boxGap(box, 130, 60), 0);
  assert.equal(boxGap(box, 90, 60), 10);
  assert.equal(boxGap(box, 130, 85), 15);
  assert.equal(boxGap(box, 97, 46), 5);
});

test('a leader comes on past LEAD_ON, stays down to LEAD_OFF, and never for a region', () => {
  const at = (dx) => boxGap(box, box.x1 + dx, 60);
  assert.equal(needsLeader(false, at(LEAD_ON), false), false);
  assert.equal(needsLeader(false, at(LEAD_ON + 0.5), false), true);
  assert.equal(needsLeader(false, at(LEAD_OFF + 1), true), true, 'kept while it had one');
  assert.equal(needsLeader(false, at(LEAD_OFF + 1), false), false, 'not made there');
  assert.equal(needsLeader(false, at(LEAD_OFF - 1), true), false);
  assert.equal(needsLeader(true, at(40), true), false, 'a region\'s name has none');
});
