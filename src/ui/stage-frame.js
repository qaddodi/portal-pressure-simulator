// The frame state: the latest frame, its readout and the plain reads of it.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, dMinOf, edgePresent } from '../engine/topology.js';
import { ANAT_HIDDEN, NEEDS_C3, STRAND_FROM, STRAND_HOLD, STRAND_PLATEAU, STRAND_SOFT, VB_ANAT, VB_CIRC, WIG_CAP } from './anatomy.js';
import { smooth01 } from './motion.js';
import { chordPointInto, peelAt, reverses } from './flow-peel.js';
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
    if (e.id === 'CAUD' && !live.caudPin) return false;   // (the caudate's own vein is drawn only while a slide is about the caudate, Mohammad 11 Nov 2026)
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
  // ── One sample of a vessel at t of the change, as vesselAt moves it (for the labels' anchors and a pinned end's host) ──
  const LP = [0, 0], E0 = [0, 0], E1 = [0, 0], H0 = [0, 0], H1 = [0, 0], PS = [0, 0], PIN_FALL = 0.4;
  // Whether a vessel's course turns more than 120 degrees between the views, for the circuit as it is laid out now (kept per turn).
  function revOf(g, T) {
    const rr = T.on ? T.rr : 0;
    if (g.revRR !== rr) {
      const A = g.A, C = g.C, n = C.length, cdx = C[n - 1][0] - C[0][0], cdy = C[n - 1][1] - C[0][1], tc = T.on ? T.c : 1, ts = T.on ? T.s : 0;
      g.revRR = rr; g.rev = !!g.sA && n === A.length && n > 2 && reverses(A, tc * cdx - ts * cdy, ts * cdx + tc * cdy);
    }
    return g.rev;
  }
  function lerpPt(g, i, t, T, out) {
    const A = g.A[i], C = g.C[i], w = peelAt(t, g.rk[i]);
    let cx = C[0], cy = C[1];
    if (T.on) { const dx = cx - CIRC_C[0], dy = cy - CIRC_C[1]; cx = CIRC_C[0] + T.c * dx - T.s * dy; cy = CIRC_C[1] + T.s * dx + T.c * dy; }
    out[0] = lerp(A[0], cx, w); out[1] = lerp(A[1], cy, w);
    return out;
  }
  function rawPt(g, i, t, T, out) {
    lerpPt(g, i, t, T, out);
    const n = g.A.length;
    if (i > 0 && i < n - 1 && revOf(g, T)) { lerpPt(g, 0, t, T, E0); lerpPt(g, n - 1, t, T, E1); chordPointInto(out, g.sA, g.sC, i, peelAt(t, g.rk[i]), E0[0], E0[1], E1[0], E1[1]); }
    return out;
  }
  // How far a pinned end is moved at t: to its host's point (the host's share along its course eased from the anatomy's to the circuit's),
  // less what lay between them at rest.
  function pinShift(g, pin, t, T, out) {
    const h = geo[pin.host], w = peelAt(t, g.rk[pin.k]), f = lerp(pin.fA, pin.fC, w), nh = h.A.length, i = Math.min(nh - 2, Math.floor(f)), u = f - i;
    rawPt(h, i, t, T, H0); rawPt(h, i + 1, t, T, H1); rawPt(g, pin.k, t, T, LP);
    const tc = T.on ? T.c : 1, ts = T.on ? T.s : 0, rcx = tc * pin.dC[0] - ts * pin.dC[1], rcy = ts * pin.dC[0] + tc * pin.dC[1];
    out[0] = lerp(H0[0], H1[0], u) - LP[0] - lerp(pin.dA[0], rcx, w);
    out[1] = lerp(H0[1], H1[1], u) - LP[1] - lerp(pin.dA[1], rcy, w);
    return out;
  }
  /** Sample i of the vessel at t (eased share of the change), into out: the point vesselAt draws (its chord frame and its pinned ends). */
  function morphPtInto(id, i, t, out) {
    const g = geo[id], n = g.A.length;
    if (t <= 0) { out[0] = g.A[i][0]; out[1] = g.A[i][1]; return out; }
    const T = circTurn(t);
    if (t >= 1 && !T.on) { out[0] = g.C[i][0]; out[1] = g.C[i][1]; return out; }
    rawPt(g, i, t, T, out);
    if (g.pins) for (const pin of g.pins) {
      const j = pin.end ? n - 1 - i : i, kf = smooth01(1 - j / (PIN_FALL * (n - 1)));
      if (kf <= 0) continue;
      pinShift(g, pin, t, T, PS); out[0] += PS[0] * kf; out[1] += PS[1] * kf;
    }
    return out;
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
    else {
      const A = g.A, C = g.C, n = A.length;
      let m;
      if (frame) {
        const mix = g.mix ||= [null, null];   // alloc-rare: made once for the vessel
        g.mixI ^= 1;
        m = mix[g.mixI];
        if (!m || m.length !== n) { m = mix[g.mixI] = Array.from({ length: n }, () => [0, 0]); }   // alloc-rare: made once for the vessel (and again if its sampling changes)
      } else m = Array.from({ length: n }, () => [0, 0]);   // alloc-rare: a moment ahead of the one drawn (the morph pieces' build, between frames)
      const T = circTurn(t), cx = CIRC_C[0], cy = CIRC_C[1], tc = T.c, ts = T.s, rk = g.rk;
      // (Each point on its own share of the change, later the further downstream it lies: the flow peel, flow-peel.js.)
      if (T.on) for (let i = 0; i < n; i++) { const q = m[i], w = peelAt(t, rk[i]), dx = C[i][0] - cx, dy = C[i][1] - cy; q[0] = lerp(A[i][0], cx + tc * dx - ts * dy, w); q[1] = lerp(A[i][1], cy + ts * dx + tc * dy, w); }
      else for (let i = 0; i < n; i++) { const q = m[i], w = peelAt(t, rk[i]); q[0] = lerp(A[i][0], C[i][0], w); q[1] = lerp(A[i][1], C[i][1], w); }
      // (A vessel whose course runs the other way in the circuit: its ends as above, its shape carried in its chord's frame, so it never folds
      // and never leaves the vessels it joins: flow-peel.js chordShape.)
      if (n > 2 && revOf(g, T)) {
        const x0 = m[0][0], y0 = m[0][1], x1 = m[n - 1][0], y1 = m[n - 1][1];
        for (let i = 1; i < n - 1; i++) chordPointInto(m[i], g.sA, g.sC, i, peelAt(t, rk[i]), x0, y0, x1, y1);
      }
      // (An end pinned to the vessel it joins part-way along: stage-geo.js pinEnds.)
      if (g.pins) for (const pin of g.pins) {
        pinShift(g, pin, t, T, PS);
        const dx = PS[0], dy = PS[1], reach = PIN_FALL * (n - 1);
        if (dx === 0 && dy === 0) continue;
        for (let j = 0; j < n; j++) { const kf = smooth01(1 - j / reach); if (kf <= 0) break; const q = m[pin.end ? n - 1 - j : j]; q[0] += dx * kf; q[1] += dy * kf; }
      }
      pts = m;
    }
    const base = pts;
    const u0 = STRAND_FROM[x.e.id] || 0;
    if (x.e.kind === 'collateral' && !x.e.spontaneous && t < 1) { const wz = wiggle(pts, Math.min(g.wig, WIG_CAP[x.e.id] ?? Infinity) * (1 - t), x.e.id.length); pts = u0 ? blendFrom(base, wz, u0) : wz; }
    vesOut.pts = pts; vesOut.base = base; vesOut.u0 = u0;
    return vesOut;
  }
  // Strands fan out from the shared ends (or from where the trunk breaks up) and fold back
  // onto the lane in the circuit.
  function strandAt(x, sd, t, { pts, base, u0 }) {
    const g = geo[x.e.id];
    // (The varices' strands fan out as far as their varix is big: g.spr, eased, see varix-look.js.)
    const fan = sd.off * (1 - t) * (g.spr ?? 1);
    // (A plateau strand: its offset, off the chord's one normal, follows the main channel's own plateau, read by how far along the chord each sample
    // lies (not by its share of the channel's length, which its own sideways run at each end takes up: the strand bowed out there), and it takes the main channel's serpentine
    // as it is drawn (pts minus base) when its ph is 1, so the channels that ride it bend together and none crosses another.)
    const pa0 = STRAND_PLATEAU[x.e.id];
    if (pa0) {
      const pa = sd.wave?.[3] ?? pa0;
      const n0 = base.length - 1, A = base[0], B = base[n0], cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
      const ride = sd.ph ? 1 : 0, w = sd.wave, wv = w ? w[0] * (1 - t) : 0, wc = w ? w[1] : 0, wp = w ? w[2] : 0;
      return base.map((p, i) => { const v = clamp(((p[0] - A[0]) * ny - (p[1] - A[1]) * nx) / cl, 0, 1), o = (fan + wv * Math.sin(Math.PI * 2 * wc * v + wp)) * smooth01(v / pa) * smooth01((1 - v) / pa); return [p[0] + nx * o + ride * (pts[i][0] - p[0]), p[1] + ny * o + ride * (pts[i][1] - p[1])]; });   // alloc-rare: as braid's own list, made when the course changes
    }
    const soft = STRAND_SOFT.has(x.e.id);
    // (A soft strand is braided off the channel as drawn and holds to it, its serpentine too, for the first and last tenth: it leaves the node as the channel does.)
    let sp = sd.span ? braid(base, fan, 0, sd.span, sd.ph) : soft ? wiggle(braid(pts, fan, u0, null, 0, true), (0.8 * g.wig + 3) * (1 - t), sd.ph, STRAND_HOLD) : wiggle(braid(base, fan, u0), (0.8 * g.wig + 3) * (1 - t), sd.ph);
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
  return { collOpen, easeInOut, edgeVisible, morphPtInto, findingHidden, recruitFrac, setViewBox, shownFrac, strandAt, updateGeometry, varixHeld, vesselAt };
}
