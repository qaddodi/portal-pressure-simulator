// seg-hits.js leaderVesselHits: a Circuit reading's leader against the vessels (3 Nov 2026, "leaders crossing vessels").
import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderVesselHits, segSegDist, lineIndex } from '../src/ui/seg-hits.js';

// Two vertical vessels, 16 px wide (half width 8), at x = 100 and x = 200, and a horizontal one at y = 300.
const idx = lineIndex([
  { pts: [[100, 0], [100, 200]], flat: 8, id: 'A' },
  { pts: [[200, 0], [200, 200]], flat: 8, id: 'B' },
  { pts: [[0, 300], [300, 300]], flat: 8, id: 'C' },
], (x, y) => [x, y], 1);

test('segSegDist: zero for crossing segments, else the nearest approach', () => {
  assert.equal(segSegDist(0, 0, 10, 10, 0, 10, 10, 0), 0);
  assert.equal(segSegDist(0, 0, 10, 0, 0, 5, 10, 5), 5);
  assert.equal(segSegDist(0, 0, 10, 0, 13, 4, 20, 4), 5);
});

test('a leader that climbs off its own vessel and stops short of the next crosses nothing', () => {
  assert.equal(leaderVesselHits(idx, 100, 100, 150, 100), 0, 'starts on A, ends between A and B');
  assert.equal(leaderVesselHits(idx, 100, 100, 100 + 30, 100 - 20), 0);
});

test('a leader through another vessel counts it, and only it', () => {
  assert.equal(leaderVesselHits(idx, 100, 100, 260, 100), 1, 'starts on A, runs through B');
  assert.equal(leaderVesselHits(idx, 150, 100, 250, 100), 1, 'starts clear, through B');
  assert.equal(leaderVesselHits(idx, 150, 100, 150, 400), 1, 'down through C');
  assert.equal(leaderVesselHits(idx, 50, 100, 260, 100), 2, 'through A and B');
  assert.equal(leaderVesselHits(idx, 50, 100, 260, 100, 1, true), 1, 'any: stops at the first');
});

test('a leader ending just beside a vessel (within its half width) counts it; one that keeps its air does not', () => {
  assert.equal(leaderVesselHits(idx, 150, 100, 195, 100), 1, 'ends 5 px from B\'s middle');
  assert.equal(leaderVesselHits(idx, 150, 100, 185, 100), 0, 'ends 15 px from B\'s middle: 8 + 1 clear');
});

test('a leader that runs along its own vessel past its first few px counts it', () => {
  assert.equal(leaderVesselHits(idx, 100, 20, 100, 150), 1, 'exempt for its first 12 px only: the rest of the run is on the vessel');
  assert.equal(leaderVesselHits(idx, 100, 20, 100, 30), 0, 'a short leader that never leaves its own vessel starts on it: nothing else to cross');
});

test('a leader that leaves its own vessel at an angle may brush the rest of a bent vessel (it is its own)', () => {
  const bent = lineIndex([{ pts: [[100, 0], [100, 100], [160, 100]], flat: 8, id: 'D' }], (x, y) => [x, y], 1);
  assert.equal(leaderVesselHits(bent, 100, 60, 150, 90), 0, 'out of the vertical run, over the elbow\'s horizontal run');
  assert.equal(leaderVesselHits(bent, 100, 60, 170, 60), 0, 'across, past the elbow');
});
