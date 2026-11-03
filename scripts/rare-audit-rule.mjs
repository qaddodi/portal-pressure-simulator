// ── Which tags are fake (the rule the unit test holds the source to, tests/rare-tags-audited.test.js) ──
// An allocation is not rare when, in the last round of a motion, it ran in many of that motion's display frames (a per-frame cost), or in more
// than one display frame of the idle figure. One that ran many times in one or two frames is a burst at a gesture's start (every top-bar icon
// beginning its fade): a key change, which the tag claims, and is left alone.
export function isFake(hot, frameHits, frames) {
  for (const [m, c] of Object.entries(hot)) {
    const fh = frameHits?.[m] ?? c, F = frames?.[m] || 0;
    if (m === 'idle' ? c >= 2 && fh >= 2 : c >= 4 && fh >= Math.max(3, Math.ceil(0.5 * F))) return true;
  }
  return false;
}
