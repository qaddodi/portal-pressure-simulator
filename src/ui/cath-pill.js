// Where the HVPG catheter's two readings (the free pressure at the tip, the wedged pressure ahead of it) stand round their points
// (pure, no DOM). Each reading is a pill with a pointer to its point, above the point (pointer down) or below it (pointer up), and
// may slide sideways while its pointer stays on the point. Both are placed together so neither sits on a card, the top sheet, the
// stage's edges or the other reading (his ask, 1 Nov 2026: "the callouts appear under the cards, the HVPG measuring too").
// A reading keeps its side and offset while they stay clear, so nothing moves without a reason; the caller eases any move.

export const PILL_GAP = 18;   // (the pointer's reach: the pill's near edge stands this far from its point, app.css .cath-label)

const overlap = (a, b, pad) => Math.max(0, Math.min(a.x1, b.x1 + pad) - Math.max(a.x0, b.x0 - pad)) * Math.max(0, Math.min(a.y1, b.y1 + pad) - Math.max(a.y0, b.y0 - pad));

/** The pill's box for a point (x, y), its size (w, h), its side (above: true) and its sideways offset dx. */
export const pillBox = (x, y, w, h, above, dx = 0) => {
  const x0 = x + dx - w / 2, y0 = above ? y - PILL_GAP - h : y + PILL_GAP;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
};

/**
 * pills: [{ x, y, w, h, prefer: true (above) | false (below), was: { above, dx } | null }] in stage px.
 * W: the stage width; top, lim: the free band's top and bottom (the top sheet's and the bottom card's edges);
 * blockers: the cards' rects. Returns [{ above, dx }] for each pill.
 */
export function placePills({ pills, W, top, lim, blockers = [] }) {
  const opts = pills.map((p) => {
    const reach = Math.max(0, Math.min(0.4 * p.w, p.w / 2 - 28)), out = [];
    for (const above of [p.prefer, !p.prefer]) for (let s = 0; s <= 8; s++) {
      for (const sg of s ? [-1, 1] : [1]) {
        const dx = sg * reach * s / 8, b = pillBox(p.x, p.y, p.w, p.h, above, dx);
        // Off the free band or the stage's sides counts as covered, as heavily as a card.
        const off = Math.max(0, top - b.y0) + Math.max(0, b.y1 - lim) + Math.max(0, 8 - b.x0) + Math.max(0, b.x1 - (W - 8));
        let hit = off * p.w;
        for (const r of blockers) hit += overlap(b, r, 6);
        // Cost: anything covered first; then leaving the side and offset it has (no move without a reason); then its preferred side, near centre.
        const kept = p.was ? (p.was.above === above ? 0 : 40) + Math.abs(p.was.dx - dx) * 0.5 : 0;
        out.push({ above, dx, b, hit, c: (above === p.prefer ? 0 : 20) + Math.abs(dx) * 0.3 + kept });
      }
    }
    return out;
  });
  if (!opts.length) return [];
  if (opts.length === 1) { const o = opts[0].reduce((m, q) => (q.hit * 1e3 + q.c < m.hit * 1e3 + m.c ? q : m)); return [{ above: o.above, dx: o.dx }]; }
  // Two readings: every pairing, so they never meet (8 px apart at least).
  let best = null;
  for (const a of opts[0]) for (const b of opts[1]) {
    const hit = a.hit + b.hit + overlap(a.b, b.b, 8) * 4, c = hit * 1e3 + a.c + b.c;
    if (!best || c < best.c) best = { c, r: [a, b] };
  }
  return best.r.map((o) => ({ above: o.above, dx: o.dx }));
}
