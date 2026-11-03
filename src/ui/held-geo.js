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

/** A model path/polygon/polyline piece's outline held on the piece as points (x, y pairs in a typed array the owner writes in place, n pairs
 *  used): the same record svg-gl.js's setPts keeps, set here so the glide can use it without loading the picture. */
export function holdPts(el, buf, n, closed) {
  const P = el._pts;
  if (P) { P.buf = buf; P.n = n; P.closed = closed; } else el._pts = { buf, n, closed };   // alloc-rare: a piece's first points record, made once (kept on the piece)
}
/** Lets go of the held points: the piece is drawn from its own `d` or `points` again. */
export function dropPts(el) { el._pts = undefined; }
/** A model piece's path held as commands (shape-gl's pathCmds form: op bytes and a number list the owner writes in place): the picture cuts it into
 *  polylines itself at the zoom it draws at. For a glide of a curve. */
export function holdCmds(el, cmds) { el._cmds = cmds; }
/** Lets go of the held commands. */
export function dropCmds(el) { el._cmds = undefined; }
/** A model piece's transform held as a matrix [a, b, c, d, e, f] (a typed array the owner writes in place). For a glide of a transform. */
export function holdMat(el, m) { el._mat = m; }
/** Lets go of the held matrix. */
export function dropMat(el) { el._mat = undefined; }
