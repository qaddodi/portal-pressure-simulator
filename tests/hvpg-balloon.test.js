import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonRy, BALLOON_MARGIN } from '../src/ui/hvpg-balloon.js';

// A vein as a centreline with a lumen radius, sampled by length: at(d) as stage.js's route gives it.
const straight = (rOf) => (d) => ({ p: [d, 0], t: [1, 0], w: [d, 0], r: rOf(d) });
const arc = (R, rOf) => (d) => { const th = d / R; return { p: [R * Math.sin(th), R - R * Math.cos(th)], t: [Math.cos(th), Math.sin(th)], w: [R * Math.sin(th), R - R * Math.cos(th)], r: rOf(d) }; };

// Every point on the balloon's outline lies inside the lumen: its distance from the vein's centreline (nearest
// sample) is no more than the lumen's radius there.
function inside(at, dC, rx, ry, span = [dC - 3 * rx, dC + 3 * rx]) {
  const c = at(dC), nx = -c.t[1], ny = c.t[0];
  const line = Array.from({ length: 2001 }, (_, i) => at(span[0] + ((span[1] - span[0]) * i) / 2000));
  for (let k = 0; k < 180; k++) {
    const th = (k / 180) * 2 * Math.PI, x = c.p[0] + c.t[0] * rx * Math.cos(th) + nx * ry * Math.sin(th), y = c.p[1] + c.t[1] * rx * Math.cos(th) + ny * ry * Math.sin(th);
    let best = Infinity, r = 0;
    for (const q of line) { const d = Math.hypot(x - q.w[0], y - q.w[1]); if (d < best) { best = d; r = q.r; } }
    if (best > r + 1e-6) return false;
  }
  return true;
}

test('an inflated balloon in a straight vein stops just inside its walls', () => {
  const at = straight(() => 10), ry = balloonRy(at, 50, 16, 11.2);
  assert.ok(ry <= 10 * BALLOON_MARGIN + 1e-9);
  assert.ok(ry > 9);
  assert.ok(inside(at, 50, 16, ry));
});

test('a vein that narrows along the balloon holds it to its narrowest fit', () => {
  const at = straight((d) => 12 - 0.1 * (d - 30)), dC = 50, rx = 16, ry = balloonRy(at, dC, rx, 20);
  assert.ok(ry < at(dC).r * BALLOON_MARGIN);
  assert.ok(inside(at, dC, rx, ry));
});

test('a bending vein keeps the straight balloon between its walls', () => {
  for (const R of [40, 80, 160]) {
    const at = arc(R, () => 10), ry = balloonRy(at, 60, 16, 11.2);
    assert.ok(ry > 0, `R=${R}`);
    assert.ok(inside(at, 60, 16, ry), `R=${R}`);
  }
});

test('a deflated balloon keeps its own size, and never goes thinner than the shaft', () => {
  const at = straight(() => 10);
  assert.equal(balloonRy(at, 50, 5, 1.8), 1.8);
  assert.equal(balloonRy(straight(() => 1), 50, 16, 11.2, { floor: 1.5 }), 1.5);
});
