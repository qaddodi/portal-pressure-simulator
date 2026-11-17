// The stent's longitudinal traces (17 Nov 2026; the reviewer's view, /mnt/project-files/tips-geometry-mocks/tips-geometry-two-designs.html part 1, on the engine's numbers):
// the lumen from the portal vein to the IVC with five numbered pressure sites, and under it up to three panels on the same x: the static pressure (it dips where
// the lumen narrows and recovers part of it), the energy lost so far (it only rises) and the mean velocity. src/engine/stent-trace.js makes the curves; the solver is
// lumped, so the picture is a schematic of where each part of the drop happens (labelled so) and its ends are the engine's own: the PPG at the portal end, 0 at the IVC.
// One picture (a drawing of fixed pieces: 161-point curves, nothing made or taken away when the geometry changes), drawn on the GPU by tool-stent.js's createSvgGL.
// createTracePic(gid) → { svg, words, all, fit(T, out), paint(T, ex), layout(panels) }. T is the record paint reads (see TRACE_IN).
import { setGeo, setPts, setWords } from './svg-gl.js';
import { clamp } from './util.js';
import { profileAt } from '../engine/stent-geom.js';
import { stentTrace, makeTrace, TRACE_N } from '../engine/stent-trace.js';

export const TR = { x0: 26, x1: 314, cy: 33, pxMm: 1.9, badgeY: 9, badgeR: 7.5, py0: 62, pitch: 54, ph: 38, veinCm: 3 };
export const PANELS = ['pressure', 'energy', 'velocity'];
const TITLES = { pressure: 'Static pressure, mmHg', energy: 'Energy lost so far, mmHg', velocity: 'Mean velocity, cm/s' };
const KEY = '1 Portal  2 Inlet  3 Waist  4 Outlet  5 IVC';
const NOTE = 'Schematic: where each part of the drop happens';
const N = TRACE_N, NS = 33;
const LAB = Array.from({ length: 700 }, (_, i) => `${i - 100}`);
const lab = (v) => LAB[clamp(Math.round(v) + 100, 0, 699)];

/** The picture's height in units for n panels, and the viewBox text for it (made once each). */
export const traceH = (n) => TR.py0 + TR.pitch * (Math.max(1, n) - 1) + TR.ph + 40;
const VB = [0, 1, 2, 3].map((n) => `0 0 320 ${traceH(n)}`);
export const traceViewBox = (n) => VB[clamp(n, 1, 3)];

export function createTracePic(sv, gid, colourOf) {
  const rec = makeTrace(), PS = { sh: null, s: 0, site: 0 }, prof = (u) => profileAt(PS.sh, PS.s, PS.site, u);
  const strip = sv('path', { 'data-look': 'stent.tr.lumen', fill: `url(#${gid})` });
  const stripBuf = new Float64Array(2 * 2 * (N + 1));
  const stops = Array.from({ length: NS }, (_, i) => sv('stop', { offset: (i / (NS - 1)).toFixed(3), 'stop-color': '#888888' }));   // colour-exempt: first stops, written at the first paint
  const grad = sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: TR.x0, y1: 0, x2: TR.x1, y2: 0 }, stops);
  const siteBuf = [0, 1, 2, 3, 4].map(() => new Float64Array(4));
  const siteL = siteBuf.map(() => sv('path', { 'data-look': 'stent.tr.site' }));
  const badge = siteBuf.map(() => sv('circle', { 'data-look': 'stent.tr.badge', r: TR.badgeR, cy: TR.badgeY }));
  const badgeN = siteBuf.map((_, k) => sv('text', { 'data-look': 'stent.tr.badgeNum', y: TR.badgeY, 'text-anchor': 'middle' }));
  badgeN.forEach((e, k) => setWords(e, `${k + 1}`));
  const pan = PANELS.map((name, k) => ({
    name,
    base: sv('path', { 'data-look': 'stent.tr.axis' }), baseBuf: new Float64Array(4),
    area: sv('path', { 'data-look': `stent.tr.area.${name}` }), areaBuf: new Float64Array(2 * (N + 3)),
    line: sv('path', { 'data-look': `stent.tr.line.${name}` }), lineBuf: new Float64Array(2 * (N + 1)),
    dots: siteBuf.map(() => sv('circle', { 'data-look': `stent.tr.dot.${name}`, r: 3.2 })),
    title: sv('text', { 'data-look': 'stent.tr.title', x: TR.x0, 'text-anchor': 'start' }),
    hi: sv('text', { 'data-look': 'stent.cap', x: TR.x0 - 4, 'text-anchor': 'end' }), lo: sv('text', { 'data-look': 'stent.cap', x: TR.x0 - 4, 'text-anchor': 'end' }),
    on: 1, slot: k, lo_: 0, hi_: 1,
  }));
  pan.forEach((p) => setWords(p.title, TITLES[p.name]));
  const key = sv('text', { 'data-look': 'stent.cap', x: 160, 'text-anchor': 'middle' }), note = sv('text', { 'data-look': 'stent.cap', x: 160, 'text-anchor': 'middle' });
  setWords(key, KEY); setWords(note, NOTE);
  const kids = [strip, ...siteL, ...badge, ...badgeN, ...pan.flatMap((p) => [p.base, p.area, p.line, ...p.dots, p.title, p.hi, p.lo]), key, note];
  const svg = sv('svg', { class: 'gl-pic', viewBox: VB[3], role: 'img' }, sv('defs', {}, grad), ...kids);
  const words = [...badgeN, ...pan.flatMap((p) => [p.title, p.hi, p.lo]), key, note];
  let nOn = 3;

  /** Which panels show (in their fixed order), at the slots from the top; the pictures' size follows. */
  function layout(panels) {
    let k = 0;
    for (const p of pan) { p.on = panels.includes(p.name) ? 1 : 0; p.slot = p.on ? k++ : 0; }
    nOn = Math.max(1, k);
    setGeo(svg, 'viewBox', VB[nOn]);
    return nOn;
  }

  function run(T) {
    PS.sh = T.sh; PS.s = T.s; PS.site = T.site;
    const len = T.sh.len, xa = -TR.veinCm, xb = len + TR.veinCm;
    return stentTrace({ len, q: (Math.abs(T.flowLpm) * 1000) / 60, d: T.d, prof, xa, xb, tract: T.tract, wall: T.wall, entry: T.ends, jet: T.jet, inlet: 0, ppg: T.ppg, dp: T.dp }, rec);
  }

  /** The panels' ranges for the numbers T (nice round ends, so a range moves in steps the follower glides): writes pHi, pLo, vHi into out. */
  function fit(T, out) {
    const o = run(T);
    let mn = Infinity, mx = 0;
    for (let i = 0; i <= N; i++) { if (o.P[i] < mn) mn = o.P[i]; if (o.v[i] > mx) mx = o.v[i]; }
    out.pHi = Math.max(8, Math.ceil((T.ppg - 1e-9) / 4) * 4);
    out.pLo = mn < -0.05 ? Math.floor(mn / 2) * 2 : 0;
    out.vHi = Math.max(100, Math.ceil(mx / 50) * 50);
    return out;
  }

  /** Draws the traces for T (the numbers: sh, s, site, d, flowLpm, tract, wall, ends, jet, ppg, dp; ranges pHi, pLo, vHi) at the strength ex. */
  function paint(T, ex) {
    const o = run(T), len = T.sh.len, xa = -TR.veinCm, xb = len + TR.veinCm, kx = (TR.x1 - TR.x0) / (xb - xa), X = (x) => TR.x0 + (x - xa) * kx;
    // the lumen: the trace's own diameters, so it is the very lumen the curves belong to
    const sb = stripBuf;
    for (let i = 0; i <= N; i++) {
      const x = X(o.x[i]), half = (o.D[i] * TR.pxMm) / 2, q = 2 * N + 1 - i;
      sb[2 * i] = x; sb[2 * i + 1] = TR.cy - half; sb[2 * q] = x; sb[2 * q + 1] = TR.cy + half;
    }
    setPts(strip, sb, 2 * (N + 1), true);
    for (let j = 0; j < NS; j++) setGeo(stops[j], 'stop-color', colourOf(o.v[Math.round((j * N) / (NS - 1))] * T.kd));
    const pLo = T.pLo, pHi = T.pHi, last = TR.py0 + TR.pitch * (nOn - 1) + TR.ph;
    for (let k = 0; k < 5; k++) {
      const x = X(o.sites[k]), sbf = siteBuf[k];
      sbf[0] = x; sbf[1] = TR.badgeY + TR.badgeR; sbf[2] = x; sbf[3] = last; setPts(siteL[k], sbf, 2, false);
      setGeo(badge[k], 'cx', x); setGeo(badgeN[k], 'x', x);
      setGeo(siteL[k], 'opacity', ex); setGeo(badge[k], 'opacity', ex); setGeo(badgeN[k], 'opacity', ex);
    }
    setGeo(strip, 'opacity', ex);
    for (const p of pan) {
      const a = ex * p.on;
      let lo, hi, ys = o.P;
      if (p.name === 'pressure') { lo = pLo; hi = pHi; } else if (p.name === 'energy') { lo = 0; hi = pHi; ys = o.loss; } else { lo = 0; hi = T.vHi; ys = o.v; }
      const top = TR.py0 + TR.pitch * p.slot, base = top + TR.ph, ky = TR.ph / Math.max(1e-6, hi - lo), yOf = (v) => clamp(base - (v - lo) * ky, top, base);
      const lb = p.lineBuf, ab = p.areaBuf;
      for (let i = 0; i <= N; i++) { const x = X(o.x[i]), y = yOf(ys[i]); lb[2 * i] = x; lb[2 * i + 1] = y; ab[2 * i] = x; ab[2 * i + 1] = y; }
      const yz = yOf(0);
      ab[2 * (N + 1)] = X(xb); ab[2 * (N + 1) + 1] = yz; ab[2 * (N + 2)] = X(xa); ab[2 * (N + 2) + 1] = yz;
      setPts(p.line, lb, N + 1, false); setPts(p.area, ab, N + 3, true);
      p.baseBuf[0] = TR.x0; p.baseBuf[1] = yz; p.baseBuf[2] = TR.x1; p.baseBuf[3] = yz; setPts(p.base, p.baseBuf, 2, false);
      for (let k = 0; k < 5; k++) { setGeo(p.dots[k], 'cx', X(o.sites[k])); setGeo(p.dots[k], 'cy', yOf(ys[o.i[k]])); setGeo(p.dots[k], 'opacity', a); }
      setGeo(p.title, 'y', top - 9); setGeo(p.hi, 'y', top + 1); setGeo(p.lo, 'y', base);
      setWords(p.hi, lab(hi)); setWords(p.lo, lab(lo));
      for (const e of [p.base, p.area, p.line, p.title, p.hi, p.lo]) setGeo(e, 'opacity', a);
    }
    const yk = last + 12, yn = last + 24;
    setGeo(key, 'y', yk); setGeo(note, 'y', yn); setGeo(key, 'opacity', ex); setGeo(note, 'opacity', ex);
    return o;
  }

  return { svg, words, fit, paint, layout };
}
