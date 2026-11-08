// The Δ halos: after a change the three places whose pressure moved most get a brief ring and their change in mmHg, drawn as outlines on the overlay painter, and the vessels that moved glow.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, NODES } from '../engine/topology.js';
import { HIDDEN_NODES, NODE_POS } from './anatomy.js';
import { D_SURFACE, easeArrive } from './ease.js';
import { cancelFrame } from './frame.js';
import { reduceMotionMQ as reduceMotion, HALO_MS } from './motion.js';
import { createScope } from './scope.js';
import { restPass } from './rest-pass.js';
import { store } from './store.js';
import { glyphsReady, loadGlyphs, textPolys } from './text-gl.js';
import { s } from './util.js';

import { stageScope } from './stage-scope.js';
export function createHalos(st, live) {
  const { E, NI, drawFrame, easeInOut, gOver, haloEls, nodePos, quietFx, routeCustomShunts, setGlowSrc, updateGeometry } = st;
  // Δ halos: after a change, the three places whose pressure moved most get a brief ring and
  // their change in mmHg, once the model has had a moment to respond. Answers "what did that do?"
  // without a sweep across the whole figure.
  const gHalo = s('g', { id: 'halos', 'aria-hidden': 'true' });
  haloEls.push(gHalo);
if (live.haloK) gHalo.style.setProperty('--halo-k', live.haloK);
  gOver.after(gHalo);
  let haloBase = null, haloTimer = 0, deltaT = 0;
  // The halos drawn as shapes the overlays' GPU painter reads (stage-over.js), not as an SVG text and a CSS-animated circle (which
  // sent the halos and every overlay above them back to the SVG for their 1.5 s): the ring a path whose outline grows and fades and
  // the number its glyphs' outlines (text-gl.js, the font's own), over a knock-out stroke in the page's colour, as the text's
  // paint-order stroke was; both eased here a frame at a time (haloPlay) on the attributes the painter reads at each paint, as the
  // keyframes haloRing and haloText eased them. (Until the outlines are in, the SVG text and its CSS animation.)
  const haloNone = [];   // (no glow: the delta source is set to this, never to a fresh empty list)
  const haloNoop = () => {};
  createScope().timer(() => loadGlyphs().catch(haloNoop), 3000);   // (the outlines fetched ahead of the first halo, after start-up)
  // (A circle's path by its radius: the last one kept, so the three halos of a frame share one string, and a still frame builds none.)
  let ringDr = NaN, ringDs = '';
  function ringD(r) {
    if (r !== ringDr) { ringDr = r; ringDs = `M${-r} 0A${r} ${r} 0 1 0 ${r} 0A${r} ${r} 0 1 0 ${-r} 0Z`; }
    return ringDs;
  }
  function polysD(polys) {
    let d = '';
    for (let j = 0; j < polys.length; j++) {
      const p = polys[j];
      for (let k = 0; k < p.pts.length; k += 2) d += (k ? 'L' : 'M') + p.pts[k].toFixed(2) + ' ' + p.pts[k + 1].toFixed(2);
      if (p.closed) d += 'Z';
    }
    return d;
  }
  function haloShapes(txt) {
    const look = { weight: 700, size: 16, tnum: true }, w = textPolys(txt, 0, 0, look).w, d = polysD(textPolys(txt, -w / 2, -24, look).polys);
    return [s('path', { class: 'halo-ring', d: ringD(8), 'stroke-opacity': 0 }), s('path', { class: 'halo-knock', d, opacity: 0 }), s('path', { class: 'halo-num', d, opacity: 0 })];
  }
  // (haloRing: r 8 → 26 over 1.5 s, its stroke at nothing, .9 at a fifth, nothing at the end; haloText: in by an eighth, held to 70 %,
  // out by the end; each stretch eased as the keyframes' own --ease.)
  const seg = (p, a, b) => easeArrive(Math.min(1, Math.max(0, (p - a) / (b - a))));
  let haloRaf = 0, haloT0 = 0, haloScaleK = NaN, haloScaleS = '';
  function haloStep(now) {
    haloRaf = 0;
    const p = Math.min(1, (now - haloT0) / HALO_MS), still = reduceMotion.matches;
    const r = still ? 16 : 8 + 18 * easeArrive(p), so = still ? 1 : p < 0.2 ? 0.9 * seg(p, 0, 0.2) : 0.9 * (1 - seg(p, 0.2, 1));
    const to = still ? 1 : p < 0.12 ? seg(p, 0, 0.12) : p < 0.7 ? 1 : 1 - seg(p, 0.7, 1);
    // (the strings of this frame, made once and not for each of the halos)
    const scaleK = +live.haloK || 1;
    if (scaleK !== haloScaleK) { haloScaleK = scaleK; haloScaleS = `scale(${scaleK})`; }
    const rD = ringD(+r.toFixed(2)), soS = so.toFixed(3), toS = to.toFixed(3);
    for (const g of gHalo.children) {
      const ch = g.firstChild?.children;
      const ring = ch?.[0], knock = ch?.[1], num = ch?.[2];
      if (!ring) continue;
      g.firstChild.setAttribute('transform', haloScaleS);   // (its size on screen at any zoom, as --halo-k sets the SVG's: an attribute the painter reads)
      ring.setAttribute('d', rD); ring.setAttribute('stroke-opacity', soS);
      knock.setAttribute('opacity', toS); num.setAttribute('opacity', toS);
    }
    if (p < 1 && !still && gHalo.childElementCount) haloRaf = drawFrame(haloStep);
  }
  function haloPlay() { haloT0 = performance.now(); if (haloRaf) cancelFrame(haloRaf); haloRaf = drawFrame(haloStep); }
  // Opening or resuming the app restores parameters and the model settles; that is not a change to explain.
  let resumedAt = 0;
  document.addEventListener('visibilitychange', () => { resumedAt = performance.now(); });
  addEventListener('pageshow', () => { resumedAt = performance.now(); });
  const haloBaseKept = { P: new Float64Array(NODES.length), t: 0, timer: 0 };
  const haloBaseFire = () => { if (live.F && haloBase) { haloBase.t = 0; restPass(haloRest); } };
  store.on('params', () => {
    if (routeCustomShunts(store.get().params)) updateGeometry(true);
    // (A presentation explains its own changes: no halos over its slides.)
    if (!live.F || quietFx() || store.get().presenting || performance.now() < 5000 || performance.now() - resumedAt < 4000) return;
    if (!haloBase) {
      const P = haloBaseKept.P, src = live.F.P;
      for (let i = 0; i < P.length; i++) P[i] = src[i];   // (the nodes' pressures as they were: kept, written over, never made)
      haloBaseKept.t = performance.now(); haloBaseKept.timer = 0; haloBase = haloBaseKept;
    }
    stageScope.clear(haloBase.timer);
    haloBase.timer = stageScope.timer(haloBaseFire, 1200);
  });
  // Loading a patient (or going back to one) is not a change to explain: no halos, and none left
  // over in a view they no longer mark.
  function dropHalos() {
    if (haloBase) stageScope.clear(haloBase.timer);
    haloBase = null;
    stageScope.clear(haloTimer);
    gHalo.replaceChildren(); setGlowSrc('delta', haloNone);
  }
  store.on('presetId', dropHalos);
  store.on('view', dropHalos);
  // (The halos are built as a task between frames (rest-pass.js), once, 1.2 s after the change: never inside a frame or a timer's own turn.)
  function haloRest() { if (live.F) stepHalos(live.F, easeInOut(live.morph)); }
  const haloClear = () => gHalo.replaceChildren();
  const deltaClear = () => setGlowSrc('delta', haloNone);
  function stepHalos(f, t) {
    if (!haloBase || performance.now() - haloBase.t < 1100) return;
    const base = haloBase.P; haloBase = null;
    if (quietFx() || !f.P) return;
    const cand = [];
    for (const n of NODES) {
      // (A ring marks a place on a drawn vessel: none over a station with nothing drawn at it, as no dot is.)
      if (n.kind === 'wedge' || HIDDEN_NODES.has(n.id) || !NODE_POS[n.id] || !live.nodeVisible(n.id)) continue;
      const d = f.P[NI[n.id]] - base[NI[n.id]];
      if (Math.abs(d) >= 1) cand.push([n.id, d]);
    }
    cand.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    stageScope.clear(haloTimer);
    // The vessels whose pressure moved by 2 mmHg or more glow briefly (warm: up, cool: down), so the
    // reach of a change shows along the network, not only at the three rings.
    const glows = [];
    for (const e of EDGES) {
      const x = E[e.id];
      if (!x?.vis || x.isArt || e.kind === 'wedge' || x.ghost) continue;
      const d = (f.P[NI[e.from]] + f.P[NI[e.to]] - base[NI[e.from]] - base[NI[e.to]]) / 2;
      if (Math.abs(d) >= 2) glows.push([x, d]);
    }
    glows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!reduceMotion.matches) setGlowSrc('delta', glows.slice(0, 16).map(([x, d]) => ({ id: x.e.id, col: d > 0 ? 'var(--glow-up)' : 'var(--glow-down)', amt: 1.35, wide: 1.1, dur: D_SURFACE })));
    const gpu = glyphsReady();
    gHalo.replaceChildren(...cand.slice(0, 3).map(([id, d]) => {
      const [x, y] = nodePos(id, t);
      // (Its ring and number keep their size on screen at any zoom, as the labels do: --halo-k, applyClampFs. Drawn in world units,
      // the number was 4 to 6 px on a phone. One decimal, as every reading.)
      const txt = `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;
      const inner = gpu ? haloShapes(txt) : [s('circle', { r: 16 }), s('text', { y: -24, 'text-anchor': 'middle' }, txt)];
      return s('g', { class: 'halo ' + (d > 0 ? 'up' : 'down') + (gpu ? ' gl' : ''), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, gpu ? s('g', { class: 'halo-gin', transform: `scale(${+live.haloK || 1})` }, ...inner) : s('g', { class: 'halo-in' }, ...inner));
    }));
    if (gpu) haloPlay();
    haloTimer = stageScope.timer(haloClear, 1700);
    stageScope.clear(deltaT); deltaT = stageScope.timer(deltaClear, 1000);
  }
  return { polysD };
}
