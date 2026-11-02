// Where the HVPG catheter's two readings (the free pressure at the tip, the wedged pressure ahead of it) stand round their points
// (pure, no DOM). Each reading is a pill with a pointer to its point, above the point (pointer down) or below it (pointer up), and
// may slide sideways while its pointer stays on the point. Both are placed together so neither sits on a card, the top sheet, the
// stage's edges or the other reading (his ask, 1 Nov 2026: "the callouts appear under the cards, the HVPG measuring too").
// A reading keeps its side and offset while they stay clear, so nothing moves without a reason; the caller eases any move.

export const PILL_GAP = 18;   // (the pointer's reach: the pill's near edge stands this far from its point, app.css .cath-label)

// The area two boxes share (the second grown by `pad` all round), the boxes as their four edges: nothing is built to ask.
const overlapOf = (ax0, ay0, ax1, ay1, bx0, by0, bx1, by1, pad) => Math.max(0, Math.min(ax1, bx1 + pad) - Math.max(ax0, bx0 - pad)) * Math.max(0, Math.min(ay1, by1 + pad) - Math.max(ay0, by0 - pad));

/** The pill's box for a point (x, y), its size (w, h), its side (above: true) and its sideways offset dx. */
export const pillBox = (x, y, w, h, above, dx = 0) => {
  const x0 = x + dx - w / 2, y0 = above ? y - PILL_GAP - h : y + PILL_GAP;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
};

// What the placement works in, kept between calls (it runs from the stage's frame): every side and offset a reading can take, per
// reading, as its box, what it covers (hit) and its cost. Two readings are placed together; a third is never looked at.
const SPAN = 8, PER = 2 * (1 + 2 * SPAN), NONE = [];   // (the offsets 0, then -s and +s for s = 1…SPAN, on each of two sides)
const OX0 = new Float64Array(2 * PER), OY0 = new Float64Array(2 * PER), OX1 = new Float64Array(2 * PER), OY1 = new Float64Array(2 * PER);
const OHIT = new Float64Array(2 * PER), OC = new Float64Array(2 * PER), ODX = new Float64Array(2 * PER);
const OAB = new Array(2 * PER).fill(true);   // (the side as the caller named it: `prefer` is kept as it came)
const CLEAR = [];                           // (pillsClear's boxes, four edges to a reading, grown in place)

/**
 * pills: [{ x, y, w, h, prefer: true (above) | false (below), was: { above, dx } | null }] in stage px.
 * W: the stage width; top, lim: the free band's top and bottom (the top sheet's and the bottom card's edges);
 * blockers: the cards' rects. Writes { above, dx } for each pill into outs[i] (an object each, kept by the caller: a pill's own `was`
 * will do, it is read before anything is written) and returns how many: none for no pills, one for one, two for two or more.
 */
export function placePillsInto({ pills, W, top, lim, blockers = NONE }, outs) {
  const n = Math.min(pills.length, 2);
  for (let i = 0; i < n; i++) {
    const p = pills[i], reach = Math.max(0, Math.min(0.4 * p.w, p.w / 2 - 28)), base = i * PER;
    let o = base;
    for (let side = 0; side < 2; side++) {
      const above = side === 0 ? p.prefer : !p.prefer;
      for (let s = 0; s <= SPAN; s++) {
        for (let q = 0, nq = s ? 2 : 1; q < nq; q++, o++) {
          const sg = s ? (q ? 1 : -1) : 1, dx = sg * reach * s / 8;
          const x0 = p.x + dx - p.w / 2, y0 = above ? p.y - PILL_GAP - p.h : p.y + PILL_GAP, x1 = x0 + p.w, y1 = y0 + p.h;
          // Off the free band or the stage's sides counts as covered, as heavily as a card.
          const off = Math.max(0, top - y0) + Math.max(0, y1 - lim) + Math.max(0, 8 - x0) + Math.max(0, x1 - (W - 8));
          let hit = off * p.w;
          for (const r of blockers) hit += overlapOf(x0, y0, x1, y1, r.x0, r.y0, r.x1, r.y1, 6);
          // Cost: anything covered first; then leaving the side and offset it has (no move without a reason); then its preferred side, near centre.
          const kept = p.was ? (p.was.above === above ? 0 : 40) + Math.abs(p.was.dx - dx) * 3 : 0;   // (a placed reading moves least: the new one makes the room)
          OX0[o] = x0; OY0[o] = y0; OX1[o] = x1; OY1[o] = y1; OHIT[o] = hit; ODX[o] = dx; OAB[o] = above;
          OC[o] = (above === p.prefer ? 0 : 20) + Math.abs(dx) * 0.3 + kept;
        }
      }
    }
  }
  if (!n) return 0;
  if (n === 1) {
    let m = 0;
    for (let j = 1; j < PER; j++) if (OHIT[j] * 1e3 + OC[j] < OHIT[m] * 1e3 + OC[m]) m = j;
    outs[0].above = OAB[m]; outs[0].dx = ODX[m];
    return 1;
  }
  // Two readings: every pairing, so they never meet (8 px apart at least).
  let ba = -1, bb = 0, bc = 0;
  for (let a = 0; a < PER; a++) for (let b = PER; b < 2 * PER; b++) {
    const hit = OHIT[a] + OHIT[b] + overlapOf(OX0[a], OY0[a], OX1[a], OY1[a], OX0[b], OY0[b], OX1[b], OY1[b], 8) * 4, c = hit * 1e3 + OC[a] + OC[b];
    if (ba < 0 || c < bc) { bc = c; ba = a; bb = b; }
  }
  const a0 = OAB[ba], a1 = OAB[bb], d0 = ODX[ba], d1 = ODX[bb];
  outs[0].above = a0; outs[0].dx = d0; outs[1].above = a1; outs[1].dx = d1;
  return 2;
}

/** placePillsInto with a fresh result: [{ above, dx }] for each pill (a caller that keeps what it gets and has no objects of its own). */
export function placePills(q) {
  const res = [];   // alloc-rare: only when the readings are placed afresh (stage.js calls placePills only when it is the first time or pillsClear says a reading is no longer clear), not on a steady frame
  for (let i = 0, n = Math.min(q.pills.length, 2); i < n; i++) res.push({ above: true, dx: 0 });   // alloc-rare: only when the readings are placed afresh (stage.js calls placePills only when it is the first time or pillsClear says a reading is no longer clear), not on a steady frame
  placePillsInto(q, res);
  return res;
}

/**
 * Whether the placements the readings already have (pills[i].was) still keep them clear of the cards, the free band's edges, the
 * stage's sides and each other, with a smaller margin than placePills leaves, so a reading near a card's edge is not moved again
 * and again. Only when this is false are they placed afresh (a reading never moves for no reason).
 */
export function pillsClear({ pills, W, top, lim, blockers = NONE }) {
  const n = pills.length;
  for (let i = 0; i < n; i++) {
    const p = pills[i];
    if (!p.was) return false;
    const x0 = p.x + p.was.dx - p.w / 2, y0 = p.was.above ? p.y - PILL_GAP - p.h : p.y + PILL_GAP;
    CLEAR[4 * i] = x0; CLEAR[4 * i + 1] = y0; CLEAR[4 * i + 2] = x0 + p.w; CLEAR[4 * i + 3] = y0 + p.h;
  }
  for (let i = 0; i < n; i++) {
    const x0 = CLEAR[4 * i], y0 = CLEAR[4 * i + 1], x1 = CLEAR[4 * i + 2], y1 = CLEAR[4 * i + 3];
    if (y0 < top - 4 || y1 > lim + 4 || x0 < 4 || x1 > W - 4) return false;
    for (const r of blockers) if (overlapOf(x0, y0, x1, y1, r.x0, r.y0, r.x1, r.y1, 0) > 0) return false;
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (overlapOf(CLEAR[4 * i], CLEAR[4 * i + 1], CLEAR[4 * i + 2], CLEAR[4 * i + 3], CLEAR[4 * j], CLEAR[4 * j + 1], CLEAR[4 * j + 2], CLEAR[4 * j + 3], 2) > 0) return false;
  }
  return true;
}
