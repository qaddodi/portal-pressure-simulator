import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxOutside, paintBox } from '../src/ui/plate-copy.js';

// The sharp picture of the view leaves out the shapes that paint nothing in it (stage.js plateBoxes, plateMarkup): a shape
// that touches the view must never be left out.

test('a painted box is outside a view only when it misses it entirely', () => {
  const r = [100, 50, 200, 100];   // x 100..300, y 50..150
  assert.equal(boxOutside([0, 0, 99, 200], r), true);
  assert.equal(boxOutside([0, 0, 100, 200], r), false, 'touching the edge counts as inside');
  assert.equal(boxOutside([301, 0, 400, 200], r), true);
  assert.equal(boxOutside([150, 151, 160, 160], r), true);
  assert.equal(boxOutside([150, 140, 160, 160], r), false);
  assert.equal(boxOutside([0, 0, 1000, 1000], r), false, 'a box around the view is inside');
});

test('the painted box holds every point the stroke can paint, through any transform', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 2000; n++) {
    const bb = { x: rnd() * 800, y: rnd() * 800, width: rnd() * 200, height: rnd() * 200 };
    const k = 0.5 + rnd() * 2, th = rnd() * Math.PI * 2;
    const m = { a: k * Math.cos(th), b: k * Math.sin(th), c: -k * Math.sin(th), d: k * Math.cos(th), e: rnd() * 300 - 150, f: rnd() * 300 - 150 };
    const sw = rnd() * 30, b = paintBox(bb, m, sw, 0);
    // A point on the outline, pushed out by up to a miter's reach (2 × the stroke width) in the shape's own units.
    for (let i = 0; i < 8; i++) {
      const u = rnd(), side = Math.floor(rnd() * 4), reach = 2 * sw * rnd();
      const ang = rnd() * Math.PI * 2;
      let x = side < 2 ? bb.x + u * bb.width : bb.x + (side === 2 ? 0 : bb.width), y = side < 2 ? bb.y + (side === 0 ? 0 : bb.height) : bb.y + u * bb.height;
      x += Math.cos(ang) * reach; y += Math.sin(ang) * reach;
      const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
      assert.ok(X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3], `point (${X}, ${Y}) outside ${b}`);
      assert.equal(boxOutside(b, [X - 0.01, Y - 0.01, 0.02, 0.02]), false);
    }
  }
});

const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
test('only the view picture is trimmed, the copy is put back whole, and shapes that could reach further are kept', () => {
  // (The whole plate, slot 0, from a fresh copy, a full-width strip at a time: each strip trimmed to its own rows, same scale.)
  assert.match(src, /const banded = slot === 1;\n\s+if \(!banded && fresh\) gpuProbe\.time\(null, 'organ picture: copy \(script\)', \(\) => \{ plateCopy = plateBuild\(plateStateKey\(\)\); \}\);/, 'the whole-plate picture (slot 0) is drawn from a fresh copy');
  assert.match(src, /plateMarkup\(\[rect\[0\], rect\[1\] \+ y \/ sy, rect\[2\], rows \/ sy\], W, rows, false, true, layer, unmask\)/, 'each slot-0 strip is the plate\'s full width and exactly its rows');
  assert.match(src, /const p = refineStep\('organ picture: draw', \(\) => drawn\(W, rows, \(pg\) => pg\.drawImage\(band, 0, 0, W, rows\)\)\);/);
  // (The view's picture, slot 1, a strip at a time: each piece of a strip it draws trimmed to its own pixels, same scale.)
  assert.match(src, /plateMarkup\(\[rect\[0\] \+ qx \/ sx, rect\[1\] \+ qy \/ sy, qw \/ sx, qh \/ sy\], qw, qh, false, true, layer, unmask\)/);
  assert.match(src, /const v = veins, sx = W \/ rect\[2\], sy = H \/ rect\[3\];/);
  assert.match(src, /finally \{\n\s+for \(let i = out0\.length - 1; i >= 0; i--\) \{ const \[c, p, n\] = out0\[i\]; p\.insertBefore\(c, n\); \}[^\n]*\n\s+for \(const \[k, a, v\] of unmasked\) k\.setAttribute\(a, v\);/);
  const pb = src.slice(src.indexOf('function plateBoxes('), src.indexOf('function plateMarkup('));
  for (const re of [/clipPath\|mask\|pattern\|marker\|symbol\|defs/, /getAttribute\?\.\('filter'\)/, /subs\.has\(c\) \|\| c\.id/, /objectBoundingBox/, /marker-end/]) assert.match(pb, re);
});
