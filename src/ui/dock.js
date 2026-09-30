// Readout strip (small screens) and the instruments (blueprint §9.1, §9.2).

import { store } from './store.js?v=4bf5a96a9d';
import { h, fmt, svgIcon, closePopover, clamp } from './util.js?v=fe164f31f1';
import { createProfile, createScope, createSankey, createPerfusion } from './charts.js?v=43635bc44e';
import { createHVPG, createDoppler, createEndoscopy, createVarixWall, createAbdomen } from './instruments.js?v=b6cd4ed2e7';
import { createLandscape } from './landscape.js?v=7c3e94b095';


// Readouts in reading order: the portal story first, then the systemic circulation. Each
// readout's status (dot color and word) comes from a clinical cut-off, listed in CUTOFFS below
// and in About the model: green is normal, amber borderline, red past a clinical threshold,
// dark red past the highest one where a readout has one.
export const TILES = [
  { id: 'hvpg', k: 'HVPG', title: 'Hepatic venous pressure gradient (wedged − free hepatic venous pressure)', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger'),
    s: (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : 'CSPH') },
  { id: 'pv', k: 'Portal vein', title: 'Portal vein pressure', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv', st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'Raised' : 'High') },
  { id: 'ppg', k: 'Portal–IVC', title: 'Direct portal–systemic gradient (portal vein − suprahepatic IVC). Not the same as HVPG.', why: 'ppg', hideKey: 'pv', v: (m) => m.ppg, d: 1, u: 'mmHg', st: (v) => (v < 6 ? 'ok' : 'caution'), s: (v) => (v < 6 ? 'Normal' : 'Raised') },
  { id: 'pvflow', k: 'Portal flow', why: 'pvFlow', v: (m) => m.pvFlow, d: 1, u: 'L/min',
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(m.pvVel) < 5 ? 'danger' : v < 0.9 || Math.abs(m.pvVel) < 12 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? 'Hepatofugal' : Math.abs(m.pvVel) < 5 ? 'Stasis' : v < 0.9 ? `Reduced · ${fmt(m.pvVel, 0)} cm/s` : Math.abs(m.pvVel) < 12 ? `Slow · ${fmt(m.pvVel, 0)} cm/s` : `${fmt(m.pvVel, 0)} cm/s`) },
  { id: 'varix', k: 'Varix tension', why: 'varix', hideKey: 'model', v: (m) => m.varix.ratio * 100, d: 0, u: '%',
    st: (v, m) => (m.varix.ratio >= 0.9 ? 'critical' : m.varix.ratio >= 0.7 ? 'danger' : m.varix.ratio >= 0.4 || m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (m.varix.d < 2.5 ? 'No varices' : m.varix.redWale ? 'Red wale' : `${m.varix.grade.code} · ${fmt(m.varix.d, 1)} mm`), title: 'Esophageal varix wall tension, % of the rupture threshold (Laplace)' },
  { id: 'ascites', k: 'Ascites', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L', st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => (m.ascites.grade === 0 ? 'None' : `Grade ${m.ascites.grade}`) },
  { id: 'liver', hideKey: 'model', k: 'Liver flow', title: 'Liver perfusion: total sinusoidal flow, % of normal', why: 'liverPerf', v: (m) => m.liverPerfPct, d: 0, u: '%', st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v, m) => `Artery ×${fmt(m.habr, 1)}` },
  { id: 'shunt', k: 'Shunt', why: 'shunt', hideKey: 'model', v: (m) => m.shuntFraction * 100, d: 0, u: '%', st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v, m) => `HE ${m.heRisk.label === 'Moderate' ? 'moderate' : m.heRisk.label.toLowerCase()}`, title: 'Portosystemic shunt fraction of splanchnic inflow; HE = hepatic encephalopathy' },
];
// The cut-offs behind each status, as About the model lists them: [readout, normal, amber, red, dark red].
export const CUTOFFS = [
  ['HVPG (wedged − free)', '< 5 mmHg', '5–9 (subclinical)', '≥ 10 (CSPH in cirrhosis)', '—'],
  ['Portal vein pressure', '≤ 10 mmHg', '11–14', '≥ 15', '—'],
  ['Direct portal–systemic gradient (portal vein − suprahepatic IVC)', '< 6 mmHg', '≥ 6', '—', '—'],
  ['Portal flow', '≥ 0.9 L/min and ≥ 12 cm/s', '< 0.9 L/min or < 12 cm/s', '< 5 cm/s (stasis)', 'Hepatofugal'],
  ['Varix wall tension', '< 40 % of rupture', '40–69 %, or diameter ≥ 5 mm', '70–89 %', '≥ 90 %'],
  ['Ascites', 'None', 'Grade 1', 'Grade 2–3', '—'],
  ['Liver perfusion', '> 75 % of normal', '56–75 %', '≤ 55 %', '—'],
  ['Shunt fraction', '< 10 %', '10–29 %', '30–59 %', '≥ 60 %'],
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

export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal, onCompare, onRun, onLobule, onOpen, onClose, isVisible }) {
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
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null) {
        const a = t.v(A), d = v - a;
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        x.cmp.textContent = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`;
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

  // ── Instrument workspace ─────────────────────────
  // One live workspace, below the anatomy. Legacy ids remain valid for lessons and actions:
  // landscape is a Pressure view; varixwall is Endoscopy's expandable wall mechanics.
  const app = document.getElementById('app');
  const workspace = head.closest('.dock');
  const stageWrap = document.getElementById('stageWrap');
  const profile = createProfile(), landscape = createLandscape(), wall = createVarixWall();
  const endoscopy = createEndoscopy({ onAction });
  const wallDetails = h('details', { class: 'instrument-details wall-details' },
    h('summary', {}, 'Wall mechanics', h('span', {}, 'Pressure, radius & wall thickness')), wall.el);
  wall.el.className = 'instrument-view wall-view';
  endoscopy.el.append(wallDetails);
  wallDetails.addEventListener('toggle', () => { if (wallDetails.open && frame) wall.update(frame); });
  const profileView = profile.el, landscapeView = landscape.el;
  profileView.className = 'instrument-view';
  landscapeView.className = 'instrument-view';
  let pressureView = 'profile';
  const viewSeg = h('div', { class: 'seg pressure-views', role: 'group', 'aria-label': 'Pressure view' },
    ['profile', 'landscape'].map((id) => h('button', {
      'data-view': id, 'aria-pressed': String(id === pressureView),
      onclick: () => setPressureView(id),
    }, id === 'profile' ? 'Profile' : 'Landscape')));
  const pressure = {
    ...profile, id: 'profile', label: 'Pressure',
    el: h('section', { class: 'dock-pane', 'data-pane': 'profile' }, viewSeg, profileView, landscapeView),
    update(f) { (pressureView === 'landscape' ? landscape : profile).update(f); },
  };
  const instruments = [
    pressure, createScope(), createSankey(), createPerfusion(), createHVPG(),
    createDoppler({ onProbe }), endoscopy, createAbdomen({ onAction }),
  ];
  const panes = instruments.map((p) => {
    if (p === pressure) return p;
    p.el.className = 'instrument-view';
    return { ...p, el: h('section', { class: 'dock-pane', 'data-pane': p.id }, p.el) };
  });
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  let open = ['profile'], frame = null, state = 'open', heightRatio = null, resizeFrame = 0;
  let chooserAdding = false;
  const INFO = {
    profile: ['activity', 'Locate resistance along a path or across the circulation.', (f) => `Portal ${fmt(f.metrics.pv, 1)} mmHg`],
    scope: ['chart', 'Pressure and velocity waveforms; disease trends over days.', (f) => `HVPG ${fmt(f.metrics.hvpg, 1)} mmHg`],
    flow: ['vessel', 'Follow blood through the liver, collaterals and shunts.', (f) => `${Math.round(f.metrics.shuntFraction * 100)}% bypasses the liver`],
    perfusion: ['liver', 'Portal supply, arterial buffering and liver resistance.', (f) => `${Math.round(f.metrics.liverPerfPct)}% of baseline flow`],
    hvpg: ['catheter', 'Place a catheter and measure wedged minus free pressure.', () => { const m = store.get().lastHVPG; return m ? `Measured ${fmt(m.hvpg, 1)} mmHg` : 'Choose a hepatic vein'; }],
    doppler: ['doppler', 'Select a vessel to inspect velocity, direction and pulsatility.', (f) => `${fmt(Math.abs(f.metrics.pvVel), 0)} cm/s in portal vein`],
    endoscopy: ['endoscope', 'Inspect and band varices; explore their wall mechanics.', (f) => f.metrics.varix.d < 2.5 ? 'No esophageal varices' : `Esophageal ${f.metrics.varix.grade.code}`],
    abdomen: ['needle', 'Inspect ascites and drain fluid, with or without albumin.', (f) => `${fmt(f.metrics.ascites.volume / 1000, 1)} L ascites`],
  };
  const live = h('span', { class: 'workspace-live', 'aria-live': 'off' });
  const run = h('button', { class: 'workspace-run', title: 'Run or pause the simulation', onclick: () => onRun?.() }, svgIcon('play', 'mi-ic'), h('span', {}, 'Pause'));
  const compareBtn = h('button', { class: 'btn sm workspace-compare', onclick: () => onCompare?.(), 'aria-pressed': 'false' }, svgIcon('compare', 'mi-ic'), h('span', {}, 'Compare'));
  const titleBtn = h('button', { class: 'dock-title', 'aria-haspopup': 'dialog', title: 'Choose an instrument', onclick: (e) => openGrid(e.currentTarget) },
    svgIcon('gauge'), h('span', { class: 'dt-l' }, 'Pressure'), svgIcon('chev-down', 'chev'));
  const second = h('button', { class: 'btn sm dock-second', title: 'View two instruments side by side', onclick: (e) => openGrid(e.currentTarget, { alongside: true }) }, svgIcon('plus', 'mi-ic'), 'Add');
  const expand = h('button', { class: 'ib workspace-expand', 'aria-label': 'Expand instrument', title: 'Expand instrument', onclick: () => setState(state === 'focus' ? 'open' : 'focus') }, svgIcon('fit'));
  const fold = h('button', { class: 'ib workspace-fold', 'aria-label': 'Collapse instrument', title: 'Collapse instrument', onclick: () => setState(state === 'peek' ? 'open' : 'peek') }, svgIcon('chev-down'));
  const closeBtn = h('button', { class: 'ib workspace-close', 'aria-label': 'Close instruments', title: 'Close instruments', onclick: close }, svgIcon('close'));
  const divider = h('div', { class: 'workspace-divider', role: 'separator', tabindex: '0', 'aria-label': 'Instrument workspace height', 'aria-orientation': 'horizontal', 'aria-valuemin': '25', 'aria-valuemax': '75', 'aria-valuenow': '45' }, h('span'));
  workspace.prepend(divider);
  head.append(titleBtn, live, run, compareBtn, second, expand, fold, closeBtn);
  for (const p of panes) {
    p.el.id = 'pane-' + p.id; p.el.setAttribute('role', 'region'); p.el.setAttribute('aria-label', p.label);
    body.append(p.el);
  }
  // Each visible instrument has its own scroll surface; the anatomy remains interactive above.
  const slots = h('div', { class: 'workspace-slots', 'aria-label': 'Open instruments' });
  head.after(slots);
  const comparison = h('div', { class: 'workspace-comparison', hidden: true });
  head.after(comparison);
  const chooser = h('div', { class: 'workspace-chooser', hidden: true });
  body.before(chooser);
  function setPressureView(id) {
    pressureView = id;
    profileView.hidden = id !== 'profile'; landscapeView.hidden = id !== 'landscape';
    viewSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === id)));
    refresh();
  }
  function refresh() {
    if (!frame || !isVisible() || state === 'peek' || !workspace.offsetParent) return;
    for (const id of open) {
      const p = byId[id];
      if (id === 'scope') p.redraw(); else p.update(frame);
      if (id === 'endoscopy' && wallDetails.open) wall.update(frame);
    }
  }
  function queueRefresh() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; refresh(); });
  }
  function updateSize() {
    const max = stageWrap.clientHeight;
    const ratio = heightRatio ?? (matchMedia('(max-width: 767px)').matches ? 0.56 : 0.46);
    const height = Math.min(max - 150, Math.max(180, max * ratio));
    workspace.style.setProperty('--instrument-h', `${Math.max(140, height)}px`);
    divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }
  function setState(next) {
    state = next;
    workspace.dataset.state = state;
    app.classList.toggle('instrument-focus', state === 'focus' && isVisible());
    fold.setAttribute('aria-label', state === 'peek' ? 'Open instrument' : 'Collapse instrument');
    fold.title = state === 'peek' ? 'Open instrument' : 'Collapse instrument';
    expand.setAttribute('aria-label', state === 'focus' ? 'Return to split view' : 'Expand instrument');
    expand.title = state === 'focus' ? 'Return to split view' : 'Expand instrument';
    divider.hidden = state !== 'open';
    body.hidden = state === 'peek';
    slots.hidden = state === 'peek' || open.length < 2;
    chooser.hidden = true;
    updateHeader(); layout();
    queueRefresh();
  }
  function layout() {
    // Never retain two cramped columns after rotation or resizing.
    if (body.clientWidth < 1100 && open.length > 1) open = open.slice(0, 1);
    for (const p of panes) p.el.classList.toggle('active', open.includes(p.id));
    body.classList.toggle('split', open.length > 1);
    const first = byId[open[0]];
    head.querySelector('.dt-l').textContent = first?.label || 'Choose an instrument';
    second.hidden = state === 'peek' || body.clientWidth < 1100 || open.length > 1;
    slots.replaceChildren(...open.map((id) => h('div', { class: 'workspace-slot' }, h('b', {}, byId[id].label),
      h('button', { class: 'ib', 'aria-label': `Remove ${byId[id].label}`, onclick: () => { open = open.filter((x) => x !== id); layout(); } }, svgIcon('close')))));
    slots.hidden = state === 'peek' || open.length < 2;
    profileView.hidden = pressureView !== 'profile'; landscapeView.hidden = pressureView !== 'landscape';
    queueRefresh();
  }
  function renderChooser() {
    const groups = [
      ['Hemodynamics', ['profile', 'scope', 'flow', 'perfusion']],
      ['Clinical tools', ['hvpg', 'doppler', 'endoscopy', 'abdomen']],
    ];
    chooser.replaceChildren(h('div', { class: 'chooser-heading' }, h('b', {}, chooserAdding ? 'Add alongside' : 'Choose an instrument'),
      h('button', { class: 'ib', 'aria-label': 'Close instrument chooser', onclick: () => { chooser.hidden = true; titleBtn.focus(); } }, svgIcon('close'))),
    ...groups.map(([name, ids]) => h('section', {}, h('h3', {}, name), ids.map((id) => {
      const [ic, desc, summary] = INFO[id], p = byId[id];
      return h('button', { class: 'instrument-option' + (open.includes(id) ? ' selected' : ''), 'aria-pressed': String(open.includes(id)), 'data-instrument': id, onclick: () => {
        chooser.hidden = true; show(id, { alongside: chooserAdding }); titleBtn.focus();
      } }, svgIcon(ic), h('span', {}, h('b', {}, p.label), h('small', {}, desc)),
      h('span', { class: 'option-value' }, frame && !store.get().imaging ? summary(frame) : ''));
    }))));
  }
  function openGrid(anchor, { alongside = false } = {}) {
    closePopover();
    if (!isVisible()) { onOpen(); setState('open'); }
    else if (state === 'peek') setState('open');
    chooserAdding = alongside && body.clientWidth >= 1100;
    const same = !chooser.hidden;
    chooser.hidden = same;
    if (!same) { renderChooser(); chooser.querySelector('.instrument-option')?.focus(); }
  }
  function show(id, { open: doOpen = true, reveal = false, alongside = false } = {}) {
    if (id === 'lobule') { onLobule?.(); return; }
    if (id === 'landscape') { pressureView = 'landscape'; id = 'profile'; }
    else if (id === 'profile') pressureView = 'profile';
    const revealWall = id === 'varixwall';
    if (revealWall) { wallDetails.open = true; id = 'endoscopy'; }
    if (!byId[id]) return;
    if (alongside && open.length === 1 && open[0] !== id && body.clientWidth >= 1100) open = [open[0], id];
    else if (!open.includes(id)) open = [id];
    chooser.hidden = true;
    if (reveal) onReveal?.(reveal);
    else if (doOpen) onOpen();
    if (state === 'peek') setState('open');
    layout();
    viewSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === pressureView)));
    if (revealWall) requestAnimationFrame(() => wallDetails.scrollIntoView({ block: 'nearest' }));
    queueRefresh();
  }
  function close() {
    chooser.hidden = true; app.classList.remove('instrument-focus');
    onClose(); titleBtn.blur();
    document.getElementById('tabInstruments')?.focus();
  }
  function ensure() { updateSize(); layout(); }
  function toggle() {
    if (isVisible()) close();
    else { onOpen(); setState('open'); ensure(); }
  }
  // Divider supports mouse, touch and keyboard. It changes layout, never pauses the engine.
  let drag = null;
  divider.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { y: e.clientY, height: workspace.clientHeight };
    divider.setPointerCapture(e.pointerId);
  });
  divider.addEventListener('pointermove', (e) => {
    if (!drag) return;
    heightRatio = clamp((drag.height + drag.y - e.clientY) / stageWrap.clientHeight, 0.25, 0.75);
    updateSize();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(ev, () => { drag = null; });
  divider.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    heightRatio = e.key === 'Home' ? 0.25 : e.key === 'End' ? 0.75 : clamp((heightRatio ?? workspace.clientHeight / stageWrap.clientHeight) + (e.key === 'ArrowUp' ? 0.05 : -0.05), 0.25, 0.75);
    updateSize();
  });
  workspace.addEventListener('click', queueRefresh);
  workspace.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!chooser.hidden) { chooser.hidden = true; titleBtn.focus(); }
    else if (state === 'focus') setState('open');
    else close();
    e.stopPropagation();
  });
  const sizeObserver = new ResizeObserver(() => {
    updateSize();
    const h0 = workspace.clientHeight;
    workspace.style.setProperty('--plot-h', `${clamp(h0 - 110, 190, 420)}px`);
    workspace.style.setProperty('--square-size', `${clamp(h0 - 120, 230, 380)}px`);
    layout();
  });
  sizeObserver.observe(stageWrap); sizeObserver.observe(body);
  store.on('compareSnap', () => updateHeader());
  function updateHeader() {
    const st = store.get(), comparing = !!st.compareSnap;
    compareBtn.setAttribute('aria-pressed', String(comparing));
    compareBtn.querySelector('span').textContent = comparing ? 'Unpin' : 'Compare';
    compareBtn.title = comparing ? 'Stop comparing with the pinned moment' : 'Pin this moment and compare before and after';
    run.querySelector('span').textContent = st.running ? 'Pause' : 'Run';
    comparison.hidden = !comparing || state === 'peek' || st.imaging;
    if (comparing && frame) {
      const a = st.compareSnap.metrics, b = frame.metrics;
      const delta = (label, v, digits, unit) => h('span', {}, label, h('b', {}, `${v > 0 ? '+' : ''}${fmt(v, digits)} ${unit}`));
      comparison.replaceChildren(h('span', { class: 'comparison-label' }, 'Change since baseline'),
        !st.hiddenReadouts?.has('trueHVPG') ? delta('HVPG', b.hvpg - a.hvpg, 1, 'mmHg') : null,
        !st.hiddenReadouts?.has('model') ? delta('Liver flow', b.liverPerfPct - a.liverPerfPct, 0, 'pp') : null,
        !st.hiddenReadouts?.has('model') ? delta('Shunting', (b.shuntFraction - a.shuntFraction) * 100, 0, 'pp') : null);
    }
    run.setAttribute('aria-pressed', String(st.running));
    live.textContent = frame ? state === 'peek' && !st.imaging ? INFO[open[0]][2](frame)
      : `${st.running ? 'Live' : 'Paused'} · ${frame.clock === 'disease' ? 'Day ' + frame.day : fmt(frame.t, 0) + ' s'} · ${st.imaging ? 'Pressures unmeasured' : 'HVPG ' + (st.hiddenReadouts?.has('trueHVPG') ? (st.lastHVPG ? fmt(st.lastHVPG.hvpg, 1) : '?') : fmt(frame.metrics.hvpg, 1)) + ' mmHg'}` : '';
  }
  function update(f, force) {
    frame = f; updateStrip(f); updateHeader();
    byId.scope.ingest(f);
    const cath = (f.params || store.get().params).catheter;
    if (cath?.vein && (!isVisible() || state === 'peek' || !open.includes('hvpg'))) byId.hvpg.update(f);
    if (!force && !isVisible()) return;
    refresh();
  }
  addEventListener('resize', () => { updateSize(); layout(); });
  setState('open'); updateSize(); layout();
  return {
    update, show, toggle, close, ensure, openGrid, profile,
    pane: (id) => id === 'landscape' ? landscape : id === 'varixwall' ? wall : byId[id],
    isOpen: (id) => isVisible() && open.includes(id === 'landscape' ? 'profile' : id === 'varixwall' ? 'endoscopy' : id),
    setState,
  };
}
