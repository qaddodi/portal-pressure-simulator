import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abdomenOutline, cavityHalfWidths } from '../src/ui/anatomy.js';

// The GPU fills the ascites inside the peritoneal cavity from its half-width per row (cavityHalfWidths), where it once took a
// raster of the outline (abdomenOutline). Both must be the same shape: checked here against the outline itself, flattened
// independently and tested point by point (even-odd), at every bulge step.
const R = [284, 430, 856, 600], N = R[3] * 2 + 1;

function polygon(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number), pts = [[n[0], n[1]]];
  // M x y L x y C (3 points) C (3 points) L x y Z, as abdomenOutline writes it.
  const cmds = d.match(/[MLCZ]/g);
  let k = 2;
  for (const c of cmds.slice(1)) {
    if (c === 'L') { pts.push([n[k], n[k + 1]]); k += 2; }
    else if (c === 'C') {
      const [p0x, p0y] = pts[pts.length - 1], [a, b, cx, cy, ex, ey] = n.slice(k, k + 6);
      for (let i = 1; i <= 2000; i++) {
        const t = i / 2000, s = 1 - t;
        pts.push([s ** 3 * p0x + 3 * s * s * t * a + 3 * s * t * t * cx + t ** 3 * ex, s ** 3 * p0y + 3 * s * s * t * b + 3 * s * t * t * cy + t ** 3 * ey]);
      }
      k += 6;
    }
  }
  return pts;
}
// Where a row crosses the outline: a point is inside when an odd number of them lie to its right (even-odd).
const crossings = (pts, y) => {
  const xs = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y)) xs.push((xj - xi) * (y - yi) / (yj - yi) + xi);
  }
  return xs;
};
const inside = (xs, x) => xs.filter((c) => c > x).length % 2 === 1;
// The shader's reading: between the two nearest rows.
const halfWidthAt = (hw, y) => {
  const fy = (y - R[1]) / R[3] * (N - 1), r0 = Math.min(Math.floor(fy), N - 2);
  return hw[r0] + (hw[r0 + 1] - hw[r0]) * (fy - r0);
};

test('the half-widths draw the same cavity as the outline, at every bulge', () => {
  for (let b = 0; b <= 34; b += 0.5) {
    const hw = cavityHalfWidths(b, R[1], R[3], N), pts = polygon(abdomenOutline(b));
    assert.equal(hw.length, N);
    for (let y = R[1] + 0.3; y < R[1] + R[3]; y += 3.7) {
      const h = halfWidthAt(hw, y), xs = crossings(pts, y);
      for (let x = R[0] + 0.2; x < R[0] + R[2]; x += 5.3) {
        const m = h - Math.abs(x - 712);
        if (Math.abs(m) < 0.75) continue;   // within the edge's soft band
        assert.equal(m > 0, inside(xs, x), `bulge ${b}: (${x.toFixed(1)}, ${y.toFixed(1)}) half-width ${h.toFixed(2)}`);
      }
    }
  }
});

test('the floor closes at its lowest point and the rows past it lie outside', () => {
  for (const b of [0, 17, 34]) {
    const hw = cavityHalfWidths(b, R[1], R[3], N);
    assert.ok(Math.abs(halfWidthAt(hw, 997.5)) < 0.5, `bulge ${b}: ${halfWidthAt(hw, 997.5)}`);
    for (let y = 998; y < R[1] + R[3]; y += 1) assert.ok(halfWidthAt(hw, y) < 0, `bulge ${b} at y ${y}`);
    for (let y = R[1]; y < 439.5; y += 1) assert.ok(halfWidthAt(hw, y) < 0, `bulge ${b} above the top at y ${y}`);
    assert.ok(hw.every(Number.isFinite));
  }
});
