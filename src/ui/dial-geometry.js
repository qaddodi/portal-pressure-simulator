// The IAP dial's drawing (instruments.js iapDial): its box in its own units, and where the scale's words stand.
export const DIAL_VB = [-12, 0, 76];   // (x, y, width of the viewBox; 128 tall)
const DIAL_ROOM = 2;   // (what the scale's words keep from the drawing's left edge)

/**
 * The radius (from the dial's pivot) the word for scale value v stands at, type size ft in the drawing's units. Outside the ring at the size the
 * screen asks for (12 px, however small the dial is drawn, so ft grows as the dial shrinks); a large ft on a small dial put the "12", on the ring's
 * far left, past the drawing's left edge, where it was cut (16 Nov 2026, the Ascites card). So the radius is held to what keeps the whole word
 * inside, as near the ring as that needs, and never inside the ring's band.
 */
export function dialTickRadius(v, ft, max, C, R) {
  const cos = Math.abs(Math.cos(Math.PI / 2 + (v / max) * Math.PI));
  const wanted = R + 10 + 0.65 * ft, nearest = R + 5 + 0.5 * ft;
  const rMax = cos > 1e-6 ? (C - (DIAL_VB[0] + DIAL_ROOM) - 0.6 * ft) / cos : Infinity;   // (the word's centre; its half width is 0.6 of the type size for two figures)
  return Math.max(nearest, Math.min(wanted, rMax));
}
