// Anatomical stage (blueprint §6): the figure drawn on the GPU (plate, vessels, moving blood),
// over an SVG scene that holds the organ artwork, hit targets and overlays, and screen-space labels.

import { TIERS_ON, TIER_TOP, tierK, motionK } from './adapt-tier.js';
import { overMemory as gpuOverMemory } from './gpu-budget.js';
import { EDGES, NODES, PORTAL_TERRITORY, dMinOf, isOccluded, isStent, stentSite, STENT_SITES } from '../engine/topology.js';
import { RECTUM_FADE, LABEL_VESSEL, TIP_FADE, ART_FADE, TIP_CONNECT, VIEW, VB_ANAT, VB_CIRC, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN_NODES, CAUDATE, CONTEXT_EDGES, BACK_EDGES, IVC_EDGES, NODE_POS, ORGANS, SEAM_D, ORGAN_DETAIL, BACKDROP, LIVER_INNER, LIVER_EDGES, LANE_CAPTIONS, ABDOMEN_CLIP, CAVITY_LOW, SITES, LIVER_SPLIT_X, CIRCUIT_ZONES, STRANDS, SIN_EDGES, FEEDERS } from './anatomy.js';
import { pressureColor, deltaColor, dropColor, flowColor, heatColor, velColorOf, oxygenColor } from './colormap.js';
import { sideEndScale } from './fork-joins.js';
import { lookChanged, newLookSig } from './look-sig.js';
import { veinJoins as joinsPass, smoothRunOn as smoothPass, newJoinStore, runOnSamples } from './vein-joins.js';
import { nodeEnds, nodeDrawn, dotRadius } from './circuit-nodes.js';
import { store } from './store.js';
import { s, h, clamp, lerp, toast, loadFailed, restBox, translateRest, settledBox, UPRIGHT_MQ } from './util.js';
import { recordLayer } from './over-records.js';
import { lerpVT, camPath, blendPaths, viewsOverlap, driftEase } from './cam-arc.js';
import { easeMove, easeArrive, camMs, carryRate, carried, D_SMALL, D_SURFACE } from './ease.js';
import { lesionEase } from './lesion-ease.js';
import { bandsStep } from './band-ease.js';
import { glideClock } from './glide-clock.js';
import { clipBox, mapBox } from './fit-box.js';
import { fluidTarget } from './fluid-step.js';
import { fluidSpringFor } from './organ-ease.js';
import { spleenMotion } from './spleen-motion.js';
import { segHitsBox, lineIndex, indexHits } from './seg-hits.js';
import { smooth01 } from './liver-morph.js';
import { COLON_ART, BOWEL_ART, DUO_CLIPS, DUO_B } from './organ-art.js';
import { gpuProbe, COUNTED } from './gpu-probe.js';
import { fading } from './res-fade.js';
import { LIGHT } from './light.js';
import { sinceInput, booting, holdCover } from './quiet.js';
import { cssColor8 } from './css-color.js';
import { readFail, mulTo, elMat } from './organ-paint.js';
import { setLive, dropLive } from './live-style.js';
import { overUnits, overRun, needsReread, netChanges, OVER_CLASS, OVER_ALL } from './stage-over.js';
import { elBoxInto } from './shape-gl.js';
import { HOVER_LINK } from './hover-link.js';
import { createExplain } from './label-explain.js';
import { sceneCam } from './scene-cam.js';
import { createGlassGL, glassRegions, GLASS, PANE, roundPath } from './glass-gl.js';
import { writePoints, writeJoinNow } from './veins-sweep.js';
import { ENT_W } from './veins-bin.js';
import { createVeinsGL, binVeins, TUBE_TEXELS, MAX_TIERS, F_DIFFUSE, F_SHADOW, F_DOTTED, F_NOCASE, F_SPEC, F_VEIL, F_WHOLE, ORIGIN_GREY } from './veins-gl.js';
import { varixBead, beadRadius } from './varix-bead.js';
import { LOOK_SITE, varixSize, varixHold, varixWidthK, varixSpreadK, varixOpacity } from './varix-look.js';
import { alongCurve } from './pressure-along.js';
import { follow2, createColourFollow } from './display-state.js';
import { oxygenFor } from './blood.js';
import { createSweepClient } from './sweep-client.js';
import { createJunctionWidths } from './junction-widths.js';
import { chainsOf, planChainInto } from './vessel-taper.js';
import { frameFor, lateFrameFor, cancelFrame, mayTask, noteDraw, easeNow, inMotion, afterMotion, PACED, setSaver as setFrameSaver, onRenderScale, figOpt, figLab, onFigLab, PINCH_LOW_K, readFrameFor, frameGapFor } from './frame.js';
import { softwareYield } from './sw-yield.js';
import { layoutWatch } from './idle-keys.js';
import { writeGlowTexels } from './glow-texels.js';
import { SIN_PERFUSION, sinStrandRadius } from './sin-perfusion.js';
import { surface } from './gpu-surfaces.js';
import { guardBlur } from './blur-guard.js';
import { liftEnd, systemOf, SYSTEM_COLOR } from './highlight-math.js';
import { CellGrid, geomOf } from './cell-grid.js';
import { restPass, cancelRest } from './rest-pass.js';
import { createLateQueue } from './late-queue.js';
import { provideStage } from './layout-snap.js';
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
const LABEL_SLICE_MS = 2, LABEL_REST_SLICE_MS = 8, LABEL_FIRST_REST_MS = 24;
function sameDeps(a, b) { for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false; return true; }
let themeKeyTheme, themeKeyPalette, themeKeyVal = '';   // (the last theme and palette read, and the key made of them: built again only when one changed)
const themeKey = () => {
  const d = document.documentElement.dataset, t = d.theme, p = d.palette;
  if (t !== themeKeyTheme || p !== themeKeyPalette) { themeKeyTheme = t; themeKeyPalette = p; themeKeyVal = p ? `${t || ''}/${p}` : (t || ''); }
  return themeKeyVal;
};
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

import { reduceMotionMQ as reduceMotion } from './motion.js'; // The figure's overlays drawn on the GPU, in the vessel canvas (stage-over.js; 31 Oct, recs A1): on wherever the GPU draws the
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
import { lumOf } from './luma.js';
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

export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange }) {
  // <stage-split live>
  // The stage's shared lets (and consts made after a part), read at the moment of use by the part files: never copied, so a part cannot draw a frame late.
  const live = {
    get abdomenEl() { return abdomenEl; },
    get adaptK() { return adaptK; }, set adaptK(v) { adaptK = v; },
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
    get BLOCK_IO() { return BLOCK_IO; },
    get blockerBoxes() { return blockerBoxes; }, set blockerBoxes(v) { blockerBoxes = v; },
    get blockersAsk() { return blockersAsk; }, set blockersAsk(v) { blockersAsk = v; },
    get blockersAt() { return blockersAt; }, set blockersAt(v) { blockersAt = v; },
    get blockersStale() { return blockersStale; }, set blockersStale(v) { blockersStale = v; },
    get bloodClock() { return bloodClock; }, set bloodClock(v) { bloodClock = v; },
    get bloodEasing() { return bloodEasing; }, set bloodEasing(v) { bloodEasing = v; },
    get box() { return box; }, set box(v) { box = v; },
    get boxH() { return boxH; }, set boxH(v) { boxH = v; },
    get boxW() { return boxW; }, set boxW(v) { boxW = v; },
    get calloutSig() { return calloutSig; },
    get camDive() { return camDive; }, set camDive(v) { camDive = v; },
    get camK() { return camK; }, set camK(v) { camK = v; },
    get camMove() { return camMove; }, set camMove(v) { camMove = v; },
    get camOx() { return camOx; }, set camOx(v) { camOx = v; },
    get camOy() { return camOy; }, set camOy(v) { camOy = v; },
    get camShow() { return camShow; }, set camShow(v) { camShow = v; },
    get camShowFrom() { return camShowFrom; }, set camShowFrom(v) { camShowFrom = v; },
    get camShowRaf() { return camShowRaf; }, set camShowRaf(v) { camShowRaf = v; },
    get camShowT0() { return camShowT0; }, set camShowT0(v) { camShowT0 = v; },
    get camShowTo() { return camShowTo; }, set camShowTo(v) { camShowTo = v; },
    get carryClear() { return carryClear; }, set carryClear(v) { carryClear = v; },
    get carrying() { return carrying; }, set carrying(v) { carrying = v; },
    get carryReslot() { return carryReslot; }, set carryReslot(v) { carryReslot = v; },
    get catchUp() { return catchUp; }, set catchUp(v) { catchUp = v; },
    get cath() { return cath; },
    get cathFade() { return cathFade; }, set cathFade(v) { cathFade = v; },
    get cathHidAt() { return cathHidAt; }, set cathHidAt(v) { cathHidAt = v; },
    get cathRadOf() { return cathRadOf; },
    get cathTint() { return cathTint; }, set cathTint(v) { cathTint = v; },
    get cathVer() { return cathVer; }, set cathVer(v) { cathVer = v; },
    get caudK() { return caudK; }, set caudK(v) { caudK = v; },
    get chevHoles() { return chevHoles; }, set chevHoles(v) { chevHoles = v; },
    get clampAway() { return clampAway; }, set clampAway(v) { clampAway = v; },
    get clampBase() { return clampBase; }, set clampBase(v) { clampBase = v; },
    get clampFor() { return clampFor; }, set clampFor(v) { clampFor = v; },
    get clampFs() { return clampFs; }, set clampFs(v) { clampFs = v; },
    get clampLast() { return clampLast; }, set clampLast(v) { clampLast = v; },
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
    get dprobePaint() { return dprobePaint; },
    get drag() { return drag; }, set drag(v) { drag = v; },
    get drawOnce() { return drawOnce; }, set drawOnce(v) { drawOnce = v; },
    get drifting() { return drifting; }, set drifting(v) { drifting = v; },
    get dyeShown() { return dyeShown; }, set dyeShown(v) { dyeShown = v; },
    get E() { return E; },
    get easeInOut() { return easeInOut; },
    get edgeRev() { return edgeRev; }, set edgeRev(v) { edgeRev = v; },
    get F() { return F; }, set F(v) { F = v; },
    get fastGap() { return fastGap; }, set fastGap(v) { fastGap = v; },
    get figKeys() { return figKeys; },
    get figureHidden() { return figureHidden; },
    get figureShown() { return figureShown; }, set figureShown(v) { figureShown = v; },
    get fitted() { return fitted; }, set fitted(v) { fitted = v; },
    get fluidAmp() { return fluidAmp; }, set fluidAmp(v) { fluidAmp = v; },
    get fluidBandH() { return fluidBandH; }, set fluidBandH(v) { fluidBandH = v; },
    get fluidEasing() { return fluidEasing; },
    get fluidFade() { return fluidFade; },
    get fluidFrom() { return fluidFrom; }, set fluidFrom(v) { fluidFrom = v; },
    get fluidH() { return fluidH; }, set fluidH(v) { fluidH = v; },
    get fluidInkRGBA() { return fluidInkRGBA; },
    get fluidMaskB() { return fluidMaskB; }, set fluidMaskB(v) { fluidMaskB = v; },
    get fluidMaskOf() { return fluidMaskOf; }, set fluidMaskOf(v) { fluidMaskOf = v; },
    get fluidMaskOfB() { return fluidMaskOfB; }, set fluidMaskOfB(v) { fluidMaskOfB = v; },
    get fluidSeen() { return fluidSeen; }, set fluidSeen(v) { fluidSeen = v; },
    get fluidStillAt() { return fluidStillAt; }, set fluidStillAt(v) { fluidStillAt = v; },
    get fluidSurf() { return fluidSurf; }, set fluidSurf(v) { fluidSurf = v; },
    get following() { return following; }, set following(v) { following = v; },
    get fontPx() { return fontPx; },
    get forceDraw() { return forceDraw; }, set forceDraw(v) { forceDraw = v; },
    get frameNo() { return frameNo; }, set frameNo(v) { frameNo = v; },
    get frostHold() { return frostHold; }, set frostHold(v) { frostHold = v; },
    get fullFailed() { return fullFailed; }, set fullFailed(v) { fullFailed = v; },
    get fullSwap() { return fullSwap; }, set fullSwap(v) { fullSwap = v; },
    get fx() { return fx; }, set fx(v) { fx = v; },
    get fxAt() { return fxAt; }, set fxAt(v) { fxAt = v; },
    get fxSig() { return fxSig; }, set fxSig(v) { fxSig = v; },
    get geometryVersion() { return geometryVersion; }, set geometryVersion(v) { geometryVersion = v; },
    get gestureOn() { return gestureOn; },
    get gGut() { return gGut; }, set gGut(v) { gGut = v; },
    get gLabels() { return gLabels; },
    get glass() { return glass; },
    get glassGL() { return glassGL; }, set glassGL(v) { glassGL = v; },
    get glassSizing() { return glassSizing; }, set glassSizing(v) { glassSizing = v; },
    get glassWant() { return glassWant; },
    get glide() { return glide; }, set glide(v) { glide = v; },
    get glideCam() { return glideCam; }, set glideCam(v) { glideCam = v; },
    get glideRaf() { return glideRaf; }, set glideRaf(v) { glideRaf = v; },
    get glM() { return glM; }, set glM(v) { glM = v; },
    get glowSetAt() { return glowSetAt; }, set glowSetAt(v) { glowSetAt = v; },
    get glowSync() { return glowSync; }, set glowSync(v) { glowSync = v; },
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
    get hiddenAt() { return hiddenAt; }, set hiddenAt(v) { hiddenAt = v; },
    get holesKey() { return holesKey; }, set holesKey(v) { holesKey = v; },
    get homeAt() { return homeAt; }, set homeAt(v) { homeAt = v; },
    get hoverId() { return hoverId; }, set hoverId(v) { hoverId = v; },
    get inUpdate() { return inUpdate; }, set inUpdate(v) { inUpdate = v; },
    get isImaging() { return isImaging; },
    get islOn() { return islOn; }, set islOn(v) { islOn = v; },
    get islSrc() { return islSrc; }, set islSrc(v) { islSrc = v; },
    get JOB_NOW() { return JOB_NOW; },
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
    get labelScale() { return labelScale; }, set labelScale(v) { labelScale = v; },
    get labelSettleT() { return labelSettleT; }, set labelSettleT(v) { labelSettleT = v; },
    get labelShown() { return labelShown; }, set labelShown(v) { labelShown = v; },
    get labelSol() { return labelSol; }, set labelSol(v) { labelSol = v; },
    get labelSolSpare() { return labelSolSpare; }, set labelSolSpare(v) { labelSolSpare = v; },
    get labelSvg() { return labelSvg; },
    get labelTurned() { return labelTurned; }, set labelTurned(v) { labelTurned = v; },
    get labHid() { return labHid; }, set labHid(v) { labHid = v; },
    get laidFrame() { return laidFrame; }, set laidFrame(v) { laidFrame = v; },
    get landRide() { return landRide; }, set landRide(v) { landRide = v; },
    get landTo() { return landTo; }, set landTo(v) { landTo = v; },
    get lapHid() { return lapHid; }, set lapHid(v) { lapHid = v; },
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
    get lensFrom() { return lensFrom; }, set lensFrom(v) { lensFrom = v; },
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
    get lobFrom() { return lobFrom; }, set lobFrom(v) { lobFrom = v; },
    get lobIn() { return lobIn; }, set lobIn(v) { lobIn = v; },
    get lobMs() { return lobMs; }, set lobMs(v) { lobMs = v; },
    get lobOn() { return lobOn; }, set lobOn(v) { lobOn = v; },
    get lobSeen() { return lobSeen; }, set lobSeen(v) { lobSeen = v; },
    get lobT0() { return lobT0; }, set lobT0(v) { lobT0 = v; },
    get lobTo() { return lobTo; }, set lobTo(v) { lobTo = v; },
    get lobTurn() { return lobTurn; }, set lobTurn(v) { lobTurn = v; },
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
    get origins() { return origins; }, set origins(v) { origins = v; },
    get originsF() { return originsF; }, set originsF(v) { originsF = v; },
    get OVER_ON() { return OVER_ON; }, set OVER_ON(v) { OVER_ON = v; },
    get overlayKey() { return overlayKey; }, set overlayKey(v) { overlayKey = v; },
    get ovT() { return ovT; }, set ovT(v) { ovT = v; },
    get paintOrganAlpha() { return paintOrganAlpha; },
    get paneGL() { return paneGL; }, set paneGL(v) { paneGL = v; },
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
    get plateKey() { return plateKey; }, set plateKey(v) { plateKey = v; },
    get plateLast() { return plateLast; }, set plateLast(v) { plateLast = v; },
    get plateMiss() { return plateMiss; }, set plateMiss(v) { plateMiss = v; },
    get plateOn() { return plateOn; },
    get platePoke() { return platePoke; },
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
    get recAsk() { return recAsk; }, set recAsk(v) { recAsk = v; },
    get recKick() { return recKick; },
    get recVer() { return recVer; }, set recVer(v) { recVer = v; },
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
    get revF() { return revF; }, set revF(v) { revF = v; },
    get revFlip() { return revFlip; }, set revFlip(v) { revFlip = v; },
    get revH() { return revH; }, set revH(v) { revH = v; },
    get revP() { return revP; }, set revP(v) { revP = v; },
    get revT() { return revT; }, set revT(v) { revT = v; },
    get rideCTM() { return rideCTM; }, set rideCTM(v) { rideCTM = v; },
    get rideLeaders() { return rideLeaders; },
    get riseBox() { return riseBox; }, set riseBox(v) { riseBox = v; },
    get riseFast() { return riseFast; }, set riseFast(v) { riseFast = v; },
    get riseLine() { return riseLine; }, set riseLine(v) { riseLine = v; },
    get risePrep() { return risePrep; }, set risePrep(v) { risePrep = v; },
    get risePrepT() { return risePrepT; }, set risePrepT(v) { risePrepT = v; },
    get riseUsed() { return riseUsed; }, set riseUsed(v) { riseUsed = v; },
    get rotTarget() { return rotTarget; }, set rotTarget(v) { rotTarget = v; },
    get rotU() { return rotU; }, set rotU(v) { rotU = v; },
    get segIdx() { return segIdx; }, set segIdx(v) { segIdx = v; },
    get shownCol() { return shownCol; }, set shownCol(v) { shownCol = v; },
    get shunt() { return shunt; }, set shunt(v) { shunt = v; },
    get sigW() { return sigW; },
    get sinceP() { return sinceP; }, set sinceP(v) { sinceP = v; },
    get sites() { return sites; },
    get sleeping() { return sleeping; }, set sleeping(v) { sleeping = v; },
    get sleepTimer() { return sleepTimer; }, set sleepTimer(v) { sleepTimer = v; },
    get sliceEnd() { return sliceEnd; }, set sliceEnd(v) { sliceEnd = v; },
    get slideGlow() { return slideGlow; }, set slideGlow(v) { slideGlow = v; },
    get smooth01() { return smooth01; },
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
    get thrombiKey() { return thrombiKey; }, set thrombiKey(v) { thrombiKey = v; },
    get tokenRGB() { return tokenRGB; },
    get toneToken() { return toneToken; },
    get userMoved() { return userMoved; }, set userMoved(v) { userMoved = v; },
    get vBase() { return vBase; }, set vBase(v) { vBase = v; },
    get vdpr() { return vdpr; }, set vdpr(v) { vdpr = v; },
    get veins() { return veins; }, set veins(v) { veins = v; },
    get veinsDirty() { return veinsDirty; }, set veinsDirty(v) { veinsDirty = v; },
    get veinsHold() { return veinsHold; }, set veinsHold(v) { veinsHold = v; },
    get veinsTrimmed() { return veinsTrimmed; }, set veinsTrimmed(v) { veinsTrimmed = v; },
    get viewSeq() { return viewSeq; }, set viewSeq(v) { viewSeq = v; },
    get viewVersion() { return viewVersion; }, set viewVersion(v) { viewVersion = v; },
    get viewXf() { return viewXf; }, set viewXf(v) { viewXf = v; },
    get vLook() { return vLook; }, set vLook(v) { vLook = v; },
    get vt() { return vt; }, set vt(v) { vt = v; },
    get vtAnim() { return vtAnim; }, set vtAnim(v) { vtAnim = v; },
    get vtGliding() { return vtGliding; }, set vtGliding(v) { vtGliding = v; },
    get vtMs() { return vtMs; }, set vtMs(v) { vtMs = v; },
    get vtTarget() { return vtTarget; }, set vtTarget(v) { vtTarget = v; },
    get vtUntil() { return vtUntil; }, set vtUntil(v) { vtUntil = v; },
    get widthEasing() { return widthEasing; }, set widthEasing(v) { widthEasing = v; },
    get wrapRect() { return wrapRect; }, set wrapRect(v) { wrapRect = v; },
    get xfHold() { return xfHold; }, set xfHold(v) { xfHold = v; },
    get xfOp() { return xfOp; }, set xfOp(v) { xfOp = v; },
    get xfSolving() { return xfSolving; }, set xfSolving(v) { xfSolving = v; },
    get zoomBase() { return zoomBase; }, set zoomBase(v) { zoomBase = v; },
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
  // (And a slide's camera glide's own classes: cam-move and pinch-hide fade only the label layer, off-home only the zoom pill, and none
  // of the readers keyed on this (the stage's colours, the organs' grey, the vessel marks, the glow) reads either. Counted, each glide
  // began and ended with the marks rebuilt shape by shape, every organ's colours read again and the stage's colours dropped: about
  // 300 style passes on a phone's slide change.)
  const gestureFree = (c) => (c || '').replace(/(?:^|\s)(?:panning|stage-busy|figure-focus|lb-ride|cam-move|pinch-hide|off-home)(?=\s|$)/g, '');
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
        drop(); return;
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
  const nodeOut = [0, 0];   // (every caller reads the two numbers at once, by destructuring, spreading or indexing)
  const nodePos = (id, t) => { if (WEDGE_BRANCH[id]) { const w = wedgeTip(id); if (w) return w; } const a = NODE_POS[id][0], c = NODE_POS[id][1]; nodeOut[0] = lerp(a[0], c[0], t); nodeOut[1] = lerp(a[1], c[1], t); return nodeOut; };

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
    if (op === 'kids') a.replaceChildren(...b);   // (a label's pieces)
    else if (op === 'label') { if (!a.isConnected) gLabels.append(a); }   // (a new label)
    else if (op === 'lead') { for (let i = a.length - 1, next = null; i >= 0; i--) { if (!a[i].isConnected) { gLeaders.insertBefore(a[i], next); if (unlitKeys.size && unlitKeys.has(a[i].dataset.k)) a[i].classList.add('unlit'); } next = a[i]; } }   // (a new leader goes in just before the next one wanted that is already in)
    else if (op === 'add') { if (a !== b.parentNode) a.append(b); }   // (a node new to its parent)
    else if (op === 'append') a.append(...b);
    else if (op === 'text') a.textContent = b;   // (words a node is made with)
    else if (op === 'defs') defs.append(...a);
    else if (op === 'cathadd') { a.append(b); cath.lblKey = ''; cathLabelsSoon(); }   // (a reading new to the catheter's layer: laid out again once it is in)
    else if (op === 'fill') a.style.fill = b;   // (a reading's colour)
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
  // layer. a: the morph's t (the grid fades with it); the colours from the theme (syncMapInk: --map-dot, --text at .028 for the two
  // tinted zones, --accent at .09 for the lit one); rot: its turn from the vessels' (mapTurn); fx: the lit zone's fade (stepMap).
  const MAP = { a: 0, dot: [0, 0, 0, 0], zone: [0, 0, 0, 0], fx: [0, 0, 0, 0], alt: [0, 0, 0, 0], fxX: [0, 0], rot: [1, 0, 0, 0], fxOn: false, fxU: 0, fxCol: [0, 0, 0] };
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
  // went back to the SVG (stage-over.js).
  const abdE = { from: 0, to: 0, t0: 0, raf: 0 };
  const abdStep = (now) => {
    abdE.raf = 0;
    const k = Math.min(1, (now - abdE.t0) / D_SURFACE), v = abdE.from + (abdE.to - abdE.from) * easeArrive(k);
    putA(abdWall, 'opacity', k >= 1 ? abdE.to.toFixed(2) : v.toFixed(3));
    if (k < 1) abdE.raf = drawFrame(abdStep);
  };
  function abdTo(v) {
    if (reduceMotion.matches) { if (abdE.raf) cancelFrame(abdE.raf); abdE.raf = 0; abdE.to = +v; putA(abdWall, 'opacity', v); return; }
    if (+v === abdE.to) return;
    abdE.from = parseFloat(abdWall.getAttribute('opacity')) || 0; abdE.to = +v; abdE.t0 = performance.now();
    if (!abdE.raf) abdE.raf = drawFrame(abdStep);
  }
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
    E[e.id] = { e, tipFade, endFade, tube: isArt && !!ART_FADE[e.id], strands, feeders, isArt, vis: true, width: 4, wallPx: 1, shadeOk: false, shadeVer: 0 };
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
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return; c[k] = v; el.setAttribute(k, v); };
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
      if (!geoT) geoT = setTimeout(geoQuiet, GEO_QUIET);
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
    if (left > 4) { geoT = setTimeout(geoQuiet, left); return; }   // (written again since: wait out the rest of the quiet)
    geoT = 0;
    if (!geoPass) geoPass = restPass(flushGeoPass);
  }
  function flushGeoPass() { geoPass = 0; flushGeo(); }
  function flushGeo() {
    if (geoT) { clearTimeout(geoT); geoT = 0; }
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
  function syncMapInk(cs) {
    const d = cssColor8(cs.getPropertyValue('--map-dot').trim() || 'transparent');
    for (let i = 0; i < 4; i++) MAP.dot[i] = d[i];
    const tx = toRGB('var(--text)', cs), ac = toRGB('var(--accent)', cs), bg = toRGB('var(--stage-bg)', cs);
    for (let i = 0; i < 3; i++) { MAP.zone[i] = tx[i]; MAP.fx[i] = ac[i]; }
    MAP.zone[3] = 0.028; MAP.fx[3] = 0.09 * easeArrive(MAP.fxU);
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
  // The caudate lobe and its veins (CAUDATE): shown only while a slide is about them (pinOrgans 'caudate'), eased in
  // and out (.caud.on), under the stents and other overlays. Each vein is a tapered tube (a wall, its lumen colored
  // from its pressures like the vessels, a sheen) that fades into the IVC's wall instead of ending on it.
  const caud = (() => {
    const [ax, ay] = CAUDATE.anchor, W = CAUDATE.wall;
    const g = s('g', { class: 'caud gone', style: `transform-origin:${ax}px ${ay}px` });
    let defsHtml = '<radialGradient id="caudDome"><stop offset="0" class="caud-d0"/><stop offset=".55" class="caud-d1"/><stop offset="1" class="caud-d2"/></radialGradient>'
      + `<linearGradient id="caudFade" gradientUnits="userSpaceOnUse" x1="${W - 1}" y1="0" x2="${W + 4}" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<mask id="caudMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#caudFade)"/></mask>`;
    const lobe = s('g', { class: 'caud-lobe' });
    for (const [cx, cy, rx, ry, a] of CAUDATE.lobe) {
      const at = { cx, cy, rx, ry, transform: `rotate(${a} ${cx} ${cy})` };
      lobe.append(s('ellipse', { ...at, fill: 'url(#caudDome)' }));
    }
    const veinsG = s('g', { mask: 'url(#caudMask)', class: 'caud-veins' });
    CAUDATE.veins.forEach(([d, w], i) => {
      const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number), P0 = [n[0], n[1]], C = [n[2], n[3]], P1 = [n[4] + 3, n[5] - 1.5];   // (on into the wall, where it fades)
      const bez = (t, j) => (1 - t) ** 2 * P0[j] + 2 * (1 - t) * t * C[j] + t * t * P1[j];   // (the curve's x (j 0) or y (j 1) at t)
      // The outline of a tube that widens from a rounded start inside the lobe and flares a little into the cava.
      const h0 = (pad) => (w / 2) * 0.45 + pad;
      const tube = (pad) => {
        const L = [], R = [];
        for (let k = 0; k <= 20; k++) {
          const t = k / 20, tq = Math.min(1, t + 0.01), tr = Math.max(0, t - 0.01);
          const px = bez(t, 0), py = bez(t, 1), qy = bez(tq, 1), qx = bez(tq, 0), ry = bez(tr, 1), rx = bez(tr, 0);
          let nx = -(qy - ry), ny = qx - rx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          const h = (w / 2) * (0.45 + 0.55 * Math.min(1, t / 0.75)) * (1 + 0.25 * Math.max(0, (t - 0.75) / 0.25) ** 2) + pad;
          L.push([px + nx * h, py + ny * h]); R.push([px - nx * h, py - ny * h]);
        }
        return 'M' + [...L, ...R.reverse()].map((v) => v[0].toFixed(2) + ' ' + v[1].toFixed(2)).join(' L') + ' Z';
      };
      veinsG.append(s('path', { d: tube(0.45), class: 'caud-wall' }), s('circle', { cx: P0[0], cy: P0[1], r: h0(0.45), class: 'caud-wall' }),
        s('path', { d: tube(0), class: 'caud-lumen' }), s('circle', { cx: P0[0], cy: P0[1], r: h0(0), class: 'caud-lumen' }),
        s('path', { d: `M${bez(0.35, 0)} ${bez(0.35, 1)} Q ${C.join(' ')} ${P1.join(' ')}`, class: 'caud-sheen', 'stroke-width': (w * 0.22).toFixed(2) }));
    });
    g.insertAdjacentHTML('afterbegin', `<defs>${defsHtml}</defs>`);
    const lumens = [...veinsG.querySelectorAll('.caud-lumen')];
    g.append(lobe, veinsG);
    gOver.prepend(g);
    let cols = '', grow = '', goneT = 0, growKq = NaN;
    return {
      // (Once faded out, hidden, its veins' mask is off (.gone): a hidden group's mask is still built on every repaint.)
      show(on, veins) {
        g.classList.toggle('on', !!on); if (on) g.classList.toggle('lobe-only', !veins);
        clearTimeout(goneT);
        if (on) g.classList.remove('gone'); else goneT = setTimeout(() => g.classList.add('gone'), 760);
      },
      // Colored from the pressure they drain at (the IVC's: the lobe keeps its outflow); sized by its share of it.
      sync(c, kq) {
        if (c !== cols) { cols = c; for (const el of lumens) el.setAttribute('fill', c); }
        if (kq === growKq) return;   // (the same size gives the same text)
        growKq = kq;
        const v = `scale(${(1 + CAUDATE.grow[0] * kq).toFixed(3)}, ${(1 + CAUDATE.grow[1] * kq).toFixed(3)})`;
        if (v !== grow) { grow = v; g.style.transform = v; }
      },
    };
  })();
  const { SEL_FADE, dop, dopApply, dopGateOf, dpr, glow, noGlows, revShown, selAKey, setGlow, setGlowSrc, spot, spotOn, toneCol, vh } = createGlow({ ALL_EDGES, E, EI, geo, nextFrame }, live);
  // The glow and hover eases step at the display's rate, but the vessels are redrawn at the paced rate (animate): an
  // ease only marks the tubes stale, and the paced frame rebuilds and uploads them once.
  let glowSync = false;
  let slideGlow = [], glowSetAt = 0;   // (the slide's glows as set, and when: a glowSeq slide's step numbers follow them, V10)

  // ── View transform (pan / zoom) ───────────────────
  let vt = { k: 1, x: 0, y: 0 };
  let morph = store.get().view === 'circuit' ? 1 : 0, morphTarget = morph, lastMorph = -1;
  // The circuit can be turned a quarter turn counter-clockwise, so its flow runs bottom to top and
  // the map is tall instead of wide: it fills a phone held upright. rotU is the (animated) turn,
  // 0 to 1; the anatomy is never turned. The turn is part of the world transform and of the view
  // box (which swaps its width and height with it), so pan, zoom and every screen-space layer
  // keep working in the frame they already use.
  // With no saved choice, a phone or tablet held upright opens the circuit upright (the wide map would be a strip).
  const portraitPhone = () => matchMedia(UPRIGHT_MQ).matches;   // (the style sheet's upright clause, util.js)
  let rotTarget = (() => { try { const v = localStorage.getItem('pps.circuitRot'); return v == null ? (portraitPhone() ? 1 : 0) : v === '1' ? 1 : 0; } catch { return portraitPhone() ? 1 : 0; } })();
  let rotU = rotTarget;
  const rotEase = (u) => u * u * (3 - 2 * u);
  const CIRC_C = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];
  const VB_CIRC_R = [CIRC_C[0] - VB_CIRC[3] / 2, CIRC_C[1] - VB_CIRC[2] / 2, VB_CIRC[3], VB_CIRC[2]];
  // Degrees the world is turned by right now (blended in with the view morph).
  const rotDeg = () => -90 * rotEase(rotU) * Math.max(0, lastMorph);
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
  // (Holding 120 Hz §3.10, 2 Nov 2026: input is coalesced. A move, a wheel step or a pinch only sets the view (vt) and asks for the frame;
  // the SVG world's transform is written once, in that frame (flushVT, first thing in syncView), however many events came before it: a
  // trackpad reports a wheel step every few ms, and each wrote two transform attributes. The view's own maths (CTM, clientToVBFast) use
  // vt, never the attribute; a reader of the attribute's matrix (clientToWorld) flushes first.)
  let vtDirty = false;
  let zoomBase = null;   // (the camera zoomed with a card: zoomOpen)
  const flushVT = () => {
    if (!vtDirty) return;
    vtDirty = false;
    const deg = rotDeg(), tr = `translate(${vt.x} ${vt.y}) scale(${vt.k})${deg ? ` rotate(${deg.toFixed(3)} ${CIRC_C[0]} ${CIRC_C[1]})` : ''}`;
    mapTurn(deg);
    world.setAttribute('transform', tr);
    worldOver?.setAttribute('transform', tr);
  };
  const applyVT = () => {
    vtDirty = true;
    syncSemantic();
    CTM = null; viewVersion++; stageWake();
    // (While moving: the first step of a move drops the canvas to its moving share, once; it is back at rest when the view settles.)
    // (Not for the lobule's own moves: the unseen refit as a rise begins is no move of the viewer's, and dropping the share there
    // showed the whole rise soft, then faded back up partway through it.)
    if (resizeReady && !moveLow && figOpt('move') < 1 && !(diveT > 0)) { moveLow = true; easeRes(); settleRes(); }
    if (!viewRaf) viewRaf = nextFrame(syncView);
  };
  const syncLabelsRun = () => updateLabels(F), syncCardsRun = () => onViewChange?.();   // (made once: the probe is handed the same functions each frame)
  function syncView() {
    viewRaf = 0;
    flushVT();
    if (!F || lz?.isOpen()) return;
    refreshCTM();
    gpuProbe.time(null, 'labels (script)', syncLabelsRun);
    if (cath.st) cathLabelsSoon();
    // (updateLabels ends by painting the callouts and both probes, unless a camera glide held the labels back: they are painted here
    // only then, not a second time, whose reads came after the first paint's writes.)
    // (Nor while a glide runs: its own step paints them in this frame, after it has moved the view; painted here too, each was laid
    // out twice a frame, first at the view before the step. ?glidepaint=0: twice, as before.)
    if (!labelPainted && !vtGliding) {
      if (sites.list) sitesPaint();
      if (scan.on) scanPaint();
      dprobePaint();
    }
    // (Not while the camera zooms with a card: the cards are the ones moving it, and each frame's cards-follow pass was script per frame of the zoom.)
    if (!zoomBase) gpuProbe.time(null, 'cards follow (script)', syncCardsRun);
    // (The zoom pill reads it: at full ink while the view is away from its fit, quiet at home on a pointer device; app.css .off-home.)
    wrap.classList.toggle('off-home', !!homeAt && !sameView(vt, homeAt));
  }
  applyVT();
  // The figure's screen transform, computed from the viewBox, the zoom state and the stage box.
  // Asking the browser (getScreenCTM / getBoundingClientRect) right after the SVG has been
  // updated forces a synchronous style + layout pass over thousands of elements, every frame;
  // the arithmetic is exact and free. The stage box is cached and kept current by observers.
  let box = null, boxKept = null;   // (boxKept: the last box measured, handed out while a new one is being read)
  const measureBox = () => {
    // Measured without the lobule dive's zoom (a CSS scale on the svg), or the vessels would be drawn zoomed twice.
    const tf = svg.style.transform; if (tf) svg.style.transform = '';
    const r = wrap.getBoundingClientRect(), q = svg.getBoundingClientRect();
    if (tf) svg.style.transform = tf; box = boxKept = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom, sx: q.left - r.left, sy: q.top - r.top, sw: q.width, sh: q.height }; };
  // (1 Nov 2026, "Move everything to GPU": measured as the stage is made, when its size changes (the observer's callback, after the
  // browser's own layout) and first in the frame after a resize or a scroll that may have moved it (readFrame); never inside a frame's
  // writes. Until then the last box serves.)
  let boxAsk = 0;
  // (The read itself is its own function, handed to the read phase and called from nowhere else.)
  function boxRead() { boxAsk = 0; if (!box) { measureBox(); CTM = null; } }
  // (One read already asked for: a second call (stageBox while the box is still out) must not drop the transform refreshCTM has just
  // built from the kept box: the lobule's close threw on CTM.a in updateLabels.)
  const boxAgain = () => { if (boxAsk) return; box = null; CTM = null; boxAsk = readFrame(boxRead); };
  const stageBox = () => { if (!box) boxAgain(); return box || boxKept; };
  measureBox();
  new ResizeObserver(() => { measureBox(); CTM = null; }).observe(wrap);
  addEventListener('resize', boxAgain);
  // (Only a scroll that can move the figure: the page's, or a box holding it. A card's own list scrolling (Treat, Tests, a menu) left the
  // box dropped, so the next model frame measured the whole figure again after writing it, on every frame of the scroll.)
  addEventListener('scroll', (e) => { const t = e.target; if (t === document || t === window || t?.contains?.(wrap)) boxAgain(); }, true);
  // The screen's left and right safe-area insets (a notched phone held sideways, 47 to 59 px), read once from a zero-size probe (an
  // unregistered custom property hands env() back unresolved) and again after a resize or a turn. Zero everywhere else.
  // (Read as the stage is made and after a resize or a turn, in those events: never on a frame.)
  let saSnap = null;
  const saRead = () => {
    {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;padding:0 env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)';
      document.body.append(p);
      const cs = getComputedStyle(p);
      saSnap = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
      p.remove();
    }
  };
  saRead();
  addEventListener('resize', saRead); addEventListener('orientationchange', saRead);
  const saSides = () => saSnap;
  // (The page's layout snapshot (layout-snap.js) holds these three for the rest of the app: the kept box, the arithmetic matrix, the sides.)
  provideStage({ box: stageBox, ctm: () => { if (!CTM) refreshCTM(); return CTM; }, sides: saSides });
  let ctmLast = null;
  function refreshCTM() {
    const b = stageBox(), vb = vbBox;
    const s = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s) / 2 - vb.x * s, oy = b.top + b.sy + (b.sh - vb.height * s) / 2 - vb.y * s;
    // world → view box: translate(vt) · scale(k) · rotate(θ about the circuit's centre); then the view box → screen.
    const th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th), sk = s * vt.k;
    const ma = sk * co, mb = sk * si, mc = -sk * si, md = sk * co, me = ox + s * vt.x + sk * (CIRC_C[0] - co * CIRC_C[0] + si * CIRC_C[1]), mf = oy + s * vt.y + sk * (CIRC_C[1] - si * CIRC_C[0] - co * CIRC_C[1]);
    // An unchanged view keeps the same object, so the frame loop (which compares it) sees that nothing moved; a new one is made only when it moved.
    if (!(ctmLast && ctmLast.a === ma && ctmLast.b === mb && ctmLast.c === mc && ctmLast.d === md && ctmLast.e === me && ctmLast.f === mf && ctmLast.sc === sk)) ctmLast = { a: ma, b: mb, c: mc, d: md, e: me, f: mf, sc: sk };
    CTM = ctmLast;
    // (A dot keeps at least a 4 px radius on screen however far the map is zoomed out: written where the scale steps a quarter octave.)
    if (sk > 0) { const rm = DOT_MIN_PX / 2 ** (Math.round(Math.log2(sk) * 4) / 4); if (rm !== nd.rmin) { nd.rmin = rm; if (nd.at > 0) nodeVerts(nd.at); } }
    wrapRect = b;
    applyClampFs();
  }
  // (A narrowing's "60 %" is drawn in the figure: its size there is that of the labels' names on screen at any zoom, sweep batch 03 at 6–7 px.)
  function applyClampFs() {
    const sk = CTM?.sc || 0, cfs = sk > 0 ? (clampBase / sk).toFixed(2) : '';
    const csw = sk > 0 ? `${(7 / sk).toFixed(2)}px` : '';   // (the clamps' halo, 7 px on screen: --clamp-sw, app.css)
    if (csw && csw !== clampSw) { clampSw = csw; for (let i = 0; i < clampGs.length; i++) clampGs[i].style.setProperty('--clamp-sw', csw); }
    if (cfs && cfs !== clampFs) { clampFs = cfs; for (let i = 0; i < clampGs.length; i++) clampGs[i].style.setProperty('--clamp-fs', `${cfs}px`); placeClampLabels(); }
    // (The pressure-change halos and the shunt's target name: their size on screen at any zoom, as above.)
    const hk = sk > 0 ? (1 / sk).toFixed(3) : '';
    if (hk && hk !== haloK) { haloK = hk; for (const g of haloEls) g.style.setProperty('--halo-k', hk); }
  }
  function worldToLocal(x, y) {
    if (!CTM) refreshCTM();
    return [CTM.a * x + CTM.c * y + CTM.e - wrapRect.left, CTM.b * x + CTM.d * y + CTM.f - wrapRect.top];
  }
  /** worldToLocal, written into o (a kept pair) rather than made. */
  function worldToLocalInto(o, x, y) {
    if (!CTM) refreshCTM();
    o[0] = CTM.a * x + CTM.c * y + CTM.e - wrapRect.left; o[1] = CTM.b * x + CTM.d * y + CTM.f - wrapRect.top;
    return o;
  }
  // (The inverse: a stage point (local px) as a world point under the camera now.)
  const NO_ANCHOR = /^(lane:|scan|stage|fxs:|tips|dips|dsrs|portocaval|mesocaval|custom|60%:)/, ANCHOR_W = [0, 0];
  function localToWorldInto(o, x, y) {
    if (!CTM) refreshCTM();
    const px = x + wrapRect.left - CTM.e, py = y + wrapRect.top - CTM.f, det = CTM.a * CTM.d - CTM.b * CTM.c;
    if (!det) { o[0] = NaN; o[1] = NaN; return o; }
    o[0] = (CTM.d * px - CTM.c * py) / det; o[1] = (CTM.a * py - CTM.b * px) / det;
    return o;
  }
  function clientToWorld(cx, cy) {
    flushVT(); if (geoHeld.size) flushGeo();
    const m = world.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function clientToVB(cx, cy) {
    if (geoHeld.size) flushGeo();
    const m = svg.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function freeCentre() { const ins = safeInsets(), b = stageBox(); return [b.left + (ins.l + ins.W - ins.r) / 2, b.top + (ins.t + ins.H - ins.b) / 2]; }
  // A zoom step by the buttons glides there instead of jumping.
  function animZoomAt(cx, cy, factor) {
    fitted = false; handed = !lobuleOn;
    if (lobuleOn) return;
    const [vx, vy] = clientToVBFast(cx, cy), base = vtTarget && vtAnim ? vtTarget : vt;
    const k = clamp(base.k * factor, 0.6, 6), wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    animateVT({ k, x: vx - wx * k, y: vy - wy * k }, 260);
  }
  // A trackpad pinch may stretch a little past the limits (it springs back when it ends).
  function zoomAt(cx, cy, factor, stretch = false) {
    if (lobuleOn) return;   // the lobule view has its own zoom
    // (By arithmetic, as a touch pinch does: asking the browser for the matrix (getScreenCTM) after the last event's new transform laid
    // the whole figure out again, on every wheel event of a trackpad pinch, several a frame on a Mac.)
    const [vx, vy] = clientToVBFast(cx, cy);
    const wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    // (A new view, never the old one changed in place: the first fit sets the view, the home framing and the glide's target outright, and
    // a zoom that changed the one object changed them all, so the home look took the zoomed view for home and glided it back to the fit
    // as soon as a card moved: a pinch in the first seconds after the page opened was undone.)
    const k = stretch ? clamp(vt.k * factor, 0.5, 7.2) : clamp(vt.k * factor, 0.6, 6);
    vt = { k, x: vx - wx * k, y: vy - wy * k };
    applyVT(); CTM = null;
  }
  // Default framing. The circuit is a wide map (≈ 1.9 : 1); in a squarish or tall viewport,
  // fitting its width would shrink every station to a dot, so it opens zoomed to fill the height,
  // centered on the portal vein and liver, and the learner pans sideways to the beds or heart.
  // The esophagus and the great veins run on above the plate and fade out; Fit stops where they fade.
  const FIT_TOP = -40;
  // The figure fills the window and the rest of the interface floats over it. Each floating piece
  // says which edge it holds (data-safe="top|bottom|left|right"); the default framing keeps the
  // figure in the space they leave. Side cards count only on a wide screen (on a phone they are
  // sheets over the figure), and the figure never shrinks to a sliver for them.
  // The space the cards leave above them and below the top bars, as it really is (no softening): the HVPG
  // procedure keeps its zoomed view and readings inside it. A phone's sheet and a tablet's wide card count as bottom.
  // (A piece sliding with the sinusoid zoom, main.js sinMotion: the dock as it slides away (vd-out) no longer counts, and while
  // the dock or the view pill slides back, data-slide-y holds its shift on screen, so it counts where it will rest.)
  const slideRest = (el, q) => { const y = +el.dataset.slideY || 0; return y ? new DOMRect(q.x, q.y - y, q.width, q.height) : q; };
  // (A card hidden by visibility no longer counts, except the slide's data card while it waits for its entry (data-safe-waits):
  // an upright phone's data card with its readings on a sheet waits hidden by visibility, not opacity (styles/app.css
  // .pz-sheet.pz-hide), while the slide's camera frames. Skipped then, the figure framed as if no card stood at the top, and the
  // card came in over the slide's vessel: the test all deck's clot slide on an iPhone, 19 Oct. Only that card: the Tests sheet and
  // the Details panel (data-safe-rest too) are hidden by visibility when closed, and counted then, the app opened framed small at
  // the top of a phone, 19 Oct.)
  const unseenCard = (el) => !('safeWaits' in el.dataset) && (el.checkVisibility ? !el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).visibility === 'hidden');
  // (Kept while nothing they measure may have moved (layoutWatch), and taken against the kept stage box: each call read every card's box
  // and the stage's, many times in a slide's frames.)
  // (1 Nov 2026, "zero layout inside the frame": the cards' boxes and the zoom and nav pills' are read together (snapRead) as the stage
  // is made, first in the frame after anything placed changes (layoutWatch's touch, readFrame), after a resize, and once more as the
  // watch settles; every framing in between (safeInsets, cardSpace, clearPill, centreDrawn) is worked out from that snapshot, with no
  // read. A read-phase caller about to frame (a refit, the home look, the first fit) takes a fresh one first if a change is waiting
  // (snapFresh).)
  const insMemo = new Map();
  // (fn is handed a, b and c, so a caller need not make a closure to pass its arguments.)
  function insKept(key, fn, a, b, c) {
    const m = insMemo.get(key);
    if (m) return m;
    const v = fn(a, b, c);
    insMemo.set(key, v);
    return v;
  }
  const flag = { imaging: false, dataLayer: false, hasSel: false };   // (what update last found: read by the paints after it)
  let cardsSnap = [], pillsSnap = { zoom: null, nav: null }, snapDirty = true, snapAsk = 0, snapSettle = 0;
  function cardsRead() {
    const out = [];
    for (const el of document.querySelectorAll('[data-safe]')) {
      // (A card playing its way out no longer counts: the camera frames for what stays.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('vd-out')) continue;
      if (unseenCard(el)) continue;
      const q = slideRest(el, el.getBoundingClientRect());
      if (!q.width || !q.height) continue;
      // (data-safe-rest: a card whose own transform only eases it in or out counts where it rests, so the camera frames once.)
      out.push({ el, q, rest: 'safeRest' in el.dataset ? translateRest(el, restBox(el, q)) : q });
    }
    return out;
  }
  function pillRead(el, settle) {
    if (!el) return null;
    const box = settle ? settledBox(el) : el.getBoundingClientRect();
    return { el, box, shown: !!box.width && getComputedStyle(el).visibility !== 'hidden' };
  }
  function snapRead() {
    snapAsk = 0; snapDirty = false;
    cardsSnap = cardsRead();
    pillsSnap = { zoom: pillRead(document.getElementById('zoomPill'), true), nav: pillRead(document.querySelector('.pz-bar.pzb-pill'), false) };
    insMemo.clear();
  }
  function snapFresh() { if (snapDirty) snapRead(); }
  function snapAgain() {
    snapDirty = true; snapAsk ||= readFrame(snapRead);
    clearTimeout(snapSettle); snapSettle = setTimeout(snapAgainLater, 2600);   // (and once the watch has settled: a card's last eased box)
  }
  function snapAgainLater() { snapDirty = true; snapAsk ||= readFrame(snapRead); }
  watch.onTouch(snapAgain);
  snapAgain();
  addEventListener('resize', snapAgain);
  addEventListener('orientationchange', snapAgain);
  const insWrap = () => stageBox();
  function cardSpace() { return { ...insKept('space', cardSpaceFrom, cardsSnap) }; }
  // (Live, for a caller already in the read phase: the catheter's room.)
  const cardSpaceRead = () => cardSpaceFrom(cardsRead());
  function cardSpaceFrom(list) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.safe);
    const wr = insWrap(), W = wr.width, H = wr.height, sp = { t: 0, b: 0 };
    for (const { el, q } of list) {
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0), y1 = q.bottom - wr.top;
      if (y1 <= 0 || y0 >= H) continue;
      const edge = el.dataset.safe;
      if (edge === 'top') sp.t = Math.max(sp.t, y1);
      else if (y0 > H * 0.3 && (W < 768 || q.width > W * 0.75 || (edge === 'bottom' && !el.classList.contains('side')))) sp.b = Math.max(sp.b, H - y0);
    }
    return sp;
  }
  // (exact: the cards' real edges, with no softening: a slide that must keep its vessels clear of them, even where they leave a thin band.)
  const INS_KEY = ['ins|0|', 'ins|1|'];   // (the memo's keys for no skipped pieces: kept, not built)
  function insSkipKey(exact, skip) { let k = INS_KEY[exact ? 1 : 0]; for (let i = 0; i < skip.length; i++) k += (i ? ',' : '') + (skip[i]?.id || '?'); return k; }
  function safeInsets(exact = false, skip = null) {
    return { ...insKept(skip ? insSkipKey(exact, skip) : INS_KEY[exact ? 1 : 0], safeInsetsFrom, cardsSnap, exact, skip) };
  }
  function safeInsetsFrom(list, exact = false, skip = null) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.safe);
    const wr = insWrap(), W = wr.width, H = wr.height;
    const ins = { t: 0, b: 0, l: 0, r: 0, W, H }, cards = [];
    if (!W || !H) return ins;
    // A phone held sideways docks its cards at the side like a tablet (dock.js), so they count as side cards.
    const wide = W >= 768 || (W > H && H <= 500 && W >= 640);
    for (const { el, rest: q } of list) {
      if (skip && skip.includes(el)) continue;
      // The vitals dock folded to one line on a phone (main.js) still counts at its full height, so the
      // framing does not jump each time it folds and opens.
      // (data-safe-pad: room kept clear above a piece too, as the 8 px between the figure's readings and the view switch's pill.)
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0);
      const x0 = q.left - wr.left, x1 = q.right - wr.left, y1 = q.bottom - wr.top;
      if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) continue;
      let edge = el.dataset.safe;
      // A card is a side card when it is docked there (the Tests card's class `side`) and a sheet when it spans the screen (a phone's,
      // sideways too, and an upright iPad's), whatever the window's size says: dock.js and the phone block of app.css decide that.
      const side = el.classList.contains('side'), sheet = !side && !store.get().presenting && q.width > W * 0.65;
      if (edge === 'right' && !side && (!wide || sheet)) edge = 'bottom';   // a phone's cards are sheets over the bottom
      else if (edge === 'bottom' && el.classList.contains('side')) edge = 'right';   // the instruments docked at the side
      if (edge === 'top') ins.t = Math.max(ins.t, y1);
      else if (edge === 'bottom') ins.b = Math.max(ins.b, H - y0);
      else if (edge === 'right' && (wide || side)) { ins.r = Math.max(ins.r, W - x0); cards.push([y0, y1]); }
      else if (wide && edge === 'left') ins.l = Math.max(ins.l, x1);
    }
    // Where the side cards would leave under 60% of the width (a tablet held upright), a short card is cleared
    // above (or below) instead, so the figure keeps the full width rather than shrinking into a strip.
    // (Not while presenting: a slide's text and data columns are laid out to leave the figure its own column.)
    if (ins.r && W - ins.l - ins.r < W * 0.6 && !store.get().presenting) {
      const top = Math.min(...cards.map((c) => c[0])), bot = Math.max(...cards.map((c) => c[1]));
      if (top > H * 0.45) { ins.b = Math.max(ins.b, H - top + 8); ins.r = 0; }
      else if (bot <= H * 0.62) { ins.t = Math.max(ins.t, bot + 8); ins.r = 0; }
    }
    // (While presenting, the slide's words and data card both stay clear even on a tablet: the figure frames into the
    // column between them rather than going under them; only a strip too thin to frame anything gives way.)
    if (W - ins.l - ins.r < (store.get().presenting ? 200 : W < 768 ? 260 : Math.min(W * 0.5, 360))) ins.l = ins.r = 0;
    if (!exact && H - ins.t - ins.b < H * 0.35) { const k = (H * 0.65) / (ins.t + ins.b); ins.t *= k; ins.b *= k; }
    return ins;
  }
  // A framing computed for the whole stage, moved and scaled into the free space.
  function insetVT(v, vbArr) {
    const ins = safeInsets(), { W, H } = ins;
    if (!W || !H) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(W / vw, H / vh);
    const f = Math.min((W - ins.l - ins.r) / W, (H - ins.t - ins.b) / H);
    const cx = vx + vw / 2, cy = vy + vh / 2, ox = (ins.l - ins.r) / 2 / s0, oy = (ins.t - ins.b) / 2 / s0;
    return { k: v.k * f, x: cx + ox + f * (v.x - cx), y: cy + oy + f * (v.y - cy) };
  }
  const circVB = () => (rotTarget ? VB_CIRC_R : VB_CIRC);
  // The whole map keeps clear of the zoom pill (+, −, Fit), which stands in the figure's bottom right corner beside
  // any card on the right. Where the map would run under it, the map rises at the same size until it ends 8 px above the
  // pill, if the room under the top bars allows (shrinking it would also thin out its labels); only where it does not, the
  // map shrinks just enough to end 8 px left of the pill (sweep, 16 Oct: the controls covered the Epigastric → SVC corner).
  // (The whole map's drawn extent in world units, as #net's box with every collateral open: the same in every case, so the
  // framing never moves as collaterals open.)
  const ART_CIRC = [70, 30, 1330, 730];
  function clearPill(v, vbArr) {
    const zp = pillsSnap.zoom, pill = zp?.el;
    if (!pill) return v;
    const p = zp.box, wr = stageBox();   // (both kept: snapRead and the stage box)
    if (!p.width || !p.height || !wr.width || !wr.height || pill.classList.contains('no-room') || !zp.shown) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(wr.width / vw, wr.height / vh);
    const ox = (wr.width - vw * s0) / 2 - vx * s0, oy = (wr.height - vh * s0) / 2 - vy * s0;
    let [x0, y0, x1, y1] = ART_CIRC;
    // (Turned upright, the map's box turns a quarter turn counter-clockwise about the circuit's centre.)
    if (rotTarget) {
      const n0 = CIRC_C[0] + (y0 - CIRC_C[1]), n1 = CIRC_C[1] - (x1 - CIRC_C[0]), n2 = CIRC_C[0] + (y1 - CIRC_C[1]), n3 = CIRC_C[1] - (x0 - CIRC_C[0]);
      x0 = n0; y0 = n1; x1 = n2; y1 = n3;
    }
    const ax0 = ox + s0 * (v.x + v.k * x0), ax1 = ox + s0 * (v.x + v.k * x1), ay0 = oy + s0 * (v.y + v.k * y0), ay1 = oy + s0 * (v.y + v.k * y1);
    const g = 8, pl = p.left - wr.left - g, pt = p.top - wr.top - g, pr = p.right - wr.left + g, pb = p.bottom - wr.top + g;
    if (ax1 <= pl || ax0 >= pr || ay1 <= pt || ay0 >= pb) return v;
    const up = ay1 - pt + 1, room = ay0 - safeInsets().t - g;   // (+1: the art's box rounds on screen; a whole pixel to spare)
    if (up <= room) return { k: v.k, x: v.x, y: v.y - up / s0 };
    if (pl - ax0 < (ax1 - ax0) * 0.5) return v;
    const f = (pl - ax0) / (ax1 - ax0), wx = (ax0 - ox) / s0, wy = ((ay0 + ay1) / 2 - oy) / s0;
    return { k: v.k * f, x: wx - f * (wx - v.x), y: wy - f * (wy - v.y) };
  }
  // On a slide, the circuit as drawn (its header row down to its lowest open vessel) stands centred in the height the cards leave,
  // above the nav pill, at the same size: framed for every collateral, a circuit with few open sat high over a bare band (17 Oct
  // design review, iPad on its side). Read from the vessels' circuit courses, which never morph, so it frames once.
  function centreDrawn(v) {
    if (!store.get().presenting) return v;
    const wr = stageBox(), W = wr.width, H = wr.height;
    if (!W || !H) return v;
    let bot = -Infinity;
    for (const x of EV) {
      if (!x.vis || x.ghost) continue;
      const C = geo[x.e.id]?.C;
      if (C) for (const p of C) if (p[1] > bot) bot = p[1];
    }
    if (!Number.isFinite(bot)) return v;
    const [, vy, vw, vh] = VB_CIRC, s0 = Math.min(W / vw, H / vh), oy = (H - vh * s0) / 2 - vy * s0;
    const ins = safeInsets(), top = oy + s0 * (v.y + v.k * vy), end = Math.min(oy + s0 * (v.y + v.k * (vy + vh)), oy + s0 * (v.y + v.k * bot) + 30);
    let floor = H - ins.b;
    for (let pi = 0; pi < 2; pi++) {
      const pl = pi ? pillsSnap.zoom : pillsSnap.nav, r = pl?.box;
      if (r?.width && pl.shown) floor = Math.min(floor, r.top - wr.top - 8);
    }
    const hi = floor - end, dy = Math.min(hi, Math.max(ins.t + 4 - top, (ins.t + floor) / 2 - (top + end) / 2));   // (never past the pill, nor its top under a card)
    return hi > 0 && dy > 0 ? { k: v.k, x: v.x, y: v.y + dy / s0 } : v;
  }
  // The whole map, in the space the cards leave and clear of the zoom pill.
  const circWhole = () => clearPill(insetVT({ k: 1, x: 0, y: 0 }, circVB()), circVB());
  // The boxes the home framing fits: whole groups as drawn, and each gut organ (in its own transform) with every clipped
  // part cut to its clip path's box.
  // (The boxes are folded into acc [x0, y0, x1, y1] as they are worked out, none kept: the one caller wants only their union. A group's parts
  // wait in one flat list of numbers (x, y, width, height each) for the group's matrix, which is read after them as it always was.)
  const fitParts = [], fitWhole = [], fitBoxA = { x: 0, y: 0, width: 0, height: 0 }, fitBoxK = { x: 0, y: 0, width: 0, height: 0 }, fitBoxP = { x: 0, y: 0, width: 0, height: 0 };
  function fitFold(acc, b) {
    if (!b.width || !b.height) return;
    acc[0] = Math.min(acc[0], b.x); acc[1] = Math.min(acc[1], b.y); acc[2] = Math.max(acc[2], b.x + b.width); acc[3] = Math.max(acc[3], b.y + b.height);
  }
  function fitBoxes(whole, clipped, acc) {
    // (2 Nov 2026: each box worked out in script from the shapes' own numbers (elBox), not getBBox, which laid the page out in a pan.)
    for (const g of whole) { const b = elBoxInto(g, fitBoxA); if (b) fitFold(acc, b); }
    for (const g of clipped) {
      const parts = fitParts;
      parts.length = 0;
      for (const c of g.children) {
        const b = elBoxInto(c, fitBoxA); if (!b || !b.width || !b.height) continue;
        const id = /url\(#([^)]+)\)/.exec(c.getAttribute('clip-path') || '')?.[1];
        const cp = id && svg.querySelector('#' + CSS.escape(id))?.firstElementChild;
        const k = cp && elBoxInto(cp, fitBoxK);
        const pb = k ? clipBox(b, k) : b;
        if (pb) parts.push(pb.x, pb.y, pb.width, pb.height);
      }
      const m = g.transform?.baseVal?.consolidate()?.matrix, P = fitBoxP;
      for (let i = 0; i < parts.length; i += 4) {
        P.x = parts[i]; P.y = parts[i + 1]; P.width = parts[i + 2]; P.height = parts[i + 3];
        fitFold(acc, m ? mapBox(P, m) : P);
      }
    }
  }
  const fitAcc = [0, 0, 0, 0];
  let fitKept = 0;
  function defaultVT(circuit) {
    if (!circuit) {
      // Fit frames everything the plate draws: the heart and the veins above it, the organs, the
      // flanks, and with ascites the fluid pooled in the pelvic floor below the default frame. The
      // box is measured, so it follows an enlarged spleen or a growing ascites.
      // (The layout size: the svg's drawn rectangle is scaled while the lobule zoom plays, and a fit read from it lands somewhere else.)
      const sb = stageBox(), rw = sb.sw, rh = sb.sh;   // (the svg's box as kept, measured without the dive's zoom)
      if (!rw || !rh) return { k: 1, x: 0, y: 0 };
      let x0 = VB_ANAT[0], y0 = VB_ANAT[1], x1 = VB_ANAT[0] + VB_ANAT[2], y1 = VB_ANAT[1] + VB_ANAT[3];
      // Only what holds still is measured: the abdomen, the organs and the ascites. The vessels morph (to and from
      // the circuit, and as the first frames lay them out), and measuring them made the framing land in one place
      // and then glide to another a second later.
      // (A box ignores clip paths, so the gut's art, drawn past Mohammad's outlines and clipped to them, is measured
      // clipped: fitBoxes. Measured whole, its loose ends pushed the framing off centre.)
      fitWhole.length = 0; fitWhole.push(gBackdrop);
      for (let c = gOrgans.firstElementChild; c; c = c.nextElementSibling) if (c !== gGut) fitWhole.push(c);
      fitWhole.push(gAscites);
      const acc = fitAcc;
      acc[0] = x0; acc[1] = y0; acc[2] = x1; acc[3] = y1;
      fitBoxes(fitWhole, gutKids(), acc);
      x0 = acc[0]; y0 = acc[1]; x1 = acc[2]; y1 = acc[3];
      y0 = Math.max(y0, FIT_TOP) - 8; y1 += 8;
      // The svg shows its viewBox scaled to fit (meet), and the spare room on the other axis is
      // visible too: fit the box into that whole visible area, less what the floating pieces cover.
      const ins = safeInsets();
      const s0 = Math.min(rw / VB_ANAT[2], rh / VB_ANAT[3]);
      const fw = Math.max(40, rw - ins.l - ins.r), fh = Math.max(40, rh - ins.t - ins.b);
      const k = Math.min(1.15, fw / s0 / (x1 - x0), fh / s0 / (y1 - y0));
      const cx = VB_ANAT[0] + VB_ANAT[2] / 2 + (ins.l - ins.r) / 2 / s0, cy = VB_ANAT[1] + VB_ANAT[3] / 2 + (ins.t - ins.b) / 2 / s0;
      fitKept = k;   // (kept for an arc's widest pull back, arcRoom)
      return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
    }
    // Turned upright, the map is tall and fills the height of the stage as it is.
    if (rotTarget) return circWhole();
    const ins = safeInsets();
    const W = ins.W - ins.l - ins.r, H = ins.H - ins.t - ins.b;
    const s0 = Math.min(W / VB_CIRC[2], H / VB_CIRC[3]);
    // (With a card at the side the whole map is shown: the close-up is for a narrow screen with nothing over it.)
    if (ins.l || ins.r || VB_CIRC[3] * s0 > 0.62 * H) return centreDrawn(clearPill(insetVT({ k: 1, x: 0, y: 0 }, VB_CIRC), VB_CIRC));
    const k = clamp((0.94 * H) / (VB_CIRC[3] * s0), 1, 3);
    const cx = VB_CIRC[0] + VB_CIRC[2] / 2, cy = VB_CIRC[1] + VB_CIRC[3] / 2;
    const fx = 640, fy = cy;
    return insetVT({ k, x: cx - k * fx, y: cy - k * fy }, VB_CIRC);
  }
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
  // Which framing the circuit was last given ('whole' map or 'focus' close-up: setView, Fit, a refit). The circuit has no home
  // look of its own, so a turn of the device or a new window size takes the same kind of framing again, for the new shape (lookHome).
  // circAt: that framing as given, so a turn or a resize takes it again only while the view is still exactly there (a card's pan to
  // reveal a vessel, a pinch or a tool's camera moved it: it stays where it was put).
  const circAt = { k: 1, x: 0, y: 0 };   // (a copy of the framing, written in place: only read while circFit is set)
  let circFit = null;
  const markCirc = (kind, v) => { circFit = kind; circAt.k = v.k; circAt.x = v.x; circAt.y = v.y; };
  // The Tests card opening leaves the camera where it is (Mohammad, 20 Oct): the pan and zoom stay as they were, under the card too.
  // keepView(true) is called as the card opens and notes the space the other pieces leave (the card itself not counted); the
  // refits that follow the card (the open's, the sheet settling, a tool's card changing height) and the home framing's own
  // look then leave the view alone for as long as only the Tests card has changed that space. Another card coming or going,
  // a turn of the device or a resize changes it, and the framing follows as ever; so do the Fit button and a slide's own
  // framing (not kept while presenting).
  let keptSpace = null;
  const spaceSig = () => {
    // (The vitals dock changes shape beside a side-docked Tests card, so it is not counted either.)
    const i = safeInsets(false, [document.getElementById('dock'), document.getElementById('vdock')]);
    return `${Math.round(i.W)},${Math.round(i.H)},${Math.round(i.t)},${Math.round(i.b)},${Math.round(i.l)},${Math.round(i.r)}`;
  };
  // (Once the space has changed for another reason the view is no longer kept: the framing follows from then on.)
  const keptNow = () => {
    if (keptSpace === null) return false;
    if (!store.get().presenting && keptSpace === spaceSig()) return true;
    keptSpace = null;
    return false;
  };
  const fit = () => {
    // In the lobule view, Fit shows the whole lobule again (it never leaves the view). Inside the sinusoid it steps back out to the lobule.
    if (lobuleOn) { if (store.get().sinusoid) { store.set({ sinusoid: false }); return; } lz.fitView(); return; }
    handsOff(); handed = false;
    const circuit = morphTarget === 1, focus = defaultVT(circuit), whole = circuit ? circWhole() : { k: 1, x: 0, y: 0 };
    const near = (a, b) => Math.abs(a.k - b.k) < 0.02 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    // Judged from where a glide in progress is going, so a second tap toggles as expected.
    const at = vtGliding ? vtTarget : vt;
    const to = circuit && !near(focus, whole) ? (near(at, whole) ? focus : whole) : focus;
    if (!circuit) homeAt = to;
    else markCirc(to === whole ? 'whole' : 'focus', to);
    fitted = true;
    // It glides there, as the zoom buttons do (reduced motion: a short glide).
    animateVT(to, 420);
  };

  // A card or sheet opened or closed: glide to the framing for the space that is now free (not in the lobule, which refits itself).
  // (circAgain: lookHome has it take the circuit's last kind of framing again, for a new shape, instead of the close-up.)
  let circAgain = false;
  // (Measured first in the next frame, while the layout is still the last frame's (readFrame), and glided after: a refit asked for in a
  // frame (main.js, a card's fold) no longer lays the page out among that frame's writes.)
  let refitAsk = 0;
  function refit() { refitAsk ||= readFrame(refitRead); }
  function refitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    refitAsk = 0;
    if (lobuleOn || keptNow()) return;
    const to = circAgain && morphTarget === 1 && circFit === 'whole' ? circWhole() : defaultVT(morphTarget === 1);
    if (morphTarget !== 1) homeAt = to; else markCirc(circAgain ? circFit : 'focus', to);
    fitted = true;
    // (Mid-measurement the catheter's camera keeps the view: its trip back ends on the new fit instead of the old one.)
    if (cath.saved) { cath.saved = to; return; }
    if (!sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, 420, { steady: true });
  }
  // The Tests card closed. A fitted view (see fitted) is fitted again to the space the card leaves, whatever the tools did
  // with the camera meanwhile; a view the learner zoomed or panned stays where it is, and the home framing is let go so the
  // looks that follow the card leaving (resize, pps:occ) leave it alone too. Every way of closing it (the Tests button, its
  // close button, Esc, a swipe) comes here, so they all end the same. Gives back true when it fits.
  function closeView() {
    if (lobuleOn) return false;
    if (fitted) return true;
    homeAt = null;
    return false;
  }

  // Turn the circuit upright (flow bottom to top) or back to wide. Shown whole, it stays whole (fitted
  // to the new shape); zoomed in, it keeps the zoom and turns about the point at the middle of the
  // free space, which stays where it is on screen.
  let rotHold = null;
  function holdView(hd) {
    const b = stageBox(), vb = vbBox, s0 = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s0) / 2 - vb.x * s0, oy = b.top + b.sy + (b.sh - vb.height * s0) / 2 - vb.y * s0;
    const k = hd.sc / s0, th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
    const dx = hd.w[0] - CIRC_C[0], dy = hd.w[1] - CIRC_C[1];
    const rx = CIRC_C[0] + co * dx - si * dy, ry = CIRC_C[1] + si * dx + co * dy;
    vt = { k, x: (hd.sx - ox) / s0 - k * rx, y: (hd.sy - oy) / s0 - k * ry };
    applyVT(); CTM = null;
  }
  let rotWhole = null;
  function setCircuitRotated(on) {
    on = on ? 1 : 0;
    try { localStorage.setItem('pps.circuitRot', String(on)); } catch (e) { caught('stage:2120', e); /* storage unavailable */ }
    if (on === rotTarget) return;
    // Mid-glide (Fit, a zoom button), the turn starts from where the glide was going.
    if (vtGliding) { cancelFrame(vtAnim); driftEnd(); vtGliding = false; vt = { ...vtTarget }; applyVT(); CTM = null; }
    const whole = morphTarget !== 1 || vt.k <= 1.001 || sameView(vt, circWhole());
    rotHold = null;
    if (!whole) {
      const ins = safeInsets(), b = stageBox();
      const sx = b.left + (ins.l + ins.W - ins.r) / 2, sy = b.top + (ins.t + ins.H - ins.b) / 2;
      refreshCTM();
      rotHold = { w: clientToWorld(sx, sy), sx, sy, sc: CTM.sc };
    }
    rotTarget = on;
    cancelFrame(vtAnim); driftEnd();
    if (whole) vt = morphTarget === 1 ? circWhole() : { k: 1, x: 0, y: 0 };
    // (The framing the turn lands on, taken now, at the press: the turn's last frame sets it again without measuring the cards.)
    rotWhole = whole && morphTarget === 1 ? { ...vt } : null;
    if (morphTarget !== 1 || reduceMotion.matches) { rotU = on; setViewBox(easeInOut(morph)); if (rotHold) { holdView(rotHold); rotHold = null; } }
  }

  // A bottom sheet (the action card on a phone) covers the lower part of the figure. reveal() pans the figure,
  // no more than needed, so the selected structure stays in the part that is left; unreveal() puts the view back
  // when the sheet closes, unless the learner has moved the figure since.
  let revealFrom = null, revealTo = null;
  const sameView = (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  function reveal(sel, insetBottom) {
    if (!sel || lobuleOn || lz?.isOpen()) return;
    const a = anchorFor(sel);
    if (!a) return;
    const ins = safeInsets();
    const W = wrap.clientWidth, H = wrap.clientHeight, top = Math.max(44, ins.t + 12), bottom = H - Math.max(insetBottom, ins.b) - 18, side = 18;
    if (bottom - top < 80) return;
    // A vessel is kept wholly in view when it fits; one too long for that keeps at least its middle in view.
    let x0 = a.x, x1 = a.x, y0 = a.y, y1 = a.y;
    if (a.r != null) for (const [px, py] of a.path) { x0 = Math.min(x0, px - a.r); x1 = Math.max(x1, px + a.r); y0 = Math.min(y0, py - a.r); y1 = Math.max(y1, py + a.r); }
    if (x1 - x0 > W - 2 * side) { x0 = x1 = a.x; }
    if (y1 - y0 > bottom - top) { y0 = y1 = a.y; }
    const inside = y0 >= top && y1 <= bottom && x0 >= side && x1 <= W - side;
    if (inside) return;
    const s = vbScale();
    const dx = x0 < side ? side - x0 : x1 > W - side ? W - side - x1 : 0;
    const dy = y0 < top ? top - y0 : y1 > bottom ? bottom - y1 : 0;
    if (revealTo && !sameView(vt, revealTo)) revealFrom = null;   // the learner moved the figure: keep it where it is
    if (!revealFrom) revealFrom = { ...vt };
    revealTo = { k: vt.k, x: vt.x + dx / s, y: vt.y + dy / s };
    animateVT(revealTo, 320);
  }
  function unreveal() {
    if (revealFrom && sameView(vt, revealTo)) animateVT(revealFrom, 320);
    revealFrom = revealTo = null;
  }

  // ── Semantic zoom: abdomen → liver → lobule ───────
  // Zooming (wheel, pinch, buttons) only moves the camera: past ×1.9 over the liver its inner
  // trees open (see liverExpanded) and a trail in the corner names the level. The lobule is
  // never entered by zooming alone; it opens only when asked for (the trail's Lobule step, the
  // liver's card, the palette, a presenter step) and cross-fades over the plate.
  let liverBB = null;
  const liverBBox = { x: 0, y: 0, w: 0, h: 0 };   // (liverBB's box, written in place once)
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
  const { anatCovered, camShowTo_, diveFrame, prepRise, pushCam, riseReady, setDiveScale, setLobule } = createDive({ applyVT, defaultVT, drawFrame, driftEnd, liverBox, lobuleBackstop, lobuleStep, nextFrame, refreshCTM, riseVT, sameView, spleenMoving, svg, syncSemantic, update, updateLabels, vCanvas, worldToLocal, wrap }, live);
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
  // opacity takes the cards' glass drawn in it along, and the glass goes solid for the ease, the fade and the dive. camK/camOx/camOy: the
  // dive's zoom and its origin (CSS px from the canvas's corner); camDive/camShow: the dive's hide and the figure's own fade-in, each 0 to 1.
  let lobIn = false;   // (the lobule is landed and drawn in this renderer's context: the figure's alpha is 0 under it)
  let camK = 1, camOx = 0, camOy = 0, camDive = 1, camShow = 1, camShowRaf = 0, camShowT0 = 0, camShowFrom = 1, camShowTo = 1;
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
  let lobOn = false, lobFrom = 0, lobTo = 0, lobTurn = false, lobMs = 0, lobT0 = 0, lobSeen = -1;
  const lobulePoke = () => { if (lobuleOn && lz.isOpen()) platePoke(); };
  const lobuleRasterSoon = () => afterMotion(lobulePoke);
  function lobuleStep(now, end = false) {
    const on = lobOn, from = lobFrom, to = lobTo, turn = lobTurn, ms = lobMs, t0 = lobT0;
    const e0 = ms && !end ? clamp(((PACED ? easeNow() : now) - t0) / (ms * Math.abs(to - from) || 1), 0, 1) : 1, e = turn ? e0 * e0 * (3 - 2 * e0) : e0;
    const wasDiving = diveT > 0;
    diveT = from + (to - from) * e;
    if (wasDiving !== diveT > 0) for (const g of cardGLs) g.redraw();   // (the cards' glass: drawn in the figure's canvas, or only leaving its place out of the labels, the dive's turn)
    // A frame that throws must not leave the anatomy stuck mid-zoom: the glide always goes on to its end.
    try { diveFrame(diveT); } catch (err) { if (e < 1) console.error(err); }
    if (e < 1) lobAnim = nextFrame(lobuleStep);
    // the anatomy's raster, held back during the dive, catches up under the lobule (once the slide's cards have come in: frame.js holdMotion)
    else if (on) setTimeout(lobuleRasterSoon, 600);
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
    if (PACED && diveT !== lobSeen) { lobSeen = diveT; lobEnd = setTimeout(lobuleBackstop, 1000); return; }
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
    if (lobuleOn && morphTarget !== 0) { lobuleOn = false; lobU = 0; diveT = 0; diveLand = null; lz.setDive(null); lz.setDiveZoom(1, 0, 0); if (diveAt) setDiveScale(1); { const lab = wrap.querySelector('#labels'); if (lab) lab.style.opacity = ''; } cancelFrame(lobAnim); if (store.get().lobule) store.setSoon(LOBULE_OFF); }
    const u = morphTarget === 0 ? lobU : 0;
    const wasOpen = lz.isOpen();
    lz.setFade(u);
    if (wasOpen && !lz.isOpen() && F && !inUpdate) update(F);
    wrap.classList.toggle('in-lobule', u > 0.98);
    if (lobIn !== (u > 0.98 && !!lz?.shared)) { lobIn = !lobIn; pushCam(); }
  }
  let vtAnim = 0, vtGliding = false;
  let vtUntil = 0, vtMs = 0;   // (the glide under way: when it lands and how long it runs in all, for the presenter's cards: glideLeft)
  let vtVel = null, vtLast = null;   // (the last frames of a plain glide: its speed per ms, so another begun on it carries that on)
  const vtVelBuf = { t: 0, dlogk: 0, x: 0, y: 0 }, vtLastBuf = { t: 0, k: 1, x: 0, y: 0 };   // (what they are while set, written in place)
  const camMoves = [], logMove = (m) => { camMoves.push(m); if (camMoves.length > 60) camMoves.shift(); };   // every glide of the camera (and dive), kept for the tests: a way into or out of the lobule is a single move
  let vtTarget = null;   // where the last animated move was headed
  // A presenter's camera move: the labels ease out as it starts, are not laid out while it runs, and ease
  // back in at their new places once it settles (they never slide across the figure).
  let camMove = false;
  // The change between the views, labels and camera on its one clock (view-switch-labels-recs.md, option B2). At the tap the new view's labels are
  // solved for where the change lands (solveTargetView) and the labels standing become ghosts (label-gl.js freezeGhosts); the figure's own progress p
  // then runs everything: the camera is lerped from its framing to the target's by p, the ghosts ride their points at 1 - 2p and the new labels
  // theirs at 2p - 1. Nothing is solved or built as it lands; the pictures of the new view are built in the frames of the change.
  let viewXf = null, glSuppress = false, xfOp = '';
  const { morphAnchorAt, pre, preAbort, preAsk, viewXfP, viewXfStart, viewXfStep, xfMarkCurrent, xfRelease } = createView({ EV, VB_CIRC_R, applyVT, circWhole, defaultVT, driftEnd, edgeVisible, geo, handRideEnd, labelJobDrop, labelJobStep, labelKeyNow, labelSig, labelSliceRun, labelTail, layoutLabels, layoutLabelsGen, nextFrame, refreshCTM, rotEase, sameView, stageBox, updateLabels, vbBox, vesselAt, visAt, worldToLocalInto }, live);
  // The solve is a job sliced over the change's frames: one short slice in the tap's own frame (xfSolving shortens updateLabels' first slice), then one
  // per frame of the morph (viewXfStep), the rest at the landing if it comes first. The new labels stay at nothing until it lands.
  let xfSolving = false;
  // (The change landed before the new view's labels were solved: they stay at nothing until the solve lands, never the old view's labels on the new figure.)
  let xfHold = false;
  // (Whether the view is moving now: a glide, a pan or a pinch. Boxes kept for the frame's reads are not read again while it is.)
  const viewMoving = () => vtGliding || camMove || wrap.classList.contains('panning');
  // A slow push (opt.drift: a time-lapse's lapse.cam) is not a move of that kind: the labels stay up and ride with the figure, each kept
  // on its side as a hand's zoom keeps them (updateLabels), and are solved again for where it stopped once it lands, gliding there.
  let drifting = false;
  // A presenter's small move that keeps the labels it has (carry, see animateVT): they ride with the figure as a slow push's do, so the
  // learner never loses the names, and only the leaders fade (lb-ride) and come back once it lands. Any change to what the labels
  // show hands the move back to the usual fade (carryAbort), so a label never appears part way through it.
  let carrying = false;
  // A glide with the labels up (combined recs P2): its labels are solved once, as it starts, for where it lands (solveLanding), and carried
  // from there all the way (updateLabels, landing): no solve while it runs, none as it lands, and no label changing sides part way.
  // Each label eases from its old spot to its new one (labelGlide), so nothing jumps as the glide starts. Only where nothing the labels
  // are placed against moves with the camera (a callout, a probe, a scan, a treatment's labels, the lobule) and what they show is the same
  // at both ends; otherwise the glide solves as it always did.
  let landRide = false, landTo = null, landAt = -1e9;
  const landing = () => landRide && vtGliding && vtTarget === landTo;
  const rideLeaders = (on) => wrap.classList.toggle('lb-ride', on);
  // A presenter's camera move (camMove) with every label on the GPU: the names ride with the figure on the GPU through the glide, their
  // pictures carried by the camera's move since they were laid out (label-gl.js ride), instead of fading out for the whole move and
  // back in once it lands; the leaders, their dots and the liver's pane ease out as on a small move (lb-ride), and at the landing each
  // label glides on to its new place. No label is laid out, and nothing of the page is written for them, on any frame of the glide.
  // Mohammad, 1 Nov: "Labels don't seem like GPU". ?labelride=0: they fade out for the move, as before.
  let labelRider = null, rideCTM = null;
  let handRide = null, handRideT = 0, layCTM = null;   // (a hand's zoom ridden by the labels, and the camera they were last laid out under: updateLabels)
  // (A matrix in stage px, written into a kept six: stagePx is the camera the labels were last laid out under (layCTM keeps it, written in
  // place at each layout); a ride keeps its own copy, and the ride's frame matrix is one more.)
  const stagePxLay = [0, 0, 0, 0, 0, 0], stagePxRide = [0, 0, 0, 0, 0, 0], stagePxNow = [0, 0, 0, 0, 0, 0], rideM6 = [1, 0, 0, 1, 0, 0];
  const stagePxInto = (o, m) => { o[0] = m.a; o[1] = m.b; o[2] = m.c; o[3] = m.d; o[4] = m.e - wrapRect.left; o[5] = m.f - wrapRect.top; return o; };
  const stagePx = (m) => stagePxInto(stagePxLay, m);
  // (from: the camera the labels were last laid out under, stage px (layCTM); a presenter's glide starts from the camera as it is.)
  function rideStart(from = null) {
    if (rideCTM) return true;   // (a move taken over by another: the labels ride on from where they were laid out)
    // (A treatment's catheter keeps the figure's labels on (keep): they ride its glides too. The HVPG catheter hides them: nothing to carry.)
    if (!labelRider?.canRide() || (cath.st && !cath.st.keep) || lobuleOn || lz?.isOpen() || diveT > 0 || wrap.classList.contains('cam-move')) return false;   // (reduced motion rides too: a label that stays on its point as the figure moves adds no motion of its own; hidden, the names went for every pinch and glide)
    refreshCTM();
    if (from) { for (let q = 0; q < 6; q++) stagePxRide[q] = from[q]; } else stagePxInto(stagePxRide, CTM);
    rideCTM = stagePxRide;
    rideLeaders(true); glass.style.opacity = '0';
    rideM6[0] = 1; rideM6[1] = 0; rideM6[2] = 0; rideM6[3] = 1; rideM6[4] = 0; rideM6[5] = 0;
    labelRider.ride(rideM6);
    return true;
  }
  function rideStep() {
    if (!rideCTM) return;
    refreshCTM();
    const [a, b, c, d, e, f] = rideCTM, n = stagePxInto(stagePxNow, CTM), det = a * d - b * c || 1e-9;
    const i0 = d / det, i1 = -b / det, i2 = -c / det, i3 = a / det, i4 = (c * f - d * e) / det, i5 = (b * e - a * f) / det;   // (where the labels were laid out, inverted)
    rideM6[0] = n[0] * i0 + n[2] * i1; rideM6[1] = n[1] * i0 + n[3] * i1; rideM6[2] = n[0] * i2 + n[2] * i3; rideM6[3] = n[1] * i2 + n[3] * i3; rideM6[4] = n[0] * i4 + n[2] * i5 + n[4]; rideM6[5] = n[1] * i4 + n[3] * i5 + n[5];
    labelRider.ride(rideM6);
  }
  // (The landing, before the labels are laid out again: they glide on from where they rode.)
  function rideStop() {
    if (!rideCTM) return;
    rideCTM = null;
    labelRider?.rideEnd();
    rideLeaders(false); glass.style.opacity = '';
  }
  function driftEnd() { if (!drifting) return; drifting = false; carrying = false; rideLeaders(false); labelSettleSoon(); }
  function carryAbort() {
    carrying = false; drifting = false; rideLeaders(false);
    if (!vtGliding) return;   // (it landed already: the usual settle)
    camMove = true; dpr.carry = false; wrap.classList.add('cam-move');   // (and camSettle lays them out at their new places as the glide lands)
  }
  function camSettle() {
    if (!camMove) return;
    camMove = false; dpr.carry = false;
    rideStop();
    if (F) updateLabels(F);
    nextFrame(camMoveOff);
  }
  const camMoveOff = () => { if (!camMove) wrap.classList.remove('cam-move'); };
  const camSettleIdle = () => { if (!vtGliding) camSettle(); };
  // The arc a presenter's long move is taking (see cam-arc.js), so a refit while it runs bends it to the new framing instead of starting over.
  let arcRun = null;
  // The viewBox units the stage really shows (the svg meets its viewBox, so the spare room on one axis shows more), and the widest
  // view an arc may pull back to: the whole figure's fit.
  function arcRoom() {
    const b = stageBox(), cw = b.sw, ch = b.sh;   // (the svg's box, kept: no layout read)
    if (!cw || !ch) return null;
    const s0 = Math.min(cw / VIEW.w, ch / VIEW.h), vb = { w: cw / s0, h: ch / s0, cx: VIEW.w / 2, cy: VIEW.h / 2 };
    // (The anatomy's fit zoom as last framed, kept by defaultVT: an arc's frames no longer measure the cards and the figure.)
    return { vb, wMax: vb.w / (fitKept || 1) };
  }
  // opt.arc: a presenter's framing. A long move (the two views share nothing) pulls back and comes in rather than panning across at full zoom.
  // The view following a presenter's card frame by frame (Mohammad, 30 Oct, iPhone: "The view still snaps/jumps when I untuck a stacked
  // card"): as the readings' card slides out or tucks away, under the finger or on its own ease, the view is set each frame between the
  // framing for the readings tucked (v0) and the framing for them out (v1), at the same share u the card has travelled. The figure then
  // moves with the card, never after it: a glide begun as the card came to rest, or even as it began, was a second move beside the card's,
  // and a finger's pull slid the card over a figure that only moved once it was let go. The labels ride with it as they do with a slow
  // push (drifting) and are solved again once it ends (followEnd, driftEnd). Any glide or framing set outright ends it (animateVT).
  // aimView: where a framing would go, without moving: the camera functions run with animateVT only noting its target.
  let following = false, follow0 = null, follow1 = null, aiming = false, aimed = null, followScene = false, followU = 0;
  function aimView(fn) {
    aiming = true; aimed = null;
    try { fn(); } finally { aiming = false; }
    const v = aimed || (vtGliding ? vtTarget : vt); aimed = null;
    return v ? { k: v.k, x: v.x, y: v.y } : null;
  }
  // (The view as it stands, when it stands still at a framing a card's room can be followed from: not mid-glide or push, nor in the
  // lobule, the circuit or a morph or dive.)
  const viewNow = () => (following || zoomBase || vtGliding || drifting || lobuleOn || morphTarget !== 0 || morph > 0 || diveT > 0 ? null : { k: vt.k, x: vt.x, y: vt.y });
  function followStart(v0, v1) {
    if (!v0 || !v1 || sameView(v0, v1) || !viewNow()) return false;
    cancelFrame(vtAnim); driftEnd();
    following = true; follow0 = { ...v0 }; follow1 = { ...v1 };
    // (A camera-only move, 4 Nov 2026, Mohammad: "the whole figure view moves instead of this being a camera only move with everything sticking to
    // their locations": the view stays as it rests and the scene camera carries it from v0 to where v1 puts it, as a card's zoom does (sceneSet);
    // the view takes v1 in the frame the move ends. With no room for that (the GPU figure not up) it is the view's own move, as before.)
    followScene = !!(veins && !veins.lost && veins.setScene && wrapRect && vCanvas);
    if (followScene) { sceneStart(); followU = 0; } else drifting = true;   // (drifting: the labels ride, see drifting; driftEnd solves them again)
    return true;
  }
  function followAt(u) {
    if (!following) return;
    const f = clamp(u, 0, 1), a = follow0, b = follow1;
    if (followScene) {
      // (v(f) from v0: screen' = S screen + t, where S = k(f)/k0 and t = (O + s x(f)) - S (O + s x0), O and s the view box's place in the stage.)
      followU = f;
      const bx = stageBox(), vb = vbBox, sc = Math.min(bx.sw / vb.width, bx.sh / vb.height), O = bx.sx + (bx.sw - vb.width * sc) / 2 - vb.x * sc, Oy = bx.sy + (bx.sh - vb.height * sc) / 2 - vb.y * sc;
      const k = a.k + (b.k - a.k) * f, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, S = k / a.k;
      sceneSet(S, O + sc * x - S * (O + sc * a.x), Oy + sc * y - S * (Oy + sc * a.y));
      return;
    }
    vt = { k: a.k + (b.k - a.k) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    applyVT(); CTM = null;
    if (cath.st) { refreshCTM(); cathLabelsSoon(); }
    if (sites.list) { refreshCTM(); sitesPaint(); }
    if (scan.on) scanPaint(); dprobePaint();
  }
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
  const zoomM6 = [1, 0, 0, 1, 0, 0], zoomT = [0, 0];
  let drawCam = null;   // (a card's zoom landed: the figure's layer drawn for C·view, see zoomSharp; null: drawn for the view, carried by the camera)
  const zoomGlass = [], zoomHid = [], zoomAff = { s: 1, dx: 0, dy: 0, ox: 0, oy: 0 };   // (the callouts' glass bodies given the zoom, and the callouts that go out under the zoomed card)
  const zoomAffFn = () => (zoomLayers ? zoomAff : null), zoomScaleFn = () => zoomAff.s;   // (C in stage px, written in place each frame: the label ride's matrix and the pinned points')
  function zoomOpen() {
    if (zoomBase) return false;
    if (lobuleOn && lz?.zoomOpen) { if (!lz.zoomOpen()) return false; zoomBase = { lz: true }; zoomLz = true; return true; }
    if (!viewNow()) return false;
    sceneStart();
    // (The figure's callouts (the HVPG pressures, a stent's points, the Doppler's readings) are page elements in two of those layers: their glass is drawn
    // from the same camera (zoomAffine, glass-gl.js), and one that would end under the zoomed card goes out through the zoom, since a page element cannot be
    // blurred behind the card's glass as the picture is: it showed sharp over the card.)
    zoomGlass.length = 0; zoomHid.length = 0;
    const aim = sceneCam.aim;
    if (aim) {
      const S = aim.s;
      const tx = (aim.ox - wrapRect.left) * (1 - S) + aim.dx, ty = (aim.oy - wrapRect.top) * (1 - S) + aim.dy;
      const fx = Math.min(0, Math.max(wrapRect.width * (1 - S), tx)), fy = Math.min(0, Math.max(wrapRect.height * (1 - S), ty));
      const bx = aim.box, pad = 8;
      for (const L of [cath.labels, sites.el]) {
        if (!L) continue;
        for (const c of L.children) {
          const r = c.getBoundingClientRect();
          if (!(r.width > 0)) continue;
          const l = wrapRect.left + S * (r.left - wrapRect.left) + fx, t = wrapRect.top + S * (r.top - wrapRect.top) + fy, rr = l + r.width * S, bb = t + r.height * S;
          if (l < bx.right + pad && rr > bx.left - pad && t < bx.bottom + pad && bb > bx.top - pad) zoomHid.push({ el: c, was: c.style.opacity, tr: c.style.transition });
        }
        for (const g of L.getElementsByClassName('cl-glass')) { g.zoomAffine = zoomAffFn; g.drawnScale = zoomScaleFn; zoomGlass.push(g); }
      }
      for (const h of zoomHid) { h.el.style.transition = `opacity ${D_SMALL}ms var(--ease)`; h.el.style.opacity = '0'; }
      frostWake();
    }
    zoomBase = { scene: true };
    return true;
  }
  // The scene camera's layers, for a card's zoom and for the readings' card tucking away or coming out (followStart): the figure's page layers are taken
  // (where each stands is read now, before any write: the frames read nothing), and the labels with no station ride by their centres (the leaders' page
  // layer eases out as in a ride).
  function sceneStart() {
    refreshCTM();
    const layers = [svg, wrap.querySelector('#stageOver'), cath.labels, sites.el].filter(Boolean);
    zoomLayers = layers.map((el) => { const r = el.getBoundingClientRect(); return { el, left: r.left, top: r.top }; });
    for (const l of zoomLayers) { l.el.style.transformOrigin = '0 0'; l.el.style.transition = 'none'; }
    zoomGlass.length = 0; zoomHid.length = 0;
    rideStart();
  }
  // One frame of the camera: p' = S p + (tx, ty) in stage px. The figure's canvas (canvas px), the page's figure layers (one matrix each), the callouts'
  // glass and the labels, all from the same numbers, in this frame.
  function sceneSet(S, tx, ty) {
    if (!zoomLayers || !wrapRect) return;
    zoomT[0] = tx; zoomT[1] = ty;
    zoomM6[0] = S; zoomM6[3] = S; zoomM6[4] = tx; zoomM6[5] = ty;
    zoomM = zoomM6;
    zoomAff.s = S; zoomAff.dx = wrapRect.left * (1 - S) + tx; zoomAff.dy = wrapRect.top * (1 - S) + ty;
    const sx = vCanvas.width / (boxW || vCanvas.width || 1), sy = vCanvas.height / (boxH || vCanvas.height || 1);
    if (drawCam && (Math.abs(drawCam[0] - S) > 1e-4 || Math.abs(drawCam[4] - tx) > 0.01 || Math.abs(drawCam[5] - ty) > 0.01)) zoomSharp(false);   // (the zoom moved: the rest picture carried again)
    if (!drawCam) veins?.setScene?.(S, tx * sx, ty * sy);
    for (const l of zoomLayers) l.el.style.transform = `matrix(${S.toFixed(5)},0,0,${S.toFixed(5)},${((S - 1) * (l.left - wrapRect.left) + tx).toFixed(2)},${((S - 1) * (l.top - wrapRect.top) + ty).toFixed(2)})`;
    if (rideCTM) labelRider.ride(zoomM6);   // (draws every label: the stations' at C(their points), the rest carried)
    else labelGL?.pinDraw();
  }
  // Sharp at landing (card-zoom-plan.md 3.5): once the card has landed, the figure's layer is drawn again for exactly the view the camera carries it
  // to, and the camera is let go for the figure's canvas: nothing moves, only the sharpness changes (the layout keeps reading the rest view, and the
  // labels' points are still carried by C). Going back, or a change of the zoom (the readings coming out), carries the rest picture again first.
  function zoomSharp(on) {
    if (zoomLz && zoomBase) { lz?.zoomSharp?.(on); return; }
    if (!zoomBase?.scene || !zoomLayers || !veins || veins.lost) return;
    if (on === !!drawCam) return;
    if (on) {
      if (!zoomM) return;
      drawCam = zoomM6.slice();
      veins.setScene(1, 0, 0);
    } else {
      drawCam = null;
      veins.setScene(1, 0, 0);
    }
    veinsDirty = true; CTM = null; refreshCTM();
    drawVeins(true, 'zoom-sharp');
    if (!on && zoomM) { const sx = vCanvas.width / (boxW || vCanvas.width || 1), sy = vCanvas.height / (boxH || vCanvas.height || 1); veins.setScene(zoomM6[0], zoomM6[4] * sx, zoomM6[5] * sy); }
  }
  function sceneStop() {
    zoomM = null;
    if (drawCam) { drawCam = null; veinsDirty = true; CTM = null; refreshCTM(); drawVeins(true, 'zoom-end'); }   // (landed sharp: drawn for the rest view again before the camera is let go)
    veins?.setScene?.(1, 0, 0);
    for (const l of zoomLayers || []) { l.el.style.transform = ''; l.el.style.transformOrigin = ''; l.el.style.transition = ''; }
    zoomLayers = null;
    for (const g of zoomGlass) { delete g.zoomAffine; delete g.drawnScale; }
    for (const h of zoomHid) { h.el.style.opacity = h.was; h.el.style.transition = h.tr; }
    zoomGlass.length = 0; zoomHid.length = 0;
    frostWake();
    rideStop();
    labelGL?.pinDraw();
    stageWake();
  }
  function cardZoomAt(S, px, py, dx, dy) {
    const z = zoomBase;
    if (!z) return;
    if (zoomLz) { lz.zoomAt(S, px, py, dx, dy); return; }
    if (!z.scene || !wrapRect) return;
    sceneCam.set(S, px, py, dx, dy);
    // (The picture is only the stage's size: where C's own move would bare a strip of the stage (a card at an edge), the figure and its
    // labels take the nearest move that covers it: sceneCam.cover.)
    sceneCam.cover(zoomT, wrapRect.left, wrapRect.top, wrapRect.width, wrapRect.height);
    sceneSet(S, zoomT[0], zoomT[1]);
  }
  function zoomEnd() {
    if (!zoomBase) return;
    const z = zoomBase; zoomBase = null;
    if (zoomLz) { zoomLz = false; lz?.zoomEnd(); return; }
    if (!z.scene) return;
    sceneCam.off();
    sceneStop();
  }
  function followEnd() {
    if (!following) return;
    const a = follow0, b = follow1, f = followU, scene = followScene;
    following = false; follow0 = follow1 = null; followScene = false;
    if (scene) {
      // (The view takes where the camera has carried it, drawn whole in this frame before the camera is given up, so nothing is seen to move.)
      vt = { k: a.k + (b.k - a.k) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      applyVT(); CTM = null; refreshCTM(); flushVT();
      drawVeins(true, 'follow-end');
      sceneStop();
      drifting = true;
    }
    driftEnd();
  }
  // (A change of scale up to the 35 % a hand's zoom carries labels through, and a pan of up to 30 % of the width on view. Anything bigger
  // brings the labels onto each other and is the usual fade. Only where the labels already lie as solved for what they show, and no
  // callout, probe, scan or treatment has a layer of its own to move: those keep the fade.)
  const CARRY_ZOOM = 0.35, CARRY_PAN = 0.3;
  function carryable(from, to) {
    if (!store.get().presenting || reduceMotion.matches || !F || !solvedFor || camMove) return false;
    if (cath.st || lobuleOn || lz?.isOpen() || morph !== morphTarget || diveT > 0 || sites.list || scan.on || dpr.on || E.TIPS?.vis || E.DIPS?.vis) return false;
    const room = arcRoom();
    if (!room || Math.abs(Math.log(to.k / from.k)) > CARRY_ZOOM || Math.hypot(to.x - from.x, to.y - from.y) > room.vb.w * CARRY_PAN) return false;
    // (The zoom levels the labels' signature turns on, 1.35x and 1.3x home, are on one side of it at both ends: a label never changes
    // what it says part way through.)
    const home13 = (homeAt?.k || 1) * 1.3;
    return (from.k > 1.35) === (to.k > 1.35) && (from.k > home13) === (to.k > home13) && solvedFor.sig === labelSig(F);
  }
  // The camera's curve and its time (ease.js; combined plan M2): the quintic, with no catch half way, and a glide asked to be scaled
  // (opt.scale: a slide's framing, a fit, a camera set) takes the time its reach on screen needs, 480 to 900 ms, never longer than
  // asked.
  const camEase = easeMove;
  // Whether a glide from `from` to `to` can have its labels solved for where it lands (see landRide).
  function landable(from, to) {
    // (Not twice within 150 ms: a glide asked again and again, as refits can be, solves as it always did.)
    if (!F || inUpdate || catchUp || !solvedFor || camMove || gestureOn() || sameView(from, to) || performance.now() - landAt < 150) return false;
    if (cath.st || lobuleOn || lz?.isOpen() || morph !== morphTarget || diveT > 0 || sites.list || scan.on || dpr.on || dop.all || E.TIPS?.vis || E.DIPS?.vis) return false;
    return solvedFor.sig === labelSig(F) && solvedFor.csig === calloutSig() && solvedFor.ins === labelIns();
  }
  // The labels' slots for the framing `to`, found now (a dry solve: nothing drawn), with the view put back as it was; then laid out at
  // the view as it is, carried from those slots. False (and nothing changed) where what they show would differ there.
  const solveVT = { k: 1, x: 0, y: 0 };   // (the framing the dry solve looks at, written in place; vt is put back as it was)
  function solveLanding(to) {
    const keep = vt;
    let ok = false;
    solveVT.k = to.k; solveVT.x = to.x; solveVT.y = to.y; vt = solveVT; CTM = null; refreshCTM();
    try {
      const sig = labelSig(F);
      if (sig === solvedFor.sig && Math.abs(Math.atan2(CTM.b, CTM.a) - solvedFor.th) <= SOLVE_TURN) {
        carryClear = false; carryReslot = false;
        landAt = performance.now();
        if (layoutLabels(F, true, true)) { solvedFor = { ...solvedFor, sig, sc: CTM.sc }; ok = true; }
      }
    } finally { vt = keep; CTM = null; refreshCTM(); }
    return ok;
  }
  // opt.steady: a refit to cards that moved (a data card tucked or untucked, a turn): timed by glideClock, so a slow frame at its start
  // (the layout and label passes the same change set off) holds it back a little instead of carrying it part of the way in one step.
  const NO_OPT = {};   // (the options of a glide asked for with none: read only)
  const aimedBuf = { k: 1, x: 0, y: 0 };   // (where a framing would go, written in place; aimView reads it at once)
  function animateVT(to, ms = 700, opt = NO_OPT) {
    if (aiming) { aimedBuf.k = to.k; aimedBuf.x = to.x; aimedBuf.y = to.y; aimed = aimedBuf; return; }   // (asked only where it would go: aimView)
    landRide = false; landTo = null;
    following = false;   // (a glide or a framing set outright takes over from a card the view was following)
    cancelFrame(vtAnim);
    const prev = arcRun; arcRun = null;
    const drift = !!opt.drift && ms > 0 && !reduceMotion.matches;   // (reduced motion: a drift is the short plain glide)
    if (drifting && !drift) driftEnd();
    drifting = drift;
    vtTarget = to;
    const from = { ...vt };
    let t0 = performance.now();
    if (reduceMotion.matches) ms = Math.min(ms, 300);   // (reduced motion: a short glide, never a jump)
    else if (opt.scale && !drift && ms > 0) ms = Math.min(ms, camMs(from, to, VIEW.w));
    // Lite mode: a jump, and a move that changes the view (not a small refit) fades the figure in at its new framing.
    if (ms <= 0) {
      drifting = false;
      if (!sameView(from, to)) logMove({ t: t0, ms, restart: vtGliding, kind: 'glide', zoom: Math.abs(Math.log(to.k / from.k)), pan: Math.hypot(to.x - from.x, to.y - from.y) });
      vtGliding = false; vt = to; applyVT(); CTM = null; camSettle(); dprLet(); return;
    }
    let at = (u) => (u >= 1 ? { ...to } : lerpVT(from, to, u));
    // (Another plain glide still moving: this one carries its speed on, instead of starting over from rest. The arcs blend their own.)
    const v0 = !drift && vtVel && vtGliding && performance.now() - vtVel.t < 80 ? vtVel : null;
    vtLast = null;
    const room = opt.arc && !reduceMotion.matches ? arcRoom() : null;   // (reduced motion: no pull-back, the plain short glide)
    if (room && prev && vtGliding && performance.now() < prev.t0 + prev.ms && viewsOverlap(prev.to, to, room.vb)) {
      // A refit while an arc runs (the cards settled, the screen turned): the same arc from where it began, now to the new framing,
      // taken over gradually from here on, keeping its pace and its end time. Nothing jumps and it does not start over from rest.
      const u = camEase(clamp((performance.now() - prev.t0) / prev.ms, 0, 1));
      const path = camPath(prev.from, to, room.vb, room.wMax);
      at = blendPaths(prev.at, path.at, u, room.vb);
      t0 = prev.t0; ms = prev.ms;
      arcRun = { from: prev.from, to, t0, ms, at };
    } else if (room) {
      const path = camPath(from, to, room.vb, room.wMax);
      if (path.arc) { ms = Math.round(ms * path.stretch); at = path.at; arcRun = { from, to, t0, ms, at }; }
    }
    let c0 = 0;
    if (v0 && !arcRun && !sameView(from, to)) {
      c0 = carryRate(v0, from, to, VIEW.w) * ms;
      if (c0 > 0) at = (u, raw) => (u >= 1 ? { ...to } : lerpVT(from, to, carried(u, raw, c0)));
    }
    const carry = !drift && !arcRun && !sameView(from, to) && carryable(from, to);   // (a presenter's small move: the labels ride, see carrying)
    if (!sameView(from, to)) logMove({ t: t0, ms, restart: vtGliding, kind: drift ? 'drift' : 'glide', arc: !!arcRun, carry, zoom: Math.abs(Math.log(to.k / from.k)), pan: Math.hypot(to.x - from.x, to.y - from.y) });
    const left = Math.max(0, t0 + ms - performance.now());
    // (Not for a drift or a move on an arc: those keep their end time, which a refit that bends them reads from the wall clock.)
    const clock = opt.steady && !drift && !arcRun ? glideClock() : null;
    vtGliding = true; vtUntil = t0 + ms; vtMs = ms;
    if (carry) { drifting = carrying = true; rideLeaders(true); }
    else if (carrying) { carrying = false; rideLeaders(false); }   // (a slow push or a plain glide after one: its leaders are back)
    if (cath.st?.keep && !sameView(from, to) || store.get().presenting && !drift && !carry && !sameView(from, to)) { camMove = true; dpr.carry = dpr.on && performance.now() < dpr.refitUntil; if (!rideStart()) wrap.classList.add('cam-move'); setTimeout(camSettleIdle, left + 80); } else camSettle();
    // (A plain glide, or a presenter's small one that keeps its labels (carry): solved for its landing now, carried there; not a slow push
    // or a move on an arc, whose labels the push's own rules and the fade keep.)
    if (!drift && !arcRun && !opt.steady && !sameView(from, to) && landable(from, to) && solveLanding(to)) { landRide = true; landTo = to; labelKey = null; updateLabels(F); }
    dprLet();   // (a probe waiting for the slide's framing: a move hides it till it lands, a refit shows it now)
    // (0, 4 Nov 2026: a glide moves its camera every frame again while the figure flicker is chased; at 60 on a 120 Hz screen the figure
    // stepped every other frame beside cards and labels that moved every frame.)
    const stepGap = 0;
    let stepAt = -1e9;
    const step = (now) => {
      // A newer glide (or a framing set outright) took over: this one stops. A glide started from inside this step's
      // frame (a refit a view change set off) left two running, and the older could land last, where nobody wanted it.
      if (vtTarget !== to) return;
      // (The governor, frame.js: a glide the app runs itself moves the camera 60 times a second, not 120, camera, labels and figure together
      // (they all read this step's camera, so none is a frame ahead of another). Its time is the clock's, so nothing jumps; the landing and a hand's
      // frames are never held.)
      if (now - stepAt < stepGap && now - t0 < ms - 20 && !gestureOn()) { vtAnim = nextFrame(step); return; }
      stepAt = now;
      const raw = clamp((clock ? clock(now) : now - t0) / ms, 0, 1), u = (drift ? driftEase : camEase)(raw);
      vt = at(u, raw);
      if (!drift) {   // (the speed a glide begun now would carry on: per ms, the zoom as its logarithm)
        if (vtLast && now > vtLast.t && now - vtLast.t < 100) { const dt = now - vtLast.t, o = vtVelBuf; o.t = now; o.dlogk = Math.log(vt.k / vtLast.k) / dt; o.x = (vt.x - vtLast.x) / dt; o.y = (vt.y - vtLast.y) / dt; vtVel = o; }
        vtLast = vtLastBuf; vtLastBuf.t = now; vtLastBuf.k = vt.k; vtLastBuf.x = vt.x; vtLastBuf.y = vt.y;
      }
      applyVT(); CTM = null;
      if (rideCTM) rideStep();   // (the labels riding the move: their pictures carried on the GPU, label-gl.js)
      // With the catheter in, the vessels, the catheter and its labels follow the camera in this very frame (the labels and the
      // vessel layer after the frame's other steps: cathLabelsSoon, then animate's one render pass).
      if (cath.st) { refreshCTM(); cathLabelsSoon(); }
      if (sites.list) { refreshCTM(); sitesPaint(); }
      if (scan.on) scanPaint();
      dprobePaint();
      if (u < 1) vtAnim = nextFrame(step); else { vtGliding = false; arcRun = null; landRide = false; landTo = null; camSettle(); if (drift || carry) driftEnd(); }
    };
    vtAnim = nextFrame(step);
  }
  function zoomToBox(x0, y0, x1, y1) {
    fitted = false;
    const k = clamp(Math.min(VIEW.w / (x1 - x0), VIEW.h / (y1 - y0)) * 0.9, 1, 5);
    animateVT({ k, x: VIEW.w / 2 - ((x0 + x1) / 2) * k, y: VIEW.h / 2 - ((y0 + y1) / 2) * k }, 400);
  }
  // The presenter's camera: glide so a box of the plate (world units) fills the space the floating
  // pieces leave, as Fit does for the whole plate, zoomed in no further than kMax.
  // (clear: the box goes entirely into the band the cards leave, however thin: it may zoom out past the usual floor for it.)
  // The camera that frames a box of the plate (world units) in the space the floating pieces leave.
  // While presenting, the presenter names the free area (freeArea: the open rectangles the words, the data card where it
  // comes to rest and the controls leave), and the box is centred in whichever of them shows it largest.
  let freeArea = null, lastFree = null;
  // (boxVT's working numbers, kept: its helpers read them, so no closure is made for each call. bvPref: the rectangles that suit the box;
  // bvDefault: the one rectangle left when the presenter names none.)
  let bvX0 = 0, bvY0 = 0, bvX1 = 0, bvY1 = 0, bvS0 = 1, bvPad = 0, bvKMax = 4;
  const bvPref = [], bvRect = { l: 0, t: 0, r: 0, b: 0 }, bvDefault = [bvRect];
  function bvFitK(q) { return Math.min(Math.max(40, q.r - q.l - 2 * bvPad) / bvS0 / (bvX1 - bvX0), Math.max(40, q.b - q.t - 2 * bvPad) / bvS0 / (bvY1 - bvY0)); }
  const bvScore = (q) => Math.min(bvFitK(q), bvKMax);
  const bvArea = (q) => (q.r - q.l) * (q.b - q.t);
  function boxVT(box, kMax = 4, clear = false) {
    // (In the circuit the box is in the circuit's world units, turned a quarter turn about its centre when the map stands upright,
    // and the view box is the circuit's: the same sums, the other plate.)
    const circ = morphTarget === 1, VB = circ ? circVB() : VB_ANAT, turn = circ && rotTarget;
    const x0 = turn ? CIRC_C[0] + (box[1] - CIRC_C[1]) : box[0], y0 = turn ? CIRC_C[1] - (box[2] - CIRC_C[0]) : box[1];
    const x1 = turn ? CIRC_C[0] + (box[3] - CIRC_C[1]) : box[2], y1 = turn ? CIRC_C[1] - (box[0] - CIRC_C[0]) : box[3];
    const rw = svg.clientWidth, rh = svg.clientHeight;
    if (!rw || !rh) return null;
    bvX0 = x0; bvY0 = y0; bvX1 = x1; bvY1 = y1; bvKMax = kMax;
    const s0 = bvS0 = Math.min(rw / VB[2], rh / VB[3]);
    bvPad = clear ? 12 : 0;   // (clear: a margin for the vessels' glow)
    let rects = store.get().presenting && freeArea ? freeArea() : null;
    if (rects) {   // (between the cards, when the box fits there)
      const least = clear ? 0.3 : 0.6;
      bvPref.length = 0;
      for (let i = 0; i < rects.length; i++) if (rects[i].pref && bvFitK(rects[i]) >= least) bvPref.push(rects[i]);
      if (bvPref.length) rects = bvPref;
    }
    if (!rects?.length) { const ins = safeInsets(clear); bvRect.l = ins.l; bvRect.t = ins.t; bvRect.r = rw - ins.r; bvRect.b = rh - ins.b; rects = bvDefault; }
    // (A clearly larger fit wins; within 4% the larger rectangle does, so a near tie never flips the framing about.)
    let f = rects[0];
    for (let i = 1; i < rects.length; i++) { const q = rects[i]; if (bvScore(q) > bvScore(f) * 1.04 || (bvScore(q) >= bvScore(f) / 1.04 && bvArea(q) > bvArea(f))) f = q; }
    lastFree = { ...f, box: [x0, y0, x1, y1] };
    const k = clamp(bvFitK(f), clear ? 0.3 : 0.6, kMax);
    const cx = VB[0] + VB[2] / 2 + ((f.l + f.r) / 2 - rw / 2) / s0, cy = VB[1] + VB[3] / 2 + ((f.t + f.b) / 2 - rh / 2) / s0;
    return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
  }
  // (opt.drift: a slow push, see drifting.)
  function frameBox(box, ms = 1300, kMax = 4, clear = false, opt = {}) {
    fitted = false; handed = false;
    if (morphTarget !== 0 && morphTarget !== 1) return;   // (the anatomy or the circuit; not on the way between)
    const to = boxVT(box, kMax, clear);
    if (!to || sameView(to, vtGliding ? vtTarget : vt)) return;
    if (opt.drift) animateVT(to, ms, { drift: true }); else animateVT(to, ms, { arc: true, steady: !!opt.steady, scale: !opt.steady });   // (a drift never arcs)
  }
  // Where the way out of the lobule lands when the next slide frames somewhere other than the fit: the rise itself
  // zooms straight to that framing, so there is no stop at the fit on the way. The box is asked for when the rise
  // begins (the plate is brought up to date first, so it is measured as it will be). It expires if the lobule was not open to rise from.
  let riseBox = null, riseExp = 0, riseUsed = false;
  function riseTo(box, kMax, clear) { riseBox = box ? { box, kMax, clear } : null; riseExp = performance.now() + 4000; }
  function riseVT() {
    const r = riseBox; riseBox = null; handed = false;
    if (!r || performance.now() > riseExp) return null;
    const box = typeof r.box === 'function' ? r.box() : r.box;
    return box ? boxVT(box, r.kMax, r.clear) : null;
  }
  function vtFor(wx, wy, k) { const [cx, cy] = vbCenter(); return { k, x: cx - wx * k, y: cy - wy * k }; }
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
    if (morphTarget !== 0) store.set1('view', 'anatomic');
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
    clearTimeout(lobuleRetryT);
    if (!liverBox() || morphTarget !== 0 || morph > 0.02) { lobuleRetryT = setTimeout(lobuleRetry, tries < 40 ? 120 : 400, tries + 1); return; }
    // The anatomy's card (the liver's, usually) would sit over the lobule: the lobule's parts have their own.
    if (store.get().selection && store.get().selection.type !== 'lobule') store.set1('selection', null);
    setLobule(true);
  }
  let lobuleRetryT = 0;
  function lobuleRetry(tries) { if (store.get().lobule) openLobule(tries); }   // (the count rides on the timer: no closure carries it)
  const lobuleArrived = () => { lzWaiting = false; if (store.get().lobule) openLobule(); };
  const LOBULE_OFF_BOTH = { lobule: false, sinusoid: false }, LOBULE_OFF = { lobule: false };   // (patches the store reads and does not keep)
  const lobuleNotArrived = (err) => { lzWaiting = false; loadFailed(err); store.set(LOBULE_OFF_BOTH); };
  function closeLobule() { clearTimeout(lobuleRetryT); setLobule(false); }
  store.on('lobule', (on) => (on ? openLobule() : closeLobule()));
  const zoomLobule = () => store.set1('lobule', true);
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
  let vdpr = 1, vBase = 1, boxW = -1, boxH = -1;   // (vBase: the canvas's pixels per CSS pixel at Full)
  // Figure resolution › Auto: zoomed in past the home framing the canvas is drawn at 1/zoom of its pixels (each part of the figure
  // keeps about the pixels it had at home), in steps down to 10%. It is changed only once the view has settled and been let go,
  // so a pinch or a glide never reallocates the canvas as it moves.
  let autoK = 1, autoT = 0;
  const { autoNow, easeRes, moveGaps, noteMoveFrame, resizeCanvas, settleRes, subPixel } = createRes({ OVER_ASK, QUALITY, drawVeins, schedulePlateView: () => schedulePlateView(), stageBox, vCanvas, wrap }, live);
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

  // ── Frame state ───────────────────────────────────
  let F = null;            // latest frame
  let hoverId = null;
  // The hover link (below): the reading label under the pointer or with keyboard focus, what it lit, and the labels lifted.
  let linkPtr = null, linkKbd = null, linkEdge = null, linkOrgan = null, linkLit = new Set();

  const { collOpen, easeInOut, edgeVisible: edgeVisible$, findingHidden, recruitFrac, setViewBox: setViewBox$, shownFrac, strandAt, updateGeometry, varixHeld, vesselAt: vesselAt$ } = createFrame({ EI, EV, MAP, VB_CIRC_R, applyVT, arcLen, blendFrom, braid, gAscites, gFxC, geo, litNormals, nd, nodeVerts, pointAt, recs, rotEase, setG, stageWrap, svg, vbBox, wiggle }, live);
  function edgeVisible(...a) { return edgeVisible$(...a); }   // <stage-split stub>
  function setViewBox(...a) { return setViewBox$(...a); }   // <stage-split stub>
  function vesselAt(...a) { return vesselAt$(...a); }   // <stage-split stub>



  // ── Update from frame ─────────────────────────────
  let inUpdate = false;
  let glAtUpdate = false;   // (whether the GPU drew the figure at the last full update: the steps between take only that state)
  // The anatomy opens fitted to everything it draws, once the first frame has drawn it; a view the
  // learner has already zoomed or panned is left alone.
  // Every zoom out of the anatomy (the first frame, Fit, back from the circuit) goes to the same home
  // framing, measured from what is drawn. While the view is still at home it follows what is drawn:
  // when ascites fills the pelvis or the spleen grows, home grows with it and the view follows.
  let firstFit = false, homeAt = null, homeCheck = 0, userMoved = false;
  // A patient has arrived and none is on its way (opening one from Home, the first frames are still the last one's).
  const patientArrived = () => ((store.get().historyTick || 0) > 0 || !!store.get().booted) && !store.get().presetLoading;
  let patientReady = patientArrived();
  store.on('historyTick', () => { patientReady = patientArrived(); });
  store.on('presetLoading', () => { patientReady = patientArrived(); });
  store.on('booted', () => { patientReady = patientArrived(); firstFrame(); });
  wrap.classList.add('unframed');
  camShow = 0; camShowTo = 0; pushCam();   // (unframed: the canvas is clear until the figure is framed, then eased in as an alpha; app.css leaves the canvas out of the opacity rules)
  // The loading screen (index.html) waits for this: the figure framed, faded in and on screen.
  let figureShown = false;
  const showFigure = () => {
    if (figureShown) return;
    wrap.classList.remove('unframed');
    camShowTo_(1);
    figureShown = true;
    nextFrame(figureReady1);
  };
  const figureReady3 = () => { window.ppsFigureReady = true; performance.mark?.('pps:figure-ready'); dispatchEvent(new Event('pps:figure-ready')); };
  const figureReady2 = () => setTimeout(figureReady3, 260);
  const figureReady1 = () => nextFrame(figureReady2);
  setTimeout(showFigure, 4000);   // never left hidden
  function firstFrame() {
    if (firstFit || !F || !(morphTarget === 1 || patientReady)) return;
    firstFit = true;
    readFrame(firstFitRead);   // (the fit's boxes read first in the next frame, before any write; set in that frame's own phase)
  }
  function firstFitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    const d = morphTarget === 0 && !userMoved && !store.get().presenting ? defaultVT(false) : null;
    nextFrame(() => {
      // (Set outright, so a glide still under way (a refit as the bars came in) stops here: left running it never landed,
      // stayed 'gliding' for good, and the zoom-out spring and the pans' bounds waited on it, so a pinch out stayed stuck.)
      // (While presenting, the slide's framing is the presenter's: set outright here it jumped the figure off the slide's framing,
      // after the start's cover had lifted when the patient came late. Shown already (the 4 s backstop), the figure glides to its fit.)
      if (d && morphTarget === 0 && !userMoved && !store.get().presenting) {
        if (figureShown) { homeAt = d; fitted = true; if (!sameView(d, vtGliding ? vtTarget : vt)) animateVT(d, 450); }
        else { cancelFrame(vtAnim); driftEnd(); vtGliding = false; vt = { ...d }; homeAt = d; vtTarget = { ...d }; fitted = true; applyVT(); CTM = null; }   // (three views, not one object: see zoomAt)
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
  function prepIdleGo(fn) { if (sinceInput() < 700 || inMotion()) setTimeout(prepIdleGo, 400, fn); else if (window.requestIdleCallback) requestIdleCallback(fn, IDLE_ASK); else setTimeout(fn, 50); }
  const prepIdle = (fn) => { setTimeout(prepIdleGo, 0, fn); };
  const prepLoad = () => lobuleReady().then(prepLobule, prepLoadLost);
  const prepLoadLost = (err) => console.warn('The lobule view did not load.', err);
  const prepCalm = () => morphTarget === 0 && morph < 0.02 && !lobuleOn && !diveWait && diveT === 0 && !vtGliding;
  let prepQ = null;
  function prepRun() {
    const q = prepQ;
    if (!lobuleOn && !diveWait && diveT === 0 && morphTarget === 0 && (!prepCalm() || figureHidden())) { prepIdle(prepRun); return; }   // busy for now: later
    if (lobuleOn || diveWait || diveT > 0 || morphTarget !== 0 || !lz.prepareRun(q)) { prepBusy = false; return; }   // (diveWait: a dive's own painting is under way)
    prepIdle(prepRun);
  }
  function prepLobule() {
    if (!lz) {   // (the lobule's code comes once the figure is on screen and the page is quiet; the first dive is prepared as soon as it is built)
      if (figureShown && !lzLoad && !lzSoon) { lzSoon = true; lobuleCode().catch(lobuleNoop); prepIdle(prepLoad); if (booting()) holdCover(lobuleReady().catch(lobuleNoop)); }
      return;
    }
    const now = performance.now();
    if (prepBusy || !figureShown || now - prepAt < 1000) return;
    prepAt = now;
    if (!prepCalm() || figureHidden() || gpuOverMemory()) return;   // (the lobule's preparation ahead keeps ~130 MB; over the memory envelope it is given back, and not made again until under)
    const q = lz.preparePieces();
    if (!q.length) return;
    prepBusy = true;
    prepQ = q;
    prepIdle(prepRun);
  }
  let catchUp = false, wAt = 0, widthEasing = false;
  // (What the last full update was drawn from, and whether a coil or an organ was still easing then: see stepWidths.)
  let widthF = null, widthVer = -1, widthCTM = null, coilEasing = false, organsEasing = false, storeVer = 0;
  // A presenter's slide change holds the fit still while it runs: the words leaving or arriving change the space the camera
  // frames into, and a fit that followed them would glide the figure before the slide's own move (a dive, a rise) starts.
  let homeHeld = 0;
  function holdHome(on) { homeHeld = Math.max(0, homeHeld + (on ? 1 : -1)); }
  function update(f) {
    stageWake();
    inUpdate = true;
    try { gpuProbe.time(null, 'update (script)', updateInner, f); } finally { inUpdate = false; fxAt = null; }
    // (Hidden, no animation frame comes to draw the vessels again: they are drawn now, so the canvas never keeps colours the
    // page no longer has, as after a change of the device's light or dark setting in the background.)
    if (plateRedraw || (document.hidden && (veinsDirty || veinsRows.size))) { const by = plateRedraw ? 'plate hidden' : 'tab hidden'; plateRedraw = false; drawVeins(false, by); }
    // The first framing waits for the patient (the first frames are drawn before it has loaded, without its
    // ascites or spleen), and the figure stays hidden until it is framed, so it appears once, in place.
    firstFrame();
    if (catchUp || document.hidden) homeMay(); else mayTask('stage-home', homeMay);
  }
  // While the view is at home, home follows what is drawn and the space the cards leave: checked on the model's frames
  // (at most every 500 ms) and once a resize or a turn of the device has settled, which needs no model frame (paused, a
  // turned phone or iPad kept the old shape's framing: under the top bar, or off screen behind the Tests sheet).
  // (Not while a move away from home is under way: its first frames still sit at home. A glide on its way home is retargeted.)
  // (The look measures the organs' boxes and the cards' (a forced layout in the middle of the model's frames, about 22 ms twice
  // a second on a slowed phone): it is taken only while something it measures may have moved, see layoutWatch, and once
  // whenever the view comes back home.)
  let wasHome = false, riseFitAsk = 0;
  // (Back from the lobule: the anatomy's full fit, read first in a frame (its boxes and the cards'), and glided to in the frame's own phase.)
  function riseFitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    riseFitAsk = 0;
    if (morphTarget !== 0 || lobuleOn) return;
    const d = defaultVT(false);
    nextFrame(() => { homeAt = d; fitted = true; if (!sameView(vt, d)) animateVT(d, 450); });
  }
  function followHome(now = performance.now()) {
    if (homeResizeT) return;   // (a resize still settling: its own look comes once it has)
    const home = !!homeAt && !homeHeld && morphTarget === 0 && !lobuleOn && diveT === 0 && (sameView(vt, homeAt) || (vtGliding && sameView(vtTarget, homeAt))) && (!vtTarget || sameView(vtTarget, homeAt));
    if (home && !wasHome) watch.touch();
    wasHome = home;
    if (home && now - homeCheck > 500 && watch.due()) {
      // (Not while a slide's stacked card folds, its readings' card sliding or under the finger: measured part way, the home look glided
      // the figure to a room the card was only passing through, then the presenter's refit glided it on to where the card came to rest,
      // two moves for one tuck. The presenter frames that card's resting room as it starts to move; the look comes once it rests, when
      // its layout announces the new room, pps:occ.)
      if (store.get().presenting && document.querySelector('.pz-data[data-folding], .pz-data.pz-sliding')) return;
      homeCheck = now;
      // (1 Nov 2026: the look's boxes are read first in the next frame (readFrame), never between a frame's writes.)
      homeAsk ||= readFrame(homeLookRead);
    }
  }
  const OPT_STEADY = { steady: true };   // (a glide's options, read and never changed)
  const homeGo = (d) => { if (!sameView(d, homeAt)) { homeAt = d; fitted = true; animateVT(d, 400, OPT_STEADY); } };
  let homeAsk = 0;
  function homeLookRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    homeAsk = 0;
    if (keptNow()) return;   // (the Tests card alone has changed the space: see keepView)
    const d = defaultVT(false), at = homeAt;
    // (Moved there in the frame's own phase, after every read: and only if the view is still at the home it was looked from.)
    nextFrame(() => { if (homeAt === at && !homeHeld && (sameView(vt, homeAt) || (vtGliding && sameView(vtTarget, homeAt)))) homeGo(d); });
  }
  // (The first look when the size has held for 200 ms: a turn fires several resizes, and a glide after each moved the camera
  // two or three times. Then a look 0.5 s and 1.3 s after, and whenever a card or sheet announces a new place (pps:occ),
  // each only if the view is still at home: a sheet or a card takes its new shape a moment after the turn, and the first
  // look measured the space it left before it had. A slide is the presenter's to frame, on a resize too.)
  let homeResizeT = 0, homeLateT = [], homeOccT = 0;
  const lookHome = () => {
    if (store.get().presenting) return;
    homeCheck = 0; watch.touch(); followHome();
    // (The circuit has no home look: a framing it was given is taken again for the new shape, as the anatomy's home is. A view the
    // learner moved stays: a pinch, a drag, the wheel or a zoom step clears fitted. Not while a resize is still settling, a tool
    // has the camera, or the Tests card alone changed the space.)
    if (homeResizeT || morphTarget !== 1 || !fitted || !circFit || lobuleOn || cath.saved || !sameView(vtGliding ? vtTarget : vt, circAt)) return;
    circAgain = true;
    try { refit(); } finally { circAgain = false; }
  };
  // (The late looks run only if the stage's box is not the one the last look used: a turn whose sheet and cards settled inside the
  // first 200 ms is framed once, not at 0.2 s, 0.7 s and 1.5 s, each a glide with the labels solved again.)
  let lookedBox = '';
  const boxKey = () => { const b = stageBox(); return b ? `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)},${Math.round(b.height)}` : ''; };
  const lookHomeIfMoved = () => { if (boxKey() !== lookedBox) lookHomeKept(); };
  const lookHomeKept = () => { lookedBox = boxKey(); lookHome(); };
  const homeResizeGo = () => { homeResizeT = 0; lookHomeKept(); homeLateT[0] = setTimeout(lookHomeIfMoved, 500); homeLateT[1] = setTimeout(lookHomeIfMoved, 1300); };
  addEventListener('resize', () => {
    clearTimeout(homeResizeT); homeLateT.forEach(clearTimeout);
    homeResizeT = setTimeout(homeResizeGo, 200);
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
    easeLiver(f, p, dt);
    const asc = fluidTarget(ascTarget, f.slow.ascites);
    if (ascTarget === null) ascShown = asc;
    ascTarget = asc;
    if (ascShown !== ascTarget) ({ shown: ascShown, vel: ascVel } = fluidSpringFor(ascShown, ascVel, ascTarget, dt));
  }
  // The bands on the esophageal varices: the count drawn follows the model's whole count in a moment (band-ease.js), so the strand a
  // band closes fades out instead of vanishing in one frame. Each display frame's full update steps it (the width step stands aside
  // while it moves: stepWidths).
  let bandsShown = null;
  // A narrowing and a clot are drawn as they follow the params in a moment too (lesion-ease.js): the waist closes or opens and the clot
  // thickens, instead of either arriving whole in one frame. The same stand-aside for the width step while they move.
  const lesions = lesionEase();
  const lesionsMoving = () => !!F && lesions.differs(F.viewParams || store.get().params);
  const bandsMoving = () => bandsShown !== null && !!F && bandsShown !== (F.bands || 0);
  const stepBands = (f, dt) => { bandsShown = bandsStep(bandsShown, f.bands || 0, dt, reduceMotion.matches); return bandsShown !== (f.bands || 0); };
  // What follows from a vessel's drawn width (its hit stroke, the liver branches', braided strands' and drawn-in tributaries' widths and
  // fades, which the GPU draws): set by the model's update and by the width step between model frames (stepWidths) alike.
  function widthWrites(x, w, t, f, k) {
    const e = x.e;
    // The hit stroke is never thinner than the drawn tube (the IVC is wide, behind the liver) and never under ~10 px on screen.
    // (The thin hepatic artery has a narrow hit zone, and ranks below the portal vein it runs beside: the vein wins a shared tap.)
    { const narrow = CONTEXT_EDGES.has(e.id) || BACK_EDGES.has(e.id) || !!ART_FADE[e.id], hw = Math.round(Math.max(narrow ? 8 : 20, w + 6, 10 / ((CTM && CTM.sc) || 1))); if (x.hitW !== hw) { x.hitW = hw; pickVer++; } }
    if (x.isArt) return;
    if (x.cbr) for (const cb of x.cbr) cb.w = Math.max(1.2, w * cb.k);
    if (x.strands) for (let i = 0; i < x.strands.length; i++) {
      const sd = x.strands[i];
      sd.bead = e.id === 'C1a' ? Math.round(varixBead(f.metrics?.varix?.d) * (1 - t) * 100) / 100 : 0;   // (in hundredths: the radii are sent again only when it moves a step)
      sd.live = e.code === 'C1' ? clamp(i + 1 - (bandsShown ?? (f.bands || 0)), 0, 1) : e.id === 'C8' ? clamp(1 + 4 * clamp((recruitFrac('C8', f) - 0.15) / 0.7, 0, 1) - i, 0, 1) : 1;   // cavernoma: one strand beside the main channel when acute, the rest grow in with the remodeling
    }
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
  for (const x of EV) { const id = x.e.id; SEL_ENTRY[id] = SIN_EDGES.has(id) ? { id, col: null, amt: 1.5, wide: 1.2, dur: 450 } : { id, col: null, amt: 1.5, wide: 0.6, dur: SEL_FADE * 1000 }; }
  const varixSNow = { VAR: 0, GV: 0 }, coilingBuf = [], NO_VESSELS = [], selIdsNow = [], selIdsKept = [];   // (kept, written in place)
  // A vessel's (or feeder's) two end colours, which the GPU's vessel rows take (syncVeins reads them at once and keeps none): the pair is made
  // the first time and written in place after.
  function setColPair(o, a, b) {
    const c = o.col;
    if (!c) o.col = [a, b];
    else if (c[0] !== a || c[1] !== b) { c[0] = a; c[1] = b; }
  }
  function renderTubes(p, t, J) { for (const x of EV) if (x.vis && !x.isArt) renderTube(x, p, t, J); }
  const overlaysStep = (f, p, t) => updateOverlays(f, p, lerp(1, 0.8, t), t);   // (gain = lerp(1, 0.8, t), as updateInner has it)
  function updateInner(f) {
    // Covered by the lobule or the dive's field (anatCovered), the plate is left as it is (reading the cards' boxes and
    // restyling it each model frame, unseen, stalled the zoom); it catches up on the way out, with its eases already where they
    // have got to (followHidden). While the anatomy still shows through a dive or a rise it is updated as usual, so what eases on
    // it keeps moving through the zoom.
    const under = anatCovered() && !catchUp && !risePrep;
    // The cards' boxes, read at most every 100 ms (each read forces a layout in the middle of the model's frames);
    // a card that opens, closes or moves announces itself (pps:occ, resize) and is read at once.
    // (And only while one of them may have moved: layoutWatch.)
    // (1 Nov 2026: read first in the next frame (readFrame), never between a frame's writes; the labels are laid out again with them then.)
    if (!under && (blockersStale || (performance.now() - blockersAt > 100 && watch.due()))) blockersAsk ||= readFrame(blockersRead);
    F = f;
    holdReversals(f);
    lz?.update(f);
    if (under) { followHidden(f); return; }
    // Widths and coils ease toward their targets in time (~0.25 s), not per model update. Shown again after being covered,
    // they have eased for as long as they were covered since the patient's settings last changed.
    const nowW = performance.now();
    let dtW = Math.min(0.1, (nowW - (wAt || nowW)) / 1000);
    if (hid.at) { followHidden(f); dtW = (nowW - Math.max(wAt, hid.pAt)) / 1000; fxAt = Math.max(hid.since, hid.pAt); plateStale = true; hid.at = 0; hid.p = null; hid.pAt = 0; }
    const kW = -Math.expm1(-dtW / 0.25);
    wAt = nowW; widthEasing = false; coilEasing = false; organsEasing = false;
    if (stepBands(f, dtW)) widthEasing = true;
    glAtUpdate = wrap.classList.contains('gl-on');
    const st = store.get();
    const pRaw = f.viewParams || st.params, p = lesions.view(pRaw, dtW, reduceMotion.matches);
    if (lesions.differs(pRaw)) widthEasing = true;
    const t = easeInOut(morph);
    const ref = REF();
    // The circuit shown small (a phone, the whole map): every lane grows by the same factor, so the
    // widest stays about 10 px on screen; capped so neighbouring lanes stay apart.
    if (!CTM) refreshCTM();
    const circBoost = clamp(10 / (15 * (CTM?.sc || 1)), 1, 1.75);
    const imaging = isImaging();
    const mode = layerMode();
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
    for (const x of easeHeld ? NO_VESSELS : EV) {
      if (x.e.kind !== 'collateral' || x.e.spontaneous || STRAIGHT_COLL.has(x.e.id)) continue;
      // (Coiled once it has grown past a quarter, and straight again only below a fifth: a varix channel whose growth sat at the quarter
      // flipped its target between straight and coiled 25 times in one Varices slide change, each a new ease of its coil and a binning,
      // 3 Nov. ?coilhold=0: one threshold, as before.)
      const g = geo[x.e.id], sf = shownFrac(x.e.id, f), coiled = g.wigT > 0 ? sf > 0.2 : sf > 0.25;
      const w = coiled ? 1.5 + 3.5 * sf : 0;
      // Eased toward its target (a change of over 0.6 starts it), so the vessel coils gradually.
      if (g.wigT == null || Math.abs(w - g.wigT) > 0.6) g.wigT = w;
      if (g.wig !== g.wigT) { const d = g.wigT - g.wig; g.wig = Math.abs(d) < 0.03 ? g.wigT : g.wig + d * kW; coiling.push(x); if (g.wig !== g.wigT) widthEasing = coilEasing = true; }
      // The varices' strands fan out less as their varix shrinks, eased the same way (a closed shunt keeps its full spread).
      if (x.strands && LOOK_SITE[x.e.id]) {
        const sprT = isOccluded(p, x.e.id) ? 1 : varixSpreadK(varixS[LOOK_SITE[x.e.id]]), spr = g.spr ?? 1;
        g.sprT = sprT;   // (binTube: while the spread eases, the strands are binned against where they began, as a coil is)
        if (spr !== sprT) { const d = sprT - spr; g.spr = Math.abs(d) < 0.005 ? sprT : spr + d * kW; if (!coiling.includes(x)) coiling.push(x); if (g.spr !== sprT) widthEasing = coilEasing = true; }
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
      else if (!vis && x.vis && wasDrawn && canFade(x) && !x.reveal && !x.ghost && !quietFx()) { startExit(x, f); vis = true; }
      if (vis !== x.vis) { x.vis = vis; edgeRev++; }
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
      // Anatomy: width follows diameter (compressed). Circuit: a narrower, more uniform range,
      // as on a transit map, so the lines stay even and legible.
      const wA = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' || e.zone === 'post' ? 3.6 : 5.2) : vesselPx(IVC_EDGES.has(e.id) ? f.D[EI.IVC_IS] : D) * (IVC_EDGES.has(e.id) || e.id === 'SVC_RA' || e.id === 'V_UP' ? 0.72 : 1);   // the IVC is one tube: one caliber end to end (and the veins above the SVC take its scale, so the SVC widens below the azygos, never narrows: at full scale they bulged it at the join)
      const wC = (e.kind === 'liver' ? 8 : clamp(vesselPx(D) * 0.95, 6, 15)) * circBoost;
      let w = lerp(wA, wC, t);
      // (Both ends of the change kept, for the stretches' joins: a vessel's width between the views, widthRatio. Under the flow layer the width ignores the view.)
      x.wAn = x.isArt ? Math.max(1.8, vesselPx(D) * 0.5) : mode === 'flow' ? 1 : wA; x.wCi = x.isArt ? 3 : mode === 'flow' ? 1 : wC;
      // Flow layer: width follows flow volume (∝ √Q), like traffic volume on a city map.
      if (mode === 'flow' && !x.isArt) w = clamp(2.2 + 8.5 * Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06), 2.2, 22);
      if (x.isArt) w = lerp(Math.max(1.8, vesselPx(D) * 0.5), 3, t);
      // Band ligation strangles the esophageal varices: each band thromboses a channel and the
      // rest shrink (the model raises the route's resistance by the same count).
      if (e.code === 'C1' && f.bands > 0 && t < 1) w *= 1 - 0.14 * Math.min(4, f.bands);
      // The periportal collaterals (cavernoma) are fine channels, thinner than the caliber their flow alone would draw.
      if (e.id === 'C8') w *= lerp(0.6, 1, t);
      // The spontaneous splenorenal shunt never reads fatter than the splenic vein it leaves.
      if (e.id === 'C6' && mode !== 'flow' && EI.V_SPL != null) w = Math.min(w, lerp(vesselPx(f.D[EI.V_SPL]), clamp(vesselPx(f.D[EI.V_SPL]) * 0.95, 6, 15) * circBoost, t));
      // The varices' channels are drawn as big as the varix is now, not as the weeks of remodeling left them (varix-look.js), never under
      // their resting caliber: in the anatomy only, as the bands' shrink above; the flow lens keeps its flow widths and a closed shunt its ghost.
      if (LOOK_SITE[e.id] && mode !== 'flow' && !isOccluded(p, e.id)) w = Math.max(Math.min(w, vesselPx(dMinOf(e))), w * lerp(varixWidthK(varixS[LOOK_SITE[e.id]]), 1, t));
      // The caudate vein hypertrophies when it becomes the liver's outflow (Budd–Chiari).
      if (e.id === 'CAUD' && t < 1) { const ref = store.get().healthy?.Q?.[k]; if (ref) w *= 0.8 * clamp(Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) / Math.abs(ref)), 1, 1.8); }
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
      if (widthMoving(x)) widthEasing = true;
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
      else if (mode === 'direction') { const rev = reversedShown(e); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
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
        if (!openNow && wasDrawn && !x.ghost && !x.reveal && !quietFx()) startExit(x, f);
        if (x.ghost !== (!openNow && !x.reveal?.out)) edgeRev++;
        x.ghost = !openNow && !x.reveal?.out;
        x.opa = isOccluded(p, e.id) ? 0.45 : Math.min(0.3 + 0.7 * Math.min(1, Math.max(fr * 2.5, qa / 1.5)), LOOK_SITE[e.id] ? varixOpacity(varixS[LOOK_SITE[e.id]]) : 1);   // (the varices' channels fade with their varix)
        setLevel(x, nearestLevel(x.opa));
      }
      x.rev = REVERSAL_WATCH.has(e.id) && reversedShown(e);
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
        if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
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
    updateOrganSel(st.selection, t);
    gpuProbe.time(null, 'update: nodes', updateNodesCircuit, f);
    gpuProbe.time(null, 'update: overlays', overlaysStep, f, p, t);
    updateFocus();
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
    orgAskBuf.f = f; orgAskBuf.p = p; orgAskBuf.t = t; orgAskBuf.at = fxAt; orgAsk = orgAskBuf;
    if (catchUp || document.hidden) organsMay(); else mayTask('stage-organs', organsMay);
    widthF = f; widthVer = storeVer; widthCTM = CTM;
  }

  // A vessel's drawn width follows the model's through two exponential eases in series (tau 0.2 s each: critically damped).
  // Each step is the exact solution for the time elapsed (the lag behind the target decays as (e2 + e1 t/tau) e^(-t/tau)),
  // and a new target is taken only after stepping up to its arrival, so the width and its speed change continuously and
  // trace the same curve at 60 or 120 Hz; a model frame's new target (10 a second) bends the speed instead of jumping it.
  const W_TAU = 0.2;
  let labelF = null;
  function labelsMay() {
    const f = labelF; labelF = null;
    if (f && !(diveT > 0 && diveT < 1)) gpuProbe.time(null, 'update: labels', updateLabels, f);
  }
  let orgAsk = null;
  const orgAskBuf = { f: null, p: null, t: 0, at: null };   // (what the organs' step was asked for, written in place; organsMay copies it out at once)
  function organsMay() {
    const a = orgAsk; orgAsk = null;
    if (!a || (anatCovered() && !catchUp && !risePrep)) return;
    const af = a.f, ap = a.p, at = a.t, atAt = a.at;
    const was = inUpdate, wasAt = fxAt;
    inUpdate = true; fxAt = atAt;
    try {
      gpuProbe.time(null, 'update: organs', updateOrgans, af, ap, at);
      gpuProbe.time(null, 'update: slide marks', fxSync, af, at);
    } finally { inUpdate = was; fxAt = wasAt; }
    if (!was && plateRedraw) { plateRedraw = false; drawVeins(false, 'plate hidden'); }
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
  function edgeQ() { const cpx = CTM ? vdpr * Math.hypot(CTM.a, CTM.b) : 0; return cpx > 0 ? EDGE_STEP / cpx : 0.01; }
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
    if (glowSync || plateEasing() || !glowOnlyOk(t)) return false;
    const m = glowMemo, items = m.items;
    for (let i = 0; i < items.length; i++) if ((items[i].x.width >= 3.4) !== m.wide[i]) return false;
    sendRadii(items);
    for (const it of items) if (Math.ceil((it.obj.glMaxR + (it.x.wallPx || 1) + 18) / 2) * 2 > (vBinReach.get(it.row) || 0)) return false;
    // (A ligated vein's divided stretch is as long as the vein is wide (divideLen): its drawn start, tube texel 5, follows the width.)
    let lig = false;
    for (const it of items) {
      if (it.kind !== 'v') continue;
      let ligated = false;
      for (let j = 0; j < LIGATED.length; j++) if (LIGATED[j][1] === it.x.e.id) { ligated = true; break; }
      if (!ligated) continue;
      const o = it.row * TUBE_TEXELS * 4 + 20, lo = Math.fround(Math.max(0, divideLen(it.x.e.id) / (it.len || geo[it.x.e.id].len || 1)));
      if (tubeData[o] !== lo) { tubeData[o] = lo; tubesShown[o] = lo; veinsRows.add(it.row); lig = true; }
    }
    if (lig) veins.setTubes(tubeData);
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
    const f = F;
    if (!f || f !== widthF || storeVer !== widthVer || !widthCTM || coilEasing || organsEasing || catchUp || bandsMoving() || lesionsMoving()) return false;
    if (anatCovered() || hid.at || plateStale || plateRedraw || blockersStale || (performance.now() - blockersAt > 100 && watch.due())) return false;
    if (ascShown !== ascTarget || morph !== morphTarget || glAtUpdate !== wrap.classList.contains('gl-on') || anyReveal()) return false;
    if (!CTM) refreshCTM();   // (as the update itself does before it reads the view: a glide's step this frame let it go)
    if (CTM !== widthCTM && (CTM.sc !== widthCTM.sc || CTM.a !== widthCTM.a || CTM.b !== widthCTM.b)) return false;
    stageWake();
    inUpdate = true;
    try { gpuProbe.time(null, 'width step (script)', stepWidthsInner, f); } finally { inUpdate = false; fxAt = null; }
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
    const f = F;
    // (A pan moves no drawn size, and the view's own frame lays the labels out again (syncView): it takes this step too. A zoom or a
    // turn changes the sizes kept in screen pixels, and takes the full update.)
    if (!organsEasing || !f || f !== widthF || storeVer !== widthVer || !CTM || !widthCTM || CTM.sc !== widthCTM.sc || CTM.a !== widthCTM.a || CTM.b !== widthCTM.b || coilEasing || catchUp) return false;
    if (anatCovered() || hid.at || plateStale || blockersStale || (performance.now() - blockersAt > 100 && watch.due())) return false;
    if (morph !== morphTarget || glAtUpdate !== wrap.classList.contains('gl-on') || bandsMoving() || lesionsMoving() || anyReveal() || visWidthMoving()) return false;
    stageWake();
    inUpdate = true;
    try {
      gpuProbe.time(null, 'organ step (script)', organStepBody, f);
    } finally { inUpdate = false; fxAt = null; }
    if (plateRedraw) { plateRedraw = false; drawVeins(false, 'plate hidden'); }
    firstFrame();
    prepLobule();
    followHome();
    return true;
  }
  function organStepBody(f) {
    const t = easeInOut(morph);
    widthEasing = organsEasing = false;
    updateOrgans(f, f.viewParams || store.get().params, t);
    // (What the width step lays out every frame, it does here too: the site labels, a scan, a slide's moving camera, TIPS or DIPS.)
    if ((sites.list || scan.on || camMove || E.TIPS?.vis || E.DIPS?.vis) && !(diveT > 0 && diveT < 1)) updateLabels(f);
    if (fx) fxSync(f, t);
  }
  function stepWidthsInner(f) {
    const nowW = performance.now(), dt = Math.min(0.1, (nowW - (wAt || nowW)) / 1000);
    wAt = nowW; widthEasing = false;
    lvAt = nowW;   // (the liver's ease clock: a full update after width steps eases from this frame, not from the last full update)
    const t = easeInOut(morph);
    let moved = false, labels = !!sites.list || scan.on || !!camMove || !!E.TIPS?.vis || !!E.DIPS?.vis;
    for (const x of EV) {
      if (!x.vis || !followWidth(x, dt)) continue;
      if (widthMoving(x)) widthEasing = true;
      if (sigWidthMoved(x)) edgeRev++;   // (the labels' signature reads widths in 2 px steps: R04)
      moved = true;
      const w = x.width;
      widthWrites(x, w, t, f, EI[x.e.id]);
      if (x.isArt) continue;
      x.dopW = w;
      if (!labels) { const sw = sigW.get(x.e.id); labels = sw == null || Math.abs(w - sw) >= 2; }
    }
    if (!moved) return;
    const J = junctionWidths();
    const p = lesions.view(f.viewParams || store.get().params);
    for (const x of EV) if (x.vis && !x.isArt) renderTube(x, p, t, J);
    if (syncRadiiOnly(t)) gpuProbe.note(COUNTED.widthRadii);
    else { gpuProbe.note(COUNTED.widthWhole); syncVeins(t); }
    updateOverlays(f, p, lerp(1, 0.8, t), t);
    if (labels && !(diveT > 0 && diveT < 1)) updateLabels(f);
    if (fx) fxSync(f, t);
  }

  // Each vein is a tube whose radius eases from its own caliber (and narrows at a stenosis), drawn by the GPU from rOf with the
  // shading of a lit cylinder (veins-gl.js). The circuit, closed collaterals and vessels being drawn on are plain strokes.
  // Recomputed only when a width, a lesion or the geometry changes.
  const smooth = (u) => u * u * (3 - 2 * u);
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
    const a = x.rA, w = x.rW, b = x.rB, h0 = x.rH0, h1 = x.rH1, f = x.stenF, L = x.rL;
    const r = u < 0.3 ? lerp(a, w, smooth(u / 0.3)) : u > 0.7 ? lerp(w, b, smooth((u - 0.7) / 0.3)) : w;
    const side = (h0 ? sideEndScale(u * L, h0) : 1) * (h1 ? sideEndScale((1 - u) * L, h1) : 1);
    return Math.max(0.35, (r / 2) * (f ? f(u) : 1) * side);
  }
  // The tube's N_SAMPLES radii in one loop (tubeRadius at each sample, the same arithmetic); with `ra` the cava drawn as one: the first
  // share f of the samples along x, the rest along ra. Nothing is handed back from a call, so no number is boxed per sample.
  function tubeFill(x, ra, f, R) {
    for (let i = 0; i < N_SAMPLES; i++) {
      const u = i / (N_SAMPLES - 1);
      let v = u, q = x;
      if (ra) { if (u < f) v = u / f; else { v = (u - f) / (1 - f); q = ra; } }
      const a = q.rA, w = q.rW, b = q.rB, h0 = q.rH0, h1 = q.rH1, fn = q.stenF, L = q.rL;
      const r = v < 0.3 ? lerp(a, w, smooth(v / 0.3)) : v > 0.7 ? lerp(w, b, smooth((v - 0.7) / 0.3)) : w;
      const side = (h0 ? sideEndScale(v * L, h0) : 1) * (h1 ? sideEndScale((1 - v) * L, h1) : 1);
      R[i] = Math.max(0.35, (r / 2) * (fn ? fn(v) : 1) * side);
    }
  }
  function renderTube(x, p, t, J) {
    const g = geo[x.e.id], id = x.e.id, w = x.width, wallPx = x.wallPx;
    const v = isImaging() ? 0 : p.stenosis[id] || 0;
    const sten = v > 0.01;
    const stroked = x.ghost || !!x.reveal || (t >= 0.5 && !sten);
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
    const wallQ = Math.round(wallPx * 100), vQ = sten ? Math.round(v * 1000) : -1, atQ = sten ? stenosisAt(id, p) : 0;
    const same = x.skKw === x.kw && x.skKa === x.ka && x.skKb === x.kb && x.skH0 === x.kh0 && x.skH1 === x.kh1 && x.skWall === wallQ && x.skV === vQ && x.skAt === atQ && x.skMorph === lastMorph && x.skStroked === stroked;
    if (same && x.shadeOk) return;
    x.shadeOk = true;
    if (!same) {
      x.skKw = x.kw; x.skKa = x.ka; x.skKb = x.kb; x.skH0 = x.kh0; x.skH1 = x.kh1; x.skWall = wallQ; x.skV = vQ; x.skAt = atQ; x.skMorph = lastMorph; x.skStroked = stroked;
      x.shadeVer = (x.shadeVer | 0) + 1;
    }
    const f = sten ? waist(id, v, g.len, w, p) : null;
    x.stenF = f;   // (its caliber factor along it: the GPU's colour follows the resistance it adds, sendRadii alongOf)
    x.rA = a; x.rW = w; x.rB = b; x.rH0 = x.kh0; x.rH1 = x.kh1; x.rL = g.len || 1;
    // (Kept as the function the radii are read through; it reads the numbers above, which this call has just set.)
    if (!x.rOf) x.rOf = (u) => tubeRadius(x, u);   // alloc-once: the vessel's first draw
  }

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
    if (l >= 1) return x.back ? TIER_BACK : x.front ? TIER_FRONT : TIER_NET;
    return (x.back ? TIER_BACK0 : TIER_MID0) + Math.max(0, LEVELS.indexOf(l));
  };
  // Rows of the per-vessel textures: the model's vessels, then every strand, tributary and liver branch.
  {
    for (const [id, list] of Object.entries(treeGeo)) if (E[id]) E[id].cbr = list.map(({ pts, k }) => ({ cur: pts, k, w: 0 }));
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

  // ── The change between the views on the GPU (2 Nov 2026, his iPhone: "going from anatomy to circuit is so laggy") ──
  // Each frame of the change had binned every vessel again on the CPU and sent the 4 MB list up. Now the change is cut into stretches
  // (MORPH_PIECES), and each stretch's binning, listing everything that can draw in a cell anywhere along it (veins-sweep.js), is made
  // ahead while the figure rests, in a worker (sweep-worker.js), from the vessels' courses at a few moments of it (vesselAt and the
  // rest of what glItems gives, as they will be), and put on the GPU in a set of its own. A frame of the change then sends only its
  // vessels' points and joins, a few rows (morphFrame); the vessels are drawn from them exactly as from a binning of their own. A frame
  // whose vessels do not fit the stretch made for it (another vessel showing, one wider than it was binned for, a course off its samples
  // by more than MORPH_SLACK) is binned as before. (Without Worker, as in a test page, every frame is binned.)
  const MORPH_GPU = typeof Worker !== 'undefined';
  const MORPH_PIECES = [[0, 1 / 6], [1 / 6, 1 / 3], [1 / 3, 0.5], [0.5, 2 / 3], [2 / 3, 5 / 6], [5 / 6, 1]];
  const MORPH_NEAR = 10;   // (and a pair's every contact, veinJoins)
  const MORPH_STEPS = 12, MORPH_SLACK = 6, MORPH_JSLACK = 30, MORPH_JSUB = 3;
  const mt = { key: '', pieces: null, using: null, gen: 0, checkT: 0, reach: [null, null], landAt: 0, stats: { gpu: 0, cpu: 0, builds: 0, miss: {} } };
  const morphMiss = (why) => { mt.stats.miss[why] = (mt.stats.miss[why] || 0) + 1; return false; };
  function morphOff() {
    if (!mt.using) return;
    mt.using = null;
    veins?.useMorphSet(null);
    binShown = null; bendShown = null;
  }
  function morphDrop() {
    morphOff();
    for (const pc of mt.pieces || []) if (pc.set) pc.set.owner.dropMorphSet(pc.set);
    mt.pieces = null; mt.key = ''; mt.gen++;
  }
  // Whether a vessel shows on the anatomy's side of the change (anat) or the circuit's (edgeVisible, asked as if the change were there).
  function visAt(x, anat) {
    if (!F) return false;
    const m = morph;
    morph = anat ? 0.25 : 0.75;
    try { return edgeVisible(x, F); } finally { morph = m; }
  }
  // What the vessels would be at t (eased) of the change, on its anatomy (anat) or circuit side: glItems' list, from vesselAt. `both`:
  // the vessels either side shows (one leaving draws itself out as it goes, one arriving draws in: either can be on in a frame of the
  // change), as the stretches are binned; else the side's own.
  function itemsAt(t, anat, both = true) {
    const items = [];
    for (const x of EV) {
      const vis = visAt(x, anat) || (both && visAt(x, !anat));
      // (A vessel not drawn yet has no radius function (rOf) until its first draw: it is binned all the same, see joinsOf.)
      if (!vis || !geo[x.e.id]?.cur) continue;
      const v = vesselAt(x, t);
      items.push({ x, obj: x, row: x.row, pts: v.pts, kind: 'v' });
      if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) items.push({ x, obj: cb, row: cb.row, pts: cb.cur, kind: 'c' });
      if (!anat || x.isArt || x.ghost) continue;
      for (const sd of x.strands || []) if (sd.cur && (sd.live ?? 1) > 0.02) items.push({ x, obj: sd, row: sd.row, pts: strandAt(x, sd, t, v), kind: 's' });
      for (const fd of x.feeders || []) if ((fd.live ?? 1) > 0.02 && fd.w) items.push({ x, obj: fd, row: fd.row, pts: fd.cur, kind: 'f' });
    }
    return cavaAsOne(items, lenOfArc);
  }
  // Joins and smoothed courses of a list (veinJoins, smoothRunOn), leaving the figure's own (glStraight, glRadDirty) as they were. A
  // vessel not drawn yet (the other side's: the circuit's branches, a vessel the anatomy leaves out) is given its radii as they would
  // be sent (itemRadii) for the while. Given a store (a frame of a morph: FR_STORES), the answer is written into it and is read before the
  // next call that is given the same store; without one it is made new, for the stretches that keep it.
  const LENT = [];   // alloc-rare: kept, made once for the stage
  function lendRadii(items) {
    let nLent = 0;
    for (let q = 0; q < items.length; q++) {
      const it = items[q], o = it.obj;
      if (o.glR) continue;
      // alloc-rare: only a vessel whose radii were not sent yet (the other side's, one the view leaves out) is lent them, here and in itemRadii
      const R = o.glRL || (o.glRL = new Float64Array(N_SAMPLES)), rc = it.kind === 'v' && !it.x.isArt && !it.x.rOf ? Math.max(0.5, (it.x.width || 2) / 2) : -1, rf = rc < 0 ? itemRadii(it)[1] : null;
      let mx = 0;
      for (let i = 0; i < N_SAMPLES; i++) { const r = rf ? rf(i) : rc; R[i] = r; mx = Math.max(mx, r); }
      o.glR = R; o.glMaxR = mx; LENT[nLent++] = o;
    }
    return nLent;
  }
  function takeBackRadii(nLent) {
    for (let q = 0; q < nLent; q++) { LENT[q].glR = undefined; LENT[q].glMaxR = undefined; LENT[q] = null; }
  }
  // (Run for each frame of a morph: the answer is written into the store it is given, FR_STORES' one for the frame, and read before the next call given it.)
  function joinsOf(items, st) {
    const gs = glStraight, gd = glRadDirty, gst = glStore, nLent = lendRadii(items);
    try {
      const J = veinJoins(items, st), smooth = smoothRunOn(items, st);
      st.res.J = J; st.res.smooth = smooth;
      return st.res;
    } finally { glStraight = gs; glRadDirty = gd; glStore = gst; takeBackRadii(nLent); }
  }
  // The same, made new for a stretch that keeps it (the change between the views, an ease), with the reach of each vessel by row.
  function joinsKept(items) {
    const gs = glStraight, gd = glRadDirty, gst = glStore, nLent = lendRadii(items);
    try {
      const st = newJoinStore(), J = veinJoins(items, st), smooth = smoothRunOn(items, st);
      return { J, smooth, reach: new Map(items.map((it) => [it.row, reachOf(it)])) };
    } finally { glStraight = gs; glRadDirty = gd; glStore = gst; takeBackRadii(nLent); }
  }
  // How wide a vessel is at t of the change between the views against how wide it is at rest in the view it is in (1 where unknown): the
  // joins of a stretch are found at the widths the frames will have, not the landed view's (an end lies on another vessel's course within
  // their radii, so at the widths between, joins come that the landed widths never had, and a frame with one fell back to binning on the CPU).
  function widthRatio(x, t) {
    const a = x.wAn, c = x.wCi;
    if (!(a > 0) || !(c > 0)) return 1;
    return lerp(a, c, t) / (morphTarget === 1 ? c : a);
  }
  // The same for a stretch of the change between the views, at t: the radii are scaled to that moment's widths (widthRatio), and the joins also
  // hold the contacts just past the limit of an end meeting a course (MORPH_NEAR) and a pair's every contact: a frame's courses are within the
  // slack of the stretch's, so a join at the limit is there in some frames and in no moment of the stretch, and which contact of a pair comes
  // first depends on the widths. Those a frame does not have are written as reaching nothing. (Made ahead, between frames, never in one.)
  function joinsAhead(items, t) {
    // alloc-rare: made ahead of the change, in a task between frames (the stretches' build), never in a frame
    const gs = glStraight, gd = glRadDirty, gst = glStore, nLent = lendRadii(items), saved = [];
    try {
      for (const it of items) {
        const o = it.obj, k = widthRatio(it.x, t);
        saved.push(o, o.glR, o.glMaxR);
        o.glR = o.glR.map((r) => r * k); o.glMaxR *= k;
      }
      try {
        // (The joins within the limit are made last, so the run-on state left is theirs.)
        const wide = veinJoins(items, newJoinStore(), MORPH_NEAR), st = newJoinStore(), J = veinJoins(items, st).slice(), have = J.slice();
        for (const j of wide) if (!have.some((h) => h.key === j.key && (h.x - j.x) ** 2 + (h.y - j.y) ** 2 < 1600)) J.push(j);
        return { J, smooth: smoothRunOn(items, st), reach: new Map(items.map((it) => [it.row, reachOf(it)])) };
      } finally {
        for (let i = 0; i < saved.length; i += 3) { saved[i].glR = saved[i + 1]; saved[i].glMaxR = saved[i + 2]; }
      }
    } finally { glStraight = gs; glRadDirty = gd; glStore = gst; takeBackRadii(nLent); }
  }
  // A join by what it joins: its members, the trunk they end on, a fork.
  const joinKey = (j) => j.key;   // (a join the joins pass made carries its key)
  const rowKey = (items) => items.map((it) => it.row).join(',');
  // What the stretches are made from, so they are made again when it changes (the vessels shown, their reach, a collateral's coil and a
  // varix's spread, the joins that run on): checked a moment after the figure last binned at rest.
  function morphTrackKey() {
    return [rowKey(itemsAt(0, true)), rowKey(itemsAt(1, false)), EV.map((x) => { const g = geo[x.e.id]; return `${(g.wig || 0).toFixed(1)}/${(g.spr ?? 1).toFixed(2)}`; }).join(','),
      EV.map((x) => (x.strands || []).map((sd) => +((sd.live ?? 1) > 0.02)).join('')).join('')].join('|');
  }
  function morphTrackSoon() {
    if (!MORPH_GPU || mt.checkT) return;
    mt.checkT = setTimeout(morphTrackCheck, 400);
  }
  function morphTrackCheck() {
    mt.checkT = 0;
    if (!veins || veins.lost || morph !== morphTarget || !wrap.classList.contains('gl-on') || lobuleOn) return;
    if (inMotion()) { morphTrackSoon(); return; }
    const key = morphTrackKey();
    if (key === mt.key && mt.pieces && mt.pieces.every((pc) => !pc.set || pc.set.owner === veins)) return;
    mt.stats.builds++;
    // (The stretches made before stay on until each new one is up: a frame of the change still checks its courses against the one it
    // draws from. Those of a figure since replaced are of no use.)
    if (mt.pieces?.some((pc) => pc.set && pc.set.owner !== veins)) morphDrop();
    mt.gen++; mt.key = key;
    morphTrackBuild(mt.gen);
  }
  // The stretches, one at a time, each in its own task: its moments (itemsAt, joinsOf) here, its binning in the worker, its upload here.
  function morphTrackBuild(gen) {
    const blank = () => MORPH_PIECES.map(([t0, t1]) => ({ t0, t1, anat: t0 < 0.5, set: null }));
    const pieces = blank();
    mt.pieces ||= blank();
    let k = 0, held = 0;
    // A stretch made takes the place of the one before it.
    const put = (pc) => {
      const old = mt.pieces[k];
      mt.pieces[k] = pc;
      if (old?.set) { if (mt.using === old.set) morphOff(); old.set.owner.dropMorphSet(old.set); }
      k++; held = 0;
    };
    const next = () => {
      if (gen !== mt.gen || k >= pieces.length) return;
      // (Not while the figure moves at rest, for a while: a moment is a pass over every vessel.)
      // (A move holds it for as long as the move lasts, however long: beginMotion ends one itself after MOTION_MAX_MS. Only the person's
      // own input is capped, at twelve looks.)
      { const moving = inMotion(); if ((moving || (sinceInput() < 700 && held < 12)) && morph === morphTarget) { held++; setTimeout(next, 120); return; } }
      const pc = pieces[k];
      const ts = Array.from({ length: MORPH_STEPS + 1 }, (_, i) => pc.t0 + (pc.t1 - pc.t0) * i / MORPH_STEPS);
      if (pc.t1 === 0.5) ts[MORPH_STEPS] = 0.5 - 1e-6;   // (the anatomy's side ends just short of the half, where the circuit's vessels take over)
      // (One pass over the joins a task: each is a pass over every vessel and its joins. A moment's passes in one task were a long
      // task each, start-up profile 2 Nov 2026.)
      pc.snaps ||= [];
      // (The joins of the side's own vessels too: a vessel binned for the other side changes the joins it takes part in.)
      if (pc.snaps.length < ts.length) {
        const t = ts[pc.snaps.length], w = pc.work ||= { items: itemsAt(t, pc.anat), own: itemsAt(t, pc.anat, false), o: null, all: null, q: 1, J2: [] };
        if (!w.o) { w.o = joinsAhead(w.own, t); setTimeout(next, 0); return; }
        if (!w.all) { w.all = joinsAhead(w.items, t); setTimeout(next, 0); return; }
        // (The joins at moments between too: one can be there for less than a step, as two ends pass each other.)
        if (pc.snaps.length && w.q < MORPH_JSUB) { const u = lerp(pc.snaps[pc.snaps.length - 1].t, t, w.q / MORPH_JSUB); w.J2.push(...joinsAhead(itemsAt(u, pc.anat, false), u).J); w.q++; setTimeout(next, 0); return; }
        pc.work = null;
        const { items, own, o } = w;
        pc.snaps.push({ t, items, ...w.all, J2: o.J.concat(w.J2), own: new Map(own.map((it) => [it.row, o.smooth.get(it.row) || it.pts])) });
        setTimeout(next, 0); return;
      }
      const snaps = pc.snaps;
      pc.snaps = null;
      const rows = rowKey(snaps[0].items);
      if (snaps.some((sn) => rowKey(sn.items) !== rows)) { pc.bad = 'vessels'; put(pc); setTimeout(next, 0); return; }
      const side = pc.anat ? 0 : 1;
      pc.ts = ts; pc.rows = rows;
      sweepPiece(pc, snaps, mt.reach[side]).then((b) => {
        if (gen !== mt.gen || !b || !veins || veins.lost) return;
        setOf(pc, b);
        put(pc);
        setTimeout(next, 0);
      }, (e) => { if (gen !== mt.gen) return; pc.bad = String(e); put(pc); setTimeout(next, 0); });
    };
    setTimeout(next, 0);
  }
  // A stretch's courses, joins and reach from its moments (snaps), and its binning made in the worker: the change between the views
  // (morphTrackBuild) and a coil or a varix's spread easing at rest (envCheck). `more`: reach a vessel had elsewhere, kept.
  function sweepPiece(pc, snaps, more) {
    pc.reach = new Map(snaps[0].items.map((it) => [it.row, Math.ceil(Math.max(vBinReach.get(it.row) || 0, more?.get(it.row) || 0, ...snaps.map((sn) => sn.reach.get(it.row) || 0)) * 1.25 / 2) * 2]));
    // (A course as the side's own vessels smooth it where it is one of them: the vessels only the other side shows change which ends run on.)
    pc.path = new Map(snaps[0].items.map((it) => [it.row, snaps.map((sn) => sn.own.get(it.row) || sn.smooth.get(it.row) || sn.items.find((o) => o.row === it.row).pts)]));
    pc.pathRows = Array.from(pc.path.keys());   // (the rows of the stretch, listed once for the frames that draw from it)
    // (The joins come and go as the vessels' ends move (veinJoins finds them by where the ends lie): every join of any moment, each
    // binned along its centres at the moments it is there; a frame lists the ones it has, the rest written as reaching nothing.)
    // (Joins of the same vessels at two places, a strand's two ends on its varix, are told apart by where they lie.)
    const U = [], byKey = new Map();
    for (const sn of snaps) sn.J.concat(sn.J2).forEach((j) => {
      const k = joinKey(j), list = byKey.get(k) || [];
      byKey.set(k, list);
      let u = null, best = 40 * 40;
      for (const v of list) { const q = v.path[v.path.length - 1], d = (q[0] - j.x) ** 2 + (q[1] - j.y) ** 2; if (d < best) { best = d; u = v; } }
      if (!u) { u = { path: [], reach: 0, j, i: U.length }; U.push(u); list.push(u); }
      u.path.push([j.x, j.y]); u.reach = Math.max(u.reach, j.reach);
    });
    pc.jby = new Map([...byKey].map(([k, list]) => [k, list.map((u) => u.i)]));
    pc.jof = U.map((u) => u.j);
    pc.jpath = U.map((u) => u.path);
    pc.jreach = U.map((u) => u.reach * 1.5 + 6);
    const tubes = snaps[0].items.map((it) => { const r = pc.reach.get(it.row); return { id: it.row, path: pc.path.get(it.row), reach: r, core: r - 18 + BLOOD_PAD }; });
    const joins = U.map(({ j }, ji) => ({ path: pc.jpath[ji], reach: pc.jreach[ji] + MORPH_JSLACK - MORPH_SLACK, k: j.k, fillet: j.fillet, members: j.members, trunk: j.trunk, fork: j.fork }));
    return sweepBin({ tubes, joins, opts: { rows: GL_ROWS, samples: N_SAMPLES, slack: MORPH_SLACK } });
  }
  function setOf(pc, b) {
    pc.set = veins.makeMorphSet(b);
    pc.frame = new Float32Array((b.rows - b.entRows) * ENT_W * 4);
    pc.posBase = b.posBase - b.entRows * ENT_W; pc.joinBase = b.joinBase - b.entRows * ENT_W;
  }
  // ── A coil or a varix's spread easing at rest, on the GPU (2 Nov 2026, Mohammad: "Move. Everything. To. GPU.") ──
  // A slide change that grows or shrinks a varix eases its channels' coil (g.wig toward g.wigT) and its strands' fan (g.spr toward
  // g.sprT) over a second or two, and the strands spread into cells their binning did not list: 10 to 19 whole binnings of every vessel
  // and 46 to 121 MB sent up in one Varices slide change (motion budget, headless phone, 3 Nov). The targets move as the model does
  // through the change (a channel's growth there went 0, 0.42, 0.24, 0.33, 1), so no course made for one target lasts. But a coil and a
  // fan only ever lie between their bounds (a coil's amplitude 0 to COIL_MAX, a fan 0.55 to 1, varix-look.js), so every shape a
  // collateral can take lies within the courses its points take round that box (ENV_AT: its corners, sides and a diagonal; a point
  // between them is nearer one of them than the slack). That envelope is made once while the figure rests (envCheck), in the worker,
  // as a stretch of the change between the views is (sweepPiece), for every collateral whether shown or not and every strand however
  // faded, so the vessels a slide change shows are in it too. Each frame of an ease then sends only its points and joins (frameFrom),
  // and the vessels are drawn from them exactly as from a binning of their own. A frame that leaves it (a vessel shown that was not
  // there, one wider than it was binned for) is binned as before, and the envelope made again at the next rest.
  const EASE_GPU = MORPH_GPU, COIL_MAX = 5, COLL_REACH = 32;
  const ENV_AT = [[0, 0.55], [COIL_MAX / 2, 0.55], [COIL_MAX, 0.55], [COIL_MAX, 0.775], [COIL_MAX, 1], [COIL_MAX / 2, 1], [0, 1], [0, 0.775], [0, 0.55], [COIL_MAX / 2, 0.775], [COIL_MAX, 1]];
  let easeHeld = false;
  const et = { key: '', gen: 0, pc: null, restT: 0, checkT: 0, stats: { gpu: 0, builds: 0, miss: {} } };
  // (A vessel it does not hold, or one wider than it was made for: made again at the next rest. A course or a join off it is binned as before.)
  const easeMiss = (why) => { et.stats.miss[why] = (et.stats.miss[why] || 0) + 1; if (why === 'vessels' || why === 'reach') { et.key = ''; envSoon(); } return false; };
  const coils = (x) => x.e.kind === 'collateral' && !x.e.spontaneous && !STRAIGHT_COLL.has(x.e.id);
  // Everything an ease can draw: the figure's vessels (as glItems lists them) with every vessel, strand and feeder,
  // shown or not, with a coil of w and a fan of sp. Pure: the coils and fans are put back.
  function envItemsAt(w, sp) {
    const saved = [], t = easeInOut(morph), anat = morph < 0.5, items = [];
    for (const x of EV) if (coils(x)) { const g = geo[x.e.id]; saved.push([g, g.wig, g.spr]); g.wig = w; if (x.strands && LOOK_SITE[x.e.id]) g.spr = sp; }
    try {
      for (const x of EV) {
        const g = geo[x.e.id];
        if (!g?.cur) continue;
        const v = vesselAt(x, t);
        items.push({ x, obj: x, row: x.row, pts: v.pts, kind: 'v' });
        if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) items.push({ x, obj: cb, row: cb.row, pts: cb.cur, kind: 'c' });
        if (!anat || x.isArt || x.ghost) continue;
        for (const sd of x.strands || []) if (sd.cur) items.push({ x, obj: sd, row: sd.row, pts: strandAt(x, sd, t, v), kind: 's' });
        for (const fd of x.feeders || []) if (fd.cur) items.push({ x, obj: fd, row: fd.row, pts: fd.cur, kind: 'f' });
      }
      return cavaAsOne(items, lenOfGeo);
    } finally { for (const [g, wg, s0] of saved) { g.wig = wg; g.spr = s0; } }
  }
  function envSoon() {
    if (!EASE_GPU || et.checkT) return;
    et.checkT = setTimeout(envCheck, 600);
  }
  // At rest, the envelope for the figure as it stands, made when what it holds changed (the view's side, the vessels it can show).
  function envCheck() {
    et.checkT = 0;
    if (!veins || veins.lost || morph !== morphTarget || !wrap.classList.contains('gl-on') || lobuleOn) return;
    if (inMotion() || coilEasing) { envSoon(); return; }
    const rows = rowKey(envItemsAt(0, 1)), key = `${morph}|${rows}`;
    if (key === et.key && et.pc?.set?.owner === veins) return;
    et.key = key;
    const gen = ++et.gen, snaps = [], pc = { set: null }, shown = new Set(glItems().map((it) => it.row));
    et.stats.builds++;
    // (One moment a task, as the change's stretches are made: each is a pass over every vessel and its joins.)
    // (Each pass over the joins is a task of its own, and none starts while the page is touched or moving: three passes a moment in
    // one task were 150 to 270 ms each, headless, a dozen of them through the first seconds after a load, start-up profile 2 Nov 2026.)
    let part = null;
    const next = () => {
      if (gen !== et.gen || !veins || veins.lost) return;
      if ((inMotion() || sinceInput() < 700) && snaps.length < 2 * ENV_AT.length) { setTimeout(next, 200); return; }
      if (snaps.length < 2 * ENV_AT.length) {
        const m = snaps.length >> 1, [w, sp] = ENV_AT[m];
        if (!part) { const items = envItemsAt(w, sp); part = { items, o: joinsKept(items), J2: null }; setTimeout(next, 0); return; }
        // (The joins half way from the moment before too: an end's join can move across the step.)
        const P = m && ENV_AT[m - 1];
        if (!part.J2) { part.J2 = P ? joinsKept(envItemsAt((P[0] + w) / 2, (P[1] + sp) / 2)).J : []; setTimeout(next, 0); return; }
        const { items, o, J2 } = part;
        part = null;
        // (Each moment twice: with only the vessels shown now, and with every one. Which vessels are there changes how their runs are
        // smoothed where they meet (smoothRunOn): a vein running on into a hidden collateral was 6.4 off its course with every one.)
        const own = joinsKept(items.filter((it) => shown.has(it.row)));
        snaps.push({ items, J: own.J, smooth: own.smooth, reach: o.reach, J2: [], own: own.smooth }, { items, ...o, J2, own: o.smooth });
        setTimeout(next, 0); return;
      }
      if (snaps.some((sn) => rowKey(sn.items) !== rows)) return;
      pc.rows = rows;
      // (A collateral widens as its varix grows through the change: its reach given 40% more room, past the quarter every vessel gets.
      // A frame wider than that was binned on the CPU, 12 of the 35 frames of a Varices 2 to 3 change, headless phone. The reach only
      // says which cells list a vessel; the drawing is unchanged.)
      const coll = new Set(snaps[0].items.filter((it) => it.x.e.kind === 'collateral').map((it) => it.row));
      // (A feeder not grown yet has no reach of its own to go by (C3's, 20 to 22 once grown, was binned for none): a collateral's rows
      // get at least COLL_REACH.)
      const more = new Map(snaps[0].items.map((it) => [it.row, coll.has(it.row) ? Math.max(COLL_REACH, (vBinReach.get(it.row) || snaps[0].reach.get(it.row) || 0) * 1.4) : vBinReach.get(it.row) || 0]));
      sweepPiece(pc, snaps, more).then((b) => {
        if (gen !== et.gen || !b || !veins || veins.lost) return;
        setOf(pc, b);
        const old = et.pc;
        et.pc = pc;
        if (old?.set) { if (mt.using === old.set) morphOff(); old.set.owner.dropMorphSet(old.set); }
      }, () => {});
    };
    setTimeout(next, 0);
  }
  // A frame of an ease drawn from its stretch, when its vessels fit it. Each vessel's course is followed between the two moments its
  // share of the ease left lies between (the vessels not easing have one course at every moment).
  const sOfNone = () => -1;
  let morphS = 0;   // (the moment a frame of the change lies at, for sOfMorph: frameFrom runs at once and is never re-entered)
  const sOfMorph = () => morphS;
  function coilFrame(items) {
    const pc = et.pc;
    if (!EASE_GPU || !pc?.set || pc.set.owner !== veins) return false;
    if (!coilEasing && mt.using !== pc.set) return false;   // (at rest, from a binning of its own: binned as before)
    // (Each point checked against its courses round the box: an ease can be anywhere in it.)
    if (!frameFrom(pc, items, sOfNone, easeMiss)) return false;
    et.stats.gpu++;
    // (Landed, the figure goes back to a binning of its own once the page is quiet: the envelope's lists are wider than it needs.)
    clearTimeout(et.restT);
    et.restT = setTimeout(easeRest, 1500);
    return true;
  }
  function easeRest() {
    et.restT = 0;
    if (easeHeld) return;   // (held for a check: binned when it asks, rebinNow)
    if (!et.pc?.set || mt.using !== et.pc.set) return;
    if (coilEasing || inMotion() || inUpdate) { et.restT = setTimeout(easeRest, 600); return; }
    morphOff();
    vBinKey = ''; binShown = null; bendShown = null;
    syncVeins(easeInOut(morph));
  }
  // (The worker's lifecycle, sweep-client.js: a dead or stuck one is dropped and its requests rejected; the next request restarts it,
  // up to a few times in a row, and the callers fall back to the main thread on a rejection.)
  const sweeper = createSweepClient(() => new Worker(new URL('./sweep-worker.js', import.meta.url), { type: 'module' }));
  const sweepBin = (msg) => sweeper.request(msg);
  const FAR_ROW = Array.from({ length: N_SAMPLES }, () => [1e9, 1e9]);
  // How far (squared) a join's centre lies from the course of its centres through the stretch.
  function joinOff(x, y, C) {
    if (C.length === 1) return (x - C[0][0]) ** 2 + (y - C[0][1]) ** 2;
    let best = Infinity;
    for (let i = 0; i + 1 < C.length; i++) {
      const ax = C[i][0], ay = C[i][1], dx = C[i + 1][0] - ax, dy = C[i + 1][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
      const h = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), ex = ax + dx * h - x, ey = ay + dy * h - y;
      best = Math.min(best, ex * ex + ey * ey);
    }
    return best;
  }
  // A frame of the change drawn from the stretch made for it, when its vessels fit it: their points and joins sent up; else false.
  function morphFrame(items) {
    if (morph === morphTarget && coilFrame(items)) return true;   // (a coil or a varix's spread easing at rest: envCheck)
    if (!MORPH_GPU || !mt.pieces) return false;
    const t = easeInOut(morph), now = performance.now();
    if (morph !== morphTarget) mt.landAt = now;
    else if (!mt.using || now - mt.landAt > 1000) return false;   // (at rest: binned as before; the landing frames stay on the stretch)
    const anat = morph < 0.5;
    let pc;   // (the first stretch of this side that t falls in: a loop, no closure)
    for (let q = 0; q < mt.pieces.length; q++) { const p = mt.pieces[q]; if (p.anat === anat && t >= p.t0 && (anat ? t < p.t1 || p.t1 === 0.5 : t <= p.t1)) { pc = p; break; } }
    if (!pc?.set || pc.set.owner !== veins) return morphMiss(pc?.bad ? 'unfit stretch' : 'not ready');
    // Where t falls among the stretch's moments.
    let s = 0;
    while (s < pc.ts.length - 2 && t > pc.ts[s + 1]) s++;
    morphS = s;
    return frameFrom(pc, items, sOfMorph, morphMiss);
  }
  // A frame drawn from a stretch's binning (pc), when its vessels fit it, with `sOf(it)` the moments its course lies between: every point
  // within the slack of where it went between its two (the cells and the circles were swept over the hull of each piece of a vessel at
  // the two, so a piece whose ends are within the slack of their courses is within the slack of that hull). Else morphMiss(why), false.
  // (Kept for frameFrom, which runs every frame of a vessel morph and is never re-entered: the rows it draws, the joins it has used, and a join's test.)
  const FR_DRAWN = new Set(), NO_JOINS = [];   // alloc-rare: kept, made once for the stage
  let FR_ON = new Uint8Array(64);   // alloc-rare: kept, made once for the stage (grown below if a stretch has more joins)
  function joinMatches(q, j) {
    if (q.trunk !== j.trunk || !!q.fork !== !!j.fork) return false;
    for (let a = 0; a < j.members.length; a++) { const i = q.members.indexOf(j.members[a]); if (!(i >= 0 && i < 4)) return false; }
    for (let a = 0; a < q.members.length; a++) { const m = q.members[a]; if (FR_DRAWN.has(m) && !j.members.includes(m)) return false; }
    return true;
  }
  const FR_STORES = [newJoinStore(), newJoinStore()];   // alloc-rare: kept, made once for the stage
  let frFlip = 0;
  function frameFrom(pc, items, sOf, morphMiss) {
    for (let i = 0; i < items.length; i++) if (!pc.path.has(items[i].row)) return morphMiss('vessels');
    // (A store of its own for this frame, the other the last one's: the courses it handed the renderer are not written over while it may read them.)
    frFlip ^= 1;
    const { J, smooth } = joinsOf(items, FR_STORES[frFlip]);
    const S2 = MORPH_SLACK * MORPH_SLACK;
    const buf = pc.frame;
    // (A vessel binned for the stretch that this frame does not draw is put far out of every cell's reach.)
    FR_DRAWN.clear();
    for (let i = 0; i < items.length; i++) FR_DRAWN.add(items[i].row);
    for (let q = 0; q < pc.pathRows.length; q++) if (!FR_DRAWN.has(pc.pathRows[q])) writePoints(buf, pc.posBase, N_SAMPLES, pc.pathRows[q], FAR_ROW);
    for (const it of items) {
      if (reachOf(it) > pc.reach.get(it.row)) return morphMiss('reach');
      const P = smooth.get(it.row) || it.pts, R = pc.path.get(it.row), s = sOf(it);
      if (P.length !== N_SAMPLES) return morphMiss('samples');
      // (s below 0: any of its courses, the nearest.)
      const s0 = s < 0 ? 0 : Math.min(s, R.length - 2), s1 = s < 0 ? R.length - 2 : s0;
      for (let i = 0; i < N_SAMPLES; i++) {
        let best = Infinity;
        for (let q = s0; q <= Math.max(s0, s1) && best > S2; q++) {
          const A = R[q], B = R[q + 1] || A;
          const ax = A[i][0], ay = A[i][1], ux = B[i][0] - ax, uy = B[i][1] - ay, L2 = ux * ux + uy * uy || 1e-9;
          const h = clamp(((P[i][0] - ax) * ux + (P[i][1] - ay) * uy) / L2, 0, 1), dx = P[i][0] - ax - ux * h, dy = P[i][1] - ay - uy * h;
          best = Math.min(best, dx * dx + dy * dy);
        }
        if (best > S2) return morphMiss('course');
      }
      writePoints(buf, pc.posBase, N_SAMPLES, it.row, P);
    }
    const nJ = pc.jpath.length;
    if (FR_ON.length < nJ) FR_ON = new Uint8Array(nJ * 2);   // alloc-rare: grown only when a stretch has more joins than any before
    else FR_ON.fill(0, 0, nJ);
    const on = FR_ON;
    for (let ji = 0; ji < J.length; ji++) {
      const j = J[ji];
      let u = -1, off = MORPH_JSLACK ** 2;
      for (const v of pc.jby.get(joinKey(j)) || NO_JOINS) { const d = joinOff(j.x, j.y, pc.jpath[v]); if (!on[v] && d <= off) { off = d; u = v; } }
      // (Else a join binned with more members, those this frame does not draw, and the same trunk: the shader blends only the members
      // a pixel has in reach, and a vessel not drawn has none, so it draws exactly this join. A vessel shown that the stretch binned
      // hidden changes which ends meet where: the joins of the vessels shown now are then among those of every vessel.)
      if (u < 0) for (let v = 0; v < pc.jof.length; v++) {
        const q = pc.jof[v];
        if (on[v] || !joinMatches(q, j)) continue;
        const d = joinOff(j.x, j.y, pc.jpath[v]);
        if (d <= off) { off = d; u = v; }
      }
      if (u < 0) return morphMiss('joins');
      if (j.reach > pc.jreach[u]) return morphMiss('join');
      writeJoinNow(buf, pc.joinBase, u, j.x, j.y, j.reach, j.k, j.fillet);
      on[u] = 1;
    }
    for (let u = 0; u < nJ; u++) if (!on[u]) writeJoinNow(buf, pc.joinBase, u, 0, 0, -1, 0, 0);
    for (const it of items) if (it.kind === 'v') it.obj.glPts = smooth.get(it.row) || it.pts;
    veins.useMorphSet(pc.set);
    veins.setMorphFrame(buf);
    for (const it of items) veins.setBend(it.row, smooth.get(it.row) || it.pts);
    mt.using = pc.set; binShown = null; bendShown = null; tubesNew = true;
    mt.stats.gpu++;
    return true;
  }
  const veinsRows = new Set();   // vessel rows whose attributes changed since the vessel layer was drawn (only those, while veinsDirty is false)
  let plateDim = null, plateSat = 1, netA = 1;
  // A lens switch crossfades every vessel from the colors it showed to the new lens's (no one-frame recolor).
  let shownCol = new Map(), lensFrom = null, lensT0 = 0, lensMode = null;
  // The lumens' colours follow the model's through the widths' filter (display-state.js; combined plan M1), so a slider's step or
  // a model frame's is an ease, not a step. A crossfade (a lens change, a jump) carries its own change: the filter then shows the
  // target at once, as does Reduce Motion.
  const colFollow = createColourFollow({ tau: W_TAU }), colT = new Array(6);
  // (The rows the colour pass stepped this sync, for colFollow.prune: a row's number against this sync's, so none is cleared or made. Rows are small whole numbers.)
  const colRows = {
    gen: 1, a: new Uint32Array(1024),   // alloc-rare: kept, made once for the stage (doubled below if a row is beyond it)
    begin() { this.gen++; },
    add(r) { if (r >= this.a.length) { const b = new Uint32Array(Math.max(r + 1, this.a.length * 2)); b.set(this.a); this.a = b; } this.a[r] = this.gen; },   // alloc-rare: doubled only when a row beyond any before appears
    has(r) { return r < this.a.length && this.a[r] === this.gen; },
  };
  let colAt = 0, colEasing = false;
  let sinceP = null;   // (a "change since" slide's reference: see changeRef)
  const JUMP_MMHG = 2;
  let jumpP = null, jumpF = null;
  function modelJumped(f) {
    if (!f || f === jumpF) return false;
    jumpF = f;
    const P = f.Pf || f.P;
    if (!P) return false;
    let big = false;
    if (jumpP && jumpP.length === P.length) for (let i = 0; i < P.length; i++) if (Math.abs(P[i] - jumpP[i]) > JUMP_MMHG) { big = true; break; }
    if (!jumpP || jumpP.length !== P.length) jumpP = new Float64Array(P.length);
    jumpP.set(P);
    return big && shownCol.size > 0;
  }
  const LENS_FADE = D_SURFACE;   // (a lens crossfade is a surface step of the motion scale, ease.js; the organs' and the lobule's clocks are the same)
  // (The lens crossfade and the plate's ease over it run on the eases' clock, frame.js easeNow: the long frame a lens change can bring,
  // the vessels recoloured and the organs' picture redrawn, holds them back instead of eating their first half. ?paced=0: the wall clock.)
  const lensNow = () => (PACED ? easeNow() : performance.now());
  const lensFading = () => !!lensFrom && lensNow() - lensT0 < LENS_FADE + 20;
  const rgbCache = new Map(), rgbVarName = new Map();
  // Any CSS color (rgb(), #hex, a named var) as [r, g, b] in 0–1.
  function toRGB(c, cs) {
    let v = c;
    if (typeof c === 'string' && c.startsWith('var(')) {
      let nm = rgbVarName.get(c);   // (the property a var(--x) names, found once for each such string, not by a pattern at every call)
      if (nm === undefined) { const m = /^var\((--[\w-]+)\)$/.exec(c); nm = m ? m[1] : null; rgbVarName.set(c, nm); }
      if (nm) v = cs.getPropertyValue(nm).trim();
    }
    let out = rgbCache.get(v);
    if (out) return out;
    // (Parsed in script, css-color.js, in 8-bit steps as a canvas's fillStyle gave it: no 2D canvas. Anything unreadable is black.)
    out = cssColor8(v || 'black').slice(0, 3);
    if (rgbCache.size > 512) rgbCache.clear();
    rgbCache.set(v, out);
    return out;
  }
  const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const cssNum = (cs, name, dflt) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : dflt; };
  const tripletKept = new Map();   // (a property's text → its triplet, parsed once: callers copy it, none keeps or writes it)
  const cssTriplet = (cs, name) => {
    const raw = cs.getPropertyValue(name);
    let out = tripletKept.get(raw);
    if (out) return out;
    const k = raw.trim().split(/[\s,/]+/).map(Number);
    out = k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0];
    if (tripletKept.size > 64) tripletKept.clear();
    tripletKept.set(raw, out);
    return out;
  };
  /** Whether the GPU draws the vessels (always, except while an SVG export is built). */
  const glWanted = () => !!veins && !veins.lost;

  // What the GPU draws this frame: each vessel on screen, its strands and its tributaries. Strands
  // and tributaries lie where the anatomy has them, so the circuit leaves them out (as the SVG did).
  // (The items are kept entries in two pools, written in place: the whole sync's (its list stays as the glow memo's until the next whole sync
  // writes it again, and nothing else asks for that pool), and a scratch for the callers that read a list at once (envCheck, buildSegs).)
  const GLI_SYNC = { list: [], objs: [], n: 0 }, GLI_SCRATCH = { list: [], objs: [], n: 0 }, NO_LIST = [];
  function glItem(pool, x, obj, row, pts, kind) {
    const i = pool.n++;
    const it = pool.objs[i] || (pool.objs[i] = { x: null, obj: null, row: 0, pts: null, kind: '', ra: undefined, f: undefined, len: undefined, endNode: undefined });
    it.x = x; it.obj = obj; it.row = row; it.pts = pts; it.kind = kind;
    it.ra = undefined; it.f = undefined; it.len = undefined; it.endNode = undefined;   // (what cavaAsOne sets on the cava's, cleared for the entry's next use)
    pool.list.push(it);
  }
  function glItems(pool = GLI_SCRATCH) {
    const items = pool.list;
    items.length = 0; pool.n = 0;
    const anat = morph < 0.5;
    for (const x of EV) {
      const pts = geo[x.e.id].cur;
      if (!x.vis || !pts || (!x.isArt && !x.rOf)) continue;
      glItem(pool, x, x, x.row, pts, 'v');
      // The liver's branches lie where the circuit has them, so the anatomy leaves them out.
      if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) glItem(pool, x, cb, cb.row, cb.cur, 'c');
      if (!anat || x.isArt || x.ghost) continue;
      for (const sd of x.strands || NO_LIST) if (sd.cur && (sd.live ?? 1) > 0.02) glItem(pool, x, sd, sd.row, sd.cur, 's');
      for (const fd of x.feeders || NO_LIST) if ((fd.live ?? 1) > 0.02 && fd.w) glItem(pool, x, fd, fd.row, fd.cur, 'f');
    }
    return cavaAsOne(items, lenOfGeo);
  }
  const lenOfGeo = (id, P) => geo[id].len || arcLen(P), lenOfArc = (id, P) => arcLen(P);   // (kept: cavaAsOne's length function, no closure made per call)
  const cavaMemo = { P: null, Q: null, La: 0, Lb: 0, pts: null };   // (the cava's resample and the two courses it was made from)
  function cavaAsOne(items, lenOf) {
    // The cava is drawn as one vessel: its two stretches (below and above the hepatic veins) are two
    // edges of the model, but one tube on screen, with one course, one shading and one chevron track.
    // Drawn where they would meet, two capped ends layered as an arc, a band and a seam.
    let a = null, b = null;   // (the first of each, by a loop: no closure)
    for (let q = 0; q < items.length; q++) {
      const it = items[q];
      if (it.kind !== 'v') continue;
      if (!a && it.x.e.id === 'IVC_IS') a = it;
      if (!b && it.x.e.id === 'IVCS_RA') b = it;
    }
    if (a && b && a.pts.length > 1 && b.pts.length > 1) {
      const P = a.pts, Q = b.pts, q = P[P.length - 1], La = lenOf('IVC_IS', P), Lb = lenOf('IVCS_RA', Q);
      // Re-sampled evenly by arc length to the usual count of samples (a sample's index is its place along the vessel).
      // (Kept while its two stretches are the same courses: a vessel's course is a new array whenever it moves (updateGeometry) and
      // is never written in place, so the same two arrays give the same resample. It was made again on every sync, 2 Nov 2026.)
      const cm = cavaMemo;
      if (cm.P === P && cm.Q === Q && cm.La === La && cm.Lb === Lb) a.pts = cm.pts;
      else {
        const C = P.concat(Math.hypot(Q[0][0] - q[0], Q[0][1] - q[1]) < 0.5 ? Q.slice(1) : Q), cum = [0];   // alloc-rare: only when the cava's course moved
        for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
        const L = cum[cum.length - 1] || 1;
        a.pts = Array.from({ length: N_SAMPLES }, (_, i) => {   // alloc-rare: only when the cava's course moved
          const d = (L * i) / (N_SAMPLES - 1);
          let j = 1;
          while (j < C.length - 1 && cum[j] < d) j++;
          const t = cum[j] > cum[j - 1] ? clamp((d - cum[j - 1]) / (cum[j] - cum[j - 1]), 0, 1) : 0;
          return [C[j - 1][0] + (C[j][0] - C[j - 1][0]) * t, C[j - 1][1] + (C[j][1] - C[j - 1][1]) * t];   // alloc-rare: only when the cava's course moved
        });
        cm.P = P; cm.Q = Q; cm.La = La; cm.Lb = Lb; cm.pts = a.pts;
      }
      a.ra = b.x; a.f = La / (La + Lb); a.len = La + Lb; a.endNode = b.x.e.to;
      items.splice(items.indexOf(b), 1);
    }
    return items;
  }
  // Lumen radius along an item, and the key it changes with.
  function itemRadii(it) {
    const { x, kind } = it;
    if (kind === 'v' && it.ra) {
      const { ra, f } = it;
      return [`${x.shadeVer}|${ra.shadeVer}|${f.toFixed(4)}`, (i) => { const u = i / (N_SAMPLES - 1); return u < f ? x.rOf(u / f) : ra.rOf((u - f) / (1 - f)); }];
    }
    if (kind === 'v' && !x.isArt) return [x.shadeVer, (i) => x.rOf(i / (N_SAMPLES - 1))];
    // (The esophageal balloon squeezes the varices' strands while it is up: balloonSqueeze, 1 … 0.55.)
    const r = (kind === 'v' ? Math.max(0.5, x.width / 2) : kind === 's' ? Math.max(1.6, x.width * it.obj.k) / 2 : it.obj.w / 2) * (kind === 's' && x.e.id === 'C1a' ? balloonSqueeze : 1);
    // (A varix strand beaded by the varix's size: varix-bead.js.)
    const b = kind === 's' ? it.obj.bead || 0 : 0, o = it.obj;
    keep(o, 'kr', r, widthMoving(x) ? edgeQ() : 0);
    const rk = String(o.kr);
    if (b > 0) return [`${rk}|${b}|${Math.round(o.len || 0)}`, (i) => beadRadius(r, b, i / (N_SAMPLES - 1), o.len || 1, o.ph * 1.7, o.u0 || 0)];
    // (A sinusoid strand narrows across its stretch: sin-perfusion.js.)
    if (kind === 's' && SIN_EDGES.has(x.e.id)) { const w = x.width; return [`${r.toFixed(2)}|${w.toFixed(2)}|sin`, (i) => sinStrandRadius(r, w, i / (N_SAMPLES - 1), o.span)]; }
    return [rk, () => r];
  }
  // Vessels that run on into each other (from veinJoins): their calibers are eased to meet at the join.
  let glStraight = [], glRadDirty = true;
  // (The joins pass, and the courses redrawn smooth where one vessel runs on into the next: vein-joins.js, which makes nothing in a frame. veinJoins leaves the pairs that run on in glStraight, as it always did,
  // and the store it wrote into in glStore for smoothRunOn.)
  let glStore = null;
  function veinJoins(items, st = newJoinStore(), margin = 0) {
    glRadDirty = true; glStore = st;
    const J = joinsPass(items, N_SAMPLES, st, margin);
    glStraight = st.straight;
    return J;
  }
  const smoothRunOn = (items, st = glStore) => smoothPass(items, glStraight, st);
  let tubesShown = null, tubesNew = true;
  // A glow or hover easing (glowStep, vhStep) changes only the glow texels of the tube data. While nothing else the whole sync
  // reads has changed since it last ran (the same vessels, model frame, morph, layout, colours, plate, lens, catheter, classes),
  // those texels alone are written again (writeGlowTexels, as the whole sync writes them) and only the rows that changed are
  // drawn again: the same tube data and the same picture as a whole sync, without rebuilding ~300 items each frame of an ease.
  let glowMemo = null;
  // (The memo is one kept object written in place by each whole sync, with its widths list and its classes buffer; glowBits' second slot is the
  // scratch the glow-only check compares against. The buffers grow when a sync has more items than they hold.)
  const glowMemoObj = { items: null, t: 0, netA: 0, cs: null, mode: '', origin: false, cath: null, F: null, geo: 0, plate: false, cls: '', bits: null, reach: 0, selK: '', wide: [] };
  const glowBitsBuf = [new Uint8Array(512), new Uint8Array(512)];
  const IVC_LIST = [...IVC_EDGES];
  // Each item's classes the whole sync reads (selected, hovered, ghost; on its own and the cava's upper stretch), and the cava's.
  function glowBits(items, slot) {
    const n = items.length + IVC_LIST.length;
    let b = glowBitsBuf[slot];
    if (b.length < n) glowBitsBuf[slot] = b = new Uint8Array(n * 2);
    for (let i = 0; i < items.length; i++) { const it = items[i]; b[i] = (it.x.sel ? 1 : 0) | (it.x.ghost ? 4 : 0) | (it.ra?.sel ? 8 : 0) | (it.x.lifted ? 32 : 0) | (it.x.reveal ? 64 : 0); }
    for (let i = 0; i < IVC_LIST.length; i++) b[items.length + i] = E[IVC_LIST[i]]?.sel ? 1 : 0;
    return b;
  }
  // Whether a selected or spotlit vessel eases back into the network toward its end at node n (highlight-math.js liftEnd).
  const selJoins = [], SEL_JOIN_POOL = EV.map(() => ({ lit: false, ghost: false }));   // (a list and its entries, kept: at most one per vessel, written in place)
  function selEnd(id, n) {
    const joins = selJoins;
    joins.length = 0;
    for (const y of EV) {
      if (y.e.id === id || !y.vis || (y.e.from !== n && y.e.to !== n)) continue;
      const jn = SEL_JOIN_POOL[joins.length];
      jn.lit = vh.sel.has(y.e.id) || spot.ids.has(y.e.id); jn.ghost = y.ghost;
      joins.push(jn);
    }
    return liftEnd(spot.ids.has(id) && spotOn(), joins);
  }
  let rgbGlowCs = null;
  const rgbGlowOf = (c) => toRGB(c, rgbGlowCs);   // (the glow-only sync's colour reader, kept; rgbGlowCs the style it reads)
  // (A vessel attribute counts as changed once it is a 255th away from what the layer was drawn with: a colour step under that cannot show, and a
  // running model's colours follow a little on every frame. The difference is kept, so the steps add up; NaN counts as changed.)
  const tubeMoved = (a, b) => !(Math.abs(a - b) <= 0.0039);
  function glowOnlyOk(t) {
    const m = glowMemo;
    if (!m || !veins || veins.lost || !vLook || tubesNew || lensFrom || colEasing || !tubesShown || tubesShown.length !== tubeData.length) return false;
    if (m.t !== t || m.F !== F || m.geo !== geometryVersion || m.netA !== netA || m.cs !== wrapCS() || m.mode !== layerMode() || m.origin !== originOn()) return false;
    if (m.selK !== selAKey() || m.cath !== cathTint || m.plate !== veins.hasPlate(0) || m.cls !== wrapCls() || m.reach !== (glow.lit.size ? 20 : 11)) return false;
    const b = glowBits(m.items, 1), nb = m.items.length + IVC_LIST.length;   // (the buffer may be longer than the items it holds)
    for (let i = 0; i < nb; i++) if (b[i] !== m.bits[i] || b[i] & 64) return false;   // (a vessel drawing on changes with the clock: whole syncs)
    return true;
  }
  /** The glow-only sync: true when it stood in for syncVeins (see glowMemo). */
  function syncGlowOnly(t) {
    if (!glowOnlyOk(t)) return false;
    glowSync = false;
    const cs = glowMemo.cs, rgbCs = rgbGlowOf, W = TUBE_TEXELS * 4;
    rgbGlowCs = cs;
    let changed = false;
    for (const it of glowMemo.items) {
      if (it.kind !== 'v' && it.kind !== 's') continue;
      const o = it.row * W;
      writeGlowTexels(tubeData, o, it.kind, it.x.e.id, it.ra?.e.id, it.obj.len, glow.lit, vh.amt, rgbCs, easeInOut);
      for (let i = o + 39; i < o + 48; i++) if (tubeMoved(tubeData[i], tubesShown[i])) { veinsRows.add(it.row); tubesShown.set(tubeData.subarray(o, o + W), o); changed = true; break; }
    }
    if (changed) veins.setTubes(tubeData);
    return true;
  }
  // (Timed, binning included, for the debug overlay's GPU readout: gpu-probe.js.)
  // Radii: re-sent only when a tube changed.
  // (Allocation-free, 2 Nov 2026: the radii sync ran on every model frame, about 80% of the figure's per-frame garbage: a key
  // string, a [key, rOf] pair and a closure per vessel per sync, a new radii array per changed vessel, the eased radii in new
  // arrays and Maps, and the taper's chains and stations made again whenever any caliber moved. Now each vessel keeps its own
  // buffers (glR0 its radii, glE the eased, glRSent what the GPU has, which is glR), changes are told by numbers kept on it
  // (gkC/gk1-3 the key, glR0v and glRv versions), and the taper's chains are found again only when the links change. The
  // numbers sent are the same as before, in the same arithmetic.)
  let radR = 0, radB = 0, radW = 0, radCase = 0;   // (the item's radii case and numbers, from radFresh, for radFill)
  /** Whether the item's radii key changed (itemRadii's key, kept as numbers on the object); sets the case for radFill. */
  function radFresh(it) {
    const { x, kind } = it, o = it.obj;
    let c, k1, k2 = 0, k3 = 0;
    if (kind === 'v' && it.ra) { c = 1; k1 = x.shadeVer | 0; k2 = it.ra.shadeVer | 0; k3 = Math.round(it.f * 1e4); }
    else if (kind === 'v' && !x.isArt) { c = 2; k1 = x.shadeVer | 0; }
    else {
      // (As itemRadii: the esophageal balloon squeezes the varices' strands, a varix strand is beaded, a sinusoid strand narrows.)
      const r = (kind === 'v' ? Math.max(0.5, x.width / 2) : kind === 's' ? Math.max(1.6, x.width * o.k) / 2 : o.w / 2) * (kind === 's' && x.e.id === 'C1a' ? balloonSqueeze : 1);
      const b = kind === 's' ? o.bead || 0 : 0;
      keep(o, 'kr', r, widthMoving(x) ? edgeQ() : 0);
      radR = r; radB = b;
      if (b > 0) { c = 3; k1 = o.kr; k2 = b; k3 = Math.round(o.len || 0); }
      else if (kind === 's' && SIN_EDGES.has(x.e.id)) { c = 4; radW = x.width; k1 = Math.round(r * 100); k2 = Math.round(radW * 100); }
      else { c = 5; k1 = o.kr; }
    }
    radCase = c;
    if (o.glR0 && o.gkC === c && o.gk1 === k1 && o.gk2 === k2 && o.gk3 === k3) return false;
    o.gkC = c; o.gk1 = k1; o.gk2 = k2; o.gk3 = k3;
    return true;
  }
  /** The item's lumen radii (itemRadii's rOf at each sample) into out. */
  function radFill(it, out) {
    const { x } = it, o = it.obj, n1 = N_SAMPLES - 1;
    if (radCase === 1) tubeFill(x, it.ra, it.f, out);
    else if (radCase === 2) tubeFill(x, null, 0, out);
    else if (radCase === 3) for (let i = 0; i < N_SAMPLES; i++) out[i] = beadRadius(radR, radB, i / n1, o.len || 1, o.ph * 1.7, o.u0 || 0);
    else if (radCase === 4) for (let i = 0; i < N_SAMPLES; i++) out[i] = sinStrandRadius(radR, radW, i / n1, o.span);
    else out.fill(radR);
  }
  // The eased radii's generation: an object eased in the last pass that worked them out has glEs === easeGen (its glE holds them).
  let easeGen = 0, memoPairs = null, memoN = 0;
  const memoV = [];   // (the radii versions the last pass worked from, two per straight join: a vessel at each end, -1 for none)
  const rowIt = [];   // (row → item, this sync's; cleared after)
  // The taper's runs, found again only when the joins that make them change (chainsOf allocates): the links and chains of the last.
  let tapLinksN = 0, tapChains = [], tapIds = new Set(), tapRows = [];
  const tapLinks = [], tapPrev = [], tapPlan = new Map(), tapS = [], tapY = [], tapD = [], tapH = [], tapK = [];
  const tapBodyOf = (row) => rowIt[row].obj.tapBody, tapLenOf = (row) => rowIt[row].obj.tapLen;   // (kept on the vessel: no Map of boxed numbers)
  const tapPlanOf = (row) => { let p = tapPlan.get(row); if (!p) tapPlan.set(row, (p = { y0: 0, y1: 0, d0: 0, d1: 0, j0: false, j1: false })); return p; };
  const easeBuf = (O) => { if (O.glEs === easeGen) return O.glE; if (!O.glE || O.glE.length !== O.glR0.length) O.glE = new Float64Array(O.glR0.length); O.glE.set(O.glR0); O.glEs = easeGen; return O.glE; };   // alloc-rare: a vessel's eased buffer, made the first time it is eased (then refilled in place)
  const SMOOTH = (u) => u * u * (3 - 2 * u);
  const plainRow = (row) => { const it = rowIt[row]; return !!it && it.kind !== 's' && !it.ra && !!it.obj.glR0; };
  // Where a stenosed vessel's colour stands along it (pressure-along.js; combined plan V1): by the resistance its narrowing adds,
  // so the colour falls at the waist. Null for any other (the plain mix by arc, as before): a strand, a tributary drawn into a trunk,
  // a liver branch, a vessel with no stenosis. The cava drawn as one takes each stretch's own.
  const alongK = new Float64Array(N_SAMPLES), alongBuf = new Float32Array(N_SAMPLES);
  function alongOf(it) {
    if (it.kind !== 'v') return null;
    const fa = it.x.stenF, fb = it.ra?.stenF, f = it.f;
    if (!fa && !fb) return null;
    for (let i = 0; i < N_SAMPLES; i++) {
      const u = i / (N_SAMPLES - 1);
      alongK[i] = !it.ra ? fa(u) : u < f ? (fa ? fa(u / f) : 1) : fb ? fb((u - f) / (1 - f)) : 1;
    }
    return alongCurve(alongK, alongBuf);
  }
  function sendRadii(items) {
    for (let q = 0; q < items.length; q++) {
      const it = items[q];
      if (!radFresh(it)) continue;
      const o = it.obj;
      glRadDirty = true;
      if (!o.glR0 || o.glR0.length !== N_SAMPLES) o.glR0 = new Float64Array(N_SAMPLES);   // alloc-rare: a vessel's radii buffer, made once (then refilled in place)
      radFill(it, o.glR0);
      o.glR0v = (o.glR0v || 0) + 1;
    }
    if (!glRadDirty) return;
    // Where one vessel runs on into the next, both ends ease to the same caliber, so the tube is one
    // smooth course (no step and no swelling at the join): a run of vessels joined end to end at two-vessel nodes is one
    // continuous taper through the whole run (vessel-taper.js), in length, so caliber and slope meet at every join.
    // (Kept while the radii they start from are the same: the same versions, and those rows are then skipped below.)
    for (let q = 0; q < items.length; q++) rowIt[items[q].row] = items[q];
    let fresh = !glStraight.length;
    if (glStraight.length) {
      let same = memoPairs === glStraight && memoN === glStraight.length * 2;
      for (let q = 0, j = 0; q < glStraight.length; q++) {
        const L = glStraight[q], A = rowIt[L.a]?.obj, B = rowIt[L.b]?.obj;
        const va = A?.glR0 ? A.glR0v : -1, vb = B?.glR0 ? B.glR0v : -1;
        if (same && (memoV[j] !== va || memoV[j + 1] !== vb)) same = false;
        memoV[j++] = va; memoV[j++] = vb;
      }
      memoN = glStraight.length * 2;
      if (!same) { memoPairs = glStraight; fresh = true; }
    }
    if (fresh) easeGen++;   // (nothing eased from before counts)
    if (fresh && glStraight.length) {
      // The runs: vessels that run on into one another at a node of two vessels. (The cava drawn as one, with its caliber
      // eased to the heart's, and any strand keep the pairwise ease below; a fork has its funnel below too.)
      let n = 0, linksSame = true;
      for (let q = 0; q < glStraight.length; q++) {
        const L = glStraight[q];
        L.chained = !L.fork && plainRow(L.a) && plainRow(L.b);
        if (!L.chained) continue;
        if (tapPrev[n] !== L) linksSame = false;
        tapPrev[n++] = L;
      }
      if (n !== tapLinksN) linksSame = false;
      tapLinksN = n;
      if (n) {
        if (!linksSame) {
          tapLinks.length = 0;
          for (let q = 0; q < n; q++) { const L = tapPrev[q]; tapLinks.push({ a: L.a, ea: L.ia, b: L.b, eb: L.ib }); }   // alloc-rare: the taper's links, made again only when the joins that make them change
          tapIds = new Set();   // alloc-rare: only when the joins change
          for (const { a, b } of tapLinks) { tapIds.add(a); tapIds.add(b); }
          tapChains = chainsOf(tapIds, tapLinks).filter((c) => c.length >= 2);   // alloc-rare: only when the joins change (chainsOf)
          tapRows = [...tapIds];   // alloc-rare: only when the joins change
        }
        for (let q = 0; q < tapRows.length; q++) {
          const it = rowIt[tapRows[q]], O = it.obj, R = O.glR0;
          let mx = -Infinity;
          for (let j = 0; j < R.length; j++) if (R[j] > mx) mx = R[j];
          O.tapBody = mx; O.tapLen = lenOfItem(it);
        }
        for (let q = 0; q < tapChains.length; q++) {
          const chain = tapChains[q];
          planChainInto(chain, tapBodyOf, tapLenOf, tapPlanOf, tapS, tapY, tapD, tapH, tapK);
          for (let w = 0; w < chain.length; w++) {
            const c = chain[w], O = rowIt[c.id].obj, body = O.tapBody, len = O.tapLen, p = tapPlan.get(c.id);
            // (Its own radii scaled by the plan over its own caliber: a stenosis's waist and a narrowed end ride on the taper, and where
            // the plan is its own caliber the scale is exactly 1.)
            if (!(body > 0)) continue;
            if (!O.glE || O.glE.length !== O.glR0.length) O.glE = new Float64Array(O.glR0.length);   // alloc-rare: a vessel's eased buffer, made the first time it is tapered (then refilled in place)
            const R0 = O.glR0, E = O.glE;
            // (taperAt written out in the loop, the same arithmetic: a call that hands back a number boxes it in a new object each time.)
            const y0 = p.y0, y1 = p.y1, d0 = p.d0, d1 = p.d1;
            if (y0 === y1 && d0 === 0 && d1 === 0) for (let i = 0; i < R0.length; i++) E[i] = R0[i] * (y0 / body);
            else for (let i = 0; i < R0.length; i++) {
              const u = i / (N_SAMPLES - 1), u2 = u * u, u3 = u2 * u;
              E[i] = R0[i] * (((2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * len * d0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * len * d1) / body);
            }
            O.glEs = easeGen;
          }
        }
      }
      for (let q = 0; q < glStraight.length; q++) {
        const L = glStraight[q];
        if (L.chained) continue;
        const { a, ia, b, ib, fork } = L;
        const A = rowIt[a]?.obj, B = rowIt[b]?.obj;
        if (!A?.glR0 || !B?.glR0) continue;
        const ra = A.glR0[ia ? N_SAMPLES - 1 : 0], rb = B.glR0[ib ? N_SAMPLES - 1 : 0];
        // In a fork the narrower stretch widens to the wider one's caliber at the node instead (the wider never narrows):
        // a tributary there meets the trunk at full width, so its end stays inside the trunk's walls (the splenorenal
        // shunt on the splenic vein, where the splenic vein's last stretch carries little).
        if (fork) {
          const m = Math.max(ra, rb);
          for (let side = 0; side < 2; side++) {
            const O = side ? B : A, i = side ? ib : ia, r0 = side ? rb : ra, row = side ? b : a;
            if (r0 >= m) continue;
            // (Over about three trunk radii, not half its course: a short funnel, not a long cone.)
            const it = rowIt[row], step = lenOfItem(it) / (N_SAMPLES - 1) || 1;
            const En = Math.min(runOnSamples(it, N_SAMPLES >> 1), Math.max(2, Math.round((3 * m) / step))), R = easeBuf(O);
            for (let s = 0; s < En; s++) R[i ? N_SAMPLES - 1 - s : s] += (m - r0) * (1 - SMOOTH(s / En));
          }
          continue;
        }
        // One smoothstep from A's caliber (half A's course back) to B's (half B's course on), so the
        // taper runs steadily through the join: no plateau there, which read as a crease.
        for (let side = 0; side < 2; side++) {
          const O = side ? B : A, i = side ? ib : ia, row = side ? b : a;
          const En = runOnSamples(rowIt[row], N_SAMPLES >> 1), R = easeBuf(O);
          for (let s = 0; s < En; s++) {
            const u = side ? 0.5 + 0.5 * (s / En) : 0.5 - 0.5 * (s / En), j = i ? N_SAMPLES - 1 - s : s;
            R[j] += side ? (ra - rb) * (1 - SMOOTH(u)) : (rb - ra) * SMOOTH(u);
          }
        }
      }
    }
    const radTol = 0.3 / Math.max(0.05, Math.hypot(drawT[0], drawT[1]) || 1);   // (world units: a third of a device pixel at the view last drawn)
    for (let q = 0; q < items.length; q++) {
      const it = items[q], o = it.obj, R = o.glEs === easeGen ? o.glE : o.glR0;
      // (Compared with a copy of the radii last sent, element by element, and copied only when they change: a joined string
      // per vessel per sync was megabytes a second of garbage; round 2 review, P6.)
      const sent = o.glRSent;
      // (A change under a third of a device pixel at every sample is not sent: the vessels' caliber follows the model's pressures, and
      // each tiny step redrew the whole vessel layer at the model's rate (Mohammad's photo, 4 Nov: 14 whole draws a second, 10 fps). The
      // difference is kept, so the steps add up and one is sent once it is a third of a pixel; the lobule's radii work the same way.)
      if (sent && sent.length === R.length) { let d = 0; for (let j = 0; j < R.length; j++) { const x = Math.abs(sent[j] - R[j]); if (x > d) d = x; } if (d <= radTol) continue; }
      let mx = -Infinity;
      for (let j = 0; j < R.length; j++) if (R[j] > mx) mx = R[j];
      // (The copy is refilled in place when it is the same size: no new array per changed vessel per frame of an ease. It is the
      // figure's glR, what the GPU draws: its version glRv moves with each change, for a reader that follows it, cathLive.)
      if (sent && sent.length === R.length) sent.set(R); else o.glRSent = Float64Array.from(R);
      o.glR = o.glRSent; o.glMaxR = mx; o.glRv = (o.glRv || 0) + 1;
      // (A vessel's new radii change only its own cells: drawn again as a colour change is, see drawVeins.)
      veins.setRadii(it.row, R, alongOf(it)); veinsRows.add(it.row);
    }
    for (let q = 0; q < items.length; q++) rowIt[items[q].row] = undefined;
    glRadDirty = false;
  }
  // The colour pass's frame (syncVeinsNow sets these, colPass reads them; nothing is made per frame).
  let cpItems = null, cpCs = null, cpT0 = 0, cpNow = 0, cpArtery = null, cpOrigin = false, cpIvcOn = false, cpDt = 0;
  const NEUTRAL = 'var(--lens-neutral)', FAN_FR = [0.7, 0.4];
  const cpRgb = (c) => toRGB(c, cpCs);
  const cpMixA = [0, 0, 0], cpMixB = [0, 0, 0], cpFade = new Float64Array(8);
  const mix3To = (out, a, b, k) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };
  // (The figure's colours as last shown, by row: [c0, c1]. Kept maps and pairs, three in turn: the one a crossfade reads from
  // (lensFrom) is never written while it fades.)
  const shownMaps = [shownCol, new Map(), new Map()], shownPairs = new Map();
  function nextShown() {
    let m = shownMaps[0];
    for (let q = 0; q < shownMaps.length; q++) { m = shownMaps[q]; if (m !== lensFrom && m !== shownCol) break; }
    m.clear();
    return m;
  }
  function shownPair(m, row) {
    let pp = shownPairs.get(m);
    if (!pp) shownPairs.set(m, (pp = []));
    return (pp[row] ||= [[0, 0, 0], [0, 0, 0]]);
  }
  /** A fade's eight numbers into cpFade (true: the vessel has one). */
  function put8(v0, v1, v2, v3, v4, v5, v6, v7) { const F8 = cpFade; F8[0] = v0; F8[1] = v1; F8[2] = v2; F8[3] = v3; F8[4] = v4; F8[5] = v5; F8[6] = v6; F8[7] = v7; return true; }
  // (On the cava drawn as one, a stretch's tint end t placed along the whole: from lo, over w; an unset end, below 0, stays.)
  const tintAlong = (t, lo, w) => (t < 0 ? t : lo + t * w);
  const ligatedAt = (id) => { for (let q = 0; q < LIGATED.length; q++) if (LIGATED[q][1] === id) return true; return false; };
  function colPass() {
    const items = cpItems, cs = cpCs, T0 = cpT0, now = cpNow, artery = cpArtery, originMode = cpOrigin, ivcOn = cpIvcOn, colDt = cpDt;
    for (let q = 0; q < items.length; q++) {
      const it = items[q];
      const { x, kind, obj } = it, id = x.e.id, o = it.row * TUBE_TEXELS * 4;
      const ghost = x.ghost;
      const ra = it.ra;
      let c0, c1;
      if (x.isArt) c0 = c1 = artery;
      else {
        const a = toRGB(x.col ? x.col[0] : NEUTRAL, cs), b = toRGB(x.col ? x.col[1] : NEUTRAL, cs);
        if (kind === 'f' || kind === 'c') {
          if (obj.col) { c0 = toRGB(obj.col[0], cs); c1 = toRGB(obj.col[1], cs); }
          else {
            // A tributary takes its trunk's gradient where it lies along the trunk's chord.
            const P = geo[id].cur, A = P[0], B = P[P.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
            const q0 = it.pts[0], q1 = it.pts[it.pts.length - 1];
            c0 = mix3To(cpMixA, a, b, clamp(((q0[0] - A[0]) * dx + (q0[1] - A[1]) * dy) / L2, 0, 1));
            c1 = mix3To(cpMixB, a, b, clamp(((q1[0] - A[0]) * dx + (q1[1] - A[1]) * dy) / L2, 0, 1));
          }
        } else { c0 = a; c1 = ra ? toRGB(ra.col ? ra.col[1] : NEUTRAL, cs) : b; }
        // Coloring the blood by origin: the lumen steps back to a quiet grey so the parcels' colors read.
        if (originMode) c0 = c1 = ORIGIN_LUMEN;
      }
      let alpha = x.isArt ? 0.85 : kind === 'c' ? clamp(2 * T0 - 1, 0, 1) : kind === 's' || kind === 'f' ? (obj.live ?? 1) * clamp(1 - 2 * T0, 0, 1) : 1;
      const sinStrand = kind === 's' && SIN_EDGES.has(id);
      const tier = x.lifted && !x.back ? (x.front ? TIER_LIFT_FRONT : TIER_LIFT) : x.isArt ? TIER_ART : levelTier(x);
      // The network recedes to netA with a vessel selected (the lifted tier and the vessels behind the organs are not faded as a
      // group): the selected vessel eases out of that dimming and, deselected, back into it (selA), so it never snaps.
      if (x.back || tier >= TIER_LIFT) alpha *= netA + (1 - netA) * easeInOut(Math.max(vh.selA.get(id) || 0, ra ? vh.selA.get(ra.e.id) || 0 : 0));
      const shade = (!x.isArt || x.tube) && !ghost;
      const veil = IVC_EDGES.has(id) && !ivcOn, whole = IVC_EDGES.has(id) && ivcOn;
      const spec = shade && !veil && kind !== 'f' && kind !== 'c' && !CONTEXT_EDGES.has(id) && !x.back && x.width >= 3.4;
      const flags = (shade ? F_DIFFUSE : 0) | (spec ? F_SPEC : 0) | (!x.back && !x.isArt && !ghost && !veil ? F_SHADOW : 0) | (ghost ? F_DOTTED : 0) | (x.isArt && !x.tube ? F_NOCASE : 0) | (veil ? F_VEIL : 0) | (whole ? F_WHOLE : 0);
      const z = (kind === 'v' ? x.row + 0.5 : x.row) / GL_ROWS;
      colT[0] = c0[0]; colT[1] = c0[1]; colT[2] = c0[2]; colT[3] = c1[0]; colT[4] = c1[1]; colT[5] = c1[2];
      const k = colFollow.step(it.row, colT, colDt, !!lensFrom || reduceMotion.matches);
      const pair = shownPair(shownCol, it.row), s0 = pair[0], s1 = pair[1];
      s0[0] = k[0]; s0[1] = k[1]; s0[2] = k[2]; s1[0] = k[3]; s1[1] = k[4]; s1[2] = k[5];
      colRows.add(it.row);
      if (lensFrom) {
        const was = lensFrom.get(it.row), u = easeMove(clamp(((PACED ? easeNow() : now) - lensT0) / LENS_FADE, 0, 1));
        if (was) { mix3To(s0, was[0], s0, u); mix3To(s1, was[1], s1, u); }
      }
      shownCol.set(it.row, pair);
      // The sinusoids' strands are drawn faint and fine (sin-perfusion.js).
      if (sinStrand) alpha *= SIN_PERFUSION.fade;
      // (The portal tree carries a slightly heavier casing than the systemic side, PORTAL_CASING: how an atlas separates the system
      // it is about from the rest without colour. Looks review, 31 Oct.)
      tubeData[o] = s0[0]; tubeData[o + 1] = s0[1]; tubeData[o + 2] = s0[2]; tubeData[o + 3] = x.isArt && !x.tube ? 0 : x.wallPx * (x.front ? PORTAL_CASING : 1);
      tubeData[o + 4] = s1[0]; tubeData[o + 5] = s1[1]; tubeData[o + 6] = s1[2]; tubeData[o + 7] = alpha;
      tubeData[o + 8] = tier; tubeData[o + 9] = z; tubeData[o + 10] = flags; tubeData[o + 11] = 0;
      // Fades, as the SVG masks: into an organ (TIP_FADE), out of the plate, into a deeper vein,
      // tributaries toward the bowel they drain.
      const F8 = cpFade;
      let fade = false;
      if (kind === 'f') {
        const cfg = FEEDERS[id];
        if (obj.fadeMask && !x.feedJoined) { const yy = FEEDER_FADE_Y[id]; fade = put8(0, yy[0], 0, yy[1], 0, 1, 0, 1); }
        else if (obj.fan && cfg.fan) { const fan = cfg.fan, fr = fan.fade === undefined ? FAN_FR : fan.fade; fade = put8(fan.at[0], fan.at[1], fan.len * (fan.levels ? 2.7 : 1.35), 0, 0, fr[0], fr[1], 2); }
      } else if (x.tipFade) { const L = x.tipFade.line; fade = put8(L[0], L[1], L[2], L[3], 0, x.tipFade.joined ? 1 : x.tipFade.keep ? 0 : T0, 1, 1); }
      else if (x.endFade) { const L = x.endFade.line; fade = put8(L[0], L[1], L[2], L[3], 0, 1, 0, 1); }
      else if (kind === 'v' && IVC_JOIN[id]) { if (!ivcOn) { const J = IVC_JOIN[id]; fade = put8(J[0], J[1], J[2], J[3], J[4], J[5], J[6], J[7]); } }
      else if (FADE_DOWN_Y[id] && !(ivcOn && IVC_EDGES.has(id))) { const yy = FADE_DOWN_Y[id]; fade = put8(0, yy[0], 0, yy[1], 0, 1, 0, 1); }
      else if (SIN_FADE[id] && (kind === 'v' || kind === 's')) { const J = SIN_FADE[id]; fade = put8(J[0], J[1], J[2], J[3], J[4], J[5], J[6], J[7]); }
      else if (FADE_IN[id] && kind === 'v') { const J = FADE_IN[id]; fade = put8(J[0], J[1], J[2], J[3], J[4], 1, J[5] === undefined ? 0.3 : J[5], 1); }
      // The fades are drawn in the anatomy's coordinates: they let go as the circuit takes over.
      // (The tip fade already does: it is cleared in the circuit.)
      if (fade && T0 > 0 && !(kind !== 'f' && x.tipFade)) { F8[5] += (1 - F8[5]) * T0; F8[6] += (1 - F8[6]) * T0; }
      if (fade) for (let j = 0; j < 8; j++) tubeData[o + 12 + j] = F8[j];
      // The drawn stretch: a vessel drawing on (or retracting) grows along its flow. A tributary's arc length is its own
      // (not its trunk's), or its chevrons and streaks would run along it many times too fast and bunch into ticks.
      let lo = 0, hi = 1;
      if (x.reveal && kind !== 'f' && kind !== 'c') {
        const r = x.reveal, u = clamp((now - r.t0) / r.dur, 0, 1), off = r.out ? easeInOut(u) : 1 - easeInOut(u);
        if (r.dir > 0) hi = 1 - off; else lo = off;
      }
      if (kind === 'v' && ligatedAt(id)) lo = Math.max(lo, divideLen(id) / (it.len || geo[id].len || 1));
      tubeData[o + 20] = lo; tubeData[o + 21] = hi; tubeData[o + 22] = kind === 's' ? obj.len : kind === 'f' ? lenOfItem(it) || 1 : it.len || geo[id].len || 1;
      for (let j = 23; j < 28; j++) tubeData[o + j] = 0;
      let tint = kind === 'v' && cathTint?.[id], t0 = 0, t1 = 0;
      if (tint) { t0 = tint[0]; t1 = tint[1]; }
      if (ra && kind === 'v') {
        // On the cava drawn as one, each stretch's tint is placed along the whole.
        const f = it.f, tb = cathTint?.[ra.e.id], m = tintAlong;
        if (tint) { t0 = m(t0, 0, f); t1 = m(t1, 0, f); }
        if (tb) {
          if (tint) { t0 = Math.min(t0 < 0 ? 0 : t0, m(tb[0], f, 1 - f)); t1 = Math.max(t1, m(tb[1], f, 1 - f)); }
          else { t0 = m(tb[0], f, 1 - f); t1 = m(tb[1], f, 1 - f); }
          tint = true;
        }
      }
      if (tint) {
        const tc = toRGB(cathTint.col, cs);
        tubeData[o + 32] = tc[0]; tubeData[o + 33] = tc[1]; tubeData[o + 34] = tc[2]; tubeData[o + 35] = 1;
        tubeData[o + 36] = t0; tubeData[o + 37] = t1; tubeData[o + 38] = cathTint.soft; tubeData[o + 39] = 0;
      }
      writeGlowTexels(tubeData, o, kind, id, ra?.e.id, obj.len, glow.lit, vh.amt, cpRgb, easeInOut);
      // The selected vessel's standing out of the dimmed network (its tributaries' too); the cava and the vessels behind the
      // organs take it in their alpha above. Toward an end where another visible vessel joins and none of the selection, it
      // eases back into the network; a free end, or one into the rest of the selection, stays at full.
      const sa = tier < TIER_LIFT && !x.back && !SIN_EDGES.has(id) ? vh.selA.get(id) || 0 : 0;
      if (sa > 0) {
        tubeData[o + 48] = easeInOut(sa);
        // (Its ends' eases for a vessel, none for a tributary or strand; the row's last texel stays 0, cleared with the rest.)
        if (kind === 'v') { tubeData[o + 49] = selEnd(id, x.e.from); tubeData[o + 50] = selEnd(id, x.e.to); } else { tubeData[o + 49] = 0; tubeData[o + 50] = 0; }
      }
    }
  }
  function syncVeins(t) { return gpuProbe.time(null, 'vessel sync (script)', syncVeinsNow, t); }
  // The binning's key (the layout's version and the rows drawn, in order), built again only when one of them changed: it was a
  // string joined from every row on every sync (2 Nov 2026). The same string as before, so every reset to '' still re-bins.
  let binKeyRows = new Int32Array(64), binKeyN = -1, binKeyGeo = -1, binKeyStr = '';
  function binKeyOf(items) {
    let same = binKeyGeo === geometryVersion && binKeyN === items.length;
    if (same) for (let q = 0; q < items.length; q++) if (binKeyRows[q] !== items[q].row) { same = false; break; }
    if (same) return binKeyStr;
    if (binKeyRows.length < items.length) binKeyRows = new Int32Array(items.length * 2);   // alloc-rare: more vessels than ever drawn
    for (let q = 0; q < items.length; q++) binKeyRows[q] = items[q].row;
    binKeyN = items.length; binKeyGeo = geometryVersion;
    binKeyStr = `${geometryVersion}|` + items.map((it) => it.row).join(',');   // alloc-rare: only when the layout or the rows changed
    return binKeyStr;
  }
  function binningStep(items, key, grew) {
    morphOff();
    if (morph !== morphTarget) mt.stats.cpu++;
    vBinKey = key;
    // A vessel that outgrows its reach gets a quarter more room than it needs: a widening vein (a congested IVC easing
    // in over a slide) was re-binned and its geometry uploaded again at every 2 px of growth, about 4 MB each time, a
    // hundred times in one slide change. (The reach only says which cells list a vessel; the drawing is unchanged.)
    const reachNext = vBinSpare;   // (the reach map is kept in two, written into the spare and swapped: the old one is read while the new is filled)
    reachNext.clear();
    for (let q = 0; q < items.length; q++) { const it = items[q]; reachNext.set(it.row, grew ? Math.max(vBinReach.get(it.row) || 0, Math.ceil(reachOf(it) * 1.25 / 2) * 2) : reachOf(it)); }
    vBinSpare = vBinReach; vBinReach = reachNext;
    const J = veinJoins(items), smooth = smoothRunOn(items);
    joinRoom(J, items);
    for (const it of items) if (it.kind === 'v') { it.obj.glPts = smooth.get(it.row) || it.pts; }
    // (Binned against the last binning: a coiling collateral re-tests only its own cells, and when nothing the GPU holds
    // changed (another vessel's coil easing while it is hidden), nothing is uploaded.)
    binList.length = items.length;
    for (let q = 0; q < items.length; q++) binList[q] = binTube(items[q], smooth.get(items[q].row) || items[q].pts, binTubeOf(q));
    const bins = binVeins(binList, J, binMemo);
    // (Patched in place, only the rows that changed go up again: the cells and every other entry are as uploaded.)
    // (A patch changes only the cells of the vessels and joins it wrote again (veins-gl patchGeometry): they are drawn again as vessels
    // whose radii changed are, veinsRows, instead of the whole layer. A whole binning draws the whole layer, as before.)
    // (The same bins as shown, a binning that found nothing the GPU holds changed, draw nothing: a coil easing on a hidden
    // vessel moved the geometry's version at every model frame for 20–35 s after a patient change, and each was a whole draw.)
    let patched = null, whole = false;
    if (bins !== binShown) {
      if (bins.patch && binShown?.ent === bins.ent) { veins.patchGeometry(bins); if (bins.patchRows) patched = bins.patchRows; else whole = true; } else { veins.setGeometry(bins); whole = true; }
      binShown = bins;
    }
    // (Each axis's curvature with it, so the flow arrowheads keep their shape on a bend: veins-gl chevAt.)
    if (bins !== bendShown) { bendShown = bins; for (const it of items) veins.setBend(it.row, smooth.get(it.row) || it.pts); }
    if (patched) for (const r of patched) veinsRows.add(r);
    else if (whole) tubesNew = true;
    if (morph === morphTarget) { mt.reach[morphTarget] = new Map(vBinReach); morphTrackSoon(); envSoon(); }
  }
  const VLOOK = { shOff: [1.4, 2.8], light: LIGHT, reach: 0, organs: 0, casing: [0, 0, 0, 0], shadow: [0, 0, 0, 0], sheen: [0, 0, 0, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 0, fx: true, tierAlpha: TIER_ALPHA, tierGroup: TIER_GROUP, fluid: null, map: MAP, plate: null };   // alloc-rare: kept, made once for the stage
  const lookRgba = (out, rgb, a) => { out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2]; out[3] = a; };
  const LOOK_SIG = newLookSig();   // (what the look held at the last sync that drew it: look-sig.js)
  function syncVeinsNow(t) {
    if (!veins || veins.lost) { colEasing = false; return; }
    glowSync = false;
    // (Here the GPU holds its context: the guard above. `gl-on` is the class of that: set when the GPU was made or its context came back, taken off
    // when it was lost (webglcontextlost). `gl-plate` follows what the GPU holds of the plate, looked at when it said that changed.)
    const plateWas = plateOn();
    if (plateDirty) { plateDirty = false; wrap.classList.toggle('gl-plate', veins.hasPlate(0)); }
    syncOrganDim();
    if (!glOrgans) {
      // The organ covers, painted once on the GPU into their world-space texture (1.5 texels per unit): tiers behind them fade.
      // (They were drawn on a 2D canvas and uploaded.)
      veins.paintOrgans(getOrganCovers().map(({ src, w }) => ({ ...src, w })), [0, 0, VIEW.w, VIEW.h], 1.5);
      glOrgans = true; tubesNew = true;
    }
    const items = gpuProbe.time(null, 'vessel sync: list', glItems, GLI_SYNC);
    const cs = wrapCS();
    const mode = layerMode();
    // A jump in the model (a new patient, Undo or History, a time jump, Compare's Then and Now, Settle) recolours the vessels
    // through the same crossfade as a lens change, instead of in one frame (round 2 review, B6): a frame whose pressures moved
    // by more than JUMP_MMHG anywhere since the last one drawn. The running model's own steps (well under that) are drawn as
    // they come.
    // (So does a held reversal turning in the Direction lens: B3.)
    const jumped = modelJumped(F), flipped = revFlip && mode === 'direction';
    revFlip = false;
    if (((lensMode && mode !== lensMode) || jumped || flipped) && !reduceMotion.matches) { lensFrom = shownCol; lensT0 = lensNow(); }
    lensMode = mode;
    if (lensFrom && !lensFading()) lensFrom = null;
    shownCol = nextShown();
    gpuProbe.time(null, 'vessel sync: radii', sendRadii, items);
    // Geometry: re-binned when the layout, the set of vessels or a vessel's reach grows.
    const key = binKeyOf(items);
    let grew = false;
    if (key === vBinKey) for (let q = 0; q < items.length; q++) if (reachOf(items[q]) > (vBinReach.get(items[q].row) || 0)) { grew = true; break; }
    // (Between the views, a binning made ahead for this stretch of the change, the frame's points sent up in a few rows: morphFrame.)
    if ((key !== vBinKey || grew) && gpuProbe.time(null, 'vessel sync: morph frame', morphFrame, items)) vBinKey = key;
    else if (key !== vBinKey || grew) gpuProbe.time(null, 'vessel sync: binning', binningStep, items, key, grew);
    // Attributes, every frame. (Allocation-free, 2 Nov 2026: the pass wrote each vessel's texels through array literals and spreads,
    // mapped its colours, mixed them into new arrays and kept them in a new Map every frame; now the numbers go straight into
    // tubeData and into kept colour pairs, colPass below, in the same arithmetic.)
    cpT0 = easeInOut(morph); cpNow = performance.now(); cpCs = cs;
    cpArtery = toRGB('var(--artery)', cs);
    cpOrigin = originOn();
    const T0 = cpT0;
    tubeData.fill(0);
    // Selecting or spotlighting any part of the IVC shows it whole: no veil and no organ fading it, and no fades on it or on the
    // tributaries joining it. It stays in its own tier (behind the network), as the body has it: the portal tree, which lies in front
    // of the cava, and the hepatic veins that end on it still draw over it where they cross (it was lifted above them, 1 Nov).
    cpIvcOn = false;
    for (let q = 0; q < IVC_LIST.length; q++) { const id = IVC_LIST[q]; if (E[id] && (E[id].sel || vh.selA.get(id) > 0)) cpIvcOn = true; }
    // (The colours' filter steps by the time since the last sync: every display frame while it moves, colEasing. From rest the
    // first step is at most one 60 Hz frame, whatever time has passed since the figure last synced, so an ease starts gently.)
    cpDt = Math.min(colEasing ? 0.1 : 1 / 60, (cpNow - (colAt || cpNow)) / 1000);
    colAt = cpNow; colFollow.begin(); colRows.begin();
    cpItems = items;
    gpuProbe.time(null, 'vessel sync: colours', colPass);
    cpItems = null; cpCs = null;
    colEasing = colFollow.moving;
    colFollow.prune(colRows);
    // (Uploaded only when some vessel's attributes changed: most model frames in a steady state change none.)
    let tubesChanged = !tubesShown || tubesShown.length !== tubeData.length;
    if (!tubesChanged) for (let i = 0; i < tubeData.length; i++) if (tubeMoved(tubeData[i], tubesShown[i])) { tubesChanged = true; break; }
    if (tubesChanged) veins.setTubes(tubeData);
    // (The look handed to the vessels' painter: one kept object and its colour lists, written in place each sync; its signature is numbers
    // compared with the last one's, lookChanged, not text made of it.)
    const vl = VLOOK;
    vl.reach = glow.lit.size ? 20 : 11; vl.organs = 1 - T0; vl.fluid = fluidLook;
    lookRgba(vl.casing, cssTriplet(cs, '--casing-rgb'), cssNum(cs, '--casing-a', 0.56));
    lookRgba(vl.shadow, cssTriplet(cs, '--shadow-rgb'), cssNum(cs, '--shadow-a', 0.15));
    lookRgba(vl.sheen, toRGB('var(--light-ink)', cs), cssNum(cs, '--tube-sheen', 0.42));
    lookRgba(vl.shade, toRGB('var(--tube-shade-ink)', cs), cssNum(cs, '--tube-shade', 0.2));
    lookRgba(vl.ring, olCol = toRGB('var(--accent)', cs), 0.34);
    vl.netAlpha = netA;
    vLook = vl;
    syncMapInk(cs);
    syncPlateLook();
    // The vessel layer is drawn again only when what it is drawn from changed: a running model sends a frame about ten
    // times a second, and in a steady state most of them leave every vessel's colour, width and fade exactly as they were.
    const lookDiffers = lookChanged(vl, plateOn(), LOOK_SIG);
    // Most of those that do change only a few vessels' colours (the pulse), and the vessel layer then redraws only those
    // vessels' cells (veinsRows; see drawVeins): a whole redraw at a Retina size is the heaviest thing the figure draws.
    if (tubesNew || lookDiffers || !tubesShown || tubesShown.length !== tubeData.length) {
      veinsDirty = true;
      if (tubesChanged) tubesShown = tubeData.slice();
    } else if (tubesChanged) {
      const W = TUBE_TEXELS * 4;
      for (let o = 0; o < tubeData.length; o += W) {
        for (let i = o; i < o + W; i++) if (tubeMoved(tubeData[i], tubesShown[i])) { veinsRows.add(o / W); tubesShown.set(tubeData.subarray(o, o + W), o); break; }
      }
    }
    tubesNew = false;
    const gm = glowMemoObj;
    gm.items = items; gm.t = t; gm.netA = netA; gm.cs = cs; gm.mode = mode; gm.origin = cpOrigin; gm.cath = cathTint; gm.F = F; gm.geo = geometryVersion;
    gm.plate = veins.hasPlate(0); gm.cls = wrapCls(); gm.bits = glowBits(items, 0); gm.reach = vLook.reach;
    gm.selK = selAKey();   // (the selection's ease sets the vessels' alpha, which the glow-only sync does not write)
    gm.wide.length = items.length;   // (the sheen's width: syncRadiiOnly)
    for (let q = 0; q < items.length; q++) gm.wide[q] = items[q].x.width >= 3.4;
    glowMemo = gm;
    // The SVG organs just hid for the GPU plate: draw it now, so no frame shows neither.
    if (!plateWas && plateOn()) drawVeins(false, 'plate shown');
  }
  /** Redraws the vessel layer (and the picture) if anything in it changed; true when it did. `by`: who asked (gpu-probe.js BY). */
  function drawVeins(fullComposite = false, by = 'frame') {
    // (For the ?perf readout: the caller, counted with each whole draw and each target sized again in it.)
    const byWas = gpuProbe.by;
    gpuProbe.by = by;
    try { return drawVeinsNow(fullComposite); } finally { gpuProbe.by = byWas; }
  }
  // (Kept, written in place each draw: the view's six numbers in canvas pixels, the same six in stage pixels, the rows to name, and none.)
  const drawT = [0, 0, 0, 0, 0, 0], glMBuf = [0, 0, 0, 0, 0, 0], pendRows = [], NO_ROWS = [];
  const pendPush = (r) => { pendRows.push(r); };
  function rowsShown() { for (let i = 0; i < pendRows.length; i++) veinsRows.delete(pendRows[i]); }
  function drawVeinsNow(fullComposite) {
    if (liveSet || liveOn()) { syncLiveOrgans(); if (liveSet) veins.organs.shift('bowel', bowelDy()); }
    if (!veins || veins.lost || !vLook || !F) return false;
    if (!CTM) refreshCTM();
    const m = CTM;
    const T = drawT;
    // (A card's zoom at rest on its landing, zoomSharp: the layer is drawn for the view the scene camera has carried it to, C after the view, so it is
    // sharp; the layout still reads the rest view (CTM). C is a scale S and a move in stage px: p' = S p + (tx, ty).)
    const dc = drawCam, S = dc ? dc[0] : 1, tx = dc ? dc[4] : 0, ty = dc ? dc[5] : 0;
    T[0] = vdpr * S * m.a; T[1] = vdpr * S * m.b; T[2] = vdpr * S * m.c; T[3] = vdpr * S * m.d; T[4] = vdpr * (S * (m.e - wrapRect.left) + tx); T[5] = vdpr * (S * (m.f - wrapRect.top) + ty);
    subPixel(T);
    // (R04: the view the layer was drawn in is kept as numbers (thousandths) and compared one by one; a new view gets a new number
    // as its key. Nothing is joined into a string on a camera frame.)
    const key = viewSame(T, vCanvas.width, vCanvas.height) ? veinsDrawKey : ++viewKeyN;
    // The rows changed since the layer was drawn, taken once and kept until a draw has shown them: a refused partial draw
    // passes them on to the whole draw that stands in for it, and they are let go only once one of the two has drawn.
    pendRows.length = 0;
    if (veinsRows.size) veinsRows.forEach(pendPush);
    const pending = pendRows.length ? pendRows : null;
    if (!veinsDirty && key === veinsDrawKey) {
      if (!pending) return false;
      // Only some vessels' attributes changed: their cells alone are drawn again (the same picture as a whole redraw).
      if (veins.drawRows(T, vLook, bloodLook(), pending, fullComposite)) { rowsShown(); return true; }
    }
    if (key !== veinsDrawKey) {
      settleRes();   // (the view moved: Figure resolution looks again once it settles)
      if (figOpt('adapt')) noteMoveFrame();
      if (plateOn()) schedulePlateView();
    }
    // (Moved with only some vessels' attributes changed, those vessels are named: a drag while the model plays still
    // moves the drawn layer, and draws their cells again, rather than drawing it all.)
    const rows = veinsDirty ? null : pending || NO_ROWS;
    veinsDirty = false; veinsDrawKey = key; viewKeep.set(viewNext); rowsShown();
    glMBuf[0] = S * m.a; glMBuf[1] = S * m.b; glMBuf[2] = S * m.c; glMBuf[3] = S * m.d; glMBuf[4] = S * (m.e - wrapRect.left) + tx; glMBuf[5] = S * (m.f - wrapRect.top) + ty;
    glM = glMBuf;
    // (Settings › Figure performance › Pinch frame reuse (frame.js): only while a hand zooms; a frame that laid the last picture again
    // leaves the layer to be drawn whole, so the view a pinch stops at is always shaded afresh.)
    const reuse = figLab('pinchReuse');
    veins.setReuse?.(reuse, !!reuse && gestureOn());
    // (Vessels lower while pinching: likewise only while a hand zooms, and a frame drawn lower leaves the layer to be drawn whole.)
    const low = figLab('pinchLow');
    // (Quality tiers, adapt-tier.js (R07): under deadline pressure every zoom frame of a move, a hand's or a glide's, draws the layer at
    // the tier's share inside targets made once at the top tier's size; the view a move stops at is drawn at Full. ?tiers=0: off.)
    // (Not through the change between the views: its frames drawn lower and the landing at Full read as a flicker, soft then sharp, on the figure.)
    // (B3, pure-gpu-plan: while the camera glides, a hand or wheel zooms, or the figure morphs between the views, the vessels, blood and organs are drawn at
    // MOTION_K of the layer's width and height and stretched in the present; labels, lines and glass are on their own layers, at Full. The frame that
    // lands (morph at its target, the gesture over) draws the layer whole, and `soft` keeps the page awake until it has. Not in a dive, the lobule or a card's zoom.)
    // (A hand's move only (4 Nov 2026, Mohammad: "the slide figure flickers intermittently"). A glide the app runs steps its camera at 60 Hz
    // (the governor), so on a 120 Hz screen every other frame has the same camera: those skip the lower pass and the beat's radius patches
    // draw the layer whole, so the figure went soft, sharp, soft at 60 Hz through every slide change, and popped sharp as it landed. A morph
    // between the views is left whole for the same reason as the tiers above.)
    const morphing = morph !== morphTarget;
    const moving = TIERS_ON && !morphing && gestureOn() && !(diveT > 0) && !lobuleOn && !drawCam && !lz?.isOpen();
    const tk = TIERS_ON && !morphing ? tierK() : 0, mk = moving ? motionK() : 0;
    const lk = tk && mk ? Math.min(tk, mk) : tk || mk;
    veins.setLow?.(lk || (low ? PINCH_LOW_K : 0), lk ? true : low && gestureOn(), TIERS_ON ? TIER_TOP : 0, false);
    veins.draw(T, vLook, bloodLook(), rows);
    if (veins.reused || veins.soft) veinsDirty = true;
    return true;
  }

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
  // Drops the plate rasters and shows the live SVG organs. The vessel layer is redrawn in the same
  // task (after the model update in progress), so no frame shows the SVG organs over the old GPU
  // plate: the two, and the ascites, would add up to a bright flash.
  let plateRedraw = false, plateDrops = 0;
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
  const { SEL_DIM, clientToWorldFast, figureHidden, organPathsNow, paintOrganAlpha, plateEasing, platePoke, plateStateKey, readGroup, schedulePlateView, stepPlateEase, syncLiveOrgans, syncOrganDim, syncPlateLook } = createPlate({ EBOX, LAYER_SPENT, LENS_FADE, LIVE_LAYERS, LIVE_ORDER, PLATE_BASE, PLATE_RECT, bakeStep, bowelDy, defs, drawVeins, dropViewKeep, easeInOut, flag, flank, fullOk, gBackdrop, gOrgans, ghost, glWanted, gpuOrgansOn, gutKids, hidePlate, lensNow, liveOn, liverTint, lv, nextFrame, organEls, organG, plateOn, readFluidInk, readFrame, refreshCTM, setG, spleenMoving, spleenMv, spot, spotOn, stageBox, stageWrap, svg, themeKey, vCanvas, wrap, wrapCS, wrapCls }, live);
  let layerStarts = 0, layerStartsEasing = 0;   // (for the tests: organ pictures begun, and those begun while the fluid eased)
  let layerCommits = 0;
  let liveKeyWas = '', liveSet = false;   // (liveKeyWas: '' for none, 'kept' while liveKeyOld holds the last key's parts)
  let plateStale = false;
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
  // A vessel that opened or closed while the figure was covered draws on or off from that moment, not when it is shown again (followHidden).
  let fxAt = null;
 
  let clampLast = 0;
  let markLast = 0;

   // Deck visuals, package F (ext-callouts.js): a slide's figure callouts, or null. live: an edge mark's words by
  // `${edge}|${kind}`; organs: marks on organs; calipers; steps (the glow's first entry's vessels: its order is numbered, V10);
  // spans and zone, on the circuit (V25). Each piece of words is { runs: [{ t, sp, tone? }], wide, label }: wide, the same words at
  // their widest, is the room its pill keeps, so a number ticking never moves or resizes it (fxPill).
  let fx = null, fxSig = '';




  let revF = null, revH = null, revT = 0, revP = null, revFlip = false;


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
  const frostSeq = () => (frostLiver ? `l${frostLiver.seq()}` : lzInFigure() ? `${veins.drawSeq}.${lzGlassSeq()}` : veins.drawSeq);
  // (The lobule drawn in the figure's own canvas: the glass is drawn over it there, with no hand-over to the lobule's canvas; its pictures count with the figure's.)
  // (The lobule's pictures count for the glass at most every 80 ms: a pan or pinch inside it drew one a frame, and the glass blurred the figure again
  // for each, over every card. One more is asked for after the last, so the frost always ends on the picture that stands.)
  let lzSeqN = 0, lzSeqLast = -1, lzSeqAt = 0, lzSeqT = 0;
  const lzGlassSeq = () => {
    const sq = lz.drawSeq();
    if (sq === lzSeqLast) return lzSeqN;
    const now = performance.now();
    if (now - lzSeqAt >= 80) { lzSeqLast = sq; lzSeqAt = now; lzSeqN++; }
    else if (!lzSeqT) lzSeqT = setTimeout(() => { lzSeqT = 0; if (veins && !veins.lost) veins.present(true, true); }, 90);
    return lzSeqN;
  };
  // (4 Nov 2026, Mohammad: "Keep it glass through and through any zoom". The lobule and the sinusoid are passes of the figure's own context whenever it has one (lobule-zoom.js ensureGL: shared is simply "the figure has a top"), so the glass is never let go through a dive or a zoom, even before the lobule has made its renderer.)
  const lzShares = () => !!lz?.shared || (!!veins?.top && !veins.lost);
  const lzInFigure = () => !!lz?.shared && (lobuleOn || lz.isShown());
  // (Mac heat R2: the frost blurs again only once the blood has moved FROST_EVERY frames on; the count handed over is the real one, so the dirty squares still cover the frames between.)
  const FROST_EVERY = 3, thirdSeq = () => { let held = -Infinity; return () => { const q = veins.bloodSeq; if (q < held || q - held >= FROST_EVERY) held = q; return held; }; }, frostFresh = (() => { const t = thirdSeq(); return () => (frostLiver ? 0 : t()); })();
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
  const NO_OVER = [], noOver = () => NO_OVER;   // (no box lies over a card's glass: a list read by the glass, never written)
  const cardGlass = (cards) => {
    if (!veins?.top) return null;
    // (The figure's callouts (cards.callouts): the same renderer with the callouts' own ways: drawn while the figure is on, from the figure's own
    // pictures and blood, in the turn between the cards' two, over what lies over the callouts, and their holes in the labels under 'callouts'.)
    if (cards.pane) {
      const g = createGlassGL(wrap, vCanvas, [], { software: SOFTWARE, cards, live: () => wrap.classList.contains('gl-on'), version: () => veins.drawSeq, fresh: thirdSeq(), dirty: (a, b, o) => veins.bloodDirty(a, b, o), onFigure: (f) => veins.onPicture(f) });
      if (!g) { wrap.dataset.pane = 'css'; return null; }
      hostFrost(g, { order: 0, over: () => frostOver('pane') });
      paneGL = g;
      const dispose = g.dispose;
      g.dispose = () => { if (paneGL === g) paneGL = null; frostHosts.delete(g); dispose(); };
      return g;
    }
    if (cards.callouts) {
      const g = createGlassGL(wrap, vCanvas, [], { software: SOFTWARE, cards, live: () => wrap.classList.contains('gl-on'), version: () => veins.drawSeq, fresh: thirdSeq(), dirty: (a, b, o) => veins.bloodDirty(a, b, o), onFigure: (f) => veins.onPicture(f), onHoles: frostHoles('callouts') });
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
    const g = createGlassGL(wrap, vCanvas, [], { software: SOFTWARE, cards, live: () => !!frostLiver || (wrap.classList.contains('gl-on') && (lzShares() || (!anatCovered() && !(diveT > 0)))), version: frostSeq, fresh: frostFresh, dirty: (a, b, o) => veins.bloodDirty(a, b, o), onFigure: (f) => veins.onPicture(f), onHoles: frostHoles(key) });
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
  const { LABEL_GLIDE_MS, siteLeave, sitesPaint: sitesPaint$ } = createSitesPaint({ NI, NO_LIST, RES_BIT, SITE_DEF, SITE_EL, SITE_TPL, SPLIT_B, beatMean, breath, easeFrame, easeInOut, late, nextFrame, nodePos, pinned, readFrame, refreshCTM, resMade, resPaint, resRatio, sites, stageBox, viewMoving, watch, worldToLocalInto }, live);
  function sitesPaint(...a) { return sitesPaint$(...a); }   // <stage-split stub>
  const { scan, scanCardsRead, scanPaint, scanTick, scanTipLocal, setScanProbe } = createScan({ NO_LIST, SCAN_BOX, gMatrix, late, nextFrame, organEls, organG, readFrame, refreshCTM, sites, stageBox, viewMoving, watch }, live);
  // ── The Doppler probe (dop-probe.js) ──
  // While the Doppler reads a vessel, a small probe stands off it, its line of sight runs straight through the vessel, and the sample
  // volume's two bars and the flow axis mark the vessel's middle (where its callout points), or a stent's sampled third. It
  // follows the camera with the labels; it fades out while the views morph and in the liver's own views. A new vessel or third, or
  // a card making it change sides, fades it out where it stood and back in at its new place (nothing jumps).
  let dprCardsList = [], dprCardsAt = -1e9, lbRects = [], colShown = false, colWaitAt = 0;   // colShown: a stent's three point callouts stand (the probe keeps off them, so it waits for them)
  const { dprDots, dprHold, dprLet, dprMake, dprobePaint, smooth01 } = createDoppler({ E, EV, arcMid, cath, clampW, dop, dpr, geo, nextFrame, olKey, olRings, organEls, pointAt, readFrame, scanCardsRead, sites, stageBox, unseenCard, viewMoving, watch, worldToLocalInto }, live);
  const { NO_BLK, cathAt, cathFadeOut, cathFocus, cathFollow, cathLabelsNow, cathLabelsSoon, cathPaint, cathRadOf, cathRoom, cathRoute, procIn } = createCath({ E, NO_LIST, animateVT, appEl, applyVT, blockersRead: (...a) => blockersRead(...a), cardSpace, cardSpaceRead, cath, clientToVB, clientToVBFast, drawFrame, easeFrame, easeInOut, geo, glWanted, late, nextFrame, polyD, readBlockersRead: (...a) => readBlockersRead(...a), readFrame, refreshCTM, safeInsets, stageBox, syncVeins, toRGB, worldToLocalInto, wrap, wrapCS }, live);
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
  let balloonSqueeze = 1;

  // ── Labels: a screen-space layer (SVG) laid out every frame ──
  // Text keeps a constant on-screen size whatever the zoom. Every label is a block with a
  // priority and a list of candidate positions; blocks are placed greedily, most important
  // first, and a block that cannot be placed without a collision is dropped. Anatomy on a wide
  // stage uses atlas columns in the margins with leader lines; everything else is placed
  // around its anchor. The same layer is serialized into exported figures.
  const labelSvg = wrap.querySelector('#labels');
  if (HOVER_LINK) labelSvg.classList.add('hovlink');   // (the hover link's look in app.css hangs on it: hover-link.js; ?hoverlink=0 leaves the layer as it was)
  // Frosted pane behind the liver card: a backdrop blur needs an HTML element, and the labels are SVG.
  const glass = h('div', { class: 'lb-glass', 'aria-hidden': 'true', hidden: true });
  labelSvg.before(glass);
  // (Drawn on the GPU under the labels while it can be, as the callouts' glass is: glass-gl.js.)
  let paneGL = null;   // (a region of stage.glass.add, made by cardGlass with cards.pane; set there)
  let glassWant = ['', ''], glassSizing = 0;
  const sizeGlass = () => { glassSizing = 0; glass.style.width = glassWant[0]; glass.style.height = glassWant[1]; };
  onFigLab((k) => { if (k === 'glassCache') { glassGL?.redraw(); paneGL?.redraw(); for (const g of cardGLs) g.redraw(); } });
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
    clearTimeout(artLiteT);
    const want = figLab('lightArt');
    if (want === artLite || artLiteOff) return;
    if (want && !liteLoad?.mod) { liteLoad ||= import('./organ-art-lite.js').then((m) => { liteLoad.mod = m; syncArtLite(); }, () => { liteLoad = null; }); return; }
    if (artLiteBusy()) { artLiteT = setTimeout(syncArtLite, 1000); return; }
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
  wrap.dataset.pane = veins && !SOFTWARE ? 'gpu' : 'css';
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
  const frostWake = () => { glassGL?.redraw(); paneGL?.redraw(); for (const g of cardGLs) g.redraw(); };
  const LABELS_ORDER = -6;   // (over the lobule's and sinusoid's pictures and their captions, under the glasses at 0 … 3: veins-gl top.add)
  const labelHost = () => {
    const top = veins?.top;
    return top ? { gl: top.gl, canvas: top.canvas, ask: () => veins?.top?.present(), now: () => veins?.top?.present(), active: () => !!veins?.top && !veins.lost && wrap.classList.contains('gl-on'), scale: () => vCanvas.width / (stageBox().width || 1), layerAlpha: true } : null;
  };
  let labelGL = null, labelPassOff = null;
  const { PIN_DIR, labelPass, pinKind } = createLabelHost({ E, LABELS_ORDER, arcMid, easeInOut, frostWake, gLabels, gLeaders, gScan, geo, labelAnchor, labelHost, labelSvg, morphAnchorAt, nodePos, refreshCTM, worldToLocalInto, wrap }, live);
  // The frosted glasses drawn inside the figure's canvas (round 2, 2.1, 31 Oct): each glass's blur is taken from the picture the vessel
  // renderer has just laid in its own context (veins-gl top), so nothing is copied off the GPU, and the glass's own canvas (the
  // callouts', the liver pane's) or the browser's blur (the Present cards') is not needed. Drawn in the page's order: the pane (under the
  // labels), the teaching card's shade, the callouts, the other cards. A glass is drawn there only while nothing the page lays between
  // the figure's canvas and it crosses it (frostOver): those would show sharp through it. Otherwise, and around each change of the
  // canvas (a resolution's fade, a dive, the lobule), the callouts and the pane go back to their own way (?glasscopy=1: their own canvas,
  // from a copy, as before 31 Oct; by default the browser's glass) and a card to the browser's glass.
  let frostHold = false;
  // (2 Nov 2026, the iPhone trace: the glass asked the figure's canvas for its computed look on every frame it drew, which made the
  // browser restyle the page there and then, mid-frame. The look is read between frames instead: once at the start, after any write to
  // the canvas or what holds it, and when one of its transitions or animations ends; while one runs the canvas counts as easing, so no
  // glass is taken from it.)
  const vcLook = () => {
    const vc = getComputedStyle(vCanvas);
    return vc.display !== 'none' && vc.visibility === 'visible' ? '' : 'the figure\'s canvas is hidden';   // (its fades are alpha in the renderer's present, never CSS opacity)
  };
  let vcWhy = null, vcPass = 0, vcEasing = 0;
  // (2 Nov 2026, Mohammad's iPhone: "fix the backgrounds", the teaching card a flat solid slab at rest. vcEasing counted the canvas's
  // transitions and animations by their start and end events; one start without its end (Safari sends none for a transition replaced
  // or dropped as its element changes, an animation that loops) left it above 0 for good, and every card's glass flat until a reload.
  // Read again between frames, it is now taken from the canvas's own running animations, and a start is looked at again a little after
  // its longest ease would have ended.)
  function readVcLook() { vcPass = 0; vcWhy = vcLook(); vcEasing = vCanvas.getAnimations?.().filter((a) => a.playState === 'running').length ?? vcEasing; frostWake?.(); }
  function vcStale() { if (!vcPass) vcPass = restPass(readVcLook); }
  {
    const vcMo = new MutationObserver(vcStale);
    for (let e = vCanvas; e && e.nodeType === 1; e = e.parentElement) vcMo.observe(e, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-theme', 'data-palette'] });
    const vcIn = (ev) => { if (ev.target === vCanvas) { vcEasing++; setTimeout(vcStale, 1600); } };
    const vcOut = (ev) => { if (ev.target === vCanvas) { vcEasing = Math.max(0, vcEasing - 1); vcStale(); } };
    vCanvas.addEventListener('transitionrun', vcIn); vCanvas.addEventListener('animationstart', vcIn);
    for (const t of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) vCanvas.addEventListener(t, vcOut);
    vcWhy = vcLook();
  }
  // (frostWhy: '' while the figure's canvas takes glass, else the first thing that stops it, in words for the ?perf blur gauge.)
  // (cards: the cards' glass stays drawn through a resolution's fade, never let go: the picture kept for the fade has the
  // cards' glass in it where it stands, and the glass drawn over the fade covers it (inside its box the glass is opaque), its blur taken
  // from the new picture (each glass's blur is taken before the fade is laid over it: veins-gl tops, every prep before any draw). Before, every card went flat for the fade's 420 ms, which with Figure resolution on Auto
  // is every zoom's settle (review/ui-gpu-review-opus-2nov.md: "the card visibly switches from frosted to flat and back").)
  const frostWhy = (cards = false) => {
    if (frostHold && !cards) return 'a change of canvas is under way';
    if (!veins?.top) return 'the figure has no canvas to draw into';
    // (In the liver the glass is drawn into the lobule's or the open sinusoid's own GPU canvas (lobule-zoom.js glassHost), never let go
    // to a flat card: Mohammad, 2 Nov 2026, Circulation 6 on the iPhone, "No blur at all on top, solid card on bottom".)
    if (wrap.classList.contains('in-lobule')) {
      const src = lz?.glassHost?.() || null;
      if (src) {
        if (frostCtx !== src.gl) { rehostSoon(); return 'the glass is moving to the liver\'s canvas'; }
        return '';
      }
      if (!lzShares()) return 'the lobule is moving';   // (drawn in its own canvas, which has none to give for now; in the figure's context the glass goes on there)
    }
    if (frostLiver || frostCtx !== veins.top.gl) { rehostSoon(); return 'the glass is moving back to the figure\'s canvas'; }
    if (veins.lost) return 'the GPU context is lost';
    if (diveT > 0 && !lzShares()) return 'the dive is under way';   // (the lobule drawn in the figure's own context: the dive is a pass of its present, the glass stays frosted)
    const wc = wrap.classList;
    if (!wc.contains('gl-on')) return 'the GPU figure is not showing';
    if (wc.contains('unframed')) return 'the figure is unframed';
    if (vcWhy == null) { vcStale(); return 'the figure\'s canvas is being read'; }
    return vcWhy;
  };
  const frostOn = () => !frostWhy();
  const frostHost = (o, src = null) => (src
    ? { gl: src.gl, canvas: src.canvas, add: src.add, warmIn: src.warmIn, now: src.now, active: frostOn, why: frostWhy, view: () => null, ...o }
    : { gl: veins.top.gl, canvas: veins.top.canvas, add: veins.top.add, warmIn: veins.top.warmIn, now: () => { if (veins && !veins.lost) veins.present(true, true); }, active: frostOn, why: frostWhy, view: () => veins?.viewKey ?? null, ...o });
  // (Every glass moved together to the canvas the frost is taken from now: the liver's (lobule-zoom.js glassHost) while it shows, else
  // the figure's. Between frames, never inside the glass's own frame, which asked.)
  let rehostT = 0;
  function rehostSoon() {
    if (rehostT) return;
    rehostT = setTimeout(() => {
      rehostT = 0;
      if (!veins?.top) return;
      const src = wrap.classList.contains('in-lobule') ? lz?.glassHost?.() || null : null;
      if (wrap.classList.contains('in-lobule') && !src) return;
      if (src ? frostCtx === src.gl : frostCtx === veins.top.gl && !frostLiver) return;
      frostLiver = src;
      frostCtx = src ? src.gl : veins.top.gl;
      for (const [g, o] of frostHosts) g.setHost(frostHost(o, src));
      frostWake();
    }, 0);
  }
  // The ?perf blur gauge's question: why the browser's blur, not a glass drawn in the figure's canvas, shows on `el` (null: no glass
  // here is meant to own it, as the toast or the fold chip; '' : its glass is drawn, a mark is about to be set).
  const blurWhy = (el) => { for (const g of [glassGL, paneGL, ...cardGLs]) { const w = g?.why?.(el); if (w != null) return w; } return null; };
  // Where the glass drawn for `el` stands now ({ left, top, width, height }), for a check that compares it with the card (null: none is drawn for it).
  const glassBox = (el) => { for (const g of [glassGL, paneGL, ...cardGLs]) { const b = g?.boxOf?.(el); if (b) return b; } return null; };
  // (Each glass and what it was set with: set again on a new renderer, after a lost context is restored.)
  const frostHosts = new Map();
  // (On since 1 Nov 2026 (Mohammad: "Move to GPU"). It had been off since
  // 759be3e1: on an iPhone the glass flickered as it went between the figure's canvas and the browser's blur and back, at the screen's
  // edge as the sheet untucked and wherever a label crossed it. Now a glass is clipped by the screen, never sent back at its edge; the
  // labels leave every glass drawn here out (sendHoles), so they never send one back; and what still does (an overlay the GPU does not
  // paint, a callout under a card) changes it only after it has rested 400 ms, never while anything moves (glass-gl.js hostDraw).)
  function hostFrost(g, o) { if (!g || !veins?.top) return; frostHosts.set(g, o); g.setHost(frostHost(o, frostLiver)); if (!frostLiver) frostCtx = veins.top.gl; }
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
    surface('liver label pane glass', glassRow(() => paneGL, () => (glass.hidden ? null : blurAsk())));
    surface('card glass', glassRow(() => { for (const g of cardGLs) if (g.state()) return g; return null; }, () => (document.querySelector('.pz-shade') ? blurAsk() : null)));
  }
  // (What the page lays between the figure's canvas and a glass, as client boxes. 'pane': the overlays the GPU does not paint (#stageOver's
  // SVG). 'low' (the teaching card's shade, z-index 1, over the whole stage view): those, the liver pane when the browser blurs it, the
  // labels and marks (their GPU canvas's boxes, or the SVG's own). 'callouts' (z-index 4): those, the shade (its tabs and words), and the
  // credit when it lies under them (outside Present). 'cards' (the Present cards, over everything in the stage view): 'low', and the
  // callouts.)
  const visible = (el) => {
    if (!el?.isConnected || el.hidden) return false;
    const c = getComputedStyle(el);
    return c.display !== 'none' && c.visibility === 'visible' && +c.opacity > 0.001;
  };
  // (What lies between, kept (1 Nov 2026, "Move everything to GPU"): read again only when something there may have moved: a write in the
  // overlays, the labels, the liver pane, the catheter's or the sites' labels or the stage's own class or style, a teaching card's shade
  // written or animating, a new labels picture (labelGL.boxes), the camera (viewKey), a resize, or any CSS transition or animation on the
  // page and for 0.6 s after it. A frame that only moves the blood reads no box.)
  let frostDirty = 0, frostMo = null;
  const frostSeen = new WeakSet(), frostKept = new Map();
  // (2 Nov 2026: a transition or animation anywhere in the page no longer keeps the cache off for 0.6 s, nor is getAnimations() asked
  // on every call. Only the elements read below are listened to, with capture so their children count too; a start, end or cancel marks
  // the cache dirty, and the next frostOver call reads once and keeps the answer again.)
  // (Each part between keeps its own count, so a part that moved reads alone: the catheter's labels following a glide read
  // themselves, not the overlays, the labels picture and the shade too. The overlays' group following the camera (worldOver's
  // transform, every frame of a glide) reads nothing: their boxes, read once, are carried by the figure's transform (frostCarry).)
  const frostPart = { over: 0, pane: 0, labels: 0, shade: 0, marks: 0 };
  const frostAll = () => { for (const k in frostPart) frostPart[k]++; };
  const frostPartOf = (t) => (!t?.nodeType ? '' : svgOver?.contains(t) ? 'over' : glass?.contains(t) ? 'pane' : labelSvg?.contains(t) ? 'labels'
    : cath.labels?.contains(t) || sites.el?.contains(t) ? 'marks' : t.closest?.('.pz-shade, .stage-credit') ? 'shade' : '');
  const frostTouch = (e) => { frostDirty++; const p = frostPartOf(e?.target); if (p) frostPart[p]++; else frostAll(); };
  function frostRecords(list) {
    frostDirty++;
    for (const m of list) {
      if (m.target === worldOver && m.type === 'attributes' && m.attributeName === 'transform') continue;
      const p = frostPartOf(m.target);
      if (p) frostPart[p]++; else frostAll();
    }
  }
  const FROST_EVS = ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'];
  const frostListen = (el) => { for (const t of FROST_EVS) el.addEventListener(t, frostTouch, true); };
  const FROST_OBS_ALL = { attributes: true, childList: true, subtree: true, characterData: true }, FROST_OBS_ATTR = { attributes: true }, FROST_EL = [null, null, null, null, null];
  const frostSee = (el) => { if (el && !frostSeen.has(el)) { frostSeen.add(el); frostMo.observe(el, FROST_OBS_ATTR); frostListen(el); frostTouch(); } };
  function frostWatch() {
    if (!frostMo) {
      frostMo = new MutationObserver(frostRecords);
      FROST_EL[0] = svgOver; FROST_EL[1] = labelSvg; FROST_EL[2] = glass; FROST_EL[3] = cath.labels; FROST_EL[4] = sites.el;
      for (let i = 0; i < 5; i++) if (FROST_EL[i]) frostMo.observe(FROST_EL[i], FROST_OBS_ALL);
      frostMo.observe(wrap, FROST_OBS_ATTR);
      frostMo.observe(document.documentElement, FROST_OBS_ATTR);
      addEventListener('resize', frostTouch);
      for (let i = 0; i < 5; i++) if (FROST_EL[i]) frostListen(FROST_EL[i]);
      for (let i = 0; i < 5; i++) FROST_EL[i] = null;
    }
    const shades = document.getElementsByClassName('pz-shade');
    for (let i = 0; i < shades.length; i++) frostSee(shades[i]);
    frostSee(document.querySelector('.stage-credit'));
  }
  function frostOver(level) {
    frostWatch();
    // (Kept with the parts it was read for, compared one by one: no key text is built on an ask that finds the same answer.)
    const vk = veins?.viewKey ?? '', lost = !!labelGL?.lost, pres = !!appEl?.classList.contains('presenting'), boxes = labelGL?.boxes ?? null;
    let k = frostKept.get(level);
    if (k && k.dirty === frostDirty && k.vk === vk && k.lost === lost && k.pres === pres && k.boxes === boxes) return k.out;
    const out = frostOverRead(level);
    if (!k) frostKept.set(level, (k = { dirty: 0, vk: '', lost: false, pres: false, boxes: null, out }));
    k.dirty = frostDirty; k.vk = vk; k.lost = lost; k.pres = pres; k.boxes = boxes; k.out = out;
    return out;
  }
  // (One part's boxes, kept while its count, the mode and the labels' picture stand.)
  const frostParts = new Map();
  function frostPartRead(p, read) {   // (read(o) fills o, the part's own kept list, which only the caller's next copy reads: it is never handed on)
    const n = frostPart[p], pres = !!appEl?.classList.contains('presenting'), lost = !!labelGL?.lost, tr = p === 'over' ? svg.style.transform : '';
    const k = frostParts.get(p), boxes = labelGL?.boxes ?? null;
    if (k && k.n === n && k.pres === pres && k.lost === lost && k.tr === tr && k.boxes === boxes) return k;
    if (p === 'over' && !CTM) refreshCTM();
    const v = k || { n: 0, pres: false, lost: false, tr: '', boxes: null, ctm: null, out: [] };
    v.n = n; v.pres = pres; v.lost = lost; v.tr = tr; v.boxes = boxes; v.ctm = p === 'over' ? CTM : null; v.out.length = 0; read(v.out);
    frostParts.set(p, v);
    return v;
  }
  // (Boxes read at one view of the figure, where they are at another: each box's corners through the change of transform, and the box
  // that holds them. By arithmetic, no read.)
  // (The change of transform sits in one kept array; a box's four corners go through it one by one, and the box that holds them is the answer.)
  const CARRY_M = [1, 0, 0, 1, 0, 0];
  function carryRect(r) {
    const m = CARRY_M, l = r.left, t = r.top, rt = r.right, bt = r.bottom;
    const xa = m[0] * l + m[2] * t + m[4], xb = m[0] * rt + m[2] * t + m[4], xc = m[0] * l + m[2] * bt + m[4], xd = m[0] * rt + m[2] * bt + m[4];
    const ya = m[1] * l + m[3] * t + m[5], yb = m[1] * rt + m[3] * t + m[5], yc = m[1] * l + m[3] * bt + m[5], yd = m[1] * rt + m[3] * bt + m[5];
    return { left: Math.min(xa, xb, xc, xd), top: Math.min(ya, yb, yc, yd), right: Math.max(xa, xb, xc, xd), bottom: Math.max(ya, yb, yc, yd) };
  }
  function frostCarry(v, into) {   // (v's boxes carried to the figure's view now, pushed on `into`)
    if (!CTM) refreshCTM();
    const a = v.ctm, b = CTM;
    if (!a || !b || a === b || !v.out.length) return frostPush(into, v.out);
    const det = a.a * a.d - a.b * a.c;
    if (!det) return frostPush(into, v.out);
    const ia = a.d / det, ib = -a.b / det, ic = -a.c / det, id = a.a / det, ie = (a.c * a.f - a.d * a.e) / det, jf = (a.b * a.e - a.a * a.f) / det;
    CARRY_M[0] = b.a * ia + b.c * ib; CARRY_M[1] = b.b * ia + b.d * ib; CARRY_M[2] = b.a * ic + b.c * id; CARRY_M[3] = b.b * ic + b.d * id;
    CARRY_M[4] = b.a * ie + b.c * jf + b.e; CARRY_M[5] = b.b * ie + b.d * jf + b.f;
    for (let i = 0; i < v.out.length; i++) into.push(carryRect(v.out[i]));
    return into;
  }
  function frostPush(into, list) { for (let i = 0; i < list.length; i++) into.push(list[i]); return into; }
  function frostReadOver(o) {
    if (svgOver && !svgOver.classList.contains(OVER_ALL) && visible(svgOver)) {
      for (const u of overUnits(worldOver, gOver)) if (!u.classList.contains(OVER_CLASS) && visible(u)) o.push(u.getBoundingClientRect());
    }
  }
  function frostReadPane(o) { if (!glass.hidden && !paneGL?.hosted) o.push(glass.getBoundingClientRect()); }
  function frostReadLabels(o) {
    if (visible(labelSvg)) {
      if (labelGL && !labelGL.lost) {
        // (The labels the GPU draws are in the figure's canvas, under every glass: they never send a glass back to the browser's blur. Only
        // those the SVG still draws itself lie over it.)
        for (const el of labelGL.svgLeft()) o.push(el.getBoundingClientRect());
      } else for (const el of labelSvg.querySelectorAll('.lb, .leader, .leader-dot')) o.push(el.getBoundingClientRect());
    }
  }
  function frostReadShade(o) {
    const shades = document.getElementsByClassName('pz-shade');
    for (let i = 0; i < shades.length; i++) if (visible(shades[i])) o.push(shades[i].getBoundingClientRect());
    const cr = document.querySelector('.stage-credit');
    if (cr && !appEl?.classList.contains('presenting') && visible(cr)) o.push(cr.getBoundingClientRect());
  }
  function frostReadMarks(o) {
    for (const el of cath.labels.children) if (visible(el)) o.push(el.getBoundingClientRect());
    for (const el of sites.el.children) if (visible(el)) o.push(el.getBoundingClientRect());
  }
  function frostOverRead(level) {
    const out = [];
    frostCarry(frostPartRead('over', frostReadOver), out);
    if (level === 'pane') return out;
    frostPush(out, frostPartRead('pane', frostReadPane).out);
    frostPush(out, frostPartRead('labels', frostReadLabels).out);
    if (level === 'low') return out;
    if (level === 'callouts') return frostPush(out, frostPartRead('shade', frostReadShade).out);
    return frostPush(out, frostPartRead('marks', frostReadMarks).out);
  }
  // The callouts' glass: one region of stage.glass.add over both callout layers' glass bodies (callout.js .cl-glass), each its outline path (read from
  // its model), its size from its style, its tint the surface at the glass's strength and its soft shadow the callout's own box-shadow, drawn under
  // the callouts (its turn between the cards' two); asked for again by glass.add while the figure's canvas is not made yet.
  // The liver label's pane likewise: its rounded box (its border radius, its size from its style) tinted with --frost, drawn under the labels (order 0).
  glassAdd.add(glass, {
    pane: true, blur: PANE.blur, sat: PANE.sat, scale: 4, margin: 48, before: glass, watch: glass,
    tint: (g, cs) => cs.getPropertyValue('--frost'),
    shape: (g) => { const w = parseFloat(g.style.width) || 0, h = parseFloat(g.style.height) || 0; return w && h ? { d: roundPath(w, h, parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0), w, h } : false; },
  });
  {
    const body = [], layers = [cath.labels, sites.el];
    const NUMPX = (v) => parseFloat(v) || 0;
    glassAdd.add(() => { body.length = 0; for (const l of layers) { const c = l.getElementsByClassName('cl-glass'); for (let i = 0; i < c.length; i++) body.push(c[i]); } return body; }, {
      callouts: true, blur: GLASS.blur, scale: 4, before: cath.labels, watch: layers, outer: true, shadow: true, k: GLASS.tint,
      tint: (g, cs) => cs.getPropertyValue('--surface'),
      shape: (g) => { const d = g.firstChild?.firstChild?.getAttribute?.('d'), w = NUMPX(g.style.width), h = NUMPX(g.style.height); return d && w && h ? { d, w, h } : false; },
    });
  }
  // (The list is one of two kept arrays taken in turn: the labels' picture holds the last list it was given until the next, so the one it holds is never the one filled.)
  let labelGlA = [], labelGlB = [];
  // (Only a label laid out for the view shown now is handed to the GPU: a block the new view does not use keeps the place it had in the old one, and was drawn from it.)
  const labelGlAdd = (b) => { if (b.pos && b.pos.view === morphTarget) labelGlA.push(b.pos); };
  const labelGlSync = () => { if (!labelGL || glSuppress) return;
    const t = labelGlA; labelGlA = labelGlB; labelGlB = t; labelGlA.length = 0; pool.forEach(labelGlAdd); labelGL.sync(labelGlA); };
  const { CIRCUIT_LABEL_K, LABEL_MAX, LABEL_MIN, TURN_DIR, deskK, deskMQ, textW } = createLabelText({ updateLabels }, live);

  let labelScale = (() => {
    try {
      let v = parseFloat(localStorage.getItem('pps.labelScale'));
      // A size saved before that desktop baseline keeps a raised size where it was, and is never below the new 100 %.
      if (localStorage.getItem('pps.labelScaleV') !== '2') {
        if (v && deskMQ.matches) { v = Math.max(1, Math.round((v / 1.5) * 100) / 100); localStorage.setItem('pps.labelScale', String(v)); }
        localStorage.setItem('pps.labelScaleV', '2');
      }
      return clamp(v || 1, LABEL_MIN, LABEL_MAX);
    } catch { return 1; }
  })();
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
  const { MARK_GRID, PULL_GRID, REF, blockWant, labelGlide, labelStop, leadEls, paintLeaders, rectOf, renderBlock, termTone } = createLabelLayer({ ANCHOR_W, LABEL_GLIDE_MS, LINE_H, NO_ANCHOR, dprDots, easeInOut, explain, fontPx, gLeaders, glass, late, lateQueue, localToWorldInto, nextFrame, onSelect, pinKind, pool, setA, sizeGlass, toneCol, unlitKeys, updateLabels, wrap }, live);
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





  let blockerBoxes = null, blockersAt = -1e9, blockersStale = true;
  let blockersAsk = 0;
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
  const { JOB_NOW, KEY_NODES, SOLVED_A, SOLVED_B, SOLVE_TURN, cathHid, flagged, handRideEnd: handRideEnd$, keyInto, labelIns, labelJobDrop: labelJobDrop$, labelJobStep: labelJobStep$, labelKeyArr, labelKeyNow: labelKeyNow$, labelRestK: labelRestK$, labelSettleSoon: labelSettleSoon$, labelSig: labelSig$, labelSliceRun: labelSliceRun$, labelTail: labelTail$, labelVis, sigWidthMoved, sliceOver, stats, stentReady, updateLabels: updateLabels$, zoneStick, zoomedIn } = createLabelDriver({ E, EI, EV, LABEL_FIRST_REST_MS, LABEL_REST_SLICE_MS, LABEL_SLICE_MS, calloutSig, camSettle, carryAbort, cath, dop, dpr, dprobePaint, easeInOut, explain, fxBuild, hasVarices, isImaging, labelBase, labelGlSync, landing, layerMode, layoutLabels, layoutLabelsGen, nextFrame, nodeItem, pre, preAbort, preAsk, pzInset, refreshCTM, renderBlock, resItem, rideStart, rideStep, rideStop, sameDeps, scan, scanItem, scanPaint, shortenTo, sigFold, sites, sitesPaint, stageBox, themeKey, velItem, wrap, xfMarkCurrent, xfRelease }, live);
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
  // where the view stopped, once it is let go (as a presenter's camera move does: cam-move). Mohammad, 26 Oct, his pick "Both,
  // readings first" for "the problem is during the zoom itself it's very very choppy". A pan alone keeps them, carried.
  // A vessel's width as the labels see it: it moves only once the vessel has changed by 2 px, so a width
  // easing or hovering at a rounding edge does not lay the labels out again on every model update.
  const sigW = new Map();
  // A stent's velocity callout waits until the stent has grown in and the flow through it has settled: while it draws on,
  // widens, or the presenter eases the model to a new patient, the reading swings through values no scan would show.
  const STENT_CALM_MS = 1200, stentCalm = new Map();
  // The narrowings' part of the signature, kept per object: a change of parameters always makes new objects (updateParams
  // clones them, and each model frame brings its own), so the same object always gives the same text. The same holds for the
  // slide's marks and terms (the presenter sets new ones per slide) and the cards' boxes (readBlockers returns a new list):
  // their text is built once per object, not on every call (review item 25).
  const paramJSONs = new WeakMap();
  // Layout runs only when one of its inputs changed: the camera and stage box (the CTM), the label
  // signature (geometry, widths, selection, layers, levels...), the morph and turn, the floating panels,
  // fonts, theme and the presenter's insets. Otherwise the last layout stands, and only the live values
  // are refreshed in place (see refreshValues); a value whose text changes shape lays the labels out again.
  let labelKey = null, labelFonts = 0, labelShown = [], noChevBoxes = [], labelPainted = false;   // labelPainted: the last updateLabels painted the callouts and probes
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
  let segs = [], segIdx = lineIndex([], worldToLocal, 1, SEG_CELL);
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
  function buildSegs() {
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
    segIdx = lineIndex(segLines, worldToLocal, CTM.sc, SEG_CELL);
    segs = segIdx.segs;
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
      if (!/^(n:TIPS:|n:DIPS:|focus)/.test(key)) continue;
      const shown = g.style.display !== 'none' && !g.classList.contains('lb-off');
      const pill = g.querySelector('rect.lb-bg'), t = g.querySelector('text');
      const halo = pill && /^focus/.test(key) ? 0 : (parseFloat(t && getComputedStyle(t).strokeWidth) || 0) / 2;
      const r = box(pill && /^focus/.test(key) ? pill : t || g, halo), n = near(r, null), pt = key.split(':')[2], d = dots[pt];
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
  // (dry: a solve that only finds the slots (labelSol) and draws nothing: solveLanding, for a framing the camera has not reached yet.)
  // (All at once: a carry, a dry solve, a solve with slicing off. Any solve still in slices gives way to it.)
  function layoutLabels(f, solve, dry = false) {
    if (labelJob) labelJobDrop();
    preAbort();
    const g = layoutLabelsGen(f, solve, dry);
    let r;
    do r = g.next(); while (!r.done);
    return r.value;
  }
  // (Kept for the layout that runs, one at a time (a layout that begins ends any other first), and written in place by each: its view
  // rectangles, its lists of obstacles and boxes placed, the stent's three dots, and scratch pairs, boxes and steps.)
  let lbkNum = NaN, lbkStr = '', labelSolSpare = new Map();
  const { layoutLabelsGen: layoutLabelsGen$ } = createLabelSolve({ ANAT_EXTRA, ANAT_PRI, CIRCUIT_LABEL_K, E, EBOX, EI, KEY_NODES, LINE_H, LW_XY, MARK_GRID, NI, NO_BLK, PIN_DIR, PULL_GRID, TURN_DIR, ZONE_SHORT, arcMid, blockWant, buildSegs, caliperAt, caliperSegs, calloutBoxes, cath, cathRadOf, clampD, clampFontAt, clampLabelAt, clampLabelPos, clampMv, clampStep, clampTextBox, clampW, colGap, dop, dpr, easeInOut, flagged, fontPx, fxBuild, fxK, fxPill, gLabels, gScan, geo, glass, hasDot, hasVarices, isImaging, labelAnchor, labelBase, labelGlide, labelHidden, labelStop, labelVis, laneAlt, laneU, leadEls, leadRectOf, leaderEnd, lineHits, lineW, liverExpanded, localToWorld, localWorldXY, nodeItem, nodePos, onSelect, oneLine, organEls, ov, paintLeaders, pointAt, pool, procIn, pzInset, rectOf, renderBlock, resItem, resPlace, saSides, scan, scanTipLocal, seenEnd, shortenItem, shortenTo, sites, sliceOver, stageBox, stagePx, stenosisAt, stentReady, textW, velItem, vh, worldToLocal, worldToLocalInto, zoneStick, zoomedIn }, live);
  function* layoutLabelsGen(...a) { return yield* layoutLabelsGen$(...a); }   // <stage-split stub>
  // A station's marker (its dot, its label, the Δ ring) shows only while a vessel is drawn at it (circuit-nodes.js): a vessel the
  // plate leaves out, or one still closed, leaves no dot floating where it would end, and one that draws on or retracts brings
  // its far end's marker in once it has arrived and takes it away as it withdraws.
  const NODE_ENDS = nodeEnds(ALL_EDGES, (e) => E[e.id]);
  const nodeVisible = (id) => !(ANAT_HIDDEN_NODES.has(id) && morph < 0.5) && nodeDrawn(NODE_ENDS[id]);

  const { bloodLook, bloodOn, bolus, chevOn, injectDye, originOn, restStill, sprayFading, sprayOn, stepBlood, stepRest, stepSpray, streams } = createBlood({ E, EI, EV, GL_ROWS, bal, cath, easeInOut, geo, glow, holdReversals, layerMode, revHold }, live);
  let origins = null, originsF = null, bloodClock = 0, dyeShown = false;
  let bloodEasing = false;
  let restOn = false, restU = 1, restK = 1;

  // Active variceal bleeding: blood spurts from the rupture into the lumen with each heartbeat and runs down into the
  // stomach, where it pools (blood.js bleedShapes; still, each jet and drop at its own stage, while paused or with reduced
  // motion). Each: [x0, y0, x1, y1, r0, r1, alpha, kind] (veins-gl.js): a jet (kind 1) from its base (x0, y0; radius r0)
  // to its tip (x1, y1; r1), or the pool (kind 0), the bowl at (x0, y0) with radii x1, y1 filled up to height r0.
  // (It fades in on a rupture and out once the bleed stops, or as the circuit view takes over: sprayA, stepped in animate;
  // while it fades out the jets keep spurting from the last bleed seen.)
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
  const CALM_MS = 0, CALM_AFTER_MS = 600;
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
    if (document.hidden || appEl?.classList.contains('home-open')) { lastT = flowGate = now; trimVeins(); sleep(); return; }
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
    const interval = calm ? Math.max(base, CALM_MS) : base;
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
    veinsTrimmed = false;   // (shown again: the next draw makes what trimVeins gave back)
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
    // (The overlays changed with the figure still: the picture laid again with them, nothing else drawn.)
    if (OVER_ON && veins?.overlay?.stale && !veins.lost) veins.present();
    const rowsWait = veinsRows.size > 0 && !!veins && !veins.lost && !!vLook && !!F;
    if (still && !veinsDirty && !rowsWait && !glowSync && !(glLines && olDirty) && (!glLines || !marksStale()) && !(glLines && olFading()) && !mapEasing() && !clampFading() && !markA.moving() && !widthEasing && !bloodEasing && !plateEasing() && !sprayFading() && !veins?.organs?.fading && !lensFrom && !colEasing && ascShown === ascTarget && morph === morphTarget && rotU === rotTarget && keyDrawn.on && sameStill(keyNow, keyDrawn) && fSame && CTM === lastDrawCTM && !anyReveal()) { sleep(); return; }
    stepPlateEase();
    stepMap(dt);
    if (morph !== morphTarget) {
      morph = clamp(morph + Math.sign(morphTarget - morph) * dt / 0.6, 0, 1);
      // (The camera is on the change's clock: its framing is the share of the way the figure has come.)
      if (viewXf && !viewXf.same) { const p = viewXfP(); vt = p >= 1 ? { ...viewXf.to } : lerpVT(viewXf.from, viewXf.to, p); viewVersion++; }   // (the camera moved: a view move, never paced like the model's motion)
      if (F) update(F); else updateGeometry(true);
      if (viewXf) viewXfStep();
    } else if (widthEasing && F && !stepOrgans() && !stepWidths()) update(F);   // a width still easing to its target: one step a frame (stepWidths: the widths alone, when nothing else changed)
    if (rotU !== rotTarget) {
      rotU = clamp(rotU + Math.sign(rotTarget - rotU) * dt / 0.5, 0, 1);
      setViewBox(easeInOut(morph));
      if (rotHold) { holdView(rotHold); if (rotU === rotTarget) rotHold = null; }
      else if (rotU === rotTarget && morphTarget === 1 && rotWhole) { vt = { ...rotWhole }; rotWhole = null; applyVT(); CTM = null; }
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
    drawnView = viewVersion;
    if (still) copyKey(keyNow, keyDrawn); else keyDrawn.on = false;
    // (The pinned labels drawn with the figure, in its frame, whenever its camera or its shape moved: label-gl.js pinDraw.)
    if (labelGL && (CTM !== lastDrawCTM || morph !== pinMorph || !CTM)) { if (!CTM) refreshCTM(); pinMorph = morph; labelGL.pinDraw(); }
    lastDrawF = F; lastDrawCTM = CTM; lastAnim = anim || bolus.active || dyeShown;
    askAnimate();
  }
  askAnimate();
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
  return {
    update,
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
      if (d.k !== vt.k || d.x !== vt.x || d.y !== vt.y) animateVT(d, 600);
      // (No morph to ride here: a catheter or a lobule. The labels are laid out afresh for the new view.)
      if (F) { labelKey = null; solveAsked = true; }
    },
    relayout() { refreshCTM(); if (F) updateLabels(F, true); },
    // How often the labels were laid out, skipped or only had their values refreshed, and the time spent (for perf checks).
    labelStats: () => ({ ...stats }),
    /** What the label layer drew last frame, for the checks: the boxes of its pictures and marks (CSS px from its corner) and how many leaders and dots. */
    labelFrame: () => ({ boxes: labelGL?.boxes ?? [], marks: labelGL?.counts().marksDrawn ?? 0, riding: !!labelGL?.riding }),
    // How the frames of the changes between the views were drawn (from the stretches made ahead, gpu, or binned there, cpu, and why), for tests.
    morphStats: () => ({ gpu: mt.stats.gpu, cpu: mt.stats.cpu, builds: mt.stats.builds, miss: { ...mt.stats.miss }, ready: (mt.pieces || []).filter((pc) => pc.set).length }),
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
      if (!st) { cath.rc = 0; cath.route = null; cath.blk = null; cath.shaft = null; cath.room = null; cath.ins = null; cathVer++; if (cathTint) { cathTint = null; cath.tintKey = ''; syncVeins(easeInOut(morph)); } cath.at = null; cathFadeOut(); return; }
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
    pinDoppler(id, { points = false } = {}) { dop.pin = id; dop.points = !!id && points; dopApply(); },
    setScanProbe,
    setLabelScale(v) {
      labelScale = clamp(Math.round(v * 100) / 100, LABEL_MIN, LABEL_MAX);
      try { localStorage.setItem('pps.labelScale', String(labelScale)); } catch (e) { caught('stage:13721', e); /* storage unavailable */ }
      if (!projecting) document.documentElement.style.setProperty('--label-k', String(labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(labelScale)); document.documentElement.style.setProperty('--ts', String(labelScale));
      dispatchEvent(new Event('pps:labelscale'));
      if (F) updateLabels(F);
    },
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
      if (base.k / 1.4 <= lo.k * 1.001) { if (!circuit) homeAt = lo; else markCirc(lo === whole ? 'whole' : 'focus', lo); fitted = true; if (!sameView(lo, base)) animateVT(lo, 260); return; }
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
    gliding: () => vtGliding,
    /** What is left of the glide under way, and its whole length, ms ({ left: 0, ms: 0 } at rest): a slide's cards come in over its last part. */
    glideLeft: () => (vtGliding ? { left: Math.max(0, vtUntil - performance.now()), ms: vtMs } : { left: 0, ms: 0 }),
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
    /** The labels' state against the camera, for the browser check: hidden (the pinch hide), riding (carried by the camera's move on the GPU),
     *  and stale (shown, not riding, laid out under a camera that is not this one: the old labels over the new view). */
    labelCarry: () => {
      refreshCTM();
      const hidden = wrap.classList.contains('cam-move'), riding = !!rideCTM;
      let moved = false;
      if (layCTM) { const n = stagePxInto(stagePxNow, CTM); for (let i = 0; i < 6; i++) if (Math.abs(n[i] - layCTM[i]) > (i < 4 ? 1e-4 : 0.5)) moved = true; }
      return { hidden, riding, job: !!labelJob, laid: !!solvedFor && !labelJob && labelKey != null && morph === morphTarget, stale: !hidden && !riding && !labelJob && moved };
    },
    /** For the browser check of the Circuit's leaders (tests/e2e/circuit-leaders.mjs): the vessels as the labels' solver sees them (stage px, half width, id)
     *  and the stage's corner in client px, so the labels' boxes and leaders can be read against them. */
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
    lobuleSettled: () => !diveWait && !(lz?.sinBusy()) && (lobuleOn ? diveT >= 1 : diveT <= 0),
    /** From the anatomy to the sinusoid view in two zooms: into the lobule's normal framing, then into the sinusoid. In the lobule already, just the sinusoid. */
    async diveToSinusoid() {
      const me = ++sinMoveGen;
      if (!lobuleOn && diveT === 0 && morphTarget === 0 && !reduceMotion.matches) {
        store.set({ lobule: true });
        const t0 = performance.now();
        while (!(lobuleOn && diveT >= 1 && lz?.isOpen()) && performance.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 60));
        await new Promise((r) => setTimeout(r, 120));
        if (!lobuleOn || me !== sinMoveGen) return;
      }
      store.set({ lobule: true, sinusoid: true });
    },
    /** From the sinusoid view out to the anatomy in three steps: out of the sinusoid, back to the lobule's normal framing, then out of the lobule. */
    async exitSinusoid() {
      const me = ++sinMoveGen;
      if (!store.get().sinusoid || !lz?.sinusoidOpen()) { store.set({ sinusoid: false, lobule: false }); return; }
      store.set({ sinusoid: false });
      const t0 = performance.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      while ((lz.sinBusy() || lz.sinusoidOpen()) && performance.now() - t0 < 4000) await wait(60);
      if (me !== sinMoveGen || store.get().sinusoid) return;   // (a dive began meanwhile, or the sinusoid was asked for again: leave the lobule where it is)
      if (lz.focusOn('fit', { ms: 900 })) await wait(900);
      if (me !== sinMoveGen || store.get().sinusoid) return;
      if (store.get().lobule) store.set({ lobule: false });
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
      setGlowSrc('flash', ids.filter((id) => E[id]?.vis).map((id) => ({ id, col: 'var(--accent)', amt: 1.3, dur: 380 })));
      clearTimeout(glow.flashT); glow.flashT = setTimeout(() => setGlowSrc('flash', []), 1000);
    },
    edgeMid: (id) => (geo[id] ? pointAt(geo[id].cur, 0.5) : null),
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
