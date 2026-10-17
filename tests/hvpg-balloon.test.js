import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonRy, balloonOutline, routeRadii, BALLOON_MARGIN } from '../src/ui/hvpg-balloon.js';

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

test('the balloon follows the vein as it widens and narrows, frame by frame', () => {
  // A route along one vein: source points every 10 units, resampled every 1; the vein's caliber eases over time.
  const src = Array.from({ length: 11 }, (_, i) => ['RHV', i / 10]), map = [], pts = [];
  for (let d = 0; d <= 100; d++) { const j = Math.min(10, Math.floor(d / 10) + 1); map.push(j, (d - (j - 1) * 10) / 10); pts.push(d); }
  const rad = [];
  let prev = null;
  for (let frame = 0; frame <= 60; frame++) {
    const r0 = 10 + 4 * Math.sin(frame / 6);   // the vein breathing between 6 and 14
    routeRadii(src, map, (id, f) => r0 * (1 - 0.1 * f), rad);
    const at = (d) => { const i = Math.max(0, Math.min(100, Math.round(d))); return { p: [d, 0], t: [1, 0], w: [d, 0], r: rad[i] }; };
    const ry = balloonRy(at, 50, 16, 1e9);
    // It hugs the walls: at least as tall as the narrowest lumen it covers allows, never past the lumen at its middle.
    const narrowest = Math.min(...rad.slice(34, 67));
    assert.ok(ry <= rad[50] * BALLOON_MARGIN + 1e-9, `frame ${frame}`);
    assert.ok(ry >= narrowest * BALLOON_MARGIN * 0.97, `frame ${frame}`);
    assert.ok(inside(at, 50, 16, ry), `frame ${frame}`);
    if (prev) assert.ok(Math.sign(ry - prev.ry) === Math.sign(r0 - prev.r0) || Math.abs(r0 - prev.r0) < 1e-9, `frame ${frame}: the balloon moves with the vein`);
    prev = { ry, r0 };
  }
});

// A catheter running off the vein's centre (its course is smoothed through the bends), at a slant to the vein.
const offCentre = (base, dy, slope) => (d) => { const q = base(d); return { ...q, p: [q.w[0], q.w[1] + dy + slope * (d - 50)], t: [1 / Math.hypot(1, slope), slope / Math.hypot(1, slope)] }; };

test('a wedged balloon fills the vein wall to wall, on its centreline and along its direction', () => {
  for (const [name, at] of [['straight', straight((d) => 12 - 0.05 * (d - 30))], ['bending', arc(70, () => 10)], ['off-centre', offCentre(straight(() => 10), 2.5, 0.08)]]) {
    const dC = 50, rx = 16, ol = balloonOutline(at, dC, rx, 3, 1);
    for (const o of ol) {
      const q = at(dC + rx * o.s);
      // On the vein's own centre, across its direction (the side normal is perpendicular to the vein).
      assert.ok(Math.hypot(o.c[0] - q.w[0], o.c[1] - q.w[1]) < 1e-9, `${name}: centred at s=${o.s}`);
      const a = at(dC + rx * o.s - 1.6), b = at(dC + rx * o.s + 1.6), vx = b.w[0] - a.w[0], vy = b.w[1] - a.w[1];
      assert.ok(Math.abs(o.t[0] * vy - o.t[1] * vx) / Math.hypot(vx, vy) < 1e-6, `${name}: follows the vein at s=${o.s}`);
      // Never past the wall, and touching it over the balloon's middle (no gap between latex and wall).
      assert.ok(o.h <= q.r + 1e-9, `${name}: inside at s=${o.s}`);
      if (Math.abs(o.s) <= 0.6) assert.ok(o.h >= q.r * 0.96, `${name}: hugs the wall at s=${o.s} (${o.h} of ${q.r})`);
    }
    // Rounded ends that close on the centreline.
    assert.equal(ol[0].h, 0); assert.equal(ol[ol.length - 1].h, 0);
    assert.ok(ol[0].s === -1 && ol[ol.length - 1].s === 1);
  }
});

test('a deflated balloon is the small ellipse on the catheter, and it grows to the walls without crossing them', () => {
  const at = offCentre(straight(() => 10), 2, 0.05), dC = 50, rx = 6, ry0 = 2;
  for (const o of balloonOutline(at, dC, rx, ry0, 0)) {
    const q = at(dC + rx * o.s);
    assert.ok(Math.hypot(o.c[0] - q.p[0], o.c[1] - q.p[1]) < 1e-9);
    assert.ok(Math.abs(o.h - ry0 * Math.sqrt(1 - o.s * o.s)) < 1e-9);
  }
  for (let k = 0; k <= 20; k++) {
    const bl = k / 20;
    for (const o of balloonOutline(at, dC, 16, ry0, bl)) {
      const q = at(dC + 16 * o.s), off = Math.hypot(o.c[0] - q.w[0], o.c[1] - q.w[1]);
      assert.ok(o.h + off <= q.r + 1e-9, `bl ${bl}: inside the lumen at s=${o.s}`);
    }
  }
});
