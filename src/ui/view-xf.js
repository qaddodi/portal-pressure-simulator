// The crossfade between the two views' labels through the change between the views, from the change's own progress (view-switch-labels-recs.md,
// option B2): never from a timer, and never a frame with no labels on the figure.
//
//   p       the change's eased progress, 0 at the tap to 1 as the figure lands
//   landAt  the progress at which the new view's labels were whole: 0 when they were solved ahead (found at the tap), the frame the solve
//           landed when it ran through the change, null while it is still running
//
// Writes { o, n } into `out` (a kept record: a frame of the change makes nothing) and returns it: the old view's ghosts at o, the new view's labels at n.
//   - still solving: the ghosts at full, the new labels at nothing (the old names ride the figure until the new ones exist);
//   - whole by the half: the two cross over the second half, as the figure's own progress (1 - 2p, 2p - 1);
//   - whole after the half: they cross over what is left of the change from that frame, so the new labels are whole as the figure lands;
//   - whole once the figure has landed (landAt >= 1): the swap is this frame.
export function viewXfMix(p, landAt, out = { o: 1, n: 0 }) {
  let n;
  if (landAt == null) n = 0;
  else if (landAt >= 1) n = 1;
  else { const from = landAt > 0.5 ? landAt : 0.5; n = (p - from) / (1 - from); n = n < 0 ? 0 : n > 1 ? 1 : n; }
  out.o = 1 - n; out.n = n;
  return out;
}

// ── The change's clock, shared (animation review, push B) ──────────────────────────────────────────────────────────────────────────────────

/** How long the change between Anatomy and Circuit takes, seconds (0.6 until 6 Nov 2026; Mohammad: "Make the morph slower its way too fast").
 *  The camera rides the same clock (viewXfP); the fallback camera glide in setView takes the same time; the presenter waits for it (stage.viewChanging). */
export const VIEW_CHANGE_S = 1.3;
export const VIEW_CHANGE_MS = VIEW_CHANGE_S * 1000;

/** When the change lands, ms from now: the share of the way still to go, on its one clock (the morph steps at a steady dt / VIEW_CHANGE_S). */
export const viewXfLeftMs = (morph, target, ms = VIEW_CHANGE_MS) => Math.abs(target - morph) * ms;

const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The camera's share of the way from x.from to x.to at the change's progress p. A framing asked for during the change (viewXfRetarget)
 * becomes its new end: the camera sets out again from where it stands then (x.p0 is the progress it had), on the same clock, to arrive as
 * the change lands. p0 is 0 until then.
 */
export function viewXfCamU(x, p) {
  const p0 = x.p0 || 0;
  if (p >= 1 || p0 >= 1) return 1;
  return cl01((p - p0) / (1 - p0));
}

/**
 * A framing asked for while the change runs (a slide's, a Fit, a refit to cards that settled): the change's new end. The camera keeps
 * the place it has now (cur), so nothing jumps, and goes from there to `to` on the change's own clock, with no second glide.
 * Returns false when the change is not the camera's to move (none running, or a hand took the view): the caller glides as usual.
 * `same`: the camera has nowhere to go (the stage then leaves it alone and the change's landing sets nothing).
 */
export function viewXfRetarget(x, cur, to, p, same) {
  if (!x || x.hand) return false;
  x.from = { k: cur.k, x: cur.x, y: cur.y };
  x.to = { k: to.k, x: to.x, y: to.y };
  x.p0 = cl01(p);
  x.same = !!same;
  return true;
}

/** A hand on the view (a press, a wheel, a pinch) while the change runs: the camera is the hand's from here on, and the change's landing sets nothing
 *  (the figure still finishes its morph). */
export function viewXfDetach(x) {
  if (!x || x.hand) return;
  x.hand = true; x.same = true;
}
