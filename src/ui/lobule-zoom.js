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

import { runFlick, FLICK } from './flick.js?v=c0226d6397';
import { store } from './store.js?v=31ee79b6ab';
import { radiiChanged, canvasPx, fxMoves } from './lobule-render-cache.js?v=99394e5079';
import { softwareYield } from './sw-yield.js?v=8ed814fc6a';
import { lobuleState, lymphRate, LOBE } from './lobule-model.js?v=1ff0bc103e';
import { SIN_NARROW, cordTone, dullSinusoid, NEIGHBOUR_FLAT, neighbourBlur, blurWrapped } from './lobule-look.js?v=ac7a06c4eb';
import { h, s, fmt, clamp, createEaser, systemEdge, bloodColors, cssVar, cssAlpha, cssRGB01 } from './util.js?v=0140acc352';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor, oxygenColor } from './colormap.js?v=5c9a375f49';
import { NODES, EDGES } from '../engine/topology.js?v=4044766e96';
import { createVeinsGL, binVeins, N_SAMPLES, TUBE_TEXELS, FLOW_TEXELS, MAX_TIERS, F_SEL, F_DIFFUSE, F_SHADOW, F_SPEC, F_EDGE, ORIGIN_GREY } from './veins-gl.js?v=07d4833500';
import { SLOT, PERIOD, originFractions, ORIGIN_N } from './blood.js?v=1f05278710';
import { createSinusoidView } from './sinusoid-view.js?v=e883e572db';
import { frameFor, cancelFrame, noteDraw, saver, paceMs } from './frame.js?v=5efaa2bcc9';
import { leaderEnd, runInside } from './leader-end.js?v=8e884700ab';
const nextFrame = frameFor('lobule-zoom');

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const TAU = Math.PI * 2;
const N = N_SAMPLES;
const MAXT = 320;                       // GPU rows: the lobule has ~170 vessels, ~285 with the lymphatics
const LIGHT = (() => { const n = Math.hypot(-0.42, -0.91); return [-0.42 / n, -0.91 / n]; })();
const tk = (n, a) => (a === undefined ? cssVar(n) : cssAlpha(n, a));   // a colour token, optionally with an alpha
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic jitter so the tissue does not shimmer between frames.
function rng(seed) { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }

// A dense curve f(u), u 0…1, resampled to N points evenly spaced along its length.
function curve(f, m = 160) {
  const d = [], L = [0];
  for (let i = 0; i <= m; i++) d.push(f(i / m));
  for (let i = 1; i <= m; i++) L.push(L[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
  const len = L[m] || 1e-6, pts = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const t = (len * k) / (N - 1);
    while (j < m - 1 && L[j + 1] < t) j++;
    const w = clamp((t - L[j]) / (L[j + 1] - L[j] || 1), 0, 1);
    pts.push([lerp(d[j][0], d[j + 1][0], w), lerp(d[j][1], d[j + 1][1], w)]);
  }
  return { pts, len };
}
// The triad's layout, from the venule: the other three sit this far out (of R), the arteriole and ductule this
// far round either side of the outward direction, and the lymphatic straight out.
const TRIAD_D = 0.09, TRIAD_A = 0.98;
const dot = (x, y) => curve((u) => [x + (u - 0.5) * 0.6, y], 4);   // a vessel seen end-on: a disc
function at(pts, u) {
  const f = clamp(u, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)];
}
function distTo(pts, x, y) {
  let best = Infinity, bu = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
    if (d < best) { best = d; bu = (i + t) / (pts.length - 1); }
  }
  return [best, bu];
}
// The canvas's own CSS color parser, for any CSS color → [r, g, b] 0–1.
const rgbCtx = document.createElement('canvas').getContext('2d');
const rgbCache = new Map();
function rgb01(c) {
  let o = rgbCache.get(c);
  if (o) return o;
  rgbCtx.fillStyle = '#000'; rgbCtx.fillStyle = c || '#000';   // colour-exempt: the parser's reset
  const f = rgbCtx.fillStyle;
  o = f[0] === '#' ? [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16) / 255) : f.match(/[\d.]+/g).slice(0, 3).map((v) => +v / 255);
  rgbCache.set(c, o);
  return o;
}
const css = (a, al = 1) => `rgba(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)},${al})`;

// A fibrous septum, the way it looks under the microscope: a band of pale collagen, uneven in
// width, soft at its edges, swelling where it leaves a portal tract, with wavy fibres running along
// it and a few spindle-shaped fibroblast nuclei. Drawn once into a cached canvas, never per frame.
// A, B: ends; w: mean width; e0, e1: width at each end (1.5 at a tract, ~0.2 for a septum that
// stops in the parenchyma); seed: a fixed number so the same septum always looks the same;
// detail: 0 … 1, fewer fibres and no nuclei when small on screen.
const fibHash = (i) => { let q = (i * 374761393 + 668265263) >>> 0; q = ((q ^ (q >>> 13)) * 1274126177) >>> 0; return (q >>> 8) / 16777216; };
function fibrousBand(c, A, B, { w, rgb, a = 1, seed = 0, e0 = 1.5, e1 = 1.5, amp = 0, detail = 1, path = null }) {
  const n = 26, P = [], N = [], Wd = [];
  const ph = fibHash(seed) * TAU, ph2 = fibHash(seed + 9) * TAU;
  const dx = B[0] - A[0], dy = B[1] - A[1], L0 = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (path) P.push(path(u));
    else { const e = amp * Math.sin(Math.PI * u) * (0.75 * Math.sin(3 * Math.PI * u + ph) + 0.25 * Math.sin(7 * Math.PI * u + ph2)); P.push([A[0] + dx * u - (dy / L0) * e, A[1] + dy * u + (dx / L0) * e]); }
  }
  for (let i = 0; i <= n; i++) {
    const p = P[Math.max(0, i - 1)], q = P[Math.min(n, i + 1)], ex = q[0] - p[0], ey = q[1] - p[1], L = Math.hypot(ex, ey) || 1, u = i / n;
    N.push([-ey / L, ex / L]);
    const lump = 0.78 + 0.22 * Math.sin(TAU * 1.4 * u + ph) + 0.14 * Math.sin(TAU * 3.3 * u + ph2);
    const end = 1 + (e0 - 1) * Math.max(0, 1 - u * 3) ** 2 + (e1 - 1) * Math.max(0, u * 3 - 2) ** 2;
    Wd.push(Math.max(0, w * lump * end));
  }
  const outline = (k, o = 0) => {
    c.beginPath();
    for (let i = 0; i <= n; i++) { const h = Wd[i] * (k / 2 + o); c[i ? 'lineTo' : 'moveTo'](P[i][0] + N[i][0] * h, P[i][1] + N[i][1] * h); }
    for (let i = n; i >= 0; i--) { const h = Wd[i] * (k / 2 - o); c.lineTo(P[i][0] - N[i][0] * h, P[i][1] - N[i][1] * h); }
    c.closePath();
  };
  // Soft edges: the band laid down in three passes, wide and faint to narrow and dense.
  const sb = c.shadowBlur;   // a shade (set by the caller) is cast by the faint outer pass only
  for (const [k, al] of [[2.1, 0.12], [1.45, 0.24], [1, 0.5]]) { c.fillStyle = css(rgb, al * a); outline(k); c.fill(); c.shadowBlur = 0; }
  c.shadowBlur = sb;
  if (detail <= 0 || w < 1.2) return;
  // Fibres: thin wavy strands along the band, some brighter, some deeper.
  const lite = rgb.map((x) => x + (1 - x) * 0.45), deep = rgb.map((x, j) => x * [0.78, 0.74, 0.7][j]);
  const nf = Math.round((3 + Math.min(7, w / 1.6)) * detail);
  c.lineCap = 'round'; c.shadowBlur = 0;
  for (let f = 0; f < nf; f++) {
    const off = (fibHash(seed * 31 + f) - 0.5) * 0.9, fp = fibHash(seed * 17 + f) * TAU, wav = 0.05 + 0.08 * fibHash(seed * 7 + f);
    const u0 = fibHash(seed * 13 + f) * 0.25, u1 = 1 - fibHash(seed * 19 + f) * 0.25;
    c.strokeStyle = css(f % 3 === 0 ? deep : lite, (f % 3 === 0 ? 0.32 : 0.55) * a);
    c.lineWidth = Math.max(0.45, w * (0.035 + 0.03 * fibHash(seed * 5 + f)));
    c.beginPath();
    for (let i = Math.floor(u0 * n); i <= Math.ceil(u1 * n); i++) {
      const u = i / n, h = Wd[i] * (off + wav * Math.sin(TAU * 4 * u + fp));
      c[i === Math.floor(u0 * n) ? 'moveTo' : 'lineTo'](P[i][0] + N[i][0] * h, P[i][1] + N[i][1] * h);
    }
    c.stroke();
  }
  if (detail < 0.6 || w < 3) { c.shadowBlur = sb; return; }
  // Fibroblast nuclei: small dark spindles lying along the fibres.
  const nn = Math.round((L0 / (w * 2.6)) * detail);
  c.fillStyle = tk('--lz-shade', 0.32 * a);
  for (let k = 0; k < nn; k++) {
    const i = Math.min(n - 1, Math.max(1, Math.round(fibHash(seed * 41 + k) * n))), h = Wd[i] * (fibHash(seed * 43 + k) - 0.5) * 0.7;
    const x = P[i][0] + N[i][0] * h, y = P[i][1] + N[i][1] * h;
    c.beginPath(); c.ellipse(x, y, Math.max(0.8, w * 0.16), Math.max(0.35, w * 0.045), Math.atan2(N[i][0], -N[i][1]), 0, TAU); c.fill();
  }
  c.shadowBlur = sb;
}

// Visual scar growth is eased independently of the physiology and stays close to the vessels.
const scarGrowth = (fibrosis) => clamp(fibrosis, 0, 1) ** 1.1;

// Portal fibrosis has a compact circular footprint with interwoven collagen inside.
// Cached with the tissue; fixed seeds keep the texture still as pressure changes.
function fibrousTract(c, x, y, radius, angle, rgb, fibrosis, seed, detail = 1) {
  c.save(); c.translate(x, y); c.rotate(angle);
  const rx = radius, ry = radius;
  const phase = fibHash(seed) * TAU;
  c.beginPath(); c.arc(0, 0, radius, 0, TAU);
  c.fillStyle = css(rgb, fibrosis * 0.24); c.fill(); c.clip();
  // Broken curving bundles cross each other instead of forming a circular halo.
  const count = Math.round(10 * detail);
  for (let k = 0; k < count; k++) {
    const sd = seed + k * 37, a0 = fibHash(sd) * TAU;
    const span = 1.2 + 2 * fibHash(sd + 1), r0 = 0.25 + 0.65 * fibHash(sd + 2);
    const path = (u) => {
      const a = a0 + span * u;
      const r = r0 + 0.09 * Math.sin(5 * a + phase) + 0.12 * Math.sin(Math.PI * u);
      return [Math.cos(a) * rx * r, Math.sin(a) * ry * r];
    };
    fibrousBand(c, path(0), path(1), {
      w: radius * (0.08 + 0.085 * fibrosis) * (0.7 + fibHash(sd + 3)),
      rgb, a: Math.min(1, fibrosis * (0.75 + 0.35 * fibHash(sd + 4))),
      e0: 0.2, e1: 0.25, seed: sd, path, detail,
    });
  }
  c.restore();
}

// Perivenular collagen: overlapping curved bundles rather than a smooth, solid disc.
// Like the bridging bands, this texture is painted only into the cached tissue bitmap.
function fibrousCuff(c, cx, cy, inner, outer, rgb, fibrosis) {
  const annulus = () => {
    c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = TAU * i / 80, r = outer * (1 + 0.035 * Math.sin(3 * a) + 0.025 * Math.sin(7 * a + 0.8));
      c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath(); c.moveTo(cx + inner, cy); c.arc(cx, cy, inner, 0, TAU); c.closePath();
  };
  c.save();
  annulus(); c.fillStyle = css(rgb, 0.4 * fibrosis); c.fill('evenodd'); c.clip('evenodd');
  const thickness = outer - inner;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 6; k++) {
    const seed = 211 + ring * 17 + k, a0 = TAU * k / 6 + ring * 0.27;
    const span = TAU / 6 * (1.2 + 0.5 * fibHash(seed)), r0 = inner + thickness * (0.18 + ring * 0.3);
    const path = (u) => {
      const a = a0 + span * u, r = r0 + thickness * 0.1 * Math.sin(a * 5 + fibHash(seed + 5) * TAU);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    fibrousBand(c, path(0), path(1), { w: thickness * 0.34, rgb, a: Math.min(1, 1.0 * fibrosis), e0: 0.45, e1: 0.5, seed, path });
  }
  c.restore();
}

export function createLobuleZoom({ host, styles = () => getComputedStyle(host) }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const tissue = h('canvas', { class: 'lz-canvas', role: 'img', 'aria-label': 'Liver lobule microcirculation' });
  const glCv = h('canvas', { class: 'lz-canvas lz-gl', 'aria-hidden': 'true' });
  const fx = h('canvas', { class: 'lz-canvas lz-fx', 'aria-hidden': 'true' });
  const leaders = s('svg', { class: 'lz-leaders', 'aria-hidden': 'true' });
  const labels = h('div', { class: 'lz-labels' });

  // ── What sits on the lobule ──
  // Zones and Lymph are layers (the toolbar's Layers menu keeps them in the store). Nothing floats in a card.
  const start = store.get().lobuleLayers || {};   // the first frame draws the layers the store starts with (lymph is on)
  let zonesOn = !!start.zones, lymphOn = !!start.lymph;
  const syncLayers = () => {
    const l = store.get().lobuleLayers || {};
    if (!!l.zones === zonesOn && !!l.lymph === lymphOn) return;
    zonesOn = !!l.zones; lymphOn = !!l.lymph;
    tissueKey = ''; layoutKey = ''; attrKey = '';
    if (F) update(F);
    nextFrame(refit);
  };
  store.on('lobuleLayers', () => syncLayers());
  // A presenter slide's pointer at the lesion (D4): { at: 'triad' | 'sin' | 'cv', label, kind: block | treat | note }.
  const callEl = h('div', { class: 'lz-call', 'aria-hidden': 'true' }), callLine = s('line', { class: 'lz-call-l' }), callRing = s('circle', { class: 'lz-call-r' });
  let call = null;
  store.on('presentFp', () => { if (model) panel(); });   // (a slide's settled values arrive: the sinusoid label reads as its tile)
  store.on('lobuleCallout', () => {
    const c = store.get().lobuleCallout || null;
    if (JSON.stringify(c) === JSON.stringify(call)) return;
    call = c;
    if (c) { callEl.textContent = c.label; callEl.dataset.kind = callLine.dataset.kind = callRing.dataset.kind = c.kind || 'block'; }
    viewChanged();
  });

  const phoneMQ = matchMedia('(max-width: 720px)');
  // While the dive shows the tissue scaled down, a copy of it with everything past the lobule's rim cleared is shown in its place (see
  // diveCopy). With only a CSS mask on the tissue, Safari now and then dropped the mask for a frame: the whole bitmap, a pale card of
  // the lobules around the landing one, flashed on and off through the zoom.
  const diveCv = h('canvas', { class: 'lz-canvas lz-dive', 'aria-hidden': 'true', style: { visibility: 'hidden' } });
  const el = h('div', { class: 'lz', 'aria-hidden': 'true' }, tissue, diveCv, glCv, fx, leaders, labels);
  // The dive's field (below the view): the liver's lobules, few and large, that the camera falls through (those away from the landing lobule fade as it nears).
  const field = h('canvas', { class: 'lz-canvas lz-field', 'aria-hidden': 'true' });
  host.append(field, el);

  // ── The view: the lobule framed in the space the floating pieces leave (top bar, dock, cards and
  // its own card), free zoom up to 5× that, the pan held to this lobule. Zooming out stops at the framing.
  const V = { k: 1, x: 0, y: 0 };
  const KMAX = 5;
  let kFit = 1, atFit = true;
  // A presenter's glide to a station still under way: its part, zoom and target (which refit moves, so the glide still lands on the station).
  let camAim = null;
  const appStyle = document.getElementById('app')?.style;
  const cssN = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  function freeRect() {
    const W = geo.W, H = geo.H, phone = phoneMQ.matches;
    // (--pz-l, --pz-r, --pz-b: the room a presenter slide's text and data take.)
    let t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8, b = H - (cssN('--bot-occ') || 100) - cssN('--pz-b') - 8, l = 12 + cssN('--pz-l'), r = W - cssN('--right-occ') - cssN('--pz-r') - 12;
    // The zoom buttons: on a phone they sit above the dock (Zones and Lymph live in the View menu); should they sit near the top, the labels start below them.
    const zp = phone && document.getElementById('zoomPill');
    if (phone) {
      const hr = el.getBoundingClientRect(), q = zp && zp.offsetHeight ? zp.getBoundingClientRect() : null;
      if (q && q.top - hr.top < H / 2) t = Math.max(t, q.bottom - hr.top + 14);
    }
    // The bottom stays above the vitals dock. With no room left, layoutLabels hides the labels rather than set them under it.
    return { l, t, r: Math.max(l + 80, r), b };
  }
  // The lobule and its labels' places, in world units.
  const frameBox = () => {
    const { cx, cy, R } = geo, ph = phoneMQ.matches;
    // Even above and below the hexagon (its curved sides reach about 0.97 R), so a fitted lobule is centred in the free space.
    return ph ? [cx - 1.05 * R, cy - 1.02 * R, cx + 1.05 * R, cy + 1.02 * R] : [cx - 1.52 * R, cy - 1.04 * R, cx + 1.52 * R, cy + 1.04 * R];
  };
  function fitV() {
    if (!geo) return { k: 1, x: 0, y: 0 };
    const f = freeRect(), [x0, y0, x1, y1] = frameBox();
    const k = clamp(Math.min((f.r - f.l) / (x1 - x0), (f.b - f.t) / (y1 - y0)), 0.3, 1.8);
    return { k, x: (f.l + f.r) / 2 - k * (x0 + x1) / 2, y: (f.t + f.b) / 2 - k * (y0 + y1) / 2 };
  }
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
    const F0 = fitV();
    if (rawK >= kFit) { rawK = 0; rubber = false; Object.assign(V, F0); atFit = true; viewChanged(); return; }
    // The stretch shrinks about the middle of the free space, not the fingers: the lobule stays where its framing puts it, so zooming
    // out at the framing never drifts it sideways or down and back.
    const fr = freeRect(); px = (fr.l + fr.r) / 2; py = (fr.t + fr.b) / 2;
    const k = kFit * Math.pow(rawK / kFit, 0.3), r = k / V.k;
    V.x = px - (px - V.x) * r; V.y = py - (py - V.y) * r; V.k = k; viewChanged();
  }
  function endStretch() { if (!rawK) return; rawK = 0; rubber = false; glideTo(fitV(), 380); atFit = true; }
  function clampV() {
    if (!geo || rubber) return;
    const F0 = fitV();
    kFit = F0.k;
    if (V.k <= kFit * 1.001) { Object.assign(V, F0); atFit = true; return; }
    atFit = false;
    V.k = Math.min(V.k, kFit * KMAX);
    const { cx, cy, R } = geo, f = freeRect(), mx = (f.l + f.r) / 2, my = (f.t + f.b) / 2;
    // The free space's centre stays over the lobule; fitted, it is the framing.
    // (The room to pan opens quickly: fully by a third past the framing, so a small zoom can already be moved.)
    const t = clamp((V.k / kFit - 1) * 3, 0, 1);
    const fc = [(mx - F0.x) / F0.k, (my - F0.y) / F0.k];
    const wx = (mx - V.x) / V.k, wy = (my - V.y) / V.k;
    const x0 = lerp(fc[0], cx - R * 1.05, t), x1 = lerp(fc[0], cx + R * 1.05, t), y0 = lerp(fc[1], cy - R * 0.95, t), y1 = lerp(fc[1], cy + R * 0.95, t);
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
  // A presenter's glide (focusOn): the labels ease out, are not laid out on the way, and ease back in where it lands.
  let camMove = false, camInT = 0, camUntil = 0, camHeld = false;   // (camHeld: aim's hold, which only focusOn or leaving lets go)
  function camSettle() {
    if (!camMove || camHeld) return;
    camMove = false; layoutKey = '';
    if (fade > 0 && geo) layoutLabels();
    nextFrame(() => { if (camMove) return; el.classList.remove('lz-cam'); el.classList.add('lz-cam-in'); clearTimeout(camInT); camInT = setTimeout(() => el.classList.remove('lz-cam-in'), 400); });
  }
  function glideTo(to, ms = 260, cam = false, aim = null) {
    stopInertia();
    cancelFrame(glide); gliding = false;
    camAim = aim;   // (any other glide, or a hand on the lobule, replaces the presenter's)
    const from = { ...V }, t0 = performance.now();
    // (Lite mode: the presenter's camera jumps, and the lobule fades in at its new framing.)
    if (reduce.matches || !fade) { camAim = null; Object.assign(V, to); viewChanged(); camSettle(); return; }
    if (cam && Math.abs(from.k - to.k) + Math.abs(from.x - to.x) + Math.abs(from.y - to.y) > 0.5) { camMove = true; camUntil = t0 + ms + 50; el.classList.remove('lz-cam-in'); el.classList.add('lz-cam'); setTimeout(() => { if (camMove && performance.now() >= camUntil) camSettle(); }, ms + 80); } else camSettle();
    const step = (now) => {
      const u = clamp((now - t0) / ms, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const k = from.k * Math.pow(to.k / from.k, e), a = (k - from.k) / ((to.k - from.k) || 1);
      V.k = k; V.x = from.x + (to.x - from.x) * (to.k === from.k ? e : a); V.y = from.y + (to.y - from.y) * (to.k === from.k ? e : a);
      viewChanged();
      if (u < 1) glide = nextFrame(step); else { gliding = false; camAim = null; camSettle(); viewChanged(); }   // (landed: drawn once more at the sharpness the new zoom wants)
    };
    gliding = true;
    glide = nextFrame(step);
  }
  let outHandler = null;
  function zoomBy(factor) {
    if (!geo) return;
    if (sinTo) return;   // in the sinusoid: only the view switch goes back up to the lobule
    handsOff();
    if (factor < 1 && V.k <= kFit * 1.001 && outHandler) { outHandler(factor, true); return; }
    const f = freeRect(), px = (f.l + f.r) / 2, py = (f.t + f.b) / 2;
    const k = clamp(V.k * factor, kFit, kFit * KMAX), r = k / V.k;
    const to = { k, x: px - (px - V.x) * r, y: py - (py - V.y) * r };
    const saved = { ...V }; Object.assign(V, to); clampV(); const target = { ...V }; Object.assign(V, saved);
    glideTo(target);
  }
  // When the free space changes (a card opens, the readouts expand), a fitted lobule follows it.
  let refitLater = false;
  function refit() { if (!geo || rubber || sinU > 0 || sinTo) { refitLater = !!geo; return; }   // not while in or on the way to the sinusoid: the zoom holds the lobule still
    // A new size: the lobule is built for it first (ensureGeo keeps the spot in view), so the framing below never mixes the old build with the new space.
    { const r = host.getBoundingClientRect(); if (r.width >= 2 && r.height >= 2) ensureGeo(Math.round(r.width), Math.round(r.height)); }
    // (Mid-glide to a station, the glide's target follows the new space: clampV would read the glide's first, still unzoomed frames as the fit
    // and send the lobule back there, so a slide's zoom never arrived.)
    refitLater = false; const F0 = fitV(); kFit = F0.k; if (atFit) glideTo(F0); else if (camAim) Object.assign(camAim.to, framing(camAim.part, camAim.zoom)); else if (aimed && fade <= 0.98) glideTo(framing(aimed.part, aimed.zoom)); else { clampV(); viewChanged(); } }
  addEventListener('pps:occ', () => { if (fade > 0) { layoutKey = ''; refit(); } });
  // A new text size: the labels glide to their new places instead of jumping.
  let easeT = 0;
  addEventListener('pps:labelscale', () => { labels.classList.add('lz-ease'); clearTimeout(easeT); easeT = setTimeout(easeEnd, 450); syncLeaders(); drawVersion++; viewVer++; layoutKey = ''; if (!raf && fade > 0) raf = nextFrame(loop); });
  let pacedVer = -1, viewVer = 0;   // viewVer: a pan, zoom, resize or label change, drawn without waiting
  const viewChanged = () => { drawVersion++; viewVer++; tissueKey = ''; layoutKey = ''; if (!raf && fade > 0) raf = nextFrame(loop); };
  const toWorld = (p) => [(p[0] - V.x) / V.k, (p[1] - V.y) / V.k];
  const toScreen = (p) => [p[0] * V.k + V.x, p[1] * V.k + V.y];
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
    const w = part === 'triad' ? [lerp(tri[0], g.cx, 0.12), lerp(tri[1], g.cy, 0.12)] : part === 'central' ? [g.cx, g.cy] : [lerp(tri[0], g.cx, 0.5), lerp(tri[1], g.cy, 0.5)];
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
    const saved = { ...V };
    Object.assign(V, { k, x: mx - w[0] * k, y: my - w[1] * k }); clampV();
    const to = { ...V }; Object.assign(V, saved);
    return to;
  }
  // Glides the view, at its zoom, to bring a world point to the middle of the free space.
  function centreOn(w) {
    const f = freeRect(), saved = { ...V };
    Object.assign(V, { k: V.k, x: (f.l + f.r) / 2 - w[0] * V.k, y: (f.t + f.b) / 2 - w[1] * V.k }); clampV();
    const to = { ...V }; Object.assign(V, saved); glideTo(to, 380);
  }
  function fitView() { if (sinTo) return; handsOff(); atFit = true; const F0 = fitV(); kFit = F0.k; glideTo(F0); }
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
  let wheelKind = null, wheelAt = 0, wheelOutOK = false, wheelDir = 0, wheelMute = false;
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (wheelMute) { const now = performance.now(); if (now - wheelAt < 250) { wheelAt = now; return; } wheelMute = false; }
    stopInertia();
    cancelFrame(glide); gliding = false;   // a button's glide never fights the hand
    const u = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? el.clientHeight : 1, dx = ev.deltaX * u, dy = ev.deltaY * u, now = performance.now();
    if (now - wheelAt > 250 || Math.sign(dy) !== wheelDir) wheelOutOK = V.k <= kFit * 1.001;
    wheelDir = Math.sign(dy);   // only a gesture that begins at the framing may carry on out to the anatomy
    if (now - wheelAt > 250) wheelKind = ev.ctrlKey || ev.metaKey ? 'pinch' : ev.deltaMode === 0 && (dx !== 0 || ev.wheelDeltaY == null || Math.abs(Math.abs(ev.wheelDeltaY) - Math.abs(ev.deltaY) * 3) < 1) ? 'pad' : 'wheel';
    wheelAt = now;
    if (wheelKind === 'pad' && !ev.ctrlKey && !ev.metaKey) {
      if (V.k <= kFit * 1.001 && geo) {   // at its framing the lobule follows the scroll on a rubber band, and springs back when it stops
        const F0 = fitV(), Lx = 0.4 * (el.clientWidth || 800), Ly = 0.4 * (el.clientHeight || 600);
        const bx = rubber ? Math.atanh(clamp((V.x - F0.x) / Lx, -0.999, 0.999)) * Lx : 0, by = rubber ? Math.atanh(clamp((V.y - F0.y) / Ly, -0.999, 0.999)) * Ly : 0;
        rubber = true; atFit = false;
        V.x = F0.x + bandOffset(bx - dx, Lx); V.y = F0.y + bandOffset(by - dy, Ly); viewChanged();
        clearTimeout(rubberT);
        rubberT = setTimeout(() => { rubber = false; const G0 = fitV(); glideTo(G0, 380); atFit = true; }, 220);
        return;
      }
      V.x -= dx; V.y -= dy; atFit = false; clampV(); viewChanged();
      return;
    }
    const f = ev.ctrlKey || ev.metaKey ? Math.exp(-clamp(dy, -50, 50) * 0.01) : Math.exp(-clamp(dy, -120, 120) * 0.0015);
    if (V.k <= kFit * 1.001 && f < 1) {
      if (wheelOutOK && outHandler) { outHandler(f); return; }   // a new zoom-out at its framing hands over to the stage, which scrubs the dive back
      const p = local(ev); stretchBy(p[0], p[1], f); clearTimeout(stretchT); stretchT = setTimeout(endStretch, 220); return;   // one that arrived from deeper in stretches and springs back
    }
    if (rawK && f > 1) { const p = local(ev); stretchBy(p[0], p[1], f); clearTimeout(stretchT); stretchT = setTimeout(endStretch, 220); return; }
    const p = local(ev);
    zoomAround(p[0], p[1], f);
  }, { passive: false });
  const touches = new Map();
  let pinch = null, down = null, drag = null;
  const pts2 = () => [...touches.values()];
  const labelOf = (ev) => Object.entries(labs).find(([, L]) => L.el.contains(ev.target))?.[0];
  const onScene = (ev) => !!ev.target.closest?.('.lz-lab') || ev.target === el || ev.target === fx || ev.target === leaders || ev.target === tissue || ev.target === glCv;
  el.addEventListener('pointerdown', (ev) => {
    if (!onScene(ev) || systemEdge(ev)) return;
    stopInertia();
    if (ev.isPrimary) touches.clear();
    touches.set(ev.pointerId, local(ev));
    cancelFrame(glide); gliding = false;
    // Captured, so a drag keeps going over the labels, the card or past the edge.
    try { el.setPointerCapture(ev.pointerId); } catch { /* gone */ }
    if (touches.size === 2) {
      const [a, b] = pts2();
      pinch = { atFit: V.k <= kFit * 1.001, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k: V.k, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      down = null; drag = null;
    } else { down = { x: ev.clientX, y: ev.clientY, t: performance.now(), label: labelOf(ev) }; drag = { p: local(ev), trail: [[performance.now(), V.x, V.y]] }; }
  });
  el.addEventListener('pointermove', (ev) => {
    if (touches.has(ev.pointerId)) {
      touches.set(ev.pointerId, local(ev));
      if (touches.size === 2 && pinch) {
        const [a, b] = pts2(), d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        V.x += m[0] - pinch.m[0]; V.y += m[1] - pinch.m[1]; pinch.m = m;
        const dl = pinch.dl || pinch.d; pinch.dl = d;
        if (rawK || (V.k <= kFit * 1.001 && d < dl)) {
          if (pinch.atFit && !rawK && outHandler) outHandler(d / dl); else stretchBy(m[0], m[1], d / dl);
          return;
        }
        zoomAround(m[0], m[1], (pinch.k * d / pinch.d) / V.k);
      } else if (touches.size === 1 && drag && (ev.buttons || ev.pointerType !== 'mouse')) {
        const p = local(ev);
        if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 8) return;
        down = null;
        if (V.k > kFit * 1.001) { V.x += p[0] - drag.p[0]; V.y += p[1] - drag.p[1]; clampV(); viewChanged(); el.classList.add('lz-drag'); }
        else if (geo) {   // at its framing there is nowhere to go: the lobule follows the hand on a rubber band and springs back on release
          const F0 = fitV(), o = drag.o || (drag.o = [0, 0]), Lx = 0.4 * (el.clientWidth || 800), Ly = 0.4 * (el.clientHeight || 600);   // near-free travel, easing toward 40% of the view
          cancelFrame(glide); gliding = false; rubber = true; o[0] += p[0] - drag.p[0]; o[1] += p[1] - drag.p[1];
          V.x = F0.x + Lx * Math.tanh(o[0] / Lx); V.y = F0.y + Ly * Math.tanh(o[1] / Ly); atFit = false; viewChanged(); el.classList.add('lz-drag');
        }
        drag.p = p;
        const now = performance.now();
        drag.trail.push([now, V.x, V.y]);
        while (drag.trail.length > 2 && now - drag.trail[0][0] > 90) drag.trail.shift();
      }
    }
    if (ev.pointerType === 'mouse' && !ev.buttons && geo && onScene(ev)) { const w = toWorld(local(ev)); el.classList.toggle('lz-hot', !!hit(w[0], w[1])); }
  });
  el.addEventListener('pointerup', (ev) => {
    if (down && touches.size <= 1 && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 8 && performance.now() - down.t < 600 && onScene(ev)) {
      const w = down.label ? anchorOf(down.label) : toWorld(local(ev));
      if (down.label && labs[down.label]?.el.classList.contains('edge')) centreOn(w);
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
      const tr = finished.trail, a = tr[0], b = tr[tr.length - 1], dt = b[0] - a[0];
      if (tr.length >= 3 && dt >= 30 && performance.now() - b[0] < 50 && V.k > kFit * 1.001) {
        const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt;
        const cap = Math.min(1, 2 / (Math.hypot(vx, vy) || 1));
        fling(vx * cap, vy * cap);
      }
    }
    // Rebase the remaining finger after a pinch so it can carry on panning without a jump.
    drag = touches.size === 1 ? { p: pts2()[0], trail: [[performance.now(), V.x, V.y]] } : null;
    if (!touches.size) el.classList.remove('lz-drag');
  });
  el.addEventListener('dblclick', (ev) => { if (!onScene(ev)) return; const p = local(ev); zoomAround(p[0], p[1], V.k < kFit * KMAX * 0.98 ? 2 : 1 / KMAX); });
  const local = (ev) => { const r = el.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };

  // ── Selection: the lobule's parts open the same action card as the anatomy's vessels ──
  function select(hv, at) {
    if (!hv) { if (store.get().selection?.type === 'lobule') store.set({ selection: null }); return; }
    store.set({ selection: { type: 'lobule', ...hv, at } });
  }
  const idsFor = (sl) => {
    const G = geo;
    if (!G || sl?.type !== 'lobule') return new Set();
    const tr = sl.tri != null ? G.triads[sl.tri] : null;
    if (sl.part === 'triad' && tr) return new Set([tr.pv.id, G.inlets[tr.i * 2].id, G.inlets[tr.i * 2 + 1].id]);
    if (sl.part === 'sin' && sl.tube != null) return chainOf(sl.tube);
    if (sl.part === 'ha' && tr) return new Set([tr.haT.id, ...G.tubes.filter((t) => t.kind === 'tw' && t.tri === tr.i).map((t) => t.id)]);
    if (sl.part === 'bd' && tr) return new Set([tr.bdT.id]);
    if (sl.part === 'lv' && sl.tube != null) return chainOf(sl.tube);
    if (sl.part === 'lv' && tr) return new Set([tr.lv.id]);
    if (sl.part === 'cv') return new Set([G.cv.id]);
    if (sl.tube != null) return new Set([sl.tube]);
    return new Set();
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
  store.on('compareSnap', () => nextFrame(() => { if (geo && fade > 0) { layoutKey = ''; refit(); } }));

  // ── State ──
  let F = null, fade = 0, raf = 0, last = 0, lastPaint = 0;
  let geo = null, geoKey = '', model = null;
  // Where each vessel's moving marks are (blood stream, chevrons, lymph drops), kept by tube id so a
  // rebuilt geometry (a resize, the phone's toolbar sliding) carries on from the same place, not a jump.
  const motion = new Map();
  let lyV = null;
  const motionOf = (t) => { let mo = motion.get(t.id); if (!mo) motion.set(t.id, (mo = {})); return mo; };
  let drawVersion = 0, idleDrawn = '', lastSurface = 0;
  const binCache = new Map();
  // Any change may show in the lobule, except these, which never do (the model's frame arrives through update()).
  const UNSEEN = new Set(['frame', 'historyTick', 'details', 'found', 'presetLoading', 'presetList', 'lastHVPG', 'speed', 'lapse', 'tool', 'hiddenReadouts', 'hiddenEvents', 'booted']);
  store.on('*', (keys) => { if (!Array.isArray(keys) || keys.some((k) => !UNSEEN.has(k))) { drawVersion++; if (!raf && fade > 0) raf = nextFrame(loop); } });
  let lzYield = null;
  let layoutV = '', gl = null, glTried = false, binKey = '', binReach = [], radKey = [], radAll = '', attrKey = '', drawKey = '', glDirty = true, tissueKey = '', worldKey = '', layoutKey = '';
  let worldCv = document.createElement('canvas');   // the lobule's tissue in world space (see paintTissue)
  // A new patient (or any change to the tissue's state) crossfades into the lobule instead of snapping: the bitmap it replaces
  // is kept (worldOld, swapped rather than copied) and laid under the new one as it fades in, and the surround's tiles the
  // same way. Both pictures stay sharp throughout; the fade only adds one image draw a frame while it runs.
  const XF_MS = 900;   // as long as the vessels' calibers take to settle (easeRadii, τ 0.3 s)
  let worldOld = document.createElement('canvas'), worldOldSc = 0, worldState = '', xfT0 = 0, surNow = null, surOld = null, surT0 = 0;
  const xfU = (t0, now) => { const u = Math.min(1, Math.max(0, (now - t0) / XF_MS)); return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; };
  const tissueFading = (now = performance.now()) => (xfT0 > 0 && now - xfT0 < XF_MS) || (surT0 > 0 && now - surT0 < XF_MS);
  const tubeData = new Float32Array(MAXT * TUBE_TEXELS * 4), flowData = new Float32Array(MAXT * FLOW_TEXELS * 4);
  // The vessel attributes as last sent (tubeShown), the rows changed since the vessel layer was drawn (glRows), and the
  // look it was drawn with (glLook): a redraw of only those rows' cells stands in for a whole one (veins-gl drawRows).
  let tubeShown = null, glLook = '';
  const glRows = new Set();
  let clock = 0, origins = null, originsF = null;
  const pc = (p) => (model?.hide ? tk('--lz-lumen-hidden') : pressureColor(p));

  function ensureGL() {
    if (glTried) return gl;
    glTried = true;
    gl = createVeinsGL(glCv, { tubes: MAXT, force: true });
    el.dataset.vessels = gl ? 'webgl2' : 'flat';
    // (A software renderer only: each lobule frame waits for the last to finish on the GPU and gives the page as long again,
    // as the anatomy's vessels do; see sw-yield.js. On a GPU there is no yield.)
    lzYield = softwareYield(!!gl?.software, gl?.software ? glCv.getContext('webgl2') : null);
    if (!gl) { glCv.remove(); return null; }
    return gl;
  }
  // (Registered once: one per ensureGL would add another handler on every restore.)
  glCv.addEventListener('webglcontextrestored', () => { glTried = false; gl = null; binKey = ''; radKey = []; radAll = ''; attrKey = ''; ensureGL(); if (F) update(F); });
  // Closed: the full-screen canvases and the vessels' GPU buffers are given back (they are sized again on the way in).
  // The world bitmap, the field's tiles and the uploaded network stay, so the next dive has nothing heavy to build.
  const free = (cv) => { if (cv.width || cv.height) { cv.width = 0; cv.height = 0; } };
  function release() {
    free(tissue); free(fx); free(glCv); free(diveCv); diveCopyKey = '';
    gl?.trim?.();   // (the vessels' framebuffer: the shaders and the uploaded network are kept)
    tissueKey = ''; idleDrawn = ''; drawKey = ''; glDirty = true; fxKey = '';
    staged = ''; relLater = false;
    trimCaches();
  }
  // What a visit zoomed in left behind, beyond what the next dive needs (#26: 46-77 MB kept in the anatomy): the world bitmap drawn
  // for a close zoom (up to 3600 px square) and the field tiles above the landing's size (the 384 px set is 12 MB a copy, three copies).
  // The landing's own pieces stay, so the next dive is still ready ahead; the idle preparation redraws a trimmed world bitmap at the framing.
  function trimCaches() {
    if (!geo) return;
    const dpr = Math.min(2, devicePixelRatio || 1), k = kFit || V.k;
    const sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * k)) * 2) / 2), 3600 / (2.6 * geo.R)), n = Math.ceil(2.6 * geo.R * sc);
    if (worldCv.width > n) { free(worldCv); worldKey = ''; prepKey = ''; }
    free(worldOld); xfT0 = 0; surNow = null; surOld = null; surT0 = 0;
    // The field: the newest state's tiles only, and none above the largest the dive or the framed lobule draws.
    const keys = [...tileSets.keys()], top = Math.max(geo.R * k * Math.min(1, devicePixelRatio || 1) * 0.8, geo.R * k * dpr) * 0.55;
    const drop = (q) => { if (q.cv) free(q.cv); if (q.quiet) free(q.quiet.cv); if (q.liverQ) free(q.liverQ.cv); q.cv = null; q.quiet = null; q.liverQ = null; };
    for (const key of keys.slice(0, -1)) { for (const q of tileSets.get(key)) drop(q); tileSets.delete(key); }
    const tiles = tileSets.get(keys[keys.length - 1]);
    if (tiles) { const keepR = (tiles.find((q) => q.R >= top) || tiles[tiles.length - 1]).R; for (const q of tiles) if (q.R > keepR && q.cv) { drop(q); prepKey = ''; } }
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
    const lob = [[cx, cy, 1]];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3, d = Math.sqrt(3) * R; lob.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0]); }
    const lobules = lob.map(([x, y, main]) => ({ x, y, main, corners: Array.from({ length: 6 }, (_, i) => [x + Math.cos((i * Math.PI) / 3) * R, y + Math.sin((i * Math.PI) / 3) * R]) }));
    const C = lobules[0].corners;
    const tubes = [], joins = [];
    const add = (kind, c, o = {}) => { const t = { id: tubes.length, kind, pts: c.pts, len: c.len, ...o }; t.rho = t.pts.map(([x, y]) => Math.hypot(x - cx, y - cy) / R); tubes.push(t); return t; };
    const join = (x, y, members, rSmall) => { const k = clamp(1.2 * rSmall + 1.2, 1.5, 9); joins.push({ x, y, k, reach: 2 * rSmall + k + 10, members: members.map((t) => t.id) }); };
    const rs0 = clamp(R * 0.0085, 1.7, 3);     // sinusoid lumen (healthy), before SIN_NARROW
    const rsN = rs0 * SIN_NARROW;              // as drawn: a quarter narrower than the cords' gap (G21)
    const rcv0 = R * 0.07;
    const polar = (x, y) => [Math.hypot(x - cx, y - cy), Math.atan2(y - cy, x - cx)];
    const unwrap = (a, ref) => a + Math.round((ref - a) / TAU) * TAU;
    // A course between two polar points, radial at both ends (so siblings meet smoothly), with a little meander.
    const radial = (p0, p1, amp) => {
      const [r0, a0] = polar(...p0); let [r1, a1] = polar(...p1); a1 = unwrap(a1, a0);
      const ph = r() * TAU, fq = 1.2 + r() * 1.2;
      return curve((u) => {
        const e = u * u * (3 - 2 * u), rr = lerp(r0, r1, u);
        const a = lerp(a0, a1, e) + (amp * Math.sin(Math.PI * u) * Math.sin(fq * TAU * u + ph)) / Math.max(rr, 1);
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
      });
    };
    // Portal triads at the six corners: venule (end-on), arteriole, bile ductule.
    const rt = R * 0.1;
    const triads = C.map(([x, y], i) => {
      // Arteriole, lymphatic and ductule side by side on an arc outside the venule, in the portal tract between
      // the two inlet venules' courses; each far enough out that none touches the venule or another.
      const a = Math.atan2(y - cy, x - cx), d = R * TRIAD_D;
      const ha = [x + Math.cos(a + TRIAD_A) * d, y + Math.sin(a + TRIAD_A) * d];
      const bd = [x + Math.cos(a - TRIAD_A) * d, y + Math.sin(a - TRIAD_A) * d];
      return { i, x, y, a, ha, bd, pv: add('pv', dot(x, y), { tri: i }), haT: add('ha', dot(...ha), { tri: i }), bdT: add('bd', dot(...bd), { tri: i }) };
    });
    // Inlet venules: from each triad along both of its edges, a little inside the lobule.
    const inletF = (i, dir) => {
      const A = C[i], B = C[(i + dir + 6) % 6], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my);
      const n = [(cx - mx) / nl, (cy - my) / nl], bow = R * 0.03;
      return (u) => [A[0] + (B[0] - A[0]) * 0.5 * u + n[0] * bow * Math.sin(0.8 * Math.PI * u), A[1] + (B[1] - A[1]) * 0.5 * u + n[1] * bow * Math.sin(0.8 * Math.PI * u)];
    };
    const inlets = [];
    for (let i = 0; i < 6; i++) for (const dir of [1, -1]) {
      const f = inletF(i, dir), t = add('in', curve(f), { tri: i, f });
      inlets[i * 2 + (dir > 0 ? 0 : 1)] = t;
    }
    for (const tr of triads) join(tr.x, tr.y, [tr.pv, inlets[tr.i * 2], inlets[tr.i * 2 + 1]], R * 0.011);
    // Inlet venules from neighbouring triads meet halfway along the edge.
    for (let e = 0; e < 6; e++) { const a = inlets[e * 2], b = inlets[((e + 1) % 6) * 2 + 1], q = a.pts[N - 1]; join(q[0], q[1], [a, b], R * 0.009); }
    // Sinusoids, in three generations that merge pairwise toward the central vein.
    const N0 = R > 190 ? 8 : 6;
    const s0 = [];
    for (let e = 0; e < 6; e++) for (let k = 0; k < N0; k++) {
      const tt = (k + 0.5) / N0 + (r() - 0.5) * (0.3 / N0);
      const inl = tt < 0.5 ? inlets[e * 2] : inlets[((e + 1) % 6) * 2 + 1];
      const u = clamp(tt < 0.5 ? tt / 0.5 : (1 - tt) / 0.5, 0.08, 0.95);
      s0.push({ p: inl.f(u), inl, e, k });
    }
    const rho1 = R * 0.6, rho2 = R * 0.34, rIn = rcv0 * 0.55;
    const node = (pa, pb, rho) => { const [, a] = polar(...pa); let [, b] = polar(...pb); b = unwrap(b, a); const m = (a + b) / 2 + (r() - 0.5) * 0.04; const rr = rho * (1 + (r() - 0.5) * 0.08); return [cx + Math.cos(m) * rr, cy + Math.sin(m) * rr]; };
    const n1 = [], L0 = [], L1 = [], L2 = [];
    for (let m = 0; m < s0.length / 2; m++) n1.push(node(s0[2 * m].p, s0[2 * m + 1].p, rho1));
    const n2 = [];
    for (let m = 0; m < Math.floor(n1.length / 2); m++) n2.push(node(n1[2 * m], n1[2 * m + 1], rho2));
    const amp = R * 0.012;
    s0.forEach((st, j) => {
      const t = add('s0', radial(st.p, n1[j >> 1], amp), { lvl: 0, edge: st.e, tri: st.k < N0 / 2 ? st.e : (st.e + 1) % 6, inl: st.inl.id });
      L0.push(t);
      join(st.p[0], st.p[1], [st.inl, t], rsN);
    });
    n1.forEach((p, m) => { const t = add('s1', radial(p, n2[Math.min(n2.length - 1, m >> 1)], amp), { lvl: 1 }); L1.push(t); join(p[0], p[1], [L0[2 * m], L0[2 * m + 1], t], rsN); L0[2 * m].parent = L0[2 * m + 1].parent = t.id; });
    // An odd first-generation node (6 per edge) joins its neighbour's second-generation course.
    n2.forEach((p, m) => {
      const [, a] = polar(...p);
      const t = add('s2', radial(p, [cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn], amp * 0.6), { lvl: 2 });
      L2.push(t);
      const kids = L1.filter((_, j) => Math.min(n2.length - 1, j >> 1) === m);
      join(p[0], p[1], [...kids.slice(0, 3), t], rsN);
      for (const k of kids) k.parent = t.id;
    });
    // Anastomoses: short cross-links between neighbouring sinusoids that do not merge.
    const link = (a, b, ua, ub, lvl) => {
      const pa = at(a.pts, ua), pb = at(b.pts, ub);
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > R * 0.24) return;
      const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, k = (r() - 0.5) * 0.25;
      const t = add('an', curve((u) => [lerp(pa[0], pb[0], u) + (pb[1] - pa[1]) * k * Math.sin(Math.PI * u), lerp(pa[1], pb[1], u) - (pb[0] - pa[0]) * k * Math.sin(Math.PI * u)]), { lvl, sign: r() < 0.5 ? -1 : 1, mid: [mx, my] });
      join(pa[0], pa[1], [a, t], rsN * 0.7); join(pb[0], pb[1], [b, t], rsN * 0.7);
    };
    for (let m = 0; m < L0.length / 2; m++) link(L0[2 * m + 1], L0[(2 * m + 2) % L0.length], 0.35 + r() * 0.25, 0.35 + r() * 0.25, 0);
    for (let m = 0; m < L1.length; m += 2) if (L1[m + 1] && L1[m + 2]) link(L1[m + 1], L1[(m + 2) % L1.length], 0.4 + r() * 0.2, 0.4 + r() * 0.2, 1);
    // Central vein (end-on), with the third generation entering it.
    const cv = add('cv', dot(cx, cy));
    for (const t of L2) { const [, a] = polar(...t.pts[0]); join(cx + Math.cos(a) * rcv0, cy + Math.sin(a) * rcv0, [t, cv], rsN * 1.3); }
    // Arterioles: from each triad's arteriole into the first stretch of a sinusoid (zone 1).
    for (const tr of triads) {
      const target = L0.find((t) => t.edge === tr.i && t.tri === tr.i) || L0[tr.i * N0];
      const q = at(target.pts, 0.2), A = tr.ha;
      const cxp = lerp(A[0], q[0], 0.5) + (cx - tr.x) * 0.06, cyp = lerp(A[1], q[1], 0.5) + (cy - tr.y) * 0.06;
      const t = add('tw', curve((u) => [(1 - u) ** 2 * A[0] + 2 * u * (1 - u) * cxp + u * u * q[0], (1 - u) ** 2 * A[1] + 2 * u * (1 - u) * cyp + u * u * q[1]]), { tri: tr.i });
      join(A[0], A[1], [tr.haT, t], 1.2); join(q[0], q[1], [target, t], 1.6);
    }
    // Portal-central septa (advanced cirrhosis): from three triads into the central vein's
    // collagen cuff, so the bridges meet the venule and cut the lobule into three nodules.
    const septaPC = [0, 2, 4].map((i) => {
      const [x, y] = C[i], ph = r() * TAU, nx = -(cy - y) / R, ny = (cx - x) / R;
      return curve((u) => { const e = R * 0.05 * Math.sin(Math.PI * u) * Math.sin(1.5 * TAU * u + ph); return [lerp(x, cx, u * 0.94) + nx * e, lerp(y, cy, u * 0.94) + ny * e]; });
    });
    // Hepatocytes: plates one cell thick, running from the central vein out to the portal tracts between
    // the sinusoids, with the space of Disse a thin gap on both sides. Ring by ring, each gap between
    // neighbouring sinusoids holds a plate (two side by side where the sinusoids are far apart, near
    // their forks); along a plate the cells stack outward like beads on a cord.
    const cells = [];
    const sinP = [...L0, ...L1, ...L2].map((t) => ({ rs: rsN * (t.kind === 's0' ? 1 : t.kind === 's1' ? 1.15 : 1.3), P: t.pts.map(([x, y]) => polar(x, y)) }));
    const crossAt = (rr) => {
      const out = [];
      for (const { rs, P } of sinP) for (let i = 0; i < P.length - 1; i++) {
        const [r1, a1] = P[i], [r2, b2] = P[i + 1];
        if ((r1 - rr) * (r2 - rr) > 0 || r1 === r2) continue;
        const a2 = unwrap(b2, a1), a = a1 + (a2 - a1) * ((rr - r1) / (r2 - r1));
        out.push({ a: Math.atan2(Math.sin(a), Math.cos(a)), rs }); break;
      }
      return out.sort((p, q) => p.a - q.a);
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
          cells.push({ x, y, a, l: cl * (0.84 + r() * 0.08), w: w * (n > 1 ? 0.86 : 0.94), tone: r(), nu: (r() - 0.5) * 0.3, q, drop: r(), jx: r() - 0.5, jy: r() - 0.5, ja: r() - 0.5 });
        }
      }
    }
    // Stellate cells in the space of Disse, beside sinusoids.
    const hsc = [];
    for (let i = 0; i < (R > 190 ? 22 : 14); i++) {
      const t = [...L0, ...L1][Math.floor(r() * (L0.length + L1.length))], u = 0.15 + r() * 0.7, [x, y] = at(t.pts, u), [x2, y2] = at(t.pts, u + 0.02);
      const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, sd = r() < 0.5 ? -1 : 1;
      r();   // (keeps the seeded sequence)
      hsc.push({ x: x - (dy / l) * sd * (rsN + rs0 * 0.9), y: y + (dx / l) * sd * (rsN + rs0 * 0.9), a: Math.atan2(dy, dx), nx: (-dy / l) * sd, ny: (dx / l) * sd });
    }
    // Lymph droplets: start deep in the lobule, drift to the nearest triad.
    // Lymph shimmer: each streak rises deep in the lobule and drifts out through the tissue to the nearest triad.
    const lymph = Array.from({ length: 140 }, () => ({ ph: r(), a: r() * TAU, r0: 0.1 + r() * 0.4, sp: 0.7 + r() * 0.6, w: r() * TAU, len: 0.07 + r() * 0.06 }));
    // Lymphatics (shown with the Lymph toggle): plasma filtered into the space of Disse runs out along
    // each sinusoid (a thin channel beside it, between the sinusoid and its plate), against the blood,
    // to the edge of the lobule; there terminal lymphatics carry it along the limiting plate to the
    // lymphatic vessel in each portal tract.
    // The portal tract's own lymphatic, end-on beside the venule (on its outer side, away from the arteriole and ductule).
    for (const tr of triads) { const d = R * TRIAD_D; tr.lv = add('lv', dot(tr.x + Math.cos(tr.a) * d, tr.y + Math.sin(tr.a) * d), { tri: tr.i, lymph: true }); }
    const lyOff = rsN + rs0 * 1.1;   // (rs0 × 2.1 before the sinusoids narrowed: the same gap from their wall)
    const beside = (t) => t.pts.map((q, i) => { const a = t.pts[Math.max(0, i - 1)], b = t.pts[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [q[0] - ((b[1] - a[1]) / L) * lyOff, q[1] + ((b[0] - a[0]) / L) * lyOff]; });
    // Along each edge, from its midpoint to the triad at either end, in the portal tract just outside
    // the inlet venule: its course offset outward (so the venule stays in view, the lymph beneath it),
    // curving at the end into the tract's lymphatic.
    const lt = [];
    for (let i = 0; i < 6; i++) for (const dir of [1, -1]) {
      const A = C[i], B = C[(i + dir + 6) % 6], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nl = Math.hypot(cx - mx, cy - my);
      const nx = (mx - cx) / nl, ny = (my - cy) / nl, f = inlets[i * 2 + (dir > 0 ? 0 : 1)].f, lv = triads[i].lv.pts[0];
      const t = add('lt', curve((u) => {
        const q = f(1 - u), o = R * lerp(0.04, 0.025, 1 - u), e = smooth(0.78, 1, u), px = q[0] + nx * o, py = q[1] + ny * o;
        return [lerp(px, lv[0], e), lerp(py, lv[1], e)];
      }), { tri: i, lymph: true });
      lt[i * 2 + (dir > 0 ? 0 : 1)] = t;
    }
    for (const tr of triads) { const a = lt[tr.i * 2], b = lt[tr.i * 2 + 1], q = tr.lv.pts[0]; join(q[0], q[1], [a, b, tr.lv], R * 0.008); }
    for (let e = 0; e < 6; e++) { const a = lt[e * 2], b = lt[((e + 1) % 6) * 2 + 1], q = a.pts[0]; join(q[0], q[1], [a, b], R * 0.006); }
    // The space of Disse beside each sinusoid; the first generation's reaches the limiting plate.
    for (const t of L0) {
      const P = beside(t), side = t.tri === t.edge ? lt[t.edge * 2] : lt[((t.edge + 1) % 6) * 2 + 1];
      let E = side.pts[0], bd = Infinity;
      for (const q of side.pts) { const d = Math.hypot(q[0] - P[0][0], q[1] - P[0][1]); if (d < bd) { bd = d; E = q; } }
      const poly = [E, ...P];
      const d = add('ly', curve((u) => at(poly, u)), { lymph: true, lvl: 0 });
      join(E[0], E[1], [side, d], R * 0.004);
    }
    for (const t of L1) add('ly', curve((u) => at(beside(t), u)), { lymph: true, lvl: 1 });
    // …and on along the innermost sinusoids, thinning out toward the central vein (lymph forms all along
    // the sinusoid, least where the plates converge), so the channel fades in rather than starting abruptly.
    for (const t of L2) add('ly', curve((u) => at(beside(t), u)), { lymph: true, lvl: 2 });
    return { W, H, phone, R, cx, cy, rt, rs0, rcv0, lobules, tubes, bloodTubes: tubes.filter((t) => !t.lymph), joins, triads, inlets, L0, L1, L2, cv, septaPC, cells, hsc, lymph };
  }
  function hexFrac(x, y, cx, cy, R) {
    let m = 0;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; m = Math.max(m, ((x - cx) * Math.cos(a) + (y - cy) * Math.sin(a)) / (R * 0.8660254)); }
    return m;
  }
  const zoneOf = (q) => (q > 0.66 ? 1 : q > 0.36 ? 2 : 3);

  // ── Model → lobule ──
  const easeP = createEaser();
  let easeRaf = 0;
  function update(f) {
    drawVersion++;
    F = f;
    if (fade <= 0 && !staging) return;
    const st = store.get();
    // Pressures ease toward the model's beat-filtered values (shared with the Pressure card), so the
    // ladder, labels and colors glide rather than jump, every display frame between model frames.
    const eased = easeP.step(f.Pf || f.P);
    model = lobuleState({ ...f, P: eased.v }, st);
    noteLens(model.mode);
    cancelFrame(easeRaf);
    if (eased.moving) easeRaf = nextFrame(glideP);
    const hs = getComputedStyle(host), cv = (n, d) => hs.getPropertyValue(n).trim() || d;
    model.inks = { normal: cv('--flow-normal'), reversed: cv('--flow-reversed'), portal: cv('--vein-portal'), systemic: cv('--vein-systemic') };
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
    const eased = easeP.step(F.Pf || F.P);
    const inks = model.inks;
    drawVersion++;
    model = lobuleState({ ...F, P: eased.v }, store.get());
    noteLens(model.mode);
    model.inks = inks;
    panel();
    if (eased.moving) easeRaf = nextFrame(glideP);
  }

  function panel() {
    const m = model;
    // On a slide, once settled the sinusoids read the slide's own value, as its tile does (lobule and sinusoid labels agree with it).
    { const st = store.get(), fs = st.presenting && st.presentFp?.sin; if (Number.isFinite(fs) && Math.abs(m.P2 - fs) < 0.6) m.P2 = fs; }
    tissue.setAttribute('aria-label', m.hide ? 'Liver lobule. Pressures not measured.'
      : `Liver lobule: portal venule ${fmt(m.P1, 1)}, sinusoids ${fmt(m.P2, 1)}, central vein ${fmt(m.P3, 1)} millimeters of mercury; sinusoidal flow ${Math.round(m.flow * 100)} percent of normal.`);
    // Station cards on the figure.
    // Labels as in the anatomy: the station, its pressure, and the change from healthy once it reaches
    // 5 mmHg; while comparing, every change from the pinned moment (shown at 1, dropped below 0.7).
    // In the Change view the bar takes the change's colour, as the vessels do.
    const mv = (key, v, r) => {
      if (m.hide) return ['?', '', '', null];
      const d = r != null ? v - r : 0, on = m.cmp ? 1 : 5, off = m.cmp ? 0.7 : 4;
      const shown = Math.abs(d) >= on || (badges[key] === m.cmp && Math.abs(d) >= off);
      badges[key] = shown ? m.cmp : null;
      return [fmt(v, 1), 'mmHg', shown ? `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 0)}` : '', m.mode === 'delta' ? deltaColor(qP(d)) : pc(v)];
    };
    setLab('triad', 'Portal venule', 'Portal venule', ...mv('triad', m.P1, m.R[0]));
    setLab('sin', 'Sinusoids', 'Sinusoids', ...mv('sin', m.P2, m.R[1]));
    setLab('cv', 'Central vein', 'Central vein', ...mv('cv', m.P3, m.R[2]));
    // Lymph (Lymph layer on): the whole liver's rate and its protein; the change from healthy is on its card.
    if (m.hide) setLab('lymph', 'Lymphatic', 'Lymph', '?', '', '', null);
    else setLab('lymph', 'Lymphatic', 'Lymph', fmt(m.lymph, 1), `mL/min · Protein ${Math.round(m.lyProt * 100)}%`, '', null);
    // The arteriole and the ductule: named only while a slide's term points at them (see named()).
    setLab('ha', 'Hepatic arteriole', 'Arteriole', '', '', '', 'var(--artery)');
    setLab('bd', 'Bile ductule', 'Ductule', '', '', '', 'var(--bile-duct)');
    if (sinTo || sinU > 0) sv.setModel(m);
  }

  // ── Station labels (HTML, styled as the anatomy's) with leaders ──
  const labs = {}, badges = {};
  // What a label's size depends on beyond its own text and classes (see layoutLabels).
  let fontVer = 0;
  document.fonts?.addEventListener?.('loadingdone', () => { fontVer++; });
  const sizeEnv = () => `${innerWidth}x${innerHeight}|${devicePixelRatio}|${fontVer}|${document.fonts?.status}|${[...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`).join(' ')}|${document.body.className}|${host.className}|${el.className}`;
  // A unit with a second reading ('mL/min · Protein 48%'): the second part can drop to its own line when the label is wide.
  const unitParts = (u) => {
    if (!u) return [];
    const [a, ...rest] = u.split(' · ');
    return rest.length ? [h('small', {}, a), h('small', { class: 'u2' }, h('span', { class: 'dot' }, '· '), rest.join(' · '))] : [h('small', {}, u)];
  };
  // What a presenter slide's terms call each label (presentLit, see presenter.js TARGETS).
  const LZ_TARGET = { ha: 'arteriole', bd: 'ductule', triad: 'triad', sin: 'sinusoid', cv: 'central', lymph: 'lymph' };
  function setLab(key, name, short, v, u, d, col) {
    let L = labs[key];
    if (!L) {
      L = labs[key] = { el: h('button', { class: 'lz-lab', type: 'button', 'data-target': `lobule:${LZ_TARGET[key] || key}` }), line: s('line', { class: 'leader', 'data-target': `lobule:${LZ_TARGET[key] || key}` }), dotEl: s('circle', { class: 'leader-dot', r: 3, 'data-target': `lobule:${LZ_TARGET[key] || key}` }) };
      L.el.addEventListener('click', (ev) => { if (!geo || ev.detail !== 0) return; const q = anchorOf(key); if (L.el.classList.contains('edge')) centreOn(q); else select(hitKind(key), [q[0], q[1]]); });
      labels.append(L.el); leaders.append(L.line, L.dotEl);
    }
    const txt = `${name}|${v}|${u}|${d}|${col}`;
    if (L.txt === txt) return;
    // Only the number (or its change) moved: its text is updated in place, and the labels are laid out again
    // only when it takes more or fewer characters (the label is rebuilt only when its make-up changes). The same holds for
    // a figure inside the unit ('Protein 48%', which moves with the pulse): its digits are tabular, so a new figure with
    // as many digits leaves the label's size as it was.
    const uk = u.replace(/\d/g, '0'), frame = `${name}|${short}|${uk}|${col}|${v === ''}|${!!d}`;
    if (L.frame === frame && L.b) {
      if (String(v).length !== L.b.textContent.length || (d && d.length !== L.dEl.textContent.length)) layoutKey = '';
      L.b.textContent = v;
      if (d) L.dEl.textContent = d;
      if (u !== L.u) { const [a, ...rest] = u.split(' · '); if (rest.length) { L.uEls[0].textContent = a; L.uEls[1].lastChild.textContent = rest.join(' · '); } else if (u) L.uEls[0].textContent = u; }
    } else {
      L.frame = frame;
      L.el.style.setProperty('--sw', col || 'var(--border-strong)');
      L.b = v === '' ? null : h('b', {}, v);
      L.dEl = d ? h('span', { class: 'd' }, d) : null;
      L.uEls = unitParts(u);
      L.el.replaceChildren(h('span', { class: 'n' }, h('span', { class: 'n-long' }, name), h('span', { class: 'n-short' }, short)),
        v === '' ? null : h('span', { class: 'v' }, L.b, ...L.uEls, L.dEl));
      layoutKey = '';
    }
    L.txt = txt; L.u = u;
    L.lk = `${name}|${short}|${uk}|${v === ''}|${!!d}`;   // what the layout depends on (a value of new length clears layoutKey above)
    L.el.setAttribute('aria-label', `${name} ${v} ${u}${d ? `, ${d.startsWith('▲') ? 'up' : 'down'} ${d.slice(2)} ${model?.cmp ? 'since then' : 'from healthy'}` : ''}. Show details`);
  }
  // Which portal venule and which sinusoid carry the label: at first the left portal venule and the
  // sinusoid just below the middle of the left side; as the view is zoomed or panned, the label stays
  // on its vessel while that is comfortably in view, and otherwise moves to the one in view nearest
  // the middle of the free space (so it does not jump about).
  // A presenter slide that lights lobule terms fades every other label and zone name out (app.css, --lit-o: 0): those take no room.
  const LIT_OK = ['triad', 'arteriole', 'ductule', 'sinusoid', 'central', 'lymph', 'zone1', 'zone3'].map((t) => `lobule:${t}`);
  const faded = (target) => {
    const app = document.querySelector('.app'), lit = app?.dataset.lit;
    if (!app?.classList.contains('presenting') || !lit || !/(^| )(lobule|sinusoid):/.test(lit)) return false;
    return !(LIT_OK.includes(target) && lit.split(' ').includes(target));
  };
  const named = (k) => !!document.querySelector('.app')?.dataset.lit?.split(' ').includes(`lobule:${LZ_TARGET[k]}`);
  const pick = { triad: 3, lt: null, sin: null, geo: null };
  // A sinusoid's reading sits half way from the portal tract to the central vein: along the middle generation's
  // course, or at the inner end of an outer one and the outer end of an inner one when only those are in view.
  const sinAt = (t) => at(t.pts, t.lvl === 0 ? 0.95 : t.lvl === 2 ? 0.2 : 0.45);
  const anchorOf = (key) => {
    const g = geo, C = g.lobules[0].corners;
    if (key === 'triad') return C[pick.triad];
    if (key === 'cv') return [g.cx, g.cy];
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
      const ang = (t) => { const [x, y] = sinAt(t); return Math.abs(Math.atan2(y - g.cy, x - g.cx) - 2.75); };
      pick.geo = g; pick.triad = 3; pick.sin = g.L1.reduce((b, t) => (ang(t) < ang(b) ? t : b), g.L1[0]).id;
    }
    return g.tubes[pick.sin] || g.L1[0];
  };
  function pickAnchors(fr) {
    const g = geo, C = g.lobules[0].corners;
    sinTube();
    const inside = (p, m) => { const [x, y] = toScreen(p); return x > fr.l + m && x < fr.r - m && y > fr.t + m && y < fr.b - m; };
    const mx = (fr.l + fr.r) / 2, my = (fr.t + fr.b) / 2, far = (p) => { const [x, y] = toScreen(p); return Math.hypot(x - mx, y - my); };
    const best = (cands, posOf, avoid, m = 72) => {
      let b = null, bs = Infinity;
      for (const c of cands) {
        const p = posOf(c);
        if (!inside(p, m)) continue;
        // Kept clear of the other labelled vessels, so the labels do not crowd each other.
        const sc = far(p) + avoid.reduce((a, q) => { const [x0, y0] = toScreen(p), [x1, y1] = toScreen(q), d = Math.hypot(x1 - x0, y1 - y0); return a + Math.max(0, 110 - d) * 3; }, 0);
        if (sc < bs) { bs = sc; b = c; }
      }
      return b;
    };
    // Framed to fit, the default pick stays wherever its vessel is in view (a lobule that fills a phone's width has its corners at the edge).
    const keep = atFit ? 4 : 36;
    // (A triad hard against the screen's side leaves its label no room beside it, only a long leader: another in view takes it.)
    const side = (p) => { const [x] = toScreen(p); return Math.min(x - fr.l, fr.r - x) < 60; };
    if (!inside(C[pick.triad], keep) || (side(C[pick.triad]) && C.some((q) => inside(q, 72) && !side(q)))) { const i = best([0, 1, 2, 3, 4, 5], (i) => C[i], [[g.cx, g.cy]]); if (i != null) pick.triad = i; }
    // The sinusoid's reading points at the middle of a sinusoid: a middle-generation one (half way from the portal tract
    // to the central vein), the outer or inner generation only when none of those is in view.
    if (!inside(sinAt(sinTube()), keep) || (sinTube().lvl !== 1 && best(g.L1, sinAt, [], 44))) { const av = [[g.cx, g.cy], C[pick.triad]], t = best(g.L1, sinAt, av) || best(g.L1, sinAt, av, 44) || best([...g.L0, ...g.L2], sinAt, av); if (t) pick.sin = t.id; }
  }
  const hitKind = (key) => (key === 'ha' || key === 'bd' ? { part: key, tri: pick.triad } : key === 'triad' ? { part: 'triad', tri: pick.triad } : key === 'cv' ? { part: 'cv' } : key === 'lymph' ? { part: 'lv', tri: pick.lt ?? pick.triad } : { part: 'sin', tube: sinTube().id });
  // The lesion pointer: a pill near the spot, clear of the labels and cards, with a leader to a ring on it. Eases in and out.
  let callPrev = null, callCost = 0;
  const LONG_LEAD = 140;   // px: the longest leader an optional label may take (a vessel label pays steeply past it)
  const CORE = ['cv', 'sin', 'triad'];   // the vessel labels: never left out for the slide's pill
  // The ring on the spot: its centre and radius on screen (null while the spot is out of view), and how far from the ring's
  // centre everything else keeps (the radius, half its 4 px stroke and a small gap), so no label or pill ever touches it.
  const RING_STROKE = 4, RING_GAP = 8;
  // The lobule's outline on screen. Callout pills prefer to sit outside it, a leader reaching in to the structure: `share` is
  // how much of a box lies inside the outline (0 to 1), and `outside` lists spots just beyond the rim, on rays from a point
  // through the lobule, for a box of the given size. A frame too small to hold them clamps them back inside, where the
  // share costs the same for every spot, so the label falls back to the inside only when there is no room outside.
  const hexOf = () => {
    const hex = geo.lobules[0].corners.map(toScreen);
    const inPoly = (x, y) => { let c = false; for (let i = 0, j = 5; i < 6; j = i++) { const [xi, yi] = hex[i], [xj, yj] = hex[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const memo = new Map();
    const share = (b) => { const key = `${b.l | 0},${b.t | 0},${b.r | 0},${b.b | 0}`; let m = memo.get(key); if (m === undefined) memo.set(key, m = shareOf(b)); return m; };
    const shareOf = (b) => { let n = 0; for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) if (inPoly(b.l + ((b.r - b.l) * (i + 0.5)) / 5, b.t + ((b.b - b.t) * (k + 0.5)) / 3)) n++; return n / 15; };
    const outside = (a, w, hh) => {
      const out = [];
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
        let exit = 0;
        for (let e = 0; e < 6; e++) {
          const [ax, ay] = hex[e], [bx, by] = hex[(e + 1) % 6], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const sv = ((ax - a[0]) * ey - (ay - a[1]) * ex) / den, u = ((ax - a[0]) * dy - (ay - a[1]) * dx) / den;
          if (sv > 0 && u >= 0 && u <= 1) exit = Math.max(exit, sv);
        }
        if (!exit) continue;
        const d = exit + Math.min(w / 2 / Math.max(Math.abs(dx), 1e-6), hh / 2 / Math.max(Math.abs(dy), 1e-6)) + 14;
        out.push([a[0] + dx * d, a[1] + dy * d]);
      }
      return out;
    };
    return { share, outside };
  };
  const INSIDE_COST = 3000;   // a label wholly inside the lobule costs this much more than one wholly outside (far below any clash)
  const callRingAt = (fr) => {
    const a = call && toScreen(anchorOf(call.at));
    if (!a || !(a[0] > fr.l && a[0] < fr.r && a[1] > fr.t && a[1] < fr.b)) return null;
    const rr = Math.max(10, (call.at === 'triad' ? (geo.rt || 6) * 1.6 : (geo.rcv0 || 6) * 1.1) * V.k);
    return { a, rr, clear: rr + RING_STROKE / 2 + RING_GAP };
  };
  // How far a box reaches into the ring's clear zone (0 when it keeps out): the nearest point of the box to the centre.
  const ringDepth = (ring, b) => {
    if (!ring) return 0;
    const dx = Math.max(b.l - ring.a[0], 0, ring.a[0] - b.r), dy = Math.max(b.t - ring.a[1], 0, ring.a[1] - b.b);
    return Math.max(0, ring.clear - Math.hypot(dx, dy));
  };
  function placeCall(fr, placed, cards, leads, crosses, ring, hex, keep = [], into = () => 0) {
    if (!callEl.isConnected) { labels.append(callEl); leaders.append(callLine, callRing); }
    const on = !!ring;
    for (const e of [callEl, callLine, callRing]) e.classList.toggle('on', on);
    if (!on) return null;
    const { a, rr } = ring;
    // Never wider than the free space: a long line wraps instead of running off the screen.
    const fit = `${Math.max(120, Math.round(fr.r - fr.l - 20))}px`;
    if (callEl.style.maxWidth !== fit) callEl.style.maxWidth = fit;
    const w = callEl.offsetWidth || 120, hh = callEl.offsetHeight || 28, pad = 10;
    const ov = (p, q) => Math.max(0, Math.min(p.r, q.r) - Math.max(p.l, q.l)) * Math.max(0, Math.min(p.b, q.b) - Math.max(p.t, q.t));
    let best = null;
    // Where it sat last time (relative to the spot) is tried too and kept while it is still as good: a value easing or a
    // label that moved a pixel never flips the pill to another side, and the leader with it.
    const cands = [];
    for (const r0 of [70, 100, 140]) for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2 - Math.PI / 2, r = Math.max(r0, ring.clear + hh / 2 + 8 + r0 - 70); cands.push([a[0] + Math.cos(t) * (r + w / 3), a[1] + Math.sin(t) * r, 0]); }
    for (const [px, py] of hex.outside(a, w, hh)) cands.push([px, py, 0]);
    if (callPrev && callPrev.at === call.at) cands.push([a[0] + callPrev.dx, a[1] + callPrev.dy, 1]);
    for (const [px, py, prev] of cands) {
      const x = clamp(px, fr.l + w / 2 + pad, fr.r - w / 2 - pad), y = clamp(py, fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
      const box = { l: x - w / 2 - 6, r: x + w / 2 + 6, t: y - hh / 2 - 6, b: y + hh / 2 + 6 };
      const cost = placed.reduce((c, o) => c + (ov(box, o) > 0 ? 1e6 + ov(box, o) * 100 : 0) + (crosses(a, [x, y], o) ? 1e5 : 0), 0)
        + leads.reduce((c, [p, q]) => c + (crosses(p, q, box) ? 1e6 : 0), 0) + (ringDepth(ring, box) > 0 ? 1e6 + ringDepth(ring, box) * 1e4 : 0) + keep.reduce((c, q) => { const d = into(q, box); return c + (d > 0 ? 1e6 + d * 1e3 : 0); }, 0) + hex.share(box) * INSIDE_COST + cards.reduce((c, o) => c + (ov(box, o) > 0 ? 1e6 + ov(box, o) * 400 : 0), 0) + Math.hypot(x - a[0], y - a[1]) * 0.5 + Math.max(0, Math.hypot(x - a[0], y - a[1]) - w / 2 - 110) * 30 - (prev ? 60 : 0);
      if (!best || cost < best.cost) best = { x, y, box, cost };
    }
    placed.push(best.box); callPrev = { at: call.at, dx: best.x - a[0], dy: best.y - a[1] }; callCost = best.cost;
    callEl.style.left = `${best.x - w / 2}px`; callEl.style.top = `${best.y - hh / 2}px`;
    // The leader starts on the ring's edge (not at its centre) and runs to the pill.
    const dl = Math.hypot(best.x - a[0], best.y - a[1]) || 1, e0 = rr / dl;
    callLine.setAttribute('x1', a[0] + (best.x - a[0]) * e0); callLine.setAttribute('y1', a[1] + (best.y - a[1]) * e0); callLine.setAttribute('x2', best.x); callLine.setAttribute('y2', best.y);
    callRing.setAttribute('cx', a[0]); callRing.setAttribute('cy', a[1]); callRing.setAttribute('r', rr);
    return [[a[0] + (best.x - a[0]) * e0, a[1] + (best.y - a[1]) * e0], [best.x, best.y]];
  }
  // Zone names written in the bands themselves, as the organs are named on the anatomy: quiet capitals in each
  // zone's color, on the radius to the flat bottom edge, so each name runs along its band. The three elements are made
  // once and only moved: re-making them at every layout (a value easing, a glide) restarted their lit pill each time,
  // which showed as a flash. Returns each name's box on screen (its pill included), for the other labels to keep clear of.
  const zoneEls = [];
  function placeZones(fr0, hx, hy, lesion = null) {
    if (!zonesOn) { while (zoneEls.length) zoneEls.pop().remove(); return []; }
    const { R, cx, cy } = geo, a = Math.PI / 2, ap = R * 0.866, boxes = [];
    [[0.83, 'Zone 1', 'periportal'], [0.51, 'Zone 2', 'midzonal'], [0.2, 'Zone 3', 'centrilobular']].forEach(([q, t, d], i) => {
      let z = zoneEls[i];
      if (!z) {
        z = zoneEls[i] = h('div', { class: 'lz-zone z' + (i + 1), 'aria-hidden': 'true', 'data-target': `lobule:zone${i + 1}` }, h('b', {}, t), h('span', {}, d));
        z.style.setProperty('--zk', '1');
      }
      if (!z.isConnected) labels.append(z);
      // Its usual spot (on the radius to the flat bottom edge); if that is out of view, the nearest in-view spot
      // of the same zone (the same ring, at the other five sides and corners), else clamped to the free edge.
      const ring = [];
      for (let k = 0; k < 6; k++) { const th = a + k * Math.PI / 3; ring.push([cx + Math.cos(th) * ap * q, cy + Math.sin(th) * ap * q], [cx + Math.cos(th + Math.PI / 6) * R * q * 0.95, cy + Math.sin(th + Math.PI / 6) * R * q * 0.95]); }
      const inV = ([x, y]) => x > fr0.l + 40 && x < fr0.r - 40 && y > fr0.t + 20 && y < fr0.b - 20;
      const mid = [(fr0.l + fr0.r) / 2, (fr0.t + fr0.b) / 2];
      const spots = ring.map(toScreen), first = spots[0];
      const tries = [...(inV(first) ? [first] : []), ...spots.slice(1).filter(inV).sort((u, v) => Math.hypot(u[0] - mid[0], u[1] - mid[1]) - Math.hypot(v[0] - mid[0], v[1] - mid[1]))];
      if (!tries.length) tries.push([clamp(first[0], fr0.l + 40, fr0.r - 40), clamp(first[1], fr0.t + 20, fr0.b - 20)]);
      z.style.left = `${tries[0][0]}px`; z.style.top = `${tries[0][1]}px`;
      const w = z.offsetWidth || 92, hh = z.offsetHeight || 36;
      const boxAt = ([x, y]) => ({ l: x - w / 2 - hx, r: x + w / 2 + hx, t: y - hh / 2 - hy, b: y + hh / 2 + hy });
      // A zone's name never sits on the slide's lesion ring (the ring is what the slide points at): it takes another
      // spot on its band, or leaves the view for that slide.
      const at = tries.find((p) => !ringDepth(lesion, boxAt(p)));
      z.hidden = !at;
      if (!at) return;
      z.style.left = `${at[0]}px`; z.style.top = `${at[1]}px`;
      // (A zone the slide's words leave unlit fades out: its spot is free for the labels.)
      if (!faded(`lobule:zone${i + 1}`)) boxes.push(boxAt(at));
    });
    return boxes;
  }
  // The layout the labels were last placed for ({ b: everything but the view, k, x, y }), which a pan carries them from.
  let follow = null, followT = 0, rough = false;
  const handOn = () => touches.size > 0 || !!cancelFlick || (wheelKind === 'pad' && performance.now() - wheelAt < 250);
  // The hand let go (or paused): place the labels again for where the view now is.
  function followEnd() { if (handOn()) { followT = setTimeout(followEnd, 140); return; } if (labels.style.transform || rough) { rough = false; layoutKey = ''; viewChanged(); } }
  // Writes the pan's shift into the labels' and leaders' own positions and drops the shared shift, so they glide on from where they are seen.
  function bakeFollow() {
    clearTimeout(followT);
    const m = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(labels.style.transform);
    labels.style.transform = leaders.style.transform = '';
    if (!m) return false;
    const dx = +m[1], dy = +m[2];
    if (!dx && !dy) return false;
    for (const e of labels.children) if (e.style.left) { e.style.left = `${parseFloat(e.style.left) + dx}px`; e.style.top = `${parseFloat(e.style.top) + dy}px`; }
    for (const e of leaders.children) for (const [a, d] of [['x1', dx], ['x2', dx], ['cx', dx], ['y1', dy], ['y2', dy], ['cy', dy]]) { const v = e.getAttribute(a); if (v != null) e.setAttribute(a, +v + d); }
    return true;
  }
  let layoutN = 0;   // (for the checks: how many times the labels have been placed in full)
  function layoutLabels() {
    // Laid out where the presenter's glide lands (see camSettle), or once its time is up if the hand cut it short.
    if (camMove) { if (performance.now() >= camUntil) camSettle(); return; }
    const fr0 = freeRect(), g = geo, bKey = `${g.W}x${g.H}|${Object.values(labs).map((l) => l.lk).join('|')}|${zonesOn}|${lymphOn}|${named('ha')}${named('bd')}|${call ? call.at + call.label : ''}|${fr0.t},${fr0.b},${fr0.l},${fr0.r}`,
      key = `${bKey}|${V.k},${V.x},${V.y}`;
    if (key === layoutKey) return;
    // While a hand pans the lobule (a drag, its flick, a trackpad scroll), the labels ride with the picture as one
    // layer: placing them again every frame (measuring each, then trying hundreds of spots and orders) is what made
    // panning lag on a phone. They are placed again, gliding to their new spots, once the hand lets go.
    if (follow && bKey === follow.b && V.k === follow.k && handOn()) {
      const t = `translate3d(${V.x - follow.x}px, ${V.y - follow.y}px, 0)`;
      labels.style.transform = leaders.style.transform = t;
      clearTimeout(followT); followT = setTimeout(followEnd, 140);
      return;
    }
    const baked = bakeFollow();
    layoutN++;
    // A label that moves while the view holds still (a term lit, a value's width changed) glides to its new spot;
    // while the view itself pans or zooms, the labels follow it at once.
    const vKey = `${g.W}x${g.H}|${V.k},${V.x},${V.y}`;
    if ((layoutKey && vKey === layoutV) || baked) { labels.classList.add('lz-ease'); clearTimeout(easeT); easeT = setTimeout(easeEnd, 450); }
    layoutKey = key; layoutV = vKey; follow = { b: bKey, k: V.k, x: V.x, y: V.y };
    pickAnchors(fr0);
    leaders.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    // Every label has a leader to what it names, aimed at the label's centre and stopping on the edge of its letters.
    // Score nearby placements together so zooming, panning and narrow screens do not stack labels.
    const fr = fr0, placed = [];
    const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l))
      * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    if (lymphOn) {
      // The lymph label follows whichever lymphatic is in view (the picked triad's first, else the one nearest the middle).
      const mx = (fr0.l + fr0.r) / 2, my = (fr0.t + fr0.b) / 2, edge = (p) => { const [x, y] = toScreen(p); return x > 0 && x < g.W && y > 0 && y < g.H; };
      const dist = (i) => { const [x, y] = toScreen(g.triads[i].lv.pts[0]); return Math.hypot(x - mx, y - my); };
      const vis = [0, 1, 2, 3, 4, 5].filter((i) => edge(g.triads[i].lv.pts[0]));
      pick.lt = vis.includes(pick.lt ?? pick.triad) ? (pick.lt ?? pick.triad) : vis.sort((a, b) => dist(a) - dist(b))[0] ?? null;
      if (pick.lt == null) pick.lt = pick.triad;
    }
    // Open cards over the figure (a presenter slide's numbers, notices) and the labelled structures themselves:
    // a label pays heavily to sit on either, so at large text sizes the labels move off them rather than cover them.
    const hr = el.getBoundingClientRect(), cards = [];
    for (const c of document.querySelectorAll('.stage-blocker:not([hidden])')) {
      const r = c.getBoundingClientRect();
      if (r.width && getComputedStyle(c).visibility !== 'hidden') cards.push({ l: r.left - hr.left - 6, r: r.right - hr.left + 6, t: r.top - hr.top - 6, b: r.bottom - hr.top + 6 });
    }
    // What no label may cover: the central vein, every portal tract (venule, arteriole, ductule and lymphatic) and the
    // spot each label names, each a disc on screen. A label is pinned just beside what it names, on a short leader, clear of them all.
    const keep = [[g.cx, g.cy, g.rcv0 * 1.7], ...g.lobules[0].corners.map(([x, y]) => [x, y, (g.rt || 6) * 2.4])]
      .map(([x, y, r]) => { const [sx, sy] = toScreen([x, y]); return { x: sx, y: sy, r: Math.max(14, r * V.k) }; });
    const ownR = (k, a) => {
      const d = keep.find((q) => Math.hypot(q.x - a[0], q.y - a[1]) < q.r);
      return d ? d.r + Math.hypot(d.x - a[0], d.y - a[1]) : 10;
    };
    const into = (q, b) => Math.max(0, q.r - Math.hypot(Math.max(b.l - q.x, 0, q.x - b.r), Math.max(b.t - q.y, 0, q.y - b.b)));
    // The letters' halo reaches past each label's box, more so at larger text: the margins grow with it.
    // Each box also takes in the label's pill (it reaches 4×5 px past the text at --label-k 1) and half the gap kept
    // between two labels, so no two pills ever touch.
    const lk = parseFloat(document.documentElement.style.getPropertyValue('--label-k')) || 1, hm = 4 + 2 * lk,
      hx = Math.max(hm, 4 * lk + 5), hy = Math.max(hm, 5 * lk + 5);
    const hit = (a, b) => overlap(a, b) > 0;
    // (What a label must keep clear of, for the browser check that proves a label left out had no clear spot.)
    const r1 = (v) => Math.round(v * 10) / 10;
    labels.dataset.room = JSON.stringify({ fr: [fr.l, fr.t, fr.r, fr.b].map(r1), pad: r1(8 + 4 * lk), hx: r1(hx), hy: r1(hy), lead: LONG_LEAD,
      keep: keep.map((q) => [q.x, q.y, q.r].map(r1)), cards: cards.map((c) => [c.l, c.t, c.r, c.b].map(r1)) });
    placed.push(...placeZones(fr0, hx, hy, callRingAt(fr0)));
    // Leaders run to each label's centre; a leader never crosses another label, and a label never sits on another's leader.
    const crosses = (p, q, b) => {
      let t0 = 0, t1 = 1;
      const dx = q[0] - p[0], dy = q[1] - p[1];
      for (const [d, lo, hi, o] of [[dx, b.l, b.r, p[0]], [dy, b.t, b.b, p[1]]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
        let u = (lo - o) / d, v = (hi - o) / d;
        if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
        if (t0 > t1) return false;
      }
      return true;
    };
    // Two leaders never cross each other either (a shared end, two labels on one spot, is not a crossing).
    const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const cut = (p, q, r, t) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
    // Measured first; then placed one at a time, in a few orders, keeping the order that leaves no label on another
    // and no leader under another label (or the fewest), so an early label never blocks a later one's only clear spot.
    const items = [], shown = [];
    for (const k of ['cv', 'sin', 'triad', 'lymph', 'ha', 'bd']) {
      const L = labs[k];
      if (!L) continue;
      if ((k === 'lymph' && !lymphOn) || ((k === 'ha' || k === 'bd') && !named(k))) { L.el.hidden = true; L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      if (faded(`lobule:${LZ_TARGET[k] || k}`)) { L.el.hidden = true; L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      L.el.hidden = false;
      shown.push([k, L]);
    }
    // Too wide for the free space (large text, a narrow screen): the label stacks its second reading.
    // A label's size is read back from the page only when what decides it changed (its text and classes, the text size,
    // the theme, the window, the fonts): each read lays the page out, and two of them on every frame of a pinch were most
    // of what placing the lobule's labels cost. Otherwise the sizes last read are used, which are the same numbers.
    const env = sizeEnv(), fw = (fr.r - fr.l) * 0.32;
    const keys = shown.map(([, L]) => `${env}|${L.el.className.replace(/(^| )stack( |$)/, '$1')}|${L.el.innerHTML}`);
    let stack, sizes;
    if (shown.every(([, L], i) => L.sz?.key === keys[i] && (L.sz.w0 > fw && L.sz.u2 ? L.sz.s1 : L.sz.s0))) {
      stack = shown.map(([, L]) => L.sz.w0 > fw && L.sz.u2);
      shown.forEach(([, L], i) => L.el.classList.toggle('stack', stack[i]));
      sizes = shown.map(([, L], i) => (stack[i] ? L.sz.s1 : L.sz.s0));
    } else {
      // (Written, then read together: one layout for all of them, not one per label.)
      shown.forEach(([, L]) => L.el.classList.remove('stack'));
      const w0 = shown.map(([, L]) => L.el.offsetWidth), u2 = shown.map(([, L]) => !!L.el.querySelector('.u2'));
      stack = shown.map((x, i) => w0[i] > fw && u2[i]);
      shown.forEach(([, L], i) => { if (stack[i]) L.el.classList.add('stack'); });
      sizes = shown.map(([, L]) => [L.el.offsetWidth || 100, L.el.offsetHeight || 40]);
      // (The padding round the letters, read with the sizes: a leader stops on the letters' box, not at the label's middle.)
      for (const [, L] of shown) { const cs = getComputedStyle(L.el); L.pad = ['Left', 'Right', 'Top', 'Bottom'].map((d) => parseFloat(cs[`padding${d}`]) || 0); }
      shown.forEach(([, L], i) => {
        const sz = L.sz?.key === keys[i] ? L.sz : (L.sz = { key: keys[i], w0: w0[i], u2: u2[i] });
        sz[stack[i] ? 's1' : 's0'] = sizes[i];
      });
    }
    for (const [i, [k, L]] of shown.entries()) {
      const [w, hh] = sizes[i];
      const a = toScreen(anchorOf(k));
      const outside = k === 'lymph' ? a[0] < 0 || a[0] > g.W || a[1] < 0 || a[1] > g.H : a[0] < fr.l - 4 || a[0] > fr.r + 4 || a[1] < fr.t - 4 || a[1] > fr.b + 4;
      // What it names has left the screen: the label waits at the free space's edge, pointing the way (a tap brings it back into view).
      const chip = outside && k !== 'lymph';
      L.el.hidden = (outside && !chip) || fr.r - fr.l < w + 16 || fr.b - fr.t < hh + 16;
      L.el.classList.toggle('edge', chip && !L.el.hidden);
      if (L.el.hidden) { L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      let edge = null;
      if (chip) {
        const mx = (fr.l + fr.r) / 2, my = (fr.t + fr.b) / 2, dx = a[0] - mx, dy = a[1] - my, pad = 10;
        const sx = (fr.r - fr.l) / 2 - w / 2 - pad, sy = (fr.b - fr.t) / 2 - hh / 2 - pad;
        const f = Math.min(sx / Math.max(Math.abs(dx), 1e-6), sy / Math.max(Math.abs(dy), 1e-6));
        const ang = Math.atan2(dy, dx), c = Math.cos(ang), sn = Math.sin(ang);
        edge = [mx + dx * f, my + dy * f];
        L.el.style.setProperty('--edge-a', `${ang}rad`);
        L.el.style.setProperty('--edge-r', `${Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), hh / 2 / Math.max(Math.abs(sn), 1e-6)) + 7}px`);
      }
      items.push({ k, L, w, hh, a, edge });
    }
    const ring = callRingAt(fr), hex = hexOf();
    // The slide's pointer pill is placed first (it is the slide's point): the labels then keep clear of it and its leader.
    const pre = placed.slice();
    let callLead = placeCall(fr, placed, cards, [], crosses, ring, hex, keep, into);
    let base = placed.slice();
    // A label that finds no spot clear of the others, the pill, the cards and the structures is left out rather than
    // stacked: leaving one out costs more than any clear spot, and more still for a label the slide's words name.
    // A label no slide names and that is not one of the vessel labels (the lymph, an arteriole, a ductule) costs far less
    // to leave out: it gives way rather than push a vessel label onto a long leader across the lobule.
    const drop = (k) => (named(k) ? 2e7 : CORE.includes(k) ? 1e7 : 3e4);
    const solve = (order, pl0 = base, ld0 = callLead ? [callLead] : []) => {
      const pl = pl0.slice(), ld = ld0.slice(), res = [];
      let total = 0;
      for (const { k, w, hh, a, edge } of order) {
        const pad = 8 + 4 * lk, step = hh + 12;
        if (edge) {   // an edge chip slides along its edge only as far as it needs to clear the others
          let best = null;
          for (const n of [0, -1, 1, -2, 2, -3, 3]) {
            const along = Math.abs(edge[0] - fr.l) < 40 + w || Math.abs(edge[0] - fr.r) < 40 + w ? [0, n * step] : [n * (w / 2 + 12), 0];
            const x = clamp(edge[0] + along[0], fr.l + w / 2 + pad, fr.r - w / 2 - pad), y = clamp(edge[1] + along[1], fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
            const box = { l: x - w / 2 - hx, r: x + w / 2 + hx, t: y - hh / 2 - hy, b: y + hh / 2 + hy };
            const cost = pl.reduce((sum, o) => sum + (hit(box, o) ? 1e6 + overlap(box, o) * 100 : 0), 0) + cards.reduce((sum, c) => sum + (hit(box, c) ? 1e6 + overlap(box, c) * 400 : 0), 0) + Math.abs(n) * 10;
            if (!best || cost < best.cost) best = { x, y, box, cost };
          }
          if (best.cost >= 1e6) { res.push({ k, out: true }); total += drop(k); continue; }
          pl.push(best.box); res.push({ k, ...best }); total += best.cost;
          continue;
        }
        const preferred = k === 'cv' ? [a[0], a[1] - g.rcv0 * V.k - hh / 2 - 12]
          : k === 'triad' ? [a[0], a[1] + hh / 2 + 12] : k === 'ha' ? [a[0] - w / 2 - 14, a[1] - hh / 2 - 10] : k === 'bd' ? [a[0] + w / 2 + 14, a[1] - hh / 2 - 10] : k === 'lymph' ? [a[0], a[1] - hh / 2 - 14] : a;
        // Steps in proportion to the label, so larger text searches proportionally farther (above, below, beside, diagonally).
        const candidates = [preferred];
        for (const dx of [0, -(w / 2 + 12), w / 2 + 12, -(w + 24), w + 24])
          for (const n of [0, -1, 1, -2, 2, -3, 3]) if (dx || n) candidates.push([preferred[0] + dx, preferred[1] + n * step]);
        // And all round what it names, just clear of it and a little farther, so a crowded side still leaves a free spot near it.
        const r0 = ownR(k, a);
        for (const r of [1, 1.6, 2.4]) for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
          candidates.push([a[0] + c * (w / 2 + 18) * r, a[1] + sn * (hh / 2 + 18) * r]);
          const d = (r0 + 10) * r + Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), hh / 2 / Math.max(Math.abs(sn), 1e-6));
          candidates.push([a[0] + c * d, a[1] + sn * d]);
        }
        // And a coarse grid over the whole free space, a last resort that still finds the one clear band on a short phone figure.
        for (let gx = 0; gx <= 6; gx++) for (let gy = 0; gy <= 6; gy++) candidates.push([fr.l + (fr.r - fr.l) * gx / 6, fr.t + (fr.b - fr.t) * gy / 6]);
        // Snug against each label already placed (above, below or beside it), so a tight gap between two is found.
        for (const o of pl) candidates.push([preferred[0], o.b + hh / 2 + hy], [preferred[0], o.t - hh / 2 - hy], [o.r + w / 2 + hx, preferred[1]], [o.l - w / 2 - hx, preferred[1]]);
        let best = null;
        for (const [px, py] of candidates) {
          const x = clamp(px, fr.l + w / 2 + pad, fr.r - w / 2 - pad);
          const y = clamp(py, fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
          const box = { l: x - w / 2 - hx, r: x + w / 2 + hx, t: y - hh / 2 - hy, b: y + hh / 2 + hy };
          // A label with a leader keeps a visible stretch of it: it never sits right over the vessel it names.
          const lead = Math.hypot(Math.max(0, Math.abs(a[0] - x) - w / 2), Math.max(0, Math.abs(a[1] - y) - hh / 2));
          // Two labels never touch, and no leader runs under a label: any spot clear of both beats every spot that is not.
          const cost = pl.reduce((sum, other) => sum + (hit(box, other) ? 1e6 + overlap(box, other) * 100 : 0)
              + (crosses(a, [x, y], other) ? 1e5 : 0), 0)
            + ld.reduce((sum, [p, q]) => sum + (crosses(p, q, box) ? 1e5 : 0) + (cut(p, q, a, [x, y]) ? 1e5 : 0), 0)
            + Math.max(0, 16 - lead) * 40
            + cards.reduce((sum, c) => sum + (hit(box, c) ? 1e6 + overlap(box, c) * 400 : 0), 0)
            + (ringDepth(ring, box) > 0 ? 1e6 + ringDepth(ring, box) * 1e3 : 0)
            + keep.reduce((sum, q) => { const d = into(q, box); return sum + (d > 0 ? 1e6 + d * 1e3 : 0); }, 0)
            + (into({ x: a[0], y: a[1], r: 10 }, box) > 0 ? 1e6 : 0)
            + lead * 8 + Math.max(0, lead - 3 * hh) * 60 + Math.hypot(x - preferred[0], y - preferred[1]) * 0.5
            // A label no slide names (the lymph, an arteriole, a ductule) is left out sooner than sent far from what it names
            // on a leader across the lobule (a phone once ran the Lymph label's 420 px over it, past every other label).
            + (!CORE.includes(k) && !named(k) && lead > LONG_LEAD ? 1e6 : Math.max(0, lead - LONG_LEAD) * 400);
          if (!best || cost < best.cost) best = { x, y, box, cost };
        }
        if (best.cost >= 1e6) { res.push({ k, out: true }); total += drop(k); continue; }
        pl.push(best.box); ld.push([a, [best.x, best.y]]); res.push({ k, ...best });
        total += best.cost;
      }
      return { res, total, pl, ld };
    };
    const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
    let sol = solve(items);
    // (Mid-pinch, the first order is kept; the full search runs once the hand lets go.)
    rough = sol.total >= 1e5 && handOn();
    if (rough) { clearTimeout(followT); followT = setTimeout(followEnd, 140); }
    if (sol.total >= 1e5 && !rough) {
      // Every order of up to six labels (720 at most, only while a clash remains: a few milliseconds).
      for (const order of perms(items)) {
        const s2 = solve(order);
        if (s2.total < sol.total) sol = s2;
        if (sol.total < 1e5 && items.length > 5) break;   // (up to five labels, 120 orders at most: the shortest leaders win, not just the first clear order)
      }
    }
    // A vessel label hidden or crowded: two more layouts are tried, and the one hiding the fewest vessel labels (central
    // vein, sinusoids, portal tract, and any the slide names), then crowding least, is kept. First, the vessel labels
    // placed before the slide's pill, the pill clear of them and their leaders, the optional labels in what is left.
    // Second, as the sinusoids are everywhere, another sinusoid in view for its label, when the one picked leaves none
    // (a crowded phone band once dropped the Sinusoids label on a slide about the sinusoids). The pill is never left on a label.
    const isCore = (k) => CORE.includes(k) || named(k), outs = (s) => s.res.filter((r) => r.out && isCore(r.k)).length;
    const better = (p, q) => outs(p) < outs(q) || (outs(p) === outs(q) && p.total < q.total);
    if (sol.total >= 1e5 && !rough) {
      const shown = { lead: callLead, prev: callPrev, cost: callCost, left: callEl.style.left, top: callEl.style.top, line: ['x1', 'y1', 'x2', 'y2'].map((k) => callLine.getAttribute(k)) };
      let won = null;
      const core = items.filter((it) => isCore(it.k)), rest = items.filter((it) => !isCore(it.k));
      const coreFirst = () => {
        let s1 = solve(core, pre, []);
        for (const order of perms(core)) { if (s1.total < 1e5) break; const t = solve(order, pre, []); if (t.total < s1.total) s1 = t; }
        const pl2 = s1.pl.slice();
        const lead2 = placeCall(fr, pl2, cards, s1.ld, crosses, ring, hex, keep, into);
        if (callLead && callCost >= 1e6) return null;
        const s3 = solve(rest, pl2, lead2 ? [...s1.ld, lead2] : s1.ld);
        return { res: [...s1.res, ...s3.res], total: s1.total + s3.total, lead: lead2, call: { prev: callPrev, cost: callCost, left: callEl.style.left, top: callEl.style.top, line: ['x1', 'y1', 'x2', 'y2'].map((k) => callLine.getAttribute(k)) } };
      };
      const pillFirst = () => {
        let s2 = solve(items, base, shown.lead ? [shown.lead] : []);
        for (const order of items.length <= 5 ? perms(items) : []) { if (s2.total < 1e5) break; const t = solve(order, base, shown.lead ? [shown.lead] : []); if (t.total < s2.total) s2 = t; }
        return { ...s2, lead: shown.lead, call: shown };
      };
      if (callLead) { const c = coreFirst(); if (c && better(c, sol)) { sol = c; won = c; } }
      const sinIt = items.find((it) => it.k === 'sin' && !it.edge);
      if (sinIt && sol.res.some((r) => r.k === 'sin' && r.out)) {
        const g = geo, cx = (fr.l + fr.r) / 2, cy = (fr.t + fr.b) / 2, a0 = sinIt.a;
        const cands = [...g.L1, ...g.L2, ...g.L0].map((t) => [t, toScreen(sinAt(t))]).filter(([, [x, y]]) => x > fr.l + 30 && x < fr.r - 30 && y > fr.t + 30 && y < fr.b - 30)
          .sort((p, q) => Math.hypot(p[1][0] - cx, p[1][1] - cy) - Math.hypot(q[1][0] - cx, q[1][1] - cy)).slice(0, 30);
        let winA = a0;
        for (const [t, a] of cands) {
          sinIt.a = a;
          for (const s2 of [pillFirst(), callLead ? coreFirst() : null]) if (s2 && better(s2, sol)) { sol = s2; won = s2; winA = a; pick.sin = t.id; }
          if (outs(sol) === 0) break;
        }
        sinIt.a = winA;
      }
      const c = won ? won.call : shown;
      if (won) callLead = won.lead;
      callPrev = c.prev; callCost = c.cost; callEl.style.left = c.left; callEl.style.top = c.top;
      // (A line never drawn has no ends to put back: setting "null" logged an error per end on a small phone.)
      ['x1', 'y1', 'x2', 'y2'].forEach((k, i) => (c.line[i] == null ? callLine.removeAttribute(k) : callLine.setAttribute(k, c.line[i])));
    }
    // (Every label's letters where it lands, for the leaders to keep off.)
    const inks = sol.res.filter((r) => !r.out).map(({ k, x, y }) => { const { L, w, hh } = items.find((it) => it.k === k); return lettersOf(L, x - w / 2, y - hh / 2, w, hh); });
    for (const { k, x, y, out } of sol.res) {
      const { L, w, hh, a, edge } = items.find((it) => it.k === k);
      L.el.dataset.at = `${r1(a[0])},${r1(a[1])}`;
      if (out) { L.el.hidden = true; L.el.classList.remove('edge'); L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      L.el.style.left = `${x - w / 2}px`; L.el.style.top = `${y - hh / 2}px`;
      L.el.classList.remove('left');
      if (edge) { L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      L.line.style.display = L.dotEl.style.display = '';
      L.a = a;
      L.line.setAttribute('x1', a[0]); L.line.setAttribute('y1', a[1]);
      leadTo(L, lettersOf(L, x - w / 2, y - hh / 2, w, hh), inks);
      L.dotEl.setAttribute('cx', a[0]); L.dotEl.setAttribute('cy', a[1]);
    }
    // A label gliding to its new spot takes its leader's end with it, frame by frame, so the leader never runs
    // through it or stops short of it on the way.
    if (labels.classList.contains('lz-ease')) { syncLeaders(); glideUntil = performance.now() + 480; if (!glideRaf) glideRaf = requestAnimationFrame(glideLeaders); }
  }
  // A label's letters: its box less the padding.
  // A label the slide's words light sits in its pill (its ::before, past the box at every side, with rounded corners):
  // the leader stops on the pill's outline.
  const lettersOf = (L, l, t, w, hh) => {
    if ((document.getElementById('app')?.dataset.lit || '').split(' ').includes(L.el.dataset.target)) {
      const p = getComputedStyle(L.el, '::before'), px = (v) => parseFloat(v) || 0;
      return { x0: l + px(p.left), y0: t + px(p.top), x1: l + w - px(p.right), y1: t + hh - px(p.bottom), r: px(p.borderTopLeftRadius), L };
    }
    const [pl, pr, pt, pb] = L.pad || [0, 0, 0, 0];
    return { x0: l + pl, y0: t + pt, x1: l + w - pr, y1: t + hh - pb, L };
  };
  // A leader's end: on the edge of its label's letters, on the way to the label's middle. While another label lies across
  // it (one gliding past), the leader is hidden, and eases back once clear: a leader never runs across a label.
  function leadTo(L, ink, inks) {
    const e = leaderEnd(ink, L.a[0], L.a[1]);
    if (!e) { L.line.style.display = 'none'; return; }
    L.line.setAttribute('x2', e.x); L.line.setAttribute('y2', e.y);
    L.line.classList.toggle('lz-hid', inks.some((o) => o.L !== L && runInside(L.a, [e.x, e.y], o) > 0.5));
  }
  let glideRaf = 0, glideUntil = 0;
  // The glide cut short (its time is up): the labels land at once, and their leaders with them.
  function easeEnd() { labels.classList.remove('lz-ease'); syncLeaders(); }
  function glideLeaders(now) {
    glideRaf = 0;
    // (Followed until every glide has ended: a slow frame can start one late.)
    if (syncLeaders() || now < glideUntil) glideRaf = requestAnimationFrame(glideLeaders);
  }
  // Each leader's end set from where its label is seen now (part way through a glide, or landed). True while one glides.
  function syncLeaders() {
    let moving = false;
    const on = Object.values(labs).filter((L) => !L.el.hidden && L.el.offsetParent), inks = on.map((L) => lettersOf(L, L.el.offsetLeft, L.el.offsetTop, L.el.offsetWidth, L.el.offsetHeight));
    on.forEach((L, i) => {
      if (!L.a || L.el.classList.contains('edge') || L.dotEl.style.display === 'none') return;
      L.line.style.display = '';
      leadTo(L, inks[i], inks);
      moving ||= L.el.getAnimations().some((an) => an.playState === 'running');
    });
    return moving;
  }

  // ── Frame loop ──
  function loop(now) {
    raf = 0;
    if (fade <= 0 || !model) return;
    const soft = !!gl?.software;
    if (soft && now - lastPaint < 110) { raf = nextFrame(loop); return; }
    if (lzYield && !lzYield.ready(now, viewVer !== pacedVer)) { raf = nextFrame(loop); return; }   // (a pan or zoom: drawn now)
    // The flow is drawn on every frame the screen offers, like the anatomy's blood. Battery saver alone paces it, to 15 a
    // second; a pan, zoom or any other change draws at once even then.
    const pace = paceMs(), paced = !soft && pace > 0 && viewVer === pacedVer;
    if (paced && now - lastPaint < pace) { raf = nextFrame(loop); return; }
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; lastPaint = now;
    const st = store.get(), moving = st.running && !reduce.matches;
    if (moving) clock = (clock + dt) % 10000;
    rzMoving = easeRadii(dt);
    if (rzMoving || lensFrom || tissueFading(now)) drawVersion++;   // a caliber still easing, the colours or a new tissue crossfading: redraw this frame
    const drew = draw(moving ? dt : 0);
    if (drew) { noteDraw('lobule-zoom'); lzYield?.drew(now); }
    pacedVer = viewVer;
    // Paused and settled (nothing drawn, nothing easing): the loop stops asking for frames, as the figure does, so the
    // screen can idle. Every change wakes it (update, a pan or zoom, a glide, the store, a label size, the dive), and it
    // looks again four times a second in case a change came by a path that does not.
    if (!drew && !moving && !rzMoving && (flowA === 0 || flowA === 1)) {
      last = 0;   // (on waking, the first frame steps nothing: no jump in the flow)
      clearTimeout(sleepT); sleepT = setTimeout(() => { if (!raf && fade > 0) raf = nextFrame(loop); }, 250);
      return;
    }
    raf = nextFrame(loop);
  }
  let sleepT = 0;
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
  function draw(dt) {
    stepFlowA();
    const scaled = diveScaled || sinU > 0;   // the dive, or the zoom on into a sinusoid
    if (scaled && diveDrawn && flowA <= 0) return false;   // magnified by the compositor: nothing is redrawn once the marks have faded
    diveDrawn = scaled;
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    ensureGeo(W, H);
    const dpr = Math.min(saver() ? 1 : 2, devicePixelRatio || 1);   // (Battery saver: one pixel per CSS pixel)
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    // Keep watching for view/theme/size changes, but leave a settled paused picture alone.
    const idleKey = [W, H, dpr, dark, V.k, V.x, V.y, drawVersion, flowA.toFixed(2)].join('|');
    if (dt === 0 && idleKey === idleDrawn) return false;
    idleDrawn = dt === 0 ? idleKey : '';
    const cs = getComputedStyle(host);
    const g = ensureGL();
    paintTissue(W, H, dpr, dark, cs, !g);
    layoutLabels();
    if (g && !g.lost) drawGL(W, H, dpr, dark, cs, dt);
    paintFx(W, H, dpr, dark, dt, !g || g.lost);
    return true;
  }

  function ensureGeo(W, H) {
    const key = W + 'x' + H;
    if (key === geoKey) return;
    // Zoomed in, the spot at the middle of the free space, in lobule radii from its centre, and the zoom against the framing:
    // the lobule is built again for the new size, so the view keeps both (its screen numbers alone would show another spot).
    const keep = geo && !atFit && !camAim && !(aimed && fade <= 0.98) ? viewSpot() : null;
    geo = build(W, H); geoKey = key; binKey = ''; binReach = []; binCache.clear(); radKey = []; radAll = ''; tissueKey = ''; layoutKey = '';
    if (atFit || (aimed && fade <= 0.98)) resetView();
    else if (camAim) { kFit = fitV().k; Object.assign(camAim.to, framing(camAim.part, camAim.zoom)); }
    else if (keep) toSpot(keep);
    else clampV();
  }
  function viewSpot() {
    const f = freeRect(), [wx, wy] = toWorld([(f.l + f.r) / 2, (f.t + f.b) / 2]);
    return { u: (wx - geo.cx) / geo.R, v: (wy - geo.cy) / geo.R, z: V.k / (kFit || V.k) };
  }
  function toSpot(p) {
    const F0 = fitV(); kFit = F0.k;
    const f = freeRect(), k = clamp(kFit * p.z, kFit, kFit * KMAX), wx = geo.cx + p.u * geo.R, wy = geo.cy + p.v * geo.R;
    V.k = k; V.x = (f.l + f.r) / 2 - wx * k; V.y = (f.t + f.b) / 2 - wy * k;
    clampV();
  }
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

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
  const fieldState = () => { const m = model || (F ? lobuleState(F, store.get()) : null); return m ? { su: fsQ('su', m.septU), pre: fsQ('pre', m.fibPre), post: fsQ('post', m.fibPost), sin: fsQ('sin', m.fibSin), cong: fsQ('cong', m.congU) } : { su: 0, pre: 0, post: 0, sin: 0, cong: 0 }; };
  // later: the open lobule asks (#27). A tissue state that changes mid-animation (a time-lapse, a slide's morph) needs new tiles, each
  // tens of ms to draw: the open lobule keeps showing the last state's tile (its quiet surround changes slowly) while the new one is
  // drawn between frames, then redraws with it.
  let tileLater = null, tileLast = null;
  function fieldTile(cs, dark, rd, later = false) {
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const cell = v('--og-liver-1'), gap = v('--og-liver-2'), cvc = v('--vein-systemic'), pvc = v('--vein-portal');
    const fs = fieldState();
    const key = [dark, cell, gap, cvc, pvc, Object.values(fs).join(',')].join('|');
    if (later && tileLast && tileLast.key !== key && tileLast.dark === dark) {
      const ts = tileSets.get(key), ready = ts && (ts.find((q) => q.R >= rd) || ts[ts.length - 1]);
      if (!ready?.cv) {
        if (!tileLater) {
          tileLater = setTimeout(() => {
            tileLater = null;
            if (fade <= 0) return;
            const t = fieldTile(getComputedStyle(host), isDark(), rd);
            quietTile(t, stageBg(getComputedStyle(host), isDark()));
            tissueKey = ''; drawVersion++; if (!raf) raf = nextFrame(loop);
          }, 0);
        }
        const old = tileSets.get(tileLast.key);
        const t = old && (old.find((q) => q.R >= rd && q.cv) || [...old].reverse().find((q) => q.cv));
        if (t) return t;
      }
    }
    if (later) tileLast = { key, dark };
    let tiles = tileSets.get(key);
    if (!tiles) {
      tiles = [6, 12, 24, 48, 96, 192, 384].map((R) => ({ R, cv: null, set: key })); tileSets.set(key, tiles);
      if (tileSets.size > 3) { const k0 = tileSets.keys().next().value; for (const q of tileSets.get(k0)) { if (q.cv) free(q.cv); if (q.quiet) free(q.quiet.cv); if (q.liverQ) free(q.liverQ.cv); } tileSets.delete(k0); }   // (zeroed: Safari frees a dropped canvas's memory late)
    }
    else { tileSets.delete(key); tileSets.set(key, tiles); }
    const t = tiles.find((q) => q.R >= rd) || tiles[tiles.length - 1];
    if (!t.cv) drawTile(t, { cell, gap, cvc, pvc, art: v('--artery'), duct: v('--bile-duct'), dark, fs });
    return t;
  }
  // Tissue, not a diagram: the repeat is two lobules wide and two high, and every corner of the
  // lattice is nudged by a hash of where it is (the same for the lobules that share it, and the
  // same across the repeat), so the outlines wander a little. Each lobule is filled warmer toward
  // its central vein, its septa are soft bands, its sinusoids gently curved, and a triad (venule,
  // arteriole, ductule) sits at each corner.
  function drawTile(t, { cell, gap, cvc, pvc, art, duct, dark, fs }) {
    const S3 = Math.sqrt(3), R = t.R;
    const hash = (i, j) => { let q = (i * 374761393 + j * 668265263) >>> 0; q = ((q ^ (q >>> 13)) * 1274126177) >>> 0; return (q >>> 8) / 16777216; };
    const COLa = cssRGB01('--collagen'), edges = new Set();
    const TW = 6 * R, TH = 2 * S3 * R, tw = Math.round(TW), th = Math.round(TH);
    const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
    const c = cv.getContext('2d');
    c.scale(tw / TW, th / TH);
    c.fillStyle = gap; c.fillRect(0, 0, TW, TH);
    // The corners of the lobule at the pattern's origin (where the lobule view draws its own lobule) stay
    // on the regular lattice, and their triads are the view's own, so none is drawn twice.
    const HOME = new Set(['2,0', '1,1', '11,1', '10,0', '11,3', '1,3']);
    const home = (ix, iy) => HOME.has(`${((ix % 12) + 12) % 12},${((iy % 4) + 4) % 4}`);
    // A lattice point, nudged (ix, iy in half-R and half-height steps, wrapped to the repeat).
    const corner = (x, y) => {
      const ix = Math.round(x / (R / 2)), iy = Math.round(y / (S3 * R / 2));
      if (home(ix, iy)) return [x, y];
      const u = hash(((ix % 12) + 12) % 12, ((iy % 4) + 4) % 4), w = hash(((ix % 12) + 12) % 12 + 31, ((iy % 4) + 4) % 4 + 17);
      const a = u * TAU, m = 0.11 * R * (0.4 + 0.6 * w);
      return [x + Math.cos(a) * m, y + Math.sin(a) * m];
    };
    const lat = (q) => (((Math.round(q[0] / (R / 2)) % 12) + 12) % 12) * 4 + (((Math.round(q[1] / (S3 * R / 2)) % 4) + 4) % 4);   // wrapped lattice index
    const centres = [];
    for (let i = -1; i <= 4; i++) for (let j = -1; j <= 2; j++) centres.push([1.5 * R * i, S3 * R * (j + (i & 1 ? 0.5 : 0))]);
    const lw = Math.max(0.6, R * 0.05), round = 1 + 0.6 * fs.su;   // nodules: rounder plates
    const Ps = centres.map(([x, y]) => Array.from({ length: 6 }, (_, i) => corner(x + Math.cos((i * Math.PI) / 3) * R, y + Math.sin((i * Math.PI) / 3) * R)));
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
          else { const M = (t, U, Q) => [lerp(U[0], Q[0], t), lerp(U[1], Q[1], t)]; fibrousBand(c, A, M(reach / 2, A, B), { ...o, e1: 0.2 }); fibrousBand(c, B, M(reach / 2, B, A), { ...o, e1: 0.2, seed: sd + 1 }); }
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
    Object.assign(t, { tw, th, TW, TH, cv, pats: new WeakMap() });
  }
  // The field's pattern on context c, with the lobule at the origin centred on x, y (device px), radius rd.
  function fieldFill(c, t, x, y, rd, w, h) {
    let pat = t.pats.get(c);
    if (!pat) { pat = c.createPattern(t.cv, 'repeat'); t.pats.set(c, pat); }
    pat.setTransform(new DOMMatrix([(t.TW / t.R) * rd / t.tw, 0, 0, (t.TH / t.R) * rd / t.th, x, y]));
    c.fillStyle = pat; c.fillRect(0, 0, w, h);
  }
  // Behind the lobule the field steps back: most of its colour drained and its contrast lowered (q: 0..1).
  function fieldQuiet(c, bg, q, w, h) {
    // (colour-exempt: a grey for the saturation blend drains colour, it is not a colour. Its fill had slipped into this comment on 12 Oct.)
    c.globalCompositeOperation = 'saturation'; c.fillStyle = `rgba(128,128,128,${(0.45 * q).toFixed(3)})`; c.fillRect(0, 0, w, h);   // colour-exempt
    c.globalCompositeOperation = 'source-over'; c.fillStyle = css(bg, 0.42 * q); c.fillRect(0, 0, w, h);
  }
  // A tile with fieldQuiet already applied (the lobule view's resting state), so panning and zooming
  // there fill one pattern instead of blending the whole screen each frame.
  // (G22) The neighbouring lobules are also softened here, once per tile: blurred (wrapping round the repeat, so no seam
  // shows where the pattern tiles) and their contrast cut by NEIGHBOUR_FLAT, so the lobule in focus stands clear of them on a
  // phone. The one exception to the no-blur rule (Mohammad, 16 Oct), and only for these neighbours.
  function quietTile(t, bg) {
    const k = bg.join(',');
    if (t.quiet?.k === k) return t.quiet;
    // (the cache holds one tone at a time; the dive's liver tone is kept apart, see paintField)
    if (t.quiet) free(t.quiet.cv);
    const cv = document.createElement('canvas'); cv.width = t.tw; cv.height = t.th;
    const c = cv.getContext('2d');
    blurTile(c, t.cv, t.tw, t.th, neighbourBlur(t.R));
    fieldQuiet(c, bg, 1, t.tw, t.th);
    c.fillStyle = css(bg, NEIGHBOUR_FLAT); c.fillRect(0, 0, t.tw, t.th);
    return (t.quiet = { k, R: t.R, tw: t.tw, th: t.th, TW: t.TW, TH: t.TH, cv, pats: new WeakMap() });
  }
  // Draws the repeating tile src (w × h) onto c blurred by r px, seamless where the pattern repeats and smooth at full
  // resolution on every browser (blurWrapped, lobule-look.js; no canvas filter, which some Safaris lack, and no unfiltered canvas rescale).
  function blurTile(c, src, w, h, r) {
    c.drawImage(src, 0, 0);
    if (!(r > 0.5)) return;
    const img = c.getImageData(0, 0, w, h);
    img.data.set(blurWrapped(img.data, w, h, r));
    c.putImageData(img, 0, 0);
  }
  // The surround fading into the page with distance from the lobule (q: 0..1, how far it has faded).
  // The surround fades into the page (light in light mode, dark in dark mode).
  const shadeOf = (bg) => bg;
  function fieldFade(c, bg, x, y, rd, q, w, h, r0 = rd * 1.1) {
    const vg = c.createRadialGradient(x, y, r0, x, y, r0 * (3.2 / 1.1));
    vg.addColorStop(0, css(bg, 0)); vg.addColorStop(0.5, css(bg, 0.72 * q)); vg.addColorStop(1, css(bg, q));
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }
  // d: { a: opacity 0..1, x, y: where the settling lobule's centre is (stage px), r: its radius on
  // screen, ox, oy: the point it emerges from, quiet: 0..1, the surround drained as the lobule view's is,
  // focus: 0..1, the lobules away from it faded into the page }. null hides it.
  // What a dive's frames share (the stage's size, its styles), read once per dive: reading them each
  // frame, after the stage's own writes, would make the browser lay out the page again every frame.
  // (cs: the styles' values remembered as first read, so a frame never reads a live style after the stage's writes, which makes the
  // browser recompute the page's styles in the middle of the frame.)
  let diveCtx = null;
  const styleSnap = (cs) => { const m = new Map(); return { getPropertyValue: (n) => { let v = m.get(n); if (v === undefined) m.set(n, (v = cs.getPropertyValue(n))); return v; } }; };
  function paintField(d) {
    if (!d) diveCtx = null;
    if (!d || d.a <= 0.002) { if (field.width) { field.width = 0; field.height = 0; } field.style.opacity = '0'; fieldOp = 0; return; }
    if (!diveCtx) {
      const rect = host.getBoundingClientRect(), cs = getComputedStyle(host), dark = isDark();
      diveCtx = { W: Math.max(1, Math.round(rect.width)), H: Math.max(1, Math.round(rect.height)), cs: styleSnap(cs), dark, bg: stageBg(cs, dark) };
    }
    const { W, H, cs, dark, bg } = diveCtx;
    const dpr = Math.min(1, devicePixelRatio || 1) * 0.8;   // in motion and behind the lobule: a modest resolution is plenty
    if (field.width !== Math.round(W * dpr) || field.height !== Math.round(H * dpr)) { field.width = Math.round(W * dpr); field.height = Math.round(H * dpr); }
    // Half the tile's resolution, as at rest: the field is in motion and behind the lobule.
    const rd = d.r * dpr, t = fieldTile(cs, dark, rd * 0.55);
    const c = field.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    // The surrounding lobules start drained and tinted like the liver being zoomed into (its fill, in
    // whichever theme), so the dive reads as one tissue; the lobule's own colours come in over it.
    fieldFill(c, liverTile(t, cs, dark, bg), d.x * dpr, d.y * dpr, rd, field.width, field.height);
    // Quieting: the pre-quieted tile laid over the plain one (two pattern fills, not a blend of the whole screen).
    if (d.quiet > 0) { c.globalAlpha = d.quiet; fieldFill(c, quietTile(t, shadeOf(bg, dark)), d.x * dpr, d.y * dpr, rd, field.width, field.height); c.globalAlpha = 1; }
    // Focus: as the zoom goes on, the lobules away from the one being landed on fade into the page, the clear circle
    // closing in on it (from most of the screen to the lobule view's own surround, which it matches at focus 1).
    const f = clamp(d.focus ?? d.quiet, 0, 1);
    if (f > 0) { const diag = Math.hypot(W, H) * dpr, r0 = Math.exp(lerp(Math.log(diag * 0.45), Math.log(Math.min(diag * 0.45, rd * 1.1)), f)); fieldFade(c, shadeOf(bg, dark), d.x * dpr, d.y * dpr, rd, Math.max(f, d.quiet), field.width, field.height, r0); }
    // Emerging: the field spreads out from the dive point as it fades in.
    if (d.a < 1) {
      const diag = Math.hypot(W, H) * dpr, rho = diag * (0.2 + 1.1 * d.a + 2 * smooth(0.7, 1, d.a));   // (the last stretch spreads it past every corner, so dropping the mask at a = 1 changes nothing seen)
      const mg = c.createRadialGradient(d.ox * dpr, d.oy * dpr, rho * 0.35, d.ox * dpr, d.oy * dpr, rho);
      mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)');   // colour-exempt: a mask
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = mg; c.fillRect(0, 0, field.width, field.height);
      c.globalCompositeOperation = 'source-over';
    }
    fieldOp = Math.min(1, d.a * 1.25);
    field.style.opacity = fieldOp.toFixed(3);
  }
  let fieldOp = 0;
  function liverTile(t, cs, dark, bg) {
    const lv = rgb01(cs.getPropertyValue('--og-liver-2').trim());
    const tone = bg.map((x, i) => lerp(x, lv[i], 0.6));
    const tk = tone.map((x) => x.toFixed(2)).join(',');
    if (!t.liverQ || t.liverQ.k !== tk) {
      if (t.liverQ) free(t.liverQ.cv);
      const cv = document.createElement('canvas'); cv.width = t.tw; cv.height = t.th;
      const cc = cv.getContext('2d'); cc.drawImage(t.cv, 0, 0); fieldQuiet(cc, tone, 1, t.tw, t.th);
      t.liverQ = { k: tk, R: t.R, tw: t.tw, th: t.th, TW: t.TW, TH: t.TH, cv, pats: new WeakMap() };
    }
    return t.liverQ;
  }
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
    ];
    // The dive's field: every tile it steps through on the way to the landing size (see paintField).
    const fdpr = Math.min(1, devicePixelRatio || 1) * 0.8;
    q.push(() => {
      const top = land.r * fdpr * 0.55;
      // (Each with its quieted copy too: the dive lays it over the field from midway, and building one there, a tile at a time,
      // snagged the zoom's last stretch.)
      for (let rd = 6; ; rd *= 2) { const r = rd; q.splice(q.indexOf(null), 0, () => { const t = fieldTile(cs, dark, r); liverTile(t, cs, dark, bg); quietTile(t, shadeOf(bg, dark)); }); if (r >= top) break; }
    }, null);
    q.push(() => {   // the landed lobule: its state, then the tissue, then one full frame
      const st = store.get();
      model = lobuleState({ ...F, P: F.Pf || F.P }, st);
      const cv = (n, d) => cs.getPropertyValue(n).trim() || d;
      model.inks = { normal: cv('--flow-normal'), reversed: cv('--flow-reversed'), portal: cv('--vein-portal'), systemic: cv('--vein-systemic') };
      const dpr = Math.min(2, devicePixelRatio || 1);
      quietTile(fieldTile(cs, dark, geo.R * V.k * dpr * 0.55), bg);
    }, () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      paintTissue(W, H, dpr, dark, cs, !gl || gl.lost);
    }, () => { if (fade <= 0) { draw(0); release(); prepKey = key; } });
    return q;
  }
  // Runs the pieces in order; a null is a placeholder that a piece fills in.
  function prepareRun(q) { while (q.length) { const f = q.shift(); if (f) { f(); return q.length > 0; } } return false; }
  // Before a dive: the work its frames would otherwise stall on, done a piece per frame while the
  // anatomy is still only being magnified (the vessels' WebGL, then the field's tiles up to the size
  // the dive ends at). warm() does the next piece; true while any is left.
  let warmQ = [];
  function prewarm(rEnd) {
    const cs = getComputedStyle(host), dark = isDark(), bg = stageBg(cs, dark), top = rEnd * Math.min(1, devicePixelRatio || 1) * 0.8 * 0.55;
    warmQ = [() => ensureGL()];
    // The tiles paintField steps through (each a no-op when the idle preparation already drew it).
    for (let rd = 6; ; rd *= 2) { const r = rd; warmQ.push(() => { const t = fieldTile(cs, dark, r); liverTile(t, cs, dark, bg); quietTile(t, shadeOf(bg, dark)); }); if (r >= top) break; }
  }
  // Right before a zoom into the lobule starts: the lobule is drawn, whole and unseen, for the framing it will land on (flow marks
  // faded), so the zoom only magnifies and fades in what is already drawn. Its canvases (about 16 MB on a phone) are given back
  // when the zoom returns to the anatomy (setDiveZoom), and drawn again before the next one.
  function stage() {
    while (warm());   // the dive's field tiles (built ahead while idle, so usually nothing left), the vessels' WebGL
    if (fade > 0 || !F) return;
    flowA = 0; flowT = 0; resetView(); staging = true;
    try { update(F); } finally { staging = false; }
    if (!model) return;
    idleDrawn = ''; draw(0); diveDrawn = true; staged = api.viewKey(); relLater = true;
  }
  function warm() { const f = warmQ.shift(); if (f) f(); return warmQ.length > 0; }

  // Lumen radius of a tube at sample i (world px), from the model.
  // The few model values the calibers follow, eased toward the model's every display frame (~0.3 s), so a
  // vessel widens or narrows smoothly instead of stepping with each model update.
  let rz = null, rzMoving = false;
  const rzTarget = (m) => ({ sin: m.zone.sin, congU: m.congU, fibPre: m.fibPre, fibPost: m.fibPost, art: m.art, lr: lymphRate(m) });
  const rzOf = () => rz || (rz = rzTarget(model));
  function easeRadii(dt) {
    const tg = rzTarget(model);
    if (!rz) { rz = tg; return false; }
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
  const lyInk = (m, dark) => {
    const p = lyProt(m), lo = dark ? [0.72, 0.76, 0.69] : [0.92, 0.94, 0.88], mid = dark ? [0.7, 0.77, 0.66] : [0.88, 0.92, 0.82], hi = dark ? [0.64, 0.75, 0.58] : [0.82, 0.89, 0.74];
    return p < 0.45 ? lo.map((x, i) => lerp(x, mid[i], p / 0.45)) : mid.map((x, i) => lerp(x, hi[i], (p - 0.45) / 0.55));
  };
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
    return css(inkRGB(seg, w, k));
  }
  // The same as [r, g, b] 0–1; mid-switch, the old lens's color eased into the new one's (k: 0 … 1).
  function inkRGB(seg, w = 0, k = lensK()) {
    const M = model.mode, to = M === 'origin' ? ORIGIN_RGB : rgb01(inkOf(M, seg, w));
    if (k >= 1) return to;
    const from = lensFrom === 'origin' ? ORIGIN_RGB : rgb01(inkOf(lensFrom, seg, w));
    return from.map((x, i) => x + (to[i] - x) * k);
  }
  function inkOf(M, seg, w) {
    const m = model;
    if (M === 'pressure' || M === 'delta' || M === 'heat') {
      const V = M === 'pressure' ? [m.P1, m.P2, m.P3].map(qP) : m.dP;
      const v = seg === 'pv' ? V[0] : seg === 'in' ? lerp(V[0], V[1], 0.6 * w) : seg === 'cv' ? V[2] : V[2] + (V[1] - V[2]) * w;
      return M === 'pressure' ? pressureColor(qP(v)) : M === 'delta' ? deltaColor(qP(v)) : heatColor(qP(v));
    }
    if (M === 'oxygen') {
      const [a, b, c] = m.oxy || [1, 1, 1];
      return oxygenColor(seg === 'pv' ? a : seg === 'in' ? lerp(a, b, w) : seg === 'cv' ? c : c + (b - c) * w);
    }
    const e = seg === 'sin' ? 'sin' : seg === 'cv' ? 'post' : 'pre';
    switch (M) {
      case 'drop': return dropColor(e === 'pre' ? m.P1 - m.P2 : e === 'sin' ? m.P2 - m.P3 : m.P3 - m.P4);
      case 'direction': return m.rev[e] ? m.inks.reversed : m.inks.normal;
      case 'flow': return flowColor(Math.abs(m.Qs[e]) * 0.06);
      // Velocity against the healthy liver's own beds (no Doppler range covers them): normal from two-thirds to one and
      // a half times the healthy flow, as the anatomy colors its veins without a published range (velNormal.js).
      case 'velocity': return velocityColor(Math.abs(m.Qs[e]) / Math.max(1e-6, Math.abs(m.Q0[e] ?? m.Qs[e])), [1 / 1.5, 1.5]);
      case 'neutral': {
        const a = rgb01(m.inks.portal), b = rgb01(m.inks.systemic), k = seg === 'cv' ? 1 : seg === 'sin' ? 1 - w : 0;
        return css(a.map((x, i) => lerp(x, b[i], k)));
      }
      default: return pressureColor(seg === 'pv' || seg === 'in' ? m.P1 : seg === 'cv' ? m.P3 : m.P3 + (m.P2 - m.P3) * w);
    }
  }
  const segOf = (t) => (t.kind === 'pv' || t.kind === 'in' || t.kind === 'cv' ? t.kind : 'sin');
  const tubeW = (t, end) => { const sg = segOf(t); return sg === 'sin' ? sinW(t.rho[end ? N - 1 : 0]) : end ? 1 : 0; };
  const tubeInk = (t, end) => (segOf(t) === 'sin' && sinFib() > 0 ? css(tubeRGB(t, end)) : ink(segOf(t), tubeW(t, end)));
  // Capillarized sinusoids are drawn duller as fibSin rises (G21): drained toward the lobule's shade, never brighter.
  // (From the eased sinusoidal resistance, so a new patient's sinusoids dull gradually, as their calibers change.)
  const sinFib = () => clamp(Math.log(rzOf().sin) / 3.2, 0, 1);
  const sinDull = (rgb) => { const f = sinFib(); return f > 0 ? dullSinusoid(rgb, cssRGB01('--lz-shade'), f) : rgb; };
  const tubeRGB = (t, end, k) => { const c = inkRGB(segOf(t), tubeW(t, end), k); return segOf(t) === 'sin' ? sinDull(c) : c; };
  // A "Colored by" switch crossfades the lobule's vessels over 300 ms, as the anatomy's do (stage.js LENS_FADE).
  // lensFrom: the lens they are leaving, null when no switch is under way.
  const LENS_FADE = 300, ORIGIN_RGB = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];
  let lensFrom = null, lensT0 = 0, lensMode = null;
  function noteLens(M) {
    if (lensMode !== null && M !== lensMode && fade > 0.98 && !reduce.matches) {
      // (A switch mid-fade starts from the colour now shown: near the end it is the new lens, otherwise the one it left.)
      if (!lensFrom || lensK() >= 0.5) lensFrom = lensMode;
      lensT0 = performance.now();
    } else if (fade <= 0.98) lensFrom = null;
    lensMode = M;
  }
  function lensK() {
    if (!lensFrom) return 1;
    const u = (performance.now() - lensT0) / LENS_FADE;
    if (u >= 1 || lensFrom === model.mode) { lensFrom = null; return 1; }
    return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  }

  function drawGL(W, H, dpr, dark, cs, dt) {
    const g = gl, G = geo, m = model;
    const res = g.software ? 0.5 : 1, k = dpr * res;
    const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
    if (glCv.width !== cw || glCv.height !== ch) { glCv.width = cw; glCv.height = ch; glDirty = true; }
    const live = lymphOn ? G.tubes : G.bloodTubes;
    const T = [k * V.k, 0, 0, k * V.k, k * V.x, k * V.y];
    const dk = `${cw}x${ch}|${T.map((x) => x.toFixed(2)).join(',')}`;
    const bk = lymphOn ? 'lymph' : 'blood';
    const now = performance.now();
    const origin = originOn();
    // The flow pass stays at display speed. Shapes and colors need at most 12.5 updates/s;
    // interactions and newly enabled layers refresh immediately.
    if (dt === 0 || rzMoving || lensFrom || !attrKey || !radAll || bk !== binKey || dk !== drawKey || now - lastSurface >= 80) {
      lastSurface = now;
      // Radii, re-sent when a tube's caliber changed (they follow only these few model values).
      let reachGrew = false;
      const rk0 = Object.values(rzOf()).map((x) => x.toFixed(4)).join('|') + '|' + G.W + 'x' + G.H + '|' + lymphOn + '|' + (k * V.k).toFixed(3);
      if (rk0 !== radAll) for (const t of live) {
        const r = Array.from({ length: N }, (_, i) => radiusAt(t, i));
        t.maxR = Math.max(...r);
        // (A vessel's new radii change only the cells that list it, as a colour change does: those cells alone are drawn
        // again, or the layer moved on a pan, never the whole layer for it. A reach that outgrows its cells re-bins below.)
        if (radiiChanged(radKey[t.id], r, (rzMoving ? 0.08 : 0.35) / (k * V.k))) { radKey[t.id] = r; g.setRadii(t.id, r); glRows.add(t.id); }
        const reach = Math.ceil((t.maxR + (WALL[t.kind] || 0) + 10) / 2) * 2;
        if (reach > (binReach[t.id] || 0)) reachGrew = true;
      }
      radAll = rk0;
      if (reachGrew) binCache.clear();
      if (bk !== binKey || reachGrew) {
        binKey = bk;
        for (const t of live) binReach[t.id] = Math.max(binReach[t.id] || 0, Math.ceil((t.maxR * 1.6 + (WALL[t.kind] || 0) + 10) / 2) * 2);
        const ids = new Set(live.map((t) => t.id));
        let bins = binCache.get(bk);
        if (!bins) {
          bins = binVeins(live.map((t) => ({ id: t.id, pts: t.pts, reach: binReach[t.id] })), G.joins.filter((j) => j.members.every((id) => ids.has(id))));
          binCache.set(bk, bins);
        }
        g.setGeometry(bins);
        glDirty = true;
      }
      // Attributes, re-sent when they change (pressures in half-mmHg steps).
      const selIdsN = selIds();
      const lk = lensK(), inks = new Map(live.map((t) => [t.id, [tubeRGB(t, 0, lk), tubeRGB(t, 1, lk)]]));
      const ak = [m.mode, [...inks.values()].flat(2).map((x) => x.toFixed(3)).join(','), m.hide, origin, lymphOn, lyProt(m).toFixed(2), lyF(m).toFixed(2), [...selIdsN].join('.'), dark, cs.getPropertyValue('--artery')].join('|');
      if (ak !== attrKey) {
        attrKey = ak;
        tubeData.fill(0);
        const art = rgb01(cs.getPropertyValue('--artery').trim()), grey = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];
        const LY = lyInk(m, dark);   // lymph: clear, a faint green (paler than the bile duct), deeper with more protein
        // The space of Disse fills as filtration rises: its tint deepens a little (it already widens).
        const deep = dark ? [0.62, 0.7, 0.58] : [0.79, 0.86, 0.74], LYd = LY.map((x, i) => lerp(x, deep[i], 0.45 * lyF(m)));
        for (const t of live) {
          const o = t.id * TUBE_TEXELS * 4, isArt = t.kind === 'ha' || t.kind === 'tw', isBd = t.kind === 'bd';
          const [i0, i1] = inks.get(t.id);
          const LYt = t.kind === 'ly' ? LYd : LY;
          const c0 = isBd ? BD_FILL : isArt ? art : t.lymph ? LYt : origin && lk >= 1 ? grey : i0, c1 = isBd ? BD_FILL : isArt ? art : t.lymph ? LYt : origin && lk >= 1 ? grey : i1;
          const alpha = (isArt ? 0.9 : 1) * (selIdsN.size && !selIdsN.has(t.id) ? 0.55 : 1);
          const big = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'in';
          // The triad's three vessels carry a dark outline of their own colour; the rest the common casing.
          const edge = EDGE[t.kind];
          // The central vein and the portal venule are drawn flat (no light or dark line): on their round ends they read as stray arcs.
          const flags = (selIdsN.has(t.id) ? F_SEL : 0) | (edge ? F_EDGE : 0) | (isArt || isBd ? 0 : F_SHADOW | (t.kind === 'cv' || t.kind === 'pv' ? 0 : F_DIFFUSE | (big ? F_SPEC : 0)));
          const z = { s0: 0.1, s1: 0.11, s2: 0.12, ly: 0.13, an: 0.09, lt: 0.25, in: 0.3, pv: 0.4, cv: 0.4, lv: 0.8, sh: 0.5, bd: 0.55, tw: 0.6, ha: 0.7 }[t.kind];
          tubeData.set([...c0, WALL[t.kind], ...c1, alpha, 1, z, flags, 0], o);
          tubeData.set([0, 1, t.len, 0], o + 20);
          if (edge) tubeData.set([...edge, 0], o + 24);
        }
        g.setTubes(tubeData);
        // The pulse moves only some vessels' colours: those vessels alone are drawn again (see the draw below).
        if (!tubeShown) { tubeShown = tubeData.slice(); glDirty = true; }
        else for (let o = 0, W = TUBE_TEXELS * 4; o < tubeData.length; o += W) {
          for (let i = o; i < o + W; i++) if (tubeData[i] !== tubeShown[i]) { glRows.add(o / W); tubeShown.set(tubeData.subarray(o, o + W), o); break; }
        }
      }
    }
    // Blood: each vessel's stream advances at a display speed from the model's flows.
    const st = store.get(), b = st.blood || {};
    const bloodOn = !m.hide && st.layers?.flow !== false, chev = !m.hide && !!b.chevrons;
    const pxW = 1 / (k * V.k), s0 = SLOT * (pxW * 8 > SLOT * 2 ? 4 : pxW * 8 > SLOT ? 2 : 1);
    const sumK = (R) => {
      const n = clamp(Math.floor((1.7 * R) / Math.max(2.6, 5 * pxW)), 1, 7);
      let sk = 0;
      for (let i = 0; i < n; i++) { const yl = n === 1 ? 0 : (((i + 0.5) / n) * 2 - 1) * 0.8; sk += n === 1 ? 1 : Math.max(2, Math.floor(16 * (1 - yl * yl) + 0.5)) / 8; }
      return sk;
    };
    const ease = -Math.expm1(-dt / 0.5);
    const fr = Math.max(0, m.flow), pr = m.portal, ar = Math.max(0, m.art);
    const vS = 15 * Math.sqrt(fr);
    flowData.fill(0);
    for (const t of live) if (t.lymph) flowData[t.id * FLOW_TEXELS * 4 + 8] = -1;   // lymph carries no blood origin
    if (bloodOn || chev || origin) for (const t of live) {
      let v, occ, oe, f0 = 0, f1 = 0, strength = 1, rev = 0, stasis = 0;
      const lv = t.kind;
      if (lv === 's0' || lv === 's1' || lv === 's2') {
        v = vS * (lv === 's0' ? 1 : lv === 's1' ? 1.45 : 2.05); occ = clamp(0.5 * fr ** 0.6, 0.06, 0.95); f1 = lv === 's2' ? 1 : 0;
        stasis = 1 - smooth(0.12, 0.45, fr); oe = LOBE.q;
      } else if (lv === 'an') { v = 0.35 * vS * t.sign; occ = 0.25 * clamp(fr, 0.2, 1.5); strength = 0.6; oe = LOBE.q; }
      else if (lv === 'in') { v = 24 * Math.sign(pr) * Math.sqrt(Math.abs(pr)); occ = clamp(0.55 * Math.abs(pr) ** 0.6, 0.05, 0.95); f0 = 1; f1 = 1; rev = pr < -0.02 ? 1 : 0; oe = LOBE.pre; }
      else if (lv === 'tw') { v = 30 * Math.sqrt(ar); occ = clamp(0.5 * ar ** 0.6, 0.05, 0.95); f0 = 1; oe = LOBE.a; }
      else continue;   // vessels seen end-on carry no streaks; lymph moves as the drops on the overlay, not as streaks
      const mo = motionOf(t), sm = mo.stream || (mo.stream = { D: (t.id * 977) % PERIOD, rev: rev, v });
      // Speed eases toward the model's (a new frame changes it in a step), so the marks never lurch.
      sm.v = Math.sign(v) !== Math.sign(sm.v) ? v : sm.v + (v - sm.v) * ease;
      sm.D = (((sm.D + sm.v * dt) % PERIOD) + PERIOD) % PERIOD;
      // Density and stasis ease the same way, so the shimmer thickens or thins instead of popping.
      sm.occ = sm.occ == null ? occ : sm.occ + (occ - sm.occ) * ease;
      sm.st = sm.st == null ? stasis : sm.st + (stasis - sm.st) * ease;
      sm.rev += (rev - sm.rev) * ease;
      const o = t.id * FLOW_TEXELS * 4, Rm = t.maxR || G.rs0;
      flowData[o] = sm.D; flowData[o + 1] = sm.v; flowData[o + 2] = (sm.occ * Math.max(Math.abs(sm.v), 2) * sumK(Rm)) / s0; flowData[o + 3] = sm.st;
      flowData[o + 4] = f0; flowData[o + 5] = f1; flowData[o + 6] = strength; flowData[o + 7] = sm.rev;
      flowData[o + 12] = 1;   // (each vessel's chevron weight, as the anatomy's: every lobule vessel shows them when they are on)
      if (origin && origins && !t.lymph) { const kk = EI[oe]; for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = origins[kk * ORIGIN_N + c]; }
    }
    g.setFlow(flowData);
    const look = {
      shOff: [1.2, 2.2], light: LIGHT, reach: 11, heat: false, organs: 0,
      casing: [...triplet(cs, '--casing-rgb'), num(cs, '--casing-a', 0.56) * 0.8],
      shadow: [...triplet(cs, '--shadow-rgb'), num(cs, '--shadow-a', 0.15)],
      sheen: [...rgb01(cs.getPropertyValue('--light-ink').trim()), num(cs, '--tube-sheen', 0.42)],
      shade: [...rgb01(cs.getPropertyValue('--tube-shade-ink').trim()), num(cs, '--tube-shade', 0.2)],
      ring: [...rgb01(cs.getPropertyValue('--accent').trim()), 0.4],
      netAlpha: 1, fx: true, tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),
    };
    const blood = { alpha: flowA, on: bloodOn && flowA > 0.002, chev: chev && flowA > 0.002, look: b.look || 'shimmer', origin, clock, dye: false, bleed: [], ...bloodColors() };
    // A whole redraw of the vessel layer is by far the heaviest thing the lobule draws (about 150 plain fills of the
    // canvas); when only some vessels' attributes changed, only their cells are drawn again, to the same picture.
    const lsig = JSON.stringify(look);
    if (glDirty || dk !== drawKey || lsig !== glLook) {
      // (Moved with only some vessels' attributes changed: those are named, so the drawn layer is moved, not drawn whole.)
      const rows = glDirty || lsig !== glLook ? null : [...glRows];
      glDirty = false; drawKey = dk; glLook = lsig; glRows.clear(); g.draw(T, look, blood, rows);
    }
    else if (glRows.size) { const rows = [...glRows]; glRows.clear(); if (!g.drawRows(T, look, blood, rows)) g.draw(T, look, blood); }
    else g.composite(look, blood);
  }
  const num = (cs, n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
  const triplet = (cs, n) => { const k = cs.getPropertyValue(n).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };

  // ── Tissue: plates, collagen, zones, congestion (repainted only when the model changes it) ──
  let worldSc = 0, worldGeo = null, surRd = 0, worldDraws = 0;
  // Congestion enters the lobule's picture only past congU 0.04 (the nutmeg; dead cells past 0.12), and the picture is drawn again once
  // the venous pressure moves 0.25 mmHg from the one it was drawn at. (Keyed on half-mmHg steps, a pressure wavering on a step's edge
  // while the model runs redrew the whole bitmap, up to 3600 px square, over and over, mid-glide too: 20 times in 45 s in compensated
  // cirrhosis. Half a step from the drawn value, it follows the pressure at least as closely as the steps did.)
  let congD = 0;
  const congKey = (m) => { if (!(m.congU > 0.04)) congD = 0; else if (!congD || Math.abs(m.cong - congD) > 0.25) congD = m.cong; return congD.toFixed(3); };
  function paintTissue(W, H, dpr, dark, cs, flatVessels) {
    const m = model, G = geo;
    // The lobule itself is drawn once into a world-space bitmap (at a scale stepped in √2, never below
    // the screen's), redrawn only when the tissue's state changes; panning and zooming just place it.
    // Pressure colors enter only coarsely (they move every frame while the model glides).
    const qi = (s) => s.replace(/\d+/g, (n) => (n >> 4) << 4);
    // (#27) Mid-glide (+, −, Fit, a presenter's camera) the bitmap keeps the scale it was drawn at and is only placed larger or smaller:
    // redrawing it at each √2 step (up to 3600 px square) stalled the glide. It is drawn sharp once the glide lands.
    let sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * V.k)) * 2) / 2), 3600 / (2.6 * G.R));
    if (gliding && worldSc && worldCv.width && worldGeo === G) sc = worldSc;
    const ws = [G.W, G.H, dark, qi(inkOf(m.mode, 'pv')), m.zone.pre.toFixed(2), m.zone.sin.toFixed(2), m.zone.post.toFixed(2), m.s.toFixed(2), congKey(m), m.hide, zonesOn, cs.getPropertyValue('--bg')].join('|'), wk = sc.toFixed(3) + '|' + ws;
    const now = performance.now(), fading = tissueFading(now);
    const key = [W, H, dpr, wk, fading ? `${xfU(xfT0, now).toFixed(3)},${xfU(surT0, now).toFixed(3)}` : '', flatVessels ? [ink('sin', 1), ink('sin', 0), ink('pv'), ink('cv'), m.art.toFixed(2), [...selIds()].join('.')] : '', Object.values(fieldState()).join(','), V.k.toFixed(3), V.x.toFixed(1), V.y.toFixed(1)].join('|');
    if (key === tissueKey) return;
    tissueKey = key; tissueVer++; tissueCss = [W, H];
    const tw = canvasPx(W, dpr), th = canvasPx(H, dpr);
    if (tissue.width !== tw || tissue.height !== th) { tissue.width = tw; tissue.height = th; }
    const c = tissue.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const bg = v('--stage-bg', v('--bg'));
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const { R, cx, cy } = G;
    // The neighbours are the dive's field, carried on: the same tissue, in the same state, fading into
    // the page with distance from this lobule (so zooming out, they fade away completely).
    {
      c.setTransform(1, 0, 0, 1, 0, 0);
      const [sx, sy] = toScreen([cx, cy]), rd = R * V.k * dpr;
      // (Mid-glide, the tile it had is stretched rather than a larger one drawn; a new tissue state's tiles are built between frames, see fieldTile.)
      const want = gliding && surRd ? surRd : rd * 0.55;
      if (!gliding) surRd = rd * 0.55;
      const t = fieldTile(cs, dark, want, true), q = quietTile(t, shadeOf(rgb01(bg), dark));
      // (A new state's tiles fade in over the last state's; a new size of the same state just takes over: the same picture.)
      if (surNow && t.set !== surNow.set && surNow.q.cv?.width) { surOld = surNow.q; surT0 = now; }
      surNow = { set: t.set, q };
      const su = surT0 ? xfU(surT0, now) : 1;
      if (su >= 1) { surT0 = 0; surOld = null; }
      fieldFill(c, q, sx * dpr, sy * dpr, rd, W * dpr, H * dpr);   // half resolution is plenty for the quiet surround
      if (surOld?.cv?.width) { c.globalAlpha = 1 - su; fieldFill(c, surOld, sx * dpr, sy * dpr, rd, W * dpr, H * dpr); c.globalAlpha = 1; }
    }
    const B = 1.3 * R, bx = cx - B, by = cy - B;
    if (wk !== worldKey) {
      // The tissue's state changed (not just the scale it is drawn at): the old picture stays under the new one as it fades in.
      // (A change while one is fading in redraws the incoming picture in place and lets the fade run on, so a state that keeps
      // moving, as the pressures glide after a new patient, never restarts it.)
      if (worldState && ws !== worldState && worldGeo === G && worldCv.width && !(xfT0 && now - xfT0 < XF_MS)) { [worldOld, worldCv] = [worldCv, worldOld]; worldOldSc = worldSc; xfT0 = now; }
      worldKey = wk; worldState = ws;
      worldSc = sc; worldGeo = G; worldDraws++;
      const n = Math.ceil(2 * B * sc);
      if (worldCv.width !== n || worldCv.height !== n) { worldCv.width = n; worldCv.height = n; }
      const w = worldCv.getContext('2d');
      w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, n, n);
      w.setTransform(sc, 0, 0, sc, -bx * sc, -by * sc);
      paintLobule(w, m, G, dark, cs, bg, v);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    {
      const [sx, sy] = toScreen([bx, by]), side = 2 * B * V.k * dpr;
      if (xfT0 && now - xfT0 < XF_MS && worldOld.width && worldOldSc) {
        c.drawImage(worldOld, sx * dpr, sy * dpr, side, side);
        c.globalAlpha = xfU(xfT0, now); c.drawImage(worldCv, sx * dpr, sy * dpr, side, side); c.globalAlpha = 1;
      } else {
        c.drawImage(worldCv, sx * dpr, sy * dpr, side, side);
        if (xfT0) { xfT0 = 0; free(worldOld); }   // (faded in: the old picture is given back)
      }
    }
    // Focus: the surround fades into the page (as the dive's field does at its end).
    { c.setTransform(1, 0, 0, 1, 0, 0); const [sx, sy] = toScreen([cx, cy]); fieldFade(c, shadeOf(rgb01(bg), dark), sx * dpr, sy * dpr, R * V.k * dpr, 1, W * dpr, H * dpr); c.setTransform(dpr * V.k, 0, 0, dpr * V.k, dpr * V.x, dpr * V.y); }
    if (flatVessels) paintFlatVessels(c, cs);
    if (diveRim) diveCopy();
  }
  // The tissue as the dive shows it scaled down: cleared past the soft rim its mask keeps (opaque to 1.02 of the lobule's radius, gone
  // by 1.2), so a mask the browser drops for a frame shows no more than that rim. Inside it the copy is the tissue pixel for pixel, and
  // the mask does the fading, exactly as before. Made once per drawing of the tissue (one copy and one fill), not per frame.
  let tissueVer = 0, tissueCss = [1, 1], diveRim = null, diveCopyKey = '';
  function diveCopy() {
    if (!diveRim || !tissue.width) return;
    const { x, y, r } = diveRim, key = [tissueVer, tissue.width, tissue.height, x, y, r].join('|');
    if (key === diveCopyKey) return;
    diveCopyKey = key;
    if (diveCv.width !== tissue.width || diveCv.height !== tissue.height) { diveCv.width = tissue.width; diveCv.height = tissue.height; }
    const c = diveCv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'copy'; c.drawImage(tissue, 0, 0);
    // (In the tissue's CSS pixels, as the mask was: the canvas is stretched over the view's box.)
    c.setTransform(tissue.width / tissueCss[0], 0, 0, tissue.height / tissueCss[1], 0, 0);
    // (2 px past the mask's end, so the circle's soft edge falls where the mask is already clear.)
    c.globalCompositeOperation = 'destination-in'; c.fillStyle = '#000'; c.beginPath(); c.arc(x, y, r * 1.2 + 2, 0, TAU); c.fill();   // colour-exempt: a mask
    c.globalCompositeOperation = 'source-over'; c.setTransform(1, 0, 0, 1, 0, 0);
  }
  // The lobule in world space (plates, septa, tracts, lymph): drawn into the cached bitmap.
  function paintLobule(c, m, G, dark, cs, bg, v) {
    const { R, cx, cy, lobules } = G;
    { const l = lobules[0], bq = rgb01(bg); c.fillStyle = css(rgb01(v('--og-liver-2')).map((x, i) => lerp(bq[i], x, 0.55)), 1); c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * 1.015, py = l.y + (y - l.y) * 1.015; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); c.fill(); }
    const gap = rgb01(v('--og-liver-2')), cell = rgb01(v('--og-liver-1'));
    const COL = dark ? [0.78, 0.73, 0.6] : [0.93, 0.87, 0.73];
    const PRE = dark ? [0.86, 0.78, 0.6] : [0.78, 0.64, 0.44];   // periportal scar: deeper than COL to read on the tissue
    const col = (a) => css(COL, a);
    const hexPath = (l, k = 1) => { c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * k, py = l.y + (y - l.y) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); };
    // The lobule's own plates: hepatocytes in radial cords, one cell thick.
    const main = lobules[0];
    hexPath(main); c.fillStyle = css(gap, dark ? 0.55 : 0.5); c.fill();
    c.save(); hexPath(main); c.clip();
    const cu = m.congU;
    // Each cell's membrane: a 0.6 px line where neighbouring cells meet, so a cord reads as a row of cells (G21).
    c.strokeStyle = tk('--lz-plate-line'); c.lineWidth = Math.max(0.6, 0.6 / (c.getTransform().a || 1));
    for (const k of G.cells) {
      const z3 = k.q < 0.4, dead = z3 && cu > 0.12 && k.drop < cu * (1.25 - k.q * 1.6);
      const t = 0.88 + 0.12 * k.tone;
      const base = dark ? cell.map((x, i) => lerp(gap[i], x, 0.28)) : cell;
      // (Zone 3, by the central vein, deeper and warmer than zone 1: cordTone.)
      const fill = dead ? (dark ? [0.42, 0.33, 0.3] : [0.93, 0.86, 0.72]) : cordTone(base.map((x) => x * t + (1 - t) * (dark ? 0.15 : 1) * 0.3), k.q, dark);
      // In cirrhosis the plates thicken and lose their order (regenerating nodules).
      const sj = m.septU, dz = sj * Math.min(k.l, k.w) * 0.45;
      c.save(); c.translate(k.x + k.jx * dz, k.y + k.jy * dz); c.rotate(k.a + k.ja * sj * 0.9);
      const lw = (dead ? k.l * 0.7 : k.l) * (1 + 0.12 * sj), ww = (dead ? k.w * 0.7 : k.w) * (1 + 0.3 * sj);
      c.fillStyle = css(fill, dead ? 0.6 : dark ? 0.8 : 0.92);
      c.beginPath(); if (c.roundRect) c.roundRect(-lw / 2, -ww / 2, lw, ww, Math.min(lw, ww) * 0.38); else c.rect(-lw / 2, -ww / 2, lw, ww); c.fill();
      if (!dead) c.stroke();
      if (!dead) { c.fillStyle = tk('--lz-nodule-ink'); c.beginPath(); c.arc(k.nu * lw, 0, Math.max(0.9, ww * 0.16), 0, TAU); c.fill(); }
      c.restore();
    }
    // Zone 3 congestion: blood pooling around the central vein (nutmeg).
    if (cu > 0.04) {
      const gr = c.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.55);
      gr.addColorStop(0, tk('--lz-nutmeg', 0.5 * cu)); gr.addColorStop(0.6, tk('--lz-nutmeg', 0.22 * cu)); gr.addColorStop(1, tk('--lz-nutmeg', 0));
      c.fillStyle = gr; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }
    // Zones of the acinus (toggle): hexagonal bands from the triads (1) to the central vein (3).
    if (zonesOn) {
      [[1, 0], [0.66, 1], [0.36, 2]].forEach(([k, i]) => { hexPath(main, k); c.fillStyle = tk(`--lz-zone-${i + 1}`, dark ? 0.2 : 0.17); c.fill(); });
      c.lineWidth = 1; c.strokeStyle = tk('--lz-zone-line');
      for (const k of [0.66, 0.36]) { hexPath(main, k); c.stroke(); }
    }
    // Space of Disse collagen (capillarization) along every sinusoid.
    if (m.fibSin > 0.05) {
      c.strokeStyle = col(0.75 * m.fibSin); c.lineCap = 'round'; c.lineJoin = 'round';
      for (const t of G.tubes) {
        if (t.kind[0] !== 's') continue;
        c.lineWidth = 2 * radiusAt(t, N >> 1) + 2 + 3.5 * m.fibSin;
        c.beginPath(); t.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
      }
    }
    // Stellate (Ito) cells, in the space of Disse between a plate and its sinusoid: shown once fibrosis
    // starts, when they activate. A spindle-shaped body lying along the sinusoid, with long thin
    // processes hugging its wall; activated (myofibroblasts), they grow, darken and lay down collagen.
    if (m.act > 0.08) {
      const a = m.act, L = G.rs0 * (2.4 + 1.4 * a), Wb = G.rs0 * (0.42 + 0.2 * a);
      const body = tk('--lz-hsc-body', (0.22 + 0.3 * a).toFixed(3)), nuc = tk('--lz-hsc-nucleus', (0.3 + 0.3 * a).toFixed(3));
      // A tapered strand: from (x0, y0) along the wall, bowing toward the sinusoid, width w0 → 0.
      const strand = (k, x0, y0, sgn, len, w0, bow) => {
        const ux = Math.cos(k.a) * sgn, uy = Math.sin(k.a) * sgn, n = 10, Pq = [];
        for (let i = 0; i <= n; i++) { const u = i / n, b = bow * Math.sin(Math.PI * u * 0.8) * G.rs0; Pq.push([x0 + ux * len * u - k.nx * b, y0 + uy * len * u - k.ny * b, w0 * (1 - u) ** 1.3]); }
        c.moveTo(Pq[0][0] + k.nx * Pq[0][2], Pq[0][1] + k.ny * Pq[0][2]);
        for (const [x, y, w] of Pq) c.lineTo(x + k.nx * w, y + k.ny * w);
        for (let i = n; i >= 0; i--) c.lineTo(Pq[i][0] - k.nx * Pq[i][2], Pq[i][1] - k.ny * Pq[i][2]);
        c.closePath();
      };
      for (const k of G.hsc) {
        const ux = Math.cos(k.a), uy = Math.sin(k.a);
        c.fillStyle = body; c.beginPath();
        // Body: a slender spindle, its ends drawn out into the processes along the sinusoid.
        c.ellipse(k.x, k.y, L * 0.6, Wb, k.a, 0, TAU);
        for (const sgn of [-1, 1]) {
          const x0 = k.x + ux * sgn * L * 0.45, y0 = k.y + uy * sgn * L * 0.45;
          strand(k, x0, y0, sgn, L * (2 + 0.6 * a), Wb * 0.55, 0.45);
          strand(k, x0, y0, sgn, L * (1.1 + 0.4 * a), Wb * 0.35, -0.25);   // a finer branch on the plate side
        }
        c.fill();
        c.fillStyle = nuc; c.beginPath(); c.ellipse(k.x, k.y, L * 0.26, Wb * 0.5, k.a, 0, TAU); c.fill();
      }
    }
    c.restore();
    // Bridging septa in cirrhosis: fibrous bands along the borders (portal-portal) and, later, from
    // the triads to the central vein (portal-central), cutting the lobule into rounded nodules.
    const su = m.septU;
    if (su > 0) {
      const w = R * (0.045 + 0.075 * su), crn = lobules[0].corners;
      // Early: incomplete septa reaching out from the tracts; then complete portal-portal bridges.
      const reach = Math.min(1, 0.3 + 2.4 * su);
      c.save();
      c.shadowColor = tk('--lz-nodule-shadow'); c.shadowBlur = R * 0.06 * su;   // nodules bulge beside the bands
      crn.forEach((A, i) => {
        const B = crn[(i + 1) % 6], o = { w, rgb: COL, a: 0.55 + 0.45 * su, amp: R * 0.025, seed: 11 + i };
        if (reach >= 1) fibrousBand(c, A, B, o);
        else { const M = (t, P, Q) => [lerp(P[0], Q[0], t), lerp(P[1], Q[1], t)], h = reach / 2;
          fibrousBand(c, A, M(h, A, B), { ...o, e1: 0.2, seed: 11 + i }); fibrousBand(c, B, M(h, B, A), { ...o, e1: 0.2, seed: 61 + i }); }
      });
      // Portal-central bridges (advanced): from three tracts to the central vein, then spurs from the others.
      if (su > 0.18) {
        const g = Math.min(1, (su - 0.18) / 0.4);
        G.septaPC.forEach((sp, k) => { const P = sp.pts, q = P.length - 1;
          fibrousBand(c, P[0], P[q], { w: w * (0.6 + 0.3 * g), rgb: COL, a: 0.45 + 0.5 * g, e1: 0.9, seed: 31 + k, path: (u) => at(P, u) }); });
        if (su > 0.6) [1, 3, 5].forEach((i, k) => { const A = crn[i], t = 0.25 + 0.3 * Math.min(1, (su - 0.6) / 0.3);
          fibrousBand(c, A, [lerp(A[0], cx, t), lerp(A[1], cy, t)], { w: w * 0.55, rgb: COL, a: 0.6, e1: 0.15, amp: R * 0.03, seed: 41 + k }); });
      }
      c.restore();
    } else {
      // Healthy: just the limiting plate, a hairline.
      c.strokeStyle = tk('--lz-plate-line'); c.lineWidth = 1;
      hexPath(lobules[0]); c.stroke();
    }
    // Portal tracts (connective tissue), thicker with portal fibrosis.
    const seen = new Set();
    for (const [x, y] of lobules[0].corners) {
      const kk = Math.round(x) + ',' + Math.round(y);
      if (seen.has(kk)) continue; seen.add(kk);
      const gp = scarGrowth(m.fibPre), near = Math.hypot(x - cx, y - cy) < R * 1.05, rt = G.rt * (0.8 + 0.9 * gp);
      c.globalAlpha = near ? 1 : 0.5;
      // Collagen expands asymmetrically around all three structures, continuous with the septa; in presinusoidal
      // disease a denser, deeper-toned periportal collar (pipestem) rings the tract, clear of the orchid sinusoids.
      if (m.fibPre > 0.03) {
        fibrousTract(c, x, y, rt, Math.atan2(y - cy, x - cx), PRE, gp,
          900 + lobules[0].corners.findIndex((p) => p[0] === x && p[1] === y) * 71);
        fibrousCuff(c, x, y, rt * 0.62, rt * 1.08, PRE, gp);
      }
      if (!near) {   // the neighbours' triads, drawn flat
        c.fillStyle = css(rgb01(inkOf(m.mode, 'pv')), 0.55); c.beginPath(); c.ellipse(x, y, G.rt * 0.42, G.rt * 0.32, 0.4, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    // Central vein wall: wavy collagen bundles, continuous with the portal-central bridges.
    if (m.fibPost > 0.05) {
      const growth = scarGrowth(m.fibPost), inner = radiusAt(G.cv, 0);
      const outer = inner + G.rcv0 * (0.1 + 0.85 * growth);
      fibrousCuff(c, cx, cy, inner, outer, COL, growth);
    }
  }
  // Without WebGL2: the vessels as plain strokes on the tissue.
  function paintFlatVessels(c, cs) {
    const G = geo, art = cs.getPropertyValue('--artery').trim(), casing = tk('--lz-casing');
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const t of G.tubes) {
      const r = radiusAt(t, N >> 1), isArt = t.kind === 'ha' || t.kind === 'tw', disc = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd';
      const color = isArt ? art : t.kind === 'bd' ? tk('--lz-bile-duct') : tubeInk(t, 0), rim = EDGE[t.kind];
      const [x0, y0] = t.pts[0];
      if (disc) {
        c.fillStyle = rim ? `rgb(${rim.map((q) => Math.round(q * 255))})` : casing; c.beginPath(); c.arc(x0, y0, r + (rim ? 1.8 : 1.2), 0, TAU); c.fill();
        c.fillStyle = color; c.beginPath(); c.arc(x0, y0, r, 0, TAU); c.fill();
        continue;
      }
      const path = () => { c.beginPath(); t.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
      if (selIds().has(t.id)) { c.strokeStyle = tk('--lz-select'); c.lineWidth = 2 * r + 7; path(); c.stroke(); }
      if (!isArt) { c.strokeStyle = casing; c.lineWidth = 2 * r + 2; path(); c.stroke(); }
      c.strokeStyle = color; c.lineWidth = 2 * r; path(); c.stroke();
    }
  }

  // ── Overlay: lymph droplets; without WebGL2, the red cells too ──
  // What the effects layer draws that does not move, as world-space paths, each with the box it covers (so a frame
  // draws only those that reach the screen; one wholly off it changes no pixel there). The ductules' cells follow only
  // their calibers; the eraser under the vessels and the sinusoids' collagen lining (both with the lymph on) follow the
  // calibers and the zoom: the eraser's courses are kept for the geometry, only its widths and discs are worked out again.
  let ductKey = '', ductP = null;
  function fxDuct() {
    const G = geo, rs = G.triads.map((tr) => Math.max(radiusAt(tr.bdT, N >> 1), G.R * 0.008)), key = rs.join(',');
    if (ductP && ductP.G === G && key === ductKey) return ductP;
    ductKey = key;
    const NC = 16, TAU2 = Math.PI * 2;
    const duct = G.triads.map((tr, j) => {
      const r = rs[j], rm = r * 1.35, hw = Math.PI * rm / NC, rin = rm - hw, rout = rm + hw, x = tr.bd[0], y = tr.bd[1];
      const lumen = new Path2D(); lumen.arc(x, y, rin, 0, TAU2);
      const cells = [];
      for (let i = 0; i < NC; i++) {
        const a0 = (i / NC) * TAU2 + tr.i, a1 = ((i + 1) / NC) * TAU2 + tr.i, p = new Path2D();
        p.arc(x, y, rin, a0, a1); p.arc(x, y, rout, a1, a0, true); p.closePath(); cells.push(p);
      }
      const nuc = new Path2D(), rn = rm, nr = hw * 0.34;   // diameter about a third of the cell's width
      for (let i = 0; i < NC; i++) { const a = ((i + 0.5) / NC) * TAU2 + tr.i, nx = x + Math.cos(a) * rn, ny = y + Math.sin(a) * rn; nuc.moveTo(nx + nr, ny); nuc.arc(nx, ny, nr, 0, TAU2); }
      return { lumen, cells, nuc };
    });
    return (ductP = { G, key, duct });
  }
  // A world-space box [x0, y0, x1, y1] round some points.
  const boxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  let fxKey = '', fxP = null, fxCourses = null, liningKey = '', liningP = null;
  function fxPaths() {
    const G = geo, key = [geoKey, Object.values(rzOf()).map((x) => x.toFixed(5)).join(','), V.k.toFixed(5)].join('|');
    if (key === fxKey && fxP.G === G) return fxP;
    fxKey = key;
    // The eraser's courses: a disc for each vessel seen end-on, and each other blood vessel in thirds (each stroked as wide as
    // the lumen at its middle: the sinusoids widen toward the central vein). They depend on the geometry alone.
    if (fxCourses?.G !== G) {
      const list = [];
      for (const t of G.tubes) {
        if (t.lymph || t.kind === 'ly' || t.kind === 'lt' || t.kind === 'lv') continue;
        if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd') { list.push({ t, disc: true }); continue; }
        for (let q = 0; q < 3; q++) {
          const i0 = Math.floor((q * (N - 1)) / 3), i1 = Math.floor(((q + 1) * (N - 1)) / 3), p = new Path2D();
          p.moveTo(...t.pts[i0]);
          for (let i = i0 + 1; i <= i1; i++) p.lineTo(...t.pts[i]);
          list.push({ t, p, mid: (i0 + i1) >> 1, box: boxOf(t.pts.slice(i0, i1 + 1)) });
        }
      }
      fxCourses = { G, list };
    }
    // The eraser: a disc (w 0, filled) or a stroke of width w each, in the order they are cut, each with the box it covers.
    const erase = [];
    for (const e of fxCourses.list) {
      const t = e.t, wall = (WALL[t.kind] || 0.8) + 0.6 / V.k;
      if (e.disc) {
        const [x0, y0] = t.pts[0], p = new Path2D(), r = radiusAt(t, N >> 1) + wall;
        p.arc(x0, y0, r, 0, TAU); erase.push({ p, w: 0, box: [x0 - r, y0 - r, x0 + r, y0 + r] });
        continue;
      }
      const w = 2 * (radiusAt(t, e.mid) + wall), b = e.box;
      erase.push({ p: e.p, w, box: [b[0] - w / 2, b[1] - w / 2, b[2] + w / 2, b[3] + w / 2] });
    }
    // The sinusoid lining, a line either side of each sinusoid: one path for the whole of it, and each side on its own
    // with its box (stroked with the default miter joins, which reach at most 10 half-widths past a point).
    const z = rzOf(), lw = 0.9 / V.k, lk = [geoKey, z.sin.toFixed(5), z.congU.toFixed(5), V.k.toFixed(5)].join('|');
    if (lk !== liningKey || liningP?.G !== G) {
      liningKey = lk;
      const lining = new Path2D(), sides = [], reach = 5 * lw;
      for (const t of G.tubes) {
        if (t.kind !== 's0' && t.kind !== 's1' && t.kind !== 's2') continue;
        for (const side of [-1, 1]) {
          const one = new Path2D(), pts = [];
          t.pts.forEach(([x, y], i) => {
            if (t.rho[i] < CV_STOP) return;   // stops at the central vein's edge: no spokes into it
            const [xa, ya] = t.pts[Math.max(0, i - 1)], [xb, yb] = t.pts[Math.min(N - 1, i + 1)], d = Math.hypot(xb - xa, yb - ya) || 1;
            const o = side * (radiusAt(t, i) + lw);
            const px = x - ((yb - ya) / d) * o, py = y + ((xb - xa) / d) * o;
            if (pts.length) { lining.lineTo(px, py); one.lineTo(px, py); } else { lining.moveTo(px, py); one.moveTo(px, py); }
            pts.push([px, py]);
          });
          if (!pts.length) continue;
          const b = boxOf(pts);
          sides.push({ p: one, box: [b[0] - reach, b[1] - reach, b[2] + reach, b[3] + reach] });
        }
      }
      liningP = { G, lining, sides };
    }
    return (fxP = { G, erase, lining: liningP });
  }
  // What part of the world the effects layer shows, with a few device pixels to spare for antialiasing: [x0, y0, x1, y1].
  let fxAll = false;   // (for the checks: draw the eraser and the lining whole, see fxCheck)
  const fxView = (W, H, dpr) => { if (fxAll) return [-Infinity, -Infinity, Infinity, Infinity]; const mg = 4 / (dpr * V.k); return [-V.x / V.k - mg, -V.y / V.k - mg, (W - V.x) / V.k + mg, (H - V.y) / V.k + mg]; };
  const meets = (b, v) => b[2] >= v[0] && b[0] <= v[2] && b[3] >= v[1] && b[1] <= v[3];
  let fxDrawn = '';
  function paintFx(W, H, dpr, dark, dt, flat) {
    const fw = canvasPx(W, dpr), fh = canvasPx(H, dpr);
    if (fx.width !== fw || fx.height !== fh) { fx.width = fw; fx.height = fh; fxDrawn = ''; }
    const G = geo, m = model;
    // With nothing moving on this layer (no lymph, WebGL vessels), it holds only the ductules' epithelium: drawn again only when
    // the view, a caliber or the theme changes, not every frame (clearing and redrawing a full-screen canvas the screen then re-uploads).
    const moving = fxMoves({ lymph: lymphOn, flat, hide: m.hide, flow: store.get().layers?.flow });
    const fk = moving ? '' : [fw, fh, dpr, dark, m.hide, m.hide ? '' : fxDuct().key, V.k, V.x, V.y, tk('--lz-duct-cell'), tk('--lz-duct-edge'), tk('--lz-duct-nucleus'), tk('--lz-duct-lumen')].join('|');
    if (fk && fk === fxDrawn) return;
    fxDrawn = fk;
    const c = fx.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.setTransform(dpr * V.k, 0, 0, dpr * V.k, dpr * V.x, dpr * V.y);
    if (!m.hide) {
      // The bile ductule is lined all round by a simple cuboidal epithelium: wedge-shaped cells side by side
      // around an open lumen, each with a darker round nucleus.
      const cellFill = tk('--lz-duct-cell'), cellEdge = tk('--lz-duct-edge'), nuc = tk('--lz-duct-nucleus'), lumen = tk('--lz-duct-lumen');
      c.lineWidth = Math.max(0.3, G.R * 0.0013); c.strokeStyle = cellEdge; c.globalAlpha = 0.72;   // a little faded, so the ductule sits back in the tract
      // One ring of 16 cuboidal cells round each: as deep as they are wide, so each nucleus has room (a third of the cell's width).
      for (const d of fxDuct().duct) {
        c.fillStyle = lumen; c.fill(d.lumen);
        c.fillStyle = cellFill;
        for (const p of d.cells) { c.fill(p); c.stroke(p); }
        c.fillStyle = nuc; c.fill(d.nuc);
      }
      c.globalAlpha = 1;
    }
    if (lymphOn && flat) {
      // Without WebGL2, hepatic lymph as shimmer: plasma filtered into the space of Disse drifts out through the tissue
      // to the portal tract (space of Mall), where it leaves in the lymphatics. More sinusoidal pressure,
      // more lymph: the streaks grow denser, brighter and faster (and so does ascites).
      const rate = lymphRate(m), n = clamp(Math.round(22 * rate), 10, G.lymph.length), speed = 0.07 * Math.sqrt(clamp(rate, 0.3, 6));
      const R = G.R, glowA = clamp(0.35 + 0.15 * rate, 0.35, 0.9);
      const ink = [255, 255, 255];   // lymph is clear and pale: white streaks
      const pos = (d, u) => {
        const aC = Math.round(d.a / (Math.PI / 3)) * (Math.PI / 3), e = u ** 1.6;
        const ang = d.a + (aC - d.a) * e, rr = lerp(d.r0, 0.96, u) * R, wob = Math.sin(u * 7 + d.w) * R * 0.014 * (1 - u);
        return [G.cx + Math.cos(ang) * rr - Math.sin(ang) * wob, G.cy + Math.sin(ang) * rr + Math.cos(ang) * wob];
      };
      c.save();
      c.globalCompositeOperation = 'source-over';
      // On the pale tissue a faint shadow keeps the white streaks legible.
      if (!dark) { c.shadowColor = tk('--lz-streak-shadow'); c.shadowBlur = 3; }
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        const d = G.lymph[i];
        d.ph = (d.ph + (reduce.matches ? 0 : dt * speed * d.sp)) % 1;
        const u = d.ph, env = smooth(0, 0.15, u) * (1 - smooth(0.82, 1, u));
        if (env <= 0.01) continue;
        const u0 = Math.max(0, u - d.len), tail = pos(d, u0), head = pos(d, u);
        const gr = c.createLinearGradient(tail[0], tail[1], head[0], head[1]);
        gr.addColorStop(0, `rgba(${ink.join(',')},0)`); gr.addColorStop(1, `rgba(${ink.join(',')},${(glowA * env).toFixed(3)})`);
        c.strokeStyle = gr;
        c.beginPath();
        for (let k = 0; k <= 6; k++) { const q = pos(d, lerp(u0, u, k / 6)); if (k) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }
        c.lineWidth = 5; c.globalAlpha = 0.22; c.stroke();     // soft glow
        c.lineWidth = 1.8; c.globalAlpha = 1; c.stroke();      // bright core
      }
      // It gathers in the portal tracts.
      c.globalAlpha = 1; c.shadowBlur = 0;
      for (const tr of G.triads) {
        const rg = c.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, G.rt * 1.1);
        rg.addColorStop(0, `rgba(${ink.join(',')},${(0.1 + 0.06 * clamp(rate, 0, 4)).toFixed(3)})`); rg.addColorStop(1, `rgba(${ink.join(',')},0)`);
        c.fillStyle = rg; c.beginPath(); c.arc(tr.x, tr.y, G.rt * 1.1, 0, TAU); c.fill();
      }
      c.restore();
    }
    if (lymphOn && !flat && !m.hide) {
      const p = lyProt(m), still = reduce.matches, lw = 0.9 / V.k, seal = 1 - smooth(0.15, 0.6, p);
      // Lymph as drops drifting along the space of Disse and the terminal lymphatics to the portal tract:
      // faster as more fluid filters (the volume); each carries albumin beads, as many as its protein allows
      // (the concentration). A fixed number of drops per vessel (a count that followed the rate would make
      // them all jump to new places), and speed eased toward the model's. One path per ink, no blur.
      const lyR = clamp(lymphRate(m), 0.2, 6), beads = Math.round(1 + 4 * p);
      const gapW = G.R * 0.06, minR = 2.6 / V.k;
      lyV = lyV == null ? lyR : lyV + (lyR - lyV) * -Math.expm1(-dt / 0.5);
      const vW = G.R * 0.035 * Math.sqrt(lyV);
      // (Every drop is drawn, on the screen or not: the drops and beads go out as one path each, and a path with fewer
      // circles in it comes out a shade different at a few edges. The eraser and the lining below draw only what reaches the screen.)
      const view = fxView(W, H, dpr);
      const drops = [];
      for (const t of G.tubes) {
        if (t.kind !== 'ly' && t.kind !== 'lt') continue;
        const L = t.len || 1, n = Math.max(1, Math.round(L / gapW)), dir = t.kind === 'ly' ? -1 : 1;   // the space of Disse is drawn from the edge inward
        const mo = motionOf(t);
        mo.lu = ((mo.lu ?? (t.id * 0.371) % 1) + (still ? 0 : dir * dt * vW / L) + 1) % 1;
        const r = Math.max(minR, (radiusAt(t, N >> 1) / (t.kind === 'ly' ? lyTaper(t.rho[N >> 1]) : 1)) * 0.7);
        for (let i = 0; i < n; i++) {
          const u = (mo.lu + i / n) % 1, e = Math.min(u, 1 - u) * n;   // fading in and out at the ends
          if (e < 0.25) continue;
          const [x, y] = at(t.pts, u), tp = t.kind === 'ly' ? lyTaper(Math.hypot(x - G.cx, y - G.cy) / G.R) : 1;
          if (tp < 0.2) continue;   // too far in: the channel has thinned out
          drops.push(x, y, r * Math.min(1, e) * smooth(0.2, 0.8, tp), t.id + i);
        }
      }
      c.fillStyle = tk('--lz-lymph');
      c.beginPath();
      for (let j = 0; j < drops.length; j += 4) { const [x, y, rr] = [drops[j], drops[j + 1], drops[j + 2]]; c.moveTo(x + rr, y); c.arc(x, y, rr, 0, TAU); }
      c.fill();
      // Albumin beads: a saturated amber with a ring of the opposite lightness, so they stand off the pale
      // green lymph in either theme.
      c.beginPath();
      for (let j = 0; j < drops.length; j += 4) {
        const x = drops[j], y = drops[j + 1], rr = drops[j + 2], br = rr * 0.3, a0 = drops[j + 3] * 1.7;
        for (let b = 0; b < beads; b++) {
          const a = a0 + (b * TAU) / beads, q = beads === 1 ? 0 : rr * 0.5;
          c.moveTo(x + Math.cos(a) * q + br, y + Math.sin(a) * q); c.arc(x + Math.cos(a) * q, y + Math.sin(a) * q, br, 0, TAU);
        }
      }
      c.lineWidth = Math.max(0.5 / V.k, minR * 0.22);
      c.strokeStyle = tk('--lz-albumin-ring');
      c.stroke();
      c.fillStyle = tk('--lz-albumin');
      c.fill();
      // The lymph runs beneath the blood: cut the drops away wherever a blood vessel (with its wall)
      // lies over them, so the arterioles, venules and sinusoids pass on top.
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = c.strokeStyle = '#000';   // colour-exempt: an eraser (destination-out)
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const { p, w, box } of fxPaths().erase) { if (!meets(box, view)) continue; if (w) { c.lineWidth = w; c.stroke(p); } else c.fill(p); }
      c.restore();
      // The sinusoid lining: nothing extra while the fenestrae are open; a thin continuous collagen line
      // fades in as the sinusoids capillarize and hold protein back.
      if (seal > 0.02) {
        c.save();
        c.lineWidth = lw;
        c.strokeStyle = tk('--lz-collagen', ((dark ? 0.6 : 0.5) * seal).toFixed(3));
        const { lining, sides } = fxPaths().lining, seen = sides.filter((sd) => meets(sd.box, view));
        let path = lining;
        if (seen.length < sides.length) { path = new Path2D(); for (const sd of seen) path.addPath(sd.p); }
        c.stroke(path);
        c.restore();
      }
    }
    if (flat && !m.hide && store.get().layers?.flow !== false) {
      // Red cells along the sinusoids at the model's flow.
      c.fillStyle = tk('--lz-rbc');
      const sp = 0.1 * Math.max(0, m.flow);
      c.beginPath();
      for (const t of G.tubes) {
        if (t.kind !== 's0' && t.kind !== 's1' && t.kind !== 's2') continue;
        t.u = ((t.u ?? (t.id * 0.137) % 1) + dt * sp * (t.kind === 's2' ? 2 : t.kind === 's1' ? 1.45 : 1)) % 1;
        for (const off of [0, 0.5]) { const [x, y] = at(t.pts, (t.u + off) % 1); c.moveTo(x + 2, y); c.arc(x, y, 2, 0, TAU); }
      }
      c.fill();
    }
  }

  // ── Hit testing and the card ──
  function hit(x, y) {
    const G = geo, m = model;
    if (!G || !m) return null;
    for (const tr of G.triads) if (Math.hypot(x - tr.x, y - tr.y) < G.rt * 1.2) {
      if (Math.hypot(x - tr.ha[0], y - tr.ha[1]) < Math.max(G.R * 0.03, 10 / V.k)) return { part: 'ha', tri: tr.i };
      if (Math.hypot(x - tr.bd[0], y - tr.bd[1]) < Math.max(G.R * 0.03, 10 / V.k)) return { part: 'bd', tri: tr.i };
      if (lymphOn && Math.hypot(x - tr.lv.pts[0][0], y - tr.lv.pts[0][1]) < Math.max(G.R * 0.03, 10 / V.k)) return { part: 'lv', tri: tr.i };
      return { part: 'triad', tri: tr.i };
    }
    if (Math.hypot(x - G.cx, y - G.cy) < radiusAt(G.cv, 0) + 4) return { part: 'cv' };
    let best = null, bd = Infinity;
    for (const t of G.tubes) {
      if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd' || (t.lymph && !lymphOn)) continue;
      const [d] = distTo(t.pts, x, y), r = radiusAt(t, N >> 1), tol = Math.max(r + (t.kind === 'tw' ? 6 : 5), 10 / V.k);
      const score = d - r - (t.kind === 'tw' ? 2 : 0);
      if (d < tol && score < bd) { bd = score; best = t; }
    }
    if (best) return { part: best.kind === 'tw' ? 'ha' : best.lymph ? 'lv' : best.kind[0] === 's' ? 'sin' : best.kind, tube: best.id, tri: best.tri };
    if (m.septU > 0.1) {
      const C = G.lobules[0].corners, w = G.R * (0.02 + 0.05 * m.septU) / 2 + 4;
      for (let i = 0; i < 6; i++) { const A = C[i], B = C[(i + 1) % 6], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = clamp(((x - A[0]) * dx + (y - A[1]) * dy) / L2, 0, 1); if (Math.hypot(A[0] + dx * t - x, A[1] + dy * t - y) < w) return { part: 'septum' }; }
      if (m.septU > 0.18) for (const sp of G.septaPC) if (distTo(sp.pts, x, y)[0] < w) return { part: 'septum' };
    }
    const q = hexFrac(x, y, G.cx, G.cy, G.R);
    if (q < 1) return { part: 'hep', zone: zoneOf(q) };
    return null;
  }
  function chainOf(id) {
    const out = new Set([id]);
    let t = geo.tubes[id];
    while (t?.parent != null) { out.add(t.parent); t = geo.tubes[t.parent]; }
    return out;
  }
  // The stage still passes the lobe it zoomed toward; one lobule stands for both.
  const setLobe = () => {};

  // ── One level deeper: into a sinusoid (sinusoid-view.js) ──
  // "Zoom into the sinusoid" on a sinusoid's card plays one continuous zoom, gentle at both ends: the
  // lobule grows about that sinusoid, turning it to lie along the screen and carrying it to where the
  // sinusoid view draws its own; as the zoom lands the sinusoid view, at the same size and angle, resolves in and
  // covers it. Zooming out (the zoom buttons, a pinch, the wheel), its back button or Escape reverse it.
  const sv = createSinusoidView({ host });
  let sinU = 0, sinTo = 0, sinRaf = 0, sinDive = null, sinPick = null, quietSin = false, sinPending = false;
  // A zoom that runs on through the lobule without stopping in it (stage.js: anatomy to sinusoid, or back): the stage hands over
  // the speed (log scale per ms) its own zoom has at the joint, and this zoom's ease then starts (or ends) at that speed instead of at rest.
  let sinChain = null, chromeHold = false, sinClosedCb = null, sinZ = 0;   // (sinZ: the sinusoid zoom's log scale so far, for the tests)
  const chainEase = (s, a) => a * s + (3 - 2 * a) * s * s + (a - 2) * s * s * s;   // 0 to 1, a slope at 0 and none at 1
  const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  // Which sinusoid, and where on it: the one whose card is open, else the one carrying the label.
  function sinusoidPick() {
    const sl = store.get().selection, G = geo;
    const own = sl?.type === 'lobule' && (sl.part === 'sin' || sl.part === 'an') && G.tubes[sl.tube];
    if (own) return { tube: own.id, w: sl.at || at(own.pts, 0.45) };
    // Otherwise a long, straight stretch of a sinusoid that already runs the way the sinusoid view does (from
    // the portal side toward the central vein, across a landscape screen, down a portrait one), near the
    // middle of the screen: the zoom then only grows it, with hardly any turn, and the straight vessel of
    // the view lies along the lobule's own one.
    const ang = sv.frame().ang, mx = G.W / 2, my = G.H / 2, D = Math.hypot(G.W, G.H);
    let best = null, bs = Infinity;
    for (const t of G.tubes) {
      if (t.kind !== 's0' && t.kind !== 's1' && t.kind !== 's2') continue;
      for (let i = 3; i < N - 3; i += 2) {
        const g = straightRun(t, i), [x, y] = toScreen(t.pts[i]);
        if (x < 20 || y < 20 || x > G.W - 20 || y > G.H - 20) continue;
        const turn = Math.abs(Math.atan2(Math.sin(ang - g.th), Math.cos(ang - g.th)));
        const sc = turn * 2.5 - Math.min(g.run[0], g.run[1], 14) * 0.08 + Math.hypot(x - mx, y - my) / D;
        if (sc < bs) { bs = sc; best = { tube: t.id, w: t.pts[i] }; }
      }
    }
    if (best) return best;
    const t = sinTube();
    return { tube: t.id, w: at(t.pts, 0.45) };
  }
  // At sample i of a sinusoid: the blood's direction (toward the central vein), and how far the vessel stays
  // straight from there each way (back toward the portal side, on toward the central vein), in lumen radii.
  function straightRun(t, i) {
    const G = geo, P = t.pts, A = P[Math.max(0, i - 1)], B = P[Math.min(N - 1, i + 1)];
    let th = Math.atan2(B[1] - A[1], B[0] - A[0]), dir = 1;
    if (Math.hypot(B[0] - G.cx, B[1] - G.cy) > Math.hypot(A[0] - G.cx, A[1] - G.cy)) { th += Math.PI; dir = -1; }
    const ux = Math.cos(th), uy = Math.sin(th), r = Math.max(1e-3, radiusAt(t, i)), run = [0, 0];
    for (const [k, sg] of [[0, -1], [1, 1]]) {
      for (let j = i + sg * dir; j >= 0 && j < N; j += sg * dir) {
        const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
        if (Math.abs(-dx * uy + dy * ux) > 0.6 * r) break;
        run[k] = Math.abs(dx * ux + dy * uy) / r;
      }
    }
    return { th, run };
  }
  function diveGeometry() {
    const G = geo, t = G.tubes[sinPick.tube], [, u] = distTo(t.pts, sinPick.w[0], sinPick.w[1]);
    const i = clamp(Math.round(u * (N - 1)), 1, N - 2), { th, run } = straightRun(t, i);
    const p = toScreen(at(t.pts, u)), F = sv.frame();
    const rot = Math.atan2(Math.sin(F.ang - th), Math.cos(F.ang - th));
    const Z = clamp(F.lumen / Math.max(0.05, 2 * radiusAt(t, i) * V.k), 1.5, 400);
    // The zoom is one similarity, from the lobule as it is to the sinusoid view as it rests (p to the view's
    // centre c, turned by rot, grown by Z), taken a fraction at a time about its fixed point q: nothing slides,
    // everything grows out of q, and the lobule's sinusoid stays exactly where the view draws it.
    const m = Z * Math.cos(rot), n = Z * Math.sin(rot), c = [F.x, F.y];
    const bx = c[0] - (m * p[0] - n * p[1]), by = c[1] - (n * p[0] + m * p[1]);
    const a = 1 - m, b = n, det = a * a + b * b;   // (I − M) q = c − M p, with I − M = [a b; −b a]
    const q = [(a * bx - b * by) / det, (b * bx + a * by) / det];
    return { p, c, q, rot, Z, run, k: F.k, ang: F.ang };
  }
  function placeSinusoid() {
    const u = sinU, rm = reduce.matches;
    let D = sinDive;
    if (!D || u <= 0) {
      sinZ = 0;
      el.style.transform = ''; el.style.transformOrigin = ''; el.style.visibility = ''; el.classList.remove('lz-sin');
      sv.place({ opacity: 0 });
      return;
    }
    // On the way in the view's resting place is read afresh each frame: the dock and the side pieces leave as the
    // zoom starts (and the credit line slides down), so the frame they free settles early in the zoom, which then
    // lands on it, with no second move after it. (On the way out it is kept, so the lobule is reached as it was.)
    if (D && sinTo === 1 && u > 0 && u < 1 && !rm) D = sinDive = diveGeometry();
    const g = rm ? 1 : sinChain ? chainEase(u, clamp(sinChain.speed * (sinTo === 1 ? 1150 : 950) / Math.max(0.2, Math.log(D.Z)), 0.2, 3)) : easeIO(u);
    sinZ = Math.log(D.Z) * g;
    // The lobule: turned and grown about the zoom's fixed point.
    el.style.transformOrigin = rm ? '' : `${D.q[0].toFixed(2)}px ${D.q[1].toFixed(2)}px`;
    el.style.transform = rm ? '' : `rotate(${(D.rot * g).toFixed(5)}rad) scale(${(D.Z ** g).toFixed(5)})`;
    el.style.visibility = u >= 1 ? 'hidden' : '';
    el.classList.add('lz-sin');
    // The sinusoid view: drawn by the GPU on the lobule's sinusoid each frame; it comes in over the lobule as the zoom lands.
    sv.place({
      opacity: (rm ? u : 1) * fade,
      dive: u >= 1 || rm ? null : { g, p: D.p, q: D.q, rot: D.rot, Z: D.Z, run: D.run, k: D.k, ang: D.ang },
      isOpen: u >= 1 && fade > 0.98,
    });
  }
  function applyChrome() {
    const ch = clamp((fade - 0.55) / 0.45, 0, 1);
    el.style.setProperty('--lz-chrome', chromeHold ? '0' : (ch * ch * (3 - 2 * ch)).toFixed(3));
  }
  function resetSinusoid() { cancelFrame(sinRaf); sinU = 0; sinTo = 0; sinDive = null; placeSinusoid(); }
  function diveSinusoid(on) {
    if (quietSin) { sinTo = 0; cancelFrame(sinRaf); return; }   // the lobule view is closing: the sinusoid fades out with it
    // Asked for while the dive into the lobule is still on its way: it carries on into the sinusoid once the dive lands (setDiveZoom).
    if (on && fade < 0.98 && sv.available && store.get().lobule) sinPending = true;
    if (on && (!geo || fade < 0.98 || !model || !sv.available)) { sinChain = null; if (chromeHold) { chromeHold = false; applyChrome(); } queueMicrotask(() => { if (store.get().sinusoid && !sinTo) store.set({ sinusoid: false }); }); return; }
    const to = on ? 1 : 0;
    if (to === sinTo && sinU === to) return;
    sinTo = to;
    if (on && sinU === 0) { sinPick = sinusoidPick(); sv.setModel(model); }
    // Back out from the sinusoid after the screen changed size (turned, a window resized): the lobule is built and framed for the new size
    // first, so the zoom lands on it as it will stay (it landed at the old size and then refitted).
    if (!on && sinU === 1) {
      const rect = host.getBoundingClientRect(), W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height)), was = geoKey;
      ensureGeo(W, H);
      if (geoKey !== was) sinPick = sinusoidPick();
      if (refitLater || geoKey !== was) { refitLater = false; const F0 = fitV(); kFit = F0.k; if (atFit) Object.assign(V, F0); else clampV(); }
    }
    // From a standstill the geometry is read afresh (the lobule may have been resized); reversing mid-way keeps it.
    if (sinU === 0 || sinU === 1) sinDive = diveGeometry();
    const sl = store.get().selection;
    if (sl && (on ? sl.type === 'lobule' : sl.type === 'sinusoid')) store.set({ selection: null });
    // On the way out the lobule is drawn once in its present state, so it does not change when it lands.
    if (!on) { diveDrawn = false; drawVersion++; tissueKey = ''; layoutKey = ''; }
    if (!raf && fade > 0) raf = nextFrame(loop);
    // (Lite mode: no zoom into or out of the sinusoid; it fades in.)
    const from = sinU, ms = (reduce.matches ? 280 : on ? 1150 : 950) * Math.abs(to - from);
    // Carried on from the dive, the zoom is timed from the moment the dive reached the joint (see stage.js diveFrame).
    const t0 = on && from === 0 && sinChain?.at != null ? Math.min(performance.now(), sinChain.at) : performance.now();
    cancelFrame(sinRaf);
    const step = (now) => {
      const t = ms > 0 ? clamp((now - t0) / ms, 0, 1) : 1;
      sinU = lerp(from, to, t); placeSinusoid();
      if (t < 1) sinRaf = nextFrame(step);
      else {
        sinChain = null;
        if (on) { if (chromeHold) { chromeHold = false; applyChrome(); } }
        else { sinDive = null; drawVersion++; if (!raf && fade > 0) raf = nextFrame(loop); if (refitLater) refit(); const cb = sinClosedCb; sinClosedCb = null; cb?.(t0 + ms); }
      }
    };
    if (on && from === 0 && sinChain?.now != null && sinChain.now >= t0) step(sinChain.now); else sinRaf = nextFrame(step);
  }
  store.on('sinusoid', (on) => diveSinusoid(!!on));
  // (Checked when the zoom lands and when the lobule is fully in, whichever comes last: a slow frame can do both at once.)
  function sinOnLanding() {
    if (diveScaled || !sinPending || fade <= 0.98) return;
    sinPending = false;
    nextFrame(() => { const st = store.get(); if (st.lobule && !st.sinusoid && fade > 0.98) store.set({ sinusoid: true }); });
  }
  store.on('lobule', (on) => { if (!on) sinPending = false; if (!on && store.get().sinusoid) { quietSin = true; store.set({ sinusoid: false }); quietSin = false; } });

  const api = {
    el,
    update,
    /** 0 = hidden, 1 = fully in the lobule. It fades in where it stands, over the dive's field. */
    setFade(u) {
      const was = fade;
      fade = clamp(u, 0, 1);
      el.style.opacity = fade.toFixed(3);
      // The tissue first, then its labels and card (and on the way out, those go first).
      applyChrome();
      el.classList.toggle('on', fade > 0.98);
      if (fade > 0.98 && was <= 0.98) sinOnLanding();
      el.setAttribute('aria-hidden', String(fade < 0.98));
      // Entering: the lobule is framed.
      // (Its flow marks start faded and ease in once it has landed: left at full from an earlier visit, they made every frame of the
      // dive's first 0.3 s redraw the whole lobule at full size.)
      // (Drawn ahead in the dive (staged), and still framed the same: nothing more to draw, the loop just starts.)
      if (fade > 0 && was === 0) { flowA = 0; flowT = 0; resetView(); relLater = false; if (staged && staged === api.viewKey() && model) { if (!raf) raf = nextFrame(loop); } else { diveDrawn = false; if (F) update(F); } staged = ''; }
      // Leaving the lobule closes a part's card, so it is not waiting next time.
      if (was > 0.98 && fade <= 0.98) { stopInertia(); if (store.get().selection?.type === 'lobule') store.set({ selection: null }); }
      // (Mid-zoom out, the canvases are given back when the zoom ends: freeing them there is one more thing in a moving frame.)
      if (fade === 0) { cancelFrame(raf); raf = 0; last = 0; if (was > 0) { if (diveScaled) relLater = true; else release(); } }
      // Out of the lobule: a presenter's aim is spent (the next way in frames the whole lobule).
      if (fade === 0 && was > 0) { aimed = null; camHeld = false; if (camMove) { camMove = false; el.classList.remove('lz-cam'); } }
      // Leaving the lobule view from inside a sinusoid: the sinusoid fades out with it.
      if (sinU > 0) { if (fade === 0) resetSinusoid(); else placeSinusoid(); }
    },
    /** Where the lobule will sit once open (stage px): its centre and radius, framed as it opens. */
    landing() {
      const rect = host.getBoundingClientRect();
      ensureGeo(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));

      resetView();
      const [x, y] = toScreen([geo.cx, geo.cy]);
      return { x, y, r: geo.R * V.k };
    },
    /** Where the lobule is now (it may be zoomed or panned), for the way out. */
    current() {
      if (!geo) return this.landing();
      const [x, y] = toScreen([geo.cx, geo.cy]);
      return { x, y, r: geo.R * V.k };
    },
    setDive: paintField,
    /** The zoom into or out of the sinusoid carries on at this speed (see sinChain); hold: the lobule's own labels and card stay away meanwhile. */
    setSinChain(info, hold = false) { sinChain = info; if (hold !== chromeHold) { chromeHold = hold; applyChrome(); } },
    /** Called once when the sinusoid view has finished closing to the lobule. */
    onSinClosed(fn) { sinClosedCb = fn; },
    sinBusy: () => sinTo === 1 ? sinU < 1 : sinU > 0,
    sinusoidOpen: () => sv.isOpen(),
    sinZoom: () => sinZ,
    onZoomOut(fn) { outHandler = fn; },
    prewarm, warm, stage, preparePieces, prepareRun,
    /** True once the dive's field (or the lobule) covers the anatomy, which then need not be drawn. */
    covers: () => fade > 0.98 || fieldOp >= 0.999,
    /** During the dive: the tissue (not its card) still zooming in, by k (≤ 1) about the stage point x, y. */
    setDiveZoom(k, x, y, tx = x, ty = y) {
      diveScaled = k < 0.9999; if (!diveScaled) diveDrawn = false;
      if (!diveScaled && fade <= 0) { staged = ''; if (relLater) { relLater = false; release(); } }   // the dive is over with the lobule unseen
      // Landed with a Sinusoid tap waiting (made during the dive): on into the sinusoid now.
      sinOnLanding();
      // Scaled down, the tissue's own page fill would show as a pale card: a soft round mask keeps only the lobule and its rim, on the
      // tissue's copy cleared past that rim (diveCopy), so a dropped mask cannot bring the card back. (The vessels' canvas has nothing past the rim.)
      const r = geo ? geo.R * V.k : 0, rim = k < 0.9999 && r > 0;
      const mask = rim ? `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, #000 ${(r * 1.02).toFixed(1)}px, transparent ${(r * 1.2).toFixed(1)}px)` : '';   // colour-exempt: a mask
      diveRim = rim ? { x: +x.toFixed(1), y: +y.toFixed(1), r: +r.toFixed(1) } : null;
      if (rim) diveCopy();
      else if (diveCv.width) { free(diveCv); diveCopyKey = ''; }
      const show = rim && diveCopyKey ? diveCv : tissue;
      if (tissue.style.visibility !== (show === tissue ? '' : 'hidden')) { tissue.style.visibility = show === tissue ? '' : 'hidden'; diveCv.style.visibility = show === diveCv ? '' : 'hidden'; }
      for (const e of [tissue, diveCv, glCv, fx, leaders, labels]) {
        if (e === glCv || e === diveCv) { e.style.maskImage = mask; e.style.webkitMaskImage = mask; }
        if (k >= 0.9999) { e.style.transform = ''; e.style.transformOrigin = ''; continue; }
        // Scaled about its own centre, which sits where the field's lobule at the dive's focus is (tx, ty), so it morphs out of that one.
        e.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        e.style.transform = `translate(${(tx - x).toFixed(1)}px, ${(ty - y).toFixed(1)}px) scale(${k.toFixed(4)})`;
      }
    },
    /** Where the sinusoid's reading and the lesion pointer meet their sinusoid (for the checks): its generation, how far
     *  out from the central vein (0) to the lobule's rim (1) along that ray, and where on screen. */
    sinAnchor() {
      if (!geo) return null;
      const t = sinTube(), p = sinAt(t), [x, y] = toScreen(p);
      return { lvl: t.lvl, f: rimFrac(p), x, y };
    },
    /** Where a lobule selection is on screen (for the action card), as the stage's anchorFor. */
    anchorFor(sl) {
      if (!geo || sl?.type !== 'lobule') return null;
      const w = sl.at || [geo.cx, geo.cy], [x, y] = toScreen(w);
      return { x, y, path: [[x, y]] };
    },
    resetView,
    /** The zoom buttons: in or out about the middle of the free space, and Fit. */
    zoomBy, fitView,
    /** The presenter's camera: glide to the whole lobule ('fit') or close in on a portal tract ('triad'), the
     *  sinusoids between it and the centre ('sinusoid') or the central vein ('central'), zoom × the framing. */
    focusOn(part, { zoom = 2, ms = 1400 } = {}) {
      if (!geo || sinTo) return false;
      const F0 = fitV(); kFit = F0.k;
      const to = !part || part === 'fit' ? F0 : framing(part, zoom);
      const moved = Math.abs(V.k - to.k) + Math.abs(V.x - to.x) + Math.abs(V.y - to.y) > 0.5;
      atFit = !part || part === 'fit'; camHeld = false; glideTo(to, ms, true, atFit ? null : { part, zoom, to });
      return moved;
    },
    /** Before (or during) the dive into the lobule: where a presenter slide will want it, so the dive lands there
     *  (no stop at the fit on the way). Mid-dive, the labels stay hidden until focusOn has taken it there. */
    aim(part, { zoom = 2 } = {}) {
      const want = { part: part || 'fit', zoom };
      // Already diving to an aim (a newer slide arrived on the way): that landing stands, unlabelled, and focusOn moves on from it.
      if (aimed && fade <= 0.98) {
        if (aimed.part === want.part && aimed.zoom === want.zoom) return;
        camMove = camHeld = true; el.classList.remove('lz-cam-in'); el.classList.add('lz-cam'); return;
      }
      aimed = want;
    },
    viewKey: () => `${V.k.toFixed(3)},${V.x.toFixed(1)},${V.y.toFixed(1)}|${geoKey}`,
    /** For the checks: the spot at the middle of the free space (lobule radii from its centre) and the zoom against the framing. */
    spot: () => (geo ? viewSpot() : null),
    /** For the checks: a "Colored by" crossfade is under way (0 … 1 through it), or null. */
    lensFade: () => (lensFrom ? Math.min(1, (performance.now() - lensT0) / LENS_FADE) : null),
    /** For the checks: bytes held in the lobule's bitmaps (its canvases, world bitmap and field tiles). */
    memBytes(detail = false) {
      const b = (cv) => (cv ? cv.width * cv.height * 4 : 0);
      const d = { canvases: b(tissue) + b(diveCv) + b(glCv) + b(fx) + b(field), world: b(worldCv), tiles: 0, worldDraws, tileSets: tileSets.size };
      for (const tiles of tileSets.values()) for (const q of tiles) d.tiles += b(q.cv) + b(q.quiet?.cv) + b(q.liverQ?.cv);
      return detail ? d : d.canvases + d.world + d.tiles;
    },
    /** For the checks: how many times the labels have been placed in full (a pan should only carry them along). */
    labelLayouts: () => layoutN,
    /** For the checks: the effects layer drawn as a frame draws it (the eraser and lining only where they reach the screen), then
     *  with all of them: how many bytes differ (0 when nothing on the screen was left out). Drawn at rest (no step in the drops' motion). */
    fxCheck() {
      if (!geo || !model || fade <= 0.98 || !fx.width) return null;
      const rect = host.getBoundingClientRect(), W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(saver() ? 1 : 2, devicePixelRatio || 1), flat = !gl || gl.lost, c = fx.getContext('2d');
      const read = () => { fxDrawn = ''; paintFx(W, H, dpr, isDark(), 0, flat); return c.getImageData(0, 0, fx.width, fx.height).data; };
      const a = read();
      fxAll = true;
      const b = read();
      fxAll = false;
      let differ = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
      return { bytes: a.length, differ, lymph: lymphOn };
    },
    isOpen: () => fade > 0.98,
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
      const at = (p) => { const [x, y] = toScreen(p); return [x + r.left, y + r.top]; };
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
    setLobe,
  };
  return api;
}
