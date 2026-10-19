// Deck visuals V30 (package E): where the gradient is spent, as a summary table column (cols: [..., 'spent']).
// Each row gets a flat bar, its length the pressure lost from the portal vein to the right atrium in mmHg, on one scale for
// every row of the table (at least 20 mmHg across, so a healthy row stays short). Its parts are the falls along the way, in a
// fixed order and each in its station's colour: portal vein, portal venules, sinusoids, central veins, hepatic veins, IVC.
// The row's longest part is named under the bar, and a key under the table names the colours, so colour is never the only cue.
// The falls are read from the network as it stood (the fingerprint's at.P), along the right lobe's path, the pressure
// profile's (anatomy.js PROFILE_PATHS): the ladder has only five rungs, so it cannot split the liver's part.

import { h, fmt } from './util.js?v=8813192ea2';
import { NODES } from '../engine/topology.js?v=4044766e96';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
// [from node, to node, name, colour]
export const PARTS = [
  ['CONF', 'RPV', 'Portal vein', 'pv'],
  ['RPV', 'SIN_R', 'Portal venules', 'venule'],
  ['SIN_R', 'CV_R', 'Sinusoids', 'sin'],
  ['CV_R', 'RHV', 'Central veins', 'cv'],
  ['RHV', 'IVCS', 'Hepatic veins', 'hv'],
  ['IVCS', 'RA', 'IVC', 'ivc'],
];
// A part names the row's level only when it is a real fall: a healthy liver's largest is about 2 mmHg (its sinusoids), and in
// heart failure every station rises together with no large fall anywhere.
export const TOP_MIN = 3;
/** The falls along the way from a fingerprint: { total, parts: [{ name, tone, d }], top } (top: the longest part's index, or
 *  -1 when no part falls TOP_MIN mmHg), or null without the network's pressures. The parts add up to the portal vein less the
 *  right atrium. */
export function spentOf(f) {
  const P = f?.at?.P;
  if (!P || !P.length) return null;
  const at = (id) => P[NI[id]];
  const parts = PARTS.map(([a, b, name, tone]) => ({ name, tone, d: at(a) - at(b) }));
  const total = at('CONF') - at('RA');
  let top = 0;
  parts.forEach((p, i) => { if (p.d > parts[top].d) top = i; });
  return { total, parts, top: parts[top].d >= TOP_MIN ? top : -1 };
}
/** The scale's full width, mmHg: the largest row's loss rounded up to 5, and never under 20. */
export const spentScale = (totals) => Math.max(20, Math.ceil(Math.max(0, ...totals.filter(Number.isFinite)) / 5) * 5);

// Every table that shows the column rescales its bars together once its cells are in (one scale for every row), and puts
// the colours' key under the table once.
const groups = new Map();   // slide → Set of { bar, total }
let raf = 0;
function rescale() {
  raf = 0;
  for (const [s, set] of groups) {
    const live = [...set].filter((c) => c.bar.isConnected);
    if (!live.length) { groups.delete(s); continue; }
    groups.set(s, new Set(live));
    const max = spentScale(live.map((c) => c.total));
    for (const c of live) c.bar.style.setProperty('--f', (Math.max(0, c.total) / max).toFixed(4));
    const table = live[0].bar.closest('.pz-table'), foot = table?.querySelector('.pz-foot');
    // (The column's heading may wrap, so a phone's table keeps to the card's width.)
    const td = live[0].bar.closest('td'), th = td && table?.querySelector('thead tr')?.children[td.cellIndex];
    th?.classList.add('pze-sp-th');
    table?.classList.add('pze-sp-table');
    if (foot && !foot.querySelector('.pze-spent-key')) foot.append(spentKey());
    table?.style.setProperty('--pze-max', String(max));
  }
}
const later = () => { if (!raf) raf = (globalThis.requestAnimationFrame || setTimeout)(rescale); };
export const spentKey = () => h('span', { class: 'pze-spent-key' }, ' Where the pressure drops, portal vein to heart: ',
  PARTS.map(([, , name, tone], i) => h('span', { class: 'pze-k' }, h('i', { 'data-tone': tone, 'aria-hidden': 'true' }), name + (i < PARTS.length - 1 ? ',' : '.'))));

export const spentColumn = {
  heading: 'Where pressure drops',
  cut: 'From the portal vein to the right atrium, every row on one scale. Its parts, in order: portal vein, portal venules, sinusoids, central veins, hepatic veins and IVC; the longest is named under the bar when it falls 3 mmHg or more',
  unit: 'pressure drops in mmHg',
  cell(r, ctx) {
    const sp = spentOf(r.f);
    if (!sp) return h('td', { class: 'num' }, '—');
    const bar = h('span', { class: 'pze-bar' }, sp.parts.map((p) => h('span', { 'data-tone': p.tone, style: { flexGrow: String(Math.max(0, p.d)) } })));
    const top = sp.parts[sp.top] || null;
    const set = groups.get(ctx?.slide) || new Set();
    groups.set(ctx?.slide, set);
    set.add({ bar, total: sp.total });
    later();
    return h('td', { class: 'pze-spent', title: sp.parts.map((p) => `${p.name} ${fmt(p.d, 1)}`).join(' · ') + ' mmHg' },
      h('span', { class: 'pze-sp-row' }, bar),
      h('span', { class: 'pze-sp-top', 'data-tone': top?.tone ?? 'none' }, h('b', {}, fmt(sp.total, 1)), ' ', top ? top.name : 'No large fall'),
      h('span', { class: 'sr-only' }, `${fmt(sp.total, 1)} mmHg lost from the portal vein to the right atrium` + (top ? `, most in the ${top.name.toLowerCase()}, ${fmt(top.d, 1)} mmHg` : ', with no large fall anywhere')));
  },
};
