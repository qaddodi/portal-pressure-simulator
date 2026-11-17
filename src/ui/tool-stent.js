// The stent cards (16 Nov 2026; plan /mnt/project-files/tips-geometry/tips-instrument-cards-plan.md §5): tool { kind: 'stent', vessel: 'TIPS' | 'DIPS', show: ['lumen'] | ['loss'] | both }.
//   lumen  the stent in side view, to scale in cm: the portal vein at the left, the hepatic vein at the right, its wall in the stent metal and its lumen coloured
//          with the figure's own velocity colours (colormap.js velocityColor against the stent's 90 to 190 cm/s, scaled for a diameter outside 8 to 10 mm), the narrowing as a dimension line with its lumen in
//          mm, the Doppler's three points with their peak velocity (the same numbers as the Doppler card and the peak tile), the flow as an arrow.
//   trace  the reviewer's longitudinal view (stent-trace-pic.js): the lumen with five numbered pressure sites, and the static pressure, the energy lost so far and the mean
//          velocity along it (tool.panels picks which); a schematic, the solver being lumped (src/engine/stent-trace.js).
//   loss   where the pressure goes: ONE stacked bar on a fixed mmHg scale (tool.max, 16 by default), never a waterfall (rules-lint): the stent's tract, the friction along
//          it, its two ends and the narrowing's jet; with tool.to = 'ppg' it runs on to the PPG with the part outside the stent (hatched), so a student sees why the stent's
//          drop is smaller than the PPG. Under it, "Along the length" (tract, friction) against "Local" (ends, jet).
// The picture is one outline of a fixed number of points (the profile sampled at N + 1 places, mirrored), so a diameter, a narrowing, a waist's length or an abrupt
// step becoming a taper all move the same points and glide as one piece: nothing is added or taken away when the geometry changes. Drawn on the GPU (svg-gl.js),
// each frame of its glide a number written on a piece, nothing made. Never an HVPG: the stent's own drop is "Stent" (the pressure across it), the PPG is the
// portal vein minus the IVC.
// Where the numbers come from: the slide's fingerprint (pin(fp), what its tiles show) or, in the Tests dock, the live frame's metrics (update(f)); the geometry from the
// model's params, followed as the cross-section follows its own (a stream straight, a jump glided).
// Options: vessel, show, to ('ppg' | 'stent'), max (the bar's scale, mmHg), gate ('proximal' | 'mid' | 'distal' | 'site': the Doppler third this slide reads, a band behind it).

import { h, clamp, fadeShown } from './util.js';
import { store } from './store.js';
import { frameFor, cancelFrame, frameAnimating, easeNow } from './frame.js';
import { createSvgGL, svgModel, setWords, setGeo, setPts, setPolys } from './svg-gl.js';
import { flattenPath } from './shape-gl.js';
import { stentLookD, bareOf } from './stent-mesh.js';
import { restPass } from './rest-pass.js';
import { reduceMotionMQ } from './motion.js';
import { easeArrive } from './ease.js';
import { FOLLOW_JUMP, FOLLOW_LONE, FOLLOW_STREAM_MS, FOLLOW_MIN_MS, FOLLOW_MAX_MS, FOLLOW_GAP0, FOLLOW_GLIDE_MS } from './tool-lumen.js';
import { velocityColor } from './colormap.js';
import { stentNormal } from './velNormal.js';
import { geomFix, geomOf, profileAt, waistSpan } from '../engine/stent-geom.js';
import { STENT_SITES, STENT_SPANS, stentGate, stentSite, dopplerK, edgeById } from '../engine/topology.js';
import { smooth01 } from './num.js';
import { createTracePic, traceH, PANELS } from './stent-trace-pic.js';
import { readMetric } from './layout-snap.js';

const nextFrame = frameFor('stent');
const sv = svgModel;

// ── what the card draws, in units of its pictures ──
export const VW = 320;
export const SIDE = { h: 106, cy: 48, pxCm: 26, pxMm: 3.1, x0: 30, span: 260, dimY: 18, labY: 8, gateTop: 78, numY: 88, bandY: 70, bandH: 26, capY: 99, stubH: 31 };
export const BAR = { h: 130, x: 6, w: 308, y: 38, bh: 24, markB: 8, markA: 22, brY: 70, brTxt: 86, keyY: [104, 120], keyX: [[6, 108, 210], [6, 108]] };
export const N_PROFILE = 96;   // (the outline's samples along the stent: 97 each side)
export const N_STOPS = 33;   // (the lumen's colours at 33 places across the picture's fixed span: a gradient in user space, since a path drawn from points has no box to take one from)
export const PARTS = ['tract', 'wall', 'ends', 'jet'];
const PART_NAMES = ['Tract', 'Friction', 'Ends', 'Jet'];
const DEFAULT_MAX = 16;
const IDS = { TIPS: 'tips', DIPS: 'dips' };
// The follower's channels (each divided by its scale so the 12 % jump test means the same for every one).
const CH = { ex: 0, s: 1, len: 2, waist: 3, trans: 4, site: 5, d: 6, flow: 7, g0: 8, g1: 9, g2: 10, tract: 11, wall: 12, ends: 13, jet: 14, out: 15, outOn: 16, max: 17, pLo: 18, pHi: 19, vHi: 20 };
const NCH = 21;
const SCALE = [1, 1, 10, 10, 10, 1, 12, 6, 400, 400, 400, 16, 16, 16, 16, 16, 1, 16, 8, 24, 200];

// ── the numbers' words, each made once ──
const TEN = Array.from({ length: 1000 }, (_, i) => (i / 10).toFixed(1));
const INT = Array.from({ length: 1000 }, (_, i) => `${i}`);
export const ten = (v) => TEN[clamp(Math.round(v * 10), 0, 999)];
const int = (v) => INT[clamp(Math.round(v), 0, 999)];

/** The pressure each part takes, in whole tenths of a mmHg that add up to the stent's own drop as it prints (the tile's "Across stent"): the largest remainder, so the
 *  parts a card prints never sum to a different number than the total beside them. Writes into out (the parts' count of numbers), returns the total in tenths. */
export function printedParts(parts, out = []) {
  let sum = 0;
  for (let i = 0; i < parts.length; i++) sum += Math.max(0, parts[i]);
  const total = Math.round(sum * 10);
  let used = 0;
  for (let i = 0; i < parts.length; i++) { out[i] = Math.floor(Math.max(0, parts[i]) * 10 + 1e-9); used += out[i]; }
  // (the leftover tenths go to the largest remainders, the earlier part on a tie)
  for (let left = total - used; left > 0; left--) {
    let best = -1, br = -1;
    for (let i = 0; i < parts.length; i++) { const r = Math.max(0, parts[i]) * 10 - out[i]; if (r > br + 1e-12) { br = r; best = i; } }
    out[best]++;
  }
  return total;
}

/** How much of a part's number shows on its segment: all of it once the segment is as wide as the number is (its characters at the size the words are drawn in, in the
 *  picture's units), none when it is 3 units narrower, a smooth step between. A fixed width left a short segment half faded where the words are larger (a phone). */
export const numberOn = (w, chars, fs) => smooth01((w - (0.62 * fs * chars + 3) + 3) / 4);

/** The lumen's outline for the side view, written into buf (2 × 2 × (N_PROFILE + 1) numbers: the top edge from the portal end to the hepatic end, then the bottom
 *  back), at the stent's start x0 and length L (units), its diameter dPx (units), the wall's thickness `wt` outside the lumen (0: the lumen itself), the narrowing s
 *  and the geometry g (len, waist, trans in cm) with the site's fraction. Fixed count, always. */
export function stentOutline(buf, x0, L, cy, dPx, wt, s, g, site) {
  const n = N_PROFILE;
  for (let i = 0; i <= n; i++) {
    const u = i / n, half = (dPx * profileAt(g, s, site, u)) / 2 + wt, x = x0 + u * L;
    buf[2 * i] = x; buf[2 * i + 1] = cy - half;
    const q = 2 * n + 1 - i;   // (the bottom edge, from the hepatic end back)
    buf[2 * q] = x; buf[2 * q + 1] = cy + half;
  }
  return 2 * (n + 1);
}

/** The stent's local velocity at fraction u, as the scanner would read it (cm/s): the open stent's peak velocity over the share of the lumen's diameter squared. */
export const localVelocity = (v0, prof) => v0 / Math.max(0.05, prof * prof);
/** The open stent's scanner velocity (cm/s) from its flow (L/min) and diameter (mm), as the Doppler reads it (dopplerK). */
export function openVelocity(flowLpm, dMm, id) {
  const A = Math.PI * (dMm / 10) * (dMm / 10) / 4;
  return A > 0 ? (Math.abs(flowLpm) / 0.06 / A) * dopplerK(edgeById(id)) : 0;
}
/** The scanner's reading over the mean velocity for this stent (the Doppler's angle and profile factor, dopplerK). */
export const scanK = (id) => dopplerK(edgeById(id));
/** The colour the figure paints a stent at scanner velocity v (cm/s): the same ramp and the same range (90 to 190 cm/s for an 8 to 10 mm stent, scaled for the stent's open diameter d mm: velNormal.js stentNormal). */
export const stentColour = (v, id, d = 0) => {
  // (Until the page's tokens are read the ramp has no stops and velocityColor throws; the first frame of a card made at once at start keeps a neutral teal then.)
  try { return velocityColor(v, stentNormal(id, d)); } catch { return RAMP_FALLBACK; }
};
const RAMP_FALLBACK = '#5DB4A4';   // colour-exempt: the velocity ramp's teal, only until the page's tokens are read

/** A follower of many channels (the cross-section's createFollow, for n numbers): goal(values, now) takes the model's, at(now) writes the shown into f.v and returns
 *  whether it is still moving. A step that is part of a stream is followed straight over the stream's own interval, a jump glided. One record, written in place. */
export function createFollowN(n) {
  const f = { v: new Float64Array(n), from: new Float64Array(n), to: new Float64Array(n), t0: 0, ms: 0, glide: false, last: -Infinity, gap: FOLLOW_GAP0, moving: false };
  f.snap = (a) => { f.v.set(a); f.from.set(a); f.to.set(a); f.moving = false; f.ms = 0; };
  f.at = (now) => {
    if (!f.moving) return false;
    const k = f.ms > 0 ? Math.min(1, Math.max(0, (now - f.t0) / f.ms)) : 1;
    if (k >= 1) { f.v.set(f.to); f.moving = false; return false; }
    const e = f.glide ? easeArrive(k) : k;
    for (let i = 0; i < n; i++) f.v[i] = f.from[i] + (f.to[i] - f.from[i]) * e;
    return true;
  };
  f.goal = (a, now) => {
    let same = true;
    for (let i = 0; i < n; i++) if (a[i] !== f.to[i]) { same = false; break; }
    if (same) return f.moving;
    f.at(now);
    let d = 0;
    for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a[i] - f.v[i]));
    const since = now - f.last, stream = since < FOLLOW_STREAM_MS;
    if (stream) f.gap += (Math.min(FOLLOW_MAX_MS, Math.max(FOLLOW_MIN_MS, since)) - f.gap) * 0.35;
    else f.gap = FOLLOW_GAP0;
    f.last = now;
    f.glide = d >= FOLLOW_JUMP || (!stream && d >= FOLLOW_LONE);
    f.ms = f.glide ? FOLLOW_GLIDE_MS : f.gap;
    f.from.set(f.v); f.to.set(a); f.t0 = now; f.moving = true;
    return true;
  };
  return f;
}

/** The numbers a stent shows, from a fingerprint (the slide's) or a frame's metrics (live): the keys the tiles use, tips or dips. null when there is no stent. */
export function readStent(src, id, out = {}) {
  const k = IDS[id] || 'tips';
  const t = src?.metrics ? src.metrics[k] : null, fp = src?.metrics ? null : src;
  if (t) {
    out.flow = t.flow; out.dp = t.dp; out.g0 = t.peaks[0]; out.g1 = t.peaks[1]; out.g2 = t.peaks[2];
    out.tract = t.parts.tract; out.wall = t.parts.wall; out.ends = t.parts.entry; out.jet = t.parts.jet + t.parts.inlet;
    out.ppg = src.metrics.ppg; out.lumen = t.dWaist; out.vel = t.vPeak;
    return out;
  }
  if (!fp || fp[`${k}Flow`] == null) return null;
  out.flow = fp[`${k}Flow`]; out.dp = fp[`${k}Dp`]; out.g0 = fp[`${k}G0`]; out.g1 = fp[`${k}G1`]; out.g2 = fp[`${k}G2`];
  out.tract = fp[`${k}Tract`]; out.wall = fp[`${k}Wall`]; out.ends = fp[`${k}Ends`]; out.jet = fp[`${k}Jet`];
  out.ppg = fp.ppg; out.lumen = fp[`${k}Lumen`]; out.vel = fp[`${k}Vel`];
  return out;
}

export const stentTitle = (t) => {
  const v = t?.vessel === 'DIPS' ? 'DIPS' : 'TIPS', show = Array.isArray(t?.show) ? t.show : ['lumen'];
  return show.includes('trace') && !show.includes('lumen') ? `${v}, along the stent` : show.includes('lumen') ? `${v}, side view` : `${v}, where the pressure goes`;
};

/** A vein's two walls running up to the stent, as one open path of 5 points (the pen lifted between): from x a to x b at the axis cy, its half-width hw. */
function veinLine(buf, a, b, cy, hw) {
  buf[0] = a; buf[1] = cy - hw; buf[2] = b; buf[3] = cy - hw; buf[4] = NaN; buf[5] = 0; buf[6] = a; buf[7] = cy + hw; buf[8] = b; buf[9] = cy + hw;
  return buf;
}

const fix2 = () => ({ len: 8, waist: 1, trans: 0 });

export function createStent() {
  let id = 'TIPS', tool = null, show = ['lumen'], pinned = null, toPpg = 0, maxMm = DEFAULT_MAX, gateIdx = -1;
  const R = { flow: 0, dp: 0, g0: 0, g1: 0, g2: 0, tract: 0, wall: 0, ends: 0, jet: 0, ppg: 0, lumen: 0, vel: 0 };
  let have = false;   // (a stent is in: the numbers are its own)
  const gid = `sg${Math.random().toString(36).slice(2, 8)}`;

  // ── the side view's pieces ──
  const S = SIDE;
  const stubP = sv('rect', { 'data-look': 'stent.vein.p', x: 0, y: S.cy - S.stubH / 2, width: S.x0, height: S.stubH });
  const stubH = sv('rect', { 'data-look': 'stent.vein.h', x: VW - S.x0, y: S.cy - S.stubH / 2, width: S.x0, height: S.stubH });
  const veinBuf = [new Float64Array(10), new Float64Array(10)];
  const veinP = sv('path', { 'data-look': 'stent.vein.wall' }), veinH = sv('path', { 'data-look': 'stent.vein.wall' });
  const OUTL = 2 * (N_PROFILE + 1);
  const lumBuf = new Float64Array(2 * OUTL), grfBuf = new Float64Array(2 * OUTL), ghostBuf = new Float64Array(8), arrowBuf = new Float64Array(14);
  const lumP = sv('path', { 'data-look': 'stent.lumen', fill: `url(#${gid})` });
  const grfP = sv('path', { 'data-look': 'stent.graft' });
  // the device as the figure draws it (stent-mesh.js stentLookD: the rings of the bare stretch, the covered stretch's, the gold band and tab), drawn over the lumen
  const WIRES = ['backBare', 'backCov', 'frontBare', 'frontCov', 'glint', 'band', 'tab'];
  const wires = WIRES.map((k) => sv('path', { 'data-look': `stent.wire.${k}` }));
  const ghostP = sv('path', { 'data-look': 'stent.ghost' });
  const stops = Array.from({ length: N_STOPS }, (_, i) => sv('stop', { offset: (i / (N_STOPS - 1)).toFixed(3), 'stop-color': '#888888' }));   // colour-exempt: a gradient's first stops, written at the first paint
  const grad = sv('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: S.x0, y1: 0, x2: S.x0 + S.span, y2: 0 }, stops);
  const dimBuf = new Float64Array(8), dimP = sv('path', { 'data-look': 'stent.dim' });
  const dimTxt = sv('text', { 'data-look': 'stent.word', x: VW / 2, y: S.labY, 'text-anchor': 'middle' });
  const lenTxt = sv('text', { 'data-look': 'stent.word', x: VW / 2, y: S.labY, 'text-anchor': 'middle' });
  const arrowP = sv('path', { 'data-look': 'stent.arrow' });
  const band = sv('rect', { 'data-look': 'stent.gate.band', x: 0, y: S.bandY, width: 10, height: S.bandH });
  const tickBuf = [0, 1, 2].map(() => new Float64Array(4));
  const ticks = [0, 1, 2].map(() => sv('path', { 'data-look': 'stent.gate.tick' }));
  const nums = [0, 1, 2].map(() => sv('text', { 'data-look': 'stent.num', y: S.numY, 'text-anchor': 'middle' }));
  const cap = sv('text', { 'data-look': 'stent.cap', x: VW / 2, y: S.capY, 'text-anchor': 'middle' });
  const none = sv('text', { 'data-look': 'stent.word', x: VW / 2, y: S.cy, 'text-anchor': 'middle' });
  setWords(none, 'No stent'); setWords(cap, 'Doppler peak, cm/s');
  const picL = sv('svg', { class: 'gl-pic', viewBox: `0 0 ${VW} ${S.h}`, role: 'img' },
    sv('defs', {}, grad), stubP, stubH, veinP, veinH, ghostP, lumP, grfP, ...wires, band, dimP, dimTxt, lenTxt, arrowP, ...ticks, ...nums, cap, none);

  // ── the pressure bar's pieces ──
  const B = BAR;
  const hatchId = `${gid}h`;
  const hatch = sv('pattern', { id: hatchId, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
    sv('rect', { 'data-look': 'stent.hatch.bg', width: 7, height: 7 }), sv('rect', { 'data-look': 'stent.hatch.stripe', width: 3, height: 7 }));
  const SEGS = [...PARTS, 'out'];
  const segs = SEGS.map((k) => sv('rect', { 'data-look': `stent.seg.${k}`, x: B.x, y: B.y, width: 0, height: B.bh, ...(k === 'out' ? { fill: `url(#${hatchId})` } : null) }));
  const segTxt = SEGS.map(() => sv('text', { 'data-look': 'stent.lab', y: B.y + B.bh / 2, 'text-anchor': 'middle' }));
  const markBufA = new Float64Array(4), markBufB = new Float64Array(4);
  const markA = sv('path', { 'data-look': 'stent.mark' }), markB = sv('path', { 'data-look': 'stent.mark' });
  const markAT = sv('text', { 'data-look': 'stent.mark.text', y: B.markA, 'text-anchor': 'end' }), markBT = sv('text', { 'data-look': 'stent.mark.text', y: B.markB, 'text-anchor': 'start' });
  const brBuf = [new Float64Array(8), new Float64Array(8)];
  const brs = [0, 1].map(() => sv('path', { 'data-look': 'stent.bracket' }));
  const brTxt = [0, 1].map(() => sv('text', { 'data-look': 'stent.mark.text', y: B.brTxt, 'text-anchor': 'start' }));
  const keyDot = SEGS.map((k, i) => sv('circle', { 'data-look': `stent.key.dot.${k}`, r: 4, cx: 0, cy: 0 }));
  const keyTxt = SEGS.map(() => sv('text', { 'data-look': 'stent.key.text', 'text-anchor': 'start' }));
  const keyAt = (i) => { const r = i < 3 ? 0 : 1, c = i < 3 ? i : i - 3; return [B.keyX[r][c], B.keyY[r]]; };
  SEGS.forEach((k, i) => { const [kx, ky] = keyAt(i); setGeo(keyDot[i], 'cx', kx + 4); setGeo(keyDot[i], 'cy', ky); setGeo(keyTxt[i], 'x', kx + 14); setGeo(keyTxt[i], 'y', ky); });
  const picB = sv('svg', { class: 'gl-pic', viewBox: `0 0 ${VW} ${B.h}`, role: 'img' },
    sv('defs', {}, hatch), ...segs, ...segTxt, markA, markB, markAT, markBT, ...brs, ...brTxt, ...keyDot, ...keyTxt);

  // ── the traces (stent-trace-pic.js) ──
  const TT = { sh: fix2(), s: 0, site: 0, d: 8, flowLpm: 0, tract: 0, wall: 0, ends: 0, jet: 0, ppg: 0, dp: 0, kd: 1, pLo: 0, pHi: 8, vHi: 100 };
  const RNG = { pHi: 8, pLo: 0, vHi: 100 };
  let panels = PANELS.slice();

  const stageL = h('div', { class: 'gl-stage sc-stage', style: `aspect-ratio: ${VW} / ${S.h}` }, picL);
  const stageB = h('div', { class: 'gl-stage sc-stage', style: `aspect-ratio: ${VW} / ${B.h}` }, picB);
  const el = h('div', { class: 'gl sc' }, stageL, stageB);
  const glL = createSvgGL(stageL), glB = createSvgGL(stageB);
  const wordsAll = [dimTxt, lenTxt, ...nums, cap, none, ...segTxt, markAT, markBT, ...brTxt, ...keyTxt];
  // the traces' picture is made when a slide first asks for it (a card that shows only the side view has no third canvas)
  let tp = null, picT = null, stageT = null, glT = null;
  function traceMade() {
    if (tp) return tp;
    tp = createTracePic(sv, `${gid}t`, (v) => stentColour(v, id, TT.d)); picT = tp.svg;
    stageT = h('div', { class: 'gl-stage sc-stage', style: `aspect-ratio: ${VW} / ${traceH(3)}` }, picT);
    el.insertBefore(stageT, stageB);
    glT = createSvgGL(stageT);
    wordsAll.push(...tp.words);
    ro?.observe(stageT); fitAll();
    return tp;
  }

  // ── the state the pictures follow ──
  const fol = createFollowN(NCH), goal = new Float64Array(NCH), GEO = { len: 8, waist: 1, trans: 0 }, parts4 = [0, 0, 0, 0], tenths = [0, 0, 0, 0];
  let fsU = 11, hasShown = false, raf = 0, anim = false, ariaAsk = 0, ariaText = ['', '', ''];
  const animating = (on) => { if (anim !== on) { anim = on; frameAnimating('stent', on); } };
  const kind = () => (id === 'DIPS' ? 'dips' : 'tips');

  function read(live) {
    const src = pinned || live || store.get().frame;
    have = !!readStent(src, id, R);
    const prm = store.get().params, e = IDS[id], g = geomOf(prm, id, e, GEO);
    const d = prm?.[e]?.d > 0 ? prm[e].d : 8;
    const s = clamp(1 - (1 - (+prm?.stenosis?.[id] || 0)) * (1 - (+prm?.thrombus?.[id] || 0)), 0, 1);
    const site = STENT_SITES[stentSite(prm, id)];
    gateIdx = tool?.gate ? ['proximal', 'mid', 'distal'].indexOf(stentGate(tool.gate, prm, id)) : -1;
    const G = goal;
    G[CH.ex] = have ? 1 : 0;
    G[CH.s] = s; G[CH.len] = g.len / SCALE[CH.len]; G[CH.waist] = g.waist / SCALE[CH.waist]; G[CH.trans] = g.trans / SCALE[CH.trans]; G[CH.site] = site; G[CH.d] = d / SCALE[CH.d];
    if (have) {   // (with no stent the numbers stay where they were, and fade with the stent: nothing falls to zero on the way out)
      G[CH.flow] = Math.abs(R.flow) / SCALE[CH.flow];
      G[CH.g0] = R.g0 / SCALE[CH.g0]; G[CH.g1] = R.g1 / SCALE[CH.g1]; G[CH.g2] = R.g2 / SCALE[CH.g2];
      // (the parts are scaled to the stent's own drop, so the bar's length is the printed "Across stent")
      const tot = R.tract + R.wall + R.ends + R.jet, k = tot > 1e-6 && R.dp > 0 ? R.dp / tot : 1;
      G[CH.tract] = Math.max(0, R.tract * k) / SCALE[CH.tract]; G[CH.wall] = Math.max(0, R.wall * k) / SCALE[CH.wall];
      G[CH.ends] = Math.max(0, R.ends * k) / SCALE[CH.ends]; G[CH.jet] = Math.max(0, R.jet * k) / SCALE[CH.jet];
      G[CH.out] = Math.max(0, (R.ppg ?? 0) - Math.max(0, R.dp)) / SCALE[CH.out];
      // the traces' ranges, from the stent the goal asks for (round ends, so a range steps and the follower glides it)
      if (tp && show.includes('trace')) {
        fillTrace(TT, G);
        tp.fit(TT, RNG);
        G[CH.pLo] = RNG.pLo / SCALE[CH.pLo]; G[CH.pHi] = RNG.pHi / SCALE[CH.pHi]; G[CH.vHi] = RNG.vHi / SCALE[CH.vHi];
      }
    } else {
      for (const c of [CH.flow, CH.g0, CH.g1, CH.g2, CH.tract, CH.wall, CH.ends, CH.jet, CH.out, CH.pLo, CH.pHi, CH.vHi]) G[c] = fol.to[c];
    }
    G[CH.outOn] = toPpg; G[CH.max] = maxMm / SCALE[CH.max];
  }

  const fix = { len: 8, waist: 1, trans: 0 }, MESH = { cy: 0, x0: 0, dPx: 0, s: 0, sh: fix, site: 0, L: 0 };
  // the stent's frame for the figure's own device drawing: a along its length, side across (-1 to 1) at the lumen's wall there
  const frame = (a, side) => { const u = a / MESH.L; return [MESH.x0 + a, MESH.cy + side * (MESH.dPx * profileAt(MESH.sh, MESH.s, MESH.site, u)) / 2]; };
  function paintLumen(v) {
    const sh = geomFix({ len: v[CH.len] * SCALE[CH.len], waist: v[CH.waist] * SCALE[CH.waist], trans: v[CH.trans] * SCALE[CH.trans] }, kind(), fix);
    const ex = clamp(v[CH.ex], 0, 1), s = clamp(v[CH.s], 0, 1), site = v[CH.site], d = v[CH.d] * SCALE[CH.d], dPx = d * S.pxMm;
    const L = sh.len * S.pxCm, x0 = S.x0 + (S.span - L) / 2, x1 = x0 + L, cy = S.cy;
    stentOutline(lumBuf, x0, L, cy, dPx, 0, s, sh, site); setPts(lumP, lumBuf, OUTL, true);
    ghostBuf[0] = x0; ghostBuf[1] = cy - dPx / 2; ghostBuf[2] = x1; ghostBuf[3] = cy - dPx / 2; ghostBuf[4] = x1; ghostBuf[5] = cy + dPx / 2; ghostBuf[6] = x0; ghostBuf[7] = cy + dPx / 2;
    setPts(ghostP, ghostBuf, 4, true);
    // the two veins either side, open ended: a faint fill and their walls running up to the stent
    setGeo(stubP, 'width', x0 + 0.5); setGeo(stubH, 'x', x1 - 0.5); setGeo(stubH, 'width', VW - x1 + 0.5);
    const vh = S.stubH / 2, vb = veinBuf;
    setPts(veinP, veinLine(vb[0], 0, x0, cy, vh), 5, false);
    setPts(veinH, veinLine(vb[1], x1, VW, cy, vh), 5, false);
    for (const e of [lumP, grfP, ...wires, dimP, dimTxt, arrowP, cap, ...ticks, ...nums]) setGeo(e, 'opacity', ex);
    for (const e of [ghostP, none]) setGeo(e, 'opacity', 1 - ex);
    // the lumen's colours along the stent: the figure's velocity ramp against the stent's range, at the local velocity (the gradient spans the picture's fixed width)
    const v0 = openVelocity(v[CH.flow] * SCALE[CH.flow], d, `${id}`);
    for (let i = 0; i < N_STOPS; i++) {
      const u = clamp((S.x0 + (S.span * i) / (N_STOPS - 1) - x0) / L, 0, 1);
      setGeo(stops[i], 'stop-color', stentColour(localVelocity(v0, profileAt(sh, s, site, u)), id, d));
    }
    // the device over it, as the figure draws it (a covered stretch with its rings, the bare stretch at the portal end, the gold band and tab), following the lumen's wall
    MESH.cy = cy; MESH.x0 = x0; MESH.dPx = dPx; MESH.s = s; MESH.sh = sh; MESH.site = site; MESH.L = L;
    const m = stentLookD(frame, L, bareOf(L, sh.len), 1);
    for (let i = 0; i < WIRES.length; i++) setPolys(wires[i], flattenPath(m[WIRES[i]] || ''));
    // (the covered stretch tinted as the cover is, over the lumen: the same outline, from where the bare stretch ends)
    const ub = clamp(bareOf(1, sh.len), 0, 0.9);
    for (let i = 0; i <= N_PROFILE; i++) {
      const u = ub + (1 - ub) * (i / N_PROFILE), half = (dPx * profileAt(sh, s, site, u)) / 2, x = x0 + u * L, q = 2 * N_PROFILE + 1 - i;
      grfBuf[2 * i] = x; grfBuf[2 * i + 1] = cy - half; grfBuf[2 * q] = x; grfBuf[2 * q + 1] = cy + half;
    }
    setPts(grfP, grfBuf, OUTL, true);
    // the dimension line: the narrowing's length and lumen in mm; with no narrowing the whole stent's length in cm, the same line moving out to the ends
    const w = waistSpan(sh, site), k = smooth01((s - 0.01) / 0.05), xa = x0 + (w.a1 * k) * L, xb = x1 + (x0 + w.b1 * L - x1) * k, ym = S.dimY;
    dimBuf[0] = xa; dimBuf[1] = ym + 4; dimBuf[2] = xa; dimBuf[3] = ym; dimBuf[4] = xb; dimBuf[5] = ym; dimBuf[6] = xb; dimBuf[7] = ym + 4;
    setPts(dimP, dimBuf, 4, false);
    const lx = clamp((xa + xb) / 2, x0 + 24, x1 - 24);
    setGeo(dimTxt, 'x', lx); setGeo(lenTxt, 'x', lx);
    setGeo(dimTxt, 'opacity', ex * k); setGeo(lenTxt, 'opacity', ex * (1 - k));
    setWords(dimTxt, `${ten(d * (1 - s))} mm`); setWords(lenTxt, `${ten(sh.len)} cm`);
    // the flow's arrow, its size following the flow
    const ak = clamp(0.55 + v[CH.flow] * SCALE[CH.flow] / 3, 0.55, 1.35), ax = Math.max(15, x0 / 2), P = arrowBuf;
    const AR = [-9, -3, 1, -3, 1, -7, 10, 0, 1, 7, 1, 3, -9, 3];
    for (let i = 0; i < 7; i++) { P[2 * i] = ax + AR[2 * i] * ak; P[2 * i + 1] = cy + AR[2 * i + 1] * ak; }
    setPts(arrowP, arrowBuf, 7, true);
    // the Doppler's three points: a tick down from the stent's wall, the peak velocity under it, the slide's own third behind it
    const yb = cy + dPx / 2;
    for (let q = 0; q < 3; q++) {
      const xg = x0 + [1 / 6, 0.5, 5 / 6][q] * L, tb = tickBuf[q];
      tb[0] = xg; tb[1] = yb; tb[2] = xg; tb[3] = S.gateTop; setPts(ticks[q], tb, 2, false);
      setGeo(nums[q], 'x', xg); setWords(nums[q], int(v[CH.g0 + q] * SCALE[CH.g0 + q]));
    }
    const span = gateIdx >= 0 ? STENT_SPANS[['proximal', 'mid', 'distal'][gateIdx]] : STENT_SPANS.mid;
    setGeo(band, 'x', x0 + span[0] * L); setGeo(band, 'width', (span[1] - span[0]) * L); setGeo(band, 'opacity', gateIdx >= 0 ? ex : 0);
    glL.paint();
  }

  /** The numbers the traces read, from a set of channel values v (the shown ones, or the goal). */
  const tfix = fix2();
  function fillTrace(T, v) {
    T.sh = geomFix({ len: v[CH.len] * SCALE[CH.len], waist: v[CH.waist] * SCALE[CH.waist], trans: v[CH.trans] * SCALE[CH.trans] }, kind(), tfix);
    T.s = clamp(v[CH.s], 0, 1); T.site = v[CH.site]; T.d = v[CH.d] * SCALE[CH.d]; T.flowLpm = v[CH.flow] * SCALE[CH.flow];
    T.tract = v[CH.tract] * SCALE[CH.tract]; T.wall = v[CH.wall] * SCALE[CH.wall]; T.ends = v[CH.ends] * SCALE[CH.ends]; T.jet = v[CH.jet] * SCALE[CH.jet];
    T.dp = T.tract + T.wall + T.ends + T.jet; T.ppg = T.dp + v[CH.out] * SCALE[CH.out];
    T.kd = scanK(id);
    return T;
  }
  function paintTrace(v) {
    if (!tp) return;
    fillTrace(TT, v);
    TT.pLo = v[CH.pLo] * SCALE[CH.pLo]; TT.pHi = v[CH.pHi] * SCALE[CH.pHi]; TT.vHi = v[CH.vHi] * SCALE[CH.vHi];
    tp.paint(TT, clamp(v[CH.ex], 0, 1));
    glT.paint();
  }

  function paintLoss(v) {
    const on = clamp(v[CH.outOn], 0, 1), kx = B.w / Math.max(4, v[CH.max] * SCALE[CH.max]), ex = clamp(v[CH.ex], 0, 1);
    for (let i = 0; i < 4; i++) parts4[i] = Math.max(0, v[CH.tract + i] * SCALE[CH.tract + i]);
    const out = Math.max(0, v[CH.out] * SCALE[CH.out]) * on, dp = parts4[0] + parts4[1] + parts4[2] + parts4[3];
    const dpTen = printedParts(parts4, tenths), ppgTen = Math.round((dp + out) * 10), outTen = Math.max(0, ppgTen - dpTen);
    let x = B.x;
    for (let i = 0; i < 5; i++) {
      const val = i < 4 ? parts4[i] : out, w = val * kx;
      setGeo(segs[i], 'x', x); setGeo(segs[i], 'width', w); setGeo(segs[i], 'opacity', ex);
      // (a part's number is on its segment once the segment is as wide as the number is: its words' width at the size they are drawn in, never a fixed width, so a short
      // segment on a phone, where the words are larger in these units, is not left half faded)
      const wd = ten((i < 4 ? tenths[i] : outTen) / 10);
      setGeo(segTxt[i], 'x', x + w / 2); setGeo(segTxt[i], 'opacity', ex * numberOn(w, wd.length, fsU));
      setWords(segTxt[i], wd);
      x += w;
      // the key's item: its name and value, dimmed when the part is nothing (no narrowing, no jet), never taken away
      const dim = i < 4 ? (val < 0.05 ? 0.4 : 1) : on * (out < 0.05 ? 0.4 : 1);
      setGeo(keyDot[i], 'opacity', ex * dim); setGeo(keyTxt[i], 'opacity', ex * dim);
      setWords(keyTxt[i], `${i < 4 ? PART_NAMES[i] : 'Outside the stent'} ${ten((i < 4 ? tenths[i] : outTen) / 10)}`);
    }
    // the two marks over the bar: the stent's own drop, and (on to: 'ppg') the PPG
    const xA = B.x + dp * kx, xB = B.x + (dp + out) * kx;
    markBufA[0] = xA; markBufA[1] = B.markA + 6; markBufA[2] = xA; markBufA[3] = B.y; setPts(markA, markBufA, 2, false);
    markBufB[0] = xB; markBufB[1] = B.markB + 6; markBufB[2] = xB; markBufB[3] = B.y; setPts(markB, markBufB, 2, false);
    setGeo(markA, 'opacity', ex); setGeo(markAT, 'opacity', ex); setGeo(markB, 'opacity', ex * on); setGeo(markBT, 'opacity', ex * on);
    setGeo(markAT, 'x', Math.max(xA - 3, B.x + 50)); setWords(markAT, `Stent ${ten(dpTen / 10)}`);
    setGeo(markBT, 'x', Math.min(xB + 3, B.x + B.w - 46)); setWords(markBT, `PPG ${ten(ppgTen / 10)}`);
    // the brackets: along the length (tract and friction) against local (the ends and the jet)
    const alongTen = tenths[0] + tenths[1], localTen = tenths[2] + tenths[3], xm = B.x + (parts4[0] + parts4[1]) * kx, xe = xm + (parts4[2] + parts4[3]) * kx;
    const spans = [[B.x, xm], [xm, xe]];
    for (let q = 0; q < 2; q++) {
      const [a, b] = spans[q], bb = brBuf[q];
      bb[0] = a + 1; bb[1] = B.brY; bb[2] = a + 1; bb[3] = B.brY + 5; bb[4] = Math.max(a + 1, b - 1); bb[5] = B.brY + 5; bb[6] = Math.max(a + 1, b - 1); bb[7] = B.brY;
      setPts(brs[q], bb, 4, false); setGeo(brs[q], 'opacity', ex * smooth01((b - a - 2) / 10));
    }
    setGeo(brTxt[0], 'x', B.x); setWords(brTxt[0], `Along the length ${ten(alongTen / 10)}`);
    setGeo(brTxt[1], 'x', clamp(Math.max(xm, B.x + 122), B.x, B.x + B.w - 92));
    setWords(brTxt[1], `Local ${ten(localTen / 10)}${dpTen > 0 ? ` (${Math.round((100 * localTen) / dpTen)}%)` : ''}`);
    setGeo(brTxt[0], 'opacity', ex); setGeo(brTxt[1], 'opacity', ex);
    glB.paint();
  }

  const paintAll = () => { if (show.includes('lumen')) paintLumen(fol.v); if (show.includes('trace')) paintTrace(fol.v); if (show.includes('loss')) paintLoss(fol.v); };
  function writeAriaSoon() {
    const l = have ? `${id} side view: flow ${ten(R.flow)} L/min, peak velocity ${int(R.vel)} cm/s, lumen at the narrowest ${ten(R.lumen)} mm` : `${id}: no stent`;
    const t = have ? `${id}, pressure, energy lost and velocity along the stent (schematic): ${ten(R.ppg)} mmHg portal to IVC, ${ten(R.dp)} mmHg across the stent` : `${id}: no stent`;
    const b = have ? `${id}, where the pressure goes: ${ten(R.dp)} mmHg across the stent${toPpg ? `, ${ten(R.ppg)} mmHg PPG` : ''}` : `${id}: no stent`;
    if (l !== ariaText[0] || b !== ariaText[1] || t !== ariaText[2]) { ariaText[0] = l; ariaText[1] = b; ariaText[2] = t; if (!ariaAsk) ariaAsk = restPass(() => { ariaAsk = 0; picL.setAttribute('aria-label', ariaText[0]); picB.setAttribute('aria-label', ariaText[1]); picT?.setAttribute('aria-label', ariaText[2]); }); }
  }

  const reduce = typeof matchMedia === 'function' ? reduceMotionMQ : null;
  function tick() {
    raf = 0;
    const moving = fol.at(easeNow());
    paintAll();
    if (moving && el.isConnected) raf = nextFrame(tick);
    else { if (moving) { fol.snap(fol.to); paintAll(); } animating(false); writeAriaSoon(); }
  }
  function refresh(live) {
    read(live);
    if (!hasShown || reduce?.matches || !el.isConnected) {
      fol.snap(goal); hasShown = true;
      if (raf) { cancelFrame(raf); raf = 0; }
      animating(false); paintAll(); writeAriaSoon(); return;
    }
    if (fol.goal(goal, easeNow())) { animating(true); if (!raf) raf = nextFrame(tick); return; }
    // (still, and nothing it shows changed: no redraw)
  }

  function configure(t) {
    const v = t?.vessel === 'DIPS' ? 'DIPS' : 'TIPS';
    const fresh = v !== id || !hasShown;
    if (fresh) { id = v; hasShown = false; }
    tool = t || null;
    show = (Array.isArray(t?.show) ? t.show : ['lumen']).filter((k) => k === 'lumen' || k === 'loss' || k === 'trace');
    if (!show.length) show = ['lumen'];
    panels = Array.isArray(t?.panels) ? PANELS.filter((k) => t.panels.includes(k)) : PANELS.slice();
    if (!panels.length) panels = PANELS.slice();
    if (show.includes('trace')) { const np = traceMade().layout(panels); stageT.style.aspectRatio = `${VW} / ${traceH(np)}`; }
    toPpg = t?.to === 'ppg' ? 1 : 0;
    maxMm = clamp(+t?.max || DEFAULT_MAX, 6, 40);
    refresh();
    paintAll();   // (a picture newly shown, or its panels changed, is drawn even if the numbers did not move)
    fadeShown(stageL, show.includes('lumen')); if (stageT) fadeShown(stageT, show.includes('trace')); fadeShown(stageB, show.includes('loss'));   // (a picture the slide does not show fades out, never pops)
  }
  const fitAll = () => {
    const w = readMetric(stageL, 'offsetWidth') || (stageT && readMetric(stageT, 'offsetWidth')) || readMetric(stageB, 'offsetWidth');
    if (w > 0) {
      const fs = clamp(12 / (w / VW), 9, 14);
      fsU = fs;
      for (const e of wordsAll) e.setAttribute('font-size', fs);
      glL.relook(); glT?.relook(); glB.relook();
    }
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fitAll) : null;
  ro?.observe(stageL); ro?.observe(stageB);
  const dispose = () => { ro?.disconnect(); if (raf) cancelFrame(raf); raf = 0; animating(false); glL.dispose?.(); glT?.dispose?.(); glB.dispose?.(); };
  return {
    el, configure, dispose,
    /** The slide's numbers (its fingerprint): the card shows these, not the beat-to-beat live ones. */
    pin(fp) { pinned = fp || null; refresh(); },
    /** A live frame (the Tests dock): used while the card has no slide's numbers pinned. */
    update(f) { if (!pinned && f) refresh(f); },
  };
}
