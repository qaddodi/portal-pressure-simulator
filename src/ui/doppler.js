// Spectral Doppler: pulsed-wave velocity in one vessel, drawn as the scanner draws it (a
// grey-scale spectrum on black, flow toward the transducer above the baseline), with the reading
// a sonographer would report beside it: direction, velocity against the vessel's normal range,
// and the waveform pattern. The trace keeps recording while the instrument is closed, so it opens
// full. It scrolls smoothly, one spectral line at a time, as the machine does.

import { EDGES, dopplerK, stentSegments, stentSite, stentGate, stentCourse } from '../engine/topology.js';
import { glWords, wordsRect } from './gl-words.js';
import { h, fmt, canvasSize, clamp, icon, cssVar, cssAlpha, swapText } from './util.js';
import { FONT, textW } from './charts.js';
import { logAction, shownVel, store } from './store.js';
import { DOPPLER_MODES, THETA } from './dopplerColor.js';
import { readFrameFor, noteDraw, paceMs, restGapFor, restPark, cancelFrame, frameAnimating, framePart } from './frame.js';
import { windowIndexFor, scaleFor, fitScale } from './dopplerWindow.js';
import { velNormal, dopplerVel, judgeFlow, PROBE_NORMAL } from './velNormal.js';
import { calloutCell } from './trace-callouts.js';
import { caliperFrame, caliperLevel, caliperX, CAL_FADE, pairOf, pairBand, pairScale, PAIR_GAP, pulsatility } from './doppler-marks.js';
import { createDopplerGL } from './doppler-gl.js';
import { lineBand } from './doppler-synth.js';
import { surface } from './gpu-surfaces.js';
import { olderThan } from './backfill.js';
import { createFollow } from './display-state.js';
import { D_SMALL, D_SURFACE, EASE_ARRIVE } from './ease.js';
import { smooth01 } from './motion.js';
import { restPass } from './rest-pass.js';
import { createTraceGL, fitPen, keepLayer } from './trace-gl.js';
import { attrSoon, classSoon, dataSoon, propSoon, runSoon } from './class-soon.js';
import { dropFront } from './drop-front.js';
// (The trace is drawn and handed over in the frame's READ phase, its very start, as the cards' pictures are (svg-gl.js, 787f66b). The hand-over
// (trace-gl.js end: transferToImageBitmap) makes Safari wait for the GPU to finish everything queued before it: drawn in the early phase, after
// the figure (priority 0) had queued its frame, that was the figure's GPU work, and the Doppler read 5-11 ms of script a frame at rest on a
// Doppler slide (10 Nov 2026, Mohammad's Mac ?perf: 34 fps, "doppler 6.8 ms"). At the frame's start the GPU has finished the last frame and the
// wait is the trace's own draw. Its words are set through the soon queues (class-soon.js) and its layout is read between frames (stripLayout),
// so nothing here reads or writes the page's layout. The pacing (paceMs) is the same.)
const nextFrame = readFrameFor('doppler');
const endPen = (ctx) => ctx.end?.();

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
// What the Doppler calls a vessel: a stent also names its course ("TIPS RPV → RHV"), read from where the model connects it.
const STENT_OUT = [0, 0, 0];   // alloc-rare: made once (stentSegments writes into it; each reader uses it before the next call)
const probeName = (p, gate = '') => (gate ? p.byGate[gate] : p.name);   // (made once for each probe, below PROBES; a stent's name with its gate)
// kind decides the words for direction and pattern; normal is the usual velocity (cm/s), from the one table of them (velNormal.js PROBE_NORMAL).
// Positive velocity is the vessel's physiological direction (for a collateral: portal → systemic).
// The trace is drawn as the scanner shows it, relative to the transducer: flow toward the probe
// above the baseline. Hepatic veins and the IVC drain away from a subcostal or intercostal probe,
// so their forward flow is below the baseline (away) and the a-wave reversal above it.
const PROBES = [
  { id: 'PV_TRUNK', short: 'MPV', kind: 'portal', normal: PROBE_NORMAL.PV_TRUNK },
  { id: 'PVH_R', short: 'RPV', kind: 'portal', normal: PROBE_NORMAL.PVH_R },
  { id: 'PVH_L', short: 'LPV', kind: 'portal', normal: PROBE_NORMAL.PVH_L },
  { id: 'SMV_CONF', short: 'SMV Prox', kind: 'portal', normal: PROBE_NORMAL.SMV_CONF },
  { id: 'V_INT', short: 'SMV Dist', kind: 'portal', normal: PROBE_NORMAL.V_INT },
  { id: 'SV_CONF', short: 'SV Prox', kind: 'portal', normal: PROBE_NORMAL.SV_CONF },
  { id: 'V_SPL', short: 'SV Dist', kind: 'portal', normal: PROBE_NORMAL.V_SPL },
  { id: 'RHV_IVC', short: 'RHV', kind: 'hepatic', normal: PROBE_NORMAL.RHV_IVC, away: true },
  { id: 'MHV_IVC', short: 'MHV', kind: 'hepatic', normal: PROBE_NORMAL.MHV_IVC, away: true },
  { id: 'LHV_IVC', short: 'LHV', kind: 'hepatic', normal: PROBE_NORMAL.LHV_IVC, away: true },
  { id: 'IVCS_RA', short: 'IVC', kind: 'ivc', normal: PROBE_NORMAL.IVCS_RA, away: true },
  { id: 'A_HEP', short: 'HA', kind: 'artery', normal: PROBE_NORMAL.A_HEP },
  { id: 'A_HR', short: 'RHA', kind: 'artery', normal: PROBE_NORMAL.A_HR },
  { id: 'A_HL', short: 'LHA', kind: 'artery', normal: PROBE_NORMAL.A_HL },
  { id: 'TIPS', short: 'TIPS', kind: 'tips', normal: PROBE_NORMAL.TIPS },
  { id: 'DIPS', short: 'DIPS', kind: 'tips', normal: PROBE_NORMAL.DIPS },
  { id: 'C1b', short: 'Varix C1', kind: 'collateral', normal: null },
  { id: 'C3', short: 'Paraumb. C3', kind: 'collateral', normal: null },
  { id: 'C2', short: 'Varix C2', kind: 'collateral', normal: null },   // (the EUS coils and glue slide reads the fundal varix's feeder, 10 Nov 2026; it falls to "No flow" when the model closes it)
];
for (const p of PROBES) p.name = p.kind === 'tips' ? `${p.short} ${stentCourse(EDGES[EI[p.id]])}` : p.short;
// The fade a row takes when it comes in, and the two answers of the ?perf surfaces list: made once (animate() reads its keyframes and timing as it is called).
const FADE_KEYS = [{ opacity: 0 }, { opacity: 1 }], FADE_OPTS = { duration: D_SMALL, easing: EASE_ARRIVE };
const SURF_GPU = { on: 'gpu', via: 'trace and words WebGL2' }, SURF_WAIT = { on: 'gpu', via: 'trace WebGL2, words by the GPU chart drawer (its first picture not laid yet)' },
  SURF_NOWORDS = { on: 'fallback', via: 'trace WebGL2, words not drawn', why: 'the GPU chart drawer failed, was lost or has no WebGL2 (the words have no 2D copy)' },
  SURF_NO_LINES = { on: 'fallback', via: 'trace black: no spectrum lines', why: 'the spectrum shader is not built yet, or failed (see the console); the lines are made on the GPU alone' };
const SURF_LOST = { on: 'fallback', via: 'none', why: 'context lost' }, SURF_NONE = { on: 'fallback', via: 'none', why: 'no WebGL2' };
// The sentences that name a stent, made once for each of the two (the stent is 'TIPS' or 'DIPS'), and the resistive index's words for each hundredth.
const NOTE_BACK = {}, NOTE_SLOW = {}, NOTE_NOT_EXPECTED = {};
for (const st of ['TIPS', 'DIPS']) {
  NOTE_BACK[st] = `Expected with a ${st}: flow is directed retrograde toward the stent.`;
  NOTE_SLOW[st] = `Slower than expected with a ${st}: suggests stent stenosis.`;
  NOTE_NOT_EXPECTED[st] = `With a ${st}, hepatopetal flow here is not expected: suggests stent stenosis.`;
}
const RI_TEXT = [];
for (let i = 0; i <= 100; i++) RI_TEXT.push(`Resistive index ${fmt(i / 100, 2)}`);
// A stent's name with the gate it samples at, for each gate (the label in the strip), and the strip's settings words for each window.
const GATE_NAME = { proximal: 'Proximal', mid: 'Mid', distal: 'Distal' };
for (const p of PROBES) if (p.kind === 'tips') { p.byGate = {}; for (const g in GATE_NAME) p.byGate[g] = `${p.name} · ${GATE_NAME[g]}`; }
// (A stent's note on its range, made once from its normal: "Stent velocities <90 or >190 cm/s, …".)
for (const p of PROBES) if (p.kind === 'tips') p.rangeNote = `Stent velocities <${p.normal[0]} or >${p.normal[1]} cm/s, or a change of >50 cm/s from the baseline scan, suggest stenosis.`;
const PROBES_BY_ID = new Map(PROBES.map((p) => [p.id, p]));
const PI_TEXT = [];   // (the calipers' index in words, for each hundredth up to 3)
for (let i = 0; i <= 300; i++) PI_TEXT.push(`PI ${fmt(i / 100, 2)}`);
const SWEEP_SECONDS = [6, 3, 12];
// SETTINGS[spectrum ? 0 : 1][sample volume in mm][window index]: the settings that fit in 1, 2, 3 or 4 parts, joined (a narrow strip drops them from the end).
const SETTINGS = [];
for (let c = 0; c < 2; c++) {
  SETTINGS.push([]);
  for (let mm = 0; mm <= 15; mm++) {
    SETTINGS[c].push([]);
    for (const sec of SWEEP_SECONDS) {
      const all = [c === 0 ? 'PW' : 'PW + CD', `θ ${THETA}°`, `SV ${mm} mm`, `${sec} s`], out = [];
      for (let n = 1; n <= all.length; n++) out.push(all.slice(0, n).join('  ·  '));
      SETTINGS[c][mm].push(out);
    }
  }
} // Start at 6 s; first tap shortens the visible window.
const PAD_L = 12, PAD_R = 46;        // The trace's side margins (CSS px).
const KEEP = 16;                 // Retain enough samples for the 12 s sweep and display lag.
// (R16: the history is a bounded queue: samples past KEEP are dropped in chunks (256, or a quarter of it), not shifted out on every
// model frame; every reader picks its seconds by time, so the few older ones kept meanwhile change nothing drawn.)
const MINUS = '−';
const num = (v, d = 0) => (v < 0 ? MINUS : '') + fmt(Math.abs(v), d);

export function createDoppler({ onProbe, pickGate = true }) {
  let sweepIndex = 0;
  let sweepSeconds = SWEEP_SECONDS[sweepIndex];
  const probeSel = h('select', { class: 'select dop-vessel', 'aria-label': 'Vessel' },
    PROBES.map((p) => h('option', { value: p.id, title: EDGES[EI[p.id]].label }, probeName(p))));
  probeSel.addEventListener('change', () => onProbe(probeSel.value));
  // A stent's sample gate: where along it the trace and the reading come from (store.dopGate, shared with the figure, whose
  // stent glows in the Doppler's green over that third). Chosen by tapping the Proximal, Mid or Distal tile under the trace
  // (real buttons, in the dock; a slide's own buttons set it in Present, where the tiles are plain).
  const SEGS = [['proximal', 'Proximal'], ['mid', 'Mid'], ['distal', 'Distal']];
  const pickSeg = (seg) => { if (store.get().dopGate !== seg) store.set({ dopGate: seg }); logAction('gate', 'doppler', seg); };
  // Display mode: a text switch of the three displays (Spectrum, Color, Variance; the colour maps live in dopplerColor.js, the trace is drawn through
  // them). It was one pill that cycled and hid the other two (13 Nov 2026).
  let mode = 'spectrum';
  const modeBtns = DOPPLER_MODES.map((m) => h('button', { type: 'button', class: 'dop-mode-opt', 'data-mode': m.id, 'aria-pressed': String(m.id === mode), title: `Doppler display: ${m.label}`,
    onclick: () => { if (mode !== m.id) { mode = m.id; sync(); } } }, m.short));
  const modeSeg = h('div', { class: 'dop-modes', role: 'group', 'aria-label': 'Doppler display' }, modeBtns);
  // Invert, as on the scanner: flips the display about the baseline, so the toward/away colors swap
  // with it (the report and the physiology are unchanged). Power Doppler has no direction.
  let invert = false;
  const invBtn = h('button', { class: 'dop-tint dop-inv', 'aria-pressed': 'false', title: 'Invert the display: show flow away from the probe above the baseline' }, h('i', { 'aria-hidden': 'true' }, '⇅'), h('span', { class: 'dop-lbl' }, 'Invert'));
  const setInvert = (v) => { invert = !!v; invBtn.setAttribute('aria-pressed', String(invert)); sync(); };
  invBtn.addEventListener('click', () => { setInvert(!invert); logAction('invert', 'doppler', invert); });
  function sync() {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    invBtn.title = 'Invert the display: show flow away from the probe above the baseline; swaps the toward/away colors';
    if (frame) draw();
  }
  const sweepIcon = icon('clock');
  sweepIcon.setAttribute('aria-hidden', 'true');
  const sweepBtn = h('button', {
    class: 'dop-tint dop-sweep',
    title: `Sweep window: ${sweepSeconds} seconds. Tap to cycle.`,
    'aria-label': `Doppler sweep duration: ${sweepSeconds} seconds. Activate to cycle.`,
  }, sweepIcon, h('span', { class: 'dop-sweep-label' }, `${sweepSeconds} s`));
  // The window in use: set by a tap, or chosen from the drawn width (see pickWindow).
  function setSweep(i) {
    sweepIndex = i;
    sweepSeconds = SWEEP_SECONDS[sweepIndex];
    swapText(sweepBtn.lastChild, `${sweepSeconds} s`);
    sweepBtn.title = `Sweep window: ${sweepSeconds} seconds. Tap to cycle.`;
    sweepBtn.setAttribute('aria-label', `Doppler sweep duration: ${sweepSeconds} seconds. Activate to cycle.`);
    RK.ok = false;
  }
  sweepBtn.addEventListener('click', () => {
    manualSweep = true;
    setSweep((sweepIndex + 1) % SWEEP_SECONDS.length);
    if (frame) { updateReport(); draw(); }
  });
  // Auto window: once per showing (first draw, and again each time a slide shows it), a narrow trace takes 3 s and a wide one 6 s.
  // It never switches while the slide stays; a tap picks a window by hand until the next showing.
  let manualSweep = false, pickNext = true;
  function pickWindow() {
    pickNext = false;
    if (manualSweep) return;
    const i = windowIndexFor((ro && cvW > 0 ? cvW : cv.clientWidth) - PAD_L - PAD_R);   // (layout width: not scaled by a card still easing in, and never a stale cached size)
    if (i !== sweepIndex) { setSweep(i); updateReport(); }
  }
  const WAVE_PX = 20;   // the a, S, v, D letters: large enough to read against the card text
  const cv = h('canvas', { role: 'img', 'aria-label': 'Spectral Doppler' });
  const box = h('div', { class: 'chart-box dark dop-box' }, cv);
  // The trace (the ring, the noise floor, the wall filter's band) is drawn on the GPU (doppler-gl.js; Mohammad, 22 Oct: "Move to GPU") in the
  // context of the GPU chart drawer (trace-gl.js, the shared pool: pure-GPU plan B1, no WebGL context of its own), inside the drawer's own
  // frame, and the margins, words, ticks and calipers are laid over it in the same picture (1 Nov: nothing off the GPU). This canvas is only
  // their host: it takes the pointer and is never drawn. Nothing of the trace is drawn on the CPU: without WebGL2 it stays black.
  const gpu = createDopplerGL({ onReady: () => redraw() });
  const words = createTraceGL(cv, { redraw: () => redraw() });
  // (The ?perf surfaces list, gpu-surfaces.js: read by the readout only.)
  const offSurface = surface('Doppler trace', () => (!cv.isConnected || cv.checkVisibility?.() === false ? null : gpu && !gpu.lost ? (!gpu.canSynth() ? SURF_NO_LINES : !words || words.gone ? SURF_NOWORDS : words.presented ? SURF_GPU : SURF_WAIT) : gpu ? SURF_LOST : SURF_NONE));

  // The report
  const dirEl = h('b', { class: 'dop-dir' }, '—');
  const velEl = h('span', { class: 'dop-vel' }, h('b', {}, '—'), h('small', {}, 'cm/s', h('span', { class: 'dop-mean' })));
  // Normal-range gauge: a track with the usual band shaded and a marker for the current mean.
  // (The usual band: its middle stretched by scale and its two round ends moved by translate, under one opacity, so a new range is
  // only transforms, eased on the compositor: no corner radius is rewritten for the stretch. The one-piece band, its corners redrawn each
  // change, is gone with its ?bandcaps=0: 2 Nov 2026, "Move everything to GPU".)
  const bandMid = h('i', { class: 'dop-bm' }), bandL = h('i', { class: 'dop-bc' }), bandR = h('i', { class: 'dop-bc' });
  const bandEl = h('i', { class: 'dop-band dop-band-caps' }, bandMid, bandL, bandR);
  let trackW = 0;
  const markEl = h('i', { class: 'dop-mark' });
  const gLo = h('span', { class: 'dop-g-lo' }); const gHi = h('span', { class: 'dop-g-hi', 'data-u': 'cm/s' }); const gZero = h('span', { class: 'dop-g-zero' }, '0');
  const trackEl = h('div', { class: 'dop-track' }, bandEl, markEl);
  // (The track's width, for the band's middle: read as the browser reports a new one, never in a frame.)
  if (typeof ResizeObserver === 'function') new ResizeObserver((es) => { const w = es[0]?.contentRect?.width || 0; if (w && Math.abs(w - trackW) > 0.5) { trackW = w; if (gaugeP) updateGauge(gaugeP, gaugeMean, gaugeExpected); } }).observe(trackEl);
  const rangeEl = h('div', { class: 'dop-range', hidden: true }, trackEl, h('div', { class: 'dop-ticks' }, gZero, gLo, gHi));
  const patternEl = h('div', { class: 'dop-pattern' });
  const noteEl = h('p', { class: 'dop-note' });
  const statEls = {};
  // (What the figure reads of the shown velocity (store shownVel), one record for each probe, written in place.)
  const SHOWN = new Map();
  for (const pr of PROBES) SHOWN.set(pr.id, { v: 0, t: 0, seg: null, open: 0 });
  // A row that comes with the new vessel (the congestion index, a stent's three segments) fades in rather than popping (P23).
  // (Between frames: a hidden flip is a style pass. A flip back before it lands cancels it. Each row has its own flip, made once with it,
  // that reads the row's last ask: a flip asked for and then taken back finds nothing to do.)
  const showStat = (wrap, on) => {
    if ((wrap._on ?? !wrap.hidden) === on) return;
    wrap._on = on;
    restPass(wrap._flip);
  };
  const flipStat = (wrap) => {
    const on = wrap._on;
    if (wrap.hidden === !on) return;
    propSoon(wrap, 'hidden', !on);
    if (on && wrap.isConnected && shown()) runSoon(wrap._fade);   // (after the hidden flip lands: the fade starts from the row shown)
  };
  const stats = h('dl', { class: 'dop-stats' }, ['Speed', 'Peak', 'Trough', 'Pulsatility', 'CI', 'Proximal', 'Mid', 'Distal'].map((k) => {
    const dd = h('dd', {}, '—');
    const seg = SEGS.find(([, name]) => name === k)?.[0];
    // A stent segment's tile is a button (the name inside the term; its ::after covers the whole tile, so a tap anywhere on it samples there).
    const btn = seg && pickGate ? h('button', { type: 'button', class: 'dop-seg', 'aria-pressed': 'false', title: `Sample the stent at its ${k.toLowerCase()} end` }, k) : null;
    btn?.addEventListener('click', () => pickSeg(seg));
    if (btn) btn._label = () => attrSoon(btn, 'aria-label', `${k}, ${num(btn._v)} centimeters per second${btn._here ? ', sampling here' : ''}. Activate to sample here.`);
    // (the Peak tile is named Max: the highest point of the last 3 s, beside the big reading, which is the spectrum's peak averaged over time)
    // (the Speed tile is the reading against its usual range, in place of the long range bar: it turns to the caution colour outside it, and its title names the range)
    const wrap = h('div', k === 'Peak' ? { title: 'Highest velocity in the last 3 s' } : k === 'Speed' ? { class: 'dop-speed', hidden: true } : {}, h('dt', {}, btn || (k === 'Peak' ? 'Max' : k)), dd); statEls[k] = { dd, wrap, btn };
    wrap._flip = () => flipStat(wrap); wrap._fade = () => wrap.animate?.(FADE_KEYS, FADE_OPTS);
    return wrap;
  }));
  // The report's words that change while the trace runs are drawn on the GPU while they change (gl-words.js, ?glwords=0 writes them
  // into the page as before); the strip's fit, between frames, writes them in at once (now) to measure them.
  const KEEP = { keep: true };   // (the numbers keep their GPU picture once drawn: no hand-over to the page's own text, so they never change shape or shimmer as they settle, glitch audit N2)
  const W = new Map([[velEl.firstChild, glWords(velEl.firstChild, KEEP)], [dirEl, glWords(dirEl)], [patternEl, glWords(patternEl)],
    [gLo, glWords(gLo, { after: true })], [gHi, glWords(gHi, { after: true })]]);
  for (const k in statEls) W.set(statEls[k].dd, glWords(statEls[k].dd, KEEP));
  const wSet = (e, t, u) => W.get(e).set(t, u), wNow = (e, t) => W.get(e).now(t), wText = (e) => W.get(e).text;
  // In the Tests card the usual range is the Speed tile's own small scale (the long bar is a slide card's); the tile carries it, so it is never a row of its own.
  if (pickGate) statEls.Speed.wrap.append(rangeEl);
  const report = h('div', { class: 'dop-report' }, dirEl, h('div', { class: 'dop-velrow' }, velEl, patternEl), pickGate ? null : rangeEl, stats, noteEl);
  // The top strip's fitting steps (see fitStrip): [type scale, the direction's short form, the pattern on its own line].
  let stripKey = '', stripStep = 0, dirFull = '—', patFull = '', stripType = '', rng = null;
  // Whether the monitor is on screen, and the widths the strip is fitted to, as the browser reports them when they change: read
  // on every frame (offsetParent, clientWidth), they made the browser lay the page out mid-frame, after the figure's own writes.
  // (No observers, as in a bare test page: read as before.)
  let seen = false, repW = -1, cvW = -1, cvH = -1;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { const was = seen; seen = es[es.length - 1].isIntersecting; if (seen && !was) redraw(); }) : null;
  io?.observe(cv);
  const shown = () => cv.isConnected && (io ? seen : true);   // (no observer, a bare test page: taken as shown)
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {
    let moved = false;
    for (const e of es) {
      const w = e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width, hgt = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (e.target === report) repW = w;
      else { moved = (cvH > 0 && Math.abs(hgt - cvH) > 0.5) || (cvW > 0 && Math.abs(w - cvW) > 0.5); cvW = w; cvH = hgt; }
    }
    // (The monitor fills the card's height, so it can settle at its size after a first draw: a paused model draws it again at the new size.)
    if (moved) redraw();
  }) : null;
  ro?.observe(report, { box: 'border-box' }); ro?.observe(cv, { box: 'border-box' });
  // (Every step one line, Mohammad 20 Oct, "the top bar on Doppler should be one line": type 1, 0.9, 0.8, then the direction's short
  // form, then the pattern's short form, then the unit dropped, which the monitor's axis already names. Never under 12 px, no ellipsis.)
  const STEPS = [[1, false, 0], [0.9, false, 0], [0.8, false, 0], [0.9, true, 0], [0.8, true, 0], [0.8, true, 1], [0.8, true, 2]];
  const SHORT_PAT = { 'Low velocity, jet': 'Slow, jet', 'Low velocity': 'Slow', 'High velocity': 'Fast', 'Phasic, with reversal': 'Phasic, reversal', 'Large reversal': 'Reversal', 'Open collateral': 'Open', 'Resistive index 0.00': 'RI 0.00' };
  const SHORT_DIR = { 'Portal → hepatic vein': 'PV → HV', 'Portal → IVC': 'PV → IVC', 'Portal → systemic': 'PV → systemic', 'Systemic → portal': 'Systemic → PV', 'Toward the heart': 'To the heart', 'Not available during time lapse': 'Paused in time lapse' };
  const el = h('div', { class: 'dop', 'data-pane': 'doppler' },
    h('div', { class: 'dop-head' }, probeSel, h('div', { class: 'dop-btns' }, modeSeg, invBtn, sweepBtn)), h('div', { class: 'dop-main' }, box, report));

  // ── Samples ───────────────────────────────────────
  let buf = [];
  // (Each sample is a [t, v, paired v] triple. A sample leaving the record is kept to be written over by the next one, so a steady trace
  // makes no triple per sample: 2 Nov 2026. The pool holds more than the record ever does (16 s at 50 samples a second and a chunk);
  // with it empty the oldest sample is taken over, never a new array made.)
  const spare = [];
  for (let k = 0; k < 1536; k++) spare.push([0, 0, 0]);
  const POOL_MAX = 4096;
  function sample(t, v, p) {
    let a = spare.pop();
    if (!a) a = buf.shift();
    a[0] = t; a[1] = v; a[2] = p;
    return a;
  }
  // The samples dropped from the front of the record, kept for reuse (a template holds its own copies, so none is shared).
  function dropSamples(n) {
    for (let i = 0; i < n && spare.length < POOL_MAX; i++) spare.push(buf[i]);
    dropFront(buf, n);
  }
  function clearBuf() { dropSamples(buf.length); beatN = 0; lastPh = NaN; }
  // The times the heart's cycle began (the samples' phase wrapping), the newest BEAT_MAX kept in a ring: a vein's pulsatility is read
  // within each beat, as a scanner's calipers read it, not across the breath's swing as well (healthy portal vein: 0.48 over 3 s, 0.22 a beat).
  const BEAT_MAX = 16, beatT = new Float64Array(BEAT_MAX);
  let beatN = 0, lastPh = NaN;
  let probe = null, frame = null, gateNow = '';
  // Time lapse (the disease clock) has no bedside samples: the model jumps a day at a time. The
  // trace keeps scrolling at bedside speed by replaying the last recorded beats (the template),
  // scaled so their mean eases to the vessel's current mean velocity. Synthetic times run on from
  // the record; once bedside time resumes, its samples are shifted (tOff) to follow on.
  let tOff = 0, tpl = null, synth = null;
  sync();
  function startSynth() {
    const tEnd = buf[buf.length - 1][0];
    let i = buf.length - 1; while (i > 0 && buf[i - 1][0] >= tEnd - 3) i--;
    const pts = [];   // (the template's own copies: the record's triples are written over as they leave it)
    for (let j = i; j < buf.length; j++) pts.push([buf[j][0], buf[j][1], buf[j][2]]);
    const L = pts[pts.length - 1][0] - pts[0][0];
    if (pts.length < 8 || L < 1) return null;
    const mean = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    // (and the paired vessel's record beside it, a slide's pair: replayed unscaled, its swings eased out with the main one's)
    const pm = pts.reduce((a, p) => a + (p[2] || 0), 0) / pts.length;
    tpl = { t0: pts[0][0], L, pts, mean, pm, hasPair: pts.every((p) => Number.isFinite(p[2])) };
    return { t: tEnd, wall: performance.now(), mean, target: mean, amp: 1, still: false };
  }
  function tplAt(t, j = 1) {
    const { t0, L, pts } = tpl;
    const x = t0 + (((t - t0) % L) + L) % L;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= x) lo = m; else hi = m; }
    const ta = pts[lo][0], va = pts[lo][j], tb = pts[hi][0], vb = pts[hi][j];
    const v = tb > ta ? va + (vb - va) * clamp((x - ta) / (tb - ta), 0, 1) : va;
    // Cross-fade the last 0.25 s of the loop into its start, so the seam does not step.
    const w = (x - (t0 + L - 0.25)) / 0.25;
    return w > 0 ? v * (1 - w) + pts[0][j] * w : v;
  }
  function runSynth() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - synth.wall) / 1000);
    synth.wall = now;
    const m0 = tpl.mean;
    const ratio = Math.abs(m0) > 2;
    for (let k = 0, n = Math.ceil(dt / 0.02); k < n; k++) {
      synth.t += dt / n;
      synth.mean += (synth.target - synth.mean) * Math.min(1, (dt / n) * 3);
      // (The template was recorded with breathing; a lapse run without respiration eases its swings out.)
      synth.amp = clamp(synth.amp + (synth.still ? -1.5 : 1.5) * (dt / n), 0, 1);
      const v = m0 + (tplAt(synth.t) - m0) * synth.amp;
      buf.push(sample(synth.t, ratio ? v * synth.mean / m0 : v - m0 + synth.mean, tpl.hasPair ? tpl.pm + (tplAt(synth.t, 2) - tpl.pm) * synth.amp : NaN));
    }
  }
  function ingest(f) {
    frame = f;
    if (f.probe !== probe) { clearBuf(); wl = null; tOff = 0; synth = null; scale = null; heldTo = null; steady.probe = null; probe = f.probe; if (probeSel.value !== probe) probeSel.value = probe; }
    // A new spot along a stent is a new recording, as a new vessel is: the trace starts over and finds its own scale.
    const g = isStentProbe() ? gateOf() : '';
    if (g !== gateNow) { gateNow = g; clearBuf(); wl = null; synth = null; scale = null; heldTo = null; steady.probe = null; }
    const s = f.samples;
    if (f.clock === 'disease') {
      if (!synth && buf.length) synth = startSynth();
      if (!synth) return;
      if (s?.vel?.length) synth.target = s.vel[s.vel.length - 1];
      synth.still = f.resp === false;
      // A lapse without respiration shows none from its first frame: the replay and the trace already drawn go flat at once.
      if (synth.still && !synth.flat) { synth.flat = true; synth.amp = 0; for (const p of buf) { p[1] = synth.mean; if (tpl.hasPair) p[2] = tpl.pm; } for (const p of tpl.pts) { p[1] = synth.mean; if (tpl.hasPair) p[2] = tpl.pm; } }
      if (f.running) runSynth();
    } else {
      if (synth && s?.t.length) { tOff = synth.t + 0.02 - s.t[0]; synth = null; }
      if (!s || !s.t.length) return;
      // Model time stepped back (a state loaded, as at the end of a presenter time-lapse): carry
      // the trace on from where it is instead of starting over.
      if (buf.length && s.t[0] + tOff < buf[buf.length - 1][0] - 1e-9) tOff = buf[buf.length - 1][0] + 0.02 - s.t[0];
      // (Each sample keeps the paired vessel's velocity beside it, for a slide's paired trace: the worker samples the main portal
      // vein and the right hepatic vein at every step, whatever the probe.)
      const ps = s[pairOf(meta().kind) === 'PV_TRUNK' ? 'pvVel' : 'hvVel'];
      for (let i = 0; i < s.t.length; i++) {
        const t = s.t[i] + tOff;
        if (!buf.length || t > buf[buf.length - 1][0]) {
          buf.push(sample(t, s.vel[i], ps?.[i] ?? NaN));
          const ph = s.ph?.[i];
          if (Number.isFinite(ph)) { if (ph < lastPh - 0.5) beatT[beatN++ % BEAT_MAX] = t; lastPh = ph; }
        }
      }
    }
    if (!buf.length) return;
    const tNow = buf[buf.length - 1][0];
    if (f.settling) heldTo = tNow;
    let cut = 0; while (cut < buf.length && buf[cut][0] < tNow - KEEP) cut++;
    if (cut && (cut >= 256 || cut * 4 >= buf.length)) dropSamples(cut);
  }

  // ── Reading ───────────────────────────────────────
  // (Nothing until 1.5 s of this vessel is recorded: a pattern judged from part of a beat is a wrong one, a red "To-and-fro" for a moment.)
  const SETTLE = 1.5;
  // (The reading, and the same scaled to a stent's gate, are two kept records written in place: a caller uses one at once and does not keep it.)
  const READ = { mean: 0, vmax: 0, vmin: 0, vmaxMean: 0, vminMean: 0, beatPi: -1, beatB0: 0, beatB1: 0 }, GATED = { mean: 0, vmax: 0, vmin: 0, vmaxMean: 0, vminMean: 0, beatPi: -1, beatB0: 0, beatB1: 0 };
  // (What interpret() answers, written in place, and the options it hands judgeFlow.)
  const IT = { dir: '', sev: '', pattern: '', note: '', pi: 0, expected: false }, OPT_SWINGS = { swings: false }, OPT_STENT = { stent: true };
  function reading() {
    if (buf.length < 4) return null;
    const tNow = buf[buf.length - 1][0];
    if (tNow - buf[0][0] < SETTLE) return null;
    let sum = 0, n = 0, vmax = -Infinity, vmin = Infinity;
    // (Once a live change has settled for HOLD_AFTER, only what the settled model shows: the scale fits the same samples.)
    const from = heldTo != null && tNow - heldTo >= HOLD_AFTER ? Math.max(tNow - 3, heldTo) : tNow - 3;
    for (let i = buf.length - 1; i >= 0 && buf[i][0] >= from; i--) {
      const v = buf[i][1]; sum += v; n++;
      if (v > vmax) vmax = v; if (v < vmin) vmin = v;
    }
    // The record is the mean across the lumen; the scanner reads the peak of the spectrum (dopplerK)
    const k = dopplerK(EDGES[EI[probe]]);
    const r = READ;
    r.mean = k * sum / n; r.vmax = vmax * k; r.vmin = vmin * k; r.vmaxMean = vmax; r.vminMean = vmin;
    const mb = medianBeat(from, tNow); r.beatPi = mb.pi; r.beatB0 = mb.b0; r.beatB1 = mb.b1;
    return r;
  }
  // A vein's pulsatility within one beat, as a sonographer's calipers read it: of the whole beats inside [from, to] (a hair in from each
  // end, so the beat lies inside the calipers' window too, doppler-marks.js caliperWindow), the median one by its index, (max − min) / the
  // larger of |max| and |min| (doppler-marks.js pulsatility). The median, not the newest, so a breath's shallow beat does not swing it;
  // a real beat, not a mean, so the calipers can stand on it and read the same number (BEAT_PICK.b0, b1). −1 with no whole beat recorded
  // (a time lapse replays its template without phase, and the first second of a vessel has none).
  const BEAT_PICK = { pi: -1, b0: 0, b1: 0 }, BEAT_PIS = new Float64Array(BEAT_MAX), BEAT_B0 = new Float64Array(BEAT_MAX), BEAT_ORD = new Int32Array(BEAT_MAX);
  function medianBeat(from, to) {
    BEAT_PICK.pi = -1;
    const n = Math.min(beatN, BEAT_MAX), lo0 = from + 0.05, hi1 = to - 0.05;
    let nb = 0;
    for (let j = 1; j < n; j++) {
      const b0 = beatT[(beatN - n + j - 1) % BEAT_MAX], b1 = beatT[(beatN - n + j) % BEAT_MAX];
      if (b0 < lo0 || b1 > hi1 || !(b1 > b0)) continue;
      let hi = -Infinity, lo = Infinity;
      for (let i = buf.length - 1; i >= 0 && buf[i][0] >= b0; i--) { if (buf[i][0] > b1) continue; const v = buf[i][1]; if (v > hi) hi = v; if (v < lo) lo = v; }
      if (!(hi > -Infinity)) continue;
      BEAT_PIS[nb] = pulsatility(hi, lo); BEAT_B0[nb] = b0; BEAT_ORD[nb] = j; nb++;
    }
    if (!nb) return BEAT_PICK;
    // (the median by index: a short insertion sort of the few beats' places)
    const ord = BEAT_ORD;
    for (let i = 0; i < nb; i++) ord[i] = i;
    for (let i = 1; i < nb; i++) { const k = ord[i]; let m = i - 1; while (m >= 0 && BEAT_PIS[ord[m]] > BEAT_PIS[k]) { ord[m + 1] = ord[m]; m--; } ord[m + 1] = k; }
    const pick = ord[(nb - 1) >> 1];
    BEAT_PICK.pi = BEAT_PIS[pick]; BEAT_PICK.b0 = BEAT_B0[pick];
    // (the beat's end: the next beat's start after b0)
    for (let j = 0; j < n; j++) { const t = beatT[(beatN - n + j) % BEAT_MAX]; if (t > BEAT_PICK.b0) { BEAT_PICK.b1 = t; break; } }
    return BEAT_PICK;
  }
  // (The probe's row, found again only when the probe changes.)
  let metaFor = null, metaRow = PROBES[0];
  const meta = () => {
    if (metaFor !== probe) { metaFor = probe; metaRow = PROBES[0]; for (let i = 0; i < PROBES.length; i++) if (PROBES[i].id === probe) { metaRow = PROBES[i]; break; } }
    return metaRow;
  };
  // The sample volume's length (mm): half the vessel's width, in its middle, as the figure's gate is drawn (dop-probe.js gateDims; the
  // Polish Ultrasound Society's setting, J Ultrason 2015, p. 214), within the 2–15 mm a scanner offers (Meola et al., J Vasc Access
  // 2021, p. 22). From the vessel's usual width (the trunk the probe sees for a lumped bundle), so it holds still while the vessel
  // swells and shrinks with the beat; a stent or collateral, which has none, reads its own.
  const svMm = () => {
    const e = EDGES[EI[probe]], d = e?.vd || e?.d || frame?.D?.[EI[probe]] || 0;
    return clamp(Math.round(d / 2), 2, 15);
  };
  // A stent's proximal, mid and distal velocities from the open stent's velocity v: the narrowed segment runs faster.
  const stentReads = (v) => {
    const prm = store.get().params, s = 1 - (1 - (prm?.stenosis?.[probe] || 0)) * (1 - (prm?.thrombus?.[probe] || 0));
    return stentSegments(v, s, stentSite(prm, probe), STENT_OUT);
  };
  // The gated segment of a stent, and how much faster it runs than the open stent (1 elsewhere, and on any other vessel).
  const isStentProbe = () => meta().kind === 'tips';
  const gateOf = () => stentGate(store.get().dopGate, store.get().params, probe);
  let gf = 1;
  const gateIndex = () => { const g = gateOf(); for (let i = 0; i < SEGS.length; i++) if (SEGS[i][0] === g) return i; return -1; };
  const gateFactor = () => (isStentProbe() ? stentReads(1)[gateIndex()] || 1 : 1);
  // +1 when the vessel's forward flow is drawn above the baseline, −1 when below
  const effInvert = () => invert;
  const pol = () => (!meta().away !== !effInvert() ? -1 : 1);

  // A vessel's usual range: with a TIPS or DIPS in, the main portal vein's is 30 cm/s and up (velNormal.js), so fast flow is not flagged.
  const normalOf = (p) => (p.id === 'PV_TRUNK' && frame?.D ? velNormal(EI.PV_TRUNK, frame) : null) || p.normal;
  // A stent is judged at its gate, as its reading, trace and tiles show it: a 90% narrowing's jet is flow, not an occlusion,
  // although the open stent around it barely moves (g, the gate's factor; open, the open stent's mean for its segment tiles).
  // (seen: the reading the strip shows, signed and at the stent's gate, and the open stent's velocity its segment tiles read from: a stent's
  // words are judged on the numbers beside them, so "Patent" never sits beside a 191, nor "High velocity" beside a 189.)
  const SEEN = { gated: NaN, open: NaN };
  function interpret(r0, g = 1, seen = null) {
    const p = meta(), normal = normalOf(p), open = Math.abs(r0.mean);
    let r = r0;
    if (g !== 1) { r = GATED; r.mean = r0.mean * g; r.vmax = r0.vmax * g; r.vmin = r0.vmin * g; r.vmaxMean = r0.vmaxMean * g; r.vminMean = r0.vminMean * g; r.beatPi = r0.beatPi; }
    const a = Math.abs(r.mean);
    const swing = r.vmaxMean - r.vminMean;
    const big = Math.max(Math.abs(r.vmaxMean), Math.abs(r.vminMean));
    // (A portal vein's pulsatility is read within each beat when the record has the beats (beatPulsatility), as its index is defined;
    // across 3 s it took in the breath's swing too and a healthy vein read 0.48, near the 0.5 of severe pulsatility. 13 Nov 2026.)
    const pi = p.kind === 'portal' && r.beatPi >= 0 ? r.beatPi : big > 0.5 ? swing / big : 0;
    const reverses = r.vminMean < -1.5 && r.vmaxMean > 1.5;
    // (The cut-offs for no flow, stasis and slow flow are velNormal.js's judgeFlow, read the same here as in the figure's labels, the Details sentences and the summary tables.)
    OPT_SWINGS.swings = reverses;
    const j = judgeFlow(r.mean, null, normal, OPT_SWINGS), js = p.kind === 'tips' ? judgeFlow(r.mean, null, normal, OPT_STENT) : j;
    let dir, sev, pattern, note;
    if (j.none && big < 2 && p.kind !== 'collateral') {
      dir = 'No flow'; sev = 'critical'; pattern = 'No signal';
      note = p.kind === 'tips' ? 'No flow in the stent: occluded.' : 'No detectable flow: thrombosis, or flow below the detection limit.';
    } else if (p.kind === 'portal') {
      // A stent draws the intrahepatic branches toward it: the left branch (and with a DIPS, which leaves the bifurcation,
      // the right too) runs back toward it, often slowly, so slow reversed flow there is still a direction, not stasis.
      // The right branch probe sits between the bifurcation and a TIPS, so it flows on toward the stent, hepatopetal.
      const stent = frame?.D ? (frame.D[EI.TIPS] > 0 ? 'TIPS' : frame.D[EI.DIPS] > 0 ? 'DIPS' : null) : null;
      const branch = stent && (p.id === 'PVH_L' || p.id === 'PVH_R') ? p.id : null;
      const toStent = branch === 'PVH_R' && stent === 'TIPS' ? 1 : -1;
      if (branch && (toStent < 0 ? r.mean < -2 : r.mean > 2)) {
        dir = toStent < 0 ? 'Hepatofugal' : 'Hepatopetal'; sev = 'ok';
        pattern = pi > 0.5 ? 'Pulsatile' : pi > 0.15 ? 'Phasic' : 'Monophasic';
        note = toStent < 0 ? NOTE_BACK[stent] : 'Expected with a TIPS: the segment before the stent flows hepatopetal into it; beyond the stent the right branches are hepatofugal.';
        return say(dir, sev, pattern, note, pi, true);
      }
      if (!reverses && (j.none || j.stasis)) { dir = 'Stasis'; sev = 'danger'; }
      else if (reverses && Math.abs(r.mean) < swing * 0.35) { dir = 'To-and-fro'; sev = 'danger'; }
      else if (r.mean < 0) { dir = 'Hepatofugal'; sev = 'critical'; }
      else { dir = 'Hepatopetal'; sev = j.slow ? 'caution' : 'ok'; }
      pattern = pi > 0.5 ? 'Pulsatile' : pi > 0.15 ? 'Phasic' : 'Monophasic';
      note = dir === 'Hepatofugal' ? 'Hepatofugal flow: portal blood exits through portosystemic collaterals.'
        : dir === 'To-and-fro' ? 'Bidirectional flow each cycle, preceding flow reversal.'
        : dir === 'Stasis' ? 'Near-zero net flow: stasis predisposes to portal vein thrombosis.'
        : pattern === 'Pulsatile' ? 'A pulsatile portal vein suggests transmitted right heart pressure (heart failure, tricuspid regurgitation) or an arterioportal shunt.'
        : j.slow ? (stent ? NOTE_SLOW[stent] : 'Hepatopetal but slow: typical of portal hypertension.')
        : pattern === 'Monophasic' ? 'Normal: hepatopetal, continuous.'
        : 'Normal: hepatopetal with mild phasicity.';
      // Flow toward the liver in a branch that a working stent would reverse: the stent no longer draws it, as when it narrows.
      if (branch && dir === 'Hepatopetal') { sev = 'caution'; note = NOTE_NOT_EXPECTED[stent]; }
    } else if (p.kind === 'hepatic') {
      dir = r.mean < 0 ? 'Reversed' : 'Toward the heart'; sev = r.mean < 0 ? 'danger' : 'ok';
      // A reversal over 15 cm/s and 0.4 of the forward peak is more than the a-wave: tricuspid regurgitation or a high atrium.
      const backflow = -r.vminMean > 15 && -r.vminMean > 0.4 * r.vmaxMean;
      pattern = backflow ? 'Large reversal' : r.vminMean < -1 ? 'Triphasic' : pi > 0.3 ? 'Biphasic' : 'Monophasic';
      if (pattern === 'Monophasic') sev = sev === 'ok' ? 'caution' : sev;
      if (backflow) sev = 'danger';
      note = backflow ? 'A large retrograde wave toward the liver with each beat: tricuspid regurgitation or elevated right atrial pressure.'
        : pattern === 'Triphasic' ? 'Normal: the atrial a-wave briefly reverses flow each beat.'
        : pattern === 'Biphasic' ? 'Damped: the a-wave no longer reverses flow.'
        : 'Flat: reduced hepatic compliance (cirrhosis) or outflow resistance damps the cardiac waveform.';
    } else if (p.kind === 'artery') {
      dir = r.mean < 0 ? 'Reversed' : 'Antegrade'; sev = r.mean < 0 ? 'danger' : 'ok';
      const ri = r.vmax > 0.5 ? (r.vmax - Math.max(0, r.vmin)) / r.vmax : 0;
      pattern = RI_TEXT[Math.max(0, Math.min(100, Math.round(ri * 100)))];
      note = 'The hepatic artery buffers falling portal inflow by dilating (the hepatic arterial buffer response).';
    } else if (p.kind === 'tips') {
      // (Judged on the shown numbers when there are some: the strip's steady reading at the gate and the three segment tiles, each rounded as
      // it is printed. Without them (no reading shown yet), the 3 s mean, as before.)
      const shown = seen && Number.isFinite(seen.gated) && Number.isFinite(seen.open);
      const m = shown ? seen.gated : r.mean, jsS = shown ? judgeFlow(m, null, normal, OPT_STENT) : js;
      dir = jsS.none ? 'No flow' : m < 0 ? 'Reversed' : p.id === 'DIPS' ? 'Portal → IVC' : 'Portal → hepatic vein'; sev = jsS.none || m < 0 ? 'critical' : jsS.slow || jsS.fast ? 'caution' : 'ok';
      const sr = stentReads(shown ? seen.open : open);
      const jet = shown ? Math.max(Math.round(Math.abs(m)), Math.round(sr[0]), Math.round(sr[1]), Math.round(sr[2])) : Math.max(a, sr[0], sr[1], sr[2]);   // the fastest segment: a narrowing's jet
      const hiV = normal[1];   // (the stent's ceiling: its probe's normal, from the one table of them, velNormal.js PROBE_NORMAL)
      pattern = jsS.none ? 'Occluded' : jsS.slow ? (jet > hiV ? 'Low velocity, jet' : 'Low velocity') : jet > hiV ? 'High velocity' : 'Patent';
      if (sev === 'ok' && jet > hiV) sev = 'caution';
      note = jsS.none ? 'No flow in the stent: occluded.' : p.rangeNote;
    } else if (p.kind === 'ivc') {
      dir = r.mean < 0 ? 'Reversed' : 'Toward the heart'; sev = r.mean < 0 ? 'danger' : 'ok';
      pattern = r.vminMean < -1 ? 'Phasic, with reversal' : pi > 0.3 ? 'Phasic' : 'Continuous';
      note = 'The IVC follows the right atrium: respiratory and cardiac phasicity.';
    } else {
      dir = j.none ? 'No flow' : r.mean > 0 ? 'Portal → systemic' : 'Systemic → portal'; sev = j.none ? 'ok' : 'caution';
      // (A collateral with no flow reads "No flow · No signal", as a clotted vein does: Mohammad, 10 Nov 2026, the glued varix's card.)
      pattern = j.none ? 'No signal' : 'Open collateral';
      note = j.none ? 'This collateral carries no flow.' : 'Portal blood is bypassing the liver through this collateral.';
    }
    return say(dir, sev, pattern, note, pi, false);
  }
  const say = (dir, sev, pattern, note, pi, expected) => { const o = IT; o.dir = dir; o.sev = sev; o.pattern = pattern; o.note = note; o.pi = pi; o.expected = expected; return o; };

  // A tile value: the number, with its unit small beside it.
  function setStat(dd, v, unit = '') {
    if (dd._v === v && dd._u === unit) return;
    dd._v = v; dd._u = unit; wSet(dd, v, unit);
  }

  // Place the normal band and the current mean on one scale: 0 to ~1.7x the top of the usual range, widened
  // when the mean falls outside (reversed flow reaches below zero). The marker eases there with CSS.
  // (expected: a reading the stent explains, as a branch running back toward a TIPS, is not flagged out of range.)
  // (The last reading of the gauge, kept as three values for the track's resize to draw it again; its scale's ends, for pos.)
  let gaugeP = null, gaugeMean = 0, gaugeExpected = false, gaugeLo = 0, gaugeHi = 1;
  const pos = (v) => Math.max(0, Math.min(100, (v - gaugeLo) / (gaugeHi - gaugeLo) * 100));
  function updateGauge(p, mean, expected = false) {
    gaugeP = p; gaugeMean = mean; gaugeExpected = expected;
    const normal = normalOf(p);
    showStat(statEls.Speed.wrap, !!normal);
    if (!normal) { propSoon(rangeEl, 'hidden', true); dataSoon(velEl, 'out', 'false'); return; }
    // (A range with no ceiling, the portal vein with a stent in, runs its band to the gauge's end and names only its floor.)
    const n0 = normal[0], n1 = normal[1], open = !Number.isFinite(n1);
    gaugeHi = Math.max(Math.round((open ? 2 * n0 : n1) * 1.7), Math.ceil(mean * 1.1));
    gaugeLo = Math.min(0, Math.floor(mean * 1.1));
    propSoon(rangeEl, 'hidden', false);
    const outNow = !expected && (mean < n0 || mean > n1) ? 'true' : 'false';
    dataSoon(rangeEl, 'out', outNow); dataSoon(velEl, 'out', outNow); dataSoon(statEls.Speed.wrap, 'out', outNow);
    // (The gauge's numbers are kept, and its transforms, words and title written from them in a task of their own straight after the
    // frame, once however many readings came: no style or string made inside a frame.)
    gaugeN0 = n0; gaugeN1 = n1; gaugeOpen = open; gaugeP0 = pos(n0); gaugeP1 = pos(n1); gaugePm = pos(mean); gaugePz = pos(0);
    propSoon(gHi, 'hidden', open);
    dataSoon(gLo, 'u', open ? 'cm/s' : '');
    if (!gaugeDue) { gaugeDue = true; runSoon(gaugeWrite); }
  }
  let gaugeN0 = 0, gaugeN1 = 0, gaugeOpen = false, gaugeP0 = 0, gaugeP1 = 0, gaugePm = 0, gaugePz = 0, gaugeDue = false;
  function gaugeWrite() {
    gaugeDue = false;
    // (by transform: the track and ticks are containers, so 1cqw is a hundredth of their width; the browser eases them on the compositor)
    const sw = Math.max(0.001, (gaugeP1 - gaugeP0) / 100);
    // (the middle runs between the ends' centres, 4 px in from each: its share of the track less the two half ends)
    const kMid = trackW > 8 ? Math.max(0, (sw * trackW - 8) / (trackW - 8)) : sw;
    bandMid.style.translate = `${gaugeP0}cqw 0`; bandMid.style.scale = `${kMid.toFixed(4)} 1`;
    bandL.style.translate = `${gaugeP0}cqw 0`; bandR.style.translate = `calc(${gaugeP1}cqw - 8px) 0`;
    markEl.style.translate = `${gaugePm}cqw 0`;
    gZero.style.translate = `${gaugePz}cqw 0`; gLo.style.translate = `${gaugeP0}cqw 0`; gHi.style.translate = `${gaugeP1}cqw 0`;
    // (Each tick's number is centred on its point and the unit hangs after it: "40 cm/s" pulled left to fit put its 40 about
    // 5 cm/s short of the band's end.)
    set2(gLo, String(gaugeN0)); set2(gHi, gaugeOpen ? '' : String(gaugeN1));
    rangeEl.title = gaugeOpen ? `Usual ≥${gaugeN0} cm/s` : `Usual ${gaugeN0}–${gaugeN1} cm/s`;
    statEls.Speed.wrap.title = rangeEl.title;
  }
  // A slide's own state (its fingerprint's network, presenter dataTo → tools.pin): the probed vessel's velocity as the scanner reads it.
  let pinAt = null;
  const PIN_IN = { Q: null, D: null };   // (the slide's flows and widths, handed to dopplerVel as a frame is)
  function pin(fp) { pinAt = fp?.at || null; }
  function pinnedVel() {
    const k = EI[probe];
    if (!pinAt || k == null) return NaN;
    PIN_IN.Q = pinAt.Q; PIN_IN.D = pinAt.D;
    return Math.abs(dopplerVel(PIN_IN, k));
  }
  const set2 = (e, t) => wSet(e, t, e.dataset.u || '');

  // The running mean behind a slide's reading: eases toward the 3 s mean over about six seconds (about a second and a half after a clear
  // change, a what-if or a new disease state), and starts again on a new vessel or after a gap.
  const steady = { probe: null, v: 0, t: 0, n: 0 };
  const velShown = createFollow({ small: 0.05, eps: 0.02 });
  let velProbe = null, velShownAt = 0;
  function steadyMean(x) {
    const now = performance.now(), dt = (now - steady.t) / 1000;
    if (steady.probe !== probe || dt > 1.5 || !Number.isFinite(steady.v)) { steady.probe = probe; steady.v = x; steady.n = 1; }
    else if (dt > 0) {
      const far = Math.abs(x - steady.v) > 0.25 * Math.max(Math.abs(x), 4);   // (a clear change: the number follows it)
      steady.n++;
      steady.v += (x - steady.v) * (far ? 1 - Math.exp(-dt / 1.5) : Math.max(1 / steady.n, 1 - Math.exp(-dt / 6)));   // (a plain average until the time constant has passed: the first moments do not set it)
    }
    steady.t = now;
    return steady.v;
  }
  // Which tiles a vessel has: a stent its three segments in place of trough and pulsatility; the main portal vein its congestion index;
  // the hepatic veins and the IVC no pulsatility (no such index: their swing passes zero). The speed tile follows the vessel's range (showRange).
  const isStentKind = (p) => p.kind === 'tips';
  function showTiles(p) {
    const isStent = isStentKind(p);
    showStat(statEls.CI.wrap, probe === 'PV_TRUNK');
    showStat(statEls.Trough.wrap, !isStent); showStat(statEls.Pulsatility.wrap, !isStent && p.kind !== 'hepatic' && p.kind !== 'ivc');
    for (let i = 0; i < SEGS.length; i++) showStat(statEls[SEGS[i][1]].wrap, isStent);
  }
  function updateReport() {
    const r = reading();
    if (!r) {
      setDir(frame?.clock === 'disease' ? 'Not available during time lapse' : 'Acquiring…'); dataSoon(dirEl, 'sev', '');
      propSoon(rangeEl, 'hidden', true); dataSoon(velEl, 'out', 'false'); propSoon(velEl, 'hidden', false);
      if (wText(velEl.firstChild)) wSet(velEl.firstChild, '—');
      if (wText(patternEl)) wSet(patternEl, '');
      swapText(noteEl, '');
      for (const k in statEls) setStat(statEls[k].dd, '—');
      // (While it acquires, the vessel's own tiles already, each reading "—": before 13 Nov 2026 every tile showed until the first reading,
      // the stent's Proximal, Mid and Distal and the portal vein's CI under a hepatic artery among them.)
      showTiles(meta());
      return;
    }
    const p = meta();
    const set = wSet;
    // (In a slide's top strip the reading is signed as the trace is drawn, the scanner's way: a hepatic vein's forward flow runs away from the
    // probe, below the baseline, so it reads "−18 · Toward the heart", and the sign, the words and the drawing agree.)
    // (And steady: the 3 s mean swings a few percent with the beat and breath, so a slide's strip, and the callout that copies it, read a
    // slow running mean of it, the same number at any moment of the slide on any screen.)
    let mean = ovOn ? steadyMean(r.mean) : r.mean;
    // (While it agrees, the slide's own velocity in this vessel, as its tiles and callouts read the slide: one number on every screen.)
    const fixed = ovOn ? pinnedVel() : NaN;
    if (Number.isFinite(fixed) && Math.abs(Math.abs(mean) - fixed) < Math.max(4, fixed * 0.12)) mean = (mean < 0 ? -1 : 1) * fixed;
    // (A stent reads at its gate: the segment holding a narrowing runs faster than the open stent around it.)
    const open = Math.abs(mean);
    gf = gateFactor(); mean *= gf;
    // (The reading and its gauge glide on the shown state's filter, display-state.js, premium-feel R4, as the bar's numbers do; a new
    // vessel, a paused model or a jump of the model shows the new reading at once.)
    { const t = performance.now(), dt = velShownAt && velShown.moving ? Math.min(0.1, Math.max(0, (t - velShownAt) / 1000)) : 0; velShownAt = t; mean = velShown.step(mean, dt, velProbe !== probe || !frame?.running); velProbe = probe; }
    const drawn = ovOn ? mean * pol() : mean;
    // (The words after the number: a stent is judged on the reading it shows, SEEN.)
    SEEN.gated = mean; SEEN.open = open;
    const it = interpret(r, gf, SEEN);
    setDir(it.dir); dataSoon(dirEl, 'sev', it.sev);
    set(velEl.firstChild, num(drawn, Math.abs(drawn) < 10 ? 1 : 0));
    // (No flow, as in an occluded stent or a clotted vein: the words say it, "No flow · No signal", with no "0.0 cm/s" beside them,
    // and the figure's callout says "No flow" too.)
    const none = it.dir === 'No flow';
    propSoon(velEl, 'hidden', none);
    // (open: the open stent's velocity, from which the figure's callouts at a stent's three points read what its tiles read.)
    const sv = SHOWN.get(probe) || SHOWN.get(PROBES[0].id);
    sv.v = Math.abs(mean); sv.t = performance.now(); sv.seg = isStentProbe() ? gateOf() : null; sv.open = open;
    shownVel.set(probe, sv);
    setStat(statEls.Speed.dd, num(drawn, Math.abs(drawn) < 10 ? 1 : 0), 'cm/s');
    updateGauge(p, mean, it.expected);   // (the headline's own number: the marker read 23.5 under a headline of 22, sweep batch 04, shot 12)
    patFull = it.pattern || ''; set(patternEl, STEPS[stripStep][2] ? shortPat(patFull) : patFull);
    // peak: the extreme farthest from zero, whichever the direction
    const big = Math.abs(r.vmax) >= Math.abs(r.vmin), pk = big ? r.vmax : r.vmin, tr = big ? r.vmin : r.vmax;
    setStat(statEls.Peak.dd, num(pk * gf), 'cm/s');   // (a stent's peak at its gate)
    setStat(statEls.Trough.dd, num(tr * gf), 'cm/s');
    // Pulsatility: a vein's is the portal convention, (max − min) / max (it.pi). An artery's is Gosling's index, (peak − trough) / mean: the
    // other one is the resistive index the strip already prints (Mohammad, 13 Nov 2026, "Pulsatility 0.73" beside "Resistive index 0.73").
    // The hepatic veins and the IVC have no such index (their swing passes zero, so the ratio ran past 1): their tile is hidden, the pattern says it.
    const piV = p.kind === 'artery' ? (Math.abs(r.mean) > 0.5 ? (r.vmax - r.vmin) / Math.abs(r.mean) : 0) : it.pi;
    setStat(statEls.Pulsatility.dd, fmt(piV, 2));
    // Congestion index (portal vein): cross-sectional area / mean velocity, about 0.07 cm·s in health, over 0.1 suggests portal hypertension
    const isPV = probe === 'PV_TRUNK';
    showStat(statEls.CI.wrap, isPV);
    if (isPV && frame) {
      const D = Math.max(0.5, frame.D[EI[probe]]) / 10, area = Math.PI * D * D / 4;
      const vm = Math.abs(r.mean) / dopplerK(EDGES[EI[probe]]);   // Moriyasu's index uses the mean across the lumen
      // (The number alone, on every screen (Mohammad, 13 Nov 2026): on a phone's one row of tiles "0.07 cm·s" (about 69 px) never fit a
      // 60 px tile and was not drawn (gl-words draws only words that fit whole); the tile's name, CI, already means cm·s.)
      vm > 0.3 ? setStat(statEls.CI.dd, fmt(area / vm, 2)) : setStat(statEls.CI.dd, '—');
    }
    // A stent: velocity at its portal end, middle and hepatic vein end, in place of trough and pulsatility.
    const isStent = p.kind === 'tips';
    showTiles(p);
    if (isStent) {
      // Each segment against the stent's usual range (90–190 cm/s, p.normal), the gated one marked.
      const at = gateOf(), reads = stentReads(open);
      for (let i = 0; i < SEGS.length; i++) {
        const seg = SEGS[i][0], name = SEGS[i][1], v = reads[i], w = statEls[name].wrap, here = seg === at;
        setStat(statEls[name].dd, num(v), 'cm/s');
        dataSoon(w, 'out', v < p.normal[0] || v > p.normal[1]);
        classSoon(w, 'on', here);
        const b = statEls[name].btn;
        if (b) {
          // (its words are made between frames, when the tile's reading changes: segLabel reads the tile's kept number)
          b._v = v; b._here = here;
          attrSoon(b, 'aria-pressed', here);
          if (b._ariaV !== v || b._ariaHere !== here) { b._ariaV = v; b._ariaHere = here; runSoon(b._label); }
        }
      }
    }
    swapText(noteEl, it.note);   // (the vessel's note crossfades when the reading's story changes)
    ariaDir = it.dir; ariaMean = r.mean; ariaPattern = it.pattern;
    if (!ariaDue) { ariaDue = true; runSoon(ariaWrite); }
  }
  // (The canvas's spoken summary is made between frames from the last reading's kept values, once however many readings came.)
  let ariaDir = '', ariaMean = 0, ariaPattern = '', ariaDue = false;
  function ariaWrite() {
    ariaDue = false;
    attrSoon(cv, 'aria-label', `Spectral Doppler, ${EDGES[EI[probe]].label}, ${sweepSeconds}-second sweep: ${ariaDir}, ${num(ariaMean, 0)} centimeters per second, ${ariaPattern}.`);
  }

  // ── Display ───────────────────────────────────────
  // Drawn as a scanner draws it. Each spectral line (one column of device pixels) is synthesised
  // once, when its moment reaches the right edge, and written into a ring buffer; every screen
  // frame then only copies the ring to the canvas. The model sends samples about ten times a
  // second, so the display runs on its own clock a fraction of a second behind the newest sample
  // and scrolls at the screen's frame rate instead of jumping ten pixels at a time.
  //
  // A line holds the spectrum with its own grain, as on a scanner: the velocities in the sample
  // volume times speckle (exponential power, smooth over a frequency bin and shared in part with
  // the previous line, as overlapping FFT windows do), log-compressed into grey. Written once, the
  // grain scrolls with the trace and never flickers. Only a faint noise floor is a separate layer
  // fixed to the screen, shimmering slowly in place, cleared at the baseline by the wall filter.
  let scale = null;     // velocity half-range (cm/s)
  let fixed = null;     // a slide's fixed scale: { nyq (cm/s), base (0–1 from the top) }, or null to fit the signal
  let baseF = null;     // baseline position (fraction of height)
  let settleAt = 0;     // when the signal last fitted the current scale
  // A live change settling (a what-if slider moving, a compare button, a change in Patients): the scale and baseline hold
  // still until the model has settled, then fit what it shows since, in one change (Mohammad, 20 Oct: "let it settle before
  // changing the Doppler"). heldTo: the record's time when the model last said it was settling; refit: a hold has ended.
  let heldTo = null, refit = false;
  const HOLD_AFTER = SETTLE;   // s of the settled signal recorded before the scale fits it (and the reading reads only it)
  let tDisp = null;     // the display clock (model seconds)
  let wallLast = 0;
  let ovLast = '', ovAt = 0, ovOn = false, ovTop = 26;   // the report in the top strip (see draw)
  const TB = [0, 0, 0, 0];
  const GEO = { RW: 0, RH: 0, rBase: 0, rPxPerV: 0, cps: 0, binPx: 0, spkPx: 0, spkMix: 0, pol: 0, k: 0, span: 0, topV: 0, botV: 0 };   // (the spectrum's geometry for a frame, written in place)
  const SYN = { rBase: 0, rPxPerV: 0, fade: 0, wfV: 0, spkPx: 0, spkMix: 0, span: 0, uK: 0, mode: 0 };   // (the spectrum shader's geometry for a frame, written in place)
  let synthed = false, ringW = 0, ringH = 0;   // (whether the GPU wrote the ring's lines, and the ring's size there)
  const RENDER = { W: 0, H: 0, dx: 0, dy: 0, RW: 0, RH: 0, p: 0, nx: 0, ny: 0, noiseA: 0, base: 0, wf: 0, nBin: 2, nRun: 1 };
  const FS_ST = { scale: null, baseF: null, settleAt: 0, refit: false }, FS_IN = { fixed: null, holding: false, fits: false, target: 0, tbF: 0, tNow: 0 };   // (fitScale's state and input, written in place)
  let noiseAt = 0, nx = 0, ny = 0, traceBox = null;
  // (What the ring was written for: its size, and the scale, baseline, vessel, sign, window and mode behind it; ok false forgets it.)
  const RK = { ok: false, RW: 0, RH: 0, scale: null, baseF: null, probe: null, sgn: 0, sweep: 0, mode: '' };
  const restSame = (sgn) => RK.scale === scale && RK.baseF === baseF && RK.probe === probe && RK.sgn === sgn && RK.sweep === sweepSeconds && RK.mode === mode;
  const ringSet = (RW, RH, sgn) => { RK.ok = true; RK.RW = RW; RK.RH = RH; RK.scale = scale; RK.baseF = baseF; RK.probe = probe; RK.sgn = sgn; RK.sweep = sweepSeconds; RK.mode = mode; };
  let lastCol = null, jit = 0, lineGain = 0;
  // (backTo: the record's first time before a backfill put the history in front of it. The lines drawn for times before it were drawn with no
  // sample, black; the next frame draws those columns again from the history, and the lines the monitor recorded itself stay as they are.)
  let backTo = null;
  const live = () => !!frame?.running;

  // Model time shown at the right edge. Follows the samples by ~0.16 s of wall time so there is
  // always data to draw, and eases back to that lag instead of jumping when frames come unevenly.
  function clockNow(now) {
    const tLast = buf[buf.length - 1][0];
    const dt = wallLast ? Math.min(0.1, (now - wallLast) / 1000) : 0;
    wallLast = now;
    const speed = frame?.clock === 'disease' ? 1 : (frame?.speed || 1);
    const target = tLast - 0.16 * speed;
    if (tDisp == null || Math.abs(target - tDisp) > 1.2 * speed) tDisp = live() ? target : tLast;
    else if (live()) { tDisp += dt * speed; tDisp += (target - tDisp) * Math.min(1, dt * 2.5); }
    return tDisp = Math.min(tDisp, tLast);
  }

  // Mean velocity at time t (NaN outside the record); binary search, the record is sorted.
  function velAt(t, g) {
    const n = buf.length;
    if (t < buf[0][0] || t > buf[n - 1][0]) return NaN;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (buf[m][0] <= t) lo = m; else hi = m; }
    const [ta, va] = buf[lo], [tb, vb] = buf[hi];
    return g.pol * gf * (tb > ta ? va + (vb - va) * clamp((t - ta) / (tb - ta), 0, 1) : va);
  }

  // The noise floor is worked out by the GPU's fragment shader (doppler-gl.js floorAt): exponential power, independent from one line to the next
  // and smooth over a few frequency bins, shown at a new random offset about ten times a second, cleared at the baseline by the wall filter.

  const rn = () => Math.random() + Math.random() + Math.random() - 1.5;
  // Spectral line c's numbers, handed to the drawer for ring column x; its pixels are written there, on the GPU (doppler-synth.js, the only
  // place the spectrum is made: there is no CPU copy). The grain's draws are made by the shader, so none is made here.
  // Every vessel is drawn in the main portal vein's way (the owner's standing rule): the band fills from the baseline up to the peak
  // (doppler-synth.js lineBand, which takes no vessel kind), brightest just under the outline; an artery, a TIPS or a DIPS differs only in its
  // velocities and waveform. Each line is its own estimate: its top reaches a little further or less far (jit), and the whole line is a little
  // brighter or dimmer (lineGain), so the outline is jagged and the band shimmers in time (held in the ring, so it scrolls with the trace).
  const BAND = { P: 0, L: 0, sigHi: 0, sigLo: 0 };   // (a line's band, written in place)
  // Lines c0 … c1 (at most the ring's width) worked out and drawn into their ring columns, on the GPU, in one or two draws.
  function synthCols(c0, c1, g) {
    const RW = g.RW;
    for (let c = c0; c <= c1; c++) lineParams(c, g);
    const x0 = ((c0 % RW) + RW) % RW, n = c1 - c0 + 1;
    if (x0 + n <= RW) gpu.synth(x0, n, SYN);
    else { gpu.synth(x0, RW - x0, SYN); gpu.synth(0, x0 + n - RW, SYN); }
  }
  function lineParams(c, g) {
    const x = ((c % g.RW) + g.RW) % g.RW;
    const v = velAt(c / g.cps, g);
    const has = !Number.isNaN(v), av = Math.abs(v), s = v < 0 ? -1 : 1;
    jit = 0.45 * jit + rn(); lineGain = 0.5 * lineGain + rn();
    const cn = c & 0xFFFFF;
    if (!has || av <= 0.3) { gpu.setCol(x, 0, 0, 1, 1, 1, 0, 0, cn); return; }
    const b = lineBand(av, g.k, jit, BAND), P = b.P;
    let lineS = 0;
    if (mode !== 'spectrum') {
      const vp = velAt(c / g.cps - 0.3, g);
      lineS = (Number.isNaN(vp) ? 0 : Math.abs(v - vp) / (0.45 * scale)) + 0.5 * clamp((av - 80) / 120, 0, 1);
    }
    const wraps = g.span > 0 && P > (s > 0 ? g.topV : g.botV);
    gpu.setCol(x, P, b.L, b.sigHi, b.sigLo, 10 ** (0.12 * lineGain), lineS, 1 + (wraps ? 2 : 0) + (s < 0 ? 4 : 0), cn);
  }
  // The top strip fits its words by fixed steps, never by cutting or dropping one: the type at full size, then at 0.9 and 0.8 (the gaps
  // and type scale together, --dop-k; one line in smaller type before two, Mohammad 19 Oct), then the pattern ("High velocity") on a line of its own under the reading, whole, and only
  // when even that does not fit the direction's short form (clinical shorthand, "PV → HV"): the direction is read in full
  // wherever a second line makes room for it (Review 16 Oct: "PV → HV · Patent" on a Mac slide). The card and monitor keep their size; the trace starts under
  // the strip. The step is chosen once per width and vessel for the widest words that vessel can show (its longest reading,
  // direction and pattern), so the strip holds still while they change: "Phasic" turning "Monophasic" moved the whole line
  // (Mohammad, 19 Oct). The number keeps a slot as wide as its widest reading, so a changing value never shoves the words.
  // Only words wider than all of those (a time-lapse notice) take a smaller step, and only while they show.
  // (The words each kind of vessel can show, as interpret() writes them; "No flow · No signal" for any of them.)
  const STRIP_WORDS = {
    portal: [['Hepatopetal', 'Hepatofugal', 'Stasis', 'To-and-fro'], ['Pulsatile', 'Phasic', 'Monophasic'], 2],
    hepatic: [['Toward the heart', 'Reversed'], ['Large reversal', 'Triphasic', 'Biphasic', 'Monophasic'], 2],
    ivc: [['Toward the heart', 'Reversed'], ['Phasic, with reversal', 'Phasic', 'Continuous'], 2],
    artery: [['Antegrade', 'Reversed'], ['Resistive index 0.00'], 3],
    tips: [['Portal → hepatic vein', 'Portal → IVC', 'Reversed'], ['Occluded', 'Low velocity, jet', 'Low velocity', 'High velocity', 'Patent'], 3],
    collateral: [['Portal → systemic', 'Systemic → portal'], ['No signal', 'Open collateral'], 2],
  };
  function stripWords() {
    const [dirs, pats, digits] = STRIP_WORDS[meta().kind] || STRIP_WORDS.portal;
    // (the reading in tabular digits: "−00", and "−0.0" under 10; a stent or the artery reads up to "000", reversed only slowly)
    return { dirs: [...dirs, 'No flow'], pats: [...pats, 'No signal'], vels: [MINUS + '0.0', MINUS + '00', ...(digits > 2 ? ['000'] : [])] };
  }
  function setDir(t) {
    dirFull = t;
    const s = STEPS[stripStep][1] ? SHORT_DIR[t] || t : t;
    wSet(dirEl, s);
  }
  // (the pattern's short form; a resistive index keeps its own number)
  for (let i = 0; i <= 100; i++) SHORT_PAT[RI_TEXT[i]] = RI_TEXT[i].replace('Resistive index', 'RI');   // (each resistive index keeps its own number)
  const shortPat = (t) => SHORT_PAT[t] || t;
  function stripStepSet(i) {
    const [k, short, tight] = STEPS[i];
    stripStep = i;
    if (report.style.getPropertyValue('--dop-k') !== String(k)) report.style.setProperty('--dop-k', String(k));
    report.classList.toggle('dop-nounit', tight > 1);
    const ps = tight ? shortPat(patFull) : patFull;
    if (patFull && wText(patternEl) !== ps) wNow(patternEl, ps);
    const s = short ? SHORT_DIR[dirFull] || dirFull : dirFull;
    if (wText(dirEl) !== s) wNow(dirEl, s);
  }
  function stripFits(i, have, spare) {
    const box = (e) => { if (e.hidden || !e.textContent) return null; const q = wordsRect(e, rng); return q.width ? q : null; };
    const v = box(velEl), d = box(dirEl), p = box(patternEl), line = [v, d, p].filter(Boolean);
    if (!line.length) return true;
    // (the union of the line's words, the dot before the pattern included; 14 px for its end, which Safari's ranges leave out)
    const w = Math.max(...line.map((q) => q.right)) - Math.min(...line.map((q) => q.left)) + (p ? 14 : 0);
    return w + spare <= have;
  }
  // Puts the widest of some words in an element (measured at the current step) and gives back that word.
  function widest(e, words, map = (t) => t) {
    let best = '', bw = -1;
    for (const t of words) { wNow(e, map(t)); const q = wordsRect(e, rng).width; if (q > bw) { bw = q; best = map(t); } }
    wNow(e, best);
    return { text: best, width: bw };
  }
  // (stripFit: the width, type sizes and vessel kind the base step was chosen for; stripKey, read by draw(), changes with the step.)
  let stripFit = '', stripFull = 0, stripBase = 0, stripHave = 0, stripSc = 1, stripWordsKey = '';
  const stripSteps = new Map();   // (the step each shape of the words took, for this fit)
  function fitStrip() {
    const velB = velEl.firstChild;
    const key = `${ro ? repW : report.clientWidth}|${ro ? cvW : cv.clientWidth}|${stripType}|${meta().kind}`;
    if (key !== stripFit) {
      // (the room is the monitor picture's, 12 px in from its right edge, where the report is wider than it: a phone held sideways)
      const cs = getComputedStyle(report), rr = report.getBoundingClientRect(), br = cv.getBoundingClientRect();
      const sc = rr.width / (report.offsetWidth || 1) || 1;   // (screen px per layout px: a card still easing in is scaled)
      const have = Math.min(report.clientWidth - parseFloat(cs.paddingRight), (br.right - rr.left) / sc - 12) - parseFloat(cs.paddingLeft);
      rng ||= document.createRange();
      if (have <= 0) return;
      stripFit = key;
      // The first step that holds the widest words, measured in place; the shown words are put back after.
      const was = { v: wText(velB), p: wText(patternEl), vh: velEl.hidden, ph: patternEl.hidden }, words = stripWords();
      velEl.hidden = false; patternEl.hidden = false; velB.style.minWidth = '';
      let base = STEPS.length - 1;
      for (let i = 0; i < STEPS.length; i++) {
        stripStepSet(i);
        widest(velB, words.vels); widest(dirEl, words.dirs, (t) => (STEPS[i][1] ? SHORT_DIR[t] || t : t)); widest(patternEl, words.pats, (t) => (STEPS[i][2] ? shortPat(t) : t));
        if (stripFits(i, have * sc, 0)) { base = i; break; }
      }
      stripStepSet(base);
      // (and the strip's height with them, which the trace starts under whatever the words: a pattern that comes after "Acquiring…")
      stripFull = Math.ceil(stripRect().bottom - cv.getBoundingClientRect().top) + 4;
      // (the number's slot, in em of its own type so it scales with any step: as wide as the widest reading)
      const slot = widest(velB, words.vels).width / sc / (parseFloat(getComputedStyle(velB).fontSize) || 1);
      velB.style.minWidth = `${Math.ceil(slot * 100) / 100}em`;
      wNow(velB, was.v); wNow(patternEl, was.p); velEl.hidden = was.vh; patternEl.hidden = was.ph;
      stripBase = base; stripHave = have; stripSc = sc; stripWordsKey = ''; stripSteps.clear();
    }
    // The words shown now: the base step holds them, unless they are wider than any reading (a notice), which take the
    // first smaller step that does, and give it back once they are gone.
    const wk = `${velEl.hidden ? '' : wText(velB)}|${dirFull}|${patFull}`;
    if (wk === stripWordsKey) return;
    stripWordsKey = wk;
    if (patternEl.hidden) patternEl.hidden = false;
    // (The step is remembered by the words' shape: the reading's digits are tabular, so −18 and −23 are the same width to the
    // pixel, and a new number measured the three words again, a forced layout on most model frames of a slide.)
    const shape = `${velEl.hidden ? '' : wText(velB).replace(/\d/g, '0')}|${dirFull}|${patFull}`;
    let i = stripSteps.get(shape);
    if (i == null) {
      for (i = stripBase; i < STEPS.length - 1; i++) { stripStepSet(i); if (stripFits(i, stripHave * stripSc, 0)) break; }
      stripSteps.set(shape, i);
    }
    stripStepSet(i);
    stripKey = `${stripFit}#${i}`;
  }

  // The strip's own words (the reading, direction and pattern), measured together: a phone's Tests card keeps the gauge and tiles
  // in the same box under the monitor, so the box itself is not the strip.
  function stripRect() {
    let l = Infinity, r = -Infinity, b = -Infinity;
    for (const e of [velEl, dirEl, patternEl]) {
      const q = wordsRect(e, rng);
      if (!q.width) continue;
      l = Math.min(l, q.left); r = Math.max(r, q.right); b = Math.max(b, e.getBoundingClientRect().bottom);
    }
    return { width: r > l ? r - l + (wText(patternEl) && !patternEl.hidden ? 14 : 0) : 0, bottom: b };
  }

  // The strip laid out from the page as it stands just after a frame (see drawWith): its type, its fit, its height; the trace's window
  // picked on its showing. A change asks for a frame, which draws with it.
  let layoutSoon = 0, layW = 0, layH = 0;
  const LS = { w: 0, h: 0, vel: '', dir: null, pat: null, pick: false };   // (what the strip's layout was last asked for)
  function stripLayout() {
    layoutSoon = 0;
    if (!frame) return;
    const w = layW, hh = layH, was = `${ovTop}|${ovOn}|${stripKey}|${sweepIndex}`;
    const ovKey = `${w}x${hh}`, tOv = performance.now();
    if (ovKey !== ovLast || tOv - ovAt > 500) {
      ovAt = tOv; const cs = getComputedStyle(cv); ovOn = cs.getPropertyValue('--dop-ov').trim() === '1';
      // (the strip's type sizes, read with it: a slide's text scale can settle after the strip was fitted, which left it fitted too wide)
      if (ovOn) stripType = ['--bs', '--pz-num', '--fs-12', '--fs-14', '--fs-20'].map((v) => cs.getPropertyValue(v).trim()).join();
    }
    if (ovOn) {
      const k0 = stripKey; fitStrip();
      // (No word of the strip laid out yet gives no bottom: the strip keeps its last height. Taken as is, an infinite height made the
      // trace's image fail to build, a monitor drawn while hidden.)
      if (ovKey !== ovLast || stripKey !== k0) { rng ||= document.createRange(); const t = Math.max(Math.ceil(stripRect().bottom - cv.getBoundingClientRect().top) + 4, stripStep === stripBase ? stripFull : 0); if (Number.isFinite(t) && (ovKey !== ovLast || t > ovTop || t < ovTop - 4)) ovTop = t; }
    } else {
      ovTop = 26;
      if (stripFit) { stripStepSet(0); stripKey = stripFit = stripWordsKey = ''; stripSteps.clear(); velEl.firstChild.style.minWidth = ''; }   // (off the strip the words are always whole and full size, the number its own width)
    }
    ovLast = ovKey;
    if (pickNext) pickWindow();
    if (`${ovTop}|${ovOn}|${stripKey}|${sweepIndex}` !== was && !raf) raf = nextFrame(loop);
  }
  function draw(now = performance.now()) {
    const pen = fitPen(cv, words);
    try { drawWith(pen, now); } finally { framePart('doppler: hand over', endPen, pen.ctx); }   // (named, so ?perf says how much of the Doppler is the GPU wait)
  }
  // The velocity scale's ticks, numbers and unit, drawn from SL by the kept layer (see drawWith).
  const SL = { ver: 0, w: 0, hh: 0, scale: 0, baseY: 0, pxPerV: 0, padL: 0, padT: 0, W: 0, H: 0, ovOn: false, lw: 0, yLab: 0, i1: '', i2: '', i3: '' };
  const LAB_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  let scaleCtx = null;
  function drawScaleLayer() {
    const ctx = scaleCtx, { w, scale, baseY, pxPerV, padL, padT, W, H, ovOn, lw, yLab } = SL;
    ctx.font = FONT(500, 12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // ticks: a labelled tick every 1, 2, 5, 10, 20, 50 ... cm/s (the first that gives at most five a side), a half tick between
    // (and labels at least 18 px apart, so a short trace keeps a few readable ones rather than a stack)
    let lab = 500;
    for (let i = 0; i < LAB_STEPS.length; i++) if (scale / LAB_STEPS[i] <= 5 && LAB_STEPS[i] * pxPerV >= 18) { lab = LAB_STEPS[i]; break; }
    const minor = lab / 2;
    for (let k = -Math.ceil(scale / minor); k <= Math.ceil(scale / minor); k++) {
      const v = k * minor, y = padT + baseY - v * pxPerV;
      if (y < padT - 1 || y > padT + H + 1) continue;
      const major = k % 2 === 0;
      ctx.fillStyle = SL.i1; ctx.fillRect(padL + W + 3, Math.round(y), major ? 6 : 3, 1);
      if (major && y > padT + 5 && y < padT + H - 5) { ctx.fillStyle = SL.i2; ctx.fillText(v === 0 ? '0' : num(v), padL + W + 13, y); }
    }
    // The scale's unit: top right, or, when the reading fills the top strip, bottom right under the scale, clear of its words
    // (the bottom strip's settings stop short of the scale's margin).
    // (left out where a narrow monitor's bottom label would run into it: the strip's reading already names the unit)
    ctx.fillStyle = SL.i3; ctx.textAlign = 'right';
    if (!ovOn || padL + lw + 8 <= w - 6 - textW(ctx, 'cm/s')) ctx.fillText('cm/s', w - 6, ovOn ? yLab : 13);
  }
  function drawWith({ ctx, w, h: hh }, now) {
    labBusy = false;
    // (A box too small to hold a trace draws nothing, and so hands over a clear picture: the opaque black below was laid before the size
    // guard further down, so a box measured under 60 px for a frame, a card still laying out or easing in, was handed over as a flat black
    // rectangle at its place. 11 Nov 2026, Mohammad's iPad: "a black rectangle at the top left".)
    if (w < 60 || hh < 60) { traceBox = null; return; }
    const z = canvasSize(cv), CW = z.W, CH = z.H, dpr = CW / Math.max(1, w), onPen = ctx.onGPU === true;
    ctx.fillStyle = cssVar('--black');
    gpu?.attach(onPen ? ctx.gpu : null);   // (the drawer's context this frame is drawn in: the trace is drawn there, doppler-gl.js)
    const onGpu = !!gpu && !gpu.lost;
    // On the GPU's drawer the margins are laid black first and the trace is drawn over its rectangle, the words over both. On this canvas
    // (?tracegl=0) the margins are laid black and the trace's rectangle cleared (nothing is drawn there: the trace is the drawer's).
    if (!onPen) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (traceBox && traceBox[2] > 0 && traceBox[3] > 0 && traceBox[0] >= 0 && traceBox[1] >= 0 && traceBox[0] + traceBox[2] <= CW && traceBox[1] + traceBox[3] <= CH) {
        const bx = traceBox[0], by = traceBox[1], bw = traceBox[2], bh = traceBox[3];
        ctx.fillRect(0, 0, CW, by); ctx.fillRect(0, by + bh, CW, CH - by - bh);
        ctx.fillRect(0, by, bx, bh); ctx.fillRect(bx + bw, by, CW - bx - bw, bh);
        ctx.clearRect(bx, by, bw, bh);
      } else ctx.fillRect(0, 0, CW, CH);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else ctx.fillRect(0, 0, w, hh);
    traceBox = null;
    // On a slide's data card the report sits in the top strip (CSS sets --dop-ov on the box): the strip is as tall as the
    // report, and the vessel and settings move to the bottom strip under the second ticks. Read again when the size changes.
    // (Its height is read only when the strip was refitted or the size changed, and it gives back room only by more than 4 px.)
    // (The strip's fit, the words' type and the strip's height are worked out just after the frame, stripLayout, never inside it:
    // here only asked for, when the size, the words or half a second has moved on. The frame draws with the last fit.)
    const velNow = wText(velEl.firstChild);
    if (w !== LS.w || hh !== LS.h || velNow !== LS.vel || dirFull !== LS.dir || patFull !== LS.pat || pickNext !== LS.pick || performance.now() - ovAt > 500) {
      LS.w = w; LS.h = hh; LS.vel = velNow; LS.dir = dirFull; LS.pat = patFull; LS.pick = pickNext; layW = w; layH = hh;
      if (!layoutSoon && !document.hidden) layoutSoon = setTimeout(stripLayout, 0);   // (none while the tab is in the background: the next frame on return asks again, the size or the half second having moved on)
    }
    const padL = PAD_L, padR = PAD_R, padT = ovTop, padB = ovOn ? 34 : 20, yLab = ovOn ? hh - 11 : 13;
    // (A slide's paired trace takes a band at the foot of the trace area: the main trace is shorter by it, the card the same size.)
    const W = Math.max(1, Math.round(w - padL - padR)), Hall = Math.max(1, Math.round(hh - padT - padB)), PB = pair ? pairBand(Hall) : 0, H = PB ? Hall - PB - PAIR_GAP : Hall;
    if (w < 60 || hh < 60 || !Number.isFinite(H) || !Number.isFinite(W)) return;
    const label = probe ? probeName(meta(), isStentProbe() ? gateOf() : '') : '';
    ctx.font = FONT(600, 12); ctx.fillStyle = cssAlpha('--white', .86); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, padL, yLab);
    const lw = textW(ctx, label);
    ctx.font = FONT(500, 12); ctx.fillStyle = cssAlpha('--white', .5);
    // (The settings drop from the end, sweep first, where the strip is too narrow for all of them beside the units.)
    // (this frame's time, and the calipers' pick from it, before the strip: the index there is the marks' own, this frame)
    const tNow = buf.length >= 2 ? clockNow(now) : null;
    calNow(tNow, W);
    const pi = calText();
    let x0 = padL + lw + 12;
    if (pi) {
      ctx.font = FONT(700, 12); ctx.fillStyle = cssAlpha('--doppler', 1); ctx.fillText(pi, x0, yLab);
      x0 += textW(ctx, pi) + 12; ctx.font = FONT(500, 12); ctx.fillStyle = cssAlpha('--white', .5);
    }
    const room = w - padR - x0 - 6, settings = SETTINGS[mode === 'spectrum' ? 0 : 1][svMm()][sweepIndex];
    let np = settings.length;
    while (np > 1 && textW(ctx, settings[np - 1]) > room) np--;
    if (textW(ctx, settings[np - 1]) <= room) ctx.fillText(settings[np - 1], x0, yLab);
    if (buf.length < 2) {
      tDisp = null;
      ctx.textAlign = 'center'; ctx.fillStyle = cssAlpha('--white', .55);
      ctx.fillText(frame?.clock === 'disease' ? 'Doppler sampling needs real time: return to the seconds clock.' : 'Acquiring…', w / 2, hh / 2);
      return;
    }
    // Scale: the peak fills about 85% of its side, on the scanner's own velocity steps. Like a
    // sonographer, the display changes scale or baseline only when the signal would clip or has
    // stayed small for a few seconds, never continuously (a moving scale would smear the picture).
    let pos = 0, neg = 0;
    const sgn = pol();
    // (After a hold, only what the settled model shows: the sweep still on screen from before it would fit the scale twice.)
    const since = heldTo != null && tNow - heldTo < sweepSeconds ? heldTo : -Infinity;
    const holding = scale != null && heldTo != null && tNow - heldTo < HOLD_AFTER;
    for (const [t, v0] of buf) if (t >= Math.max(tNow - sweepSeconds, since) && t <= tNow) { const v = sgn * v0; if (v > pos) pos = v; if (-v > neg) neg = -v; }
    gf = gateFactor();
    const k = dopplerK(EDGES[EI[probe]]);
    pos *= k * gf; neg *= k * gf;
    // (The scale always holds the peak the reading beside it reports, so a −31 cm/s report never sits on a ±5 scale while new
    // samples are still reaching the window; the reading spans the last 3 s of the record, inside every sweep.)
    const rd = reading();
    if (rd) {
      const hi = rd.vmax * gf * sgn, lo = rd.vmin * gf * sgn;
      if (hi > pos) pos = hi; if (-hi > neg) neg = -hi;
      if (lo > pos) pos = lo; if (-lo > neg) neg = -lo;
    }
    const need = Math.max(pos, neg, 8) / 0.85;
    const target = scaleFor(Math.max(pos, neg));
    const tbRaw = pos + neg < 1 ? 0.5 : pos > 0 && neg < pos * 0.08 ? 0.88 : neg > 0 && pos < neg * 0.08 ? 0.12 : clamp(0.1 + 0.8 * (pos / (pos + neg)), 0.12, 0.88);
    const tbF = Math.round(tbRaw * 10) / 10;
    const fits = scale != null && need <= scale && (pos >= neg) === (baseF >= 0.5 || baseF == null);
    // (A slide's fixed scale holds still whatever the signal: the Nyquist limit either side of a centred baseline, or the slide's
    // baseline with the same span, 2 × the limit, shared out; scale is the dominant side's reach, so pxPerV is span / H.)
    FS_ST.scale = scale; FS_ST.baseF = baseF; FS_ST.settleAt = settleAt; FS_ST.refit = refit;
    FS_IN.fixed = fixed; FS_IN.holding = holding; FS_IN.fits = fits; FS_IN.target = target; FS_IN.tbF = tbF; FS_IN.tNow = tNow;
    fitScale(FS_ST, FS_IN);
    scale = FS_ST.scale; baseF = FS_ST.baseF; settleAt = FS_ST.settleAt; refit = FS_ST.refit;
    const baseY = Math.round(H * baseF);
    // the scale belongs to the dominant side; the other side shows what fits
    const pxPerV = (baseF >= 0.5 ? baseY : H - baseY) / scale;

    // Spectrum, at device resolution, newest line at the right edge.
    const RW = Math.max(1, Math.round(W * dpr)), RH = Math.max(1, Math.round(H * dpr));
    const g = GEO;
    g.RW = RW; g.RH = RH; g.rBase = baseY * dpr; g.rPxPerV = pxPerV * dpr; g.cps = RW / sweepSeconds; g.binPx = Math.max(1.5, RH / 200); g.spkPx = Math.max(2, RH / 110);
    g.spkMix = clamp(1 - 1 / dpr, 0.3, 0.65); g.pol = sgn; g.k = k;
    // (a fixed scale's span, and how far the display reaches above and below the baseline, cm/s: where the spectrum wraps)
    g.span = fixed ? H / pxPerV : 0; g.topV = baseY / pxPerV; g.botV = (H - baseY) / pxPerV;
    const cNow = Math.floor(tNow * g.cps);
    // The spectrum's lines are made on the GPU alone (doppler-synth.js), drawn into the ring texture; no picture of the ring is made on the CPU.
    // Where the GPU cannot make them (no WebGL2, a lost context, the line shader still compiling or failed) the trace is black, as it is while
    // the monitor's own program compiles, and the ring is made whole the first frame it can (the drawer asks for that frame, doppler-gl onReady).
    const gs = onGpu && gpu.canSynth();
    if (gs !== synthed) { synthed = gs; RK.ok = false; }   // (the lines could not be made for a while: the ring is made whole again)
    if (gs) {
      if (ringW !== RW || ringH !== RH) {
        const oRW = ringW, oRH = ringH;
        ringW = RW; ringH = RH;
        // Only the size changed (a card settling as it enters, the top strip refitted): the trace already drawn is stretched to the new size
        // on the GPU (doppler-gl stretch), and new lines draw in sharp.
        const lc = lastCol != null && RK.ok && RK.RW === oRW && RK.RH === oRH && restSame(sgn) ? Math.floor(lastCol * RW / oRW) : null;
        if (lc != null && cNow >= lc && cNow - lc < RW && gpu.stretch(RW, RH, ((lastCol % oRW) + oRW) % oRW, (lc + 1) % RW)) { ringSet(RW, RH, sgn); lastCol = lc; }
      }
      gpu.ringSize(RW, RH);   // (a no-op while the GPU's ring is that size; a context made again has none)
      // redraw every line after a change of scale, size or colour, or when time runs backwards
      const full = !RK.ok || RK.RW !== RW || RK.RH !== RH || !restSame(sgn) || lastCol == null || cNow < lastCol || cNow - lastCol >= RW;
      const from = full ? cNow - RW + 1 : lastCol + 1;
      // (After a backfill, the columns of the history: from the ring's oldest line up to the record's old first time, drawn again with it.)
      const hFrom = cNow - RW + 1, hTo = !full && backTo != null ? Math.min(lastCol, Math.ceil(backTo * g.cps)) : hFrom - 1;
      backTo = null;
      if (cNow >= from || hTo >= hFrom) {
        SYN.rBase = g.rBase; SYN.rPxPerV = g.rPxPerV; SYN.fade = 7 / g.rPxPerV; SYN.wfV = Math.max(1.2, 0.025 * scale); SYN.spkPx = g.spkPx; SYN.spkMix = g.spkMix;
        SYN.span = g.span; SYN.uK = 1 / (0.7 * scale); SYN.mode = mode === 'spectrum' ? 0 : mode === 'velocity' ? 1 : 2;
        if (hTo >= hFrom) synthCols(hFrom, hTo, g);
        if (cNow >= from) synthCols(from, cNow, g);
      }
      ringSet(RW, RH, sgn); lastCol = cNow;
    }
    // copy the ring out, oldest line on the left, pixel for pixel
    const p = ((cNow % RW) + RW) % RW;
    const dx = Math.round(padL * dpr), dy = Math.round(padT * dpr);
    // the noise floor, fixed to the screen: a new random view of the texture ~10 times a second
    if (now - noiseAt > 100) { noiseAt = now; nx = (Math.random() * 8192) | 0; ny = (Math.random() * 8192) | 0; }
    // the wall filter removes the noise near the baseline as well as the slow signal
    const wfPx = Math.max(1.2, 0.025 * scale) * g.rPxPerV * 1.6;
    TB[0] = dx; TB[1] = dy; TB[2] = RW; TB[3] = RH; traceBox = TB;   // (drawn whole: the next frame clears round it)
    let drawn = false;
    if (gs) {
      const R = RENDER;
      R.W = CW; R.H = CH; R.dx = dx; R.dy = dy; R.RW = RW; R.RH = RH; R.p = p; R.nx = nx; R.ny = ny; R.noiseA = mode === 'spectrum' ? 1 : 0.3; R.base = g.rBase; R.wf = wfPx; R.nBin = g.binPx * 2; R.nRun = Math.max(1, Math.round((1 + Math.max(1, dpr)) / 2));
      drawn = gpu.render(R);
    }
    if (!drawn) {
      // (no GPU picture this frame: the trace black, its ring made whole when the GPU draws again)
      if (gpu) RK.ok = false;
      // (With a GPU drawer the canvas under keeps its last picture, which is shown until the next good frame; black only with no drawer at all.)
      if (!gpu) { ctx.fillStyle = cssVar('--black'); ctx.fillRect(padL, padT, RW / dpr, RH / dpr); }
    }

    // Baseline
    ctx.fillStyle = cssAlpha('--white', .8); ctx.fillRect(padL, padT + baseY, W, 1);
    // Velocity scale on the right
    // (R16: the scale's ticks, numbers and unit kept as one GPU picture, drawn again only when the scale, the layout or the theme's
    // colours change, not built word by word every frame; ?chartkeep=0 draws them every frame.)
    // (What the layer is drawn from is kept in SL, and its signature is a counter that moves when any of it does: nothing is built to compare.)
    const ink1 = cssAlpha('--white', .55), ink2 = cssAlpha('--white', .78), ink3 = cssAlpha('--white', .5);
    if (SL.w !== w || SL.hh !== hh || SL.scale !== scale || SL.baseY !== baseY || SL.pxPerV !== pxPerV || SL.padL !== padL || SL.padT !== padT || SL.W !== W || SL.H !== H
      || SL.ovOn !== ovOn || SL.lw !== lw || SL.yLab !== yLab || SL.i1 !== ink1 || SL.i2 !== ink2 || SL.i3 !== ink3) {
      SL.w = w; SL.hh = hh; SL.scale = scale; SL.baseY = baseY; SL.pxPerV = pxPerV; SL.padL = padL; SL.padT = padT; SL.W = W; SL.H = H;
      SL.ovOn = ovOn; SL.lw = lw; SL.yLab = yLab; SL.i1 = ink1; SL.i2 = ink2; SL.i3 = ink3; SL.ver++;
    }
    scaleCtx = ctx;
    keepLayer(ctx, 'scale', SL.ver, drawScaleLayer);
    if (waves && meta().kind === 'hepatic') {
      // The hepatic vein's waves named at their peaks (a presenter slide asks for it): the a-wave reversal on the
      // atrial side of the baseline, then the S, v and D forward waves of the same beat. One beat is named at a time.
      // Its letters are pinned to that beat's own moments, so they scroll with it; when the beat is about to leave the
      // screen they fade out, and the newest whole beat gets them, fading in. Nothing glides or pops.
      const dtL = labAt ? Math.min(0.1, (now - labAt) / 1000) : 0; labAt = now;
      const edge = tNow - sweepSeconds + 0.7;                 // a beat starting before this is about to leave
      if (wl && (wl.sgn !== sgn || wl.pts[0][0] < edge)) wl.out = true;
      if (!wl || (wl.out && wl.alpha <= 0)) {
        wl = null;
        if (hvWaves(tNow - sweepSeconds, tNow, sgn) && WAVE_NEW[0][0] >= edge) {
          for (let i = 0; i < 4; i++) { WL.pts[i][0] = WAVE_NEW[i][0]; WL.pts[i][1] = WAVE_NEW[i][1]; WL.pts[i][2] = WAVE_NEW[i][2]; }
          WL.sgn = sgn; WL.alpha = 0; WL.out = false; wl = WL;
        }
      }
      if (wl) {
        wl.alpha = clamp(wl.alpha + (wl.out ? -1 : 1) * dtL / (D_SURFACE / 1000), 0, 1);
        labBusy = wl.out ? wl.alpha > 0 : wl.alpha < 1;
        const A = smooth01(wl.alpha);
        ctx.font = FONT(700, WAVE_PX); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        for (let i = 0; i < 4; i++) {
          const pt = wl.pts[i], t = pt[0], name = pt[2];
          // (The a-wave's letter sits just past the baseline on its side, clear of the spectrum, even when it barely crosses.)
          const up = name === 'a', x = padL + (RW - 1 - (cNow - Math.floor(t * g.cps))) / dpr, y0 = padT + baseY - pt[1] * k * pxPerV, y = up ? Math.min(y0, padT + baseY) : y0;
          if (x < padL + 2 || x > padL + W - 2) continue;
          const ty = clamp(y + (up ? -5 : 5), padT + (up ? WAVE_PX + 1 : 0), padT + H - (up ? 0 : WAVE_PX + 1));
          ctx.textBaseline = up ? 'bottom' : 'top';
          ctx.lineWidth = 5; ctx.strokeStyle = cssAlpha('--black', 0.9 * A); ctx.strokeText(name, x, ty);
          ctx.fillStyle = cssAlpha('--white', A); ctx.fillText(name, x, ty);
        }
      }
    } else { wl = null; }
    xPadL = padL; xRW = RW; xC = cNow; xCps = g.cps; xDpr = dpr;
    drawCalipers(ctx, now, sgn, k, pxPerV, baseY, padT, padL, W, H);
    if (PB) drawPair(ctx, tNow, padT + H + PAIR_GAP, PB, padL, W);
    // One tick a second along the bottom, scrolling with the trace
    ctx.fillStyle = cssAlpha('--white', .4);
    for (let sec = Math.ceil(tNow - sweepSeconds); sec <= tNow; sec++) {
      const x = (RW - 1 - (cNow - Math.floor(sec * g.cps))) / dpr;
      ctx.fillRect(Math.round(padL + x), padT + Hall + 5, 1, 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ── A slide's calipers (V21): a dashed line at the highest and at the lowest velocity of the last 3 s, each across the whole
  // trace, an upright caliper with end ticks between them at the trace's left end, and the pulsatility index in the strip, the
  // number the pattern is named from. Each frame takes one pick (caliperFrame) for the lines and the index alike. Nothing
  // jumps (Mohammad, 19 Oct): the upright stays at the left end, and when a new extreme arrives or the old one leaves the
  // window, its line and the upright's end tick ease to the new level (CAL_FADE). The index changes at once. ──
  let calip = false, cal = null;
  // (Each caliper level's easing, kept for the two levels: where it began, where it is going, when; on false = none yet.)
  const calMk = { hi: { on: false, from: 0, to: 0, at: 0 }, lo: { on: false, from: 0, to: 0, at: 0 } };
  // (The words of the bracket's two numbers, kept: rebuilt only when the number moves.)
  const calPk = { hi: calloutCell(), lo: calloutCell() };
  const calReset = () => { calMk.hi.on = false; calMk.lo.on = false; };
  const CAL_W = 2, CAL_TICK = 4, CAL_PX = 11;   // (the bracket's names: 11 px type)
  const DASH_CAL = [4, 3], DASH_NONE = [];
  // (The calipers' two levels and the frame's numbers for placing them, kept.)
  let lvHi = 0, lvLo = 0, cSgn = 0, cK = 0, cPx = 0, cBase = 0, cPadT = 0, cH = 0;
  const calY = (v) => clamp(cPadT + cBase - cSgn * v * cK * cal.gf * cPx, cPadT + 2, cPadT + cH - 2);
  // (Where a moment lies on the trace: set by each frame before the calipers and the pair are drawn.)
  let xPadL = 0, xRW = 0, xC = 0, xCps = 1, xDpr = 1;
  const xAt = (t) => xPadL + (xRW - 1 - (xC - Math.floor(t * xCps))) / xDpr;
  function calNow(tNow, W) {
    // (On a portal vein, the calipers stand on the beat the reading's pulsatility and pattern come from, medianBeat: one number on screen.)
    const mb = calip && meta().kind === 'portal' && READ.beatPi >= 0 ? READ : null;
    cal = calip && tNow != null && probe ? caliperFrame(buf, tNow, sweepSeconds, W, CAL_W, mb ? mb.beatB0 : NaN, mb ? mb.beatB1 : NaN) : null;
    if (cal) cal.gf = gateFactor(); else calReset();
  }
  // One level's easing, moved on to the pick's level (the pick is the monitor's own record of that mark: [time, level]).
  function calLevel(m, v, now) {
    if (!m.on) { m.on = true; m.from = v; m.to = v; m.at = now; }
    else if (m.to !== v) { m.from = caliperLevel(m.from, m.to, (now - m.at) / 1000); m.to = v; m.at = now; }
    if ((now - m.at) / 1000 < CAL_FADE) labBusy = true;
    return Math.round(calY(caliperLevel(m.from, m.to, (now - m.at) / 1000))) + 0.5;
  }
  function drawCalipers(ctx, now, sgn, k, pxPerV, baseY, padT, padL, W, H) {
    if (!cal) return;
    // (each level on the spectrum's outline, where the reading's peak is read: the mean across the lumen times dopplerK; kept
    // 2 px inside the trace so its dark edge is never cut off)
    cSgn = sgn; cK = k; cPx = pxPerV; cBase = baseY; cPadT = padT; cH = H;
    const xc = caliperX(padL, CAL_TICK), x1 = padL + W;
    lvHi = calLevel(calMk.hi, cal.hi[1], now); lvLo = calLevel(calMk.lo, cal.lo[1], now);
    ctx.save();
    // What the index measures is the gap in speed between the two levels: each runs dashed across the trace, and the upright
    // with end ticks spans the two.
    // (all drawn over the trace and its baseline, each dash and the upright on a dark edge of its own, so a level on the bright
    // spectrum or on the baseline, as a trough near 0 is, still shows; the dark sits only under the dashes, never as a band)
    ctx.beginPath();
    ctx.moveTo(xc, lvHi); ctx.lineTo(x1, lvHi); ctx.moveTo(xc, lvLo); ctx.lineTo(x1, lvLo);
    ctx.setLineDash(DASH_CAL);
    ctx.strokeStyle = cssAlpha('--black', 0.85); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = cssAlpha('--doppler', 0.95); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash(DASH_NONE);
    const T = CAL_TICK;
    ctx.beginPath(); ctx.moveTo(xc, lvHi); ctx.lineTo(xc, lvLo); ctx.moveTo(xc - T, lvHi); ctx.lineTo(xc + T, lvHi); ctx.moveTo(xc - T, lvLo); ctx.lineTo(xc + T, lvLo);
    ctx.strokeStyle = cssAlpha('--black', 0.85); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = cssAlpha('--doppler', 1); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // The two speeds read beside the upright caliper's ends (Mohammad, 6 Nov 2026: numbers only, no names, in the bracket's colour):
    // the higher one just above the top dashed line, the lower just below the bottom one, right of the end ticks, outlined text with no
    // box. Nothing drops onto the moving trace; the numbers follow only their tick's own easing.
    const hiTop = lvHi <= lvLo;
    calNum(ctx, calPk.hi, cal.hi[1], lvHi, hiTop ? -1 : 1, xc + CAL_TICK + 3, padT, H);
    calNum(ctx, calPk.lo, cal.lo[1], lvLo, hiTop ? 1 : -1, xc + CAL_TICK + 3, padT, H);
  }
  function calNum(ctx, c, v, y, want, x, padT, H) {
    const val = Math.round(cSgn * v * cK * cal.gf);
    if (!Object.is(c.v, val)) { c.v = val; c.s = num(val); }   // (the words kept: rebuilt only when the number moves)
    const txt = c.s;
    ctx.font = FONT(700, CAL_PX); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // (on the outer side of its dashed line, clear of it; when the trace area has no room there, on the other side)
    const room = CAL_PX / 2 + 3, top = padT + CAL_PX / 2, bot = padT + H - CAL_PX / 2;
    const fits = (s) => (s < 0 ? y - room >= top : y + room <= bot);
    const side = fits(want) ? want : fits(-want) ? -want : want;
    const ty = clamp(y + side * room, top, bot);
    ctx.lineWidth = 3.5; ctx.strokeStyle = cssAlpha('--black', 0.85); ctx.strokeText(txt, x, ty);
    ctx.fillStyle = cssAlpha('--doppler', 1); ctx.fillText(txt, x, ty);
  }
  // (The index is read in the bottom strip, first after the probe's name, in the marks' colour: off the spectrum, always whole.
  // Its words come from a table of the hundredths, the index being at most 2.)
  const calText = () => (cal ? PI_TEXT[Math.max(0, Math.min(PI_TEXT.length - 1, Math.round(cal.pi * 100)))] : '');

  // ── A slide's paired trace (V29): the paired vessel's velocity over the same seconds as the main trace, beat for beat, as
  // the scanner would draw it (a hepatic vein's forward flow below its baseline), slim, in a band of its own under the main
  // trace with its own scale, named on its left. ──
  let pair = false, pairSc = null;
  const PS = { id: '', scale: 0, base: 0, at: 0 };   // (the pair's scale, kept)
  const setPairScale = (id, want, at) => { PS.id = id; PS.scale = want.scale; PS.base = want.base; PS.at = at; pairSc = PS; };
  function drawPair(ctx, tNow, y0, PB, padL, W) {
    const id = pairOf(meta().kind), pm = PROBES_BY_ID.get(id), kp = dopplerK(EDGES[EI[id]]);
    const s = (pm.away ? -1 : 1) * (invert ? -1 : 1) * kp;
    let pos = 0, neg = 0;
    for (let i = 0; i < buf.length; i++) {
      const p = buf[i];
      if (p[0] < tNow - sweepSeconds || p[0] > tNow || !Number.isFinite(p[2])) continue;
      const v = s * p[2]; if (v > pos) pos = v; if (-v > neg) neg = -v;
    }
    // (its scale holds still as the main one does: it grows at once when the trace would clip, and shrinks only after 3 s)
    const want = pairScale(pos, neg), need = Math.max(pos, neg, 8) / 0.85;
    if (!pairSc || pairSc.id !== id || need > pairSc.scale || (want.base >= 0.5) !== (pairSc.base >= 0.5)) setPairScale(id, want, tNow);
    else if (want.scale < pairSc.scale || Math.abs(want.base - pairSc.base) > 0.15) { if (tNow - pairSc.at > 3) setPairScale(id, want, tNow); }
    else pairSc.at = tNow;
    const by = y0 + Math.round(PB * pairSc.base), ppv = (pairSc.base >= 0.5 ? by - y0 : y0 + PB - by) / pairSc.scale;
    ctx.save();
    ctx.fillStyle = cssAlpha('--white', 0.06); ctx.fillRect(padL, y0, W, PB);
    ctx.fillStyle = cssAlpha('--white', 0.5); ctx.fillRect(padL, by, W, 1);
    let drawn = 0;
    for (let i = 0; i < buf.length; i++) {
      const p = buf[i];
      if (p[0] < tNow - sweepSeconds || p[0] > tNow || !Number.isFinite(p[2])) continue;
      if (!drawn++) { ctx.beginPath(); ctx.moveTo(xAt(p[0]), clamp(by - s * p[2] * ppv, y0, y0 + PB)); } else ctx.lineTo(xAt(p[0]), clamp(by - s * p[2] * ppv, y0, y0 + PB));
    }
    if (drawn > 1) { ctx.strokeStyle = cssAlpha('--white', 0.9); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); }
    // Its name above its band on the left, and its scale's end on the right margin, as the main trace's are.
    ctx.font = FONT(600, 12); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    ctx.fillStyle = cssAlpha('--white', 0.86); ctx.fillText(pm.short, padL, y0 - PAIR_GAP + 1);   // (in the gap above its band, clear of both traces)
    ctx.font = FONT(500, 12); ctx.textBaseline = 'middle'; ctx.fillStyle = cssAlpha('--white', 0.78);
    const up = pairSc.base >= 0.5, ey = up ? y0 + 6 : y0 + PB - 6, top = num(up ? pairSc.scale : -pairSc.scale);
    ctx.fillText(top, padL + W + 13, ey);
    if (Math.abs(by - ey) >= 14) ctx.fillText('0', padL + W + 13, by);
    ctx.restore();
  }
  /** A slide's own Doppler options (presenter-tools.js show → configure, slide-ext.js): the display mode (V20: 'spectrum',
   *  'color' or 'variance'; the next slide returns to Spectrum unless it names one), calipers (V21) and the paired trace (V29). */
  const MODE_OF = { spectrum: 'spectrum', color: 'velocity', colour: 'velocity', velocity: 'velocity', variance: 'variance' };
  function configure(t = {}) {
    const m = MODE_OF[t?.mode] || 'spectrum';
    if (m !== mode) { mode = m; sync(); }
    calip = !!t?.calipers; cal = null; calReset();   // (a new slide's calipers pick from its own trace)
    if (pair !== !!t?.pair) { pair = !!t?.pair; pairSc = null; }
    // (scale: the velocity scale fixed at ± that many cm/s, the Nyquist limit, so faster flow aliases; baseline: where the
    // baseline sits, 0 at the top of the trace to 1 at the bottom, 0.5 when not given. Without scale the display fits itself.)
    const nyq = Number(t?.scale), b = Number(t?.baseline);
    const next = nyq > 0 ? { nyq: clamp(nyq, 5, 400), base: Math.round(clamp(Number.isFinite(b) ? b : 0.5, 0.15, 0.85) * 100) / 100 } : null;
    if (next?.nyq !== fixed?.nyq || next?.base !== fixed?.base) { fixed = next; scale = null; baseF = null; }
    redraw();
  }

  // The dock asks for a redraw with each model frame (~10 a second); the picture itself runs on
  // animation frames while the model is live and the dock keeps asking, and stops when it doesn't.
  // ── Hepatic vein waves: a, S, v and D in each whole beat on screen ──
  // Beats are cut at the a-waves (the reversals, toward the probe's atrial side); between two, the two deepest
  // forward troughs are S (first) and D, with the a-wave that opens the beat. Read from a lightly smoothed trace; nothing is named when the pattern
  // is not triphasic (no clear reversal, or a single forward wave).
  let waves = false;
  let wl = null, labAt = 0, labBusy = false;   // the beat whose waves are named: {pts, sgn, alpha, out}
  const WAVE_NEW = [[0, 0, 'a'], [0, 0, 'S'], [0, 0, 'v'], [0, 0, 'D']];   // (the beat just found: [time, level, letter] for a, S, v and D)
  const WL = { pts: [[0, 0, 'a'], [0, 0, 'S'], [0, 0, 'v'], [0, 0, 'D']], sgn: 0, alpha: 0, out: false };   // (the beat named, kept and rewritten for each new one)
  // (The scratch hvWaves works in: the record's samples in the window, their smoothed levels, the a-waves, the troughs and the dips; kept, sized for the longest record.)
  const HW_CAP = 4096;
  const hwY = new Float64Array(HW_CAP), hwA = new Int32Array(HW_CAP), hwLow = new Int32Array(HW_CAP), hwDip = new Int32Array(HW_CAP);
  let hwI0 = 0, hwN = 0;
  const hwExt = (i, sgn2) => sgn2 * hwY[i] >= sgn2 * hwY[i - 1] && sgn2 * hwY[i] >= sgn2 * hwY[i + 1];
  // An a-wave: the highest point within 0.3 s either side, at or near the baseline.
  const hwCrest = (i) => {
    const ti = buf[hwI0 + i][0];
    for (let j = i - 1; j >= 0 && ti - buf[hwI0 + j][0] < 0.3; j--) if (hwY[j] > hwY[i]) return false;
    for (let j = i + 1; j < hwN && buf[hwI0 + j][0] - ti < 0.3; j++) if (hwY[j] > hwY[i]) return false;
    return true;
  };
  function hvWaves(t0, t1, sgn) {
    // (The samples between t0 and t1, in place in the record: the first one in the window and how many there are.)
    let i0 = 0; while (i0 < buf.length && buf[i0][0] < t0) i0++;
    let n = 0; while (i0 + n < buf.length && buf[i0 + n][0] <= t1) n++;
    if (n < 12 || n > HW_CAP) return false;
    hwI0 = i0; hwN = n;
    const y = hwY;
    for (let i = 0; i < n; i++) { let s = 0, m = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += sgn * buf[i0 + j][1]; m++; } y[i] = s / m; }
    let top = -Infinity, bot = Infinity;   // (top: the biggest reversal, which has to exist)
    for (let i = 0; i < n; i++) { if (y[i] > top) top = y[i]; if (y[i] < bot) bot = y[i]; }
    if (top < 0.5 || bot > -5) return false;
    let aN = 0;
    for (let i = 1; i < n - 1; i++) if (y[i] > bot * 0.15 && hwExt(i, 1) && hwCrest(i) && (!aN || buf[i0 + i][0] - buf[i0 + hwA[aN - 1]][0] > 0.35)) hwA[aN++] = i;
    // Only the newest settled whole beat is named, as a textbook marks one cycle: every beat at once crowds the trace.
    // A beat is named once its closing a-wave has settled (the last 0.35 s of the record can still change), so the letters never shift afterwards.
    const tEnd = buf[i0 + n - 1][0] - 0.35;
    for (let b = aN - 2; b >= 0; b--) {
      if (buf[i0 + hwA[b + 1]][0] > tEnd) continue;
      let lowN = 0;
      for (let i = hwA[b] + 1; i < hwA[b + 1]; i++) if (y[i] < bot * 0.25 && hwExt(i, -1)) hwLow[lowN++] = i;
      // Keep the deepest trough of each dip (troughs closer than 0.12 s are one wave), then the two deepest dips.
      let dipN = 0;
      for (let q = 0; q < lowN; q++) {
        const i = hwLow[q];
        if (dipN && buf[i0 + i][0] - buf[i0 + hwDip[dipN - 1]][0] < 0.12) { if (y[i] < y[hwDip[dipN - 1]]) hwDip[dipN - 1] = i; } else hwDip[dipN++] = i;
      }
      if (dipN < 2) continue;
      // (the two deepest, the earlier of equal ones first, in the order they come)
      let m1 = -1, m2 = -1;
      for (let q = 0; q < dipN; q++) { if (m1 < 0 || y[hwDip[q]] < y[hwDip[m1]]) { m2 = m1; m1 = q; } else if (m2 < 0 || y[hwDip[q]] < y[hwDip[m2]]) m2 = q; }
      const two0 = Math.min(hwDip[m1], hwDip[m2]), two1 = Math.max(hwDip[m1], hwDip[m2]);
      // v: the turn toward the baseline between S and D (the highest point between their troughs).
      let v = two0 + 1;
      for (let i = two0 + 1; i < two1; i++) if (y[i] > y[v]) v = i;
      const W4 = WAVE_NEW;
      W4[0][0] = buf[i0 + hwA[b]][0]; W4[0][1] = y[hwA[b]];
      W4[1][0] = buf[i0 + two0][0]; W4[1][1] = y[two0];
      W4[2][0] = buf[i0 + v][0]; W4[2][1] = y[v];
      W4[3][0] = buf[i0 + two1][0]; W4[3][1] = y[two1];
      return true;
    }
    return false;
  }
  let raf = 0, askedAt = 0, paintAt = 0, reportDue = false, parkT = 0;
  // (At rest (frame.js restGapFor: 4 s with no input and nothing moving) the running trace is drawn 30 a second, 20 in a talk left 30 s,
  // and between its frames the loop waits on a timer, not on every screen frame (restPark). Any input gives the full rate back.)
  const unpark = () => { parkT = 0; if (!raf) raf = nextFrame(loop); };
  const park = (left) => !!(parkT || (parkT = restPark(left, unpark)));
  // (While the trace scrolls its frames are never carried to a later one by the scheduler: a carried frame of a moving picture steps, then jumps.)
  let animating = false;
  const anim = (on) => { if (animating !== on) { animating = on; frameAnimating('doppler', on); } };
  function loop(now) {
    raf = 0;
    anim(!!frame && live() && shown());
    if (!frame || !shown()) { if (reportDue) { reportDue = false; updateReport(); } return; }
    // The running trace scrolls on every frame the screen offers (15 a second in Battery saver). Its samples are the model's,
    // whatever the frame rate: each frame adds only the columns its elapsed time covers. A change while paused draws at once.
    const paced = live() && !labBusy, pace = paced ? paceMs() : 0, rest = paced ? restGapFor(now) : 0, gap = Math.max(pace, rest);
    if (gap && now - paintAt < gap) { if (!(rest > pace && park(gap - (now - paintAt)))) raf = nextFrame(loop); return; }
    paintAt = now;
    // (The words are set in the same frame as the picture, so the reading and the trace and its scale never disagree.)
    if (reportDue || velShown.moving) { reportDue = false; updateReport(); }
    draw(now);
    noteDraw('doppler');
    if ((live() && now - askedAt < 400) || labBusy || velShown.moving) { if (!(rest > pace && park(rest))) raf = nextFrame(loop); }
  }
  function redraw() {
    if (!frame) return;
    reportDue = true;
    if (!shown()) { reportDue = false; updateReport(); }
    askedAt = performance.now();
    if (!raf) raf = nextFrame(loop);
  }
  function update(f) { ingest(f); redraw(); }
  /** The window ahead of the record filled with the steady state the vessel opened on (backfill.js): the history's samples before the
   *  first of the trace go in front, in the same form, and the trace the monitor has recorded itself stays. Only for the vessel it was
   *  made for, and not over a time-lapse's replay. */
  function backfill(hs) {
    if (!hs?.t?.length || !hs.vel || hs.probe !== probe || synth || frame?.clock === 'disease') return false;
    const n = olderThan({ t: hs.t.map((t) => t + tOff) }, buf.length ? buf[0][0] : Infinity);
    if (!n) return false;
    if (buf.length) backTo = Math.max(backTo ?? -Infinity, buf[0][0]); else RK.ok = false;   // (the ring's lines before the record are drawn again with the history)
    const ps = hs[pairOf(meta().kind) === 'PV_TRUNK' ? 'pvVel' : 'hvVel'];
    const rows = [];
    for (let i = 0; i < n; i++) rows.push([hs.t[i] + tOff, hs.vel[i], ps?.[i] ?? NaN]);
    buf = rows.concat(buf);
    const tNow = buf[buf.length - 1][0];
    let cut = 0; while (cut < buf.length && buf[cut][0] < tNow - KEEP) cut++;
    if (cut && (cut >= 256 || cut * 4 >= buf.length)) dropSamples(cut);
    redraw();
    return true;
  }
  function clear() { clearBuf(); wl = null; redraw(); }
  // (A new recording of the same vessel: as a new probe, the trace, its scale and its reading start over.)
  function restart() { clearBuf(); wl = null; tOff = 0; synth = null; scale = null; heldTo = null; steady.probe = null; redraw(); }
  /** A slide is showing this monitor: choose its window again from the width it is drawn at. (The trace already drawn
   *  stays: only a change of window redraws it, so a slide that keeps the window enters without a full repaint.) */
  function autoWindow() { manualSweep = false; pickNext = true; redraw(); }
  /** Name the hepatic vein's a, S, v and D waves on the trace (the Presenter's waveform slides). */
  function setWaves(on) { if (waves !== !!on) { waves = !!on; redraw(); } }
  /** The monitor is done with (a presentation's own instruments go with it, presenter-tools.js): its frames, observers and GPU
   *  context are let go. Each presentation made a new monitor and kept the old one's WebGL context; iOS Safari holds about a
   *  dozen contexts and drops the oldest without a word, which could be the figure's. */
  function dispose() {
    anim(false);
    if (raf) { cancelFrame(raf); raf = 0; }
    io?.disconnect(); ro?.disconnect(); frame = null;
    gpu?.dispose(); words?.dispose(); offSurface(); clearTimeout(parkT); parkT = 0;
  }
  return { id: 'doppler', label: 'Doppler', el, update, ingest, redraw, clear, restart, backfill, historySecs: () => sweepSeconds, setInvert, setWaves, autoWindow, pin, configure, dispose };
}
