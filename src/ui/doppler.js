// Spectral Doppler: pulsed-wave velocity in one vessel, drawn as the scanner draws it (a
// grey-scale spectrum on black, flow toward the transducer above the baseline), with the reading
// a sonographer would report beside it: direction, velocity against the vessel's normal range,
// and the waveform pattern. The trace keeps recording while the instrument is closed, so it opens
// full. It scrolls smoothly, one spectral line at a time, as the machine does.

import { EDGES } from '../engine/topology.js?v=29d10ad9ef';
import { h, fmt, fitCanvas, clamp, icon } from './util.js?v=8aa5e5cdf1';
import { FONT } from './charts.js?v=480baae265';
import { DOPPLER_MODES, dopplerColor, shadeColor, swatchGradient } from './dopplerColor.js?v=fe9fd40247';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
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
  { id: 'C1b', short: 'Varix C1', kind: 'collateral', normal: null },
  { id: 'C3', short: 'Paraumb. C3', kind: 'collateral', normal: null },
];
const SWEEP_SECONDS = [6, 3, 12]; // Start at 6 s; first tap shortens the visible window.
const KEEP = 16;                 // Retain enough samples for the 12 s sweep and display lag.
const MINUS = '−';
const num = (v, d = 0) => (v < 0 ? MINUS : '') + fmt(Math.abs(v), d);

export function createDoppler({ onProbe }) {
  let sweepIndex = 0;
  let sweepSeconds = SWEEP_SECONDS[sweepIndex];
  const probeSel = h('select', { class: 'select dop-vessel', 'aria-label': 'Vessel' },
    PROBES.map((p) => h('option', { value: p.id, title: EDGES[EI[p.id]].label }, p.short)));
  probeSel.addEventListener('change', () => onProbe(probeSel.value));
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
  invBtn.addEventListener('click', () => { invert = !invert; invBtn.setAttribute('aria-pressed', String(invert)); sync(); });
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
  sweepBtn.addEventListener('click', () => {
    sweepIndex = (sweepIndex + 1) % SWEEP_SECONDS.length;
    sweepSeconds = SWEEP_SECONDS[sweepIndex];
    sweepBtn.lastChild.textContent = `${sweepSeconds} s`;
    sweepBtn.title = `Sweep window: ${sweepSeconds} seconds. Tap to cycle.`;
    sweepBtn.setAttribute('aria-label', `Doppler sweep duration: ${sweepSeconds} seconds. Activate to cycle.`);
    ringKey = '';
    if (frame) { updateReport(); draw(); }
  });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Spectral Doppler' });
  const box = h('div', { class: 'chart-box dark dop-box' }, cv);

  // The report
  const dirEl = h('b', { class: 'dop-dir' }, '—');
  const velEl = h('span', { class: 'dop-vel' }, h('b', {}, '—'), h('small', {}, 'cm/s mean'));
  const rangeEl = h('span', { class: 'dop-range' });
  const patternEl = h('div', { class: 'dop-pattern' });
  const noteEl = h('p', { class: 'dop-note' });
  const statEls = {};
  const stats = h('dl', { class: 'dop-stats' }, ['Peak', 'Trough', 'Pulsatility', 'CI'].map((k) => {
    const dd = h('dd', {}, '—'); const wrap = h('div', {}, h('dt', {}, k), dd); statEls[k] = { dd, wrap }; return wrap;
  }));
  const report = h('div', { class: 'dop-report' }, dirEl, h('div', { class: 'dop-velrow' }, velEl, rangeEl), patternEl, stats, noteEl);
  const el = h('div', { class: 'dop', 'data-pane': 'doppler' },
    h('div', { class: 'dop-head' }, probeSel, h('div', { class: 'dop-btns' }, modeBtn, invBtn, sweepBtn)), h('div', { class: 'dop-main' }, box, report));

  // ── Samples ───────────────────────────────────────
  let buf = [];
  let probe = null, frame = null;
  sync();
  function ingest(f) {
    frame = f;
    if (f.probe !== probe) { buf = []; probe = f.probe; if (probeSel.value !== probe) probeSel.value = probe; }
    const s = f.samples;
    if (!s || f.clock === 'disease' || !s.t.length) return;
    if (buf.length && s.t[0] < buf[buf.length - 1][0] - 1e-9) buf = [];
    for (let i = 0; i < s.t.length; i++) if (!buf.length || s.t[i] > buf[buf.length - 1][0]) buf.push([s.t[i], s.vel[i]]);
    const tNow = buf[buf.length - 1][0];
    let cut = 0; while (cut < buf.length && buf[cut][0] < tNow - KEEP) cut++;
    if (cut) buf.splice(0, cut);
  }

  // ── Reading ───────────────────────────────────────
  function reading() {
    if (buf.length < 4) return null;
    const tNow = buf[buf.length - 1][0];
    let sum = 0, n = 0, vmax = -Infinity, vmin = Infinity;
    for (let i = buf.length - 1; i >= 0 && buf[i][0] >= tNow - 3; i--) {
      const v = buf[i][1]; sum += v; n++;
      if (v > vmax) vmax = v; if (v < vmin) vmin = v;
    }
    const mean = sum / n;
    // Peak of the spectrum ≈ 1.3 × the mean velocity across the lumen
    return { mean, vmax: vmax * 1.3, vmin: vmin * 1.3, vmaxMean: vmax, vminMean: vmin };
  }
  const meta = () => PROBES.find((p) => p.id === probe) || PROBES[0];
  // +1 when the vessel's forward flow is drawn above the baseline, −1 when below
  const effInvert = () => invert;
  const pol = () => (!meta().away !== !effInvert() ? -1 : 1);

  function interpret(r) {
    const p = meta();
    const a = Math.abs(r.mean);
    const swing = r.vmaxMean - r.vminMean;
    const big = Math.max(Math.abs(r.vmaxMean), Math.abs(r.vminMean));
    const pi = big > 0.5 ? swing / big : 0;
    const reverses = r.vminMean < -1.5 && r.vmaxMean > 1.5;
    let dir, sev, pattern, note;
    if (a < 1 && big < 2 && p.kind !== 'collateral') {
      dir = 'No flow'; sev = 'critical'; pattern = 'No signal';
      note = p.kind === 'tips' ? 'No flow in the stent: occluded.' : 'No detectable flow: the vessel is occluded, as in thrombosis.';
    } else if (p.kind === 'portal') {
      if (a < 5 && !reverses) { dir = 'Stasis'; sev = 'danger'; }
      else if (reverses && Math.abs(r.mean) < swing * 0.35) { dir = 'To-and-fro'; sev = 'danger'; }
      else if (r.mean < 0) { dir = 'Hepatofugal'; sev = 'critical'; }
      else { dir = 'Hepatopetal'; sev = a < p.normal[0] ? 'caution' : 'ok'; }
      pattern = pi > 0.5 ? 'Pulsatile' : pi > 0.15 ? 'Phasic' : 'Monophasic';
      note = dir === 'Hepatofugal' ? 'Flow runs away from the liver: portal blood is leaving through collaterals.'
        : dir === 'To-and-fro' ? 'Flow swings both ways each cycle, on the way to reversal.'
        : dir === 'Stasis' ? 'Almost no net flow: a setting for portal vein thrombosis.'
        : pattern === 'Pulsatile' ? 'A pulsatile portal vein suggests right-heart pressure transmitted back (heart failure, tricuspid regurgitation).'
        : a < p.normal[0] ? 'Toward the liver but slow: typical of portal hypertension.'
        : 'Normal: toward the liver with gentle phasicity.';
    } else if (p.kind === 'hepatic') {
      dir = r.mean < 0 ? 'Reversed' : 'Toward the heart'; sev = r.mean < 0 ? 'danger' : 'ok';
      pattern = r.vminMean < -1 ? 'Triphasic' : pi > 0.3 ? 'Biphasic' : 'Monophasic';
      if (pattern === 'Monophasic') sev = sev === 'ok' ? 'caution' : sev;
      note = pattern === 'Triphasic' ? 'Normal: the atrial a-wave briefly reverses flow each beat.'
        : pattern === 'Biphasic' ? 'Damped: the a-wave no longer reverses flow.'
        : 'Flat: a stiff liver (cirrhosis) or an outflow block damps the cardiac waveform.';
    } else if (p.kind === 'artery') {
      dir = r.mean < 0 ? 'Reversed' : 'Antegrade'; sev = r.mean < 0 ? 'danger' : 'ok';
      const ri = r.vmax > 0.5 ? (r.vmax - Math.max(0, r.vmin)) / r.vmax : 0;
      pattern = `Resistive index ${fmt(ri, 2)}`;
      note = 'The hepatic artery buffers falling portal inflow by dilating (the hepatic arterial buffer response).';
    } else if (p.kind === 'tips') {
      dir = a < 2 ? 'No flow' : r.mean < 0 ? 'Reversed' : 'Portal → hepatic vein'; sev = a < 2 || r.mean < 0 ? 'critical' : a < 50 || a > 250 ? 'caution' : 'ok';
      pattern = a < 2 ? 'Occluded' : a < 50 ? 'Low velocity' : a > 250 ? 'High velocity' : 'Patent';
      note = a < 2 ? 'No flow in the stent: occluded.' : 'Shunt velocities under about 50 or over 250 cm/s suggest stenosis.';
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

  function updateReport() {
    const r = reading();
    if (!r) { dirEl.textContent = frame?.clock === 'disease' ? 'Paused on the disease clock' : 'Acquiring…'; dirEl.dataset.sev = ''; return; }
    const p = meta();
    const it = interpret(r);
    const set = (e, t) => { if (e.textContent !== t) e.textContent = t; };
    set(dirEl, it.dir); dirEl.dataset.sev = it.sev;
    set(velEl.firstChild, num(r.mean, Math.abs(r.mean) < 10 ? 1 : 0));
    set(rangeEl, p.normal ? `Usual ${p.normal[0]}–${p.normal[1]} cm/s` : '');
    set(patternEl, it.pattern);
    // peak: the extreme farthest from zero, whichever the direction
    const [pk, tr] = Math.abs(r.vmax) >= Math.abs(r.vmin) ? [r.vmax, r.vmin] : [r.vmin, r.vmax];
    set(statEls.Peak.dd, `${num(pk)} cm/s`);
    set(statEls.Trough.dd, `${num(tr)} cm/s`);
    set(statEls.Pulsatility.dd, fmt(it.pi, 2));
    // Congestion index (portal vein): cross-sectional area / mean velocity, normal < 0.07 cm·s
    const isPV = probe === 'PV_TRUNK';
    statEls.CI.wrap.hidden = !isPV;
    if (isPV && frame) {
      const D = Math.max(0.5, frame.D[EI[probe]]) / 10, area = Math.PI * D * D / 4;
      set(statEls.CI.dd, Math.abs(r.mean) > 0.5 ? `${fmt(area / Math.abs(r.mean), 2)} cm·s` : '—');
    }
    set(noteEl, it.note);
    const aria = `Spectral Doppler, ${EDGES[EI[probe]].label}, ${sweepSeconds}-second sweep: ${it.dir}, mean ${num(r.mean, 0)} centimeters per second, ${it.pattern}.`;
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
  let img = null, off = null, octx = null;
  let floor = null, noiseAt = 0, nx = 0, ny = 0;
  let ringKey = '', lastCol = null, jit = 0, lineGain = 0, spk = null;
  const STEPS = [8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300];
  const cc = [0, 0, 0, 0], sc = [0, 0, 0];   // scratch: one pixel's colour
  const A_SIG = 10 ** 2.8;          // signal power over the noise floor (≈ 28 dB)
  const FLOOR_DB = 4.5, RANGE_DB = 30;  // log compression: the grey map spans 4.5–34.5 dB
  const LN10_10 = 10 / Math.LN10;
  const GAIN = 1.1;                 // display gain on the grey map
  const PAD = 96;                   // the noise texture is this much larger than the display
  const live = () => !!frame?.running && frame.clock !== 'disease';
  const expo = () => -Math.log(1 - Math.random() * 0.999999);
  const mk = (w, h) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });

  // Model time shown at the right edge. Follows the samples by ~0.16 s of wall time so there is
  // always data to draw, and eases back to that lag instead of jumping when frames come unevenly.
  function clockNow(now) {
    const tLast = buf[buf.length - 1][0];
    const dt = wallLast ? Math.min(0.1, (now - wallLast) / 1000) : 0;
    wallLast = now;
    const speed = frame?.speed || 1;
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
    return g.pol * (tb > ta ? va + (vb - va) * clamp((t - ta) / (tb - ta), 0, 1) : va);
  }

  // The noise floor: a screen-sized texture made once per size and shown at a new random offset
  // a few times a second. Like the grain, it is exponential power, independent from one spectral
  // line to the next but smooth over a few frequency bins along it, log-compressed.
  function makeNoise(RW, RH, binPx, cw) {
    binPx *= 2;
    const TW = RW + PAD, TH = RH + PAD;
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
    floor.key = `${RW}x${RH}`;
  }

  // Synthesise spectral line c into the ring. Geometry in device pixels.
  function writeLine(c, g) {
    const { RW, RH, rBase, rPxPerV } = g;
    const x = ((c % RW) + RW) % RW;
    const v = velAt(c / g.cps, g);
    const has = !Number.isNaN(v);
    const av = Math.abs(v);
    // velocity band: in an artery (or the stent) the flow is fast and blunt, from ~0.45× to 1.3×
    // the mean with a clear window under it, and slow flow broadens toward the baseline; in a vein
    // the sample volume takes in the slow flow near the wall too, so the band fills to the baseline
    const s = v < 0 ? -1 : 1;
    // each spectral line is its own estimate: its top reaches a little further or less far, and
    // the whole line is a little brighter or dimmer, so the outline is jagged and the band shimmers
    // in time (held in the ring, so this scrolls with the trace)
    const rn = () => Math.random() + Math.random() + Math.random() - 1.5;
    jit = 0.45 * jit + rn(); lineGain = 0.5 * lineGain + rn();
    const P = av * 1.3 * (1 + 0.035 * jit);
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

  function draw(now = performance.now()) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    const dpr = cv.width / Math.max(1, w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const padL = 12, padR = 46, padT = 26, padB = 20;
    const W = Math.max(1, Math.round(w - padL - padR)), H = Math.max(1, Math.round(hh - padT - padB));
    if (w < 60 || hh < 60) return;
    const label = probe ? EDGES[EI[probe]].label : '';
    ctx.font = FONT(600, 11); ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, padL, 13);
    const lw = ctx.measureText(label).width;
    ctx.font = FONT(500, 11); ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillText(`${mode === 'spectrum' ? 'PW' : 'PW + CD'}  ·  θ 60°  ·  SV 3 mm  ·  ${sweepSeconds} s`, padL + lw + 12, 13);
    if (buf.length < 2) {
      tDisp = null;
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(frame?.clock === 'disease' ? 'Doppler samples at the bedside: return to the seconds clock.' : 'Acquiring…', w / 2, hh / 2);
      return;
    }
    // Scale: the peak fills about 85% of its side, on the scanner's own velocity steps. Like a
    // sonographer, the display changes scale or baseline only when the signal would clip or has
    // stayed small for a few seconds, never continuously (a moving scale would smear the picture).
    const tNow = clockNow(now);
    let pos = 0, neg = 0;
    const sgn = pol();
    for (const [t, v0] of buf) if (t >= tNow - sweepSeconds && t <= tNow) { const v = sgn * v0; if (v > pos) pos = v; if (-v > neg) neg = -v; }
    pos *= 1.3; neg *= 1.3;
    const need = Math.max(pos, neg, 8) / 0.85;
    const target = STEPS.find((x) => x >= need) || STEPS[STEPS.length - 1];
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
    const g = { RW, RH, rBase: baseY * dpr, rPxPerV: pxPerV * dpr, cps: RW / sweepSeconds, binPx: Math.max(1.5, RH / 200), spkPx: Math.max(2, RH / 110), spkMix: clamp(1 - 1 / dpr, 0.3, 0.65), pol: sgn, venous: meta().kind !== 'artery' && meta().kind !== 'tips' };
    const cNow = Math.floor(tNow * g.cps);
    const key = `${RW}x${RH}|${scale}|${baseF}|${probe}|${sgn}|${sweepSeconds}|${mode}`;
    if (!img || img.width !== RW || img.height !== RH) {
      img = new ImageData(RW, RH);
      off = mk(RW, RH);
      octx = off.getContext('2d');
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
    if (floor?.key !== `${RW}x${RH}`) makeNoise(RW, RH, g.binPx, Math.max(1, dpr));
    if (now - noiseAt > 100) { noiseAt = now; nx = (Math.random() * PAD) | 0; ny = (Math.random() * PAD) | 0; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = mode === 'spectrum' ? 1 : 0.3;
    ctx.drawImage(floor, nx, ny, RW, RH, dx, dy, RW, RH);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // the wall filter removes the noise near the baseline as well as the slow signal
    const wfPx = Math.max(1.2, 0.025 * scale) * g.rPxPerV * 1.6, by = dy + g.rBase;
    const wg = ctx.createLinearGradient(0, by - wfPx, 0, by + wfPx);
    wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(0.5, 'rgba(0,0,0,.9)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wg; ctx.fillRect(dx, Math.max(dy, by - wfPx), RW, Math.min(dy + RH, by + wfPx) - Math.max(dy, by - wfPx));
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Baseline
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(padL, padT + baseY, W, 1);
    // Velocity scale on the right
    ctx.font = FONT(500, 10.5); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // ticks: a labelled tick every 1, 2, 5, 10, 20, 50 ... cm/s (the first that gives at most five a side), a half tick between
    const lab = [1, 2, 5, 10, 20, 50, 100, 200].find((x) => scale / x <= 5) || 100, minor = lab / 2;
    for (let k = -Math.ceil(scale / minor); k <= Math.ceil(scale / minor); k++) {
      const v = k * minor, y = padT + baseY - v * pxPerV;
      if (y < padT - 1 || y > padT + H + 1) continue;
      const major = k % 2 === 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(padL + W + 3, Math.round(y), major ? 6 : 3, 1);
      if (major && y > padT + 5 && y < padT + H - 5) { ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText(v === 0 ? '0' : num(v), padL + W + 13, y); }
    }
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'right'; ctx.fillText('cm/s', w - 6, 13);
    // One tick a second along the bottom, scrolling with the trace
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (let sec = Math.ceil(tNow - sweepSeconds); sec <= tNow; sec++) {
      const x = (RW - 1 - (cNow - Math.floor(sec * g.cps))) / dpr;
      ctx.fillRect(Math.round(padL + x), padT + H + 5, 1, 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // The dock asks for a redraw with each model frame (~10 a second); the picture itself runs on
  // animation frames while the model is live and the dock keeps asking, and stops when it doesn't.
  let raf = 0, askedAt = 0;
  function loop(now) {
    raf = 0;
    if (!frame || !cv.isConnected || !cv.offsetParent) return;
    draw(now);
    if (live() && now - askedAt < 400) raf = requestAnimationFrame(loop);
  }
  function redraw() {
    if (!frame) return;
    updateReport();
    askedAt = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function update(f) { ingest(f); redraw(); }
  function clear() { buf = []; redraw(); }
  return { id: 'doppler', label: 'Doppler', el, update, ingest, redraw, clear };
}
