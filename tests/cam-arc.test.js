import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerpVT, viewGeom, geomView, viewsOverlap, camPath, blendPaths, ARC_STRETCH } from '../src/ui/cam-arc.js';

// Long camera moves pull back and come in (deck-authoring camera recs, item B, 29 Oct): from one close-up to another far across
// the figure the presenter's glide no longer pans across at full zoom. Code only: the path is checked as numbers.
const vb = { w: 1000, h: 700, cx: 500, cy: 350 };
const view = (cx, cy, k) => geomView({ cx, cy, w: vb.w / k }, vb);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const sameVT = (a, b, eps) => near(a.k, b.k, eps) && near(a.x, b.x, eps) && near(a.y, b.y, eps);

test('a view and its geometry turn into each other', () => {
  const v = { k: 2.4, x: -310, y: 120 };
  assert.ok(sameVT(geomView(viewGeom(v, vb), vb), v));
});

test('a short move (the two views overlap) is the plain even glide, exactly as before', () => {
  const a = view(300, 300, 3.2), b = view(420, 330, 2.5);
  assert.ok(viewsOverlap(a, b, vb));
  const p = camPath(a, b, vb, 1000);
  assert.equal(p.arc, false);
  assert.equal(p.stretch, 1);
  for (const u of [0, 0.2, 0.5, 0.9]) assert.ok(sameVT(p.at(u), lerpVT(a, b, u)));
  assert.deepEqual(p.at(1), b);
});

test('a long move between two close-ups pulls back, then comes in, and lands exactly', () => {
  const a = view(200, 250, 3.2), b = view(800, 500, 3.2);   // (varices at the top left to the rectum at the bottom right)
  assert.ok(!viewsOverlap(a, b, vb));
  const p = camPath(a, b, vb, 1000);
  assert.equal(p.arc, true);
  assert.ok(p.stretch >= 1 && p.stretch <= ARC_STRETCH, 'a little longer for the distance, never more than the most');
  assert.ok(sameVT(p.at(0), a, 1e-9));
  assert.deepEqual(p.at(1), b);
  const ks = Array.from({ length: 101 }, (_, i) => p.at(i / 100).k);
  const lo = Math.min(...ks), mid = ks.indexOf(lo);
  assert.ok(lo < 3.2 * 0.7, 'it pulls back well out from the close-up');
  assert.ok(mid > 20 && mid < 80, 'widest around the middle');
  for (let i = 1; i <= mid; i++) assert.ok(ks[i] <= ks[i - 1] + 1e-9, 'out without a wobble');
  for (let i = mid + 1; i < ks.length; i++) assert.ok(ks[i] >= ks[i - 1] - 1e-9, 'then in without a wobble');
  // (The centre travels in a straight line from one framing to the other, never back.)
  let last = 0;
  const g0 = viewGeom(a, vb), g1 = viewGeom(b, vb), d = Math.hypot(g1.cx - g0.cx, g1.cy - g0.cy);
  for (let i = 0; i <= 100; i++) {
    const g = viewGeom(p.at(i / 100), vb), f = Math.hypot(g.cx - g0.cx, g.cy - g0.cy) / d;
    assert.ok(f >= last - 1e-9 && f <= 1 + 1e-9);
    assert.ok(Math.abs((g.cx - g0.cx) * (g1.cy - g0.cy) - (g.cy - g0.cy) * (g1.cx - g0.cx)) < 1e-6 * d * d, 'on the line between them');
    last = f;
  }
  // (Each frame moves a little: no step is a jump.)
  for (let i = 1; i <= 200; i++) {
    const u = viewGeom(p.at((i - 1) / 200), vb), v = viewGeom(p.at(i / 200), vb);
    assert.ok(Math.hypot(v.cx - u.cx, v.cy - u.cy) < d / 40 && Math.abs(Math.log(v.w / u.w)) < 0.08);
  }
});

test('the arc never pulls back wider than the whole figure\'s fit', () => {
  const a = view(50, 60, 3.2), b = view(950, 640, 3.2), wFit = 1000;
  const p = camPath(a, b, vb, wFit);
  assert.equal(p.arc, true);
  for (let i = 0; i <= 200; i++) assert.ok(viewGeom(p.at(i / 200), vb).w <= wFit * 1.001);
  // (With room, it is the full van Wijk pull-back, which goes wider than that cap here.)
  const free = camPath(a, b, vb, Infinity);
  assert.ok(Math.max(...Array.from({ length: 101 }, (_, i) => viewGeom(free.at(i / 100), vb).w)) > wFit);
});

test('a refit while an arc runs bends it to the new framing without a jump, and lands on the new framing', () => {
  const a = view(200, 250, 3.2), b = view(800, 500, 3.2), b2 = view(815, 490, 3.0);
  const p = camPath(a, b, vb, 1000), q = camPath(a, b2, vb, 1000), uR = 0.45;
  const f = blendPaths(p.at, q.at, uR, vb);
  assert.ok(sameVT(f(uR), p.at(uR), 1e-9), 'the same view at the moment of the refit');
  assert.ok(sameVT(f(uR + 1e-4), p.at(uR + 1e-4), 1e-4));
  assert.deepEqual(f(1), b2);
});

test('the presenter\'s framings take the arc; other camera moves keep the plain glide', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /function frameBox\([\s\S]{0,400}animateVT\(to, ms, \{ arc: true, steady: !!opt\.steady, scale: !opt\.steady \}\)/);
  assert.equal((stage.match(/\{ arc: true[,} ]/g) || []).length, 1, 'only frameBox asks for it');
  assert.match(stage, /opt\.arc && !reduceMotion\.matches/, 'reduced motion keeps the short plain glide');
});
