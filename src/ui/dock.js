// Readout strip (the live monitor under the figure) and the instruments (blueprint §9.1, §9.2).

import { store } from './store.js?v=fd17378e33';
import { h, fmt, svgIcon, closePopover, clamp } from './util.js?v=fe164f31f1';
import { createProfile, createSankey, createPerfusion } from './charts.js?v=d8ff81a6fe';
import { createPressureTime } from './pressure-time.js?v=ab7e895427';
import { createDoppler } from './doppler.js?v=b6f9e679b7';
import { createHVPG, createEndoscopy, createVarixWall, createAbdomen } from './instruments.js?v=37f902d14b';
import { createLandscape } from './landscape.js?v=a29ccf558d';


// Readouts in teaching order: pressure, then flow, then what they lead to, then the systemic
// circulation. Each readout's status (dot, bar color and word) comes from a clinical cut-off,
// listed in CUTOFFS below and in About the model: green is normal, amber borderline, red past a
// clinical threshold, dark red past the highest one where a readout has one. `scale` and `ticks`
// draw the bar under each value: where the value sits between the cut-offs.
export const TILES = [
  { id: 'hvpg', group: 'pressure', k: 'HVPG', title: 'Hepatic venous pressure gradient: wedged − free hepatic venous pressure. Estimates the sinusoidal gradient; normal < 5, clinically significant ≥ 10 mmHg.', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    scale: [0, 25], ticks: [5, 10],
    st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger'),
    s: (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : 'CSPH') },
  { id: 'ppg', group: 'pressure', k: 'PPG', title: 'Portosystemic pressure gradient: portal vein − inferior vena cava, measured directly. Unlike HVPG it also includes a block before the liver (presinusoidal or prehepatic). Normal < 6 mmHg.', why: 'ppg', hideKey: 'pv', v: (m) => m.ppg, d: 1, u: 'mmHg',
    scale: [0, 25], ticks: [6],
    st: (v) => (v < 6 ? 'ok' : 'caution'), s: (v) => (v < 6 ? 'Normal' : 'Raised') },
  { id: 'pv', group: 'pressure', k: 'Portal vein', title: 'Portal vein pressure (absolute). Normal ≤ 10 mmHg.', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv',
    scale: [0, 35], ticks: [10, 15],
    st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'Raised' : 'High') },
  { id: 'pvflow', group: 'flow', k: 'Portal vein', title: 'Portal vein blood flow toward the liver (negative = away from it). Normal ≥ 0.9 L/min at ≥ 12 cm/s.', why: 'pvFlow', v: (m) => m.pvFlow, d: 1, u: 'L/min',
    scale: [-0.6, 2], ticks: [0, 0.9],
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(m.pvVel) < 5 ? 'danger' : v < 0.9 || Math.abs(m.pvVel) < 12 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? 'Reversed' : Math.abs(m.pvVel) < 5 ? 'Stasis' : v < 0.9 ? 'Reduced' : Math.abs(m.pvVel) < 12 ? 'Slow' : 'Normal') },
  { id: 'liver', group: 'flow', hideKey: 'model', k: 'Liver', title: 'Total blood flow through the liver sinusoids, % of normal (portal + hepatic artery).', why: 'liverPerf', v: (m) => m.liverPerfPct, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Reduced' : 'Low') },
  { id: 'shunt', group: 'flow', k: 'Shunted', why: 'shunt', hideKey: 'model', v: (m) => m.shuntFraction * 100, d: 0, u: '%', title: 'Share of gut and spleen blood that bypasses the liver through collaterals and shunts.',
    scale: [0, 100], ticks: [10, 30, 60],
    st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v) => (v < 10 ? 'Minimal' : v < 30 ? 'Moderate' : v < 60 ? 'Large' : 'Most') },
  { id: 'varix', group: 'effects', k: 'Varix wall', why: 'varix', hideKey: 'model', v: (m) => m.varix.ratio * 100, d: 0, u: '%', ux: ' of rupture', title: 'Esophageal varix wall tension, as a % of the tension at which it ruptures (Laplace: pressure × radius ÷ wall thickness).',
    scale: [0, 100], ticks: [40, 70, 90],
    st: (v, m) => (m.varix.ratio >= 0.9 ? 'critical' : m.varix.ratio >= 0.7 ? 'danger' : m.varix.ratio >= 0.4 || m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (m.varix.d < 2.5 ? 'None' : m.varix.redWale ? 'Red wale signs' : { F1: 'Small (F1)', F2: 'Large (F2)', F3: 'Coiled (F3)' }[m.varix.grade.code]) },
  { id: 'ascites', group: 'effects', k: 'Ascites', title: 'Free fluid in the abdomen. Grade 1 is seen on ultrasound only, grade 2 is moderate, grade 3 tense.', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L',
    scale: [0, 8], ticks: [0.15, 1.5, 5],
    st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => (m.ascites.grade === 0 ? 'None' : `Grade ${m.ascites.grade}`) },
  { id: 'spleen', group: 'effects', k: 'Spleen', title: 'Spleen length. Splenomegaly > 13 cm; the enlarged spleen traps platelets.', why: 'spleen', v: (m) => m.spleen.length, d: 1, u: 'cm',
    scale: [8, 22], ticks: [13],
    st: (v) => (v <= 13 ? 'ok' : v <= 16 ? 'caution' : 'danger'), s: (v) => (v <= 13 ? 'Normal' : v <= 16 ? 'Enlarged' : 'Large') },
];
// A group whose readouts share a unit names it once, in its caption, so the tiles stay narrow.
export const GROUPS = [['pressure', 'Pressure', 'mmHg'], ['flow', 'Flow'], ['effects', 'Consequences']];
// The cut-offs behind each status, as About the model lists them: [readout, normal, amber, red, dark red].
export const CUTOFFS = [
  ['HVPG (wedged − free)', '< 5 mmHg', '5–9 (subclinical)', '≥ 10 (CSPH in cirrhosis)', '—'],
  ['PPG: portosystemic gradient (portal vein − IVC)', '< 6 mmHg', '≥ 6', '—', '—'],
  ['Portal vein pressure', '≤ 10 mmHg', '11–14', '≥ 15', '—'],
  ['Portal flow', '≥ 0.9 L/min and ≥ 12 cm/s', '< 0.9 L/min or < 12 cm/s', '< 5 cm/s (stasis)', 'Reversed (hepatofugal)'],
  ['Liver perfusion', '> 75 % of normal', '56–75 %', '≤ 55 %', '—'],
  ['Shunted blood', '< 10 %', '10–29 %', '30–59 %', '≥ 60 %'],
  ['Varix wall tension', '< 40 % of rupture', '40–69 %, or diameter ≥ 5 mm', '70–89 %', '≥ 90 %'],
  ['Ascites', 'None', 'Grade 1', 'Grade 2–3', '—'],
  ['Spleen length', '≤ 13 cm', '13–16 cm', '> 16 cm', '—'],
];

// Systemic circulation: a compact block at the end of the strip.
export const VITALS = [
  { id: 'map', k: 'MAP', title: 'Mean arterial pressure', why: 'map', v: (m) => m.map, d: 0, u: 'mmHg', bad: (m) => m.map < 65 },
  { id: 'hr', k: 'HR', title: 'Heart rate', why: 'map', v: (m) => m.hr, d: 0, u: '/min', bad: (m) => m.hr > 110 },
  { id: 'co', k: 'CO', title: 'Cardiac output', why: 'co', v: (m) => m.co, d: 1, u: 'L/min', bad: (m) => m.co > 6.5 },
  { id: 'ra', k: 'RA', title: 'Right atrial pressure', why: 'ra', hideKey: 'ra', v: (m) => m.ra, d: 1, u: 'mmHg', bad: (m) => m.ra > 10 },
  { id: 'hb', k: 'Hb', title: 'Hemoglobin', why: null, v: (m) => m.blood.hb, d: 1, u: 'g/dL', bad: (m) => m.blood.hb < 7 },
];

// The key readouts: the only ones on a phone until the strip is expanded.
export const PRIMARY = new Set(['hvpg', 'pv', 'pvflow', 'varix']);

// A trend arrow marks a sustained change (over TREND_S seconds, larger than TREND_FRAC of the
// bar's range), so the heartbeat and breathing never make it flicker.
const TREND_S = 5, TREND_FRAC = 0.03;

/** The value a readout shows, or null when a case hides it and it has not been measured. */
export function readoutValue(t, m, hidden) {
  if (!hidden?.has(t.hideKey)) return t.v(m);
  const meas = t.id === 'hvpg' ? t.measured?.() : null;
  return meas ? meas.hvpg : null;
}

export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal, onCompare, onRun, onLobule, onOpen, onClose, isVisible, marks, onBeat }) {
  // ── Readout strip ─────────────────────────────────
  const tileEls = {};
  const row = h('div', { class: 'ro-row' });
  strip.append(row);
  const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1) * 100;
  function tile(t, shared) {
    const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr', 'aria-hidden': 'true' }), st = h('span', { class: 'status' }), cmp = h('span', { class: 'cmp' });
    const fill = h('i', { class: 'rb-fill' });
    const bar = h('span', { class: 'rb', 'aria-hidden': 'true' }, fill, t.ticks.map((x) => h('i', { class: 'rb-tick', style: { left: pos(t, x) + '%' } })));
    const el = h('button', { class: 'metric' + (PRIMARY.has(t.id) ? ' primary' : ''), 'data-id': t.id },
      h('span', { class: 'k' }, t.k), h('span', { class: 'v' }, val, shared ? null : h('span', { class: 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null), tr), bar, h('span', { class: 's' }, st, cmp));
    el.title = `${t.title || t.k}${t.why ? '\nClick for what is driving it.' : ''}`;
    if (t.why) el.addEventListener('click', () => onWhy(t.why, el));
    tileEls[t.id] = { el, t, val, tr, st, cmp, fill, hist: [], sev: null, trend: '', ariaTxt: '' };
    return el;
  }
  for (const [g, label, unit] of GROUPS) {
    const ts = TILES.filter((t) => t.group === g);
    row.append(h('div', { class: 'ro-group', 'data-group': g, role: 'group', 'aria-label': label },
      h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, label, unit ? h('span', { class: 'ro-unit' }, ` · ${unit}`) : null), h('div', { class: 'ro-tiles' }, ts.map((t) => tile(t, !!unit)))));
  }
  const vitEls = VITALS.map((v) => {
    const val = h('b', {}, '—');
    const el = h(v.why ? 'button' : 'div', { class: 'vital', title: `${v.title} (${v.u})${v.why ? '\nClick for what is driving it.' : ''}` }, h('span', {}, v.k), val);
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    return { v, el, val };
  });
  row.append(h('div', { class: 'ro-group ro-systemic', 'data-group': 'systemic', role: 'group', 'aria-label': 'Systemic' },
    h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, 'Systemic'), h('div', { class: 'vb-grid' }, vitEls.map((x) => x.el))));
  const moreBtn = h('button', { class: 'ib ro-more', 'aria-expanded': 'false', 'aria-label': 'Show all readouts', title: 'All readouts' }, svgIcon('chev-down'));
  moreBtn.addEventListener('click', () => {
    const on = strip.classList.toggle('all');
    moreBtn.setAttribute('aria-expanded', String(on));
    moreBtn.setAttribute('aria-label', on ? 'Show fewer readouts' : 'Show all readouts');
    setTimeout(() => dispatchEvent(new Event('resize')), 30);
  });
  row.append(moreBtn);

  function trendOf(x, v, now) {
    const hs = x.hist;
    if (!hs.length || now - hs[hs.length - 1][0] > 500) { hs.push([now, v]); while (hs.length && now - hs[0][0] > TREND_S * 1000 + 600) hs.shift(); }
    if (now - hs[0][0] < TREND_S * 1000 * 0.8) return '';
    const d = v - hs[0][1], thr = TREND_FRAC * (x.t.scale[1] - x.t.scale[0]);
    return d > thr ? 'up' : d < -thr ? 'down' : '';
  }

  function updateStrip(f) {
    const m = f.metrics;
    const st0 = store.get();
    const hidden = st0.hiddenReadouts;
    const A = st0.compareSnap?.metrics || null;
    const now = performance.now();
    for (const x of Object.values(tileEls)) {
      const { el, t } = x;
      const v = readoutValue(t, m, hidden);
      const measured = v != null && hidden?.has(t.hideKey);
      let sev, s;
      if (v == null) {
        if (x.val.textContent !== '?') x.val.textContent = '?';
        s = t.id === 'hvpg' ? 'Use the catheter' : 'Not measured';
        sev = 'none';
        x.hist.length = 0;
      } else {
        const txt = fmt(v, t.d);
        if (x.val.textContent !== txt) x.val.textContent = txt;
        s = measured ? 'Measured' : t.s(v, m);
        sev = t.st(v, m);
        const w = pos(t, v), o = pos(t, clamp(0, t.scale[0], t.scale[1]));
        x.fill.style.left = Math.min(w, o) + '%'; x.fill.style.width = Math.abs(w - o) + '%';
      }
      el.classList.toggle('hidden-val', v == null);
      if (x.st.textContent !== s) x.st.textContent = s;
      const trend = v == null || measured ? '' : trendOf(x, v, now);
      if (trend !== x.trend) { x.trend = trend; x.tr.textContent = trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''; }
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null && !measured) {
        const d = v - t.v(A);
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        x.cmp.textContent = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`;
        x.cmp.className = 'cmp ' + (same ? 'same' : d > 0 ? 'up' : 'down');
        x.st.hidden = true;
      } else if (x.cmp.textContent) { x.cmp.textContent = ''; x.st.hidden = false; }
      if (sev !== x.sev) { el.dataset.sev = sev; x.sev = sev; }
      const aria = `${t.title || t.k}: ${v == null ? 'not measured' : `${fmt(v, t.d)} ${t.u}${t.ux || ''}, ${s}`}${x.trend ? `, ${x.trend === 'up' ? 'rising' : 'falling'}` : ''}`;
      if (aria !== x.ariaTxt) { x.ariaTxt = aria; el.setAttribute('aria-label', aria); }
    }
    for (const x of vitEls) {
      const hid = hidden?.has(x.v.hideKey);
      const txt = hid ? '?' : fmt(x.v.v(m), x.v.d);
      if (x.val.textContent !== txt) x.val.textContent = txt;
      x.el.classList.toggle('bad', !hid && x.v.bad(m));
    }
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
    pressure, createPressureTime({ marks }), createSankey(), createPerfusion(), createHVPG(),
    createDoppler({ onProbe }), endoscopy, createAbdomen({ onAction }),
  ];
  const panes = instruments.map((p) => {
    if (p === pressure) return p;
    p.el.classList.remove('dock-pane'); p.el.classList.add('instrument-view');
    return { ...p, el: h('section', { class: 'dock-pane', 'data-pane': p.id }, p.el) };
  });
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  let open = ['profile'], frame = null, state = 'open', heightRatio = null, resizeFrame = 0;
  let chooserAdding = false;
  const INFO = {
    profile: ['activity', 'Locate resistance along a path or across the circulation.', (f) => `Portal ${fmt(f.metrics.pv, 1)} mmHg`],
    scope: ['chart', 'Portal and hepatic pressures beat by beat, over minutes or over months.', (f) => `HVPG ${fmt(f.metrics.hvpg, 1)} mmHg`],
    flow: ['vessel', 'Follow blood through the liver, collaterals and shunts.', (f) => `${Math.round(f.metrics.shuntFraction * 100)}% bypasses the liver`],
    perfusion: ['liver', 'Portal supply, arterial buffering and liver resistance.', (f) => `${Math.round(f.metrics.liverPerfPct)}% of baseline flow`],
    hvpg: ['catheter', 'Place a catheter and measure wedged minus free pressure.', () => { const m = store.get().lastHVPG; return m ? `Measured ${fmt(m.hvpg, 1)} mmHg` : 'Choose a hepatic vein'; }],
    doppler: ['doppler', 'Direction, velocity and waveform in any portal, hepatic or shunt vessel.', (f) => `${fmt(Math.abs(f.metrics.pvVel), 0)} cm/s in portal vein`],
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
      // live instruments keep their own history and only redraw; the rest draw from the frame
      if (id === 'scope' || id === 'doppler') p.redraw(); else p.update(frame);
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
    // A quiet status beside the title: live or paused (the instrument itself carries the numbers),
    // or, when folded, the one reading that instrument is about.
    const txt = !frame ? '' : state === 'peek' && !st.imaging ? INFO[open[0]][2](frame)
      : frame.clock === 'disease' ? `${st.running ? 'Live' : 'Paused'} · Day ${frame.day}` : st.running ? 'Live' : 'Paused';
    if (live.textContent !== txt) live.textContent = txt;
    live.dataset.state = state === 'peek' ? 'summary' : st.running ? 'live' : 'paused';
  }
  // The heartbeat (the model's pulsatile mode) runs while a waveform instrument is on screen.
  let beat = null;
  function syncBeat() {
    const on = isVisible() && state !== 'peek' && open.some((id) => id === 'scope' || id === 'doppler');
    if (on !== beat) { beat = on; onBeat?.(on); }
  }
  function update(f, force) {
    frame = f; updateStrip(f); updateHeader(); syncBeat();
    byId.scope.ingest(f); byId.doppler.ingest(f);
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
