// The catheter's two readings travel into the summary from where their pills stood (stage.js cathLabels), eased over .6 s.
// It was a CSS transform transition, which the browser runs on its compositor, a frame ahead of anything the page draws: the
// callouts' glass is drawn from the page's layout on the main thread (glass-gl.js), so each pill's background trailed its words by
// up to a few dozen pixels while they travelled. Here the offset is worked out and written each frame, on the same thread and in the
// same frame as the glass, so the words and the glass move as one. Nothing here touches the page.

/** A CSS cubic-bezier(x1, y1, x2, y2) as a function: the share of the time gone (0–1) to the share of the way (0–1). */
export function bezier(x1, y1, x2, y2) {
  const poly = (p, q) => { const c = 3 * p, b = 3 * (q - p) - c; return [1 - c - b, b, c]; };
  const X = poly(x1, x2), Y = poly(y1, y2);
  const at = (k, s) => ((k[0] * s + k[1]) * s + k[2]) * s;
  const slope = (k, s) => (3 * k[0] * s + 2 * k[1]) * s + k[2];
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {   // (Newton's steps, which settle in two or three for these curves)
      const err = at(X, s) - t;
      if (Math.abs(err) < 1e-6) return at(Y, s);
      const d = slope(X, s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;   // (a curve too flat for Newton: halving)
    s = t;
    for (let i = 0; i < 30; i++) {
      const x = at(X, s);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return at(Y, s);
  };
}

export const FLIP_MS = 600;
const EASE = bezier(0.2, 0.8, 0.2, 1);   // (app.css --ease, the curve the travel had as a transition)

/** A reading's travel, begun at `t0` (ms) from `dx`, `dy` px away from where it now stands. */
export const flipFrom = (dx, dy, t0) => ({ dx, dy, t0 });

/** Where the travel stands at `now`: the pixels still to go, `x` and `y`, and `done` once it has landed. */
export function flipAt(f, now, ms = FLIP_MS) {
  const u = Math.min(1, Math.max(0, (now - f.t0) / ms)), left = 1 - EASE(u);
  return { x: f.dx * left || 0, y: f.dy * left || 0, done: u >= 1 };   // (|| 0: never a minus zero)
}
