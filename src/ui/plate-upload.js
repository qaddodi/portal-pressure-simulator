// The plate rasters (stage.js rasterPlate) reach the GPU as pixel strips, one per frame, never as a canvas. Safari copies a
// canvas into a texture through its GPU process, and the whole-plate raster took it 570–750 ms in one frame after each
// patient change (HVPG slides 8 and 9, 17 Oct). Pixels read from a canvas kept in memory (willReadFrequently) are a plain
// upload instead, and a strip at a time keeps every frame short. The texture is shown only once its last strip is in.

/** Pixels per strip: about 2 MB, a few milliseconds to read and upload. */
export const PLATE_STRIP = 1 << 19;

/** The rows of each strip of a W × H raster: [y, rows] pairs from the top. */
export function plateStrips(W, H, px = PLATE_STRIP) {
  const step = Math.max(1, Math.floor(px / Math.max(1, W))), out = [];
  for (let y = 0; y < H; y += step) out.push([y, Math.min(step, H - y)]);
  return out;
}

/**
 * Multiplies each pixel's alpha into its colour, in place, as the texture expects (the canvas copy did this on its way
 * in): getImageData gives the colour back without its alpha. Opaque pixels are left as they are.
 */
export function premultiply(d) {
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a === 255) continue;
    if (a === 0) { d[i - 3] = d[i - 2] = d[i - 1] = 0; continue; }
    const k = a / 255;
    d[i - 3] = Math.round(d[i - 3] * k); d[i - 2] = Math.round(d[i - 2] * k); d[i - 1] = Math.round(d[i - 1] * k);
  }
  return d;
}

/**
 * The gut picture's resolution (px per unit) for a view that needs `need`: the next of fixed steps (cap, cap / √2, cap / 2, …)
 * at or above it, so it is never stretched and an ordinary pinch, which stays between two steps, needs no new picture: one was
 * made after every pinch that changed the zoom by a tenth, a long frame each time (Mohammad, 21 Oct: "the lag after stopping
 * panning or zooming"). Above the cap, the cap.
 */
export function gutStep(need, cap) {
  let k = cap;
  while (k / Math.SQRT2 >= need && k > 1 / 64) k /= Math.SQRT2;
  return k;
}

/**
 * A view raster W × H made after a pan at the same scale takes what it can from the one before (pw × ph, whose pixel
 * (x + ox, y + oy) is this one's (x, y)): for the rows y .. y + rows, `copy` is the [x, y, w, h] it takes over (null when
 * none) and `draw` the rects left to draw, which with it cover the rows exactly once.
 */
export function viewReuse(W, H, pw, ph, ox, oy, y, rows) {
  const x0 = Math.max(0, -ox), x1 = Math.min(W, pw - ox), y0 = Math.max(y, -oy), y1 = Math.min(y + rows, ph - oy);
  if (x1 <= x0 || y1 <= y0) return { copy: null, draw: [[0, y, W, rows]] };
  const draw = [];
  if (y0 > y) draw.push([0, y, W, y0 - y]);
  if (x0 > 0) draw.push([0, y0, x0, y1 - y0]);
  if (x1 < W) draw.push([x1, y0, W - x1, y1 - y0]);
  if (y1 < y + rows) draw.push([0, y1, W, y + rows - y1]);
  return { copy: [x0, y0, x1 - x0, y1 - y0], draw };
}

/** Copies a w × h block of RGBA pixels from src (sW wide, at sx, sy) into dst (dW wide, at dx, dy), row by row. */
export function copyPixels(dst, dW, dx, dy, src, sW, sx, sy, w, h) {
  for (let r = 0; r < h; r++) {
    const s = ((sy + r) * sW + sx) * 4;
    dst.set(src.subarray(s, s + w * 4), ((dy + r) * dW + dx) * 4);
  }
  return dst;
}
