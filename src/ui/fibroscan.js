// FibroScan tab (Measure): one simulated transient-elastography panel in the style of an Echosens
// report: the median stiffness E (kPa), the A-mode strip and the shear-wave elastogram. The kPa is the
// model's liver stiffness estimate (metrics.lsm); CAP and IQR are deliberately not shown.

import { h, fitCanvas, clamp } from './util.js?v=8aa5e5cdf1';
import { FONT } from './charts.js?v=898c42e2f5';

const ORANGE = '#e8863a', BLUE = '#3a9ec8', INK = '#1d2733';
const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

/** Shear wave speed (m/s) from stiffness E (kPa): E = 3 ρ c², ρ about 1000 kg/m³. */
export const shearSpeed = (kpa) => Math.sqrt((kpa * 1000) / 3000);

/** Smooth value noise on a coarse grid, bilinearly sampled. */
function noiseField(w, hh, cell, seed) {
  const r = rnd(seed), gw = Math.ceil(w / cell) + 2, gh = Math.ceil(hh / cell) + 2;
  const g = Array.from({ length: gw * gh }, r);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** The elastogram bitmap: orange and dark patches laid along the shear wavefront, so a stiffer liver
 *  (faster wave) gives a steeper front. Time 0-80 ms across, depth 30-90 mm down. */
function elastogram(n, c) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
  const n1 = noiseField(n, n, n / 7, 11), n2 = noiseField(n, n, n / 16, 23);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const tMs = (x / n) * 80, depth = 30 + (y / n) * 60;
    // Distance along the wavefront: constant where tMs - (depth - 35) / c is constant.
    const u = (tMs - (depth - 35) / c) / 80 * n;
    const v = n1(u + 40, y * 0.35) * 0.65 + n2(u + 40, y * 0.6) * 0.35;
    const fade = clamp(1 - Math.max(0, u / n - 0.25) * 1.6, 0.25, 1);
    const k = clamp((v - 0.3) * 2.2, 0, 1) * fade;
    const i = (y * n + x) * 4;
    img.data[i] = 20 + 215 * k; img.data[i + 1] = 10 + 125 * k; img.data[i + 2] = 8 + 62 * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function createFibroScan() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Simulated FibroScan elastography panel' });
  const box = h('div', { class: 'chart-box fibroscan-box' }, cv);
  const note = h('p', { class: 'ctl-sub' }, 'A simulated FibroScan: the median liver stiffness is an estimate from the model, not a measurement. Normal is about 5 kPa; above 25 kPa with a low platelet count, clinically significant portal hypertension is near certain. A congested liver (heart, hepatic veins) is stiff too.');
  const el = h('div', { class: 'dock-pane', 'data-pane': 'fibroscan' }, box, note);
  let sig = '', img = null;
  function update(f) {
    const k = f.metrics.lsm;
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 60 || hh < 60) return;
    const key = `${w}x${hh}|${k.toFixed(1)}`;
    if (key === sig) return; sig = key;
    const c = shearSpeed(k);
    const ik = Math.round(c * 20);
    if (!img || img.ik !== ik) img = { ik, cv: elastogram(120, ik / 20) };
    ctx.clearRect(0, 0, w, hh);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    const pad = 10, wide = w >= 420;
    // Result: the big orange median, E (kPa)
    ctx.textAlign = 'left'; ctx.fillStyle = ORANGE; ctx.font = FONT(700, 15);
    ctx.fillText('E (kPa)', pad, 22);
    ctx.fillRect(pad, 28, wide ? 150 : 110, 1.5);
    ctx.font = FONT(600, 11); ctx.fillText('MEDIAN', pad, 44);
    const big = Math.round(clamp(Math.min(w * 0.2, hh * 0.22), 34, 64));
    ctx.font = FONT(500, big); ctx.fillText(k.toFixed(1), pad, 48 + big);
    ctx.fillStyle = INK; ctx.font = FONT(500, 11); ctx.textAlign = 'right';
    ctx.fillText('FibroScan · Liver · estimate from the model', w - pad, 20);
    // Measurement panel: A-mode strip, then the elastogram
    const top = 60 + big, bot = hh - 26, ph = bot - top;
    if (ph < 60) return;
    const aw = Math.max(26, Math.min(48, w * 0.1)), ax = pad + 30, ex = ax + aw * 2 + 8;
    const ew = Math.min(w - pad - ex, ph * 1.25);
    ctx.fillStyle = BLUE; ctx.textAlign = 'left'; ctx.font = FONT(600, 12);
    ctx.fillStyle = ORANGE; ctx.fillText(`${k.toFixed(1)} kPa`, ex, top - 6);
    // depth axis
    ctx.fillStyle = INK; ctx.font = FONT(500, 10); ctx.textAlign = 'right';
    for (let d = 30; d <= 90; d += 10) ctx.fillText(String(d), ax - 4, top + ((d - 30) / 60) * ph + 3);
    ctx.textAlign = 'left'; ctx.fillText('mm', pad, top - 6);
    // A-mode grey speckle strip and the green-framed signal trace
    const r = rnd(5);
    for (let y = 0; y < ph; y += 2) for (let x = 0; x < aw; x += 2) { const g = 120 + r() * 110; ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect(ax + x, top + y, 2, 2); }
    ctx.fillStyle = '#000'; ctx.fillRect(ax + aw + 3, top, aw, ph);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
    const r2 = rnd(9);
    for (let y = 0; y <= ph; y += 3) { const x = ax + aw + 3 + aw * (0.5 + (r2() - 0.5) * 0.45); y ? ctx.lineTo(x, top + y) : ctx.moveTo(x, top); }
    ctx.stroke();
    ctx.strokeStyle = '#2bb24c'; ctx.lineWidth = 2; ctx.strokeRect(ax + aw + 3, top, aw, ph);
    // elastogram with the measurement window and the wavefront slope line
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.cv, ex, top, ew, ph);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
    const slope = (40 / c) / 80; // fraction of the time axis crossed over the 35-75 mm window
    ctx.moveTo(ex, top + (5 / 60) * ph); ctx.lineTo(ex + clamp(slope, 0, 1) * ew, top + (45 / 60) * ph); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillRect(ex, bot - 3, ew, 3);
    // time axis
    ctx.fillStyle = INK; ctx.font = FONT(500, 10); ctx.textAlign = 'center';
    for (let t = 0; t <= 80; t += 20) ctx.fillText(String(t), ex + (t / 80) * ew, bot + 12);
    ctx.textAlign = 'left'; ctx.fillText('(ms)', ex + ew + 4 > w - 28 ? ex + ew - 24 : ex + ew + 4, bot + 24);
  }
  return { id: 'fibroscan', label: 'FibroScan', el, update };
}
