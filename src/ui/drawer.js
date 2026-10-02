// The drawer: Patient, Treat and Measure are three tabs of one place on the right (a bottom sheet on a phone).
// One is open at a time, each with the same bar on top: the three tabs, anything small for that tab, and close.

import { h, svgIcon } from './util.js?v=fe164f31f1';

const TABS = [['chart', 'Patient', 'activity'], ['treat', 'Treat', 'pill'], ['measure', 'Measure', 'gauge']];

/** The bar: the tabs (the active one marked), then `trailing` nodes, then the close button. */
export function drawerBar(active, { go, close, closeLabel = 'Close', trailing = [], closeEl = null, badges = {} }) {
  const tabs = h('div', { class: 'dw-tabs', role: 'tablist', 'aria-label': 'Patient, Treat or Measure' }, TABS.map(([id, label, ic]) => {
    const b = h('button', { class: 'dw-tab', role: 'tab', 'aria-selected': String(id === active), 'data-drawer': id }, svgIcon(ic), h('span', {}, label), badges[id] || (id === 'chart' ? h('span', { class: 'dw-n', 'aria-label': 'findings' }) : null));
    b.addEventListener('click', () => { if (id !== active) go(id); });
    return b;
  }));
  const x = closeEl || h('button', { class: 'ib dw-close', 'aria-label': closeLabel, title: `${closeLabel} (Esc)`, onclick: close }, svgIcon('close'));
  if (closeEl) closeEl.addEventListener('click', close);
  x.classList.add('dw-close');
  return h('div', { class: 'dw-bar' }, tabs, ...trailing.filter(Boolean), x);
}
