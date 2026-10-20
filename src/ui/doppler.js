// Spectral Doppler: pulsed-wave velocity in one vessel, drawn as the scanner draws it (a
// grey-scale spectrum on black, flow toward the transducer above the baseline), with the reading
// a sonographer would report beside it: direction, velocity against the vessel's normal range,
// and the waveform pattern. The trace keeps recording while the instrument is closed, so it opens
// full. It scrolls smoothly, one spectral line at a time, as the machine does.

import { EDGES, dopplerK, stentSegments, stentSite, stentGate, stentCourse } from '../engine/topology.js?v=4044766e96';
import { h, fmt, fitCanvas, clamp, icon, cssVar, cssAlpha } from './util.js?v=5814c6b396';
import { FONT } from './charts.js?v=ea8ada79e9';
import { logAction, shownVel, store } from './store.js?v=31ee79b6ab';
import { DOPPLER_MODES, THETA, dopplerColor, shadeColor, swatchGradient } from './dopplerColor.js?v=1caed50820';
import { frameFor, noteDraw, paceMs } from './frame.js?v=2ce59939b2';
import { windowIndexFor, scaleFor } from './dopplerWindow.js?v=2067b803a2';
import { velNormal, dopplerVel } from './velNormal.js?v=181dda5594';
import { caliperFrame, caliperLevel, caliperX, CAL_FADE, pairOf, pairBand, pairScale, PAIR_GAP } from './doppler-marks.js?v=93a0a638e4';
const nextFrame = frameFor('doppler');

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
// What the Doppler calls a vessel: a stent also names its course ("TIPS RPV → RHV"), read from where the model connects it.
const probeName = (p) => (p.kind === 'tips' ? `${p.short} ${stentCourse(EDGES[EI[p.id]])}` : p.short);
// kind decides the words for direction and pattern; normal is the usual mean velocity (cm/s).
// Positive velocity is the vessel's physiological direction (for a collateral: portal → systemic).
// The trace is drawn as the scanner shows it, relative to the transducer: flow toward the probe
// above the baseline. Hepatic veins and the IVC drain away from a subcostal or intercostal probe,
// so their forward flow is below the baseline (away) and the a-wave reversal above it.
const PROBES = [
  { id: 'PV_TRUNK', short: 'MPV', kind: 'portal', normal: [15, 40] },
  { id: 'PVH_R', short: 'RPV', kind: 'portal', normal: [12, 35] },
  { id: 'PVH_L', short: 'LPV', kind: 'portal', normal: [12, 35] },
  { id: 'SMV_CONF', short: 'SMV Prox', kind: 'portal', normal: [10, 30] },
  { id: 'V_INT', short: 'SMV Dist', kind: 'portal', normal: [10, 30] },
  { id: 'SV_CONF', short: 'SV Prox', kind: 'portal', normal: [10, 30] },
  { id: 'V_SPL', short: 'SV Dist', kind: 'portal', normal: [10, 30] },
  { id: 'RHV_IVC', short: 'RHV', kind: 'hepatic', normal: [10, 40], away: true },
  { id: 'MHV_IVC', short: 'MHV', kind: 'hepatic', normal: [10, 40], away: true },
  { id: 'LHV_IVC', short: 'LHV', kind: 'hepatic', normal: [10, 40], away: true },
  { id: 'IVCS_RA', short: 'IVC', kind: 'ivc', normal: [10, 50], away: true },
  { id: 'A_HEP', short: 'HA', kind: 'artery', normal: [30, 100] },
  { id: 'TIPS', short: 'TIPS', kind: 'tips', normal: [90, 190] },
  { id: 'DIPS', short: 'DIPS', kind: 'tips', normal: [90, 190] },
  { id: 'C1b', short: 'Varix C1', kind: 'collateral', normal: null },
  { id: 'C3', short: 'Paraumb. C3', kind: 'collateral', normal: null },
];
const SWEEP_SECONDS = [6, 3, 12]; // Start at 6 s; first tap shortens the visible window.
const PAD_L = 12, PAD_R = 46;        // The trace's side margins (CSS px).
const KEEP = 16;                 // Retain enough samples for the 12 s sweep and display lag.
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
  // Display mode: a pill that cycles Spectrum → Direction → Power → Directional Power → Variance,
  // like Invert. The colour maps live in dopplerColor.js; the trace is drawn through them.
  let mode = 'spectrum';
  const modeSw = h('i', { 'aria-hidden': 'true' });
  const modeTxt = h('span', { class: 'dop-mode-label' });
  const modeBtn = h('button', { class: 'dop-tint dop-mode', 'aria-pressed': 'false' }, modeSw, modeTxt);
  modeBtn.addEventListener('click', () => {
    mode = DOPPLER_MODES[(DOPPLER_MODES.findIndex((m) => m.id === mode) + 1) % DOPPLER_MODES.length].id;
    sync();
  });
  // Invert, as on the scanner: flips the display about the baseline, so the toward/away colors swap
  // with it (the report and the physiology are unchanged). Power Doppler has no direction.
  let invert = false;
  const invBtn = h('button', { class: 'dop-tint dop-inv', 'aria-pressed': 'false', title: 'Invert the display: show flow away from the probe above the baseline' }, h('i', { 'aria-hidden': 'true' }, '⇅'), 'Invert');
  const setInvert = (v) => { invert = !!v; invBtn.setAttribute('aria-pressed', String(invert)); sync(); };
  invBtn.addEventListener('click', () => { setInvert(!invert); logAction('invert', 'doppler', invert); });
  function sync() {
    const m = DOPPLER_MODES.find((x) => x.id === mode);
    modeTxt.textContent = m.short;
    modeBtn.title = `Doppler display: ${m.label}. Tap to change.`;
    modeBtn.setAttribute('aria-label', `Doppler display mode: ${m.label}. Activate to change.`);
    modeBtn.setAttribute('aria-pressed', String(mode !== 'spectrum'));
    modeSw.style.background = mode === 'spectrum' ? '' : swatchGradient(mode);
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
    sweepBtn.lastChild.textContent = `${sweepSeconds} s`;
    sweepBtn.title = `Sweep window: ${sweepSeconds} seconds. Tap to cycle.`;
    sweepBtn.setAttribute('aria-label', `Doppler sweep duration: ${sweepSeconds} seconds. Activate to cycle.`);
    ringKey = '';
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
    const i = windowIndexFor(cv.clientWidth - PAD_L - PAD_R);   // (layout width: not scaled by a card still easing in, and never a stale cached size)
    if (i !== sweepIndex) { setSweep(i); updateReport(); }
  }
  const WAVE_PX = 20;   // the a, S, v, D letters: large enough to read against the card text
  const cv = h('canvas', { role: 'img', 'aria-label': 'Spectral Doppler' });
  const box = h('div', { class: 'chart-box dark dop-box' }, cv);

  // The report
  const dirEl = h('b', { class: 'dop-dir' }, '—');
  const velEl = h('span', { class: 'dop-vel' }, h('b', {}, '—'), h('small', {}, 'cm/s', h('span', { class: 'dop-mean' })));
  // Normal-range gauge: a track with the usual band shaded and a marker for the current mean.
  const bandEl = h('i', { class: 'dop-band' });
  const markEl = h('i', { class: 'dop-mark' });
  const gLo = h('span', { class: 'dop-g-lo' }); const gHi = h('span', { class: 'dop-g-hi', 'data-u': 'cm/s' }); const gZero = h('span', { class: 'dop-g-zero' }, '0');
  const rangeEl = h('div', { class: 'dop-range', hidden: true }, h('div', { class: 'dop-track' }, bandEl, markEl), h('div', { class: 'dop-ticks' }, gZero, gLo, gHi));
  const patternEl = h('div', { class: 'dop-pattern' });
  const noteEl = h('p', { class: 'dop-note' });
  const statEls = {};
  // A row that comes with the new vessel (the congestion index, a stent's three segments) fades in rather than popping (P23).
  const showStat = (wrap, on) => {
    if (wrap.hidden !== on) return;
    wrap.hidden = !on;
    if (on && wrap.isConnected && wrap.getClientRects().length) wrap.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  };
  const stats = h('dl', { class: 'dop-stats' }, ['Peak', 'Trough', 'Pulsatility', 'CI', 'Proximal', 'Mid', 'Distal'].map((k) => {
    const dd = h('dd', {}, '—');
    const seg = SEGS.find(([, name]) => name === k)?.[0];
    // A stent segment's tile is a button (the name inside the term; its ::after covers the whole tile, so a tap anywhere on it samples there).
    const btn = seg && pickGate ? h('button', { type: 'button', class: 'dop-seg', 'aria-pressed': 'false', title: `Sample the stent at its ${k.toLowerCase()} end` }, k) : null;
    btn?.addEventListener('click', () => pickSeg(seg));
    // (the Peak tile is named Max: the highest point of the last 3 s, beside the big reading, which is the spectrum's peak averaged over time)
    const wrap = h('div', k === 'Peak' ? { title: 'Highest velocity in the last 3 s' } : {}, h('dt', {}, btn || (k === 'Peak' ? 'Max' : k)), dd); statEls[k] = { dd, wrap, btn }; return wrap;
  }));
  const report = h('div', { class: 'dop-report' }, dirEl, h('div', { class: 'dop-velrow' }, velEl, patternEl), rangeEl, stats, noteEl);
  // The top strip's fitting steps (see fitStrip): [type scale, the direction's short form, the pattern on its own line].
  let stripKey = '', stripStep = 0, dirFull = '—', stripType = '', rng = null;
  // Whether the monitor is on screen, and the widths the strip is fitted to, as the browser reports them when they change: read
  // on every frame (offsetParent, clientWidth), they made the browser lay the page out mid-frame, after the figure's own writes.
  // (No observers, as in a bare test page: read as before.)
  let seen = false, repW = -1, cvW = -1;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { const was = seen; seen = es[es.length - 1].isIntersecting; if (seen && !was) redraw(); }) : null;
  io?.observe(cv);
  const shown = () => cv.isConnected && (io ? seen : !!cv.offsetParent);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => {
    for (const e of es) { const w = e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width; if (e.target === report) repW = w; else cvW = w; }
  }) : null;
  ro?.observe(report, { box: 'border-box' }); ro?.observe(cv, { box: 'border-box' });
  const STEPS = [[1, false, false], [0.9, false, false], [0.8, false, false], [1, false, true], [0.9, false, true], [0.8, false, true], [0.9, true, true], [0.8, true, true]];
  const SHORT_DIR = { 'Portal → hepatic vein': 'PV → HV', 'Portal → IVC': 'PV → IVC', 'Portal → systemic': 'PV → systemic', 'Systemic → portal': 'Systemic → PV', 'Toward the heart': 'To the heart', 'Not available during time lapse': 'Paused in time lapse' };
  const el = h('div', { class: 'dop', 'data-pane': 'doppler' },
    h('div', { class: 'dop-head' }, probeSel, h('div', { class: 'dop-btns' }, modeBtn, invBtn, sweepBtn)), h('div', { class: 'dop-main' }, box, report));

  // ── Samples ───────────────────────────────────────
  let buf = [];
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
    const pts = buf.slice(i);
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
      buf.push([synth.t, ratio ? v * synth.mean / m0 : v - m0 + synth.mean, tpl.hasPair ? tpl.pm + (tplAt(synth.t, 2) - tpl.pm) * synth.amp : NaN]);
    }
  }
  function ingest(f) {
    frame = f;
    if (f.probe !== probe) { buf = []; wl = null; tOff = 0; synth = null; scale = null; steady.probe = null; probe = f.probe; if (probeSel.value !== probe) probeSel.value = probe; }
    // A new spot along a stent is a new recording, as a new vessel is: the trace starts over and finds its own scale.
    const g = isStentProbe() ? gateOf() : '';
    if (g !== gateNow) { gateNow = g; buf = []; wl = null; synth = null; scale = null; steady.probe = null; }
    const s = f.samples;
    if (f.clock === 'disease') {
      if (!synth && buf.length) synth = startSynth();
      if (!synth) return;
      if (s?.vel?.length) synth.target = s.vel[s.vel.length - 1];
      synth.still = f.resp === false;
      // A lapse without respiration shows none from its first frame: the replay and the trace already drawn go flat at once.
      if (synth.still && !synth.flat) { synth.flat = true; synth.amp = 0; for (const p of buf) { p[1] = synth.mean; if (tpl.hasPair) p[2] = tpl.pm; } }
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
      for (let i = 0; i < s.t.length; i++) { const t = s.t[i] + tOff; if (!buf.length || t > buf[buf.length - 1][0]) buf.push([t, s.vel[i], ps?.[i] ?? NaN]); }
    }
    if (!buf.length) return;
    const tNow = buf[buf.length - 1][0];
    let cut = 0; while (cut < buf.length && buf[cut][0] < tNow - KEEP) cut++;
    if (cut) buf.splice(0, cut);
  }

  // ── Reading ───────────────────────────────────────
  // (Nothing until 1.5 s of this vessel is recorded: a pattern judged from part of a beat is a wrong one, a red "To-and-fro" for a moment.)
  const SETTLE = 1.5;
  function reading() {
    if (buf.length < 4) return null;
    const tNow = buf[buf.length - 1][0];
    if (tNow - buf[0][0] < SETTLE) return null;
    let sum = 0, n = 0, vmax = -Infinity, vmin = Infinity;
    for (let i = buf.length - 1; i >= 0 && buf[i][0] >= tNow - 3; i--) {
      const v = buf[i][1]; sum += v; n++;
      if (v > vmax) vmax = v; if (v < vmin) vmin = v;
    }
    // The record is the mean across the lumen; the scanner reads the peak of the spectrum (dopplerK)
    const k = dopplerK(EDGES[EI[probe]]);
    return { mean: k * sum / n, vmax: vmax * k, vmin: vmin * k, vmaxMean: vmax, vminMean: vmin };
  }
  const meta = () => PROBES.find((p) => p.id === probe) || PROBES[0];
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
    return stentSegments(v, s, stentSite(prm, probe));
  };
  // The gated segment of a stent, and how much faster it runs than the open stent (1 elsewhere, and on any other vessel).
  const isStentProbe = () => meta().kind === 'tips';
  const gateOf = () => stentGate(store.get().dopGate, store.get().params, probe);
  let gf = 1;
  const gateFactor = () => (isStentProbe() ? stentReads(1)[SEGS.findIndex(([v]) => v === gateOf())] || 1 : 1);
  // +1 when the vessel's forward flow is drawn above the baseline, −1 when below
  const effInvert = () => invert;
  const pol = () => (!meta().away !== !effInvert() ? -1 : 1);

  // A vessel's usual range: with a TIPS or DIPS in, the main portal vein's is 30 cm/s and up (velNormal.js), so fast flow is not flagged.
  const normalOf = (p) => (p.id === 'PV_TRUNK' && frame?.D ? velNormal(EI.PV_TRUNK, frame) : null) || p.normal;
  // A stent is judged at its gate, as its reading, trace and tiles show it: a 90% narrowing's jet is flow, not an occlusion,
  // although the open stent around it barely moves (g, the gate's factor; open, the open stent's mean for its segment tiles).
  function interpret(r0, g = 1) {
    const p = meta(), normal = normalOf(p), open = Math.abs(r0.mean);
    const r = g === 1 ? r0 : { mean: r0.mean * g, vmax: r0.vmax * g, vmin: r0.vmin * g, vmaxMean: r0.vmaxMean * g, vminMean: r0.vminMean * g };
    const a = Math.abs(r.mean);
    const swing = r.vmaxMean - r.vminMean;
    const big = Math.max(Math.abs(r.vmaxMean), Math.abs(r.vminMean));
    const pi = big > 0.5 ? swing / big : 0;
    const reverses = r.vminMean < -1.5 && r.vmaxMean > 1.5;
    let dir, sev, pattern, note;
    if (a < 1 && big < 2 && p.kind !== 'collateral') {
      dir = 'No flow'; sev = 'critical'; pattern = 'No signal';
      note = p.kind === 'tips' ? 'No flow in the stent: occluded.' : 'No detectable flow: a clot, or flow too slow to detect.';
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
        note = toStent < 0 ? `Expected with a ${stent}: flow runs back toward the stent.` : 'Expected with a TIPS: the segment before the stent flows hepatopetal into it; beyond the stent the right branches are hepatofugal.';
        return { dir, sev, pattern, note, pi, expected: true };
      }
      if (a < 9 && !reverses) { dir = 'Stasis'; sev = 'danger'; }
      else if (reverses && Math.abs(r.mean) < swing * 0.35) { dir = 'To-and-fro'; sev = 'danger'; }
      else if (r.mean < 0) { dir = 'Hepatofugal'; sev = 'critical'; }
      else { dir = 'Hepatopetal'; sev = a < normal[0] ? 'caution' : 'ok'; }
      pattern = pi > 0.5 ? 'Pulsatile' : pi > 0.15 ? 'Phasic' : 'Monophasic';
      note = dir === 'Hepatofugal' ? 'Flow runs away from the liver: portal blood is leaving through collaterals.'
        : dir === 'To-and-fro' ? 'Flow swings both ways each cycle, on the way to reversal.'
        : dir === 'Stasis' ? 'Almost no net flow: a setting for portal vein thrombosis.'
        : pattern === 'Pulsatile' ? 'A pulsatile portal vein suggests right-heart pressure transmitted back (heart failure, tricuspid regurgitation) or an arterioportal shunt.'
        : a < normal[0] ? (stent ? `Slower than expected with a ${stent}: it suggests the stent is narrowing.` : 'Toward the liver but slow: typical of portal hypertension.')
        : pattern === 'Monophasic' ? 'Normal: toward the liver, steady.'
        : 'Normal: toward the liver with gentle phasicity.';
      // Flow toward the liver in a branch that a working stent would reverse: the stent no longer draws it, as when it narrows.
      if (branch && dir === 'Hepatopetal') { sev = 'caution'; note = `With a ${stent}, flow toward the liver here is not expected: it suggests the stent is narrowing.`; }
    } else if (p.kind === 'hepatic') {
      dir = r.mean < 0 ? 'Reversed' : 'Toward the heart'; sev = r.mean < 0 ? 'danger' : 'ok';
      // A reversal over 15 cm/s and 0.4 of the forward peak is more than the a-wave: tricuspid regurgitation or a high atrium.
      const backflow = -r.vminMean > 15 && -r.vminMean > 0.4 * r.vmaxMean;
      pattern = backflow ? 'Large reversal' : r.vminMean < -1 ? 'Triphasic' : pi > 0.3 ? 'Biphasic' : 'Monophasic';
      if (pattern === 'Monophasic') sev = sev === 'ok' ? 'caution' : sev;
      if (backflow) sev = 'danger';
      note = backflow ? 'Blood surges back toward the liver each beat: tricuspid regurgitation or a high right atrial pressure.'
        : pattern === 'Triphasic' ? 'Normal: the atrial a-wave briefly reverses flow each beat.'
        : pattern === 'Biphasic' ? 'Damped: the a-wave no longer reverses flow.'
        : 'Flat: a stiff liver (cirrhosis) or outflow resistance damps the cardiac waveform.';
    } else if (p.kind === 'artery') {
      dir = r.mean < 0 ? 'Reversed' : 'Antegrade'; sev = r.mean < 0 ? 'danger' : 'ok';
      const ri = r.vmax > 0.5 ? (r.vmax - Math.max(0, r.vmin)) / r.vmax : 0;
      pattern = `Resistive index ${fmt(ri, 2)}`;
      note = 'The hepatic artery buffers falling portal inflow by dilating (the hepatic arterial buffer response).';
    } else if (p.kind === 'tips') {
      dir = a < 2 ? 'No flow' : r.mean < 0 ? 'Reversed' : p.id === 'DIPS' ? 'Portal → IVC' : 'Portal → hepatic vein'; sev = a < 2 || r.mean < 0 ? 'critical' : a < 90 || a > 190 ? 'caution' : 'ok';
      const jet = Math.max(a, ...stentReads(open));   // the fastest segment: a narrowing's jet
      pattern = a < 2 ? 'Occluded' : a < 90 ? (jet > 190 ? 'Low velocity, jet' : 'Low velocity') : jet > 190 ? 'High velocity' : 'Patent';
      if (sev === 'ok' && jet > 190) sev = 'caution';
      note = a < 2 ? 'No flow in the stent: occluded.' : 'Stent velocities under 90 or over 190 cm/s, or a change of more than 50 cm/s from the baseline scan, suggest stenosis.';
    } else if (p.kind === 'ivc') {
      dir = r.mean < 0 ? 'Reversed' : 'Toward the heart'; sev = r.mean < 0 ? 'danger' : 'ok';
      pattern = r.vminMean < -1 ? 'Phasic, with reversal' : pi > 0.3 ? 'Phasic' : 'Continuous';
      note = 'The IVC follows the right atrium: respiratory and cardiac phasicity.';
    } else {
      dir = a < 1 ? 'No flow' : r.mean > 0 ? 'Portal → systemic' : 'Systemic → portal'; sev = a < 1 ? 'ok' : 'caution';
      pattern = a < 1 ? 'Closed' : 'Open collateral';
      note = a < 1 ? 'This collateral carries no flow.' : 'Portal blood is bypassing the liver through this collateral.';
    }
    return { dir, sev, pattern, note, pi };
  }

  // A tile value: the number, with its unit small beside it.
  function setStat(dd, v, unit = '') {
    const key = `${v}|${unit}`;
    if (dd.dataset.v === key) return;
    dd.dataset.v = key; dd.textContent = v;
    if (unit) dd.append(' ', h('small', {}, unit));
  }

  // Place the normal band and the current mean on one scale: 0 to ~1.7x the top of the usual range, widened
  // when the mean falls outside (reversed flow reaches below zero). The marker eases there with CSS.
  // (expected: a reading the stent explains, as a branch running back toward a TIPS, is not flagged out of range.)
  function updateGauge(p, mean, expected = false) {
    const normal = normalOf(p);
    if (!normal) { rangeEl.hidden = true; velEl.dataset.out = 'false'; return; }
    // (A range with no ceiling, the portal vein with a stent in, runs its band to the gauge's end and names only its floor.)
    const [n0, n1] = normal, open = !Number.isFinite(n1);
    const hi = Math.max(Math.round((open ? 2 * n0 : n1) * 1.7), Math.ceil(mean * 1.1));
    const lo = Math.min(0, Math.floor(mean * 1.1));
    const pos = (v) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    rangeEl.hidden = false;
    rangeEl.dataset.out = velEl.dataset.out = !expected && (mean < n0 || mean > n1) ? 'true' : 'false';
    bandEl.style.left = `${pos(n0)}%`; bandEl.style.width = `${pos(n1) - pos(n0)}%`;
    markEl.style.left = `${pos(mean)}%`;
    gZero.style.left = `${pos(0)}%`; gLo.style.left = `${pos(n0)}%`; gHi.style.left = `${pos(n1)}%`;
    gHi.hidden = open;
    // (Each tick's number is centred on its point and the unit hangs after it: "40 cm/s" pulled left to fit put its 40 about
    // 5 cm/s short of the band's end.)
    set2(gLo, String(n0)); set2(gHi, open ? '' : String(n1));
    if (gLo.dataset.u !== (open ? 'cm/s' : '')) gLo.dataset.u = open ? 'cm/s' : '';
    rangeEl.title = open ? `Usual ${n0} cm/s or more` : `Usual ${n0}–${n1} cm/s`;
  }
  // A slide's own state (its fingerprint's network, presenter dataTo → tools.pin): the probed vessel's velocity as the scanner reads it.
  let pinAt = null;
  function pin(fp) { pinAt = fp?.at || null; }
  function pinnedVel() {
    const k = EI[probe];
    if (!pinAt || k == null) return NaN;
    return Math.abs(dopplerVel({ Q: pinAt.Q, D: pinAt.D }, k));
  }
  const set2 = (e, t) => { if (e.textContent !== t) e.textContent = t; };

  // The running mean behind a slide's reading: eases toward the 3 s mean over about six seconds (about a second and a half after a clear
  // change, a what-if or a new disease state), and starts again on a new vessel or after a gap.
  const steady = { probe: null, v: 0, t: 0, n: 0 };
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
  function updateReport() {
    const r = reading();
    if (!r) {
      setDir(frame?.clock === 'disease' ? 'Not available during time lapse' : 'Acquiring…'); dirEl.dataset.sev = '';
      rangeEl.hidden = true; velEl.dataset.out = 'false'; velEl.hidden = false;
      for (const e of [velEl.firstChild, patternEl, noteEl]) if (e.textContent) e.textContent = e === velEl.firstChild ? '—' : '';
      for (const k in statEls) setStat(statEls[k].dd, '—');
      return;
    }
    const p = meta();
    const it = interpret(r, gateFactor());
    const set = (e, t) => { if (e.textContent !== t) e.textContent = t; };
    setDir(it.dir); dirEl.dataset.sev = it.sev;
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
    const drawn = ovOn ? mean * pol() : mean;
    set(velEl.firstChild, num(drawn, Math.abs(drawn) < 10 ? 1 : 0));
    // (No flow, as in an occluded stent or a clotted vein: the words say it, "No flow · No signal", with no "0.0 cm/s" beside them,
    // and the figure's callout says "No flow" too.)
    const none = it.dir === 'No flow';
    if (velEl.hidden !== none) velEl.hidden = none;
    // (open: the open stent's velocity, from which the figure's callouts at a stent's three points read what its tiles read.)
    shownVel.set(probe, { v: Math.abs(mean), t: performance.now(), seg: isStentProbe() ? gateOf() : null, open });
    updateGauge(p, mean, it.expected);   // (the headline's own number: the marker read 23.5 under a headline of 22, sweep batch 04, shot 12)
    set(patternEl, it.pattern);
    // peak: the extreme farthest from zero, whichever the direction
    const [pk, tr] = Math.abs(r.vmax) >= Math.abs(r.vmin) ? [r.vmax, r.vmin] : [r.vmin, r.vmax];
    setStat(statEls.Peak.dd, num(pk * gf), 'cm/s');   // (a stent's peak at its gate)
    setStat(statEls.Trough.dd, num(tr * gf), 'cm/s');
    setStat(statEls.Pulsatility.dd, fmt(it.pi, 2));
    // Congestion index (portal vein): cross-sectional area / mean velocity, about 0.07 cm·s in health, over 0.1 suggests portal hypertension
    const isPV = probe === 'PV_TRUNK';
    showStat(statEls.CI.wrap, isPV);
    if (isPV && frame) {
      const D = Math.max(0.5, frame.D[EI[probe]]) / 10, area = Math.PI * D * D / 4;
      const vm = Math.abs(r.mean) / dopplerK(EDGES[EI[probe]]);   // Moriyasu's index uses the mean across the lumen
      vm > 0.3 ? setStat(statEls.CI.dd, fmt(area / vm, 2), 'cm·s') : setStat(statEls.CI.dd, '—');
    }
    // A stent: velocity at its portal end, middle and hepatic vein end, in place of trough and pulsatility.
    const isStent = p.kind === 'tips';
    showStat(statEls.Trough.wrap, !isStent); showStat(statEls.Pulsatility.wrap, !isStent);
    for (const k of ['Proximal', 'Mid', 'Distal']) showStat(statEls[k].wrap, isStent);
    if (isStent) {
      // Each segment against the usual 90–190 cm/s, the gated one marked.
      const at = gateOf();
      stentReads(open).forEach((v, i) => {
        const [seg, name] = SEGS[i], w = statEls[name].wrap, out = String(v < p.normal[0] || v > p.normal[1]);
        setStat(statEls[name].dd, num(v), 'cm/s');
        if (w.dataset.out !== out) w.dataset.out = out;
        w.classList.toggle('on', seg === at);
        const b = statEls[name].btn;
        if (b) {
          const on = String(seg === at), label = `${name}, ${num(v)} centimeters per second${seg === at ? ', sampling here' : ''}. Activate to sample here.`;
          if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
          if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
        }
      });
    }
    set(noteEl, it.note);
    const aria = `Spectral Doppler, ${EDGES[EI[probe]].label}, ${sweepSeconds}-second sweep: ${it.dir}, ${num(r.mean, 0)} centimeters per second, ${it.pattern}.`;
    if (cv.getAttribute('aria-label') !== aria) cv.setAttribute('aria-label', aria);
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
  let baseF = null;     // baseline position (fraction of height)
  let settleAt = 0;     // when the signal last fitted the current scale
  let tDisp = null;     // the display clock (model seconds)
  let wallLast = 0;
  let ovLast = '', ovAt = 0, ovOn = false, ovTop = 26;   // the report in the top strip (see draw)
  let img = null, off = null, octx = null;
  let floor = null, noiseAt = 0, nx = 0, ny = 0;
  let ringKey = '', lastCol = null, jit = 0, lineGain = 0, spk = null;
  const cc = [0, 0, 0, 0], sc = [0, 0, 0];   // scratch: one pixel's colour
  const A_SIG = 10 ** 2.8;          // signal power over the noise floor (≈ 28 dB)
  const FLOOR_DB = 4.5, RANGE_DB = 30;  // log compression: the grey map spans 4.5–34.5 dB
  const LN10_10 = 10 / Math.LN10;
  const GAIN = 1.1;                 // display gain on the grey map
  const PAD = 96;                   // the noise texture is this much larger than the display
  const live = () => !!frame?.running;
  const expo = () => -Math.log(1 - Math.random() * 0.999999);
  const mk = (w, h) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });

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

  // The noise floor: a screen-sized texture made once per size and shown at a new random offset
  // a few times a second. Like the grain, it is exponential power, independent from one spectral
  // line to the next but smooth over a few frequency bins along it, log-compressed.
  // (Made on a 128 px grid and kept while it covers the screen, so a monitor that settles by a few pixels
  // as its card enters, or its report grows, does not build it again.)
  function makeNoise(RW, RH, binPx, cw) {
    binPx *= 2;
    const TW = Math.ceil((RW + PAD) / 128) * 128, TH = Math.ceil((RH + PAD) / 128) * 128;
    const fi = new ImageData(TW, TH), F = fi.data;
    const nb = Math.ceil(TH / binPx) + 2;
    const nf = new Float32Array(nb);
    let nextLine = 0;
    for (let x = 0; x < TW; x++) {
      // a new spectral line every 1 to cw columns (at random, so there is no regular grid)
      if (!x || x >= nextLine) { nextLine = x + 1 + Math.floor(Math.random() * cw); for (let b = 0; b < nb; b++) nf[b] = expo(); }
      for (let y = 0; y < TH; y++) {
        const fb = y / binPx, b0 = fb | 0, f0 = fb - b0, f = f0 * f0 * (3 - 2 * f0);
        const N = nf[b0] + (nf[b0 + 1] - nf[b0]) * f;
        let I = (Math.log(N) * LN10_10 - 2.5) / RANGE_DB;
        I = I <= 0 ? 0 : Math.pow(Math.min(1, I), 1.2);
        const q = (y * TW + x) * 4;
        F[q] = 236 * I; F[q + 1] = 240 * I; F[q + 2] = 250 * I; F[q + 3] = 255;
      }
    }
    floor = mk(TW, TH); floor.getContext('2d').putImageData(fi, 0, 0);
    floor.dpr = cw;
  }

  // Synthesise spectral line c into the ring. Geometry in device pixels.
  function writeLine(c, g) {
    const { RW, RH, rBase, rPxPerV } = g;
    const x = ((c % RW) + RW) % RW;
    const v = velAt(c / g.cps, g);
    const has = !Number.isNaN(v);
    const av = Math.abs(v);
    // velocity band: in an artery (or the stent) the flow is fast and blunt, from ~0.45× the mean up to
    // the peak (dopplerK × the mean) with a clear window under it, and slow flow broadens toward the baseline; in a vein
    // the sample volume takes in the slow flow near the wall too, so the band fills to the baseline
    const s = v < 0 ? -1 : 1;
    // each spectral line is its own estimate: its top reaches a little further or less far, and
    // the whole line is a little brighter or dimmer, so the outline is jagged and the band shimmers
    // in time (held in the ring, so this scrolls with the trace)
    const rn = () => Math.random() + Math.random() + Math.random() - 1.5;
    jit = 0.45 * jit + rn(); lineGain = 0.5 * lineGain + rn();
    const P = av * g.k * (1 + 0.035 * jit);
    const gain = 10 ** (0.12 * lineGain);
    const L = av * (g.venous ? 0.05 : 0.45 - 0.4 * clamp(1 - av / 12, 0, 1));
    const sigHi = 0.02 * P + 0.4, sigLo = 0.08 * P + 1.2;
    const wf = Math.max(1.2, 0.025 * scale);      // wall filter cut-off, cm/s
    // the spectrum fades out over its last few pixels, so the speckle decides the contour
    const fadeV = 7 / rPxPerV;
    // this line's speckle: one exponential draw per frequency bin, half shared with the last line
    // (more at high pixel density, so a grain is about a CSS pixel wide whatever the screen)
    const nb = Math.ceil(RH / g.spkPx) + 2;
    if (!spk || spk.length !== nb) spk = Float32Array.from({ length: nb }, expo);
    for (let b = 0; b < nb; b++) spk[b] = g.spkMix * spk[b] + (1 - g.spkMix) * expo();
    // Colour modes: this line's variance (how fast the velocity is changing, plus turbulence at high
    // velocity); each pixel adds spectral broadening, more toward the slow edge of the band.
    const col = mode !== 'spectrum', uK = 1 / (0.7 * scale);
    let lineS = 0;
    if (col && has) {
      const vp = velAt(c / g.cps - 0.3, g);
      lineS = (Number.isNaN(vp) ? 0 : Math.abs(v - vp) / (0.45 * scale)) + 0.5 * clamp((av - 80) / 120, 0, 1);
    }
    const D = img.data;
    // No flow on this line (before the record starts, as on a slide's first sweep): every pixel is black,
    // so skip the per-pixel synthesis (a full redraw of an empty screen used to cost tens of ms).
    if (!has || av <= 0.3) {
      for (let ry = 0, q = x * 4; ry < RH; ry++, q += RW * 4) { D[q] = 0; D[q + 1] = 0; D[q + 2] = 0; D[q + 3] = 255; }
      return;
    }
    for (let ry = 0; ry < RH; ry++) {
      const vel = (rBase - ry) / rPxPerV;
      let S = 0;
      if (has && av > 0.3) {
        const u = vel * s;                                       // along the flow direction
        if (u > P) { const z = (u - P) / sigHi; S = 0.03 * Math.exp(-z * z); }
        else if (u >= L) {
          const f = (u - L) / Math.max(1e-6, P - L);
          // brightest just under the outline, where most of the blood moves (blunt flow), and
          // greyer toward the baseline; a vein keeps a dimmer fill all the way down
          S = g.venous ? Math.min(1, 0.05 + 0.1 * f + 0.9 * Math.exp(-(((0.88 - f) / 0.16) ** 2))) : 0.16 + 0.84 * Math.pow(f, 1.3);
          if (u > P - fadeV) { const z = (u - P + fadeV) / fadeV; S *= 1 - 0.985 * Math.sqrt(z); }
        }
        else if (u > 0) { const z = (L - u) / sigLo; S = 0.16 * Math.exp(-z * z); }
      }
      const a = Math.abs(vel) / wf;
      const W = a >= 1 ? 1 : a * a * a;                        // wall filter clears the baseline
      const fb = ry / g.spkPx, b0 = fb | 0, f0 = fb - b0, f = f0 * f0 * (3 - 2 * f0);
      const X = spk[b0] + (spk[b0 + 1] - spk[b0]) * f;
      const pw = (1 + A_SIG * S * gain * X) * W;
      let I = pw > 0 ? (Math.log(pw) * LN10_10 - FLOOR_DB) / RANGE_DB : 0;
      I = I <= 0 ? 0 : I >= 1 ? 1 : Math.pow(I, 1.2);
      const q = (ry * RW + x) * 4;
      let r = 236 * GAIN * I, gg = 240 * GAIN * I, bl = 250 * GAIN * I;
      if (col && I > 0) {
        // the map's colours as a tinted spectrum, exactly as the legend shows them: Velocity by the sign above or
        // below the baseline, Variance also by the variance; the sign above or below the
        // baseline decides toward or away (Invert has already flipped the trace, and with it the colors)
        const ff = P > L ? clamp((vel * s - L) / (P - L), 0, 1) : 1;
        dopplerColor(mode, { u: clamp(vel * uK, -1, 1), s: clamp(lineS + 0.45 * (1 - ff) * (1 - ff), 0, 1) }, false, cc);
        const t = Math.min(1, I * GAIN), cover = cc[3] * clamp((I - 0.02) / 0.2, 0, 1);
        shadeColor(cc, t, cover, sc);
        r = sc[0]; gg = sc[1]; bl = sc[2];
      }
      D[q] = r; D[q + 1] = gg; D[q + 2] = bl; D[q + 3] = 255;
    }
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
    collateral: [['Portal → systemic', 'Systemic → portal'], ['Closed', 'Open collateral'], 2],
  };
  function stripWords() {
    const [dirs, pats, digits] = STRIP_WORDS[meta().kind] || STRIP_WORDS.portal;
    // (the reading in tabular digits: "−00", and "−0.0" under 10; a stent or the artery reads up to "000", reversed only slowly)
    return { dirs: [...dirs, 'No flow'], pats: [...pats, 'No signal'], vels: [MINUS + '0.0', MINUS + '00', ...(digits > 2 ? ['000'] : [])] };
  }
  function setDir(t) {
    dirFull = t;
    const s = STEPS[stripStep][1] ? SHORT_DIR[t] || t : t;
    if (dirEl.textContent !== s) dirEl.textContent = s;
  }
  function stripStepSet(i) {
    const [k, short, wrap] = STEPS[i];
    stripStep = i;
    if (report.style.getPropertyValue('--dop-k') !== String(k)) report.style.setProperty('--dop-k', String(k));
    report.classList.toggle('dop-wrap', wrap);
    const s = short ? SHORT_DIR[dirFull] || dirFull : dirFull;
    if (dirEl.textContent !== s) dirEl.textContent = s;
  }
  function stripFits(i, have, spare) {
    const wrap = STEPS[i][2], box = (e) => { if (e.hidden || !e.textContent) return null; rng.selectNodeContents(e); const q = rng.getBoundingClientRect(); return q.width ? q : null; };
    const v = box(velEl), d = box(dirEl), p = box(patternEl), line = [v, d, wrap ? null : p].filter(Boolean);
    if (!line.length) return true;
    // (one row: with the pattern on its own line the strip may wrap, and the direction must not go down with it)
    if (wrap && v && d && (d.top >= v.bottom - 2 || d.left < v.right)) return false;
    // (the union of the line's words, the dot before the pattern included; 14 px for its end, which Safari's ranges leave out)
    const w = Math.max(...line.map((q) => q.right)) - Math.min(...line.map((q) => q.left)) + (p && !wrap ? 14 : 0);
    return w + spare <= have && (!wrap || !p || p.width + 14 + spare <= have);
  }
  // Puts the widest of some words in an element (measured at the current step) and gives back that word.
  function widest(e, words, map = (t) => t) {
    let best = '', bw = -1;
    for (const t of words) { e.textContent = map(t); rng.selectNodeContents(e); const q = rng.getBoundingClientRect().width; if (q > bw) { bw = q; best = map(t); } }
    e.textContent = best;
    return { text: best, width: bw };
  }
  // (stripFit: the width, type sizes and vessel kind the base step was chosen for; stripKey, read by draw(), changes with the step.)
  let stripFit = '', stripFull = 0, stripBase = 0, stripHave = 0, stripSc = 1, stripWordsKey = '';
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
      const was = { v: velB.textContent, p: patternEl.textContent, vh: velEl.hidden, ph: patternEl.hidden }, words = stripWords();
      velEl.hidden = false; patternEl.hidden = false; velB.style.minWidth = '';
      let base = STEPS.length - 1;
      for (let i = 0; i < STEPS.length; i++) {
        stripStepSet(i);
        widest(velB, words.vels); widest(dirEl, words.dirs, (t) => (STEPS[i][1] ? SHORT_DIR[t] || t : t)); widest(patternEl, words.pats);
        if (stripFits(i, have * sc, 0)) { base = i; break; }
      }
      stripStepSet(base);
      // (and the strip's height with them, which the trace starts under whatever the words: a pattern that comes after "Acquiring…")
      stripFull = Math.ceil(stripRect().bottom - cv.getBoundingClientRect().top) + 4;
      // (the number's slot, in em of its own type so it scales with any step: as wide as the widest reading)
      const slot = widest(velB, words.vels).width / sc / (parseFloat(getComputedStyle(velB).fontSize) || 1);
      velB.style.minWidth = `${Math.ceil(slot * 100) / 100}em`;
      velB.textContent = was.v; patternEl.textContent = was.p; velEl.hidden = was.vh; patternEl.hidden = was.ph;
      stripBase = base; stripHave = have; stripSc = sc; stripWordsKey = '';
    }
    // The words shown now: the base step holds them, unless they are wider than any reading (a notice), which take the
    // first smaller step that does, and give it back once they are gone.
    const wk = `${velEl.hidden ? '' : velB.textContent}|${dirFull}|${patternEl.textContent}`;
    if (wk === stripWordsKey) return;
    stripWordsKey = wk;
    if (patternEl.hidden) patternEl.hidden = false;
    let i = stripBase;
    for (; i < STEPS.length - 1; i++) { stripStepSet(i); if (stripFits(i, stripHave * stripSc, 0)) break; }
    stripStepSet(i);
    stripKey = `${stripFit}#${i}`;
  }

  // The strip's own words (the reading, direction and pattern), measured together: a phone's Tests card keeps the gauge and tiles
  // in the same box under the monitor, so the box itself is not the strip.
  function stripRect() {
    let l = Infinity, r = -Infinity, b = -Infinity;
    for (const e of [velEl, dirEl, patternEl]) {
      rng.selectNodeContents(e);
      const q = rng.getBoundingClientRect();
      if (!q.width) continue;
      l = Math.min(l, q.left); r = Math.max(r, q.right); b = Math.max(b, e.getBoundingClientRect().bottom);
    }
    return { width: r > l ? r - l + (patternEl.textContent && !patternEl.hidden ? 14 : 0) : 0, bottom: b };
  }

  function draw(now = performance.now()) {
    labBusy = false;
    const { ctx, w, h: hh } = fitCanvas(cv);
    const dpr = cv.width / Math.max(1, w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = cssVar('--black'); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // On a slide's data card the report sits in the top strip (CSS sets --dop-ov on the box): the strip is as tall as the
    // report, and the vessel and settings move to the bottom strip under the second ticks. Read again when the size changes.
    // (Its height is read only when the strip was refitted or the size changed, and it gives back room only by more than 4 px.)
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
      if (stripFit) { stripStepSet(0); stripKey = stripFit = stripWordsKey = ''; velEl.firstChild.style.minWidth = ''; }   // (off the strip the words are always whole and full size, the number its own width)
    }
    ovLast = ovKey;
    const padL = PAD_L, padR = PAD_R, padT = ovTop, padB = ovOn ? 34 : 20, yLab = ovOn ? hh - 11 : 13;
    // (A slide's paired trace takes a band at the foot of the trace area: the main trace is shorter by it, the card the same size.)
    const W = Math.max(1, Math.round(w - padL - padR)), Hall = Math.max(1, Math.round(hh - padT - padB)), PB = pair ? pairBand(Hall) : 0, H = PB ? Hall - PB - PAIR_GAP : Hall;
    if (w < 60 || hh < 60 || !Number.isFinite(H) || !Number.isFinite(W)) return;
    if (pickNext) pickWindow();
    const label = probe ? probeName(meta()) + (isStentProbe() ? ` · ${SEGS.find(([v]) => v === gateOf())[1]}` : '') : '';
    ctx.font = FONT(600, 12); ctx.fillStyle = cssAlpha('--white', .86); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, padL, yLab);
    const lw = ctx.measureText(label).width;
    ctx.font = FONT(500, 12); ctx.fillStyle = cssAlpha('--white', .5);
    // (The settings drop from the end, sweep first, where the strip is too narrow for all of them beside the units.)
    // (this frame's time, and the calipers' pick from it, before the strip: the index there is the marks' own, this frame)
    const tNow = buf.length >= 2 ? clockNow(now) : null;
    calNow(tNow, W);
    const pi = calText();
    let x0 = padL + lw + 12;
    if (pi) {
      ctx.font = FONT(700, 12); ctx.fillStyle = cssAlpha('--doppler', 1); ctx.fillText(pi, x0, yLab);
      x0 += ctx.measureText(pi).width + 12; ctx.font = FONT(500, 12); ctx.fillStyle = cssAlpha('--white', .5);
    }
    const parts = [mode === 'spectrum' ? 'PW' : 'PW + CD', `θ ${THETA}°`, `SV ${svMm()} mm`, `${sweepSeconds} s`], room = w - padR - x0 - 6;
    while (parts.length > 1 && ctx.measureText(parts.join('  ·  ')).width > room) parts.pop();
    if (ctx.measureText(parts.join('  ·  ')).width <= room) ctx.fillText(parts.join('  ·  '), x0, yLab);
    if (buf.length < 2) {
      tDisp = null;
      ctx.textAlign = 'center'; ctx.fillStyle = cssAlpha('--white', .55);
      ctx.fillText(frame?.clock === 'disease' ? 'Doppler samples at the bedside: return to the seconds clock.' : 'Acquiring…', w / 2, hh / 2);
      return;
    }
    // Scale: the peak fills about 85% of its side, on the scanner's own velocity steps. Like a
    // sonographer, the display changes scale or baseline only when the signal would clip or has
    // stayed small for a few seconds, never continuously (a moving scale would smear the picture).
    let pos = 0, neg = 0;
    const sgn = pol();
    for (const [t, v0] of buf) if (t >= tNow - sweepSeconds && t <= tNow) { const v = sgn * v0; if (v > pos) pos = v; if (-v > neg) neg = -v; }
    gf = gateFactor();
    const k = dopplerK(EDGES[EI[probe]]);
    pos *= k * gf; neg *= k * gf;
    // (The scale always holds the peak the reading beside it reports, so a −31 cm/s report never sits on a ±5 scale while new
    // samples are still reaching the window; the reading spans the last 3 s of the record, inside every sweep.)
    const rd = reading();
    if (rd) for (const v of [rd.vmax * gf * sgn, rd.vmin * gf * sgn]) { if (v > pos) pos = v; if (-v > neg) neg = -v; }
    const need = Math.max(pos, neg, 8) / 0.85;
    const target = scaleFor(Math.max(pos, neg));
    const tbRaw = pos + neg < 1 ? 0.5 : pos > 0 && neg < pos * 0.08 ? 0.88 : neg > 0 && pos < neg * 0.08 ? 0.12 : clamp(0.1 + 0.8 * (pos / (pos + neg)), 0.12, 0.88);
    const tbF = Math.round(tbRaw * 10) / 10;
    const fits = scale != null && need <= scale && (pos >= neg) === (baseF >= 0.5 || baseF == null);
    if (scale == null || !fits) { scale = target; baseF = tbF; settleAt = tNow; }
    else if (target < scale || Math.abs(tbF - baseF) > 0.15) { if (tNow - settleAt > 3) { scale = target; baseF = tbF; settleAt = tNow; } }
    else settleAt = tNow;
    const baseY = Math.round(H * baseF);
    // the scale belongs to the dominant side; the other side shows what fits
    const pxPerV = (baseF >= 0.5 ? baseY : H - baseY) / scale;

    // Spectrum, at device resolution, newest line at the right edge.
    const RW = Math.max(1, Math.round(W * dpr)), RH = Math.max(1, Math.round(H * dpr));
    const g = { RW, RH, rBase: baseY * dpr, rPxPerV: pxPerV * dpr, cps: RW / sweepSeconds, binPx: Math.max(1.5, RH / 200), spkPx: Math.max(2, RH / 110), spkMix: clamp(1 - 1 / dpr, 0.3, 0.65), pol: sgn, k, venous: meta().kind !== 'artery' && meta().kind !== 'tips' };
    const cNow = Math.floor(tNow * g.cps);
    const rest = `${scale}|${baseF}|${probe}|${sgn}|${sweepSeconds}|${mode}`, key = `${RW}x${RH}|${rest}`;
    if (!img || img.width !== RW || img.height !== RH) {
      const old = off, oRW = img?.width, oRH = img?.height;
      img = new ImageData(RW, RH);
      off = mk(RW, RH);
      octx = off.getContext('2d');
      // Only the size changed (a card settling as it enters, the top strip refitted): the trace already drawn is stretched
      // to the new size in two image copies instead of being synthesised again line by line, and new lines scroll in sharp.
      const lc = lastCol != null && old && ringKey === `${oRW}x${oRH}|${rest}` ? Math.floor(lastCol * RW / oRW) : null;
      if (lc != null && cNow >= lc && cNow - lc < RW) {
        const T = mk(oRW, oRH), tctx = T.getContext('2d'), po = ((lastCol % oRW) + oRW) % oRW;
        if (po + 1 < oRW) tctx.drawImage(old, po + 1, 0, oRW - po - 1, oRH, 0, 0, oRW - po - 1, oRH);
        tctx.drawImage(old, 0, 0, po + 1, oRH, oRW - po - 1, 0, po + 1, oRH);
        const sx = (lc + 1) % RW, fx = oRW / RW;   // (the oldest line shown goes to ring column sx)
        if (RW - sx > 0) octx.drawImage(T, 0, 0, (RW - sx) * fx, oRH, sx, 0, RW - sx, RH);
        if (sx > 0) octx.drawImage(T, (RW - sx) * fx, 0, sx * fx, oRH, 0, 0, sx, RH);
        ringKey = key; lastCol = lc;
      }
    }
    // redraw every line after a change of scale, size or colour, or when time runs backwards
    const full = key !== ringKey || lastCol == null || cNow < lastCol || cNow - lastCol >= RW;
    const from = full ? cNow - RW + 1 : lastCol + 1;
    for (let c = from; c <= cNow; c++) writeLine(c, g);
    if (full) octx.putImageData(img, 0, 0);
    else if (cNow > lastCol) {
      const x0 = ((from % RW) + RW) % RW, n = cNow - from + 1;
      if (x0 + n <= RW) octx.putImageData(img, 0, 0, x0, 0, n, RH);
      else { octx.putImageData(img, 0, 0, x0, 0, RW - x0, RH); octx.putImageData(img, 0, 0, 0, 0, x0 + n - RW, RH); }
    }
    ringKey = key; lastCol = cNow;
    // copy the ring out, oldest line on the left, pixel for pixel
    const p = ((cNow % RW) + RW) % RW;
    const dx = Math.round(padL * dpr), dy = Math.round(padT * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const ring = (c2, src, ox, oy) => {
      if (p + 1 < RW) c2.drawImage(src, p + 1, 0, RW - p - 1, RH, ox, oy, RW - p - 1, RH);
      c2.drawImage(src, 0, 0, p + 1, RH, ox + RW - p - 1, oy, p + 1, RH);
    };
    ring(ctx, off, dx, dy);
    // the noise floor, fixed to the screen: a new random view of the texture ~10 times a second
    if (!floor || floor.width < RW + PAD || floor.height < RH + PAD || floor.dpr !== Math.max(1, dpr)) makeNoise(RW, RH, g.binPx, Math.max(1, dpr));
    if (now - noiseAt > 100) { noiseAt = now; nx = (Math.random() * (floor.width - RW)) | 0; ny = (Math.random() * (floor.height - RH)) | 0; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = mode === 'spectrum' ? 1 : 0.3;
    ctx.drawImage(floor, nx, ny, RW, RH, dx, dy, RW, RH);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // the wall filter removes the noise near the baseline as well as the slow signal
    const wfPx = Math.max(1.2, 0.025 * scale) * g.rPxPerV * 1.6, by = dy + g.rBase;
    const wg = ctx.createLinearGradient(0, by - wfPx, 0, by + wfPx);
    wg.addColorStop(0, cssAlpha('--black', 0)); wg.addColorStop(0.5, cssAlpha('--black', .9)); wg.addColorStop(1, cssAlpha('--black', 0));
    ctx.fillStyle = wg; ctx.fillRect(dx, Math.max(dy, by - wfPx), RW, Math.min(dy + RH, by + wfPx) - Math.max(dy, by - wfPx));
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Baseline
    ctx.fillStyle = cssAlpha('--white', .8); ctx.fillRect(padL, padT + baseY, W, 1);
    // Velocity scale on the right
    ctx.font = FONT(500, 12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // ticks: a labelled tick every 1, 2, 5, 10, 20, 50 ... cm/s (the first that gives at most five a side), a half tick between
    // (and labels at least 18 px apart, so a short trace keeps a few readable ones rather than a stack)
    const lab = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((x) => scale / x <= 5 && x * pxPerV >= 18) || 500, minor = lab / 2;
    for (let k = -Math.ceil(scale / minor); k <= Math.ceil(scale / minor); k++) {
      const v = k * minor, y = padT + baseY - v * pxPerV;
      if (y < padT - 1 || y > padT + H + 1) continue;
      const major = k % 2 === 0;
      ctx.fillStyle = cssAlpha('--white', .55); ctx.fillRect(padL + W + 3, Math.round(y), major ? 6 : 3, 1);
      if (major && y > padT + 5 && y < padT + H - 5) { ctx.fillStyle = cssAlpha('--white', .78); ctx.fillText(v === 0 ? '0' : num(v), padL + W + 13, y); }
    }
    // The scale's unit: top right, or, when the reading fills the top strip, bottom right under the scale, clear of its words
    // (the bottom strip's settings stop short of the scale's margin).
    // (left out where a narrow monitor's bottom label would run into it: the strip's reading already names the unit)
    ctx.fillStyle = cssAlpha('--white', .5); ctx.textAlign = 'right';
    if (!ovOn || padL + lw + 8 <= w - 6 - ctx.measureText('cm/s').width) ctx.fillText('cm/s', w - 6, ovOn ? yLab : 13);
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
        const pts = hvWaves(tNow - sweepSeconds, tNow, sgn);
        if (pts.length && pts[0][0] >= edge) wl = { pts, sgn, alpha: 0, out: false };
      }
      if (wl) {
        wl.alpha = clamp(wl.alpha + (wl.out ? -1 : 1) * dtL / 0.4, 0, 1);
        labBusy = wl.out ? wl.alpha > 0 : wl.alpha < 1;
        const A = wl.alpha * wl.alpha * (3 - 2 * wl.alpha);
        ctx.font = FONT(700, WAVE_PX); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        const at = (t, v) => [padL + (RW - 1 - (cNow - Math.floor(t * g.cps))) / dpr, padT + baseY - v * k * pxPerV];
        for (const [t, v, name] of wl.pts) {
          // (The a-wave's letter sits just past the baseline on its side, clear of the spectrum, even when it barely crosses.)
          const up = name === 'a', [x, y0] = at(t, v), y = up ? Math.min(y0, padT + baseY) : y0;
          if (x < padL + 2 || x > padL + W - 2) continue;
          const ty = clamp(y + (up ? -5 : 5), padT + (up ? WAVE_PX + 1 : 0), padT + H - (up ? 0 : WAVE_PX + 1));
          ctx.textBaseline = up ? 'bottom' : 'top';
          ctx.lineWidth = 5; ctx.strokeStyle = cssAlpha('--black', 0.9 * A); ctx.strokeText(name, x, ty);
          ctx.fillStyle = cssAlpha('--white', A); ctx.fillText(name, x, ty);
        }
      }
    } else { wl = null; }
    const xAt = (t) => padL + (RW - 1 - (cNow - Math.floor(t * g.cps))) / dpr;
    drawCalipers(ctx, { now, sgn, k, pxPerV, baseY, padT, padL, W, H });
    if (PB) drawPair(ctx, { tNow, y0: padT + H + PAIR_GAP, PB, padL, W, xAt });
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
  let calip = false, cal = null, calMk = {};
  const CAL_W = 2, CAL_TICK = 4;
  function calNow(tNow, W) {
    cal = calip && tNow != null && probe ? caliperFrame(buf, tNow, sweepSeconds, W, CAL_W) : null;
    if (cal) cal.gf = gateFactor(); else calMk = {};
  }
  function drawCalipers(ctx, { now, sgn, k, pxPerV, baseY, padT, padL, W, H }) {
    if (!cal) return;
    // (each level on the spectrum's outline, where the reading's peak is read: the mean across the lumen times dopplerK; kept
    // 2 px inside the trace so its dark edge is never cut off)
    const yOf = (v) => clamp(padT + baseY - sgn * v * k * cal.gf * pxPerV, padT + 2, padT + H - 2);
    const xc = caliperX(padL, CAL_TICK), x1 = padL + W, secs = (t) => (now - t) / 1000, lv = {};
    for (const w of ['hi', 'lo']) {
      const v = cal[w][1], m = calMk[w];
      if (!m) calMk[w] = { from: v, to: v, at: now };
      else if (m.to !== v) calMk[w] = { from: caliperLevel(m.from, m.to, secs(m.at)), to: v, at: now };
      const c = calMk[w];
      if (secs(c.at) < CAL_FADE) labBusy = true;
      lv[w] = Math.round(yOf(caliperLevel(c.from, c.to, secs(c.at)))) + 0.5;
    }
    ctx.save();
    // What the index measures is the gap in speed between the two levels: each runs dashed across the trace, and the upright
    // with end ticks spans the two.
    // (all drawn over the trace and its baseline, each dash and the upright on a dark edge of its own, so a level on the bright
    // spectrum or on the baseline, as a trough near 0 is, still shows; the dark sits only under the dashes, never as a band)
    ctx.beginPath();
    for (const y of [lv.hi, lv.lo]) { ctx.moveTo(xc, y); ctx.lineTo(x1, y); }
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = cssAlpha('--black', 0.85); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = cssAlpha('--doppler', 0.95); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
    const T = CAL_TICK;
    ctx.beginPath(); ctx.moveTo(xc, lv.hi); ctx.lineTo(xc, lv.lo); ctx.moveTo(xc - T, lv.hi); ctx.lineTo(xc + T, lv.hi); ctx.moveTo(xc - T, lv.lo); ctx.lineTo(xc + T, lv.lo);
    ctx.strokeStyle = cssAlpha('--black', 0.85); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = cssAlpha('--doppler', 1); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  // (The index is read in the bottom strip, first after the probe's name, in the marks' colour: off the spectrum, always whole.)
  const calText = () => (cal ? `PI ${fmt(cal.pi, 2)}` : '');

  // ── A slide's paired trace (V29): the paired vessel's velocity over the same seconds as the main trace, beat for beat, as
  // the scanner would draw it (a hepatic vein's forward flow below its baseline), slim, in a band of its own under the main
  // trace with its own scale, named on its left. ──
  let pair = false, pairSc = null;
  function drawPair(ctx, { tNow, y0, PB, padL, W, xAt }) {
    const id = pairOf(meta().kind), pm = PROBES.find((p) => p.id === id), kp = dopplerK(EDGES[EI[id]]);
    const s = (pm.away ? -1 : 1) * (invert ? -1 : 1) * kp;
    const pts = [];
    let pos = 0, neg = 0;
    for (const p of buf) {
      if (p[0] < tNow - sweepSeconds || p[0] > tNow || !Number.isFinite(p[2])) continue;
      const v = s * p[2]; pts.push([p[0], v]); if (v > pos) pos = v; if (-v > neg) neg = -v;
    }
    // (its scale holds still as the main one does: it grows at once when the trace would clip, and shrinks only after 3 s)
    const want = pairScale(pos, neg), need = Math.max(pos, neg, 8) / 0.85;
    if (!pairSc || pairSc.id !== id || need > pairSc.scale || (want.base >= 0.5) !== (pairSc.base >= 0.5)) pairSc = { id, ...want, at: tNow };
    else if (want.scale < pairSc.scale || Math.abs(want.base - pairSc.base) > 0.15) { if (tNow - pairSc.at > 3) pairSc = { id, ...want, at: tNow }; }
    else pairSc.at = tNow;
    const by = y0 + Math.round(PB * pairSc.base), ppv = (pairSc.base >= 0.5 ? by - y0 : y0 + PB - by) / pairSc.scale;
    ctx.save();
    ctx.fillStyle = cssAlpha('--white', 0.06); ctx.fillRect(padL, y0, W, PB);
    ctx.fillStyle = cssAlpha('--white', 0.5); ctx.fillRect(padL, by, W, 1);
    if (pts.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const x = xAt(pts[i][0]), y = clamp(by - pts[i][1] * ppv, y0, y0 + PB); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.strokeStyle = cssAlpha('--white', 0.9); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    }
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
    calip = !!t?.calipers; cal = null; calMk = {};   // (a new slide's calipers pick from its own trace)
    if (pair !== !!t?.pair) { pair = !!t?.pair; pairSc = null; }
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
  function hvWaves(t0, t1, sgn) {
    const p = buf.filter(([t]) => t >= t0 && t <= t1);
    if (p.length < 12) return [];
    const y = p.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(p.length - 1, i + 2); j++) { s += sgn * p[j][1]; n++; } return s / n; });
    const top = Math.max(...y), bot = Math.min(...y);   // (top: the biggest reversal, which has to exist)
    if (top < 0.5 || bot > -5) return [];
    const ext = (i, s) => s * y[i] >= s * y[i - 1] && s * y[i] >= s * y[i + 1];
    // An a-wave: the highest point within 0.3 s either side, at or near the baseline.
    const crest = (i) => { for (let j = i - 1; j >= 0 && p[i][0] - p[j][0] < 0.3; j--) if (y[j] > y[i]) return false; for (let j = i + 1; j < y.length && p[j][0] - p[i][0] < 0.3; j++) if (y[j] > y[i]) return false; return true; };
    const aI = [];
    for (let i = 1; i < y.length - 1; i++) if (y[i] > bot * 0.15 && ext(i, 1) && crest(i) && (!aI.length || p[i][0] - p[aI.at(-1)][0] > 0.35)) aI.push(i);
    // Only the newest settled whole beat is named, as a textbook marks one cycle: every beat at once crowds the trace.
    // A beat is named once its closing a-wave has settled (the last 0.35 s of the record can still change), so the letters never shift afterwards.
    const tEnd = p[p.length - 1][0] - 0.35;
    for (let b = aI.length - 2; b >= 0; b--) {
      if (p[aI[b + 1]][0] > tEnd) continue;
      const lows = [];
      for (let i = aI[b] + 1; i < aI[b + 1]; i++) if (y[i] < bot * 0.25 && ext(i, -1)) lows.push(i);
      // Keep the deepest trough of each dip (troughs closer than 0.12 s are one wave), then the two deepest dips.
      const dips = [];
      for (const i of lows) { const d = dips.at(-1); if (d && p[i][0] - p[d][0] < 0.12) { if (y[i] < y[d]) dips[dips.length - 1] = i; } else dips.push(i); }
      if (dips.length < 2) continue;
      const two = [...dips].sort((m, n) => y[m] - y[n]).slice(0, 2).sort((m, n) => m - n);
      // v: the turn toward the baseline between S and D (the highest point between their troughs).
      let v = two[0] + 1;
      for (let i = two[0] + 1; i < two[1]; i++) if (y[i] > y[v]) v = i;
      return [[p[aI[b]][0], y[aI[b]], 'a'], [p[two[0]][0], y[two[0]], 'S'], [p[v][0], y[v], 'v'], [p[two[1]][0], y[two[1]], 'D']];
    }
    return [];
  }
  let raf = 0, askedAt = 0, paintAt = 0, reportDue = false;
  function loop(now) {
    raf = 0;
    if (!frame || !shown()) { if (reportDue) { reportDue = false; updateReport(); } return; }
    // The running trace scrolls on every frame the screen offers (15 a second in Battery saver). Its samples are the model's,
    // whatever the frame rate: each frame adds only the columns its elapsed time covers. A change while paused draws at once.
    if (live() && !labBusy && now - paintAt < paceMs()) { raf = nextFrame(loop); return; }
    paintAt = now;
    // (The words are set in the same frame as the picture, so the reading and the trace and its scale never disagree.)
    if (reportDue) { reportDue = false; updateReport(); }
    draw(now);
    noteDraw('doppler');
    if ((live() && now - askedAt < 400) || labBusy) raf = nextFrame(loop);
  }
  function redraw() {
    if (!frame) return;
    reportDue = true;
    if (!shown()) { reportDue = false; updateReport(); }
    askedAt = performance.now();
    if (!raf) raf = nextFrame(loop);
  }
  function update(f) { ingest(f); redraw(); }
  function clear() { buf = []; wl = null; redraw(); }
  // (A new recording of the same vessel: as a new probe, the trace, its scale and its reading start over.)
  function restart() { buf = []; wl = null; tOff = 0; synth = null; scale = null; steady.probe = null; redraw(); }
  /** A slide is showing this monitor: choose its window again from the width it is drawn at. (The trace already drawn
   *  stays: only a change of window redraws it, so a slide that keeps the window enters without a full repaint.) */
  function autoWindow() { manualSweep = false; pickNext = true; redraw(); }
  /** Name the hepatic vein's a, S, v and D waves on the trace (the Presenter's waveform slides). */
  function setWaves(on) { if (waves !== !!on) { waves = !!on; redraw(); } }
  return { id: 'doppler', label: 'Doppler', el, update, ingest, redraw, clear, restart, setInvert, setWaves, autoWindow, pin, configure };
}
