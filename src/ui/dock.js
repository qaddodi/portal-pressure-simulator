// Readout strip (the four key readouts in the vitals dock, and the rest behind its chevron) and the
// Instruments card (blueprint §9.1, §9.2).

import { store, hiddenNow } from './store.js';
import { EDGES } from '../engine/topology.js';
import { h, fmt, svgIcon, closePopover, clamp, shownOf, isPhoneLayout, SIDEWAYS_MQ, swapFade, scrollBehavior, countTo, swapText, fadeIn, glideOnResize, foldHidden, hasBox, putText } from './util.js';
import { lobuleFlows } from './lobule-model.js';
import { createProfile } from './charts.js';
import { createPressureTime } from './pressure-time.js';
import { createHvpgProcedure } from './hvpg-proc.js';
import { lazyPane, holdUntilLoaded } from './lazy-pane.js';
import { ownsSideways, pageGo } from './swipe.js';
import { createEndoscopy, createVarixWall, createAbdomen } from './instruments.js';
import { createReadoutsPane } from './readouts-pane.js';
import { frameFor } from './frame.js';
import { glideCall, glideStop } from './script-glide.js';
import { glWords } from './gl-words.js';
import { restPass } from './rest-pass.js';
import { dropFrontNums } from './drop-front.js';
import { classSoon, classHas, classNow } from './class-soon.js';
import { vitalReading, vitalHeading, VITALS } from './vital-read.js';
import { setShown, shownState, FILL_SMALL, fillQ } from './shown.js';
import { tenthGap } from '../engine/gap.js';
import { HVPG_CUTS, PPG_CUTS, hvpgSev, ppgSev, hvBlocked } from '../engine/pressure-cuts.js';
import { compareRows } from './idle-keys.js';
import { releaseSpeed, carryCurve, cubicBezier, easeArrive, D_FLIP, D_SMALL, EASE_IN, EASE_ARRIVE } from './ease.js';
import { readAnims, readBox, readMetric, readStyle, scrollInto } from './layout-snap.js';
import { attrSoon, dataSoon } from './class-soon.js';
import { caught } from './caught.js';
import { reduceMotionMQ } from './motion.js';
const nextFrame = frameFor('dock');

// A number that changes rewrites its text node in place (setting textContent replaces the node: a DOM rebuild per paint).


// Readouts in teaching order: pressure, then flow, then what they lead to, then the systemic
// circulation. Each readout's status (bar color and word) comes from a clinical cut-off,
// listed in CUTOFFS below and in About the model: green is normal, amber borderline, red past a
// clinical threshold, dark red past the highest one where a readout has one. `scale` and `ticks`
// draw the bar under each value: where the value sits between the cut-offs.
const vel = (m) => m.pvVelMean ?? m.pvVel;
const EDGE_LABEL = new Map(EDGES.map((e) => [e.id, e.label]));   // (a vessel's name by its id, for the Doppler's title)
// Whether two status lines read the same once each run of digits and points is taken as one (what the lines "Day 41" and "Day 42" share).
const isNum = (c) => (c >= 48 && c <= 57) || c === 46;
function sameShape(a, b) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.charCodeAt(i), cb = b.charCodeAt(j), na = isNum(ca), nb = isNum(cb);
    if (na || nb) {
      if (!(na && nb)) return false;
      while (i < a.length && isNum(a.charCodeAt(i))) i++;
      while (j < b.length && isNum(b.charCodeAt(j))) j++;
    } else { if (ca !== cb) return false; i++; j++; }
  }
  return i === a.length && j === b.length;
}
// (The status words of the readouts, in tables made once: a tile names its state every model frame.)
const HVPG_WORDS = { ok: 'Normal', caution: 'Mild', danger: 'CSPH' }, PPG_WORDS = { ok: 'Normal', caution: 'High', danger: 'Bleed risk' };
const ASCITES_WORDS = ['None', 'Grade 1', 'Grade 2', 'Grade 3'];
export const TILES = [
  { id: 'hvpg', group: 'pressure', k: 'HVPG', title: 'Hepatic venous pressure gradient: wedged − free hepatic venous pressure. Estimates the sinusoidal gradient; normal < 5, clinically significant ≥ 10 mmHg.', why: 'hvpg', v: (m) => m.hvpg, d: 1, u: 'mmHg', hideKey: 'trueHVPG', measured: () => store.get().lastHVPG,
    scale: [0, 25], ticks: [HVPG_CUTS.amber, HVPG_CUTS.red],
    st: hvpgSev,
    s: (v) => HVPG_WORDS[hvpgSev(v)] },
  { id: 'ppg', group: 'pressure', k: 'PPG', title: 'Portal pressure gradient: portal confluence − suprahepatic inferior vena cava, directly from the model network. Unlike HVPG it also includes resistance before the liver (presinusoidal or prehepatic). Normal < 6, high ≥ 12 mmHg.', why: 'ppg', hideKey: 'pv', v: (m) => m.ppg, d: 1, u: 'mmHg',
    scale: [0, 25], ticks: [PPG_CUTS.amber, PPG_CUTS.red],
    st: ppgSev, s: (v) => PPG_WORDS[ppgSev(v)] },
  { id: 'pv', group: 'pressure', k: 'Portal pressure', ks: 'Portal P', title: 'Portal vein pressure at the portal confluence, absolute (model value). Normal ≤ 10 mmHg.', why: 'pv', v: (m) => m.pv, d: 1, u: 'mmHg', hideKey: 'pv',
    scale: [0, 35], ticks: [10, 15],
    st: (v) => (v <= 10 ? 'ok' : v < 15 ? 'caution' : 'danger'), s: (v) => (v <= 10 ? 'Normal' : v < 15 ? 'High' : 'Severe') },
  // Flow and velocity averaged over a few breaths (pvFlowMean, pvVelMean): breathing swings the
  // instantaneous velocity across the 15 cm/s cut-off even in a healthy patient.
  { id: 'pvflow', group: 'flow', k: 'Portal flow', ks: 'PV flow', title: 'Portal vein blood flow toward the liver, averaged over a few breaths (negative = away from it). Normal ≥ 0.9 L/min at ≥ 15 cm/s (Doppler).', why: 'pvFlow', v: (m) => m.pvFlowMean ?? m.pvFlow, d: 1, u: 'L/min',
    scale: [-0.6, 2], ticks: [0, 0.9],
    st: (v, m) => (v < -0.02 ? 'critical' : Math.abs(vel(m)) < 9 ? 'danger' : v < 0.9 || Math.abs(vel(m)) < 15 ? 'caution' : 'ok'),
    s: (v, m) => (v < -0.02 ? 'Reversed' : Math.abs(vel(m)) < 9 ? 'Stasis' : v < 0.9 ? 'Reduced' : Math.abs(vel(m)) < 15 ? 'Slow' : 'Normal') },
  { id: 'liver', group: 'flow', hideKey: 'model', k: 'Sinusoidal flow', ks: 'Sinusoids', title: 'Total blood flow through the liver sinusoids (portal + hepatic artery), % of this model\u2019s healthy baseline. A model quantity, not liver function.', why: 'sinFlow', v: (m) => m.liverPerfPct, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Low' : 'Severe') },
  { id: 'shunt', group: 'flow', k: 'Shunted', why: 'shunt', hideKey: 'model', v: (m) => m.shuntFraction * 100, d: 0, u: '%', title: 'Share of gut and spleen blood that bypasses the liver through collaterals and shunts.',
    scale: [0, 100], ticks: [10, 30, 60],
    st: (v) => (v < 10 ? 'ok' : v < 30 ? 'caution' : v < 60 ? 'danger' : 'critical'), s: (v) => (v < 10 ? 'Minimal' : v < 30 ? 'Moderate' : v < 60 ? 'Large' : 'Most') },
  { id: 'varix', group: 'effects', k: 'Varix wall stress', ks: 'Varix', why: 'varix', hideKey: 'model', v: (m) => m.varix.ratioShown * 100, d: 0, u: '%', ux: ' of rupture', title: 'Modeled esophageal varix wall stress (educational index: pressure × radius ÷ wall thickness, not a measurable force), as a % of the stress at which the model ruptures.',
    scale: [0, 100], ticks: [40, 70, 90],
    st: (v, m) => (m.varix.ratioShown >= 0.9 ? 'critical' : m.varix.ratioShown >= 0.7 ? 'danger' : m.varix.ratioShown >= 0.4 || m.varix.d >= 5 ? 'caution' : 'ok'),
    s: (v, m) => (!m.varix.present ? 'None' : m.varix.redWale ? 'Red wale signs' : m.varix.grade.label),
    ss: (v, m) => (!m.varix.present ? 'None' : m.varix.redWale ? 'Red wale' : m.varix.grade.label) },
  { id: 'ascites', group: 'effects', pane: 'abdomen', k: 'Ascites', title: 'Free fluid in the abdomen. Grade 1 is seen on ultrasound only, grade 2 is moderate, grade 3 tense.', why: 'ascites', v: (m) => m.ascites.volume / 1000, d: 1, u: 'L',
    scale: [0, 8], ticks: [0.15, 1.5, 5],
    st: (v, m) => (m.ascites.grade === 0 ? 'ok' : m.ascites.grade === 1 ? 'caution' : 'danger'), s: (v, m) => ASCITES_WORDS[m.ascites.grade] },
  { id: 'spleen', group: 'effects', k: 'Spleen', title: 'Spleen length. Splenomegaly > 13 cm; the enlarged spleen traps platelets.', why: 'spleen', v: (m) => m.spleen.length, d: 1, u: 'cm',
    scale: [8, 22], ticks: [13],
    st: (v) => (v <= 13 ? 'ok' : v <= 16 ? 'caution' : 'danger'), s: (v) => (v <= 13 ? 'Normal' : 'Large') },
];
// On the Lobule view the strip reads the lobule's own flows instead (what the card beside the lobule used to
// list): through the sinusoids, in from the portal vein and the hepatic artery, and the lymph the liver
// makes. They are not findings, so they stay out of TILES. `v` reads the frame and the store, as the lobule does.
const lobuleVal = (key, f, st) => lobuleFlows(f, st.healthy)[key];
export const LOBULE_TILES = [
  { id: 'lz-sin', group: 'lobule', k: 'Sinusoidal flow', ks: 'Sinusoids', title: 'Blood through the sinusoids, % of normal (portal + hepatic artery).', why: 'sinFlow', v: (f, st) => lobuleVal('flow', f, st) * 100, d: 0, u: '%',
    scale: [0, 150], ticks: [55, 75],
    st: (v) => (v > 75 ? 'ok' : v > 55 ? 'caution' : 'danger'), s: (v) => (v > 75 ? 'Normal' : v > 55 ? 'Low' : 'Severe') },
  { id: 'lz-pv', group: 'lobule', k: 'Portal inflow', ks: 'Portal in', title: 'Blood entering the lobule from the portal venule, % of normal (negative = flowing out of the liver).', why: 'portalIn', v: (f, st) => lobuleVal('portal', f, st) * 100, d: 0, u: '%',
    scale: [-60, 150], ticks: [0, 50],
    st: (v) => (v < -2 ? 'critical' : v < 50 ? 'danger' : v < 75 ? 'caution' : 'ok'), s: (v) => (v < -2 ? 'Reversed' : v < 50 ? 'Severe' : v < 75 ? 'Low' : 'Normal') },
  { id: 'lz-art', group: 'lobule', k: 'Arterial inflow', ks: 'Artery in', title: 'Blood entering the lobule from the hepatic arteriole, % of normal. It rises when the portal inflow falls (the arterial buffer response).', why: 'artIn', v: (f, st) => lobuleVal('art', f, st) * 100, d: 0, u: '%',
    scale: [0, 200], ticks: [60, 130],
    st: (v) => (v < 60 ? 'danger' : v > 130 ? 'caution' : 'ok'), s: (v) => (v < 60 ? 'Low' : v > 130 ? 'Compensating' : 'Normal'), ss: (v) => (v < 60 ? 'Low' : v > 130 ? 'High' : 'Normal') },
  { id: 'lz-ly', group: 'lobule', k: 'Hepatic lymph', ks: 'Lymph', title: 'Lymph the liver forms in the space of Disse and drains to the portal tract. Normal is about 0.8 mL/min; past about three times that it overflows into the abdomen (ascites).', why: 'hepLymph', v: (f, st) => lobuleVal('lymph', f, st), d: 1, u: 'mL/min',
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
  // (Written as the decks and the tiles write them: a symbol hard against its number, "to" in a range, no space before a percent. Each range runs on
  // from the cut-off before it by one step of the last digit the tile prints, so no value falls between two bands.)
  ['HVPG (wedged − free)', '<5 mmHg', '5 to 9.9 (subclinical)', '≥10 (CSPH in cirrhosis)', '—'],
  ['PPG: portosystemic gradient (portal vein − IVC)', '<6 mmHg', '6 to 11.9', '≥12', '—'],
  ['Portal vein pressure', '≤10 mmHg', '10.1 to 14.9', '≥15', '—'],
  ['Portal flow', '≥0.9 L/min and ≥15 cm/s', '<0.9 L/min or <15 cm/s', '<9 cm/s (stasis)', 'Reversed (hepatofugal)'],
  ['Sinusoidal flow', '>75% of normal', '56 to 75%', '≤55%', '—'],
  ['Shunted blood', '<10%', '10 to 29%', '30 to 59%', '≥60%'],
  ['Varix wall stress (model)', '<40% of rupture', '40 to 69%, or diameter ≥5 mm', '70 to 89%', '≥90%'],
  ['Ascites', 'None', 'Grade 1', 'Grade 2 or 3', '—'],
  ['Spleen length', '≤13 cm', '13.1 to 16 cm', '>16 cm', '—'],
];

// Systemic circulation: a compact obstruction at the end of the strip. (The list is in vital-read.js, where the vitals monitor on a slide reads it too.)
export { VITALS };

// The key readouts: collapsed, the bar shows only the two gradients (HVPG and the portosystemic
// gradient) on every device; the rest open with the chevron.
export const PRIMARY = new Set(['hvpg', 'ppg']);
// The bar's two gradients do nothing when tapped for now (the handlers in tile() stay for when they return).
const BAR_INERT = PRIMARY;

// A trend arrow marks a sustained change (over TREND_S seconds, larger than TREND_FRAC of the
// bar's range), so the heartbeat and breathing never make it flicker.
const TREND_S = 5, TREND_FRAC = 0.03;
// (Kept for the strip's display-frame paint, which makes no objects, arrays or strings of its own: the shown state's options, the bar's
// four ends, the severity ranks, and each key written once. 2 Nov 2026, scripts/frame-alloc.mjs.)
const END_KEYS = ['pv', 'ivc', 'whvp', 'fhvp'];
const END_STATE = { pv: 'end:pv', ivc: 'end:ivc', whvp: 'end:whvp', fhvp: 'end:fhvp' };
const RANKS = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };
const FOLLOW = { snap: false, small: 0, eps: 0 }, FILL = { small: 0, eps: 0, across: true }, COUNT = { eased: false }, SM = { pv: 0, ivc: 0, whvp: 0, fhvp: 0 }, GAP = { hvpg: null, ppg: null };

/** The value a readout shows, or null when it is hidden and has not been measured. */
export function readoutValue(t, m, hidden) {
  if (t.id === 'hvpg' && hvBlocked(store.get().params)) return null;   // (Budd–Chiari: the vein takes no catheter, pressure-cuts.js)
  if (!hidden?.has(t.hideKey)) return t.v(m);
  const meas = t.id === 'hvpg' ? t.measured?.() : null;
  return meas ? meas.hvpg : null;
}

// Legacy pane names in content: flow and perfusion live in the readout strip, the pressure profile is the closest pane.
const ALIAS = { flow: 'profile', perfusion: 'profile', chart: 'profile' };
// (R11, review pass 2: the readout strip's tiles are not formatted or written while the strip cannot be seen: an instrument in focus,
// the projector. (The sinusoid view keeps the dock and its strip, 2 Nov.) Read from the app's classes, never from layout. The shared shown numbers
// (setShown: the charts and instruments read the tiles' numbers) are still kept; the strip is painted whole the moment it shows.
// The new path only: no off switch.)
function stripUnseen() {
  const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
  if (!app) return false;
  const c = app.classList;
  return c.contains('projector') || c.contains('instrument-focus');
}

/** What this device last had open in the Instruments card (and its size): { open, h, w }, or {} when nothing is saved. */
export const savedInstruments = () => { try { return JSON.parse(localStorage.getItem('pps.instruments') || 'null') || {}; } catch { return {}; } };

// What the Doppler's trace reads of a frame it is only keeping for later (the Doppler loads after the first paint, lazy-pane.js).
const dopplerSlim = (f) => ({ probe: f.probe, clock: f.clock, resp: f.resp, running: f.running, settling: f.settling, samples: f.samples });

/** `lazy`: the Doppler's and the FibroScan's loads (main.js lazy(): { doppler, fibroscan }), which come after the first paint. */
// The header's day count, made when the day or the running state changes, not each frame.
let dayKept = null, dayRun = null, dayWords = '';
function dayText(running, day) {
  if (dayKept !== day || dayRun !== running) { dayKept = day; dayRun = running; dayWords = running ? `Day ${day}` : `Paused · Day ${day}`; }   // alloc-rare: only when the day or the running state changes
  return dayWords;
}
export function createDock({ strip, head, body, onWhy, onAction, onProbe, onReveal, onLobule, onOpen, onClose, isVisible, marks, onBeat, onLayout, lazy }) {
  // One app-wide relayout for a burst of changes (a mode change also changes the lobule): every resize
  // listener (the figure, the timeline, the presenter) runs once, not once per key.
  let rzT = 0;
  const CLASS_ONLY = { attributes: true, attributeFilter: ['class'] };
  const fireResize = () => dispatchEvent(new Event('resize'));
  const resizeSoon = () => { clearTimeout(rzT); rzT = setTimeout(fireResize, 30); };
  // ── Readout strip ─────────────────────────────────
  const ends = { pv: {}, ivc: {}, whvp: {}, fhvp: {} };   // (the gradients' readings, each with the tiles' running mean)
  const GAP_ENDS = { hvpg: ['whvp', 'fhvp'], ppg: ['pv', 'ivc'] };   // (the bar's two gradients, each the difference of its two readings as shown)
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
      h('span', { class: 'k' }, t.ks ? [h('span', { class: 'k-l' }, t.k), h('span', { class: 'k-s' }, t.ks)] : t.k), h('span', { class: 'v' }, val, shared ? null : h('span', { class: t.u === '%' ? 'unit pct' : 'unit' }, t.u, t.ux ? h('span', { class: 'u-x' }, t.ux) : null), tr), bar, h('span', { class: 's' }, st, cmp));
    el.title = `${t.title || t.k}${inert ? '' : t.pane ? '\nClick to open the Ascites view.' : t.why ? '\nClick for what is driving it.' : ''}`;
    // Ascites opens its own instrument (amount, cause, tap, treatment) rather than a second popover.
    if (inert) { /* readout only */ }
    else if (t.pane) el.addEventListener('click', () => show(t.pane, { reveal: true }));
    // HVPG not yet measured (Explore): the tile opens the catheter procedure instead.
    else if (t.why) el.addEventListener('click', () => (t.id === 'hvpg' && readoutValue(t, {}, hiddenNow()) == null ? show('hvpg', { reveal: true }) : onWhy(t.why, el)));
    tileEls[t.id] = { el, t, val, tr, st, cmp, cmpW: glWords(cmp), cmpCls: '', fill, histT: [], histV: [], sev: null, trend: '', ariaTxt: '', kBar: 'bar:' + t.id, kFill: 'fill:' + t.id,
      fkOn: false, fkV: null, fkF: null, vsV: NaN, vsD: 0, vsOut: NaN,
      stS: null, stUn: null, ariaK: NaN, ariaS: null, ariaT: null, ariaV: null, ariaAsk: false };
    const x = tileEls[t.id];
    // (Made once here, so a frame makes none: the closure for the status word's class, and the pass that words the spoken label.)
    const unmeasThen = [() => classSoon(x.st, 'unmeas', false), () => classSoon(x.st, 'unmeas', true)];
    x.unmeasThen = (un) => unmeasThen[un ? 1 : 0];
    x.ariaPass = () => {
      x.ariaAsk = false;
      const v = x.ariaV, s = x.ariaS;
      const aria = `${t.title || t.k}: ${v == null ? s.toLowerCase() : `${fmt(v, t.d)} ${t.u}${t.ux || ''}, ${s}`}${x.ariaT ? `, ${x.ariaT === 'up' ? 'rising' : 'falling'}` : ''}`;
      if (aria !== x.ariaTxt) { x.ariaTxt = aria; attrSoon(el, 'aria-label', aria); }
    };
    return el;
  }
  for (const [g, label] of [['lobule', 'Lobule, % of normal'], ...GROUPS]) {
    const ts = [...TILES, ...LOBULE_TILES].filter((t) => t.group === g);
    row.append(h('div', { class: 'ro-group', 'data-group': g, role: 'group', 'aria-label': label },
      h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, label), h('div', { class: 'ro-tiles' }, ts.map((t) => tile(t, false)))));
  }
  const tileList = Object.values(tileEls);   // (the tiles in a list kept for the strip's passes: Object.values made a new array in each)
  // The Lobule view swaps the key readouts for the lobule's flows (the group is hidden elsewhere, by CSS).
  // Entering or leaving it, the bar's readings crossfade (swapFade) rather than switch groups in one frame (motion review P12).
  const applyLobule = () => { const on = !!store.get().lobule, pri = on ? LOBULE_PRIMARY : PRIMARY; classSoon(strip, 'lob', on); for (let i = 0; i < tileList.length; i++) classSoon(tileList[i].el, 'primary', pri.has(tileList[i].t.id)); };
  // (The play, clock and Compare beside them glide to wherever the new readings' width puts them: RF4.)
  const GLIDE_ALSO = { also: [strip, null] }, LOBULE_SWAP = { instant: false };   // (their records are kept, the calls copy what they need)
  const lobuleSwap = () => { applyLobule(); resizeSoon(); };
  const syncLobule = () => {
    const same = classHas(strip, 'lob') === !!store.get().lobule, tl = document.getElementById('timeline');
    if (!same && tl) { GLIDE_ALSO.also[1] = document.getElementById('vdock'); glideOnResize(tl, ':scope > *', GLIDE_ALSO); }
    LOBULE_SWAP.instant = same;
    swapFade(strip, lobuleSwap, LOBULE_SWAP);
  };
  // A paused model sends no frames: fill the tiles from the last one at once (no dashes).
  for (const k of ['lobule', 'mode']) store.on(k, () => { syncLobule(); if (frame) updateStrip(frame); resizeSoon(); });
  // (A measurement, the Always show HVPG switch or a new patient's hidden readouts change what the tiles show: repaint
  // them from the last frame now, or a paused model keeps showing "Not measured" or the last patient's band until Play.)
  for (const k of ['hvpgMeasured', 'showHvpg', 'hiddenReadouts', 'lastHVPG', 'presetId']) store.on(k, () => { if (frame) updateDock(frame); });
  syncLobule();
  const vitEls = VITALS.map((v) => {
    const val = h('b', {}, '—');
    // (A vital with somewhere to head, the hemoglobin after a bleed: an arrow and the number it is heading to, shown while the two differ.)
    const toNum = v.to ? h('em', {}, '') : null;
    const el = h(v.why ? 'button' : 'div', { class: 'vital', title: `${v.title} (${v.u})${v.to ? '\nThe arrow: where it is heading once the plasma has refilled (a day or so after a bleed).' : ''}${v.why ? '\nClick for what is driving it.' : ''}` },
      h('span', {}, v.k), val, toNum ? h('i', { class: 'v-to', 'aria-hidden': 'true' }, '→', toNum) : null);
    if (v.why) el.addEventListener('click', () => onWhy(v.why, el));
    return { v, el, val, toNum, toV: null, toUp: false, kBar: 'bar:' + v.id, fkOn: false, fkS: NaN, fkH: false, fkB: false };
  });
  row.append(h('div', { class: 'ro-group ro-systemic', 'data-group': 'systemic', role: 'group', 'aria-label': 'Systemic' },
    h('span', { class: 'ro-cap', 'aria-hidden': 'true' }, 'Systemic'), h('div', { class: 'vb-grid' }, vitEls.map((x) => x.el))));
  // The bar keeps only the key readouts; every readout lives in Tests > Readouts (readouts-pane.js), so the
  // strip no longer opens.

  function trendOf(x, v, now) {
    const ht = x.histT, hv = x.histV;
    if (!ht.length || now - ht[ht.length - 1] > 500) {
      ht.push(now); hv.push(v);
      let k = 0;
      while (k < ht.length && now - ht[k] > TREND_S * 1000 + 600) k++;
      if (k) { dropFrontNums(ht, k); dropFrontNums(hv, k); }
    }
    if (now - ht[0] < TREND_S * 1000 * 0.8) return '';
    const d = v - hv[0], thr = TREND_FRAC * (x.t.scale[1] - x.t.scale[0]);
    return d > thr ? 'up' : d < -thr ? 'down' : '';
  }

  // The bar follows the model on the page's one shown state (shown.js shownState, premium-feel R4): each model frame sets the
  // targets (updateStrip), and every display frame while one is on its way paints the tiles, their bars and their words from what is
  // shown (paintStrip), so a bar never steps ten times a second beside a vessel that eases. A step the running mean does not ease (a
  // paused edit, a treatment, a new patient) is taken at once: its number rolls (P17) and its bar glides by its own transition.
  // (small: one step of the last digit printed. A number prints only whole steps of its last digit, so a move of one step or less shows
    // the same whether it glides or lands at once, and a running model's wobble, which is about that size, costs no display frames.)
    const followOpts = (d, snap) => { FOLLOW.snap = snap; FOLLOW.small = Math.pow(10, -d); FOLLOW.eps = 0.05 * FOLLOW.small; return FOLLOW; };   // (one options object, written in place: the shown state reads it at once)
  // (A bar's length glides on the same filter, across a jump too: it always glided, by a CSS transition that restarted with each model
  // frame. Shown again after "Not measured", it grows from its origin.)
  const fillTo = (key, t, v, seen) => {
    const r = Math.abs(t.scale[1] - t.scale[0]), o = FILL;
    o.small = FILL_SMALL * r; o.eps = 0.0005 * r;
    if (v != null && !seen && shownState.get(key) === undefined) shownState.set(key, clamp(0, t.scale[0], t.scale[1]), o);
    return shownState.set(key, v, o);
  };
  function updateStrip(f) {
    const m = f.metrics;
    const st0 = store.get();
    if (strip.classList.contains('lob') !== !!st0.lobule) syncLobule();
    const hidden = hiddenNow(st0);
    const now = performance.now();
    // The gradients' two readings each get the tiles' running mean, and the gradient is their difference as shown (one
    // decimal): the Pressure chart writes the same two readings at its brackets' ends, so its labels, the bar and the
    // readings add up (sweep 2 review item 13: PPG 17.8 beside 22.9 and 5.5).
    for (let i = 0; i < END_KEYS.length; i++) {
      const k = END_KEYS[i], raw = m?.[k], e = ends[k];
      let v = raw, eased = false;
      if (Number.isFinite(raw) && Number.isFinite(e.sm) && st0.running && Math.abs(raw - e.sm) < 2) { v = e.sm + (raw - e.sm) * Math.min(1, (now - e.smT) / 1200); eased = true; }
      e.sm = v; e.smT = now;
      e.v = shownState.set(END_STATE[k], v, followOpts(1, !eased));
    }
    for (let ti = 0; ti < tileList.length; ti++) {
      const x = tileList[ti], { t } = x;
      const lz = t.group === 'lobule';
      if (lz && !st0.lobule) continue;
      const raw = lz ? (st0.imaging ? null : t.v(f, st0)) : readoutValue(t, m, hidden);
      // The beat swings every value a little: the tile shows a running mean (about a second), so the
      // number stays steady; a real step (beyond a tenth of the scale) or a paused model shows at once.
      let v = raw, eased = false;
      x.live = !lz && t.id in GAP_ENDS && raw != null && raw === t.v(m);   // (a live gradient, not a measured one: the difference of its two ends as shown)
      if (raw != null && x.sm != null && st0.running && t.scale && Math.abs(raw - x.sm) < 0.1 * Math.abs(t.scale[1] - t.scale[0])) { v = x.sm + (raw - x.sm) * Math.min(1, (now - x.smT) / 1200); eased = true; }
      x.sm = v; x.smT = now;
      x.eased = eased;
      x.target = v;
      x.shown = v == null ? null : shownState.set(x.kBar, v, followOpts(t.d, !eased));
      const g = GAP_ENDS[t.id], gT = x.live && g ? tenthGap(ends[g[0]].sm, ends[g[1]].sm, null) : null;
      fillTo(x.kFill, t, gT ?? v, x.fillSeen); x.fillSeen = v != null;
    }
    for (const x of vitEls) {
      const r = vitalReading(x, m, st0.running, now);
      x.bad = r.bad;
      if (x.toNum) { x.toV = vitalHeading(x, m); x.toUp = x.toV != null && x.toV > r.v; }
      x.shown = shownState.set(x.kBar, r.v, followOpts(x.v.d, !st0.running));
    }
    paintStrip(f);
  }
  // Every display frame the shown state steps while something moves: the tiles follow (paintStrip reads only what is shown).
  shownState.on(() => { if (frame) paintStrip(frame, true); });
  // (The flash restarts by swapping between two names of the same keyframes, flash and flash2: a new animation name starts the
  // animation over without the reflow that removing and adding one class needed, a layout of the page inside a display frame.)
  const flashTile = (el) => { const two = classHas(el, 'flash'); classSoon(el, 'flash', !two); classSoon(el, 'flash2', two); };
  let stripStale = false, stripObs = null;
  function stripSeen() {
    if (!stripStale || stripUnseen() || !frame) return;
    stripStale = false;
    paintStrip(frame);
  }
  function paintStrip(f, follow = false) {
    const unseen = stripUnseen();
    if (unseen && !stripObs && typeof MutationObserver === 'function') {
      // (one record per class change of the app or the dock, no layout read: the strip is painted as it shows again)
      stripObs = new MutationObserver(stripSeen);
      const app = document.getElementById('app'), vd = document.getElementById('vdock');
      if (app) stripObs.observe(app, CLASS_ONLY);
      if (vd) stripObs.observe(vd, CLASS_ONLY);
    }
    if (unseen) stripStale = true;
    const m = f.metrics;
    const st0 = store.get();
    const hidden = hiddenNow(st0);
    const A = st0.compareSnap?.metrics || null;
    const now = performance.now();
    const sm = SM;
    for (let i = 0; i < END_KEYS.length; i++) { const k = END_KEYS[i], e = ends[k]; sm[k] = follow ? shownState.or(END_STATE[k], e.v) : e.v; setShown(k, sm[k]); }
    const gap = GAP;
    gap.hvpg = tenthGap(sm.whvp, sm.fhvp, null); gap.ppg = tenthGap(sm.pv, sm.ivc, null);
    for (let ti = 0; ti < tileList.length; ti++) {
      const x = tileList[ti], { el, t } = x;
      const lz = t.group === 'lobule';
      if (lz && !st0.lobule) continue;
      if (follow && x.target != null) x.shown = shownState.or(x.kBar, x.target);
      let v = x.shown ?? null, eased = follow || x.eased;
      if (x.live && gap[t.id] != null) v = gap[t.id];
      // (A display frame between model frames repaints only the tiles whose shown number or bar moved since they were last painted: with
      // a running model a tile or two always wobbles, and the rest need not be worked out again on every frame. A model frame paints all.)
      if (follow) { const fv = shownState.or(x.kFill, null); if (x.fkOn && x.fkV === v && x.fkF === fv) continue; x.fkOn = true; x.fkV = v; x.fkF = fv; } else x.fkOn = false;
      if (!lz) setShown(t.id, v);
      if (unseen) { x.fkOn = false; continue; }   // (R11: the number is shared; the tile itself waits until it shows)
      const measured = !lz && v != null && hidden?.has(t.hideKey);
      let sev, s;
      if (v == null) {
        if (!follow) countTo(x.val, null);
        s = t.id === 'hvpg' && hvBlocked(st0.params) ? 'Not measurable' : 'Not measured';
        sev = 'none';
        x.histT.length = 0; x.histV.length = 0;   // (the trend starts over: it was x.hist, which no tile has, and threw here for every unmeasured reading, so the strip stopped painting past it)
      } else {
        // (A step the running mean doesn't ease, a paused edit or a treatment, rolls to the new number: P17.)
        COUNT.eased = eased; countTo(x.val, v, t.d, COUNT);
        // (The number the word judges, the one shown ("5.0 L" is Grade 3), worked out again only when the reading moved.)
        if (x.vsV !== v || x.vsD !== t.d) { x.vsV = v; x.vsD = t.d; x.vsOut = shownOf(v, t.d); }
        const vs = x.vsOut, sf = t.ss && narrow.matches ? t.ss : t.s;
        s = measured ? 'Measured' : lz ? sf(vs, f, st0) : sf(vs, m);
        sev = lz ? t.st(vs, f, st0) : t.st(vs, m);
        const w = pos(t, shownState.or(x.kFill, v)), o = pos(t, clamp(0, t.scale[0], t.scale[1]));
        const fl = fillQ(Math.min(w, o) / 100), fw = fillQ(Math.abs(w - o) / 100);
        if (x.fillL !== fl || x.fillW !== fw) { x.fillL = fl; x.fillW = fw; x.fill.style.setProperty('--fl', fl); x.fill.style.setProperty('--fw', fw); }
      }
      classSoon(el, 'hidden-val', v == null);
      const trend = v == null || measured ? '' : trendOf(x, v, now);
      if (trend !== x.trend) { x.trend = trend; swapText(x.tr, trend === 'up' ? '▲' : trend === 'down' ? '▼' : ''); }
      // Compare: each tile reports its change from the pinned moment in place of the status word.
      if (A && v != null && !measured) {
        const d = v - (lz ? (st0.compareSnap.frame ? t.v(st0.compareSnap.frame, st0) : v) : t.v(A));
        const same = Math.abs(d) < Math.pow(10, -t.d) * 0.5;
        // (Written only when they change, as in the readouts pane: each model frame rewrote every tile's.)
        // (Its words are made when the rounded difference changes, not each frame: dq is the difference in the tile's last place, signed.)
        const dq = same ? 0 : (d > 0 ? 1 : -1) * Math.round(Math.abs(d) * Math.pow(10, t.d)), cc = same ? 'same' : d > 0 ? 'up' : 'down';
        if (x.cmpQ !== dq) { x.cmpQ = dq; x.cmpT = same ? 'same as then' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), t.d)} vs then`; }   // alloc-rare: the compare words change only when the rounded difference does
        const ct = x.cmpT;
        // (The words drawn on the GPU while they change, gl-words.js; a new colour (the change crossing zero) is taken by the page's own words,
        // between frames, and read again for the picture.)
        if (x.cmpCls !== cc) { if (x.cmpCls) classSoon(x.cmp, x.cmpCls, false); classSoon(x.cmp, cc, true); x.cmpCls = cc; x.cmpW.set(ct); x.cmpW.settle(); }
        else x.cmpW.set(ct);
        if (!x.st.hidden) { x.st.hidden = true; fadeIn(x.cmp); }
      } else if (x.cmpW.text) { x.cmpW.set(''); x.st.hidden = false; fadeIn(x.st); }
      // A new band must hold for a moment before the tile takes it, so a value hovering on a
      // cut-off does not flicker between two colors. (A paused model sends no more frames: it takes the band at once.)
      if (sev !== x.sev) {
        if (x.sevNext !== sev) { x.sevNext = sev; x.sevSince = now; }
        if (!x.sev || sev === 'none' || !st0.running || now - x.sevSince > 1500) {
          // A value crossing into a worse band flashes once, so a change is noticed without every number on screen.
          if (x.sev && RANKS[sev] > RANKS[x.sev]) flashTile(el);
          dataSoon(el, 'sev', sev); x.sev = sev;
        }
      } else x.sevNext = null;
      // (The status word is handed on only when it or its class changed since it was last handed on: swapText returns at once for the same
      // word, but the call made a closure each frame to find that out.)
      if (sev === x.sev) { const un = v == null; if (s !== x.stS || un !== x.stUn) { x.stS = s; x.stUn = un; swapText(x.st, s, x.unmeasThen(un)); } }
      // (The spoken label is worded between frames, and only when what it says changed: the number as shown, the word, the trend.)
      const ak = v == null ? 1e308 : x.vsOut;
      if (ak !== x.ariaK || s !== x.ariaS || x.trend !== x.ariaT) { x.ariaK = ak; x.ariaS = s; x.ariaT = x.trend; x.ariaV = v; if (!x.ariaAsk) { x.ariaAsk = true; restPass(x.ariaPass); } }
    }
    for (const x of vitEls) {
      if (unseen) { x.fkOn = false; continue; }
      const hid = !!hidden?.has(x.v.hideKey);
      if (follow) x.shown = shownState.or(x.kBar, x.shown);
      if (follow) { if (x.fkOn && x.fkS === x.shown && x.fkH === hid && x.fkB === !!x.bad) continue; x.fkOn = true; x.fkS = x.shown; x.fkH = hid; x.fkB = !!x.bad; } else x.fkOn = false;
      COUNT.eased = st0.running; countTo(x.val, hid ? null : x.shown, x.v.d, COUNT);
      classSoon(x.el, 'bad', !hid && x.bad);
      if (x.toNum) {
        const on = !hid && x.toV != null;
        classSoon(x.el, 'heading', on); classSoon(x.el, 'heading-up', on && x.toUp);
        if (on) countTo(x.toNum, x.toV, x.v.d, COUNT);
      }
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
    lazyPane({ id: 'doppler', label: 'Doppler', handle: lazy.doppler, cls: 'dop', history: 2000, slim: dopplerSlim, onReady: () => { fitHeight(); queueRefresh(); } }),
    endoscopy, createAbdomen({ onAction }),
    lazyPane({ id: 'fibroscan', label: 'FibroScan', handle: lazy.fibroscan, onReady: () => { fitHeight(); queueRefresh(); } }),
    readouts,
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
    doppler: ['doppler', (f) => `${fmt(Math.abs(f.metrics.pvVelMean ?? f.metrics.pvVel), 0)} cm/s`],
    endoscopy: ['endoscope', (f) => { const vx = f.metrics.varix; return !vx.present ? 'No varices' : vx.grade.label === 'None' ? 'Banded varices' : `${vx.grade.label} varices`; }],
    abdomen: ['needle', (f) => `${fmt(f.metrics.ascites.volume / 1000, 1)} L ascites`],
    fibroscan: ['gauge', (f) => `${fmt(f.metrics.lsm, 1)} kPa`],
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
  const saved = savedInstruments();
  let open = Array.isArray(saved.open) && saved.open.every((id) => byId[id]) && saved.open.length ? saved.open.slice(0, 2) : ['profile'];
  let frame = null, state = 'open', resizeFrame = 0, picking = false, wanted = null;
  for (const id of open) byId[id].need?.();   // (an instrument left open comes in at once; the others when the app is idle, or when their tab is first shown)
  let heightRatio = typeof saved.h === 'number' ? saved.h : null, widthPx = typeof saved.w === 'number' ? saved.w : null;
  const remember = () => { try { localStorage.setItem('pps.instruments', JSON.stringify({ open, h: heightRatio, w: widthPx })); } catch (e) { caught('dock:434', e); /* storage unavailable */ } };
  // A phone held sideways (667x375 and up) docks on the right too, like a narrow iPad: the figure keeps the full height.
  const sideMQ = matchMedia(`(min-width: 700px) and (orientation: landscape), ${SIDEWAYS_MQ}`);
  const coarseMQ = matchMedia('(pointer: coarse)');   // (an iPad held sideways: a narrower Tests card leaves a vessel card its strip beside Treat)
  const sidewaysMQ = matchMedia(SIDEWAYS_MQ);
  const isSide = () => sideMQ.matches;

  const live = h('span', { class: 'workspace-live', 'aria-live': 'off' });
  // The head is the same as Findings' and Treat's: icon, name, a quiet status, close.
  const titleEl = h('h2', { class: 'dock-title card-title' }, h('span', {}, 'Tests'), h('span', { class: 'dt-l' }));
  const closeBtn = h('button', { class: 'ib card-close workspace-close', 'aria-label': 'Close Tests', title: 'Close (Esc)', onclick: close }, svgIcon('close'));
  const divider = h('div', { class: 'workspace-divider', role: 'separator', tabindex: '0', 'aria-label': 'Instruments size' }, h('span'));
  workspace.prepend(divider);
  head.classList.add('card-head', 'tabbed');
  head.append(titleEl, live, closeBtn);
  // A tab for an instrument that has not arrived (lazy-pane.js) waits for it: the pane it leaves stays up, so a pane never shows empty.
  const afterLoad = holdUntilLoaded((id) => byId[id]);
  // The tabs: one per instrument. (Each once carried its live reading in a small line the stylesheet never showed, written every model
  // frame: gone, 2 Nov 2026.)
  const tabEls = {};
  const tabs = h('div', { class: 'instr-tabs ws-tabs', role: 'tablist', 'aria-label': 'Tests' }, TABS.map((id) => {
    const b = h('button', { class: 'instr-tab', role: 'tab', 'data-instrument': id, 'aria-selected': 'false', 'aria-controls': 'pane-' + id },
      svgIcon(INFO[id][0]), h('span', { class: 'it-t' }, h('b', {}, h('span', { class: 'it-full' }, SHORT[id] || byId[id].label), h('span', { class: 'it-short' }, TINY[id] || SHORT[id] || byId[id].label))));
    b.title = byId[id].label;
    b.addEventListener('click', () => pick(id));
    for (const ev of ['pointerenter', 'pointerdown', 'focus']) b.addEventListener(ev, () => byId[id].need?.());   // (asked for as a finger or the pointer arrives)
    tabEls[id] = { b };
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
    const w = readMetric(tabs, 'clientWidth');
    if (!w) return;
    tabs.classList.toggle('compact', w < 780); tabs.classList.toggle('narrow', w < 520); tabs.classList.toggle('tight', w < 420);
    tabs.classList.remove('bare');
    if (w < 420) {
      const on = tabs.querySelector('.instr-tab[aria-selected="true"]'), t = on?.querySelector('.it-t b');
      const need = [...tabs.children].reduce((a, b) => a + (b === on ? 0 : 26), 0) + (on ? readMetric(on, 'offsetWidth') - (readMetric(on.querySelector('.it-t'), 'offsetWidth') || 0) + (readMetric(t, 'scrollWidth') || 0) + 5 : 0) + 2 * (tabs.children.length - 1) + 6;
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
  let sw = null, settle = null, resting = null;   // settle: the last swipe's switch, while its panes are still easing; resting: the pane that lands (still drawn off its place)
  // Where a pane still easing from the last swipe is drawn, worked out from that ease (its ends, start, length and curve) rather than
  // read back from the page: a read in the middle of the drag laid the page out in a touch frame (off-GPU scan, 1 Nov).
  let easing = null;   // { el, from, to, t0, ms, f }
  const shiftX = (el) => { const e = easing; if (!e || e.el !== el) return 0; return e.from + (e.to - e.from) * e.f(Math.min(1, (performance.now() - e.t0) / e.ms)); };
  // (The body's width, kept by an observer: read when a sideways drag began, it laid the page out in the touch's frame.)
  let bodyW = 0;
  new ResizeObserver(() => { bodyW = readMetric(body, 'clientWidth'); }).observe(body);
  const paneFor = (id) => {
    for (let i = 0; i < panes.length; i++) if (panes[i].id === id) return panes[i].el;
    for (let i = 0; i < panes.length; i++) if (tabOf(panes[i].id) === id) return panes[i].el;
    return undefined;
  };
  const trailPool = () => { const a = []; for (let i = 0; i < 8; i++) a.push([0, 0]); return a; };   // (the finger's last eight places, made on the touch and written over by its moves)
  const clearSwipe1 = (e) => { if (e) { e.style.transform = ''; e.style.transition = ''; classSoon(e, 'swipe-peer', false); } };
  const clearSwipe = (a, b) => { clearSwipe1(a); clearSwipe1(b); };   // (the class lands in a task of its own before the next frame: class-soon.js)
  body.addEventListener('touchstart', (e) => {
    // A second swipe before the first has settled finishes the first once it moves (review #21), not on the touch: a tap leaves the panes easing.
    sw = e.touches.length === 1 && app.classList.contains('thumb') && open.length === 1 && !ownsSideways(e.target, { stop: body })
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), on: false, dx: 0, trail: [], pool: trailPool() } : null;
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.on) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; return; }   // (vertical: the sheet's, or the pane's scroll)
      // (Caught while the last swipe is still easing: it is finished at once and the pull takes the pane over from where it is drawn, so
      // nothing jumps by what was left to go.)
      sw.carry = resting && settle ? shiftX(resting) : 0;
      settle?.();
      sw.on = true; sw.cur = body.querySelector('.dock-pane.active'); sw.i = TABS.indexOf(tabOf(open[0])); sw.w = bodyW;
    }
    if (e.cancelable) e.preventDefault();
    const tdx = dx + sw.carry, d = tdx < 0 ? 1 : -1, j = sw.i + d;
    const nb = j >= 0 && j < TABS.length && !byId[TABS[j]].need?.() ? paneFor(TABS[j]) : null;   // (an instrument still on its way is not slid in empty)
    if (nb !== sw.nb) { clearSwipe(sw.nb); sw.nb = nb; sw.j = j; if (nb) classSoon(nb, 'swipe-peer', true); }
    sw.dx = nb ? tdx : tdx / 3;   // (past the first or last tab it gives a little and springs back)
    const tp = sw.trail.length >= 8 ? sw.trail.shift() : sw.pool.pop();
    tp[0] = performance.now(); tp[1] = t.clientX;
    sw.trail.push(tp);
    sw.cur.style.transform = `translateX(${sw.dx}px)`;   // alloc-rare: only while a finger drags the sheet, one string per input event
    if (nb) nb.style.transform = `translateX(${sw.dx + d * sw.w}px)`;   // alloc-rare: only while a finger drags the sheet, one string per input event
  }, { passive: false });
  const endSwipe = () => {
    const s = sw; sw = null;
    if (!s?.on) return;
    const v = releaseSpeed(s.trail, performance.now());   // (the finger's, px per ms to the right: the panes carry it on)
    const ms = performance.now() - s.t, go = !!s.nb && pageGo(s.dx, ms, s.w, v);
    const d = s.dx < 0 ? 1 : -1, curve = carryCurve(s.nb ? v : v / 3, (go ? -d * s.w : 0) - s.dx, D_SMALL), ease = `transform ${D_SMALL}ms ${curve}`;   // (past the end the pane moves a third of the finger)
    s.cur.style.transition = ease; if (s.nb) s.nb.style.transition = ease;
    s.cur.style.transform = go ? `translateX(${-d * s.w}px)` : '';
    if (s.nb) s.nb.style.transform = go ? 'translateX(0)' : `translateX(${d * s.w}px)`;
    const done = () => {
      clearTimeout(timer); settle = null; easing = null;
      // (The pane that slid in is already in place: it must not play its entrance again once the drag's classes go, a blink.)
      if (go) s.nb?.classList.add('landed');
      clearSwipe(s.cur, s.nb);
      if (go) { pick(TABS[s.j]); scrollInto(tabEls[TABS[s.j]].b, { block: 'nearest', inline: 'nearest', behavior: scrollBehavior() }); }
    };
    const timer = setTimeout(done, 250);
    settle = done; resting = go ? s.nb : s.cur;
    const [x1, y1, x2, y2] = curve.match(/-?[\d.]+/g).map(Number);
    easing = { el: resting, from: go ? s.dx + d * s.w : s.dx, to: 0, t0: performance.now(), ms: D_SMALL, f: cubicBezier(x1, y1, x2, y2) };
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
    const was = endoSub, shownBefore = hasBox(endoPane);
    endoSub = v; endoPane.dataset.sub = v;
    for (const b of endoSwitch.children) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    // The view that comes in fades up where the other was (the pane switched with one display flip).
    if (was !== v && shownBefore) (v === 'wall' ? wall.el : endoscopy.el).animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
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
  // (Until the observer's first word, which comes with the first layout and refreshes a shown card, it counts as not shown.)
  let displayed = null;
  new ResizeObserver((es) => { const b = es[es.length - 1].contentRect, on = b.width > 0 || b.height > 0; if (on !== displayed) { displayed = on; if (on) queueRefresh(); } }).observe(workspace);
  const isDisplayed = () => displayed === true;
  // Whether each pane overflows (it scrolls), kept by an observer on the pane and what it holds: read in the refresh, a frame, it laid
  // the page out there.
  const overflows = new WeakMap();
  const overflowWatch = new ResizeObserver((es) => { for (const en of es) { const el = en.target.closest('.dock-pane'); if (el) overflows.set(el, readMetric(el, 'scrollHeight') > readMetric(el, 'clientHeight') + 1); } });
  for (const p of panes) { overflowWatch.observe(p.el); for (const c of p.el.children) overflowWatch.observe(c); }
  function refresh() {
    if (!frame || !isVisible() || state === 'peek' || !isDisplayed()) return;
    for (const id of open) {
      const p = byId[id];
      if (id !== 'scope' && id !== 'doppler' && holding() && overflows.get(p.el)) continue;
      // live instruments keep their own history and only redraw; the rest draw from the frame
      if (id === 'scope' || id === 'doppler') p.redraw(); else if (id === 'endoscopy' && endoSub === 'wall') wall.update(frame); else p.update(frame);
    }
  }
  function queueRefresh() {
    if (resizeFrame) return;
    resizeFrame = nextFrame(() => { resizeFrame = 0; refresh(); });
  }
  const css = (k) => parseFloat(readStyle(app).getPropertyValue(k)) || 0;
  function updateSize() {
    const side = isSide();
    workspace.classList.toggle('side', side);
    workspace.dataset.safe = side ? 'right' : 'bottom';
    divider.setAttribute('aria-orientation', side ? 'vertical' : 'horizontal');
    if (side) putWidth(readMetric(stageWrap, 'clientWidth'));
    // (Over the thumb dock the card's height is the dock sheet's alone (dock-sheet.js, Menu system plan W3): no --instrument-h is written there.)
    else if (!app.classList.contains('thumb')) putHeight(readMetric(stageWrap, 'clientHeight'), sheetMax(readMetric(stageWrap, 'clientHeight')));
    fitHeight();
  }
  // The card's size from the stage's (W wide, H high): worked out with no read of the page, so a drag can size it from the stage
  // it measured as it began.
  const sideWidth = (W) => clamp(widthPx ?? (sidewaysMQ.matches ? Math.max(340, W * 0.45) : coarseMQ.matches && W < 1200 ? 380 : Math.max(440, W * 0.38)), sidewaysMQ.matches ? 320 : 360, Math.max(360, W * 0.62));
  // The sheet rises from above the vitals dock, at most to just under the top bar.
  const sheetMax = (H) => H - css('--top-safe') - css('--vdock-h') - 40;
  const sheetRatio = () => {
    // (A tablet held upright takes the phone's sheet: main.js sheetBehaviour sets its Half and Full heights.)
    const ratio = heightRatio ?? (isPhoneLayout() ? 0.56 : 0.46);
    return ratio;
  };
  const sheetHeight = (H, max) => Math.max(140, Math.min(max, Math.max(180, H * sheetRatio())));
  function putWidth(W) {
    const w = sideWidth(W);
    workspace.style.setProperty('--instrument-w', `${Math.round(w)}px`);
    app.style.setProperty('--side-ws-w', `${Math.round(w)}px`);   // (a sideways phone's play bar ends at the card)
    attrSoon(divider, 'aria-valuenow', String(Math.round((w / W) * 100)));
  }
  function putHeight(H, max) {
    workspace.style.setProperty('--instrument-h', `${sheetHeight(H, max)}px`);
    attrSoon(divider, 'aria-valuenow', String(Math.round(sheetRatio() * 100)));
  }
  // A tab whose picture keeps its own shape (Ascites has none to stretch; HVPG and FibroScan are boxes of a fixed
  // aspect) has nothing to fill a tall card with, so its card is only as tall as its content: the height eases to
  // fit, and eases back for any other tab. A sheet the learner has resized keeps their height, and when the content would not fit even the full card its picture shrinks as it always did.
  // Doppler, the scope view and Readouts fit too: on a Mac the card ends under its content instead of running empty to the
  // play bar (the Wall mechanics view keeps the full card). The scope's view is its second child, after the Scope view / Wall switch.
  const FIT = ['abdomen', 'hvpg', 'fibroscan', 'doppler', 'endoscopy', 'readouts'];
  const fitView = (id) => (id === 'endoscopy' ? endoscopy.el : byId[id].el.firstElementChild);
  let fitTimer = 0, fitKids = [];
  function fitHeight() {
    const id = open.length === 1 && FIT.includes(open[0]) && state === 'open' && !(open[0] === 'endoscopy' && endoSub === 'wall') ? open[0] : null;
    // Over the thumb dock (a phone, an upright iPad) the dock sheet owns the card's height (dock-sheet.js): the fit lets go of it at once,
    // with no glide, no timer and nothing measured, so there is one owner of that height (Menu system plan W3, 4 Nov 2026).
    if (app.classList.contains('thumb')) {
      for (const o of FIT) fitView(o).classList.remove('nat');
      if (classHas(workspace, 'fit')) {
        clearTimeout(fitTimer); glideStop(workspace); workspace.style.transform = '';
        for (const c of fitKids) c.style.transform = '';
        fitKids = [];
        classSoon(workspace, 'fit', false);
      }
      return;
    }
    for (const o of FIT) if (o !== id) fitView(o).classList.remove('nat');
    const view = id ? fitView(id) : null;
    let fits = !!view && !sidewaysMQ.matches && (isSide() || heightRatio == null) && matchMedia('(min-width: 768px)').matches;
    if (view) view.classList.toggle('nat', fits);   // nat: the view at its natural height, to measure it
    fits = fits && readMetric(view, 'offsetHeight') > 0;
    const on = classHas(workspace, 'fit');
    if (!fits && !on) return;
    clearTimeout(fitTimer);
    if (!readMetric(workspace, 'offsetParent')) return;   // the dock is closed (display: none): nothing to fit
    const cs = readStyle(workspace);
    const full = isSide() ? readMetric(readMetric(workspace, 'offsetParent'), 'clientHeight') - parseFloat(cs.top) - parseFloat(cs.bottom) : parseFloat(workspace.style.getPropertyValue('--instrument-h')) || readMetric(workspace, 'offsetHeight');
    let need = 0;
    if (fits) {
      const pcs = readStyle(view.parentElement);
      // (everything the pane shows, stacked: the view, and on Scope the switch above it)
      const kids = [...view.parentElement.children].filter((c) => readMetric(c, 'offsetHeight') > 0);
      const measure = () => Math.ceil(readMetric(workspace, 'offsetHeight') - readMetric(body, 'clientHeight') + parseFloat(pcs.paddingTop) + parseFloat(pcs.paddingBottom)
        + kids.reduce((a, c) => a + readMetric(c, 'offsetHeight'), 0) + (parseFloat(pcs.rowGap) || 0) * (kids.length - 1));
      need = measure();
      // too tall for the card (a short window): leave it to scale as it always did
      if (need > full + 1 && id !== 'abdomen') { view.classList.remove('nat'); fits = false; }
    }
    const h0 = readMetric(workspace, 'offsetHeight');
    if (!on) { workspace.style.setProperty('--fit-h', `${h0}px`); classNow(workspace, 'fit', true); }
    if (!fits) {
      setFit(h0, Math.round(full));
      fitTimer = setTimeout(() => classSoon(workspace, 'fit', false), 400);
      return;
    }
    setFit(h0, Math.round(Math.min(full, Math.max(140, need))));
  }
  // The card takes its new height at once, and its free edge glides there from where it stood: the card scaled from its anchored edge (the foot
  // over the figure, the top on the side), each part inside scaled back by as much about that edge, so the words and charts keep their size and
  // place. The scales are worked out on the arrival curve and written by the frames (script-glide.js glideCall), in the frame the glass over the
  // card reads them in (3 Nov 2026, cards trailing: a compositor animation can stand a display frame off it), so the inverse is exact.
  // (Was a CSS height transition: the card and everything in it laid out again in every frame of the ease.)
  function setFit(h0, h1) {
    if (workspace.style.getPropertyValue('--fit-h') === `${h1}px`) return;
    glideStop(workspace);
    workspace.style.transform = '';
    for (const c of fitKids) c.style.transform = '';
    fitKids = [];
    workspace.style.setProperty('--fit-h', `${h1}px`);
    if (!(h0 > 0) || Math.abs(h1 - h0) < 1 || reduceFit.matches) return;
    const top = isSide();
    workspace.style.transformOrigin = top ? '50% 0' : '50% 100%';
    // alloc-rare: a fit begins (the card's height changed): the parts' list and the frame's writer, once for each fit
    const kids = [];
    for (const c of workspace.children) {
      if (c.classList.contains('sheet-plate') || c.hidden) continue;
      c.style.transformOrigin = `50% ${top ? -readMetric(c, 'offsetTop') : h1 - readMetric(c, 'offsetTop')}px`;
      kids.push(c);
    }
    fitKids = kids;
    const write = (e) => {
      if (e >= 1) { workspace.style.transform = ''; for (const c of kids) c.style.transform = ''; return; }
      const k = (h0 + (h1 - h0) * e) / h1;
      workspace.style.transform = `scaleY(${k.toFixed(5)})`;
      const back = `scaleY(${(1 / k).toFixed(5)})`;
      for (const c of kids) c.style.transform = back;
    };
    glideCall(workspace, D_SMALL, easeArrive, write);
  }
  const reduceFit = reduceMotionMQ;
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
  const canSplit = () => (isSide() ? readMetric(stageWrap, 'clientHeight') - css('--top-safe') - css('--vdock-h') >= 620 : readMetric(body, 'clientWidth') >= 1000 || readMetric(workspace, 'clientWidth') >= 1000) || state === 'focus';
  // Pressure and Over time read as one story: where the card is roomy (desktop, iPad landscape) they open
  // together, stacked, with no switch; elsewhere the Pressure tab keeps its Along the circuit / Over time switch.
  const PAIR = ['profile', 'scope'];
  const roomy = () => isSide() && canSplit() && readMetric(body, 'clientHeight') >= 600;
  const isPair = () => open.length === 2 && tabOf(open[0]) === tabOf(open[1]);
  function layout() {
    // Never keep two cramped instruments after rotation or resizing.
    // (A pair cut to one because the card is too narrow for a moment is kept in `wanted`, and shown again as soon as there is room:
    // a window dragged narrower and back, or an iPad entering and leaving Split View, gives the same pair back, not one instrument.)
    if (wanted && open.length === 1 && open[0] !== wanted[0]) wanted = null;
    if (open.length > 1 && !canSplit()) { wanted = open.slice(0, 2); open = open.slice(0, 1); }
    else if (wanted && open.length === 1 && canSplit()) { open = wanted; wanted = null; }
    else if (open.length === 1 && tabOf(open[0]) === 'profile' && roomy()) open = [...PAIR];
    else if (open.length > 1 && tabOf(open[0]) === tabOf(open[1]) && !roomy()) open = open.slice(0, 1);
    for (const p of panes) { p.el.classList.toggle('active', open.includes(p.id)); p.shown?.(open.includes(p.id)); }
    body.classList.toggle('split', open.length > 1);
    body.classList.toggle('stack', open.length > 1 && (isPair() || (isSide() && state !== 'focus')));
    body.classList.toggle('pair', isPair());
    paintTitle();
    // (In a tight row the open tab shows its name and the others give way at once; each slides from where it stood by translate.)
    const flip = tabs.classList.contains('tight') && !reduceMotionMQ.matches ? TABS.map((id) => [tabEls[id].b, readMetric(tabEls[id].b, 'offsetLeft')]) : null;
    for (const id of TABS) {
      const at = open.findIndex((x) => tabOf(x) === id), on = at >= 0;
      tabEls[id].b.setAttribute('aria-selected', String(on));
      tabEls[id].b.tabIndex = id === tabOf(open[0]) ? 0 : -1;
      tabEls[id].b.dataset.slot = on && open.length > 1 && !isPair() ? String(at + 1) : '';
    }
    fitTabs();
    if (flip) for (const [b, x0] of flip) { const dx = x0 - readMetric(b, 'offsetLeft'); if (Math.abs(dx) > 0.5) b.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: D_SMALL, easing: EASE_ARRIVE }); }
    remember();
    fitHeight();
    queueRefresh();
    onLayout?.();
  }
  // Beside the name: the vessel the Doppler reads (its glow on the figure shows where).
  function paintTitle() {
    const probe = open.length === 1 && open[0] === 'doppler' && frame?.probe ? EDGE_LABEL.get(frame.probe) : null;
    const txt = probe || '';
    const l = titleEl.querySelector('.dt-l');
    swapText(l, txt);   // (the probe's vessel name crossfades when the probe moves)
    classSoon(titleEl, 'dop-on', !!probe);
  }
  function endPick() { picking = false; foldHidden(pickHint, true); workspace.classList.remove('picking'); }
  function toggleSecond() {
    if (open.length > 1) { wanted = null; open = open.slice(0, 1); endPick(); layout(); return; }
    if (picking) { endPick(); layout(); return; }
    picking = true;
    pickHint.querySelector('b').textContent = byId[open[0]].label;
    foldHidden(pickHint, false); workspace.classList.add('picking');
    layout();
    tabs.querySelector(`.instr-tab:not([data-instrument="${tabOf(open[0])}"])`)?.focus();
  }
  function paneOut(el, top) {
    for (const a of readAnims(el)) if (a.id === 'pane-out') a.cancel();
    el.classList.add('pane-out'); el.scrollTop = top;
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { id: 'pane-out', duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });
    const done = () => { if (readAnims(el).includes(a)) a.cancel(); el.classList.remove('pane-out'); };
    a.finished.then(done, () => el.classList.remove('pane-out'));
  }
  function pick(id) {
    if (!afterLoad(id, () => pickNow(id))) pickNow(id);
  }
  function pickNow(id) {
    if (picking && id !== tabOf(open[0])) { open = [open[0], id]; endPick(); layout(); return; }
    endPick();
    // A tab shows that instrument alone (the Pressure tab keeps the view it was on).
    const was = open.length === 1 ? body.querySelector('.dock-pane.active') : null, top = readMetric(was, 'scrollTop') || 0;
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
  function show(id, opts = {}) {
    if (id === 'lobule') { onLobule?.(); return; }
    if (id === 'landscape' || ALIAS[id]) id = ALIAS[id] || 'profile';
    if (id === 'varixwall') { setEndoSub('wall'); id = 'endoscopy'; }
    if (!byId[id]) return;
    if (!afterLoad(id, () => showNow(id, opts))) showNow(id, opts);
  }
  function showNow(id, { open: doOpen = true, reveal = false, alongside = false } = {}) {
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
  function ensure() { updateSize(); layout(); workspace.classList.remove('entering'); void readMetric(workspace, 'offsetWidth'); workspace.classList.add('entering'); }
  function toggleDock() {
    if (isVisible()) close();
    else { onOpen(); setState('open'); ensure(); }
  }
  // The divider resizes the card: its width on the right, its height as a sheet. Mouse, touch and
  // keyboard; it changes the layout, never the simulation.
  // Everything the drag needs is measured once as it begins (the stage, the card, the sheet's ceiling). While it moves, a guide line
  // follows the pointer by a transform alone, showing where the card's edge will be, and the card takes that size once, on release:
  // no read of the page and no new layout of the card on any frame of the drag.
  let drag = null;
  const guide = h('div', { class: 'dock-guide', 'aria-hidden': 'true' });
  // (The guide has a compositor layer of its own only while the divider is dragged and while it fades out.)
  let guideLayerT = 0;
  divider.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const side = isSide(), W = readMetric(stageWrap, 'clientWidth'), H = readMetric(stageWrap, 'clientHeight');
    drag = { x: e.clientX, y: e.clientY, w: readMetric(workspace, 'clientWidth'), height: readMetric(workspace, 'clientHeight'), side, W, H, max: side ? 0 : sheetMax(H) };
    const d = readBox(divider), c = readBox(workspace);
    if (!guide.isConnected) document.body.append(guide);
    guide.classList.toggle('side', side);
    Object.assign(guide.style, side
      ? { left: `${d.left + d.width / 2 - 1}px`, top: `${c.top}px`, width: '2px', height: `${c.height}px`, transform: '' }
      : { left: `${c.left}px`, top: `${d.top + d.height / 2 - 1}px`, width: `${c.width}px`, height: '2px', transform: '' });
    clearTimeout(guideLayerT); guide.classList.add('dg-live', 'on'); classNow(guide, 'dg-live', true);
    workspace.classList.add('resizing');
    divider.setPointerCapture(e.pointerId);
  });
  divider.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.side) widthPx = drag.w + drag.x - e.clientX;
    else heightRatio = clamp((drag.height + drag.y - e.clientY) / drag.H, 0.25, 0.75);
    // alloc-rare: only while the sheet's edge is dragged, one string per input event
    guide.style.transform = drag.side ? `translate3d(${Math.round(drag.w - sideWidth(drag.W))}px, 0, 0)` : `translate3d(0, ${Math.round(drag.height - sheetHeight(drag.H, drag.max))}px, 0)`;
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(ev, () => {
    if (!drag) return;
    drag = null; guide.classList.remove('on'); clearTimeout(guideLayerT); guideLayerT = setTimeout(() => classSoon(guide, 'dg-live', false), 700); workspace.classList.remove('resizing');
    updateSize(); remember(); dispatchEvent(new Event('resize'));
  });
  divider.addEventListener('keydown', (e) => {
    const grow = e.key === 'ArrowUp' || e.key === 'ArrowLeft', shrink = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (!grow && !shrink && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    if (isSide()) {
      const W = readMetric(stageWrap, 'clientWidth');
      widthPx = e.key === 'Home' ? 360 : e.key === 'End' ? W * 0.62 : readMetric(workspace, 'clientWidth') + (grow ? 40 : -40);
    } else {
      heightRatio = e.key === 'Home' ? 0.25 : e.key === 'End' ? 0.75 : clamp((heightRatio ?? readMetric(workspace, 'clientHeight') / readMetric(stageWrap, 'clientHeight')) + (grow ? 0.05 : -0.05), 0.25, 0.75);
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
    const h0 = readMetric(workspace, 'clientHeight'), side = isSide() && state !== 'focus';
    // As a tall card the plots take a sensible share of the height, so a pair still fits.
    const plot = side ? clamp((readMetric(body, 'clientHeight') / (open.length > 1 ? 2 : 1)) - 90, 190, 380) : clamp(h0 - (isPhoneLayout() ? 150 : 190), 190, 420);   // a tablet's sheet has a taller header and tab row (an upright one is a phone's)
    workspace.style.setProperty('--plot-h', `${plot}px`);
    workspace.style.setProperty('--square-size', `${clamp(side ? readMetric(workspace, 'clientWidth') - 80 : h0 - 160, 220, 380)}px`);
    layout();
  });
  sizeObserver.observe(stageWrap); sizeObserver.observe(body);
  sideMQ.addEventListener('change', () => { updateSize(); layout(); });
  store.on('compareSnap', () => updateHeader());
  let cmpRows = [], cmpNums = [], cmpWhen = null, cmpAsk = 0;
  const cmpKeys = [];   // (the names of the rows the line was built for, with its moment: it is built again when either changes)
  function buildComparison() {
    cmpAsk = 0;
    const bs = cmpRows.map(([, txt]) => h('b', {}, txt));
    comparison.replaceChildren(h('span', { class: 'comparison-label' }, `Since ${cmpWhen}`),   // (the moment by its time, as the figure header names it: "baseline" was a third word for "then")
      ...cmpRows.map(([label], i) => h('span', {}, label, bs[i])));
    for (const w of cmpNums) w.dispose();   // (recs §8: the rows they wrote are replaced)
    cmpNums = bs.map((b) => glWords(b));
  }
  function updateHeader() {
    const st = store.get(), comparing = !!st.compareSnap;
    const hideCmp = !comparing || state === 'peek' || st.imaging;
    foldHidden(comparison, hideCmp);   // (it opens and folds shut, so the card under it eases rather than jumps)
    if (comparing && frame) {
      const a = st.compareSnap.metrics, b = frame.metrics;
      const rows = compareRows(a, b, !hiddenNow(st)?.has('trueHVPG'), !st.hiddenReadouts?.has('model'), fmt);
      // (Frames arrive ten times a second. The line is built between frames, when its moment or its names change; its numbers are drawn on
      // the GPU as they change (gl-words.js), so no frame writes into it.)
      let same = cmpWhen === st.compareSnap.when && cmpKeys.length === rows.length;
      for (let i = 0; same && i < rows.length; i++) if (cmpKeys[i] !== rows[i][0]) same = false;
      cmpRows = rows;
      if (!same) { cmpWhen = st.compareSnap.when; cmpKeys.length = rows.length; for (let i = 0; i < rows.length; i++) cmpKeys[i] = rows[i][0]; cmpAsk ||= restPass(buildComparison); }
      else if (!cmpAsk) for (let i = 0; i < rows.length; i++) cmpNums[i]?.set(rows[i][1]);
    }
    paintTitle();
    const txt = !frame ? '' : state === 'peek' && !st.imaging ? INFO[open[0]][1](frame)
      : frame.clock === 'disease' ? dayText(st.running, frame.day) : st.running ? '' : 'Paused';
    const ls = state === 'peek' ? 'summary' : st.running ? 'live' : 'paused';
    // A new kind of status (Paused, a day count, an instrument's summary) crossfades in; the numbers inside one kind just count on.
    const sameKind = live._ls === ls && live._txt != null && sameShape(live._txt, txt);
    live._ls = ls; live._txt = txt;
    if (!sameKind) swapText(live, txt); else putText(live, txt);
    dataSoon(live, 'state', ls);
  }
  // The heartbeat (the model's pulsatile mode) runs while a waveform instrument is on screen.
  let beat = null;
  function syncBeat() {
    const on = isVisible() && state !== 'peek' && (open.includes('scope') || open.includes('doppler'));
    if (on !== beat) { beat = on; onBeat?.(on); }
  }
  let preloaded = false;
  function updateDock(f, force) {
    if (!preloaded && isVisible()) { preloaded = true; load(); }   // (the card is open: the Doppler and the FibroScan are asked for before a tab is reached)
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
  /** A new patient's traces open with the steady state's last seconds already drawn (backfill.js); what they have recorded since stays. */
  function backfillTraces(hs) { byId.scope.backfill(hs); byId.doppler.backfill(hs); }
  // (One look at the size per frame, between frames: a window edge dragged on a Mac fires dozens of resize events a second, and each
  // was a forced style and layout pass of the page, some a write then a read.)
  let sizeAsk = 0;
  const sizePass = () => { sizeAsk = 0; updateSize(); layout(); };
  addEventListener('resize', () => { if (!sizeAsk) sizeAsk = restPass(sizePass); });
  setState('open'); updateSize(); layout();
  /** Bring in the instruments that load after the first paint (main.js calls it when the app is idle). */
  function load() { for (const p of panes) p.need?.(); }
  return {
    update: updateDock, ingest, clearTraces, backfillTraces, show, toggle: toggleDock, close, ensure, openGrid, profile, load,
    pane: (id) => id === 'landscape' ? profile : id === 'varixwall' ? wall : byId[id],
    isOpen: (id) => isVisible() && open.includes(id === 'landscape' ? 'profile' : id === 'varixwall' ? 'endoscopy' : id),
    setState,
  };
}
