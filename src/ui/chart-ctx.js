// What a chart's looks written in code need of its card (WP3, moved out of presenter.js in WP4 so the talk chart can ask too): the layout, the
// part of the card it sits in, the card's own type sizes (card-scale.js, the stylesheet's formulas as numbers), the fit zoom and the letter scale.
// Read from the classes and inline values the layout wrote, in a rest pass, never in a frame.
import { cardScale } from './card-scale.js';

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
