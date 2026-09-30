// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): HVPG catheter, endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js?v=29d10ad9ef';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { h, fmt, fitCanvas, cssVar, clamp, toast, icon } from './util.js?v=fe164f31f1';
import { FONT } from './charts.js?v=6046946e83';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── HVPG procedure ──────────────────────────────────
// A transjugular measurement, step by step: the catheter reads the free hepatic venous pressure,
// the balloon is inflated, the stagnant column equilibrates with the sinusoids, and the wedged
// plateau minus the free pressure is the HVPG. The trace uses the same colors as Pressure over
// time (wedged violet, free blue).
const HV_NAME = { R: 'Right', M: 'Middle', L: 'Left' };
const hvpgSev = (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger');
const hvpgWord = (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : v < 12 ? 'CSPH' : 'CSPH · bleeding risk');
export function createHVPG() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Catheter pressure trace' });
  const box = h('div', { class: 'chart-box hv-box' }, cv);
  const veinSeg = h('div', { class: 'seg hv-veins', role: 'group', 'aria-label': 'Hepatic vein' }, ['R', 'M', 'L'].map((v) =>
    h('button', { 'data-v': v, onclick: () => updateParams({ catheter: { vein: v, wedged: false } }, { label: `Catheter in ${v}HV` }) }, `${HV_NAME[v]} HV`)));
  const wedgeBtn = h('button', { class: 'btn primary sm' }, 'Inflate balloon');
  const removeBtn = h('button', { class: 'btn ghost sm' }, 'Remove');
  wedgeBtn.addEventListener('click', () => {
    const c = store.get().params.catheter;
    if (!c.vein) return toast('Place the catheter in a hepatic vein first.');
    updateParams({ catheter: { vein: c.vein, wedged: !c.wedged } }, { label: c.wedged ? 'Deflate balloon' : 'Wedge catheter' });
  });
  removeBtn.addEventListener('click', () => updateParams({ catheter: { vein: null, wedged: false } }, { label: 'Remove catheter' }));

  // The report: the measured gradient, its parts, the steps, earlier measurements.
  const numEl = h('b', {}, '—');
  const unitEl = h('small', {}, 'mmHg');
  const sevEl = h('span', { class: 'hv-sev' });
  const partsEl = h('div', { class: 'hv-parts' });
  const steps = [['place', 'Place the catheter in a hepatic vein'], ['free', 'Read the free pressure (FHVP)'], ['wedge', 'Inflate the balloon to wedge'], ['plateau', 'Wait for the wedged plateau']]
    .map(([id, text]) => h('li', { 'data-step': id }, text));
  const stepList = h('ol', { class: 'hv-steps' }, steps);
  const trueEl = h('div', { class: 'hv-true' });
  const logEl = h('div', { class: 'hv-log' });
  const report = h('div', { class: 'hv-report' },
    h('div', { class: 'hv-k' }, 'HVPG'), h('div', { class: 'hv-num' }, numEl, unitEl, sevEl), partsEl, stepList, trueEl, logEl);
  const el = h('div', { class: 'hv', 'data-pane': 'hvpg' },
    h('div', { class: 'hv-head' }, veinSeg, h('div', { class: 'hv-actions' }, wedgeBtn, removeBtn)),
    h('div', { class: 'hv-main' }, box, report));

  const trace = [];
  let fhvp = null, whvp = null, wedgeStart = null;
  const log = [];
  let c = { vein: null, wedged: false }, now = 0;

  function update(f) {
    c = f.params?.catheter || store.get().params.catheter;
    const m = f.metrics;
    now = f.t;
    if (c.vein) {
      const v = c.wedged ? m.measured?.whvp : m.measured?.fhvp;
      if (Number.isFinite(v) && trace[trace.length - 1]?.[0] !== now) trace.push([now, v, c.wedged]);
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
    } else { trace.length = 0; whvp = null; wedgeStart = null; }
    const plateau = c.wedged && wedgeStart != null && now - wedgeStart >= 12 && whvp != null;
    // steps: done, current, or still to come
    const state = !c.vein ? 0 : !c.wedged ? 1 : !plateau ? 3 : 4;
    steps.forEach((li, i) => { li.dataset.state = i < state ? 'done' : i === state ? 'now' : ''; });
    if (c.vein && !c.wedged) steps[1].dataset.state = fhvp != null ? 'done' : 'now';
    if (c.vein && !c.wedged && fhvp != null) steps[2].dataset.state = 'now';
    wedgeBtn.textContent = c.wedged ? 'Deflate balloon' : 'Inflate balloon';
    wedgeBtn.disabled = !c.vein;
    removeBtn.hidden = !c.vein;
    veinSeg.querySelectorAll('button[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === c.vein)));
    // measured gradient
    const last = log[log.length - 1];
    const val = plateau ? whvp - fhvp : last ? last.hvpg : null;
    numEl.textContent = val != null ? fmt(val, 1) : '—';
    unitEl.hidden = val == null;
    sevEl.textContent = val != null ? hvpgWord(val) : c.wedged ? 'Equilibrating…' : 'Not measured';
    sevEl.dataset.sev = val != null ? hvpgSev(val) : '';
    const fv = plateau ? fhvp : last?.fhvp, wv = plateau ? whvp : last?.whvp;
    partsEl.textContent = fv != null && wv != null ? `WHVP ${fmt(wv, 1)} − FHVP ${fmt(fv, 1)} mmHg` : c.vein && fhvp != null ? `FHVP ${fmt(fhvp, 1)} mmHg` : '';
    const hidden = store.get().hiddenReadouts?.has('trueHVPG') || store.get().imaging;
    trueEl.textContent = hidden ? '' : `True portal pressure ${fmt(m.pv, 1)} mmHg`;
    draw();
  }
  function renderLog() {
    const rows = log.slice(-4).reverse();
    logEl.replaceChildren(...(rows.length > 1 || (rows.length && rows[0] !== log[log.length - 1]) ? [h('div', { class: 'hv-k' }, 'Measurements'),
      ...rows.map((e) => h('div', { class: 'hv-row' }, h('span', {}, `${HV_NAME[e.vein]} HV${e.day ? ` · day ${e.day}` : ''}`), h('b', {}, `${fmt(e.hvpg, 1)} mmHg`)))] : []));
  }
  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const L = 34, B = 22, T = 24, R = 70;
    const text = cssVar('--text'), faint = cssVar('--text-3'), muted = cssVar('--text-2');
    if (trace.length < 2) {
      // empty state: the idea of the measurement, drawn quietly
      ctx.textAlign = 'center'; ctx.fillStyle = faint; ctx.font = FONT(500, 13);
      ctx.fillText(c.vein ? 'Reading the catheter…' : 'Choose a hepatic vein to place the catheter', w / 2, hh / 2 - 6);
      if (!c.vein) { ctx.font = FONT(500, 12); ctx.fillText('HVPG = wedged − free hepatic venous pressure', w / 2, hh / 2 + 16); }
      return;
    }
    const t1 = trace[trace.length - 1][0], t0 = t1 - 60;
    const vals = trace.map((p) => p[1]).filter(Number.isFinite);
    const pMax = Math.max(15, Math.ceil((Math.max(...vals) + 3) / 5) * 5);
    const X = (t) => L + ((t - t0) / 60) * (w - L - R), Y = (p) => T + (1 - p / pMax) * (hh - T - B);
    const cFree = cssVar('--tr-hv'), cWedge = cssVar('--tr-wedge');
    ctx.lineWidth = 1; ctx.font = FONT(500, 10.5); ctx.textBaseline = 'middle';
    for (let p = 0; p <= pMax; p += 5) {
      const yy = Math.round(Y(p)) + 0.5;
      ctx.strokeStyle = cssVar('--grid'); ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke();
      ctx.fillStyle = faint; ctx.textAlign = 'right'; ctx.fillText(String(p), L - 8, yy);
    }
    ctx.textAlign = 'left'; ctx.fillText('mmHg', 4, 8);
    // wedged segments shaded, so inflation and deflation read at a glance
    let segStart = null;
    for (let i = 0; i <= trace.length; i++) {
      const wd = trace[i]?.[2];
      if (wd && segStart == null) segStart = trace[i][0];
      if ((!wd || i === trace.length) && segStart != null) {
        const tEnd = trace[Math.min(i, trace.length - 1)][0];
        ctx.fillStyle = cWedge; ctx.globalAlpha = 0.07; ctx.fillRect(X(segStart), T, X(tEnd) - X(segStart), hh - T - B); ctx.globalAlpha = 1;
        segStart = null;
      }
    }
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < trace.length; i++) {
      const [ta, va, wa] = trace[i - 1], [tb, vb] = trace[i];
      ctx.strokeStyle = wa ? cWedge : cFree;
      ctx.beginPath(); ctx.moveTo(X(ta), Y(va)); ctx.lineTo(X(tb), Y(vb)); ctx.stroke();
    }
    // measured levels and the gradient between them
    const last = log[log.length - 1];
    const fv = fhvp ?? last?.fhvp, wv = (c.wedged ? whvp : null) ?? last?.whvp;
    const level = (v, color, label) => {
      const yy = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R + 4, yy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.font = FONT(650, 12); ctx.textAlign = 'left'; ctx.fillText(fmt(v, 1), w - R + 10, yy);
      ctx.fillStyle = muted; ctx.font = FONT(500, 10.5); ctx.fillText(label, w - R + 10, yy + 13);
    };
    if (fv != null) level(fv, cFree, 'FHVP');
    if (wv != null) {
      level(wv, cWedge, 'WHVP');
      if (fv != null) {
        const x = w - R - 10, y1 = Y(wv) + 3, y2 = Y(fv) - 3;
        ctx.strokeStyle = text; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.moveTo(x - 4, y1); ctx.lineTo(x + 4, y1); ctx.moveTo(x - 4, y2); ctx.lineTo(x + 4, y2); ctx.stroke();
        ctx.font = FONT(650, 11.5); ctx.textAlign = 'right'; ctx.fillStyle = text; ctx.fillText(`HVPG ${fmt(wv - fv, 1)}`, x - 8, (y1 + y2) / 2);
      }
    }
    // time axis
    ctx.fillStyle = faint; ctx.font = FONT(500, 10.5); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let sBack = 10; sBack < 60; sBack += 10) ctx.fillText(`−${sBack} s`, X(t1 - sBack), hh - 5);
    ctx.textAlign = 'right'; ctx.fillText('now', w - R, hh - 5);
  }
  return { id: 'hvpg', label: 'HVPG', el, update };
}

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
  box.append(cv);
  let view = 'eso';
  const seg = h('div', { class: 'seg full' }, [['eso', 'Esophagus'], ['fundus', 'Fundus (retroflexed)']].map(([v, l]) => {
    const b = h('button', { 'aria-pressed': String(v === view) }, l);
    b.addEventListener('click', () => { view = v; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    return b;
  }));
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side' }, seg, stats,
    h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band a column (EVL)'),
    h('div', { class: 'ctl-sub' }, 'Drawn from the model. F1 small and straight, F2 enlarged and tortuous, F3 large and beaded; red wale marks mean high wall tension.'));
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
  // End-on view down the distal esophagus. A varix is a longitudinal submucosal vein, so from
  // the scope tip each one is a column of mucosa bulging into the lumen, running away from the
  // viewer and converging on the dark lumen at the vanishing point. Depth s (0 at the scope, 1
  // at the lumen) maps to screen radius by perspective; a column keeps its angular width, so
  // it narrows with distance. It is shaded as raised, wet mucosa (a bluish cast where the vein
  // shows through, a lit flank, a shadowed flank, a glint on the crest), serpentine when
  // tortuous (F2), beaded when large (F3), and large ones crowd the lumen.
  const depthR = (R, s) => R * 1.12 / (1 + 5 * s);
  const lit = (rr, R) => clamp((rr / R - 0.13) / 0.8, 0, 1) ** 0.85;
  const VEIN = [132, 128, 186];
  function esoVarices(ctx, cx, cy, R, lx, ly, vx, grow, bands, r) {
    const n = grow < 0.25 ? 3 : 4;
    const tort = grow < 0.3 ? 0.025 : 0.05 + 0.1 * grow; // F1 nearly straight, F2–F3 serpentine
    const beaded = grow > 0.55;                          // F3
    const relief = 0.45 + 0.55 * clamp(grow * 2.2, 0, 1); // F1 barely raised, F2–F3 bulging
    const cols = [];
    for (let c = 0; c < n; c++) {
      const a0 = (c / n) * Math.PI * 2 + 0.45 + (r() - 0.5) * 0.35;
      const th = 0.07 + 0.16 * grow + (r() - 0.5) * 0.03; // angular half-width
      const ph = r() * 6;
      cols.push({ c, a0, th, ph, banded: c < bands });
    }
    // Faint longitudinal mucosal folds between the columns, converging the same way.
    ctx.strokeStyle = 'rgba(120, 40, 40, .09)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, wv = r() * 6;
      ctx.beginPath();
      for (let s0 = 0; s0 <= 1.0001; s0 += 0.05) { const rr = depthR(R, s0), k = a + 0.03 * Math.sin(s0 * 9 + wv), x = lx + Math.cos(k) * rr, y = ly + Math.sin(k) * rr; if (s0) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // Light comes from the scope tip, slightly above: flanks facing up are lit.
    const S = 48, U = 22;
    const litGrad = (alpha, rgbS, floor = 0) => {
      // Depth fades a highlight (and the vein's cast): nothing is lit down in the dark lumen.
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, depthR(R, 0));
      for (const t of [0, 0.15, 0.25, 0.4, 0.6, 0.8, 1]) g.addColorStop(t, `rgba(${rgbS}, ${(alpha * (floor + (1 - floor) * lit(t * depthR(R, 0), R))).toFixed(3)})`);
      return g;
    };
    for (const col of cols) {
      const end = col.banded ? 0.46 : 1;
      // Serpentine in depth; the wiggle settles toward the vanishing point, where perspective
      // would otherwise wind it into a hook.
      const crest = (s0) => col.a0 + tort * Math.sin(s0 * 7 + col.ph) * (1 - s0 * s0);
      // Beads (F3) are broad nodules; every column tapers to a point at the lumen.
      const half = (s0) => col.th * (beaded ? 0.82 + 0.36 * Math.sin(s0 * 11 + col.ph) ** 2 : 1) * (col.banded ? 0.7 : 1) * (1 - 0.2 * s0) * Math.sqrt(Math.max(0, 1 - s0 ** 3));
      // Which flank faces the light (up on screen): +1 when the column's +u side is lit.
      const side = Math.cos(col.a0) >= 0 ? -1 : 1;
      const edge = (u) => { const pts = []; for (let i = 0; i <= S; i++) { const s0 = (i / S) * end, rr = depthR(R, s0), k = crest(s0) + u * half(s0); pts.push([lx + Math.cos(k) * rr, ly + Math.sin(k) * rr]); } return pts; };
      const strip = (u0, u1, fill) => {
        const A = edge(u0), B = edge(u1).reverse();
        ctx.beginPath(); ctx.moveTo(...A[0]); for (const q of A.slice(1)) ctx.lineTo(...q); for (const q of B) ctx.lineTo(...q); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
      };
      // A soft shadow cast on the mucosa beside the shadowed flank.
      for (let j = 0; j < 6; j++) { const u0 = -side * (1 + j * 0.08), u1 = -side * (1 + (j + 1) * 0.08); strip(Math.min(u0, u1), Math.max(u0, u1), `rgba(40, 6, 10, ${(relief * 0.08 * (1 - j / 6) ** 2).toFixed(3)})`); }
      for (let j = 0; j < U; j++) {
        const u0 = -1 + (2 * j) / U, u1 = -1 + (2 * (j + 1)) / U, um = (u0 + u1) / 2;
        const hgt = Math.sqrt(Math.max(0, 1 - um * um)), L = um * side;
        // The vein showing through the mucosa: a bluish cast, strongest on the crest.
        strip(u0, u1, litGrad((0.16 + 0.55 * grow) * hgt ** 1.6, VEIN.join(','), 0.35));
        // Raised mucosa: the flank toward the light brightens, the other darkens.
        if (L > 0) strip(u0, u1, litGrad(relief * 0.26 * L * hgt, '255, 236, 228'));
        else strip(u0, u1, `rgba(50, 8, 14, ${(relief * 0.32 * -L * hgt ** 0.8).toFixed(3)})`);
      }
      // A wet glint running along the crest on the lit side, thinning with depth.
      const gl = edge(side * 0.34);
      ctx.strokeStyle = litGrad(0.25 + 0.3 * relief, '255, 250, 246'); ctx.lineCap = 'round';
      for (let i = 0; i < gl.length * 0.75; i++) {
        const s0 = (i / S) * end;
        ctx.lineWidth = Math.max(0.6, depthR(R, s0) * half(s0) * (0.1 + 0.06 * Math.sin(i * 0.9 + col.ph)));
        ctx.beginPath(); ctx.moveTo(...gl[i]); ctx.lineTo(...gl[i + 1]); ctx.stroke();
      }
      // Red wale marks (longitudinal red streaks) and cherry-red spots on the crest.
      if (vx.redWale) {
        const cr = edge(-side * 0.05), rw = rnd(17 + col.c * 7);
        ctx.strokeStyle = 'rgba(196, 24, 40, .75)'; ctx.lineCap = 'round';
        for (let i = 2 + Math.floor(rw() * 3); i < cr.length * 0.7; i += 4 + Math.floor(rw() * 4)) {
          const s0 = (i / S) * end; ctx.lineWidth = Math.max(0.8, depthR(R, s0) * half(s0) * 0.08);
          ctx.beginPath(); ctx.moveTo(...cr[i]); ctx.lineTo(...cr[i + 1 + Math.floor(rw() * 2)]); ctx.stroke();
        }
        const sp = edge(-side * 0.3);
        ctx.fillStyle = 'rgba(210, 22, 44, .9)';
        for (let i = 5 + Math.floor(rw() * 4); i < sp.length * 0.65; i += 8 + Math.floor(rw() * 6)) { const s0 = (i / S) * end; ctx.beginPath(); ctx.arc(...sp[i], Math.max(1.2, depthR(R, s0) * half(s0) * 0.13), 0, Math.PI * 2); ctx.fill(); }
      }
      if (col.banded) {
        // Ligated: the column is sucked into a purple knuckle and strangled by a black band.
        const rr = depthR(R, end), kc = crest(end), x = lx + Math.cos(kc) * rr, y = ly + Math.sin(kc) * rr;
        const rb = Math.max(R * 0.07, rr * col.th * 1.4);
        const g = ctx.createRadialGradient(x - rb * 0.3, y - rb * 0.3, rb * 0.1, x, y, rb);
        g.addColorStop(0, '#b886a8'); g.addColorStop(1, '#5a2750');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rb, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#111'; ctx.lineWidth = rb * 0.3; ctx.beginPath(); ctx.arc(x, y, rb * 0.74, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  function draw(f, vx) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 32 || hh < 32) return; // hidden/reflowing canvas: wait for its measured size
    ctx.clearRect(0, 0, w, hh);
    // The field sits above its caption, never under it.
    const cx = w / 2, cy = (hh - 16) / 2, R = Math.min(w, hh - 16) / 2 - 6;
    const r = rnd(view === 'eso' ? 11 : 23);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const d = vx.d, grow = clamp((d - 2) / 10, 0, 1), present = d >= 2.4;
    const bands = Math.round(f.bands || 0);
    if (view === 'eso') {
      const lx = cx + R * 0.06, ly = cy - R * 0.04;
      mucosa(ctx, cx, cy, R, lx, ly, r);
      if (present) esoVarices(ctx, cx, cy, R, lx, ly, vx, grow, bands, r);
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
    ctx.fillText(view === 'eso' ? 'Distal esophagus · 36 cm' : 'Fundus · retroflexed', 6, hh - 3);
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
  const side = h('div', { class: 'chart-side' }, h('div', { class: 'side-title' }, 'Laplace’s law'), h('div', { class: 'formula' }, 'T = ΔP · r / w'), stats,
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
    if (w < 32 || hh < 32) return;
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
  const cv = h('canvas', { role: 'img', 'aria-label': 'Abdomen: ascites and spleen' });
  const box = h('div', { class: 'chart-box ab-box' }, cv);
  const vol = h('input', { type: 'range', min: 1, max: 10, step: 0.5, value: 5, 'aria-label': 'Volume to drain (L)' });
  const volLbl = h('span', { class: 'ctl-val' }, '5.0 L');
  const paintVol = () => { volLbl.textContent = `${(+vol.value).toFixed(1)} L`; vol.style.setProperty('--pct', `${((+vol.value - 1) / 9) * 100}%`); };
  vol.addEventListener('input', paintVol); paintVol();
  const alb = h('input', { type: 'checkbox', checked: true });
  const drain = h('button', { class: 'btn primary block', onclick: () => onAction({ kind: 'paracentesis', mL: +vol.value * 1000, albumin: alb.checked }) }, 'Drain');
  const numEl = h('b', {}, '—'), gradeEl = h('span', { class: 'ab-grade' });
  const stats = h('dl', { class: 'kv' });
  const extraStats = h('dl', { class: 'kv' });
  const report = h('div', { class: 'ab-report' },
    h('div', { class: 'hv-k' }, 'Ascites'), h('div', { class: 'hv-num' }, numEl, h('small', {}, 'L'), gradeEl), stats,
    h('div', { class: 'procedure-controls' },
      h('div', { class: 'ctl' }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, 'Paracentesis'), volLbl), vol),
      h('label', { class: 'check-row' }, alb, 'Albumin, 8 g per litre removed'), drain),
    h('details', { class: 'instrument-details' }, h('summary', {}, 'Fluid balance & spleen'), extraStats));
  const el = h('div', { class: 'ab', 'data-pane': 'abdomen' }, h('div', { class: 'hv-main ab-main' }, box, report));
  function update(f) {
    const a = f.metrics.ascites, sp = f.metrics.spleen;
    numEl.textContent = fmt(a.volume / 1000, 1);
    gradeEl.textContent = a.grade === 0 ? 'None' : `Grade ${a.grade}`;
    gradeEl.dataset.sev = a.grade === 0 ? 'ok' : a.grade === 1 ? 'caution' : 'danger';
    stats.replaceChildren(
      h('dt', {}, 'Forming'), h('dd', {}, `${fmt(a.ratePerDay, 0)} mL/day`),
      h('dt', {}, 'Abdominal pressure'), h('dd', {}, `${fmt(a.iap, 1)} mmHg`),
      h('dt', {}, 'Spleen'), h('dd', {}, `${fmt(sp.length, 1)} cm`));
    extraStats.replaceChildren(
      h('dt', {}, 'Grade'), h('dd', {}, a.label),
      h('dt', {}, 'Lymph: liver / gut / capacity'), h('dd', {}, `${fmt(a.hepLymph, 1)} / ${fmt(a.splLymph, 1)} / ${fmt(a.lymphCap, 1)}`),
      h('dt', {}, 'Ascitic protein'), h('dd', {}, a.volume > 150 ? (a.highProtein ? 'high (> 2.5 g/dL)' : 'low (< 2.5 g/dL)') : '—'),
      h('dt', {}, 'SAAG'), h('dd', {}, a.volume > 150 ? (f.metrics.ppg > 6 || f.metrics.whvp > 10 ? '≥ 1.1 (portal hypertension)' : '< 1.1') : '—'),
      h('dt', {}, 'Platelets (illustrative)'), h('dd', {}, `${Math.round(sp.platelets)} ×10⁹/L`));
    draw(a, sp);
  }
  // A quiet front view: the abdomen from the costal margin to the pelvis, fluid pooling in the
  // flanks and pelvis, the spleen against its normal size (dashed), and the abdominal pressure.
  function draw(a, sp) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    const gaugeW = 70;
    const sz = Math.min(w - gaugeW - 20, hh - 24, 300);
    if (sz < 60) return;
    const cx = (w - gaugeW) / 2, top = 12, bot = top + sz, H = sz;
    const fill = clamp(a.volume / 12000, 0, 1);
    const bulge = fill * sz * 0.1;
    const halfTop = sz * 0.27, halfWaist = sz * 0.36 + bulge, halfHip = sz * 0.32 + bulge * 0.6, halfBot = sz * 0.15;
    const body = new Path2D();
    body.moveTo(cx - halfTop, top);
    body.bezierCurveTo(cx - halfTop - sz * 0.04, top + H * 0.25, cx - halfWaist - bulge * 0.4, top + H * 0.42, cx - halfWaist, top + H * 0.58);
    body.bezierCurveTo(cx - halfWaist + sz * 0.01, top + H * 0.74, cx - halfHip, top + H * 0.86, cx - halfBot, bot);
    body.lineTo(cx + halfBot, bot);
    body.bezierCurveTo(cx + halfHip, top + H * 0.86, cx + halfWaist - sz * 0.01, top + H * 0.74, cx + halfWaist, top + H * 0.58);
    body.bezierCurveTo(cx + halfWaist + bulge * 0.4, top + H * 0.42, cx + halfTop + sz * 0.04, top + H * 0.25, cx + halfTop, top);
    body.closePath();
    ctx.fillStyle = cssVar('--og-gut-1'); ctx.globalAlpha = 0.35; ctx.fill(body); ctx.globalAlpha = 1;
    // fluid
    ctx.save(); ctx.clip(body);
    if (a.volume > 60) {
      const level = bot - H * (0.06 + 0.62 * Math.pow(fill, 0.8));
      const g = ctx.createLinearGradient(0, level, 0, bot);
      g.addColorStop(0, cssVar('--ascites')); g.addColorStop(1, cssVar('--ascites'));
      ctx.fillStyle = g; ctx.globalAlpha = 0.32;
      ctx.beginPath(); ctx.moveTo(cx - sz, bot + 2);
      for (let x = -sz; x <= sz; x += 6) ctx.lineTo(cx + x, level + Math.sin(x / 14) * 1.6);
      ctx.lineTo(cx + sz, bot + 2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = cssVar('--ascites'); ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = -sz; x <= sz; x += 6) ctx[x === -sz ? 'moveTo' : 'lineTo'](cx + x, level + Math.sin(x / 14) * 1.6);
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--text-2'); ctx.font = FONT(600, 12); ctx.textAlign = 'center';
      if (bot - level > 26) ctx.fillText(`${fmt(a.volume / 1000, 1)} L`, cx, (level + bot) / 2 + 8);
    }
    ctx.restore();
    ctx.strokeStyle = cssVar('--og-gut-3'); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.stroke(body); ctx.globalAlpha = 1;
    // costal margins and umbilicus
    ctx.strokeStyle = cssVar('--og-gut-3'); ctx.globalAlpha = 0.35; ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(cx - halfTop + 4, top + 4); ctx.quadraticCurveTo(cx - sz * 0.12, top + H * 0.24, cx, top + H * 0.12);
    ctx.quadraticCurveTo(cx + sz * 0.12, top + H * 0.24, cx + halfTop - 4, top + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, top + H * 0.52, 3, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    // spleen, in the left upper quadrant (the viewer's right), with its normal size dashed
    const spleen = (len) => {
      const k = len / 11 * sz * 0.075;
      const x = cx + halfTop * 0.62, y = top + H * 0.22;
      const p = new Path2D();
      p.ellipse(x, y + k * 0.3, k * 0.62, k * 1.15, -0.5, 0, Math.PI * 2);
      return p;
    };
    ctx.setLineDash([3, 3]); ctx.strokeStyle = cssVar('--og-spleen-3'); ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.stroke(spleen(11)); ctx.setLineDash([]);
    ctx.globalAlpha = 0.85; ctx.fillStyle = cssVar('--og-spleen-1'); ctx.fill(spleen(sp.length));
    ctx.strokeStyle = cssVar('--og-spleen-3'); ctx.globalAlpha = 0.7; ctx.stroke(spleen(sp.length)); ctx.globalAlpha = 1;
    // abdominal pressure gauge
    const gx = cx + sz / 2 + 18, gy = top + 4, gh = sz - 20, gw = 6, max = 30;
    const Y = (v) => gy + gh - clamp(v / max, 0, 1) * gh;
    ctx.fillStyle = cssVar('--surface-3'); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gx, gy, gw, gh, 3) : ctx.rect(gx, gy, gw, gh); ctx.fill();
    const iapCol = a.iap >= 20 ? cssVar('--danger') : a.iap >= 12 ? cssVar('--caution') : cssVar('--ok');
    ctx.fillStyle = iapCol; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gx, Y(a.iap), gw, gy + gh - Y(a.iap), 3) : ctx.rect(gx, Y(a.iap), gw, gy + gh - Y(a.iap)); ctx.fill();
    ctx.font = FONT(500, 10); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const [v, label] of [[12, 'IAH'], [20, 'ACS']]) {
      ctx.fillStyle = cssVar('--text-3'); ctx.fillRect(gx + gw + 2, Math.round(Y(v)), 5, 1); ctx.fillText(`${v} ${label}`, gx + gw + 10, Y(v));
    }
    ctx.fillStyle = cssVar('--text'); ctx.font = FONT(650, 12); ctx.textAlign = 'right';
    ctx.fillText(fmt(a.iap, 0), gx - 6, Y(a.iap));
    ctx.fillStyle = cssVar('--text-3'); ctx.font = FONT(500, 10); ctx.textAlign = 'center'; ctx.fillText('IAP mmHg', gx + gw / 2, gy + gh + 12);
    ctx.textBaseline = 'alphabetic';
    cv.setAttribute('aria-label', `Abdomen: ${fmt(a.volume / 1000, 1)} L of ascites, abdominal pressure ${fmt(a.iap, 0)} mmHg, spleen ${fmt(sp.length, 1)} cm.`);
  }
  return { id: 'abdomen', label: 'Ascites & paracentesis', el, update };
}
