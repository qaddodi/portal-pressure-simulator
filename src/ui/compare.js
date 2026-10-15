// Comparison with a pinned moment. "Compare from here" on the timeline (or "Compare with now" on
// any marker) freezes a moment (A internally); the figure header then switches between then, now
// and the change, readouts report "vs then", and this section of the panel names both states and
// tabulates every difference. There is no Compare mode: unpinning ends it.

import { store } from './store.js?v=3b659e1968';
import { h, fmt, svgIcon } from './util.js?v=95b4244720';
import { liveBalance } from './balance-hold.js?v=ea4d9121d2';
import { activeInterventions } from './inspector.js?v=a2cf072a56';

const ROWS = [
  ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['PPG (portal vein − IVC)', (m) => m.ppg, 1, 'mmHg'], ['Portal flow', (m) => m.pvFlow, 1, 'L/min'],
  ['Liver perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix wall stress (model)', (m) => m.varix.ratio * 100, 0, '%'],
  ['Ascites formation', (m, live) => (live ? liveBalance(m.ascites.ratePerDay) : Math.round(m.ascites.ratePerDay / 100) * 100), 0, 'mL/day'], ['Right atrium', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['Cardiac output', (m) => m.co, 1, 'L/min'],
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
    const [nA, nB] = A.names || ['Then', 'Now'];
    nowCard = card('b', 'N', A.names ? nB : 'Now · live', scen(), describe(activeInterventions(store.get().params).map((a) => a.label)));
    const unpin = h('button', { class: 'btn sm', onclick: () => store.set({ compareSnap: null, compareView: 'B' }) }, svgIcon('close', 'mi-ic'), 'Stop comparing');
    const el = h('section', { class: 'cmp-section' },
      h('div', { class: 'cmp-top' }, h('span', { class: 'overline' }, `Comparing with ${A.when}`), unpin),
      h('div', { class: 'cmp-states' }, card('a', 'T', A.names ? nA : `Then · ${A.when}`, A.label, describe(A.changes)), nowCard),
      tableEl,
      h('p', { class: 'ctl-sub', style: { margin: 0 } }, 'Switch the figure between then, now and the change in the figure header. The pressure profile overlays then as a dotted line.'));
    // (Filled now, before the section is on the page: while paused no frame comes to fill it, review #22.)
    const f = store.get().frame;
    if (f) update(f, true);
    return el;
  }

  function update(f, building = false) {
    const st = store.get();
    if (!tableEl || (!building && !tableEl.isConnected) || !st.compareSnap) return;
    const A = st.compareSnap.metrics, B = f.metrics;
    const maxRel = Math.max(...ROWS.map(([, g]) => { const a = g(A), b = g(B, true); return Math.abs(b - a) / Math.max(Math.abs(a), 1); }), 1e-6);
    const rows = ROWS.map(([lab, g, d, u]) => {
      const a = g(A), b = g(B, true), dd = b - a;
      const same = Math.abs(dd) < Math.pow(10, -d) * 0.5;
      const rel = Math.abs(dd) / Math.max(Math.abs(a), 1);
      return [lab, u, !same && rel / maxRel > 0.5 ? 'big' : '', fmt(a, d), fmt(b, d), 'd ' + (same ? 'same' : dd > 0 ? 'up' : 'down'), same ? '—' : `${dd > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(dd), d)}`];
    });
    const names = [st.compareSnap.names?.[0] || 'Then', st.compareSnap.names?.[1] || 'Now'];
    // Frames arrive ten times a second; the table is rebuilt only when a shown number or mark changes.
    const sig = names.join('|') + '|' + rows.map((r) => r.join('|')).join(';');
    if (tableEl._sig === sig) return;
    tableEl._sig = sig;
    tableEl.replaceChildren(h('table', { class: 'cmp-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Metric'), h('th', {}, names[0]), h('th', {}, names[1]), h('th', {}, 'Δ'))),
      h('tbody', {}, rows.map(([lab, u, big, a, b, dc, dt]) => h('tr', { class: big },
        h('td', {}, lab, h('span', { class: 'unit' }, u)), h('td', { class: 'a' }, a), h('td', { class: 'b' }, b),
        h('td', { class: dc }, dt))))));
  }

  store.on('params', () => {
    if (!nowCard?.isConnected) return;
    nowCard.querySelector('.cn').textContent = scen();
    nowCard.querySelector('.cd').textContent = describe(activeInterventions(store.get().params).map((a) => a.label));
  });
  return { section, update };
}
