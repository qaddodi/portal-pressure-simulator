// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): HVPG catheter, Doppler, endoscopy,
// varix cross-section, abdomen.

import { NODES, EDGES } from '../engine/topology.js?v=6d79260961';
import { pressureColor } from './colormap.js?v=5f8590b23c';
import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { h, fmt, fitCanvas, cssVar, clamp, toast, icon } from './util.js?v=d483888526';
import { FONT } from './charts.js?v=80ec1579d3';

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
  // A spectral display is grey-scale on black, as on the machine; the tint is a teaching aid.
  let tint = false;
  const bartBtn = h('button', { class: 'btn sm', 'aria-pressed': 'false' }, 'Tint by direction');
  bartBtn.addEventListener('click', () => { tint = !tint; bartBtn.setAttribute('aria-pressed', String(tint)); });
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side', style: { width: '268px' } }, h('div', { class: 'side-title' }, 'Spectral Doppler'), probeSel, bartBtn, stats,
    h('div', { class: 'ctl-sub' }, 'Above the baseline means toward the transducer (the physiological direction for this vessel). The yellow trace is the peak velocity envelope. With the tint on, red is toward and blue away (BART), direction relative to the probe, not artery versus vein.'),
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
  // Spectral display: each screen column is one moment; brightness along it is how many red
  // cells move at that velocity. Venous flow is a narrow band under a clear window; the band
  // broadens as flow slows, and speckle is keyed to time so it scrolls with the trace instead
  // of shimmering.
  const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  let img = null;
  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { ctx, w, h: hh } = fitCanvas(cv);
    const W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const padL = 10, padR = 44, padT = 16, padB = 16;
    const x0 = Math.round(padL * dpr), x1 = Math.round((w - padR) * dpr);
    const yT = Math.round(padT * dpr), yB = Math.round((hh - padB) * dpr);
    if (buf.length > 1 && x1 > x0 && yB > yT) {
      const vs = buf.map((b) => b[1]);
      const vPk = Math.max(...vs.map(Math.abs));
      const vAbs = Math.max(20, Math.ceil((vPk * 1.35) / 10) * 10);
      const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
      // Baseline shifted toward the side with less signal, as a sonographer would.
      const baseFrac = Math.abs(mean) < 1 ? 0.5 : mean > 0 ? 0.72 : 0.28;
      const base = yT + (yB - yT) * baseFrac;
      const pxPerV = Math.min(base - yT, yB - base) / vAbs * 0.92;
      const t1 = buf[buf.length - 1][0], t0 = t1 - 6;
      if (!img || img.width !== x1 - x0 || img.height !== yB - yT) img = ctx.createImageData(x1 - x0, yB - yT);
      const D = img.data; D.fill(0);
      let j = 0;
      const env = [];
      for (let px = 0; px < img.width; px++) {
        const t = t0 + (px / img.width) * 6;
        while (j < buf.length - 2 && buf[j + 1][0] < t) j++;
        if (t < buf[0][0]) { env.push(null); continue; }
        const [ta, va] = buf[j], [tb, vb] = buf[Math.min(buf.length - 1, j + 1)];
        const v = tb > ta ? va + (vb - va) * clamp((t - ta) / (tb - ta), 0, 1) : va;
        // Peak ≈ 1.35 × mean for the venous profile; the band spans from a floor near the wall
        // filter up to the peak, brightest just under the envelope.
        const pk = v * 1.35, lo = v * 0.25;
        const broad = 1 + clamp(6 / (Math.abs(v) + 1), 0, 3) * 0.25;
        const tick = Math.round(t * 400);
        const yPk = base - pk * pxPerV - yT, yLo = base - lo * pxPerV - yT;
        const ya = Math.max(0, Math.floor(Math.min(yPk, yLo) - 3 * dpr * broad)), yb = Math.min(img.height - 1, Math.ceil(Math.max(yPk, yLo, base - yT) + 2 * dpr));
        for (let py = ya; py <= yb; py++) {
          const vel = (base - yT - py) / pxPerV;
          const u = pk !== lo ? (vel - lo) / (pk - lo) : 0;
          let I = 0;
          if (u >= -0.05 * broad && u <= 1 + 0.06 * broad) I = 0.35 + 0.65 * Math.pow(clamp(u, 0, 1), 1.6);
          if (u > 1) I *= Math.max(0, 1 - (u - 1) / (0.06 * broad));
          if (Math.abs(py - (base - yT)) < 2 * dpr) I = Math.max(I, 0.25); // wall-filter clutter at the baseline
          if (I <= 0) continue;
          I *= 0.55 + 0.75 * hash(tick, py);
          I = clamp(I, 0, 1);
          const k = (py * img.width + px) * 4;
          let r = 255 * I, g = 255 * I, b = 255 * I;
          if (tint) { if (vel >= 0) { g *= 0.55; b *= 0.4; } else { r *= 0.4; g *= 0.65; } }
          D[k] = r; D[k + 1] = g; D[k + 2] = b; D[k + 3] = 255;
        }
        env.push(yPk + yT);
      }
      ctx.putImageData(img, x0, yT);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Peak envelope (auto-trace).
      ctx.strokeStyle = 'rgba(232, 214, 74, .9)'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
      let started = false;
      env.forEach((y, i) => { if (y == null) return; const x = x0 + i; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
      ctx.stroke();
      // Baseline and velocity scale on the right, as on the scanner.
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(x0, Math.round(base) + 0.5); ctx.lineTo(x1, Math.round(base) + 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = FONT(500, 10 * dpr); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const step = vAbs > 60 ? 20 : vAbs > 30 ? 10 : 5;
      for (let v = -vAbs; v <= vAbs; v += step) {
        const y = base - v * pxPerV;
        if (y < yT - 1 || y > yB + 1) continue;
        ctx.fillRect(x1 + 2 * dpr, y, 4 * dpr, dpr);
        if (v % (step * 2) === 0) ctx.fillText(String(v), x1 + 8 * dpr, y);
      }
      ctx.fillText('cm/s', x1 + 6 * dpr, yT - 8 * dpr);
      // Time ticks: one per second along the bottom.
      for (let s0 = Math.ceil(t0); s0 <= t1; s0++) { const x = x0 + ((s0 - t0) / 6) * (x1 - x0); ctx.fillRect(x, yB + 3 * dpr, dpr, 4 * dpr); }
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillText(`${EDGES[EI[lastProbe]]?.label || ''}  ·  θ 60°  ·  SV 3 mm`, x0 + 4 * dpr, yT - 8 * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return { id: 'doppler', label: 'Doppler', el, update };
}

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box', style: { maxWidth: '420px' } });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
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
    h('div', { class: 'ctl-sub' }, 'Rendered from the model. F1 small and straight, F2 enlarged and tortuous, F3 large and beaded. Red wale marks and cherry-red spots mean high wall tension.'));
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
  // Rendered endoscopic view: wet salmon mucosa lit from the scope tip (bright near, dark far),
  // a dark lumen, fine capillaries, then the varices as bluish, shaded columns that grow in
  // number, caliber and tortuosity with grade, beaded when large. Red wale marks and cherry-red
  // spots ride on the surface; bands, balloon and bleeding are drawn on top. Everything random
  // is seeded, so the view is stable between frames.
  const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  let bleedT = 0;
  function mucosa(ctx, cx, cy, R, lx, ly, r) {
    const g = ctx.createRadialGradient(lx, ly, R * 0.04, cx, cy, R * 1.02);
    g.addColorStop(0, '#120304'); g.addColorStop(0.16, '#3b0f10'); g.addColorStop(0.42, '#9b4a3f'); g.addColorStop(0.72, '#dc9a86'); g.addColorStop(1, '#f6cdb9');
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // Capillary lace near the wall.
    ctx.strokeStyle = 'rgba(160, 40, 40, .22)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, rr = R * (0.55 + 0.45 * r());
      let x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * R * 0.09; y += (r() - 0.5) * R * 0.09; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function glints(ctx, cx, cy, R, r, n) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = R * (0.45 + 0.5 * r()), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, R * 0.05);
      gg.addColorStop(0, 'rgba(255,255,255,.85)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(x, y, R * 0.05, R * 0.02, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  // A varix column from the wall toward the lumen: a shaded tube (dark blue core, pale crest,
  // shadow on the far side); beaded when large.
  function column(ctx, pts, width, beaded, r) {
    const seg = (fn) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); fn(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(60, 10, 20, .35)'; ctx.lineWidth = width * 1.25; ctx.save(); ctx.translate(width * 0.18, width * 0.12); seg(() => ctx.stroke()); ctx.restore();
    ctx.strokeStyle = '#9594ba'; ctx.lineWidth = width; seg(() => ctx.stroke());
    ctx.strokeStyle = 'rgba(72, 72, 132, .6)'; ctx.lineWidth = width * 0.5; seg(() => ctx.stroke());
    ctx.strokeStyle = 'rgba(214, 220, 245, .55)'; ctx.lineWidth = Math.max(1, width * 0.16); ctx.save(); ctx.translate(-width * 0.2, -width * 0.14); seg(() => ctx.stroke()); ctx.restore();
    if (beaded) for (let i = 2; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i], rb = width * (0.62 + 0.18 * r());
      const g = ctx.createRadialGradient(x - rb * 0.35, y - rb * 0.35, rb * 0.1, x, y, rb);
      g.addColorStop(0, '#c9cfe9'); g.addColorStop(0.5, '#7b82b2'); g.addColorStop(1, '#474d86');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rb, 0, Math.PI * 2); ctx.fill();
    }
  }
  function draw(f, vx) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 6;
    const r = rnd(view === 'eso' ? 11 : 23);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const d = vx.d, grow = clamp((d - 2) / 10, 0, 1), present = d >= 2.4;
    const bands = Math.round(f.bands || 0);
    if (view === 'eso') {
      const lx = cx + R * 0.06, ly = cy - R * 0.04;
      mucosa(ctx, cx, cy, R, lx, ly, r);
      // Circular folds of the distal esophagus, faint rings toward the lumen.
      ctx.strokeStyle = 'rgba(120, 40, 40, .18)'; ctx.lineWidth = 2;
      for (const k of [0.3, 0.45, 0.62]) { ctx.beginPath(); ctx.ellipse(lx, ly, R * k, R * k * 0.92, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (present) {
        const n = grow < 0.25 ? 3 : 4;
        for (let c = 0; c < n; c++) {
          const a0 = (c / n) * Math.PI * 2 + 0.5 + (r() - 0.5) * 0.3;
          const width = R * (0.05 + 0.2 * grow);
          const pts = [];
          for (let s0 = 0; s0 <= 1.0001; s0 += 0.06) {
            const rr = R * (0.2 + 0.85 * s0);
            const tort = Math.sin(s0 * (8 + 8 * grow) + c * 1.7) * (0.02 + 0.13 * grow) * (0.4 + s0);
            pts.push([lx + Math.cos(a0 + tort) * rr, ly + Math.sin(a0 + tort) * rr]);
          }
          if (c < bands) {
            // A banded varix: a purple knuckle strangled by a black rubber band.
            const [x, y] = pts[Math.floor(pts.length * 0.62)], rb = Math.max(width * 1.1, R * 0.09);
            column(ctx, pts.slice(0, Math.floor(pts.length * 0.5)), width * 0.6, false, r);
            const g = ctx.createRadialGradient(x - rb * 0.3, y - rb * 0.3, rb * 0.1, x, y, rb);
            g.addColorStop(0, '#b886a8'); g.addColorStop(1, '#5a2750');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rb, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#111'; ctx.lineWidth = rb * 0.32; ctx.beginPath(); ctx.arc(x, y, rb * 0.72, 0, Math.PI * 2); ctx.stroke();
            continue;
          }
          column(ctx, pts, width, grow > 0.45, r);
          if (vx.redWale) {
            ctx.strokeStyle = 'rgba(205, 25, 40, .9)'; ctx.lineWidth = Math.max(1.2, width * 0.12); ctx.lineCap = 'round';
            for (let i = 4; i < pts.length - 2; i += 3) { const [x, y] = pts[i], [x2, y2] = pts[i + 1]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x2 - x) * 0.7, y + (y2 - y) * 0.7); ctx.stroke(); }
            ctx.fillStyle = 'rgba(215, 20, 45, .95)';
            for (let i = 6; i < pts.length; i += 5) { const [x, y] = pts[i]; ctx.beginPath(); ctx.arc(x + width * 0.15, y, Math.max(1.4, width * 0.1), 0, Math.PI * 2); ctx.fill(); }
          }
        }
      }
      glints(ctx, cx, cy, R, r, 9);
    } else {
      // Retroflexed view of the fundus: rugal folds, the scope shaft entering the cardia.
      const lx = cx - R * 0.05, ly = cy - R * 0.05;
      const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      g.addColorStop(0, '#e2a291'); g.addColorStop(0.7, '#c9796a'); g.addColorStop(1, '#6d2a26');
      ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = -0.6 + i * 0.42, rr = R * (0.55 + 0.35 * r());
        ctx.strokeStyle = 'rgba(150, 60, 55, .35)'; ctx.lineWidth = R * 0.05;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3);
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * rr * 0.8, cy + Math.sin(a + 0.3) * rr * 0.8, cx + Math.cos(a + 0.15) * R * 1.05, cy + Math.sin(a + 0.15) * R * 1.05); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 220, 205, .25)'; ctx.lineWidth = R * 0.012; ctx.stroke();
      }
      if (present) {
        const n = 6 + Math.round(10 * grow), base = R * (0.05 + 0.1 * grow);
        for (let i = 0; i < n; i++) {
          const a = -2.3 + (i / n) * 1.9 + (r() - 0.5) * 0.25, rr = R * (0.26 + 0.2 * r());
          const x = lx + Math.cos(a) * rr, y = ly + Math.sin(a) * rr, rb = base * (0.7 + 0.5 * r());
          const gg = ctx.createRadialGradient(x - rb * 0.35, y - rb * 0.35, rb * 0.1, x, y, rb);
          gg.addColorStop(0, '#cfd3ea'); gg.addColorStop(0.5, '#7b82b2'); gg.addColorStop(1, '#434883');
          ctx.fillStyle = 'rgba(60, 10, 20, .3)'; ctx.beginPath(); ctx.arc(x + rb * 0.2, y + rb * 0.2, rb, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rb, 0, Math.PI * 2); ctx.fill();
        }
      }
      // The endoscope itself, coming back through the cardia toward the viewer.
      const sx = lx + R * 0.08, sy = ly + R * 0.06, sr = R * 0.2;
      const sg = ctx.createLinearGradient(sx - sr, sy, sx + sr, sy);
      sg.addColorStop(0, '#1a1b1f'); sg.addColorStop(0.45, '#5c5f68'); sg.addColorStop(1, '#141518');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx, sy + R * 0.25, sr, R * 0.62, 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(sx + k * 3, sy + R * (0.02 + k * 0.1), sr * 0.9, sr * 0.3, 0.25, Math.PI, Math.PI * 2); ctx.stroke(); }
      glints(ctx, cx, cy, R, r, 7);
    }
    if ((f.params?.balloonEso && view === 'eso') || (f.params?.balloonGas && view === 'fundus')) {
      const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R * 0.85);
      g.addColorStop(0, 'rgba(255, 250, 225, .55)'); g.addColorStop(1, 'rgba(235, 215, 160, .35)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (f.bleed?.active && ((f.bleed.site === 'VAR') === (view === 'eso'))) {
      // Active bleeding: a jet from the ruptured column and blood pooling dependently.
      bleedT = (bleedT + 1) % 1000;
      const jx = cx + R * 0.28, jy = cy + R * 0.05;
      const pool = ctx.createRadialGradient(cx, cy + R * 0.8, R * 0.1, cx, cy + R * 0.8, R * 0.75);
      pool.addColorStop(0, 'rgba(95, 0, 12, .95)'); pool.addColorStop(1, 'rgba(120, 0, 20, 0)');
      ctx.fillStyle = pool; ctx.fillRect(cx - R, cy, 2 * R, R);
      const jr = rnd(bleedT);
      ctx.fillStyle = 'rgba(165, 8, 28, .85)';
      for (let i = 0; i < 70; i++) { const u = jr(), a = -1.9 + (jr() - 0.5) * 0.5; ctx.beginPath(); ctx.arc(jx + Math.cos(a) * u * R * 0.5, jy + Math.sin(a) * u * R * 0.5 + u * u * R * 0.4, 1.2 + 2.2 * (1 - u), 0, Math.PI * 2); ctx.fill(); }
    }
    // Scope vignette and a mask like the processor's.
    const vg = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
    ctx.strokeStyle = '#0c0d10'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = cssVar('--text-3') || '#888'; ctx.font = FONT(500, 10); ctx.textAlign = 'left';
    ctx.fillText(view === 'eso' ? 'Distal esophagus · 36 cm' : 'Fundus · retroflexed', 6, hh - 6);
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update, setView(v) { view = v; seg.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String((i === 0) === (v === 'eso')))); } };
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
