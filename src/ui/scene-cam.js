// The scene camera (card zoom, 4 Nov 2026, card-zoom-plan.md): while a card is zoomed, nothing in the scene is laid out again. The view
// (vt, V), every label's place and every card's box stay as they rest; ONE camera C moves the picture: a scale s about the screen point
// (ox, oy), then a move (dx, dy), all in client px. card-zoom.js's frame callback is the only writer (set / off); the figure's canvas,
// the labels and the page's scene layers read C in the same frame. Nothing here runs by itself.
export const sceneCam = {
  aim: null,   // (where the zoom will land, set by card-zoom.js before it opens: { s, ox, oy, dx, dy, box: the card as it will be drawn })
  on: false, s: 1, ox: 0, oy: 0, dx: 0, dy: 0,
  /** Takes the frame's camera. */
  set(s, ox, oy, dx, dy) { this.on = true; this.s = s; this.ox = ox; this.oy = oy; this.dx = dx; this.dy = dy; },
  /** Back to the identity: the zoom is over. */
  off() { this.aim = null; this.on = false; this.s = 1; this.ox = this.oy = this.dx = this.dy = 0; },
  /** C's translation for a frame of reference whose origin is (left, top) in client px: x' = s x + tx(left), y' = s y + ty(top). */
  tx(left = 0) { return (this.ox - left) * (1 - this.s) + this.dx; },
  ty(top = 0) { return (this.oy - top) * (1 - this.s) + this.dy; },
  /**
   * A picture kept at the size of its stage (w x h) and carried by C covers the stage only while its move stays in [w(1-s), 0] on x and
   * [h(1-s), 0] on y (the fixed point of a zoom to a card at an edge falls off the screen, and a strip of the stage is left bare). The
   * move C's layers that carry a kept picture use: C's own where it covers, else the nearest that does. Written into out [tx, ty] (stage px
   * from the stage's corner); s <= 1 is left as it is.
   */
  cover(out, left, top, w, h) {
    let tx = this.tx(left), ty = this.ty(top);
    if (this.s > 1) { tx = Math.min(0, Math.max(w * (1 - this.s), tx)); ty = Math.min(0, Math.max(h * (1 - this.s), ty)); }
    out[0] = tx; out[1] = ty;
    return out;
  },
};
