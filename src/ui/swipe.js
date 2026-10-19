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

// The case card follows a finger sideways and flies off when let go far enough out or with a quick flick, either way.
export const FLING_FAR = 0.33;    // of the card's width: let go past this and it flies off
export const FLING_V = 0.45;      // px/ms: a flick this fast flies it off from a short drag
export const FLING_MIN = 24;      // px a flick must travel first, so a twitch on lift-off does not count

/** -1 (off to the left) or +1 (off to the right) when the card is let go at `dx` moving at `vx` px/ms; 0 springs it back.
 *  A card pulled far but being carried back toward the middle when let go springs back. */
export function caseFling(dx, vx, w) {
  if (!(w > 0) || !Number.isFinite(dx)) return 0;
  const s = Math.sign(dx), v = Number.isFinite(vx) ? vx : 0;
  if (!s) return 0;
  if (v * s <= -FLING_V * 0.6) return 0;
  if (Math.abs(dx) >= FLING_FAR * w) return s;
  if (Math.abs(dx) >= FLING_MIN && v * s >= FLING_V) return s;
  return 0;
}

/** How long (ms) a flung case card takes to travel the `left` px still to go at the finger's `vx` px/ms: long enough to be
 *  seen leaving and fading (a slow let-go never pops), short enough that a hard flick still feels thrown. */
export const FLIGHT_MIN = 380, FLIGHT_MAX = 600;
export function caseFlight(left, vx) {
  const v = Math.max(Math.abs(Number.isFinite(vx) ? vx : 0), 0.8);
  const t = (1.6 * left) / v;
  return Number.isFinite(t) ? Math.round(Math.min(FLIGHT_MAX, Math.max(FLIGHT_MIN, t))) : FLIGHT_MAX;
}

// Paging between tabs (the Tests card's tabs, the menu's Present and Patients): the open list follows the finger with the
// next one beside it, and on release it goes on when let go past this share of the width, or after a quick flick.
export const PAGE_FAR = 0.35;     // of the width
export const PAGE_V = 0.4;        // px/ms over the whole drag
export const PAGE_MIN = 40;       // px a flick must travel

/** True when a sideways page drag of `dx` px over `ms` ms across a box `w` px wide goes on to the next tab; false springs back. */
export function pageGo(dx, ms, w) {
  const a = Math.abs(dx);
  if (!Number.isFinite(a) || !(w > 0)) return false;
  return a > w * PAGE_FAR || (a > PAGE_MIN && a / Math.max(1, ms) > PAGE_V);
}
