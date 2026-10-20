// Readout strip (the four key readouts in the vitals dock, and the rest behind its chevron) and the
// Instruments card (blueprint §9.1, §9.2).

import { store, hiddenNow } from './store.js?v=31ee79b6ab';
import { EDGES } from '../engine/topology.js?v=4044766e96';
import { h, fmt, svgIcon, closePopover, clamp, shownOf, isPhoneLayout, swapFade, scrollBehavior, countTo, swapText, glideOnResize } from './util.js?v=5814c6b396';
import { lobuleFlows } from './lobule-model.js?v=dfa2d35a11';
import { createProfile } from './charts.js?v=ea8ada79e9';
import { createPressureTime } from './pressure-time.js?v=af39261f0f';
import { createFibroScan } from './fibroscan.js?v=6aedafa7c4';
import { createHvpgProcedure } from './hvpg-proc.js?v=3a8585d477';
import { createDoppler } from './doppler.js?v=c9e2c823d5';
import { ownsSideways, pageGo } from './swipe.js?v=60b2fc909b';
import { createEndoscopy, createVarixWall, createAbdomen } from './instruments.js?v=67947967c4';
import { createReadoutsPane } from './readouts-pane.js?v=bc19a42c17';
import { frameFor } from './frame.js?v=2ce59939b2';
import { vitalReading } from './vital-read.js?v=e902fb66cd';
import { setShown } from './shown.js?v=82ef5e29ec';
import { tenthGap } from '../engine/gap.js?v=3a5947c552';
import { compareRows } from './idle-keys.js?v=ea36a0b5c6';
const nextFrame = frameFor('dock');

// A number that changes rewrites its text node in place (setting textContent replaces the node: a DOM rebuild per paint).


// Readouts in teaching order: pressure, then flow, then what they lead to, then the systemic
// circulation. Each readout's status (bar color and word) comes from a clinical cut-off,
// listed in CUTOFFS below and in About the model: green is normal, amber borderline, red past a
// clinical threshold, dark red past the highest one where a readout has one. `scale` and `ticks`
// draw the bar under each value: where the value sits between the cut-offs.
const vel = (m) => m.pvVelMean ?? m.pvVel;
export const TILES = [
  { id: 'hvpg', group: 'pressure', k: 'HVPG', title: 'Hepatic venous pressure gradient: wedged − free hepatic venous pressure. Estimates the sinusoidal gradient; normal < 5, clinically significant ≥ 10 mmHg.', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    scale: [0, 25], ticks: [5, 10],
    st: (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger'),
    s: (v) => (v < 5 ? 'Normal' : v < 10 ? 'Mild' : 'CSPH') },
  { id: 'ppg', group: 'pressure', k: 'PPG', title: 'Portosystemic pressure gradient: portal confluence − inferior vena cava at the right atrium, directly from the model network. Unlike HVPG it also includes resistance before the liver (presinusoidal or prehepatic). Normal < 6, high ≥ 12 mmHg.', why: 'ppg', hideKey: 'pv', v: (m) => m.ppg, d: 1, u: 'mmHg',
    scale: [0, 25], ticks: [6, 12],
    st: (v) => (v < 6 ? 'ok' : v < 12 ? 'caution' : 'danger'), s: (v) => (v < 6 ? 'Normal' : v < 12 ? 'High' : 'Bleed risk') },
  { id: 'pv', group: 'pressure', k: 'Portal pressure', ks: 'Portal P', title: 'Portal vein pressure at the portal confluence, absolute (model value). Normal ≤ 10 mmHg.', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv',
    scale: [0, 35], ticks: [10, 15],
    st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'High' : 'Severe') },
  // Flow and velocity averaged over a few breaths (pvFlowMean, pvVelMean): breathing swings the
  // instantaneous velocity across the 15 cm/s cut-off even in a healthy patient.
  { id: 'pvflow', group: 'flow', k: 'Portal flow', ks: 'PV flow', title: 'Portal vein blood flow toward the liver, averaged over a few breaths (negative = away from it). Normal ≥ 0.9 L/min at ≥ 15 cm/s (Doppler).', why: 'pvFlow', v: (m) => m.pvFlowMean ?? m.pvFlow, d: 1, u: 'L/min',
    scale: [-0.6, 2], ticks: [0, 0.9],
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(vel(m)) < 9 ? 'danger' : v < 0.9 || Math.abs(vel(m)) < 15 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? 'Reversed' : Math.abs(vel(m)) < 9 ? 'Stasis' : v < 0.9 ? 'Reduced' : Math.abs(vel(m)) < 15 ? 'Slow' : 'Normal') },
  { id: 'liver', group: 'flow', hideKey: 'model', k: 'Sinusoidal flow', ks: 'Sinusoids', title: 'Total blood flow through the liver sinusoids (portal + hepatic artery), % of this model\'s healthy baseline. A model quantity, not liver function.', why: 'sinFlow', v: (m) => m.liverPerfPct, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Low' : 'Severe') },
  { id: 'shunt', group: 'flow', k: 'Shunted', why: 'shunt', hideKey: 'model', v: (m) => m.shuntFraction * 100, d: 0, u: '%', title: 'Share of gut and spleen blood that bypasses the liver through collaterals and shunts.',
    scale: [0, 100], ticks: [10, 30, 60],
    st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v) => (v < 10 ? 'Minimal' : v < 30 ? 'Moderate' : v < 60 ? 'Large' : 'Most') },
  { id: 'varix', group: 'effects', k: 'Varix wall stress', ks: 'Varix', why: 'varix', hideKey: 'model', v: (m) => m.varix.ratioShown * 100, d: 0, u: '%', ux: ' of rupture', title: 'Modeled esophageal varix wall stress (educational index: pressure × radius ÷ wall thickness, not a measurable force), as a % of the stress at which the model ruptures.',
    scale: [0, 100], ticks: [40, 70, 90],
    st: (v, m) => (m.varix.ratioShown >= 0.9 ? 'critical' : m.varix.ratioShown >= 0.7 ? 'danger' : m.varix.ratioShown >= 0.4 || m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (m.varix.d < 2.5 ? 'None' : m.varix.redWale ? 'Red wale signs' : { F1: 'Small (F1)', F2: 'Large (F2)', F3: 'Coiled (F3)' }[m.varix.grade.code]),
    ss: (v, m) => (m.varix.d < 2.5 ? 'None' : m.varix.redWale ? 'Red wale' : { F1: 'Small', F2: 'Large', F3: 'Coiled' }[m.varix.grade.code]) },
  { id: 'ascites', group: 'effects', pane: 'abdomen', k: 'Ascites', title: 'Free fluid in the abdomen. Grade 1 is seen on ultrasound only, grade 2 is moderate, grade 3 tense.', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L',
    scale: [0, 8], ticks: [0.15, 1.5, 5],
    st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => (m.ascites.grade === 0 ? 'None' : `Grade ${m.ascites.grade}`) },
  { id: 'spleen', group: 'effects', k: 'Spleen', title: 'Spleen length. Splenomegaly > 13 cm; the enlarged spleen traps platelets.', why: 'spleen', v: (m) => m.spleen.length, d: 1, u: 'cm',
    scale: [8, 22], ticks: [13],
    st: (v) => (v <= 13 ? 'ok' : v <= 16 ? 'caution' : 'danger'), s: (v) => (v <= 13 ? 'Normal' : 'Large') },
];
// On the Lobule view the strip reads the lobule's own flows instead (what the card beside the lobule used to
// list): through the sinusoids, in from the portal vein and the hepatic artery, and the lymph the liver
// makes. They are not findings, so they stay out of TILES. `v` reads the frame and the store, as the lobule does.
const lobuleVal = (key) => (f, st) => lobuleFlows(f, st.healthy)[key];
export const LOBULE_TILES = [
  { id: 'lz-sin', group: 'lobule', k: 'Sinusoidal flow', ks: 'Sinusoids', title: 'Blood through the sinusoids, % of normal (portal + hepatic artery).', why: 'sinFlow', v: (f, st) => lobuleVal('flow')(f, st) * 100, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Low' : 'Severe') },
  { id: 'lz-pv', group: 'lobule', k: 'Portal inflow', ks: 'Portal in', title: 'Blood entering the lobule from the portal venule, % of normal (negative = flowing out of the liver).', why: 'portalIn', v: (f, st) => lobuleVal('portal')(f, st) * 100, d: 0, u: '%',
    scale: [-60, 150], ticks: [0, 50],
    st: (v) => (v < -2 ? 'critical' : v < 50 ? 'danger' : v < 75 ? 'caution' : 'ok'), s: (v) => (v < -2 ? 'Reversed' : v < 50 ? 'Severe' : v < 75 ? 'Low' : 'Normal') },
  { id: 'lz-art', group: 'lobule', k: 'Arterial inflow', ks: 'Artery in', title: 'Blood entering the lobule from the hepatic arteriole, % of normal. It rises when the portal inflow falls (the arterial buffer response).', why: 'artIn', v: (f, st) => lobuleVal('art')(f, st) * 100, d: 0, u: '%',
    scale: [0, 200], ticks: [60, 130],
    st: (v) => (v < 60 ? 'danger' : v > 130 ? 'caution' : 'ok'), s: (v) => (v < 60 ? 'Low' : v > 130 ? 'Compensating' : 'Normal'), ss: (v) => (v < 60 ? 'Low' : v > 130 ? 'High' : 'Normal') },
  { id: 'lz-ly', group: 'lobule', k: 'Hepatic lymph', ks: 'Lymph', title: 'Lymph the liver forms in the space of Disse and drains to the portal tract. Normal is about 0.8 mL/min; past about three times that it overflows into the abdomen (ascites).', why: 'hepLymph', v: (f, st) => lobuleVal('lymph')(f, st), d: 1, u: 'mL/min',
    scale: [0, 5], ticks: [1.2, 2.4],
    st: (v, f, st) => { const r = v / lobuleFlows(f, st.healthy).lymph0; return r >= 3 ? 'danger' : r >= 1.5 ? 'caution' : 'ok'; },
    s: (v, f, st) => { const r = v / lobuleFlows(f, st.healthy).lymph0; return r >= 3 ? 'Overflow' : r >= 1.5 ? 'High' : 'Normal'; } },
];
// Collapsed, the lobule view keeps its two key flows: through the sinusoids and in from the portal venule.
export const LOBULE_PRIMARY = new Set(['lz-sin', 'lz-pv']);

// A group whose readouts share a unit names it once, in its caption, so the tiles stay narrow.
export const GROUPS = [['pressure', 'Pressure'], ['flow', 'Flow'], ['effects', 'Consequences']];
// The cut-offs behind each status, as About the model lists them: [readout, normal, amber, red, dark red].
export const CUTOFFS = [
  ['HVPG (wedged − free)', '< 5 mmHg', '5–9 (subclinical)', '≥ 10 (CSPH in cirrhosis)', '—'],
  ['PPG: portosystemic gradient (portal vein − IVC)', '< 6 mmHg', '6–11', '≥ 12', '—'],
  ['Portal vein pressure', '≤ 10 mmHg', '11–14', '≥ 15', '—'],
  ['Portal flow', '≥ 0.9 L/min and ≥ 15 cm/s', '< 0.9 L/min or < 15 cm/s', '< 9 cm/s (stasis)', 'Reversed (hepatofugal)'],
  ['Sinusoidal flow', '> 75 % of normal', '56–75 %', '≤ 55 %', '—'],
  ['Shunted blood', '< 10 %', '10–29 %', '30–59 %', '≥ 60 %'],
  ['Varix wall stress (model)', '< 40 % of rupture', '40–69 %, or diameter ≥ 5 mm', '70–89 %', '≥ 90 %'],
  ['Ascites', 'None', 'Grade 1', 'Grade 2–3', '—'],
  ['Spleen length', '≤ 13 cm', '13–16 cm', '> 16 cm', '—'],
];

// Systemic circulation: a compact obstruction at the end of the strip.
export const VITALS = [
  { id: 'map', k: 'MAP', title: 'Mean arterial pressure', why: 'map', v: (m) => m.vitals?.map ?? m.map, d: 0, u: 'mmHg', cut: 65, low: true, hys: 2 },
  { id: 'hr', k: 'HR', title: 'Heart rate', why: 'hr', v: (m) => m.vitals?.hr ?? m.hr, d: 0, u: '/min', cut: 110, hys: 3 },
  { id: 'co', k: 'CO', title: 'Cardiac output', why: 'co', v: (m) => m.vitals?.co ?? m.co, d: 1, u: 'L/min', cut: 6.5, hys: 0.2 },
  { id: 'ra', k: 'RA', title: 'Right atrial pressure', why: 'ra', hideKey: 'ra', v: (m) => m.vitals?.ra ?? m.ra, d: 1, u: 'mmHg', cut: 10, hys: 0.5 },
  { id: 'hb', k: 'Hb', title: 'Hemoglobin', why: 'hb', v: (m) => m.blood.hb, d: 1, u: 'g/dL', cut: 7, low: true, hys: 0.2 },
];

// The key readouts: collapsed, the bar shows only the two gradients (HVPG and the portosystemic
// gradient) on every device; the rest open with the chevron.
export const PRIMARY = new Set(['hvpg', 'ppg']);
// The bar's two gradients do nothing when tapped for now (the handlers in tile() stay for when they return).
const BAR_INERT = PRIMARY;

// A trend arrow marks a sustained change (over TREND_S seconds, larger than TREND_FRAC of the
// bar's range), so the heartbeat and breathing never make it flicker.
const TREND_S = 5, TREND_FRAC = 0.03;

/** The value a readout shows, or null when it is hidden and has not been measured. */
export function readoutValue(t, m, hidden) {
  if (!hidden?.has(t.hideKey)) return t.v(m);
  const meas = t.id === 'hvpg' ? t.measured?.() : null;
  return meas ? meas.hvpg : null;
}

// Legacy pane names in content: flow and perfusion live in the readout strip, the pressure profile is the closest pane.
const ALIAS = { flow: 'profile', perfusion: 'profile', chart: 'profile' };

export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal, onLobule, onOpen, onClose, isVisible, marks, onBeat, onLayout }) {
  // One app-wide relayout for a burst of changes (a mode change also changes the lobule): every resize
  // listener (the figure, the timeline, the presenter) runs once, not once per key.
  let rzT = 0;
  const resizeSoon = () => { clearTimeout(rzT); rzT = setTimeout(() => dispatchEvent(new Event('resize')), 30); };
  // ── Readout strip ─────────────────────────────────
  const ends = { pv: {}, ivc: {}, whvp: {}, fhvp: {} };   // (the gradients' readings, each with the tiles' running mean)
  const tileEls = {};
  // A phone's four tiles are narrow: short names and status words where the long ones would be cut off.
  const narrow = matchMedia('(max-width: 1279px)');   // phones, tablets and narrow windows: short readout names
  const row = h('div', { class: 'ro-row' });
  strip.append(row);
  const pos = (t, v) => clamp((v - t.scale[0]) / (t.scale[1] - t.scale[0]), 0, 1) * 100;
  function tile(t, shared) {
    const val = h('span', { class: 'val' }, '—'), tr = h('span', { class: 'tr', 'aria-hidden': 'true' }), st = h('span', { class: 'status' }), cmp = h('span', { class: 'cmp' });
    // (Room for two whole digits and the tile's decimals, "16.9" or "62", in whole pixels: a reading keeps its width as it
    // changes, and a tile is never wider than its usual reading, so a phone's row still fits.)
    val.style.setProperty('--vr', `round(up, calc(${2 + t.d}ch${t.d ? ' + 0.26em' : ''}), 1px)`);
    const fill = h('i', { class: 'rb-fill' });
    const bar = h('span', { class: 'rb', 'aria-hidden': 'true' }, fill, t.ticks.map((x) => h('i', { class: 'rb-tick', style: { left: pos(t, x) + '%' } })));
    // The bar's HVPG and PPG are plain readouts for now: no tap action, button or focus stop (the Readouts tab's tiles still open "why").
    const inert = BAR_INERT.has(t.id);
    const el = h(inert ? 'div' : 'button', { class: 'metric' + (inert ? ' inert' : '') + (PRIMARY.has(t.id) || LOBULE_PRIMARY.has(t.id) ? ' primary' : ''), 'data-id': t.id, ...(inert ? { role: 'group' } : {}) },
      h('span', { class: 'k' }, t.ks ? [h('span', { class: 'k-l' }, t.k), h('span', { class: 'k-s' }, t.ks)] : t.k), h('span', { class: 'v' }, val, shared ? null : h('span', { class: 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null), tr), bar, h('span', { class: 's' }, st, cmp));
    el.title = `${t.title || t.k}${inert ? '' : t.pane ? '\nClick to open the Ascites view.' : t.why ? '\nClick for what is driving it.' : ''}`;
    // Ascites opens its own instrument (amount, cause, tap, treatment) rather than a second popover.
    if (inert) { /* readout only */ }
    else if (t.pane) el.addEventListener('click', () => show(t.pane, { reveal: true }));
    // HVPG not yet measured (Explore): the tile opens the catheter procedure instead.
    else if (t.why) el.addEventListener('click', () => (t.id === 'hvpg' && readoutValue(t, {}, hiddenNow()) == null ? show('hvpg', { reveal: true }) : onWhy(t.why, el)));
    tileEls[t.id] = { el, t, val, tr, st, cmp, fill, hist: [], sev: null, trend: '', ariaTxt: '' };
    return el;
  }
  for (const [g, label] of [['lobule', 'Lobule, % of normal'], ...GROUPS]) {
    const ts = [...TILES, ...LOBULE_TILES].filter((t) => t.group === g);
    row.append(h('div', { class: 'ro-group', 'data-group': g, role: 'group', 'aria-label': label },
      h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, label), h('div', { class: 'ro-tiles' }, ts.map((t) => tile(t, false)))));
  }
  // The Lobule view swaps the key readouts for the lobule's flows (the group is hidden elsewhere, by CSS).
  // Entering or leaving it, the bar's readings crossfade (swapFade) rather than switch groups in one frame (motion review P12).
  const applyLobule = () => { const on = !!store.get().lobule, pri = on ? LOBULE_PRIMARY : PRIMARY; strip.classList.toggle('lob', on); for (const x of Object.values(tileEls)) x.el.classList.toggle('primary', pri.has(x.t.id)); };
  // (The play, clock and Compare beside them glide to wherever the new readings' width puts them: RF4.)
  const syncLobule = () => {
    const same = strip.classList.contains('lob') === !!store.get().lobule, tl = document.getElementById('timeline');
    if (!same && tl) glideOnResize(tl, ':scope > *', { also: [strip, document.getElementById('vdock')] });
    swapFade(strip, () => { applyLobule(); resizeSoon(); }, { instant: same });
  };
  // A paused model sends no frames: fill the tiles from the last one at once (no dashes).
  for (const k of ['lobule', 'mode']) store.on(k, () => { syncLobule(); if (frame) updateStrip(frame); resizeSoon(); });
  // (A measurement, the Always show HVPG switch or a new patient's hidden readouts change what the tiles show: repaint
  // them from the last frame now, or a paused model keeps showing "Not measured" or the last patient's band until Play.)
  for (const k of ['hvpgMeasured', 'showHvpg', 'hiddenReadouts', 'lastHVPG', 'presetId']) store.on(k, () => { if (frame) update(frame); });
  syncLobule();
  const vitEls = VITALS.map((v) => {
    const val = h('b', {}, '—');
    const el = h(v.why ? 'button' : 'div', { class: 'vital', title: `${v.title} (${v.u})${v.why ? '\nClick for what is driving it.' : ''}` }, h('span', {}, v.k), val);
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    return { v, el, val };
  });
  row.append(h('div', { class: 'ro-group ro-systemic', 'data-group': 'systemic', role: 'group', 'aria-label': 'Systemic' },
    h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, 'Systemic'), h('div', { class: 'vb-grid' }, vitEls.map((x) => x.el))));
  // The bar keeps only the key readouts; every readout lives in Tests > Readouts (readouts-pane.js), so the
  // strip no longer opens.

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
    const hidden = hiddenNow(st0);
    const A = st0.compareSnap?.metrics || null;
    const now = performance.now();
    // The gradients' two readings each get the tiles' running mean, and the gradient is their difference as shown (one
    // decimal): the Pressure chart writes the same two readings at its brackets' ends, so its labels, the bar and the
    // readings add up (sweep 2 review item 13: PPG 17.8 beside 22.9 and 5.5).
    const sm = {};
    for (const k of ['pv', 'ivc', 'whvp', 'fhvp']) {
      const raw = m?.[k], e = ends[k];
      let v = raw;
      if (Number.isFinite(raw) && Number.isFinite(e.sm) && st0.running && Math.abs(raw - e.sm) < 2) v = e.sm + (raw - e.sm) * Math.min(1, (now - e.smT) / 1200);
      e.sm = v; e.smT = now; sm[k] = v; setShown(k, v);
    }
    const gap = { hvpg: tenthGap(sm.whvp, sm.fhvp, null), ppg: tenthGap(sm.pv, sm.ivc, null) };
    for (const x of Object.values(tileEls)) {
      const { el, t } = x;
      const lz = t.group === 'lobule';
      if (lz && !st0.lobule) continue;
      const raw = lz ? (st0.imaging ? null : t.v(f, st0)) : readoutValue(t, m, hidden);
      // The beat swings every value a little: the tile shows a running mean (about a second), so the
      // number stays steady; a real step (beyond a tenth of the scale) or a paused model shows at once.
      let v = raw, eased = false;
      const live = !lz && t.id in gap && raw != null && raw === t.v(m) && gap[t.id] != null;   // (a live gradient, not a measured one)
      const near = (a) => a != null && x.sm != null && st0.running && t.scale && Math.abs(a - x.sm) < 0.1 * Math.abs(t.scale[1] - t.scale[0]);
      if (live) { v = gap[t.id]; eased = near(v); }
      else if (near(raw)) { v = x.sm + (raw - x.sm) * Math.min(1, (now - x.smT) / 1200); eased = true; }
      x.sm = v; x.smT = now;
      if (!lz) setShown(t.id, v);
      const measured = !lz && v != null && hidden?.has(t.hideKey);
      let sev, s;
      if (v == null) {
        countTo(x.val, null);
        s = 'Not measured';
        sev = 'none';
        x.hist.length = 0;
      } else {
        // (A step the running mean doesn't ease, a paused edit or a treatment, rolls to the new number: P17.)
        countTo(x.val, v, t.d, { eased });
        const a = lz ? [f, st0] : [m], vs = shownOf(v, t.d);   // (the word judges the number shown: "5.0 L" is Grade 3)
        s = measured ? 'Measured' : (t.ss && narrow.matches ? t.ss : t.s)(vs, ...a);
        sev = t.st(vs, ...a);
        const w = pos(t, v), o = pos(t, clamp(0, t.scale[0], t.scale[1]));
        const fl = Math.min(w, o) / 100, fw = Math.abs(w - o) / 100;
        if (x.fillL !== fl || x.fillW !== fw) { x.fillL = fl; x.fillW = fw; x.fill.style.setProperty('--fl', fl); x.fill.style.setProperty('--fw', fw); }
      }
      el.classList.toggle('hidden-val', v == null);
      const trend = v == null || measured ? '' : trendOf(x, v, now);
      if (trend !== x.trend) { x.trend = trend; swapText(x.tr, trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''); }
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null && !measured) {
        const d = v - (lz ? (st0.compareSnap.frame ? t.v(st0.compareSnap.frame, st0) : v) : t.v(A));
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        x.cmp.textContent = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`;
        x.cmp.className = 'cmp ' + (same ? 'same' : d > 0 ? 'up' : 'down');
        x.st.hidden = true;
      } else if (x.cmp.textContent) { x.cmp.textContent = ''; x.st.hidden = false; }
      // A new band must hold for a moment before the tile takes it, so a value hovering on a
      // cut-off does not flicker between two colors. (A paused model sends no more frames: it takes the band at once.)
      if (sev !== x.sev) {
        if (x.sevNext !== sev) { x.sevNext = sev; x.sevSince = now; }
        if (!x.sev || sev === 'none' || !st0.running || now - x.sevSince > 1500) {
          // A value crossing into a worse band flashes once, so a change is noticed without every number on screen.
          const RANKS = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };
          if (x.sev && RANKS[sev] > RANKS[x.sev]) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
          el.dataset.sev = sev; x.sev = sev;
        }
      } else x.sevNext = null;
      if (sev === x.sev) { const un = v == null; swapText(x.st, s, () => x.st.classList.toggle('unmeas', un)); }
      const aria = `${t.title || t.k}: ${v == null ? 'not measured' : `${fmt(v, t.d)} ${t.u}${t.ux || ''}, ${s}`}${x.trend ? `, ${x.trend === 'up' ? 'rising' : 'falling'}` : ''}`;
      if (aria !== x.ariaTxt) { x.ariaTxt = aria; el.setAttribute('aria-label', aria); }
    }
    for (const x of vitEls) {
      const hid = hidden?.has(x.v.hideKey);
      const r = vitalReading(x, m, st0.running, now);
      countTo(x.val, hid ? null : r.v, x.v.d, { eased: st0.running });
      x.el.classList.toggle('bad', !hid && r.bad);
    }
  }

  // ── Instrument workspace ─────────────────────────
  // The instruments. Legacy ids remain valid for actions:
  // landscape is a Pressure view; varixwall is Scope's Wall mechanics tab.
  const app = document.getElementById('app');
  const workspace = head.closest('.dock');
  const stageWrap = document.getElementById('stageWrap');
  const profile = createProfile(), wall = createVarixWall();
  const endoscopy = createEndoscopy({ onAction });
  wall.el.className = 'instrument-view wall-view';
  const pressure = { ...profile, id: 'profile', label: 'Pressure' };
  // Every readout the bottom bar used to carry, live, in its own tab.
  const readouts = createReadoutsPane({ tiles: TILES, groups: GROUPS, vitals: VITALS, readoutValue, onWhy, show });
  const instruments = [
    pressure, createPressureTime({ marks }),
    // On a sheet (phone, portrait tablet) the procedure folds the card down so the anatomy shows it.
    createHvpgProcedure(),
    createDoppler({ onProbe }), endoscopy, createAbdomen({ onAction }), createFibroScan(), readouts,
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
    scope: ['chart', (f) => (hiddenNow()?.has('trueHVPG') ? `PV ${fmt(f.metrics.pv, 1)}` : `HVPG ${fmt(f.metrics.hvpg, 1)}`)],
    hvpg: ['catheter', (f) => { const st = store.get(), meas = st.lastHVPG; return !hiddenNow(st)?.has('trueHVPG') ? `${fmt(f.metrics.hvpg, 1)} mmHg` : meas ? `${fmt(meas.hvpg, 1)} mmHg` : 'Not measured'; }],
    doppler: ['doppler', (f) => `${fmt(Math.abs(f.metrics.pvVel), 0)} cm/s`],
    endoscopy: ['endoscope', (f) => (f.metrics.varix.d < 2.5 ? 'No varices' : `Grade ${f.metrics.varix.grade.code}`)],
    abdomen: ['needle', (f) => `${fmt(f.metrics.ascites.volume / 1000, 1)} L ascites`],
    fibroscan: ['gauge', (f) => `${fmt(f.metrics.lsm, 0)} kPa`],
    readouts: ['grid', (f) => readouts.summary(f)],
  };
  const SHORT = { profile: 'Pressure', scope: 'Over time', hvpg: 'HVPG', doppler: 'Doppler', endoscopy: 'Endoscopy', abdomen: 'Ascites', fibroscan: 'FibroScan', readouts: 'Readouts' };
  // Narrow cards use these shorter names so all six tabs always fit without scrolling.
  const TINY = { endoscopy: 'Scope', fibroscan: 'Fibro' };
  const ORDER = ['profile', 'scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts'];
  // Pressure (along the circuit) and Over time (the same pressures through time) share one tab with a
  // small switch inside it; 'scope' stays a pane of its own, so the Presenter still reaches it.
  const TABS = ORDER.filter((id) => id !== 'scope');
  const tabOf = (id) => (id === 'scope' ? 'profile' : id);
  const saved = (() => { try { return JSON.parse(localStorage.getItem('pps.instruments') || 'null') || {}; } catch { return {}; } })();
  let open = Array.isArray(saved.open) && saved.open.every((id) => byId[id]) && saved.open.length ? saved.open.slice(0, 2) : ['profile'];
  let frame = null, state = 'open', resizeFrame = 0, picking = false;
  let heightRatio = typeof saved.h === 'number' ? saved.h : null, widthPx = typeof saved.w === 'number' ? saved.w : null;
  const remember = () => { try { localStorage.setItem('pps.instruments', JSON.stringify({ open, h: heightRatio, w: widthPx })); } catch { /* storage unavailable */ } };
  // A phone held sideways (667x375 and up) docks on the right too, like a narrow iPad: the figure keeps the full height.
  const sideMQ = matchMedia('(min-width: 700px) and (orientation: landscape), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
  const sidewaysMQ = matchMedia('(max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
  const isSide = () => sideMQ.matches;

  const live = h('span', { class: 'workspace-live', 'aria-live': 'off' });
  // The head is the same as Findings' and Treat's: icon, name, a quiet status, close.
  const titleEl = h('h2', { class: 'dock-title card-title' }, h('span', {}, 'Tests'), h('span', { class: 'dt-l' }));
  const closeBtn = h('button', { class: 'ib card-close workspace-close', 'aria-label': 'Close Tests', title: 'Close (Esc)', onclick: close }, svgIcon('close'));
  const divider = h('div', { class: 'workspace-divider', role: 'separator', tabindex: '0', 'aria-label': 'Instruments size' }, h('span'));
  workspace.prepend(divider);
  head.classList.add('card-head', 'tabbed');
  head.append(titleEl, live, closeBtn);
  // The tabs: one per instrument, with its live reading.
  const tabEls = {};
  const tabs = h('div', { class: 'instr-tabs ws-tabs', role: 'tablist', 'aria-label': 'Tests' }, TABS.map((id) => {
    const val = h('small', { class: 'it-v' });
    const b = h('button', { class: 'instr-tab', role: 'tab', 'data-instrument': id, 'aria-selected': 'false', 'aria-controls': 'pane-' + id },
      svgIcon(INFO[id][0]), h('span', { class: 'it-t' }, h('b', {}, h('span', { class: 'it-full' }, SHORT[id] || byId[id].label), h('span', { class: 'it-short' }, TINY[id] || SHORT[id] || byId[id].label)), val));
    b.title = byId[id].label;
    b.addEventListener('click', () => pick(id));
    tabEls[id] = { b, val };
    return b;
  }));
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.indexOf(e.target.closest('.instr-tab')?.dataset.instrument);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    tabEls[TABS[j]].b.focus(); pick(TABS[j]);
  });
  const pickHint = h('div', { class: 'instr-hint', hidden: true }, 'Pick a second instrument to show with ', h('b'), '.');
  const tabsBox = tabs;
  // The row never scrolls: a wide card shows every full name, a narrower one the short names over their icons.
  // Tightest (a phone's sheet, beside the close button): only the open tab keeps its name, the others are icons.
  // (Tightest and still too narrow for the open tab's whole name beside the icons: that tab is an icon too, never a cut name.)
  const fitTabs = () => {
    const w = tabs.clientWidth;
    if (!w) return;
    tabs.classList.toggle('compact', w < 780); tabs.classList.toggle('narrow', w < 520); tabs.classList.toggle('tight', w < 420);
    tabs.classList.remove('bare');
    if (w < 420) {
      const on = tabs.querySelector('.instr-tab[aria-selected="true"]'), t = on?.querySelector('.it-t b');
      const need = [...tabs.children].reduce((a, b) => a + (b === on ? 0 : 26), 0) + (on ? on.offsetWidth - (on.querySelector('.it-t')?.offsetWidth || 0) + (t?.scrollWidth || 0) + 5 : 0) + 2 * (tabs.children.length - 1) + 6;
      if (need > w) tabs.classList.add('bare');
    }
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fitTabs).observe(tabs);
  fitTabs();
  // The tabs sit in the head itself, with the close button at the row's end: one slim row instead of a title row
  // over a tab row. The title and its quiet status show only while the tabs are hidden (the folded peek state).
  closeBtn.before(tabsBox);
  head.after(pickHint);
  // A phone's Tests card (over the thumb dock): a sideways drag on the card pages between the tabs. The open pane follows
  // the finger with the next (or previous) tab's pane beside it; on release it eases to whichever is nearer, or on to the
  // next one after a quick flick. A vertical pull stays the sheet's (it closes or resizes the card).
  let sw = null, settle = null;   // settle: the last swipe's switch, while its panes are still easing
  const paneFor = (id) => (panes.find((p) => p.id === id) || panes.find((p) => tabOf(p.id) === id))?.el;
  const clearSwipe = (els) => { for (const e of els) if (e) { e.style.transform = ''; e.style.transition = ''; e.classList.remove('swipe-peer'); } };
  body.addEventListener('touchstart', (e) => {
    // A second swipe before the first has settled finishes the first at once, so it starts from the new tab (review #21).
    settle?.();
    sw = e.touches.length === 1 && app.classList.contains('thumb') && open.length === 1 && !ownsSideways(e.target, { stop: body })
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), on: false, dx: 0 } : null;
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.on) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; return; }   // (vertical: the sheet's, or the pane's scroll)
      sw.on = true; sw.cur = body.querySelector('.dock-pane.active'); sw.i = TABS.indexOf(tabOf(open[0])); sw.w = body.clientWidth;
    }
    if (e.cancelable) e.preventDefault();
    const d = dx < 0 ? 1 : -1, j = sw.i + d;
    const nb = j >= 0 && j < TABS.length ? paneFor(TABS[j]) : null;
    if (nb !== sw.nb) { clearSwipe([sw.nb]); sw.nb = nb; sw.j = j; if (nb) nb.classList.add('swipe-peer'); }
    sw.dx = nb ? dx : dx / 3;   // (past the first or last tab it gives a little and springs back)
    sw.cur.style.transform = `translateX(${sw.dx}px)`;
    if (nb) nb.style.transform = `translateX(${sw.dx + d * sw.w}px)`;
  }, { passive: false });
  const endSwipe = () => {
    const s = sw; sw = null;
    if (!s?.on) return;
    const ms = performance.now() - s.t, go = !!s.nb && pageGo(s.dx, ms, s.w);
    const d = s.dx < 0 ? 1 : -1, ease = 'transform .24s var(--ease)';
    s.cur.style.transition = ease; if (s.nb) s.nb.style.transition = ease;
    s.cur.style.transform = go ? `translateX(${-d * s.w}px)` : '';
    if (s.nb) s.nb.style.transform = go ? 'translateX(0)' : `translateX(${d * s.w}px)`;
    const done = () => {
      clearTimeout(timer); settle = null;
      // (The pane that slid in is already in place: it must not play its entrance again once the drag's classes go, a blink.)
      if (go) s.nb?.classList.add('landed');
      clearSwipe([s.cur, s.nb]);
      if (go) { pick(TABS[s.j]); tabEls[TABS[s.j]].b.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() }); }
    };
    const timer = setTimeout(done, 250);
    settle = done;
  };
  body.addEventListener('touchend', endSwipe, { passive: true });
  body.addEventListener('touchcancel', endSwipe, { passive: true });
  // The switch inside the Pressure tab: the chart along the circuit, or the same pressures over time.
  const pressureSwitch = (own) => h('div', { class: 'pressure-switch', role: 'group', 'aria-label': 'Pressure view' },
    [['profile', 'Along the circuit'], ['scope', 'Over time']].map(([id, label]) => h('button', {
      type: 'button', class: 'ps-btn', 'data-view': id, 'aria-pressed': String(id === own),
      onclick: () => { if (id !== own) { open = open.map((x) => (x === own ? id : x)); layout(); workspace.querySelector('.dock-body')?.scrollTo?.(0, 0); } },
    }, label)));
  for (const p of panes) {
    if (tabOf(p.id) === 'profile') p.el.prepend(pressureSwitch(p.id));
    p.el.id = 'pane-' + p.id; p.el.setAttribute('role', 'tabpanel'); p.el.setAttribute('aria-label', p.label);
    body.append(p.el);
  }
  // Scope has the same kind of switch: the endoscopic view, or the wall mechanics behind it.
  let endoSub = 'scope';
  const endoPane = byId.endoscopy.el;
  const endoSwitch = h('div', { class: 'pressure-switch', role: 'group', 'aria-label': 'Scope view' },
    [['scope', 'Scope view'], ['wall', 'Wall mechanics']].map(([v, label]) => h('button', {
      type: 'button', class: 'ps-btn', 'data-view': v, 'aria-pressed': String(v === 'scope'), onclick: () => setEndoSub(v),
    }, label)));
  function setEndoSub(v) {
    endoSub = v; endoPane.dataset.sub = v;
    for (const b of endoSwitch.children) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    if (frame) nextFrame(() => (v === 'wall' ? wall : endoscopy).update(frame));
    fitHeight();
  }
  endoPane.prepend(endoSwitch); endoPane.append(wall.el); endoPane.dataset.sub = endoSub;
  const comparison = h('div', { class: 'workspace-comparison', hidden: true });
  body.before(comparison);
  // A pane that scrolls (Ascites on a phone) is left alone while a finger is on it and for a moment after, so
  // the live numbers cannot interrupt the scroll; it catches up as soon as the finger has gone.
  let touching = false, holdUntil = 0, catchUp = 0;
  const holding = () => touching || performance.now() < holdUntil;
  body.addEventListener('scroll', () => { holdUntil = performance.now() + 200; }, { capture: true, passive: true });
  body.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  for (const t of ['touchend', 'touchcancel']) body.addEventListener(t, () => { touching = false; holdUntil = performance.now() + 200; clearTimeout(catchUp); catchUp = setTimeout(refresh, 260); }, { passive: true });
  // Whether the card is displayed (offsetParent: not display: none), kept by an observer: read on every model frame, after
  // the tiles' writes, it made the browser restyle and lay the page out in the middle of the frame (round 2 review, P5). A
  // card that comes into view catches up at once.
  let displayed = null;
  if (typeof ResizeObserver === 'function') new ResizeObserver((es) => { const b = es[es.length - 1].contentRect, on = b.width > 0 || b.height > 0; if (on !== displayed) { displayed = on; if (on) queueRefresh(); } }).observe(workspace);
  const isDisplayed = () => (displayed == null ? !!workspace.offsetParent : displayed);
  function refresh() {
    if (!frame || !isVisible() || state === 'peek' || !isDisplayed()) return;
    for (const id of open) {
      const p = byId[id];
      if (id !== 'scope' && id !== 'doppler' && holding() && p.el.scrollHeight > p.el.clientHeight + 1) continue;
      // live instruments keep their own history and only redraw; the rest draw from the frame
      if (id === 'scope' || id === 'doppler') p.redraw(); else if (id === 'endoscopy' && endoSub === 'wall') wall.update(frame); else p.update(frame);
    }
  }
  function queueRefresh() {
    if (resizeFrame) return;
    resizeFrame = nextFrame(() => { resizeFrame = 0; refresh(); });
  }
  const css = (k) => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
  function updateSize() {
    const side = isSide();
    workspace.classList.toggle('side', side);
    workspace.dataset.safe = side ? 'right' : 'bottom';
    divider.setAttribute('aria-orientation', side ? 'vertical' : 'horizontal');
    if (side) {
      const W = stageWrap.clientWidth, w = clamp(widthPx ?? (sidewaysMQ.matches ? Math.max(340, W * 0.45) : Math.max(440, W * 0.38)), sidewaysMQ.matches ? 320 : 360, Math.max(360, W * 0.62));
      workspace.style.setProperty('--instrument-w', `${Math.round(w)}px`);
      app.style.setProperty('--side-ws-w', `${Math.round(w)}px`);   // (a sideways phone's play bar ends at the card)
      divider.setAttribute('aria-valuenow', String(Math.round((w / W) * 100)));
    } else {
      // The sheet rises from above the vitals dock, at most to just under the top bar.
      const max = stageWrap.clientHeight - css('--top-safe') - css('--vdock-h') - 40;
      // (A tablet held upright takes the phone's sheet: main.js sheetBehaviour sets its Half and Full heights.)
      const ratio = heightRatio ?? (isPhoneLayout() ? 0.56 : 0.46);
      const height = Math.min(max, Math.max(180, stageWrap.clientHeight * ratio));
      workspace.style.setProperty('--instrument-h', `${Math.max(140, height)}px`);
      divider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    }
    fitHeight();
  }
  // A tab whose picture keeps its own shape (Ascites has none to stretch; HVPG and FibroScan are boxes of a fixed
  // aspect) has nothing to fill a tall card with, so its card is only as tall as its content: the height eases to
  // fit, and eases back for any other tab. A sheet the learner has resized keeps their height, and when the content would not fit even the full card its picture shrinks as it always did.
  // Doppler, the scope view and Readouts fit too: on a Mac the card ends under its content instead of running empty to the
  // play bar (the Wall mechanics view keeps the full card). The scope's view is its second child, after the Scope view / Wall switch.
  const FIT = ['abdomen', 'hvpg', 'fibroscan', 'doppler', 'endoscopy', 'readouts'];
  const fitView = (id) => (id === 'endoscopy' ? endoscopy.el : byId[id].el.firstElementChild);
  let fitTimer = 0;
  function fitHeight() {
    const id = open.length === 1 && FIT.includes(open[0]) && state === 'open' && !(open[0] === 'endoscopy' && endoSub === 'wall') ? open[0] : null;
    for (const o of FIT) if (o !== id) fitView(o).classList.remove('nat');
    const view = id ? fitView(id) : null;
    // Over the thumb dock (a phone, an upright iPad) the card keeps its height whatever the tab: nothing fits there.
    let fits = !!view && !sidewaysMQ.matches && (isSide() || heightRatio == null) && matchMedia('(min-width: 768px)').matches && !document.getElementById('app')?.classList.contains('thumb');
    if (view) view.classList.toggle('nat', fits);   // nat: the view at its natural height, to measure it
    fits = fits && view.offsetHeight > 0;
    const on = workspace.classList.contains('fit');
    if (!fits && !on) return;
    clearTimeout(fitTimer);
    if (!workspace.offsetParent) return;   // the dock is closed (display: none): nothing to fit
    const cs = getComputedStyle(workspace);
    const full = isSide() ? workspace.offsetParent.clientHeight - parseFloat(cs.top) - parseFloat(cs.bottom) : parseFloat(workspace.style.getPropertyValue('--instrument-h')) || workspace.offsetHeight;
    let need = 0;
    if (fits) {
      const pcs = getComputedStyle(view.parentElement);
      // (everything the pane shows, stacked: the view, and on Scope the switch above it)
      const kids = [...view.parentElement.children].filter((c) => c.offsetHeight > 0);
      const measure = () => Math.ceil(workspace.offsetHeight - body.clientHeight + parseFloat(pcs.paddingTop) + parseFloat(pcs.paddingBottom)
        + kids.reduce((a, c) => a + c.offsetHeight, 0) + (parseFloat(pcs.rowGap) || 0) * (kids.length - 1));
      need = measure();
      // too tall for the card (a short window): leave it to scale as it always did
      if (need > full + 1 && id !== 'abdomen') { view.classList.remove('nat'); fits = false; }
    }
    if (!on) { workspace.style.setProperty('--fit-h', `${workspace.offsetHeight}px`); workspace.classList.add('fit'); void workspace.offsetHeight; }
    if (!fits) {
      workspace.style.setProperty('--fit-h', `${Math.round(full)}px`);
      fitTimer = setTimeout(() => workspace.classList.remove('fit'), 400);
      return;
    }
    workspace.style.setProperty('--fit-h', `${Math.round(Math.min(full, Math.max(140, need)))}px`);
  }
  const fitWatch = new ResizeObserver(() => fitHeight());
  for (const id of FIT) fitWatch.observe(fitView(id));
  function setState(next) {
    state = next;
    workspace.dataset.state = state;
    app.classList.toggle('instrument-focus', state === 'focus' && isVisible());
    divider.hidden = state !== 'open';
    body.hidden = state === 'peek';
    tabsBox.hidden = state === 'peek';
    endPick();
    updateHeader(); layout();
    queueRefresh();
    resizeSoon();
  }
  const canSplit = () => (isSide() ? stageWrap.clientHeight - css('--top-safe') - css('--vdock-h') >= 620 : body.clientWidth >= 1000 || workspace.clientWidth >= 1000) || state === 'focus';
  // Pressure and Over time read as one story: where the card is roomy (desktop, iPad landscape) they open
  // together, stacked, with no switch; elsewhere the Pressure tab keeps its Along the circuit / Over time switch.
  const PAIR = ['profile', 'scope'];
  const roomy = () => isSide() && canSplit() && body.clientHeight >= 600;
  const isPair = () => open.length === 2 && tabOf(open[0]) === tabOf(open[1]);
  function layout() {
    // Never keep two cramped instruments after rotation or resizing.
    if (open.length > 1 && !canSplit()) open = open.slice(0, 1);
    else if (open.length === 1 && tabOf(open[0]) === 'profile' && roomy()) open = [...PAIR];
    else if (open.length > 1 && tabOf(open[0]) === tabOf(open[1]) && !roomy()) open = open.slice(0, 1);
    for (const p of panes) p.el.classList.toggle('active', open.includes(p.id));
    body.classList.toggle('split', open.length > 1);
    body.classList.toggle('stack', open.length > 1 && (isPair() || (isSide() && state !== 'focus')));
    body.classList.toggle('pair', isPair());
    paintTitle();
    for (const id of TABS) {
      const at = open.findIndex((x) => tabOf(x) === id), on = at >= 0;
      tabEls[id].b.setAttribute('aria-selected', String(on));
      tabEls[id].b.tabIndex = id === tabOf(open[0]) ? 0 : -1;
      tabEls[id].b.dataset.slot = on && open.length > 1 && !isPair() ? String(at + 1) : '';
    }
    fitTabs();
    remember();
    fitHeight();
    queueRefresh();
    onLayout?.();
  }
  // Beside the name: the vessel the Doppler reads (its glow on the figure shows where).
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
    tabs.querySelector(`.instr-tab:not([data-instrument="${tabOf(open[0])}"])`)?.focus();
  }
  function paneOut(el, top) {
    for (const a of el.getAnimations()) if (a.id === 'pane-out') a.cancel();
    el.classList.add('pane-out'); el.scrollTop = top;
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { id: 'pane-out', duration: 150, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    const done = () => { if (el.getAnimations().includes(a)) a.cancel(); el.classList.remove('pane-out'); };
    a.finished.then(done, () => el.classList.remove('pane-out'));
  }
  function pick(id) {
    if (picking && id !== tabOf(open[0])) { open = [open[0], id]; endPick(); layout(); return; }
    endPick();
    // A tab shows that instrument alone (the Pressure tab keeps the view it was on).
    const was = open.length === 1 ? body.querySelector('.dock-pane.active') : null, top = was?.scrollTop || 0;
    open = [open.find((x) => tabOf(x) === id) || id];
    if (state === 'peek') setState('open');
    layout();
    // A tapped tab crossfades: the pane it leaves stays where it was and fades out over the new one fading in (P13). A pane
    // swiped into place (.landed) has already slid the old one away.
    const now = body.querySelector('.dock-pane.active');
    if (was && now && now !== was && !was.classList.contains('active') && !now.classList.contains('landed') && was.animate) paneOut(was, top);
    for (const p of workspace.querySelectorAll('.dock-pane.landed:not(.active)')) p.classList.remove('landed');
    workspace.querySelector('.dock-body')?.scrollTo?.(0, 0);
  }
  function openGrid(anchor, { alongside = false } = {}) {
    closePopover();
    if (!isVisible()) { onOpen(); setState('open'); }
    else if (state === 'peek') setState('open');
    if (alongside && canSplit() && open.length === 1) toggleSecond();
    else tabEls[tabOf(open[0])].b.focus();
  }
  function show(id, { open: doOpen = true, reveal = false, alongside = false } = {}) {
    if (id === 'lobule') { onLobule?.(); return; }
    if (id === 'landscape' || ALIAS[id]) id = ALIAS[id] || 'profile';
    const revealWall = id === 'varixwall';
    if (revealWall) { setEndoSub('wall'); id = 'endoscopy'; }
    if (!byId[id]) return;
    endPick();
    if (alongside && open.length === 1 && tabOf(open[0]) !== tabOf(id) && canSplit()) open = [open[0], id];
    else if (!open.includes(id)) open = [id];
    if (reveal) onReveal?.(reveal);
    else if (doOpen) onOpen();
    if (state === 'peek') setState('open');
    layout();
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
    const plot = side ? clamp((body.clientHeight / (open.length > 1 ? 2 : 1)) - 90, 190, 380) : clamp(h0 - (isPhoneLayout() ? 150 : 190), 190, 420);   // a tablet's sheet has a taller header and tab row (an upright one is a phone's)
    workspace.style.setProperty('--plot-h', `${plot}px`);
    workspace.style.setProperty('--square-size', `${clamp(side ? workspace.clientWidth - 80 : h0 - 160, 220, 380)}px`);
    layout();
  });
  sizeObserver.observe(stageWrap); sizeObserver.observe(body);
  sideMQ.addEventListener('change', () => { updateSize(); layout(); });
  store.on('compareSnap', () => updateHeader());
  function updateHeader() {
    const st = store.get(), comparing = !!st.compareSnap;
    const hideCmp = !comparing || state === 'peek' || st.imaging;
    if (comparison.hidden !== hideCmp) comparison.hidden = hideCmp;
    if (comparing && frame) {
      const a = st.compareSnap.metrics, b = frame.metrics;
      const rows = compareRows(a, b, !hiddenNow(st)?.has('trueHVPG'), !st.hiddenReadouts?.has('model'), fmt);
      // (Frames arrive ten times a second: the line is rebuilt only when a shown number changes, as the comparison table is.)
      const sig = rows.map((r) => r.join(' ')).join('|');
      if (comparison._sig !== sig) {
        comparison._sig = sig;
        comparison.replaceChildren(h('span', { class: 'comparison-label' }, 'Change since baseline'),
          ...rows.map(([label, txt]) => h('span', {}, label, h('b', {}, txt))));
      }
    }
    paintTitle();
    const txt = !frame ? '' : state === 'peek' && !st.imaging ? INFO[open[0]][1](frame)
      : frame.clock === 'disease' ? (st.running ? `Day ${frame.day}` : `Paused · Day ${frame.day}`) : st.running ? '' : 'Paused';
    if (live.textContent !== txt) live.textContent = txt;
    const ls = state === 'peek' ? 'summary' : st.running ? 'live' : 'paused';
    if (live.dataset.state !== ls) live.dataset.state = ls;
    // Each tab carries its instrument's reading (not where the numbers are hidden).
    if (frame && isVisible()) for (const id of TABS) {
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
