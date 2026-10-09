// Comparison with a pinned moment. "Compare from here" on the timeline (or "Compare with now" on
// any marker) freezes a moment (A internally); the figure header then switches between then, now
// and the change, readouts report "vs then", and this section of the panel names both states and
// tabulates every difference. There is no Compare mode: unpinning ends it.

import { store } from './store.js?v=1d7cd9b00f';
import { h, fmt, svgIcon } from './util.js?v=e803df99cd';
import { activeInterventions } from './inspector.js?v=f2a0cd3e9a';

const ROWS = [
  ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['PPG (portal vein − IVC)', (m) => m.ppg, 1, 'mmHg'], ['Portal flow', (m) => m.pvFlow, 1, 'L/min'],
  ['Liver perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix wall stress (model)', (m) => m.varix.ratio * 100, 0, '%'],
  ['Ascites formation', (m) => m.ascites.ratePerDay, 0, 'mL/day'], ['Right atrium', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['Cardiac output', (m) => m.co, 1, 'L/min'],
];

export function createCompare() {
  let tableEl = null, nowCard = null;
  const card = (cls, letter, kicker, name, detail) => h('div', { class: 'cmp-card ' + cls }, h('span', { class: 'ck' }, h('i', {}, letter), kicker), h('span', { class: 'cn' }, name), detail ? h('span', { class: 'cd' }, detail) : null);
  const describe = (labels) => (labels.length ? labels.slice(0, 4).join(' · ') + (labels.length > 4 ? ` · +${labels.length - 4} more` : '') : 'No changes from the scenario');
  const scen = () => { const st = store.get(); return st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom'; };

  /** The "Compared with A" section, or null when nothing is pinned. */
  function section() {
    const A = store.get().compareSnap;
    if (!A) return null;
    tableEl = h('div');
    nowCard = card('b', 'N', 'Now · live', scen(), describe(activeInterventions(store.get().params).map((a) => a.label)));
    const unpin = h('button', { class: 'btn sm', onclick: () => store.set({ compareSnap: null, compareView: 'B' }) }, svgIcon('close', 'mi-ic'), 'Stop comparing');
    const el = h('section', { class: 'cmp-section' },
      h('div', { class: 'cmp-top' }, h('span', { class: 'overline' }, `Comparing with ${A.when}`), unpin),
      h('div', { class: 'cmp-states' }, card('a', 'T', `Then · ${A.when}`, A.label, describe(A.changes)), nowCard),
      tableEl,
      h('p', { class: 'ctl-sub', style: { margin: 0 } }, 'Switch the figure between then, now and the change in the figure header. The pressure profile overlays then as a dotted line.'));
    const f = store.get().frame;
    if (f) update(f);
    return el;
  }

  function update(f) {
    const st = store.get();
    if (!tableEl?.isConnected || !st.compareSnap) return;
    const A = st.compareSnap.metrics, B = f.metrics;
    const maxRel = Math.max(...ROWS.map(([, g]) => { const a = g(A), b = g(B); return Math.abs(b - a) / Math.max(Math.abs(a), 1); }), 1e-6);
    tableEl.replaceChildren(h('table', { class: 'cmp-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Metric'), h('th', {}, 'Then'), h('th', {}, 'Now'), h('th', {}, 'Δ'))),
      h('tbody', {}, ROWS.map(([lab, g, d, u]) => {
        const a = g(A), b = g(B), dd = b - a;
        const same = Math.abs(dd) < Math.pow(10, -d) * 0.5;
        const rel = Math.abs(dd) / Math.max(Math.abs(a), 1);
        return h('tr', { class: !same && rel / maxRel > 0.5 ? 'big' : '' },
          h('td', {}, lab, h('span', { class: 'unit' }, u)), h('td', { class: 'a' }, fmt(a, d)), h('td', { class: 'b' }, fmt(b, d)),
          h('td', { class: 'd ' + (same ? 'same' : dd > 0 ? 'up' : 'down') }, same ? '—' : `${dd > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(dd), d)}`));
      }))));
  }

  store.on('params', () => {
    if (!nowCard?.isConnected) return;
    nowCard.querySelector('.cn').textContent = scen();
    nowCard.querySelector('.cd').textContent = describe(activeInterventions(store.get().params).map((a) => a.label));
  });
  return { section, update };
}
