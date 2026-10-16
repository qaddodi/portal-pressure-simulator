import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIN_PERFUSION, sinStrandRadius, sinGlowIn } from '../src/ui/sin-perfusion.js';

// Review G15 (16 Oct): the sinusoids' strands are drawn 60 % fainter and taper to a quarter of the sinusoid's width, over
// a soft glow in their own colour (0.18, reaching 30), so the lobe tips read as tissue, not netting bulbs.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('the numbers the review asked for', () => {
  assert.deepEqual(SIN_PERFUSION, { fade: 0.4, taper: 0.25, glow: 0.18, reach: 30 });
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

test('the strands are faded, flagged and given their glow; only the sinusoids', () => {
  assert.match(stage, /const sinStrand = kind === 's' && SIN_EDGES\.has\(id\);/);
  assert.match(stage, /if \(sinStrand\) alpha \*= SIN_PERFUSION\.fade;/);
  assert.match(stage, /\(sinGlow > 0 && alpha > 0 \? F_PERF : 0\)/);
  assert.match(stage, /if \(sinGlow > 0 && alpha > 0\) tubeData\[o \+ 51\] = SIN_PERFUSION\.glow \* sinGlow \* sinAlpha;/);
  assert.match(stage, /if \(kind === 's' && SIN_EDGES\.has\(x\.e\.id\)\) \{ const w = x\.width; return \[`\$\{r\.toFixed\(2\)\}\|\$\{w\.toFixed\(2\)\}\|sin`, \(i\) => sinStrandRadius\(r, w, i \/ \(N_SAMPLES - 1\), o\.span\)\]; \}/);
  // The strands' cells reach as far as their glow, so it is never cut off square at a cell's edge.
  assert.match(stage, /it\.kind === 's' && SIN_EDGES\.has\(it\.x\.e\.id\) \? it\.obj\.glMaxR \+ \(it\.x\.wallPx \|\| 1\) \+ SIN_PERFUSION\.reach \+ 4 : 0/);
});

test('the shader draws the glow on the congestion glow path, from flags it already reads', () => {
  assert.match(vg, /F_VEIL = 128, F_PERF = 256;/);
  // No extra texel read per vessel per pixel: the reach comes from the flags read with the dotted test.
  assert.match(vg, /int fl = int\(T\(id, 2\)\.z \+ 0\.5\); dotted = \(fl & \$\{F_DOTTED\}\) != 0; rv = \(fl & \$\{F_PERF\}\) != 0 \? pReach : reach;/);
  assert.match(vg, /if \(cur >= 0 && min\(bd, bs\) < rv\)/);
  // Under the network, with the congestion glow, in the strand's own colour; it marks the pixel as reached by a lumen
  // colour so a colour-only redraw redraws it.
  assert.match(vg, /if \(gv > 0\.0\) dep = true;\n\s*if \(gv > glow\.a\) glow = vec4\(scol\[s\] \* gv, gv\);/);
  assert.match(vg, /vec4 o = over\(accT, over\(accN \* netAlpha, over\(glow, accB\)\)\);/);
  // The early exit leaves the glow's pixels to be drawn.
  assert.match(vg, /& \$\{F_PERF\}\) != 0 && sd\[s\] < \$\{SIN_PERFUSION\.reach\.toFixed\(1\)\} \+ 0\.1\) lit = true;/);
});

test('no glow in Anatomy or by origin (one constant tint there); it eases with a lens change', () => {
  for (const m of ['neutral', 'origin', null]) assert.equal(sinGlowIn(m), 0, m);
  for (const m of ['pressure', 'delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'oxygen']) assert.equal(sinGlowIn(m), 1, m);
  assert.match(stage, /const sinGlow = sinStrand \? \(lensFrom \? lerp\(sinGlowIn\(lensPrev\), sinGlowIn\(mode\), easeInOut\(clamp\(\(now - lensT0\) \/ LENS_FADE, 0, 1\)\)\) : sinGlowIn\(mode\)\) : 0;/);
  assert.match(stage, /lensFrom = shownCol; lensT0 = performance\.now\(\); lensPrev = lensMode;/);
  // The strands stay faint and fine in every lens.
  assert.match(stage, /if \(sinStrand\) alpha \*= SIN_PERFUSION\.fade;/);
});
