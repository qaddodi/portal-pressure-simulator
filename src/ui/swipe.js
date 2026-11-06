// Presenter swipe: a quick, mostly sideways one-finger move anywhere on the slide goes on (left) or back (right).
// Pure helpers, so the rule is unit-tested without a browser.

import { restPass, cancelRest } from './rest-pass.js';

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
export function ownsSideways(el, { stop = null, cardSideways = false, scrollers = true } = {}) {
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    if (n.matches?.(OWN_DRAG)) return true;
    if (cardSideways && n.matches?.('.pz-data')) return true;
    // (`scrollers: false`, the Tests card: nothing in it scrolls sideways (Mohammad, 6 Nov), so a sideways drag from a table, a row of chips or
    // a pane that runs a little wide is always the swipe to the next test, never the browser's scroll.)
    if (scrollers && n.scrollWidth > n.clientWidth + 1) {
      const ox = n.ownerDocument?.defaultView?.getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

// A swipe up or down anywhere else on an upright slide (the figure, the teaching card) works the data card as its handle does
// (Mohammad, 21 Oct: "Swiping down or up anywhere on the slide should trigger as if I'm holding the handle"). It counts once it
// is clearly up or down; a move that goes sideways first is left to the slide swipe.
export const CARD_SWIPE_MIN = 10;     // px up or down before it counts
export const CARD_SWIPE_RATIO = 1.5;  // up or down must beat sideways by this much

/** +1 once a move is a clear swipe up or down, -1 once it is clearly something else (sideways or diagonal), 0 while undecided. */
export function cardSwipe(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return -1;
  if (ay >= CARD_SWIPE_MIN && ay > CARD_SWIPE_RATIO * ax) return 1;
  if (ax >= CARD_SWIPE_MIN || ay >= CARD_SWIPE_MIN * 3) return -1;
  return 0;
}

// Controls that keep a touch for themselves: buttons, tabs, sliders, fields, links, and charts drawn on a canvas (their draggable points).
const OWN_TOUCH = 'button, a[href], input, select, textarea, label, canvas, [role="slider"], [role="tab"], [role="button"], [contenteditable=""], [contenteditable="true"], .range-wrap, .pz-jump, .pz-bar, .pz-case';

/** True when a touch that starts on `el` belongs to a control (or the slide list, the bar, the case card), so a swipe up or down
 *  from it never works the data card. */
export function ownsTouch(el, { stop = null } = {}) {
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) if (n.matches?.(OWN_TOUCH)) return true;
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
export const PAGE_BACK = 0.6;     // px/ms back the way it came, as the finger lifted, that springs it back

/** True when a sideways page drag of `dx` px over `ms` ms across a box `w` px wide goes on to the next tab; false springs back.
 *  v: the finger's speed as it lifted, px per ms, positive to the right (0 if not given): a quick flick at the end of a slow drag goes on
 *  (the whole drag's average had let it fall short), and one flung back the way it came springs back, however far it was pulled. */
export function pageGo(dx, ms, w, v = 0) {
  const a = Math.abs(dx);
  if (!Number.isFinite(a) || !(w > 0)) return false;
  const along = Number.isFinite(v) ? v * Math.sign(dx) : 0;
  if (along < -PAGE_BACK) return false;
  return a > w * PAGE_FAR || (a > PAGE_MIN && (a / Math.max(1, ms) > PAGE_V || along > PAGE_V));
}

// A trackpad (or a wheel) works the slide as a finger does (Mohammad, 22 Oct: "use the touch pad on the mac to move slides just like on ipad
// and to open the stack and close it (scroll up opens it anywhere ..., scroll down closes it, scroll right and left move slides/throws
// away case card)"). A gesture is a run of wheel events with no more than WHEEL_QUIET ms between them, the tail of a trackpad's glide
// after the fingers lift included (a flick's momentum runs a second or more, with an odd zero or a bump in it). It locks to one axis and
// acts once; then it is spent until the stream goes quiet, whatever the tail does (Mohammad, 22 Oct: "swiping sideways on mac is moving
// multiple slides"). Only fingers turned clearly back the other way, in one unbroken run, start the next action inside it.
export const WHEEL_X = 80;        // px of fingers moving sideways before it moves a slide
export const WHEEL_Y = 30;        // px of fingers moving up or down before it opens or closes the stack
export const WHEEL_QUIET = 250;   // ms without a wheel event ends a gesture (a slow frame must not split a glide)

/** The fingers' own movement, positive to the right and down, from a wheel event's deltas. A trackpad on Mac reports the page's movement,
 *  the opposite of the fingers' when natural scrolling is on (webkitDirectionInvertedFromDevice; assumed on where a browser does not say). */
// (Answered in one kept pair, read by its caller as it is returned: a wheel's events come dozens a second.)
const FINGER = [0, 0];
export function wheelFinger(dx, dy, mode = 0, inverted = true, page = 800) {
  const m = mode === 1 ? 16 : mode === 2 ? page : 1, sg = inverted === false ? 1 : -1;
  FINGER[0] = sg * dx * m; FINGER[1] = sg * dy * m;
  return FINGER;
}

/** Takes one wheel event's finger movement (fx, fy) at time `now` (the event's own time stamp, so a busy frame does not stretch a gap);
 *  gives the gesture so far and what it did: act is null while undecided or spent, else { axis: 'x' | 'y', dir: +1 | -1 } with dir the
 *  fingers' direction (right / down positive). */
// (What a gesture does, as four fixed answers: the act handed to a rest pass is never written over by the next wheel event. The result is one kept
// { g, act }, read by its caller as it is returned; the gesture `g` is written in place event after event, and a new one is made only when a gesture begins.)
const ACT = { xp: Object.freeze({ axis: 'x', dir: 1 }), xn: Object.freeze({ axis: 'x', dir: -1 }), yp: Object.freeze({ axis: 'y', dir: 1 }), yn: Object.freeze({ axis: 'y', dir: -1 }) };
const actOf = (axis, dir) => (axis === 'x' ? (dir > 0 ? ACT.xp : ACT.xn) : dir > 0 ? ACT.yp : ACT.yn);
const WHEEL_OUT = { g: null, act: null };
const out = (g, act) => { WHEEL_OUT.g = g; WHEEL_OUT.act = act; return WHEEL_OUT; };
export function wheelGesture(g, fx, fy, now) {
  let s;
  if (g && now - g.t <= WHEEL_QUIET) { s = g; s.t = Math.max(g.t, now); }   // (a stamp a hair out of order is not a gap)
  else s = { x: 0, y: 0, lock: '', spent: false, dir: 0, back: 0, t: now };   // alloc-rare: once per gesture, a run of wheel events, not per event
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return out(s, null);
  if (s.spent) {
    // (The glide after an action never acts again, however it jitters: a momentum tail does not turn back, so only an unbroken run of
    // movement the other way, as far as a fresh gesture needs, is the fingers' own.)
    const along = s.lock === 'x' ? fx : fy;
    if (along !== 0) s.back = Math.sign(along) === -s.dir ? s.back + Math.abs(along) : 0;
    if (s.back < (s.lock === 'x' ? WHEEL_X : WHEEL_Y)) return out(s, null);
    s.dir = -s.dir; s.back = 0;
    return out(s, actOf(s.lock, s.dir));
  }
  s.x += fx; s.y += fy;
  const ax = Math.abs(s.x), ay = Math.abs(s.y);
  if (!s.lock) {
    if (ax + ay >= 10) s.lock = ax > 1.5 * ay ? 'x' : ay > 1.5 * ax ? 'y' : ax + ay >= 80 ? (ax >= ay ? 'x' : 'y') : '';
  }
  if (s.lock === 'x' && ax >= WHEEL_X) { s.spent = true; s.dir = Math.sign(s.x); return out(s, actOf('x', s.dir)); }
  if (s.lock === 'y' && ay >= WHEEL_Y) { s.spent = true; s.dir = Math.sign(s.y); return out(s, actOf('y', s.dir)); }
  return out(s, null);
}

/** Which ways the boxes under `el` scroll themselves (up to `stop`): { x, y }, true for an axis a box there keeps its wheel on (the slide
 *  list, a field, or a box overflowing that way). It reads the layout, so it runs as a rest pass, never in a wheel event (ownsWheel). */
export function wheelScrollers(el, { stop = null } = {}) {
  const r = { x: false, y: false };
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    if (n.matches?.('.pz-jump, textarea, select')) { r.x = r.y = true; return r; }
    const cs = n.ownerDocument?.defaultView?.getComputedStyle(n);
    if (!cs) continue;
    if (!r.y && n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(cs.overflowY)) r.y = true;
    if (!r.x && n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(cs.overflowX)) r.x = true;
    if (r.x && r.y) return r;
  }
  return r;
}
// What is under the pointer, read between frames: as the pointer comes over a box (pointerover), again as a glide goes on (at most every
// WHEEL_FRESH ms) and when the wheel finds a box not yet read. The wheel's events, dozens a second, read only this.
const WHEEL_FRESH = 250;
let owned = null, ownAsk = 0, ownWatch = null;
let ownEl = null, ownStop = null;
const OWNED = { el: null, stop: null, at: 0, x: false, y: false };
// (Read between frames, as a kept function: the wheel's events ask for it with no closure made. The answer is written into one kept object.)
function ownRun() {
  ownAsk = 0;
  const w = wheelScrollers(ownEl, { stop: ownStop });
  OWNED.el = ownEl; OWNED.stop = ownStop; OWNED.at = performance.now(); OWNED.x = w.x; OWNED.y = w.y;
  owned = OWNED;
}
function readOwners(el, stop) {
  ownEl = el; ownStop = stop;
  if (ownAsk) return;
  ownAsk = restPass(ownRun);
}
const onOwnerOver = (e) => { if (e.target?.nodeType === 1) { cancelRest(ownAsk); ownAsk = 0; readOwners(e.target, ownDefaultStop); } };
let ownDefaultStop = null;
const OWN_OPTS = { passive: true, capture: true };
/** True when a wheel over `el` belongs to a box that scrolls that way itself (wheelScrollers, as last read between frames). A box not yet
 *  read answers by what it is (the slide list or a field) until its read comes in, right after this event. */
export function ownsWheel(el, axis, opts = null) {
  const stop = opts ? opts.stop ?? null : null, doc = el?.ownerDocument;
  if (doc?.addEventListener && ownWatch !== doc) { ownWatch?.removeEventListener('pointerover', onOwnerOver, OWN_OPTS); ownWatch = doc; doc.addEventListener('pointerover', onOwnerOver, OWN_OPTS); }
  ownDefaultStop = stop;
  if (owned?.el === el && owned.stop === stop) {
    if (performance.now() - owned.at > WHEEL_FRESH) readOwners(el, stop);
    return owned[axis === 'y' ? 'y' : 'x'];
  }
  readOwners(el, stop);
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) if (n.matches?.('.pz-jump, textarea, select')) return true;
  return false;
}
