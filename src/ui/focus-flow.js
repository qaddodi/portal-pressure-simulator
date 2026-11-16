// One way focus goes into a popover, sheet or card when it opens, and comes back when it closes (play-test C5, 16 Nov 2026).
// Before, each surface did it its own way: a menu opened with the mouse left focus on its button (the keyboard then started
// from the button, behind the menu), and a card closed with Esc handed focus to "what opened it", which a click on the figure
// never recorded, so focus fell to the page (document.body) and the next Tab began at the top of the app.
//
//   focusIn(el, { keyboard })  focus goes into el when it opens. From the keyboard: the first control, so Tab and the arrows work
//                              at once. From a mouse or a finger: el itself (tabindex -1), so the keys reach the surface without a
//                              field raising a keyboard or a ring appearing on a control nobody pressed (focus-ring.js shows none
//                              for focus that did not come from a key).
//   focusBack(from, to, fallback)  focus goes back to `to` (the control that opened el) when it is inside `from` or nowhere (the
//                              page). Where `to` is gone it goes to `fallback`, and failing that to the figure: never to the page.
//                              Focus the person has already moved elsewhere is left where it is.
const NO_SCROLL = Object.freeze({ preventScroll: true });
const FIRST = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

export function focusIn(el, { keyboard = false } = {}) {
  if (!el?.isConnected) return;
  if (keyboard) { const first = el.querySelector(FIRST); if (first) { first.focus(NO_SCROLL); return; } }
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
  el.focus(NO_SCROLL);
}

/** True when focus is nowhere in particular: on the page itself, or on nothing. */
export const focusAdrift = () => { const a = document.activeElement; return !a || a === document.body || a === document.documentElement; };

export function focusBack(from, to, fallback = null) {
  const a = document.activeElement;
  if (!focusAdrift() && !from?.contains(a)) return false;   // (focus is on something else the person chose: it stays)
  for (const t of [to, fallback, document.getElementById('stage')]) {
    if (t?.isConnected && !t.closest?.('[inert], [hidden]') && !from?.contains(t)) { if (t.id === 'stage' && !t.hasAttribute('tabindex')) t.tabIndex = -1; t.focus(NO_SCROLL); return document.activeElement === t; }
  }
  return false;
}
