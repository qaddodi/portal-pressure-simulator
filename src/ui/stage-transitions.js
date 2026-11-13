// The model-driven transitions and what rides on them: reveal and exit of vessels, reversal hold, circuit nodes, the ascites fluid, the stent mesh and the surgical ties.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES } from '../engine/topology.js';
import { ABDOMEN_FLOOR, NEEDS_C3, abdomenOutline, cavityHalfWidths, flankPath } from './anatomy.js';
import { createReversalHold } from './blood.js';
import { FRONT_MS } from './collateral-front.js';
import { fluidBase, fluidFloorAt, fluidLevel, poolFade } from './fluid-step.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { fluidSpring, fluidSpringFor } from './organ-ease.js';
import { createDiaphragm } from './stage-diaphragm.js';
import { createFocus } from './stage-focus.js';
import { createHalos } from './stage-halos.js';
import { createMarks } from './stage-marks.js';
import { createOutlines } from './stage-outlines.js';
import { createVenous } from './stage-venous.js';
import { bareOf, stentLookD } from './stent-mesh.js';
import { store } from './store.js';
import { clamp, s } from './util.js';

// Where the cross sits on a vein the Warren shunt has tied off and greyed out, as a share of its course (Mohammad, 7 Nov: about half way).
const TIED_X = 0.5;

export function createTransitions(st, live) {
  const { E, EI, EV, FLUID_COLS, FLUID_R, JUMP_MMHG, MAP, ND_PER, ND_SEG, NI, SEL_DIM, abdTo, anyReveal, arcMid, ascitesLine, ascitesPath, ascitesSvg, caud, clampW, clampWOut, collOpen, defs, diaCut, divideLen, drawFrame, easeInOut, edgeVisible, findingHidden, flag, flank, gBackdrop, gFx, gFxC, gOver, geo, haloEls, hidePlate, late, liveOn, liverR, liverTint, lv, morphLiver, nd, nextFrame, nodeDots, nodePos, organEls, organG, ov, plateOn, platePoke, pointAt, putA, qP, readFrame, recruitFrac, refreshCTM, resTheme, routeCustomShunts, setGlowSrc, setReveal, spleenMv, spot, svg, syncOrganMasks, syncVeins, themeKey, toRGB, update, updateGeometry, waist, wrap, wrapCls } = st;
  // ── Model-driven transitions ──────────────────────
  // Nothing flashes or sweeps across the anatomy. Pressure change shows as the vessel's own color
  // easing; reversed flow is a steady state (its tracers run the other way);
  // the one animation is a collateral or shunt that opens, drawn on in the direction of its
  // flow, and, when it closes or is removed, retracted back the way it came. Nothing runs under
  // reduced motion or in the figure view.
  const track = {};
  // (Each vessel's reveal record, made once here and written in place by revealOf: a reveal starting makes nothing.)
  for (const x of EV) x.rv = { t0: 0, dur: 0, dir: 1, out: false };
  const revealOf = (x, t0, dur, dir, out) => { const r = x.rv; r.t0 = t0; r.dur = dur; r.dir = dir; r.out = out; return r; };
  const appEl = document.getElementById('app');
  // The Meso-Rex graft is long (the superior mesenteric vein up to the Rex recess): it draws on from the gut end slowly enough to be seen growing.
  const REX_GROW_MS = 2600;
  const quietFx = () => reduceMotion.matches || live.isImaging();
  function trackChanges(f) {
    const now = live.fxAt ?? performance.now();
    const quiet = quietFx();
    for (const x of EV) {
      const e = x.e;
      const q = f.Qf ? f.Qf[EI[e.id]] : f.Q[EI[e.id]];
      const open = x.vis && !x.ghost && !x.reveal?.out;
      const was = track[e.id];
      track[e.id] = open;
      if (was === false && open && canFade(x) && !quiet) setReveal(x, revealOf(x, now, e.shunt === 'rex' ? REX_GROW_MS : e.kind === 'shunt' ? 900 : e.kind === 'collateral' ? FRONT_MS : 1500, q >= 0 ? 1 : -1, false));
    }
  }
  // The vessels that come and go with the disease (collaterals, shunts, the epigastric veins that
  // open with the paraumbilical route) draw on when they appear and retract when they leave.
  const canFade = (x) => !x.isArt && (x.e.kind === 'collateral' || x.e.kind === 'shunt' || NEEDS_C3.has(x.e.id));
  function startExit(x, f) {
    const q = f.Qf ? f.Qf[EI[x.e.id]] : f.Q[EI[x.e.id]];
    setReveal(x, revealOf(x, live.fxAt ?? performance.now(), x.e.shunt === 'rex' ? 1200 : x.e.kind === 'shunt' ? 700 : x.e.kind === 'collateral' ? FRONT_MS : 1100, q >= 0 ? 1 : -1, true));
  }
  // When the retraction ends: hide the vessel, or leave the dotted outline of a closed collateral.
  function finishExit(x) {
    if (!live.F) return;
    live.edgeRev++;   // (the labels' signature: R04)
    if (!edgeVisible(x, live.F)) x.vis = false;
    else if (x.e.kind === 'collateral' && !collOpen(x.e.id, live.F)) x.ghost = true;
  }
  function stepReveals(now) {
    if (!live.revealN) return;   // (nothing draws on or off: no walk over the vessels, rev 2 §2.8)
    let finished = false;
    for (const x of EV) {
      if (!x.reveal) continue;
      const r = x.reveal;
      const u = clamp((now - r.t0) / r.dur, 0, 1);
      // (The GPU draws the vessel on from x.reveal itself: syncVeins.)
      const done = u >= 1 || quietFx();
      if (done) { setReveal(x, null); finished = true; if (r.out) finishExit(x); }
    }
    // Rebuild at once so the vessel turns from the drawn-on stroke into its shaded tube on the
    // same frame, rather than holding the stroke until the next model update.
    if (finished && live.F && !live.inUpdate) update(live.F);
    else if (live.veins && !live.inUpdate && anyReveal()) syncVeins(easeInOut(live.morph));
  }
  const { polysD } = createHalos({ E, NI, drawFrame, easeInOut, gOver, haloEls, nodePos, quietFx, routeCustomShunts, setGlowSrc, updateGeometry }, live);
  const { caliperAt, caliperSegs, clampA, clampFading, clampShade, fxBuild, fxK, fxPill, fxSync, gMatrix, glLines, markA, markShade, normal, normalSync, olFading, olGeom, olKey, olRings, olSet, olStep, orgTone, pinOrgans, setCallouts, spotOrgans } = createOutlines({ E, MAP, ND_PER, ND_SEG, arcMid, caud, clampW, clampWOut, easeInOut, gFx, gFxC, geo, late, nd, nextFrame, nodeDots, organEls, organG, ov, pointAt, quietFx, readFrame, refreshCTM, resTheme, svg, themeKey, toRGB }, live);
  const { marksStale, marksSync, mk } = createMarks({ gOver, glLines, ov, svg, themeKey, toRGB, wrapCls });
  // A selected organ keeps a quiet outline; a selected site (varices, fundus, abdomen) a ring.
  const gSelO = s('g', { id: 'organSel' });
  gOver.after(gSelO);
  const { syncSelFluid, syncSelLine, updateFocus, updateOrganSel } = createFocus({ E, EI, ascitesLine, ascitesPath, ascitesSvg, gSelO, glLines, late, olGeom, olSet, orgTone, organEls, organG, setGlowSrc }, live);
  // Reversal as shown (the Direction lens, the moving blood, the watched stations): a vessel's flag changes only once its
  // new direction has held for a whole breath of model time (respiration is a 4 s cycle), so flow near the cut-off no longer
  // flips blue and orange with every breath; a jump in the model (a new patient, a time jump, Undo: pressures moved more than
  // JUMP_MMHG, or the clock went back or leapt) takes the new flags at once (createReversalHold, blood.js). The model's own flags are untouched (round 2
  // review, B3).
  const revHolder = createReversalHold(EDGES.length, 4), revHold = revHolder.hold;
  function holdReversals(f) {
    const H = store.get().healthy;
    if (!f || (f === live.revF && H === live.revH)) return;
    const P = f.Pf || f.P, t = f.t ?? 0;
    let jump = !live.revF || H !== live.revH || t < live.revT || t - live.revT > 1 || !live.revP || live.revP.length !== P?.length;
    if (!jump) for (let i = 0; i < P.length; i++) if (Math.abs(P[i] - live.revP[i]) > JUMP_MMHG) { jump = true; break; }
    live.revF = f; live.revH = H; live.revT = t;
    if (P) { if (!live.revP || live.revP.length !== P.length) live.revP = new Float64Array(P.length); live.revP.set(P); }
    if (revHolder.step(revFlag, t, jump)) live.revFlip = true;
  }
  const revFlag = (k) => (isReversed(EDGES[k], live.revF) ? 1 : 0);   // (revF is the frame being held: holdReversals sets it just before)
  const reversedShown = (e) => revHold[EI[e.id]] === 1;
  function isReversed(e, f) {
    const q = f.Qf[EI[e.id]];
    const ref = st0Ref(e.id);
    return q < -Math.max(0.12, 0.02 * Math.abs(ref));
  }
  const st0Ref = (id) => store.get().healthy?.Q?.[EI[id]] ?? 1;
  function updateNodesCircuit(f) {
    if (live.morph < 0.02) return;
    for (const d of nodeDots) {
      // (A junction dot fades with the vessels that come and go through it, as the figure's views fade: it popped. P21)
      const on = live.nodeVisible(d.id);
      if (d.on !== on) { d.on = on; live.mapWake = true; }
    }
    for (const id in liverR) {
      const r = liverR[id], k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      r.R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
    }
  }
  const { easeLiver, updateOrgans } = createDiaphragm({ EI, NI, abdTo, caud, diaCut, drawAscites, findingHidden, gBackdrop, hidePlate, liveOn, liverTint, lv, morphLiver, normalSync, organEls, organG, platePoke, putA, qP, recruitFrac, spleenMv, syncOrganMasks, syncSelFluid, syncSelLine }, live);
  // Ascites collects in the flanks and the pelvis first (supine patient, frontal view), so its
  // surface is a meniscus: highest at the sides, lowest in the middle. The abdominal wall bulges
  // and the bowel floats up on it. A slow ripple runs along the surface while the model runs. On
  // the GPU the fluid is drawn over the plate (not in its raster), so no lens tints it; the SVG
  // copy stays for picking, the selection outline and exports.
  let bulgeQ = 0;
  // The fluid still easing toward its volume by more than a step of the wall's bulge (a tap, a drain, diuretics): the organ plate,
  // whose wall and bowel follow the bulge, is rasterized once it settles, not at every step on the way (each about 712 KB of SVG and
  // an 8 MB upload, several times per ease). The slow creep of a running model stays within a step, so it never holds the plate.
  const fluidEasing = () => live.ascTarget !== null && Math.abs(clamp(live.ascTarget / 8500, 0, 1) - clamp(live.ascShown / 8500, 0, 1)) * 34 > 0.5;
  const fluidLook = { s: [0, 0, 0, 0], ink: [0, 0, 0, 0], ripple: false };
  const abdomenClipEl = defs.querySelector('#abdomenClip path');
  // (The ripple's phase advances with the running model's frames, so it carries on from where it stood after a pause instead of
  // jumping to the wall clock's; round 2 review, B11.)
  let fluidPh = 0;
  const fluidPhase = () => fluidPh;   // both ripple terms are periodic over 20π
  let fluidSurfPh = 0;
  const fluidSurfKept = (x) => fluidSurfAt(x, fluidSurfPh);   // (the surface at the phase of the last draw: fluidSurf is set anew with each, so it never reads an older one)
  const fluidSurfAt = (x, ph) => fluidBase(x, live.fluidH) + (Math.sin(x / 38 + ph) * 0.7 + Math.sin(x / 23 - ph * 1.3) * 0.3) * live.fluidAmp;
  // No pool while the readout grades the belly "None"; past that it fades in as it fills and out as it drains, so it never pops.
  const fluidFade = () => poolFade(live.ascShown);
  const fluidCellsBuf = [];
  function drawAscites() {
    const u = clamp(live.ascShown / 8500, 0, 1);
    // The wall and the bowel move in half-unit steps of the bulge, with some hysteresis: each step re-rasterizes the
    // organ plate (plateStateKey), so a pool that fills slowly at rest must not change them on every model tick.
    const raw = u * 34;
    if (Math.abs(raw - bulgeQ) > 0.4 || (raw < 0.5 && bulgeQ !== 0)) bulgeQ = Math.round(raw * 2) / 2;
    const bulge = bulgeQ;
    putA(flank, 'd', u < 0.04 ? '' : flankPath(bulge));
    const d = abdomenOutline(bulge);
    if (live.fluidMaskB !== bulge) { live.fluidMaskB = bulge; abdomenClipEl.setAttribute('d', d); live.abdomenEl.setAttribute('d', d); }
    if (live.veins && !live.veins.lost && (live.fluidMaskOf !== live.veins || live.fluidMaskOfB !== bulge)) {
      live.fluidMaskOf = live.veins; live.fluidMaskOfB = bulge; live.fluidBandH = -1;
      // The cavity as a half-width per half unit of height (cavityHalfWidths), not a raster of its outline: copying a fresh
      // 856 x 600 canvas into a texture took Safari about 220 ms, on nearly every frame of a fluid ease (a Timelines
      // recording of HVPG slide 8 to 9, 17 Oct).
      const R = FLUID_R;
      live.veins.setFluidSpans(cavityHalfWidths(bulge, R[1], R[3], FLUID_COLS), R);   // (its second row: the liver's edge, setFluidLiver)
    }
    putA(organG.bowel, 'transform', `translate(0 ${(-bulge / 34 * 26).toFixed(1)})`);
    // The fluid level (fluidLevel): the first pool lies under the appendix's tip, then each litre lifts it about as much. Near the
    // top of the scale (about 8.5 L) the surface reaches the lower edge of the spleen: clearly concave (about 100 units
    // lower in the middle than at the flanks), the same on both sides.
    ({ h: live.fluidH, amp: live.fluidAmp } = fluidLevel(live.ascShown));
    live.fluidSurf = null;
    if (fluidFade() <= 0) { live.ascStale = false; putA(ascitesPath, 'd', ''); putA(ascitesLine, 'd', ''); }
    else {
      fluidSurfPh = reduceMotion.matches || plateOn() ? 0 : fluidPhase();
      live.fluidSurf = fluidSurfKept;
      // (R05, review pass 2: while the GPU draws the fluid (gl-on: #ascites hidden, app.css), the surface's SVG text, whose phase moves
      // every frame of the ripple, is not built or written: it is marked stale and written when something reads it (the selection's
      // outline, the hover, the SVG shown again: ascitesSvg). ?asclazy=0: written every frame, as before.)
      // (The level itself is still written as it moves, a quarter unit at a time, and at least once a second, so the credit's art
      // (credit.js FLUID) reads where the pool stands; only the ripple's phase is left out.)
      live.ascStale = true;
      if (!wrap.classList.contains('gl-on') || Math.abs(live.fluidH - live.ascWroteH) > 0.25 || live.fluidAmp !== live.ascWroteAmp || performance.now() - live.ascWroteAt > 1000) ascitesSvg();
      // The cells the rippling surface (and its light band) passes through, redrawn each frame on the GPU.
      if (live.veins && !live.veins.lost && Math.abs(live.fluidH - live.fluidBandH) > 0.25) {
        live.fluidBandH = live.fluidH;
        const cells = fluidCellsBuf;
        cells.length = 0;
        for (let x = 288; x < 1136; x += 16) {
          const a = fluidBase(x, live.fluidH), b = fluidBase(x + 16, live.fluidH);
          const y0 = Math.min(a, b) - live.fluidAmp - 2, y1 = Math.max(a, b) + live.fluidAmp + 10;
          for (let y = y0; y < y1; y += 16) cells.push(x, y);
        }
        live.veins.setFluidCells(new Float32Array(cells));
      }
    }
    syncSelFluid();
    platePoke();
  }
  // Per animation frame: ease the shown volume and keep the GPU fluid's look current. True when the level moved.
  const fluidLv = [1, 0];
  function stepFluid(dt, st, easeDt = dt) {
    if (live.ascTarget === null) return false;
    let moved = false;
    if (live.ascShown !== live.ascTarget) {
      live.fluidFrom ??= live.fluidH;
      // A large change shows the live drawing while it eases, as the liver's does: the wall and bowel move with the fluid, and the plate
      // is rasterized once it settles (held under the plate, the wall would jump by the whole change when it landed).
      const held = fluidEasing();
      if (held && Math.abs(clamp(live.ascTarget / 8500, 0, 1) * 34 - bulgeQ) > 3 && live.veins && !live.veins.lost && live.veins.hasPlate(0) && !liveOn()) hidePlate();
      // A critically damped spring on the drawn scale (volume^0.6), so the fluid fills in from the pelvis and
      // drains out smoothly, starting and stopping gently, instead of jumping in or out of existence.
      ({ shown: live.ascShown, vel: live.ascVel } = easeDt > 0.05 ? fluidSpringFor(live.ascShown, live.ascVel, live.ascTarget, easeDt) : fluidSpring(live.ascShown, live.ascVel, live.ascTarget, easeDt));
      drawAscites(); moved = true;   // (its platePoke rasterizes once the fluid is within a step of its volume)
    }
    const run = st.running && !reduceMotion.matches;
    if (run) fluidPh = (fluidPh + dt / 1.1) % (20 * Math.PI);
    // (Under a slide's spotlight the fluid eases with the organs' dim: the plate's own value, less a lens's share of it.)
    const spotK = spot.live && live.plateDim != null ? clamp(live.plateDim / (flag.dataLayer ? 0.72 : 1), SEL_DIM, 1) : 1;
    const t = easeInOut(live.morph), k = (1 - t) * (flag.hasSel ? SEL_DIM : spotK);
    const fs = fluidLook.s, fi = fluidLook.ink;   // (written in place: the look is read on the draw)
    fs[0] = fluidFloorAt(live.fluidH); fs[1] = live.fluidH; fs[2] = live.fluidAmp; if (run) fs[3] = fluidPhase();
    fi[0] = live.fluidInkRGBA[0]; fi[1] = live.fluidInkRGBA[1]; fi[2] = live.fluidInkRGBA[2]; fi[3] = live.fluidInkRGBA[3] * k * fluidFade();
    fluidLook.ripple = run && fluidFade() > 0 && k > 0;
    fluidLv[0] = live.liverScale; fluidLv[1] = live.liverFluidCut; fluidLook.lv = fluidLv;
    if (live.vLook) live.vLook.fluid = fluidLook;
    // (A level that moves under fluid drawn at no opacity changes no pixel (the shader draws none at ink 0): no whole repaint for it,
    // only for the frame it fades to nothing. External review, 21 Oct.)
    const seen = fluidLook.ink[3] > 0, was = live.fluidSeen;
    live.fluidSeen = seen;
    const from = live.fluidFrom ?? live.fluidH;
    live.fluidFrom = null;
    if (!(moved && (seen || was))) return false;
    // Only the pool's cells are composited again, from above the higher of the two levels (the surface, its ripple and its light
    // band) down: the rest of the picture does not change with it. It was the whole screen on every frame of a fill or a drain
    // (Fable's lag review, item 4). A whole repaint where there is no cavity to bound it.
    const pool = !!(live.veins && !live.veins.lost && live.veins.fluidPool(ABDOMEN_FLOOR + 5 - Math.max(from, live.fluidH) - live.fluidAmp - 6));
    if (pool) live.poolFrames++;
    return !pool;
  }
  // Point, unit normal and unit tangent at arc length `d` along a vessel's current centerline.
  function frameAt(id, d) {
    const g = geo[id];
    const [x, y, dx, dy] = pointAt(g.cur, clamp(d / (g.len || 1), 0, 1));
    const n = Math.hypot(dx, dy) || 1, q = frameKept;   // (read at once by its callers)
    q.x = x; q.y = y; q.tx = dx / n; q.ty = dy / n; q.nx = -dy / n; q.ny = dx / n;
    return q;
  }
  const frameKept = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0 };
  // A self-expanding stent in the lumen, so a shunt or a stented vein reads as a device, not a vessel. It runs from d0 to d1 along the
  // vessel's drawn path (either way round) and is drawn k of the way (0 to 1) from d0, anchored there, so a growing stent unrolls
  // instead of stretching. A narrowed stent pinches with its lumen (the same waist, in the segment its card names).
  // Returns the paths, to append where the mesh belongs.
  // The stent's half-width at arc length d (the tube's own where the tube renderer has it, else the lumen's with a narrowed stent's waist, to the wall's middle).
  function meshR(id, p) {
    const x = E[id], L = geo[id].len;
    const v = live.isImaging() ? 0 : p.stenosis[id] || 0, wf = v > 0.01 ? waist(id, v, L, x.width, p) : null;
    if (x.glR?.length > 1) {   // (A stent is as wide as the tube it sits in, which narrows along its run, and stays inside its wall: its ends fit the veins they enter, not a stub wider than the tube, 11 Nov 2026; every stent since 13 Nov)
      const g = x.glR, n = g.length - 1;
      return (d) => { const t = Math.min(1, Math.max(0, d / (L || 1))) * n, i = Math.min(Math.floor(t), n - 1); return Math.max(1.2, g[i] + (g[i + 1] - g[i]) * (t - i) - 0.25); };
    }
    return (d) => (x.width / 2) * (wf ? wf(d / (L || 1)) : 1) + (x.wallPx || 1) * 0.5;   // (on the wall, not outside it: the stent is a tube in the vessel, 13 Nov 2026)
  }
  // The stent as a device (look T2, Mohammad 13 Nov 2026, from the Viatorr photos; stent-mesh.js stentLookD): rings placed on the tube, so they
  // bend away at the edges and the far half shows through; the TIPS and the DIPS (both Viatorr stents) covered by a white graft, white where the
  // light falls and nearly clear on the shaded side, with an open stretch at the portal end ending in round crowns and a gold band where the
  // graft starts; every other stent (the veins', the stent tool's shunts) the open stretch alone, end to end. Wire widths are world units (a
  // twelfth of the stent's half-width each), so the stent keeps its proportions as the figure zooms; the painter keeps a stroke one device pixel at least.
  // ends: kept for its callers (the front marker of a stent unrolled by its front is venousDraw's own). bare > 0: that much open from d0.
  function meshPaths(id, p, d0, d1, k = 1, ends = true, bare = 0) {
    const sg = d1 >= d0 ? 1 : -1, A = Math.abs(d1 - d0);
    const R = meshR(id, p);
    if (id === 'DIPS' && !(bare > 0)) bare = tipsBare(id);   // (the DIPS is a covered Viatorr too, its open end at the portal vein: its drawn path runs from there)
    const f = (a, side) => { const d = d0 + sg * a, q = frameAt(id, d), r = R(d); return [q.x + q.nx * r * side, q.y + q.ny * r * side]; };
    const m = stentLookD(f, A, bare > 0 ? bare : A, k), u = R(d0) / 12;
    // (The far half first, under the graft; the graft's fills, lowest light level first; the near half; the bright cores; the gold last.)
    const out = [];
    const wire = (cls, d, w, op) => { if (d) out.push(s('path', op < 1 ? { class: cls, d, 'stroke-width': (w * u).toFixed(3), 'stroke-opacity': op } : { class: cls, d, 'stroke-width': (w * u).toFixed(3) })); };
    wire('stent-wire', m.backBare, 1.25, 0.5);
    wire('stent-wire', m.backCov, 1, 0.12);
    for (const [d, op] of m.graft) out.push(s('path', { class: 'stent-graft', d, 'fill-opacity': op }));
    wire('stent-wire', m.frontBare, 1.4, 1);
    wire('stent-wire', m.frontCov, 1.1, 0.92);
    wire('stent-glint', m.glint, 0.5, 0.7);
    wire('stent-gold', m.band, 3, 1);
    wire('stent-gold', m.tab, 2.2, 1);
    return out;
  }
  // The TIPS stent's bare stretch at its portal end, as drawn length (the 2 cm of the shunt's 8): the covered stent venousDraw unrolls.
  const tipsBare = (id) => bareOf(geo[id].len - 4, E[id].e.len);
  // TIPS, DIPS and the shunts drawn with the stent tool: the whole drawn shunt, in place at once (the vessel itself draws on).
  function stentMesh(id, p) {
    if (id === 'TIPS') return;   // (the covered stent unrolls on its own clock, with the veins' stents: stage-venous.js)
    putMark(ov.stents, `stent:${id}`, id, meshPaths(id, p, 2, geo[id].len - 2));
  }
  function putMark(host, key, vessel, els, anatOnly = false) {
    const g = s('g', { 'data-mk': key });
    g.append(...els);
    markShade(g, markA.want(key, { host, vessel, anatOnly, t: live.ovT }, quietFx()));
    markA.hold(key, g);
    host.append(g);
  }
  const { venousSync } = createVenous({ E, easeInOut, frameAt, geo, late, meshPaths, meshR, nextFrame, ov, putA, tipsBare }, live);
  // Surgical shunts: a row of sutures across each anastomosis.
  function anastomoses(id) {
    const x = E[id], L = geo[id].len;
    const R = x.width / 2 + (x.wallPx || 1) + 2;
    let d = '';
    for (const c of [Math.min(10, L * 0.1), Math.max(L - 10, L * 0.9)]) for (const o of [-3.5, 0, 3.5]) {
      const q = frameAt(id, c + o);
      d += `M${(q.x + q.nx * R).toFixed(1)} ${(q.y + q.ny * R).toFixed(1)} L${(q.x - q.nx * R).toFixed(1)} ${(q.y - q.ny * R).toFixed(1)} `;
    }
    putMark(ov.stents, `suture:${id}`, id, [s('path', { class: 'suture', d })]);
  }
  // A vessel divided at surgery (the splenic vein in a Warren shunt, the portal trunk in a portocaval
  // shunt): two suture ties across its tied-off stump, a little apart, just behind the stump's rounded end.
  // (A vein tied off along its length, not divided: `at`, the tie's place as a share of its course, puts the same two ties there, greys
  // the whole vein out as clotted, and puts the plug's cross halfway along it: the coronary vein in a Warren shunt.)
  function ligature(id, shunt, at) {
    const x = E[id], c = at != null ? geo[id].len * at : Math.min(divideLen(id) + 5, geo[id].len * 0.6);
    const R = x.width / 2 + (x.wallPx || 1) + 3;
    let d = '';
    if (at != null) {
      let w = '';
      geo[id].cur.forEach((q, i) => { w += `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)} `; });
      putMark(ov.stents, `tieGrey:${id}`, shunt, [s('path', { class: 'tied-off', d: w, 'stroke-width': (x.width + 2 * (x.wallPx || 1)).toFixed(1) })]);
    }
    for (const o of [-3.5, 3.5]) {
      const q = frameAt(id, c + o);
      d += `M${(q.x + q.nx * R).toFixed(1)} ${(q.y + q.ny * R).toFixed(1)} L${(q.x - q.nx * R).toFixed(1)} ${(q.y - q.ny * R).toFixed(1)} `;
    }
    putMark(ov.stents, `tie:${id}`, shunt, [s('path', { class: 'ligature', d })]);
    if (at == null) return;
    const m = frameAt(id, geo[id].len * TIED_X);
    putMark(ov.plugs, `tieX:${id}`, shunt, [s('circle', { cx: m.x, cy: m.y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
      s('path', { d: `M${m.x - 4} ${m.y - 4} L ${m.x + 4} ${m.y + 4} M${m.x + 4} ${m.y - 4} L ${m.x - 4} ${m.y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 })]);
  }
  return { anastomoses, appEl, caliperAt, caliperSegs, canFade, clampA, clampFading, clampShade, easeLiver, fluidEasing, fluidFade, fluidLook, fxBuild, fxK, fxPill, fxSync, gMatrix, gSelO, glLines, holdReversals, ligature, markA, marksStale, marksSync, mk, normal, normalSync, olFading, olKey, olRings, olSet, olStep, orgTone, pinOrgans, polysD, putMark, quietFx, revHold, reversedShown, setCallouts, spotOrgans, startExit, stentMesh, stepFluid, stepReveals, trackChanges, updateFocus, updateNodesCircuit, updateOrganSel, updateOrgans, venousSync };
}
