import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIN_PERFUSION, sinStrandRadius } from '../src/ui/sin-perfusion.js';

// Review G15 (16 Oct): the sinusoids' strands are drawn 60 % fainter and taper to a quarter of the sinusoid's width, so the
// lobe tips read as tissue, not netting bulbs. No glow behind them (Mohammad, 16 Oct: he did not like the constant glow).
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('the numbers the review asked for', () => {
  assert.deepEqual(SIN_PERFUSION, { fade: 0.4, taper: 0.25 });
});

test('a strand meets the sinusoid at its own caliber and narrows to a quarter of the sinusoid at mid-course', () => {
  const span = [0.1, 0.9], rk = 1.2, width = 6;
  assert.equal(sinStrandRadius(rk, width, 0, span), rk);
  assert.equal(sinStrandRadius(rk, width, 0.1, span), rk);
  assert.equal(sinStrandRadius(rk, width, 0.9, span), rk);
  assert.equal(sinStrandRadius(rk, width, 1, span), rk);
  assert.ok(Math.abs(sinStrandRadius(rk, width, 0.5, span) - 0.25 * width / 2) < 1e-9);
  // Smooth and never wider than its caliber or thinner than the mid-course radius: no step, no bump.
  let last = rk;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200, r = sinStrandRadius(rk, width, u, span);
    assert.ok(r <= rk + 1e-12 && r >= 0.75 - 1e-9);
    assert.ok(Math.abs(r - last) < 0.06, `no jump at u=${u}`);
    last = r;
  }
  // Never thicker than it was (a thin sinusoid), and never thinner than a hairline.
  assert.equal(sinStrandRadius(0.8, 8, 0.5, span), 0.8);
  assert.equal(sinStrandRadius(0.8, 1, 0.5, span), 0.4);
});

test('the strands are faded and tapered; only the sinusoids', () => {
  assert.match(stage, /const sinStrand = kind === 's' && SIN_EDGES\.has\(id\);/);
  assert.match(stage, /if \(sinStrand\) alpha \*= SIN_PERFUSION\.fade;/);
  assert.match(stage, /if \(kind === 's' && SIN_EDGES\.has\(x\.e\.id\)\) \{ const w = x\.width; return \[`\$\{r\.toFixed\(2\)\}\|\$\{w\.toFixed\(2\)\}\|sin`, \(i\) => sinStrandRadius\(r, w, i \/ \(N_SAMPLES - 1\), o\.span\)\]; \}/);
});

test('no glow is drawn behind the strands in any view or lens', () => {
  assert.doesNotMatch(vg, /F_PERF|SIN_PERFUSION|sin-perfusion/);
  assert.doesNotMatch(stage, /F_PERF|tubeData\[o \+ 51\]|sinGlow/);
});
