// FibroScan tab (Measure): one simulated transient-elastography panel inspired by an Echosens report:
// the median stiffness E (kPa) and the shear-wave elastogram, on a dark panel. The kPa is the model's
// liver stiffness estimate (metrics.lsm). CAP, IQR and the grey M-mode and A-mode strips that go with CAP
// are left out. The map is a continuously evolving reading: coherent speckle that morphs smoothly, one
// dominant dark shear-wave band, and a slope that drifts gently around the model's value.

import { h, fitCanvas, clamp } from './util.js?v=8aa5e5cdf1';
import { FONT } from './charts.js?v=898c42e2f5';

const WAVE_T0 = 8; // ms: the shear wave reaches the top of the window about 8 ms after the push
const ORANGE = '#f0924a';
const PANEL = '#0a0c0f', EDGE = 'rgba(255,255,255,.10)', TICK = '#8b95a3';
const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

/** Shear wave speed (m/s) from stiffness E (kPa): E = 3 ρ c², ρ about 1000 kg/m³. */
export const shearSpeed = (kpa) => Math.sqrt((kpa * 1000) / 3000);

/** Smooth value noise on a coarse grid, bilinearly sampled. */
function noiseField(w, hh, cell, seed) {
  const r = rnd(seed), gw = Math.ceil(w / cell), gh = Math.ceil(hh / cell); // periodic: any coordinate wraps seamlessly
  const g = Array.from({ length: gw * gh }, r);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, fix = Math.floor(fx), fiy = Math.floor(fy);
    const tx = fx - fix, ty = fy - fiy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const ix = ((fix % gw) + gw) % gw, iy = ((fiy % gh) + gh) % gh, jx = (ix + 1) % gw, jy = (iy + 1) % gh;
    const a = g[iy * gw + ix], b = g[iy * gw + jx], c = g[jy * gw + ix], d = g[jy * gw + jx];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

const N = 104; // elastogram resolution; drawn scaled up with smoothing
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FIELDS = { built: false };
function fields() {
  if (FIELDS.built) return FIELDS;
  const W = N * 4, H = N * 3;
  Object.assign(FIELDS, { built: true,
    a1: noiseField(W, H, N / 10, 11), a2: noiseField(W, H, N / 10, 12),
    b1: noiseField(W, H, N / 6, 23), b2: noiseField(W, H, N / 6, 24),
    p1: noiseField(W, H, N / 3, 37), p2: noiseField(W, H, N / 3, 38) });
  return FIELDS;
}

/** Draw one frame of the elastogram into `ctx2` for shear speed c (m/s) at time t (s). The speckle streams along the wave front
 *  and is mixed between fixed fields as it goes, so it evolves coherently: opaque every frame, no fades. Time 0-80 ms across, depth 30-90 mm down; the bands lie along the wave front, with
 *  one dominant dark band whose edge the fitted line follows. */
function drawElastogram(ctx2, img, c, t) {
  const F = fields(), th1 = t * 1.3, th2 = t * 1.9 + 1, th3 = t * 2.3 + 2;
  const c1 = Math.cos(th1), s1 = Math.sin(th1), c2 = Math.cos(th2), s2 = Math.sin(th2), c3 = Math.cos(th3), s3 = Math.sin(th3);
  const d = img.data, flowY = t * 22, flowX = t * 9; // the speckle streams along the front, so it reads as motion, not a dissolve
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tMs = (x / N) * 80, depth = 30 + (y / N) * 60;
    const s = tMs - WAVE_T0 - (depth - 35) / c;
    const across = (s / 80) * N * 1.6 + N * 1.7 + flowX, along = y * 0.65 + N * 0.6 + flowY;
    const a = 0.5 + (F.a1(across, along) - 0.5) * c1 + (F.a2(across, along) - 0.5) * s1;
    const b = 0.5 + (F.b1(across * 1.4, along) - 0.5) * c2 + (F.b2(across * 1.4, along) - 0.5) * s2;
    const jit = (0.5 + (F.p1(across, along) - 0.5) * c3 + (F.p2(across, along) - 0.5) * s3 - 0.5) * 2.2;
    const noise = a * 0.6 + b * 0.4;
    const w = Math.cos(2 * Math.PI * 0.05 * s + jit);
    const amp = s < -6 ? 0.2 : clamp(1 - s / 40, 0.12, 1) * clamp(1.2 - (depth - 30) / 110, 0.5, 1);
    const band = Math.exp(-(((s + 3.5) / 3.2) ** 2));
    const k = clamp(0.76 + w * 0.32 * amp + (noise - 0.5) * 1.25 - band * 0.55, 0, 1) ** 1.5;
    const i = (y * N + x) * 4;
    d[i] = 20 + 220 * k; d[i + 1] = 10 + 126 * k; d[i + 2] = 8 + 64 * k; d[i + 3] = 255;
  }
  ctx2.putImageData(img, 0, 0);
}

function rrect(ctx, x, y, w, h2, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function createFibroScan() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Simulated FibroScan elastography panel, live' });
  const box = h('div', { class: 'chart-box fibroscan-box' }, cv);
  const note = h('p', { class: 'ctl-sub', style: { color: TICK, margin: '10px 4px 2px' } }, 'A simulated FibroScan, live: the slope of the shear wave front gives its speed and so the stiffness. It is an estimate from the model, not a measurement. Normal is about 5 kPa; above 25 kPa with a low platelet count, clinically significant portal hypertension is near certain. A congested liver (heart, hepatic veins) is stiff too.');
  const el = h('div', { class: 'dock-pane', 'data-pane': 'fibroscan', style: { color: TICK } }, box, note);
  const off = document.createElement('canvas'); off.width = off.height = N;
  const octx = off.getContext('2d'), img = octx.createImageData(N, N);
  let model = 10, running = false, shown = null, last = 0;

  function paint(now) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 80 || hh < 80) return;
    const t = REDUCED ? 3 : now / 1000, dt = clamp((now - last) / 1000, 0, 0.2); last = now;
    // The measured value drifts gently around the model's median; the readout follows it smoothly.
    const kNow = model * (1 + 0.05 * Math.sin(t * 0.8) + 0.03 * Math.sin(t * 1.9 + 1));
    shown = shown === null ? kNow : shown + (kNow - shown) * (1 - Math.exp(-dt * 2.5));
    const c = shearSpeed(kNow);
    ctx.clearRect(0, 0, w, hh);
    rrect(ctx, 0.5, 0.5, w - 1, hh - 1, 12); ctx.fillStyle = PANEL; ctx.fill(); ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.stroke();
    const pad = 14, narrow = w < 380;
    // Readout
    ctx.textAlign = 'left'; ctx.fillStyle = TICK; ctx.font = FONT(600, 10);
    ctx.fillText('LIVER STIFFNESS · MEDIAN', pad, 24);
    const big = Math.round(clamp(Math.min(w * 0.13, hh * 0.13), 30, 52));
    ctx.fillStyle = ORANGE; ctx.font = FONT(600, big);
    const txt = shown.toFixed(1); ctx.fillText(txt, pad, 28 + big);
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = TICK; ctx.font = FONT(500, 14); ctx.fillText('kPa', pad + tw + 6, 28 + big);
    // Live badge and caption
    ctx.textAlign = 'right'; ctx.font = FONT(600, 10); ctx.fillStyle = TICK;
    ctx.fillText(narrow ? 'LIVE' : 'LIVE · 50 Hz · estimate from the model', w - pad, 24);
    const pulse = 0.55 + 0.45 * Math.sin(t * 3), lw = ctx.measureText(narrow ? 'LIVE' : 'LIVE · 50 Hz · estimate from the model').width;
    ctx.fillStyle = `rgba(80,210,130,${pulse})`; ctx.beginPath(); ctx.arc(w - pad - lw - 9, 21, 3, 0, 7); ctx.fill();
    // Map
    const top = 56 + big, bot = hh - 30, ph = bot - top, ax = pad + 22, ex = ax + 6, ew = w - pad - ex;
    if (ph < 50 || ew < 60) return;
    drawElastogram(octx, img, c, t);
    ctx.save(); rrect(ctx, ex, top, ew, ph, 8); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, N, N, ex, top, ew, ph);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash([]);
    const x0 = ex + (WAVE_T0 / 80) * ew, x1 = x0 + clamp((40 / c) / 80, 0, 1) * ew;
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x0, top + (5 / 60) * ph); ctx.lineTo(x1, top + (45 / 60) * ph); ctx.stroke();
    ctx.restore();
    rrect(ctx, ex, top, ew, ph, 8); ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.stroke();
    // Axes
    ctx.fillStyle = TICK; ctx.font = FONT(500, 10); ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.textAlign = 'right';
    for (let d = 30; d <= 90; d += 20) { const y = top + ((d - 30) / 60) * ph; ctx.fillText(String(d), ax, Math.min(y + 3, bot)); }
    ctx.textAlign = 'center';
    for (let m = 0; m <= 80; m += 20) ctx.fillText(String(m), ex + (m / 80) * ew, bot + 14);
    ctx.textAlign = 'left'; ctx.fillText('mm', pad, top - 6); ctx.textAlign = 'right'; ctx.fillText('ms', w - pad, bot + 26);
  }
  // Runs only while the pane is on screen; update() restarts it when the tab is shown again.
  function loop(now) {
    if (!cv.isConnected || cv.offsetParent === null || document.hidden) { running = false; return; }
    paint(now);
    if (REDUCED) { running = false; return; }
    requestAnimationFrame(loop);
  }
  function update(f) {
    const wrap = el.parentElement; // the whole tab body is dark, not just the panel
    if (wrap && !wrap.dataset.dark) { wrap.dataset.dark = '1'; wrap.style.background = PANEL; }
    model = f.metrics.lsm;
    if (!running && cv.offsetParent !== null) { running = true; requestAnimationFrame(loop); }
  }
  return { id: 'fibroscan', label: 'FibroScan', el, update };
}
