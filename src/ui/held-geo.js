// A model piece's moving numbers, held on the piece instead of written as attributes (svg-gl.js's charts, svg-morph.js's glides).
//
// The deck's charts are drawn from a hidden model tree (svg-gl.js). A number that moves every frame, a leader's end, a ring's centre, a
// path's outline mid-glide, is kept on the piece: no attribute write, no mutation to watch, no style recalculation in a frame. The picture
// reads the piece through getAttribute, which gives the held number first and the attribute otherwise. Lives apart from svg-gl.js so the
// glide (svg-morph.js) can use it without loading the picture.

/** Sets a model piece's number or viewBox string held on the piece; returns true when it changed. A value of undefined lets go of it (the attribute shows again). */
export function setGeo(el, k, v) {
  let g = el._g;
  if (!g) {
    // (Read back as an attribute too, so what asks a piece for its ends or centre (the browser checks, svg-morph) finds them.)
    g = el._g = {};   // alloc-rare: a piece's first held number (its record is kept on the piece)
    const base = el._raw = el.getAttribute;   // (the piece's own, as it was)
    // alloc-rare: the piece's own getAttribute, made once with its first held number
    el.getAttribute = (n) => { const x = g[n]; return x === undefined ? (base ? base.call(el, n) : Element.prototype.getAttribute.call(el, n)) : x == null ? null : String(x); };
  }
  if (g[k] === v) return false;
  g[k] = v;
  return true;
}
/** The attribute itself, whatever number is held over it: how the glide sees that the chart wrote one of its numbers. */
export const rawGeo = (el, k) => (el._raw || el.getAttribute).call(el, k);
