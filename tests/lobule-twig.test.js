import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twigPath, twigRadius, MERGE_ANGLE } from '../src/ui/lobule-mouths.js';
import { captureLobule } from '../scripts/lobule-joins.mjs';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';

// The arteriole's twig into the first stretch of a sinusoid (16 Nov 2026, Mohammad: "should be more elegant"): it was a straight stick from the arteriole to a round end on the
// sinusoid's wall. It is now a curve that leaves the arteriole toward the lobule and arrives running with the sinusoid's flow at MERGE_ANGLE, tapered from the arteriole to its thread,
// and slips in under the sinusoid (the sinusoid's wall, drawn over it, ends it).

test('twigPath: starts at the arteriole, ends at the sinusoid, arrives at MERGE_ANGLE to the sinusoid\'s direction from the arteriole\'s side', () => {
  const A = [0, 0], q = [100, 10], tq = [1, 0], c = [50, 80], f = twigPath(A, q, tq, c);
  assert.deepEqual(f(0), A);
  assert.ok(Math.hypot(f(1)[0] - q[0], f(1)[1] - q[1]) < 1e-9);
  const e = 1e-4, a = f(1 - e), b = f(1), d = [b[0] - a[0], b[1] - a[1]], ang = Math.atan2(Math.abs(d[1]), d[0]);
  assert.ok(Math.abs(ang - MERGE_ANGLE) < 0.01, `arrives at ${ang.toFixed(3)} rad`);
  assert.ok(d[1] > 0, 'toward the sinusoid\'s centre from the side the arteriole is on (A is below it: +y here is toward it)');
  const g = twigPath([0, 20], q, tq, c), h = [g(1)[0] - g(1 - e)[0], g(1)[1] - g(1 - e)[1]];
  assert.ok(h[1] < 0, 'from the other side, the other way');
  assert.ok(f(0.5).every(Number.isFinite));
});

test('twigPath: never a straight stick (a bow of a few per cent of its length) and never a loop', () => {
  const A = [0, 0], q = [300, 30], f = twigPath(A, q, [1, 0], [150, 200]);
  let maxOff = 0, prev = -Infinity;
  for (let i = 0; i <= 50; i++) {
    const p = f(i / 50), off = Math.abs(p[1] * 300 - p[0] * 30) / Math.hypot(300, 30);
    maxOff = Math.max(maxOff, off);
    assert.ok(p[0] >= prev - 1e-9, 'x never turns back'); prev = p[0];
  }
  assert.ok(maxOff > 6, `bows ${maxOff.toFixed(1)} off the chord of 300`);
});

test('twigRadius: wide at the arteriole, its thread after, opening a little at the sinusoid; never under the thread', () => {
  const base = 0.8, r0 = 1.4, rEnd = 1.1;
  assert.equal(twigRadius(base, r0, rEnd, 0), r0 + 0);
  assert.ok(Math.abs(twigRadius(base, r0, rEnd, 0.6) - base) < 0.05, 'the thread in the middle');
  assert.ok(Math.abs(twigRadius(base, r0, rEnd, 1) - rEnd) < 1e-9);
  for (let u = 0; u <= 1; u += 0.05) assert.ok(twigRadius(base, r0, rEnd, u) >= base - 1e-9);
  assert.equal(twigRadius(base, 0.2, 0.2, 0.5), base, 'a share smaller than the thread: the thread');
});

const cap = await captureLobule({});
const FL = 52, T = (r, k) => cap.up.tube[r * FL + k], rad = (r, i) => cap.up.rad[(r * N_SAMPLES + i) * 4];
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rows = [...cap.tubes.keys()];
test('the lobule: each triad\'s twig lies under the sinusoids (z 0.08 < 0.1), starts at its arteriole\'s centre, and is tapered from there to its thread', () => {
  const tw = rows.filter((r) => Math.abs(T(r, 9) - 0.08) < 1e-6), ha = rows.filter((r) => Math.abs(T(r, 9) - 0.7) < 1e-6 && (T(r, 10) & 512) !== 0);
  assert.equal(tw.length, 6);
  assert.equal(ha.length, 6);
  const sin = rows.find((r) => Math.abs(T(r, 9) - 0.1) < 1e-6);
  assert.ok(T(tw[0], 9) < T(sin, 9), 'under a sinusoid');
  for (const r of tw) {
    const p0 = cap.tubes[r].pts[0], best = Math.min(...ha.map((h) => near(p0, [(cap.tubes[h].pts[0][0] + cap.tubes[h].pts.at(-1)[0]) / 2, (cap.tubes[h].pts[0][1] + cap.tubes[h].pts.at(-1)[1]) / 2])));
    assert.ok(best < 1, `leaves an arteriole's centre (${best.toFixed(2)} away)`);
    assert.ok(rad(r, 0) > rad(r, 32) * 1.2, `wider at the arteriole (${rad(r, 0).toFixed(2)}) than mid-way (${rad(r, 32).toFixed(2)})`);
    assert.ok(rad(r, 63) > rad(r, 32), 'opening again toward the sinusoid');
  }
});
