// The label driver: what the labels were solved for, the hand ride keys, pinch, settle, signature, solved-slot cache, updateLabels and the label job.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES } from '../engine/topology.js';
import { CHIP_NODES } from './anatomy.js';
import { afterMotion, cancelFrame, cancelMay, frameFor, inMotion, mayTask } from './frame.js';
import { COUNTED, gpuProbe } from './gpu-probe.js';
import { store } from './store.js';

export function createLabelDriver(st, live) {
  const { E, EI, EV, LABEL_FIRST_REST_MS, LABEL_REST_SLICE_MS, LABEL_SLICE_MS, calloutSig, camSettle, cath, dop, dpr, dprobePaint, easeInOut, explain, fxBuild, glideXfEnd, hasVarices, isImaging, labelBase, labelGlSync, layerMode, layoutLabels, layoutLabelsGen, nextFrame, nodeItem, pre, preAsk, pzInset, refreshCTM, renderBlock, resItem, sameDeps, scan, scanItem, scanPaint, shortenTo, sigFold, sites, sitesPaint, stageBox, themeKey, velItem, wrap, xfMarkCurrent, xfRelease } = st;
  const SOLVED_A = { sig: null, sc: 0, th: 0, csig: 0, ins: 0 }, SOLVED_B = { sig: null, sc: 0, th: 0, csig: 0, ins: 0 };   // (what updateLabels writes it into, by turns)
  const JOB_NOW = { maxWait: 0 };
  const HAND_STILL_MS = 90;   // (a wheel step is over this long after its last tick: the settle no longer waits the 250 ms of gestureOn)
  const JOB = { g: null, key: null, solvedFor: null, t0: 0 }, jobKeyArr = [], labelKeyArr = [];   // (the solve in slices: one at a time, its key and the key of the layout that stands, kept)
  const keyInto = (to, from) => { to.length = from.length; for (let i = 0; i < from.length; i++) to[i] = from[i]; return to; };
  const labelVis = new Map(); // key → shown last frame (hysteresis against blockers)
  const zoneStick = new Map();   // zone title key -> [world x, y] of its centre at the last layout (sticky placement)
  // Levels of detail (Blood menu › Labels). Key: at the home framing only the portal vein, the HVPG pair
  // (wedged sinusoids and the free hepatic vein) and the stations the model flags; zoomed in, every
  // station in view. All: every station at every zoom. None: only a selected station.
  const KEY_NODES = ['CONF', 'SIN_R', 'RHV'];
  // (The zoom the labels' level of detail is read from is the camera at rest: the view a card zoom began at, or where a glide is headed, never the live
  // view part way, so a zoom or glide cannot flip a flag and solve the labels mid-move.)
  function labelRestK() { return live.zoomBase?.vt ? live.zoomBase.vt.k : live.vtGliding && live.vtTarget ? live.vtTarget.k : live.vt.k; }
  const zoomedIn = () => labelRestK() > (live.homeAt?.k || 1) * 1.3;
  // (The stations flagged, written into a kept list: one for the layout, which keeps its list while it runs, and one for the signature, which
  // is asked for on every frame, a layout in slices between its slices too.)
  const flagBuf = [], flagSigBuf = [];
  function flagged(f, out = flagBuf) {
    const st = store.get();
    out.length = 0;
    if (hasVarices('VAR', f)) out.push('VAR');
    if (hasVarices('GV', f)) out.push('GV');
    if (f.metrics?.ra > 10) out.push('RA');   // the Findings cut-off for a raised right atrial pressure
    // A narrowed vessel: the stations either side of it.
    const sten = (f.viewParams || st.params).stenosis;
    if (sten) for (const id in sten) {
      if (!Object.hasOwn(sten, id)) continue;
      const e = sten[id] > 0 && EDGES[EI[id]];
      if (!e) continue;
      for (let q = 0; q < 2; q++) { const n = q ? e.to : e.from; if (CHIP_NODES.includes(n) && !out.includes(n)) out.push(n); }
    }
    return out;
  }
  const SOLVE_ZOOM = 0.05, SOLVE_TURN = 0.03;   // re-solve after a 5 % zoom change or ~2 degrees of turn
  // While a hand zooms (a pinch, the wheel, a flick), the labels are carried up to a 35 % change before they are solved again, as long as
  // no carried label comes onto another (carryClear); they are solved for where the view stopped once it is let go (labelSettleSoon),
  // and glide to their new spots (labelGlide). Solving every 5 % was a full search about every third frame of a pinch.
  const SOLVE_ZOOM_HAND = 0.35;
  // (What the labels show, as identities: a hand's ride compares it with what it was when the ride began. Not the vessels' widths or
  // geometry, nor the two flags the zoom itself flips (vt.k > 1.35, zoomedIn): on a playing model the widths move every few frames and
  // the zoom crosses the flags, and the signature then ended every ride within a frame or two. Written into kept lists, no string made.)
  const rideKeyA = [], rideKeyB = [];
  function rideKeyInto(k, st) {
    k[0] = st.selection?.type; k[1] = st.selection?.id; k[2] = st.layers.labels; k[3] = st.layers.chips; k[4] = layerMode(); k[5] = st.focus?.label;
    k[6] = st.focus?.edges?.[0]; k[7] = st.focus?.marks; k[8] = st.labelLevel; k[9] = scan.on; k[10] = dop.key; k[11] = live.fxSig; k[12] = live.fx; k[13] = st.presenting;
    k[14] = st.presentLabels; k[15] = st.presentTerms; k[16] = st.presentNames; k[17] = st.hiddenLabels; k[18] = labelBase(); k[19] = live.projecting; k[20] = explain.key;
    return k;
  }
  const rideKeyHeld = (st) => sameDeps(rideKeyA, rideKeyInto(rideKeyB, st));
  // (No timer: the labels are solved in the first frame after the hand lets go and any push has landed.)
  function labelSettleSoon() {
    cancelFrame(live.labelSettleT);
    live.labelSettleT = nextFrame(labelSettle);
  }
  function labelSettle() {
    if (live.gestureOn() || live.drifting) { live.labelSettleT = nextFrame(labelSettle); return; }
    live.labelSettleT = 0;
    if (live.reslotted) { live.reslotted = false; live.solvedFor = null; }   // (readings placed one by one mid-gesture: all solved together now)
    if (live.F && !live.camMove && !live.lz?.isOpen()) { live.labelKey = null; updateLabels(live.F); }
  }
  function sigWidth(x) {
    const w = x.width || 0, s = live.sigW.get(x.e.id);
    if (s != null && Math.abs(w - s) < 2) return s;
    live.sigW.set(x.e.id, Math.round(w));
    return Math.round(w);
  }
  function stentReady(sid, f) {
    const x = E[sid];
    if (!x?.vis) { live.stentCalm.delete(sid); return false; }
    const now = performance.now(), c = live.stentCalm.get(sid);
    if (!c || x.reveal || f.morphing || x.width !== x.wT) { live.stentCalm.set(sid, now); return false; }
    return now - c >= live.STENT_CALM_MS;
  }
  const paramJSON = (o) => { if (!o || typeof o !== 'object') return JSON.stringify(o); let j = live.paramJSONs.get(o); if (j === undefined) live.paramJSONs.set(o, (j = JSON.stringify(o))); return j; };
  let labelGeo = 0;
  // (R04, review pass 2: the signature is rebuilt only when one of the things it is made from changed: the frame, the store's
  // revision, the geometry's version, the vessels' shown set (edgeRev), the slide's marks and the few view thresholds it reads. A
  // camera move alone (a pan, a pinch, a glide: every frame) changes none of them, and had rebuilt the whole string, every vessel's
  // id and width joined, on each of its frames. ?labelrev=0: built on every call, as before.)
  let sigText = '';
  const sigDeps = [], sigNow = [];
  function labelSig(f) {
    const st = store.get(), t = easeInOut(live.morph);
    // (Between the two views the vessels' geometry changes every frame: the labels are carried along with it, and solved again when the
    // change reaches its second half and when it lands, as the geometry's version then stands.)
    if (!(live.morph > 0 && live.morph < 1)) labelGeo = live.geometryVersion;
    const tips = +stentReady('TIPS', f), dips = +stentReady('DIPS', f);
    const d = sigNow;
    d[0] = f; d[1] = store.rev; d[2] = labelGeo; d[3] = t >= 0.5; d[4] = live.rotU > 0.5; d[5] = labelBase(); d[6] = stageBox().width < 700;
    d[7] = labelRestK() > 1.35; d[8] = zoomedIn(); d[9] = scan.on; d[10] = live.fxSig; d[11] = live.fx; d[12] = live.slideGlow; d[13] = dop.key; d[14] = live.edgeRev;
    d[15] = tips; d[16] = dips; d[17] = live.projecting; d[18] = live.glowSetAt; d[19] = labelRestK() >= 1.9; d[20] = live.resMask; d[21] = live.resLitRev; d[22] = !!sites.list;
    if (sigDeps.length === d.length && sameDeps(sigDeps, d)) return sigText;
    for (let i = 0; i < d.length; i++) sigDeps[i] = d[i];
    sigStats.builds++;
    const edges = EV.filter((x) => x.vis).map((x) => `${x.e.id}${sigWidth(x)}${x.ghost ? 'g' : ''}`).join(',');
    return (sigText = [labelGeo, t >= 0.5, live.rotU > 0.5, labelBase(), stageBox().width < 700, st.selection?.type + ':' + st.selection?.id, paramJSON((f.viewParams || st.params).stenosis), paramJSON((f.viewParams || st.params).stenosisSite),
      isImaging(), st.layers.labels, st.layers.chips, layerMode(), st.focus?.label, st.focus?.edges?.[0], st.focus?.marks && paramJSON(st.focus.marks), live.fxSig, live.fx?.steps && live.slideGlow.map((g) => g.id + g.at).join(), (live.fx?.organs.some((o) => o.organ === 'spleen') || live.fx?.calipers.some((c) => c.organ)) && Math.round((f.slow?.spleen ?? 11) * 2), d[7], st.labelLevel, st.presenting && st.presentLabels?.join(','), st.presenting && paramJSON(st.presentTerms || null), st.presenting && st.presentNames, explain.key, scan.on, [...(st.hiddenLabels || [])].join(','), d[8], flagged(f, flagSigBuf).join(','), edges, `${tips}${dips}`, dop.key, d[19]].join('|'));
  }
  const sigStats = { builds: 0 };
  // (A vessel's label width moved by its 2 px step, outside a model frame: the width's own ease, stepWidths. See sigWidth.)
  const sigWidthMoved = (x) => { const s = live.sigW.get(x.e.id); return s == null || Math.abs((x.width || 0) - s) >= 2; };
  const cathHid = () => !!cath.st && !cath.st.keep && wrap.classList.contains('cath-on') && performance.now() - live.cathHidAt > 300;
  // (What a stent's column of callouts is solved against besides the camera: the cards' insets and boxes. Empty without one.)
  const INS_KEYS = ['--pz-t', '--pz-l', '--pz-b', '--pz-r'];
  const labelIns = () => {   // (a number folded from the insets and the boxes, 0 without a column: no text is made)
    if (!dop.all) return 0;
    let h = 2166136261;
    for (let i = 0; i < 4; i++) h = sigFold(h, Math.round(pzInset(INS_KEYS[i]) / 8));
    if (live.blockerBoxes) for (let i = 0; i < live.blockerBoxes.length; i++) { const o = live.blockerBoxes[i]; h = sigFold(sigFold(sigFold(sigFold(h, Math.round(o.x0 / 8)), Math.round(o.y0 / 8)), Math.round(o.x1 / 8)), Math.round(o.y1 / 8)); }   // (and the cards' boxes, which can arrive a frame after the insets)
    return h || 1;
  };
  const stats = { layouts: 0, skips: 0, values: 0, ms: 0, jobs: 0, slices: 0, drops: 0 };
  function solCacheKey(sig, sc, th, b, csig, ins) {
    if (live.morph !== 1 || live.morphTarget !== 1 || live.xfSolving || live.viewXf || !(sc > 0)) return null;
    return [sig, Math.round(Math.log2(sc) * 4), Math.round(th * 100), Math.round(live.CTM.e / (b.width / 4)), Math.round(live.CTM.f / (b.height / 4)), b.width, b.height, live.rotU > 0.5, live.labelFonts, csig, ins].join('|');
  }
  function solCachePut(sf) {
    pre.need = true;   // (what the labels show was solved again: the other view's ahead-of-time solve is made again in idle time)
    if (!sf.ck || !(live.morph === 1 && live.morphTarget === 1)) return;
    const m = new Map();
    for (const [k, v] of live.labelSol) m.set(k, { ...v });
    live.solCache.delete(sf.ck); live.solCache.set(sf.ck, m);
    if (live.solCache.size > 6) live.solCache.delete(live.solCache.keys().next().value);
  }
  function solCacheTry(ck, f) {
    const c = live.solCache.get(ck);
    if (!c) return false;
    const keep = live.labelSol;
    const m = new Map();
    for (const [k, v] of c) m.set(k, { ...v });
    live.labelSol = m;
    if (layoutLabels(f, false) !== false) { live.solCache.delete(ck); live.solCache.set(ck, c); return true; }
    live.labelSol = keep;
    return false;
  }
  function updateLabels(f, force = false) {
    live.labelPainted = false;
    if (live.viewXf) return;   // (the change between the views: the new view's labels were solved at the tap for where it lands, and ride it)
    // Laid out once the presenter's camera settles (see camSettle), or at once if its glide was cut short. (Its new labels were solved as it
    // set off for where it lands and crossed in on its progress (glide-labels.js glideXfStart): at rest that crossfade ends, glideXfEnd.)
    if (live.camMove) { if (!live.vtGliding) camSettle(); return; }
    glideXfEnd();
    // (Not while the HVPG catheter hides them (cath-on, after its .25 s fade): its view follows the tip every frame, and every frame
    // of it had laid out, drawn and sent to the GPU labels nobody could see. setCatheter lays them out as it goes.)
    if (cathHid()) { live.labelKey = null; return; }
    const t0 = performance.now();
    refreshCTM();
    const st = store.get(), b = stageBox();
    // (Rigid labels, labels-plan.md step 6: while the camera moves (a hand's pan, pinch or wheel, a glide, a slow push, a card's zoom) and what
    // the labels show is the same, nothing is laid out. Every label stands at CTM x its world anchor + its offset, drawn by the GPU in the figure's
    // own frame (label-gl pinDraw), so it moves with the figure to the pixel; the layout is solved once, when the camera comes to rest. What the
    // labels show is compared by rideKeyHeld, not the signature: on a playing model that changes every few frames (widths, geometry).)
    const restView = live.morph === 0 || live.morph === 1;
    const moving = live.gestureOn() || live.vtGliding || live.drifting || !!live.zoomBase;
    if (moving && live.solvedFor && restView && !live.lobuleOn && !live.lz?.isOpen() && !(live.diveT > 0)) {
      if (!live.handRide) { rideKeyInto(rideKeyA, st); live.handRide = true; labelJobDrop(); handRideWatch(); }
      if (rideKeyHeld(st)) { stats.skips++; stats.ms += performance.now() - t0; return; }
      handRideEnd(); live.labelKey = null;
    } else if (live.handRide) { handRideEnd(); live.labelKey = null; }
    // (Labels are never hidden for a zoom: the anchored ones ride the camera on the GPU (world anchors), the rest are carried and solved as it goes. Mohammad, 4 Nov: "after I zoom there is like 2-3 s until labels show up in the Circuit" was this hide, lifted by a 3 s poll.)
    const sig = labelSig(f);
    // (R04: the key is a list of numbers and identities compared one by one, not a string joined on every camera frame: the camera's
    // part (the transform in hundredths, the stage box, the morph and turn) and the revisions of the rest.)
    const key = labelKeyNow(st, sig, b);
    // (A solve still running in slices for this same view: the labels stand as they are until it lands, and what changed meanwhile (a
    // value, a callout) is taken up after it, as after any solve. A camera that moved (the key's first eight: the transform, the stage
    // box, the morph and the turn) drops it, and the labels carry as they always did.)
    if (live.labelJob) {
      if (!force && sameView8(live.labelJob.key, key)) { labelTail(); return; }
      labelJobDrop();
    }
    if (!force && !live.leadOwed && sameKey(key) && (inMotion() ? holdValues(f) : refreshValues(f))) { stats.skips++; stats.ms += performance.now() - t0; }
    else {
      live.leadOwed = false;   // (this layout makes the leaders a layout asked for and could not: leadTop)
      const sc = live.CTM.sc, th = Math.atan2(live.CTM.b, live.CTM.a);
      const csig = calloutSig();
      // (A stent called out at its three points is solved again when the presenter's cards move (the monitor folded or opened): carried,
      // its callouts and the slide's mark would hide under a card or keep spots chosen for another view: Review 16 Oct.)
      const ins = labelIns();
      // (A slow push (ride) carries them however far it zooms, while none comes onto another: a label changing sides mid-push would
      // jump. They are solved again as it lands: driftEnd. A glide whose labels were solved for where it lands (landing) carries them
      // all the way, without that check: one may pass over another for a moment, the overlap pass below showing the more important.)
      // (Between the two views the labels ride with the change however far its camera zooms: solved again at its half and as it lands.)
      const dz = live.solvedFor && !(live.morph > 0 && live.morph < 1) ? Math.abs(Math.log(sc / live.solvedFor.sc)) : 0, hand = dz > SOLVE_ZOOM && live.gestureOn(), ride = (live.drifting || !!live.zoomBase) && !hand;
      const changed = !live.solvedFor || live.solveAsked || live.solvedFor.sig !== sig || live.solvedFor.csig !== csig || live.solvedFor.ins !== ins || Math.abs(th - live.solvedFor.th) > SOLVE_TURN;
      const solve = changed || (!ride && dz > (hand ? SOLVE_ZOOM_HAND : SOLVE_ZOOM));
      live.carryClear = hand; live.carryReslot = live.gestureOn();
      if (ride && dz > SOLVE_ZOOM) live.carryClear = true;   // (carried, but never onto each other)
      const solved = solve || layoutLabels(f, false) === false;
      live.carryReslot = false;
      if (solved) {
        live.carryClear = false;
        // (Written into whichever of two kept records is not the one standing: a solve in slices holds its record until it lands.)
        const sf = live.solvedFor === SOLVED_A ? SOLVED_B : SOLVED_A;
        sf.sig = sig; sf.sc = sc; sf.th = th; sf.csig = csig; sf.ins = ins; sf.view = live.morphTarget;
        sf.ck = solCacheKey(sig, sc, th, b, csig, ins);
        // (A zoom back to a step already solved in the Circuit: its recorded slots are carried, with no solve. They stand only if every label still fits.)
        if (sf.ck && solCacheTry(sf.ck, f)) { live.solvedFor = sf; live.solveAsked = false; } else {
        // (The labels already standing are carried to this frame's camera first: a solve that does not land inside its slice leaves them as
        // they are, so each frame of a zoom or glide that asked for a fresh solve left them one more frame behind the figure, and
        // dropped the sliced solve the next frame. Mohammad, 2 Nov: "the labels and callouts move slower than the figure camera".)
        if (live.solvedFor && live.solvedFor.view === live.morphTarget && !(live.morph > 0 && live.morph < 1)) layoutLabels(f, false);   // (not another view's solution: its anchors are that view's world points, which would stand the labels and their dots where the figure has none)
        const g = layoutLabelsGen(f, true);   // (the other view's solve ahead of time goes on: it has scratch of its own, stage-label-solve.js)
        if (!labelSliceRun(g, live.xfSolving ? 2 : live.gestureOn() || live.drifting || (live.morph > 0 && live.morph < 1) ? LABEL_SLICE_MS : LABEL_FIRST_REST_MS)) {   // (at rest the first slice is long: most solves land in it)
          live.labelJob = JOB; JOB.g = g; JOB.key = keyInto(jobKeyArr, key); JOB.solvedFor = sf; JOB.xfTap = null; JOB.t0 = performance.now(); stats.jobs++;
          mayTask('label solve', labelJobStep, !live.gestureOn() ? JOB_NOW : undefined);   // (at rest the slices run every frame, none waits two)
          stats.ms += performance.now() - t0;
          labelTail();
          return;
        }
        live.solvedFor = sf; live.solveAsked = false; solCachePut(sf);
        }
      }
      else if (hand || live.reslotted) labelSettleSoon();
      if (gpuProbe.on) gpuProbe.note(solved ? COUNTED.labelSolve : COUNTED.labelCarry);
      live.carryClear = false;
      live.labelKey = keyInto(labelKeyArr, key); stats.layouts++; stats.ms += performance.now() - t0;
    }
    labelTail();
  }
  // The hold (see updateLabels): watched every frame until the camera is still (hand up, wheel quiet, glide and push landed), then the labels are
  // laid out once for where it stopped. (live.handRide is only the flag that a hold is on.)
  function handRideWatch() {
    cancelFrame(live.handRideT);
    live.handRideT = nextFrame(handRideWait);
  }
  function handRideWait() {
    if (!live.handRide) return;
    if (live.drag || live.glide || live.gestureOn() || live.vtGliding || live.drifting || live.zoomBase) { live.handRideT = nextFrame(handRideWait); return; }
    live.handRideT = 0; live.handRide = false;
    if (live.F && !live.camMove && !live.lz?.isOpen()) { live.labelKey = null; updateLabels(live.F); }
  }
  function handRideEnd() { if (!live.handRide) return; live.handRide = false; cancelFrame(live.handRideT); live.handRideT = 0; }
  // (What every layout of the labels ends with, a carried, a skipped or a sliced one too: the callouts and probes painted, then the GPU's copy.)
  function labelTail() {
    if (sites.list) sitesPaint();
    if (scan.on) scanPaint();
    dprobePaint();
    live.labelPainted = true;
    preAsk();
    if (live.xfHold && !live.labelJob) xfRelease();
    labelGlSync();   // (last: the probe's place, just written, is drawn in this frame too)
  }
  const sliceOver = () => performance.now() > live.sliceEnd;
  // (Runs the solve for up to ms; true once it has landed.)
  function labelSliceRun(g, ms) {
    live.sliceEnd = performance.now() + ms;
    let r;
    try { r = g.next(); } finally { live.sliceEnd = Infinity; }
    return r.done;
  }
  const sameView8 = (a, b) => { for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return false; return true; };
  function labelJobDrop() { if (!live.labelJob) return; stats.drops++; const g = live.labelJob.g; live.labelJob = null; cancelMay('label solve'); g.return(); }
  // (The running solve finished now, in one go: the labels are laid out for the camera as it stands.)
  function labelJobFinish() {
    const j = live.labelJob;
    if (!j) return;
    cancelMay('label solve');
    try { while (!labelSliceRun(j.g, 1e6)); } catch (e) { live.labelJob = null; live.labelKey = null; throw e; }
    live.labelJob = null;
    live.solvedFor = j.solvedFor; live.solveAsked = false; solCachePut(live.solvedFor);
    live.labelKey = keyInto(labelKeyArr, j.key); stats.layouts++;
    labelTail();
  }
  // (A slice in a frame's spare time: true while there is more to do.)
  function labelJobStep(left) {
    const j = live.labelJob;
    if (!j) return false;
    if (live.camMove || cathHid() || live.lz?.isOpen()) { labelJobDrop(); live.labelKey = null; return false; }
    let done;
    // (A frame with no time to spare gives its slice anyway, and a solve that has run long takes more each time (2 ms, up to 12 ms after a
    // second): on a slow phone, 1 ms slices a few frames apart left another view's layout standing for most of a minute, the Circuit
    // showing two readings and the anatomy's names after the switch.)
    stats.slices++;
    const age = performance.now() - (j.t0 || 0), ms = Math.max(live.gestureOn() || live.drifting ? 0 : LABEL_REST_SLICE_MS, Math.min(12, LABEL_SLICE_MS + Math.max(0, age - 250) / 75));   // (at rest a solve takes a longer slice each frame, so it lands in a few frames)
    try { done = labelSliceRun(j.g, Math.max(ms, Math.min(LABEL_SLICE_MS, left || LABEL_SLICE_MS))); } catch (e) { live.labelJob = null; live.labelKey = null; throw e; }
    // (Past 400 ms a slice runs every frame, not every third: on a busy frame budget the may task waited its two frames each time, and a
    // Circuit solve took half a minute to land, two readings standing meanwhile.)
    if (!done && (age > 400 || !live.gestureOn())) { mayTask('label solve', labelJobStep, JOB_NOW); return false; }
    if (!done) return true;
    live.labelJob = null;
    live.solvedFor = j.solvedFor; live.solveAsked = false; solCachePut(live.solvedFor);
    if (gpuProbe.on) gpuProbe.note(COUNTED.labelSolve);
    live.labelKey = keyInto(labelKeyArr, j.key); stats.layouts++;
    if (j.xfTap) xfMarkCurrent(j.xfTap);
    labelTail();
    return false;
  }
  // (R04: the labels' key as numbers and identities, written into one kept list. The callouts' boxes fold into one number.)
  const keyBuf = [];
  function labelKeyNow(st, sig, b) {
    const k = keyBuf;
    k[0] = Math.round(live.CTM.a * 100); k[1] = Math.round(live.CTM.b * 100); k[2] = Math.round(live.CTM.e * 100); k[3] = Math.round(live.CTM.f * 100);
    k[4] = b.width; k[5] = b.height; k[6] = live.morph; k[7] = live.rotU; k[8] = live.labelFonts; k[9] = themeKey(); k[10] = pzInset('--pz-l'); k[11] = pzInset('--pz-t');
    k[12] = st.mode; k[13] = !!st.compareSnap; k[14] = st.compareView; k[15] = paramJSON(live.blockerBoxes); k[16] = sig;
    let h = 0, n = 0;
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) { h = foldBox(h, el._box); n++; }
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) { h = foldBox(h, el._box); n++; }
    if (dpr.on && dpr.box) { h = foldBox(h, dpr.box); n++; for (const m of dpr.marks) { h = foldBox(h, m); n++; } }
    k[17] = h; k[18] = n;
    return k;
  }
  const foldBox = (h, b) => Math.imul(Math.imul(h ^ Math.round(b.x0 / 8), 16777619) ^ Math.round(b.y0 / 8), 16777619);
  const sameKey = (k) => Array.isArray(live.labelKey) && live.labelKey.length === k.length && sameDeps(live.labelKey, k);
  // (Cached labels while something moves (recs.md item 6, 2 Nov 2026): during a transition (inMotion: a slide's cards thrown, a
  // dive) a laid-out label is left exactly as it is, its places, widths and collisions kept from its last layout and its live values
  // not rebuilt or written into the page, so a moving frame does no label DOM work at all. The values catch up in the first frame
  // after the move ends.)
  let heldF = null, heldWait = null;
  const heldRun = () => { const g = heldF; heldF = null; if (!g || cathHid()) return; if (!refreshValues(g)) live.labelKey = null; labelGlSync(); };
  const heldDone = () => { heldWait = null; frameFor('labels')(heldRun); };
  function holdValues(f) {
    heldF = f;
    heldWait ||= afterMotion(heldDone);
    return true;
  }
  // The live values of the labels showing, rebuilt and written into their text in place. False when one
  // changed shape (a width, a run, a change badge): the caller then lays the labels out again.
  const refreshNext = [];   // (the labels' new items, kept: written afresh by each call, which does not call itself)
  function refreshValues(f) {
    const next = refreshNext;
    next.length = 0;
    for (const it of live.labelShown) {
      const [kind, id, mode, compact] = it.src;
      const n = kind === 'fx' ? fxBuild.get(id)?.() : kind === 'res' ? resItem(id) : kind === 'vel' ? velItem(id, f, mode) : kind === 'scan' ? scanItem() : nodeItem(id, f, mode, compact);
      if (!n) return false;   // (a slide's callout gone: lay out again)
      if (it.short || it.abbr) shortenTo(n, it.short || 0, it.abbr);
      if (n.lines.length !== it.lines.length || Math.abs(n.w - it.w) > 0.5 || Math.abs(n.h - it.h) > 0.5) return false;
      for (let i = 0; i < n.lines.length; i++) {
        const a = n.lines[i], o = it.lines[i];
        if (a.length !== o.length) return false;
        for (let j = 0; j < a.length; j++) if (a[j].cls !== o[j].cls || a[j].size !== o[j].size) return false;
      }
      next.push(n);
    }
    let changed = false;
    const shown = live.labelShown, count = shown.length;
    for (let i = 0; i < count; i++) {
      const it = shown[i], n = next[i];
      let same = n.label === it.label;
      for (let j = 0; same && j < n.lines.length; j++) {
        const l = n.lines[j], o = it.lines[j];
        for (let k = 0; k < l.length; k++) if (l[k].t !== o[k].t) { same = false; break; }
      }
      if (same) continue;
      it.lines = n.lines; it.label = n.label; changed = true;
      renderBlock(it);
    }
    next.length = 0;
    if (changed) stats.values++;
    return true;
  }
  return { JOB_NOW, KEY_NODES, SOLVED_A, SOLVED_B, SOLVE_TURN, cathHid, flagged, handRideEnd, keyInto, labelIns, labelJobDrop, labelJobStep, labelKeyArr, labelKeyNow, labelRestK, labelSettleSoon, labelSig, labelSliceRun, labelTail, labelVis, sigWidthMoved, sliceOver, stats, stentReady, updateLabels, zoneStick, zoomedIn };
}
