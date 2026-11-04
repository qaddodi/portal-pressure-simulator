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

// ── What a zoom moves on the page, for the glass (card-zoom-plan.md step 5: nothing hung on the element). A card zoom's pieces and the figure's
// callouts' glass under the scene camera are each given the zoom's ONE record, { s, ox, oy, dx, dy } (screen px: scale s about (ox, oy), then the
// move (dx, dy)), written in place by its one writer each frame, and, for a piece whose own box is pinned at rest, where it is really drawn.
const rides = new WeakMap();
const ride0 = { aff: null, real: null };
export const zoomRide = {
  /** el rides aff while zoomed; real(): its drawn box (a piece whose getBoundingClientRect answers its rest box), else none. */
  set(el, aff, real = null) { rides.set(el, { aff, real }); },   // alloc-rare: once per element as a zoom opens
  drop(el) { rides.delete(el); },
  /** The zoom el rides this frame, or null. */
  of(el) { return (rides.get(el) || ride0).aff; },
  /** Where el is drawn: its box through the zoom. */
  box(el) { const r = rides.get(el); return r?.real ? r.real() : el.getBoundingClientRect(); },
  /** How many times larger el is drawn than it rests (its corners grow with it). */
  scale(el) { return rides.get(el)?.aff.s ?? 1; },
};
// The zoom's frame, run by its writer once C is written for the frame (card-zoom.js tick and follow): whoever draws from it (the glass) draws in
// this frame, never one behind.
const zoomFrames = new Set();
export function onZoomFrame(fn) { zoomFrames.add(fn); return () => zoomFrames.delete(fn); }
export function zoomFrameRun() { for (const fn of zoomFrames) fn(); }

// ── One affine record for every camera (one-camera-record-plan.md, 4 Nov 2026): p' = k p + (x, y), in stage px from the stage's top-left
// corner. Identity: k 1, x 0, y 0. Pure and allocation-free: each takes the record it writes. A layer's frame camera is always
// card ∘ dive ∘ (pan ∘) base; every record has exactly one writer, and a writer never clears another's.
export const camNew = () => ({ k: 1, x: 0, y: 0 });
export const camSet = (r, k, x, y) => { r.k = k; r.x = x; r.y = y; return r; };
export const camId = (r) => camSet(r, 1, 0, 0);
/** k about the fixed point (px, py). */
export const camAbout = (r, k, px, py) => camSet(r, k, (1 - k) * px, (1 - k) * py);
/** out = outer ∘ inner (inner first); out may be either input. */
export function camThen(out, outer, inner) {
  const k = outer.k * inner.k, x = outer.k * inner.x + outer.x, y = outer.k * inner.y + outer.y;
  out.k = k; out.x = x; out.y = y;
  return out;
}
/** The scene's camera records. The lobule's `base` is the lobule's own view V, handed in by lobule-zoom.js. */
export const cams = {
  stage: { base: camNew(), dive: camNew(), card: camNew() },
  lobule: { base: null, pan: camNew(), dive: camNew(), card: camNew() },
};
