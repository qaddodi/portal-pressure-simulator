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
