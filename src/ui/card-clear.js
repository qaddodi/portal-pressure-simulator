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
