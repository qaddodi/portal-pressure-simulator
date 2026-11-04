// FibroScan tab (Measure): one simulated transient-elastography panel inspired by an Echosens report:
// the median stiffness E (kPa) and the shear-wave elastogram, on a dark panel. The kPa is the model's
// liver stiffness estimate (metrics.lsm). CAP, IQR and the grey M-mode and A-mode strips that go with CAP
// are left out. The map is a continuously evolving reading: coherent speckle that morphs smoothly, one
// dominant dark shear-wave band, and a slope that drifts gently around the model's value.

import { h, clamp, cssAlpha, canvasSize } from './util.js';
import { createTraceGL, fitPen, keepLayer } from './trace-gl.js';
import { FONT } from './charts.js';
import { simTime, isPaused, fibroReading } from './clock.js';
import { store } from './store.js';
import { elastogramUnder } from './fibroscan-gl.js';
import { surface } from './gpu-surfaces.js';
import { frameFor, cancelFrame, noteDraw, saver, paceMs, frameAnimating } from './frame.js';
import { createFollow } from './display-state.js';
import { fix1 } from './fix-text.js';
import { dataSoon } from './class-soon.js';
const nextFrame = frameFor('fibroscan');

const WAVE_T0 = 8; // ms: the shear wave reaches the top of the measurement window about 8 ms after the push
// The depth the map shows (mm under the skin) and the M probe's measurement window inside it, 25 to 65 mm (Echosens; the XL probe reads
// 35 to 75 mm). The fitted line runs the window's 40 mm; fibroscan-gl.js carries the same numbers.
export const DEPTH0 = 20, DEPTH_SPAN = 50, WIN0 = 25, WIN1 = 65;
// Colours come from the app's theme tokens (light or dark): read when a panel is made and again just after the theme changes (the root's
// class, data-theme or style, or the system's scheme), never in a frame.
let theme = null, themeWatch = false, themeSoon = 0;
function readTheme() {
  themeSoon = 0;
  const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
  theme = { panel: g('--inst-panel') || g('--surface-2'), edge: g('--border'), tick: g('--text-3'), text: g('--text-2'), orange: g('--fibroscan'), halo: g('--fibroscan-halo') || 'black' };   // (halo: the big reading's, one solid colour, the map's darkest tone: a see-through halo showed the stroke's own overlaps as beads along the edge)
}
function watchTheme() {
  if (themeWatch) return;
  themeWatch = true;
  const soon = () => { if (!themeSoon) themeSoon = setTimeout(readTheme, 0); };
  if (typeof MutationObserver === 'function') new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style', 'data-palette'] });
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', soon);
}
const colors = () => theme;
// (Kept for every frame: the dash patterns and depth lines, the labels' texts, and the ?perf rows. The chart drawer copies a dash it is given.)
const DASH = [2, 4], NO_DASH = [], WINDOW = [WIN0, WIN1];
const DEPTH_TXT = ['30', '45 mm', '60'], TIME_TXT = ['0 ms', '20', '40', '60', '80'];
const ROW_WORDS = { on: 'gpu', via: 'map and words in the chart pool\'s WebGL2' };
const ROW_NONE = { on: 'fallback', via: 'none', why: 'no WebGL2, no chart drawer or a lost context: no map' };
// alloc-rare: the generator and the noise fields are made once, in fields() (FIELDS.built), for all panels
const rnd = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

/** Shear wave speed (m/s) from stiffness E (kPa): E = 3 ρ c², ρ about 1000 kg/m³. */
export const shearSpeed = (kpa) => Math.sqrt((kpa * 1000) / 3000);

/** Smooth value noise on a coarse grid, bilinearly sampled. */
function noiseField(w, hh, cell, seed) {
  const r = rnd(seed), gw = Math.ceil(w / cell), gh = Math.ceil(hh / cell); // periodic: any coordinate wraps seamlessly
  // alloc-rare: made once, in fields()
  const g = Array.from({ length: gw * gh }, r);
  // alloc-rare: made once, in fields()
  return Object.assign((x, y) => {
    const fx = x / cell, fy = y / cell, fix = Math.floor(fx), fiy = Math.floor(fy);
    const tx = fx - fix, ty = fy - fiy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const ix = ((fix % gw) + gw) % gw, iy = ((fiy % gh) + gh) % gh, jx = (ix + 1) % gw, jy = (iy + 1) % gh;
    const a = g[iy * gw + ix], b = g[iy * gw + jx], c = g[jy * gw + ix], d = g[jy * gw + jx];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  // alloc-rare: made once, in fields()
  }, { grid: g, gw, gh, cell });   // (the grid itself, for the GPU's copy of this field: fibroscan-gl.js)
}

const NB = 104; // the noise fields are laid out on this grid; the map is sampled at any resolution from it
const REDUCED_MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };   // (read live: Reduce Motion turned on or off while the app is open applies to the next frame)
const TOUCH = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };   // (read live: a finger's screen keeps the 12 px floor on the canvas words)
const FIELDS = { built: false };
function fields() {
  if (FIELDS.built) return FIELDS;
  const W = NB * 4, H = NB * 3;
  // alloc-rare: made once (FIELDS.built is set by this very call)
  Object.assign(FIELDS, { built: true,
    a1: noiseField(W, H, NB / 10, 11), a2: noiseField(W, H, NB / 10, 12),
    b1: noiseField(W, H, NB / 6, 23), b2: noiseField(W, H, NB / 6, 24),
    p1: noiseField(W, H, NB / 3, 37), p2: noiseField(W, H, NB / 3, 38) });
  return FIELDS;
}

/** The elastogram for shear speed c (m/s) at time t (s), N × N RGBA pixels, worked out here: the GPU's map (fibroscan-gl.js, which
 *  draws it) is checked against it (tests/e2e/idle-steady.mjs). The speckle streams along the wave front and is mixed between fixed
 *  fields as it goes, so it evolves coherently: opaque every frame, no fades. Time 0-80 ms across, depth 20-70 mm down (the M
 *  probe's window, 25-65 mm, between the two dotted lines); the bands lie along the wave front, with one dominant dark band whose
 *  edge the fitted line follows. */
export function elastogramPixels(N, c, t) {
  const d = new Uint8ClampedArray(N * N * 4);
  const F = fields(), th1 = t * 1.3, th2 = t * 1.9 + 1, th3 = t * 2.3 + 2;
  const c1 = Math.cos(th1), s1 = Math.sin(th1), c2 = Math.cos(th2), s2 = Math.sin(th2), c3 = Math.cos(th3), s3 = Math.sin(th3);
  const sc = NB / N, flowY = t * 22, flowX = t * 9; // the speckle streams along the front, so it reads as motion, not a dissolve
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tMs = (x / N) * 80, depth = DEPTH0 + (y / N) * DEPTH_SPAN;
    const s = tMs - WAVE_T0 - (depth - WIN0) / c;
    const across = (s / 80) * NB * 1.6 + NB * 1.7 + flowX, along = y * sc * 0.65 + NB * 0.6 + flowY;
    const a = 0.5 + (F.a1(across, along) - 0.5) * c1 + (F.a2(across, along) - 0.5) * s1;
    const b = 0.5 + (F.b1(across * 1.4, along) - 0.5) * c2 + (F.b2(across * 1.4, along) - 0.5) * s2;
    const jit = (0.5 + (F.p1(across, along) - 0.5) * c3 + (F.p2(across, along) - 0.5) * s3 - 0.5) * 2.2;
    const noise = a * 0.6 + b * 0.4;
    const w = Math.cos(2 * Math.PI * 0.05 * s + jit);
    const u = clamp((s + 9) / 6, 0, 1), arrive = u * u * (3 - 2 * u); // smooth arrival of the wave: no hard step at the front
    const amp = (0.2 + 0.8 * arrive) * clamp(1 - Math.max(s, 0) / 40, 0.12, 1) * clamp(1.2 - (depth - DEPTH0) / 110, 0.5, 1);
    const band = Math.exp(-(((s + 3.5) / 3.2) ** 2));
    const k = clamp(0.76 + w * 0.32 * amp + (noise - 0.5) * 1.25 - band * 0.55, 0, 1) ** 1.5;
    const i = (y * N + x) * 4;
    d[i] = 20 + 220 * k; d[i + 1] = 10 + 126 * k; d[i + 2] = 8 + 64 * k; d[i + 3] = 255;
  }
  return d;
}

/** For the checks: what the GPU's map is drawn from (its noise fields, their grid and the wave's start). */
export const elastogramInputs = () => ({ F: fields(), NB, t0: WAVE_T0 });

const twOf = (ctx, text) => ctx.measureText(text).width;   // (a text's width in the context's font)
function rrect(ctx, x, y, w, h2, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function createFibroScan() {
  if (!theme) readTheme();
  watchTheme();
  const cv = h('canvas', { role: 'img', 'aria-label': 'Simulated FibroScan elastography panel, live' });
  let mapGpu = null;   // (whether the last map was drawn: the ?perf surfaces list)
  const box = h('div', { class: 'chart-box fibroscan-box' }, cv);
  const note = h('p', { class: 'ctl-sub' }, 'A simulated FibroScan, live: the slope of the shear wave front gives its speed and so the stiffness. It is an estimate from the model, not a measurement. Normal is about 5 kPa; >25 kPa with a low platelet count, clinically significant portal hypertension is near certain. A congested liver (heart, hepatic veins) is stiff too.');
  const el = h('div', { class: 'dock-pane', 'data-pane': 'fibroscan' }, box, note);
  const cap = 300;
  let model = 10, running = false, shown = null, last = 0;
  const kShown = createFollow({ small: 0.05, eps: 0.01 });
  const sized = { cap: 11, r: 1, fs: 11, ow: 0, cw: 0 };
  // (The box read when it changes size: never in a frame.)
  const readBox = () => { sized.fs = parseFloat(getComputedStyle(cv).fontSize) || 11; sized.ow = cv.offsetWidth; sized.cw = cv.clientWidth; };
  const boxRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => readBox()) : null;
  // Whether the panel is on screen, as the browser reports it when it changes (read every frame, offsetParent laid the page out);
  // coming on screen, it draws again at once. (No observer, as in a bare test page: read as before.)
  let seen = false, fed = false;   // (fed: the model has given it a stiffness to show)
  // (raf: the loop's one frame asked for, let go with the panel: dispose.)
  let raf = 0, gone = false;
  // (While the wave runs its frames are never carried to a later one by the scheduler: a carried frame of a moving picture is a hitch.)
  let animating = false;
  const anim = (on) => { if (animating !== on) { animating = on; frameAnimating('fibroscan', on); } };
  const start = () => { if (!running && !gone) { running = true; anim(true); raf = nextFrame(loop); } };
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { const was = seen; seen = es[es.length - 1].isIntersecting; if (seen && !was && fed) start(); }) : null;
  io?.observe(cv); boxRO?.observe(cv);
  const onScreen = () => cv.isConnected && (io ? seen : true);   // (no observer, a bare test page: taken as shown)

  // (The map drawn in the chart drawer's own context, under its words: no WebGL context of the panel's own while the drawer draws.
  // Its program and grids are made the first time it draws, and again when the drawer's context is made again.)
  let mapU = null;
  const under = (gl, W, H, gen) => {
    if (!mapU) { mapU = elastogramUnder(fields()); mapU.onReady = () => { if (!gone) paint(performance.now()); }; mapU.set(fr.map); }
    mapU(gl, W, H, gen);
  };
  const words = createTraceGL(cv, { redraw: () => { if (!gone) paint(performance.now()); }, under });
  // (The frame's moment and the map's inputs: two records of this panel, written in place each frame; mapU keeps the map's and reads it as the drawer's frame begins.)
  const fr = { t: 0, c: 1, map: null }, frMap = { NB, t0: WAVE_T0, N: 0, c: 1, t: 0, rad: 0 };
  function paint(now) {
    // (The moment, worked out before the frame starts: the map under the words is drawn as the frame begins.)
    const st = simTime(now), t = REDUCED_MQ.matches ? 3 : st, dt = clamp(st - last, 0, 0.2); last = st;
    // The wave front drifts gently around the model's median; the readout is the median itself (eased when it changes),
    // so it reads the same number as the slide's tile and words.
    const kNow = model * (1 + 0.05 * Math.sin(t * 0.8) + 0.03 * Math.sin(t * 1.9 + 1));
    // (On the shown state's filter, display-state.js, premium-feel R4: the bar's and the figure's clock; a jump of the model, a pause or
    // Reduce Motion shows the new median at once.)
    shown = kShown.step(model, dt, REDUCED_MQ.matches || isPaused());
    fr.t = t; fr.c = shearSpeed(kNow); fr.map = null;
    const z = canvasSize(cv), want = clamp(Math.round(Math.max(z.w, z.h) * sized.r * (saver() ? 0.5 : 0.75)), saver() ? 100 : 140, saver() ? Math.min(cap, 200) : cap);
    frMap.N = want; frMap.c = fr.c; frMap.t = t; frMap.rad = 12 * (z.W / Math.max(1, z.w));   // (its corners as the panel's, 12 px)
    fr.map = frMap;
    mapU?.set(fr.map);
    const pen = fitPen(cv, words);
    try { paintWith(pen); } finally { pen.ctx.end?.(); }
  }
  function paintWith({ ctx, w, h: hh }) {
    if (w < 80 || hh < 80) return;
    const { c } = fr;
    const th = colors();
    const reading = fix1(shown); dataSoon(cv, 'reading', reading);
    fibroReading.txt = reading; fibroReading.cv = cv; fibroReading.show?.(reading);
    ctx.clearRect(0, 0, w, hh);
    // The map is the whole instrument: it fills the canvas, the depth labels inside its left edge, the time labels inside its bottom
    // edge and the reading inside its top right corner (the clearest part: the wave front starts at the top left).
    // A short, wide panel (a phone's presenter card on its side) differs only in its smaller words.
    const side = !cv.closest('.pz-tool') && hh < 200 && w > hh * 2.2;
    const FLOOR = TOUCH.matches ? 12 : 10;   // (a finger's screen keeps the 12 px floor; a mouse's panel keeps its small words)
    // The panel's words are the size of the card's small words (the canvas's own font size, which a slide sets to the tiles'
    // small size), so the labels never look tiny beside the card: one size for the axes and the units.
    // (The box's ratio to its layout width is read with the size, when it changes: read every frame, it laid the page out mid-frame.)
    // (Its font size and layout widths are read by its ResizeObserver, outside the frame, which reports once as it starts: readBox.)
    sized.cap = clamp(sized.fs * (w / (sized.ow || w)), FLOOR, 20); sized.r = w / (sized.cw || w) || 1;
    const CAP = side ? FLOOR : Math.max(FLOOR, sized.cap), m = Math.round(CAP * 0.7);
    const ex = 0, top = 0, ew = w, ph = hh, bot = hh;
    if (ph < 50 || ew < 60) return;
    // Sample the map at about half the screen pixels (smooth, never blocky), always (it never shrinks itself when frames
    // run long). (Battery saver: a third of them.)
    const lo = saver();
    const want = clamp(Math.round(Math.max(ew, ph) * sized.r * (lo ? 0.5 : 0.75)), lo ? 100 : 140, lo ? Math.min(cap, 200) : cap);

    // The map: drawn by the GPU in the chart pool's context, under these words, as the chart drawer's frame began (the same formula and
    // noise, a fraction of a millisecond). Without the drawer (no WebGL2, a frame it could not draw) there is no map.
    const drawn = ctx.onGPU === true && !!mapU?.drew();
    mapGpu = drawn;
    // The still parts (the window lines, the edge, the depth and time words with their halos, "kPa" and the reading's fitted size) are kept as one
    // GPU picture, drawn again only when the size, the words' size or the theme's colours change, not on every frame of the wave; each frame
    // lays that picture and draws the fitted line and the reading. (The kept layer, as the Doppler's scale does; the fit is worked out with it.)
    const ink = cssAlpha('--white', 0.96), halo = cssAlpha('--black', 0.7), dash = cssAlpha('--white', 0.5);
    if (KS.w !== w || KS.hh !== hh || KS.CAP !== CAP || KS.side !== side || KS.edge !== th.edge || KS.tick !== th.tick || KS.hc !== th.halo || KS.ink !== ink || KS.halo !== halo || KS.dash !== dash) {
      KS.w = w; KS.hh = hh; KS.CAP = CAP; KS.side = side; KS.edge = th.edge; KS.tick = th.tick; KS.hc = th.halo; KS.ink = ink; KS.halo = halo; KS.dash = dash; KS.ver++;
    }
    KS.th = th; KS.m = m; KS.ew = ew; KS.ph = ph; KS.ex = ex; KS.top = top; KS.bot = bot; KS.FLOOR = FLOOR; KS.ctx = ctx;
    keepLayer(ctx, 'fs-still', KS.ver, drawStill);
    const x0 = ex + (WAVE_T0 / 80) * ew, x1 = x0 + clamp((40 / c) / 80, 0, 1) * ew;
    ctx.strokeStyle = cssAlpha('--white', 0.95); ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(x0, top + ((WIN0 - DEPTH0) / DEPTH_SPAN) * ph); ctx.lineTo(x1, top + ((WIN1 - DEPTH0) / DEPTH_SPAN) * ph); ctx.stroke();
    ctx.fillStyle = ink; ctx.strokeStyle = colors().halo; ctx.lineJoin = 'round'; ctx.textAlign = 'right'; ctx.lineWidth = Math.max(3, KS.big * 0.16);
    ctx.font = FONT(600, KS.big); ctx.strokeText(reading, KS.ux - KS.uw - 5, KS.RY); ctx.fillText(reading, KS.ux - KS.uw - 5, KS.RY);
  }
  // (The kept layer's drawing: what the still parts are drawn from is in KS, and the reading's fit is left there for each frame's number.)
  const KS = { ver: 0, w: 0, hh: 0, CAP: 0, side: false, edge: '', tick: '', hc: '', ink: '', halo: '', dash: '', th: null, m: 0, ew: 0, ph: 0, ex: 0, top: 0, bot: 0, FLOOR: 0, ctx: null, big: 14, RY: 0, uw: 0, ux: 0 };
  function drawStill() {
    const { ctx, th, m, ew, ph, ex, top, bot, side, w, hh, CAP, FLOOR } = KS;
    ctx.strokeStyle = cssAlpha('--white', 0.5); ctx.setLineDash(DASH); ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) { const d = WINDOW[i]; const y = top + ((d - DEPTH0) / DEPTH_SPAN) * ph; ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + ew, y); ctx.stroke(); }
    ctx.setLineDash(NO_DASH);
    rrect(ctx, 0.5, 0.5, w - 1, hh - 1, 12); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
    // Axes: the units ride on one tick each ("60 mm", "0 ms"), so they need no room of their own.
    const TK = side ? FLOOR : CAP;
    ctx.fillStyle = th.tick; ctx.font = FONT(500, TK);
    // Depth labels sit inside the map's left edge in white with a dark halo, so they read on any colour of the elastogram. They stand at
    // 30, 45 and 60 mm (a fifth, a half and four fifths of the way down the 20-70 mm map): even gaps, clear of the corners and of the time row.
    ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, TK * 0.32); ctx.strokeStyle = cssAlpha('--black', 0.7);
    for (let d = 30; d <= 60; d += 15) {
      const y = top + ((d - DEPTH0) / DEPTH_SPAN) * ph, txt = DEPTH_TXT[(d - 30) / 15], by = y + TK * 0.35;
      ctx.fillStyle = cssAlpha('--white', 0.96); ctx.strokeText(txt, ex + m, by); ctx.fillText(txt, ex + m, by);
    }
    // Time labels sit inside the map's bottom edge the same way, 0 to 80 ms with the unit on the first: their centres are spread evenly
    // between the two end labels (which cannot sit on the edges), so the gaps between the numbers are equal.
    // (A narrow box names every other tick, 0, 40 and 80 ms: "60" ran into "80".)
    const tstep = twOf(ctx, '0 ms') / 2 + twOf(ctx, '80') / 2 + twOf(ctx, '60') + 3 * 8 > ew - 2 * m ? 40 : 20, ntk = Math.floor(80 / tstep) + 1;
    const c0 = ex + m + twOf(ctx, '0 ms') / 2, c1 = ex + ew - m - twOf(ctx, '80') / 2, by = bot - TK * 0.45;
    ctx.textAlign = 'center'; ctx.fillStyle = cssAlpha('--white', 0.96);
    for (let i = 0; i < ntk; i++) { const txt = TIME_TXT[i * tstep / 20], bx = c0 + i * (c1 - c0) / (ntk - 1); ctx.strokeText(txt, bx, by); ctx.fillText(txt, bx, by); }
    // The reading, inside the top right corner in the same white with a dark halo: the number big (about four times the label size, within the map's room), "kPa" small
    // beside it. Right aligned, so "kPa" never moves while the number eases.
    // (It stays in the top right and keeps clear of the "40" depth label: where the two would meet (a box about 900 px wide),
    // the number steps smaller until a gap is left. Judged at the widest reading, "88.8", so its size never changes as the number eases.)
    const ly = top + ph / 6 + TK * 0.35, lr = ex + m + twOf(ctx, '40') + CAP, lt = ly - TK * 0.8;   // (the "40" label's baseline, right edge plus a gap, and top)
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
    ctx.strokeStyle = th.halo; ctx.strokeText('kPa', ux, RY); ctx.fillText('kPa', ux, RY);
    KS.big = big; KS.RY = RY; KS.uw = uw; KS.ux = ux;
  }
  // Runs only while the pane is on screen; update() restarts it when the tab is shown again.
  // While it plays the map is drawn on every frame the screen offers (15 a second in Battery saver), like the lobule's flow.
  let lastPaint = -1e9;
  function loop(now) {
    raf = 0;
    if (gone || !onScreen() || document.hidden) { running = false; anim(false); return; }
    const hold = REDUCED_MQ.matches || isPaused();
    if (hold || now - lastPaint >= paceMs()) { paint(now); lastPaint = now; noteDraw('fibroscan'); }   // (paused: always drawn, so a change shows)
    if (hold) { running = false; anim(false); return; }   // paused: hold this frame; resume restarts the loop
    raf = nextFrame(loop);
  }
  let pinned = null;   // (the slide's settled stiffness, the tiles' and words' number; the live value swings with each beat)
  function update(f) {
    model = pinned ?? f.metrics.lsm; fed = true;
    if (onScreen()) start();
  }
  const offRun = store.on('running', (on) => { if (on && onScreen()) start(); });
  /** The panel is done with (a presentation's own instruments go with it): its frame, observer and store watch are let go. */
  // (The ?perf surfaces list, gpu-surfaces.js: read by the readout only.)
  const offSurface = surface('FibroScan map', () => (!cv.isConnected || mapGpu === null ? null : mapGpu ? ROW_WORDS : ROW_NONE));
  function dispose() { gone = true; running = false; anim(false); cancelFrame(raf); raf = 0; io?.disconnect(); boxRO?.disconnect(); offRun(); words?.dispose(); }
  return { id: 'fibroscan', label: 'FibroScan', el, update, pin(fp) { pinned = fp?.lsm ?? null; if (pinned != null) model = pinned; }, dispose() { dispose(); offSurface(); } };
}
