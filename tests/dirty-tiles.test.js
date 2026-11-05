// Render-cost plan 3a/3c (5 Nov 2026): the glass re-blurs only where the pixels under it changed. The blood's frames are kept as tiles
// (dirty-tiles.js), not one union box, and blur-share's dirty path takes a list of boxes and more than one request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDirtyTiles, MAX_RECTS } from '../src/ui/dirty-tiles.js';
import { shareFor, sharePrep, sharePlan, shareKeep } from '../src/ui/blur-share.js';
import { blurBoxesInto } from '../src/ui/glass-gl.js';

const W = 2000, H = 1200;

test('two far-apart marks come back as two boxes, not their union', () => {
  const T = createDirtyTiles(16);
  T.begin(1, W, H);
  T.add(10, 1000, 60, 1050);      // bottom left
  T.add(1900, 1100, 1950, 1150);  // bottom right
  const out = [], pool = [];
  const n = T.rects(0, 1, out, pool);
  assert.equal(n, 2);
  for (const b of out) assert.ok(b.y >= 960, `box ${JSON.stringify(b)} stays near the bottom`);
  // Nothing reaches the top bar's strip (y < 80).
  assert.ok(out.every((b) => b.y > 80));
});

test('frames of a range are joined; nothing marked is 0; an unknown frame is -1', () => {
  const T = createDirtyTiles(16);
  T.begin(1, W, H); T.add(100, 100, 120, 120);
  T.begin(2, W, H); T.add(1500, 900, 1520, 920);
  const out = [], pool = [];
  assert.equal(T.rects(0, 2, out, pool), 2);
  T.begin(3, W, H);
  assert.equal(T.rects(2, 3, out, pool), 0);
  T.unknown(4);
  assert.equal(T.rects(2, 4, out, pool), -1);
  // (A range longer than the ring, or empty, is unknown.)
  assert.equal(T.rects(0, 40, out, pool), -1);
  assert.equal(T.rects(3, 3, out, pool), -1);
});

test('a canvas resized inside a range is unknown', () => {
  const T = createDirtyTiles(16);
  T.begin(1, W, H); T.add(0, 0, 10, 10);
  T.begin(2, W + 10, H); T.add(0, 0, 10, 10);
  assert.equal(T.rects(0, 2, [], []), -1);
});

test('a column of tiles is one box; a scattered field falls back to its bounding box', () => {
  const T = createDirtyTiles(16);
  T.begin(1, W, H);
  T.add(500, 0, 520, H);   // one vessel straight down
  const out = [], pool = [];
  assert.equal(T.rects(0, 1, out, pool), 1);
  assert.ok(out[0].h >= H - 1);
  T.begin(2, W, H);
  for (let y = 0; y < H; y += 80) for (let x = (y / 80) % 2 ? 40 : 0; x < W; x += 80) T.add(x, y, x + 2, y + 2);
  const m = T.rects(1, 2, out, pool);
  assert.ok(m >= 1 && m <= MAX_RECTS);
});

test('every marked pixel is inside a box handed back (nothing changed is ever missed)', () => {
  const T = createDirtyTiles(16);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const marks = [];
  for (let f = 1; f <= 5; f++) {
    T.begin(f, W, H);
    for (let i = 0; i < 12; i++) { const x = rnd() * W, y = rnd() * H, b = [x, y, x + 5 + rnd() * 40, y + 5 + rnd() * 40]; marks.push(b); T.add(...b); }
  }
  const out = [], pool = [];
  const n = T.rects(0, 5, out, pool);
  assert.ok(n > 0);
  for (const [x0, y0, x1, y1] of marks) {
    const cx = Math.min(x1, W) - 0.5, cy = Math.min(y1, H) - 0.5;
    for (const [px, py] of [[x0 + 0.5, y0 + 0.5], [cx, cy]]) {
      assert.ok(out.some((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h), `pixel ${px},${py} is covered`);
    }
  }
});

// ── blur-share with the tiles ──
const grid = { x: 0, y: 0, X0: 0, Y0: 0, X1: 2000, Y1: 1200, T: 16 };
const t = 8, bw = 250, bh = 150;   // (the copy's texels: 8 CSS px each)
const keep = (k) => (out, pool, boxes, ox, oy, tt, w, h) => blurBoxesInto(out, pool, boxes, ox, oy, tt, w, h, k);
const topBar = { x: 0, y: 0, w: 2000, h: 60 }, card = { x: 1500, y: 300, w: 400, h: 300 };

function prime(S, reqs) {
  for (const r of reqs) sharePrep(S, r);
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11));
  shareKeep(S); S.phase = 'draw';
  return p;
}

test('blood moving far from every glass blurs nothing again', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [topBar], v: 5, f: 13 });
  const far = [{ x: 100, y: 1000, w: 50, h: 50 }];
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => far, keep(23));
  assert.equal(p.same, true);
});

test('the one union box of two far marks used to reach the top bar; the tiles do not', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [topBar], v: 5, f: 13 });
  // Old: the union of a mark at the left middle and one at the bottom right.
  const union = { x: 0, y: 400, w: 2000, h: 800 };
  const old = sharePlan(S, grid, t, bw, bh, false, keep(11), () => union, keep(23));
  assert.equal(old.same, true, 'below the top bar anyway: same');
  // A union that spans from near the top to the bottom does reach it; its two tiles do not.
  const S2 = shareFor(new Map(), {}, 'k');
  prime(S2, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }]);
  sharePrep(S2, { id: 'a', boxes: [topBar], v: 5, f: 13 });
  const wide = { x: 0, y: 260, w: 2000, h: 900 };
  const before = sharePlan(S2, grid, t, bw, bh, false, keep(11), () => wide, keep(23));
  assert.equal(before.same, false);
  const S3 = shareFor(new Map(), {}, 'k');
  prime(S3, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }]);
  sharePrep(S3, { id: 'a', boxes: [topBar], v: 5, f: 13 });
  const tiles = [{ x: 0, y: 1100, w: 40, h: 40 }, { x: 1960, y: 1100, w: 40, h: 40 }];
  const after = sharePlan(S3, grid, t, bw, bh, false, keep(11), () => tiles, keep(23));
  assert.equal(after.same, true);
});

test('blood under one card blurs only near that card', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [topBar, card], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [topBar, card], v: 5, f: 13 });
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => [{ x: 1600, y: 400, w: 30, h: 30 }], keep(23));
  assert.equal(p.same, false);
  assert.ok(p.parts && p.parts.length >= 1);
  for (const r of p.parts) assert.ok(r[1] * t >= 100, 'nothing in the top bar is blurred again');
});

test('an empty list is nowhere; unknown (null) blurs all the parts', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [card], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [card], v: 5, f: 13 });
  assert.equal(sharePlan(S, grid, t, bw, bh, false, keep(11), () => [], keep(23)).same, true);
  const S2 = shareFor(new Map(), {}, 'k');
  prime(S2, [{ id: 'a', boxes: [card], v: 5, f: 10 }]);
  sharePrep(S2, { id: 'a', boxes: [card], v: 5, f: 13 });
  const p = sharePlan(S2, grid, t, bw, bh, false, keep(11), () => null, keep(23));
  assert.equal(p.same, false);
});

test('two requests of one look both get the dirty test (3c)', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }, { id: 'b', boxes: [card], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [topBar], v: 5, f: 13 });
  sharePrep(S, { id: 'b', boxes: [card], v: 5, f: 13 });
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => [{ x: 100, y: 1000, w: 30, h: 30 }], keep(23));
  assert.equal(p.same, true);
  // A request whose picture changed (v) keeps the full blur.
  const S2 = shareFor(new Map(), {}, 'k');
  prime(S2, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }, { id: 'b', boxes: [card], v: 5, f: 10 }]);
  sharePrep(S2, { id: 'a', boxes: [topBar], v: 5, f: 13 });
  sharePrep(S2, { id: 'b', boxes: [card], v: 6, f: 13 });
  assert.equal(sharePlan(S2, grid, t, bw, bh, false, keep(11), () => [], keep(23)).same, false);
});

// ── 3b: a picture drawn again in part carries where it drew ──
test('a new picture that drew only far from every glass blurs nothing again (picture rects)', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [topBar], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [topBar], v: 6, f: 10 });
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => [], keep(23), () => [{ x: 900, y: 1000, w: 60, h: 60 }]);
  assert.equal(p.same, true);
});

test('a new picture under a card blurs only near that card; blood and picture moves are joined', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [topBar, card], v: 5, f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [topBar, card], v: 7, f: 13 });
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => [{ x: 100, y: 1100, w: 10, h: 10 }], keep(23), () => [{ x: 1700, y: 450, w: 30, h: 30 }]);
  assert.equal(p.same, false);
  for (const r of p.parts) assert.ok(r[1] * t >= 100, 'nothing in the top bar is blurred again');
});

test('a picture whose region is unknown, or no picture rects at all, blurs everything as before', () => {
  for (const pic of [() => null, null]) {
    const S = shareFor(new Map(), {}, 'k');
    prime(S, [{ id: 'a', boxes: [card], v: 5, f: 10 }]);
    sharePrep(S, { id: 'a', boxes: [card], v: 6, f: 10 });
    const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => [], keep(23), pic);
    assert.equal(p.same, false);
  }
  // (A version that is not a number (the lobule's text key) is never taken on trust.)
  const S = shareFor(new Map(), {}, 'k');
  prime(S, [{ id: 'a', boxes: [card], v: '5.1', f: 10 }]);
  sharePrep(S, { id: 'a', boxes: [card], v: '5.2', f: 10 });
  assert.equal(sharePlan(S, grid, t, bw, bh, false, keep(11), () => [], keep(23), () => []).same, false);
});
