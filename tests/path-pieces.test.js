// The organs' outlines read piece by piece (path-pieces.js): getPointAtLength along a whole path walks it from its start on every
// call, and the Doppler probe's first look at the organs (every 2 units along the colon's 608 pieces, the bowel's, the liver's)
// held the page for a second or two as a monitor first opened (Mohammad, 22 Oct). The points must be the ones the whole path gave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathPieces, piecesLength, pointsAlong } from '../src/ui/path-pieces.js';
import { ORGANS } from '../src/ui/anatomy.js';

// A curve measured as a browser would, closely enough for the walk: flattened into 400 chords.
function bez(c) {
  const n = c.match(/-?\d*\.?\d+(?:e-?\d+)?/gi).map(Number), [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  const pt = (u) => { const v = 1 - u; return [v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]; };
  const cum = [0], pts = [pt(0)];
  for (let i = 1; i <= 400; i++) { pts.push(pt(i / 400)); cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); }
  const at = (s) => { let i = 1; while (i < 400 && cum[i] < s) i++; const f = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; };
  return { len: cum[400], at, pts, cum };
}
// The same curve walked whole: every piece from the start, as the browser does (the reference the pieces must equal).
function wholeAt(d, s) {
  const pieces = pathPieces(d); let acc = 0;
  for (let k = 0; k < pieces.length; k++) {
    const q = pieces[k], m = q.c ? bez(q.c) : null, len = m ? m.len : q.len;
    if (q.move) continue;
    if (acc + len >= s || k === pieces.length - 1) { const u = Math.min(Math.max(s - acc, 0), len); return m ? m.at(u) : len > 0 ? [q.x0 + (q.x1 - q.x0) * u / len, q.y0 + (q.y1 - q.y0) * u / len] : [q.x1, q.y1]; }
    acc += len;
  }
  return null;
}

test('a path of absolute M, L, C and Z is cut into pieces that start where the last ended', () => {
  const p = pathPieces('M10 20 L 30 20 C 40 20 50 30 50 40 Z');
  assert.equal(p.length, 4);
  assert.deepEqual([p[0].move, p[0].x1, p[0].y1], [true, 10, 20]);
  assert.equal(p[1].len, 20);
  assert.equal(p[2].c, 'M 30 20 C 40 20 50 30 50 40');
  assert.deepEqual([p[3].x0, p[3].y0, p[3].x1, p[3].y1], [50, 40, 10, 20]);
});

test('pairs after a move are lines, and lower-case z closes', () => {
  const p = pathPieces('M0 0 10 0 10 10z');
  assert.deepEqual(p.map((q) => q.len), [0, 10, 10, Math.hypot(10, 10)]);
});

test('anything else is left to the old way (null)', () => {
  for (const d of ['m0 0 l 10 0', 'M0 0 Q 5 5 10 0', 'M0 0 A 5 5 0 0 1 10 0', 'M0 0 S 5 5 10 0', 'M0 0 H 10', '', 'L 1 2', 'M0 0 C 1 2 3']) assert.equal(pathPieces(d), null, d);
});

test('points along the pieces are the points along the whole path, for every organ outline', () => {
  for (const o of ORGANS) {
    const d = typeof o.ring === 'string' ? o.ring : o.d;
    if (!d || o.circle) continue;
    const pieces = pathPieces(d);
    assert.ok(pieces, o.id);
    const L = piecesLength(pieces, (q) => bez(q.c));
    const n = Math.max(48, Math.ceil(L / 2)), ls = Array.from({ length: n + 1 }, (_, i) => (i * L) / n);
    const got = pointsAlong(pieces, ls);
    for (const i of [0, 1, n >> 2, n >> 1, (3 * n) >> 2, n - 1, n]) {
      const want = wholeAt(d, ls[i]);
      assert.ok(Math.hypot(got[i][0] - want[0], got[i][1] - want[1]) < 1e-6, `${o.id} point ${i}`);
    }
  }
});

test('a jump to a new subpath holds no point of its own', () => {
  const p = pathPieces('M0 0 L 10 0 M 100 0 L 110 0');
  piecesLength(p, () => null);
  assert.deepEqual(pointsAlong(p, [0, 5, 10, 15, 20]), [[0, 0], [5, 0], [10, 0], [105, 0], [110, 0]]);
});

test('stage.js reads the outlines through the pieces, kept by path, and the Doppler drawer builds its pipeline ahead', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /const loc = olLocal\(d \|\| RING_OF\[id\] \|\| organEls\[id\]\.getAttribute\('d'\), stride\);/);
  assert.match(stage, /const pieces = pathPieces\(src\);/);
  assert.match(stage, /if \(olLocalMemo\.size >= 48\) olLocalMemo\.delete/);
  const gl = readFileSync(new URL('../src/ui/doppler-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /gl\.viewport\(0, 0, 1, 1\); gl\.useProgram\(prog\);/);
});
