// Pressure over time: the portal circulation's pressures as a live trace, and below them the
// HVPG (wedged − free hepatic venous pressure) on its own lane, read against its clinical
// thresholds, and over the last beats a schematic EKG strip timed to the model's own heartbeat (ekg.js). Three ranges share one chart: the last beats (every heartbeat and breath), the
// last two minutes (a band from trough to peak around the mean) and the disease clock (one point
// per day). Changes the learner makes and threshold events are marked where they happened, and
// a crosshair (hover, or drag on a touch screen) reads every trace at one moment.

import { store, hiddenNow } from './store.js';
import { h, fmt, cssVar, cssAlpha, clamp } from './util.js';
import { FONT as FONT0, FONT } from './charts.js';
import { frameFor, cancelFrame, paceMs, restGapFor, restPark, noteDraw, frameAnimating, pageRest, onPageWake } from './frame.js';
import { tenthGap } from '../engine/gap.js';
import { HVPG_CUTS, hvpgSev, HVPG_WORDS, BLEED_WORD, TOKEN_OF_SEV, NOT_SHOWN } from '../engine/pressure-cuts.js';
import { firstAtOrAbove, firstAbove } from './sorted.js';
import { limitLabelX as labelX } from './limit-label.js';
import { wrapLabel } from './wrap-label.js';
import { createBeatClock, ekgSeries, leadIISeries } from './ekg.js';
import { createFreewheel } from './freewheel.js';
import { laneRoom } from './trace-lanes.js';
import { olderThan, inFront } from './backfill.js';
import { plotFill } from './plot-look.js';
import { createTraceGL, fitPen } from './trace-gl.js';
import { createStill } from './still-layer.js';
import { beatTop, beatLayout, colPlan, paperFine, beforeLabelY, sinceText } from './beat-card.js';
import { VITALS } from './vital-read.js';
import { restPass, cancelRest } from './rest-pass.js';
import { shownOr } from './shown.js';
import { dropFront, dropFrontNums } from './drop-front.js';
const nextFrame = frameFor('pressure-time');

// hide: the readout that can stay unmeasured (store.hiddenReadouts); day: the value on the
// disease clock (null where the model keeps no daily value).
const TRACES = [
  { id: 'CONF', label: 'Portal vein', abbr: 'PV', short: 'Portal', c: '--tr-pv', hide: 'pv', on: true, day: (m) => m.pv },
  { id: 'whvp', label: 'Wedged hepatic (WHVP)', abbr: 'WHVP', short: 'Wedged', c: '--tr-wedge', hide: 'trueHVPG', on: true, day: (m) => m.whvp },
  { id: 'RHV', label: 'Free hepatic (FHVP)', abbr: 'FHVP', short: 'Free', c: '--tr-hv', hide: 'trueHVPG', on: true, day: (m) => m.fhvp },
  { id: 'RA', label: 'Right atrium', abbr: 'RA', short: 'RA', c: '--tr-ra', hide: 'ra', on: false, day: (m) => m.ra },
  { id: 'IVCS', label: 'IVC', abbr: 'IVC', short: 'IVC', c: '--tr-ivc', hide: 'ra', on: false, day: (m) => m.ivc },
  { id: 'VAR', label: 'Esophageal varix', abbr: 'Varix', short: 'Varix', c: '--tr-var', hide: 'pv', on: false, day: null },
  { id: 'SV', label: 'Splenic vein', abbr: 'SV', short: 'Splenic', c: '--tr-sv', hide: 'pv', on: false, day: (m) => m.sv },
  { id: 'SMV', label: 'Superior mesenteric vein', abbr: 'SMV', short: 'SMV', c: '--tr-smv', hide: 'pv', on: false, day: null },
];
const KEYS = [...TRACES.map((t) => t.id), 'hvpg'];
// The live readings written at the lines' ends and in the header are the bottom bar's as shown (shown.js: its running mean on the shown
// state, premium-feel R4), so they glide with it frame by frame and wedged − free at the ends is the header's HVPG and the bar's.
const BAR_KEY = { CONF: 'pv', whvp: 'whvp', RHV: 'fhvp', IVCS: 'ivc' };
const liveEnd = (t, m) => { const v = t.day?.(m); return BAR_KEY[t.id] ? shownOr(BAR_KEY[t.id], v) : v; };
const SMOOTH_S = 6; // seconds averaged by the Smooth toggle
const BEAT_CARD_S = 5;
const RANGES = [['beats', '10 s', 10], ['minutes', '2 min', 120], ['days', 'Days', null]];
const LAG_S = 0.12; // wall seconds the trace runs behind the newest sample, so it can glide between frames
const FINE_S = 22, COARSE_S = 140, BIN = 0.25;
const JUMP_S = 0.5;   // (a first sample this far ahead of the last one recorded, or any way behind it, is a clock that was set, not the next frame)
// HVPG cut-offs: above normal, clinically significant (Baveno), and 12, below which varices rarely bleed.
// (Each named by its band's short word, pressure-cuts.js HVPG_WORDS; from the bleed line the CSPH band adds the risk, made once here.)
const LIMITS = [[HVPG_CUTS.amber, ''], [HVPG_CUTS.red, `${HVPG_WORDS.danger[0]} ${HVPG_CUTS.red}`], [HVPG_CUTS.bleed, `${BLEED_WORD} ${HVPG_CUTS.bleed}`]];
const sevOf = hvpgSev;
const BLEED_BAND = `${HVPG_WORDS.danger[0]} · ${BLEED_WORD.toLowerCase()}`;
const wordOf = (v) => (v < HVPG_CUTS.amber ? HVPG_WORDS.ok[0] : v < HVPG_CUTS.red ? HVPG_WORDS.caution[0] : v < HVPG_CUTS.bleed ? HVPG_WORDS.danger[0] : BLEED_BAND);
const nice = (span, n = 4) => { const raw = Math.max(1e-6, span / n); const p = Math.pow(10, Math.floor(Math.log10(raw))); const r = raw / p; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p; };

// Kept once, for every frame (nothing below is made in a frame: gpu-practices.md, "no allocation in a frame"). Dashes are handed to the pen,
// which copies them; the words are tables made here, at load, so a frame reads a string instead of building one.
const DASH_NONE = [], DASH_PORTAL = [6, 4], DASH_BEFORE = [0.1, 4.5], DASH_LIMIT = [3, 4], DASH_MARK = [2, 3], DASH_SWATCH = [4, 3], DASH_WEDGE = [7, 5];
const TICK_CHOICES = [5, 10, 20, 25, 50];
const HVPG_KEYS = ['hvpg'];
const RANGE_SPAN = Object.fromEntries(RANGES.map((r) => [r[0], r[2]]));   // (seconds on screen; null: the days)
const BEAT_TOP_KEYS = ['whvp', 'CONF'];
const SEV_VAR = TOKEN_OF_SEV;   // (hvpgSev's three words, as colour tokens)
const AX_BEATS = [], AX_MIN = [], STR5 = [];   // (the time axis' names by seconds back, "−4 s", "−2 min"; the scale's numbers by fives)
for (let s = 0; s <= 240; s++) { AX_BEATS[s] = `−${s} s`; AX_MIN[s] = s % 60 === 0 ? `−${s / 60} min` : `−${s} s`; }
for (let i = 0; i <= 600; i++) STR5[i] = String(i * 5);
const TRACE_OF = Object.fromEntries(TRACES.map((t) => [t.id, t]));
const IMAGING_HIDDEN = new Set(['pv', 'trueHVPG', 'ra']), NONE_HIDDEN = new Set();
const mkSlot = () => ({ x: [], mid: [], lo: null, hi: null, loB: [], hiB: [] });   // (a series written in place: x, mid, and lo / hi on the two minutes)
const mkJoin = () => ({ a: null, sep: null, b: null, s: '' });
/** `a + sep + b`, built again only when a part is not what this place last built it from (one slot to a place in the drawing). */
function joined(slot, a, sep, b) {
  if (slot.a !== a || slot.sep !== sep || slot.b !== b) { slot.s = a + sep + b; slot.a = a; slot.sep = sep; slot.b = b; }   // alloc-rare: a part changed (a new reading, label or day); the same words are read back otherwise
  return slot.s;
}
// A digit-for-0 copy of a string, for setting figures in a column; the same string comes round every frame, so it is made once per string.
const zeros = new Map();
function zeroed(t) {
  let z = zeros.get(t);
  if (z === undefined) { if (zeros.size > 400) zeros.clear(); z = t.replace(/\d/g, '0'); zeros.set(t, z); }   // alloc-rare: first sight of this string
  return z;
}
const sevVars = new Map();
function sevVar(sev) {
  const v = SEV_VAR[sev];
  if (v !== undefined) return v;
  let t = sevVars.get(sev);
  if (t === undefined) { t = `--${sev}`; sevVars.set(sev, t); }   // alloc-rare: first sight of this marker severity
  return t;
}
const byY = (a, b) => a.y - b.y;

export function createPressureTime({ marks = () => [], stillLayer = true } = {}) {
  // ── DOM ───────────────────────────────────────────
  const heroVal = h('b', { class: 'pt-num' }, NOT_SHOWN);
  const heroSev = h('span', { class: 'pt-sev' });
  const heroDelta = h('span', { class: 'pt-delta' });
  // The header is one row on every screen: HVPG, the number, and the status over its trend.
  const hero = h('div', { class: 'pt-hero' }, h('span', { class: 'pt-k' }, 'HVPG'), h('span', { class: 'pt-v' }, heroVal, h('small', {}, 'mmHg')), h('span', { class: 'pt-st' }, heroSev, heroDelta));
  let range = 'beats', userRange = 'beats';
  const rangeSeg = h('div', { class: 'seg pt-range', role: 'group', 'aria-label': 'Time range' }, RANGES.map(([id, label]) =>
    h('button', { 'data-range': id, 'aria-pressed': String(id === range), onclick: () => { userRange = id; setRange(id); } }, label)));
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure over time' });
  // The chart's still parts (laptop-heat recs H3): its panel, grid, thresholds and, on a slide's card, the column of readings, drawn
  // first each frame, kept on the GPU as a layer while their version holds (still-layer.js, trace-gl.js keepLayer); the traces, ends, markers, axis and crosshair are drawn over it.
  const still = createStill(cv, { on: stillLayer });
  const box = h('div', { class: 'chart-box pt-box' }, cv);
  // The chart drawn by the GPU (trace-gl.js; Mohammad, 1 Nov: "Move everything to GPU"): every part of it, the panel, grid and words as
  // well as the traces, the markers and the crosshair's card, through the GPU drawer's 2D context, with this canvas left blank under it.
  // No WebGL2, a software renderer, a lost context or ?tracegl=0: drawn on this canvas, as before.
  const gpu = createTraceGL(cv, { redraw: () => { if (frame) draw(); } });
  let pen = null;   // (the context the frame being drawn uses, for the markers' measuring and drawing)
  const chosen = new Set(TRACES.filter((t) => t.on).map((t) => t.id));
  const chips = h('div', { class: 'pt-chips', role: 'group', 'aria-label': 'Traces' }, TRACES.map((t) => {
    // Short names, so every chip fits; the full name is the tooltip and what a screen reader says.
    const b = h('button', { class: 'pt-chip', 'data-trace': t.id, 'aria-pressed': String(chosen.has(t.id)), title: t.label, 'aria-label': t.label, style: { '--chip': `var(${t.c})` } }, h('i'), t.abbr);
    b.addEventListener('click', () => {
      if (chosen.has(t.id)) chosen.delete(t.id); else chosen.add(t.id);
      b.setAttribute('aria-pressed', String(chosen.has(t.id)));
      draw();
    });
    return b;
  }));
  // The two lanes beside the pressures: the EKG strip (the beats range only) and the HVPG lane. Patients mode turns them on and off here; a slide's
  // card does not use the pills (hidden there): it takes both lanes where its room allows, as the slide's tool says (configure).
  let showEkg = false, showLane = true;
  let cfg = { ekg: true, lane: true };
  let before = null;   // (a slide's card: { fp, label }, where the patient stood before the slide's event, its delta; beat-card.js)   // (a slide's tool: ekg: false leaves the strip off, hvpgLane: false the HVPG lane)
  const laneChip = (key, label, title, on, set) => {
    const b = h('button', { class: 'pt-chip', 'data-lane': key, 'aria-pressed': String(on), title, 'aria-label': title, style: { '--chip': 'var(--text)' } }, h('i'), label);
    b.addEventListener('click', () => { set(b.getAttribute('aria-pressed') !== 'true'); b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); yr.pressure = yr.hvpg = null; draw(); });
    return b;
  };
  const ekgChip = laneChip('ekg', 'EKG', 'A schematic EKG over the pressures, timed to the model\'s heartbeat. On the 10 s range only.', false, (v) => { showEkg = v; });
  const laneChipBtn = laneChip('hvpg', 'HVPG lane', 'The HVPG lane under the pressures', true, (v) => { showLane = v; });
  chips.append(ekgChip, laneChipBtn);
  // Display only: averages away the heartbeat and breathing swings; the simulation is untouched.
  let smooth = false;
  const smoothBtn = h('button', { class: 'pt-chip pt-smooth', 'aria-pressed': 'false', title: 'Show the mean: hide beat-to-beat and respiratory variation', onclick: () => {
    smooth = !smooth; yr.pressure = yr.hvpg = null; smoothBtn.setAttribute('aria-pressed', String(smooth)); draw();
  } }, 'Smooth');
  // Smooth and the range switch sit with the trace pills under the chart, together at the right end of the pills' last line.
  chips.append(h('div', { class: 'pt-ctl' }, smoothBtn, rangeSeg));
  const el = h('div', { class: 'pt' }, h('div', { class: 'pt-head' }, hero), box, chips);

  function setRange(id) {
    range = id;
    rangeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === id)));
    ekgChip.disabled = id !== 'beats';   // (one beat is the strip's unit: over two minutes or days it has nothing to show)
    yr.pressure = yr.hvpg = null;
    draw();
  }

  // ── Buffers ───────────────────────────────────────
  // fine: every sample of the last few seconds; coarse: quarter-second bins (trough, peak, mean)
  // for the last two minutes; days: one point per simulated day.
  const fine = { t: [], ph: [], ...Object.fromEntries(KEYS.map((k) => [k, []])) };
  const beatClock = createBeatClock(), BC = beatClock.cur;   // (when the cardiac phase wrapped: each wrap starts a beat on the EKG strip)
  const coarse = [];
  let bin = null;
  // The quarter-second bins are kept for the window and handed back to this pool when it lets them go, so a bin is made only until the window has been
  // as long as it will be: each has its row of four numbers (trough, peak, sum, count) for every trace, bin.v[key] the row once the trace has a
  // reading in the bin (undefined before), bin.has which rows are in use.
  const binPool = [];
  const mkBin = () => ({ t: 0, v: {}, rows: KEYS.map(() => new Float64Array(4)), has: new Uint8Array(KEYS.length) });   // alloc-rare: a bin is made only until the window has been this long once; the pool then hands back the ones it lets go
  const takeBin = (t0) => { const b = binPool.pop() || mkBin(); b.t = t0; return b; };
  const freeBin = (b) => { for (let j = 0; j < KEYS.length; j++) if (b.has[j]) { b.has[j] = 0; b.v[KEYS[j]] = undefined; } binPool.push(b); };
  // (The columns of the fine buffer in the order of KEYS, and the sources of the frame being recorded: nothing is looked up by name for every sample.)
  const FINE_COLS = KEYS.map((k) => fine[k]), ALL_COLS = [fine.t, fine.ph, ...FINE_COLS], SRC = KEYS.map(() => null);
  let days = [];
  let clock = 'hemo', dayNow = 0, lastT = -Infinity, frame = null, wallAt = 0;
  // off: the model's time plus off is the trace's (the model's clock was set while the trace went on: a state restored, a time-lapse ended).
  let off = 0;
  // stripDays: the chart on the disease clock (a time-lapse) draws the days' trend, and its beat strip goes on sweeping over it; sweepLapse: the
  // freewheel runs through the time-lapse (that, or the slide's beat card, which stays as it is).
  let stripDays = false, sweepLapse = false;
  const beatCardNow = () => onSlide() && userRange === 'beats' && !hiddenSet().has('trueHVPG');

  function resetBuffers() {
    for (let q = 0; q < ALL_COLS.length; q++) ALL_COLS[q].length = 0;
    for (let q = 0; q < coarse.length; q++) freeBin(coarse[q]);
    coarse.length = 0; if (bin) freeBin(bin);
    bin = null; lastT = -Infinity; beatClock.reset(); off = 0; wheel.stop();
  }
  function clearHemo() { resetBuffers(); steadyAt = 0; }
  // On a slide each reading is its steady value, the mean over the last few seconds, so the lines' end labels, the header and
  // the tiles agree, and a laptop and a tablet show the same numbers whenever they are looked at. (The HVPG is the difference
  // of the two readings as shown, so WHVP − FHVP reads exactly.)
  const steady = {};
  let steadyAt = 0;
  function settle(m) {
    if (!m) return;
    const now = performance.now(), a = steadyAt ? 1 - Math.exp(-Math.min(1, (now - steadyAt) / 1000) / 2.5) : 1;
    steadyAt = now;
    for (const t of TRACES) { const v = t.day?.(m); if (Number.isFinite(v)) steady[t.id] = a < 1 && Number.isFinite(steady[t.id]) ? steady[t.id] + (v - steady[t.id]) * a : v; }
  }
  // (A slide pins the numbers its tiles show, its settled state: the ends and the header read those, so they match the tiles
  // to the digit on every screen. A trace with no tile number keeps its steady mean.)
  let pinned = null;
  const PIN = { CONF: 'pv', whvp: 'whvp', RHV: 'fhvp', RA: 'ra', IVCS: 'ivc' };
  const onSlide = () => !!cv.closest('.pz-tool');
  const endOf = (id) => (Number.isFinite(pinned?.[PIN[id]]) ? pinned[PIN[id]] : steady[id]);
  const steadyHvpg = () => tenthGap(endOf('whvp'), endOf('RHV'), frame.metrics.hvpg);
  // Samples (a frame's, or the history's) into the fine buffer, the quarter-second bins and the beat clock; the buffers keep a fixed window.
  let nans = new Float64Array(0);
  function record(smp, o = 0) {
    // (lastT is held in a local through the loop and written back once: a number kept in a closure's variable is a heap object made anew
    // at each assignment, one for every sample of every frame.)
    let lt = lastT;
    const ts = smp.t, KN = KEYS.length;
    // (A column the samples lack reads as NaN from `nans`: a load that may be a number or undefined, or `a ? a[i] : NaN`, is a tagged value, a
    // heap number made for every sample of every column, 5 KB a frame: scripts/warm-alloc.mjs, 3 Nov 2026. `+` keeps it a number.)
    if (nans.length < ts.length) nans = new Float64Array(ts.length * 2).fill(NaN);   // alloc-rare: grows only when a longer sample set than any before arrives
    for (let j = 0; j < KN; j++) SRC[j] = smp[KEYS[j]] || nans;
    const phs = smp.ph || nans;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i] + o;
      if (t <= lt) continue;
      lt = t;
      const p = +phs[i];
      fine.t.push(t); fine.ph.push(p); BC[0] = t; BC[1] = p; beatClock.step();
      const b0 = Math.floor(t / BIN) * BIN;
      if (!bin || bin.t !== b0) {
        if (bin) coarse.push(bin);
        bin = takeBin(b0);
      }
      for (let j = 0; j < KN; j++) {
        const v = +SRC[j][i];
        FINE_COLS[j].push(v);
        if (v !== v) continue;
        const s = bin.rows[j];
        if (!bin.has[j]) { bin.has[j] = 1; s[0] = v; s[1] = v; s[2] = 0; s[3] = 0; bin.v[KEYS[j]] = s; }
        if (v < s[0]) s[0] = v; if (v > s[1]) s[1] = v; s[2] += v; s[3]++;
      }
    }
    lastT = lt;
    const tf = fine.t, limF = lastT - FINE_S, limC = lastT - COARSE_S;
    let cut = 0; while (cut < tf.length && tf[cut] < limF) cut++;
    if (cut) { for (let q = 0; q < ALL_COLS.length; q++) dropFrontNums(ALL_COLS[q], cut); beatClock.dropBefore(fine.t[0]); }
    cut = 0; while (cut < coarse.length && coarse[cut].t < limC) cut++;
    if (cut) { for (let q = 0; q < cut; q++) freeBin(coarse[q]); dropFront(coarse, cut); }
  }
  // ── The freewheel (freewheel.js) ──
  // While the model's own clock stands still under a running page (a state easing in: frame.parkSecs is a number) it sends no samples, and the
  // trace would stop at its last one, as if frozen: the last whole beat is replayed over the time that passes instead, so the sweep goes on and
  // the live samples take it on from where it is. (On the disease clock the chart is the days' trend: it has no sweep to keep, and the beats it
  // has stay as they are.)
  const wheel = createFreewheel(KEYS);
  const LV = new Array(KEYS.length).fill(NaN);   // (the model's readings now, one to a key: the replayed beat's levels follow their changes)
  const HEAD = new Float64Array(2);   // [the head as last drawn, the wall time it was drawn at]: the freewheel goes on from it
  const parkedNow = (f) => !!f && f.running && f.parkSecs != null && (f.clock !== 'disease' || sweepLapse);
  /** The heart rate the chart shows (the slide's pinned reading, else the live one). */
  const rateNow = () => { const hr = frame?.clock === 'disease' ? frame.metrics?.hr : pinned?.hr ?? frame?.metrics?.hr; return Math.min(220, Math.max(30, hr > 20 ? hr : 70)); };
  function advanceFw(now) {
    if (!parkedNow(frame)) { wheel.stop(); return; }
    const left = frame.parkSecs == null ? NaN : Math.max(0, frame.parkSecs - (now - wallAt) / 1000);
    const m = frame.metrics;
    for (let i = 0; i < KEYS.length; i++) { const k = KEYS[i]; LV[i] = k === 'hvpg' ? m?.hvpg : TRACE_OF[k]?.day?.(m) ?? NaN; }
    const smp = wheel.advance(now, fine, beatClock.times, lastT, wheel.on ? 0 : HEAD[1] ? HEAD[0] + Math.min(0.25, (now - HEAD[1]) / 1000) : headX(), LAG_S, rateNow(), frame.phase, left, LV);
    if (smp) record(smp);
  }
  function ingest(f) {
    const was = wheel.laid;
    frame = f; wallAt = performance.now();
    wake();
    if (f.clock !== 'disease') settle(f.metrics);
    // (A new day no longer wipes the beats: a time-lapse runs the days past, and the sweep goes on through them and after them.)
    dayNow = f.day;
    const smp = f.samples;
    if (smp && f.clock !== 'disease' && smp.t.length) {
      // A new patient, a state restored or a step back in time sets the engine's clock: the trace goes on from where it is, its time moved on
      // to start where it left off, and the beat clock finds the new run's beats.
      const n = smp.t.length, t0 = smp.t[0] + off;
      if (lastT > -Infinity && (t0 < lastT - 1e-9 || t0 > lastT + JUMP_S)) {
        // (After a freewheel the newest sample is put the lag ahead of the head as it has moved on, so the trace keeps its pace through the landing.)
        off = was ? Math.max(lastT, HEAD[0] + Math.min(0.25, (performance.now() - HEAD[1]) / 1000) + LAG_S) - smp.t[n - 1]
          : lastT + (smp.t.length > 1 ? smp.t[1] - smp.t[0] : 0.004) - smp.t[0];
      }
      wheel.land();
      record(smp, off);
    }
    // (After the samples: a change of range draws, and the draw must see the record the frame brought.)
    if (f.clock !== clock) {
      clock = f.clock;
      // The disease clock is a trend: show it as one while it runs, then return to the learner's range.
      // (A slide's beat-by-beat card stays as it is through a time-lapse: its pressures glide with the model's, and its strip sweeps on, so the
      // card never changes layout under the viewer.)
      setRange(clock === 'disease' && !beatCardNow() ? 'days' : userRange);
    }
    // (Over the days' trend of a time-lapse the EKG strip, if the chart has one, keeps its own window and sweeps on.)
    stripDays = f.clock === 'disease' && range === 'days' && userRange === 'beats' && (onSlide() ? cfg.ekg : showEkg);
    sweepLapse = f.clock === 'disease' && (range === 'beats' || stripDays);
    const m = f.metrics;
    const last = days[days.length - 1];
    if (last && f.day < last.day) days = [];
    if (!days.length || days[days.length - 1].day !== f.day) {
      days.push({ day: f.day, v: { hvpg: m.hvpg, ...Object.fromEntries(TRACES.filter((t) => t.day).map((t) => [t.id, t.day(m)])) } });
      if (days.length > 1500) days.shift();
    } else {
      // Keep today's point current (a treatment changes it without a new day).
      const d = days[days.length - 1];
      d.v.hvpg = m.hvpg;
      for (const t of TRACES) if (t.day) d.v[t.id] = t.day(m);
    }
  }

  // ── Series for the current range ──────────────────
  // Each series: { x: [...], mid: [...], lo?: [...], hi?: [...] } in the range's x units. It is written in place into the slot it is given
  // (kept for the chart's life, mkSlot) and the slot is returned; what a frame holds on to, `slots`, has one for each trace and the HVPG.
  const slots = {}, tmpSlot = mkSlot(), smRaw = mkSlot(), smA = [], smB = [];
  for (const k of KEYS) slots[k] = mkSlot();
  function series(key, x0, x1 = Infinity, out) {
    if (!smooth || range === 'days') return rawSeries(key, x0, x1, out);
    // Average over the whole retained history (so the left edge is not a short window), twice,
    // then cut to the view: one pass leaves a ripple of the breathing rhythm at the newest end.
    const raw = rawSeries(key, -Infinity, x1, smRaw);
    smoothed(raw.x, raw.mid, smA, SMOOTH_S);
    smoothed(raw.x, smA, smB, SMOOTH_S / 2);
    // Where the oldest samples lack a full window the average is lopsided: draw only from where it is complete.
    const from = Math.max(x0 - 0.05, (raw.x[0] ?? 0) + SMOOTH_S * 1.5);
    let i = 0; while (i < raw.x.length && raw.x[i] < from) i++;
    let n = 0;
    for (; i < raw.x.length; i++, n++) { out.x[n] = raw.x[i]; out.mid[n] = smB[i]; }
    out.x.length = n; out.mid.length = n; out.lo = out.hi = null;
    return out;
  }
  // Trailing mean over w seconds, without the trough-to-peak band: the mean of mid (at xs) into out.
  function smoothed(xs, mid, out, w) {
    const len = xs.length;
    out.length = len;
    let j = 0, sum = 0, n = 0;
    for (let i = 0; i < len; i++) {
      const v = mid[i];
      if (!Number.isNaN(v)) { sum += v; n++; }
      while (xs[j] < xs[i] - w) { if (!Number.isNaN(mid[j])) { sum -= mid[j]; n--; } j++; }
      out[i] = n ? sum / n : NaN;
    }
  }
  function rawSeries(key, x0, x1, out) {
    out.lo = out.hi = null;
    if (range === 'beats') {
      // (The samples are in time order: the window is one run of them, found by bisection and copied whole.)
      const i0 = firstAtOrAbove(fine.t, x0 - 0.05), i1 = firstAbove(fine.t, x1), v = fine[key], t = fine.t;
      const n = i1 > i0 ? i1 - i0 : 0;
      for (let i = 0; i < n; i++) { out.x[i] = t[i0 + i]; out.mid[i] = v[i0 + i]; }
      out.x.length = n; out.mid.length = n;
      return out;
    }
    if (range === 'minutes') {
      out.lo = out.loB; out.hi = out.hiB;
      out.x.length = out.mid.length = out.lo.length = out.hi.length = 0;
      const all = coarse; // the bin still filling has few samples and would wiggle at the tail
      for (const b of all) {
        const s = b.v[key];
        if (!s || b.t < x0 - BIN || b.t + BIN / 2 > x1) continue;
        out.x.push(b.t + BIN / 2); out.mid.push(s[2] / s[3]); out.lo.push(s[0]); out.hi.push(s[1]);
      }
      return out;
    }
    out.x.length = out.mid.length = 0;
    for (const d of days) if (d.v[key] != null && d.day >= x0) { out.x.push(d.day); out.mid.push(d.v[key]); }
    return out;
  }

  // ── Crosshair ─────────────────────────────────────
  let cross = null; // CSS px x within the canvas, or null
  // (The canvas's left edge, read as a pointer comes onto it or presses, and again between frames after a scroll or a resize, never
  // in a move.)
  let cvLeft = null, over = false, leftAsk = 0;
  function readLeft() { leftAsk = 0; cvLeft = cv.getBoundingClientRect().left; }
  const leftLater = () => { if (over) { cancelRest(leftAsk); leftAsk = restPass(readLeft); } };
  addEventListener('scroll', leftLater, { capture: true, passive: true });
  addEventListener('resize', leftLater, { passive: true });
  const setCross = (e) => { if (cvLeft == null) return; cross = e.clientX - cvLeft; draw(); };
  cv.addEventListener('pointerenter', () => { over = true; readLeft(); });
  cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) setCross(e); });
  cv.addEventListener('pointerdown', (e) => { over = true; readLeft(); setCross(e); });
  for (const ev of ['pointerleave', 'pointercancel']) cv.addEventListener(ev, () => { over = false; cross = null; draw(); });
  cv.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { cross = null; draw(); } });

  // ── Drawing ───────────────────────────────────────
  const yr = { pressure: null, hvpg: null }; // eased y ranges, so the axis glides instead of jumping
  // Sticky range: it only changes when the data leaves it (grow at once) or fills under 55% of it
  // (shrink), so the scale holds still while the trace scrolls.
  // The axis drawn glides to that range (τ 0.15 s) instead of rescaling in one frame; while it glides, a paused chart draws
  // itself again next frame (round 2 review, Over time y-axis).
  const ys = { pressure: null, hvpg: null }, ysAt = { pressure: 0, hvpg: 0 };
  const yrBuf = { pressure: [0, 0], hvpg: [0, 0] }, ysBuf = { pressure: [0, 0], hvpg: [0, 0] };   // (the two ranges, written in place)
  let gliding = false, glideReq = false;
  function ease(key, lo, hi) {
    const r = yr[key];
    if (!r || lo < r[0] || hi > r[1] || hi - lo < (r[1] - r[0]) * 0.55) {
      const m = (hi - lo) * 0.08, b = yrBuf[key];
      b[0] = lo - m; b[1] = hi + m; yr[key] = b;
    }
    const t = yr[key], now = performance.now();
    let sh = ys[key];
    if (!sh) { sh = ys[key] = ysBuf[key]; sh[0] = t[0]; sh[1] = t[1]; }
    else {
      const k = -Math.expm1(-Math.min(0.1, (now - ysAt[key]) / 1000) / 0.15), snap = (t[1] - t[0]) * 0.002;
      for (let i = 0; i < 2; i++) sh[i] = Math.abs(t[i] - sh[i]) <= snap ? t[i] : sh[i] + (t[i] - sh[i]) * k;
      if (sh[0] !== t[0] || sh[1] !== t[1]) gliding = true;
    }
    ysAt[key] = now;
    return sh;
  }

  function hiddenSet() {
    const st = store.get();
    if (st.imaging) return IMAGING_HIDDEN;
    return hiddenNow(st) || NONE_HIDDEN;
  }

  // Frames arrive ~10×/s in bursts; the right edge advances with the wall clock in between
  // (a little behind the newest sample), so the trace scrolls steadily instead of in steps.
  function headX() {
    if (wheel.on) return wheel.head();   // (the freewheel's head: the model's clock stands still)
    if (lastT === -Infinity) return frame.t;
    if (!frame.running || clock === 'disease') return lastT;
    const rate = frame.speed || 1;
    return lastT - LAG_S * rate + Math.min((performance.now() - wallAt) / 1000, LAG_S) * rate;
  }
  // The scroll loop runs only while the trace is on screen and moving; the next sample (ingest) wakes it.
  let ticking = false, tickRaf = 0;   // (tickRaf: the loop's one frame asked for, let go with the chart)
  // (V-CHART-3: while the strip scrolls its frames are never carried to a later one by the scheduler: a carried frame of a moving picture steps, then jumps.)
  let animating = false;
  const anim = (on) => { if (animating !== on) { animating = on; frameAnimating('pressure-time', on); } };
  // On screen: kept by an observer, not read from cv.offsetParent, which forced a style and layout pass on every model frame
  // (the dock's chart wakes with each sample, shown or not).
  let seen = false;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; wake(); }) : null;
  io?.observe(cv);
  const live = () => frame?.running && (range !== 'days' || stripDays) && (io ? seen : true) && !document.hidden && !pageRest();
  // (Battery saver or Settings › Figure performance › Motion at 60: the scroll is drawn at that pace, as the figure's steady motion is;
  // otherwise on every frame, as before. tickAt: when the loop last drew.)
  // (At rest (frame.js restGapFor: 4 s with no input and nothing moving) it scrolls 30 steps a second, 20 in a talk left 30 s, and waits
  // on a timer between them, not on every screen frame (restPark). The scroll is drawn from the clock (headX), so it is as fast as before.)
  let tickAt = -Infinity, parkT = 0;
  const unpark = () => { parkT = 0; if (ticking && !tickRaf) tickRaf = nextFrame(tickLoop); };
  function tickLoop(now = performance.now()) {
    tickRaf = 0;
    if (!live()) { ticking = false; anim(false); return; }
    anim(true);
    const pace = paceMs(), rest = restGapFor(now), gap = Math.max(pace, rest), due = !gap || now - tickAt >= gap;
    if (!(rest > pace && !parkT && (parkT = restPark(due ? rest : gap - (now - tickAt), unpark)))) tickRaf = nextFrame(tickLoop);
    if (!due) return;
    tickAt = now;
    draw();
    noteDraw('pressure-time');
  }
  function wake() { if (!ticking && live()) { ticking = true; tickRaf = nextFrame(tickLoop); } }
  const offRest = onPageWake(wake);   // (idle rest ends: the strip scrolls again)

  function draw() {
    gliding = false;
    advanceFw(performance.now());
    drawNow();
    if (gliding && !glideReq && !(ticking && live())) { glideReq = true; nextFrame(glideAgain); }
  }
  const glideAgain = () => { glideReq = false; draw(); };
  // ── The slide's card (beat-card.js) ───────────────
  // The paper's squares are 1 mmHg high, and as wide, so the EKG strip runs on into the pressures below it on one sheet. The wedged and free
  // hepatic pressures with the HVPG shaded between them in its status colour; the portal pressure dashed over the wedged (they read nearly
  // the same); a caliper at "now" spans the gap. Where the patient stood before the slide's event (the slide's delta), the two dotted lines
  // and the old gap faint grey behind, named once. The readings in a column beside, or on a narrow card one line on top and the values at
  // the lines' ends. Every number is the slide's own (pinned), as the tiles show it.
  const MMHG = 'mmHg';
  const HR_CUT = VITALS.find((v) => v.id === 'hr')?.cut ?? 110;
  // What a frame of the card works on, made here once and written in place each frame (nothing in the drawing below makes an array, an object or
  // a closure): F, the card's frame (what X and the Y of each part read), the three key rows, the scale's numbers, the spans the "before" plate keeps clear of.
  const F = { L: 0, x0: 0, x1: 1, plotW: 0, bot: 0, sq: 1, et: 0, eb: 0 };
  const X = (x) => F.L + ((x - F.x0) / Math.max(1e-9, F.x1 - F.x0)) * F.plotW;   // (a time to the card's x)
  const YB = (v) => F.bot - v * F.sq;   // (mmHg to y, a square to the mmHg)
  const YEb = (v) => F.eb - 2 - ((v + 0.25) / 1.25) * (F.eb - F.et - 4);   // (lead II with its waves in seconds: the card's strip)
  const YEg = (v) => F.eb - 3 - ((v + 0.3) / 1.3) * (F.eb - F.et - 6);   // (the S wave's dip to the R peak fill the lane: the chart's strip)
  const beatFont = (wt, px) => FONT0(wt, px * 13 / 12);   // (a slide's card: the larger lettering)
  const keyRows = [
    { c: '', name: 'Portal vein', v: NaN, dashed: true, txt: '', label: 'PV', y: 0 },
    { c: '', name: 'Wedged', v: NaN, dashed: false, txt: '', label: 'WHVP', y: 0 },
    { c: '', name: 'Free', v: NaN, dashed: false, txt: '', label: 'FHVP', y: 0 },
  ];
  const keyRowList = [], endsBeat = [], topVals = [0, 0, 0, 0], ylTxt = [], ylY = [];
  const spanPool = [[0, 0], [0, 0], [0, 0]], spansBuf = [], wasBox = [0, 0, 0, 0];
  const hvpgLabelJoin = mkJoin();
  const SB = { w: 0, hh: 0, panel: '', faint: '', muted: '', text: '', hair: '', danger: '', ok: '', cap: 'butt', join: 'miter', L: 0, hrT: '', hvT: '', word: '', sevC: '', hrC: '', ylN: 0, ylTxt, ylY, col: null };
  const SBcol = { x: 0, plan: null, hrSince: '', hvSince: '', rows: keyRowList };
  const sevColor = (hv) => cssVar(SEV_VAR[sevOf(hv)]);
  // Canvas text has no tabular figures, and these readings follow the trace's ends as they settle after an event: each digit is set in
  // a 0's width, as the tiles' HTML numbers are (tabular-nums), so a digit that changes never moves the others, the unit or the line.
  const zw = (g, t) => g.measureText(zeroed(t)).width;
  function tab(g, t, x, y) {
    const w0 = g.measureText('0').width, al = g.textAlign; let cx = x; g.textAlign = 'center';
    for (const ch of t) { const cw = ch >= '0' && ch <= '9' ? w0 : g.measureText(ch).width; g.fillText(ch, cx + cw / 2, y); cx += cw; }
    g.textAlign = al; return cx - x;
  }
  function stillRule(g, S, x, cw, y) { g.strokeStyle = S.hair; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Math.round(y) + 0.5); g.lineTo(x + cw, Math.round(y) + 0.5); g.stroke(); }
  function stillBig(g, S, x, y, v, unit, px, colour) {
    g.font = beatFont(650, px); g.fillStyle = colour; const vw = tab(g, v, x, y);   // (tabular digits: see tab)
    g.font = beatFont(500, 12); g.fillStyle = S.faint; g.fillText(unit, x + vw + 6, y);
  }
  // (a change upward is the bad way for both: red; downward green)
  function stillSince(g, S, x, y, t) { if (!t) return; g.font = beatFont(600, 12); g.fillStyle = t.startsWith('▲') ? S.danger : S.ok; g.fillText(t, x, y); }
  // The slide card's still parts, drawn on `g` from `S` alone: the panel, the scale's numbers, and the readings, in
  // the column beside the plot or, on a narrow card, as the line on top. What moves is drawn over them.
  function drawBeatStill(g, S) {
    const { w, hh, panel, faint, muted, text, L, hrT, hvT, hrC, sevC } = S;
    const FONT = beatFont;
    g.globalAlpha = 1; g.setLineDash(DASH_NONE);
    plotFill(g, 0, 0, w, hh, panel);
    g.font = FONT(500, 12); g.fillStyle = faint; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i < S.ylN; i++) g.fillText(S.ylTxt[i], L - 6, S.ylY[i]);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    if (S.col) {
      // the column: heart rate, the HVPG and its status, then the three lines named, the quick check's way (hairlines between, no fills)
      const { x, plan, hrSince, hvSince, rows } = S.col, k = plan.k, cw = w - x - 14;
      g.lineCap = S.cap; g.lineJoin = S.join;   // (the first two hairlines take the ends the context had; the ones among the rows follow the swatch's last, butt)
      let y = 26;
      g.font = FONT(600, 12); g.fillStyle = muted; g.fillText('HEART RATE', x, y);
      y += 32 * k; stillBig(g, S, x, y, hrT, '/min', Math.max(20, 28 * k), hrC);
      if (plan.deltas) { y += 20 * k; stillSince(g, S, x, y, hrSince); }
      y += 14 * k; stillRule(g, S, x, cw, y);
      y += 24 * k; g.font = FONT(600, 12); g.fillStyle = muted; g.fillText('HVPG', x, y);
      y += 36 * k; stillBig(g, S, x, y, hvT, 'mmHg', Math.max(22, 32 * k), text);
      y += 21 * k; g.font = FONT(600, 12); g.fillStyle = sevC; g.fillText(S.word, x, y);
      if (plan.deltas) { y += 18 * k; stillSince(g, S, x, y, hvSince); }
      if (plan.rows) {
        y += 14 * k; stillRule(g, S, x, cw, y);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          y += 26 * k;
          g.strokeStyle = r.c; g.lineWidth = 3; g.lineCap = 'round'; g.setLineDash(r.dashed ? DASH_SWATCH : DASH_NONE);
          g.beginPath(); g.moveTo(x + 1, y - 4); g.lineTo(x + 12, y - 4); g.stroke(); g.setLineDash(DASH_NONE); g.lineCap = 'butt';
          g.font = FONT(500, 12); g.fillStyle = muted; g.fillText(r.name, x + 18, y);
          g.font = FONT(650, 12.5); g.fillStyle = text; g.textAlign = 'right'; g.fillText(r.txt, x + cw, y); g.textAlign = 'left';
          y += 10 * k; stillRule(g, S, x, cw, y);
        }
      }
    } else {
      // a narrow card: the HVPG and its status on one line on top, the heart rate at its right
      const y = 24;
      g.font = FONT(600, 12); g.fillStyle = muted; g.fillText('HVPG', 8, y);
      let x = 8 + g.measureText('HVPG').width + 6;
      g.font = FONT(650, 17); g.fillStyle = text; x += tab(g, hvT, x, y) + 4;
      g.font = FONT(500, 12); g.fillStyle = faint; g.fillText(MMHG, x, y); x += g.measureText(MMHG).width + 8;
      g.font = FONT(600, 12); g.fillStyle = sevC; g.fillText(S.word, x, y);
      g.font = FONT(650, 13); g.fillStyle = hrC; const hw = zw(g, hrT); tab(g, hrT, w - 8 - hw, y);
      g.textAlign = 'right'; g.font = FONT(600, 12); g.fillStyle = muted; g.fillText('HR', w - 12 - hw, y); g.textAlign = 'left';
    }
  }
  const beatStillFn = (c) => drawBeatStill(c, SB);
  // The beat card's still parts are kept on the GPU while nothing they print moves: KB is a copy of what SB (and its column) held when the layer
  // was last drawn, compared field by field (nothing is built to compare), and its ver moves when any of it differs. The printed words are in it.
  const KB = { ver: 0, w: 0, hh: 0, panel: '', faint: '', muted: '', text: '', hair: '', danger: '', ok: '', cap: '', join: '', L: 0, hrT: '', hvT: '', word: '', sevC: '', hrC: '', ylN: 0, col: false, x: 0, k: 0, deltas: false, rows: false, hrSince: '', hvSince: '', rn: 0 };
  const kbYT = [], kbYY = [], kbR = [{ c: '', name: '', dashed: false, txt: '' }, { c: '', name: '', dashed: false, txt: '' }, { c: '', name: '', dashed: false, txt: '' }];
  function beatVer() {
    const S = SB, C = S.col, rl = keyRowList;
    let ch = KB.w !== S.w || KB.hh !== S.hh || KB.panel !== S.panel || KB.faint !== S.faint || KB.muted !== S.muted || KB.text !== S.text || KB.hair !== S.hair || KB.danger !== S.danger || KB.ok !== S.ok
      || KB.cap !== S.cap || KB.join !== S.join || KB.L !== S.L || KB.hrT !== S.hrT || KB.hvT !== S.hvT || KB.word !== S.word || KB.sevC !== S.sevC || KB.hrC !== S.hrC || KB.ylN !== S.ylN || KB.col !== !!C;
    for (let i = 0; !ch && i < S.ylN; i++) if (kbYT[i] !== S.ylTxt[i] || kbYY[i] !== S.ylY[i]) ch = true;
    if (!ch && C) {
      ch = KB.x !== C.x || KB.k !== C.plan.k || KB.deltas !== C.plan.deltas || KB.rows !== C.plan.rows || KB.hrSince !== C.hrSince || KB.hvSince !== C.hvSince || KB.rn !== rl.length;
      for (let i = 0; !ch && i < rl.length; i++) { const r = rl[i], q = kbR[i]; if (q.c !== r.c || q.name !== r.name || q.dashed !== r.dashed || q.txt !== r.txt) ch = true; }
    }
    if (!ch) return KB.ver;
    KB.w = S.w; KB.hh = S.hh; KB.panel = S.panel; KB.faint = S.faint; KB.muted = S.muted; KB.text = S.text; KB.hair = S.hair; KB.danger = S.danger; KB.ok = S.ok;
    KB.cap = S.cap; KB.join = S.join; KB.L = S.L; KB.hrT = S.hrT; KB.hvT = S.hvT; KB.word = S.word; KB.sevC = S.sevC; KB.hrC = S.hrC; KB.ylN = S.ylN; KB.col = !!C;
    for (let i = 0; i < S.ylN; i++) { kbYT[i] = S.ylTxt[i]; kbYY[i] = S.ylY[i]; }
    if (C) {
      KB.x = C.x; KB.k = C.plan.k; KB.deltas = C.plan.deltas; KB.rows = C.plan.rows; KB.hrSince = C.hrSince; KB.hvSince = C.hvSince; KB.rn = rl.length;
      for (let i = 0; i < rl.length; i++) { const r = rl[i], q = kbR[i]; q.c = r.c; q.name = r.name; q.dashed = r.dashed; q.txt = r.txt; }
    }
    return ++KB.ver;
  }
  // The "before" plate's room: a line's extent over the label's width, kept as a span if it has any sample there.
  function addSpan(s, lx, rx) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < s.x.length; i++) { const x = X(s.x[i]); if (x < lx - 2 || x > rx + 2) continue; const y = YB(s.mid[i]); if (y < a) a = y; if (y > b) b = y; }
    if (a <= b) { const sp = spanPool[spansBuf.length]; sp[0] = a - 2; sp[1] = b + 2; spansBuf.push(sp); }
  }
  function dotted(ctx, v, c, L, R) { ctx.strokeStyle = c; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(L + 1, YB(v)); ctx.lineTo(R, YB(v)); ctx.stroke(); }
  function drawBeatCard(ctx, w, hh, x0, x1, xNow, FONT, noPv, text, muted, faint, panel) {
    const lay = beatLayout(w, hh, cfg.ekg), { L, R, top, bot } = lay, plotW = R - L;
    F.L = L; F.x0 = x0; F.x1 = x1; F.plotW = plotW; F.bot = bot;
    affine(X, 0);   // (X as the two numbers the series are drawn with)
    const wNow = endOf('whvp'), fNow = endOf('RHV'), pvNow = endOf('CONF'), hv = steadyHvpg();
    const hr = Number.isFinite(pinned?.hr) ? pinned.hr : frame.metrics.hr;
    const was = before?.fp, wWas = was?.whvp, fWas = was?.fhvp;
    const showWas = Number.isFinite(wWas) && Number.isFinite(fWas) && (Math.abs(wWas - wNow) >= 0.3 || Math.abs(fWas - fNow) >= 0.3);
    const sw = series('whvp', x0, x1, slots.whvp), sf = series('RHV', x0, x1, slots.RHV), sp = series('CONF', x0, x1, slots.CONF);
    let mx = -Infinity;
    for (const k of BEAT_TOP_KEYS) { if (k === 'CONF' && noPv) continue; const mid = slots[k].mid; for (let i = 0; i < mid.length; i++) if (mid[i] > mx) mx = mid[i]; }
    topVals[0] = mx; topVals[1] = wNow; topVals[2] = noPv ? NaN : pvNow; topVals[3] = showWas ? wWas : NaN;
    const hi = beatTop(topVals);
    const sq = (bot - top) / hi;
    F.sq = sq;
    const wc = cssVar('--tr-wedge'), fc = cssVar('--tr-hv'), pc = cssVar('--tr-pv');

    // The still parts of the card (laptop-heat recs H3): the panel, the scale's numbers, and the readings (the column beside the plot, or
    // the line on top of a narrow card), drawn first. They stand clear of everything that moves (the plot's box, the strip, the caliper at R + 12 and the time axis all end
    // at R; the column starts at R + 30; the narrow card's line is above its strip), so drawn first they set the pixels they set before.
    const sevC = sevColor(hv), hrC = hr >= HR_CUT ? cssVar('--danger') : text;
    const hvWas = showWas ? tenthGap(wWas, fWas, was.hvpg) : was?.hvpg;
    keyRows[0].c = pc; keyRows[0].v = pvNow; keyRows[1].c = wc; keyRows[1].v = wNow; keyRows[2].c = fc; keyRows[2].v = fNow;
    keyRowList.length = 0;
    for (let i = noPv ? 1 : 0; i < 3; i++) keyRowList.push(keyRows[i]);
    const hrT = Number.isFinite(hr) ? fmt(hr, 0) : NOT_SHOWN, hvT = Number.isFinite(hv) ? fmt(hv, 1) : NOT_SHOWN;
    // (the top number gives way to the unit written over it, which it touched)
    const gate = top - 10 > (lay.ekg ? lay.ekg.bot : 0);
    const nyl = Math.floor(hi / 5) + 1;
    let ylN = 0;
    for (let i = 0; i < nyl; i++) { const y = YB(i * 5); if (gate && y < top + 9) continue; ylTxt[ylN] = STR5[i]; ylY[ylN] = y; ylN++; }
    SB.w = w; SB.hh = hh; SB.panel = panel; SB.faint = faint; SB.muted = muted; SB.text = text; SB.hair = cssAlpha('--text', 0.12);
    SB.danger = cssVar('--danger'); SB.ok = cssVar('--ok');
    SB.cap = typeof ctx.lineCap === 'string' ? ctx.lineCap : 'butt'; SB.join = typeof ctx.lineJoin === 'string' ? ctx.lineJoin : 'miter';
    SB.L = L; SB.hrT = hrT; SB.hvT = hvT; SB.word = wordOf(hv); SB.sevC = sevC; SB.hrC = hrC; SB.ylN = ylN;
    if (lay.wide) {
      const hrSince = sinceText(hr, was?.hr, 0), hvSince = sinceText(hv, hvWas, 1);
      for (const r of keyRowList) r.txt = Number.isFinite(r.v) ? fmt(r.v, 1) : NOT_SHOWN;
      SBcol.x = lay.colX; SBcol.plan = colPlan(hh, !!(hrSince || hvSince)); SBcol.hrSince = hrSince; SBcol.hvSince = hvSince;
      SB.col = SBcol;
    } else SB.col = null;
    still.lay(ctx, 'pt-beat', beatVer(), beatStillFn);

    // the paper, from the plot's bottom left corner up through the strip: a heavy line every 5 squares
    const paperTop = lay.ekg ? lay.ekg.top : top;
    ctx.save(); ctx.beginPath(); ctx.rect(L, paperTop - 2, plotW, bot - paperTop + 2); ctx.clip();
    // (Its upright lines are laid on time, not on the card: the paper scrolls left with the traces, as a strip runs out of a monitor, Mohammad 29 Oct.)
    const pxS = plotW / Math.max(1e-9, x1 - x0), X0 = L - x0 * pxS, i0 = Math.floor((L - X0) / sq);
    ctx.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) {
      const heavy = pass === 1;
      if (!heavy && !paperFine(sq)) continue;
      ctx.strokeStyle = cssAlpha('--danger', heavy ? 0.26 : 0.11); ctx.beginPath();
      for (let i = i0; X0 + i * sq <= R + 0.5; i++) { if ((((i % 5) + 5) % 5 === 0) !== heavy) continue; const x = Math.round(X0 + i * sq) + 0.5; if (x < L) continue; ctx.moveTo(x, paperTop - 2); ctx.lineTo(x, bot); }
      for (let j = 0; bot - j * sq >= paperTop - 2; j++) { if ((j % 5 === 0) !== heavy) continue; const y = Math.round(bot - j * sq) + 0.5; ctx.moveTo(L, y); ctx.lineTo(R, y); }
      ctx.stroke();
    }
    ctx.restore();
    // (The scale's numbers are in the still picture, left of the plot's box; its unit stays here, over the paper.)
    ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (top - 10 > (lay.ekg ? lay.ekg.bot : 0)) ctx.fillText(MMHG, 8, top - 10);

    // the EKG strip, in the text colour, over the model's own beats
    if (lay.ekg && fine.t.length > 1) {
      const { top: et, bot: eb } = lay.ekg;
      F.et = et; F.eb = eb;
      // (lead II with its waves in seconds, not stretched to the beat: a narrow QRS, a rounded P and T; it ends at "now", with the pressures)
      const e = leadIISeries(beatClock.times, Math.max(x0, fine.t[0]), Math.min(x1, fine.t[fine.t.length - 1]), 60 / (hr > 20 ? hr : 70));
      if (e.x.length > 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(L, et - 2, plotW, eb - et + 4); ctx.clip();
        ctx.strokeStyle = text; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        affine(YEb, 2); tracePts(ctx, e.x, e.v, e.x.length, 1, true);
        ctx.stroke(); ctx.restore();
      }
    }

    ctx.save(); ctx.beginPath(); ctx.rect(L, top - 6, plotW, bot - top + 8); ctx.clip();
    // before: the old gap faint grey, its edges dotted in the lines' own colours
    if (showWas) {
      ctx.fillStyle = cssAlpha('--text-3', 0.08); ctx.fillRect(L, YB(wWas), plotW, YB(fWas) - YB(wWas));
      ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.setLineDash(DASH_BEFORE);
      dotted(ctx, wWas, wc, L, R); dotted(ctx, fWas, fc, L, R);
      ctx.setLineDash(DASH_NONE); ctx.globalAlpha = 1;
    }
    // the HVPG, shaded between wedged and free in the colour of its status
    if (sw.x.length > 1 && sw.x.length === sf.x.length) {
      ctx.globalAlpha = 0.12; ctx.fillStyle = sevColor(hv); ctx.beginPath();
      affine(YB, 2); tracePts(ctx, sw.x, sw.mid, sw.x.length, 1, true); tracePts(ctx, sf.x, sf.mid, sf.x.length, -1, false);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    affine(YB, 2);
    if (!noPv) { ctx.setLineDash(DASH_PORTAL); line(ctx, sp, pc, 2, plotW); ctx.setLineDash(DASH_NONE); }
    line(ctx, sw, wc, 2, plotW);
    line(ctx, sf, fc, 2, plotW);
    ctx.restore();

    // the old gap named once, on a plate, where no line passes under the words
    let hasWasBox = false;   // (the "before the bleed" plate, so the HVPG's own keeps clear of it: wasBox)
    if (showWas && before.label) {
      ctx.font = FONT(500, 12);
      const tw = ctx.measureText(before.label).width, lx = L + 6, rx = lx + tw + 12;
      spansBuf.length = 0;
      addSpan(sw, lx, rx); addSpan(sf, lx, rx); if (!noPv) addSpan(sp, lx, rx);
      const ly = beforeLabelY(YB(wWas), YB(fWas), spansBuf, top, bot);
      if (ly != null) {
        hasWasBox = true; wasBox[0] = lx; wasBox[1] = ly; wasBox[2] = lx + tw + 12; wasBox[3] = ly + 18;
        ctx.fillStyle = panel; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly, tw + 12, 18, 5) : ctx.rect(lx, ly, tw + 12, 18); ctx.fill();
        ctx.fillStyle = faint; ctx.textBaseline = 'middle'; ctx.fillText(before.label, lx + 6, ly + 9.5); ctx.textBaseline = 'alphabetic';
      }
    }

    // the caliper at "now", from the wedged to the free pressure
    if (Number.isFinite(wNow) && Number.isFinite(fNow)) {
      const cx = Math.round(R + 12) + 0.5, ya = YB(wNow), yb = YB(fNow);
      ctx.strokeStyle = text; ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(cx - 5, ya); ctx.lineTo(cx + 5, ya); ctx.moveTo(cx, ya); ctx.lineTo(cx, yb); ctx.moveTo(cx - 5, yb); ctx.lineTo(cx + 5, yb); ctx.stroke();
    }
    // the HVPG named in its gap, beside the caliper's end, so the chart reads without the column (Mohammad 29 Oct); left out where the gap is too low
    if (Number.isFinite(hv) && Number.isFinite(wNow) && Number.isFinite(fNow)) {
      const label = joined(hvpgLabelJoin, 'HVPG', ' ', fmt(hv, 1)), ym = (YB(wNow) + YB(fNow)) / 2;
      ctx.font = FONT(700, 13); const lw = ctx.measureText(label).width + 12;
      const lx = R - 8 - lw, clear = !hasWasBox || wasBox[2] + 6 < lx || wasBox[3] + 4 < ym - 10 || wasBox[1] - 4 > ym + 10;
      if (YB(fNow) - YB(wNow) >= 26 && R - L >= lw + 40 && clear) {
        ctx.fillStyle = panel; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ym - 10, lw, 20, 6) : ctx.rect(lx, ym - 10, lw, 20); ctx.fill();
        ctx.fillStyle = sevColor(hv); ctx.textBaseline = 'middle'; ctx.fillText(label, lx + 6, ym + 0.5); ctx.textBaseline = 'alphabetic';
      }
    }

    // time: every 2 s back from now
    ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'center';
    for (let s = 2; xNow - s > x0 + 1e-9; s += 2) { const xx = X(xNow - s); if (xx < L + 12) break; ctx.fillText(AX_BEATS[s], xx, hh - 8); }
    const nowX = X(xNow);
    ctx.textAlign = nowX > R - 14 ? 'right' : 'center'; ctx.fillStyle = muted; ctx.fillText('now', Math.min(nowX, R), hh - 8);
    ctx.textAlign = 'left';

    if (!lay.wide) {
      // a narrow card: each line's value at its end (the line of readings on top, the HVPG and the heart rate, is in the still picture)
      endsBeat.length = 0;
      for (const r of keyRowList) { r.y = YB(r.v); if (Number.isFinite(r.v)) endsBeat.push(r); }
      endsBeat.sort(byY);
      const es = endsBeat;
      for (let i = 1; i < es.length; i++) es[i].y = Math.max(es[i].y, es[i - 1].y + 16);
      const over = es.length ? es[es.length - 1].y - bot : 0;
      if (over > 0) for (let i = 0; i < es.length; i++) es[i].y -= over;
      ctx.textBaseline = 'middle';
      ctx.font = FONT(650, 12.5);
      let colW = 0;   // (one right-aligned column, as the lanes' readings)
      for (let i = 0; i < es.length; i++) colW = Math.max(colW, ctx.measureText(zeroed(fmt(es[i].v, 1))).width);
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        ctx.fillStyle = e.c; ctx.fillRect(R + 22, e.y - 1.5, 9, 3);
        const vt = fmt(e.v, 1); ctx.font = FONT(650, 12.5); ctx.fillStyle = text; ctx.textAlign = 'right'; ctx.fillText(vt, R + 35 + colW, e.y); ctx.textAlign = 'left';
        ctx.font = FONT(600, 12); ctx.fillStyle = e.c; ctx.fillText(e.label, R + 39 + colW, e.y);
      }
      ctx.textBaseline = 'alphabetic';
    }
    // (The column's swatches used to leave the context's line ends butt, which the next frame's first drawing finds: the same ends are left now.)
    if (SB.col?.plan.rows) ctx.lineCap = 'butt';
  }

  // What a frame of the chart works on, made here once and written in place each frame: the lanes (each with its own Y, which reads the lane's
  // own box and range), the traces on show, the series of each (slots), the values written at the lines' ends, the crosshair's rows.
  const mkLane = (key) => { const l = { key, top: 0, bot: 0, lo: 0, hi: 1, tick: 1, keys: null, Y: null }; l.Y = (v) => l.bot - ((v - l.lo) / Math.max(1e-6, l.hi - l.lo)) * (l.bot - l.top); return l; };
  const ekgLaneO = mkLane('ekg'), presLaneO = mkLane('pressure'), hvpgLaneO = mkLane('hvpg');
  const lanes = [], allLanes = [], tracesBuf = [], presKeys = [], data = {};
  const fixedO = { pressure: [0, 0], hvpg: [0, 0] };
  const wantN = { pressure: false, hvpg: false, gap: 0, egap: 0, two: 0 }, wantE = { ekg: true, pressure: false, hvpg: false, gap: 0, egap: 0, two: 0 };
  const endPool = [], esBuf = [], crossPool = [], daySlots = [], dayEndJoin = mkJoin(), whenDay = mkJoin(), whenAgo = mkJoin();
  for (let i = 0; i < 12; i++) endPool.push({ y: 0, v: 0, dec: undefined, label: '', c: '', lane: null });
  for (let i = 0; i < 10; i++) crossPool.push({ label: '', v: 0, c: '', y: 0, j: mkJoin() });
  for (let i = 0; i < 16; i++) daySlots.push(mkJoin());
  let endN = 0, crossN = 0;
  const SC = { w: 0, hh: 0, panel: '', faint: '', gridOn: '', danger: '', caution: '', slide: false, narrow: false, L: 0, plotW: 0, cap: 'butt', join: 'miter', lanes };
  const prevLab = { x1: 0, y: 0 }, labsTxt = [], labsY = [];

  // The chart's still parts, drawn on `c` from `S` alone: the panel, each lane's grid and, in the HVPG lane, its
  // threshold lines and their names. Drawn before anything that moves. Each lane's are clear of what moves in the lane above (the lanes
  // stand 16 px or more apart, and what moves is clipped to its own lane's box, 2 px out), so drawing the lanes' still parts together,
  // first, sets every pixel as drawing them lane by lane among the moving parts did.
  function drawChartStill(c, S) {
    const { w, hh, panel, faint, gridOn, slide, narrow, L, plotW } = S;
    const FONT = slide ? beatFont : FONT0;
    c.globalAlpha = 1; c.setLineDash(DASH_NONE); c.lineCap = S.cap; c.lineJoin = S.join;
    plotFill(c, 0, 0, w, hh, panel);
    for (let li = 0; li < S.lanes.length; li++) {
      const lane = S.lanes[li], key = lane.key, top = lane.top, bot = lane.bot, lo = lane.lo, hi = lane.hi, tick = lane.tick, Y = lane.Y;
      // grid
      c.lineWidth = 1; c.font = FONT(500, 12); c.textAlign = 'right'; c.textBaseline = 'middle';
      for (let v = Math.ceil(lo / tick) * tick; v <= hi + 1e-9; v += tick) {
        const yy = Math.round(Y(v)) + 0.5;
        c.strokeStyle = gridOn; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(L, yy); c.lineTo(L + plotW, yy); c.stroke(); c.globalAlpha = 1;
        c.fillStyle = faint; c.fillText(fmt(v, tick < 1 ? 1 : 0), L - 6, yy);
      }
      c.textBaseline = 'alphabetic';
      if (key !== 'hvpg') continue;
      c.save(); c.beginPath(); c.rect(L, top - 2, plotW, bot - top + 4); c.clip();
      // clinical thresholds
      const roomy = bot - top > 90;
      // (Every dashed line first, then the labels on their plates, so no later line crosses an earlier label.)
      let nl = 0;
      for (let q = 0; q < LIMITS.length; q++) {
        const v = LIMITS[q][0], label = LIMITS[q][1];
        if (v > hi || (v === HVPG_CUTS.amber && !roomy && !slide)) continue;   // (a slide keeps all three faint lines, 5, 10 and 12, as the talk trace's lane does)
        const yy = Math.round(Y(v)) + 0.5;
        c.strokeStyle = (v >= HVPG_CUTS.red ? S.danger : S.caution); c.globalAlpha = v >= HVPG_CUTS.red ? 0.5 : 0.35;
        c.setLineDash(DASH_LIMIT); c.beginPath(); c.moveTo(L, yy); c.lineTo(L + plotW, yy); c.stroke(); c.setLineDash(DASH_NONE);
        c.globalAlpha = 1;
        if (label && !narrow && (slide ? roomy || v === HVPG_CUTS.bleed : roomy || v === HVPG_CUTS.red)) { labsTxt[nl] = label; labsY[nl] = yy; nl++; }   // (a slide's short lane names the cut-offs once, at 12)
      }
      let hasPrev = false;   // (the label drawn last: one that would sit on it moves along its own line, past its right end: prevLab)
      for (let q = 0; q < nl; q++) {
        const label = labsTxt[q], yy = labsY[q];
        c.font = FONT(600, 12); const tw = c.measureText(label).width;
        const lx = labelX(hasPrev ? prevLab : null, yy, L + 6);
        c.fillStyle = panel; c.fillRect(lx, yy - 6, tw + 8, 12);
        c.fillStyle = S.danger; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(label, lx + 4, yy); c.textBaseline = 'alphabetic';
        prevLab.x1 = lx + tw + 8; prevLab.y = yy; hasPrev = true;
      }
      c.restore();
    }
  }
  const chartStillFn = (c) => drawChartStill(c, SC);
  // The chart's still parts are kept on the GPU while nothing they draw moves (see beatVer): KC copies SC and each lane's box and range, which
  // settle once the lanes' ease does; the cut-offs' and the grid's words are made from those and from constants, so they are in it too.
  const KC = { ver: 0, w: 0, hh: 0, panel: '', faint: '', gridOn: '', danger: '', caution: '', slide: false, narrow: false, L: 0, plotW: 0, cap: '', join: '', n: 0 };
  const kcL = [];
  for (let i = 0; i < 3; i++) kcL.push({ key: '', top: 0, bot: 0, lo: 0, hi: 0, tick: 0 });
  function chartVer() {
    const S = SC, ls = S.lanes;
    let ch = KC.w !== S.w || KC.hh !== S.hh || KC.panel !== S.panel || KC.faint !== S.faint || KC.gridOn !== S.gridOn || KC.danger !== S.danger || KC.caution !== S.caution || KC.slide !== S.slide
      || KC.narrow !== S.narrow || KC.L !== S.L || KC.plotW !== S.plotW || KC.cap !== S.cap || KC.join !== S.join || KC.n !== ls.length;
    for (let i = 0; !ch && i < ls.length; i++) { const l = ls[i], q = kcL[i]; if (q.key !== l.key || q.top !== l.top || q.bot !== l.bot || q.lo !== l.lo || q.hi !== l.hi || q.tick !== l.tick) ch = true; }
    if (!ch) return KC.ver;
    KC.w = S.w; KC.hh = S.hh; KC.panel = S.panel; KC.faint = S.faint; KC.gridOn = S.gridOn; KC.danger = S.danger; KC.caution = S.caution; KC.slide = S.slide;
    KC.narrow = S.narrow; KC.L = S.L; KC.plotW = S.plotW; KC.cap = S.cap; KC.join = S.join; KC.n = ls.length;
    for (let i = 0; i < ls.length; i++) { const l = ls[i], q = kcL[i]; q.key = l.key; q.top = l.top; q.bot = l.bot; q.lo = l.lo; q.hi = l.hi; q.tick = l.tick; }
    return ++KC.ver;
  }

  function drawNow() {
    const p = fitPen(cv, gpu);
    pen = p.ctx;
    try { drawWith(p); } finally { p.ctx.end?.(); pen = null; }
  }
  const panelNow = (ctx, w, hh, panel) => plotFill(ctx, 0, 0, w, hh, panel);   // (the panel is the first thing in the still picture; a card that draws no picture lays it down itself)
  // The first reading of a series in the window: after a restart, or a stall that dropped samples, the window starts there.
  function firstIn(q) { for (let i = 0; i < q.x.length; i++) if (Number.isFinite(q.mid[i])) return q.x[i]; return Infinity; }
  // (On a slide both lanes start at zero and end on a round number above every reading, with a tick at the top.)
  function topOf(key, x1) {
    let mx = -Infinity;
    const nk = key === 'pressure' ? tracesBuf.length : 1;
    for (let j = 0; j < nk; j++) {
      const q = series(key === 'pressure' ? tracesBuf[j].id : 'hvpg', -Infinity, x1, tmpSlot);
      for (let i = 0; i < q.x.length; i++) mx = Math.max(mx, q.hi ? q.hi[i] : q.mid[i]);
    }
    // (and the numbers written at the ends: a reading never sits above its lane)
    if (key === 'pressure') { for (let j = 0; j < nk; j++) { const e = endOf(tracesBuf[j].id); if (Number.isFinite(e)) mx = Math.max(mx, e); } }
    else { const e = steadyHvpg(); if (Number.isFinite(e)) mx = Math.max(mx, e); }
    return key === 'hvpg' ? Math.max(15, Math.ceil(((Number.isFinite(mx) ? mx : 0) + 3) / 5) * 5) : Math.max(10, Math.ceil(((Number.isFinite(mx) ? mx : 10) * 1.1) / 5) * 5);
  }
  function recent(s) { // mean over the last second (the last day on the disease clock)
    const n = s.x.length; if (range === 'days') return s.mid[n - 1];
    const from = s.x[n - 1] - 1; let sum = 0, k = 0;
    for (let i = n - 1; i >= 0 && s.x[i] >= from; i--) if (!Number.isNaN(s.mid[i])) { sum += s.mid[i]; k++; }
    return k ? sum / k : s.mid[n - 1];
  }
  function at(s, x, span) { // value of a series at x (nearest sample)
    if (!s.x.length) return null;
    let lo = 0, hi = s.x.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.x[m] < x) lo = m; else hi = m; }
    const i = Math.abs(s.x[lo] - x) < Math.abs(s.x[hi] - x) ? lo : hi;
    return Math.abs(s.x[i] - x) > span * 0.03 ? null : s.mid[i];
  }
  function pushEnd(y, v, dec, label, c, lane) { const e = endPool[endN++]; e.y = y; e.v = v; e.dec = dec; e.label = label; e.c = c; e.lane = lane; }
  function drawWith({ ctx, w, h: hh }) {
    ctx.clearRect(0, 0, w, hh);
    if (w < 10 || hh < 10 || !frame) return;
    // (The plot is one rounded panel the chart's full width, his G2 look, plot-look.js, in the app's tile tone: what must hide a line or ring a dot
    // there, a label's plate, a dot's ring, a marker's halo, takes the panel's tone so no patch shows; the readout card keeps the surface tone.)
    const text = cssVar('--text'), muted = cssVar('--text-2'), faint = cssVar('--text-3'), grid = cssVar('--grid'), surface = cssVar('--surface'), panel = cssVar('--surface-2'), gridOn = cssVar('--border-strong');
    // (The panel is the first thing in the still picture, drawn once there; a card that draws no picture lays it down itself: panelNow.)
    const hidden = hiddenSet();
    const showHvpg = !hidden.has('trueHVPG');
    const slide = onSlide();   // (a slide's card: its own window, one scale, steady readings and larger lettering, below)
    // (A slide's pressure lane holds the portal pressure alone: the wedged and free lines go, since the HVPG lane under it is their difference.)
    tracesBuf.length = 0; presKeys.length = 0;
    for (let i = 0; i < TRACES.length; i++) {
      const t = TRACES[i];
      if (chosen.has(t.id) && !hidden.has(t.hide) && (range !== 'days' || t.day) && (!slide || t.id === 'CONF')) { tracesBuf.push(t); presKeys.push(t.id); }
    }
    const traces = tracesBuf;
    const FONT = slide ? beatFont : FONT0;
    const narrow = w < 460, tiny = !slide && w < 300 && (hh - 52) * 0.55 >= traces.length * 27;   // (tiny: a tablet's card with its tiles beside; each end's name goes under its value, where the lane has room to stack them)
    // (The numbers stand inside the panel's edge, 8 px in, and the readings at the right end keep 8 px or more of it: so L = 36, R a few px wider than before, B 2 more for the times' own room.)
    const L = 36, R = tiny ? 62 : narrow ? (slide ? 100 : 94) : 104, B = 24, GAP = slide ? 30 : 16;   // (a slide's lanes stand apart, the lower one named)
    let T = 30;
    const plotW = w - L - R;

    // x range
    let x0, x1, xNow;
    if (range === 'days') {
      if (days.length < 2) {
        panelNow(ctx, w, hh, panel);
        ctx.fillStyle = faint; ctx.font = FONT(500, 13); ctx.textAlign = 'center';
        ctx.fillText('Advance the disease clock (+1 wk, +1 mo, +6 mo)', w / 2, hh / 2 - 8);
        ctx.fillText('to follow pressure over days and months.', w / 2, hh / 2 + 12);
        return;
      }
      x1 = xNow = days[days.length - 1].day;
      const first = days[0].day;
      x0 = Math.max(first, x1 - 730);
      if (x1 - x0 < 14) x0 = x1 - 14;
    } else {
      // (A slide's beat-by-beat card shows the last 5 s, Mohammad 29 Oct: 10 s was too much; the Patients chart keeps its 10 s.)
      const beatCard = slide && range === 'beats' && showHvpg;
      const span = beatCard ? BEAT_CARD_S : RANGE_SPAN[range];
      xNow = headX();
      HEAD[0] = xNow; HEAD[1] = performance.now();
      x1 = xNow; x0 = x1 - span;
      // (On a slide the window starts where its record does: a slide just arrived has no empty left part. Not the beat-by-beat card: like a
      // monitor its readings come in at "now" on the right and run left from the first frame, Mohammad 29 Oct.)
      if (slide && !beatCard) {
        let first = Infinity;   // (its first reading in the window, over the traces and the HVPG: firstIn)
        for (let j = 0; j <= traces.length; j++) first = Math.min(first, firstIn(series(j < traces.length ? traces[j].id : 'hvpg', x0, x1, tmpSlot)));
        // (The scale stays fixed: recording starts at the left edge and fills to the right, then scrolls left.)
        if (Number.isFinite(first) && first > x0) { x0 = first; x1 = first + span; }
      }
    }
    F.L = L; F.x0 = x0; F.x1 = x1; F.plotW = plotW;   // (X, a time to x)
    affine(X, 0);   // (X as the two numbers the series are drawn with)
    // (A slide's card, with the HVPG measured: the wedged and free pressures on EKG paper, beat-card.js. Any other card, as before.)
    if (slide && range === 'beats' && showHvpg) { drawBeatCard(ctx, w, hh, x0, x1, xNow, FONT, hidden.has('pv'), text, muted, faint, panel); return; }

    if (!traces.length && !showHvpg) {
      panelNow(ctx, w, hh, panel);
      ctx.fillStyle = faint; ctx.font = FONT(500, 13); ctx.textAlign = 'center';
      ctx.fillText(store.get().imaging ? 'Pressures are not measured in this case.' : 'Choose a trace below.', w / 2, hh / 2);
      return;
    }

    // Marker labels stack in up to three rows, so each stays readable; the plot starts below them.
    markers(x0, x1);
    const mRows = layoutMarkers(w - 8);
    const T0 = Math.max(T, 30 + mRows * ROW);
    // lanes: the EKG strip (the last beats only) over the pressures over the HVPG lane; where the room is short the strip goes first, then the lane
    // (trace-lanes.js). The strip stands at the very top when no marker labels need the space there, so it never sits under them.
    const EGAP = slide ? 22 : 16;
    const wantLane = showHvpg && (slide ? cfg.lane : showLane || !traces.length);
    const wantEkg = (range === 'beats' || stripDays) && (slide ? cfg.ekg : showEkg);
    // (two lanes: a slide's pressure lane holds the portal vein alone but keeps two thirds, as the dock's keeps 0.64)
    wantN.pressure = wantE.pressure = traces.length > 0; wantN.hvpg = wantE.hvpg = wantLane; wantN.gap = wantE.gap = GAP; wantN.egap = wantE.egap = EGAP; wantN.two = wantE.two = slide ? 0.66 : 0.64;
    let plan = wantEkg ? laneRoom(hh - (mRows ? T0 : 10) - B, wantE) : null;
    if (plan?.ekg) T = mRows ? T0 : 10; else { T = T0; plan = laneRoom(hh - T - B, wantN); }
    lanes.length = 0; allLanes.length = 0;
    let ey = T;
    let ekgLane = null;
    if (plan.ekg) { ekgLane = ekgLaneO; ekgLane.top = ey; ekgLane.bot = (ey += plan.ekg); allLanes.push(ekgLane); }
    if (ekgLane) ey += EGAP;
    if (plan.pressure) { presLaneO.top = ey; presLaneO.bot = ey + plan.pressure; lanes.push(presLaneO); ey += plan.pressure + GAP; }
    if (plan.hvpg) { hvpgLaneO.top = ey; hvpgLaneO.bot = ey + plan.hvpg; lanes.push(hvpgLaneO); }
    for (let i = 0; i < lanes.length; i++) allLanes.push(lanes[i]);
    let fixed = null;
    if (slide) { fixedO.pressure[0] = 0; fixedO.pressure[1] = topOf('pressure', x1); fixedO.hvpg[0] = 0; fixedO.hvpg[1] = topOf('hvpg', x1); fixed = fixedO; }

    for (let j = 0; j < KEYS.length; j++) data[KEYS[j]] = undefined;
    for (let j = 0; j < traces.length; j++) { const k = traces[j].id; data[k] = series(k, x0, x1, slots[k]); }
    data.hvpg = series('hvpg', x0, x1, slots.hvpg);
    const hv = Math.max(0, shownOr('hvpg', frame.metrics.hvpg));
    const sevCol = sevColor(hv);
    endN = 0; crossN = 0;
    const cx = cross != null && cross >= L && cross <= L + plotW ? cross : null;
    const xAtCross = cx != null ? x0 + ((cx - L) / plotW) * (x1 - x0) : null;

    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      const { top, bot } = lane;
      const keys = lane.key === 'pressure' ? presKeys : HVPG_KEYS;
      let mn = Infinity, mx = -Infinity;
      for (let kj = 0; kj < keys.length; kj++) {
        const k = keys[kj];
        // (The whole record up to the right edge, read in place: building it as a series on every frame cost more than drawing.)
        if (range === 'beats' && !smooth) {
          const v = fine[k], n = firstAbove(fine.t, x1);
          for (let i = 0; i < n; i++) { const a = v[i]; if (a < mn) mn = a; if (a > mx) mx = a; }
          continue;
        }
        if (range === 'minutes' && !smooth) {
          for (const b of coarse) {
            const q = b.v[k];
            if (!q || b.t + BIN / 2 > x1) continue;
            if (q[0] < mn) mn = q[0]; if (q[1] > mx) mx = q[1];
          }
          continue;
        }
        const s = range === 'days' ? data[k] : series(k, -Infinity, x1, tmpSlot);
        for (let i = 0; i < s.x.length; i++) {
          const a = s.lo ? s.lo[i] : s.mid[i], b = s.hi ? s.hi[i] : s.mid[i];
          if (a < mn) mn = a; if (b > mx) mx = b;
        }
      }
      if (!Number.isFinite(mn)) { mn = 0; mx = 10; }
      let lo, hi;
      if (lane.key === 'hvpg') { lo = 0; hi = Math.max(16, Math.ceil((mx + 3) / 4) * 4); }
      else {
        const pad = Math.max(1.5, (mx - mn) * 0.1);
        lo = Math.max(lane.key === 'pressure' && mn >= 0 ? 0 : -Infinity, mn - pad); hi = mx + pad;
      }
      const rg = fixed ? fixed[lane.key] : ease(lane.key, lo, hi);
      lo = rg[0]; hi = rg[1];
      let tick = hi;   // (a slide's ticks end on its top line, never closer than 15 px)
      if (fixed) { for (let q = 0; q < TICK_CHOICES.length; q++) { const t = TICK_CHOICES[q]; if (hi % t === 0 && (bot - top) * t / hi >= 15) { tick = t; break; } } }
      else tick = nice(hi - lo, (bot - top) > 120 ? 4 : 2);
      lane.lo = lo; lane.hi = hi; lane.tick = tick; lane.keys = keys;
    }

    // The still parts (laptop-heat recs H3): drawn first, straight onto the chart, between a save and a restore.
    SC.w = w; SC.hh = hh; SC.panel = panel; SC.faint = faint; SC.gridOn = gridOn; SC.danger = cssVar('--danger'); SC.caution = cssVar('--caution');
    SC.slide = slide; SC.narrow = narrow; SC.L = L; SC.plotW = plotW;
    SC.cap = typeof ctx.lineCap === 'string' ? ctx.lineCap : 'butt'; SC.join = typeof ctx.lineJoin === 'string' ? ctx.lineJoin : 'miter';
    still.lay(ctx, 'pt-chart', chartVer(), chartStillFn);
    // (What the grid used to leave on the context, which the parts drawn after it read without setting: the baseline, the weight, the colours.)
    if (lanes.length) { ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.font = FONT(500, 12); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.strokeStyle = gridOn; ctx.fillStyle = faint; }

    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      const { top, bot, Y, keys } = lane;
      affine(Y, 2);
      ctx.save(); ctx.beginPath(); ctx.rect(L, top - 2, plotW, bot - top + 4); ctx.clip();
      if (lane.key === 'hvpg') {
        const s = data.hvpg;
        if (s.x.length > 1) {
          // area under the gradient, in the color of its current status
          const g = ctx.createLinearGradient(0, top, 0, bot);
          g.addColorStop(0, sevCol); g.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.14; ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(X(s.x[0]), Y(0));
          tracePts(ctx, s.x, s.mid, s.x.length, 1, false);
          ctx.lineTo(X(s.x[s.x.length - 1]), Y(0)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          if (s.lo) band(ctx, s, text, 0.1);
          line(ctx, s, text, 1.75, plotW);
          const e = range === 'days' ? recent(s) : slide ? steadyHvpg() : hv; pushEnd(Y(e), e, undefined, 'HVPG', text, lane);   // (the header's own reading)
        }
      } else {
        // the HVPG itself, shaded between wedged and free hepatic pressure
        const sw = data.whvp, sf = data.RHV;
        if (sw && sf && sw.x.length > 1 && sw.x.length === sf.x.length) {
          ctx.globalAlpha = 0.1; ctx.fillStyle = sevCol; ctx.beginPath();
          tracePts(ctx, sw.x, sw.mid, sw.x.length, 1, true); tracePts(ctx, sf.x, sf.mid, sf.x.length, -1, false);
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        }
        for (let tj = 0; tj < traces.length; tj++) {
          const t = traces[tj];
          const s = data[t.id];
          if (s.x.length < 1) continue;
          const c = cssVar(t.c);
          if (s.lo) band(ctx, s, c, 0.16);
          // (The wedged trace is dashed, its hue kept: it is ~35° from the portal's at similar lightness, C4.)
          if (t.id === 'whvp') { ctx.setLineDash(DASH_WEDGE); line(ctx, s, c, 1.75, plotW); ctx.setLineDash(DASH_NONE); }
          else line(ctx, s, c, t.id === 'CONF' ? 2 : 1.75, plotW);
          if (range === 'days' && s.x.length < 60) dots(ctx, s, c, panel);
          const e = range === 'days' ? recent(s) : (slide && Number.isFinite(endOf(t.id)) ? endOf(t.id) : liveEnd(t, frame.metrics)) ?? recent(s); pushEnd(Y(range !== 'days' && slide && Number.isFinite(recent(s)) ? recent(s) : e), e, undefined, t.abbr, c, lane);   // (on a slide, written at the line's end, its steady number; the live readings, so wedged − free is the header's HVPG)
        }
      }
      ctx.restore();
      if (xAtCross != null) for (let kj = 0; kj < keys.length; kj++) {
        const k = keys[kj];
        const v = at(data[k], xAtCross, x1 - x0);
        if (v == null) continue;
        const t = TRACE_OF[k];
        const r = crossPool[crossN++];
        r.label = t ? t.short : 'HVPG'; r.v = v; r.c = t ? cssVar(t.c) : text; r.y = Y(v);
      }
    }

    // The EKG strip: a schematic rhythm laid over the model's own beats (ekg.js), in the app's text colour, one QRS to a beat. Its end reading is the heart rate
    // (a slide's, the tile's own number).
    if (ekgLane && fine.t.length > 1) {
      const { top, bot } = ekgLane, mid = Math.round((top + bot) / 2);
      F.et = top; F.eb = bot;
      const hr = slide && Number.isFinite(pinned?.hr) ? pinned.hr : frame.metrics.hr;
      // (Over the days' trend of a time-lapse the strip has its own window, the last BEAT_CARD_S seconds of the sweep that goes on.)
      const sd = range === 'days', xs1 = sd ? headX() : x1, xs0 = sd ? xs1 - BEAT_CARD_S : x0;
      const e = ekgSeries(beatClock.times, Math.max(xs0, fine.t[0]), xs1, 60 / (hr > 20 ? hr : 70));
      if (e.x.length > 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(L, top - 2, plotW, bot - top + 4); ctx.clip();
        ctx.strokeStyle = text; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        if (sd) { AF[0] = L - (xs0 / BEAT_CARD_S) * plotW; AF[1] = plotW / BEAT_CARD_S; }   // (the strip over the days' trend has its own window)
        affine(YEg, 2); tracePts(ctx, e.x, e.v, e.x.length, 1, true);
        if (sd) affine(X, 0);
        ctx.stroke(); ctx.restore();
      }
      ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('EKG', 8, mid); ctx.textBaseline = 'alphabetic';
      if (Number.isFinite(hr)) pushEnd(mid, hr, 0, 'HR', text, ekgLane);
    }
    ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.fillText('mmHg', 8, (lanes[0] ? lanes[0].top : T) - (ekgLane ? 8 : 12));
    if (slide && lanes.length > 1) ctx.fillText('HVPG, mmHg', 8, lanes[1].top - 10);

    // markers: learner changes and events, where they happened
    const allBot = drawMarkers(allLanes);

    // live values at the right edge, nudged apart where they would collide (per lane)
    for (let li = 0; li < allLanes.length; li++) {
      const lane = allLanes[li];
      esBuf.length = 0;
      for (let j = 0; j < endN; j++) if (endPool[j].lane === lane) esBuf.push(endPool[j]);
      const es = esBuf.sort(byY);
      for (let i = 1; i < es.length; i++) es[i].y = Math.max(es[i].y, es[i - 1].y + (tiny ? 27 : slide ? 18 : 15));
      const over = es.length ? Math.min(es[es.length - 1].y - lane.bot, es[0].y - (lane.top + 4)) : 0;   // (lifted only as far as the top allows: a short lane lets its last label hang below rather than pile the readings on each other)
      if (over > 0) for (let i = 0; i < es.length; i++) es[i].y -= over;
      // The readings stand in one column, right-aligned (canvas text has no tabular figures): a value's width as if every digit were
      // a 0, the widest in the lane, so the decimal points line up down the column and a name never shifts as a digit changes.
      ctx.font = FONT(650, 12.5);
      let colW = 0;
      if (!tiny) for (let i = 0; i < es.length; i++) colW = Math.max(colW, ctx.measureText(zeroed(fmt(es[i].v, es[i].dec ?? 1))).width);
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        const yy = Math.max(lane.top + 4, e.y);
        ctx.fillStyle = e.c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(L + plotW + 4, yy - 1.5, 10, 3, 1.5) : ctx.rect(L + plotW + 4, yy - 1.5, 10, 3); ctx.fill();   // (a short stroke in the trace's colour, not a dot)
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = FONT(650, 12.5); ctx.fillStyle = text;
        const vt = fmt(e.v, e.dec ?? 1);
        if (tiny) ctx.fillText(vt, L + plotW + 17, yy);
        else { ctx.textAlign = 'right'; ctx.fillText(vt, L + plotW + 17 + colW, yy); ctx.textAlign = 'left'; }
        // Each line is named at its end (PV, WHVP, FHVP, HVPG), on every screen.
        ctx.font = FONT(600, 12); ctx.fillStyle = e.c === text ? muted : e.c;
        if (tiny) ctx.fillText(e.label, L + plotW + 17, yy + 12); else ctx.fillText(e.label, L + plotW + 20 + colW, yy);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // time axis
    ctx.fillStyle = faint; ctx.font = FONT(500, 12); ctx.textAlign = 'center';
    const span = x1 - x0;
    if (range === 'days') {
      const step = nice(span, narrow ? 3 : 5);
      let di = 0;
      for (let d = Math.ceil(x0 / step) * step; d <= x1 + 1e-9; d += step) { const xx = X(d); if (xx > L + 20 && xx < L + plotW - 30) { ctx.fillText(joined(daySlots[di < 15 ? di : 15], 'Day', ' ', Math.round(d)), xx, hh - 8); di++; } }
      ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.fillText(joined(dayEndJoin, 'Day', ' ', Math.round(x1)), L + plotW, hh - 8);
    } else {
      const step = range === 'beats' ? (narrow ? 5 : 2) : (narrow ? 60 : 30);
      const names = range === 'beats' ? AX_BEATS : AX_MIN;
      for (let s = step; xNow - s > x0 + 1e-9; s += step) {
        const xx = X(xNow - s);
        if (xx < L + 12) break;
        ctx.fillText(names[s], xx, hh - 8);
      }
      const nowX = X(xNow);
      ctx.textAlign = nowX > L + plotW - 14 ? 'right' : 'center'; ctx.fillStyle = muted; ctx.fillText('now', Math.min(nowX, L + plotW), hh - 8);
    }

    // crosshair and its readout card
    if (cx != null && crossN) {
      ctx.strokeStyle = text; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, (ekgLane || lanes[0]).top); ctx.lineTo(Math.round(cx) + 0.5, allBot); ctx.stroke(); ctx.globalAlpha = 1;
      for (let j = 0; j < crossN; j++) { const r = crossPool[j]; ctx.fillStyle = panel; ctx.beginPath(); ctx.arc(cx, r.y, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = r.c; ctx.beginPath(); ctx.arc(cx, r.y, 3, 0, 7); ctx.fill(); }
      const when = range === 'days' ? joined(whenDay, 'Day', ' ', Math.round(xAtCross)) : Math.abs(xNow - xAtCross) < 0.05 ? 'now' : joined(whenAgo, fmt(xNow - xAtCross, range === 'beats' ? 1 : 0), ' ', 's ago');
      ctx.font = FONT(600, 12);
      const rowH = 18, padX = 10;
      let cw = ctx.measureText(when).width;
      for (let j = 0; j < crossN; j++) { const r = crossPool[j]; ctx.font = FONT(500, 12); cw = Math.max(cw, ctx.measureText(joined(r.j, r.label, '  ', fmt(r.v, 1))).width + 14); }
      cw += padX * 2;
      const ch = 12 + rowH * (crossN + 1);
      let bx = cx + 14; if (bx + cw > L + plotW) bx = cx - 14 - cw;
      const by = clamp(lanes[0].top, 4, hh - ch - 4);
      drawShadow(ctx, bx, by, cw, ch);
      ctx.fillStyle = surface;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, cw, ch, 10) : ctx.rect(bx, by, cw, ch); ctx.fill();
      ctx.strokeStyle = grid; ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = FONT(600, 12); ctx.fillText(when, bx + padX, by + 18);
      for (let i = 0; i < crossN; i++) {
        const r = crossPool[i];
        const yy = by + 18 + rowH * (i + 1);
        ctx.fillStyle = r.c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx + padX - 1, yy - 5.5, 9, 3, 1.5) : ctx.rect(bx + padX - 1, yy - 5.5, 9, 3); ctx.fill();
        ctx.fillStyle = muted; ctx.font = FONT(500, 12); ctx.fillText(r.label, bx + padX + 12, yy);
        ctx.fillStyle = text; ctx.font = FONT(650, 12); ctx.textAlign = 'right'; ctx.fillText(fmt(r.v, 1), bx + cw - padX, yy); ctx.textAlign = 'left';
      }
    }
  }

  // The readout card's shadow: a soft-edged box the GPU draws (trace-gl.js), never a blur on the CPU.
  function drawShadow(ctx, bx, by, cw, ch) {
    // (The GPU draws the soft edge itself, as wide and as low as the old blurred picture's; a chart drawn on its own canvas, with no GPU,
    // shows the card without one.)
    if (ctx.onGPU === true) ctx.shadowBox(bx, by, cw, ch, 10, cssAlpha('--black', 0.14), 16, 4);
  }

  // Markers a few pixels apart (several changes made at once) share one dot and one label ("… +2").
  // Each label takes the highest row where it clears the labels already placed, right of its dot or
  // else left of it. Labels are drawn on a halo, so the dotted lines of other markers pass behind
  // them. With no row free the marker keeps its line and a dot at the top of the plot, unlabelled.
  // The markers in the window (mk…), the groups they make (g…) and the labels' spans (sp…) are lists written in place, one column to a field.
  const ROW = 13, MAX_ROWS = 4;
  const mkX = [], mkLabel = [], mkSev = [];
  const gXX = [], gLabel = [], gSev = [], gN = [], gRow = [], gText = [], gToRight = [];
  const spX0 = [], spX1 = [], spRow = [], groupJoin = [];
  let mkN = 0, gCount = 0;
  for (let i = 0; i < 32; i++) groupJoin.push(mkJoin());
  // (wrapLabel: a long label wraps between words onto the rows below, never cut with an ellipsis.) Cached per label and room.
  const wrapped = new Map();
  const measureW = (t) => pen.measureText(t).width;
  function wrapOf(lab, maxW) {
    let byW = wrapped.get(lab);
    if (byW === undefined) { if (wrapped.size > 200) wrapped.clear(); byW = new Map(); wrapped.set(lab, byW); }   // alloc-rare: first sight of this label (or the cache restarting); the room is mostly one width
    if (!byW.has(maxW)) byW.set(maxW, wrapLabel(lab, maxW, measureW));   // (first sight of this label at this room)
    return byW.get(maxW);
  }
  // Lays the markers of mk… out in groups (g…) and returns how many rows of labels they need.
  function layoutMarkers(right) {
    gCount = 0;
    if (!mkN) return 0;   // (no markers in the window, the common case and every slide's: the font below cost each frame a font lookup for nothing)
    const ctx = pen;
    ctx.font = FONT(600, 12);
    for (let m = 0; m < mkN; m++) {
      const xx = Math.round(X(mkX[m])) + 0.5, last = gCount - 1;
      if (last >= 0 && xx - gXX[last] < 6) { gN[last]++; if (!gSev[last] && mkSev[m]) gSev[last] = mkSev[m]; continue; }
      gXX[gCount] = xx; gLabel[gCount] = mkLabel[m]; gSev[gCount] = mkSev[m]; gN[gCount] = 1; gRow[gCount] = -1; gText[gCount] = null; gToRight[gCount] = false;
      gCount++;
    }
    let spN = 0;   // placed labels: spX0, spX1, spRow
    const maxW = Math.min(170, (right - 40) * 0.6);
    for (let gi = 0; gi < gCount; gi++) {
      const n1 = gN[gi], slot = groupJoin[gi < 32 ? gi : 31];
      const lab = gLabel[gi] ? (n1 > 1 ? joined(slot, gLabel[gi], ' +', n1 - 1) : gLabel[gi]) : n1 > 1 ? joined(slot, n1, ' ', 'changes') : '';
      const fit = lab && wrapOf(lab, maxW);
      if (!fit) continue;
      const tw = fit.w, n = fit.lines.length, gxx = gXX[gi];
      place: for (let r = 0; r + n <= MAX_ROWS; r++) for (let side = 0; side < 2; side++) {
        const toRight = side === 0;
        const x0 = toRight ? gxx - 4 : gxx - 11 - tw, x1 = toRight ? gxx + 7 + tw : gxx + 4;
        if (x1 > right || x0 < 8) continue;
        let busy = false;
        for (let q = 0; q < spN; q++) if (spRow[q] >= r && spRow[q] < r + n && x0 < spX1[q] + 8 && x1 > spX0[q] - 8) { busy = true; break; }
        if (busy) continue;
        gRow[gi] = r; gText[gi] = fit.lines; gToRight[gi] = toRight;
        for (let i = 0; i < n; i++) { spX0[spN] = x0; spX1[spN] = x1; spRow[spN] = r + i; spN++; }
        break place;
      }
    }
    let rows = gCount ? 1 : 0;
    for (let gi = 0; gi < gCount; gi++) rows = Math.max(rows, gRow[gi] + (gText[gi] ? gText[gi].length : 1));
    return rows;
  }
  function drawMarkers(lanes) {
    const ctx = pen;
    const top = lanes[0].top, allBot = lanes[lanes.length - 1].bot;
    const muted = cssVar('--text-2'), halo = cssVar('--surface-2');
    for (let gi = 0; gi < gCount; gi++) {
      ctx.strokeStyle = cssVar(gSev[gi] ? sevVar(gSev[gi]) : '--accent'); ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash(DASH_MARK);
      ctx.beginPath(); ctx.moveTo(gXX[gi], (gRow[gi] >= 0 ? 14 + gRow[gi] * ROW : top - 8) + 4); ctx.lineTo(gXX[gi], allBot); ctx.stroke();
    }
    ctx.setLineDash(DASH_NONE); ctx.globalAlpha = 1;
    ctx.font = FONT(600, 12); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let gi = 0; gi < gCount; gi++) {
      const y = gRow[gi] >= 0 ? 14 + gRow[gi] * ROW : top - 8;
      ctx.fillStyle = cssVar(gSev[gi] ? sevVar(gSev[gi]) : '--accent'); ctx.beginPath(); ctx.arc(gXX[gi], y, 3, 0, 7); ctx.fill();
      const lines = gText[gi];
      if (!lines) continue;
      ctx.textAlign = gToRight[gi] ? 'left' : 'right';
      const tx = gToRight[gi] ? gXX[gi] + 7 : gXX[gi] - 7;
      for (let i = 0; i < lines.length; i++) {
        ctx.strokeStyle = halo; ctx.lineWidth = 4; ctx.strokeText(lines[i], tx, y + i * ROW + 0.5);
        ctx.fillStyle = muted; ctx.fillText(lines[i], tx, y + i * ROW + 0.5);
      }
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineWidth = 1;
    return allBot;
  }
  // The markers in the window x0 … x1 into mk….
  function markers(x0, x1) {
    mkN = 0;
    for (const e of marks()) {
      if (e.kind === 'start') continue;
      let x;
      if (range === 'days') x = e.day + (e.t || 0) / 86400;
      else { if (e.day !== dayNow) continue; x = e.t; }
      if (x == null || x < x0 || x > x1) continue;
      mkX[mkN] = x; mkLabel[mkN] = e.label || ''; mkSev[mkN] = e.kind === 'event' ? (e.sev === 'info' ? null : e.sev) : null; mkN++;
    }
  }

  // ── Header readout ────────────────────────────────
  let lastAria = '';
  function updateHero() {
    const hidden = hiddenSet();
    if (hidden.has('trueHVPG')) {
      const meas = store.get().lastHVPG;
      heroVal.textContent = meas ? fmt(meas.hvpg, 1) : NOT_SHOWN;
      heroSev.textContent = meas ? 'Measured' : 'Not measured';
      heroSev.dataset.sev = meas ? sevOf(meas.hvpg) : 'none';
      heroDelta.textContent = '';
      return;
    }
    const v = onSlide() && Number.isFinite(endOf('whvp')) ? steadyHvpg() : shownOr('hvpg', frame.metrics.hvpg);
    const txt = fmt(v, 1);
    if (heroVal.textContent !== txt) heroVal.textContent = txt;
    const word = wordOf(v);
    if (heroSev.textContent !== word) heroSev.textContent = word;
    heroSev.dataset.sev = sevOf(v);
    // change across the range on screen
    let d = null, over = '';
    if (range === 'days' && days.length > 1) {
      const first = days.find((x) => x.day >= days[days.length - 1].day - 730) || days[0];
      d = v - first.v.hvpg; over = `since day ${first.day}`;
    } else if (range !== 'days' && coarse.length > 60) {
      // (The mean HVPG of the bins in the first second of the last two minutes and of those in the last second, summed in place: no list made.)
      let fi = 0; while (fi < coarse.length && !(coarse[fi].t >= lastT - 120)) fi++;
      const first = coarse[fi], t1 = first.t + 1;
      let winSum = 0, winN = 0, nowSum = 0, nowN = 0;
      for (let q = 0; q < coarse.length; q++) {
        const b = coarse[q], r = b.v.hvpg;
        if (!r) continue;
        if (b.t >= first.t && b.t < t1) { winSum += r[2] / r[3]; winN++; }
        if (b.t >= lastT - 1) { nowSum += r[2] / r[3]; nowN++; }
      }
      if (winN && nowN) { d = nowSum / nowN - winSum / winN; over = lastT - first.t > 100 ? 'in 2\u00a0min' : `in ${Math.round(lastT - first.t)}\u00a0s`; }   // (a number keeps its unit: never "43" over a lone "s")
    }
    const flat = d == null || Math.abs(d) < 0.4;
    const dt = d == null ? '' : flat ? `Steady ${over}` : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 1)} ${over}`;
    if (heroDelta.textContent !== dt) heroDelta.textContent = dt;
    heroDelta.dataset.dir = flat ? '' : d > 0 ? 'up' : 'down';
    const aria = `Pressure over time. HVPG ${txt} mmHg, ${word}. Portal vein ${fmt(frame.metrics.pv, 0)} mmHg.`;
    if (aria !== lastAria) { lastAria = aria; cv.setAttribute('aria-label', aria); }
  }

  function update(f) { ingest(f); redraw(); }
  // (Scrolling: its own loop draws the next frame. The canvas is drawn before the hero's text is written: setting a canvas
  // font after a DOM write forced a style pass in the middle of the model's frame, 4–5 ms; round 2 review, P5.)
  function redraw() { if (!frame) return; if (!(ticking && live())) draw(); updateHero(); }
  const offs = ['hiddenReadouts', 'hvpgMeasured', 'showHvpg'].map((k) => store.on(k, () => { yr.pressure = yr.hvpg = null; }));
  // A new patient (or the same one restarted) starts with empty traces.
  function clear() { clearHemo(); days = []; redraw(); }
  function pin(fp) { pinned = fp || null; if (frame) redraw(); }
  /** The window ahead of the record filled with the steady state the card opened on (backfill.js): the samples before its first one go in
   *  front, and the record it has made itself stays. The two minutes' bins and the strip's beats are made from them as from live ones. */
  const SAMPLE_KEYS = ['t', 'ph', ...KEYS];
  function backfill(hs) {
    if (!hs?.t?.length || clock !== 'hemo' || off || wheel.laid) return false;   // (a strip that went on by itself keeps its beats)
    const n = olderThan(hs, fine.t.length ? fine.t[0] : Infinity);
    if (!n) return false;
    const all = inFront(fine, hs, SAMPLE_KEYS, n);
    resetBuffers();
    record(all);
    if (frame) redraw();
    return true;
  }
  function configure(t, ctx) {
    cfg = { ekg: t?.ekg !== false, lane: t?.hvpgLane !== false }; yr.pressure = yr.hvpg = null;
    before = ctx?.ref ? { fp: ctx.ref, label: t?.deltaLabel || 'before' } : null;
    if (frame) redraw();
  }
  return { id: 'scope', label: 'Pressure over time', el, update, ingest, redraw, clear, pin, configure, backfill, historySecs: () => RANGES[0][2], dispose() { gpu?.dispose(); offs.forEach((off) => off()); io?.disconnect(); offRest(); cancelFrame(tickRaf); tickRaf = 0; clearTimeout(parkT); parkT = 0; ticking = false; frame = null; anim(false); still.drop(); } };
}

// The charts' X and Y are straight lines (v ↦ a + b·v): their two numbers, the time's then the value's of the lane being drawn, are kept here and
// the series are put into the path in one call each (the shim's tracePoints and traceLine), not a lineTo for every sample.
const AF = new Float64Array(4);
const affine = (f, o) => { const a = f(0); AF[o] = a; AF[o + 1] = f(1) - a; };
// A series as a path's points (the GPU's context takes them in one call; any other context, one by one).
function tracePts(ctx, xs, ys, n, dir, move) {
  if (ctx.onGPU === true) { ctx.tracePoints(xs, ys, n, dir, AF[0], AF[1], AF[2], AF[3], move); return; }
  for (let k = 0; k < n; k++) {
    const i = dir > 0 ? k : n - 1 - k, x = AF[0] + AF[1] * xs[i], y = AF[2] + AF[3] * ys[i];
    if (k === 0 && move) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}
// Thin a series to about two points per pixel column (a pulsatile trace has thousands of samples).
function line(ctx, s, color, width, plotW) {
  const n = s.x.length;
  if (n < 2) return;
  const stride = Math.max(1, Math.floor(n / (plotW * 2)));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  if (ctx.onGPU === true) ctx.traceLine(s.x, s.mid, n, stride, AF[0], AF[1], AF[2], AF[3]);
  else {
    let started = false;
    for (let i = 0; i < n; i += stride) {
      const v = s.mid[i];
      if (Number.isNaN(v)) { started = false; continue; }
      const px = AF[0] + AF[1] * s.x[i], py = AF[2] + AF[3] * v;
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    if ((n - 1) % stride) ctx.lineTo(AF[0] + AF[1] * s.x[n - 1], AF[2] + AF[3] * s.mid[n - 1]);
  }
  ctx.stroke();
}
function band(ctx, s, color, alpha) {
  if (s.x.length < 2) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
  tracePts(ctx, s.x, s.hi, s.x.length, 1, true); tracePts(ctx, s.x, s.lo, s.x.length, -1, false);
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}
function dots(ctx, s, color, ring) {
  for (let i = 0; i < s.x.length; i++) {
    const px = AF[0] + AF[1] * s.x[i], py = AF[2] + AF[3] * s.mid[i];
    ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
  }
}
