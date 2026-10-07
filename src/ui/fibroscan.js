// FibroScan tab (Measure): one simulated transient-elastography panel in the style of an Echosens
// report: the median stiffness E (kPa), the A-mode strip and the shear-wave elastogram. The kPa is the
// model's liver stiffness estimate (metrics.lsm); CAP and IQR are deliberately not shown.

import { h, fitCanvas, clamp } from './util.js?v=8aa5e5cdf1';
import { FONT } from './charts.js?v=898c42e2f5';

const WAVE_T0 = 8; // ms: the shear wave reaches the top of the window about 8 ms after the push
const ORANGE = '#e8863a', INK = '#1d2733';
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
function elastogram(n, c, seed = 0) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(n, n);
  // Noise sampled in front-aligned coordinates (across the front, along the front), so the blobs are
  // long ribbons parallel to the wave front, as on the report.
  const f1 = noiseField(n * 2, n * 2, n / 10, 11 + seed * 5), f2 = noiseField(n * 2, n * 2, n / 6, 23 + seed * 7), ph = noiseField(n * 2, n * 2, n / 3, 37 + seed * 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const tMs = (x / n) * 80, depth = 30 + (y / n) * 60;
    const s = tMs - WAVE_T0 - (depth - 35) / c; // ms behind the front's first arrival (negative: ahead of it)
    const across = (s / 80) * n * 1.6 + n * 0.5, along = y * 0.65 + n * 0.3;
    const a = f1(across, along) * 0.6 + f2(across * 1.4, along) * 0.4;
    const w = Math.cos(2 * Math.PI * 0.05 * s + (ph(across, along) - 0.5) * 2.2);
    const amp = s < -6 ? 0.2 : clamp(1 - s / 40, 0.12, 1) * clamp(1.2 - (depth - 30) / 110, 0.5, 1);
    const band = Math.exp(-(((s + 3.5) / 3.2) ** 2)); // the one dominant dark band the fitted line sits on the edge of
    const k = clamp(0.76 + w * 0.32 * amp + (a - 0.5) * 1.25 - band * 0.55, 0, 1) ** 1.5;
    const i = (y * n + x) * 4;
    img.data[i] = 22 + 220 * k; img.data[i + 1] = 10 + 128 * k; img.data[i + 2] = 8 + 68 * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** The grey M-mode strip: the ultrasound image of the tissue under the probe over the same exam, depth
 *  down and time across. Fat under the skin is dark with a few echoes, a bright line marks the liver
 *  capsule, the parenchyma is a fine speckle that dims with depth, and a vessel shows as a dark band. */
function motionStrip(wp, hp) { // wide enough to scroll
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

const SHOT_MS = 1300; // one shot: the whole map is redrawn in place with a new speckle pattern and slope
const median = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createFibroScan() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Simulated FibroScan elastography panel, live' });
  const box = h('div', { class: 'chart-box fibroscan-box' }, cv);
  const note = h('p', { class: 'ctl-sub' }, 'A simulated FibroScan, live: each shot sends a shear wave down from the probe, the fitted slope of its front gives the speed and so the stiffness, and the median of the shots is the result. It is an estimate from the model, not a measurement. Normal is about 5 kPa; above 25 kPa with a low platelet count, clinically significant portal hypertension is near certain. A congested liver (heart, hepatic veins) is stiff too.');
  const el = h('div', { class: 'dock-pane', 'data-pane': 'fibroscan' }, box, note);
  let prev = null, model = 10, running = false, t0 = 0, strip = null, img = null, hist = [], lastShot = -1, shotK = 10, lastModel = null, aSeed = 0, aT = 0;

  const shotValue = (i) => model * (1 + (rnd(i * 977 + 13)() - 0.5) * 0.16);
  function paint(now) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 60 || hh < 60) return;
    const el0 = REDUCED ? SHOT_MS : now - t0, idx = Math.floor(el0 / SHOT_MS);
    const p = 1;
    if (idx !== lastShot) {
      if (lastShot >= 0) hist = [...hist, shotK].slice(-10);
      prev = img && lastShot >= 0 ? { ...img, k: shotK } : null; lastShot = idx; shotK = shotValue(idx); img = null;
    }
    if (REDUCED && !hist.length) hist = [shotK];
    if (!img) img = { cv: elastogram(120, shearSpeed(shotK), idx % 97) };
    // Smooth crossfade from the last shot's map to this one; the slope eases between them.
    const ft = REDUCED ? 1 : clamp((el0 - idx * SHOT_MS) / 700, 0, 1), fe = ft * ft * (3 - 2 * ft);
    const c = shearSpeed(prev && fe < 1 ? prev.k + (shotK - prev.k) * fe : shotK);
    const shown = median(p >= 1 && !hist.includes(shotK) ? [...hist, shotK] : hist.length ? hist : [shotK]);
    ctx.clearRect(0, 0, w, hh);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    const pad = 10, wide = w >= 420;
    ctx.textAlign = 'left'; ctx.fillStyle = ORANGE; ctx.font = FONT(700, 15);
    ctx.fillText('E (kPa)', pad, 22);
    ctx.fillRect(pad, 28, wide ? 150 : 110, 1.5);
    ctx.font = FONT(600, 11); ctx.fillText('MEDIAN', pad, 44);
    const big = Math.round(clamp(Math.min(w * 0.2, hh * 0.22), 34, 64));
    ctx.font = FONT(500, big); ctx.fillText(shown.toFixed(1), pad, 48 + big);
    ctx.fillStyle = INK; ctx.font = FONT(500, 11); ctx.textAlign = 'right';
    ctx.fillText(`FibroScan · Liver · estimate from the model · shot ${idx + 1}`, w - pad, 20);
    const top = 74 + big, bot = hh - 26, ph = bot - top;
    if (ph < 60) return;
    const aw = Math.max(26, Math.min(48, w * 0.1)), ax = pad + 30, ex = ax + aw * 2 + 8;
    const ew = Math.min(w - pad - ex, ph * 1.25), axs = ax + aw + 3;
    ctx.fillStyle = ORANGE; ctx.textAlign = 'left'; ctx.font = FONT(600, 12);
    ctx.fillText(p >= 1 ? `${shotK.toFixed(1)} kPa` : 'shot…', ex, top - 6);
    ctx.fillStyle = INK; ctx.font = FONT(500, 10); ctx.textAlign = 'right';
    for (let d = 30; d <= 90; d += 10) ctx.fillText(String(d), ax - 4, top + ((d - 30) / 60) * ph + 3);
    ctx.textAlign = 'left'; ctx.fillText('mm', pad, top - 6);
    // M-mode strip: scrolls in time, new columns entering from the right
    if (!strip || strip.h !== ph || strip.aw !== aw) {
      const tw = Math.max(64, Math.round(aw / 2) * 4);
      strip = { h: ph, aw, tw, cv: motionStrip(tw, Math.max(60, Math.round(ph / 2))) };
    }
    ctx.imageSmoothingEnabled = true;
    const sx = REDUCED ? 0 : ((now * 0.012) % strip.tw), sw = strip.tw / 4;
    ctx.save(); ctx.beginPath(); ctx.rect(ax, top, aw, ph); ctx.clip();
    for (let k = -1; k < 1; k++) ctx.drawImage(strip.cv, 0, 0, strip.tw, strip.cv.height, ax - sx * (aw / sw) / 1 + k * strip.tw * (aw / sw), top, strip.tw * (aw / sw), ph);
    ctx.restore();
    // A-mode: a fresh trace a dozen times a second
    ctx.fillStyle = '#000'; ctx.fillRect(axs, top, aw, ph);
    if (now - aT > 80) { aT = now; aSeed++; }
    const r2 = rnd(REDUCED ? 9 : aSeed * 31 + 7), cx0 = axs + aw / 2;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
    for (let y = 0; y <= ph; y += 2) {
      const x = cx0 + (r2() - 0.5) * 0.4 * aw * 0.9 + Math.sin(y * 0.11) * aw * 0.06;
      y ? ctx.lineTo(x, top + y) : ctx.moveTo(x, top);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(axs + aw, y); ctx.stroke(); }
    ctx.strokeStyle = '#2bb24c'; ctx.lineWidth = 2; ctx.strokeRect(axs, top, aw, ph);
    // Elastogram: built left to right as the wave travels
    ctx.fillStyle = '#16100c'; ctx.fillRect(ex, top, ew, ph);
    ctx.imageSmoothingQuality = 'high';
    // A slow sub-pixel drift keeps the speckle quietly alive between shots.
    const dx = REDUCED ? 0 : Math.sin(now / 900) * 1.2, dy = REDUCED ? 0 : Math.cos(now / 1100) * 1.2;
    const put = (im) => ctx.drawImage(im.cv, 2 + dx, 2 + dy, 116, 116, ex, top, ew, ph);
    if (prev && fe < 1) { put(prev); ctx.globalAlpha = fe; put(img); ctx.globalAlpha = 1; } else put(img);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash([]);
    const x0 = ex + (WAVE_T0 / 80) * ew, x1 = x0 + clamp((40 / c) / 80, 0, 1) * ew;
    if (p * ew + ex >= x1 || p >= 1) {
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x0, top + (5 / 60) * ph); ctx.lineTo(x1, top + (45 / 60) * ph); ctx.stroke();
    } else if (p * ew + ex > x0) {
      const f = (p * ew + ex - x0) / (x1 - x0);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x0, top + (5 / 60) * ph); ctx.lineTo(x0 + (x1 - x0) * f, top + (5 / 60) * ph + (40 / 60) * ph * f); ctx.stroke();
    }
    ctx.fillStyle = '#000'; ctx.fillRect(ex, bot - 3, ew, 3);
    ctx.fillStyle = INK; ctx.font = FONT(500, 10); ctx.textAlign = 'center';
    for (let t = 0; t <= 80; t += 20) ctx.fillText(String(t), ex + (t / 80) * ew, bot + 12);
    ctx.textAlign = 'left'; ctx.fillText('(ms)', ex + ew + 4 > w - 28 ? ex + ew - 24 : ex + ew + 4, bot + 24);
  }
  // Runs only while the pane is on screen; update() restarts it when the tab is shown again.
  function loop(now) {
    if (!cv.isConnected || cv.offsetParent === null || document.hidden) { running = false; return; }
    paint(now);
    if (REDUCED) { running = false; return; }
    requestAnimationFrame(loop);
  }
  function update(f) {
    if (lastModel === null || Math.abs(f.metrics.lsm - lastModel) > 0.4) { hist = []; lastShot = -1; lastModel = f.metrics.lsm; t0 = performance.now(); }
    model = f.metrics.lsm;
    if (!running && cv.offsetParent !== null) { running = true; requestAnimationFrame(loop); }
  }
  return { id: 'fibroscan', label: 'FibroScan', el, update };
}
