// The clamp labels and overlays: where each clamp's label sits, the overlay paint and its commit.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { isOccluded } from '../engine/topology.js';
import { SPLEEN_CENTER, SPLEEN_PSE_BADGE } from './anatomy.js';
import { CLOT_EDGE, clotLayers, clotRadius, clotShift, clotSide, clotSpan, hashSeed } from './clot-shape.js';
import { bandRing } from './band-ring.js';
import { pressureColor } from './colormap.js';
import { heldBin } from './idle-keys.js';
import { D_SMALL } from './ease.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { store } from './store.js';
import { glyphsReady, loadGlyphs, textBox, textPolys } from './text-gl.js';
import { s } from './util.js';
import { EUS_GLUE_TARGET } from './eus-scope.js';
import { ringShapes } from './scope-lens-rule.js';

import { stageScope } from './stage-scope.js';
// The embolized spleen badge's fill: the part of a circle of radius 9 below a chord 1.8 above its centre (about 60% of it), as M/L
// points only (the marks' GPU reader takes M, L, C, Q and Z: an arc would leave the mark on the SVG).
const PSE_A = Math.asin(1.8 / 9);
// The scope ring's two looks (closed: dashed; open: solid), made once.
const RING_SHAPES = [ringShapes(false), ringShapes(true)];
// (The lens's cone, in world units: a faint fill between its two lines, and the lines. Made only when the lens is laid, never in a move.)
const coneShapes = ({ a, b, lw }) => { const f = (v) => +v.toFixed(2), P = (x, y) => `${f(x)} ${f(y)}`; return [
  ['path', { d: `M${P(a[0], a[1])} L${P(a[2], a[3])} L${P(b[2], b[3])} L${P(b[0], b[1])} Z`, fill: 'var(--text)', 'fill-opacity': 0.07, stroke: 'none' }],
  ['path', { d: `M${P(a[0], a[1])} L${P(a[2], a[3])} M${P(b[0], b[1])} L${P(b[2], b[3])}`, fill: 'none', stroke: 'var(--text)', 'stroke-opacity': 0.5, 'stroke-width': f(lw), 'stroke-linecap': 'round' }]]; };
function pseFillD(x, y) {
  let d = '';
  for (let k = 0; k <= 16; k++) { const a = Math.PI + PSE_A - k * (Math.PI + 2 * PSE_A) / 16; d += `${k ? ' L' : 'M'}${(x + 9 * Math.cos(a)).toFixed(2)} ${(y + 9 * Math.sin(a)).toFixed(2)}`; }
  return d + ' Z';
}

// Where the Warren shunt ties the coronary vein, as a share of its course from the stomach to the portal vein (engine.js closes the same vein).
const CORONARY_TIE = 0.75;

export function createClamps(st, live) {
  const { E, LIGATED, NI, N_SAMPLES, anastomoses, applyClampFs, clampA, clampD, clampFading, clampMv, clampShade, clampW, clampWOut, findingHidden, geo, ligature, markA, marksSync, mk, ov, placeClampLabels, pointAt, polyD, polysD, putMark, recruitFrac, rotDeg, stenosisAt, stentMesh, tubeOutline, updateLabels, venousSync, worldToLocalInto } = st;
  // How far a point's callout stands from its dot: clear of the stent's body, its leader 16 px at most.
  const colGap = (sid) => Math.min(16, ((E[sid]?.width || 4) * live.CTM.sc) / 2 + 7);
  // (The "60 %" is drawn in the figure's own units, in the labels' own name size on screen (fontPx 11.5: 12 px at least, the text size
  // setting and a presentation's projector size included), the weight and the 7 px stage-colour halo of the callouts beside it.)
  // (Its halo a constant 7 px wide on screen, whatever the zoom: wide enough to fill the counters of "6", "0" and "%" too, so
  // the figure never shows through inside a digit: Review 16 Oct.)
  const clampFontAt = (el) => {
    const px = live.fontPx(11.5);
    if (Math.abs(px - live.clampBase) > 0.01) { live.clampBase = px; applyClampFs(); }
    const fs = live.CTM.sc > 0 && live.CTM.sc < 1 ? live.clampBase / live.CTM.sc : 0;   // (written only when it moved: the same size is no change)
    if (el._fs !== fs) { el._fs = fs; el.style.fontSize = fs ? `${fs.toFixed(2)}px` : ''; }
    clampGlyphs(el);
  };
  // Moves a "60 %" to `want` ({ d, t } or null: back where it belongs): it fades out where it stands, then in at the new place.
  const clampFades = new WeakMap();
  function clampStep(id, want) {
    const m = clampMv.get(id) || { cur: null, want: null, busy: false }, same = (a, b) => (a ? !!b && a.d === b.d && a.t === b.t : !b);
    clampMv.set(id, m);
    if (m.busy) return;
    m.want = want;
    if (same(m.cur, want)) return;
    const els = () => [...clampW.querySelectorAll(`.clamp-label[data-id="${id}"]`)];
    m.busy = true;
    const dur = reduceMotion.matches ? 0 : D_SMALL;
    // (From and to its own opacity as it stands, the keyframe left out: no style read for it. 1 Nov 2026.)
    // (2 Nov 2026: the fade it ran is kept and cancelled by name, not looked up with getAnimations, which read the page's styles.)
    for (const el of els()) { clampFades.get(el)?.cancel(); const a = el.animate?.([{ opacity: 0 }], { duration: dur, fill: 'forwards' }); if (a) clampFades.set(el, a); }
    stageScope.timer(() => {
      m.cur = m.want; m.busy = false;
      for (const el of els()) { clampFades.get(el)?.cancel(); clampFades.delete(el); clampLabelAt(el); el.animate?.([{ opacity: 0, offset: 0 }], { duration: dur }); }
      if (live.F) updateLabels(live.F);
    }, dur);
  }
  // A narrowing's "60 %": one rule for where it stands, whichever code asks (the marks' rebuild, a change of zoom, the layout's search).
  // Its spot is d past the clamp's arrows on one side of the vessel and t along it (the layout's, or 16 and 0), the text reading
  // outward from there, ending at the spot on the clamp's left on screen and starting there on its right, level whatever the turn.
  function clampLabelAt(el) {
    const q = clampLabelPos(el);
    if (!q) return;
    const { x, y, left, gap, deg } = q;
    // (Each attribute is written only when its numbers moved: the same numbers make the same text.)
    if (el._ax !== x || el._ay !== y) { el._ax = x; el._ay = y; el.setAttribute('x', x.toFixed(2)); el.setAttribute('y', y.toFixed(2)); }
    if (el._ag !== gap || el._al !== left) { el._ag = gap; el.setAttribute('dx', (left ? -gap : gap).toFixed(2)); el.setAttribute('dy', gap.toFixed(2)); }
    if (el._al !== left) { el._al = left; if (left) el.setAttribute('text-anchor', 'end'); else el.removeAttribute('text-anchor'); }
    if (el._ad !== deg || el._atx !== x || el._aty !== y) { el._ad = deg; el._atx = x; el._aty = y; if (deg) el.setAttribute('transform', `rotate(${(-deg).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`); else el.removeAttribute('transform'); }
    clampGlyphs(el);
  }
  // (2 Nov 2026: a "60 %"'s box worked out in script, from its own attributes and Inter's advances and metrics (textBox), as getBBox
  // gives it, so the labels' search lays nothing out. Its size: its own, else the clamps' --clamp-fs. The outlines come in once, and
  // the labels are laid again then.)
  let clampGlyphAsk = false;
  const clampTbOpts = { anchor: 'start', weight: 600, size: 12, tnum: true, k: 1 };
  const attrNum = (el, k) => parseFloat(el.getAttribute(k)) || 0;
  const clampTmp = [0, 0], clampXs = [0, 0], clampPos = { x: 0, y: 0, left: false, gap: 0, deg: 0 };
  // A "60 %"'s outlines: two paths (the halo, then the glyphs) from Inter's outlines at the label's own size and spot, written only when
  // one of them moved. Not yet drawn while the outlines are not in (clampGlyphsIn lays it again then).
  const clampLook = { weight: 600, size: 12, tnum: true };
  function clampGlyphs(el) {
    if (el._txt == null || !glyphsReady()) return;
    // (Always the size the camera asks for now, live.clampFs, never the font-size written on the element at the last layout: that stood
    // at the zoom of the last solve, so the "60 %" was drawn at an old zoom's size, huge after a zoom in, between two solves.)
    const size = parseFloat(live.clampFs) || 12, end = el.getAttribute('text-anchor') === 'end';
    const x = attrNum(el, 'x') + attrNum(el, 'dx'), y = attrNum(el, 'y') + attrNum(el, 'dy');
    if (el._gs === size && el._gx === x && el._gy === y && el._ge === end && el._gp) return;
    el._gs = size; el._gx = x; el._gy = y; el._ge = end;
    clampLook.size = size;
    const w = textPolys(el._txt, 0, 0, clampLook).w, d = polysD(textPolys(el._txt, end ? x - w : x, y, clampLook).polys);
    if (!el._gp) { el._gp = [s('path', { class: 'clamp-halo' }), s('path', { class: 'clamp-glyph' })]; el.replaceChildren(el._gp[0], el._gp[1]); }
    el._gp[0].setAttribute('d', d); el._gp[1].setAttribute('d', d);
  }
  const clampGlyphsIn = () => { placeClampLabels(); if (live.F) updateLabels(live.F); };
  function clampTextBox(el) {
    if (!glyphsReady()) { if (!clampGlyphAsk) { clampGlyphAsk = true; loadGlyphs().then(clampGlyphsIn); } return null; }
    const cls = el.getAttribute('class') || '';
    const size = (/clamp-label/.test(cls) && parseFloat(live.clampFs)) || parseFloat(el.style.fontSize) || 12;   // (a live "60 %" at the camera's size now, as clampGlyphs draws it)
    const o = clampTbOpts;   // (kept, rewritten: textBox reads it and holds nothing)
    o.anchor = el.getAttribute('text-anchor') || 'start'; o.size = size; o.k = live.CTM?.sc > 0 ? live.CTM.sc : 1;
    return textBox(el._txt ?? el.textContent, attrNum(el, 'x') + attrNum(el, 'dx'), attrNum(el, 'y') + attrNum(el, 'dy'), o);   // (tnum: the "60 %" is drawn in tabular figures (#labels text), so its box is one width whatever its digits are)
  }
  // Where clampLabelAt puts a clamp's percentage (its spot, which side its text runs and its offset), without writing it.
  function clampLabelPos(el) {
    const c = el._c;
    if (!c) return null;
    const away = c.id === live.clampFor ? live.clampAway : null;
    const kept = c.id === live.clampFor ? clampD.get(c.id) : null, mv = c.id !== live.clampFor ? clampMv.get(c.id)?.cur : null;
    const d = c.off + (el._d ?? mv?.d ?? kept?.d ?? 16), t = el._d != null ? el._t ?? 0 : mv?.t ?? kept?.t ?? 0;
    // (The two spots, one each side of the vessel, d out and t slid along it.)
    const p0x = c.x + c.nx * 1 * d - c.ny * t, p0y = c.y + c.ny * 1 * d + c.nx * t, p1x = c.x + c.nx * -1 * d - c.ny * t, p1y = c.y + c.ny * -1 * d + c.nx * t;
    const xs = clampXs;
    xs[0] = worldToLocalInto(clampTmp, p0x, p0y)[0]; xs[1] = worldToLocalInto(clampTmp, p1x, p1y)[0];
    const k = away && (away === 'W') !== (xs[0] < xs[1]) ? 1 : 0, left = xs[k] < xs[1 - k] - 0.5;
    const q = clampPos;   // (kept, rewritten: every caller reads it at once)
    q.x = k ? p1x : p0x; q.y = k ? p1y : p0y; q.left = left;
    const gap = (6 * live.clampBase) / 12 / Math.max(live.CTM?.sc || 1, 1e-3), deg = rotDeg();   // (6 px on screen at 12 px text, the text's own offset from its spot, in step with the text's size)
    q.gap = gap; q.deg = deg;
    return q;
  }
  // A quantized value that only moves once the input has clearly left its step (so a varix whose
  // diameter pulses across a rounding boundary is not rebuilt on every beat).
  const held = {};
  const hold = (k, v, step) => { const h0 = held[k]; if (h0 == null || Math.abs(v - h0) > step * 0.75) held[k] = Math.round(v / step) * step; return held[k]; };
  // (What the overlays are built from is compared, not made into a text key: every input is written, in order, onto one of two kept lists,
  // which is compared with the last one; what overlayInputs returns is the count of the times they differed.)
  const okA = [], okB = [], okW = new Map(), okG = new Map();
  let okCur = okA, okNext = okB, ovInVer = 1, okT = NaN, okTs = '';
  function okFlat(o, v) {   // (a value onto the list: an object or an array between its marks, a number that is not one as 'NaN')
    if (v === null || typeof v !== 'object') { o.push(typeof v === 'number' && v !== v ? 'NaN' : v); return; }
    if (Array.isArray(v)) { o.push('['); for (let i = 0; i < v.length; i++) okFlat(o, v[i]); o.push(']'); return; }
    o.push('{'); for (const k in v) { o.push(k); okFlat(o, v[k]); } o.push('}');
  }
  function okLesion(o, id) {   // (A vessel's width eases with its pressure for a long while after a change; held in steps, so a clot or stent is not rebuilt several times a second for sub-pixel drift.)
    if (!E[id]) { o.push('-'); return; }
    let kw = okW.get(id), kg = okG.get(id);
    if (kw === undefined) { kw = `w${id}`; kg = `g${id}`; okW.set(id, kw); okG.set(id, kg); }
    o.push(E[id].vis, hold(kw, E[id].width, 0.25), !!E[id].reveal, geo[id]?.wig ? hold(kg, geo[id].wig, 0.5) : 0);   // (a collateral coils as it opens, so a mark on it is drawn again on the path it has now)
  }
  function overlayInputs(f, p, t) {
    const o = okNext;
    o.length = 0;
    if (t !== okT) { okT = t; okTs = t.toFixed(3); }
    o.push(okTs, live.isImaging(), findingHidden('clot'));
    okFlat(o, p.stenosis); okFlat(o, p.stenosisSite); okFlat(o, p.thrombus); okFlat(o, p.occluded); o.push(p.splenicRx | 0);
    okFlat(o, p.tips); okFlat(o, p.dips); o.push(!!p.portocavalSide); okFlat(o, p.customShunts); okFlat(o, p.balloonEso); okFlat(o, p.balloonGas);
    for (const id in p.stenosis) okLesion(o, id);
    for (const id in p.thrombus) okLesion(o, id);
    for (const id in p.occluded) okLesion(o, id);
    okLesion(o, 'LGV_CONF'); okLesion(o, 'TIPS'); okLesion(o, 'DIPS'); okLesion(o, 'S_PC'); okLesion(o, 'S_DSR'); okLesion(o, 'S_MC'); okLesion(o, 'REX');
    for (let i = 0; i < LIGATED.length; i++) okLesion(o, LIGATED[i][1]);
    for (const id in p.customShunts) okLesion(o, id);
    const stented = store.get().stented;
    if (stented) for (let i = 0; i < stented.length; i++) okLesion(o, stented[i]);
    okLesion(o, 'C3');
    o.push(live.scopeRing.on ? (live.scopeRing.open ? 2 : 1) : 0, live.scopeRing.cv);   // (the scope view's ring: shown, and its lens open; scope-lens.js says whether there is a varix to show it on)
    // (The varices are no longer drawn here, but by the plexus of channels and strands (varix-look.js), so the varix's diameter, radius
    // and wall-stress ratio are not part of what these overlays are built from. They were in this key, held in steps narrower than the
    // beat's own swing, and rebuilt the clamps, clots and plugs, and the vessel marks with them (a style pass and a triangulation of
    // every mark), five to ten times a second in any patient with a varix.)
    o.push(Math.round(f.bands || 0), hold('c3', recruitFrac('C3', f), 0.1),
      // (The embolized spleen's badge is drawn at the organ's size, which the organ itself follows each frame while it shrinks or
      // grows: held in steps, so the patches ride it in a few small rebuilds, not stay at the size they were first drawn at.)
      p.splenicRx === 1 ? hold('sp', f.slow.spleen / 11, 0.02) : 0, live.lastMorph);
    let same = o.length === okCur.length;
    for (let i = 0; same && i < o.length; i++) if (o[i] !== okCur[i] && (o[i] === o[i] || okCur[i] === okCur[i])) same = false;   // (a NaN is the same as a NaN)
    if (!same) { okNext = okCur; okCur = o; ovInVer++; }
    return ovInVer;
  }
  const vxBin = [NaN, NaN];   // (the bins --vx shows now: varices, gastric varices)
  const setVar = (el, k, v) => { const c = el._v || (el._v = {}); if (c[k] === v) return; c[k] = v; el.style.setProperty(k, v); };
  function updateOverlays(f, p, gain, t) {
    // Colors follow pressure continuously through CSS variables; geometry rebuilds only on change.
    const PM = f.Pf || f.P;
    vxBin[0] = heldBin(vxBin[0], PM[NI.VAR]); vxBin[1] = heldBin(vxBin[1], PM[NI.GV]);   // (held: a pressure breathing across a bin's edge must not flip the colour, and the organ layer with it)
    setVar(ov.varices, '--vx', pressureColor(vxBin[0]));
    setVar(ov.gvarices, '--vx', pressureColor(vxBin[1]));
    const key = overlayInputs(f, p, t);
    live.balloonStep(p, t < 0.5);
    venousSync(p, t < 0.5, key !== live.overlayKey);
    if (key === live.overlayKey) return;
    live.overlayKey = key;
    ovAskBuf.f = f; ovAskBuf.p = p; ovAskBuf.t = t; ovAsk = ovAskBuf;   // (the last ask wins: one kept record, rewritten)
    if (!ovAsked) { ovAsked = true; restPass(overlayCommit); }
  }
  // The overlays' structure (clamps, clots, shunt meshes, marks, bands) is rebuilt between frames from what the frame last asked for.
  let ovAsk = null, ovAsked = false;
  const ovAskBuf = { f: null, p: null, t: 0 };
  // The scope ring shown, or its lens opened or shut: the overlays are built again from what they were last asked for (the ring is in their key).
  live.scopeRingRefresh = () => { if (ovAskBuf.f) updateOverlays(live.F || ovAskBuf.f, ovAskBuf.p, 1, ovAskBuf.t); };
  function overlayCommit() {
    ovAsked = false;
    if (!ovAsk) return;
    const { f, p, t } = ovAsk;
    const anat = t < 0.5;
    // stenosis clamps & thrombi
    const hideDx = store.get().found ? findingHidden('clot') : live.isImaging();
    // (A narrowing that goes leaves its clamp and "60 %" to fade out in ov.clampsOut, under other classes so the label
    // layout never counts them; one that comes, or comes back, fades in from where it stands.)
    const want = new Set(Object.entries(p.stenosis).filter(([id, v]) => !hideDx && v > 0 && E[id]?.vis).map(([id]) => id));
    if (!clampFading()) live.clampLast = performance.now();
    for (const el of [...ov.clamps.children, ...clampW.children]) {
      const id = el.dataset.id;
      if (want.has(id)) continue;
      const c = clampA.get(id);
      if (!c) { el.remove(); continue; }
      c.on = false;
      el.classList.replace('clamp', 'clamp-out'); el.classList.replace('clamp-label', 'clamp-label-out');
      (el._c ? clampWOut : ov.clampsOut).append(el);
    }
    for (const id of want) {
      const c = clampA.get(id);
      if (!c) clampA.set(id, { a: 0, on: true });
      else if (!c.on) { c.on = true; for (const el of [...ov.clampsOut.querySelectorAll(`[data-id="${id}"]`), ...clampWOut.querySelectorAll(`[data-id="${id}"]`)]) el.remove(); }
    }
    ov.clamps.innerHTML = ''; clampW.replaceChildren(); ov.stents.innerHTML = ''; ov.plugs.innerHTML = '';
    if (!markA.moving()) live.markLast = performance.now();
    markA.begin(); live.ovT = t;
    // Clots keep their own key: growing varices (the disease clock) rebuild the rest, not them.
    const tk = JSON.stringify([t.toFixed(3), hideDx, p.thrombus, Object.keys(p.thrombus).map((id) => (E[id] ? [E[id].vis, held[`w${id}`]] : 0))]);
    const clots = tk !== live.thrombiKey;
    if (clots) { live.thrombiKey = tk; ov.thrombi.innerHTML = ''; }
    for (const [id, v] of Object.entries(p.stenosis)) {
      if (!want.has(id)) continue;
      const [x, y, dx, dy] = pointAt(geo[id].cur, stenosisAt(id, p));
      const n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      const off = (E[id].width / 2) * (1 - v) + 3;
      for (const sgn of [1, -1]) {
        const bx = x + nx * sgn * (off + 8), by = y + ny * sgn * (off + 8);
        const tx = x + nx * sgn * off, ty = y + ny * sgn * off;
        const ux = dx / n * 4.5, uy = dy / n * 4.5;
        ov.clamps.append(s('path', { class: 'clamp', 'data-id': id, d: `M${tx} ${ty} L ${bx + ux} ${by + uy} L ${bx - ux} ${by - uy} Z` }));
      }
      // (A group of two outline paths, the halo and the glyphs, drawn by the overlay painter: words are not its own, clampGlyphs.)
      const lab = s('g', { class: 'clamp-label', 'data-id': id });
      lab._txt = `${Math.round(v * 100)}%`;
      lab._c = { id, x, y, nx, ny, off }; clampLabelAt(lab); clampFontAt(lab);
      clampW.append(lab);
      clampShade(id);
    }
    placeClampLabels();
    // Thrombus: a lumpy clot lying against one wall of the lumen, drawn as soft stacked layers of one
    // deep red (see clotLayers) so it is darkest where thickest and fades into the vessel at its edges.
    // A hairline in a darker shade of the same red traces only its free edge in the lumen, so it reads
    // as resting on the wall. Below full occlusion the vessel's own blood shows down the open side.
    // Its thickness, length and lumps are smooth in the occlusion (see clot-shape.js), so an eased change
    // eases the clot: it thickens from the wall inwards, then lengthens.
    for (const [id, v] of Object.entries(clots ? p.thrombus : {})) {
      if (hideDx || !(v > 0) || !E[id] || !E[id].vis) continue;
      // W is a little inside the drawn lumen, so the clot's soft edge never spills onto the vessel wall.
      const g = geo[id], lit = g.lit, W = E[id].width * 0.9;
      const seed = hashSeed(id), side = clotSide(seed), { u0, u1 } = clotSpan(v);
      const i0 = Math.round(u0 * (N_SAMPLES - 1)), i1 = Math.round(u1 * (N_SAMPLES - 1));
      const pts = g.cur.slice(i0, i1 + 1), ln = lit.slice(i0, i1 + 1), n = pts.length;
      if (n < 3) continue;
      const rOf = (f) => clotRadius(v, W, f, seed);
      const mid = pts.map((q, i) => { const sh = clotShift(W, rOf(i / (n - 1)), side); return [q[0] + ln[i][0] * sh, q[1] + ln[i][1] * sh]; });
      for (const { cls, k } of clotLayers) ov.thrombi.append(s('path', { class: cls, d: tubeOutline(mid, ln, (f) => rOf(f) * k) }));
      const edge = mid.map((q, i) => { const r = rOf(i / (n - 1)) * CLOT_EDGE; return [q[0] - ln[i][0] * side * r, q[1] - ln[i][1] * side * r]; });
      ov.thrombi.append(s('path', { class: 'thrombus-edge', d: polyD(edge) }));
    }
    for (const id of ['TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', 'REX', ...Object.keys(p.customShunts || {})]) {
      if (!E[id].vis || E[id].reveal) continue;
      if (id === 'TIPS' || id === 'DIPS' || id.startsWith('X_')) stentMesh(id, p); else anastomoses(id);
    }
    // The stump of the vessel each surgical shunt divides, a clear gap past where the shunt leaves it.
    // (A side-to-side portocaval shunt divides nothing: the trunk stays whole and untied.)
    for (const [shunt, vein] of LIGATED) if (E[shunt].vis && !E[shunt].reveal && E[vein]?.vis && !(vein === 'PV_TRUNK' && p.portocavalSide)) ligature(vein, shunt);
    // The Warren shunt also ties off the coronary vein (the engine closes it too): two ties and the plug's cross, three quarters of the way to the portal vein.
    if (E.S_DSR.vis && !E.S_DSR.reveal && E.LGV_CONF?.vis) ligature('LGV_CONF', 'S_DSR', CORONARY_TIE);
    for (const id of new Set([...Object.keys(p.occluded), ...(p.occluded.C5 ? ['C2'] : [])])) {
      if (!isOccluded(p, id) || !E[id] || !E[id].vis) continue;
      // (EUS-guided glue closes the varix alone, C2 with the shunt open: its X sits where the needle went in, on the varix: proc-anim.js ENDO.)
      const [x, y] = pointAt(geo[id].cur, id === 'C2' && !p.occluded.C5 ? EUS_GLUE_TARGET[1] : 0.5);
      putMark(ov.plugs, `plug:${id}`, id, [s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 })]);
    }

    // Spleen: after a splenectomy the organ fades (see the opacity set with its size) and a badge with a cross is drawn on it; a
    // partial embolization fades the infarcted lower part the same way (the spleen's own group: stage.js detailFor) and the same
    // badge carries a circle filled across its lower part in place of the cross (mock A, 6 Nov 2026), at the infarct, with the size.
    const rx = p.splenicRx | 0;
    if (anat && rx) {
      const [cx, cy] = SPLEEN_CENTER, sc = f.slow.spleen / 11;
      // (One badge for both: the disc and the embolized one's ring through ring(), the glyph by treatment.)
      const pse = rx === 1, x = pse ? cx + SPLEEN_PSE_BADGE[0] * sc : cx + 12, y = pse ? cy + SPLEEN_PSE_BADGE[1] * sc : cy + 6;
      const ring = (r, fill, w) => s('circle', { cx: x, cy: y, r, fill, stroke: 'var(--danger)', 'stroke-width': w });
      const glyph = pse ? [s('path', { d: pseFillD(x, y), fill: 'var(--danger)' }), ring(9, 'none', 2)]
        : [s('path', { d: `M${x - 8} ${y - 8} L ${x + 8} ${y + 8} M${x + 8} ${y - 8} L ${x - 8} ${y + 8}`, stroke: 'var(--danger)', 'stroke-width': 3, 'stroke-linecap': 'round' })];
      putMark(ov.plugs, pse ? 'spleen:pse' : 'spleen:cross', null, [ring(18, 'var(--surface)', 2.5), ...glyph], true);
    }
    // The varices themselves are shown by the plexus of channels feeding and draining them (see
    // STRANDS in anatomy.js), which swell as they are recruited; here only the bands, fitted at
    // ligation, are drawn over the lower esophagus.
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      // (Each band lies on the drawn esophagus, turned to its walls and inside them: band-ring.js.)
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) putMark(ov.bands, `band:${i}`, null, [s('path', { d: bandRing(i).d, class: 'band-ring' })], true);
      // The scope view's ring on the varix columns, with its badge (mock C1, 6 Nov 2026): one of the figure's marks, so the GPU draws it in
      // world units with the vessels and it moves with every zoom, pan and view change, never eased. Tapping it opens the lens (scope-lens.js).
      const sr = live.scopeRing;
      if (sr.on && sr.open && sr.cone) putMark(ov.plugs, 'scope:cone', null, coneShapes(sr.cone).map(([tag, a]) => s(tag, a)), true);   // (under the ring: the lens's cone)
      if (sr.on) putMark(ov.plugs, 'scope:ring', null, RING_SHAPES[sr.open ? 1 : 0].map(([tag, a]) => s(tag, a)), true);
    }
    // The marks that were not wanted this time fade out where they stood (their group drawn again in its host), unless what they sat on
    // has gone, the view is on its way to the other one, or the figure moved under them. (One already fading finishes even when its
    // vessel has finished retracting: the retraction runs on the wall clock, the fade on frame time.)
    for (const [, el, m] of markA.end((key, m, fading) => m.t === t && (anat || !m.anatOnly) && (fading || !m.vessel || E[m.vessel]?.vis))) m.host.append(el);
    live.balloonDraw(anat);
    mk.ver++;
    marksSync();
  }
  return { clampFontAt, clampLabelAt, clampLabelPos, clampStep, clampTextBox, colGap, updateOverlays };
}
