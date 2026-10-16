// The lobule's look (G21): pure helpers the lobule view draws with, kept here so they can be tested without a canvas.

/** The sinusoids' lumen against the hepatocyte cords: a quarter narrower than it was, so the cords read as cords. */
export const SIN_NARROW = 0.75;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * A hepatocyte's colour by its zone: rgb 0–1, q its place across the lobule (0 at the central vein, 1 at the portal edge).
 * Zone 3, around the central vein, is deeper and warmer (blue drops most, red least); zone 1 keeps the cell's own tone.
 */
export function cordTone(rgb, q, dark = false) {
  const k = (dark ? 0.12 : 0.16) * (1 - smooth(0.3, 0.75, q));
  return [rgb[0] * (1 - 0.35 * k), rgb[1] * (1 - 0.8 * k), rgb[2] * (1 - k)];
}

/**
 * A sinusoid's colour as it capillarizes (fibSin 0–1): drained toward a grey of its own lightness, tinted with the lobule's
 * shade (--lz-shade), so choked sinusoids look duller, never brighter. Healthy (fibSin 0) it is unchanged.
 */
export function dullSinusoid(rgb, shade, fibSin) {
  const f = 0.4 * Math.min(1, Math.max(0, fibSin || 0));
  if (!(f > 0)) return rgb;
  const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return rgb.map((x, i) => x + (l + (shade[i] - l) * 0.35 - x) * f);
}

/** The neighbouring lobules' contrast, cut by this much (an overlay of the page's own colour) in the lobule view (G22). */
export const NEIGHBOUR_FLAT = 0.3;

/** Their blur, in px of a field tile whose lobules are R px across: none on the smallest tiles, about 4 px on a 192 px one. */
export const neighbourBlur = (R) => (R < 24 ? 0 : R * 0.02);
