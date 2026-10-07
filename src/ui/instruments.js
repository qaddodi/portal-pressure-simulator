// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js?v=80b8d861de';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { h, fmt, fitCanvas, cssVar, clamp, icon } from './util.js?v=8aa5e5cdf1';
import { renderEndo } from './endo-render.js?v=f968ff9d12';
import { FONT } from './charts.js?v=0630f760fe';
import { store, updateParams, logAction, varixSuppressed } from './store.js?v=18136433f8';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
  box.append(cv);
  const view = 'eso'; // the esophageal variceal view only
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side' }, stats,
    h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band a column (EVL)'),
    h('div', { class: 'ctl-sub' }, 'Drawn from the model. F1 small and straight, F2 enlarged and tortuous, F3 large and beaded; red wale marks mean high modeled wall stress.'));
  el.append(box, side);
  const note = h('p', { class: 'ctl-sub', hidden: true }, '');
  side.append(note);
  function update(f) {
    const m = f.metrics;
    const off = view === 'eso' && varixSuppressed(), rhf = view === 'eso' && store.get().presetId === 'rhf';
    note.hidden = !rhf;
    note.textContent = off ? 'Not modeled for this patient: the model draws an esophageal varix in right heart failure that the clinical picture does not support.' : 'Caution: in right heart failure the model’s esophageal varix is an artifact, not a clinical finding.';
    box.style.visibility = off ? 'hidden' : '';
    if (off) { stats.replaceChildren(h('dt', {}, 'Esophageal varix'), h('dd', {}, 'not modeled')); return; }
    const vx = view === 'eso' ? m.varix : m.gastricVarix;
    stats.replaceChildren(
      h('dt', {}, 'Grade'), h('dd', {}, `${vx.grade.code} ${vx.grade.label}`),
      h('dt', {}, 'Diameter'), h('dd', {}, `${fmt(vx.d, 1)} mm`),
      h('dt', {}, 'Wall thickness'), h('dd', {}, `${fmt(vx.w, 2)} mm`),
      h('dt', {}, 'Wall stress (model)'), h('dd', {}, `${Math.round(vx.ratio * 100)} % of rupture`),
      h('dt', {}, 'Red wale signs'), h('dd', {}, vx.redWale ? 'present' : 'absent'),
      h('dt', {}, 'Bands placed'), h('dd', {}, String(Math.round(f.bands || 0))));
    draw(f, vx);
  }
  // Rendered endoscopic view (see endo-render.js): a per-pixel 3D shading of the lumen with raised,
  // winding varices, drawn once per state into a cached bitmap, so it is perfectly steady. Balloon,
  // bleeding and the scope mask are drawn on top.
  const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  let peak = 0, bleedT = 0, cache = { key: '', img: null };
  function draw(f, vx) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 32 || hh < 32) return; // hidden/reflowing canvas: wait for its measured size
    ctx.clearRect(0, 0, w, hh);
    // The field sits above its caption, never under it.
    const cx = w / 2, cy = (hh - 16) / 2, R = Math.min(w, hh - 16) / 2 - 6;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const bands = Math.round(f.bands || 0);
    // Banding deflates the banded columns only. The model's single varix size falls as bands go on,
    // so unbanded columns keep the size seen before the first band.
    const gNow = clamp((vx.d - 2) / 10, 0, 1);
    peak = bands > 0 ? Math.max(peak, gNow) : gNow;
    const grow = peak, present = vx.d >= 2.4 || bands > 0;
    const res = clamp(Math.round(2 * R * (window.devicePixelRatio || 1)), 160, 300);
    const gq = Math.round(grow * 14) / 14;
    const key = [res, gq.toFixed(3), bands, present ? 1 : 0, vx.redWale ? 1 : 0].join('|');
    if (cache.key !== key) cache = { key, img: renderEndo(res, { grow: gq, bands, present, redWale: !!vx.redWale }) };
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cache.img, cx - R, cy - R, 2 * R, 2 * R);
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
    ctx.fillStyle = cssVar('--text-3') || '#888'; ctx.font = FONT(500, 10); ctx.textAlign = 'left';
    ctx.fillText('Distal esophagus · 36 cm', 6, hh - 3);
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update, setView() {} };
}

// ── Varix wall cross-section (L3) ───────────────────
export function createVarixWall() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'varixwall' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Varix cross-section and Laplace wall tension' });
  box.append(cv);
  const stats = h('dl', { class: 'kv' });
  const side = h('div', { class: 'chart-side' }, h('div', { class: 'side-title' }, 'Laplace’s law'), h('div', { class: 'formula' }, 'T = ΔP · r / w'), stats,
    h('div', { class: 'ctl-sub' }, 'Big radius, high transmural pressure and a thin wall all raise the modeled wall stress. Remodeling enlarges the varix and thins its wall over months. A balloon raises the luminal (outside) pressure.'));
  el.append(box, side);
  function update(f) {
    const v = f.metrics.varix;
    stats.replaceChildren(
      h('dt', {}, 'ΔP (transmural)'), h('dd', {}, `${fmt(v.ptm, 1)} mmHg`),
      h('dt', {}, 'Radius r'), h('dd', {}, `${fmt(v.r, 2)} mm`),
      h('dt', {}, 'Wall w'), h('dd', {}, `${fmt(v.w, 2)} mm`),
      h('dt', {}, 'Stress index'), h('dd', {}, `${fmt(v.T, 0)} (${Math.round(v.ratio * 100)} %)`));
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
    ctx.fillText(`Wall stress ${Math.round(v.ratio * 100)} % of critical`, gx, gy - 12); ctx.textAlign = 'center'; ctx.font = FONT(500, 11); ctx.fillStyle = cssVar('--text-2'); ctx.fillText('rupture', rx, gy + 34);
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
  const vol = h('input', { type: 'range', min: 1, max: 10, step: 0.5, value: 5, 'aria-label': 'Volume to drain (L)' });
  const volLbl = h('span', { class: 'ctl-val' }, '5.0 L');
  const alb = h('input', { type: 'checkbox', checked: true });
  const albNote = h('span', { class: 'ab-note' });
  const paintVol = () => {
    volLbl.textContent = `${(+vol.value).toFixed(1)} L`; vol.style.setProperty('--pct', `${((+vol.value - 1) / 9) * 100}%`);
    albNote.textContent = +vol.value > 5 ? 'Advised above 5 L: prevents circulatory dysfunction after the tap.' : 'Optional below 5 L.';
  };
  vol.addEventListener('input', paintVol); paintVol();
  const drain = h('button', { class: 'btn primary block', onclick: () => onAction({ kind: 'paracentesis', mL: +vol.value * 1000, albumin: alb.checked }) }, icon('needle'), 'Drain');
  const diu = h('input', { type: 'checkbox' });
  diu.addEventListener('change', () => updateParams((p) => { p.diuretics = diu.checked; return p; }, { label: 'Diuretics' }));
  // Serum albumin is a patient input that drives ascites (oncotic pull back into the vessels), so it is set here.
  const sa = h('input', { type: 'range', min: 1.5, max: 5, step: 0.1, value: 4, 'aria-label': 'Serum albumin (g/dL)' });
  const saLbl = h('span', { class: 'ctl-val' });
  const paintSa = () => { saLbl.textContent = `${(+sa.value).toFixed(1)} g/dL${+sa.value < 3.5 ? ' · low' : ''}`; sa.style.setProperty('--pct', `${((+sa.value - 1.5) / 3.5) * 100}%`); };
  sa.addEventListener('input', paintSa); paintSa();
  sa.addEventListener('change', () => updateParams((p) => { p.albumin = +(+sa.value).toFixed(1); return p; }, { label: 'Serum albumin' }));
  const numEl = h('b', {}, '—'), gradeEl = h('span', { class: 'ab-grade' });
  const trendEl = h('div', { class: 'ab-trend' });
  // Abdominal pressure as a horizontal bar, 0–30 mmHg, with the 12 (IAH) and 20 (ACS) thresholds.
  const iapFill = h('i', { class: 'ab-iap-fill' }), iapVal = h('span', { class: 'ctl-val' });
  const iap = h('div', { class: 'ab-iap' },
    h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, 'Abdominal pressure'), iapVal),
    h('div', { class: 'ab-iap-bar', role: 'img' }, iapFill,
      h('i', { class: 'ab-iap-mark', style: { left: '40%' } }), h('i', { class: 'ab-iap-mark', style: { left: '66.7%' } })),
    h('div', { class: 'ab-iap-scale', 'aria-hidden': 'true' }, h('span', { style: { left: '0%' } }, '0'),
      h('span', { style: { left: '40%' } }, '12 IAH'), h('span', { style: { left: '66.7%' } }, '20 ACS'), h('span', { style: { left: '100%' } }, '30')));
  // The diagnostic tap sits beside the volume, compact; its meaning is one line under the trend.
  const tap = h('div', { class: 'ab-tap' }), tapLine = h('div', { class: 'ab-tap-line' });
  const extraStats = h('dl', { class: 'kv' });
  const info = h('div', { class: 'ab-report' },
    h('div', { class: 'ab-head' }, h('div', {}, h('div', { class: 'hv-k' }, 'Ascites'), h('div', { class: 'hv-num' }, numEl, h('small', {}, 'L'), gradeEl)), tap),
    trendEl, tapLine, iap,
    h('div', { class: 'ctl' }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, 'Serum albumin'), saLbl), sa),
    h('details', { class: 'instrument-details' }, h('summary', {}, 'Why it forms'), extraStats));
  const treat = h('div', { class: 'ab-report' },
    h('div', { class: 'procedure-controls' },
      h('div', { class: 'hv-k' }, 'Treat'),
      h('label', { class: 'check-row' }, diu, 'Diuretics', h('span', { class: 'ab-note' }, 'spironolactone + furosemide')),
      h('div', { class: 'ctl' }, h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, 'Paracentesis'), volLbl), vol),
      h('label', { class: 'check-row' }, alb, 'Albumin, 8 g per litre', albNote), drain));
  const el = h('div', { class: 'ab', 'data-pane': 'abdomen' }, h('div', { class: 'hv-main ab-main' }, info, treat));
  function update(f) {
    const a = f.metrics.ascites, p = store.get().params;
    numEl.textContent = fmt(a.volume / 1000, 1);
    gradeEl.textContent = GRADE[a.grade] || a.label; gradeEl.title = GRADE_TIP[a.grade] || '';
    gradeEl.dataset.sev = SEV[a.grade] || 'danger';
    if (diu.checked !== !!p.diuretics) diu.checked = !!p.diuretics;
    if (document.activeElement !== sa && +sa.value !== p.albumin) { sa.value = p.albumin; paintSa(); }
    const r = a.ratePerDay, trend = Math.abs(r) < 20 ? 'steady' : r > 0 ? 'building up' : 'resolving';
    trendEl.textContent = `${r > 0 ? '+' : ''}${fmt(r, 0)} mL a day · ${trend}`;
    const sev = a.iap >= 20 ? 'danger' : a.iap >= 12 ? 'caution' : 'ok';
    iapVal.textContent = `${fmt(a.iap, 0)} mmHg · ${a.iap >= 20 ? 'compartment syndrome' : a.iap >= 12 ? 'intra-abdominal hypertension' : 'normal'}`;
    iapVal.dataset.sev = sev; iapFill.dataset.sev = sev;
    iapFill.style.width = `${clamp(a.iap / 30, 0, 1) * 100}%`;
    iap.querySelector('.ab-iap-bar').setAttribute('aria-label', `Abdominal pressure ${fmt(a.iap, 0)} mmHg`);
    // A diagnostic tap: SAAG ≥ 1.1 g/dL means portal hypertension; the protein then says where the block is.
    const ph = f.metrics.ppg > 6 || f.metrics.whvp > 10;
    const tapped = a.volume > 150;
    tap.replaceChildren(...(tapped ? [
      h('div', { class: 'ab-lab', 'data-hi': String(ph) }, h('span', {}, 'SAAG'), h('b', {}, ph ? '≥ 1.1' : '< 1.1')),
      h('div', { class: 'ab-lab', 'data-hi': String(!!a.highProtein) }, h('span', {}, 'Protein'), h('b', {}, a.highProtein ? '> 2.5' : '< 2.5'))] : []));
    tap.title = tapped ? 'Diagnostic tap, g/dL. SAAG ≥ 1.1 means portal hypertension; protein then says where the block is.' : '';
    tapLine.textContent = !tapped ? '' : !ph ? 'Tap: not portal hypertension, look for a peritoneal cause.'
      : a.highProtein ? 'Tap: portal hypertension from an outflow block (heart failure, Budd–Chiari).' : 'Tap: portal hypertension from the sinusoids, the cirrhosis pattern.';
    extraStats.replaceChildren(
      h('dt', {}, 'Lymph from the liver'), h('dd', {}, `${fmt(a.hepLymph, 1)} (rises with sinusoidal pressure)`),
      h('dt', {}, 'Lymph from the gut'), h('dd', {}, fmt(a.splLymph, 1)),
      h('dt', {}, 'Lymphatic capacity'), h('dd', {}, fmt(a.lymphCap, 1)),
      h('dt', {}, 'Serum albumin'), h('dd', {}, `${fmt(p.albumin, 1)} g/dL${p.albumin < 3 ? ' (low: less pull back into vessels)' : ''}`),
      h('dt', {}, 'Kidneys'), h('dd', {}, p.diuretics ? 'Diuretics: sodium and water lost' : 'Retaining sodium and water'));
  }
  return { id: 'abdomen', label: 'Ascites & paracentesis', el, update };
}
