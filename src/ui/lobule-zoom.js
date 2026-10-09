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

import { runFlick, FLICK } from './flick.js?v=2576a4bc70';
import { store } from './store.js?v=edbdbfb0c8';
import { radiiChanged } from './lobule-render-cache.js?v=07951b5935';
import { lobuleState, lymphRate, LOBE } from './lobule-model.js?v=dd2bf5fddf';
import { h, s, fmt, clamp, createEaser, systemEdge } from './util.js?v=e803df99cd';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor } from './colormap.js?v=6d64a94345';
import { NODES, EDGES } from '../engine/topology.js?v=dc393aabea';
import { createVeinsGL, binVeins, N_SAMPLES, TUBE_TEXELS, FLOW_TEXELS, MAX_TIERS, F_SEL, F_DIFFUSE, F_SHADOW, F_SPEC, F_EDGE, ORIGIN_GREY } from './veins-gl.js?v=e944e0d434';
import { SLOT, PERIOD, originFractions, ORIGIN_N } from './blood.js?v=6c39f43ddf';
import { createSinusoidView } from './sinusoid-view.js?v=49e7a24214';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const TAU = Math.PI * 2;
const N = N_SAMPLES;
const MAXT = 320;                       // GPU rows: the lobule has ~170 vessels, ~285 with the lymphatics
const LIGHT = (() => { const n = Math.hypot(-0.42, -0.91); return [-0.42 / n, -0.91 / n]; })();
const BLOOD = {
  originCol: [[0.9, 0.6, 0.16], [0.09, 0.62, 0.55], [0.49, 0.36, 0.86], [0.84, 0.2, 0.28], [0.44, 0.56, 0.75]],
  dyeCol: [0.78, 0.96, 0.2], inkLight: [1, 1, 1], inkDark: [0.07, 0.08, 0.15], revCol: [1, 0.55, 0.16], chevInk: [0.08, 0.08, 0.1],
};
const ZONE_RGB = [[232, 104, 84], [214, 160, 92], [124, 98, 206]];   // zone 1 (oxygen-rich) → zone 3
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
  rgbCtx.fillStyle = '#000'; rgbCtx.fillStyle = c || '#000';
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
  c.fillStyle = `rgba(96, 58, 92, ${0.32 * a})`;
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

export function createLobuleZoom({ host }) {
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
    requestAnimationFrame(refit);
  };
  store.on('lobuleLayers', () => syncLayers());

  const phoneMQ = matchMedia('(max-width: 720px)');
  const el = h('div', { class: 'lz', 'aria-hidden': 'true' }, tissue, glCv, fx, leaders, labels);
  // The dive's field (below the view): the liver's lobules, many and small, that the camera falls through.
  const field = h('canvas', { class: 'lz-canvas lz-field', 'aria-hidden': 'true' });
  host.append(field, el);

  // ── The view: the lobule framed in the space the floating pieces leave (top bar, dock, cards and
  // its own card), free zoom up to 5× that, the pan held to this lobule. Zooming out stops at the framing.
  const V = { k: 1, x: 0, y: 0 };
  const KMAX = 5;
  let kFit = 1, atFit = true;
  const appStyle = document.getElementById('app')?.style;
  const cssN = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  function freeRect() {
    const W = geo.W, H = geo.H, phone = phoneMQ.matches;
    let t = cssN('--top-safe') + cssN('--cmp-h') + 8, b = H - (cssN('--bot-occ') || 100) - 8, l = 12, r = W - cssN('--right-occ') - 12;
    // The zoom buttons: on a phone they sit top right beside the Zones and Lymph switches, so the labels start below them.
    const zp = phone && document.getElementById('zoomPill');
    if (phone) {
      const hr = el.getBoundingClientRect(), q = zp && zp.offsetHeight ? zp.getBoundingClientRect() : null;
      // (While the view is still opening they have not moved up yet: keep their row free anyway.)
      t = q && q.top - hr.top < H / 2 ? Math.max(t, q.bottom - hr.top + 14) : t + 52;
    }
    // The bottom stays above the vitals dock. With no room left, layoutLabels hides the labels rather than set them under it.
    return { l, t, r: Math.max(l + 80, r), b };
  }
  // The lobule and its labels' places, in world units.
  const frameBox = () => {
    const { cx, cy, R } = geo, ph = phoneMQ.matches;
    return ph ? [cx - 1.05 * R, cy - 0.98 * R, cx + 1.05 * R, cy + 1.22 * R] : [cx - 1.52 * R, cy - 1.16 * R, cx + 1.52 * R, cy + 1.02 * R];
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
    stopInertia(); cancelAnimationFrame(glide); rubber = true; atFit = false;
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
  function stopInertia() { cancelFlick?.(); cancelFlick = null; }
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
  let glide = 0;
  function glideTo(to, ms = 260) {
    stopInertia();
    cancelAnimationFrame(glide);
    const from = { ...V }, t0 = performance.now();
    if (reduce.matches || !fade) { Object.assign(V, to); viewChanged(); return; }
    const step = (now) => {
      const u = clamp((now - t0) / ms, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const k = from.k * Math.pow(to.k / from.k, e), a = (k - from.k) / ((to.k - from.k) || 1);
      V.k = k; V.x = from.x + (to.x - from.x) * (to.k === from.k ? e : a); V.y = from.y + (to.y - from.y) * (to.k === from.k ? e : a);
      viewChanged();
      if (u < 1) glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }
  let outHandler = null;
  function zoomBy(factor) {
    if (!geo) return;
    if (sinTo) return;   // in the sinusoid: only the view switch goes back up to the lobule
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
    refitLater = false; const F0 = fitV(); kFit = F0.k; if (atFit) glideTo(F0); else { clampV(); viewChanged(); } }
  addEventListener('pps:occ', () => { if (fade > 0) { layoutKey = ''; refit(); } });
  addEventListener('pps:labelscale', () => { drawVersion++; layoutKey = ''; if (!raf && fade > 0) raf = requestAnimationFrame(loop); });
  const viewChanged = () => { drawVersion++; tissueKey = ''; layoutKey = ''; if (!raf && fade > 0) raf = requestAnimationFrame(loop); };
  const toWorld = (p) => [(p[0] - V.x) / V.k, (p[1] - V.y) / V.k];
  const toScreen = (p) => [p[0] * V.k + V.x, p[1] * V.k + V.y];
  function resetView() { stopInertia(); if (!geo) { V.k = 1; V.x = 0; V.y = 0; return; } atFit = true; const F0 = fitV(); kFit = F0.k; Object.assign(V, F0); viewChanged(); }
  function fitView() { if (sinTo) return; atFit = true; const F0 = fitV(); kFit = F0.k; glideTo(F0); }

  // ── Gestures: wheel and pinch zoom, drag pans, a tap selects; out past 1× returns to the liver ──
  // As on the anatomy: a mouse wheel zooms about the pointer; a trackpad's two-finger scroll pans (once zoomed in)
  // and its pinch (ctrlKey) zooms; Ctrl/⌘ + wheel always zooms. A gesture is classified once, as it starts.
  let wheelKind = null, wheelAt = 0, wheelOutOK = false, wheelDir = 0;
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    stopInertia();
    cancelAnimationFrame(glide);   // a button's glide never fights the hand
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
    cancelAnimationFrame(glide);
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
          cancelAnimationFrame(glide); rubber = true; o[0] += p[0] - drag.p[0]; o[1] += p[1] - drag.p[1];
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
      select(down.label ? hitKind(down.label) : hit(w[0], w[1]), w);
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
  store.on('selection', () => { attrKey = ''; tissueKey = ''; if (!raf && fade > 0) raf = requestAnimationFrame(loop); });
  // Pinning a moment puts the Then / Now / Change switch over the top: the lobule frames itself below it.
  store.on('compareSnap', () => requestAnimationFrame(() => { if (geo && fade > 0) { layoutKey = ''; refit(); } }));

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
  store.on('*', () => { drawVersion++; });
  let gl = null, glTried = false, binKey = '', binReach = [], radKey = [], radAll = '', attrKey = '', drawKey = '', glDirty = true, tissueKey = '', worldKey = '', layoutKey = '';
  const worldCv = document.createElement('canvas');   // the lobule's tissue in world space (see paintTissue)
  const tubeData = new Float32Array(MAXT * TUBE_TEXELS * 4), flowData = new Float32Array(MAXT * FLOW_TEXELS * 4);
  let clock = 0, origins = null, originsF = null;
  const pc = (p) => (model?.hide ? '#A0939C' : pressureColor(p));

  function ensureGL() {
    if (glTried) return gl;
    glTried = true;
    gl = createVeinsGL(glCv, { tubes: MAXT, force: true });
    el.dataset.vessels = gl ? 'webgl2' : 'flat';
    if (!gl) { glCv.remove(); return null; }
    glCv.addEventListener('webglcontextrestored', () => { glTried = false; gl = null; binKey = ''; radKey = []; radAll = ''; attrKey = ''; ensureGL(); if (F) update(F); });
    return gl;
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
    const rs0 = clamp(R * 0.0085, 1.7, 3);     // sinusoid lumen (healthy)
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
      join(st.p[0], st.p[1], [st.inl, t], rs0);
    });
    n1.forEach((p, m) => { const t = add('s1', radial(p, n2[Math.min(n2.length - 1, m >> 1)], amp), { lvl: 1 }); L1.push(t); join(p[0], p[1], [L0[2 * m], L0[2 * m + 1], t], rs0); L0[2 * m].parent = L0[2 * m + 1].parent = t.id; });
    // An odd first-generation node (6 per edge) joins its neighbour's second-generation course.
    n2.forEach((p, m) => {
      const [, a] = polar(...p);
      const t = add('s2', radial(p, [cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn], amp * 0.6), { lvl: 2 });
      L2.push(t);
      const kids = L1.filter((_, j) => Math.min(n2.length - 1, j >> 1) === m);
      join(p[0], p[1], [...kids.slice(0, 3), t], rs0);
      for (const k of kids) k.parent = t.id;
    });
    // Anastomoses: short cross-links between neighbouring sinusoids that do not merge.
    const link = (a, b, ua, ub, lvl) => {
      const pa = at(a.pts, ua), pb = at(b.pts, ub);
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > R * 0.24) return;
      const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, k = (r() - 0.5) * 0.25;
      const t = add('an', curve((u) => [lerp(pa[0], pb[0], u) + (pb[1] - pa[1]) * k * Math.sin(Math.PI * u), lerp(pa[1], pb[1], u) - (pb[0] - pa[0]) * k * Math.sin(Math.PI * u)]), { lvl, sign: r() < 0.5 ? -1 : 1, mid: [mx, my] });
      join(pa[0], pa[1], [a, t], rs0 * 0.7); join(pb[0], pb[1], [b, t], rs0 * 0.7);
    };
    for (let m = 0; m < L0.length / 2; m++) link(L0[2 * m + 1], L0[(2 * m + 2) % L0.length], 0.35 + r() * 0.25, 0.35 + r() * 0.25, 0);
    for (let m = 0; m < L1.length; m += 2) if (L1[m + 1] && L1[m + 2]) link(L1[m + 1], L1[(m + 2) % L1.length], 0.4 + r() * 0.2, 0.4 + r() * 0.2, 1);
    // Central vein (end-on), with the third generation entering it.
    const cv = add('cv', dot(cx, cy));
    for (const t of L2) { const [, a] = polar(...t.pts[0]); join(cx + Math.cos(a) * rcv0, cy + Math.sin(a) * rcv0, [t, cv], rs0 * 1.3); }
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
    const sinP = [...L0, ...L1, ...L2].map((t) => ({ rs: rs0 * (t.kind === 's0' ? 1 : t.kind === 's1' ? 1.15 : 1.3), P: t.pts.map(([x, y]) => polar(x, y)) }));
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
      hsc.push({ x: x - (dy / l) * sd * rs0 * 1.9, y: y + (dx / l) * sd * rs0 * 1.9, a: Math.atan2(dy, dx), nx: (-dy / l) * sd, ny: (dx / l) * sd });
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
    const lyOff = rs0 * 2.1;
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
    if (fade <= 0) return;
    const st = store.get();
    // Pressures ease toward the model's beat-filtered values (shared with the Pressure card), so the
    // ladder, labels and colors glide rather than jump, every display frame between model frames.
    const eased = easeP.step(f.Pf || f.P);
    model = lobuleState({ ...f, P: eased.v }, st);
    cancelAnimationFrame(easeRaf);
    if (eased.moving) easeRaf = requestAnimationFrame(glideP);
    const hs = getComputedStyle(host), cv = (n, d) => hs.getPropertyValue(n).trim() || d;
    model.inks = { normal: cv('--flow-normal', '#16988F'), reversed: cv('--flow-reversed', '#EC7424'), portal: cv('--vein-portal', '#7B6FC4'), systemic: cv('--vein-systemic', '#4F8CC9') };
    if (originOn() && originsF !== f) { origins = originFractions(EDGES, NODES, f.Qf || f.Q, f.Pf || f.P); originsF = f; }
    panel();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  const originOn = () => !store.get().imaging && store.get().colorMode === 'origin';
  // Between model frames only the pressures move: re-ease them and redraw the panel, nothing else.
  function glideP() {
    if (!F || fade <= 0 || !model) return;
    const eased = easeP.step(F.Pf || F.P);
    const inks = model.inks;
    drawVersion++;
    model = lobuleState({ ...F, P: eased.v }, store.get());
    model.inks = inks;
    panel();
    if (eased.moving) easeRaf = requestAnimationFrame(glideP);
  }

  function panel() {
    const m = model;
    tissue.setAttribute('aria-label', m.hide ? 'Liver lobule. Pressures not measured.'
      : `Liver lobule: portal venule ${fmt(m.P1, 1)}, sinusoids ${fmt(m.P2, 1)}, central venule ${fmt(m.P3, 1)} millimeters of mercury; sinusoidal flow ${Math.round(m.flow * 100)} percent of normal.`);
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
    setLab('cv', 'Central venule', 'Central venule', ...mv('cv', m.P3, m.R[2]));
    // Lymph (Lymph layer on): the whole liver's rate and its protein; the change from healthy is on its card.
    if (m.hide) setLab('lymph', 'Lymphatic', 'Lymph', '?', '', '', null);
    else setLab('lymph', 'Lymphatic', 'Lymph', fmt(m.lymph, 1), `mL/min · protein ${Math.round(m.lyProt * 100)}%`, '', null);
    if (sinTo || sinU > 0) sv.setModel(m);
  }

  // ── Station labels (HTML, styled as the anatomy's) with leaders ──
  const labs = {}, badges = {};
  function setLab(key, name, short, v, u, d, col) {
    let L = labs[key];
    if (!L) {
      L = labs[key] = { el: h('button', { class: 'lz-lab', type: 'button' }), line: s('line', { class: 'leader' }), dotEl: s('circle', { class: 'leader-dot', r: 3 }) };
      L.el.addEventListener('click', (ev) => { if (!geo || ev.detail !== 0) return; const q = anchorOf(key); select(hitKind(key), [q[0], q[1]]); });
      labels.append(L.el); leaders.append(L.line, L.dotEl);
    }
    const txt = `${name}|${v}|${u}|${d}|${col}`;
    if (L.txt !== txt) {
      L.txt = txt;
      L.el.style.setProperty('--sw', col || 'var(--border-strong)');
      L.el.replaceChildren(h('span', { class: 'n' }, h('span', { class: 'n-long' }, name), h('span', { class: 'n-short' }, short)),
        h('span', { class: 'v' }, h('b', {}, v), u ? h('small', {}, u) : null, d ? h('span', { class: 'd' }, d) : null));
      L.el.setAttribute('aria-label', `${name} ${v} ${u}${d ? `, ${d.startsWith('▲') ? 'up' : 'down'} ${d.slice(2)} ${model?.cmp ? 'since then' : 'from healthy'}` : ''}. Show details`);
      layoutKey = '';
    }
  }
  // Which portal venule and which sinusoid carry the label: at first the left portal venule and the
  // sinusoid just below the middle of the left side; as the view is zoomed or panned, the label stays
  // on its vessel while that is comfortably in view, and otherwise moves to the one in view nearest
  // the middle of the free space (so it does not jump about).
  const pick = { triad: 3, lt: null, sin: null, geo: null };
  const sinAt = (t) => at(t.pts, 0.45);
  const anchorOf = (key) => {
    const g = geo, C = g.lobules[0].corners;
    if (key === 'triad') return C[pick.triad];
    if (key === 'cv') return [g.cx, g.cy];
    if (key === 'lymph') return g.triads[pick.lt ?? pick.triad].lv.pts[0];
    return sinAt(sinTube());
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
    const best = (cands, posOf, avoid) => {
      let b = null, bs = Infinity;
      for (const c of cands) {
        const p = posOf(c);
        if (!inside(p, 72)) continue;
        // Kept clear of the other labelled vessels, so the labels do not crowd each other.
        const sc = far(p) + avoid.reduce((a, q) => { const [x0, y0] = toScreen(p), [x1, y1] = toScreen(q), d = Math.hypot(x1 - x0, y1 - y0); return a + Math.max(0, 110 - d) * 3; }, 0);
        if (sc < bs) { bs = sc; b = c; }
      }
      return b;
    };
    // Framed to fit, the default pick stays wherever its vessel is in view (a lobule that fills a phone's width has its corners at the edge).
    const keep = atFit ? 4 : 36;
    if (!inside(C[pick.triad], keep)) { const i = best([0, 1, 2, 3, 4, 5], (i) => C[i], [[g.cx, g.cy]]); if (i != null) pick.triad = i; }
    if (!inside(sinAt(sinTube()), keep)) { const t = best([...g.L0, ...g.L1, ...g.L2], sinAt, [[g.cx, g.cy], C[pick.triad]]); if (t) pick.sin = t.id; }
  }
  const hitKind = (key) => (key === 'triad' ? { part: 'triad', tri: pick.triad } : key === 'cv' ? { part: 'cv' } : key === 'lymph' ? { part: 'lv', tri: pick.lt ?? pick.triad } : { part: 'sin', tube: sinTube().id });
  function layoutLabels() {
    const fr0 = freeRect(), g = geo, key = `${g.W}x${g.H}|${Object.values(labs).map((l) => l.txt).join('|')}|${zonesOn}|${lymphOn}|${V.k},${V.x},${V.y}|${fr0.t},${fr0.b},${fr0.l},${fr0.r}`;
    if (key === layoutKey) return;
    layoutKey = key;
    pickAnchors(fr0);
    leaders.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    const { R, cx, cy } = g;
    // Direct labels for the portal venule and sinusoids. Only the central venule
    // needs a leader; its endpoint is the label's centre, behind the text halo.
    // Score nearby placements together so zooming, panning and narrow screens do not stack labels.
    const fr = fr0, placed = [];
    const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l))
      * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    if (zonesOn) {
      const ap = R * 0.866, zk = clamp((R * V.k) / 300, 0.66, 1.15);
      for (const q of [0.83, 0.51, 0.2]) {
        const [x, y] = toScreen([cx, cy + ap * q]);
        placed.push({ l: x - 46 * zk, r: x + 46 * zk, t: y - 18 * zk, b: y + 18 * zk });
      }
    }
    if (lymphOn) {
      // The lymph label follows whichever lymphatic is in view (the picked triad's first, else the one nearest the middle).
      const mx = (fr0.l + fr0.r) / 2, my = (fr0.t + fr0.b) / 2, edge = (p) => { const [x, y] = toScreen(p); return x > 0 && x < g.W && y > 0 && y < g.H; };
      const dist = (i) => { const [x, y] = toScreen(g.triads[i].lv.pts[0]); return Math.hypot(x - mx, y - my); };
      const vis = [0, 1, 2, 3, 4, 5].filter((i) => edge(g.triads[i].lv.pts[0]));
      pick.lt = vis.includes(pick.lt ?? pick.triad) ? (pick.lt ?? pick.triad) : vis.sort((a, b) => dist(a) - dist(b))[0] ?? null;
      if (pick.lt == null) pick.lt = pick.triad;
    }
    for (const k of ['cv', 'sin', 'triad', 'lymph']) {
      const L = labs[k];
      if (!L) continue;
      if (k === 'lymph' && !lymphOn) { L.el.hidden = true; L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      L.el.hidden = false;
      const w = L.el.offsetWidth || 100, hh = L.el.offsetHeight || 40;
      const a = toScreen(anchorOf(k));
      const outside = k === 'lymph' ? a[0] < 0 || a[0] > g.W || a[1] < 0 || a[1] > g.H : a[0] < fr.l - 4 || a[0] > fr.r + 4 || a[1] < fr.t - 4 || a[1] > fr.b + 4;
      L.el.hidden = outside || fr.r - fr.l < w + 16 || fr.b - fr.t < hh + 16;
      if (L.el.hidden) { L.line.style.display = L.dotEl.style.display = 'none'; continue; }
      const pad = 8, step = hh + 12;
      const preferred = k === 'cv' ? [a[0], a[1] - g.rcv0 * V.k - hh / 2 - 12]
        : k === 'triad' ? [a[0], a[1] + hh / 2 + 12] : k === 'lymph' ? [a[0], a[1] - hh / 2 - 14] : a;
      const candidates = [preferred,
        [preferred[0], preferred[1] - step], [preferred[0], preferred[1] + step],
        [preferred[0] - w / 2 - 12, preferred[1]], [preferred[0] + w / 2 + 12, preferred[1]],
        [preferred[0], preferred[1] - 2 * step], [preferred[0], preferred[1] + 2 * step]];
      let best = null;
      for (const [px, py] of candidates) {
        const x = clamp(px, fr.l + w / 2 + pad, fr.r - w / 2 - pad);
        const y = clamp(py, fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
        const box = { l: x - w / 2 - 6, r: x + w / 2 + 6, t: y - hh / 2 - 6, b: y + hh / 2 + 6 };
        const cost = placed.reduce((sum, other) => sum + overlap(box, other) * 100, 0)
          + Math.hypot(x - preferred[0], y - preferred[1]);
        if (!best || cost < best.cost) best = { x, y, box, cost };
      }
      const { x, y, box } = best;
      placed.push(box);
      L.el.style.left = `${x - w / 2}px`; L.el.style.top = `${y - hh / 2}px`;
      L.el.classList.toggle('direct', k !== 'cv' && k !== 'lymph');
      L.el.classList.remove('left');
      const leaderOn = k === 'cv' || k === 'lymph';
      L.line.style.display = L.dotEl.style.display = leaderOn ? '' : 'none';
      L.line.setAttribute('x1', a[0]); L.line.setAttribute('y1', a[1]);
      L.line.setAttribute('x2', x); L.line.setAttribute('y2', y);
      L.dotEl.setAttribute('cx', a[0]); L.dotEl.setAttribute('cy', a[1]);
    }
    // Zone names written in the bands themselves, as the organs are named on the anatomy: quiet capitals in each
    // zone's color, on the radius to the flat bottom edge, so each name runs along its band.
    labels.querySelectorAll('.lz-zone').forEach((z) => z.remove());
    if (zonesOn) {
      const a = Math.PI / 2, ap = R * 0.866;
      // In proportion to the lobule on screen (within limits, so they stay legible and never shout).
      const zk = clamp((R * V.k) / 300, 0.66, 1.15).toFixed(3);
      [[0.83, 'Zone 1', 'periportal'], [0.51, 'Zone 2', 'midzonal'], [0.2, 'Zone 3', 'centrilobular']].forEach(([q, t, d], i) => {
        const z = h('div', { class: 'lz-zone z' + (i + 1), 'aria-hidden': 'true' }, h('b', {}, t), h('span', {}, d));
        // Its usual spot (on the radius to the flat bottom edge); if that is out of view, the nearest in-view spot
        // of the same zone (the same ring, at the other five sides and corners), else clamped to the free edge.
        const ring = [];
        for (let k = 0; k < 6; k++) { const th = a + k * Math.PI / 3; ring.push([cx + Math.cos(th) * ap * q, cy + Math.sin(th) * ap * q], [cx + Math.cos(th + Math.PI / 6) * R * q * 0.95, cy + Math.sin(th + Math.PI / 6) * R * q * 0.95]);
        }
        const inV = ([x, y]) => x > fr0.l + 40 && x < fr0.r - 40 && y > fr0.t + 20 && y < fr0.b - 20;
        const mid = [(fr0.l + fr0.r) / 2, (fr0.t + fr0.b) / 2];
        let [zx, zy] = toScreen(ring[0]);
        if (!inV([zx, zy])) {
          const ok = ring.map(toScreen).filter(inV).sort((u, v) => Math.hypot(u[0] - mid[0], u[1] - mid[1]) - Math.hypot(v[0] - mid[0], v[1] - mid[1]))[0];
          if (ok) [zx, zy] = ok; else { zx = clamp(zx, fr0.l + 40, fr0.r - 40); zy = clamp(zy, fr0.t + 20, fr0.b - 20); }
        }
        z.style.left = `${zx}px`; z.style.top = `${zy}px`; z.style.setProperty('--zk', zk);
        labels.append(z);
      });
    }
  }

  // ── Frame loop ──
  function loop(now) {
    raf = 0;
    if (fade <= 0 || !model) return;
    const soft = !!gl?.software;
    if (soft && now - lastPaint < 110) { raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; lastPaint = now;
    const st = store.get(), moving = st.running && !reduce.matches;
    if (moving) clock = (clock + dt) % 10000;
    rzMoving = easeRadii(dt);
    if (rzMoving) drawVersion++;   // a caliber still easing: redraw this frame
    const drew = draw(moving ? dt : 0);
    // Resolution follows the frame time: when frames that redraw arrive late the lobule is drawn smaller (a step at a
    // time, not more often than every half second) and it grows back once there is room.
    if (drew && prevDrew && !soft && dt < 0.1) {
      // Hysteresis: a sustained trend of about a second before the scale moves, and then not more than once a second.
      gapAvg += (dt * 1000 - gapAvg) * 0.1;
      slowMs = gapAvg > 21 ? slowMs + dt * 1000 : 0; fastMs = gapAvg < 14.5 ? fastMs + dt * 1000 : 0;
      if (now - resCheck > 1000) {
        if (slowMs > 1000 && lzRes > 0.6) { lzRes = Math.max(0.6, lzRes - 0.1); resCheck = now; slowMs = 0; idleDrawn = ''; }
        else if (fastMs > 2500 && lzRes < 1) { lzRes = Math.min(1, lzRes + 0.1); resCheck = now; fastMs = 0; idleDrawn = ''; }
      }
    }
    prevDrew = drew;
    raf = requestAnimationFrame(loop);
  }
  // The flow marks (shimmer and chevrons) fade out as the dive starts and back in once the lobule has landed, over about
  // 0.3 s each way. Ordinary panning and zooming inside the lobule view leave them alone.
  let flowA = 1, flowT = 0;
  function stepFlowA() {
    const now = performance.now(), dtm = Math.min(100, now - (flowT || now)); flowT = now;
    const open = fade > 0.98 && !diveScaled && sinU === 0;
    flowA = open ? Math.min(1, flowA + dtm / 300) : Math.max(0, flowA - dtm / 300);
  }
  let lzRes = 1, gapAvg = 16.7, resCheck = 0, prevDrew = false, slowMs = 0, fastMs = 0;

  // While the dive magnifies the lobule's layers (a compositor scale), they are drawn once and then left
  // alone: redrawing the WebGL vessels, the effects and the labels each frame, at full size, is what lagged.
  let diveScaled = false, diveDrawn = false;
  function draw(dt) {
    stepFlowA();
    const scaled = diveScaled || sinU > 0;   // the dive, or the zoom on into a sinusoid
    if (scaled && diveDrawn && flowA <= 0) return false;   // magnified by the compositor: nothing is redrawn once the marks have faded
    diveDrawn = scaled;
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    ensureGeo(W, H);
    const dpr = Math.min(2, devicePixelRatio || 1) * lzRes;
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
    if (key !== geoKey) { geo = build(W, H); geoKey = key; binKey = ''; binReach = []; binCache.clear(); radKey = []; radAll = ''; tissueKey = ''; layoutKey = ''; if (atFit) resetView(); else clampV(); }
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
  const fieldState = () => { const m = model || (F ? lobuleState(F, store.get()) : null); const q = (x) => Math.round((x || 0) * 8) / 8; return m ? { su: q(m.septU), pre: q(m.fibPre), post: q(m.fibPost), sin: q(m.fibSin), cong: q(m.congU) } : { su: 0, pre: 0, post: 0, sin: 0, cong: 0 }; };
  function fieldTile(cs, dark, rd) {
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const cell = v('--og-liver-1', '#E9C3B6'), gap = v('--og-liver-2', '#C98E7E'), cvc = v('--vein-systemic', '#4F8CC9'), pvc = v('--vein-portal', '#7D6FB6');
    const fs = fieldState();
    const key = [dark, cell, gap, cvc, pvc, Object.values(fs).join(',')].join('|');
    let tiles = tileSets.get(key);
    if (!tiles) { tiles = [6, 12, 24, 48, 96, 192, 384].map((R) => ({ R, cv: null })); tileSets.set(key, tiles); if (tileSets.size > 3) tileSets.delete(tileSets.keys().next().value); }
    else { tileSets.delete(key); tileSets.set(key, tiles); }
    const t = tiles.find((q) => q.R >= rd) || tiles[tiles.length - 1];
    if (!t.cv) drawTile(t, { cell, gap, cvc, pvc, art: v('--artery', '#C8414D'), duct: v('--bile-duct', '#6E9B4E'), dark, fs });
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
    const COL = dark ? 'rgb(199,186,153)' : 'rgb(237,222,186)', COLa = dark ? [0.78, 0.73, 0.6] : [0.93, 0.87, 0.73], edges = new Set();
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
        n.addColorStop(0, `rgba(140,40,60,${(0.55 * fs.cong).toFixed(3)})`); n.addColorStop(1, 'rgba(140,40,60,0)');
        c.fillStyle = n; c.fillRect(x - R, y - R, 2 * R, 2 * R);
      }
      // Sinusoids: from each edge's portal side toward the central vein, each with a slight bend;
      // capillarized, they turn pale.
      c.strokeStyle = fs.sin > 0.2 ? COL : gap; c.lineCap = 'round'; c.lineWidth = Math.max(0.5, R * (0.022 + 0.01 * fs.sin));
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
    c.globalCompositeOperation = 'saturation'; c.fillStyle = `rgba(128,128,128,${(0.45 * q).toFixed(3)})`; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over'; c.fillStyle = css(bg, 0.42 * q); c.fillRect(0, 0, w, h);
  }
  // A tile with fieldQuiet already applied (the lobule view's resting state), so panning and zooming
  // there fill one pattern instead of blending the whole screen each frame.
  function quietTile(t, bg) {
    const k = bg.join(',');
    if (t.quiet?.k === k) return t.quiet;
    // (the cache holds one tone at a time; the dive's liver tone is kept apart, see paintField)
    const cv = document.createElement('canvas'); cv.width = t.tw; cv.height = t.th;
    const c = cv.getContext('2d'); c.drawImage(t.cv, 0, 0); fieldQuiet(c, bg, 1, t.tw, t.th);
    return (t.quiet = { k, R: t.R, tw: t.tw, th: t.th, TW: t.TW, TH: t.TH, cv, pats: new WeakMap() });
  }
  // The surround fading into the page with distance from the lobule (q: 0..1, how far it has faded).
  function fieldFade(c, bg, x, y, rd, q, w, h) {
    const vg = c.createRadialGradient(x, y, rd * 1.1, x, y, rd * 3.2);
    vg.addColorStop(0, css(bg, 0)); vg.addColorStop(0.5, css(bg, 0.72 * q)); vg.addColorStop(1, css(bg, q));
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
  }
  // d: { a: opacity 0..1, x, y: where the settling lobule's centre is (stage px), r: its radius on
  // screen, ox, oy: the point it emerges from, quiet: 0..1, the surround fading into the page as the
  // lobule view does }. null hides it.
  // What a dive's frames share (the stage's size, its styles), read once per dive: reading them each
  // frame, after the stage's own writes, would make the browser lay out the page again every frame.
  let diveCtx = null;
  function paintField(d) {
    if (!d) diveCtx = null;
    if (!d || d.a <= 0.002) { if (field.width) { field.width = 0; field.height = 0; } field.style.opacity = '0'; fieldOp = 0; return; }
    if (!diveCtx) {
      const rect = host.getBoundingClientRect(), cs = getComputedStyle(host), dark = isDark();
      diveCtx = { W: Math.max(1, Math.round(rect.width)), H: Math.max(1, Math.round(rect.height)), cs, dark, bg: rgb01(cs.getPropertyValue('--stage-bg').trim() || cs.getPropertyValue('--bg').trim() || (dark ? '#0E1422' : '#FBFAF7')) };
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
    const lv = rgb01(cs.getPropertyValue('--og-liver-2').trim() || (dark ? '#5A3440' : '#C98E7E'));
    const tone = bg.map((x, i) => lerp(x, lv[i], 0.6));
    const tk = tone.map((x) => x.toFixed(2)).join(',');
    if (!t.liverQ || t.liverQ.k !== tk) {
      const cv = document.createElement('canvas'); cv.width = t.tw; cv.height = t.th;
      const cc = cv.getContext('2d'); cc.drawImage(t.cv, 0, 0); fieldQuiet(cc, tone, 1, t.tw, t.th);
      t.liverQ = { k: tk, R: t.R, tw: t.tw, th: t.th, TW: t.TW, TH: t.TH, cv, pats: new WeakMap() };
    }
    fieldFill(c, t.liverQ, d.x * dpr, d.y * dpr, rd, field.width, field.height);
    // Quieting: the pre-quieted tile laid over the plain one (two pattern fills, not a blend of the whole screen).
    if (d.quiet > 0) { c.globalAlpha = d.quiet; fieldFill(c, quietTile(t, bg), d.x * dpr, d.y * dpr, rd, field.width, field.height); c.globalAlpha = 1; fieldFade(c, bg, d.x * dpr, d.y * dpr, rd, d.quiet, field.width, field.height); }
    // Emerging: the field spreads out from the dive point as it fades in.
    if (d.a < 1) {
      const diag = Math.hypot(W, H) * dpr, rho = diag * (0.2 + 1.1 * d.a);
      const mg = c.createRadialGradient(d.ox * dpr, d.oy * dpr, rho * 0.35, d.ox * dpr, d.oy * dpr, rho);
      mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = mg; c.fillRect(0, 0, field.width, field.height);
      c.globalCompositeOperation = 'source-over';
    }
    fieldOp = Math.min(1, d.a * 1.25);
    field.style.opacity = fieldOp.toFixed(3);
  }
  let fieldOp = 0;
  // Before a dive: the work its frames would otherwise stall on, done a piece per frame while the
  // anatomy is still only being magnified (the vessels' WebGL, then the field's tiles up to the size
  // the dive ends at). warm() does the next piece; true while any is left.
  let warmQ = [];
  function prewarm(rEnd) {
    const cs = getComputedStyle(host), dark = isDark(), dpr = Math.min(1.5, devicePixelRatio || 1);
    warmQ = [() => ensureGL()];
    for (let rd = 8; rd < rEnd * dpr * 0.55 * 2; rd *= 2) { const r = rd; warmQ.push(() => fieldTile(cs, dark, r)); }
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
    const rs = g.rs0 / m.sin ** 0.12 * (1 + 1.5 * m.congU * z3);
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
    const m = model, M = m.mode;
    if (M === 'pressure' || M === 'delta' || M === 'heat') {
      const V = M === 'pressure' ? [m.P1, m.P2, m.P3].map(qP) : m.dP;
      const v = seg === 'pv' ? V[0] : seg === 'in' ? lerp(V[0], V[1], 0.6 * w) : seg === 'cv' ? V[2] : V[2] + (V[1] - V[2]) * w;
      return M === 'pressure' ? pressureColor(qP(v)) : M === 'delta' ? deltaColor(qP(v)) : heatColor(qP(v));
    }
    const e = seg === 'sin' ? 'sin' : seg === 'cv' ? 'post' : 'pre';
    switch (M) {
      case 'drop': return dropColor(e === 'pre' ? m.P1 - m.P2 : e === 'sin' ? m.P2 - m.P3 : m.P3 - m.P4);
      case 'direction': return m.rev[e] ? m.inks.reversed : m.inks.normal;
      case 'flow': return flowColor(Math.abs(m.Qs[e]) * 0.06);
      // Mean velocity as the anatomy has it for the liver's beds; in the sinusoids it rises toward the
      // central vein as they merge (the same ×1 → ×2 the moving blood shows).
      case 'velocity': return velocityColor(Math.abs(m.Qs[e]) * 0.6 * (seg === 'sin' ? lerp(1.35, 0.65, w) : 1));
      case 'neutral': {
        const a = rgb01(m.inks.portal), b = rgb01(m.inks.systemic), k = seg === 'cv' ? 1 : seg === 'sin' ? 1 - w : 0;
        return css(a.map((x, i) => lerp(x, b[i], k)));
      }
      default: return pressureColor(seg === 'pv' || seg === 'in' ? m.P1 : seg === 'cv' ? m.P3 : m.P3 + (m.P2 - m.P3) * w);
    }
  }
  const segOf = (t) => (t.kind === 'pv' || t.kind === 'in' || t.kind === 'cv' ? t.kind : 'sin');
  const tubeInk = (t, end) => {
    const sg = segOf(t), i = end ? N - 1 : 0;
    return ink(sg, sg === 'sin' ? sinW(t.rho[i]) : end ? 1 : 0);
  };

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
    if (dt === 0 || rzMoving || !attrKey || !radAll || bk !== binKey || dk !== drawKey || now - lastSurface >= 80) {
      lastSurface = now;
      // Radii, re-sent when a tube's caliber changed (they follow only these few model values).
      let reachGrew = false;
      const rk0 = Object.values(rzOf()).map((x) => x.toFixed(4)).join('|') + '|' + G.W + 'x' + G.H + '|' + lymphOn + '|' + (k * V.k).toFixed(3);
      if (rk0 !== radAll) for (const t of live) {
        const r = Array.from({ length: N }, (_, i) => radiusAt(t, i));
        t.maxR = Math.max(...r);
        if (radiiChanged(radKey[t.id], r, (rzMoving ? 0.08 : 0.35) / (k * V.k))) { radKey[t.id] = r; g.setRadii(t.id, r); glDirty = true; }
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
      const inks = new Map(live.map((t) => [t.id, [tubeInk(t, 0), tubeInk(t, 1)]]));
      const ak = [m.mode, [...inks.values()].flat().join(','), m.hide, origin, lymphOn, lyProt(m).toFixed(2), lyF(m).toFixed(2), [...selIdsN].join('.'), dark, cs.getPropertyValue('--artery')].join('|');
      if (ak !== attrKey) {
        attrKey = ak; glDirty = true;
        tubeData.fill(0);
        const art = rgb01(cs.getPropertyValue('--artery').trim() || '#C8414D'), grey = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];
        const LY = lyInk(m, dark);   // lymph: clear, a faint green (paler than the bile duct), deeper with more protein
        // The space of Disse fills as filtration rises: its tint deepens a little (it already widens).
        const deep = dark ? [0.62, 0.7, 0.58] : [0.79, 0.86, 0.74], LYd = LY.map((x, i) => lerp(x, deep[i], 0.45 * lyF(m)));
        for (const t of live) {
          const o = t.id * TUBE_TEXELS * 4, isArt = t.kind === 'ha' || t.kind === 'tw', isBd = t.kind === 'bd';
          const [i0, i1] = inks.get(t.id);
          const LYt = t.kind === 'ly' ? LYd : LY;
          const c0 = isBd ? BD_FILL : isArt ? art : t.lymph ? LYt : origin ? grey : rgb01(i0), c1 = isBd ? BD_FILL : isArt ? art : t.lymph ? LYt : origin ? grey : rgb01(i1);
          const alpha = (isArt ? 0.9 : 1) * (selIdsN.size && !selIdsN.has(t.id) ? 0.55 : 1);
          const big = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'in';
          // The triad's three vessels carry a dark outline of their own colour; the rest the common casing.
          const edge = EDGE[t.kind];
          const flags = (selIdsN.has(t.id) ? F_SEL : 0) | (edge ? F_EDGE : 0) | (isArt || isBd ? 0 : F_DIFFUSE | F_SHADOW | (big ? F_SPEC : 0));
          const z = { s0: 0.1, s1: 0.11, s2: 0.12, ly: 0.13, an: 0.09, lt: 0.25, in: 0.3, pv: 0.4, cv: 0.4, lv: 0.8, sh: 0.5, bd: 0.55, tw: 0.6, ha: 0.7 }[t.kind];
          tubeData.set([...c0, WALL[t.kind], ...c1, alpha, 1, z, flags, 0], o);
          tubeData.set([0, 1, t.len, 0], o + 20);
          if (edge) tubeData.set([...edge, 0], o + 24);
        }
        g.setTubes(tubeData);
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
      if (origin && origins && !t.lymph) { const kk = EI[oe]; for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = origins[kk * ORIGIN_N + c]; }
    }
    g.setFlow(flowData);
    const look = {
      shOff: [1.2, 2.2], light: LIGHT, reach: 11, heat: false, organs: 0,
      casing: [...triplet(cs, '--casing-rgb'), num(cs, '--casing-a', 0.56) * 0.8],
      shadow: [...triplet(cs, '--shadow-rgb'), num(cs, '--shadow-a', 0.15)],
      sheen: [...rgb01(cs.getPropertyValue('--light-ink').trim() || '#fff'), num(cs, '--tube-sheen', 0.42)],
      shade: [...rgb01(cs.getPropertyValue('--tube-shade-ink').trim() || '#0A0612'), num(cs, '--tube-shade', 0.2)],
      ring: [...rgb01(cs.getPropertyValue('--accent').trim() || '#3b6cf6'), 0.4],
      netAlpha: 1, fx: true, tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),
    };
    const blood = { alpha: flowA, on: bloodOn && flowA > 0.002, chev: chev && flowA > 0.002, look: b.look || 'shimmer', origin, clock, dye: false, bleed: [], ...BLOOD };
    if (glDirty || dk !== drawKey) { glDirty = false; drawKey = dk; g.draw(T, look, blood); } else g.composite(look, blood);
  }
  const num = (cs, n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
  const triplet = (cs, n) => { const k = cs.getPropertyValue(n).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };

  // ── Tissue: plates, collagen, zones, congestion (repainted only when the model changes it) ──
  function paintTissue(W, H, dpr, dark, cs, flatVessels) {
    const m = model, G = geo;
    const q = (v) => Math.round(v * 2) / 2;
    // The lobule itself is drawn once into a world-space bitmap (at a scale stepped in √2, never below
    // the screen's), redrawn only when the tissue's state changes; panning and zooming just place it.
    // Pressure colors enter only coarsely (they move every frame while the model glides).
    const qi = (s) => s.replace(/\d+/g, (n) => (n >> 4) << 4);
    const sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * V.k)) * 2) / 2), 3600 / (2.6 * G.R));
    const wk = [G.W, G.H, sc.toFixed(3), dark, qi(ink('pv')), m.zone.pre.toFixed(2), m.zone.sin.toFixed(2), m.zone.post.toFixed(2), m.s.toFixed(2), q(m.cong), m.hide, zonesOn, cs.getPropertyValue('--bg')].join('|');
    const key = [W, H, dpr, wk, flatVessels ? [ink('sin', 1), ink('sin', 0), ink('pv'), ink('cv'), m.art.toFixed(2), [...selIds()].join('.')] : '', Object.values(fieldState()).join(','), V.k.toFixed(3), V.x.toFixed(1), V.y.toFixed(1)].join('|');
    if (key === tissueKey) return;
    tissueKey = key;
    if (tissue.width !== W * dpr || tissue.height !== H * dpr) { tissue.width = W * dpr; tissue.height = H * dpr; }
    const c = tissue.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const bg = v('--stage-bg', v('--bg', dark ? '#0E1422' : '#FBFAF7'));
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const { R, cx, cy } = G;
    // The neighbours are the dive's field, carried on: the same tissue, in the same state, fading into
    // the page with distance from this lobule (so zooming out, they fade away completely).
    {
      c.setTransform(1, 0, 0, 1, 0, 0);
      const [sx, sy] = toScreen([cx, cy]), rd = R * V.k * dpr;
      fieldFill(c, quietTile(fieldTile(cs, dark, rd * 0.55), rgb01(bg)), sx * dpr, sy * dpr, rd, W * dpr, H * dpr);   // half resolution is plenty for the quiet surround
    }
    const B = 1.3 * R, bx = cx - B, by = cy - B;
    if (wk !== worldKey) {
      worldKey = wk;
      const n = Math.ceil(2 * B * sc);
      if (worldCv.width !== n || worldCv.height !== n) { worldCv.width = n; worldCv.height = n; }
      const w = worldCv.getContext('2d');
      w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, n, n);
      w.setTransform(sc, 0, 0, sc, -bx * sc, -by * sc);
      paintLobule(w, m, G, dark, cs, bg, v);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    { const [sx, sy] = toScreen([bx, by]); c.drawImage(worldCv, sx * dpr, sy * dpr, 2 * B * V.k * dpr, 2 * B * V.k * dpr); }
    // Focus: the surround fades into the page (as the dive's field does at its end).
    { c.setTransform(1, 0, 0, 1, 0, 0); const [sx, sy] = toScreen([cx, cy]); fieldFade(c, rgb01(bg), sx * dpr, sy * dpr, R * V.k * dpr, 1, W * dpr, H * dpr); c.setTransform(dpr * V.k, 0, 0, dpr * V.k, dpr * V.x, dpr * V.y); }
    if (flatVessels) paintFlatVessels(c, cs);
  }
  // The lobule in world space (plates, septa, tracts, lymph): drawn into the cached bitmap.
  function paintLobule(c, m, G, dark, cs, bg, v) {
    const { R, cx, cy, lobules } = G;
    { const l = lobules[0], bq = rgb01(bg); c.fillStyle = css(rgb01(v('--og-liver-2', dark ? '#5A3440' : '#C98E7E')).map((x, i) => lerp(bq[i], x, 0.55)), 1); c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * 1.015, py = l.y + (y - l.y) * 1.015; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); c.fill(); }
    const gap = rgb01(v('--og-liver-2', dark ? '#5A3440' : '#C98E7E')), cell = rgb01(v('--og-liver-1', dark ? '#85514F' : '#E9C3B6'));
    const COL = dark ? [0.78, 0.73, 0.6] : [0.93, 0.87, 0.73];
    const col = (a) => css(COL, a);
    const hexPath = (l, k = 1) => { c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * k, py = l.y + (y - l.y) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); };
    // The lobule's own plates: hepatocytes in radial cords, one cell thick.
    const main = lobules[0];
    hexPath(main); c.fillStyle = css(gap, dark ? 0.55 : 0.5); c.fill();
    c.save(); hexPath(main); c.clip();
    const cu = m.congU;
    for (const k of G.cells) {
      const z3 = k.q < 0.4, dead = z3 && cu > 0.12 && k.drop < cu * (1.25 - k.q * 1.6);
      const t = 0.88 + 0.12 * k.tone;
      const base = dark ? cell.map((x, i) => lerp(gap[i], x, 0.28)) : cell;
      const fill = dead ? (dark ? [0.42, 0.33, 0.3] : [0.93, 0.86, 0.72]) : base.map((x) => x * t + (1 - t) * (dark ? 0.15 : 1) * 0.3);
      // In cirrhosis the plates thicken and lose their order (regenerating nodules).
      const sj = m.septU, dz = sj * Math.min(k.l, k.w) * 0.45;
      c.save(); c.translate(k.x + k.jx * dz, k.y + k.jy * dz); c.rotate(k.a + k.ja * sj * 0.9);
      const lw = (dead ? k.l * 0.7 : k.l) * (1 + 0.12 * sj), ww = (dead ? k.w * 0.7 : k.w) * (1 + 0.3 * sj);
      c.fillStyle = css(fill, dead ? 0.6 : dark ? 0.8 : 0.92);
      c.beginPath(); c.roundRect(-lw / 2, -ww / 2, lw, ww, Math.min(lw, ww) * 0.38); c.fill();
      if (!dead) { c.fillStyle = dark ? 'rgba(30,14,28,.22)' : 'rgba(110,60,84,.22)'; c.beginPath(); c.arc(k.nu * lw, 0, Math.max(0.9, ww * 0.16), 0, TAU); c.fill(); }
      c.restore();
    }
    // Zone 3 congestion: blood pooling around the central vein (nutmeg).
    if (cu > 0.04) {
      const gr = c.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.55);
      gr.addColorStop(0, `rgba(128, 22, 44, ${0.5 * cu})`); gr.addColorStop(0.6, `rgba(128, 22, 44, ${0.22 * cu})`); gr.addColorStop(1, 'rgba(128, 22, 44, 0)');
      c.fillStyle = gr; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }
    // Zones of the acinus (toggle): hexagonal bands from the triads (1) to the central vein (3).
    if (zonesOn) {
      [[1, 0], [0.66, 1], [0.36, 2]].forEach(([k, i]) => { hexPath(main, k); c.fillStyle = `rgba(${ZONE_RGB[i].join(',')}, ${dark ? 0.2 : 0.17})`; c.fill(); });
      c.lineWidth = 1; c.strokeStyle = dark ? 'rgba(255,255,255,.3)' : 'rgba(60,40,60,.28)';
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
      const body = `rgba(150, 96, 62, ${(0.22 + 0.3 * a).toFixed(3)})`, nuc = `rgba(96, 54, 40, ${(0.3 + 0.3 * a).toFixed(3)})`;
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
      c.shadowColor = dark ? 'rgba(0,0,0,.5)' : 'rgba(110, 50, 50, .3)'; c.shadowBlur = R * 0.06 * su;   // nodules bulge beside the bands
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
      c.strokeStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(80,50,50,.14)'; c.lineWidth = 1;
      hexPath(lobules[0]); c.stroke();
    }
    // Portal tracts (connective tissue), thicker with portal fibrosis.
    const seen = new Set();
    for (const [x, y] of lobules[0].corners) {
      const kk = Math.round(x) + ',' + Math.round(y);
      if (seen.has(kk)) continue; seen.add(kk);
      const near = Math.hypot(x - cx, y - cy) < R * 1.05, rt = G.rt * (0.8 + 0.45 * scarGrowth(m.fibPre));
      c.globalAlpha = near ? 1 : 0.5;
      // Collagen expands asymmetrically around all three structures, continuous with the septa.
      if (m.fibPre > 0.03) {
        fibrousTract(c, x, y, rt, Math.atan2(y - cy, x - cx), COL, scarGrowth(m.fibPre),
          900 + lobules[0].corners.findIndex((p) => p[0] === x && p[1] === y) * 71);
      }
      if (!near) {   // the neighbours' triads, drawn flat
        c.fillStyle = css(rgb01(ink('pv')), 0.55); c.beginPath(); c.ellipse(x, y, G.rt * 0.42, G.rt * 0.32, 0.4, 0, TAU); c.fill();
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
    const G = geo, art = cs.getPropertyValue('--artery').trim() || '#C8414D', casing = 'rgba(30, 24, 40, .45)';
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const t of G.tubes) {
      const r = radiusAt(t, N >> 1), isArt = t.kind === 'ha' || t.kind === 'tw', disc = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd';
      const color = isArt ? art : t.kind === 'bd' ? '#7A7D3C' : tubeInk(t, 0), rim = EDGE[t.kind];
      const [x0, y0] = t.pts[0];
      if (disc) {
        c.fillStyle = rim ? `rgb(${rim.map((q) => Math.round(q * 255))})` : casing; c.beginPath(); c.arc(x0, y0, r + (rim ? 1.8 : 1.2), 0, TAU); c.fill();
        c.fillStyle = color; c.beginPath(); c.arc(x0, y0, r, 0, TAU); c.fill();
        continue;
      }
      const path = () => { c.beginPath(); t.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
      if (selIds().has(t.id)) { c.strokeStyle = 'rgba(59, 108, 246, .45)'; c.lineWidth = 2 * r + 7; path(); c.stroke(); }
      if (!isArt) { c.strokeStyle = casing; c.lineWidth = 2 * r + 2; path(); c.stroke(); }
      c.strokeStyle = color; c.lineWidth = 2 * r; path(); c.stroke();
    }
  }

  // ── Overlay: lymph droplets; without WebGL2, the red cells too ──
  function paintFx(W, H, dpr, dark, dt, flat) {
    if (fx.width !== W * dpr || fx.height !== H * dpr) { fx.width = W * dpr; fx.height = H * dpr; }
    const c = fx.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.setTransform(dpr * V.k, 0, 0, dpr * V.k, dpr * V.x, dpr * V.y);
    const G = geo, m = model;
    if (!m.hide) {
      // The bile ductule is lined all round by a simple cuboidal epithelium: wedge-shaped cells side by side
      // around an open lumen, each with a darker round nucleus.
      const dk = dark, cellFill = dk ? '#8E9150' : '#A3A55F', cellEdge = dk ? 'rgba(36, 38, 16, .55)' : 'rgba(66, 68, 28, .5)', nuc = dk ? '#3E4120' : '#5A5D2A', lumen = dk ? '#2C2F16' : '#6B6E36';
      const NC = 16, TAU2 = Math.PI * 2;
      c.lineWidth = Math.max(0.3, G.R * 0.0013); c.strokeStyle = cellEdge; c.globalAlpha = 0.72;   // a little faded, so the ductule sits back in the tract
      for (const tr of G.triads) {
        // One ring of NC cuboidal cells: as deep as they are wide, so each nucleus has room (a third of the cell's width).
        const r = Math.max(radiusAt(tr.bdT, N >> 1), G.R * 0.008), rm = r * 1.35, hw = Math.PI * rm / NC, rin = rm - hw, rout = rm + hw, x = tr.bd[0], y = tr.bd[1];
        c.fillStyle = lumen; c.beginPath(); c.arc(x, y, rin, 0, TAU2); c.fill();
        c.fillStyle = cellFill;
        for (let i = 0; i < NC; i++) {
          const a0 = (i / NC) * TAU2 + tr.i, a1 = ((i + 1) / NC) * TAU2 + tr.i;
          c.beginPath(); c.arc(x, y, rin, a0, a1); c.arc(x, y, rout, a1, a0, true); c.closePath(); c.fill(); c.stroke();
        }
        c.fillStyle = nuc; c.beginPath();
        const rn = rm, nr = hw * 0.34;   // diameter about a third of the cell's width
        for (let i = 0; i < NC; i++) { const a = ((i + 0.5) / NC) * TAU2 + tr.i, nx = x + Math.cos(a) * rn, ny = y + Math.sin(a) * rn; c.moveTo(nx + nr, ny); c.arc(nx, ny, nr, 0, TAU2); }
        c.fill();
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
      if (!dark) { c.shadowColor = 'rgba(60, 30, 50, .35)'; c.shadowBlur = 3; }
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
      c.fillStyle = dark ? 'rgba(214, 236, 204, .42)' : 'rgba(150, 186, 140, .42)';
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
      c.strokeStyle = dark ? 'rgba(20, 14, 4, .9)' : 'rgba(255, 255, 255, .95)';
      c.stroke();
      c.fillStyle = dark ? 'rgb(255, 196, 40)' : 'rgb(194, 82, 0)';
      c.fill();
      // The lymph runs beneath the blood: cut the drops away wherever a blood vessel (with its wall)
      // lies over them, so the arterioles, venules and sinusoids pass on top.
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = c.strokeStyle = '#000';
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const t of G.tubes) {
        if (t.lymph || t.kind === 'ly' || t.kind === 'lt' || t.kind === 'lv') continue;
        const wall = (WALL[t.kind] || 0.8) + 0.6 / V.k;
        if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd') {
          const [x0, y0] = t.pts[0];
          c.beginPath(); c.arc(x0, y0, radiusAt(t, N >> 1) + wall, 0, TAU); c.fill();
          continue;
        }
        // In thirds, each as wide as the lumen at its middle (the sinusoids widen toward the central vein).
        for (let q = 0; q < 3; q++) {
          const i0 = Math.floor((q * (N - 1)) / 3), i1 = Math.floor(((q + 1) * (N - 1)) / 3);
          c.lineWidth = 2 * (radiusAt(t, (i0 + i1) >> 1) + wall);
          c.beginPath(); c.moveTo(...t.pts[i0]);
          for (let i = i0 + 1; i <= i1; i++) c.lineTo(...t.pts[i]);
          c.stroke();
        }
      }
      c.restore();
      // The sinusoid lining: nothing extra while the fenestrae are open; a thin continuous collagen line
      // fades in as the sinusoids capillarize and hold protein back.
      if (seal > 0.02) {
        c.save();
        c.lineWidth = lw;
        c.strokeStyle = dark ? `rgba(232, 196, 140, ${(0.6 * seal).toFixed(3)})` : `rgba(150, 104, 40, ${(0.5 * seal).toFixed(3)})`;
        c.beginPath();
        for (const t of G.tubes) {
          if (t.kind !== 's0' && t.kind !== 's1' && t.kind !== 's2') continue;
          for (const side of [-1, 1]) {
            let on = false;
            t.pts.forEach(([x, y], i) => {
              if (t.rho[i] < CV_STOP) return;   // stops at the central vein's edge: no spokes into it
              const [xa, ya] = t.pts[Math.max(0, i - 1)], [xb, yb] = t.pts[Math.min(N - 1, i + 1)], d = Math.hypot(xb - xa, yb - ya) || 1;
              const o = side * (radiusAt(t, i) + lw);
              const px = x - ((yb - ya) / d) * o, py = y + ((xb - xa) / d) * o;
              if (on) c.lineTo(px, py); else { c.moveTo(px, py); on = true; }
            });
          }
        }
        c.stroke();
        c.restore();
      }
    }
    if (flat && !m.hide && store.get().layers?.flow !== false) {
      // Red cells along the sinusoids at the model's flow.
      c.fillStyle = dark ? 'rgba(255, 120, 140, .9)' : 'rgba(150, 18, 40, .8)';
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
  let sinU = 0, sinTo = 0, sinRaf = 0, sinDive = null, sinPick = null, quietSin = false;
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
    const u = sinU, D = sinDive, rm = reduce.matches;
    if (!D || u <= 0) {
      el.style.transform = ''; el.style.transformOrigin = ''; el.style.visibility = ''; el.classList.remove('lz-sin');
      sv.place({ opacity: 0 });
      return;
    }
    const g = rm ? 1 : easeIO(u);
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
  function resetSinusoid() { cancelAnimationFrame(sinRaf); sinU = 0; sinTo = 0; sinDive = null; placeSinusoid(); }
  function diveSinusoid(on) {
    if (quietSin) { sinTo = 0; cancelAnimationFrame(sinRaf); return; }   // the lobule view is closing: the sinusoid fades out with it
    if (on && (!geo || fade < 0.98 || !model || !sv.available)) { queueMicrotask(() => { if (store.get().sinusoid && !sinTo) store.set({ sinusoid: false }); }); return; }
    const to = on ? 1 : 0;
    if (to === sinTo && sinU === to) return;
    sinTo = to;
    if (on && sinU === 0) { sinPick = sinusoidPick(); sv.setModel(model); }
    // From a standstill the geometry is read afresh (the lobule may have been resized); reversing mid-way keeps it.
    if (sinU === 0 || sinU === 1) sinDive = diveGeometry();
    const sl = store.get().selection;
    if (sl && (on ? sl.type === 'lobule' : sl.type === 'sinusoid')) store.set({ selection: null });
    // On the way out the lobule is drawn once in its present state, so it does not change when it lands.
    if (!on) { diveDrawn = false; drawVersion++; tissueKey = ''; layoutKey = ''; }
    if (!raf && fade > 0) raf = requestAnimationFrame(loop);
    const from = sinU, ms = (reduce.matches ? 280 : on ? 1150 : 950) * Math.abs(to - from), t0 = performance.now();
    cancelAnimationFrame(sinRaf);
    const step = (now) => {
      const t = ms > 0 ? clamp((now - t0) / ms, 0, 1) : 1;
      sinU = lerp(from, to, t); placeSinusoid();
      if (t < 1) sinRaf = requestAnimationFrame(step);
      else if (!on) { sinDive = null; drawVersion++; if (!raf && fade > 0) raf = requestAnimationFrame(loop); if (refitLater) refit(); }
    };
    sinRaf = requestAnimationFrame(step);
  }
  store.on('sinusoid', (on) => diveSinusoid(!!on));
  store.on('lobule', (on) => { if (!on && store.get().sinusoid) { quietSin = true; store.set({ sinusoid: false }); quietSin = false; } });

  return {
    el,
    update,
    /** 0 = hidden, 1 = fully in the lobule. It fades in where it stands, over the dive's field. */
    setFade(u) {
      const was = fade;
      fade = clamp(u, 0, 1);
      el.style.opacity = fade.toFixed(3);
      // The tissue first, then its labels and card (and on the way out, those go first).
      const ch = clamp((fade - 0.55) / 0.45, 0, 1);
      el.style.setProperty('--lz-chrome', (ch * ch * (3 - 2 * ch)).toFixed(3));
      el.classList.toggle('on', fade > 0.98);
      el.setAttribute('aria-hidden', String(fade < 0.98));
      // Entering: the lobule is framed.
      if (fade > 0 && was === 0) { resetView(); if (F) update(F); }
      // Leaving the lobule closes a part's card, so it is not waiting next time.
      if (was > 0.98 && fade <= 0.98) { stopInertia(); if (store.get().selection?.type === 'lobule') store.set({ selection: null }); }
      if (fade === 0) { cancelAnimationFrame(raf); raf = 0; last = 0; }
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
    onZoomOut(fn) { outHandler = fn; },
    prewarm, warm,
    /** True once the dive's field (or the lobule) covers the anatomy, which then need not be drawn. */
    covers: () => fade > 0.98 || fieldOp >= 0.999,
    /** During the dive: the tissue (not its card) still zooming in, by k (≤ 1) about the stage point x, y. */
    setDiveZoom(k, x, y, tx = x, ty = y) {
      diveScaled = k < 0.9999; if (!diveScaled) diveDrawn = false;
      // Scaled down, the tissue's own page fill would show as a pale card; a soft round mask keeps only the lobule and its rim.
      const r = geo ? geo.R * V.k : 0, mask = k >= 0.9999 || !r ? '' : `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, #000 ${(r * 1.02).toFixed(1)}px, transparent ${(r * 1.2).toFixed(1)}px)`;
      for (const e of [tissue, glCv, fx, leaders, labels]) {
        if (e === tissue || e === glCv) { e.style.maskImage = mask; e.style.webkitMaskImage = mask; }
        if (k >= 0.9999) { e.style.transform = ''; e.style.transformOrigin = ''; continue; }
        // Scaled about its own centre, which sits where the field's lobule at the dive's focus is (tx, ty), so it morphs out of that one.
        e.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        e.style.transform = `translate(${(tx - x).toFixed(1)}px, ${(ty - y).toFixed(1)}px) scale(${k.toFixed(4)})`;
      }
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
    viewKey: () => `${V.k.toFixed(3)},${V.x.toFixed(1)},${V.y.toFixed(1)}|${geoKey}`,
    isOpen: () => fade > 0.98,
    isShown: () => fade > 0,
    setLobe,
  };
}
