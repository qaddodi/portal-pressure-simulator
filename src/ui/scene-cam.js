// The scene camera (card zoom, 4 Nov 2026, card-zoom-plan.md): while a card is zoomed, nothing in the scene is laid out again. The view
// (vt, V), every label's place and every card's box stay as they rest; ONE camera C moves the picture: a scale s about the screen point
// (ox, oy), then a move (dx, dy), all in client px. card-zoom.js's frame callback is the only writer (set / off); the figure's canvas,
// the labels and the page's scene layers read C in the same frame. Nothing here runs by itself.
export const sceneCam = {
  on: false, s: 1, ox: 0, oy: 0, dx: 0, dy: 0,
  /** Takes the frame's camera. */
  set(s, ox, oy, dx, dy) { this.on = true; this.s = s; this.ox = ox; this.oy = oy; this.dx = dx; this.dy = dy; },
  /** Back to the identity: the zoom is over. */
  off() { this.on = false; this.s = 1; this.ox = this.oy = this.dx = this.dy = 0; },
  /** C's translation for a frame of reference whose origin is (left, top) in client px: x' = s x + tx(left), y' = s y + ty(top). */
  tx(left = 0) { return (this.ox - left) * (1 - this.s) + this.dx; },
  ty(top = 0) { return (this.oy - top) * (1 - this.s) + this.dy; },
};
