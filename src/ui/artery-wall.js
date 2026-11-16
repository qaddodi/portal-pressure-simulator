// The hepatic artery's own wall on the dark looks.
//
// The vessels' outline is one ink, the look's own: a warm sepia at .64 on the light looks, a near-black at .3 to .38 on the dark ones, where the ground
// is near-black as well and swallows it. The artery, the thinnest vessel in the Anatomy, read there as a hairline while Light and Soft showed it as thick
// as it is (16 Nov 2026, Mohammad: a vessel is one width in all five looks, only the colour adjusts). A look that sets --artery-wall-k above 0 draws the
// artery's casing in its own colour deepened by that share (the casing's own colour, F_EDGE, texel 6 of the vessel's row), as wide as the sepia
// outline is on the light looks. The light looks leave it at 0 and keep the outline ink.

export const ARTERY_WALL = { k: 0, rgb: [0, 0, 0] };

/** The wall's share from the look (--artery-wall-k), and the artery's colour [r, g, b] 0..1 it is a share of; read once a sync, written in place. */
export function readArteryWall(k, artery) {
  const w = ARTERY_WALL;
  w.k = k > 0 ? k : 0;
  w.rgb[0] = artery[0] * w.k; w.rgb[1] = artery[1] * w.k; w.rgb[2] = artery[2] * w.k;
}

/** The wall's colour into texel 6 (rgb) at `o` of a vessel's row, when the look draws one. */
export function writeArteryWall(data, o) {
  const c = ARTERY_WALL.rgb;
  data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
}
