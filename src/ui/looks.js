// The page's looks (Settings > Appearance): Light, Soft, Dark, Navy, Black, and System (the device's own).
//
// A look is either a theme (light, soft, dark) or a palette, a variant of the dark theme. A palette keeps data-theme="dark" on the
// page and adds data-palette="navy" (or "black"). So every dark rule in styles/app.css, and every script that asks "is it dark"
// (the lobule and sinusoid views, the labels, the instruments), stays true for every dark look, and styles/tokens.css moves only
// the ground, surfaces, ink, lines and casing for a palette. System sets neither attribute: the device's own light or dark decides.
//
// This file is the one place that knows which look sets which attributes. It has no DOM of its own to build (look-chooser.js draws the
// Settings control), so it loads anywhere and the tests can run it.

import { themeChanged } from './label-theme.js';

/** The looks in the order Settings shows them. `theme`: the data-theme the page takes. `palette`: the data-palette, if any. */
export const LOOKS = [
  { id: 'light', name: 'Light', theme: 'light' },
  { id: 'soft', name: 'Soft', theme: 'soft' },
  { id: 'dark', name: 'Dark', theme: 'dark' },
  { id: 'navy', name: 'Navy', theme: 'dark', palette: 'navy' },
  { id: 'black', name: 'Black', theme: 'dark', palette: 'black' },
];

/** What a saved look (localStorage pps.theme) or a pick is, or null for System, an unknown value or nothing. */
export const knownLook = (id) => (LOOKS.some((l) => l.id === id) ? id : null);

/** Does this look make the page dark (Dark, Navy, Black)? */
export const isDarkLook = (id) => LOOKS.find((l) => l.id === id)?.theme === 'dark';

/** The look the page wears now, from its two attributes; null when it follows the device (System). */
export function currentLook(root = document.documentElement) {
  return knownLook(root.getAttribute('data-palette')) || knownLook(root.getAttribute('data-theme'));
}

// The dark look last worn, so the quick light / dark switch (the command palette's "Light / dark theme") comes back to Navy when
// Navy was the dark look, not always to Dark.
let lastDark = 'dark';
/** The dark look the quick switch goes to. */
export const lastDarkLook = () => lastDark;

/** Put a look on the page: its attributes (an unknown id, or null, is System: neither attribute). Both change in one task, so
 *  every observer of the page sees the pair together. */
export function applyLookAttrs(root, id) {
  const look = LOOKS.find((l) => l.id === id), was = `${root.getAttribute('data-theme')}|${root.getAttribute('data-palette')}`;
  if (look?.theme) root.setAttribute('data-theme', look.theme); else root.removeAttribute('data-theme');
  if (look?.palette) root.setAttribute('data-palette', look.palette); else root.removeAttribute('data-palette');
  if (look && look.theme === 'dark') lastDark = look.id;
  if (`${root.getAttribute('data-theme')}|${root.getAttribute('data-palette')}` !== was) themeChanged();   // (the labels drawn on the GPU take the new look: label-theme.js)
}
