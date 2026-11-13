// The periportal plexus of a cavernous transformation (C8) is braided round the occluded portal trunk, on both sides of it, and its channels
// leave and join the confluence and the hilum tangent to the main channel (13 Nov 2026, Mohammad: "collaterals used to grow all around the portal
// vein, not just to the top" and "they shouldn't be torn from the bottom"). The strands are checked on the numbers the stage draws them from: the
// braid (stage-paths.js) of the main channel's samples, against the portal trunk's own course.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH, STRANDS, STRAND_HOLD, STRAND_SOFT } from '../src/ui/anatomy.js';
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
const { braid, wiggle } = createPaths({ N_SAMPLES: N, scratchG: null });
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
// (As the stage draws them, with the serpentine at its widest: stage-frame.js strandAt.)
const drawn = STRANDS.C8.map(([off, ph]) => wiggle(braid(base, off, 0, null, ph, true), 9, ph, STRAND_HOLD));
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

const clear = (S) => side(mid(S)) * mainSide;   // (past the main channel: +, the other side of the portal vein: -)

test('the plexus is braided round the portal vein: as many channels on each side of it, counting the main channel, close to it and clear of its wall', () => {
  const at = strands.map(clear), far = at.filter((d) => d < 0).length, near = at.filter((d) => d > 0).length + 1;   // (+1: the main channel, on the near side)
  assert.equal(far, near, `channels on the far side ${far}, on the near side ${near} (${at.map((d) => d.toFixed(0))})`);
  for (const d of at) assert.ok(Math.abs(d) >= 10 && Math.abs(d) <= 49, `a strand lies ${d.toFixed(1)} from the portal vein's axis (on its wall, or off in the liver)`);
  const sp = (a) => a.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
  assert.ok(Math.abs(sp(at.filter((d) => d < 0)) - sp(at.filter((d) => d > 0))) <= 14, `the two sides spread alike (${at.map((d) => d.toFixed(0))})`);
  assert.ok(Math.abs(side(mid(base)) * mainSide) <= 26, 'the main channel stays near the portal vein');
});

test('the first two channels to grow in lie on opposite sides of the portal vein', () => {
  assert.notEqual(Math.sign(side(mid(strands[0]))), Math.sign(side(mid(strands[1]))));
});

test('every strand leaves the confluence and joins the hilum as the main channel does, then parts from it without a kink or a fold', () => {
  for (const [k, S] of drawn.entries()) {
    // (The serpentine too is held off for the first and last tenth: every end at the node points where the channel's does, so their joins are one.)
    for (const i of [0, 1, 2, 3, 4, N - 5, N - 4, N - 3, N - 2, N - 1]) {
      const gap = Math.hypot(S[i][0] - base[i][0], S[i][1] - base[i][1]);
      assert.ok(gap < 2.5, `strand ${k} is ${gap.toFixed(1)} units off the channel at sample ${i}`);
    }
    for (let i = 2; i < N; i++) {
      const ax = S[i - 1][0] - S[i - 2][0], ay = S[i - 1][1] - S[i - 2][1], bx = S[i][0] - S[i - 1][0], by = S[i][1] - S[i - 1][1];
      const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
      assert.ok(c > 0.9, `strand ${k} turns ${(Math.acos(c) * 180 / Math.PI).toFixed(0)} degrees at sample ${i}`);
    }
  }
});
