// What a chart's looks written in code need of its card (WP3, moved out of presenter.js in WP4 so the talk chart can ask too): the layout, the
// part of the card it sits in, the card's own type sizes (card-scale.js, the stylesheet's formulas as numbers), the fit zoom and the letter scale.
// Read from the classes and inline values the layout wrote, in a rest pass, never in a frame.
import { cardScale } from './card-scale.js';
import { makeCtx, hostSizeFor } from './chart-looks/resolve.js';

const PARTS = [['.pz-cell', 'cell'], ['.pz-data', 'data'], ['.pz-table', 'table'], ['.pz-grid', 'grid'], ['.pz-panel', 'panel'], ['.pz-text', 'text']];
/** svg: any element inside the card (a chart's box or its model's root). → { layout, in, fit, svk, scale } for gl.setCtx. */
export function chartCtx(svg) {
  const pz = svg.closest('.pz'), cl = pz ? pz.classList : null;
  const layout = !cl ? 'wide' : cl.contains('stack') ? (cl.contains('tab') ? 'tab' : 'stack') : cl.contains('low') ? 'low' : cl.contains('short') ? 'short' : 'wide';
  let part = 'data', el = null;
  for (const [sel, name] of PARTS) { el = svg.closest(sel); if (el) { part = name; break; } }
  const num = (e, n, d = 1) => { const v = e ? parseFloat(e.style.getPropertyValue(n)) : NaN; return v > 0 ? v : d; };
  const data = svg.closest('.pz-data'), text = svg.closest('.pz-text') || pz?.querySelector('.pz-text');
  const ts = num(document.documentElement, '--ts');
  const scale = cardScale({ vw: window.innerWidth, vh: window.innerHeight, layout, part, card: !!cl && cl.contains('pz-card'), ts, bk: num(text, '--pz-bk'), tk: num(text, '--pz-tk'), dk: num(data, '--pz-dk') });
  return { layout, in: part === 'cell' ? 'cell' : '', fit: num(data, '--pz-fit'), dk: num(data, '--pz-dk'), svk: num(svg.closest('svg[viewBox]') || svg, '--svk'), scale };
}

/**
 * The type size px a fitted chart (flow-time, curve, course) is drawn in, for its builder and its looks: the host's own size from the table (HOSTS),
 * grown to boost where the card is zoomed down (the chart keeps its words 12 px or more on the screen). The card's sizes are handed to the
 * chart's looks first, then the fitted size as the base an `em` means there, so the type of a piece is the table's and the builder's measure the same
 * number. The letter scale svk is the tools' to give (presenter-tools.js). Called when a drawing is made, never in a frame. A card that cannot be
 * asked yet (the chart is not in one) leaves the context as it stands.
 */
export function fittedType(el, gl, boost = 0) {
  try { const cx = chartCtx(el); delete cx.svk; gl.setCtx(cx); } catch { /* (no card round it yet: the sizes as they stand) */ }
  const f = Math.max(hostSizeFor(makeCtx({ ...gl.local, px: 0 })), boost);
  gl.setCtx({ px: f });
  return f;
}

/** A colour token's CSS name → its name in theme-tokens.js, what a piece's data-p-* holds. */
export const tokName = (v) => v.replace(/^--/, '');
