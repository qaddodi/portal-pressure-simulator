// The picture's share while the figure morphs between Anatomy and Circuit (12 Nov 2026, Mohammad's Mac at Figure size Full, 3840 x 2346 = 9 MP: a switch ran at
// 12 fps, every frame a whole Tube draw of the vessel layer and the lumen layer, 17 ms median and 115 ms worst on the GPU, "no kept layer").
//
// During the change every frame's points really move, so the vessel layer cannot be kept: each frame is a whole draw by design, and its cost goes with the
// layer's area. veins-gl.js therefore draws a morph frame of a big picture into the lower-left corner of the same layer and lumen targets, at this share of
// their width and height, and the compositor reads that corner stretched and filtered (the tier frames' contract: lowS, lowSz, lowT; COMP_FS is untouched).
// The first frame after the change lands draws the layer whole at Full again. Pictures at or under TRIGGER_MP, the default sizes among them, are not lowered
// at all. Settings > Sharp while moving turns it off.

/** A picture of more than this many megapixels is drawn lower while the figure morphs. */
export const TRIGGER_MP = 4;
/** What the lowered picture comes to, in megapixels (the share is the square root of target over picture). */
export const TARGET_MP = 3;
/** The lowest share (a quarter of the pixels): a bigger picture than this is still held to it. */
export const LOWEST = 0.5;

/**
 * The share of the layer's width and height a morph frame is drawn at for a picture of `px` pixels: 0 when it is drawn whole (a small picture), else
 * a number from LOWEST to under 1.
 */
export function morphLowK(px) {
  if (!(px > TRIGGER_MP * 1e6)) return 0;
  return Math.max(LOWEST, Math.sqrt(TARGET_MP * 1e6 / px));
}

/** The lowered layer's size for a layer of w x h at share k: at least 1, rounded as the lumen layer's share is (a ceil), so the corner never reaches past the layer. */
export function morphLowSize(w, h, k, out) {
  out[0] = Math.min(w, Math.max(1, Math.ceil(w * k)));
  out[1] = Math.min(h, Math.max(1, Math.ceil(h * k)));
  return out;
}
