// One readout tile's element (unification audit, finding 6): the bottom bar's tiles (dock.js) and Tests › Readouts (readouts-pane.js) build the same markup
// here, its name, number, unit, trend, scale bar with its cut-off ticks, and status line; each keeps its own update loop. DOM only, made once per tile: nothing
// here runs in a frame. (A slide's data-card tile, presenter.js buildTiles, is another component: bands, cut-off numbers and a change line.)

import { h, clamp } from './util.js';

const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1) * 100;
const NO_OPTS = {};
/**
 * t: a reading as dock.js TILES has it (id, k, ks, u, ux, d, scale, ticks, title, pane, why). opts:
 *   inert   a readout only: a div in role group, no tap and no hint to click
 *   primary one of the bar's key readings (its class)
 *   names   the long and the short name, for a narrow tile (t.ks); false: the name alone
 *   unit    false: no unit (a row of tiles that shares one)
 *   type    the button's type attribute
 *   width   keep room for two whole digits and the decimals, so the tile keeps its width as the reading changes
 * Returns { el, val, tr, st, cmp, fill }: the tile and the parts its loop writes.
 */
export function tileEl(t, opts = NO_OPTS) {
  const { inert = false, primary = false, names = true, unit = true, type = null, width = false } = opts;
  const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr', 'aria-hidden': 'true' }), st = h('span', { class: 'status' }), cmp = h('span', { class: 'cmp' });
  // (Room for two whole digits and the tile's decimals, "16.9" or "62", in whole pixels: a reading keeps its width as it
  // changes, and a tile is never wider than its usual reading, so a phone's row still fits.)
  if (width) val.style.setProperty('--vr', `round(up, calc(${2 + t.d}ch${t.d ? ' + 0.26em' : ''}), 1px)`);
  const fill = h('i', { class: 'rb-fill' });
  const bar = h('span', { class: 'rb', 'aria-hidden': 'true' }, fill, t.ticks.map((x) => h('i', { class: 'rb-tick', style: { left: pos(t, x) + '%' } })));
  // (A readout only is a group of its parts, not a control: the ARIA attribute is set in the literal, never by an assignment that reads like
  // the removed Student role's, tests/no-role.test.js.)
  const attrs = inert ? { class: 'metric inert' + (primary ? ' primary' : ''), 'data-id': t.id, role: 'group' } : { class: 'metric' + (primary ? ' primary' : ''), 'data-id': t.id };
  if (type && !inert) attrs.type = type;
  const el = h(inert ? 'div' : 'button', attrs,
    h('span', { class: 'k' }, names && t.ks ? [h('span', { class: 'k-l' }, t.k), h('span', { class: 'k-s' }, t.ks)] : t.k),
    h('span', { class: 'v' }, val, unit ? h('span', { class: t.u === '%' ? 'unit pct' : 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null) : null, tr),
    bar, h('span', { class: 's' }, st, cmp));
  el.title = `${t.title || t.k}${inert ? '' : t.pane ? '\nClick to open the Ascites view.' : t.why ? '\nClick for what is driving it.' : ''}`;
  return { el, val, tr, st, cmp, fill };
}
