// Settings > Appearance: the looks as a grid of tiles, each drawing its look (a ground, a card on it, an ink line and a bar of the
// accent) so the choice is seen, not read. Three to a row: Light, Soft, Dark / Navy, Black, System. System shows Light and Dark
// side by side. The chosen tile carries aria-pressed like the segmented controls beside it, and a ring that fades in and out
// (never snaps). The colours are the --look-* tokens (styles/tokens.css); the shapes are styles/app.css (.look-grid).
import { h } from './util.js';
import { LOOKS } from './looks.js';

// From the tap until the crossfade starts the page waits for the new look (every surface drawn with it, up to 0.9 s), and the browser holds the
// picture still meanwhile. The tapped tile carries the app's own loading ring (the presenter's, styles/app.css .look-spin) from the tap, put in
// the picture the crossfade fades from, and it ends with the wait. `data-busy` is the hook; a long wait lets go after 2 s whatever happens.
const BUSY_CAP = 2000;

const tile = (id, name, chip, cur, pick) => {
  const b = h('button', { class: 'look-tile', type: 'button', 'data-look': id, 'aria-pressed': String(cur === id) },
    h('span', { class: 'look-chip', 'aria-hidden': 'true' }, chip), h('span', { class: 'look-name' }, name), h('i', { class: 'look-spin', 'aria-hidden': 'true' }));
  b.addEventListener('click', () => pick(id));
  return b;
};
// One look drawn small: its ground, and on it a card with two lines of ink and a bar in the accent.
const half = (id) => h('i', { class: 'look-half', 'data-look': id }, h('i', { class: 'look-card' }, h('b', {}), h('b', { class: 'short' }), h('u', {})));

/** The Appearance control. `cur`: the look id now (null or 'system' for System). `pick(id)`: called with a look id, or 'system'; it may return a
 *  promise that resolves when the page has the look (the tapped tile shows a loading ring until then).
 *  The tiles update their own pressed state, so a change that crossfades the page is already in the picture it fades from. */
export function lookChooser(cur, pick) {
  const now = cur || 'system';
  const grid = h('div', { class: 'look-grid', role: 'group', 'aria-label': 'Appearance' });
  const choose = (id) => {
    for (const t of grid.children) t.setAttribute('aria-pressed', String(t.dataset.look === id));
    const waiting = pick(id);
    if (!waiting || typeof waiting.then !== 'function') return;
    const tile = grid.querySelector(`:scope > [data-look="${id}"]`);
    if (!tile) return;
    for (const t of grid.children) t.removeAttribute('data-busy');
    tile.setAttribute('data-busy', '');
    const off = () => { if (tile.hasAttribute('data-busy') && tile._busyFor === waiting) tile.removeAttribute('data-busy'); };
    tile._busyFor = waiting;
    waiting.then(off, off);
    setTimeout(off, BUSY_CAP);
  };
  for (const l of LOOKS) grid.append(tile(l.id, l.name, half(l.id), now, choose));
  grid.append(tile('system', 'System', [half('light'), half('dark')], now, choose));
  return grid;
}
