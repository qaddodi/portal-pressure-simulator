// The change between the Anatomy and the Circuit on one clock: the target view's labels solved ahead, the old labels as ghosts, the camera lerped by the figure's progress, the pre-render of the next view, and the landing.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VB_ANAT, VB_CIRC } from './anatomy.js';
import { peelAt } from './flow-peel.js';
import { cancelFrame, cancelMay, mayTask } from './frame.js';
import { store } from './store.js';
import { clamp, lerp } from './util.js';
import { reducedMs } from './motion.js';
import { VIEW_CHANGE_MS, viewXfLeftMs, viewXfMix, viewXfRetarget } from './view-xf.js';
import { createGlideLabels } from './glide-labels.js';

export function createView(st, live) {
  const { CIRC_C, EV, VB_CIRC_R, applyVT, circTurn, circWhole, defaultVT, driftEnd, edgeVisible, endWidth, geo, handRideEnd, morphPtInto, labelJobDrop, labelJobStep, labelKeyNow, labelSig, labelSliceRun, labelTail, layoutLabels, layoutLabelsGen, refreshCTM, rotEase, sameView, sitesPaint, stageBox, updateLabels, vbBox, vesselAt, visAt, worldToLocalInto } = st;
  const xfVis = [null, null];
  function viewXfP() { const x = live.viewXf, t = live.easeInOut(live.morph); return x.tT === x.t0 ? 1 : clamp((t - x.t0) / (x.tT - x.t0), 0, 1); }
  // (The label layers the GPU does not draw (the SVG's own) come in with the new labels. Written on the layer's two groups, never on the #labels
  // root: label-gl multiplies every picture by the root's opacity (layer-alpha.js) and then by the change's own xfOld and xfNew, so a fade on the
  // root made the crossfade twice over: the old labels drawn at nothing at the tap, the new ones at n squared. 8 Nov 2026, animation recs item 1.
  // The FibroScan callout's group (gScan) has its own class fade and is left to it.)
  function xfLayer(n) {
    const v = n >= 1 ? '' : n.toFixed(3);
    if (v === live.xfOp) return;
    live.xfOp = v;
    if (live.gLabels) live.gLabels.style.opacity = v;
    if (live.gLeaders) live.gLeaders.style.opacity = v;
  }
  function xfVisFill() {
    for (let v = 0; v < 2; v++) { const a = xfVis[v] ||= new Uint8Array(EV.length); for (let i = 0; i < EV.length; i++) a[i] = live.F && visAt(EV[i], v === 0) ? 1 : 0; }
  }
  // Where a world point laid out for `view` (0 anatomy, 1 circuit) is at this frame of the change: found once, on the nearest drawn vessel of that view
  // (its segment and share along it, and what is left over), then carried by that vessel's own two courses, A and C, as the change blends them.
  // A point on no vessel (an organ's name) keeps its place in the world; on an upright circuit, mid-change, its place on the circuit's side turned
  // as that side is laid out. A Circuit zone title is on no vessel by rule: it stands on its band of the map, which never morphs (it fades in,
  // turned with rotU alone, stage.js mapTurn). Tied to the nearest vessel, or left unturned, the iPhone's titles stood off their bands for the
  // whole switch to the Circuit and jumped to the left edge as it landed (13 Nov 2026).
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
  const MA_P = [0, 0];   // (morphPtInto's answer, read at once)
  function morphAnchorAt(wx, wy, view, out, s) {
    let r = s ? s.mA : null;
    if (!r) { r = view === 1 && s?.pid?.startsWith('z:') ? MA_NONE : resolveMorphAnchor(wx, wy, view); if (s) s.mA = r; }
    let x = wx, y = wy;
    if (!r.id && view === 1) { const T = circTurn(live.morph); if (T.on) { const dx = wx - CIRC_C[0], dy = wy - CIRC_C[1]; x = CIRC_C[0] + T.c * dx - T.s * dy; y = CIRC_C[1] + T.s * dx + T.c * dy; } }
    if (r.id) {
      const g = geo[r.id], t = live.easeInOut(live.morph);
      // (Each of the two points on its own share of the change, as vesselAt moves them: the flow peel, flow-peel.js.)
      const w0 = peelAt(t, g.rk[r.i]), w1 = peelAt(t, g.rk[r.i + 1]), wf = lerp(w0, w1, r.f), w = view === 0 ? 1 - wf : wf;
      // (Mid-change on an upright circuit the CTM carries no turn: the circuit's side is laid out already turned about CIRC_C (circ-turn.js),
      // so its point, and a circuit label's offset from it, are turned here the same way, or the ghosts would drift off the figure.)
      const T = circTurn(live.morph), tc = T.on ? T.c : 1, ts = T.on ? T.s : 0;
      // (The two samples as vesselAt draws them: a reversing vessel in its chord's frame, a pinned end with its host. stage-frame.js morphPtInto.)
      morphPtInto(r.id, r.i, t, MA_P); const q0x = MA_P[0], q0y = MA_P[1];
      morphPtInto(r.id, r.i + 1, t, MA_P); const q1x = MA_P[0], q1y = MA_P[1];
      const ox = view === 0 ? r.dx : tc * r.dx - ts * r.dy, oy = view === 0 ? r.dy : ts * r.dx + tc * r.dy;
      x = q0x + (q1x - q0x) * r.f + ox * w;
      y = q0y + (q1y - q0y) * r.f + oy * w;
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
    const curS = [], visS = [], wS = [];
    live.glSuppress = true;
    try {
      live.morph = tgt; live.lastMorph = tgt; live.morphTarget = tgt;
      const rr = rotEase(live.rotU), vbT = (i) => +lerp(VB_ANAT[i], lerp(VB_CIRC[i], VB_CIRC_R[i], rr), tgt).toFixed(1);
      vbBox.x = vbT(0); vbBox.y = vbT(1); vbBox.width = vbT(2); vbBox.height = vbT(3);
      solveTargetVT.k = d.k; solveTargetVT.x = d.x; solveTargetVT.y = d.y; live.vt = solveTargetVT;
      for (let i = 0; i < EV.length; i++) {
        const x = EV[i], g = geo[x.e.id];
        curS.push(g.cur); visS.push(x.vis); wS.push(x.width);
        // (kept: the end state's courses and shown set found once for the change's frames, not again for each slice of its solve.)
        if (kept && kept.pts[i]) { g.cur = kept.pts[i]; x.vis = kept.vis[i]; continue; }
        g.cur = vesselAt(x, tgt).pts;
        x.vis = x.reveal?.out ? true : edgeVisible(x, live.F);
        if (kept) { kept.pts[i] = g.cur; kept.vis[i] = x.vis; }
      }
      live.CTM = null; refreshCTM();
      // (Each vessel at the width it is drawn at once the change lands, under the target's camera (the Circuit's lines are about twice the
      // Anatomy's): solved with the widths drawn at the tap, the new view's labels were laid out against the old view's lines, and their
      // signature never matched the landed figure's, so the landing solved them all again and moved labels (and their leaders) a frame after
      // the figure stopped. Mohammad, 10 Nov 2026: the leaders "still aren't fading smoothly and glitch" on the switch to the Circuit.)
      for (let i = 0; i < EV.length; i++) {
        const x = EV[i];
        if (kept && kept.w[i] != null) { x.width = kept.w[i]; continue; }
        const w = endWidth(x, tgt);
        if (Number.isFinite(w)) x.width = w;
        if (kept) kept.w[i] = x.width;
      }
      return fn();
    } finally {
      for (let i = 0; i < EV.length; i++) { geo[EV[i].e.id].cur = curS[i]; EV[i].vis = visS[i]; EV[i].width = wS[i]; }
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
    xfKept = { pts: [], vis: [], w: [] };
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
  // (A presenter's glide over one view: its labels solved as it sets off for where it lands, the same way: glide-labels.js.)
  const { glideXfCut, glideXfEnd, glideXfStart, glideXfStep } = createGlideLabels({ XF_SLICE_MS, handRideEnd, labelJobDrop, labelJobStep, labelSliceRun, labelTail, refreshCTM, sitesPaint, updateLabels, xfLayer }, live);
  function viewXfStart(d) {
    glideXfCut();   // (a presenter's glide's crossfade cut by the change: its new labels stand, and are frozen below)
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
    // (lab: the camera the new labels were solved for. p0: the camera's share already travelled when a framing was asked of the change, viewXfRetarget.)
    live.viewXf = { t0: live.easeInOut(live.morph), tT: live.morphTarget, from: { ...live.vt }, to, lab: to, p0: 0, same: sameView(live.vt, to), pending, landAt: pending ? null : 0, tStart: performance.now(), sigTap: live.solvedFor?.sig || null };
    // (The change's own length, for whoever waits on it (the presenter's cards: glideLeft, viewChanging): what is left of VIEW_CHANGE_S from the morph as it stands, not 700 ms.)
    live.vtTarget = to; live.vtGliding = !live.viewXf.same; const ms = reducedMs(VIEW_CHANGE_MS); live.vtUntil = performance.now() + viewXfLeftMs(live.morph, live.morphTarget, ms); live.vtMs = ms;
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
        if (xfSolveSlice(x.lab, XF_SLICE_MS)) { x.pending = false; x.landAt = p; x.sigTap = live.solvedFor?.sig || null; }
      }
    }
    const m = viewXfMix(p, x.landAt, XF_MIX);
    xfLayer(m.n);
    live.labelGL.crossfade(m.o, m.n);
    if (p >= 1 || live.morph === live.morphTarget) viewXfEnd();
  }
  // The other view's labels solved ahead, in idle slices (a dry solve at that view's end state, the slots kept by a key of what the labels show, the framing and
  // the stage): at a tap they are carried, with no solve. Anything moving drops one in progress, the view's own layouts (every frame or two on a playing model) do
  // not: it has scratch of its own (stage-label-solve.js DRY_SC, segIdxDry). A new framing or stage begins it again (preSlice). (slots, key, slotsTgt, slotsD: the
  // last whole solve and what it was made for, kept while the next is made, so a tap mid-way still finds one; g, gKey, gFrame, d, tgt, k: the solve under way.)
  const pre = { need: true, g: null, key: null, gKey: null, gFrame: '', cur: '', d: null, tgt: 0, k: 1, slots: null, slotsTgt: -1, slotsD: null, tasked: false };
  const cutSig = (t) => t.slice(t.indexOf('|')), preFrame = (d) => `${Math.round(d.k * 100)},${Math.round(d.x)},${Math.round(d.y)},${stageBox().width},${stageBox().height},${live.rotU > 0.5},${live.labelFonts},${live.calloutSig()},${live.labelIns()}`;
  function preKey(d) { return `${cutSig(labelSig(live.F))}|${preFrame(d)}`; }
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
  // (preKeep: what the solve ahead may survive. A live solve sliced over frames (labelJob) only pauses it: the dry solve has its own scratch, so it
  // is left mid-way while the job runs and takes up its next slice once the job lands (labelTail asks again); it never slices between two of the
  // job's own. preIdle: what it may take a slice in.)
  const preKeep = () => !!live.F && !!live.labelGL && !live.labelGL.lost && !live.viewXf && !live.handRide && !live.gestureOn() && !live.camMove && !live.drifting && !live.glSuppress
    && live.morph === live.morphTarget && (live.morph === 0 || live.morph === 1) && live.rotU === live.rotTarget && !live.lobuleOn && !live.lz?.isOpen() && !(live.cath.st && !live.cath.st.keep) && !live.vtGliding;
  const preIdle = () => !live.labelJob && preKeep();
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
    if (!preKeep()) preAbort(); else if (live.labelJob) return false; else if (!preSlice(3)) { pre.tasked = true; mayTask('label presolve', preStep, live.JOB_NOW); }
    return false;
  }
  // (A slice of ms, at the other view's end state; true once landed. What the solve sets on the stage is put back: slots, turn, label scale, lines' index.)
  function preSlice(ms) {
    const tgt = live.morphTarget === 0 ? 1 : 0;
    // (A new solve's framing is read before the stage is put to its end: read inside, a framing moved since the last (a zoom) began it for the old one.)
    if (pre.g && (pre.tgt !== tgt || preFrame(pre.d) !== pre.gFrame || !sameView(preFraming(tgt), pre.d))) preAbort();
    if (!pre.g) { pre.d = preFraming(tgt); pre.tgt = tgt; pre.gFrame = preFrame(pre.d); }
    const keepSol = live.labelSol, keepSpare = live.labelSolSpare, keepTurn = live.labelTurned, keepK = live.labelK, kn = live.lbkNum, ks = live.lbkStr, keepIdx = live.segIdx;
    const dk = live.gLabels.dataset.k, lv = live.gLabels.style.getPropertyValue('--lbk');
    let done = false;
    try {
      atTargetStage(pre.d, () => {
        live.segIdx = live.segIdxDry;   // (its own lines, built by its first slice that needs them, untouched by the live layouts' builds)
        if (!pre.g) { pre.need = false; pre.gKey = preKey(pre.d); live.labelSol = new Map(keepSol); pre.g = layoutLabelsGen(live.F, true, true); }   // (a copy: a turn between the views clears the slots it finds)
        else live.labelK = pre.k;   // (the target view's label scale, which its first slice set: the gaps between a reading's runs are measured with it)
        done = labelSliceRun(pre.g, ms).valueOf(); pre.k = live.labelK;
        if (done) { const m = new Map(); for (const [k, v] of live.labelSol) m.set(k, { ...v }); pre.slots = m; pre.key = pre.gKey; pre.slotsTgt = pre.tgt; pre.slotsD = { ...pre.d }; pre.cur = ''; }
      }, tgt);
    } catch (e) { pre.g = null; pre.d = null; throw e; }
    finally {
      live.labelSol = keepSol; live.labelSolSpare = keepSpare; live.labelTurned = keepTurn; live.labelK = keepK; live.lbkNum = kn; live.lbkStr = ks; live.segIdx = keepIdx;
      if (dk === undefined) delete live.gLabels.dataset.k; else live.gLabels.dataset.k = dk;
      if (lv) live.gLabels.style.setProperty('--lbk', lv);
    }
    if (done) { pre.g = null; pre.cur = preNowKey(); }
    return done;
  }
  // (The node check's (tests/label-presolve-interleave.test.js): a whole run in slices of ms, between() after each that did not land.)
  function preRun(ms, between) { preAbort(); let n = 1; for (; !preSlice(ms); n++) between?.(); return { slots: pre.slots, slices: n }; }
  // (The framing a tap on the other view would take: setView.)
  function preFraming(tgt) {
    const wasOut = tgt === 1 && (live.vt.k <= 1.001 || (live.homeAt && sameView(live.vt, live.homeAt)));
    return wasOut ? circWhole() : defaultVT(tgt === 1);
  }
  // (The signature the landed figure gives against the one its labels were solved for at the tap: the same but for the geometry's version and,
  // within the 2 px steps the labels read them in (stage-labels.js sigWidth), the vessels' widths. The solve read each vessel at the width the
  // change lands it at (endWidth), worked out from the model frame and the target camera of the tap; the figure drawn there may round a vein
  // a pixel the other way (a phone's hepatic veins, 14 against 15). Solved again for that, the landing moved labels and their leaders and
  // brought new ones in a frame after the figure stopped.)
  const WIDTH_TOK = /^(.*?)(\d+)(g?)$/;
  function sameWidthTok(a, b) {
    if (a === b) return true;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const ma = WIDTH_TOK.exec(a.slice(i)), mb = WIDTH_TOK.exec(b.slice(i));
    return !!ma && !!mb && ma[1] === '' && mb[1] === '' && ma[3] === mb[3] && Math.abs(+ma[2] - +mb[2]) <= 2;
  }
  function sameButWidths(a, b) {
    if (a === b) return true;
    const fa = a.split('|'), fb = b.split('|');
    if (fa.length !== fb.length) return false;
    for (let i = 0; i < fa.length; i++) {
      if (fa[i] === fb[i]) continue;
      if (fa[i][0] !== '~' || fb[i][0] !== '~') return false;   // (only the vessels' field, marked so in labelSig: no other may differ)
      const ta = fa[i].slice(1).split(','), tb = fb[i].slice(1).split(',');
      if (ta.length !== tb.length) return false;
      for (let j = 0; j < ta.length; j++) if (!sameWidthTok(ta[j], tb[j])) return false;
    }
    return true;
  }
  function xfMarkCurrent(tap) {
    if (!live.F || !live.solvedFor || live.solvedFor.sig !== tap) return;
    const sig = labelSig(live.F), cut = (t) => t.slice(t.indexOf('|'));
    if (sig !== tap && sameButWidths(cut(sig), cut(tap))) { live.solvedFor.sig = sig; if (live.labelKey) live.labelKey[16] = sig; }
  }
  // A framing asked for while the change runs (animateVT: a slide's, a Fit, a refit to cards that settled) is the change's new end: the camera goes on
  // from where it stands to it on the change's one clock, with no second glide that would fight the morph's own camera writes (push B, item 3).
  // The new view's labels, if they are not yet crossing over, are solved again for that camera, as the tap solved them for the first.
  function viewXfRetargetTo(to) {
    const x = live.viewXf;
    if (!x || x.hand) return false;
    const p = viewXfP();
    if (!viewXfRetarget(x, live.vt, to, p, sameView(live.vt, to))) return false;
    live.vtTarget = x.to; live.vtGliding = !x.same;
    const crossing = x.landAt != null && (x.landAt >= 1 || p > (x.landAt > 0.5 ? x.landAt : 0.5));
    if (!crossing && !sameView(x.lab, x.to) && live.F) {
      labelJobDrop();
      x.lab = x.to;
      // (As at the tap: with no change running in the label code's eyes, which would skip the solve.)
      live.viewXf = null;
      let pending;
      try { pending = solveTargetView(x.to); } finally { live.viewXf = x; }
      x.pending = pending; x.landAt = pending ? null : p; x.sigTap = live.solvedFor?.sig || null;
    }
    return true;
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
  return { glideXfEnd, glideXfStart, glideXfStep, morphAnchorAt, pre, preAbort, preAsk, preRun, viewXfP, viewXfRetargetTo, viewXfStart, viewXfStep, xfMarkCurrent, xfRelease };
}
