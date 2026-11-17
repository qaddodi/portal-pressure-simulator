// The room an open card leaves the figure: one rule for every card (U3, 13 Nov 2026). Pure arithmetic, so the framing in stage-fit.js
// only gathers the boxes and these say where the figure goes. Insets are { t, b, l, r, W, H } in px: the room the bars and cards cover.

// Where the figure's centre goes, as a shift from the stage's centre in px. The figure keeps its place and moves only as far as an open
// card on the right makes it (24 px clear of the card's edge): it was centred in the room the card leaves, so History, a small card,
// moved it 215 px for 25 px of overlap. `sw` is the figure's drawn width with that clearance. Centred in the room (what a slide's
// columns are laid out for) when `centred`.
export function figureShift(ins, sw, centred = false) {
  const mid = (ins.l - ins.r) / 2;
  if (centred) return mid;
  return Math.max(mid, Math.min(ins.l / 2, ins.W / 2 - ins.r - sw / 2));
}

// A sheet that leaves the figure under 35% of the height gives up part of its cover, never the top bars': the figure's top stays below
// the pills (A10: both were scaled, and with Tests or Treat open on an iPhone the figure's top slid under them).
export function squeezeBottom(ins) {
  const { H, t, b } = ins;
  return H - t - b < H * 0.35 ? Math.max(0, Math.min(b, H * 0.65 - t)) : b;
}

// The circuit turned upright, fitted by its own drawn box (art, [x0, y0, x1, y1] in world units) into the room the bars leave, `gap` px clear
// above and below, and centred there. (The view box is 8% taller than the art, and fitting that left the map small, high under the top
// bar and 100 px short of the view pill on an iPhone: A4.) `vb` is the view box [x, y, w, h]. Gives { k, x, y } in the camera's terms
// (screen = origin + s0 * (x + k * world)), or null when there is no room.
export function uprightFitOf(ins, W, H, vb, art, gap = 12) {
  if (!W || !H) return null;
  const s0 = Math.min(W / vb[2], H / vb[3]);
  const ox = (W - vb[2] * s0) / 2 - vb[0] * s0, oy = (H - vb[3] * s0) / 2 - vb[1] * s0;
  const [x0, y0, x1, y1] = art;
  const k = Math.min(1.6, (W - ins.l - ins.r - 2 * gap) / ((x1 - x0) * s0), (H - ins.t - ins.b - 2 * gap) / ((y1 - y0) * s0));
  if (!(k > 0.05)) return null;
  const tx = (ins.l + W - ins.r) / 2, ty = (ins.t + H - ins.b) / 2;
  return { k, x: (tx - ox) / s0 - (k * (x0 + x1)) / 2, y: (ty - oy) / s0 - (k * (y0 + y1)) / 2 };
}

// A phone held sideways: the top bar's pieces stand apart with the figure between them (the patient chip at the left, the key and the toolbar
// at the right), so only the ones over the figure's column cover its top (A11: the whole bar's two rows were kept clear, and the figure had a
// quarter of the screen). `tops` holds x0, x1, y1 for each piece; the column is the room's centre, as wide as the figure can be there
// (at most 0.9 of its height: the figure is taller than wide), 24 px more each side. `exact` (a slide's framing) counts them all.
// Gives the top inset: the lowest edge of the pieces that count, or `t` as it was.
export function topOverColumn(tops, ins, exact = false) {
  let t = ins.t;
  const half = Math.min(ins.W - ins.l - ins.r, (ins.H - ins.b) * 0.9) / 2 + 24, mid = (ins.l + ins.W - ins.r) / 2;
  for (let i = 0; i < tops.length; i += 3) if (exact || (tops[i] < mid + half && tops[i + 1] > mid - half)) t = Math.max(t, tops[i + 2]);
  return t;
}

// The largest free rectangle (16 Nov 2026, camera fit with panels open). The insets above are four edges, each the furthest any card reaches, so
// two cards that leave a big gap between them (Treat at the top right, Tests across the bottom) were read as one wall: the figure was fitted
// into the 130 px strip under the short card and the gap stayed empty (a Mac window 1250 x 1043 did it with Tests alone).
// `blocks` are the side cards' boxes [x0, y0, x1, y1] in stage px; `t` and `b` are the bars' full-width bands above and below. Every rectangle
// the cards' edges and the bands bound is tried; the one the figure would be biggest in wins (its drawn size is limited by the narrower of the
// room's width and its height times the figure's own shape, FIG_SHAPE), then the larger area. Gives { l, t, r, b, score } as insets, or null.
export const FIG_SHAPE = 0.89;   // (the figure's width over its height: VB_ANAT 820 x 920)
export const roomScore = (w, h) => Math.min(w, h * FIG_SHAPE);
export function largestFreeRect(W, H, t, b, blocks) {
  const y0 = t, y1 = H - b;
  if (!(W > 0) || !(y1 - y0 > 0)) return null;
  const xs = [0, W], ys = [y0, y1];
  for (const k of blocks) {
    if (k[0] > 0 && k[0] < W) xs.push(k[0]);
    if (k[2] > 0 && k[2] < W) xs.push(k[2]);
    if (k[1] > y0 && k[1] < y1) ys.push(k[1]);
    if (k[3] > y0 && k[3] < y1) ys.push(k[3]);
  }
  xs.sort((p, q) => p - q); ys.sort((p, q) => p - q);
  let best = null;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const xa = xs[i], xb = xs[j];
    if (xb - xa < 1) continue;
    for (let m = 0; m < ys.length; m++) for (let n = m + 1; n < ys.length; n++) {
      const ya = ys[m], yb = ys[n];
      if (yb - ya < 1) continue;
      let hit = false;
      for (const k of blocks) if (k[0] < xb - 0.5 && k[2] > xa + 0.5 && k[1] < yb - 0.5 && k[3] > ya + 0.5) { hit = true; break; }
      if (hit) continue;
      const score = roomScore(xb - xa, yb - ya), area = (xb - xa) * (yb - ya);
      if (!best || score > best.score + 0.5 || (score > best.score - 0.5 && area > best.area)) best = { l: xa, t: ya, r: W - xb, b: H - yb, score, area };
    }
  }
  return best;
}

// The insets the figure is fitted into: the edges' way (`ins`, as safeInsetsFrom worked them out) unless the largest free rectangle is clearly roomier
// (15 % and 8 px more figure), as with Treat at the top right over a Tests sheet, or Tests alone in a tall window (the 560 px card ends above 62 % of it).
// Never on a slide, whose columns are laid out for the figure. Written into `ins`.
export function roomiest(ins, W, H, bandT, bandB, blocks) {
  const fr = blocks.length ? largestFreeRect(W, H, bandT, bandB, blocks) : null;
  if (fr && fr.score >= 200 && fr.score > roomScore(W - ins.l - ins.r, H - ins.t - ins.b) * 1.15 + 8) { ins.l = fr.l; ins.r = fr.r; ins.t = fr.t; ins.b = fr.b; }
  return ins;
}

// Where a span [lo, hi] goes to stay in a window [wlo, whi] with the least move (17 Nov 2026: opening or closing a card keeps the zoom and pans the
// view so as much of what was in view as possible stays in the room the card leaves). Inside already: 0. Narrower than the window: just far enough
// to be inside. Wider than the window: centred in it, so the loss is the same at both ends. Returns the shift to add to the span.
export function panInto(lo, hi, wlo, whi) {
  if (!(hi > lo) || !(whi > wlo)) return 0;
  if (hi - lo > whi - wlo) return (wlo + whi) / 2 - (lo + hi) / 2;
  return lo < wlo ? wlo - lo : hi > whi ? whi - hi : 0;
}
