// Anatomical stage (blueprint §6): the figure drawn on the GPU (plate, vessels, moving blood),
// over an SVG scene that holds the organ artwork, hit targets and overlays, and screen-space labels.

import { stageCovered } from './seen.js';
import { createCircTurn } from './circ-turn.js';
import { peelAt, peelRank } from './flow-peel.js';
import { EDGES, NODES, PORTAL_TERRITORY, isStent, stentSite, STENT_SITES } from '../engine/topology.js';
import { SPLEEN_PSE_AREA, SPLEEN_PSE_EDGE, RECTUM_FADE, LABEL_VESSEL, TIP_FADE, ART_FADE, VIEW, VB_CIRC, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN_NODES, CAUDATE, CONTEXT_EDGES, BACK_EDGES, IVC_EDGES, NODE_POS, ORGANS, SEAM_D, ORGAN_DETAIL, BACKDROP, LIVER_INNER, LIVER_EDGES, LANE_CAPTIONS, ABDOMEN_CLIP, CAVITY_LOW, SITES, LIVER_SPLIT_X, CIRCUIT_ZONES, STRANDS, SIN_EDGES } from './anatomy.js';
import { nodeEnds, nodeDrawn, dotRadius } from './circuit-nodes.js';
import { store, setViewKey } from './store.js';
import { s, clamp, lerp, toast, loadFailed, UPRIGHT_MQ } from './util.js';
import { recordLayer } from './over-records.js';
import { lerpVT } from './cam-arc.js';
import { VIEW_CHANGE_S, viewXfCamU } from './view-xf.js';
import { easeArrive, easeMove, createGlideTracker, CAM_MS_MAX, D_SURFACE } from './ease.js';
import { createSoftFade } from './soft-fade.js';
import { spleenMotion } from './spleen-motion.js';
import { segHitsBox, lineIndex, lineIndexBuf, indexHits } from './seg-hits.js';
import { COLON_ART, BOWEL_ART, DUO_CLIPS, DUO_B } from './organ-art.js';
import { gpuProbe } from './gpu-probe.js';
import { fading } from './res-fade.js';
import { cssColor8 } from './css-color.js';
import { readFail, mulTo, elMat } from './organ-paint.js';
import { setLive, dropLive } from './live-style.js';
import { overUnits, overRun, needsReread, netChanges, OVER_CLASS, OVER_ALL } from './stage-over.js';
import { elBoxInto } from './shape-gl.js';
import { HOVER_LINK } from './hover-link.js';
import { createExplain } from './label-explain.js';
import { createGlassGL, glassRegions, CARD } from './glass-gl.js';
import { createVeinsGL, TUBE_TEXELS, MAX_TIERS, ORIGIN_GREY } from './veins-gl.js';
import { frameFor, lateFrameFor, cancelFrame, noteDraw, easeNow, afterMotion, setSaver as setFrameSaver, onRenderScale, figOpt, figLab, onFigLab, readFrameFor, frameGapFor, restGapFor, inMotion, cameraMoving } from './frame.js';
import { softwareYield } from './sw-yield.js';
import { layoutWatch } from './idle-keys.js';
import { surface } from './gpu-surfaces.js';
import { guardBlur } from './blur-guard.js';
import { CellGrid, geomOf } from './cell-grid.js';
import { restPass, cancelRest } from './rest-pass.js';
import { createLateQueue } from './late-queue.js';
const STENT_FACTORS = [0, 0, 0];   // alloc-rare: made once (stentSegments writes into it; the caller reads one entry at once)
const EBOX = { x: 0, y: 0, width: 0, height: 0 }, SCAN_BOX = [0, 0, 0, 0];   // alloc-rare: made once (an element's box is read from EBOX at once; scanLvBox is SCAN_BOX)
import { caught } from './caught.js';
const nextFrame = frameFor('stage');
// (1 Nov 2026, "Move everything to GPU": zero layout inside the frame. Boxes the figure's pieces keep clear of (the slide's cards, the
// key pill, the readings' own sizes, the home look's room) are read first in a frame, before anything is written (frame.js readFrame),
// never between the frame's writes, and only when something they measure may have changed.)
const readFrame = readFrameFor('stage-read');
// (2 Nov 2026, the Anatomy to Circuit change on his iPhone: between the two views the frame does only what the screen shows. The SVG's
// hidden paths wait for the landing (updateGeometry), and the labels are carried with the vessels, solved again as the change reaches
// its second half and as it lands (labelSig, updateLabels).)
// The page's look as one string for the caches below that are drawn in its colours: data-theme, and data-palette too (Navy and Black keep
// data-theme="dark" and differ from Dark only by the palette: looks.js).
// (R04: two dependency lists the same, element by element, by identity: no string is built to compare them.)
// (recs.md 2.1: a solve of the figure's labels runs in slices of LABEL_SLICE_MS, yielding between labels, the rest in the next frames'
// spare time (frame.js mayTask), the labels standing as they were meanwhile; a solve that fits its first slice lands in the same frame, as
// before. A camera that moves under it drops it, and the labels carry as they always did.)
const LABEL_SLICE_MS = 2, LABEL_REST_SLICE_MS = 8, LABEL_FIRST_REST_MS = 24;   // motion-scale: not a move (budgets of the label solve)
function sameDeps(a, b) { for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false; return true; }
let themeKeyTheme, themeKeyPalette, themeKeyVal = '';   // (the last theme and palette read, and the key made of them: built again only when one changed)
const themeKey = () => {
  const d = document.documentElement.dataset, t = d.theme, p = d.palette;
  if (t !== themeKeyTheme || p !== themeKeyPalette) { themeKeyTheme = t; themeKeyPalette = p; themeKeyVal = p ? `${t || ''}/${p}` : (t || ''); }
  return themeKeyVal;
};
const lookFrame = frameFor('stage-look');   // (lookWhole's polling: one look at a frame while a new look reaches the organs)
const easeFrame = frameFor('stage-ease');   // (the scheduler's, named so that no local `frame` can stand in for it: the grid's path helper once did, and every ease asked through it never ran)
// The figure's render pass (animate) runs after every other callback of its frame: a glide's step, the catheter's state and its
// camera, the labels are all set first, and the vessel layer is drawn once, as they left it.
const drawFrame = lateFrameFor('stage');

const N_SAMPLES = 64;
// Shorter circuit zone titles, tried in turn when the full one is wider than its zone.
const ZONE_SHORT = { 'Splanchnic beds': ['Gut & spleen'], 'Liver · sinusoids': ['Liver'], 'Portal veins': ['Portal'], 'Hepatic veins · IVC': ['Hep. veins · IVC', 'Outflow'] };   // never a second "IVC" beside the IVC's own label
// Displayed width grows sub-linearly with diameter so the cavae don't swamp the portal tree,
// while distension of small veins and collaterals stays visible.
// Drawn caliber (px) for a vessel diameter. The 1.3 lifts the baseline so the veins read at a
// glance; the dilation of disease still scales on top of it.
const CALIBER = 1.3;
const vesselPx = (D) => CALIBER * Math.max(2.6, 2.0 * Math.pow(Math.max(0.1, D), 0.72));
// Only the vessels that tell the portal story are drawn (see anatomy.js).
const ALL_EDGES = EDGES.filter((e) => e.kind !== 'wedge' && !HIDDEN_EDGES.has(e.id));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const REVERSAL_WATCH = new Set(['PV_TRUNK', 'SV_CONF', 'SMV_CONF', 'LGV_CONF', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L', 'V_SPL', 'SV_MID', 'V_IMV', 'V_INT', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'V_STO', 'IVC_IS']);

import { reduceMotionMQ as reduceMotion, createReversible, REDUCED_MOVE_MS, TURN_MS, DIVE_MS as DIVE_FULL_MS } from './motion.js'; // The figure's overlays drawn on the GPU, in the vessel canvas (stage-over.js; 31 Oct, recs A1): on wherever the GPU draws the
// vessels. Not on a software renderer (the CPU would paint them) unless asked for (?stageover=gpu), as
// CI's visual check asks, to compare it with the page's own drawing.
const OVER_ASK = typeof location !== 'undefined' && /[?&]stageover=gpu\b/.test(location.search);
// Parcels and arrowheads carried through junctions (blood.js createStreamChain; combined plan B1 + C1).
// A streak's length follows its vessel's display speed (veins-gl.js bloodAt): a fast vessel's streaks run long and a slow one's are short
// dashes, so a still frame shows speed too.
// The blood on the GPU (plan "Holding 120 Hz" §3.7): each stream is anchored (its distance, drift, display speed and stasis at a blood
// clock) and the shader runs it on from there (veins-gl flowD), so a steady flow leaves the table as it was and nothing goes up a frame;
// a stream is anchored again only when its speed or stasis moves past a hair.
// Vessels that run on into one another narrow or widen as one continuous taper through the run (vessel-taper.js).
// The organs' GPU picture is kept up through a return from under the lobule when the changing organs are painted live (platePoke).
// A presenter's camera move: the labels ride it on the GPU instead of fading out for it (rideStart).
// The glasses are drawn inside the figure's canvas (frostHost) and are otherwise the browser's (round 2, 2.1).
// The FibroScan probe's waves stop at idle rest with the rest of the figure (scanTick).
import { createScan } from './stage-scan.js';
import { createDoppler } from './stage-doppler.js';
import { createBlood } from './stage-blood.js';
import { createBalloon } from './stage-balloon.js';
import { createCath } from './stage-cath.js';
import { createHover } from './stage-hover.js';
import { createRes } from './stage-res.js';
import { createGestures } from './stage-gestures.js';
import { createOrgans } from './stage-organs.js';
import { createPlate } from './stage-plate.js';
import { createDive } from './stage-dive.js';
import { createPaths } from './stage-paths.js';
import { createGeo } from './stage-geo.js';
import { createView } from './stage-view.js';
import { createLabelLayer } from './stage-label-layer.js';
import { createClamps } from './stage-clamps.js';
import { createLabelItems } from './stage-label-items.js';
import { createLabelDriver } from './stage-labels.js';
import { createPick } from './stage-pick.js';
import { createGlow } from './stage-glow.js';
import { createFrame } from './stage-frame.js';
import { createTransitions } from './stage-transitions.js';
import { createIdle } from './stage-idle.js';
import { createLabelSolve } from './stage-label-solve.js';
import { createLabelHost } from './stage-label-host.js';
import { createLabelText } from './stage-label-text.js';
import { createLabelSize } from './stage-label-size.js';
import { createSites } from './stage-sites.js';
import { createSitesPaint } from './stage-sites-paint.js';
import { createCamera } from './stage-camera.js';
import { createTubes } from './stage-tubes.js';
import { createVessels } from './stage-vessels.js';
import { createZoom } from './stage-zoom.js';
import { createGlass } from './stage-glass.js';
import { createMorph } from './stage-morph.js';
import { createFit } from './stage-fit.js';
import { createRide } from './stage-ride.js';
import { createGlide } from './stage-glide.js';

import { stageScope } from './stage-scope.js';
import { ringOnScreen as scopeRingOn, ringInto as scopeRingInto } from './scope-lens-rule.js';
import { createLzGlassSeq } from './lobule-glass-seq.js';
import { viewMovingOf } from './view-moving.js';
export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange }) {
  // <stage-split live>
  // The stage's shared lets (and consts made after a part), read at the moment of use by the part files: never copied, so a part cannot draw a frame late.
  const live = {
    caudPin: false,   // (a slide is about the caudate: its circuit lane shows, stage-outlines.js pinOrgans)
    scopeRing: { on: false, open: false, cone: null, cv: 0 }, scopeRingRefresh: null, viewHook: null, tapHook: null, plateTap: null,
    // (A vessel's display speed now, signed along its drawn course: the blood's own stream, which the model's flow drives and eases to a stop. The EUS scope's color Doppler reads it each frame, stage-cath.js: 10 Nov 2026.)
    flowVd(id) { const sm = streams[EI[id]]; return sm && sm.vd != null ? sm.vd : 0; },
    get abdomenEl() { return abdomenEl; },
    get adaptK() { return adaptK; }, set adaptK(v) { adaptK = v; },
    get aimed() { return aimed; }, set aimed(v) { aimed = v; },
    get aiming() { return aiming; }, set aiming(v) { aiming = v; },
    get arcRun() { return arcRun; }, set arcRun(v) { arcRun = v; },
    get ascEls() { return ascEls; },
    get ascShown() { return ascShown; }, set ascShown(v) { ascShown = v; },
    get ascStale() { return ascStale; }, set ascStale(v) { ascStale = v; },
    get ascTarget() { return ascTarget; }, set ascTarget(v) { ascTarget = v; },
    get ascVel() { return ascVel; }, set ascVel(v) { ascVel = v; },
    get ascWroteAmp() { return ascWroteAmp; }, set ascWroteAmp(v) { ascWroteAmp = v; },
    get ascWroteAt() { return ascWroteAt; }, set ascWroteAt(v) { ascWroteAt = v; },
    get ascWroteH() { return ascWroteH; }, set ascWroteH(v) { ascWroteH = v; },
    get askAnimate() { return askAnimate; },
    get autoK() { return autoK; }, set autoK(v) { autoK = v; },
    get autoT() { return autoT; }, set autoT(v) { autoT = v; },
    get balloonDraw() { return balloonDraw; },
    get balloonSqueeze() { return balloonSqueeze; }, set balloonSqueeze(v) { balloonSqueeze = v; },
    get balloonStep() { return balloonStep; },
    get baseLiver() { return baseLiver; }, set baseLiver(v) { baseLiver = v; },
    get bendShown() { return bendShown; }, set bendShown(v) { bendShown = v; },
    get binShown() { return binShown; }, set binShown(v) { binShown = v; },
    get BLOCK_IO() { return BLOCK_IO; },
    get blockerBoxes() { return blockerBoxes; }, set blockerBoxes(v) { blockerBoxes = v; },
    get blockersAsk() { return blockersAsk; }, set blockersAsk(v) { blockersAsk = v; },
    get blockersAt() { return blockersAt; }, set blockersAt(v) { blockersAt = v; },
    get blockersStale() { return blockersStale; }, set blockersStale(v) { blockersStale = v; },
    get bloodClock() { return bloodClock; }, set bloodClock(v) { bloodClock = v; },
    get bloodEasing() { return bloodEasing; }, set bloodEasing(v) { bloodEasing = v; },
    get bloodLook() { return bloodLook; },
    get bowelDy() { return bowelDy; },
    get box() { return box; }, set box(v) { box = v; },
    get boxH() { return boxH; }, set boxH(v) { boxH = v; },
    get boxKept() { return boxKept; }, set boxKept(v) { boxKept = v; },
    get boxW() { return boxW; }, set boxW(v) { boxW = v; },
    get calloutSig() { return calloutSig; },
    get camDive() { return camDive; }, set camDive(v) { camDive = v; },
    get camMove() { return camMove; }, set camMove(v) { camMove = v; },
    get camOx() { return camOx; }, set camOx(v) { camOx = v; },
    get camOy() { return camOy; }, set camOy(v) { camOy = v; },
    get camShow() { return camShow; }, set camShow(v) { camShow = v; },
    get camShowFrom() { return camShowFrom; }, set camShowFrom(v) { camShowFrom = v; },
    get camShowRaf() { return camShowRaf; }, set camShowRaf(v) { camShowRaf = v; },
    get camShowT0() { return camShowT0; }, set camShowT0(v) { camShowT0 = v; },
    get camShowTo() { return camShowTo; }, set camShowTo(v) { camShowTo = v; },
    get canFade() { return canFade; },
    get carryClear() { return carryClear; }, set carryClear(v) { carryClear = v; },
    get carryReslot() { return carryReslot; }, set carryReslot(v) { carryReslot = v; },
    get catchUp() { return catchUp; }, set catchUp(v) { catchUp = v; },
    get cath() { return cath; },
    get cathFade() { return cathFade; }, set cathFade(v) { cathFade = v; },
    get cathHidAt() { return cathHidAt; }, set cathHidAt(v) { cathHidAt = v; },
    get cathLabelsSoon() { return cathLabelsSoon; },
    get cathRadOf() { return cathRadOf; },
    get cathTint() { return cathTint; }, set cathTint(v) { cathTint = v; },
    get varixFade() { return varixFade; }, set varixFade(v) { varixFade = v; },
    get cathVer() { return cathVer; }, set cathVer(v) { cathVer = v; },
    get caudK() { return caudK; }, set caudK(v) { caudK = v; },
    get chevHoles() { return chevHoles; }, set chevHoles(v) { chevHoles = v; },
    get circAgain() { return circAgain; }, set circAgain(v) { circAgain = v; },
    get circFit() { return circFit; }, set circFit(v) { circFit = v; },
    get clampAway() { return clampAway; }, set clampAway(v) { clampAway = v; },
    get clampBase() { return clampBase; }, set clampBase(v) { clampBase = v; },
    get clampFor() { return clampFor; }, set clampFor(v) { clampFor = v; },
    get clampFs() { return clampFs; }, set clampFs(v) { clampFs = v; },
    get clampLast() { return clampLast; }, set clampLast(v) { clampLast = v; },
    get clampSw() { return clampSw; }, set clampSw(v) { clampSw = v; },
    get coilEasing() { return coilEasing; }, set coilEasing(v) { coilEasing = v; },
    get colAt() { return colAt; }, set colAt(v) { colAt = v; },
    get colEasing() { return colEasing; }, set colEasing(v) { colEasing = v; },
    get colResolve() { return colResolve; }, set colResolve(v) { colResolve = v; },
    get colShown() { return colShown; }, set colShown(v) { colShown = v; },
    get colWaitAt() { return colWaitAt; }, set colWaitAt(v) { colWaitAt = v; },
    get creditKept() { return creditKept; }, set creditKept(v) { creditKept = v; },
    get csSnap() { return csSnap; }, set csSnap(v) { csSnap = v; },
    get CTM() { return CTM; }, set CTM(v) { CTM = v; },
    get diaKey() { return diaKey; }, set diaKey(v) { diaKey = v; },
    get diveAt() { return diveAt; }, set diveAt(v) { diveAt = v; },
    get diveFadeO() { return diveFadeO; }, set diveFadeO(v) { diveFadeO = v; },
    get diveGen() { return diveGen; }, set diveGen(v) { diveGen = v; },
    get diveHid() { return diveHid; }, set diveHid(v) { diveHid = v; },
    get diveLand() { return diveLand; }, set diveLand(v) { diveLand = v; },
    get diveOrig() { return diveOrig; }, set diveOrig(v) { diveOrig = v; },
    get diveOut() { return diveOut; }, set diveOut(v) { diveOut = v; },
    get diveT() { return diveT; }, set diveT(v) { diveT = v; },
    get diveWait() { return diveWait; }, set diveWait(v) { diveWait = v; },
    get diveZ() { return diveZ; }, set diveZ(v) { diveZ = v; },
    get dprCardsAt() { return dprCardsAt; }, set dprCardsAt(v) { dprCardsAt = v; },
    get dprCardsList() { return dprCardsList; }, set dprCardsList(v) { dprCardsList = v; },
    get dprHold() { return dprHold; },
    get dprLet() { return dprLet; },
    get dprobePaint() { return dprobePaint; },
    get drag() { return drag; }, set drag(v) { drag = v; },
    get drawCam() { return drawCam; }, set drawCam(v) { drawCam = v; },
    get drawOnce() { return drawOnce; }, set drawOnce(v) { drawOnce = v; },
    get drifting() { return drifting; }, set drifting(v) { drifting = v; },
    get dyeShown() { return dyeShown; }, set dyeShown(v) { dyeShown = v; },
    get E() { return E; },
    get easeHeld() { return easeHeld; }, set easeHeld(v) { easeHeld = v; },
    get easeInOut() { return easeInOut; },
    get easeLiver() { return easeLiver; },
    get easeRes() { return easeRes; },
    get edgeRev() { return edgeRev; }, set edgeRev(v) { edgeRev = v; },
    get F() { return F; }, set F(v) { F = v; },
    get fastGap() { return fastGap; }, set fastGap(v) { fastGap = v; },
    get figKeys() { return figKeys; },
    get figureHidden() { return figureHidden; },
    get figureShown() { return figureShown; }, set figureShown(v) { figureShown = v; },
    get firstFit() { return firstFit; }, set firstFit(v) { firstFit = v; },
    get fitKept() { return fitKept; }, set fitKept(v) { fitKept = v; },
    get fitted() { return fitted; }, set fitted(v) { fitted = v; },
    get fluidAmp() { return fluidAmp; }, set fluidAmp(v) { fluidAmp = v; },
    get fluidBandH() { return fluidBandH; }, set fluidBandH(v) { fluidBandH = v; },
    get fluidEasing() { return fluidEasing; },
    get fluidFade() { return fluidFade; },
    get fluidFrom() { return fluidFrom; }, set fluidFrom(v) { fluidFrom = v; },
    get fluidH() { return fluidH; }, set fluidH(v) { fluidH = v; },
    get fluidInkRGBA() { return fluidInkRGBA; },
    get fluidLook() { return fluidLook; },
    get fluidMaskB() { return fluidMaskB; }, set fluidMaskB(v) { fluidMaskB = v; },
    get fluidMaskOf() { return fluidMaskOf; }, set fluidMaskOf(v) { fluidMaskOf = v; },
    get fluidMaskOfB() { return fluidMaskOfB; }, set fluidMaskOfB(v) { fluidMaskOfB = v; },
    get fluidSeen() { return fluidSeen; }, set fluidSeen(v) { fluidSeen = v; },
    get fluidStillAt() { return fluidStillAt; }, set fluidStillAt(v) { fluidStillAt = v; },
    get fluidSurf() { return fluidSurf; }, set fluidSurf(v) { fluidSurf = v; },
    get follow0() { return follow0; }, set follow0(v) { follow0 = v; },
    get follow1() { return follow1; }, set follow1(v) { follow1 = v; },
    get following() { return following; }, set following(v) { following = v; },
    get followScene() { return followScene; }, set followScene(v) { followScene = v; },
    get followU() { return followU; }, set followU(v) { followU = v; },
    get fontPx() { return fontPx; },
    get forceDraw() { return forceDraw; }, set forceDraw(v) { forceDraw = v; },
    get frameNo() { return frameNo; }, set frameNo(v) { frameNo = v; },
    get freeArea() { return freeArea; }, set freeArea(v) { freeArea = v; },
    get frostCtx() { return frostCtx; }, set frostCtx(v) { frostCtx = v; },
    get frostHold() { return frostHold; }, set frostHold(v) { frostHold = v; },
    get frostLiver() { return frostLiver; }, set frostLiver(v) { frostLiver = v; },
    get frostWake() { return frostWake; },
    get fullFailed() { return fullFailed; }, set fullFailed(v) { fullFailed = v; },
    get fullSwap() { return fullSwap; }, set fullSwap(v) { fullSwap = v; },
    get fx() { return fx; }, set fx(v) { fx = v; },
    get fxAt() { return fxAt; }, set fxAt(v) { fxAt = v; },
    get fxSig() { return fxSig; }, set fxSig(v) { fxSig = v; },
    get fxSync() { return fxSync; },
    get geometryVersion() { return geometryVersion; }, set geometryVersion(v) { geometryVersion = v; },
    get gestureOn() { return gestureOn; },
    get gGut() { return gGut; }, set gGut(v) { gGut = v; },
    get gLabels() { return gLabels; },
    get gLeaders() { return gLeaders; },
    get glassGL() { return glassGL; }, set glassGL(v) { glassGL = v; },
    get glide() { return glide; }, set glide(v) { glide = v; },
    get glideCam() { return glideCam; }, set glideCam(v) { glideCam = v; },
    get glideRaf() { return glideRaf; }, set glideRaf(v) { glideRaf = v; },
    get glM() { return glM; }, set glM(v) { glM = v; },
    get glOrgans() { return glOrgans; }, set glOrgans(v) { glOrgans = v; },
    get glowMemo() { return glowMemo; }, set glowMemo(v) { glowMemo = v; },
    get glowSetAt() { return glowSetAt; }, set glowSetAt(v) { glowSetAt = v; },
    get glowSync() { return glowSync; }, set glowSync(v) { glowSync = v; },
    get themeSnap() { return themeSnap; }, set themeSnap(v) { themeSnap = v; },
    get glRadDirty() { return glRadDirty; }, set glRadDirty(v) { glRadDirty = v; },
    get glStore() { return glStore; }, set glStore(v) { glStore = v; },
    get glStraight() { return glStraight; }, set glStraight(v) { glStraight = v; },
    get glSuppress() { return glSuppress; }, set glSuppress(v) { glSuppress = v; },
    get glWanted() { return glWanted; },
    get gScan() { return gScan; },
    get guideGlow() { return guideGlow; },
    get guideLab() { return guideLab; },
    get guideLine() { return guideLine; },
    get haloK() { return haloK; }, set haloK(v) { haloK = v; },
    get handed() { return handed; }, set handed(v) { handed = v; },
    get handRide() { return handRide; }, set handRide(v) { handRide = v; },
    get handRideT() { return handRideT; }, set handRideT(v) { handRideT = v; },
    get handsOff() { return handsOff; },
    get hiddenAt() { return hiddenAt; }, set hiddenAt(v) { hiddenAt = v; },
    get holesKey() { return holesKey; }, set holesKey(v) { holesKey = v; },
    get homeAt() { return homeAt; }, set homeAt(v) { homeAt = v; },
    get homeCheck() { return homeCheck; }, set homeCheck(v) { homeCheck = v; },
    get hoverId() { return hoverId; }, set hoverId(v) { hoverId = v; },
    get inUpdate() { return inUpdate; }, set inUpdate(v) { inUpdate = v; },
    get isImaging() { return isImaging; },
    get islOn() { return islOn; }, set islOn(v) { islOn = v; },
    get islSrc() { return islSrc; }, set islSrc(v) { islSrc = v; },
    get JOB_NOW() { return JOB_NOW; },
    get keptSpace() { return keptSpace; }, set keptSpace(v) { keptSpace = v; },
    get keyInto() { return keyInto; },
    get keyStops() { return keyStops; }, set keyStops(v) { keyStops = v; },
    get labelBase() { return labelBase; },
    get labelFonts() { return labelFonts; }, set labelFonts(v) { labelFonts = v; },
    get labelGL() { return labelGL; }, set labelGL(v) { labelGL = v; },
    get labelGlSync() { return labelGlSync; },
    get labelIns() { return labelIns; },
    get labelJob() { return labelJob; }, set labelJob(v) { labelJob = v; },
    get labelK() { return labelK; }, set labelK(v) { labelK = v; },
    get labelKey() { return labelKey; }, set labelKey(v) { labelKey = v; },
    get labelKeyArr() { return labelKeyArr; },
    get labelPainted() { return labelPainted; }, set labelPainted(v) { labelPainted = v; },
    get labelPassOff() { return labelPassOff; }, set labelPassOff(v) { labelPassOff = v; },
    get labelRider() { return labelRider; }, set labelRider(v) { labelRider = v; },
    get labelScale() { return labelScale; },
    get labelSettleT() { return labelSettleT; }, set labelSettleT(v) { labelSettleT = v; },
    get labelShown() { return labelShown; }, set labelShown(v) { labelShown = v; },
    get labelSol() { return labelSol; }, set labelSol(v) { labelSol = v; },
    get labelSolSpare() { return labelSolSpare; }, set labelSolSpare(v) { labelSolSpare = v; },
    get labelSvg() { return labelSvg; },
    get labelTurned() { return labelTurned; }, set labelTurned(v) { labelTurned = v; },
    get labHid() { return labHid; }, set labHid(v) { labHid = v; },
    get laidFrame() { return laidFrame; }, set laidFrame(v) { laidFrame = v; },
    get lapHid() { return lapHid; }, set lapHid(v) { lapHid = v; },
    get lastFree() { return lastFree; }, set lastFree(v) { lastFree = v; },
    get lastMorph() { return lastMorph; }, set lastMorph(v) { lastMorph = v; },
    get lastMoveAt() { return lastMoveAt; }, set lastMoveAt(v) { lastMoveAt = v; },
    get layCTM() { return layCTM; }, set layCTM(v) { layCTM = v; },
    get layerCommits() { return layerCommits; }, set layerCommits(v) { layerCommits = v; },
    get layerStarts() { return layerStarts; }, set layerStarts(v) { layerStarts = v; },
    get layerStartsEasing() { return layerStartsEasing; }, set layerStartsEasing(v) { layerStartsEasing = v; },
    get lbkNum() { return lbkNum; }, set lbkNum(v) { lbkNum = v; },
    get lbkStr() { return lbkStr; }, set lbkStr(v) { lbkStr = v; },
    get lbRects() { return lbRects; }, set lbRects(v) { lbRects = v; },
    get leadEls() { return leadEls; },
    get lenOfArc() { return lenOfArc; },
    get lensFrom() { return lensFrom; }, set lensFrom(v) { lensFrom = v; },
    get lensMode() { return lensMode; }, set lensMode(v) { lensMode = v; },
    get lensT0() { return lensT0; }, set lensT0(v) { lensT0 = v; },
    get LINE_H() { return LINE_H; },
    get lineW() { return lineW; },
    get linkEdge() { return linkEdge; }, set linkEdge(v) { linkEdge = v; },
    get linkFocus() { return linkFocus; },
    get linkHeld() { return linkHeld; },
    get linkHover() { return linkHover; },
    get linkKbd() { return linkKbd; }, set linkKbd(v) { linkKbd = v; },
    get linkLit() { return linkLit; }, set linkLit(v) { linkLit = v; },
    get linkOrgan() { return linkOrgan; }, set linkOrgan(v) { linkOrgan = v; },
    get linkPtr() { return linkPtr; }, set linkPtr(v) { linkPtr = v; },
    get linkSync() { return linkSync; },
    get liveFailed() { return liveFailed; }, set liveFailed(v) { liveFailed = v; },
    get liveFailWhy() { return liveFailWhy; }, set liveFailWhy(v) { liveFailWhy = v; },
    get liveKeyWas() { return liveKeyWas; }, set liveKeyWas(v) { liveKeyWas = v; },
    get liveOn() { return liveOn; },
    get liverDome() { return liverDome; }, set liverDome(v) { liverDome = v; },
    get liverFloor() { return liverFloor; }, set liverFloor(v) { liverFloor = v; },
    get liverFluidCut() { return liverFluidCut; }, set liverFluidCut(v) { liverFluidCut = v; },
    get liverKey() { return liverKey; }, set liverKey(v) { liverKey = v; },
    get liverScale() { return liverScale; }, set liverScale(v) { liverScale = v; },
    get liveSet() { return liveSet; }, set liveSet(v) { liveSet = v; },
    get lobAnim() { return lobAnim; }, set lobAnim(v) { lobAnim = v; },
    get lobEnd() { return lobEnd; }, set lobEnd(v) { lobEnd = v; },
    get diveClock() { return diveClock; },
    get lobIn() { return lobIn; }, set lobIn(v) { lobIn = v; },
    get lobMs() { return lobMs; }, set lobMs(v) { lobMs = v; },
    get lobOn() { return lobOn; }, set lobOn(v) { lobOn = v; },
    get lobSeen() { return lobSeen; }, set lobSeen(v) { lobSeen = v; },
    get lobTo() { return lobTo; }, set lobTo(v) { lobTo = v; },
    get lobU() { return lobU; }, set lobU(v) { lobU = v; },
    get lobuleOn() { return lobuleOn; }, set lobuleOn(v) { lobuleOn = v; },
    get logMove() { return logMove; },
    get lvAt() { return lvAt; }, set lvAt(v) { lvAt = v; },
    get lvC() { return lvC; }, set lvC(v) { lvC = v; },
    get lvCT() { return lvCT; }, set lvCT(v) { lvCT = v; },
    get lvG() { return lvG; }, set lvG(v) { lvG = v; },
    get lvGT() { return lvGT; }, set lvGT(v) { lvGT = v; },
    get lvGTo() { return lvGTo; }, set lvGTo(v) { lvGTo = v; },
    get lvMoving() { return lvMoving; }, set lvMoving(v) { lvMoving = v; },
    get lvStillAt() { return lvStillAt; }, set lvStillAt(v) { lvStillAt = v; },
    get lvT() { return lvT; }, set lvT(v) { lvT = v; },
    get lvTT() { return lvTT; }, set lvTT(v) { lvTT = v; },
    get lz() { return lz; }, set lz(v) { lz = v; },
    get lzLoad() { return lzLoad; }, set lzLoad(v) { lzLoad = v; },
    get lzSoon() { return lzSoon; }, set lzSoon(v) { lzSoon = v; },
    get mapWake() { return mapWake; }, set mapWake(v) { mapWake = v; },
    get markLast() { return markLast; }, set markLast(v) { markLast = v; },
    get marksSync() { return marksSync; },
    get mk() { return mk; },
    get morph() { return morph; }, set morph(v) { morph = v; },
    get morphTarget() { return morphTarget; }, set morphTarget(v) { morphTarget = v; },
    get moveLow() { return moveLow; }, set moveLow(v) { moveLow = v; },
    get netA() { return netA; }, set netA(v) { netA = v; },
    get noChevBoxes() { return noChevBoxes; }, set noChevBoxes(v) { noChevBoxes = v; },
    get nodeVisible() { return nodeVisible; },
    get nodKey() { return nodKey; }, set nodKey(v) { nodKey = v; },
    get olCol() { return olCol; }, set olCol(v) { olCol = v; },
    get olDirty() { return olDirty; }, set olDirty(v) { olDirty = v; },
    get olLast() { return olLast; }, set olLast(v) { olLast = v; },
    get olList() { return olList; },
    get olVerts() { return olVerts; }, set olVerts(v) { olVerts = v; },
    get organDimA() { return organDimA; }, set organDimA(v) { organDimA = v; },
    get organMorphA() { return organMorphA; }, set organMorphA(v) { organMorphA = v; },
    get organsEasing() { return organsEasing; }, set organsEasing(v) { organsEasing = v; },
    get originOn() { return originOn; },
    get origins() { return origins; }, set origins(v) { origins = v; },
    get originsF() { return originsF; }, set originsF(v) { originsF = v; },
    get OVER_ON() { return OVER_ON; }, set OVER_ON(v) { OVER_ON = v; },
    get overlayKey() { return overlayKey; }, set overlayKey(v) { overlayKey = v; },
    get ovT() { return ovT; }, set ovT(v) { ovT = v; },
    get paintOrganAlpha() { return paintOrganAlpha; },
    get paramJSONs() { return paramJSONs; },
    get pickVer() { return pickVer; }, set pickVer(v) { pickVer = v; },
    get picLin() { return picLin; }, set picLin(v) { picLin = v; },
    get picNow() { return picNow; }, set picNow(v) { picNow = v; },
    get pillEdge() { return pillEdge; }, set pillEdge(v) { pillEdge = v; },
    get pinned() { return pinned; },
    get plateAgain() { return plateAgain; }, set plateAgain(v) { plateAgain = v; },
    get plateBusy() { return plateBusy; }, set plateBusy(v) { plateBusy = v; },
    get plateDim() { return plateDim; }, set plateDim(v) { plateDim = v; },
    get plateDirty() { return plateDirty; }, set plateDirty(v) { plateDirty = v; },
    get plateDrops() { return plateDrops; }, set plateDrops(v) { plateDrops = v; },
    get plateEasing() { return plateEasing; },
    get plateKey() { return plateKey; }, set plateKey(v) { plateKey = v; },
    get plateLast() { return plateLast; }, set plateLast(v) { plateLast = v; },
    get plateMiss() { return plateMiss; }, set plateMiss(v) { plateMiss = v; },
    get plateOn() { return plateOn; },
    get platePoke() { return platePoke; },
    get plateRedraw() { return plateRedraw; }, set plateRedraw(v) { plateRedraw = v; },
    get plateSat() { return plateSat; }, set plateSat(v) { plateSat = v; },
    get plateSeq() { return plateSeq; }, set plateSeq(v) { plateSeq = v; },
    get plateSettle() { return plateSettle; }, set plateSettle(v) { plateSettle = v; },
    get plateStale() { return plateStale; }, set plateStale(v) { plateStale = v; },
    get plateStateKey() { return plateStateKey; },
    get plateTheme() { return plateTheme; }, set plateTheme(v) { plateTheme = v; },
    get plateTimer() { return plateTimer; }, set plateTimer(v) { plateTimer = v; },
    get plateView() { return plateView; }, set plateView(v) { plateView = v; },
    get plateViewKey() { return plateViewKey; }, set plateViewKey(v) { plateViewKey = v; },
    get pool() { return pool; },
    get poolFrames() { return poolFrames; }, set poolFrames(v) { poolFrames = v; },
    get projecting() { return projecting; }, set projecting(v) { projecting = v; },
    get ptSide() { return ptSide; }, set ptSide(v) { ptSide = v; },
    get putA() { return putA; },
    get pzInset() { return pzInset; },
    get quality() { return quality; }, set quality(v) { quality = v; },
    get quietFx() { return quietFx; },
    get recAsk() { return recAsk; }, set recAsk(v) { recAsk = v; },
    get recKick() { return recKick; },
    get recVer() { return recVer; }, set recVer(v) { recVer = v; },
    get REF() { return REF; },
    get RES_LIVER() { return RES_LIVER; },
    get resizeReady() { return resizeReady; }, set resizeReady(v) { resizeReady = v; },
    get resKey() { return resKey; },
    get resLit() { return resLit; }, set resLit(v) { resLit = v; },
    get resLitRev() { return resLitRev; }, set resLitRev(v) { resLitRev = v; },
    get reslotted() { return reslotted; }, set reslotted(v) { reslotted = v; },
    get resMask() { return resMask; }, set resMask(v) { resMask = v; },
    get resNow() { return resNow; },
    get restK() { return restK; }, set restK(v) { restK = v; },
    get restOn() { return restOn; }, set restOn(v) { restOn = v; },
    get restStill() { return restStill; },
    get restU() { return restU; }, set restU(v) { restU = v; },
    get revealN() { return revealN; }, set revealN(v) { revealN = v; },
    get reversedShown() { return reversedShown; },
    get revF() { return revF; }, set revF(v) { revF = v; },
    get revFlip() { return revFlip; }, set revFlip(v) { revFlip = v; },
    get revH() { return revH; }, set revH(v) { revH = v; },
    get revP() { return revP; }, set revP(v) { revP = v; },
    get revT() { return revT; }, set revT(v) { revT = v; },
    get rideCTM() { return rideCTM; }, set rideCTM(v) { rideCTM = v; },
    get rideLeaders() { return rideLeaders; },
    get riseBox() { return riseBox; }, set riseBox(v) { riseBox = v; },
    get riseExp() { return riseExp; }, set riseExp(v) { riseExp = v; },
    get riseFast() { return riseFast; }, set riseFast(v) { riseFast = v; },
    get riseFitAsk() { return riseFitAsk; }, set riseFitAsk(v) { riseFitAsk = v; },
    get riseLine() { return riseLine; }, set riseLine(v) { riseLine = v; },
    get risePrep() { return risePrep; }, set risePrep(v) { risePrep = v; },
    get risePrepT() { return risePrepT; }, set risePrepT(v) { risePrepT = v; },
    get riseUsed() { return riseUsed; }, set riseUsed(v) { riseUsed = v; },
    get rotHold() { return rotHold; }, set rotHold(v) { rotHold = v; },
    get rotTarget() { return rotTarget; }, set rotTarget(v) { rotTarget = v; },
    get rotU() { return rotU; }, set rotU(v) { rotU = v; },
    get rotWhole() { return rotWhole; }, set rotWhole(v) { rotWhole = v; },
    get rotGlide() { return rotGlide; }, set rotGlide(v) { rotGlide = v; },
    get sameView() { return sameView; },
    get scan() { return scan; },
    get scanPaint() { return scanPaint; },
    get schedulePlateView() { return schedulePlateView; },
    get segIdx() { return segIdx; }, set segIdx(v) { segIdx = v; }, get segIdxDry() { return segIdxDry; },
    get settleRes() { return settleRes; },
    get shownCol() { return shownCol; }, set shownCol(v) { shownCol = v; },
    get shunt() { return shunt; }, set shunt(v) { shunt = v; },
    get sigW() { return sigW; },
    get sigWidthMoved() { return sigWidthMoved; },
    get sinceP() { return sinceP; }, set sinceP(v) { sinceP = v; },
    get sites() { return sites; },
    get sleeping() { return sleeping; }, set sleeping(v) { sleeping = v; },
    get sleepTimer() { return sleepTimer; }, set sleepTimer(v) { sleepTimer = v; },
    get sliceEnd() { return sliceEnd; }, set sliceEnd(v) { sliceEnd = v; },
    get slideGlow() { return slideGlow; }, set slideGlow(v) { slideGlow = v; },
    get smoothRunOn() { return smoothRunOn; },
    get SOFTWARE() { return SOFTWARE; }, set SOFTWARE(v) { SOFTWARE = v; },
    get solCache() { return solCache; },
    get solveAsked() { return solveAsked; }, set solveAsked(v) { solveAsked = v; },
    get SOLVED_A() { return SOLVED_A; },
    get SOLVED_B() { return SOLVED_B; },
    get solvedFor() { return solvedFor; }, set solvedFor(v) { solvedFor = v; },
    get spleenTimer() { return spleenTimer; }, set spleenTimer(v) { spleenTimer = v; },
    get sprayA() { return sprayA; }, set sprayA(v) { sprayA = v; },
    get sprayLast() { return sprayLast; }, set sprayLast(v) { sprayLast = v; },
    get stageWake() { return stageWake; }, set stageWake(v) { stageWake = v; },
    get stats() { return stats; },
    get STENT_CALM_MS() { return STENT_CALM_MS; },
    get stentCalm() { return stentCalm; },
    get storeVer() { return storeVer; }, set storeVer(v) { storeVer = v; },
    get svgOver() { return svgOver; }, set svgOver(v) { svgOver = v; },
    get sweepBin() { return sweepBin; },
    get syncLiveOrgans() { return syncLiveOrgans; },
    get syncOrganDim() { return syncOrganDim; },
    get syncPlateLook() { return syncPlateLook; },
    get thrombiKey() { return thrombiKey; }, set thrombiKey(v) { thrombiKey = v; },
    get tokenRGB() { return tokenRGB; },
    get toneToken() { return toneToken; },
    get tubeData() { return tubeData; },
    get tubesNew() { return tubesNew; }, set tubesNew(v) { tubesNew = v; },
    get tubesShown() { return tubesShown; }, set tubesShown(v) { tubesShown = v; },
    get updateFocus() { return updateFocus; },
    get updateOrgans() { return updateOrgans; },
    get updateOrganSel() { return updateOrganSel; },
    get updateOverlays() { return updateOverlays; },
    get userMoved() { return userMoved; }, set userMoved(v) { userMoved = v; },
    get vBase() { return vBase; }, set vBase(v) { vBase = v; },
    get vBinKey() { return vBinKey; }, set vBinKey(v) { vBinKey = v; },
    get vBinReach() { return vBinReach; }, set vBinReach(v) { vBinReach = v; },
    get vBinSpare() { return vBinSpare; }, set vBinSpare(v) { vBinSpare = v; },
    get vbScale() { return vbScale; },
    get vdpr() { return vdpr; }, set vdpr(v) { vdpr = v; },
    get veins() { return veins; }, set veins(v) { veins = v; },
    get veinsDirty() { return veinsDirty; }, set veinsDirty(v) { veinsDirty = v; },
    get veinsDrawKey() { return veinsDrawKey; }, set veinsDrawKey(v) { veinsDrawKey = v; },
    get veinsHold() { return veinsHold; }, set veinsHold(v) { veinsHold = v; },
    get veinsRows() { return veinsRows; },
    get veinsTrimmed() { return veinsTrimmed; }, set veinsTrimmed(v) { if (veinsTrimmed && !v) lowWarm(); veinsTrimmed = v; },
    get vhStep() { return vhStep; },
    get viewKeyN() { return viewKeyN; }, set viewKeyN(v) { viewKeyN = v; },
    get viewRaf() { return viewRaf; }, set viewRaf(v) { viewRaf = v; },
    get viewSeq() { return viewSeq; }, set viewSeq(v) { viewSeq = v; },
    get viewVersion() { return viewVersion; }, set viewVersion(v) { viewVersion = v; },
    get viewXf() { return viewXf; }, set viewXf(v) { viewXf = v; },
    get vLook() { return vLook; }, set vLook(v) { vLook = v; },
    get vt() { return vt; }, set vt(v) { writeVT(v); },
    get vtAnim() { return vtAnim; }, set vtAnim(v) { vtAnim = v; },
    get vtGliding() { return vtGliding; }, set vtGliding(v) { vtGliding = v; },
    get vtMs() { return vtMs; }, set vtMs(v) { vtMs = v; },
    get vtTarget() { return vtTarget; }, set vtTarget(v) { vtTarget = v; },
    get vtUntil() { return vtUntil; }, set vtUntil(v) { vtUntil = v; },
    get wasHome() { return wasHome; }, set wasHome(v) { wasHome = v; },
    get wAt() { return wAt; }, set wAt(v) { wAt = v; },
    get widthCTM() { return widthCTM; }, set widthCTM(v) { widthCTM = v; },
    get widthEasing() { return widthEasing; }, set widthEasing(v) { widthEasing = v; },
    get widthF() { return widthF; }, set widthF(v) { widthF = v; },
    get widthVer() { return widthVer; }, set widthVer(v) { widthVer = v; },
    get worldOver() { return worldOver; }, set worldOver(v) { worldOver = v; },
    get wrapRect() { return wrapRect; }, set wrapRect(v) { wrapRect = v; },
    get xfHold() { return xfHold; }, set xfHold(v) { xfHold = v; },
    get leadOwed() { return leadOwed; }, set leadOwed(v) { leadOwed = v; },
    get xfOp() { return xfOp; }, set xfOp(v) { xfOp = v; },
    get xfSolving() { return xfSolving; }, set xfSolving(v) { xfSolving = v; },
    get zoomBase() { return zoomBase; }, set zoomBase(v) { zoomBase = v; },
    get zoomLayers() { return zoomLayers; }, set zoomLayers(v) { zoomLayers = v; },
    get zoomLz() { return zoomLz; }, set zoomLz(v) { zoomLz = v; },
    get zoomM() { return zoomM; }, set zoomM(v) { zoomM = v; },
    get zShift() { return zShift; }, set zShift(v) { zShift = v; },
  };
  // </stage-split live>
  // (#30) The stage's styles, as the model's frames read them (colours, the plate's theme, whether the figure shows): read live, each
  // read made the browser bring its styles up to date in the middle of the frame. They are read once and kept until something that
  // can change them happens: a class, style or theme attribute on the stage or any element above it, the system's light or dark
  // setting, a resize, or a new text size.
  // (A settings change reaches its listeners only at the next frame: a read between, from a timer or an idle moment, checks them itself.)
  let csSnap = null, csMq = null;
  // A class list less the classes a pan or pinch puts on and takes off, which change no colour or look the stage draws.
  // (And a slide's camera glide's own classes: pinch-hide fades only the label layer, off-home only the zoom pill, and none
  // of the readers keyed on this (the stage's colours, the organs' grey, the vessel marks, the glow) reads either. Counted, each glide
  // began and ended with the marks rebuilt shape by shape, every organ's colours read again and the stage's colours dropped: about
  // 300 style passes on a phone's slide change.)
  const gestureFree = (c) => (c || '').replace(/(?:^|\s)(?:panning|stage-busy|figure-focus|lb-ride|pinch-hide|off-home)(?=\s|$)/g, '');
  // (bugs-recs 8, 2 Nov 2026: the figure's classes as the still-frame and look keys see them: the gesture and camera classes left out
  // (they move nothing the picture draws) and the rest sorted, so two toggles in one frame that leave the same set, in another order,
  // are no change and no redraw. Worked out again only when the class string itself changed.)
  let wrapClsWas = null, wrapClsKey = '';
  const wrapCls = () => {
    const c = wrap.className;
    if (c !== wrapClsWas) { wrapClsWas = c; wrapClsKey = gestureFree(c).split(/\s+/).filter(Boolean).sort().join(' '); }
    return wrapClsKey;
  };
  const MQ = ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(hover: hover)', '(pointer: coarse)', 'print'].map((q) => matchMedia(q));
  // (1 Nov 2026, "Move everything to GPU": a dropped snapshot is taken again first in the next frame (readFrame), never between a frame's
  // writes; the frame in between keeps the last one.)
  // (2 Nov 2026, the iPhone trace: the snapshot read each name only when first asked for, so the ascites' ink, the plate's theme and the
  // other names asked late in a frame were read after that frame's writes, and the browser restyled the page there. Every name ever asked
  // for is now read when the snapshot is taken, at the start of the frame, before any write; only a name asked for the first time is read
  // late, once.)
  const csNames = new Set();
  let csLast = null, csAsk = 0;
  function wrapCSTake() {
    csAsk = 0;
    csMq = MQ.map((q) => q.matches);
    const live = getComputedStyle(wrap), m = new Map();
    for (const n of csNames) m.set(n, live.getPropertyValue(n));
    csSnap = csLast = { getPropertyValue: (n) => { let v = m.get(n); if (v === undefined) { m.set(n, (v = live.getPropertyValue(n))); csNames.add(n); } return v; } };
  }
  function wrapCS() {
    if (csSnap) for (let i = 0; i < MQ.length; i++) if (MQ[i].matches !== csMq[i]) { csSnap = null; break; }
    if (!csSnap) csAsk ||= readFrame(wrapCSTake);
    return csSnap || csLast;
  }
  wrapCSTake();
  {
    const drop = () => { csSnap = null; };
    // (Not for the classes of a gesture alone: panning (the cursor), stage-busy (the menus' fade) and figure-focus (the phone's
    // top bar and dock) set no colour the stage reads. Dropped, the snapshot forced a style pass and a whole vessel sync as a
    // pan began, as it ended and again as the menus faded back in, 0.6 s after (Mohammad, 21 Oct: "still lag after i pan or zoom").)
    const seen = new Map();
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.attributeName === 'class') { const c = gestureFree(r.target.getAttribute('class')); if (seen.get(r.target) === c) continue; seen.set(r.target, c); }
        drop();
        // (A new look: the snapshot is taken in the next frame's read phase, before the theme frame's callbacks, so the figure's sync in that frame reads the new colours.)
        if (recs.some((x) => x.attributeName === 'data-theme' || x.attributeName === 'data-palette')) csAsk ||= readFrame(wrapCSTake);
        return;
      }
    });
    for (let el = wrap; el; el = el.parentElement) { seen.set(el, gestureFree(el.getAttribute('class'))); mo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-theme', 'data-palette', 'data-noglass', 'data-mode'] }); }
    // (The settings the style sheets ask about; the sizes come with a resize, as does a turn of the device or a page zoom.)
    for (const q of MQ) q.addEventListener?.('change', drop);
    addEventListener('resize', drop); addEventListener('orientationchange', drop); addEventListener('pps:labelscale', drop);
    addEventListener('beforeprint', drop); addEventListener('afterprint', drop);
  }
  const svg = wrap.querySelector('#stage');
  const stageWrap = wrap.closest('.stage-wrap') || wrap;
  // What the framing and the labels' card boxes measure, watched so they are read again only when one may have moved.
  const watch = layoutWatch();
  watch.addBox(wrap); watch.addBox(svg); watch.addNode(svg); watch.addNode(wrap);
  addEventListener('resize', watch.touch); addEventListener('pps:occ', watch.touch); addEventListener('pps:labelscale', watch.touch);
  document.addEventListener('visibilitychange', watch.touch);
  document.fonts?.addEventListener?.('loadingdone', watch.touch);
  for (const q of MQ) q.addEventListener?.('change', watch.touch);
  // (Not the model's frames, nor its parameters: a slide's time-lapse sets them several times a second for minutes, which kept the
  // cards' boxes read ten times a second through the slide; a card that grows with a new reading is seen by its own size watch.)
  store.on('*', (keys) => { for (let i = 0; i < keys.length; i++) if (keys[i] !== 'frame' && keys[i] !== 'params') { watch.touch(); break; } }, { frames: false });
  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  const vbBox = { x: 0, y: 0, width: VIEW.w, height: VIEW.h };   // (the view box as set: read from here, never back from the attribute, see setViewBox)
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // ── Geometry sampling ──────────────────────────────
  // A fresh element per course: Chromium can keep measuring a reused path's previous course after
  // its `d` changes (a straight segment after another), which drew the suprahepatic IVC over the
  // infrahepatic one and put the SVC out on the circuit's course.
  const scratchG = s('g');
  svg.append(scratchG);
  const { arcLen, arcMid, blendFrom, braid, lenOfItem, litNormals, meander, pointAt, polyD, sample, tubeOutline, wiggle } = createPaths({ N_SAMPLES, scratchG });
  const { FADE_DOWN_Y, FADE_IN, FEEDER_CONNECTOR, FEEDER_FADE_Y, GPU_EASE, IVC_JOIN, LIGATED, SIDE_HOSTS, SIDE_INSIDE, SIN_FADE, STRAIGHT_COLL, divideLen, feedGeo, geo, routeCustomShunts, treeGeo } = createGeo({ ALL_EDGES, EI, N_SAMPLES, meander, sample, scratchG, svg, wiggle }, live);
  // Where to caption each circuit lane: the middle of its longest horizontal run.
  const laneU = {}, laneAlt = {};
  for (const id of Object.keys(LANE_CAPTIONS)) {
    const C = geo[id]?.C;
    if (!C) continue;
    // Every straight horizontal run, longest first: the caption goes on the first of them (or the
    // spot along it) that is free of other vessels.
    const runs = [];
    let st = 0;
    for (let i = 1; i <= C.length; i++) {
      if (i < C.length && Math.abs(C[i][1] - C[i - 1][1]) < 0.6) continue;
      if (i - 1 - st >= 3) runs.push([st, i - 1]);
      st = i;
    }
    runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
    const last = C.length - 1;
    laneU[id] = runs.length ? (runs[0][0] + runs[0][1]) / 2 / last : 0.5;
    laneAlt[id] = runs.flatMap(([i0, i1]) => [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => (i0 + (i1 - i0) * f) / last));
  }

  // Where along each vessel a stenosis sits (0–1 of its drawn path). A stent's narrowing sits in the segment its card
  // names (the model's short pinch, see engine.js); any other vessel is one lumped segment, drawn narrowed at its middle.
  const stenosisAt = (id, p) => (isStent(EDGES[EI[id]]) ? STENT_SITES[stentSite(p, id)] : 0.5);
  // Lumen radius factor along a stenosed vessel: the diameter narrows by the stenosis fraction
  // (the model's resistance scales as 1/(1−s)⁴), with a smooth waist about 2.5 diameters long.
  function waist(id, v, len, w, p) {
    const u0 = stenosisAt(id, p);
    const sig = Math.max(9, w * 1.25) / Math.max(1, len);
    return (u) => 1 - v * Math.exp(-(((u - u0) / sig) ** 2));
  }

  // The wedge station sits inside the small peripheral hepatic vein branch, on its drawn centerline: the point 0.55 of the way along
  // the branch's course taken from its far end (the branch read backwards, cut at that fraction of its length).
  const WEDGE_BRANCH = { W_R: 'POST_R_RHV', W_M: 'POST_R_MHV', W_L: 'POST_L_LHV' };
  const wedgeOut = [0, 0];   // (read at once by nodePos's callers)
  const wedgeTip = (id) => {
    const c = geo[WEDGE_BRANCH[id]]?.cur;
    if (!(c?.length > 1)) return null;
    const n = c.length, f = 0.55;
    let L = 0;
    for (let i = 1; i < n; i++) L += Math.hypot(c[n - 1 - i][0] - c[n - i][0], c[n - 1 - i][1] - c[n - i][1]);
    let run = 0;
    for (let i = 1; i < n; i++) {
      const q = c[n - 1 - i], r = c[n - i];
      const seg = Math.hypot(q[0] - r[0], q[1] - r[1]);
      if (seg > 0 && run + seg >= f * L) { const u = (f * L - run) / seg; wedgeOut[0] = lerp(r[0], q[0], u); wedgeOut[1] = lerp(r[1], q[1], u); return wedgeOut; }
      run += seg;
    }
    return c[0];
  };
  const nodeOut = [0, 0], nodePos = (id, t) => { if (WEDGE_BRANCH[id]) { const w = wedgeTip(id); if (w) return w; } const a = NODE_POS[id][0], w = peelAt(t, peelRank(NODE_POS[id][1][0])), c = circTurnPt(NODE_POS[id][1], t); nodeOut[0] = lerp(a[0], c[0], w); nodeOut[1] = lerp(a[1], c[1], w); return nodeOut; };   // (nodeOut read at once by every caller; the circuit's end turned mid-change: circTurnPt; on the station's own share of the change: the flow peel)

  // ── SVG scaffolding ───────────────────────────────
  const defs = s('defs');
  // Organ fills: a light top-to-bottom falloff in the organ's own hue.
  const grad = (id, varName, a0, a1) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a0})"/><stop offset="1" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a1})"/></linearGradient>`;
  // The diaphragm's mask ends where its fade does (diaFadeG: clear from y 420 down, padded clear past it): the same pixels, as below it
  // the mask hid everything anyway. Ending at the bottom of the view, its region made the page build a mask the size of the whole
  // backdrop on every frame the organs were drawn live (the flank, drawn with ascites, stretched the backdrop over the abdomen), as
  // the liver eased (Mohammad's iPhone ?perf, 21 Oct: 35-50 ms frames with the live organs left out, 60-140 with them; 16 Oct notes).
  const DIA_MASK_H = 422 + 150;
  defs.innerHTML = `
    ${grad('gLiver', '--organ-liver', 0.8, 1.05)}${grad('gStomach', '--organ-stomach', 0.75, 1)}${grad('gSpleen', '--organ-spleen', 0.8, 1.05)}
    ${grad('gKidney', '--organ-kidney', 0.75, 1)}${grad('gGut', '--organ-gut', 0.6, 0.85)}${grad('gHeart', '--organ-heart', 0.8, 1.05)}${grad('gPancreas', '--organ-pancreas', 0.8, 1)}
    <filter id="orgSoft" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="6"/></filter>
    <radialGradient id="congest" cx=".42" cy=".42" r=".7"><stop offset=".35" class="cg-in"/><stop offset="1" class="cg-out"/></radialGradient>
    <linearGradient id="fluid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fl-top"/><stop offset="1" class="fl-bot"/></linearGradient>
    <radialGradient id="skin" cx=".5" cy=".5" r=".5"><stop offset="0" class="sk-in"/><stop offset=".8" class="sk-mid"/><stop offset="1" class="sk-out"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="mt-a"/><stop offset=".5" class="mt-b"/><stop offset="1" class="mt-a"/></linearGradient>
    <linearGradient id="esoFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="-40"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="esoFade" maskUnits="userSpaceOnUse" x="0" y="-150" width="${VIEW.w}" height="${VIEW.h + 150}"><rect x="0" y="-150" width="${VIEW.w}" height="${VIEW.h + 150}" fill="url(#esoFadeG)"/></mask>
    <linearGradient id="diaFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="420"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="diaMask" maskUnits="userSpaceOnUse" x="0" y="-150" width="${VIEW.w}" height="${DIA_MASK_H}"><rect x="0" y="-150" width="${VIEW.w}" height="${DIA_MASK_H}" fill="url(#diaFadeG)"/></mask>
    <linearGradient id="rectFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="${RECTUM_FADE[0]}" x2="0" y2="${RECTUM_FADE[1]}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="rectFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="1100"><rect x="0" y="0" width="${VIEW.w}" height="1100" fill="url(#rectFadeG)"/></mask>
    <clipPath id="abdomenClip"><path d="${ABDOMEN_CLIP}"/></clipPath>
    <radialGradient id="orgForm" cx=".3" cy=".2" r=".95"><stop offset="0" class="lit-hi"/><stop offset=".48" class="lit-mid"/><stop offset="1" class="lit-lo"/></radialGradient>
    <filter id="castShadow" x="-10%" y="-10%" width="130%" height="130%"><feGaussianBlur stdDeviation="7"/></filter>
    <pattern id="texLiver" width="22" height="19" patternUnits="userSpaceOnUse"><path class="tex" d="M5.5 0l5.5 3.2v6.3l-5.5 3.2L0 9.5V3.2zM16.5 9.5l5.5 3.2V19M11 9.5l5.5-3.2"/></pattern>
    <pattern id="texFine" width="9" height="9" patternUnits="userSpaceOnUse"><circle class="tex-dot" cx="2" cy="2" r=".8"/><circle class="tex-dot" cx="6.5" cy="6.5" r=".6"/></pattern>
    <pattern id="texRugae" width="40" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><path class="tex" d="M0 6c7-4 13 4 20 0s13-4 20 0"/></pattern>
    <pattern id="texLobules" width="14" height="12" patternUnits="userSpaceOnUse"><path class="tex" d="M1 6a6 5 0 0 1 12 0M-6 12a6 5 0 0 1 12 0M8 12a6 5 0 0 1 12 0"/></pattern>
    <pattern id="texMuscle" width="30" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><path class="tex" d="M0 5c8-3 22 3 30 0"/></pattern>
`;
  svg.append(defs);
  const world = s('g', { id: 'world' });
  svg.append(world);
  // Background plane (anatomy): the diaphragm, behind everything else (no body-cavity shading: the abdomen sits on the
  // plain stage background).
  const gBackdrop = s('g', { id: 'backdrop', mask: 'url(#diaMask)' });
  gBackdrop.innerHTML = `<path class="org-diaphragm band-edge" d="${BACKDROP.diaphragm}"/><path class="org-diaphragm band-body" d="${BACKDROP.diaphragm}"/>`;
  const gOrgans = s('g', { id: 'organs' });
  const gAscites = s('g', { id: 'ascites', 'clip-path': 'url(#abdomenClip)' });
  for (const g of [gBackdrop, gOrgans, gAscites]) watch.addGroup(g);   // (the home framing measures these: defaultVT)
  // (The vessels have no element: the GPU draws them from their records (veins-gl.js), tier by tier, and they are picked and reached by
  // the keyboard on the same numbers (hitVessel, figKeys). Posterior veins (retrohepatic IVC, iliac, azygos…) pass behind the opaque
  // organs: the GPU draws their faint course over them.)
  const gOver = s('g', { id: 'overlays' });
  const gFocus = s('g', { id: 'focus' });
  const gGuides = s('g', { id: 'guides' });
  // Overlay and label structure (nodes added or swapped) is written in a rest pass between two frames, never inside one
  // (the owner's rule, 2 Nov 2026: no DOM writes in a frame). A frame builds the nodes and queues them with late(op, a, b); the
  // pass applies them in the order asked, so the last ask wins. (?restpass=0, rest-pass.js, runs that pass on a plain zero timer.)
  const lateQueue = createLateQueue((op, a, b) => lateRun(op, a, b), restPass, cancelRest);
  const unlitKeys = new Set();   // (the stations a lit slide dims, by key: a leader made later is dimmed too, V-LIT-3)
  function late(op, a, b) { lateQueue.push(op, a, b); }
  function lateRun(op, a, b) {
    if (op === 'kids') { a.replaceChildren(...b); labelGL?.dirty(a); }   // (a label's pieces: its layer is told, L3 P5; a group that is no label is passed over)
    else if (op === 'label') { if (!a.isConnected) gLabels.append(a); }   // (a new label)
    else if (op === 'lead') { for (let i = a.length - 1, next = null; i >= 0; i--) { if (!a[i].isConnected) { gLeaders.insertBefore(a[i], next); if (unlitKeys.size && unlitKeys.has(a[i].dataset.k)) a[i].classList.add('unlit'); } next = a[i]; } }   // (a new leader goes in just before the next one wanted that is already in)
    else if (op === 'add') { if (a !== b.parentNode) a.append(b); }   // (a node new to its parent)
    else if (op === 'append') a.append(...b);
    else if (op === 'text') a.textContent = b;   // (words a node is made with)
    else if (op === 'defs') defs.append(...a);
    else if (op === 'cathadd') { a.append(b); cath.lblKey = ''; cathLabelsSoon(); }   // (a reading new to the catheter's layer: laid out again once it is in)
    else if (op === 'fill') { a.style.fill = b; labelGL?.dirty(a); }   // (a reading's colour)
    else if (op === 'hover') gHovO.replaceChildren(...a);
    else if (op === 'guide') { if (shunt) for (const el of a) if (el.parentNode !== gGuides) gGuides.append(el); }   // (a drag that has ended since leaves none)
  }
  world.append(gBackdrop, gOrgans, gFocus, gAscites, gOver, gGuides);
  // The figure is drawn on the GPU (veins-gl.js): the plate, every vessel in both views and the
  // moving blood. The SVG below keeps the organ artwork (rasterized for the GPU), invisible hit
  // targets and focus for each vessel, and what is drawn above the vessels (lesions, stents,
  // halos, guides), which moves to a second SVG above the GPU layer, with the same view box.
  const GL_ROWS = ALL_EDGES.length + ALL_EDGES.reduce((n, e) => n + (STRANDS[e.id]?.length || 0) + (feedGeo[e.id]?.length || 0) + (treeGeo[e.id]?.length || 0), 0);
  let veins = null, svgOver = null, worldOver = null;
  let plateDirty = true;   // (the GPU said the whole plate came or went, or the class was set by hand: syncVeinsNow sets `gl-plate` to what the GPU holds, once)
  let olList = [], olCol = [0.2, 0.45, 0.9], olDirty = false, olLast = 0, olVerts = null;   // the organ outlines on the GPU (see olStep)
  const vCanvas = document.createElement('canvas');
  vCanvas.id = 'veins'; vCanvas.setAttribute('aria-hidden', 'true');
  svg.after(vCanvas);
  // Lite graphics (main.js) keeps the SVG tubes: a software renderer copied every WebGL frame back to the CPU.
  veins = createVeinsGL(vCanvas, { tubes: GL_ROWS, force: true, onPlate: () => { plateDirty = true; } });
  if (veins) {
    wrap.classList.add('gl-on');   // (the GPU draws the vessels from here until its context is lost: the class goes then, comes back when it is restored)
    svgOver = s('svg', { id: 'stageOver', 'aria-hidden': 'true', viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, preserveAspectRatio: 'xMidYMid meet' });
    worldOver = s('g');
    svgOver.append(worldOver);
    vCanvas.after(svgOver);
    worldOver.append(gFocus, gOver, gGuides);
    wrap.classList.add('veins-gl');
  } else {
    // No WebGL2 context (the start-up check in index.html turns away a browser without WebGL2 at all; this is one whose GPU refused
    // the context): the vessels are drawn only by the GPU, so the notice says so.
    console.warn('WebGL2 is not available: the vessels cannot be drawn.');
    toast('This device could not start its graphics (WebGL2), so the vessels cannot be drawn. Reloading the page, or another browser, may help.');
  }
  wrap.dataset.veins = veins ? 'webgl2' : 'none';

  // Circuit view: quiet bands for each pressure zone (captioned by the label layer), over a grid of dots that runs on past the figure in
  // every direction and fades out in steps, and a slide's lit zone (deck visuals V25, ext-callouts.js: zone), lit softly. All drawn by the
  // GPU from these numbers (veins-gl.js mapAt, under the organs; 2 Nov 2026, the figure's SVG model as data): no element, pattern or
  // layer. a: the morph's t (the grid fades with it); the colours from the theme (syncMapInk: --map-dot, the chart's three zone bands for the
  // tinted zones, --accent at .09 for the lit one); rot: its turn from the vessels' (mapTurn); fx: the lit zone's fade (stepMap).
  const MAP = { a: 0, dot: [0, 0, 0, 0], zone: new Float32Array(12), fx: [0, 0, 0, 0], alt: [0, 0, 0, 0], fxX: [0, 0], rot: [1, 0, 0, 0], fxOn: false, fxU: 0, fxCol: [0, 0, 0] };
  CIRCUIT_ZONES.filter((z, i) => i % 2).forEach(([, x0, x1], j) => { MAP.alt[2 * j] = x0; MAP.alt[2 * j + 1] = x1; });

  // Each organ is drawn as a medical plate draws it, lit from the upper left:
  //   ambient occlusion where it meets the body wall (a soft dark edge outside it),
  //   its tissue tone (a light face turning to a shaded face, per tissue),
  //   the volume of a curved surface (a broad highlight and a darker turn at the rim),
  //   its surface anatomy (fissures, rugae, hilum, lobulation; clipped inside),
  //   an inner shade along the lower-right edge and a rim light along the upper-left edge,
  //   and a crisp outline in the tissue's own darker tone.
  // Everything is gradients and clips (no blur filters), so it costs nothing per frame.
  const TONES = ['liver', 'stomach', 'eso', 'spleen', 'panc', 'kidney', 'gb', 'gut', 'heart', 'ra'];
  defs.insertAdjacentHTML('beforeend', TONES.map((t) => `<linearGradient id="og-${t}" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" style="stop-color:var(--og-${t}-1)"/><stop offset="1" style="stop-color:var(--og-${t}-2)"/></linearGradient>`).join('')
    + '<radialGradient id="ogVol" cx=".34" cy=".26" r=".92"><stop offset="0" style="stop-color:var(--light-ink);stop-opacity:.22"/><stop offset=".5" style="stop-color:var(--light-ink);stop-opacity:0"/><stop offset=".8" style="stop-color:var(--og-vol-shade);stop-opacity:0"/><stop offset="1" style="stop-color:var(--og-vol-shade);stop-opacity:.17"/></radialGradient>');
  const organEls = {}, organG = {};
  const detailFor = (o) => {
    const list = ORGAN_DETAIL[o.id];
    if (!list) return null;
    const dg = s('g', { class: 'org-detail', 'clip-path': `url(#clip-${o.id})` });
    for (const [kind, d] of list) {
      if (kind === 'lobules') dg.append(s('path', { d: o.d, class: 'org-lobules', fill: 'url(#texLobules)' }));
      else dg.append(s('path', { d, class: 'od-' + kind }));
    }
    // The embolized spleen's infarct, in the spleen's own group (clipped by its outline, sized with it, painted by organ-paint on the
    // GPU with the organ itself, so it can never lag a pinch): shown by stage-diaphragm.js while p.splenicRx is 1.
    if (o.id === 'spleen') {
      const pse = s('g', { class: 'spleen-pse', display: 'none' });
      pse.append(s('path', { d: SPLEEN_PSE_AREA, class: 'pse-dead' }), s('path', { d: SPLEEN_PSE_EDGE, class: 'pse-edge' }));
      dg.append(pse);
    }
    return dg;
  };
  // The gut (colon, small bowel, duodenum; organ picks, 20 Oct): drawn from organ-art.js in one see-through group (app.css
  // --gut-a), so the colon covers the loops under it, and cut away under the liver, stomach, spleen and kidney (#gutHide):
  // the gut never shows through them. The cut follows the liver and spleen as they change size (syncOrganMasks).
  // Each gut organ keeps its own group (the bowel's floats up on ascites) and its own path, unpainted (.org-key-path),
  // which highlights, anchors and the vessels' cover read.
  const GUT_DRAW = { colon: COLON_ART, bowel: BOWEL_ART, duodenum: `<g clip-path="url(#du-Bc)">${DUO_B}</g>` };
  const GUT_HIDE = ['liver', 'stomach', 'spleen'];
  const FLUID_R = [284, 430, 856, 650], FLUID_COLS = 1201;   // the GPU ascites' rectangle (world x, y, w, h), and its rows and columns
  const MASK_BOX = 'x="200" y="-200" width="1020" height="1320"';   // (the plate's rectangle, PLATE_RECT)
  defs.insertAdjacentHTML('beforeend', `${DUO_CLIPS}`
    // colour-exempt: masks (white shows, black hides)
    // (The gut's mask runs to y 1080, past the rectum's end: at 1040 it cut the rectum off in a hard edge. The rectum's fade is on the colon's
    // own group, rectFade, as the esophagus has esoFade.)
    + '<clipPath id="gutBox" clipPathUnits="userSpaceOnUse"><rect x="320" y="420" width="800" height="660"/></clipPath>'
    + `<mask id="gutHide" maskUnits="userSpaceOnUse" x="320" y="420" width="800" height="660"><rect x="320" y="420" width="800" height="660" fill="#fff"/>${GUT_HIDE.map((id) => `<path data-gut-cut="${id}" d="${id === 'stomach' ? SEAM_D : ORGANS.find((o) => o.id === id).d}" fill="#000"/>`).join('')}</mask>`
    // The duodenum's first part fades in over the stomach's tip, from inside it (x 730) to just past it (x 712).
    + '<linearGradient id="duFadeG" gradientUnits="userSpaceOnUse" x1="712" y1="0" x2="730" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="duFade" maskUnits="userSpaceOnUse" x="500" y="400" width="400" height="400"><rect x="500" y="400" width="400" height="400" fill="url(#duFadeG)"/></mask>'
    // The esophagus and stomach as one shape: the stomach's tones as one ramp over both, and the esophagus's own tone fading
    // out over the cardia (y 226 to 262), so no colour step marks the old seam.
    + '<linearGradient id="seamS" gradientUnits="userSpaceOnUse" x1="750" y1="241" x2="948" y2="566"><stop offset="0" style="stop-color:var(--og-stomach-1)"/><stop offset="1" style="stop-color:var(--og-stomach-2)"/></linearGradient>'
    + '<linearGradient id="seamFG" gradientUnits="userSpaceOnUse" x1="0" y1="226" x2="0" y2="262"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="seamFade" maskUnits="userSpaceOnUse" x="700" y="-150" width="200" height="450"><rect x="700" y="-150" width="200" height="450" fill="url(#seamFG)"/></mask>'
    // The liver lies in front of the stomach and esophagus, which show through it: where it covers them they are drawn at
    // .65, and up to full strength as cirrhosis comes in (morphLiver); the top still fades out of the plate as before.
    + `<mask id="frontM" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="url(#esoFadeG)"/><path data-front d="${ORGANS.find((o) => o.id === 'liver').d}" fill="#000" fill-opacity=".35"/></mask>`
    // With cirrhosis the liver itself goes lighter over the stomach (to .5 of its strength), in the liver's own frame (the
    // shrink's inverse, syncOrganMasks), and the stomach's outline is traced over the liver, only where the liver covers it.
    + `<mask id="lvThin" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="#fff"/><path data-thin d="${SEAM_D}" fill="#000" fill-opacity="0"/></mask>`
    + `<mask id="ghostM" maskUnits="userSpaceOnUse" ${MASK_BOX}><path data-ghost d="${ORGANS.find((o) => o.id === 'liver').d}" fill="#fff"/></mask>`
    // The ascites kept off the congested liver (the page's copy, drawn without WebGL; the GPU's own: fluidLv in veins-gl.js).
    + `<mask id="ascLv" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="#fff"/><path data-asc-lv d="${ORGANS.find((o) => o.id === 'liver').d}" fill="#000" fill-opacity="0"/></mask>`);
  const gutCut = Object.fromEntries([...defs.querySelectorAll('#gutHide [data-gut-cut]')].map((el) => [el.dataset.gutCut, el]));
  const frontCut = defs.querySelector('#frontM [data-front]'), thinCut = defs.querySelector('#lvThin [data-thin]'), ghostCut = defs.querySelector('#ghostM [data-ghost]'), ascLvCut = defs.querySelector('#ascLv [data-asc-lv]');
  let gGut = null;
  const { ORGAN_KEYS, diaCut, ghost, gutKids, liverTint, lv, morphLiver, syncOrganMasks } = createOrgans({ FLUID_COLS, FLUID_R, GUT_DRAW, ascLvCut, defs, detailFor, frontCut, gOrgans, ghostCut, gutCut, organEls, organG, svg, thinCut }, live);
  // (keyStops: whether the figure (its vessels and organs, one stop) and its labels are keyboard stops. A talk turns them off: its figure is read-only and focus never
  // shows on it, so Tab would have walked dozens of stops it could not show; setKeyStops.)
  let keyStops = true;
  let sinMoveGen = 0;   // (the newest dive into or out of the sinusoid view: an older one, still waiting on its zoom, stops there rather than finishing over it)
  let baseLiver = null, liverKey = '', islSrc = null, nodKey = null, islOn = null;   // (nodKey, islOn: what the nodules and the islands were last written for)
  // The diseased liver's outline without its nodular bulges and notches, for the diaphragm: one smooth dome the nodules
  // never dent (Mohammad, 20 Oct: it was "morphing to the nodules of the liver"). null while the liver is healthy.
  let liverDome = null;
  // The liver's lower edge (in its own frame) at FLUID_COLS columns evenly across the fluid's rectangle (FLUID_R), for the
  // GPU ascites: the lowest point of the outline over each column, or far above where the liver does not reach.
  let liverFloor = null, liverFluidCut = 0, liverScale = 1;
  // The liver's state eases toward the model's (a new patient or a slider never makes it jump).
  let lvC = null, lvG = 0, lvT = 0, lvGT = null, lvTT = null, lvAt = 0, lvMoving = false, lvCT = null, lvGTo = null, lvStillAt = 0, caudK = null;
  // The spleen growing through a time-lapse shows on the live drawing, at its size each frame, as the liver's ease does (spleen-motion.js).
  const spleenMv = spleenMotion();
  const spleenMoving = () => spleenMv.moving(performance.now());
  let spleenTimer = 0;
  // Abdominal wall (anterior): a soft skin tint that appears only with caput medusae, under its veins.
  const abdWall = s('ellipse', { cx: SITES.umbilicus[0], cy: SITES.umbilicus[1], rx: 120, ry: 96, fill: 'url(#skin)', class: 'abd-wall', opacity: 0 });
  // Flanks: the outline of the abdominal wall, which bulges as ascites accumulates.
  const flank = s('path', { class: 'flank', d: '' });
  gOver.before(abdWall);
  // The abdominal wall's fade, eased here a frame at a time (its opacity attribute, which the overlays' GPU painter reads at each paint),
  // not by a CSS transition: one the browser eases is invisible to the painter, so while it ran the wall and every overlay above it
  // went back to the SVG (stage-over.js). Soft and slow, and it bends when its target moves again (soft-fade.js).
  const abdFade = createSoftFade({ write: (v) => putA(abdWall, 'opacity', v), frame: drawFrame, cancel: cancelFrame, reduced: () => reduceMotion.matches, now: () => performance.now() });
  const abdTo = abdFade.to;
  const ascitesPath = s('path', { class: 'ascites-fill', d: '', fill: 'url(#fluid)' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  gAscites.append(ascitesPath, ascitesLine);
  const ascEls = [ascitesPath, ascitesLine];
  let fluidSurf = null;   // the ascites surface y(x) while there is fluid; a tap below it opens the Ascites view
  // (R05: the ascites surface's SVG copy, written only when read while the GPU draws it; see the ripple in syncAscites.)
  let ascStale = false, ascWroteH = NaN, ascWroteAmp = NaN, ascWroteAt = -1e9;
  function ascitesSvg() {
    if (!ascStale) return;
    ascStale = false; ascWroteH = fluidH; ascWroteAmp = fluidAmp; ascWroteAt = performance.now();
    const surf = fluidSurf;
    if (!surf) return;
    let line = '';
    for (let x = 296; x <= 1128; x += 8) line += `${x === 296 ? 'M' : ' L'}${x} ${surf(x).toFixed(1)}`;
    putA(ascitesLine, 'd', line);
    if (gAscites.style.getPropertyValue('--fluid-fade') !== fluidFade().toFixed(3)) gAscites.style.setProperty('--fluid-fade', fluidFade().toFixed(3));
    putA(ascitesPath, 'd', `${line} L 1128 ${CAVITY_LOW + 20} L 296 ${CAVITY_LOW + 20} Z`);   // down past the rounded pelvic floor; the clip shapes it
  }
  gBackdrop.append(flank);

  // Edge groups: each vessel is a record (its course, widths, colours, fades and flags), drawn by the GPU (veins-gl.js) from those
  // numbers alone. It is picked on the same numbers (hitVessel, vessel-pick.js) and reached by the keyboard through the figure's one stop (figKeys).
  const E = {};
  for (const e of ALL_EDGES) {
    const isArt = e.kind === 'arteriole' || e.kind === 'artery' || (e.kind === 'shunt' && e.shunt === 'ap');
    // Extra channels of a braided collateral (cavernoma): drawn under the main tube, each picked as part of its vessel.
    const strands = !isArt && STRANDS[e.id] ? STRANDS[e.id].map(([off, ph, k, ua, ub]) => ({ off, ph, k, span: ua != null ? [ua, ub] : null })) : null;
    // (fadeMask: a tributary that sinks into a retroperitoneal vein fades into it, FEEDER_FADE_Y, unless its trunk is carried on.)
    const feeders = !isArt && feedGeo[e.id] ? feedGeo[e.id].map(({ pts: cur, k: fk, fan, when, src, out }, i) => ({ cur, fk, fan, when, src, out, len: arcLen(cur), ph: i * 0.37, fadeMask: !!FEEDER_FADE_Y[e.id] })) : null;
    // A vein that ends in the organ it drains fades out over its first stretch (TIP_FADE, drawn by the GPU from `line`): none in the circuit.
    // (The hepatic artery's own fades, ART_FADE: its start fades in in both views (keep: the circuit does not let go of it), its branches
    // fade out at their ends. The same GPU fade.)
    const tipFade = TIP_FADE[e.id] && !isArt ? { frac: TIP_FADE[e.id], line: [0, 0, 1, 0], joined: false } : ART_FADE[e.id]?.in ? { frac: ART_FADE[e.id].in, line: [0, 0, 1, 0], joined: false, keep: true } : null;
    const endFade = ART_FADE[e.id]?.out ? { frac: 1 - ART_FADE[e.id].out, line: [0, 0, 1, 0] } : null;
    // (An arterioportal shunt has the artery's wall too, and keeps its red in the Blood origin lens, where a bare stroke read as an empty row: grey blue.)
    const tube = isArt && (!!ART_FADE[e.id] || e.shunt === 'ap');
    E[e.id] = { e, tipFade, endFade, tube, strands, feeders, isArt, vis: true, width: 4, wallPx: 1, shadeOk: false, shadeVer: 0 };
  }
  ALL_EDGES.forEach((e, i) => { E[e.id].row = i; });
  // (Every vessel, in E's order, as one list kept from here on: E is built once above and never gains or loses a key, so the
  // per-frame loops below need not build Object.values(E) again on every frame.)
  const EV = Object.values(E);
  // (Rev 2 §2.8, dirty flags for the frame path: how many vessels draw on or off now, kept as each reveal starts and ends (setReveal),
  // so asking whether any does (anyReveal) walks nothing and makes no closure a frame, where EV.some did both.)
  let revealN = 0;
  const setReveal = (x, r) => { if (!x.reveal !== !r) revealN += r ? 1 : -1; x.reveal = r; };
  const anyReveal = () => revealN > 0;
  // Draw order within each tier: the portal tree in front (it lies anterior to the IVC).
  for (const x of EV) if (!x.isArt && (x.e.kind === 'vein' && PORTAL_TERRITORY.has(x.e.to) && PORTAL_TERRITORY.has(x.e.from || '') || ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SMV_CONF', 'SV_CONF'].includes(x.e.id))) x.front = true;
  for (const id of BACK_EDGES) if (E[id]) E[id].back = true;
  // The stents through the liver (TIPS, DIPS) are drawn with the portal tree, in front of the network: they cross the hepatic veins (the middle one went through the TIPS
  // when both were one tier: a crossing in one tier is a union, the wider lumen wins), and they end on the portal vein, whose tier a lower-tier stent's end cannot match (the
  // portal vein's outline crossed its mouth; tube-renderer.md, 'Not handled'). Its end on a hepatic vein is a branch in a higher tier, which the Tube fades into the vein.
  // (11 Nov 2026, Mohammad's TIPS shots. Not x.front: that also widens the casing, PORTAL_CASING.)
  // The splenorenal shunts (the spontaneous C6 and the Warren shunt S_DSR) leave the splenic vein, which is in the portal tree's tier: a lower-tier end runs under the vein's wall, and the
  // wall's dark outline crosses the shunt's mouth, a line between the two (12 Nov 2026, Mohammad: "should be connected at its ends, not separated by lines"). In the vein's own tier
  // the join cuts the shunt at the wall and the wall is not drawn over its mouth.
  for (const id of ['TIPS', 'DIPS', 'C6', 'S_DSR']) if (E[id]) E[id].over = true;

  // Translucent vessels (the context veins, collaterals) are drawn by the GPU in tiers, one per opacity level (levelTier), beneath the
  // opaque network: a tier is faded once, as a whole, so where two of its vessels meet their overlap is a union, not a darker disc.
  const LEVELS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const nearestLevel = (o) => {
    if (o >= 0.95) return 1;
    let b = LEVELS[0];
    for (let i = 1; i < LEVELS.length; i++) if (Math.abs(LEVELS[i] - o) < Math.abs(b - o)) b = LEVELS[i];
    return b;
  };
  // (A vessel's tier follows from its level and flags (levelTier, pickTier): there is nothing to move when either changes.)
  function setLevel(x, l) { x.level = l; }
  function syncLift() {
    for (const x of EV) {
      // (The sinusoids cross nothing, so they stay on their tier: lifted, the tier below would redraw their junctions
      // as hard-edged patches.)
      // (A selected vessel stays in its own tier, so it joins its neighbours as every vessel does, and stands out of the dimmed
      // network along its course instead (tube texel 12), easing back into it toward its ends. Only the cava, one vessel to the
      // eye, is shown whole, and stays so while it eases back: selA. It is not drawn above the network for that: F_WHOLE, tube sync.)
      const on = IVC_EDGES.has(x.e.id) && (x.sel || vh.selA.get(x.e.id) > 0) && !SIN_EDGES.has(x.e.id);
      x.lifted = on;
    }
    // (Within the focus tier the portal tree stays in front (TIER_LIFT_FRONT), so a lifted collateral (paraumbilical) never draws over a
    // lifted portal vein.)
  }
  // Context veins are always translucent; collaterals start faint until the model says otherwise.
  for (const x of EV) if (!x.isArt) { if (CONTEXT_EDGES.has(x.e.id) && !IVC_EDGES.has(x.e.id)) setLevel(x, 0.6); else if (x.e.kind === 'collateral') setLevel(x, 0.3); }
  // Performance: every model frame (≈10 a second) would otherwise rewrite hundreds of SVG
  // attributes with values that differ only in the third decimal, and each write makes the
  // browser restyle and repaint the figure. Writes go through a per-element cache, pressures
  // used for color are rounded to 0.25 mmHg and widths to 0.25 px (well below what shows).
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return false; c[k] = v; el.setAttribute(k, v); return true; };   // (true: written)
  // (The same, checked against the element itself, for attributes other code writes too: the organs' each model update, and every
  // frame of a liver's or the fluid's ease, were written again with the values they had, and Safari repainted them each time.)
  const putA = (el, k, v) => { v = String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  // (2 Nov 2026, the iPhone trace of a slide change: every frame of a morph, a coil or a vessel's draw-on still rewrote the hidden SVG
  // model's shapes, the hit paths, halos, strands, gradients and the draw-on dashes, and the browser restyled and laid out the whole tree
  // each time, though none of it is painted while the GPU draws the vessels. Those writes are held while the GPU draws and written once,
  // in a pass between frames, when the shapes have held still for GEO_QUIET ms (hit-testing and the corner credit take them first, flushGeo).)
  const GEO_QUIET = 160;
  const geoHeld = new Map();
  let geoT = 0, geoPass = 0, geoAt = 0;
  const geoHolding = () => wrap.classList.contains('gl-on');
  /** An attribute (v null: removed) or, as 'style:<prop>', a style of the SVG model, held while the GPU draws it. */
  const styleProps = new Map();   // 'style:opacity' → 'opacity', and null for an attribute: cut once per name
  function styleProp(k) {
    let p = styleProps.get(k);
    if (p === undefined) { p = k.startsWith('style:') ? k.slice(6) : null; styleProps.set(k, p); }
    return p;
  }
  function setG(el, k, v, hold = geoHolding()) {
    if (hold) {
      let m = geoHeld.get(el);
      if (!m) geoHeld.set(el, (m = {}));
      m[k] = v;
      if (k.startsWith('style:')) setLive(el, k.slice(6), v);   // (the painters read it from here, live-style.js)
      // (One timer, kept: it looks at the time of the last held write when it fires and waits out what is left. A timer made again for each
      // write was dozens of timers a frame through a change between the views.)
      geoAt = performance.now();
      if (!geoT) geoT = stageScope.timer(geoQuiet, GEO_QUIET);
      return;
    }
    const m = geoHeld.get(el);
    if (m) delete m[k];
    putG(el, k, v);
  }
  function putG(el, k, v) {
    const p = styleProp(k);
    if (p !== null) { dropLive(el, p); if (el.style[p] !== v) el.style[p] = v; } else if (v == null) el.removeAttribute(k); else el.setAttribute(k, v);
  }
  function geoQuiet() {
    const left = GEO_QUIET - (performance.now() - geoAt);
    if (left > 4) { geoT = stageScope.timer(geoQuiet, left); return; }   // (written again since: wait out the rest of the quiet)
    geoT = 0;
    if (!geoPass) geoPass = restPass(flushGeoPass);
  }
  function flushGeoPass() { geoPass = 0; flushGeo(); }
  function flushGeo() {
    if (geoT) { stageScope.clear(geoT); geoT = 0; }
    for (const [el, m] of geoHeld) for (const k in m) putG(el, k, m[k]);
    geoHeld.clear();
  }
  // Colors follow the beat-filtered mean pressure (the scale shows mean venous pressure) in
  // 0.5 mmHg steps, so a vessel's gradient is not rewritten on every heartbeat; widths move in
  // 0.5 px steps once settled (below, with hysteresis), so tubes are not rebuilt either.
  const qP = (v) => Math.round(v * 2) / 2;
  // A vessel end's colour bin (0.5 mmHg) with hysteresis: it moves to a new bin only once the value is 0.4 mmHg from the one
  // shown, so a value breathing across a bin's edge no longer flickers the colour with every breath (round 2 review, B7).
  const colourBins = new Map();
  const qHold = (lens, k, end, v) => {
    let a = colourBins.get(lens);
    if (!a) { a = new Float64Array(EDGES.length * 2).fill(NaN); colourBins.set(lens, a); }
    const i = 2 * k + end, was = a[i];
    if (!(Math.abs(v - was) < 0.4)) a[i] = qP(v);
    return a[i];
  };

  // Nodes (circuit view): each station's dot, a disc in the stage's colour under a ring in the text's (1.6 wide, as the SVG's stroke was),
  // drawn by the GPU over the vessels with the outlines (olStep; 2 Nov 2026, no element). on: a vessel is drawn at it (updateNodesCircuit),
  // u: its fade toward that (stepMap, a surface step), as the vessels' views fade: it popped (P21).
  // (Each dot starts off, and comes in with the first vessel drawn at its station: none shows on the first frame before the model says
  // which vessels are drawn.)
  const ND_SEG = 32, ND_PER = 3 * ND_SEG + 2 * (ND_SEG + 1);   // (a disc's triangles, then its ring's strip)
  const nodeDots = NODES.filter((n) => n.kind !== 'wedge' && !HIDDEN_NODES.has(n.id)).map((n) => ({ id: n.id, r: dotRadius(n.kind), on: false, u: 0 }));
  const hasDot = new Set(nodeDots.map((d) => d.id));
  // (rmin: the least radius a dot keeps on screen, 4 px, in world units at the scale now, in quarter-octave steps: the dots are rebuilt only when it steps, refreshCTM.)
  const DOT_MIN_PX = 4, nd = { verts: new Float32Array(nodeDots.length * ND_PER * 6), rev: 0, at: -1, dirty: false, fill: [0, 0, 0], ring: [0, 0, 0], rmin: 0 };
  const ND_COS = Float32Array.from({ length: ND_SEG + 1 }, (_, k) => Math.cos((2 * Math.PI * k) / ND_SEG)), ND_SIN = Float32Array.from({ length: ND_SEG + 1 }, (_, k) => Math.sin((2 * Math.PI * k) / ND_SEG));
  // The dots' vertices where the morph has the stations at t, written in place (one array, sent again by its rev: nothing allocated).
  function nodeVerts(t) {
    const V = nd.verts;
    let o = 0;
    for (const d of nodeDots) {
      const [x, y] = nodePos(d.id, t), rr = Math.max(d.r, nd.rmin), rf = rr - 0.4;
      for (let k = 0; k < ND_SEG; k++) {
        V[o++] = x; V[o++] = y; V[o++] = 1; V[o++] = 0; V[o++] = 0; V[o++] = 1e4;
        V[o++] = x + rf * ND_COS[k]; V[o++] = y + rf * ND_SIN[k]; V[o++] = 1; V[o++] = 0; V[o++] = 0; V[o++] = 1e4;
        V[o++] = x + rf * ND_COS[k + 1]; V[o++] = y + rf * ND_SIN[k + 1]; V[o++] = 1; V[o++] = 0; V[o++] = 0; V[o++] = 1e4;
      }
      for (let k = 0; k <= ND_SEG; k++) {
        const c = ND_COS[k], sn = ND_SIN[k], px = x + rr * c, py = y + rr * sn;
        V[o++] = px; V[o++] = py; V[o++] = c; V[o++] = sn; V[o++] = 1; V[o++] = 0.8;
        V[o++] = px; V[o++] = py; V[o++] = c; V[o++] = sn; V[o++] = -1; V[o++] = 0.8;
      }
    }
    nd.at = t; nd.rev++; nd.dirty = true;
  }
  // The map's and the dots' colours from the theme (with the vessels' look: syncVeins), each read once per sync.
  let mapWake = false;
  const ZONE_BAND = ['--chart-pre-band', '--chart-liver-band', '--chart-post-band'];
  function syncMapInk(cs) {
    const d = cssColor8(cs.getPropertyValue('--map-dot').trim() || 'transparent');
    for (let i = 0; i < 4; i++) MAP.dot[i] = d[i];
    const tx = toRGB('var(--text)', cs), ac = toRGB('var(--accent)', cs), bg = toRGB('var(--stage-bg)', cs);
    for (let i = 0; i < 3; i++) MAP.fx[i] = ac[i];
    // (The tinted zones are the pressure profile's own bands, so the map and the ladder speak one zone language: before the liver, the liver, after it. V5.)
    for (let j = 0; j < 3; j++) { const z = cssColor8(cs.getPropertyValue(ZONE_BAND[j]).trim() || 'transparent'); for (let i = 0; i < 4; i++) MAP.zone[4 * j + i] = z[i]; }
    MAP.fx[3] = 0.09 * easeArrive(MAP.fxU);
    for (let i = 0; i < 3; i++) if (nd.fill[i] !== bg[i] || nd.ring[i] !== tx[i]) { nd.fill[i] = bg[i]; nd.ring[i] = tx[i]; nd.dirty = true; }
  }
  // The lit zone's fade (in on the arrive ease, out the same way) and each dot's (the move ease), a surface step each, on the frame's time.
  function stepMap(dt) {
    mapWake = false;
    const k = reduceMotion.matches ? 1 : (dt * 1000) / D_SURFACE, fxT = MAP.fxOn ? 1 : 0;
    if (MAP.fxU !== fxT) {
      MAP.fxU = fxT > MAP.fxU ? Math.min(1, MAP.fxU + k) : Math.max(0, MAP.fxU - k);
      MAP.fx[3] = 0.09 * easeArrive(MAP.fxU);
      veinsDirty = true;
    }
    for (let i = 0; i < nodeDots.length; i++) {
      const d = nodeDots[i], to = d.on ? 1 : 0;
      if (d.u !== to) { d.u = to > d.u ? Math.min(1, d.u + k) : Math.max(0, d.u - k); nd.dirty = true; }
    }
  }
  function mapEasing() {
    if (mapWake || nd.dirty || MAP.fxU !== (MAP.fxOn ? 1 : 0)) return true;
    for (let i = 0; i < nodeDots.length; i++) if (nodeDots[i].u !== (nodeDots[i].on ? 1 : 0)) return true;
    return false;
  }
  // Resistance of each liver compartment, per lobe (read out in the circuit's liver header).
  const liverR = {};
  for (const id of ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_L_LHV']) liverR[id] = { R: Infinity };

  // Overlays
  const ov = {
    clamps: s('g'), clampsOut: s('g'), thrombi: s('g'), stents: s('g'), venous: s('g'), plugs: s('g'), varices: s('g'), gvarices: s('g'),
    balloons: s('g'), bands: s('g'),
  };
  Object.values(ov).forEach((g) => gOver.append(g));
  // A slide's calipers (deck visuals V9) over the anatomy, and its brackets under the circuit (V25): ext-callouts.js, fxSync.
  const gFx = s('g', { class: 'fx-cal-g' }), gFxC = s('g', { class: 'fx-span-g circuit-only' });
  // (A clamp's "60 %" stands in its own groups at the top of the overlays, never among the shapes: words are not the figure's GPU
  // painter's, and as the lowest group they kept every overlay above them (stents, balloons, plugs) on SVG. 2 Nov 2026.)
  const clampW = s('g'), clampWOut = s('g');
  gOver.append(gFx, gFxC, clampWOut, clampW);
  // The caudate lobe and its veins (CAUDATE): only on a slide about it (11 Nov 2026), the lobe alone while a stent runs through it
  // (the DIPS) or a slide pins only the lobe (pinOrgans 'caudate-lobe'), eased in and out with the view (.caud.on, off in the circuit),
  // under the stents and other overlays. Each vein is a tapered tube (a wall, its lumen colored
  // from its pressures like the vessels, a sheen) that fades into the IVC's wall instead of ending on it.
  const caud = (() => {
    const [ax, ay] = CAUDATE.anchor, W = CAUDATE.wall;
    const g = s('g', { class: 'caud gone', style: `transform-origin:${ax}px ${ay}px` });
    let defsHtml = '<radialGradient id="caudDome"><stop offset="0" class="caud-d0"/><stop offset=".55" class="caud-d1"/><stop offset="1" class="caud-d2"/></radialGradient>'
      + `<linearGradient id="caudFade" gradientUnits="userSpaceOnUse" x1="${W - 3}" y1="0" x2="${W + 9}" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<mask id="caudMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#caudFade)"/></mask>`;
    // The lobe is drawn as the organs are (stage-organs.js): a soft dome, the tissue's own gradient and volume, a lit inner edge and the
    // one thin outline in the tissue's darker tone, all on one smooth curve (CAUDATE.outline). It carries the liver's three tones.
    const lobe = s('g', { class: 'caud-lobe tone-liver' });
    defsHtml += `<clipPath id="caudClip"><path d="${CAUDATE.outline}"/></clipPath>`;
    for (const [cx, cy, rx, ry, a] of CAUDATE.lobe) lobe.append(s('ellipse', { cx, cy, rx, ry, transform: `rotate(${a} ${cx} ${cy})`, fill: 'url(#caudDome)' }));
    lobe.append(s('path', { d: CAUDATE.outline, class: 'caud-fill', fill: 'url(#og-liver)' }), s('path', { d: CAUDATE.outline, class: 'caud-form', fill: 'url(#ogVol)' }),
      s('path', { d: CAUDATE.outline, class: 'org-rimlight', 'clip-path': 'url(#caudClip)', transform: 'translate(2 3)' }), s('path', { d: CAUDATE.outline, class: 'caud-line' }));
    const veinsG = s('g', { mask: 'url(#caudMask)', class: 'caud-veins' });
    CAUDATE.veins.forEach(([d, w], i) => {
      const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number), P0 = [n[0], n[1]], C = [n[2], n[3]], P1 = [n[4] + 8, n[5] - 2];   // (on into the cava, where it fades out)
      const bez = (t, j) => (1 - t) ** 2 * P0[j] + 2 * (1 - t) * t * C[j] + t * t * P1[j];   // (the curve's x (j 0) or y (j 1) at t)
      // Each vein comes up out of the lobe's own tissue (a mask that fades it in over its first 18 units, so it has no end to see) and takes
      // its caliber in a short run, then flares a little into the cava's wall.
      defsHtml += `<linearGradient id="caudmaskg${i}" gradientUnits="userSpaceOnUse" x1="${P0[0]}" y1="0" x2="${P0[0] + 18}" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>`
        + `<mask id="caudIn${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#caudmaskg${i})"/></mask>`;
      const tube = (pad) => {
        const L = [], R = [];
        for (let k = 0; k <= 20; k++) {
          const t = k / 20, tq = Math.min(1, t + 0.01), tr = Math.max(0, t - 0.01);
          const px = bez(t, 0), py = bez(t, 1), qy = bez(tq, 1), qx = bez(tq, 0), ry = bez(tr, 1), rx = bez(tr, 0);
          let nx = -(qy - ry), ny = qx - rx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          const h = (w / 2) * (0.4 + 0.6 * Math.min(1, t / 0.6)) * (1 + 0.35 * Math.max(0, (t - 0.7) / 0.3) ** 2) + pad;
          L.push([px + nx * h, py + ny * h]); R.push([px - nx * h, py - ny * h]);
        }
        return 'M' + [...L, ...R.reverse()].map((v) => v[0].toFixed(2) + ' ' + v[1].toFixed(2)).join(' L') + ' Z';
      };
      const vg = s('g', { mask: `url(#caudIn${i})` });
      vg.append(s('path', { d: tube(0.45), class: 'caud-wall' }), s('path', { d: tube(0), class: 'caud-lumen' }),
        s('path', { d: `M${bez(0.35, 0)} ${bez(0.35, 1)} Q ${C.join(' ')} ${P1.join(' ')}`, class: 'caud-sheen', 'stroke-width': (w * 0.22).toFixed(2) }));
      veinsG.append(vg);
    });
    g.insertAdjacentHTML('afterbegin', `<defs>${defsHtml}</defs>`);
    const lumens = [...veinsG.querySelectorAll('.caud-lumen')];
    g.append(lobe, veinsG);
    // Where the lobe was, and which way it grew (Mohammad's pick B, 11 Nov 2026): its normal outline dashed, and an arrow out of it at the top
    // and bottom. Not in the grown group (it stays at the normal size) and shown by the enlargement only: its opacity follows how far the
    // lobe has grown (sync), under the same on / gone / circuit rules as the lobe. No label on the dashed line.
    const gm = s('g', { class: 'caud caud-m gone' });   // (off until a slide pins the caudate: pinOrgans calls show only on a slide's arrival or exit, so a figure that opens with none must start off)
    const mk = s('g', { class: 'caud-mk', style: 'opacity:0' });
    mk.append(s('path', { d: CAUDATE.outline, class: 'caud-norm' }));
    for (const [x1, y1, x2, y2] of CAUDATE.arrows) {
      const a = Math.atan2(y2 - y1, x2 - x1), H = 5.5, q = (d) => `${(x2 - H * Math.cos(a + d)).toFixed(2)} ${(y2 - H * Math.sin(a + d)).toFixed(2)}`;
      mk.append(s('path', { d: `M${x1} ${y1} L ${x2} ${y2}`, class: 'caud-arw' }), s('path', { d: `M${x2} ${y2} L ${q(0.45)} L ${q(-0.45)} Z`, class: 'caud-arwh' }));
    }
    gm.append(mk);
    gOver.prepend(gm);
    gOver.prepend(g);
    let cols = '', grow = '', goneT = 0, growKq = NaN, markK = -1, pinVeins = true, stented = false;
    const lobeOnly = () => g.classList.toggle('lobe-only', !pinVeins || stented);
    return {
      // (Once faded out, hidden, its veins' mask is off (.gone): a hidden group's mask is still built on every repaint.)
      show(on, veins) {
        g.classList.toggle('on', !!on); gm.classList.toggle('on', !!on);
        if (on) { pinVeins = !!veins; lobeOnly(); }
        stageScope.clear(goneT);
        if (on) g.classList.remove('gone'); else goneT = stageScope.timer(() => g.classList.add('gone'), 760);
      },
      // A stent through the lobe (the DIPS) takes its short veins' place: the lobe is shown alone, as on the DIPS slides.
      stented(on) { if (on === stented) return; stented = on; lobeOnly(); },
      // Colored from the pressure they drain at (the IVC's: the lobe keeps its outflow); sized by its share of it.
      sync(c, kq) {
        if (c !== cols) { cols = c; for (const el of lumens) el.setAttribute('fill', c); }
        if (kq === growKq) return;   // (the same size gives the same text)
        growKq = kq;
        const mo = kq > 0.04 ? Math.round(kq * 100) / 100 : 0;   // (the marks come in as the lobe grows and are gone once it is back to size)
        if (mo !== markK) { markK = mo; mk.style.opacity = String(mo); }
        const v = `scale(${(1 + CAUDATE.grow[0] * kq).toFixed(3)}, ${(1 + CAUDATE.grow[1] * kq).toFixed(3)})`;
        if (v !== grow) { grow = v; g.style.transform = v; }
      },
    };
  })();
  const { SEL_FADE, dop, dopApply, dopGateOf, dpr, glow, noGlows, revShown, selAKey, setGlow, setGlowSrc, spot, spotOn, toneCol, vh } = createGlow({ ALL_EDGES, E, EI, geo, nextFrame }, live);
  // The glow and hover eases step at the display's rate, but the vessels are redrawn at the paced rate (animate): an
  // ease only marks the tubes stale, and the paced frame rebuilds and uploads them once.
  let glowSync = false, themeSnap = false;   // (themeSnap: a new look is on the vessels' colours, which take it at once, not by their ease)
  let slideGlow = [], glowSetAt = 0;   // (the slide's glows as set, and when: a glowSeq slide's step numbers follow them, V10)

  // ── View transform (pan / zoom) ───────────────────
  let vt = { k: 1, x: 0, y: 0 };
  // The ONE writer of the camera (S6.6): whoever moves the view drops the transform in the same breath, so the labels and the figure never read
  // a transform made for another view. Every part writes `live.vt = ...`; nothing else assigns vt.
  function writeVT(v) { vt = v; CTM = null; }
  // (How long the change between Anatomy and Circuit takes, VIEW_CHANGE_S: view-xf.js, which the presenter's waits read too.)
  let morph = store.get().view === 'circuit' ? 1 : 0, morphTarget = morph, lastMorph = -1;
  // The change's clock is a reversible one (motion.js createReversible): tapped back mid-change, the figure and its camera slow over D_FLIP
  // and come back, they do not flip from full speed forward to full speed backward in one frame. With Reduce Motion the change takes
  // REDUCED_MOVE_MS (the camera's short form, docs/ACCESSIBILITY.md), still a crossfade-and-move.
  const viewClock = createReversible({ ms: VIEW_CHANGE_S * 1000, x: morph });
  const viewMs = () => (reduceMotion.matches ? REDUCED_MOVE_MS : VIEW_CHANGE_S * 1000);
  // The circuit can be turned a quarter turn counter-clockwise, so its flow runs bottom to top and
  // the map is tall instead of wide: it fills a phone held upright. rotU is the (animated) turn,
  // 0 to 1; the anatomy is never turned. The turn is part of the world transform and of the view
  // box (which swaps its width and height with it), so pan, zoom and every screen-space layer
  // keep working in the frame they already use.
  // With no saved choice, a phone or tablet held upright opens the circuit upright (the wide map would be a strip).
  const portraitPhone = () => matchMedia(UPRIGHT_MQ).matches;   // (the style sheet's upright clause, util.js)
  let rotTarget = (() => { try { const v = localStorage.getItem('pps.circuitRot'); return v == null ? (portraitPhone() ? 1 : 0) : v === '1' ? 1 : 0; } catch { return portraitPhone() ? 1 : 0; } })();
  let rotU = rotTarget;
  const turnClock = createReversible({ ms: TURN_MS, x: rotU });   // (the quarter turn's clock: reversible like the change's)
  const rotEase = easeMove;   // (the turn travels: the one move curve)
  const CIRC_C = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];
  const VB_CIRC_R = [CIRC_C[0] - VB_CIRC[3] / 2, CIRC_C[1] - VB_CIRC[2] / 2, VB_CIRC[3], VB_CIRC[2]];
  // Degrees the world is turned by: only once the circuit has landed; mid-change the circuit's side lies turned instead (circ-turn.js: no spin).
  const rotDeg = () => (lastMorph >= 1 ? -90 * rotEase(rotU) : -0), { cbAt, circTurn, circTurnPt } = createCircTurn(CIRC_C, rotEase, () => rotU);
  // The circuit's map turns upright with the turn alone, never with the morph (it only fades in): its turn from the world's, which the GPU
  // undoes about the same centre (veins-gl.js mapAt). (Turned with the vessels, the grid and its bands swung through 90 degrees on every
  // switch between the views on an upright circuit.)
  function mapTurn(deg) {
    const a = ((deg + 90 * rotEase(rotU)) * Math.PI) / 180, R = MAP.rot;
    R[0] = Math.cos(a); R[1] = Math.sin(a); R[2] = CIRC_C[0]; R[3] = CIRC_C[1];
  }
  let lz = null;   // the lobule view's layer (built when its code has arrived: lobuleReady)
  let lzCode = null, lzLoad = null, lzWaiting = false, lzSoon = false, aimWait = null;
  let geometryVersion = 0;
  let pickVer = 0;   // (bumped when a view lands or a vessel's hit width moves a step: vesselShapes, the corner credit's vessels)
  let edgeRev = 0;   // (R04: bumped when a vessel shows or hides, turns to a ghost, or its label width moves a step: labelSig)
  let netBox = null, netBoxFor = -1;
  // (The drawn network's extent in world units, from the vessels' own courses: each vessel shown in front of the organs, its strands and its
  // drawn trunks.)
  function netBoxNow() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (P) => { if (P) for (const q of P) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } };
    for (const x of EV) {
      if (!x.vis || x.back) continue;
      add(geo[x.e.id]?.cur);
      if (morph < 0.5) for (const sd of x.strands || []) if ((sd.live ?? 1) >= 0.5) add(sd.cur);
      for (const fd of x.feeders || []) if (!fd.fan) add(fd.cur);
    }
    return x1 >= x0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }
  // Everything drawn in screen space (labels, leaders, organ names, the flow marks, the action
  // card) follows the artwork on the very next frame of a pan or zoom, not on the next model
  // update: a view change schedules one coalesced sync per animation frame.
  let viewRaf = 0, viewVersion = 0, CTM = null, wrapRect = null;
  let organMorphA = 1, organDimA = 1;   // the organs' fade with the morph and their dim (syncOrganDim), as the groups' opacity
  let drawOnce = false;   // draw the vessels once through the dive's freeze: the camera moved while hidden
  let stageWake = () => {};   // set once the frame loop exists: anything that may need a redraw calls it
  let resizeReady = false, forceDraw = false;   // forceDraw: the vessel canvas was just resized (and so cleared): the next frame draws it at once
  let glM = null;   // the world → stage transform (CSS px) the vessels were last drawn in (for the tests; and res-fade's follow)
  let moveLow = false;   // Figure resolution › While moving: the canvas is at its moving share until the view settles (see settleRes)
  let clampFs = '', clampSw = '', clampBase = 12, haloK = '';
  const clampGs = [ov.clamps, ov.clampsOut, clampW, clampWOut];   // (the groups that take the clamps' sizes)
  const haloEls = [gGuides];   // (the groups that take --halo-k: the halos' joins once it is built)   // clampBase: the "60 %"'s size on screen (clampFontAt: the labels' own name size)
  // A narrowing's label stands level on screen whatever the figure's turn, at the spot the layout chose for it (clampLabelAt: the
  // column's side, a spot off the probe) or, where it chose none, just clear of its clamp on the vessel's side, at the labels' name size
  // (a turned "60 %" had stood on end across the right atrium in the circuit). Every rebuild of the marks and every change of zoom
  // places it again by that one rule, so neither undoes the spot the layout gave it: the "60 %" had gone back to the vessel's side
  // under the stent's callouts after a redraw.
  function placeClampLabels() {
    for (const t of clampW.querySelectorAll('.clamp-label')) clampLabelAt(t);
  }
    let zoomBase = null;   // (the camera zoomed with a card: zoomOpen)
    // The figure's screen transform, computed from the viewBox, the zoom state and the stage box.
  // Asking the browser (getScreenCTM / getBoundingClientRect) right after the SVG has been
  // updated forces a synchronous style + layout pass over thousands of elements, every frame;
  // the arithmetic is exact and free. The stage box is cached and kept current by observers.
  let box = null, boxKept = null;   // (boxKept: the last box measured, handed out while a new one is being read)
    // Fit shows the whole figure. On a narrow screen the circuit opens as a close-up of the portal vein
  // and liver (see defaultVT), which is not a fit: there Fit shows the entire map, and tapping it
  // again returns to the close-up, so the button always does something visible.
  // Whether the view is a fit (Fit, a refit for the cards, the anatomy's home framing) rather than one the learner zoomed or
  // panned: a pinch, a drag, the wheel or a zoom step clears it. The tools' own camera trips (the HVPG catheter's route and
  // close-up, there and back) leave it as it was, so a card closed after a measurement still fits (see closeView).
  let fitted = false;
    // Whether the learner's own hand (a pinch, a drag, the wheel, a zoom step) placed the view since the camera last framed it: a talk's
  // refit for a card that changed size leaves such a view alone (presenter reframe, handMoved). A slide's framing, Fit, a view switch
  // or a turn of the device clears it. (`fitted` cannot say: a slide's own box framing clears that too.)
  let handed = false;
    let lobuleOn = false, lobU = 0, lobAnim = 0;
    // Into the lobule, a dive (2.2 s): one continuous zoom from a spot in the liver, gentle at both ends.
  // The anatomy is magnified as it stands (a compositor transform: nothing is redrawn); a field of
  // lobules blooms out from that spot over it, first a fine grain about as large as real lobules are in a liver that size
  // (Mohammad, 24 Oct: "we should be zooming quite a bit more to get to the lobule level"), then simple lobules, then defined
  // ones as they grow (the field's tile sizes, blended on the GPU: field-gl.js); the zoom goes on through them and
  // settles onto one, where the lobule's tissue fades in, in place, and then its labels and card.
  // Out, the same in reverse, quicker. (About four times the zoom of the 1.6 s dive before, so a little longer: on a log scale
  // its pace is about the same.)
  // The anatomy's own framing is never touched. diveT is the dive's clock, 0 (anatomy) to 1 (lobule).
  let diveAt = null, diveLand = null, diveT = 0, diveOut = false;
    let vtAnim = 0, vtGliding = false;
    let vtTarget = null;   // where the last animated move was headed
    // ── Frame state ───────────────────────────────────
  let F = null;            // latest frame
    // The anatomy opens fitted to everything it draws, once the first frame has drawn it; a view the
  // learner has already zoomed or panned is left alone.
  // Every zoom out of the anatomy (the first frame, Fit, back from the circuit) goes to the same home
  // framing, measured from what is drawn. While the view is still at home it follows what is drawn:
  // when ascites fills the pelvis or the spleen grows, home grows with it and the view follows.
  let firstFit = false, homeAt = null, homeCheck = 0, userMoved = false;
    // Layout runs only when one of its inputs changed: the camera and stage box (the CTM), the label
  // signature (geometry, widths, selection, layers, levels...), the morph and turn, the floating panels,
  // fonts, theme and the presenter's insets. Otherwise the last layout stands, and only the live values
  // are refreshed in place (see refreshValues); a value whose text changes shape lays the labels out again.
  let labelKey = null, labelFonts = 0, labelShown = [], noChevBoxes = [], labelPainted = false;   // labelPainted: the last updateLabels painted the callouts and probes
  const { ANCHOR_W, NO_ANCHOR, animZoomAt, applyClampFs, applyVT, clientToVB, clientToWorld, flushVT, freeCentre, localToWorldInto, refreshCTM, saSides, stageBox, syncView, worldToLocal, worldToLocalInto, zoomAt } = createCamera({ CIRC_C, DOT_MIN_PX, animateVT, clampGs, clientToVBFast, flushGeo, geoHeld, haloEls, mapTurn, nd, nextFrame, nodeVerts, onViewChange, placeClampLabels, readFrame, rotDeg, safeInsets, sitesPaint, svg, syncSemantic, updateLabels, vbBox, world, wrap }, live);
    let fitKept = 0;
    let circFit = null;
    // The Tests card opening leaves the camera where it is (Mohammad, 20 Oct): the pan and zoom stay as they were, under the card too.
  // keepView(true) is called as the card opens and notes the space the other pieces leave (the card itself not counted); the
  // refits that follow the card (the open's, the sheet settling, a tool's card changing height) and the home framing's own
  // look then leave the view alone for as long as only the Tests card has changed that space. Another card coming or going,
  // a turn of the device or a resize changes it, and the framing follows as ever; so do the Fit button and a slide's own
  // framing (not kept while presenting).
  let keptSpace = null;
    // A card or sheet opened or closed: glide to the framing for the space that is now free (not in the lobule, which refits itself).
  // (circAgain: lookHome has it take the circuit's last kind of framing again, for a new shape, instead of the close-up.)
  let circAgain = false;
    // Turn the circuit upright (flow bottom to top) or back to wide. Shown whole, it stays whole (fitted
  // to the new shape); zoomed in, it keeps the zoom and turns about the point at the middle of the
  // free space, which stays where it is on screen.
  let rotHold = null;
    let rotWhole = null, rotGlide = null;
  const { cardSpace, cardSpaceRead, circAt, circVB, circWhole, closeView, defaultVT, fit, flag, holdView, keptNow, markCirc, refit, reveal, rotStep, safeInsets: safeInsets$, sameView, setCircuitRotated, snapFresh, spaceSig, unreveal, unseenCard } = createFit({ CIRC_C, EV, VB_CIRC_R, anchorFor, animateVT, applyVT, clientToWorld, driftEnd, gAscites, gBackdrop, gOrgans, geo, gutKids, readFrame, refreshCTM, rotDeg, rotEase, setViewBox, stageBox, svg, vbBox, watch, wrap }, live);
  function safeInsets(...a) { return safeInsets$(...a); }   // <stage-split stub>




  // ── Semantic zoom: abdomen → liver → lobule ───────
  // Zooming (wheel, pinch, buttons) only moves the camera: past ×1.9 over the liver its inner
  // trees open (see liverExpanded) and a trail in the corner names the level. The lobule is
  // never entered by zooming alone; it opens only when asked for (the trail's Lobule step, the
  // liver's card, the palette, a presenter step) and cross-fades over the plate.
  let liverBB = null;
  const liverBBox = { x: 0, y: 0, w: 0, h: 0 };   // (liverBB's box, written in place once)
  const { anatCovered, camShowTo_, diveFrame, figDip, prepRise, pushCam, riseReady, setDiveScale, setLobule } = createDive({ applyVT, defaultVT, drawFrame, drawVeins, driftEnd, liverBox, lobuleBackstop, lobuleStep, nextFrame, refreshCTM, riseVT, sameView, spleenMoving, svg, syncSemantic, update, updateLabels, vCanvas, worldToLocal, wrap }, live);
  let diveZ = 0;   // the dive's zoom so far (log scale), kept for cameraZoom
  let riseLine = false, riseFast = false, zShift = 0;   // (zShift: for cameraZoom, the plate's zoom is reset unseen when the rise begins)
  // The elements' offsets are read once per dive, before any write: read between writes, each would
  // make the browser lay the page out again, every frame.
  let diveOrig = null, diveHid = false, labHid = false;
  // The field fades in over the anatomy, which stays whole beneath it and is hidden only once the field covers it, so nothing pops out
  // of or into view at either end of the zoom and the page never shows through between them (see diveFrame). Opacity on layers the zoom already composites costs nothing per frame;
  // their usual .25s opacity transition is held off while it is driven frame by frame (and eases the anatomy back in under the landed lobule).
  let diveFadeO = null;
  // The figure's canvas is moved and faded by its renderer's final present (veins-gl setCamera), not by CSS on the canvas: a CSS scale or
  // opacity takes the cards' glass drawn in it along, and the glass goes solid for the ease, the fade and the dive. the dive record (scene-cam.js, camOx/camOy its fixed point): the
  // dive's zoom and its origin (CSS px from the canvas's corner); camDive/camShow: the dive's hide and the figure's own fade-in, each 0 to 1.
  let lobIn = false;   // (the lobule is landed and drawn in this renderer's context: the figure's alpha is 0 under it)
  let camOx = 0, camOy = 0, camDive = 1, camShow = 1, camShowRaf = 0, camShowT0 = 0, camShowFrom = 1, camShowTo = 1;
  // Before the way out of a landed lobule (prepRise, asked for by the presenter as the slide changes): the anatomy under it, still
  // covered, follows the model again and its organs' picture is made for the patient now, so the rise fades in a current picture.
  // (Left as it was under the lobule, the picture held the patient from before the dive: shown through the rise and swapped at
  // landing, the organs changed in one frame; dropped as the rise began, the live drawing showed, scaled up by the zoom, and
  // Safari lost its masked groups, the stomach and gut, until partway down: Mohammad, 20 Oct, HVPG 7 to 8.)
  let risePrep = false, risePrepT = 0;
  // (diveWait: a dive waiting for its tissue to be painted ahead, which goes on only if nothing else was asked for meanwhile.)
  let diveWait = 0, diveGen = 0;
  // (The glide in and out of the lobule, one at a time: a new one cancels the frame and the backstop of the last, so its state is kept
  // here, in the variables below, and one function steps it, instead of a closure made for each.)
  // (The dive's progress, diveT, runs on a reversible clock: a reversal mid-way slows over D_FLIP and returns, it does not stop dead and start
  // again from rest; the dive's own curves (stage-dive.js diveFrame) are functions of the position, so they follow without a kink.)
  let lobOn = false, lobTo = 0, lobMs = 0, lobSeen = -1;
  const diveClock = createReversible({ ms: DIVE_FULL_MS });
  const lobulePoke = () => { if (lobuleOn && lz.isOpen()) platePoke(); };
  const lobuleRasterSoon = () => afterMotion(lobulePoke);
  function lobuleStep(now, end = false) {
    const on = lobOn, to = lobTo, ms = lobMs;
    diveClock.sync(diveT);   // (diveT is also written outside this clock: the lobule closed by the circuit, a reset)
    if (ms > 0 && !end) { diveClock.aim(to, ms); } else diveClock.set(to);
    const e = ms > 0 && !end ? diveClock.tick(easeNow()) : to;
    const wasDiving = diveT > 0;
    diveT = e;
    if (wasDiving !== diveT > 0) for (const g of cardGLs) g.redraw();   // (the cards' glass: drawn in the figure's canvas, or only leaving its place out of the labels, the dive's turn)
    // A frame that throws must not leave the anatomy stuck mid-zoom: the glide always goes on to its end.
    try { diveFrame(diveT); } catch (err) { if (e < 1) console.error(err); }
    if (e !== to) lobAnim = nextFrame(lobuleStep);
    // the anatomy's raster, held back during the dive, catches up under the lobule (once the slide's cards have come in: frame.js holdMotion)
    else if (on) stageScope.timer(lobuleRasterSoon, 600);
    else if (!on) {
      setDiveScale(1); lz.setDiveZoom(1, 0, 0); diveLand = null;
      platePoke();   // (held through the rise: the organs' picture for the state it landed on, if it changed on the way)
      zShift = 0;
      // Out of the lobule the anatomy always ends on its full fit, not where the dive began (often the liver close-up).
      // (Already taken to its fit when the way out began; measuring it again here read the floating pieces mid-change and sent the view down, then back.)
      if (riseUsed) riseUsed = false;   // (the rise already landed on the slide's own framing)
      else if (morphTarget === 0) { if (liverBox() && sameView(vt, homeAt || vt)) homeAt = { ...vt }; else riseFitAsk ||= readFrame(riseFitRead); }   // (its fit read first in the next frame)
    }
  }
  function lobuleBackstop() {
    if (lobuleOn !== lobOn || diveT === lobTo) return;
    if (diveT !== lobSeen) { lobSeen = diveT; lobEnd = stageScope.timer(lobuleBackstop, 1000); return; }
    cancelFrame(lobAnim); lobuleStep(0, true);
  }
  let lobEnd = 0;
  function liverBox() {
    if (!liverBB && organEls.liver) { const b = elBoxInto(organEls.liver, EBOX); if (b?.width) { liverBBox.x = b.x; liverBBox.y = b.y; liverBBox.w = b.width; liverBBox.h = b.height; liverBB = liverBBox; } }   // (in script: elBox)
    return liverBB;
  }
  function vbCenter() { const b = vbBox; return [b.x + b.width / 2, b.y + b.height / 2]; }
  function syncSemantic() {
    if (!lz) return;
    // Turning to the circuit closes the lobule view.
    if (lobuleOn && morphTarget !== 0) { lobuleOn = false; lobU = 0; diveT = 0; diveLand = null; lz.setDive(null); lz.setDiveZoom(1, 0, 0); if (diveAt) setDiveScale(1); { const lab = wrap.querySelector('#labels'); if (lab) lab.style.opacity = ''; labelGL?.check(); } cancelFrame(lobAnim); if (store.get().lobule) store.setSoon(LOBULE_OFF); }
    else if (diveWait && morphTarget !== 0) { diveWait = 0; diveGen++; if (store.get().lobule) store.setSoon(LOBULE_OFF); }   // (a dive still waiting for its paint is called off, and the store stops saying lobule on the circuit: implicit-state-machines M5)
    const u = morphTarget === 0 ? lobU : 0;
    const wasOpen = lz.isOpen();
    lz.setFade(u);
    if (wasOpen && !lz.isOpen() && F && !inUpdate) update(F);
    wrap.classList.toggle('in-lobule', u > 0.98);
    if (lobIn !== (u > 0.98 && !!lz?.shared)) { lobIn = !lobIn; pushCam(); }
  }
  let vtUntil = 0, vtMs = 0;   // (the glide under way: when it lands and how long it runs in all, for the presenter's cards: glideLeft)
  const vtTrack = createGlideTracker();   // (the last frames of a plain glide: its speed per ms, so another begun on it carries that on, ease.js)
  const camMoves = [], logMove = (m) => { camMoves.push(m); if (camMoves.length > 60) camMoves.shift(); };   // every glide of the camera (and dive), kept for the tests: a way into or out of the lobule is a single move
  // A presenter's camera move: the labels ease out as it starts, are not laid out while it runs, and ease
  // back in at their new places once it settles (they never slide across the figure).
  let camMove = false;
  // The change between the views, labels and camera on its one clock (view-switch-labels-recs.md, option B2). At the tap the new view's labels are
  // solved for where the change lands (solveTargetView) and the labels standing become ghosts (label-gl.js freezeGhosts); the figure's own progress p
  // then runs everything: the camera is lerped from its framing to the target's by p, the ghosts ride their points at 1 - 2p and the new labels
  // theirs at 2p - 1. Nothing is solved or built as it lands; the pictures of the new view are built in the frames of the change.
  let viewXf = null, glSuppress = false, xfOp = '';
  const { glideXfEnd, glideXfStart, glideXfStep, morphAnchorAt, pre, preAbort, preAsk, preRun, viewXfP, viewXfRetargetTo, viewXfStart, viewXfStep, xfMarkCurrent, xfRelease } = createView({ CIRC_C, EV, VB_CIRC_R, applyVT, circTurn, circWhole, defaultVT, driftEnd, edgeVisible, endWidth, geo, handRideEnd, labelJobDrop, labelJobStep, labelKeyNow, labelSig, labelSliceRun, labelTail, layoutLabels, layoutLabelsGen, refreshCTM, rotEase, sameView, sitesPaint, stageBox, updateLabels, vbBox, vesselAt, visAt, worldToLocalInto }, live);
  // The solve is a job sliced over the change's frames: one short slice in the tap's own frame (xfSolving shortens updateLabels' first slice), then one
  // per frame of the morph (viewXfStep), the rest at the landing if it comes first. The new labels stay at nothing until it lands.
  let xfSolving = false;
  // (The change landed before the new view's labels were solved: they stay at nothing until the solve lands, never the old view's labels on the new figure.)
  let xfHold = false;
  // (A layout owed to the page's leaders and dots: one asked for found no blank to take, and the next layout makes them, whenever it comes (stage-label-layer.js leadTop).)
  let leadOwed = false;
  // (Whether the view is moving now: a glide, a pan, a pinch, a wheel zoom or a fling. Boxes kept for the frame's reads are not read again while it is.)
  const MOVING_SRC = { glide: () => vtGliding, cam: () => camMove, view: () => !!viewXf, hand: () => live.gestureOn(), panning: () => wrap.classList.contains('panning') };
  const viewMoving = () => viewMovingOf(MOVING_SRC);   // (view-moving.js: every motion source feeds the one answer)
  // A slow push (opt.drift: a time-lapse's lapse.cam) is not a move of that kind: the labels stay up and ride with the figure, each kept
  // on its side as a hand's zoom keeps them (updateLabels), and are solved again for where it stopped once it lands, gliding there.
  let drifting = false;
    // A card's zoom (zoomOpen) carries the labels that have no world anchor by the scene camera's ride (label-gl.js ride). Every other camera move (a hand, a glide, a slow push, a presenter's move) rides nothing: the labels are pose-driven (updateLabels, labels-plan.md).
  let labelRider = null, rideCTM = null;
    // opt.arc: a presenter's framing. A long move (the two views share nothing) pulls back and comes in rather than panning across at full zoom.
  // The view following a presenter's card frame by frame (Mohammad, 30 Oct, iPhone: "The view still snaps/jumps when I untuck a stacked
  // card"): as the readings' card slides out or tucks away, under the finger or on its own ease, the view is set each frame between the
  // framing for the readings tucked (v0) and the framing for them out (v1), at the same share u the card has travelled. The figure then
  // moves with the card, never after it: a glide begun as the card came to rest, or even as it began, was a second move beside the card's,
  // and a finger's pull slid the card over a figure that only moved once it was let go. The labels ride with it as they do with a slow
  // push (drifting) and are solved again once it ends (followEnd, driftEnd). Any glide or framing set outright ends it (animateVT).
  // aimView: where a framing would go, without moving: the camera functions run with animateVT only noting its target.
  let following = false, follow0 = null, follow1 = null, aiming = false, aimed = null, followScene = false, followU = 0;
  const { aimView, arcRoom, camSettle, camSettleIdle, driftEnd: driftEnd$, followAt, followStart, rideLeaders, rideNow, rideStart, rideStep, rideStop, stagePx, stagePxInto, stagePxNow, viewNow } = createRide({ applyVT, dpr, labelSettleSoon, refreshCTM, sameView, sceneSet, sceneStart, sitesPaint, stageBox, updateLabels, vCanvas, vbBox, wrap }, live);
  function driftEnd(...a) { return driftEnd$(...a); }   // <stage-split stub>
  let handRide = false, handRideT = 0, layCTM = null;   // (handRide: the labels are held while the camera moves, see updateLabels; layCTM: the camera they were last laid out under)
  // The arc a presenter's long move is taking (see cam-arc.js), so a refit while it runs bends it to the new framing instead of starting over.
  let arcRun = null;
  // The camera zoomed with a card (card-zoom.js, 4 Nov 2026, "zoom the entire camera"): the whole view is scaled by S about the screen point (px, py)
  // and then moved by (dx, dy) screen px, the same transform the zoomed cards are given, so the figure, the liver and the labels' places ride with them.
  // zoomOpen takes the view as it stands (null: it is not at rest, nothing is zoomed); zoomAt is one frame of it, written as the view (k, x, y), one
  // transform, no glide of its own; zoomEnd gives the view up (the card has gone back, the view is the one it began at) and the labels are solved again.
  // (The figure's camera is not moved by the card zoom any more, 4 Nov 2026, card-zoom-plan.md: the view (vt), the label solves and the
  // cards' room stay as they rest, and one scene camera (scene-cam.js, written by card-zoom.js each frame) is read by every layer in the same
  // frame: the figure's canvas lays its picture through it (veins-gl setScene), a station label is drawn at C(its point) plus its own offset
  // (pinTo), a label with no station is carried by its centre (label-gl ride), and the page's figure layers take one CSS matrix. The labels
  // keep their screen size. Closing is C back to the identity: nothing is laid out, so nothing settles.)
  let zoomLz = false, zoomM = null, zoomLayers = null;
    let drawCam = null;   // (a card's zoom landed: the figure's layer drawn for C·view, see zoomSharp; null: drawn for the view, carried by the camera)
    let vdpr = 1, vBase = 1, boxW = -1, boxH = -1;   // (vBase: the canvas's pixels per CSS pixel at Full)
    let labelGL = null, labelPassOff = null;
  const { cardZoomAt, followEnd, sceneSet: sceneSet$, sceneStart: sceneStart$, zoomEnd, zoomOpen, zoomSharp } = createZoom({ applyVT, drawVeins, driftEnd, flushVT, refreshCTM, rideNow, rideStart, rideStop, svg, vCanvas, viewNow, wrap }, live);
  function sceneStart(...a) { return sceneStart$(...a); }   // <stage-split stub>
  function sceneSet(...a) { return sceneSet$(...a); }   // <stage-split stub>
    // The presenter's camera: glide so a box of the plate (world units) fills the space the floating
  // pieces leave, as Fit does for the whole plate, zoomed in no further than kMax.
  // (clear: the box goes entirely into the band the cards leave, however thin: it may zoom out past the usual floor for it.)
  // The camera that frames a box of the plate (world units) in the space the floating pieces leave.
  // While presenting, the presenter names the free area (freeArea: the open rectangles the words, the data card where it
  // comes to rest and the controls leave), and the box is centred in whichever of them shows it largest.
  let freeArea = null, lastFree = null;
    // Where the way out of the lobule lands when the next slide frames somewhere other than the fit: the rise itself
  // zooms straight to that framing, so there is no stop at the fit on the way. The box is asked for when the rise
  // begins (the plate is brought up to date first, so it is measured as it will be). It expires if the lobule was not open to rise from.
  let riseBox = null, riseExp = 0, riseUsed = false;
  const { animateVT: animateVT$, frameBox, riseTo, riseVT: riseVT$, vtFor, zoomToBox } = createGlide({ CIRC_C, applyVT, arcRoom, camSettle, camSettleIdle, circVB, dpr, driftEnd, glideXfStart, glideXfStep, logMove, nextFrame, refreshCTM, rideStep, safeInsets, sameView, sitesPaint, svg, vbCenter, vtTrack, viewXfRetargetTo }, live);
  function animateVT(...a) { return animateVT$(...a); }   // <stage-split stub>
  function riseVT(...a) { return riseVT$(...a); }   // <stage-split stub>
  function zoomLiver() {
    if (store.get().lobule) store.set1('lobule', false);
    const lb = liverBox(); if (!lb) return;
    fitted = false;
    const b = vbBox;
    animateVT(vtFor(lb.x + lb.w / 2, lb.y + lb.h / 2, clamp(Math.min(b.width / lb.w, b.height / lb.h) * 0.92, 2, 3)));
  }
  // The lobule is a view of its own (Anatomy · Circuit · Lobule): it opens over the figure and closes
  // only from the view switch, never by zooming out. The anatomy underneath keeps its framing.
  function openLobule(tries = 0) {
    if (morphTarget !== 0 && store.get().view !== 'anatomic') store.set1('view', 'anatomic');   // (setViewKey has put it there already)
    // The lobule's code loads after the first paint (lobuleReady): a dive asked for before it is there goes on once it is.
    if (!lz) {
      if (!lzWaiting) {
        lzWaiting = true;
        lobuleReady().then(lobuleArrived, lobuleNotArrived);
      }
      return;
    }
    // Right after loading the liver may not be laid out yet: try again shortly.
    // From the circuit, ease into the anatomy first, then dive.
    // (Asked again for as long as the lobule is wanted and the way is not clear, one timer at a time, slower after a few seconds: it used to give up
    // after forty tries, 4.8 s, and a circuit's slow turn back to the anatomy (software GL, a few frames a second) outlasted that, leaving the lobule
    // wanted in the store and never opened.)
    stageScope.clear(lobuleRetryT);
    if (!liverBox() || morphTarget !== 0 || morph > 0.02) { lobuleRetryT = stageScope.timer(lobuleRetry, tries < 40 ? 120 : 400, tries + 1); return; }
    // The anatomy's card (the liver's, usually) would sit over the lobule: the lobule's parts have their own.
    if (store.get().selection && store.get().selection.type !== 'lobule') store.set1('selection', null);
    setLobule(true);
  }
  let lobuleRetryT = 0;
  let plateWant = null;   // (the plate's lobule window asked for, kept for the lobule's code that has not arrived: plateLobule)
  function lobuleRetry(tries) { if (store.get().lobule) openLobule(tries); }   // (the count rides on the timer: no closure carries it)
  const lobuleArrived = () => { lzWaiting = false; if (store.get().lobule) openLobule(); };
  const LOBULE_OFF_BOTH = { lobule: false, sinusoid: false }, LOBULE_OFF = { lobule: false };   // (patches the store reads and does not keep)
  const lobuleNotArrived = (err) => { lzWaiting = false; loadFailed(err); store.set(LOBULE_OFF_BOTH); };
  function closeLobule() { stageScope.clear(lobuleRetryT); setLobule(false); }
  store.on('lobule', (on) => (on ? openLobule() : closeLobule()));
  const zoomLobule = () => { if (!store.get().lobule) setViewKey('lobule'); };
  // The lobule's layer (the zoom, the sinusoid view under it) is built when its code has arrived, which the stage asks for once the
  // figure is on screen and the page has a moment (prepLobule), or at once when a dive is asked for. It takes the place in the page it
  // always had (the anchor), so the layers stack as they did, and reads the frame and the store as they stand. What a presenter slide
  // asked of it before then (lobuleAim) is kept for it.
  const lzAnchor = document.createComment('lobule');
  wrap.append(lzAnchor);
  // (The code is fetched as soon as the figure is shown; the layer is built a moment later, when the page is quiet, or at once for a dive.)
  const lobuleCodeLost = (err) => { lzCode = null; throw err; };
  const lobuleCode = () => (lzCode ||= import('./lobule-zoom.js').catch(lobuleCodeLost));
  const lzBinAway = (tubes, joins) => sweepBin({ kind: 'bin', tubes, joins });
  const lzOptions = { host: wrap, styles: wrapCS, before: lzAnchor, binAway: lzBinAway, figure: () => (veins && !veins.lost ? veins.top : null) };   // (figure: the lobule is drawn in this renderer's context, lobule-zoom.js ensureGL)
  const lobuleBuilt = ({ createLobuleZoom }) => {
    lz = createLobuleZoom(lzOptions);
    if (aimWait) { lz.aim(aimWait[0], aimWait[1]); aimWait = null; }
    if (F) lz.update(F);
    return lz;
  };
  const lobuleLoadLost = (err) => { lzLoad = null; throw err; };
  function lobuleReady() {
    return (lzLoad ||= lobuleCode().then(lobuleBuilt, lobuleLoadLost));
  }

  // ── Detail ────────────────────────────────────────
  // Detail: the moving blood is drawn on every frame the screen offers (fps 0: 60, 120 or more a second; a frame of it
  // only re-composites the vessel cells) at full resolution, whatever the device, the zoom or the frame time: the figure
  // never steps itself down (the owner, 15 Oct: "0 drop in quality", "120hz persistently"). Only two steps lower it, each
  // explicit: Settings › Battery saver (15 a second at 0.6 of the pixels), and a software renderer (WebGL drawn on the
  // CPU, no usable GPU: 8 a second at half the pixels), where every frame costs CPU the rest of the page needs.
  // (Levels a device once stepped down to were stored under 'pps.quality' and 'pps.q', and an old low one stuck, also on
  // the live site, which shares this origin: both are dropped.)
  const QUALITY = [{ fps: 0, res: 1 }, { fps: 15, res: 0.6 }, { fps: 8, res: 0.5 }], Q_SAVER = 1, Q_SOFTWARE = 2;
  const paceOf = (q) => (QUALITY[q].fps ? 1000 / QUALITY[q].fps : 0);   // (ms between drawn frames of the blood; 0: every frame)
  let SOFTWARE = !!veins?.software;
  // The overlays on the GPU (stage-over.js, veins-gl overlay; ?stageover=gpu): see syncOver. Set here, before anything made with the
  // stage reads it: read before this line, it threw while the stage was made (31 Oct, d213d755).
  // (Both are read from the context the stage starts with, and again from the one a restore hands back: renderPath.)
  let OVER_ON = !!veins?.overlay && (!SOFTWARE || OVER_ASK);
  // The figure's kept shapes (3 Nov 2026, over-records.js): the circuit's resistors drawn by the overlay painter from records, no SVG element.
  // Declared here, before any geometry pass can reach them. The circuit's own layer is hidden until the view is the circuit (recs.show).
  const recs = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  recs.show(0, 0, true);
  let recAsk = 0, recVer = 0;
  const recOut = { changed: false, moving: false };
  try { localStorage.removeItem('pps.quality'); localStorage.removeItem('pps.q'); } catch (e) { caught('stage:2826', e); /* storage unavailable */ }
  let quality = SOFTWARE ? Q_SOFTWARE : 0, saverOn = false;   // (saverOn: Settings › Battery saver, for the step a changed renderer returns to)
  // A context handed back by a restore is read again for what the start-up one decided: whether the renderer is software (the browser can
  // lose its GPU and hand back a software one, which then needs the lower step, the yield between frames and the SVG overlays, as a
  // software start-up has) and whether the overlays can be painted in it (veins.overlay). The labels' and the glasses' own choice, made
  // when they were built, stands. Only on a restore: at start-up the lines above did it, before the things made after them read it.
  function renderPath() {
    const soft = !!veins?.software;
    OVER_ON = !!veins?.overlay && (!soft || OVER_ASK);
    if (OVER_ON) overWatch();
    if (soft === SOFTWARE) return;
    SOFTWARE = soft;
    quality = SOFTWARE ? Q_SOFTWARE : saverOn ? Q_SAVER : 0;
    wrap.dataset.renderer = SOFTWARE ? 'software' : 'gpu'; wrap.dataset.quality = String(quality);
    blurGuard();
    swYield = softwareYield(SOFTWARE, SOFTWARE ? vCanvas.getContext('webgl2') : null);
    resizeCanvas();
  }
  // The context is lost (iOS Safari takes it in the background or under memory pressure): the figure's state is kept as it stands,
  // and everything the GPU holds is sent again when the context is restored (veins-gl.js asks for the restore: it keeps the loss's
  // default from happening). The vessels are drawn only by the GPU.
  vCanvas.addEventListener('webglcontextlost', () => {
    wrap.classList.remove('gl-on');
    overClear();   // (the overlays' SVG copies back with the vessels': their GPU picture is gone)
    if (wrap.classList.contains('gl-plate')) { wrap.classList.remove('gl-plate'); syncPlateLook(); }
    plateDirty = true;
    plateView = null; plateViewKey = ''; plateKey = ''; dropViewKeep();
    if (geoHeld.size) flushGeo();
    syncOrganDim();
    vLook = null; vBinKey = ''; binShown = null; bendShown = null; veinsDirty = true;
    stageWake();
  });
  vCanvas.addEventListener('webglcontextrestored', () => {
    veins?.dispose();   // the lost instance's listener goes with it (one per restore otherwise)
    veins = createVeinsGL(vCanvas, { tubes: GL_ROWS, force: true, onPlate: () => { plateDirty = true; } });
    pushCam();   // (the camera and alpha are the new renderer's to hold again)
    veins?.setLayerScale?.(figOpt('glow'));
    if (picNow) veins?.setPicture?.(picNow, picLin);   // (Sharper upscaling, or the overlays' plain upscale: the new context draws the picture at the same share)
    if (!veins) { wrap.classList.remove('gl-on', 'gl-plate'); syncPlateLook(); return; }   // (no context this time: the SVG stays)
    wrap.classList.add('gl-on'); plateDirty = true;
    renderPath();
    vBinKey = ''; binShown = null; bendShown = null; glOrgans = false; plateKey = ''; tubesShown = null;   // (a new context holds no vessels yet)
    liverKey = '';   // (nor the liver's lower edge the ascites stops at: morphLiver sends it again)
    for (const x of EV) for (const o of [x, ...(x.strands || []), ...(x.feeders || [])]) { o.gkC = 0; o.glRSent = null; }
    for (const [g, o] of frostHosts) hostFrost(g, o);   // (the glasses drawn in the new context's canvas)
    labelPass();   // (the labels' pass in the new renderer's present: their own pictures come back with the context, label-gl.js)
    labelGL?.check();
    if (F) update(F);
  });
  wrap.dataset.quality = String(quality);
  wrap.dataset.renderer = SOFTWARE ? 'software' : 'gpu';
  // A software renderer or Battery saver never turns the browser's blur on by itself (blur-guard.js): the cards go solid, as with
  // Settings › Blur effect off, unless that switch was turned on.
  // (Glass is glass (Mohammad, 2 Nov 2026: "glass is glass and it doesn't suddenly become solid when there is movement"; his Mac's ?perf
  // showed every card "solid, no blur"): the cards' frost is drawn by the GPU in the figure's own frame, so Battery saver no longer turns it
  // solid, nor does a stored Blur effect off (index.html: only ?noglass=1 does).)
  const blurGuard = () => { let asked = null; try { asked = localStorage.getItem('pps.noGlass'); } catch (e) { caught('stage:2879', e); /* storage unavailable */ } guardBlur(document.documentElement, { low: SOFTWARE, asked: asked === '1' ? null : asked }); };
  blurGuard();
  // Figure resolution › Auto: zoomed in past the home framing the canvas is drawn at 1/zoom of its pixels (each part of the figure
  // keeps about the pixels it had at home), in steps down to 10%. It is changed only once the view has settled and been let go,
  // so a pinch or a glide never reallocates the canvas as it moves.
  let autoK = 1, autoT = 0;
  const { autoNow, easeRes, lowWarm, moveGaps, noteMoveFrame, resizeCanvas, settleRes, subPixel } = createRes({ OVER_ASK, QUALITY, drawVeins: (...a) => drawVeins(...a), schedulePlateView: () => schedulePlateView(), stageBox, vCanvas, wrap }, live);
  // Figure resolution › Adapt to frame rate: the gaps between the frames of each move (moveGaps, from drawVeins); once it settles,
  // one step lower (down to 25%) when they ran half again as long as the screen's own pace (the shortest gaps seen, fastGap), one
  // step back up when they kept up with it. Once a move, never during one.
  // (fastGap: the shortest of the last few moves' quick frames, so a screen that drops to 60 a second, a Low Power Mac or another
  // monitor, is learned again within a few moves instead of every move looking slow from then on (review, 30 Oct).)
  let adaptK = 1, lastMoveAt = 0, fastGap = Infinity;
  // Settings › Figure performance › Sharper upscaling (frame.js): under Full the canvas stays at Full and the figure is drawn at its
  // share into the renderer's own buffer, then upscaled onto it (veins-gl setPicture). picNow: that share's size, or null (off, at Full,
  // or no GPU renderer): the canvas is then the picture, as before.
  let picNow = null, picLin = false;
 onRenderScale(() => { autoK = autoNow(); moveLow = false; adaptK = 1; moveGaps.length = 0; easeRes(); veinsDirty = true; forceDraw = true; stageWake(); settleRes(); });
  resizeCanvas(); resizeReady = true;
  // A window dragged to a screen of another density keeps its CSS size, so no resize notice follows and the figure would stay at the old screen's
  // sharpness: the canvas is measured again when the density changes. (The query names the density now in force and fires once it stops matching, so it is made anew each time.)
  const watchDensity = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', () => { resizeCanvas(); watchDensity(); }, { once: true });
  watchDensity();

  let hoverId = null;
  // The hover link (below): the reading label under the pointer or with keyboard focus, what it lit, and the labels lifted.
  let linkPtr = null, linkKbd = null, linkEdge = null, linkOrgan = null, linkLit = new Set();

  const { collOpen, easeInOut, edgeVisible: edgeVisible$, findingHidden, recruitFrac, setViewBox: setViewBox$, shownFrac, strandAt, updateGeometry, varixHeld, vesselAt: vesselAt$ } = createFrame({ CIRC_C, EI, EV, MAP, VB_CIRC_R, applyVT, arcLen, blendFrom, braid, cbAt, circTurn, gAscites, gFxC, geo, litNormals, nd, nodeVerts, pointAt, recs, rotEase, setG, stageWrap, svg, vbBox, wiggle }, live);
  function edgeVisible(...a) { return edgeVisible$(...a); }   // <stage-split stub>
  function setViewBox(...a) { return setViewBox$(...a); }   // <stage-split stub>
  function vesselAt(...a) { return vesselAt$(...a); }   // <stage-split stub>



  // ── Update from frame ─────────────────────────────
  let inUpdate = false;
    // The loading screen (index.html) waits for this: the figure framed, faded in and on screen.
  let figureShown = false;
    let catchUp = false, wAt = 0, widthEasing = false;
    // (What the last full update was drawn from, and whether a coil or an organ was still easing then: see stepWidths.)
  let widthF = null, widthVer = -1, widthCTM = null, coilEasing = false, organsEasing = false, storeVer = 0;
    // While the view is at home, home follows what is drawn and the space the cards leave: checked on the model's frames
  // (at most every 500 ms) and once a resize or a turn of the device has settled, which needs no model frame (paused, a
  // turned phone or iPad kept the old shape's framing: under the top bar, or off screen behind the Tests sheet).
  // (Not while a move away from home is under way: its first frames still sit at home. A glide on its way home is retargeted.)
  // (The look measures the organs' boxes and the cards' (a forced layout in the middle of the model's frames, about 22 ms twice
  // a second on a slowed phone): it is taken only while something it measures may have moved, see layoutWatch, and once
  // whenever the view comes back home.)
  let wasHome = false, riseFitAsk = 0;
    let easeHeld = false;
    let tubesShown = null, tubesNew = true;
    // A glow or hover easing (glowStep, vhStep) changes only the glow texels of the tube data. While nothing else the whole sync
  // reads has changed since it last ran (the same vessels, model frame, morph, layout, colours, plate, lens, catheter, classes),
  // those texels alone are written again (writeGlowTexels, as the whole sync writes them) and only the rows that changed are
  // drawn again: the same tube data and the same picture as a whole sync, without rebuilding ~300 items each frame of an ease.
  let glowMemo = null;
    // Drops the plate rasters and shows the live SVG organs. The vessel layer is redrawn in the same
  // task (after the model update in progress), so no frame shows the SVG organs over the old GPU
  // plate: the two, and the ascites, would add up to a bright flash.
  let plateRedraw = false, plateDrops = 0;
    let plateStale = false;
    // A vessel that opened or closed while the figure was covered draws on or off from that moment, not when it is shown again (followHidden).
  let fxAt = null;
     // Deck visuals, package F (ext-callouts.js): a slide's figure callouts, or null. live: an edge mark's words by
  // `${edge}|${kind}`; organs: marks on organs; calipers; steps (the glow's first entry's vessels: its order is numbered, V10);
  // spans and zone, on the circuit (V25). Each piece of words is { runs: [{ t, sp, tone? }], wide, label }: wide, the same words at
  // their widest, is the room its pill keeps, so a number ticking never moves or resizes it (fxPill).
  let fx = null, fxSig = '';
    let blockerBoxes = null, blockersAt = -1e9, blockersStale = true;
    let blockersAsk = 0;
  const { W_TAU, edgeQ, endWidth: endWidth$, holdHome, keep, riseFitRead: riseFitRead$, stepOrgans, stepWidths, tubeFill, update: update$, widthMoving } = createTubes({ E, EI, EV, FEEDER_CONNECTOR, GPU_EASE, LIGATED, NI, N_SAMPLES, REVERSAL_WATCH, SEL_FADE, SIDE_HOSTS, SIDE_INSIDE, STRAIGHT_COLL, anatCovered, animateVT, anyReveal, applyVT, blockersRead, camShowTo_, circAt, collOpen, defaultVT, divideLen, dopApply, drawVeins, driftEnd, easeInOut, edgeVisible, flag, geo, glowOnlyOk, holdReversals, keptNow, layerMode, lobuleCode, lobuleReady, nearestLevel, nextFrame, pushCam, qHold, qP, readFrame, recruitFrac, refit, refreshCTM, revShown, sameView, sendRadii, setGlowSrc, setLevel, shownFrac, snapFresh, stageBox, startExit, stenosisAt, stepReveals, syncLift, syncVeins, trackChanges, updateGeometry, updateLabels, updateNodesCircuit, varixHeld, vesselPx, vh, waist, watch, wrap }, live);
  function endWidth(...a) { return endWidth$(...a); }   // (a vessel's width once the view change has landed: the labels' solve at a tap, stage-view.js)
  function update(...a) { return update$(...a); }   // <stage-split stub>
  function riseFitRead(...a) { return riseFitRead$(...a); }   // <stage-split stub>
  




  // ── Vessels on the GPU (veins-gl.js) ─────────────────
  // In the anatomy every vessel (veins in every tier, arteries, cavernoma strands, tributaries,
  // closed collaterals, vessels drawing on, the congestion glow), in the anatomy and in the
  // circuit, is drawn by veins-gl.js; the SVG keeps only the hit strokes, and builds its tubes
  // only for an exported SVG figure (or where WebGL2 is missing altogether).
  // Tiers, back to front: the retroperitoneal stacks and opaque layer (behind the organs), the
  // arteries, the translucent stacks, the opaque network, the portal tree in front, the focus.
  const PORTAL_CASING = 1.3;   // the portal tree's casing width against the systemic side's (see the tube sync)
  const TIER_BACK0 = 0, TIER_BACK = 7, TIER_ART = 8, TIER_MID0 = 9, TIER_NET = 16, TIER_FRONT = 17, TIER_LIFT = 18, TIER_LIFT_FRONT = 19;
  const TIER_GROUP = Array.from({ length: MAX_TIERS }, (_, i) => (i <= TIER_BACK ? 0 : i < TIER_LIFT ? 1 : 2));
  const TIER_ALPHA = Array.from({ length: MAX_TIERS }, (_, i) => (i < TIER_BACK ? LEVELS[i] : i >= TIER_MID0 && i < TIER_NET ? LEVELS[i - TIER_MID0] : 1));
  const levelTier = (x) => {
    const l = x.level ?? 1;
    if (l >= 1) return x.back ? TIER_BACK : x.front || x.over ? TIER_FRONT : TIER_NET;
    return (x.back ? TIER_BACK0 : TIER_MID0) + Math.max(0, LEVELS.indexOf(l));
  };
  // Rows of the per-vessel textures: the model's vessels, then every strand, tributary and liver branch.
  {
    for (const [id, list] of Object.entries(treeGeo)) if (E[id]) E[id].cbr = list.map(({ pts, k }) => ({ cur: pts, c0: pts, k, w: 0 }));
    let row = ALL_EDGES.length;
    for (const e of ALL_EDGES) {
      const x = E[e.id];
      for (const sd of x.strands || []) sd.row = row++;
      for (const fd of x.feeders || []) fd.row = row++;
      for (const cb of x.cbr || []) cb.row = row++;
    }
  }
  const tubeData = veins ? new Float32Array(GL_ROWS * TUBE_TEXELS * 4) : null;
  let cathTint = null;   // the HVPG's wedged vein, recolored (see cathPaint)
  let varixFade = 0;   // the esophageal varices' fade (0..1) while the EUS-PPG scope is in the esophagus (cathPaint, colPass)
  const ORIGIN_LUMEN = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];   // the lumen while the blood is colored by origin (the GPU paints the streams on it)
  const binMemo = new Map();
  // (Its cells' lists keep room, so a vessel that leaves or enters a cell is written there alone.)
  binMemo.relay = true;
  let binShown = null, bendShown = null;
  // A coiling collateral's cells are tested against its points when the coil began, reaching farther by as much as the coil
  // still has to go (each point moves toward its coiled place by at most the change in amplitude), so they list it wherever
  // it draws until the coil settles: every model frame of the coil writes its new points over the last binning (binVeins'
  // patch) instead of binning every vessel again (round 2 review, G1-3). Settled, or moved past that (a new target), it is
  // binned on its own points again. (A vessel listed in a cell it does not reach draws nothing there: the 1.25 headroom of a
  // widening vein, below, lists such cells too.)
  const binFrom = new Map();
  // How far a vessel's lumen can reach, for the cells the moving blood is drawn in each frame (binVeins' `blood`): the reach
  // less the 18 it adds for the casing, shadow and glow (reachOf), plus BLOOD_PAD. A vessel whose widest radius (glMaxR) and
  // wall outgrow its reach is binned again (syncVeins, syncRadiiOnly), so this is always at least glMaxR + its wall + BLOOD_PAD,
  // past the lumen's edge, which antialiases half a pixel out (veins-gl aL): half a pixel is under 6 world units even for the
  // whole circuit at its smallest zoom (K_MIN) in a small window on a 1x screen, drawn at half resolution (a software
  // renderer). Elsewhere in its cells nothing changes from frame to frame.
  const BLOOD_PAD = 6;
  const binTubes = [], binList = [];   // (binVeins' tubes: kept entries, one per item, written in place; binVeins keeps none of them, only their ids and copies of their points)
  function binTubeOf(i) { return binTubes[i] || (binTubes[i] = { id: 0, pts: null, bin: null, reach: 0, core: 0 }); }
  function binTube(it, pts, o) {
    const reach = vBinReach.get(it.row), g = it.x.e.kind === 'collateral' ? geo[it.x.e.id] : null;   // (its strands and feeders too)
    const core = reach - 18 + BLOOD_PAD;
    o.id = it.row; o.pts = pts;
    // (A collateral that never coils, spontaneous or straight, has no target: wigT stays unset, and a reach of
    // NaN from it spoilt the whole binning's bounds, so no vessel drew at all: the outflow talk's caval collateral, 18 Oct.)
    // (A varix's strands fanning in or out as it changes size move the same way, eased (g.spr toward g.sprT), and are binned the
    // same way: each frame of the ease was a whole binning, a 2.8 MB upload and a whole draw, on the procedure slides. The margin
    // is how far a strand can still move: its offset times the spread left to ease; the check below re-bins past it, so it is only a guess.)
    const wigE = !!g && g.wigT != null && g.wig !== g.wigT, sprE = !!g && it.kind === 's' && g.sprT != null && (g.spr ?? 1) !== g.sprT;
    if (!wigE && !sprE) { binFrom.delete(it.row); o.bin = null; o.reach = reach; o.core = core; return o; }
    let a = binFrom.get(it.row);
    if (a && a.pts.length === pts.length) {
      let far = 0;
      for (let i = 0; i < pts.length && far <= a.m; i++) far = Math.max(far, Math.hypot(pts[i][0] - a.pts[i][0], pts[i][1] - a.pts[i][1]));
      if (far > a.m) a = null;
    } else a = null;
    if (!a) binFrom.set(it.row, a = { pts: pts.map((q) => q.slice()), m: Math.ceil((wigE ? Math.abs(g.wigT - g.wig) * 2 : 0) + (sprE ? Math.abs(it.obj.off || 0) * Math.abs(g.sprT - (g.spr ?? 1)) * 2.4 : 0) + 1) / 2 });
    o.bin = a.pts; o.reach = reach + a.m; o.core = core + a.m;
    return o;
  }
  // (Each join's binning circle, kept while the join stays inside it: veins-bin lists the join in that circle's cells. The joins ease
  // wider with their vessels on a slide change, and each new cell was a whole binning of every vessel and a 4 MB upload, 11 in one
  // Varices slide change (motion budget, 2 Nov). Kept per set of vessels.)
  const joinBin = new Map();
  const joinBinRows = [];   // (the rows the circles were kept for, compared one by one and written in place)
  function joinRoom(J, items) {
    let sameRows = items.length === joinBinRows.length;
    for (let i = 0; sameRows && i < items.length; i++) if (items[i].row !== joinBinRows[i]) sameRows = false;
    if (!sameRows) { joinBinRows.length = items.length; for (let i = 0; i < items.length; i++) joinBinRows[i] = items[i].row; joinBin.clear(); }
    for (const j of J) {
      const k = `${j.members.join('.')}|${j.trunk ?? ''}`, b = joinBin.get(k);
      // (A join that leaves its circle takes one at least half as wide again as the last, so a join easing wider leaves it once or
      // twice rather than at every few pixels: still 7 whole binnings in a Varices slide change with the circle at the join's own width.)
      const out = b && Math.hypot(j.x - b.x, j.y - b.y) + j.reach > b.r;
      let c = b;
      if (!b) joinBin.set(k, c = { x: j.x, y: j.y, r: Math.ceil(Math.max(j.reach * 1.5, 0) / 2) * 2 + 8 });
      else if (out) { b.x = j.x; b.y = j.y; b.r = Math.ceil(Math.max(j.reach * 1.5, b.r * 1.5) / 2) * 2 + 8; }   // (the circle is written in place; its old radius read first)
      j.binX = c.x; j.binY = c.y; j.binReach = c.r;
    }
  }
  let vBinKey = '', vBinReach = new Map(), vBinSpare = new Map(), veinsDirty = true, veinsDrawKey = '', vLook = null, glOrgans = false;
  // (R04: the drawn view, in thousandths of the transform and the canvas's size; viewNext the one asked now, kept once it is drawn.)
  const viewKeep = new Float64Array(8).fill(NaN), viewNext = new Float64Array(8);
  let viewKeyN = 0;
  function viewSame(T, w, h) {
    for (let i = 0; i < 6; i++) viewNext[i] = Math.round(T[i] * 1000);
    viewNext[6] = w; viewNext[7] = h;
    for (let i = 0; i < 8; i++) if (viewNext[i] !== viewKeep[i]) return false;
    return typeof veinsDrawKey === 'number';
  }
  const reachOf = (it) => Math.ceil((it.obj.glMaxR + (it.x.wallPx || 1) + 18) / 2) * 2;

      // Vessels that run on into each other (from veinJoins): their calibers are eased to meet at the join.
  let glStraight = [], glRadDirty = true;
      // (The joins pass, and the courses redrawn smooth where one vessel runs on into the next: vein-joins.js, which makes nothing in a frame. veinJoins leaves the pairs that run on in glStraight, as it always did,
  // and the store it wrote into in glStore for smoothRunOn.)
  let glStore = null;
  const { MORPH_GPU, MORPH_JSLACK, MORPH_SLACK, joinKey, joinsKept, joinsOf, morphMiss, morphOff, morphTrackSoon, mt, rowKey, setOf, sweepPiece, visAt: visAt$ } = createMorph({ BLOOD_PAD, EV, GL_ROWS, N_SAMPLES, cavaAsOne, cbAt, edgeVisible, geo, itemRadii, reachOf, strandAt, veinJoins, vesselAt, wrap }, live);
  function visAt(...a) { return visAt$(...a); }   // <stage-split stub>
  let shownCol = new Map(), lensFrom = null, lensT0 = 0, lensMode = null;
    let plateDim = null, plateSat = 1, netA = 1;
    let colAt = 0, colEasing = false;
    let liveKeyWas = '', liveSet = false;   // (liveKeyWas: '' for none, 'kept' while liveKeyOld holds the last key's parts)
    let revF = null, revH = null, revT = 0, revP = null, revFlip = false;
    let balloonSqueeze = 1;
  const { JUMP_MMHG, LENS_FADE, NO_LIST, cavaAsOne: cavaAsOne$, cssNum, drawVeins: drawVeins$, et, glItems, glWanted, glowOnlyOk: glowOnlyOk$, itemRadii: itemRadii$, lenOfArc, lensNow, mix3, sendRadii: sendRadii$, smoothRunOn, sweepBin, syncGlowOnly, syncVeins: syncVeins$, toRGB: toRGB$, veinJoins: veinJoins$, veinsRows } = createVessels({ E, EV, FADE_DOWN_Y, FADE_IN, FEEDER_FADE_Y, GL_ROWS, IVC_JOIN, LIGATED, MAP, MORPH_GPU, MORPH_JSLACK, MORPH_SLACK, N_SAMPLES, ORIGIN_LUMEN, PORTAL_CASING, SIN_FADE, STRAIGHT_COLL, TIER_ALPHA, TIER_ART, TIER_GROUP, TIER_LIFT, TIER_LIFT_FRONT, W_TAU, arcLen, binList, binMemo, binTube, binTubeOf, divideLen, easeInOut, edgeQ, geo, getOrganCovers, glow, joinKey, joinRoom, joinsKept, joinsOf, keep, layerMode, lenOfItem, levelTier, morphMiss, morphOff, morphTrackSoon, mt, noteMoveFrame, reachOf, refreshCTM, rowKey, selAKey, setOf, settleRes, spot, spotOn, strandAt, subPixel, sweepPiece, syncMapInk, tubeData, tubeFill, vCanvas, vesselAt, vh, viewKeep, viewNext, viewSame, widthMoving, wrap, wrapCS, wrapCls }, live);
  function toRGB(...a) { return toRGB$(...a); }   // <stage-split stub>
  function cavaAsOne(...a) { return cavaAsOne$(...a); }   // <stage-split stub>
  function itemRadii(...a) { return itemRadii$(...a); }   // <stage-split stub>
  function veinJoins(...a) { return veinJoins$(...a); }   // <stage-split stub>
  function glowOnlyOk(...a) { return glowOnlyOk$(...a); }   // <stage-split stub>
  function sendRadii(...a) { return sendRadii$(...a); }   // <stage-split stub>
  function syncVeins(...a) { return syncVeins$(...a); }   // <stage-split stub>
  function drawVeins(...a) { return drawVeins$(...a); }   // <stage-split stub>
  let sinceP = null;   // (a "change since" slide's reference: see changeRef)


  // ── The plate on the GPU ─────────────────────────────
  // The backdrop, organs and ascites are rasterized from the live SVG (styles inlined) into
  // textures the vessel layer draws first: one of the whole plate, and, once a pan or zoom has
  // settled, a sharper one of the view. The SVG is rasterized again only when what it shows
  // changes (cirrhosis, spleen size, ascites, congestion tint, theme); dimming
  // for a selection or a data layer is applied on the GPU. The SVG groups stay, hidden, for
  // picking organs and for exports.
  const PLATE_RECT = [200, -200, 1020, 1320];
  const PLATE_BASE = 1.2;          // px per world unit of the whole-plate raster
  let plateTheme = null, plateKey = '', plateSeq = 0, plateBusy = false, plateAgain = false, plateLast = 0, plateTimer = 0, plateView = null, plateViewKey = '', plateSettle = 0;
  // The last sharp picture of the view, kept in memory (its pixels, its world rect, size and scale, and the state it shows): a pan
  // at the same scale takes the pixels the two views share from it and draws only what the pan uncovered (viewReuse).
  // (One per layer of the organs drawn as layers, under the layer's name; the flattened plate's under ''.)
  const viewKeeps = new Map();
  let viewSeq = 0;
  function dropViewKeep() { viewKeeps.clear(); }
  const plateOn = () => wrap.classList.contains('gl-plate');
  // The organs drawn as layers painted on the GPU (organs-gl.js), on every renderer: the only picture of them there is (the one
  // flattened picture the browser rasterized from an SVG copy is gone). Off (the ?perf switch): the page's own SVG.
  const gpuOrgansOn = () => !!(gpuProbe.gpuOrgans && veins?.organs);
  // With it, the organs that change (the liver, the spleen, the diaphragm, the falciform line: LIVE_LAYERS) are painted live on
  // the GPU from their own SVG at each frame they change (syncLiveOrgans), so their picture is never dropped while they ease; the
  // gut's and the stomach's masks, which follow the liver and the spleen, are painted live over pictures made without them.
  // (Off when an organ could not be read for painting: the organs are then all pictures, as above.)
  const LIVE_LAYERS = new Set(['back', 'spleen', 'liver', 'front']);
  // (Painted live, the bowel is a layer of its own, gathered under the gut's: syncLiveOrgans.)
  const LIVE_ORDER = ['back', 'behind', 'bowel', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'];
  const LAYER_SPENT = {};   // (the name each layer's paint step is charged under, made once: refine.spent)
  for (const L of LIVE_ORDER) LAYER_SPENT[L] = `organ layer ${L}`;
  const bakeStep = (job, until) => job.step(until);
  const bowelDy = () => parseFloat((organG.bowel?.getAttribute('transform') || '').match(/^translate\(0 ([-\d.]+)\)$/)?.[1]) || 0;
  let liveFailed = false, liveFailWhy = '';
  const liveOn = () => gpuOrgansOn() && !!veins.organs.canLive && !liveFailed;
  // Every layer painted live on the GPU while the organs' pictures are down (at start, and after a theme change drops them), instead of
  // the page's SVG organs: the stack shows the whole figure from the organs' own shapes until the new pictures land, then goes back to
  // painting only the changing organs live (2 Nov 2026: no SVG fallback; the SVG organs showed for seconds in a deck, the pictures
  // waiting for a quiet frame). A layer the painter cannot read keeps the old way.
  let fullSwap = false, fullFailed = false;
  const fullOk = () => !fullFailed && liveOn() && !!veins?.organs?.pictured;
  function keepForWhole() {
    if (!fullOk() || veins.lost) return false;
    fullSwap = true;
    veins.dropPlate(1); plateView = null; plateViewKey = ''; dropViewKeep();
    veinsDirty = true; syncLiveOrgans(true);
    return true;
  }
  function hidePlate() {
    plateDrops++;   // (a raster still on its way in is of the state before: rasterPlate gives it up)
    // (With every layer able to be painted live, the old pictures stay until the live layers take over in the next frames: no frame shows
    // the SVG organs, nor neither. liveApply drops them as it hands the stack the whole set.)
    if (keepForWhole()) return;
    veins.dropPlate(0); veins.dropPlate(1); plateView = null; plateViewKey = ''; dropViewKeep();
    wrap.classList.remove('gl-plate'); plateDirty = true; veinsDirty = true; syncPlateLook();
    if (inUpdate) plateRedraw = true; else drawVeins(false, 'plate hidden');
  }
  const { SEL_DIM, clientToWorldFast, figureHidden, lookPending, organPathsNow, paintOrganAlpha, plateEasing, platePoke, plateStateKey, readGroup, schedulePlateView, stepPlateEase, syncLiveOrgans, syncOrganDim, syncPlateLook } = createPlate({ EBOX, LAYER_SPENT, LENS_FADE, LIVE_LAYERS, LIVE_ORDER, PLATE_BASE, PLATE_RECT, bakeStep, bowelDy, defs, drawVeins, dropViewKeep, easeInOut, flag, flank, fullOk, gBackdrop, gOrgans, ghost, glWanted, gpuOrgansOn, gutKids, hidePlate, lensNow, liveOn, liverTint, lv, nextFrame, organEls, organG, plateOn, readFluidInk, readFrame, refreshCTM, setG, spleenMoving, spleenMv, spot, spotOn, stageBox, stageWrap, svg, themeKey, vCanvas, wrap, wrapCS, wrapCls }, live);
  let layerStarts = 0, layerStartsEasing = 0;   // (for the tests: organ pictures begun, and those begun while the fluid eased)
  let layerCommits = 0;
  let plateMiss = 0, fluidStillAt = 0, fluidWas = false;   // (pictures given up in a row; when the fluid last stopped)

  // Circuit liver module: collapsed unless asked for, selected into, or zoomed in on.
  function liverExpanded() {
    const sel = store.get().selection;
    return labelRestK() >= 1.9 || (sel?.type === 'edge' && LIVER_EDGES.has(sel.id)) || (sel?.type === 'node' && LIVER_INNER.has(sel.id));
  }

  const { anastomoses, appEl, caliperAt, caliperSegs, canFade, clampA, clampFading, clampShade, easeLiver, fluidEasing, fluidFade, fluidLook, fxBuild, fxK, fxPill, fxSync, gMatrix, gSelO, glLines, holdReversals: holdReversals$, ligature, markA, marksStale, marksSync, mk, normal, normalSync, olFading, olKey, olRings, olSet, olStep, orgTone, pinOrgans, polysD, putMark, quietFx, revHold, reversedShown, setCallouts, spotOrgans, startExit: startExit$, stentMesh, stepFluid, stepReveals: stepReveals$, trackChanges: trackChanges$, updateFocus, updateNodesCircuit: updateNodesCircuit$, updateOrganSel, updateOrgans, venousSync } = createTransitions({ E, EI, EV, FLUID_COLS, FLUID_R, JUMP_MMHG, MAP, ND_PER, ND_SEG, NI, SEL_DIM, abdTo, anyReveal, arcMid, ascitesLine, ascitesPath, ascitesSvg, caud, clampW, clampWOut, collOpen, defs, diaCut, divideLen, drawFrame, easeInOut, edgeVisible, findingHidden, flag, flank, gBackdrop, gFx, gFxC, gOver, geo, haloEls, hidePlate, late, liveOn, liverR, liverTint, lv, morphLiver, nd, nextFrame, nodeDots, nodePos, organEls, organG, ov, plateOn, platePoke, pointAt, putA, qP, readFrame, recruitFrac, refreshCTM, resTheme, routeCustomShunts, setGlowSrc, setReveal, spleenMv, spot, svg, syncOrganMasks, syncVeins, themeKey, toRGB, update, updateGeometry, waist, wrap, wrapCls }, live);
  function trackChanges(...a) { return trackChanges$(...a); }   // <stage-split stub>
  function startExit(...a) { return startExit$(...a); }   // <stage-split stub>
  function stepReveals(...a) { return stepReveals$(...a); }   // <stage-split stub>
  function holdReversals(...a) { return holdReversals$(...a); }   // <stage-split stub>
  function updateNodesCircuit(...a) { return updateNodesCircuit$(...a); }   // <stage-split stub>
 
  let clampLast = 0;
  let markLast = 0;







  let diaKey = '';


  let ascTarget = null, ascShown = 0, ascVel = 0, fluidMaskB = null, fluidMaskOf = null, fluidMaskOfB = null, fluidBandH = -1, fluidH = 0, fluidAmp = 0, fluidInkRGBA = [0.9, 0.75, 0.28, 0.4];
  let fluidSeen = false, fluidFrom = null, poolFrames = 0;
  // (A hex digit's value from its character code, as parseInt(pair, 16) reads a colour's pairs; NaN for anything else.)
  const hexDigit = (c) => (c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : NaN);
  function readFluidInk(cs) {
    // (The value's digits found in place, as trim() and replace('#', '') found them: no string made. Six digits after an optional '#'.)
    const raw = cs.getPropertyValue('--ascites'), a = parseFloat(cs.getPropertyValue('--ascites-a')) || 0.4;
    let i0 = 0, i1 = raw.length;
    while (i0 < i1 && raw.charCodeAt(i0) <= 32) i0++;
    while (i1 > i0 && raw.charCodeAt(i1 - 1) <= 32) i1--;
    if (i0 < i1 && raw.charCodeAt(i0) === 35) i0++;
    if (i1 - i0 === 6 && raw.indexOf('#', i0) < 0) {
      for (let i = 0; i < 3; i++) fluidInkRGBA[i] = (hexDigit(raw.charCodeAt(i0 + 2 * i)) * 16 + hexDigit(raw.charCodeAt(i0 + 2 * i + 1))) / 255;
      fluidInkRGBA[3] = a;
    }
  }

  // A treatment's mark, built into its overlay group as one group of its own (data-mk: its key) that fades in and out with it: the
  // amount shown lives in markA across the overlays' rebuilds. vessel: the vessel it sits on (while that is drawn it may fade out
  // where it stands); anatOnly: it belongs to the anatomy view alone (a switch to the circuit takes it at once).
  let ovT = 0;   // (the morph the overlays are being built at)

  const { RES_BIT, RES_LIVER, SITE_DEF, SITE_EL, SITE_TPL, SPLIT_B, cath, recKick, recLive, resItem, resKey, resMade, resNow, resPaint, resPlace, resRatio, resTheme: resTheme$, sites, tokenRGB, toneToken } = createSites({ EI, NI, gOver, geo, nextFrame, overSend, pointAt, recOut, recs, toneCol, worldToLocalInto, wrap }, live);
  function resTheme(...a) { return resTheme$(...a); }   // <stage-split stub>
  let resMask = 0, resLitRev = 0;
  let resLit = new Map();   // the circuit's resistors a slide's words point at (rLiver, rColl) → their station tone
  // The wide screen's nav pill, read with the cards (readBlockers): its gap from the stage's right edge is the slides' one margin
  // (--pz-cm), and its top bounds the row the figure's readings keep clear of. Null when no pill shows (a phone, or no slide).
  let pillEdge = null;
  // (The glasses drawn in the figure's canvas, each as the labels are to leave it out (glass-gl.js onHoles): every
  // glass's list, told to the lobule's layers as one whenever one changes. (The stage's labels are drawn under the glass: they leave nothing out.))
  const holeSets = new Map();
  const holesAll = [];   // (every glass's list as one, written in place: the labels compare it number by number and keep nothing of it but its length)
  const sendHoles = () => {
    holesAll.length = 0;
    for (const l of holeSets.values()) for (let i = 0; i < l.length; i++) holesAll.push(l[i]);
    // (The liver's names and leaders, and the sinusoid's, are the lobule's own layers: a copy, as each keeps the list it is given.)
    lz?.setHoles(holesAll.length ? holesAll.slice() : NO_HOLES);
  };
  const NO_HOLES = [];
  const frostHoles = (key) => (list) => { if (list.length) holeSets.set(key, list); else holeSets.delete(key); sendHoles(); };
  // (The canvas the glasses are drawn into now: frostCtx, its context; frostLiver, the liver's canvas (lobule-zoom.js glassHost) while the
  // frost is taken from it, else null and the figure's. What the glass keys its blur on follows it: a new picture there, not the figure's.)
  let frostCtx = null, frostLiver = null;
  // (The lobule drawn in the figure's own canvas: the glass is drawn over it there, with no hand-over to the lobule's canvas; its pictures count with the figure's:
  // lobule-glass-seq.js, which also tells the glass which parts of the canvas they reached.)
  // (Every picture the sinusoid lays, and the figure's blood under a lobule not laid plain, at the anatomy blood's cadence (FROST_EVERY): 7 Nov 2026.)
  const lzGlass = createLzGlassSeq({ lz: () => lz, veins: () => veins, every: 3 });
  const frostSeq = () => (frostLiver ? `l${frostLiver.seq()}` : lzInFigure() ? lzGlass.seq() : veins.drawSeq);
  // (4 Nov 2026, Mohammad: "Keep it glass through and through any zoom". The lobule and the sinusoid are passes of the figure's own context whenever it has one (lobule-zoom.js ensureGL: shared is simply "the figure has a top"), so the glass is never let go through a dive or a zoom, even before the lobule has made its renderer.)
  const lzShares = () => !!lz?.shared || (!!veins?.top && !veins.lost);
  const lzInFigure = () => !!lz?.shared && (lobuleOn || lz.isShown());
  // (Mac heat R2: the frost blurs again only once the blood has moved FROST_EVERY frames on; the count handed over is the real one, so the dirty squares still cover the frames between.)
  // (7 Nov 2026, Mohammad: the glass "keeps popping" from Lobule to Sinusoid to Anatomy. In the liver the frost keyed its blood on the anatomy's, which
  // is covered and still there, and asked the anatomy's blood squares which parts to blur again: the lobule's own blood moved under the pills with the
  // frost held, then a few squares of it were blurred again, a patchwork of old and new. In the liver it is the lobule's blood now, its own squares.)
  const FROST_EVERY = 3, thirdSeq = (count = () => veins.bloodSeq) => { let held = -Infinity; return () => { const q = count(); if (q < held || q - held >= FROST_EVERY) held = q; return held; }; };
  const frostFresh = (() => { const t = thirdSeq(), tl = thirdSeq(() => lz?.bloodSeq?.() ?? 0); return () => (frostLiver ? 0 : lzInFigure() ? tl() : t()); })();
  // (8 Nov 2026, Mohammad's Mac ?perf in a talk with a time-lapse: the cards' glass blurred again on every frame, 33 a second, because every frame
  // was a new picture (the vessels change with the model, and the blood's clock is in the picture's signature, so no frame counts as the blood's
  // alone), and the GPU took 26 ms a frame in the figure's late phase. While nothing moves on screen (no camera, no transition), the anatomy's
  // glasses take the picture's count at most every FROST_EVERY pictures, as the frost takes the blood's: a 16 or 22 px blur of vessels that
  // change by a hair a frame cannot show a picture two frames old. A camera move or a transition reads every picture, as before; a card that moves
  // changes the parts the glass reads, which blurs at once whatever the count. The liver's own frost is untouched.)
  const heldPictures = () => { const t = thirdSeq(() => veins.drawSeq); return () => (cameraMoving() || inMotion() ? veins.drawSeq : t()); };
  const frostVersion = (() => { const h = heldPictures(); return () => (frostLiver || lzInFigure() ? frostSeq() : h()); })();
  const frostBloodRects = (a, b, o, p) => (lzInFigure() ? (lz.bloodRects?.(a, b, o, p) ?? -1) : (veins.bloodDirtyRects?.(a, b, o, p) ?? -1));
  const frostBloodBox = (a, b, o) => (lzInFigure() ? false : veins.bloodDirty(a, b, o));
  // The callouts' frosted glass, drawn on the GPU under both callout layers while it can be (glass-gl.js); else the browser's.
  // (A region of stage.glass.add (calloutsGlass, below, where the glass hosts are set), made by cardGlass with cards.callouts; set there.)
  let glassGL = null;
  wrap.dataset.glass = veins && !SOFTWARE ? 'gpu' : 'css';
  // The Present cards' glass (recs A2, 31 Oct): the same renderer, one per presenter run (cardGlass, below), drawing each card's blur
  // and tint from the figure's canvas while the anatomy shows (not the lobule, nor a dive), so the browser re-blurs none of them as the
  // blood moves. Off with the callouts' (software, no GPU figure): the cards keep the browser's glass.
  // (Drawn into the figure's own canvas (frostHost, below), never from a copy of it: the copy (31 Oct, A2) read the canvas back on Safari
  // on every figure frame and made the decks laggier than the browser's own blur. Where the figure's canvas cannot take a card's glass,
  // and with ?glasscopy=1, that card keeps the browser's glass, as before.)
  const cardGLs = new Set();
  // (A card is never kept out of its GPU glass by what lies between the figure's canvas and it: kept out, it showed no glass at all, the
  // figure sharp through it (Mohammad, 2 Nov 2026, HVPG 6 in the lobule: "CARDS ARE GLASS"), as the anatomy's overlay boxes, kept from
  // before the lobule covered it, still crossed it there. The labels the GPU draws are under every card's glass; the
  // card's own words lie over whatever else does.)
  // (Heat recs H2b: the glass's blur moved with the figure while a hand pans it (glass-gl.js pan): the matrix the vessels were drawn in (glM, world to stage
  // CSS px), while the figure is what the canvas shows: not the lobule or the sinusoid in it, nor the liver's own canvas, nor a dive or a card's zoom.)
  const framePan = () => (frostLiver || lzInFigure() || diveT > 0 || live.drawCam ? null : glM);
  const handPan = () => { try { return gestureOn() || wrap.classList.contains('panning'); } catch { return false; } };   // (gestureOn is made below, with the gestures)
  const NO_OVER = [], noOver = () => NO_OVER;   // (no box lies over a card's glass: a list read by the glass, never written)
  const cardGlass = (cards) => {
    if (!veins?.top) return null;
    // (The figure's callouts (cards.callouts): the same renderer with the callouts' own ways: drawn while the figure is on, from the figure's own
    // pictures and blood, in the turn between the cards' two, over what lies over the callouts, and their holes in the labels under 'callouts'.)
    if (cards.callouts) {
      const g = createGlassGL(wrap, vCanvas, [], { software: SOFTWARE, cards, live: () => wrap.classList.contains('gl-on'), version: heldPictures(), fresh: thirdSeq(), dirty: (a, b, o) => veins.bloodDirty(a, b, o), dirtyRects: (a, b, o, p) => veins.bloodDirtyRects?.(a, b, o, p) ?? -1, pictureRects: (a, b, o, p) => veins.pictureDirtyRects?.(a, b, o, p) ?? -1, camKey: () => veins.camKey ?? -1, dip: () => (frostLiver ? 1 : figDip()), pan: framePan, panning: handPan, onFigure: (f) => veins.onPicture(f), onHoles: frostHoles('callouts') });
      if (!g) { wrap.dataset.glass = 'css'; return null; }
      hostFrost(g, { order: 2, over: () => frostOver('callouts') });
      glassGL = g;
      const dispose = g.dispose;
      g.dispose = () => { if (glassGL === g) glassGL = null; frostHosts.delete(g); dispose(); };
      return g;
    }
    cards.holesWhile = () => diveT > 0;   // (glass-gl.js: while the dive has the glass off the figure's canvas, the labels still leave the cards' places out)
    const shade = cards.low;
    const key = {};
    const g = createGlassGL(wrap, vCanvas, [], { software: SOFTWARE, cards, live: () => !!frostLiver || (wrap.classList.contains('gl-on') && (lzShares() || (!anatCovered() && !(diveT > 0)))), version: frostVersion, fresh: frostFresh, dirty: frostBloodBox, dirtyRects: frostBloodRects, pictureRects: lzGlass.rects, camKey: () => veins.camKey ?? -1, dip: () => (frostLiver ? 1 : figDip()), pan: framePan, panning: handPan, onFigure: (f) => veins.onPicture(f), onHoles: frostHoles(key) });
    if (!g) return null;
    hostFrost(g, { order: { low: 1, high: 3 }, active: () => !frostWhy(true), why: () => frostWhy(true), over: noOver, low: (el) => el === shade || !!cards.isLow?.(el) || el?.dataset?.ghost === 'shade' });
    cardGLs.add(g);
    const dispose = g.dispose;
    g.dispose = () => { cardGLs.delete(g); frostHosts.delete(g); dispose(); if (holeSets.delete(key)) sendHoles(); };
    return g;
  };
  // One-call glass anywhere (glass-gl.js glassRegions): the cards, sheets and toasts, and the figure's callouts (below), are regions of it.
  const glassAdd = glassRegions(cardGlass, wrap);
  // A slide's numbers (its fingerprint, or a what-if's or time-lapse's since): the tiles show them, and a callout or figure
  // label that agrees with the model reads them too, so a laptop and a tablet show the same number at the same moment.
  let slideFp = null;
  store.on('presentFp', () => { slideFp = null; });
  const pinned = () => (store.get().presenting ? slideFp || store.get().presentFp : null);
  const breath = (v) => Math.max(0.8, Math.abs(v) * 0.08);   // (how far the live model may breathe from a pinned number and still read it)
  const { LABEL_GLIDE_MS, siteLeave, sitesPaint: sitesPaint$ } = createSitesPaint({ NI, NO_LIST, RES_BIT, SITE_DEF, SITE_EL, SITE_TPL, SPLIT_B, beatMean, breath, buildSegs, easeFrame, easeInOut, late, lineHits: (r, m, skip) => lineHits(r, m, skip), nextFrame, nodePos, pinned, readFrame, refreshCTM, resMade, resPaint, resRatio, sites, stageBox, viewMoving, watch, worldToLocalInto }, live);
  function sitesPaint(...a) { return sitesPaint$(...a); }   // <stage-split stub>
  const { scan, scanCardsRead, scanPaint, scanTick, scanTipLocal, setScanProbe } = createScan({ NO_LIST, SCAN_BOX, gMatrix, late, nextFrame, organEls, organG, readFrame, refreshCTM, sites, stageBox, viewMoving, watch }, live);
  // ── The Doppler probe (dop-probe.js) ──
  // While the Doppler reads a vessel, a small probe stands off it, its line of sight runs straight through the vessel, and the sample
  // volume's two bars and the flow axis mark the vessel's middle (where its callout points), or a stent's sampled third. It
  // follows the camera with the labels; it fades out while the views morph and in the liver's own views. A new vessel or third, or
  // a card making it change sides, fades it out where it stood and back in at its new place (nothing jumps).
  let dprCardsList = [], dprCardsAt = -1e9, lbRects = [], colShown = false, colWaitAt = 0;   // colShown: a stent's three point callouts stand (the probe keeps off them, so it waits for them)
  const { dprDots, dprHold, dprLet, dprMake, dprobePaint } = createDoppler({ E, EV, arcMid, cath, clampW, dop, dpr, geo, nextFrame, olKey, olRings, organEls, pointAt, readFrame, scanCardsRead, sites, stageBox, unseenCard, viewMoving, watch, worldToLocalInto }, live);
  const { NO_BLK, cathAt, cathCarry, cathFadeOut, cathFocus, cathFollow, cathLabelsNow, cathLabelsSoon, cathPaint, cathRadOf, cathRoom, cathRoute, procIn } = createCath({ E, NO_LIST, animateVT, appEl, applyVT, blockersRead: (...a) => blockersRead(...a), cardSpace, cardSpaceRead, cath, clientToVB, clientToVBFast, drawFrame, easeFrame, easeInOut, geo, glWanted, late, nextFrame, polyD, readBlockersRead: (...a) => readBlockersRead(...a), readFrame, refreshCTM, safeInsets, stageBox, syncVeins, toRGB, worldToLocalInto, wrap, wrapCS }, live);
  let cathVer = 0;
  let cathFade = null;

  // Overlays (stenosis, thrombus, stents, varices, balloons, catheter…)
  // The overlays (clamps, clots, stents, varices, caput medusae, balloons, catheter) are rebuilt
  // only when something they draw has visibly changed: the key holds every input, rounded.
  let overlayKey = '', thrombiKey = '';
  // A stent called out at its three points stands its callouts in a column on one side (ptSide, 'E' | 'W', chosen in layoutLabels);
  // its narrowing's "60 %" then goes to the other side (clampAway), so the two never meet.
  let ptSide = null, clampAway = null, clampFor = null;
  // (The flow's arrowheads stay out from under a stent's called-out points: world boxes [x0, y0, x1, y1, r], round by r; see bloodLook.)
  let chevHoles = [], holesKey = '';
  // A narrowing's "60 %" the Doppler probe would cover (its body, line of sight, bars or flow axis) steps out to the nearest clear spot on
  // a leader line, by stenosis: cur is where it stands now, busy while it fades out and in at its new place (Mohammad, 20 Oct).
  const clampMv = new Map();
  const clampD = new Map();   // (a column's "60 %": how far out it stands, by stenosis, kept across the overlay's rebuilds)
  // (A new slide (the presenter clears its mark first) starts the stent's column afresh: its callouts, its mark, their side and the
  // "60 %" are solved for this slide alone, as on a fresh load, never held from the slide before: Review 16 Oct.)
  const FOCUS_SOL_RE = /^(n:TIPS:|n:DIPS:|focus)/;
  store.on('focus', (foc) => {
    if (foc) return;
    for (const k of labelSol.keys()) if (FOCUS_SOL_RE.test(k)) labelSol.delete(k);   // (a Map's own order is kept through a delete of the entry it is at)
    ptSide = null; colShown = false; clampD.clear();
  });
  const { clampFontAt, clampLabelAt, clampLabelPos, clampStep, clampTextBox, colGap, updateOverlays } = createClamps({ E, LIGATED, NI, N_SAMPLES, anastomoses, applyClampFs, clampA, clampD, clampFading, clampMv, clampShade, clampW, clampWOut, findingHidden, geo, ligature, markA, marksSync, mk, ov, placeClampLabels, pointAt, polyD, polysD, putMark, qP, recruitFrac, rotDeg, stenosisAt, stentMesh, tubeOutline, updateLabels, venousSync, worldToLocalInto }, live);
  const { bal, balloonDraw, balloonStep } = createBalloon({ ov }, live);

  // ── Labels: a screen-space layer (SVG) laid out every frame ──
  // Text keeps a constant on-screen size whatever the zoom. Every label is a block with a
  // priority and a list of candidate positions; blocks are placed greedily, most important
  // first, and a block that cannot be placed without a collision is dropped. Anatomy on a wide
  // stage uses atlas columns in the margins with leader lines; everything else is placed
  // around its anchor. The same layer is serialized into exported figures.
  const labelSvg = wrap.querySelector('#labels');
  if (HOVER_LINK) labelSvg.classList.add('hovlink');   // (the hover link's look in app.css hangs on it: hover-link.js; ?hoverlink=0 leaves the layer as it was)
  onFigLab((k) => { if (k === 'glassCache') { glassGL?.redraw(); for (const g of cardGLs) g.redraw(); } });
  // (Sharper upscaling on or off: the canvas takes its new size and picture under the eased change every resolution change takes.)
  onFigLab((k) => { if (k === 'upscale') { easeRes(); veinsDirty = true; forceDraw = true; stageWake(); } });
  // Lighter organ art (Settings, Figure performance; off by default): the colon's and small bowel's lines with fewer points, none
  // more than 0.05 units from the drawn line (organ-art-lite.js, scripts/organ-art-lite.mjs), set on the drawn paths in place, and
  // the drawn ones put back when it is turned off. While it is off nothing of it loads or runs. The lines change only while the
  // figure rests (no dive, lobule, circuit, ease, camera move or gesture); then the organs' pictures are made again from them, as after a
  // change of patient made out of view (plateStale), and the gut's pictures follow by themselves (gutMo).
  let artLite = false, artLiteT = 0, artBack = null, artLiteOff = false, liteLoad = null;
  const artLiteBusy = () => lobuleOn || (diveT > 0 && diveT < 1) || morph > 0 || morphTarget !== 0 || vtGliding || camMove || drifting || lvMoving || fluidEasing() || spleenMoving() || gestureOn();
  function syncArtLite() {
    stageScope.clear(artLiteT);
    const want = figLab('lightArt');
    if (want === artLite || artLiteOff) return;
    if (want && !liteLoad?.mod) { liteLoad ||= import('./organ-art-lite.js').then((m) => { liteLoad.mod = m; syncArtLite(); }, () => { liteLoad = null; }); return; }
    if (artLiteBusy()) { artLiteT = stageScope.timer(syncArtLite, 1000); return; }
    if (want) {
      const { LITE_D, LITE_ART } = liteLoad.mod, sets = [];
      for (const id of ['colon', 'bowel']) {
        const paths = organG[id] ? [...organG[id].querySelectorAll('path')].filter((p) => p !== organEls[id]) : [];
        // (Only onto the art it was made from: the same number of paths, each thinned one of the length it was made from.)
        if (paths.length !== LITE_ART[id].n || LITE_ART[id].list.some(([i, len]) => (paths[i].getAttribute('d') || '').length !== len)) { artLiteOff = true; return; }
        for (const [i, , t] of LITE_ART[id].list) sets.push([paths[i], LITE_D[t]]);
      }
      artBack = sets.map(([el]) => [el, el.getAttribute('d')]);
      for (const [el, d] of sets) el.setAttribute('d', d);
    } else {
      for (const [el, d] of artBack) el.setAttribute('d', d);
      artBack = null;
    }
    artLite = want;
    plateKey = ''; plateStale = true; platePoke();
  }
  onFigLab((k) => { if (k === 'lightArt') syncArtLite(); });
  if (figLab('lightArt')) syncArtLite();
  const gLeaders = s('g', { class: 'lb-leaders' });
  const gLabels = s('g', { class: 'lb-blocks' });
  const gScan = s('g', { class: 'lb-scan off' }, s('path', { class: 'leader scan' }), s('circle', { class: 'leader-dot scan', r: 2.6 }));   // the FibroScan callout's leader: its own layer, so it eases with the probe
  // (A reading that has to sit on its vessel (layoutLabels, onVessel) takes a wide text halo in the stage's colour: .on-vessel in
  // app.css. Never an SVG filter: the grown-glyph filter drew dark boxes on iPhone and was redrawn on every frame: 16 Oct.)
  labelSvg.append(gLeaders, gScan, gLabels);
  // The labels' words and pills, their leaders and dots drawn on the GPU (label-gl.js), the SVG kept as their model; the SVG draws them itself on a software
  // renderer, without WebGL2, or once the GPU's context is lost. Drawn in the figure's own context, as a pass of its present under every glass (S2,
  // docs/gpu-two-contexts-plan.md): the same present, the same camera numbers, so they can never be a frame behind the figure, and a card over a label
  // shows it blurred, as glass would: no hole is cut. (Until 4 Nov 2026 they had a canvas of their own.)
  const frostWake = () => { glassGL?.redraw(); for (const g of cardGLs) g.redraw(); };
  const LABELS_ORDER = -6;   // (over the lobule's and sinusoid's pictures and their captions, under the glasses at 0 … 3: veins-gl top.add)
  // (ask and now are the host's asks that veins-gl folds into the end of the frame they are made in: top.ask; the figure's own present stays immediate.)
  const labelHost = () => {
    const top = veins?.top;
    return top ? { gl: top.gl, canvas: top.canvas, ask: () => veins?.top?.ask(), now: () => veins?.top?.ask(), active: () => !!veins?.top && !veins.lost && wrap.classList.contains('gl-on'), scale: () => vCanvas.width / (stageBox().width || 1), layerAlpha: true } : null;
  };
  const { PIN_DIR, labelPass, pinKind } = createLabelHost({ E, LABELS_ORDER, arcMid, easeInOut, frostWake, gLabels, gLeaders, gScan, geo, labelAnchor, labelHost, labelSvg, morphAnchorAt, nodePos, refreshCTM, worldToLocalInto, wrap }, live);
  // The frosted glasses drawn inside the figure's canvas (round 2, 2.1, 31 Oct): each glass's blur is taken from the picture the vessel
  // renderer has just laid in its own context (veins-gl top), so nothing is copied off the GPU, and the glass's own canvas (the
  // callouts', the liver pane's) or the browser's blur (the Present cards') is not needed. Drawn in the page's order: the pane (under the
  // labels), the teaching card's shade, the callouts, the other cards. A glass is drawn there only while nothing the page lays between
  // the figure's canvas and it crosses it (frostOver): those would show sharp through it. Otherwise, and around each change of the
  // canvas (a resolution's fade, a dive, the lobule), the callouts and the pane go back to their own way (?glasscopy=1: their own canvas,
  // from a copy, as before 31 Oct; by default the browser's glass) and a card to the browser's glass.
  let frostHold = false;
  const { blurWhy, frostHosts, frostOver: frostOver$, frostWhy, glassBox, hostFrost: hostFrost$, visible } = createGlass({ appEl, cardGLs, cath, frostWake, gOver, labelSvg, lzShares, refreshCTM, sites, svg, vCanvas, wrap }, live);
  function hostFrost(...a) { return hostFrost$(...a); }   // <stage-split stub>
  function frostOver(...a) { return frostOver$(...a); }   // <stage-split stub>
  // The ?perf surfaces list (gpu-surfaces.js): the anatomy's own surfaces, each from state this file already keeps. Read by the readout
  // only (twice a second while it is open); without ?perf no getter here is ever called.
  {
    // (A row's answer is one kept record, rewritten by each getter; the readout copies it at once: gpu-surfaces.js surfaceRows.)
    const SR = { on: '', via: '', why: '' };
    const sr = (on, via, why) => { SR.on = on; SR.via = via; SR.why = why; return SR; };
    const notGPU = () => (SOFTWARE ? 'software renderer (WebGL drawn on the CPU)' : !veins ? 'no WebGL2' : veins.lost ? 'context lost' : 'the GPU is not drawing the figure now');
    const anatOn = () => !anatCovered();
    surface('figure canvas', () => {
      if (!anatOn()) return null;
      const mp = (vCanvas.width * vCanvas.height) / 1e6, cap = figOpt('cap');
      const via = `${vCanvas.width}x${vCanvas.height}, ${mp.toFixed(1)} MP${cap ? ` of the ${cap} MP budget` : ', no budget'}, quality step ${quality}${saverOn ? ', Battery saver' : ''}`;
      return SOFTWARE || !veins ? sr('fallback', via, notGPU()) : sr('gpu', via, '');
    });
    surface('vessels and blood', () => {
      if (!anatOn()) return null;
      return wrap.classList.contains('gl-on') && veins && !veins.lost && !SOFTWARE ? sr('gpu', 'WebGL2', '') : sr('fallback', wrap.classList.contains('gl-on') ? 'WebGL2 on the CPU' : 'SVG', notGPU());
    });
    surface('organs', () => {
      if (!anatOn()) return null;
      if (!veins || veins.lost || !wrap.classList.contains('gl-on')) return sr('fallback', 'SVG', notGPU());
      if (wrap.classList.contains('gl-plate')) return sr(SOFTWARE ? 'fallback' : 'gpu', veins?.organs?.full ? 'every layer painted live on the GPU (its pictures not in yet)' : glOrgans ? 'GPU picture and live layers' : 'GPU picture', SOFTWARE ? notGPU() : '');
      return sr('fallback', 'SVG', 'the organs\' picture is down (a theme change, or stale after the lobule)');
    });
    surface('overlays (stents, balloons, catheter, guides)', () => {
      if (!anatOn() || !overNow.units) return null;
      if (!OVER_ON) return sr('fallback', 'SVG', notGPU());
      if (!overNow.painted) return sr('fallback', 'SVG', !wrap.classList.contains('gl-on') ? notGPU() : 'the first overlay group the painter cannot read is the lowest');
      return overNow.whole ? sr('gpu', `WebGL2, ${overNow.painted} groups`, '') : sr('mixed', `${overNow.painted} groups on the GPU`, 'the first group the painter cannot read, and every group above it, stay SVG');
    });
    surface('labels', () => {
      if (!anatOn() || !visible(labelSvg)) return null;
      if (!labelGL || labelGL.lost) return sr('fallback', 'SVG', !labelGL ? (SOFTWARE ? 'software renderer' : 'no WebGL2') : 'context lost');
      const c = labelGL.counts();
      if (!c.labels) return null;
      const svgN = c.svg + c.marks;
      return svgN ? sr(c.svg === c.labels ? 'fallback' : 'mixed', `${c.labels - c.svg} of ${c.labels} labels on the GPU${c.marks ? `, ${c.marks} marks on SVG` : ''}`, 'a filter, letter spacing, a focus ring or a part the atlas cannot draw') : sr('gpu', `WebGL2, ${c.labels} labels`, '');
    });
    const glassRow = (g, none) => () => {
      if (!anatOn()) return null;
      if (document.documentElement.hasAttribute('data-noglass')) return sr('fallback', 'solid, no blur', document.documentElement.hasAttribute('data-noglass-auto') ? 'blur off by itself on a software renderer or Battery saver' : 'Settings › Blur effect off');
      const gl = g();
      return gl ? gl.state() : none();
    };
    const blurAsk = () => sr('fallback', 'browser blur', SOFTWARE ? 'software renderer' : !veins ? 'no WebGL2' : 'no GPU glass made');
    surface('callout glass', glassRow(() => glassGL, () => (document.getElementsByClassName('cl-glass').length ? blurAsk() : null)));
    surface('card glass', glassRow(() => { for (const g of cardGLs) if (g.state()) return g; return null; }, () => (document.querySelector('.pz-shade') ? blurAsk() : null)));
  }
  // The callouts' glass: one region of stage.glass.add over both callout layers' glass bodies (callout.js .cl-glass), each its outline path (read from
  // its model), its size from its style, its tint the surface at the glass's strength and its soft shadow the callout's own box-shadow, drawn under
  // the callouts (its turn between the cards' two); asked for again by glass.add while the figure's canvas is not made yet.
  {
    const body = [], layers = [cath.labels, sites.el];
    const NUMPX = (v) => parseFloat(v) || 0;
    glassAdd.add(() => { body.length = 0; for (const l of layers) { const c = l.getElementsByClassName('cl-glass'); for (let i = 0; i < c.length; i++) body.push(c[i]); } return body; }, {
      callouts: true, blur: CARD.blur, card: true, before: cath.labels, watch: layers, outer: true, shadow: true,   // (the one glass: CARD, as every card's)
      tint: (g, cs) => cs.getPropertyValue('--surface'),
      shape: (g) => { const d = g.firstChild?.firstChild?.getAttribute?.('d'), w = NUMPX(g.style.width), h = NUMPX(g.style.height); return d && w && h ? { d, w, h } : false; },
    });
  }
  // (The list is one of two kept arrays taken in turn: the labels' picture holds the last list it was given until the next, so the one it holds is never the one filled.)
  let labelGlA = [], labelGlB = [];
  // (Only a label laid out for the view shown now is handed to the GPU: a block the new view does not use keeps the place it had in the old one, and was drawn from it.)
  const labelGlAdd = (b) => { if (b.pos && b.pos.view === morphTarget && b.g.style.display !== 'none') labelGlA.push(b.pos); };   // (a label gone (display none) is not handed on: its point may be gone with its slide)
  const labelGlSync = () => { if (!labelGL || glSuppress) return;
    const t = labelGlA; labelGlA = labelGlB; labelGlB = t; labelGlA.length = 0; pool.forEach(labelGlAdd); labelGL.sync(labelGlA); };
  const { CIRCUIT_LABEL_K, TURN_DIR, deskK, deskMQ, textW } = createLabelText({ updateLabels }, live);

  // The figure's text is at its one size (Mohammad, 11 Nov 2026: the "Text size on the figure" setting removed everywhere): 100 %, with a
  // desktop's baseline (deskK). A size an older build saved is dropped, so it can never apply again.
  const labelScale = 1;
  try { localStorage.removeItem('pps.labelScale'); localStorage.removeItem('pps.labelScaleV'); } catch (e) { caught('stage:labelScale', e); /* storage unavailable */ }
  // Every label on a figure (the lobule's too) reads the same scale.
  document.documentElement.style.setProperty('--label-k', String(labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(labelScale)); document.documentElement.style.setProperty('--ts', String(labelScale));
  let labelK = labelScale * deskK();
  // Projection ramp: presenting sets the atlas labels at projector sizes (at 2: values 28 px, names 23 px),
  // readable from the back of a room. The presenter passes a scale for the screen it is on.
  let projecting = false;
  const { LINE_H, fontPx, labelBase, lineW } = createLabelSize({ deskK, deskMQ, textW }, live);

  const pool = new Map(); // key → { g, sig, … }
  // Tap a label to explain it (N4, label-explain.js): the tapped station's label grows a line of its own (name and live value, drawn by the GPU with
  // it, so it rides with it), the rest of the labels and their leaders step back to 35 % (.spot-dim, app.css). explainApply sets the classes.
  const explain = createExplain(() => explainChanged());
  const { MARK_GRID, PULL_GRID, REF, blockWant, labelGlide, labelStop, leadEls, paintLeaders, rectOf, renderBlock, termTone } = createLabelLayer({ ANCHOR_W, LABEL_GLIDE_MS, LINE_H, NO_ANCHOR, dprDots, easeInOut, explain, fontPx, gLeaders, late, lateQueue, localToWorldInto, nextFrame, onSelect, pinKind, pool, setA, toneCol, unlitKeys, updateLabels, wrap }, live);
  let frameNo = 0;
  // A label the layout moves (a slide's or a patient's change found it a new spot) glides there instead of jumping (17 Oct: "labels and
  // callouts all snap"). It keeps its offset from the point it names, so it still follows the camera exactly and only a change of that
  // offset eases; labels with no point (the organs' names, the lanes) glide only while the camera is still. A label just shown, or one
  // laid out while the figure is hidden (the presenter's camera move, the catheter, the lobule), takes its spot at once.
  let glideCam = '', glideRaf = 0;
  // (The frame number of the layout that last wanted the labels it asked for: what a label built or rewritten between layouts counts as
  // seen in. frameNo itself moves on when a layout starts, and a sliced solve runs across several frames before it lands: a label built
  // meanwhile for the last layout's wishes was stamped with the unfinished layout's number, so that layout's sweep for labels it did not
  // want skipped it and it stayed on screen, whole, until the next layout.)
  let laidFrame = 0;

  const { ANAT_EXTRA, ANAT_PRI, BLOCK_IO, beatMean: beatMean$, blockersRead: blockersRead$, calloutBoxes, calloutSig, changeRef, hasVarices, isImaging, labelAnchor: labelAnchor$, labelHidden, layerMode: layerMode$, leadRectOf, leaderEnd, nodeItem, oneLine, pzInset, readBlockersRead: readBlockersRead$, ripple, scanItem, seenEnd, shortenItem, shortenTo, sigFold, velItem } = createLabelItems({ E, EI, EV, LINE_H, NI, REF, STENT_FACTORS, arcMid, breath, cath, cssNum, dopGateOf, dpr, explain, fontPx, geo, lensNow, lineW, mix3, nextFrame, noGlows, nodePos, pinned, quietFx, revShown, scan, setGlowSrc, sites, stageBox, svg, termTone, textW, toRGB, update, updateLabels, worldToLocalInto, wrap }, live);
  function layerMode(...a) { return layerMode$(...a); }   // <stage-split stub>
  function beatMean(...a) { return beatMean$(...a); }   // <stage-split stub>
  function blockersRead(...a) { return blockersRead$(...a); }   // <stage-split stub>
  function readBlockersRead(...a) { return readBlockersRead$(...a); }   // <stage-split stub>
  function labelAnchor(...a) { return labelAnchor$(...a); }   // <stage-split stub>





  let creditKept = null;
  // ── Label placement ──
  // A label's slot is solved in figure terms and then carried rigidly: it is stored as the figure
  // point it names (its anchor, in world coordinates) plus a fixed pixel offset to its box. A pan
  // therefore only translates every label, and a zoom moves each with its anchor. Nothing is
  // searched again until the layout or the zoom genuinely changes (see labelSig). When it is, the
  // solve is sticky: a label keeps its slot unless that slot now collides. Screen-fixed things
  // (panels, cards, the stage edge) never move a label: a label under one is hidden until it clears.
  let colResolve = 0;   // (when a carried stent column last asked to be placed again: see layoutLabels)
  let labelSol = new Map();   // key → solved slot { wx, wy, dx, dy, dir, pi, w, h, leader, lead } or { drop }
  let solvedFor = null;       // { sig, sc, th } the slots were solved for
  const { JOB_NOW, KEY_NODES, SOLVED_A, SOLVED_B, SOLVE_TURN, cathHid, flagged, handRideEnd: handRideEnd$, keyInto, labelIns, labelJobDrop: labelJobDrop$, labelJobStep: labelJobStep$, labelKeyArr, labelKeyNow: labelKeyNow$, labelRestK: labelRestK$, labelSettleSoon: labelSettleSoon$, labelSig: labelSig$, labelSliceRun: labelSliceRun$, labelTail: labelTail$, labelVis, sigWidthMoved, sliceOver, stats, stentReady, updateLabels: updateLabels$, zoneStick, zoomedIn } = createLabelDriver({ E, EI, EV, LABEL_FIRST_REST_MS, LABEL_REST_SLICE_MS, LABEL_SLICE_MS, calloutSig, camSettle, cath, dop, dpr, dprobePaint, easeInOut, explain, fxBuild, glideXfEnd, hasVarices, isImaging, labelBase, labelGlSync, layerMode, layoutLabels, layoutLabelsGen, nextFrame, nodeItem, pre, preAsk, pzInset, refreshCTM, renderBlock, resItem, rideNow, rideStart, rideStop, sameDeps, scan, scanItem, scanPaint, shortenTo, sigFold, sites, sitesPaint, stageBox, themeKey, velItem, wrap, xfMarkCurrent, xfRelease }, live);
  function labelRestK(...a) { return labelRestK$(...a); }   // <stage-split stub>
  function labelSettleSoon(...a) { return labelSettleSoon$(...a); }   // <stage-split stub>
  function labelSig(...a) { return labelSig$(...a); }   // <stage-split stub>
  function updateLabels(...a) { return updateLabels$(...a); }   // <stage-split stub>
  function handRideEnd(...a) { return handRideEnd$(...a); }   // <stage-split stub>
  function labelTail(...a) { return labelTail$(...a); }   // <stage-split stub>
  function labelSliceRun(...a) { return labelSliceRun$(...a); }   // <stage-split stub>
  function labelJobDrop(...a) { return labelJobDrop$(...a); }   // <stage-split stub>
  function labelJobStep(...a) { return labelJobStep$(...a); }   // <stage-split stub>
  function labelKeyNow(...a) { return labelKeyNow$(...a); }   // <stage-split stub>
  let lapHid = new Set();     // keys the last layout's overlap pass hid (its hysteresis)
  let labelTurned = false;   // labels remember their side; turning the circuit changes which side is right
  let carryClear = false, labelSettleT = 0, solveAsked = false;   // (solveAsked: the next layout is a solve whatever the camera did, with the standing labels carried first)
  // (During a hand's zoom in the Circuit, a carried reading that comes onto a station's ring is placed again by itself (carryReslot),
  // the others carried; once let go every reading is solved again (reslotted). Its rings grow with the zoom while a reading keeps its
  // offset, so a few per cent of a pinch had solved every reading again, nearly every frame: Mohammad, 26 Oct, "the problem is
  // during the zoom itself it's very very choppy", and his pick "Re-place only the bumped reading".)
  let carryReslot = false, reslotted = false;
  // A hand's zoom in the Circuit: the readings ease out as it starts, are not laid out while it lasts, and ease back in, solved for
  // where the view stopped, once it is let go. Mohammad, 26 Oct, his pick "Both,
  // readings first" for "the problem is during the zoom itself it's very very choppy". A pan alone keeps them, carried.
  // A vessel's width as the labels see it: it moves only once the vessel has changed by 2 px, so a width
  // easing or hovering at a rounding edge does not lay the labels out again on every model update.
  const sigW = new Map();
  // A stent's velocity callout waits until the stent has grown in and the flow through it has settled: while it draws on,
  // widens, or the presenter eases the model to a new patient, the reading swings through values no scan would show.
  const STENT_CALM_MS = 1200, stentCalm = new Map();   // motion-scale: not a move (a wait for the model to settle)
  // The narrowings' part of the signature, kept per object: a change of parameters always makes new objects (updateParams
  // clones them, and each model frame brings its own), so the same object always gives the same text. The same holds for the
  // slide's marks and terms (the presenter sets new ones per slide) and the cards' boxes (readBlockers returns a new list):
  // their text is built once per object, not on every call (review item 25).
  const paramJSONs = new WeakMap();
  let cathHidAt = 0;
  // The Circuit's solved slots kept by zoom (a quarter octave a step), pan bucket, turn and what the labels show, a few, least recently used out:
  // a settle at a step already solved commits them at once. Only at rest in the Circuit; every label must still fit (the carry says), else it solves.
  const solCache = new Map();
  // The solve running in slices (LABEL_SLICE_MS): its generator, the view's key it was started for and what it was solved for.
  let labelJob = null, sliceEnd = Infinity;
  // Figure point under a local (stage) pixel.
  function localToWorld(x, y) {
    const X = x + wrapRect.left - CTM.e, Y = y + wrapRect.top - CTM.f, det = CTM.a * CTM.d - CTM.b * CTM.c;
    return [(CTM.d * X - CTM.c * Y) / det, (CTM.a * Y - CTM.b * X) / det];
  }
  // (The same point written into a kept pair, for a caller that reads it at once: localWorldXY(x, y) then LW_XY[0], LW_XY[1].)
  const LW_XY = [0, 0];
  function localWorldXY(x, y) {
    const X = x + wrapRect.left - CTM.e, Y = y + wrapRect.top - CTM.f, det = CTM.a * CTM.d - CTM.b * CTM.c;
    LW_XY[0] = (CTM.d * X - CTM.c * Y) / det; LW_XY[1] = (CTM.a * Y - CTM.b * X) / det;
  }
  // Vessel geometry as capsules in screen space, bucketed, so a label can ask exactly which vessels it touches.
  const SEG_CELL = 64;
  let segs = [], segIdx = lineIndex([], worldToLocal, 1, SEG_CELL); const segIdxDry = lineIndexBuf();   // (segIdxDry: the solve ahead's own, built into (buildSegs) between the live layouts' builds)
  // (The vessels as drawn: every tube the GPU draws, the liver's grey branches, strands and tributaries included, each at its
  // drawn radius along its course plus its wall; a label kept clear of these is clear of the picture: Review 16 Oct.)
  // (The lines are records in a kept pool, written in place for each build: lineIndex reads them at once and keeps none. A resistor's
  // zigzag is one shared item for the width and size of its band.)
  const segLines = [], segLinePool = [], segItems = [], segItemPool = [];
  const ZZ_ITEM = { x: { width: 22 }, obj: { w: 22 }, pts: null, kind: 'z' };
  function segLine(n, it) {
    const x = it.x, rec = segLinePool[n] || (segLinePool[n] = { pts: null, R: undefined, wall: 0, flat: 0, id: '' });   // (more lines than ever before: one more is made)
    rec.pts = it.pts; rec.R = it.obj.glR; rec.wall = x.isArt && !x.tube ? 0 : x.wallPx || 0; rec.flat = it.kind === 'v' ? (x.width || 4) / 2 : (it.obj.w || 2) / 2; rec.id = x.e ? x.e.id : 'res';   // (a resistor's zigzag has no vessel)
    segLines[n] = rec;
  }
  function buildSegs(into = null) {
    let items = segItems, count = 0;
    if (glWanted()) items = glItems();
    else {
      for (let i = 0; i < EV.length; i++) {
        const x = EV[i];
        if (!x.vis || !geo[x.e.id]?.cur) continue;
        const it = segItemPool[count] || (segItemPool[count] = { x: null, obj: null, pts: null, kind: 'v' });   // (more vessels than ever before: one more is made)
        it.x = x; it.obj = x; it.pts = geo[x.e.id].cur; it.kind = 'v';
        segItems[count++] = it;
      }
      segItems.length = count;
    }
    // (A resistor's zigzag stands as a band as wide as its teeth: "4.1" had sat on the liver's.)
    // (The lines as plain data (seg-hits.js lineIndex), so the same index can be built where the solver runs: plan rev 2 step 2.)
    let n = 0;
    for (let i = 0; i < items.length; i++) segLine(n++, items[i]);
    for (const g of resMade.values()) {
      const zs = g._segs;
      if (!zs?.length) continue;
      for (let i = 0; i < zs.length; i++) { ZZ_ITEM.pts = zs[i]; segLine(n++, ZZ_ITEM); }
    }
    segLines.length = n;
    segIdx = lineIndex(segLines, worldToLocal, CTM.sc, SEG_CELL, into);
    if (!into) segs = segIdx.segs;
  }
  // How many vessel segments the box touches, a vessel's own width and `margin` px of air included (`skip`: true asks only whether
  // one does; a vessel's id leaves that one out; { only: id } counts just that one).
  const lineHits = (r, margin, skip = false) => indexHits(segIdx, r, margin, skip);
  // For the browser check (Review 16 Oct): every TIPS point callout, the slide's mark and the "60 %" on screen, with its drawn box
  // (halo or pill edge included) in screen px, its clearance from the nearest drawn vessel (negative: on it), the vessel, and for a
  // point how far its middle sits from its dot. The "60 %" leaves its own stent out; nothing else does.
  function clearanceReport() {
    if (!wrap.isConnected) return [];
    buildSegs();
    const wr = wrap.getBoundingClientRect(), out = [{ key: 'stage', top: wr.top, left: wr.left, dots: dop.id && geo[dop.id]?.cur?.length > 1 ? ['proximal', 'mid', 'distal'].map((pt) => worldToLocal(...pointAt(geo[dop.id].cur, STENT_SITES[pt]))) : [] }];
    const dist = (sg, r) => {
      if (segHitsBox(sg, r, 0)) return -sg.hw;
      const pd = (px, py) => { const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0, L2 = dx * dx + dy * dy || 1, t = clamp(((px - sg.x0) * dx + (py - sg.y0) * dy) / L2, 0, 1); return Math.hypot(px - sg.x0 - dx * t, py - sg.y0 - dy * t); };
      const bd = (px, py) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
      return Math.min(bd(sg.x0, sg.y0), bd(sg.x1, sg.y1), pd(r.x0, r.y0), pd(r.x1, r.y0), pd(r.x0, r.y1), pd(r.x1, r.y1)) - sg.hw;
    };
    const near = (r, skip) => { let best = { d: Infinity, id: null }; for (const sg of segs) { if (sg.id === skip) continue; const d = dist(sg, r); if (d < best.d) best = { d, id: sg.id }; } return best; };
    const box = (el, grow) => { const q = el.getBoundingClientRect(); return { x0: q.left - wr.left - grow, y0: q.top - wr.top - grow, x1: q.right - wr.left + grow, y1: q.bottom - wr.top + grow }; };
    const sid = dop.id, dots = sid && geo[sid]?.cur?.length > 1 ? Object.fromEntries(['proximal', 'mid', 'distal'].map((pt) => [pt, worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[pt]))])) : {};
    for (const g of document.querySelectorAll('#labels g.lb')) {
      const key = g.dataset.key || '';
      if (!/^(n:TIPS:|n:DIPS:|focus)/.test(key) || g.closest('.lb-samples')) continue;   // (a look's sample is no label: stage-label-layer.js)
      const shown = g.style.display !== 'none' && !g.classList.contains('lb-off');
      // (A label the GPU draws holds only its name: its box is its pointer's rect, over its laid-out box with its padding, and its pieces' styles its look's sample's. L3 P10.)
      const lb = pool.get(key), lean = !!lb?.lean && lb.g === g, sm = lean ? lb.pos?.sample : null;
      const pill = (sm || g).querySelector('rect.lb-bg'), t = (sm || g).querySelector('text');
      const halo = lean || (pill && /^focus/.test(key)) ? 0 : (parseFloat(t && getComputedStyle(t).strokeWidth) || 0) / 2;
      const r = box(lean ? lb.pick : pill && /^focus/.test(key) ? pill : t || g, halo), n = near(r, null), pt = key.split(':')[2], d = dots[pt];
      out.push({ key, shown, box: [r.x0, r.y0, r.x1, r.y1].map((v) => +v.toFixed(1)), clear: +n.d.toFixed(2), vessel: n.id, level: d ? +((r.y0 + r.y1) / 2 - d[1]).toFixed(1) : null, ring: g.classList.contains('ring') ? (parseFloat(pill && getComputedStyle(pill).strokeWidth) || 0) / 2 : 0 });
    }
    for (const el of document.querySelectorAll('.clamp-label')) {
      if (!el.getClientRects().length || !(el._txt ?? el.textContent)) continue;
      const r = box(el, (parseFloat(getComputedStyle(el).strokeWidth) || 0) * (CTM.sc || 1) / 2), n = near(r, el._c?.id);
      out.push({ key: `60%:${el._c?.id}`, shown: true, box: [r.x0, r.y0, r.x1, r.y1].map((v) => +v.toFixed(1)), clear: +n.d.toFixed(2), vessel: n.id, level: null });
    }
    return out;
  }
  // `solve`: search (stickily) and record the slots; otherwise carry the recorded slots. Returns false
  // when a label turned up that has no slot or no longer fits its slot: the caller then solves.
  // (dry: a solve that only finds the slots (labelSol) and draws nothing: for a framing the camera has not reached yet.)
  // (All at once: a carry, a dry solve, a solve with slicing off. Any solve still in slices gives way to it; the solve ahead (preStep), with scratch of its own, only to a dry one.)
  function layoutLabels(f, solve, dry = false) {
    if (labelJob) labelJobDrop();
    if (dry) preAbort();
    const g = layoutLabelsGen(f, solve, dry);
    let r;
    do r = g.next(); while (!r.done);
    return r.value;
  }
  // (The solver keeps what a layout carries from label to label in two records written in place: the live layout's and the solve ahead's.)
  let lbkNum = NaN, lbkStr = '', labelSolSpare = new Map();
  const { layoutLabelsGen: layoutLabelsGen$ } = createLabelSolve({ ANAT_EXTRA, ANAT_PRI, CIRCUIT_LABEL_K, E, EBOX, EI, KEY_NODES, LINE_H, LW_XY, MARK_GRID, NI, NO_BLK, PIN_DIR, PULL_GRID, TURN_DIR, ZONE_SHORT, arcMid, blockWant, buildSegs, caliperAt, caliperSegs, calloutBoxes, cath, cathRadOf, clampD, clampFontAt, clampLabelAt, clampLabelPos, clampMv, clampStep, clampTextBox, clampW, colGap, dop, dpr, easeInOut, flagged, fontPx, fxBuild, fxK, fxPill, gLabels, gScan, geo, hasDot, hasVarices, isImaging, labelAnchor, labelBase, labelGlide, labelHidden, labelStop, labelVis, laneAlt, laneU, leadEls, leadRectOf, leaderEnd, lineHits, lineW, liverExpanded, localToWorld, localWorldXY, nodeItem, nodePos, onSelect, oneLine, organEls, ov, paintLeaders, pointAt, pool, procIn, pzInset, rectOf, renderBlock, resItem, resPlace, saSides, scan, scanTipLocal, seenEnd, shortenItem, shortenTo, sites, sliceOver, stageBox, stagePx, stenosisAt, stentReady, textW, velItem, vh, worldToLocal, worldToLocalInto, zoneStick, zoomedIn }, live);
  function* layoutLabelsGen(...a) { return yield* layoutLabelsGen$(...a); }   // <stage-split stub>
  // A station's marker (its dot, its label, the Δ ring) shows only while a vessel is drawn at it (circuit-nodes.js): a vessel the
  // plate leaves out, or one still closed, leaves no dot floating where it would end, and one that draws on or retracts brings
  // its far end's marker in once it has arrived and takes it away as it withdraws.
  const NODE_ENDS = nodeEnds(ALL_EDGES, (e) => E[e.id]);
  const nodeVisible = (id) => !(ANAT_HIDDEN_NODES.has(id) && morph < 0.5) && nodeDrawn(NODE_ENDS[id]);

  const { bloodLook, bloodOn, bolus, chevOn, injectDye, originOn, restStill, sprayFading, sprayOn, stepBlood, stepRest, stepSpray, streams } = createBlood({ E, EI, EV, GL_ROWS, SIDE_HOSTS, bal, cath, easeInOut, geo, glow, holdReversals, layerMode, revHold }, live);
  let origins = null, originsF = null, bloodClock = 0, dyeShown = false;
  let bloodEasing = false;
  let restOn = false, restU = 1, restK = 1;

  // Active variceal bleeding: a steady stream runs from the rupture down into the stomach, where it pools (blood.js
  // bleedShapes, no pulse). Each: [x0, y0, x1, y1, r0, r1, alpha, kind] (veins-gl.js): the pool (kind 0) or the stream (kind 2).
  // (It fades in on a rupture and out once the bleed stops, or as the circuit view takes over: sprayA, stepped in animate;
  // while it fades out it keeps the last bleed seen.)
  let sprayA = 0, sprayLast = null;

  let lastT = performance.now(), lastDrawF = null, lastDrawCTM = null, lastAnim = true, pinMorph = -1;
  // (The still frame's key, rev 2 §2.8: two structs mutated in place, the frame's own and the last drawn one's; on: the last drawn
  // frame was still, so it has a key to match.)
  const keyNow = { on: true, cath: 0, morph: 0, rot: 0, cls: '', flow: undefined, blood: '', w: 0, h: 0, holes: '' };
  const keyDrawn = { on: false, cath: 0, morph: 0, rot: 0, cls: '', flow: undefined, blood: '', w: 0, h: 0, holes: '' };
  function stillKey(k, st) { k.cath = cathVer; k.morph = morph; k.rot = rotU; k.cls = wrapCls(); k.flow = st.layers.flow; k.blood = bloodKey; k.w = vCanvas.width; k.h = vCanvas.height; k.holes = holesKey; }
  const sameStill = (a, b) => a.cath === b.cath && a.morph === b.morph && a.rot === b.rot && a.cls === b.cls && a.flow === b.flow && a.blood === b.blood && a.w === b.w && a.h === b.h && a.holes === b.holes;
  function copyKey(a, b) { b.on = true; b.cath = a.cath; b.morph = a.morph; b.rot = a.rot; b.cls = a.cls; b.flow = a.flow; b.blood = a.blood; b.w = a.w; b.h = a.h; b.holes = a.holes; }
  // The anatomy shows through a dive or a rise (not yet covered, not faded out under the landing) and something on it moves: the
  // fluid, a vessel's width or coil, an organ, a vessel drawing on or off, a fade, or a vessel layer to draw again.
  const anatEasing = () => !!F && liveOn() && !anatCovered() && !diveHid && diveFadeO !== 0 &&
    (widthEasing || ascShown !== ascTarget || veinsDirty || lvMoving || spleenMoving() || plateEasing() || clampFading() || markA.moving() || anyReveal());
  // Whether the figure moves by itself while the model runs (see animate).
  function figureMoves(st) {
    if (!st.running || reduceMotion.matches || restStill()) return false;
    return bloodOn() || (chevOn() && !cath.st) || fluidLook.ripple || sprayOn() || sprayA > 0;
  }
  let drawnView = -1;
  let flowGate = lastT;
  // (The calm blood's pace, and how long nothing else may have moved before it counts: see animate.)
  // (CALM_MS 32 -> 0, 4 Nov 2026: the calm 30 Hz blood is taken out while the figure flicker is chased; the steady motion's 60 stands.)
  const CALM_MS = 0, CALM_AFTER_MS = 600;   // motion-scale: not a move (a wait before the calm blood)
  let busyAt = 0;
  // On a software renderer only (WebGL drawn on the CPU), a vessel frame waits for the last to finish on the GPU and gives the
  // page as long again (see sw-yield.js); on a GPU there is no yield (null) and the loop below is unchanged.
  let swYield = softwareYield(SOFTWARE, SOFTWARE ? vCanvas.getContext('webgl2') : null);
  // The overlays on the GPU (stage-over.js, veins-gl overlay; ?stageover=gpu): the lowest run of #stageOver's groups the painter can
  // read is painted in the vessel canvas, and its SVG copy hidden (OVER_CLASS). Read again when anything in the overlays changes that
  // the painter does not read at each paint (needsReread), when the page's state around them changes (overKey), and while a CSS
  // transition runs in a group (overEasing: the browser eases it, so that group and those above stay in the SVG until it ends).
  // (OVER_ON is set just after SOFTWARE, near the top: the labels' host below the vessel canvas reads it while the stage is made.)
  let overDirty = true, overKeyWas = -1, overPainted = [], overFor = null, overStop = null, overKeptFor = null;
  let overNow = { units: 0, painted: 0, whole: false };   // (the last sync's overlay groups, for the ?perf surfaces list)
  // (How long an element's CSS transitions run, ms, read once a reading: a value the painter reads at each paint, eased by them.)
  let overTrans = new WeakMap();
  const transMs = (el) => {
    let ms = overTrans.get(el);
    if (ms === undefined) {
      const cs = getComputedStyle(el), d = cs.transitionDuration.split(','), w = cs.transitionDelay.split(',');
      ms = Math.max(0, ...d.map((v, i) => ((parseFloat(v) || 0) + (parseFloat(w[i] ?? w[0]) || 0)) * 1000));
      overTrans.set(el, ms);
    }
    return ms;
  };
  const overCheck = new Set();   // (elements written since the last reading, their transitions read at the next)
  const overEasing = new Map();   // element → when its ease ends at the latest (performance.now), for a transition that never reports
  // (A pan's, a pinch's or a glide's own classes on the app and the stage change no overlay's look: gestureFree, as the organs' readings.)
  // (Asked on each paint: a version number, stepped when a part of the key differs from the last ask's: the app's classes without a
  // gesture's own, the page's, the stage's, the overlays' without OVER_ALL, the theme and palette, reduced motion. No joined string is
  // built; a class text is worked on only when its raw text has changed.)
  let okAppRaw = null, okApp = '', okDoc = null, okWrap = null, okOverRaw = null, okOver = '', okTheme = null, okPal = null, okRM = null, okVer = 0;
  const overKey = () => {
    let changed = false;
    const a = appEl?.className || '', d = document.documentElement.className, w = wrapCls(), o = svgOver ? svgOver.getAttribute('class') || '' : '';
    if (a !== okAppRaw) { okAppRaw = a; const f = gestureFree(a); if (f !== okApp) { okApp = f; changed = true; } }
    if (o !== okOverRaw) { okOverRaw = o; const f = svgOver ? [...svgOver.classList].filter((c) => c !== OVER_ALL).join(' ') : ''; if (f !== okOver) { okOver = f; changed = true; } }
    const ds = document.documentElement.dataset, th = ds.theme, pal = ds.palette, rm = reduceMotion.matches;
    if (d !== okDoc || w !== okWrap || th !== okTheme || pal !== okPal || rm !== okRM) { okDoc = d; okWrap = w; okTheme = th; okPal = pal; okRM = rm; changed = true; }
    return changed ? ++okVer : okVer;
  };
  // (Set up once, at start-up where the overlays are on the GPU, or by renderPath if a restore makes them possible.)
  let overWatching = false;
  // Each unit's reading, kept until something in it changes in a way the painter does not read at each paint (needsReread), the
  // overlays' look changes (overKey), or a unit's ease ends: a slide change that rewrote one unit read every unit again, every frame
  // (2 Nov 2026, the Varices 2 to 3 budget: ~1,400 style reads).
  const overKept = new Map();
  function overDrop(t) {
    if (!worldOver) { overKept.clear(); return; }
    // (The unit holding it: a child of the overlays' world, or of their own group; a change to those containers drops them all.)
    for (let n = t; n; n = n.parentNode) {
      const p = n.parentNode;
      if ((p === worldOver && n !== gOver) || p === gOver) { overKept.delete(n); return; }
      if (n === worldOver || n === svgOver) break;
    }
    overKept.clear();
  }
  function overWatch() {
    if (overWatching) return;
    overWatching = true;
    const watch = new MutationObserver((rs) => {
      for (const r of netChanges(rs)) {
        if (needsReread(r)) { overDirty = true; overDrop(r.target); continue; }
        // (A value the painter reads at each paint, eased by the page's CSS: the browser shows the ease, so the group waits in the SVG.
        // An outline's d is not eased by any of the overlays' styles.)
        // (2 Nov 2026: its transitions are read in the next frame's read phase (overReadNow), not here, in the observer's microtask
        // straight after the page's writes, where the read laid the page out.)
        // (The hiding classes' own coming and going (OVER_CLASS, OVER_ALL) is no write of the page's to look at: a group that fades (the
        // circuit's, .circuit-only, 420 ms) was read as easing the moment the GPU took it, was handed back to the SVG, and again as that
        // class came off, so the resistors' zigzags and the PPG bracket hopped between the two painters, which drew them a little apart:
        // the flicker on the circuit slides. Mohammad, 2 Nov 2026.)
        if (r.attributeName === 'class') continue;
        if (r.attributeName !== 'd' && r.target.nodeType === 1) {
          overCheck.add(r.target);
        }
      }
      askAnimate();
    });
    watch.observe(svgOver, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
    const ran = (e) => { overEasing.set(e.target, performance.now() + 60000); overDirty = true; askAnimate(); };
    const ended = (e) => { overEasing.delete(e.target); overDrop(e.target); overDirty = true; askAnimate(); };
    svgOver.addEventListener('transitionrun', ran);
    svgOver.addEventListener('transitionend', ended);
    svgOver.addEventListener('transitioncancel', ended);
  }
  if (OVER_ON) overWatch();
  // (Every SVG copy shown again: the GPU paints none of them now.)
  function overClear() {
    for (const u of overPainted) u.classList.remove(OVER_CLASS);
    overPainted = [];
    svgOver?.classList.remove(OVER_ALL);
    overKept.clear();
    overNow = { units: worldOver ? overUnits(worldOver, gOver).length : 0, painted: 0, whole: false };
    overDirty = true;
  }
  // (A unit or element named for the readout: its id, else its tag and classes.)
  const overName = (el) => (el ? el.id ? `#${el.id}` : `${el.localName}${el.getAttribute('class') ? `.${el.getAttribute('class').trim().split(/\s+/).join('.')}` : ''}` : '?');
  function syncOver() {
    if (!OVER_ON) return;
    // (No picture to paint them in: the context lost, or the GPU not drawing the figure.)
    if (!veins?.overlay || veins.lost || !wrap.classList.contains('gl-on')) { if (overPainted.length || svgOver?.classList.contains(OVER_ALL)) overClear(); return; }
    if (overFor !== veins) { overFor = veins; overDirty = true; }   // (a renderer made again: its overlays are empty)
    veins.overlay.cssPx = boxW > 0 ? vCanvas.width / boxW : 1;   // (a non-scaling stroke's px: the canvas's own over its box's)
    const now = performance.now();
    for (const [el, t] of overEasing) if (t < now || !el.isConnected) { overEasing.delete(el); overDrop(el); overDirty = true; }
    const key = overKey();
    if (key !== overKeyWas || overFor !== overKeptFor) { overKept.clear(); overKeptFor = overFor; }
    if (overDirty || key !== overKeyWas) {
      overDirty = false; overKeyWas = key;
      // (2 Nov 2026, the iPhone trace: the groups' styles were read here, after the frame's writes, and the browser restyled the page in
      // the middle of the frame. They are read first thing in the next frame (readFrame), before any write, and laid then.)
      overNeed = true;
      if (!overAsk) overAsk = readFrame(overReadEarly);
    } else if (overCheck.size && !overAsk) overAsk = readFrame(overReadEarly);   // (only writes to look at: read again if one eases)
    if (!overGot) return;
    const run = overGot;
    overGot = null;
    overApply(run);
  }
  let overAsk = 0, overGot = null, overNeed = false;
  function overReadEarly() {
    overAsk = 0;
    const need = overNeed;
    overNeed = false;
    if (overChecked() || need) { overReadNow(); askAnimate(); }
  }
  // (The written elements' transitions, read in the read phase: true when one of them eases, so the groups are read again.)
  function overChecked() {
    if (!overCheck.size) return false;
    const t = performance.now();
    let eased = false;
    overTrans = new WeakMap();
    for (const el of overCheck) { if (!el.isConnected) continue; const ms = transMs(el); if (ms > 0) { overEasing.set(el, t + ms + 50); eased = true; } }
    overCheck.clear();
    return eased;
  }
  function overReadNow() {
    if (!veins?.overlay || veins.lost || !wrap.classList.contains('gl-on')) { overCheck.clear(); return; }
    overTrans = new WeakMap();
    overChecked();
    const easing = [...overEasing.keys()];
    let why = null;
    const read = (u) => {
      if (easing.some((el) => u.contains(el))) { why = ['easing', easing.find((el) => u.contains(el))]; return null; }
      if (overKept.has(u)) return overKept.get(u);
      const spec = readGroup(u, { nest: true, strict: true });
      if (!spec) { why = readFail(); return null; }
      const r = spec.ops.length ? spec : 'hidden';
      overKept.set(u, r);
      return r;
    };
    const run = overRun(overUnits(worldOver, gOver), read);
    overStop = run.whole ? null : { unit: run.stop, why: why?.[0] || '?', el: why?.[1] || null };
    overGot = run;
  }
  // (The kept shapes (over-records.js) are one more group, last: drawn over the groups the page's SVG gives, in the overlays' own frame.
  // They are laid whether or not the whole run was read: no element of theirs can stop it.)
  const recGroup = { get spec() { return recs.spec; }, get m() { return elMat(gOver); } };
  let overRunLast = null;
  // The overlays' groups sent to the painter again: the page's run as it was last read, and the kept shapes as they stand now.
  function overSend() {
    if (!overRunLast || !recLive()) return;
    overApply(overRunLast);
  }
  function overApply(run) {
    overRunLast = run;
    const groups = new Map(), names = [];   // alloc-rare: the overlays' groups are sent when a group was read again or a kept shape came or went, not on a frame that changed neither
    run.forEach(([u, spec], i) => {
      const n = `o${i}`, up = u.parentNode === gOver ? gOver : null;
      // alloc-rare: one matrix per overlay group, made when the groups are sent (a group was read again or a kept shape came or went)
      const sc = up ? [1, 0, 0, 1, 0, 0] : null;   // (this group's own matrix, written in place at each read and used where it is read)
      groups.set(n, [{ spec, get m() { const own = elMat(u); return up ? mulTo(sc, elMat(up), own) : own; } }]);
      names.push(n);
    });
    if (recs.spec) { groups.set('rec', [recGroup]); names.push('rec'); }
    recVer = recs.ver;
    veins.overlay.set(groups, names);
    const now2 = new Set(run.map(([u]) => u));
    for (const u of overPainted) if (!now2.has(u)) u.classList.remove(OVER_CLASS);
    for (const u of now2) u.classList.add(OVER_CLASS);
    overPainted = [...now2];
    svgOver.classList.toggle(OVER_ALL, run.whole);
    overNow = { units: worldOver ? overUnits(worldOver, gOver).length : 0, painted: run.length, whole: run.whole };   // (for the ?perf surfaces list)
    if (gpuProbe.on) gpuProbe.gauge('overlays on the GPU', run.whole ? `all (${run.length} groups)` : `${run.length} groups, stopped at ${overName(overStop.unit)} (${overStop.why}${overStop.el && overStop.el !== overStop.unit ? ` in ${overName(overStop.el)}` : ''})`);
  }
  // The figure's pass is one owned request (animRaf): however many paths ask for it (its own loop, a wake), it is drawn once a frame.
  let animRaf = 0;
  const askAnimate = () => { if (!animRaf) animRaf = drawFrame(animate); };
  function animate(now) {
    animRaf = 0;
    // A view moved by a frame's own callback (a glide's step, the catheter's camera following the tip) asked its sync (labels, leaders,
    // callouts, cards) for the NEXT frame (frame.js: a callback asked for while the frame runs waits), while this pass draws the vessels at
    // the new view: the figure's names and their lines trailed it by a frame, "they don't stick" (Mohammad, 2 Nov 2026, the TIPS animation).
    // Still waiting here, it runs first, so the labels, the lines and the vessels are all drawn for the same view in this frame.
    if (viewRaf) { cancelFrame(viewRaf); syncView(); }
    cathLabelsNow();
    // The blood moves by elapsed time, so speeds and transitions are the same at any frame rate.
    // (Render-cost plan 1: the page hidden, the home screen or the presenter's black screen over the stage, seen.js: nothing is drawn.)
    if (stageCovered()) { lastT = flowGate = now; trimVeins(); sleep(); return; }
    // The dive magnifies the figure as it stands (a compositor scale): at rest, nothing under it is redrawn until it lands. While the
    // anatomy still shows and something on it eases (anatEasing), the frame goes on below and draws it, as anywhere else: the
    // patient's changes never pause for the zoom. (The box is measured without the dive's scale: measureBox.)
    if (diveT > 0 && diveT < 1 && !drawOnce && !forceDraw && !anatEasing()) {
      // (The plate holds still through the dive, measured before its zoom, but while the anatomy still shows, its blood keeps
      // moving: never frozen physiology. No update or refreshCTM here: the box measured under the zoom would be wrong.
      // Round 2 review, B9.)
      if (F && veins && !veins.lost && vLook && !diveHid && diveFadeO !== 0 && store.get().running) {
        stepBlood(Math.min(0.1, (now - lastT) / 1000));
        veins.composite(vLook, bloodLook(), false);
      }
      lastT = flowGate = now; askAnimate(); return;
    }
    // (Only the model's own motion waits its turn there: a pan, zoom, glide or forced draw is drawn in this frame, with the
    // rest of the figure that has already moved, never a frame behind it.)
    if (swYield && !swYield.ready(now, forceDraw || drawOnce || viewVersion !== drawnView)) { askAnimate(); return; }
    // (Settings › Figure performance › Motion at 60 (frame.js): on a faster screen, a frame of the model's own motion under 10 ms
    // after the last drawn one waits. No phase is carried, so a 120 Hz screen draws exactly every other frame.)
    const m60 = !paceOf(quality) && figLab('motion60');
    // A pan or zoom redraws at once (the picture must stay under the pointer); only the model's
    // own motion is paced, and only on a lower step (see QUALITY).
    const viewMoved = viewVersion !== drawnView;
    // Calm (pure GPU plan C2): nothing but the blood has moved for CALM_AFTER_MS (no camera, glide, ease, redraw of the vessel layer, input
    // or idle-rest change), so the flow alone is drawn, at 30 Hz: the shader steps it on the blood's clock (uClock), so it reads the same.
    // Anything else (busyAt) takes the full rate on its own frame, and the first moving frame after a calm one waits at most CALM_MS.
    if (viewMoved || forceDraw || drawOnce || restOn || restU !== 1) busyAt = now;
    const calm = now - busyAt > CALM_AFTER_MS;
    const base = m60 ? frameGapFor('glide') : paceOf(quality);   // (the governor, frame.js: 60 Hz while something moves; the calm 30 Hz below is its 'flow')
    const interval = calm ? Math.max(base, CALM_MS, restGapFor(now, busyAt)) : base;   // (rest pacing, every device: frame.js restGapFor, after 4 s of only the blood)
    if (interval && !viewMoved && !forceDraw && now - flowGate < interval) { askAnimate(); return; }
    flowGate = interval && (!m60 || calm) ? now - ((now - flowGate) % interval) : now;
    const dt = Math.min(0.1, (now - lastT) / 1000);
    // (On a software renderer a frame waits its turn for up to 2 s: the fluid's ease catches up on the time that passed, so it
    // settles when it would on a GPU instead of crawling 50 ms per drawn frame, and a picture taken after it is always the same.)
    const easeDt = SOFTWARE ? Math.min(2, (now - lastT) / 1000) : dt;
    lastT = now;
    // Fully inside the lobule, the plate is covered (a pending redraw waits for the frame it can show in): the loop sleeps
    // there, and leaving the lobule (a store change) wakes it. While the lobule only covers it on the way in or out, it keeps looking.
    if (lz?.isOpen()) { trimVeins(); sleep(); return; }
    if (veinsTrimmed) { veinsTrimmed = false; lowWarm(); }   // (shown again: the next draw makes what trimVeins gave back, and the tiers' targets are made again a moment on)
    hiddenAt = 0;   // (shown: a later hide starts its warm window afresh)
    if (veinsHold) { veinsHold.drop(); veinsHold = null; }   // (in use again: no longer warm)
    if (lz?.covers()) { askAnimate(); return; }
    forceDraw = false; drawOnce = false;
    const st = store.get();
    // Running, the figure moves by itself only through the blood (streaks, chevrons, a dye bolus), a bleed's spray and
    // the ascites' ripple. With none of them on screen, and none in the last frame drawn (it is drawn once more without
    // them), a running model is drawn like a paused one: only when something on the figure changed.
    const anim = figureMoves(st);
    const still = (!st.running || reduceMotion.matches || (!anim && !lastAnim)) && !bolus.active && !dyeShown;
    // A new model frame changes the figure only through the vessel layer (checked by syncVeins), or through the blood's
    // own data (flow, origin streams) and a bleed, while those are shown.
    const fSame = F === lastDrawF || (!lastAnim && !bloodOn() && !chevOn() && !originOn() && !F?.bleed?.active && sprayA <= 0);
    if (still && bloodKeyVer !== storeVer) { bloodKey = JSON.stringify(st.blood); bloodKeyVer = storeVer; }   // (the store sets blood whole: its text changes only with a store write)
    // (Rev 2 §2.8: the still frame's key is a struct of its parts, written in place (keyNow) and compared field by field with the one
    // the last drawn frame kept (keyDrawn): the same test the string made of them was, and nothing built a frame.)
    if (still) stillKey(keyNow, st);
    // A plate raster that lands while the figure is still (paused, or reduced motion) marks the vessel layer dirty: draw it.
    // (So do vessel rows waiting to be drawn again, veinsRows: a coil's last step is drawn as its cells alone, no longer as a dirty layer.)
    syncOver();
    // (The overlays changed: the picture laid again with them, by the present of this frame's own draw below, or alone after it when that laid
    // none. It was laid here first, ahead of the draw, so a frame of both laid the picture twice.)
    const overAt = OVER_ON && veins?.top ? veins.top.presents : -1;
    const rowsWait = veinsRows.size > 0 && !!veins && !veins.lost && !!vLook && !!F;
    if (still && !veinsDirty && !rowsWait && !glowSync && !(glLines && olDirty) && (!glLines || !marksStale()) && !(glLines && olFading()) && !mapEasing() && !clampFading() && !markA.moving() && !widthEasing && !bloodEasing && !plateEasing() && !sprayFading() && !veins?.organs?.fading && !lensFrom && !colEasing && ascShown === ascTarget && morph === morphTarget && rotU === rotTarget && keyDrawn.on && sameStill(keyNow, keyDrawn) && fSame && CTM === lastDrawCTM && !anyReveal()) { overAlone(overAt); sleep(); return; }
    stepPlateEase();
    stepMap(dt);
    if (morph !== morphTarget) {
      viewClock.sync(morph); viewClock.aim(morphTarget, viewMs());
      morph = viewClock.tick(now);
      // (The camera is on the change's clock: its framing is the share of the way the figure has come.)
      if (viewXf && !viewXf.same) { const u = viewXfCamU(viewXf, viewXfP()); writeVT(u >= 1 ? { ...viewXf.to } : lerpVT(viewXf.from, viewXf.to, u)); viewVersion++; }   // (the camera moved: a view move, never paced like the model's motion)
      if (F) update(F); else updateGeometry(true);
      if (viewXf) viewXfStep();
    } else if (widthEasing && F && !stepOrgans() && !stepWidths()) update(F);   // a width still easing to its target: one step a frame (stepWidths: the widths alone, when nothing else changed)
    if (rotU !== rotTarget) {
      turnClock.sync(rotU); turnClock.aim(rotTarget);
      rotU = turnClock.tick(now);
      setViewBox(easeInOut(morph));
      rotStep();   // (stage-fit.js: a held view keeps its spot; a whole one glides to the turned framing, rec 8)
    }
    stepReveals(now);
    stepRest(dt);
    if (F) stepBlood(dt);
    stepSpray(dt);
    const fluidMoved = stepFluid(dt, st, easeDt);
    { const fe = fluidEasing(); if (fluidWas && !fe) fluidStillAt = now; fluidWas = fe; }
    // (For the ?perf readout: what eases while the organ picture is down.)
    if (gpuProbe.on && !plateOn()) {
      if (lvMoving) gpuProbe.note('liver easing');
      if (fluidWas) gpuProbe.note('fluid easing');
      if (spleenMoving()) gpuProbe.note('spleen easing');
    }
    // The vessel layer is redrawn only when something in it changed; the blood every frame.
    if (glowSync && !syncGlowOnly(easeInOut(morph))) syncVeins(easeInOut(morph));
    olStep(now);
    if (fluidMoved || morph !== morphTarget || rotU !== rotTarget || widthEasing || bloodEasing || plateEasing() || veinsDirty || veinsRows.size > 0 || glowSync || sprayFading() || bolus.active || lensFrom || colEasing || !!veins?.organs?.fading) busyAt = now;
    if (drawVeins(fluidMoved)) { busyAt = now; noteDraw('stage'); swYield?.drew(now); }
    else if (veins && !veins.lost && vLook && F && veins.composite(vLook, bloodLook(), fluidMoved) !== false) { noteDraw('stage'); swYield?.drew(now); }
    overAlone(overAt);
    drawnView = viewVersion;
    if (still) copyKey(keyNow, keyDrawn); else keyDrawn.on = false;
    // (The pinned labels drawn with the figure, in its frame, whenever its camera or its shape moved: label-gl.js pinDraw.)
    if (labelGL && (CTM !== lastDrawCTM || morph !== pinMorph || !CTM)) { if (!CTM) refreshCTM(); pinMorph = morph; labelGL.pinDraw(); }
    lastDrawF = F; lastDrawCTM = CTM; lastAnim = anim || bolus.active || dyeShown;
    askAnimate();
  }
  askAnimate();
  // The overlays changed and the frame's draw laid no picture (`at`: how many pictures had been laid when the frame began): laid alone.
  function overAlone(at) { if (at >= 0 && veins?.overlay?.stale && !veins.lost && veins.top.presents === at) veins.present(); }
  // Nothing to draw: the loop stops asking for frames (so the screen can idle) until something changes, and looks
  // again once a second in case a change came by a path that does not wake it. (The store, the page's visibility, the
  // figure's classes, the camera, the glows and the organ pictures landing all wake it themselves.)
  let sleeping = false, sleepTimer = 0, bloodKey = '', bloodKeyVer = -1;
  // The figure is not shown (the page hidden, the home screen, or the lobule fully over it): the vessel framebuffer, the
  // outline layers and the organ stack (about 58 bytes a pixel of GPU memory) are given back; the first draw on the way
  // back makes them again, whole (veins-gl.js trim: ensureFBO and the layer keys). Once per sleep; the plates stay.
  let veinsTrimmed = false, hiddenAt = 0, veinsHold = null;
  const { getOrganCovers: getOrganCovers$, sleep: sleep$, trimVeins: trimVeins$, wake } = createIdle({ appEl, askAnimate, organEls, readFrame, vCanvas, wrap }, live);
  function trimVeins(...a) { return trimVeins$(...a); }   // <stage-split stub>
  function sleep(...a) { return sleep$(...a); }   // <stage-split stub>
  function getOrganCovers(...a) { return getOrganCovers$(...a); }   // <stage-split stub>

 
  // ── Interaction ───────────────────────────────────
  // A click picks a structure (a vessel, else the organ under the pointer, else nothing); a drag
  // pans. The only gestures that stay "armed" are the shunt (from its source to a drop target)
  // and the two paint brushes in the Draw menu, and each shows how to finish or cancel it.
  const pointers = new Map();
  let drag = null;
  let shunt = null; // { src, wx, wy, targets: Map(id → rule), hover }

  const { abdomenEl, cancelShunt, edgeFromEvent, explainAt, explainChanged, gHovO, hitVessel, linkFocus, linkHeld, linkHover, linkSync, organAt, setOrganHover, shuntDrop, shuntDropOn, startShunt, vesselShapes, vhStep } = createHover({ E, EI, EV, GL_ROWS, MQ, SEL_FADE, TIER_ART, TIER_LIFT, TIER_LIFT_FRONT, ascitesLine, ascitesPath, ascitesSvg, clientToWorldFast, defs, easeInOut, explain, gGuides, gLeaders, gSelO, geo, glLines, late, lateRun, levelTier, nearbyEdge, nextFrame, nodePos, olSet, onHoverInfo, onSelect, orgTone, organEls, organG, pointAt, polyD, pool, readFrame, refreshCTM, setGlowSrc, spot, spotOn, stageBox, svg, syncPlateLook, updateLabels, vh, wrap }, live);






  const { gestureOn, handsOff, vbScale } = createGestures({ EI, animZoomAt, animateVT, applyVT, camSettle, cath, cathRoom, circVB, clientToVB, clientToVBFast, defaultVT, driftEnd, edgeFromEvent, freeCentre, gGuides, labelSvg, markCirc, nearbyEdge, nextFrame, onHoverInfo, onSelect, pick, pointers, readFrame, sameView, shuntDrop, snapFresh, stageBox, svg, vbBox, wrap, zoomAt }, live);

  // A flick keeps the figure moving and slows it down, as a map does.
  let glide = 0;

  function clientToVBFast(cx, cy) {
    const b = stageBox(), vb = vbBox, s = Math.min(b.sw / vb.width, b.sh / vb.height);
    return [(cx - b.left - b.sx - (b.sw - vb.width * s) / 2) / s + vb.x, (cy - b.top - b.sy - (b.sh - vb.height * s) / 2) / s + vb.y];
  }

  // A tap that just misses a thin vessel still picks it: look around the point (out to ~14 px,
  // more on touch) for a vessel before falling back to the organ or the abdomen under it.
  function nearbyEdge(ev) {
    if (ev.clientX == null || lobuleOn) return null;
    // (The nearest vessel within 12 CSS px of the pointer, 18 for a finger: in script, hitVessel, where 36 hit tests of the page ringed it.)
    const id = hitVessel(ev.clientX, ev.clientY, ev.pointerType === 'touch' ? 18 : 12);
    return id && EI[id] != null ? id : null;
  }
  function pick(id, ev) {
    if (!(id && EI[id] != null)) id = nearbyEdge(ev);
    if (id && EI[id] != null) { onSelect({ type: 'edge', id }); return; }
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    const o = organAt(wx, wy);
    onSelect(o ? { type: 'organ', id: o, at: [wx, wy], lobe: o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : undefined } : null);
  }

  const { anchorFor: anchorFor$, figItems, figKeys, figShow } = createPick({ E, EBOX, EI, EV, NI, ORGAN_KEYS, geo, olKey, olRings, organEls, pointAt, refreshCTM, setGlowSrc, setOrganHover, svg, worldToLocal }, live);
  function anchorFor(...a) { return anchorFor$(...a); }   // <stage-split stub>
  svg.addEventListener('keydown', (ev) => {
    if (ev.target !== svg || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    const items = figItems(), at = figKeys.cur ? items.indexOf(figKeys.cur) : -1;
    if (ev.key === 'Tab') {
      const next = at < 0 ? (ev.shiftKey ? -1 : 0) : at + (ev.shiftKey ? -1 : 1);
      if (next >= 0 && next < items.length) { ev.preventDefault(); figShow(items[next]); return; }
      figShow(null);   // (past either end: Tab leaves the figure, as it would leave any other stop)
      return;
    }
    const item = at >= 0 ? items[at] : null;
    if (!item) return;
    if (item.startsWith('organ:')) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (shunt || morph > 0.5) return; setOrganHover(null); onSelect({ type: 'organ', id: item.slice(6) }, { keyboard: true }); }
      return;
    }
    const id = item;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (shunt) { shuntDropOn(id); return; } onSelect({ type: 'edge', id }, { keyboard: true }); }
    if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && F && EI[id] != null) {
      ev.preventDefault();
      const e = EDGES[EI[id]];
      const q = F.Q[EI[id]];
      const node = (ev.key === 'ArrowRight') === (q >= 0) ? e.to : e.from;
      const next = EDGES.find((x) => x.id !== id && E[x.id]?.vis && (x.from === node || x.to === node) && x.kind !== 'wedge');
      if (next) { figShow(next.id); onSelect({ type: 'edge', id: next.id }, { quiet: true }); }
    }
  });

  const guideLine = s('path', { class: 'stent-guide' }), guideGlow = s('path', { class: 'target-glow' }), guideLab = s('text', { class: 'guide-label' });


  dprMake();
  dpr.ready = true; dprobePaint();   // (a Doppler set while the stage was being built shows now)

  // ── Public API ────────────────────────────────────
  const SCOPE_TMP = [0, 0];   // (scopeRingInto's scratch pair)
  return {
    update,
    // The scope view (scope-lens.js, mock C1): the ring on the varices, one of the figure's marks; where it is on screen; the lens's hooks.
    setScopeRing(on, open = false) { const r = live.scopeRing, o = !!on, op = o && !!open; if (r.on !== o || r.open !== op) { r.on = o; r.open = op; if (!op) r.cone = null; live.scopeRingRefresh?.(); } },
    /** The cone from the ring to its lens (scope-lens.js): two lines [x0, y0, x1, y1] in stage px, or null; drawn as figure marks, in world units. */
    setScopeCone(ls) { const r = live.scopeRing; if (!ls && !r.cone) return; const m = live.CTM || (refreshCTM(), live.CTM), w = (p) => [...localToWorldInto([0, 0], p[0], p[1]), ...localToWorldInto([0, 0], p[2], p[3])]; r.cone = ls && m?.sc > 0 ? { a: w(ls[0]), b: w(ls[1]), lw: 1.5 / m.sc } : null; r.cv++; live.scopeRingRefresh?.(); },
    // (Shown while the slide asks for it, whether or not the varices have yet grown to the "present" size: the scope's own lens says "No varices" until they do, and a
    // time-lapse's varices are seen growing in it; scope-lens.js decides when the ring stands, 6 Nov 2026, "i can't click on the scope" while a slide plays.)
    scopeRingAt() { return live.scopeRing.on && morph === 0 && morphTarget === 0 && !lobuleOn && F?.metrics ? scopeRingOn(worldToLocal, live.CTM || (refreshCTM(), live.CTM), live.wrapRect) : null; },
    /** The ring's centre and radius now, written into `o` (x, y, r: stage px): asked for on each step of a camera move, so it makes nothing. false: not on this view. */
    scopeRingInto(o) { return live.scopeRing.on && morph === 0 && morphTarget === 0 && !lobuleOn && !!F?.metrics && scopeRingInto(o, worldToLocalInto, live.CTM || (refreshCTM(), live.CTM), SCOPE_TMP); },
    /** The cutouts plate's tap (cutout-frame-gl.js hit): the liver's spot opens and shuts the lobule window; null takes it away. */
    onPlateTap(tap) { live.plateTap = tap || null; },
    onScopeView(view, tap) { live.viewHook = view || null; live.tapHook = tap || null; },
    /** Idle rest: true eases the blood to a stop and lets the figure sleep; false brings the motion back from this frame. */
    rest(on) {
      on = !!on; if (on === restOn) return; restOn = on; wake(); askAnimate();
      if (!on && scan.parked) { scan.parked = false; if (scan.on && !scan.raf) { scan.last = 0; scan.raf = nextFrame(scanTick); } }   // (the probe's waves, parked at rest: scanTick)
    },
    cardGlass,
    /** One-call glass anywhere: glass.add(el, { blur, tint, shape }) -> { remove() } (glass-gl.js glassRegions). */
    glass: glassAdd,
    blurWhy,
    glassBox,
    setView(v) {
      const target = v === 'circuit' ? 1 : 0;
      if (target === morphTarget) return;
      // (The dive into the lobule never moves the anatomy's own framing.)
      const fromLobule = lobuleOn || lobU > 0, at = vt;
      morphTarget = target; handed = false;
      lastT = performance.now() - 16;   // (a figure that slept before the tap has a stale clock: its first frame of the change took the 0.1 s clamp, a lurch; it starts at one frame)
      syncSemantic();
      // Zoomed out (or fitted) in the anatomy, the circuit opens zoomed out too: the whole map, not
      // the close-up it opens with on a phone. From a zoomed-in view it takes its usual framing.
      const wasOut = target === 1 && (fromLobule || at.k <= 1.001 || (homeAt && sameView(at, homeAt)));   // the whole plate (or less) is showing
      const d = wasOut ? circWhole() : defaultVT(target === 1);
      if (target === 0) { homeAt = d; fitted = true; }   // back to the anatomy: always its home framing
      else { markCirc(wasOut ? 'whole' : 'focus', d); fitted = true; }   // the circuit opens fitted: a turn of the device refits it
      // (The change between the views carries the camera, the ghosts of the old labels and the new view's labels on its one clock: viewXfStart.)
      if (F && labelGL && !labelGL.lost && !(cath.st && !cath.st.keep) && !lobuleOn && !lz?.isOpen()) { viewXfStart(d); return; }
      if (d.k !== vt.k || d.x !== vt.x || d.y !== vt.y) animateVT(d, VIEW_CHANGE_S * 1000);
      // (No morph to ride here: a catheter or a lobule. The labels are laid out afresh for the new view.)
      if (F) { labelKey = null; solveAsked = true; }
    },
    relayout() { refreshCTM(); if (F) updateLabels(F, true); },
    // How often the labels were laid out, skipped or only had their values refreshed, and the time spent (for perf checks).
    labelStats: () => ({ ...stats }),
    /** What the label layer drew last frame, for the checks: the boxes of its pictures and marks (CSS px from its corner) and how many leaders and dots. */
    labelFrame: () => ({ boxes: labelGL?.boxes ?? [], marks: labelGL?.counts().marksDrawn ?? 0, riding: !!labelGL?.riding }),
    // How the frames of the changes between the views were drawn (from the stretches made ahead, gpu, or binned there, cpu, and why), for tests.
    morphStats: () => ({ gpu: mt.stats.gpu, cpu: mt.stats.cpu, builds: mt.stats.builds, miss: { ...mt.stats.miss }, ready: (mt.pieces || []).filter((pc) => pc.set && (veins?.morphSetReady ? veins.morphSetReady(pc.set) : true)).length, of: (mt.pieces || []).length, failed: [...new Set((mt.pieces || []).map((pc) => pc.bad).filter(Boolean))], last: mt.stats.last, restart: mt.stats.restart, units: mt.stats.units, over: mt.stats.over, coilKept: mt.stats.coilKept, building: mt.build ? { done: mt.build.ndone, since: mt.build.t0, busy: mt.build.busy, longest: mt.build.longest } : null }),
    // (For the check that an ease drawn on the GPU matches its binning: the coils and fans held where they are, then binned on the CPU.)
    holdEase: (on) => { easeHeld = !!on; },
    rebinNow: () => { morphOff(); vBinKey = ''; binShown = null; bendShown = null; syncVeins(easeInOut(morph)); },
    coilStats: () => ({ gpu: et.stats.gpu, builds: et.stats.builds, miss: { ...et.stats.miss }, ready: !!et.pc?.set }),
    // The label slots as solved (key → side and pixel offset from the figure point it names), for tests.
    labelSlots: () => Object.fromEntries([...labelSol].filter(([, r]) => !r.drop).map(([k, r]) => [k, `${r.dir}/${r.pi}/${Math.round(r.dx)},${Math.round(r.dy)}`])),
    setSaver(on) {
      setFrameSaver(on);   // (the lobule, the sinusoid and the FibroScan read it each frame)
      saverOn = !!on;
      blurGuard();
      if (!SOFTWARE) { quality = on ? Q_SAVER : 0; wrap.dataset.quality = String(quality); resizeCanvas(); }
    },
    labelScale: () => labelScale,
    labelEff: () => labelScale * deskK(),   // what the figure shows outside a presentation (a desktop's baseline included)
    /** The HVPG catheter: null removes it; else { u (0..1 of the way in), balloon, column (0..1), columnColor, ring, pulse,
     *  opacity, labels: [{ key, at: 'tip' | 'ahead', kicker, text, unit, cls }] }. route: 'tips' | 'brto' | 'bato' takes a
     *  treatment's route instead (PROC_ROUTES), where column is its sclerosant and balloonSpan names the stretch a long balloon fills.
     *  follow: the view drifts after the tip (cathFollow) in the same step, before the readings are laid out for it.
     *  keep: the figure's labels stay on (a treatment, whose steps are named by the slide's own mark callout). */
    setCatheter(st) {
      if (st) cathFade?.done();
      else if (cathFade || !cath.st) { cath.st = null; return; }
      // (keep: a treatment leaves the figure's names and the slide's callout on, its step named by a mark: proc-anim.js. The
      // HVPG catheter's readings stand alone, so it hides them.)
      cath.st = st;
      // (Hidden under the HVPG catheter, the figure's labels are not laid out once their fade is over (updateLabels, cathHid); as it
      // goes they are laid out at once, for the view as it is now, before they fade back in.)
      const hide = !!st && !st.keep;
      if (hide !== wrap.classList.contains('cath-on')) {
        wrap.classList.toggle('cath-on', hide);
        if (hide) cathHidAt = performance.now(); else if (F) { labelKey = null; updateLabels(F); }
      }
      if (st && (st.route || 'hvpg') !== cath.kind) { cath.kind = st.route || 'hvpg'; cath.route = null; cath.rc = 0; }
      if (!st) { cath.rc = 0; cath.route = null; cath.blk = null; cath.shaft = null; cath.room = null; cath.ins = null; cathVer++; if (cathTint || varixFade) { cathTint = null; varixFade = 0; cath.tintKey = ''; syncVeins(easeInOut(morph)); } cath.at = null; cathFadeOut(); return; }
      cathPaint();
    },
    /** A presenter slide's measuring sites, e.g. ['pv', 'ivc'] (see SITE_DEF), read from fp (the slide's numbers, so they
     *  match its ladder and tiles) or else the live figure; null removes them. */
    // A presenter slide's glows: vessels ([{ id, tone }], eased, in the station's colour) and organs (outlined, held).
    setGlow(list) { setGlow(list); },
    setResGlow(list) { resLit = new Map((list || []).map((r) => [r.id, r.tone])); resLitRev++; if (sites.list) sitesPaint(); },
    pinOrgans(list) { pinOrgans(list); },
    // Organs eased in or out beside the slide's own pins (null: out): { id, tone, glow, fade } (ext-highlights.js, a meal's gut glow).
    glowOrgans(list) { pinOrgans(null, list || []); },
    // Deck visuals, package A (ext-highlights.js): a slide's spotlight ({ edges, organs: [{ id, tone }] } or null, V2), the
    // normal spleen's outline (['spleen'] or null, V18), its change ripple (two networks' node pressures, V6) and the network a
    // "change since" slide counts from (node pressures or null, V11).
    spotlight(sp) {
      spot.ids = new Set((sp?.edges || []).filter((id) => E[id]));
      spot.on = !!sp && (spot.ids.size > 0 || !!sp.organs?.length);
      if (spot.on) spot.live = true;
      spotOrgans(spot.on ? sp.organs : null);
      // (Each named vessel glows softly in its own colour, as a selected one does, so a pale one still reads against the dimmed rest.)
      setGlowSrc('spot', spotOn() ? [...spot.ids].map((id) => ({ id, col: null, amt: 1.7, wide: 0.9, dur: SEL_FADE * 1000 })) : []);
      if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
      veinsDirty = true; stageWake();
    },
    // Deck visuals, package F (ext-callouts.js): a slide's figure callouts (live mark words, organ marks, calipers, step
    // numbers, the circuit's brackets and lit zone), or null.
    callouts(sp) { setCallouts(sp); },
    normalOutline(ids) { normal.want = !!ids?.includes('spleen'); normalSync(); },
    ripple(from, to) { ripple(from, to); },
    changeRef(P) { changeRef(P); },
    siteFp(fp) { slideFp = fp; if (sites.list) sites.fp = fp; },   // (the numbers the slide's tiles now show: a what-if, a time-lapse)
    setSites(list, fp = null) { sites.list = list?.length ? [...list] : null; sites.fp = fp; if (fp) slideFp = fp; if (!sites.list) for (const k of [...resMade.keys()]) resPaint(k, SITE_DEF[k], null); if (!sites.list) for (const [k, el] of [...sites.made]) siteLeave(k, el); else { refreshCTM(); sitesPaint(); } },
    /** Frame the catheter's route ('route'), its tip close up ('tip'), or go back to the view before ('home'); a treatment's
     *  shots are 'way' (its whole route) and 'tip' (the stretch it works on). arc: a long move pulls back and comes in. */
    cathFocus,
    /** A treatment route's named stretches as u (0..1 of the way in, as setCatheter takes it): { tract: [u0, u1], … }, or null. */
    /** A place on one treatment route as the same place on another (u): a reading that goes on from where a procedure left the catheter. */
    cathCarry,
    cathStops() {
      const r = cathRoute();
      if (!r?.spans) return null;
      const u = (d) => (d - r.start) / (r.free - r.start || 1);
      return Object.fromEntries(Object.entries(r.spans).map(([k, [a, b]]) => [k, [u(a), u(b)]]));
    },
    // (setCatheter's `follow: true` does this in the catheter's own step, in order; this is the same move on its own.)
    cathFollow() { cathFollow(); if (cath.st) cathLabelsSoon(); },
    /** Forget the view cathFocus would go back to (the presenter moves its own camera on). */
    cathForget() { cath.saved = null; },
    /** The catheter's route over the figure as boxes in wrap pixels (the shaft's width and a hair more), from the neck to where it ends, the whole
     *  way so they stand still as it travels: the corner credit keeps clear of the shaft, which the GPU draws and the page does not hold. [] with
     *  no catheter on. */
    cathBoxes() {
      const st = cath.st, r = st && cathRoute();
      if (!r) return [];
      if (!CTM || !wrapRect) refreshCTM();
      const sc = CTM.sc || 1, hw = Math.max(3, (cath.rc || 0) * sc) + 3, step = 16 / sc, out = [];
      for (let d = 0; d <= r.free + step; d += step) {
        const [x, y] = worldToLocal(...cathAt(r, Math.min(d, r.free)).p);
        if (x < -hw || y < -hw || x > wrapRect.width + hw || y > wrapRect.height + hw) continue;
        out.push({ l: x - hw, t: y - hw, r: x + hw, b: y + hw });
      }
      return out;
    },
    /** The vessel the Doppler is reading, glowing green while the Doppler instrument is open (null: none). */
    setDoppler(id) { dop.want = id; dopApply(); },
    /** The presenter's Doppler slide pins its vessel's glow, over whatever Explore's Doppler reads (null: unpin). points: on a
     *  stent, the figure calls out all three points it is sampled at, the sampled one named in the Doppler's green. */
    pinDoppler(id, { points = false } = {}) { dop.pin = id; dop.points = !!id && points; dopApply(); },   // (false: no probe drawn at all, stage-glow.js dopApply)
    setScanProbe,
    setProjection(on) { projecting = typeof on === 'number' ? on : !!on; if (F) updateLabels(F); },
    labelLayer: () => labelSvg,
    /** The treatment marks and how much of each shows now (for tests; mark-fade.js). */
    markAmounts: () => markA.amounts(),
    /** The layer the GPU's picture lies under (lesions, stents, halos), when the GPU draws. */
    overLayer: () => (veins && wrap.classList.contains('gl-on') ? svgOver : null),
    /** The classes the GPU's state sets and what that state is (for tests): `gl-on` with the GPU holding its context, `gl-plate` with it holding the whole plate. */
    glClasses: () => ({ on: wrap.classList.contains('gl-on'), plate: wrap.classList.contains('gl-plate'), gpu: !!veins && !veins.lost, held: !!veins && !veins.lost && veins.hasPlate(0) }),
    /** The overlays on the GPU now (for tests and the readout): on, whole (everything they show painted there), how many groups,
     *  and where a run stopped (the unit, why, the element). */
    overState: () => ({ on: OVER_ON && !!veins?.overlay && !veins.lost && wrap.classList.contains('gl-on'), whole: !!svgOver?.classList.contains(OVER_ALL), groups: overPainted.length, stop: overStop && { unit: overName(overStop.unit), why: overStop.why, el: overName(overStop.el) } }),
    /** A vessel's stream (for tests): flow, display speed, stream distance, stasis. */
    flowDir(id) {
      const k = EI[id], sm = streams[k];
      if (k == null || !F || sm.vd == null) return null;
      return { q: (F.Qf || F.Q)[k], vd: sm.vd, D: sm.D, stasis: sm.stasis, dir: Math.sign(sm.vd) };
    },
    injectDye,
    releaseDye: () => bolus.release(),
    clearDye: () => bolus.clear(),
    dyeActive: () => bolus.active,
    dyeInjecting: () => bolus.injecting,
    svg,
    worldToLocal: (x, y) => { refreshCTM(); return worldToLocal(x, y); },
    // (a label solve still running in slices, or one still owed: the view or the camera still moving to where it will be laid out, or a layout
    // dropped and not yet laid again, or labels still gliding to their new spots. The browser checks had read the Circuit's labels mid-change,
    // two readings, as a landed layout, and the anatomy's mid-glide after a zoom as where they stood before a pan.)
    labelSolving: () => !!labelJob || !!glideRaf || ((camMove || morph !== morphTarget || labelKey == null) && !!F && !lz?.isOpen() && !cathHid()),
    anchorPos(anchor) {
      const t = easeInOut(morph);
      if (NODE_POS[anchor]) return nodePos(anchor, t);
      if (geo[anchor]) return pointAt(geo[anchor].cur, 0.5);
      return null;
    },
    // The zoom buttons zoom about the middle of the free space; in the lobule they drive its own view.
    zoomIn: () => { if (lobuleOn) { lz.zoomBy(1.4); return; } handsOff(); const c = freeCentre(); animZoomAt(c[0], c[1], 1.4); },
    zoomOut: () => {
      if (lobuleOn) { if (store.get().sinusoid) { store.set({ sinusoid: false }); return; } lz.zoomBy(1 / 1.4); return; }
      handsOff();
      // The last step out lands on the whole figure, centred (the circuit: its whole map), as the lobule's − stops at its framing.
      // (It used to shrink past it to 0.6× about the middle and stay there: a small figure off to one side that nothing put back.)
      const circuit = morphTarget === 1, d = defaultVT(circuit), whole = circuit ? circWhole() : d, lo = whole.k < d.k ? whole : d;
      const base = vtGliding && vtTarget ? vtTarget : vt;
      if (base.k / 1.4 <= lo.k * 1.001) { if (!circuit) homeAt = lo; else markCirc(lo === whole ? 'whole' : 'focus', lo); fitted = true; if (!sameView(lo, base)) animateVT(lo, CAM_MS_MAX, { scale: true }); return; }
      const c = freeCentre(); animZoomAt(c[0], c[1], 1 / 1.4);
    },
    fit, refit, closeView,
    keepView(on) { keptSpace = on ? spaceSig() : null; },
    reveal, unreveal,
    /** Changes whenever what is drawn where changes (a pan, a zoom, the morph): a cheap key for "did anything move". */
    layoutKey: () => `${viewVersion}|${geometryVersion}` + (lz?.isOpen() ? '|' + lz.viewKey() : ''),
    setCircuitRotated,
    circuitRotated: () => rotTarget === 1,
    zoomToBox, frameBox,
    /** While presenting: a function returning the free rectangles (wrap px, {l, t, r, b}) the camera frames a box into. */
    setFreeArea(fn) { freeArea = fn; },
    /** The free rectangle the last framed box was centred in (for the tests). */
    lastFree: () => lastFree,
    /** The network's box in client px (every vessel shown but those behind the organs), or null (for the checks). */
    netRect: () => {
      const b = netBoxNow();
      if (!b) return null;
      if (!CTM) refreshCTM();
      const C = CTM, xs = [], ys = [];
      for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) { xs.push(C.a * x + C.c * y + C.e); ys.push(C.b * x + C.d * y + C.f); }
      const l = Math.min(...xs), t = Math.min(...ys), r = Math.max(...xs), bt = Math.max(...ys);
      return { left: l, top: t, right: r, bottom: bt, width: r - l, height: bt - t };
    },
    /** The vessels shown now, by id (for the checks: there is no element per vessel). */
    shownVessels: () => EV.filter((x) => x.vis).map((x) => x.e.id),
    /** Half way along a vessel's drawn course, in client px, and the course's length on screen (for the checks), or null. */
    vesselMid: (id) => {
      const P = geo[id]?.cur;
      if (!(P?.length > 1) || !E[id]?.vis) return null;
      if (!CTM) refreshCTM();
      const C = CTM, k = Math.hypot(C.a, C.b), L = arcLen(P);
      let q = P[P.length - 1];
      for (let i = 1, s0 = 0; i < P.length; i++) {   // (half way by length along the course)
        const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
        if (s0 + l >= L / 2) { const u = l ? (L / 2 - s0) / l : 0; q = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; break; }
        s0 += l;
      }
      return { x: C.a * q[0] + C.c * q[1] + C.e, y: C.b * q[0] + C.d * q[1] + C.f, len: L * k };
    },
    /** The vessel under a client point (CSS px), or the nearest within slop px past its stroke: hitVessel (for the checks). */
    vesselUnder: (cx, cy, slop = 0) => hitVessel(cx, cy, slop),
    /** The plate box (world units) around organs and vessels as drawn now (an enlarged spleen at its size), or null. */
    focusBox({ organs = [], edges = [] } = {}) {
      let b = null;
      const add = (el, m) => {
        const r = el ? elBoxInto(el, EBOX) : null;   // (in script: elBox)
        if (!r || (!r.width && !r.height)) return;
        for (const [x, y] of [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]]) {
          const X = m ? m.a * x + m.c * y + m.e : x, Y = m ? m.b * x + m.d * y + m.f : y;
          b = b ? [Math.min(b[0], X), Math.min(b[1], Y), Math.max(b[2], X), Math.max(b[3], Y)] : [X, Y, X, Y];
        }
      };
      for (const id of organs) if (organEls[id]?.getAttribute('d')) add(organEls[id], organG[id] && gMatrix(organG[id]));
      // (A vessel's wall is hidden while the GPU draws the vessels, so its drawn centreline gives the box.)
      for (const id of edges) {
        const P = geo[id]?.cur;
        if (P?.length) for (const [x, y] of P) b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
      }
      return b;
    },
    /** Fit with a chosen glide (the presenter's slower, calmer moves). */
    /** The camera's whole magnification (log scale: the plate's zoom plus the dive's), or null while the lobule fills the view. For the tests: a dive in or out must move it steadily, never stopping part way. */
    sinBusy: () => !!lz?.sinBusy(),
    cameraMoves: (clear) => (clear ? camMoves.splice(0) : [...camMoves]),
    /** The transform the GPU last drew the figure in, as [a, b, c, d, e, f] from world to stage px (null: not drawn on the GPU). */
    glMatrix: () => (veins && !veins.lost && wrap.classList.contains('gl-on') ? glM?.slice() ?? null : null),   // (a copy: glM is kept and written in place by the next draw)
    /** For the checks: the vessel canvas as it stands (mid-gesture too), then after a whole redraw of it at the same view
     *  (PNG data URLs; equal when nothing on screen is stale, undrawn or softer), or null without the GPU figure. */
    /** For the checks: the organs' picture as the plate (one SVG of the whole plate) and as the layers the GPU draws instead
     *  (each layer's SVG, over its cropped rect on the plate's pixel grid), both of the state now (tests/e2e/plate-layers.mjs). */
    /** For the checks (tests/e2e/fluid-pool.mjs): frames that composited only the fluid's pool, and whether the level is easing. */
    poolFrames: () => poolFrames, fluidEasing: () => fluidEasing(), layerStarts: () => [layerStarts, layerStartsEasing],
    organLayersShown: () => plateOn() && gpuOrgansOn() && !!veins?.organs?.has(0),
    /** The organs' drawing paths, and the layer sets committed so far. */
    organPaths: () => ({ ...organPathsNow(), commits: layerCommits }),
    /** The ?perf switch "GPU organs", for the checks: true, false, or 'force' (on the software renderer too). */
    gpuOrgans(v) { gpuProbe.gpuOrgans = v; gpuProbe.onOrgans?.(); },
    /** The vessel canvas as a PNG data URL, its kept picture copied onto it first (the canvas keeps none of its own: veins-gl OWN_BUF). */
    veinsShot: () => (veins && !veins.lost ? veins.snapshot() : vCanvas.toDataURL()),
    veinsCheck(compositeOnly = false) {
      if (!veins || veins.lost || !vLook || !F) return null;
      const now = veins.snapshot();
      // (compositeOnly: the picture composited again whole from the same vessel layer and look, as a partial composite stands in for.)
      if (compositeOnly) { veins.composite(vLook, bloodLook(), true); return { now, whole: veins.snapshot() }; }
      veinsDirty = true; drawVeins(false, 'check');
      return { now, whole: veins.snapshot() };
    },
    cameraZoom: () => ((diveT <= 0 || diveT >= 1) && !lz?.sinBusy() ? null : (refreshCTM(), Math.log(CTM.sc) + diveZ + lz.sinZoom() + zShift)),
    /** The next way out of the lobule lands on this box of the plate (or the fit, for null or 'fit'): one zoom, no stop between. */
    riseTo, holdHome, prepRise, riseReady,
    /** The camera is about to glide only to refit the figure to cards that changed (the same slide): a probe showing rides that glide out, never hides. */
    carryProbe() { dpr.refitUntil = performance.now() + 300; },
    /** The presenter's card followed frame by frame: aimView(fn) (where fn's framing would go), viewNow(), follow(v0, v1), followAt(u), followEnd(), following(). */
    aimView, viewNow, follow: followStart, followAt, followEnd, following: () => following || !!zoomBase, zoomOpen, zoomAt: cardZoomAt, zoomEnd, zoomSharp,
    fitSlow(ms = 1300, opt = {}) { if (lobuleOn) return; handed = false; const to = defaultVT(morphTarget === 1); if (morphTarget !== 1) homeAt = to; else markCirc('focus', to); fitted = true; if (!sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, ms, opt.steady ? { steady: true } : { scale: true }); },
    /** The same fit as a slow push (a time-lapse's lapse.cam 'fit'): see drifting. */
    fitDrift(ms) { if (lobuleOn) return; handed = false; const to = defaultVT(morphTarget === 1); if (morphTarget !== 1) homeAt = to; else markCirc('focus', to); fitted = true; if (!sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, ms, { drift: true }); },
    /** The anatomy/circuit camera (where it is headed, if gliding), and a glide back to one saved earlier (the presenter puts the view back). */
    cameraState: () => ({ ...(vtGliding && vtTarget ? vtTarget : vt) }),
    /** The organs are drawn from the GPU copy again after a patient change (or never will be: no WebGL), so a camera move costs only the GPU's draw. */
    organsSettled: () => plateOn() || !glWanted(),
    /** The camera is still gliding (a slide's cards wait for it to land). */
    gliding: () => vtGliding || !!viewXf,   // (a change between the views still landing is the camera's too: the marks and cards wait for it)
    /** What is left of the glide under way, and its whole length, ms ({ left: 0, ms: 0 } at rest): a slide's cards come in over its last part. */
    glideLeft: () => (vtGliding || viewXf ? { left: Math.max(0, vtUntil - performance.now()), ms: vtMs } : { left: 0, ms: 0 }),
    /** The change between Anatomy and Circuit is still under way (the figure morphing, or its landing not yet done): a slide's next step waits for it to land. */
    viewChanging: () => !!viewXf || morph !== morphTarget,
    /** A slow push is under way (frameBox or fitSlow with { drift: true }): the labels ride with it. */
    drifting: () => drifting,
    /** A slow push can run smoothly here: the organs are drawn live on the GPU while a time-lapse changes them (otherwise every frame of
     *  a move over the live SVG drawing paints the organs again whole, as the catheter's route once did at about 1 fps). */
    canDrift: () => liveOn(),
    /** The learner placed the view by hand and nothing has framed it since (a talk leaves such a view when a card changes size). */
    handMoved: () => handed && !lobuleOn,
    /** A turn of the device or a new window size: the next framing is the camera's again. */
    handClear() { handed = false; },
    setCamera(to, ms = 900) { if (lobuleOn || !to || sameView(to, vtGliding ? vtTarget : vt)) return; fitted = false; animateVT({ ...to }, ms, { scale: true }); },
    /** Resolves once the figure has taken the page's new look whole (the organs' specs read and applied, and one frame drawn since), never
     *  later than `cap` ms: a look change's crossfade (main.js switchTheme) captures its new picture then, not with the background
     *  changed and the organs still to follow, one by one. */
    /** The page has a new look (theme-epoch.js, in the theme frame): the vessels take its colours at once, the organs' pictures are made again,
     *  and the figure is drawn, all in this frame, not by the model's next frame some 100 ms on (or never, while it is paused). */
    lookChanged() { themeSnap = true; glowSync = true; veinsDirty = true; plateStale = true; stageWake(); },
    lookWhole(cap = 700) {
      return new Promise((done) => {
        const t0 = performance.now(), t = stageScope.timer(done, cap);
        let calm = 0;
        const poll = () => {
          if (lookPending() || !csSnap || csAsk || themeSnap || glowSync || veinsDirty || veins?.organs?.fading) calm = 0; else calm++;
          if (calm >= 3 || performance.now() - t0 >= cap) { stageScope.clear(t); done(); return; }
          lookFrame(poll);
        };
        lookFrame(poll);
      });
    },
    cameraKey: () => `${vt.k.toFixed(3)}|${vt.x.toFixed(1)}|${vt.y.toFixed(1)}`,
    zoomLobule, zoomLiver, lobuleOpen: () => !!lz?.isOpen(), organsPictured: () => !!veins?.organs?.pictured?.(0), lobuleViewKey: () => lz?.viewKey(), lobuleCaptions: () => lz?.captions?.() ?? null, sinusoidCaptions: () => lz?.sinusoidCaptions?.() ?? null, lobuleLeaderEnds: () => lz?.leaderEnds?.() ?? [], lobuleGliding: () => !!lz?.labelsGliding?.(), lobuleCapture: () => lz?.capture?.() ?? null,
    /** The figure's own context for what is drawn over it (veins-gl top), or null where there is none (the ink's pass, ink-gl.js). */
    figureTop: () => (veins && !veins.lost ? veins.top : null),
    /** The figure on show → stage px as an affine { a, b, c, d, e, f } (the pen's, ink-gl.js), written into o; returns the view's kind ('w' world, 'l' lobule, 's' sinusoid). */
    figureXform(o) {
      if (lz?.isOpen() && lz.xform(o)) return lz.sinusoidOpen() ? 's' : 'l';
      if (!CTM) refreshCTM(); const c = CTM, b = stageBox(); if (!c || !b) return '';
      o.a = c.a; o.b = c.b; o.c = c.c; o.d = c.d; o.e = c.e - b.left; o.f = c.f - b.top;
      return 'w';
    },
    labelClearance: () => clearanceReport(),   // (the browser check's: see clearanceReport)
    labelPresolveRun: (ms, between) => preRun(ms, between), labelLayoutNow: (solve = true) => { if (!F) return null; labelKey = null; if (solve) solveAsked = true; updateLabels(F); return labelSol; },   // (the node check of the solve ahead: preRun; a layout now, a solve or (false) a carry)
    /** The labels' state against the camera, for the browser check: riding (carried by the camera's move on the GPU),
     *  and stale (not riding, laid out under a camera that is not this one: the old labels over the new view). */
    labelCarry: () => {
      refreshCTM();
      const riding = !!rideCTM;
      let moved = false;
      if (layCTM) { const n = stagePxInto(stagePxNow, CTM); for (let i = 0; i < 6; i++) if (Math.abs(n[i] - layCTM[i]) > (i < 4 ? 1e-4 : 0.5)) moved = true; }
      return { riding, job: !!labelJob, laid: !!solvedFor && !labelJob && labelKey != null && morph === morphTarget, stale: !riding && !labelJob && moved };
    },
    /** For the browser check of the Circuit's leaders (tests/e2e/circuit-leaders.mjs): the vessels as the labels' solver sees them (stage px, half width, id)
     *  and the stage's corner in client px, so the labels' boxes and leaders can be read against them. */
    labelLaid: () => ({ items: labelShown.filter((it) => !it.hide).map((it) => ({ key: it.key, box: [it.x - it.padX, it.y - it.padY, it.x + it.w + it.padX, it.y + it.h + it.padY], ax: it.ax, ay: it.ay, leader: !!it.leader, onVessel: !!it.onVessel })), rings: (gLabels.dataset.rings || '').split(' ').filter(Boolean).map((s) => s.split(',').map(Number)) }),   // alloc-rare: a test accessor, never called from a frame: the labels the last layout showed, stage px, and the Circuit's station rings
    labelVessels: () => { buildSegs(); refreshCTM(); return { left: wrapRect.left, top: wrapRect.top, segs: segs.map((q) => [q.x0, q.y0, q.x1, q.y1, q.hw, q.id]) }; },
    labelDrawn: () => labelGL?.boxes ?? null,   // (what the GPU labels' last picture drew, as boxes in px from their canvas's corner: the browser check of the labels' lag)
    labelDrawnBy: () => { const r = stageBox(), o = labelGL?.drawnLabels?.() ?? []; for (const d of o) { d.x += r.left; d.y += r.top; } return o; },   // (each GPU label's last picture, keyed, client px: the browser check's lag test)
    explainAt, explainClear: () => { explain.clear(); lz?.explainClear?.(); }, explainKey: () => explain.key || lz?.explainKey?.() || null,   // (tap a label to explain it: label-explain.js)
    labelSnapshot: () => { const r = stageBox(), o = labelGL?.snapshot?.() ?? { seq: 0, gen: 0, items: [] }; for (const d of o.items) { d.x += r.left; d.y += r.top; if (d.pin) { d.px += r.left; d.py += r.top; } } for (const m of o.marks || []) { m.x0 += r.left; m.y0 += r.top; m.x1 += r.left; m.y1 += r.top; } return o; },   // (the same, as { seq, gen, items } in page px: what the browser checks read, never SVG boxes)
    lobuleSpot: () => lz?.spot() ?? null, lobuleLensFade: () => lz?.lensFade() ?? null, lobuleMem: (detail) => lz?.memBytes(detail) ?? 0, diveProgress: () => diveT, plateRasters: () => plateSeq,
    // (What the station labels' boxes follow: their layouts and the camera. The corner credit's poll looks again only when it changed.)
    // (And the lobule's view and state when it is open, and a fresh value each look while the sinusoid's names glide: the corner credit
    // looks again only when one of them changed, never every second in the lobule or the sinusoid as before, credit.js.)
    // (What the credit looks at of the labels: where their boxes lie on an 8 px grid, the camera and the views, not how many times they
    // were laid out: their numbers change with the running model and each had the credit measure every card, label and shape again,
    // about 560 reads in 15 s on a phone at rest (motion budget, 2 Nov).)
    /** The labels the figure shows now, for the gate's "labels follow the camera" check (scripts/gate-page.mjs labelFollow): key → [left, top, right, bottom] of its box in px from the stage's corner (the same 8 px grid as labelBoxStamp, so a quarter-grid coarse), hidden ones left out. Reads nothing from the page. */
    labelPlaced: () => { const o = {}; for (const [k, b] of pool) if (b.box && !b.box.endsWith('h')) { const q = b.box.split(',').map(Number); o[k] = [q[0] * 8, q[1] * 8, q[2] * 8, q[3] * 8]; } return o; },   // alloc-rare: a test accessor, called by the gate between frames, never from a frame
    labelBoxStamp: () => { let k = ''; for (const b of pool.values()) if (b.box) k += b.box + ';'; return `${k}|${vt.k},${vt.x},${vt.y}|${morph}|${rotU}|${lz?.isOpen?.() ? lz.viewKey() : ''}|${lz?.sinusoidMoving?.() ? performance.now() : ''}`; },
    labelStamp: () => `${stats.layouts}|${vt.k},${vt.x},${vt.y}|${morph}|${rotU}|${lz?.isOpen?.() ? lz.viewKey() : ''}|${lz?.sinusoidMoving?.() ? performance.now() : ''}`,
    /** The stage's kept copy of its computed style, for the stage's own element (null for any other): read it instead of a live read. */
    keptStyle: (el) => (el === wrap ? wrapCS() : null),
    /** Where the sinusoid's reading and lesion pointer meet their sinusoid (see lobule-zoom sinAnchor). */
    lobuleSinAnchor: () => lz?.sinAnchor() ?? null,
    lobuleGlCheck: () => lz?.glCheck() ?? null, lobuleLabelLayouts: () => lz?.labelLayouts() ?? 0,
    /** The lobule's outline in client px while it fills the view (see lobule-zoom ring), else null. */
    lobuleRing: () => (lobuleOn && diveT >= 1 ? lz?.ring() ?? null : null),
    /** Three scales on one plate (cutouts.js): the lobule in a round window ({ x, y, w, h, r }, CSS px of the figure's box) beside the anatomy, its blood running when run; null closes it. Not while the lobule itself is open or diving. */
    plateLobule(win, run = false) {
      plateWant = win ? { win, run } : null;
      if (!win) { lz?.plateOff(); return; }
      if (lobuleOn || diveT > 0 || store.get().lobule) return;
      if (lz) { lz.plateOn(win, run); return; }
      lobuleReady().then(() => { if (plateWant && !lobuleOn && !store.get().lobule) lz.plateOn(plateWant.win, plateWant.run); }, () => { /* the lobule's code did not arrive: no window */ });
    },
    /** The vessels as the corner credit counts them (credit.js), in world units: each course drawn (a vessel's own, and in the anatomy its
     *  strands' and drawn trunks'), its hit width w, its box, and ver (a new ver: the list changed). */
    vesselShapes,
    /** A vein's drawn width (world units), the lumen a glow hugs (credit.js); null for an artery or an unknown id. */
    lumenWidth: (id) => (E[id] && !E[id].isArt ? E[id].width : null),
    /** The vessels lit by a glow that stays (a selection, a slide's or step's vessels, the Doppler's), as [id, band width ×]: the corner
     *  credit keeps off their glow too. (A hover's or a change's glow comes and goes; the credit does not move for it.) */
    steadyGlows: () => ['sel', 'dop', 'slide', 'focus'].flatMap((k) => [...(glow.src.get(k) || new Map()).values()].map((g) => [g.id, g.wide || 1])),
    /** A talk takes the figure out of the Tab order (its one stop and its labels); the end of the talk puts it back. */
    setKeyStops: (on) => {
      keyStops = !!on;
      svg.setAttribute('tabindex', keyStops ? '0' : '-1');
      if (!keyStops) figShow(null, false);   // (only the stops: a vessel's extra hit paths are hidden from the keyboard and screen readers)
      for (const b of pool.values()) if (b.g.hasAttribute('tabindex')) b.g.setAttribute('tabindex', keyStops && !b.hid ? '0' : '-1');
    },
    /** Where a station's callout attaches, in client px (for the checks). */
    labelOnFigure: (id, x, y) => { const r = stageBox(), px = x - r.left, py = y - r.top, eid = LABEL_VESSEL[id], P = eid && geo[eid]?.cur; let best = Infinity; if (P?.length > 1) for (let i = 1; i < P.length; i++) { const a = worldToLocal(P[i - 1][0], P[i - 1][1]), b = worldToLocal(P[i][0], P[i][1]), dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0; best = Math.min(best, Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)); } const n = nodePos(id, easeInOut(morph)), q = worldToLocal(n[0], n[1]); return Math.min(best, Math.hypot(px - q[0], py - q[1])); },   // (how far a point is from the vessel a station names, or the station itself: the browser check's test that a label is pinned to the figure)
    labelNodeOf: (id) => { const p = nodePos(id, easeInOut(morph)), q = worldToLocal(p[0], p[1]), r = stageBox(); return { x: q[0] + r.left, y: q[1] + r.top }; },   // (the station's own point, client px: the browser check's other place a label may be pinned)
    labelAnchorOf: (id) => { const a = labelAnchor(id, easeInOut(morph)), r = wrap.getBoundingClientRect(); return { x: a.ax + r.left, y: a.ay + r.top, mid: a.mid }; },
    /** The presenter's camera in the lobule: the whole lobule ('fit'), a portal tract ('triad'), the sinusoids ('sinusoid') or the central vein ('central'). */
    lobuleFocus: (part, opts) => !!lz?.focusOn(part, opts),
    /** Where the presenter's next lobule framing will be, so a dive lands on it in one move (see lobule-zoom aim). */
    lobuleAim: (part, opts) => { if (lz) lz.aim(part, opts); else { aimWait = [part, opts]; lobuleReady().catch(() => {}); } },
    /** The way out of the lobule begins (true: its framing stays in the space the leaving slide's cards left) or is called off (false). */
    lobuleHold: (on) => lz?.holdFrame(on),
    /** The dive into the lobule (or back out) has finished: the view is wholly the lobule, or wholly the anatomy. */
    /** The presenter's glide inside the lobule (a station focus, the zoom back to the fit) is still moving: false once it has landed. */
    lobuleGlide: () => !!lz?.glideBusy?.(),
    lobuleSettled: () => !diveWait && !(lz?.sinBusy()) && (lobuleOn ? diveT >= 1 : diveT <= 0),
    /** From the anatomy to the sinusoid view in two zooms: into the lobule's normal framing, then into the sinusoid. In the lobule already, just the sinusoid. */
    async diveToSinusoid() {
      const me = ++sinMoveGen;
      if (!lobuleOn && diveT === 0 && morphTarget === 0 && !reduceMotion.matches) {
        store.set({ lobule: true });
        const t0 = performance.now();
        while (!(lobuleOn && diveT >= 1 && lz?.isOpen()) && performance.now() - t0 < 12000) await new Promise((r) => stageScope.timer(r, 60));
        await new Promise((r) => stageScope.timer(r, 120));
        if (!lobuleOn || me !== sinMoveGen) return;
      }
      store.set({ lobule: true, sinusoid: true });
    },
    /** From the sinusoid view out to the anatomy in three steps: out of the sinusoid, back to the lobule's normal framing, then out of the lobule. */
    async exitSinusoid() {
      const me = ++sinMoveGen;
      if (!store.get().sinusoid || !lz?.sinusoidOpen()) { store.set({ sinusoid: false, lobule: false }); return; }
      store.set({ sinusoid: false });
      const t0 = performance.now(), wait = (ms) => new Promise((r) => stageScope.timer(r, ms));
      while ((lz.sinBusy() || lz.sinusoidOpen()) && performance.now() - t0 < 4000) await wait(60);
      if (me !== sinMoveGen || store.get().sinusoid) return;   // (a dive began meanwhile, or the sinusoid was asked for again: leave the lobule where it is)
      if (lz.focusOn('fit', { ms: 900 })) await wait(900);
      if (me !== sinMoveGen || store.get().sinusoid) return;
      if (store.get().lobule) store.set({ lobule: false });
    },
    /** The Sinusoid button: zoom into the sinusoid from the lobule. While the dive into the lobule is still landing the ask is kept in the
     *  lobule (it carries on at the landing) and the store is not written, so the view says sinusoid once, not true, false, true. askSinusoid(false)
     *  calls a kept ask off. */
    askSinusoid(on = true) {
      if (!on) { lz?.askSinusoid(false); return; }
      if (!lz?.askSinusoid(true)) setViewKey('sinusoid');
    },
    /** True once the sinusoid view is wholly in. */
    sinusoidOpen: () => !!lz?.sinusoidOpen(),
    /** On-screen scale, px per world unit (for the tests: turning the circuit keeps it). */
    zoomLevel: () => { refreshCTM(); return CTM.sc; },
    /** The figure's item the keyboard is on (a vessel's id, or 'organ:<id>'), or null. */
    keyItem: () => figKeys.cur,
    focusEdge(id) { if (!E[id]) return; figKeys.cur = id; svg.focus({ preventScroll: true }); figShow(id); },
    startShunt, cancelShunt, isShunting: () => !!shunt, anchorFor, organAt,
    /** Briefly glow the given vessels (where a readout is measured). */
    flash(ids) {
      setGlowSrc('flash', ids.filter((id) => E[id]?.vis).map((id) => ({ id, col: 'var(--accent)', amt: 1.3, dur: D_SURFACE })));
      stageScope.clear(glow.flashT); glow.flashT = stageScope.timer(() => setGlowSrc('flash', []), 1000);
    },
    edgeMid: (id, f = 0.5) => (geo[id]?.cur?.length ? pointAt(geo[id].cur, f) : null),   // (f: a point along it, 0..1 of its drawn course)
    /** The drawn network's box on screen (px, in the figure), for placing cards beside it. */
    contentRect() {
      if (netBoxFor !== geometryVersion) { netBox = netBoxNow(); netBoxFor = geometryVersion; }
      if (!netBox?.width) return null;
      refreshCTM();
      const c = [[netBox.x, netBox.y], [netBox.x + netBox.width, netBox.y], [netBox.x, netBox.y + netBox.height], [netBox.x + netBox.width, netBox.y + netBox.height]].map(([x, y]) => worldToLocal(x, y));
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    },
    isVisible: (id) => E[id]?.vis,
  };
}
