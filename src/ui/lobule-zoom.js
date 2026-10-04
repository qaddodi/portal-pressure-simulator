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
// Teaching layers: Rappaport zones (toggle), hepatic lymph leaving the space of Disse for the portal
// tract (toggle, rate from the model), a pressure ladder (portal venule → sinusoids → central vein →
// hepatic vein → IVC, against the healthy ladder) that names where the resistance is, and a card for
// anything tapped (triad, inlet venule, sinusoid, arteriole, central vein, septum, hepatocytes).
// Without WebGL2 the vessels are drawn flat on the tissue canvas.

import { store, updateParams } from './store.js?v=f9424489c6';
import { lobuleState, lymphRate, LOBE } from './lobule-model.js?v=913fe4fa3c';
import { verbEnabled } from './actions.js?v=34bad803fc';
import { h, s, fmt, clamp, svgIcon } from './util.js?v=fe164f31f1';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor } from './colormap.js?v=6d64a94345';
import { NODES, EDGES } from '../engine/topology.js?v=29d10ad9ef';
import { createVeinsGL, binVeins, N_SAMPLES, TUBE_TEXELS, FLOW_TEXELS, MAX_TIERS, F_SEL, F_DIFFUSE, F_SHADOW, F_NOCASE, F_SPEC, ORIGIN_GREY } from './veins-gl.js?v=63596bcd73';
import { SLOT, PERIOD, originFractions, ORIGIN_N } from './blood.js?v=3acf4e936e';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const TAU = Math.PI * 2;
const N = N_SAMPLES;
const MAXT = 240;                       // GPU rows: the lobule has ~170 vessels
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

export function createLobuleZoom({ host }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const tissue = h('canvas', { class: 'lz-canvas', role: 'img', 'aria-label': 'Liver lobule microcirculation' });
  const glCv = h('canvas', { class: 'lz-canvas lz-gl', 'aria-hidden': 'true' });
  const fx = h('canvas', { class: 'lz-canvas lz-fx', 'aria-hidden': 'true' });
  const leaders = s('svg', { class: 'lz-leaders', 'aria-hidden': 'true' });
  const labels = h('div', { class: 'lz-labels' });

  // ── Controls ──
  let zonesOn = false, lymphOn = false;
  const toggle = (label, title, get, set) => {
    const b = h('button', { class: 'lz-tg', 'aria-pressed': 'false', title }, h('i', { 'aria-hidden': 'true' }), label);
    b.addEventListener('click', () => { set(!get()); b.setAttribute('aria-pressed', String(get())); tissueKey = ''; layoutKey = ''; if (F) update(F); });
    return b;
  };
  const zonesBtn = toggle('Zones', 'Show the zones of the acinus (1 periportal, 3 centrilobular)', () => zonesOn, (v) => { zonesOn = v; });
  const lymphBtn = toggle('Lymph', 'Show hepatic lymph forming in the space of Disse', () => lymphOn, (v) => { lymphOn = v; });
  zonesBtn.classList.add('zones'); lymphBtn.classList.add('lymph');

  const ladder = h('div', { class: 'lz-ladder' });
  const verdict = h('p', { class: 'lz-verdict' });
  const stats = h('dl', { class: 'lz-stats' });
  // Cirrhosis, here as on the liver's card (fibrosis by zone is on the triad, sinusoid and central vein cards).
  const cirIn = h('input', { type: 'range', min: 0, max: 1, step: 0.01, 'aria-label': 'Cirrhosis' });
  const cirVal = h('span', { class: 'ctl-val' });
  const cirBox = h('div', { class: 'lz-cir ac-slider' },
    h('div', { class: 'ctl-top' }, h('span', { class: 'ac-label' }, 'Cirrhosis'), cirVal),
    h('div', { class: 'range-wrap' }, cirIn),
    h('div', { class: 'ctl-sub' }, 'Tap the portal venule, a sinusoid or the central venule to add fibrosis there.'));
  const paintCir = (v) => { cirIn.value = v; cirVal.textContent = `${Math.round(v * 100)} %`; cirIn.style.setProperty('--pct', `${v * 100}%`); };
  let cirFresh = true;
  cirIn.addEventListener('pointerdown', () => { cirFresh = true; });
  cirIn.addEventListener('keydown', () => { cirFresh = true; });
  cirIn.addEventListener('input', () => { const v = parseFloat(cirIn.value); paintCir(v); updateParams((pp) => { pp.cirrhosis = v; return pp; }, { history: cirFresh, label: 'Cirrhosis' }); cirFresh = false; });
  const legend = h('div', { class: 'lz-legend', 'aria-hidden': 'true' });
  const sub = h('div', { class: 'lz-sub' });
  // The card floats on the right (a sheet on a phone) and the lobule frames itself beside it. Its chevron
  // folds it to the header and the verdict; on a phone the header's Details opens the rest.
  const more = h('button', { class: 'lz-more', 'aria-expanded': 'true', title: 'Show or hide the details' }, h('span', { class: 'lz-more-l' }, 'Details'), svgIcon('chev-down', 'lz-chev'));
  const grab = h('span', { class: 'lz-grab', 'aria-hidden': 'true' });
  const head = h('div', { class: 'lz-head' }, grab, h('div', {}, h('div', { class: 'lz-title' }, 'Hepatic lobule'), sub), more);
  const side = h('div', { class: 'lz-side open' }, head, ladder, verdict, cirBox, stats);
  const phoneMQ = matchMedia('(max-width: 720px)');
  const setOpen = (o) => { side.classList.toggle('open', o); more.setAttribute('aria-expanded', String(o)); if (!o) side.scrollTop = 0; requestAnimationFrame(refit); };
  more.addEventListener('click', () => setOpen(!side.classList.contains('open')));
  // The key to the lobule's parts is not shown (the colours speak for themselves); it stays detached.
  const key = h('div', { class: 'lz-key' }, legend);
  // Phone: the sheet follows a swipe on its header, up to open and down to fold; a tap on the header flips it.
  {
    let y0 = null, moved = false;
    const move = (e) => { if (y0 != null && Math.abs(e.clientY - y0) > 8) moved = true; };
    const stop = () => { y0 = null; removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', stop); };
    const up = (e) => {
      const dy = e.clientY - y0, tap = !moved && !e.target.closest?.('button');
      stop();
      if (dy < -30) setOpen(true); else if (dy > 30) setOpen(false); else if (tap) setOpen(!side.classList.contains('open'));
    };
    head.addEventListener('pointerdown', (e) => {
      if (!matchMedia('(max-width: 720px)').matches || e.target.closest('button')) return;
      y0 = e.clientY; moved = false;
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', stop);
    });
  }
  const el = h('div', { class: 'lz', 'aria-hidden': 'true' },
    tissue, glCv, fx, leaders, labels,
    h('div', { class: 'lz-top' }, h('div', { class: 'lz-tgs' }, zonesBtn, lymphBtn)),
    side);
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
    const top = el.querySelector('.lz-top');
    let t = cssN('--top-safe') + (top ? top.offsetHeight + 16 : 8), b = H - (cssN('--bot-occ') || 100) - 8, l = 12, r = W - cssN('--right-occ') - 12;
    // The card's layout box (offsetLeft/Top ignore the grow-in transform).
    if (!side.hidden && side.offsetWidth) { if (phone) b = Math.min(b, side.offsetTop - 10); else r = Math.min(r, side.offsetLeft - 16); }
    // The key: above the lobule on a phone, under it (bottom left) on a wider screen.
    if (key.offsetHeight) { if (phone) t += key.offsetHeight + 4; else b = Math.min(b, key.offsetTop - 8); }
    return { l, t, r: Math.max(l + 80, r), b: Math.max(t + 80, b) };
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
  function clampV() {
    if (!geo) return;
    const F0 = fitV();
    kFit = F0.k;
    if (V.k <= kFit * 1.001) { Object.assign(V, F0); atFit = true; return; }
    atFit = false;
    V.k = Math.min(V.k, kFit * KMAX);
    const { cx, cy, R } = geo, f = freeRect(), mx = (f.l + f.r) / 2, my = (f.t + f.b) / 2;
    // The free space's centre stays over the lobule; fitted, it is the framing.
    const t = clamp(V.k / kFit - 1, 0, 1);
    const fc = [(mx - F0.x) / F0.k, (my - F0.y) / F0.k];
    const wx = (mx - V.x) / V.k, wy = (my - V.y) / V.k;
    const x0 = lerp(fc[0], cx - R * 1.05, t), x1 = lerp(fc[0], cx + R * 1.05, t), y0 = lerp(fc[1], cy - R * 0.95, t), y1 = lerp(fc[1], cy + R * 0.95, t);
    const cxw = clamp(wx, Math.min(x0, x1), Math.max(x0, x1)), cyw = clamp(wy, Math.min(y0, y1), Math.max(y0, y1));
    V.x = mx - cxw * V.k; V.y = my - cyw * V.k;
  }
  function zoomAround(px, py, factor) {
    const k = clamp(V.k * factor, kFit, kFit * KMAX), r = k / V.k;
    V.x = px - (px - V.x) * r; V.y = py - (py - V.y) * r; V.k = k;
    clampV(); viewChanged();
  }
  // A short glide between framings (the buttons, Fit, a card opening).
  let glide = 0;
  function glideTo(to, ms = 260) {
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
  function zoomBy(factor) {
    if (!geo) return;
    const f = freeRect(), px = (f.l + f.r) / 2, py = (f.t + f.b) / 2;
    const k = clamp(V.k * factor, kFit, kFit * KMAX), r = k / V.k;
    const to = { k, x: px - (px - V.x) * r, y: py - (py - V.y) * r };
    const saved = { ...V }; Object.assign(V, to); clampV(); const target = { ...V }; Object.assign(V, saved);
    glideTo(target);
  }
  // When the free space changes (a card opens, the readouts expand), a fitted lobule follows it.
  function refit() { if (!geo) return; const F0 = fitV(); kFit = F0.k; if (atFit) glideTo(F0); else { clampV(); viewChanged(); } }
  addEventListener('pps:occ', () => { if (fade > 0) { layoutKey = ''; refit(); } });
  addEventListener('pps:labelscale', () => { layoutKey = ''; if (!raf && fade > 0) raf = requestAnimationFrame(loop); });
  const viewChanged = () => { tissueKey = ''; layoutKey = ''; syncKey(); if (!raf && fade > 0) raf = requestAnimationFrame(loop); };
  const toWorld = (p) => [(p[0] - V.x) / V.k, (p[1] - V.y) / V.k];
  const toScreen = (p) => [p[0] * V.k + V.x, p[1] * V.k + V.y];
  function resetView() { if (!geo) { V.k = 1; V.x = 0; V.y = 0; return; } atFit = true; const F0 = fitV(); kFit = F0.k; Object.assign(V, F0); viewChanged(); }
  function fitView() { atFit = true; const F0 = fitV(); kFit = F0.k; glideTo(F0); }
  // The key fades out from 1.25× the framing and is gone by 1.7×.
  function syncKey() { const z = V.k / (kFit || 1), o = clamp((1.7 - z) / 0.45, 0, 1); key.style.opacity = o.toFixed(2); key.style.visibility = o < 0.02 ? 'hidden' : ''; }

  // ── Gestures: wheel and pinch zoom, drag pans, a tap selects; out past 1× returns to the liver ──
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const f = Math.exp(-ev.deltaY * 0.0015);
    if (V.k <= kFit * 1.001 && f < 1) return;   // the lobule is a view of its own: zooming out stops at its framing
    const p = local(ev);
    zoomAround(p[0], p[1], f);
  }, { passive: false });
  const touches = new Map();
  let pinch = null, down = null, drag = null;
  const pts2 = () => [...touches.values()];
  const onScene = (ev) => ev.target === el || ev.target === fx || ev.target === leaders || ev.target === tissue || ev.target === glCv;
  el.addEventListener('pointerdown', (ev) => {
    if (!onScene(ev)) return;
    if (ev.isPrimary) touches.clear();
    touches.set(ev.pointerId, local(ev));
    if (touches.size === 2) {
      const [a, b] = pts2();
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k: V.k, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      down = null; drag = null;
    } else { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; drag = { p: local(ev) }; }
  });
  el.addEventListener('pointermove', (ev) => {
    if (touches.has(ev.pointerId)) {
      touches.set(ev.pointerId, local(ev));
      if (touches.size === 2 && pinch) {
        const [a, b] = pts2(), d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        V.x += m[0] - pinch.m[0]; V.y += m[1] - pinch.m[1]; pinch.m = m;
        zoomAround(m[0], m[1], (pinch.k * d / pinch.d) / V.k);
      } else if (touches.size === 1 && drag && (ev.buttons || ev.pointerType !== 'mouse')) {
        const p = local(ev);
        if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 8) return;
        down = null;
        if (V.k > kFit * 1.001) { V.x += p[0] - drag.p[0]; V.y += p[1] - drag.p[1]; clampV(); viewChanged(); el.classList.add('lz-drag'); }
        drag.p = p;
      }
    }
    if (ev.pointerType === 'mouse' && !ev.buttons && geo && onScene(ev)) { const w = toWorld(local(ev)); el.classList.toggle('lz-hot', !!hit(w[0], w[1])); }
  });
  el.addEventListener('pointerup', (ev) => {
    if (down && touches.size <= 1 && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 8 && performance.now() - down.t < 600 && onScene(ev)) {
      const w = toWorld(local(ev));
      select(hit(w[0], w[1]), w);
    }
    down = null;
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, (ev) => { touches.delete(ev.pointerId); if (touches.size < 2) pinch = null; if (!touches.size) { drag = null; el.classList.remove('lz-drag'); } });
  el.addEventListener('dblclick', (ev) => { if (!onScene(ev)) return; const p = local(ev); zoomAround(p[0], p[1], V.k < kFit * KMAX * 0.98 ? 2 : 1 / KMAX); });
  const local = (ev) => { const r = el.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };

  // ── Selection: the lobule's parts open the same action card as the anatomy's vessels ──
  function select(hv, at) {
    if (!hv) { if (store.get().selection?.type === 'lobule') store.set({ selection: null }); return; }
    store.set({ selection: { type: 'lobule', ...hv, at } });
  }
  let selFor = null, selIdsC = new Set();
  function selIds() {
    const sl = store.get().selection;
    if (sl === selFor) return selIdsC;
    selFor = sl; selIdsC = new Set();
    const G = geo;
    if (!G || sl?.type !== 'lobule') return selIdsC;
    const tr = sl.tri != null ? G.triads[sl.tri] : null;
    if (sl.part === 'triad' && tr) selIdsC = new Set([tr.pv.id, G.inlets[tr.i * 2].id, G.inlets[tr.i * 2 + 1].id]);
    else if (sl.part === 'sin' && sl.tube != null) selIdsC = chainOf(sl.tube);
    else if (sl.part === 'ha' && tr) selIdsC = new Set([tr.haT.id, ...G.tubes.filter((t) => t.kind === 'tw' && t.tri === tr.i).map((t) => t.id)]);
    else if (sl.part === 'cv') selIdsC = new Set([G.cv.id]);
    else if (sl.tube != null) selIdsC = new Set([sl.tube]);
    return selIdsC;
  }
  store.on('selection', () => { attrKey = ''; tissueKey = ''; if (!raf && fade > 0) raf = requestAnimationFrame(loop); });

  // ── State ──
  let F = null, fade = 0, raf = 0, last = 0, lastPaint = 0;
  let geo = null, geoKey = '', model = null;
  let gl = null, glTried = false, binKey = '', binReach = [], radKey = [], radAll = '', attrKey = '', drawKey = '', glDirty = true, tissueKey = '', layoutKey = '';
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
      // Arteriole and ductule beside the venule, inside the portal tract, between the two inlet venules' courses.
      const a = Math.atan2(y - cy, x - cx), d = rt * 0.62;
      const ha = [x + Math.cos(a + 1.15) * d, y + Math.sin(a + 1.15) * d];
      const bd = [x + Math.cos(a - 1.15) * d, y + Math.sin(a - 1.15) * d];
      return { i, x, y, ha, bd, pv: add('pv', dot(x, y), { tri: i }), haT: add('ha', dot(...ha), { tri: i }) };
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
    // Portal-central septa (advanced cirrhosis): from three triads toward the central vein, wavy, stopping
    // short of it, so the lobule is cut into three rounded nodules.
    const septaPC = [0, 2, 4].map((i) => {
      const [x, y] = C[i], ph = r() * TAU, nx = -(cy - y) / R, ny = (cx - x) / R;
      return curve((u) => { const e = R * 0.05 * Math.sin(Math.PI * u) * Math.sin(1.5 * TAU * u + ph); return [lerp(x, cx, u * 0.82) + nx * e, lerp(y, cy, u * 0.82) + ny * e]; });
    });
    // Hepatocytes: plates one cell thick, radial cords in rings (a polar grid, clipped to the hexagon).
    const cells = [];
    const cl = R * 0.055, cw = R * 0.048;
    for (let rr = rcv0 * 1.45; rr < R * 1.02; rr += cl) {
      const n = Math.max(6, Math.round((TAU * rr) / cw)), off = r() * TAU;
      for (let j = 0; j < n; j++) {
        const a = off + (j * TAU) / n, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        const q = hexFrac(x, y, cx, cy, R);
        if (q > 0.985) continue;
        cells.push({ x, y, a, l: cl * (0.8 + r() * 0.1), w: cw * (0.72 + r() * 0.12), tone: r(), nu: (r() - 0.5) * 0.3, q, drop: r() });
      }
    }
    // Stellate cells in the space of Disse, beside sinusoids.
    const hsc = [];
    for (let i = 0; i < (R > 190 ? 22 : 14); i++) {
      const t = [...L0, ...L1][Math.floor(r() * (L0.length + L1.length))], u = 0.15 + r() * 0.7, [x, y] = at(t.pts, u), [x2, y2] = at(t.pts, u + 0.02);
      const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, sd = r() < 0.5 ? -1 : 1;
      hsc.push({ x: x - (dy / l) * sd * (rs0 + 3), y: y + (dx / l) * sd * (rs0 + 3), a: r() * TAU });
    }
    // Lymph droplets: start deep in the lobule, drift to the nearest triad.
    // Lymph shimmer: each streak rises deep in the lobule and drifts out through the tissue to the nearest triad.
    const lymph = Array.from({ length: 140 }, () => ({ ph: r(), a: r() * TAU, r0: 0.1 + r() * 0.4, sp: 0.7 + r() * 0.6, w: r() * TAU, len: 0.07 + r() * 0.06 }));
    return { W, H, phone, R, cx, cy, rt, rs0, rcv0, lobules, tubes, joins, triads, inlets, L0, L1, L2, cv, septaPC, cells, hsc, lymph };
  }
  function hexFrac(x, y, cx, cy, R) {
    let m = 0;
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; m = Math.max(m, ((x - cx) * Math.cos(a) + (y - cy) * Math.sin(a)) / (R * 0.8660254)); }
    return m;
  }
  const zoneOf = (q) => (q > 0.66 ? 1 : q > 0.36 ? 2 : 3);

  // ── Model → lobule ──
  function update(f) {
    F = f;
    if (fade <= 0) return;
    const st = store.get();
    model = lobuleState(f, st);
    const hs = getComputedStyle(host), cv = (n, d) => hs.getPropertyValue(n).trim() || d;
    model.inks = { normal: cv('--flow-normal', '#16988F'), reversed: cv('--flow-reversed', '#EC7424'), portal: cv('--vein-portal', '#7B6FC4'), systemic: cv('--vein-systemic', '#4F8CC9') };
    if (originOn() && originsF !== f) { origins = originFractions(EDGES, NODES, f.Qf || f.Q, f.Pf || f.P); originsF = f; }
    panel();
    const p = st.params;
    if (document.activeElement !== cirIn) paintCir(p.cirrhosis);
    cirIn.disabled = !verbEnabled('cirrhosis', 'cirrhosis');
    if (!raf) raf = requestAnimationFrame(loop);
  }
  const originOn = () => !store.get().imaging && store.get().colorMode === 'origin';

  function panel() {
    const m = model;
    sub.textContent = 'Live from the model';
    // The pressure ladder: where along the lobule the pressure is lost, against the healthy ladder.
    const P = [m.P1, m.P2, m.P3, m.P4, m.P5], P0 = m.H, names = ['Portal venule', 'Sinusoids', 'Central vein', 'Hepatic vein', 'IVC'], short = ['PV', 'Sin', 'CV', 'HV', 'IVC'];
    const drops = [0, 1, 2, 3].map((i) => P[i] - P[i + 1]), drops0 = [0, 1, 2, 3].map((i) => (P0[i] ?? P[i]) - (P0[i + 1] ?? P[i + 1]));
    const excess = drops.map((d, i) => d - drops0[i]);
    const tot = P[0] - P[4], tot0 = (P0[0] ?? P[0]) - (P0[4] ?? P[4]);
    let k = excess.indexOf(Math.max(...excess));
    // A raised outflow lifts the whole ladder without a steeper step: the block is beyond the lobule.
    const lifted = P[4] - (P0[4] ?? P[4]) > 3 || (P[3] - (P0[3] ?? P[3]) > 5 && excess[3] < 1.5);
    if (excess[k] < 1.5 && !lifted) k = -1;
    const segNames = ['pre-sinusoidal', 'sinusoidal', 'post-sinusoidal', 'outflow'];
    const Wd = 232, Hd = 104, x0 = 14, x1 = Wd - 14, y0 = 12, y1 = Hd - 26;
    const top = Math.max(15, ...P, ...P0.filter((v) => v != null)) * 1.08;
    const X = (i) => x0 + ((x1 - x0) * i) / 4, Y = (v) => y1 - ((y1 - y0) * clamp(v, 0, top)) / top;
    const svg = s('svg', { viewBox: `0 0 ${Wd} ${Hd}`, class: 'lz-lad', role: 'img', 'aria-label': m.hide ? 'Pressure ladder: not measured' : 'Pressure ladder: ' + names.map((n, i) => `${n} ${fmt(P[i], 1)}`).join(', ') + ' mmHg' });
    for (let i = 0; i < 4; i++) {
      const on = i === k || (k === -1 && lifted && i === 3);
      svg.append(s('rect', { x: X(i) + 2, y: y1 + 6, width: X(i + 1) - X(i) - 4, height: 4, rx: 2, class: 'lz-seg' + (on ? ' on' : '') }));
    }
    if (!m.hide) {
      if (P0.every((v) => v != null)) svg.append(s('polyline', { points: P0.map((v, i) => `${X(i)},${Y(v)}`).join(' '), class: 'lz-lad0' }));
      svg.append(s('polyline', { points: P.map((v, i) => `${X(i)},${Y(v)}`).join(' '), class: 'lz-lad1' }));
      P.forEach((v, i) => {
        svg.append(s('circle', { cx: X(i), cy: Y(v), r: 4.2, fill: pc(v), class: 'lz-ladDot' }));
        const t = s('text', { x: X(i), y: Y(v) - 8, class: 'lz-ladV', 'text-anchor': 'middle' }); t.textContent = fmt(v, 0); svg.append(t);
      });
    }
    short.forEach((n, i) => { const t = s('text', { x: X(i), y: Hd - 4, class: 'lz-ladN', 'text-anchor': 'middle' }); t.textContent = n; svg.append(t); });
    ladder.replaceChildren(svg);
    const dropTxt = k >= 0 ? `${fmt(drops[k], 1)} mmHg lost ${['before the sinusoids', 'across the sinusoids', 'at the central veins', 'beyond the lobule'][k]} (normal ${fmt(drops0[k], 1)}).` : '';
    const why = m.hide ? 'Pressures are not measured in this case: the lobule shows anatomy and flow only.'
      : k === 0 ? 'The block is pre-sinusoidal (portal tract): portal pressure is high, but the wedged pressure, and so HVPG, stays near normal.'
        : k === 1 ? 'The block is sinusoidal (as in cirrhosis): the wedged pressure rises with portal pressure, so HVPG measures it.'
          : k === 2 ? 'The block is post-sinusoidal (central veins, as in sinusoidal obstruction): the sinusoids congest from the outflow side; HVPG is raised.'
            : k === 3 || lifted ? 'The block is beyond the lobule (hepatic veins, IVC or heart): the whole ladder is lifted and zone 3 congests. The free hepatic pressure rises too, so HVPG can stay normal.'
              : `Pressure falls gently, ${fmt(tot, 1)} mmHg from portal venule to IVC (normal ${fmt(tot0, 1)}): no block in the lobule.`;
    verdict.replaceChildren(dropTxt ? h('b', {}, dropTxt + ' ') : null, why);
    verdict.className = 'lz-verdict' + (k >= 0 || lifted ? ' alert' : '');
    verdict.dataset.seg = k >= 0 ? segNames[k] : lifted ? 'outflow' : 'none';
    const pct = (v) => `${Math.round(v * 100)} %`;
    stats.replaceChildren(
      h('dt', {}, 'Sinusoidal flow'), h('dd', {}, pct(m.flow)),
      h('dt', {}, 'Portal inflow'), h('dd', { class: m.portal < 0 ? 'rev' : '' }, m.portal < 0 ? 'Reversed' : pct(m.portal)),
      h('dt', {}, 'Arterial inflow'), h('dd', {}, pct(m.art)),
      h('dt', {}, 'HVPG'), h('dd', {}, m.hide || m.hvpg == null ? '?' : `${fmt(m.hvpg, 1)} mmHg`),
      h('dt', {}, 'Hepatic lymph'), h('dd', {}, `${fmt(m.lymph, 1)} mL/min`));
    const items = [['lg-pv', 'Portal venule', { background: ink('pv') }], ['lg-ha', 'Hepatic arteriole'], ['lg-bd', 'Bile ductule'], ['lg-cv', 'Central vein', { background: ink('cv') }]];
    if (m.septU > 0 || m.fibPre > 0.05 || m.fibSin > 0.05 || m.fibPost > 0.05) items.push(['lg-col', 'Collagen']);
    if (m.act > 0.08) items.push(['lg-hsc', 'Stellate cell']);
    if (lymphOn) items.push(['lg-ly', 'Lymph']);
    legend.replaceChildren(items.map(([c, t, st]) => h('span', {}, h('i', { class: c, style: st }), t)));
    tissue.setAttribute('aria-label', m.hide ? 'Liver lobule. Pressures not measured.'
      : `Liver lobule: portal venule ${fmt(m.P1, 1)}, sinusoids ${fmt(m.P2, 1)}, central venule ${fmt(m.P3, 1)} millimeters of mercury; sinusoidal flow ${Math.round(m.flow * 100)} percent of normal. ${why}`);
    // Station cards on the figure.
    // Labels as in the anatomy: the station, its pressure, and the change from healthy once it reaches 5 mmHg.
    const mv = (v, h0) => (m.hide ? ['?', '', '', null] : [fmt(v, 1), 'mmHg', h0 != null && Math.abs(v - h0) >= 5 ? `${v > h0 ? '▲' : '▼'} ${Math.round(Math.abs(v - h0))}` : '', pc(v)]);
    setLab('triad', 'Portal venule', 'Portal venule', ...mv(m.P1, m.H[0]));
    setLab('sin', 'Sinusoids', 'Sinusoids', ...mv(m.P2, m.H[1]));
    setLab('cv', 'Central venule', 'Central venule', ...mv(m.P3, m.H[2]));
  }

  // ── Station labels (HTML, styled as the anatomy's) with leaders ──
  const labs = {};
  function setLab(key, name, short, v, u, d, col) {
    let L = labs[key];
    if (!L) {
      L = labs[key] = { el: h('button', { class: 'lz-lab', type: 'button' }), line: s('line', { class: 'leader' }), dotEl: s('circle', { class: 'leader-dot', r: 3 }) };
      L.el.addEventListener('click', () => { if (!geo) return; const q = anchorOf(key); select(hitKind(key), [q[0], q[1]]); });
      labels.append(L.el); leaders.append(L.line, L.dotEl);
    }
    const txt = `${name}|${v}|${u}|${d}|${col}`;
    if (L.txt !== txt) {
      L.txt = txt;
      L.el.style.setProperty('--sw', col || 'var(--border-strong)');
      L.el.replaceChildren(h('span', { class: 'n' }, h('span', { class: 'n-long' }, name), h('span', { class: 'n-short' }, short)),
        h('span', { class: 'v' }, h('b', {}, v), u ? h('small', {}, u) : null, d ? h('span', { class: 'd' }, d) : null));
      L.el.setAttribute('aria-label', `${name} ${v} ${u}${d ? `, ${d.slice(2)} from healthy` : ''}. Show details`);
      layoutKey = '';
    }
  }
  const anchorOf = (key) => {
    const g = geo, C = g.lobules[0].corners;
    if (key === 'triad') return C[5];
    if (key === 'cv') return [g.cx, g.cy];
    const t = g.L1[Math.round(g.L1.length * 0.08)] || g.L1[0];
    return at(t.pts, 0.45);
  };
  const hitKind = (key) => (key === 'triad' ? { part: 'triad', tri: 5 } : key === 'cv' ? { part: 'cv' } : { part: 'sin', tube: (geo.L1[Math.round(geo.L1.length * 0.08)] || geo.L1[0]).id });
  function layoutLabels() {
    const fr0 = freeRect(), g = geo, key = `${g.W}x${g.H}|${Object.values(labs).map((l) => l.txt).join('|')}|${zonesOn}|${lymphOn}|${V.k},${V.x},${V.y}|${fr0.t},${fr0.b},${fr0.l},${fr0.r}`;
    if (key === layoutKey) return;
    layoutKey = key;
    leaders.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    const { R, cx, cy } = g;
    // Each label sits just beside its vessel, on the side away from the lobule's centre (the central
    // venule's, up and to the left of it), with a short leader; it stays inside the free space.
    const c0 = toScreen([cx, cy]);
    for (const [k, L] of Object.entries(labs)) {
      const w = L.el.offsetWidth || 100, hh = L.el.offsetHeight || 40;
      const a = toScreen(anchorOf(k)), off = a[0] < 0 || a[0] > g.W || a[1] < 0 || a[1] > g.H;
      let dx = a[0] - c0[0], dy = a[1] - c0[1], n = Math.hypot(dx, dy);
      if (k === 'cv' || n < 1) { dx = -0.8; dy = -0.6; n = 1; }
      dx /= n; dy /= n;
      const gap = 18 + Math.abs(dx) * w / 2 + Math.abs(dy) * hh / 2;
      const fr = freeRect();
      const x = clamp(a[0] + dx * gap, fr.l + w / 2, fr.r - w / 2), y = clamp(a[1] + dy * gap, fr.t + hh / 2, fr.b - hh / 2);
      L.el.style.left = `${x - w / 2}px`; L.el.style.top = `${y - hh / 2}px`;
      L.el.classList.toggle('left', x < a[0]);
      // Hidden when its vessel is out of the free space, or the space is too small to hold it.
      L.el.hidden = off || fr.b - fr.t < hh + 8 || fr.r - fr.l < w + 8 || a[0] < fr.l - 4 || a[0] > fr.r + 4 || a[1] < fr.t - 30 || a[1] > fr.b + 4;
      L.line.style.display = L.dotEl.style.display = L.el.hidden ? 'none' : '';
      // The leader ends at the label's near edge (its colour bar).
      const ex = x < a[0] ? x + w / 2 : x - w / 2;
      L.line.setAttribute('x1', a[0]); L.line.setAttribute('y1', a[1]); L.line.setAttribute('x2', ex); L.line.setAttribute('y2', y);
      L.dotEl.setAttribute('cx', a[0]); L.dotEl.setAttribute('cy', a[1]);
    }
    // Zone chips along the radius to the lower-left edge.
    labels.querySelectorAll('.lz-zone').forEach((z) => z.remove());
    if (zonesOn) {
      const a = (2 * Math.PI) / 3 + Math.PI / 6, ap = R * 0.866;
      [[0.83, 'Zone 1', 'periportal'], [0.51, 'Zone 2', ''], [0.2, 'Zone 3', 'centrilobular']].forEach(([q, t, d], i) => {
        const z = h('div', { class: 'lz-zone z' + (i + 1) }, h('b', {}, t), d ? ' ' + d : '');
        const [zx, zy] = toScreen([cx + Math.cos(a) * ap * q, cy + Math.sin(a) * ap * q]);
        z.style.left = `${zx}px`; z.style.top = `${zy}px`;
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
    draw(moving ? dt : 0);
    raf = requestAnimationFrame(loop);
  }

  function draw(dt) {
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    ensureGeo(W, H);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const cs = getComputedStyle(host);
    const g = ensureGL();
    paintTissue(W, H, dpr, dark, cs, !g);
    layoutLabels();
    if (g && !g.lost) drawGL(W, H, dpr, dark, cs, dt);
    paintFx(W, H, dpr, dark, dt, !g || g.lost);
  }

  function ensureGeo(W, H) {
    const key = W + 'x' + H;
    if (key !== geoKey) { geo = build(W, H); geoKey = key; binKey = ''; radKey = []; radAll = ''; tissueKey = ''; layoutKey = ''; if (atFit) resetView(); else clampV(); }
  }
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

  // ── The dive's field ──
  // A flat-topped hexagonal tiling with the lobule view's own spacing (so the lobule it settles on, and
  // its six neighbours, land where the view draws them), as a repeating pattern. The tile is drawn once
  // per theme at sizes a factor of 2 apart, and the one at or just above the size on screen is used,
  // so the zoom stays sharp and never shimmers.
  let tiles = null, tilesKey = '';
  function fieldTiles(cs, dark) {
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const cell = v('--og-liver-1', '#E9C3B6'), gap = v('--og-liver-2', '#C98E7E'), cvc = v('--vein-systemic', '#4F8CC9'), pvc = v('--vein-portal', '#7D6FB6');
    const key = [dark, cell, gap, cvc, pvc].join('|');
    if (key === tilesKey) return tiles;
    tilesKey = key;
    const S3 = Math.sqrt(3);
    tiles = [6, 12, 24, 48, 96, 192, 384].map((R) => {
      const tw = Math.round(3 * R), th = Math.round(S3 * R);
      const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
      const c = cv.getContext('2d');
      c.scale(tw / (3 * R), th / (S3 * R));
      c.fillStyle = gap; c.fillRect(0, 0, 3 * R, S3 * R);
      const centres = [[0, 0], [3 * R, 0], [0, S3 * R], [3 * R, S3 * R], [1.5 * R, S3 * R / 2], [1.5 * R, -S3 * R / 2], [1.5 * R, 1.5 * S3 * R]];
      const hex = (x, y, k) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * R * k, y + Math.sin(a) * R * k); } c.closePath(); };
      for (const [x, y] of centres) {
        hex(x, y, 0.97); c.fillStyle = cell; c.fill();
        // The sinusoids: faint spokes from the portal edge to the central vein.
        c.save(); c.clip();
        c.strokeStyle = gap; c.globalAlpha = dark ? 0.45 : 0.32; c.lineWidth = Math.max(0.5, R * 0.025);
        c.beginPath();
        for (let i = 0; i < 24; i++) { const a = (i * TAU) / 24 + 0.07; c.moveTo(x + Math.cos(a) * R * 0.12, y + Math.sin(a) * R * 0.12); c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); }
        c.stroke(); c.restore();
        c.globalAlpha = 0.8; c.fillStyle = cvc; c.beginPath(); c.arc(x, y, R * 0.08, 0, TAU); c.fill();
        // A portal triad at every corner.
        c.fillStyle = pvc;
        for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, R * 0.06, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
      return { R, tw, th, cv, pat: null };
    });
    return tiles;
  }
  // d: { a: opacity 0..1, x, y: where the settling lobule's centre is (stage px), r: its radius on
  // screen, ox, oy: the point it emerges from, quiet: 0..1, the surround fading into the page as the
  // lobule view does }. null hides it.
  function paintField(d) {
    if (!d || d.a <= 0.002) { if (field.width) { field.width = 0; field.height = 0; } field.style.opacity = '0'; return; }
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    if (field.width !== Math.round(W * dpr) || field.height !== Math.round(H * dpr)) { field.width = Math.round(W * dpr); field.height = Math.round(H * dpr); for (const t of tiles || []) t.pat = null; }
    const cs = getComputedStyle(host), dark = isDark();
    const T = fieldTiles(cs, dark), rd = d.r * dpr;
    const t = T.find((q) => q.R >= rd) || T[T.length - 1];
    const c = field.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    if (!t.pat) t.pat = c.createPattern(t.cv, 'repeat');
    t.pat.setTransform(new DOMMatrix([(3 * rd) / t.tw, 0, 0, (Math.sqrt(3) * rd) / t.th, d.x * dpr, d.y * dpr]));
    c.fillStyle = t.pat; c.fillRect(0, 0, field.width, field.height);
    const bg = rgb01(cs.getPropertyValue('--stage-bg').trim() || cs.getPropertyValue('--bg').trim() || (dark ? '#0E1422' : '#FBFAF7'));
    if (d.quiet > 0) {
      const vg = c.createRadialGradient(d.x * dpr, d.y * dpr, rd * 1.15, d.x * dpr, d.y * dpr, rd * 2.6);
      vg.addColorStop(0, css(bg, 0)); vg.addColorStop(1, css(bg, 0.75 * d.quiet));
      c.fillStyle = vg; c.fillRect(0, 0, field.width, field.height);
    }
    // Emerging: the field spreads out from the dive point as it fades in.
    if (d.a < 1) {
      const diag = Math.hypot(W, H) * dpr, rho = diag * (0.2 + 1.1 * d.a);
      const mg = c.createRadialGradient(d.ox * dpr, d.oy * dpr, rho * 0.35, d.ox * dpr, d.oy * dpr, rho);
      mg.addColorStop(0, 'rgba(0,0,0,1)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = mg; c.fillRect(0, 0, field.width, field.height);
      c.globalCompositeOperation = 'source-over';
    }
    field.style.opacity = Math.min(1, d.a * 1.25).toFixed(3);
  }

  // Lumen radius of a tube at sample i (world px), from the model.
  function radiusAt(t, i) {
    const m = model, g = geo, R = g.R;
    const z3 = 1 - smooth(0.24, 0.56, t.rho[i]);
    const rs = g.rs0 / m.zone.sin ** 0.12 * (1 + 1.5 * m.congU * z3);
    switch (t.kind) {
      case 's0': return rs;
      case 's1': return rs * 1.15;
      case 's2': return rs * 1.3;
      case 'an': return rs * 0.68;
      case 'in': return lerp(R * 0.015, R * 0.009, i / (N - 1)) / (1 + 0.45 * m.fibPre);
      case 'pv': return R * 0.042 / (1 + 0.35 * m.fibPre);
      case 'cv': return R * (0.07 + 0.05 * m.congU) * (1 - 0.3 * m.fibPost);
      case 'ha': return Math.max(1.6, R * 0.014 * clamp(m.art, 0.6, 2.2) ** 0.3);
      case 'tw': return Math.max(1.1, R * 0.0055 * clamp(m.art, 0.6, 2.2) ** 0.3);
      default: return rs;
    }
  }
  const WALL = { s0: 0.8, s1: 0.85, s2: 0.9, an: 0.7, in: 1.1, pv: 1.5, cv: 1.6, sh: 1.1, ha: 0, tw: 0 };
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
      const V = M === 'pressure' ? [m.P1, m.P2, m.P3] : m.dP;
      const v = seg === 'pv' ? V[0] : seg === 'in' ? lerp(V[0], V[1], 0.6 * w) : seg === 'cv' ? V[2] : V[2] + (V[1] - V[2]) * w;
      return M === 'pressure' ? pressureColor(v) : M === 'delta' ? deltaColor(qP(v)) : heatColor(qP(v));
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
    const live = G.tubes;
    // Radii, re-sent when a tube's caliber changed (they follow only these few model values).
    let reachGrew = false;
    const rk0 = [m.zone.sin, m.congU, m.fibPre, m.fibPost, m.art].map((x) => x.toFixed(3)).join('|') + '|' + G.W + 'x' + G.H;
    if (rk0 !== radAll) for (const t of live) {
      const r = Array.from({ length: N }, (_, i) => radiusAt(t, i)), rk = r.map((v) => v.toFixed(2)).join(',');
      t.maxR = Math.max(...r);
      if (radKey[t.id] !== rk) { radKey[t.id] = rk; g.setRadii(t.id, r); glDirty = true; }
      const reach = Math.ceil((t.maxR + (WALL[t.kind] || 0) + 10) / 2) * 2;
      if (reach > (binReach[t.id] || 0)) reachGrew = true;
    }
    radAll = rk0;
    const bk = live.map((t) => t.id).join(',');
    if (bk !== binKey || reachGrew) {
      binKey = bk;
      for (const t of live) binReach[t.id] = Math.max(binReach[t.id] || 0, Math.ceil((t.maxR * 1.6 + (WALL[t.kind] || 0) + 10) / 2) * 2);
      const ids = new Set(live.map((t) => t.id));
      g.setGeometry(binVeins(live.map((t) => ({ id: t.id, pts: t.pts, reach: binReach[t.id] })), G.joins.filter((j) => j.members.every((id) => ids.has(id)))));
      glDirty = true;
    }
    // Attributes, re-sent when they change (pressures in half-mmHg steps).
    const origin = originOn();
    const selIdsN = selIds();
    const inks = new Map(live.map((t) => [t.id, [tubeInk(t, 0), tubeInk(t, 1)]]));
    const ak = [m.mode, [...inks.values()].flat().join(','), m.hide, origin, [...selIdsN].join('.'), dark, cs.getPropertyValue('--artery')].join('|');
    if (ak !== attrKey) {
      attrKey = ak; glDirty = true;
      tubeData.fill(0);
      const art = rgb01(cs.getPropertyValue('--artery').trim() || '#C8414D'), grey = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];
      for (const t of live) {
        const o = t.id * TUBE_TEXELS * 4, isArt = t.kind === 'ha' || t.kind === 'tw';
        const [i0, i1] = inks.get(t.id);
        const c0 = isArt ? art : origin ? grey : rgb01(i0), c1 = isArt ? art : origin ? grey : rgb01(i1);
        const alpha = (isArt ? 0.9 : 1) * (selIdsN.size && !selIdsN.has(t.id) ? 0.55 : 1);
        const big = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'in';
        const flags = (selIdsN.has(t.id) ? F_SEL : 0) | (isArt ? F_NOCASE : F_DIFFUSE | F_SHADOW | (big ? F_SPEC : 0));
        const z = { s0: 0.1, s1: 0.11, s2: 0.12, an: 0.09, in: 0.3, pv: 0.4, cv: 0.4, lv: 0.45, sh: 0.5, tw: 0.6, ly: 0.62, ha: 0.7 }[t.kind];
        tubeData.set([...c0, isArt ? 0 : WALL[t.kind], ...c1, alpha, 1, z, flags, 0], o);
        tubeData.set([0, 1, t.len, 0], o + 20);
      }
      g.setTubes(tubeData);
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
    if (bloodOn || chev || origin) for (const t of live) {
      let v, occ, oe, f0 = 0, f1 = 0, strength = 1, rev = 0, stasis = 0;
      const lv = t.kind;
      if (lv === 's0' || lv === 's1' || lv === 's2') {
        v = vS * (lv === 's0' ? 1 : lv === 's1' ? 1.45 : 2.05); occ = clamp(0.5 * fr ** 0.6, 0.06, 0.95); f1 = lv === 's2' ? 1 : 0;
        stasis = 1 - smooth(0.12, 0.45, fr); oe = LOBE.q;
      } else if (lv === 'an') { v = 0.35 * vS * t.sign; occ = 0.25 * clamp(fr, 0.2, 1.5); strength = 0.6; oe = LOBE.q; }
      else if (lv === 'in') { v = 24 * Math.sign(pr) * Math.sqrt(Math.abs(pr)); occ = clamp(0.55 * Math.abs(pr) ** 0.6, 0.05, 0.95); f0 = 1; f1 = 1; rev = pr < -0.02 ? 1 : 0; oe = LOBE.pre; }
      else if (lv === 'tw') { v = 30 * Math.sqrt(ar); occ = clamp(0.5 * ar ** 0.6, 0.05, 0.95); f0 = 1; oe = LOBE.a; }
      else continue;   // vessels seen end-on carry no streaks
      const sm = t.stream || (t.stream = { D: (t.id * 977) % PERIOD, rev: rev });
      sm.D = (((sm.D + v * dt) % PERIOD) + PERIOD) % PERIOD;
      sm.rev += (rev - sm.rev) * ease;
      const o = t.id * FLOW_TEXELS * 4, Rm = t.maxR || G.rs0;
      flowData[o] = sm.D; flowData[o + 1] = v; flowData[o + 2] = (occ * Math.max(Math.abs(v), 2) * sumK(Rm)) / s0; flowData[o + 3] = stasis;
      flowData[o + 4] = f0; flowData[o + 5] = f1; flowData[o + 6] = strength; flowData[o + 7] = sm.rev;
      if (origin && origins) { const kk = EI[oe]; for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = origins[kk * ORIGIN_N + c]; }
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
    const blood = { on: bloodOn, chev, look: b.look || 'shimmer', origin, clock, dye: false, bleed: [], ...BLOOD };
    const T = [k * V.k, 0, 0, k * V.k, k * V.x, k * V.y];
    const dk = `${cw}x${ch}|${T.map((x) => x.toFixed(2)).join(',')}`;
    if (glDirty || dk !== drawKey) { glDirty = false; drawKey = dk; g.draw(T, look, blood); } else g.composite(look, blood);
  }
  const num = (cs, n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
  const triplet = (cs, n) => { const k = cs.getPropertyValue(n).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };

  // ── Tissue: plates, collagen, zones, congestion (repainted only when the model changes it) ──
  function paintTissue(W, H, dpr, dark, cs, flatVessels) {
    const m = model, G = geo;
    const q = (v) => Math.round(v * 2) / 2;
    const key = [W, H, dpr, dark, ink('pv'), ink('cv'), ink('sin', 0.5), m.zone.pre.toFixed(2), m.zone.sin.toFixed(2), m.zone.post.toFixed(2), m.s.toFixed(2), q(m.cong), m.hide, zonesOn, flatVessels ? [ink('sin', 1), ink('sin', 0), m.art.toFixed(2), [...selIds()].join('.')] : '', cs.getPropertyValue('--bg'), V.k.toFixed(3), V.x.toFixed(1), V.y.toFixed(1)].join('|');
    if (key === tissueKey) return;
    tissueKey = key;
    if (tissue.width !== W * dpr || tissue.height !== H * dpr) { tissue.width = W * dpr; tissue.height = H * dpr; }
    const c = tissue.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const bg = v('--stage-bg', v('--bg', dark ? '#0E1422' : '#FBFAF7'));
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.setTransform(dpr * V.k, 0, 0, dpr * V.k, dpr * V.x, dpr * V.y);
    const { R, cx, cy, lobules } = G;
    const gap = rgb01(v('--og-liver-2', dark ? '#5A3440' : '#C98E7E')), cell = rgb01(v('--og-liver-1', dark ? '#85514F' : '#E9C3B6'));
    const COL = dark ? [0.78, 0.73, 0.6] : [0.93, 0.87, 0.73];
    const col = (a) => css(COL, a);
    const hexPath = (l, k = 1) => { c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * k, py = l.y + (y - l.y) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); };
    const wavy = (A, B, amp, ph) => {
      const n = 18, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      c.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / n, e = amp * Math.sin(Math.PI * u) * Math.sin(3 * Math.PI * u + ph); const x = A[0] + dx * u + nx * e, y = A[1] + dy * u + ny * e; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    };
    // Neighbours: quiet hexagons with a hint of their sinusoids and their central vein.
    for (const l of lobules) {
      if (l.main) continue;
      hexPath(l); c.fillStyle = css(gap, dark ? 0.32 : 0.26); c.fill();
      c.save(); c.clip();
      c.strokeStyle = css(rgb01(ink('sin', 0.5)), 0.16); c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 24; i++) { const a = (i * TAU) / 24 + 0.07; c.moveTo(l.x + Math.cos(a) * R * 0.12, l.y + Math.sin(a) * R * 0.12); c.lineTo(l.x + Math.cos(a) * R, l.y + Math.sin(a) * R); }
      c.stroke(); c.restore();
      c.fillStyle = css(rgb01(ink('cv')), 0.45); c.beginPath(); c.arc(l.x, l.y, R * (0.06 + 0.04 * m.congU), 0, TAU); c.fill();
    }
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
      c.save(); c.translate(k.x, k.y); c.rotate(k.a);
      const lw = dead ? k.l * 0.7 : k.l, ww = dead ? k.w * 0.7 : k.w;
      c.fillStyle = css(fill, dead ? 0.6 : dark ? 0.8 : 0.92);
      c.beginPath(); c.roundRect(-lw / 2, -ww / 2, lw, ww, Math.min(lw, ww) * 0.3); c.fill();
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
      c.setLineDash([4, 4]); c.lineWidth = 1.2; c.strokeStyle = dark ? 'rgba(255,255,255,.4)' : 'rgba(60,40,60,.38)';
      for (const k of [0.66, 0.36]) { hexPath(main, k); c.stroke(); }
      c.setLineDash([]);
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
    // Stellate cells: shown once fibrosis starts; activated, they become star-shaped myofibroblasts.
    if (m.act > 0.08) {
      const a = m.act, rr = R * (0.01 + 0.014 * a);
      for (const k of G.hsc) {
        c.strokeStyle = `rgba(176, 104, 48, ${0.35 + 0.5 * a})`; c.lineWidth = 1.1;
        c.beginPath(); for (let i = 0; i < 5; i++) { const b = k.a + (i * TAU) / 5; c.moveTo(k.x, k.y); c.lineTo(k.x + Math.cos(b) * rr * 2.2, k.y + Math.sin(b) * rr * 2.2); } c.stroke();
        c.fillStyle = `rgba(176, 104, 48, ${0.45 + 0.45 * a})`; c.beginPath(); c.arc(k.x, k.y, rr, 0, TAU); c.fill();
      }
    }
    c.restore();
    // Bridging septa in cirrhosis: fibrous bands along the borders (portal-portal) and, later, from
    // the triads to the central vein (portal-central), cutting the lobule into rounded nodules.
    const su = m.septU;
    if (su > 0) {
      const w = R * (0.02 + 0.05 * su);
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      const paths = [];
      lobules.forEach((l, li) => l.corners.forEach((A, i) => paths.push([A, l.corners[(i + 1) % 6], li * 7 + i])));
      // Nodule bulge: the septa cast a soft shade into the tissue beside them.
      c.shadowColor = dark ? 'rgba(0,0,0,.55)' : 'rgba(110, 50, 50, .35)'; c.shadowBlur = R * 0.07 * su;
      c.strokeStyle = col(0.45 + 0.45 * su); c.lineWidth = w;
      for (const [A, B, ph] of paths) { wavy(A, B, R * 0.02, ph); c.stroke(); }
      if (su > 0.35) for (const sp of G.septaPC) { c.lineWidth = w * 0.85; c.beginPath(); sp.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
      c.shadowBlur = 0;
      // Fibres along each band.
      c.strokeStyle = dark ? 'rgba(120,110,90,.55)' : 'rgba(176, 158, 118, .55)'; c.lineWidth = 0.8;
      for (const [A, B, ph] of paths) for (const o of [-0.25, 0.25]) { wavy([A[0] + o * w * 0.6, A[1] + o * w * 0.6], [B[0] + o * w * 0.6, B[1] + o * w * 0.6], R * 0.02, ph + o); c.stroke(); }
      c.restore();
    } else {
      // Healthy: just the limiting plate, a hairline.
      c.strokeStyle = dark ? 'rgba(255,255,255,.1)' : 'rgba(80,50,50,.14)'; c.lineWidth = 1;
      for (const l of lobules) { hexPath(l); c.stroke(); }
    }
    // Portal tracts (connective tissue), thicker with portal fibrosis.
    const seen = new Set();
    for (const l of lobules) for (const [x, y] of l.corners) {
      const kk = Math.round(x) + ',' + Math.round(y);
      if (seen.has(kk)) continue; seen.add(kk);
      const near = Math.hypot(x - cx, y - cy) < R * 1.05, rt = G.rt * (1 + 0.9 * m.fibPre);
      c.globalAlpha = near ? 1 : 0.5;
      c.fillStyle = col(dark ? 0.22 + 0.4 * m.fibPre : 0.5 + 0.4 * m.fibPre); c.beginPath(); c.arc(x, y, rt, 0, TAU); c.fill();
      if (m.fibPre > 0.1) { c.strokeStyle = dark ? 'rgba(160,150,120,.5)' : 'rgba(176,158,118,.6)'; c.lineWidth = 0.8; for (const f of [0.7, 0.85]) { c.beginPath(); c.arc(x, y, rt * f, 0, TAU); c.stroke(); } }
      if (!near) {   // the neighbours' triads, drawn flat
        c.fillStyle = css(rgb01(ink('pv')), 0.55); c.beginPath(); c.ellipse(x, y, G.rt * 0.42, G.rt * 0.32, 0.4, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    // Bile ductules beside the arterioles (bile flows the other way: out to the triad).
    c.strokeStyle = v('--bile-duct', '#6E9B4E'); c.lineWidth = 1.6;
    for (const tr of G.triads) { c.beginPath(); c.arc(tr.bd[0], tr.bd[1], G.rt * 0.15, 0, TAU); c.stroke(); }
    // Central vein wall: collagen with post-sinusoidal fibrosis.
    if (m.fibPost > 0.05) { c.fillStyle = col(0.3 + 0.55 * m.fibPost); c.beginPath(); c.arc(cx, cy, G.rcv0 * (1.5 + m.fibPost), 0, TAU); c.fill(); }
    // Focus: the surround fades into the page.
    const vg = c.createRadialGradient(cx, cy, R * 1.15, cx, cy, R * 2.6);
    const bgc = rgb01(bg);
    vg.addColorStop(0, css(bgc, 0)); vg.addColorStop(1, css(bgc, 0.75));
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    if (flatVessels) paintFlatVessels(c, cs);
  }
  // Without WebGL2: the vessels as plain strokes on the tissue.
  function paintFlatVessels(c, cs) {
    const G = geo, art = cs.getPropertyValue('--artery').trim() || '#C8414D', casing = 'rgba(30, 24, 40, .45)';
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const t of G.tubes) {
      const r = radiusAt(t, N >> 1), isArt = t.kind === 'ha' || t.kind === 'tw', disc = t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha';
      const color = isArt ? art : tubeInk(t, 0);
      const [x0, y0] = t.pts[0];
      if (disc) {
        if (!isArt) { c.fillStyle = casing; c.beginPath(); c.arc(x0, y0, r + 1.2, 0, TAU); c.fill(); }
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
    if (lymphOn) {
      // Hepatic lymph as shimmer: plasma filtered into the space of Disse drifts out through the tissue
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
      if (Math.hypot(x - tr.ha[0], y - tr.ha[1]) < G.rt * 0.25) return { part: 'ha', tri: tr.i };
      if (Math.hypot(x - tr.bd[0], y - tr.bd[1]) < G.rt * 0.25) return { part: 'bd', tri: tr.i };
      return { part: 'triad', tri: tr.i };
    }
    if (Math.hypot(x - G.cx, y - G.cy) < radiusAt(G.cv, 0) + 4) return { part: 'cv' };
    let best = null, bd = Infinity;
    for (const t of G.tubes) {
      if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha') continue;
      const [d] = distTo(t.pts, x, y), r = radiusAt(t, N >> 1), tol = r + (t.kind === 'tw' ? 6 : 5);
      const score = d - r - (t.kind === 'tw' ? 2 : 0);
      if (d < tol && score < bd) { bd = score; best = t; }
    }
    if (best) return { part: best.kind === 'tw' ? 'ha' : best.kind[0] === 's' ? 'sin' : best.kind, tube: best.id, tri: best.tri };
    if (m.septU > 0.1) {
      const C = G.lobules[0].corners, w = G.R * (0.02 + 0.05 * m.septU) / 2 + 4;
      for (let i = 0; i < 6; i++) { const A = C[i], B = C[(i + 1) % 6], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = clamp(((x - A[0]) * dx + (y - A[1]) * dy) / L2, 0, 1); if (Math.hypot(A[0] + dx * t - x, A[1] + dy * t - y) < w) return { part: 'septum' }; }
      if (m.septU > 0.35) for (const sp of G.septaPC) if (distTo(sp.pts, x, y)[0] < w) return { part: 'septum' };
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

  return {
    el,
    update,
    /** 0 = hidden, 1 = fully in the lobule. It fades in where it stands, over the dive's field. */
    setFade(u) {
      const was = fade;
      fade = clamp(u, 0, 1);
      el.style.opacity = fade.toFixed(3);
      el.classList.toggle('on', fade > 0.98);
      el.setAttribute('aria-hidden', String(fade < 0.98));
      // Entering: the card opens (on a phone, compact) and the lobule is framed beside it.
      if (fade > 0 && was === 0) { setOpen(!phoneMQ.matches); resetView(); if (F) update(F); }
      // Leaving the lobule closes a part's card, so it is not waiting next time.
      if (was > 0.98 && fade <= 0.98) { if (store.get().selection?.type === 'lobule') store.set({ selection: null }); }
      if (fade === 0) { cancelAnimationFrame(raf); raf = 0; last = 0; }
    },
    /** Where the lobule will sit once open (stage px): its centre and radius, framed as it opens. */
    landing() {
      const rect = host.getBoundingClientRect();
      ensureGeo(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      if (fade === 0) setOpen(!phoneMQ.matches);
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
