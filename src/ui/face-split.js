// A pill's glass changing width on the compositor alone (1 Nov 2026, "move everything to GPU"). The view pill's face (pill-motion.js)
// used to animate its CSS width: a layout of the face on every frame of the fold. Here the
// face is drawn, for the length of the change, as two halves that only translate. Each half is a whole copy of the face (its fill,
// corners, ring and shadow, as computed), wide enough to reach past the middle, inside a box of its own that cuts it at a fixed seam
// between the two: the left copy carries the left edge, the right copy the right edge, and the straight run of the pill crosses the
// seam whole in both, so nothing shows there. The real face is hidden meanwhile (by its opacity), and shown again in the same task as
// the halves go, so no frame shows both or neither.
//
// The edges ease as the width did: a0 → a1 and b0 → b1 (the face's left and right edges in its parent's px) on the same timing, a
// translate being linear in the edge as the width was. Where the two edges come closer than the corners allow (a pill narrower than
// it is tall at some point), it returns null and the face takes its new width at once (the pills never are that narrow).
// (No off switch: the width animation it replaces is a layout every frame, which the off-GPU gate does not allow.)

export const FACE_SPLIT = true;
const PAD = 24;   // (room kept round each half for the face's own shadow)
const LOOK = ['backgroundColor', 'backgroundImage', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'boxShadow', 'borderTopStyle', 'borderTopWidth', 'borderTopColor', 'borderRightStyle', 'borderRightWidth', 'borderRightColor', 'borderBottomStyle',
  'borderBottomWidth', 'borderBottomColor', 'borderLeftStyle', 'borderLeftWidth', 'borderLeftColor', 'boxSizing', 'opacity'];

/** Where the seam can go: the middle of the span both edges leave covered, or null when that span is narrower than the two corners. */
export function seamOf({ a0, b0, a1, b1 }, r) {
  const lo = Math.max(a0, a1), hi = Math.min(b0, b1);
  if (!(hi - lo >= 2 * r + 2)) return null;
  return Math.round((lo + hi) / 2);
}

/** The two halves' boxes and their copies' moves (all in the parent's px): pure, for the tests. */
export function splitPlan(span, r) {
  const c = seamOf(span, r);
  if (c == null) return null;
  const { a0, b0, a1, b1 } = span, aMin = Math.min(a0, a1), bMax = Math.max(b0, b1), w = bMax - aMin;
  const lx = aMin - PAD, rx = c;
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  return {
    c, w,
    // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
    left: { x: lx, w: c - lx, tx0: a0 - lx, tx1: a1 - lx },
    // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
    right: { x: rx, w: bMax + PAD - rx, tx0: b0 - w - rx, tx1: b1 - w - rx },
  };
}

/**
 * Plays the face's change of span (its left and right edges a0 → a1, b0 → b1, in px from its parent's padding box) on the compositor. Returns the animation that hides the real face (the caller may name it, and
 * cancelling it ends the whole change at once), or null where it cannot (the caller animates the width).
 */
const live = new WeakMap();   // face → the change it is in (a new one ends it first)
export function splitFace(face, span, opt) {
  const par = face?.parentElement;
  live.get(face)?.cancel();
  if (!FACE_SPLIT || !par || !face.animate) return null;
  const cs = getComputedStyle(face), h = face.offsetHeight, top = face.offsetTop;
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  const r = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => parseFloat(cs[k]) || 0));
  const plan = h > 0 ? splitPlan(span, Math.min(r, h / 2)) : null;
  if (!plan) return null;
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  const look = {};
  for (const k of LOOK) look[k] = cs[k];
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  const boxes = [], moves = [];
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  for (const side of [plan.left, plan.right]) {
    const box = document.createElement('span');
    box.className = 'face-half';
    box.setAttribute('aria-hidden', 'true');
    box.dataset.ghost = '';   // (the top bar's glide never measures it, topbar-motion.js)
    // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
    Object.assign(box.style, { position: 'absolute', zIndex: cs.zIndex, left: `${side.x}px`, top: `${top - PAD}px`, width: `${side.w}px`, height: `${h + 2 * PAD}px`, overflow: 'hidden', pointerEvents: 'none', margin: '0', padding: '0' });
    const copy = document.createElement('span');
    // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
    Object.assign(copy.style, look, { position: 'absolute', left: '0', top: `${PAD}px`, width: `${plan.w}px`, height: `${h}px`, margin: '0', padding: '0', display: 'block', transform: `translateX(${side.tx0}px)` });
    box.append(copy);
    boxes.push(box);
    moves.push([copy, side]);
  }
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  face.after(...boxes);
  for (const [copy, side] of moves) copy.animate([{ transform: `translateX(${side.tx0}px)` }, { transform: `translateX(${side.tx1}px)` }], { ...opt, fill: 'forwards' });
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  const hide = face.animate([{ opacity: 0 }, { opacity: 0 }], { ...opt, fill: 'forwards' });
  let done = false;
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  const end = () => { if (done) return; done = true; for (const b of boxes) b.remove(); hide.cancel(); };
  // (Listeners, not onfinish: the caller may set its own.)
  hide.addEventListener('finish', end);
  hide.addEventListener('cancel', end);
  live.set(face, hide);
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  hide.addEventListener('cancel', () => { if (live.get(face) === hide) live.delete(face); });
  // alloc-rare: runs once per fold of the view pill (a change of view, from the store), which builds the two halves and their animations; no frame calls it
  hide.addEventListener('finish', () => { if (live.get(face) === hide) live.delete(face); });
  return hide;
}
