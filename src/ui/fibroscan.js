// FibroScan tab (Measure): one simulated transient-elastography panel in the style of an Echosens
// report: the median stiffness E (kPa), the A-mode strip and the shear-wave elastogram. The kPa is the
// model's liver stiffness estimate (metrics.lsm); CAP and IQR are deliberately not shown.

import { h, fitCanvas, clamp } from './util.js?v=8aa5e5cdf1';
import { FONT } from './charts.js?v=898c42e2f5';

const WAVE_T0 = 8; // ms: the shear wave reaches the top of the window about 8 ms after the push
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

/** The elastogram bitmap, as on a real report: the colour is the tissue displacement along the beam,
 *  time 0-80 ms across, depth 30-90 mm down. A 50 Hz shear wave leaves the probe at t = 0 and travels
 *  down at c, so the bright and dark bands lie along lines of constant (t - depth / c): the fitted slope
 *  of the front is the speed (mm per ms = m/s), steeper when the liver is stiffer. Speckle breaks the
 *  bands up, the wave fades with depth and with time, and before it arrives there is only noise. */
function elastogram(n, c) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
  // Noise sampled in front-aligned coordinates (across the front, along the front), so the blobs are
  // long ribbons parallel to the wave front, as on the report.
  const f1 = noiseField(n * 2, n * 2, n / 14, 11), f2 = noiseField(n * 2, n * 2, n / 8, 23), ph = noiseField(n * 2, n * 2, n / 3, 37);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const tMs = (x / n) * 80, depth = 30 + (y / n) * 60;
    const s = tMs - WAVE_T0 - (depth - 35) / c; // ms behind the front's first arrival (negative: ahead of it)
    const across = (s / 80) * n * 1.6 + n * 0.5, along = y * 0.42 + n * 0.3;
    const a = f1(across, along) * 0.6 + f2(across * 1.4, along) * 0.4;
    const w = Math.cos(2 * Math.PI * 0.05 * s + (ph(across, along) - 0.5) * 2.2);
    const amp = s < -6 ? 0.25 : clamp(1 - s / 75, 0.18, 1) * clamp(1.2 - (depth - 30) / 110, 0.5, 1);
    const k = clamp(0.62 + w * 0.5 * amp + (a - 0.5) * 0.95, 0, 1) ** 1.5;
    const i = (y * n + x) * 4;
    img.data[i] = 22 + 220 * k; img.data[i + 1] = 10 + 128 * k; img.data[i + 2] = 8 + 68 * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** The grey M-mode strip: the ultrasound image of the tissue under the probe over the same exam, depth
 *  down and time across. Fat under the skin is dark with a few echoes, a bright line marks the liver
 *  capsule, the parenchyma is a fine speckle that dims with depth, and a vessel shows as a dark band. */
function motionStrip(wp, hp) {
  const cv = document.createElement('canvas'); cv.width = wp; cv.height = hp;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(wp, hp);
  const sp = noiseField(wp, hp, 1.5, 3), lay = noiseField(wp, hp, 5, 8), r = rnd(4);
  for (let y = 0; y < hp; y++) {
    const d = 30 + (y / hp) * 60; // mm
    const base = d < 75 ? 150 - (d - 30) * 0.5 : 105;
    const vessel = 1;
    for (let x = 0; x < wp; x++) {
      const g = clamp(base * vessel * (0.55 + 0.9 * sp(x, y)) * (0.8 + 0.4 * lay(x, y)) + (r() - 0.5) * 25, 0, 255);
      const i = (y * wp + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function createFibroScan() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Simulated FibroScan elastography panel' });
  const box = h('div', { class: 'chart-box fibroscan-box' }, cv);
  const note = h('p', { class: 'ctl-sub' }, 'A simulated FibroScan: the median liver stiffness is an estimate from the model, not a measurement. Normal is about 5 kPa; above 25 kPa with a low platelet count, clinically significant portal hypertension is near certain. A congested liver (heart, hepatic veins) is stiff too.');
  const el = h('div', { class: 'dock-pane', 'data-pane': 'fibroscan' }, box, note);
  let sig = '', img = null, strip = null;
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
    const top = 74 + big, bot = hh - 26, ph = bot - top;
    if (ph < 60) return;
    const aw = Math.max(26, Math.min(48, w * 0.1)), ax = pad + 30, ex = ax + aw * 2 + 8;
    const ew = Math.min(w - pad - ex, ph * 1.25);
    ctx.fillStyle = BLUE; ctx.textAlign = 'left'; ctx.font = FONT(600, 12);
    ctx.fillStyle = ORANGE; ctx.fillText(`${k.toFixed(1)} kPa`, ex, top - 6);
    // depth axis
    ctx.fillStyle = INK; ctx.font = FONT(500, 10); ctx.textAlign = 'right';
    for (let d = 30; d <= 90; d += 10) ctx.fillText(String(d), ax - 4, top + ((d - 30) / 60) * ph + 3);
    ctx.textAlign = 'left'; ctx.fillText('mm', pad, top - 6);
    // M-mode strip, then the A-mode signal: amplitude (across) against depth (down), strong near the probe
    // and falling with depth (attenuation), inside a green frame that marks a valid measurement.
    if (!strip || strip.w !== aw || strip.h !== ph) strip = { w: aw, h: ph, cv: motionStrip(Math.max(8, Math.round(aw / 2)), Math.max(60, Math.round(ph / 2))) };
    ctx.imageSmoothingEnabled = true; ctx.drawImage(strip.cv, ax, top, aw, ph);
    const axs = ax + aw + 3;
    ctx.fillStyle = '#000'; ctx.fillRect(axs, top, aw, ph);
    const r2 = rnd(9), cx0 = axs + aw / 2;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
    for (let y = 0; y <= ph; y += 2) {
      const env = 0.2;
      const x = cx0 + (r2() - 0.5) * 2 * env * aw * 0.9 + Math.sin(y * 0.11) * aw * 0.06;
      y ? ctx.lineTo(x, top + y) : ctx.moveTo(x, top);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(axs + aw, y); ctx.stroke(); }
    ctx.strokeStyle = '#2bb24c'; ctx.lineWidth = 2; ctx.strokeRect(axs, top, aw, ph);
    // elastogram with the measurement window and the wavefront slope line
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.cv, ex, top, ew, ph);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
    const slope = (40 / c) / 80; // fraction of the time axis crossed over the 35-75 mm window
    const x0 = ex + (WAVE_T0 / 80) * ew;
    ctx.moveTo(x0, top + (5 / 60) * ph); ctx.lineTo(x0 + clamp(slope, 0, 1) * ew, top + (45 / 60) * ph); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.fillRect(ex, bot - 3, ew, 3);
    // time axis
    ctx.fillStyle = INK; ctx.font = FONT(500, 10); ctx.textAlign = 'center';
    for (let t = 0; t <= 80; t += 20) ctx.fillText(String(t), ex + (t / 80) * ew, bot + 12);
    ctx.textAlign = 'left'; ctx.fillText('(ms)', ex + ew + 4 > w - 28 ? ex + ew - 24 : ex + ew + 4, bot + 24);
  }
  return { id: 'fibroscan', label: 'FibroScan', el, update };
}
