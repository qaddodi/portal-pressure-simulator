// Compare mode: freeze the model as state A, change anything, and read B against it.
// The panel names both states and tabulates the differences; the figure header switches the
// plate between A, B and the change from A to B (colored on a diverging scale).

import { store } from './store.js?v=384ec84b1e';
import { h, fmt, icon } from './util.js?v=61d6f9c200';
import { activeInterventions } from './inspector.js?v=e6aa5464f0';

const ROWS = [
  ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['Portosystemic gradient', (m) => m.ppg, 1, 'mmHg'], ['Portal flow', (m) => m.pvFlow, 2, 'L/min'],
  ['Liver perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix wall tension', (m) => m.varix.ratio * 100, 0, '%'],
  ['Ascites formation', (m) => m.ascites.ratePerDay, 0, 'mL/day'], ['Right atrium', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['Cardiac output', (m) => m.co, 2, 'L/min'],
];

export function createCompare() {
  let tableEl = null, bCard = null;

  function snapshot() {
    const st = store.get();
    const f = st.frame;
    if (!f) return;
    const params = structuredClone(st.params);
    const label = st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom';
    const frame = { ...f, P: Array.from(f.P), Pf: f.Pf ? Array.from(f.Pf) : undefined, Q: Array.from(f.Q), Qf: f.Qf ? Array.from(f.Qf) : undefined, D: Array.from(f.D),
      ext: Array.from(f.ext), slow: structuredClone(f.slow), metrics: structuredClone(f.metrics), bleed: structuredClone(f.bleed), events: [], samples: null, params: undefined, viewParams: params };
    store.set({ compareSnap: { P: Array.from(f.P), metrics: structuredClone(f.metrics), params, frame, label, changes: activeInterventions(params).map((a) => a.label), when: f.day > 0 ? `day ${f.day}` : `${fmt(f.t, 0)} s` }, compareView: 'B' });
  }
  function clear() { store.set({ compareSnap: null, compareView: 'B' }); }

  const card = (cls, letter, kicker, name, detail) => h('div', { class: 'cmp-card ' + cls }, h('span', { class: 'ck' }, h('i', {}, letter), kicker), h('span', { class: 'cn' }, name), detail ? h('span', { class: 'cd' }, detail) : null);
  const describe = (labels) => (labels.length ? labels.slice(0, 4).join(' · ') + (labels.length > 4 ? ` · +${labels.length - 4} more` : '') : 'No changes from the scenario');

  function render() {
    const st = store.get();
    const A = st.compareSnap;
    const snapBtn = h('button', { class: 'btn ' + (A ? '' : 'primary') + ' block' }, icon('camera'), A ? 'Retake A from now' : 'Capture state A');
    snapBtn.addEventListener('click', snapshot);
    const kids = [
      h('div', { class: 'p-head' }, h('div', { class: 'p-head-row' }, h('div', { class: 'p-title' }, h('span', { class: 'kicker' }, 'Compare'), h('h2', {}, 'Two states, side by side')))),
    ];
    bCard = card('b', 'B', 'Now · live', st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom', describe(activeInterventions(st.params).map((a) => a.label)));
    if (!A) {
      kids.push(h('div', { class: 'p-body', style: { display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px' } },
        h('ol', { class: 'sub', style: { margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' } },
          h('li', {}, h('b', {}, 'Capture state A'), ': a frozen copy of the model as it is now.'),
          h('li', {}, h('b', {}, 'Change something'), ': a tool, a control, a drug, a scenario or months of disease.'),
          h('li', {}, h('b', {}, 'Read the difference'), ': switch the figure between A, B and A→B, and scan the table.')),
        h('div', { class: 'cmp-states' }, h('div', { class: 'cmp-card a empty-a' }, h('span', { class: 'ck' }, h('i', {}, 'A'), 'Snapshot'), h('span', { class: 'cd' }, 'Not captured yet')), bCard),
        snapBtn));
    } else {
      tableEl = h('div');
      const clr = h('button', { class: 'btn ghost sm' }, 'Clear A');
      clr.addEventListener('click', clear);
      kids.push(h('div', { class: 'p-body', style: { display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px' } },
        h('div', { class: 'cmp-states' }, card('a', 'A', `Snapshot · ${A.when}`, A.label, describe(A.changes)), bCard),
        h('div', { class: 'btn-row' }, snapBtn, clr),
        h('div', { class: 'overline', style: { marginTop: '4px' } }, 'Differences, B − A'),
        tableEl,
        h('p', { class: 'ctl-sub', style: { margin: 0 } }, 'The pressure profile in Instruments overlays A as a dotted line. On the figure, labels show ▲ / ▼ against A.')));
    }
    return kids;
  }

  function update(f) {
    const st = store.get();
    if (st.mode !== 'compare' || st.selection || !tableEl || !st.compareSnap || !tableEl.isConnected) return;
    const A = st.compareSnap.metrics, B = f.metrics;
    const maxRel = Math.max(...ROWS.map(([, g, d]) => { const a = g(A), b = g(B); return Math.abs(b - a) / Math.max(Math.abs(a), 1); }), 1e-6);
    tableEl.replaceChildren(h('table', { class: 'cmp-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Metric'), h('th', {}, 'A'), h('th', {}, 'B'), h('th', {}, 'Δ'))),
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
    if (!bCard?.isConnected) return;
    const d = bCard.querySelector('.cd'), n = bCard.querySelector('.cn'), st = store.get();
    n.textContent = st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom';
    d.textContent = describe(activeInterventions(st.params).map((a) => a.label));
  });
  store.on('compareSnap', () => { if (store.get().mode === 'compare' && !store.get().selection) document.dispatchEvent(new Event('pps:rerender-panel')); });
  return { render, update, snapshot, clear };
}
