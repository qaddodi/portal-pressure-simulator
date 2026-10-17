// Where the HVPG summary (the two readings, their bracket and the HVPG) sits on the stage (pure, no DOM).
// It keeps clear of the cards and of what it names: the catheter's tip, the wedged balloon and the point
// ahead of it, so the label never covers its target.

/** The world box round the balloon's outline (balloonOutline's samples: centre c, direction t, half width h). */
export function outlineBox(ol) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of ol) for (const k of [1, -1]) {
    const x = o.c[0] - o.t[1] * o.h * k, y = o.c[1] + o.t[0] * o.h * k;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return ol.length ? { x0, y0, x1, y1 } : null;
}

const area = (x0, y0, w, h, rs, pad) => rs.reduce((n, b) => n + Math.max(0, Math.min(x0 + w, b.x1 + pad) - Math.max(x0, b.x0 - pad)) * Math.max(0, Math.min(y0 + h, b.y1 + pad) - Math.max(y0, b.y0 - pad)), 0);

/**
 * The summary box's top-left on the stage. A: the readings' points ({ tip, ahead } in stage pixels); bw, bh: the box;
 * W: the stage width; top, lim: the free band's top and bottom (the cards' edges); gap: how far it stands off the points;
 * blockers: the cards' rects; keep: the rects it must never cover (the balloon, the tip, the point ahead).
 * Above the readings, centred between them; below them when there is no room above; sideways to the nearest clear spot.
 * When neither holds it clear, any height in the free band that does, nearest first.
 */
export function placeSummary({ A, bw, bh, W, top, lim, gap, blockers = [], keep = [] }) {
  const cx0 = (A.tip[0] + A.ahead[0]) / 2 - bw / 2, xMin = 28, xMax = Math.max(28, W - bw - 12), yMax = Math.max(top, lim - bh - 12);
  const yUp = Math.min(A.tip[1], A.ahead[1]) - bh - gap, yDown = Math.min(Math.max(Math.max(A.tip[1], A.ahead[1]) + gap, top), yMax);
  const hit = (x0, y0) => area(x0, y0, bw, bh, blockers, 4) + area(x0, y0, bw, bh, keep, 8);
  let best = null;
  const tryRow = (y0, pen) => {
    for (let d = 0; d <= W; d += 8) for (const sx of d ? [-1, 1] : [1]) {
      const x0 = cx0 + sx * d; if (x0 < xMin || x0 > xMax) continue;
      const h = hit(x0, y0), c = h * 1e3 + d + pen;
      if (!best || c < best.c) best = { c, x: x0, y: y0, h };
      if (!h) return;
    }
  };
  for (const [y0, pen] of (yUp >= top ? [[yUp, 0], [yDown, 60]] : [[yDown, 0], [Math.min(Math.max(yUp, top), yMax), 60]])) tryRow(y0, pen);
  // Both rows cover something (a short free band pushes the box onto the vein): every height in the band.
  if (best?.h) for (let y0 = top; y0 <= yMax; y0 += 8) tryRow(y0, 120 + Math.abs(y0 - best.y) * 0.1);
  if (best?.h) tryRow(yMax, 120);
  return best ? { x: best.x, y: Math.min(Math.max(best.y, top), yMax) } : { x: Math.min(Math.max(cx0, xMin), xMax), y: Math.min(Math.max(yUp, top), yMax) };
}
