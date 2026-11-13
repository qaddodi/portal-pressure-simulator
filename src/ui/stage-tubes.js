// The tubes: update and updateInner, the widths and the tube render.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, NODES, PORTAL_TERRITORY, dMinOf, isOccluded } from '../engine/topology.js';
import { ART_FADE, BACK_EDGES, CONTEXT_EDGES, FEEDERS, IVC_EDGES, LABEL_VESSEL, LIVER_EDGES, SIN_EDGES, TIP_CONNECT } from './anatomy.js';
import { bandsStep } from './band-ease.js';
import { oxygenFor } from './blood.js';
import { deltaColor, dropColor, flowColor, heatColor, oxygenColor, pressureColor, velColorOf } from './colormap.js';
import { follow2 } from './display-state.js';
import { fluidTarget } from './fluid-step.js';
import { sideEndScale } from './fork-joins.js';
import { cancelFrame, inMotion, mayTask } from './frame.js';
import { overMemory as gpuOverMemory } from './gpu-budget.js';
import { COUNTED, gpuProbe } from './gpu-probe.js';
import { SYSTEM_COLOR, systemOf } from './highlight-math.js';
import { createJunctionWidths } from './junction-widths.js';
import { lesionEase } from './lesion-ease.js';
import { lumOf } from './luma.js';
import { D_SURFACE } from './ease.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { fluidSpringFor } from './organ-ease.js';
import { booting, holdCover, sinceInput } from './quiet.js';
import { store } from './store.js';
import { stumpCentre, stumpPinch } from './suture-marks.js';
import { clamp, lerp } from './util.js';
import { FRONT_CHAIN, chainS, frontP, frontS, frontScale, fronted } from './collateral-front.js';
import { BEAD_LAMBDA_FUNDAL, BEAD_SITE, beadLambda, beadRadius, varixBead, varixWale } from './varix-bead.js';
import { LOOK_SITE, varixHold, varixOpacity, varixSize, varixSpreadK, varixWidthK } from './varix-look.js';
import { TUBE_TEXELS } from './veins-gl.js';

import { stageScope } from './stage-scope.js';
// How much finer an arterioportal shunt is drawn than an artery branch of its caliber (a small communication, not a second branch;
// 0.8 still read as a branch, 6 Nov). Its lumen is fainter too (stage-vessels.js colPass).
const AP_FINE = 0.6;
export function createTubes(st, live) {
  const { E, EI, EV, FEEDER_CONNECTOR, GPU_EASE, LIGATED, NI, N_SAMPLES, REVERSAL_WATCH, SEL_FADE, SIDE_HOSTS, SIDE_INSIDE, STRAIGHT_COLL, anatCovered, animateVT, anyReveal, applyVT, blockersRead, camShowTo_, circAt, collOpen, defaultVT, divideLen, dopApply, drawVeins, driftEnd, easeInOut, edgeVisible, flag, geo, glowOnlyOk, holdReversals, keptNow, layerMode, lobuleCode, lobuleReady, nearestLevel, nextFrame, pushCam, qHold, qP, readFrame, recruitFrac, refit, refreshCTM, revShown, sameView, sendRadii, setGlowSrc, setLevel, shownFrac, snapFresh, stageBox, startExit, stenosisAt, stepReveals, syncLift, syncVeins, trackChanges, updateGeometry, updateLabels, updateNodesCircuit, varixHeld, vesselPx, vh, waist, watch, wrap } = st;
  let glAtUpdate = false;   // (whether the GPU drew the figure at the last full update: the steps between take only that state)
  // A patient has arrived and none is on its way (opening one from Home, the first frames are still the last one's).
  const patientArrived = () => ((store.get().historyTick || 0) > 0 || !!store.get().booted) && !store.get().presetLoading;
  let patientReady = patientArrived();
  store.on('historyTick', () => { patientReady = patientArrived(); });
  store.on('presetLoading', () => { patientReady = patientArrived(); });
  store.on('booted', () => { patientReady = patientArrived(); firstFrame(); });
  wrap.classList.add('unframed');
  live.camShow = 0;
live.camShowTo = 0;
pushCam();   // (unframed: the canvas is clear until the figure is framed, then eased in as an alpha; app.css leaves the canvas out of the opacity rules)
  const showFigure = () => {
    if (live.figureShown) return;
    wrap.classList.remove('unframed');
    camShowTo_(1);
    live.figureShown = true;
    nextFrame(figureReady1);
  };
  const figureReady3 = () => { window.ppsFigureReady = true; performance.mark?.('pps:figure-ready'); dispatchEvent(new Event('pps:figure-ready')); };
  const figureReady2 = () => stageScope.timer(figureReady3, 260);
  const figureReady1 = () => nextFrame(figureReady2);
  stageScope.timer(showFigure, 4000);   // never left hidden
  function firstFrame() {
    if (live.firstFit || !live.F || !(live.morphTarget === 1 || patientReady)) return;
    live.firstFit = true;
    readFrame(firstFitRead);   // (the fit's boxes read first in the next frame, before any write; set in that frame's own phase)
  }
  function firstFitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    const d = live.morphTarget === 0 && !live.userMoved && !store.get().presenting ? defaultVT(false) : null;
    nextFrame(() => {
      // (Set outright, so a glide still under way (a refit as the bars came in) stops here: left running it never landed,
      // stayed 'gliding' for good, and the zoom-out spring and the pans' bounds waited on it, so a pinch out stayed stuck.)
      // (While presenting, the slide's framing is the presenter's: set outright here it jumped the figure off the slide's framing,
      // after the start's cover had lifted when the patient came late. Shown already (the 4 s backstop), the figure glides to its fit.)
      if (d && live.morphTarget === 0 && !live.userMoved && !store.get().presenting) {
        if (live.figureShown) { live.homeAt = d; live.fitted = true; if (!sameView(d, live.vtGliding ? live.vtTarget : live.vt)) animateVT(d, 450); }
        else { cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false; live.vt = { ...d }; live.homeAt = d; live.vtTarget = { ...d }; live.fitted = true; applyVT(); live.CTM = null; }   // (three views, not one object: see zoomAt)
      }
      showFigure();
    });
  }
  // The lobule is made ready while the anatomy sits idle (its tiles, tissue, WebGL and a first frame), so the dive
  // into it only places what is already drawn instead of building it mid-zoom. Checked about once a second; the
  // pieces run one per idle moment and stop as soon as a dive or the circuit begins.
  let prepBusy = false, prepAt = 0;
  // A piece of the lobule's preparation takes tens of ms on a phone: it waits until the page has been left alone a moment
  // (no touch, wheel or key for 0.7 s), so it never lands in the middle of a pan, a pinch or a tap's response.
  // (One clock of input for the whole app: quiet.js. A finger or button still down, held still or not, keeps the pictures made after a
  // pan or pinch waiting until it lifts (Mohammad, 21 Oct: "hitch as soon as I stop panning", finger still down).)
  // (The function waiting is handed on as the timer's own argument, so no closure is made to carry it.)
  const IDLE_ASK = { timeout: 600 }, lobuleNoop = () => {};
  function prepIdleGo(fn) { if (sinceInput() < 700 || inMotion()) stageScope.timer(prepIdleGo, 400, fn); else if (window.requestIdleCallback) requestIdleCallback(fn, IDLE_ASK); else stageScope.timer(fn, 50); }
  const prepIdle = (fn) => { stageScope.timer(prepIdleGo, 0, fn); };
  const prepLoad = () => lobuleReady().then(prepLobule, prepLoadLost);
  const prepLoadLost = (err) => console.warn('The lobule view did not load.', err);
  const prepCalm = () => live.morphTarget === 0 && live.morph < 0.02 && !live.lobuleOn && !live.diveWait && live.diveT === 0 && !live.vtGliding;
  let prepQ = null;
  function prepRun() {
    const q = prepQ;
    if (!live.lobuleOn && !live.diveWait && live.diveT === 0 && live.morphTarget === 0 && (!prepCalm() || live.figureHidden())) { prepIdle(prepRun); return; }   // busy for now: later
    if (live.lobuleOn || live.diveWait || live.diveT > 0 || live.morphTarget !== 0 || !live.lz.prepareRun(q)) { prepBusy = false; return; }   // (diveWait: a dive's own painting is under way)
    prepIdle(prepRun);
  }
  function prepLobule() {
    if (!live.lz) {   // (the lobule's code comes once the figure is on screen and the page is quiet; the first dive is prepared as soon as it is built)
      if (live.figureShown && !live.lzLoad && !live.lzSoon) { live.lzSoon = true; lobuleCode().catch(lobuleNoop); prepIdle(prepLoad); if (booting()) holdCover(lobuleReady().catch(lobuleNoop)); }
      return;
    }
    const now = performance.now();
    if (prepBusy || !live.figureShown || now - prepAt < 1000) return;
    prepAt = now;
    if (!prepCalm() || live.figureHidden() || gpuOverMemory()) return;   // (the lobule's preparation ahead keeps ~130 MB; over the memory envelope it is given back, and not made again until under)
    const q = live.lz.preparePieces();
    if (!q.length) return;
    prepBusy = true;
    prepQ = q;
    prepIdle(prepRun);
  }
  // A presenter's slide change holds the fit still while it runs: the words leaving or arriving change the space the camera
  // frames into, and a fit that followed them would glide the figure before the slide's own move (a dive, a rise) starts.
  let homeHeld = 0;
  function holdHome(on) { homeHeld = Math.max(0, homeHeld + (on ? 1 : -1)); }
  function update(f) {
    live.stageWake();
    live.inUpdate = true;
    try { gpuProbe.time(null, 'update (script)', updateInner, f); } finally { live.inUpdate = false; live.fxAt = null; }
    // (Hidden, no animation frame comes to draw the vessels again: they are drawn now, so the canvas never keeps colours the
    // page no longer has, as after a change of the device's light or dark setting in the background.)
    if (live.plateRedraw || (document.hidden && (live.veinsDirty || live.veinsRows.size))) { const by = live.plateRedraw ? 'plate hidden' : 'tab hidden'; live.plateRedraw = false; drawVeins(false, by); }
    // The first framing waits for the patient (the first frames are drawn before it has loaded, without its
    // ascites or spleen), and the figure stays hidden until it is framed, so it appears once, in place.
    firstFrame();
    if (live.catchUp || document.hidden) homeMay(); else mayTask('stage-home', homeMay);
  }
  // (Back from the lobule: the anatomy's full fit, read first in a frame (its boxes and the cards'), and glided to in the frame's own phase.)
  function riseFitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    live.riseFitAsk = 0;
    if (live.morphTarget !== 0 || live.lobuleOn) return;
    const d = defaultVT(false);
    nextFrame(() => { live.homeAt = d; live.fitted = true; if (!sameView(live.vt, d)) animateVT(d, 450); });
  }
  function followHome(now = performance.now()) {
    if (homeResizeT) return;   // (a resize still settling: its own look comes once it has)
    const home = !!live.homeAt && !homeHeld && live.morphTarget === 0 && !live.lobuleOn && live.diveT === 0 && (sameView(live.vt, live.homeAt) || (live.vtGliding && sameView(live.vtTarget, live.homeAt))) && (!live.vtTarget || sameView(live.vtTarget, live.homeAt));
    if (home && !live.wasHome) watch.touch();
    live.wasHome = home;
    if (home && now - live.homeCheck > 500 && watch.due()) {
      // (Not while a slide's stacked card folds, its readings' card sliding or under the finger: measured part way, the home look glided
      // the figure to a room the card was only passing through, then the presenter's refit glided it on to where the card came to rest,
      // two moves for one tuck. The presenter frames that card's resting room as it starts to move; the look comes once it rests, when
      // its layout announces the new room, pps:occ.)
      if (store.get().presenting && document.querySelector('.pz-data[data-folding], .pz-data.pz-sliding')) return;
      live.homeCheck = now;
      // (1 Nov 2026: the look's boxes are read first in the next frame (readFrame), never between a frame's writes.)
      homeAsk ||= readFrame(homeLookRead);
    }
  }
  const OPT_STEADY = { steady: true };   // (a glide's options, read and never changed)
  const homeGo = (d) => { if (!sameView(d, live.homeAt)) { live.homeAt = d; live.fitted = true; animateVT(d, 400, OPT_STEADY); } };
  let homeAsk = 0;
  function homeLookRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    homeAsk = 0;
    if (keptNow()) return;   // (the Tests card alone has changed the space: see keepView)
    const d = defaultVT(false), at = live.homeAt;
    // (Moved there in the frame's own phase, after every read: and only if the view is still at the home it was looked from.)
    nextFrame(() => { if (live.homeAt === at && !homeHeld && (sameView(live.vt, live.homeAt) || (live.vtGliding && sameView(live.vtTarget, live.homeAt)))) homeGo(d); });
  }
  // (The first look when the size has held for 200 ms: a turn fires several resizes, and a glide after each moved the camera
  // two or three times. Then a look 0.5 s and 1.3 s after, and whenever a card or sheet announces a new place (pps:occ),
  // each only if the view is still at home: a sheet or a card takes its new shape a moment after the turn, and the first
  // look measured the space it left before it had. A slide is the presenter's to frame, on a resize too.)
  let homeResizeT = 0, homeLateT = [], homeOccT = 0;
  const lookHome = () => {
    if (store.get().presenting) return;
    live.homeCheck = 0; watch.touch(); followHome();
    // (The circuit has no home look: a framing it was given is taken again for the new shape, as the anatomy's home is. A view the
    // learner moved stays: a pinch, a drag, the wheel or a zoom step clears fitted. Not while a resize is still settling, a tool
    // has the camera, or the Tests card alone changed the space.)
    if (homeResizeT || live.morphTarget !== 1 || !live.fitted || !live.circFit || live.lobuleOn || live.cath.saved || !sameView(live.vtGliding ? live.vtTarget : live.vt, circAt)) return;
    live.circAgain = true;
    try { refit(); } finally { live.circAgain = false; }
  };
  // (The late looks run only if the stage's box is not the one the last look used: a turn whose sheet and cards settled inside the
  // first 200 ms is framed once, not at 0.2 s, 0.7 s and 1.5 s, each a glide with the labels solved again.)
  let lookedBox = '';
  const boxKey = () => { const b = stageBox(); return b ? `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)},${Math.round(b.height)}` : ''; };
  const lookHomeIfMoved = () => { if (boxKey() !== lookedBox) lookHomeKept(); };
  const lookHomeKept = () => { lookedBox = boxKey(); lookHome(); };
  const homeResizeGo = () => { homeResizeT = 0; lookHomeKept(); homeLateT[0] = stageScope.timer(lookHomeIfMoved, 500); homeLateT[1] = stageScope.timer(lookHomeIfMoved, 1300); };
  addEventListener('resize', () => {
    stageScope.clear(homeResizeT); homeLateT.forEach((t) => stageScope.clear(t));
    homeResizeT = stageScope.timer(homeResizeGo, 200);
  });
  // (V-FIT: on the card's own clock, the next frame, not 150 ms after it; several announcements in one task make one look.)
  addEventListener('pps:occ', () => { if (!homeOccT) homeOccT = nextFrame(() => { homeOccT = 0; lookHome(); }); });
  // Hidden under the lobule or the sinusoid, the anatomy and the circuit are not drawn, but they go on following the patient:
  // the liver's shape, congestion and tint and the ascites ease on the same clock, with no drawing, so on the way out they show
  // the state reached by then (part way if the change is still easing), not an ease that only starts from the patient before.
  // (since: when it was covered; pAt: the last change of the patient's settings while covered, from which the quicker eases
  // and a vessel's drawing on or off are timed when it is shown again.)
  const hid = { at: 0, since: 0, p: null, pAt: 0 };
  function followHidden(f) {
    const now = performance.now(), dt = hid.at ? (now - hid.at) / 1000 : 0, p = f.viewParams || store.get().params;
    if (!hid.at) hid.since = now;
    else if (p !== hid.p) hid.pAt = now;
    hid.at = now; hid.p = p;
    live.easeLiver(f, p, dt);
    const asc = fluidTarget(live.ascTarget, f.slow.ascites);
    if (live.ascTarget === null) live.ascShown = asc;
    live.ascTarget = asc;
    if (live.ascShown !== live.ascTarget) ({ shown: live.ascShown, vel: live.ascVel } = fluidSpringFor(live.ascShown, live.ascVel, live.ascTarget, dt));
  }
  // The bands on the esophageal varices: the count drawn follows the model's whole count in a moment (band-ease.js), so the strand a
  // band closes fades out instead of vanishing in one frame. Each display frame's full update steps it (the width step stands aside
  // while it moves: stepWidths).
  let bandsShown = null;
  // A narrowing and a clot are drawn as they follow the params in a moment too (lesion-ease.js): the waist closes or opens and the clot
  // thickens, instead of either arriving whole in one frame. The same stand-aside for the width step while they move.
  const lesions = lesionEase();
  const lesionsMoving = () => !!live.F && lesions.differs(live.F.viewParams || store.get().params);
  const bandsMoving = () => bandsShown !== null && !!live.F && bandsShown !== (live.F.bands || 0);
  const stepBands = (f, dt) => { bandsShown = bandsStep(bandsShown, f.bands || 0, dt, reduceMotion.matches); return bandsShown !== (f.bands || 0); };
  // What follows from a vessel's drawn width (its hit stroke, the liver branches', braided strands' and drawn-in tributaries' widths and
  // fades, which the GPU draws): set by the model's update and by the width step between model frames (stepWidths) alike.
  function widthWrites(x, w, t, f, k) {
    const e = x.e;
    // The hit stroke is never thinner than the drawn tube (the IVC is wide, behind the liver) and never under ~10 px on screen.
    // (The thin hepatic artery has a narrow hit zone, and ranks below the portal vein it runs beside: the vein wins a shared tap.)
    { const narrow = CONTEXT_EDGES.has(e.id) || BACK_EDGES.has(e.id) || !!ART_FADE[e.id], hw = Math.round(Math.max(narrow ? 8 : 20, w + 6, 10 / ((live.CTM && live.CTM.sc) || 1))); if (x.hitW !== hw) { x.hitW = hw; live.pickVer++; } }
    if (x.isArt) return;
    if (x.cbr) for (const cb of x.cbr) cb.w = Math.max(1.2, w * cb.k);
    if (x.strands) for (let i = 0; i < x.strands.length; i++) {
      const sd = x.strands[i];
      sd.bead = BEAD_SITE[e.id] ? Math.round(varixBead(f.metrics?.[BEAD_SITE[e.id]]?.d) * (1 - t) * 100) / 100 : 0;   // (in hundredths: the radii are sent again only when it moves a step; the esophageal and the fundal varices bead, on their own periods)
      sd.beadL = beadLambda(e.id);
      // The red wale on the esophageal strands (V3): a share of --red-wale in their lumen, by the wall-stress ratio and the varix's size; the pressure lens only
      // (the other lenses' colours are data), and none in the circuit. colPass writes it into the strand's recolour texels.
      const vx = f.metrics?.varix;
      sd.wale = e.id === 'C1a' && layerMode() === 'pressure' ? Math.round(varixWale(!!vx?.redWale, vx?.ratioMean ?? vx?.ratio, varixSNow.VAR) * (1 - t) * 100) / 100 : 0;
      sd.live = e.code === 'C1' ? clamp(i + 1 - (bandsShown ?? (f.bands || 0)), 0, 1) : e.id === 'C8' ? clamp(1 + 4 * clamp((recruitFrac('C8', f) - 0.15) / 0.7, 0, 1) - i, 0, 1) : 1;   // cavernoma: one strand beside the main channel when acute, the rest grow in with the remodeling
    }
    // (The gastrorenal shunt is one vein, not a plexus, so it is beaded itself: renderTube reads this into its radii.)
    if (e.id === 'C5') x.bead = Math.round(varixBead(f.metrics?.gastricVarix?.d) * (1 - t) * 100) / 100;
    if (x.feeders) {
      const cfg = FEEDERS[e.id];
      let live = 1;
      if (cfg.when === 'caudate') {
        const ref = store.get().healthy?.Q?.[k], q = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
        live = ref ? clamp((q / Math.abs(ref) - 2) / 2, 0, 1) : 0;
      } else if (cfg.when === 'caput') {
        // Caput medusae: the epigastric network fills in as the paraumbilical route opens.
        live = clamp((recruitFrac('C3', f) - 0.15) / 0.3, 0, 1);
      }
      // A trunk that a collateral carries on (the azygos, with the ascending lumbar veins) is
      // connected: it is drawn to its end; otherwise it fades out.
      const conn = FEEDER_CONNECTOR[e.id], joined = !!conn && collOpen(conn, f);
      x.feedJoined = joined;
      for (const fd of x.feeders) {
        const lv = fd.when ? live : 1;   // only the conditional feeders come and go
        const fw = Math.max(1.2, w * cfg.k * fd.fk * (fd.when ? 0.5 + 0.5 * lv : 1));
        fd.live = lv; fd.w = fw;
      }
    }
  }
  // The width at each node the tubes ease their ends to (junction-widths.js), reused frame to frame by the width step.
  const jWidths = createJunctionWidths();
  function junctionWidths() {
    jWidths.reset();
    for (const x of EV) {
      if (!x.vis || x.isArt || x.ghost) continue;
      jWidths.put(x.e.from, x.width); jWidths.put(x.e.to, x.width);
    }
    return jWidths.answer();
  }
  // (The glow a selected vessel takes, one entry per vessel made here once: setGlowSrc reads them and copies what it changes.)
  const SEL_ENTRY = {}, selGlowList = [];
  for (const x of EV) { const id = x.e.id; SEL_ENTRY[id] = SIN_EDGES.has(id) ? { id, col: null, amt: 1.5, wide: 1.2, dur: D_SURFACE } : { id, col: null, amt: 1.5, wide: 0.6, dur: SEL_FADE * 1000 }; }
  const varixSNow = { VAR: 0, GV: 0 }, coilingBuf = [], NO_VESSELS = [], selIdsNow = [], selIdsKept = [];   // (kept, written in place)
  // A vessel's (or feeder's) two end colours, which the GPU's vessel rows take (syncVeins reads them at once and keeps none): the pair is made
  // the first time and written in place after.
  function setColPair(o, a, b) {
    const c = o.col;
    if (!c) o.col = [a, b];
    else if (c[0] !== a || c[1] !== b) { c[0] = a; c[1] = b; }
  }
  function renderTubes(p, t, J) { for (const x of EV) if (x.vis && !x.isArt) renderTube(x, p, t, J); }
  const overlaysStep = (f, p, t) => live.updateOverlays(f, p, lerp(1, 0.8, t), t);   // (gain = lerp(1, 0.8, t), as updateInner has it)
  // A vessel's width as the model gives it at the change's eased share t (0 the Anatomy, 1 the Circuit) under the layer `mode`, the lesions `p`, the
  // varices' size `varixS` and the Circuit's boost: the frame's own (updateInner), and the target view's for the labels solved at a tap (endWidth).
  // keepEnds: the frame's own, which keeps the two ends of the change on the vessel (the stretches' joins, widthRatio).
  function widthAt(x, f, t, mode, p, varixS, circBoost, keepEnds = false) {
    const e = x.e, k = EI[e.id], D = f.D[k];
    // Anatomy: width follows diameter (compressed). Circuit: a narrower, more uniform range,
    // as on a transit map, so the lines stay even and legible.
    const wA = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' || e.zone === 'post' ? 3.6 : 5.2) : vesselPx(IVC_EDGES.has(e.id) ? f.D[EI.IVC_IS] : D) * (IVC_EDGES.has(e.id) || e.id === 'SVC_RA' || e.id === 'V_UP' ? 0.72 : 1);   // the IVC is one tube: one caliber end to end (and the veins above the SVC take its scale, so the SVC widens below the azygos, never narrows: at full scale they bulged it at the join)
    const wC = (e.kind === 'liver' ? 8 : clamp(vesselPx(D) * 0.95, 6, 15)) * circBoost;
    let w = lerp(wA, wC, t);
    // (Both ends of the change kept, for the stretches' joins: a vessel's width between the views, widthRatio. Under the flow layer the width ignores the view.)
    // (An arterioportal shunt is a small branch: finer than the artery branch it leaves, AP_FINE.)
    const artK = e.shunt === 'ap' ? AP_FINE : 1;
    if (keepEnds) { x.wAn = x.isArt ? Math.max(1.8, vesselPx(D) * 0.5 * artK) : mode === 'flow' ? 1 : wA; x.wCi = x.isArt ? 3 * artK : mode === 'flow' ? 1 : wC; }
    // Flow layer: width follows flow volume (∝ √Q), like traffic volume on a city map.
    if (mode === 'flow' && !x.isArt) w = clamp(2.2 + 8.5 * Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06), 2.2, 22);
    if (x.isArt) w = lerp(Math.max(1.8, vesselPx(D) * 0.5 * artK), 3 * artK, t);
    // Band ligation strangles the esophageal varices: each band thromboses a channel and the
    // rest shrink (the model raises the route's resistance by the same count).
    if (e.code === 'C1' && f.bands > 0 && t < 1) w *= 1 - 0.14 * Math.min(4, f.bands);
    // The periportal collaterals (cavernoma) are fine channels, thinner than the caliber their flow alone would draw.
    if (e.id === 'C8') w *= lerp(0.6, 1, t);
    // The coronary vein is drawn a little finer than its flow alone would make it in the anatomy (0.85, 6 Nov); the flow lens and the circuit keep theirs.
    if (e.id === 'LGV_CONF' && mode !== 'flow') w *= lerp(0.85, 1, t);
    // The spontaneous splenorenal shunt never reads fatter than the splenic vein it leaves.
    if (e.id === 'C6' && mode !== 'flow' && EI.V_SPL != null) w = Math.min(w, lerp(vesselPx(f.D[EI.V_SPL]), clamp(vesselPx(f.D[EI.V_SPL]) * 0.95, 6, 15) * circBoost, t));
    // The varices' channels are drawn as big as the varix is now, not as the weeks of remodeling left them (varix-look.js), never under
    // their resting caliber: in the anatomy only, as the bands' shrink above; the flow lens keeps its flow widths and a closed shunt its ghost.
    if (LOOK_SITE[e.id] && mode !== 'flow' && !isOccluded(p, e.id)) w = Math.max(Math.min(w, vesselPx(dMinOf(e))), w * lerp(varixWidthK(varixS[LOOK_SITE[e.id]]), 1, t));
    // The caudate vein hypertrophies when it becomes the liver's outflow (Budd–Chiari).
    if (e.id === 'CAUD' && t < 1) { const ref = store.get().healthy?.Q?.[k]; if (ref) w *= 0.8 * clamp(Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) / Math.abs(ref)), 1, 1.8); }
    return w;
  }
  // (What the last model frame's widths were worked out from, kept for endWidth.)
  let wLastF = null, wLastP = null, wLastMode = 'pressure';
  /** The width vessel x is drawn at once the change between the views has landed on `view` (0 the Anatomy, 1 the Circuit), from the last model
   *  frame, under the camera standing now (the Circuit's boost reads it: the target's, inside the labels' solve at a tap). A vessel leaving keeps its own. */
  function endWidth(x, view) {
    if (!wLastF || x.reveal?.out || x.width == null) return x.width;
    return widthAt(x, wLastF, view, wLastMode, wLastP, varixSNow, clamp(10 / (15 * (live.CTM?.sc || 1)), 1, 1.75));
  }
  function updateInner(f) {
    // Covered by the lobule or the dive's field (anatCovered), the plate is left as it is (reading the cards' boxes and
    // restyling it each model frame, unseen, stalled the zoom); it catches up on the way out, with its eases already where they
    // have got to (followHidden). While the anatomy still shows through a dive or a rise it is updated as usual, so what eases on
    // it keeps moving through the zoom.
    const under = anatCovered() && !live.catchUp && !live.risePrep;
    // The cards' boxes, read at most every 100 ms (each read forces a layout in the middle of the model's frames);
    // a card that opens, closes or moves announces itself (pps:occ, resize) and is read at once.
    // (And only while one of them may have moved: layoutWatch.)
    // (1 Nov 2026: read first in the next frame (readFrame), never between a frame's writes; the labels are laid out again with them then.)
    if (!under && (live.blockersStale || (performance.now() - live.blockersAt > 100 && watch.due()))) live.blockersAsk ||= readFrame(blockersRead);
    live.F = f;
    holdReversals(f);
    live.lz?.update(f);
    if (under) { followHidden(f); return; }
    // Widths and coils ease toward their targets in time (~0.25 s), not per model update. Shown again after being covered,
    // they have eased for as long as they were covered since the patient's settings last changed.
    const nowW = performance.now();
    let dtW = Math.min(0.1, (nowW - (live.wAt || nowW)) / 1000);
    if (hid.at) { followHidden(f); dtW = (nowW - Math.max(live.wAt, hid.pAt)) / 1000; live.fxAt = Math.max(hid.since, hid.pAt); live.plateStale = true; hid.at = 0; hid.p = null; hid.pAt = 0; }
    const kW = -Math.expm1(-dtW / 0.25);
    live.wAt = nowW; live.widthEasing = false; live.coilEasing = false; live.organsEasing = false;
    if (stepBands(f, dtW)) live.widthEasing = true;
    glAtUpdate = wrap.classList.contains('gl-on');
    const st = store.get();
    const pRaw = f.viewParams || st.params, p = lesions.view(pRaw, dtW, reduceMotion.matches);
    if (lesions.differs(pRaw)) live.widthEasing = true;
    const t = easeInOut(live.morph);
    const ref = live.REF();
    // The circuit shown small (a phone, the whole map): every lane grows by the same factor, so the
    // widest stays about 10 px on screen; capped so neighbouring lanes stay apart.
    if (!live.CTM) refreshCTM();
    const circBoost = clamp(10 / (15 * (live.CTM?.sc || 1)), 1, 1.75);
    const imaging = live.isImaging();
    const mode = layerMode();
    wLastF = f; wLastP = p; wLastMode = mode;
    // (Three flags of the figure that no style sheet reads, kept as values rather than classes: nothing is written to the page for them.)
    flag.imaging = imaging;
    // Data layers other than pressure quiet the anatomy so the network carries the reading.
    flag.dataLayer = mode !== 'pressure' && mode !== 'neutral';
    // Colored by oxygen: each vessel's saturation at its two ends (the sinusoids darken toward the central vein).
    const oxy = mode === 'oxygen' ? oxygenFor(EDGES, NODES, f).edge : null;

    // The varices' size now, held in steps (varix-look.js): their channels, strands and opacity are drawn as big as the varix is.
    varixHeld.VAR.now = varixHeld.GV.now = nowW;   // (the held size follows the beat's mean, varix-look.js)
    varixHeld.VAR.snap = varixHeld.GV.snap = f.running === false || !!f.jump;   // (a paused model sends one frame per change: the mean takes it at once)
    const varixS = varixSNow;   // (kept, written in place)
    varixS.VAR = varixSize('VAR', varixHold(varixHeld.VAR, f.metrics?.varix?.d)); varixS.GV = varixSize('GV', varixHold(varixHeld.GV, f.metrics?.gastricVarix?.d));
    // collateral tortuosity
    const coiling = coilingBuf;
    coiling.length = 0;
    for (const x of live.easeHeld ? NO_VESSELS : EV) {
      if (x.e.kind !== 'collateral' || x.e.spontaneous || STRAIGHT_COLL.has(x.e.id)) continue;
      // (Coiled once it has grown past a quarter, and straight again only below a fifth: a varix channel whose growth sat at the quarter
      // flipped its target between straight and coiled 25 times in one Varices slide change, each a new ease of its coil and a binning,
      // 3 Nov. ?coilhold=0: one threshold, as before.)
      const g = geo[x.e.id], sf = shownFrac(x.e.id, f), coiled = g.wigT > 0 ? sf > 0.2 : sf > 0.25;
      const w = coiled ? 1.5 + 3.5 * sf : 0;
      // Eased toward its target (a change of over 0.6 starts it), so the vessel coils gradually.
      if (g.wigT == null || Math.abs(w - g.wigT) > 0.6) g.wigT = w;
      if (g.wig !== g.wigT) { const d = g.wigT - g.wig; g.wig = Math.abs(d) < 0.03 ? g.wigT : g.wig + d * kW; coiling.push(x); if (g.wig !== g.wigT) live.widthEasing = live.coilEasing = true; }
      // The varices' strands fan out less as their varix shrinks, eased the same way (a closed shunt keeps its full spread).
      if (x.strands && LOOK_SITE[x.e.id]) {
        const sprT = isOccluded(p, x.e.id) ? 1 : varixSpreadK(varixS[LOOK_SITE[x.e.id]]), spr = g.spr ?? 1;
        g.sprT = sprT;   // (binTube: while the spread eases, the strands are binned against where they began, as a coil is)
        if (spr !== sprT) { const d = sprT - spr; g.spr = Math.abs(d) < 0.005 ? sprT : spr + d * kW; if (!coiling.includes(x)) coiling.push(x); if (g.spr !== sprT) live.widthEasing = live.coilEasing = true; }
      }
    }
    gpuProbe.time(null, 'update: geometry', updateGeometry, false, coiling);

    for (const x of EV) {
      const e = x.e;
      let vis = edgeVisible(x, f);
      const wasDrawn = !!x.drawn;   // on screen in the previous frame (not merely flagged visible)
      // A vessel that leaves (a collateral that closes, a shunt that is removed) retracts along its
      // flow, the way it drew on, and is hidden when it is done; it is held visible until then.
      if (x.reveal?.out) vis = true;
      else if (!vis && x.vis && wasDrawn && live.canFade(x) && !x.reveal && !x.ghost && !live.quietFx()) { startExit(x, f); vis = true; }
      if (vis !== x.vis) { x.vis = vis; live.edgeRev++; }
      if (!vis) { x.drawn = false; continue; }
      if (x.tipFade && TIP_CONNECT[e.id]) {
        // Drawn solid to its end while something attaches there; otherwise it fades.
        let joined = false;
        const tc = TIP_CONNECT[e.id];
        for (let i = 0; i < tc.length; i++) { const c = tc[i]; if (E[c]?.vis && collOpen(c, f)) { joined = true; break; } }
        if (joined !== x.tipFade.joined) x.tipFade.joined = joined;
      }
      x.drawn = true;   // it has been on screen, so leaving it is worth animating
      const k = EI[e.id];
      const D = f.D[k];
      const PM = f.Pf || f.P;
      const P1 = PM[NI[e.from]], P2 = PM[NI[e.to]];
      let w = widthAt(x, f, t, mode, p, varixS, circBoost, true);
      // A vessel leaving keeps its width. While the views morph, the width follows the morph frame by frame.
      // Otherwise the model's width is the target on every model frame (no dead-band: the breath never stops and
      // starts), and the drawn width follows it on every display frame (followWidth).
      if (x.reveal?.out && x.width != null) x.wT = x.w1 = x.width;
      else if (x.width == null || (t > 0 && t < 1)) x.wT = x.w1 = x.width = w;
      else {
        followWidth(x, dtW); x.wT = w;   // (up to now under the target it had, then the new one: the same curve at any frame rate)
        // A new target the screen cannot tell from the width shown (the breath's own sway, mostly a twentieth of a canvas pixel)
        // is taken at once, not eased toward for 0.2 s: otherwise every model frame started an ease and the whole figure was
        // drawn again on every display frame, blood moving or not (idle heat, 1 Nov). A change that shows eases as before.
        const q = edgeQ();
        if (Math.abs(w - x.width) < q && Math.abs(w - x.w1) < q) x.width = x.w1 = w;
      }
      if (widthMoving(x)) live.widthEasing = true;
      w = x.width;
      x.wMode = mode;
      // The liver's own small vessels (portal venules, central veins) are the liver to the pointer in the anatomy:
      // no hover, no tap on them; it falls through to the organ. The sinusoids are a vessel of their own.
      x.noHit = LIVER_EDGES.has(e.id) && !SIN_EDGES.has(e.id) && !ART_FADE[e.id] && t < 0.5;
      if (!x.isArt || x.tube) {   // (the hepatic artery has the veins' wall: a casing and a lit lumen, so it reads as drawn as they do)
        const baseD = IVC_EDGES.has(e.id) ? E.IVC_IS.e.d : e.d || (e.dMax ? dMinOf(e) : 3);   // one wall thickness along the whole cava
        // The circuit is a map: a slightly wider border (drawn by the GPU, as one shape with filleted
        // joins) gives its lines their weight.
        const wallT = (e.kind === 'liver' ? 0.7 : clamp(0.9 * Math.sqrt(baseD / Math.max(0.3, D)), 0.8, 1.6)) * (1 + 0.45 * t);
        if (x.wallPx == null || Math.abs(wallT - x.wallPx) >= 0.1) x.wallPx = Math.round(wallT * 20) / 20;
      }
      widthWrites(x, w, t, f, k);
      if (x.isArt) continue;
      let c1, c2;
      if (mode === 'pressure') { c1 = pressureColor(qHold(mode, k, 0, P1)); c2 = pressureColor(qHold(mode, k, 1, P2)); }
      else if (mode === 'drop') { c1 = c2 = dropColor(P1 - P2); }
      else if (mode === 'direction') { const rev = live.reversedShown(e); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
      else if (mode === 'flow') { c1 = c2 = flowColor(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06); }
      else if (mode === 'velocity') { c1 = c2 = e.kind === 'liver' ? 'var(--lens-neutral)' : velColorOf(f, k, store.get().healthy); }
      else if (mode === 'oxygen') { c1 = oxygenColor(oxy[2 * k]); c2 = oxygenColor(oxy[2 * k + 1]); }
      else if (mode === 'heat') { c1 = heatColor(ref ? qHold(mode, k, 0, P1 - ref[NI[e.from]]) : 0); c2 = heatColor(ref ? qHold(mode, k, 1, P2 - ref[NI[e.to]]) : 0); }
      else if (mode === 'system') { c1 = c2 = SYSTEM_COLOR[systemOf(e, PORTAL_TERRITORY)]; }   // (a slide's vein system, deck visuals V7: the same on every patient)
      else if (mode === 'neutral') { c1 = c2 = PORTAL_TERRITORY.has(e.from) || PORTAL_TERRITORY.has(e.to) ? 'var(--vein-portal)' : 'var(--vein-systemic)'; }
      else { c1 = deltaColor(ref ? qHold(mode, k, 0, P1 - ref[NI[e.from]]) : 0); c2 = deltaColor(ref ? qHold(mode, k, 1, P2 - ref[NI[e.to]]) : 0); }
      // (Its two ends' colours, which the GPU's vessel rows take: syncVeins.)
      setColPair(x, c1, c2);
      if (x.feeders) for (const fd of x.feeders) {
        // A feeder that leaves a named vein is colored from that vein's pressure to the vessel's; a network that leaves the vessel's end
        // takes that end's color.
        if (fd.src) { const c0 = mode === 'pressure' ? pressureColor(qP(PM[NI[fd.src]])) : c1; setColPair(fd, c0, c1); }
        else if (FEEDERS[e.id].tone === 'end') setColPair(fd, c2, c2);
      }
      // Flow marks are white on dark lumens and ink on pale ones.
      x.inkDark = lumOf(x, mode === 'pressure' ? pressureColor((P1 + P2) / 2) : c1) > 0.36;
      if (e.kind === 'collateral') {
        const fr = shownFrac(e.id, f);
        const qa = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
        const openNow = collOpen(e.id, f);
        if (!openNow && wasDrawn && !x.ghost && !x.reveal && !live.quietFx()) startExit(x, f);
        if (x.ghost !== (!openNow && !x.reveal?.out)) live.edgeRev++;
        x.ghost = !openNow && !x.reveal?.out;
        x.opa = isOccluded(p, e.id) ? 0.45 : Math.min(0.3 + 0.7 * Math.min(1, Math.max(fr * 2.5, qa / 1.5)), LOOK_SITE[e.id] ? varixOpacity(varixS[LOOK_SITE[e.id]]) : 1);   // (the varices' channels fade with their varix)
        setLevel(x, nearestLevel(x.opa));
      }
      x.rev = REVERSAL_WATCH.has(e.id) && live.reversedShown(e);
      if (x.rev && (!st.imaging || !!st.found?.has('flow'))) revShown.add(e.id); else revShown.delete(e.id);
      const selOn = (st.selection?.type === 'edge' && st.selection.id === e.id) || (st.selection?.type === 'node' && SIN_EDGES.has(e.id) && LABEL_VESSEL[st.selection.id] === e.id);   // a side's station dot is its sinusoids
      x.sel = selOn;
      x.dopW = w;
    }
    // The selected vessel glows as a hovered one does, a little stronger and wider, fading out at its free ends (no ring
    // with hard round ends); a selected side's sinusoids glow as one soft band over the whole network. Eased in and out by
    // the glow engine, as the brightening and the network's dimming are (vhStep, stepPlateEase).
    {
      const sl = st.selection, sv = sl?.type === 'node' && SIN_EDGES.has(LABEL_VESSEL[sl.id]) ? LABEL_VESSEL[sl.id] : sl?.type === 'edge' ? sl.id : null;
      // (The vessels the selection lights, listed in a kept list and compared with the last one's: a new set is made only when they differ.)
      const now = selIdsNow;
      now.length = 0;
      if (sv && E[sv]) {
        if (IVC_EDGES.has(sv)) { for (const id of IVC_EDGES) if (E[id]?.vis) now.push(id); } else if (E[sv]?.vis) now.push(sv);
      }
      let same = now.length === selIdsKept.length;
      for (let i = 0; same && i < now.length; i++) if (now[i] !== selIdsKept[i]) same = false;
      if (!same) {
        const ids = selIdsKept;
        ids.length = now.length;
        for (let i = 0; i < now.length; i++) ids[i] = now[i];
        vh.sel.clear(); selGlowList.length = 0;   // (the set and the list are kept and written in place; the entries are made once per vessel, above)
        for (let i = 0; i < ids.length; i++) { vh.sel.add(ids[i]); selGlowList.push(SEL_ENTRY[ids[i]]); }
        setGlowSrc('sel', selGlowList);
        if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(live.vhStep); }
      }
    }
    // Junction widths: where vessels meet, the largest narrows to the second largest and the
    // others widen toward it, so calibers change smoothly through every junction.
    const J = junctionWidths();
    // Detect newly opened collaterals before the tubes are built: a revealing vessel is drawn as a
    // dashed stroke from its first frame (never first as a full tube that then vanishes).
    trackChanges(f, p);
    stepReveals(performance.now());
    gpuProbe.time(null, 'update: tubes', renderTubes, p, t, J);
    // A selected vessel stays bright while the rest of the network recedes.
    flag.hasSel = st.selection?.type === 'edge' && !!E[st.selection.id]?.vis;
    syncLift();
    syncVeins(t);
    live.updateOrganSel(st.selection, t);
    gpuProbe.time(null, 'update: nodes', updateNodesCircuit, f);
    gpuProbe.time(null, 'update: overlays', overlaysStep, f, p, t);
    live.updateFocus();
    dopApply();
    // (Not through a dive or a rise: the anatomy's labels fade out as it starts, and the way out lays them out once, for its landing.)
    // (Plan "Holding 120 Hz" rev 2 step 1: the figure's own work (geometry, tubes, overlays, organs) is the model frame's must; the labels
    // are a may task of it, laid out from the newest frame once the frame's must work is in, within its share, at most four frames late,
    // so a model frame never puts the label solver in the frame that draws the figure. A newer frame before it runs takes its place.)
    labelF = f;
    mayTask('stage-labels', labelsMay);
    // (Step 1 too: the organs' eases and the slide's marks read the model's frame but draw nothing the blood or the vessels' upload
    // needs, so they are a may task of their own, from the newest frame; a catch-up (the way back from the lobule) or a hidden page
    // takes them at once, as it takes the whole update.)
    orgAskBuf.f = f; orgAskBuf.p = p; orgAskBuf.t = t; orgAskBuf.at = live.fxAt; orgAsk = orgAskBuf;
    if (live.catchUp || document.hidden) organsMay(); else mayTask('stage-organs', organsMay);
    live.widthF = f; live.widthVer = live.storeVer; live.widthCTM = live.CTM;
  }
  // A vessel's drawn width follows the model's through two exponential eases in series (tau 0.2 s each: critically damped).
  // Each step is the exact solution for the time elapsed (the lag behind the target decays as (e2 + e1 t/tau) e^(-t/tau)),
  // and a new target is taken only after stepping up to its arrival, so the width and its speed change continuously and
  // trace the same curve at 60 or 120 Hz; a model frame's new target (10 a second) bends the speed instead of jumping it.
  const W_TAU = 0.2;
  let labelF = null;
  function labelsMay() {
    const f = labelF; labelF = null;
    if (f && !(live.diveT > 0 && live.diveT < 1)) gpuProbe.time(null, 'update: labels', updateLabels, f);
  }
  let orgAsk = null;
  const orgAskBuf = { f: null, p: null, t: 0, at: null };   // (what the organs' step was asked for, written in place; organsMay copies it out at once)
  function organsMay() {
    const a = orgAsk; orgAsk = null;
    if (!a || (anatCovered() && !live.catchUp && !live.risePrep)) return;
    const af = a.f, ap = a.p, at = a.t, atAt = a.at;
    const was = live.inUpdate, wasAt = live.fxAt;
    live.inUpdate = true; live.fxAt = atAt;
    try {
      gpuProbe.time(null, 'update: organs', live.updateOrgans, af, ap, at);
      gpuProbe.time(null, 'update: slide marks', live.fxSync, af, at);
    } finally { live.inUpdate = was; live.fxAt = wasAt; }
    if (!was && live.plateRedraw) { live.plateRedraw = false; drawVeins(false, 'plate hidden'); }
  }
  // (The home look and the lobule's preparation: a may task of the model frame, as the labels are.)
  function homeMay() { prepLobule(); followHome(); }
  function followWidth(x, dt) {
    if (x.w1 == null) x.w1 = x.width;
    if (x.wT == null || x.width == null) return false;   // (no target yet: the caller sets the first one after this)
    if (x.width === x.wT && x.w1 === x.wT) return false;
    // (display-state.js follow2: the one filter the lumens' colours follow too, colFollow.)
    // (It lands once both stages are within a tenth of a canvas pixel of the target (edgeQ): nothing a screen can show, and the
    // vessel layer's radii are kept in those steps anyway. A tighter landing kept the figure easing, and drawn on every display
    // frame, for as long as the breath moved the targets: idle heat, 1 Nov.)
    const r = follow2(x.width, x.w1, x.wT, dt, W_TAU, Math.max(0.005, edgeQ()));
    x.width = r.v; x.w1 = r.w;
    return true;
  }
  function widthMoving(x) { return x.width !== x.wT || x.w1 !== x.wT; }
  // How far a lumen edge moves (canvas px) before the vessel layer draws it again: each width and radius the tubes are keyed on
  // is kept until what it follows has moved that far. A tenth of a canvas pixel (a twentieth of a CSS pixel) at any zoom: the
  // edge glides in sub-pixel steps, and the model's sub-pixel wobble redraws nothing.
  const EDGE_STEP = 0.1;
  function edgeQ() { const cpx = live.CTM ? live.vdpr * Math.hypot(live.CTM.a, live.CTM.b) : 0; return cpx > 0 ? EDGE_STEP / cpx : 0.01; }
  // (o[k] is kept until v has moved by q from it; a zoom that makes q less than half the step it was kept at takes it exact,
  // and so does q = 0, which the callers pass once the vessel's width is at rest: a settled figure is drawn exactly.)
  const KEEP_Q = { kw: 'kwQ', ka: 'kaQ', kb: 'kbQ', kh0: 'kh0Q', kh1: 'kh1Q', kr: 'krQ' };   // (each kept value's step key, so none is built by joining strings on every call)
  function keep(o, k, v, q) { const was = o[k], kq = KEEP_Q[k]; if (was == null || Math.abs(v - was) >= q || q < o[kq] / 2) { o[k] = v; o[kq] = q; } return o[k]; }
  // The width step's vessel-layer sync: the radii alone. It stands in for syncVeins only when nothing else the whole sync
  // writes can differ from what it last wrote (the glow-only sync's own test, glowOnlyOk, with no glow or plate ease under
  // way and no vessel crossing the sheen's 3.4 width); a vessel outgrowing its binned reach takes the whole sync (it re-bins).
  function syncRadiiOnly(t) {
    return gpuProbe.time(null, 'radius sync (script)', syncRadiiOnlyInner, t);
  }
  function syncRadiiOnlyInner(t) {
    if (live.glowSync || live.plateEasing() || live.gestureOn?.() || !glowOnlyOk(t)) return false;   // (a hand on the camera: the whole sync, which waits for it to let go: stage-vessels.js syncVeins)
    const m = live.glowMemo, items = m.items;
    for (let i = 0; i < items.length; i++) if ((items[i].x.width >= 3.4) !== m.wide[i]) return false;
    sendRadii(items);
    for (const it of items) if (Math.ceil((it.obj.glMaxR + (it.x.wallPx || 1) + 18) / 2) * 2 > (live.vBinReach.get(it.row) || 0)) return false;
    // (A ligated vein's divided stretch is as long as the vein is wide (divideLen): its drawn start, tube texel 5, follows the width.)
    let lig = false;
    for (const it of items) {
      if (it.kind !== 'v') continue;
      let ligated = false;
      for (let j = 0; j < LIGATED.length; j++) if (LIGATED[j][1] === it.x.e.id) { ligated = true; break; }
      if (!ligated) continue;
      const o = it.row * TUBE_TEXELS * 4 + 20, lo = Math.fround(Math.max(0, divideLen(it.x.e.id) / (it.len || geo[it.x.e.id].len || 1)));
      if (live.tubeData[o] !== lo) { live.tubeData[o] = lo; live.tubesShown[o] = lo; live.veinsRows.add(it.row); lig = true; }
    }
    if (lig) live.veins.setTubes(live.tubeData);
    return true;
  }
  // Between the model's frames, while only vessel widths are still easing (the breath moves the cava's and the hepatic veins'
  // targets by half a pixel or more on every breath, so they seldom rest), each display frame steps the widths and writes only
  // what follows from them: the strokes, the tubes, the vessel layer's radii, the narrowings'
  // marks, and the labels when a width has moved far enough to lay them out again (sigWidth). Everything else the update
  // computes comes from the model's frame and the settings, which have not changed since the last full update, so it would be
  // written again with the same values. Anything else under way (a new frame or setting, a pan, a coil, the liver or the fluid
  // easing, a vessel drawing on or off, a card moving, the lobule) takes the full update, as before: the same picture, frame
  // for frame, for less work.
  // A pan (the view moved at the same zoom and turn) takes this step too, as it does the organs' (stepOrgans): it moves no drawn size, and
  // the view's own frame lays the labels, the callouts and the probes out again (syncView). Everything else the update writes is in the
  // figure's own units. A zoom or a turn changes the sizes kept in screen pixels (the circuit's lanes, the hit widths, the edge step)
  // and takes the full update. (30 Oct, review G1: every frame of a pan while the breath eased had taken the whole update.)
  function stepWidths() {
    const f = live.F;
    if (!f || f !== live.widthF || live.storeVer !== live.widthVer || !live.widthCTM || live.coilEasing || live.organsEasing || live.catchUp || bandsMoving() || lesionsMoving()) return false;
    if (anatCovered() || hid.at || live.plateStale || live.plateRedraw || live.blockersStale || (performance.now() - live.blockersAt > 100 && watch.due())) return false;
    if (live.ascShown !== live.ascTarget || live.morph !== live.morphTarget || glAtUpdate !== wrap.classList.contains('gl-on') || anyReveal()) return false;
    if (!live.CTM) refreshCTM();   // (as the update itself does before it reads the view: a glide's step this frame let it go)
    if (live.CTM !== live.widthCTM && (live.CTM.sc !== live.widthCTM.sc || live.CTM.a !== live.widthCTM.a || live.CTM.b !== live.widthCTM.b)) return false;
    live.stageWake();
    live.inUpdate = true;
    try { gpuProbe.time(null, 'width step (script)', stepWidthsInner, f); } finally { live.inUpdate = false; live.fxAt = null; }
    firstFrame();
    prepLobule();
    followHome();
    return true;
  }
  // In the same way, while the organs ease (the liver's shape, its tint) and no vessel width, coil, reveal or view moves, each
  // display frame between the model's frames steps the organs alone (updateOrgans: the liver, the spleen, the fluid, their masks):
  // the rest of the update reads only the model's frame, the settings and the view, unchanged since the last full update, and
  // nothing in it follows the liver's ease (the organs' anchors are fixed, the spleen's size is the model's). External review,
  // 21 Oct: the whole update, the labels' layout read included, ran on every frame of an ease. The same picture, frame for frame.
  // (Any shown vessel's width still easing: a loop, no closure made a frame.)
  function visWidthMoving() { for (let i = 0; i < EV.length; i++) { const x = EV[i]; if (x.vis && widthMoving(x)) return true; } return false; }
  function stepOrgans() {
    const f = live.F;
    // (A pan moves no drawn size, and the view's own frame lays the labels out again (syncView): it takes this step too. A zoom or a
    // turn changes the sizes kept in screen pixels, and takes the full update.)
    if (!live.organsEasing || !f || f !== live.widthF || live.storeVer !== live.widthVer || !live.CTM || !live.widthCTM || live.CTM.sc !== live.widthCTM.sc || live.CTM.a !== live.widthCTM.a || live.CTM.b !== live.widthCTM.b || live.coilEasing || live.catchUp) return false;
    if (anatCovered() || hid.at || live.plateStale || live.blockersStale || (performance.now() - live.blockersAt > 100 && watch.due())) return false;
    if (live.morph !== live.morphTarget || glAtUpdate !== wrap.classList.contains('gl-on') || bandsMoving() || lesionsMoving() || anyReveal() || visWidthMoving()) return false;
    live.stageWake();
    live.inUpdate = true;
    try {
      gpuProbe.time(null, 'organ step (script)', organStepBody, f);
    } finally { live.inUpdate = false; live.fxAt = null; }
    if (live.plateRedraw) { live.plateRedraw = false; drawVeins(false, 'plate hidden'); }
    firstFrame();
    prepLobule();
    followHome();
    return true;
  }
  function organStepBody(f) {
    const t = easeInOut(live.morph);
    live.widthEasing = live.organsEasing = false;
    live.updateOrgans(f, f.viewParams || store.get().params, t);
    // (What the width step lays out every frame, it does here too: the site labels, a scan, a slide's moving camera, TIPS or DIPS.)
    if ((live.sites.list || live.scan.on || live.camMove || E.TIPS?.vis || E.DIPS?.vis) && !(live.diveT > 0 && live.diveT < 1)) updateLabels(f);
    if (live.fx) live.fxSync(f, t);
  }
  function stepWidthsInner(f) {
    const nowW = performance.now(), dt = Math.min(0.1, (nowW - (live.wAt || nowW)) / 1000);
    live.wAt = nowW; live.widthEasing = false;
    live.lvAt = nowW;   // (the liver's ease clock: a full update after width steps eases from this frame, not from the last full update)
    const t = easeInOut(live.morph);
    let moved = false, labels = !!live.sites.list || live.scan.on || !!live.camMove || !!E.TIPS?.vis || !!E.DIPS?.vis;
    for (const x of EV) {
      if (!x.vis || !followWidth(x, dt)) continue;
      if (widthMoving(x)) live.widthEasing = true;
      if (live.sigWidthMoved(x)) live.edgeRev++;   // (the labels' signature reads widths in 2 px steps: R04)
      moved = true;
      const w = x.width;
      widthWrites(x, w, t, f, EI[x.e.id]);
      if (x.isArt) continue;
      x.dopW = w;
      if (!labels) { const sw = live.sigW.get(x.e.id); labels = sw == null || Math.abs(w - sw) >= 2; }
    }
    if (!moved) return;
    const J = junctionWidths();
    const p = lesions.view(f.viewParams || store.get().params);
    for (const x of EV) if (x.vis && !x.isArt) renderTube(x, p, t, J);
    if (syncRadiiOnly(t)) gpuProbe.note(COUNTED.widthRadii);
    else { gpuProbe.note(COUNTED.widthWhole); syncVeins(t); }
    live.updateOverlays(f, p, lerp(1, 0.8, t), t);
    if (labels && !(live.diveT > 0 && live.diveT < 1)) updateLabels(f);
    if (live.fx) live.fxSync(f, t);
  }
  // Each vein is a tube whose radius eases from its own caliber (and narrows at a stenosis), drawn by the GPU from rOf with the
  // shading of a lit cylinder (veins-gl.js). The circuit, closed collaterals and vessels being drawn on are plain strokes.
  // Recomputed only when a width, a lesion or the geometry changes.
  const smooth = (u) => u * u * (3 - 2 * u);
  const BEAD_PHASE_V = 0.9;   // (the beaded shunt's phase along its course, C5: a vessel has no strand phase of its own)
  // (renderTube's three little helpers, as functions of their own that take what they read, in place of three closures made for each vessel
  // on each update.)
  const tubeEndW = (J, n, id, stroked, w, lo, lim) => (J[n] && !stroked && GPU_EASE[id] === n ? clamp(J[n], w * lo, w * lim) : w);
  let tubeHosts = 0;   // (how many of a side end's host veins are shown: set by tubeHostMax)
  function tubeHostMax(id, i) {
    const list = SIDE_HOSTS[id]?.[i];
    let m = -Infinity;
    tubeHosts = 0;
    if (list) for (let k = 0; k < list.length; k++) { const h = list[k]; if (E[h]?.vis) { m = Math.max(m, E[h].width); tubeHosts++; } }
    return m;
  }
  function tubeHostW(id, i, w) { const m = tubeHostMax(id, i); return tubeHosts ? clamp(m, w * 0.4, w) : null; }
  function tubeHostR(id, i, stroked) {
    if (stroked || !SIDE_INSIDE[id]?.[i]) return 0;
    const m = tubeHostMax(id, i);
    return tubeHosts ? m / 2 : 0;
  }
  // The tube's radius at u along it, from the numbers renderTube kept on the vessel (no closure made when they change).
  function tubeRadius(x, u) {
    const a = x.rA, w = x.rW, b = x.rB, h0 = x.rH0, h1 = x.rH1, f = x.stenF, L = x.rL, bd = x.rBd, pc = x.rPc;
    const r = u < 0.3 ? lerp(a, w, smooth(u / 0.3)) : u > 0.7 ? lerp(w, b, smooth((u - 0.7) / 0.3)) : w;
    const side = (h0 ? sideEndScale(u * L, h0) : 1) * (h1 ? sideEndScale((1 - u) * L, h1) : 1);
    return Math.max(0.35, (r / 2) * (f ? f(u) : 1) * side * (pc ? stumpPinch(u * L, pc) : 1) * (bd ? beadRadius(1, bd, u, L, BEAD_PHASE_V, 0, BEAD_LAMBDA_FUNDAL) : 1));
  }
  // The tube's N_SAMPLES radii in one loop (tubeRadius at each sample, the same arithmetic); with `ra` the cava drawn as one: the first
  // share f of the samples along x, the rest along ra. Nothing is handed back from a call, so no number is boxed per sample.
  function tubeFill(x, ra, f, R) {
    // (A collateral opening or closing: a front of width runs down it from its high-pressure end, collateral-front.js.)
    const fr = !ra && fronted(x) ? x.reveal : null, fp = fr ? frontP(fr, performance.now()) : 0;
    let order = -1, wFirst = 1;   // (a vessel that runs on into another that opens or closes with it: the front runs through both, FRONT_CHAIN)
    if (fr) {
      const ch = FRONT_CHAIN[x.e.id], o = ch && E[ch[0]];
      if (o && fronted(o) && o.reveal.out === fr.out && o.reveal.dir === fr.dir) {
        const la = geo[x.e.id]?.len || 1, lb = geo[ch[0]]?.len || 1;
        order = (ch[1] === 0) === (fr.dir > 0) ? 0 : 1;   // (this one's place in the topology, so its place in the flow)
        wFirst = order === 0 ? la / (la + lb) : lb / (la + lb);
      }
    }
    for (let i = 0; i < N_SAMPLES; i++) {
      const u = i / (N_SAMPLES - 1);
      let v = u, q = x;
      if (ra) { if (u < f) v = u / f; else { v = (u - f) / (1 - f); q = ra; } }
      const a = q.rA, w = q.rW, b = q.rB, h0 = q.rH0, h1 = q.rH1, fn = q.stenF, L = q.rL, bd = q.rBd, pc = q.rPc;
      const r = v < 0.3 ? lerp(a, w, smooth(v / 0.3)) : v > 0.7 ? lerp(w, b, smooth((v - 0.7) / 0.3)) : w;
      const side = (h0 ? sideEndScale(v * L, h0) : 1) * (h1 ? sideEndScale((1 - v) * L, h1) : 1);
      R[i] = Math.max(0.35, (r / 2) * (fn ? fn(v) : 1) * side * (pc ? stumpPinch(v * L, pc) : 1) * (bd ? beadRadius(1, bd, v, L, BEAD_PHASE_V, 0, BEAD_LAMBDA_FUNDAL) : 1) * (fr ? frontScale(fp, fr.out, order < 0 ? frontS(fr, u) : chainS(frontS(fr, u), order, wFirst)) : 1));
    }
  }
  function renderTube(x, p, t, J) {
    const g = geo[x.e.id], id = x.e.id, w = x.width, wallPx = x.wallPx;
    const v = live.isImaging() ? 0 : p.stenosis[id] || 0;
    const sten = v > 0.01;
    const stroked = x.ghost || (!!x.reveal && !fronted(x)) || (t >= 0.5 && !sten);   // (a collateral opening or closing is the whole shaded tube with a front of width, not a stroke drawing on)
    x.sten = sten; x.stroked = stroked;
    const lim = x.e.kind === 'collateral' ? 1.3 : 1.7;
    // A large shunt tapers into the smaller vein it drains into instead of butting onto it.
    const lo = x.e.spontaneous ? 0.4 : 0.5;
    // Each vessel keeps its own caliber to its ends: the fillet rounds a fork, and where one vessel runs on into the next both ends ease
    // to meet (see smoothRunOn), so no tube swells or pinches beside a join. Only the cava's end in the right atrium eases to the
    // junction width (GPU_EASE).
    // A shunt drawn onto the side of a vein (SIDE_HOSTS) narrows at that end to the vein's own caliber, so its round
    // end stays inside the vein instead of bulging out of the far wall.
    const a = (!stroked && tubeHostW(id, 0, w)) || tubeEndW(J, x.e.from, id, stroked, w, lo, lim), b = (!stroked && tubeHostW(id, 1, w)) || tubeEndW(J, x.e.to, id, stroked, w, lo, lim);
    // Its end inside the vein then narrows further (fork-joins.js sideEndScale), so the round end stays clear of the far wall: the
    // hosts' radii at each end, or 0.
    const qw = widthMoving(x) ? 2 * edgeQ() : 0;
    keep(x, 'kw', w, qw); keep(x, 'ka', a, qw); keep(x, 'kb', b, qw);
    keep(x, 'kh0', tubeHostR(id, 0, stroked), qw); keep(x, 'kh1', tubeHostR(id, 1, stroked), qw);
    // (What the radii are made from, kept as numbers and compared one by one: a joined string per vessel per call was garbage on every
    // frame a width eased. A change takes a new version, shadeVer, which the radii keys follow.)
    // (A divided vein's stump narrows a little at its tie, suture-marks.js stumpCentre: the arc length of the tie, or 0.)
    let pcQ = 0;
    for (let q = 0; q < LIGATED.length; q++) if (LIGATED[q][1] === id) { const dl = divideLen(id); if (dl > 0) pcQ = Math.round(stumpCentre(dl, g.len || 1) * 10) / 10; }
    const bdQ = x.bead && !stroked ? x.bead : 0;   // (the beaded shunt, C5: none once drawn as a stroke)
    const wallQ = Math.round(wallPx * 100), vQ = sten ? Math.round(v * 1000) : -1, atQ = sten ? stenosisAt(id, p) : 0;
    const same = x.skKw === x.kw && x.skKa === x.ka && x.skKb === x.kb && x.skH0 === x.kh0 && x.skH1 === x.kh1 && x.skWall === wallQ && x.skV === vQ && x.skAt === atQ && x.skMorph === live.lastMorph && x.skStroked === stroked && x.skBd === bdQ && x.skPc === pcQ;
    if (same && x.shadeOk) return;
    x.shadeOk = true;
    if (!same) {
      x.skKw = x.kw; x.skKa = x.ka; x.skKb = x.kb; x.skH0 = x.kh0; x.skH1 = x.kh1; x.skWall = wallQ; x.skV = vQ; x.skAt = atQ; x.skMorph = live.lastMorph; x.skStroked = stroked; x.skBd = bdQ; x.skPc = pcQ;
      x.shadeVer = (x.shadeVer | 0) + 1;
    }
    const f = sten ? waist(id, v, g.len, w, p) : null;
    x.stenF = f;   // (its caliber factor along it: the GPU's colour follows the resistance it adds, sendRadii alongOf)
    x.rA = a; x.rW = w; x.rB = b; x.rH0 = x.kh0; x.rH1 = x.kh1; x.rL = g.len || 1; x.rBd = bdQ; x.rPc = pcQ;
    // (Kept as the function the radii are read through; it reads the numbers above, which this call has just set.)
    if (!x.rOf) x.rOf = (u) => tubeRadius(x, u);   // alloc-once: the vessel's first draw
  }
  return { W_TAU, edgeQ, endWidth, holdHome, keep, riseFitRead, stepOrgans, stepWidths, tubeFill, update, widthMoving };
}
