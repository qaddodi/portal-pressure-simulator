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
