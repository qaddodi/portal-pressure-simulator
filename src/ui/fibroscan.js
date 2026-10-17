// FibroScan tab (Measure): one simulated transient-elastography panel inspired by an Echosens report:
// the median stiffness E (kPa) and the shear-wave elastogram, on a dark panel. The kPa is the model's
// liver stiffness estimate (metrics.lsm). CAP, IQR and the grey M-mode and A-mode strips that go with CAP
// are left out. The map is a continuously evolving reading: coherent speckle that morphs smoothly, one
// dominant dark shear-wave band, and a slope that drifts gently around the model's value.

import { h, fitCanvas, clamp, cssAlpha } from './util.js?v=a60727fe1b';
import { FONT } from './charts.js?v=832be758c3';
import { simTime, isPaused, fibroReading } from './clock.js?v=520596240b';
import { store } from './store.js?v=31ee79b6ab';
import { elastogramGL } from './fibroscan-gl.js?v=c1e9f0f60b';
import { frameFor, noteDraw, saver, paceMs } from './frame.js?v=67ca200c87';
const nextFrame = frameFor('fibroscan');

const WAVE_T0 = 8; // ms: the shear wave reaches the top of the window about 8 ms after the push
// Colours come from the app's theme tokens (light or dark), re-read about once a second.
let theme = null, themeAt = 0;
function colors(now) {
  if (!theme || now - themeAt > 1000) {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    theme = { panel: g('--inst-panel') || g('--surface-2'), edge: g('--border'), tick: g('--text-3'), text: g('--text-2'), orange: g('--fibroscan') };
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
  return Object.assign((x, y) => {
    const fx = x / cell, fy = y / cell, fix = Math.floor(fx), fiy = Math.floor(fy);
    const tx = fx - fix, ty = fy - fiy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const ix = ((fix % gw) + gw) % gw, iy = ((fiy % gh) + gh) % gh, jx = (ix + 1) % gw, jy = (iy + 1) % gh;
    const a = g[iy * gw + ix], b = g[iy * gw + jx], c = g[jy * gw + ix], d = g[jy * gw + jx];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }, { grid: g, gw, gh, cell });   // (the grid itself, for the GPU's copy of this field: fibroscan-gl.js)
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

/** For the checks: the map drawn on the CPU and on the GPU for the same moment, as RGBA pixel arrays (the GPU's null without WebGL2). */
export function elastogramPair(N, c, t) {
  const cv = Object.assign(document.createElement('canvas'), { width: N, height: N }), x = cv.getContext('2d', { willReadFrequently: true });
  const img = x.createImageData(N, N);
  drawElastogram(x, img, N, c, t);
  const cpu = x.getImageData(0, 0, N, N).data;
  const g = elastogramGL(fields(), NB, WAVE_T0, N, c, t);
  if (!g) return { cpu, gpu: null };
  x.clearRect(0, 0, N, N); x.drawImage(g, 0, 0, N, N, 0, 0, N, N);
  return { cpu, gpu: x.getImageData(0, 0, N, N).data };
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
  let N = 0, img = null;
  const cap = 300;
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
    const reading = shown.toFixed(1); if (cv.dataset.reading !== reading) cv.dataset.reading = reading;
    fibroReading.txt = reading; fibroReading.cv = cv; fibroReading.show?.(reading);
    ctx.clearRect(0, 0, w, hh);
    // The map is the whole instrument: it fills the canvas, the depth labels inside its left edge, the time labels inside its bottom
    // edge and the reading inside its top right corner (the clearest part: the wave front starts at the top left).
    // A short, wide panel (a phone's presenter card on its side) differs only in its smaller words.
    const side = !cv.closest('.pz-tool') && hh < 200 && w > hh * 2.2;
    // The panel's words are the size of the card's small words (the canvas's own font size, which a slide sets to the tiles'
    // small size), so the labels never look tiny beside the card: one size for the axes and the units.
    if (w !== sized.w || hh !== sized.h) { sized.w = w; sized.h = hh; const fs = parseFloat(getComputedStyle(cv).fontSize) || 11; sized.cap = clamp(fs * (w / (cv.offsetWidth || w)), 10, 20); }
    const CAP = side ? 10 : sized.cap, m = Math.round(CAP * 0.7);
    const ex = 0, top = 0, ew = w, ph = hh, bot = hh;
    if (ph < 50 || ew < 60) return;
    // Sample the map at about half the screen pixels (smooth, never blocky), always (it never shrinks itself when frames
    // run long). (Battery saver: a third of them.)
    const lo = saver();
    const want = clamp(Math.round(Math.max(ew, ph) * (w / cv.clientWidth || 1) * (lo ? 0.5 : 0.75)), lo ? 100 : 140, lo ? Math.min(cap, 200) : cap);
    if (want !== N) { N = want; off.width = off.height = N; img = octx.createImageData(N, N); }
    // The map: on the GPU (the same formula and noise, a fraction of a millisecond), else pixel by pixel here.
    const mapCv = elastogramGL(fields(), NB, WAVE_T0, N, c, t) || (drawElastogram(octx, img, N, c, t), off);
    ctx.save(); rrect(ctx, 0.5, 0.5, w - 1, hh - 1, 12); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(mapCv, 0, 0, N, N, ex, top, ew, ph);
    ctx.strokeStyle = cssAlpha('--white', 0.5); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    for (const d of [35, 75]) { const y = top + ((d - 30) / 60) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash([]);
    const x0 = ex + (WAVE_T0 / 80) * ew, x1 = x0 + clamp((40 / c) / 80, 0, 1) * ew;
    ctx.strokeStyle = cssAlpha('--white', 0.95); ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x0, top + (5 / 60) * ph); ctx.lineTo(x1, top + (45 / 60) * ph); ctx.stroke();
    ctx.restore();
    rrect(ctx, 0.5, 0.5, w - 1, hh - 1, 12); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
    // Axes: the units ride on one tick each ("60 mm", "0 ms"), so they need no room of their own.
    const TK = side ? 10 : CAP;
    ctx.fillStyle = th.tick; ctx.font = FONT(500, TK);
    // Depth labels sit inside the map's left edge in white with a dark halo, so they read on any colour of the elastogram. They stand at
    // 40, 60 and 80 mm (a sixth, a half and five sixths of the way down): even gaps, clear of the corners and of the time row.
    ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, TK * 0.32); ctx.strokeStyle = cssAlpha('--black', 0.7);
    for (let d = 40; d <= 80; d += 20) {
      const y = top + ((d - 30) / 60) * ph, txt = d === 60 ? '60 mm' : String(d), by = y + TK * 0.35;
      ctx.fillStyle = cssAlpha('--white', 0.96); ctx.strokeText(txt, ex + m, by); ctx.fillText(txt, ex + m, by);
    }
    // Time labels sit inside the map's bottom edge the same way, 0 to 80 ms with the unit on the first: their centres are spread evenly
    // between the two end labels (which cannot sit on the edges), so the gaps between the numbers are equal.
    // (A narrow box names every other tick, 0, 40 and 80 ms: "60" ran into "80".)
    const tw = (t) => ctx.measureText(t).width, tstep = tw('0 ms') / 2 + tw('80') / 2 + tw('60') + 3 * 8 > ew - 2 * m ? 40 : 20;
    const tks = []; for (let tm = 0; tm <= 80; tm += tstep) tks.push(tm);
    const c0 = ex + m + tw('0 ms') / 2, c1 = ex + ew - m - tw('80') / 2, by = bot - TK * 0.45;
    ctx.textAlign = 'center'; ctx.fillStyle = cssAlpha('--white', 0.96);
    tks.forEach((tm, i) => { const txt = tm === 0 ? '0 ms' : String(tm), bx = c0 + i * (c1 - c0) / (tks.length - 1); ctx.strokeText(txt, bx, by); ctx.fillText(txt, bx, by); });
    // The reading, inside the top right corner in the same white with a dark halo: the number big (about four times the label size, within the map's room), "kPa" small
    // beside it. Right aligned, so "kPa" never moves while the number eases.
    // (It stays in the top right and keeps clear of the "40" depth label: where the two would meet (a box about 900 px wide),
    // the number steps smaller until a gap is left. Judged at the widest reading, "88.8", so its size never changes as the number eases.)
    const ly = top + ph / 6 + TK * 0.35, lr = ex + m + tw('40') + CAP, lt = ly - TK * 0.8;   // (the "40" label's baseline, right edge plus a gap, and top)
    ctx.font = FONT(500, Math.round(CAP * 1.4));
    const uw = ctx.measureText('kPa').width;
    let big = Math.round(Math.max(24, Math.min(CAP * 4, 72, ph * 0.3, ew * 0.28))), RM, RY;   // (RM: the reading's own margin from the map's top and right edges)
    for (;;) {
      RM = Math.max(m * 2, Math.round(big * 0.4)); RY = RM + Math.round(big * 0.74);
      ctx.font = FONT(600, big);
      const left = ex + ew - RM - uw - 5 - ctx.measureText('88.8').width - big * 0.08, below = RY + big * 0.08 < lt;   // (with the halo's half width)
      if (below || left >= lr || big <= 14) break;
      big -= 2;
    }
    ctx.textAlign = 'right'; ctx.lineWidth = Math.max(3, big * 0.16);
    ctx.font = FONT(500, Math.round(CAP * 1.4)); const ux = ex + ew - RM;
    ctx.strokeText('kPa', ux, RY); ctx.fillText('kPa', ux, RY);
    ctx.font = FONT(600, big); ctx.strokeText(reading, ux - uw - 5, RY); ctx.fillText(reading, ux - uw - 5, RY);
  }
  // Runs only while the pane is on screen; update() restarts it when the tab is shown again.
  // While it plays the map is drawn on every frame the screen offers (15 a second in Battery saver), like the lobule's flow.
  let lastPaint = -1e9;
  function loop(now) {
    if (!cv.isConnected || cv.offsetParent === null || document.hidden) { running = false; return; }
    const hold = REDUCED || isPaused();
    if (hold || now - lastPaint >= paceMs()) { paint(now); lastPaint = now; noteDraw('fibroscan'); }   // (paused: always drawn, so a change shows)
    if (hold) { running = false; return; }   // paused: hold this frame; resume restarts the loop
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
