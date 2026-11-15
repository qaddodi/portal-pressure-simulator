// Zooming out of the sinusoid lands on the lobule's framing in one move (17 Oct, Mohammad: "it zooms out then it pans to
// where it should"). The dock and the top bar come back a frame after the zoom starts, which moves the framing: the zoom is
// aimed afresh at it then, instead of landing on the old framing and refitting with a pan.
import { diveMapInto } from '../src/ui/dive-map.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss, lobuleSource } from './split-src.js';

const lz = lobuleSource();
const css = appCss();

test('the space that opens as the sinusoid closes re-aims the zoom out, instead of a refit after it lands', () => {
  // (Why the framing can move: the top bar or a card changing as the sinusoid closes. The dock no longer does: the sinusoid view
  // keeps it since 2 Nov, so no rule hides it there.)
  assert.doesNotMatch(css, /#app\.sin-focus #vdock[^{]*\{ display: none/);
  assert.match(lz, /function refit\(\) \{ if \(geo && reaimOut\(\)\) return;/, 'refit re-aims a zoom out under way first');
  const body = lz.match(/function reaimOut\(\) \{([\s\S]*?)\n {2}\}/)[1];
  assert.match(body, /if \(sinTo !== 0 \|\| sinU <= 0 \|\| !sinDive \|\| rubber\) return false;/, 'only on the way out');
  assert.match(body, /if \(atFit\) Object\.assign\(V, F0\); else clampV\(\);/, 'the lobule takes its new framing now');
  assert.match(body, /sinDive = diveGeometry\(sinDive\);/, 'the zoom keeps its sinusoid end');
  assert.match(body, /diveDrawn = false; refitLater = false;/, 'drawn once at the new framing, with nothing left to refit on landing');
  assert.match(lz, /if \(keep\) \{ Fx = keep\.c\[0\]; Fy = keep\.c\[1\]; Fang = keep\.ang; Fk = keep\.k; Flumen = keep\.lumen; \}/);
});

// The zoom is the similarity M (lobule's sinusoid p to the view's centre c, turned by rot, grown by Z), taken g of the way about p itself, p going
// straight to c (dive-map.js). At its start (g = 1) the screen is the sinusoid view whatever the lobule's framing, so re-aiming there is unseen.
test('at the start of the zoom out the re-aimed and the old zoom draw the same picture', () => {
  const frame = { c: [200, 400], ang: 0.3, lumen: 80 }, w0 = [10, -4], th = -0.9, r = 1.5;
  const zoomAt = (V, w, g) => {
    const p = [V.k * w0[0] + V.x, V.k * w0[1] + V.y], s = [V.k * w[0] + V.x, V.k * w[1] + V.y];
    const rot = frame.ang - th, Z = frame.lumen / (2 * r * V.k), M = diveMapInto(p, frame.c, rot, Z, g, {}), ct = Math.cos(M.rot), st = Math.sin(M.rot), d = [s[0] - M.ox, s[1] - M.oy];
    return [M.ox + M.tx + M.Z * (ct * d[0] - st * d[1]), M.oy + M.ty + M.Z * (st * d[0] + ct * d[1])];
  };
  const before = { k: 1.1, x: 40, y: 90 }, after = { k: 0.95, x: 52, y: 60 };
  for (const w of [[0, 0], [30, 12], [-25, 40]]) {
    const A = zoomAt(before, w, 1), B = zoomAt(after, w, 1);
    assert.ok(Math.hypot(A[0] - B[0], A[1] - B[1]) < 1e-6);
    const A0 = zoomAt(after, w, 0);
    assert.ok(Math.hypot(A0[0] - (after.k * w[0] + after.x), A0[1] - (after.k * w[1] + after.y)) < 1e-6, 'and it lands on the new framing');
  }
});
