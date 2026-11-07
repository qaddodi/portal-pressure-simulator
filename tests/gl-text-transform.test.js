import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The GPU drawer's 2D context places words where the whole transform puts their anchor, scale included, as the 2D canvas does.
// It used to add only the transform's offset, so words in a model drawn larger or smaller than its viewBox (svg-gl.js scales
// the context by the viewBox's map) sat off their place: the Ascites dial's IAP, number, unit and word piled on the 12, and the
// SAAG quadrant chart lost its axis numbers and names (2 Nov 2026).
const js = readFileSync(new URL('../src/ui/trace-gl.js', import.meta.url), 'utf8');

test('fillText and strokeText place the anchor through the full transform (X, Y), and turn about that point', () => {
  assert.match(js, /const textAt = \(t, x, y, colour, sw\) => \{\s*const m = st\.m, ang = m \? Math\.atan2\(m\[1\], m\[0\]\) : 0, px = X\(x, y\), py = Y\(x, y\);/);
  // (R07: the size, spacing and outline follow the transform's scale only when the caller asks, ctx.textScale; tests/caption-text-policy.test.js.)
  assert.match(js, /G\.text\(t, px, py, k === 1 \? st\.font : scaledFont\(st\.font, k\), colour, align\(\), st\.textBaseline, st\.globalAlpha, sw \* k, ang \? TURN : null, st\.ls \* k\);/);
  assert.match(js, /fillText\(t, x, y\) \{ textAt\(/);
  assert.match(js, /strokeText\(t, x, y\) \{ textAt\(/);
  assert.doesNotMatch(js, /G\.text\(t, x \+ ox\(\), y \+ oy\(\)/, 'no word is placed by the offset alone');
});

test('a scaled, translated anchor lands where the 2D canvas puts it, and a pure turn is unchanged from before', () => {
  const X = (m, x, y) => m[0] * x + m[2] * y + m[4], Y = (m, x, y) => m[1] * x + m[3] * y + m[5];
  // the dial: viewBox -12 0 76 128 in a 131 px box (scale 1.72), the number at (42, 70)
  const s = 131 / 76, m = [s, 0, 0, s, 12 * s + 6, 6];
  assert.ok(Math.abs(X(m, 42, 70) - (6 + 54 * s)) < 1e-9 && Math.abs(Y(m, 42, 70) - (6 + 70 * s)) < 1e-9);
  // a turn with no scale: the old place (offset + point, turned about the offset) and the new (the point through the transform) agree
  const a = 0.7, c = Math.cos(a), si = Math.sin(a), r = [c, si, -si, c, 30, 40], x = 12, y = -5;
  const old = [30 + c * x - si * y, 40 + si * x + c * y];
  assert.ok(Math.abs(X(r, x, y) - old[0]) < 1e-9 && Math.abs(Y(r, x, y) - old[1]) < 1e-9);
});

// (The names drawn by the GPU, label-captions.js, set their capitals' letter spacing as the page does: after every character, the last too.)
test('letterSpacing is kept in the 2D context, added after each character and measured with the words', () => {
  assert.match(js, /set letterSpacing\(v\) \{ st\.ls = parseFloat\(v\) \|\| 0; \}/);
  assert.match(js, /const width = measure\(str, font\) \+ \(ls \? ls \* pointsIn\(str\) : 0\);/);
  assert.match(js, /cx \+= e\[0\] \* f\.px \+ ls;/);
});
