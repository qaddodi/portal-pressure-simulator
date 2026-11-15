// A bottom sheet over the on-screen keyboard (iPhone, and an iPad held upright).
//
// iOS Safari does not shrink the page when the keyboard comes up: the layout viewport keeps its height and the keyboard is drawn over its foot, so a
// sheet that rests on the page's foot has its lower rows (and any field in them) UNDER the keyboard, and the sheet's own scroll cannot bring them
// up (15 Nov 2026, Mohammad: "I'm trying to input RA pressure but the keyboard hides it", From readings, iPhone). The main menu's sheet, the
// search card and the dialogs each had their own fit to the visual viewport (menu.js fitSheet, palette.js fitList, util.js fitModal); a plain popover
// sheet had none, and every field put in one would have the same bug. This is that one fit, made once in util.js popover for every sheet, so a field in
// a sheet needs nothing of its own:
//   - while the keyboard is up (the visual viewport is shorter than the window by 80 px or more, at the page's own scale) the sheet is lifted to rest on
//     the keyboard (--sheet-kb) and held to the room above it (--sheet-room): data-kb on the sheet, app-02-controls.css;
//   - the field the person is in is scrolled into the sheet's visible part (scroll-padding on the sheet keeps it clear of a sticky foot);
//   - the lift is eased by transform from where the sheet stood, as the other sheets' are; nothing laid out is eased.
// Event-driven: it follows the visual viewport's resize and scroll and a field's focus; nothing runs per frame, and the sheet's top is read between
// frames (rest-pass.js), never in the event.

import { restPass, cancelRest } from './rest-pass.js';
import { readMetric, scrollInto } from './layout-snap.js';
import { reduceMotionMQ } from './motion.js';
import { D_SMALL, EASE_MOVE } from './ease.js';

/** The keyboard's height in px: how far the visual viewport's bottom is above the window's (0 when none, or when the page is pinched in). */
export function keyboardHeight(vv = window.visualViewport, inner = innerHeight) {
  if (!vv || vv.scale > 1.05) return 0;
  const { offsetTop: top, height } = vv;   // (the visual viewport's own numbers, not an element's layout)
  const kb = Math.round(inner - top - height);
  return kb > 80 ? kb : 0;
}
/** A field a keyboard types into. */
export const isTextField = (n) => !!n && n.nodeType === 1 && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|file|color|hidden)$/.test(n.type)) || n.isContentEditable === true);

/**
 * Keep `el` (a bottom sheet) above the keyboard. Returns { fit(), off() }: fit() runs the fit at once (a field focused, the sheet opened with
 * the keyboard already up); off() ends it and leaves no variable behind.
 */
export function keyboardSheet(el) {
  const vv = window.visualViewport;
  let ask = 0, top = null, shown = false;
  const run = () => {
    ask = 0;
    if (!el.isConnected) return;
    const kb = keyboardHeight(vv), was = top;
    if (kb) {
      // alloc-rare: the text is made when the keyboard moves (an event), not in a frame
      el.style.setProperty('--sheet-kb', `${kb}px`); el.style.setProperty('--sheet-room', `${Math.max(120, Math.round(vv.height - 16))}px`);
      if (!shown) { shown = true; el.dataset.kb = '1'; }
    } else if (shown) { shown = false; delete el.dataset.kb; el.style.removeProperty('--sheet-kb'); el.style.removeProperty('--sheet-room'); }
    // (The box took its new bottom and height at once; the move is eased by transform from where its top stood, the others' way: menu.js sheetLift.)
    const t = readMetric(el, 'offsetTop');
    top = t;
    if (was != null && Math.abs(was - t) >= 1 && !reduceMotionMQ.matches && el.animate) el.animate([{ transform: `translateY(${(was - t).toFixed(1)}px)` }, { transform: 'none' }], { duration: D_SMALL, easing: EASE_MOVE, composite: 'add' });   // alloc-rare: once per keyboard move
    // The field the person is in, brought into the sheet's visible part (nearest: nothing moves when it is already clear of the edges).
    const f = document.activeElement;
    if (kb && isTextField(f) && el.contains(f)) scrollInto(f, { block: 'nearest', behavior: reduceMotionMQ.matches ? 'auto' : 'smooth' });
  };
  const fit = () => { if (!ask) ask = restPass(run); };
  // (A focus asks for a fit too, and again once the keyboard has had time to come up: its resize event arrives after the focus.)
  let late = 0;
  const onFocus = (e) => { if (isTextField(e.target)) { fit(); clearTimeout(late); late = setTimeout(fit, 350); } };
  vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
  el.addEventListener('focusin', onFocus);
  top = null;
  fit();
  return {
    fit,
    off() {
      vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); el.removeEventListener('focusin', onFocus);
      clearTimeout(late); if (ask) cancelRest(ask);
      ask = 0; delete el.dataset.kb; el.style.removeProperty('--sheet-kb'); el.style.removeProperty('--sheet-room');
    },
  };
}
