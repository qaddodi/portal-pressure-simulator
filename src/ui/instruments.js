// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js?v=706a39d50b';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { verbEnabled } from './actions.js?v=451611887c';
import { h, fmt, fitCanvas, cssVar, clamp, icon } from './util.js?v=e0101a3fa2';
import { simTime, isPaused } from './clock.js?v=d82cfa024b';
import { createEndoGL } from './endo-gl.js?v=b10afb7c95';
import { renderEndo } from './endo-render.js?v=41cd7f6fa2';
import { FONT } from './charts.js?v=87f57389af';
import { store, updateParams, logAction, varicesPresent } from './store.js?v=5edd069b32';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
  box.append(cv);
  const view = 'eso'; // the esophageal variceal view only
  // The position is a caption under the view, never over it.
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, 'Distal esophagus · 36 cm'));
  const bandBtn = h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band a column (EVL)');
  // The readings: the grade leads, wall stress is a meter toward the tear point, size and wall side by side,
  // red signs and bands as chips. Built once; each frame only changes text, widths and states.
  const dd = (cls) => h('dd', { class: cls });
  const gradeCode = h('b'), gradeLabel = h('span');
  const grade = h('dd', { class: 'endo-grade' }, gradeCode, gradeLabel);
  const stressTxt = dd('endo-stress-v'), stressFill = h('i'), stressBar = h('span', { class: 'endo-bar', 'aria-hidden': 'true' }, stressFill);
  const diam = dd('endo-num'), wall = dd('endo-num'), red = dd('endo-chip-v'), bands = dd('endo-chip-v');
  const item = (cls, ...kids) => h('div', { class: cls }, ...kids);
  const stats = h('dl', { class: 'endo-read' },
    item('endo-g', h('dt', { class: 'sr-only' }, 'Grade'), grade),
    item('endo-stress', h('dt', {}, 'Wall stress (model)'), stressTxt, stressBar),
    item('endo-tile', h('dt', {}, 'Diameter'), diam),
    item('endo-tile', h('dt', {}, 'Wall thickness'), wall),
    item('endo-chip', h('dt', {}, 'Red signs'), red),
    item('endo-chip', h('dt', {}, 'Bands placed'), bands));
  const side = h('div', { class: 'chart-side' }, stats,
    bandBtn,
    h('div', { class: 'ctl-sub' }, 'Drawn from the model. F1 small and straight, F2 enlarged and tortuous, F3 large and beaded.'));
  el.append(stage, side);
  const set = (node, v) => { if (node.textContent !== v) node.textContent = v; };
  function update(f) {
    const m = f.metrics;
    const vx = view === 'eso' ? m.varix : m.gastricVarix;
    const noVx = !varicesPresent(f, view === 'eso' ? 'VAR' : 'GV');
    bandBtn.disabled = noVx; bandBtn.title = noVx ? 'No varices to band' : '';
    set(gradeCode, vx.grade.code === '—' ? '' : vx.grade.code); set(gradeLabel, vx.grade.label);   // no varices: the label alone
    grade.dataset.sev = vx.grade.code === 'F1' ? 'caution' : vx.grade.code === '—' ? 'ok' : 'danger';
    set(stressTxt, vx.ratio >= 1 ? (store.get().params?.bleeding ? 'past the tear point' : 'past the tear point (bleeding is off, so it holds)') : `${Math.round(vx.ratio * 100)} % of the tear point`);
    const sev = vx.ratio > 1 ? 'critical' : vx.ratio > 0.7 ? 'danger' : vx.ratio > 0.4 ? 'caution' : 'ok';   // as the wall view's gauge
    if (stressBar.dataset.sev !== sev) stressBar.dataset.sev = sev;
    const wPct = `${Math.round(clamp(vx.ratio, 0, 1) * 1000) / 10}%`;
    if (stressFill.style.width !== wPct) stressFill.style.width = wPct;
    set(diam, `${fmt(vx.d, 1)} mm`); set(wall, `${fmt(vx.w, 2)} mm`);
    const redV = vx.d < 2.5 ? 'None' : vx.redWale ? 'Red wale, cherry spots' : 'None';
    set(red, redV); red.parentNode.dataset.on = String(redV !== 'None');
    const nb = String(Math.round(f.bands || 0));
    set(bands, nb); bands.parentNode.dataset.on = String(nb !== '0');
    draw(f, vx);
  }
  // Rendered endoscopic view (see endo-render.js): a per-pixel 3D shading of the lumen with raised,
  // winding varices, drawn once per state into a cached bitmap, so it is perfectly steady. Balloon,
  // bleeding and the scope mask are drawn on top.
  const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  const gl = createEndoGL(), glOut = document.createElement('canvas');
  let peak = 0, peakRed = 0, an = null, lastT = 0, last = null, raf = 0, bleedT = 0, cache = { key: '', img: null }, glKey = '';
  // An eased tween toward a target value: cur follows from -> to over dur ms after a delay.
  const tw = (v) => ({ v, from: v, to: v, t0: 0, dur: 1, delay: 0, cur: v });
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function tween(t, target, now, dur, delay) {
    if (target !== t.to) { t.from = t.cur; t.to = target; t.t0 = now; t.dur = dur; t.delay = delay; }
    if (t.dur <= 1) { t.cur = t.v = t.to; return false; } // snap
    const k = Math.min(1, Math.max(0, (now - t.t0 - t.delay) / t.dur));
    t.cur = t.from + (t.to - t.from) * ease(k); t.v = t.cur;
    return k < 1 && t.cur !== t.to;
  }
  store.on('running', () => { if (last && !isPaused()) draw(last.f, last.vx); });
  function draw(f, vx) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 32 || hh < 32) return; // hidden/reflowing canvas: wait for its measured size
    ctx.clearRect(0, 0, w, hh);
    // The field fills the box.
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 4;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const bands = Math.round(f.bands || 0);
    // Banding deflates the banded columns only. The model's single varix size falls as bands go on,
    // so unbanded columns keep the size seen before the first band.
    const gNow = clamp((vx.d - 2) / 10, 0, 1);
    peak = bands > 0 ? Math.max(peak, gNow) : gNow;
    const tg = peak, tv = bands > 0 ? 1 : clamp((vx.d - 2.5) / 1.0, 0, 1);
    // Red signs follow the modeled wall stress: they start below the red-wale threshold (70 % of the
    // tear point) and are full near it. Unbanded columns keep what they showed before the first band.
    const rNow = clamp((vx.ratio - 0.55) / 0.35, 0, 1);
    peakRed = bands > 0 ? Math.max(peakRed, rNow) : rNow;
    const tr = peakRed;
    last = { f, vx };
    const now = simTime() * 1000, dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now; // sim clock: frozen while paused
    // Targets: each column is deflated and knuckled once banded (the 4 bands fill columns in turn).
    const defT = [0, 0, 0, 0], knT = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
      const nb = Math.floor(bands / 4) + (c < bands % 4 ? 1 : 0);
      defT[c] = nb > 0 ? 1 : 0;
      for (let k = 0; k < Math.min(nb, 4); k++) knT[c * 4 + k] = 1;
    }
    if (!an) {
      an = { g: tg, v: tv, r: tr, def: defT.map((x) => tw(x)), kn: knT.map((x) => tw(x)) };
      an.def.forEach((t, i) => { t.v = defT[i]; }); an.kn.forEach((t, i) => { t.v = knT[i]; });
    }
    // Size and presence follow the model continuously (critically damped, ~0.2 s); banding plays a
    // slower eased tween: the vein deflates first, the knuckle and band follow.
    const kf = 1 - Math.exp(-dt / 0.2);
    an.g += (tg - an.g) * kf; an.v += (tv - an.v) * kf; an.r += (tr - an.r) * kf;
    if (Math.abs(tg - an.g) < 0.0008) an.g = tg;
    if (Math.abs(tv - an.v) < 0.0008) an.v = tv;
    if (Math.abs(tr - an.r) < 0.0008) an.r = tr;
    let busy = an.g !== tg || an.v !== tv || an.r !== tr;
    // The band snaps on and the banded vein starts deflating at once, in about half a second.
    for (let c = 0; c < 4; c++) busy = tween(an.def[c], defT[c], now, 500, 0) || busy;
    for (let i = 0; i < 16; i++) busy = tween(an.kn[i], knT[i], now, 1, 0) || busy;
    if (busy && !raf && !isPaused()) raf = requestAnimationFrame(() => { raf = 0; if (last) draw(last.f, last.vx); });
    const res = clamp(Math.round(2 * R * (window.devicePixelRatio || 1)), 160, 480);
    let img;
    if (gl) {
      // Drawn once per state and kept as a 2D bitmap: a steady field costs no shader pass or GPU readback.
      const gk = [res, an.g, an.v, an.r, ...an.def.map((t) => t.cur), ...an.kn.map((t) => t.cur)].map((x) => Math.round(x * 32)).join('|');
      if (gk !== glKey) {
        glKey = gk;
        gl.render(res, { grow: an.g, vis: an.v, red: an.r, def: an.def.map((t) => t.cur), kn: an.kn.map((t) => t.cur) });
        if (glOut.width !== res) glOut.width = glOut.height = res;
        glOut.getContext('2d').drawImage(gl.canvas, 0, 0);
      }
      img = glOut;
    } else {
      // No WebGL: the CPU renderer draws the target state without transitions.
      const r2 = Math.min(res, 300), gq = Math.round(tg * 14) / 14;
      const key = [r2, gq, bands, Math.round(tv * 10), Math.round(tr * 8)].join('|');
      if (cache.key !== key) cache = { key, img: renderEndo(r2, { grow: gq, bands, vis: tv, red: Math.round(tr * 8) / 8 }) };
      img = cache.img;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - R, cy - R, 2 * R, 2 * R);
    if (f.params?.balloonEso) {
      const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R * 0.85);
      g.addColorStop(0, 'rgba(255, 250, 225, .55)'); g.addColorStop(1, 'rgba(235, 215, 160, .35)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (f.bleed?.active && f.bleed.site === 'VAR') {
      // Active bleeding: a jet from the ruptured column and blood pooling dependently.
      bleedT = (bleedT + 1) % 1000;
      const jx = cx + R * 0.28, jy = cy + R * 0.05;
      const pool = ctx.createRadialGradient(cx, cy + R * 0.8, R * 0.1, cx, cy + R * 0.8, R * 0.75);
      pool.addColorStop(0, 'rgba(95, 0, 12, .95)'); pool.addColorStop(1, 'rgba(120, 0, 20, 0)');
      ctx.fillStyle = pool; ctx.fillRect(cx - R, cy, 2 * R, R);
      const jr = rnd(77), sway = 0.1 * Math.sin(bleedT * 0.02);
      ctx.fillStyle = 'rgba(165, 8, 28, .85)';
      for (let i = 0; i < 70; i++) { const u = jr(), a = -1.9 + sway + (jr() - 0.5) * 0.5; ctx.beginPath(); ctx.arc(jx + Math.cos(a) * u * R * 0.5, jy + Math.sin(a) * u * R * 0.5 + u * u * R * 0.4, 1.2 + 2.2 * (1 - u), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = '#0c0d10'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update, setView() {} };
}

// ── Varix wall cross-section (L3) ───────────────────
// Scope's Wall mechanics tab: a cross-section of the esophagus with the varix in its wall, and Laplace's
// law as readings in the same tiles and meter as the scope view.
export function createVarixWall() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'varixwall' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Varix cross-section: transmural pressure stretches the varix wall' });
  box.append(cv);
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, 'Cross-section'));
  const dd = (cls) => h('dd', { class: cls });
  const item = (cls, ...kids) => h('div', { class: cls }, ...kids);
  const stressTxt = dd('endo-stress-v'), stressFill = h('i'), stressBar = h('span', { class: 'endo-bar', 'aria-hidden': 'true' }, stressFill);
  // Each number with its unit in smaller type, so a long reading still fits a narrow tile.
  const num = (unit) => { const v = h('span'); const d = h('dd', { class: 'endo-num' }, v, unit ? h('small', {}, ' ' + unit) : ''); d.v = v; return d; };
  const ptm = num('mmHg'), rad = num('mm'), wal = num('mm'), idx = num('');
  const stats = h('dl', { class: 'endo-read' },
    item('endo-g wall-law', h('dt', {}, 'Laplace’s law'), h('dd', { class: 'wall-formula' }, 'T = ΔP · r / w')),
    item('endo-stress', h('dt', {}, 'Wall stress (model)'), stressTxt, stressBar),
    item('endo-tile', h('dt', {}, 'Transmural ΔP'), ptm),
    item('endo-tile', h('dt', {}, 'Radius r'), rad),
    item('endo-tile', h('dt', {}, 'Wall w'), wal),
    item('endo-tile', h('dt', {}, 'Stress index'), idx));
  const side = h('div', { class: 'chart-side' }, stats,
    h('div', { class: 'ctl-sub' }, 'A wider varix, higher transmural pressure and a thinner wall all raise the stress. Remodeling enlarges the varix and thins its wall over months; a balloon raises the pressure outside it.'));
  el.append(stage, side);
  const set = (node, v) => { if (node.textContent !== v) node.textContent = v; };
  function update(f) {
    const v = f.metrics.varix;
    set(ptm.v, fmt(v.ptm, 1)); set(rad.v, fmt(v.r, 2)); set(wal.v, fmt(v.w, 2)); set(idx.v, fmt(v.T, 0));
    set(stressTxt, v.ratio >= 1 ? 'past the tear point' : `${Math.round(v.ratio * 100)} % of the tear point`);
    const sev = v.ratio > 1 ? 'critical' : v.ratio > 0.7 ? 'danger' : v.ratio > 0.4 ? 'caution' : 'ok';
    if (stressBar.dataset.sev !== sev) stressBar.dataset.sev = sev;
    const wPct = `${Math.round(clamp(v.ratio, 0, 1) * 1000) / 10}%`;
    if (stressFill.style.width !== wPct) stressFill.style.width = wPct;
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 32 || hh < 32) return;
    ctx.clearRect(0, 0, w, hh);
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 6, Rl = R * 0.52;
    // The wall: muscle outside, mucosa inside, the lumen in the middle.
    ctx.fillStyle = cssVar('--organ-stomach'); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--hairline'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(cx, cy, Rl, 0, 7); ctx.fill();
    // The varix in the submucosa at the top, bulging into the lumen; its size follows the model's radius.
    const rr = clamp(v.r * R * 0.05, 4, R * 0.3);
    const vy = cy - Rl - rr * 0.25;
    const rim = v.ratio > 0.7 ? cssVar('--danger') : cssVar('--text-2');
    // Transmural pressure pushes outward on the varix wall: longer arrows for a higher ΔP.
    const len = clamp(v.ptm, 0, 30) / 30 * rr * 0.9 + 4;
    ctx.strokeStyle = cssVar('--text-2'); ctx.fillStyle = cssVar('--text-2'); ctx.lineWidth = Math.max(1.25, R / 140);
    for (let a = -Math.PI; a < Math.PI - 0.01; a += Math.PI / 4) {
      const x0 = cx + Math.cos(a) * (rr + 3), y0 = vy + Math.sin(a) * (rr + 3), x1 = cx + Math.cos(a) * (rr + 3 + len), y1 = vy + Math.sin(a) * (rr + 3 + len);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const hd = 4 + R / 60;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.45) * hd, y1 - Math.sin(a - 0.45) * hd); ctx.lineTo(x1 - Math.cos(a + 0.45) * hd, y1 - Math.sin(a + 0.45) * hd); ctx.fill();
    }
    ctx.fillStyle = pressureColor(f.P[NI.VAR]); ctx.beginPath(); ctx.arc(cx, vy, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = clamp(v.w * R / 20, 1, 10); ctx.stroke();
    // The radius, drawn across the varix.
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.25; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, vy); ctx.lineTo(cx + rr, vy); ctx.stroke(); ctx.setLineDash([]);
    const fs = clamp(R / 11, 10, 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (rr > 14) { ctx.fillStyle = '#fff'; ctx.font = FONT(600, fs); ctx.fillText('r', cx + rr / 2, vy + fs * 0.7); }
    // Laplace's other two terms on the picture: the tension T along the wall (two arrows pulling apart round the top,
    // heavier as the stress rises) and the wall thickness w across the rim (a bracket, in the faded label ink).
    const lw = clamp(v.w * R / 20, 1, 10), ro = rr + lw / 2 + Math.max(5, R / 30), ink = cssVar('--text-3');
    ctx.strokeStyle = rim; ctx.fillStyle = rim; ctx.lineWidth = clamp(1.25 + 2.5 * clamp(v.ratio, 0, 1.2), 1.25, 4);
    for (const s of [-1, 1]) {
      const a0 = -Math.PI / 2 + s * 0.22, a1 = -Math.PI / 2 + s * 1.05;
      ctx.beginPath(); ctx.arc(cx, vy, ro, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      const ex = cx + Math.cos(a1) * ro, ey = vy + Math.sin(a1) * ro, tx = -Math.sin(a1) * s, ty = Math.cos(a1) * s, hd = 5 + R / 50;
      ctx.beginPath(); ctx.moveTo(ex + tx * hd * 0.2, ey + ty * hd * 0.2);
      ctx.lineTo(ex - tx * hd + ty * hd * 0.55, ey - ty * hd - tx * hd * 0.55); ctx.lineTo(ex - tx * hd - ty * hd * 0.55, ey - ty * hd + tx * hd * 0.55); ctx.fill();
    }
    ctx.font = FONT(600, fs); ctx.fillStyle = rim; ctx.fillText('T', cx, vy - ro - fs * 0.75);
    const aw = Math.PI * 0.62, bx = Math.cos(aw), by = Math.sin(aw);
    const i0 = rr - lw / 2, o0 = rr + lw / 2 + 3;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + bx * i0, vy + by * i0); ctx.lineTo(cx + bx * (o0 + 6), vy + by * (o0 + 6)); ctx.stroke();
    for (const d of [i0, rr + lw / 2]) { ctx.beginPath(); ctx.moveTo(cx + bx * d - by * 3, vy + by * d + bx * 3); ctx.lineTo(cx + bx * d + by * 3, vy + by * d - bx * 3); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.font = FONT(600, fs); ctx.fillText('w', cx + bx * (o0 + 6 + fs * 0.6), vy + by * (o0 + 6 + fs * 0.6));
    ctx.fillStyle = cssVar('--text-3'); ctx.font = FONT(500, fs);
    ctx.fillText('lumen', cx, cy + Rl * 0.35);
    ctx.fillText('muscle', cx, cy + R * 0.87);
  }
  return { id: 'varixwall', label: 'Varix wall', el, update };
}

// ── Ascites (L2c) ───────────────────────────────────
// The one home for ascites: how much there is, whether it is building up, what it does to the
// abdomen, what a diagnostic tap would show, and the two treatments (diuretics, paracentesis).
// Tapping the fluid on the figure, the Ascites readout's actions and Treat > Paracentesis all open it.
const SEV = ['ok', 'caution', 'danger', 'danger'];
const GRADE = ['None', 'Grade 1', 'Grade 2', 'Grade 3'];
const GRADE_TIP = ['No free fluid', 'Grade 1: seen on ultrasound only', 'Grade 2: moderate, symmetric distension', 'Grade 3: tense, marked distension'];
export function createAbdomen({ onAction }) {
  // A − value + stepper with big tap targets; used for serum albumin and the litres to drain.
  const stepper = (label, unit, min, max, stepBy, dp, start, onSet) => {
    let v = start;
    const out = h('output', { class: 'ab-step-val' });
    const paint = () => { out.textContent = `${v.toFixed(dp)} ${unit}`; minus.disabled = v <= min; plus.disabled = v >= max; };
    const go = (d) => { v = +clamp(v + d, min, max).toFixed(dp); paint(); onSet(v); };
    const minus = h('button', { class: 'ab-step-btn', 'aria-label': `${label}: less`, onclick: () => go(-stepBy) }, '−');
    const plus = h('button', { class: 'ab-step-btn', 'aria-label': `${label}: more`, onclick: () => go(stepBy) }, '+');
    paint();
    return { el: h('div', { class: 'ab-step', role: 'group', 'aria-label': label }, minus, out, plus), get: () => v, set: (x) => { v = x; paint(); } };
  };
  // Paracentesis: litres, an albumin toggle, and a Drain button that spells out the dose.
  const alb = h('button', { class: 'ab-chip', 'aria-pressed': 'true', onclick: () => { alb.setAttribute('aria-pressed', String(alb.getAttribute('aria-pressed') !== 'true')); paintVol(); } });
  const albOn = () => alb.getAttribute('aria-pressed') === 'true';
  const albNote = h('div', { class: 'ab-note ab-warn' });
  const drainLbl = h('span');
  let hasFluid = true;
  const vol = stepper('Litres to drain', 'L', 1, 10, 0.5, 1, 5, () => paintVol());
  const drain = h('button', { class: 'btn primary ab-drain', onclick: () => onAction({ kind: 'paracentesis', mL: vol.get() * 1000, albumin: albOn() }) }, icon('needle'), drainLbl);
  function paintVol() {
    const L = vol.get();
    alb.textContent = `Albumin ${Math.round(L * 8)} g`;
    alb.title = 'Albumin 8 g per litre drained: advised above 5 L, optional below.';
    albNote.textContent = L > 5 && !albOn() ? 'Above 5 L, give albumin to protect the circulation and kidneys.' : '';
    drainLbl.textContent = hasFluid ? 'Drain' : 'No fluid';
    drain.disabled = !hasFluid;
  }
  paintVol();
  // Diuretics: a full-width button that fills accent when on, driving the same parameter as the Treatments chip.
  const diu = h('button', { class: 'ab-diu', 'aria-pressed': 'false', title: 'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites. Keep the 100 : 40 mg ratio (5 : 2).' }, icon('pill'),
    h('span', { class: 'ab-diu-txt' }, h('b', {}, 'Diuretics'), h('small', {}, 'Spironolactone 100 : furosemide 40 mg')), h('span', { class: 'ab-diu-ratio' }, '5 : 2'));
  diu.addEventListener('click', () => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: 'Diuretics' }));
  // Serum albumin is a patient input that drives ascites (oncotic pull back into the vessels) and the SAAG.
  const sa = stepper('Serum albumin', 'g/dL', 1.5, 5, 0.1, 1, 4, (v) => updateParams((p) => { p.albumin = v; return p; }, { label: 'Serum albumin' }));
  const numEl = h('b', {}, '—'), gradeEl = h('span', { class: 'ab-grade' });
  const trendEl = h('div', { class: 'ab-trend' });
  // Abdominal pressure as one slim bar, 0–30 mmHg, ticked at 12 (IAH) and 20 (ACS).
  const iapFill = h('i', { class: 'ab-iap-fill' }), iapVal = h('span', { class: 'ctl-val' });
  const iapBar = h('div', { class: 'ab-iap-bar', role: 'img', title: '12 mmHg: intra-abdominal hypertension · 20 mmHg: compartment syndrome' }, iapFill,
    h('i', { class: 'ab-iap-mark', style: { left: '40%' } }), h('i', { class: 'ab-iap-mark', style: { left: '66.7%' } }));
  const iap = h('div', { class: 'ab-iap' }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, 'Abdominal pressure'), iapVal), iapBar);
  // A small belly that fills with the fluid, beside the volume.
  const bellyFill = h('i', { class: 'ab-belly-fill' });
  const belly = h('div', { class: 'ab-belly', 'aria-hidden': 'true' }, bellyFill);
  // The diagnostic tap, g/dL: one row of three, SAAG first and emphasised.
  const lab = (k, sub, cls = '') => { const v = h('b', {}, '—'); return [h('div', { class: `ab-lab ${cls}` }, h('span', {}, k), v, h('small', {}, sub)), v]; };
  const [saagEl, saagV] = lab('SAAG', 'serum − ascitic', 'ab-key'), [tpEl, tpV] = lab('Protein', 'total, fluid'), [albEl, albV] = lab('Albumin', 'in fluid');
  const tapNote = h('span', { class: 'ab-note' });
  const tap = h('div', { class: 'ab-tap' }, h('div', { class: 'ab-row' }, h('span', { class: 'ab-tap-title' }, 'Diagnostic tap'), tapNote),
    h('div', { class: 'ab-labs' }, saagEl, tpEl, albEl),
    h('div', { class: 'ab-row' }, h('span', { class: 'ctl-label' }, 'Serum albumin'), sa.el));
  const info = h('div', { class: 'ab-report' },
    h('div', { class: 'ab-head' }, h('div', { class: 'ab-sum' }, h('div', { class: 'hv-k' }, 'Ascites'), h('div', { class: 'hv-num' }, numEl, h('small', {}, 'L')), h('div', { class: 'ab-meta' }, gradeEl, trendEl)), belly),
    iap, tap);
  // Treat: one card, the diuretics button, then the tap row and a full-width Drain.
  const treat = h('div', { class: 'ab-report' },
    h('div', { class: 'ab-rx' },
      h('div', { class: 'hv-k' }, 'Treat'),
      h('div', { class: 'ab-rx-diu' }, diu),
      h('div', { class: 'ab-row ab-rx-row' }, h('span', { class: 'ab-rx-txt' }, h('b', {}, 'Paracentesis'), h('small', {}, 'litres to drain')), vol.el),
      h('div', { class: 'ab-drain-row' }, alb, drain), albNote));
  const el = h('div', { class: 'ab', 'data-pane': 'abdomen' }, h('div', { class: 'hv-main ab-main' }, info, treat));
  // Every frame calls this, but a pane the learner is scrolling must not be touched when nothing changed: on a phone,
  // rewriting a text node or an attribute to the same value is enough to make the browser stop a scroll in flight.
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  const setAttr = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  const setData = (el, k, v) => { if (el.dataset[k] !== v) el.dataset[k] = v; };
  function update(f) {
    const a = f.metrics.ascites, p = store.get().params;
    setText(numEl, fmt(a.volume / 1000, 1));
    setText(gradeEl, GRADE[a.grade] || a.label); setAttr(gradeEl, 'title', GRADE_TIP[a.grade] || '');
    setData(gradeEl, 'sev', SEV[a.grade] || 'danger');
    setAttr(diu, 'aria-pressed', String(!!p.diuretics));
    diu.disabled = !(verbEnabled('drug:diuretics', 'drug:diuretics') || verbEnabled('drugs', 'drugs'));
    if (sa.get() !== p.albumin) sa.set(p.albumin);
    const r = a.ratePerDay, trend = Math.abs(r) < 20 ? 'steady' : r > 0 ? 'building up' : 'resolving';
    setText(trendEl, `${r > 0 ? '+' : ''}${fmt(r, 0)} mL a day · ${trend}`);
    const sev = a.iap >= 20 ? 'danger' : a.iap >= 12 ? 'caution' : 'ok';
    setText(iapVal, `${fmt(a.iap, 0)} mmHg · ${a.iap >= 20 ? 'compartment syndrome' : a.iap >= 12 ? 'high' : 'normal'}`);
    setData(iapVal, 'sev', sev); setData(iapFill, 'sev', sev);
    const iw = `${Math.round(clamp(a.iap / 30, 0, 1) * 1000) / 10}%`;
    if (iapFill.style.width !== iw) iapFill.style.width = iw;
    setAttr(iapBar, 'aria-label', `Abdominal pressure ${fmt(a.iap, 0)} mmHg`);
    // SAAG from the rounded parts, so serum − ascitic always adds up on screen.
    // In a case the fluid results come from the tap you order, in the case chart, never from here.
    const inCase = !!store.get().found, tapped = a.volume > 150 && !inCase;
    const r1 = (x) => Math.round(x * 10) / 10, saag = r1(r1(p.albumin) - r1(a.albumin));
    setText(saagV, tapped ? fmt(saag, 1) : '—'); setText(tpV, tapped ? fmt(a.totalProtein, 1) : '—'); setText(albV, tapped ? fmt(a.albumin, 1) : '—');
    setAttr(saagEl, 'title', tapped ? `SAAG ${fmt(p.albumin, 1)} − ${fmt(a.albumin, 1)} = ${fmt(saag, 1)} g/dL. ≥ 1.1 means portal hypertension.` : '');
    setText(tapNote, inCase ? 'Order it in the case' : tapped ? 'g/dL' : 'Too little fluid to tap');
    if (hasFluid !== a.volume > 150) { hasFluid = a.volume > 150; paintVol(); }
    // Whole percents only: rewriting the height every frame would keep restarting its ease.
    const bh = `${Math.round(a.volume > 150 ? 15 + clamp(a.volume / 8000, 0, 1) * 70 : 0)}%`;
    if (bellyFill.style.height !== bh) bellyFill.style.height = bh;
  }
  return { id: 'abdomen', label: 'Ascites & paracentesis', el, update };
}
