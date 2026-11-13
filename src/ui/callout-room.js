// Where a figure callout with a pointer stands when it should be in the open: the portal blood's share ("69% bypasses the liver"), which sat
// right under its point, over the vessels that leave the portal vein (Mohammad, 7 Nov 2026: "always in the way of other vessels and is not
// elegantly placed"). Plain numbers in and out, so it can be judged in node (tests/callout-room.test.js) and no frame makes anything for it.
//
// A candidate is a side of its point (the card below it, the pointer on the card's top edge; or above it), a gap (how far the card's edge
// stands from the point: 18 px is the usual, the pointer then 11 px long) and a lean `ax` (how far the pointer's tip, the point, is from the
// card's centre: the card stands that far the other way). A longer gap makes a longer pointer and a larger lean a slanted one, so the card
// can stand clear of the vessels round its point and still reach it. The cost is what the caller says the card covers (vessels, cards, the
// key, the other callouts: `cost(card, tail)`, Infinity for what may never be covered) plus a little for each px the pointer is longer,
// leans or turns to the other side, so the nearest clear spot wins and a card with nothing in its way stays where it was.

import { KEEP, PTR } from './callout-ptr.js';

export const ROOM_BASE = 18;   // (the usual gap between the card's edge and its point: app.css .cath-label[data-at])
const GAPS = [18, 24, 32, 42, 54, 68, 84, 100];
const LEANS = Array.from({ length: 27 }, (_, i) => i * 0.04);   // (× the card's width, both ways: 0 to 1.04, every 4 %)
const R = { x0: 0, y0: 0, x1: 0, y1: 0 }, TL = { x0: 0, y0: 0, x1: 0, y1: 0 };   // (kept: a candidate is one rectangle written in place)
const SLANT = 1.3;   // (a pointer leans at most this many px for each px of its length: steeper than that it is a flag, not a pointer)

/** The card of a candidate, written into R (and its pointer's box into TL). */
export function roomBox(nx, ny, w, h, c) {
  const cx = nx - c.ax;
  R.x0 = cx - w / 2; R.x1 = cx + w / 2;
  if (c.below) { R.y0 = ny + c.gap; R.y1 = R.y0 + h; TL.y0 = ny + 12; TL.y1 = R.y0; } else { R.y1 = ny - c.gap; R.y0 = R.y1 - h; TL.y0 = R.y1; TL.y1 = ny - 12; }
  const bx = cx + Math.max(KEEP - w / 2, Math.min(w / 2 - KEEP, c.ax));   // (where the pointer leaves the card)
  TL.x0 = Math.min(nx, bx) - PTR; TL.x1 = Math.max(nx, bx) + PTR;
  return R;
}

/** Whether a pointer this long can lean this far (and a gap that reaches its point: a card nearer than the usual is no candidate). */
export const roomLean = (w, c) => {
  const len = PTR + c.gap - ROOM_BASE, base = Math.max(KEEP - w / 2, Math.min(w / 2 - KEEP, c.ax));
  return Math.abs(c.ax - base) <= SLANT * len + 14;
};

/**
 * The best spot for a card w × h whose pointer must reach (nx, ny).
 * @param {object} q
 * @param {number} q.nx @param {number} q.ny the point, in stage px
 * @param {number} q.w @param {number} q.h the card's size
 * @param {boolean} q.below which side of its point it prefers
 * @param {(card: object, tail: object|null) => number} q.cost what standing there covers; Infinity: never
 * @param {{below: boolean, gap: number, ax: number}|null} [q.keep] where it stands now, kept while it is still nearly as good
 * @param {number} [q.hold] how much worse the standing spot may be than the best one and still be kept
 * @returns {{below: boolean, gap: number, ax: number, cost: number}|null} null where nothing stands clear of what may never be covered
 */
export function placeCallout(q) {
  const { nx, ny, w, h, cost } = q, c = { below: true, gap: 0, ax: 0 };
  const price = (b, g, a) => {
    c.below = b; c.gap = g; c.ax = a;
    if (!roomLean(w, c)) return Infinity;
    roomBox(nx, ny, w, h, c);
    const v = cost(R, g > ROOM_BASE + 8 ? TL : null);
    // (A little for how far from its usual place it stands: the pointer's length, its lean, the other side.)
    return v + (g - ROOM_BASE) * 0.8 + (Math.abs(a) / w) * 16 + (b === q.below ? 0 : 10);
  };
  let best = Infinity, bb = true, bg = ROOM_BASE, ba = 0;
  for (let si = 0; si < 2; si++) {
    const b = si === 0 ? q.below : !q.below;
    for (let gi = 0; gi < GAPS.length; gi++) {
      for (let li = 0; li < LEANS.length; li++) {
        for (let sg = 0; sg < (LEANS[li] ? 2 : 1); sg++) {
          const a = LEANS[li] * w * (sg ? -1 : 1), v = price(b, GAPS[gi], a);
          if (v < best) { best = v; bb = b; bg = GAPS[gi]; ba = a; }
        }
      }
    }
  }
  if (best === Infinity) return null;
  if (q.keep) {
    const k = price(q.keep.below, q.keep.gap, q.keep.ax);
    if (k <= best + (q.hold ?? 24)) return { below: q.keep.below, gap: q.keep.gap, ax: q.keep.ax, cost: k };
  }
  return { below: bb, gap: bg, ax: ba, cost: best };
}
