// A menu or popover put away while it is still coming in leaves from where it had got to (sprint 1 Nov, menu open/close).
// The exit keyframes (app.css scale-settle-out, slide-to-edge, thumbOut, crossfade-out) name only where they end, so they start
// from the menu's resting look: closed 60 ms into its 120 ms entrance (a second tap on its button, a tap away, Esc), the menu
// jumped to full opacity and full size for a frame and only then faded, a pop. Here the look it has at that instant is read
// before the leaving class is set, and the exit is played from it to the same end, over the same time and curve.
//
//   - Only while an entrance is running. A menu that had finished coming in leaves exactly as it did; this file changes nothing there.
//   - It reads the exit's own end from the exit animation (the leaving class sets it), so the end and the timing stay the CSS's;
//     what the exit does not move (a sheet's opacity) is left alone.
//   - Reduce Motion: the exit is the opacity-only one app.css already swaps in; the same read and the same hand-over apply.
//   - ?menuleave=0: this file does nothing and menus leave as they did.

const ENTRANCES = new Set(['scale-settle', 'slide-from-edge', 'thumbIn', 'crossfade']);
const PROPS = ['opacity', 'transform', '--sink'];

/** ?menuleave=0 in a page's search string: menus (and the main menu's reopen and origin) behave as they did. */
export const menuLeaveOff = (search) => /[?&]menuleave=0\b/.test(String(search ?? ''));
const off = () => menuLeaveOff(typeof location === 'undefined' ? '' : location.search);

const read = (cs, p) => (p[0] === '-' ? cs.getPropertyValue(p) : cs[p]);

/**
 * Runs `leave()` (which sets the element's leaving class) and, when the element was still coming in, plays its exit from the
 * look it had at that moment. Returns true when it did.
 */
export function leaveFromHere(el, leave) {
  if (off() || typeof el.getAnimations !== 'function' || typeof el.animate !== 'function') { leave(); return false; }
  const coming = el.getAnimations().some((a) => ENTRANCES.has(a.animationName));
  let from = null;
  if (coming) { const cs = getComputedStyle(el); from = {}; for (const p of PROPS) from[p] = read(cs, p); }
  leave();
  if (!from) return false;
  // The exit the stylesheet just started: its end is read by playing it to its last moment once, then it is handed over.
  const out = el.getAnimations().find((a) => a.animationName && !ENTRANCES.has(a.animationName));
  if (!out) return false;
  const { duration, easing } = out.effect.getTiming();
  out.pause(); out.currentTime = duration;
  const cs = getComputedStyle(el), a = {}, b = {};
  for (const p of PROPS) { const end = read(cs, p); if (end !== from[p]) { a[p] = from[p]; b[p] = end; } }   // (only what the exit moves)
  if (!Object.keys(a).length) { out.currentTime = 0; out.play(); return false; }
  out.cancel();
  el.animate([a, b], { duration, easing, fill: 'forwards' });
  return true;
}
