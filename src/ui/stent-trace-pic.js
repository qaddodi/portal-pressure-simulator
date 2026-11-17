// The stent's longitudinal traces (17 Nov 2026; the reviewer's view, /mnt/project-files/tips-geometry-mocks/tips-geometry-two-designs.html part 1, on the engine's numbers):
// ONE chart at a time, on the same x as the side view above it (the stent's two ends are the drawing's; the five numbered pressure sites are marks on the drawing and digits under the chart; the card's lens
// crossfades the charts, a chart of a fixed height at every width): the static pressure (it dips where the lumen narrows and recovers part of it), the energy lost so
// far (it only rises) and the mean velocity. src/engine/stent-trace.js makes the curves; the solver is
// lumped, so the picture is a schematic of where each part of the drop happens (labelled so) and its ends are the engine's own: the PPG at the portal end, 0 at the IVC.
// One picture (a drawing of fixed pieces: 161-point curves, nothing made or taken away when the geometry changes), drawn on the GPU by tool-stent.js's createSvgGL.
// createTracePic(sv) → { svg, words, fit(T, out), paint(T, ex, pm), layout(fs) → height, fitWords(fs) }. T is the record paint reads; pm the chart shown (0 pressure, 1 energy, 2 velocity; between two, both crossfaded).
import { setGeo, setPts, setWords } from './svg-gl.js';
import { clamp } from './util.js';
import { profileAt } from '../engine/stent-geom.js';
import { stentTrace, makeTrace, TRACE_N } from '../engine/stent-trace.js';

/** The sample index of fraction u along a stent of length len cm in the trace (the gates' places on the chart). */
export const gateIndex = (u, len) => clamp(Math.round((TRACE_N * (u * len + TR.veinCm)) / (len + 2 * TR.veinCm)), 0, TRACE_N);
export const TR = { x1: 316, veinCm: 3, ph: 92 };
/** The place of x cm along the trace on the side view's x (units): the stent's own length between its two ends px0 and px1, and each vein, cut where the picture ends, over what is left either side:
 *  the left one from xl (where the chart's ticks end) to px0, the right one from px1 to the chart's right edge. The staircase and the side view's site marks use the same map, so a place is one x on all three. */
export const xAt = (cm, len, px0, px1, xl) => (cm <= 0 ? xl + ((px0 - xl) * (cm + TR.veinCm)) / TR.veinCm : cm >= len ? px1 + ((TR.x1 - px1) * (cm - len)) / TR.veinCm : px0 + ((px1 - px0) * cm) / Math.max(1e-9, len));
/** The picture's height in units at the usual size of words (the picture itself follows the words' size: layout(fs)); one chart is in view at a time whatever panels were asked for, so n is ignored. */
export const traceH = () => 204;
export const PANELS = ['pressure', 'energy', 'velocity'];
const TITLES = { pressure: 'Pressure, mmHg (absolute)', energy: 'Energy lost so far, mmHg', velocity: 'Mean velocity, cm/s' };
const KEY = '1 Portal  2 Inlet  3 Waist  4 Outlet  5 IVC';
const N = TRACE_N;
const LAB = Array.from({ length: 700 }, (_, i) => `${i - 100}`);
const TEN = Array.from({ length: 1000 }, (_, i) => (i / 10).toFixed(1));
const NICE_V = [20, 40, 60, 80, 100, 150, 200, 300, 400, 600];   // (the velocity axis's tops: the first that holds the data, so a slow trace is not a flat line along a 0 to 100 axis)
const lab = (v) => LAB[clamp(Math.round(v) + 100, 0, 699)];

const PS = { sh: null, s: 0, site: 0 }, prof = (u) => profileAt(PS.sh, PS.s, PS.site, u);
/** The trace for the numbers T (sh, s, site, d, flowLpm, tract, wall, ends, jet, ppg, dp), written into rec (a makeTrace() record the caller keeps). */
export function traceFor(T, rec) {
  PS.sh = T.sh; PS.s = T.s; PS.site = T.site;
  const len = T.sh.len, xa = -TR.veinCm, xb = len + TR.veinCm;
  return stentTrace({ len, q: (Math.abs(T.flowLpm) * 1000) / 60, d: T.d, prof, xa, xb, tract: T.tract, wall: T.wall, entry: T.ends, jet: T.jet, inlet: 0, ppg: T.ppg, dp: T.dp }, rec);
}

export function createTracePic(sv) {
  const rec = makeTrace();
  let X0 = 24;
  const siteBuf = [0, 1, 2, 3, 4].map(() => new Float64Array(4));
  const siteL = siteBuf.map(() => sv('path', { 'data-look': 'stent.tr.site' }));
  const siteN = siteBuf.map((_, k) => sv('text', { 'data-look': 'stent.tr.siteNum', 'text-anchor': 'middle' }));
  siteN.forEach((e, k) => setWords(e, `${k + 1}`));
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
  const ivcT = sv('text', { 'data-look': 'stent.cap', x: TR.x1, 'text-anchor': 'end' });   // (the IVC's level on the pressure chart: the one zero the gates and this chart share)
  const key = sv('text', { 'data-look': 'stent.cap', x: 160, 'text-anchor': 'middle' });
  setWords(key, KEY);
  const kids = [...grid, ...siteL, ...siteN, ...pan.flatMap((p) => [p.base, p.area, p.line, ...p.dots, p.title, ...p.ticks]), ivcT, key];
  const svg = sv('svg', { class: 'gl-pic', viewBox: '0 0 320 200', role: 'img' }, ...kids);
  const words = [...siteN, ...pan.flatMap((p) => [p.title, ...p.ticks]), ivcT, key];
  const G = { fs: 11, top: 24, base: 116, h: 150, title: 8, digits: 126 }, LAST = { lo: 0, hi: 1, base: 0, off: 0 };
  const IVCW = new Map();   // alloc-rare: the IVC's words, made when first met
  const ivcWords = (v) => { const k = Math.round(v * 10); let w = IVCW.get(k); if (!w) { w = `IVC ${TEN[clamp(k, 0, 999)]}`; IVCW.set(k, w); } return w; };

  /** The picture's rows follow the words' size fs (in these units, so a narrower picture does not crowd them): the chart's gutter for its ticks, the title above it, the key
   *  and the note under it. Returns the picture's height in units. */
  function layout(fs) {
    G.fs = fs;
    X0 = 6 + fs * 0.6 * 3 + 2;
    G.title = fs * 0.5 + 2;
    G.top = G.title + fs * 0.5 + 6;
    G.base = G.top + TR.ph;
    G.digits = G.base + fs * 0.9 + 2;
    const yk = G.digits + fs * 1.4;
    G.h = yk + fs * 0.8 + 3;
    setGeo(key, 'y', yk);
    for (const e of siteN) setGeo(e, 'y', G.digits);
    for (const p of pan) {
      setGeo(p.title, 'x', X0); setGeo(p.title, 'y', G.title);
      for (let t = 0; t < 3; t++) { setGeo(p.ticks[t], 'x', X0 - 4); setGeo(p.ticks[t], 'y', G.base - (TR.ph * t) / 2); }
    }
    for (let t = 0; t < 3; t++) { const gb = gridBuf[t], y = G.base - (TR.ph * t) / 2; gb[0] = X0; gb[1] = y; gb[2] = TR.x1; gb[3] = y; setPts(grid[t], gb, 2, false); }
    setGeo(svg, 'viewBox', `0 0 320 ${G.h.toFixed(1)}`);
    return G.h;
  }

  const run = (T) => traceFor(T, rec);

  /** The charts' ranges for the numbers T (nice round ends, so a range moves in steps the follower glides): writes pHi, pLo, vHi into out. */
  function fit(T, out) {
    const o = run(T);
    let mn = Infinity, mx = 0;
    for (let i = 0; i <= N; i++) { if (o.P[i] < mn) mn = o.P[i]; if (o.v[i] > mx) mx = o.v[i]; }
    // (absolute pressure: the IVC's plus the trace's; the velocity axis is the first round top that holds the trace)
    mn += T.ivc;
    out.pHi = Math.max(8, Math.ceil((T.ppg + T.ivc - 1e-9) / 4) * 4);
    out.pLo = mn < -0.05 ? Math.floor(mn / 2) * 2 : 0;
    out.vHi = NICE_V.find((t) => t >= mx * 1.08) || Math.ceil((mx * 1.08) / 100) * 100;
    return out;
  }

  /** Draws the charts for T (the numbers: sh, s, site, d, flowLpm, tract, wall, ends, jet, ppg, dp; ranges pHi, pLo, vHi) at the strength ex, chart pm. */
  function paint(T, ex, pm) {
    const o = run(T), len = T.sh.len, X = (cm) => xAt(cm, len, T.px0, T.px1, X0);
    const pLo = T.pLo, pHi = T.pHi, bot = G.base;
    for (let k = 0; k < 5; k++) {
      const x = X(o.sites[k]), sbf = siteBuf[k];
      sbf[0] = x; sbf[1] = G.top; sbf[2] = x; sbf[3] = bot; setPts(siteL[k], sbf, 2, false);
      setGeo(siteN[k], 'x', x);
      setGeo(siteL[k], 'opacity', ex); setGeo(siteN[k], 'opacity', ex);
    }
    for (const g of grid) setGeo(g, 'opacity', ex);
    for (let pi = 0; pi < 3; pi++) {
      const p = pan[pi], a = ex * Math.max(0, 1 - Math.abs(pm - pi));
      let lo, hi, ys = o.P, off = 0;
      if (p.name === 'pressure') { lo = pLo; hi = pHi; off = T.ivc; } else if (p.name === 'energy') { lo = 0; hi = pHi; ys = o.loss; } else { lo = 0; hi = T.vHi; ys = o.v; }
      const ky = TR.ph / Math.max(1e-6, hi - lo), yOf = (v) => clamp(bot - (v - lo) * ky, G.top, bot);
      for (let t = 0; t < 3; t++) { setWords(p.ticks[t], lab(lo + ((hi - lo) * t) / 2)); setGeo(p.ticks[t], 'opacity', a); }
      if (a < 0.002) {
        if (p.name === 'pressure') setGeo(ivcT, 'opacity', 0); setGeo(p.line, 'opacity', 0); setGeo(p.area, 'opacity', 0); setGeo(p.base, 'opacity', 0); setGeo(p.title, 'opacity', 0); for (const d of p.dots) setGeo(d, 'opacity', 0); continue; }
      const lb = p.lineBuf, ab = p.areaBuf;
      for (let i = 0; i <= N; i++) { const x = X(o.x[i]), y = yOf(ys[i] + off); lb[2 * i] = x; lb[2 * i + 1] = y; ab[2 * i] = x; ab[2 * i + 1] = y; }
      const yz = yOf(off);
      if (p.name === 'pressure') { setGeo(ivcT, 'y', clamp(yz - G.fs * 0.7, G.top + G.fs * 0.5, bot)); setWords(ivcT, ivcWords(T.ivc)); setGeo(ivcT, 'opacity', a); LAST.lo = lo; LAST.hi = hi; LAST.base = bot; LAST.off = off; }
      ab[2 * (N + 1)] = X(len + TR.veinCm); ab[2 * (N + 1) + 1] = yz; ab[2 * (N + 2)] = X(-TR.veinCm); ab[2 * (N + 2) + 1] = yz;
      setPts(p.line, lb, N + 1, false); setPts(p.area, ab, N + 3, true);
      p.baseBuf[0] = X0; p.baseBuf[1] = yz; p.baseBuf[2] = TR.x1; p.baseBuf[3] = yz; setPts(p.base, p.baseBuf, 2, false);
      for (let k = 0; k < 5; k++) { setGeo(p.dots[k], 'cx', X(o.sites[k])); setGeo(p.dots[k], 'cy', yOf(ys[o.i[k]] + off)); setGeo(p.dots[k], 'opacity', a); }
      for (const e of [p.base, p.area, p.line, p.title]) setGeo(e, 'opacity', a);
    }
    setGeo(key, 'opacity', ex);
    return o;
  }

  /** Sizes the words: fs (the card's size in these units), but a long line is held to what fits the picture's width. */
  function fitWords(fs) {
    for (const e of words) e.setAttribute('font-size', fs);
    const fitTo = (e, chars) => e.setAttribute('font-size', Math.min(fs, 300 / (chars * 0.6)));
    fitTo(key, KEY.length);
    for (const p of pan) fitTo(p.title, TITLES[p.name].length);
    return layout(fs);
  }
  /** The pressure chart's scale as last drawn: what a y on it reads (mmHg, absolute), for a test and for anything that must agree with it. */
  const pressureAt = (y) => LAST.lo + ((LAST.base - y) / TR.ph) * (LAST.hi - LAST.lo);
  return { svg, words, fit, paint, layout, fitWords, height: () => G.h, pressureAt, xl: () => X0 };
}
