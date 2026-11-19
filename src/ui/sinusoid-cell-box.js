// Where the sinusoid view's second pass (the stellate and Kupffer cells) can put a pixel (OG-2, full app review 15 Nov 2026).
// The shader draws the pass over the whole target, but it gives a pixel colour only inside two small boxes of the vessel's own frame:
// the stellate cell within 42 um of uXs on the sinusoid's lower side, the Kupffer cell within 9 um of uXk just under the lumen's edge.
// Everywhere else it writes nothing (transparent black, which the blend leaves as it was). So the pass is scissored to the device
// pixels those boxes cover: the same picture, a few percent of the fragments.

const STELLATE_HALF = 42, KUPFFER_HALF = 9, KUPFFER_UP = 7, KUPFFER_DOWN = 1, DISSE_UM = 3.4, ENDO_UM = 0.8, WALL_PAD = 4;

/**
 * The scissor rectangles for the cells' pass.
 * @param {{uF0:ArrayLike<number>,uF1:ArrayLike<number>,uXs:number,uXk:number,uKy:number,uLum:number,uCol:number}} u
 *   the draw's uniforms (uF0/uF1: local um -> device px, y down, as the view sets them)
 * @param {number} W target width in device px
 * @param {number} H target height in device px
 * @param {Int32Array} out 8 numbers, x y w h for up to two boxes (GL scissor order: y up)
 * @returns {number} how many boxes (0, 1 or 2) are in out; 0 means nothing of the pass is on screen
 */
export function cellBoxes(u, W, H, out) {
  // Farthest the Disse space's outer edge lies from the axis (halfW's ripple 0.15 and disseW's 0.2 included), then the shader's own pad.
  const yFar = u.uLum + 0.15 + ENDO_UM + DISSE_UM * (1 + 0.25 * u.uCol) + 0.2 + WALL_PAD + 1;
  let n = 0;
  const A = [0, 0, 0, 0], B = [0, 0, 0, 0];
  fromLocal(u, u.uXs - STELLATE_HALF, u.uXs + STELLATE_HALF, -yFar, 0, A);
  fromLocal(u, u.uXk - KUPFFER_HALF, u.uXk + KUPFFER_HALF, u.uKy - KUPFFER_UP, u.uKy + KUPFFER_DOWN, B);
  // A little over a pixel on every side: the shader tests at pixel centres and the box edges are real numbers.
  for (const r of [A, B]) { r[0] -= 2; r[1] -= 2; r[2] += 2; r[3] += 2; }
  const a = clip(A, W, H), b = clip(B, W, H);
  if (a && b && A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) {
    // Overlapping: one box over both, so no pixel is drawn (blended) twice.
    const U = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
    return put(U, W, H, out, 0);
  }
  if (a) n = put(A, W, H, out, n);
  if (b) n = put(B, W, H, out, n);
  return n;
}

// The device-pixel bounds [x0, y0, x1, y1] (y down) of a local box, by its four corners.
function fromLocal(u, x0, x1, y0, y1, r) {
  let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? x1 : x0, y = i & 2 ? y1 : y0;
    const dx = u.uF0[0] * x + u.uF0[1] * y + u.uF0[2], dy = u.uF1[0] * x + u.uF1[1] * y + u.uF1[2];
    if (dx < lx) lx = dx; if (dx > hx) hx = dx;
    if (dy < ly) ly = dy; if (dy > hy) hy = dy;
  }
  r[0] = lx; r[1] = ly; r[2] = hx; r[3] = hy;
}
function clip(r, W, H) { return r[2] > 0 && r[3] > 0 && r[0] < W && r[1] < H && Number.isFinite(r[0] + r[1] + r[2] + r[3]); }
function put(r, W, H, out, n) {
  const x0 = Math.max(0, Math.floor(r[0])), x1 = Math.min(W, Math.ceil(r[2]));
  const y0 = Math.max(0, Math.floor(r[1])), y1 = Math.min(H, Math.ceil(r[3]));
  if (x1 <= x0 || y1 <= y0) return n;
  out[n * 4] = x0; out[n * 4 + 1] = H - y1; out[n * 4 + 2] = x1 - x0; out[n * 4 + 3] = y1 - y0;   // (GL: y up)
  return n + 1;
}
