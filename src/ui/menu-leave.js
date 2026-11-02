// A menu or popover put away while it is still coming in leaves from where it had got to (sprint 1 Nov, menu open/close).
// The exit keyframes (app.css scale-settle-out, slide-to-edge, thumbOut, crossfade-out) name only where they end, so they start
// from the menu's resting look: closed 60 ms into its 120 ms entrance (a second tap on its button, a tap away, Esc), the menu
// jumped to full opacity and full size for a frame and only then faded, a pop. Here the look it has at that instant is worked out
// and the exit is played from it to the same end, over the same time and curve.
//
// Nothing is read from the page (2 Nov 2026, off-GPU plan: no layout read in a motion path). The entrance is a CSS animation of
// known keyframes, time and curve (app.css), so its look at any moment is arithmetic: the moment it began is kept from the browser's
// own animationstart event, and its progress now is (now - start - delay) / duration, eased by the same cubic-bezier.
//
//   - Only while an entrance is running. A menu that had finished coming in leaves exactly as it did; this file changes nothing there.
//   - The exit is the stylesheet's own (its class is set first); ours is played over it, from the look to the same end, on the same
//     time and curve, and holds the end (the stylesheet's keeps running underneath to the same end).
//   - Reduce Motion: the entrance the page runs is the opacity-only one, named so by the event, and the exit follows it.
import { D_FLIP, D_SMALL, EASE_IN, easeArrive } from './ease.js?v=dc92422977';


// What leaves through here: the popover menu (and its sheet), the main menu and its sheet and scrim, the "why" card.
const MENUS = ['menu', 'umenu', 'um-scrim', 'why-pop'];
const started = new WeakMap();   // element → { name, t } (when its entrance began, performance.now() time)
const onStart = (e) => {
  const el = e.target, n = e.animationName;
  if (n !== 'scale-settle' && n !== 'slide-from-edge' && n !== 'crossfade') return;
  if (!el.classList || !MENUS.some((c) => el.classList.contains(c))) return;
  started.set(el, { name: n, t: e.timeStamp });
};
if (typeof addEventListener === 'function') addEventListener('animationstart', onStart, { capture: true, passive: true });

// The entrance's time (app.css: .menu, .umenu, .why-pop scale-settle on --d-flip; the dock's menu on --d-small after --enter-delay;
// the sheets' slide-from-edge and the scrim's crossfade on --d-small; all on --ease) and the exit's (scale-settle-out and
// crossfade-out as the menu's, slide-to-edge --d-flip, the main menu's sheet and scrim --d-small), in ms.
const timeIn = (el, name) => (name === 'scale-settle' ? (el.classList.contains('from-dock') ? D_SMALL : D_FLIP) : D_SMALL);
const timeOut = (el, name) => (name === 'scale-settle' ? D_FLIP : name === 'crossfade' ? (el.classList.contains('um-scrim') ? D_SMALL : D_FLIP) : el.classList.contains('umenu') ? D_SMALL : D_FLIP);
const delayOf = (el) => (el.classList.contains('from-dock') ? parseFloat(el.style.getPropertyValue('--enter-delay')) || 0 : 0);
const f4 = (v) => +v.toFixed(4);

// The look now and the exit's end, for the entrance's eased progress k (0 = its from, 1 = at rest).
function looks(name, k) {
  if (name === 'scale-settle') return [{ opacity: f4(k), scale: f4(0.98 + 0.02 * k) }, { opacity: 0, scale: 0.98 }];   // (the separate scale property, as the keyframes: a menu placed by translate keeps its place)
  if (name === 'crossfade') return [{ opacity: f4(k) }, { opacity: 0 }];
  // slide-from-edge: from (--edge-o, translate(--edge-x, --edge-y)) to rest; the custom properties are the element's own.
  const j = f4(1 - k), o = 'var(--edge-o, 1)';
  return [{ opacity: `calc(${o} + (1 - ${o}) * ${f4(k)})`, transform: `translate(calc(var(--edge-x, 0px) * ${j}), calc(var(--edge-y, 0px) * ${j}))` },
    { opacity: o, transform: 'translate(var(--edge-x, 0px), var(--edge-y, 0px))' }];
}

/**
 * Runs `leave()` (which sets the element's leaving class) and, when the element was still coming in, plays its exit from the
 * look it had at that moment. Returns true when it did.
 */
export function leaveFromHere(el, leave) {
  const rec = started.get(el);
  if (!rec || typeof el.animate !== 'function') { leave(); return false; }
  const x = (performance.now() - rec.t - delayOf(el)) / timeIn(el, rec.name);
  if (x >= 1) { leave(); return false; }   // (it had finished coming in)
  const [a, b] = looks(rec.name, easeArrive(Math.max(0, x)));
  leave();
  el.animate([a, b], { duration: timeOut(el, rec.name), easing: EASE_IN, fill: 'forwards' });
  return true;
}
