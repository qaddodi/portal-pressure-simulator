// Readout strip (the four key readouts in the vitals dock, and the rest behind its chevron) and the
// Instruments card (blueprint §9.1, §9.2).

import { createMeasureCard } from './measure.js?v=e213ba6cf9';
import { store, varixSuppressed } from './store.js?v=18136433f8';
import { EDGES } from '../engine/topology.js?v=80b8d861de';
import { h, fmt, svgIcon, closePopover, clamp } from './util.js?v=8aa5e5cdf1';
import { lobuleFlows } from './lobule-model.js?v=c4f41a94a3';
import { createProfile } from './charts.js?v=0630f760fe';
import { createPressureTime } from './pressure-time.js?v=b3d3258647';
import { createDoppler } from './doppler.js?v=0d4da37ddd';
import { createEndoscopy, createVarixWall, createAbdomen } from './instruments.js?v=80ed7310a4';


// Readouts in teaching order: pressure, then flow, then what they lead to, then the systemic
// circulation. Each readout's status (dot, bar color and word) comes from a clinical cut-off,
// listed in CUTOFFS below and in About the model: green is normal, amber borderline, red past a
// clinical threshold, dark red past the highest one where a readout has one. `scale` and `ticks`
// draw the bar under each value: where the value sits between the cut-offs.
const vel = (m) => m.pvVelMean ?? m.pvVel;
export const TILES = [
  { id: 'hvpg', group: 'pressure', k: 'HVPG', title: 'Hepatic venous pressure gradient: wedged − free hepatic venous pressure. Estimates the sinusoidal gradient; normal < 5, clinically significant ≥ 10 mmHg.', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    scale: [0, 25], ticks: [5, 10],
    st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger'),
    s: (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : 'CSPH') },
  { id: 'ppg', group: 'pressure', k: 'PPG', title: 'Portosystemic pressure gradient: portal confluence − inferior vena cava at the right atrium, directly from the model network. Unlike HVPG it also includes a block before the liver (presinusoidal or prehepatic). Normal < 6 mmHg.', why: 'ppg', hideKey: 'pv', v: (m) => m.ppg, d: 1, u: 'mmHg',
    scale: [0, 25], ticks: [6],
    st: (v) => (v < 6 ? 'ok' : 'caution'), s: (v) => (v < 6 ? 'Normal' : 'Raised') },
  { id: 'pv', group: 'pressure', k: 'Portal pressure', title: 'Portal vein pressure at the portal confluence, absolute (model value). Normal ≤ 10 mmHg.', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv',
    scale: [0, 35], ticks: [10, 15],
    st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'Raised' : 'High') },
  // Flow and velocity averaged over a few breaths (pvFlowMean, pvVelMean): breathing swings the
  // instantaneous velocity across the 12 cm/s cut-off even in a healthy patient.
  { id: 'pvflow', group: 'flow', k: 'Portal flow', ks: 'PV flow', title: 'Portal vein blood flow toward the liver, averaged over a few breaths (negative = away from it). Normal ≥ 0.9 L/min at ≥ 12 cm/s.', why: 'pvFlow', v: (m) => m.pvFlowMean ?? m.pvFlow, d: 1, u: 'L/min',
    scale: [-0.6, 2], ticks: [0, 0.9],
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(vel(m)) < 5 ? 'danger' : v < 0.9 || Math.abs(vel(m)) < 12 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? 'Reversed' : Math.abs(vel(m)) < 5 ? 'Stasis' : v < 0.9 ? 'Reduced' : Math.abs(vel(m)) < 12 ? 'Slow' : 'Normal') },
  { id: 'liver', group: 'flow', hideKey: 'model', k: 'Sinusoidal flow', ks: 'Sinusoids', title: 'Total blood flow through the liver sinusoids (portal + hepatic artery), % of this model\'s healthy baseline. A model quantity, not liver function.', why: 'liverPerf', v: (m) => m.liverPerfPct, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Reduced' : 'Low') },
  { id: 'shunt', group: 'flow', k: 'Shunted', why: 'shunt', hideKey: 'model', v: (m) => m.shuntFraction * 100, d: 0, u: '%', title: 'Share of gut and spleen blood that bypasses the liver through collaterals and shunts.',
    scale: [0, 100], ticks: [10, 30, 60],
    st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v) => (v < 10 ? 'Minimal' : v < 30 ? 'Moderate' : v < 60 ? 'Large' : 'Most') },
  { id: 'varix', group: 'effects', k: 'Varix wall stress', ks: 'Varix', why: 'varix', hideKey: 'model', v: (m) => m.varix.ratio * 100, d: 0, u: '%', ux: ' of rupture', title: 'Modeled esophageal varix wall stress (educational index: pressure × radius ÷ wall thickness, not a measurable force), as a % of the stress at which the model ruptures.',
    scale: [0, 100], ticks: [40, 70, 90],
    st: (v, m) => (m.varix.ratio >= 0.9 ? 'critical' : m.varix.ratio >= 0.7 ? 'danger' : m.varix.ratio >= 0.4 || m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (m.varix.d < 2.5 ? 'None' : m.varix.redWale ? 'Red wale signs' : { F1: 'Small (F1)', F2: 'Large (F2)', F3: 'Coiled (F3)' }[m.varix.grade.code]),
    ss: (v, m) => (m.varix.d < 2.5 ? 'None' : m.varix.redWale ? 'Red wale' : { F1: 'Small', F2: 'Large', F3: 'Coiled' }[m.varix.grade.code]) },
  { id: 'ascites', group: 'effects', pane: 'abdomen', k: 'Ascites', title: 'Free fluid in the abdomen. Grade 1 is seen on ultrasound only, grade 2 is moderate, grade 3 tense.', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L',
    scale: [0, 8], ticks: [0.15, 1.5, 5],
    st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => (m.ascites.grade === 0 ? 'None' : `Grade ${m.ascites.grade}`) },
  { id: 'spleen', group: 'effects', k: 'Spleen', title: 'Spleen length. Splenomegaly > 13 cm; the enlarged spleen traps platelets.', why: 'spleen', v: (m) => m.spleen.length, d: 1, u: 'cm',
    scale: [8, 22], ticks: [13],
    st: (v) => (v <= 13 ? 'ok' : v <= 16 ? 'caution' : 'danger'), s: (v) => (v <= 13 ? 'Normal' : v <= 16 ? 'Enlarged' : 'Large') },
];
// On the Lobule view the strip reads the lobule's own flows instead (what the card beside the lobule used to
// list): through the sinusoids, in from the portal vein and the hepatic artery, and the lymph the liver
// makes. They are not findings, so they stay out of TILES. `v` reads the frame and the store, as the lobule does.
const lobuleVal = (key) => (f, st) => lobuleFlows(f, st.healthy)[key];
export const LOBULE_TILES = [
  { id: 'lz-sin', group: 'lobule', k: 'Sinusoidal flow', ks: 'Sinusoids', title: 'Blood through the sinusoids, % of normal (portal + hepatic artery).', why: 'liverPerf', v: (f, st) => lobuleVal('flow')(f, st) * 100, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Reduced' : 'Low') },
  { id: 'lz-pv', group: 'lobule', k: 'Portal inflow', ks: 'Portal in', title: 'Blood entering the lobule from the portal venule, % of normal (negative = flowing out of the liver).', why: 'pvFlow', v: (f, st) => lobuleVal('portal')(f, st) * 100, d: 0, u: '%',
    scale: [-60, 150], ticks: [0, 50],
    st: (v) => (v < -2 ? 'critical' : v < 50 ? 'danger' : v < 75 ? 'caution' : 'ok'), s: (v) => (v < -2 ? 'Reversed' : v < 50 ? 'Low' : v < 75 ? 'Reduced' : 'Normal') },
  { id: 'lz-art', group: 'lobule', k: 'Arterial inflow', ks: 'Artery in', title: 'Blood entering the lobule from the hepatic arteriole, % of normal. It rises when the portal inflow falls (the arterial buffer response).', v: (f, st) => lobuleVal('art')(f, st) * 100, d: 0, u: '%',
    scale: [0, 200], ticks: [60, 130],
    st: (v) => (v < 60 ? 'danger' : v > 130 ? 'caution' : 'ok'), s: (v) => (v < 60 ? 'Low' : v > 130 ? 'Compensating' : 'Normal'), ss: (v) => (v < 60 ? 'Low' : v > 130 ? 'Raised' : 'Normal') },
  { id: 'lz-ly', group: 'lobule', k: 'Hepatic lymph', ks: 'Lymph', title: 'Lymph the liver forms in the space of Disse and drains to the portal tract. Normal is about 0.8 mL/min; past about three times that it overflows into the abdomen (ascites).', why: 'ascites', v: (f, st) => lobuleVal('lymph')(f, st), d: 1, u: 'mL/min',
    scale: [0, 5], ticks: [1.2, 2.4],
    st: (v, f, st) => { const r = v / lobuleFlows(f, st.healthy).lymph0; return r >= 3 ? 'danger' : r >= 1.5 ? 'caution' : 'ok'; },
    s: (v, f, st) => { const r = v / lobuleFlows(f, st.healthy).lymph0; return r >= 3 ? 'Overflow' : r >= 1.5 ? 'Raised' : 'Normal'; } },
];
export const LOBULE_PRIMARY = new Set(LOBULE_TILES.map((t) => t.id));

// A group whose readouts share a unit names it once, in its caption, so the tiles stay narrow.
export const GROUPS = [['pressure', 'Pressure'], ['flow', 'Flow'], ['effects', 'Consequences']];
// The cut-offs behind each status, as About the model lists them: [readout, normal, amber, red, dark red].
export const CUTOFFS = [
  ['HVPG (wedged − free)', '< 5 mmHg', '5–9 (subclinical)', '≥ 10 (CSPH in cirrhosis)', '—'],
  ['PPG: portosystemic gradient (portal vein − IVC)', '< 6 mmHg', '≥ 6', '—', '—'],
  ['Portal vein pressure', '≤ 10 mmHg', '11–14', '≥ 15', '—'],
  ['Portal flow', '≥ 0.9 L/min and ≥ 12 cm/s', '< 0.9 L/min or < 12 cm/s', '< 5 cm/s (stasis)', 'Reversed (hepatofugal)'],
  ['Liver perfusion', '> 75 % of normal', '56–75 %', '≤ 55 %', '—'],
  ['Shunted blood', '< 10 %', '10–29 %', '30–59 %', '≥ 60 %'],
  ['Varix wall stress (model)', '< 40 % of rupture', '40–69 %, or diameter ≥ 5 mm', '70–89 %', '≥ 90 %'],
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
// Collapsed, the strip shows the pressures (HVPG, the portosystemic gradient, portal pressure) and,
// where there is room (not on a phone), portal flow: where the pressure sends the blood.
export const PRIMARY = new Set(['hvpg', 'ppg', 'pv', 'pvflow']);

// A trend arrow marks a sustained change (over TREND_S seconds, larger than TREND_FRAC of the
// bar's range), so the heartbeat and breathing never make it flicker.
const TREND_S = 5, TREND_FRAC = 0.03;

/** The value a readout shows, or null when a case hides it and it has not been measured. */
export function readoutValue(t, m, hidden) {
  if (t.id === 'varix' && varixSuppressed()) return null;
  if (!hidden?.has(t.hideKey)) return t.v(m);
  const meas = t.id === 'hvpg' ? t.measured?.() : null;
  return meas ? meas.hvpg : null;
}

// Legacy pane names in content: flow and perfusion live in the readout strip, the pressure profile is the closest pane.
const ALIAS = { flow: 'profile', perfusion: 'profile', hvpg: 'profile', chart: 'profile' };

export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal, onLobule, onOpen, onClose, isVisible, marks, onBeat, onLayout }) {
  // ── Readout strip ─────────────────────────────────
  const tileEls = {};
  // A phone's four tiles are narrow: short names and status words where the long ones would be cut off.
  const narrow = matchMedia('(max-width: 767px)');
  const row = h('div', { class: 'ro-row' });
  strip.append(row);
  const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1) * 100;
  function tile(t, shared) {
    const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr', 'aria-hidden': 'true' }), st = h('span', { class: 'status' }), cmp = h('span', { class: 'cmp' });
    const fill = h('i', { class: 'rb-fill' });
    const bar = h('span', { class: 'rb', 'aria-hidden': 'true' }, fill, t.ticks.map((x) => h('i', { class: 'rb-tick', style: { left: pos(t, x) + '%' } })));
    const el = h('button', { class: 'metric' + (PRIMARY.has(t.id) || LOBULE_PRIMARY.has(t.id) ? ' primary' : ''), 'data-id': t.id },
      h('span', { class: 'k' }, t.ks ? [h('span', { class: 'k-l' }, t.k), h('span', { class: 'k-s' }, t.ks)] : t.k), h('span', { class: 'v' }, val, shared ? null : h('span', { class: 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null), tr), bar, h('span', { class: 's' }, st, cmp));
    el.title = `${t.title || t.k}${t.pane ? '\nClick to open the Ascites view.' : t.why ? '\nClick for what is driving it.' : ''}`;
    // Ascites opens its own instrument (amount, cause, tap, treatment) rather than a second popover.
    if (t.pane) el.addEventListener('click', () => show(t.pane, { reveal: true }));
    else if (t.why) el.addEventListener('click', () => onWhy(t.why, el));
    tileEls[t.id] = { el, t, val, tr, st, cmp, fill, hist: [], sev: null, trend: '', ariaTxt: '' };
    return el;
  }
  for (const [g, label] of [['lobule', 'Lobule, % of normal'], ...GROUPS]) {
    const ts = [...TILES, ...LOBULE_TILES].filter((t) => t.group === g);
    row.append(h('div', { class: 'ro-group', 'data-group': g, role: 'group', 'aria-label': label },
      h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, label), h('div', { class: 'ro-tiles' }, ts.map((t) => tile(t, false)))));
  }
  // The Lobule view swaps the key readouts for the lobule's flows (the group is hidden elsewhere, by CSS).
  const syncLobule = () => { const on = !!store.get().lobule; strip.classList.toggle('lob', on); for (const x of Object.values(tileEls)) x.el.classList.toggle('primary', on ? LOBULE_PRIMARY.has(x.t.id) : PRIMARY.has(x.t.id)); };
  store.on('lobule', () => { syncLobule(); setTimeout(() => dispatchEvent(new Event('resize')), 30); });
  const vitEls = VITALS.map((v) => {
    const val = h('b', {}, '—');
    const el = h(v.why ? 'button' : 'div', { class: 'vital', title: `${v.title} (${v.u})${v.why ? '\nClick for what is driving it.' : ''}` }, h('span', {}, v.k), val);
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    return { v, el, val };
  });
  row.append(h('div', { class: 'ro-group ro-systemic', 'data-group': 'systemic', role: 'group', 'aria-label': 'Systemic' },
    h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, 'Systemic'), h('div', { class: 'vb-grid' }, vitEls.map((x) => x.el))));
  const moreBtn = h('button', { class: 'ib ro-more', 'aria-expanded': 'false', 'aria-label': 'Show all readouts', title: 'All readouts' }, svgIcon('chev-down'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // Open or close the rest of the readouts; the strip grows upward from the bottom edge, so its height
  // animates between the two sizes.
  const setAll = (on, animate) => {
    if (strip.classList.contains('all') === on) return;
    const h0 = strip.offsetHeight;
    strip.classList.toggle('all', on);
    moreBtn.setAttribute('aria-expanded', String(on));
    moreBtn.setAttribute('aria-label', on ? 'Show fewer readouts' : 'Show all readouts');
    const h1 = strip.offsetHeight;
    if (animate && !reduce.matches && h0 !== h1 && strip.animate) {
      strip.animate({ height: [`${h0}px`, `${h1}px`] }, { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => dispatchEvent(new Event('resize'));
      strip.style.overflow = 'hidden'; setTimeout(() => { strip.style.overflow = ''; }, 300);
    }
    setTimeout(() => dispatchEvent(new Event('resize')), 30);
  };
  moreBtn.addEventListener('click', () => setAll(!strip.classList.contains('all'), true));
  // Drag the strip up to open it, down to close it (touch only; where the chevron is shown). It follows
  // the finger, then settles open or closed by speed or by how far it got.
  let flick = null;
  const sizes = () => { const h = strip.offsetHeight, was = strip.classList.contains('all'); strip.classList.toggle('all', !was); const o = strip.offsetHeight; strip.classList.toggle('all', was); return was ? [o, h] : [h, o]; };
  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || getComputedStyle(moreBtn).display === 'none') return;
    flick = { id: e.pointerId, y: e.clientY, t: performance.now(), on: false, v: 0, ly: e.clientY, lt: performance.now() };
  });
  strip.addEventListener('pointermove', (e) => {
    if (!flick || e.pointerId !== flick.id) return;
    const dy = e.clientY - flick.y, now = performance.now();
    if (!flick.on) {
      if (Math.abs(dy) < 8) return;
      flick.on = true; flick.wasAll = strip.classList.contains('all');
      [flick.lo, flick.hi] = sizes();
      strip.classList.add('all'); strip.style.overflow = 'hidden';
      try { strip.setPointerCapture(e.pointerId); } catch {}
    }
    e.stopPropagation();
    flick.h = Math.max(flick.lo, Math.min(flick.hi, (flick.wasAll ? flick.hi : flick.lo) - dy));
    strip.style.height = `${flick.h}px`;
    if (now - flick.lt > 30) { flick.v = (e.clientY - flick.ly) / (now - flick.lt); flick.ly = e.clientY; flick.lt = now; }
  });
  const endFlick = () => {
    const f = flick; flick = null;
    if (!f || !f.on) return;
    const open = Math.abs(f.v) > 0.3 ? f.v < 0 : f.h > (f.lo + f.hi) / 2, to = open ? f.hi : f.lo;
    const finish = () => { strip.style.height = ''; strip.style.overflow = ''; strip.classList.toggle('all', open); moreBtn.setAttribute('aria-expanded', String(open)); moreBtn.setAttribute('aria-label', open ? 'Show fewer readouts' : 'Show all readouts'); dispatchEvent(new Event('resize')); };
    if (reduce.matches || !strip.animate) return finish();
    const an = strip.animate({ height: [`${f.h}px`, `${to}px`] }, { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    strip.style.height = `${to}px`; an.onfinish = finish; an.oncancel = finish;
  };
  strip.addEventListener('pointerup', endFlick); strip.addEventListener('pointercancel', endFlick);
  row.append(moreBtn);
  // A phone held sideways has no room for every readout: it keeps the four key ones.
  const sideways = matchMedia('(max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
  const foldAll = () => { if (sideways.matches && strip.classList.contains('all')) { strip.classList.remove('all'); moreBtn.setAttribute('aria-expanded', 'false'); dispatchEvent(new Event('resize')); } };
  sideways.addEventListener('change', foldAll);
  new MutationObserver(foldAll).observe(strip, { attributes: true, attributeFilter: ['class'] });

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
    if (strip.classList.contains('lob') !== !!st0.lobule) syncLobule();
    const hidden = st0.hiddenReadouts;
    const A = st0.compareSnap?.metrics || null;
    const now = performance.now();
    for (const x of Object.values(tileEls)) {
      const { el, t } = x;
      const lz = t.group === 'lobule';
      if (lz && !st0.lobule) continue;
      const v = lz ? (st0.imaging ? null : t.v(f, st0)) : readoutValue(t, m, hidden);
      const measured = !lz && v != null && hidden?.has(t.hideKey);
      let sev, s;
      if (v == null) {
        if (x.val.textContent !== '?') x.val.textContent = '?';
        s = t.id === 'varix' && varixSuppressed() ? 'Not modeled here' : 'Not measured';
        sev = 'none';
        x.hist.length = 0;
      } else {
        const txt = fmt(v, t.d);
        if (x.val.textContent !== txt) x.val.textContent = txt;
        const a = lz ? [f, st0] : [m];
        s = measured ? 'Measured' : (t.ss && narrow.matches ? t.ss : t.s)(v, ...a);
        sev = t.st(v, ...a);
        const w = pos(t, v), o = pos(t, clamp(0, t.scale[0], t.scale[1]));
        x.fill.style.left = Math.min(w, o) + '%'; x.fill.style.width = Math.abs(w - o) + '%';
      }
      el.classList.toggle('hidden-val', v == null);
      const trend = v == null || measured ? '' : trendOf(x, v, now);
      if (trend !== x.trend) { x.trend = trend; x.tr.textContent = trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''; }
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null && !measured) {
        const d = v - (lz ? (st0.compareSnap.frame ? t.v(st0.compareSnap.frame, st0) : v) : t.v(A));
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        x.cmp.textContent = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`;
        x.cmp.className = 'cmp ' + (same ? 'same' : d > 0 ? 'up' : 'down');
        x.st.hidden = true;
      } else if (x.cmp.textContent) { x.cmp.textContent = ''; x.st.hidden = false; }
      // A new band must hold for a moment before the tile takes it, so a value hovering on a
      // cut-off does not flicker between two colors.
      if (sev !== x.sev) {
        if (x.sevNext !== sev) { x.sevNext = sev; x.sevSince = now; }
        if (!x.sev || sev === 'none' || now - x.sevSince > 1500) {
          // A value crossing into a worse band flashes once, so a change is noticed without every number on screen.
          const RANKS = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };
          if (x.sev && RANKS[sev] > RANKS[x.sev]) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
          el.dataset.sev = sev; x.sev = sev;
        }
      } else x.sevNext = null;
      if (sev === x.sev && x.st.textContent !== s) x.st.textContent = s;
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
  // The instruments. Legacy ids remain valid for lessons and actions:
  // landscape is a Pressure view; varixwall is Endoscopy's expandable wall mechanics.
  const app = document.getElementById('app');
  const workspace = head.closest('.dock');
  const stageWrap = document.getElementById('stageWrap');
  const profile = createProfile(), wall = createVarixWall();
  const endoscopy = createEndoscopy({ onAction });
  const wallDetails = h('details', { class: 'instrument-details wall-details' },
    h('summary', {}, 'Wall mechanics', h('span', {}, 'Pressure, radius & wall thickness')), wall.el);
  wall.el.className = 'instrument-view wall-view';
  endoscopy.el.append(wallDetails);
  wallDetails.addEventListener('toggle', () => { if (wallDetails.open && frame) wall.update(frame); });
  const pressure = { ...profile, id: 'profile', label: 'Pressure' };
  const measure = createMeasureCard();
  pressure.el.append(measure.el);
  const instruments = [
    pressure, createPressureTime({ marks }),
    createDoppler({ onProbe }), endoscopy, createAbdomen({ onAction }),
  ];
  const panes = instruments.map((p) => {
    p.el.classList.remove('dock-pane'); p.el.classList.add('instrument-view');
    return { ...p, el: h('section', { class: 'dock-pane', 'data-pane': p.id }, p.el) };
  });
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));
  // ── The Instruments card ──────────────────────────
  // On a wide landscape screen it is a tall card on the right (the anatomy is tall, so it keeps its
  // size); on a phone or a portrait tablet it is a sheet over the bottom of the figure. A row of
  // tabs, each with its live reading, picks the instrument in one tap. Its size and the instruments
  // open are remembered on this device.
  const INFO = {
    profile: ['activity', (f) => `${fmt(f.metrics.pv, 1)} mmHg`],
    scope: ['chart', (f) => `HVPG ${fmt(f.metrics.hvpg, 1)}`],
    doppler: ['doppler', (f) => `${fmt(Math.abs(f.metrics.pvVel), 0)} cm/s`],
    endoscopy: ['endoscope', (f) => (varixSuppressed() ? 'Not modeled' : f.metrics.varix.d < 2.5 ? 'No varices' : `Grade ${f.metrics.varix.grade.code}`)],
    abdomen: ['needle', (f) => `${fmt(f.metrics.ascites.volume / 1000, 1)} L ascites`],
  };
  const SHORT = { profile: 'Pressure', scope: 'Over time', doppler: 'Doppler', endoscopy: 'Endoscopy', abdomen: 'Ascites' };
  const ORDER = ['profile', 'scope', 'doppler', 'endoscopy', 'abdomen'];
  const saved = (() => { try { return JSON.parse(localStorage.getItem('pps.instruments') || 'null') || {}; } catch { return {}; } })();
  let open = Array.isArray(saved.open) && saved.open.every((id) => byId[id]) && saved.open.length ? saved.open.slice(0, 2) : ['profile'];
  let frame = null, state = 'open', resizeFrame = 0, picking = false;
  let heightRatio = typeof saved.h === 'number' ? saved.h : null, widthPx = typeof saved.w === 'number' ? saved.w : null;
  const remember = () => { try { localStorage.setItem('pps.instruments', JSON.stringify({ open, h: heightRatio, w: widthPx })); } catch { /* storage unavailable */ } };
  const sideMQ = matchMedia('(min-width: 700px) and (orientation: landscape)');
  const isSide = () => sideMQ.matches;

  const live = h('span', { class: 'workspace-live', 'aria-live': 'off' });
  // The head is the same as Findings' and Treat's: icon, name, a quiet status, close.
  const titleEl = h('h2', { class: 'dock-title card-title' }, svgIcon('gauge'), h('span', {}, 'Measure'), h('span', { class: 'dt-l' }));
  const closeBtn = h('button', { class: 'ib card-close workspace-close', 'aria-label': 'Close Measure', title: 'Close (Esc)', onclick: close }, svgIcon('close'));
  const divider = h('div', { class: 'workspace-divider', role: 'separator', tabindex: '0', 'aria-label': 'Instruments size' }, h('span'));
  workspace.prepend(divider);
  head.classList.add('card-head');
  head.append(titleEl, live, closeBtn);
  // The tabs: one per instrument, with its live reading.
  const tabEls = {};
  const tabs = h('div', { class: 'instr-tabs', role: 'tablist', 'aria-label': 'Instruments' }, ORDER.map((id) => {
    const val = h('small', { class: 'it-v' });
    const b = h('button', { class: 'instr-tab', role: 'tab', 'data-instrument': id, 'aria-selected': 'false', 'aria-controls': 'pane-' + id },
      svgIcon(INFO[id][0]), h('span', { class: 'it-t' }, h('b', {}, SHORT[id] || byId[id].label), val));
    b.title = byId[id].label;
    b.addEventListener('click', () => pick(id));
    tabEls[id] = { b, val };
    return b;
  }));
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = ORDER.indexOf(e.target.closest('.instr-tab')?.dataset.instrument);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? ORDER.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : ORDER.length - 1)) % ORDER.length;
    tabEls[ORDER[j]].b.focus(); pick(ORDER[j]);
  });
  const pickHint = h('div', { class: 'instr-hint', hidden: true }, 'Pick a second instrument to show with ', h('b'), '.');
  head.after(tabs, pickHint);
  for (const p of panes) {
    p.el.id = 'pane-' + p.id; p.el.setAttribute('role', 'tabpanel'); p.el.setAttribute('aria-label', p.label);
    body.append(p.el);
  }
  const comparison = h('div', { class: 'workspace-comparison', hidden: true });
  body.before(comparison);
  function refresh() {
    if (!frame || !isVisible() || state === 'peek' || !workspace.offsetParent) return;
    for (const id of open) {
      const p = byId[id];
      // live instruments keep their own history and only redraw; the rest draw from the frame
      if (id === 'scope' || id === 'doppler') p.redraw(); else p.update(frame);
      if (id === 'profile') measure.update(frame);
      if (id === 'endoscopy' && wallDetails.open) wall.update(frame);
    }
  }
  function queueRefresh() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; refresh(); });
  }
  const css = (k) => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
  function updateSize() {
    const side = isSide();
    workspace.classList.toggle('side', side);
    workspace.dataset.safe = side ? 'right' : 'bottom';
    divider.setAttribute('aria-orientation', side ? 'vertical' : 'horizontal');
    if (side) {
      const W = stageWrap.clientWidth, w = clamp(widthPx ?? Math.max(440, W * 0.38), 360, Math.max(360, W * 0.62));
      workspace.style.setProperty('--instrument-w', `${Math.round(w)}px`);
      divider.setAttribute('aria-valuenow', String(Math.round((w / W) * 100)));
    } else {
      // The sheet rises from above the vitals dock, at most to just under the top bar.
      // A lesson's step card (under the top bar) keeps its room: the sheet takes what is below it.
      const coach = document.getElementById('coach'), coachH = coach && coach.childElementCount ? coach.offsetHeight + 8 : 0;
      const max = stageWrap.clientHeight - css('--top-safe') - coachH - css('--vdock-h') - 40;
      const ratio = heightRatio ?? (matchMedia('(max-width: 767px)').matches ? 0.56 : 0.46);
      const height = Math.min(max, Math.max(180, stageWrap.clientHeight * ratio));
      workspace.style.setProperty('--instrument-h', `${Math.max(140, height)}px`);
      divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    }
  }
  function setState(next) {
    state = next;
    workspace.dataset.state = state;
    app.classList.toggle('instrument-focus', state === 'focus' && isVisible());
    divider.hidden = state !== 'open';
    body.hidden = state === 'peek';
    tabs.hidden = state === 'peek';
    endPick();
    updateHeader(); layout();
    queueRefresh();
    setTimeout(() => dispatchEvent(new Event('resize')), 30);
  }
  const canSplit = () => (isSide() ? stageWrap.clientHeight - css('--top-safe') - css('--vdock-h') >= 620 : body.clientWidth >= 1000 || workspace.clientWidth >= 1000) || state === 'focus';
  function layout() {
    // Never keep two cramped instruments after rotation or resizing.
    if (open.length > 1 && !canSplit()) open = open.slice(0, 1);
    for (const p of panes) p.el.classList.toggle('active', open.includes(p.id));
    body.classList.toggle('split', open.length > 1);
    body.classList.toggle('stack', open.length > 1 && isSide() && state !== 'focus');
    paintTitle();
    for (const id of ORDER) {
      const on = open.includes(id);
      tabEls[id].b.setAttribute('aria-selected', String(on));
      tabEls[id].b.tabIndex = id === open[0] ? 0 : -1;
      tabEls[id].b.dataset.slot = on && open.length > 1 ? String(open.indexOf(id) + 1) : '';
    }
    remember();
    queueRefresh();
    onLayout?.();
  }
  // Beside the name: the vessel the Doppler reads, with a green dot, the colour of its glow on the figure.
  function paintTitle() {
    const probe = open.length === 1 && open[0] === 'doppler' && frame?.probe ? EDGES.find((e) => e.id === frame.probe)?.label : null;
    const txt = probe || '';
    const l = titleEl.querySelector('.dt-l');
    if (l.textContent !== txt) l.textContent = txt;
    titleEl.classList.toggle('dop-on', !!probe);
  }
  function endPick() { picking = false; pickHint.hidden = true; workspace.classList.remove('picking'); }
  function toggleSecond() {
    if (open.length > 1) { open = open.slice(0, 1); endPick(); layout(); return; }
    if (picking) { endPick(); layout(); return; }
    picking = true;
    pickHint.querySelector('b').textContent = byId[open[0]].label;
    pickHint.hidden = false; workspace.classList.add('picking');
    layout();
    tabs.querySelector(`.instr-tab:not([data-instrument="${open[0]}"])`)?.focus();
  }
  function pick(id) {
    if (picking && id !== open[0]) { open = [open[0], id]; endPick(); layout(); return; }
    endPick();
    // A tab of a pair shows that instrument alone.
    open = [id];
    if (state === 'peek') setState('open');
    layout();
    workspace.querySelector('.dock-body')?.scrollTo?.(0, 0);
  }
  function openGrid(anchor, { alongside = false } = {}) {
    closePopover();
    if (!isVisible()) { onOpen(); setState('open'); }
    else if (state === 'peek') setState('open');
    if (alongside && canSplit() && open.length === 1) toggleSecond();
    else tabEls[open[0]].b.focus();
  }
  function show(id, { open: doOpen = true, reveal = false, alongside = false } = {}) {
    if (id === 'lobule') { onLobule?.(); return; }
    if (id === 'landscape' || ALIAS[id]) id = ALIAS[id] || 'profile';
    const revealWall = id === 'varixwall';
    if (revealWall) { wallDetails.open = true; id = 'endoscopy'; }
    if (!byId[id]) return;
    endPick();
    if (alongside && open.length === 1 && open[0] !== id && canSplit()) open = [open[0], id];
    else if (!open.includes(id)) open = [id];
    if (reveal) onReveal?.(reveal);
    else if (doOpen) onOpen();
    if (state === 'peek') setState('open');
    layout();
    if (revealWall) requestAnimationFrame(() => wallDetails.scrollIntoView({ block: 'nearest' }));
    queueRefresh();
  }
  function close() {
    endPick(); app.classList.remove('instrument-focus');
    onClose();
    onLayout?.();
    document.getElementById('tabInstruments')?.focus();
  }
  function ensure() { updateSize(); layout(); workspace.classList.remove('entering'); void workspace.offsetWidth; workspace.classList.add('entering'); }
  function toggle() {
    if (isVisible()) close();
    else { onOpen(); setState('open'); ensure(); }
  }
  // The divider resizes the card: its width on the right, its height as a sheet. Mouse, touch and
  // keyboard; it changes the layout, never the simulation.
  let drag = null;
  divider.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, w: workspace.clientWidth, height: workspace.clientHeight };
    workspace.classList.add('resizing');
    divider.setPointerCapture(e.pointerId);
  });
  divider.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (isSide()) widthPx = drag.w + drag.x - e.clientX;
    else heightRatio = clamp((drag.height + drag.y - e.clientY) / stageWrap.clientHeight, 0.25, 0.75);
    updateSize();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(ev, () => { if (drag) { drag = null; workspace.classList.remove('resizing'); remember(); dispatchEvent(new Event('resize')); } });
  divider.addEventListener('keydown', (e) => {
    const grow = e.key === 'ArrowUp' || e.key === 'ArrowLeft', shrink = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (!grow && !shrink && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    if (isSide()) {
      const W = stageWrap.clientWidth;
      widthPx = e.key === 'Home' ? 360 : e.key === 'End' ? W * 0.62 : workspace.clientWidth + (grow ? 40 : -40);
    } else {
      heightRatio = e.key === 'Home' ? 0.25 : e.key === 'End' ? 0.75 : clamp((heightRatio ?? workspace.clientHeight / stageWrap.clientHeight) + (grow ? 0.05 : -0.05), 0.25, 0.75);
    }
    updateSize(); remember();
  });
  workspace.addEventListener('click', queueRefresh);
  workspace.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (picking) { endPick(); layout(); }
    else if (state === 'focus') setState('open');
    else close();
    e.stopPropagation();
  });
  const sizeObserver = new ResizeObserver(() => {
    updateSize();
    const h0 = workspace.clientHeight, side = isSide() && state !== 'focus';
    // As a tall card the plots take a sensible share of the height, so a pair still fits.
    const plot = side ? clamp((body.clientHeight / (open.length > 1 ? 2 : 1)) - 90, 190, 380) : clamp(h0 - 150, 190, 420);
    workspace.style.setProperty('--plot-h', `${plot}px`);
    workspace.style.setProperty('--square-size', `${clamp(side ? workspace.clientWidth - 80 : h0 - 160, 220, 380)}px`);
    layout();
  });
  sizeObserver.observe(stageWrap); sizeObserver.observe(body);
  const coachEl = document.getElementById('coach'); if (coachEl) sizeObserver.observe(coachEl);
  sideMQ.addEventListener('change', () => { updateSize(); layout(); });
  store.on('compareSnap', () => updateHeader());
  function updateHeader() {
    const st = store.get(), comparing = !!st.compareSnap;
    comparison.hidden = !comparing || state === 'peek' || st.imaging;
    if (comparing && frame) {
      const a = st.compareSnap.metrics, b = frame.metrics;
      const delta = (label, v, digits, unit) => h('span', {}, label, h('b', {}, `${v > 0 ? '+' : ''}${fmt(v, digits)} ${unit}`));
      comparison.replaceChildren(h('span', { class: 'comparison-label' }, 'Change since baseline'),
        !st.hiddenReadouts?.has('trueHVPG') ? delta('HVPG', b.hvpg - a.hvpg, 1, 'mmHg') : null,
        !st.hiddenReadouts?.has('model') ? delta('Liver flow', b.liverPerfPct - a.liverPerfPct, 0, 'pp') : null,
        !st.hiddenReadouts?.has('model') ? delta('Shunting', (b.shuntFraction - a.shuntFraction) * 100, 0, 'pp') : null);
    }
    paintTitle();
    const txt = !frame ? '' : state === 'peek' && !st.imaging ? INFO[open[0]][1](frame)
      : frame.clock === 'disease' ? `${st.running ? 'Live' : 'Paused'} · Day ${frame.day}` : st.running ? 'Live' : 'Paused';
    if (live.textContent !== txt) live.textContent = txt;
    live.dataset.state = state === 'peek' ? 'summary' : st.running ? 'live' : 'paused';
    // Each tab carries its instrument's reading (not in a case, where the numbers are to be found).
    if (frame && isVisible()) for (const id of ORDER) {
      const v = st.imaging ? '' : INFO[id][1](frame);
      if (tabEls[id].val.textContent !== v) tabEls[id].val.textContent = v;
    }
  }
  // The heartbeat (the model's pulsatile mode) runs while a waveform instrument is on screen.
  let beat = null;
  function syncBeat() {
    const on = isVisible() && state !== 'peek' && open.some((id) => id === 'scope' || id === 'doppler');
    if (on !== beat) { beat = on; onBeat?.(on); }
  }
  function update(f, force) {
    // (The traces are fed by main.js as each frame arrives: this frame may be an older, repainted one.)
    frame = f; updateStrip(f); updateHeader(); syncBeat();
    if (!force && !isVisible()) return;
    refresh();
  }
  // The Over time and Doppler traces record every frame from the start, open or not (main.js feeds
  // them even the frames it does not paint), so they already hold data when the learner opens them.
  // Both keep a fixed window (seconds of samples, two minutes of bins), so memory stays flat.
  function ingest(f) { byId.scope.ingest(f); byId.doppler.ingest(f); }
  function clearTraces() { byId.scope.clear(); byId.doppler.clear(); }
  addEventListener('resize', () => { updateSize(); layout(); });
  setState('open'); updateSize(); layout();
  return {
    update, ingest, clearTraces, show, toggle, close, ensure, openGrid, profile,
    pane: (id) => id === 'landscape' ? profile : id === 'varixwall' ? wall : byId[id],
    isOpen: (id) => isVisible() && open.includes(id === 'landscape' ? 'profile' : id === 'varixwall' ? 'endoscopy' : id),
    setState,
  };
}
