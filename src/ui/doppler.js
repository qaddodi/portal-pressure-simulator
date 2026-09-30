// Spectral Doppler: pulsed-wave velocity in one vessel, drawn as the scanner draws it (a
// grey-scale spectrum on black, flow toward the transducer above the baseline), with the reading
// a sonographer would report beside it: direction, velocity against the vessel's normal range,
// and the waveform pattern. The trace keeps recording while the instrument is closed, so it opens
// full. It scrolls continuously; the faint background noise flickers in place instead of scrolling.

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

// Hash noise for speckle, keyed to time and velocity so it scrolls with the trace.
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

export function createDoppler({ onProbe }) {
  const probeSel = h('select', { class: 'select dop-vessel', 'aria-label': 'Vessel' },
    PROBES.map((p) => h('option', { value: p.id }, EDGES[EI[p.id]].label)));
  probeSel.addEventListener('change', () => onProbe(probeSel.value));
  let tint = false;
  const tintBtn = h('button', { class: 'dop-tint', 'aria-pressed': 'false', title: 'Color the spectrum by direction: red toward the probe, blue away' }, h('i'), 'Direction color');
  tintBtn.addEventListener('click', () => { tint = !tint; tintBtn.setAttribute('aria-pressed', String(tint)); draw(); });
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
  let scale = null;     // velocity half-range (cm/s)
  let baseF = null;     // baseline position (fraction of height)
  let settleAt = 0;     // when the signal last fitted the current scale
  let noiseFrame = 0;
  let img = null, off = null;
  const STEPS = [10, 15, 20, 30, 40, 60, 80, 100, 150, 200, 300];
  function draw() {
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
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(frame?.clock === 'disease' ? 'Doppler samples at the bedside: return to the seconds clock.' : 'Acquiring…', w / 2, hh / 2);
      return;
    }
    // Scale: the peak fills about 70 % of its side, on the scanner's own velocity steps. Like a
    // sonographer, the display changes scale or baseline only when the signal would clip or has
    // stayed small for a few seconds, never continuously (a moving scale would smear the picture).
    const tNow = buf[buf.length - 1][0];
    let pos = 0, neg = 0;
    for (const [t, v] of buf) if (t >= tNow - WINDOW) { if (v > pos) pos = v; if (-v > neg) neg = -v; }
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

    // Spectrum, scrolling right to left with the newest moment at the right edge. Rendered at
    // device resolution into an offscreen canvas. The signal's speckle belongs to its moment and
    // travels with it; the faint noise behind it belongs to the screen and stays put.
    const k = dpr >= 1.5 ? 2 : 1;
    const RW = W * k, RH = H * k;
    if (!img || img.width !== RW || img.height !== RH) {
      img = new ImageData(RW, RH);
      off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(RW, RH) : Object.assign(document.createElement('canvas'), { width: RW, height: RH });
    }
    const D = img.data; D.fill(0);
    const rColsPerS = (W / WINDOW) * k;
    const cNow = Math.floor(tNow * rColsPerS);
    // the noise floor is re-drawn each frame, like a scanner's: it flickers in place and never scrolls
    const nk = (++noiseFrame * 2654435761) | 0;
    const rBase = baseY * k, rPxPerV = pxPerV * k;
    const tFirst = buf[0][0];
    const env = new Float32Array(W).fill(NaN);
    let j = 0;
    // columns from oldest (left) to newest (right), so the sample search runs forward
    for (let rx = 0; rx < RW; rx++) {
      const c = cNow - (RW - 1 - rx);
      const t = c / rColsPerS;
      if (t < tFirst) {
        for (let ry = 0; ry < RH; ry++) { const n = hash(rx ^ nk, ry) ** 18 * 34; if (n < 3) continue; const q = (ry * RW + rx) * 4; D[q] = D[q + 1] = D[q + 2] = n; D[q + 3] = 255; }
        continue;
      }
      while (j < buf.length - 2 && buf[j + 1][0] < t) j++;
      const [ta, va] = buf[j], [tb2, vb] = buf[Math.min(buf.length - 1, j + 1)];
      const v = tb2 > ta ? va + (vb - va) * clamp((t - ta) / (tb2 - ta), 0, 1) : va;
      const av = Math.abs(v);
      // laminar flow: a band from ~0.45× to 1.3× the mean with a clear window under it;
      // slow flow broadens toward the baseline
      const pk = v * 1.3;
      const lo = v * (0.45 - 0.4 * clamp(1 - av / 12, 0, 1));
      const yPk = rBase - pk * rPxPerV, yLo = rBase - lo * rPxPerV;
      const top = Math.min(yPk, yLo), bot = Math.max(yPk, yLo);
      const edge = (1.6 + 2.2 * clamp(1 - av / 20, 0, 1)) * k;
      const grain = c >> 1;
      if (rx % k === 0) env[rx / k] = yPk / k;
      for (let ry = 0; ry < RH; ry++) {
        const sp = hash(grain, ry);
        let I = Math.pow(hash(rx ^ nk, ry), 18) * 0.13;                  // noise floor, in screen space
        if (ry >= top - edge && ry <= bot + edge) {
          const u = bot > top ? (ry - top) / (bot - top) : 0.5;          // 0 at the upper edge
          const peakSide = pk >= 0 ? 1 - u : u;
          let b = 0.26 + 0.74 * Math.pow(clamp(peakSide, 0, 1), 0.9);
          if (ry < top) b *= Math.max(0, 1 - (top - ry) / edge); else if (ry > bot) b *= Math.max(0, 1 - (ry - bot) / edge);
          I = Math.max(I, b * (0.42 + 0.9 * sp * sp));                     // speckle
        }
        const vel = (rBase - ry) / rPxPerV;
        if (Math.abs(vel) < 2.2 && av > 0.5) I *= 0.35 + 0.65 * Math.abs(vel) / 2.2; // wall filter
        if (I < 0.012) continue;
        I = Math.min(1, I);
        const q = (ry * RW + rx) * 4;
        let r = 235 * I, g = 240 * I, bl = 255 * I;
        if (tint) { if (vel >= 0) { g *= 0.45; bl *= 0.4; } else { r *= 0.35; g *= 0.6; } }
        D[q] = r; D[q + 1] = g; D[q + 2] = bl; D[q + 3] = 255;
      }
    }
    const octx = off.getContext('2d');
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, padL, padT, W, H);

    // Peak envelope (auto-trace)
    ctx.strokeStyle = 'rgba(250, 214, 80, .85)'; ctx.lineWidth = 1.25; ctx.lineJoin = 'round';
    ctx.beginPath(); let started = false;
    for (let px = 0; px < W; px += 2) {
      const y = env[px];
      if (Number.isNaN(y)) { started = false; continue; }
      const X = padL + px, Y = padT + y;
      if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

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
      const x = (RW - 1 - (cNow - Math.floor(sec * rColsPerS))) / k;
      ctx.fillRect(Math.round(padL + x), padT + H + 5, 1, 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function redraw() { if (!frame) return; updateReport(); draw(); }
  function update(f) { ingest(f); redraw(); }
  return { id: 'doppler', label: 'Doppler', el, update, ingest, redraw };
}
