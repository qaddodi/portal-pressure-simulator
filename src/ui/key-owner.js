// While a talk plays, a window-level handler turns Enter and Space into "next slide". A control the keyboard has reached with
// Tab (the pill's buttons, a Settings row, a summary-table row) keeps those two keys for itself; after a mouse click the control
// is focused but its focus ring is off (:focus-visible does not match), so a clicker's Space still moves on.

export const KEY_OWNERS = 'button, a[href], [role="button"], [role^="menuitem"], [role="tab"], [role="switch"], [tabindex="0"]';

/** True when the focused element should get this key itself instead of the talk. `digits`: a slide number is half typed, so Enter
 *  confirms it. */
export function controlOwnsKey(el, key, digits = '') {
  if (key !== 'Enter' && key !== ' ') return false;
  if (key === 'Enter' && digits) return false;
  return !!el?.matches?.(KEY_OWNERS) && !!el.matches(':focus-visible');
}
