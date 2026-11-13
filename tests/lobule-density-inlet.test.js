// Two lobule fixes of 13-14 Nov 2026 (Mohammad: "at the junction of where the lobule veins are crossing the arrows glitch" and "the lobule resolution is different than the anatomy").
//
// 1. Density: Settings › Figure size (the pixel budget, 1.5 MP on a Mac and an iPad, 0.5 MP on a phone) held for the anatomy's canvas only (stage-res.js figShare); the lobule and the
//    sinusoid were drawn at the screen's own density whatever it said, so the lobule came out sharper than the anatomy, and several times the pixels. All three now take their density
//    from the same budget (pixel-budget.js figureDensity).
// 2. Inlet venules: the two venules of neighbouring portal triads meet in the middle of the edge; each came in 7° off the edge, so the main vessel had a sharp V there, its chevrons
//    arriving from both sides at the point. Now both reach the middle flat along the edge: one smooth course.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inletPoint, inletBow, INLET_LEAN, INLET_MID } from '../src/ui/lobule-look.js';
import { figureDensity } from '../src/ui/pixel-budget.js';

test('the inlet venule bow: nothing at the triad, its old slope there, its old height at the middle, flat at the middle', () => {
  assert.equal(inletBow(0), 0);
  assert.ok(Math.abs(inletBow(1) - INLET_MID) < 1e-12);
  const h = 1e-6;
  assert.ok(Math.abs((inletBow(h) - inletBow(0)) / h - INLET_LEAN) < 1e-4, 'leaves the triad as before');
  assert.ok(Math.abs((inletBow(1) - inletBow(1 - h)) / h) < 1e-4, 'arrives flat');
  for (let i = 0; i <= 100; i++) { const b = inletBow(i / 100); assert.ok(b >= 0 && b < 0.7, `no wild bow at ${i / 100}: ${b}`); }
});

test('two inlet venules of neighbouring triads meet at one point with one direction (no kink)', () => {
  // Any hexagon edge, any bow: A and B the neighbouring corners, n the inward normal at the edge's middle.
  for (const [A, B, R] of [[[0, 0], [300, 0], 300], [[100, 40], [350, 470], 290], [[-80, 12], [-310, -140], 170]]) {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), nrm = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L], bow = 0.03 * R;
    const a = (u) => inletPoint(A, B, nrm, bow, u), b = (u) => inletPoint(B, A, nrm, bow, u);
    const ea = a(1), eb = b(1);
    assert.ok(Math.hypot(ea[0] - eb[0], ea[1] - eb[1]) < 1e-9, 'they meet');
    const h = 1e-6, ta = [(ea[0] - a(1 - h)[0]) / h, (ea[1] - a(1 - h)[1]) / h], tb = [(eb[0] - b(1 - h)[0]) / h, (eb[1] - b(1 - h)[1]) / h];
    // a arrives along +t and b along -t: their directions are opposite, to the degree.
    const cos = -(ta[0] * tb[0] + ta[1] * tb[1]) / (Math.hypot(...ta) * Math.hypot(...tb));
    assert.ok(Math.acos(Math.min(1, cos)) < 1e-3, `the join's kink is ${(Math.acos(Math.min(1, cos)) * 180 / Math.PI).toFixed(3)}°`);
  }
  // The old bow, for the record: a 14° V.
  const old = (A, B, n, bow, u) => [A[0] + (B[0] - A[0]) * 0.5 * u + n[0] * bow * Math.sin(0.8 * Math.PI * u), A[1] + (B[1] - A[1]) * 0.5 * u + n[1] * bow * Math.sin(0.8 * Math.PI * u)];
  const h = 1e-6, A = [0, 0], B = [300, 0], n = [0, 1], p = old(A, B, n, 9, 1), q = old(A, B, n, 9, 1 - h);
  assert.ok(Math.abs(Math.atan2(p[1] - q[1], p[0] - q[0])) > 0.1, 'the old course came in at a slope');
});

test('the lobule and the sinusoid are drawn at the density the anatomy\'s canvas is (Figure size)', () => {
  // The anatomy's rule, stage-res.js figShare: a share k of the screen's density, cut to the budget, never under a tenth.
  const anatomy = (base, k, w, h, capMP) => { const cap = capMP * 1e6, px = w * h * (base * k) ** 2; if (cap > 0 && px > cap) k *= Math.sqrt(cap / px); return base * Math.max(0.1, k); };
  for (const [w, h] of [[1366, 1024], [1440, 800], [390, 700], [3840, 2160]]) for (const base of [1, 2]) for (const k of [1, 0.75, 0.5, 0.25]) for (const cap of [0, 0.25, 0.5, 1, 1.5, 2, 8]) {
    const mine = figureDensity(base, k, w, h, cap), theirs = anatomy(base, k, w, h, cap);
    assert.ok(Math.abs(mine - theirs) < 1e-9, `${w}x${h} base ${base} k ${k} cap ${cap}: ${mine} vs ${theirs}`);
  }
  // An iPad at 2x, 1.5 MP: the lobule now holds 1.5 MP, not 5.6 MP.
  const d = figureDensity(2, 1, 1366, 1024, 1.5);
  assert.ok(1366 * 1024 * d * d <= 1.5e6 * 1.000001 && d < 1.1);
  assert.equal(figureDensity(2, 1, 1366, 1024, 0), 2, 'Full: the screen\'s own density');
});
