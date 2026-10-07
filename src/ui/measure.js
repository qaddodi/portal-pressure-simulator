// Pressure measurement card (blueprint F3): a labeled FHVP / WHVP / HVPG card in the Pressure
// pane, with a free / wedged selector for the right hepatic vein that sends the existing
// `catheter` parameters. Not opened through an obstructed vein.

import { store, updateParams, logAction } from './store.js?v=b8c56c0b3c';
import { h, fmt } from './util.js?v=8aa5e5cdf1';
import { measureView, veinBlocked } from './measure-model.js?v=089f10544e';

export function createMeasureCard() {
  const rows = h('dl', { class: 'kv' }), notes = h('div', { class: 'ctl-sub' });
  const set = (cath, label) => { updateParams({ catheter: cath }, { settle: true, label }); logAction('catheter', cath.vein || 'none', cath.wedged); };
  const btns = [
    ['Withdraw', { vein: null, wedged: false }, 'Catheter withdrawn'],
    ['Free, right hepatic vein', { vein: 'R', wedged: false }, 'Catheter free in RHV'],
    ['Wedged', { vein: 'R', wedged: true }, 'Catheter wedged in RHV'],
  ].map(([l, c, lab]) => { const b = h('button', { 'aria-pressed': 'false', onclick: () => set(c, lab) }, l); b._c = c; return b; });
  const seg = h('div', { class: 'seg full', role: 'group', 'aria-label': 'Catheter position' }, btns);
  const el = h('details', { class: 'measure-card', open: true },
    h('summary', {}, 'Hepatic vein pressures', h('span', {}, ' model values · mmHg')), seg, rows, notes);
  let sig = '';
  function update(f) {
    const st = store.get(), p = st.params, m = f.metrics;
    el.hidden = st.mode === 'cases';
    if (el.hidden || !p) return;
    const v = measureView(m, p, st.hiddenReadouts);
    const s = JSON.stringify([v, p.catheter, veinBlocked(p)]);
    if (s === sig) return; sig = s;
    const cur = p.catheter?.vein ? (p.catheter.wedged ? 2 : 1) : 0;
    btns.forEach((b, i) => { b.setAttribute('aria-pressed', String(i === cur)); b.disabled = v.blocked && i > 0; });
    const out = [];
    const sect = (t, list) => { if (!list.length) return; out.push(h('dt', { class: 'kv-h' }, t), h('dd', {})); list.forEach(([l, val, u, site]) => out.push(h('dt', { title: site }, `${l} · ${site}`), h('dd', {}, `${fmt(val, 1)} ${u}`))); };
    sect('Recorded', v.recorded); sect('Continuous model', v.model); sect('Network', v.network);
    rows.replaceChildren(...out);
    notes.replaceChildren(...v.notes.map((n) => h('p', {}, n)));
  }
  return { el, update };
}
