// A glass that changes size keeps its frost (13 Nov 2026, Mohammad: the view pill went transparent through its fold; "every glass element that
// changes size should keep its real frost"). The page used to stand in for a glass that grows or shrinks with a hidden real face and copies of it
// (face-split.js, plate-glide.js, topbar-motion.js), but the copies are the page's own fill, and a glass the GPU draws has none: it is drawn in the
// figure's canvas ([data-gl]), its fill, ring and shadow taken off the page, so the copies were empty or a flat tint, and the real one hidden.
// Here the page asks the GPU glass itself to change size in view (data-gl-morph, glass-gl.js morphFor): from the box it was drawn at, on the screen,
// to the box it has now, ring and shadow with it, on the length and curve the page's own glide has, so the words and the glass land together.
//
// Use it where the element is the glass (it carries data-gl); where it is not (no WebGL2, Blur effect off, the glass not drawn yet) it returns null
// and the caller keeps its stand-in, which draws the page's own fill.
const MORPH = 'data-gl-morph';
const KEEP_MS = 600;   // (the mark stays this long past the glide: the glass reads the new box in the next frame's read phase, which a slow frame may put late)
const held = new WeakMap();   // glass element -> its pending end

/** Whether the GPU draws this element's glass now (the page's own fill is off, and a stand-in would be empty). */
export const gpuGlass = (el) => !!el?.hasAttribute?.('data-gl');

/**
 * Asks el's glass to change size in view for `ms`, on the move curve when `move`, else the arrive curve. Returns the function that ends the ask
 * (idempotent), or null when el is not a glass the GPU draws. A second ask before the first ends takes it over.
 */
export function morphGlass(el, ms, move = false) {
  if (!gpuGlass(el)) return null;
  held.get(el)?.();
  el.setAttribute(MORPH, `${Math.round(ms)}${move ? ' move' : ''}`);
  let t = 0, over = false;
  const end = () => {
    if (over) return;
    over = true; clearTimeout(t);
    if (held.get(el) === end) held.delete(el);
    el.removeAttribute(MORPH);
  };
  t = setTimeout(end, ms + KEEP_MS);
  held.set(el, end);
  return end;
}
