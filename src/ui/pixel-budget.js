// The figure's pixel budget (1 Nov 2026, GPU move step 4): no canvas of the figure holds more than `capMP` megapixels (frame.js
// figOpt('cap'), 8 by default; 0 = no budget). Every laptop, iPad and phone is under 8 at its own density (a 16-inch MacBook's whole
// screen is 7.7), so only a large external screen draws fewer pixels than its full density, and its heat with them.

/** The density (device px per CSS px) a w × h CSS px canvas may be drawn at: `dpr`, or less, so that it holds at most capMP megapixels. */
export function capDensity(dpr, w, h, capMP) {
  const cap = capMP * 1e6, px = w * h * dpr * dpr;
  return cap > 0 && px > cap && dpr > 0 ? dpr * Math.sqrt(cap / px) : dpr;
}

/**
 * The density the figure's other canvases (the lobule's, the sinusoid's) are drawn at: the screen's own `base` at Figure resolution's `scale`, held to the same pixel budget
 * as the anatomy's canvas, so one setting (Settings › Figure size) governs all three (14 Nov 2026: the lobule had ignored it and was drawn sharper, and hotter, than the
 * anatomy). The same number as stage-res.js figShare gives the anatomy: base × scale × √(budget / pixels), never under a tenth of the screen's density.
 */
export function figureDensity(base, scale, w, h, capMP) {
  return Math.max(0.1 * base, capDensity(base * scale, w, h, capMP));
}
