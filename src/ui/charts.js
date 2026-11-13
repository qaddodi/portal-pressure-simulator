// Dock charts (blueprint §9.2): the pressure profile.

import { NODES } from '../engine/topology.js';
import { PROFILE_PATHS, SHORT } from './anatomy.js';
import { pressureColor } from './colormap.js';
import { store, hiddenNow } from './store.js';
import { h, fmt, canvasSize, cssVar, cssAlpha, clamp, createEaser, axisTop } from './util.js';
import { frameFor, cancelFrame, paceMs } from './frame.js';
import { tenthGap } from '../engine/gap.js';
import { shownOr } from './shown.js';
import { monotoneSegs, curveTester } from './curve-near.js';
import { glideMoving } from './idle-keys.js';
import { plotFill } from './plot-look.js';
import { D_SMALL, EASE_ARRIVE } from './ease.js';
import { createTraceGL, fitPen } from './trace-gl.js';
import { restPass, cancelRest } from './rest-pass.js';
import { measure } from './glyph-measure.js';
import { glWords } from './gl-words.js';
import { textSoon, dataSoon } from './class-soon.js';
import { hvpgSev, ppgSev } from '../engine/pressure-cuts.js';
const nextFrame = frameFor('charts');

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const ARTERIAL = new Set(['AO', 'HA']);

// ── Nothing is allocated on a frame's path (docs/gpu-practices.md, "Allocate once"): what a draw needs is kept here, once, and written
// in place. Everything below that builds an array, an object, a closure or a string does it at load or in createProfile, never in a draw.

// The theme's colours: one object kept and filled in place on every call (the tokens are read from util.js's cache, so a theme change
// shows on the next draw). A caller reads it at once and does not keep it.
const SERIES_VARS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
const THEME = {
  text: '', muted: '', faint: '', border: '', axis: '', gridOn: '', surface: '', surface2: '', accent: '', danger: '', rev: '', ok: '', artery: '', caution: '',
  series: ['', '', '', '', '', '', '', ''],
};
export const theme = () => {
  const t = THEME;
  t.text = cssVar('--text'); t.muted = cssVar('--text-2'); t.faint = cssVar('--text-3'); t.border = cssVar('--grid'); t.axis = cssVar('--axis'); t.gridOn = cssVar('--border-strong');
  t.surface = cssVar('--surface'); t.surface2 = cssVar('--surface-2'); t.accent = cssVar('--accent'); t.danger = cssVar('--danger');
  t.rev = cssVar('--flow-reversed'); t.ok = cssVar('--flow-normal'); t.artery = cssVar('--artery'); t.caution = cssVar('--caution');
  for (let i = 0; i < SERIES_VARS.length; i++) t.series[i] = cssVar(SERIES_VARS[i]);
  return t;
};
// A font string is built once for each weight and size asked for, and found again by them (the same string every time, as the template
// made before). The few dozen the app asks for fit; past FONT_CAP the oldest is replaced.
const FONT_CAP = 128;
const fontW = new Array(FONT_CAP).fill(null), fontPx = new Array(FONT_CAP).fill(null), fontStr = new Array(FONT_CAP).fill('');
let fontN = 0, fontNext = 0;
export const FONT = (w = 500, px = 11) => {
  for (let i = 0; i < fontN; i++) if (fontW[i] === w && fontPx[i] === px) return fontStr[i];
  const s = `${w} ${px}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
  let k = fontN;
  if (fontN < FONT_CAP) fontN++; else { k = fontNext; fontNext = (fontNext + 1) % FONT_CAP; }
  fontW[k] = w; fontPx[k] = px; fontStr[k] = s;
  return s;
};
// A text's width in the context's current font, measured once (labels repeat on every draw). Forgotten when the web fonts
// arrive, so a width taken in a fallback font never stays.
// (A table of fixed size, found by the text's characters and the font's length and checked against both, so a lookup builds no key;
// a text with no free slot among the eight after its own replaces the first, and is measured again when asked for next.)
const W_SLOTS = 1024, W_PROBES = 8, NONE = {};
const widths = {
  fonts: new Array(W_SLOTS).fill(NONE), texts: new Array(W_SLOTS).fill(NONE), w: new Float64Array(W_SLOTS),
  clear() { this.fonts.fill(NONE); this.texts.fill(NONE); },
};
globalThis.document?.fonts?.addEventListener?.('loadingdone', () => widths.clear());
export const textW = (ctx, t) => {
  const font = ctx.font;
  let key = font?.length | 0;
  if (typeof t === 'string') for (let i = 0; i < t.length; i++) key = (Math.imul(key, 31) + t.charCodeAt(i)) | 0;
  const home = key & (W_SLOTS - 1);
  let free = -1;
  for (let p = 0, at = home; p < W_PROBES; p++, at = (at + 1) & (W_SLOTS - 1)) {
    if (widths.texts[at] === NONE) { free = at; break; }
    if (widths.texts[at] === t && widths.fonts[at] === font) return widths.w[at];
  }
  const w = ctx.measureText(t).width;
  const at = free >= 0 ? free : home;
  widths.fonts[at] = font; widths.texts[at] = t; widths.w[at] = w;
  return w;
};
// DOM writes only when something changed: a write on every frame, even of the same text, marks the page for a fresh
// style and layout pass.
const setDisplay = (node, d) => { if (node && node.style.display !== d) node.style.display = d; };

// A number as an axis label, from a table made at load (the axis steps are whole numbers).
const NUM_TEXT = [];
for (let i = 0; i <= 1000; i++) NUM_TEXT.push(String(i));
const numText = (p) => (Number.isInteger(p) && p >= 0 && p < NUM_TEXT.length ? NUM_TEXT[p] : fmt(p, 0));

// The fade between the chart's forms: its keyframes and timing, made once (animate() reads them as it is called).
const FADE_KEYS = [{ opacity: 0 }, { opacity: 1 }], FADE_OPTS = { duration: D_SMALL, easing: EASE_ARRIVE };
// The dash patterns the lines use (setLineDash copies what it is given).
const NO_DASH = [], DASH_HEALTHY = [4, 5], DASH_SNAP = [1.5, 4], DASH_LEAD = [2, 3], DASH_PRED = [6, 4];
// A metrics object a frame does not carry (read, never written).
const NO_METRICS = Object.freeze({});
// Where a station's value may stand beside its dot, in the order tried: a multiple of sx = half the text + 12 across, and a step down
// the page (above first and beside before below: the brackets run along the bottom).
const CAND_KX = [0, 1, -1, 0, 1, -1, 1, -1, 0, 1, -1, 0, 1, -1];
const CAND_DY = [-18, -10, -10, -32, -24, -24, 0, 0, 18, 10, 10, 32, 24, 24];
const LIVER_AT = [0.5, 0.3, 0.7, 0.15, 0.85];
const C30 = Math.cos(Math.PI / 6);

// What each path draws, fixed by its definition (anatomy.js): its venous stations (the arterial pressure sits far off the portal scale and
// says little here), the label of each bracket, and the most stations and brackets any path has (the size of the buffers).
const STATIONS = new Map(), DIM_NAME = new Map();
let MAXN = 1, MAXD = 1;
for (const p of PROFILE_PATHS) {
  STATIONS.set(p.id, p.nodes.filter((n) => !ARTERIAL.has(n)));
  MAXN = Math.max(MAXN, p.nodes.length);
  MAXD = Math.max(MAXD, p.dims ? p.dims.length : 0);
  if (p.dims) for (const d of p.dims) DIM_NAME.set(d.k, `${d.k} `);
}
// The widest span a canvas can have is 32767 device px: one candidate place per 12 px each way, and two past the ends.
const XS_CAP = 8192;

const makeRect = () => ({ x0: 0, x1: 0, y0: 0, y1: 0 });
const makeRects = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(makeRect()); return a; };
// A polyline kept between draws: `list` is what smoothPath and curveTester are handed, one [x, y] pair per point, its length the
// number of points; the pairs are made once and written in place.
const makePoly = (cap) => { const pairs = []; for (let i = 0; i < cap; i++) pairs.push([0, 0]); return { pairs, list: [], n: 0 }; };
const polyBegin = (poly) => { poly.n = 0; };
const polyPush = (poly, px, py) => { const k = poly.n++; const pr = poly.pairs[k]; pr[0] = px; pr[1] = py; poly.list[k] = pr; };
const polyEnd = (poly) => { poly.list.length = poly.n; return poly.list; };
// A geometry kept between draws (see geometry in createProfile): x and y read its own fields.
function makeGeo() {
  const g = { w: 0, hh: 0, stations: null, L: 0, R: 0, T: 0, B: 0, slot: 0, maxP: 0, x: null, y: null, stagger: false, hasArt: false, artY: 0, roomy: false, band: false };
  g.x = (i) => g.L + g.slot * (i + 0.5);
  g.y = (p) => g.T + (g.hh - g.T - g.B) * (1 - clamp(p, -2, g.maxP) / g.maxP);
  return g;
}
const makeDots = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ i, cx: 0, cy: 0, col: '' }); return a; };
// One bracket pill's place, kept (a pill whose bracket is hidden has on = false).
const makeItems = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ on: false, a: 0, b: 0, col: '', txt: '', num: '', tw1: 0, tw: 0, x0: 0, x1: 0, ty: 0, tx: 0 }); return a; };
// Between frames the chart has no pen, and measures words as the GPU sets them, from the atlas's own Inter: no canvas.
const idleW = { width: 0 };
const idlePen = { font: '', measureText(t) { idleW.width = measure(t, FONT(500, 12)); return idleW; } };
const sameNum = (a, b) => a === b || (a !== a && b !== b);

// A smooth curve through the points that never overshoots them (monotone cubic, Fritsch–Carlson),
// so a pressure that only falls is never drawn rising between two stations.
function smoothPath(ctx, pts) {
  const n = pts.length;
  if (!n) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  const segs = monotoneSegs(pts);
  if (!segs) { for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]); return; }
  for (let i = 0; i < segs.length; i++) { const s = segs[i]; ctx.bezierCurveTo(s[2], s[3], s[4], s[5], s[6], s[7]); }
}

// Whether a box of the label rows comes within a gap of any of the first n boxes of a pool (overlap: 2 px clear at least; overlap4: 4).
const overlap = (r, o) => r.x0 < o.x1 + 2 && r.x1 > o.x0 - 2 && r.y0 < o.y1 + 2 && r.y1 > o.y0 - 2;   // (2 px clear, at least)
const overlap4 = (r, o) => r.x0 < o.x1 + 4 && r.x1 > o.x0 - 4 && r.y0 < o.y1 + 4 && r.y1 > o.y0 - 4;
const anyOverlap = (pool, n, r) => { for (let i = 0; i < n; i++) if (overlap(r, pool[i])) return true; return false; };
const anyOverlap4 = (pool, n, r) => { for (let i = 0; i < n; i++) if (overlap4(r, pool[i])) return true; return false; };
// Where a polyline (pp: [x, y] pairs) stands at px, and whether it passes through a box (r) or within 5 px of it.
const lineY = (pp, px) => {
  for (let q = 0; q < pp.length - 1; q++) if (px >= pp[q][0] && px <= pp[q + 1][0]) return pp[q][1] + (pp[q + 1][1] - pp[q][1]) * (px - pp[q][0]) / (pp[q + 1][0] - pp[q][0] || 1);
  return null;
};
const hitsLine = (r, pp) => { for (let px = r.x0; px <= r.x1 + 3; px += 4) { const ly = lineY(pp, Math.min(px, r.x1)); if (ly != null && ly > r.y0 - 5 && ly < r.y1 + 5) return true; } return false; };

// ── Pressure profile ("hydraulic grade line") ────────
export function createProfile() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'profile' });
  const box = h('div', { class: 'chart-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure profile along the selected path' });
  box.append(cv);
  // (Drawn by the GPU, words and all, over its canvas; the canvas itself only where WebGL2 cannot draw, or with ?tracegl=0.)
  const gpu = createTraceGL(cv, { redraw: () => draw() });
  let pen = null;   // (the context a frame draws with, while it draws)
  // (what shows the chart, for a fade: the GPU's picture over the canvas, or the canvas)
  const faceOf = (c) => (c.style.opacity === '0' && gpu?.canvas) || c;
  const legend = h('div', { class: 'legend-inline' },
    h('span', {}, h('i', { style: { borderColor: 'var(--text)' } }), 'Now'),
    h('span', {}, h('i', { style: { borderColor: 'var(--text-3)', borderTopStyle: 'dashed' } }), 'Healthy'),
    h('span', { class: 'lg-compare', style: { display: 'none' } }, h('i', { style: { borderColor: 'var(--s1)', borderTopStyle: 'dotted' } }), 'Snapshot A'),
    h('span', { class: 'lg-pred', style: { display: 'none' } }, h('i', { style: { borderColor: 'var(--accent)', borderTopStyle: 'dashed' } }), 'Your prediction'));
  const note = h('div', { class: 'sub' }, 'Pressure from gut to heart. The steepest drop marks the site of highest resistance. The spans along the bottom show the HVPG (WHVP − FHVP) and the PPG (portal vein − IVC pressure).');
  // (The note under the profile changes with the drawing: drawn on the GPU while it changes, gl-words.js, never written in a frame.)
  const offscale = h('div', { class: 'ctl-sub', id: 'profileOffscale' }), offscaleW = glWords(offscale);
  const side = h('div', { class: 'chart-side' }, legend, note, offscale);
  // The three readings under the chart, as figures (13 Nov 2026): HVPG, PPG and the portal pressure, each with its word only when it is not normal.
  // (Written between frames, and only when the text or the rating changed.)
  const READ = [['hvpg', 'HVPG', hvpgSev, { caution: 'Mild', danger: 'CSPH' }, 'trueHVPG'], ['ppg', 'PPG', ppgSev, { caution: 'High', danger: 'Bleed risk' }, 'pv'], ['pv', 'Portal vein', null, null, 'pv']]
    .map(([id, name, sev, words, hideKey]) => {
      const val = h('span', { class: 'num' }, '—'), st = h('span', { class: 'note' });
      return { id, sev, words, hideKey, val, st, txt: '—', stTxt: '', rate: '', el: h('div', { 'data-id': id }, h('span', { class: 'lab' }, name), h('span', { class: 'v' }, val, h('small', {}, 'mmHg')), st) };
    });
  const strip = h('div', { class: 'pp-strip strip', 'aria-label': 'HVPG, PPG and portal vein pressure' }, READ.map((x) => x.el));
  function readStrip(f) {
    const m = f?.metrics, hid = hiddenNow();
    for (let i = 0; i < READ.length; i++) {
      const x = READ[i], v = m?.[x.id], on = Number.isFinite(v) && !hid?.has(x.hideKey);
      const t = on ? v.toFixed(1) : '—', rate = on && x.sev ? x.sev(v) : '', w = rate ? x.words[rate] || '' : '';
      if (t !== x.txt) { x.txt = t; textSoon(x.val, t); }
      if (w !== x.stTxt) { x.stTxt = w; textSoon(x.st, w); }
      if (rate !== x.rate) { x.rate = rate; dataSoon(x.el, 'sev', rate || null); }
    }
  }
  el.append(box, side, strip);
  let pathId = 'main';
  const curPath = () => { for (let i = 0; i < PROFILE_PATHS.length; i++) if (PROFILE_PATHS[i].id === pathId) return PROFILE_PATHS[i]; return PROFILE_PATHS[0]; };
  const nm = (n) => curPath().names?.[n] || SHORT[n] || n;
  // F is what is drawn: the frame with its pressures eased toward the model's (breath- and
  // beat-filtered) values, so the line, dots and labels glide rather than jump when values change.
  // (Kept, and written in place by ease: a draw reads only its pressures, F.P and F.Pf, and the frame's metrics.)
  let F = null, Fraw = null, axisMax = 15, easeRaf = 0;
  const Fshown = { P: null, Pf: undefined, metrics: undefined };
  const axisIn = [0];   // (the axis top the easer is given, written in place)
  // On screen: kept by an observer rather than read from cv.offsetParent on every glide frame, which forced a style and
  // layout pass each time (as the Over time trace does). Back on screen, the glide picks up again.
  let seen = null;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => {
    const was = seen; seen = es[es.length - 1].isIntersecting;
    if (seen && !was && Fraw) { cancelFrame(easeRaf); easeRaf = nextFrame(easeKick); }
  }) : null;
  io?.observe(cv);
  const shown = () => seen !== false;   // (until the observer's first word, or with none: drawn, never a layout read to find out)
  // The glide's two frame callbacks, made once: one starts it again (back on screen, a pill still on its way), the other waits out the
  // pace between model frames (easeAt: when the glide's last step was taken; only one is ever asked for at a time).
  let easeAt = 0;
  const easeKick = () => { if (cv.isConnected && shown()) ease(); };
  const easeNext = (t) => { if (t - easeAt < paceMs()) { easeRaf = nextFrame(easeNext); return; } if (cv.isConnected && shown()) ease(); };
  // (The pressures as shown: the model's beat-filtered ones on the shown state's filter, so the line, its dots and its numbers glide
  // between model frames as the bar and the vessels do; a drift under what the chart prints is taken at once, so a steady model
  // draws nothing. Premium-feel R4.)
  // (small: one step of the last digit the chart prints, 0.1 mmHg, half a pixel of the plot: a move that small shows the same whether it glides or lands.)
  const easeP = createEaser(undefined, { small: 0.1, jumps: true }), easeAxis = createEaser();
  let easePill = createEaser(0.18);
  let pillMoving = false;
  // (Only the stations the chart draws keep its glide going: the arterial pressures, which it never draws, swing past what it prints with
  // every beat and breath, and with them in the glide a steady model redrew the chart on nearly every frame.)
  // (Made for each path at the start, with the strip's stations: the paths are fixed, so nothing is made as a glide runs.)
  const drawnAt = new Map();
  const drawnMask = (path) => drawnAt.get(path.id);
  const maskOf = (path) => {
    const m = new Uint8Array(NODES.length);
    for (const n of [...path.nodes, ...STRIP]) if (!ARTERIAL.has(n) && NI[n] != null) m[NI[n]] = 1;
    return m;
  };
  function ease() {
    if (!Fraw) return;
    const src = Fraw.Pf || Fraw.P;
    const { v: shownP, moving: mP } = easeP.step(src, drawnMask(curPath()));
    const path = curPath();
    const st = store.get();
    let top = 0;
    for (let i = 0; i < path.nodes.length; i++) {
      const n = path.nodes[i];
      if (ARTERIAL.has(n)) continue;
      top = Math.max(top, src[NI[n]], st.healthy?.P?.[NI[n]] ?? 0, st.compareSnap?.P?.[NI[n]] ?? 0);
    }
    axisIn[0] = axisTop(top);
    const { v: ax, moving: mA } = easeAxis.step(axisIn);
    axisMax = ax[0];
    // (The chart draws the eased copy of the model's beat-filtered pressures, F.Pf, where the frame carries them, as every frame after
    // the first does, and of its pressures before them. It settles once the model does, so a steady model repaints nothing.)
    const moving = glideMoving(mP, mA);
    Fshown.P = shownP; Fshown.Pf = Fraw.Pf ? shownP : Fraw.Pf; Fshown.metrics = Fraw.metrics;
    F = Fshown;
    draw();
    cancelFrame(easeRaf);
    // Model frames arrive about ten times a second; the glide runs between them on every frame the screen offers
    // (15 a second in Battery saver) while the axis or a pill is still on its way, and stops once they have arrived.
    easeAt = performance.now();
    if (moving || pillMoving) easeRaf = nextFrame(easeNext);
  }
  let predict = null; // { on, values: Map(station → P), done }
  let dragging = false;

  // band: the HVPG and PPG brackets in rows of their own under the station names (BAND_ROW each), the plot above them shorter,
  // where they find no clear spot inside a short plot (a phone's half sheet): the chart, never the strip, while it has its room.
  // (Written into `out`, kept: the draw's own geometry, or the press's, which a drag reads between draws. The result is read at once.)
  const geo = makeGeo(), geoPress = makeGeo(), geoNws = new Float64Array(MAXN);
  function geometry(band = false, out = geo) {
    const { w, h: hh } = canvasSize(cv);
    const path = curPath();
    // Venous stations only: the arterial pressure sits far off the portal scale and says little here.
    const stations = STATIONS.get(path.id);
    const slot0 = (w - 56) / stations.length;
    // Close together, the station names turn 30° on one row (each ending under its point).
    const stagger = slot0 < 74;
    const m = pen || idlePen;   // (the pen's own widths; between frames Inter's from the GPU atlas: no canvas)
    m.font = FONT(500, 12);
    let tilt = 0;
    if (stagger) { let widest = -Infinity; for (let i = 0; i < stations.length; i++) widest = Math.max(widest, textW(m, nm(stations[i]))); tilt = widest * 0.5; }
    // Arterial stations sit far above the venous scale: they are drawn in a band above a broken
    // axis (//) with their true value, never clipped.
    let hasArt = false;
    for (let i = 0; i < stations.length; i++) if (ARTERIAL.has(stations[i])) { hasArt = true; break; }
    const roomy = hh > 230;
    // The axis follows the highest point (now, healthy or the compared moment), eased, not fixed at 30.
    const maxP = axisMax;
    // The plot is one rounded panel the chart's full width (his G2 look, plot-look.js): the axis numbers stand in a strip inside its edge,
    // 8 px in from it and 6 px clear of the lines, as wide as the widest number (two digits, three only as the axis passes 100, eased in).
    const w2 = textW(m, '88'), w3 = textW(m, '888');
    let L = Math.ceil(w2 + (w3 - w2) * clamp((maxP - 95) / 5, 0, 1)) + 14;
    const R = 10, T = hasArt ? (roomy ? 58 : 34) : 28, B = (stagger ? Math.ceil(tilt) + 20 : 26) + (band ? (path.dims ? path.dims.length : 0) * BAND_ROW + 2 : 0);
    // (Names turned 30° end under their points and run down and left: the strip widens until the first starts 8 px in from the panel's edge.)
    if (stagger) {
      const nws = geoNws;
      for (let i = 0; i < stations.length; i++) nws[i] = textW(m, nm(stations[i]));
      for (let k = 0; k < 3; k++) {
        const sl = (w - L - R) / stations.length;
        let need = -Infinity;
        for (let i = 0; i < stations.length; i++) need = Math.max(need, 8 + C30 * nws[i] + 3 - (L + sl * (i + 0.5) + 3));
        if (need <= 0) break;
        L += Math.ceil(need);
      }
    }
    const slot = (w - L - R) / stations.length;
    const artY = roomy ? T - 24 : T - 20;
    out.w = w; out.hh = hh; out.stations = stations; out.L = L; out.R = R; out.T = T; out.B = B; out.slot = slot; out.maxP = maxP;
    out.stagger = stagger; out.hasArt = hasArt; out.artY = artY; out.roomy = roomy; out.band = band;
    return out;
  }

  // The compact strip (as a ladder card picks its full plot or its strip by size, a667e9f): where the plot would be too short
  // for its axis numbers, the LIVER caption and both pills to stand clear (a 320 px phone's half sheet, about 40 px), five
  // stations in a row, their names over their readings, with the HVPG and PPG as brackets under them. The full chart returns
  // as soon as the plot has its room (the sheet pulled up). Never while a prediction is being drawn on the plot.
  const STRIP = ['CONF', 'SIN_R', 'RHV', 'IVCS', 'RA'], STRIP_NAME = { CONF: 'Portal v.', SIN_R: 'Sinusoid', RHV: 'RHV', IVCS: 'IVC', RA: 'RA' };
  for (const p of PROFILE_PATHS) drawnAt.set(p.id, maskOf(p));
  const PLOT_MIN = 130;   // (two pill rows of 24, the LIVER caption, and the stations' own spread)
  // (With the brackets in their band under the names, the plot holds only the line, its dots and their values: the strip shows
  // only where even that is shorter than BAND_PLOT_MIN.)
  const BAND_PLOT_MIN = 72, BAND_ROW = 22;
  // A station's reading: the bar's own (shown.js) where a gradient ends, so a bracket's label is the difference of the two
  // readings written at its ends, after rounding, and the bar's number too (sweep 2 review item 13).
  const AT_SHOWN = { CONF: 'pv', IVCS: 'ivc', RHV: 'fhvp' };
  const reading = (n, PM) => (AT_SHOWN[n] ? shownOr(AT_SHOWN[n], PM[NI[n]]) : PM[NI[n]]);
  // (A gradient measured elsewhere, the HVPG's wedged pressure, takes that reading for its upper end.)
  const gapOf = (d, m, hv, lv) => tenthGap(d.hiM && m[d.hiM] != null ? shownOr(d.hiM, m[d.hiM]) : hv, d.loM && m[d.loM] != null ? shownOr(d.loM, m[d.loM]) : lv, hv - lv);
  let wasStrip = null, formLock = null;
  const stripNow = (g) => !predict?.on && g.hh - g.T - g.B < (g.band ? BAND_PLOT_MIN : PLOT_MIN);
  // (Which form shows: a fade when it changes; the strip's own key. A full chart whose labels cannot all stand clear switches
  // to the strip for that size and stays there, so a beat's wobble never flips it back and forth.)
  const setForm = (strip) => {
    if (wasStrip !== null && strip !== wasStrip) faceOf(cv).animate?.(FADE_KEYS, FADE_OPTS);   // (a short fade as it changes form)
    wasStrip = strip;
    setDisplay(legend, strip ? 'none' : '');   // (the strip draws no lines to key)
  };
  // The strip's kept columns: each station's reading as a number and as written, its name's width and its text's, its column's width and centre.
  const NS = STRIP.length;
  const sVals = new Array(NS).fill(0), sTxt = new Array(NS).fill(''), sNw = new Float64Array(NS), sTw = new Float64Array(NS), sCw = new Float64Array(NS), sCx = new Float64Array(NS);
  const sRows = { k: 0, v: 0, hvpg: 0, ppg: 0 };   // (the baselines of the names, the readings, and the two brackets)
  function drawStrip(ctx, c, w, hh) {
    const PM = F.Pf || F.P, m = F.metrics || NO_METRICS, hid = hiddenNow();
    // Each column as wide as its name (6 px apart) or its reading with room for a connector (12 px or more) between,
    // whichever is wider, the rest of the row shared out evenly; the block centred top to bottom in the box. (By the names
    // alone, the IVC and RA readings left no room for their connector, sweep 2 review item 11.)
    const x0 = 12, x1 = w - 12;
    for (let i = 0; i < NS; i++) { const v = reading(STRIP[i], PM); sVals[i] = v; sTxt[i] = fmt(v, 1); }
    ctx.font = FONT(600, 12);
    for (let i = 0; i < NS; i++) sNw[i] = textW(ctx, STRIP_NAME[STRIP[i]]);
    let vf = 15;
    for (; vf >= 13; vf--) {
      ctx.font = FONT(700, vf);
      for (let i = 0; i < NS; i++) sTw[i] = textW(ctx, sTxt[i]);
      let need = 0;
      for (let i = 0; i < NS; i++) need += Math.max(sNw[i] + 6, sTw[i] + 24);
      if (need <= x1 - x0) break;
    }
    let cwSum = 0;
    for (let i = 0; i < NS; i++) { sCw[i] = Math.max(sNw[i] + 6, sTw[i] + 24); cwSum += sCw[i]; }
    const gap = Math.max(0, (x1 - x0 - cwSum) / NS);
    let at = x0 + gap / 2;
    for (let i = 0; i < NS; i++) { sCx[i] = at + sCw[i] / 2; at += sCw[i] + gap; }
    const sc = Math.min(1, Math.max(0.8, hh / 112));   // (rows close up a little in a shorter box)
    sRows.k = 18 * sc; sRows.v = 44 * sc; sRows.hvpg = 72 * sc; sRows.ppg = 98 * sc;
    const top = sRows.k - 12, bot = sRows.ppg + 8, dy = Math.max(0, (hh - (bot - top)) / 2 - top);
    sRows.k = Math.round(sRows.k + dy); sRows.v = Math.round(sRows.v + dy); sRows.hvpg = Math.round(sRows.hvpg + dy); sRows.ppg = Math.round(sRows.ppg + dy);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // The names, then the readings joined by a line in the pressure's colour that stops short of each number.
    ctx.fillStyle = c.muted; ctx.font = FONT(600, 12);
    for (let i = 0; i < NS; i++) ctx.fillText(STRIP_NAME[STRIP[i]], sCx[i], sRows.k);
    ctx.font = FONT(700, vf);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 0; i < NS - 1; i++) {
      const a = sCx[i] + sTw[i] / 2 + 6, b = sCx[i + 1] - sTw[i + 1] / 2 - 6;
      const gr = ctx.createLinearGradient(a, 0, b, 0); gr.addColorStop(0, pressureColor(sVals[i])); gr.addColorStop(1, pressureColor(sVals[i + 1]));
      ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(a, sRows.v - 5); ctx.lineTo(Math.max(a, b), sRows.v - 5); ctx.stroke();
    }
    ctx.fillStyle = c.text;
    for (let i = 0; i < NS; i++) ctx.fillText(sTxt[i], sCx[i], sRows.v);
    // The brackets: the name and reading in the line's gap when the bracket has room, else just past its right end.
    const dims = curPath().dims;
    if (dims) for (let di = 0; di < dims.length; di++) {
      const d = dims[di];
      if (d.hide && hid?.has(d.hide)) continue;
      const a = STRIP.indexOf(d.hi), b = STRIP.indexOf(d.lo);
      if (a < 0 || b < 0) continue;
      const v = gapOf(d, m, reading(d.hi, PM), reading(d.lo, PM));
      const col = v >= d.bad ? c.danger : v >= d.warn ? c.caution : c.muted;
      const yy = d.k === 'HVPG' ? sRows.hvpg : sRows.ppg, bx0 = sCx[a], bx1 = sCx[b], name = DIM_NAME.get(d.k), num = fmt(v, 1);
      ctx.font = FONT(600, 12); const w1 = ctx.measureText(name).width; ctx.font = FONT(700, 12.5); const w2 = ctx.measureText(num).width;
      const lw = w1 + w2, inl = bx1 - bx0 - lw - 16 >= 8, lx = inl ? (bx0 + bx1) / 2 - lw / 2 : bx1 + 8;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'butt'; ctx.beginPath();
      ctx.moveTo(bx0, yy - 4); ctx.lineTo(bx0, yy + 4); ctx.moveTo(bx1, yy - 4); ctx.lineTo(bx1, yy + 4); ctx.moveTo(bx0, yy);
      if (inl) { ctx.lineTo(lx - 6, yy); ctx.moveTo(lx + lw + 6, yy); }
      ctx.lineTo(bx1, yy); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c.muted; ctx.font = FONT(600, 12); ctx.fillText(name, lx, yy + 0.5);
      ctx.fillStyle = col === c.muted ? c.text : col; ctx.font = FONT(700, 12.5); ctx.fillText(num, lx + w1, yy + 0.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    }
    // The unit under the last station, on the PPG row (whose bracket ends at the IVC).
    ctx.fillStyle = c.faint; ctx.font = FONT(500, 12); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('mmHg', x1, sRows.ppg + 0.5); ctx.textBaseline = 'alphabetic';
  }

  // (The brackets move between the plot and the band by a fade in place, never a glide across the line and the numbers.)
  function bandFade() { easePill = createEaser(0.18); faceOf(cv).animate?.(FADE_KEYS, FADE_OPTS); }
  function draw() {
    if (!F) return;
    const p = fitPen(cv, gpu);
    pen = p.ctx;
    try { drawWith(p.ctx, p.w, p.h); } finally { pen = null; p.ctx.end?.(); }
  }

  // What a draw works in, kept (a draw allocates nothing). A draw is not re-entered, but for the one that starts another and returns at once
  // (the brackets taking their band, below), which uses none of it afterwards.
  const venousIdx = new Int32Array(MAXN);           // (the stations the curve runs through, in order; venousN of them)
  let venousN = 0;
  const now = [];                                  // (each station's reading, as the labels read it)
  const polyNow = makePoly(MAXN), polyHealthy = makePoly(MAXN), polySnap = makePoly(MAXN), polyPred = makePoly(MAXN);
  let haveH = false;                                // (whether the healthy line is drawn this time: polyHealthy and its tester are this draw's)
  const CURVE = 0, HEALTHY = 1;
  const testers = new Map();                        // (CURVE and HEALTHY: how near a box comes to each line)
  const dots = makeDots(MAXN);                      // (each station's dot: its place, colour and index)
  // The boxes the labels keep clear of: the dots, then each value, then the LIVER caption; the pill and bracket searches' own, and the
  // spot a pill takes. A pool holds at most a dot, a value and a caption's worth for each station (3 x MAXN and a few), so none is made late.
  const takenPool = makeRects(3 * MAXN + 8), claimedPool = makeRects(MAXD + 1);
  let takenN = 0, claimedN = 0;
  const okR = makeRect(), okBar = makeRect(), bestSpot = { yy: 0, lx: 0 };
  const valTxt = [], valX = new Float64Array(MAXN), valSlot = new Int32Array(MAXN);
  let valN = 0;
  const spanLo = new Float64Array(MAXD + 1), spanHi = new Float64Array(MAXD + 1);
  let spanN = 0;
  const items = makeItems(MAXD + 1), pillIn = [];
  const xsBuf = new Float64Array(XS_CAP), gapIdx = new Int32Array(3 * MAXN + 8);
  let xsN = 0;
  const LC = { on: false, bx: 0, bw: 0 };           // (the liver band, where its caption may go)
  // The form's key (size, path, hidden readouts, prediction on): a change starts the form over. Compared in place.
  const FL = { w: 0, h: 0, path: '', pred: false, hid: [], hidN: 0, strip: false, band: false };
  const formKeyIs = (w0, hh0, predOn, hid) => {
    if (formLock === null || !sameNum(FL.w, w0) || !sameNum(FL.h, hh0) || FL.path !== pathId || FL.pred !== predOn) return false;
    let k = 0;
    if (hid) for (const v of hid) { if (k >= FL.hidN || FL.hid[k] !== v) return false; k++; }
    return k === FL.hidN;
  };
  const setFormKey = (w0, hh0, predOn, hid) => {
    FL.w = w0; FL.h = hh0; FL.path = pathId; FL.pred = predOn; FL.hidN = 0;
    if (hid) for (const v of hid) FL.hid[FL.hidN++] = v;
  };
  // The draw the strip is drawn in, for toStrip (set as the draw starts).
  let stripCtx = null, stripC = null, stripW = 0, stripH = 0;
  const toStrip = () => { formLock.strip = true; stripCtx.clearRect(0, 0, stripW, stripH); setForm(true); drawStrip(stripCtx, stripC, stripW, stripH); };
  // (Whether a box comes within pad px of the curve as drawn: its points tested against the stroke widened by pad.)
  // (Each point is settled by its distance from the curve where that is clear-cut, and asked of the browser only on the
  // stroke's very edge: the same answers as asking it every time, without stroking the path thousands of times a frame.)
  // (No canvas to ask since the last 2D canvas went, 1 Nov 2026: the curve's own distance settles every point, on the GPU and on the
  // blank pen alike; the pen's isPointInStroke only ever said no.)
  const nearCurve = (r, pad, path = CURVE) => testers.get(path)(r, 3 + 2 * pad, null);
  // A station's place on the page: an arterial one in the band above the broken axis, a venous one by its pressure.
  const Yof = (g, v, i) => (ARTERIAL.has(g.stations[i]) ? g.artY : g.y(v));
  // Horizontal gradient in pressure colour, so the line and the fill read the colour of each station.
  function grad(ctx, x) {
    const i0 = venousN ? venousIdx[0] : undefined, iL = venousN ? venousIdx[venousN - 1] : undefined;
    const gr = ctx.createLinearGradient(x(i0), 0, x(iL), 0);
    const span = Math.max(1, x(iL) - x(i0));
    for (let k = 0; k < venousN; k++) { const i = venousIdx[k]; gr.addColorStop(clamp((x(i) - x(i0)) / span, 0, 1), pressureColor(now[i])); }
    return gr;
  }
  // Whether a station value's box (q) is over a bracket's span (the bracket rows run along the bottom).
  const overSpan = (q) => { for (let s = 0; s < spanN; s++) if (q.x1 > spanLo[s] && q.x0 < spanHi[s]) return true; return false; };
  // The candidate places for a bracket pill's left edge, in the order tried, none twice: from the centre outwards in 12 px steps, then just
  // past either end of the bracket (the first spots of the fixed number a canvas can hold).
  const pushX = (v) => { if (v !== v || xsN >= XS_CAP) return; for (let q = 0; q < xsN; q++) if (xsBuf[q] === v) return; xsBuf[xsN++] = v; };
  // Whether a bracket's pill (tw wide, its bar from x0 to x1) at row yy and left edge lx stands clear of everything.
  function bracketOk(yy, lx, withHealthy, tw, x0, x1) {
    const r = okR; r.x0 = lx; r.x1 = lx + tw; r.y0 = yy - 8; r.y1 = yy + 8;
    // (4 px clear of every dot, value, caption, the other bracket and the curve)
    if (anyOverlap4(takenPool, takenN, r) || anyOverlap4(claimedPool, claimedN, r) || nearCurve(r, 4)) return false;
    // the whole bracket (bar and end caps) must clear every dot and value label too, not just the pill
    const bar = okBar; bar.x0 = Math.min(x0, x1) - 3; bar.x1 = Math.max(x0, x1) + 3; bar.y0 = yy - 6; bar.y1 = yy + 6;
    if (anyOverlap(takenPool, takenN, bar) || anyOverlap(claimedPool, claimedN, bar)) return false;
    return !withHealthy || !haveH || !hitsLine(r, polyHealthy.list);
  }
  function drawWith(ctx, w0, hh0) {
    const c = theme();
    const hid = hiddenNow();
    const predOn = !!predict?.on;
    if (!formKeyIs(w0, hh0, predOn, hid)) {
      // (A new size starts in the plot, or straight in the band where the plot alone is too short for the brackets.)
      const band = !predict?.on && stripNow(geometry());
      if (formLock && band !== !!formLock.band && !formLock.strip && !(wasStrip ?? true)) bandFade();
      formLock = FL; setFormKey(w0, hh0, predOn, hid); FL.strip = false; FL.band = band;
    }
    const g = geometry(formLock.band);
    const { w, hh, stations, L, R, T, B, slot, maxP, x, y, stagger, hasArt, artY, roomy } = g;
    const N = stations.length;
    ctx.clearRect(0, 0, w, hh);
    stripCtx = ctx; stripC = c; stripW = w; stripH = hh;
    if (stripNow(g) || (formLock.strip && !predict?.on)) { toStrip(); return; }
    plotFill(ctx, 0, 0, w, hh, c.surface2);   // (the rounded panel under the plot, the numbers and the names)
    ctx.font = FONT(500, 12);
    // grid (solid hairlines): absolute pressure has no clinical threshold, so none is drawn
    ctx.strokeStyle = c.gridOn; ctx.fillStyle = c.faint; ctx.lineWidth = 1;
    // (A short chart, a 320 px phone's half sheet, numbers only every so many lines so no two touch: their 30, 25, 20 had
    // stacked into one smudge. 16 px apart at least, the lines 6 px.)
    const step0 = maxP > 40 ? 10 : 5, per = Math.abs(y(0) - y(step0)) || 1;
    const step = step0 * Math.max(1, Math.ceil(6 / per)), lstep = step0 * Math.max(1, Math.ceil(16 / per));
    for (let p = 0; p <= maxP; p += step) {
      ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(L, Math.round(y(p)) + 0.5); ctx.lineTo(w - R, Math.round(y(p)) + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
      if (p && p % lstep === 0) { ctx.textAlign = 'right'; ctx.fillText(numText(p), L - 6, y(p) + 4); }   // (No 0: it is implied, Mohammad, 27 Oct; its line stays.)
    }
    // The liver: a soft band behind its stations, named at the top.
    const lv = curPath().liver;
    LC.on = false;   // (the liver band, where its caption may go: the value labels and the HVPG and PPG pills keep 2 px clear of it)
    if (lv) {
      const i0 = stations.indexOf(lv[0]), i1 = stations.indexOf(lv[1]);
      if (i0 >= 0 && i1 >= i0) {
        const bx = x(i0) - slot / 2, bw = slot * (i1 - i0 + 1);
        ctx.save(); ctx.fillStyle = cssVar('--chart-liver-band'); ctx.fillRect(bx, T - 6, bw, y(0) - T + 6);
        // (Named only where the plot is tall enough to keep the name clear of the pills; the band alone says it on a short one.)
        if (y(0) - T >= 90) { LC.on = true; LC.bx = bx; LC.bw = bw; }   // (placed once the values have theirs, sweep 2 review item 22)
        ctx.restore();
      }
    }
    // (No axis line: the panel's edge and the grid's own bottom line are the axis.)
    if (roomy || !hasArt) { ctx.textAlign = 'left'; ctx.fillText('mmHg', 8, 16); } else { ctx.textAlign = 'right'; ctx.fillText('mmHg', w - R, artY + 4); }
    // station labels: horizontal, or turned 30° (ending under their point) when close together
    ctx.fillStyle = c.muted; ctx.font = FONT(500, 12);
    for (let i = 0; i < N; i++) {
      const n = stations[i];
      if (!stagger) { ctx.textAlign = 'center'; ctx.fillText(nm(n), x(i), hh - B + 16); continue; }
      ctx.save(); ctx.translate(x(i) + 3, hh - B + 10); ctx.rotate(-Math.PI / 6);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(nm(n), 0, 0);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
    // broken axis for arterial stations
    if (hasArt) {
      ctx.strokeStyle = c.axis; ctx.lineWidth = 1.2;
      for (let s = -1; s <= 1; s += 2) { const dy = 3 * s; ctx.beginPath(); ctx.moveTo(L - 6, T - 10 + dy + 3); ctx.lineTo(L + 6, T - 10 + dy - 3); ctx.stroke(); }
      ctx.fillStyle = c.faint; ctx.textAlign = 'left'; ctx.font = FONT(500, 12); ctx.fillText('arterial', 8, artY + 4);
    }
    // The curve runs through the venous stations only; an arterial station sits in its band above
    // the break, joined to the first venous station by a faint dotted lead.
    venousN = 0;
    for (let i = 0; i < N; i++) if (!ARTERIAL.has(stations[i])) venousIdx[venousN++] = i;
    const st = store.get();
    const healthy = st.healthy;
    // (The display-filtered pressures, as the figure's labels read them: the beat-by-beat ones put 22 here beside 22.6 there.)
    for (let i = 0; i < N; i++) { const n = stations[i]; now[i] = reading(n, F.Pf || F.P); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    haveH = !!healthy;
    if (healthy) {
      polyBegin(polyHealthy);
      for (let k = 0; k < venousN; k++) { const i = venousIdx[k]; polyPush(polyHealthy, x(i), y(healthy.P[NI[stations[i]]])); }
      polyEnd(polyHealthy);
      ctx.strokeStyle = c.faint; ctx.lineWidth = 1.5; ctx.setLineDash(DASH_HEALTHY);
      ctx.beginPath(); smoothPath(ctx, polyHealthy.list); ctx.stroke(); ctx.setLineDash(NO_DASH);
    }
    if (st.compareSnap?.P) {
      polyBegin(polySnap);
      for (let k = 0; k < venousN; k++) { const i = venousIdx[k]; polyPush(polySnap, x(i), y(st.compareSnap.P[NI[stations[i]]])); }
      polyEnd(polySnap);
      ctx.strokeStyle = c.series[0]; ctx.lineWidth = 2; ctx.setLineDash(DASH_SNAP);
      ctx.beginPath(); smoothPath(ctx, polySnap.list); ctx.stroke(); ctx.setLineDash(NO_DASH);
      setDisplay(el.querySelector('.lg-compare'), '');
    } else setDisplay(el.querySelector('.lg-compare'), 'none');
    polyBegin(polyNow);
    for (let k = 0; k < venousN; k++) { const i = venousIdx[k]; polyPush(polyNow, x(i), y(now[i])); }
    const P0 = polyEnd(polyNow);
    // soft area under the curve, fading towards the baseline
    if (P0.length > 1) {
      ctx.save();
      ctx.beginPath(); smoothPath(ctx, P0);
      ctx.lineTo(P0[P0.length - 1][0], y(0)); ctx.lineTo(P0[0][0], y(0)); ctx.closePath();
      ctx.globalAlpha = 0.16; ctx.fillStyle = grad(ctx, x); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = grad(ctx, x); ctx.lineWidth = 3;
    ctx.beginPath(); smoothPath(ctx, P0); ctx.stroke();
    // (How near a box comes to the curve as drawn, and to the healthy line: a tester for each, made from its points.)
    testers.set(CURVE, curveTester(P0));
    if (haveH) testers.set(HEALTHY, curveTester(polyHealthy.list));
    let fail = false;   // (a label with no clear spot: the strip instead)
    // (The arterial stations are not here: a path's stations are its venous ones, so there is no arterial dot, lead or value to draw.)
    // station dots, ringed in the surface colour so they sit cleanly on the line
    for (let i = 0; i < N; i++) { const d = dots[i]; d.i = i; d.cx = x(i); d.cy = Yof(g, now[i], i); d.col = ARTERIAL.has(stations[i]) ? c.artery : pressureColor(now[i]); }
    for (let k = 0; k < N; k++) {
      const d = dots[k];
      ctx.fillStyle = c.surface2; ctx.beginPath(); ctx.arc(d.cx, d.cy, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(d.cx, d.cy, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // Labels: the value at each station when there is room. (A path with no HVPG and PPG brackets would also mark each drop
    // between stations that matters, ≥ 1 mmHg, the largest as where the resistance sits; the one path has its brackets, so
    // those pills were never drawn and are gone.)
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (let i = 0; i < N; i++) { const r = takenPool[i], d = dots[i]; r.x0 = d.cx - 8; r.x1 = d.cx + 8; r.y0 = d.cy - 8; r.y1 = d.cy + 8; }
    takenN = N;
    ctx.font = FONT(600, 12);
    const dims = curPath().dims;
    const dimN = dims ? dims.length : 0;
    valN = 0;
    if (slot >= 26) {
      ctx.font = FONT(600, 12);
      // (Clear of the bracket rows along the axis first; into them only when there is no other spot.)
      const band = dims ? y(0) - 12 - (dims.length - 1) * 24 - 11 : hh;
      // (Clear of the healthy line too where there is room: it is a faint reference, so a value may cross it if it must. In the
      // bracket rows, beside a bracket before over one.)
      spanN = 0;
      for (let di = 0; di < dimN; di++) {
        const a = stations.indexOf(dims[di].hi), b2 = stations.indexOf(dims[di].lo);
        if (a >= 0 && b2 >= 0) { spanLo[spanN] = Math.min(x(a), x(b2)) - 5; spanHi[spanN] = Math.max(x(a), x(b2)) + 5; spanN++; }
      }
      for (let di = 0; di < N; di++) {
        const d = dots[di];
        if (ARTERIAL.has(stations[d.i])) continue;
        const txt = fmt(now[d.i], 1);
        const tw = ctx.measureText(txt).width, th = 12;
        // (Above or below its dot, a row further out, or beside it: 4 px clear of the curve, the dots and the other values.)
        // (Above first and beside before below: the brackets run along the bottom.)
        const sx = tw / 2 + 12;
        const q = takenPool[takenN];   // (the box tried; kept in the pool once it stands clear)
        let found = false;
        for (let ci = 0; ci < 6 * CAND_KX.length; ci++) {
          const cj = ci % CAND_KX.length, pass = Math.floor(ci / CAND_KX.length);
          const kx = CAND_KX[cj], dx = kx === 0 ? 0 : kx > 0 ? sx : -sx, dy = CAND_DY[cj];
          const cx = d.cx + dx, yy = d.cy + dy;
          q.x0 = cx - tw / 2; q.x1 = cx + tw / 2; q.y0 = yy - th / 2; q.y1 = yy + th / 2;
          if (q.y0 < 2 || q.y1 > hh - B - 2 || q.x0 < L - 4 || q.x1 > w - R + 4 || (q.y1 > band && (pass < 2 || (pass < 4 && overSpan(q))))) continue;
          let over = false;   // (4 px from the dots and the curve, 2 from another value)
          for (let j = 0; j < takenN; j++) { const o = takenPool[j], gg = j < N ? 4 : 2; if (q.x0 < o.x1 + gg && q.x1 > o.x0 - gg && q.y0 < o.y1 + gg && q.y1 > o.y0 - gg) { over = true; break; } }
          if (over || nearCurve(q, 4) || (haveH && pass % 2 === 0 && nearCurve(q, 2, HEALTHY))) continue;
          found = true; break;
        }
        if (!found) { fail = true; continue; }
        valTxt[valN] = txt; valX[valN] = (q.x0 + q.x1) / 2; valSlot[valN] = takenN; valN++; takenN++;
      }
    }
    // The LIVER caption over its band: centred, or slid along the band, where it stands clear of the dots, the values and the
    // curve (it was left out where the station values needed its spot; now a value keeps its place and the name moves).
    if (LC.on) {
      ctx.font = FONT(600, 12); const lw = ctx.measureText('LIVER').width, bx = LC.bx, bw = LC.bw;
      const q = takenPool[takenN];
      for (let fi = 0; fi < LIVER_AT.length; fi++) {
        const mx = Math.max(bx + lw / 2 + 2, Math.min(bx + bw - lw / 2 - 2, bx + bw * LIVER_AT[fi]));
        q.x0 = mx - lw / 2 - 2; q.x1 = mx + lw / 2 + 2; q.y0 = T + 4 - 11; q.y1 = T + 4 + 7;
        if (q.x0 < L || q.x1 > w - R || anyOverlap(takenPool, takenN, q) || nearCurve(q, 2)) continue;
        ctx.save(); ctx.fillStyle = c.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('LIVER', mx, T + 4); ctx.restore();
        takenN++; break;
      }
    }
    // HVPG and PPG: a bracket inside the chart from where each is measured to where it ends, with a
    // pill giving its value (same numbers and cut-offs as the tiles). HVPG is left out until it has
    // been measured (hiddenNow); the PPG span keeps its row. Each pill starts on its own row near the
    // axis and is lifted (and slid along its bracket) to the nearest spot that covers no station dot,
    // no value label and no pressure line; the move is eased so it never jumps.
    const nLbl = N;
    claimedN = 0;
    for (let k = 0; k < dimN; k++) {
      const d = dims[k], it = items[k];
      const a = stations.indexOf(d.hi), b = stations.indexOf(d.lo);
      if (a < 0 || b < 0 || (d.hide && hid?.has(d.hide))) { it.on = false; continue; }
      const m = F.metrics || NO_METRICS;
      const v = gapOf(d, m, now[a], now[b]);
      const col = v >= d.bad ? c.danger : v >= d.warn ? c.caution : c.muted;
      const txt = DIM_NAME.get(d.k), num = fmt(v, 1);
      ctx.font = FONT(600, 12); const tw1 = ctx.measureText(txt).width;
      ctx.font = FONT(700, 12.5); const tw2 = ctx.measureText(num).width;
      const tw = tw1 + tw2 + 12, x0 = x(a), x1 = x(b);
      const base = y(0) - 12 - (dimN - 1 - k) * 24;
      // (Inside its bracket with 8 px of bar showing at each end, or just past either end when the bracket is too short.)
      const lo = Math.max(L + 2, Math.min(x0, x1) + 8), hi = Math.min(w - R, Math.max(x0, x1) - 8) - tw;
      const cx = Math.max(L + 2, Math.min(w - R - tw, (x0 + x1) / 2 - tw / 2));
      xsN = 0;
      if (hi >= lo) {
        pushX(Math.max(lo, Math.min(hi, cx + 0)));
        if (hi > lo) for (let s = 12; s <= hi - lo + 12; s += 12) { pushX(Math.max(lo, Math.min(hi, cx + s))); pushX(Math.max(lo, Math.min(hi, cx + -s))); }
      }
      const past = Math.max(x0, x1) + 8, before = Math.min(x0, x1) - 8 - tw;
      if (past >= L + 2 && past + tw <= w - R) pushX(past);
      if (before >= L + 2 && before + tw <= w - R) pushX(before);
      let best = null;
      // (In the band: its own row under the names, centred on its span and kept inside the chart.)
      if (g.band) { best = bestSpot; best.yy = hh - (dimN - k) * BAND_ROW + BAND_ROW / 2; best.lx = cx; }
      else for (let wh = 0; wh < 2 && !best; wh++) {
        const withHealthy = wh === 0;
        for (let yy = base; yy >= T + 10 && !best; yy -= 8) {
          for (let j = 0; j < xsN; j++) if (bracketOk(yy, xsBuf[j], withHealthy, tw, x0, x1)) { best = bestSpot; best.yy = yy; best.lx = xsBuf[j]; break; }
        }
      }
      // (No spot clear of everything: the chart is too small for its labels, and the strip shows instead. Before, the pill
      // kept a spot on the curve, sweep 2 review item 1.)
      const spotFound = best !== null;
      if (!best) { fail = true; best = bestSpot; best.yy = base; best.lx = cx; }
      if (!(spotFound && g.band)) {   // (a bracket in the band claims no row of the plot)
        const cl = claimedPool[claimedN++];
        cl.x0 = Math.min(x0, x1) - 3; cl.x1 = Math.max(x0, x1) + 3; cl.y0 = best.yy - 9; cl.y1 = best.yy + 9;
      }
      it.on = true; it.a = a; it.b = b; it.col = col; it.txt = txt; it.num = num; it.tw1 = tw1; it.tw = tw; it.x0 = x0; it.x1 = x1; it.ty = best.yy; it.tx = best.lx;
    }
    // (No clear spot inside the plot: the brackets take their band under the names, drawn on the next frame.)
    if (fail && !predict?.on && g.band) { toStrip(); return; }   // (already in the band and a value still has no clear spot: the strip, never a loop)
    if (fail && !predict?.on) { formLock.band = true; bandFade(); draw(); return; }
    setForm(false);
    // eased positions: [row, left edge] per span
    for (let k = 0; k < dimN; k++) { const it = items[k]; pillIn[2 * k] = it.on ? it.ty : 0; pillIn[2 * k + 1] = it.on ? it.tx : 0; }
    pillIn.length = 2 * dimN;
    const { v: pos, moving: mPill } = easePill.step(pillIn);
    pillMoving = mPill;
    for (let k = 0; k < dimN; k++) {
      const it = items[k];
      if (!it.on) continue;
      const { a, b, col, txt, num, tw1, tw, x0, x1 } = it;
      const yy = pos[2 * k], lx = pos[2 * k + 1], ly = yy;
      ctx.save();
      // Faint leaders from the bracket ends to the two station dots, broken around any value label (none from the band: the
      // brackets stand under their stations' names there).
      if (!g.band) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.setLineDash(DASH_LEAD);
      for (let e = 0; e < 2; e++) {
        const px = e === 0 ? x0 : x1, st2 = e === 0 ? a : b;
        const dy = Yof(g, now[st2], st2), from = yy + (dy > yy ? 4 : -4), to = dy + (dy > yy ? -7 : 7);
        // (The value labels and the caption that stand across the leader, from the top down.)
        const fromLo = Math.min(from, to), fromHi = Math.max(from, to);
        let gn = 0;
        for (let j = nLbl; j < takenN; j++) {
          const o = takenPool[j];
          if (!(px > o.x0 - 2 && px < o.x1 + 2 && o.y1 > fromLo && o.y0 < fromHi)) continue;
          let q = gn++;
          while (q > 0 && takenPool[gapIdx[q - 1]].y0 - o.y0 > 0) { gapIdx[q] = gapIdx[q - 1]; q--; }
          gapIdx[q] = j;
        }
        const dir = to > from ? 1 : -1; let cur = from;
        ctx.beginPath();
        for (let gi = 0; gi < gn; gi++) {
          const o = takenPool[gapIdx[dir > 0 ? gi : gn - 1 - gi]];
          const e2 = dir > 0 ? o.y0 - 1 : o.y1 + 1;
          if ((e2 - cur) * dir > 0) { ctx.moveTo(px, cur); ctx.lineTo(px, e2); }
          cur = dir > 0 ? o.y1 + 1 : o.y0 - 1;
        }
        if ((to - cur) * dir > 0) { ctx.moveTo(px, cur); ctx.lineTo(px, to); }
        ctx.stroke();
      }
      }
      ctx.setLineDash(NO_DASH); ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, yy - 4); ctx.lineTo(x0, yy + 4); ctx.moveTo(x1, yy - 4); ctx.lineTo(x1, yy + 4); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly - 8, tw, 16, 8) : ctx.rect(lx, ly - 8, tw, 16);
      ctx.fillStyle = c.surface; ctx.fill(); ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c.muted; ctx.font = FONT(600, 12); ctx.fillText(txt, lx + 6, ly + 0.5);
      ctx.fillStyle = col === c.muted ? c.text : col; ctx.font = FONT(700, 12.5); ctx.fillText(num, lx + 6 + tw1, ly + 0.5);
      ctx.restore();
    }
    // The station values, where they were placed (the pills keep 4 px clear of them).
    ctx.font = FONT(600, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.text;
    for (let k = 0; k < valN; k++) { const r = takenPool[valSlot[k]]; ctx.fillText(valTxt[k], valX[k], (r.y0 + r.y1) / 2 + 0.5); }
    if (pillMoving) { cancelFrame(easeRaf); easeRaf = nextFrame(easeKick); }
    ctx.textBaseline = 'alphabetic';
    offscaleW.set(hasArt ? 'Arterial pressure is drawn above the break (//) at its true value.' : '');
    // prediction
    const lp = el.querySelector('.lg-pred');
    if (predict?.values?.size) {
      setDisplay(lp, '');
      ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.setLineDash(DASH_PRED);
      ctx.beginPath();
      polyBegin(polyPred);
      for (let i = 0; i < N; i++) { const n = stations[i], pv = predict.values.get(n); if (pv != null && !ARTERIAL.has(n)) polyPush(polyPred, x(i), y(pv)); }
      smoothPath(ctx, polyEnd(polyPred));
      ctx.stroke(); ctx.setLineDash(NO_DASH);
      if (predict.reveal) {
        ctx.fillStyle = cssAlpha('--danger', 0.14);
        for (let i = 0; i < N; i++) { const v = predict.values.get(stations[i]); if (v == null) continue; ctx.fillRect(x(i) - 6, Math.min(y(v), y(now[i])), 12, Math.abs(y(v) - y(now[i]))); }
      }
    } else setDisplay(lp, 'none');
    if (predict?.on) {
      ctx.fillStyle = c.accent; ctx.font = FONT(600, 12.5); ctx.textAlign = 'right';
      ctx.fillText('Drag across the chart to draw your prediction', w - R - 6, T + 14);
    }
  }

  // (Where the canvas is on the page and its plot's layout, read as a press starts and again between frames after a scroll, never in a drag's move.)
  let cvRect = null, cvGeo = null, rectAsk = 0;
  function readRect() { rectAsk = 0; cvRect = cv.getBoundingClientRect(); cvGeo = geometry(false, geoPress); }
  addEventListener('scroll', () => { if (dragging) { cancelRest(rectAsk); rectAsk = restPass(readRect); } }, { capture: true, passive: true });
  function predictAt(ev) {
    const r = cvRect, g = cvGeo;
    if (!r || !g) return;
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const i = clamp(Math.round((px - g.L) / g.slot - 0.5), 0, g.stations.length - 1);
    const v = clamp((1 - (py - g.T) / (g.hh - g.T - g.B)) * g.maxP, 0, g.maxP);
    predict.values.set(g.stations[i], v);
    draw();
  }
  cv.addEventListener('pointerdown', (ev) => { if (!predict?.on) return; readRect(); dragging = true; cv.setPointerCapture(ev.pointerId); predictAt(ev); });
  cv.addEventListener('pointermove', (ev) => { if (dragging && predict?.on) predictAt(ev); });
  cv.addEventListener('pointerup', () => { dragging = false; if (predict?.on && predict.values.size >= Math.min(4, geometry().stations.length)) predict.onChange?.(predict.values.size); });

  return {
    id: 'profile', label: 'Pressure profile', el,
    update(f) { Fraw = f; ease(); readStrip(f); },
    redraw: draw,
    setPath(id) { pathId = id; draw(); },
    startPredict(onChange) { predict = { on: true, values: new Map(), onChange }; draw(); },
    endPredict(reveal = true) { if (predict) { predict.on = false; predict.reveal = reveal; } draw(); return predict; },
    clearPredict() { predict = null; draw(); },
    predictionError() {
      if (!predict || !Fraw) return null;
      let s = 0, n = 0;
      for (const [k, v] of predict.values) { s += Math.abs(v - Fraw.P[NI[k]]); n++; }
      return n ? s / n : null;
    },
  };
}
