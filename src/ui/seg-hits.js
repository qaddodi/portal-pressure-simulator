// Which vessel segments a label's box touches, for the figure's label placement (stage.js layoutLabels).
//
// The segments sit in a grid of `cell`-px buckets (key gx * 4096 + gy), each segment in every bucket its box, grown by its
// half width, reaches. A label tries dozens of spots per frame while a pinch re-solves the labels, so these run thousands
// of times a frame: they allocate nothing.

/** Does the segment cross the box `r` grown by `m` on every side? (Liang-Barsky.) */
export function segHitsBox(sg, r, m) {
  const x0 = r.x0 - m, y0 = r.y0 - m, x1 = r.x1 + m, y1 = r.y1 + m;
  let t0 = 0, t1 = 1, p, q, u;
  const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
  // The four sides, in order: left, right, top, bottom.
  p = -dx; q = sg.x0 - x0;
  if (p === 0) { if (q < 0) return false; } else { u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  p = dx; q = x1 - sg.x0;
  if (p === 0) { if (q < 0) return false; } else { u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  p = -dy; q = sg.y0 - y0;
  if (p === 0) { if (q < 0) return false; } else { u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
  p = dy; q = y1 - sg.y0;   // (the last side: only whether it cuts the span left)
  if (p === 0) return q >= 0;
  u = q / p;
  return p < 0 ? u <= t1 : u >= t0;
}

/** How many segments of `grid` the box touches, each segment's own half width and `margin` px of air included. With
 *  `any`, stops at the first: 1 when one touches, else 0. `stamp` is a number no earlier call used (each segment is
 *  counted once, though it sits in several buckets). */
export function gridHits(grid, cell, r, margin, stamp, any = false) {
  let n = 0;
  const gx1 = Math.floor((r.x1 + margin) / cell), gy0 = Math.floor((r.y0 - margin) / cell), gy1 = Math.floor((r.y1 + margin) / cell);
  for (let gx = Math.floor((r.x0 - margin) / cell); gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const c = grid.get(gx * 4096 + gy);
      if (!c) continue;
      for (let i = 0; i < c.length; i++) {
        const sg = c[i];
        if (sg.stamp === stamp) continue;
        sg.stamp = stamp;
        if (segHitsBox(sg, r, sg.hw + margin)) { n++; if (any) return n; }
      }
    }
  }
  return n;
}
