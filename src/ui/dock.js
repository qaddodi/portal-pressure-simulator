// Readout strip + tabbed charts and instruments (blueprint §9.1, §9.2).

import { store } from './store.js?v=c4bae453f7';
import { h, fmt, icon, svgIcon } from './util.js?v=61d6f9c200';
import { createProfile, createScope, createSankey, createPerfusion } from './charts.js?v=e555d01b28';
import { createHVPG, createDoppler, createEndoscopy, createLobule, createVarixWall, createAbdomen } from './instruments.js?v=609e2e7a79';

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
    s: (v, m) => (v < -0.02 ? 'Hepatofugal' : Math.abs(m.pvVel) < 5 ? 'Stasis' : `${fmt(m.pvVel, 0)} cm/s`) },
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

// Instruments, grouped: hemodynamics · bedside measurements · microanatomy · log.
const GROUPS = [['Hemodynamics', ['profile', 'scope', 'flow', 'perfusion']], ['Bedside', ['hvpg', 'doppler', 'endoscopy', 'abdomen']], ['Microanatomy', ['lobule', 'varixwall']], ['Log', ['events']]];
// Key readouts always shown; the rest join the row when abnormal (or when the learner asks).
const PRIMARY = new Set(['hvpg', 'pv', 'pvflow', 'varix']);

export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal }) {
  const app = document.getElementById('app');
  // ── Readout strip ─────────────────────────────────
  const tileEls = {};
  for (const t of TILES) {
    const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr' }), st = h('span', { class: 'status' }), cmp = h('span', { class: 'cmp' });
    const secondary = !PRIMARY.has(t.id);
    const el = h('button', { class: 'metric' + (secondary ? ' secondary' : ''), 'aria-label': t.title || t.k, hidden: secondary },
      h('span', { class: 'k' }, t.k), h('span', { class: 'v' }, val, h('span', { class: 'unit' }, t.u), tr), h('span', { class: 's' }, st, cmp));
    if (t.why) el.addEventListener('click', () => onWhy(t.why, el));
    el.title = `${t.title || t.k}${t.why ? ' · click for a causal breakdown' : ''}`;
    strip.append(el);
    tileEls[t.id] = { el, t, val, tr, st, cmp, last: null, trendT: 0, sev: null, secondary };
  }
  const vitEls = VITALS.map((v) => {
    const val = h('b', {}, '—');
    const el = h(v.why ? 'button' : 'div', { class: 'vital', title: `${v.k} (${v.u})${v.why ? ' · click for a causal breakdown' : ''}` }, h('span', {}, v.k), val);
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    return { v, el, val };
  });
  strip.append(h('div', { class: 'vitals-block', 'aria-label': 'Systemic vitals' }, h('span', { class: 'vb-title' }, 'Systemic'), h('div', { class: 'vb-grid' }, vitEls.map((x) => x.el))));
  const moreBtn = h('button', { class: 'btn sm ghost more-readouts', 'aria-expanded': 'false' }, 'All readouts');
  moreBtn.addEventListener('click', () => { const on = strip.classList.toggle('all'); moreBtn.setAttribute('aria-expanded', String(on)); moreBtn.textContent = on ? 'Fewer readouts' : 'All readouts'; });
  strip.append(moreBtn);

  function updateStrip(f) {
    const m = f.metrics;
    const st0 = store.get();
    const hidden = st0.hiddenReadouts;
    const A = st0.mode === 'compare' ? st0.compareSnap?.metrics : null;
    let hiddenCount = 0;
    for (const x of Object.values(tileEls)) {
      const { el, t } = x;
      let sev, v = null;
      if (hidden?.has(t.hideKey)) {
        const meas = t.id === 'hvpg' ? t.measured?.() : null;
        x.val.textContent = meas ? fmt(meas.hvpg, 1) : '?';
        x.st.textContent = meas ? 'Measured' : t.id === 'hvpg' ? 'Use catheter' : 'Not measured';
        sev = meas ? t.st(meas.hvpg, m) : 'none';
        el.classList.toggle('hidden-val', !meas);
        x.tr.textContent = '';
      } else {
        el.classList.remove('hidden-val');
        v = t.v(m);
        const txt = fmt(v, t.d);
        if (x.val.textContent !== txt) x.val.textContent = txt;
        const s = t.s(v, m);
        if (x.st.textContent !== s) x.st.textContent = s;
        sev = t.st(v, m);
        if (x.last != null && Math.abs(v - x.last) > Math.pow(10, -t.d) * 0.6) { x.tr.textContent = v > x.last ? '▲' : '▼'; x.tr.className = 'tr ' + (v > x.last ? 'up' : 'down'); x.trendT = performance.now(); }
        else if (performance.now() - x.trendT > 1500) x.tr.textContent = '';
        x.last = v;
      }
      // Compare: each tile reports its change from state A in place of the status word.
      if (A && v != null) {
        const a = t.v(A), d = v - a;
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        x.cmp.textContent = same ? 'same as A' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs A`;
        x.cmp.className = 'cmp ' + (same ? 'same' : d > 0 ? 'up' : 'down');
        x.st.hidden = true;
      } else if (x.cmp.textContent) { x.cmp.textContent = ''; x.st.hidden = false; }
      if (sev !== x.sev) { el.dataset.sev = sev; x.sev = sev; }
      if (x.secondary) {
        const show = sev !== 'ok' || !!A;
        if (el.hidden === show) { el.hidden = !show; el.classList.toggle('promoted', show); }
        if (!show) hiddenCount++;
      }
    }
    for (const x of vitEls) {
      const txt = hidden?.has(x.v.hideKey) ? '?' : x.v.v(m);
      if (x.val.textContent !== txt) x.val.textContent = txt;
      x.el.classList.toggle('bad', !hidden?.has(x.v.hideKey) && x.v.bad(m));
    }
    moreBtn.hidden = !hiddenCount && !strip.classList.contains('all');
  }

  // ── Instrument drawer ─────────────────────────────
  const events = createEventsPane();
  const panes = [
    createProfile(), createScope(), createSankey(), createPerfusion(), createHVPG(),
    createDoppler({ onProbe }), createEndoscopy({ onAction }), createLobule(), createVarixWall(), createAbdomen({ onAction }), events,
  ];
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  const groupOf = (id) => GROUPS.find(([, ids]) => ids.includes(id))[0];
  let active = 'profile';
  const tabBtns = {};
  const title = h('button', { class: 'dock-title', 'aria-expanded': 'false', title: 'Open or close the instruments (I)' }, svgIcon('chart'), 'Instruments');
  title.addEventListener('click', () => toggle());
  const groupSeg = h('div', { class: 'seg dock-groups', role: 'group', 'aria-label': 'Instrument group' }, GROUPS.map(([g, ids]) => {
    const b = h('button', { 'aria-pressed': 'false', 'data-g': g }, g);
    b.addEventListener('click', () => show(active && groupOf(active) === g ? active : ids[0], { open: app.classList.contains('dock-open') || window.matchMedia('(max-width: 767px)').matches, keepClosed: !app.classList.contains('dock-open') }));
    return b;
  }));
  const tabs = h('div', { class: 'dock-tabs', role: 'tablist', 'aria-label': 'Instruments' });
  for (const [, ids] of GROUPS) for (const id of ids) {
    const p = byId[id];
    const b = h('button', { role: 'tab', 'aria-selected': 'false', 'aria-controls': 'pane-' + p.id }, p.label);
    b.addEventListener('click', () => show(p.id, { open: true }));
    tabs.append(b);
    tabBtns[p.id] = b;
  }
  const collapse = h('button', { class: 'ib dock-collapse', 'aria-label': 'Open instruments', title: 'Open or close the instruments (I)' }, svgIcon('chev-down'));
  collapse.addEventListener('click', () => toggle());
  head.append(title, groupSeg, tabs, collapse);
  for (const p of panes) { p.el.id = 'pane-' + p.id; p.el.setAttribute('role', 'tabpanel'); body.append(p.el); }
  // Wide: two levels (group, then its instruments). Narrow: every instrument in one scrolling row.
  const grouped = matchMedia('(min-width: 1101px), (max-width: 767px)');
  function syncTabs() {
    const g = groupOf(active);
    for (const b of groupSeg.children) b.setAttribute('aria-pressed', String(b.dataset.g === g));
    for (const [id, b] of Object.entries(tabBtns)) { b.hidden = grouped.matches && groupOf(id) !== g; b.setAttribute('aria-selected', String(id === active)); }
    const open = app.classList.contains('dock-open');
    title.setAttribute('aria-expanded', String(open));
    collapse.setAttribute('aria-label', open ? 'Close instruments' : 'Open instruments');
  }
  grouped.addEventListener('change', syncTabs);

  function show(id, { open = true, reveal = false, keepClosed = false } = {}) {
    if (!byId[id]) return;
    active = id;
    for (const p of panes) p.el.classList.toggle('active', p.id === id);
    if (reveal) onReveal?.(reveal);
    else if (open && !keepClosed) app.classList.add('dock-open');
    if (app.classList.contains('dock-open')) title.classList.remove('ping');
    syncTabs();
    tabBtns[id].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const f = store.get().frame;
    if (f) setTimeout(() => byId[id].update(f), app.classList.contains('dock-open') ? 300 : 0);
  }
  function toggle() {
    title.classList.remove('ping');
    app.classList.toggle('dock-open');
    syncTabs();
    const f = store.get().frame;
    if (f) setTimeout(() => byId[active].update(f), 300);
    setTimeout(() => dispatchEvent(new Event('resize')), 320);
  }
  show('profile', { open: false });

  function update(f, force) {
    updateStrip(f);
    byId.scope.ingest(f);
    if (f.events?.length) events.add(f.events);
    // The HVPG instrument also records wedge measurements (lessons and cases wait on them),
    // so it runs whenever a catheter is in place, open or not.
    const cath = (f.params || store.get().params).catheter;
    if (cath?.vein && active !== 'hvpg') byId.hvpg.update(f);
    if (!force && !app.classList.contains('dock-open') && !window.matchMedia('(max-width: 767px), (max-height: 500px)').matches) { if (cath?.vein && active === 'hvpg') byId.hvpg.update(f); return; }
    const p = byId[active];
    if (p === byId.scope) p.redraw(); else p.update(f);
  }

  addEventListener('resize', () => { const f = store.get().frame; if (f) byId[active].update(f); });
  return { update, show, toggle, profile: byId.profile, events };
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
