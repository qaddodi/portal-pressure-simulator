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

test('scope bleed: drops thrown on each beat ease in and out, the tear lies on a varix column, the pool is a wedge that widens with the blood lost', async () => {
  const { scopeDrops, scopeTear, scopePool, inScopePool, SCOPE_DROPS, SCOPE_TEAR_COLUMN } = await import('../src/ui/endo-motion.js');
  const { columnAngle, depthAt } = await import('../src/ui/endo-columns.js');
  let prev = null;
  for (let t = 0; t < 3; t += 0.002) {
    const d = scopeDrops(t, 90, 80);
    assert.equal(d.length, SCOPE_DROPS);
    if (prev) d.forEach((x, i) => assert.ok(Math.abs(x[3] - prev[i][3]) < 0.03, `drop ${i} at ${t.toFixed(3)} s`));
    prev = d;
  }
  // The tear is on the crest of one of the drawn columns (the same angle the field's shader gives it at that depth), in the upper
  // half of the view, so the blood runs down the wall to the pool and the tear is never under it.
  for (const g of [0.1, 0.5, 0.9]) {
    const tr = scopeTear(g);
    assert.ok(Math.abs(tr.th - columnAngle(SCOPE_TEAR_COLUMN, depthAt(Math.hypot(tr.x, tr.y)), g)) < 1e-9);
    assert.ok(tr.y < -0.2 && Math.hypot(tr.x, tr.y) < 0.7, `tear ${tr.x.toFixed(2)}, ${tr.y.toFixed(2)}`);
  }
  // The drops are thrown into the lumen (toward the axis) and fall: those just born move toward the centre.
  const tear = scopeTear(0.8);
  const born = scopeDrops(0.3, 120, 80, tear).filter((x) => x[3] > 0.1);
  assert.ok(born.length > 3 && born.some((x) => x[4] * -tear.x > 0), 'toward the centre');
  // An ooze throws them a shorter way than a spurt.
  const reach = (rate) => Math.max(...scopeDrops(0.3, rate, 80, tear).map((x) => Math.hypot(x[0], x[1])));
  assert.ok(reach(15) < 0.6 * reach(120));
  // The pool: a narrow wedge at first, wider as it fills, never past the lumen's middle; its edges leave the centre at phi and PI - phi.
  let last = Infinity;
  for (const f of [0, 0.12, 0.3, 0.6, 1]) { const { h, phi } = scopePool(f); assert.ok(phi < last && h > 0 && Math.abs(Math.sin(phi) - h) < 1e-9); last = phi; }
  assert.ok(scopePool(1).phi > 0.05 && scopePool(0).phi < 1.3);
  assert.ok(inScopePool(0, 0.5, 0.4) && !inScopePool(0, -0.5, 0.4) && !inScopePool(0.9, 0.1, 0.4), 'a point in the wedge, one above it, one beside it');
  // Seen end on, a flat surface's wedge holds the tear's drops only below it: the tear itself is out of reach of the pool.
  assert.ok(!inScopePool(tear.x, tear.y, scopePool(1).phi));
});
