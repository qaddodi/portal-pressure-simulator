// Semantic zoom, last step: the liver lobule. The Lobule step of the zoom trail, or "Zoom into
// the lobule" on the liver's card, grows a hepatic lobule out of the liver, drawn from the live model
// in the anatomy's own visual language.
//
// The vessels are drawn by the anatomy's GPU renderer (veins-gl.js, a second instance on its own
// canvas): the same casings, filleted joins, flat textbook shading and moving blood (streaks or
// parcels, chevrons, reversed flow in orange, the Blood origin lens). The network follows the
// blood's real path: a portal triad at each corner (portal venule, hepatic arteriole, bile
// ductule), inlet venules running along the lobule's edges, sinusoids that leave them, cross-link
// and merge toward the central vein (so blood visibly speeds up as they converge), and arterioles
// emptying into the first stretch of the sinusoids. Lumen color is pressure, as everywhere else.
//
// Under the vessels a quiet canvas holds the tissue: hepatocyte plates one cell thick, and only as
// disease brings them, collagen (portal tract, space of Disse, central vein, bridging septa that cut
// the lobule into nodules in cirrhosis), activated stellate cells, and zone-3 congestion and cell dropout ("nutmeg") when the outflow backs up.
//
// Teaching layers: Rappaport zones and hepatic lymph running out along the space of Disse to the portal
// tract's lymphatic (both from the toolbar's Layers menu, rate from the model); and a card for anything
// tapped (triad, inlet venule, sinusoid, arteriole, central vein, septum, hepatocytes).
// Without WebGL2 the vessels are drawn flat on the tissue canvas.

import { stageCovered } from './seen.js';
import { carryCovers, carryBetween } from './carry-cover.js';
import { runFlick, FLICK } from './flick.js';
import { store } from './store.js';
import { glideClock } from './glide-clock.js';
import { radiiChanged, canvasPx, fxMoves, DIVE_RIM } from './lobule-render-cache.js';
import { softwareYield } from './sw-yield.js';
import { lobuleStateInto, lymphRate, sinceOf, lensModeOf, LOBE } from './lobule-model.js';
import { SIN_NARROW, dullSinusoidInto, NEIGHBOUR_FLAT, neighbourBlur, FADE_MID, fadeOuter, padRect, wideDpr, wideTiles, FIELD_RS, fieldBlend, fieldDof, surroundGrade, greyStep } from './lobule-look.js';
import { isGreyLens } from './organ-dim.js';
import { createFieldGL } from './field-gl.js';
import { createTissueGL } from './tissue-gl.js';
import { tileCopy } from './tile-gl.js';
import { FX_GPU, createFxGL } from './fx-gl.js';
import { WIDE_GL, createWideGL } from './wide-gl.js';
import { buildLive, buildDyn, buildItems, liveFibreInto, liveEligible, liveZoomShare, liveColours, liveEase, liveShareOf } from './lobule-live.js';
import { recordPaint, gpuPicture, releasePicture } from './paint-gl.js';
import { hold, ownerBytes } from './gpu-budget.js';
import { cssColor8 } from './css-color.js';
import { fibrousBand, fibrousTract, fibrousCuff, scarGrowth, paintWorldInto, useTokens } from './lobule-paint.js';
import { h, fmt, clamp, createEaser, systemEdge, bloodColors, cssVar, cssAlpha, cssRGB01 } from './util.js';
import { createSvgGL, svgModel, setGeo, geoOf } from './svg-gl.js';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor, oxygenColor } from './colormap.js';
import { NODES, EDGES } from '../engine/topology.js';
import { createVeinsGL, binVeins, laneSum, N_SAMPLES, TUBE_TEXELS, FLOW_TEXELS, MAX_TIERS, F_SEL, F_DIFFUSE, F_SHADOW, F_SPEC, F_EDGE, ORIGIN_GREY } from './veins-gl.js';
import { SLOT, PERIOD, originFractions, ORIGIN_N, DRIFT_PERIOD } from './blood.js';
import { STYLE_D } from './blood-tile.js';
import { createSinusoidView } from './sinusoid-view.js';
import { frameFor, cancelFrame, noteDraw, saver, paceMs, frameGapFor, frameCount, renderScale, onRenderScale, frame, framePart, easeNow, inMotion, PACED } from './frame.js';
import { gpuProbe, COUNTED } from './gpu-probe.js';
import { FADE_MS, fadeAlpha } from './res-fade.js';
import { createResCover, coverFollowInto } from './res-cover-gl.js';
import { leaderEnd, leaderEndRects, runInside } from './leader-end.js';
import { LIGHT } from './light.js';
import { restPass, cancelRest, restAttr, restRemove, flushRestAttrs } from './rest-pass.js';
import { classSoon, classHas, textSoon, runSoon } from './class-soon.js';
import { easeMove, carryRate, carried, createGlideTracker, cubicBezier, D_SMALL, D_SURFACE } from './ease.js';
import { surface } from './gpu-surfaces.js';
import { caught } from './caught.js';
import { camThen, camSet, camId, camAbout, cams } from './scene-cam.js';
import { lerpInto } from './cam-arc.js';
import { createCaptions, composeView, inkRows, mirrorOf, rgbaOf as capRGBA } from './label-captions.js';
import { readStyle, readBox as boxOf } from './layout-snap.js';
import { hitLabel, explainText } from './label-explain.js';
import { overlapLRTB, discInto, needsLeader, SHORT_LEAD, LONG_LEAD } from './label-place.js';
import { reduceMotionMQ } from './motion.js';
import { darkMQ } from './look.js';
const nextFrame = frameFor('lobule-zoom');

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const TAU = Math.PI * 2;
const N = N_SAMPLES;
const MAXT = 320;                       // GPU rows: the lobule has ~170 vessels, ~285 with the lymphatics
const tk = (n, a) => (a === undefined ? cssVar(n) : cssAlpha(n, a));   // a colour token, optionally with an alpha
useTokens(tk);   // (the tissue's painting, lobule-paint.js, reads the same live tokens on the page)
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic jitter so the tissue does not shimmer between frames.
function rng(seed) { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }   // alloc-rare: build() only: geometry built only on a stage-size change (ensureGeo's geoKey)

// A dense curve f(u), u 0…1, resampled to N points evenly spaced along its length.
function curve(f, m = 160) {
  const d = [], L = [0];   // alloc-rare: build() only: geometry built only on a stage-size change (ensureGeo's geoKey)
  for (let i = 0; i <= m; i++) d.push(f(i / m));
  for (let i = 1; i <= m; i++) L.push(L[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
  const len = L[m] || 1e-6, pts = [];   // alloc-rare: build() only: geometry built only on a stage-size change (ensureGeo's geoKey)
  let j = 0;
  for (let k = 0; k < N; k++) {
    const t = (len * k) / (N - 1);
    while (j < m - 1 && L[j + 1] < t) j++;
    const w = clamp((t - L[j]) / (L[j + 1] - L[j] || 1), 0, 1);
    pts.push([lerp(d[j][0], d[j + 1][0], w), lerp(d[j][1], d[j + 1][1], w)]);   // alloc-rare: build() only: geometry built only on a stage-size change (ensureGeo's geoKey)
  }
  return { pts, len };   // alloc-rare: build() only: geometry built only on a stage-size change (ensureGeo's geoKey)
}
// The triad's layout, from the venule: the other three sit this far out (of R), the arteriole and ductule this
// far round either side of the outward direction, and the lymphatic straight out.
const TRIAD_D = 0.09, TRIAD_A = 0.98;
// (A vessel seen end-on: a disc.)
const dot = (x, y) => curve((u) => [x + (u - 0.5) * 0.6, y], 4);   // alloc-rare: build() only: geometry built only on a stage-size change (ensureGeo's geoKey)
// The point a fraction u along a polyline, written into `out` ([x, y]) and returned: a caller that reads it at once keeps one out.
function atInto(pts, u, out) {
  const f = clamp(u, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  out[0] = lerp(pts[i][0], pts[i + 1][0], t); out[1] = lerp(pts[i][1], pts[i + 1][1], t);
  return out;
}
// A new point on the line (the geometry's build and a sinusoid pick, once per gesture; every frame's caller writes with atInto into its own scratch).
function at(pts, u) { return atInto(pts, u, [0, 0]); }   // alloc-rare: a new point for build() and a once-per-gesture sinusoid pick; per-frame callers use atInto
// The distance from (x, y) to the line, and where along it (0-1) in distU: nothing made, for the hit test of every move.
let distU = 0;
function distTo(pts, x, y) {
  let best = Infinity, bu = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ax = a[0], ay = a[1], dx = b[0] - ax, dy = b[1] - ay, L2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
    if (d < best) { best = d; bu = (i + t) / (pts.length - 1); }
  }
  distU = bu;
  return best;
}
const lyAt = [0, 0], diveAt = [0, 0];   // (the scratch points of the lymph's beads and of the sinusoid zoom's geometry)
// Any CSS colour → [r, g, b] 0–1, in the canvas's 8-bit steps (css-color.js: read in script, no canvas made).
const rgbCache = new Map();
function rgb01(c) {
  let o = rgbCache.get(c);
  if (o) return o;
  o = cssColor8(c || 'black').slice(0, 3);   // alloc-rare: only on a colour the cache has not seen (the Map above keeps each colour's triple)
  if (rgbCache.size > 256) rgbCache.clear();
  rgbCache.set(c, o);
  return o;
}
// ([r, g, b] 0–1 → 'rgba(r,g,b,1)': each colour's text is made once and kept by its 8-bit value, as the canvas steps it.)
const cssMemo = new Map();
const css = (a) => {
  const r = Math.round(a[0] * 255), g = Math.round(a[1] * 255), b = Math.round(a[2] * 255), k = (r * 256 + g) * 256 + b;
  let s = cssMemo.get(k);
  if (s === undefined) {
    if (cssMemo.size > 4096) cssMemo.clear();
    s = `rgba(${r},${g},${b},1)`;   // alloc-rare: only the first time this 8-bit colour is asked for (cssMemo keeps it)
    cssMemo.set(k, s);
  }
  return s;
};

/** `before`: a node of `host` the layer sits ahead of. The stage builds the layer after the first paint, and in the page it takes the
 *  place it always had (a layer of the same z-index drawn later would otherwise cover the labels the stage adds after it). With the
 *  layer built late, what the store already holds (a slide's callout, the sinusoid asked for) is read once it exists. */
// The order the lobule's own pictures take among what is drawn over its vessels in their canvas (veins-gl top.add): below every glass
// (stage.js hostFrost: the liver pane 0, the cards 1 and 3, the callouts 2), so the cards frost the whole lobule and nothing of it lies
// over them.
export const LZ_UNDER_GLASS = -10;

export function createLobuleZoom({ host, styles = () => getComputedStyle(host), before = null, binAway = null, figure = null }) {
  const reduce = reduceMotionMQ;
  const tissue = h('canvas', { class: 'lz-canvas', role: 'img', 'aria-label': 'Liver lobule microcirculation' });
  const glCv = h('canvas', { class: 'lz-canvas lz-gl', 'aria-hidden': 'true' });
  const fx = h('canvas', { class: 'lz-canvas lz-fx', 'aria-hidden': 'true' });
  // The leaders (lines, dots, the pointer's line and ring) are a model drawn on the GPU (svg-gl), never SVG the page paints (2 Nov 2026,
  // "Move everything to GPU"): leadersBox is what shows (its fades and its pan's shift are the compositor's), leaders the model in it,
  // whose numbers the picture draws as they stand; a change to one asks for a frame of the picture.
  const leadersBox = h('div', { class: 'lz-leaders svg-gl-box', 'aria-hidden': 'true' });
  const leaders = svgModel('svg', { 'data-look': 'small.root', viewBox: '0 0 1 1', preserveAspectRatio: 'none' });
  const leadGL = createSvgGL(leadersBox, { host: 'lobule' });
  const leadPaint = () => leadGL.paint();
  leadGL.cv.setAttribute('aria-hidden', 'true'); leadGL.cv.removeAttribute('role');
  leadGL.show(leaders, false);
  // (With label-gl drawing the leaders and dots (cap-lead), this layer shows only a slide's pointer: with none up it draws nothing, so a zoom's
  // frames never clear and hand over a full-screen picture of hidden lines. See svg-gl.js g.skip.)
  leadGL.skip = () => leadersBox.classList.contains('cap-lead') && !classHas(callRing, 'on');
  if (typeof MutationObserver === 'function') new MutationObserver(() => leadGL.paint()).observe(leaders, { subtree: true, childList: true, attributes: true, attributeFilter: ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'viewBox', 'style', 'transform'] });
  // (What a slide lights is a class on the app: the leaders' looks are read again when it changes.)
  { const app = document.querySelector('.app') || document.getElementById('app'); if (app && typeof MutationObserver === 'function') new MutationObserver(() => { syncDim(); leadGL.relook(); mirrorAll(); }).observe(app, { attributes: true, attributeFilter: ['data-lit', 'class'] }); }
  const labels = h('div', { class: 'lz-labels' });
  // The labels, zone names and the slide's call are drawn by the GPU (label-captions.js), each where the page set it (mirrorOf, read between
  // frames) and moved in the frame that moves the lobule; the page's own are a clear model for clicks and screen readers, placed between
  // frames (2 Nov 2026, "Move everything to GPU").
  const cap = createCaptions(labels, { deferred: true });   // (drawn in the figure's context once ensureGL knows it; else in a canvas of their own)
  // (The page's own names are made clear only once the GPU's picture of them is on the screen, and shown again if it is lost: label-captions.js presented.)
  // (Written in the task that handed the picture over, not in a later one: the page's names are made clear in the very frame the GPU's picture
  // first shows, never a frame, or a rest pass, after it, when both would show: the double captions.)
  cap.onPresented = () => { labels.classList.add('cap-gl-on'); leadersBox.classList.add('cap-lead'); leaders.classList.add('cap-lead'); leadGL.relook(); };   // (the model's root carries it too: its leaders' looks read it)
  cap.onLost = () => { labels.classList.remove('cap-gl-on'); leadersBox.classList.remove('cap-lead'); leaders.classList.remove('cap-lead'); leadGL.relook(); };

  // ── What sits on the lobule ──
  // Zones and Lymph are layers (the toolbar's Layers menu keeps them in the store). Nothing floats in a card.
  const NO_LAYERS = {};   // (read, never written: what stands in for a store with no layers set)
  const start = store.get().lobuleLayers || NO_LAYERS;   // the first frame draws the layers the store starts with (lymph is on)
  let zonesOn = !!start.zones, lymphOn = !!start.lymph;
  const syncLayers = () => {
    const l = store.get().lobuleLayers || NO_LAYERS;
    if (!!l.zones === zonesOn && !!l.lymph === lymphOn) return;
    zonesOn = !!l.zones; lymphOn = !!l.lymph;
    tissueKey = ''; layoutKey = ''; attrKey = '';
    if (F) update(F);
    nextFrame(refit);
  };
  store.on('lobuleLayers', () => syncLayers());
  // A presenter slide's pointer at the lesion (D4): { at: 'triad' | 'sin' | 'cv', label, kind: block | treat | note }.
  const callEl = h('div', { class: 'lz-call', 'aria-hidden': 'true' }), callLine = svgModel('line', { class: 'lz-call-l', 'data-look': 'small.call' }), callRing = svgModel('circle', { class: 'lz-call-r', 'data-look': 'small.call' });
  const callParts = [callEl, callLine, callRing];   // (the pill, its leader and its ring: toggled together)
  let call = null, callWant = null, callSwap = 0;
  store.on('presentFp', () => { if (model) panel(); });   // (a slide's settled values arrive: the sinusoid label reads as its tile)
  // A pointer that changes while it shows (another spot, other words) fades out first, then fades in with its new words at its new
  // spot: its ring, line and pill never jump there (17 Oct: "resistance and labels and callouts all snap").
  const callSet = (c) => {
    call = c;
    if (c) {
      textSoon(callEl, c.label); for (const e of callParts) restAttr(e, 'data-kind', c.kind || 'block');   // (a style hook, written between frames; measureRun flushes it before it measures the pill)
      // (Its size measured between frames for its new words, before it is first placed: placeCall waits for it.)
      measQ.add(callEl); if (!measT) measT = restPass(measureRun);
    }
    viewChanged();
  };
  const onCallout = () => {
    const c = store.get().lobuleCallout || null;
    if (JSON.stringify(c) === JSON.stringify(callWant)) return;   // alloc-rare: only when the store's lobuleCallout changes (a slide's pointer, once per slide change)
    callWant = c;
    const fading = !!callSwap;
    clearTimeout(callSwap); callSwap = 0;
    if (c && !reduce.matches && (fading || (call && classHas(callEl, 'on')))) { if (call) callSet(null); callSwap = setTimeout(() => { callSwap = 0; callSet(callWant); }, 500); return; }   // alloc-rare: only when a slide's pointer changes while one shows (store lobuleCallout)
    callSet(c);
  };
  store.on('lobuleCallout', onCallout);

  const phoneMQ = matchMedia('(max-width: 720px)');
  // The tissue drawn on the GPU (tissue-gl.js): it stands in for the canvas under it (left empty, never drawn), through the dive and
  // the rise too (the rim past the lobule cleared by its shader). It follows that canvas's visibility and zoom.
  const tissueG = h('canvas', { class: 'lz-canvas lz-tissue-gl', 'aria-hidden': 'true', style: { pointerEvents: 'none' } });
  // (The overlay on the GPU, fx-gl.js: shown in the 2D overlay's place while it draws it, see fxOnGPU.)
  const fxG = h('canvas', { class: 'lz-canvas lz-fx lz-fx-gl', 'aria-hidden': 'true', style: { pointerEvents: 'none' } });   // (shown by what is drawn on it: blank until fxGLShow(true)'s draw, and given back blank (width 0) by fxGLShow(false), so its style is never written to hide it)
  const el = h('div', { class: 'lz', 'aria-hidden': 'true' }, tissue, tissueG, glCv, fx, ...(FX_GPU ? [fxG] : []), leadersBox, labels);
  // The dive's field (below the view): the liver's lobules, few and large, that the camera falls through (those away from the landing lobule fade as it nears).
  const field = h('canvas', { class: 'lz-canvas lz-field', 'aria-hidden': 'true' });
  // The same field drawn on the GPU (field-gl.js), where it can be: the 2D canvas above is then left empty.
  const fieldG = h('canvas', { class: 'lz-canvas lz-field', 'aria-hidden': 'true' });
  host.insertBefore(fieldG, before); host.insertBefore(field, before); host.insertBefore(el, before);
  let fieldGL;   // its drawing (fieldGLOn)

  // ── The view: the lobule framed in the space the floating pieces leave (top bar, dock, cards and
  // its own card), free zoom up to 5× that, the pan held to this lobule. Zooming out stops at the framing.
  const V = cams.lobule.base = { k: 1, x: 0, y: 0 };   // (the lobule's own view is the scene camera's base record, scene-cam.js; the pan, the dive and a card's zoom are its siblings, each written by one owner)
  const PAN = camId(cams.lobule.pan), DIVE = camId(cams.lobule.dive), CARD = camId(cams.lobule.card);   // (a new lobule starts them at the identity)
  const KMAX = 5;
  // The most px per world unit the bitmap can be shown at, by what the screen can ask for: the zoom stops at KMAX times the fit, so a
  // bitmap sharper than dpr × that (stepped up a √2, as the scales are) is never shown larger than it was painted. At most 3600 px square,
  // and never under what the view is at now. (Recs B3: the spare for twice the zoom no longer reaches past the deepest zoom.)
  const worldCap = (G, dpr) => Math.min(3600 / (2.6 * G.R), Math.max(dpr * kFit * KMAX, dpr * V.k) * Math.SQRT2);
  let kFit = 1, atFit = true;
  const cardOn = () => CARD.k !== 1 || CARD.x !== 0 || CARD.y !== 0;   // (a card's zoom camera is off at the identity)
  let zres = 1;   // (zres: a card's zoom landed, the picture is drawn at this many times the density, same geometry)   // (a card's zoom carries the lobule: layShared lays the field through the camera too)
  let zbase = null;   // (the view as a card's camera zoom found it: zoomOpen)
  // A presenter's glide to a station still under way: its part, zoom and target (which refit moves, so the glide still lands on the station).
  let camAim = null;
  const appStyle = document.getElementById('app')?.style;
  const cssN = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  // ── The page's boxes, kept (1 Nov 2026, Mohammad: "block everything until everything is on GPU") ──
  // Every box a frame of the lobule uses (its own place and size, the stage's size, the phone's zoom buttons, the cards over the
  // figure) is read only at a rest boundary: the browser's ResizeObserver (after its own layout, before the paint), a window resize,
  // the cards' space changing (pps:occ), a press on the lobule or the pointer coming over it, the lobule opening, and a timer task
  // after a presenter's glide lands (readRest). No frame, glide, pinch, pan, dive or rise reads the page; they use these numbers.
  const snap = { l: 0, t: 0, rw: 0, rh: 0, w: 0, h: 0, zoom: null, cards: [], cardKey: '', hostRaw: null, hostWH: null };
  function readBox() {
    const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect(), zp = document.getElementById('zoomPill');
    const q = zp && zp.offsetHeight ? zp.getBoundingClientRect() : null;
    const was = `${snap.l},${snap.t},${snap.w},${snap.h},${snap.zoom?.top},${snap.zoom?.bottom},${snap.hostRaw}`;
    snap.l = r.left; snap.t = r.top; snap.rw = r.width; snap.rh = r.height; snap.w = el.clientWidth; snap.h = el.clientHeight;
    snap.zoom = q ? { top: q.top - r.top, bottom: q.bottom - r.top } : null;
    snap.hostRaw = [hr.width, hr.height]; snap.hostWH = [Math.max(1, Math.round(hr.width)), Math.max(1, Math.round(hr.height))];
    if (zp && !boxWatched.has(zp)) { boxWatched.add(zp); boxRO.observe(zp); }
    return was !== `${snap.l},${snap.t},${snap.w},${snap.h},${snap.zoom?.top},${snap.zoom?.bottom},${snap.hostRaw}`;
  }
  // Open cards over the figure (a presenter slide's numbers, notices), in the lobule's own coordinates, 6 px wider all round.
  function readCards() {
    const hr = el.getBoundingClientRect(), cards = [];
    for (const c of document.querySelectorAll('.stage-blocker:not([hidden])')) {
      const r = c.getBoundingClientRect();
      if (r.width && getComputedStyle(c).visibility !== 'hidden') cards.push({ l: r.left - hr.left - 6, r: r.right - hr.left + 6, t: r.top - hr.top - 6, b: r.bottom - hr.top + 6 });
    }
    const key = cards.map((c) => `${c.l},${c.t},${c.r},${c.b}`).join(';');
    if (key === snap.cardKey) return false;
    snap.cards = cards; snap.cardKey = key;
    return true;
  }
  const readAll = () => { const a = readBox(), b = readCards(); return a || b; };
  // (Laid out again, in the next frame, with what was read.)
  const relayout = () => { layoutKey = ''; drawVersion++; if (!raf && fade > 0) raf = nextFrame(loop); };   // (a size, not the camera: counted as the model's change)
  function readRest() { restT = 0; if (readAll() && fade > 0) relayout(); }
  let restT = 0;
  function landedRead() { if (!restT) restT = restPass(readRest); }
  const boxWatched = new Set();
  const boxRO = new ResizeObserver(() => { if (readAll() && fade > 0) relayout(); });
  boxRO.observe(el); boxRO.observe(host);
  readBox();
  addEventListener('resize', () => { if (readAll() && fade > 0) relayout(); });
  // On the way out of the lobule (a slide that leaves it, asked for by the presenter as the change begins), the free space is held as
  // the leaving slide's cards left it: the next slide's cards come in before the rise, and a lobule that followed their space glided in
  // and down toward its bottom before it zoomed out (Mohammad, 21 Oct, Ascites 4 to 5 on a phone). Held, the way out only ever zooms out.
  // (Kept for this stage size only; given back when the lobule is framed for a slide again or has gone.)
  let heldFree = null;
  // (freeRect's answer is read where it is asked for and not kept: one object, written again in place each time. liveFree makes its own,
  // for heldFree, which keeps it.)
  const freeNow = { l: 0, t: 0, r: 0, b: 0 };
  function freeRect() {
    if (heldFree && heldFree.W === geo.W && heldFree.H === geo.H) return heldFree.f;
    return liveFreeInto(freeNow);
  }
  function liveFree() { return liveFreeInto({ l: 0, t: 0, r: 0, b: 0 }); }   // alloc-rare: only once, as a slide leaves the lobule (heldFree keeps it)
  function liveFreeInto(o) {
    const W = geo.W, H = geo.H, phone = phoneMQ.matches;
    // (--pz-l, --pz-r, --pz-b: the room a presenter slide's text and data take.)
    let t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8, b = H - (cssN('--bot-occ') || 100) - cssN('--pz-b') - 8, l = 12 + cssN('--pz-l'), r = W - cssN('--right-occ') - cssN('--pz-r') - 12;
    // The zoom buttons: on a phone they sit above the dock (Zones and Lymph live in the View menu); should they sit near the top, the labels start below them.
    // (Its place is the one kept with the lobule's boxes, snap.zoom: read at a rest boundary, never in the frame.)
    const q = phone && snap.zoom;
    if (q && q.top < H / 2) t = Math.max(t, q.bottom + 14);
    // The bottom stays above the vitals dock. With no room left, layoutLabels hides the labels rather than set them under it.
    o.l = l; o.t = t; o.r = Math.max(l + 80, r); o.b = b;
    return o;
  }
  // The lobule and its labels' places, in world units.
  const frameBuf = [0, 0, 0, 0];
  const frameBox = () => {
    const { cx, cy, R } = geo, ph = phoneMQ.matches, wx = ph ? 1.05 : 1.52, hy = ph ? 1.02 : 1.04;
    // Even above and below the hexagon (its curved sides reach about 0.97 R), so a fitted lobule is centred in the free space.
    frameBuf[0] = cx - wx * R; frameBuf[1] = cy - hy * R; frameBuf[2] = cx + wx * R; frameBuf[3] = cy + hy * R;
    return frameBuf;
  };
  // The framing, written into `o` ({ k, x, y }) where it is only read (the pan, the pinch, the clamp); fitV makes its own object, for a
  // glide or a station that keeps it as its target.
  function fitInto(o) {
    if (!geo) { o.k = 1; o.x = 0; o.y = 0; return o; }
    const f = freeRect(), fb = frameBox(), x0 = fb[0], y0 = fb[1], x1 = fb[2], y1 = fb[3];
    const k = clamp(Math.min((f.r - f.l) / (x1 - x0), (f.b - f.t) / (y1 - y0)), 0.3, 1.8);
    o.k = k; o.x = (f.l + f.r) / 2 - k * (x0 + x1) / 2; o.y = (f.t + f.b) / 2 - k * (y0 + y1) / 2;
    return o;
  }
  const fitA = { k: 1, x: 0, y: 0 }, fitC = { k: 1, x: 0, y: 0 };   // (fitInto's scratch for a move event (fitA) and for clampV (fitC), which only read it in the same call)
  function fitV() { return fitInto({ k: 1, x: 0, y: 0 }); }
  // While the lobule is being dragged about at its framing (rubber band), nothing may snap it back to fit.
  let rubber = false, rubberT = 0;
  const bandOffset = (o, L) => L * Math.tanh(o / L);
  // Zooming out past the framing stretches with resistance (as the anatomy's pinch-out does: softK, a 0.3 power) and
  // glides back to the framing once the gesture ends. rawK is the unresisted scale while stretched, 0 when not.
  let rawK = 0, stretchT = 0;
  function stretchBy(px, py, f) {
    if (!geo) return;
    if (!rawK) rawK = kFit;
    rawK = Math.max(kFit * 0.5, rawK * f);   // as the anatomy: the unresisted scale stops at half the framing
    stopInertia(); cancelFrame(glide); gliding = false; rubber = true; atFit = false;
    const F0 = fitInto(fitA);
    if (rawK >= kFit) { rawK = 0; rubber = false; Object.assign(V, F0); atFit = true; viewChanged(); return; }
    // The stretch shrinks about the middle of the free space, not the fingers: the lobule stays where its framing puts it, so zooming
    // out at the framing never drifts it sideways or down and back.
    const fr = freeRect(); px = (fr.l + fr.r) / 2; py = (fr.t + fr.b) / 2;
    const k = kFit * Math.pow(rawK / kFit, 0.3), r = k / V.k;
    V.x = px - (px - V.x) * r; V.y = py - (py - V.y) * r; V.k = k; viewChanged();
  }
  // (The stretch's and the rubber band's spring-backs, each one timer, asked again (and re-armed while the wheel is not yet quiet) here.)
  function stretchSoon(ms) { clearTimeout(stretchT); stretchT = setTimeout(endStretch, ms); }
  function rubberSoon(ms) { clearTimeout(rubberT); rubberT = setTimeout(rubberEnd, ms); }
  function endStretch() { if (!rawK) return; if (!wheelQuiet()) { stretchSoon(120); return; } rawK = 0; rubber = false; glideTo(fitV(), 380); atFit = true; }
  function clampV() {
    if (!geo || rubber) return;
    const F0 = fitInto(fitC);
    kFit = F0.k;
    if (V.k <= kFit * 1.001) { Object.assign(V, F0); atFit = true; return; }
    atFit = false;
    V.k = Math.min(V.k, kFit * KMAX);
    const { cx, cy, R } = geo, f = freeRect(), mx = (f.l + f.r) / 2, my = (f.t + f.b) / 2;
    // The free space's centre stays over the lobule; fitted, it is the framing.
    // (The room to pan opens quickly: fully by a third past the framing, so a small zoom can already be moved.)
    const t = clamp((V.k / kFit - 1) * 3, 0, 1);
    const fcx = (mx - F0.x) / F0.k, fcy = (my - F0.y) / F0.k;
    const wx = (mx - V.x) / V.k, wy = (my - V.y) / V.k;
    const x0 = lerp(fcx, cx - R * 1.05, t), x1 = lerp(fcx, cx + R * 1.05, t), y0 = lerp(fcy, cy - R * 0.95, t), y1 = lerp(fcy, cy + R * 0.95, t);
    const cxw = clamp(wx, Math.min(x0, x1), Math.max(x0, x1)), cyw = clamp(wy, Math.min(y0, y1), Math.max(y0, y1));
    V.x = mx - cxw * V.k; V.y = my - cyw * V.k;
  }
  // Match the anatomy's flick decay, measured in screen pixels per millisecond.
  function stopInertia() { cancelFlick?.(); cancelFlick = null; camAim = null; }
  let cancelFlick = null;
  function fling(vx, vy) {
    stopInertia();
    if (reduce.matches || fade < 0.98 || Math.hypot(vx, vy) < FLICK.minSpeed) return;
    cancelFlick = runFlick({
      x: V.x, y: V.y, vx, vy,
      hard: (x, y) => { const sx = V.x, sy = V.y; V.x = x; V.y = y; clampV(); const r = [V.x, V.y]; V.x = sx; V.y = sy; return r; },
      apply: (x, y) => { V.x = x; V.y = y; viewChanged(); },
      done: () => { cancelFlick = null; },
    });
  }
  function zoomAround(px, py, factor) {
    stopInertia();
    const k = clamp(V.k * factor, kFit, kFit * KMAX), r = k / V.k;
    V.x = px - (px - V.x) * r; V.y = py - (py - V.y) * r; V.k = k;
    clampV(); viewChanged();
  }
  // A short glide between framings (the buttons, Fit, a card opening).
  let glide = 0, gliding = false;
  // A presenter's glide (focusOn) carries the labels like any glide, and so does a dive re-aimed on its way in (aim): the names are
  // laid out for the framing the dive lands on and ride its camera with the figure; focusOn's glide on from there carries them too.
  // (ease 'in': from rest and still at speed where it lands, for a glide another move carries on from: the way out to the rise.)
  // (steady: a refit to cards that moved: timed by glideClock, so a slow frame at its start (the layout the same change set off) holds
  // the glide back a little instead of carrying it part of the way at once.)
  // (The in-out glide on the stage camera's curve, the quintic: ease.js, combined plan M2.)
  const glideTrack = createGlideTracker();   // (a glide's last frames: its speed per ms, so another begun on it carries that on, ease.js)
  function glideTo(to, ms = 260, cam = false, aim = null, ease = 'inOut', steady = false) {
    stopInertia();
    const v0 = gliding && ease !== 'in' ? glideTrack.take(performance.now()) : null;
    glideTrack.begin();
    cancelFrame(glide); gliding = false;
    camAim = aim;   // (any other glide, or a hand on the lobule, replaces the presenter's)
    const from = { ...V }, t0 = performance.now();   // alloc-rare: once as a glide begins (a button, a station, a resize), kept by its frames
    // (Lite mode: the presenter's camera jumps, and the lobule fades in at its new framing.)
    if (reduce.matches || !fade) { camAim = null; Object.assign(V, to); viewChanged(); return; }
    // A presenter's glide carries the labels, leaders and dots with the figure (ride, as every other glide does), and they are placed
    // again in the frame it lands: no fade out at its start, no fade back in on a timer (Z5).
    const clock = steady ? glideClock() : null;
    const c0 = v0 ? carryRate(v0, from, to, Math.max(1, snap.w)) * ms : 0;
    const step = (now) => {   // alloc-rare: once as a glide begins (the frames below allocate nothing)
      const u = clamp((clock ? clock(now) : now - t0) / ms, 0, 1), e = ease === 'in' ? u * u : easeMove(u);
      const ec = u < 1 ? carried(e, u, c0) : e;   // (with the speed of a glide this one took over from, if any: ease.js carried)
      lerpInto(from, to, ec, V);   // (the even glide, cam-arc.js: the same record maths the stage's glides use)
      glideTrack.sample(V, now);
      viewChanged();
      if (u < 1) glide = nextFrame(step); else { gliding = false; camAim = null; viewChanged(); if (cam) landedRead(); }   // (a presenter's: the cards' boxes read again in a task after it lands)   // (landed: drawn once more at the sharpness the new zoom wants)
    };
    gliding = true;
    glide = nextFrame(step);
  }
  function zoomBy(factor) {
    if (!geo) return;
    if (sinTo) return;   // in the sinusoid: only the view switch goes back up to the lobule
    if (fade < 0.98 || diveScaled) return;   // (the dive still on its way: see fitView)
    handsOff();
    const f = freeRect(), px = (f.l + f.r) / 2, py = (f.t + f.b) / 2;
    const k = clamp(V.k * factor, kFit, kFit * KMAX), r = k / V.k;
    const to = { k, x: px - (px - V.x) * r, y: py - (py - V.y) * r };
    const saved = { ...V }; Object.assign(V, to); clampV(); const target = { ...V }; Object.assign(V, saved);
    glideTo(target);
  }
  // When the free space changes (a card opens, the readouts expand), a fitted lobule follows it.
  let refitLater = false;
  function refit() { if (geo && reaimOut()) return;
    if (!geo || rubber || sinU > 0 || sinTo) { refitLater = !!geo; return; }   // not while in or on the way to the sinusoid: the zoom holds the lobule still
    // A new size: the lobule is built for it first (ensureGeo keeps the spot in view), so the framing below never mixes the old build with the new space.
    { const r = snap.hostRaw; if (r && r[0] >= 2 && r[1] >= 2) ensureGeo(Math.round(r[0]), Math.round(r[1])); }
    // (Mid-glide to a station, the glide's target follows the new space: clampV would read the glide's first, still unzoomed frames as the fit
    // and send the lobule back there, so a slide's zoom never arrived.)
    refitLater = false; const F0 = fitV(); kFit = F0.k; if (atFit) glideTo(F0, 260, false, null, 'inOut', true); else if (camAim) Object.assign(camAim.to, framing(camAim.part, camAim.zoom)); else if (aimed && fade <= 0.98) glideTo(framing(aimed.part, aimed.zoom)); else reclamp(); }
  // Zoomed in (a presenter's station, or a hand's pan) when the free space changes: the new framing is glided to, never jumped to.
  // (A presenter slide's cards change the space as the next slide comes in: on the way out of the lobule from a central-vein close-up
  // the clamp used to snap the lobule sideways before the zoom out began, 20 Oct, Mohammad.)
  function reclamp() {
    const sk = V.k, sx = V.x, sy = V.y, wasFit = atFit; clampV();
    const to = { k: V.k, x: V.x, y: V.y }, fit = atFit;
    V.k = sk; V.x = sx; V.y = sy; atFit = wasFit;
    if (Math.abs(to.k - V.k) + Math.abs(to.x - V.x) + Math.abs(to.y - V.y) > 0.5) { glideTo(to, 420, false, null, 'inOut', true); atFit = fit; } else { clampV(); viewChanged(); }
  }
  // (The cards' space changes on every slide change. With the lobule closed nothing is read: landing() reads its boxes as it opens.
  // Open, they are read in a rest pass, between frames, never in the slide change's own task.)
  let occT = 0;
  const onOcc = () => { occT = 0; readAll(); if (fade > 0) { layoutKey = ''; refit(); } };
  addEventListener('pps:occ', () => {
    if (fade <= 0 && !store.get().lobule) { snap.cardKey = '~'; return; }
    if (!occT) occT = restPass(onOcc);
  });
  // A new text size: the labels glide to their new places instead of jumping.
  let easeT = 0;
  addEventListener('pps:labelscale', () => { measureShown(); classSoon(labels, 'lz-ease', true); clearTimeout(easeT); easeT = setTimeout(easeEnd, 450); syncLeaders(); drawVersion++; viewVer++; layoutKey = ''; if (!raf && fade > 0) raf = nextFrame(loop); });
  let pacedVer = -1, viewVer = 0;   // viewVer: a pan, zoom, resize or label change, drawn without waiting
  // (viewBumps: the bumps of drawVersion that only moved the camera: the model's own, drawVersion less these, is what the surface pass
  // in drawGL waits for when the model is paused.)
  let viewBumps = 0;
  const viewChanged = () => { drawVersion++; viewBumps++; viewVer++; tissueKey = ''; layoutKey = ''; if (!raf && fade > 0) raf = nextFrame(loop); };
  // (A point to the screen and back, one number at a time: sX and sY, wX and wY make no array.)
  const wX = (x) => (x - V.x) / V.k, wY = (y) => (y - V.y) / V.k;
  const sX = (x) => x * V.k + V.x, sY = (y) => y * V.k + V.y;
  function resetView() {
    stopInertia(); if (!geo) { V.k = 1; V.x = 0; V.y = 0; return; }
    const F0 = fitV(); kFit = F0.k;
    // A presenter slide that dives straight to a station (aim): the lobule lands on that framing, in one move.
    if (aimed && aimed.part !== 'fit') { atFit = false; Object.assign(V, framing(aimed.part, aimed.zoom)); } else { atFit = true; Object.assign(V, F0); }
    viewChanged();
  }
  let aimed = null;
  // The presenter's framing of a part ('triad' | 'sinusoid' | 'central'), zoom × the fit; kFit must be current.
  function framing(part, zoom = 2) {
    const g = geo, tri = g.lobules[0].corners[3];
    const wf = part === 'triad' ? 0.12 : part === 'central' ? 1 : 0.5;   // (how far from the portal corner toward the centre the station is)
    const w0 = part === 'central' ? g.cx : lerp(tri[0], g.cx, wf), w1 = part === 'central' ? g.cy : lerp(tri[1], g.cy, wf);
    const f = freeRect(), mx = (f.l + f.r) / 2;
    let my = (f.t + f.b) / 2, k = clamp(kFit * zoom, kFit, kFit * KMAX);
    // A free space too short for a row of labels above or below what the slide is about, clear of the disc no label may cover
    // (a phone at a large text size, under the slide's words): it is framed at the top of the free space, at the same zoom,
    // so one row of labels fits below it rather than every label being left out. (The same sums as layoutLabels: a label's
    // height at this text size and its margins.)
    const disc = part === 'triad' ? (g.rt || 6) * 2.4 : part === 'central' ? g.rcv0 * 1.7 : 0;
    if (disc) {
      const lk = parseFloat(document.documentElement.style.getPropertyValue('--label-k')) || 1, H = f.b - f.t;
      const row = 21 * lk + 2 * Math.max(4 + 2 * lk, 5 * lk + 5);
      if (H / 2 - Math.max(14, disc * k) < row) my = f.t + Math.min(H / 2, Math.max(14, disc * k) + 4);
    }
    const sk = V.k, sx = V.x, sy = V.y;
    V.k = k; V.x = mx - w0 * k; V.y = my - w1 * k; clampV();
    const to = { k: V.k, x: V.x, y: V.y };   // alloc-rare: once per slide station or resize (refit), the target a glide keeps
    V.k = sk; V.x = sx; V.y = sy;
    return to;
  }
  // Glides the view, at its zoom, to bring a world point to the middle of the free space.
  function centreOn(w) {
    const f = freeRect(), saved = { ...V };
    Object.assign(V, { k: V.k, x: (f.l + f.r) / 2 - w[0] * V.k, y: (f.t + f.b) / 2 - w[1] * V.k }); clampV();
    const to = { ...V }; Object.assign(V, saved); glideTo(to, 380);
  }
  // (Not while the dive is still on its way in or out: a glide begun on its first frames re-staged or popped the framing at landing.)
  function fitView() { if (sinTo || fade < 0.98 || diveScaled) return; handsOff(); atFit = true; const F0 = fitV(); kFit = F0.k; glideTo(F0); }
  // A button (Fit, + or −) wins over the scroll that was under way when it was pressed: a Mac trackpad's momentum goes on
  // for a second or more after the fingers lift, and each of its events cancelled the button's glide (Fit did nothing).
  // That scroll is ignored until it stops; a stretch or rubber band it left springs back as part of the glide.
  function handsOff() {
    if (performance.now() - wheelAt < 250) wheelMute = true;
    clearTimeout(rubberT); clearTimeout(stretchT); rubber = false; rawK = 0;
  }

  // ── Gestures: wheel and pinch zoom, drag pans, a tap selects; out past 1× returns to the liver ──
  // As on the anatomy: a mouse wheel zooms about the pointer; a trackpad's two-finger scroll pans (once zoomed in)
  // and its pinch (ctrlKey) zooms; Ctrl/⌘ + wheel always zooms. A gesture is classified once, as it starts.
  let wheelKind = null, wheelAt = 0, wheelMute = false, wheelFrame = -9;
  // (The wheel has gone quiet: 220 ms since its last event AND two frames run since. The browser hands a trackpad's wheel events over
  // once a frame, so on a slow frame (200 ms and more) the time alone had passed with the pinch still going: its spring-back glided the
  // lobule out to its framing between two of the pinch's events, and the next one zoomed it in again, the zoom flickering in and out
  // (4 Nov 2026, Mohammad). A gesture's own 250 ms window counts the same way: a slow frame never ends a pinch.)
  const wheelQuiet = (ms = 200) => performance.now() - wheelAt >= ms && frameCount() - wheelFrame >= 2;
  const rubberEnd = () => { rubberT = 0; if (!rubber) return; if (!wheelQuiet()) { rubberSoon(120); return; } rubber = false; const G0 = fitV(); glideTo(G0, 380); atFit = true; };   // (the wheel's rubber band lets go: springs back)
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (wheelMute) { const now = performance.now(); if (now - wheelAt < 250) { wheelAt = now; return; } wheelMute = false; }
    stopInertia();
    cancelFrame(glide); gliding = false;   // a button's glide never fights the hand
    const u = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? snap.h : 1, dx = ev.deltaX * u, dy = ev.deltaY * u, now = performance.now();
    if (wheelQuiet(250)) wheelKind = ev.ctrlKey || ev.metaKey ? 'pinch' : ev.deltaMode === 0 && (dx !== 0 || ev.wheelDeltaY == null || Math.abs(Math.abs(ev.wheelDeltaY) - Math.abs(ev.deltaY) * 3) < 1) ? 'pad' : 'wheel';
    wheelAt = now; wheelFrame = frameCount();
    if (wheelKind === 'pad' && !ev.ctrlKey && !ev.metaKey) {
      if (V.k <= kFit * 1.001 && geo) {   // at its framing the lobule follows the scroll on a rubber band, and springs back when it stops
        const F0 = fitInto(fitA), Lx = 0.4 * (snap.w || 800), Ly = 0.4 * (snap.h || 600);
        const bx = rubber ? Math.atanh(clamp((V.x - F0.x) / Lx, -0.999, 0.999)) * Lx : 0, by = rubber ? Math.atanh(clamp((V.y - F0.y) / Ly, -0.999, 0.999)) * Ly : 0;
        rubber = true; atFit = false;
        V.x = F0.x + bandOffset(bx - dx, Lx); V.y = F0.y + bandOffset(by - dy, Ly); viewChanged();
        clearTimeout(rubberT);
        rubberSoon(220);
        return;
      }
      V.x -= dx; V.y -= dy; atFit = false; clampV(); viewChanged();
      return;
    }
    const f = ev.ctrlKey || ev.metaKey ? Math.exp(-clamp(dy, -50, 50) * 0.01) : Math.exp(-clamp(dy, -120, 120) * 0.0015);
    const px = localX(ev), py = localY(ev);
    // (A two-finger drift at the framing that began a pad scroll leaves its rubber band and its 220 ms spring-back pending: a pinch that follows
    // must end it here, or the spring-back glided the lobule to the framing in the middle of the zoom, then the pinch carried on.)
    if (rubber && !rawK) { clearTimeout(rubberT); rubberT = 0; rubber = false; }
    if (V.k <= kFit * 1.001 && f < 1) {
      stretchBy(px, py, f); stretchSoon(220); return;   // a zoom-out at its framing stretches and springs back
    }
    if (rawK && f > 1) { stretchBy(px, py, f); stretchSoon(220); return; }
    zoomAround(px, py, f);
  }, { passive: false });
  const touches = new Map();
  let pinch = null, down = null, drag = null;
  // The last moments of a drag (time, x, y), for the flick when the finger lifts: a ring of 64, the oldest dropped as it fills, and
  // those over 90 ms old dropped as it is added to (the drag that holds the pointer is the only one, so the one ring serves).
  const TR_MASK = 63, trT = new Float64Array(64), trX = new Float64Array(64), trY = new Float64Array(64);
  let trI = 0, trN = 0;
  function trailStart() { trI = 0; trN = 0; trailPush(performance.now(), V.x, V.y); }
  function trailPush(now, x, y) {
    if (trN === 64) { trI = (trI + 1) & TR_MASK; trN--; }
    const j = (trI + trN) & TR_MASK; trT[j] = now; trX[j] = x; trY[j] = y; trN++;
    while (trN > 2 && now - trT[trI] > 90) { trI = (trI + 1) & TR_MASK; trN--; }
  }
  // The first two fingers down, as fingerA and fingerB (their own [x, y], read where they are asked for): no list made for each move.
  let fingerA = null, fingerB = null, tN = 0;
  const grab2 = (p) => { if (tN === 0) fingerA = p; else if (tN === 1) fingerB = p; tN++; };
  const pts2 = () => { tN = 0; fingerA = fingerB = null; touches.forEach(grab2); };
  const labelOf = (ev) => Object.entries(labs).find(([, L]) => L.el.contains(ev.target))?.[0];
  const onScene = (ev) => !!ev.target.closest?.('.lz-lab') || ev.target === el || ev.target === fx || ev.target === leadersBox || ev.target === tissue || ev.target === glCv;
  el.addEventListener('pointerdown', (ev) => {
    if (!onScene(ev) || systemEdge(ev)) return;
    readBox();
    stopInertia();
    if (ev.isPrimary) touches.clear();
    touches.set(ev.pointerId, local(ev));   // (one [x, y] a finger, kept and moved in place while it is down)
    cancelFrame(glide); gliding = false;
    // Captured, so a drag keeps going over the labels, the card or past the edge.
    try { el.setPointerCapture(ev.pointerId); } catch (e) { caught('lobule-zoom:527', e); /* gone */ }
    if (touches.size === 2) {
      pts2();
      pinch = { d: Math.hypot(fingerA[0] - fingerB[0], fingerA[1] - fingerB[1]) || 1, k: V.k, mx: (fingerA[0] + fingerB[0]) / 2, my: (fingerA[1] + fingerB[1]) / 2, dl: 0 };
      down = null; drag = null;
    } else { down = { x: ev.clientX, y: ev.clientY, t: performance.now(), label: labelOf(ev) }; drag = { p: local(ev), ox: 0, oy: 0 }; trailStart(); }
  });
  el.addEventListener('pointermove', (ev) => {
    const tp = touches.get(ev.pointerId);
    if (tp !== undefined) {
      const lx = localX(ev), ly = localY(ev);
      tp[0] = lx; tp[1] = ly;
      if (touches.size === 2 && pinch) {
        pts2();
        const d = Math.hypot(fingerA[0] - fingerB[0], fingerA[1] - fingerB[1]), mx = (fingerA[0] + fingerB[0]) / 2, my = (fingerA[1] + fingerB[1]) / 2;
        V.x += mx - pinch.mx; V.y += my - pinch.my; pinch.mx = mx; pinch.my = my;
        const dl = pinch.dl || pinch.d; pinch.dl = d;
        if (rawK || (V.k <= kFit * 1.001 && d < dl)) {
          stretchBy(mx, my, d / dl);
          return;
        }
        zoomAround(mx, my, (pinch.k * d / pinch.d) / V.k);
      } else if (touches.size === 1 && drag && (ev.buttons || ev.pointerType !== 'mouse')) {
        const dp = drag.p;
        if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 8) return;
        down = null;
        if (V.k > kFit * 1.001) { V.x += lx - dp[0]; V.y += ly - dp[1]; clampV(); viewChanged(); classSoon(el, 'lz-drag', true); }
        else if (geo) {   // at its framing there is nowhere to go: the lobule follows the hand on a rubber band and springs back on release
          const F0 = fitInto(fitA), Lx = 0.4 * (snap.w || 800), Ly = 0.4 * (snap.h || 600);   // near-free travel, easing toward 40% of the view
          cancelFrame(glide); gliding = false; rubber = true; drag.ox += lx - dp[0]; drag.oy += ly - dp[1];
          V.x = F0.x + Lx * Math.tanh(drag.ox / Lx); V.y = F0.y + Ly * Math.tanh(drag.oy / Ly); atFit = false; viewChanged(); classSoon(el, 'lz-drag', true);
        }
        dp[0] = lx; dp[1] = ly;   // (the drag's own [x, y], moved in place)
        trailPush(performance.now(), V.x, V.y);
      }
    }
    if (ev.pointerType === 'mouse' && !ev.buttons && geo && onScene(ev)) { classSoon(el, 'lz-hot', hitOver(wX(localX(ev)), wY(localY(ev)))); }
  });
  el.addEventListener('pointerup', (ev) => {
    if (down && touches.size <= 1 && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 8 && performance.now() - down.t < 600 && onScene(ev)) {
      const w = down.label ? anchorOf(down.label) : [wX(localX(ev)), wY(localY(ev))];   // alloc-rare: a tap (once per gesture), not a move
      if (down.label && labs[down.label] && classHas(labs[down.label].el, 'edge')) centreOn(w);
      else select(down.label ? hitKind(down.label) : hit(w[0], w[1]), w);
    }
    down = null;
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (ev) => {
    if (!touches.delete(ev.pointerId)) return;
    const finished = drag;
    down = null;
    if (touches.size < 2) pinch = null;
    if (!touches.size) { rubber = false; rawK = 0; }
    if (!touches.size && geo && V.k <= kFit * 1.001) { const F0 = fitV(); if (Math.abs(V.x - F0.x) + Math.abs(V.y - F0.y) + Math.abs(V.k - F0.k) * 100 > 0.5) { glideTo(F0, 380); atFit = true; } }
    if (ev.type === 'pointerup' && !touches.size && finished) {   // every pointer type flicks the same way
      const n = trN, ia = trI, ib = (trI + n - 1) & TR_MASK, dt = trT[ib] - trT[ia];
      if (n >= 3 && dt >= 30 && performance.now() - trT[ib] < 50 && V.k > kFit * 1.001) {
        const vx = (trX[ib] - trX[ia]) / dt, vy = (trY[ib] - trY[ia]) / dt;
        const cap = Math.min(1, 2 / (Math.hypot(vx, vy) || 1));
        fling(vx * cap, vy * cap);
      }
    }
    // Rebase the remaining finger after a pinch so it can carry on panning without a jump.
    if (touches.size === 1) { pts2(); drag = { p: [fingerA[0], fingerA[1]], ox: 0, oy: 0 }; trailStart(); } else drag = null;   // (p its own copy: a finger's [x, y] is moved in place)
    if (!touches.size) classSoon(el, 'lz-drag', false);
  });
  el.addEventListener('dblclick', (ev) => { if (!onScene(ev)) return; zoomAround(localX(ev), localY(ev), V.k < kFit * KMAX * 0.98 ? 2 : 1 / KMAX); });
  // (The lobule's place on the page is the one kept with its boxes: read again as a press begins and as the pointer comes over it.)
  const localX = (ev) => ev.clientX - snap.l, localY = (ev) => ev.clientY - snap.t;
  const local = (ev) => [localX(ev), localY(ev)];   // (for a press or a tap; a move uses localX and localY)
  el.addEventListener('pointerenter', () => { readBox(); });

  // ── Selection: the lobule's parts open the same action card as the anatomy's vessels ──
  function select(hv, at) {
    if (!hv) { if (store.get().selection?.type === 'lobule') store.set({ selection: null }); return; }
    store.set({ selection: { type: 'lobule', ...hv, at } });
  }
  const idsFor = (sl) => {
    const G = geo;
    if (!G || sl?.type !== 'lobule') return new Set();   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    const tr = sl.tri != null ? G.triads[sl.tri] : null;
    if (sl.part === 'triad' && tr) return new Set([tr.pv.id, G.inlets[tr.i * 2].id, G.inlets[tr.i * 2 + 1].id]);   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    if (sl.part === 'sin' && sl.tube != null) return chainOf(sl.tube);
    if (sl.part === 'ha' && tr) return new Set([tr.haT.id, ...G.tubes.filter((t) => t.kind === 'tw' && t.tri === tr.i).map((t) => t.id)]);   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    if (sl.part === 'bd' && tr) return new Set([tr.bdT.id]);   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    if (sl.part === 'lv' && sl.tube != null) return chainOf(sl.tube);
    if (sl.part === 'lv' && tr) return new Set([tr.lv.id]);   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    if (sl.part === 'cv') return new Set([G.cv.id]);   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    if (sl.tube != null) return new Set([sl.tube]);   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
    return new Set();   // alloc-rare: only when the selection changes (selIds keeps the set for the selection it was made for)
  };
  let selFor = null, selIdsC = new Set();
  function selIds() {
    const sl = store.get().selection;
    if (sl === selFor) return selIdsC;
    selFor = sl; selIdsC = idsFor(sl);
    return selIdsC;
  }
  store.on('selection', () => { attrKey = ''; tissueKey = ''; if (!raf && fade > 0) raf = nextFrame(loop); });
  // Pinning a moment puts the Then / Now / Change switch over the top: the lobule frames itself below it.
  store.on('compareSnap', () => nextFrame(() => { if (geo && fade > 0) { layoutKey = ''; refit(); } }));   // alloc-rare: only when a moment is pinned or let go (store compareSnap)

  // ── State ──
  let F = null, fade = 0, raf = 0, last = 0, lastPaint = 0;
  // Figure resolution: taken up as the lobule opens and at once while it is hidden. A change made while it shows (30 Oct, Mohammad:
  // "when I check manual 25% for example the lobule doesn't change") waits (lzWant) for the lobule to stand still and whole (not
  // mid-dive, mid-rise or inside a sinusoid), then eases in: resSwap.
  let lzK = renderScale(), lzWant = null;
  const lzScale = () => lzK;
  onRenderScale(() => {
    const k = renderScale();
    if (fade <= 0) { lzK = k; lzWant = null; return; }
    lzWant = k === lzK ? null : k;
    if (lzWant != null) coverGL()?.prepare();   // (the cover's program compiles while the lobule comes to rest: res-cover-gl.js)
    if (lzWant != null && !raf) raf = nextFrame(loop);
  });
  // (The model and the field's are two objects kept for the view and written in place by lobuleStateInto, so a frame makes none.)
  const modelBuf = {}, fsBuf = {};
  let geo = null, geoKey = '', model = null;
  // Where each vessel's moving marks are (blood stream, chevrons, lymph drops), kept by tube id so a
  // rebuilt geometry (a resize, the phone's toolbar sliding) carries on from the same place, not a jump.
  const motion = new Map();
  let lyV = null;
  const motionOf = (t) => { let mo = motion.get(t.id); if (!mo) motion.set(t.id, (mo = {})); return mo; };   // alloc-rare: only the first time a tube is asked for (kept by id across rebuilds)
  let drawVersion = 0, idleDrawn = '', lastSurface = 0;
  const binCache = new Map();
  // Any change may show in the lobule, except these, which never do (the model's frame arrives through update()).
  const UNSEEN = new Set(['frame', 'historyTick', 'details', 'found', 'presetLoading', 'presetList', 'lastHVPG', 'speed', 'lapse', 'tool', 'hiddenReadouts', 'hiddenEvents', 'booted']);
  const seen = (k) => !UNSEEN.has(k);
  store.on('*', (keys) => { if (!Array.isArray(keys) || keys.some(seen)) { drawVersion++; if (!raf && fade > 0) raf = nextFrame(loop); } });
  let lzYield = null;
  let surfCs = null, flowG = null, flowAt = -1;   // what the last surface pass and flow upload in drawGL were made for (see there)
  let gl = null, glTried = false, binKey = '', binReach = [], radKey = [], radAll = '', radCal = '', inkWas = [], attrKey = '', drawKey = '', glDirty = true, tissueKey = '', worldKey = '', layoutKey = '';
  // The lobule's tissue in world space (see paintTissue): a GPU picture (paint-gl.js), which stands where its canvas did.
  const noPicture = () => ({ width: 0, height: 0 });
  let worldCv = noPicture();
  // A new patient (or any change to the tissue's state) crossfades into the lobule instead of snapping: the bitmap it replaces
  // is kept (worldOld, swapped rather than copied) and laid under the new one as it fades in, and the surround's tiles the
  // same way. Both pictures stay sharp throughout; the fade only adds one image draw a frame while it runs.
  const XF_MS = 900;   // as long as the vessels' calibers take to settle (easeRadii, τ 0.3 s)
  let worldOld = noPicture(), worldOldSc = 0, worldState = '', xfT0 = 0, surNow = null, surOld = null, surT0 = 0;
  const xfU = (t0, now) => { const u = Math.min(1, Math.max(0, (now - t0) / XF_MS)); return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; };
  // (The crossfades run on the eases' clock, frame.js easeNow: a long frame as a new picture comes in, its texture going up, holds the fade
  // back rather than eating its first half. ?paced=0: the wall clock, as before.)
  const xfNow = (now) => (PACED ? easeNow() : now);
  const tissueFading = (now = performance.now()) => { const n = xfNow(now); return (xfT0 > 0 && n - xfT0 < XF_MS) || (surT0 > 0 && n - surT0 < XF_MS); };
  const tubeData = new Float32Array(MAXT * TUBE_TEXELS * 4), flowData = new Float32Array(MAXT * FLOW_TEXELS * 4);
  // The vessel attributes as last sent (tubeShown), the rows changed since the vessel layer was drawn (glRows), and the
  // look it was drawn with (glLook): a redraw of only those rows' cells stands in for a whole one (veins-gl drawRows).
  let tubeShown = null, glLook = '';
  const glRows = new Set();
  let clock = 0, origins = null, originsF = null;
  const pc = (p) => (model?.hide ? tk('--lz-lumen-hidden') : pressureColor(p));

  // One GPU context for the figure (4 Nov 2026, Mohammad: "everything on one GPU context"): the lobule's vessels, tissue, overlay and field are
  // drawn in the stage's renderer (figure(): its top, veins-gl.js) into a texture of their own, which the stage lays over the figure in its
  // present, under the glass: no canvas, context or copy of its own. glCv stays in the page as the empty surface the pointer lands on, and as the
  // size of the texture. (No switch for the lobule's own context: one path, PR-01.) Hosted from the first frame to the last; a new stage context makes it again.
  const figureTop = () => { const t = figure?.() ?? null; return t && t.gl && !t.gl.isContextLost?.() ? t : null; };
  let shareTop = null, shareOff = null, shW = 1, shared = false;
  const elXf = { rot: 0, Z: 1, ox: 0, oy: 0 };   // (the sinusoid zoom's turn and growth of the lobule about its fixed point: placeSinusoid)
  let fieldWas = 0;
  // The lobule's texture, then the field's under it, laid in the stage's present (under the glass: LZ_UNDER_GLASS).
  // The view the lobule's picture in the figure's texture was drawn for, and whether it is now carried to the view by the GPU (a hand is moving it).
  const drawnV = { ok: false, k: 1, x: 0, y: 0, W: 0, H: 0, dpr: 0, dark: false };
  let frozenDraw = false, frozenT = 0;
  const carryNow = { a: 1, tx: 0, ty: 0 };   // (the carry for the view now, written in place)
  const frozenOK = (W, H, dpr, dark) => drawnV.ok && !glDirty && fade > 0.98 && !diveScaled && sinU === 0 && !sinTo && !wide && !staging && handOn()
    && drawnV.W === W && drawnV.H === H && drawnV.dpr === dpr && drawnV.dark === dark && !!gl && !gl.lost && !!gl.target?.w
    // (Only while the picture still covers the screen carried to the view: else this frame is drawn whole, and the carry goes on from that picture.)
    && drawnV.k > 0 && (carryBetween(drawnV.k, drawnV.x, drawnV.y, V.k, V.x, V.y, carryNow), carryCovers(carryNow.a, carryNow.tx, carryNow.ty, W, H));
  // The hand let go (or paused): the picture is drawn again for the view where it stands.
  function frozenEnd() {
    frozenT = 0;
    if (handOn()) { frozenT = setTimeout(frozenEnd, 120); return; }
    if (!frozenDraw) return;
    idleDrawn = ''; drawVersion++; viewChanged();
    if (!raf && fade > 0) raf = nextFrame(loop);
  }
  // The map the lobule's texture is laid by (CSS px), written in place into shXf: p' = [a b; c d] p + (tx, ty).
  const shXf = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  function shareMap() {
    const wh = !!wide?.host;
    // (The glCv's own CSS transform in the dive, then the layer's, the sinusoid zoom's turn and growth about its fixed point.)
    let a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0;
    // (The picture was drawn for another view: the hand's move since, as a scale and a shift of its own.)
    if (frozenDraw && drawnV.ok && drawnV.k > 0) { a = d = V.k / drawnV.k; tx = V.x - a * drawnV.x; ty = V.y - a * drawnV.y; }
    if (!wh && (DIVE.k !== 1 || DIVE.x || DIVE.y)) { a *= DIVE.k; d *= DIVE.k; tx = tx * DIVE.k + DIVE.x; ty = ty * DIVE.k + DIVE.y; }
    if (elXf.rot || elXf.Z !== 1) {
      const cs = Math.cos(elXf.rot) * elXf.Z, sn = Math.sin(elXf.rot) * elXf.Z, ox = elXf.ox, oy = elXf.oy;
      // p' = o + R (p - o), after the dive's map
      const na = cs * a - sn * c, nb = cs * b - sn * d, nc = sn * a + cs * c, nd = sn * b + cs * d;
      const ntx = ox + cs * (tx - ox) - sn * (ty - oy), nty = oy + sn * (tx - ox) + cs * (ty - oy);
      a = na; b = nb; c = nc; d = nd; tx = ntx; ty = nty;
    }
    // (A card's zoom camera, after all of those: p' = CARD.k p + (CARD.x, CARD.y).)
    if (cardOn()) { a *= CARD.k; b *= CARD.k; c *= CARD.k; d *= CARD.k; tx = CARD.k * tx + CARD.x; ty = CARD.k * ty + CARD.y; }
    shXf.a = a; shXf.b = b; shXf.c = c; shXf.d = d; shXf.tx = tx; shXf.ty = ty;
    return shXf;
  }
  // L3: the lobule's texture, faded in and laid by a map that only scales up about the top left (no turn) over the whole canvas, hides the
  // figure's kept picture, which the stage's present then does not lay under it. Conservative: any doubt says no.
  function shareOpaque() {
    const t = shareTop;
    if (!t || !gl || gl.lost) return false;
    // (Z3, perf review 4 Nov 2026: the dive's field, whole, covers the canvas by itself (covers() counts it so), so the kept picture is not laid
    // under it while the lobule's own texture is still fading in. Laid by layShared as one map over the canvas: no card zoom, or one that only
    // scales up about the top left.)
    if (fieldOp >= 0.999 && fieldGL?.target) {
      if (!cardOn()) return true;
      const r = (t.canvas.width || 1) / (shW || 1), W = t.canvas.width, H = t.canvas.height;
      if (CARD.k >= 1 && CARD.x * r <= 0.5 && CARD.y * r <= 0.5 && CARD.k * W + CARD.x * r >= W - 0.5 && CARD.k * H + CARD.y * r >= H - 0.5) return true;
    }
    if (fade < 0.999 || el.style.visibility === 'hidden') return false;
    const tg = gl.target;
    if (!tg?.w || tg.w !== t.canvas.width || tg.h !== t.canvas.height) return false;
    const m = shareMap(), r = (t.canvas.width || 1) / (shW || 1);
    if (m.b || m.c || !(m.a >= 1) || Math.abs(m.a - m.d) > 1e-6) return false;
    const W = t.canvas.width, H = t.canvas.height, tx = m.tx * r, ty = m.ty * r;
    return tx <= 0.5 && ty <= 0.5 && m.a * W + tx >= W - 0.5 && m.a * H + ty >= H - 0.5;
  }
  function layShared() {
    const t = shareTop;
    if (!t || !gl || gl.lost) return;
    const r = (t.canvas.width || 1) / (shW || 1);   // (the stage canvas's pixels per CSS px)
    if (fieldOp > 0.002 && fieldGL?.target) { const f = fieldGL.target; if (cardOn()) t.lay(f.tex, CARD.k, 0, 0, CARD.k, CARD.x * r, CARD.y * r, fieldOp); else t.lay(f.tex, 1, 0, 0, 1, 0, 0, fieldOp); }
    if (fade <= 0 || el.style.visibility === 'hidden') return;
    const tg = gl.target;
    if (!tg?.w) return;
    const m = shareMap();
    t.lay(tg.tex, m.a, m.b, m.c, m.d, m.tx * r, m.ty * r, fade);
  }
  function shareDown() {
    shareOff?.(); shareOff = null;
    if (shareTop) { try { shareTop.canvas.removeEventListener('webglcontextrestored', onFigureBack); } catch { /* gone */ } }
    shareTop = null; shared = false;
    cap.detach();   // (the names' pass was in that renderer's present; ensureGL attaches them again to the new one)
    host.classList.remove('lz-shared');
  }
  // (The stage made a new renderer, or its context was lost and came back: the lobule's passes are made again in the new one, after the stage's own.)
  function onFigureBack() {
    setTimeout(() => {
      shareDown();
      glTried = false; gl?.dispose?.(); gl = null; binKey = ''; radKey = []; radAll = ''; radCal = ''; attrKey = ''; tissueKey = ''; layoutKey = ''; worldKey = ''; drawKey = '';
      if (fieldGL) { fieldGL = undefined; }
      ensureGL(); if (F) update(F);
      sv.rehost();   // (the sinusoid's pass, names and drawer were in the old renderer too: made again in this one, app review H1)
    }, 0);
  }
  function ensureGL() {
    if (glTried) return gl;
    glTried = true;
    const fig = figureTop();
    gl = fig ? createVeinsGL(glCv, { tubes: MAXT, force: true, who: 'lobule', share: fig }) : null;   // alloc-rare: only once, or after a lost context (glTried)
    if (gl) {
      shareTop = fig; shared = true;
      fig.canvas.addEventListener('webglcontextrestored', onFigureBack);
      shareOff = fig.add({ order: LZ_UNDER_GLASS - 5, solo: true, on: () => !!gl && !gl.lost && (fieldOp > 0.002 || (fade > 0 && el.style.visibility !== 'hidden')), opaque: shareOpaque, draw: layShared });   // (on: it shows now; left in the list once the lobule closes)
      host.classList.add('lz-shared');
      // The names and their leaders are a pass of the same present (L1, docs/gpu-two-contexts-plan.md): over the lobule's overlay and the wide copy, under every
      // glass, so the cards frost them and no hole is cut. The layer's own fades (the camera's, the dive's, a hush) are followed by layer-alpha.js.
      cap.attach({ top: fig, order: LZ_UNDER_GLASS + 2, near: el, active: () => shared && shareTop === fig, scale: () => (fig.canvas.width || 1) / (shW || 1) });
    } else { glTried = false; return null; }   // (no figure context now: nothing is drawn and the picture stays; asked for again between frames)
    restAttr(el, 'data-vessels', gl ? 'webgl2' : 'flat');
    // (A software renderer only: each lobule frame waits for the last to finish on the GPU and gives the page as long again,
    // as the anatomy's vessels do; see sw-yield.js. On a GPU there is no yield.)
    lzYield = softwareYield(!!gl?.software, gl?.software ? shareTop.gl : null);
    if (!gl) { restRemove(glCv); return null; }
    return gl;
  }
  // The GPU context as it is now. A frame never makes it (making it builds and compiles the vessels' programs: a stall inside a frame, 2 Nov
  // 2026, the scan's longest allocation path): the idle preparation and the warm-up make it ahead (ensureGL), and a frame that finds it not made
  // yet draws without it, asks for it between frames, and is drawn again once it is.
  let glAsk = 0;
  function glNow() {
    if (glTried) return gl;
    if (!glAsk) glAsk = restPass(() => { glAsk = 0; ensureGL(); drawVersion++; tissueKey = ''; layoutKey = ''; if (!raf && fade > 0) raf = nextFrame(loop); });   // alloc-rare: only the first frame that finds the GPU context not made yet (glAsk holds the one ask until ensureGL has run)
    return null;
  }
  // (Registered once: one per ensureGL would add another handler on every restore.)
  // Closed: the full-screen canvases and the vessels' GPU buffers are given back (they are sized again on the way in).
  // The world bitmap, the field's tiles and the uploaded network stay, so the next dive has nothing heavy to build.
  // (A recorded picture lets go of its record too, which goes back to the pools for the next picture, paint-gl.js.)
  const free = (cv) => { if (cv.width || cv.height) { if (cv.gpuPicture === true) releasePicture(cv); cv.width = 0; cv.height = 0; } };
  function release() {
    dropWide();
    resCoverEnd();
    free(tissue); free(tissueG); free(fx); free(glCv); rimDrawn = false; fxGLOff();
    if (tisHostFor) tissueGL?.release?.();   // (hosted: the tissue's own picture in the vessels' context)
    clearTimeout(spareT); spareT = 0; free(spareCv); spare = null;
    gl?.trim?.();   // (the vessels' framebuffer: the shaders and the uploaded network are kept)
    if (shared) { gl?.target; fieldGL?.release?.(); }   // (hosted: the lobule's and the field's textures back to a texel; the shaders stay, ready for the next dive)
    // Out of the lobule for a while: what the visit kept (the world bitmap, the field's tiles) goes too, whatever the budget says; the idle preparation
    // makes it again ahead of the next dive. (Never while it is open or being dived into.)
    drawnV.ok = false; frozenDraw = false;
    clearTimeout(keptT); keptT = setTimeout(() => { keptT = 0; if (fade > 0 || !geo || !keptH) return; const h = keptH; keptRelease(true); h.drop(); }, KEPT_MS);
    tissueKey = ''; idleDrawn = ''; drawKey = ''; glDirty = true;
    staged = ''; relLater = false;
    trimCaches();
    tissueGL?.sweep();   // (the textures of the canvases given back)
    keptHold();
  }
  // What a closed visit keeps for the next dive (the world bitmap, the field's tiles: 100 MB and more in the contexts of the lz canvases) is
  // held in the render graph's budget (gpu-budget.js): while the graph is over its memory envelope it is given back whole, and the next
  // dive builds it again, as its first ever did. Never while the lobule is open.
  let keptH = null, keptT = 0;
  const KEPT_MS = 90000;   // (how long out of the lobule before the bitmaps it kept are given back)
  function keptHold() {   // alloc-rare: once per close of the lobule
    if (keptH?.held) { keptH.touch(); return; }
    keptH = hold({ owner: 'lobule kept', kind: 'retained', bytes: () => ownerBytes('lz-canvas'), release: keptRelease });
  }
  function keptRelease(timed = false) {   // (timed: after a while out of the lobule; the idle preparation does not draw it again until the next visit asks)
    keptH = null;
    if (fade > 0 || !geo) return;
    free(worldCv); free(worldOld); worldKey = ''; if (!timed) prepKey = ''; xfT0 = 0; surNow = null; surOld = null; surT0 = 0;
    for (const tiles of tileSets.values()) for (const q of tiles) { if (q.cv) free(q.cv); q.cv = null; freeCopies(q); }
    tileSets.clear();
    fieldGL?.sweep(); tissueGL?.sweep();
  }
  // What a visit zoomed in left behind, beyond what the next dive needs (#26: 46-77 MB kept in the anatomy): the world bitmap drawn
  // for a close zoom (up to 3600 px square) and the field tiles above the landing's size (the 384 px set is 12 MB a copy, three copies).
  // The landing's own pieces stay, so the next dive is still ready ahead; the idle preparation redraws a trimmed world bitmap at the framing.
  function trimCaches() {
    if (!geo) return;
    const dpr = Math.min(2, devicePixelRatio || 1), k = kFit || V.k;
    const sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * k)) * 2) / 2), worldCap(geo, dpr)), n = Math.ceil(2.6 * geo.R * sc);
    if (worldCv.width > n) { free(worldCv); worldKey = ''; prepKey = ''; }
    free(worldOld); xfT0 = 0; surNow = null; surOld = null; surT0 = 0;
    // The field: the newest state's tiles only, and none above the largest the dive or the framed lobule draws.
    const keys = [...tileSets.keys()], top = Math.max(geo.R * k * Math.min(1, devicePixelRatio || 1) * 0.8, geo.R * k * dpr) * 0.55;
    const drop = (q) => { if (q.cv) free(q.cv); q.cv = null; freeCopies(q); };
    for (const key of keys.slice(0, -1)) { for (const q of tileSets.get(key)) drop(q); tileSets.delete(key); }
    const tiles = tileSets.get(keys[keys.length - 1]);
    // (and the size the GPU field blends in above the landing's: fieldBlend)
    if (tiles) { const keepR = Math.max((tiles.find((q) => q.R >= top) || tiles[tiles.length - 1]).R, FIELD_RS[fieldBlend(geo.R * k * Math.min(1, devicePixelRatio || 1) * 0.8 * 0.55).b]); for (const q of tiles) if (q.R > keepR && q.cv) { drop(q); prepKey = ''; } }
    fieldGL?.sweep();   // (the GPU's copies of the tiles just given back)
  }

  // ── Geometry: one lobule and its network (built once per size) ──
  function build(W, H) {
    const phone = W < 720;
    let R, cx, cy;
    // Built centred; the view (fitV) frames it in the free space.
    if (phone) R = Math.min(W * 0.42, H * 0.3);
    else R = Math.min(W * 0.3, H * 0.34);
    cx = W * 0.5; cy = H * 0.5;
    const r = rng(7);
    const lob = [[cx, cy, 1]];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3, d = Math.sqrt(3) * R; lob.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0]); }   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const lobules = lob.map(([x, y, main]) => ({ x, y, main, corners: Array.from({ length: 6 }, (_, i) => [x + Math.cos((i * Math.PI) / 3) * R, y + Math.sin((i * Math.PI) / 3) * R]) }));   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const C = lobules[0].corners;
    const tubes = [], joins = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const add = (kind, c, o = {}) => { const t = { id: tubes.length, kind, pts: c.pts, len: c.len, ...o }; t.rho = t.pts.map(([x, y]) => Math.hypot(x - cx, y - cy) / R); tubes.push(t); return t; };   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const join = (x, y, members, rSmall) => { const k = clamp(1.2 * rSmall + 1.2, 1.5, 9); joins.push({ x, y, k, reach: 2 * rSmall + k + 10, members: members.map((t) => t.id) }); };   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const rs0 = clamp(R * 0.0085, 1.7, 3);     // sinusoid lumen (healthy), before SIN_NARROW
    const rsN = rs0 * SIN_NARROW;              // as drawn: a quarter narrower than the cords' gap (G21)
    const rcv0 = R * 0.07;
    const polar = (x, y) => [Math.hypot(x - cx, y - cy), Math.atan2(y - cy, x - cx)];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const unwrap = (a, ref) => a + Math.round((ref - a) / TAU) * TAU;   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // A course between two polar points, radial at both ends (so siblings meet smoothly), with a little meander.
    const radial = (p0, p1, amp) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const [r0, a0] = polar(...p0); let [r1, a1] = polar(...p1); a1 = unwrap(a1, a0);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const ph = r() * TAU, fq = 1.2 + r() * 1.2;
      return curve((u) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
        const e = u * u * (3 - 2 * u), rr = lerp(r0, r1, u);
        const a = lerp(a0, a1, e) + (amp * Math.sin(Math.PI * u) * Math.sin(fq * TAU * u + ph)) / Math.max(rr, 1);
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      });
    };
    // Portal triads at the six corners: venule (end-on), arteriole, bile ductule.
    const rt = R * 0.1;
    const triads = C.map(([x, y], i) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      // Arteriole, lymphatic and ductule side by side on an arc outside the venule, in the portal tract between
      // the two inlet venules' courses; each far enough out that none touches the venule or another.
      const a = Math.atan2(y - cy, x - cx), d = R * TRIAD_D;
      const ha = [x + Math.cos(a + TRIAD_A) * d, y + Math.sin(a + TRIAD_A) * d];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const bd = [x + Math.cos(a - TRIAD_A) * d, y + Math.sin(a - TRIAD_A) * d];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      return { i, x, y, a, ha, bd, pv: add('pv', dot(x, y), { tri: i }), haT: add('ha', dot(...ha), { tri: i }), bdT: add('bd', dot(...bd), { tri: i }) };   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    });
    // Inlet venules: from each triad along both of its edges, a little inside the lobule.
    const inletF = (i, dir) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const A = C[i], B = C[(i + dir + 6) % 6], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my);
      const n = [(cx - mx) / nl, (cy - my) / nl], bow = R * 0.03;   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      return (u) => [A[0] + (B[0] - A[0]) * 0.5 * u + n[0] * bow * Math.sin(0.8 * Math.PI * u), A[1] + (B[1] - A[1]) * 0.5 * u + n[1] * bow * Math.sin(0.8 * Math.PI * u)];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    };
    const inlets = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let i = 0; i < 6; i++) for (const dir of [1, -1]) {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const f = inletF(i, dir), t = add('in', curve(f), { tri: i, f });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      inlets[i * 2 + (dir > 0 ? 0 : 1)] = t;
    }
    for (const tr of triads) join(tr.x, tr.y, [tr.pv, inlets[tr.i * 2], inlets[tr.i * 2 + 1]], R * 0.011);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // Inlet venules from neighbouring triads meet halfway along the edge.
    for (let e = 0; e < 6; e++) { const a = inlets[e * 2], b = inlets[((e + 1) % 6) * 2 + 1], q = a.pts[N - 1]; join(q[0], q[1], [a, b], R * 0.009); }   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // Sinusoids, in three generations that merge pairwise toward the central vein.
    const N0 = R > 190 ? 8 : 6;
    const s0 = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let e = 0; e < 6; e++) for (let k = 0; k < N0; k++) {
      const tt = (k + 0.5) / N0 + (r() - 0.5) * (0.3 / N0);
      const inl = tt < 0.5 ? inlets[e * 2] : inlets[((e + 1) % 6) * 2 + 1];
      const u = clamp(tt < 0.5 ? tt / 0.5 : (1 - tt) / 0.5, 0.08, 0.95);
      s0.push({ p: inl.f(u), inl, e, k });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    }
    const rho1 = R * 0.6, rho2 = R * 0.34, rIn = rcv0 * 0.55;
    const node = (pa, pb, rho) => { const [, a] = polar(...pa); let [, b] = polar(...pb); b = unwrap(b, a); const m = (a + b) / 2 + (r() - 0.5) * 0.04; const rr = rho * (1 + (r() - 0.5) * 0.08); return [cx + Math.cos(m) * rr, cy + Math.sin(m) * rr]; };   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const n1 = [], L0 = [], L1 = [], L2 = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let m = 0; m < s0.length / 2; m++) n1.push(node(s0[2 * m].p, s0[2 * m + 1].p, rho1));
    const n2 = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let m = 0; m < Math.floor(n1.length / 2); m++) n2.push(node(n1[2 * m], n1[2 * m + 1], rho2));
    const amp = R * 0.012;
    s0.forEach((st, j) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const t = add('s0', radial(st.p, n1[j >> 1], amp), { lvl: 0, edge: st.e, tri: st.k < N0 / 2 ? st.e : (st.e + 1) % 6, inl: st.inl.id });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      L0.push(t);
      join(st.p[0], st.p[1], [st.inl, t], rsN);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    });
    n1.forEach((p, m) => { const t = add('s1', radial(p, n2[Math.min(n2.length - 1, m >> 1)], amp), { lvl: 1 }); L1.push(t); join(p[0], p[1], [L0[2 * m], L0[2 * m + 1], t], rsN); L0[2 * m].parent = L0[2 * m + 1].parent = t.id; });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // An odd first-generation node (6 per edge) joins its neighbour's second-generation course.
    n2.forEach((p, m) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const [, a] = polar(...p);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const t = add('s2', radial(p, [cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn], amp * 0.6), { lvl: 2 });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      L2.push(t);
      const kids = L1.filter((_, j) => Math.min(n2.length - 1, j >> 1) === m);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      join(p[0], p[1], [...kids.slice(0, 3), t], rsN);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      for (const k of kids) k.parent = t.id;
    });
    // Anastomoses: short cross-links between neighbouring sinusoids that do not merge.
    const link = (a, b, ua, ub, lvl) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const pa = at(a.pts, ua), pb = at(b.pts, ub);
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > R * 0.24) return;
      const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, k = (r() - 0.5) * 0.25;
      const t = add('an', curve((u) => [lerp(pa[0], pb[0], u) + (pb[1] - pa[1]) * k * Math.sin(Math.PI * u), lerp(pa[1], pb[1], u) - (pb[0] - pa[0]) * k * Math.sin(Math.PI * u)]), { lvl, sign: r() < 0.5 ? -1 : 1, mid: [mx, my] });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      join(pa[0], pa[1], [a, t], rsN * 0.7); join(pb[0], pb[1], [b, t], rsN * 0.7);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    };
    for (let m = 0; m < L0.length / 2; m++) link(L0[2 * m + 1], L0[(2 * m + 2) % L0.length], 0.35 + r() * 0.25, 0.35 + r() * 0.25, 0);
    for (let m = 0; m < L1.length; m += 2) if (L1[m + 1] && L1[m + 2]) link(L1[m + 1], L1[(m + 2) % L1.length], 0.4 + r() * 0.2, 0.4 + r() * 0.2, 1);
    // Central vein (end-on), with the third generation entering it.
    const cv = add('cv', dot(cx, cy));
    for (const t of L2) { const [, a] = polar(...t.pts[0]); join(cx + Math.cos(a) * rcv0, cy + Math.sin(a) * rcv0, [t, cv], rsN * 1.3); }   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // Arterioles: from each triad's arteriole into the first stretch of a sinusoid (zone 1).
    for (const tr of triads) {
      const target = L0.find((t) => t.edge === tr.i && t.tri === tr.i) || L0[tr.i * N0];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const q = at(target.pts, 0.2), A = tr.ha;
      const cxp = lerp(A[0], q[0], 0.5) + (cx - tr.x) * 0.06, cyp = lerp(A[1], q[1], 0.5) + (cy - tr.y) * 0.06;
      const t = add('tw', curve((u) => [(1 - u) ** 2 * A[0] + 2 * u * (1 - u) * cxp + u * u * q[0], (1 - u) ** 2 * A[1] + 2 * u * (1 - u) * cyp + u * u * q[1]]), { tri: tr.i });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      join(A[0], A[1], [tr.haT, t], 1.2); join(q[0], q[1], [target, t], 1.6);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    }
    // Portal-central septa (advanced cirrhosis): from three triads into the central vein's
    // collagen cuff, so the bridges meet the venule and cut the lobule into three nodules.
    const septaPC = [0, 2, 4].map((i) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const [x, y] = C[i], ph = r() * TAU, nx = -(cy - y) / R, ny = (cx - x) / R;
      return curve((u) => { const e = R * 0.05 * Math.sin(Math.PI * u) * Math.sin(1.5 * TAU * u + ph); return [lerp(x, cx, u * 0.94) + nx * e, lerp(y, cy, u * 0.94) + ny * e]; });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    });
    // Hepatocytes: plates one cell thick, running from the central vein out to the portal tracts between
    // the sinusoids, with the space of Disse a thin gap on both sides. Ring by ring, each gap between
    // neighbouring sinusoids holds a plate (two side by side where the sinusoids are far apart, near
    // their forks); along a plate the cells stack outward like beads on a cord.
    const cells = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const sinP = [...L0, ...L1, ...L2].map((t) => ({ rs: rsN * (t.kind === 's0' ? 1 : t.kind === 's1' ? 1.15 : 1.3), P: t.pts.map(([x, y]) => polar(x, y)) }));   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const crossAt = (rr) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const out = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      for (const { rs, P } of sinP) for (let i = 0; i < P.length - 1; i++) {
        const [r1, a1] = P[i], [r2, b2] = P[i + 1];
        if ((r1 - rr) * (r2 - rr) > 0 || r1 === r2) continue;
        const a2 = unwrap(b2, a1), a = a1 + (a2 - a1) * ((rr - r1) / (r2 - r1));
        out.push({ a: Math.atan2(Math.sin(a), Math.cos(a)), rs }); break;   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      }
      return out.sort((p, q) => p.a - q.a);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    };
    const cl = R * 0.052, dg = rs0 * 1.7, wT = R * 0.08;
    for (let rr = rcv0 * 1.55; rr < R * 1.02; rr += cl) {
      const X = crossAt(rr);
      if (X.length < 2) continue;
      for (let j = 0; j < X.length; j++) {
        const A = X[j], B = X[(j + 1) % X.length], gA = (j + 1 === X.length ? B.a + TAU : B.a) - A.a;
        const use = rr * gA - A.rs - B.rs - 2 * dg;
        if (use < R * 0.02) continue;
        const n = Math.max(1, Math.round(use / wT)), w = use / n;
        for (let c = 0; c < n; c++) {
          const a = A.a + (A.rs + dg + (c + 0.5) * w) / rr, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          const q = hexFrac(x, y, cx, cy, R);
          if (q > 0.975) continue;
          cells.push({ x, y, a, l: cl * (0.84 + r() * 0.08), w: w * (n > 1 ? 0.86 : 0.94), tone: r(), nu: (r() - 0.5) * 0.3, q, drop: r(), jx: r() - 0.5, jy: r() - 0.5, ja: r() - 0.5 });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
        }
      }
    }
    // Stellate cells in the space of Disse, beside sinusoids.
    const hsc = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let i = 0; i < (R > 190 ? 22 : 14); i++) {
      const t = [...L0, ...L1][Math.floor(r() * (L0.length + L1.length))], u = 0.15 + r() * 0.7, [x, y] = at(t.pts, u), [x2, y2] = at(t.pts, u + 0.02);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, sd = r() < 0.5 ? -1 : 1;
      r();   // (keeps the seeded sequence)
      hsc.push({ x: x - (dy / l) * sd * (rsN + rs0 * 0.9), y: y + (dx / l) * sd * (rsN + rs0 * 0.9), a: Math.atan2(dy, dx), nx: (-dy / l) * sd, ny: (dx / l) * sd });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    }
    // Lymph droplets: start deep in the lobule, drift to the nearest triad.
    // Lymph shimmer: each streak rises deep in the lobule and drifts out through the tissue to the nearest triad.
    const lymph = Array.from({ length: 140 }, () => ({ ph: r(), a: r() * TAU, r0: 0.1 + r() * 0.4, sp: 0.7 + r() * 0.6, w: r() * TAU, len: 0.07 + r() * 0.06 }));   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // Lymphatics (shown with the Lymph toggle): plasma filtered into the space of Disse runs out along
    // each sinusoid (a thin channel beside it, between the sinusoid and its plate), against the blood,
    // to the edge of the lobule; there terminal lymphatics carry it along the limiting plate to the
    // lymphatic vessel in each portal tract.
    // The portal tract's own lymphatic, end-on beside the venule (on its outer side, away from the arteriole and ductule).
    for (const tr of triads) { const d = R * TRIAD_D; tr.lv = add('lv', dot(tr.x + Math.cos(tr.a) * d, tr.y + Math.sin(tr.a) * d), { tri: tr.i, lymph: true }); }   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    const lyOff = rsN + rs0 * 1.1;   // (rs0 × 2.1 before the sinusoids narrowed: the same gap from their wall)
    const beside = (t) => t.pts.map((q, i) => { const a = t.pts[Math.max(0, i - 1)], b = t.pts[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [q[0] - ((b[1] - a[1]) / L) * lyOff, q[1] + ((b[0] - a[0]) / L) * lyOff]; });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // Along each edge, from its midpoint to the triad at either end, in the portal tract just outside
    // the inlet venule: its course offset outward (so the venule stays in view, the lymph beneath it),
    // curving at the end into the tract's lymphatic.
    const lt = [];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let i = 0; i < 6; i++) for (const dir of [1, -1]) {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const A = C[i], B = C[(i + dir + 6) % 6], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my);
      const nx = (mx - cx) / nl, ny = (my - cy) / nl, f = inlets[i * 2 + (dir > 0 ? 0 : 1)].f, lv = triads[i].lv.pts[0];
      const t = add('lt', curve((u) => {   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
        const q = f(1 - u), o = R * lerp(0.04, 0.025, 1 - u), e = smooth(0.78, 1, u), px = q[0] + nx * o, py = q[1] + ny * o;
        return [lerp(px, lv[0], e), lerp(py, lv[1], e)];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      }), { tri: i, lymph: true });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      lt[i * 2 + (dir > 0 ? 0 : 1)] = t;
    }
    for (const tr of triads) { const a = lt[tr.i * 2], b = lt[tr.i * 2 + 1], q = tr.lv.pts[0]; join(q[0], q[1], [a, b, tr.lv], R * 0.008); }   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    for (let e = 0; e < 6; e++) { const a = lt[e * 2], b = lt[((e + 1) % 6) * 2 + 1], q = a.pts[0]; join(q[0], q[1], [a, b], R * 0.006); }   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // The space of Disse beside each sinusoid; the first generation's reaches the limiting plate.
    for (const t of L0) {
      const P = beside(t), side = t.tri === t.edge ? lt[t.edge * 2] : lt[((t.edge + 1) % 6) * 2 + 1];
      let E = side.pts[0], bd = Infinity;
      for (const q of side.pts) { const d = Math.hypot(q[0] - P[0][0], q[1] - P[0][1]); if (d < bd) { bd = d; E = q; } }
      const poly = [E, ...P];   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      const d = add('ly', curve((u) => at(poly, u)), { lymph: true, lvl: 0 });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
      join(E[0], E[1], [side, d], R * 0.004);   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    }
    for (const t of L1) add('ly', curve((u) => at(beside(t), u)), { lymph: true, lvl: 1 });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    // …and on along the innermost sinusoids, thinning out toward the central vein (lymph forms all along
    // the sinusoid, least where the plates converge), so the channel fades in rather than starting abruptly.
    for (const t of L2) add('ly', curve((u) => at(beside(t), u)), { lymph: true, lvl: 2 });   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
    return { W, H, phone, R, cx, cy, rt, rs0, rcv0, lobules, tubes, bloodTubes: tubes.filter((t) => !t.lymph), joins, triads, inlets, L0, L1, L2, cv, septaPC, cells, hsc, lymph };   // alloc-rare: geometry built only on a stage-size change (ensureGeo's geoKey)
  }
  function hexFrac(x, y, cx, cy, R) {
    let m = 0;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; m = Math.max(m, ((x - cx) * Math.cos(a) + (y - cy) * Math.sin(a)) / (R * 0.8660254)); }
    return m;
  }
  const zoneOf = (q) => (q > 0.66 ? 1 : q > 0.36 ? 2 : 3);

  // ── Model → lobule ──
  let easeP = createEaser();
  // A change-since slide's reference (lens 'since', see lobule-model.js sinceOf), eased as the pressures are, so a new slide's
  // reference recolours the vessels over a moment instead of snapping them. Null where no slide counts one.
  let easeS = createEaser(), easeSUsed = false;
  const NO_SINCE = { v: null, moving: false };   // (read, never written)
  const sinceStep = (st) => {
    const t = sinceOf(st);
    if (t) { easeSUsed = true; return easeS.step(t); }
    if (easeSUsed) { easeSUsed = false; easeS = createEaser(); }   // (a reference that was counted is let go once; an easer never stepped needs no new one)
    return NO_SINCE;
  };
  // The four lumen inks, from the page's styles, in one kept object. A value is trimmed again only when the style's text changed.
  const INK_VARS = ['--flow-normal', '--flow-reversed', '--vein-portal', '--vein-systemic'];
  const inksO = { normal: undefined, reversed: undefined, portal: undefined, systemic: undefined };
  const inkRaw = ['', '', '', ''], inkVal = [undefined, undefined, undefined, undefined];
  const inkVar = (hs, i) => {
    const raw = hs.getPropertyValue(INK_VARS[i]);
    if (raw !== inkRaw[i]) { inkRaw[i] = raw; inkVal[i] = raw.trim() || undefined; }   // alloc-rare: only when the style's text changed (a theme)
    return inkVal[i];
  };
  const readInks = (hs) => { inksO.normal = inkVar(hs, 0); inksO.reversed = inkVar(hs, 1); inksO.portal = inkVar(hs, 2); inksO.systemic = inkVar(hs, 3); return inksO; };
  let easeRaf = 0;
  // Out of sight (closed, or drawn ahead for a dive): what the lobule showed on its last visit was never seen since, so nothing
  // eases or crossfades from it. The pressures, the calibers and the tissue take the patient's state at once; otherwise a
  // patient made cirrhotic in the anatomy dove into a healthy lobule (the dive only magnifies its first frame) that snapped
  // to cirrhosis as it landed.
  function snapState() {
    easeP = createEaser(); easeS = createEaser(); rz = null;
    xfT0 = 0; free(worldOld); surOld = null; surT0 = 0; snapNext = true;
    tissueGL?.sweep();   // (and the GPU's copy of the picture given back, now rather than at the next sweep)
  }
  // (snapNext: reopened without a picture drawn ahead, the first frame is already fading in, but shows nothing seen before either.)
  let snapNext = false;
  const unseen = () => fade <= 0 || staging || snapNext;
  function update(f) {
    drawVersion++;
    F = f;
    if (fade <= 0 && !staging) return;
    const st = store.get();
    // Pressures ease toward the model's beat-filtered values (shared with the Pressure card), so the
    // ladder, labels and colors glide rather than jump, every display frame between model frames.
    const eased = easeP.step(f.Pf || f.P), since = sinceStep(st);
    model = lobuleStateInto(modelBuf, f, st, since.v, eased.v);
    noteLens(model.mode);
    cancelFrame(easeRaf);
    if (eased.moving || since.moving) easeRaf = nextFrame(glideP);
    model.inks = readInks(styles());
    if (originOn() && originsF !== f) { origins = originFractions(EDGES, NODES, f.Qf || f.Q, f.Pf || f.P); originsF = f; }
    panel();
    if (!raf) raf = nextFrame(loop);
  }
  const originOn = () => !store.get().imaging && store.get().colorMode === 'origin';
  // Between model frames only the pressures move: re-ease them and redraw the panel, nothing else.
  let glideAt = 0;
  function glideP(now) {
    if (!F || fade <= 0 || !model) return;
    // Paced like the flow (every frame; 15 a second in Battery saver): the model's pressures never quite settle while it
    // runs, so this glide never stops.
    if (now - glideAt < paceMs()) { easeRaf = nextFrame(glideP); return; }
    glideAt = now;
    const st = store.get(), eased = easeP.step(F.Pf || F.P), since = sinceStep(st);
    const inks = model.inks;
    drawVersion++;
    model = lobuleStateInto(modelBuf, F, st, since.v, eased.v);
    noteLens(model.mode);
    model.inks = inks;
    panel();
    if (eased.moving || since.moving) easeRaf = nextFrame(glideP);
  }

  let tissueSaid = '';
  // A number's text as fmt (util.js) prints it, made again only when the number reaches another printed value: its scaled, rounded value
  // (q) is kept with the text in `slot`. A value within 1e-6 of a rounding edge (or not a number) is always made in full, so the text is
  // always what fmt gives. The glide asks every frame; the text changes a few times a second.
  const SCALE = [1, 10, 100];
  const mkSlot = () => ({ q: NaN, d: -1, s: '' });
  const shown = (slot, v, d) => {
    const sc = v * SCALE[d], q = Math.round(sc), sure = Number.isFinite(sc) && Math.abs(sc - Math.floor(sc) - 0.5) > 1e-6;
    if (sure && slot.q === q && slot.d === d && slot.s !== '') return slot.s;
    const t = fmt(v, d);   // alloc-rare: only when the printed number changes, or a value sits on a rounding edge
    slot.q = sure ? q : NaN; slot.d = d; slot.s = t;
    return t;
  };
  // A whole number's text (String(n)), made again only when the number changes.
  const shownInt = (slot, n) => { if (Object.is(slot.q, n) && slot.s !== '') return slot.s; slot.q = n; slot.s = `${n}`; return slot.s; };
  // A change from healthy, '+5' or '−5' (fmt of its size, a sign before it), made again only when its size or sign changes.
  const shownDelta = (slot, d) => {
    const a = Math.abs(d), q = Math.round(a), up = d > 0;
    if (Number.isFinite(a) && slot.s !== '' && slot.q === q && slot.up === up) return slot.s;
    slot.q = Number.isFinite(a) ? q : NaN; slot.up = up; slot.s = `${up ? '+' : '−'}${fmt(a, 0)}`;   // alloc-rare: only when the change's size or sign changes
    return slot.s;
  };
  const stV = { triad: mkSlot(), sin: mkSlot(), cv: mkSlot() }, stD = { triad: mkSlot(), sin: mkSlot(), cv: mkSlot() };
  const stLy = mkSlot(), stFlow = mkSlot(), stO = [mkSlot(), mkSlot(), mkSlot()], stP = [mkSlot(), mkSlot(), mkSlot()];
  const OXY_AT = { triad: 0, sin: 1, cv: 2 };
  // What the station card has to say: the number, its unit, the change and its colour, in one kept record (never an array made for it).
  const reading = { v: '', u: '', d: '', col: null };
  // The panel's words for the tissue canvas, as last said (what they were made from, to know when they have changed).
  const say = { kind: -1, a: '', b: '', c: '', f: '' };
  const SAY_HIDE = 'Liver lobule. Pressures not measured.';
  function station(m, key, v, r) {
    if (m.hide) { reading.v = '?'; reading.u = ''; reading.d = ''; reading.col = null; return; }
    // (Colored by oxygen: the station's oxygen saturation, the value the lens colours it by.)
    if (m.mode === 'oxygen' && m.oxy) { const sat = m.oxy[OXY_AT[key]]; badges[key] = null; reading.v = shown(stV[key], sat * 100, 0); reading.u = '% O₂'; reading.d = ''; reading.col = oxygenColor(sat); return; }
    const d = r != null ? v - r : 0, on = m.cmp ? 1 : 5, off = m.cmp ? 0.7 : 4;
    const showD = Math.abs(d) >= on || (badges[key] === m.cmp && Math.abs(d) >= off);
    badges[key] = showD ? m.cmp : null;
    // (The unit is said once, in the pressure legend, as the anatomy's labels have it; looks review L2, 31 Oct.)
    reading.v = shown(stV[key], v, 1); reading.u = ''; reading.d = showD ? shownDelta(stD[key], d) : '';
    reading.col = m.mode === 'delta' || m.mode === 'since' ? deltaColor(qP(d)) : pc(v);
  }
  function panel() {
    const m = model;
    // On a slide, once settled the sinusoids read the slide's own value, as its tile does (lobule and sinusoid labels agree with it).
    { const st = store.get(), fs = st.presenting && st.presentFp?.sin; if (Number.isFinite(fs) && Math.abs(m.P2 - fs) < 0.6) m.P2 = fs; }
    // (Written only when its words change: the glide reaches here every frame, so the words are made only when a printed number has changed.)
    let said = tissueSaid;
    if (m.hide) { if (say.kind !== 0) { say.kind = 0; said = SAY_HIDE; } }
    else if (m.mode === 'oxygen' && m.oxy) {
      const a = shown(stO[0], m.oxy[0] * 100, 0), b = shown(stO[1], m.oxy[1] * 100, 0), c = shown(stO[2], m.oxy[2] * 100, 0);
      if (say.kind !== 1 || say.a !== a || say.b !== b || say.c !== c) { say.kind = 1; say.a = a; say.b = b; say.c = c; said = `Liver lobule: oxygen saturation in the portal venule ${a}, sinusoids ${b}, central vein ${c} percent.`; }   // alloc-rare: only when a printed number changes
    } else {
      const a = shown(stP[0], m.P1, 1), b = shown(stP[1], m.P2, 1), c = shown(stP[2], m.P3, 1), f = shownInt(stFlow, Math.round(m.flow * 100));
      if (say.kind !== 2 || say.a !== a || say.b !== b || say.c !== c || say.f !== f) { say.kind = 2; say.a = a; say.b = b; say.c = c; say.f = f; said = `Liver lobule: portal venule ${a}, sinusoids ${b}, central vein ${c} millimeters of mercury; sinusoidal flow ${f} percent of normal.`; }
    }
    if (said !== tissueSaid) { tissueSaid = said; restAttr(tissue, 'aria-label', said); }
    // Station cards on the figure.
    // Labels as in the anatomy: the station, its pressure, and the change from healthy once it reaches
    // 5 mmHg; while comparing, every change from the pinned moment (shown at 1, dropped below 0.7).
    // In the Change view the bar takes the change's colour, as the vessels do.
    station(m, 'triad', m.P1, m.R[0]); setLab('triad', 'Portal venule', 'Portal venule', reading.v, reading.u, reading.d, reading.col);
    station(m, 'sin', m.P2, m.R[1]); setLab('sin', 'Sinusoids', 'Sinusoids', reading.v, reading.u, reading.d, reading.col);
    station(m, 'cv', m.P3, m.R[2]); setLab('cv', 'Central vein', 'Central vein', reading.v, reading.u, reading.d, reading.col);
    // Lymph (Lymph layer on): the whole liver's rate and its protein; the change from healthy is on its card.
    if (m.hide) setLab('lymph', 'Lymphatic', 'Lymph', '?', '', '', null);
    else setLab('lymph', 'Lymphatic', 'Lymph', shown(stLy, m.lymph, 1), lymphUnit(Math.round(m.lyProt * 100)), '', null);
    // The arteriole and the ductule: named only while a slide's term points at them (see named()).
    setLab('ha', 'Hepatic arteriole', 'Arteriole', '', '', '', 'var(--artery)');
    setLab('bd', 'Bile ductule', 'Ductule', '', '', '', 'var(--bile-duct)');
    if (sinTo || sinU > 0) sv.setModel(m);
  }
  const lyUnitSlot = mkSlot();
  const lymphUnit = (n) => { if (Object.is(lyUnitSlot.q, n) && lyUnitSlot.s !== '') return lyUnitSlot.s; lyUnitSlot.q = n; lyUnitSlot.s = `mL/min · Protein ${n}%`; return lyUnitSlot.s; };

  // ── Station labels (HTML, styled as the anatomy's) with leaders ──
  const labs = {}, badges = {};
  // What a label's size depends on beyond its own text and classes (see layoutLabels).
  let fontVer = 0;
  document.fonts?.addEventListener?.('loadingdone', () => { fontVer++; });
  // (The text is made again only when something it is made of has changed, found by comparing the parts one by one with those it was
  // last made from: the layout asks for it for every label and name, and nothing is built to find that it is the same.)
  const envMemo = { s: '', w: -1, h: -1, dpr: -1, fv: -1, fs: null, body: null, host: null, el: null, attrs: [] };
  const sizeEnv = () => {
    const at = document.documentElement.attributes, n = at.length, ea = envMemo.attrs, st = document.fonts?.status;
    let same = envMemo.s !== '' && envMemo.w === innerWidth && envMemo.h === innerHeight && envMemo.dpr === devicePixelRatio && envMemo.fv === fontVer && envMemo.fs === st
      && envMemo.body === document.body.className && envMemo.host === host.className && envMemo.el === el.className && ea.length === n * 2;
    if (same) for (let i = 0; i < n; i++) { const a = at[i]; if (ea[2 * i] !== a.name || ea[2 * i + 1] !== a.value) { same = false; break; } }
    if (same) return envMemo.s;
    envMemo.w = innerWidth; envMemo.h = innerHeight; envMemo.dpr = devicePixelRatio; envMemo.fv = fontVer; envMemo.fs = st;
    envMemo.body = document.body.className; envMemo.host = host.className; envMemo.el = el.className;
    ea.length = 0;
    for (let i = 0; i < n; i++) ea.push(at[i].name, at[i].value);
    envMemo.s = `${envMemo.w}x${envMemo.h}|${envMemo.dpr}|${fontVer}|${st}|${[...at].map((a) => `${a.name}=${a.value}`).join(' ')}|${envMemo.body}|${envMemo.host}|${envMemo.el}`;   // alloc-rare: only when the window, the fonts, the page's attributes or classes changed
    return envMemo.s;
  };
  // ── Sizes, measured outside the frame ──
  // The labels', the call pill's and the zone names' sizes are read in a timer task of their own (measureRun), asked for by the frame
  // that found them unmeasured for what decides them (the look: sizeEnv; the element's classes; its words, with digits as zeros since
  // they are tabular; the pill's width limit), and kept. That frame leaves the labels as they are seen; the next one lays them out.
  const measQ = new Set();
  let measT = 0, labWant = null;
  // (A label's key is made again only when the look (env), its classes or its content (L.ver, counted as pageRun writes it) changed.)
  const labKey = (e, L) => {
    const cls = L.el.className;
    if (L.kEnv === e && L.kCls === cls && L.kVer === L.ver && L.kKey !== undefined) return L.kKey;
    L.kEnv = e; L.kCls = cls; L.kVer = L.ver;
    L.kKey = `${e}|${cls.replace(/(^| )(stack|lz-off)(?= |$)/g, '')}|${L.el.innerHTML.replace(/\d/g, '0')}`;
    return L.kKey;
  };
  // (Whether a label shows is held on the label (_hid) the moment it changes, and written as the `hidden` attribute between frames
  // (restAttr): a frame writes no attribute. measureRun flushes the writes first and then measures the page as it stands.)
  const isHid = (el) => el._hid ?? el.hidden;
  const setHid = (el, b) => { el._hid = b; restAttr(el, 'hidden', b ? '' : null); };
  // What decides a call pill's or a zone name's size, kept with the size it was measured at: the look (env), whether it shows, its
  // classes (less lz-off), its words (numerals as zeros: they are tabular) and its width limit. Compared part by part (sizeCurrent).
  // A zone name's words never change; a pill's are its one text node.
  const clsOf = (c) => c.replace(/(^| )lz-off(?= |$)/g, '');   // alloc-rare: only when an element is measured (a rest pass) or its classes changed (sizeCurrent)
  const zeroNums = (t) => t.replace(/\d/g, '0');   // alloc-rare: only when an element is measured (a rest pass) or a pill's words changed (sizeCurrent)
  const textOf = (e) => { const c = e.firstChild; return c && c.nodeType === 3 && !c.nextSibling ? c.data : ''; };
  const sizeRecord = (e, en, w, h) => { const cls = e.className, tx = textOf(e); return { env: en, hid: isHid(e), cls, clsN: clsOf(cls), mw: e.style.maxWidth, tx, txN: zeroNums(tx), w, h, txt: e.textContent }; };
  function sizeCurrent(e, z, en) {
    if (!z || z.env !== en || z.hid !== isHid(e) || z.mw !== e.style.maxWidth) return false;
    const cls = e.className;
    if (cls !== z.cls) { if (clsOf(cls) !== z.clsN) return false; z.cls = cls; }   // alloc-rare: only when the element's classes changed (a fade)
    const tx = textOf(e);
    if (tx !== z.tx) { const n = zeroNums(tx); if (n !== z.txN) return false; z.tx = tx; }   // alloc-rare: only when a pill's words changed
    return true;
  }
  // A call pill's or a zone name's size as measured ([fw, fh] where it is unmeasured or takes no room), asking for it to be measured
  // when what decides it changed; the layout is done again once it has been (measureRun).
  let callFit = '', callFitT = 0;
  function writeCallFit() { callFitT = 0; if (callEl.style.maxWidth === callFit) return; callEl.style.maxWidth = callFit; measQ.add(callEl); if (!measT) measT = restPass(measureRun); }
  let szW = 0, szH = 0;   // (sizeOf's answer: the width and the height, read straight after the call)
  function sizeOf(e, fw, fh) {
    const z = e._lzSz;
    if (!sizeCurrent(e, z, sizeEnv())) { measQ.add(e); if (!measT) measT = restPass(measureRun); }
    szW = z?.w || fw; szH = z?.h || fh;
  }
  function measureRun() {
    measT = 0;
    const env = sizeEnv(), els = [...measQ], want = labWant;
    measQ.clear(); labWant = null;
    flushRestAttrs();   // (a pill's kind changes its border and so its size: written before it is measured)
    let moved = false;
    for (const e of els) { const w = e.offsetWidth, h = e.offsetHeight; if (w !== e._lzSz?.w || h !== e._lzSz?.h) moved = true; e._lzSz = sizeRecord(e, env, w, h); }
    if (want) {
      // (As the layout did in the frame before: unstacked to read the width, stacked where that is too wide, then read; written,
      // then read together. Put back as found, for the next frame to lay out.)
      const shown = want.ks.map((k) => labs[k]).filter(Boolean);
      const peek = shown.map((L) => L.el.hidden), had = shown.map((L) => classHas(L.el, 'stack'));
      shown.forEach((L) => { L.el.hidden = false; L.el.classList.remove('stack'); });
      const w0 = shown.map((L) => L.el.offsetWidth), u2 = shown.map((L) => !!L.el.querySelector('.u2'));
      const stack = shown.map((x, i) => w0[i] > want.fw && u2[i]);
      shown.forEach((L, i) => { if (stack[i]) L.el.classList.add('stack'); });
      const sizes = shown.map((L) => [L.el.offsetWidth || 100, L.el.offsetHeight || 40]), px = (v) => parseFloat(v) || 0;
      for (const L of shown) {
        // (The padding round the letters, read with the sizes: a leader stops on the letters' box, not at the label's middle; and the
        // pill's insets, app.css ::before, for a lit label's leader to stop on its outline.)
        const cs = getComputedStyle(L.el), p = getComputedStyle(L.el, '::before');
        L.pad = ['Left', 'Right', 'Top', 'Bottom'].map((d) => px(cs[`padding${d}`]));
        L.pillQ = [px(p.left), px(p.top), px(p.right), px(p.bottom), px(p.borderTopLeftRadius)];
        L.rows = inkRows(L.el, L.rows);   // (each line's own box: a leader stops on the line it runs to, not on the corner a longer line makes)
      }
      shown.forEach((L, i) => {
        const was = L.sz, k = stack[i] ? 's1' : 's0', key = labKey(env, L);
        if (!was || was.w0 !== w0[i] || was.u2 !== u2[i] || `${was[k]}` !== `${sizes[i]}` || `${was.pad}` !== `${L.pad}`) moved = true;
        const sz = was?.key === key ? was : (L.sz = { key, w0: w0[i], u2: u2[i] });
        sz.w0 = w0[i]; sz.u2 = u2[i]; sz[k] = sizes[i]; sz.pad = L.pad;
      });
      shown.forEach((L, i) => { L.el.hidden = peek[i]; L.el.classList.toggle('stack', had[i]); });
    }
    if (moved && fade > 0) relayout();
    mirrorAll();
  }
  // A new text size (pps:labelscale, an event, not a frame): the labels on show, the call pill and the zone names are measured at once,
  // so their leaders and the next layout use the new sizes from the first frame.
  function measureShown() {
    if (!geo || fade <= 0) return;
    const f = freeRect();
    labWant = { ks: Object.keys(labs).filter((k) => !isHid(labs[k].el)), fw: (f.r - f.l) * 0.32 };
    for (const e of [callEl, ...zoneEls]) if (e.isConnected) measQ.add(e);
    cancelRest(measT); measureRun();
  }
  // A label's size as measured, for the stacking it has now.
  const LAB_WH = [100, 40];   // (read, never written: a label's size before it is measured)
  const labWH = (L) => (L.sz && (classHas(L.el, 'stack') ? L.sz.s1 : L.sz.s0)) || LAB_WH;
  // ── Where a label is seen, mid-glide ──
  // A label moved while the labels glide (app.css .lz-ease: left and top on --d-surface with --ease) goes there on that curve from
  // where it was seen; its glide is noted as it is written (noteAt), and each frame's place worked out from it (seenAt), on the page's
  // animation clock, so the leaders follow it with no read of the page.
  const EASE_LAB = cubicBezier(0.2, 0.8, 0.2, 1);
  const tlNow = () => document.timeline?.currentTime ?? performance.now();
  const ZERO2 = [0, 0];   // (read, never written)
  const easeLab = (g, now) => EASE_LAB(clamp((now - g.t0) / D_SURFACE, 0, 1));
  const labGliding = (L, now) => !!L.gl && (L.gl.x0 !== L.gl.x1 || L.gl.y0 !== L.gl.y1) && now - L.gl.t0 < D_SURFACE;
  // A label's glide is one object on it, written again in place (a glide begun on another carries from where this one stands now).
  const glOf = (L) => L.gl || (L.gl = { x0: 0, y0: 0, x1: 0, y1: 0, t0: 0 });
  function noteAt(L) {
    const sp = spot.get(L.el) || ZERO2, x = sp[0], y = sp[1], g = L.gl;
    if (g && g.x1 === x && g.y1 === y) return;
    const now = tlNow();
    let px = x, py = y;
    if (g) { const e = easeLab(g, now); px = g.x0 + (g.x1 - g.x0) * e; py = g.y0 + (g.y1 - g.y0) * e; }
    // (Only a label already shown glides: one coming out of hidden starts where it is written, as the page shows it.)
    const eased = false;   // (a label laid out to another slot is there in this frame, not glided to over a short time: V-LBL-1, V-LBL-3)
    const o = glOf(L);
    if (eased) { o.x0 = px; o.y0 = py; } else { o.x0 = x; o.y0 = y; }
    o.x1 = x; o.y1 = y; o.t0 = now;
  }
  // Where a label is seen now, in the label's own [x, y] (read straight away, never kept).
  function seenAt(L, now) {
    const sp = spot.get(L.el) || ZERO2, x = sp[0], y = sp[1];
    let g = L.gl;
    if (!g || g.x1 !== x || g.y1 !== y) { g = glOf(L); g.x0 = x; g.y0 = y; g.x1 = x; g.y1 = y; g.t0 = now; }   // (written with no glide noted: there)
    const e = easeLab(g, now), o = L.seenXY || (L.seenXY = [0, 0]);   // alloc-rare: only the first time a label's place is worked out
    o[0] = g.x0 + (g.x1 - g.x0) * e; o[1] = g.y0 + (g.y1 - g.y0) * e;
    return o;
  }
  // A unit with a second reading ('mL/min · Protein 48%'): the second part can drop to its own line when the label is wide.
  const unitParts = (u) => {
    if (!u) return [];
    const [a, ...rest] = u.split(' · ');
    return rest.length ? [h('small', {}, a), h('small', { class: 'u2' }, h('span', { class: 'dot' }, '· '), rest.join(' · '))] : [h('small', {}, u)];
  };
  // What a presenter slide's terms call each label (presentLit, see presenter.js TARGETS).
  const LZ_TARGET = { ha: 'arteriole', bd: 'ductule', triad: 'triad', sin: 'sinusoid', cv: 'central', lymph: 'lymph' };
  // Page writes asked for inside a frame (a label's words, a node put into the page) land between frames (rest-pass.js), in the order
  // asked, so a frame does no DOM work (2 Nov 2026, "Move everything to GPU"; scripts/off-gpu-scan.mjs domWrite). A label whose
  // words take more or fewer characters is laid out again once they are in.
  const mountQ = [], labQ = new Set();
  let pageT = 0;
  const pageSoon = () => { if (!pageT) pageT = restPass(pageRun); };
  const mount = (parent, ...els) => { mountQ.push([parent, els]); pageSoon(); };   // alloc-rare: only when a node is first put into the page (callers skip one already there)
  const writeLab = (L) => { labQ.add(L); pageSoon(); };
  const swQ = new Set();   // (the labels whose swatch colour changed: it is only a variable on the label, so it rebuilds nothing)
  function pageRun() {
    pageT = 0;
    for (const [parent, els] of mountQ.splice(0)) parent.append(...els.filter((e) => !e.isConnected));
    for (const L of labQ) {
      if (L.spec) labBuild(L);
      else {
        if (L.b && L.b.textContent !== L.bv) L.b.textContent = L.bv;
        if (L.dEl && L.dEl.textContent !== L.dv) L.dEl.textContent = L.dv;
        if (L.xEl && L.xEl.textContent !== L.xv) L.xEl.textContent = L.xv;
        if (L.uw != null) { const [a, ...rest] = L.uw.split(' · '); if (rest.length) { L.uEls[0].textContent = a; L.uEls[1].lastChild.textContent = rest.join(' · '); } else if (L.uw) L.uEls[0].textContent = L.uw; L.uw = null; }
      }
      L.ver = (L.ver | 0) + 1;   // (its content may have changed: labKey makes its key again)
      if (L.aria) { L.aria = false; L.el.setAttribute('aria-label', ariaOf(L)); }
      if (L.relay) { L.relay = false; layoutKey = ''; }
      mirrorSoon(L.el);
    }
    labQ.clear();
    for (const L of swQ) if (L.swHas !== L.swWant) { L.swHas = L.swWant; L.el.style.setProperty('--sw', L.swWant); }
    swQ.clear();
  }
  // A label's parts, built between frames (pageRun) from what the frame asked for (L.spec): a frame builds no elements (2 Nov 2026).
  function labBuild(L) {
    const { name, short, u, hasD, hasX } = L.spec, uw = L.uw ?? u;
    L.spec = null; L.uw = null;
    L.b = L.empty ? null : h('b', {}, L.bv);
    L.dEl = hasD ? h('span', { class: 'd' }, L.dv) : null;
    L.xEl = hasX ? h('span', { class: 'x' }, L.xv) : null;
    L.uEls = unitParts(uw);
    L.el.replaceChildren(...[h('span', { class: 'n' }, h('span', { class: 'n-long' }, name), h('span', { class: 'n-short' }, short)),
      L.empty ? null : h('span', { class: 'v' }, L.b, ...L.uEls, L.dEl), L.xEl].filter(Boolean));
  }
  // Every label and its leader are made with the view, hidden, in the order the panel names them (so their tab order is the panel's):
  // a frame that first names one finds it made.
  function labMake(key) {
    const L = labs[key] = { el: h('button', { class: 'lz-lab', type: 'button', 'data-target': `lobule:${LZ_TARGET[key] || key}` }), line: svgModel('line', { class: 'leader', 'data-look': 'small.lead.line', 'data-target': `lobule:${LZ_TARGET[key] || key}` }), dotEl: svgModel('circle', { class: 'leader-dot', 'data-look': 'small.lead.dot', r: 3, 'data-target': `lobule:${LZ_TARGET[key] || key}` }) };
    L.el.addEventListener('click', (ev) => { if (!geo || ev.detail !== 0) return; const q = anchorOf(key); if (classHas(L.el, 'edge')) centreOn(q); else select(hitKind(key), [q[0], q[1]]); });
    // (Hidden until it is first placed, where it fades in: a label its slide does not name never shows at all.)
    L.el.hidden = true;
    labels.append(L.el); leaders.append(L.line, L.dotEl);
  }
  for (const k of ['triad', 'sin', 'cv', 'lymph', 'ha', 'bd']) labMake(k);
  // Tap a label to explain it (N4, label-explain.js): the tapped station's label takes one more line (what it is, and its reading), its lit term is the only
  // one lit while it is explained (the page's own lit terms, .app[data-lit], as a slide's words set them), and a second tap, the next slide or the talk's end puts it back.
  let exKey = null, exSaved = null, exSet = null;
  const EX_NOTE = { triad: 'where portal blood enters', sin: 'where blood meets the liver cells', cv: 'collects the sinusoids, drains to the hepatic vein',
    lymph: 'carries filtered fluid and protein away', ha: 'arterial blood, with oxygen', bd: 'carries bile out' };
  function explainTip(key, name, v, u) {
    const n = Number.parseFloat(v), note = EX_NOTE[key];
    return explainText({ name: '', value: Number.isFinite(n) && !/[^\d.\-+−]/.test(v) ? n : NaN, unit: u || 'mmHg', note });
  }
  function explainSet(key, target = null) {
    const app = appEl?.isConnected ? appEl : (appEl = document.querySelector('.app'));
    if (key === exKey) return;
    if (app) {
      if (key) { if (exKey == null) exSaved = app.dataset.lit ?? null; exSet = target; app.dataset.lit = exSet; }
      else { if (app.dataset.lit === exSet) { if (exSaved) app.dataset.lit = exSaved; else delete app.dataset.lit; } exSet = exSaved = null; }
    }
    exKey = key; sv.setExplain?.(key); layoutKey = '';
    if (model) panel();
    pageSoon();
  }
  function setLab(key, name, short, v, u, d, col) {
    const L = labs[key];
    // (What it last showed, compared part by part: no text is made to find that nothing changed.)
    const x = exKey === key ? explainTip(key, name, v, u) : '';   // (the tapped label's own line, label-explain.js)
    const textSame = L.sN === name && L.sV === v && L.sU === u && L.sD === d && (L.sX ?? '') === x;
    if (textSame && L.sC === col) return;
    L.sN = name; L.sV = v; L.sU = u; L.sD = d; L.sC = col; L.sX = x;
    // Only the number (or its change) moved: its text is updated in place, and the labels are laid out again
    // only when it takes more or fewer characters (the label is rebuilt only when its make-up changes). The same holds for
    // a figure inside the unit ('Protein 48%', which moves with the pulse): its numerals are tabular, so a new figure with
    // as many numerals leaves the label's size as it was.
    // (Its colour is only a style on the label: a new one, which the pressure glide brings every frame, rebuilds nothing.)
    if (col !== L.col) { L.col = col; L.swWant = col || 'var(--border-strong)'; swQ.add(L); pageSoon(); }   // (the page's variable is set between frames, pageRun)
    if (L.ukSrc !== u) { L.ukSrc = u; L.uk = u.replace(/\d/g, '0'); }
    const uk = L.uk, hasD = !!d, empty = v === '';
    const hasX = !!x, same = L.fN === name && L.fS === short && L.fU === uk && L.fE === empty && L.fD === hasD && !!L.fX === hasX;   // (the label's make-up, part by part)
    if (same && !L.empty) {
      if (v.length !== L.bv.length || (d && d.length !== L.dv.length)) { layoutKey = ''; L.relay = true; }
      // (Each part is written only when its own text changed: a new colour alone, or a new unit figure, leaves the number be.
      // Written between frames, pageRun.)
      if (L.bv !== v) { L.bv = v; writeLab(L); }
      if (d && L.dv !== d) { L.dv = d; writeLab(L); }
      if (hasX && L.xv !== x) { L.xv = x; writeLab(L); }
      if (u !== L.u) { L.uw = u; writeLab(L); }
    } else {
      L.fN = name; L.fS = short; L.fU = uk; L.fE = empty; L.fD = hasD; L.fX = hasX; L.xv = x;
      L.lk = `${name}|${short}|${uk}|${empty}|${hasD}|${hasX}`;   // alloc-rare: only when the label's make-up changes (what the layout depends on; a value of new length clears layoutKey above)
      L.spec = { name, short, u, hasD, hasX };   // alloc-rare: only when the label's make-up changes
      L.empty = empty;
      L.bv = v; L.dv = d || ''; L.uw = null;
      writeLab(L);
      layoutKey = ''; L.relay = true;
    }
    L.u = u;
    // (Its spoken words are made between frames, pageRun, from what it shows then and the model's mode now.)
    if (!textSame) { L.aCmp = !!model?.cmp; L.aSince = !!model?.since; L.aria = true; writeLab(L); }
  }
  const ariaOf = (L) => `${L.sN} ${L.sV} ${L.sU}${L.sD ? `, ${L.sD.startsWith('+') ? 'up' : 'down'} ${L.sD.slice(1)} ${L.aCmp ? 'since then' : L.aSince ? 'since the slide before' : 'from healthy'}` : ''}. Show details`;
  // Which portal venule and which sinusoid carry the label: at first the left portal venule and the
  // sinusoid just below the middle of the left side; as the view is zoomed or panned, the label stays
  // on its vessel while that is comfortably in view, and otherwise moves to the one in view nearest
  // the middle of the free space (so it does not jump about).
  // A presenter slide that lights lobule terms dims every other label and zone name to 35 % (app.css, dimmed): they keep their places and their room.
  const LIT_OK = ['triad', 'arteriole', 'ductule', 'sinusoid', 'central', 'lymph', 'zone1', 'zone3'].map((t) => `lobule:${t}`);
  const LIT_RE = /(^| )(lobule|sinusoid):/;
  // (The lit terms split once each time they change, not a query and a split for every candidate spot of a layout.)
  let appEl = null, litRaw = null, litSet = new Set();
  const litOf = () => {
    if (!appEl?.isConnected) appEl = document.querySelector('.app');
    const r = appEl?.dataset.lit;
    if (r !== litRaw) { litRaw = r; litSet = new Set(r ? r.split(' ') : []); }   // alloc-rare: only when the lit terms change (a slide)
    return litSet;
  };
  // (Each label's lit term, and each zone name's, written out once: no text is made to ask for them.)
  const LIT_OF = {};
  for (const k of Object.keys(LZ_TARGET)) LIT_OF[k] = `lobule:${LZ_TARGET[k]}`;
  const ZONE_LIT = ['lobule:zone1', 'lobule:zone2', 'lobule:zone3'];
  const named = (k) => litOf().has(LIT_OF[k]);
  const pick = { triad: 3, lt: null, sin: null, geo: null };
  // A sinusoid's reading sits half way from the portal tract to the central vein: along the middle generation's
  // course, or at the inner end of an outer one and the outer end of an inner one when only those are in view.
  // (A tube's spot never changes while the geometry stands, so it is worked out once and kept on the tube; read, never written.)
  const sinAt = (t) => t.sinAt || (t.sinAt = atInto(t.pts, t.lvl === 0 ? 0.95 : t.lvl === 2 ? 0.2 : 0.45, [0, 0]));   // alloc-rare: only the first time a tube's spot is asked for (kept on the tube)
  const anchorOf = (key) => {
    const g = geo, C = g.lobules[0].corners;
    if (key === 'triad') return C[pick.triad];
    if (key === 'cv') return g.cvAt || (g.cvAt = [g.cx, g.cy]);   // alloc-rare: only the first time for this geometry (kept on it; read, never written)
    if (key === 'lymph') return g.triads[pick.lt ?? pick.triad].lv.pts[0];
    if (key === 'ha' || key === 'bd') return g.triads[pick.triad][key];
    return sinAt(sinTube());
  };
  // How far out a point is, from the central vein (0) to the lobule's rim (1) along its ray.
  const rimFrac = ([x, y]) => {
    const g = geo, C = g.lobules[0].corners, dx = x - g.cx, dy = y - g.cy, d = Math.hypot(dx, dy) || 1e-9;
    let rim = Infinity;
    for (let i = 0; i < 6; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % 6], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const s = ((ax - g.cx) * ey - (ay - g.cy) * ex) / den, u = ((ax - g.cx) * dy - (ay - g.cy) * dx) / den;
      if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6) rim = Math.min(rim, s * d);
    }
    return d / rim;
  };
  const sinTube = () => {
    const g = geo;
    if (pick.geo !== g) {   // a new lobule (or size): back to the left side
      const ang = (t) => { const p = sinAt(t); return Math.abs(Math.atan2(p[1] - g.cy, p[0] - g.cx) - 2.75); };   // alloc-rare: only for a new lobule or size (pick.geo)
      pick.geo = g; pick.triad = 3; pick.sin = g.L1.reduce((b, t) => (ang(t) < ang(b) ? t : b), g.L1[0]).id;   // alloc-rare: only for a new lobule or size (pick.geo)
    }
    return g.tubes[pick.sin] || g.L1[0];
  };
  // Where the labels' vessels are picked: the free space and its middle (set by pickAnchors), and the best spot found so far.
  let paL = 0, paR = 0, paT = 0, paB = 0, paMx = 0, paMy = 0, bestC = null, bestS = Infinity;
  const paInside = (x, y, m) => { const sx = sX(x), sy = sY(y); return sx > paL + m && sx < paR - m && sy > paT + m && sy < paB - m; };
  const paSide = (x) => { const sx = sX(x); return Math.min(sx - paL, paR - sx) < 60; };
  // Scans candidates (the six corners, or a list of tubes by their spot), keeping the best in bestC: kept clear of up to two other
  // labelled spots (a, b), so the labels do not crowd each other. `list` null: the corners 0 to 5 of C.
  function bestScan(list, C, m, na, ax, ay, bx, by) {
    const n = list ? list.length : 6;
    for (let i = 0; i < n; i++) {
      const c = list ? list[i] : i, p = list ? sinAt(c) : C[c], px = p[0], py = p[1];
      if (!paInside(px, py, m)) continue;
      const x0 = sX(px), y0 = sY(py);
      let pen = 0;
      if (na > 0) pen = pen + Math.max(0, 110 - Math.hypot(sX(ax) - x0, sY(ay) - y0)) * 3;
      if (na > 1) pen = pen + Math.max(0, 110 - Math.hypot(sX(bx) - x0, sY(by) - y0)) * 3;
      const sc = Math.hypot(x0 - paMx, y0 - paMy) + pen;
      if (sc < bestS) { bestS = sc; bestC = c; }
    }
  }
  function pickAnchors(fr) {
    const g = geo, C = g.lobules[0].corners;
    sinTube();
    paL = fr.l; paR = fr.r; paT = fr.t; paB = fr.b; paMx = (fr.l + fr.r) / 2; paMy = (fr.t + fr.b) / 2;
    // Framed to fit, the default pick stays wherever its vessel is in view (a lobule that fills a phone's width has its corners at the edge).
    const keep = atFit ? 4 : 36;
    // (A triad hard against the screen's side leaves its label no room beside it, only a long leader: another in view takes it.)
    let need = !paInside(C[pick.triad][0], C[pick.triad][1], keep);
    if (!need && paSide(C[pick.triad][0])) for (let i = 0; i < 6; i++) if (paInside(C[i][0], C[i][1], 72) && !paSide(C[i][0])) { need = true; break; }
    if (need) { bestC = null; bestS = Infinity; bestScan(null, C, 72, 1, g.cx, g.cy, 0, 0); if (bestC != null) pick.triad = bestC; }
    // The sinusoid's reading points at the middle of a sinusoid: a middle-generation one (half way from the portal tract
    // to the central vein), the outer or inner generation only when none of those is in view.
    let sinNeed = !paInside(sinAt(sinTube())[0], sinAt(sinTube())[1], keep);
    if (!sinNeed && sinTube().lvl !== 1) { bestC = null; bestS = Infinity; bestScan(g.L1, C, 44, 0, 0, 0, 0, 0); sinNeed = !!bestC; }
    if (sinNeed) {
      const tx = C[pick.triad][0], ty = C[pick.triad][1];
      bestC = null; bestS = Infinity; bestScan(g.L1, C, 72, 2, g.cx, g.cy, tx, ty);
      if (!bestC) { bestS = Infinity; bestScan(g.L1, C, 44, 2, g.cx, g.cy, tx, ty); }
      if (!bestC) { bestS = Infinity; bestScan(g.L0, C, 72, 2, g.cx, g.cy, tx, ty); bestScan(g.L2, C, 72, 2, g.cx, g.cy, tx, ty); }
      if (bestC) pick.sin = bestC.id;
    }
  }
  const hitKind = (key) => (key === 'ha' || key === 'bd' ? { part: key, tri: pick.triad } : key === 'triad' ? { part: 'triad', tri: pick.triad } : key === 'cv' ? { part: 'cv' } : key === 'lymph' ? { part: 'lv', tri: pick.lt ?? pick.triad } : { part: 'sin', tube: sinTube().id });
  // A label whose part is the store's selection reads as Anatomy's selected name does (app.css .lz-lab.sel): the class is set between frames, and the GPU mirror reads it again.
  const labSel = () => {
    const sl = store.get().selection, on = sl?.type === 'lobule' && !!geo;
    for (const k in labs) {
      const L = labs[k]; if (!L.el) continue;
      let want = false;
      if (on) { try { const hv = hitKind(k); want = hv.part === sl.part && (hv.part === 'cv' || hv.part === 'sin' || hv.tri === sl.tri); } catch (e) { caught('lobule-zoom:labSel', e); } }
      if (classHas(L.el, 'sel') !== want) { classSoon(L.el, 'sel', want); mirrorSoon(L.el); }
    }
  };
  // The action card a selection opens (or closes) is read again, once it has come in or gone, so a name never stays under it (V-LBL-4).
  let selOccT = 0;
  const selOcc = () => { selOccT = 0; if (!occT) occT = restPass(onOcc); };
  store.on('selection', () => { labSel(); if (!occT) occT = restPass(onOcc); clearTimeout(selOccT); selOccT = setTimeout(selOcc, 450); });
  // The lesion pointer: a pill near the spot, clear of the labels and cards, with a leader to a ring on it. Eases in and out.
  let cpOn = false, cpAt = null, cpDx = 0, cpDy = 0, callCost = 0;   // (where the pill sat last time, relative to its spot, and what it cost)
  // What no label may cover, a disc on screen each: the central vein (1.25 of its radius: the vein and the mouths of its sinusoids) and
  // every portal tract (1.3 of its radius: the venule and the arc of arteriole, ductule and lymphatic beside it). They were 1.7 and
  // 2.4, which held every label 80 px off a tract on a Mac and forced the long leaders (Mohammad, 2 Nov 2026: "shorter callout lines").
  const CV_KEEP = 1.25, TRACT_KEEP = 1.3;
  const cvKeep = (g) => Math.max(14, g.rcv0 * CV_KEEP * V.k);
  // The discs no label may cover, on screen: kept as seven objects and written again in place (read where asked for, within one layout).
  const keepBuf = [{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }];
  const keepDiscs = (g) => {
    const C = g.lobules[0].corners;
    let d = keepBuf[0];
    d.x = sX(g.cx); d.y = sY(g.cy); d.r = Math.max(14, g.rcv0 * CV_KEEP * V.k);
    for (let i = 0; i < 6; i++) { d = keepBuf[i + 1]; d.x = sX(C[i][0]); d.y = sY(C[i][1]); d.r = Math.max(14, (g.rt || 6) * TRACT_KEEP * V.k); }
    return keepBuf;
  };
  const DESIGN = ['triad', 'lymph', 'cv', 'sin'];   // the labels with a designed spot (layoutLabels designed)
  const CORE = ['cv', 'sin', 'triad'];   // the vessel labels: never left out for the slide's pill
  // The ring on the spot: its centre and radius on screen (null while the spot is out of view), and how far from the ring's
  // centre everything else keeps (the radius, half its 4 px stroke and a small gap), so no label or pill ever touches it.
  const RING_STROKE = 4, RING_GAP = 8;
  // The lobule's outline on screen. Callout pills prefer to sit outside it, a leader reaching in to the structure: `share` is
  // how much of a box lies inside the outline (0 to 1), and `outside` lists spots just beyond the rim, on rays from a point
  // through the lobule, for a box of the given size. A frame too small to hold them clamps them back inside, where the
  // share costs the same for every spot, so the label falls back to the inside only when there is no room outside.
  // (The hexagon's six corners on screen, kept; share's answers kept by the box's whole numbers in a small table, cleared by hexOf; and
  // outside's spots written into hexOut, its count returned.)
  const hexX = new Float64Array(6), hexY = new Float64Array(6), hexOut = new Float64Array(48);
  const SH_CAP = 1024, SH_MASK = SH_CAP - 1, shKey = new Int32Array(SH_CAP * 4), shVal = new Float64Array(SH_CAP), shGen = new Uint32Array(SH_CAP);
  let shNow = 1, shN = 0;
  const hexIn = (x, y) => { let c = false; for (let i = 0, j = 5; i < 6; j = i++) { const xi = hexX[i], yi = hexY[i], xj = hexX[j], yj = hexY[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const hexShareOf = (b) => { let n = 0; for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) if (hexIn(b.l + ((b.r - b.l) * (i + 0.5)) / 5, b.t + ((b.b - b.t) * (k + 0.5)) / 3)) n++; return n / 15; };
  const hexShare = (b) => {
    const l = b.l | 0, t = b.t | 0, r = b.r | 0, bb = b.b | 0;
    let i = (Math.imul(l, 73856093) ^ Math.imul(t, 19349663) ^ Math.imul(r, 83492791) ^ Math.imul(bb, 1013904223)) & SH_MASK;
    while (shGen[i] === shNow) {
      const k = i * 4;
      if (shKey[k] === l && shKey[k + 1] === t && shKey[k + 2] === r && shKey[k + 3] === bb) return shVal[i];
      i = (i + 1) & SH_MASK;
    }
    const m = hexShareOf(b);
    if (shN < SH_CAP * 0.7) { const k = i * 4; shGen[i] = shNow; shKey[k] = l; shKey[k + 1] = t; shKey[k + 2] = r; shKey[k + 3] = bb; shVal[i] = m; shN++; }
    return m;
  };
  const hexOutside = (a, w, hh) => {
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
      let exit = 0;
      for (let e = 0; e < 6; e++) {
        const ax = hexX[e], ay = hexY[e], bx = hexX[(e + 1) % 6], by = hexY[(e + 1) % 6], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const sv = ((ax - a[0]) * ey - (ay - a[1]) * ex) / den, u = ((ax - a[0]) * dy - (ay - a[1]) * dx) / den;
        if (sv > 0 && u >= 0 && u <= 1) exit = Math.max(exit, sv);
      }
      if (!exit) continue;
      const d = exit + Math.min(w / 2 / Math.max(Math.abs(dx), 1e-6), hh / 2 / Math.max(Math.abs(dy), 1e-6)) + 14;
      hexOut[n++] = a[0] + dx * d; hexOut[n++] = a[1] + dy * d;
    }
    return n >> 1;
  };
  const hexObj = { share: hexShare, outside: hexOutside };
  const hexOf = () => {
    const C = geo.lobules[0].corners;
    for (let i = 0; i < 6; i++) { hexX[i] = sX(C[i][0]); hexY[i] = sY(C[i][1]); }
    shNow++; shN = 0;
    return hexObj;
  };
  const INSIDE_COST = 3000;   // a label wholly inside the lobule costs this much more than one wholly outside (far below any clash)
  const ringO = { a: [0, 0], rr: 0, clear: 0 };   // (callRingAt's answer, written again in place: read within one layout, never kept)
  const callRingAt = (fr) => {
    if (!call) return null;
    const q = anchorOf(call.at), ax = sX(q[0]), ay = sY(q[1]);
    if (!(ax > fr.l && ax < fr.r && ay > fr.t && ay < fr.b)) return null;
    const rr = Math.max(10, (call.at === 'triad' ? (geo.rt || 6) * 1.6 : (geo.rcv0 || 6) * 1.1) * V.k);
    ringO.a[0] = ax; ringO.a[1] = ay; ringO.rr = rr; ringO.clear = rr + RING_STROKE / 2 + RING_GAP;
    return ringO;
  };
  // How far a box reaches into the ring's clear zone (0 when it keeps out): the nearest point of the box to the centre.
  const ringDepth = (ring, b) => {
    if (!ring) return 0;
    const dx = Math.max(b.l - ring.a[0], 0, ring.a[0] - b.r), dy = Math.max(b.t - ring.a[1], 0, ring.a[1] - b.b);
    return Math.max(0, ring.clear - Math.hypot(dx, dy));
  };
  const CALL_RS = [70, 100, 140];
  const candBuf = new Float64Array(3 * 80);   // (the pill's candidate spots: x, y and whether it is the one it sat at last time; 61 at most)
  const candPQ = [0, 0], cBox = { l: 0, r: 0, t: 0, b: 0 };   // (a candidate's spot and box, handed to the checks)
  let callFitN = -1, callFitS = '';
  const boxOv = overlapLRTB;
  // (placeCall's answer, the pill's box and its leader's two ends, written into the record it is handed: the layout's own, kept and written
  // again each time, or a fresh one in the settled re-layout that still has a clash, where the first answer must outlive the second.)
  const mkCallOut = () => ({ box: { l: 0, r: 0, t: 0, b: 0 }, lead: [[0, 0], [0, 0]] });   // alloc-rare: once at setup (callOutMain), else only in the settled clash retry (coreFirst), never a frame of a hand's move
  const callOutMain = mkCallOut();
  function placeCall(fr, placed, cards, leads, crosses, ring, hex, keep, into, out) {
    if (!callEl.isConnected) { mount(labels, callEl); mount(leaders, callLine, callRing); }
    // (Not shown until its size is known for its words: placed at a guessed size, it slid sideways once measured, seconds in on a slow renderer.)
    const on = !!ring && callEl._lzSz?.txt === callEl.textContent;
    if (ring && !on) { measQ.add(callEl); if (!measT) measT = restPass(measureRun); }
    if (classHas(callEl, 'on') !== on) { for (let i = 0; i < 3; i++) classSoon(callParts[i], 'on', on); runSoon(leadPaint); }   // (the leader's look is read when it is drawn: drawn again once the class is in)
    if (!on) return null;
    const a = ring.a, rr = ring.rr;
    // (A phone on its side keeps the data card's whole column out of the free space, though the card stands at its top only: the
    // pill may also stand below that card, clear of it, the key and the nav pill by their cost as cards. Kept to the free space's
    // 80 px strip there, Sites 6 had no clear spot and set it on the nav pill.)
    let frR = fr.r;
    if (document.querySelector('.pz.low')) frR = Math.max(frR, geo.W - cssN('--right-occ') - 12);
    // Never wider than the free space: a long line wraps instead of running off the screen.
    const fitN = Math.max(120, Math.round(frR - fr.l - 20));
    if (fitN !== callFitN) { callFitN = fitN; callFitS = `${fitN}px`; }   // alloc-rare: only when the free space's width changes
    // (Its room is written between frames, a rest pass, and the pill measured again there: never in the frame that lays it out.)
    if (callFitS !== callFit) { callFit = callFitS; if (!callFitT) callFitT = restPass(writeCallFit); }
    sizeOf(callEl, 120, 28);
    const w = szW, hh = szH, pad = 10;
    // Where it sat last time (relative to the spot) is tried too and kept while it is still as good: a value easing or a
    // label that moved a pixel never flips the pill to another side, and the leader with it.
    let nc = 0;
    for (let ri = 0; ri < 3; ri++) {
      const r0 = CALL_RS[ri];
      for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2 - Math.PI / 2, r = Math.max(r0, ring.clear + hh / 2 + 8 + r0 - 70); candBuf[nc++] = a[0] + Math.cos(t) * (r + w / 3); candBuf[nc++] = a[1] + Math.sin(t) * r; candBuf[nc++] = 0; }
    }
    const nOut = hex.outside(a, w, hh);
    for (let i = 0; i < nOut; i++) { candBuf[nc++] = hexOut[2 * i]; candBuf[nc++] = hexOut[2 * i + 1]; candBuf[nc++] = 0; }
    if (cpOn && cpAt === call.at) { candBuf[nc++] = a[0] + cpDx; candBuf[nc++] = a[1] + cpDy; candBuf[nc++] = 1; }
    let have = false, bx = 0, by = 0, bcost = 0, bl = 0, br = 0, bt = 0, bb = 0;
    for (let ci = 0; ci < nc; ci += 3) {
      const px = candBuf[ci], py = candBuf[ci + 1], prev = candBuf[ci + 2];
      const x = clamp(px, fr.l + w / 2 + pad, frR - w / 2 - pad), y = clamp(py, fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
      cBox.l = x - w / 2 - 6; cBox.r = x + w / 2 + 6; cBox.t = y - hh / 2 - 6; cBox.b = y + hh / 2 + 6;
      candPQ[0] = x; candPQ[1] = y;
      // (The same sum, in the same order, as it was when each part was a reduce.)
      let c1 = 0; for (let i = 0; i < placed.length; i++) { const o = placed[i], v = boxOv(cBox, o); c1 = c1 + (v > 0 ? 1e6 + v * 100 : 0) + (crosses(a, candPQ, o) ? 1e5 : 0); }
      let c2 = 0; for (let i = 0; i < leads.length; i++) c2 = c2 + (crosses(leads[i][0], leads[i][1], cBox) ? 1e6 : 0);
      const rd0 = ringDepth(ring, cBox);
      let c3 = 0; for (let i = 0; i < keep.length; i++) { const d = into(keep[i], cBox); c3 = c3 + (d > 0 ? 1e6 + d * 1e3 : 0); }
      let c4 = 0; for (let i = 0; i < cards.length; i++) { const o = cards[i], v = boxOv(cBox, o); c4 = c4 + (v > 0 ? 1e6 + v * 400 : 0); }
      const cost = c1 + c2 + (rd0 > 0 ? 1e6 + rd0 * 1e4 : 0) + c3 + hex.share(cBox) * INSIDE_COST + c4 + Math.hypot(x - a[0], y - a[1]) * 0.5 + Math.max(0, Math.hypot(x - a[0], y - a[1]) - w / 2 - 110) * 30 - (prev ? 60 : 0);
      if (!have || cost < bcost) { have = true; bx = x; by = y; bcost = cost; bl = cBox.l; br = cBox.r; bt = cBox.t; bb = cBox.b; }
    }
    const ob = out.box;
    ob.l = bl; ob.r = br; ob.t = bt; ob.b = bb; placed.push(ob);
    cpOn = true; cpAt = call.at; cpDx = bx - a[0]; cpDy = by - a[1]; callCost = bcost;   // (where it sat, kept as numbers: callState saves and puts them back)
    put(callEl, bx - w / 2, by - hh / 2);
    // The leader starts on the ring's edge (not at its centre) and runs to the pill.
    const dl = Math.hypot(bx - a[0], by - a[1]) || 1, e0 = rr / dl;
    setGeo(callLine, 'x1', a[0] + (bx - a[0]) * e0); setGeo(callLine, 'y1', a[1] + (by - a[1]) * e0); setGeo(callLine, 'x2', bx); setGeo(callLine, 'y2', by);
    setGeo(callRing, 'cx', a[0]); setGeo(callRing, 'cy', a[1]); setGeo(callRing, 'r', rr);
    leadGL.paint();
    const ld = out.lead;
    ld[0][0] = a[0] + (bx - a[0]) * e0; ld[0][1] = a[1] + (by - a[1]) * e0; ld[1][0] = bx; ld[1][1] = by;
    return ld;
  }
  // Zone names written in the bands themselves, as the organs are named on the anatomy: quiet capitals in each
  // zone's color, on the radius to the flat bottom edge, so each name runs along its band. The three elements are made
  // once and only moved: re-making them at every layout (a value easing, a glide) restarted their lit pill each time,
  // which showed as a flash. Returns each name's box on screen (its pill included), for the other labels to keep clear of.
  const zoneEls = [];
  // A label or zone name that goes fades out where it stands (app.css .lz-off, as the anatomy's labels do) and is hidden, taking no
  // room and no taps, only once the fade is over; one that comes back fades in (app.css lz-in) or, caught mid-fade, turns back from
  // where it is. Its leader and dot fade with it (.ld-gone). They used to cut out and pop in (P15).
  const OFF_MS = D_SMALL;
  function offEnd(el, done) { el._lzOff = 0; setHid(el, true); classSoon(el, 'lz-off', false); classSoon(el, 'edge', false); done?.(); }
  const offFire = (el, done) => { if (classHas(el, 'lz-off')) offEnd(el, done); };
  function fadeOut(el, done) {
    if (isHid(el)) { done?.(); return; }
    if (classHas(el, 'lz-off')) return;
    if (reduce.matches) { offEnd(el, done); return; }
    classSoon(el, 'lz-off', true);
    clearTimeout(el._lzOff); el._lzOff = setTimeout(offFire, OFF_MS, el, done);
  }
  function fadeIn(el) { clearTimeout(el._lzOff); el._lzOff = 0; classSoon(el, 'lz-off', false); setHid(el, false); }
  const gone = (el) => isHid(el) || classHas(el, 'lz-off');
  const leadOff = (L) => { L.hadLead = false; classSoon(L.line, 'ld-gone', true); classSoon(L.dotEl, 'ld-gone', true); };
  const leadOn = (L) => { classSoon(L.line, 'ld-gone', false); classSoon(L.dotEl, 'ld-gone', false); };
  const ZONE_TPL = [['Zone 1', 'periportal'], ['Zone 2', 'midzonal'], ['Zone 3', 'centrilobular']].map(([t, d], i) => {
    const z = h('div', { class: 'lz-zone z' + (i + 1), 'aria-hidden': 'true', 'data-target': `lobule:zone${i + 1}` }, h('b', {}, t), h('span', {}, d));
    z.style.setProperty('--zk', '1');
    return z;
  });
  const NO_BOXES = [];   // (read, never written: no zone names on show)
  const ZONE_Q = [0.83, 0.51, 0.2];
  const zSx = new Float64Array(12), zSy = new Float64Array(12), zTx = new Float64Array(13), zTy = new Float64Array(13), zTd = new Float64Array(13);
  const zBox = { l: 0, r: 0, t: 0, b: 0 };
  const zoneBoxesBuf = [], zoneBoxPool = [{ l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }, { l: 0, r: 0, t: 0, b: 0 }];   // (placeZones' answer: the boxes of the names on show, kept and written again)
  function placeZones(fr0, hx, hy, lesion = null) {
    if (!zonesOn) { while (zoneEls.length) { const z = zoneEls.pop(); fadeOut(z, () => restRemove(z)); } return NO_BOXES; }   // alloc-rare: only when the Zones layer is switched off (the names are taken out once)
    const { R, cx, cy } = geo, a = Math.PI / 2, ap = R * 0.866, boxes = zoneBoxesBuf;
    boxes.length = 0;
    const midx = (fr0.l + fr0.r) / 2, midy = (fr0.t + fr0.b) / 2;
    for (let i = 0; i < 3; i++) {
      const q = ZONE_Q[i];
      let z = zoneEls[i];
      if (!z) z = zoneEls[i] = ZONE_TPL[i].cloneNode(true);   // (cloned from its model, made with the view: a frame builds nothing)   // alloc-rare: only the first layout with the Zones layer on
      if (!z.isConnected) mount(labels, z);
      // Its usual spot (on the radius to the flat bottom edge); if that is out of view, the nearest in-view spot
      // of the same zone (the same ring, at the other five sides and corners), else clamped to the free edge.
      for (let k = 0; k < 6; k++) {
        const th = a + k * Math.PI / 3;
        zSx[2 * k] = sX(cx + Math.cos(th) * ap * q); zSy[2 * k] = sY(cy + Math.sin(th) * ap * q);
        zSx[2 * k + 1] = sX(cx + Math.cos(th + Math.PI / 6) * R * q * 0.95); zSy[2 * k + 1] = sY(cy + Math.sin(th + Math.PI / 6) * R * q * 0.95);
      }
      let nT = 0;
      if (zInV(fr0, zSx[0], zSy[0])) { zTx[0] = zSx[0]; zTy[0] = zSy[0]; nT = 1; }
      const base = nT;
      for (let k = 1; k < 12; k++) {
        if (!zInV(fr0, zSx[k], zSy[k])) continue;
        const d = Math.hypot(zSx[k] - midx, zSy[k] - midy);
        let j = nT;
        while (j > base && zTd[j - 1] > d) { zTx[j] = zTx[j - 1]; zTy[j] = zTy[j - 1]; zTd[j] = zTd[j - 1]; j--; }
        zTx[j] = zSx[k]; zTy[j] = zSy[k]; zTd[j] = d; nT++;
      }
      if (!nT) { zTx[0] = clamp(zSx[0], fr0.l + 40, fr0.r - 40); zTy[0] = clamp(zSy[0], fr0.t + 20, fr0.b - 20); nT = 1; }
      put(z, zTx[0], zTy[0]);
      sizeOf(z, 92, 36);
      const w = szW, hh = szH;
      // A zone's name never sits on the slide's lesion ring (the ring is what the slide points at): it takes another
      // spot on its band, or leaves the view for that slide.
      let at = -1;
      for (let j = 0; j < nT; j++) { zBox.l = zTx[j] - w / 2 - hx; zBox.r = zTx[j] + w / 2 + hx; zBox.t = zTy[j] - hh / 2 - hy; zBox.b = zTy[j] + hh / 2 + hy; if (!ringDepth(lesion, zBox)) { at = j; break; } }
      if (at < 0) { fadeOut(z); continue; }
      fadeIn(z);
      put(z, zTx[at], zTy[at]);
      { const zb = zoneBoxPool[i]; zb.l = zTx[at] - w / 2 - hx; zb.r = zTx[at] + w / 2 + hx; zb.t = zTy[at] - hh / 2 - hy; zb.b = zTy[at] + hh / 2 + hy; boxes.push(zb); }   // (the layout keeps these boxes, one a zone, written again each layout: placed holds them only until the next layout)
    }
    return boxes;
  }
  const zInV = (fr0, x, y) => x > fr0.l + 40 && x < fr0.r - 40 && y > fr0.t + 20 && y < fr0.b - 20;
  // The layout the labels were last placed for (everything but the view, and the view: k, x, y), which a pan carries them from.
  // (Two kept records, taken in turn: a layout writes the one not standing in place while the other still stands, so a layout that has to
  // wait for the labels to be measured can put the standing one back. Their inputs are compared as numbers, in place: a key string built
  // from them on every frame was garbage, 2 Nov 2026.)
  const mkFollow = () => ({ W: 0, H: 0, zones: false, lymph: false, ha: false, bd: false, hasCall: false, callAt: '', callLabel: '', lks: ['', '', '', '', '', ''],
    t: 0, b: 0, l: 0, r: 0, k: 0, x: 0, y: 0, ride: null,
    rideBuf: { labs: [], chips: [], zones: [], nl: 0, nc: 0, nz: 0, cards: null, ix: 0, iy: 0 } });
  const follows = [mkFollow(), mkFollow()];
  let follow = null, followT = 0, rough = false;
  // The labels in the order they were made (the panel's), and in the order a layout takes them.
  const LAB_KEYS = ['triad', 'sin', 'cv', 'lymph', 'ha', 'bd'], LAY_ORDER = ['cv', 'sin', 'triad', 'lymph', 'ha', 'bd'];
  const LAB_TARGET = {};   // (the slide's name for each label, built once)
  for (const k of LAY_ORDER) LAB_TARGET[k] = `lobule:${LZ_TARGET[k] || k}`;
  // Whether the layout's inputs but the view are those record f was taken for: the labels' make-up, the zone and lymph switches, the
  // slide's pointer and the free space.
  function sameBase(f, fr0, g) {
    if (f.W !== g.W || f.H !== g.H || f.zones !== zonesOn || f.lymph !== lymphOn || f.ha !== named('ha') || f.bd !== named('bd')) return false;
    if (f.hasCall !== !!call || (call && (f.callAt !== call.at || f.callLabel !== call.label))) return false;
    if (f.t !== fr0.t || f.b !== fr0.b || f.l !== fr0.l || f.r !== fr0.r) return false;
    for (let i = 0; i < LAB_KEYS.length; i++) if (f.lks[i] !== labs[LAB_KEYS[i]].lk) return false;
    return true;
  }
  function fillBase(f, fr0, g) {
    f.W = g.W; f.H = g.H; f.zones = zonesOn; f.lymph = lymphOn; f.ha = named('ha'); f.bd = named('bd');
    f.hasCall = !!call; f.callAt = call ? call.at : ''; f.callLabel = call ? call.label : '';
    f.t = fr0.t; f.b = fr0.b; f.l = fr0.l; f.r = fr0.r;
    for (let i = 0; i < LAB_KEYS.length; i++) f.lks[i] = labs[LAB_KEYS[i]].lk;
  }
  // (A wheel or a trackpad's pinch is a hand too, as a scroll is: each of them changed the zoom on every frame and laid the labels out in
  // full there, and redrew the lobule's bitmap at each √2 step, which is what made zooming the lobule on a Mac lag.)
  const handOn = () => touches.size > 0 || !!cancelFlick || (!!wheelKind && !wheelQuiet(250));
  // The hand let go (or paused): place the labels again for where the view now is.
  function followEnd() { if (handOn()) { followT = setTimeout(followEnd, 140); return; } if (panOn || rough || rides) { rough = false; layoutKey = ''; viewChanged(); } }
  // Boxes and leader ends the ride's check works in, kept and written in place (a pool grows by index, once, to the most labels there are).
  const rhBox = [], rhLead = [], rhOth = [];
  const poolBox = (pool, i) => pool[i] || (pool[i] = { l: 0, r: 0, t: 0, b: 0 });   // alloc-once: a pool grows the first time a larger count is asked for, then it is reused
  // Whether the labels as laid out (follow.ride), each carried with its spot to the view now, still keep the layout's rules: no label on
  // another, a zone's name or a chip, none on another's leader, no two leaders crossed, none on a structure (which grows as the view
  // zooms in) or a card, each inside the free space and what it names still in it, and no chip's spot come back into view.
  // The glide's ride: each piece moved by its own spot's move since the last layout (a CSS translate, written into its place by bakeFollow).
  // Every label, zone name and pill stands where `translate` puts it (laid out once at the box's corner, so a move or glide is the
  // compositor's, never a layout per frame); its spot is kept here, and a pan's ride adds its shift on top.
  const spot = new WeakMap();
  // (Where each piece is drawn: the GPU's names take it in this frame; the page's clear model is placed between frames, domFlush.)
  const seenPos = new Map(), domQ = new Set();
  let domT = 0;
  const tr = (e, x, y) => {
    let q = seenPos.get(e);
    if (!q) seenPos.set(e, q = [0, 0]);   // alloc-rare: once a piece
    q[0] = x; q[1] = y; domQ.add(e);
    if (!domT) domT = restPass(domFlush);
    cap.paint();
  };
  // A piece whose place is taken away (the pill with no spot): its translate is cleared between frames too.
  const clrQ = new Set();
  const trClear = (e) => { domQ.delete(e); clrQ.add(e); if (!domT) domT = restPass(domFlush); };
  function domFlush() {
    domT = 0;
    if (rides) return;   // (a hand's ride: placed once it is baked, bakeRides)
    for (const e of clrQ) if (e.style.translate) e.style.translate = '';
    clrQ.clear();
    for (const e of domQ) { const p = seenPos.get(e); if (p) e.style.translate = `${p[0].toFixed(2)}px ${p[1].toFixed(2)}px`; }
    domQ.clear();
  }
  // ── The names on the GPU ──
  // Each one's words as the page set them, read between frames when they, their classes or their looks change (mirrorRun), and kept.
  const mirKeep = new WeakMap(), mirQ = new Set();
  let mirT = 0;
  // (The names, listed once and again only when a zone name is made: a frame makes no list.)
  let capList = null, capZones = -1;
  const capItems = () => {
    if (capList && capZones === zoneEls.length) return capList;
    capZones = zoneEls.length;   // alloc-rare: only when a zone name is first made
    return (capList = [...Object.entries(labs).map(([k, L]) => [`lab:${k}`, L.el, L]), ...zoneEls.map((z, i) => [`zone:${i}`, z, null]), ['call', callEl, null]]);
  };
  function mirrorSoon(...els) { if (!cap.on) return; for (const e of els) if (e) mirQ.add(e); if (!mirT) mirT = restPass(mirrorRun); }
  const mirrorAll = () => {
    if (!cap.on) return;
    for (const k in labs) { const e = labs[k].el; if (e) mirQ.add(e); }
    for (let i = 0; i < zoneEls.length; i++) if (zoneEls[i]) mirQ.add(zoneEls[i]);
    if (callEl) mirQ.add(callEl);
    if (!mirT) mirT = restPass(mirrorRun);
  };
  function mirrorRun() {
    mirT = 0;
    flushRestAttrs();   // (shown or hidden, as the frame asked: written before the page is read)
    for (const [key, e] of capItems()) {
      if (!mirQ.has(e) || !e.isConnected || e.hidden) continue;
      const m = mirrorOf(e, ['.n']);
      if (m) { mirKeep.set(e, m); cap.mirror(key, m); }
      // (A label's arrow at the screen's edge is in its secondary ink, app.css .lz-lab.edge .n::before: read whether or not it waits there now.)
      const L = labs[key.slice(4)];
      if (L && key.startsWith('lab:')) L.arrowC = capRGBA(readStyle(e).getPropertyValue('--text-2').trim());
    }
    mirQ.clear();
    cap.paint();
  }
  // A label a slide's words leave unlit fades out (app.css, the presenting app's data-lit): the same test, on the lit terms kept.
  const DIM_A = 0.35;   // (an unlit name's alpha on a slide that lights terms: Mohammad's pick 14.3 B)
  // (The leaders in this layer fade with their names: a class on each, as the sheet's presenting-and-lit rule set their strength, read again by the picture.)
  const syncDim = () => { for (const k in labs) { const L = labs[k]; if (!L.line) continue; const d = dimmed(L.el.dataset.target); classSoon(L.line, 'lz-dim', d); classSoon(L.dotEl, 'lz-dim', d); } };
  const dimmed = (t) => {
    const lit = litOf();
    if (!litRaw || !/(^| )(lobule|sinusoid):/.test(litRaw) || !appEl?.classList.contains('presenting')) return false;
    return !(LIT_OK.includes(t) && lit.has(t));
  };
  // Every name's place and show for this frame, drawn in it: a label gliding to its new spot on the page's curve (easeLab), one riding
  // a pan at its spot's shift (tr), a zone name at its centre, the call pill easing in from a little smaller.
  const LEADO = { x1: 0, y1: 0, x2: 0, y2: 0, show: 1, colour: 'rgba(150, 150, 150, .5)', cut: false, of: null, follow: false, sg: 0 };   // (one record, rewritten for each lead)   // colour-exempt: the leaders' neutral grey, set per leader by the layout
  function capSync(t) {
    if (fade <= 0) return false;
    const now = tlNow();   // (the page's clock, which the labels' glides are noted on; t: the names' own, for their fades)
    let moving = false;
    for (const [key, e, L] of capItems()) {
      const m = mirKeep.get(e);
      let p = seenPos.get(e);
      if (!m || !p) continue;
      let x = p[0], y = p[1];
      if (L && labGliding(L, now)) { const g = L.gl, k = easeLab(g, now); x = g.x0 + (g.x1 - g.x0) * k; y = g.y0 + (g.y1 - g.y0) * k; moving = true; }
      const call = e === callEl, zone = !L && !call;
      const off = !e.isConnected || gone(e) || (call && !classHas(callEl, 'on'));
      cap.place(key, zone ? x : x + m.w / 2, zone ? y : y + m.h / 2, off ? 0 : !call && dimmed(e.dataset.target) ? DIM_A : 1, off && gone(e) ? D_SMALL : D_SURFACE, call ? (off ? 0.94 : 1) : -1, t);
      if (L) {
        // The station's leader and dot, drawn with its name by label-gl (the lead's near end is the name's, its far end the figure's point).
        const hid = off || classHas(L.line, 'ld-gone') || classHas(L.line, 'lz-hid') || classHas(L.el, 'edge');
        LEADO.x1 = +geoOf(L.line, 'x2'); LEADO.y1 = +geoOf(L.line, 'y2'); LEADO.x2 = +geoOf(L.line, 'x1'); LEADO.y2 = +geoOf(L.line, 'y1');
        LEADO.show = hid ? 0 : dimmed(e.dataset.target) ? DIM_A : 1;
        if (Number.isFinite(LEADO.x1 + LEADO.y1 + LEADO.x2 + LEADO.y2)) cap.lead(key, LEADO);
        const ink = L.arrowC || m.at['.n']?.colour || '';
        cap.arrow(key, L.edgeA != null && classHas(L.el, 'edge') ? (L.arrow?.ang === L.edgeA && L.arrow.r === L.edgeR && L.arrow.w === m.w && L.arrow.colour === ink ? L.arrow
          : (L.arrow = { x: m.w / 2, y: m.h / 2, ang: L.edgeA, r: L.edgeR, w: m.w, colour: ink })) : null);   // alloc-rare: only when the arrow turns
      }
    }
    return moving;
  }
  cap.onFrame = capSync;
  cap.onRest = () => { if (domQ.size && !domT) domT = restPass(domFlush); };
  // (A hover or focus changes a name's ink; a slide's lit terms, the theme and the text size its look: read again.)
  labels.addEventListener('pointerover', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  labels.addEventListener('pointerout', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  labels.addEventListener('focusin', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  labels.addEventListener('focusout', (ev) => mirrorSoon(ev.target.closest?.('.lz-lab')));
  if (typeof MutationObserver === 'function') new MutationObserver(() => mirrorAll()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  darkMQ.addEventListener?.('change', () => mirrorAll());
  function put(e, x, y) {
    const p = spot.get(e);
    if (p) { p[0] = x; p[1] = y; } else spot.set(e, [x, y]);   // alloc-once: the first spot an element is given; after it the pair is written in place
    tr(e, x, y);
  }
  // The pieces of a ride, kept and written in place (grown by index, once, to the most pieces there are).
  const rideList = [];
  let rides = null, rideN = 0;
  function rideAdd(ax, ay) {
    const r = rideList[rideN] || (rideList[rideN] = { a: [0, 0], d: [0, 0], els: [null, null, null], ne: 0, b: new Float64Array(18) });   // alloc-once: a piece is made the first time a ride needs that many, then reused
    rideN++; r.a[0] = ax; r.a[1] = ay; r.ne = 0;
    return r;
  }
  // A leader's, dot's or ring's geometry as the ride began (x1, x2, cx, y1, y2, cy; NaN where the piece has none): each frame of the ride draws it
  // carried by the piece's own shift, the way its label is, and the bake lands there.
  const RIDE_ATT = ['x1', 'x2', 'cx', 'y1', 'y2', 'cy'];
  function rideBase(r) {
    for (let j = 0; j < r.ne; j++) {
      const e = r.els[j], own = spot.get(e);
      for (let k = 0; k < 6; k++) { const o = own ? null : geoOf(e, RIDE_ATT[k]); r.b[j * 6 + k] = o != null && o !== '' ? +o : NaN; }
    }
  }
  function ride() {
    const f = follow;
    if (!rides) {
      // (the pan carries them by the same translate a layout glides: no glide may run under it, or they would trail the hand)
      classSoon(labels, 'lz-ease', false);
      freezeLabelGlides();
      rides = rideList; rideN = 0;
      for (let i = 0; i < LAB_KEYS.length; i++) {
        const L = labs[LAB_KEYS[i]];
        if (L.a && !isHid(L.el) && !classHas(L.el, 'edge')) { const r = rideAdd(L.a[0], L.a[1]); r.els[0] = L.el; r.els[1] = L.line; r.els[2] = L.dotEl; r.ne = 3; }
      }
      for (let i = 0; i < zoneEls.length; i++) {
        const z = zoneEls[i], s = z.isConnected && spot.get(z);
        if (s) { const r = rideAdd(s[0], s[1]); r.els[0] = z; r.ne = 1; }
      }
      if (classHas(callRing, 'on')) { const r = rideAdd(+geoOf(callRing, 'cx'), +geoOf(callRing, 'cy')); r.els[0] = callEl; r.els[1] = callLine; r.els[2] = callRing; r.ne = 3; }
      for (let i = 0; i < rideN; i++) rideBase(rideList[i]);
    }
    for (let i = 0; i < rideN; i++) {
      const r = rideList[i], a0 = r.a[0], a1 = r.a[1], d0 = (a0 - f.x) / f.k * V.k + V.x - a0, d1 = (a1 - f.y) / f.k * V.k + V.y - a1;
      r.d[0] = d0; r.d[1] = d1;
      for (let j = 0; j < r.ne; j++) {
        const e = r.els[j], p = spot.get(e);
        if (p) tr(e, p[0] + d0, p[1] + d1);
        else {
          // (A leader, its dot or the ring has no spot: the GPU draws it from its geometry, set to where the ride began plus the shift.)
          for (let k = 0; k < 6; k++) { const b = r.b[j * 6 + k]; if (b === b) setGeo(e, RIDE_ATT[k], b + (k < 3 ? d0 : d1)); }
        }
      }
    }
    leadGL.paint();
  }
  // A model piece's ends and centre carried by the pan's shift (held on the piece, never written as attributes).
  const shiftAttr = (e, a, v) => { const o = geoOf(e, a); if (o != null && o !== '') setGeo(e, a, +o + v); };
  function shiftGeo(e, dx, dy) {
    shiftAttr(e, 'x1', dx); shiftAttr(e, 'x2', dx); shiftAttr(e, 'cx', dx); shiftAttr(e, 'y1', dy); shiftAttr(e, 'y2', dy); shiftAttr(e, 'cy', dy);
    leadGL.paint();
  }
  const unglide = () => { for (let i = 0; i < LAB_KEYS.length; i++) labs[LAB_KEYS[i]].gl = null; };
  // A hand can take over before the last layout's glide lands. Carry the position actually on screen; capSync must not overwrite
  // the ride with that old glide's positions. Leaders already use seenAt on the same clock.
  function freezeLabelGlides() {
    if (glideRaf) cancelFrame(glideRaf);
    glideRaf = 0; glideUntil = 0;
    const now = tlNow();
    for (let i = 0; i < LAB_KEYS.length; i++) {
      const L = labs[LAB_KEYS[i]];
      if (L.gl && spot.has(L.el)) { const p = seenAt(L, now); put(L.el, p[0], p[1]); }
      L.gl = null;
    }
  }
  function bakeRides() {
    if (!rides) return false;
    // (Written in place with no glide on, then the page styled once, so the layout's glide starts from where each piece is seen.)
    classSoon(labels, 'lz-ease', false);
    let moved = false;
    for (let i = 0; i < rideN; i++) {
      const r = rideList[i], dx = r.d[0], dy = r.d[1];
      if (dx || dy) moved = true;
      for (let j = 0; j < r.ne; j++) {
        const e = r.els[j], p = spot.get(e);
        if (p) put(e, p[0] + dx, p[1] + dy);   // (a leader's geometry is where the ride drew it: nothing to carry)
      }
    }
    rides = null;
    // (No read to make the page take these in: the layout waits for the next frame, which starts the glide from here. See layoutLabels.)
    unglide();
    return moved;
  }
  // The pan's shift of the labels and leaders (the GPU draws both carried by it: cap.view, leadGL.view; nothing is written to the page), and its numbers.
  // The pan and the dive are two records, composed in one place (composeView: the pan first, the dive carrying the panned layer); each is
  // written and cleared by its own owner, so ending a pan never erases the dive.
  let panOn = false;   // (the pan's shift is the PAN record: x, y)
  const VIEW = [1, 0, 0], VIEWC = { k: 1, x: 0, y: 0 };   // (the composed view, written in place)
  function applyView() {
    camThen(VIEWC, CARD, camThen(VIEWC, DIVE, PAN));   // (the card ∘ the dive ∘ the pan: each record has one writer, a card's zoom camera is never written by the dive's frames)
    VIEW[0] = VIEWC.k; VIEW[1] = VIEWC.x; VIEW[2] = VIEWC.y;
    cap.view(VIEW[0], VIEW[1], VIEW[2]); leadGL.view(VIEW[0], VIEW[1], VIEW[2]);
  }
  const unpan = () => { if (!panOn) return; panOn = false; camId(PAN); applyView(); };
  const setDive = (k, e, f) => { if (DIVE.k === k && DIVE.x === e && DIVE.y === f) return; camSet(DIVE, k, e, f); applyView(); };
  // Writes the pan's shift into the labels' and leaders' own positions and drops the shared shift, so they glide on from where they are seen.
  function bakeFollow() {
    if (bakeRides()) { clearTimeout(followT); unpan(); return true; }
    clearTimeout(followT);
    // (Only this function's own shift is a pan: the dive's is a scale about a point, kept in its own record.)
    if (!panOn) return false;
    const dx = PAN.x, dy = PAN.y;
    unpan();
    if (!dx && !dy) return false;
    for (let e = labels.firstElementChild; e; e = e.nextElementSibling) { const p = spot.get(e); if (p) put(e, p[0] + dx, p[1] + dy); }
    unglide();
    for (let e = leaders.firstElementChild; e; e = e.nextElementSibling) shiftGeo(e, dx, dy);
    leadGL.paint();
    return true;
  }
  // (The layout's geometry, shared with the zoom's ride check: rideHolds.)
  const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l))
    * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const into = discInto;
  // Leaders run to each label's centre; a leader never crosses another label, and a label never sits on another's leader.
  // (The segment's parameter range, narrowed by each axis in turn: kept here, so a test makes no array.)
  let ct0 = 0, ct1 = 1;
  const clipAxis = (d, lo, hi, o) => {
    if (Math.abs(d) < 1e-9) return !(o < lo || o > hi);
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) { const w = u; u = v; v = w; }
    ct0 = Math.max(ct0, u); ct1 = Math.min(ct1, v);
    return !(ct0 > ct1);
  };
  const crosses = (p, q, b) => {
    ct0 = 0; ct1 = 1;
    return clipAxis(q[0] - p[0], b.l, b.r, p[0]) && clipAxis(q[1] - p[1], b.t, b.b, p[1]);
  };
  // Two leaders never cross each other either (a shared end, two labels on one spot, is not a crossing).
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const cut = (p, q, r, t) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
  let layoutN = 0, bakedEase = false;   // (layoutN, for the checks: how many times the labels have been placed in full)
  // ── The layout's kept records ──
  // A layout (and the ride and the leaders' sync around it) makes no array, object or closure of its own: what it works on is kept here
  // and written in place (2 Nov 2026: a pinch whose labels cannot ride is laid out on every frame, and a layout tried hundreds of spots
  // as arrays and objects). Nothing in it is read after the layout that wrote it but through the records the layout leaves: follow
  // (the ride's check), L.a (each label's spot, in its own pair), and the boxes in sol.
  const mkRes = () => ({ k: '', it: null, out: false, x: 0, y: 0, cost: 0, crossed: false, box: { l: 0, r: 0, t: 0, b: 0 }, pair: [null, [0, 0]] });   // alloc-rare: made with the view, and in the settled re-layout that still has a clash (never a frame of a hand's move)
  const mkSol = () => ({ res: [mkRes(), mkRes(), mkRes(), mkRes(), mkRes(), mkRes()], n: 0, total: 0, pl: [], ld: [], lead: null, call: null });   // alloc-rare: made with the view, and in the settled re-layout that still has a clash (never a frame of a hand's move)
  const mkItem = () => ({ k: '', L: null, w: 0, hh: 0, a: [0, 0], ea: [0, 0], edge: null });
  const mkInk = () => ({ x0: 0, y0: 0, x1: 0, y1: 0, r: 0, L: null });
  const LC = {
    fr: null, ring: null, cards: null, keep: null, lk: 1, hx: 0, hy: 0,
    placed: [], pre: [], base: [], ld0: [], none: [], shK: [], shL: [], stack: [], sizes: [],
    items: [], pool: [mkItem(), mkItem(), mkItem(), mkItem(), mkItem(), mkItem()],
    inks: [mkInk(), mkInk(), mkInk(), mkInk(), mkInk(), mkInk()], ink0: mkInk(),
    syncOn: [], syncInks: [mkInk(), mkInk(), mkInk(), mkInk(), mkInk(), mkInk()],
    want: { ks: [], fw: 0 }, ord: [], idx: [], core: [], rest: [],
    ux: -1, uy: 0, nx: 0, ny: -1, tractR: 14, paired: false, pairN: 0, triIt: null, lyIt: null, px: 0, py: 0,
    cand: new Float64Array(2048), cb: { l: 0, r: 0, t: 0, b: 0 }, bb: { l: 0, r: 0, t: 0, b: 0 }, q: [0, 0], disc: { x: 0, y: 0, r: 10 },
    room: { fr: [0, 0, 0, 0], pad: 0, hx: 0, hy: 0, keep: [], nk: 0, cards: null },
    vb: '', vbW: -1, vbH: -1,
  };
  const SOL_A = mkSol(), SOL_B = mkSol();
  const N7 = [0, -1, 1, -2, 2, -3, 3], R3 = [1, 1.6, 2.4];
  const rnd1 = (v) => Math.round(v * 10) / 10;
  // The room the labels were given, written between frames for the browser check that a label left out had no clear spot (a rest pass,
  // from the numbers the last layout left).
  let roomT = 0;
  function writeRoom() {
    roomT = 0;
    const R = LC.room, keep = [], cards = [];
    for (let i = 0; i < R.nk; i++) keep.push([R.keep[i][0], R.keep[i][1], R.keep[i][2]].map(rnd1));
    for (const c of R.cards) cards.push([c.l, c.t, c.r, c.b].map(rnd1));
    labels.setAttribute('data-room', JSON.stringify({ fr: R.fr.map(rnd1), pad: rnd1(R.pad), hx: rnd1(R.hx), hy: rnd1(R.hy), lead: LONG_LEAD, keep, cards }));
  }
  // The lit terms (a presenter slide's words), split once each time they change.
  let litRaw2 = null;
  const litSet2 = new Set();
  const litIn = (target) => {
    const raw = document.getElementById('app')?.dataset.lit || '';
    if (raw !== litRaw2) { litRaw2 = raw; litSet2.clear(); for (const p of raw.split(' ')) litSet2.add(p); }   // alloc-rare: only when the slide's lit terms change
    return litSet2.has(target);
  };
  // A label's letters: its box less the padding, written into `o`.
  // A label the slide's words light sits in its pill (its ::before, past the box at every side, with rounded corners):
  // the leader stops on the pill's outline.
  const lettersInto = (o, L, l, t, w, hh) => {
    o.L = L;
    if (!cap.on && litIn(L.el.dataset.target)) {   // (the GPU draws no pill: the leader stops on the letters)
      // (Its pill's insets as measured with its size, measureRun; before that, app.css's own sums for them.)
      const lk = parseFloat(document.documentElement.style.getPropertyValue('--label-k')) || 1, q = L.pillQ;
      o.x0 = l + (q ? q[0] : -4 * lk); o.y0 = t + (q ? q[1] : -5 * lk); o.x1 = l + w - (q ? q[2] : -4 * lk); o.y1 = t + hh - (q ? q[3] : -5 * lk); o.r = q ? q[4] : 12;
      return o;
    }
    const p = L.pad;
    o.x0 = l + (p ? p[0] : 0); o.y0 = t + (p ? p[2] : 0); o.x1 = l + w - (p ? p[1] : 0); o.y1 = t + hh - (p ? p[3] : 0); o.r = 0;
    return o;
  };
  // The cost of leaving a label out, by how much it matters: a label the slide names most, a vessel label next.
  const dropCost = (k) => (named(k) ? 2e7 : CORE.includes(k) ? 1e7 : 3e4);
  // The ring a spot lies just outside of, for a vessel label (the centre's, where the label sits beside it).
  const ownR = (a) => {
    const keep = LC.keep;
    for (let i = 0; i < keep.length; i++) { const q = keep[i]; if (Math.hypot(q.x - a[0], q.y - a[1]) < q.r) return q.r + Math.hypot(q.x - a[0], q.y - a[1]); }
    return 10;
  };
  // The designed spots (Mohammad, 2 Nov 2026, label mocks: "shorter callout lines, that are better, and well placed"). The portal
  // tract's venule and lymphatic are named as a pair just outside their corner, one on each side of the ray from the central vein
  // through it (above and below on a side corner, left and right on a top or bottom one), so their short leaders splay apart and
  // never cross; the central vein's name stands right beside the vein, on the side away from the tract, with no leader; the
  // sinusoids' just below their sinusoid, on a short straight one.
  // Sets LC.px, LC.py to the label's preferred spot.
  function setPreferred(k, a, w, hh) {
    const ux = LC.ux, uy = LC.uy, nx = LC.nx, ny = LC.ny, hx = LC.hx, hy = LC.hy, keep = LC.keep, triIt = LC.triIt, paired = LC.paired;
    const ex = Math.abs(ux) * w / 2 + Math.abs(uy) * hh / 2, ey = Math.abs(ux) * hh / 2 + Math.abs(uy) * w / 2;
    // (Offsets reach past each box's margins (hx, hy): the box's inner corner just clears the tract's disc, or the lymphatic's own spot.)
    const mx = Math.abs(ux) * hx + Math.abs(uy) * hy, my = Math.abs(ux) * hy + Math.abs(uy) * hx;
    if (k === 'triad' && paired) { const cu = a[0] * ux + a[1] * uy + ex + mx + LC.tractR + 2, cn = LC.pairN + ey + my + 2; LC.px = ux * cu + nx * cn; LC.py = uy * cu + ny * cn; }
    else if (k === 'lymph' && paired) { const cu = a[0] * ux + a[1] * uy + ex + mx + 12, cn = LC.pairN - ey - my - 2; LC.px = ux * cu + nx * cn; LC.py = uy * cu + ny * cn; }
    else if (k === 'triad') { LC.px = a[0]; LC.py = a[1] + hh / 2 + 12; }
    else if (k === 'lymph') { LC.px = a[0]; LC.py = a[1] - hh / 2 - 14; }
    else if (k === 'cv') { const sd = triIt && triIt.a[0] > a[0] + 1 ? -1 : 1; LC.px = a[0] + sd * (keep[0].r + hx + 2 + w / 2); LC.py = a[1]; }
    else if (k === 'sin') { LC.px = a[0]; LC.py = a[1] + hh / 2 + hy + 14; }
    else if (k === 'ha') { LC.px = a[0] - w / 2 - 14; LC.py = a[1] - hh / 2 - 10; }
    else if (k === 'bd') { LC.px = a[0] + w / 2 + 14; LC.py = a[1] - hh / 2 - 10; }
    else { LC.px = a[0]; LC.py = a[1]; }
  }
  // Places the labels of `order` one at a time into `S` (a kept solution: its result for each label, its boxes and its leaders), on top of
  // the boxes pl0 and the leaders ld0 already standing; the candidate spots are written into a kept buffer, in the order they are tried, and
  // the cheapest kept (the first of equals).
  function solve(order, pl0, ld0, S) {
    const fr = LC.fr, cards = LC.cards, keep = LC.keep, ring = LC.ring, lk = LC.lk, hx = LC.hx, hy = LC.hy, cb = LC.cb, bb = LC.bb, q = LC.q, disc = LC.disc;
    const pl = S.pl, ld = S.ld, res = S.res, pad = 8 + 4 * lk;
    pl.length = 0; for (let i = 0; i < pl0.length; i++) pl.push(pl0[i]);
    ld.length = 0; for (let i = 0; i < ld0.length; i++) ld.push(ld0[i]);
    let total = 0, nr = 0;
    for (let oi = 0; oi < order.length; oi++) {
      const it = order[oi], k = it.k, w = it.w, hh = it.hh, a = it.a, edge = it.edge, step = hh + 12, r = res[nr++];
      r.k = k; r.it = it;
      let have = false, bestCost = 0, bestX = 0, bestY = 0;
      if (edge) {   // an edge chip slides along its edge only as far as it needs to clear the others
        const near = Math.abs(edge[0] - fr.l) < 40 + w || Math.abs(edge[0] - fr.r) < 40 + w;
        for (let ni = 0; ni < N7.length; ni++) {
          const n = N7[ni];
          const x = clamp(edge[0] + (near ? 0 : n * (w / 2 + 12)), fr.l + w / 2 + pad, fr.r - w / 2 - pad), y = clamp(edge[1] + (near ? n * step : 0), fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
          cb.l = x - w / 2 - hx; cb.r = x + w / 2 + hx; cb.t = y - hh / 2 - hy; cb.b = y + hh / 2 + hy;
          let plS = 0, cardS = 0;
          for (let i = 0; i < pl.length; i++) plS = plS + (overlap(cb, pl[i]) > 0 ? 1e6 + overlap(cb, pl[i]) * 100 : 0);
          for (let i = 0; i < cards.length; i++) cardS = cardS + (overlap(cb, cards[i]) > 0 ? 1e6 + overlap(cb, cards[i]) * 400 : 0);
          const cost = plS + cardS + Math.abs(n) * 10;
          if (!have || cost < bestCost) { have = true; bestCost = cost; bestX = x; bestY = y; bb.l = cb.l; bb.r = cb.r; bb.t = cb.t; bb.b = cb.b; }
        }
        if (bestCost >= 1e6) { r.out = true; total += dropCost(k); continue; }
        r.out = false; r.x = bestX; r.y = bestY; r.cost = bestCost; r.box.l = bb.l; r.box.r = bb.r; r.box.t = bb.t; r.box.b = bb.b;
        pl.push(r.box); total += bestCost;
        continue;
      }
      setPreferred(k, a, w, hh);
      const px = LC.px, py = LC.py;
      const pw = DESIGN.includes(k) ? 6 : 0.5;   // (a designed spot holds unless it clashes: its pull beats a shorter leader elsewhere)
      const nameless = !CORE.includes(k) && !named(k);
      // Steps in proportion to the label, so larger text searches proportionally farther (above, below, beside, diagonally).
      let cand = LC.cand;
      const need = 2 * (35 + 96 + 49 + 4 * pl.length);
      if (cand.length < need) cand = LC.cand = new Float64Array(need * 2);   // alloc-once: the buffer grows the first time more boxes stand than it holds, then it is reused
      let nc = 0;
      cand[nc++] = px; cand[nc++] = py;
      for (let di = 0; di < 5; di++) {
        const dx = di === 0 ? 0 : di === 1 ? -(w / 2 + 12) : di === 2 ? w / 2 + 12 : di === 3 ? -(w + 24) : w + 24;
        for (let ni = 0; ni < N7.length; ni++) { const n = N7[ni]; if (dx || n) { cand[nc++] = px + dx; cand[nc++] = py + n * step; } }
      }
      // And all round what it names, just clear of it and a little farther, so a crowded side still leaves a free spot near it.
      const r0 = ownR(a);
      for (let ri = 0; ri < 3; ri++) {
        const rr = R3[ri];
        for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
          cand[nc++] = a[0] + c * (w / 2 + 18) * rr; cand[nc++] = a[1] + sn * (hh / 2 + 18) * rr;
          const d = (r0 + 10) * rr + Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), hh / 2 / Math.max(Math.abs(sn), 1e-6));
          cand[nc++] = a[0] + c * d; cand[nc++] = a[1] + sn * d;
        }
      }
      // And a coarse grid over the whole free space, a last resort that still finds the one clear band on a short phone figure.
      for (let gx = 0; gx <= 6; gx++) for (let gy = 0; gy <= 6; gy++) { cand[nc++] = fr.l + (fr.r - fr.l) * gx / 6; cand[nc++] = fr.t + (fr.b - fr.t) * gy / 6; }
      // Snug against each label already placed (above, below or beside it), so a tight gap between two is found.
      for (let i = 0; i < pl.length; i++) {
        const o = pl[i];
        cand[nc++] = px; cand[nc++] = o.b + hh / 2 + hy; cand[nc++] = px; cand[nc++] = o.t - hh / 2 - hy;
        cand[nc++] = o.r + w / 2 + hx; cand[nc++] = py; cand[nc++] = o.l - w / 2 - hx; cand[nc++] = py;
      }
      for (let ci = 0; ci < nc; ci += 2) {
        const x = clamp(cand[ci], fr.l + w / 2 + pad, fr.r - w / 2 - pad);
        const y = clamp(cand[ci + 1], fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
        cb.l = x - w / 2 - hx; cb.r = x + w / 2 + hx; cb.t = y - hh / 2 - hy; cb.b = y + hh / 2 + hy;
        // A label with a leader keeps a visible stretch of it: it never sits right over the vessel it names.
        const lead = Math.hypot(Math.max(0, Math.abs(a[0] - x) - w / 2), Math.max(0, Math.abs(a[1] - y) - hh / 2));
        q[0] = x; q[1] = y;
        // Two labels never touch, and no leader runs under a label: any spot clear of both beats every spot that is not.
        let plS = 0, ldS = 0, cardS = 0, keepS = 0;
        for (let i = 0; i < pl.length; i++) { const o = pl[i]; plS = plS + (overlap(cb, o) > 0 ? 1e6 + overlap(cb, o) * 100 : 0) + (crosses(a, q, o) ? 1e5 : 0); }
        for (let i = 0; i < ld.length; i++) { const p = ld[i][0], e = ld[i][1]; ldS = ldS + (crosses(p, e, cb) ? 1e5 : 0) + (cut(p, e, a, q) ? 1e5 : 0); }
        for (let i = 0; i < cards.length; i++) cardS = cardS + (overlap(cb, cards[i]) > 0 ? 1e6 + overlap(cb, cards[i]) * 400 : 0);
        const rd = ringDepth(ring, cb);
        for (let i = 0; i < keep.length; i++) { const d = into(keep[i], cb); keepS = keepS + (d > 0 ? 1e6 + d * 1e3 : 0); }
        disc.x = a[0]; disc.y = a[1];
        const cost = plS + ldS
          + Math.max(0, 16 - lead) * 40
          + cardS
          + (rd > 0 ? 1e6 + rd * 1e3 : 0)
          + keepS
          + (into(disc, cb) > 0 ? 1e6 : 0)
          + lead * 8 + Math.max(0, lead - 3 * hh) * 60 + Math.max(0, lead - SHORT_LEAD) * 30 + Math.hypot(x - px, y - py) * pw
          // A label no slide names (the lymph, an arteriole, a ductule) is left out sooner than sent far from what it names
          // on a leader across the lobule (a phone once ran the Lymph label's 420 px over it, past every other label).
          + (nameless && lead > LONG_LEAD ? 1e6 : Math.max(0, lead - LONG_LEAD) * 400);
        if (!have || cost < bestCost) { have = true; bestCost = cost; bestX = x; bestY = y; bb.l = cb.l; bb.r = cb.r; bb.t = cb.t; bb.b = cb.b; }
      }
      if (bestCost >= 1e6) { r.out = true; total += dropCost(k); continue; }
      r.out = false; r.x = bestX; r.y = bestY; r.cost = bestCost; r.box.l = bb.l; r.box.r = bb.r; r.box.t = bb.t; r.box.b = bb.b;
      pl.push(r.box);
      r.pair[0] = a; r.pair[1][0] = bestX; r.pair[1][1] = bestY; ld.push(r.pair);
      total += bestCost;
    }
    S.n = nr; S.total = total;
    return S;
  }
  // The orders of the first n of a list, one after the other (the next after idx, in the order the orders sort by their positions).
  function nextPerm(a, n) {
    let i = n - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) return false;
    let j = n - 1;
    while (a[j] <= a[i]) j--;
    let t = a[i]; a[i] = a[j]; a[j] = t;
    for (let l = i + 1, r = n - 1; l < r; l++, r--) { t = a[l]; a[l] = a[r]; a[r] = t; }
    return true;
  }
  const permStart = (idx, n) => { idx.length = n; for (let i = 0; i < n; i++) idx[i] = i; };
  const permOf = (src, idx, out) => { out.length = idx.length; for (let i = 0; i < idx.length; i++) out[i] = src[idx[i]]; return out; };
  // A kept solution's results copied into another's (the first n).
  const copyRes = (dst, i, src) => {
    const d = dst.res[i];
    d.k = src.k; d.it = src.it; d.out = src.out; d.x = src.x; d.y = src.y; d.cost = src.cost; d.box.l = src.box.l; d.box.r = src.box.r; d.box.t = src.box.t; d.box.b = src.box.b;
  };
  const isCoreK = (k) => CORE.includes(k) || named(k);
  const outsOf = (s) => { let n = 0; for (let i = 0; i < s.n; i++) if (s.res[i].out && isCoreK(s.res[i].k)) n++; return n; };
  const betterSol = (p, q) => outsOf(p) < outsOf(q) || (outsOf(p) === outsOf(q) && p.total < q.total);
  // The pill's state as it stands (where it was put, its ends, what it cost), kept to put back should a layout not win.
  const callState = (lead) => ({ lead, pOn: cpOn, pAt: cpAt, pDx: cpDx, pDy: cpDy, cost: callCost, hasAt: spot.has(callEl), ax: spot.has(callEl) ? spot.get(callEl)[0] : 0, ay: spot.has(callEl) ? spot.get(callEl)[1] : 0, line: [geoOf(callLine, 'x1'), geoOf(callLine, 'y1'), geoOf(callLine, 'x2'), geoOf(callLine, 'y2')] });   // alloc-rare: only the settled re-layout that still has a clash (sol.total >= 1e5, the hand up), never a frame of a hand's move
  // A vessel label hidden or crowded: two more layouts are tried, and the one hiding the fewest vessel labels (central
  // vein, sinusoids, portal tract, and any the slide names), then crowding least, is kept. First, the vessel labels
  // placed before the slide's pill, the pill clear of them and their leaders, the optional labels in what is left.
  // Second, as the sinusoids are everywhere, another sinusoid in view for its label, when the one picked leaves none
  // (a crowded phone band once dropped the Sinusoids label on a slide about the sinusoids). The pill is never left on a label.
  // Runs only in the settled re-layout that still has a clash (the first order left sol.total >= 1e5 and no hand is moving the view):
  // its objects are made fresh, once per such layout.
  function coreFirst(items, fr, ring, hex, cards, keep, callLead) {
    const core = [], rest = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    for (const it of items) (isCoreK(it.k) ? core : rest).push(it);   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    let s1 = solve(core, LC.pre, LC.none, mkSol()), tb = mkSol();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    const idx = [], ord = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    permStart(idx, core.length);
    do { if (s1.total < 1e5) break; const t = solve(permOf(core, idx, ord), LC.pre, LC.none, tb); if (t.total < s1.total) { tb = s1; s1 = t; } } while (nextPerm(idx, core.length));
    const pl2 = s1.pl.slice();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    const lead2 = placeCall(fr, pl2, cards, s1.ld, crosses, ring, hex, keep, into, mkCallOut());   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    if (callLead && callCost >= 1e6) return null;
    const s3 = solve(rest, pl2, lead2 ? [...s1.ld, lead2] : s1.ld, mkSol());   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    const out = mkSol();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    for (let i = 0; i < s1.n; i++) copyRes(out, i, s1.res[i]);
    for (let i = 0; i < s3.n; i++) copyRes(out, s1.n + i, s3.res[i]);
    out.n = s1.n + s3.n; out.total = s1.total + s3.total; out.lead = lead2; out.call = callState(lead2);
    return out;
  }
  function pillFirst(items, shown) {
    const ld = shown.lead ? [shown.lead] : [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    let s2 = solve(items, LC.base, ld, mkSol()), tb = mkSol();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    if (items.length <= 5) {
      const idx = [], ord = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      permStart(idx, items.length);
      do { if (s2.total < 1e5) break; const t = solve(permOf(items, idx, ord), LC.base, ld, tb); if (t.total < s2.total) { tb = s2; s2 = t; } } while (nextPerm(idx, items.length));
    }
    s2.lead = shown.lead; s2.call = shown;
    return s2;
  }
  function retryClash(sol, items, fr, ring, hex, cards, keep, callLead) {
    const shown = callState(callLead);
    let won = null;
    if (callLead) { const c = coreFirst(items, fr, ring, hex, cards, keep, callLead); if (c && betterSol(c, sol)) { sol = c; won = c; } }
    let sinIt = null;
    for (let i = 0; i < items.length; i++) if (items[i].k === 'sin' && !items[i].edge) { sinIt = items[i]; break; }
    let sinOut = false;
    if (sinIt) for (let i = 0; i < sol.n; i++) if (sol.res[i].k === 'sin' && sol.res[i].out) sinOut = true;
    if (sinIt && sinOut) {
      const g = geo, cx = (fr.l + fr.r) / 2, cy = (fr.t + fr.b) / 2, a0x = sinIt.a[0], a0y = sinIt.a[1];
      const cands = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      for (const list of [g.L1, g.L2, g.L0]) for (const t of list) {   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
        const q = sinAt(t), p = [sX(q[0]), sY(q[1])];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
        if (p[0] > fr.l + 30 && p[0] < fr.r - 30 && p[1] > fr.t + 30 && p[1] < fr.b - 30) cands.push([t, p]);   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      }
      cands.sort((p, q) => Math.hypot(p[1][0] - cx, p[1][1] - cy) - Math.hypot(q[1][0] - cx, q[1][1] - cy));   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      cands.length = Math.min(cands.length, 30);
      let winX = a0x, winY = a0y;
      for (const [t, a] of cands) {   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
        sinIt.a[0] = a[0]; sinIt.a[1] = a[1];
        const s2 = pillFirst(items, shown);
        if (betterSol(s2, sol)) { sol = s2; won = s2; winX = a[0]; winY = a[1]; pick.sin = t.id; }
        const s3 = callLead ? coreFirst(items, fr, ring, hex, cards, keep, callLead) : null;
        if (s3 && betterSol(s3, sol)) { sol = s3; won = s3; winX = a[0]; winY = a[1]; pick.sin = t.id; }
        if (outsOf(sol) === 0) break;
      }
      sinIt.a[0] = winX; sinIt.a[1] = winY;
    }
    const c = won ? won.call : shown;
    cpOn = c.pOn; cpAt = c.pAt; cpDx = c.pDx; cpDy = c.pDy; callCost = c.cost;
    if (c.hasAt) put(callEl, c.ax, c.ay); else { spot.delete(callEl); trClear(callEl); }
    for (let i = 0; i < 4; i++) setGeo(callLine, CALL_ENDS[i], c.line[i] ?? null);
    leadGL.paint();
    return sol;
  }
  const CALL_ENDS = ['x1', 'y1', 'x2', 'y2'];
  function layoutLabels() {
    const fr0 = freeRect(), g = geo;
    const sameB = !!follow && sameBase(follow, fr0, g);
    if (layoutKey && sameB && V.k === follow.k && V.x === follow.x && V.y === follow.y) return;
    // While a hand pans the lobule (a drag, its flick, a trackpad scroll), the labels ride with the picture as one
    // layer: placing them again every frame (measuring each, then trying hundreds of spots and orders) is what made
    // panning lag on a phone. They are placed again, gliding to their new spots, once the hand lets go.
    if (sameB && V.k === follow.k && handOn() && !rides) {
      const dx = V.x - follow.x, dy = V.y - follow.y;
      if (!panOn) freezeLabelGlides();
      camSet(PAN, 1, dx, dy); panOn = true;
      applyView();
      clearTimeout(followT); followT = setTimeout(followEnd, 140);
      return;
    }
    // A short glide (+, −, Fit, a space that holds still) carries each label, leader and zone name with the spot it names, at
    // its own size, and lays them out once where the glide lands (they glide there from where they are seen). Solving the
    // layout on every frame of the glide (measuring the cards, trying hundreds of spots and orders) stalled it on a phone.
    if (sameB && gliding && !handOn() && !panOn) { ride(); return; }
    // A hand's zoom (a pinch, the wheel, a trackpad's pinch) carries them the same way, each with its own spot at its own size, for as
    // long as that leaves every label clear of the others, of their leaders, of the structures, of the cards and inside the free space
    // (rideHolds); a frame where it would not, they are placed again (gliding there), and once the hand lets go, placed for where it
    // stopped. Placing them in full on every frame of a pinch (measuring, then trying hundreds of spots) is what made zooming lag.
    // (While a hand zooms, the labels keep their slots and ride with the figure whether or not the spot they ride to is still clear: they are placed
    // again, gliding, when the hand lets go. Placed again mid-gesture, a label jumped to another slot while the figure moved under the hand: 3 Nov 2026.)
    if (sameB && follow.ride && V.k !== follow.k && handOn()) {
      unpan();   // (a pan's shared shift before it: ride moves each piece from the layout itself)
      ride(); clearTimeout(followT); followT = setTimeout(followEnd, 140);
      return;
    }
    // Baked where they are seen (bakeFollow): drawn so this frame, and laid out in the next one, gliding from here. The page used to be
    // made to take the baked places in at once (a layout read in the frame) so the glide could start in the same frame.
    if (bakeFollow()) { bakedEase = true; relayout(); return; }
    const baked = bakedEase; bakedEase = false;
    layoutN++;
    // A label that moves while the view holds still (a term lit, a value's width changed) glides to its new spot;
    // while the view itself pans or zooms, the labels follow it at once.
    const wasFollow = follow;   // (put back should the labels wait to be measured, below)
    if ((layoutKey && follow.W === g.W && follow.H === g.H && V.k === follow.k && V.x === follow.x && V.y === follow.y) || baked) { classSoon(labels, 'lz-ease', true); clearTimeout(easeT); easeT = setTimeout(easeEnd, 450); }
    const nf = wasFollow === follows[0] ? follows[1] : follows[0];
    layoutKey = 'laid'; fillBase(nf, fr0, g); nf.k = V.k; nf.x = V.x; nf.y = V.y; nf.ride = null; follow = nf;
    pickAnchors(fr0);
    if (LC.vbW !== g.W || LC.vbH !== g.H) { LC.vbW = g.W; LC.vbH = g.H; LC.vb = `0 0 ${g.W} ${g.H}`; }   // alloc-rare: only when the lobule's size changed
    if (setGeo(leaders, 'viewBox', LC.vb)) leadGL.paint();
    // Every label has a leader to what it names, aimed at the label's centre and stopping on the edge of its letters.
    // Score nearby placements together so zooming, panning and narrow screens do not stack labels.
    const fr = fr0, placed = LC.placed;
    placed.length = 0;
    if (lymphOn) {
      // The lymph label follows whichever lymphatic is in view (the picked triad's first, else the one nearest the middle).
      const mx = (fr0.l + fr0.r) / 2, my = (fr0.t + fr0.b) / 2, cur = pick.lt ?? pick.triad;
      let curIn = false, bestI = -1, bestD = 0;
      for (let i = 0; i < 6; i++) {
        const p = g.triads[i].lv.pts[0], x = p[0] * V.k + V.x, y = p[1] * V.k + V.y;
        if (!(x > 0 && x < g.W && y > 0 && y < g.H)) continue;
        if (i === cur) curIn = true;
        const d = Math.hypot(x - mx, y - my);
        if (bestI < 0 || d < bestD) { bestI = i; bestD = d; }
      }
      pick.lt = curIn ? cur : bestI < 0 ? null : bestI;
      if (pick.lt == null) pick.lt = pick.triad;
    }
    // Open cards over the figure (a presenter slide's numbers, notices) and the labelled structures themselves:
    // a label pays heavily to sit on either, so at large text sizes the labels move off them rather than cover them.
    // (Their boxes as kept, snap.cards: read at a rest boundary, never in the frame; a new reading is a new list, this one is never written.)
    const cards = snap.cards;
    // What no label may cover: the central vein, every portal tract (venule, arteriole, ductule and lymphatic) and the
    // spot each label names, each a disc on screen. A label is pinned just beside what it names, on a short leader, clear of them all.
    const keep = keepDiscs(g);
    // The letters' halo reaches past each label's box, more so at larger text: the margins grow with it.
    // Each box also takes in the label's pill (it reaches 4×5 px past the text at --label-k 1) and half the gap kept
    // between two labels, so no two pills ever touch.
    const lk = parseFloat(document.documentElement.style.getPropertyValue('--label-k')) || 1, hm = 4 + 2 * lk,
      hx = Math.max(hm, 4 * lk + 5), hy = Math.max(hm, 5 * lk + 5);
    LC.fr = fr; LC.cards = cards; LC.keep = keep; LC.lk = lk; LC.hx = hx; LC.hy = hy;
    // (What a label must keep clear of, for the browser check that proves a label left out had no clear spot: written between frames.)
    const room = LC.room;
    room.fr[0] = fr.l; room.fr[1] = fr.t; room.fr[2] = fr.r; room.fr[3] = fr.b; room.pad = 8 + 4 * lk; room.hx = hx; room.hy = hy; room.cards = cards; room.nk = keep.length;
    for (let i = 0; i < keep.length; i++) { const kr = room.keep[i] || (room.keep[i] = [0, 0, 0]); kr[0] = keep[i].x; kr[1] = keep[i].y; kr[2] = keep[i].r; }   // alloc-once: a pair is made the first time that many discs are kept, then reused
    if (!roomT) roomT = restPass(writeRoom);
    const zoneBoxes = placeZones(fr0, hx, hy, callRingAt(fr0));
    for (let i = 0; i < zoneBoxes.length; i++) placed.push(zoneBoxes[i]);
    // Measured first; then placed one at a time, in a few orders, keeping the order that leaves no label on another
    // and no leader under another label (or the fewest), so an early label never blocks a later one's only clear spot.
    const items = LC.items;
    items.length = 0;
    const shK = LC.shK, shL = LC.shL;
    let ns = 0;
    for (let ki = 0; ki < LAY_ORDER.length; ki++) {
      const k = LAY_ORDER[ki], L = labs[k];
      if (!L) continue;
      if ((k === 'lymph' && !lymphOn) || ((k === 'ha' || k === 'bd') && !named(k))) { fadeOut(L.el); leadOff(L); continue; }
      // (Shown to be measured; one that was hidden and stays out is hidden again before anything is drawn.)
      L.peek = isHid(L.el); setHid(L.el, false);
      shK[ns] = k; shL[ns] = L; ns++;
    }
    // Too wide for the free space (large text, a narrow screen): the label stacks its second reading.
    // A label's size is read back from the page only when what decides it changed (its text and classes, the text size,
    // the theme, the window, the fonts): each read lays the page out, and two of them on every frame of a pinch were most
    // of what placing the lobule's labels cost. Otherwise the sizes last read are used, which are the same numbers.
    const env = sizeEnv(), fw = (fr.r - fr.l) * 0.32, stack = LC.stack, sizes = LC.sizes;
    let allKnown = true;
    for (let i = 0; i < ns; i++) { const sz = shL[i].sz; if (!(sz && (sz.w0 > fw && sz.u2 ? sz.s1 : sz.s0))) { allKnown = false; break; } }
    if (allKnown) {
      // (Measured for what decides their sizes now, or, where something changed since (a class on the lobule mid-dive, new words),
      // for what came before: laid out with those, and measured afresh in a task after this frame (measureRun), which lays them out
      // again only should a size have changed.)
      let stale = false;
      for (let i = 0; i < ns; i++) if (shL[i].sz.key !== labKey(env, shL[i])) { stale = true; break; }
      if (stale) { wantLabels(ns, fw); if (!measT) measT = restPass(measureRun); }
      for (let i = 0; i < ns; i++) {
        const L = shL[i], sz = L.sz;
        stack[i] = sz.w0 > fw && sz.u2;
        classSoon(L.el, 'stack', stack[i]);
      }
      for (let i = 0; i < ns; i++) sizes[i] = stack[i] ? shL[i].sz.s1 : shL[i].sz.s0;
    } else {
      // Never measured at this width: measured in a task after this frame (measureRun), and laid out in the next frame. The labels
      // stay as they are seen until then (one frame); the frame itself never reads the page.
      for (let i = 0; i < ns; i++) if (shL[i].peek) setHid(shL[i].el, true);
      wantLabels(ns, fw);
      if (!measT) measT = restPass(measureRun);
      layoutKey = ''; follow = wasFollow;
      return;
    }
    let ni = 0;
    for (let i = 0; i < ns; i++) {
      const k = shK[i], L = shL[i], w = sizes[i][0], hh = sizes[i][1];
      const p = anchorOf(k), ax = p[0] * V.k + V.x, ay = p[1] * V.k + V.y;
      const outside = k === 'lymph' ? ax < 0 || ax > g.W || ay < 0 || ay > g.H : ax < fr.l - 4 || ax > fr.r + 4 || ay < fr.t - 4 || ay > fr.b + 4;
      // What it names has left the screen: the label waits at the free space's edge, pointing the way (a tap brings it back into view).
      const chip = outside && k !== 'lymph';
      const off = (outside && !chip) || fr.r - fr.l < w + 16 || fr.b - fr.t < hh + 16;
      if (off) { if (L.peek) { setHid(L.el, true); classSoon(L.el, 'edge', false); } else fadeOut(L.el); leadOff(L); continue; }
      classSoon(L.el, 'edge', chip);
      const it = LC.pool[ni++];
      it.k = k; it.L = L; it.w = w; it.hh = hh; it.a[0] = ax; it.a[1] = ay; it.edge = null;
      if (chip) {
        const mx = (fr.l + fr.r) / 2, my = (fr.t + fr.b) / 2, dx = ax - mx, dy = ay - my, pad = 10;
        const sx = (fr.r - fr.l) / 2 - w / 2 - pad, sy = (fr.b - fr.t) / 2 - hh / 2 - pad;
        const f = Math.min(sx / Math.max(Math.abs(dx), 1e-6), sy / Math.max(Math.abs(dy), 1e-6));
        const ang = Math.atan2(dy, dx), c = Math.cos(ang), sn = Math.sin(ang);
        it.ea[0] = mx + dx * f; it.ea[1] = my + dy * f; it.edge = it.ea;
        const er = Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), hh / 2 / Math.max(Math.abs(sn), 1e-6)) + 7;
        L.edgeA = ang; L.edgeR = er;
      }
      items.push(it);
    }
    const ring = callRingAt(fr), hex = hexOf();
    LC.ring = ring;
    // The slide's pointer pill is placed first (it is the slide's point): the labels then keep clear of it and its leader.
    const pre = LC.pre, base = LC.base;
    pre.length = 0; for (let i = 0; i < placed.length; i++) pre.push(placed[i]);
    const callLead = placeCall(fr, placed, cards, LC.none, crosses, ring, hex, keep, into, callOutMain);
    base.length = 0; for (let i = 0; i < placed.length; i++) base.push(placed[i]);
    LC.ld0.length = 0; if (callLead) LC.ld0.push(callLead);
    // The designed spots: where the portal tract stands, outward from the central vein.
    let triIt = null, lyIt = null;
    for (let i = 0; i < items.length; i++) { if (items[i].k === 'triad') triIt = items[i]; else if (items[i].k === 'lymph') lyIt = items[i]; }
    const paired = !!triIt && !!lyIt && !triIt.edge && !lyIt.edge && (pick.lt ?? pick.triad) === pick.triad;
    // (Outward along the screen's axis nearest the ray: out to the side from a side corner, down or up from a bottom or top one. The
    // venule's name is split above (side corner) or left (top or bottom corner) of that axis, the lymphatic's below or right.)
    if (triIt) {
      const dx = triIt.a[0] - (g.cx * V.k + V.x), dy = triIt.a[1] - (g.cy * V.k + V.y);
      if (Math.abs(dx) >= Math.abs(dy)) { LC.ux = Math.sign(dx) || -1; LC.uy = 0; } else { LC.ux = 0; LC.uy = Math.sign(dy) || 1; }
    } else { LC.ux = -1; LC.uy = 0; }
    LC.nx = LC.ux ? 0 : -1; LC.ny = LC.ux ? -1 : 0;
    let tractR = 14;
    if (triIt) for (let i = 0; i < keep.length; i++) if (Math.hypot(keep[i].x - triIt.a[0], keep[i].y - triIt.a[1]) < 1) { tractR = keep[i].r ?? 14; break; }
    LC.tractR = tractR; LC.paired = paired; LC.triIt = triIt; LC.lyIt = lyIt;
    // (The two split about the line midway between the venule and the lymphatic, each box, margins and all, wholly on its side; on a
    // phone whose corner is near the screen's edge the line moves toward the venule's side until the lymphatic's name fits.)
    const nx = LC.nx, ny = LC.ny;
    let pairN = paired ? (triIt.a[0] * nx + triIt.a[1] * ny + (lyIt.a[0] * nx + lyIt.a[1] * ny)) / 2 : 0;
    if (paired) {
      const pad = 8 + 4 * lk, half = nx ? lyIt.w / 2 + hx : lyIt.hh / 2 + hy;
      // (how far the lymphatic's box, its far edge 2 px + its width past the line, reaches past the free space on its side)
      const far = pairN - 2 - 2 * half, lim = nx ? (nx < 0 ? -(fr.r - pad + hx) : fr.l + pad - hx) : (ny < 0 ? -(fr.b - pad + hy) : fr.t + pad - hy);
      const over = lim - far;
      if (over > 0) pairN += over + 1;
    }
    LC.pairN = pairN;
    let sol = solve(items, base, LC.ld0, SOL_A);
    // (Mid-pinch, the first order is kept; the full search runs once the hand lets go.)
    rough = sol.total >= 1e5 && handOn();
    if (rough) { clearTimeout(followT); followT = setTimeout(followEnd, 140); }
    if (sol.total >= 1e5 && !rough) {
      // Every order of up to six labels (720 at most, only while a clash remains: a few milliseconds).
      let trial = SOL_B;
      const idx = LC.idx, ord = LC.ord;
      permStart(idx, items.length);
      do {
        const s2 = solve(permOf(items, idx, ord), base, LC.ld0, trial);
        if (s2.total < sol.total) { trial = sol; sol = s2; }
        if (sol.total < 1e5 && items.length > 5) break;   // (up to five labels, 120 orders at most: the shortest leaders win, not just the first clear order)
      } while (nextPerm(idx, items.length));
      if (sol.total >= 1e5) sol = retryClash(sol, items, fr, ring, hex, cards, keep, callLead);
    }
    // A label waiting at the edge (what it names is off screen) never lies across another label's leader: its place is
    // set by the way it points, so it gives way (at 200 % text on a phone the Central vein's chip covered the Sinusoids' node).
    const res = sol.res, nr = sol.n, lt = LC.ink0, qq = LC.q;
    let anyCrossed = false;
    for (let i = 0; i < nr; i++) {
      const r = res[i], c = r.it;
      r.crossed = false;
      if (r.out || !c.edge) continue;
      lettersInto(lt, c.L, r.x - c.w / 2, r.y - c.hh / 2, c.w, c.hh);
      for (let j = 0; j < nr; j++) {
        const o = res[j];
        if (o === r || o.out || o.it.edge) continue;
        qq[0] = o.x; qq[1] = o.y;
        if (runInside(o.it.a, qq, lt) > 0.5) { r.crossed = true; anyCrossed = true; break; }
      }
    }
    if (anyCrossed) for (let i = 0; i < nr; i++) if (res[i].crossed) res[i].out = true;
    // (What a hand's zoom checks as it carries them: rideHolds.)
    if (!classHas(callRing, 'on')) {
      const R = follow.rideBuf;
      let nl = 0, nc = 0;
      for (let i = 0; i < nr; i++) {
        const r = res[i];
        if (r.out) continue;
        const a = r.it.a;
        if (!r.it.edge) {
          const e = R.labs[nl++] || (R.labs[nl - 1] = { a: [0, 0], c: [0, 0], box: { l: 0, r: 0, t: 0, b: 0 } });   // alloc-once: a record is made the first time that many labels ride, then reused
          e.a[0] = a[0]; e.a[1] = a[1]; e.c[0] = r.x; e.c[1] = r.y; e.box.l = r.box.l; e.box.r = r.box.r; e.box.t = r.box.t; e.box.b = r.box.b;
        } else {
          const e = R.chips[nc++] || (R.chips[nc - 1] = { a: [0, 0], box: { l: 0, r: 0, t: 0, b: 0 } });   // alloc-once: a record is made the first time that many chips ride, then reused
          e.a[0] = a[0]; e.a[1] = a[1]; e.box.l = r.box.l; e.box.r = r.box.r; e.box.t = r.box.t; e.box.b = r.box.b;
        }
      }
      for (let i = 0; i < zoneBoxes.length; i++) {
        const z = R.zones[i] || (R.zones[i] = { l: 0, r: 0, t: 0, b: 0 }), b = zoneBoxes[i];   // alloc-once: a box is made the first time that many zone names ride, then reused
        z.l = b.l; z.r = b.r; z.t = b.t; z.b = b.b;
      }
      R.nl = nl; R.nc = nc; R.nz = zoneBoxes.length; R.cards = cards; R.ix = 8 + 4 * lk - hx; R.iy = 8 + 4 * lk - hy;
      follow.ride = R;
    }
    // (A call-out's ring on, the buffer above is not filled, but a hand's zoom still carries the labels by ride(), which moves the call-out too: the flag must stand,
    // or a pinch laid every label out in full on every frame there, and they jumped between slots. 6 Nov 2026.)
    if (!follow.ride) follow.ride = follow.rideBuf;
    // (Every label's letters where it lands, for the leaders to keep off.)
    const inks = LC.inks;
    let nInk = 0;
    for (let i = 0; i < nr; i++) {
      const r = res[i];
      if (r.out) continue;
      const c = r.it;
      lettersInto(inks[nInk++], c.L, r.x - c.w / 2, r.y - c.hh / 2, c.w, c.hh);
    }
    for (let i = 0; i < nr; i++) {
      const r = res[i], it = r.it, L = it.L, k = it.k, w = it.w, hh = it.hh, a = it.a, edge = it.edge, x = r.x, y = r.y;
      const ax = rnd1(a[0]), ay = rnd1(a[1]);
      if (L.atX !== ax || L.atY !== ay) { L.atX = ax; L.atY = ay; L.atS = `${ax},${ay}`; }
      restAttr(L.el, 'data-at', L.atS);
      if (r.out) { if (L.peek) { setHid(L.el, true); classSoon(L.el, 'edge', false); } else fadeOut(L.el); leadOff(L); continue; }
      fadeIn(L.el);
      put(L.el, x - w / 2, y - hh / 2);
      noteAt(L);
      classSoon(L.el, 'left', !edge && (k === 'triad' || k === 'lymph') && x + w / 2 < a[0] - 4);
      if (edge) { leadOff(L); continue; }
      // (The label's spot is kept in the label's own pair: the layout's records are written again by the next.)
      const ab = L.ab || (L.ab = [0, 0]);   // alloc-once: a label's pair is made with its first layout
      ab[0] = a[0]; ab[1] = a[1];
      // (One leader rule for every view, label-place.js needsLeader: the line shows once the name stands past 12 px of what it names, from the letters' box
      // to the point, or to the central vein's rim, and stays until it comes within 8; a name that stands against it names it by standing there.)
      const gapPx = Math.hypot(Math.max(0, Math.abs(a[0] - x) - w / 2), Math.max(0, Math.abs(a[1] - y) - hh / 2)) - (k === 'cv' ? cvKeep(g) + hx : 0);
      L.hadLead = needsLeader(false, gapPx, L.hadLead);
      if (!L.hadLead) { classSoon(L.line, 'ld-gone', true); classSoon(L.dotEl, 'ld-gone', true); L.a = ab; continue; }
      leadOn(L);
      L.a = ab;
      setGeo(L.line, 'x1', a[0]); setGeo(L.line, 'y1', a[1]);
      leadTo(L, lettersInto(lt, L, x - w / 2, y - hh / 2, w, hh), inks, nInk);
      setGeo(L.dotEl, 'cx', a[0]); setGeo(L.dotEl, 'cy', a[1]);
      leadGL.paint();
    }
    // A label gliding to its new spot takes its leader's end with it, frame by frame, so the leader never runs
    // through it or stops short of it on the way.
    if (classHas(labels, 'lz-ease')) { syncLeaders(); glideUntil = performance.now() + 480; if (!glideRaf) glideRaf = frame(glideLeaders, 'lobule-glide'); }
    mirrorAll();   // (their classes as laid out, a label at the edge or on the left, and the ones now shown: read again between frames)
  }
  // The labels to be measured, asked for (kept, written in place: measureRun takes it and clears it).
  function wantLabels(ns, fw) {
    const w = LC.want, ks = w.ks;
    ks.length = 0;
    for (let i = 0; i < ns; i++) ks.push(LC.shK[i]);
    w.fw = fw; labWant = w;
  }
  // A leader's end: on the edge of its label's letters, on the way to the label's middle. While another label lies across
  // it (one gliding past), the leader is hidden, and eases back once clear: a leader never runs across a label.
  function leadTo(L, ink, inks, n) {
    // (A label of two lines of unequal width is seen as its lines' boxes, each as wide as its letters, so its leader meets the letters it
    // runs to: the Lymphatic's name above a longer reading stopped a dozen pixels short of its word, on the corner of the wider line.)
    let e;
    const rows = L.rows;
    if (rows && rows.length && !ink.r) {
      const p = L.pad, ox = ink.x0 - (p ? p[0] : 0), oy = ink.y0 - (p ? p[2] : 0), rr = L.rr || (L.rr = []);   // alloc-once: a label's row boxes are made with its first leader
      for (let i = 0; i < rows.length; i++) { const b = rr[i] || (rr[i] = { x0: 0, y0: 0, x1: 0, y1: 0 }); b.x0 = ox + rows[i].x0; b.y0 = oy + rows[i].y0; b.x1 = ox + rows[i].x1; b.y1 = oy + rows[i].y1; }   // alloc-rare: a row box is made once and reused
      rr.length = rows.length;
      e = leaderEndRects(rr, ink, L.a[0], L.a[1]);
    } else e = leaderEnd(ink, L.a[0], L.a[1]);
    if (!e) { classSoon(L.line, 'ld-gone', true); return; }
    setGeo(L.line, 'x2', e.x); setGeo(L.line, 'y2', e.y);
    const q = LC.q;
    q[0] = e.x; q[1] = e.y;
    let hidden = false;
    for (let i = 0; i < n; i++) if (inks[i].L !== L && runInside(L.a, q, inks[i]) > 0.5) { hidden = true; break; }
    classSoon(L.line, 'lz-hid', hidden);
  }
  let glideRaf = 0, glideUntil = 0;
  // The glide cut short (its time is up): the labels land at once, and their leaders with them.
  function easeEnd() { classSoon(labels, 'lz-ease', false); unglide(); syncLeaders(); }
  function glideLeaders(now) {
    glideRaf = 0;
    // (Followed until every glide has ended: a slow frame can start one late.)
    if (syncLeaders() || now < glideUntil) glideRaf = frame(glideLeaders, 'lobule-glide');
  }
  // Each leader's end set from where its label is seen now (part way through a glide, or landed). True while one glides.
  function syncLeaders() {
    let moving = false;
    // (Where each label is seen is worked out from its glide, seenAt: never read back from the page.)
    const now = tlNow(), on = LC.syncOn, inks = LC.syncInks;
    let n = 0;
    if (fade > 0) for (let i = 0; i < LAB_KEYS.length; i++) { const L = labs[LAB_KEYS[i]]; if (!gone(L.el) && spot.has(L.el)) on[n++] = L; }
    for (let i = 0; i < n; i++) { const L = on[i], [x, y] = seenAt(L, now), [w, hh] = labWH(L); lettersInto(inks[i], L, x, y, w, hh); }
    for (let i = 0; i < n; i++) {
      const L = on[i];
      if (!L.a || classHas(L.el, 'edge') || classHas(L.dotEl, 'ld-gone')) continue;
      classSoon(L.line, 'ld-gone', false);
      leadTo(L, inks[i], inks, n);
      moving ||= labGliding(L, now);
    }
    return moving;
  }

  // ── Frame loop ──
  const CALM_AFTER = 600;   // (ms of only the blood moving before it is drawn at the flow's rate: the anatomy's CALM_AFTER_MS)
  let calmAt = 0;
  function loop(now) {
    raf = 0;
    if (fade <= 0 || !model) return;
    // (Render-cost plan 1: under the presenter's black screen, the home screen or a hidden page nothing is drawn; looked at again four times a
    // second, and drawn as things stand then, the first frame stepping nothing.)
    if (stageCovered()) { last = 0; clearTimeout(sleepT); sleepT = setTimeout(sleepWake, 250); return; }
    const soft = !!gl?.software;
    if (soft && now - lastPaint < 110) { raf = nextFrame(loop); return; }
    if (lzYield && !lzYield.ready(now, viewVer !== pacedVer)) { raf = nextFrame(loop); return; }   // (a pan or zoom: drawn now)
    // The flow is drawn on every frame the screen offers, like the anatomy's blood. Battery saver alone paces it, to 15 a
    // second; a pan, zoom or any other change draws at once even then.
    // (The governor, frame.js (pure GPU plan C2, C4), which only the anatomy had: a hand, a glide, a caliber or colour easing, the dive or a
    // crossfade draw at once or at the glide's rate; once only the blood has moved for CALM_AFTER, it is drawn at the flow's 30 Hz. On a
    // 120 Hz Mac the zoomed-in lobule drew every other screen frame for the blood alone (4 Nov 2026, Mohammad: 5-10 fps while zoomed).)
    if (viewVer !== pacedVer || rzMoving || lensFrom || gliding || handOn() || fade < 0.98 || diveScaled || sinU > 0 || sinTo || tissueFading(now) || inMotion() || !lastPaint) calmAt = now;
    const pace = now - calmAt > CALM_AFTER ? Math.max(paceMs(), frameGapFor('flow')) : paceMs(), paced = !soft && pace > 0 && viewVer === pacedVer;
    if (paced && now - lastPaint < pace) { raf = nextFrame(loop); return; }
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; lastPaint = now;
    const st = store.get(), moving = st.running && !reduce.matches;
    if (moving) clock = (clock + dt) % 10000;
    rzMoving = easeRadii(dt);
    if (rzMoving || lensFrom || tissueFading(now)) drawVersion++;   // a caliber still easing, the colours or a new tissue crossfading: redraw this frame
    if (greyMoving()) drawVersion++;   // (and the surround's grey, easing with the lens)
    if (liveMoving()) drawVersion++;   // (and the shader's share of the lobule's tissue, easing with its state)
    if (lzWant != null && resSteady()) resSwap();
    const drew = draw(moving ? dt : 0);
    if (drew) { noteDraw('lobule-zoom'); lzYield?.drew(now); }
    if (resCover) resCoverStep(now);
    pacedVer = viewVer;
    // Paused and settled (nothing drawn, nothing easing): the loop stops asking for frames, as the figure does, so the
    // screen can idle. Every change wakes it (update, a pan or zoom, a glide, the store, a label size, the dive), and it
    // looks again four times a second in case a change came by a path that does not.
    if (!drew && !moving && !rzMoving && (flowA === 0 || flowA === 1) && !resCover) {
      last = 0;   // (on waking, the first frame steps nothing: no jump in the flow)
      clearTimeout(sleepT); sleepT = setTimeout(sleepWake, 250);
      return;
    }
    raf = nextFrame(loop);
  }
  let sleepT = 0;
  function sleepWake() { if (!raf && fade > 0) raf = nextFrame(loop); }
  // A Figure resolution change made while the lobule shows: the layers are drawn once more as they stand (in this frame, so the GPU
  // ones can be read), stacked into one opaque picture laid over them (resCover, under the labels), and the loop then draws them at
  // the new share under it while it fades out over FADE_MS, the same smoothstep as the anatomy's (res-fade.js). The layers
  // themselves never change opacity or visibility for it, and the tissue fills every pixel, so the cover at opacity a shows exactly
  // old × a + new × (1 − a). It follows a pan or a zoom (coverFollowInto, drawn by the cover's own context). A dive or a rise starting meanwhile (they scale the layers
  // one by one, under a copy of their own) takes the cover away; the lobule leaving gives it back (setFade, release).
  // (On the GPU, 1 Nov, "Move everything to GPU": the stack is made in the cover's own WebGL context (res-cover-gl.js), each layer taken
  // into a texture once at the change and the picture kept there; no 2D canvas, no drawImage. Where that context cannot be had or its
  // program is not ready yet, the new share is taken at once.)
  let resCover = false, resT0 = 0, resV0 = null, resGL = null, resFor = null, resW = 1, resH = 1, resShownA = -1;
  const resM = [1, 0, 0, 0, 1, 0, 0, 0, 1], resShownM = [0, 0, 0, 0, 0, 0, 0, 0, 0];   // (the cover's weight and place, kept and written in place; what was last drawn, so a frame that changed neither draws nothing)
  // (L2: the cover is a pass of the figure's own present, no canvas and no context of its own; with the lobule not in that context the new share is taken at once.)
  const coverGL = () => {
    if (!shared || !shareTop || !gl || gl.lost) return null;
    if (resFor !== shareTop) { resGL?.drop(); resGL = createResCover(shareTop); resFor = shareTop; }   // alloc-rare: only when the figure's renderer is new
    return resGL;
  };
  const resSteady = () => fade > 0.98 && !diveScaled && sinU === 0 && !sinTo && !wide && !staging && !!geo && !!model;
  function resSwap() {
    const k = lzWant;
    lzWant = null;
    if (k === lzK) return;
    freshDraw();
    const g = coverGL();
    if (g?.ready && draw(0)) {
      // (A change while one still fades starts from the mix as it shows: the cover before is laid in the picture kept, at its weight and place.)
      const [W, H] = snap.hostWH || [1, 1];   // alloc-rare: only on a change of the Figure's resolution (lzWant), never a frame's own
      if (g.build()) {
        resCover = true; resT0 = performance.now(); resV0 = { ...V }; resW = W; resH = H; resShownA = -1;   // (the kept picture is laid whole, at weight 1 and no move)   // alloc-rare: only on a change of the Figure's resolution (lzWant), never a frame's own
      } else resCoverEnd();
    } else resCoverEnd();
    lzK = k;
    freshDraw();
  }
  // (The next frame draws everything again.)
  function freshDraw() { tissueKey = ''; drawKey = ''; glDirty = true; idleDrawn = ''; }
  function resCoverStep(now) {
    const u = (now - resT0) / FADE_MS;
    if (u >= 1 || diveScaled || wide || fade <= 0) { resCoverEnd(); return; }
    // (The fade and the follow are drawn by the cover's own context, the picture it kept laid at this weight and place: nothing is written
    // to the canvas's style. Drawn again only when the weight (to four places) or the place changed.)
    const a = Math.round(fadeAlpha(u) * 1e4) / 1e4, hw = snap.hostWH, m = coverFollowInto(resM, resV0, V, hw ? hw[0] : resW, hw ? hw[1] : resH);
    let same = a === resShownA;
    for (let i = 0; same && i < 9; i++) if (m[i] !== resShownM[i]) same = false;
    if (same) return;
    if (!resGL?.show(a, m)) { resCoverEnd(); return; }
    resShownA = a;
    for (let i = 0; i < 9; i++) resShownM[i] = m[i];
  }
  function resCoverEnd() {
    if (!resCover) return;
    resGL?.drop(); resCover = false;
  }
  // The flow marks (shimmer and chevrons) fade out as the dive starts and back in once the lobule has landed, over about
  // 0.3 s each way. Ordinary panning and zooming inside the lobule view leave them alone.
  let flowA = 1, flowT = 0;
  function stepFlowA() {
    const now = performance.now(), dtm = Math.min(100, now - (flowT || now)); flowT = now;
    const open = fade > 0.98 && !diveScaled && sinU === 0;
    flowA = open ? Math.min(1, flowA + dtm / 300) : Math.max(0, flowA - dtm / 300);
  }

  // While the dive magnifies the lobule's layers (a compositor scale), they are drawn once and then left
  // alone: redrawing the WebGL vessels, the effects and the labels each frame, at full size, is what lagged.
  let diveScaled = false, diveDrawn = false;
  // The landed lobule, drawn ahead during the dive while it is still unseen (prewarm), so the frame it starts to fade in has
  // nothing to draw: drawing it there (sizing three full-screen canvases, the tissue, the vessels) snagged the zoom's last stretch.
  // staged: the view it was drawn for; relLater: its canvases are given back when the dive ends, not mid-zoom.
  let staging = false, staged = '', relLater = false;
  // (tissueDrew: the tissue was drawn in this frame, so a hosted one lies in the vessels' canvas now: draw.)
  let tissueDrew = false;
  const idleSeen = { W: 0, H: 0, dpr: 0, dark: false, k: 0, x: 0, y: 0, ver: 0, fl: 0 };
  function draw(dt) {
    stepFlowA();
    tissueDrew = false;
    const scaled = diveScaled || sinU > 0;   // the dive, or the zoom on into a sinusoid
    if (scaled && diveDrawn && flowA <= 0) return false;   // magnified by the compositor: nothing is redrawn once the marks have faded
    if (scaled && wide) return false;   // (the wide copy shows; the layers under it wait, already drawn)
    diveDrawn = scaled;
    const [W, H] = hostSize();
    ensureGeo(W, H);
    const dpr = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * lzScale() * zres;   // (Battery saver: one pixel per CSS pixel)
    const dark = isDark();
    // Keep watching for view/theme/size changes, but leave a settled paused picture alone.
    // (The picture it last drew, kept as numbers and compared in place: idleDrawn is '' when no paused picture stands.)
    const idle = idleSeen, fl = Math.round(flowA * 100);
    if (dt === 0 && idleDrawn && idle.W === W && idle.H === H && idle.dpr === dpr && idle.dark === dark && idle.k === V.k && idle.x === V.x && idle.y === V.y && idle.ver === drawVersion && idle.fl === fl) return false;
    if (dt === 0) { idle.W = W; idle.H = H; idle.dpr = dpr; idle.dark = dark; idle.k = V.k; idle.x = V.x; idle.y = V.y; idle.ver = drawVersion; idle.fl = fl; idleDrawn = 'on'; } else idleDrawn = '';
    const cs = styles();   // (the stage's kept copy of its styles, read again when a class, theme or system setting changes)
    const g = glNow();
    // (On the GPU, always: through the dive, the rise and the zoom into and out of a sinusoid too, the GPU canvas, drawn once, is
    // turned and grown with the lobule by the compositor, its rim drawn by the shader. Nothing is drawn on a 2D canvas.)
    // A hand's pinch, wheel or drag, with the lobule in the figure's own context: the last picture is carried to the view by the GPU (layShared), and
    // the vessels, the tissue and the overlay are drawn again once the hand lets go. The labels are laid for the view as it is, every frame.
    const frz = !!(g && shared && frozenOK(W, H, dpr, dark));
    if (!frz) showTissueGL(paintTissue(W, H, dpr, dark, cs, !g, g ? tissueGLOn() : null));
    snapNext = false;
    framePart('lz.layoutLabels', layoutLabels);
    if (frz) {
      frozenDraw = true;
      if (!frozenT) frozenT = setTimeout(frozenEnd, 120);
      shareTop.present();
      return true;
    }
    // (The overlay first: in the vessels' own context it is laid over them at their present, in drawGL.)
    const fxOn = fxOnGPU(W, H, dpr, dark, dt, g && !g.lost);
    const laid = g?.top?.presents;
    if (g && !g.lost) { drawGL(W, H, dpr, dark, cs, dt); frozenDraw = false; drawnV.ok = true; drawnV.k = V.k; drawnV.x = V.x; drawnV.y = V.y; drawnV.W = W; drawnV.H = H; drawnV.dpr = dpr; drawnV.dark = dark; }
    // (What is drawn in the vessels' canvas besides them, the tissue under and the overlay over: a frame that drew the vessels again
    // laid them all; one that did not lays them now.)
    if (g && !g.lost && laid !== undefined && g.top.presents === laid && (fxOn || (tisHostFor && tissueDrew))) g.present();
    return true;
  }
  // A dive aimed at a station (a presenter slide's portal tract or central vein) lands zoomed in, where the lobule reaches past the
  // screen's edges. Its layers, drawn for that landing and scaled down through the zoom, then showed only the landing's screen: a
  // box with the lobule cut off at its edges, inside the field (20 Oct, Mohammad: "zooming into a square that's already cropped").
  // So such a dive shows the wide copy instead: the whole lobule (its box out to 1.35 R, with the rim and the corners' triads),
  // tissue, vessels and ductules flattened into one picture as the layers stack, at the screen's own pixel ratio, in tiles small
  // enough for any browser (a box can pass the 16.7 M px one canvas may hold). Built before the zoom's clock starts, each tile
  // drawn by the layers themselves at the tile's size, then the layers drawn for the screen as before; on landing the layers
  // simply show again, already drawn: the same picture at the same detail, with no redraw. A tile the browser refuses (its
  // canvas memory spent) drops the copy, and the dive shows the layers as before rather than a blank lobule.
  let wideBuild = false;   // (buildWide is drawing the copy's tiles)
  const sinBusyNow = () => (sinTo === 1 ? sinU < 1 : sinU > 0);
  let wide = null;   // { el, tiles, box, soft }: the copy, its tiles in one box placed at (−l, −t) in the stage
  const WIDE_HIDE = [tissue, tissueG, glCv, fx, fxG];
  function padBox(W, H) {
    if (!geo || atFit) return null;
    return padRect(sX(geo.cx), sY(geo.cy), geo.R * V.k * 1.35, W, H);
  }
  function buildWide(W, H, box) {
    resCoverEnd();
    // Only the newest field state's tiles are kept for the dive (each older state is tens of MB), and no crossfade's old picture.
    trimFieldStates();
    // (On the GPU (wide-gl.js), or none: the dive then scales the layers themselves, as for a dive with no station.)
    return WIDE_GL ? buildWideGL(W, H, box) : null;
  }
  // The same copy on the GPU (wide-gl.js): each tile the layers drawn on the GPU at its size, as above, laid into a texture of the
  // copy's own context; each frame of the zoom draws the tiles where the box's scale puts them (setDiveZoom). Null where the GPU
  // cannot (no WebGL2 for the vessels, a tile refused): no copy then.
  let wideCv = null, wideGL, wideGone = null;
  // One context for the lobule (veins-gl.js): the copy is made and shown in the vessels' own context. Each tile is copied from
  // their canvas inside the context, once the tissue, the vessels and the overlay are laid there for it (no canvas sent from one context
  // to another), and through the zoom the copy stands in for their whole picture (their replace), the canvas unscaled; fading out
  // over the landed layers, it is laid over them (a top) at its opacity (wideA). Made again with the vessels' renderer.
  let wideHostFor = null, wideHostOff = null, wideView = null, wideA = 1;
  const wideShow = (a) => { const v = wideView; if (v && wideGL) wideGL.draw(v.W, v.H, v.dpr, v.box, v.k, v.x, v.y, v.tx, v.ty, a); };
  function wideGLOn() {
    if (!glTried) glNow();
    if (gl && !gl.lost && gl.top?.replace) {
      if (wideHostFor !== gl) {
        wideHostOff?.(); if (wideHostFor) wideGL?.release();
        wideHostFor = gl; wideGL = createWideGL(null, { host: gl.top }) || null;
        if (wideGL) {
          const offR = gl.top.replace({ on: () => !!wide?.host && !!wideView && wideA >= 1, draw: () => wideShow(1) });
          const offT = gl.top.add({ order: LZ_UNDER_GLASS + 1, draw: () => { if (wideView && wideA > 0 && wideA < 1) wideShow(wideA); } });   // (the copy fading in: over the overlay, as before, and under every glass)
          wideHostOff = () => { offR(); offT(); };
        } else wideHostOff = null;
      }
      return wideGL && !wideGL.lost ? wideGL : null;
    }
    return null;   // (no copy while the figure's context is lost; it is made again with the renderer)
  }
  function buildWideGL(W, H, box) {
    const g = glNow();
    if (!g || g.lost) return null;   // (no vessels on the GPU: no copy)
    // (A copy still fading out, from the last dive, is given back first: its canvas is this one.)
    if (wideFadeT) { clearTimeout(wideFadeT); wideFadeT = 0; const f = wideGone; wideGone = null; f?.(); }
    const wg = wideGLOn();
    if (!wg || !wg.begin()) return null;
    const hosted = !!wideHostFor, res = hosted && g.software ? 0.5 : 1;   // (hosted: the tiles at the vessels' canvas's density, as drawGL sizes it)
    const dpr0 = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * lzScale(), dpr = wideDpr(dpr0, box.w, box.h, apple());
    const dark = isDark(), cs = styles(), cx = sX(geo.cx), cy = sY(geo.cy), r = geo.R * V.k;
    // (Each tile reaches OV under its right and lower neighbours, as above: there it only feeds the filtering at the tile's edge.)
    const OV = 2 / dpr, parts = wideTiles(box.w, box.h, dpr), TW = Math.max(...parts.map((t) => t.w)) + OV, TH = Math.max(...parts.map((t) => t.h)) + OV;
    let ok = true;
    wideBuild = true;
    try { for (const t of parts) {
      const ox = box.l - t.x, oy = box.t - t.y, or = t.x + t.w < box.w - 1e-6, ob = t.y + t.h < box.h - 1e-6, w = t.w + (or ? OV : 0), hh = t.h + (ob ? OV : 0);
      V.x += ox; V.y += oy;
      try {
        // The tissue (rimmed, by the shader), the vessels (one size for every tile, cropped), the ductules and the lymph, each drawn
        // on the GPU for this tile and laid in while its canvas still holds it. (A layer the GPU cannot draw drops the copy.)
        const tg = tissueGLOn();
        diveRim = rimOf(cx + ox, cy + oy, r); tissueKey = '';
        const onG = !!tg && paintTissue(w, hh, dpr, dark, cs, false, tg);
        // (The overlay first: in the vessels' own context it is laid over them as they are drawn, one canvas for both; and the
        // tissue drawn on the GPU under them there too (tisWide), when it is hosted.)
        fxGLKey = ''; fxArgs = null;
        const fxOn = fxOnGPU(w, hh, dpr, dark, 0, true), fxIn = fxOn && !!fxArgs, tisIn = onG && !!tisHostFor;
        tisWide = tisIn;
        drawKey = ''; drawnV.ok = false; drawGL(TW, TH, dpr, dark, cs, 0);
        // (Hosted: every layer is in the vessels' canvas now, laid by its present, and the tile is copied from it in the context.)
        if (hosted) ok = onG && tisIn && (fxIn || !fxOn) && (g.present(), wg.tile(t, Math.max(1, Math.round(w * dpr * res)), Math.max(1, Math.round(hh * dpr * res)), dpr * res, 'host'));
        else ok = onG && wg.tile(t, canvasPx(w, dpr), canvasPx(hh, dpr), dpr, [...(tisIn ? [] : [tissueG]), glCv, ...(fxIn || !fxOn ? [] : [fxG])]);
      } finally { V.x -= ox; V.y -= oy; }
      if (!ok) break;
    } } finally { wideBuild = false; fxArgs = null; tisWide = false; }
    diveRim = null;
    tissueKey = ''; drawKey = ''; glDirty = true; fxGLKey = ''; idleDrawn = '';
    if (!ok) { wg.release(); return null; }
    if (hosted) { wideA = 1; wideView = null; return { el: h('div'), gl: wg, host: true, tiles: [], box, soft: dpr < dpr0, W, H, dpr: dpr0 * res }; }
    Object.assign(wideCv.style, { visibility: 'hidden', opacity: '', transition: '' });
    if (wideCv.parentNode !== el) el.insertBefore(wideCv, leadersBox);
    return { el: wideCv, gl: wg, tiles: [], box, soft: dpr < dpr0, W, H, dpr: dpr0 };
  }
  function trimFieldStates() {
    free(worldOld); xfT0 = 0; surOld = null; surT0 = 0;
    const keys = [...tileSets.keys()];
    for (const key of keys.slice(0, -1)) { for (const q of tileSets.get(key)) { if (q.cv) free(q.cv); freeCopies(q); } tileSets.delete(key); }
    tissueGL?.sweep(); fieldGL?.sweep();   // (the GPU's copies of what was just given back)
  }
  let wideFadeT = 0;
  function dropWide(ease = false) {
    if (!wide) return;
    const w = wide; wide = null;
    for (const e of WIDE_HIDE) e.style.visibility = '';
    const gone = () => {
      wideGone = null; for (const cv of w.tiles) free(cv); w.gl?.release(); w.el.remove();
      // (Hosted: the vessels' canvas lays the landed layers again, at once.)
      if (w.host) { wideView = null; wideA = 1; idleDrawn = ''; if (gl && !gl.lost) gl.present(); wake(); }
    };
    clearTimeout(wideFadeT);
    if (w.host && ease && w.soft && !reduce.matches && wideView) {
      // (Hosted: laid over the landed layers at full size, fading out on the GPU over D_SMALL, as the CSS copy's opacity did.)
      wideGone = gone; wideView = { ...wideView, k: 1, x: 0, y: 0, tx: 0, ty: 0 };
      const t0 = performance.now();
      const step = () => { if (wideGone !== gone) return; wideA = Math.max(1e-3, 1 - smooth(0, 1, (performance.now() - t0) / D_SMALL)); if (gl && !gl.lost) gl.present(); if (wideA > 1e-3) nextFrame(step); };
      wideA = 0.999; step();
      wideFadeT = setTimeout(gone, D_SMALL + 40);
      return;
    }
    // (A copy drawn softer than the screen, past the budget, fades into the sharp layers below it rather than switching to them.)
    // (On the GPU it is drawn once more at full size, where the CSS copy's transform was cleared.)
    if (ease && w.soft && !reduce.matches) { wideGone = gone; if (w.gl) w.gl.draw(w.W, w.H, w.dpr, w.box, 1, 0, 0, 0, 0); w.el.style.transform = ''; w.el.style.transition = `opacity ${D_SMALL}ms var(--ease)`; w.el.style.opacity = '0'; wideFadeT = setTimeout(gone, D_SMALL + 40); }
    else gone();
  }
  // Out of a lobule framed zoomed in (a slide's station, or a hand's zoom) on a way that does not glide to the whole lobule first:
  // the same copy, built before the rise's clock starts, so the lobule shrinks whole rather than as the screen's rectangle.
  function stageRise() {
    if (wide || fade <= 0.98 || !model || reduce.matches) return;   // (reduced motion: the rise fades, no copy is needed)
    const [W, H] = hostSize(), box = padBox(W, H);
    if (!box) return;
    if (gliding) { cancelFrame(glide); gliding = false; camAim = null; }   // (the copy is of this framing: the view holds it)
    const wd = buildWide(W, H, box);
    idleDrawn = ''; draw(0); wide = wd;   // (the layers under the copy stay on the GPU; nothing reads them)
  }
  const apple = () => /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let geoW = -1, geoH = -1;
  function ensureGeo(W, H) {
    if (W === geoW && H === geoH) return;
    // Zoomed in, the spot at the middle of the free space, in lobule radii from its centre, and the zoom against the framing:
    // the lobule is built again for the new size, so the view keeps both (its screen numbers alone would show another spot).
    const keep = geo && !atFit && !camAim && !(aimed && fade <= 0.98) ? viewSpot() : null;
    geo = build(W, H); geoW = W; geoH = H; geoKey = W + 'x' + H; binKey = ''; binReach = []; binCache.clear(); radKey = []; radAll = ''; radCal = ''; tissueKey = ''; layoutKey = '';   // alloc-rare: only when the lobule's size changed (a new build), never a frame's own
    if (atFit || (aimed && fade <= 0.98)) resetView();
    else if (camAim) { kFit = fitV().k; Object.assign(camAim.to, framing(camAim.part, camAim.zoom)); }
    else if (keep) toSpot(keep);
    else clampV();
  }
  function viewSpot() {
    const f = freeRect(), wx = wX((f.l + f.r) / 2), wy = wY((f.t + f.b) / 2);
    return { u: (wx - geo.cx) / geo.R, v: (wy - geo.cy) / geo.R, z: V.k / (kFit || V.k) };   // alloc-rare: only when the lobule's size changed (a new build), never a frame's own
  }
  function toSpot(p) {
    const F0 = fitV(); kFit = F0.k;
    const f = freeRect(), k = clamp(kFit * p.z, kFit, kFit * KMAX), wx = geo.cx + p.u * geo.R, wy = geo.cy + p.v * geo.R;
    V.k = k; V.x = (f.l + f.r) / 2 - wx * k; V.y = (f.t + f.b) / 2 - wy * k;
    clampV();
  }
  // The lobule's size, kept and read again only when it may have changed: read on every frame, it laid the page out mid-frame.
  // A size change that lands after this frame's draw (a panel opening, the phone's toolbar) is drawn at once, before the screen shows it.
  // (Kept with the lobule's boxes, snap.hostWH: read by the ResizeObserver, a resize and the lobule opening, never in a frame.)
  const NO_SIZE = [1, 1];
  function hostSize() {
    return snap.hostWH || NO_SIZE;   // (read as the lobule is made, below snap, so never empty)
  }
  new ResizeObserver(() => {
    const was = snap.hostWH;
    if (readAll() && fade > 0) relayout();
    if (!was || fade <= 0 || !model) return;
    const [W, H] = snap.hostWH;
    if (W !== was[0] || H !== was[1]) { idleDrawn = ''; draw(0); }
  }).observe(host, { box: 'border-box' });
  const isDark = () => { const d = document.documentElement.dataset; return d.theme === 'dark' ? (d.palette || true) : (!d.theme && darkMQ.matches); };   // (truthy for every dark look; Navy and Black answer their name, so the caches below that hold `dark` in their keys repaint when the palette changes)

  // ── The dive's field ──
  // A flat-topped hexagonal tiling with the lobule view's own spacing (so the lobule it settles on, and
  // its six neighbours, land where the view draws them), as a repeating pattern. The tile is drawn once
  // per theme at sizes a factor of 2 apart, and the one at or just above the size on screen is used,
  // so the zoom stays sharp and never shimmers.
  const tileSets = new Map();   // field state → its tiles (a few kept, so a value hovering at a step does not redraw them)
  // The field mirrors the lobule's own state (rounded, so the tiles are redrawn only when it changes
  // visibly): septa and portal tracts thicken with fibrosis, bridging septa turn the lobules into
  // nodules in cirrhosis, the sinusoids pale as they capillarize, and congestion darkens zone 3.
  // (With some hysteresis: a value wavering on a step boundary must not flip between two sets of tiles, redrawing them mid-dive.)
  const fsLast = {};
  const fsQ = (k, x) => { const v = x || 0, o = fsLast[k]; return o !== undefined && Math.abs(v - o) < 0.09 ? o : (fsLast[k] = Math.round(v * 8) / 8); };
  // (Closed, the lobule's model is its last visit's, not this patient's: the field follows the latest frame instead.)
  let fsM = null, fsF, fsP, fsH, fsI;
  const closedModel = () => {
    const st = store.get(), p = st.params, hl = st.healthy, im = st.imaging;
    if (F !== fsF || p !== fsP || hl !== fsH || im !== fsI) { fsF = F; fsP = p; fsH = hl; fsI = im; fsM = lobuleStateInto(fsBuf, F, st, undefined, F.Pf || F.P); }   // alloc-rare: only when the frame or the patient's inputs changed
    return fsM;
  };
  // (One kept record, written in place: read at once by whoever asks, never held.)
  const fsOut = { su: 0, pre: 0, post: 0, sin: 0, cong: 0 };
  const fieldState = () => {
    const m = !unseen() && model ? model : F ? closedModel() : model;
    if (m) { fsOut.su = fsQ('su', m.septU); fsOut.pre = fsQ('pre', m.fibPre); fsOut.post = fsQ('post', m.fibPost); fsOut.sin = fsQ('sin', m.fibSin); fsOut.cong = fsQ('cong', m.congU); }
    else { fsOut.su = 0; fsOut.pre = 0; fsOut.post = 0; fsOut.sin = 0; fsOut.cong = 0; }
    return fsOut;
  };
  // The surround's grey. A lens other than Pressure greys the anatomy's organs (stage.js plateTargets); the neighbouring lobules, the dive's
  // field and the tissue round the open lobule take the same grey, so they match the liver they are zoomed into or out of (the lobule in
  // focus keeps its lens's colours). grey.k: 0 (the tiles as drawn) … 1 (the lens's grey liver), eased over the lens crossfade; it is
  // there at once while nothing of the surround is seen (a dive not yet begun, the lobule staged ahead). It grades the finished picture
  // (surroundGrade, in the shaders and the 2D passes), so a lens switch needs no new tiles.
  const grey = { k: 0, from: 0, to: 0, t0: 0 };
  const surroundSeen = () => !unseen() || fieldOp > 0.002;
  const greyNow = (now = performance.now()) => greyStep(grey, isGreyLens(lensModeOf(store.get())) ? 1 : 0, PACED ? easeNow() : now, LENS_FADE, !surroundSeen() || reduce.matches);
  const greyMoving = () => { greyNow(); return grey.k !== grey.to; };
  // later: the open lobule asks (#27). A tissue state that changes mid-animation (a time-lapse, a slide's morph) needs new tiles, each
  // tens of ms to draw: the open lobule keeps showing the last state's tile (its quiet surround changes slowly) while the new one is
  // drawn between frames, then redraws with it.
  let tileLater = null, tileLast = null, tileLaterRd = 0;
  // The tiles for a new look made in a timer task of their own (never in the frame that found them missing), then drawn.
  function tileLaterRun() {
    tileLater = null;
    if (fade <= 0) return;
    const t = fieldTile(getComputedStyle(host), isDark(), tileLaterRd);
    quietCopy(t, stageBg(getComputedStyle(host), isDark()));
    tissueKey = ''; drawVersion++; if (!raf) raf = nextFrame(loop);
  }
  // (A tile is a picture recorded for the GPU (paint-gl.js), painted into a texture by each context that draws it: there is no canvas the
  // browser can leave blank. A copy the GPU could not make is retried after TILE_RETRY ms, as before.)
  const TILE_RETRY = 250;
  const tileDue = (q) => !!q && !!q.blank && performance.now() >= q.blankAt + TILE_RETRY;
  // A tile's toned copies given back (quietG, liverG: tile-gl.js descriptions, whose textures each GPU context gives back at its next sweep).
  const freeCopies = (q) => { if (q.quietG) { free(q.quietG.cv); q.quietG = null; } if (q.liverG) { free(q.liverG.cv); q.liverG = null; } };
  // The copies the GPU draws from, made on the GPU itself (tile-gl.js): the neighbours' quiet copy (blurred, wrapping round the repeat,
  // drained and flattened toward the page) and the dive's liver-toned one, each a description each GPU context draws into its own
  // texture from the tile, once, with no blur in script and no canvas held for them. Remade when the tile was drawn again or the tone
  // changed. (The 2D copies and ?tilegpu=0 are gone, 1 Nov: nothing off the GPU.)
  function gpuCopy(t, slot, k, look) {
    const q = t[slot];
    if (q && q.k === k && q.cv.src === t.cv && q.cv.width) return q;
    if (q) { free(q.cv); fieldGL?.sweep(); tissueGL?.sweep(); }
    const blank = !t.cv || !t.cv.width || t.blank;
    return (t[slot] = { k, R: t.R, tw: t.tw, th: t.th, TW: t.TW, TH: t.TH, cv: tileCopy(t.cv, t.tw, t.th, look, blank), blank, blankAt: 0, bg: null });   // alloc-rare: only when the tile was drawn again or the surround's tone changed
  }
  // (The quiet copy stands while its tile and tone do: the tone compared as numbers, the text that names it made only when it is remade.)
  const quietCopy = (t, bg) => {
    const q = t.quietG;
    if (q && q.bg && q.bg.length === bg.length && q.cv.src === t.cv && q.cv.width) {
      let same = true;
      for (let i = 0; i < bg.length; i++) if (q.bg[i] !== bg[i]) { same = false; break; }
      if (same) return q;
    }
    const r = gpuCopy(t, 'quietG', bg.join(','), { blur: neighbourBlur(t.R), sat: 0.45, tone: bg, toneA: 0.42, flat: NEIGHBOUR_FLAT });   // alloc-rare: only when the tile was drawn again or the surround's tone changed
    r.bg = bg.slice();   // alloc-rare: only when the tile was drawn again or the surround's tone changed
    return r;
  };
  const liverCopy = (t, cs, dark, bg) => {
    const tone = liverTone(cs, bg);
    return gpuCopy(t, 'liverG', tone.map((x) => x.toFixed(2)).join(','), { blur: 0, sat: 0.45, tone, toneA: 0.42, flat: 0 });
  };
  // The tile look's inputs as last read (the four colours' text as the page gave it, the field state, the theme) and what they make: the colours
  // trimmed, and the key naming the tile set. Read from the page each time, compared in place, and made again only when one changed.
  const fcLook = { dark: null, raw: ['', '', '', ''], fs: [NaN, NaN, NaN, NaN, NaN], key: '', cell: undefined, gap: undefined, cvc: undefined, pvc: undefined };
  const FC_NAMES = ['--og-liver-1', '--og-liver-2', '--vein-systemic', '--vein-portal'];
  const cssTrim = (cs, n) => cs.getPropertyValue(n).trim() || undefined;   // alloc-rare: only when a tile is drawn, or its look changed (the trimmed text is a new string)
  function fieldLook(cs, dark, fs) {
    const L = fcLook, raw = L.raw, f = L.fs;
    let same = L.key !== '' && L.dark === dark && f[0] === fs.su && f[1] === fs.pre && f[2] === fs.post && f[3] === fs.sin && f[4] === fs.cong;
    for (let i = 0; i < 4; i++) { const r = cs.getPropertyValue(FC_NAMES[i]); if (r !== raw[i]) { raw[i] = r; same = false; } }
    if (!same) {
      L.dark = dark; f[0] = fs.su; f[1] = fs.pre; f[2] = fs.post; f[3] = fs.sin; f[4] = fs.cong;
      L.cell = raw[0].trim() || undefined; L.gap = raw[1].trim() || undefined; L.cvc = raw[2].trim() || undefined; L.pvc = raw[3].trim() || undefined;   // alloc-rare: only when the tile's look (a colour, the theme or the field state) changed
      L.key = [dark, L.cell, L.gap, L.cvc, L.pvc, Object.values(fs).join(',')].join('|');   // alloc-rare: only when the tile's look (a colour, the theme or the field state) changed
    }
    return L;
  }
  // The tile at or just above the size asked for (the largest when none is), and the nearest drawn one for a look that is still being drawn.
  const tileAt = (ts, rd) => { for (let i = 0; i < ts.length; i++) if (ts[i].R >= rd) return ts[i]; return ts[ts.length - 1]; };
  const tileDrawn = (ts, rd) => {
    for (let i = 0; i < ts.length; i++) if (ts[i].R >= rd && ts[i].cv) return ts[i];
    for (let i = ts.length - 1; i >= 0; i--) if (ts[i].cv) return ts[i];
    return undefined;
  };
  let tileLastObj = null, tileLru = null;
  function fieldTile(cs, dark, rd, later = false) {
    const fs = fieldState(), L = fieldLook(cs, dark, fs), key = L.key;
    if (later && tileLast && tileLast.key !== key && tileLast.dark === dark) {
      const ts = tileSets.get(key), ready = ts && tileAt(ts, rd);
      if (!ready?.cv) {
        if (!tileLater) { tileLaterRd = rd; tileLater = setTimeout(tileLaterRun, 0); }
        const old = tileSets.get(tileLast.key);
        const t = old && tileDrawn(old, rd);
        if (t) return t;
      }
    }
    if (later) {
      if (!tileLastObj) tileLastObj = { key, dark };   // alloc-once: the record is made with the first tile asked for later, then written in place
      else { tileLastObj.key = key; tileLastObj.dark = dark; }
      tileLast = tileLastObj;
    }
    let tiles = tileSets.get(key);
    if (!tiles) {
      tiles = FIELD_RS.map((R) => ({ R, cv: null, set: key })); tileSets.set(key, tiles);   // alloc-rare: only when a tile set for a new look is first asked for
      if (tileSets.size > 3) { const k0 = tileSets.keys().next().value; for (const q of tileSets.get(k0)) { if (q.cv) free(q.cv); freeCopies(q); } tileSets.delete(k0); }   // alloc-rare: only when a fourth tile set is made (zeroed: Safari frees a dropped canvas's memory late)
      tileLru = key;
    }
    else if (key !== tileLru) { tileSets.delete(key); tileSets.set(key, tiles); tileLru = key; }   // (the most recently asked kept last; a repeat of the same look moves nothing)
    const t = tileAt(tiles, rd);
    if (t.cv && tileDue(t)) { free(t.cv); t.cv = null; freeCopies(t); fieldGL?.sweep(); tissueGL?.sweep(); }
    if (!t.cv) framePart('lz.drawTile', () => drawTile(t, { cell: L.cell, gap: L.gap, cvc: L.cvc, pvc: L.pvc, art: cssTrim(cs, '--artery'), duct: cssTrim(cs, '--bile-duct'), dark, fs }));   // alloc-rare: only when the tile is not drawn yet (a new look, a theme change, a retry), never a frame that has it
    return t;
  }
  // Tissue, not a diagram: the repeat is two lobules wide and two high, and every corner of the
  // lattice is nudged by a hash of where it is (the same for the lobules that share it, and the
  // same across the repeat), so the outlines wander a little. Each lobule is filled warmer toward
  // its central vein, its septa are soft bands, its sinusoids gently curved, and a triad (venule,
  // arteriole, ductule) sits at each corner.
  function drawTile(t, { cell, gap, cvc, pvc, art, duct, dark, fs }) {
    const S3 = Math.sqrt(3), R = t.R;
    const hash = (i, j) => { let q = (i * 374761393 + j * 668265263) >>> 0; q = ((q ^ (q >>> 13)) * 1274126177) >>> 0; return (q >>> 8) / 16777216; };   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const COLa = cssRGB01('--lz-septum'), edges = new Set();   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const TW = 6 * R, TH = 2 * S3 * R, tw = Math.round(TW), th = Math.round(TH);
    // (Recorded as shapes and painted by the GPU, paint-gl.js: no 2D canvas.)
    const rec = recordPaint(tw, th, (c) => {   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    c.scale(tw / TW, th / TH);
    c.fillStyle = gap; c.fillRect(0, 0, TW, TH);
    // The corners of the lobule at the pattern's origin (where the lobule view draws its own lobule) stay
    // on the regular lattice, and their triads are the view's own, so none is drawn twice.
    const HOME = new Set(['2,0', '1,1', '11,1', '10,0', '11,3', '1,3']);   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const home = (ix, iy) => HOME.has(`${((ix % 12) + 12) % 12},${((iy % 4) + 4) % 4}`);   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    // A lattice point, nudged (ix, iy in half-R and half-height steps, wrapped to the repeat).
    const corner = (x, y) => {   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
      const ix = Math.round(x / (R / 2)), iy = Math.round(y / (S3 * R / 2));
      if (home(ix, iy)) return [x, y];
      const u = hash(((ix % 12) + 12) % 12, ((iy % 4) + 4) % 4), w = hash(((ix % 12) + 12) % 12 + 31, ((iy % 4) + 4) % 4 + 17);
      const a = u * TAU, m = 0.11 * R * (0.4 + 0.6 * w);
      return [x + Math.cos(a) * m, y + Math.sin(a) * m];
    };
    const lat = (q) => (((Math.round(q[0] / (R / 2)) % 12) + 12) % 12) * 4 + (((Math.round(q[1] / (S3 * R / 2)) % 4) + 4) % 4);   // wrapped lattice index   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const centres = [];   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    for (let i = -1; i <= 4; i++) for (let j = -1; j <= 2; j++) centres.push([1.5 * R * i, S3 * R * (j + (i & 1 ? 0.5 : 0))]);
    const lw = Math.max(0.6, R * 0.05), round = 1 + 0.6 * fs.su;   // nodules: rounder plates
    const Ps = centres.map(([x, y]) => Array.from({ length: 6 }, (_, i) => corner(x + Math.cos((i * Math.PI) / 3) * R, y + Math.sin((i * Math.PI) / 3) * R)));   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    // In three passes, so the septa lie over every plate and the triads and veins over the septa.
    for (const [ci, [x, y]] of centres.entries()) {
      const P = Ps[ci];
      // The plate: rounded corners (the path runs through the edges' midpoints), warmer inside.
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const A = P[i], B = P[(i + 1) % 6], C = P[(i + 2) % 6];
        const m1 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], m2 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
        const k = Math.min(1, round - 1), bx = B[0] + (x - B[0]) * 0.12 * k, by = B[1] + (y - B[1]) * 0.12 * k;
        if (!i) c.moveTo(m1[0], m1[1]);
        c.quadraticCurveTo(bx, by, m2[0], m2[1]);
      }
      c.closePath();
      const g = c.createRadialGradient(x, y, R * 0.05, x, y, R);
      g.addColorStop(0, gap); g.addColorStop(0.35, cell); g.addColorStop(1, cell);
      c.globalAlpha = 1; c.fillStyle = g; c.fill();
      c.save(); c.clip();
      // Congestion: zone 3 pooled with blood (nutmeg).
      if (fs.cong > 0) {
        const n = c.createRadialGradient(x, y, R * 0.08, x, y, R * (0.35 + 0.25 * fs.cong));
        n.addColorStop(0, tk('--lz-congestion', (0.55 * fs.cong).toFixed(3))); n.addColorStop(1, tk('--lz-congestion', 0));
        c.fillStyle = n; c.fillRect(x - R, y - R, 2 * R, 2 * R);
      }
      // Sinusoids: from each edge's portal side toward the central vein, each with a slight bend;
      // capillarized, they turn pale (in dark mode dark instead, so the lobules around the one in focus recede).
      c.strokeStyle = fs.sin > 0.2 ? tk('--lz-field-sin-pale') : gap; c.lineCap = 'round'; c.lineWidth = Math.max(0.5, R * (0.022 + 0.01 * fs.sin));
      for (let i = 0; i < 18; i++) {
        const k = Math.floor(i / 3), f = (i % 3 + 0.5) / 3, A = P[k], B = P[(k + 1) % 6];
        const sx = A[0] + (B[0] - A[0]) * f, sy = A[1] + (B[1] - A[1]) * f;
        const bend = (hash(i + 7, Math.round(x + y)) - 0.5) * 0.35 * R;
        const mx = (sx + x) / 2 + (y - sy) / R * bend * 0.6, my = (sy + y) / 2 + (sx - x) / R * bend * 0.6;
        c.globalAlpha = (dark ? 0.4 : 0.28) * (0.6 + 0.4 * hash(i, 3)) * (1 + 0.6 * fs.sin);
        c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, x, y); c.stroke();
      }
      c.restore();
      // Septa: soft bands along the borders; in cirrhosis, broad pale bands of collagen.
      c.lineJoin = 'round';
      c.globalAlpha = dark ? 0.5 : 0.38; c.strokeStyle = gap; c.lineWidth = lw * 1.6;
      c.beginPath(); P.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](q[0], q[1])); c.closePath(); c.stroke();
    }
    c.globalAlpha = 1;
    if (fs.su > 0) for (const [ci, [x, y]] of centres.entries()) {
      const P = Ps[ci];
      {
        // Each border is shared by two lobules: drawn once, the same from either side.
        const bw = R * (0.045 + 0.075 * fs.su), reach = Math.min(1, 0.3 + 2.4 * fs.su), det = R < 40 ? 0 : R < 120 ? 0.5 : 1;
        for (let k = 0; k < 6; k++) {
          let A = P[k], B = P[(k + 1) % 6], ka = lat(A), kb = lat(B);
          const key = Math.round(A[0] + B[0]) + ',' + Math.round(A[1] + B[1]);
          if (edges.has(key)) continue; edges.add(key);
          // Seeded and oriented by the wrapped lattice, so a band crossing the repeat matches its copy.
          if (ka > kb) { [A, B] = [B, A]; [ka, kb] = [kb, ka]; }
          const sd = ka * 48 + kb, o = { w: bw, rgb: COLa, a: 0.5 + 0.4 * fs.su, amp: R * 0.025, seed: sd, detail: det };
          if (reach >= 1) fibrousBand(c, A, B, o);
          else { const M = (t, U, Q) => [lerp(U[0], Q[0], t), lerp(U[1], Q[1], t)]; fibrousBand(c, A, M(reach / 2, A, B), { ...o, e1: 0.2 }); fibrousBand(c, B, M(reach / 2, B, A), { ...o, e1: 0.2, seed: sd + 1 }); }   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
        }
        // Portal-central bridges, late in cirrhosis.
        if (fs.su > 0.18) { const g = Math.min(1, (fs.su - 0.18) / 0.4);
          for (const k of [0, 2, 4]) fibrousBand(c, P[k], [lerp(P[k][0], x, 0.82), lerp(P[k][1], y, 0.82)], { w: bw * (0.6 + 0.3 * g), rgb: COLa, a: 0.4 + 0.45 * g, e1: 0.35, amp: R * 0.04, seed: 5000 + k * 97 + lat([x, y]), detail: det }); }
      }
    }
    for (const [ci, [x, y]] of centres.entries()) {
      const P = Ps[ci];
      // Central vein, with a soft rim (a collagen cuff with central fibrosis).
      if (fs.post > 0) {
        const growth = scarGrowth(fs.post), inner = R * 0.075 * (1 + 0.4 * fs.cong);
        c.globalAlpha = 1;
        fibrousCuff(c, x, y, inner, inner + R * 0.07 * (0.1 + 0.85 * growth), COLa, growth);
      }
      c.globalAlpha = 0.35; c.fillStyle = cvc; c.beginPath(); c.arc(x, y, R * 0.12, 0, TAU); c.fill();
      c.globalAlpha = 0.85; c.beginPath(); c.arc(x, y, R * 0.075 * (1 + 0.4 * fs.cong), 0, TAU); c.fill();
      // Triads, in a collagen tract that grows with portal fibrosis.
      for (const [px, py] of P) {
        if (home(Math.round(px / (R / 2)), Math.round(py / (S3 * R / 2)))) continue;
        if (fs.pre > 0) {
          c.globalAlpha = 1;
          fibrousTract(c, px, py, R * 0.09 * (0.8 + 0.18 * scarGrowth(fs.pre)), Math.atan2(py - y, px - x), COLa, scarGrowth(fs.pre), 700 + lat([px, py]), 0.35);
        }
        c.globalAlpha = 0.85; c.fillStyle = pvc; c.beginPath(); c.ellipse(px, py, R * 0.055, R * 0.04, 0.6, 0, TAU); c.fill();
        c.fillStyle = art; c.beginPath(); c.arc(px + R * 0.06, py - R * 0.035, R * 0.022, 0, TAU); c.fill();
        c.fillStyle = duct; c.beginPath(); c.arc(px - R * 0.05, py + R * 0.045, R * 0.018, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    });
    Object.assign(t, { tw, th, TW, TH, cv: gpuPicture(rec, ++texVer), blank: false, blankAt: 0 });   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
  }
  // The surround fading into the page with distance from the lobule (q: 0..1, how far it has faded).
  // The surround fades into the page (light in light mode, dark in dark mode).
  const shadeOf = (bg) => bg;
  // d: { a: opacity 0..1, x, y: where the settling lobule's centre is (stage px), r: its radius on
  // screen, ox, oy: the point it emerges from, quiet: 0..1, the surround drained as the lobule view's is,
  // focus: 0..1, the lobules away from it faded into the page }. null hides it.
  // What a dive's frames share (the stage's size, its styles), read once per dive: reading them each
  // frame, after the stage's own writes, would make the browser lay out the page again every frame.
  // (cs: the styles' values remembered as first read, so a frame never reads a live style after the stage's writes, which makes the
  // browser recompute the page's styles in the middle of the frame.)
  let diveCtx = null;
  const styleSnap = (cs) => { const m = new Map(); return { getPropertyValue: (n) => { let v = m.get(n); if (v === undefined) m.set(n, (v = cs.getPropertyValue(n))); return v; } }; };
  const fieldHide = (cv) => { if (cv.width) { cv.width = 0; cv.height = 0; } cv.style.opacity = '0'; };
  function paintField(d) {
    if (!d) diveCtx = null;
    if (!d || d.a <= 0.002) { fieldHide(field); fieldHide(fieldG); fieldOp = 0; if (shareTop && fieldWas > 0) shareTop.present(); fieldWas = 0; return; }
    if (!diveCtx) {
      const rect = host.getBoundingClientRect(), cs = getComputedStyle(host), dark = isDark();
      diveCtx = { W: Math.max(1, Math.round(rect.width)), H: Math.max(1, Math.round(rect.height)), cs: styleSnap(cs), dark, bg: stageBg(cs, dark) };
    }
    const { W, H, cs, dark, bg } = diveCtx;
    const dpr = Math.min(1, devicePixelRatio || 1) * 0.8;   // in motion and behind the lobule: a modest resolution is plenty
    // On the GPU (the same picture, its tile sizes blended). (No 2D field since 1 Nov: nothing off the GPU.)
    const g = fieldGLOn();
    const drew = g ? paintFieldGL(g, d, W, H, dpr, cs, dark, bg) : false;
    fieldHide(field);
    fieldOp = Math.min(1, d.a * 1.25);
    // (The GPU could not draw this frame (a tile's texture not taken yet; field-gl.js keeps the last frame where one shows, 'held', and
    // tries the send again shortly): its canvas keeps its last frame, at this frame's opacity, or, with none yet, the field waits for its
    // first GPU frame: the tiles go to the GPU ahead of the dive (fieldUp), so this is a frame or two at most. With no GPU for it at all
    // (no WebGL2, or the context lost), no field is drawn.)
    if (drew || fieldG.width) fieldG.style.opacity = fieldOp.toFixed(3);
    if (shareTop && (drew || fieldWas > 0)) shareTop.present();   // (hosted: the field is laid by the stage's present)
    fieldWas = fieldOp;
  }
  let fieldOp = 0;
  // The field's GPU drawing (field-gl.js): made the first time it is asked for (ahead of the first dive, by the idle preparation);
  // null where WebGL2 is missing, and set aside if its context is lost (no field is drawn until it is made again).
  function fieldGLOn() {
    if (fieldGL === undefined) { const ft = figureTop(); fieldGL = ft ? createFieldGL(fieldG, { host: ft }) : null; if (!fieldGL) fieldG.remove(); }
    return fieldGL && !fieldGL.lost ? fieldGL : null;
  }
  // A tile's liver-toned and quieted copies sent to the GPU ahead of the dive (no frame of it uploads a texture).
  // (Made on the GPU from the tile, tile-gl.js: the tile kept there for them is let go of once both are made.)
  const fieldUp = (t) => { const g = fieldGLOn(); if (!g) return; g.upload(t.liverG?.cv); g.upload(t.quietG?.cv); g.dropRaw(); };
  // A tile's two copies for the dive, ahead of it, made on the GPU.
  const fieldCopies = (t, cs, dark, bg) => { if (!fieldGLOn()) return; liverCopy(t, cs, dark, bg); quietCopy(t, shadeOf(bg, dark)); fieldUp(t); };
  // One frame of the field on the GPU, the same picture the 2D passes made (the same tiles, quieting, fade and emerging mask, with the
  // same numbers), except that the two tile sizes nearest the lobules' size on screen are blended (fieldBlend), so the detail of the
  // larger one comes in gradually as the lobules grow instead of in a step.
  function paintFieldGL(g, d, W, H, dpr, cs, dark, bg) {
    const fw = Math.round(W * dpr), fh = Math.round(H * dpr), rd = d.r * dpr;
    const { a, b, mix } = fieldBlend(rd * 0.55);   // (half the tile's resolution, as at rest)
    const ta = fieldTile(cs, dark, FIELD_RS[a]), tb = b !== a && mix > 0 ? fieldTile(cs, dark, FIELD_RS[b]) : null;
    const f = clamp(d.focus ?? d.quiet, 0, 1), fq = Math.max(f, d.quiet), fx0 = d.x * dpr, fy0 = d.y * dpr;
    const r0 = f > 0 ? Math.exp(lerp(Math.log(Math.hypot(W, H) * dpr * 0.45), Math.log(Math.min(Math.hypot(W, H) * dpr * 0.45, rd * 1.1)), f)) : 0;
    const r1 = fadeOuter(r0, Math.max(...[[0, 0], [fw, 0], [0, fh], [fw, fh]].map(([x, y]) => Math.hypot(x - fx0, y - fy0))));
    const q = d.quiet >= 1 ? 1 : Math.max(0, d.quiet || 0), tone = shadeOf(bg, dark);
    const rho = Math.hypot(W, H) * dpr * (0.2 + 1.1 * d.a + 2 * smooth(0.7, 1, d.a)), gk = greyNow();
    return g.draw({
      W: fw, H: fh, a: liverCopy(ta, cs, dark, bg).cv, b: tb ? liverCopy(tb, cs, dark, bg).cv : null,
      qa: q > 0 ? quietCopy(ta, tone).cv : null, qb: q > 0 && tb ? quietCopy(tb, tone).cv : null, mix: tb ? mix : 0, quiet: q,
      ox: fx0, oy: fy0, rd, fade: f > 0 ? [r0, r1, fq] : null, mid: FADE_MID, bg: tone, mask: d.a < 1 ? [d.ox * dpr, d.oy * dpr, rho] : null,
      dof: fieldDof(d, rd, Math.hypot(fw, fh)), grey: gk > 0 ? surroundGrade(gk) : null, hold: fieldG.style.opacity !== '0',
    });
  }
  // The liver's tone the dive starts from: the page's colour 60% of the way to the liver's.
  function liverTone(cs, bg) { const lv = rgb01(cs.getPropertyValue('--og-liver-2').trim()); return bg.map((x, i) => lerp(x, lv[i], 0.6)); }
  const stageBg = (cs, dark) => rgb01(cs.getPropertyValue('--stage-bg').trim() || cs.getPropertyValue('--bg').trim());
  // Ahead of any dive, while the anatomy sits idle: everything the dive and the lobule's first frame would
  // otherwise build mid-zoom (geometry, the vessels' WebGL, the field's tiles and their toned copies, the
  // tissue bitmap and a first full draw, which compiles the shaders and uploads the network), as pieces
  // the stage runs one per idle moment. Empty when nothing changed since the last preparation.
  let prepKey = '';
  function preparePieces() {
    if (fade > 0 || !F) return [];
    const rect = host.getBoundingClientRect(), W = Math.round(rect.width), H = Math.round(rect.height);
    if (W < 2 || H < 2) return [];
    const dark = isDark(), key = [W, H, dark, devicePixelRatio, zonesOn, lymphOn, Object.values(fieldState()).join(',')].join('|');
    if (key === prepKey) return [];
    let cs, land, bg;
    const q = [
      () => { cs = styles(); bg = stageBg(cs, dark); land = api.landing(); },   // (the stage's kept copy of its styles: no live read)
      () => ensureGL(),
      () => fieldGLOn(),   // (the field's GPU context, made here once, so the first dive does not compile its shader)
      () => tissueGLOn(),   // (and the tissue's)
      () => { if (FX_GPU) fxGLOn(); },   // (and the ductules' and lymph overlay's: its two programs compiled here, not in the dive's first frame)
      () => { if (WIDE_GL) wideGLOn(); },   // (and the wide copy's, for a station dive or a rise)
    ];
    // The dive's field: every tile it steps through on the way to the landing size (see paintField).
    const fdpr = Math.min(1, devicePixelRatio || 1) * 0.8;
    q.push(() => {
      const top = land.r * fdpr * 0.55;
      // (Each with its quieted copy too: the dive lays it over the field from midway, and building one there, a tile at a time,
      // snagged the zoom's last stretch.)
      // (One size past the landing's: the GPU field blends it in over the last stretch, fieldBlend.)
      for (let rd = 6; ; rd *= 2) { const r = rd; q.splice(q.indexOf(null), 0, () => { fieldCopies(fieldTile(cs, dark, r), cs, dark, bg); }); if (r >= top * 2) break; }
    }, null);
    q.push(() => {   // the landed lobule: its state, then the tissue, then one full frame
      const st = store.get();
      snapState();
      model = lobuleStateInto(modelBuf, F, st, undefined, F.Pf || F.P);
      const cv = (n, d) => cs.getPropertyValue(n).trim() || d;
      model.inks = { normal: cv('--flow-normal'), reversed: cv('--flow-reversed'), portal: cv('--vein-portal'), systemic: cv('--vein-systemic') };
      const dpr = Math.min(2, devicePixelRatio || 1);
      quietCopy(fieldTile(cs, dark, geo.R * V.k * dpr * 0.55), bg);
    }, () => {
      const dpr = Math.min(2, devicePixelRatio || 1), tg = gl && !gl.lost ? tissueGLOn() : null;
      if (tg) paintTissue(W, H, dpr, dark, cs, false, tg);
    }, () => prebin());
    // (The first frame waits, a piece at a time, for the binning the piece before sent to the worker.)
    const first = () => { if (binning) { q.unshift(first); return; } if (fade <= 0) { draw(0); release(); prepKey = key; } };
    q.push(first);
    return q;
  }
  // The landed lobule's vessels binned ahead of its first full frame, exactly as that frame's pass would bin them (drawGL), in the
  // stage's binning worker (sweep-worker.js) when there is one: their radii, reach and bins kept where it looks for them (radNow,
  // binReach, binCache), so it finds them made. (Start-up profile, 2 Nov 2026: that first frame, binning included, was the
  // preparation's longest task, about half a second headless; the binning alone a quarter of a second.) A binning that fails in the
  // worker is left to the frame, as before.
  let binning = null;
  function prebin() {
    if (fade > 0 || !model || !gl || gl.lost) return;
    const [W, H] = hostSize();
    ensureGeo(W, H);
    const G = geo, live = lymphOn ? G.tubes : G.bloodTubes, bk = lymphOn ? 'lymph' : 'blood';
    if (binCache.has(bk)) return;
    calibersChanged(rzOf(), G);
    for (const t of live) {
      t.maxR = maxOf(radiiNow(t));
      binReach[t.id] = Math.max(binReach[t.id] || 0, Math.ceil((t.maxR * 1.6 + (WALL[t.kind] || 0) + 10) / 2) * 2);
    }
    const ids = new Set(live.map((t) => t.id)), tubes = live.map((t) => ({ id: t.id, pts: t.pts, reach: binReach[t.id] })), joins = G.joins.filter((j) => j.members.every((id) => ids.has(id)));
    if (!binAway) { binCache.set(bk, binVeins(tubes, joins)); return; }
    const was = geo, job = binning = Promise.resolve().then(() => binAway(tubes, joins)).then((b) => { if (geo === was && b && !binCache.has(bk)) binCache.set(bk, b); }, () => {}).finally(() => { if (binning === job) binning = null; });
  }
  // Runs the pieces in order; a null is a placeholder that a piece fills in.
  function prepareRun(q) { while (q.length) { const f = q.shift(); if (f) { f(); return q.length > 0; } } return false; }
  // Before a dive: the work its frames would otherwise stall on, done a piece per frame while the
  // anatomy is still only being magnified (the vessels' WebGL, then the field's tiles up to the size
  // the dive ends at). warm() does the next piece; true while any is left.
  let warmQ = [];
  function prewarm(rEnd) {
    const cs = getComputedStyle(host), dark = isDark(), bg = stageBg(cs, dark), top = rEnd * Math.min(1, devicePixelRatio || 1) * 0.8 * 0.55;
    warmQ = [() => ensureGL(), () => fieldGLOn(), () => { if (FX_GPU) fxGLOn(); }, () => { if (WIDE_GL) wideGLOn(); }];   // (the field's GPU context too, if the idle preparation has not made it)
    // The tiles paintField steps through (each a no-op when the idle preparation already drew it).
    for (let rd = 6; ; rd *= 2) { const r = rd; warmQ.push(() => { fieldCopies(fieldTile(cs, dark, r), cs, dark, bg); }); if (r >= top * 2) break; }
  }
  // Right before a zoom into the lobule starts: the lobule is drawn, whole and unseen, for the framing it will land on (flow marks
  // faded), so the zoom only magnifies and fades in what is already drawn. Its canvases (about 16 MB on a phone) are given back
  // when the zoom returns to the anatomy (setDiveZoom), and drawn again before the next one.
  function stage() {
    while (warm());   // the dive's field tiles (built ahead while idle, so usually nothing left), the vessels' WebGL
    if (fade > 0 || !F) return;
    flowA = 0; flowT = 0; resetView(); staging = true; snapState();
    try { update(F); } finally { staging = false; }
    if (!model) return;
    dropWide();
    // (Aimed at a station: the whole lobule's copy for the zoom, built first; the layers are then drawn for the screen.)
    // (Reduced motion: the dive fades, nothing is magnified, so no copy: it was built and freed in the same moment.)
    const [W, H] = hostSize(), box = reduce.matches ? null : padBox(W, H), wd = box ? buildWide(W, H, box) : null;
    // (The tissue drawn on the GPU now, unseen, with the rim the dive will scale it down with (setDiveZoom, about the landing), so the
    // zoom's first frame has nothing to draw. Landed, it is drawn once more without the rim.)
    if (!wd && !reduce.matches && geo) diveRim = rimOf(sX(geo.cx), sY(geo.cy), geo.R * V.k);
    idleDrawn = ''; draw(0); diveDrawn = true; staged = api.viewKey(); relLater = true; wide = wd;
    // (The landing frame sends the bitmap to the GPU itself (tissueOnGPU), not this staging: a send here showed the lobule's tissue
    // black on a Mac while zooming into it, until a pan, 1 Nov 2026.)
  }
  function warm() { const f = warmQ.shift(); if (f) f(); return warmQ.length > 0; }
  // Before a dive (stage.js setLobule): a new patient's tissue picture, which stage() would otherwise record in the frame the zoom
  // starts, is recorded here first (paint-gl.js: its shapes only; the GPU paints it when it is first drawn), for the view and the
  // model stage() then sets the same way. Null when there is nothing to wait for (recorded already, no GPU, the lobule showing); else
  // a promise that resolves once it is in. Never rejects. Nothing is seen meanwhile: the lobule is not showing.
  function paintAhead() {
    if (fade > 0 || !F || !geo || !tissueGLOn()) return null;
    const [W, H] = hostSize();
    ensureGeo(W, H);
    resetView(); staging = true; snapState();
    try { update(F); } finally { staging = false; }
    const G = geo, m = model;
    if (!G || !m) return null;
    const dark = isDark(), cs = styles(), dpr = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * lzScale();   // (draw's own)
    const sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * V.k)) * 2) / 2), worldCap(G, dpr)), ws = worldStateOf(m, G, dark, cs), wk = wkOf(sc, ws);
    if (wk === worldKey) return null;
    return new Promise((done) => setTimeout(() => {
      // (In a task of its own, not a frame: as paintTissue would, with the last state's picture given back, nothing showing to fade.)
      if (fade <= 0 && geo === G && worldKey !== wk) {
        free(worldCv); free(worldOld); xfT0 = 0;
        worldKey = wk; worldState = ws; worldSc = sc; worldGeo = G; worldDraws++;
        worldCv = paintWorld(sc, m, G, dark, cs);
        tissueGL?.sweep();
      }
      done();
    }, 0));
  }


  // Lumen radius of a tube at sample i (world px), from the model.
  // The few model values the calibers follow, eased toward the model's every display frame (~0.3 s), so a
  // vessel widens or narrows smoothly instead of stepping with each model update.
  let rz = null, rzMoving = false;
  // (The model's values now, written in place into the target record each frame; the eased ones are a record of their own.)
  const rzTg = { sin: 0, congU: 0, fibPre: 0, fibPost: 0, art: 0, lr: 0 };
  const rzFill = (o, m) => { o.sin = m.zone.sin; o.congU = m.congU; o.fibPre = m.fibPre; o.fibPost = m.fibPost; o.art = m.art; o.lr = lymphRate(m); return o; };
  const rzOf = () => rz || (rz = rzFill({ sin: 0, congU: 0, fibPre: 0, fibPost: 0, art: 0, lr: 0 }, model));   // alloc-once: the eased values are made with the first reading, and again after a reset
  function easeRadii(dt) {
    const tg = rzFill(rzTg, model);
    if (!rz) { rzOf(); return false; }
    const k = -Math.expm1(-dt / 0.3);
    let mv = false;
    for (const key in tg) {
      const d = tg[key] - rz[key];
      if (Math.abs(d) > 2e-4 * (1 + Math.abs(tg[key]))) { rz[key] += d * k; mv = true; } else rz[key] = tg[key];
    }
    return mv;
  }
  function radiusAt(t, i) {
    const m = rzOf(), g = geo, R = g.R;
    const z3 = 1 - smooth(0.24, 0.56, t.rho[i]);
    const rs = g.rs0 * SIN_NARROW / m.sin ** 0.12 * (1 + 1.5 * m.congU * z3);
    switch (t.kind) {
      case 's0': return rs;
      case 's1': return rs * 1.15;
      case 's2': return rs * 1.3;
      case 'an': return rs * 0.68;
      case 'in': return lerp(R * 0.015, R * 0.009, i / (N - 1)) / (1 + 0.45 * m.fibPre);
      case 'pv': return R * 0.042 / (1 + 0.35 * m.fibPre);
      case 'cv': return R * (0.07 + 0.05 * m.congU) * (1 - 0.3 * m.fibPost);
      case 'ha': return Math.max(1.6, R * 0.014 * clamp(m.art, 0.6, 2.2) ** 0.3);
      case 'bd': return Math.max(1.6, R * 0.0145);
      case 'tw': return Math.max(1.1, R * 0.0055 * clamp(m.art, 0.6, 2.2) ** 0.3);
      // Lymphatics widen as drainage rises (capped, so the tract lymphatic never swamps the triad).
      case 'ly': return Math.max(1.1, g.rs0 * 0.5 * lyWr(m.lr, 0.45)) * lyTaper(t.rho[i]);   // the space of Disse fills and widens; tapers toward the central vein
      case 'lt': return Math.max(1.5, R * 0.0075 * lyWr(m.lr, 0.4));
      case 'lv': return R * 0.016 * lyWr(m.lr, 0.4);
      default: return rs;
    }
  }
  // The space of Disse narrows to nothing as it nears the central vein.
  const lyTaper = (rho) => 0.06 + 0.94 * smooth(0.13, 0.42, rho);
  // Lymphatic caliber against the healthy flow: 1 at a normal rate, up to 1 + k at four times it.
  const lyWr = (lr, k) => 1 + k * smooth(1, 4, lr) - 0.12 * (1 - smooth(0.3, 1, lr));
  // Lymph as the sinusoids filter it: f, how hard (0 at the healthy rate, 1 at four times it); over, how far
  // past what the lymphatics can carry (the rest weeps off the liver: ascites); and its protein, rich
  // where the fenestrae stay open (congestion behind the sinusoids), thin where collagen lines the
  // space of Disse (capillarized sinusoids in cirrhosis). Protein, from the engine's sieving (lymph about
  // 88 % of plasma in a normal liver, about 50 % once capillarized), shows as the green's depth, the
  // albumin beads in each drop and, once capillarized, a collagen line along the sinusoids.
  const lyF = (m) => smooth(1, 4, lymphRate(m));
  const lyProt = (m) => clamp((m.lyProt - 0.42) / 0.42, 0, 1);
  // (The lymph's colour at three depths of protein, light and dark; written into the caller's own triple.)
  const LY_LIGHT = { lo: [0.92, 0.94, 0.88], mid: [0.88, 0.92, 0.82], hi: [0.82, 0.89, 0.74] }, LY_DARK = { lo: [0.72, 0.76, 0.69], mid: [0.7, 0.77, 0.66], hi: [0.64, 0.75, 0.58] };
  function lyInkInto(out, m, dark) {
    const p = lyProt(m), c = dark ? LY_DARK : LY_LIGHT;
    if (p < 0.45) { const u = p / 0.45; for (let i = 0; i < 3; i++) out[i] = lerp(c.lo[i], c.mid[i], u); }
    else { const u = (p - 0.45) / 0.55; for (let i = 0; i < 3; i++) out[i] = lerp(c.mid[i], c.hi[i], u); }
    return out;
  }
  const LY_TMP = [0, 0, 0];   // (the lymph's colour, written in place for each drawGL pass to read at once)
  // The triad's outlines: dark blue, red and green (the venule, arteriole and ductule), against the common casing.
  const EDGE = { pv: [0.12, 0.27, 0.58], in: [0.12, 0.27, 0.58], ha: [0.55, 0.1, 0.16], tw: [0.55, 0.1, 0.16], bd: [0.27, 0.29, 0.12] }, BD_FILL = [0.48, 0.5, 0.24];   // bile: a dark, dull olive
  // Radius (in lobule radii) inside which the sinusoid outlines stop: the central vein's edge.
  const CV_STOP = 0.14;
  const WALL = { s0: 0.8, s1: 0.85, s2: 0.9, an: 0.7, in: 1.5, pv: 2, cv: 1.6, sh: 1.1, ha: 1.7, bd: 1.8, tw: 0.9, ly: 0.5, lt: 0.8, lv: 1.1 };
  // Weight of the inlet's value at a radius along the sinusoids (1 at the lobule's edge, 0 at the central vein).
  const sinW = (rho) => clamp((rho - 0.075) / (0.92 - 0.075), 0, 1) ** 0.8;
  const qP = (v) => Math.round(v * 2) / 2;
  /**
   * A lumen's color in the active lens, as the anatomy colors the vessel it stands for. `seg`: pv,
   * in (inlet venule), sin (sinusoids and anastomoses) or cv; `w`: along an inlet 0 → 1, along the
   * sinusoids the inlet's weight (sinW).
   */
  function ink(seg, w = 0) {
    const k = lensK();
    if (k >= 1) return inkOf(model.mode, seg, w);
    return css(inkRGBInto(INK_TMP, seg, w, k));
  }
  const INK_TMP = [0, 0, 0], NEUTRAL_TMP = [0, 0, 0], VEL_RANGE = [1 / 1.5, 1.5], OXY_FULL = [1, 1, 1];
  // The same as [r, g, b] 0–1 in the caller's own triple; mid-switch, the old lens's color eased into the new one's (k: 0 … 1).
  function inkRGBInto(out, seg, w = 0, k = lensK()) {
    const M = model.mode, to = M === 'origin' ? ORIGIN_RGB : rgb01(inkOf(M, seg, w));
    if (k >= 1) { out[0] = to[0]; out[1] = to[1]; out[2] = to[2]; return out; }
    return inkMix(out, to, seg, w, k);
  }
  function inkMix(out, to, seg, w, k) {
    const from = lensFrom === 'origin' ? ORIGIN_RGB : rgb01(inkOf(lensFrom, seg, w));
    for (let i = 0; i < 3; i++) out[i] = from[i] + (to[i] - from[i]) * k;
    return out;
  }
  function inkOf(M, seg, w) {
    const m = model;
    // ('since': a slide's Change colours, the same scale as 'delta', counted from the slide's own reference: lobule-model.js m.dP.)
    if (M === 'pressure' || M === 'delta' || M === 'since' || M === 'heat') {
      const V = M === 'pressure' ? null : m.dP, v0 = V ? V[0] : qP(m.P1), v1 = V ? V[1] : qP(m.P2), v2 = V ? V[2] : qP(m.P3);
      const v = seg === 'pv' ? v0 : seg === 'in' ? lerp(v0, v1, 0.6 * w) : seg === 'cv' ? v2 : v2 + (v1 - v2) * w;
      return M === 'pressure' ? pressureColor(qP(v)) : M === 'heat' ? heatColor(qP(v)) : deltaColor(qP(v));
    }
    if (M === 'oxygen') {
      const [a, b, c] = m.oxy || OXY_FULL;
      return oxygenColor(seg === 'pv' ? a : seg === 'in' ? lerp(a, b, w) : seg === 'cv' ? c : c + (b - c) * w);
    }
    const e = seg === 'sin' ? 'sin' : seg === 'cv' ? 'post' : 'pre';
    switch (M) {
      case 'drop': return dropColor(e === 'pre' ? m.P1 - m.P2 : e === 'sin' ? m.P2 - m.P3 : m.P3 - m.P4);
      case 'direction': return m.rev[e] ? m.inks.reversed : m.inks.normal;
      case 'flow': return flowColor(Math.abs(m.Qs[e]) * 0.06);
      // Velocity against the healthy liver's own beds (no Doppler range covers them): normal from two-thirds to one and
      // a half times the healthy flow, as the anatomy colors its veins without a published range (velNormal.js).
      case 'velocity': return velocityColor(Math.abs(m.Qs[e]) / Math.max(1e-6, Math.abs(m.Q0[e] ?? m.Qs[e])), VEL_RANGE);
      case 'neutral': {
        const a = rgb01(m.inks.portal), b = rgb01(m.inks.systemic), k = seg === 'cv' ? 1 : seg === 'sin' ? 1 - w : 0;
        for (let i = 0; i < 3; i++) NEUTRAL_TMP[i] = lerp(a[i], b[i], k);
        return css(NEUTRAL_TMP);
      }
      default: return pressureColor(seg === 'pv' || seg === 'in' ? m.P1 : seg === 'cv' ? m.P3 : m.P3 + (m.P2 - m.P3) * w);
    }
  }
  const segOf = (t) => (t.kind === 'pv' || t.kind === 'in' || t.kind === 'cv' ? t.kind : 'sin');
  const tubeW = (t, end) => { const sg = segOf(t); return sg === 'sin' ? sinW(t.rho[end ? N - 1 : 0]) : end ? 1 : 0; };
  // Capillarized sinusoids are drawn duller as fibSin rises (G21): drained toward the lobule's shade, never brighter.
  // (From the eased sinusoidal resistance, so a new patient's sinusoids dull gradually, as their calibers change.)
  const sinFib = () => clamp(Math.log(rzOf().sin) / 3.2, 0, 1);
  const sinDull = (rgb) => { const f = sinFib(); return f > 0 ? dullSinusoidInto(rgb, rgb, cssRGB01('--lz-shade'), f) : rgb; };   // (the kept triple dulled in place)
  const TUBE_TMP = [0, 0, 0];   // (a vessel end's colour, written in place and read at once by drawGL)
  const tubeRGB = (t, end, k) => { const c = inkRGBInto(TUBE_TMP, segOf(t), tubeW(t, end), k); return segOf(t) === 'sin' ? sinDull(c) : c; };
  // A "Colored by" switch crossfades the lobule's vessels over a surface step (420 ms), on the quintic, as the anatomy's do (stage.js LENS_FADE).
  // lensFrom: the lens they are leaving, null when no switch is under way.
  const LENS_FADE = D_SURFACE, ORIGIN_RGB = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];
  let lensFrom = null, lensT0 = 0, lensMode = null;
  function noteLens(M) {
    if (lensMode !== null && M !== lensMode && fade > 0.98 && !reduce.matches) {
      // (A switch mid-fade starts from the colour now shown: near the end it is the new lens, otherwise the one it left.)
      if (!lensFrom || lensK() >= 0.5) lensFrom = lensMode;
      lensT0 = PACED ? easeNow() : performance.now();   // (the eases' clock, frame.js easeNow, as the tissue's crossfades)
    } else if (fade <= 0.98) lensFrom = null;
    lensMode = M;
  }
  function lensK() {
    if (!lensFrom) return 1;
    const u = ((PACED ? easeNow() : performance.now()) - lensT0) / LENS_FADE;
    if (u >= 1 || lensFrom === model.mode) { lensFrom = null; return 1; }
    return easeMove(u);
  }

  // What drawGL keeps between frames, so a frame allocates none of it:
  // the figure's transform, two arrays in turn (veins-gl keeps the last matrix given to draw() as its baseM and compares the next with
  // it, so the one it holds is never written again: tLast is the one handed to draw() last, the next frame writes the other);
  // the transform and size the picture was last drawn at, as whole hundredths (drawKey is '' for none, 'v' once drawn);
  // what the last surface pass was made for (sVer: NaN for none); the calibers and size the radii were last worked out for.
  const DRAW_T = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], dT = [0, 0, 0, 0, 0, 0], rowsBuf = [];
  let tLast = 0, dW = 0, dH = 0;
  let sVer = NaN, sDark = null, sCw = 0, sCh = 0, sK = 0;
  const calV = [];
  let calN = 0, calW = 0, calH = 0, calLy = false, radAllK = 0, radStamp = 0;
  const radNow = [], radNowAt = [], radKeep = [];   // (per tube id: its radii at the samples, the stamp of the calibers they were worked out for, the radii as last sent)
  const inkNow = new Float64Array(MAXT * 6);   // (each vessel's two end colours this pass, in live order, 3 numbers each)
  // (style: the lobule's streaks are blood look D, as the anatomy's: the baked tile read twice a pixel, blood-tile.js; Mohammad, 5 Nov 2026.)
  const bloodArg = { alpha: 0, on: false, chev: false, look: '', origin: false, clock: 0, style: STYLE_D, dye: false, bleed: [], vdpr: 1, originCol: null, dyeCol: null, inkLight: null, inkDark: null, revCol: null, chevInk: null, chevLight: null };
  const selWas = [];   // (the ids of the selection the attributes were last made for)
  let artRaw = null, artRGB = null, akMode = null, akHide = false, akOrigin = false, akLymph = false, akP = 0, akF = 0, akDark = null, akArt = '';
  const LYD = [0, 0, 0], DISSE_DEEP = [0.79, 0.86, 0.74], DISSE_DEEP_DARK = [0.62, 0.7, 0.58];
  const NO_BLOOD = Object.freeze({});
  const Z_OF = { s0: 0.1, s1: 0.11, s2: 0.12, ly: 0.13, an: 0.09, lt: 0.25, in: 0.3, pv: 0.4, cv: 0.4, lv: 0.8, sh: 0.5, bd: 0.55, tw: 0.6, ha: 0.7 };
  // The picture is drawn again when its size or transform moved a hundredth of a pixel (the same comparison as the string it replaces).
  const drawSame = (cw, ch, T) => {
    if (drawKey === '' || cw !== dW || ch !== dH) return false;
    for (let i = 0; i < 6; i++) if (Math.round(T[i] * 100) !== dT[i]) return false;
    return true;
  };
  // True when the calibers (the eased values rz), the lobule's size or the layer differ from the last time asked; kept as numbers to 4 decimals.
  function calibersChanged(rz, G) {
    let same = radCal !== '' && calW === G.W && calH === G.H && calLy === lymphOn, i = 0;
    for (const key in rz) { const q = Math.round(rz[key] * 1e4); if (!Object.is(calV[i], q)) { same = false; calV[i] = q; } i++; }
    if (calN !== i) { same = false; calN = i; }
    calW = G.W; calH = G.H; calLy = lymphOn;
    if (same) return false;
    radCal = 'y'; radStamp++;
    return true;
  }
  // The selection's ids against those the attributes were last made for (in the set's order, as the string it replaces joined them).
  function selMoved(ids) {
    let same = selWas.length === ids.size, i = 0;
    for (const id of ids) { if (selWas[i] !== id) { same = false; selWas[i] = id; } i++; }
    selWas.length = i;
    return !same;
  }
  // The vessels changed since the layer was drawn, as a kept array (veins-gl reads it within the call).
  const rowsOf = () => { rowsBuf.length = 0; for (const r of glRows) rowsBuf.push(r); return rowsBuf; };
  const noteDrawn = (cw, ch, T) => { dW = cw; dH = ch; for (let i = 0; i < 6; i++) dT[i] = Math.round(T[i] * 100); drawKey = 'v'; };
  // A vessel's radii at its samples for the calibers now (kept per vessel; worked out again only after calibersChanged said so).
  function radiiNow(t) {
    let r = radNow[t.id];
    if (!r) r = radNow[t.id] = new Float64Array(N);   // alloc-once: a vessel's first pass; the arrays are kept for the renderer's life
    if (radNowAt[t.id] !== radStamp) { for (let i = 0; i < N; i++) r[i] = radiusAt(t, i); radNowAt[t.id] = radStamp; }
    return r;
  }
  const maxOf = (r) => { let mx = -Infinity; for (let i = 0; i < r.length; i++) mx = Math.max(mx, r[i]); return mx; };
  const put3 = (o, c, so = 0) => { tubeData[o] = c[so]; tubeData[o + 1] = c[so + 1]; tubeData[o + 2] = c[so + 2]; };
  function drawGL(W, H, dpr, dark, cs, dt) {
    const g = gl, G = geo, m = model;
    const res = g.software ? 0.5 : 1, k = dpr * res;
    const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
    shW = W;
    if (glCv.width !== cw || glCv.height !== ch) { glCv.width = cw; glCv.height = ch; glDirty = true; }
    const live = lymphOn ? G.tubes : G.bloodTubes;
    const T = DRAW_T[tLast ^ 1];
    T[0] = k * V.k; T[3] = k * V.k; T[4] = k * V.x; T[5] = k * V.y;   // (T[1], T[2] stay 0)
    const dSame = drawSame(cw, ch, T);
    const bk = lymphOn ? 'lymph' : 'blood';
    const now = performance.now();
    const origin = originOn();
    // The flow pass stays at display speed. Shapes and colors need at most 12.5 updates/s;
    // interactions and newly enabled layers refresh immediately.
    // Paused (dt 0), a pass is due only when something it reads changed: the model or the store (drawVersion less the camera's own bumps), the
    // theme or the styles' copy, the canvas's size, or the scale (the radii's tolerance follows it, never where the figure is). A pan alone
    // sends no colour, radius or flow, and the pass looks again every second in case a change came by a path that bumped none of them.
    // Running, nothing changes: every frame of a moving camera still takes the pass, as before.
    const ver = drawVersion - viewBumps, kq = Math.round(k * V.k * 1000);   // (the scale to a thousandth)
    const surfSame = ver === sVer && dark === sDark && cw === sCw && ch === sCh;
    const panOnly = dt === 0 && !rzMoving && !lensFrom && !!attrKey && !!radAll && bk === binKey && surfSame && kq === sK && cs === surfCs && now - lastSurface < 1000;
    if (panOnly && gpuProbe.on) gpuProbe.note(COUNTED.lobuleSkip);
    // (A running camera's matrix change alone is not a reason for the pass: the
    // radii, colours and attribute maps follow the model, the lens and the calibers, never where the figure sits; the pass still
    // comes every 80 ms while running, which also re-checks the zoom's radius tolerance, and the draw below moves the layer.)
    const camDue = cs !== surfCs || !surfSame;
    if (!panOnly && (dt === 0 || rzMoving || lensFrom || !attrKey || !radAll || bk !== binKey || camDue || now - lastSurface >= 80)) {
      lastSurface = now; sVer = ver; sDark = dark; sCw = cw; sCh = ch; sK = kq; surfCs = cs;
      if (gpuProbe.on) gpuProbe.note(COUNTED.lobuleSurface);
      // Radii, re-sent when a tube's caliber changed (they follow only these few model values).
      let reachGrew = false;
      // (A tube's radii follow only its calibers, not the zoom: worked out again only when those change (the calibers, the lobule's size
      // and the layer to 4 decimals: calibersChanged). The zoom sets only how small a change is still sent, so a zoom frame compares
      // the kept radii with what was sent.)
      const calCh = calibersChanged(rzOf(), G);
      if (calCh || !radAll || kq !== radAllK) for (const t of live) {
        const r = radiiNow(t);
        t.maxR = maxOf(r);
        // (A vessel's new radii change only the cells that list it, as a colour change does: those cells alone are drawn
        // again, or the layer moved on a pan, never the whole layer for it. A reach that outgrows its cells re-bins below.)
        if (radiiChanged(radKey[t.id], r, (rzMoving ? 0.08 : 0.35) / (k * V.k))) {
          let sent = radKeep[t.id];
          if (!sent) sent = radKeep[t.id] = new Float64Array(N);   // alloc-once: a vessel's first send; kept, and written in place after
          sent.set(r); radKey[t.id] = sent; g.setRadii(t.id, sent); glRows.add(t.id);
        }
        const reach = Math.ceil((t.maxR + (WALL[t.kind] || 0) + 10) / 2) * 2;
        if (reach > (binReach[t.id] || 0)) reachGrew = true;
      }
      radAll = 'y'; radAllK = kq;
      if (reachGrew) binCache.clear();
      if (bk !== binKey || reachGrew) {
        binKey = bk;
        for (const t of live) binReach[t.id] = Math.max(binReach[t.id] || 0, Math.ceil((t.maxR * 1.6 + (WALL[t.kind] || 0) + 10) / 2) * 2);
        let bins = binCache.get(bk);
        if (!bins) {
          const ids = new Set(live.map((t) => t.id));   // alloc-rare: only when this layer's bins are not cached yet (first use of the blood or the lymph layer, or a vessel's reach outgrew its cells)
          bins = binVeins(live.map((t) => ({ id: t.id, pts: t.pts, reach: binReach[t.id] })), G.joins.filter((j) => j.members.every((id) => ids.has(id))));   // alloc-rare: same branch, bins not cached
          binCache.set(bk, bins);
        }
        g.setGeometry(bins);
        glDirty = true;
      }
      // Attributes, re-sent when they change (pressures in half-mmHg steps).
      const selIdsN = selIds();
      const lk = lensK();
      // (The inks, about 1,700 numbers, kept in live order and compared to a thousandth as numbers, not built into a string on every pan or zoom frame.)
      let inkMoved = false, n = 0;
      for (let p = 0; p < live.length; p++) {
        for (let e = 0; e < 2; e++) {
          const c = tubeRGB(live[p], e, lk);
          for (let j = 0; j < 3; j++) { const x = c[j]; inkNow[n] = x; const q = Math.round(x * 1000); if (inkWas[n] !== q) { inkMoved = true; inkWas[n] = q; } n++; }
        }
      }
      if (inkWas.length !== n) { inkWas.length = n; inkMoved = true; }
      // (What the attributes are made from, compared as it stands: the mode, the layers, the lymph's protein and filtration to a hundredth,
      // the selection's ids and the artery's colour; attrKey is '' until they have been made once, and is cleared to make them again.)
      const lyPq = Math.round(lyProt(m) * 100), lyFq = Math.round(lyF(m) * 100), artNow = cs.getPropertyValue('--artery'), selCh = selMoved(selIdsN);
      const akSame = attrKey !== '' && akMode === m.mode && akHide === m.hide && akOrigin === origin && akLymph === lymphOn && akP === lyPq && akF === lyFq && akDark === dark && akArt === artNow && !selCh;
      if (inkMoved || !akSame) {
        attrKey = 'y'; akMode = m.mode; akHide = m.hide; akOrigin = origin; akLymph = lymphOn; akP = lyPq; akF = lyFq; akDark = dark; akArt = artNow;
        tubeData.fill(0);
        if (artNow !== artRaw) { artRaw = artNow; artRGB = rgb01(artNow.trim()); }   // alloc-rare: only when the artery's colour token changed (a theme or palette change)
        const art = artRGB;
        // (The lymph's two inks only where its vessels are drawn: the lymph layer.)
        let LY = null;
        if (lymphOn) {
          LY = lyInkInto(LY_TMP, m, dark);   // lymph: clear, a faint green (paler than the bile duct), deeper with more protein
          // The space of Disse fills as filtration rises: its tint deepens a little (it already widens).
          const deep = dark ? DISSE_DEEP_DARK : DISSE_DEEP, f = 0.45 * lyF(m);
          for (let i = 0; i < 3; i++) LYD[i] = lerp(LY[i], deep[i], f);
        }
        const greyed = origin && lk >= 1;
        for (let p = 0; p < live.length; p++) {
          const t = live[p];
          const o = t.id * TUBE_TEXELS * 4, isArt = t.kind === 'ha' || t.kind === 'tw', isBd = t.kind === 'bd';
          const alpha = (isArt ? 0.9 : 1) * (selIdsN.size && !selIdsN.has(t.id) ? 0.55 : 1);
          const big = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'in';
          // The triad's three vessels carry a dark outline of their own colour; the rest the common casing.
          const edge = EDGE[t.kind];
          // The central vein and the portal venule are drawn flat (no light or dark line): on their round ends they read as stray arcs.
          const flags = (selIdsN.has(t.id) ? F_SEL : 0) | (edge ? F_EDGE : 0) | (isArt || isBd ? 0 : F_SHADOW | (t.kind === 'cv' || t.kind === 'pv' ? 0 : F_DIFFUSE | (big ? F_SPEC : 0)));
          // (Row layout: the vessel's two end colours around its wall, then alpha, 1, depth, flags; its length; its outline.)
          if (isBd) { put3(o, BD_FILL); put3(o + 4, BD_FILL); }
          else if (isArt) { put3(o, art); put3(o + 4, art); }
          else if (t.lymph) { const LYt = t.kind === 'ly' ? LYD : LY; put3(o, LYt); put3(o + 4, LYt); }
          else if (greyed) { put3(o, ORIGIN_RGB); put3(o + 4, ORIGIN_RGB); }
          else { put3(o, inkNow, p * 6); put3(o + 4, inkNow, p * 6 + 3); }
          tubeData[o + 3] = WALL[t.kind]; tubeData[o + 7] = alpha; tubeData[o + 8] = 1; tubeData[o + 9] = Z_OF[t.kind]; tubeData[o + 10] = flags; tubeData[o + 11] = 0;
          tubeData[o + 20] = 0; tubeData[o + 21] = 1; tubeData[o + 22] = t.len; tubeData[o + 23] = 0;
          if (edge) { put3(o + 24, edge); tubeData[o + 27] = 0; }
        }
        g.setTubes(tubeData);
        // The pulse moves only some vessels' colours: those vessels alone are drawn again (see the draw below).
        if (!tubeShown) { tubeShown = tubeData.slice(); glDirty = true; }   // alloc-once: the first attribute pass of this renderer; the copy is kept and written in place after
        else for (let o = 0, RW = TUBE_TEXELS * 4; o < tubeData.length; o += RW) {
          let diff = false;
          for (let i = o; i < o + RW; i++) if (tubeData[i] !== tubeShown[i]) { diff = true; break; }
          if (diff) { glRows.add(o / RW); for (let i = o; i < o + RW; i++) tubeShown[i] = tubeData[i]; }
        }
      }
    }
    // Blood: each vessel's stream advances at a display speed from the model's flows.
    const st = store.get(), b = st.blood || NO_BLOOD;
    const bloodOn = !m.hide && st.layers?.flow !== false, chev = !m.hide && !!b.chevrons;
    const pxW = 1 / (k * V.k), s0 = SLOT * (pxW * 8 > SLOT * 2 ? 4 : pxW * 8 > SLOT ? 2 : 1);
    const ease = -Math.expm1(-dt / 0.5);
    const fr = Math.max(0, m.flow), pr = m.portal, ar = Math.max(0, m.art);
    const vS = 15 * Math.sqrt(fr);
    // (A paused pan has the flow it sent last: the same numbers, so they are not worked out and sent again; it is redone with the surface pass.)
    const flowSame = panOnly && g === flowG && flowA === flowAt;
    if (!flowSame) flowData.fill(0);
    if (!flowSame) for (const t of live) if (t.lymph) flowData[t.id * FLOW_TEXELS * 4 + 8] = -1;   // lymph carries no blood origin
    if (!flowSame && (bloodOn || chev || origin)) for (const t of live) {
      let v, occ, oe, f0 = 0, f1 = 0, strength = 1, rev = 0, stasis = 0;
      const lv = t.kind;
      if (lv === 's0' || lv === 's1' || lv === 's2') {
        v = vS * (lv === 's0' ? 1 : lv === 's1' ? 1.45 : 2.05); occ = clamp(0.5 * fr ** 0.6, 0.06, 0.95); f1 = lv === 's2' ? 1 : 0;
        stasis = 1 - smooth(0.12, 0.45, fr); oe = LOBE.q;
      } else if (lv === 'an') { v = 0.35 * vS * t.sign; occ = 0.25 * clamp(fr, 0.2, 1.5); strength = 0.6; oe = LOBE.q; }
      else if (lv === 'in') { v = 24 * Math.sign(pr) * Math.sqrt(Math.abs(pr)); occ = clamp(0.55 * Math.abs(pr) ** 0.6, 0.05, 0.95); f0 = 1; f1 = 1; rev = pr < -0.02 ? 1 : 0; oe = LOBE.pre; }
      else if (lv === 'tw') { v = 30 * Math.sqrt(ar); occ = clamp(0.5 * ar ** 0.6, 0.05, 0.95); f0 = 1; oe = LOBE.a; }
      else continue;   // vessels seen end-on carry no streaks; lymph moves as the drops on the overlay, not as streaks
      const mo = motionOf(t), sm = mo.stream || (mo.stream = { D: (t.id * 977) % PERIOD, rev: rev, v });   // alloc-once: a vessel's first flow step; the stream object is kept in its motion record (the shader's density divisor, laneSum, is read as veins-gl.js LANE_K)
      // Speed eases toward the model's (a new frame changes it in a step), so the marks never lurch.
      sm.v = Math.sign(v) !== Math.sign(sm.v) ? v : sm.v + (v - sm.v) * ease;
      sm.D = (((sm.D + sm.v * dt) % PERIOD) + PERIOD) % PERIOD;
      // Density and stasis ease the same way, so the shimmer thickens or thins instead of popping.
      sm.occ = sm.occ == null ? occ : sm.occ + (occ - sm.occ) * ease;
      sm.st = sm.st == null ? stasis : sm.st + (stasis - sm.st) * ease;
      sm.drift = ((sm.drift || 0) + sm.st * dt * 0.06) % DRIFT_PERIOD;   // (the smoke's drift, as the anatomy's: blood.js drift)
      sm.rev += (rev - sm.rev) * ease;
      const o = t.id * FLOW_TEXELS * 4, Rm = t.maxR || G.rs0;
      flowData[o] = sm.D; flowData[o + 1] = sm.v; flowData[o + 2] = (sm.occ * Math.max(Math.abs(sm.v), 2) * laneSum(Rm, pxW)) / s0; flowData[o + 3] = sm.st;
      flowData[o + 4] = f0; flowData[o + 5] = f1; flowData[o + 6] = strength; flowData[o + 7] = sm.rev;
      flowData[o + 14] = sm.drift;
      flowData[o + 12] = 1;   // (each vessel's chevron weight, as the anatomy's: every lobule vessel shows them when they are on)
      if (origin && origins && !t.lymph) { const kk = EI[oe]; for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = origins[kk * ORIGIN_N + c]; }
    }
    if (!flowSame) { g.setFlow(flowData); flowG = g; flowAt = flowA; }
    // (The look comes only from the styles: built and written out once per copy of them, the stage's kept copy changing
    // only with a class, the theme or a system setting, not on every frame.)
    if (cs !== lookCs) { lookCs = cs; lookNow = lookOf(cs); lookSig = JSON.stringify(lookNow); }   // alloc-rare: only when the stage's kept copy of the styles is a new one (a class, theme or system-setting change)
    const look = lookNow, lsig = lookSig;
    // (The blood's arguments, one object kept and written in place: veins-gl reads it within the call, and its kept pair for a later repaint holds this
    // same object, whose values are then this frame's, the latest. bleed stays empty; the colours are the shared, cached ones.)
    const bc = bloodColors(), blood = bloodArg;
    blood.alpha = flowA; blood.on = bloodOn && flowA > 0.002; blood.chev = chev && flowA > 0.002; blood.look = b.look || 'shimmer'; blood.origin = origin; blood.clock = clock; blood.dye = false; blood.vdpr = k;   // (vdpr: canvas px per CSS px, which the chevrons' size is set in)
    blood.originCol = bc.originCol; blood.dyeCol = bc.dyeCol; blood.inkLight = bc.inkLight; blood.inkDark = bc.inkDark; blood.revCol = bc.revCol; blood.chevInk = bc.chevInk; blood.chevLight = bc.chevLight;
    // A whole redraw of the vessel layer is by far the heaviest thing the lobule draws (about 150 plain fills of the
    // canvas); when only some vessels' attributes changed, only their cells are drawn again, to the same picture.
    if (glDirty || !dSame || lsig !== glLook) {
      // (Moved with only some vessels' attributes changed: those are named, so the drawn layer is moved, not drawn whole.)
      const rows = glDirty || lsig !== glLook ? null : rowsOf();
      glDirty = false; noteDrawn(cw, ch, T); glLook = lsig; glRows.clear(); g.draw(T, look, blood, rows); tLast ^= 1;
    }
    // (A refused partial draw hands its rows on to the whole draw that stands in for it.)
    else if (glRows.size) { const rows = rowsOf(); glRows.clear(); if (!g.drawRows(T, look, blood, rows)) { g.draw(T, look, blood, rows); tLast ^= 1; } }
    else g.composite(look, blood);
    if (gpuProbe.on) gpuProbe.note(COUNTED.lobulePicture);
  }
  const num = (cs, n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
  let lookCs = null, lookNow = null, lookSig = '';
  const lookOf = (cs) => ({   // alloc-rare: lookOf runs only for a new copy of the stage's styles (drawGL's lookCs guard)
    shOff: [1.2, 2.2], light: LIGHT, reach: 11, organs: 0,   // alloc-rare: lookOf runs only for a new copy of the stage's styles (drawGL's lookCs guard)
    casing: [...triplet(cs, '--casing-rgb'), num(cs, '--casing-a', 0.56) * 0.8],   // alloc-rare: lookOf, a new copy of the styles only
    shadow: [...triplet(cs, '--shadow-rgb'), num(cs, '--shadow-a', 0.15)],   // alloc-rare: lookOf, a new copy of the styles only
    sheen: [...rgb01(cs.getPropertyValue('--light-ink').trim()), num(cs, '--tube-sheen', 0.42)],   // alloc-rare: lookOf, a new copy of the styles only
    shade: [...rgb01(cs.getPropertyValue('--tube-shade-ink').trim()), num(cs, '--tube-shade', 0.2)],   // alloc-rare: lookOf, a new copy of the styles only
    ring: [...rgb01(cs.getPropertyValue('--accent').trim()), 0.4],   // alloc-rare: lookOf, a new copy of the styles only
    netAlpha: 1, fx: true, tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),   // alloc-rare: lookOf, a new copy of the styles only
  });
  const triplet = (cs, n) => { const k = cs.getPropertyValue(n).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };

  // ── Tissue: plates, collagen, zones, congestion (repainted only when the model changes it) ──
  let worldSc = 0, worldGeo = null, worldDraws = 0, holdT = 0;
  // The hand let go of a held picture: drawn once more at the sharpness its zoom wants.
  const holdSoon = () => { if (!holdT) holdT = setTimeout(holdEnd, 140); };
  function holdEnd() { holdT = 0; if (handOn()) { holdSoon(); return; } viewChanged(); }
  // Congestion enters the lobule's picture only past congU 0.04 (the nutmeg; dead cells past 0.12), and the picture is drawn again once
  // the venous pressure moves 0.25 mmHg from the one it was drawn at. (Keyed on half-mmHg steps, a pressure wavering on a step's edge
  // while the model runs redrew the whole bitmap, up to 3600 px square, over and over, mid-glide too: 20 times in 45 s in compensated
  // cirrhosis. Half a step from the drawn value, it follows the pressure at least as closely as the steps did.)
  let congD = 0;
  const congKey = (m) => { if (!(m.congU > 0.04)) congD = 0; else if (!congD || Math.abs(m.cong - congD) > 0.25) congD = m.cong; return Math.round(congD * 1000) || 0; };
  // The tissue's state, as the lobule's bitmap shows it (what it is painted again for, besides its scale): a string, built only when the
  // numbers behind it (to a hundredth, the congestion to a thousandth) differ from those of the last few states it was asked for; the same
  // string comes back otherwise, so the frame builds none. (Equal states give equal strings, whichever of the kept ones matched.)
  const WS_KEPT = [], WS_N = 8;
  let wsAt = 0;
  const wsIs = (r, W, H, dark, pre, sn, post, s, cong, hide, bg) => r.W === W && r.H === H && r.dark === dark && r.pre === pre && r.sn === sn && r.post === post && r.s === s && r.cong === cong && r.hide === hide && r.zones === zonesOn && r.bg === bg;
  const worldStateOf = (m, G, dark, cs) => {
    const pre = Math.round(m.zone.pre * 100) || 0, sn = Math.round(m.zone.sin * 100) || 0, post = Math.round(m.zone.post * 100) || 0, s = Math.round(m.s * 100) || 0, cong = congKey(m), bg = cs.getPropertyValue('--bg');
    for (let i = 0; i < WS_KEPT.length; i++) if (wsIs(WS_KEPT[i], G.W, G.H, dark, pre, sn, post, s, cong, m.hide, bg)) return WS_KEPT[i].key;
    // alloc-rare: only when the tissue's state is new (the bitmap is painted again for it, which costs far more than this record and string)
    const key = [G.W, G.H, dark, (pre / 100).toFixed(2), (sn / 100).toFixed(2), (post / 100).toFixed(2), (s / 100).toFixed(2), (cong / 1000).toFixed(3), m.hide, zonesOn, bg].join('|');
    WS_KEPT[wsAt] = { W: G.W, H: G.H, dark, pre, sn, post, s, cong, hide: m.hide, zones: zonesOn, bg, key };   // alloc-rare: same branch, a new tissue state
    wsAt = (wsAt + 1) % WS_N;
    return key;
  };
  // The key of a bitmap: its scale (to a thousandth) with its state; the string kept while neither changes.
  let wkQ = NaN, wkWs = '', wkStr = '';
  const wkOf = (sc, ws) => {
    const q = Math.round(sc * 1000);
    if (q !== wkQ || ws !== wkWs) { wkQ = q; wkWs = ws; wkStr = (q / 1000).toFixed(3) + '|' + ws; }   // alloc-rare: only when the bitmap's scale or state changed (it is painted again)
    return wkStr;
  };
  // The lobule in world space, painted into cv at sc px per world unit (its box: 1.3 R about the centre each way).
  // (Recorded, not drawn: paint-gl.js keeps the painting's shapes and colours, and the GPU context that shows the picture paints them
  // into its texture, tiles of a multisampled framebuffer, the first time it is drawn. No canvas, no pixels on the CPU.)
  function paintWorld(sc, m, G, dark, cs) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.tissue);
    const B = 1.3 * G.R;
    pwN = Math.ceil(2 * B * sc); pwSc = sc; pwBx = G.cx - B; pwBy = G.cy - B; pwP = worldInput(m, G, dark, cs);
    const pic = framePart('lz.paintWorld', pwPicture);
    pwP = null;
    return pic;
  }
  // (What one painting reads, kept here for the two functions made once below, so a painting makes no closure of its own.)
  let pwN = 0, pwSc = 1, pwBx = 0, pwBy = 0, pwP = null;
  const pwRecord = (w) => paintWorldInto(w, pwN, pwSc, pwBx, pwBy, pwP);
  const pwPicture = () => gpuPicture(recordPaint(pwN, pwN, pwRecord), ++texVer);
  // On the GPU: the lobule's bitmap is mipmapped, so one painted for a closer zoom stays sharp shown smaller. Once the view has
  // settled, the bitmap for twice its zoom (and the surround's tiles for it) are painted ahead, between frames (spareMake): a pinch
  // or a glide in then takes them over as it gets there, sharp all the way, with nothing painted mid-gesture and no picture shown
  // softer than its zoom wants.
  let spareCv = noPicture(), spare = null, spareT = 0, texVer = 0;
  const spareSoon = () => { if (!spareT) spareT = setTimeout(spareMake, 400); };
  function spareMake() {
    spareT = 0;
    const g = tissueGLOn(), G = geo, m = model;
    if (!g || !G || !m || fade < 0.98 || diveScaled || sinU > 0 || worldGeo !== G || !tissueOnGL) return;
    if (handOn() || gliding || inMotion()) { spareSoon(); return; }   // (inMotion: not while a slide's cards come in, frame.js holdMotion)
    // (Twice the zoom's own sharpness, stepped as paintTissue steps it, within the bitmap's largest size.)
    const dpr = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * lzScale(), cap = worldCap(G, dpr);
    const dark = isDark(), cs = styles(), ws = worldStateOf(m, G, dark, cs), sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * V.k)) * 2) / 2) * 2, cap, seenCap(G));
    if (bitmapUnseen()) {
      // (The shader has the whole picture, so no bitmap is seen at the zooms this one is for: none is painted, and one made earlier is given back.)
      if (spare || spareCv.width) { free(spareCv); spare = null; }
    } else if (sc > worldSc * 1.01 && !(spare && spare.G === G && spare.ws === ws && spare.sc >= sc)) {
      // (Recorded here, a moment's script, and painted on the GPU now, between frames.)
      free(spareCv); spareCv = paintWorld(sc, m, G, dark, cs); spare = { sc, ws, G };
      g.upload(spareCv, spareCv.ver);
    }
    if (bitmapUnseen()) {
      // (And one painted sharper before the shader took over (the first open, while it compiled: up to 3600 px square, 50 MB on the
      // GPU) is painted again, here between frames, at the sharpest it is ever seen: a few hundred px.)
      const cap0 = seenCap(G);
      if (worldSc > cap0 * 2.01 && worldCv.width && worldGeo === G && ws === worldState && !xfT0) {
        free(worldCv); worldCv = paintWorld(cap0, m, G, dark, cs); worldSc = cap0; worldKey = wkOf(cap0, ws);
        g.upload(worldCv, worldCv.ver); wake();
      }
    }
    // (The surround's tiles for that zoom too, each with its quieted copy, on the GPU.)
    const tone = shadeOf(stageBg(cs, dark), dark), { a, b } = fieldBlend(G.R * V.k * dpr * 0.55 * 2);
    for (const i of new Set([a, b])) { const t = fieldTile(cs, dark, FIELD_RS[i]); g.upload(quietCopy(t, tone).cv, 0, true); }
    g.sweep();
  }
  // The tissue's GPU drawing (tissue-gl.js): made the first time it is asked for; null where WebGL2 is missing or would run in
  // software, and set aside if its context is lost (the tissue then waits for the context back: nothing is painted on a 2D canvas).
  let tissueGL, tissueOnGL = false;
  // One context for the lobule (veins-gl.js): the tissue is drawn in the vessels' own context, into a picture of its own, and
  // laid on their canvas under them at each picture they lay (their under), with no canvas or context of its own. Laid while it shows
  // (tissueG, out of the page, keeps the showing state: showTissueGL, the dive's copies) and, for a wide copy's tile, while the tile
  // is drawn on the GPU (tisWide). Made again with the vessels' renderer (a new one after a lost context).
  let tisHostFor = null, tisHostOff = null, tisWide = false;
  const tisUnder = () => !!tissueGL && tissueGL.pictured && (wideBuild ? tisWide : tissueOnGL && tissueG.style.visibility !== 'hidden');
  function tissueGLOn() {
    if (!glTried) glNow();
    if (gl && !gl.lost && gl.top?.under) {
      if (tisHostFor !== gl) {
        tisHostOff?.(); if (tisHostFor) tissueGL?.release?.();
        tisHostFor = gl; tissueGL = createTissueGL(tissueG, { onLive: liveCompiled, host: gl.top }) || null;   // alloc-rare: only when the vessels' renderer is new (the first look, or after a lost context)
        tisHostOff = tissueGL ? gl.top.under({ on: tisUnder, draw: () => tissueGL.under(gl?.software ? 0.5 : 1) }) : null;   // alloc-rare: same branch, a new renderer
        tissueGL?.liveReady();
        restRemove(tissueG);
      }
      return tissueGL && !tissueGL.lost ? tissueGL : null;
    }
    return null;   // (no figure context: the last picture stays until the renderer is made again)
  }
  // The lobule's tissue drawn live by the shader (lobule-live.js, A5b): in the share of the picture the state allows (liveEligible:
  // the shader draws the fill, cells, congestion, zones and hairline so far, a state with collagen, stellate cells or septa is the
  // bitmap's) and the zoom wants (liveZoomShare: the bitmap's mipmaps average cells under about 3.5 px, where a shader would shimmer).
  // The picture is still recorded and kept (on the GPU, paint-gl.js) for the shares that are not the shader's. Where the
  // state changes between the two, the share eases over LIVE_MS.
  // The lobule is always drawn live where it can be: the goal is 1 while the state allows it and the shader is ready, and the share
  // eases over LIVE_MS (lobule-live.js) toward it, so nothing steps when the shader arrives after the lobule is on show. Unseen (closed,
  // or staged ahead), the next frame starts at the goal, so opening the lobule shows no leftover easing.
  // The shader that draws the lobule live is a program of its own (tissue-gl.js), started when the tissue's GPU drawing is made. Until it
  // is ready (liveOK) the goal is 0 and the bitmap is the whole picture; if it fails to build the goal stays 0 for good, and the lobule keeps
  // its painted picture (a note in the console).
  let liveE = -1, liveAt = 0, liveShare = 0;
  const liveOK = () => !!tissueGL && tissueGL.liveReady();
  const liveGoal = () => (model && liveEligible(model) && liveOK() ? 1 : 0);
  // (The goal changed under the lobule (the shader arrived or failed), or the lobule is not on show: liveAt, so the first step of the easing
  // is a frame's, not the time since the last draw.)
  function liveChanged() { if (unseen()) liveE = -1; else { liveAt = performance.now(); wake(); } }
  function liveCompiled() { liveChanged(); }
  const liveMoving = () => liveE >= 0 && tissueOnGL && !unseen() && liveE !== liveGoal();
  function liveStep(dpr, now) {
    const goal = liveGoal();
    if (liveE < 0 || unseen()) liveE = goal;
    else liveE = liveEase(liveE, goal, now - liveAt);
    liveAt = now;
    liveShare = geo ? liveShareOf(liveE, liveZoomShare(V.k * dpr, geo.R)) : 0;
    return liveShare;
  }
  const liveData = new WeakMap();
  // What liveArgs keeps between frames, so a frame makes none of it: the arguments object (written in place), the radii the shader's
  // texels were made from, the model values and colours they were made for, and the colours the shader reads (liveColours, remade
  // only when the colours it is made from, listed in LIVE_TOK, or the theme change).
  let dynVal = null, dynRad = null, dynSep = NaN, dynPre = NaN, dynPost = NaN, dynDark = null, dynCv = NaN, dynRgb = null;
  const ITEM_O = { col: null, dark: false, cvIn: 0 };   // (buildItems' options, written over each time)
  const FIBV = { sin: 0, act: 0, fibSin: 0, actV: 0 };   // (liveFibreInto's, written over each call)
  const liveOut = { shape: null, data: null, dyn: null, fib: FIBV, rs0: 0, share: 0, cu: 0, sj: 0, zones: false, dark: false, cen: [0, 0, 0], col: null };
  const LIVE_TOK = ['--lz-plate-line', '--lz-nodule-ink', '--lz-zone-line', '--lz-nodule-shadow', '--lz-shade', '--lz-hsc-body', '--lz-hsc-nucleus', '--lz-nutmeg', '--lz-zone-1', '--lz-zone-2', '--lz-zone-3'];
  const colRaw = [];
  let colRgb = null, colDark = null, colVal = null;
  // The geometry's sinusoids, picked out once per geometry.
  const sinTubes = new WeakMap();
  function sinTubesOf(G) {
    let a = sinTubes.get(G);
    if (!a) { a = G.tubes.filter((t) => t.kind[0] === 's'); sinTubes.set(G, a); }   // alloc-once: the first look at a geometry (a new size, a new lobule build)
    return a;
  }
  function liveArgs(dark, cs) {
    if (!(liveShare > 0)) return null;
    const S = worldShape(geo), m = model;
    let data = liveData.get(S);
    const sinT = sinTubesOf(geo);
    if (!data) { data = buildLive({ ...S, sin: sinT.map((t) => ({ pts: t.pts })) }); liveData.set(S, data); }   // alloc-once: the shader's shapes, built once for each new shape (geometry)
    const rgbW = worldRgb(cs), cvIn = m.fibPost > 0.05 ? radiusAt(geo.cv, 0) : 0;
    if (!dynRad || dynRad.length !== sinT.length) { dynRad = new Float64Array(sinT.length); dynVal = null; }   // alloc-rare: only when the geometry has another count of sinusoids
    let moved = !dynVal || dynVal.S !== S || dynSep !== m.septU || dynPre !== m.fibPre || dynPost !== m.fibPost || dynDark !== dark || dynCv !== cvIn || dynRgb !== rgbW;
    for (let i = 0; i < sinT.length; i++) { const r = radiusAt(sinT[i], N >> 1); if (dynRad[i] !== r) { moved = true; dynRad[i] = r; } }
    if (moved) {
      dynSep = m.septU; dynPre = m.fibPre; dynPost = m.fibPost; dynDark = dark; dynCv = cvIn; dynRgb = rgbW;
      ITEM_O.col = rgbW.col; ITEM_O.dark = dark; ITEM_O.cvIn = cvIn;
      dynVal = buildDyn(S, dynRad, buildItems(S, m, ITEM_O)); dynVal.S = S;
    }
    let colMoved = !colVal || colRgb !== rgbW || colDark !== dark;
    for (let i = 0; i < LIVE_TOK.length; i++) { const v = cssVar(LIVE_TOK[i]); if (colRaw[i] !== v) { colRaw[i] = v; colMoved = true; } }
    if (colMoved) { colRgb = rgbW; colDark = dark; colVal = liveColours(rgbW, dark, cssVar); }   // alloc-rare: only when the theme or a colour the shader reads changed
    const o = liveOut;
    o.shape = S; o.data = data; o.dyn = dynVal; o.fib = liveFibreInto(FIBV, m); o.rs0 = geo.rs0; o.share = liveShare; o.cu = m.congU; o.sj = m.septU; o.zones = zonesOn; o.dark = dark;
    o.cen[0] = geo.cx; o.cen[1] = geo.cy; o.cen[2] = geo.R; o.col = colVal;
    return o;
  }
  // The GPU's frame does not show the bitmap when the shader has the whole picture: its share is 1 (a cell 6 px or more across, and the
  // shader eased fully in, so the bitmap is mixed out entirely: tissue-gl.js uLive). Then the bitmap exists only for the zooms where the
  // share falls below 1 again: it is not painted ahead (spareMake), not held at the sharpness of a gesture's every step (paintTissue),
  // and a new state does not crossfade into it.
  const bitmapUnseen = () => liveShare >= 1 && tissueOnGL;
  // The sharpest the bitmap is ever seen (2 Nov 2026, Mohammad: "Why is zooming in in lobule view laggy"): once the shader is fully
  // eased in, it has the whole picture from a cell of 6 px up (liveZoomShare), so the bitmap shows only at zooms below that, and a bitmap
  // painted for a closer zoom is never seen. Zooming in by hand, with + or a presenter's glide, the bitmap was still painted again at the
  // landed zoom's sharpness once it stopped: up to 3600 px square, its shapes recorded on the main thread and rastered into the GPU's
  // tiles in one go (0.2 to 0.5 s headless, a visible hitch as each zoom-in settled), for a picture mixed out entirely. It is now painted
  // at most at the step that covers the shader's threshold, and one already sharper is kept.
  const seenCap = (G) => (liveE >= 1 && liveGoal() === 1 && tissueOnGL ? 2 ** (Math.ceil(Math.log2(6 / (0.052 * G.R)) * 2) / 2) : Infinity);
  // (The context given back after a loss (tissue-gl.js asks for it): everything on it was lost with it, so the tissue's GPU drawing is
  // made again on the same canvas the next time it is asked for.)
  // The lobule draws again (its tissue first): a bitmap came in, or the next one can be asked for.
  function wake() { tissueKey = ''; idleDrawn = ''; if (!raf && fade > 0) raf = nextFrame(loop); }
  // Which of the two shows (in the frame it was drawn in, so the picture never goes missing between them).
  // The GPU's canvas taking over from the 2D one: the 2D canvas, which lies under it, stays whole and showing for HANDOFF_MS before it is
  // hidden and given back. Safari can show a WebGL canvas's new frame a frame or more after the page's (more so for a canvas just
  // resized, as when the lobule settles at a new sharpness), and the 2D canvas hidden in that same frame left nothing there: the
  // hepatocytes and the neighbouring lobules flashed the page's dark colour, black in a dark look (Mohammad, 1 Nov, iPhone). The GPU's
  // picture is opaque, so the 2D one under it is never seen once it shows. (Not while the dive's rim clears the surround on the GPU:
  // the 2D picture would show through there.)
  const HANDOFF_MS = 160;
  let handoffT = 0;
  function showTissueGL(on) {
    if (on === tissueOnGL) return;
    clearTimeout(handoffT); handoffT = 0;
    if (on && !rimDrawn) {
      tissueOnGL = true;
      handoffT = setTimeout(() => { handoffT = 0; if (tissueOnGL) free(tissue); }, HANDOFF_MS);   // alloc-rare: only at the moment the tissue first switches onto the GPU canvas (the hand-over), not in a frame that stays on it
      return;
    }
    // (Which canvas shows is what is on it, never a style written to hide the other: the 2D one is given back blank (free) once the GPU's
    // has taken over, the GPU's given back blank when it goes off. The 160 ms hand-over above is unchanged: the 2D picture stays on it
    // until the timer.)
    tissueOnGL = on;
    if (on) free(tissue); else free(tissueG);
  }

  // The tissue on the GPU: the same picture as the 2D passes below (the quiet surround, the lobule's bitmap over it, crossfading with
  // the last state's while a new one fades in, and the fade into the page), with the surround's two nearest tile sizes blended.
  // What the tissue's draw is given each frame, kept and written in place (tissue-gl.js reads it within the draw and keeps none of it), and
  // the two calls made once, so a frame makes no argument object, rectangle or closure.
  const tgArgs = { W: 0, H: 0, qa: null, qb: null, mix: 0, qo: null, qOld: 0, w: null, wVer: 0, wo: null, woVer: 0, wMix: 1, rect: [0, 0, 0], ox: 0, oy: 0, rd: 0, fade: [0, 0], mid: 0, bg: null, grey: null, live: null, rim: null, hold: false };
  const surNowRec = { set: null, q: null };
  let tisTg = null;
  const tisUpload = () => tisTg.upload(worldCv, worldCv.ver || 0);
  const tisDraw = () => tisTg.draw(tgArgs);
  function tissueOnGPU(tg, tw, th, dpr, dark, cs, bgCss, now) {
    const { R, cx, cy } = geo, B = 1.3 * R;
    const ox = (cx * V.k + V.x) * dpr, oy = (cy * V.k + V.y) * dpr, rd = R * V.k * dpr, fIn = rd * 1.1;
    const reach = Math.max(Math.hypot(ox, oy), Math.hypot(tw - ox, oy), Math.hypot(ox, th - oy), Math.hypot(tw - ox, th - oy));
    const fOut = fadeOuter(fIn, reach), tone = shadeOf(rgb01(bgCss), dark);
    const { a, b, mix } = fieldBlend(rd * 0.55);   // (half the tile's resolution: the quiet surround)
    const ta = fieldTile(cs, dark, FIELD_RS[a], !unseen()), tb = b !== a && mix > 0 ? fieldTile(cs, dark, FIELD_RS[b], !unseen()) : null;
    const qa = quietCopy(ta, tone), qb = tb ? quietCopy(tb, tone) : null;
    // (A new state's tiles fade in over the last state's.)
    if (surNow && ta.set !== surNow.set && surNow.q.cv?.width && !unseen()) { surOld = surNow.q; surT0 = xfNow(now); }
    surNow = surNowRec; surNowRec.set = ta.set; surNowRec.q = qa;
    const su = surT0 ? xfU(surT0, xfNow(now)) : 1;
    if (su >= 1) { surT0 = 0; surOld = null; }
    const crossfading = !!(xfT0 && xfNow(now) - xfT0 < XF_MS && worldOld.width && worldOldSc);
    const sx = (cx - B) * V.k + V.x, sy = (cy - B) * V.k + V.y;
    // (The lobule's bitmap sent first, as its own piece for the frame-time gate: draw would send it the same way, a no-op after.)
    tisTg = tg;
    framePart('lz.texUpload', tisUpload);
    const A = tgArgs;
    A.W = tw; A.H = th; A.qa = qa.cv; A.qb = qb?.cv; A.mix = tb ? mix : 0; A.qo = surOld?.cv?.width ? surOld.cv : null; A.qOld = surOld ? 1 - su : 0;
    A.w = worldCv; A.wVer = worldCv.ver || 0; A.wo = crossfading ? worldOld : null; A.woVer = worldOld.ver || 0; A.wMix = crossfading ? xfU(xfT0, xfNow(now)) : 1;
    A.rect[0] = sx * dpr; A.rect[1] = sy * dpr; A.rect[2] = 2 * B * V.k * dpr; A.ox = ox; A.oy = oy; A.rd = rd; A.fade[0] = fIn; A.fade[1] = fOut; A.mid = FADE_MID;
    A.bg = tone; A.grey = grey.k > 0 ? surroundGrade(grey.k) : null; A.live = liveArgs(dark, cs); A.rim = rimArg(tw, th); A.hold = tissueOnGL;
    const ok = framePart('lz.tissueGL', tisDraw);
    A.qa = A.qb = A.qo = A.w = A.wo = A.live = null;   // (not kept: the picture's textures are the caller's to give back)
    if (!ok) return false;
    tissueDrew = true;
    rimDrawn = !!diveRim; rimNote();   // (its canvas holds the dive's rimmed picture: drawn again without it once the zoom lands)
    if (!crossfading && xfT0) { xfT0 = 0; free(worldOld); tg.sweep(); }   // (faded in: the old picture is given back, its GPU copy too)
    // (The canvas under it is left empty.)
    if (!((!tissueOnGL || handoffT) && !rimDrawn)) free(tissue);
    return true;
  }
  // tg: the GPU drawing to draw with (null: none, nothing is drawn). True when it drew on the GPU.
  function paintTissue(W, H, dpr, dark, cs, flatVessels, tg = null) {
    const m = model, G = geo;
    const gpu = !!tg && !flatVessels;
    // The lobule itself is drawn once into a world-space bitmap (at a scale stepped in √2, never below
    // the screen's), redrawn only when the tissue's state changes; panning and zooming just place it.
    // Pressure colors enter only coarsely (they move every frame while the model glides).
    // (#27) Mid-glide (+, −, Fit, a presenter's camera) the bitmap keeps the scale it was drawn at and is only placed larger or smaller:
    // redrawing it at each √2 step (up to 3600 px square) stalled the glide. It is drawn sharp once the glide lands.
    let sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * V.k)) * 2) / 2), worldCap(G, dpr));
    const ws = worldStateOf(m, G, dark, cs);
    const seen = seenCap(G);
    if (sc > seen) { sc = seen; if (worldSc > sc && worldCv.width && worldGeo === G && ws === worldState) sc = worldSc; }   // (never sharper than it is seen; a sharper one kept)
    // (A hand's pinch, flick or trackpad scroll holds it the same way, and it is drawn sharp once the hand lets go: holdEnd.)
    // (On the GPU it is held only while it is at least as sharp as the zoom wants, and past that the one painted ahead takes over:
    // spareMake. The 2D canvas cannot show a closer bitmap smaller without shimmer, so there it is held at its scale, as before.)
    const hand = !gliding && (gpu ? handOn() : touches.size > 0 || !!cancelFlick || (wheelKind === 'pad' && performance.now() - wheelAt < 250)), held = gliding || hand;
    const kept = worldSc && worldCv.width && worldGeo === G;
    // (At rest on the GPU, a sharper bitmap already painted for this state, up to twice the zoom's, is kept: it is shown smaller and
    // as sharp, and painting the zoom's own once a pinch or a glide ends would only cost a frame.)
    if (gpu && kept && sc > worldSc && spare && spare.G === G && spare.ws === ws && ws === worldState && spare.sc >= sc && spareCv.width) {
      // (The zoom wants more than the bitmap has: the sharper one painted ahead takes over, already on the GPU.)
      const swapped = worldCv; worldCv = spareCv; spareCv = swapped; free(spareCv); tg.sweep();   // (the replaced bitmap's GPU copy goes with it)
      worldSc = spare.sc; worldKey = wkOf(worldSc, ws); spare = null;
    }
    if (!held && gpu && kept && ws === worldState && sc <= worldSc && worldSc <= sc * 2.01) sc = worldSc;
    if (held && kept && (!gpu || sc <= worldSc || bitmapUnseen())) { if (hand && sc !== worldSc) holdSoon(); sc = worldSc; }   // (bitmapUnseen: not repainted at each step of a gesture's zoom, as nothing of it is seen; drawn at the zoom's sharpness once the hand lets go, for the 2D canvas)
    // (The dive's wide copy drawn at a lower pixel ratio than the screen's, its box past the budget (buildWide): it is drawn from the
    // screen's sharper bitmap of the same state, not from a softer one painted here for it, with the screen's painted again after.)
    if (wideBuild && !held && kept && ws === worldState && sc < worldSc && worldSc <= sc * 2.01) sc = worldSc;
    // (And the rise's first frame, the layers drawn once to be shrunk by the compositor (HVPG 6 to 7: 0.6 to 1 s on CI, the bitmap
    // painted again for the fit the presenter glided to just before): the sharper bitmap of the same state, shown smaller.)
    if (diveScaled && !wideBuild && kept && ws === worldState && sc < worldSc && worldSc <= sc * 4.01) sc = worldSc;
    const wk = wkOf(sc, ws);
    const now = performance.now(), fading = tissueFading(now), gk = greyNow(now);   // (gk: the surround's grey, easing with the lens)
    const lk = gpu ? liveStep(dpr, now) : 0;   // (the share of the lobule drawn live by the shader)
    // (The key of what is drawn, kept as numbers in a kept array and compared slot by slot: the rim if the dive has one, the size, the bitmap's
    // key, whether the GPU draws it, the crossfades' progress to a thousandth, the flat vessels' inks (without WebGL2 vessels only), the live
    // share and congestion, the surround's state, the view and the grey. tissueKey is '' until a key has been drawn, and is cleared to draw again.)
    const rim = gpu ? diveRim : null, fs = fieldState(), K = tkNow;
    let ki = 0;
    K[ki++] = rim ? rim.x : 0; K[ki++] = rim ? rim.y : 0; K[ki++] = rim ? rim.r : 0; K[ki++] = !!rim;
    K[ki++] = W; K[ki++] = H; K[ki++] = dpr; K[ki++] = wk; K[ki++] = gpu;
    K[ki++] = fading ? Math.round(xfU(xfT0, xfNow(now)) * 1000) : -1; K[ki++] = fading ? Math.round(xfU(surT0, xfNow(now)) * 1000) : -1;
    K[ki++] = flatVessels ? [ink('sin', 1), ink('sin', 0), ink('pv'), ink('cv'), m.art.toFixed(2), [...selIds()].join('.')].join('|') : '';   // alloc-rare: only for the flat vessels (no WebGL2 vessels), where the tissue is not drawn on the GPU
    K[ki++] = lk > 0 ? Math.round(lk * 1000) : -1; K[ki++] = lk > 0 ? Math.round(m.congU * 200) : -1;   // (congestion to 0.005: it moves a little each frame while the model runs, and each step redrew the tissue full screen; L3)
    K[ki++] = fs.su; K[ki++] = fs.pre; K[ki++] = fs.post; K[ki++] = fs.sin; K[ki++] = fs.cong;
    K[ki++] = Math.round(V.k * 1000); K[ki++] = Math.round(V.x * 10); K[ki++] = Math.round(V.y * 10); K[ki++] = Math.round(gk * 1000);
    let same = tissueKey !== '';
    for (let i = 0; same && i < ki; i++) if (!Object.is(K[i], tkWas[i])) same = false;
    if (same) return gpu && keyGPU;
    for (let i = 0; i < ki; i++) tkWas[i] = K[i];
    tissueKey = 'y'; tissueCss[0] = W; tissueCss[1] = H; keyGPU = false;
    const tw = canvasPx(W, dpr), th = canvasPx(H, dpr);
    const bg = stageBgCss(cs);
    const { R } = G;
    if (wk !== worldKey && gpu) {
      // The tissue's state changed (not just the scale it is drawn at): the old picture stays under the new one as it fades in.
      // (Not while the shader has the whole picture: the bitmap is painted again in place.)
      // (A change while one is fading in replaces the incoming picture and lets the fade run on, so a state that keeps moving, as the
      // pressures glide after a new patient, never restarts it.)
      if (worldState && ws !== worldState && !unseen() && !(liveShare >= 1) && worldGeo === G && worldCv.width && !(xfT0 && xfNow(now) - xfT0 < XF_MS)) { free(worldOld); worldOld = worldCv; worldOldSc = worldSc; xfT0 = xfNow(now); }
      else free(worldCv);
      // (For the ?perf readout: why, and how large, gpu-probe.js TISSUE_WHY.)
      if (gpuProbe.on) gpuProbe.note(COUNTED.tissueWhy + (!worldState || worldGeo !== G ? 'first' : ws !== worldState ? 'state changed' : sc > worldSc ? 'zoomed in' : 'zoomed out'), Math.ceil(2.6 * R * sc) ** 2 * 4 / 1024);
      worldKey = wk; worldState = ws;
      worldSc = sc; worldGeo = G; worldDraws++;
      worldCv = paintWorld(sc, m, G, dark, cs);
      tg.sweep();   // (the picture it replaced: its texture given back)
    }
    if (gpu && tissueOnGPU(tg, tw, th, dpr, dark, cs, bg, now)) { keyGPU = true; if (!held) spareSoon(); return true; }
    return false;   // (no GPU: the tissue is not drawn; the canvas keeps the last frame it showed)
  }
  // The tissue as the dive shows it scaled down. Past the lobule's rim the bitmap holds the lobule view's own surround (a pale card,
  // scaled down), so that is faded out, opaque to 1.02 of the lobule's radius and gone by 1.2 (DIVE_RIM). The lobule's own drawing
  // stays whole there: its portal tracts reach about 1.2 R in portal fibrosis (and the arteriole, ductule and lymphatic sit just past
  // the corners), and faded with the surround they were cut back through the whole zoom, then popped in when it landed. The tissue's
  // shader draws that rim itself (tissue-gl.js uRim), once per drawing of the tissue, not per frame.
  const tissueCss = [1, 1], tkNow = [], tkWas = [];
  let diveRim = null;
  // The stage's background as CSS text, trimmed, read from the styles; the trimmed string is made again only when the raw values change.
  let bgRawA = null, bgRawB = null, bgCss = '';
  const stageBgCss = (cs) => {
    const a = cs.getPropertyValue('--stage-bg'), b = cs.getPropertyValue('--bg');
    if (a !== bgRawA || b !== bgRawB) { bgRawA = a; bgRawB = b; bgCss = a.trim() || b.trim() || ''; }   // alloc-rare: only when the stage's background token changed (a theme change)
    return bgCss;
  };
  // (The rim drawn by the tissue's shader (tissue-gl.js). keyGPU: the last key drawn went on the GPU; rimDrawn: the
  // GPU canvas holds a rimmed picture.)
  let keyGPU = false, rimDrawn = false, rimGLOn = false, rimGLx = 0, rimGLy = 0, rimGLr = 0;
  // The rim the GPU canvas was last drawn with, as numbers (rimOf rounds them to a tenth); rimSame: the dive's rim now is that one.
  const rimNote = () => { rimGLOn = !!diveRim; rimGLx = diveRim ? diveRim.x : 0; rimGLy = diveRim ? diveRim.y : 0; rimGLr = diveRim ? diveRim.r : 0; };
  const rimSame = () => (diveRim ? rimGLOn && diveRim.x === rimGLx && diveRim.y === rimGLy && diveRim.r === rimGLr : !rimGLOn);
  const rimOf = (x, y, r) => ({ x: +x.toFixed(1), y: +y.toFixed(1), r: +r.toFixed(1) });
  // The rim in the GPU canvas's device px (tw × th for a stage of tissueCss CSS px), null for none.
  const rimOut = [0, 0, 0, 0];   // (written in place: tissue-gl reads it within the draw)
  const rimArg = (tw, th) => {
    if (!diveRim) return null;
    const kx = tw / tissueCss[0], ky = th / tissueCss[1], k = (kx + ky) / 2, { x, y, r } = diveRim;
    rimOut[0] = x * kx; rimOut[1] = y * ky; rimOut[2] = r * k * DIVE_RIM.solid; rimOut[3] = r * k * DIVE_RIM.clear;
    return rimOut;
  };
  // The tissue drawn on the GPU now for the rim as it is (diveRim: the dive's, or none once it lands). True when it is on the GPU.
  function rimOnGPU() {
    if (!geo || !model) return false;
    const g = glNow();
    if (!g || g.lost) return false;   // (no vessels on the GPU: nothing is drawn)
    const tg = tissueGLOn();
    if (!tg) return false;
    const [W, H] = hostSize();
    const on = paintTissue(W, H, Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * lzScale(), isDark(), styles(), false, tg);
    showTissueGL(on);
    return on;
  }

  // The plain values the lobule's painting reads (lobule-paint.js paintLobule), the same whether it paints on the page or in the
  // worker: the model's tissue values, the lobule's shape (copied once per shape), the layers, its colours, and the calibers of the
  // sinusoids and the central vein as they are now (only where the painting reads them: capillarization, the central vein's cuff).
  const shapes = new WeakMap();
  function worldShape(G) {
    let S = shapes.get(G);
    if (S) return S;
    const l = G.lobules[0];
    S = {   // alloc-once: the shape is copied once per geometry (shapes.get(G) above returns it afterwards)
      R: G.R, cx: G.cx, cy: G.cy, rt: G.rt, rs0: G.rs0, rcv0: G.rcv0,
      lobules: [{ x: l.x, y: l.y, corners: l.corners.map(([x, y]) => [x, y]) }],   // alloc-once: the shape is copied once per geometry
      cells: G.cells.map((k) => ({ x: k.x, y: k.y, a: k.a, l: k.l, w: k.w, tone: k.tone, nu: k.nu, q: k.q, drop: k.drop, jx: k.jx, jy: k.jy, ja: k.ja })),   // alloc-once: the shape is copied once per geometry
      hsc: G.hsc.map((k) => ({ x: k.x, y: k.y, a: k.a, nx: k.nx, ny: k.ny })),   // alloc-once: the shape is copied once per geometry
      septaPC: G.septaPC.map((sp) => ({ pts: sp.pts.map(([x, y]) => [x, y]) })),   // alloc-once: the shape is copied once per geometry
    };
    shapes.set(G, S);
    return S;
  }
  // The colours the painting and the live shader read from the styles: the object is made again only when one of the six raw values
  // changed (a theme change), so a frame gets the same object, and its colours the same arrays, until then.
  const WR_TOK = ['--stage-bg', '--bg', '--og-liver-2', '--og-liver-1', '--lz-septum', '--collagen'];
  const wrRaw = [];
  let wrVal = null;
  const worldRgb = (cs) => {
    let moved = !wrVal;
    for (let i = 0; i < WR_TOK.length; i++) { const r = cs.getPropertyValue(WR_TOK[i]); if (r !== wrRaw[i]) { wrRaw[i] = r; moved = true; } }
    if (moved) wrVal = { bg: rgb01(wrRaw[0].trim() || wrRaw[1].trim() || undefined), gap: rgb01(wrRaw[2].trim() || undefined), cell: rgb01(wrRaw[3].trim() || undefined), col: rgb01(wrRaw[4].trim() || undefined), dis: rgb01(wrRaw[5].trim() || undefined) };   // alloc-rare: only when one of the colour tokens changed (a theme change)
    return wrVal;
  };
  function worldInput(m, G, dark, cs) {
    // (Made only when the bitmap is painted, which a new state or a zoom step asks for: the painting costs far more than this.)
    return {   // alloc-rare: once per painting of the bitmap
      m: { congU: m.congU, septU: m.septU, fibSin: m.fibSin, act: m.act, fibPre: m.fibPre, fibPost: m.fibPost },   // alloc-rare: once per painting of the bitmap
      G: worldShape(G), dark, zonesOn,
      rgb: worldRgb(cs),
      sin: m.fibSin > 0.05 ? sinTubesOf(G).map((t) => ({ pts: t.pts, r: radiusAt(t, N >> 1) })) : [],   // alloc-rare: once per painting of the bitmap
      cvIn: m.fibPost > 0.05 ? radiusAt(G.cv, 0) : 0,
    };
  }
  // ── Overlay: lymph droplets; without WebGL2, the red cells too ──
  // What the effects layer draws that does not move, as world-space paths, each with the box it covers (so a frame
  // draws only those that reach the screen; one wholly off it changes no pixel there). The ductules' cells follow only
  // their calibers; the eraser under the vessels and the sinusoids' collagen lining (both with the lymph on) follow the
  // calibers and the zoom: the eraser's courses are kept for the geometry, only its widths and discs are worked out again.
  let ductKey = '', ductP = null, ductRs = null;
  function fxDuct() {
    const G = geo, trs = G.triads;
    // (The ductules' calibers compared as they stand to the kept ones, no key string built: the string is made when they change.)
    if (!ductRs || ductRs.length !== trs.length) { ductRs = new Float64Array(trs.length); ductP = null; }   // alloc-rare: only when the geometry has another count of portal tracts
    let same = !!ductP && ductP.G === G;
    for (let j = 0; j < trs.length; j++) { const r = Math.max(radiusAt(trs[j].bdT, N >> 1), G.R * 0.008); if (ductRs[j] !== r) { same = false; ductRs[j] = r; } }
    if (same) return ductP;
    const rs = ductRs;
    ductKey = rs.join(',');   // alloc-rare: only when a ductule's caliber or the geometry changed (the ductule's radius follows the geometry alone)
    const NC = 16;
    // (Per ductule, for the GPU's instanced drawing (fx-gl.js): its centre, the lining's inner and outer radius, its middle, the
    // nucleus radius (about a third of a cell's width) and the turn of its cells.)
    const duct = G.triads.map((tr, j) => {   // alloc-rare: same branch, the ductules changed
      const r = rs[j], rm = r * 1.35, hw = Math.PI * rm / NC, rin = rm - hw, rout = rm + hw, x = tr.bd[0], y = tr.bd[1];
      return { disc: [x, y, rout], num: [x, y, rin, rout, rm, hw * 0.34, tr.i, 0] };   // alloc-rare: same branch, the ductules changed
    });
    return (ductP = { G, key: ductKey, duct, nums: Float32Array.from(duct.flatMap((d) => d.num)) });   // alloc-rare: same branch, the ductules changed
  }
  // What part of the world the effects layer shows, with a few device pixels to spare for antialiasing: [x0, y0, x1, y1].
  // The lymph's drops this frame, [x, y, r, seed] each, and what drawing them needs. (Each drop's motion steps here, once a frame.)
  const lyRes = { lw: 0, seal: 0, beads: 0, minR: 0, drops: null, nd: 0 };   // (what lyDrops returns: one object kept, written in place; fxOnGPU takes its fields at once)
  let lyNd = 0;
  // One drop's x, y, radius and seed onto the end of the kept array (grown, to twice, only when the count outgrows it).
  function lyPut(a, b, c, d) {
    let drops = lyRaw;
    if (lyNd + 4 > drops.length) { const nx = new Float32Array(Math.max(64, drops.length * 2)); nx.set(drops); drops = lyRaw = nx; }   // alloc-rare: only when the drops outgrow the kept array
    drops[lyNd++] = a; drops[lyNd++] = b; drops[lyNd++] = c; drops[lyNd++] = d;
  }
  function lyDrops(G, m, dt, W, H, dpr) {
    const p = lyProt(m), still = reduce.matches, lw = 0.9 / V.k, seal = 1 - smooth(0.15, 0.6, p);
    // Lymph as drops drifting along the space of Disse and the terminal lymphatics to the portal tract:
    // faster as more fluid filters (the volume); each carries albumin beads, as many as its protein allows
    // (the concentration). A fixed number of drops per vessel (a count that followed the rate would make
    // them all jump to new places), and speed eased toward the model's. One path per ink, no blur.
    const lyR = clamp(lymphRate(m), 0.2, 6), beads = Math.round(1 + 4 * p);
    const gapW = G.R * 0.06, minR = 2.6 / V.k;
    lyV = lyV == null ? lyR : lyV + (lyR - lyV) * -Math.expm1(-dt / 0.5);
    const vW = G.R * 0.035 * Math.sqrt(lyV);
    // (Every drop is drawn, on the screen or not: the GPU draws them as one instanced pass.)
    // (R13: written into a kept array that grows only when the count outgrows it, not a new one each frame.)
    lyNd = 0;
    for (const t of G.tubes) {
      if (t.kind !== 'ly' && t.kind !== 'lt') continue;
      const L = t.len || 1, n = Math.max(1, Math.round(L / gapW)), dir = t.kind === 'ly' ? -1 : 1;   // the space of Disse is drawn from the edge inward
      const mo = motionOf(t);
      mo.lu = ((mo.lu ?? (t.id * 0.371) % 1) + (still ? 0 : dir * dt * vW / L) + 1) % 1;
      const r = Math.max(minR, (radiusAt(t, N >> 1) / (t.kind === 'ly' ? lyTaper(t.rho[N >> 1]) : 1)) * 0.7);
      for (let i = 0; i < n; i++) {
        const u = (mo.lu + i / n) % 1, e = Math.min(u, 1 - u) * n;   // fading in and out at the ends
        if (e < 0.25) continue;
        atInto(t.pts, u, lyAt);
        const x = lyAt[0], y = lyAt[1], tp = t.kind === 'ly' ? lyTaper(Math.hypot(x - G.cx, y - G.cy) / G.R) : 1;
        if (tp < 0.2) continue;   // too far in: the channel has thinned out
        lyPut(x, y, r * Math.min(1, e) * smooth(0.2, 0.8, tp), t.id + i);
      }
    }
    const R = lyRes;
    R.lw = lw; R.seal = seal; R.beads = beads; R.minR = minR; R.drops = lyRaw; R.nd = lyNd;
    return R;
  }
  // ── The overlay on the GPU (fx-gl.js) ──
  // The lobule's overlay (with WebGL vessels: the ductules, and with the Lymph layer the drops, beads, eraser and lining), drawn by
  // the GPU in the 2D overlay's place, scaled with the others through the dive and the rise as the tissue's GPU canvas is;
  // not without the vessels' WebGL. Its old 2D canvas stays empty (given back). ?fxgpu=0: no overlay.
  let fxGLKey = '', fxGLShown = false;
  let lyRaw = new Float32Array(0);   // the lymph's kept array of drops (R13, see lyDrops; their instance arrays are fxDI, fxBI)
  // One context for the lobule (veins-gl.js): the overlay is drawn in the vessels' own canvas, over them, at the end of each
  // picture they lay (their top), from the frame's arguments fxOnGPU leaves here (fxArgs; null: nothing laid, the 2D overlay draws),
  // with no canvas or context of its own. Made again with the vessels' renderer (a new one after a lost context). A draw the GPU
  // refused there puts the overlay back on the 2D canvas for a moment.
  let fxHostGL = null, fxHostFor = null, fxHostOff = null, fxArgs = null, fxHostBad = 0;
  const fxHosted = () => !!gl && !gl.lost && !!gl.top;
  const fxHostPart = () => fxHostGL.draw(fxArgs);
  function fxHostDraw() {
    if (!fxArgs || !fxHostGL) return;   // (a wide copy's tile lays it too: buildWideGL; the 2D tiles leave fxArgs empty)
    if (!framePart('lz.fxGL', fxHostPart)) { fxHostBad = performance.now() + 250; fxArgs = null; idleDrawn = ''; if (!raf && fade > 0) raf = nextFrame(loop); }
  }
  function fxGLOn() {
    if (fxHosted()) {
      if (fxHostFor !== gl) {
        fxHostOff?.(); fxHostFor = gl; fxHostGL = createFxGL(fxG, { host: gl.top });   // alloc-rare: only when the vessels' renderer is new (the first look, or after a lost context)
        // (Under every glass drawn in this canvas (the cards' low glass is order 1, the liver pane's 0): the overlay is the lobule's own
        // picture, so it is frosted by the cards like the rest of it, never laid over them. At order 1 it tied with the cards' glass and,
        // added after it, drew the portal tracts and the lymph over the cards: Mohammad, 2 Nov 2026, iPhone, HVPG 6.)
        fxHostOff = fxHostGL ? gl.top.add({ order: LZ_UNDER_GLASS, draw: fxHostDraw }) : null;   // alloc-rare: same branch, a new renderer
        restRemove(fxG);
      }
      return fxHostGL && !fxHostGL.lost && performance.now() >= fxHostBad ? fxHostGL : null;
    }
    return null;   // (hosted only)
  }
  function fxGLShow(on) {
    if (!on) fxArgs = null;
    if (on === fxGLShown) return;
    fxGLShown = on;
    if (!on) { fxGLKey = ''; fxHostGL?.release(); if (fxG.width) { fxG.width = 0; fxG.height = 0; } }
  }
  function fxGLOff() { fxGLShow(false); }
  // A colour token as [r, g, b, a] (0–1), whatever form it is written in (css-color.js: read in script, in the canvas's 8-bit steps).
  // (Kept by the string: cssColor8 makes a new array each time, and a colour token is the same string frame after frame.)
  const rgbaSeen = new Map();
  const rgbaOf = (str) => {
    let v = rgbaSeen.get(str);
    if (!v) { v = cssColor8(str); if (rgbaSeen.size > 256) rgbaSeen.clear(); rgbaSeen.set(str, v); }   // alloc-rare: only the first time a colour string is seen
    return v;
  };
  // The eraser as capsules (x0, y0, x1, y1, r, 0): a disc for each vessel seen end-on, each other blood vessel's segments as wide as
  // its lumen at the middle of its third, with its wall (the 0.6 / k the wall grows with the zoom is added in the shader).
  // (The two lists below are handed to fx-gl, which uploads a list again only when it is a different array from the one it last took: each
  // is written into one of two kept buffers in turn and handed on as a view of its used part, so a new list is a different array without
  // the buffers being made again.)
  let gEraseGeo = '', gErase = null, gLineGeo = '', gLine = null;
  const gEraseV = [], gLineV = [], gEraseB = [new Float32Array(0), new Float32Array(0)], gLineB = [new Float32Array(0), new Float32Array(0)];
  let gEraseSlot = 0, gLineSlot = 0, capBuf = null, capN = 0;
  // One capsule (x0, y0, x1, y1, r, 0) onto the end of the buffer being written.
  function capPut(x0, y0, x1, y1, r) {
    if (capN + 6 > capBuf.length) { const nx = new Float32Array(Math.max(256, capBuf.length * 2)); nx.set(capBuf); capBuf = nx; }
    capBuf[capN++] = x0; capBuf[capN++] = y0; capBuf[capN++] = x1; capBuf[capN++] = y1; capBuf[capN++] = r; capBuf[capN++] = 0;
  }
  // The kept calibers (rz, to 1/q) compared with a kept copy: true, and the copy updated, when they differ.
  function rzMoved(kept, rz, q) {
    let moved = false, i = 0;
    for (const key in rz) { const v = Math.round(rz[key] * q); if (!Object.is(kept[i], v)) { moved = true; kept[i] = v; } i++; }
    if (kept.length !== i) { kept.length = i; moved = true; }
    return moved;
  }
  function fxGLErase() {
    const G = geo;
    const moved = rzMoved(gEraseV, rzOf(), 1e5) || gEraseGeo !== geoKey || !gErase;
    if (!moved) return gErase;
    gEraseGeo = geoKey;
    gEraseSlot ^= 1; capBuf = gEraseB[gEraseSlot]; capN = 0;
    for (const t of G.tubes) {
      if (t.lymph || t.kind === 'ly' || t.kind === 'lt' || t.kind === 'lv') continue;
      const wall = WALL[t.kind] || 0.8;
      if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd') { const [x0, y0] = t.pts[0]; capPut(x0, y0, x0, y0, radiusAt(t, N >> 1) + wall); continue; }
      for (let q = 0; q < 3; q++) {
        const i0 = Math.floor((q * (N - 1)) / 3), i1 = Math.floor(((q + 1) * (N - 1)) / 3), r = radiusAt(t, (i0 + i1) >> 1) + wall;
        for (let i = i0; i < i1; i++) capPut(t.pts[i][0], t.pts[i][1], t.pts[i + 1][0], t.pts[i + 1][1], r);
      }
    }
    gEraseB[gEraseSlot] = capBuf;
    return (gErase = capBuf.subarray(0, capN));   // alloc-rare: only when the eraser's key changed (the geometry or the calibers)
  }
  // The sinusoid lining as capsules, a line either side of each sinusoid lw out from its lumen, lw wide.
  function fxGLLine(lw) {
    const G = geo, z = rzOf();
    const moved = gLineV[0] !== Math.round(z.sin * 1e5) || gLineV[1] !== Math.round(z.congU * 1e5) || gLineV[2] !== Math.round(V.k * 1e5) || gLineGeo !== geoKey || !gLine;
    if (!moved) return gLine;
    gLineV[0] = Math.round(z.sin * 1e5); gLineV[1] = Math.round(z.congU * 1e5); gLineV[2] = Math.round(V.k * 1e5); gLineGeo = geoKey;
    gLineSlot ^= 1; capBuf = gLineB[gLineSlot]; capN = 0;
    for (const t of G.tubes) {
      if (t.kind !== 's0' && t.kind !== 's1' && t.kind !== 's2') continue;
      for (let side = -1; side <= 1; side += 2) {
        let has = false, lastX = 0, lastY = 0;
        for (let i = 0; i < t.pts.length; i++) {
          if (t.rho[i] < CV_STOP) continue;
          const x = t.pts[i][0], y = t.pts[i][1];
          const [xa, ya] = t.pts[Math.max(0, i - 1)], [xb, yb] = t.pts[Math.min(N - 1, i + 1)], d = Math.hypot(xb - xa, yb - ya) || 1;
          const o = side * (radiusAt(t, i) + lw), px = x - ((yb - ya) / d) * o, py = y + ((xb - xa) / d) * o;
          if (has) capPut(lastX, lastY, px, py, lw / 2);
          has = true; lastX = px; lastY = py;
        }
      }
    }
    gLineB[gLineSlot] = capBuf;
    return (gLine = capBuf.subarray(0, capN));   // alloc-rare: only when the lining's key changed (the geometry, the calibers or the zoom)
  }
  // What fxOnGPU keeps between frames, so a frame makes none of it: the effects layer's arguments (written in place; fx-gl reads them within
  // the draw, and the hosted draw later in the same frame), the lymph's, the colours, the key of a still frame as numbers and the two
  // lists of drop instances handed to fx-gl (see above: a different array each frame, as it uploads the drops every frame).
  const fxMovesArg = { lymph: false, flat: false, hide: false, flow: undefined };
  const fxDc = ['', '', '', ''], fxKNow = [], fxKWas = [];
  const fxLymph = { drops: null, beadRings: null, erase: null, eraseAdd: 0, ringHalf: 0, line: null, colours: { ly: null, ring: null, bead: null, line: [0, 0, 0, 0] } };
  const fxLineCol = [0, 0, 0, 0], fxNoLine = [0, 0, 0, 0];
  const fxArgsKept = { W: 0, H: 0, view: [0, 1, 0, 1], lymph: null, ducts: null, duct: { lum: null, cell: null, edge: null, nuc: null, width: 0, alpha: 0.72 } };
  const fxDI = [new Float32Array(0), new Float32Array(0)], fxBI = [new Float32Array(0), new Float32Array(0)];
  let fxFlip = 0, fxTg = null;
  const fx2D = () => { if (fx.width) { free(fx); } };
  const fxDrawPart = () => fxTg.draw(fxArgsKept);
  function fxOnGPU(W, H, dpr, dark, dt, can) {
    const g = can && FX_GPU ? fxGLOn() : null;
    if (!g) { fxGLShow(false); return false; }
    // (Hosted: at the vessels' canvas's density, as drawGL sizes it.)
    const hosted = g === fxHostGL, vk = hosted ? dpr * (gl.software ? 0.5 : 1) : dpr;
    const fw = hosted ? Math.max(1, Math.round(W * vk)) : canvasPx(W, dpr), fh = hosted ? Math.max(1, Math.round(H * vk)) : canvasPx(H, dpr), G = geo, m = model;
    fxMovesArg.lymph = lymphOn; fxMovesArg.hide = m.hide; fxMovesArg.flow = store.get().layers?.flow;
    const moving = fxMoves(fxMovesArg);
    fxDc[0] = tk('--lz-duct-lumen'); fxDc[1] = tk('--lz-duct-cell'); fxDc[2] = tk('--lz-duct-edge'); fxDc[3] = tk('--lz-duct-nucleus');
    const dc = fxDc;
    // (A still frame's key, the size, the pixel ratio, the theme, the ductules, the view and the colours, kept as numbers and strings in a
    // kept array and compared slot by slot; fxGLKey is '' for none: while the overlay moves, and after it is shown or given back.)
    const K = fxKNow;
    let same = false;
    if (!moving) {
      let ki = 0;
      K[ki++] = fw; K[ki++] = fh; K[ki++] = dpr; K[ki++] = dark; K[ki++] = m.hide; K[ki++] = m.hide ? '' : fxDuct().key; K[ki++] = V.k; K[ki++] = V.x; K[ki++] = V.y;
      K[ki++] = dc[0]; K[ki++] = dc[1]; K[ki++] = dc[2]; K[ki++] = dc[3];
      same = fxGLKey !== '';
      for (let i = 0; same && i < ki; i++) if (!Object.is(K[i], fxKWas[i])) same = false;
    }
    // (The old 2D overlay canvas is kept empty: given back.)
    if (!moving && same && fxGLShown && !hosted) { fx2D(); return true; }
    let lymph = null;
    if (lymphOn && !m.hide) {
      const { lw, seal, beads, minR, drops, nd: n4 } = lyDrops(G, m, dt, W, H, dpr);
      const nd = n4 / 4;
      // (R13: the drops' and the beads' instance arrays kept, grown only when outgrown, and handed on as views of their used length; two of each in
      // turn, so the views of two frames in a row are different arrays, which fx-gl takes as new data and uploads.)
      fxFlip ^= 1;
      if (fxDI[fxFlip].length < nd * 6) fxDI[fxFlip] = new Float32Array(Math.max(nd * 6, fxDI[fxFlip].length * 2));   // alloc-rare: only when the drops outgrow the kept array
      if (fxBI[fxFlip].length < nd * beads * 6) fxBI[fxFlip] = new Float32Array(Math.max(nd * beads * 6, fxBI[fxFlip].length * 2));   // alloc-rare: only when the beads outgrow the kept array
      const dI = fxDI[fxFlip].subarray(0, nd * 6), bI = fxBI[fxFlip].subarray(0, nd * beads * 6);
      dI.fill(0); bI.fill(0);
      for (let j = 0, b6 = 0; j < nd; j++) {
        const x = drops[j * 4], y = drops[j * 4 + 1], rr = drops[j * 4 + 2], br = rr * 0.3, a0 = drops[j * 4 + 3] * 1.7;
        dI[j * 6] = x; dI[j * 6 + 1] = y; dI[j * 6 + 2] = x; dI[j * 6 + 3] = y; dI[j * 6 + 4] = rr;
        for (let b = 0; b < beads; b++, b6 += 6) {
          const a = a0 + (b * TAU) / beads, q = beads === 1 ? 0 : rr * 0.5, bx = x + Math.cos(a) * q, by = y + Math.sin(a) * q;
          bI[b6] = bx; bI[b6 + 1] = by; bI[b6 + 2] = bx; bI[b6 + 3] = by; bI[b6 + 4] = br;
        }
      }
      const lineOn = seal > 0.02;
      lymph = fxLymph;
      lymph.drops = dI; lymph.beadRings = bI; lymph.erase = fxGLErase(); lymph.eraseAdd = 0.6 / V.k; lymph.ringHalf = Math.max(0.5 / V.k, minR * 0.22) / 2;
      lymph.line = lineOn ? fxGLLine(lw) : null;
      const C = lymph.colours;
      C.ly = rgbaOf(tk('--lz-lymph')); C.ring = rgbaOf(tk('--lz-albumin-ring')); C.bead = rgbaOf(tk('--lz-albumin'));
      // (The lining's colour: the token's, at the seal's alpha to a thousandth and then in 8-bit steps, as the token with that alpha was read.)
      if (lineOn) {
        const base = rgbaOf(tk('--lz-collagen'));
        fxLineCol[0] = base[0]; fxLineCol[1] = base[1]; fxLineCol[2] = base[2]; fxLineCol[3] = Math.round(Math.round((dark ? 0.6 : 0.5) * seal * 1000) / 1000 * 255) / 255;
        C.line = fxLineCol;
      } else C.line = fxNoLine;
    }
    const args = fxArgsKept;
    args.W = fw; args.H = fh; args.view[0] = V.k; args.view[1] = V.x; args.view[2] = V.y; args.view[3] = vk; args.lymph = lymph;
    args.ducts = m.hide ? null : fxDuct().nums;
    const D = args.duct;
    D.lum = rgbaOf(dc[0]); D.cell = rgbaOf(dc[1]); D.edge = rgbaOf(dc[2]); D.nuc = rgbaOf(dc[3]); D.width = Math.max(0.3, G.R * 0.0013);
    // (Hosted: laid by the vessels' present, which follows in this frame's drawGL.)
    let ok = true;
    if (!hosted) { fxTg = g; ok = framePart('lz.fxGL', fxDrawPart); }
    if (!ok) { fxGLShow(false); return false; }
    if (hosted) fxArgs = args;
    if (moving) fxGLKey = '';
    else { for (let i = 0; i < fxKNow.length; i++) fxKWas[i] = fxKNow[i]; fxGLKey = 'y'; }
    fxGLShow(true);
    fx2D();
    return true;
  }
  // What a point on the lobule is: written into `o` (a part and where, as a selection takes it), or only asked (o null: the pointer's hover
  // asks on every move, and needs no more than whether it is on a part). True when it is on one.
  function hitInto(x, y, o) {
    const G = geo, m = model;
    if (!G || !m) return false;
    for (const tr of G.triads) if (Math.hypot(x - tr.x, y - tr.y) < G.rt * 1.2) {
      if (Math.hypot(x - tr.ha[0], y - tr.ha[1]) < Math.max(G.R * 0.03, 10 / V.k)) { if (o) { o.part = 'ha'; o.tri = tr.i; } return true; }
      if (Math.hypot(x - tr.bd[0], y - tr.bd[1]) < Math.max(G.R * 0.03, 10 / V.k)) { if (o) { o.part = 'bd'; o.tri = tr.i; } return true; }
      if (lymphOn && Math.hypot(x - tr.lv.pts[0][0], y - tr.lv.pts[0][1]) < Math.max(G.R * 0.03, 10 / V.k)) { if (o) { o.part = 'lv'; o.tri = tr.i; } return true; }
      if (o) { o.part = 'triad'; o.tri = tr.i; }
      return true;
    }
    if (Math.hypot(x - G.cx, y - G.cy) < radiusAt(G.cv, 0) + 4) { if (o) o.part = 'cv'; return true; }
    let best = null, bd = Infinity;
    for (const t of G.tubes) {
      if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd' || (t.lymph && !lymphOn)) continue;
      const d = distTo(t.pts, x, y), r = radiusAt(t, N >> 1), tol = Math.max(r + (t.kind === 'tw' ? 6 : 5), 10 / V.k);
      const score = d - r - (t.kind === 'tw' ? 2 : 0);
      if (d < tol && score < bd) { bd = score; best = t; }
    }
    if (best) { if (o) { o.part = best.kind === 'tw' ? 'ha' : best.lymph ? 'lv' : best.kind[0] === 's' ? 'sin' : best.kind; o.tube = best.id; o.tri = best.tri; } return true; }
    if (m.septU > 0.1) {
      const C = G.lobules[0].corners, w = G.R * (0.02 + 0.05 * m.septU) / 2 + 4;
      for (let i = 0; i < 6; i++) { const A = C[i], B = C[(i + 1) % 6], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = clamp(((x - A[0]) * dx + (y - A[1]) * dy) / L2, 0, 1); if (Math.hypot(A[0] + dx * t - x, A[1] + dy * t - y) < w) { if (o) o.part = 'septum'; return true; } }
      if (m.septU > 0.18) for (const sp of G.septaPC) if (distTo(sp.pts, x, y) < w) { if (o) o.part = 'septum'; return true; }
    }
    const q = hexFrac(x, y, G.cx, G.cy, G.R);
    if (q < 1) { if (o) { o.part = 'hep'; o.zone = zoneOf(q); } return true; }
    return false;
  }
  // The part under a point as a new object (a selection is made from it: a click, once per gesture), or null.
  function hit(x, y) {
    const o = {};   // alloc-rare: only for a click or tap (a selection is made from it), never for the pointer's hover
    return hitInto(x, y, o) ? o : null;
  }
  const hitOver = (x, y) => hitInto(x, y, null);
  function chainOf(id) {
    const out = new Set([id]);   // alloc-rare: only when the selection changes (selIds keeps the ids of the selection it was last asked for)
    let t = geo.tubes[id];
    while (t?.parent != null) { out.add(t.parent); t = geo.tubes[t.parent]; }
    return out;
  }

  // ── One level deeper: into a sinusoid (sinusoid-view.js) ──
  // "Zoom into the sinusoid" on a sinusoid's card plays one continuous zoom, gentle at both ends: the
  // lobule grows about that sinusoid, turning it to lie along the screen and carrying it to where the
  // sinusoid view draws its own; as the zoom lands the sinusoid view, at the same size and angle, resolves in and
  // covers it. Zooming out (the zoom buttons, a pinch, the wheel), its back button or Escape reverse it.
  const sv = createSinusoidView({ host, before, share: { top: () => (shared && shareTop && gl && !gl.lost ? shareTop : null), order: LZ_UNDER_GLASS - 4, capOrder: LZ_UNDER_GLASS + 2 } });   // (the sinusoid is a pass of the stage's present too, over the lobule's, under the glass)
  let sinU = 0, sinTo = 0, sinRaf = 0, sinDive = null, sinPick = null, quietSin = false, sinPending = false;
  let sinZ = 0;   // (sinZ: the sinusoid zoom's log scale so far, for the tests)
  const easeIO = easeMove;   // (the sinusoid zoom is a move of the view: the camera's quintic, ease.js, which the pill and the bars that ride it share)
  // Which sinusoid, and where on it: the one whose card is open, else the one carrying the label.
  const sinPickObj = { tube: 0, w: null };   // (the pick, one object kept: sinPick is the last one made)
  function sinusoidPick() {
    const sl = store.get().selection, G = geo, P = sinPickObj;
    const own = sl?.type === 'lobule' && (sl.part === 'sin' || sl.part === 'an') && G.tubes[sl.tube];
    if (own) { P.tube = own.id; P.w = sl.at || at(own.pts, 0.45); return P; }   // alloc-rare: once per sinusoid zoom (a pick), never a frame's
    // Otherwise a long, straight stretch of a sinusoid that already runs the way the sinusoid view does (from
    // the portal side toward the central vein, across a landscape screen, down a portrait one), near the
    // middle of the screen: the zoom then only grows it, with hardly any turn, and the straight vessel of
    // the view lies along the lobule's own one.
    const ang = sv.frame().ang, mx = G.W / 2, my = G.H / 2, D = Math.hypot(G.W, G.H);
    let bs = Infinity, found = false;
    for (const t of G.tubes) {
      if (t.kind !== 's0' && t.kind !== 's1' && t.kind !== 's2') continue;
      for (let i = 3; i < N - 3; i += 2) {
        const g = straightRun(t, i), x = t.pts[i][0] * V.k + V.x, y = t.pts[i][1] * V.k + V.y;
        if (x < 20 || y < 20 || x > G.W - 20 || y > G.H - 20) continue;
        const turn = Math.abs(Math.atan2(Math.sin(ang - g.th), Math.cos(ang - g.th)));
        const sc = turn * 2.5 - Math.min(g.run[0], g.run[1], 14) * 0.08 + Math.hypot(x - mx, y - my) / D;
        if (sc < bs) { bs = sc; found = true; P.tube = t.id; P.w = t.pts[i]; }
      }
    }
    if (found) return P;
    const t = sinTube();
    P.tube = t.id; P.w = at(t.pts, 0.45);   // alloc-rare: once per sinusoid zoom (a pick), never a frame's
    return P;
  }
  // At sample i of a sinusoid: the blood's direction (toward the central vein), and how far the vessel stays
  // straight from there each way (back toward the portal side, on toward the central vein), in lumen radii.
  const srOut = { th: 0, run: [0, 0] };   // (straightRun's answer, one object kept: its callers read it at once)
  function straightRun(t, i) {
    const G = geo, P = t.pts, A = P[Math.max(0, i - 1)], B = P[Math.min(N - 1, i + 1)];
    let th = Math.atan2(B[1] - A[1], B[0] - A[0]), dir = 1;
    if (Math.hypot(B[0] - G.cx, B[1] - G.cy) > Math.hypot(A[0] - G.cx, A[1] - G.cy)) { th += Math.PI; dir = -1; }
    const ux = Math.cos(th), uy = Math.sin(th), r = Math.max(1e-3, radiusAt(t, i)), run = srOut.run;
    run[0] = 0; run[1] = 0;
    for (let k = 0; k < 2; k++) {
      const sg = k === 0 ? -1 : 1;
      for (let j = i + sg * dir; j >= 0 && j < N; j += sg * dir) {
        const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
        if (Math.abs(-dx * uy + dy * ux) > 0.6 * r) break;
        run[k] = Math.abs(dx * ux + dy * uy) / r;
      }
    }
    srOut.th = th;
    return srOut;
  }
  // (keep: an earlier geometry whose sinusoid end is kept, so only the lobule end moves.)
  const diveObj = { p: [0, 0], c: [0, 0], q: [0, 0], rot: 0, Z: 1, run: [0, 0], k: 1, ang: 0, lumen: 0 };   // (the zoom's geometry, one object kept and written in place: sinDive is it, or null)
  function diveGeometry(keep) {
    const G = geo, t = G.tubes[sinPick.tube];
    distTo(t.pts, sinPick.w[0], sinPick.w[1]);
    const u = distU, i = clamp(Math.round(u * (N - 1)), 1, N - 2), sr = straightRun(t, i), th = sr.th;
    atInto(t.pts, u, diveAt);
    const p0 = diveAt[0] * V.k + V.x, p1 = diveAt[1] * V.k + V.y;
    // (The frame the zoom lands on, as the sinusoid view rests, or the earlier geometry's own: taken before anything is written, keep being this same object.)
    let Fx, Fy, Fang, Fk, Flumen;
    if (keep) { Fx = keep.c[0]; Fy = keep.c[1]; Fang = keep.ang; Fk = keep.k; Flumen = keep.lumen; }
    else { const F = sv.frame(); Fx = F.x; Fy = F.y; Fang = F.ang; Fk = F.k; Flumen = F.lumen; }
    const rot = Math.atan2(Math.sin(Fang - th), Math.cos(Fang - th));
    const Z = clamp(Flumen / Math.max(0.05, 2 * radiusAt(t, i) * V.k), 1.5, 400);
    // The zoom is one similarity, from the lobule as it is to the sinusoid view as it rests (p to the view's
    // centre c, turned by rot, grown by Z), taken a fraction at a time about its fixed point q: nothing slides,
    // everything grows out of q, and the lobule's sinusoid stays exactly where the view draws it.
    const m = Z * Math.cos(rot), n = Z * Math.sin(rot);
    const bx = Fx - (m * p0 - n * p1), by = Fy - (n * p0 + m * p1);
    const a = 1 - m, b = n, det = a * a + b * b;   // (I − M) q = c − M p, with I − M = [a b; −b a]
    const D = diveObj;
    D.p[0] = p0; D.p[1] = p1; D.c[0] = Fx; D.c[1] = Fy; D.q[0] = (a * bx - b * by) / det; D.q[1] = (b * bx + a * by) / det;
    D.rot = rot; D.Z = Z; D.run[0] = sr.run[0]; D.run[1] = sr.run[1]; D.k = Fk; D.ang = Fang; D.lumen = Flumen;
    return D;
  }
  // On the way back out, the space the lobule lands in opens just after the zoom starts (the dock, and on a phone or upright
  // iPad the top bar's second row, come back as the sinusoid view closes, a frame later). The zoom is aimed afresh at the
  // lobule's new framing then, keeping its sinusoid end, so it lands there in one move: it used to land on the old framing
  // and then pan (and zoom) to the new one (17 Oct, Mohammad). (Early in the zoom the two paths nearly coincide: at its start
  // both are the sinusoid view exactly, whatever the lobule's framing, so the switch is not seen.)
  function reaimOut() {
    if (sinTo !== 0 || sinU <= 0 || !sinDive || rubber) return false;
    const hs = hostSize();
    if (hs[0] !== geo.W || hs[1] !== geo.H) return false;   // a new size: built for it once the zoom has landed, as before
    const F0 = fitV(); kFit = F0.k;
    if (atFit) Object.assign(V, F0); else clampV();
    sinDive = diveGeometry(sinDive);
    // (The lobule is drawn once more at its new framing, still under the zoom's transform.)
    diveDrawn = false; refitLater = false; viewChanged(); placeSinusoid();
    return true;
  }
  // (What the sinusoid view is told each frame of the zoom, kept and written in place: the view reads it within place() and holds the dive
  // object as the last it was given, whose values are then the latest, as the last object's were.)
  let orq0 = NaN, orq1 = NaN, orStr = '';
  const placeArg = { opacity: 0, dive: null, isOpen: false }, diveArg = { g: 0, p: null, q: null, rot: 0, Z: 1, run: null, k: 1, ang: 0 };
  function placeSinusoid() {
    const u = sinU, rm = reduce.matches;
    let D = sinDive;
    if (!D || u <= 0) {
      sinZ = 0;
      el.style.transform = ''; el.style.transformOrigin = ''; el.style.visibility = ''; classSoon(el, 'lz-sin', false);
      elXf.rot = 0; elXf.Z = 1;
      placeArg.opacity = 0; placeArg.dive = null; placeArg.isOpen = false;
      sv.place(placeArg);
      return;
    }
    // On the way in the view's resting place is read afresh each frame: the dock and the side pieces leave as the
    // zoom starts (and the credit line slides down), so the frame they free settles early in the zoom, which then
    // lands on it, with no second move after it. (On the way out it is kept, so the lobule is reached as it was.)
    if (D && sinTo === 1 && u > 0 && u < 1 && !rm) D = sinDive = diveGeometry();
    const g = rm ? 1 : easeIO(u);
    sinZ = Math.log(D.Z) * g;
    // The lobule: turned and grown about the zoom's fixed point.
    // (The fixed point's text made again only when it moves a hundredth of a pixel: it settles early in the zoom, once the space the lobule lands in has opened.)
    const oq0 = Math.round(D.q[0] * 100), oq1 = Math.round(D.q[1] * 100);
    if (oq0 !== orq0 || oq1 !== orq1) { orq0 = oq0; orq1 = oq1; orStr = `${(oq0 / 100).toFixed(2)}px ${(oq1 / 100).toFixed(2)}px`; }   // alloc-rare: only when the zoom's fixed point moved a hundredth of a pixel
    el.style.transformOrigin = rm ? '' : orStr;
    el.style.transform = rm ? '' : `rotate(${(D.rot * g).toFixed(5)}rad) scale(${(D.Z ** g).toFixed(5)})`;
    elXf.rot = rm ? 0 : D.rot * g; elXf.Z = rm ? 1 : D.Z ** g; elXf.ox = D.q[0]; elXf.oy = D.q[1];
    if (shareTop && gl && !gl.lost) shareTop.present();
    el.style.visibility = u >= 1 ? 'hidden' : '';
    classSoon(el, 'lz-sin', true);
    // The sinusoid view: drawn by the GPU on the lobule's sinusoid each frame; it comes in over the lobule as the zoom lands.
    let dv = null;
    if (!(u >= 1 || rm)) { dv = diveArg; dv.g = g; dv.p = D.p; dv.q = D.q; dv.rot = D.rot; dv.Z = D.Z; dv.run = D.run; dv.k = D.k; dv.ang = D.ang; }
    placeArg.opacity = (rm ? u : 1) * fade; placeArg.dive = dv; placeArg.isOpen = u >= 1 && fade > 0.98;
    sv.place(placeArg);
  }
  function applyChrome() {
    const ch = clamp((fade - 0.55) / 0.45, 0, 1);
    el.style.setProperty('--lz-chrome', (ch * ch * (3 - 2 * ch)).toFixed(3));
  }
  function resetSinusoid() { cancelFrame(sinRaf); sinU = 0; sinTo = 0; sinDive = null; placeSinusoid(); }
  function diveSinusoid(on) {
    if (quietSin) { sinTo = 0; cancelFrame(sinRaf); return; }   // the lobule view is closing: the sinusoid fades out with it
    // Asked for while the dive into the lobule is still on its way: it carries on into the sinusoid once the dive lands (setDiveZoom).
    if (on && fade < 0.98 && sv.available && store.get().lobule) sinPending = true;
    if (on && (!geo || fade < 0.98 || !model || !sv.available)) { queueMicrotask(() => { if (store.get().sinusoid && !sinTo) store.set({ sinusoid: false }); }); return; }   // alloc-rare: only when the zoom is asked for while the lobule cannot take it (once per such request)
    const to = on ? 1 : 0;
    if (to === sinTo && sinU === to) return;
    sinTo = to;
    // (A flick or a button's glide still moving would carry the lobule off the vessel the zoom is aimed at: stopped first.)
    if (on && sinU === 0) { stopInertia(); cancelFrame(glide); gliding = false; sinPick = sinusoidPick(); sv.setModel(model); }
    // Back out from the sinusoid after the screen changed size (turned, a window resized): the lobule is built and framed for the new size
    // first, so the zoom lands on it as it will stay (it landed at the old size and then refitted).
    if (!on && sinU === 1) {
      const [W, H] = snap.hostWH || [Math.max(1, snap.w), Math.max(1, snap.h)], was = geoKey;   // alloc-rare: the array only when the rest read has no box yet, once per gesture   // (the host's box as the last rest read took it: the observer reads it on every resize, never in this frame)
      ensureGeo(W, H);
      if (geoKey !== was) sinPick = sinusoidPick();
      if (refitLater || geoKey !== was) { refitLater = false; const F0 = fitV(); kFit = F0.k; if (atFit) Object.assign(V, F0); else clampV(); }
    }
    // From a standstill the geometry is read afresh (the lobule may have been resized); reversing mid-way keeps it.
    if (sinU === 0 || sinU === 1) sinDive = diveGeometry();
    const sl = store.get().selection;
    if (sl && (on ? sl.type === 'lobule' : sl.type === 'sinusoid')) store.set({ selection: null });   // alloc-rare: once per sinusoid-zoom gesture, clearing the selection
    // On the way out the lobule is drawn once in its present state, so it does not change when it lands.
    if (!on) { diveDrawn = false; drawVersion++; tissueKey = ''; layoutKey = ''; }
    if (!raf && fade > 0) raf = nextFrame(loop);
    // (Lite mode: no zoom into or out of the sinusoid; it fades in.)
    const from = sinU, ms = (reduce.matches ? 280 : on ? 1150 : 950) * Math.abs(to - from);
    // (On the eases' clock, frame.js easeNow: a long frame holds the zoom back rather than letting it leap.)
    const t0 = PACED ? easeNow() : performance.now();
    cancelFrame(sinRaf);
    const step = (now) => {   // alloc-rare: once per sinusoid-zoom gesture (its start); the frames of the zoom call this same function
      const t = ms > 0 ? clamp(((PACED ? easeNow() : now) - t0) / ms, 0, 1) : 1;
      sinU = lerp(from, to, t); placeSinusoid();
      if (t < 1) sinRaf = nextFrame(step);
      else if (!on) { sinDive = null; drawVersion++; if (!raf && fade > 0) raf = nextFrame(loop); if (refitLater) refit(); }
    };
    sinRaf = nextFrame(step);
  }
  store.on('sinusoid', (on) => diveSinusoid(!!on));
  // (Checked when the zoom lands and when the lobule is fully in, whichever comes last: a slow frame can do both at once.)
  function sinOnLanding() {
    if (diveScaled || !sinPending || fade <= 0.98) return;
    sinPending = false;
    restPass(() => { const st = store.get(); if (st.lobule && !st.sinusoid && fade > 0.98) store.set({ sinusoid: true }); });   // alloc-rare: once, when a zoom into the sinusoid asked for while the dive was on its way lands   // (the store's listeners run between frames, not in one)
  }
  store.on('lobule', (on) => { if (!on) sinPending = false; if (!on && store.get().sinusoid) { quietSin = true; store.set({ sinusoid: false }); quietSin = false; } });   // alloc-rare: only when the lobule closes while the sinusoid view is open (once per gesture)

  // Named pieces for the frame-time gate (framePart, frame.js): the dive's staging ran 4 to 17 s outside the scheduler on CI's profiles
  // with nothing inside it named. Each call is unchanged; only while frames are watched is it timed.
  const timed = (tag, f) => (...a) => framePart(tag, () => f(...a));
  /* eslint-disable no-func-assign */
  drawGL = timed('lz.drawGL', drawGL); paintTissue = timed('lz.paintTissue', paintTissue);
    update = timed('lz.update', update); ensureGeo = timed('lz.ensureGeo', ensureGeo); fieldTile = timed('lz.fieldTile', fieldTile);
  /* eslint-enable no-func-assign */
  // The ?perf surfaces list (gpu-surfaces.js): the lobule's own canvases, from the state kept here. Read by the readout only.
  const lzShown = () => fade > 0 || fieldOp > 0;
  // (The readout's answers are fixed objects, one for each state: the readout copies what it needs from them.)
  const SURF_GPU = { on: 'gpu', via: 'WebGL2' };
  const SURF_TISSUE = [{ on: 'fallback', via: '2D canvas', why: 'no WebGL2 for the tissue' }, { on: 'fallback', via: '2D canvas', why: 'context lost' }, { on: 'fallback', via: '2D canvas', why: 'the GPU has not drawn it yet' }];
  const SURF_FIELD = [{ on: 'fallback', via: '2D canvas', why: 'no WebGL2 for the field' }, { on: 'fallback', via: '2D canvas', why: 'context lost' }, { on: 'fallback', via: '2D canvas', why: 'a tile the GPU could not take' }];
  const SURF_VESSELS = [{ on: 'fallback', via: '2D canvas', why: 'no WebGL2' }, { on: 'fallback', via: 'WebGL2 on the CPU', why: 'context lost' }, { on: 'fallback', via: 'WebGL2 on the CPU', why: 'software renderer' }];
  surface('lobule tissue', () => {
    if (!(fade > 0)) return null;
    if (tissueOnGL) return SURF_GPU;
    return SURF_TISSUE[tissueGL === null ? 0 : tissueGL?.lost ? 1 : 2];
  });
  surface('lobule field (neighbouring lobules)', () => {
    if (!(fieldOp > 0)) return null;
    if (fieldG.width && fieldG.style.opacity !== '0') return SURF_GPU;
    return SURF_FIELD[fieldGL === null ? 0 : fieldGL?.lost ? 1 : 2];
  });
  surface('lobule vessels', () => {
    if (!lzShown()) return null;
    if (gl && !gl.lost && !gl.software) return SURF_GPU;
    return SURF_VESSELS[!gl ? 0 : gl.lost ? 1 : 2];
  });
  const api = {
    el,
    update,
    /** 0 = hidden, 1 = fully in the lobule. It fades in where it stands, over the dive's field. */
    setFade(u) {
      const was = fade;
      fade = clamp(u, 0, 1);
      el.style.opacity = fade.toFixed(3);
      el.classList.toggle('lz-live', fade > 0);   // (its compositor layer only while it is shown)
      // The tissue first, then its labels and card (and on the way out, those go first).
      applyChrome();
      el.classList.toggle('on', fade > 0.98);
      if (fade > 0.98 && was <= 0.98) sinOnLanding();
      if (fade > 0 && was <= 0) cap.paint();   // (the names are placed in the frames they are drawn in: none was while the view was out)
      restAttr(el, 'aria-hidden', String(fade < 0.98));
      // Entering: the lobule is framed.
      // (Its flow marks start faded and ease in once it has landed: left at full from an earlier visit, they made every frame of the
      // dive's first 0.3 s redraw the whole lobule at full size.)
      // (Drawn ahead in the dive (staged), and still framed the same: nothing more to draw, the loop just starts.)
      // (A copy built for a framing the dive no longer lands on is dropped: the layers are drawn again for the new one below.)
      if (fade > 0 && was === 0 && wide && !(staged && staged === api.viewKey() && model)) dropWide();
      if (fade > 0 && was === 0) { lzK = renderScale(); lzWant = null; }
      if (fade > 0 && was === 0) { flowA = 0; flowT = 0; resetView(); relLater = false; if (staged && staged === api.viewKey() && model) { if (!raf) raf = nextFrame(loop); } else { diveDrawn = false; snapState(); if (F) update(F); } staged = ''; }
      // Leaving the lobule closes a part's card, so it is not waiting next time.
      if (was > 0.98 && fade <= 0.98) { stopInertia(); if (store.get().selection?.type === 'lobule') store.set({ selection: null }); }
      // (Mid-zoom out, the canvases are given back when the zoom ends: freeing them there is one more thing in a moving frame.)
      if (fade === 0 && was > 0) cap.hideAll();   // (the names go at once with the view, never left drawn, collapsed by the dive's scale; they fade in again, placed afresh, on the next visit)
      if (fade === 0) { resCoverEnd(); cancelFrame(raf); raf = 0; last = 0; if (was > 0) { if (diveScaled) relLater = true; else release(); } }
      // Out of the lobule: a presenter's aim is spent (the next way in frames the whole lobule).
      if (fade === 0 && was > 0) { aimed = null; heldFree = null; }
      // Leaving the lobule view from inside a sinusoid: the sinusoid fades out with it.
      if (sinU > 0) { if (fade === 0) resetSinusoid(); else placeSinusoid(); }
    },
    /** Where the lobule will sit once open (stage px): its centre and radius, framed as it opens. */
    landing() {
      readAll();   // (the lobule opens: its boxes read once, here, for the frames of the dive)
      const rect = host.getBoundingClientRect();
      ensureGeo(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));

      resetView();
      return { x: sX(geo.cx), y: sY(geo.cy), r: geo.R * V.k };
    },
    /** Where the lobule is now (it may be zoomed or panned), for the way out. */
    current() {
      if (!geo) return this.landing();
      return { x: sX(geo.cx), y: sY(geo.cy), r: geo.R * V.k };
    },
    setDive: (d) => framePart('lz.setDive', () => paintField(d)),
    sinBusy: () => sinBusyNow(),
    // (The vessel canvas keeps no picture between frames (veins-gl.js ownBuf): a reader outside the frame lays it first.)
    capture: () => gl?.capture?.() ?? null,
    /** Whether the lobule is drawn in the stage's own GPU context (the glass and the dive then need no hand-over). */
    get shared() { return shared; },
    /** Counts the pictures the lobule laid (shared: with the figure's, the glass over both blurs again when it changes). */
    drawSeq: () => gl?.drawSeq ?? 0,
    sinusoidOpen: () => sv.isOpen(),
    /** The GPU canvas the cards' frosted glass is drawn into while the liver shows (stage.js frostSrc; Mohammad, 2 Nov 2026: "No blur at all on
     *  top, solid card on bottom"): the open sinusoid's, or the landed lobule's vessel canvas (its tissue is laid in it too), or null while
     *  either is moving (a dive, the zoom into or out of a sinusoid), drawn as tiles, or has no such canvas. { gl, canvas, add, warmIn, now,
     *  seq, onPicture }. */
    glassHost() {
      // (4 Nov 2026: the shared branch is asked first, so the glass stays on the figure's canvas through the zoom into and out of a sinusoid too.)
      // (Hosted in the stage's context, the lobule is part of the figure's own canvas: the glass is taken from it through a dive and a zoom too.)
      if (shared && shareTop && gl && !gl.lost) { const f = shareTop, g = gl; return { gl: f.gl, canvas: f.canvas, add: f.add, warmIn: f.warmIn, now: () => { if (!g.lost) f.present(); }, seq: () => g.drawSeq, onPicture: (fn) => g.onPicture(fn) }; }
      if (sinU > 0 || sinTo === 1) return !sinBusyNow() && sv.isOpen() ? sv.glassHost?.() ?? null : null;
      if (fade <= 0.98 || diveScaled || !gl || gl.lost || !gl.top || wide || el.style.transform || glCv.style.visibility === 'hidden') return null;
      const g = gl;
      return { gl: g.top.gl, canvas: g.top.canvas, add: g.top.add, warmIn: g.top.warmIn, now: () => { if (!g.lost) g.present(); }, seq: () => g.drawSeq, onPicture: (f) => g.onPicture(f) };
    },
    sinusoidMoving: () => !!sv.labelsMoving?.(),
    /** The glasses over the liver's names, leaders and the sinusoid's names (stage.js, glass-gl.js tellHoles): what lies under one is left out. */
    setHoles(list) { cap.holes(list); leadGL.setHoles(list); sv.setHoles(list); },
    sinZoom: () => sinZ,
    /** What the GPU's names drew in the last frame that landed ({ seq, gen, w, h, items }, label-captions.js snapshot: CSS px from the names' canvas corner), for the browser checks. */
    captions: () => cap.snapshot(),
    /** A tap at client (x, y) in a talk (N4, label-explain.js): explains the station label the GPU drew there, or ends it when it is the one explained. True when a label took the tap. */
    explainAt(x, y) {
      if (!model || !classHas(appEl ?? document.querySelector('.app'), 'presenting')) return false;
      if (sv.isOpen()) {   // (the sinusoid's own names: sinusoid-view.js)
        const hit = sv.explainHit(x, y);
        if (!hit) return false;
        explainSet(hit.key === exKey ? null : hit.key, hit.target);
        return true;
      }
      const snap = cap.snapshot(), r = boxOf(labels);   // (the tap's own read: no frame is running)
      for (const it of snap.items) { it.x += r.left; it.y += r.top; }
      const hit = hitLabel(snap.items, x, y, 8, (k) => k.startsWith('lab:') && !!labs[k.slice(4)]);
      if (!hit) return false;
      const key = hit.key.slice(4);
      explainSet(key === exKey ? null : key, LIT_OF[key]);
      return true;
    },
    explainClear() { explainSet(null); },
    explainKey: () => exKey,
    /** The sinusoid view's names, the same (its own names layer), for the browser checks. */
    sinusoidCaptions: () => sv.captions?.() ?? null,
    /** Where each shown leader ends, in the same px as captions() (the layer's view included), for the browser checks: [{ key, x, y (the name's end), px, py (the end on the figure's point) }]. */
    /** Whether any label is gliding to a new spot now (the browser checks judge a label's offset from its point only while none is). */
    labelsGliding() { const now = tlNow(); for (let i = 0; i < LAB_KEYS.length; i++) if (labGliding(labs[LAB_KEYS[i]], now)) return true; return false; },
    leaderEnds() {
      const out = [];   // alloc-rare: asked only by the browser check
      for (const k of Object.keys(labs)) {
        const L = labs[k];
        if (!L.a || isHid(L.el) || classHas(L.el, 'edge') || classHas(L.line, 'ld-gone') || classHas(L.line, 'lz-hid')) continue;
        const x = +geoOf(L.line, 'x2'), y = +geoOf(L.line, 'y2');
        const x1 = +geoOf(L.line, 'x1'), y1 = +geoOf(L.line, 'y1');   // (the end on the figure's point, drawn by the leaders' own layer)
        if (Number.isFinite(x) && Number.isFinite(y)) out.push({ key: `lab:${k}`, x: VIEW[0] * x + VIEW[1], y: VIEW[0] * y + VIEW[2], px: VIEW[0] * x1 + VIEW[1], py: VIEW[0] * y1 + VIEW[2] });
      }
      return out;
    },
    prewarm, warm, stage: () => framePart('lz.stage', stage), stageRise: () => framePart('lz.stageRise', stageRise), paintAhead, preparePieces, prepareRun,
    /** True once the dive's field (or the lobule) covers the anatomy, which then need not be drawn. */
    covers: () => fade > 0.98 || fieldOp >= 0.999,
    /** During the dive: the tissue (not its card) still zooming in, by k (≤ 1) about the stage point x, y. */
    setDiveZoom(k, x, y, tx = x, ty = y) {
      if (k < 0.9999) resCoverEnd();
      diveScaled = k < 0.9999; if (!diveScaled) diveDrawn = false;
      if (!diveScaled && fade <= 0) { staged = ''; if (relLater) { relLater = false; release(); } }   // the dive is over with the lobule unseen
      // Landed with a Sinusoid tap waiting (made during the dive): on into the sinusoid now.
      sinOnLanding();
      // Scaled down, the tissue's own page fill would show as a pale card: the tissue's shader keeps only the lobule, its own drawing
      // and a soft rim (tissue-gl.js uRim). (The vessels' canvas holds only the lobule's own vessels, so it is shown whole, as at rest:
      // masked with the rim, the triads' arterioles, ductules and lymphatics just past the corners were faded through the zoom and popped in.)
      const r = geo ? geo.R * V.k : 0, rim = k < 0.9999 && r > 0;
      // (Landed, or back at full size: the wide copy goes, and the layers, drawn for the screen before the zoom, show as they are.)
      // (A GPU copy whose context was lost goes too: the layers, scaled, as before there was a copy.)
      if (wide?.gl?.lost) dropWide();
      if (wide && !rim) dropWide(true);
      diveRim = rim && !wide ? { x: +x.toFixed(1), y: +y.toFixed(1), r: +r.toFixed(1) } : null;
      // (The rim drawn by the tissue's shader, and the GPU canvas scaled as it is: no copy. Drawn once for the rim: each frame of the
      // zoom only scales it. Landed, the picture is drawn again without the rim before the scale goes.)
      if (rim && !wide && !(rimDrawn && tissueOnGL && rimSame())) rimOnGPU();
      if (!diveRim && rimDrawn) { rimDrawn = false; tissueKey = ''; idleDrawn = ''; if (fade > 0 && !wide) rimOnGPU(); }
      const vis = wide ? 'hidden' : '';
      if (tissueG.style.visibility !== vis) tissue.style.visibility = tissueG.style.visibility = vis;
      if (wide) { for (const e of WIDE_HIDE) e.style.visibility = 'hidden'; wide.el.style.visibility = ''; }
      // (A copy in the vessels' own canvas: that canvas shows it, unscaled; the copy is placed on the GPU.)
      if (wide?.host) glCv.style.visibility = '';
      // (The labels and the leaders are drawn by the GPU carried by the same scale about the same point: view(k, e, f) puts a point p at k p + (e, f).)
      if (k >= 0.9999) setDive(1, 0, 0); else setDive(k, tx - k * x, ty - k * y);
      for (const e of [tissue, tissueG, glCv, fx, fxG]) {
        if (k >= 0.9999 || (wide?.host && e === glCv)) { e.style.transform = ''; e.style.transformOrigin = ''; continue; }
        // Scaled about its own centre, which sits where the field's lobule at the dive's focus is (tx, ty), so it morphs out of that one.
        e.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        e.style.transform = `translate(${(tx - x).toFixed(1)}px, ${(ty - y).toFixed(1)}px) scale(${k.toFixed(4)})`;
      }
      // (The wide copy's box about the same stage point, in its own frame.)
      if (wide?.host) {
        // (The canvas at the screen's size for it, then laid: the copy alone, through the vessels' replace.)
        const cw = Math.max(1, Math.round(wide.W * wide.dpr)), ch = Math.max(1, Math.round(wide.H * wide.dpr));
        if (glCv.width !== cw || glCv.height !== ch) { glCv.width = cw; glCv.height = ch; glDirty = true; drawKey = ''; }
        wideView = { W: wide.W, H: wide.H, dpr: wide.dpr, box: wide.box, k, x, y, tx, ty };
        if (gl && !gl.lost) gl.present();
      } else if (wide?.gl) wide.gl.draw(wide.W, wide.H, wide.dpr, wide.box, k, x, y, tx, ty);   // (on the GPU: one pass, no CSS transform)
    },
    /** Where the sinusoid's reading and the lesion pointer meet their sinusoid (for the checks): its generation, how far
     *  out from the central vein (0) to the lobule's rim (1) along that ray, and where on screen. */
    sinAnchor() {
      if (!geo) return null;
      const t = sinTube(), p = sinAt(t);
      return { lvl: t.lvl, f: rimFrac(p), x: sX(p[0]), y: sY(p[1]) };
    },
    /** Where a lobule selection is on screen (for the action card), as the stage's anchorFor. */
    anchorFor(sl) {
      if (!geo || sl?.type !== 'lobule') return null;
      const w = sl.at, x = sX(w ? w[0] : geo.cx), y = sY(w ? w[1] : geo.cy);
      return { x, y, path: [[x, y]] };
    },
    resetView,
    /** The zoom buttons: in or out about the middle of the free space, and Fit. */
    zoomBy, fitView,
    /** The lobule zoomed with a card (card-zoom.js, via stage.js zoomOpen/zoomAt/zoomEnd): its view V scaled by S about the screen point (px, py) and
     *  moved by (dx, dy), the cards' own transform, drawn each frame with no glide of its own; zoomEnd puts V back as it was. Not in the sinusoid. */
    zoomOpen() {
      // (Only where the lobule's picture is in the figure's own context and drawn for the view as it stands: that picture is carried by the camera.)
      if (zbase || !geo || fade < 0.98 || diveScaled || gliding || rubber || sinBusyNow() || !shared || wide) return false;
      // (Landed in the sinusoid: its view is the picture carried, with its names; else the lobule's, drawn for the view as it stands.)
      const sin = sinTo === 1 && sinU >= 1 && sv.isOpen() && sv.cameraReady;
      if ((sinU > 0 || sinTo) && !sin) return false;
      if (!sin && (!drawnV.ok || glDirty)) { glDirty = true; idleDrawn = ''; draw(0); if (!drawnV.ok || glDirty) return false; }   // (not drawn for the view as it stands: drawn now, so a second zoom in is as the first)
      stopInertia(); zbase = { scene: true, sin }; return true;
    },
    zoomAt(S, px, py, dx, dy) {
      if (!zbase) return;
      // (Card zoom, 4 Nov 2026, card-zoom-plan.md: the view V and the labels' layout stay as they rest. The camera C, a scale S about (px, py) and a move
      // (dx, dy), carries the picture in the figure's present (layShared) and the names and leaders by the same view (cap.view, leadGL.view: a point is
      // drawn where C puts it, a name keeps its size). The camera is a record of its own: the dive's frames set the dive's and never undo it.)
      // (Mohammad, 4 Nov 2026: the lobule and the sinusoid scale in place, about the stage's middle, as the card grows: they stay where they are and never leave
      // view, whatever side the card is on. The move of the card is not theirs.)
      camAbout(CARD, S, snap.w / 2, snap.h / 2);
      if (zbase.sin) { sv.camera(S, CARD.x, CARD.y, (shareTop?.canvas.width || 1) / (shW || 1)); camId(CARD); return; }
      applyView();
      shareTop?.present();
    },
    /** A card's zoom has landed (on) or is going (off): the lobule's picture is drawn again at CARD.k times the density with the same view and layout (the labels
     *  are not laid out again), so what the camera carries is sharp; the sinusoid's likewise. At most 3 device px per CSS px. */
    zoomSharp(on) {
      if (!zbase) return;
      if (zbase.sin) { sv.sharpen?.(on); return; }
      const base = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * lzScale();
      const z = on ? Math.max(1, Math.min(CARD.k, 3 / (base || 1))) : 1;
      if (z === zres) return;
      zres = z; glDirty = true; tissueKey = ''; drawKey = ''; idleDrawn = ''; drawVersion++;
      if (!raf && fade > 0) raf = nextFrame(loop);
    },
    zoomEnd() {
      if (!zbase) return;
      const sin = zbase.sin;
      if (zres !== 1) { zres = 1; glDirty = true; tissueKey = ''; drawKey = ''; idleDrawn = ''; drawVersion++; if (!raf && fade > 0) raf = nextFrame(loop); }
      sv.sharpen?.(false);
      zbase = null;
      if (sin) { sv.camera(1, 0, 0, 1); return; }
      camId(CARD);
      applyView();
      shareTop?.present();
    },
    /** The presenter's camera: glide to the whole lobule ('fit') or close in on a portal tract ('triad'), the
     *  sinusoids between it and the centre ('sinusoid') or the central vein ('central'), zoom × the framing. */
    /** The way out of the lobule begins (on) or is called off (off): see heldFree. Called off with the lobule still up, it follows the
     *  space the cards leave now, gliding. */
    holdFrame(on) {
      if (on) { if (geo && !heldFree && fade > 0) heldFree = { W: geo.W, H: geo.H, f: liveFree() }; return; }
      if (!heldFree) return;
      heldFree = null;
      if (geo && fade > 0) refit();
    },
    focusOn(part, { zoom = 2, ms = 1400, ease = 'inOut' } = {}) {
      if (!geo || sinTo) return false;
      const F0 = fitV(); kFit = F0.k;
      const to = !part || part === 'fit' ? F0 : framing(part, zoom);
      const moved = Math.abs(V.k - to.k) + Math.abs(V.x - to.x) + Math.abs(V.y - to.y) > 0.5;
      atFit = !part || part === 'fit'; glideTo(to, ms, true, atFit ? null : { part, zoom, to }, ease);
      return moved;
    },
    /** Before (or during) the dive into the lobule: where a presenter slide will want it, so the dive lands there
     *  (no stop at the fit on the way). The labels are laid out for that framing as the dive comes in, and ride its camera. */
    aim(part, { zoom = 2 } = {}) {
      // Already diving to an aim (a newer slide arrived on the way): that landing stands, its names laid out for it and riding the
      // dive with the figure (never faded for the move), and focusOn's glide carries them on from it.
      if (aimed && fade <= 0.98) return;
      aimed = { part: part || 'fit', zoom };
    },
    viewKey: () => `${V.k.toFixed(3)},${V.x.toFixed(1)},${V.y.toFixed(1)}|${geoKey}`,
    /** For the checks: the spot at the middle of the free space (lobule radii from its centre) and the zoom against the framing. */
    spot: () => (geo ? viewSpot() : null),
    /** For the checks: a "Colored by" crossfade is under way (0 … 1 through it), or null. */
    lensFade: () => (lensFrom ? Math.min(1, ((PACED ? easeNow() : performance.now()) - lensT0) / LENS_FADE) : null),
    /** For the checks: bytes held in the lobule's bitmaps (its canvases, world bitmap and field tiles). */
    memBytes(detail = false) {
      const b = (cv) => (cv ? cv.width * cv.height * 4 : 0);
      const d = { canvases: b(tissue) + b(tissueG) + b(glCv) + b(fx) + b(field) + b(fieldG), world: b(worldCv), tiles: 0, worldDraws, tileSets: tileSets.size };
      for (const tiles of tileSets.values()) for (const q of tiles) d.tiles += b(q.cv) + b(q.quiet?.cv) + b(q.liverQ?.cv);
      return detail ? d : d.canvases + d.world + d.tiles;
    },
    /** For the checks: how many times the labels have been placed in full (a pan should only carry them along). */
    labelLayouts: () => layoutN,
    isOpen: () => fade > 0.98,
    /** The open view's figure → stage px as an affine { a, b, c, d, e, f } (the ink's, ink-gl.js), written into o: the sinusoid's while it shows, else the lobule's; false when neither rests open. */
    xform(o) { if (sv.isOpen()) return sv.xform(o); if (fade <= 0.98) return false; o.a = V.k; o.b = 0; o.c = 0; o.d = V.k; o.e = V.x; o.f = V.y; return true; },
    isShown: () => fade > 0,
    /** The lobule's outline in client px while the view is wholly the lobule (not the sinusoid), else null: the corner credit keeps off it. */
    /** For the checks: the lobule's vessel canvas as it stands, then after a whole redraw at the same view (see stage veinsCheck). */
    glCheck() {
      if (!gl || gl.lost || fade <= 0.98) return null;
      const now = gl.snapshot();
      glDirty = true; idleDrawn = ''; draw(0);
      return { now, whole: gl.snapshot() };
    },
    ring() {
      if (!geo || fade <= 0.98 || sinU > 0 || sinTo) return null;
      const r = host.getBoundingClientRect();
      const at = (p) => [sX(p[0]) + r.left, sY(p[1]) + r.top];
      const out = geo.lobules[0].corners.map(at);
      // (Drawn round it, the credit keeps off these too: every portal tract (each lobule's corners, with the arteriole, ductule
      // and lymphatic beside the venule) and the neighbouring lobules' central veins, as [x, y, radius] in client px.)
      const k = V.k, seen = new Set();
      out.discs = [];
      for (const l of geo.lobules) {
        if (!l.main) out.discs.push([...at([l.x, l.y]), geo.R * 0.14 * k]);
        for (const c of l.corners) { const key = c.map(Math.round).join(); if (!seen.has(key)) { seen.add(key); out.discs.push([...at(c), geo.R * 0.2 * k]); } }
      }
      return out;
    },
  };
  // (Built late, the store has already had its say on these: read what it holds now. Nothing is set when the layer is built at start-up.)
  onCallout();
  if (store.get().sinusoid) diveSinusoid(true);
  return api;
}
