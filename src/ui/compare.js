// Comparison with a pinned moment. "Compare from here" on the timeline (or "Compare with now" on
// any marker) freezes a moment (A internally); the figure header then switches between then, now
// and the change, readouts report "vs then", and this section of the panel names both states and
// tabulates every difference. There is no Compare mode: unpinning ends it.

import { store } from './store.js';
import { h, fmt, svgIcon } from './util.js';
import { liveBalance } from './balance-hold.js';
import { activeInterventions } from './inspector.js';

// The rows in the readouts' teaching order, each group named as the readouts name it (pressure, flow, what they lead to, the
// systemic circulation), so a long table reads as four short ones.
const GROUPS = [['Pressure', 3], ['Flow', 3], ['Consequences', 2], ['Systemic', 3]];
const ROWS = [
  ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['PPG (portal vein − IVC)', (m) => m.ppg, 1, 'mmHg'], ['Portal flow', (m) => m.pvFlow, 1, 'L/min'],
  ['Liver perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix wall stress (model)', (m) => m.varix.ratioShown * 100, 0, '%'],
  ['Ascites formation', (m, live) => (live ? liveBalance(m.ascites.ratePerDay) : Math.round(m.ascites.ratePerDay / 100) * 100), 0, 'mL/day'], ['Right atrium', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['Cardiac output', (m) => m.co, 1, 'L/min'],
];

// The first four labels, then how many more.
function describe(labels) {
  if (!labels.length) return 'No changes from the scenario';
  let text = labels[0] ?? '';
  for (let i = 1; i < labels.length && i < 4; i++) text += ' · ' + (labels[i] ?? '');   // alloc-rare: the card's text, made as the section is built and when the treatments running or the scenario's name change (the params listener compares them first), never on a steady frame
  return labels.length > 4 ? text + ` · +${labels.length - 4} more` : text;   // alloc-rare: the card's text, made as the section is built and when the treatments running or the scenario's name change (the params listener compares them first), never on a steady frame
}
const scen = () => {
  const st = store.get(), list = st.presetList;
  if (list) for (let i = 0; i < list.length; i++) if (list[i].id === st.presetId) return list[i].label || 'Custom';
  return 'Custom';
};

export function createCompare() {
  let tableEl = null, nowCard = null;
  // What the card for now shows: the labels of the treatments running and the scenario's name, so the card is written again only when one changes.
  const shown = [];
  let shownN = -1, shownScen = null;
  const card = (cls, letter, kicker, name, detail) => h('div', { class: 'cmp-card ' + cls }, h('span', { class: 'ck' }, h('i', {}, letter), kicker), h('span', { class: 'cn' }, name), detail ? h('span', { class: 'cd' }, detail) : null);

  /** The "Compared with A" section, or null when nothing is pinned. */
  function section() {
    const A = store.get().compareSnap;
    if (!A) return null;
    tableEl = h('div');
    const [nA, nB] = A.names || ['Then', 'Now'];
    nowCard = card('b', 'N', A.names ? nB : 'Now · live', scen(), describe(activeInterventions(store.get().params).map((a) => a.label)));
    shownN = -1;   // (a new card: the next change of params writes it)
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
    const rows = ROWS.map(([lab, g, d, u]) => {
      const a = g(A), b = g(B, true), dd = b - a;
      const same = Math.abs(dd) < Math.pow(10, -d) * 0.5;
      return [lab, u, fmt(a, d), fmt(b, d), 'd ' + (same ? 'same' : dd > 0 ? 'up' : 'down'), same ? '' : dd > 0 ? '▲' : '▼', same ? '—' : `${dd > 0 ? '+' : '−'}${fmt(Math.abs(dd), d)}`];
    });
    const names = [st.compareSnap.names?.[0] || 'Then', st.compareSnap.names?.[1] || 'Now'];
    // Frames arrive ten times a second; the table is rebuilt only when a shown number or mark changes.
    const sig = names.join('|') + '|' + rows.map((r) => r.join('|')).join(';');
    if (tableEl._sig === sig) return;
    tableEl._sig = sig;
    // (The unit sits under the name, so every row is two even lines and no name breaks around its unit.)
    // The table is built once per pair of names; after that a changing number is written into its own cell, so a figure that moves
    // changes in place (and the change column's colour eases) instead of the whole table being swapped for a new one.
    const key = names.join('|');
    if (tableEl._key !== key) {
      tableEl._key = key;
      const cells = [];
      let at = 0;
      tableEl.replaceChildren(h('table', { class: 'cmp-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Metric'), h('th', {}, names[0]), h('th', {}, names[1]), h('th', {}, 'Change'))),
        GROUPS.map(([g, n]) => h('tbody', {},
          h('tr', { class: 'cmp-g' }, h('th', { colspan: 4, scope: 'colgroup' }, g)),
          rows.slice(at, (at += n)).map(([lab, u]) => {
            const a = h('td', { class: 'a' }), b = h('td', { class: 'b' }), d = h('td', { class: 'd same' }), tri = h('span', { class: 'tri', 'aria-hidden': 'true' }), txt = document.createTextNode('');
            cells.push({ a, b, d, tri, txt });
            return h('tr', {}, h('td', {}, h('span', { class: 'cmp-n' }, lab), h('span', { class: 'unit' }, u)), a, b, d);
          })))));
      tableEl._cells = cells;
    }
    rows.forEach(([, , a, b, dc, tri, dt], i) => {
      const c = tableEl._cells[i];
      if (c.a.textContent !== a) c.a.textContent = a;
      if (c.b.textContent !== b) c.b.textContent = b;
      if (c.d.className !== dc) c.d.className = dc;
      if (c.tri.textContent !== tri) c.tri.textContent = tri;
      if (c.txt.data !== dt) c.txt.data = dt;
      const want = tri ? [c.tri, c.txt] : [c.txt];
      if (c.d.childNodes.length !== want.length || want.some((n, j) => c.d.childNodes[j] !== n)) c.d.replaceChildren(...want);
    });
  }

  store.on('params', () => {
    if (!nowCard?.isConnected) return;
    const list = activeInterventions(store.get().params), name = scen();
    let same = shownN === list.length && name === shownScen;
    for (let i = 0; same && i < list.length; i++) if (shown[i] !== list[i].label) same = false;
    if (same) return;
    shownN = list.length; shownScen = name;
    for (let i = 0; i < list.length; i++) shown[i] = list[i].label;
    shown.length = list.length;
    nowCard.querySelector('.cn').textContent = name;
    nowCard.querySelector('.cd').textContent = describe(shown);
  });
  return { section, update };
}
