// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js?v=29d10ad9ef';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { h, fmt, fitCanvas, cssVar, clamp, icon } from './util.js?v=8aa5e5cdf1';
import { FONT } from './charts.js?v=4832323e1e';
import { store, updateParams } from './store.js?v=6fc014de20';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

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
