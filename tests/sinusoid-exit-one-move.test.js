// Zooming out of the sinusoid lands on the lobule's framing in one move (17 Oct, Mohammad: "it zooms out then it pans to
// where it should"). The dock and the top bar come back a frame after the zoom starts, which moves the framing: the zoom is
// aimed afresh at it then, instead of landing on the old framing and refitting with a pan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the space that opens as the sinusoid closes re-aims the zoom out, instead of a refit after it lands', () => {
  // (Why the framing moves: the sinusoid view hides the dock, which every screen's framing keeps clear of.)
  assert.match(css, /#app\.sin-focus :is\([^)]*#vdock[^)]*\) \{ display: none !important; \}/);
  assert.match(lz, /function refit\(\) \{ if \(geo && reaimOut\(\)\) return;/, 'refit re-aims a zoom out under way first');
  const body = lz.match(/function reaimOut\(\) \{([\s\S]*?)\n {2}\}/)[1];
  assert.match(body, /if \(sinTo !== 0 \|\| sinU <= 0 \|\| !sinDive \|\| rubber\) return false;/, 'only on the way out');
  assert.match(body, /if \(atFit\) Object\.assign\(V, F0\); else clampV\(\);/, 'the lobule takes its new framing now');
  assert.match(body, /sinDive = diveGeometry\(sinDive\);/, 'the zoom keeps its sinusoid end');
  assert.match(body, /diveDrawn = false; refitLater = false;/, 'drawn once at the new framing, with nothing left to refit on landing');
  assert.match(lz, /F = keep \? \{ x: keep\.c\[0\], y: keep\.c\[1\], ang: keep\.ang, k: keep\.k, lumen: keep\.lumen \} : sv\.frame\(\)/);
});

// The zoom is the similarity M (lobule's sinusoid p to the view's centre c, turned by rot, grown by Z), taken g of the way about
// its fixed point q. At its start (g = 1) the screen is the sinusoid view whatever the lobule's framing, so re-aiming there is unseen.
test('at the start of the zoom out the re-aimed and the old zoom draw the same picture', () => {
  const frame = { c: [200, 400], ang: 0.3, lumen: 80 }, w0 = [10, -4], th = -0.9, r = 1.5;
  const zoomAt = (V, w, g) => {
    const p = [V.k * w0[0] + V.x, V.k * w0[1] + V.y], s = [V.k * w[0] + V.x, V.k * w[1] + V.y];
    const rot = frame.ang - th, Z = frame.lumen / (2 * r * V.k), m = Z * Math.cos(rot), n = Z * Math.sin(rot);
    const bx = frame.c[0] - (m * p[0] - n * p[1]), by = frame.c[1] - (n * p[0] + m * p[1]);
    const a = 1 - m, b = n, det = a * a + b * b, q = [(a * bx - b * by) / det, (b * bx + a * by) / det];
    const zg = Z ** g, rg = rot * g, d = [s[0] - q[0], s[1] - q[1]];
    return [q[0] + zg * (Math.cos(rg) * d[0] - Math.sin(rg) * d[1]), q[1] + zg * (Math.sin(rg) * d[0] + Math.cos(rg) * d[1])];
  };
  const before = { k: 1.1, x: 40, y: 90 }, after = { k: 0.95, x: 52, y: 60 };
  for (const w of [[0, 0], [30, 12], [-25, 40]]) {
    const A = zoomAt(before, w, 1), B = zoomAt(after, w, 1);
    assert.ok(Math.hypot(A[0] - B[0], A[1] - B[1]) < 1e-6);
    const A0 = zoomAt(after, w, 0);
    assert.ok(Math.hypot(A0[0] - (after.k * w[0] + after.x), A0[1] - (after.k * w[1] + after.y)) < 1e-6, 'and it lands on the new framing');
  }
});
