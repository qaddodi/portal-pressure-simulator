// How far each leader's end stands from its caption's box, as the GPU drew them (R17 caption half): the caption snapshot's boxes
// (label-captions.js snapshot) and the leaders' ends (stage.lobuleLeaderEnds), both in the layer's px with its view applied.
// Pure, so a unit test can run it: tests/leader-gap.test.js.

/** Distance from the point (x, y) to the box { x, y, w, h }: 0 inside it. */
export function gapToBox(b, x, y) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** [{ key, gap }] for each leader end whose caption is in the snapshot, and the keys of the ends with no caption drawn (those are not judged). */
export function leaderGaps(snapshot, ends) {
  const by = new Map((snapshot?.items || []).map((i) => [i.key, i]));
  const gaps = [], missing = [];
  for (const e of ends || []) {
    const b = by.get(e.key);
    if (!b || !(b.a > 0.5)) { missing.push(e.key); continue; }
    // (A caption of lines of unequal width is judged against its lines' own boxes, each as wide as its letters: a leader on the corner of the
    // box the longer line makes, a dozen pixels from its word, is detached, though it touches the box.)
    const boxes = b.rows?.length ? b.rows : [b];
    gaps.push({ key: e.key, gap: Math.min(...boxes.map((q) => gapToBox(q, e.x, e.y))) });
  }
  return { gaps, missing };
}
