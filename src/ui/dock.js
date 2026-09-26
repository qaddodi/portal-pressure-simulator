// Readout strip (small screens) and the instruments (blueprint §9.1, §9.2).

import { store } from './store.js?v=4bf5a96a9d';
import { h, fmt, icon, svgIcon, popover, closePopover, clamp } from './util.js?v=d483888526';
import { NODES, EDGES } from '../engine/topology.js?v=6d79260961';
import { createProfile, createScope, createSankey, createPerfusion } from './charts.js?v=a409ac252d';
import { createHVPG, createDoppler, createEndoscopy, createVarixWall, createAbdomen } from './instruments.js?v=923084911f';
import { createLandscape } from './landscape.js?v=af01e6bf5e';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const SEV = { ok: 'var(--ok)', caution: 'var(--caution)', danger: 'var(--danger)', critical: 'var(--critical)', info: 'var(--info)' };

// Readouts in reading order: the portal story first, then the systemic circulation.
export const TILES = [
  { id: 'hvpg', k: 'HVPG', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : v < 12 ? 'danger' : 'critical'),
    s: (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : v < 12 ? 'CSPH' : v < 20 ? 'Bleed risk' : 'High risk') },
  { id: 'pv', k: 'Portal vein', title: 'Portal vein pressure', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv', st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'Raised' : 'High') },
  { id: 'ppg', k: 'PPG', title: 'Portosystemic pressure gradient (portal vein − IVC)', why: 'ppg', hideKey: 'pv', v: (m) => m.ppg, d: 1, u: 'mmHg', st: (v) => (v < 10 ? 'ok' : v < 12 ? 'caution' : 'danger'), s: (v) => (v < 12 ? 'Below 12' : 'Above 12') },
  { id: 'pvflow', k: 'Portal flow', why: 'pvFlow', v: (m) => m.pvFlow, d: 1, u: 'L/min',
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(m.pvVel) < 5 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? 'Hepatofugal' : Math.abs(m.pvVel) < 5 ? 'Stasis' : `${fmt(m.pvVel, 0)} cm/s`) },
  { id: 'varix', k: 'Varix tension', why: 'varix', hideKey: 'model', v: (m) => m.varix.ratio * 100, d: 0, u: '%',
    st: (v, m) => (m.varix.ratio > 1 ? 'critical' : m.varix.ratio > 0.7 ? 'danger' : m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (m.varix.d < 2.5 ? 'No varices' : m.varix.redWale ? 'Red wale' : `${m.varix.grade.code} · ${fmt(m.varix.d, 1)} mm`), title: 'Esophageal varix wall tension, % of the rupture threshold (Laplace)' },
  { id: 'ascites', k: 'Ascites', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L', st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => (m.ascites.grade === 0 ? 'None' : `Grade ${m.ascites.grade}`) },
  { id: 'liver', hideKey: 'model', k: 'Liver flow', title: 'Liver perfusion: total sinusoidal flow, % of normal', why: 'liverPerf', v: (m) => m.liverPerfPct, d: 0, u: '%', st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v, m) => `Artery ×${fmt(m.habr, 1)}` },
  { id: 'shunt', k: 'Shunt', why: 'shunt', hideKey: 'model', v: (m) => m.shuntFraction * 100, d: 0, u: '%', st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v, m) => `HE ${m.heRisk.label === 'Moderate' ? 'moderate' : m.heRisk.label.toLowerCase()}`, title: 'Portosystemic shunt fraction of splanchnic inflow; HE = hepatic encephalopathy' },
];

// Systemic circulation: a compact vitals block at the end of the strip.
export const VITALS = [
  { k: 'MAP', why: 'map', v: (m) => fmt(m.map, 0), u: 'mmHg', bad: (m) => m.map < 65 },
  { k: 'HR', why: 'map', v: (m) => fmt(m.hr, 0), u: '/min', bad: (m) => m.hr > 110 },
  { k: 'CO', why: 'map', v: (m) => fmt(m.co, 1), u: 'L/min', bad: (m) => m.co > 6.5 },
  { k: 'RA', why: 'ra', hideKey: 'ra', v: (m) => fmt(m.ra, 1), u: 'mmHg', bad: (m) => m.ra > 10 },
  { k: 'Hb', why: null, v: (m) => fmt(m.blood.hb, 1), u: 'g/dL', bad: (m) => m.blood.hb < 7 },
  { k: 'Spleen', why: 'spleen', v: (m) => fmt(m.spleen.length, 1), u: 'cm', bad: (m) => m.spleen.length > 13 },
];

// Key readouts always shown; the rest join the row when abnormal (or when the learner asks).
export const PRIMARY = new Set(['hvpg', 'pv', 'pvflow', 'varix']);

export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal, onLobule, onOpen, onClose, isVisible }) {
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
    const A = st0.compareSnap?.metrics || null;
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

  // ── Instruments: one level ────────────────────────
  // The Instruments button opens a grid of cards, each with a live preview line. The chosen
  // instrument opens in the side panel's Instruments tab (the panel widens a little for it); it
  // can pop out as a floating, resizable window, and on a wide screen a second one can sit below it.
  const panes = [
    createProfile(), createLandscape(), createScope(), createSankey(), createPerfusion(), createHVPG(),
    createDoppler({ onProbe }), createEndoscopy({ onAction }), createVarixWall(), createAbdomen({ onAction }),
  ];
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  const hiddenCase = () => store.get().imaging;
  let open = [];            // ids docked, in order (1 or 2)
  const floats = new Map(); // id → floating window element
  const titleBtn = h('button', { class: 'dock-title', 'aria-haspopup': 'dialog', title: 'Choose an instrument' }, svgIcon('chart'), h('span', { class: 'dt-l' }, 'Instruments'), svgIcon('chev-down', 'chev'));
  titleBtn.addEventListener('click', (e) => openGrid(e.currentTarget));
  const second = h('button', { class: 'btn sm ghost dock-second', title: 'Show a second instrument below this one' }, svgIcon('plus', 'mi-ic'), 'Add another');
  second.addEventListener('click', (e) => openGrid(e.currentTarget, { alongside: true }));
  const popBtn = h('button', { class: 'ib', 'aria-label': 'Pop out as a floating window', title: 'Pop out' }, svgIcon('panel'));
  popBtn.addEventListener('click', () => { if (open[0]) popOut(open[0]); });
  head.append(titleBtn, h('span', { class: 'sp' }), second, popBtn);
  for (const p of panes) { p.el.id = 'pane-' + p.id; p.el.setAttribute('role', 'region'); p.el.setAttribute('aria-label', p.label); body.append(p.el); }

  const INFO = {
    profile: ['activity', 'Pressure along a path', (f) => `Portal ${fmt(f.P[NI.CONF], 1)} → RA ${fmt(f.P[NI.RA], 1)} mmHg`],
    landscape: ['layers', 'The circulation raised by pressure', (f) => { const P = f.Pf || f.P; return `Portal ${fmt(P[NI.CONF], 0)} → sinusoids ${fmt(P[NI.SIN_R], 0)} → RA ${fmt(P[NI.RA], 0)}`; }],
    scope: ['chart', 'Pressures over time', (f) => `HVPG ${fmt(f.metrics.hvpg, 1)} mmHg now`],
    flow: ['vessel', 'Where gut blood goes', (f) => `${Math.round(f.metrics.shuntFraction * 100)} % bypasses the liver`],
    perfusion: ['liver', 'Liver perfusion & buffer', (f) => `${Math.round(f.metrics.liverPerfPct)} % perfused`],
    hvpg: ['catheter', 'Wedged hepatic venous pressure', () => { const m = store.get().lastHVPG; return m ? `Measured ${fmt(m.hvpg, 1)} mmHg` : 'No measurement yet'; }],
    doppler: ['doppler', 'Spectral Doppler of a vessel', (f) => { const k = EI[f.probe]; const D = Math.max(0.5, f.D[k]) / 10; const v = (f.Qf ? f.Qf[k] : f.Q[k]) / (Math.PI * D * D / 4); return `${fmt(Math.abs(v), 0)} cm/s ${v < -1 ? 'reversed' : ''}`; }],
    endoscopy: ['endoscope', 'The varices from inside', (f) => (f.metrics.varix.d < 2.4 ? 'No varices' : `Esophageal ${f.metrics.varix.grade.code}`)],
    varixwall: ['band', 'Laplace wall tension', (f) => `${Math.round(f.metrics.varix.ratio * 100)} % of rupture`],
    abdomen: ['needle', 'Ascites & paracentesis', (f) => `${fmt(f.metrics.ascites.volume / 1000, 1)} L ascites`],
  };
  function openGrid(anchor, { alongside = false } = {}) {
    const f = store.get().frame;
    const cards = panes.map((p) => {
      const [ic, desc, live] = INFO[p.id];
      const on = open.includes(p.id) || floats.has(p.id);
      const b = h('button', { class: 'instr-card' + (on ? ' on' : '') },
        h('span', { class: 'ic-ic' }, svgIcon(ic)), h('span', { class: 'ic-t' }, p.label), h('span', { class: 'ic-d' }, desc),
        h('span', { class: 'ic-live' }, f && !(hiddenCase() && ['profile', 'landscape', 'scope', 'lobule'].includes(p.id)) ? live(f) : '—'));
      b.addEventListener('click', () => { closePopover(); show(p.id, { open: true, alongside }); });
      return b;
    });
    // The lobule is a zoom level of the figure, not a panel: its card zooms in.
    if (!alongside && onLobule) {
      const b = h('button', { class: 'instr-card' }, h('span', { class: 'ic-ic' }, svgIcon('liver')), h('span', { class: 'ic-t' }, 'Lobule'), h('span', { class: 'ic-d' }, 'Zoom the figure into a liver lobule'),
        h('span', { class: 'ic-live' }, f && !hiddenCase() ? `Sinusoids ${fmt(f.P[NI.SIN_R], 1)} mmHg` : '—'));
      b.addEventListener('click', () => { closePopover(); onLobule(); });
      cards.push(b);
    }
    popover(anchor, [h('div', { class: 'menu-title' }, alongside ? 'Add an instrument alongside' : 'Instruments'), h('div', { class: 'instr-grid' }, cards)], { cls: 'instr-pop', align: anchor.closest('.dock') ? 'end' : 'start', place: 'below' });
  }
  const wide = matchMedia('(min-width: 1600px)');
  function layout() {
    for (const p of panes) p.el.classList.toggle('active', open.includes(p.id) && !floats.has(p.id));
    body.classList.toggle('split', open.length > 1);
    const first = byId[open[0]];
    head.querySelector('.dt-l').textContent = first ? (open.length > 1 ? `${first.label} · ${byId[open[1]].label}` : first.label) : 'Instruments';
    second.hidden = !wide.matches || open.length !== 1;
    popBtn.hidden = !open.length;
    const f = store.get().frame;
    if (f) setTimeout(() => { for (const id of open) byId[id].update(f); }, isVisible() ? 300 : 0);
  }
  wide.addEventListener('change', () => { if (!wide.matches && open.length > 1) open = open.slice(0, 1); layout(); });
  function show(id, { open: doOpen = true, reveal = false, alongside = false } = {}) {
    if (id === 'lobule') { onLobule?.(); return; }
    if (!byId[id]) return;
    if (floats.has(id)) { floats.get(id).classList.add('flash'); setTimeout(() => floats.get(id)?.classList.remove('flash'), 600); return; }
    if (alongside && open.length === 1 && open[0] !== id) open = [open[0], id];
    else if (!open.includes(id)) open = [id];
    layout();
    if (reveal) onReveal?.(reveal);
    else if (doOpen) onOpen();
    setTimeout(() => dispatchEvent(new Event('resize')), 320);
  }
  function close() { onClose(); setTimeout(() => dispatchEvent(new Event('resize')), 320); }
  /** Makes sure something is docked before the Instruments tab is shown. */
  function ensure() { if (!open.length) { open = ['profile']; layout(); } }
  function toggle() {
    if (isVisible()) close();
    else { ensure(); onOpen(); setTimeout(() => dispatchEvent(new Event('resize')), 320); }
  }
  // Floating window over the figure: drag by its header, resize from the corner.
  function popOut(id) {
    const p = byId[id];
    const view = document.getElementById('stageView');
    const back = h('button', { class: 'ib', 'aria-label': 'Dock in the side panel', title: 'Dock' }, svgIcon('download'));
    const x = h('button', { class: 'ib', 'aria-label': 'Close', title: 'Close' }, svgIcon('close'));
    const bar = h('header', { class: 'if-head' }, h('b', {}, p.label), h('span', { class: 'sp' }), back, x);
    const win = h('section', { class: 'instr-float stage-blocker', role: 'dialog', 'aria-label': p.label }, bar, p.el);
    win.style.left = '16px'; win.style.top = '16px';
    view.append(win);
    floats.set(id, win);
    p.el.classList.add('active');
    open = open.filter((o) => o !== id);
    if (!open.length && isVisible()) onClose();
    layout();
    const dock = () => { floats.delete(id); body.append(p.el); win.remove(); show(id, { open: true }); };
    back.addEventListener('click', dock);
    x.addEventListener('click', () => { floats.delete(id); body.append(p.el); p.el.classList.remove('active'); win.remove(); });
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = win.getBoundingClientRect(), vr = view.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      bar.setPointerCapture(e.pointerId);
      bar.onpointermove = (ev) => { win.style.left = `${clamp(ev.clientX - vr.left - dx, 0, vr.width - 80)}px`; win.style.top = `${clamp(ev.clientY - vr.top - dy, 0, vr.height - 40)}px`; };
      bar.onpointerup = () => { bar.onpointermove = null; };
    });
    new ResizeObserver(() => { const f = store.get().frame; if (f) p.update(f); }).observe(win);
    const f = store.get().frame; if (f) setTimeout(() => p.update(f), 30);
  }

  function update(f, force) {
    updateStrip(f);
    byId.scope.ingest(f);
    // The HVPG instrument also records wedge measurements (lessons and cases wait on them),
    // so it runs whenever a catheter is in place, open or not.
    const cath = (f.params || store.get().params).catheter;
    if (cath?.vein && !open.includes('hvpg') && !floats.has('hvpg')) byId.hvpg.update(f);
    for (const id of floats.keys()) { const p = byId[id]; if (p === byId.scope) p.redraw(); else p.update(f); }
    if (!force && !isVisible()) return;
    for (const id of open) { const p = byId[id]; if (p === byId.scope) p.redraw(); else p.update(f); }
  }

  addEventListener('resize', () => { const f = store.get().frame; if (f) for (const id of [...open, ...floats.keys()]) byId[id].update(f); });
  return { update, show, toggle, close, ensure, openGrid, profile: byId.profile, pane: (id) => byId[id], isOpen: (id) => open.includes(id) || floats.has(id) };
}
