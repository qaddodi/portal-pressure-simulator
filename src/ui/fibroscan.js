// FibroScan tab (Measure): one simulated transient-elastography panel inspired by an Echosens report:
// the median stiffness E (kPa) and the shear-wave elastogram, on a dark panel. The kPa is the model's
// liver stiffness estimate (metrics.lsm). CAP, IQR and the grey M-mode and A-mode strips that go with CAP
// are left out. The map is a continuously evolving reading: coherent speckle that morphs smoothly, one
// dominant dark shear-wave band, and a slope that drifts gently around the model's value.

import { h, fitCanvas, clamp, cssAlpha } from './util.js?v=abb277f29f';
import { FONT } from './charts.js?v=08d2eeeb36';
import { simTime, isPaused, fibroReading } from './clock.js?v=ad6f435e7a';
import { store } from './store.js?v=16a6ccb071';
import { frameFor } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('fibroscan');

const WAVE_T0 = 8; // ms: the shear wave reaches the top of the window about 8 ms after the push
// Colours come from the app's theme tokens (light or dark), re-read about once a second.
let theme = null, themeAt = 0;
function colors(now) {
  if (!theme || now - themeAt > 1000) {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    theme = { panel: g('--surface-2'), edge: g('--border'), tick: g('--text-3'), text: g('--text-2'), orange: g('--fibroscan') };
    themeAt = now;
  }
  return theme;
}
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

const NB = 104; // the noise fields are laid out on this grid; the map is sampled at any resolution from it
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FIELDS = { built: false };
function fields() {
  if (FIELDS.built) return FIELDS;
  const W = NB * 4, H = NB * 3;
  Object.assign(FIELDS, { built: true,
    a1: noiseField(W, H, NB / 10, 11), a2: noiseField(W, H, NB / 10, 12),
    b1: noiseField(W, H, NB / 6, 23), b2: noiseField(W, H, NB / 6, 24),
    p1: noiseField(W, H, NB / 3, 37), p2: noiseField(W, H, NB / 3, 38) });
  return FIELDS;
}

/** Draw one frame of the elastogram into `ctx2` for shear speed c (m/s) at time t (s). The speckle streams along the wave front
 *  and is mixed between fixed fields as it goes, so it evolves coherently: opaque every frame, no fades. Time 0-80 ms across, depth 30-90 mm down; the bands lie along the wave front, with
 *  one dominant dark band whose edge the fitted line follows. */
function drawElastogram(ctx2, img, N, c, t) {
  const F = fields(), th1 = t * 1.3, th2 = t * 1.9 + 1, th3 = t * 2.3 + 2;
  const c1 = Math.cos(th1), s1 = Math.sin(th1), c2 = Math.cos(th2), s2 = Math.sin(th2), c3 = Math.cos(th3), s3 = Math.sin(th3);
  const sc = NB / N, d = img.data, flowY = t * 22, flowX = t * 9; // the speckle streams along the front, so it reads as motion, not a dissolve
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tMs = (x / N) * 80, depth = 30 + (y / N) * 60;
    const s = tMs - WAVE_T0 - (depth - 35) / c;
    const across = (s / 80) * NB * 1.6 + NB * 1.7 + flowX, along = y * sc * 0.65 + NB * 0.6 + flowY;
    const a = 0.5 + (F.a1(across, along) - 0.5) * c1 + (F.a2(across, along) - 0.5) * s1;
    const b = 0.5 + (F.b1(across * 1.4, along) - 0.5) * c2 + (F.b2(across * 1.4, along) - 0.5) * s2;
    const jit = (0.5 + (F.p1(across, along) - 0.5) * c3 + (F.p2(across, along) - 0.5) * s3 - 0.5) * 2.2;
    const noise = a * 0.6 + b * 0.4;
    const w = Math.cos(2 * Math.PI * 0.05 * s + jit);
    const u = clamp((s + 9) / 6, 0, 1), arrive = u * u * (3 - 2 * u); // smooth arrival of the wave: no hard step at the front
    const amp = (0.2 + 0.8 * arrive) * clamp(1 - Math.max(s, 0) / 40, 0.12, 1) * clamp(1.2 - (depth - 30) / 110, 0.5, 1);
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
  const note = h('p', { class: 'ctl-sub' }, 'A simulated FibroScan, live: the slope of the shear wave front gives its speed and so the stiffness. It is an estimate from the model, not a measurement. Normal is about 5 kPa; above 25 kPa with a low platelet count, clinically significant portal hypertension is near certain. A congested liver (heart, hepatic veins) is stiff too.');
  const el = h('div', { class: 'dock-pane', 'data-pane': 'fibroscan' }, box, note);
  const off = document.createElement('canvas'), octx = off.getContext('2d');
  let N = 0, img = null, cap = 300, ema = 0;
  let model = 10, running = false, shown = null, last = 0;
  const sized = { w: 0, h: 0, cap: 11 };

  function paint(now) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 80 || hh < 80) return;
    const st = simTime(now), t = REDUCED ? 3 : st, dt = clamp(st - last, 0, 0.2); last = st;
    // The wave front drifts gently around the model's median; the readout is the median itself (eased when it changes),
    // so it reads the same number as the slide's tile and words.
    const kNow = model * (1 + 0.05 * Math.sin(t * 0.8) + 0.03 * Math.sin(t * 1.9 + 1));
    shown = shown === null || Math.abs(model - shown) < 0.05 ? model : shown + (model - shown) * (1 - Math.exp(-dt * 2.5));
    const c = shearSpeed(kNow);
    const th = colors(now);
    ctx.clearRect(0, 0, w, hh);
    rrect(ctx, 0.5, 0.5, w - 1, hh - 1, 12); ctx.fillStyle = th.panel; ctx.fill(); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
    // A short, wide panel (a phone's presenter card) puts the reading beside the map rather than over it.
    const narrow = w < 380, side = !cv.closest('.pz-tool') && hh < 200 && w > hh * 2.2;   // (a slide's FibroScan always reads top left, LIVE top right, the map under them)
    // The panel's words are the size of the card's small words (the canvas's own font size, which a slide sets to the tiles'
    // small size), so the labels never look tiny beside the card: one size for the axes, the units and LIVE.
    if (w !== sized.w || hh !== sized.h) { sized.w = w; sized.h = hh; const fs = parseFloat(getComputedStyle(cv).fontSize) || 11; sized.cap = clamp(fs * (w / (cv.offsetWidth || w)), 10, 20); }
    const CAP = side ? 10 : sized.cap, pad = side ? 14 : Math.round(CAP * 1.2);
    const live = narrow || cv.closest('.pz-tool') ? 'LIVE' : 'LIVE · 50 Hz · estimate from the model';
    // The reading, top left: the median in the waves' orange, its unit beside it, modest so the map gets the room.
    const big = Math.round(side ? clamp(hh * 0.32, 30, 56) : clamp(CAP * 2.5, 26, 48));
    const RY = side ? 28 + big : pad + Math.round(big * 0.74);
    if (side) { ctx.textAlign = 'left'; ctx.fillStyle = th.tick; ctx.font = FONT(600, 10); ctx.fillText('LIVER STIFFNESS · MEDIAN', pad, 24); }
    ctx.textAlign = 'left'; ctx.fillStyle = th.orange; ctx.font = FONT(600, big);
    const txt = shown.toFixed(1); if (cv.dataset.reading !== txt) cv.dataset.reading = txt;
    fibroReading.txt = txt; fibroReading.cv = cv; fibroReading.show?.(txt); ctx.fillText(txt, pad, RY);
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = th.tick; ctx.font = FONT(500, side ? 14 : Math.round(CAP * 1.15)); ctx.fillText('kPa', pad + tw + 6, RY);
    // LIVE, top right: level with the reading's middle (in the short panel, the top line).
    const ly = side ? 24 : Math.round(RY - big * 0.36 + CAP * 0.36);
    ctx.textAlign = 'right'; ctx.font = FONT(600, CAP); ctx.fillStyle = th.tick;
    ctx.fillText(live, w - pad, ly);
    const pulse = 0.55 + 0.45 * Math.sin(t * 3), lw = ctx.measureText(live).width;
    ctx.fillStyle = cssAlpha('--fibroscan-live', pulse); ctx.beginPath(); ctx.arc(w - pad - lw - CAP * 0.75, ly - CAP * 0.35, Math.max(3, CAP * 0.27), 0, 7); ctx.fill();
    // Map: under the reading, as large as the panel allows; the depth labels on its left, the time labels under it.
    ctx.font = FONT(500, CAP);
    const lab = side ? 22 : Math.ceil(ctx.measureText('90 mm').width) + 8;
    const top = side ? 44 : RY + Math.round(CAP * 1.3), bot = hh - (side ? 22 : Math.round(CAP * 1.9)), ph = bot - top;
    const ax = side ? pad + Math.max(tw + 34, 96) + 22 : pad + lab - 8, ex = ax + 8, ew = w - pad - ex;   // bottom room keeps the tick row inside the canvas on a phone
    if (ph < 50 || ew < 60) return;
    // Sample the map at about half the screen pixels (smooth, never blocky); drop the cap if frames run long.
    const want = clamp(Math.round(Math.max(ew, ph) * (w / cv.clientWidth || 1) * 0.75), 140, cap);
    if (want !== N) { N = want; off.width = off.height = N; img = octx.createImageData(N, N); }
    const t0p = performance.now();
    drawElastogram(octx, img, N, c, t);
    ctx.save(); rrect(ctx, ex, top, ew, ph, 8); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, N, N, ex, top, ew, ph);
    ema = ema * 0.9 + (performance.now() - t0p) * 0.1; if (ema > 14 && cap > 130) { cap -= 20; ema = 0; }
    ctx.strokeStyle = cssAlpha('--white', 0.5); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash([]);
    const x0 = ex + (WAVE_T0 / 80) * ew, x1 = x0 + clamp((40 / c) / 80, 0, 1) * ew;
    ctx.strokeStyle = cssAlpha('--white', 0.95); ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x0, top + (5 / 60) * ph); ctx.lineTo(x1, top + (45 / 60) * ph); ctx.stroke();
    ctx.restore();
    rrect(ctx, ex, top, ew, ph, 8); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
    // Axes: the units ride on the last ticks ("90 mm", "80 ms"), so they need no room of their own.
    const TK = side ? 10 : CAP;
    ctx.fillStyle = th.tick; ctx.font = FONT(500, TK);
    ctx.textAlign = 'right';
    for (let d = 30; d <= 90; d += 20) { const y = top + ((d - 30) / 60) * ph; ctx.fillText(side ? String(d) : d === 90 ? '90 mm' : String(d), ax, Math.min(y + TK * 0.35, bot)); }
    // (A narrow box names every other tick, 0, 40 and 80 ms: "60" ran into "80 ms".)
    const tstep = !side && ctx.measureText('80 ms').width + ctx.measureText('60').width / 2 + 8 > ew / 4 ? 40 : 20;
    for (let m = 0; m <= 80; m += tstep) { ctx.textAlign = m === 80 && !side ? 'right' : 'center'; ctx.fillText(m === 80 && !side ? '80 ms' : String(m), m === 80 && !side ? ex + ew : ex + (m / 80) * ew, bot + TK + 6); }
    if (side) { ctx.textAlign = 'left'; ctx.fillText('mm', ax - 22, top - 6); ctx.fillText('ms', ax - 22, bot + 16); }
  }
  // Runs only while the pane is on screen; update() restarts it when the tab is shown again.
  function loop(now) {
    if (!cv.isConnected || cv.offsetParent === null || document.hidden) { running = false; return; }
    paint(now);
    if (REDUCED || isPaused()) { running = false; return; }   // paused: hold this frame; resume restarts the loop
    nextFrame(loop);
  }
  let pinned = null;   // (the slide's settled stiffness, the tiles' and words' number; the live value swings with each beat)
  function update(f) {
    model = pinned ?? f.metrics.lsm;
    if (!running && cv.offsetParent !== null) { running = true; nextFrame(loop); }
  }
  const offRun = store.on('running', (on) => { if (on && !running && cv.offsetParent !== null) { running = true; nextFrame(loop); } });
  return { id: 'fibroscan', label: 'FibroScan', el, update, pin(fp) { pinned = fp?.lsm ?? null; if (pinned != null) model = pinned; }, dispose: offRun };
}
