// The change between the Anatomy and the Circuit on one clock: the target view's labels solved ahead, the old labels as ghosts, the camera lerped by the figure's progress, the pre-render of the next view, and the landing.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VB_ANAT, VB_CIRC } from './anatomy.js';
import { cancelFrame, cancelMay, mayTask } from './frame.js';
import { store } from './store.js';
import { clamp, lerp } from './util.js';
import { viewXfMix } from './view-xf.js';

export function createView(st, live) {
  const { EV, VB_CIRC_R, applyVT, circWhole, defaultVT, driftEnd, edgeVisible, geo, handRideEnd, labelJobDrop, labelJobStep, labelKeyNow, labelSig, labelSliceRun, labelTail, layoutLabels, layoutLabelsGen, refreshCTM, rotEase, sameView, stageBox, updateLabels, vbBox, vesselAt, visAt, worldToLocalInto } = st;
  const xfVis = [null, null];
  function viewXfP() { const x = live.viewXf, t = live.easeInOut(live.morph); return x.tT === x.t0 ? 1 : clamp((t - x.t0) / (x.tT - x.t0), 0, 1); }
  // (The label layers the GPU does not draw (the SVG's own, the liver's pane) come in with the new labels.)
  function xfLayer(n) {
    const v = n >= 1 ? '' : n.toFixed(3);
    if (v === live.xfOp) return;
    live.xfOp = v;
    if (live.labelSvg) live.labelSvg.style.opacity = v;
    live.glass.style.opacity = v;
  }
  function xfVisFill() {
    for (let v = 0; v < 2; v++) { const a = xfVis[v] ||= new Uint8Array(EV.length); for (let i = 0; i < EV.length; i++) a[i] = live.F && visAt(EV[i], v === 0) ? 1 : 0; }
  }
  // Where a world point laid out for `view` (0 anatomy, 1 circuit) is at this frame of the change: found once, on the nearest drawn vessel of that view
  // (its segment and share along it, and what is left over), then carried by that vessel's own two courses, A and C, as the change blends them.
  // A point on no vessel (an organ's name) keeps its place in the world.
  const MA_NONE = { i: -1, f: 0, dx: 0, dy: 0, id: null };
  function resolveMorphAnchor(wx, wy, view) {
    const vis = xfVis[view];
    let best = null, bd = 25 * 25;
    for (let n = 0; n < EV.length; n++) {
      if (vis && !vis[n]) continue;
      const g = geo[EV[n].e.id], P = g && (view === 0 ? g.A : g.C);
      if (!P || P.length < 2 || !g.C || g.C.length !== g.A.length) continue;
      for (let i = 0; i < P.length - 1; i++) {
        const ax = P[i][0], ay = P[i][1], bx = P[i + 1][0], by = P[i + 1][1], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
        const f = l2 > 0 ? clamp(((wx - ax) * ex + (wy - ay) * ey) / l2, 0, 1) : 0, qx = ax + ex * f, qy = ay + ey * f, d2 = (wx - qx) * (wx - qx) + (wy - qy) * (wy - qy);
        if (d2 < bd) { bd = d2; best = { id: EV[n].e.id, i, f, dx: wx - qx, dy: wy - qy }; }
      }
    }
    return best || MA_NONE;
  }
  function morphAnchorAt(wx, wy, view, out, s) {
    let r = s ? s.mA : null;
    if (!r) { r = resolveMorphAnchor(wx, wy, view); if (s) s.mA = r; }
    let x = wx, y = wy;
    if (r.id) {
      const g = geo[r.id], t = live.easeInOut(live.morph), a0 = g.A[r.i], a1 = g.A[r.i + 1], c0 = g.C[r.i], c1 = g.C[r.i + 1], w = view === 0 ? 1 - t : t;
      x = lerp(a0[0] + (a1[0] - a0[0]) * r.f, c0[0] + (c1[0] - c0[0]) * r.f, t) + r.dx * w;
      y = lerp(a0[1] + (a1[1] - a0[1]) * r.f, c0[1] + (c1[1] - c0[1]) * r.f, t) + r.dy * w;
    }
    worldToLocalInto(out, x, y);
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  }
  // The new view's labels laid out for where the change lands: the stage put to its end (the view, the camera, the vessels' courses and which
  // are drawn), the labels solved whole, and the stage put back, nothing drawn in between.
  const solveTargetVT = { k: 1, x: 0, y: 0 };
  // (Runs fn with the stage at the change's end state, then puts it back, nothing drawn in between. Each slice of the solve runs inside it.)
  function atTargetStage(d, fn, tgt = live.morphTarget, kept = null) {
    const keepTgt = live.morphTarget, keepVT = live.vt, keepMorph = live.morph, keepLast = live.lastMorph, vb0 = vbBox.x, vb1 = vbBox.y, vb2 = vbBox.width, vb3 = vbBox.height;
    const curS = [], visS = [];
    live.glSuppress = true;
    try {
      live.morph = tgt; live.lastMorph = tgt; live.morphTarget = tgt;
      const rr = rotEase(live.rotU), vbT = (i) => +lerp(VB_ANAT[i], lerp(VB_CIRC[i], VB_CIRC_R[i], rr), tgt).toFixed(1);
      vbBox.x = vbT(0); vbBox.y = vbT(1); vbBox.width = vbT(2); vbBox.height = vbT(3);
      solveTargetVT.k = d.k; solveTargetVT.x = d.x; solveTargetVT.y = d.y; live.vt = solveTargetVT;
      for (let i = 0; i < EV.length; i++) {
        const x = EV[i], g = geo[x.e.id];
        curS.push(g.cur); visS.push(x.vis);
        // (kept: the end state's courses and shown set found once for the change's frames, not again for each slice of its solve.)
        if (kept && kept.pts[i]) { g.cur = kept.pts[i]; x.vis = kept.vis[i]; continue; }
        g.cur = vesselAt(x, tgt).pts;
        x.vis = x.reveal?.out ? true : edgeVisible(x, live.F);
        if (kept) { kept.pts[i] = g.cur; kept.vis[i] = x.vis; }
      }
      live.CTM = null; refreshCTM();
      return fn();
    } finally {
      for (let i = 0; i < EV.length; i++) { geo[EV[i].e.id].cur = curS[i]; EV[i].vis = visS[i]; }
      live.morph = keepMorph; live.lastMorph = keepLast; live.morphTarget = keepTgt; live.vt = keepVT;
      vbBox.x = vb0; vbBox.y = vb1; vbBox.width = vb2; vbBox.height = vb3;
      live.CTM = null; refreshCTM();
      live.glSuppress = false;
    }
  }
  // (The target's solve landed after the change did: the old view's labels, which rode the figure as ghosts all the while, give way to the new
  // ones in one frame. No timer fade: a fade after the figure has stopped is what read as a pop (Mohammad, 4 Nov 2026: "nothing arrives then
  // they show up pop in existence"), and the ghosts stood on the figure until this frame, so there is no empty screen to fade from.)
  function xfRelease() {
    if (!live.xfHold) return;
    live.xfHold = false;
    xfLayer(1); live.labelGL.dropGhosts();
  }
  const XF_SLICE_MS = 8;   // (a slice of the target's solve in a frame of the change (GPU-drawn): twice the 4 it was lands the Circuit's in half the frames; the ghosts ride until it lands, however late)
  let xfKept = null;
  function solveTargetView(d) {
    live.labelKey = null; live.solveAsked = true;
    xfKept = { pts: [], vis: [] };
    preAbort();
    live.xfSolving = true;
    try {
      atTargetStage(d, () => {
        // (The other view's labels were solved ahead in idle time (preStep) for this very framing: their slots are carried, with no solve.)
        // (Kept slots made for a stage a little different from the tap's (a value moved, an inset, a 4 Nov solve that wiped them as the model
        // played) are tried too, carried only if every label still fits clear of the others; only when none fit is the target solved here.)
        if (pre.slots && pre.slotsTgt === live.morphTarget && (pre.key === preKey(d) || preNear(d)) && preCommit(pre.key !== preKey(d))) return;
        updateLabels(live.F, true);
      }, live.morphTarget, xfKept);
    } finally { live.xfSolving = false; }
    cancelMay('label solve');   // (the job is ours: no idle slice runs it)
    if (!live.labelJob) { live.labelGlSync(); return false; }
    return true;   // pending
  }
  // (One slice of the pending solve, at the stage's end state; true once it has landed.)
  function xfSolveSlice(d, ms) {
    const j = live.labelJob;
    if (!j) return true;
    let done = false;
    atTargetStage(d, () => {
      try { done = labelSliceRun(j.g, ms); } catch (e) { live.labelJob = null; live.labelKey = null; throw e; }
      if (!done) return;
      live.labelJob = null;
      live.solvedFor = j.solvedFor; live.solveAsked = false;
      live.labelKey = live.keyInto(live.labelKeyArr, j.key); live.stats.layouts++;
      labelTail();
    }, live.morphTarget, xfKept);
    if (done) live.labelGlSync();
    return done;
  }
  function viewXfStart(d) {
    live.xfHold = false;
    live.viewXf = null;   // (a change begun on another: the new one is solved first, with the layers out of the old one's hands)
    labelJobDrop();
    if (live.handRide) handRideEnd();
    live.labelGL.freezeGhosts();
    xfVisFill();
    const pending = solveTargetView(d);
    // (A glide of the camera that was running is over: the change's own clock moves it now.)
    cancelFrame(live.vtAnim); live.arcRun = null; live.following = false;
    if (live.drifting) driftEnd();
    live.drifting = false;
    const to = { k: d.k, x: d.x, y: d.y };
    // (landAt: the share of the change at which the target's labels were whole (0: at the tap), null while they are still being solved. The old
    // view's labels ride as ghosts at full until then: viewXfMix.)
    live.viewXf = { t0: live.easeInOut(live.morph), tT: live.morphTarget, from: { ...live.vt }, to, same: sameView(live.vt, to), pending, landAt: pending ? null : 0, tStart: performance.now(), sigTap: live.solvedFor?.sig || null };
    live.vtTarget = to; live.vtGliding = !live.viewXf.same; live.vtUntil = performance.now() + 700; live.vtMs = 700;
    live.xfOp = '';
    xfLayer(0);
    viewXfStep(true);
  }
  // (Each frame of the change, after the figure is drawn at its morph: the crossfade from its progress. The camera was set before it.)
  // (The old labels ride as ghosts at full until the new ones are whole, then the two cross over the change's remaining progress (from its
  // half when the solve was ahead of it, as before; from the frame the solve lands when it was late): never a frame with no labels on the figure.)
  const XF_MIX = { o: 1, n: 0 };   // (written each frame of the change: no record made)
  function viewXfStep(first = false) {
    const x = live.viewXf, p = viewXfP();
    refreshCTM();
    if (x.pending && !first) {
      if (!live.labelJob) { x.pending = false; x.landAt = p; live.labelKey = null; live.solveAsked = true; }   // (the job was dropped by another: laid out as it lands)
      else {
        if (xfSolveSlice(x.to, XF_SLICE_MS)) { x.pending = false; x.landAt = p; x.sigTap = live.solvedFor?.sig || null; }
      }
    }
    const m = viewXfMix(p, x.landAt, XF_MIX);
    xfLayer(m.n);
    live.labelGL.crossfade(m.o, m.n);
    if (p >= 1 || live.morph === live.morphTarget) viewXfEnd();
  }
  // The other view's labels solved ahead, in idle slices (a dry solve at that view's end state, the slots kept by a key of what the labels
  // show, the framing and the stage): at a tap they are carried, with no solve. A real solve, a carry or anything moving drops one in progress.
  // (slots, key, slotsTgt, slotsD: the last whole solve and what it was made for, kept while the next is made, so a tap mid-way still finds one;
  // g, gKey, d, tgt: the solve under way.)
  const pre = { need: true, g: null, key: null, gKey: null, cur: '', d: null, tgt: 0, slots: null, slotsTgt: -1, slotsD: null, tasked: false };
  const cutSig = (t) => t.slice(t.indexOf('|'));
  function preKey(d) { return `${cutSig(labelSig(live.F))}|${Math.round(d.k * 100)},${Math.round(d.x)},${Math.round(d.y)},${stageBox().width},${stageBox().height},${live.rotU > 0.5},${live.labelFonts},${live.calloutSig()},${live.labelIns()}`; }
  function preAbort() { if (pre.g) { pre.g.return(); pre.g = null; pre.need = true; } }
  // (The kept slots' framing near enough the tap's to carry them: the same zoom within a tenth, the centre within an eighth of the stage.)
  function preNear(d) {
    const o = pre.slotsD, b = stageBox();
    return !!o && Math.abs(Math.log(d.k / o.k)) < 0.1 && Math.abs(d.x - o.x) * 8 < b.width && Math.abs(d.y - o.y) * 8 < b.height;
  }
  function preCommit(loose = false) {
    const keep = live.labelSol, keepTurn = live.labelTurned, m = new Map();
    for (const [k, v] of pre.slots) m.set(k, { ...v });
    live.labelSol = m;
    // (The slots were solved turned as the target view is (a phone's Circuit is drawn turned): the layer is told so first. Otherwise the turn
    // between the views cleared them in layoutLabels and the carry failed every time, so on the iPhone each tap on the Circuit solved it all.)
    live.labelTurned = live.easeInOut(live.morph) >= 0.5 && live.rotU > 0.5;
    if (loose) live.carryClear = true;   // (made for a stage a little different: carried only clear of each other)
    let ok;
    try { ok = layoutLabels(live.F, false) !== false; } finally { live.carryClear = false; }
    if (!ok) { live.labelSol = keep; live.labelTurned = keepTurn; return false; }
    const sf = live.solvedFor === live.SOLVED_A ? live.SOLVED_B : live.SOLVED_A, sig = labelSig(live.F);
    sf.sig = sig; sf.sc = live.CTM.sc; sf.th = Math.atan2(live.CTM.b, live.CTM.a); sf.csig = live.calloutSig(); sf.ins = live.labelIns(); sf.view = live.morphTarget; sf.ck = null;
    live.solvedFor = sf; live.solveAsked = false;
    live.labelKey = live.keyInto(live.labelKeyArr, labelKeyNow(store.get(), sig, stageBox())); live.stats.layouts++;
    labelTail();
    return true;
  }
  const preIdle = () => !!live.F && !!live.labelGL && !live.labelGL.lost && !live.viewXf && !live.labelJob && !live.handRide && !live.gestureOn() && !live.camMove && !live.drifting && !live.glSuppress
    && live.morph === live.morphTarget && (live.morph === 0 || live.morph === 1) && live.rotU === live.rotTarget && !live.lobuleOn && !live.lz?.isOpen() && !(live.cath.st && !live.cath.st.keep) && !live.vtGliding;
  // (What the kept solution was made for, read at the stage as it stands: a change in any of these, a new patient frame, a selection, a resize, a font, makes it
  // stale, and it is made again at once in idle time. Otherwise a solution that no longer matched at the tap was never replaced, and the tap solved it all.)
  const preNowKey = () => (pre.d ? preKey(preFraming(pre.tgt)) : '');
  function preAsk() {
    if (pre.slots && !pre.g && !pre.need && preIdle() && preNowKey() !== pre.cur) pre.need = true;   // (the kept slots stand until the new ones are whole)
    if (pre.tasked || !(pre.need || pre.g) || !preIdle()) return;
    pre.tasked = true;
    mayTask('label presolve', preStep, live.JOB_NOW);   // (a slice a frame while the figure rests, not when a frame happens to be spare)
  }
  function preStep() {
    pre.tasked = false;
    if (!preIdle()) { preAbort(); return false; }
    const tgt = live.morphTarget === 0 ? 1 : 0;
    const keepSol = live.labelSol, keepSpare = live.labelSolSpare, keepTurn = live.labelTurned, keepK = live.labelK, kn = live.lbkNum, ks = live.lbkStr;
    const dk = live.gLabels.dataset.k, lv = live.gLabels.style.getPropertyValue('--lbk');
    let done = false;
    // (A new solve's framing is read before the stage is put to its end: it was read inside, after the first slice's stage had been put at the
    // last solve's framing, so a framing that had moved since (a zoom in the anatomy) keyed and began its solve for the old one.)
    if (!pre.g) { pre.d = preFraming(tgt); pre.tgt = tgt; }
    try {
      atTargetStage(pre.d, () => {
        if (!pre.g) {
          pre.need = false;
          pre.gKey = preKey(pre.d);
          live.labelSol = new Map(keepSol);   // (a turn between the views clears the slots it finds: not the standing ones)
          pre.g = layoutLabelsGen(live.F, true, true);
        }
        done = labelSliceRun(pre.g, 3).valueOf();
        if (done) { const m = new Map(); for (const [k, v] of live.labelSol) m.set(k, { ...v }); pre.slots = m; pre.key = pre.gKey; pre.slotsTgt = pre.tgt; pre.slotsD = { ...pre.d }; pre.cur = ''; }
      }, tgt);
    } catch (e) { pre.g = null; pre.d = null; throw e; }
    finally {
      live.labelSol = keepSol; live.labelSolSpare = keepSpare; live.labelTurned = keepTurn; live.labelK = keepK; live.lbkNum = kn; live.lbkStr = ks;
      if (dk === undefined) delete live.gLabels.dataset.k; else live.gLabels.dataset.k = dk;
      if (lv) live.gLabels.style.setProperty('--lbk', lv);
    }
    if (done) { pre.g = null; pre.cur = preNowKey(); return false; }
    pre.tasked = true;
    mayTask('label presolve', preStep, live.JOB_NOW);
    return false;
  }
  // (The framing a tap on the other view would take: setView.)
  function preFraming(tgt) {
    const wasOut = tgt === 1 && (live.vt.k <= 1.001 || (live.homeAt && sameView(live.vt, live.homeAt)));
    return wasOut ? circWhole() : defaultVT(tgt === 1);
  }
  function xfMarkCurrent(tap) {
    if (!live.F || !live.solvedFor || live.solvedFor.sig !== tap) return;
    const sig = labelSig(live.F), cut = (t) => t.slice(t.indexOf('|'));
    if (sig !== tap && cut(sig) === cut(tap)) { live.solvedFor.sig = sig; if (live.labelKey) live.labelKey[16] = sig; }
  }
  function viewXfEnd() {
    const x = live.viewXf;
    if (!x) return;
    // (The morph landed first: the solve goes on at rest, a slice every frame and the longest it takes (its clock set back so it is not eased in),
    // the stage being at its end state, and is marked current when it lands. The old labels stay as ghosts on the landed figure until then.)
    if (x.pending && live.labelJob) { live.labelJob.xfTap = live.labelJob.solvedFor.sig; live.labelJob.t0 = performance.now() - 1000; mayTask('label solve', labelJobStep, live.JOB_NOW); }
    live.xfHold = !!(x.pending && live.labelJob);
    x.pending = false;
    live.viewXf = null;
    if (!x.same) { live.vt = { ...x.to }; applyVT(); live.CTM = null; }
    live.vtGliding = false;
    if (live.xfHold) { xfLayer(0); live.labelGL.crossfade(1, 0); } else { xfLayer(1); live.labelGL.dropGhosts(); }
    refreshCTM();
    // (Laid out for this very camera already: the solve at the tap was for the landed geometry, so it stands. The signature differs only by the geometry's
    // version, which every morph frame bumped: marked current, the landing only refreshes values and does not solve again.)
    if (live.F && x.sigTap && !live.labelJob) xfMarkCurrent(x.sigTap);
    if (live.F) updateLabels(live.F);
  }
  return { morphAnchorAt, pre, preAbort, preAsk, viewXfP, viewXfStart, viewXfStep, xfMarkCurrent, xfRelease };
}
