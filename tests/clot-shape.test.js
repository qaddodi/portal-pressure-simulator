import { stageSource } from './stage-src.js';
// The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashSeed, rng, clotSide, clotSpan, clotHalf, clotRadius, clotShift, clotLayers, CLOT_EDGE } from '../src/ui/clot-shape.js';
import { appCss } from './split-src.js';

const W = 10;

test('the same vessel always gets the same clot', () => {
  assert.equal(hashSeed('PV_TRUNK'), hashSeed('PV_TRUNK'));
  assert.notEqual(hashSeed('PV_TRUNK'), hashSeed('SV_CONF'));
  const a = rng(7), b = rng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(clotRadius(0.6, W, 0.4, 5), clotRadius(0.6, W, 0.4, 5));
  assert.ok([1, -1].includes(clotSide(hashSeed('RHV_IVC'))));
});

test('the clot rests on the wall and never fills more than the lumen', () => {
  for (const seed of [1, 2, 99, hashSeed('PV_TRUNK')]) {
    for (let v = 0.02; v <= 1.0001; v += 0.07) {
      for (let f = 0; f <= 1.0001; f += 0.1) {
        const r = clotRadius(v, W, f, seed);
        assert.ok(r > 0 && r <= W / 2 + 1e-9, `v=${v} f=${f} r=${r}`);
        // outer edge flush with the wall, never through it
        const edge = Math.abs(clotShift(W, r, 1)) + r;
        assert.ok(Math.abs(edge - W / 2) < 1e-9);
      }
    }
  }
});

test('full occlusion spans the lumen; partial leaves an open side', () => {
  assert.equal(clotHalf(1, W), W / 2);
  assert.ok(clotHalf(0.4, W) * 2 < W * 0.6);
  assert.ok(clotRadius(1, W, 0.5, 3) * 2 > W * 0.85, 'a full clot fills the middle of the lumen');
  assert.ok(clotRadius(0.4, W, 0.5, 3) * 2 < W * 0.7, 'a partial clot leaves a channel');
});

test('it thickens and lengthens as the occlusion rises, with no jumps', () => {
  let prevHalf = 0, prevLen = 0, prevR = 0;
  for (let v = 0.01; v <= 1.0001; v += 0.01) {
    const half = clotHalf(v, W), { u0, u1 } = clotSpan(v), r = clotRadius(v, W, 0.5, 11);
    assert.ok(half >= prevHalf && u1 - u0 >= prevLen);
    if (prevHalf) {
      assert.ok(half - prevHalf < 0.1, 'thickness eases');
      assert.ok(Math.abs(r - prevR) < 0.15, 'the mid radius eases');
    }
    prevHalf = half; prevLen = u1 - u0; prevR = r;
  }
});

test('the clot is soft layers of one red that fade at the edges, with a hairline on the free edge only', () => {
  assert.equal(clotLayers[0].k, 1, 'the outermost layer is the clot itself');
  for (let i = 1; i < clotLayers.length; i++) assert.ok(clotLayers[i].k < clotLayers[i - 1].k, 'each layer sits inside the last');
  assert.ok(CLOT_EDGE > 0.9 && CLOT_EDGE <= 1, 'the hairline hugs the outer edge');
  const stage = stageSource();
  for (const { cls } of clotLayers) assert.ok(/\.thrombus(-halo|-core)?\b/.test(`.${cls}`), cls);
  assert.ok(stage.includes("'thrombus-edge'"));
  // no cartoon marks: no pale rim, sheen, speckles or pink channel stroke beside the clot
  for (const cls of ['thrombus-rim', 'thrombus-sheen', 'thrombus-speck', 'thrombus-channel']) assert.ok(!stage.includes(cls), cls);
  // the hairline runs on the open side (away from the wall the clot rests on)
  const css = appCss();
  const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  for (const t of ['--thrombus', '--thrombus-edge']) assert.ok(tokens.includes(`${t}:`), t);
  assert.ok(!/--thrombus-(rim|sheen|speck|channel)/.test(css + tokens), 'old cartoon tokens are gone');
});

import { clotStretch } from '../src/ui/clot-shape.js';
test('a vein cut in pieces has one clot over its whole length: the stretch is a share of the vein, not of the piece that carries its name', () => {
  const line = (x0, x1, n) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), 0]), lit = (P) => P.map(() => [0, 1, 0]);
  const a = line(0, 40, 41), b = line(40, 100, 61);   // (two pieces sharing their joint at 40: a vein 100 long)
  const c = clotStretch([{ pts: a, lit: lit(a) }, { pts: b, lit: lit(b) }], 1);
  assert.equal(c.L, 100);
  assert.ok(Math.abs(c.pts[0][0] - 18) <= 1 && Math.abs(c.pts.at(-1)[0] - 82) <= 1, `the clot runs from ${c.pts[0][0]} to ${c.pts.at(-1)[0]}, 0.18 to 0.82 of the vein`);
  assert.equal(c.pts.length, c.lit.length);
  assert.ok(c.pts.some((p) => p[0] < 40) && c.pts.some((p) => p[0] > 40), 'it crosses the joint');
});
