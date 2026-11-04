// Label pose (labels-plan.md, step 2). One formula for where a label stands, computed every frame, never stored as a result:
//
//   drawn = C · (CTM · anchor(t)) + offset(t)
//
// anchor is the world point the label names (lerped between the two views' anchors by t while the figure morphs), CTM is the matrix the figure draws with in
// this frame, C is the scene camera of a card zoom (identity otherwise) and the offset is in screen px, so a label keeps its screen size on every zoom.
// Matrices are 6-number [a, b, c, d, e, f] (x' = a x + c y + e, y' = b x + d y + f). Pure: no DOM, no GL, no allocation when `out` is given.

export const IDENTITY6 = Object.freeze([1, 0, 0, 1, 0, 0]);

const mix = (a, b, t) => a + (b - a) * t;

// The label's origin (its anchor's place and its offset) into out[0], out[1]. anchorB/offB may be null (not morphing: t is ignored).
// `fixed`: a label that belongs to the screen (a legend, a card's) is its offset alone.
export function poseInto(out, ctm6, anchorA, anchorB, t, offA, offB, cam6 = IDENTITY6, fixed = false) {
  if (fixed) { out[0] = offA[0]; out[1] = offA[1]; return out; }
  const u = anchorB ? t : 0;
  const ax = anchorB ? mix(anchorA[0], anchorB[0], u) : anchorA[0], ay = anchorB ? mix(anchorA[1], anchorB[1], u) : anchorA[1];
  const px = ctm6[0] * ax + ctm6[2] * ay + ctm6[4], py = ctm6[1] * ax + ctm6[3] * ay + ctm6[5];
  const ox = offB ? mix(offA[0], offB[0], t) : offA[0], oy = offB ? mix(offA[1], offB[1], t) : offA[1];
  out[0] = cam6[0] * px + cam6[2] * py + cam6[4] + ox;
  out[1] = cam6[1] * px + cam6[3] * py + cam6[5] + oy;
  return out;
}

// The anchor's place on screen (the label's dot) into out: C · CTM · anchor(t).
export function dotInto(out, ctm6, anchorA, anchorB, t, cam6 = IDENTITY6) {
  const u = anchorB ? t : 0;
  const ax = anchorB ? mix(anchorA[0], anchorB[0], u) : anchorA[0], ay = anchorB ? mix(anchorA[1], anchorB[1], u) : anchorA[1];
  const px = ctm6[0] * ax + ctm6[2] * ay + ctm6[4], py = ctm6[1] * ax + ctm6[3] * ay + ctm6[5];
  out[0] = cam6[0] * px + cam6[2] * py + cam6[4];
  out[1] = cam6[1] * px + cam6[3] * py + cam6[5];
  return out;
}

// Where a leader from (dx, dy) meets the edge of the box (x, y, w, h): the point of the box's edge on the line to its centre. Inside the box: the dot.
export function leaderEndInto(out, dx, dy, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2, vx = dx - cx, vy = dy - cy;
  if (Math.abs(vx) <= w / 2 && Math.abs(vy) <= h / 2) { out[0] = dx; out[1] = dy; return out; }
  const s = Math.min(vx ? (w / 2) / Math.abs(vx) : Infinity, vy ? (h / 2) / Math.abs(vy) : Infinity);
  out[0] = cx + vx * s; out[1] = cy + vy * s;
  return out;
}
