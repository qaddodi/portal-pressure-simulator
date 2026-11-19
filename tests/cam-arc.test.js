import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as camArc from '../src/ui/cam-arc.js';
import { lerpVT, viewGeom, geomView } from '../src/ui/cam-arc.js';

// The camera's one path is the straight one (Mohammad, 18 Nov 2026: "camera must zoom straight from any view to any view"; bible review STG-4, 19 Nov 2026):
// from one close-up to another far across the figure the view never pulls back over the figure and comes in again. Code only: the path is checked as numbers.
const vb = { w: 1000, h: 700, cx: 500, cy: 350 };
const view = (cx, cy, k) => geomView({ cx, cy, w: vb.w / k }, vb);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const sameVT = (a, b, eps) => near(a.k, b.k, eps) && near(a.x, b.x, eps) && near(a.y, b.y, eps);

test('a view and its geometry turn into each other', () => {
  const v = { k: 2.4, x: -310, y: 120 };
  assert.ok(sameVT(geomView(viewGeom(v, vb), vb), v));
});

test('there is no arc, no pull-back path and no blend left to take', () => {
  for (const name of ['camPath', 'CamPath', 'blendPaths', 'blendInto', 'viewsOverlap', 'ARC_STRETCH', 'ARC_RHO']) assert.equal(camArc[name], undefined, name);
});

test('a long move between two close-ups never pulls back: the zoom holds and the middle travels the straight line', () => {
  const a = view(200, 250, 3.2), b = view(800, 500, 3.2);   // (varices at the top left to the rectum at the bottom right)
  for (let i = 0; i <= 100; i++) assert.ok(near(lerpVT(a, b, i / 100).k, 3.2), 'the same zoom all the way: no waypoint wider than either end');
  assert.ok(sameVT(lerpVT(a, b, 0), a, 1e-9));
  assert.ok(sameVT(lerpVT(a, b, 1), b, 1e-9));
  let last = 0;
  const g0 = viewGeom(a, vb), g1 = viewGeom(b, vb), d = Math.hypot(g1.cx - g0.cx, g1.cy - g0.cy);
  for (let i = 0; i <= 100; i++) {
    const g = viewGeom(lerpVT(a, b, i / 100), vb), f = Math.hypot(g.cx - g0.cx, g.cy - g0.cy) / d;
    assert.ok(f >= last - 1e-9 && f <= 1 + 1e-9, 'forward, never back');
    assert.ok(Math.abs((g.cx - g0.cx) * (g1.cy - g0.cy) - (g.cy - g0.cy) * (g1.cx - g0.cx)) < 1e-6 * d * d, 'on the line between them');
    last = f;
  }
});

test('the zoom goes one way only between two framings that share nothing', () => {
  const a = view(100, 120, 4.2), b = view(900, 600, 2.1);
  const ks = Array.from({ length: 101 }, (_, i) => lerpVT(a, b, i / 100).k);
  for (let i = 1; i < ks.length; i++) assert.ok(ks[i] <= ks[i - 1] + 1e-9, 'in to out without a wobble');
  assert.ok(Math.min(...ks) >= 2.1 - 1e-9 && Math.max(...ks) <= 4.2 + 1e-9, 'never wider or closer than the two ends');
});
