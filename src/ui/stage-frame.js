// The frame state: the latest frame, its readout and the plain reads of it.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, dMinOf, edgePresent } from '../engine/topology.js';
import { ANAT_HIDDEN, NEEDS_C3, STRAND_FROM, VB_ANAT, VB_CIRC } from './anatomy.js';
import { peelAt } from './flow-peel.js';
import { reduceMotionMQ as reduceMotion, easeMove } from './motion.js';
import { OVER_ALL } from './stage-over.js';
import { store, varixGrowth } from './store.js';
import { clamp, lerp, themeChanged } from './util.js';

export function createFrame(st, live) {
  const { CIRC_C, EI, EV, MAP, VB_CIRC_R, applyVT, arcLen, blendFrom, braid, cbAt, circTurn, gAscites, gFxC, geo, litNormals, nd, nodeVerts, pointAt, recs, rotEase, setG, stageWrap, svg, vbBox, wiggle } = st;
  // A view may keep each finding (varices, collaterals, clots, flow) off the figure until a test shows it.
  const findingHidden = (k) => { const fd = store.get().found; return !!fd && !fd.has(k); };
  const FINDING_OF = { VAR: 'eso', GV: 'gv' };
  function edgeVisible(x, f) {
    const e = x.e, p = f.viewParams || store.get().params;
    if (ANAT_HIDDEN.has(e.id) && live.morph < 0.5) return false;
    if (NEEDS_C3.has(e.id)) return !findingHidden('coll') && recruitFrac('C3', f) > 0.15;
    if (e.kind === 'collateral') {
      if (!edgePresent(e, p)) return false;
      if (findingHidden(FINDING_OF[VARIX_CHANNELS[e.id]] || 'coll')) return false;
      return store.get().layers.collaterals || collOpen(e.id, f);
    }
    if (e.kind === 'shunt') {
      if (e.shunt === 'ap') return p.apShunt > 0.02 && f.Q[EI[e.id]] > 0.3;   // (the healthy liver's small baseline leak is not drawn: it showed as stray grey-blue hooks beside the portal branches)
      return f.D[EI[e.id]] > 0;
    }
    return true;
  }
  // A collateral is drawn as open once it has grown noticeably or carries meaningful flow
  // (≥ 0.3 mL/s), so a channel the model is using is never hidden.
  function collOpen(id, f) {
    const k = EI[id];
    return shownFrac(id, f) > 0.12 || Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) > 0.3;
  }
  // The channels that feed and drain the varices (coronary vein → esophageal varices → azygos; short gastric
  // veins → fundal varices) are drawn open whenever the varices exist (see varicesPresent), whatever their own
  // recruitment, so the figure and circuit show the same varices as the endoscopy pane.
  const VARIX_CHANNELS = { C1a: 'VAR', C1b: 'VAR', C2: 'GV' };
  const varixHeld = { VAR: {}, GV: {} };   // each varix's diameter held in steps (varix-look.js)
  // (The growth follows the diameter's mean, as the held size does: a varix of 3 to 5 mm pulses by 0.8 mm with the beat, which moved the
  // channels' coil target past its 0.6 step again and again and kept the plexus easing, re-binned and re-sent, in every treated patient.)
  function shownFrac(id, f) {
    const site = VARIX_CHANNELS[id];
    return site ? Math.max(recruitFrac(id, f), varixGrowth(f, site, varixHeld[site].m)) : recruitFrac(id, f);
  }
  function recruitFrac(id, f) {
    const e = EDGES[EI[id]];
    const dMin = dMinOf(e);
    return clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMin) / (e.dMax - dMin), 0, 1);
  }
  // The view box morphs from the anatomy's to the circuit's, wide or (turned) tall.
  // (The box itself is kept here, not read back from the attribute: while the GPU draws, the attribute is written once the figure rests
  // (setG; flushGeo before anything asks the browser for the figure's matrix), as nothing on the page shows the SVG model then.)
  // (The four numbers and their text are made again only when a number changed from the last call: a kept list, written in place.)
  const vbNow = [0, 0, 0, 0], vbSeen = [NaN, NaN, NaN, NaN];
  let vbTxt = '';
  function setViewBox(t) {
    const rr = rotEase(live.rotU);
    let vbChanged = false;
    for (let i = 0; i < 4; i++) {
      const v = lerp(VB_ANAT[i], lerp(VB_CIRC[i], VB_CIRC_R[i], rr), t);
      vbNow[i] = v;
      if (v !== vbSeen[i]) { vbSeen[i] = v; vbChanged = true; }
    }
    if (vbChanged) {
      vbTxt = `${vbNow[0].toFixed(1)} ${vbNow[1].toFixed(1)} ${vbNow[2].toFixed(1)} ${vbNow[3].toFixed(1)}`;
      vbBox.x = +vbNow[0].toFixed(1); vbBox.y = +vbNow[1].toFixed(1); vbBox.width = +vbNow[2].toFixed(1); vbBox.height = +vbNow[3].toFixed(1);
    }
    const txt = vbTxt;
    setG(svg, 'viewBox', txt);
    // (The overlays' SVG shows what the painter leaves to it, unless the GPU paints all of it: its box is written at once then.)
    if (live.svgOver) setG(live.svgOver, 'viewBox', txt, live.svgOver.classList.contains(OVER_ALL) ? undefined : false);
    applyVT();
  }
  // A vessel's course at t of the change between the views (eased: 0 the anatomy, 1 the circuit), as updateGeometry draws it; and its
  // strands' (strandAt). Pure: the GPU morph (morphTrack) asks for moments ahead of the one drawn.
  const vesOut = { pts: null, base: null, u0: 0 };   // (the answer, written in place: every caller reads it at once, before the next ask)
  // `frame`: asked for the frame drawn now (updateGeometry), not for a moment ahead: between the views the course is then written into one of the
  // vessel's two kept lists (g.mix, alternating: the frame before's is still being read by the draw), nothing allocated per vessel per frame.
  function vesselAt(x, t, frame = false) {
    const g = geo[x.e.id];
    let pts;
    if (t === 0) pts = g.A; else if (t === 1) pts = g.C;
    else if (frame) {
      const A = g.A, C = g.C, n = A.length;
      const mix = g.mix ||= [null, null];   // alloc-rare: made once for the vessel
      g.mixI ^= 1;
      let m = mix[g.mixI];
      if (!m || m.length !== n) { m = mix[g.mixI] = Array.from({ length: n }, () => [0, 0]); }   // alloc-rare: made once for the vessel (and again if its sampling changes)
      const T = circTurn(t), cx = CIRC_C[0], cy = CIRC_C[1], tc = T.c, ts = T.s, rk = g.rk;
      // (Each point on its own share of the change, later the further downstream it lies: the flow peel, flow-peel.js.)
      if (T.on) for (let i = 0; i < n; i++) { const q = m[i], w = peelAt(t, rk[i]), dx = C[i][0] - cx, dy = C[i][1] - cy; q[0] = lerp(A[i][0], cx + tc * dx - ts * dy, w); q[1] = lerp(A[i][1], cy + ts * dx + tc * dy, w); }
      else for (let i = 0; i < n; i++) { const q = m[i], w = peelAt(t, rk[i]); q[0] = lerp(A[i][0], C[i][0], w); q[1] = lerp(A[i][1], C[i][1], w); }
      pts = m;
    } else {
      const T = circTurn(t), cx = CIRC_C[0], cy = CIRC_C[1], tc = T.c, ts = T.s, rk = g.rk;
      pts = T.on
        ? g.A.map((p, i) => { const w = peelAt(t, rk[i]), dx = g.C[i][0] - cx, dy = g.C[i][1] - cy; return [lerp(p[0], cx + tc * dx - ts * dy, w), lerp(p[1], cy + ts * dx + tc * dy, w)]; })
        : g.A.map((p, i) => { const w = peelAt(t, rk[i]); return [lerp(p[0], g.C[i][0], w), lerp(p[1], g.C[i][1], w)]; });
    }
    const base = pts;
    const u0 = STRAND_FROM[x.e.id] || 0;
    if (x.e.kind === 'collateral' && !x.e.spontaneous && t < 1) { const wz = wiggle(pts, g.wig * (1 - t), x.e.id.length); pts = u0 ? blendFrom(base, wz, u0) : wz; }
    vesOut.pts = pts; vesOut.base = base; vesOut.u0 = u0;
    return vesOut;
  }
  // Strands fan out from the shared ends (or from where the trunk breaks up) and fold back
  // onto the lane in the circuit.
  function strandAt(x, sd, t, { pts, base, u0 }) {
    const g = geo[x.e.id];
    // (The varices' strands fan out as far as their varix is big: g.spr, eased, see varix-look.js.)
    const fan = sd.off * (1 - t) * (g.spr ?? 1);
    let sp = sd.span ? braid(base, fan, 0, sd.span, sd.ph) : wiggle(braid(base, fan, u0), (0.8 * g.wig + 3) * (1 - t), sd.ph);
    if (u0) sp = blendFrom(pts, sp, u0);
    return sp;
  }
  // `only`: the vessels whose shape changed while the morph stayed put (a collateral coiling); the rest keep their paths.
  let ascT = NaN, ascTxt = '', fxcT = NaN, fxcTxt = '';   // (the opacity texts of the ascites and the circuit's layer, made again only when t moved)
  function updateGeometry(force, only) {
    const t = easeInOut(live.morph);
    const full = force || t !== live.lastMorph;
    if (!full && !only?.length) return;
    live.geometryVersion++;
    if ((t === 0 || t === 1) && t !== live.lastMorph) live.pickVer++;   // (a view landed: the corner credit counts the vessels where they now lie)
    live.lastMorph = t;
    // (Between the two views a clot's lit side is worked out once the views have landed (t 0 or 1 is always a whole update), not at every
    // frame of the change.)
    const lazy = t > 0 && t < 1;
    for (const x of full ? EV : only) {
      const g = geo[x.e.id], v = vesselAt(x, t, true), { u0 } = v;
      const pts = v.pts;
      if (x.strands) for (const sd of x.strands) {
        const sp = strandAt(x, sd, t, v);
        sd.u0 = u0;
        sd.cur = sp; sd.len = arcLen(sp);
      }
      g.cur = pts;
      g.len = arcLen(pts);
      if (x.cbr) for (const cb of x.cbr) cb.cur = cbAt(cb, t);
      if (x.tipFade) { const ln = x.tipFade.line, pa = pointAt(pts, x.tipFade.frac); ln[0] = pts[0][0]; ln[1] = pts[0][1]; ln[2] = pa[0]; ln[3] = pa[1]; ln[4] = pa[2]; ln[5] = pa[3]; }   // (written in the vessel's own list)
      if (x.endFade) { const ln = x.endFade.line, pa = pointAt(pts, x.endFade.frac), pe = pts[pts.length - 1]; ln[0] = pa[0]; ln[1] = pa[1]; ln[2] = pe[0]; ln[3] = pe[1]; }
      x.shadeOk = false;
      if (lazy) continue;
      litNormals(pts, g.lit);   // (a clot's layers follow the tube's lit side: updateOverlays)
    }
    if (!full) return;
    if (t > 0 && t !== nd.at) nodeVerts(t);   // (the dots show only with the circuit: at 0 they are not drawn, and kept where they were)
    setViewBox(t);
    live.organMorphA = 1 - t; live.paintOrganAlpha();
    if (t !== ascT) { ascT = t; ascTxt = String(1 - t); }
    setG(gAscites, 'style:opacity', ascTxt);
    svg.classList.toggle('circuit', t > 0.5);
    live.svgOver?.classList.toggle('circuit', t > 0.5);
    if (recs.show(t > 0.5 ? 1 : 0, performance.now(), reduceMotion.matches)) live.recKick();   // (the kept shapes of the circuit fade in and out as .circuit-only did: D_SURFACE, the page's ease)
    // The circuit is a dark hemodynamic map; the anatomy an atlas plate on paper.
    if (stageWrap.classList.contains('cmap') !== t > 0.5) { stageWrap.classList.toggle('cmap', t > 0.5); themeChanged(); }   // (the map's tokens are the labels' too: label-theme.js)
    if (gFxC.firstChild || t === 0 || t === 1) { if (t !== fxcT) { fxcT = t; fxcTxt = String(t); } setG(gFxC, 'style:opacity', fxcTxt); }   // (an empty layer takes no opacity through the change between the views; its value lands with the view)
    // (The map and the dots fade with t on the GPU: at 0 neither is drawn nor read.)
    if (MAP.a !== t) { MAP.a = t; nd.dirty = true; }
    live.CTM = null;
  }
  // (The change between the views, the label layer's glide, the callouts' room glide and the dive's lobule share all run on the camera's curve, the
  // quintic easeMove: the quadratic in-out it replaces had its acceleration flip from +4 to -4 at the midpoint, a catch in the longest move there is.)
  const easeInOut = easeMove;
  return { collOpen, easeInOut, edgeVisible, findingHidden, recruitFrac, setViewBox, shownFrac, strandAt, updateGeometry, varixHeld, vesselAt };
}
