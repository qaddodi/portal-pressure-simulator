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

test('a kept (lit or named) zone is never left out: no spot clear of the ring takes the first one clear of the zone names', () => {
  const ring = () => 5;   // the ring shuts every spot
  assert.equal(zoneSpot([100, 400], [100, 100], 2, W, H, HX, HY, ring, [], 0, false), -1);
  assert.equal(zoneSpot([100, 400], [100, 100], 2, W, H, HX, HY, ring, [boxAt(100, 100)], 1, true), 1);
});

test('a kept zone with every spot taken keeps its usual spot rather than leaving', () => {
  assert.equal(zoneSpot([153.5], [512], 1, W, H, HX, HY, none, [boxAt(153.5, 512)], 1, true), 0);
});

test('the lit zone is placed first, so the unlit one gives way (the garble case)', () => {
  // zone 3 is lit and zone 1 is not; both want the one in-view spot. Placed in lit-first order:
  const placed = [];
  const lit = zoneSpot([153.5], [512], 1, W, H, HX, HY, none, placed, 0, true);
  placed.push(boxAt(153.5, 512));
  const unlit = zoneSpot([153.5], [512], 1, W, H, HX, HY, none, placed, 1, false);
  assert.equal(lit, 0);
  assert.equal(unlit, -1);
});
