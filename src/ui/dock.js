// Dock: clinical strip + tabbed charts/instruments (blueprint §9.1, §9.2).

import { store } from './store.js';
import { h, fmt, cssVar } from './util.js';
import { createProfile, createScope, createSankey, createPerfusion } from './charts.js';
import { createHVPG, createDoppler, createEndoscopy, createLobule, createVarixWall, createAbdomen } from './instruments.js';

const SEV = { ok: 'var(--ok)', caution: 'var(--caution)', danger: 'var(--danger)', critical: 'var(--critical)', info: 'var(--info)' };

export function createDock({ strip, tabs, body, onWhy, onAction, onProbe }) {
  // ── Clinical strip ────────────────────────────────
  const TILES = [
    { id: 'hvpg', k: 'HVPG', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : v < 12 ? 'danger' : 'critical'),
      s: (v, m) => (v < 5 ? 'normal' : v < 10 ? 'subclinical PH' : v < 12 ? 'CSPH' : v < 20 ? 'bleeding risk' : 'high-risk'), hideKey: 'trueHVPG',
      measured: () => store.get().lastHVPG },
    { id: 'ppg', k: 'PPG', why: 'ppg', v: (m) => m.ppg, d: 1, u: 'mmHg', st: (v) => (v < 10 ? 'ok' : v < 12 ? 'caution' : 'danger'), s: () => 'PV − IVC' },
    { id: 'pv', k: 'Portal P', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: () => 'normal 5–10', hideKey: 'pv' },
    { id: 'pvflow', k: 'PV flow', why: 'pvFlow', v: (m) => m.pvFlow, d: 2, u: 'L/min', st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(m.pvVel) < 5 ? 'caution' : 'ok'),
      s: (v, m) => (v < -0.02 ? '⟲ hepatofugal' : Math.abs(m.pvVel) < 5 ? 'stasis' : `${fmt(m.pvVel, 0)} cm/s →`) },
    { id: 'liver', k: 'Liver perf.', why: 'liverPerf', v: (m) => m.liverPerfPct, d: 0, u: '%', st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v, m) => `HA ×${fmt(m.habr, 1)}` },
    { id: 'shunt', k: 'Shunt', why: 'shunt', v: (m) => m.shuntFraction * 100, d: 0, u: '%', st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v, m) => `HE risk ${m.heRisk.label.toLowerCase()}` },
    { id: 'varix', k: 'Varices', why: 'varix', v: (m) => m.varix.d, d: 1, u: 'mm', st: (v, m) => (m.varix.ratio > 1 ? 'critical' : m.varix.ratio > 0.7 ? 'danger' : v >= 5 ? 'caution' : 'ok'),
      s: (v, m) => `${m.varix.grade.code} · T ${Math.round(m.varix.ratio * 100)}%${m.varix.redWale ? ' · red wale' : ''}` },
    { id: 'ascites', k: 'Ascites', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L', st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => `IAP ${fmt(m.ascites.iap, 0)} mmHg` },
    { id: 'spleen', k: 'Spleen', why: 'spleen', v: (m) => m.spleen.length, d: 1, u: 'cm', st: (v) => (v <= 13 ? 'ok' : v < 16 ? 'caution' : 'danger'), s: (v, m) => `PLT ≈ ${Math.round(m.spleen.platelets)}` },
    { id: 'map', k: 'MAP · CO', why: 'map', v: (m) => m.map, d: 0, u: 'mmHg', st: (v) => (v >= 65 ? 'ok' : v >= 55 ? 'danger' : 'critical'), s: (v, m) => `CO ${fmt(m.co, 1)} · HR ${Math.round(m.hr)}` },
    { id: 'ra', k: 'RA', why: 'ra', v: (m) => m.ra, d: 1, u: 'mmHg', st: (v) => (v <= 8 ? 'ok' : v < 12 ? 'caution' : 'danger'), s: () => 'CVP' },
    { id: 'blood', k: 'Blood vol.', why: null, v: (m) => m.blood.volume / 1000, d: 2, u: 'L', st: (v, m) => (m.blood.shock >= 3 ? 'critical' : m.blood.shock >= 2 ? 'danger' : 'ok'), s: (v, m) => `Hb ${fmt(m.blood.hb, 1)} g/dL` },
  ];
  const tileEls = {};
  for (const t of TILES) {
    const el = h('button', { class: 'tile', role: 'listitem', title: t.why ? 'Why? (causal breakdown)' : '' },
      h('div', { class: 'k' }, t.k), h('div', { class: 'v' }, h('span', { class: 'num val' }, '—'), h('span', { class: 'unit' }, t.u), h('span', { class: 'tr' })), h('div', { class: 's' }), h('div', { class: 'true-val' }));
    if (t.why) el.addEventListener('click', () => onWhy(t.why, el));
    strip.append(el);
    tileEls[t.id] = { el, t, last: null, trendT: 0 };
  }

  function updateStrip(f) {
    const m = f.metrics;
    const hidden = store.get().hiddenReadouts;
    const healthy = store.get().healthy?.metrics;
    for (const { el, t } of Object.values(tileEls)) {
      const x = tileEls[t.id];
      let v = t.v(m);
      const hideTrue = hidden?.has(t.hideKey);
      const valEl = el.querySelector('.val');
      if (hideTrue) {
        if (t.id === 'hvpg') {
          const meas = t.measured?.();
          valEl.textContent = meas ? fmt(meas.hvpg, 1) : '?';
          el.querySelector('.s').textContent = meas ? 'measured' : 'measure with catheter';
          el.style.setProperty('--status', meas ? SEV[t.st(meas.hvpg, m)] : 'var(--border-strong)');
        } else { valEl.textContent = '?'; el.querySelector('.s').textContent = 'not measured'; el.style.setProperty('--status', 'var(--border-strong)'); }
        continue;
      }
      valEl.textContent = fmt(v, t.d);
      el.querySelector('.s').textContent = t.s(v, m);
      el.style.setProperty('--status', SEV[t.st(v, m)]);
      const tr = el.querySelector('.tr');
      if (x.last != null && Math.abs(v - x.last) > Math.pow(10, -t.d) * 0.6) { tr.textContent = v > x.last ? '▲' : '▼'; tr.className = 'tr ' + (v > x.last ? 'up' : 'down'); x.trendT = performance.now(); }
      else if (performance.now() - x.trendT > 1500) tr.textContent = '';
      x.last = v;
      if (t.id === 'hvpg') {
        const meas = store.get().lastHVPG;
        el.querySelector('.true-val').textContent = meas ? `measured ${fmt(meas.hvpg, 1)}` : healthy ? '' : '';
      }
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
  for (const p of panes) {
    const b = h('button', { role: 'tab', 'aria-selected': String(p.id === active), 'aria-controls': 'pane-' + p.id }, p.label);
    b.addEventListener('click', () => show(p.id));
    tabs.append(b);
    tabBtns[p.id] = b;
    p.el.id = 'pane-' + p.id;
    body.append(p.el);
  }
  tabs.append(h('span', { class: 'spacer' }));
  const collapse = h('button', { title: 'Collapse / expand dock', 'aria-label': 'Collapse dock' }, '▾');
  collapse.addEventListener('click', () => { document.getElementById('app').classList.toggle('dock-collapsed'); collapse.textContent = document.getElementById('app').classList.contains('dock-collapsed') ? '▴' : '▾'; });
  tabs.append(collapse);
  tabBtns.compare.style.display = 'none';

  function show(id) {
    if (!byId[id]) return;
    active = id;
    for (const p of panes) { p.el.classList.toggle('active', p.id === id); tabBtns[p.id].setAttribute('aria-selected', String(p.id === id)); }
    document.getElementById('app').classList.remove('dock-collapsed');
    const f = store.get().frame;
    if (f) byId[id].update(f);
  }
  show('profile');

  function update(f) {
    updateStrip(f);
    byId.scope.ingest(f);
    if (f.events?.length) events.add(f.events);
    const p = byId[active];
    if (p === byId.scope) p.redraw(); else p.update(f);
  }

  store.on('mode', (mode) => { tabBtns.compare.style.display = mode === 'compare' ? '' : 'none'; if (mode === 'compare') show('compare'); });
  addEventListener('resize', () => { const f = store.get().frame; if (f) byId[active].update(f); });
  return { update, show, profile: byId.profile, events };
}

function createEventsPane() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'events' });
  const list = h('div', { class: 'event-log', role: 'log', 'aria-live': 'off' });
  el.append(list);
  const items = [];
  return {
    id: 'events', label: 'Events', el,
    add(evs) {
      for (const e of evs) {
        items.unshift(e);
        list.prepend(h('div', { class: 'event-row' }, h('span', { class: 'when' }, e.day > 0 ? `day ${e.day}` : `${Math.round(e.t)} s`), h('span', { class: 'sev', style: { background: SEV[e.severity] || 'var(--info)' } }), h('span', {}, h('b', {}, e.title), e.detail ? ` · ${e.detail}` : '')));
      }
      while (list.children.length > 150) list.lastChild.remove();
    },
    update() {},
    items,
  };
}

function createComparePane() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'compare' });
  const table = h('div', { style: { flex: 1, overflow: 'auto' } });
  const snapBtn = h('button', { class: 'btn primary' }, 'Take snapshot A');
  const clearBtn = h('button', { class: 'btn' }, 'Clear A');
  const side = h('div', { class: 'chart-side' }, h('label', {}, 'Compare'), h('div', { class: 'ctl-sub' }, 'Snapshot the current state as A, then change anything: the table and the pressure profile show A (ghost) vs now (B).'), snapBtn, clearBtn);
  el.append(table, side);
  snapBtn.addEventListener('click', () => { const f = store.get().frame; if (f) store.set({ compareSnap: { P: Array.from(f.P), metrics: structuredClone(f.metrics), params: structuredClone(store.get().params) } }); });
  clearBtn.addEventListener('click', () => store.set({ compareSnap: null }));
  const rows = [
    ['HVPG', (m) => m.hvpg, 1, 'mmHg'], ['Portal pressure', (m) => m.pv, 1, 'mmHg'], ['PPG', (m) => m.ppg, 1, 'mmHg'], ['PV flow', (m) => m.pvFlow, 2, 'L/min'],
    ['Liver perfusion', (m) => m.liverPerfPct, 0, '%'], ['Shunt fraction', (m) => m.shuntFraction * 100, 0, '%'], ['Varix tension', (m) => m.varix.ratio * 100, 0, '%'],
    ['Ascites formation', (m) => m.ascites.ratePerDay, 0, 'mL/d'], ['RA', (m) => m.ra, 1, 'mmHg'], ['MAP', (m) => m.map, 0, 'mmHg'], ['CO', (m) => m.co, 2, 'L/min'],
  ];
  return {
    id: 'compare', label: 'Compare', el,
    update(f) {
      const A = store.get().compareSnap?.metrics;
      table.replaceChildren(h('div', { class: 'kv', style: { gridTemplateColumns: '1fr auto auto auto', maxWidth: '560px' } },
        h('dt', {}, h('b', {}, 'Metric')), h('dd', {}, 'A'), h('dd', {}, 'B (now)'), h('dd', {}, 'Δ'),
        rows.map(([lab, g, d, u]) => {
          const b = g(f.metrics), a = A ? g(A) : null;
          const delta = a != null ? b - a : null;
          return [h('dt', {}, `${lab} (${u})`), h('dd', {}, a != null ? fmt(a, d) : '—'), h('dd', {}, fmt(b, d)),
            h('dd', { style: { color: delta == null || Math.abs(delta) < Math.pow(10, -d) ? '' : delta > 0 ? 'var(--danger)' : 'var(--info)' } }, delta != null ? (delta > 0 ? '+' : '') + fmt(delta, d) : '')];
        })));
    },
  };
}
