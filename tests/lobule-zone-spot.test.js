import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneSpot } from '../src/ui/lobule-zone-spot.js';

const none = () => 0;
const W = 82, H = 30, HX = 6, HY = 4;
const boxAt = (x, y) => ({ l: x - W / 2 - HX, r: x + W / 2 + HX, t: y - H / 2 - HY, b: y + H / 2 + HY });

test('a zone name takes its first spot when nothing is placed', () => {
  assert.equal(zoneSpot([100, 300], [100, 100], 2, W, H, HX, HY, none, [], 0), 0);
});

test('a zone name never takes a spot on a zone name already placed (the phone garble)', () => {
  // zone 1 stands at (153, 512); zone 2's candidates are the same spot, then one further along
  const placed = [boxAt(153.5, 512)];
  assert.equal(zoneSpot([159, 159, 159], [512, 512, 700], 3, 72, H, HX, HY, none, placed, 1), 2);
});

test('with no clear spot the name is left out (-1), never drawn over another', () => {
  const placed = [boxAt(153.5, 512)];
  assert.equal(zoneSpot([159], [512], 1, 72, H, HX, HY, none, placed, 1), -1);
});

test('names that merely touch (no shared area) both stand', () => {
  const placed = [boxAt(100, 100)];
  const b = placed[0];
  assert.equal(zoneSpot([b.r + W / 2 + HX], [100], 1, W, H, HX, HY, none, placed, 1), 0);
});

test('only the first nPlaced boxes count (the layout buffer is longer than what is placed)', () => {
  const placed = [boxAt(500, 500), boxAt(153.5, 512)];
  assert.equal(zoneSpot([153.5], [512], 1, W, H, HX, HY, none, placed, 1), 0);
});

test('the lesion ring still rules a spot out', () => {
  const ring = (b) => (b.l < 150 ? 5 : 0);
  assert.equal(zoneSpot([100, 400], [100, 100], 2, W, H, HX, HY, ring, [], 0), 1);
});
