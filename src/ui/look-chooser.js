// Settings > Appearance: the looks as a grid of tiles, each drawing its look (a ground, a card on it, an ink line and a bar of the
// accent) so the choice is seen, not read. Three to a row: Light, Soft, Dark / Navy, Black, System. System shows Light and Dark
// side by side. The chosen tile carries aria-pressed like the segmented controls beside it, and a ring that fades in and out
// (never snaps). The colours are the --look-* tokens (styles/tokens.css); the shapes are styles/app.css (.look-grid).
import { h } from './util.js?v=1926dc32f0';
import { LOOKS } from './looks.js?v=2d098211a4';

const tile = (id, name, chip, cur, pick) => {
  const b = h('button', { class: 'look-tile', type: 'button', 'data-look': id, 'aria-pressed': String(cur === id) },
    h('span', { class: 'look-chip', 'aria-hidden': 'true' }, chip), h('span', { class: 'look-name' }, name));
  b.addEventListener('click', () => pick(id));
  return b;
};
// One look drawn small: its ground, and on it a card with two lines of ink and a bar in the accent.
const half = (id) => h('i', { class: 'look-half', 'data-look': id }, h('i', { class: 'look-card' }, h('b', {}), h('b', { class: 'short' }), h('u', {})));

/** The Appearance control. `cur`: the look id now (null or 'system' for System). `pick(id)`: called with a look id, or 'system'.
 *  The tiles update their own pressed state, so a change that crossfades the page is already in the picture it fades from. */
export function lookChooser(cur, pick) {
  const now = cur || 'system';
  const grid = h('div', { class: 'look-grid', role: 'group', 'aria-label': 'Appearance' });
  const choose = (id) => {
    for (const t of grid.children) t.setAttribute('aria-pressed', String(t.dataset.look === id));
    pick(id);
  };
  for (const l of LOOKS) grid.append(tile(l.id, l.name, half(l.id), now, choose));
  grid.append(tile('system', 'System', [half('light'), half('dark')], now, choose));
  return grid;
}
