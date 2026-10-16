// Where the action card goes beside the structure it belongs to. Pure geometry, so it can be tested on its own.
// A vessel's card never lies over the vessel: every spot that clears the whole drawn vessel (its width included)
// beats every spot that covers any of it. An organ is too big for that rule; its card only covers as little as it can.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The vessel's path with no gap between samples wider than `step` px, so a card cannot sit between two samples.
export function densify(path, step = 4) {
  if (!path || path.length < 2) return path || [];
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    for (let j = 1; j <= n; j++) out.push([x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n]);
  }
  return out;
}

// Every sample of a vessel's drawn lines (its tube, and a braided bed's strands), each line densified on its own.
export const vesselPoints = (a) => (a.lines || [a.path || [[a.x, a.y]]]).flatMap((l) => densify(l));

// How many path samples lie under a w × hh card at (x, y), with `m` px of clearance.
export function coverCount(pts, x, y, w, hh, m) {
  let n = 0;
  for (const [px, py] of pts) if (px > x - m && px < x + w + m && py > y - m && py < y + hh + m) n++;
  return n;
}

/**
 * a: { x, y, path, r? } in view pixels (r: the vessel's drawn half-width; present only for a vessel).
 * box: { top, bottom, right } the free part of the view (left edge is 8).
 * fig: the drawn figure's rectangle, or null. panel: a touch tablet's preferred spot (right side, under the top bar).
 */
export function placeCard(a, w, hh, box, fig = null, panel = false) {
  const { top, bottom, right } = box;
  const vessel = a.r != null;
  const pts = vessel ? vesselPoints(a) : (a.path || [[a.x, a.y]]);
  const m = vessel ? a.r + 8 : 6;
  const maxX = Math.max(8, right - w), maxY = Math.max(top, bottom - hh);
  const fit = (x, y) => [clamp(x, 8, maxX), clamp(y, top, maxY)];
  // A touch tablet keeps its side panel on the right, so the card never lands under the hand working the figure,
  // unless the vessel runs under it there.
  if (panel) {
    const [x, y] = fit(right - w, top);
    if (!vessel || !coverCount(pts, x, y, w, hh, m)) return { x, y, cover: 0 };
  }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [px, py] of pts) { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); }
  const gap = 22, g = vessel ? m + 14 : gap;
  const cands = [[a.x + gap, a.y - hh / 2], [a.x - gap - w, a.y - hh / 2], [a.x - w / 2, a.y + gap], [a.x - w / 2, a.y - gap - hh], [a.x + gap, a.y - 30], [a.x - gap - w, a.y - 30]];
  if (fig) cands.push([fig.x1 + 16, a.y - hh / 2], [fig.x0 - 16 - w, a.y - hh / 2]);
  if (vessel) {
    // Clear of the whole vessel: beside, above or below its extent.
    cands.push([bx1 + g, a.y - hh / 2], [bx0 - g - w, a.y - hh / 2], [a.x - w / 2, by1 + g], [a.x - w / 2, by0 - g - hh],
      [bx1 + g, top], [bx0 - g - w, top], [bx1 + g, maxY], [bx0 - g - w, maxY]);
    // And a sweep of the whole free area, for vessels that wind through the middle of it.
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 8; j++) cands.push([8 + ((maxX - 8) * i) / 10, top + ((maxY - top) * j) / 8]);
  }
  let best = null;
  cands.forEach(([x0, y0], i) => {
    const [cx, cy] = fit(x0, y0);
    const cover = coverCount(pts, cx, cy, w, hh, m);
    const shift = Math.abs(cx - x0) + Math.abs(cy - y0);
    // The share of the card lying over the drawn figure.
    const over = fig ? Math.max(0, Math.min(cx + w, fig.x1) - Math.max(cx, fig.x0)) * Math.max(0, Math.min(cy + hh, fig.y1) - Math.max(cy, fig.y0)) / (w * hh) : 0;
    const far = Math.max(0, Math.hypot(cx + w / 2 - a.x, cy + hh / 2 - a.y) - (w + hh) / 2);
    const cost = cover * (vessel ? 1e5 : 40) + over * 140 + shift * 0.5 + far * 0.15 + Math.min(i, 14) * 3;
    if (!best || cost < best.cost) best = { cost, x: cx, y: cy, cover: vessel ? cover : 0 };
  });
  return { x: best.x, y: best.y, cover: best.cover };
}
