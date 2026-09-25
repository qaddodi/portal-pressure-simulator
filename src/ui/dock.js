// Readout strip + tabbed charts and instruments (blueprint §9.1, §9.2).

import { store } from './store.js';
import { h, fmt, icon, svgIcon } from './util.js';
import { createProfile, createScope, createSankey, createPerfusion } from './charts.js';
import { createHVPG, createDoppler, createEndoscopy, createLobule, createVarixWall, createAbdomen } from './instruments.js';

const SEV = { ok: 'var(--ok)', caution: 'var(--caution)', danger: 'var(--danger)', critical: 'var(--critical)', info: 'var(--info)' };

// Readouts in reading order: the portal story first, then the systemic circulation.
const TILES = [
  { id: 'hvpg', k: 'HVPG', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : v < 12 ? 'danger' : 'critical'),
    s: (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : v < 12 ? 'CSPH' : v < 20 ? 'Bleed risk' : 'High risk') },
  { id: 'pv', k: 'Portal vein', title: 'Portal vein pressure', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv', st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'Raised' : 'High') },
  { id: 'ppg', k: 'PPG', title: 'Portosystemic pressure gradient (portal vein − IVC)', why: 'ppg', v: (m) => m.ppg, d: 1, u: 'mmHg', st: (v) => (v < 10 ? 'ok' : v < 12 ? 'caution' : 'danger'), s: (v) => (v < 12 ? 'Below 12' : 'Above 12') },
  { id: 'pvflow', k: 'Portal flow', why: 'pvFlow', v: (m) => m.pvFlow, d: 2, u: 'L/min',
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(m.pvVel) < 5 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? '⟲ Hepatofugal' : Math.abs(m.pvVel) < 5 ? 'Stasis' : `${fmt(m.pvVel, 0)} cm/s`) },
  { id: 'varix', k: 'Varix tension', why: 'varix', v: (m) => m.varix.ratio * 100, d: 0, u: '%',
    st: (v, m) => (m.varix.ratio > 1 ? 'critical' : m.varix.ratio > 0.7 ? 'danger' : m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (m.varix.d < 2.5 ? 'No varices' : m.varix.redWale ? 'Red wale' : `${m.varix.grade.code} · ${fmt(m.varix.d, 1)} mm`), title: 'Esophageal varix wall tension, % of the rupture threshold (Laplace)' },
  { id: 'ascites', k: 'Ascites', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L', st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => (m.ascites.grade === 0 ? 'None' : `Grade ${m.ascites.grade}`) },
  { id: 'liver', k: 'Liver flow', title: 'Liver perfusion: total sinusoidal flow, % of normal', why: 'liverPerf', v: (m) => m.liverPerfPct, d: 0, u: '%', st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v, m) => `Artery ×${fmt(m.habr, 1)}` },
  { id: 'shunt', k: 'Shunt', why: 'shunt', v: (m) => m.shuntFraction * 100, d: 0, u: '%', st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v, m) => `HE ${m.heRisk.label === 'Moderate' ? 'moderate' : m.heRisk.label.toLowerCase()}`, title: 'Portosystemic shunt fraction of splanchnic inflow; HE = hepatic encephalopathy' },
];

// Systemic circulation: a compact vitals block at the end of the strip.
const VITALS = [
  { k: 'MAP', why: 'map', v: (m) => fmt(m.map, 0), u: 'mmHg', bad: (m) => m.map < 65 },
  { k: 'HR', why: 'map', v: (m) => fmt(m.hr, 0), u: '/min', bad: (m) => m.hr > 110 },
  { k: 'CO', why: 'map', v: (m) => fmt(m.co, 1), u: 'L/min', bad: (m) => m.co > 6.5 },
  { k: 'RA', why: 'ra', hideKey: 'ra', v: (m) => fmt(m.ra, 1), u: 'mmHg', bad: (m) => m.ra > 10 },
  { k: 'Hb', why: null, v: (m) => fmt(m.blood.hb, 1), u: 'g/dL', bad: (m) => m.blood.hb < 7 },
  { k: 'Spleen', why: 'spleen', v: (m) => fmt(m.spleen.length, 1), u: 'cm', bad: (m) => m.spleen.length > 13 },
];

// Chart tabs, grouped: hemodynamics · bedside measurements · microanatomy · log.
const GROUPS = [['profile', 'scope', 'flow', 'perfusion'], ['hvpg', 'doppler', 'endoscopy', 'abdomen'], ['lobule', 'varixwall'], ['events', 'compare']];

export function createDock({ strip, tabs, body, onWhy, onAction, onProbe }) {
  // ── Readout strip ─────────────────────────────────
  const tileEls = {};
  for (const t of TILES) {
    const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr' }), st = h('span', { class: 'status' });
    const el = h('button', { class: 'metric' + (t.group ? ' group-start' : ''), role: 'listitem', 'aria-label': t.k },
      h('span', { class: 'k' }, t.k), h('span', { class: 'v' }, val, h('span', { class: 'unit' }, t.u), tr), h('span', { class: 's' }, st));
    if (t.why) el.addEventListener('click', () => onWhy(t.why, el));
    el.title = `${t.title || t.k}${t.why ? ' · click for a causal breakdown' : ''}`;
    strip.append(el);
    tileEls[t.id] = { el, t, val, tr, st, last: null, trendT: 0, sev: null };
  }
  const vitEls = VITALS.map((v) => {
    const val = h('b', {}, '—');
    const el = h(v.why ? 'button' : 'div', { class: 'vital', title: `${v.k} (${v.u})${v.why ? ' · click for a causal breakdown' : ''}` }, h('span', {}, v.k), val);
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    return { v, el, val };
  });
  strip.append(h('div', { class: 'vitals-block', role: 'listitem', 'aria-label': 'Systemic vitals' }, h('span', { class: 'vb-title' }, 'Systemic'), h('div', { class: 'vb-grid' }, vitEls.map((x) => x.el))));

  function updateStrip(f) {
    const m = f.metrics;
    const hidden = store.get().hiddenReadouts;
    for (const x of Object.values(tileEls)) {
      const { el, t } = x;
      let sev;
      if (hidden?.has(t.hideKey)) {
        const meas = t.id === 'hvpg' ? t.measured?.() : null;
        x.val.textContent = meas ? fmt(meas.hvpg, 1) : '?';
        x.st.textContent = meas ? 'Measured' : t.id === 'hvpg' ? 'Use catheter' : 'Unknown';
        sev = meas ? t.st(meas.hvpg, m) : 'none';
        el.classList.toggle('hidden-val', !meas);
        x.tr.textContent = '';
      } else {
        el.classList.remove('hidden-val');
        const v = t.v(m);
        const txt = fmt(v, t.d);
        if (x.val.textContent !== txt) x.val.textContent = txt;
        const s = t.s(v, m);
        if (x.st.textContent !== s) x.st.textContent = s;
        sev = t.st(v, m);
        if (x.last != null && Math.abs(v - x.last) > Math.pow(10, -t.d) * 0.6) { x.tr.textContent = v > x.last ? '▲' : '▼'; x.tr.className = 'tr ' + (v > x.last ? 'up' : 'down'); x.trendT = performance.now(); }
        else if (performance.now() - x.trendT > 1500) x.tr.textContent = '';
        x.last = v;
      }
      if (sev !== x.sev) { el.dataset.sev = sev; x.sev = sev; }
    }
    for (const x of vitEls) {
      const txt = hidden?.has(x.v.hideKey) ? '?' : x.v.v(m);
      if (x.val.textContent !== txt) x.val.textContent = txt;
      x.el.classList.toggle('bad', !hidden?.has(x.v.hideKey) && x.v.bad(m));
    }
  }

  // ── Panes ─────────────────────────────────────────
  const events = createEventsPane();
  const compare = createComparePane();
  const panes = [
    createProfile(), createScope(), createSankey(), createPerfusion(), createHVPG(),
    createDoppler({ onProbe }), createEndoscopy({ onAction }), createLobule(), createVarixWall(), createAbdomen({ onAction }), events, compare,
  ];
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  let active = 'profile';
  const tabBtns = {};
  GROUPS.forEach((g, gi) => {
    if (gi) tabs.append(h('span', { class: 'grp-sep', 'aria-hidden': 'true' }));
    for (const id of g) {
      const p = byId[id];
      const b = h('button', { role: 'tab', 'aria-selected': String(p.id === active), 'aria-controls': 'pane-' + p.id }, p.label);
      b.addEventListener('click', () => show(p.id));
      tabs.append(b);
      tabBtns[p.id] = b;
    }
  });
  for (const p of panes) { p.el.id = 'pane-' + p.id; p.el.setAttribute('role', 'tabpanel'); body.append(p.el); }
  const app = document.getElementById('app');
  const collapse = h('button', { class: 'ib', title: 'Collapse charts', 'aria-label': 'Collapse charts' }, svgIcon('chev-down'));
  const syncCollapse = () => { const c = app.classList.contains('dock-collapsed'); collapse.style.transform = c ? 'rotate(180deg)' : ''; collapse.setAttribute('aria-label', c ? 'Expand charts' : 'Collapse charts'); };
  collapse.addEventListener('click', () => { app.classList.toggle('dock-collapsed'); syncCollapse(); const f = store.get().frame; if (f) byId[active].update(f); });
  tabs.parentElement.append(collapse);
  tabBtns.compare.hidden = true;

  function show(id) {
    if (!byId[id]) return;
    active = id;
    for (const p of panes) { p.el.classList.toggle('active', p.id === id); tabBtns[p.id].setAttribute('aria-selected', String(p.id === id)); }
    app.classList.remove('dock-collapsed'); syncCollapse();
    tabBtns[id].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const f = store.get().frame;
    if (f) requestAnimationFrame(() => byId[id].update(f));
  }
  show('profile');

  function update(f) {
    updateStrip(f);
    byId.scope.ingest(f);
    if (f.events?.length) events.add(f.events);
    if (app.classList.contains('dock-collapsed')) return;
    const p = byId[active];
    if (p === byId.scope) p.redraw(); else p.update(f);
  }

  store.on('mode', (mode) => { tabBtns.compare.hidden = mode !== 'compare'; if (mode === 'compare') show('compare'); });
  addEventListener('resize', () => { const f = store.get().frame; if (f) byId[active].update(f); });
  return { update, show, profile: byId.profile, events };
}

function createEventsPane() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'events' });
  const list = h('div', { class: 'event-log', role: 'log', 'aria-live': 'off' }, h('div', { class: 'empty' }, 'Nothing has happened yet. Events (collaterals opening, flow reversing, varices rupturing) are logged here with their simulated time.'));
  el.append(list);
  const items = [];
  return {
    id: 'events', label: 'Events', el,
    add(evs) {
      list.querySelector('.empty')?.remove();
      for (const e of evs) {
        items.unshift(e);
        list.prepend(h('div', { class: 'event-row' }, h('span', { class: 'when' }, e.day > 0 ? `Day ${e.day}` : `${Math.round(e.t)} s`), h('span', { class: 'sev', style: { background: SEV[e.severity] || 'var(--info)' } }), h('span', {}, h('b', {}, e.title), e.detail ? h('span', { class: 'd' }, ` · ${e.detail}`) : null)));
      }
      while (list.children.length > 150) list.lastChild.remove();
    },
    update() {},
    items,
  };
}

function createComparePane() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'compare' });
  const table = h('div', { style: { flex: 1, overflow: 'auto', minWidth: 0 } });
  const snapBtn = h('button', { class: 'btn primary block' }, icon('camera'), 'Take snapshot A');
  const clearBtn = h('button', { class: 'btn block' }, 'Clear snapshot');
  const side = h('div', { class: 'chart-side' }, h('div', { class: 'side-title' }, 'Compare two states'),
    h('div', { class: 'sub' }, 'Snapshot the current state as A, then change anything. The table and the pressure profile show A against now (B).'), snapBtn, clearBtn);
  el.append(table, side);
  snapBtn.addEventListener('click', () => { const f = store.get().frame; if (f) store.set({ compareSnap: { P: Array.from(f.P), metrics: structuredClone(f.metrics), params: structuredClone(store.get().params) } }); });
  clearBtn.addEventListener('click', () => store.set({ compareSnap: null }));
  const rows = [
    ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['Portosystemic gradient', (m) => m.ppg, 1, 'mmHg'], ['Portal flow', (m) => m.pvFlow, 2, 'L/min'],
    ['Liver perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix wall tension', (m) => m.varix.ratio * 100, 0, '%'],
    ['Ascites formation', (m) => m.ascites.ratePerDay, 0, 'mL/day'], ['Right atrium', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['Cardiac output', (m) => m.co, 2, 'L/min'],
  ];
  return {
    id: 'compare', label: 'Compare', el,
    update(f) {
      const A = store.get().compareSnap?.metrics;
      const cell = (txt, extra = {}) => h('dd', extra, txt);
      table.replaceChildren(h('dl', { class: 'kv', style: { gridTemplateColumns: 'minmax(140px, 1fr) repeat(3, minmax(64px, auto))', maxWidth: '620px' } },
        h('dt', { class: 'overline' }, 'Metric'), cell('A', { class: 'overline' }), cell('Now', { class: 'overline' }), cell('Δ', { class: 'overline' }),
        rows.map(([lab, g, d, u]) => {
          const b = g(f.metrics), a = A ? g(A) : null;
          const delta = a != null ? b - a : null;
          const big = delta != null && Math.abs(delta) >= Math.pow(10, -d);
          return [h('dt', {}, lab, h('span', { class: 'unit' }, u)), cell(a != null ? fmt(a, d) : '—', { style: { color: 'var(--text-2)', fontWeight: 500 } }), cell(fmt(b, d)),
            cell(delta != null ? (delta > 0 ? '+' : '') + fmt(delta, d) : '', { style: { color: !big ? 'var(--text-3)' : delta > 0 ? 'var(--danger)' : 'var(--accent)' } })];
        })));
    },
  };
}
