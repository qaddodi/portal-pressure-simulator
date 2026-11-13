// The stitches of a surgical join and the wound tie (suture-marks.js, S1 of the 13 Nov 2026 suture mocks): pure geometry, so judged by numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { N_STITCH, distToLine, runningStitch, seamAt, seamTable, woundTie } from '../src/ui/suture-marks.js';

// A host vein along y = 100 (radius 10) and a shunt arriving from above at 55 degrees, its end on the host's centre line.
const host = [[0, 100], [100, 100], [200, 100]];
const R = 5, dir = [Math.cos((55 * Math.PI) / 180), Math.sin((55 * Math.PI) / 180)];   // the shunt runs down and to the right
const end = [100, 100];
// frame at arc length d from the shunt's far start (60 long): the end is at d = L
const L = 60, frame = (d) => { const k = d - L; return { x: end[0] + dir[0] * k, y: end[1] + dir[1] * k, nx: -dir[1], ny: dir[0] }; };
const pt = (sl, a) => { const q = frame(L - sl); return [q.x + q.nx * R * a, q.y + q.ny * R * a]; };
const du = (x, y) => 10 - distToLine(host, x, y);

test('distToLine is the distance to the nearest stretch', () => {
  assert.equal(distToLine(host, 50, 90), 10);
  assert.equal(distToLine(host, -3, 104), Math.hypot(3, 4));
});

test('the seam is where the host wall crosses the shunt, a slanted curve that follows it', () => {
  const tab = seamTable(pt, du, 40);
  assert.ok(tab, 'a seam is found when the end lies inside the host');
  // each seam point sits on the host wall (within the 0.75 step) and the two sides differ: the join is slanted
  for (const a of [-0.8, 0, 0.8]) { const p = pt(seamAt(tab, a), a); assert.ok(Math.abs(du(p[0], p[1])) < 1.2, `seam at ${a} on the wall`); }
  assert.ok(Math.abs(seamAt(tab, -0.9) - seamAt(tab, 0.9)) > 2, 'slanted, not square to the shunt');
});

test('no host, no seam', () => {
  assert.equal(seamTable(pt, () => -5, 40), null);
});

test('a running stitch: every number finite, the near half and the far half both drawn, seam and ridge across the shunt', () => {
  const tab = seamTable(pt, du, 40), j = runningStitch(pt, tab, 2);
  for (const k of ['seam', 'ridge', 'back', 'front']) { assert.ok(j[k].length > 0, k); assert.ok(!/NaN|Infinity/.test(j[k]), `${k} finite`); }
  const front = (j.front.match(/M/g) || []).length, back = (j.back.match(/M/g) || []).length;
  assert.ok(front >= 5 && back >= 5 && front + back <= N_STITCH, `${front} near, ${back} far of ${N_STITCH}`);
});

test('a wound tie: five turns near and far, a knot and two tails', () => {
  const fr = (d) => ({ x: d, y: 50, nx: 0, ny: 1 }), w = woundTie(fr, 20, 6, 1.9);
  assert.equal((w.front.match(/M/g) || []).length, 5);
  assert.equal((w.back.match(/M/g) || []).length, 5);
  assert.equal((w.tails.match(/M/g) || []).length, 2);
  assert.ok(Number.isFinite(w.knot.x) && Number.isFinite(w.knot.y));
  assert.ok(!/NaN|Infinity/.test(w.front + w.back + w.tails));
});

test('the stump narrows 20 % at its tie and is back to full caliber a few units either side', async () => {
  const { stumpPinch, stumpCentre, woundTie } = await import('../src/ui/suture-marks.js');
  assert.ok(Math.abs(stumpPinch(30, 30) - 0.8) < 1e-9);
  assert.ok(stumpPinch(30 + 16, 30) > 0.99 && stumpPinch(30 - 16, 30) > 0.99);
  assert.equal(stumpCentre(10, 400), 19);
  assert.equal(stumpCentre(10, 20), 16);   // (a short vein: the tie stays inside it)
  // the turns lie on the narrowed wall: a pinched tie's rings are closer to the vein's axis than an unpinched one's
  const fr = (d) => ({ x: d, y: 50, nx: 0, ny: 1 }), lat = (w) => Math.max(...(w.front.match(/-?[\d.]+ (-?[\d.]+)/g) || []).map((q) => Math.abs(Number(q.split(' ')[1]) - 50)));
  assert.ok(lat(woundTie(fr, 20, 6, 1.9, 5, 1)) < lat(woundTie(fr, 20, 6, 1.9, 5, 0)));
});

test('the tails stay inside the vein: no tie shape reaches past its radius', () => {
  const fr = (d) => ({ x: d, y: 50, nx: 0, ny: 1 }), R = 6, w = woundTie(fr, 20, R, 1.9);
  for (const k of ['front', 'back', 'tails']) for (const q of w[k].match(/-?[\d.]+ -?[\d.]+/g)) assert.ok(Math.abs(Number(q.split(' ')[1]) - 50) <= R, `${k} within the radius`);
});
