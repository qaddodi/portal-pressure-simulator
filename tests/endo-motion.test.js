// The scope's view eases between states (Mohammad, 17 Oct: "The endoscopy card could use some work in smoothing and
// transitions"): each redrawn field fades in over the last, the band cinches in after the vein deflates, and the balloon
// and bleeding jet fade in and out instead of cutting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FADE_MS, DEFLATE_MS, BAND_MS, BAND_DELAY_MS, fadeIn, glide } from '../src/ui/endo-motion.js';

test('a new field fades in smoothly, from nothing to full', () => {
  assert.equal(fadeIn(0), 0);
  assert.equal(fadeIn(FADE_MS), 1);
  let prev = 0;
  for (let t = 1; t <= FADE_MS; t += 1) { const a = fadeIn(t); assert.ok(a >= prev && a <= 1, `t ${t}`); assert.ok(a - prev < 0.02, `jump at ${t}`); prev = a; }
});

test('the balloon and the jet glide to on and off and land exactly', () => {
  for (const [from, to] of [[0, 1], [1, 0]]) {
    let v = from, steps = 0, prev = from;
    while (v !== to && steps < 1000) { v = glide(v, to, 1000 / 120); assert.ok(Math.abs(v - prev) < 0.1, 'no frame jumps more than a tenth'); prev = v; steps++; }
    assert.equal(v, to);
    assert.ok(steps > 20 && steps < 120, `settles in ${steps} frames at 120 Hz`);
  }
});

test('banding eases: the band follows the deflating vein, nothing snaps', () => {
  assert.ok(DEFLATE_MS >= 300 && BAND_MS >= 300 && BAND_DELAY_MS > 0);
  const src = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(src, /tween\(an\.kn\[i\], knT\[i\], now, BAND_MS/);
  assert.doesNotMatch(src, /tween\([^)]*, now, 1, 0\)/, 'no tween runs in 1 ms (a snap)');
  // The balloon and the jet are drawn at their easing strength, not on a bare on/off.
  assert.match(src, /if \(balA > 0\)/);
  assert.match(src, /if \(jetA > 0 && bleedLast\)/);
  // The bleed runs on the model's clock (still while paused) and its pool's level eases.
  assert.match(src, /t: still\.matches \? 0\.3 : simTime\(\)/);
  assert.match(src, /poolA = poolA \? glide\(poolA, poolT, du, 600\) : poolT;/);
  assert.doesNotMatch(src, /if \(f\.params\?\.balloonEso\) \{/);
  // Each new field bitmap keeps the one shown before it to fade from.
  assert.match(src, /if \(glKey\) keep\(glOut, res\)/);
});

test('scope bleed: drops thrown on each beat ease in and out, the pool rises with the blood lost and stays in the lumen', async () => {
  const { scopeDrops, scopePoolY, SCOPE_DROPS } = await import('../src/ui/endo-motion.js');
  let prev = null;
  for (let t = 0; t < 3; t += 0.002) {
    const d = scopeDrops(t, 90, 80);
    assert.equal(d.length, SCOPE_DROPS);
    if (prev) d.forEach((x, i) => assert.ok(Math.abs(x[3] - prev[i][3]) < 0.03, `drop ${i} at ${t.toFixed(3)} s`));
    prev = d;
  }
  // Thrown up and away from the tear, then falling back.
  const up = scopeDrops(0.3, 90, 80).filter((x) => x[3] > 0.3);
  assert.ok(up.some((x) => x[1] < 0), 'some drops above the tear');
  // An ooze throws them a shorter way than a spurt (how high above the tear they rise).
  const reach = (rate) => Math.max(...scopeDrops(0.3, rate, 80).map((x) => -x[1]));
  assert.ok(reach(15) < 0.6 * reach(120));
  // The pool: low at first, higher as it fills, never above the lumen's middle.
  assert.ok(scopePoolY(0, 100, 0.12) > scopePoolY(0, 100, 0.5) && scopePoolY(0, 100, 0.5) > scopePoolY(0, 100, 1));
  assert.ok(scopePoolY(0, 100, 1) >= 0 && scopePoolY(0, 100, 0) < 100);
});
