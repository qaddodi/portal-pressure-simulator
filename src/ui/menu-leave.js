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
import { D_FLIP, D_SMALL, EASE_IN, easeArrive } from './ease.js';


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
const sheetish = (el) => el.classList.contains('as-sheet') || (el.classList.contains('from-dock') && document.documentElement.classList.contains('thumb-ui'));
const timeOut = (el, name) => (name === 'scale-settle' ? (sheetish(el) ? D_SMALL : D_FLIP) : name === 'crossfade' ? (el.classList.contains('um-scrim') ? D_SMALL : D_FLIP) : el.classList.contains('umenu') || sheetish(el) ? D_SMALL : D_FLIP);
const f4 = (v) => +v.toFixed(4);   // alloc-rare: a menu put away while its entrance still runs (a tap away), never per frame

// The look now and the exit's end, for the entrance's eased progress k (0 = its from, 1 = at rest).
// (Each kind's two keyframes are kept and written in place: animate() takes a copy of them, and each kind always sets the same properties.)
const KF_SCALE = [{ opacity: 0 }, { opacity: 0 }];   // (a settle is a fade: app.css scale-settle has no scale since 2 Nov 2026)
const KF_FADE = [{ opacity: 0 }, { opacity: 0 }];
const O_EDGE = 'var(--edge-o, 1)';
const KF_EDGE = [{ opacity: '', transform: '' }, { opacity: O_EDGE, transform: 'translate(var(--edge-x, 0px), var(--edge-y, 0px))' }];
const ANIM = { duration: 0, easing: EASE_IN, fill: 'forwards' };
let lastExit = null;   // (the exit last played from where a menu had got to: a plate laid under the menu, plate-gl.js, plays the same)
/** Plays the exit just played on a menu (leaveFromHere answered true) on `other` too, from the same look over the same time and curve. */
export function replayExit(other) { if (lastExit && other.animate) other.animate(lastExit, ANIM); }
function looks(name, k) {
  if (name === 'scale-settle') { KF_SCALE[0].opacity = f4(k); return KF_SCALE; }
  if (name === 'crossfade') { KF_FADE[0].opacity = f4(k); return KF_FADE; }
  // slide-from-edge: from (--edge-o, translate(--edge-x, --edge-y)) to rest; the custom properties are the element's own.
  const j = f4(1 - k);
  KF_EDGE[0].opacity = `calc(${O_EDGE} + (1 - ${O_EDGE}) * ${f4(k)})`;   // alloc-rare: a menu put away while its entrance still runs, never per frame
  KF_EDGE[0].transform = `translate(calc(var(--edge-x, 0px) * ${j}), calc(var(--edge-y, 0px) * ${j}))`;   // alloc-rare: a menu put away while its entrance still runs, never per frame
  return KF_EDGE;
}

/**
 * Runs `leave()` (which sets the element's leaving class) and, when the element was still coming in, plays its exit from the
 * look it had at that moment. Returns true when it did.
 */
export function leaveFromHere(el, leave) {
  const rec = started.get(el);
  if (!rec || typeof el.animate !== 'function') { leave(); return false; }
  const x = (performance.now() - rec.t) / timeIn(el, rec.name);
  if (x >= 1) { leave(); return false; }   // (it had finished coming in)
  const kf = looks(rec.name, easeArrive(Math.max(0, x)));
  leave();
  ANIM.duration = timeOut(el, rec.name);
  el.animate(kf, ANIM);
  lastExit = kf;
  return true;
}
