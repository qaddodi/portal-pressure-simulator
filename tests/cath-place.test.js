import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineBox, placeSummary } from '../src/ui/cath-place.js';
import { balloonOutline } from '../src/ui/hvpg-balloon.js';

const overlaps = (p, bw, bh, r) => p.x < r.x1 && p.x + bw > r.x0 && p.y < r.y1 && p.y + bh > r.y0;

test('the balloon box holds every point of the inflated outline', () => {
  const at = (d) => ({ p: [d, 0.3 * d], t: [1 / Math.hypot(1, 0.3), 0.3 / Math.hypot(1, 0.3)], w: [d, 0.3 * d], r: 6 });
  const ol = balloonOutline(at, 50, 14, 3, 1), b = outlineBox(ol);
  for (const o of ol) for (const k of [1, -1]) {
    const x = o.c[0] - o.t[1] * o.h * k, y = o.c[1] + o.t[0] * o.h * k;
    assert.ok(x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9 && y >= b.y0 - 1e-9 && y <= b.y1 + 1e-9);
  }
  assert.equal(outlineBox([]), null);
});

// HVPG slide 5 on an upright iPhone (393 x 844): the ladder card over the top, the teaching card over the bottom,
// the tip and the wedged balloon in the narrow band between. Below the readings there is no room, so the box was
// pushed up onto the vein and the HVPG reading sat on the balloon.
test('on a phone the HVPG summary never covers the balloon, the tip or the point ahead', () => {
  const A = { tip: [232, 362], ahead: [88, 442] }, bw = 200, bh = 155, W = 393;
  const balloon = { x0: 240, y0: 345, x1: 282, y1: 372 };
  const keep = [balloon, ...Object.values(A).map(([x, y]) => ({ x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }))];
  const blockers = [{ x0: 4, y0: 4, x1: 389, y1: 145 }, { x0: 4, y0: 443, x1: 389, y1: 844 }];
  const p = placeSummary({ A, bw, bh, W, top: 151, lim: 447, gap: 64, blockers, keep });
  for (const r of keep) assert.ok(!overlaps(p, bw, bh, r), `covers ${JSON.stringify(r)} at ${JSON.stringify(p)}`);
  for (const r of blockers) assert.ok(!overlaps(p, bw, bh, r), `on a card at ${JSON.stringify(p)}`);
});

test('every phone, iPad and Mac size with the readings anywhere in the free band keeps the balloon clear when it can', () => {
  for (const [W, H, t, b] of [[375, 667, 120, 360], [393, 844, 145, 400], [430, 932, 150, 430], [820, 1180, 90, 420], [1180, 820, 80, 260], [1440, 900, 70, 200]]) {
    const top = t + 6, lim = H - b, gap = lim < 440 ? 40 : 64, bw = 200, bh = 150;
    const blockers = [{ x0: 0, y0: 0, x1: W, y1: t }, { x0: 0, y0: lim, x1: W, y1: H }];
    for (let ty = top + 10; ty < lim - 10; ty += 20) for (let tx = 60; tx < W - 60; tx += 40) {
      const A = { tip: [tx, ty], ahead: [tx - 60, ty + 30] };
      const balloon = { x0: tx + 6, y0: ty - 16, x1: tx + 50, y1: ty + 10 };
      const keep = [balloon, ...Object.values(A).map(([x, y]) => ({ x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }))];
      // Is there any clear spot at all? (A band too short for the box beside the vein has none.)
      let room = false;
      for (let y = top; y <= Math.max(top, lim - bh - 12) && !room; y += 8) for (let x = 28; x <= W - bw - 12 && !room; x += 8) room = ![...keep, ...blockers].some((r) => overlaps({ x, y }, bw, bh, { x0: r.x0 - 8, y0: r.y0 - 8, x1: r.x1 + 8, y1: r.y1 + 8 }));
      if (!room) continue;
      const p = placeSummary({ A, bw, bh, W, top, lim, gap, blockers, keep });
      assert.ok(!overlaps(p, bw, bh, balloon), `${W}x${H} tip ${tx},${ty}: covers the balloon at ${JSON.stringify(p)}`);
      assert.ok(!keep.slice(1).some((r) => overlaps(p, bw, bh, r)), `${W}x${H} tip ${tx},${ty}: covers a reading's point`);
    }
  }
});

test('with room above, it still sits above the readings, centred between them', () => {
  const A = { tip: [600, 500], ahead: [500, 540] }, bw = 200, bh = 150;
  const p = placeSummary({ A, bw, bh, W: 1440, top: 76, lim: 800, gap: 64, keep: [] });
  assert.equal(p.y, 500 - bh - 64);
  assert.equal(p.x, 550 - bw / 2);
});
