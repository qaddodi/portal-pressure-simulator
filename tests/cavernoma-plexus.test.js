// The periportal plexus of a cavernous transformation (C8) is braided round the occluded portal trunk, on both sides of it, and its channels
// leave and join the confluence and the hilum tangent to the main channel (13 Nov 2026, Mohammad: "collaterals used to grow all around the portal
// vein, not just to the top" and "they shouldn't be torn from the bottom"). The strands are checked on the numbers the stage draws them from: the
// braid (stage-paths.js) of the main channel's samples, against the portal trunk's own course.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH, STRANDS, STRAND_SOFT } from '../src/ui/anatomy.js';
// (stage-paths.js reaches the page's helpers, which look for the browser's globals when they load.)
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { createPaths } = await import('../src/ui/stage-paths.js');

const N = 64;
const { braid } = createPaths({ N_SAMPLES: N, scratchG: null });
// 'M x y C x y x y x y' as N samples of the cubic.
function cubic(d) {
  const v = d.match(/-?[\d.]+/g).map(Number), [x0, y0, x1, y1, x2, y2, x3, y3] = v;
  return Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1), u = 1 - t;
    return [u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
  });
}
const base = cubic(EDGE_PATH.C8), pv = cubic(EDGE_PATH.PV_TRUNK);
const strands = STRANDS.C8.map(([off, ph]) => braid(base, off, 0, null, ph, STRAND_SOFT.has('C8')));
// Signed distance of a point from the portal trunk's course (+: the side the plexus's main channel bows to).
function side(p) {
  let best = Infinity, sg = 1;
  for (let i = 1; i < N; i++) {
    const a = pv[i - 1], b = pv[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(p[0] - qx, p[1] - qy);
    if (d < best) { best = d; sg = Math.sign(dx * (p[1] - qy) - dy * (p[0] - qx)) || 1; }
  }
  return sg * best;
}
const mid = (S) => S[N >> 1];
const mainSide = Math.sign(side(mid(base)));

test('the plexus lies on both sides of the portal vein, clear of its wall', () => {
  const at = strands.map((S) => side(mid(S)) * mainSide);
  const near = at.filter((d) => d > 0).length, far = at.filter((d) => d < 0).length;
  assert.ok(near >= 2 && far >= 2, `strands on the main channel's side ${near}, on the other side ${far} (${at.map((d) => d.toFixed(0))})`);
  for (const d of at) assert.ok(Math.abs(d) >= 10, `a strand lies ${d.toFixed(1)} from the portal vein's axis, on its wall`);
});

test('the first two channels to grow in lie on opposite sides of the portal vein', () => {
  assert.notEqual(Math.sign(side(mid(strands[0]))), Math.sign(side(mid(strands[1]))));
});

test('every strand leaves the confluence and joins the hilum tangent to the main channel, and none folds', () => {
  for (const [k, S] of strands.entries()) {
    for (const i of [1, 2, 3, N - 4, N - 3, N - 2]) {
      const gap = Math.hypot(S[i][0] - base[i][0], S[i][1] - base[i][1]);
      assert.ok(gap < 8, `strand ${k} is ${gap.toFixed(1)} units off the channel at sample ${i}`);
    }
    for (let i = 2; i < N; i++) {
      const ax = S[i - 1][0] - S[i - 2][0], ay = S[i - 1][1] - S[i - 2][1], bx = S[i][0] - S[i - 1][0], by = S[i][1] - S[i - 1][1];
      const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
      assert.ok(c > 0.9, `strand ${k} turns ${(Math.acos(c) * 180 / Math.PI).toFixed(0)} degrees at sample ${i}`);
    }
  }
});
