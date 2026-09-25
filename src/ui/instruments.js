// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): HVPG catheter, Doppler, endoscopy,
// liver lobule, varix cross-section, abdomen.

import { NODES, EDGES } from '../engine/topology.js?v=3fdc1306dd';
import { pressureColor } from './colormap.js?v=fa78a29bc0';
import { store, updateParams } from './store.js?v=384ec84b1e';
import { h, fmt, fitCanvas, cssVar, clamp, toast, icon } from './util.js?v=61d6f9c200';
import { FONT } from './charts.js?v=ead33a5ace';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

// ── HVPG procedure ──────────────────────────────────
export function createHVPG() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'hvpg' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Catheter pressure trace' });
  box.append(cv);
  const status = h('div', { class: 'callout-note' });
  const readout = h('dl', { class: 'kv' });
  const table = h('div', { class: 'event-log' });
  const veinBtns = h('div', {}, ['R', 'M', 'L'].map((v) => h('button', { 'data-v': v, onclick: () => updateParams({ catheter: { vein: v, wedged: false } }, { label: 'Catheter placed' }) }, `${v}HV`)));
  const wedgeBtn = h('button', { class: 'btn primary' }, 'Inflate balloon');
  const removeBtn = h('button', { class: 'btn ghost' }, 'Remove');
  wedgeBtn.addEventListener('click', () => {
    const c = store.get().params.catheter;
    if (!c.vein) return toast('Place the catheter in a hepatic vein first.');
    updateParams({ catheter: { vein: c.vein, wedged: !c.wedged } }, { label: c.wedged ? 'Deflate balloon' : 'Wedge catheter' });
  });
  removeBtn.addEventListener('click', () => updateParams({ catheter: { vein: null, wedged: false } }, { label: 'Remove catheter' }));
  const side = h('div', { class: 'chart-side', style: { width: '284px' } }, h('div', { class: 'side-title' }, 'Transjugular HVPG'), status, h('div', { class: 'seg full' }, [...veinBtns.children]), h('div', { class: 'btn-row' }, wedgeBtn, removeBtn), readout, h('div', { class: 'side-label' }, 'Measurements'), table);
  el.append(box, side);
  const trace = [];
  let fhvp = null, whvp = null, wedgeStart = null;
  const log = [];

  function update(f) {
    const c = f.params?.catheter || store.get().params.catheter;
    const m = f.metrics;
    const now = f.t;
    if (c.vein) {
      const v = c.wedged ? m.measured?.whvp : m.measured?.fhvp;
      if (Number.isFinite(v)) trace.push([now, v, c.wedged]);
      while (trace.length && trace[0][0] < now - 60) trace.shift();
      if (!m.measured) { /* engine hasn't seen the catheter yet */ }
      else if (!c.wedged) { fhvp = m.measured.fhvp; wedgeStart = null; }
      else {
        if (wedgeStart == null) wedgeStart = now;
        const recent = trace.filter((p) => p[2] && p[0] > now - 6).map((p) => p[1]);
        const stable = recent.length > 5 && Math.max(...recent) - Math.min(...recent) < 0.3 && now - wedgeStart > 12;
        if (stable && (whvp == null || Math.abs(whvp - m.measured.whvp) > 0.3 || !log.length || log[log.length - 1].vein !== c.vein)) {
          whvp = m.measured.whvp;
          const entry = { vein: c.vein, fhvp, whvp, hvpg: whvp - fhvp, t: now, day: f.day, trueH: m.hvpg };
          if (!log.length || Math.abs(log[log.length - 1].hvpg - entry.hvpg) > 0.3) { log.push(entry); renderLog(); store.set({ lastHVPG: entry }); }
        }
      }
    } else { trace.length = 0; }
    status.textContent = !c.vein ? 'Choose a hepatic vein. Or use the Catheter tool on the anatomy.'
      : !c.wedged ? `Catheter free in the ${c.vein}HV: reading free hepatic venous pressure (FHVP). Now inflate the balloon.`
        : wedgeStart != null && now - wedgeStart < 12 ? 'Balloon inflated: the column is stagnant and pressure is equilibrating with the sinusoids…' : 'Wedged pressure plateau reached.';
    wedgeBtn.textContent = c.wedged ? 'Deflate balloon' : 'Inflate balloon';
    side.querySelectorAll('button[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c.vein)));
    const hidden = store.get().hiddenReadouts?.has('trueHVPG');
    readout.replaceChildren(
      h('dt', {}, 'FHVP'), h('dd', {}, fhvp != null && c.vein ? `${fmt(fhvp, 1)} mmHg` : '—'),
      h('dt', {}, 'WHVP'), h('dd', {}, whvp != null && c.vein ? `${fmt(whvp, 1)} mmHg` : '—'),
      h('dt', {}, 'HVPG (measured)'), h('dd', {}, whvp != null && fhvp != null && c.vein ? `${fmt(whvp - fhvp, 1)} mmHg` : '—'),
      hidden ? null : [h('dt', {}, 'Portal pressure (true)'), h('dd', {}, `${fmt(m.pv, 1)} mmHg`)]);
    draw();
  }
  function renderLog() {
    table.replaceChildren(...log.slice(-6).reverse().map((e) => h('div', { class: 'event-row', style: { gridTemplateColumns: '48px 1fr' } }, h('span', { class: 'when' }, `${e.vein}HV`), h('span', {}, `WHVP ${fmt(e.whvp, 1)} − FHVP ${fmt(e.fhvp, 1)} = `, h('b', {}, `${fmt(e.hvpg, 1)} mmHg`)))));
  }
  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const L = 36, B = 22, T = 10, R = 12;
    ctx.font = FONT(500, 11);
    if (trace.length < 2) { ctx.fillStyle = cssVar('--text-3'); ctx.fillText('No catheter in place. Choose a hepatic vein to start the pressure trace.', L, 30); return; }
    const t1 = trace[trace.length - 1][0], t0 = t1 - 60;
    const vals = trace.map((p) => p[1]).filter(Number.isFinite);
    const pMax = Math.max(15, Math.ceil(Math.max(...vals) + 3));
    const X = (t) => L + ((t - t0) / 60) * (w - L - R), Y = (p) => T + (1 - p / pMax) * (hh - T - B);
    const cFree = cssVar('--s1'), cWedge = cssVar('--s5');
    ctx.lineWidth = 1; ctx.strokeStyle = cssVar('--grid'); ctx.fillStyle = cssVar('--text-3');
    for (let p = 0; p <= pMax; p += 5) { const yy = Math.round(Y(p)) + 0.5; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(String(p), L - 7, yy + 4); }
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < trace.length; i++) {
      const [ta, va, wa] = trace[i - 1], [tb, vb] = trace[i];
      ctx.strokeStyle = wa ? cWedge : cFree;
      ctx.beginPath(); ctx.moveTo(X(ta), Y(va)); ctx.lineTo(X(tb), Y(vb)); ctx.stroke();
    }
    ctx.textAlign = 'left'; ctx.font = FONT(500, 11.5);
    ctx.fillStyle = cFree; ctx.beginPath(); ctx.arc(L + 10, T + 9, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = cssVar('--text-2'); ctx.fillText('Free (FHVP)', L + 18, T + 13);
    ctx.fillStyle = cWedge; ctx.beginPath(); ctx.arc(L + 110, T + 9, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = cssVar('--text-2'); ctx.fillText('Wedged (WHVP)', L + 118, T + 13);
  }
  return { id: 'hvpg', label: 'HVPG', el, update };
}

// ── Doppler ─────────────────────────────────────────
export function createDoppler({ onProbe }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'doppler' });
  const box = h('div', { class: 'chart-box dark' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Spectral Doppler' });
  box.append(cv);
  const probeSel = h('select', { class: 'select', 'aria-label': 'Vessel' },
    ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SV_CONF', 'SMV_CONF', 'RHV_IVC', 'MHV_IVC', 'IVCS_RA', 'TIPS', 'C3', 'C1b', 'A_HEP'].map((id) => h('option', { value: id }, EDGES[EI[id]].label)));
  probeSel.addEventListener('change', () => onProbe(probeSel.value));
  let bart = true;
  const bartBtn = h('button', { class: 'btn sm', 'aria-pressed': 'true' }, 'BART color map');
  bartBtn.addEventListener('click', () => { bart = !bart; bartBtn.setAttribute('aria-pressed', String(bart)); });
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side', style: { width: '268px' } }, h('div', { class: 'side-title' }, 'Spectral Doppler'), probeSel, bartBtn, stats,
    h('div', { class: 'ctl-sub' }, 'Above the baseline means toward the transducer (the physiological direction for this vessel). BART: Blue Away, Red Toward. Color shows direction relative to the probe, not artery versus vein.'),
    h('div', { class: 'ctl-sub', id: 'dopHint' }));
  el.append(box, side);
  const buf = [];
  let lastProbe = null;
  let off = null;

  function update(f) {
    if (f.probe !== lastProbe) { buf.length = 0; lastProbe = f.probe; probeSel.value = f.probe; }
    if (f.samples) for (let i = 0; i < f.samples.t.length; i++) buf.push([f.samples.t[i], f.samples.vel[i]]);
    const tNow = buf.length ? buf[buf.length - 1][0] : 0;
    while (buf.length && buf[0][0] < tNow - 6) buf.shift();
    const vs = buf.map((b) => b[1]);
    const vmax = vs.length ? Math.max(...vs) : 0, vmin = vs.length ? Math.min(...vs) : 0;
    const mean = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
    const pi = Math.abs(vmax) > 0.5 ? (vmax - vmin) / Math.abs(vmax) : 0;
    const k = EI[f.probe];
    const D = Math.max(0.5, f.D[k]) / 10;
    const area = Math.PI * D * D / 4;
    const dirTxt = Math.abs(mean) < 2 ? 'stagnant / to-and-fro' : mean > 0 ? (f.probe.startsWith('PV') || f.probe.startsWith('PVH') ? 'hepatopetal' : 'antegrade') : (f.probe.startsWith('PV') || f.probe.startsWith('PVH') ? 'HEPATOFUGAL' : 'retrograde');
    stats.replaceChildren(
      h('dt', {}, 'Mean velocity'), h('dd', {}, `${fmt(mean, 1)} cm/s`),
      h('dt', {}, 'Vmax / Vmin'), h('dd', {}, `${fmt(vmax, 0)} / ${fmt(vmin, 0)}`),
      h('dt', {}, 'Direction'), h('dd', {}, dirTxt),
      h('dt', {}, 'Pulsatility (Vmax−Vmin)/Vmax'), h('dd', {}, `${fmt(pi * 100, 0)} %`),
      f.probe === 'PV_TRUNK' ? [h('dt', {}, 'Congestion index'), h('dd', {}, Math.abs(mean) > 0.5 ? `${fmt(area / Math.abs(mean), 3)} cm·s` : '—')] : null);
    el.querySelector('#dopHint').textContent = f.params?.pulsatile ?? store.get().params.pulsatile ? '' : 'Tip: turn on Pulsatile mode to see cardiac and respiratory phasicity.';
    draw(f, vmax, vmin);
  }
  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, w, hh);
    if (buf.length < 2) return;
    const vs = buf.map((b) => b[1]);
    const vAbs = Math.max(20, ...vs.map(Math.abs)) * 1.25;
    const base = hh / 2;
    const Y = (v) => base - (v / vAbs) * (hh / 2 - 12);
    const t1 = buf[buf.length - 1][0], t0 = t1 - 6;
    const X = (t) => 36 + ((t - t0) / 6) * (w - 44);
    // spectral columns
    for (let i = 1; i < buf.length; i++) {
      const [t, v] = buf[i];
      const x0 = X(buf[i - 1][0]), x1 = X(t);
      const spread = Math.max(2, Math.abs(v) * 0.25);
      for (let s = -1; s <= 1; s += 0.25) {
        const vv = v + s * spread;
        const inten = 1 - Math.abs(s) * 0.8;
        const toward = vv >= 0;
        ctx.fillStyle = bart ? (toward ? `rgba(255,${Math.round(90 + 120 * inten)},${Math.round(90 * inten)},${0.25 + 0.6 * inten})` : `rgba(${Math.round(80 * inten)},${Math.round(150 + 80 * inten)},255,${0.25 + 0.6 * inten})`) : `rgba(255,255,255,${0.2 + 0.7 * inten})`;
        ctx.fillRect(x0, Math.min(base, Y(vv)), Math.max(1, x1 - x0 + 0.5), Math.abs(Y(vv) - base));
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, base); ctx.lineTo(w, base); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = FONT(500, 11); ctx.textAlign = 'right';
    for (const v of [-vAbs * 0.8, -vAbs * 0.4, vAbs * 0.4, vAbs * 0.8]) ctx.fillText(Math.round(v), 30, Y(v) + 4);
    ctx.textAlign = 'left'; ctx.fillText('cm/s', 4, 12);
  }
  return { id: 'doppler', label: 'Doppler', el, update };
}

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box', style: { maxWidth: '420px' } });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Stylized endoscopic view' });
  box.append(cv);
  let view = 'eso';
  const seg = h('div', { class: 'seg full' }, [['eso', 'Esophagus'], ['fundus', 'Fundus (retroflexed)']].map(([v, l]) => {
    const b = h('button', { 'aria-pressed': String(v === view) }, l);
    b.addEventListener('click', () => { view = v; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    return b;
  }));
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side', style: { width: '300px' } }, h('div', { class: 'side-title' }, 'Endoscopy'), seg, stats,
    h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band a column (EVL)'),
    h('div', { class: 'ctl-sub' }, 'Stylized view. F1 small and straight, F2 enlarged and tortuous, F3 large and coil-shaped. Red wale marks mean high wall tension.'));
  el.append(box, side);
  let seed = 0;
  function update(f) {
    const m = f.metrics;
    const vx = view === 'eso' ? m.varix : m.gastricVarix;
    stats.replaceChildren(
      h('dt', {}, 'Grade'), h('dd', {}, `${vx.grade.code} ${vx.grade.label}`),
      h('dt', {}, 'Diameter'), h('dd', {}, `${fmt(vx.d, 1)} mm`),
      h('dt', {}, 'Wall thickness'), h('dd', {}, `${fmt(vx.w, 2)} mm`),
      h('dt', {}, 'Wall tension'), h('dd', {}, `${Math.round(vx.ratio * 100)} % of rupture`),
      h('dt', {}, 'Red wale signs'), h('dd', {}, vx.redWale ? 'present' : 'absent'),
      h('dt', {}, 'Bands placed'), h('dd', {}, String(Math.round(f.bands || 0))));
    draw(f, vx);
  }
  function draw(f, vx) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 6;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
    g.addColorStop(0, '#1a0506'); g.addColorStop(0.25, '#7a2a2a'); g.addColorStop(0.7, '#d98a7c'); g.addColorStop(1, '#f2c1b0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
    const d = vx.d, grow = clamp((d - 2) / 10, 0, 1);
    if (view === 'eso') {
      for (let c = 0; c < 4; c++) {
        const a0 = (c / 4) * Math.PI * 2 + 0.4;
        const width = 3 + grow * R * 0.22;
        if (d < 2.4) continue;
        ctx.strokeStyle = `rgba(70, 95, 170, ${0.35 + 0.5 * grow})`; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let s = 0; s <= 1.0001; s += 0.05) {
          const rr = R * (0.18 + 0.8 * s);
          const tort = grow > 0.3 ? Math.sin(s * 14 + c) * 0.12 * grow : 0;
          const a = a0 + tort;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (vx.redWale) {
          ctx.strokeStyle = 'rgba(210, 20, 35, .9)'; ctx.lineWidth = 1.5;
          for (let s = 0.3; s < 0.95; s += 0.12) { const rr = R * (0.18 + 0.8 * s), a = a0 + (grow > 0.3 ? Math.sin(s * 14 + c) * 0.12 * grow : 0); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; ctx.beginPath(); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 3, y + 2); ctx.stroke(); }
        }
        if (c < Math.round(f.bands || 0)) {
          const rr = R * 0.6, x = cx + Math.cos(a0) * rr, y = cy + Math.sin(a0) * rr;
          ctx.fillStyle = '#f0d9d2'; ctx.beginPath(); ctx.arc(x, y, width * 0.7, 0, 7); ctx.fill();
          ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, width * 0.75, 0, 7); ctx.stroke();
        }
      }
    } else {
      ctx.fillStyle = '#e8b2a0'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + R * 0.1, cy + R * 0.35, R * 0.12, 0, 7); ctx.fill();
      if (d >= 2.4) {
        ctx.fillStyle = `rgba(70, 95, 170, ${0.4 + 0.5 * grow})`;
        for (let i = 0; i < 7; i++) { const a = i * 0.9, rr = R * (0.3 + 0.08 * i); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr * 0.6 - R * 0.1, cy + Math.sin(a) * rr * 0.5 - R * 0.15, 4 + grow * R * 0.13, 0, 7); ctx.fill(); }
      }
    }
    if (f.params?.balloonEso && view === 'eso' || f.params?.balloonGas && view === 'fundus') {
      ctx.fillStyle = 'rgba(245, 232, 176, .55)'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, 7); ctx.fill();
    }
    if (f.bleed?.active && ((f.bleed.site === 'VAR') === (view === 'eso'))) {
      seed += 1;
      ctx.fillStyle = 'rgba(150, 0, 20, .8)';
      ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.55, R * 0.5, R * 0.25, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 60; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8, rr = Math.random() * R * 0.7; ctx.beginPath(); ctx.arc(cx + R * 0.35 + Math.cos(a) * rr * 0.3, cy + Math.sin(a) * rr * 0.6, 1.8, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = '#1B1D22'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update };
}

// ── Liver lobule (L2) ───────────────────────────────
export function createLobule() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'lobule' });
  const box = h('div', { class: 'chart-box', style: { maxWidth: '460px' } });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Liver lobule microcirculation' });
  box.append(cv);
  let lobe = 'R';
  const seg = h('div', { class: 'seg full' }, [['R', 'Right lobe'], ['L', 'Left lobe']].map(([v, l]) => { const b = h('button', { 'aria-pressed': String(v === lobe) }, l); b.addEventListener('click', () => { lobe = v; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }); return b; }));
  const zoneBtns = h('div', { class: 'btn-row' }, [['pre', 'Portal tract'], ['sin', 'Sinusoids'], ['post', 'Central vein']].map(([z, l]) => {
    const b = h('button', { class: 'btn sm' }, `+ ${l}`);
    b.addEventListener('click', () => updateParams((p) => { p.fibrosis[lobe][z] = +(Math.min(80, p.fibrosis[lobe][z] * 1.5)).toFixed(2); return p; }, { label: 'Fibrosis' }));
    return b;
  }));
  const clear = h('button', { class: 'btn sm ghost', onclick: () => updateParams((p) => { p.fibrosis[lobe] = { pre: 1, sin: 1, post: 1 }; return p; }, { label: 'Clear fibrosis' }) }, 'Clear this lobe');
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side', style: { width: '290px' } }, h('div', { class: 'side-title' }, 'Liver lobule'), seg, h('div', { class: 'side-label' }, 'Add fibrosis'), zoneBtns, clear, stats,
    h('div', { class: 'ctl-sub' }, 'Portal venule + hepatic arteriole (red) enter at the triads, mix in the sinusoids, and drain to the central vein. Lymph forms in the space of Disse.'));
  el.append(box, side);
  let phase = 0;
  function update(f) {
    const p = f.params || store.get().params;
    const S = lobe === 'R' ? { pv: 'RPV', sin: 'SIN_R', cv: 'CV_R' } : { pv: 'LPV', sin: 'SIN_L', cv: 'CV_L' };
    const P1 = f.P[NI[S.pv]], P2 = f.P[NI[S.sin]], P3 = f.P[NI[S.cv]];
    const fib = p.fibrosis[lobe], s = p.cirrhosis;
    const zone = { pre: (1 + 2 * s) * fib.pre, sin: (1 + 20 * s ** 2.5) * fib.sin, post: (1 + 2 * s) * fib.post };
    stats.replaceChildren(
      h('dt', {}, 'Portal venule'), h('dd', {}, `${fmt(P1, 1)} mmHg`),
      h('dt', {}, 'Sinusoid inlet'), h('dd', {}, `${fmt(P2, 1)} mmHg`),
      h('dt', {}, 'Central venule'), h('dd', {}, `${fmt(P3, 1)} mmHg`),
      h('dt', {}, 'R pre / sin / post'), h('dd', {}, `×${fmt(zone.pre, 1)} / ×${fmt(zone.sin, 1)} / ×${fmt(zone.post, 1)}`),
      h('dt', {}, 'Hepatic lymph'), h('dd', {}, `${fmt(f.metrics.ascites.hepLymph, 1)} mL/min`));
    draw(P1, P2, P3, zone, s);
  }
  function draw(P1, P2, P3, zone, s) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 20;
    phase = (phase + 0.02) % 1;
    const corners = Array.from({ length: 6 }, (_, i) => [cx + Math.cos((i * Math.PI) / 3) * R, cy + Math.sin((i * Math.PI) / 3) * R]);
    ctx.fillStyle = cssVar('--organ-liver'); ctx.globalAlpha = 0.18;
    ctx.beginPath(); corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    // sinusoids: radial lines from each edge point to centre
    for (let i = 0; i < 6; i++) {
      const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 6];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, sx = ax + (bx - ax) * t, sy = ay + (by - ay) * t;
        const grad = ctx.createLinearGradient(sx, sy, cx, cy);
        grad.addColorStop(0, pressureColor(P2)); grad.addColorStop(1, pressureColor(P3));
        ctx.strokeStyle = grad; ctx.lineWidth = Math.max(1.5, 5 / Math.sqrt(zone.sin));
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx, cy); ctx.stroke();
        // flowing cells
        ctx.fillStyle = 'rgba(150,18,40,.8)';
        const u = (phase + k * 0.13 + i * 0.07) % 1;
        ctx.beginPath(); ctx.arc(sx + (cx - sx) * u, sy + (cy - sy) * u, 1.6, 0, 7); ctx.fill();
        // sinusoidal collagen
        if (zone.sin > 1.5) { ctx.strokeStyle = `rgba(230, 210, 150, ${clamp(Math.log(zone.sin) / 3.5, 0, 0.8)})`; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(sx + (cx - sx) * 0.15 + 3, sy + (cy - sy) * 0.15); ctx.lineTo(sx + (cx - sx) * 0.85 + 3, sy + (cy - sy) * 0.85); ctx.stroke(); ctx.setLineDash([]); }
      }
    }
    // portal triads
    for (const [x, y] of corners) {
      if (zone.pre > 1.5) { ctx.fillStyle = `rgba(230, 210, 150, ${clamp(Math.log(zone.pre) / 3, 0.2, 0.85)})`; ctx.beginPath(); ctx.arc(x, y, 14 + Math.log(zone.pre) * 5, 0, 7); ctx.fill(); }
      ctx.fillStyle = pressureColor(P1); ctx.beginPath(); ctx.arc(x - 4, y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = cssVar('--artery'); ctx.beginPath(); ctx.arc(x + 5, y - 3, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#7FA35B'; ctx.beginPath(); ctx.arc(x + 4, y + 5, 2.5, 0, 7); ctx.fill();
    }
    // central vein
    if (zone.post > 1.5) { ctx.fillStyle = `rgba(230, 210, 150, ${clamp(Math.log(zone.post) / 3, 0.2, 0.85)})`; ctx.beginPath(); ctx.arc(cx, cy, 16 + Math.log(zone.post) * 6, 0, 7); ctx.fill(); }
    ctx.fillStyle = pressureColor(P3); ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = cssVar('--text-2'); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = cssVar('--text-2'); ctx.font = FONT(500, 11); ctx.textAlign = 'center';
    ctx.fillText('central vein', cx, cy + 26);
    ctx.fillText('portal triad', corners[5][0], corners[5][1] - 20);
    if (s > 0.2) { ctx.fillText(`capillarization: fenestrae closing (σ ${fmt(0.1 + 0.5 * s, 2)})`, cx, hh - 6); }
  }
  return { id: 'lobule', label: 'Lobule', el, update };
}

// ── Varix wall cross-section (L3) ───────────────────
export function createVarixWall() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'varixwall' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Varix cross-section and Laplace wall tension' });
  box.append(cv);
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side', style: { width: '270px' } }, h('div', { class: 'side-title' }, 'Laplace’s law'), h('div', { class: 'formula' }, 'T = ΔP · r / w'), stats,
    h('div', { class: 'ctl-sub' }, 'Big radius, high transmural pressure and a thin wall all raise tension. Remodeling enlarges the varix and thins its wall over months. A balloon raises the luminal (outside) pressure.'));
  el.append(box, side);
  function update(f) {
    const v = f.metrics.varix;
    stats.replaceChildren(
      h('dt', {}, 'ΔP (transmural)'), h('dd', {}, `${fmt(v.ptm, 1)} mmHg`),
      h('dt', {}, 'Radius r'), h('dd', {}, `${fmt(v.r, 2)} mm`),
      h('dt', {}, 'Wall w'), h('dd', {}, `${fmt(v.w, 2)} mm`),
      h('dt', {}, 'Tension'), h('dd', {}, `${fmt(v.T, 0)} (${Math.round(v.ratio * 100)} %)`));
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const cx = Math.min(w * 0.4, hh * 0.6), cy = hh / 2, Rw = Math.min(cx, hh / 2) - 12;
    // esophageal wall ring
    ctx.fillStyle = cssVar('--organ-stomach'); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(cx, cy, Rw, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(cx, cy, Rw * 0.45, 0, 7); ctx.fill();
    ctx.fillStyle = cssVar('--text-2'); ctx.font = FONT(500, 11); ctx.textAlign = 'center'; ctx.fillText('lumen', cx, cy + 4);
    // varix at submucosa (top)
    const scale = Rw * 0.08;
    const rr = clamp(v.r * scale, 3, Rw * 0.5);
    const vy = cy - Rw * 0.45 - rr * 0.6;
    ctx.fillStyle = pressureColor(f.P[NI.VAR]); ctx.beginPath(); ctx.arc(cx, vy, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = v.ratio > 0.7 ? '#D0192E' : '#26336B'; ctx.lineWidth = clamp(v.w * 5, 1, 8); ctx.stroke();
    // pressure arrows
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const x0 = cx + Math.cos(a) * rr * 0.4, y0 = vy + Math.sin(a) * rr * 0.4, x1 = cx + Math.cos(a) * (rr + 8), y1 = vy + Math.sin(a) * (rr + 8);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // tension gauge
    const gx = cx + Rw + 40, gw = Math.max(40, w - gx - 30), gy = cy - 12;
    ctx.fillStyle = cssVar('--surface-3'); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gx, gy, gw, 14, 7) : ctx.rect(gx, gy, gw, 14); ctx.fill();
    ctx.fillStyle = v.ratio > 1 ? cssVar('--critical') : v.ratio > 0.7 ? cssVar('--danger') : v.ratio > 0.4 ? cssVar('--caution') : cssVar('--ok');
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gx, gy, Math.max(14, gw * clamp(v.ratio / 1.5, 0, 1)), 14, 7) : ctx.rect(gx, gy, gw * clamp(v.ratio / 1.5, 0, 1), 14); ctx.fill();
    ctx.strokeStyle = cssVar('--critical'); ctx.lineWidth = 2; const rx = gx + gw / 1.5; ctx.beginPath(); ctx.moveTo(rx, gy - 6); ctx.lineTo(rx, gy + 20); ctx.stroke();
    ctx.fillStyle = cssVar('--text'); ctx.textAlign = 'left'; ctx.font = FONT(600, 12);
    ctx.fillText(`Wall tension ${Math.round(v.ratio * 100)} % of critical`, gx, gy - 12); ctx.textAlign = 'center'; ctx.font = FONT(500, 11); ctx.fillStyle = cssVar('--text-2'); ctx.fillText('rupture', rx, gy + 34);
  }
  return { id: 'varixwall', label: 'Varix wall', el, update };
}

// ── Abdomen (L2c) ───────────────────────────────────
export function createAbdomen({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'abdomen' });
  const box = h('div', { class: 'chart-box', style: { maxWidth: '420px' } });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Abdomen: ascites and spleen' });
  box.append(cv);
  const vol = h('input', { type: 'range', min: 1, max: 10, step: 0.5, value: 5, 'aria-label': 'Volume to drain (L)' });
  const volLbl = h('span', { class: 'ctl-val' }, '5.0 L');
  const paintVol = () => { volLbl.textContent = `${(+vol.value).toFixed(1)} L`; vol.style.setProperty('--pct', `${((+vol.value - 1) / 9) * 100}%`); };
  vol.addEventListener('input', paintVol); paintVol();
  const alb = h('input', { type: 'checkbox', checked: true });
  const drain = h('button', { class: 'btn primary block', onclick: () => onAction({ kind: 'paracentesis', mL: +vol.value * 1000, albumin: alb.checked }) }, 'Drain');
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side', style: { width: '290px' } }, h('div', { class: 'side-title' }, 'Paracentesis'),
    h('div', { class: 'ctl' }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, 'Volume'), volLbl), vol),
    h('label', { class: 'check-row', style: { padding: '2px 0' } }, alb, 'Give albumin (8 g per L removed)'),
    drain, stats);
  el.append(box, side);
  function update(f) {
    const a = f.metrics.ascites, sp = f.metrics.spleen;
    stats.replaceChildren(
      h('dt', {}, 'Ascites'), h('dd', {}, `${fmt(a.volume / 1000, 2)} L`),
      h('dt', {}, 'Grade'), h('dd', {}, a.label),
      h('dt', {}, 'Formation'), h('dd', {}, `${fmt(a.ratePerDay, 0)} mL/day`),
      h('dt', {}, 'IAP'), h('dd', {}, `${fmt(a.iap, 1)} mmHg`),
      h('dt', {}, 'Lymph: liver / gut / capacity'), h('dd', {}, `${fmt(a.hepLymph, 1)} / ${fmt(a.splLymph, 1)} / ${fmt(a.lymphCap, 1)}`),
      h('dt', {}, 'Ascitic protein'), h('dd', {}, a.volume > 150 ? (a.highProtein ? 'high (> 2.5 g/dL)' : 'low (< 2.5 g/dL)') : '—'),
      h('dt', {}, 'SAAG'), h('dd', {}, a.volume > 150 ? (f.metrics.ppg > 6 || f.metrics.whvp > 10 ? '≥ 1.1 (portal hypertension)' : '< 1.1') : '—'),
      h('dt', {}, 'Spleen length'), h('dd', {}, `${fmt(sp.length, 1)} cm`),
      h('dt', {}, 'Platelets (illustrative)'), h('dd', {}, `${Math.round(sp.platelets)} ×10⁹/L`));
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, top = 20, bot = hh - 16;
    const bulge = clamp(a.volume / 10000, 0, 1) * 40;
    ctx.strokeStyle = cssVar('--organ-line'); ctx.lineWidth = 2; ctx.fillStyle = cssVar('--organ-body'); ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(cx - 120, top); ctx.quadraticCurveTo(cx - 150 - bulge, (top + bot) / 2, cx - 110 - bulge * 0.5, bot); ctx.lineTo(cx + 110 + bulge * 0.5, bot); ctx.quadraticCurveTo(cx + 150 + bulge, (top + bot) / 2, cx + 120, top); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    const lvl = clamp(a.volume / 11000, 0, 1) * (bot - top - 30);
    if (lvl > 1) { ctx.fillStyle = cssVar('--ascites'); ctx.globalAlpha = 0.45; ctx.fillRect(cx - 140 - bulge, bot - lvl, 280 + bulge * 2, lvl); ctx.globalAlpha = 1; }
    // spleen
    const sl = sp.length / 11;
    ctx.fillStyle = cssVar('--organ-spleen'); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(cx + 70, top + 50, 22 * sl, 36 * sl, 0.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--text-2'); ctx.font = FONT(500, 11); ctx.textAlign = 'center';
    ctx.fillText(`spleen ${fmt(sp.length, 1)} cm`, cx + 70, top + 50 + 44 * sl);
    // IAP gauge
    const gx = 16, gy = top, gh = bot - top;
    ctx.fillStyle = cssVar('--surface-2'); ctx.fillRect(gx, gy, 12, gh);
    const iapH = clamp(a.iap / 30, 0, 1) * gh;
    ctx.fillStyle = a.iap >= 12 ? cssVar('--danger') : cssVar('--info'); ctx.fillRect(gx, gy + gh - iapH, 12, iapH);
    ctx.fillStyle = cssVar('--text-2'); ctx.textAlign = 'left'; ctx.fillText(`IAP ${fmt(a.iap, 0)}`, gx + 16, gy + gh - iapH + 4);
  }
  return { id: 'abdomen', label: 'Abdomen', el, update };
}
