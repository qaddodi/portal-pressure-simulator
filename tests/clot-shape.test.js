// The drawn clot: lumpy, resting on one wall, growing smoothly with the occlusion, never wider than the lumen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashSeed, rng, clotSide, clotSpan, clotHalf, clotRadius, clotShift } from '../src/ui/clot-shape.js';

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

test('the stage draws the layered clot with tokens, not literal colours', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  for (const cls of ['thrombus-rim', "'thrombus'", 'thrombus-sheen', 'thrombus-speck', 'thrombus-channel']) assert.ok(stage.includes(cls), cls);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  for (const t of ['--thrombus-rim', '--thrombus-sheen', '--thrombus-speck']) { assert.ok(css.includes(`var(${t})`), t); assert.ok(tokens.includes(`${t}:`), t); }
});
