// Presenter swipe: a quick, mostly sideways one-finger move anywhere on the slide goes on (left) or back (right).
// Pure helpers, so the rule is unit-tested without a browser.

export const SWIPE_MIN = 50;      // px of sideways travel
export const SWIPE_RATIO = 1.5;   // sideways must beat vertical by this much, so vertical scrolls and diagonals do not count
export const SWIPE_MAX_MS = 800;  // slower than this is a drag, not a swipe

/** +1 (next) for a swipe left, -1 (back) for a swipe right, 0 when the move is not a swipe. */
export function swipeDir(dx, dy, ms) {
  if (!(Math.abs(dx) >= SWIPE_MIN) || !(Math.abs(dx) > SWIPE_RATIO * Math.abs(dy)) || !(ms <= SWIPE_MAX_MS)) return 0;
  return dx < 0 ? 1 : -1;
}

const OWN_DRAG = 'input, select, textarea, [role="slider"], .pz-jump';   // controls that use sideways drags themselves

/** True when a touch that starts on `el` belongs to something else: a slider, the slide list, the card while it docks
 *  sideways, or any sideways-scrolling box (a wide table, the control bar) that actually overflows. */
export function ownsSideways(el, { stop = null, cardSideways = false } = {}) {
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    if (n.matches?.(OWN_DRAG)) return true;
    if (cardSideways && n.matches?.('.pz-data')) return true;
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = n.ownerDocument?.defaultView?.getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}
