// Spectral Doppler: pulsed-wave velocity in one vessel, drawn as the scanner draws it (a
// grey-scale spectrum on black, flow toward the transducer above the baseline), with the reading
// a sonographer would report beside it: direction, velocity against the vessel's normal range,
// and the waveform pattern. The trace keeps recording while the instrument is closed, so it opens
// full. It scrolls smoothly, one spectral line at a time, as the machine does.

import { EDGES } from '../engine/topology.js?v=29d10ad9ef';
import { h, fmt, fitCanvas, clamp } from './util.js?v=fe164f31f1';
import { FONT } from './charts.js?v=6046946e83';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
// kind decides the words for direction and pattern; normal is the usual mean velocity (cm/s).
// Positive velocity is the vessel's physiological direction (for a collateral: portal → systemic).
const PROBES = [
  { id: 'PV_TRUNK', kind: 'portal', normal: [15, 40] },
  { id: 'PVH_R', kind: 'portal', normal: [12, 35] },
  { id: 'PVH_L', kind: 'portal', normal: [12, 35] },
  { id: 'SV_CONF', kind: 'portal', normal: [10, 30] },
  { id: 'SMV_CONF', kind: 'portal', normal: [10, 30] },
  { id: 'RHV_IVC', kind: 'hepatic', normal: [10, 40] },
  { id: 'MHV_IVC', kind: 'hepatic', normal: [10, 40] },
  { id: 'IVCS_RA', kind: 'ivc', normal: [10, 50] },
  { id: 'A_HEP', kind: 'artery', normal: [30, 100] },
  { id: 'TIPS', kind: 'tips', normal: [90, 190] },
  { id: 'C1b', kind: 'collateral', normal: null },
  { id: 'C3', kind: 'collateral', normal: null },
];
const WINDOW = 6;       // seconds across the display
const KEEP = 8;         // seconds kept
const MINUS = '−';
const num = (v, d = 0) => (v < 0 ? MINUS : '') + fmt(Math.abs(v), d);

export function createDoppler({ onProbe }) {
  const probeSel = h('select', { class: 'select dop-vessel', 'aria-label': 'Vessel' },
    PROBES.map((p) => h('option', { value: p.id }, EDGES[EI[p.id]].label)));
  probeSel.addEventListener('change', () => onProbe(probeSel.value));
  let tint = false;
  const tintBtn = h('button', { class: 'dop-tint', 'aria-pressed': 'false', title: 'Color the spectrum by direction: red toward the probe, blue away' }, h('i'), 'Direction color');
  tintBtn.addEventListener('click', () => { tint = !tint; tintBtn.setAttribute('aria-pressed', String(tint)); if (frame) draw(); });
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
    h('div', { class: 'dop-head' }, probeSel, tintBtn), h('div', { class: 'dop-main' }, box, report));

  // ── Samples ───────────────────────────────────────
  let buf = [];
  let probe = null, frame = null;
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
    const aria = `Spectral Doppler, ${EDGES[EI[probe]].label}: ${it.dir}, mean ${num(r.mean, 0)} centimeters per second, ${it.pattern}.`;
    if (cv.getAttribute('aria-label') !== aria) cv.setAttribute('aria-label', aria);
  }

  // ── Display ───────────────────────────────────────
  // Drawn as a scanner draws it. Each spectral line (one column of device pixels) is synthesised
  // once, when its moment reaches the right edge, and written into a ring buffer; every screen
  // frame then only copies the ring to the canvas. The model sends samples about ten times a
  // second, so the display runs on its own clock a fraction of a second behind the newest sample
  // and scrolls at the screen's frame rate instead of jumping ten pixels at a time.
  //
  // A line holds the smooth spectrum only: the velocities in the sample volume, log-compressed
  // into grey. The grain is a separate layer fixed to the screen and redrawn with fresh noise
  // many times a second, so the waveform scrolls while the noise shimmers in place: speckle
  // (exponential, smooth over a frequency bin) multiplies the spectrum, and a faint noise floor
  // is added over the whole display, cleared at the baseline by the wall filter.
  let scale = null;     // velocity half-range (cm/s)
  let baseF = null;     // baseline position (fraction of height)
  let settleAt = 0;     // when the signal last fitted the current scale
  let tDisp = null;     // the display clock (model seconds)
  let wallLast = 0;
  let img = null, off = null, octx = null;
  let grain = null, floor = null, noiseAt = 0, nx = 0, ny = 0;
  let ringKey = '', lastCol = null;
  const STEPS = [10, 15, 20, 30, 40, 60, 80, 100, 150, 200, 300];
  const A_SIG = 10 ** 2.8;          // signal power over the noise floor (≈ 28 dB)
  const FLOOR_DB = 4.5, RANGE_DB = 30;  // log compression: the grey map spans 4.5–34.5 dB
  const LN10_10 = 10 / Math.LN10;
  const HEAD = 1.35;                // the spectrum is stored this much brighter; speckle averages it back
  const PAD = 96;                   // noise textures are this much larger than the display
  const live = () => !!frame?.running && frame.clock !== 'disease';

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
  function velAt(t) {
    const n = buf.length;
    if (t < buf[0][0] || t > buf[n - 1][0]) return NaN;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (buf[m][0] <= t) lo = m; else hi = m; }
    const [ta, va] = buf[lo], [tb, vb] = buf[hi];
    return tb > ta ? va + (vb - va) * clamp((t - ta) / (tb - ta), 0, 1) : va;
  }

  // Two screen-sized noise textures, made once per size: speckle to multiply the spectrum by, and
  // the noise floor to add. Each frame shows them at a new random offset, so the noise changes
  // constantly without being recomputed. Speckle is exponential power, a weighted mean of two
  // draws (overlapping FFT windows), smooth over a frequency bin; both are log-compressed.
  function makeNoise(RW, RH, binPx) {
    const TW = RW + PAD, TH = RH + PAD;
    const mk = () => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(TW, TH) : Object.assign(document.createElement('canvas'), { width: TW, height: TH });
    const gi = new ImageData(TW, TH), fi = new ImageData(TW, TH);
    const G = gi.data, F = fi.data;
    const nb = Math.ceil(TH / binPx) + 2;
    const e = () => -Math.log(1 - Math.random() * 0.999999);
    const x3 = () => 0.75 * e() + 0.25 * e();
    const sp = new Float32Array(nb), nf = new Float32Array(nb), spP = new Float32Array(nb), nfP = new Float32Array(nb);
    for (let x = 0; x < TW; x++) {
      for (let b = 0; b < nb; b++) {
        const a = x3(), c = x3();
        sp[b] = x ? 0.65 * a + 0.35 * spP[b] : a; spP[b] = sp[b];
        nf[b] = x ? 0.65 * c + 0.35 * nfP[b] : c; nfP[b] = nf[b];
      }
      for (let y = 0; y < TH; y++) {
        const fb = y / binPx, b0 = fb | 0, f = fb - b0;
        const X = sp[b0] + (sp[b0 + 1] - sp[b0]) * f;
        const N = nf[b0] + (nf[b0 + 1] - nf[b0]) * f;
        const m = clamp((1 + Math.log(X) * LN10_10 / 15) / HEAD, 0, 1);
        let I = (Math.log(N) * LN10_10 - 2.5) / RANGE_DB;
        I = I <= 0 ? 0 : Math.pow(Math.min(1, I), 1.2);
        const q = (y * TW + x) * 4;
        G[q] = G[q + 1] = G[q + 2] = 255 * m; G[q + 3] = 255;
        F[q] = 236 * I; F[q + 1] = 240 * I; F[q + 2] = 250 * I; F[q + 3] = 255;
      }
    }
    grain = mk(); grain.getContext('2d').putImageData(gi, 0, 0);
    floor = mk(); floor.getContext('2d').putImageData(fi, 0, 0);
    grain.key = `${RW}x${RH}`;
  }

  // Synthesise spectral line c into the ring. Geometry in device pixels.
  function writeLine(c, g) {
    const { RW, RH, rBase, rPxPerV } = g;
    const x = ((c % RW) + RW) % RW;
    const v = velAt(c / g.cps);
    const has = !Number.isNaN(v);
    const av = Math.abs(v);
    // velocity band: laminar flow runs from ~0.45× to 1.3× the mean with a clear window under
    // it; slow flow broadens toward the baseline
    const s = v < 0 ? -1 : 1;
    const P = av * 1.3;
    const L = av * (0.45 - 0.4 * clamp(1 - av / 12, 0, 1));
    const sigHi = 0.02 * P + 0.4, sigLo = 0.08 * P + 1.2;
    const wf = Math.max(1.2, 0.025 * scale);      // wall filter cut-off, cm/s
    const D = img.data;
    for (let ry = 0; ry < RH; ry++) {
      const vel = (rBase - ry) / rPxPerV;
      let S = 0;
      if (has && av > 0.3) {
        const u = vel * s;                                       // along the flow direction
        if (u > P) { const z = (u - P) / sigHi; S = Math.exp(-z * z); }
        else if (u >= L) S = 0.28 + 0.72 * Math.pow((u - L) / Math.max(1e-6, P - L), 0.8);
        else if (u > 0) { const z = (L - u) / sigLo; S = 0.28 * Math.exp(-z * z); }
      }
      const a = Math.abs(vel) / wf;
      const W = a >= 1 ? 1 : a * a * a;                        // wall filter clears the baseline
      const pw = (1 + A_SIG * S) * W;
      let I = pw > 0 ? (Math.log(pw) * LN10_10 - FLOOR_DB) / RANGE_DB : 0;
      I = I <= 0 ? 0 : I >= 1 ? 1 : Math.pow(I, 1.2);
      const q = (ry * RW + x) * 4;
      let r = 236 * HEAD * I, gg = 240 * HEAD * I, bl = 250 * HEAD * I;
      if (tint && S > 0.02) { if (vel >= 0) { gg *= 0.45; bl *= 0.38; } else { r *= 0.35; gg *= 0.6; } }
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
    ctx.fillText('PW  ·  θ 60°  ·  SV 3 mm', padL + lw + 12, 13);
    if (buf.length < 2) {
      tDisp = null;
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(frame?.clock === 'disease' ? 'Doppler samples at the bedside: return to the seconds clock.' : 'Acquiring…', w / 2, hh / 2);
      return;
    }
    // Scale: the peak fills about 70 % of its side, on the scanner's own velocity steps. Like a
    // sonographer, the display changes scale or baseline only when the signal would clip or has
    // stayed small for a few seconds, never continuously (a moving scale would smear the picture).
    const tNow = clockNow(now);
    let pos = 0, neg = 0;
    for (const [t, v] of buf) if (t >= tNow - WINDOW && t <= tNow) { if (v > pos) pos = v; if (-v > neg) neg = -v; }
    pos *= 1.3; neg *= 1.3;
    const need = Math.max(pos, neg, 8) / 0.72;
    const target = STEPS.find((x) => x >= need) || STEPS[STEPS.length - 1];
    const tbRaw = pos + neg < 1 ? 0.5 : pos > 0 && neg < pos * 0.08 ? 0.78 : neg > 0 && pos < neg * 0.08 ? 0.22 : clamp(0.1 + 0.8 * (pos / (pos + neg)), 0.2, 0.8);
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
    const g = { RW, RH, rBase: baseY * dpr, rPxPerV: pxPerV * dpr, cps: RW / WINDOW, binPx: Math.max(1.5, RH / 200) };
    const cNow = Math.floor(tNow * g.cps);
    const key = `${RW}x${RH}|${scale}|${baseF}|${tint}|${probe}`;
    if (!img || img.width !== RW || img.height !== RH) {
      img = new ImageData(RW, RH);
      off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(RW, RH) : Object.assign(document.createElement('canvas'), { width: RW, height: RH });
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
    if (p + 1 < RW) ctx.drawImage(off, p + 1, 0, RW - p - 1, RH, dx, dy, RW - p - 1, RH);
    ctx.drawImage(off, 0, 0, p + 1, RH, dx + RW - p - 1, dy, p + 1, RH);
    // the noise, fixed to the screen: a new random view of the textures ~30 times a second
    if (grain?.key !== `${RW}x${RH}`) makeNoise(RW, RH, g.binPx);
    if (now - noiseAt > 30) { noiseAt = now; nx = (Math.random() * PAD) | 0; ny = (Math.random() * PAD) | 0; }
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(grain, nx, ny, RW, RH, dx, dy, RW, RH);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(floor, PAD - 1 - nx, PAD - 1 - ny, RW, RH, dx, dy, RW, RH);
    ctx.globalCompositeOperation = 'source-over';
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
    const step = scale > 120 ? 50 : scale > 60 ? 20 : scale > 30 ? 10 : 5;
    for (let v = -Math.floor(scale / step) * step; v <= scale + 1e-9; v += step) {
      const y = padT + baseY - v * pxPerV;
      if (y < padT - 1 || y > padT + H + 1) continue;
      const major = Math.round(v / step) % 2 === 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(padL + W + 3, Math.round(y), major ? 6 : 3, 1);
      if (major) { ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.fillText(v === 0 ? '0' : num(v), padL + W + 13, y); }
    }
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'right'; ctx.fillText('cm/s', w - 6, 13);
    // One tick a second along the bottom, scrolling with the trace
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (let sec = Math.ceil(tNow - WINDOW); sec <= tNow; sec++) {
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
  return { id: 'doppler', label: 'Doppler', el, update, ingest, redraw };
}
