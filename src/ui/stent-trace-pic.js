// The stent's longitudinal traces (17 Nov 2026; the reviewer's view, /mnt/project-files/tips-geometry-mocks/tips-geometry-two-designs.html part 1, on the engine's numbers):
// the lumen from the portal vein to the IVC with five numbered pressure sites, and under it ONE chart at a time on the same x (the card's Pressure | Energy | Velocity
// switch crossfades them, a chart of a fixed height at every width): the static pressure (it dips where the lumen narrows and recovers part of it), the energy lost so
// far (it only rises) and the mean velocity. src/engine/stent-trace.js makes the curves; the solver is
// lumped, so the picture is a schematic of where each part of the drop happens (labelled so) and its ends are the engine's own: the PPG at the portal end, 0 at the IVC.
// One picture (a drawing of fixed pieces: 161-point curves, nothing made or taken away when the geometry changes), drawn on the GPU by tool-stent.js's createSvgGL.
// createTracePic(sv, gid, colourOf) → { svg, words, fit(T, out), paint(T, ex, pm), layout(fs) → height, fitWords(fs) }. T is the record paint reads; pm the chart shown (0 pressure, 1 energy, 2 velocity; between two, both crossfaded).
import { setGeo, setPts, setWords } from './svg-gl.js';
import { clamp } from './util.js';
import { profileAt } from '../engine/stent-geom.js';
import { stentTrace, makeTrace, TRACE_N } from '../engine/stent-trace.js';

export const TR = { x1: 312, cy: 33, pxMm: 1.9, badgeY: 9, badgeR: 7.5, veinCm: 3, titleY: 58, ph: 88 };
/** The picture's height in units at the usual size of words (the picture itself follows the words' size: layout(fs)); one chart is in view at a time whatever panels were asked for, so n is ignored. */
export const traceH = () => 204;
export const PANELS = ['pressure', 'energy', 'velocity'];
const TITLES = { pressure: 'Static pressure, mmHg', energy: 'Energy lost so far, mmHg', velocity: 'Mean velocity, cm/s' };
const KEY = '1 Portal  2 Inlet  3 Waist  4 Outlet  5 IVC';
const NOTE = 'Schematic: where each part of the drop happens';
const N = TRACE_N, NS = 33;
const LAB = Array.from({ length: 700 }, (_, i) => `${i - 100}`);
const lab = (v) => LAB[clamp(Math.round(v) + 100, 0, 699)];

const PS = { sh: null, s: 0, site: 0 }, prof = (u) => profileAt(PS.sh, PS.s, PS.site, u);
/** The trace for the numbers T (sh, s, site, d, flowLpm, tract, wall, ends, jet, ppg, dp), written into rec (a makeTrace() record the caller keeps). */
export function traceFor(T, rec) {
  PS.sh = T.sh; PS.s = T.s; PS.site = T.site;
  const len = T.sh.len, xa = -TR.veinCm, xb = len + TR.veinCm;
  return stentTrace({ len, q: (Math.abs(T.flowLpm) * 1000) / 60, d: T.d, prof, xa, xb, tract: T.tract, wall: T.wall, entry: T.ends, jet: T.jet, inlet: 0, ppg: T.ppg, dp: T.dp }, rec);
}

export function createTracePic(sv, gid, colourOf) {
  const rec = makeTrace();
  const strip = sv('path', { 'data-look': 'stent.tr.lumen', fill: `url(#${gid})` });
  const stripBuf = new Float64Array(2 * 2 * (N + 1));
  const stops = Array.from({ length: NS }, (_, i) => sv('stop', { offset: (i / (NS - 1)).toFixed(3), 'stop-color': '#888888' }));   // colour-exempt: first stops, written at the first paint
  let X0 = 40;
  const grad = sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: X0, y1: 0, x2: TR.x1, y2: 0 }, stops);
  const siteBuf = [0, 1, 2, 3, 4].map(() => new Float64Array(4));
  const siteL = siteBuf.map(() => sv('path', { 'data-look': 'stent.tr.site' }));
  const badge = siteBuf.map(() => sv('circle', { 'data-look': 'stent.tr.badge', r: TR.badgeR, cy: TR.badgeY }));
  const badgeN = siteBuf.map((_, k) => sv('text', { 'data-look': 'stent.tr.badgeNum', y: TR.badgeY, 'text-anchor': 'middle' }));
  badgeN.forEach((e, k) => setWords(e, `${k + 1}`));
  // the chart's frame, shared: three gridlines (the top, the middle, the bottom of the range)
  const gridBuf = [0, 1, 2].map(() => new Float64Array(4)), grid = gridBuf.map(() => sv('path', { 'data-look': 'stent.tr.axis' }));
  const pan = PANELS.map((name) => ({
    name,
    base: sv('path', { 'data-look': 'stent.tr.zero' }), baseBuf: new Float64Array(4),
    area: sv('path', { 'data-look': `stent.tr.area.${name}` }), areaBuf: new Float64Array(2 * (N + 3)),
    line: sv('path', { 'data-look': `stent.tr.line.${name}` }), lineBuf: new Float64Array(2 * (N + 1)),
    dots: siteBuf.map(() => sv('circle', { 'data-look': `stent.tr.dot.${name}`, r: 3.2 })),
    title: sv('text', { 'data-look': 'stent.tr.title', 'text-anchor': 'start' }),
    ticks: [0, 1, 2].map(() => sv('text', { 'data-look': 'stent.cap', 'text-anchor': 'end' })),
  }));
  pan.forEach((p) => setWords(p.title, TITLES[p.name]));
  const key = sv('text', { 'data-look': 'stent.cap', x: 160, 'text-anchor': 'middle' }), note = sv('text', { 'data-look': 'stent.cap', x: 160, 'text-anchor': 'middle' });
  setWords(key, KEY); setWords(note, NOTE);
  const kids = [strip, ...grid, ...siteL, ...badge, ...badgeN, ...pan.flatMap((p) => [p.base, p.area, p.line, ...p.dots, p.title, ...p.ticks]), key, note];
  const svg = sv('svg', { class: 'gl-pic', viewBox: '0 0 320 200', role: 'img' }, sv('defs', {}, grad), ...kids);
  const words = [...badgeN, ...pan.flatMap((p) => [p.title, ...p.ticks]), key, note];
  const G = { fs: 11, top: 76, base: 164, h: 200 };

  /** The picture's rows follow the words' size fs (in these units, so a narrower picture does not crowd them): the chart's gutter for its ticks, the title above it, the key
   *  and the note under it. Returns the picture's height in units. */
  function layout(fs) {
    G.fs = fs;
    X0 = 8 + fs * 0.6 * 3 + 4;
    G.top = TR.titleY + fs * 0.5 + 8;
    G.base = G.top + TR.ph;
    const yk = G.base + fs * 1.6, yn = yk + fs * 1.3;
    G.h = yn + fs * 0.8 + 3;
    setGeo(key, 'y', yk); setGeo(note, 'y', yn);
    for (const p of pan) {
      setGeo(p.title, 'x', X0); setGeo(p.title, 'y', TR.titleY);
      for (let t = 0; t < 3; t++) { setGeo(p.ticks[t], 'x', X0 - 4); setGeo(p.ticks[t], 'y', G.base - (TR.ph * t) / 2); }
    }
    for (let t = 0; t < 3; t++) { const gb = gridBuf[t], y = G.base - (TR.ph * t) / 2; gb[0] = X0; gb[1] = y; gb[2] = TR.x1; gb[3] = y; setPts(grid[t], gb, 2, false); }
    setGeo(grad, 'x1', X0);
    setGeo(svg, 'viewBox', `0 0 320 ${G.h.toFixed(1)}`);
    return G.h;
  }

  const run = (T) => traceFor(T, rec);

  /** The charts' ranges for the numbers T (nice round ends, so a range moves in steps the follower glides): writes pHi, pLo, vHi into out. */
  function fit(T, out) {
    const o = run(T);
    let mn = Infinity, mx = 0;
    for (let i = 0; i <= N; i++) { if (o.P[i] < mn) mn = o.P[i]; if (o.v[i] > mx) mx = o.v[i]; }
    out.pHi = Math.max(8, Math.ceil((T.ppg - 1e-9) / 4) * 4);
    out.pLo = mn < -0.05 ? Math.floor(mn / 2) * 2 : 0;
    out.vHi = Math.max(100, Math.ceil(mx / 50) * 50);
    return out;
  }

  /** Draws the charts for T (the numbers: sh, s, site, d, flowLpm, tract, wall, ends, jet, ppg, dp; ranges pHi, pLo, vHi) at the strength ex, chart pm. */
  function paint(T, ex, pm) {
    const o = run(T), len = T.sh.len, xa = -TR.veinCm, xb = len + TR.veinCm, kx = (TR.x1 - X0) / (xb - xa), X = (x) => X0 + (x - xa) * kx;
    // the lumen: the trace's own diameters, so it is the very lumen the curves belong to
    const sb = stripBuf;
    for (let i = 0; i <= N; i++) {
      const x = X(o.x[i]), half = (o.D[i] * TR.pxMm) / 2, q = 2 * N + 1 - i;
      sb[2 * i] = x; sb[2 * i + 1] = TR.cy - half; sb[2 * q] = x; sb[2 * q + 1] = TR.cy + half;
    }
    setPts(strip, sb, 2 * (N + 1), true);
    for (let j = 0; j < NS; j++) setGeo(stops[j], 'stop-color', colourOf(o.v[Math.round((j * N) / (NS - 1))] * T.kd));
    const pLo = T.pLo, pHi = T.pHi, bot = G.base;
    for (let k = 0; k < 5; k++) {
      const x = X(o.sites[k]), sbf = siteBuf[k];
      sbf[0] = x; sbf[1] = TR.badgeY + TR.badgeR; sbf[2] = x; sbf[3] = bot; setPts(siteL[k], sbf, 2, false);
      setGeo(badge[k], 'cx', x); setGeo(badgeN[k], 'x', x);
      setGeo(siteL[k], 'opacity', ex); setGeo(badge[k], 'opacity', ex); setGeo(badgeN[k], 'opacity', ex);
    }
    setGeo(strip, 'opacity', ex);
    for (const g of grid) setGeo(g, 'opacity', ex);
    for (let pi = 0; pi < 3; pi++) {
      const p = pan[pi], a = ex * Math.max(0, 1 - Math.abs(pm - pi));
      let lo, hi, ys = o.P;
      if (p.name === 'pressure') { lo = pLo; hi = pHi; } else if (p.name === 'energy') { lo = 0; hi = pHi; ys = o.loss; } else { lo = 0; hi = T.vHi; ys = o.v; }
      const ky = TR.ph / Math.max(1e-6, hi - lo), yOf = (v) => clamp(bot - (v - lo) * ky, G.top, bot);
      for (let t = 0; t < 3; t++) { setWords(p.ticks[t], lab(lo + ((hi - lo) * t) / 2)); setGeo(p.ticks[t], 'opacity', a); }
      if (a < 0.002) { setGeo(p.line, 'opacity', 0); setGeo(p.area, 'opacity', 0); setGeo(p.base, 'opacity', 0); setGeo(p.title, 'opacity', 0); for (const d of p.dots) setGeo(d, 'opacity', 0); continue; }
      const lb = p.lineBuf, ab = p.areaBuf;
      for (let i = 0; i <= N; i++) { const x = X(o.x[i]), y = yOf(ys[i]); lb[2 * i] = x; lb[2 * i + 1] = y; ab[2 * i] = x; ab[2 * i + 1] = y; }
      const yz = yOf(0);
      ab[2 * (N + 1)] = X(xb); ab[2 * (N + 1) + 1] = yz; ab[2 * (N + 2)] = X(xa); ab[2 * (N + 2) + 1] = yz;
      setPts(p.line, lb, N + 1, false); setPts(p.area, ab, N + 3, true);
      p.baseBuf[0] = X0; p.baseBuf[1] = yz; p.baseBuf[2] = TR.x1; p.baseBuf[3] = yz; setPts(p.base, p.baseBuf, 2, false);
      for (let k = 0; k < 5; k++) { setGeo(p.dots[k], 'cx', X(o.sites[k])); setGeo(p.dots[k], 'cy', yOf(ys[o.i[k]])); setGeo(p.dots[k], 'opacity', a); }
      for (const e of [p.base, p.area, p.line, p.title]) setGeo(e, 'opacity', a);
    }
    setGeo(key, 'opacity', ex); setGeo(note, 'opacity', ex);
    return o;
  }

  /** Sizes the words: fs (the card's size in these units), but a long line is held to what fits the picture's width. */
  function fitWords(fs) {
    for (const e of words) e.setAttribute('font-size', fs);
    const fitTo = (e, chars) => e.setAttribute('font-size', Math.min(fs, 300 / (chars * 0.6)));
    fitTo(key, KEY.length); fitTo(note, NOTE.length);
    for (const p of pan) fitTo(p.title, TITLES[p.name].length);
    return layout(fs);
  }
  return { svg, words, fit, paint, layout, fitWords };
}
