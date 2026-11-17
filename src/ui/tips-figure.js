// The TIPS figure (17 Nov 2026; Mohammad approved the mock /mnt/project-files/tips-geometry-mocks/tips-cards-elegant.html: "Do it exactly like this please
// with all the animations"). One stent drawing, to scale, and (in Tests › IR › TIPS) one chart under it on the same x:
//   the stent   the lumen to scale both ways (a fixed px per cm for the card's width, the radius the same scale), the veins either side, the device as the figure
//               draws it (stent-mesh.js), the waist's bracket and the end stenosis's lumen above it, the three Doppler gates' numbers under it. The lens colours
//               the lumen: the scanner's velocity (the figure's ramp against the stent's usual range) or the pressure (the figure's pressure ramp, absolute).
//               The stent's two ends carry their numbers too, under them as the gates' (Mohammad, 17 Nov: "call out the numbers on the beginning and end").
//   the chart   Velocity: the scanner's velocity along the path, the usual range as a band over the stent, a dot at each gate. Pressure: the pressure along
//               it (no dashed energy line: Mohammad, 17 Nov, "Remove dashed line"), and two brackets that are never the same thing: the PPG (portal vein to
//               IVC, at the chart's left edge, where it shows best: Mohammad, 17 Nov) and the drop across the stent (at its hepatic end).
// The vessel card's own picture is the stent alone (no words), the same piece.
// Units are the card's px (the picture's viewBox is its box), so the words are the label size at every width. Drawn on the GPU (svg-gl.js): each frame of a glide
// a number written on a fixed piece, nothing made or taken away. The numbers are the engine's (the live frame's metrics, tool-stent.js readStent): the
// gates' numbers are the Doppler card's, the PPG and "Across stent" the readings', the curves stent-trace.js's schematic of where each part is taken.

import { h, clamp } from './util.js';
import { store } from './store.js';
import { frameFor, cancelFrame, frameAnimating, easeNow } from './frame.js';
import { createSvgGL, svgModel, setWords, setGeo, setPts, setPolys } from './svg-gl.js';
import { flattenPath } from './shape-gl.js';
import { stentCutD, bareOf } from './stent-mesh.js';
import { reduceMotionMQ } from './motion.js';
import { readMetric } from './layout-snap.js';
import { pressureColor } from './colormap.js';
import { stentNormal } from './velNormal.js';
import { geomFix, geomOf, profileAt, waistSpan, endSpan } from '../engine/stent-geom.js';
import { STENT_SITES, stentSite } from '../engine/topology.js';
import { createFollowN, readStent, stentColour, localVelocity, openVelocity, scanK, stentOutline, ten, int, N_PROFILE } from './tool-stent.js';
import { traceFor, gateIndex, TR } from './stent-trace-pic.js';
import { makeTrace, TRACE_N } from '../engine/stent-trace.js';

const nextFrame = frameFor('tips-figure');
const sv = svgModel;

/** How much of each vein is shown either side of the stent (cm) and the length the scale is set for (cm): the stent spans the same width whatever its length. */
export const VEIN_CM = 1.3, REF_CM = 8;
/** The Doppler's three gates, as fractions of the stent (the engine's own: topology.js STENT_SITES). */
export const GATES = [STENT_SITES.proximal, STENT_SITES.mid, STENT_SITES.distal];
/** The chart's gutter for its tick numbers (px), and its height (px) on a narrow and a wide card. */
const HEAD = 1.2;
export const GUTTER = 24, CHART_H = 140, CHART_H_WIDE = 150, WIDE = 460;

/** The figure's rows for a card W px wide: px a cm along, px a mm across, the stent's two ends, the axis, the rows of words and the heights. Written into o. */
export function figLayout(W, { labels = true, chart = false } = {}, o = {}) {
  o.W = W;
  o.pxCm = W / (REF_CM + 2 * VEIN_CM); o.k = o.pxCm / 10;
  o.x0 = VEIN_CM * o.pxCm; o.x1 = W - VEIN_CM * o.pxCm;
  o.pvH = 12 * o.k; o.hvH = 13 * o.k;   // (the portal vein and the hepatic vein drawn 12 and 13 mm wide, to the stent's scale)
  const half = o.hvH / 2;
  o.labY = labels ? 9 : 0; o.brY = labels ? 21 : 0;
  o.cy = (labels ? 26 : 1) + half;
  o.gateY = o.cy + half + 15;
  o.heroH = labels ? o.gateY + 10 : o.cy + half + 1;
  o.chart = !!chart;
  o.chH = chart ? (W > WIDE ? CHART_H_WIDE : CHART_H) : 0;
  o.cTop = o.heroH + (chart ? 6 : 0);
  o.titleY = o.cTop + 6; o.plotTop = o.cTop + 18; o.plotBot = o.cTop + o.chH - 4;
  o.h = o.heroH + (chart ? 6 + o.chH : 0);
  return o;
}
/** The x of a place cm along the path (the stent runs 0 to len): the stent between its two ends, each vein squeezed into what is left either side (the trace's
 *  veins are TR.veinCm long; only the chart draws past the stent's ends, from its gutter g). */
export const xOf = (cm, len, L, g = 0) => (cm <= 0 ? L.x0 + ((L.x0 - g) * Math.max(-TR.veinCm, cm)) / TR.veinCm : cm >= len ? L.x1 + ((L.W - L.x1) * Math.min(TR.veinCm, cm - len)) / TR.veinCm : L.x0 + ((L.x1 - L.x0) * cm) / Math.max(1e-9, len));
/** The trace's sample at x px (the inverse of xOf with no gutter: the stent's own stretch, each vein squeezed into its side). */
export function sampleAt(x, len, L) {
  const cm = x <= L.x0 ? ((x - L.x0) / Math.max(1e-6, L.x0)) * TR.veinCm : x >= L.x1 ? len + ((x - L.x1) / Math.max(1e-6, L.W - L.x1)) * TR.veinCm : ((x - L.x0) / Math.max(1e-6, L.x1 - L.x0)) * len;
  return clamp(Math.round((TRACE_N * (cm + TR.veinCm)) / (len + 2 * TR.veinCm)), 0, TRACE_N);
}
/** The velocity axis's top (cm/s): the first that holds the trace; its three gridlines are its thirds, always round numbers. */
export const V_TOPS = [150, 300, 600, 900, 1200, 1800, 2400, 3000, 4500];
export const vTop = (mx) => V_TOPS.find((t) => t >= mx * 1.08) || 4500;
/** The pressure axis's top (mmHg, absolute): the next multiple of 6 over the portal vein's, so its thirds read 6, 12, 18 or the like. */
export const pTop = (pv) => clamp(Math.ceil((pv + 1 + 1e-9) / 6) * 6, 12, 60);

// The words a figure prints that are made of a number: made once each as they first show (a glide prints many; a frame makes none it printed before).
const memo = (fmt) => { const m = new Map(); return (v) => { const k = Math.round(v * 10); let w = m.get(k); if (w === undefined) { if (m.size > 2000) m.clear(); w = fmt(k / 10); m.set(k, w); } return w; }; };   // alloc-rare: a word made the first time its number shows
const waistWord = (() => { const m = new Map(); return (dmm, lcm) => { const k = Math.round(dmm * 10) * 1000 + Math.round(lcm * 10); let w = m.get(k); if (w === undefined) { if (m.size > 2000) m.clear(); w = `Waist ${ten(dmm)} mm × ${ten(lcm)} cm`; m.set(k, w); } return w; }; })();   // alloc-rare: made when first met
const mmWord = memo((v) => `${ten(v)} mm`);
const dpWord = memo((v) => `Across stent ${ten(v)}`);
const ppgWord = memo((v) => `PPG ${ten(v)}`);
const usualWord = (() => { const m = new Map(); return (lo, hi) => { const k = Math.round(lo) * 10000 + Math.round(hi); let w = m.get(k); if (w === undefined) { w = `usual ${Math.round(lo)}–${Math.round(hi)}`; m.set(k, w); } return w; }; })();   // alloc-rare: made when first met

// The follower's channels, each over its scale so one jump test means the same for all.
const CH = { ex: 0, s: 1, len: 2, waist: 3, trans: 4, site: 5, d: 6, flow: 7, g0: 8, g1: 9, g2: 10, tract: 11, wall: 12, ends: 13, jet: 14, out: 15, ivc: 16, red: 17, cm: 18, vHi: 19, pHi: 20 };
const NCH = 21;
const SCALE = [1, 1, 10, 10, 10, 1, 12, 6, 400, 400, 400, 16, 16, 16, 16, 16, 12, 1, 1, 600, 24];
const N_STOPS = 33;
const IDS = { TIPS: 'tips', DIPS: 'dips' };
const FADED = (...xs) => xs.flat();   // alloc-rare: once per figure made
const WIRES = ['backBare', 'backCov', 'frontBare', 'frontCov', 'glint', 'band', 'tab'];

/**
 * createTipsFigure({ id, labels, chart }) → { el, setStent(id), setLens('velocity' | 'pressure'), lens(), update(frame), dispose() }.
 * labels: the words on the stent (the gates, the waist, the veins' names); chart: the chart under it (Tests › IR › TIPS). The vessel card's is the stent alone.
 */
export function createTipsFigure({ id: id0 = 'TIPS', labels = true, chart = false } = {}) {
  let id = id0 === 'DIPS' ? 'DIPS' : 'TIPS', lens = 'velocity', have = false, hasShown = false, raf = 0, anim = false, W = 0;
  const L = figLayout(320, { labels, chart });
  const R = {};
  const gid = `tf${Math.random().toString(36).slice(2, 8)}`;
  // ── the stent ──
  const stops = Array.from({ length: N_STOPS }, (_, i) => sv('stop', { offset: (i / (N_STOPS - 1)).toFixed(3), 'stop-color': '#888888' }));   // colour-exempt: a gradient's first stops, written at the first paint
  const stopsP = Array.from({ length: N_STOPS }, (_, i) => sv('stop', { offset: (i / (N_STOPS - 1)).toFixed(3), 'stop-color': '#888888' }));   // colour-exempt: a gradient's first stops, written at the first paint
  const grad = sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 320, y2: 0 }, stops);
  const gradP = sv('linearGradient', { id: `${gid}p`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 320, y2: 0 }, stopsP);
  const pvR = sv('rect', { 'data-look': 'stent.vein.p', x: 0, y: 0, width: 1, height: 1 }), hvR = sv('rect', { 'data-look': 'stent.vein.h', x: 0, y: 0, width: 1, height: 1 });
  const pvQ = sv('rect', { 'data-look': 'tf.vein.pre', fill: `url(#${gid}p)`, x: 0, y: 0, width: 1, height: 1 }), hvQ = sv('rect', { 'data-look': 'tf.vein.pre', fill: `url(#${gid}p)`, x: 0, y: 0, width: 1, height: 1 });
  const OUTL = 2 * (N_PROFILE + 1), lumBuf = new Float64Array(2 * OUTL);
  const lumV = sv('path', { 'data-look': 'stent.lumen', fill: `url(#${gid})` }), lumP = sv('path', { 'data-look': 'stent.lumen', fill: `url(#${gid}p)` });
  const grf = sv('path', { 'data-look': 'tf.wall' });   // the cover's two bands, one over each wall of the cut stent (never across the lumen)
  const wires = WIRES.map((k) => sv('path', { 'data-look': `stent.wire.${k}` }));
  // the words on the stent: the waist's bracket and its lumen and length, the end stenosis's lumen, the veins' names, the gates and their unit
  const wBuf = new Float64Array(8), wBr = sv('path', { 'data-look': 'stent.dim' }), wT = sv('text', { 'data-look': 'tf.word', 'text-anchor': 'middle', 'font-size': 12 });
  const eBuf = new Float64Array(8), eBr = sv('path', { 'data-look': 'stent.dim' }), eT = sv('text', { 'data-look': 'tf.word', 'text-anchor': 'middle', 'font-size': 12 });
  // (the veins' names sit in the veins, at the stent's two ends, and show on every card's picture, the vessel card's too: RPV and RHV, the DIPS's far end the IVC)
  const pvT = sv('text', { 'data-look': 'tf.vein.name', 'text-anchor': 'start', 'font-size': 11 }), hvT = sv('text', { 'data-look': 'tf.vein.name', 'text-anchor': 'end', 'font-size': 11 });
  const tBuf = [0, 1, 2].map(() => new Float64Array(4)), ticks = tBuf.map(() => sv('path', { 'data-look': 'stent.gate.tick' }));
  const numsV = [0, 1, 2].map(() => sv('text', { 'data-look': 'tf.num', 'text-anchor': 'middle', 'font-size': 12 }));
  const numsP = [0, 1, 2].map(() => sv('text', { 'data-look': 'tf.num', 'text-anchor': 'middle', 'font-size': 12 }));
  // the stent's inflow and outflow: a tick and a number at each end, in the lens's unit, where the unit word stood (the chart's title under it names the unit)
  const xBuf = [0, 1].map(() => new Float64Array(4)), xTicks = xBuf.map(() => sv('path', { 'data-look': 'stent.gate.tick' }));
  const endV = [0, 1].map(() => sv('text', { 'data-look': 'tf.num', 'text-anchor': 'middle', 'font-size': 12 }));
  const endP = [0, 1].map(() => sv('text', { 'data-look': 'tf.num', 'text-anchor': 'middle', 'font-size': 12 }));
  const veinWords = [pvT, hvT];
  const heroWords = [wBr, wT, eBr, eT, ...ticks, ...numsV, ...numsP, ...xTicks, ...endV, ...endP];
  // ── the chart ──
  const gridBuf = [0, 1, 2, 3].map(() => new Float64Array(4)), grid = gridBuf.map((_, i) => sv('path', { 'data-look': i ? 'stent.tr.axis' : 'stent.tr.zero' }));
  const tickV = [0, 1, 2].map(() => sv('text', { 'data-look': 'stent.cap', 'text-anchor': 'start', 'font-size': 11 }));
  const tickP = [0, 1, 2].map(() => sv('text', { 'data-look': 'stent.cap', 'text-anchor': 'start', 'font-size': 11 }));
  const titleV = sv('text', { 'data-look': 'stent.cap', 'text-anchor': 'start', 'font-size': 11 }), titleP = sv('text', { 'data-look': 'stent.cap', 'text-anchor': 'start', 'font-size': 11 });
  setWords(titleV, 'Peak velocity, cm/s'); setWords(titleP, 'Pressure, mmHg');
  const band = sv('rect', { 'data-look': 'tf.band', x: 0, y: 0, width: 1, height: 1 }), bandT = sv('text', { 'data-look': 'stent.cap', 'text-anchor': 'end', 'font-size': 11 });
  const NT = TRACE_N + 1;
  const vLineBuf = new Float64Array(2 * NT), vAreaBuf = new Float64Array(2 * (NT + 2));
  const vArea = sv('path', { 'data-look': 'tf.area' }), vLine = sv('path', { 'data-look': 'tf.line' });
  const vDots = [0, 1, 2].map(() => sv('circle', { 'data-look': 'tf.dot', r: 3.2, cx: 0, cy: 0 }));
  const pLineBuf = new Float64Array(2 * NT), pLine = sv('path', { 'data-look': 'tf.line' });
  const gdBuf = new Float64Array(10), guide = sv('path', { 'data-look': 'stent.drop.guide' });
  const sbBuf = new Float64Array(8), sBr = sv('path', { 'data-look': 'tf.brk.stent' }), sT = sv('text', { 'data-look': 'tf.lab.stent', 'text-anchor': 'end', 'font-size': 12 });
  const pbBuf = new Float64Array(8), pBr = sv('path', { 'data-look': 'tf.brk.ppg' }), pT = sv('text', { 'data-look': 'tf.lab.ppg', 'text-anchor': 'start', 'font-size': 12 });
  const velKids = [band, bandT, vArea, vLine, ...vDots, titleV, ...tickV], preKids = [pLine, guide, sBr, sT, pBr, pT, titleP, ...tickP];
  const pic = sv('svg', { class: 'gl-pic', viewBox: '0 0 320 100', role: 'img' },
    sv('defs', {}, grad, gradP), pvR, hvR, pvQ, hvQ, lumV, lumP, grf, ...wires, ...veinWords, ...(labels ? heroWords : []), ...(chart ? [...grid, ...velKids, ...preKids] : []));
  const stage = h('div', { class: 'gl-stage tf-stage' }, pic);
  const el = h('div', { class: `tf${chart ? ' tf-chart' : ''}${labels ? '' : ' tf-bare'}` }, stage);
  // Every piece whose strength the figure writes holds one from the start: the look reads a piece's opacity live only when it was there as the look was made
  // (chart-looks/resolve.js '@opacity'), else the two lenses' words were drawn on top of each other (the preview, 17 Nov).
  for (const e of FADED(pvQ, hvQ, lumV, lumP, grf, wires, veinWords, heroWords, grid, velKids, preKids)) setGeo(e, 'opacity', 0);
  const gl = createSvgGL(stage);

  // ── what it follows ──
  const fol = createFollowN(NCH), goal = new Float64Array(NCH), GEO = { len: 8, waist: 1, trans: 0, red: 0 }, fix = { len: 8, waist: 1, trans: 0, red: 0 };
  const rec = makeTrace(), T = { sh: fix, s: 0, site: 0, d: 10, flowLpm: 0, tract: 0, wall: 0, ends: 0, jet: 0, ppg: 0, dp: 0 };
  const SPW = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 }, SPE = { c: 0, a0: 0, a1: 0, b1: 0, b0: 0 }, MESH = { cy: 0, x0: 0, dPx: 0, s: 0, sh: fix, site: 0, L: 1 };
  const meshKey = new Float64Array(11), CUT = { t: 1.6, step: 6, ampB: 3, ampC: 2 };
  const animating = (on) => { if (anim !== on) { anim = on; frameAnimating('tips-figure', on); } };
  const kind = () => IDS[id];

  function read(live) {
    const src = live || store.get().frame;
    have = !!readStent(src, id, R);
    const prm = store.get().params, e = kind();
    const own = have && R.gLen != null && R.dOpen > 0;
    const g = own ? geomFix({ len: R.gLen, waist: R.gWaist, trans: R.gTrans, red: R.gRed || 0 }, e, GEO) : geomOf(prm, id, e, GEO);
    const d = own ? R.dOpen : prm?.[e]?.d > 0 ? prm[e].d : 10;
    const s = own && R.end != null ? clamp(R.end, 0, 1) : clamp(1 - (1 - (+prm?.stenosis?.[id] || 0)) * (1 - (+prm?.thrombus?.[id] || 0)), 0, 1);
    const site = own && R.site != null ? (typeof R.site === 'string' ? STENT_SITES[R.site] : R.site) : STENT_SITES[stentSite(prm, id)];
    const G = goal;
    G[CH.ex] = have ? 1 : 0;
    G[CH.s] = s; G[CH.len] = g.len / SCALE[CH.len]; G[CH.waist] = g.waist / SCALE[CH.waist]; G[CH.trans] = g.trans / SCALE[CH.trans]; G[CH.red] = g.red || 0; G[CH.site] = site; G[CH.d] = d / SCALE[CH.d];
    if (have) {
      G[CH.ivc] = (R.ivc || 0) / SCALE[CH.ivc]; G[CH.flow] = Math.abs(R.flow) / SCALE[CH.flow];
      G[CH.g0] = R.g0 / SCALE[CH.g0]; G[CH.g1] = R.g1 / SCALE[CH.g1]; G[CH.g2] = R.g2 / SCALE[CH.g2];
      // (the parts scaled to the stent's own drop, so the bracket reads the printed "Across stent")
      const tot = R.tract + R.wall + R.ends + R.jet, k = tot > 1e-6 && R.dp > 0 ? R.dp / tot : 1;
      G[CH.tract] = Math.max(0, R.tract * k) / SCALE[CH.tract]; G[CH.wall] = Math.max(0, R.wall * k) / SCALE[CH.wall];
      G[CH.ends] = Math.max(0, R.ends * k) / SCALE[CH.ends]; G[CH.jet] = Math.max(0, R.jet * k) / SCALE[CH.jet];
      G[CH.out] = Math.max(0, (R.ppg ?? 0) - Math.max(0, R.dp)) / SCALE[CH.out];
      // the chart's tops, round, so they step and the follower glides them
      if (chart) {
        fill(T, G); const o = traceFor(T, rec), kd = scanK(id);
        let mx = 0; for (let i = 0; i <= TRACE_N; i++) mx = Math.max(mx, o.v[i] * kd);
        G[CH.vHi] = vTop(Math.max(mx, R.g0, R.g1, R.g2, 200)) / SCALE[CH.vHi];
        G[CH.pHi] = pTop((R.ivc || 0) + (R.ppg || 0)) / SCALE[CH.pHi];
      }
    } else for (const c of [CH.ivc, CH.flow, CH.g0, CH.g1, CH.g2, CH.tract, CH.wall, CH.ends, CH.jet, CH.out, CH.vHi, CH.pHi]) G[c] = fol.to[c];   // (no stent: the numbers stay and fade with it)
    G[CH.cm] = lens === 'pressure' ? 1 : 0;
  }
  function fill(t, v) {
    t.sh = geomFix({ len: v[CH.len] * SCALE[CH.len], waist: v[CH.waist] * SCALE[CH.waist], trans: v[CH.trans] * SCALE[CH.trans], red: v[CH.red] }, kind(), fix);
    t.s = clamp(v[CH.s], 0, 1); t.site = v[CH.site]; t.d = v[CH.d] * SCALE[CH.d]; t.flowLpm = v[CH.flow] * SCALE[CH.flow];
    t.tract = v[CH.tract] * SCALE[CH.tract]; t.wall = v[CH.wall] * SCALE[CH.wall]; t.ends = v[CH.ends] * SCALE[CH.ends]; t.jet = v[CH.jet] * SCALE[CH.jet];
    t.dp = t.tract + t.wall + t.ends + t.jet; t.ppg = t.dp + v[CH.out] * SCALE[CH.out];
    return t;
  }
  const meshFrame = (a, side) => { const u = a / MESH.L; return [MESH.x0 + a, MESH.cy + side * (MESH.dPx * profileAt(MESH.sh, MESH.s, MESH.site, u)) / 2]; };

  function paint(v) {
    if (!(W > 0)) return;
    const sh = fill(T, v).sh, len = sh.len, ex = clamp(v[CH.ex], 0, 1), cm = clamp(v[CH.cm], 0, 1), s = T.s, site = T.site, d = T.d, k = L.k, cy = L.cy;
    const x0 = L.x0, x1 = L.x1, span = x1 - x0, dPx = d * k, ivc = v[CH.ivc] * SCALE[CH.ivc];
    const o = traceFor(T, rec);
    // the veins either side, neutral; in the pressure lens their own pressure fades in over them
    setGeo(pvR, 'x', 0); setGeo(pvR, 'width', x0 + 2); setGeo(pvR, 'y', cy - L.pvH / 2); setGeo(pvR, 'height', L.pvH);
    setGeo(hvR, 'x', x1 - 2); setGeo(hvR, 'width', W - x1 + 2); setGeo(hvR, 'y', cy - L.hvH / 2); setGeo(hvR, 'height', L.hvH);
    setGeo(pvQ, 'x', 0); setGeo(pvQ, 'width', x0 + 2); setGeo(pvQ, 'y', cy - L.pvH / 2); setGeo(pvQ, 'height', L.pvH);
    setGeo(hvQ, 'x', x1 - 2); setGeo(hvQ, 'width', W - x1 + 2); setGeo(hvQ, 'y', cy - L.hvH / 2); setGeo(hvQ, 'height', L.hvH);
    setGeo(pvQ, 'opacity', cm * ex * 0.7); setGeo(hvQ, 'opacity', cm * ex * 0.7);
    // the lumen, to scale; its colours along the picture's width (velocity: the scanner's against the stent's range; pressure: absolute)
    stentOutline(lumBuf, x0, span, cy, dPx, 0, s, sh, site); setPts(lumV, lumBuf, OUTL, true); setPts(lumP, lumBuf, OUTL, true);
    setGeo(lumV, 'opacity', ex); setGeo(lumP, 'opacity', ex * cm);
    const v0 = openVelocity(T.flowLpm, d, id);
    for (let i = 0; i < N_STOPS; i++) {
      const xi = (W * i) / (N_STOPS - 1), u = clamp((xi - x0) / span, 0, 1);
      setGeo(stops[i], 'stop-color', stentColour(localVelocity(v0, profileAt(sh, s, site, u)), id, d));
      if (cm > 0.001) setGeo(stopsP[i], 'stop-color', pressureAt(ivc + o.P[sampleAt(xi, len, L)]));
    }
    // The stent as a cut view (stent-mesh.js stentCutD): only its wall on each side, the cover's thin bands and the rings along them, so the lumen shows whole and a
    // narrowing pinches the wall with it. Made again only when its shape changed.
    MESH.cy = cy; MESH.x0 = x0; MESH.dPx = dPx; MESH.s = s; MESH.sh = sh; MESH.site = site; MESH.L = span;
    const mk = meshKey;
    if (!(mk[7] === 1 && mk[0] === cy && mk[1] === x0 && mk[2] === dPx && mk[3] === s && mk[4] === site && mk[5] === span && mk[6] === len && mk[8] === sh.waist && mk[9] === sh.trans && mk[10] === sh.red)) {
      mk[0] = cy; mk[1] = x0; mk[2] = dPx; mk[3] = s; mk[4] = site; mk[5] = span; mk[6] = len; mk[7] = 1; mk[8] = sh.waist; mk[9] = sh.trans; mk[10] = sh.red;
      CUT.t = clamp(0.55 * k, 1.6, 2.6); CUT.step = Math.max(3, 0.22 * L.pxCm); CUT.ampB = Math.min(4, 0.9 * k); CUT.ampC = Math.min(2.4, 0.5 * k);
      const m = stentCutD(meshFrame, span, bareOf(span, len), CUT);   // alloc-rare: the device's paths, made again only when the stent's shape changes (an edit), never at rest
      setPolys(grf, flattenPath(m.wall));
      for (let i = 0; i < WIRES.length; i++) setPolys(wires[i], flattenPath(m[WIRES[i]] || ''));
    }
    setGeo(grf, 'opacity', ex);
    for (const w of wires) setGeo(w, 'opacity', ex);
    paintVeinNames(ex);
    if (labels) paintWords(v, o, sh, ex, cm, ivc);
    if (chart) paintChart(v, o, sh, ex, cm, ivc);
    gl.paint();
  }

  // The veins' names, inside the veins at the stent's two ends (a stub is 1.3 cm of the picture: RPV, RHV, the DIPS's far end the IVC), fading with the stent.
  function paintVeinNames(ex) {
    setWords(pvT, 'RPV'); setWords(hvT, id === 'DIPS' ? 'IVC' : 'RHV');
    setGeo(pvT, 'x', 4); setGeo(pvT, 'y', L.cy); setGeo(hvT, 'x', L.W - 4); setGeo(hvT, 'y', L.cy);
    setGeo(pvT, 'opacity', ex); setGeo(hvT, 'opacity', ex);
  }

  function paintWords(v, o, sh, ex, cm, ivc) {
    const len = sh.len, x0 = L.x0, span = L.x1 - x0, k = L.k, cy = L.cy, d = T.d;
    // the waist: a bracket over it with its lumen and length; it fades with the waist (never pops)
    const red = sh.red || 0, wsp = waistSpan(sh, SPW), wa = x0 + wsp.a1 * span, wb = x0 + wsp.b1 * span, yb = L.brY;
    wBuf[0] = wa; wBuf[1] = yb + 4; wBuf[2] = wa; wBuf[3] = yb; wBuf[4] = wb; wBuf[5] = yb; wBuf[6] = wb; wBuf[7] = yb + 4; setPts(wBr, wBuf, 4, false);
    const wOn = ex * clamp((red - 0.004) / 0.03, 0, 1);
    setGeo(wBr, 'opacity', wOn); setGeo(wT, 'opacity', wOn); setGeo(wT, 'x', (wa + wb) / 2); setGeo(wT, 'y', L.labY);
    setWords(wT, waistWord(d * (1 - red), sh.waist));
    // the end stenosis: its lumen over it
    const esp = endSpan(sh, T.site, SPE), ea = x0 + esp.a1 * span, eb = x0 + esp.b1 * span, eOn = ex * clamp((T.s - 0.004) / 0.03, 0, 1);
    eBuf[0] = ea; eBuf[1] = yb + 4; eBuf[2] = ea; eBuf[3] = yb; eBuf[4] = eb; eBuf[5] = yb; eBuf[6] = eb; eBuf[7] = yb + 4; setPts(eBr, eBuf, 4, false);
    setGeo(eBr, 'opacity', eOn); setGeo(eT, 'opacity', eOn); setGeo(eT, 'x', clamp((ea + eb) / 2, 24, L.W - 24)); setGeo(eT, 'y', L.labY);
    setWords(eT, mmWord(d * (1 - T.s)));
    // the Doppler's three gates: a tick down from the lumen, the number where it is taken (the lens: cm/s, or mmHg at the same three places)
    for (let q = 0; q < 3; q++) {
      const u = GATES[q], xg = x0 + u * span, yl = cy + (d * k * profileAt(sh, T.s, T.site, u)) / 2 + 2, tb = tBuf[q];
      tb[0] = xg; tb[1] = yl; tb[2] = xg; tb[3] = L.gateY - 8; setPts(ticks[q], tb, 2, false);
      setGeo(numsV[q], 'x', xg); setGeo(numsV[q], 'y', L.gateY); setWords(numsV[q], int(v[CH.g0 + q] * SCALE[CH.g0 + q]));
      setGeo(numsP[q], 'x', xg); setGeo(numsP[q], 'y', L.gateY); setWords(numsP[q], ten(ivc + o.P[gateIndex(u, len)]));
      setGeo(ticks[q], 'opacity', ex); setGeo(numsV[q], 'opacity', ex * (1 - cm)); setGeo(numsP[q], 'opacity', ex * cm);
    }
    // the stent's two ends: the trace's own numbers where blood enters and leaves it (the pressure's two are the "Across stent" bracket's top and foot)
    const kd = scanK(id);
    for (let q = 0; q < 2; q++) {
      const xe = q ? L.x1 : x0, j = gateIndex(q, len), yl = cy + (d * k * profileAt(sh, T.s, T.site, q)) / 2 + 2, xb = xBuf[q];
      xb[0] = xe; xb[1] = yl; xb[2] = xe; xb[3] = L.gateY - 8; setPts(xTicks[q], xb, 2, false);
      setGeo(endV[q], 'x', xe); setGeo(endV[q], 'y', L.gateY); setWords(endV[q], int(o.v[j] * kd));
      setGeo(endP[q], 'x', xe); setGeo(endP[q], 'y', L.gateY); setWords(endP[q], ten(ivc + o.P[j]));
      setGeo(xTicks[q], 'opacity', ex); setGeo(endV[q], 'opacity', ex * (1 - cm)); setGeo(endP[q], 'opacity', ex * cm);
    }
  }

  function paintChart(v, o, sh, ex, cm, ivc) {
    const len = sh.len, top = L.plotTop, bot = L.plotBot, G = GUTTER, X = (c) => xOf(c, len, L, G);
    const vHi = Math.max(1, v[CH.vHi] * SCALE[CH.vHi]), pHi = Math.max(1, v[CH.pHi] * SCALE[CH.pHi]);
    // (The axis runs a fifth past its top tick, as the mock's: the top tick and its number sit clear under the chart's title.)
    const yV = (x) => clamp(bot - (x / (vHi * HEAD)) * (bot - top), top - 2, bot), yP = (p) => clamp(bot - (p / (pHi * HEAD)) * (bot - top), top - 2, bot);
    for (let i = 0; i < 4; i++) { const y = bot - ((bot - top) * i) / (3 * HEAD), gb = gridBuf[i]; gb[0] = G; gb[1] = y; gb[2] = L.W; gb[3] = y; setPts(grid[i], gb, 2, false); setGeo(grid[i], 'opacity', ex); }
    for (let i = 0; i < 3; i++) {
      const y = bot - ((bot - top) * (i + 1)) / (3 * HEAD) - 7;
      setGeo(tickV[i], 'x', 0); setGeo(tickV[i], 'y', y); setWords(tickV[i], int((vHi * (i + 1)) / 3)); setGeo(tickV[i], 'opacity', ex * (1 - cm));
      setGeo(tickP[i], 'x', 0); setGeo(tickP[i], 'y', y); setWords(tickP[i], int((pHi * (i + 1)) / 3)); setGeo(tickP[i], 'opacity', ex * cm);
    }
    setGeo(titleV, 'x', 0); setGeo(titleV, 'y', L.titleY); setGeo(titleP, 'x', 0); setGeo(titleP, 'y', L.titleY);
    // velocity: the scanner's along the path, the usual range over the stent, a dot at each gate
    const kd = scanK(id), norm = stentNormal(id, T.d), lo = norm ? norm[0] : 90, hi = norm && Number.isFinite(norm[1]) ? norm[1] : 190;
    setGeo(band, 'x', L.x0); setGeo(band, 'width', L.x1 - L.x0); setGeo(band, 'y', yV(hi)); setGeo(band, 'height', Math.max(0, yV(lo) - yV(hi)));
    setGeo(bandT, 'x', L.x1 - 4); setGeo(bandT, 'y', yV(hi) + 9); setWords(bandT, usualWord(lo, hi));
    for (let i = 0; i <= TRACE_N; i++) { const x = X(o.x[i]), y = yV(o.v[i] * kd); vLineBuf[2 * i] = x; vLineBuf[2 * i + 1] = y; vAreaBuf[2 * i] = x; vAreaBuf[2 * i + 1] = y; }
    vAreaBuf[2 * NT] = X(o.x[TRACE_N]); vAreaBuf[2 * NT + 1] = bot; vAreaBuf[2 * NT + 2] = X(o.x[0]); vAreaBuf[2 * NT + 3] = bot;
    setPts(vLine, vLineBuf, NT, false); setPts(vArea, vAreaBuf, NT + 2, true);
    for (let q = 0; q < 3; q++) { const j = gateIndex(GATES[q], len); setGeo(vDots[q], 'cx', X(o.x[j])); setGeo(vDots[q], 'cy', yV(o.v[j] * kd)); }
    const av = ex * (1 - cm), ap = ex * cm;
    for (const e of velKids) setGeo(e, 'opacity', av);
    // pressure: absolute along the path; the PPG and the stent's own drop, two brackets
    for (let i = 0; i <= TRACE_N; i++) { pLineBuf[2 * i] = X(o.x[i]); pLineBuf[2 * i + 1] = yP(ivc + o.P[i]); }
    setPts(pLine, pLineBuf, NT, false);
    // (the PPG at the left edge: its top is where the line starts, the portal vein; a dashed guide carries the IVC's level across to its foot)
    const i0 = gateIndex(0, len), i1 = gateIndex(1, len), pIn = ivc + o.P[i0], pOut = ivc + o.P[i1], pv = ivc + T.ppg, xs = L.x1 - 2, xg = G + 3;
    gdBuf[0] = L.x0; gdBuf[1] = yP(pIn); gdBuf[2] = xs; gdBuf[3] = yP(pIn); gdBuf[4] = NaN; gdBuf[5] = 0; gdBuf[6] = xg; gdBuf[7] = yP(ivc); gdBuf[8] = L.x1; gdBuf[9] = yP(ivc);
    setPts(guide, gdBuf, 5, false);
    sbBuf[0] = xs - 4; sbBuf[1] = yP(pIn); sbBuf[2] = xs; sbBuf[3] = yP(pIn); sbBuf[4] = xs; sbBuf[5] = yP(pOut); sbBuf[6] = xs - 4; sbBuf[7] = yP(pOut); setPts(sBr, sbBuf, 4, false);
    setGeo(sT, 'x', xs - 8); setGeo(sT, 'y', yP(pIn) + 12); setWords(sT, dpWord(T.dp));
    pbBuf[0] = xg + 4; pbBuf[1] = yP(pv); pbBuf[2] = xg; pbBuf[3] = yP(pv); pbBuf[4] = xg; pbBuf[5] = yP(ivc); pbBuf[6] = xg + 4; pbBuf[7] = yP(ivc); setPts(pBr, pbBuf, 4, false);
    // its words beside it, halfway down (under the portal vein's flat line); a bracket too short for them puts them just under its foot
    const bh = yP(ivc) - yP(pv);
    setGeo(pT, 'x', xg + 8); setGeo(pT, 'y', bh >= 28 ? (yP(pv) + yP(ivc)) / 2 : yP(ivc) + 10); setWords(pT, ppgWord(T.ppg));
    for (const e of preKids) setGeo(e, 'opacity', ap);
  }

  function tick() {
    raf = 0;
    const moving = fol.at(easeNow());
    paint(fol.v);
    if (moving && el.isConnected) raf = nextFrame(tick);
    else { if (moving) { fol.snap(fol.to); paint(fol.v); } animating(false); }
  }
  function refresh(live) {
    read(live);
    if (!hasShown || reduceMotionMQ?.matches || !el.isConnected) {
      fol.snap(goal); hasShown = true;
      if (raf) { cancelFrame(raf); raf = 0; }
      animating(false); paint(fol.v); return;
    }
    if (fol.goal(goal, easeNow())) { animating(true); if (!raf) raf = nextFrame(tick); }
  }
  // The box's width sets the scale and the rows; the picture's height follows from them (written once per width, never in a frame).
  function fit() {
    const w = Math.round(readMetric(stage, 'offsetWidth') || 0);
    if (!(w > 0) || w === W) return;
    W = w; figLayout(W, { labels, chart }, L);
    setGeo(pic, 'viewBox', `0 0 ${W} ${L.h.toFixed(1)}`);
    setGeo(grad, 'x2', W); setGeo(gradP, 'x2', W);
    stage.style.height = `${L.h.toFixed(1)}px`;
    meshKey[7] = 0;
    paint(fol.v); gl.relook();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(stage);
  const offP = store.on('params', () => refresh());
  return {
    el,
    /** Which stent it draws ('TIPS', 'DIPS'). */
    setStent(n) { n = n === 'DIPS' ? 'DIPS' : 'TIPS'; if (n !== id) { id = n; hasShown = false; refresh(); } },
    /** The lens: the stent's colour, its gates' numbers and the chart under it change together, crossfaded. */
    setLens(k) { k = k === 'pressure' ? 'pressure' : 'velocity'; if (k !== lens) { lens = k; refresh(); } },
    lens: () => lens,
    /** The figure's rows, as laid out now (for a test and for the card that holds it). */
    layout: () => L,
    /** A live frame (the dock's, or the store's): the numbers follow it, a jump glided. */
    update(f) { refresh(f); },
    dispose() { ro?.disconnect(); offP?.(); if (raf) cancelFrame(raf); raf = 0; animating(false); gl.dispose?.(); },
  };
}
const pressureAt = (p) => { try { return pressureColor(p); } catch { return '#7BA1FC'; } };   // colour-exempt: the pressure ramp's 10 mmHg, only until the page's tokens are read
