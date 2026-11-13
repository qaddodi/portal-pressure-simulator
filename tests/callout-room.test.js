// The portal blood's share stands in the open (7 Nov 2026, Mohammad: "always in the way of other vessels and is not elegantly placed"):
// callout-room.js picks the nearest spot, on either side of its point, farther out and leaning, that covers no vessel, card, key or
// other callout, with a longer pointer that still reaches its point; a card with nothing in its way keeps its usual place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineIndex, indexHits } from '../src/ui/seg-hits.js';
import { placeCallout, roomBox, ROOM_BASE } from '../src/ui/callout-room.js';

// The slide-2 figure as the screen shows it (CSS px): the portal vein's point at (250, 265); the IVC straight down through it; the splenic vein
// running right from below it; the SMV, the hepatic branches and the gastric vein round it.
const LINES = [
  { id: 'ivc', pts: [[255, 0], [255, 520]], flat: 12, wall: 0 },
  { id: 'smv', pts: [[262, 285], [330, 420], [350, 560]], flat: 5, wall: 1 },
  { id: 'spl', pts: [[262, 285], [350, 322], [470, 300]], flat: 4, wall: 1 },
  { id: 'hep1', pts: [[240, 262], [180, 220], [120, 170]], flat: 3, wall: 1 },
  { id: 'hep2', pts: [[262, 262], [310, 215], [330, 150]], flat: 3, wall: 1 },
  { id: 'gas', pts: [[470, 300], [480, 150], [450, 20]], flat: 3, wall: 1 },
];
const W = 800, H = 640, BAND = { x0: 8, y0: 8, x1: W - 8, y1: H - 90 };
const index = (lines = LINES) => lineIndex(lines, (x, y) => [x, y], 1, 64, { segs: [], grid: new Map(), cell: 64, stamp: 0, pool: [] });
const within = (r, b) => r.x0 >= b.x0 && r.x1 <= b.x1 && r.y0 >= b.y0 && r.y1 <= b.y1;
const costOf = (idx, extra = () => 0) => (r, tail) => {
  if (!within(r, BAND)) return Infinity;
  const x = extra(r); if (x) return x;
  let v = 0; const n = indexHits(idx, r, 0);
  if (n) v += 120 + 14 * n; else { const m = indexHits(idx, r, 7); if (m) v += 30 + 4 * m; }
  if (tail) { const m = indexHits(idx, tail, 3); if (m) v += 24 + 4 * m; }
  return v;
};
const NODE = { nx: 250, ny: 265 }, CARD = { w: 217, h: 100 };

test('a card with nothing in its way keeps its usual place, under its point, the pointer straight', () => {
  const r = placeCallout({ ...NODE, ...CARD, below: true, cost: costOf(index([])) });
  assert.deepEqual([r.below, r.gap, r.ax], [true, ROOM_BASE, 0]);
});

test('it comes clear of every vessel round the portal vein, on the slide-2 figure', () => {
  const idx = index();
  const usual = { below: true, gap: ROOM_BASE, ax: 0 };
  assert.ok(indexHits(idx, roomBox(NODE.nx, NODE.ny, CARD.w, CARD.h, usual), 0) > 1, 'the usual place covers vessels');
  const r = placeCallout({ ...NODE, ...CARD, below: true, cost: costOf(idx) });
  assert.ok(Number.isFinite(r.cost));
  const box = roomBox(NODE.nx, NODE.ny, CARD.w, CARD.h, r);
  assert.equal(indexHits(idx, box, 0), 0, `covers no vessel: ${JSON.stringify(r)}`);
  assert.ok(within(box, BAND));
  // (its pointer still reaches the point: the card is on the point's side of the figure by the gap, and the tip is the point itself)
  assert.ok(r.below ? box.y0 - NODE.ny === r.gap : NODE.ny - box.y1 === r.gap);
});

test('the farther out it stands, the longer the pointer, and the lean never outruns the pointer', () => {
  for (const seed of [[250, 265], [400, 200], [120, 300], [600, 400]]) {
    const r = placeCallout({ nx: seed[0], ny: seed[1], ...CARD, below: seed[1] > 250, cost: costOf(index()) });
    if (!r) continue;
    const len = 11 + r.gap - ROOM_BASE, base = Math.max(28 - CARD.w / 2, Math.min(CARD.w / 2 - 28, r.ax));
    assert.ok(Math.abs(r.ax - base) <= 1.3 * len + 14 + 1e-6, `${seed}: lean ${r.ax} on a pointer ${len} long`);
  }
});

test('it stays off the key and other callouts, and a card that is still clear is kept, though a nearer spot has opened', () => {
  const idx = index();
  const other = { x0: 0, y0: 300, x1: 235, y1: 420 };   // (another callout where the best spot was)
  const free = placeCallout({ ...NODE, ...CARD, below: true, cost: costOf(idx) });
  const blockedCost = costOf(idx, (r) => (r.x0 < other.x1 && r.x1 > other.x0 && r.y0 < other.y1 && r.y1 > other.y0 ? Infinity : 0));
  const blocked = placeCallout({ ...NODE, ...CARD, below: true, cost: blockedCost });
  assert.ok(blocked, 'another spot is found');
  const b = roomBox(NODE.nx, NODE.ny, CARD.w, CARD.h, blocked);
  assert.ok(!(b.x0 < other.x1 && b.x1 > other.x0 && b.y0 < other.y1 && b.y1 > other.y0), 'not on the other callout');
  const near = { below: blocked.below, gap: blocked.gap, ax: blocked.ax + 3 };   // (a spot a hair from the best: still as clear, so it stays)
  const kept = placeCallout({ ...NODE, ...CARD, below: true, cost: blockedCost, keep: near });
  assert.deepEqual([kept.below, kept.gap, kept.ax], [near.below, near.gap, near.ax], 'a spot that is still clear stays');
  const moved = placeCallout({ ...NODE, ...CARD, below: true, cost: costOf(idx), keep: { below: true, gap: ROOM_BASE, ax: 0 } });
  assert.notDeepEqual([moved.gap, moved.ax], [ROOM_BASE, 0], 'a spot on the vessels is left');
  assert.ok(free.cost <= blocked.cost);
});

test('where nothing stands clear of what may never be covered, there is no place (the usual one is kept)', () => {
  assert.equal(placeCallout({ ...NODE, ...CARD, below: true, cost: () => Infinity }), null);
});
