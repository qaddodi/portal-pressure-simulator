// A view that is replaced by another in a card goes out by a fade where it stood, never at once (17 Nov 2026, Mohammad's play-test of Tests › IR: the old view was
// gone the moment the stylesheet hid it and the new one was still rising from nothing, so the card was blank for a beat; the same as the stent tray's tiles).
// The stylesheet hides a view by display, which cannot fade, so before the change is made the view's parts are lifted, as they are (the very elements, their GPU
// pictures with them), into a ghost that stands where they stood and takes no room (its height is cancelled by a negative margin); it fades, and the parts go
// back to the places kept for them when it has. The ghost is a plain column with the parent's gap: the parts' own rules (flex, size) are theirs.

import { h } from './util.js';
import { readBox, readStyle } from './layout-snap.js';
import { D_SMALL, EASE_ARRIVE } from './ease.js';
import { reduced } from './motion.js';

const NONE = { start() {}, end() {} };
const live = new WeakMap();   // (the ghost now fading in a parent: a new change ends it at once, the parts back where they were)

/** leaveFade(nodes, before): take the visible `nodes` (one parent) out of the way of what is about to show, to fade where they stood. Call before the change
 *  that hides them; `before` is the element the incoming view's first part is (the ghost is laid in its place in the column; null: at the column's start).
 *  Returns { start(), end() }: start() fades the ghost (after the change), end() puts the parts back at once. */
export function leaveFade(nodes, before = null, { duration = D_SMALL * 0.6 } = {}) {
  const parent = (nodes.find((n) => n?.parentElement) || {}).parentElement;
  if (!parent) return NONE;
  live.get(parent)?.end();
  if (reduced() || !parent.animate) return NONE;
  const shown = nodes.filter((n) => { const b = n?.parentElement === parent && readBox(n); return b && b.width > 0 && b.height > 0; });
  if (!shown.length) return NONE;
  const first = readBox(shown[0]), last = readBox(shown[shown.length - 1]);
  const H = last.bottom - first.top, gap = parseFloat(readStyle(parent).rowGap) || 0;
  const ghost = h('div', { class: 'lf-ghost', 'aria-hidden': 'true' });
  ghost.inert = true;
  ghost.style.cssText = `height:${H.toFixed(1)}px;margin-bottom:${(-(H + gap)).toFixed(1)}px;gap:${gap}px`;
  const kept = shown.map((n) => { const ph = document.createComment(''); n.replaceWith(ph); return [n, ph]; });
  for (const [n] of kept) ghost.append(n);
  if (before && before.parentElement === parent) before.before(ghost); else parent.prepend(ghost);
  let anim = null, over = false;
  const end = () => {
    if (over) return;
    over = true; live.delete(parent); anim?.cancel();
    for (const [n, ph] of kept) ph.replaceWith(n);
    ghost.remove();
  };
  const handle = {
    start() { if (over) return; anim = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: EASE_ARRIVE, fill: 'forwards' }); anim.finished.then(end, end); },
    end,
  };
  live.set(parent, handle);
  return handle;
}
