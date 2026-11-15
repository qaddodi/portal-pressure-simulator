// One easing family and one duration scale (combined plan M2): the camera's quintic, the arrivals' bezier, the same in CSS, and
// camera times from how far a glide goes on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { easeMove, easeArrive, easeOut3, cubicBezier, camMs, CAM_MS_MIN, CAM_MS_MAX } from '../src/ui/ease.js';
import * as motion from '../src/ui/motion.js';

const quad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

test('easeMove is the quintic smoothstep: ends exact, symmetric, monotonic, with no jump in acceleration at the midpoint', () => {
  assert.equal(easeMove(0), 0); assert.equal(easeMove(1), 1); assert.equal(easeMove(-1), 0); assert.equal(easeMove(2), 1);
  assert.ok(Math.abs(easeMove(0.5) - 0.5) < 1e-12);
  let last = 0;
  for (let t = 0; t <= 1; t += 0.001) { const v = easeMove(t); assert.ok(v >= last - 1e-12); assert.ok(Math.abs(v + easeMove(1 - t) - 1) < 1e-9); last = v; }
  const acc = (f, t, h = 1e-4) => (f(t + h) - 2 * f(t) + f(t - h)) / (h * h);
  // The quadratic's acceleration flips from +4 to −4 at the midpoint; the quintic's passes through 0 there.
  assert.ok(Math.abs(acc(quad, 0.5 - 2e-3) - acc(quad, 0.5 + 2e-3)) > 7);
  assert.ok(Math.abs(acc(easeMove, 0.5 - 2e-3) - acc(easeMove, 0.5 + 2e-3)) < 0.5);
  // Speed and acceleration start and end at rest.
  assert.ok(easeMove(0.01) < 1e-5 && 1 - easeMove(0.99) < 1e-5);
});

test('the CSS tokens are the same curves: --ease-move within 0.9 % of the quintic, --ease-arrive the bezier --ease has always been', () => {
  const mv = cubicBezier(0.5, 0, 0.5, 1);
  for (let t = 0; t <= 1; t += 0.01) assert.ok(Math.abs(mv(t) - easeMove(t)) < 0.009, `${t}`);
  // easeArrive: the bezier itself (the curve's own points), decelerating to rest.
  for (const s of [0.1, 0.3, 0.6, 0.9]) {
    const x = 3 * s * (1 - s) ** 2 * 0.2 + 3 * s * s * (1 - s) * 0.2 + s ** 3, y = 3 * s * (1 - s) ** 2 * 0.8 + 3 * s * s * (1 - s) + s ** 3;
    assert.ok(Math.abs(easeArrive(x) - y) < 1e-6, `${s}`);
  }
  assert.equal(easeArrive(0), 0); assert.equal(easeArrive(1), 1);
  assert.ok(easeArrive(0.5) > 0.85 && 1 - easeArrive(0.98) < 0.001);
});

test('camMs: 480 ms up to half a screen, then in proportion, at most 900 ms', () => {
  const W = 1000, at = { k: 1, x: 0, y: 0 };
  assert.equal(camMs(at, at, W), CAM_MS_MIN);
  assert.equal(camMs(at, { k: 1, x: 300, y: 300 }, W), CAM_MS_MIN);
  assert.equal(camMs(at, { k: 1, x: 500, y: 0 }, W), 480);
  assert.equal(camMs(at, { k: 1, x: 750, y: 0 }, W), 720);
  assert.equal(camMs(at, { k: 1, x: 3000, y: 0 }, W), CAM_MS_MAX);
  // A doubling of the zoom counts as half a screen; zooming in and out alike.
  assert.equal(camMs(at, { k: 2, x: 0, y: 0 }, W), 480);
  assert.equal(camMs(at, { k: 3, x: 0, y: 0 }, W), camMs({ k: 3, x: 0, y: 0 }, at, W));
  assert.equal(camMs(at, { k: 4, x: 0, y: 0 }, W), 900);
  let last = 0;
  for (let x = 0; x <= 1500; x += 10) { const m = camMs(at, { k: 1, x, y: 0 }, W); assert.ok(m >= last); last = m; }
});


test('easeOut3 is the ease-out cubic the moves always ran: 1 - (1 - u) ** 3 exactly, quick off the mark, at rest at the end (motion.js the same)', () => {
  for (let i = 0; i <= 1000; i++) { const u = i / 1000; assert.equal(easeOut3(u), 1 - (1 - u) ** 3, `${u}`); }
  assert.equal(easeOut3(0), 0); assert.equal(easeOut3(1), 1);
  let last = -1;
  for (let u = 0; u <= 1; u += 0.001) { const v = easeOut3(u); assert.ok(v >= last); last = v; }
  const slope = (f, u, h = 1e-6) => (f(u + h) - f(u - h)) / (2 * h);
  assert.ok(Math.abs(slope(easeOut3, 1e-3) - 3) < 0.01 && Math.abs(slope(easeOut3, 1 - 1e-3)) < 1e-4);
  assert.equal(motion.easeOut3, easeOut3);
  assert.equal(motion.easeArrive, easeArrive);
});
