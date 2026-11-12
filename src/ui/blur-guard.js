// No live CSS blur by itself on a software renderer or in Battery saver (reviewer's checklist, 1 Nov 2026, section 9: those paths
// "must not silently enable expensive CSS blurs"). On a software renderer the GPU glass is off (glass-gl.js), so every card, callout
// and pane fell back to the browser's backdrop blur, re-blurred over the moving figure each frame on the CPU the page needs; Battery
// saver is there to run cool. In both the page takes Settings › Blur effect off's look (html[data-noglass], app.css): solid cards and
// pills, no backdrop-filter anywhere. Marked data-noglass-auto, so it is taken back by itself when the renderer or the saver changes.
// A person who turned Blur effect on in Settings (pps.noGlass '0') keeps it: that is asked for, not silent. ?swblur=1 leaves it as before.

import { themeChanged } from './label-theme.js';

export const SW_BLUR = typeof location !== 'undefined' && /[?&]swblur=1\b/.test(location.search || '');

/** Settings › Blur effect at load (12 Nov 2026, Mohammad: "default on phone blur off"): off when it was stored off (pps.noGlass '1'), or on a
 *  phone that never chose (the default there, for heat); on when it was stored on ('0') or never chosen elsewhere. A chosen value is kept as it was.
 *  Sets html[data-noglass] (a person's choice, not data-noglass-auto) before the first card or glass is drawn. Returns whether the blur is off. */
export function blurAtLoad(root, { stored, phone }) {
  const off = stored === '1' || (stored == null && phone);
  if (off) root.setAttribute('data-noglass', '');
  return off;
}

/** Sets or takes back the automatic no-blur on `root` (document.documentElement): `low` is a software renderer or Battery saver,
 *  `asked` the stored Blur effect choice ('0' on, '1' off, null never chosen). Returns whether the page is without blur now. */
export function guardBlur(root, { low, asked, keep = SW_BLUR }) {
  const auto = root.hasAttribute('data-noglass-auto'), was = root.hasAttribute('data-noglass');
  if (low && !keep && asked !== '0') {
    if (!root.hasAttribute('data-noglass')) { root.setAttribute('data-noglass', ''); root.setAttribute('data-noglass-auto', ''); }
  } else if (auto) {
    root.removeAttribute('data-noglass-auto');
    if (asked !== '1') root.removeAttribute('data-noglass');
  }
  const now = root.hasAttribute('data-noglass');
  if (now !== was) themeChanged();   // (the labels drawn on the GPU take the glass's look: label-theme.js)
  return now;
}
