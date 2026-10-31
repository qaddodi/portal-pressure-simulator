// What the figure shows between the model's frames (combined plan M1): one filter for everything the model sets and the figure
// draws as a size or a colour, so nothing steps when the model does. A critically damped follow: two first-order stages of time
// constant tau in cascade, stepped exactly for any dt, so the shown value and its speed change continuously and trace the same
// curve at 60 or 120 Hz; a new target (a model frame, a slider) bends the speed instead of jumping it. It lands exactly on its
// target once both stages are within eps of it, so a settled figure is drawn exactly as the model has it.
//
// The vessels' widths (stage.js followWidth) and the lumens' colours (stage.js followColour) both use it, with the widths' time
// constant (W_TAU there). The blood keeps its own slower mean (blood.js, 1.5 s), which is meant to be seen.

/** One step: v the shown value, w the first stage, T the target. Returns { v, w } (one object, reused). */
const OUT = { v: 0, w: 0 };
export function follow2(v, w, T, dt, tau, eps) {
  const u = Math.max(0, dt) / tau, a = Math.exp(-u), e1 = w - T, e2 = v - T;
  w = T + e1 * a; v = T + (e2 + e1 * u) * a;
  if (Math.abs(T - w) < eps && Math.abs(w - v) < eps) w = v = T;
  OUT.v = v; OUT.w = w;
  return OUT;
}

/**
 * Colours that follow their targets: per key, `n` channels (two RGB colours: 6). step(key, target, dt, opts): the colour to show
 * now, written into `target`'s place (a new array per key, kept). opts.snap: show the target at once (a crossfade carries the
 * change, Reduce Motion, a vessel just shown). A change at rest of at most `small` on every channel (under what a display shows
 * apart: the running model's own steps) is shown at once too, so a model that only drifts costs no easing frames.
 * `moving`: whether any key stepped this round is still on its way (begin() starts a round).
 */
export function createColourFollow({ tau, eps = 0.002, small = 3 / 255, n = 6 } = {}) {
  const S = new Map();
  const api = {
    moving: false,
    begin() { api.moving = false; },
    step(key, target, dt, snap = false) {
      let s = S.get(key);
      if (!s) { s = { v: Float64Array.from(target), w: Float64Array.from(target), out: new Array(n) }; S.set(key, s); snap = true; }
      // (At rest: both stages together, where the last target was. Moving, a new target is followed on from where it is.)
      let rest = true, big = false;
      for (let i = 0; i < n; i++) {
        if (s.v[i] !== s.w[i]) rest = false;
        if (Math.abs(target[i] - s.v[i]) > small) big = true;
      }
      if (snap || (rest && !big)) { for (let i = 0; i < n; i++) { s.v[i] = s.w[i] = target[i]; s.out[i] = target[i]; } return s.out; }
      let still = true;
      for (let i = 0; i < n; i++) {
        const r = follow2(s.v[i], s.w[i], target[i], dt, tau, eps);
        s.v[i] = r.v; s.w[i] = r.w; s.out[i] = r.v;
        if (r.v !== target[i] || r.w !== target[i]) still = false;
      }
      if (!still) api.moving = true;
      return s.out;
    },
    /** Forget keys not stepped in `keep` (a Set): drawn again later, they start where they are told. */
    prune(keep) { for (const k of S.keys()) if (!keep.has(k)) S.delete(k); },
  };
  return api;
}
