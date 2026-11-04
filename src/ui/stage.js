// Anatomical stage (blueprint §6): the figure drawn on the GPU (plate, vessels, moving blood),
// over an SVG scene that holds the organ artwork, hit targets and overlays, and screen-space labels.

import { TIERS_ON, TIER_TOP, tierK, motionK } from './adapt-tier.js';
import { hold as gpuHold, overMemory as gpuOverMemory } from './gpu-budget.js';
import { WARM_VIEWS, WARM_MS } from './warm-views.js';
import { EDGES, dopplerK, NODES, PORTAL_TERRITORY, dMinOf, edgePresent, isOccluded, isStent, stentSite, STENT_SITES, STENT_SPANS, stentGate, stentSegments } from '../engine/topology.js';
import { route as metroRoute, RECTUM_FADE, LABEL_VESSEL, TIP_FADE, ART_FADE, TIP_CONNECT, VIEW, VB_ANAT, VB_CIRC, ATLAS_COLUMNS, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN, ANAT_HIDDEN_NODES, CAUDATE, CONTEXT_EDGES, BACK_EDGES, IVC_EDGES, NEEDS_C3, NODE_POS, EDGE_PATH, CIRCUIT_PATH, metroPath, ORGANS, SEAM_D, ORGAN_DETAIL, BACKDROP, LIVER_INNER, LIVER_EDGES, LANE_CAPTIONS, ABDOMEN_CLIP, ABDOMEN_FLOOR, CAVITY_LOW, flankPath, abdomenOutline, cavityHalfWidths, SPLEEN_CENTER, SITES, ORGAN_LABELS, ATLAS_LABELS, SHORT, ABBR, CHIP_NODES, LIVER_SPLIT_X, CIRCUIT_ZONES, CIRCUIT_LABELS, STRANDS, STRAND_FROM, SIN_EDGES, FEEDERS, fanFeeders, CIRCUIT_TREES } from './anatomy.js';
import { pressureColor, deltaColor, dropColor, flowColor, heatColor, velColorOf, velocityColor, oxygenColor } from './colormap.js';
import { sideEndScale } from './fork-joins.js';
import { lookChanged, newLookSig } from './look-sig.js';
import { veinJoins as joinsPass, smoothRunOn as smoothPass, newJoinStore, runOnSamples } from './vein-joins.js';
import { nodeEnds, nodeDrawn, dotRadius, bareDots } from './circuit-nodes.js';
import { STATION_VESSEL, meanVel, velNormal, judgeFlow } from './velNormal.js';
import { store, varicesPresent, varixGrowth, shownVel } from './store.js';
import { s, h, fmt, fmtFlow, fp, clamp, lerp, toast, loadFailed, restBox, translateRest, settledBox, putText, UPRIGHT_MQ, cssVar, cssRGB } from './util.js';
import { recordLayer } from './over-records.js';
import { riseCentre } from './rise-path.js';
import { lerpVT, camPath, blendPaths, viewsOverlap, driftEase } from './cam-arc.js';
import { easeMove, easeArrive, camMs, carryRate, carried, D_SMALL, D_SURFACE, EASE_ARRIVE } from './ease.js';
import { lesionEase } from './lesion-ease.js';
import { bandsStep } from './band-ease.js';
import { glideClock } from './glide-clock.js';
import { sinceSource } from './since-ref.js';
import { clipBox, mapBox } from './fit-box.js';
import { fluidTarget, poolFade, fluidLevel, fluidFloorAt, fluidBase } from './fluid-step.js';
import { easeTo, fluidSpring, fluidSpringFor } from './organ-ease.js';
import { spleenMotion } from './spleen-motion.js';
import { paintBox } from './plate-copy.js';
import { segHitsBox, lineIndex, indexHits, segsCross, leaderVesselHits } from './seg-hits.js';
import { glassCallout, withGlass } from './callout.js';
import { TEXT_MIN, TEXT_MAX, rolePx, roleOf } from './type-scale.js';
import { diaphragmLine, diaphragmD } from './diaphragm.js';
import { smooth01, liverShrink } from './liver-morph.js';
import { COLON_ART, BOWEL_ART, DUO_CLIPS, DUO_B } from './organ-art.js';
import { createRouter } from './circuit-router.js';
import { gpuProbe, COUNTED } from './gpu-probe.js';
import { refine } from './refine.js';
import { fadeStop, fading } from './res-fade.js';
import { LIGHT } from './light.js';
import { leftAlone, sinceInput, booting, holdCover } from './quiet.js';
import { cropToGrid } from './organs-gl.js';
import { textPolys, loadGlyphs, glyphsReady, textBox } from './text-gl.js';
import { cssColor8 } from './css-color.js';
import { measure as measureWords } from './glyph-measure.js';
import { readGroup as readGroupNow, readGroupRefs, readFail, targetRoom, mulTo, elMat } from './organ-paint.js';
import { setLive, getLive, dropLive } from './live-style.js';
import { overUnits, overRun, needsReread, netChanges, OVER_CLASS, OVER_ALL } from './stage-over.js';
import { measurePath, elBoxInto, chainMat } from './shape-gl.js';
import { HOVER_LINK, labelTarget } from './hover-link.js';
import { explainText, createExplain } from './label-explain.js';
import { nameSpots, NAME_BREAK } from './organ-names.js';
import { createLabelGL } from './label-gl.js';
import { hits, crosses, within, RING_DIRS, offset, needsLeader, LEAD_ON } from './label-place.js';
import { sceneCam } from './scene-cam.js';
import { createGlassGL, glassRegions, GLASS, PANE, roundPath } from './glass-gl.js';
import { writePoints, writeJoinNow } from './veins-sweep.js';
import { ENT_W } from './veins-bin.js';
import { createVeinsGL, binVeins, TUBE_TEXELS, MAX_TIERS, F_DIFFUSE, F_SHADOW, F_DOTTED, F_NOCASE, F_SPEC, F_VEIL, F_WHOLE, ORIGIN_GREY } from './veins-gl.js';
import { varixBead, beadRadius } from './varix-bead.js';
import { LOOK_SITE, varixSize, varixHold, varixWidthK, varixSpreadK, varixOpacity } from './varix-look.js';
import { alongCurve } from './pressure-along.js';
import { follow2, createColourFollow, SHOWN_TAU } from './display-state.js';
import { createReversalHold, oxygenFor } from './blood.js';
import { createSweepClient } from './sweep-client.js';
import { createJunctionWidths } from './junction-widths.js';
import { chainsOf, planChainInto } from './vessel-taper.js';
import { frameFor, lateFrameFor, cancelFrame, mayTask, cancelMay, noteDraw, easeNow, inMotion, afterMotion, PACED, setSaver as setFrameSaver, onRenderScale, figOpt, figLab, onFigLab, PINCH_LOW_K, readFrameFor, frameGapFor } from './frame.js';
import { softwareYield } from './sw-yield.js';
import { portalSplit } from './table-marks.js';
import { hashSeed, clotSide, clotSpan, clotRadius, clotShift, clotLayers, CLOT_EDGE } from './clot-shape.js';
import { leaderEnd as edgeOf, leaderEndRects as edgeOfRects } from './leader-end.js';
import { layoutWatch } from './idle-keys.js';
import { writeGlowTexels } from './glow-texels.js';
import { SIN_PERFUSION, sinStrandRadius } from './sin-perfusion.js';
import { makeProbePose, makeProbeDraw } from './dop-probe.js';
import { organDimMatrix } from './organ-dim.js';
import { parseColor, greyOf, paintRef } from './organ-grey.js';
import { surface } from './gpu-surfaces.js';
import { guardBlur } from './blur-guard.js';
import { liftEnd, rippleList, systemOf, SYSTEM_COLOR } from './highlight-math.js';
import { organAnchor, stepGroups, spanOf, SPAN_TICK, insideBy, clearOf, besideLine } from './callout-math.js';
import { CellGrid, geomOf } from './cell-grid.js';
import { restPass, cancelRest } from './rest-pass.js';
import { createLateQueue } from './late-queue.js';
import { dropLabel } from './drop-label.js';
import { glWords } from './gl-words.js';
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

import { reduceMotionMQ as reduceMotion } from './motion.js'; import { darkMQ } from './look.js';
// The figure's overlays drawn on the GPU, in the vessel canvas (stage-over.js; 31 Oct, recs A1): on wherever the GPU draws the
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
import { createMarks } from './stage-marks.js';
import { createVenous } from './stage-venous.js';
import { createBlood } from './stage-blood.js';
import { createBalloon } from './stage-balloon.js';
import { createCath } from './stage-cath.js';
import { createOutlines } from './stage-outlines.js';
import { createFocus } from './stage-focus.js';
import { createHover } from './stage-hover.js';
import { createRes } from './stage-res.js';
import { createHalos } from './stage-halos.js';
import { createGestures } from './stage-gestures.js';
import { createOrgans } from './stage-organs.js';

export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange }) {
  // <stage-split live>
  // The stage's shared lets (and consts made after a part), read at the moment of use by the part files: never copied, so a part cannot draw a frame late.
  const live = {
    get adaptK() { return adaptK; }, set adaptK(v) { adaptK = v; },
    get ascEls() { return ascEls; },
    get autoK() { return autoK; }, set autoK(v) { autoK = v; },
    get autoT() { return autoT; }, set autoT(v) { autoT = v; },
    get balloonSqueeze() { return balloonSqueeze; }, set balloonSqueeze(v) { balloonSqueeze = v; },
    get baseLiver() { return baseLiver; }, set baseLiver(v) { baseLiver = v; },
    get BLOCK_IO() { return BLOCK_IO; },
    get blockerBoxes() { return blockerBoxes; }, set blockerBoxes(v) { blockerBoxes = v; },
    get blockersAsk() { return blockersAsk; }, set blockersAsk(v) { blockersAsk = v; },
    get blockersStale() { return blockersStale; }, set blockersStale(v) { blockersStale = v; },
    get bloodClock() { return bloodClock; }, set bloodClock(v) { bloodClock = v; },
    get bloodEasing() { return bloodEasing; }, set bloodEasing(v) { bloodEasing = v; },
    get boxH() { return boxH; }, set boxH(v) { boxH = v; },
    get boxW() { return boxW; }, set boxW(v) { boxW = v; },
    get camMove() { return camMove; }, set camMove(v) { camMove = v; },
    get cathFade() { return cathFade; }, set cathFade(v) { cathFade = v; },
    get cathRadOf() { return cathRadOf; },
    get cathTint() { return cathTint; }, set cathTint(v) { cathTint = v; },
    get cathVer() { return cathVer; }, set cathVer(v) { cathVer = v; },
    get chevHoles() { return chevHoles; }, set chevHoles(v) { chevHoles = v; },
    get clampLast() { return clampLast; }, set clampLast(v) { clampLast = v; },
    get colShown() { return colShown; }, set colShown(v) { colShown = v; },
    get colWaitAt() { return colWaitAt; }, set colWaitAt(v) { colWaitAt = v; },
    get CTM() { return CTM; }, set CTM(v) { CTM = v; },
    get diveOrig() { return diveOrig; }, set diveOrig(v) { diveOrig = v; },
    get diveT() { return diveT; }, set diveT(v) { diveT = v; },
    get dprCardsAt() { return dprCardsAt; }, set dprCardsAt(v) { dprCardsAt = v; },
    get dprCardsList() { return dprCardsList; }, set dprCardsList(v) { dprCardsList = v; },
    get drag() { return drag; }, set drag(v) { drag = v; },
    get dyeShown() { return dyeShown; }, set dyeShown(v) { dyeShown = v; },
    get edgeRev() { return edgeRev; }, set edgeRev(v) { edgeRev = v; },
    get F() { return F; }, set F(v) { F = v; },
    get fastGap() { return fastGap; }, set fastGap(v) { fastGap = v; },
    get figKeys() { return figKeys; },
    get fitted() { return fitted; }, set fitted(v) { fitted = v; },
    get fluidFade() { return fluidFade; },
    get fluidSurf() { return fluidSurf; }, set fluidSurf(v) { fluidSurf = v; },
    get forceDraw() { return forceDraw; }, set forceDraw(v) { forceDraw = v; },
    get frostHold() { return frostHold; }, set frostHold(v) { frostHold = v; },
    get fx() { return fx; }, set fx(v) { fx = v; },
    get fxSig() { return fxSig; }, set fxSig(v) { fxSig = v; },
    get geometryVersion() { return geometryVersion; }, set geometryVersion(v) { geometryVersion = v; },
    get gGut() { return gGut; }, set gGut(v) { gGut = v; },
    get glassGL() { return glassGL; }, set glassGL(v) { glassGL = v; },
    get glide() { return glide; }, set glide(v) { glide = v; },
    get glM() { return glM; }, set glM(v) { glM = v; },
    get glowSync() { return glowSync; }, set glowSync(v) { glowSync = v; },
    get gScan() { return gScan; },
    get guideGlow() { return guideGlow; },
    get guideLab() { return guideLab; },
    get guideLine() { return guideLine; },
    get haloK() { return haloK; }, set haloK(v) { haloK = v; },
    get handed() { return handed; }, set handed(v) { handed = v; },
    get homeAt() { return homeAt; }, set homeAt(v) { homeAt = v; },
    get hoverId() { return hoverId; }, set hoverId(v) { hoverId = v; },
    get inUpdate() { return inUpdate; }, set inUpdate(v) { inUpdate = v; },
    get islOn() { return islOn; }, set islOn(v) { islOn = v; },
    get islSrc() { return islSrc; }, set islSrc(v) { islSrc = v; },
    get labelGL() { return labelGL; },
    get labelSvg() { return labelSvg; },
    get lastMoveAt() { return lastMoveAt; }, set lastMoveAt(v) { lastMoveAt = v; },
    get lbRects() { return lbRects; }, set lbRects(v) { lbRects = v; },
    get leadEls() { return leadEls; },
    get LINE_H() { return LINE_H; },
    get lineW() { return lineW; },
    get linkEdge() { return linkEdge; }, set linkEdge(v) { linkEdge = v; },
    get linkKbd() { return linkKbd; }, set linkKbd(v) { linkKbd = v; },
    get linkLit() { return linkLit; }, set linkLit(v) { linkLit = v; },
    get linkOrgan() { return linkOrgan; }, set linkOrgan(v) { linkOrgan = v; },
    get linkPtr() { return linkPtr; }, set linkPtr(v) { linkPtr = v; },
    get liverDome() { return liverDome; }, set liverDome(v) { liverDome = v; },
    get liverFloor() { return liverFloor; }, set liverFloor(v) { liverFloor = v; },
    get liverFluidCut() { return liverFluidCut; }, set liverFluidCut(v) { liverFluidCut = v; },
    get liverKey() { return liverKey; }, set liverKey(v) { liverKey = v; },
    get lobuleOn() { return lobuleOn; }, set lobuleOn(v) { lobuleOn = v; },
    get lz() { return lz; }, set lz(v) { lz = v; },
    get mapWake() { return mapWake; }, set mapWake(v) { mapWake = v; },
    get markLast() { return markLast; }, set markLast(v) { markLast = v; },
    get marksSync() { return marksSync; },
    get mk() { return mk; },
    get morph() { return morph; }, set morph(v) { morph = v; },
    get morphTarget() { return morphTarget; }, set morphTarget(v) { morphTarget = v; },
    get moveLow() { return moveLow; }, set moveLow(v) { moveLow = v; },
    get noChevBoxes() { return noChevBoxes; }, set noChevBoxes(v) { noChevBoxes = v; },
    get nodeVisible() { return nodeVisible; },
    get nodKey() { return nodKey; }, set nodKey(v) { nodKey = v; },
    get olCol() { return olCol; }, set olCol(v) { olCol = v; },
    get olDirty() { return olDirty; }, set olDirty(v) { olDirty = v; },
    get olLast() { return olLast; }, set olLast(v) { olLast = v; },
    get olList() { return olList; },
    get olVerts() { return olVerts; }, set olVerts(v) { olVerts = v; },
    get organMorphA() { return organMorphA; }, set organMorphA(v) { organMorphA = v; },
    get origins() { return origins; }, set origins(v) { origins = v; },
    get originsF() { return originsF; }, set originsF(v) { originsF = v; },
    get paneGL() { return paneGL; }, set paneGL(v) { paneGL = v; },
    get pickVer() { return pickVer; }, set pickVer(v) { pickVer = v; },
    get picLin() { return picLin; }, set picLin(v) { picLin = v; },
    get picNow() { return picNow; }, set picNow(v) { picNow = v; },
    get pillEdge() { return pillEdge; }, set pillEdge(v) { pillEdge = v; },
    get plateOn() { return plateOn; },
    get pool() { return pool; },
    get putA() { return putA; },
    get quality() { return quality; }, set quality(v) { quality = v; },
    get resizeReady() { return resizeReady; }, set resizeReady(v) { resizeReady = v; },
    get restK() { return restK; }, set restK(v) { restK = v; },
    get restOn() { return restOn; }, set restOn(v) { restOn = v; },
    get restStill() { return restStill; },
    get restU() { return restU; }, set restU(v) { restU = v; },
    get rotTarget() { return rotTarget; }, set rotTarget(v) { rotTarget = v; },
    get shunt() { return shunt; }, set shunt(v) { shunt = v; },
    get smooth01() { return smooth01; },
    get SOFTWARE() { return SOFTWARE; }, set SOFTWARE(v) { SOFTWARE = v; },
    get sprayA() { return sprayA; }, set sprayA(v) { sprayA = v; },
    get sprayLast() { return sprayLast; }, set sprayLast(v) { sprayLast = v; },
    get stageWake() { return stageWake; }, set stageWake(v) { stageWake = v; },
    get userMoved() { return userMoved; }, set userMoved(v) { userMoved = v; },
    get vBase() { return vBase; }, set vBase(v) { vBase = v; },
    get vdpr() { return vdpr; }, set vdpr(v) { vdpr = v; },
    get veins() { return veins; }, set veins(v) { veins = v; },
    get veinsDirty() { return veinsDirty; }, set veinsDirty(v) { veinsDirty = v; },
    get viewVersion() { return viewVersion; }, set viewVersion(v) { viewVersion = v; },
    get vt() { return vt; }, set vt(v) { vt = v; },
    get vtAnim() { return vtAnim; }, set vtAnim(v) { vtAnim = v; },
    get vtGliding() { return vtGliding; }, set vtGliding(v) { vtGliding = v; },
    get vtTarget() { return vtTarget; }, set vtTarget(v) { vtTarget = v; },
    get wrapRect() { return wrapRect; }, set wrapRect(v) { wrapRect = v; },
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
  function sample(d) {
    const scratch = s('path', { d });
    scratchG.replaceChildren(scratch);
    const L = scratch.getTotalLength();
    const pts = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const p = scratch.getPointAtLength((L * i) / (N_SAMPLES - 1));
      pts.push([p.x, p.y]);
    }
    return pts;
  }
  // Real vessels are never ruler-straight: a gentle, low-frequency meander (a few units, fixed
  // per vessel) along each anatomic course, fading to zero at both ends so junctions stay put.
  function meander(pts, id) {
    let L = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    const amp = Math.min(4.5, L * 0.02);
    if (amp < 0.8) return pts;
    let hsh = 0;
    for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    const ph = (hsh % 628) / 100, k = (Math.PI * 2 * (0.7 + (hsh % 5) * 0.12)) / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const o = amp * Math.sin(Math.PI * u) * (0.72 * Math.sin(k * cum[i] + ph) + 0.28 * Math.sin(2.3 * k * cum[i] + 2 * ph));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  const CIRC_SPINE_Y = 345;   // the circuit's main line runs along this row
  const defaultPath = (a, b, circuit) => (circuit ? metroPath(a, b) : `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}`);
  // A custom shunt in the circuit is a bypass: a gentle arc bowing away from the spine (the main
  // portal → liver → heart line), so it crosses the lanes it meets instead of running along one.
  const bypassPath = ([x1, y1], [x2, y2]) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1;
    let nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
    const away = my < CIRC_SPINE_Y - 5 ? -1 : my > CIRC_SPINE_Y + 5 ? 1 : -1;
    if (Math.sign(ny || 1) !== away) { nx = -nx; ny = -ny; }
    const k = Math.max(0.28 * L, 40);
    return `M${x1} ${y1} Q ${(mx + nx * k).toFixed(1)} ${(my + ny * k).toFixed(1)} ${x2} ${y2}`;
  };
  const geo = {};
  for (const e of ALL_EDGES) {
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    const dA = EDGE_PATH[e.id] || defaultPath(a[0], b[0], false);
    const dC = CIRCUIT_PATH[e.id] || (e.shunt === 'custom' ? bypassPath(a[1], b[1]) : defaultPath(a[1], b[1], true));
    // A spontaneous shunt (gastrorenal, splenorenal) is one large vein, drawn like one.
    const A = (e.kind === 'collateral' && !e.spontaneous) || e.kind === 'shunt' ? sample(dA) : meander(sample(dA), e.id);
    geo[e.id] = { dA, dC, A, C: sample(dC), cur: null, len: 0, wig: 0, lit: Array.from({ length: N_SAMPLES }, () => [0, 0, 0]) };   // (lit: the lit normals, one triple a sample, written in place by litNormals)
  }
  // Tributaries and feeders (anatomic only), sampled once, with a vein's gentle meander (a
  // feeder that is a collateral gets a serpentine instead).
  const feedGeo = {};
  // Veins that run on out of the plate fade out instead of ending: [y where the fade starts, y where
  // it is gone], downward for the rectal and epigastric veins and the infrarenal IVC, upward for the
  // SVC above the azygos arch (it leaves the top of the plate).
  // Veins that end on the faded IVC fade into it over their last stretch, so the join is seamless.
  const IVC_NODES = new Set(['IVCS', 'IVCI', 'RA']), IVC_JOIN_LEN = 60;
  // Solid to the wall, joined to the cava as a confluence: the hepatic and renal veins.
  const HEPATIC_VEINS = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC']);
  const IVC_JOIN = {};
  for (const e of ALL_EDGES) {
    if (IVC_EDGES.has(e.id) || HEPATIC_VEINS.has(e.id) || !IVC_NODES.has(e.to) || !NODE_POS[e.to] || !NODE_POS[e.from]) continue;
    // To where the drawn course actually ends (on the cava's wall), not to the node.
    const end = EDGE_PATH[e.id]?.match(/(-?[\d.]+)[ ,]+(-?[\d.]+)\s*$/);
    const [bx, by] = end ? [+end[1], +end[2]] : NODE_POS[e.to][0], [ax, ay] = NODE_POS[e.from][0], d = Math.hypot(bx - ax, by - ay) || 1;
    const k = Math.min(IVC_JOIN_LEN, d) / d;
    IVC_JOIN[e.id] = [bx - (bx - ax) * k, by - (by - ay) * k, bx, by, 0, 1, 0.3, 1];
  }
  const FADE_DOWN_Y = { C4: [892, 928], EPI_ILI: [870, 925], ILI_IVC: [800, 870], V_UP: [38, 4] };
  // The azygos trunk fades out toward its lower end: [y where the fade starts, y where it is gone].
  // The ascending lumbar collateral (C9) climbs behind the liver and comes out above the dome, and joins it from the lower left at
  // y 108, just under where this fade starts, so the trunk fades out below the join on its own, behind the liver's dome. (A feeder listed in
  // FEEDER_CONNECTOR is drawn solid to its end while that collateral is open.)
  const FEEDER_FADE_Y = { AZY_SVC: [110, 176] };
  const FEEDER_CONNECTOR = {};
  // The IVC narrows to the SVC's caliber at the right atrium on the GPU too, so its end never
  // shows as a rounded cap inside the narrower SVC.
  const GPU_EASE = { IVCS_RA: 'RA' };
  // Shunts that leave and join a vein part-way along it, not at a node: the veins at each end ([from end], [to end]).
  // (The ascending lumbar collateral, C9, joins the azygos trunk from the side, below the arch: the trunk is drawn at the
  // azygos's own width, so the azygos is its host there.)
  const SIDE_HOSTS = { C6: [['V_SPL', 'SV_MID'], ['V_KID_L']], S_DSR: [['V_SPL', 'SV_MID'], ['V_KID_L']], C9: [[], ['AZY_SVC']] };
  // The ends of those that lie inside the vein's lumen, as a side branch (the Warren shunt's start runs on from the
  // divided splenic vein instead): narrowed there on the GPU (renderTube).
  const SIDE_INSIDE = { C6: [true, true], S_DSR: [false, true], C9: [false, true] };
  // Surgical shunts and the vein each one divides (engine.js closes the same vessels): the Warren shunt the splenic
  // vein, the portocaval shunt the portal trunk. The vein's first stretch, at the shunt, is not drawn, so the shunt
  // side and the tied-off stump stand apart with a clear gap, each ending in a rounded cap.
  const LIGATED = [['S_DSR', 'SV_MID'], ['S_PC', 'PV_TRUNK']];
  // How much of the divided vein is cut away (arc length, world units): the clear gap plus both rounded ends.
  // It opens and closes as the shunt draws on or retracts; 0 without the shunt.
  function divideLen(vein) {
    let sh;
    for (let i = 0; i < LIGATED.length; i++) if (LIGATED[i][1] === vein) { sh = LIGATED[i]; break; }
    const x = sh && E[sh[0]], v = E[vein];
    if (!x?.vis || !v?.vis) return 0;
    let k = 1;
    if (x.reveal) { const u = clamp((performance.now() - x.reveal.t0) / x.reveal.dur, 0, 1); k = x.reveal.out ? 1 - easeInOut(u) : easeInOut(u); }
    return k * (v.width * 2.2 + 2 * (v.wallPx || 1));
  }
  // The ascending lumbar–azygos channel runs a smooth course of its own, up behind the liver, so it is not coiled.
  const STRAIGHT_COLL = new Set(['C9']);
  // Veins that fade into the vessel they sink into: a linear mask [x1, y1, x2, y2, offset], from
  // solid at the offset to 30 % at the end (the caudate vein into the IVC, C5 into the renal vein).
  const FADE_IN = { RHV_IVC: [604, 226, 616, 204, 0, 0.5], MHV_IVC: [604, 246, 615, 228, 0, 0.5], LHV_IVC: [641, 206, 630, 192, 0, 0.5], LRV_IVC: [642, 625, 624, 625, 0, 0.5 / 0.6], RRV_IVC: [602, 660, 615, 673, 0, 0], CAUD: [566, 326, 620, 350, 0.45], C5: [852, 520, 862, 618, 0.6] };
  // The sinusoids lie inside the liver: faded along their course, most in the middle of the lobe, clearing as
  // they gather into the central and hepatic veins. Linear from the portal end to the venous end, [offset of
  // the faintest point, alpha at the start, there, mode 3] (the end is solid).
  const SIN_FADE = {};
  for (const id of SIN_EDGES) {
    const e = ALL_EDGES.find((q) => q.id === id), a = NODE_POS[e.from][0], b = NODE_POS[e.to][0];
    SIN_FADE[id] = [a[0], a[1], b[0], b[1], 0.5, 0.8, 0.36, 3];
  }
  // The ascending lumbar collateral (C9) runs up behind the liver, so it is a faint ghost there and solid again where it comes out
  // above the dome (Mohammad, 31 Oct: "I like behind the liver fade"): the same dip, along y, from solid under the liver's lower
  // edge to its faintest where the lane crosses the hepatic veins, back to solid at the diaphragm (liver top y 189, diaphragm
  // y 170). The organ's own veil (veins-gl, BACK_EDGES, VEIL_K) comes on top of it, so behind the liver it is about a fifth of full.
  SIN_FADE.C9 = [0, 520, 0, 172, 0.65, 1, 0.55, 3];
  for (const [id, fd] of Object.entries(FEEDERS)) {
    // A generated fan is a tortuous network (drawn like the variceal plexus); listed paths meander.
    const list = [...(fd.fan ? fanFeeders(fd.fan).map((x) => ({ ...x, fan: true, when: fd.fan.when, out: !!fd.fan.out })) : []), ...(fd.paths || []).map((d, i) => ({ d, k: 1, when: fd.when, src: fd.from?.[i] }))];
    feedGeo[id] = list.map(({ d, k, fan, when, src, out }, i) => { const pts = sample(d); const shaped = fan ? wiggle(pts, (2.2 + 1.2 * k) * (fd.fan.wig ?? 1), i * 2.3 + 1) : fd.wig ? wiggle(pts, fd.wig, i * 2.3 + 1) : fd.exact ? pts : meander(pts, id + i); return { k, fan, when, src, out, pts: out ? shaped.slice().reverse() : shaped }; });
  }
  // The liver's branches in the circuit (circuit only), sampled once.
  const treeGeo = {};
  for (const [id, list] of Object.entries(CIRCUIT_TREES)) treeGeo[id] = list.map(({ d, k }) => ({ pts: sample(d), k }));
  // Custom shunts in the circuit: each opened one is routed as a transit-map line around everything
  // already drawn (and the custom shunts opened before it, which keep their courses, so nothing on
  // the map moves when another one opens). A closed one keeps its last course while it fades out.
  const customRoutes = new Map();
  const routerLines = ALL_EDGES.filter((e) => e.shunt !== 'custom').map((e) => geo[e.id].C).concat(Object.values(treeGeo).flatMap((l) => l.map((b) => b.pts)));
  const routerStations = NODES.map((n) => n.id || n[0]).filter((id) => NODE_POS[id] && !HIDDEN_NODES.has(id)).map((id) => NODE_POS[id][1]);
  const routeOpen = [], routeFresh = [];   // (the shunts open, and those to route now: kept, written in place)
  const routerOpts = { lines: routerLines, stations: routerStations, bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] };   // (read by createRouter, not kept)
  function routeCustomShunts(p) {
    routeOpen.length = 0; routeFresh.length = 0;
    const cs = p.customShunts;
    if (cs) for (const id in cs) if (cs[id] > 0 && geo[id]) routeOpen.push(id);
    routeOpen.sort();
    // (A Map's entry deleted while it is walked is simply not visited again: no copy of the keys is needed.)
    for (const id of customRoutes.keys()) if (!routeOpen.includes(id)) customRoutes.delete(id);
    // Past a dozen at once there is no room left to route another clear of the rest (and the search
    // would stall the page); those stay as plain bypass arcs.
    const room = Math.max(0, 12 - customRoutes.size);
    for (let i = 0; i < routeOpen.length && routeFresh.length < room; i++) if (!customRoutes.has(routeOpen[i])) routeFresh.push(routeOpen[i]);
    const fresh = routeFresh;
    if (!fresh.length) return false;
    const router = createRouter(routerOpts);
    for (const id of customRoutes.keys()) router.addLine(geo[id].C, true);
    svg.append(scratchG);
    for (const id of fresh) {
      const e = EDGES[EI[id]], pts = router.route(NODE_POS[e.from][1], NODE_POS[e.to][1]);
      if (!pts) continue;
      const g = geo[id];
      g.dC = metroRoute(pts, 16);
      g.C = sample(g.dC);
      router.addLine(g.C, true);
      customRoutes.set(id, pts);
    }
    scratchG.remove();
    return true;
  }
  routeCustomShunts(store.get().params);
  scratchG.remove();
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

  const polyD = (pts) => {
    // Catmull-Rom → cubic Bézier for a smooth morph
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  // (A square root, not Math.hypot: hypot is a builtin call whose answer is boxed in a new number each time, and this ran over every segment
  // of every vessel on a frame that eased the radii. The same length to the last digit or two.)
  const arcLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; L += Math.sqrt(dx * dx + dy * dy); } return L; };
  // A drawn course's length, kept with the course it was measured on (the arrays are replaced, never changed in place, when the geometry moves).
  function lenOfItem(it) {
    const o = it.obj;
    if (o.glLenPts !== it.pts) { o.glLenPts = it.pts; o.glLenV = arcLen(it.pts); }
    return o.glLenV;
  }
  // (The tangent at sample j: central differences, written into tanOut.)
  const tanOut = [0, 0];
  function tanAt(pts, j) {
    const p0 = pts[Math.max(0, j - 1)], p1 = pts[Math.min(pts.length - 1, j + 1)];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], n = Math.hypot(dx, dy) || 1;
    tanOut[0] = dx / n; tanOut[1] = dy / n;
  }
  // (Every caller reads its four numbers at once, by destructuring or spreading, before the next call: one kept array.)
  const pointOut = [0, 0, 0, 0];
  function pointAt(pts, u) {
    const f = clamp(u, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    const a = pts[i], b = pts[i + 1];
    // The tangent blends between the directions at the two samples (central differences), so a
    // mark gliding along a curve turns smoothly instead of snapping at each sample.
    tanAt(pts, i);
    const ta0 = tanOut[0], ta1 = tanOut[1];
    tanAt(pts, i + 1);
    const tb0 = tanOut[0], tb1 = tanOut[1];
    pointOut[0] = a[0] + (b[0] - a[0]) * t; pointOut[1] = a[1] + (b[1] - a[1]) * t;
    pointOut[2] = ta0 + (tb0 - ta0) * t; pointOut[3] = ta1 + (tb1 - ta1) * t;
    return pointOut;
  }
  // Tortuous collateral: a smooth serpentine (wavelength ≈ 64 units) along the centerline,
  // tapered to zero at both ends so the vessel still meets its nodes.
  function wiggle(pts, amp, seed) {
    if (amp < 0.3) return pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1] || 1;
    const k = Math.max(1.5, Math.round(L / 90)) * Math.PI * 2 / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const env = Math.min(1, u * 6, (1 - u) * 6);
      const w = amp * env * Math.sin(cum[i] * k + seed);
      return [p[0] + nx * w, p[1] + ny * w];
    });
  }
  // Lateral offset of `off` units at mid-course, easing to zero at both ends (or, with `u0`, at
  // `u0` along the vessel and the far end: the strands leave a single trunk there).
  // With a stretch `span` [from, to] the strand leaves and rejoins the vessel there, its bow a little uneven (`ph`).
  function braid(pts, off, u0 = 0, span = null, ph = 0) {
    if (Math.abs(off) < 0.3) return pts;
    if (span) {
      // One normal for every strand (across the vessel's chord), so a bend in the vessel never kinks a strand or
      // makes two cross.
      const [ua, ub] = span, n0 = pts.length - 1, A = pts[0], B = pts[n0];
      const cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
      return pts.map((p, i) => {
        const v = (i / n0 - ua) / (ub - ua);
        if (v <= 0 || v >= 1) return p;
        const o = off * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
        return [p[0] + nx * o, p[1] + ny * o];
      });
    }
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const o = off * Math.sin(Math.PI * clamp((i / (pts.length - 1) - u0) / (1 - u0), 0, 1));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  // `b` blended in over `a` past `u0` along the vessel (a short smooth ramp): before it, `a`.
  function blendFrom(a, b, u0) {
    const n = a.length - 1;
    return a.map((p, i) => { const e = clamp((i / n - u0) / 0.12, 0, 1), k = e * e * (3 - 2 * e); return [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]; });
  }
  // Light comes from the top (slightly left). For each sample: the unit normal and how much it
  // faces the light (n·L), so a tube's sheen and shade slide smoothly around its curves.
  // (Written into `out`, the vessel's own list of triples (geo[..].lit), whose readers take what they need from it at once.)
  function litNormals(pts, out) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const o = out[i];
      o[0] = nx; o[1] = ny; o[2] = nx * LIGHT[0] + ny * LIGHT[1];
    }
    return out;
  }
  // Outline of a tube of radius r(u) along pts (with round ends), as a closed path. The end caps
  // are explicit half-circles bulging along the tangent, so they are always convex.
  function tubeOutline(pts, lit, rOf) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const r = rOf(i / (n - 1));
      const [nx, ny] = lit[i];
      L.push([pts[i][0] + nx * r, pts[i][1] + ny * r]); R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
    }
    const cap = (i, r, fwd) => {
      const [nx, ny] = lit[i];
      const tx = ny * fwd, ty = -nx * fwd; // tangent pointing out of the tube at this end
      const out = [];
      for (let k = 1; k < 8; k++) {
        const th = (k / 8) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
        const sx = fwd > 0 ? nx * c : -nx * c, sy = fwd > 0 ? ny * c : -ny * c;
        out.push([pts[i][0] + (sx + tx * sn) * r, pts[i][1] + (sy + ty * sn) * r]);
      }
      return out;
    };
    // Along the left side, round the far end (left → right), back along the right side, round the
    // near end (right → left).
    const ring = [...L, ...cap(n - 1, rOf(1), 1), ...R.reverse(), ...cap(0, rOf(0), -1)];
    return 'M' + ring.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z';
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
  // The point half way along a drawn vessel, by length, and the direction it runs there.
  // (at: how far along, 0.5 by default: the middle.)
  const arcOut = [0, 0, 0, 0];   // (read at once by every caller, by destructuring or spreading)
  function arcMid(pts, at = 0.5) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (run + seg >= total * at && seg > 0) {
        const u = (total * at - run) / seg, dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        arcOut[0] = pts[i - 1][0] + dx * u; arcOut[1] = pts[i - 1][1] + dy * u; arcOut[2] = dx / seg; arcOut[3] = dy / seg;
        return arcOut;
      }
      run += seg;
    }
    arcOut[0] = pts[0][0]; arcOut[1] = pts[0][1]; arcOut[2] = 1; arcOut[3] = 0;
    return arcOut;
  }

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
  // ── Vessel glow: one engine for every highlight ──
  // Hover, a slide's glows, a step's focus, the Doppler's vessel and a change in pressure all light a vessel the same
  // way: a thin soft band hugging its live wall on both sides, fading to nothing at a free end, drawn by the GPU with
  // the vessels (veins-gl.js, tube rows 10 and 11). It follows every move and pulse for free: no blur, no mask, no
  // outline to rebuild. Each source asks for vessels in a colour (null: the vessel's own); a vessel several sources
  // light takes the colour of the last in GLOW_RANK. Each eases in and out on its own, so a change cross-fades.
  const GLOW_RANK = ['spot', 'sel', 'hover', 'flash', 'delta', 'dop', 'slide', 'focus', 'shunt', 'key'];
  // (A Map for every source GLOW_RANK names, made here once: setGlowSrc is asked only for those, so none is made on a call.)
  const glow = { src: new Map(GLOW_RANK.map((k) => [k, new Map()])), lit: new Map(), raf: 0, t: 0 };
  // The glow and hover eases step at the display's rate, but the vessels are redrawn at the paced rate (animate): an
  // ease only marks the tubes stale, and the paced frame rebuilds and uploads them once.
  let glowSync = false;
  /** list: [{ id, col (a CSS colour, or null), amt (strength, 1 by default), wide (band width ×, ≤ 1.3), at (ms to wait before easing in),
   *  span ([from, to] along the vessel, 0–1: only that stretch glows, as a stent's third) }] */
  const glowWant = new Map();   // (the vessels wanted: emptied and filled again by each setGlowSrc)
  const glowPairs = [];   // (each wanted vessel's two ends, as node, colour, node, colour…: how many glow in which colour at a node)
  // (Two sources lighting a vessel in one colour are merged into one of these, written in place: one per vessel, made once, and read only
  // within the call that fills glowWant.)
  const glowLitPool = {};
  for (const id in E) glowLitPool[id] = { v: 0, to: 0, col: null, from: null, cu: 1, rgb: undefined, end: [0, 0], endT: [0, 0], span: [0, 0], spanT: [0, 1] };
  const glowMergePool = ALL_EDGES.map(() => ({ merged: true, id: undefined, col: undefined, amt: undefined, wide: undefined, at: undefined, top: undefined, dur: undefined, span: undefined }));
  // How far from its end a glow fades: a free end over a third of the vessel, an end that meets another colour over a few units, and none
  // where it runs on into a vessel glowing in the same colour.
  function glowEnd(n, key, len) {
    let tot = 0, same = 0;
    for (let i = 0; i < glowPairs.length; i += 2) if (glowPairs[i] === n) { tot++; if (glowPairs[i + 1] === key) same++; }
    return tot < 2 ? 0.35 * len : same > 1 ? 0 : Math.min(0.3 * len, 16);
  }
  function setGlowSrc(src, list) {
    const mine = glow.src.get(src);
    if (mine) { mine.clear(); if (list) for (let i = 0; i < list.length; i++) if (E[list[i].id]) mine.set(list[i].id, list[i]); }
    const want = glowWant;
    want.clear();
    let merged = 0;
    // (Two sources lighting a vessel in the same colour keep the stronger, wider glow: hovering a selected vessel never dims it.)
    for (let ri = 0; ri < GLOW_RANK.length; ri++) {
      const m = glow.src.get(GLOW_RANK[ri]);
      if (m) for (const [id, g] of m) {
        const was = want.get(id);
        if (was && (was.col ?? null) === (g.col ?? null)) {
          // (A vessel merged again by a third source takes its own record on: one record per vessel is all a call can need.)
          const o = was.merged === true ? was : glowMergePool[merged++], amt = Math.max(was.amt ?? 1, g.amt ?? 1), wide = Math.max(was.wide || 1, g.wide || 1);
          o.id = g.id; o.col = g.col; o.at = g.at; o.top = g.top; o.dur = g.dur; o.span = g.span; o.amt = amt; o.wide = wide;
          want.set(id, o);
        } else want.set(id, g);
      }
    }
    // (The Doppler's gate on a stent outranks a slide's or a mark's glow on it: the third it samples is the one that shows.)
    const dm = glow.src.get('dop');
    if (dm) for (const [id, g] of dm) if (g.span) want.set(id, g);
    // Which ends fade: an end that meets another vessel glowing in the same colour runs on into it (even where a third colour also joins, as the IMV joins the splenic vein); one that meets
    // another colour fades over a few units, so the two meet softly; a free end fades over a third of the vessel.
    glowPairs.length = 0;
    for (const [id, g] of want) { const e = E[id].e, c = g.col ?? ''; glowPairs.push(e.from, c, e.to, c); }
    const now = performance.now();
    for (const [id, g] of want) {
      const len = Math.max(1, geo[id]?.len || 60), key = g.col ?? '';
      let l = glow.lit.get(id);
      if (!l) {   // (a vessel's record from its own, made once; it is as a new one would be, taken out of glow.lit when its glow ends and put back as it starts)
        l = glowLitPool[id];
        l.v = 0; l.to = 0; l.col = g.col; l.from = null; l.cu = 1; l.rgb = undefined;
        l.end[0] = 0; l.end[1] = 0; l.endT[0] = 0; l.endT[1] = 0; l.span[0] = 0; l.span[1] = 0; l.spanT[0] = 0; l.spanT[1] = 1;
        glow.lit.set(id, l);
      }
      if (!l.to) l.start = now + (g.at || 0);
      if (l.col !== g.col) { l.from = l.v > 0 && l.col && l.rgb ? l.rgb : null; l.cu = l.from ? 0 : 1; l.col = g.col; }
      l.to = 1; l.amt = g.amt ?? 1; l.wide = g.wide || 1; l.top = !!g.top; l.dur = (g.dur || 450) / 1000;
      l.endT[0] = glowEnd(E[id].e.from, key, len); l.endT[1] = glowEnd(E[id].e.to, key, len);
      if (l.v <= 0) { l.end[0] = l.endT[0]; l.end[1] = l.endT[1]; }
      // A stretch eases along the vessel to its new place (a whole vessel is the stretch 0–1).
      if (g.span) { l.spanT[0] = g.span[0]; l.spanT[1] = g.span[1]; } else { l.spanT[0] = 0; l.spanT[1] = 1; }
      if (l.v <= 0) { l.span[0] = l.spanT[0]; l.span[1] = l.spanT[1]; }
    }
    // (A slide's halos leave in one small step with its cards and labels, not at the 500 ms they come in over: a leave takes the step below its
    // entrance, and the camera sets off as the cards are gone, so no old halo is still fading as it moves. ?onemove=0: as before.)
    for (const [id, l] of glow.lit) if (!want.has(id)) { l.to = 0; if (src === 'slide') l.dur = Math.min(l.dur, D_SMALL / 1000); }
    if (!glow.raf) { glow.t = now; glow.raf = nextFrame(glowStep); }
  }
  function glowStep(now) {
    const dt = Math.min(0.1, (now - glow.t) / 1000); glow.t = now;
    let moving = false;
    for (const [id, l] of glow.lit) {
      if (l.to && now < l.start) { moving = true; continue; }
      const k = reduceMotion.matches ? 1 : dt / l.dur;
      l.v = l.to > l.v ? Math.min(1, l.v + k) : Math.max(0, l.v - k);
      l.cu = Math.min(1, l.cu + k);
      for (let i = 0; i < 2; i++) { const d = l.endT[i] - l.end[i]; l.end[i] = Math.abs(d) < 0.5 ? l.endT[i] : l.end[i] + d * Math.min(1, k * 2); }
      for (let i = 0; i < 2; i++) { const d = l.spanT[i] - l.span[i]; l.span[i] = Math.abs(d) < 0.003 ? l.spanT[i] : l.span[i] + d * Math.min(1, k * 1.5); }
      if (l.v <= 0 && !l.to) glow.lit.delete(id);
      else if (l.v !== l.to || l.cu < 1 || l.end[0] !== l.endT[0] || l.end[1] !== l.endT[1] || l.span[0] !== l.spanT[0] || l.span[1] !== l.spanT[1]) moving = true;
    }
    glowSync = true; stageWake();
    glow.raf = moving ? nextFrame(glowStep) : 0;
  }
  // The watched vessels (REVERSAL_WATCH) whose flow runs against its healthy direction, as shown: their stations' value
  // pills carry ⟲. In an imaging case it waits, as the blood does, until a Doppler has looked at the flow.
  const revShown = new Set();
  // The Doppler's vessel glows (--dop-glow: white on the dark themes, ink on the light ones; 19 Oct, it was the Doppler's green, which
  // reads as "normal") while its instrument is open; on a stent, only the third its gate samples. The probe looks at it (dprobePaint).
  // (points: a slide's Doppler on a stent shows a callout at each of its three points, not just the sampled one.)
  const dop = { id: null, want: null, pin: null, key: '', seg: '', points: false, all: false };
  const dopGateOf = (id) => (dop.id === id && dop.seg ? dop.seg : '');   // the third of a stent the Doppler samples ('' when it is elsewhere)
  // The Doppler probe on the figure (dprobePaint): live once the stage is built (dopApply runs before its pieces exist).
  // (The Doppler probe's state, all of it numbers made once: where it stands (cur, eased to tgt; nxt is the place being weighed), how far it has
  // swung out (oP, 0 … 1) and how much of its head shows (headP), and `draw`, the record the labels' GPU layer draws it from, label-gl.js drawProbe.
  // `el` is a model of plain styled nodes the layer reads its look from, never placed or changed: dprMake.)
  const dpr = { el: null, on: false, keyOn: false, keyId: null, keySeg: null, side: 0, reach: 0, rev: false, k: 1, has: false, cur: { ang: 0, d: 0, k: 1, o: 0 }, tgt: { ang: 0, d: 0, k: 1, ax: 0, r: 0, sw: 0 }, nxt: { ang: 0, d: 0, k: 1, ax: 0, r: 0, sw: 0 },
    hold: 0, mon: false, noneT: 0, headOff: false, headP: 1, eRaf: 0, eAt: 0, box: null, boxA: { x0: 0, y0: 0, x1: 0, y1: 0 }, marks: [], swap: 0, ready: false, gate: null, gateA: [0, 0], monAt: 0, syncKey: -1, searchAt: 0, searchGap: 150, lastSig: -1,
    refitUntil: 0, carry: false, track: false, oP: 1, leaving: false, leaveT: 0, draw: makeProbeDraw(), pose: makeProbePose(), hId: null, hIdV: 0, hSeg: null, hSegV: 0 };
  let dopKeyOn = false, dopKeyId = null, dopKeySeg = '', dopKeyAll = false;   // (what dop.key was made of)
  const dopGlow = { id: null, col: 'var(--dop-glow)', amt: 1.1, wide: 0.8, dur: 360, top: true, span: null }, dopGlowList = [dopGlow], noGlows = [];
  function dopApply() {
    let id = dop.pin ?? dop.want ?? null;
    if (id && !E[id]) id = null;
    const st = store.get(), seg = id && isStent(EDGES[EI[id]]) ? stentGate(st.dopGate, st.params, id) : '';
    const all = !!seg && dop.points && id === dop.pin;
    if (dopKeyOn && id === dopKeyId && seg === dopKeySeg && all === dopKeyAll) return;   // (the key's text is made only when one of the three moved)
    dopKeyOn = true; dopKeyId = id; dopKeySeg = seg; dopKeyAll = all;
    const key = `${id}|${seg}|${+all}`;
    dop.id = id; dop.key = key; dop.seg = seg; dop.all = all;
    dpr.kick?.();   // (the monitor's look, now for this vessel: dprMonTick)
    // (On a slide it waits for the slide's camera: the framing comes a moment after the slide's tool, once its cards land, and the
    // probe showed before the zoom, went with it and came back after (Doppler 2, Mohammad, 20 Oct). animateVT lets it go.)
    if (id && store.get().presenting) dprHold();
    // (On top of every vessel it crosses, as a glow should lie (18f2e33): the stent's lit third over the hepatic vein above it, Review 15 Oct.)
    if (id) { dopGlow.id = id; dopGlow.span = seg ? STENT_SPANS[seg] : null; }
    setGlowSrc('dop', id ? dopGlowList : noGlows);
    dprobePaint();
  }
  // A presenter slide's glows (glow: [...] and its terms' vessels), each in its station's colour. Slide, focus and
  // Doppler glows are a slim, soft band (smaller than a hover's), so they mark the vessel without swamping it.
  const toneCol = (tone) => (tone.startsWith('--') ? `var(${tone})` : tone === 'accent' ? 'var(--accent)' : `var(--tr-${tone})`);
  let slideGlow = [], glowSetAt = 0;   // (the slide's glows as set, and when: a glowSeq slide's step numbers follow them, V10)
  const slideGlowObjs = [], slideGlowOut = [];   // (the glows handed to setGlowSrc, written in place; it keeps the objects only until the next call)
  function setGlow(list) {
    slideGlow = list || [];
    glowSetAt = performance.now();
    slideGlowOut.length = 0;
    if (list) for (let i = 0; i < list.length; i++) {
      const g = list[i], o = slideGlowObjs[i] || (slideGlowObjs[i] = {});
      o.id = g.id; o.col = toneCol(g.tone || 'accent'); o.amt = g.soft ? 0.55 : 1; o.wide = g.soft ? 0.8 : 0.75; o.at = g.at; o.dur = 500;
      slideGlowOut.push(o);
    }
    setGlowSrc('slide', slideGlowOut);
  }
  // The hovered vessel glows softly in its own colour (and its lumen brightens a little, vh: tube row 9).
  // Each vessel's brightening eases in and out on its own, so moving from one vessel to the next cross-fades.
  // The selected vessel (sel: it and, on the cava, the rest of the cava) takes the same brightening, and selA eases its
  // standing out of the dimmed network in and out (syncVeins), so selecting and deselecting never snap.
  const vh = { id: null, also: null, amt: new Map(), sel: new Set(), selKey: '', selA: new Map(), raf: 0, t: 0 };
  // A slide's spotlight (deck visuals V2, ext-highlights.js: spot): the network and the organs step back as for a selection,
  // the named vessels stand out of it as a selected one does (selA, vhStep) and the named organs are outlined. Never in the
  // liver's own views. live: from the spotlight set until the plate has eased back after it (the ascites follows it there).
  const spot = { ids: new Set(), on: false, live: false };
  const spotOn = () => spot.on && !store.get().lobule && !store.get().sinusoid;
  const SEL_FADE = 0.3;
  const selAKey = () => { let k = ''; for (const [id, v] of vh.selA) k += id + v; return k; };

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
  const diveAtBuf = [0, 0];   // (diveAt's pair, written in place)
  const DIVE_MS = 2200, RISE_MS = 1300;
  let diveZ = 0;   // the dive's zoom so far (log scale), kept for cameraZoom
  let riseLine = false, riseFast = false, zShift = 0;   // (zShift: for cameraZoom, the plate's zoom is reset unseen when the rise begins)
  // The anatomy's share of the zoom (×16), the field's the rest: the camera goes deep into one part of the liver, its vessels still
  // drawn, before any lobule shows (Mohammad, 24 Oct, on an iPad: at ×5 the liver and its portal branches still filled the screen as
  // the lobules came in). RH: a lobule's radius on screen (px) at that zoom, about true to scale, a lobule (1 to 1.5 mm) being about
  // 1/130 of the liver's width (6 px at ×5). The whole dive stays about ×140 on a phone and ×230 on a Mac.
  const LC = Math.log(16);
  const RH = 19;
  // The hand-over from the anatomy to the field, on the zoom: the field starts to come in at FIELD_IN and is whole (opaque) at
  // FIELD_WHOLE, where the magnified anatomy under it is hidden. About two octaves of zoom (×4.7), so it takes about a third of a
  // second at the dive's fastest instead of a sixth: the lobules came in, and the anatomy's vessels went, all at once (Mohammad, 25 Oct).
  const FIELD_IN = LC - 1.2, FIELD_WHOLE = LC + 0.35;
  // (The zoomed layers, in one kept list written in place: the callers loop over it at once and never keep it.)
  const diveElsBuf = [];
  const diveEls = () => {
    const b = diveElsBuf, over = wrap.querySelector('#stageOver'), lab = wrap.querySelector('#labels');
    b.length = 0;
    if (svg) b.push(svg);
    if (over) b.push(over);
    if (lab) b.push(lab);
    if (vCanvas) b.push(vCanvas);
    return b;
  };
  // Each zoomed layer's offset in the stage, for its zoom's origin. From the boxes, not offsetLeft/Top: an SVG has none, and its origin
  // would fall back to its own centre, so the overlays (stents, the Doppler's glow) drifted from the anatomy as it zoomed. Read when a
  // dive or rise is asked for (setLobule, an input or a slide's change), never in the zoom's frames.
  const diveOffs = new Map();
  const diveOffPool = [[0, 0], [0, 0], [0, 0], [0, 0]], DIVE_ORIGIN_ZERO = [0, 0];   // (one pair per zoomed layer, written in place; the layers are four at most)
  function diveOffsRead() {
    const w0 = wrap.getBoundingClientRect();
    diveOffs.clear();
    const els = diveEls();
    for (let i = 0; i < els.length; i++) { const el = els[i], r = el.getBoundingClientRect(), o = diveOffPool[i]; o[0] = r.left - w0.left; o[1] = r.top - w0.top; diveOffs.set(el, o); }
  }
  const diveTargetPt = [0, 0];   // (the dive's spot in the liver, written in place; its callers read it at once)
  function diveTarget() {
    const lb = liverBox();
    if (!lb) return null;
    diveTargetPt[0] = lb.x + lb.w * 0.42; diveTargetPt[1] = lb.y + lb.h * 0.5;
    return diveTargetPt;
  }
  const smoothT = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // The elements' offsets are read once per dive, before any write: read between writes, each would
  // make the browser lay the page out again, every frame.
  let diveOrig = null, diveHid = false, labHid = false;
  function setDiveHidden(on, lab = on) {
    lab = !!(on || lab);
    if (on === diveHid && lab === labHid) return;
    diveHid = on; labHid = lab;
    const els = diveEls();
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      // (The lobule is drawn in the figure's own canvas: hiding that canvas hid the lobule and its field with it, black until the dive settled. The figure's alpha, camDive, hides the anatomy there.)
      if (el === vCanvas && lz?.shared) { el.style.visibility = ''; continue; }
      el.style.visibility = (el.id === 'labels' ? lab : on) ? 'hidden' : '';
    }
  }
  // The anatomy is out of sight: under the landed lobule (or the sinusoid), or under the dive's field once it is whole. Until then,
  // through the start of a dive and the end of a rise, it shows, magnified, and goes on following the patient as it does anywhere:
  // the ascites filling, a varix growing, the liver changing play on through the zoom (Mohammad, 30 Oct: they paused while the
  // view zoomed into or out of the lobule, and went on once it landed).
  // (Only with the changing organs painted live: otherwise an ease drops the organs' picture for the live SVG, which Safari, scaled by
  // the dive, drew without its masked groups (the stomach, the gut). There the anatomy holds through the dive as before.)
  const anatCovered = () => (lobuleOn && diveT >= 1) || !!lz?.isOpen() || !!lz?.covers() || (diveHid && diveT > 0 && diveT < 1) || (lobuleOn && !liveOn());
  // The field fades in over the anatomy, which stays whole beneath it and is hidden only once the field covers it, so nothing pops out
  // of or into view at either end of the zoom and the page never shows through between them (see diveFrame). Opacity on layers the zoom already composites costs nothing per frame;
  // their usual .25s opacity transition is held off while it is driven frame by frame (and eases the anatomy back in under the landed lobule).
  let diveFadeO = null;
  // The figure's canvas is moved and faded by its renderer's final present (veins-gl setCamera), not by CSS on the canvas: a CSS scale or
  // opacity takes the cards' glass drawn in it along, and the glass goes solid for the ease, the fade and the dive. camK/camOx/camOy: the
  // dive's zoom and its origin (CSS px from the canvas's corner); camDive/camShow: the dive's hide and the figure's own fade-in, each 0 to 1.
  let lobIn = false;   // (the lobule is landed and drawn in this renderer's context: the figure's alpha is 0 under it)
  let camK = 1, camOx = 0, camOy = 0, camDive = 1, camShow = 1, camShowRaf = 0, camShowT0 = 0, camShowFrom = 1, camShowTo = 1;
  function pushCam() {
    if (!veins || veins.lost) return;
    const sx = vCanvas.width / (boxW || vCanvas.width || 1), sy = vCanvas.height / (boxH || vCanvas.height || 1);
    // (Landed in the lobule drawn in this renderer's own context: the figure under it is not laid at all, as #veins was hidden before.)
    veins.setCamera(camK, camOx * sx, camOy * sy, lobIn ? 0 : camDive * camShow);
  }
  function camShowStep(now) {
    camShowRaf = 0;
    const u = Math.min(1, (now - camShowT0) / D_SMALL), e = u * u * (3 - 2 * u);
    camShow = camShowFrom + (camShowTo - camShowFrom) * e;
    pushCam();
    if (u < 1) camShowRaf = drawFrame(camShowStep);
  }
  // (The figure's own fade, the first framing and a hide: eased over the same D_SMALL the canvas's CSS transition had, as an alpha.)
  function camShowTo_(to) {
    if (camShowTo === to && (camShowRaf || camShow === to)) return;
    camShowFrom = camShow; camShowTo = to; camShowT0 = performance.now();
    if (camShowRaf) cancelFrame(camShowRaf);
    if (reduceMotion.matches) { camShow = to; camShowRaf = 0; pushCam(); return; }
    camShowRaf = drawFrame(camShowStep);
  }
  function setDiveFade(o) {
    const q = o === null ? null : Math.round(o * 1000) / 1000;   // (o is 0 or 1 here; to the thousandth, with no string made)
    if (q === diveFadeO) return;
    diveFadeO = q;
    fadeStop(vCanvas);   // (a resolution fade gives the canvas's opacity back to the dive at once: both set it, and its copy does not zoom)
    const els = diveEls();
    for (let i = 0; i < els.length; i++) { const el = els[i]; if (el.id === 'labels') continue; if (el === vCanvas) { camDive = q === null ? 1 : q; pushCam(); continue; } el.style.transition = q === null ? '' : 'none'; el.style.opacity = q === null ? '' : q; }
  }
  // (keep: landed in the lobule, the anatomy stays hidden under it a moment longer, see diveFrame.)
  let unhideAt = 0;
  // The zoomed layers and the origin each is scaled about: one list, its pairs kept and written in place. (diveOrig is that list while a dive
  // is on, null otherwise; the list stays as it was after the dive, for the layer hint's drop a frame later.)
  const diveOrigBuf = [], diveOrigPool = [[null, ''], [null, ''], [null, ''], [null, '']];
  const diveWillOff = () => {
    if (diveOrig) return;
    for (let i = 0; i < diveOrigBuf.length; i++) { const el = diveOrigBuf[i][0]; el.style.willChange = ''; el.style.transform = ''; }
  };
  const diveUnhide = () => { if (diveT >= 1 && lobuleOn) { setDiveHidden(false, false); setDiveFade(null); } };
  function setDiveScale(k, keep = false) {
    if (k <= 1.0001) {
      if (!keep) { setDiveHidden(false, false); setDiveFade(null); }
      // The transform goes first and the layer hint a frame later: dropping both at once can leave the
      // browser showing the last zoomed picture while clicks already land on the unzoomed figure.
      if (diveOrig) { for (let i = 0; i < diveOrig.length; i++) { const el = diveOrig[i][0]; if (el === vCanvas) continue; el.style.transform = 'none'; el.style.transformOrigin = ''; } camK = 1; pushCam(); nextFrame(diveWillOff); }
      // The stage's measured box (and so the drawing transform) may have been taken while the dive's zoom
      // was on, which would keep the canvas drawn zoomed in after it ends: measure again.
      if (diveOrig) { box = null; CTM = null; }
      diveOrig = null; return;
    }
    if (!diveOrig) {
      const [ox, oy] = diveAt;
      // (The layers' offsets in the stage were read as the dive was asked for (diveOffsRead), outside any frame; a layer not
      // read then stands at the stage's corner, as all of them do.)
      const els = diveEls(), b = diveOrigBuf;
      b.length = 0;
      for (let i = 0; i < els.length; i++) { const el = els[i], d = diveOffs.get(el) || DIVE_ORIGIN_ZERO, pr = diveOrigPool[i]; pr[0] = el; pr[1] = `${(ox - d[0]).toFixed(1)}px ${(oy - d[1]).toFixed(1)}px`; b.push(pr); if (el === vCanvas) { camOx = +(ox - d[0]).toFixed(1); camOy = +(oy - d[1]).toFixed(1); } }
      diveOrig = b;
      for (let i = 0; i < b.length; i++) { const el = b[i][0]; if (el === vCanvas) continue; el.style.willChange = 'transform'; el.style.transformOrigin = b[i][1]; }
      fadeStop(vCanvas);   // (likewise: the copy laid over the canvas would stand still while the dive zooms it)
    }
    const tf = `scale(${k.toFixed(4)})`;
    for (let i = 0; i < diveOrig.length; i++) { const el = diveOrig[i][0]; if (el !== vCanvas) el.style.transform = tf; }
    camK = k; pushCam();
  }
  const diveFrom = [0, 0], diveTo = [0, 0];   // (the rise's two ends, written in place for riseCentre)
  const diveField = { a: 0, x: 0, y: 0, r: 0, ox: 0, oy: 0, quiet: 0, focus: 0, blur: 0, dof: 0 };   // (the field's state for lz.setDive, written in place)
  function diveFrame(t) {
    if (diveAt && diveLand) {
      // The whole zoom in one log scale. The lobule's place is read live, so the field settles exactly
      // where the view frames it.
      if (lz.isShown()) diveLand = lz.current();
      else if (lobuleOn) lz.warm();
      const lt = LC + Math.log(Math.max(RH * 2, diveLand.r) / RH);
      // Eased in and out (smootherstep), one ease over the whole log scale: the anatomy's part and the field's run on at the same
      // speed where they meet. (Each part had its own rate, so the zoom sped up by a sixth or more, suddenly, a third of the way in.)
      // (riseFast: a way out of the landed lobule moves from its first frame; the dive's ease starts at rest and held the lobule
      // still for its first 120-160 ms. A reversal keeps the curve it was on, so nothing jumps.)
      // (A sine ease: from rest and back to rest, its fastest a sixth slower than the smootherstep's, which passed the hand-over at
      // its peak speed.)
      const TJ = riseFast ? 1 : 0.84, u = clamp(t / TJ, 0, 1);
      const p = riseFast ? u * u * (2 - u) : (1 - Math.cos(Math.PI * u)) / 2;
      const z = lt * p;
      diveZ = z;
      // Landed in the lobule: the anatomy under it is shown again only once the lobule has settled and its flow marks have
      // faded in. (Shown in the landing frame, Safari redrew the whole figure there, with everything else the landing does.)
      const landed = t >= 1 && !diveOut;
      setDiveScale(t >= 1 ? 1 : Math.exp(Math.min(z, LC + 0.4)), landed);
      if (landed) { clearTimeout(unhideAt); unhideAt = setTimeout(diveUnhide, 500); }
      // The anatomy stays whole under the field as it fades in (and out, on the way back), and is hidden only once the field covers
      // it. (Faded out on the field's curve, the two half-clear layers let the page through, about a fifth of it, for a fifth of a
      // second as the field took over: a dark flash zooming in, in dark mode, Mohammad, 24 Oct. Zooming out it fell where the field
      // itself was already fading into the page, so it did not show.)
      setDiveFade(t <= 0 ? null : landed ? 0 : 1);
      // The anatomy's labels leave as the zoom starts.
      const lab = wrap.querySelector('#labels');
      // (Going out they come back over the last half of the zoom, in place, rather than at the very end.)
      if (lab) lab.style.opacity = t <= 0 ? '' : (1 - smoothT(0, diveOut ? 0.55 : 0.12, t)).toFixed(3);
      // The detailed lobule comes in while the zoom is still settling, zooming with the field.
      const r = RH * Math.exp(z - LC);
      const [ox, oy] = diveAt;
      // Going in, the zoom's centre drifts from the dive point to the lobule's place. Going out (riseLine), one straight pull-out:
      // the lobule is scaled about one fixed point, so it leaves its place in step with the zoom and ends on the dive point, with
      // no sideways pan across it first (rise-path.js).
      const g = smoothT(LC - 0.5, lt, z);
      let px, py;
      if (riseLine) { diveFrom[0] = diveLand.x; diveFrom[1] = diveLand.y; diveTo[0] = ox; diveTo[1] = oy; const c = riseCentre(diveFrom, diveTo, Math.exp(-lt), Math.exp(z - lt)); px = c[0]; py = c[1]; }
      else { px = lerp(ox, diveLand.x, g); py = lerp(oy, diveLand.y, g); }
      // The detailed lobule rides on the field's own lobule at that centre, so it grows out of it.
      lz.setDiveZoom(t >= 1 ? 1 : clamp(r / diveLand.r, 0.05, 1), diveLand.x, diveLand.y, px, py);
      // (The field's state is one kept object written in place: lobule-zoom.js reads it at once and keeps none of it.)
      const df = diveField;
      if (t <= 0 || t >= 1) lz.setDive(null);
      else {
        // The field comes in only over the anatomy's last stretch (×5 to ×23, its lobules a fine grain a few px across), whole
        // where the anatomy is hidden; its neighbours drain and fade into the page only once it is whole, toward the landing, so the
        // grain fills the screen first. (On the zoom, not the clock: the way out passes the same pictures in reverse.)
        df.a = smoothT(FIELD_IN, FIELD_WHOLE, z); df.x = px; df.y = py;
        df.r = r; df.ox = ox; df.oy = oy; df.quiet = smoothT(lerp(FIELD_WHOLE, lt, 0.4), lt, z); df.focus = smoothT(FIELD_WHOLE, lt, z);
        // A focus pull: the field comes in soft, the liver's grain, and sharpens into lobules as it becomes whole; and a depth of
        // field: the lobules away from the one being landed on stay a little soft through the zoom, sharp again as it lands, where
        // the lobule view's own surround takes over (GPU only: lobule-zoom.js paintFieldGL).
        df.blur = 1 - smoothT(FIELD_IN, FIELD_WHOLE + 0.3, z); df.dof = smoothT(FIELD_IN + 0.3, FIELD_WHOLE + 0.6, z) * (1 - smoothT(lt - 0.9, lt, z));
        lz.setDive(df);
      }
      // Once the field is whole (fully opaque, from z = FIELD_WHOLE) the magnified anatomy beneath it is not seen: it is hidden, so the
      // browser stops compositing it (Safari redraws a scaled SVG at each new scale, every frame); the labels as soon as they have faded.
      if (!landed) setDiveHidden(t > 0 && t < 1 && z >= FIELD_WHOLE, lab && t > 0 && t < 1 && +lab.style.opacity <= 0.001);
    }
    lobU = easeInOut(clamp((t - 0.48) / 0.4, 0, 1));
    syncSemantic();
  }
  // Before the way out of a landed lobule (prepRise, asked for by the presenter as the slide changes): the anatomy under it, still
  // covered, follows the model again and its organs' picture is made for the patient now, so the rise fades in a current picture.
  // (Left as it was under the lobule, the picture held the patient from before the dive: shown through the rise and swapped at
  // landing, the organs changed in one frame; dropped as the rise began, the live drawing showed, scaled up by the zoom, and
  // Safari lost its masked groups, the stomach and gut, until partway down: Mohammad, 20 Oct, HVPG 7 to 8.)
  let risePrep = false, risePrepT = 0;
  function prepRise() {
    if (!lobuleOn || diveT < 1 || morphTarget !== 0 || risePrep) return;
    risePrep = true; clearTimeout(risePrepT); risePrepT = setTimeout(() => { risePrep = false; }, 6000);   // (never left on in the lobule)
    if (F && !inUpdate) update(F);
    platePoke();
  }
  // The organs' picture is made for the patient now (prepRise is done: it ends when that picture lands), or there is none to wait for.
  function riseReady() {
    if (!risePrep || !F || !veins || veins.lost || !glWanted(easeInOut(morph)) || figureHidden() || !lobuleOn) return true;
    // (With the changing organs painted live, the picture holds none of them: the rise sets off while the fluid, the liver or the
    // spleen still ease, and they go on easing in view as it zooms out, drawn live, rather than finishing unseen first.)
    return plateOn() && !plateBusy && (liveOn() || (!lvMoving && !fluidEasing() && !spleenMoving())) && plateKey === plateStateKey();
  }
  // (diveWait: a dive waiting for its tissue to be painted ahead, which goes on only if nothing else was asked for meanwhile.)
  let diveWait = 0, diveGen = 0;
  function setLobule(on, painted = false) {
    if (on && morphTarget !== 0) return;
    risePrep = false; clearTimeout(risePrepT);
    if (diveWait) { diveWait = 0; diveGen++; }   // (any other ask calls a waiting dive off; a dive asked again waits afresh)
    const from0 = diveT;
    diveOut = !on;
    if (on) { riseBox = null; riseUsed = false; }
    if (lobuleOn === on && diveT === (on ? 1 : 0)) return;
    // Into the lobule for a new patient: its tissue bitmap is painted in the worker first (lz.paintAhead), so the frame the zoom
    // starts in does not paint it on the main thread (1.8 s on CI's laptop profile, HVPG 5 to 6). The anatomy stays as it is
    // meanwhile (nothing is set: lobuleOn waits too), the slide's words still coming in; the dive then starts as before.
    if (on && diveT === 0 && !painted) {
      const ahead = lz?.paintAhead?.();
      if (ahead) {
        const gen = ++diveGen;
        diveWait = gen;
        ahead.then(() => { if (diveWait === gen && !lobuleOn && diveT === 0) { diveWait = 0; if (store.get().lobule) setLobule(true, true); } });
        return;
      }
    }
    lobuleOn = on;
    logMove({ t: performance.now(), kind: on ? 'dive' : 'rise' });
    cancelFrame(lobAnim);
    if (on && diveT === 0) {
      riseFast = false; riseLine = false;
      const w = diveTarget();
      if (w) {
        refreshCTM();
        const [x, y] = worldToLocal(w[0], w[1]);
        diveAtBuf[0] = clamp(x, 0, wrap.clientWidth); diveAtBuf[1] = clamp(y, 0, wrap.clientHeight); diveAt = diveAtBuf;
      } else { diveAtBuf[0] = wrap.clientWidth / 2; diveAtBuf[1] = wrap.clientHeight / 2; diveAt = diveAtBuf; }
      diveOffsRead();
      diveLand = lz.landing();
      lz.prewarm(diveLand.r);
      lz.stage();   // the lobule is drawn now, for where it lands, and only then does the zoom start (its clock starts below)
    } else if (!on && diveT >= 1) {
      riseLine = true;   // (kept through a reversal, so the lobule stays on the line it was on)
      diveOffsRead();
      riseFast = true;
      lz.stageRise();   // (out of a zoomed-in lobule: its whole copy is drawn now, before the rise's clock starts)
      diveLand = lz.current();
      // The anatomy is covered by the lobule at this point: take it to its fit framing now, unseen, so the way out is one
      // continuous zoom from the lobule's fit to the anatomy's fit, with no correction after it lands.
      if (morphTarget === 0 && liverBox()) {
        // Leaving from the sinusoid, its focus class (main.js) still hides the dock and bars until the store's other
        // listeners run: drop it first, or the fit is measured without them and lands too close, cutting off the ascites.
        if (!store.get().lobule) document.getElementById('app')?.classList.remove('sin-focus');
        cancelFrame(vtAnim); driftEnd(); vtGliding = false;
        refreshCTM(); const zOld = Math.log(CTM.sc);
        const d = defaultVT(false); vt = { ...d }; homeAt = d; fitted = true; applyVT(); CTM = null; refreshCTM();
        // The plate stopped updating under the lobule, so it still holds the old zoom's culling and detail: bring it up to date for the fit now, not when the zoom lands.
        if (F && !inUpdate) { catchUp = true; try { update(F); } finally { catchUp = false; } }
        // The next slide's own framing, if it asked for one: the rise lands there, not at the fit.
        const rv = riseVT();
        riseUsed = !!rv && !sameView(rv, d);
        if (riseUsed) { vt = { ...rv }; applyVT(); CTM = null; refreshCTM(); if (F && !inUpdate) { catchUp = true; try { update(F); } finally { catchUp = false; } } }
        zShift = zOld - Math.log(CTM.sc);
        const w = diveTarget(); if (w) { const [x, y] = worldToLocal(w[0], w[1]); diveAtBuf[0] = clamp(x, 0, wrap.clientWidth); diveAtBuf[1] = clamp(y, 0, wrap.clientHeight); diveAt = diveAtBuf; }
        diveOffsRead(); diveOrig = null; drawOnce = forceDraw = true;   // the vessel canvas is frozen for the zoom: redraw it now at the fit, not the old camera
        if (F) updateLabels(F);   // the labels are laid out for the final framing now, so they come in where they will stay
      }
    }
    // (Lite mode: no zoom, the figure fades in at the lobule or the anatomy.)
    // A reversal mid-way glides back from where it is, at the speed of the move it turns round (eased from rest, not at full speed at once).
    const turn = from0 > 0 && from0 < 1, from = diveT, to = on ? 1 : 0;
    const ms = reduceMotion.matches ? 0 : turn ? (on ? RISE_MS : DIVE_MS) : on ? DIVE_MS : RISE_MS;
    // (Timed by the eases' clock, frame.js easeNow: a long frame mid-zoom holds it back rather than letting it leap ahead. The backstop
    // below passes `end` to land it.)
    const t0 = PACED ? easeNow() : performance.now();
    lobOn = on; lobFrom = from; lobTo = to; lobTurn = turn; lobMs = ms; lobT0 = t0; lobSeen = -1;
    lobuleStep(t0);
    // Backstop: if the frames stop (a throttled or dropped frame loop), land on the end state anyway.
    clearTimeout(lobEnd);
    // (With the eases' clock a run of long frames makes the zoom take longer: it is landed only once it stops moving, frames having stopped.)
    lobEnd = setTimeout(lobuleBackstop, ms * Math.abs(to - from) + 250);
  }
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
  const xfVis = [null, null];
  function viewXfP() { const x = viewXf, t = easeInOut(morph); return x.tT === x.t0 ? 1 : clamp((t - x.t0) / (x.tT - x.t0), 0, 1); }
  // (The label layers the GPU does not draw (the SVG's own, the liver's pane) come in with the new labels.)
  function xfLayer(n) {
    const v = n >= 1 ? '' : n.toFixed(3);
    if (v === xfOp) return;
    xfOp = v;
    if (labelSvg) labelSvg.style.opacity = v;
    glass.style.opacity = v;
  }
  function xfVisFill() {
    for (let v = 0; v < 2; v++) { const a = xfVis[v] ||= new Uint8Array(EV.length); for (let i = 0; i < EV.length; i++) a[i] = F && visAt(EV[i], v === 0) ? 1 : 0; }
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
      const g = geo[r.id], t = easeInOut(morph), a0 = g.A[r.i], a1 = g.A[r.i + 1], c0 = g.C[r.i], c1 = g.C[r.i + 1], w = view === 0 ? 1 - t : t;
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
  function atTargetStage(d, fn, tgt = morphTarget, kept = null) {
    const keepTgt = morphTarget, keepVT = vt, keepMorph = morph, keepLast = lastMorph, vb0 = vbBox.x, vb1 = vbBox.y, vb2 = vbBox.width, vb3 = vbBox.height;
    const curS = [], visS = [];
    glSuppress = true;
    try {
      morph = tgt; lastMorph = tgt; morphTarget = tgt;
      const rr = rotEase(rotU), vbT = (i) => +lerp(VB_ANAT[i], lerp(VB_CIRC[i], VB_CIRC_R[i], rr), tgt).toFixed(1);
      vbBox.x = vbT(0); vbBox.y = vbT(1); vbBox.width = vbT(2); vbBox.height = vbT(3);
      solveTargetVT.k = d.k; solveTargetVT.x = d.x; solveTargetVT.y = d.y; vt = solveTargetVT;
      for (let i = 0; i < EV.length; i++) {
        const x = EV[i], g = geo[x.e.id];
        curS.push(g.cur); visS.push(x.vis);
        // (kept: the end state's courses and shown set found once for the change's frames, not again for each slice of its solve.)
        if (kept && kept.pts[i]) { g.cur = kept.pts[i]; x.vis = kept.vis[i]; continue; }
        g.cur = vesselAt(x, tgt).pts;
        x.vis = x.reveal?.out ? true : edgeVisible(x, F);
        if (kept) { kept.pts[i] = g.cur; kept.vis[i] = x.vis; }
      }
      CTM = null; refreshCTM();
      return fn();
    } finally {
      for (let i = 0; i < EV.length; i++) { geo[EV[i].e.id].cur = curS[i]; EV[i].vis = visS[i]; }
      morph = keepMorph; lastMorph = keepLast; morphTarget = keepTgt; vt = keepVT;
      vbBox.x = vb0; vbBox.y = vb1; vbBox.width = vb2; vbBox.height = vb3;
      CTM = null; refreshCTM();
      glSuppress = false;
    }
  }
  // The solve is a job sliced over the change's frames: one short slice in the tap's own frame (xfSolving shortens updateLabels' first slice), then one
  // per frame of the morph (viewXfStep), the rest at the landing if it comes first. The new labels stay at nothing until it lands.
  let xfSolving = false;
  // (The change landed before the new view's labels were solved: they stay at nothing until the solve lands, never the old view's labels on the new figure.)
  let xfHold = false;
  // (Solved after the landing: the new labels come in with a fade, as they do through the change, never in one frame.)
  const XF_FADE_MS = 160;
  let xfRamp = 0;
  function xfRelease() {
    if (!xfHold) return;
    xfHold = false;
    const id = ++xfRamp, t0 = performance.now();
    const step = () => {
      if (id !== xfRamp || viewXf || xfHold) return;
      const n = clamp((performance.now() - t0) / XF_FADE_MS, 0, 1);
      xfLayer(n); labelGL.crossfade(0, n);
      if (n < 1) nextFrame(step); else labelGL.dropGhosts();
    };
    step();
  }
  const XF_SLICE_MS = 4;   // (a slice of the target's solve in a frame of the change: the Circuit's whole solve is longer than the change, and at 1.2 ms it landed long after it, its labels popping in; what is left goes on after it lands)
  let xfKept = null;
  function solveTargetView(d) {
    labelKey = null; solveAsked = true;
    xfKept = { pts: [], vis: [] };
    preAbort();
    xfSolving = true;
    try {
      atTargetStage(d, () => {
        // (The other view's labels were solved ahead in idle time (preStep) for this very framing: their slots are carried, with no solve.)
        if (pre.slots && pre.key === preKey(d) && preCommit()) return;
        updateLabels(F, true);
      }, morphTarget, xfKept);
    } finally { xfSolving = false; }
    cancelMay('label solve');   // (the job is ours: no idle slice runs it)
    if (!labelJob) { labelGlSync(); return false; }
    return true;   // pending
  }
  // (One slice of the pending solve, at the stage's end state; true once it has landed.)
  function xfSolveSlice(d, ms) {
    const j = labelJob;
    if (!j) return true;
    let done = false;
    atTargetStage(d, () => {
      try { done = labelSliceRun(j.g, ms); } catch (e) { labelJob = null; labelKey = null; throw e; }
      if (!done) return;
      labelJob = null;
      solvedFor = j.solvedFor; solveAsked = false;
      labelKey = keyInto(labelKeyArr, j.key); stats.layouts++;
      labelTail();
    }, morphTarget, xfKept);
    if (done) labelGlSync();
    return done;
  }
  function viewXfStart(d) {
    xfHold = false; xfRamp++;
    viewXf = null;   // (a change begun on another: the new one is solved first, with the layers out of the old one's hands)
    labelJobDrop();
    if (handRide) handRideEnd();
    labelGL.freezeGhosts();
    xfVisFill();
    const pending = solveTargetView(d);
    // (A glide of the camera that was running is over: the change's own clock moves it now.)
    cancelFrame(vtAnim); arcRun = null; landRide = false; landTo = null; following = false;
    if (drifting) driftEnd();
    drifting = false;
    if (carrying) { carrying = false; rideLeaders(false); }
    const to = { k: d.k, x: d.x, y: d.y };
    viewXf = { t0: easeInOut(morph), tT: morphTarget, from: { ...vt }, to, same: sameView(vt, to), pending, tStart: performance.now(), sigTap: solvedFor?.sig || null };
    vtTarget = to; vtGliding = !viewXf.same; vtUntil = performance.now() + 700; vtMs = 700;
    xfOp = '';
    xfLayer(0);
    viewXfStep(true);
  }
  // (Each frame of the change, after the figure is drawn at its morph: the crossfade from its progress. The camera was set before it.)
  function viewXfStep(first = false) {
    const x = viewXf, p = viewXfP();
    refreshCTM();
    if (x.pending && !first) {
      if (!labelJob) { x.pending = false; labelKey = null; solveAsked = true; }   // (the job was dropped by another: laid out as it lands)
      else {
        if (xfSolveSlice(x.to, XF_SLICE_MS)) { x.pending = false; x.sigTap = solvedFor?.sig || null; }
      }
    }
    const n = x.pending ? 0 : clamp(2 * p - 1, 0, 1);
    xfLayer(n);
    labelGL.crossfade(clamp(1 - 2 * p, 0, 1), n);
    if (p >= 1 || morph === morphTarget) viewXfEnd();
  }
  // The other view's labels solved ahead, in idle slices (a dry solve at that view's end state, the slots kept by a key of what the labels
  // show, the framing and the stage): at a tap they are carried, with no solve. A real solve, a carry or anything moving drops one in progress.
  const pre = { need: true, g: null, key: null, cur: '', d: null, tgt: 0, slots: null, tasked: false };
  const cutSig = (t) => t.slice(t.indexOf('|'));
  function preKey(d) { return `${cutSig(labelSig(F))}|${Math.round(d.k * 100)},${Math.round(d.x)},${Math.round(d.y)},${stageBox().width},${stageBox().height},${rotU > 0.5},${labelFonts},${calloutSig()},${labelIns()}`; }
  function preAbort() { if (pre.g) { pre.g.return(); pre.g = null; pre.need = true; } }
  function preCommit() {
    const keep = labelSol, m = new Map();
    for (const [k, v] of pre.slots) m.set(k, { ...v });
    labelSol = m;
    if (layoutLabels(F, false) === false) { labelSol = keep; return false; }
    const sf = solvedFor === SOLVED_A ? SOLVED_B : SOLVED_A, sig = labelSig(F);
    sf.sig = sig; sf.sc = CTM.sc; sf.th = Math.atan2(CTM.b, CTM.a); sf.csig = calloutSig(); sf.ins = labelIns(); sf.view = morphTarget; sf.ck = null;
    solvedFor = sf; solveAsked = false;
    labelKey = keyInto(labelKeyArr, labelKeyNow(store.get(), sig, stageBox())); stats.layouts++;
    labelTail();
    return true;
  }
  const preIdle = () => !!F && !!labelGL && !labelGL.lost && !viewXf && !labelJob && !handRide && !gestureOn() && !camMove && !drifting && !carrying && !glSuppress
    && morph === morphTarget && (morph === 0 || morph === 1) && rotU === rotTarget && !lobuleOn && !lz?.isOpen() && !(cath.st && !cath.st.keep) && !vtGliding;
  // (What the kept solution was made for, read at the stage as it stands: a change in any of these, a new patient frame, a selection, a resize, a font, makes it
  // stale, and it is made again at once in idle time. Otherwise a solution that no longer matched at the tap was never replaced, and the tap solved it all.)
  const preNowKey = () => (pre.d ? preKey(preFraming(pre.tgt)) : '');
  function preAsk() {
    if (pre.slots && !pre.g && preIdle() && preNowKey() !== pre.cur) { pre.slots = null; pre.need = true; }
    if (pre.tasked || !(pre.need || pre.g) || !preIdle()) return;
    pre.tasked = true;
    mayTask('label presolve', preStep, JOB_NOW);   // (a slice a frame while the figure rests, not when a frame happens to be spare)
  }
  function preStep() {
    pre.tasked = false;
    if (!preIdle()) { preAbort(); return false; }
    const tgt = morphTarget === 0 ? 1 : 0;
    const keepSol = labelSol, keepSpare = labelSolSpare, keepTurn = labelTurned, keepK = labelK, kn = lbkNum, ks = lbkStr;
    const dk = gLabels.dataset.k, lv = gLabels.style.getPropertyValue('--lbk');
    let done = false;
    try {
      atTargetStage(pre.d || preFraming(tgt), () => {
        if (!pre.g) {
          pre.d = preFraming(tgt); pre.tgt = tgt; pre.need = false; pre.slots = null;
          pre.key = preKey(pre.d);
          labelSol = new Map(keepSol);   // (a turn between the views clears the slots it finds: not the standing ones)
          pre.g = layoutLabelsGen(F, true, true);
        }
        done = labelSliceRun(pre.g, 3).valueOf();
        if (done) { pre.slots = new Map(); for (const [k, v] of labelSol) pre.slots.set(k, { ...v }); pre.cur = ''; }
      }, tgt);
    } catch (e) { pre.g = null; pre.d = null; throw e; }
    finally {
      labelSol = keepSol; labelSolSpare = keepSpare; labelTurned = keepTurn; labelK = keepK; lbkNum = kn; lbkStr = ks;
      if (dk === undefined) delete gLabels.dataset.k; else gLabels.dataset.k = dk;
      if (lv) gLabels.style.setProperty('--lbk', lv);
    }
    if (done) { pre.g = null; pre.cur = preNowKey(); return false; }
    pre.tasked = true;
    mayTask('label presolve', preStep, JOB_NOW);
    return false;
  }
  // (The framing a tap on the other view would take: setView.)
  function preFraming(tgt) {
    const wasOut = tgt === 1 && (vt.k <= 1.001 || (homeAt && sameView(vt, homeAt)));
    return wasOut ? circWhole() : defaultVT(tgt === 1);
  }
  function xfMarkCurrent(tap) {
    if (!F || !solvedFor || solvedFor.sig !== tap) return;
    const sig = labelSig(F), cut = (t) => t.slice(t.indexOf('|'));
    if (sig !== tap && cut(sig) === cut(tap)) { solvedFor.sig = sig; if (labelKey) labelKey[16] = sig; }
  }
  function viewXfEnd() {
    const x = viewXf;
    if (!x) return;
    // (The morph landed first: the solve goes on in the usual slices at rest, the stage being at its end state, and is marked current when it lands.)
    if (x.pending && labelJob) { labelJob.xfTap = labelJob.solvedFor.sig; mayTask('label solve', labelJobStep, JOB_NOW); }
    xfHold = !!(x.pending && labelJob);
    x.pending = false;
    viewXf = null;
    if (!x.same) { vt = { ...x.to }; applyVT(); CTM = null; }
    vtGliding = false;
    if (xfHold) { labelGL.dropGhosts(); labelGL.crossfade(0, 0); } else { xfLayer(1); labelGL.dropGhosts(); }
    refreshCTM();
    // (Laid out for this very camera already: the solve at the tap was for the landed geometry, so it stands. The signature differs only by the geometry's
    // version, which every morph frame bumped: marked current, the landing only refreshes values and does not solve again.)
    if (F && x.sigTap && !labelJob) xfMarkCurrent(x.sigTap);
    if (F) updateLabels(F);
  }
  // (Whether the view is moving now: a glide, a pan or a pinch. Boxes kept for the frame's reads are not read again while it is.)
  const viewMoving = () => vtGliding || camMove || wrap.classList.contains('pinch-hide') || wrap.classList.contains('panning');
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
    if (!labelRider?.canRide() || (cath.st && !cath.st.keep) || pinchHide || lobuleOn || lz?.isOpen() || diveT > 0 || wrap.classList.contains('cam-move')) return false;   // (reduced motion rides too: a label that stays on its point as the figure moves adds no motion of its own; hidden, the names went for every pinch and glide)
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
    if (!store.get().presenting || reduceMotion.matches || !F || !solvedFor || camMove || pinchHide) return false;
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
    if (!F || inUpdate || catchUp || !solvedFor || camMove || pinchHide || gestureOn() || sameView(from, to) || performance.now() - landAt < 150) return false;
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
  const { autoNow, easeRes, moveGaps, noteMoveFrame, resizeCanvas, settleRes, subPixel } = createRes({ OVER_ASK, QUALITY, drawVeins, schedulePlateView, stageBox, vCanvas, wrap }, live);
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

  // A view may keep each finding (varices, collaterals, clots, flow) off the figure until a test shows it.
  const findingHidden = (k) => { const fd = store.get().found; return !!fd && !fd.has(k); };
  const FINDING_OF = { VAR: 'eso', GV: 'gv' };
  function edgeVisible(x, f) {
    const e = x.e, p = f.viewParams || store.get().params;
    if (ANAT_HIDDEN.has(e.id) && morph < 0.5) return false;
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
    const rr = rotEase(rotU);
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
    if (svgOver) setG(svgOver, 'viewBox', txt, svgOver.classList.contains(OVER_ALL) ? undefined : false);
    applyVT();
  }

  // A vessel's course at t of the change between the views (eased: 0 the anatomy, 1 the circuit), as updateGeometry draws it; and its
  // strands' (strandAt). Pure: the GPU morph (morphTrack) asks for moments ahead of the one drawn.
  const vesOut = { pts: null, base: null, u0: 0 };   // (the answer, written in place: every caller reads it at once, before the next ask)
  function vesselAt(x, t) {
    const g = geo[x.e.id];
    let pts;
    if (t === 0) pts = g.A; else if (t === 1) pts = g.C; else pts = g.A.map((p, i) => [lerp(p[0], g.C[i][0], t), lerp(p[1], g.C[i][1], t)]);
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
    const t = easeInOut(morph);
    const full = force || t !== lastMorph;
    if (!full && !only?.length) return;
    geometryVersion++;
    if ((t === 0 || t === 1) && t !== lastMorph) pickVer++;   // (a view landed: the corner credit counts the vessels where they now lie)
    lastMorph = t;
    // (Between the two views a clot's lit side is worked out once the views have landed (t 0 or 1 is always a whole update), not at every
    // frame of the change.)
    const lazy = t > 0 && t < 1;
    for (const x of full ? EV : only) {
      const g = geo[x.e.id], v = vesselAt(x, t), { u0 } = v;
      const pts = v.pts;
      if (x.strands) for (const sd of x.strands) {
        const sp = strandAt(x, sd, t, v);
        sd.u0 = u0;
        sd.cur = sp; sd.len = arcLen(sp);
      }
      g.cur = pts;
      g.len = arcLen(pts);
      if (x.tipFade) { const ln = x.tipFade.line, pa = pointAt(pts, x.tipFade.frac); ln[0] = pts[0][0]; ln[1] = pts[0][1]; ln[2] = pa[0]; ln[3] = pa[1]; ln[4] = pa[2]; ln[5] = pa[3]; }   // (written in the vessel's own list)
      if (x.endFade) { const ln = x.endFade.line, pa = pointAt(pts, x.endFade.frac), pe = pts[pts.length - 1]; ln[0] = pa[0]; ln[1] = pa[1]; ln[2] = pe[0]; ln[3] = pe[1]; }
      x.shadeOk = false;
      if (lazy) continue;
      litNormals(pts, g.lit);   // (a clot's layers follow the tube's lit side: updateOverlays)
    }
    if (!full) return;
    if (t > 0 && t !== nd.at) nodeVerts(t);   // (the dots show only with the circuit: at 0 they are not drawn, and kept where they were)
    setViewBox(t);
    organMorphA = 1 - t; paintOrganAlpha();
    if (t !== ascT) { ascT = t; ascTxt = String(1 - t); }
    setG(gAscites, 'style:opacity', ascTxt);
    svg.classList.toggle('circuit', t > 0.5);
    svgOver?.classList.toggle('circuit', t > 0.5);
    if (recs.show(t > 0.5 ? 1 : 0, performance.now(), reduceMotion.matches)) recKick();   // (the kept shapes of the circuit fade in and out as .circuit-only did: D_SURFACE, the page's ease)
    // The circuit is a dark hemodynamic map; the anatomy an atlas plate on paper.
    stageWrap.classList.toggle('cmap', t > 0.5);
    if (gFxC.firstChild || t === 0 || t === 1) { if (t !== fxcT) { fxcT = t; fxcTxt = String(t); } setG(gFxC, 'style:opacity', fxcTxt); }   // (an empty layer takes no opacity through the change between the views; its value lands with the view)
    // (The map and the dots fade with t on the GPU: at 0 neither is drawn nor read.)
    if (MAP.a !== t) { MAP.a = t; nd.dirty = true; }
    CTM = null;
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

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
  // The organs' groups by the layer they are drawn in (organs-gl.js), back to front: the five pictures of the plan, with the two
  // organs that change shape, the spleen and the liver (its ghost line with it), each a layer of its own between them. An element
  // the list does not name (none today) goes with the layer before it, so the order of the SVG is always kept.
  const ORGAN_LAYERS = ['back', 'behind', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'];
  function organLayers() {
    const by = new Map([[gGut, 'gut'], [ghost, 'liver']]);
    for (const [id, L] of [['esophagus', 'behind'], ['heart', 'behind'], ['heart-ra', 'behind'], ['heart-grooves', 'behind'], ['appendix', 'behind'],
      ['kidney-l', 'kidney'], ['spleen', 'spleen'], ['stomach', 'stomach'], ['liver', 'liver'], ['falciform', 'front'], ['umbilicus', 'front']]) if (organG[id]) by.set(organG[id], L);
    const out = new Map();
    let last = 'behind';
    for (const k of gOrgans.children) { last = by.get(k) || last; out.set(k, last); }
    return out;
  }
  // ── Optional refinement (refine.js) ──
  // The pictures made sharper after a zoom, and the gut's, take their turns in frames where the figure is not in hand, a little of each
  // frame from one allowance shared by all of them (the 6 ms a step they each took was a frame's own time, and a strip's drawing and
  // read-back came on top of it). Work that is not wanted any more (the state moved on, a newer picture began) is dropped at its turn.
  const refineHeld = () => gestureOn() || !leftAlone(120);
  /** Waits for a frame in which refinement may run. Resolves with the ms the frame still has for it, or null once `gone()` says the work is not wanted. */
  const refineWaitFrame = () => new Promise(refineWaitExec), refineWaitExec = (res) => nextFrame(res);   // (kept, no closure made per turn)
  const refineTurn = (gone) => refine.turn(refineWaitFrame, refineHeld, gone);
  /** Runs fn as one step of refinement, its time charged to the frame's allowance (and the longest step noted) under `name`. */
  const refineStep = (name, fn) => { const t0 = performance.now(); try { return fn(); } finally { refine.spent(performance.now() - t0, name); } };
  // The organs as layers (gpuOrgansOn): each layer rasterized as the plate is (rasterPlate, from the same copy), cropped to its own
  // painted box on the plate's pixel grid (so its pixels are the plate's samples), and the set shown whole once every layer is in.
  // Composited back to front on the GPU, each with its group's opacity baked in, they make the plate's picture.
  const EVERYWHERE = [-Infinity, -Infinity, Infinity, Infinity];
  // (Worked out in script from the shapes' own numbers and transforms (elBox, chainMat), not getBBox and getCTM: the organs are out of
  // the page's layout while the GPU draws them, plan "Holding 120 Hz" §3.5.)
  function layerBoxes() {
    const top = gOrgans.parentNode, by = new Map([['back', EVERYWHERE]]);
    for (const [k, L] of organLayers()) {
      let b = EVERYWHERE;
      try {
        const bb = elBoxInto(k, EBOX);
        if (!bb || !(bb.width || bb.height)) continue;
        // (Its outline through every transform, the widest stroke on it (the liver's inner shade, 30 wide, clipped inside) and a margin.)
        b = paintBox(bb, chainMat(k, top), 15, 24);
      } catch (e) { caught('stage:5226', e); /* not measurable: the whole plate */ }
      const u = by.get(L);
      by.set(L, u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b);
    }
    // The bowel (its own layer when the organs are painted live: plateMarkup).
    try { const bb = elBoxInto(organG.bowel, EBOX); if (bb && (bb.width || bb.height)) by.set('bowel', paintBox(bb, chainMat(organG.bowel, top), 15, 24)); } catch { by.set('bowel', EVERYWHERE); }
    return by;
  }
  let layerStarts = 0, layerStartsEasing = 0;   // (for the tests: organ pictures begun, and those begun while the fluid eased)
  // Which way each organ layer is drawn (the ?organpaths readout, and the checks): 'GPU' (painted on the GPU from its shapes) or
  // 'picture (why)' (rasterized from the SVG copy: a group the painter cannot read, or the organs not painted live at all).
  // bakeSkip: layers kept as pictures for a check (tests/e2e/plate-layers.mjs, to find which layer a difference comes from).
  const organPaths = new Map(), bakeWhy = new Map();
  let layerCommits = 0;
  const elName = (el) => (!el ? '?' : el.id ? `#${el.id}` : `${el.localName}${el.classList?.length ? `.${[...el.classList].join('.')}` : ''}`);
  // (Why the organs are not painted live, in a few words.)
  function liveWhy() {
    if (!veins) return 'no WebGL2';
    if (!gpuProbe.gpuOrgans) return 'GPU organs off: the ?perf switch';
    if (!veins.organs) return 'no organ stack: its shader failed';
    if (!veins.organs.canLive) return 'the live painter failed to start';
    if (liveFailed) return `live painting off: ${liveFailWhy || 'an organ not readable'}`;
    return 'painted live';
  }
  /** The organs' drawing paths now: { mode, live, layers: [[name, path]], gpu } (window.pps, and the checks). */
  function organPathsNow() {
    const mode = !veins || veins.lost ? 'SVG (no GPU figure)' : !plateOn() ? 'SVG (live drawing, no picture shown)' : gpuOrgansOn() ? 'GPU layers' : 'one picture (GPU organs off)';
    return { mode, live: liveOn() ? 'liver, spleen, diaphragm, falciform: painted live' : liveWhy(), layers: gpuOrgansOn() ? [...organPaths] : [], gpu: veins?.organs?.stats?.() || null, liveLayers: veins?.organs?.liveLayers?.() || null, renderer: SOFTWARE ? 'software' : 'gpu' };
  }
  async function rasterLayers(slot, rect, scale) {
    // (Its turn first: reading every organ's box and shape is a step of its own, tens of ms on a phone, begun from a timer.)
    const seq0 = plateSeq, drops0 = plateDrops, v = veins;
    if (await refineTurn(() => seq0 !== plateSeq || drops0 !== plateDrops || v !== veins || !v || v.lost) === null) return false;
    const boxes = refineStep('organ layers: boxes', layerBoxes), names = [], live = liveOn(), paths = new Map();
    layerStarts++; if (fluidEasing()) layerStartsEasing++;
    // Each layer's picture is painted on the GPU straight from its organs' shapes (bakeLayer). There is no other way to make one: the
    // SVG copy rasterized by the browser, a strip at a time through 2D canvases, is gone (owner, 1 Nov: nothing off the GPU). Without
    // the live painter, or with a layer it cannot read, no picture is made and the organs stay the page's own SVG.
    if (!live) { organPaths.clear(); organPaths.set('all', `SVG (${liveWhy()})`); return false; }
    const baked = refineStep('organ layers: shapes read', bakeAll);
    const unread = [...baked].find(([, b]) => !b);
    if (unread) { organPaths.clear(); organPaths.set(unread[0], `SVG (${bakeWhy.get(unread[0]) || 'not readable'})`); return false; }
    try {
      for (const L of LIVE_ORDER) {
        if (LIVE_LAYERS.has(L)) continue;
        const box = boxes ? boxes.get(L) : EVERYWHERE;
        const r = box && cropToGrid(rect, box, scale);
        if (!r) continue;
        if (!(await bakeLayer(slot, L, baked.get(L), r, scale)) || v !== veins || !v.organs) return false;
        names.push(L);
        paths.set(L, 'GPU');
      }
      v.organs.commit(slot, names);
      if (slot === 0) { organPaths.clear(); for (const [L, p] of paths) organPaths.set(L, p); }
      layerCommits++;
      syncLiveOrgans(true); v.organs.setOrder(ORGAN_LAYERS);
      return true;
    } finally { if (v === veins && !v.lost) v.organs?.dropStaged(slot); }
  }
  // The groups each layer's picture is painted from on the GPU (organs-gl bake), read from the organs' own groups in the SVG's order
  // (readGroup with nest: the gut's see-through shades, the stomach's and duodenum's fades are groups of their own, as the browser
  // lays them): { groups: [{ spec, m }], at } per layer, or null for a layer one of whose groups cannot be read (it is rasterized). The
  // gut's own mask and opacity, and the stomach's see-through liver, are not in them: they are laid over the pictures live (the cuts).
  // (The organs' own colours: a lens's grey is taken off for the read, as for the copy, plateBuild.)
  // The organs' groups as read for painting (organ-paint readGroup), kept until something they were read from changes: a class, a
  // shape's own geometry, a paint, a mask or clip, a part shown or hidden (an attribute or an inline display, visibility, paint or
  // mask), a group added or taken away, or the stage's look (theme, lens classes, the organ colours). What eases (outlines' d, frames,
  // opacities) the painter reads from the page at each paint, so a liver, a fluid or a fade easing keeps them. Reading them walks
  // every organ element with a computed style: about 1,800 style reads in one Varices slide change, for groups that had not changed
  // (motion budget, 2 Nov).
  const READ_ATTRS = ['class', 'style', 'display', 'visibility', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-rule',
    'mask', 'clip-path', 'filter', 'href', 'offset', 'stop-color', 'stop-opacity', 'gradientTransform', 'gradientUnits', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'd'];
  const READ_STYLE = /(?:^|;)\s*(display|visibility|fill|stroke|stroke-width|stroke-dasharray|mask|clip-path|filter|stop-color|stop-opacity|mix-blend-mode|fill-rule)\s*:\s*([^;]*)/g;
  // (A paint set !important is the lens's grey (greySet), which is always taken off before a read: it changes nothing read.)
  const styleSig = (v) => [...String(v || '').matchAll(READ_STYLE)].filter((m) => !/!\s*important/i.test(m[2])).map((m) => `${m[1]}:${m[2].trim()}`).sort().join(';');
  // (Each reading is kept with what it was read from: its group, and the gradients it read. A change inside the group, or to one of
  // those gradients' stops, drops that reading alone: a congested liver easing its colour reads the liver again, not every organ.
  // Anything else in the organ defs (a mask, a clip, a pattern) or a group added or taken away under the organs drops them all.)
  let readEpoch = 0, readMo = null;
  const readKept = new Map();
  const readGrad = (t) => t.closest?.('linearGradient, radialGradient')?.id || '';
  function readDrop(t) {
    if (t === gOrgans || t === gBackdrop || (defs.contains(t) && !readGrad(t))) { readEpoch++; readKept.clear(); return; }
    const id = readGrad(t);
    for (const [el, m] of readKept) {
      if (el.contains(t) || t.contains(el) || (id && [...m.values()].some((k) => k.refs.has(id)))) readKept.delete(el);
    }
  }
  function readSeen(list) {
    for (const m of list) {
      if (m.type !== 'attributes') { readDrop(m.target); continue; }
      const now = m.target.getAttribute(m.attributeName);
      // (An inline style that only eases an opacity or a transform, and a d that only moves an outline, change nothing read.)
      if (m.attributeName === 'style') { if (styleSig(m.oldValue) !== styleSig(now)) readDrop(m.target); continue; }
      if (m.attributeName === 'd') { if (!m.oldValue !== !now) readDrop(m.target); continue; }
      if (m.oldValue !== now) readDrop(m.target);
    }
  }
  // (Of the stage's and the page's classes, only those the style sheets use in a rule over the organs count: a class that styles
  // something else (data-layer, thumb-ui) changing as a slide changes read every organ again (motion budget, 2 Nov). The sheets are
  // walked once, and again when their number changes; a sheet that cannot be read keeps every class, as before.)
  const ORGAN_SEL = /organ|tone-|lv-|og-|backdrop|flank|abdomen|cavity|gut|bowel|colon|stomach|spleen|liver|kidney|heart|eso|duoden|seam|diaphragm|plate/;
  let organCls = null, organClsN = -1;
  function organClasses() {
    const n = document.styleSheets.length;
    if (n === organClsN) return organCls;
    organClsN = n; organCls = new Set();
    const walk = (rules) => { for (const r of rules) { if (r.cssRules) walk(r.cssRules); const sel = r.selectorText; if (sel && ORGAN_SEL.test(sel)) for (const m of sel.matchAll(/\.([\w-]+)/g)) organCls.add(m[1]); } };
    try { for (const sh of document.styleSheets) walk(sh.cssRules); } catch { organCls = null; }
    return organCls;
  }
  const organKey = (el) => { const c = organClasses(); return c ? [...el.classList].filter((k) => c.has(k)).sort().join(' ') : el.className; };
  const readLook = () => { const cs = wrapCS(); return `${readEpoch}|${themeKey()}|${organKey(wrap)}|${organKey(document.documentElement)}|${cs.getPropertyValue('--stage-bg')}|${cs.getPropertyValue('--organ-liver')}|${flag.imaging}`; };
  /** organ-paint's readGroup(el, opt), or the last reading of it with the same options while nothing it was read from has changed. */
  function readGroup(el, opt) {
    // (Only what the watch below sees is kept: the organs, the backdrop and the defs. The overlays (#stageOver: the tamponade tube, the
    // stents, the clamps) are read again each time syncOver asks, which is only when its own watch saw them change; kept here, the
    // tube's first reading stood for every later frame and the GPU showed the balloon never filling, 2 Nov.)
    if (!(gOrgans.contains(el) || gBackdrop.contains(el) || defs.contains(el))) return readGroupNow(el, opt);
    if (!readMo) {
      readMo = new MutationObserver(readSeen);
      for (const root of [gOrgans, gBackdrop, defs]) readMo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: READ_ATTRS });
    }
    readSeen(readMo.takeRecords());
    const look = readLook(), ok = opt ? `${!!opt.withMask}|${!!opt.nest}|${!!opt.strict}|${!!opt.shown}` : '';
    let m = readKept.get(el);
    const k = m?.get(ok);
    if (k && k.look === look) return k.spec;
    const { spec, refs } = readGroupRefs(el, opt);
    readSeen(readMo.takeRecords());   // (a grey taken off for the read and put back is part of it, not a change after)
    if (spec) { if (!(m = readKept.get(el))) readKept.set(el, (m = new Map())); m.set(ok, { look: readLook(), spec, refs }); }
    return spec;
  }
  function bakeAll() {
    const greyed = !!greyList;
    if (greyed) { greyClear(); organDimKey = ''; }
    bakeWhy.clear();
    try {
      const out = new Map(), layerOf = organLayers(), key = plateStateKey();
      for (const L of LIVE_ORDER) {
        if (LIVE_LAYERS.has(L)) continue;
        const els = L === 'bowel' ? [organG.bowel] : L === 'gut' ? gutKids().filter((k) => k !== organG.bowel) : [...layerOf].filter(([k, l]) => l === L && k !== gGut).map(([k]) => k);
        const groups = [];
        let ok = true;
        for (const el of els) {
          if (!el || getComputedStyle(el).display === 'none') continue;
          const spec = el.localName === 'g' ? readGroup(el, { withMask: el !== organG.stomach, nest: true }) : null;
          if (!spec) { console.warn('Organs on the GPU: not readable for painting, this layer stays a picture:', el); bakeWhy.set(L, `${elName(el)} not readable${readFail() ? `: ${readFail()[0]} on ${elName(readFail()[1])}` : ''}`); ok = false; break; }
          groups.push({ spec, m: matOfEl(el).slice() });
        }
        out.set(L, ok ? { groups, at: L === 'bowel' ? bowelDy() : 0, key } : null);
      }
      return out;
    } finally { if (greyed) syncOrganDim(); }
  }
  // A layer's picture painted on the GPU from its groups, a few milliseconds a frame (the picture shown meanwhile stays), and staged
  // for the slot once whole; false when the state it shows moved on while it was painted (as rasterPlate gives one up).
  async function bakeLayer(slot, L, b, rect, scale) {
    const v = veins, seq = plateSeq, drops = plateDrops, key = b.key, vseq = slot === 1 ? ++viewSeq : 0;
    const gone = () => seq !== plateSeq || drops !== plateDrops || v !== veins || v.lost || !v.organs || (slot === 1 && vseq !== viewSeq) || key !== plateStateKey();
    const job = v.organs.bake(slot, L, b.groups, rect, scale, b.at);
    if (!job) return false;
    try {
      // (Painted a few ops in each frame that has some of the shared allowance left, none in a gesture's: a step paints at least one op,
      // and the longest one is noted by layer.)
      for (;;) {
        const ms = await refineTurn(gone);
        if (ms === null) return false;
        const t0 = performance.now();
        const done = gpuProbe.time(null, 'organ picture: GPU paint', bakeStep, job, t0 + ms);
        refine.spent(performance.now() - t0, LAYER_SPENT[L]);
        if (done) return true;
      }
    } finally { if (!v.lost) job.drop(); }
  }
  // The live organs' specs (organ-paint readGroup) read again whenever what they draw may have changed (liveKey), for the next
  // render of the stack. Their outlines are read from the page at the render itself.
  const matBuf = [1, 0, 0, 1, 0, 0];   // (one frame matrix kept, written over at each read; every reader multiplies it at once, none keeps it: a baked group takes a copy)
  const matOfEl = (el) => {
    const t = el?.transform?.baseVal, o = matBuf;
    if (!t || !t.numberOfItems) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 1; o[4] = 0; o[5] = 0; return o; }
    const k = t.consolidate().matrix;
    o[0] = k.a; o[1] = k.b; o[2] = k.c; o[3] = k.d; o[4] = k.e; o[5] = k.f;
    return o;
  };
  const MASK_OF = { gut: '#gutHide', stomach: '#frontM' };
  let liveKeyWas = '', liveSet = false;   // (liveKeyWas: '' for none, 'kept' while liveKeyOld holds the last key's parts)
  const liveKeyNow = ['', '', '', '', '', '', '', '', '', '', ''], liveKeyOld = ['', '', '', '', '', '', '', '', '', '', ''];
  // (What eases, the outlines, the organs' frames and the parts' own opacities, the painter reads from the page at each paint
  // (organ-paint liveOf): the specs are read again only when what is in them changes: a part hidden or shown, the liver's mask,
  // the ghost line, a lens, the theme and its colours. They were read again on every frame of an ease: about fifty computed
  // styles, with the step's writes pending.)
  const fullWanted = () => fullOk() && (fullSwap || !veins.organs.pictured(0));
  // (The key as its parts, in a kept list, not a string built: the same parts as before, compared one by one against the last.)
  function liveKey() {
    const cs = wrapCS(), k = liveKeyNow;
    k[0] = organG.liver.getAttribute('mask') ?? ''; k[1] = ghost.style.display; k[2] = lv.sep.style.visibility; k[3] = lv.nod.style.visibility; k[4] = lv.cong.style.visibility; k[5] = lv.isl.style.visibility;
    k[6] = cs.getPropertyValue('--stage-bg'); k[7] = cs.getPropertyValue('--organ-liver'); k[8] = flag.imaging; k[9] = themeKey(); k[10] = fullWanted();
    return k;
  }
  function liveKeySame() { for (let i = 0; i < liveKeyNow.length; i++) if (liveKeyNow[i] !== liveKeyOld[i]) return false; return true; }
  function syncLiveOrgans(force = false) {
    const v = veins;
    if (!v || v.lost || !v.organs) return;
    if (!liveOn()) { if (liveSet) { v.organs.setLive(null, null); liveSet = false; liveKeyWas = ''; } return; }
    const key = liveKey();
    if (!force && liveKeyWas && liveKeySame()) return;
    // (fullWanted: the whole set, while no picture is in; its change asks for a new reading too, through the key.)
    // (The organs' own colours: a lens's grey on the live SVG (only while the plate is off) would be read as theirs. The whole set
    // takes it off for its read, liveRead.)
    if (greyList && !fullWanted()) return;
    for (let i = 0; i < key.length; i++) liveKeyOld[i] = key[i];
    liveKeyWas = 'kept';
    // (The specs are read first in the next frame, while the layout is still the last frame's (readFrame), and handed to the stack in
    // that frame's own phase after: never read among a frame's writes.)
    liveAsk ||= readFrame(liveRead);
  }
  let liveAsk = 0;
  // (The backdrop (the diaphragm) is out of the page's layout, display: none, while the GPU draws the plate (app.css): read as shown, or its dome was
  // left out of every reading made then, and the figure drew without it: 2 Nov 2026, e6d08386.)
  const BACKDROP_READ = { shown: true };
  const NO_MASKS = new Map();   // (never written: the whole set has no masks, liveApply)
  function liveRead() {
    liveAsk = 0;
    const v = veins;
    if (!v || v.lost || !v.organs || !liveOn() || (greyList && !fullWanted())) { liveKeyWas = ''; return; }
    const organs = new Map(), masks = new Map();
    let ok = true;
    liveFailWhy = '';
    const add = (L, el, opt) => {
      if (getComputedStyle(el).display === 'none' && !opt?.shown) return;
      const spec = readGroup(el, opt);
      if (!spec) { ok = false; liveFailWhy ||= `${elName(el)} not readable`; console.warn('Organs on the GPU: not readable for painting, the organs stay pictures:', el); return; }
      if (!organs.has(L)) organs.set(L, []);
      organs.get(L).push({ spec, get m() { return matOfEl(el); } });   // (the group's own frame, as it is at each paint)
    };
    const full = fullWanted();
    // (The whole set: every layer's groups painted live, each with its own mask, as the browser lays them; no cuts over pictures. Read
    // in the organs' own colours: a lens's grey on the SVG is taken off for the read and put back, as for the pictures, bakeAll.)
    if (full) {
      const greyed = !!greyList;
      if (greyed) { greyClear(); organDimKey = ''; }
      // (Read as the pictures' groups are, bakeAll: the gut's see-through shades and the stomach's fades are groups of their own.)
      try { add('back', gBackdrop, BACKDROP_READ); for (const [k, L] of organLayers()) if (L !== 'back') add(L, k, LIVE_LAYERS.has(L) ? undefined : { nest: true }); } finally { if (greyed) syncOrganDim(); }
      nextFrame(() => liveApply(ok, organs, NO_MASKS, true));
      return;
    }
    add('back', gBackdrop, BACKDROP_READ);
    for (const [k, L] of organLayers()) if (LIVE_LAYERS.has(L)) add(L, k);
    for (const [L, sel] of Object.entries(MASK_OF)) {
      const el = defs.querySelector(sel), g = L === 'gut' ? gGut : organG.stomach;
      const spec = el && readGroup(el);
      if (!spec) { ok = false; liveFailWhy ||= `mask ${sel} not readable`; continue; }
      // (The gut's: its group's opacity laid with it, and the bowel's picture, at rest, gathered under it with its float. el: the
      // element whose frame m reads, watched by the stack for writes with the mask's own elements: organs-gl watchLive.)
      masks.set(L, L === 'gut' ? { spec, el: g, get m() { return matOfEl(g); }, opacity: parseFloat(getComputedStyle(gGut).opacity), under: [{ name: 'bowel', dy: bowelDy() }] } : { spec, el: g, get m() { return matOfEl(g); } });
    }
    nextFrame(() => liveApply(ok, organs, masks));
  }
  function liveApply(ok, organs, masks, full = false) {
    const v = veins;
    if (!v || v.lost || !v.organs || !liveOn()) return;
    if (full) {
      // (A layer the painter cannot read: the whole set is given up for good, and the pictures are dropped the old way, the SVG
      // showing until they are made again. The changing organs stay live.)
      if (!ok || !fullWanted()) { if (!ok) fullFailed = true; const swap = fullSwap; fullSwap = false; liveKeyWas = ''; if (swap) hidePlate(); syncLiveOrgans(true); return; }
      fullSwap = false;
      if (v.organs.pictured(0)) v.dropPlate(0);   // (the old pictures, of the state before, go as the whole set comes in)
      v.organs.setLiveAll(organs); liveSet = true;
      v.organs.setOrder(ORGAN_LAYERS);
      veinsDirty = true; platePoke(); stageWake();
      return;
    }
    if (!ok) { liveFailed = true; v.organs.setLive(null, null); liveSet = false; hidePlate(); platePoke(); return; }
    // (The next composite renders the stack again for it (its version moved): the vessels themselves need no redraw.)
    v.organs.setLive(organs, masks); liveSet = true;
    veinsDirty = true; stageWake();   // (composited again with the new specs in the next frame, as it was in the frame they were read)
  }
  // What the plate shows, in coarse steps: re-rasterize when it changes. A selected organ is not part of it: its outline is drawn
  // outside the organs (gSelO, or on the GPU) and its dim on the GPU, and its .org-sel class styles nothing, so the picture was
  // the same; drawing it again made every highlight and unhighlight lag (Mohammad, 20 Oct: "even highlighting the liver is laggy").
  let tintQ = 0;
  let bowelHeld = null;
  function plateStateKey() {
    const cs = wrapCS();
    // The tint in coarse steps, with some hysteresis: a pressure that wavers on a step boundary
    // while the model runs must not re-rasterize the plate over and over.
    const tq = (parseFloat(liverTint.style.opacity) || 0) * 40;
    if (Math.abs(tq - tintQ) > 1.5 || (tq === 0 && tintQ !== 0)) tintQ = Math.round(tq);
    // (With the changing organs painted live, the pictures hold none of them: only the rest is the pictures' state.)
    // (The bowel's float only once the fluid has settled: while it eases, the bowel's picture is moved on the GPU, organs-gl.js shift.)
    if (!fluidEasing()) bowelHeld = organG.bowel.getAttribute('transform');
    if (liveOn()) return ['live', bowelHeld, cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), flag.imaging].join('|');
    return [liverKey, organG.liver.getAttribute('transform')?.replace(/(\d\.\d\d\d)\d*/g, '$1'), organG.spleen.getAttribute('transform')?.replace(/(\d\.\d\d)\d*/g, '$1'), diaKey,
      tintQ,
      organG.bowel.getAttribute('transform'), (flank.getAttribute('d') || '').slice(0, 24), organEls.umbilicus?.getAttribute('opacity'),
      cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), flag.imaging].join('|');
  }
  // Hidden (the home page over the app), every organ would rasterize invisible: wait until the figure shows.
  const figureHidden = () => wrapCS().getPropertyValue('visibility') === 'hidden';
  // The circuit's own colours (.cmap) in the dark theme: it sets its own --stage-bg, which the organs' fills mix with. They come
  // on halfway through the switch, when the organs are half faded, and read as a theme change: the picture was dropped, every
  // organ drawn live for the rest of the fade (the gut's 1,201 paths), and the picture drawn again mid-switch, in the circuit's
  // colours, then once more on the way back (Mohammad, 20 Oct: "switching from anatomy to circuit lags mid switch and back").
  // While they are on the organs are fading out or gone, so the picture in the anatomy's colours stays; a change made in the
  // circuit is drawn once the anatomy's colours are back. (In the light themes the circuit keeps the stage's colour: no change.)
  let anatBg = null, cmapSeen = false;
  function circuitInk() {
    const on = stageWrap.classList.contains('cmap');
    if (on !== cmapSeen) { cmapSeen = on; csSnap = null; }   // (the style snapshot is dropped by an observer, a beat after the class)
    const bg = wrapCS().getPropertyValue('--stage-bg');
    if (!on) { anatBg = bg; return false; }
    return anatBg !== null && bg !== anatBg;
  }
  let plateStale = false;
  let plateMiss = 0, fluidStillAt = 0, fluidWas = false;   // (pictures given up in a row; when the fluid last stopped)
  function platePoke() {
    // Not while diving into the lobule (the anatomy is only magnified, then covered): once landed, under the lobule. Nor through a
    // rise: the organs ease on in view (anatEasing), and a picture dropped or swapped mid-zoom flashed; it is made once it lands.
    if ((lobuleOn && !lz?.isOpen()) || (diveT > 0 && diveT < 1)) return;
    // In the background no picture is begun (below), but one in colours the page no longer has is dropped at once, for the live
    // drawing (already in the colours now, drawn in the same task): the system turns the page light for the app switcher's
    // pictures and dark again while it is hidden, and the light picture stayed on the canvas until the next one replaced it, so
    // coming back showed the organs almost white first (Mohammad, 21 Oct: "the flash when I switch to the app ... still happens").
    if (document.hidden && veins && !veins.lost && plateTheme !== null && veins.hasPlate(0) && !circuitInk()) {
      const theme = wrapCS().getPropertyValue('--stage-bg');
      if (theme !== plateTheme) { plateTheme = theme; hidePlate(); }
    }
    if (!veins || veins.lost || !glWanted(easeInOut(morph)) || figureHidden() || document.hidden || circuitInk()) return;
    // An ease that outgrows the plate (a fill played over days, a liver that changes in small steps) shows on the live drawing
    // as it goes, and the plate is drawn again once it settles: held, the organs inside it stood still while their outlines
    // moved, then jumped to the new shape at the end (Ascites deck slide 5, 17 Oct).
    // (With the changing organs painted live (liveOn) nothing is held or dropped: the pictures under them hold no liver, spleen or
    // diaphragm, and are made again while the fluid eases, a strip a frame, the one shown staying until the new one is in.)
    const live = liveOn();
    if (!live && (lvMoving || fluidEasing())) { if (plateKey && veins.hasPlate(0) && plateStateKey() !== plateKey) hidePlate(); return; }
    // (A growing spleen: no new size may come once it stops, so a later poke rasterizes it once it has settled.)
    if (!live && spleenMoving()) { if (plateKey && veins.hasPlate(0) && plateStateKey() !== plateKey) hidePlate(); clearTimeout(spleenTimer); spleenTimer = setTimeout(platePoke, 320); return; }
    const stale = plateStale; plateStale = false;
    const key = plateStateKey();
    if (key === plateKey && veins.hasPlate(0)) return;
    readFluidInk(wrapCS());
    // A theme switch: the old raster would keep the old background for a beat, so show the live
    // SVG plate (already in the new theme) at once and rasterize again without the throttle.
    const theme = wrapCS().getPropertyValue('--stage-bg');
    const themed = plateTheme !== null && theme !== plateTheme;
    plateTheme = theme;
    // Shown again after being covered while the patient changed (followHidden): the raster still holds the patient before, so
    // the live drawing, already of the patient now, shows until it is rasterized again.
    // (With the changing organs painted live on the GPU (liveOn) the pictures hold none of them, as for any other change of patient
    // below: the GPU picture stays up and is made again behind it. Dropping it showed the page's SVG organs, which Safari draws again
    // on the CPU at the screen's full pixels on every frame the camera moves: the way out of the lobule and the slide's glide after it
    // ran at a few frames a second on an iPhone (Mohammad, 1 Nov). ?stalekeep=0: dropped, as before.)
    const drop = themed || (stale && !live);
    if (drop && veins.hasPlate(0)) {
      hidePlate();
    }
    if (plateBusy) { plateAgain = true; return; }
    // (A liver that just settled may be pausing mid time-lapse: give it a moment.)
    // A picture that came too late (the change moved on before it landed, so it was given up) waits longer the next time, 0.8 s,
    // then 1.6, then 3.2 after the liver or the fluid last moved: a time-lapse that pauses between steps began a whole organ picture in each pause
    // and threw it away, a frame of a quarter of a second each time on an iPhone (Mohammad's ?perf recording, 21 Oct). The live
    // drawing shows meanwhile, as it does now; once one lands the wait is as before.
    // (Now one step only, 0.8 s: the whole picture is made a strip per frame from the shapes that meet each strip (0e73bb6), so one
    // given up costs a strip, and the waits of up to 3.2 s kept the live organs up, every pan or zoom a repaint of all of them, for
    // seconds after a change: external review, 22 Oct.)
    const still = plateMiss ? 800 : 400;
    const wait = themed ? 0 : live ? Math.max(0, 500 - (performance.now() - plateLast)) : Math.max(0, 500 - (performance.now() - plateLast), still - (performance.now() - lvStillAt), 400 - (performance.now() - spleenMv.stillAt()), still - (performance.now() - fluidStillAt));
    clearTimeout(plateTimer);
    plateTimer = setTimeout(async () => {
      const moving = !liveOn() && (lvMoving || fluidEasing() || spleenMoving());
      if (figureHidden() || moving || (lobuleOn && !lz?.isOpen()) || (diveT > 0 && diveT < 1) || circuitInk() || document.hidden) return;   // hidden, moving or diving meanwhile: a later poke rasterizes
      const k = plateStateKey();
      if (k === plateKey && veins?.hasPlate(0)) return;   // it changed and changed back
      plateBusy = true; plateLast = performance.now();
      plateSeq++;
      try {
        if (gpuOrgansOn() && await rasterLayers(0, PLATE_RECT, PLATE_BASE)) {
          plateKey = k;
          // The sharp view raster stays until its replacement lands (dropping it first would show
          // the softer whole plate for a beat: the textures would blur, then sharpen).
          plateView = null; plateViewKey = ''; dropViewKeep();   // (a picture of the state before: nothing to take from it)
          veinsDirty = true; stageWake();
          if (!plateOn() && glWanted(easeInOut(morph)) && (liveOn() || (!lvMoving && !spleenMoving()))) {
            // The raster lands outside an animation frame (and the next frames may be paced out):
            // hide the SVG organs only together with a GPU draw that shows the plate, or a frame
            // would show neither (a flash of the dark stage through the organs).
            wrap.classList.add('gl-plate'); syncPlateLook();
            if (!drawVeins(false, 'plate landed')) { wrap.classList.remove('gl-plate'); plateDirty = true; syncPlateLook(); }
          } else syncPlateLook();
          plateMiss = plateOn() ? 0 : Math.min(3, plateMiss + 1);
          if (!plateOn()) plateKey = '';   // not shown (the liver moved meanwhile): raster again once it settles
          else if (risePrep) { risePrep = false; clearTimeout(risePrepT); }   // (made for the way out: the anatomy under the lobule rests again)
          schedulePlateView();
        } else if (plateStateKey() !== k) plateAgain = true;   // (given up as out of date: drawn again for the state now)
        if (plateAgain && !plateOn()) plateMiss = Math.min(3, plateMiss + 1);   // (and the next one waits longer for the change to rest)
      } catch (e) { console.warn('Plate raster failed; the SVG plate stays.', e); }
      plateBusy = false;
      if (plateAgain) { plateAgain = false; platePoke(); }
    }, wait);
  }
  // In the background nothing is drawn again (the page's colours can change and change back meanwhile, as above): back in
  // view, the picture is checked against the state now, and drawn again only if that differs.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) platePoke(); });
  // The ?perf switch "GPU organs": the picture shown now is dropped (the live drawing shows for a beat) and made again the other way.
  gpuProbe.onOrgans = () => { plateKey = ''; liveFailed = false; liveFailWhy = ''; if (veins && !veins.lost) { hidePlate(); syncLiveOrgans(); veins.organs?.dropKept(); } platePoke(); };
  // After a pan or zoom settles, a raster of the view at the screen's resolution (when the
  // whole-plate raster would look soft there).
  function schedulePlateView() {
    clearTimeout(plateSettle);
    plateSettle = setTimeout(settled, 280);
  }
  async function settled() {
    // (Not with a finger or button still down, nor within 0.28 s of the last input: it is begun once the figure is let go.)
    if (!leftAlone(280)) { plateSettle = setTimeout(settled, 120); return; }
    if (moveLow) { plateSettle = setTimeout(settled, 120); return; }   // (While moving: made for the canvas at rest)
    if (!veins || !plateOn() || !CTM) return;
    // (Not in the circuit, or on the way to it: the organs are faded out there, and their sharp picture and the gut's were
    // drawn after every pan and pinch for nothing (Mohammad, 21 Oct: the lag "also happens in circuit view"). The way back to
    // the anatomy moves the view on every frame, so the last of them, at the anatomy, schedules them again.)
    if (morphTarget !== 0 || morph > 0) return;
    const need = vdpr * CTM.sc;
    if (need <= PLATE_BASE * 1.2) { if (veins.hasPlate(1)) { veins.dropPlate(1); veinsDirty = true; stageWake(); } return; }
    // The view in world units (the anatomy is never turned), with a margin, within the plate.
    const r = stageBox(), [ax, ay] = clientToWorldFast(r.left, r.top), [bx, by] = clientToWorldFast(r.right, r.bottom);
    // (Painted on the GPU (bake) a view's picture costs little for its size, so it reaches half a view past each side, as far as
    // the texture's limits allow at the screen's resolution: most pans then stay inside it, below. As pictures of the SVG copy it
    // reaches a seventh, each pan's uncovered strip drawn from the copy.)
    const vw = (bx - ax) * need, vh = (by - ay) * need;
    const reach = liveOn() ? Math.max(0.15, Math.min(0.5, (Math.sqrt(4.2e6 / Math.max(1, vw * vh)) - 1) / 2, (4094 / Math.max(1, vw, vh) - 1) / 2)) : 0.15;
    const mx = (bx - ax) * reach, my = (by - ay) * reach;
    let x0 = Math.max(PLATE_RECT[0], ax - mx), y0 = Math.max(PLATE_RECT[1], ay - my);
    let x1 = Math.min(PLATE_RECT[0] + PLATE_RECT[2], bx + mx), y1 = Math.min(PLATE_RECT[1] + PLATE_RECT[3], by + my);
    if (x1 <= x0 || y1 <= y0) return;
    // (4094: the rect grows by up to a pixel each way below, and a texture side stays within 4096.) Painted on the GPU, the
    // picture is painted through the painter's targets, which hold its width and the canvas's height, or the other way round:
    // its sides are kept so those stay within the room the canvas gives them (organ-paint targetRoom). A view taller than the
    // screen and one wider made them 4096 square on an iPad at 2×, and Safari ended the page (Mohammad, 25 Oct).
    const roomW = picNow ? picNow[0] : vCanvas.width, roomH = picNow ? picNow[1] : vCanvas.height;   // (the picture's pixels: under Sharper upscaling the canvas is larger)
    const room = targetRoom(roomW, roomH);
    const scale = Math.min(need, 4094 / (x1 - x0), 4094 / (y1 - y0), Math.sqrt(4.2e6 / ((x1 - x0) * (y1 - y0))),
      room / (Math.max(1, roomH) * (x1 - x0)), room / (Math.max(1, roomW) * (y1 - y0)));
    // On the scale's pixel grid (grown outward to whole pixels): two views at one scale sit whole pixels apart, so the next pan
    // can take the pixels they share (rasterPlate).
    x0 = Math.floor(x0 * scale) / scale; y0 = Math.floor(y0 * scale) / scale; x1 = Math.ceil(x1 * scale) / scale; y1 = Math.ceil(y1 * scale) / scale;
    const key = `${plateKey}|${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}|${scale.toFixed(2)}`;
    if (key === plateViewKey) return;
    // The picture of the view kept while it still covers what is on screen (not the margin around it) at the resolution wanted:
    // a pan or a small zoom within it makes nothing new. (It was made again whenever the margin left it, after nearly every pan.)
    const vx0 = Math.max(PLATE_RECT[0], ax), vy0 = Math.max(PLATE_RECT[1], ay), vx1 = Math.min(PLATE_RECT[0] + PLATE_RECT[2], bx), vy1 = Math.min(PLATE_RECT[1] + PLATE_RECT[3], by);
    if (plateView && vx0 >= plateView[0] && vy0 >= plateView[1] && vx1 <= plateView[2] && vy1 <= plateView[3] && scale <= plateView[4] * 1.05) return;
    plateViewKey = key;
    try { if (gpuOrgansOn() && await rasterLayers(1, [x0, y0, x1 - x0, y1 - y0], scale)) { plateView = [x0, y0, x1, y1, scale]; veinsDirty = true; stageWake(); } else if (plateViewKey === key) plateViewKey = ''; } catch (e) { caught('stage:5661', e); /* the whole-plate raster stays */ }
  }
  const worldBuf = [0, 0];   // (the point kept and written over: every caller takes its two numbers at once)
  function clientToWorldFast(cx, cy) {
    if (!CTM) refreshCTM();
    const { a, b, c, d, e, f } = CTM, det = a * d - b * c || 1, x = cx - e, y = cy - f;
    worldBuf[0] = (d * x - c * y) / det; worldBuf[1] = (-b * x + a * y) / det;
    return worldBuf;
  }
  // With a vessel selected the organs (and the ascites over them) step back to SEL_DIM, as app.css's .has-sel filter (G20).
  const SEL_DIM = 0.6;
  const SPOT_NET = 0.16;   // the network's alpha outside a slide's spotlight (deck visuals V2)
  // The plate's dim and grey (a lens or a selection) and the network's dim ease toward their targets
  // (stepPlateEase, each frame), so a lens switch or a selection never changes the figure in one frame.
  const plateTgt = [1, 1, 1];   // (the three targets kept and written over: each caller reads them at once)
  const plateTargets = () => {
    const dataLayer = flag.dataLayer, own = flag.hasSel || wrap.classList.contains('shunting'), sel = own || spotOn();
    // (A slide's spotlight steps the rest of the network further back than a selection, SPOT_NET: its vessels are a set, and a pale
    // one, as the paraumbilical vein in Pressure colours, must still stand out of it.)
    plateTgt[0] = (sel ? SEL_DIM : 1) * (dataLayer ? 0.72 : 1); plateTgt[1] = dataLayer ? 0.12 : 1; plateTgt[2] = own ? 0.42 : sel ? SPOT_NET : 1;
    return plateTgt;
  };
  const plateLook = { alpha: 0, sat: 1, stack: false };   // (the plate's look handed to the vessels' painter: kept, written over, read at once)
  function syncPlateLook() {
    syncOrganDim();
    if (!vLook) return;
    if (plateDim == null || reduceMotion.matches) [plateDim, plateSat, netA] = plateTargets();
    if (plateOn()) { plateLook.alpha = (1 - easeInOut(morph)) * plateDim; plateLook.sat = plateSat; plateLook.stack = gpuOrgansOn(); vLook.plate = plateLook; } else vLook.plate = null;
    vLook.netAlpha = netA;
  }
  // The live SVG organs (shown while the GPU copy is off: a patient change, a theme switch, no WebGL) take the same dim and
  // grey, on the same eased values (organ-dim.js), only while they show. The grey is each fill, stroke and gradient stop's own
  // colour made grey (organ-grey.js), and the dim the groups' opacity: no filter. A filter over the organs made Safari draw
  // every organ again on each frame of a change in any lens but Pressure (a cirrhosis slider, HVPG 8 to 9, 17 Oct), and one on
  // each organ came on a frame late in Safari (the organs flashed to colour). The same picture as the filter's: the grey is
  // linear in each colour and keeps alpha, so greying each paint equals greying their composite, overlaps and translucency
  // included; opacity multiplies alpha as the matrix's alpha row did. A colour the grey cannot read keeps the filter.
  const organDimFx = defs.querySelector('#organDim feColorMatrix');
  let organDimKey = '', greyList = null, greyFilter = false;
  // (While dimmed the groups' opacity transition (app.css, .5 s) is off: it would start each dim from full strength, a flash of
  // the undimmed organs at every patient change. The dim eases on the plate's own clock, as the filter's did.)
  const organGs = [gOrgans, gBackdrop];
  function paintOrganAlpha() {
    const a = String(organMorphA * organDimA), tr = organDimA !== 1 ? 'none' : '';
    for (let i = 0; i < organGs.length; i++) {
      const g = organGs[i];
      if ((getLive(g, 'transition') ?? g.style.transition) !== tr) setG(g, 'style:transition', tr);
      if ((getLive(g, 'opacity') ?? g.style.opacity) !== a) setG(g, 'style:opacity', a);
    }
  }
  // Every colour the organs paint with (shapes, their gradients' stops and patterns' contents), as computed with no grey on.
  const GREY_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'text', 'tspan', 'use', 'stop']);
  function greyRead() {
    const list = [], refs = [], seen = new Set();
    const visit = (el) => {
      if (!GREY_TAGS.has(el.localName)) return true;
      const cs = getComputedStyle(el);
      for (const p of el.localName === 'stop' ? ['stop-color'] : ['fill', 'stroke']) {
        const v = cs.getPropertyValue(p).trim();
        if (!v || v === 'none') continue;
        const id = paintRef(v);
        if (id) { refs.push(id); continue; }   // (a gradient or pattern: its own colours are greyed)
        const c = parseColor(v);
        if (!c) return false;
        list.push({ el, p, c, was: el.style.getPropertyValue(p), pri: el.style.getPropertyPriority(p) });
      }
      return true;
    };
    for (const el of [...gBackdrop.querySelectorAll('*'), ...gOrgans.querySelectorAll('*')]) if (!visit(el)) return null;
    while (refs.length) {
      const id = refs.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const r = svg.querySelector(`[id="${id}"]`);
      if (r) for (const el of r.querySelectorAll('*')) if (!visit(el)) return null;
    }
    return list;
  }
  function greyClear() {
    if (!greyList) return;
    for (const g of greyList) { if (g.was) g.el.style.setProperty(g.p, g.was, g.pri); else g.el.style.removeProperty(g.p); }
    greyList = null;
  }
  function greySet(sat) {
    if (greyFilter) { organDimFx.setAttribute('values', organDimMatrix(1, sat)); return; }
    const q = Math.round(sat * 256) / 256;   // (1/256 steps: under half a level of an 8-bit screen, and the strings are made once)
    for (const g of greyList) g.el.style.setProperty(g.p, greyOf(g.c, q), 'important');
  }
  // The colours are read again when what they depend on changes (the theme, the stage's classes), before the next paint.
  const greyDeps = () => { const r = document.documentElement; return `${wrapCls()}|${r.className}|${themeKey()}|${darkMQ.matches}`; };
  let greyAt = '';
  const greyStale = () => { if (greyList && greyDeps() !== greyAt) { greyClear(); organDimKey = ''; syncOrganDim(); } };
  new MutationObserver(greyStale).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(greyStale).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'class'] });   // (not its style: label sizes change there on every frame of a glide)
  darkMQ.addEventListener?.('change', greyStale);
  // (The colours are read first in the next frame, while the layout is still the last frame's (readFrame), and greyed in that frame's
  // own phase after: the grey starts a frame later, from no grey, as its ease does anyway.)
  let greyAsk = 0, greyWant = false, greySat = 1, greyNew = null;
  function greyOn(sat) {
    greyWant = true; greySat = sat;
    if (!greyFilter && !greyList) { greyAsk ||= readFrame(greyPrep); return; }
    greySet(sat);
  }
  function greyPrep() {
    greyAsk = 0;
    if (!greyWant || greyFilter || greyList) return;
    greyNew = { list: greyRead(), at: greyDeps() };
    nextFrame(greyStart);
  }
  function greyStart() {
    const n = greyNew; greyNew = null;
    if (!n || !greyWant || greyFilter || greyList) return;
    greyList = n.list; greyAt = n.at;
    if (!greyList) { greyFilter = true; for (let i = 0; i < organGs.length; i++) organGs[i].setAttribute('filter', 'url(#organDim)'); }
    greySet(greySat);
  }
  function greyOff() {
    greyWant = false; if (greyAsk) { cancelFrame(greyAsk); greyAsk = 0; } greyNew = null;
    greyClear();
    if (greyFilter) { greyFilter = false; for (let i = 0; i < organGs.length; i++) organGs[i].removeAttribute('filter'); }
  }
  // (The dim's last key as its parts, not a string built a frame: organDimKey is '' for off or reset, 'on' with these two for a dim.)
  let organDimD = 0, organDimS = 0;
  function syncOrganDim() {
    if (plateDim == null || reduceMotion.matches) [plateDim, plateSat, netA] = plateTargets();
    const on = !plateOn() && (plateDim < 1 || plateSat < 1);
    const grey = on && plateSat < 1;
    const sat = grey ? plateSat : 1;
    if (on ? organDimKey === 'on' && organDimD === plateDim && organDimS === sat : organDimKey === '') return;
    organDimKey = on ? 'on' : ''; organDimD = plateDim; organDimS = sat;
    organDimA = on ? plateDim : 1; paintOrganAlpha();
    if (grey) greyOn(plateSat); else greyOff();
  }
  const plateEasing = () => { if (plateDim == null) return false; const [d, s, n] = plateTargets(); return d !== plateDim || s !== plateSat || n !== netA; };
  // Timed on the clock with an ease in and out (PLATE_FADE), so the organs fade to grey and back smoothly at any frame rate.
  // One clock for organs and vessels (G18): the plate eases over the vessels' own lens crossfade, from the same moment, on the
  // same curve (easeMove, the quintic), as the SVG organs' filter does when the GPU plate is off (app.css: --d-surface, --ease-move).
  const PLATE_FADE = LENS_FADE;
  let plateFrom = null, plateTo = null, plateT0 = 0;
  const plateFromBuf = [0, 0, 0], plateToBuf = [0, 0, 0];   // (kept: plateFrom and plateTo point at these while an ease runs)
  function stepPlateEase() {
    // (Each frame of the crossfade, or of the colours' follow, syncs the vessels, paused too, so it runs to its end. Only the crossfade
    // redraws the whole vessel layer: the colours' follow changes the vessels' own colours, which the sync sends as the rows that changed,
    // drawn again as their cells alone (tint) or as the whole when most changed. It had marked the layer dirty for every frame of a follow,
    // and a running model's colours follow all the time: 17 whole vessel draws a second at 17 fps on the iPad, 4 Nov.)
    if (lensFrom) veinsDirty = true;
    if (lensFrom || colEasing) glowSync = true;
    if (!spot.on && !plateEasing()) spot.live = false;   // (the spotlight's dim has eased away: the ascites goes back to its own)
    if (!plateEasing()) { plateFrom = null; return; }
    const to = plateTargets(), now = lensNow();
    if (!plateFrom || to[0] !== plateTo[0] || to[1] !== plateTo[1] || to[2] !== plateTo[2]) {
      plateFromBuf[0] = plateDim; plateFromBuf[1] = plateSat; plateFromBuf[2] = netA; plateFrom = plateFromBuf;
      plateToBuf[0] = to[0]; plateToBuf[1] = to[1]; plateToBuf[2] = to[2]; plateTo = plateToBuf;
      plateT0 = lensFrom && now - lensT0 < 60 ? lensT0 : now;
    }
    const u = easeMove(clamp((now - plateT0) / PLATE_FADE, 0, 1));
    if (u >= 1) { plateDim = to[0]; plateSat = to[1]; netA = to[2]; }
    else { plateDim = plateFrom[0] + (to[0] - plateFrom[0]) * u; plateSat = plateFrom[1] + (to[1] - plateFrom[1]) * u; netA = plateFrom[2] + (to[2] - plateFrom[2]) * u; }
    if (u >= 1) plateFrom = null;
    syncPlateLook(); veinsDirty = true;
  }

  // Circuit liver module: collapsed unless asked for, selected into, or zoomed in on.
  function liverExpanded() {
    const sel = store.get().selection;
    return labelRestK() >= 1.9 || (sel?.type === 'edge' && LIVER_EDGES.has(sel.id)) || (sel?.type === 'node' && LIVER_INNER.has(sel.id));
  }

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
  const quietFx = () => reduceMotion.matches || isImaging();
  // A vessel that opened or closed while the figure was covered draws on or off from that moment, not when it is shown again (followHidden).
  let fxAt = null;
  function trackChanges(f) {
    const now = fxAt ?? performance.now();
    const quiet = quietFx();
    for (const x of EV) {
      const e = x.e;
      const q = f.Qf ? f.Qf[EI[e.id]] : f.Q[EI[e.id]];
      const open = x.vis && !x.ghost && !x.reveal?.out;
      const was = track[e.id];
      track[e.id] = open;
      if (was === false && open && canFade(x) && !quiet) setReveal(x, revealOf(x, now, e.kind === 'shunt' ? 900 : 1500, q >= 0 ? 1 : -1, false));
    }
  }
  // The vessels that come and go with the disease (collaterals, shunts, the epigastric veins that
  // open with the paraumbilical route) draw on when they appear and retract when they leave.
  const canFade = (x) => !x.isArt && (x.e.kind === 'collateral' || x.e.kind === 'shunt' || NEEDS_C3.has(x.e.id));
  function startExit(x, f) {
    const q = f.Qf ? f.Qf[EI[x.e.id]] : f.Q[EI[x.e.id]];
    setReveal(x, revealOf(x, fxAt ?? performance.now(), x.e.kind === 'shunt' ? 700 : 1100, q >= 0 ? 1 : -1, true));
  }
  // When the retraction ends: hide the vessel, or leave the dotted outline of a closed collateral.
  function finishExit(x) {
    if (!F) return;
    edgeRev++;   // (the labels' signature: R04)
    if (!edgeVisible(x, F)) x.vis = false;
    else if (x.e.kind === 'collateral' && !collOpen(x.e.id, F)) x.ghost = true;
  }
  function stepReveals(now) {
    if (!revealN) return;   // (nothing draws on or off: no walk over the vessels, rev 2 §2.8)
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
    if (finished && F && !inUpdate) update(F);
    else if (veins && !inUpdate && anyReveal()) syncVeins(easeInOut(morph));
  }
  const { polysD } = createHalos({ E, NI, drawFrame, easeInOut, gOver, haloEls, nodePos, quietFx, routeCustomShunts, setGlowSrc, updateGeometry }, live);
 
  const { caliperAt, caliperSegs, clampA, clampFading, clampShade, fxBuild, fxK, fxPill, fxSync, gMatrix, glLines, markA, markShade, normal, normalSync, olFading, olGeom, olKey, olRings, olSet, olStep, orgTone, pinOrgans, setCallouts, spotOrgans } = createOutlines({ E, MAP, ND_PER, ND_SEG, arcMid, caud, clampW, clampWOut, easeInOut, gFx, gFxC, geo, late, nd, nextFrame, nodeDots, organEls, organG, ov, pointAt, quietFx, readFrame, refreshCTM, resTheme, svg, themeKey, toRGB }, live);
  let clampLast = 0;
  let markLast = 0;

   // Deck visuals, package F (ext-callouts.js): a slide's figure callouts, or null. live: an edge mark's words by
  // `${edge}|${kind}`; organs: marks on organs; calipers; steps (the glow's first entry's vessels: its order is numbered, V10);
  // spans and zone, on the circuit (V25). Each piece of words is { runs: [{ t, sp, tone? }], wide, label }: wide, the same words at
  // their widest, is the room its pill keeps, so a number ticking never moves or resizes it (fxPill).
  let fx = null, fxSig = '';

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
  let revF = null, revH = null, revT = 0, revP = null, revFlip = false;
  function holdReversals(f) {
    const H = store.get().healthy;
    if (!f || (f === revF && H === revH)) return;
    const P = f.Pf || f.P, t = f.t ?? 0;
    let jump = !revF || H !== revH || t < revT || t - revT > 1 || !revP || revP.length !== P?.length;
    if (!jump) for (let i = 0; i < P.length; i++) if (Math.abs(P[i] - revP[i]) > JUMP_MMHG) { jump = true; break; }
    revF = f; revH = H; revT = t;
    if (P) { if (!revP || revP.length !== P.length) revP = new Float64Array(P.length); revP.set(P); }
    if (revHolder.step(revFlag, t, jump)) revFlip = true;
  }
  const revFlag = (k) => (isReversed(EDGES[k], revF) ? 1 : 0);   // (revF is the frame being held: holdReversals sets it just before)
  const reversedShown = (e) => revHold[EI[e.id]] === 1;
  function isReversed(e, f) {
    const q = f.Qf[EI[e.id]];
    const ref = st0Ref(e.id);
    return q < -Math.max(0.12, 0.02 * Math.abs(ref));
  }
  const st0Ref = (id) => store.get().healthy?.Q?.[EI[id]] ?? 1;

  function updateNodesCircuit(f) {
    if (morph < 0.02) return;
    for (const d of nodeDots) {
      // (A junction dot fades with the vessels that come and go through it, as the figure's views fade: it popped. P21)
      const on = nodeVisible(d.id);
      if (d.on !== on) { d.on = on; mapWake = true; }
    }
    for (const id in liverR) {
      const r = liverR[id], k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      r.R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
    }
  }

  // The diaphragm is drawn around the organs it covers, the way a plate shows it: one smooth dome a
  // little above the liver, the fundus and the spleen, bridging the dips between them, and down the
  // flanks on both sides (where diaMask fades it out). It runs along the top of their current outlines,
  // pushed out a few units, so it follows a shrunken or congested liver and an enlarged spleen as they
  // ease, and never crosses an organ; the heart rests on it.
  const diaEls = gBackdrop.querySelectorAll('.org-diaphragm');
  // Just under the heart's base, column by column (or far above, beside it), for the diaphragm the heart rests on.
  let heartBase = null;
  function heartFloor(x) {
    if (!heartBase) {
      heartBase = new Map();
      for (const [hx, hy] of outlinePts(diaCut.heart.getAttribute('d'), diaCut.heart)) {
        const i = Math.round(hx / 4);
        if (hy > (heartBase.get(i) ?? -Infinity)) heartBase.set(i, hy);
      }
      // (A column the outline's samples skipped, or caught only on its upper side, takes its neighbours' base: no notch.)
      const ks = [...heartBase.keys()].sort((p, q) => p - q);
      for (let k = ks[0]; k <= ks.at(-1); k++) {
        const l = heartBase.get(k - 1), r = heartBase.get(k + 1), v = heartBase.get(k);
        if (l != null && r != null && (v == null || v < Math.min(l, r) - 6)) heartBase.set(k, (l + r) / 2);
      }
    }
    const i = x / 4, a = heartBase.get(Math.floor(i)), b = heartBase.get(Math.ceil(i));
    return a == null || b == null ? -Infinity : a + (b - a) * (i - Math.floor(i)) + 3.5;
  }
  let diaKey = '';
  // An outline's points: a polyline's own (the diseased liver), else sampled once along the curve.
  const outlineCache = new Map();
  function outlinePts(d, el) {
    if (!/[CQSAcqsa]/.test(d)) { const n = d.match(/-?\d+(\.\d+)?/g).map(Number); return n.flatMap((v, i) => (i % 2 ? [] : [[v, n[i + 1]]])); }
    if (!outlineCache.has(d)) {
      const mp = measurePath(d), out = [];   // (in script: no layout in the diaphragm's frame, 2 Nov 2026)
      for (let u = 0; u < mp.L; u += 4) out.push(mp.at(u));
      outlineCache.set(d, out);
    }
    return outlineCache.get(d);
  }
  const diaParts = [null, null, null], DIA_IDS = ['liver', 'spleen'];
  function diaphragmPath(shrink, sc) {
    const at = (P, cx, cy, k) => P.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    // (The liver's smooth dome, never its nodular edge: the nodules stand out about 2 at most, inside the gap.)
    const liver = at(liverDome || outlinePts(diaCut.liver.getAttribute('d'), diaCut.liver), 560, 350, shrink);
    const stomach = outlinePts(diaCut.stomach.getAttribute('d'), diaCut.stomach);
    const spleen = at(outlinePts(diaCut.spleen.getAttribute('d'), diaCut.spleen), SPLEEN_CENTER[0], SPLEEN_CENTER[1], sc);
    // One smooth dome over them (diaphragm.js); the heart rests on it, just under its base.
    diaParts[0] = liver; diaParts[1] = stomach; diaParts[2] = spleen;
    return diaphragmD(diaphragmLine(diaParts, heartFloor));
  }
  function liftDiaphragm(shrink, sc) {
    // The spleen in steps of 1% (as the plate key reads it): the running model's slow drift must not
    // redraw the dome, and the plate with it, every frame. The gap absorbs the difference.
    const scQ = Math.round(sc * 100) / 100;
    const key = `${liverKey}|${shrink.toFixed(3)}|${scQ}`;
    if (key === diaKey) return;
    diaKey = key;
    for (const id of DIA_IDS) diaCut[id].setAttribute('transform', organG[id].getAttribute('transform') || '');
    const d = diaphragmPath(shrink, scQ);
    for (const el of diaEls) el.setAttribute('d', d);
  }

  // Targets that follow the running model's pressures move only in steps (with hysteresis), so a
  // pressure wavering with the cycle never keeps the liver easing, and its plate being dropped and
  // rasterized again, over and over.
  // An end (0 or 1) is reached at once but left only on a clear move, so a value hovering just
  // past an end never flips to it and back.
  const stepHeld = (prev, v, tol) => (prev === null || Math.abs(v - prev) > ((prev === 0 || prev === 1) ? 2 * tol : tol) || (v === 0 && prev !== 0) || (v === 1 && prev !== 1) ? v : prev);
  // The liver's shape (cirrhosis), congestion and tint, eased toward the patient over `dt` seconds: [cT, gT, tT], their targets.
  function easeLiver(f, p, dt) {
    // The heart-cycle-averaged pressures: the beat must not swing the liver's look.
    const PA = f.Pf || f.P;
    const psin = Math.max(PA[NI.SIN_R], PA[NI.SIN_L]);
    lvTT = stepHeld(lvTT, clamp((psin - 8) / 16, 0, 1), 0.1);
    const tT = isImaging() ? 0 : lvTT * 0.5;
    const hp = store.get().healthy?.P;
    const cvUp = hp ? Math.max(PA[NI.CV_R] - hp[NI.CV_R], PA[NI.CV_L] - hp[NI.CV_L]) : 0;
    lvGT = stepHeld(lvGT, clamp((cvUp - 4) / 10, 0, 1), 0.03);
    const cT = Math.min(1, p.cirrhosis), gT = lvGT;
    if (lvC === null || reduceMotion.matches || !figureShown) { lvC = cT; lvG = gT; lvT = tT; }   // under the loading screen nothing is seen easing
    else { lvC = easeTo(lvC, cT, dt); lvG = easeTo(lvG, gT, dt); lvT = easeTo(lvT, tT, dt); }
    lvAt = performance.now();
    lvTargets[0] = cT; lvTargets[1] = gT; lvTargets[2] = tT;
    return lvTargets;
  }
  const lvTargets = [0, 0, 0];   // (read at once by its callers)
  // (What updateOrgans hands the probe's timed calls, kept: the calls are fixed functions that read these, so none is made in a frame.)
  let orgMoving = false, orgPA2 = null, orgShrink = 1;
  const orgMorphLiver = () => morphLiver(lvC, lvG, orgMoving);
  const orgCaudate = () => caud.sync(pressureColor(qP(orgPA2[NI.IVCS] + 0.5)), caudK);
  const orgMasks = () => syncOrganMasks(orgShrink, organG.spleen.getAttribute('transform'));
  const QUARTERS = ['0', '0.25', '0.5', '0.75', '1'];   // (String(n / 4) for n 0 … 4)
  // The congestion's shades stay hidden at no opacity (the glossy one aside), and all hide in the figure view.
  function lvShade(el, gloss, imaging) { const v = imaging || (el !== gloss && !(+el.style.opacity > 0)) ? 'hidden' : ''; if (el.style.visibility !== v) el.style.visibility = v; }
  function updateOrgans(f, p, t) {
    const k = 1 - t;
    const imaging = isImaging();
    const [cT, gT, tT] = easeLiver(f, p, Math.min(0.1, (performance.now() - lvAt) / 1000));
    // The congestion tint eases here, not by a CSS transition: the plate raster reads the value
    // it shows, and a fade in progress at that moment would be baked in (re-rastered over and
    // over, the tint flickered between mid-fade values).
    // (The congested liver takes the even dusk instead, so the tint's darker rim gives way to it as congestion comes in: organ
    // picks, 20 Oct.) It hands over across the same range the dusk comes in by (morphLiver: g / 0.5), so a slightly raised
    // pressure (after a TIPS) keeps some of the tint until the dusk is there to take its place.
    // (Not faded with the switch to the circuit: the organs' group fades it there, and a tint stepping down with the switch
    // changed the picture's key, so the organs' picture was drawn again every half second of the fade.)
    liverTint.style.opacity = (lvT * (1 - smooth01(lvG / 0.5))).toFixed(3);
    if (lvT !== tT) widthEasing = organsEasing = true;
    const moving = lvC !== cT || lvG !== gT;
    // While it eases, the live drawing shows (a raster would move in steps); the plate is
    // rasterized again once it settles.
    // A large change, or one still under way (a time-lapse), shows the live drawing. A small step
    // (the running model's congestion drifting a notch) eases under the plate and is rasterized once
    // it settles: swapping to the live drawing and back every few seconds would flash the organs.
    const retarget = lvMoving && (cT !== lvCT || gT !== lvGTo);
    lvCT = cT; lvGTo = gT;
    if (moving && (retarget || Math.max(Math.abs(cT - lvC), Math.abs(gT - lvG)) > 0.08) && veins && !veins.lost && veins.hasPlate(0) && !liveOn()) hidePlate();
    if (lvMoving && !moving) lvStillAt = performance.now();
    lvMoving = moving;
    if (moving) widthEasing = organsEasing = true;
    orgMoving = moving;
    gpuProbe.time(null, 'organs: liver', orgMorphLiver);
    // (The congestion's shades stay hidden at no opacity, as lvFade leaves them: showing them here undid lvFade on every liver frame, a
    // flip of the SVG's visibility each frame that also read the liver for the GPU again each time (motion budget, 2 Nov).)
    lvShade(lv.cong, lv.gloss, imaging); lvShade(lv.isl, lv.gloss, imaging); lvShade(lv.gloss, lv.gloss, imaging);
    // A cirrhotic liver shrinks a little; a congested one swells.
    const shrink = liverShrink(lvC, lvG);
    liverScale = shrink;
    const liverT = `translate(560 350) scale(${shrink.toFixed(4)}) translate(-560 -350)`;
    putA(organG.liver, 'transform', liverT);
    putA(organG.falciform, 'transform', liverT);   // (the falciform line goes with the liver, as its surface lines do)
    {
      // The caudate lobe grows as its veins carry the liver's outflow: from twice their normal flow, fully at four times.
      const hq = store.get().healthy?.Q?.[EI.CAUD], PA2 = f.Pf || f.P;
      caudK = stepHeld(caudK, hq ? clamp((Math.abs((f.Qf || f.Q)[EI.CAUD] / hq) - 2) / 2, 0, 1) : 0, 0.05);
      orgPA2 = PA2;
      gpuProbe.time(null, 'organs: caudate', orgCaudate);
    }
    const c3 = recruitFrac('C3', f);
    abdTo((clamp((c3 - 0.1) / 0.4, 0, 1) * 0.9 * k).toFixed(2));
    // The umbilicus is a landmark only for the paraumbilical vein that runs to it: with that vein closed, it was a lone ring
    // in the empty abdomen beside the gut (sweep batches 02–04). It fades in as the vein opens, as the caput's veins do, in
    // quarter steps (the organs' raster is drawn again at each step: plateStateKey).
    if (organEls.umbilicus) {
      const op = QUARTERS[Math.round(4 * (findingHidden('coll') ? 0 : clamp((c3 - 0.15) / 0.3, 0, 1)))];
      if (organEls.umbilicus.getAttribute('opacity') !== op) organEls.umbilicus.setAttribute('opacity', op);
    }
    const sc = f.slow.spleen / 11;
    normalSync(sc);
    // Growing, the plate (a picture of the organs at one size) gives way to the live drawing, which follows this size each frame.
    if (spleenMv.see(sc, performance.now()) && veins && !veins.lost && veins.hasPlate(0) && !liveOn()) hidePlate();
    putA(organG.spleen, 'transform', `translate(${SPLEEN_CENTER[0]} ${SPLEEN_CENTER[1]}) scale(${sc.toFixed(3)}) translate(${-SPLEEN_CENTER[0]} ${-SPLEEN_CENTER[1]})`);
    orgShrink = shrink;
    gpuProbe.time(null, 'organs: masks', orgMasks);
    if (organG.spleen.style.opacity !== (p.splenicRx === 2 ? '0.14' : '')) organG.spleen.style.opacity = p.splenicRx === 2 ? '0.14' : '';
    liftDiaphragm(shrink, sc);
    syncSelLine();
    // The shown ascites eases to the model's volume (stepFluid), so a tap or diuretics never pops the level.
    // (In steps of FLUID_STEP from the volume drawn: the model's trickle each update must not count as the fluid moving.)
    const asc = fluidTarget(ascTarget, f.slow.ascites);
    if (ascTarget === null) ascShown = asc;
    ascTarget = asc;
    gpuProbe.time(null, 'organs: fluid', drawAscites);
    syncSelFluid();
    gpuProbe.time(null, 'organs: plate poke', platePoke);
  }

  // Ascites collects in the flanks and the pelvis first (supine patient, frontal view), so its
  // surface is a meniscus: highest at the sides, lowest in the middle. The abdominal wall bulges
  // and the bowel floats up on it. A slow ripple runs along the surface while the model runs. On
  // the GPU the fluid is drawn over the plate (not in its raster), so no lens tints it; the SVG
  // copy stays for picking, the selection outline and exports.
  let bulgeQ = 0;
  // The fluid still easing toward its volume by more than a step of the wall's bulge (a tap, a drain, diuretics): the organ plate,
  // whose wall and bowel follow the bulge, is rasterized once it settles, not at every step on the way (each about 712 KB of SVG and
  // an 8 MB upload, several times per ease). The slow creep of a running model stays within a step, so it never holds the plate.
  const fluidEasing = () => ascTarget !== null && Math.abs(clamp(ascTarget / 8500, 0, 1) - clamp(ascShown / 8500, 0, 1)) * 34 > 0.5;
  let ascTarget = null, ascShown = 0, ascVel = 0, fluidMaskB = null, fluidMaskOf = null, fluidMaskOfB = null, fluidBandH = -1, fluidH = 0, fluidAmp = 0, fluidInkRGBA = [0.9, 0.75, 0.28, 0.4];
  const fluidLook = { s: [0, 0, 0, 0], ink: [0, 0, 0, 0], ripple: false };
  const abdomenClipEl = defs.querySelector('#abdomenClip path');
  // (The ripple's phase advances with the running model's frames, so it carries on from where it stood after a pause instead of
  // jumping to the wall clock's; round 2 review, B11.)
  let fluidPh = 0;
  const fluidPhase = () => fluidPh;   // both ripple terms are periodic over 20π
  let fluidSurfPh = 0;
  const fluidSurfKept = (x) => fluidSurfAt(x, fluidSurfPh);   // (the surface at the phase of the last draw: fluidSurf is set anew with each, so it never reads an older one)
  const fluidSurfAt = (x, ph) => fluidBase(x, fluidH) + (Math.sin(x / 38 + ph) * 0.7 + Math.sin(x / 23 - ph * 1.3) * 0.3) * fluidAmp;
  // No pool while the readout grades the belly "None"; past that it fades in as it fills and out as it drains, so it never pops.
  const fluidFade = () => poolFade(ascShown);
  const fluidCellsBuf = [];
  function drawAscites() {
    const u = clamp(ascShown / 8500, 0, 1);
    // The wall and the bowel move in half-unit steps of the bulge, with some hysteresis: each step re-rasterizes the
    // organ plate (plateStateKey), so a pool that fills slowly at rest must not change them on every model tick.
    const raw = u * 34;
    if (Math.abs(raw - bulgeQ) > 0.4 || (raw < 0.5 && bulgeQ !== 0)) bulgeQ = Math.round(raw * 2) / 2;
    const bulge = bulgeQ;
    putA(flank, 'd', u < 0.04 ? '' : flankPath(bulge));
    const d = abdomenOutline(bulge);
    if (fluidMaskB !== bulge) { fluidMaskB = bulge; abdomenClipEl.setAttribute('d', d); abdomenEl.setAttribute('d', d); }
    if (veins && !veins.lost && (fluidMaskOf !== veins || fluidMaskOfB !== bulge)) {
      fluidMaskOf = veins; fluidMaskOfB = bulge; fluidBandH = -1;
      // The cavity as a half-width per half unit of height (cavityHalfWidths), not a raster of its outline: copying a fresh
      // 856 x 600 canvas into a texture took Safari about 220 ms, on nearly every frame of a fluid ease (a Timelines
      // recording of HVPG slide 8 to 9, 17 Oct).
      const R = FLUID_R;
      veins.setFluidSpans(cavityHalfWidths(bulge, R[1], R[3], FLUID_COLS), R);   // (its second row: the liver's edge, setFluidLiver)
    }
    putA(organG.bowel, 'transform', `translate(0 ${(-bulge / 34 * 26).toFixed(1)})`);
    // The fluid level (fluidLevel): the first pool lies under the appendix's tip, then each litre lifts it about as much. Near the
    // top of the scale (about 8.5 L) the surface reaches the lower edge of the spleen: clearly concave (about 100 units
    // lower in the middle than at the flanks), the same on both sides.
    ({ h: fluidH, amp: fluidAmp } = fluidLevel(ascShown));
    fluidSurf = null;
    if (fluidFade() <= 0) { ascStale = false; putA(ascitesPath, 'd', ''); putA(ascitesLine, 'd', ''); }
    else {
      fluidSurfPh = reduceMotion.matches || plateOn() ? 0 : fluidPhase();
      fluidSurf = fluidSurfKept;
      // (R05, review pass 2: while the GPU draws the fluid (gl-on: #ascites hidden, app.css), the surface's SVG text, whose phase moves
      // every frame of the ripple, is not built or written: it is marked stale and written when something reads it (the selection's
      // outline, the hover, the SVG shown again: ascitesSvg). ?asclazy=0: written every frame, as before.)
      // (The level itself is still written as it moves, a quarter unit at a time, and at least once a second, so the credit's art
      // (credit.js FLUID) reads where the pool stands; only the ripple's phase is left out.)
      ascStale = true;
      if (!wrap.classList.contains('gl-on') || Math.abs(fluidH - ascWroteH) > 0.25 || fluidAmp !== ascWroteAmp || performance.now() - ascWroteAt > 1000) ascitesSvg();
      // The cells the rippling surface (and its light band) passes through, redrawn each frame on the GPU.
      if (veins && !veins.lost && Math.abs(fluidH - fluidBandH) > 0.25) {
        fluidBandH = fluidH;
        const cells = fluidCellsBuf;
        cells.length = 0;
        for (let x = 288; x < 1136; x += 16) {
          const a = fluidBase(x, fluidH), b = fluidBase(x + 16, fluidH);
          const y0 = Math.min(a, b) - fluidAmp - 2, y1 = Math.max(a, b) + fluidAmp + 10;
          for (let y = y0; y < y1; y += 16) cells.push(x, y);
        }
        veins.setFluidCells(new Float32Array(cells));
      }
    }
    syncSelFluid();
    platePoke();
  }
  // Per animation frame: ease the shown volume and keep the GPU fluid's look current. True when the level moved.
  const fluidLv = [1, 0];
  function stepFluid(dt, st, easeDt = dt) {
    if (ascTarget === null) return false;
    let moved = false;
    if (ascShown !== ascTarget) {
      fluidFrom ??= fluidH;
      // A large change shows the live drawing while it eases, as the liver's does: the wall and bowel move with the fluid, and the plate
      // is rasterized once it settles (held under the plate, the wall would jump by the whole change when it landed).
      const held = fluidEasing();
      if (held && Math.abs(clamp(ascTarget / 8500, 0, 1) * 34 - bulgeQ) > 3 && veins && !veins.lost && veins.hasPlate(0) && !liveOn()) hidePlate();
      // A critically damped spring on the drawn scale (volume^0.6), so the fluid fills in from the pelvis and
      // drains out smoothly, starting and stopping gently, instead of jumping in or out of existence.
      ({ shown: ascShown, vel: ascVel } = easeDt > 0.05 ? fluidSpringFor(ascShown, ascVel, ascTarget, easeDt) : fluidSpring(ascShown, ascVel, ascTarget, easeDt));
      drawAscites(); moved = true;   // (its platePoke rasterizes once the fluid is within a step of its volume)
    }
    const run = st.running && !reduceMotion.matches;
    if (run) fluidPh = (fluidPh + dt / 1.1) % (20 * Math.PI);
    // (Under a slide's spotlight the fluid eases with the organs' dim: the plate's own value, less a lens's share of it.)
    const spotK = spot.live && plateDim != null ? clamp(plateDim / (flag.dataLayer ? 0.72 : 1), SEL_DIM, 1) : 1;
    const t = easeInOut(morph), k = (1 - t) * (flag.hasSel ? SEL_DIM : spotK);
    const fs = fluidLook.s, fi = fluidLook.ink;   // (written in place: the look is read on the draw)
    fs[0] = fluidFloorAt(fluidH); fs[1] = fluidH; fs[2] = fluidAmp; if (run) fs[3] = fluidPhase();
    fi[0] = fluidInkRGBA[0]; fi[1] = fluidInkRGBA[1]; fi[2] = fluidInkRGBA[2]; fi[3] = fluidInkRGBA[3] * k * fluidFade();
    fluidLook.ripple = run && fluidFade() > 0 && k > 0;
    fluidLv[0] = liverScale; fluidLv[1] = liverFluidCut; fluidLook.lv = fluidLv;
    if (vLook) vLook.fluid = fluidLook;
    // (A level that moves under fluid drawn at no opacity changes no pixel (the shader draws none at ink 0): no whole repaint for it,
    // only for the frame it fades to nothing. External review, 21 Oct.)
    const seen = fluidLook.ink[3] > 0, was = fluidSeen;
    fluidSeen = seen;
    const from = fluidFrom ?? fluidH;
    fluidFrom = null;
    if (!(moved && (seen || was))) return false;
    // Only the pool's cells are composited again, from above the higher of the two levels (the surface, its ripple and its light
    // band) down: the rest of the picture does not change with it. It was the whole screen on every frame of a fill or a drain
    // (Fable's lag review, item 4). A whole repaint where there is no cavity to bound it.
    const pool = !!(veins && !veins.lost && veins.fluidPool(ABDOMEN_FLOOR + 5 - Math.max(from, fluidH) - fluidAmp - 6));
    if (pool) poolFrames++;
    return !pool;
  }
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

  // Point, unit normal and unit tangent at arc length `d` along a vessel's current centerline.
  function frameAt(id, d) {
    const g = geo[id];
    const [x, y, dx, dy] = pointAt(g.cur, clamp(d / (g.len || 1), 0, 1));
    const n = Math.hypot(dx, dy) || 1, q = frameKept;   // (read at once by its callers)
    q.x = x; q.y = y; q.tx = dx / n; q.ty = dy / n; q.nx = -dy / n; q.ny = dx / n;
    return q;
  }
  const frameKept = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0 };
  // A self-expanding metal stent over the lumen (two rails, a diamond lattice of struts, radiopaque markers at both
  // ends), so a shunt or a stented vein reads as a device, not a vessel. It runs from d0 to d1 along the vessel's drawn
  // path (either way round) and is drawn k of the way (0 to 1) from d0, the lattice anchored there, so a growing stent
  // unrolls instead of stretching. A narrowed stent pinches with its lumen (the same waist, in the segment its card names).
  // Returns the paths, to append where the mesh belongs.
  // The mesh's half-width at arc length d (its lumen's, a narrowed stent's waist included, plus the wall and the struts' own).
  function meshR(id, p) {
    const x = E[id], L = geo[id].len;
    const v = isImaging() ? 0 : p.stenosis[id] || 0, wf = v > 0.01 ? waist(id, v, L, x.width, p) : null;
    return (d) => (x.width / 2) * (wf ? wf(d / (L || 1)) : 1) + (x.wallPx || 1) + 1.2;
  }
  // ends: false leaves out the far end's marker (a stent unrolled by its front, venousDraw, carries that marker on the front).
  function meshPaths(id, p, d0, d1, k = 1, ends = true) {
    const sg = d1 >= d0 ? 1 : -1, A = Math.abs(d1 - d0), e = A * k;
    const R = meshR(id, p);
    const f = (a, side) => { const d = d0 + sg * a, q = frameAt(id, d), r = R(d); return [q.x + q.nx * r * side, q.y + q.ny * r * side]; };
    const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const cell = Math.max(6, R(d0) * 1.7);
    let rails = '', struts = '';
    for (const side of [1, -1]) {
      rails += 'M' + P(f(0, side));
      for (let a = 3; a < e; a += 3) rails += ' L' + P(f(a, side));
      rails += ' L' + P(f(e, side)) + ' ';
    }
    for (const start of [1, -1]) {
      let side = start, prev = f(0, side);
      struts += 'M' + P(prev);
      for (let a = cell / 2; a <= A + 0.01; a += cell / 2) {
        side = -side;
        const q = f(Math.min(a, A), side);
        if (a > e + 0.01) {   // (the lattice's growing end: the strut under way, drawn as far as it has come)
          const u = (e - (a - cell / 2)) / (cell / 2);
          if (u > 0.001) struts += ' L' + P([prev[0] + (q[0] - prev[0]) * u, prev[1] + (q[1] - prev[1]) * u]);
          break;
        }
        struts += ' L' + P(q); prev = q;
      }
      struts += ' ';
    }
    let marks = '';
    for (const a of k > 0.02 && ends ? [0, e] : [0]) { const m = f(a, 1), n = f(a, -1); marks += `M${P(m)} L${P(n)} `; }
    return [s('path', { class: 'stent-strut', d: struts }), s('path', { class: 'stent-rail', d: rails }), s('path', { class: 'stent-rail-glint', d: rails }), s('path', { class: 'stent-mark', d: marks })];
  }
  // TIPS, DIPS and the shunts drawn with the stent tool: the whole drawn shunt, in place at once (the vessel itself draws on).
  function stentMesh(id, p) { putMark(ov.stents, `stent:${id}`, id, meshPaths(id, p, 2, geo[id].len - 2)); }
  // A treatment's mark, built into its overlay group as one group of its own (data-mk: its key) that fades in and out with it: the
  // amount shown lives in markA across the overlays' rebuilds. vessel: the vessel it sits on (while that is drawn it may fade out
  // where it stands); anatOnly: it belongs to the anatomy view alone (a switch to the circuit takes it at once).
  let ovT = 0;   // (the morph the overlays are being built at)
  function putMark(host, key, vessel, els, anatOnly = false) {
    const g = s('g', { 'data-mk': key });
    g.append(...els);
    markShade(g, markA.want(key, { host, vessel, anatOnly, t: ovT }, quietFx()));
    markA.hold(key, g);
    host.append(g);
  }
  const { venousSync } = createVenous({ E, easeInOut, frameAt, geo, late, meshPaths, meshR, nextFrame, ov, putA }, live);
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
  function ligature(id, shunt) {
    const x = E[id], c = Math.min(divideLen(id) + 5, geo[id].len * 0.6);
    const R = x.width / 2 + (x.wallPx || 1) + 3;
    let d = '';
    for (const o of [-3.5, 3.5]) {
      const q = frameAt(id, c + o);
      d += `M${(q.x + q.nx * R).toFixed(1)} ${(q.y + q.ny * R).toFixed(1)} L${(q.x - q.nx * R).toFixed(1)} ${(q.y - q.ny * R).toFixed(1)} `;
    }
    putMark(ov.stents, `tie:${id}`, shunt, [s('path', { class: 'ligature', d })]);
  }

  // ── The HVPG catheter (Measure › HVPG) ─────────────
  // A balloon catheter drawn along the real vessels: in from the neck, down the SVC, through the right
  // atrium into the IVC and out into the right hepatic vein, where its tip reads the pressure. In
  // front of the inflated balloon the still column fills with the wedged (sinusoidal) pressure. The
  // readings are labels at the tip, in screen pixels. hvpg-proc.js drives it frame by frame.
  const cath = (() => {
    const g = s('g', { class: 'cath', 'aria-hidden': 'true' });
    const column = s('path', { class: 'cath-column' }), column2 = s('path', { class: 'cath-column' });
    const shadow = s('path', { class: 'cath-shadow' }), body = s('path', { class: 'cath-body' });
    const balloon = s('path', { class: 'cath-balloon' }), ring = s('circle', { class: 'cath-ring' }), tip = s('circle', { class: 'cath-tip' });
    g.append(column, column2, shadow, body, balloon, ring, tip);
    g.style.display = 'none';
    gOver.append(g);
    const labels = document.createElement('div');
    labels.className = 'cath-labels'; labels.setAttribute('aria-hidden', 'true');
    wrap.append(labels);
    return { g, column, column2, shadow, body, balloon, ring, tip, labels, st: null, at: null, saved: null, kind: 'hvpg' };
  })();
  // A presenter slide's measuring sites (the PPG's portal vein and IVC): a pointer on each station with its reading,
  // drawn like the catheter's WHVP and FHVP callouts. It fades in, follows the camera and stays in the figure's free space.
  // (The portal vein's hangs below the confluence, clear of the trunk and its clot.)
  // rLiver, rColl: the circuit's resistors, the liver's and the collaterals', each against the healthy liver's
  // resistance (a zigzag drawn on the vessels, its stroke heavier as the resistance rises, and the ratio beside it).
  const SITE_DEF = { pv: { node: 'CONF', kicker: 'Portal vein', cls: 'pv', below: true }, ivc: { node: 'IVCS', kicker: 'IVC', cls: 'ivc' },
    ra: { node: 'RA', kicker: 'Right atrium', cls: 'ivc' },
    web: { node: 'IVCS', kicker: 'IVC, below the web', cls: 'ivc', below: true },   // (with ra above it: the two sides of an IVC web)
    // split: where portal blood goes, the share that bypasses the liver over a bar split into the liver's and the shunts' shares.
    split: { node: 'PVH', kicker: 'Portal blood', cls: 'split', split: true, below: true },
    // (Both readings stand above the liver's column, clear of the station labels; the zigzags mark where each resistor is.)
    // (Named in full, each ratio bare; "vs healthy liver" is said once, in the group's key: 17 Oct design review.)
    rLiver: { kicker: 'Liver resistance', cls: 'res', unit: '', res: 'liver' },
    rColl: { kicker: 'Collateral resistance', cls: 'res coll', unit: '', res: 'coll' },
    // The gut's arterioles (the splanchnic arteries in parallel), in series before the liver: most of the pressure falls here.
    rGut: { kicker: 'Gut arteriole resistance', cls: 'res gut', unit: '', res: 'gut' } };
  // A resistor's reading is a figure label (label-gl, the one style): "R liver ×2.3", at the middle of its own zigzag, world-anchored like
  // every figure label, so it moves with the figure through every pan, pinch and zoom. resMask: which readings have a value (the labels'
  // signature); RES_LABEL: its words; the key ("vs healthy liver") rides once, on the outermost reading.
  const RES_BIT = { rGut: 1, rColl: 2, rLiver: 4 }, RES_LABEL = { rLiver: 'R liver', rColl: 'R collaterals', rGut: 'R gut' }, RES_FULL = { rLiver: 'Liver resistance', rColl: 'Collateral resistance', rGut: 'Gut arteriole resistance' };
  let resMask = 0, resLitRev = 0;
  const resKeyOn = () => (resMask & 1 ? 'rGut' : resMask & 2 ? 'rColl' : resMask & 4 ? 'rLiver' : null);
  function resItem(k) {
    const d = SITE_DEF[k], ratio = d?.res ? resRatio(d.res) : null;
    if (ratio == null) return null;
    const v = '×' + fmt(ratio, ratio < 10 ? 1 : 0);
    const lines = [[{ t: RES_LABEL[k], size: 11.5, weight: 600, cls: 'lb-name' }, { t: v, size: 11.5, weight: 650, cls: 'lb-val', gap: 4 }]];
    if (resKeyOn() === k) lines.push([{ t: 'vs healthy liver', size: 9.5, weight: 500, cls: 'lb-name' }]);
    return { key: 'r:' + k, res: k, src: ['res', k], cls: 'node res', lines, align: 'middle', padX: 3, padY: 2, w: Math.max(...lines.map(lineW)), h: lines.reduce((a, l) => a + LINE_H(l), 0), label: `${RES_FULL[k]}: ${v} the healthy liver's resistance` };
  }
  const resPt = [0, 0], resTan = [0, 0];
  // Where the reading's centre stands, stage-local, and the zigzag's anchor: the liver's between its two lobes' zigzags; the others beside theirs,
  // on the side away from the lane, clear of the zigzag's own amplitude (8 px at least, as resPaint draws it).
  function resPlace(it) {
    const k = it.res;
    let ax, ay, cx, cy;
    if (k === 'rLiver') {
      const a = worldToLocalInto(resPt, 850, 345); ax = a[0]; ay = a[1]; cx = ax; cy = ay;
    } else {
      const q = k === 'rGut' ? geo.A_SMA?.cur && pointAt(geo.A_SMA.cur, 0.5) : geo.C1b?.cur && pointAt(geo.C1b.cur, 0.5);
      if (!q) return false;
      const a = worldToLocalInto(resPt, q[0], q[1]); ax = a[0]; ay = a[1];
      const b = worldToLocalInto(resTan, q[0] + q[2] * 10, q[1] + q[3] * 10), L = Math.hypot(b[0] - ax, b[1] - ay) || 1;
      const tx = (b[0] - ax) / L, ty = (b[1] - ay) / L;
      let nx = -ty, ny = tx;
      if (Math.abs(ny) >= Math.abs(nx) ? ny > 0 : nx < 0) { nx = -nx; ny = -ny; }   // (up, else to the right)
      const off = Math.max(9 * (CTM?.sc || 1), RES_MIN_AMP_PX) + 6 + Math.abs(nx) * it.w / 2 + Math.abs(ny) * it.h / 2;
      cx = ax + nx * off; cy = ay + ny * off;
    }
    it.ax = ax; it.ay = ay; it.x = cx - it.w / 2; it.y = cy - it.h / 2;
    return true;
  }
  // Resistance as ΔP / Q: the liver's lobes, each its venules, sinusoids and outflow in series, in parallel with each other.
  const LOBES = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];
  const rOf = (P, Q, id) => { const k = EI[id], e = EDGES[k]; return (P[NI[e.from]] - P[NI[e.to]]) / Math.max(1e-6, Math.abs(Q[k])); };
  const GUT_ART = ['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA'];
  function liverRes(P, Q) {
    let g = 0;
    for (let i = 0; i < LOBES.length; i++) { const ids = LOBES[i]; let r = 0; for (let j = 0; j < ids.length; j++) r += rOf(P, Q, ids[j]); g += 1 / Math.max(1e-6, r); }
    return 1 / g;
  }
  /** The ratio a resistor shows, or null when there is nothing to show (collaterals closed). */
  function resRatio(kind) {
    const hp = store.get().healthy, at = pinned()?.at, P = at?.P || F.Pf || F.P, Q = at?.Q || F.Qf || F.Q;
    if (!hp?.P || !hp?.Q) return null;
    const r0 = liverRes(hp.P, hp.Q);
    // (The live frame breathes a few percent around the settled value, so a liver within 8% of the healthy one reads exactly ×1.0, not ×0.9 and ×1.0 by turns.)
    if (kind === 'liver') { const r = liverRes(P, Q) / r0; return Math.abs(r - 1) < 0.08 ? 1 : r; }
    if (kind === 'gut') { let g = 0; for (let i = 0; i < GUT_ART.length; i++) g += 1 / Math.max(1e-6, rOf(P, Q, GUT_ART[i])); return 1 / g / r0; }
    let qc = 0;
    for (const e of EDGES) if (e.kind === 'collateral' && edgePresent(e, store.get().params)) qc += Math.max(0, Q[EI[e.id]]);
    if (qc * 0.06 < 0.05) return null;
    return (P[NI.CONF] - P[NI.IVCS]) / qc / r0;
  }
  // (3 Nov 2026, "Move figure labels and pills off the SVG model": the circuit's resistors are kept records (over-records.js), drawn by the
  // overlay painter beside the SVG overlays' groups: no element is made, and no attribute or style written, for a zigzag. recs: their layer.)
  const RES_KEYS = {};   // (each reading's key in the records, made once: res:<name>)
  for (const k of Object.keys(SITE_DEF)) RES_KEYS[k] = 'res:' + k;
  const resMade = new Map();   // k → { _segs (the zigzags' end points, what the figure's labels keep off: buildSegs), cur (the numbers the record was made from) }
  let resLit = new Map();   // the circuit's resistors a slide's words point at (rLiver, rColl) → their station tone
  // A resistor's zigzag along a vessel: n teeth of amplitude amp (world units) from a to b, written into `out` at `at` (8 points for 6 teeth).
  const zigInto = (out, at, ax, ay, bx, by, n = 6, amp = 9) => {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    out[at++] = ax; out[at++] = ay;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, sgn = i % 2 ? -1 : 1; out[at++] = ax + dx * u + nx * amp * sgn; out[at++] = ay + dy * u + ny * amp * sgn; }
    out[at++] = bx; out[at++] = by;
    return at;
  };
  // (The readings' parts, made ahead: a frame clones them, never builds them.)
  // (A reading's own box, with its glass in it already for those that have one: cloned on a frame, nothing built there. callout.js withGlass)
  const SITE_EL = [document.createElement('div'), withGlass(document.createElement('div'))];
  const SITE_TPL = (() => { const e = document.createElement('div'); e.innerHTML = '<small></small><b></b><span></span><i class="res-k"></i>'; return e; })();
  const SPLIT_B = (() => { const e = document.createElement('b'); e.innerHTML = '<span class="sp-h"><em class="sp-n"></em>% bypasses the liver</span><span class="sp-bar"><i class="sp-l"></i><i class="sp-s"></i></span><span class="sp-cap"><em class="sp-lt"></em><em class="sp-st"></em></span>'; return e; })();
  const r1 = (v) => Math.round(v * 10) / 10;   // (a zigzag's points to a tenth of a world unit, as its path text was written)
  const RES_MIN_AMP_PX = 8, RES_MIN_W = 2.5;
  const RES_LIVER = new Float32Array([812, 303, 888, 303, 812, 387, 888, 387]);
  const resNow = new Float32Array(32), resKey = new Float64Array(8);   // (a record's numbers worked out, and what makes a resistor look as it does: written in place)
  // The token a station's tone names (toneCol's own, var(--x) → --x): its colour is read from the theme's tokens, never from the page.
  const toneTokens = new Map();   // alloc-rare: one text for each tone, made the first time it is lit
  const toneToken = (tone) => { let t = toneTokens.get(tone); if (!t) toneTokens.set(tone, (t = toneCol(tone).slice(4, -1))); return t; };
  const tokenRGB = (name, into, o) => { const c = cssRGB(cssVar(name) ? name : '--text'); into[o] = c[0] / 255; into[o + 1] = c[1] / 255; into[o + 2] = c[2] / 255; };
  // The records ask the painter to draw them again: a changed set of shapes re-sends the overlays' groups (overSend), a changed opacity
  // writes the shapes in place and touches the painter (recStep); either way a frame is asked for.
  function recStep() {
    recAsk = 0;
    recs.step(performance.now(), recOut);
    recFlush(recOut.changed);
    if (recOut.moving) recAsk = nextFrame(recStep);
  }
  function recFlush(changed) {
    if (!changed && recs.ver === recVer) return;
    if (recLive()) {
      if (recs.ver !== recVer) { recVer = recs.ver; overSend(); }
      veins.overlay.touch();
    } else { recVer = recs.ver; recSvgSync(); }
    askAnimate();
  }
  const recKick = () => { recFlush(false); if (!recAsk) recAsk = nextFrame(recStep); };
  // Whether the overlay painter is drawing (the GPU draws the records) or the SVG stands in for it (a software renderer, a lost context).
  const recLive = () => OVER_ON && !!veins?.overlay && !veins.lost && wrap.classList.contains('gl-on');
  // The SVG that stands in for the records where the GPU does not draw them: made the first time it is needed, from the records as they
  // stand. (The GPU path never makes it.)
  let recSvgG = null;
  function recSvgSync() {   // alloc-rare: only where the overlay painter is not drawing (a software renderer, a lost context), never on the GPU path
    if (!recs.spec) { recSvgG?.replaceChildren(); return; }
    if (!recSvgG) { recSvgG = s('g', { class: 'res-zz', 'aria-hidden': 'true', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); gOver.append(recSvgG); }
    const ops = recs.spec.ops;
    recSvgG.replaceChildren();
    for (let n = 0; n < ops.length; n++) {
      const op = ops[n], poly = op.geom.poly;
      let d = '';
      for (let j = 0; j < poly.length; j++) { const pts = poly[j].pts; if (j) d += ' '; for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)}`; }
      const c = op.paint.solid;
      recSvgG.append(s('path', { d, stroke: `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`, 'stroke-width': op.w, 'stroke-opacity': op.alpha, 'vector-effect': 'non-scaling-stroke' }));
    }
  }
  // A theme change: the resistors' tones are the theme's tokens, read again (the frame after, when the tokens have been read: util.js readVars).
  function resTheme() { for (const [k, st] of resMade) resPaint(k, st.d, st.ratio); }
  // A resistor: the halo under its line, each a zigzag along the segments, in the page's own sizes and tones (as its CSS gave them before the records).
  function resPaint(k, d, ratio) {
    let st = resMade.get(k);
    const want = sites.list?.includes(k) && ratio != null;
    const now = performance.now();
    if (!want) { if (st) { resMade.delete(k); recs.drop(RES_KEYS[k], now, reduceMotion.matches); recKick(); } return; }   // (faded out whole first, over D_SURFACE, then gone)
    if (!st) { st = { _segs: null, cur: null, d, ratio }; resMade.set(k, st); }   // alloc-rare: a resistor's record, made when it first shows
    // The zigzags' end points: the liver's two are fixed; the gut's and the collaterals' stand on their vessel, level with its course.
    let n = 0;
    // (A zigzag keeps at least 8 px of amplitude on screen at any zoom: its world amplitude is the larger of 9 units and 8 px at the scale now,
    // stepped a quarter octave so a zoom rebuilds the record a few times, not each frame.)
    const sc = CTM?.sc > 0 ? CTM.sc : 1, amp = Math.max(9, RES_MIN_AMP_PX / 2 ** (Math.round(Math.log2(sc) * 4) / 4));
    if (d.res === 'liver') {
      for (let i = 0; i < RES_LIVER.length; i += 4) n = zigInto(resNow, n, RES_LIVER[i], RES_LIVER[i + 1], RES_LIVER[i + 2], RES_LIVER[i + 3], 6, amp);
    } else {
      const q = d.res === 'gut' ? geo.A_SMA?.cur && pointAt(geo.A_SMA.cur, 0.5) : geo.C1b?.cur && pointAt(geo.C1b.cur, 0.5);
      if (q) n = zigInto(resNow, n, q[0] - q[2] * 34, q[1] - q[3] * 34, q[0] + q[2] * 34, q[1] + q[3] * 34, 6, amp);
    }
    for (let i = 0; i < n; i++) resNow[i] = r1(resNow[i]);
    const lit = resLit.get(k);
    // Heavier as the resistance rises: 1.5 px at the healthy liver's, about 4 px at four times it (to a tenth of a pixel).
    const w = Math.round(clamp(1.5 + 1.25 * Math.log2(Math.max(0.25, ratio)), RES_MIN_W, 5) * 10) / 10;   // (never under 2.5 px: a healthy resistor read as a hairline)
    // Its look as numbers: lit, the halo's rgb, the line's rgb, its width (the rgb is the theme's tokens', read when the theme last changed).
    resKey[0] = lit ? 1 : 0; resKey[7] = w;
    tokenRGB('--stage-bg', resKey, 1);
    tokenRGB(lit ? toneToken(lit) : '--text', resKey, 4);
    let same = !!st.cur && st.cur.n === n;
    if (same) for (let i = 0; i < 8; i++) if (st.cur.key[i] !== resKey[i]) { same = false; break; }
    if (same) for (let i = 0; i < n; i++) if (st.cur.pts[i] !== resNow[i]) { same = false; break; }
    st.d = d; st.ratio = ratio;
    if (!same) {
      // alloc-rare: a resistor's zigzag, colour or width changed (a slide's change, a theme, a resistance), not a frame that kept them
      const polys = [];
      for (let o = 0; o < n; o += 16) polys.push(resNow.slice(o, o + 16));
      st.cur = { n, key: Array.from(resKey), pts: resNow.slice(0, n) };
      st._segs = polys.map((p) => [[p[0], p[1]], [p[14], p[15]]]);   // (what the figure's labels keep off, buildSegs)
      const halo = lit ? { a: 0.22, w: w + 9, rgb: [resKey[4], resKey[5], resKey[6]] } : { a: 0.85, w: w + 3, rgb: [resKey[1], resKey[2], resKey[3]] };
      const line = { a: lit ? 1 : 0.8, w: lit ? w + 1.5 : w, rgb: [resKey[4], resKey[5], resKey[6]] };
      recs.put(RES_KEYS[k], polys.length ? [{ polys, kind: 'stroke', nss: true, cap: 1, ...halo }, { polys, kind: 'stroke', nss: true, cap: 1, ...line }] : [], now, reduceMotion.matches);
      recKick();
    }
  }
  // The wide screen's nav pill, read with the cards (readBlockers): its gap from the stage's right edge is the slides' one margin
  // (--pz-cm), and its top bounds the row the figure's readings keep clear of. Null when no pill shows (a phone, or no slide).
  let pillEdge = null;
  const sites = (() => {
    const el = document.createElement('div');
    el.className = 'cath-labels site-labels'; el.setAttribute('aria-hidden', 'true');
    wrap.append(el);
    return { el, list: null, fp: null, made: new Map(), dy: null, dyG: null };
  })();
  // (The glasses drawn in the figure's canvas, each as the labels are to leave it out (glass-gl.js onHoles, label-gl.js setHoles): every
  // glass's list, told to the labels as one whenever one changes. The labels' renderer is made further down (labelHoles).)
  const holeSets = new Map();
  let labelHoles = null;
  const holesAll = [];   // (every glass's list as one, written in place: the labels compare it number by number and keep nothing of it but its length)
  const sendHoles = () => {
    holesAll.length = 0;
    for (const l of holeSets.values()) for (let i = 0; i < l.length; i++) holesAll.push(l[i]);
    labelHoles?.setHoles(holesAll);
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
  // before the lobule covered it, still crossed it there. The labels the GPU draws already leave every card's glass out (setHoles); the
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
  // The "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split into the liver's
  // share (portal pink) and the shunts' (tinted like the shunt tile: plain, amber, red). The bar follows the share it is
  // asked for through the one filter the tiles' bars follow theirs with (display-state.js follow2, SHOWN_TAU): a new share
  // glides in, a share that keeps moving (a running model's mean, a what-if slider) is followed as it goes, and the callout's
  // size never changes.
  const SPLIT_TXT = [];   // percent → [the shunts' number, 'To the liver n%', 'Shunts n%']
  for (let i = 0; i <= 100; i++) SPLIT_TXT.push([`${i}`, `To the liver ${i}%`, `Shunts ${i}%`]);
  function splitShow(el, sh) {
    const p = portalSplit(sh);   // (a share of the portal blood: never read as the tile's liver flow, % of normal)
    // (Its three readings are drawn by glWords, never written in a frame: gl-words.js. Their words for each whole percent are made once: SPLIT_TXT.)
    const W = el._spW;
    W[0].set(SPLIT_TXT[p.shunt][0]); W[1].set(SPLIT_TXT[p.liver][1]); W[2].set(SPLIT_TXT[p.shunt][2]);
    el.style.setProperty('--sp-lf', (1 - sh).toFixed(4)); el.style.setProperty('--sp-sf', sh.toFixed(4));
    el.style.setProperty('--sp-lm', p.liver ? '4px' : '0px'); el.style.setProperty('--sp-sm', p.shunt ? '4px' : '0px');   // a share that rounds above 0 keeps a sliver; 0 leaves none
  }
  // (What a quarter of a pixel of the bar is, and under, cannot be seen: a share that far from the one shown lands, and is drawn
  // only when the bar or the number it prints would change, so a model that only breathes costs no styles.)
  const SPLIT_EPS = 0.002, SPLIT_DRAW = 0.0005;
  function splitPaint(el, sh, landed) {
    const d = el._shDrawn;
    if (d === sh || (d != null && !landed && Math.abs(sh - d) < SPLIT_DRAW && portalSplit(sh).shunt === portalSplit(d).shunt)) return;
    el._shDrawn = sh; splitShow(el, sh);
  }
  // splitTo only sets the share the bar aims at; the bar's own frames follow it. An ease that began afresh at each new share ran its
  // first step at no distance, so a share that changed every frame (the live model's running mean) cancelled each step before it
  // ran and the bar froze, 1 Nov. Here nothing restarts: a moving target is followed, from where the bar is, and never snaps.
  // (_sh the share shown, _shW the filter's first stage, _shAt the clock of its last step; the frame's own time can be a few ms before
  // the moment splitTo asked, so a step never runs on a negative interval. A tile that has left the page lands on its share at once,
  // not part way: _shTo already holds it, so the same share asked for again would otherwise never move it.)
  function splitStep(el, now) {
    el._shRaf = 0;
    const T = el._shTo, dt = Math.max(0, (now - el._shAt) / 1000);
    el._shAt = now;
    if (el.isConnected) { const r = follow2(el._sh, el._shW, T, dt, SHOWN_TAU, SPLIT_EPS); el._sh = r.v; el._shW = r.w; } else el._sh = el._shW = T;
    const landed = el._sh === T && el._shW === T;
    splitPaint(el, el._sh, landed);
    if (!landed) el._shRaf = easeFrame(el._shStep);
  }
  function splitTo(el, to) {
    if (el._shTo === to) return;
    el._shTo = to; el.dataset.rate = portalSplit(to).rate;
    const rest = !el._shRaf;
    if (el._sh == null || reduceMotion.matches) { cancelFrame(el._shRaf); el._shRaf = 0; el._shW = el._sh = to; splitPaint(el, to, true); return; }
    if (rest && Math.abs(to - el._sh) < SPLIT_EPS) { el._shW = el._sh = to; splitPaint(el, to, false); return; }
    if (rest) { el._shAt = performance.now(); el._shStep ||= (now) => splitStep(el, now); el._shRaf = easeFrame(el._shStep); }
  }
  const siteLive = (f, live, tol) => Number.isFinite(live) ? (Number.isFinite(f) && Math.abs(live - f) < tol ? f : live) : f;
  // Where a reading stands on the stage (its CSS translate worked out here, so placing it reads no layout), pointer included:
  // the figure's labels keep clear of it (layoutLabels). d: its SITE_DEF entry, or null for the catheter's readings.
  function calloutBox(el, d, cx, y, half, h) {
    const w = 2 * half, low = el.classList.contains('low');
    let bx = cx - half, by;
    if (d?.res) {
      const i = d.res === 'gut' ? 2 : d.res === 'coll' ? 1 : 0;
      if (low) { by = i === 2 ? y + h + 18 : y + 10; if (i === 0) bx = cx - w - 10; else if (i === 1) bx = cx + 10; }
      else by = y - (i + 1) * h - 12 - 6 * i;
      const b = { x0: bx, y0: by, x1: bx + w, y1: by + h };
      // (The key, centred on the group: above the outermost reading of a level circuit, under the group of an upright one.)
      if (el.classList.contains('keyed')) {
        const kw = (el._kwid || 0) / 2;
        b.x0 = Math.min(b.x0, cx - kw); b.x1 = Math.max(b.x1, cx + kw);
        if (low) b.y1 = by + 2 * h + 4; else b.y0 = by - h - 4;
      }
      return b;
    }
    const ahead = el.dataset.at === 'ahead' && !el.classList.contains('above');
    return ahead ? { x0: bx, y0: y, x1: bx + w, y1: y + 18 + h } : { x0: bx, y0: y - 18 - h, x1: bx + w, y1: y };
  }
  // A site's reading that leaves fades out whole, its glass too (cath-leave), and is removed once faded.
  function siteLeave(k, el) {
    if (sites.made.get(k) === el) sites.made.delete(k);
    el.classList.add('cath-leave');
    setTimeout(siteGone, reduceMotion.matches ? 0 : 700, el);
  }
  const sitePreQ = [], sitePreRun = () => { for (let i = 0; i < sitePreQ.length; i++) sitePreQ[i].classList.remove('cath-pre'); sitePreQ.length = 0; sitesAgain(); };   // (the readings just made, shown from the frame after)
  const siteGone = (el) => { dropLabel(el); el.remove(); };
  // A reading's number counts to a new value over 950 ms, eased, as the data card's tiles count (presenter.js tweener), so a slide's
  // or a patient's change never swaps it at once; within tol of the number shown (the live model breathing, a slider being dragged)
  // it simply follows. A reading just shown, hidden, or under reduced motion takes its number at once.
  const COUNT_MS = 950, LABEL_GLIDE_MS = 450;   // (LABEL_GLIDE_MS: the figure's labels glide as long: labelGlide)
  let sitesRaf = 0;
  const sitesRun = () => { sitesRaf = 0; if (F && sites.list) { refreshCTM(); sitesPaint(); } };
  const sitesAgain = () => { if (!sitesRaf) sitesRaf = nextFrame(sitesRun); };
  const SITE_CLS = {};   // (each reading's class text, made once)
  for (const k of Object.keys(SITE_DEF)) SITE_CLS[k] = `cath-label site ${SITE_DEF[k].cls} cath-pre`;
  const SITE_COUNT = {};   // (each reading's count in flight, made once: the record its element counts with)
  for (const k of Object.keys(SITE_DEF)) SITE_COUNT[k] = { from: 0, to: 0, t0: 0 };
  function siteCount(el, to, tol) {
    if (!Number.isFinite(to)) { el._nv = null; el._ng = null; return to; }
    if (el._nv == null || reduceMotion.matches || el.classList.contains('off')) { el._ng = null; return (el._nv = to); }
    const now = performance.now();
    let g = el._ng;
    if (g ? Math.abs(to - g.to) > tol : Math.abs(to - el._nv) > tol) { g = el._ng = el._ngO; g.from = el._nv; g.to = to; g.t0 = now; }
    if (!g) return (el._nv = to);
    g.to = to;
    const u = clamp((now - g.t0) / COUNT_MS, 0, 1);
    el._nv = g.from + (g.to - g.from) * easeInOut(u);
    if (u < 1) sitesAgain(); else el._ng = null;
    return el._nv;
  }
  const siteAt = [0, 0], resGone = [];   // (the resistors to drop, listed first as resPaint takes them out of resMade; the order the key goes by)
  let sitesWant = NO_LIST;   // (the readings this paint is for)
  function sitesPaint() {
    const want = sitesWant = sites.list || NO_LIST, made = sites.made;
    resMask = 0;
    resGone.length = 0;
    for (const k of resMade.keys()) if (!want.includes(k)) resGone.push(k);
    for (let i = 0; i < resGone.length; i++) resPaint(resGone[i], SITE_DEF[resGone[i]], null);
    for (const [k, el] of made) if (!want.includes(k)) siteLeave(k, el);
    if (!F || !want.length) return;
    const { width: W, height: H } = stageBox(), t = easeInOut(morph);   // (the cached box: reading the wrap's each model frame forced a layout)
    // (Never nearer a screen edge than the slides' one margin, as the cards and the figure's labels keep: 17 Oct design review.)
    const M = pillEdge ? pillEdge.m : 8;
    const x0 = Math.max(M, pzInset('--pz-l') + 8), x1 = W - Math.max(M, pzInset('--pz-r') + 8), y0 = Math.max(M, pzInset('--pz-t') + 8), y1 = H - pzInset('--pz-b') - 8;
    // (A wider screen's colour key stands on the nav pill at the lower right (presenter.js): one box, kept clear of every callout;
    // read at most twice a second, not each model frame.)
    const ko = keyPillBox();
    for (const k of want) {
      const d = SITE_DEF[k];
      if (!d || (d.node && !NODE_POS[d.node])) continue;
      // (A resistor's reading is a figure label now, resItem: only its zigzag is painted here, and which readings have a value is noted for the labels' signature.)
      if (d.res) { const ratio = resRatio(d.res); resPaint(k, d, ratio); if (ratio != null) resMask |= RES_BIT[k]; continue; }
      const ratio = null;
      let el = made.get(k);
      if (!el) {
        el = SITE_EL[d.res ? 0 : 1].cloneNode(true); el.className = SITE_CLS[k]; el._ngO = SITE_COUNT[k];
        if (!d.res) el._glass = glassCallout(el);
        // (Its parts are cloned from a model made ahead and put in the page, with their words, between frames: late().)
        const [sm, b0, u, kk] = SITE_TPL.cloneNode(true).children, b = d.split ? SPLIT_B.cloneNode(true) : b0;
        // (The share's three readings, taken from its own parts now: they join the callout only between frames (late), so a first paint
        // that looked for them in the callout found none and threw, and the slide was not shown.)
        if (d.split) el._spW = [...b.querySelectorAll('.sp-n, .sp-lt, .sp-st')].map((e) => glWords(e));
        el._b = b;   // (its number's box, kept for the same reason)
        late('text', sm, d.kicker); late('text', u, d.split ? '' : d.unit ?? 'mmHg');
        late('append', el, d.res ? [sm, b, u, kk] : [sm, b, u]);
        late('add', sites.el, el); made.set(k, el);
        // (Its first look at cath-pre is the frame's own style pass: it comes in from there next frame, with no layout forced for it.)
        { sitePreQ.push(el); nextFrame(sitePreRun); }
      }
      // Live readings, like the data card: the slide's numbers (fp) only while the model still agrees with them, so a
      // what-if slider moves the callouts as it moves the tiles.
      if (d.split) splitTo(el, clamp((Number.isFinite(sites.fp?.shunt) ? sites.fp.shunt : beatMean('shunt', F.metrics?.shuntFraction, 2)) ?? 0, 0, 1));   // (the slide's own share, the tile's number; a what-if or a time-lapse moves it with the tiles)
      // (A new number counts there, as the data card's tiles do, never jumps: siteCount.)
      const n = d.split ? null : d.res ? (ratio == null ? null : siteCount(el, ratio, 0.15)) : siteCount(el, siteLive(Number.isFinite(sites.fp?.[k]) ? sites.fp[k] : pinned()?.at?.P[NI[d.node]], (F.Pf || F.P)[NI[d.node]], breath(Number.isFinite(sites.fp?.[k]) ? sites.fp[k] : (F.Pf || F.P)[NI[d.node]])), 0.5);
      const b = el._b, v = d.split ? null : d.res ? (n == null ? '' : '×' + fmt(n, n < 10 ? 1 : 0)) : fmt(n, 1);
      if (v != null) putText(b, v);
      let x, y;
      { const np = nodePos(d.node, t), wl = worldToLocalInto(siteAt, np[0], np[1]); x = wl[0]; y = wl[1]; }
      // Off the free space (or a resistor with nothing to show, or out of the circuit), the reading waits hidden; above
      // its point unless the top is covered (decided once, so it never jumps).
      // (A reading wider than the free space, as the portal blood's share is between two wide cards on a phone held sideways, waits
      // hidden too: it would stand half under a card, its words cut off.)
      el.classList.toggle('off', x < x0 || x > x1 || y < y0 || y > y1 || (!!d.res && (ratio == null || t < 0.5)) || (!d.res && !!el._half && 2 * el._half > x1 - x0 + 1));
      if (el._below == null && el._h) { el._below = d.below ? y + 18 + el._h < y1 : y - 18 - el._h < y0; el.dataset.at = el._below ? 'ahead' : ''; }
      // (Its width read again only when its words or classes change: a read after each frame's new number forced a layout.)
      // (Its digits are tabular, every one as wide as a zero (app.css .cath-label b), so a number counting to its next value keeps the
      // width and is not read again: with each counted step it was, a layout of the whole page forced in the middle of the labels'
      // update, after the figure's writes, 20 to 53 ms on his Mac (30 Oct). The labels' own widths are taken the same way: textW.)
      // (1 Nov 2026: its size is read first in the next frame, before any write (siteSize), never between the frame's writes; 'off' only fades
      // it, so it is not part of the key.)
      const wk = `${el.className.replace(/(?:^|\s)off(?=\s|$)/, '')}|${el.textContent.replace(/\d/g, '0')}|${W}|${labelBase()}|${labelFonts}`;
      if (el._wk !== wk || !el._half) siteSize(el, d, wk);
      const half = el._half, cx = clamp(x, Math.min(x0 + half, (x0 + x1) / 2), Math.max(x1 - half, (x0 + x1) / 2));
      el._box = el.classList.contains('off') ? null : calloutBox(el, d, cx, y, half, el._h || 0);
      el.style.setProperty('--ax', `${(x - cx).toFixed(1)}px`);
      el._glass?.(x - cx);
      el.style.transform = `translate(${cx.toFixed(1)}px, ${y.toFixed(1)}px)`; el._y = y;
      // Over the key or the nav pill: the callout steps left, its pointer still on its point; with no room there, a callout above
      // its point rises just clear of them. (Its height and its top's offset from its point are read with its width.)
      // (A reading's own offset is known from its side of the point, app.css data-at: read off the screen, it was read part way through
      // the .45 s glide to that side, and a callout below its point counted as above it, its foot on the key: Shunts 2 sideways.)
      if (!d.res) { el._kh = el._h || 0; el._kt = el.dataset.at === 'ahead' && !el.classList.contains('above') ? 18 : -18 - el._kh; }
      else if (el._kw !== wk + el.dataset.at) { el._kw = wk + el.dataset.at; siteSize(el, d, wk); }
      if (ko && !el.classList.contains('off')) {
        const rl = cx - half, rr = cx + half, rt = y + el._kt, rb = y + el._kt + el._kh;   // (its box: left, right, top, bottom)
        if (rr > ko.l - 8 && rl < ko.r + 8 && rb > ko.t - 8 && rt < ko.b + 8) {
          const dx = rr - (ko.l - 8), dy = rb - (ko.t - 8);
          if (rl - dx >= x0 && Math.abs(x - (cx - dx)) < half - 16) {
            el.style.setProperty('--ax', `${(x - cx + dx).toFixed(1)}px`); el._glass?.(x - cx + dx);
            el.style.transform = `translate(${(cx - dx).toFixed(1)}px, ${y.toFixed(1)}px)`;
            if (el._box) { el._box.x0 -= dx; el._box.x1 -= dx; }   // (the box calloutBox just made for this paint: no other holds it yet)
          } else if (!el._below && rt - dy >= y0 - 8) { el.style.transform = `translate(${cx.toFixed(1)}px, ${(y - dy).toFixed(1)}px)`; if (el._box) { el._box.y0 -= dy; el._box.y1 -= dy; } }
          // (One below its point, as the portal blood's share is, with no room to the left: it turns to stand above its point when
          // that is clear, once (Shunts 2 on a phone held sideways, its foot on the key).)
          else if (el._below && !el._turned && y - 18 - el._kh >= y0) { el._turned = true; el._below = false; el.dataset.at = ''; }
        }
      }
    }
  }
  // A reading's size (and a resistor's top, from where it was last placed), read first in the next frame (readFrame), when its words or
  // classes changed; the reading is placed again then. (Its digits are tabular: a counting number keeps its key and is never read again for it.)
  const siteWant = new Set();
  let siteAsk = 0;
  function siteMeasure(el, d, wk) {
    el._wk = wk; el._half = el.offsetWidth / 2; el._h = el.offsetHeight; el._kwid = d.res ? el.querySelector('.res-k')?.offsetWidth || 0 : 0;
    if (d.res && el._y != null) { const q = el.getBoundingClientRect(), wb = stageBox(); el._kt = q.top - wb.top - el._y; el._kh = q.height; }
    else { el._kh = el._h; el._kt = el.dataset.at === 'ahead' && !el.classList.contains('above') ? 18 : -18 - el._kh; }
  }
  function siteSize(el, d, wk) {
    el._sd = d; el._sk = wk; siteWant.add(el);   // (what to measure it with, kept on the reading itself)
    siteAsk ||= readFrame(siteRead);
  }
  function siteRead() {
    siteAsk = 0;
    for (const e of siteWant) if (e.isConnected) siteMeasure(e, e._sd, e._sk);
    siteWant.clear();
    sitesAgain();
  }
  let kpAt = -1e9, kpBox = null, kpAsk = 0;
  const kpBoxKept = { l: 0, t: 0, r: 0, b: 0 };   // (kpBox when a pill shows: written in place by each read, which comes first in a frame; the one caller reads it at once)
  function keyPillBox() {
    const now = performance.now();
    if (now - kpAt < 500) return kpBox;
    // (Kept while nothing laid out may have moved and while the view moves; due, read first in the next frame, never between its writes.)
    if (kpAt > -1e9 && (viewMoving() || !watch.due())) return kpBox;
    kpAsk ||= readFrame(keyPillRead);
    return kpBox;
  }
  function keyPillRead() {
    kpAsk = 0; kpAt = performance.now();
    let box = null;
    const wb = stageBox(), nl = document.querySelectorAll('.pz:not(.stack) .pz-fk:not([hidden]):not([data-empty]), .pz-bar.pzb-pill, .pz:not(.stack) .pz-scales:not([hidden])');
    for (let i = 0; i < nl.length; i++) {
      const r = nl[i].getBoundingClientRect();
      if (!r.width) continue;
      const l = r.left - wb.left, t = r.top - wb.top, rr = r.right - wb.left, b = r.bottom - wb.top;
      if (box) { box.l = Math.min(box.l, l); box.t = Math.min(box.t, t); box.r = Math.max(box.r, rr); box.b = Math.max(box.b, b); } else { box = kpBoxKept; box.l = l; box.t = t; box.r = rr; box.b = b; }
    }
    kpBox = box;
    sitesAgain();
  }
  const { scan, scanCardsRead, scanPaint, scanTick, scanTipLocal, setScanProbe } = createScan({ NO_LIST, SCAN_BOX, gMatrix, late, nextFrame, organEls, organG, readFrame, refreshCTM, sites, stageBox, viewMoving, watch }, live);
  // ── The Doppler probe (dop-probe.js) ──
  // While the Doppler reads a vessel, a small probe stands off it, its line of sight runs straight through the vessel, and the sample
  // volume's two bars and the flow axis mark the vessel's middle (where its callout points), or a stent's sampled third. It
  // follows the camera with the labels; it fades out while the views morph and in the liver's own views. A new vessel or third, or
  // a card making it change sides, fades it out where it stood and back in at its new place (nothing jumps).
  let dprCardsList = [], dprCardsAt = -1e9, lbRects = [], colShown = false, colWaitAt = 0;   // colShown: a stent's three point callouts stand (the probe keeps off them, so it waits for them)
  const { dprDots, dprHold, dprLet, dprMake, dprobePaint, smooth01 } = createDoppler({ E, EV, arcMid, cath, clampW, dop, dpr, geo, nextFrame, olKey, olRings, organEls, pointAt, readFrame, scanCardsRead, sites, stageBox, unseenCard, viewMoving, watch, worldToLocalInto }, live);
  const { NO_BLK, cathAt, cathFadeOut, cathFocus, cathFollow, cathLabelsNow, cathLabelsSoon, cathPaint, cathRadOf, cathRoom, cathRoute, procIn } = createCath({ E, NO_LIST, animateVT, appEl, applyVT, blockersRead, cardSpace, cardSpaceRead, cath, clientToVB, clientToVBFast, drawFrame, easeFrame, easeInOut, geo, glWanted, late, nextFrame, polyD, readBlockersRead, readFrame, refreshCTM, safeInsets, stageBox, syncVeins, toRGB, worldToLocalInto, wrap, wrapCS }, live);
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
  // How far a point's callout stands from its dot: clear of the stent's body, its leader 16 px at most.
  const colGap = (sid) => Math.min(16, ((E[sid]?.width || 4) * CTM.sc) / 2 + 7);
  // (The "60 %" is drawn in the figure's own units, in the labels' own name size on screen (fontPx 11.5: 12 px at least, the text size
  // setting and a presentation's projector size included), the weight and the 7 px stage-colour halo of the callouts beside it.)
  // (Its halo a constant 7 px wide on screen, whatever the zoom: wide enough to fill the counters of "6", "0" and "%" too, so
  // the figure never shows through inside a digit: Review 16 Oct.)
  const clampFontAt = (el) => {
    const px = fontPx(11.5);
    if (Math.abs(px - clampBase) > 0.01) { clampBase = px; applyClampFs(); }
    const fs = CTM.sc > 0 && CTM.sc < 1 ? clampBase / CTM.sc : 0;   // (written only when it moved: the same size is no change)
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
    setTimeout(() => {
      m.cur = m.want; m.busy = false;
      for (const el of els()) { clampFades.get(el)?.cancel(); clampFades.delete(el); clampLabelAt(el); el.animate?.([{ opacity: 0, offset: 0 }], { duration: dur }); }
      if (F) updateLabels(F);
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
    const size = parseFloat(el.style.fontSize) || (parseFloat(clampFs) || 12), end = el.getAttribute('text-anchor') === 'end';
    const x = attrNum(el, 'x') + attrNum(el, 'dx'), y = attrNum(el, 'y') + attrNum(el, 'dy');
    if (el._gs === size && el._gx === x && el._gy === y && el._ge === end && el._gp) return;
    el._gs = size; el._gx = x; el._gy = y; el._ge = end;
    clampLook.size = size;
    const w = textPolys(el._txt, 0, 0, clampLook).w, d = polysD(textPolys(el._txt, end ? x - w : x, y, clampLook).polys);
    if (!el._gp) { el._gp = [s('path', { class: 'clamp-halo' }), s('path', { class: 'clamp-glyph' })]; el.replaceChildren(el._gp[0], el._gp[1]); }
    el._gp[0].setAttribute('d', d); el._gp[1].setAttribute('d', d);
  }
  const clampGlyphsIn = () => { placeClampLabels(); if (F) updateLabels(F); };
  function clampTextBox(el) {
    if (!glyphsReady()) { if (!clampGlyphAsk) { clampGlyphAsk = true; loadGlyphs().then(clampGlyphsIn); } return null; }
    const cls = el.getAttribute('class') || '';
    const size = parseFloat(el.style.fontSize) || (/clamp-label/.test(cls) && parseFloat(clampFs)) || 12;
    const o = clampTbOpts;   // (kept, rewritten: textBox reads it and holds nothing)
    o.anchor = el.getAttribute('text-anchor') || 'start'; o.size = size; o.k = CTM?.sc > 0 ? CTM.sc : 1;
    return textBox(el._txt ?? el.textContent, attrNum(el, 'x') + attrNum(el, 'dx'), attrNum(el, 'y') + attrNum(el, 'dy'), o);   // (tnum: the "60 %" is drawn in tabular figures (#labels text), so its box is one width whatever its digits are)
  }
  // Where clampLabelAt puts a clamp's percentage (its spot, which side its text runs and its offset), without writing it.
  function clampLabelPos(el) {
    const c = el._c;
    if (!c) return null;
    const away = c.id === clampFor ? clampAway : null;
    const kept = c.id === clampFor ? clampD.get(c.id) : null, mv = c.id !== clampFor ? clampMv.get(c.id)?.cur : null;
    const d = c.off + (el._d ?? mv?.d ?? kept?.d ?? 16), t = el._d != null ? el._t ?? 0 : mv?.t ?? kept?.t ?? 0;
    // (The two spots, one each side of the vessel, d out and t slid along it.)
    const p0x = c.x + c.nx * 1 * d - c.ny * t, p0y = c.y + c.ny * 1 * d + c.nx * t, p1x = c.x + c.nx * -1 * d - c.ny * t, p1y = c.y + c.ny * -1 * d + c.nx * t;
    const xs = clampXs;
    xs[0] = worldToLocalInto(clampTmp, p0x, p0y)[0]; xs[1] = worldToLocalInto(clampTmp, p1x, p1y)[0];
    const k = away && (away === 'W') !== (xs[0] < xs[1]) ? 1 : 0, left = xs[k] < xs[1 - k] - 0.5;
    const q = clampPos;   // (kept, rewritten: every caller reads it at once)
    q.x = k ? p1x : p0x; q.y = k ? p1y : p0y; q.left = left;
    const gap = (6 * clampBase) / 12 / Math.max(CTM?.sc || 1, 1e-3), deg = rotDeg();   // (6 px on screen at 12 px text, the text's own offset from its spot, in step with the text's size)
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
    o.push(okTs, isImaging(), findingHidden('clot'));
    okFlat(o, p.stenosis); okFlat(o, p.stenosisSite); okFlat(o, p.thrombus); okFlat(o, p.occluded); o.push(p.splenicRx | 0);
    okFlat(o, p.tips); okFlat(o, p.dips); okFlat(o, p.customShunts); okFlat(o, p.balloonEso); okFlat(o, p.balloonGas);
    for (const id in p.stenosis) okLesion(o, id);
    for (const id in p.thrombus) okLesion(o, id);
    for (const id in p.occluded) okLesion(o, id);
    okLesion(o, 'TIPS'); okLesion(o, 'DIPS'); okLesion(o, 'S_PC'); okLesion(o, 'S_DSR'); okLesion(o, 'S_MC');
    for (let i = 0; i < LIGATED.length; i++) okLesion(o, LIGATED[i][1]);
    for (const id in p.customShunts) okLesion(o, id);
    const stented = store.get().stented;
    if (stented) for (let i = 0; i < stented.length; i++) okLesion(o, stented[i]);
    okLesion(o, 'C3');
    // (The varices are no longer drawn here, but by the plexus of channels and strands (varix-look.js), so the varix's diameter, radius
    // and wall-stress ratio are not part of what these overlays are built from. They were in this key, held in steps narrower than the
    // beat's own swing, and rebuilt the clamps, clots and plugs, and the vessel marks with them (a style pass and a triangulation of
    // every mark), five to ten times a second in any patient with a varix.)
    o.push(Math.round(f.bands || 0), hold('c3', recruitFrac('C3', f), 0.1),
      // (The spleen's infarcted patches are drawn at the organ's size, which the organ itself follows each frame while it shrinks or
      // grows: held in steps, so the patches ride it in a few small rebuilds, not stay at the size they were first drawn at.)
      p.splenicRx === 1 ? hold('sp', f.slow.spleen / 11, 0.02) : 0, lastMorph);
    let same = o.length === okCur.length;
    for (let i = 0; same && i < o.length; i++) if (o[i] !== okCur[i] && (o[i] === o[i] || okCur[i] === okCur[i])) same = false;   // (a NaN is the same as a NaN)
    if (!same) { okNext = okCur; okCur = o; ovInVer++; }
    return ovInVer;
  }
  const setVar = (el, k, v) => { const c = el._v || (el._v = {}); if (c[k] === v) return; c[k] = v; el.style.setProperty(k, v); };
  const { bal, balloonDraw, balloonStep } = createBalloon({ ov }, live);
  let balloonSqueeze = 1;
  function updateOverlays(f, p, gain, t) {
    // Colors follow pressure continuously through CSS variables; geometry rebuilds only on change.
    const PM = f.Pf || f.P;
    setVar(ov.varices, '--vx', pressureColor(qP(PM[NI.VAR])));
    setVar(ov.gvarices, '--vx', pressureColor(qP(PM[NI.GV])));
    const key = overlayInputs(f, p, t);
    balloonStep(p, t < 0.5);
    venousSync(p, t < 0.5, key !== overlayKey);
    if (key === overlayKey) return;
    overlayKey = key;
    ovAskBuf.f = f; ovAskBuf.p = p; ovAskBuf.t = t; ovAsk = ovAskBuf;   // (the last ask wins: one kept record, rewritten)
    if (!ovAsked) { ovAsked = true; restPass(overlayCommit); }
  }
  // The overlays' structure (clamps, clots, shunt meshes, marks, bands) is rebuilt between frames from what the frame last asked for.
  let ovAsk = null, ovAsked = false;
  const ovAskBuf = { f: null, p: null, t: 0 };
  function overlayCommit() {
    ovAsked = false;
    if (!ovAsk) return;
    const { f, p, t } = ovAsk;
    const anat = t < 0.5;
    // stenosis clamps & thrombi
    const hideDx = store.get().found ? findingHidden('clot') : isImaging();
    // (A narrowing that goes leaves its clamp and "60 %" to fade out in ov.clampsOut, under other classes so the label
    // layout never counts them; one that comes, or comes back, fades in from where it stands.)
    const want = new Set(Object.entries(p.stenosis).filter(([id, v]) => !hideDx && v > 0 && E[id]?.vis).map(([id]) => id));
    if (!clampFading()) clampLast = performance.now();
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
    if (!markA.moving()) markLast = performance.now();
    markA.begin(); ovT = t;
    // Clots keep their own key: growing varices (the disease clock) rebuild the rest, not them.
    const tk = JSON.stringify([t.toFixed(3), hideDx, p.thrombus, Object.keys(p.thrombus).map((id) => (E[id] ? [E[id].vis, held[`w${id}`]] : 0))]);
    const clots = tk !== thrombiKey;
    if (clots) { thrombiKey = tk; ov.thrombi.innerHTML = ''; }
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
    for (const id of ['TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', ...Object.keys(p.customShunts || {})]) {
      if (!E[id].vis || E[id].reveal) continue;
      if (id === 'TIPS' || id === 'DIPS' || id.startsWith('X_')) stentMesh(id, p); else anastomoses(id);
    }
    // The stump of the vessel each surgical shunt divides, a clear gap past where the shunt leaves it.
    for (const [shunt, vein] of LIGATED) if (E[shunt].vis && !E[shunt].reveal && E[vein]?.vis) ligature(vein, shunt);
    for (const id of new Set([...Object.keys(p.occluded), ...(p.occluded.C5 ? ['C2'] : [])])) {
      if (!isOccluded(p, id) || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      putMark(ov.plugs, `plug:${id}`, id, [s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 })]);
    }

    // Spleen: embolization leaves pale infarcted patches in the organ; after a splenectomy the organ
    // fades (see the opacity set with its size) and a cross is drawn on it.
    const rx = p.splenicRx | 0;
    if (anat && rx) {
      const [cx, cy] = SPLEEN_CENTER, sc = f.slow.spleen / 11;
      if (rx === 1) {
        putMark(ov.plugs, 'spleen:patches', null, [[6, -38, 17, 22], [14, 4, 15, 20], [2, 44, 14, 17]].map(([dx, dy, rx_, ry_]) =>
          s('ellipse', { cx: cx + dx * sc, cy: cy + dy * sc, rx: rx_ * sc, ry: ry_ * sc, fill: 'var(--surface)', 'fill-opacity': 0.55, stroke: 'var(--danger)', 'stroke-width': 1.5, 'stroke-opacity': 0.7 })), true);
      } else {
        const x = cx + 12, y = cy + 6;
        putMark(ov.plugs, 'spleen:cross', null, [s('circle', { cx: x, cy: y, r: 18, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2.5 }),
          s('path', { d: `M${x - 8} ${y - 8} L ${x + 8} ${y + 8} M${x + 8} ${y - 8} L ${x - 8} ${y + 8}`, stroke: 'var(--danger)', 'stroke-width': 3, 'stroke-linecap': 'round' })], true);
      }
    }
    // The varices themselves are shown by the plexus of channels feeding and draining them (see
    // STRANDS in anatomy.js), which swell as they are recruited; here only the bands, fitted at
    // ligation, are drawn over the lower esophagus.
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const eso = (y) => 789 + (y - 24) * 0.066;
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) { const y = 272 - i * 16; putMark(ov.bands, `band:${i}`, null, [s('ellipse', { cx: eso(y), cy: y, rx: 11, ry: 3, class: 'band-ring' })], true); }
    }
    // The marks that were not wanted this time fade out where they stood (their group drawn again in its host), unless what they sat on
    // has gone, the view is on its way to the other one, or the figure moved under them. (One already fading finishes even when its
    // vessel has finished retracting: the retraction runs on the wall clock, the fade on frame time.)
    for (const [, el, m] of markA.end((key, m, fading) => m.t === t && (anat || !m.anatOnly) && (fading || !m.vessel || E[m.vessel]?.vis))) m.host.append(el);
    balloonDraw(anat);
    mk.ver++;
    marksSync();
  }

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
  // renderer, without WebGL2, or once the GPU's context is lost. Always on a canvas of their own (round 2, 2.2: the
  // labels change at other moments and at another density than the figure; drawn into the vessel canvas, 31 Oct, they went missing on
  // the iPhone).
  const frostWake = () => { glassGL?.redraw(); paneGL?.redraw(); for (const g of cardGLs) g.redraw(); };
  const labelGL = createLabelGL(labelSvg, gLabels, { software: SOFTWARE, marks: [gLeaders, gScan], onBoxes: frostWake });
  // (Labels part of the figure: each station label drawn at its point as the figure has it in this frame, label-gl.js pinTo.)
  // (The same kind of point the layout took (pmid): the middle of the vessel it names, or the station itself. A view change that shows or hides
  // that vessel must not swap one for the other part way: the label would leap between the two.)
  const PIN_P = [0, 0];
  // (A point slid along its vessel by the tidy (au, 0.5 its middle): where it stands on that vessel now, stage px, into PIN_P; false if none.)
  function pinVesselAt(id, au) {
    const eid = LABEL_VESSEL[id], x = eid && E[eid], P = x && x.vis && !x.ghost ? geo[eid]?.cur : null;
    if (!(P?.length > 1)) return false;
    const m = arcMid(P, au); worldToLocalInto(PIN_P, m[0], m[1]);
    return true;
  }
  function pinKind(id, ax, ay, au) {
    if (!CTM) refreshCTM();
    const t = easeInOut(morph), a = labelAnchor(id, t);
    if (a.mid && (au == null || au === 0.5) && Math.hypot(a.ax - ax, a.ay - ay) < 1) return 1;
    if (au != null && au !== 0.5 && pinVesselAt(id, au) && Math.hypot(PIN_P[0] - ax, PIN_P[1] - ay) < 1) return 1;
    const p = nodePos(id, t); worldToLocalInto(PIN_P, p[0], p[1]);
    return Math.hypot(PIN_P[0] - ax, PIN_P[1] - ay) < 1 ? 2 : 0;
  }
  // (How a label's place moves as its gap grows by one px, per direction (stage.js offset).)
  const PIN_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], EL: [1, 0], WL: [-1, 0], NE: [0.72, -0.72], NW: [-0.72, -0.72], SE: [0.72, 0.72], SW: [-0.72, 0.72] };
  if (labelGL) labelGL.pinTo((id, out, mid, au) => {
    if (!CTM) refreshCTM();
    if (mid && au != null && au !== 0.5 && pinVesselAt(id, au)) { out[0] = PIN_P[0]; out[1] = PIN_P[1]; if (zoomM) { out[0] = zoomM[0] * out[0] + zoomM[4]; out[1] = zoomM[3] * out[1] + zoomM[5]; } return Number.isFinite(out[0]) && Number.isFinite(out[1]); }
    const t = easeInOut(morph), a = labelAnchor(id, t);
    if (mid || !a.mid) { out[0] = a.ax; out[1] = a.ay; } else { const p = nodePos(id, t); worldToLocalInto(PIN_P, p[0], p[1]); out[0] = PIN_P[0]; out[1] = PIN_P[1]; }
    // (A card's zoom: the point is carried by the scene camera; the label's offset from it is not.)
    if (zoomM) { const x = out[0], y = out[1]; out[0] = zoomM[0] * x + zoomM[4]; out[1] = zoomM[3] * y + zoomM[5]; }
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  }, (wx, wy, view, out, s) => {
    // (A world anchor, any figure label: where the point is under this frame's camera. Only at rest in the view it was laid out for: between the
    // two views the geometry moves, and those labels follow as before.)
    if (viewXf) { if (!CTM) refreshCTM(); return morphAnchorAt(wx, wy, view, out, s); }   // (the change between the views: the point rides the vessel it lies on)
    if (!(morph === 0 || morph === 1) || morph !== view) return false;
    if (!CTM) refreshCTM();
    worldToLocalInto(out, wx, wy);
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  });
  wrap.dataset.labels = labelGL ? 'gpu' : 'svg';
  labelRider = labelGL;
  labelGL?.setProbeCam?.(() => zoomM);   // (the Doppler probe rides a card's zoom with the figure)
  labelHoles = labelGL?.setHoles ? labelGL : null;
  sendHoles();
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
  const frostPartOf = (t) => (!t?.nodeType ? '' : svgOver?.contains(t) ? 'over' : glass?.contains(t) ? 'pane' : labelSvg?.contains(t) || (labelGL && t === labelGL.canvas) ? 'labels'
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
    frostSee(labelGL && !labelGL.lost ? labelGL.canvas : null);
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
    const lc = labelGL && !labelGL.lost ? labelGL.canvas : labelSvg;
    if (visible(lc) && visible(labelSvg)) {
      if (labelGL && !labelGL.lost) {
        // (The labels the GPU draws leave every glass drawn in the figure's canvas out (setHoles): they never send a glass back to the
        // browser's blur. Only those the SVG still draws itself lie over it.)
        if (!labelGL.holes) {
          const r = lc.getBoundingClientRect();
          for (const b of labelGL.boxes) o.push({ left: r.left + b[0] - 1, top: r.top + b[1] - 1, right: r.left + b[2] + 1, bottom: r.top + b[3] + 1 });
        }
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
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  // (Words measured from the GPU atlas's own Inter metrics, glyph-measure.js, as label-gl.js sets them: no 2D canvas.)
  const widths = new Map(), widthZ = new Map();   // (widths: a text with its digits as zeros → a flat list of weight, size, track, width; widthZ: a text as given → that form)
  let widthN = 0;
  function textW(t, size, weight = 500, track = 0) {
    // Labels draw tabular digits (every digit as wide as a zero), so measure them that way too:
    // a value ticking from 6.0 to 6.1 then keeps its width and its label stays put. (Kept by that text too, so a ticking
    // value is measured once, not once for every value it passes through.)
    let z = widthZ.get(t);
    if (z === undefined) { z = t.replace(/\d/g, '0'); if (widthZ.size > 3000) widthZ.clear(); widthZ.set(t, z); }
    let e = widths.get(z);
    if (e) for (let i = 0; i < e.length; i += 4) if (e[i] === weight && e[i + 1] === size && e[i + 2] === track) return e[i + 3];
    const w = measureWords(z, `${weight} ${size}px ${FONT}`) + track * size * z.length;
    if (widthN > 1500) { widths.clear(); widthN = 0; e = undefined; }   // (a resize or a fluid size makes a new key each time: cut at 1500)
    if (!e) widths.set(z, e = []);
    e.push(weight, size, track, w); widthN++;
    return w;
  }
  // (Cleared at each font that finishes, not only at the first `ready`: Inter's Greek and Latin-extended parts load when a character in
  // them first appears, and a label measured before that was measured in the fallback face.)
  const fontsIn = () => { widths.clear(); widthN = 0; labelFonts++; if (F) updateLabels(F); };
  document.fonts?.ready?.then(fontsIn);
  document.fonts?.addEventListener?.('loadingdone', fontsIn);

  // Label text size: the reader's choice (Menu › Text size), and a larger baseline in the circuit,
  // whose labels are the map's only text. Every run's size and spacing is scaled by labelK.
  const CIRCUIT_LABEL_K = 1.22;
  const LABEL_MIN = TEXT_MIN, LABEL_MAX = TEXT_MAX;   // (a size saved below 100 % reads as 100 %)
  // Where a map direction lands on the screen once the circuit is turned a quarter turn counter-clockwise.
  const TURN_DIR = { N: 'W', W: 'S', S: 'E', E: 'N', NE: 'NW', NW: 'SW', SW: 'SE', SE: 'NE', C: 'C' };
  // A desktop (a wide screen and a mouse) is read from farther away: its 100 % is half as large again as a phone's or tablet's.
  const deskMQ = matchMedia('(min-width: 1024px) and (pointer: fine)');
  // One label size on every screen and window width at 100 % (the laptop's): only the label setting changes it.
  const deskK = () => 1.5;
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
  // (Projecting, the projector's size times the viewer's own text size from Settings.)
  const labelBase = () => (projecting ? (typeof projecting === 'number' ? projecting : 2) * labelScale : labelScale * deskK());
  // (A window dragged between a desktop's width and a narrow one: the labels follow; a presentation sets its own.)
  deskMQ.addEventListener?.('change', () => { if (projecting) return; document.documentElement.style.setProperty('--label-k', String(labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(labelScale)); document.documentElement.style.setProperty('--ts', String(labelScale)); dispatchEvent(new Event('pps:labelscale')); });
  // A line is a list of runs { t, size, weight, cls, track }. Returns [width, height].
  // A run's size on screen: its role (reading, name, caption) at this screen's size, times the text size setting;
  // a presentation raises it to the projector's size (never below Explore's).
  const fontPx = (size) => rolePx(roleOf(size)) * labelScale * (projecting ? Math.max(1, Math.min(typeof projecting === 'number' ? projecting : 2, 2.2) / 1.5) : 1);
  const LINE_H = (line) => { let m = -Infinity; for (let i = 0; i < line.length; i++) m = Math.max(m, fontPx(line[i].size)); return m * 1.24; };
  const lineW = (line) => { let w = 0; for (let i = 0; i < line.length; i++) { const r = line[i]; w = w + textW(r.t, fontPx(r.size), r.weight, r.track || 0) + (i ? (r.gap ?? 3) * labelK : 0); } return w; };

  const pool = new Map(); // key → { g, sig, … }
  // Tap a label to explain it (N4, label-explain.js): the tapped station's label grows a line of its own (name and live value, drawn by the GPU with
  // it, so it rides with it), the rest of the labels and their leaders step back to 35 % (.spot-dim, app.css). explainApply sets the classes.
  const explain = createExplain(() => explainChanged());
  // A label that is hidden (off the screen, behind a card, colliding, fading out) is neither a keyboard stop nor read aloud: it keeps only its look
  // until it is wanted again. (One with focus on it keeps its place until focus moves.)
  function labelStop(b, hid) {
    if (b.hid === hid || (hid && document.activeElement === b.g)) return;
    b.hid = hid;
    if (hid) b.g.setAttribute('aria-hidden', 'true'); else b.g.removeAttribute('aria-hidden');
    if (b.g.hasAttribute('tabindex')) b.g.setAttribute('tabindex', hid || !keyStops ? '-1' : '0');
  }
  function blockEl(key, cls, interactiveNode, onClick) {
    let b = pool.get(key);
    if (b) return b;
    const g = s('g', { class: 'lb ' + cls, 'data-key': key });
    const act = onClick || (interactiveNode ? () => onSelect({ type: 'node', id: interactiveNode }) : null);
    if (act) {
      g.setAttribute('tabindex', keyStops ? '0' : '-1'); g.setAttribute('role', 'button');
      g.addEventListener('click', act);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    }
    // A reading that names a vessel lights it while the pointer is over it, or keyboard focus is on it (hover link, below).
    if (HOVER_LINK && labelTarget(key)) {
      g.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') linkHover(key); });
      g.addEventListener('pointerleave', () => linkHover(null, key));
      g.addEventListener('focus', () => { try { if (g.matches(':focus-visible')) linkFocus(key); } catch (e) { caught('stage:9715', e); /* an engine without :focus-visible: no link from focus */ } });
      g.addEventListener('blur', () => linkFocus(null, key));
    }
    late('label', g);
    b = { g, sig: '', seen: 0 };
    pool.set(key, b);
    if (explain.key) g.classList.add(explain.state(key) === 'on' ? 'spot-on' : 'spot-dim');   // (a label that comes in while one is explained steps back too)
    return b;
  }
  let frameNo = 0;
  // A label the layout moves (a slide's or a patient's change found it a new spot) glides there instead of jumping (17 Oct: "labels and
  // callouts all snap"). It keeps its offset from the point it names, so it still follows the camera exactly and only a change of that
  // offset eases; labels with no point (the organs' names, the lanes) glide only while the camera is still. A label just shown, or one
  // laid out while the figure is hidden (the presenter's camera move, the catheter, the lobule), takes its spot at once.
  let glideCam = '', glideRaf = 0;
  const GLIDE_P = [0, 0], glideRaw = [NaN, NaN, NaN, NaN];   // (glideAt's answer, one kept pair read at once; the camera as last turned to text)
  const glideAt = (g, now) => { const u = easeInOut(clamp((now - g.t0) / LABEL_GLIDE_MS, 0, 1)); GLIDE_P[0] = g.fx + (g.tx - g.fx) * u; GLIDE_P[1] = g.fy + (g.ty - g.fy) * u; return GLIDE_P; };
  function labelGlideTick() { glideRaf = 0; if (F && !camMove) updateLabels(F, true); }
  function labelGlide(out) {
    const now = performance.now();
    // (The camera to two decimals, as text; made again only when one of its numbers is not the one last seen, else it is the same text.)
    let still = CTM.a === glideRaw[0] && CTM.b === glideRaw[1] && CTM.e === glideRaw[2] && CTM.f === glideRaw[3];
    if (!still) {
      glideRaw[0] = CTM.a; glideRaw[1] = CTM.b; glideRaw[2] = CTM.e; glideRaw[3] = CTM.f;
      const cam = CTM.a.toFixed(2) + ',' + CTM.b.toFixed(2) + ',' + CTM.e.toFixed(2) + ',' + CTM.f.toFixed(2);
      still = cam === glideCam;
      glideCam = cam;
    }
    // The GPU label layer already glides from the ridden position at a pinch landing. A second layout glide would move its target
    // on every frame and make the label drift again after the hand stops.
    // (Drawn by the GPU, no label eases here: its offset from its point is the layout's at once, and label-gl.js alone moves one that changes
    // slot, once (V-LBL-1). Eased here as well, the GPU's labels were carried to their places over 450 ms: "the labels match slowly
    // towards their positions", Mohammad, 3 Nov.)
    const snap = (!!labelGL && !labelGL.lost) || reduceMotion.matches || camMove || !!handRide?.settle || wrap.classList.contains('cam-move') || wrap.classList.contains('pinch-hide') || wrap.classList.contains('cath-on') || !!lz?.isOpen();
    let moving = false;
    for (const it of out) {
      const b = pool.get(it.key);   // (a label with no block yet is new: it fades in where it stands)
      if (!b) continue;
      if (it.hide || it.live || it.fixedLead || it.key === 'scan') { b.gl = null; b.at = null; continue; }
      const rel = Number.isFinite(it.ax) && Number.isFinite(it.ay) && it.cls !== 'organ' && it.cls !== 'lane';
      // (The edge's pull (it.px, it.py) is the screen's, not the slot's: a label held against the edge keeps still while the figure pans past it. Easing
      // its offset from the station would carry it with the figure and ease it back, one camera step behind, every frame: 3 Nov 2026.)
      const px = it.px || 0, py = it.py || 0, ox = rel ? it.ax : 0, oy = rel ? it.ay : 0, tx = it.x - px - ox, ty = it.y - py - oy;
      if (!b.at || snap || b.rot !== !!it.rot || b.rel !== rel || (!rel && !still)) b.gl = null;
      else {
        let g = b.gl;
        const px = g ? g.tx : b.at[0], py = g ? g.ty : b.at[1];
        if (Math.hypot(tx - px, ty - py) > 0.5) {
          const sp = g ? glideAt(g, now) : b.at, o = b.glo || (b.glo = { fx: 0, fy: 0, tx: 0, ty: 0, t0: 0 });   // (b.glo: this label's glide record, kept and rewritten)
          o.fx = sp[0]; o.fy = sp[1]; o.tx = tx; o.ty = ty; o.t0 = now; g = b.gl = o;
        }
        if (g && now - g.t0 >= LABEL_GLIDE_MS) b.gl = g = null;
        if (g) { g.tx = tx; g.ty = ty; const [sx, sy] = glideAt(g, now); it.x = ox + sx + px; it.y = oy + sy + py; moving = true; }
      }
      if (b.at) { b.at[0] = tx; b.at[1] = ty; } else b.at = [tx, ty];
      b.rel = rel; b.rot = !!it.rot;
    }
    // (Laid out again each frame until every glide lands; nothing else runs the layout while the figure is still.)
    if (moving && !glideRaf) glideRaf = nextFrame(labelGlideTick);
  }
  // The leader lines and their dots, kept by the label they belong to: a new one fades in, one no longer wanted fades out, and the
  // rest are moved in place (rebuilt wholesale, they popped in and out with every change).
  const leadEls = new Map();
  // (A new leader takes a blank line or dot made ahead, between frames, never one made in the frame (2 Nov 2026, "Move everything to
  // GPU"): when none is left it comes in the next frame, after the spares are made again.)
  const leadSpare = new Map(), LEAD_SPARE = 12;
  let leadFill = 0, leadShort = false;
  // (A leader that found no blank asks for the labels to be laid out again once the blanks are made: with the figure still, nothing
  // else would, and the circuit's leaders never came in.)
  function leadTop() {
    leadFill = 0;
    for (const tag of ['path', 'circle']) { const l = leadSpare.get(tag) || []; while (l.length < LEAD_SPARE) l.push(s(tag, {})); leadSpare.set(tag, l); }
    if (leadShort) { leadShort = false; nextFrame(() => { if (F) updateLabels(F, true); }); }
  }
  const leadTake = (tag) => { const el = leadSpare.get(tag)?.pop() || null; if (!leadFill && (leadSpare.get(tag)?.length ?? 0) < LEAD_SPARE / 2) leadFill = restPass(leadTop); return el; };
  // (The keys wanted and the leaders wanted, kept and emptied for each call; late('lead') reads the list only when the rest pass runs, and
  // a later call's list is then the one that stands. A leader's removal after its fade is a function taking its key and its line, asked
  // of setTimeout with them, so none is made per call.)
  const leadKeep = new Set(), leadWantEls = [];
  const leadGoneFire = (k, el) => { if (leadEls.get(k) === el && el._gone) { el.remove(); leadEls.delete(k); } };
  function paintLeaders(want) {
    const keep = leadKeep, els = leadWantEls;
    keep.clear(); els.length = 0;
    for (let i = 0; i < want.length; i++) keep.add(want[i].k);
    for (const w of want) {
      let el = leadEls.get(w.k);
      if (el && el.tagName !== w.tag) { el.remove(); leadEls.delete(w.k); el = null; }
      if (!el) { el = leadTake(w.tag); if (!el) { leadShort = true; if (!leadFill) leadFill = restPass(leadTop); continue; } leadEls.set(w.k, el); }
      if (el._gone) { clearTimeout(el._gone); el._gone = 0; el.classList.remove('ld-gone'); }
      for (const a in w.at) setA(el, a, w.at[a]);
      if (explain.key) { const on = w.at['data-k'] === explain.key; el.classList.toggle('spot-dim', !on); el.classList.toggle('spot-on', on); }   // (a leader made or moved while a label is explained: label-explain.js)
      els.push(el);
    }
    // (A new one goes in just before the next one wanted that is already in, so every line still lies under every dot.)
    late('lead', els);
    dprDots();
    for (const [k, el] of leadEls) {
      if (keep.has(k) || el._gone) continue;
      if (reduceMotion.matches) { el.remove(); leadEls.delete(k); continue; }
      el.classList.add('ld-gone');
      el._gone = setTimeout(leadGoneFire, 360, k, el);
    }
  }
  const termsLit = () => { const st = store.get(); const t = st.presenting && st.presentTerms; if (!t) return false; for (const k in t) return true; return false; };   // (a slide that lights some term)
  const termTone =(id) => { const st = store.get(); return (st.presenting && st.presentTerms?.[id]) || null; };
  // A label new to the figure, or one whose pieces change (another line, another run), is built between frames (a rest pass), never in
  // the frame that asks for it: a frame makes no element (2 Nov 2026, "Move everything to GPU"). Until then it stands as it was (a new
  // one is not there yet); the build lays it out at once, with the newest words asked for it.
  const blockWant = new Map();
  let blockAsk = 0;
  // (The frame number of the layout that last wanted the labels it asked for: what a label built or rewritten between layouts counts as
  // seen in. frameNo itself moves on when a layout starts, and a sliced solve runs across several frames before it lands: a label built
  // meanwhile for the last layout's wishes was stamped with the unfinished layout's number, so that layout's sweep for labels it did not
  // want skipped it and it stayed on screen, whole, until the next layout.)
  let laidFrame = 0;
  function blockBuild() {
    blockAsk = 0;
    const its = [...blockWant.values()];
    blockWant.clear();
    for (const it of its) {
      const b = blockEl(it.key, it.cls, it.node, it.onClick), sig = blockSig(it);
      if (sig !== b.sig) blockKids(b, it, sig);
      renderBlock(it);
    }
    // (This pass is between frames already, and it moved each label to its place: its new pieces, fills and the label itself land in the
    // same task, not a later one, in which a frame could draw its old words or pill against the new place.)
    lateQueue.now();
  }
  const blockSig = (it) => JSON.stringify([it.lines.map((line) => line.map(({ t, fill, cls, ...style }) => style)), it.align, !!it.swatch, it.bg, !!it.hit, it.cls, labelK, fontPx(14), it.fxw ?? (/^focus/.test(it.key) ? it.lines.map((line) => line.map((r) => r.t).join('')) : 0)]);
  function renderBlock(it) {
    const b = pool.get(it.key), sig = blockSig(it);
    if (!b || sig !== b.sig) {
      blockWant.set(it.key, it);
      if (!blockAsk) blockAsk = restPass(blockBuild);
      if (b) b.seen = laidFrame;   // (kept as it stands until its new pieces are in)
      return;
    }
    b.seen = laidFrame;
    b.g.classList.toggle('ring', / ring\b/.test(it.cls));   // (a slide's pill that could find no spot off the vessels: see the focus callout)
    // A presenter slide's term (presentTerms): the station's label takes the term's colour, eased (.lb.term).
    const tone = it.node ? termTone(it.node) : it.res ? resLit.get(it.res) || null : null;   // (a resistor's reading takes its station tone when the slide's words point at it)
    if (tone !== (b.tone || null)) { b.tone = tone; b.g.classList.toggle('term', !!tone); if (tone) b.g.style.setProperty('--term', toneCol(tone)); }   // (a tone may name its own token, '--tour-sys' for the right atrium: as var(--tr---tour-sys) it was unset and the label fell back to black, dark on dark in the dark theme)
    // A slide that lights terms (presentTerms) dims every station it does not light to 35 %, its leader too, and it keeps its place (V-LIT-3, Mohammad's pick 14.3 B): .unlit, app.css.
    // (A slide's step numbers (fx-step, V10) point at what the card's words number: they keep full strength, as the card's own do.)
    const unlit = !tone && termsLit() && !/\b(focus|fx-step)\b/.test(it.cls);
    if (unlit !== !!b.unlit) { b.unlit = unlit; if (unlit) unlitKeys.add(it.key); else unlitKeys.delete(it.key); b.g.classList.toggle('unlit', unlit); for (const el of gLeaders.querySelectorAll(`[data-k="${it.key}"]`)) el.classList.toggle('unlit', unlit); }
    if (!!it.onVessel !== !!b.onVessel) { b.onVessel = !!it.onVessel; b.g.classList.toggle('on-vessel', b.onVessel); }
    let i = 0;
    for (const line of it.lines) for (const r of line) {
      const sp = b.spans[i++];
      putText(sp, r.t);
      if (sp.getAttribute('class') !== (r.cls || '')) sp.setAttribute('class', r.cls || '');
      if ((sp._fill || '') !== (r.fill || '')) { sp._fill = r.fill || ''; late('fill', sp, sp._fill); }
    }
    blockRest(b, it);
  }
  // Text and pressure colors change far more often than label structure.
  // Retain the text nodes (and keyboard focus) across numeric updates. (A run's class is its colour, as its fill is: a change
  // badge turning from + to − swaps its class on the same tspan rather than building the label again: 16 Oct.)
  // (A slide's mark is drawn afresh when its words change: a pill kept from another slide's longer mark could hold its old width
  // for a while after the new one was set: Review 16 Oct.)
  // (Between frames only: blockBuild.)
  function blockKids(b, it, sig) {
    {
      b.sig = sig;
      const kids = [];
      b.spans = [];
      b.textLines = [];
      // (A label's pill has 6 px corners, the cards' tile family; only a numbered marker, a round chip, takes its full height: it.chip.)
      let swEl = null, bgEl = null;
      if (it.bg) kids.push(bgEl = s('rect', { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: it.chip ? (it.h + 2 * it.padY) / 2 : 6 }));
      // A clickable caption is a larger target than its small letters.
      if (it.hit) kids.push(s('rect', { class: 'lb-hit', x: -10, y: -8, width: it.w + 20, height: it.h + 16, rx: 8 }));
      let y = 0;
      const tx = it.swatch ? (it.align === 'end' ? it.w - 7 : 7) : 0;
      for (const line of it.lines) {
        const lh = LINE_H(line);
        const t = s('text', { x: it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : tx, y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' });
        b.textLines.push(t);
        line.forEach((r, i) => {
          const sp = s('tspan', { class: r.cls || '', 'font-size': +fontPx(r.size).toFixed(2), 'font-weight': r.weight || 500 });
          if (i) sp.setAttribute('dx', +((r.gap ?? 3) * labelK).toFixed(2));
          if (r.track) sp.setAttribute('letter-spacing', `${r.track}em`);
          b.spans.push(sp);
          t.append(sp);
        });
        kids.push(t);
        y += lh;
      }
      if (it.swatch) kids.unshift(swEl = s('rect', { class: 'lb-sw', x: it.align === 'end' ? it.w - 3 : 0, y: 1, width: 3, height: Math.max(8, it.h - 2), rx: 1.5 }));
      late('kids', b.g, kids);
      // (A slide's mark that stays but takes new words fades the new words in, never swaps them in at once.)
      // (A live callout's words keep their shape as its numbers tick: it.fxw, so only a new slide's words fade in.)
      const words = it.fxw ?? (/^focus/.test(it.key) ? it.lines.map((line) => line.map((r) => r.t).join('')).join('\n') : null);
      if (words != null && b.words != null && words !== b.words && b.g.style.display !== 'none' && !reduceMotion.matches) { b.g.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SURFACE, easing: EASE_ARRIVE }); labelGL?.hold(b.g, D_SURFACE); }
      b.words = words;
      b.sw = swEl;
      b.bg = bgEl;
    }
  }
  // (What the liver's glass and each label's place were last written from: the numbers, so the text for the page is made only when one moved.)
  let glassX = NaN, glassY = NaN, glassW = NaN, glassH = NaN;
  function blockRest(b, it) {
    for (const text of b.textLines) setA(text, 'x', it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : it.swatch ? 7 : 0);
    if (b.bg) { setA(b.bg, 'width', it.w + 2 * it.padX); setA(b.bg, 'height', it.h + 2 * it.padY); }
    if (it.label) setA(b.g, 'aria-label', it.label);
    if (b.sw) { setA(b.sw, 'fill', it.swatch); setA(b.sw, 'x', it.align === 'end' ? it.w - 3 : 0); }
    b.g.classList.toggle('sel', !!it.sel);
    b.g.classList.toggle('lb-off', !!it.hide);
    labelStop(b, !!it.hide);
    if (it.key === 'liver') {
      const gx = it.x - it.padX, gy = it.y - it.padY;
      if (gx !== glassX || gy !== glassY) { glassX = gx; glassY = gy; glass.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px)`; }
      // (its size is laid out in a rest pass between frames, never in the frame that placed it: sizeGlass)
      const gwN = it.w + 2 * it.padX, ghN = it.h + 2 * it.padY;
      if (gwN !== glassW || ghN !== glassH) {
        glassW = gwN; glassH = ghN;
        const gw = `${gwN.toFixed(1)}px`, gh = `${ghN.toFixed(1)}px`;
        if (gw !== glassWant[0] || gh !== glassWant[1]) { glassWant[0] = gw; glassWant[1] = gh; if (!glassSizing) glassSizing = restPass(sizeGlass); }
      }
    }
    // A turned caption reads bottom to top: its box's top-left is (x, y), and its text runs up from the bottom.
    if (it.x !== b.tx || it.y !== b.ty || it.w !== b.tw || !!it.rot !== b.tr) {
      b.tx = it.x; b.ty = it.y; b.tw = it.w; b.tr = !!it.rot;
      setA(b.g, 'transform', it.rot ? `translate(${it.x.toFixed(1)} ${(it.y + it.w).toFixed(1)}) rotate(-90)` : `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})`);
    }
    // (Where the GPU lays its picture: the same origin, label-gl.js.)
    // (A station's label is pinned to its point: pid names the station, pax/pay where its point stood in this layout, the same frame of
    // reference as x and y, so the GPU draws it at the point's place now plus its offset, label-gl.js pinTo. Unrounded: the offset is exact.)
    // (Which point it was laid out against, found by matching it: the middle of its vessel (1) or the station itself (2). One that is neither,
    // a point the layout chose by other rules, is not pinned and moves as before.)
    const pk = it.key.startsWith('n:') && !it.live && Number.isFinite(it.ax) && Number.isFinite(it.ay) ? pinKind(it.key.slice(2), it.ax, it.ay, it.au) : 0, pin = pk > 0;
    const px0 = +it.x.toFixed(1), py0 = +(it.rot ? it.y + it.w : it.y).toFixed(1);
    // (Every other figure label gets a world anchor (step 3 of the rigid-labels plan): its point as laid out, taken back to the world under this layout's camera, so the GPU keeps it on that point through any pan, pinch or zoom. Not the screen's furniture (zone titles, lanes, the scan, the stage) and not between views. An organ's name is a region name (leader rule L1): its point is where it is drawn, so it never stands off its own anchor.)
    if (it.cls === 'organ' && !it.rot) { it.ax = it.x + it.w / 2; it.ay = it.y + it.h / 2; }
    const gp = !pin && !it.live && !it.hide && Number.isFinite(it.ax) && Number.isFinite(it.ay) && (morph === 0 || morph === 1) && !NO_ANCHOR.test(it.key);
    if (gp) localToWorldInto(ANCHOR_W, it.ax, it.ay);
    const gw = gp && Number.isFinite(ANCHOR_W[0]) && Number.isFinite(ANCHOR_W[1]);
    b.pos = { g: b.g, x: px0, y: py0, rot: !!it.rot, pid: pin ? it.key.slice(2) : gw ? it.key : null, pax: pin || gw ? it.ax : 0, pay: pin || gw ? it.ay : 0, pmid: pk === 1, pau: it.au ?? 0.5, pwx: gw ? ANCHOR_W[0] : 0, pwy: gw ? ANCHOR_W[1] : 0, pwv: gw ? morph : null, view: morphTarget, mA: null };
    // (Its box on an 8 px grid, for the corner credit's look (labelBoxStamp): a number ticking inside it moves nothing the credit avoids.)
    const c0 = Math.floor((it.x - it.padX) / 8), c1 = Math.floor((it.y - it.padY) / 8), c2 = Math.ceil((it.x + (it.rot ? it.h : it.w) + it.padX) / 8), c3 = Math.ceil((it.y + (it.rot ? it.w : it.h) + it.padY) / 8), ch = !!it.hide;
    if (!b.box || c0 !== b.bc0 || c1 !== b.bc1 || c2 !== b.bc2 || c3 !== b.bc3 || ch !== b.bch) {
      b.bc0 = c0; b.bc1 = c1; b.bc2 = c2; b.bc3 = c3; b.bch = ch;
      b.box = `${c0},${c1},${c2},${c3}${ch ? 'h' : ''}`;
    }
    b.gone = null;
    b.g.style.display = '';
  }

  const rectOf = (it) => ({ x0: it.x - it.padX, y0: it.y - it.padY, x1: it.x + it.w + it.padX, y1: it.y + it.h + it.padY });
  // Candidate offset of a block around its anchor.
  // A ring's sixteen spots, level ones first (east, west), then ever further from level.
  // Spots for a mark's centre around its station, every 6 px out to 150, nearest first (see the focus callout).
  const MARK_GRID = [];
  for (let x = -150; x <= 150; x += 6) for (let y = -150; y <= 150; y += 6) if (Math.hypot(x, y) <= 150 && Math.hypot(x, y) >= 24) MARK_GRID.push([x, y]);
  MARK_GRID.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  // (Steps for a Circuit reading pulled onto a station's ring, every 4 px out to 120, nearest first: see layoutLabels.)
  const PULL_GRID = [];
  for (let x = -120; x <= 120; x += 4) for (let y = -120; y <= 120; y += 4) if ((x || y) && Math.hypot(x, y) <= 120) PULL_GRID.push([x, y]);
  PULL_GRID.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const REF = () => {
    const st = store.get();
    if (!st.compareSnap && st.presenting && st.colorMode === 'since') return sinceRef();
    return st.compareSnap ? st.compareSnap.P : st.healthy?.P;
  };
  // A "change since" slide's reference (deck visuals V11, ext-highlights.js: lens 'since'): the network its slide counts from
  // (changeRef), and until that is set the one the figure showed as the lens came in, so the colours move as the change lands.
  // It never touches Patients' pinned moment (compareSnap). A new reference recolours through the lens crossfade, as a jump does.
  const sinceRef = () => { if (!sinceP && F) sinceP = Float32Array.from(F.Pf || F.P); return sinceP || store.get().healthy?.P; };
  sinceSource(sinceRef);   // (the lobule's colours count from the same reference: since-ref.js)
  function changeRef(P) {
    const was = sinceP;
    sinceP = P ? Float32Array.from(P) : null;
    if (was === sinceP || store.get().colorMode !== 'since') return;
    if (shownCol.size && !reduceMotion.matches) { lensFrom = shownCol; lensT0 = lensNow(); }
    // (Cleared as a slide leaves, the next model frame takes the figure's state then as its reference: no redraw here.)
    if (P && F && !inUpdate) update(F);
  }
  // A slide's change ripple (deck visuals V6, ext-highlights.js: ripple): the vessels whose pressure moved between two of its
  // states glow warm (up) or cool (down) for a moment, as Patients' Δ glow does after a change, without its rings and numbers.
  // (Stronger, wider and held longer than Patients' Δ glow: on a slide the vessel under it often already wears the same blue or
  // red, from the Change colours, so only its halo shows it.)
  const RIPPLE_AMT = 2, RIPPLE_HOLD = 1600;
  let rippleT = 0;
  function ripple(from, to) {
    clearTimeout(rippleT);
    const list = from && to && !quietFx() ? rippleList(EDGES, NI, from, to, (e) => { const x = E[e.id]; return !!x?.vis && !x.isArt && !x.ghost; }) : [];
    const cs = getComputedStyle(svg), lift = clamp(cssNum(cs, '--ripple-lift', 0), 0, 1);
    const tone = (v) => { const c = mix3(toRGB(v, cs), [1, 1, 1], lift); return `rgb(${c.map((x) => Math.round(x * 255)).join(', ')})`; };   // colour-exempt: built from the glow tokens
    const up = tone('var(--glow-up)'), down = tone('var(--glow-down)');
    setGlowSrc('delta', list.map(([id, d]) => ({ id, col: d > 0 ? up : down, amt: RIPPLE_AMT, wide: 1.3, dur: 420 })));
    if (list.length) rippleT = setTimeout(setGlowSrc, RIPPLE_HOLD, 'delta', noGlows);
  }
  const isImaging = () => !!store.get().imaging;
  // Captions of findings (varices, collaterals) can stay hidden until a test shows them.
  const labelHidden = (id) => !!store.get().hiddenLabels?.has(id);
  // The active data layer (what vessel color encodes).
  function layerMode() {
    const st = store.get();
    return isImaging() ? 'neutral' : st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
  }
  // Mean velocity in a vessel, cm/s (flow mL/s over the lumen the probe sees: velNormal.js, shared with every readout).
  const edgeVel = meanVel;
  // Blood entering a node per minute (L/min), from every model vessel.
  function throughput(Q, id) {
    let sum = 0;
    for (let k = 0; k < EDGES.length; k++) {
      const e = EDGES[k];
      if (e.kind === 'wedge') continue;
      if (e.to === id && Q[k] > 0) sum += Q[k];
      else if (e.from === id && Q[k] < 0) sum -= Q[k];
    }
    return sum * 0.06;
  }

  // A change badge (+3) appears at `on` and goes only below `off`: a value hovering at the
  // threshold would otherwise add and drop the badge every beat, and its label would jump.
  const badges = new Map();
  const DELTA_MIN = 5;
  function badge(key, v, on, off) {
    const shown = v >= on || (badges.get(key) && v >= off);
    badges.set(key, shown);
    return shown;
  }
  function pressureRuns(P, id, compact) {
    if (!store.get().layers.chips || isImaging()) return null;
    const [v, u] = fp(P);
    const runs = [{ t: v, size: 14, weight: 650, cls: 'lb-val' }];
    if (unitHere(id, u)) runs.push({ t: u, size: 10, weight: 500, cls: 'lb-unit', gap: 2.5 });
    // A change from healthy is shown only once it matters clinically (5 mmHg, the upper limit
    // of a normal HVPG); while comparing, every change from the pinned moment is shown. Deltas
    // are neutral ink: red is kept for crossed thresholds.
    const ref = REF()?.[NI[id]], cmp = !!store.get().compareSnap;
    if (ref != null && deltaHere(id) && badge((cmp ? 'pc:' : 'p:') + id, Math.abs(P - ref), cmp ? 1 : DELTA_MIN, cmp ? 0.7 : DELTA_MIN - 1)) runs.push({ t: signed(P - ref, fmt(Math.abs(P - ref), 1)), size: 10.5, weight: 650, cls: 'lb-delta ' + (P > ref ? 'up' : 'down'), gap: 6 });
    return runs;
  }
  // A change reads "+7.9" or "−7.9", in the reading's own colour (17 Oct design review: an arrowed change beside every reading doubled the
  // numbers on the figure). On a slide only the stations its words point at carry it (presentTerms); every callout keeps its reading.
  const signed = (d, txt) => `${d > 0 ? '+' : '−'}${txt}`;
  // Where the change shows (looks review L2, 31 Oct: a label is a name and a value; the change only where it is asked for): on the
  // selected station, in the Change lens, while comparing with a pinned moment, and on a slide at the stations its words point at.
  const selStation = (id) => { const sl = store.get().selection; return sl?.type === 'node' && sl.id === id; };
  const deltaHere = (id) => { const st = store.get(); return st.presenting ? !!termTone(id) : selStation(id) || st.colorMode === 'delta' || !!st.compareSnap; };
  // The unit is said once, in the lens legend ("Pressure mmHg"); a label carries it only when it differs from the legend's (the
  // pressure unit setting) or when the label is selected. (Not a teaching-number change: every number stays; the unit moves.)
  const unitHere = (id, u) => u !== 'mmHg' || selStation(id);

  // Flow layer: blood entering the station (L/min) and its change; velocity layer: the fastest
  // velocity in a vessel at the station as the Doppler reads it (peak, cm/s); oxygen layer: the blood's
  // oxygen saturation at the station (%), the value the lens colours by. Other layers read pressure.
  function layerRuns(f, id, compact) {
    const lm = layerMode();
    if (lm !== 'flow' && lm !== 'velocity' && lm !== 'oxygen') return null;
    if (!store.get().layers.chips) return null;
    const big = { size: 14, weight: 650, cls: 'lb-val' }, unit = { size: 10, weight: 500, cls: 'lb-unit', gap: 2.5 };
    // (These lenses' legends name their unit too (L/min, cm/s, % O₂), so the label says it only when selected.)
    const withUnit = (t) => (selStation(id) ? [{ ...unit, t }] : []);
    if (lm === 'oxygen') {
      const sat = oxygenFor(EDGES, NODES, f).node[NI[id]];
      return { runs: [{ ...big, t: fmt(sat * 100, 0) }, ...withUnit('% O₂')], color: oxygenColor(sat) };
    }
    if (lm === 'flow') {
      const v = throughput(f.Qf || f.Q, id);
      const runs = [{ ...big, t: fmtFlow(v) }, ...withUnit('L/min')];
      const refQ = store.get().healthy?.Q;
      if (refQ && !store.get().compareSnap) {
        const r = throughput(refQ, id);
        if (r > 0.02 && deltaHere(id) && badge('q:' + id, Math.abs(v - r) / r, 0.3, 0.25)) runs.push({ t: signed(v - r, `${Math.round(Math.abs(v - r) / r * 100)}%`), size: 10.5, weight: 650, cls: 'lb-delta ' + (v > r ? 'up' : 'down'), gap: 6 });
      }
      return { runs, color: flowColor(v) };
    }
    let best = 0, bestK = -1, tubes = 0, bed = false;
    for (const x of EV) {
      if (!x.vis || x.isArt || (x.e.from !== id && x.e.to !== id)) continue;
      if (x.e.kind === 'liver') { bed = true; continue; }
      if (x.ghost || x.e.id === 'TIPS' || x.e.id === 'DIPS') continue;   // the TIPS and DIPS shunts have their own velocity label
      tubes++;
      const v = Math.abs(edgeVel(f, EI[x.e.id])) * dopplerK(x.e);
      if (bestK < 0 || v > best) { best = v; bestK = EI[x.e.id]; }
    }
    // (A station named for a vessel reads that vessel, so "Portal v." is the portal vein the Doppler samples, not a faster
    // collateral or tributary joining it.)
    const own = STATION_VESSEL[id], ox = own && EV.find((x) => x.e.id === own && x.vis);
    if (ox) { bestK = EI[own]; best = Math.abs(edgeVel(f, bestK)) * dopplerK(EDGES[bestK]); }
    if (bestK >= 0) best = shownVelOf(EDGES[bestK].id, f, best);
    // A microvascular bed has no single velocity; a station whose only vessels are closed
    // collaterals carries no flow at all (not stasis in an open vessel).
    if (!tubes) return { runs: [{ ...unit, t: bed ? 'microcirculation' : 'collaterals closed', gap: 0 }], color: 'var(--lens-neutral)' };
    const runs = [{ ...big, t: fmt(best, 0) }, { ...unit, t: 'cm/s' }];
    // (Named as the Doppler names it: velNormal.js judgeFlow, under 1 cm/s no flow, under 9 stasis.)
    const jf = judgeFlow(best, null, null);
    if (jf.none || jf.stasis) runs.push({ t: jf.none ? 'no flow' : 'stasis', size: 10.5, weight: 650, cls: 'lb-alert', gap: 6 });
    return { runs, color: velColorOf(f, bestK, store.get().healthy) };
  }

  // A vessel's name read as its abbreviation ("Right portal vein" → "RPV"): false where it has none or already reads it.
  function abbrevName(it) {
    const a = !it.abbr && it.node && ABBR[it.node], r = a && it.lines[0][0], full = SHORT[it.node];
    if (!r || !r.t.startsWith(full)) return false;
    it.lines = [[{ ...r, t: a + r.t.slice(full.length) }, ...it.lines[0].slice(1)], ...it.lines.slice(1)];
    it.w = Math.max(...it.lines.map(lineW)); it.abbr = true;
    return true;
  }
  // Where a label has no room with its value, a vessel first takes its abbreviation (abbr: "RPV 9.8 mmHg"), then drops the unit
  // and change badge (keeping "Azygos 6.7"), then keeps the name alone (see placeMulti and the overlap pass). it.short: 1 trimmed,
  // 2 the name alone. (abbr false: the trimming steps only, as the circuit's one unit rule takes them.)
  function shortenItem(it, abbr = true) {
    if (abbr && abbrevName(it)) return true;
    if (it.short === 2 || (it.lines.length < 2 && it.lines[0].length < 2)) return false;
    const val = !it.short && it.lines.length === 2 ? it.lines[1].filter((r) => r.cls === 'lb-val') : [];
    if (val.length && val.length < it.lines[1].length) {
      it.lines = [it.lines[0], val]; it.w = Math.max(...it.lines.map(lineW)); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0); it.short = 1;
      return true;
    }
    it.lines = [[it.lines[0][0]]]; it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); it.short = 2;
    return true;
  }
  const shortenTo = (it, lvl, abbr = false) => { if (abbr) abbrevName(it); while ((it.short || 0) < lvl && shortenItem(it, false)); };
  // A Circuit reading set on one line, its name then its value (a rescued reading where two lines have no room: layoutLabels).
  function oneLine(it) {
    if (it.lines.length !== 2) return;
    it.lines = [[...it.lines[0], ...it.lines[1].map((r, i) => (i ? r : { ...r, gap: 4 }))]]; it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); it.one = true;
  }
  function nodeItem(id, f, mode, compact) {
    const st = store.get();
    const meta = ATLAS_LABELS[id];
    let P = (f.Pf || f.P)[NI[id]];
    // On a slide, a station the tiles and words also read shows their reading: the measured one (the wedge, not the
    // sinusoid node), and once it has settled, the slide's settled value itself, so the callouts, tiles and words agree.
    // (The right atrium is read over two breaths, as the tiles and the bar read it: its a and v waves swing the beat-by-beat
    // value 0.8 mmHg, which put "RA 3.6" beside a card and words saying 2.9 on the IVC web slide.)
    const pin = pinned(), mk = pin && LADDER_KEY[id], live = mk && (mk === 'ra' ? f.metrics?.vitals?.ra ?? f.metrics?.ra : f.metrics?.[mk]), fp = mk && pin[mk];
    if (Number.isFinite(live)) P = Number.isFinite(fp) && Math.abs(live - fp) < breath(fp) ? fp : live;
    else if (pin && Number.isFinite(P)) {   // (a station the tiles do not read: the slide's own number while the model agrees, else its mean over several breaths)
      const at = pin.at?.P[NI[id]];
      P = Number.isFinite(at) && Math.abs(P - at) < breath(at) ? at : beatMean('n:' + id, P, 6);
    }
    let name = mode === 'atlas' ? (meta?.name || NODES[NI[id]].label) : (SHORT[id] || id);
    // On a presenter's ladder and catheter slides, the stations the ladder names carry its name too (one vocabulary).
    if (st.presenting && st.presentNames && LADDER_TAG[id]) name += ` · ${LADDER_TAG[id]}`;
    // On a small screen an inline label is one quiet line (name, value) on a text halo, not a
    // two-line card: it covers as little of the anatomy as it can.
    const one = mode === 'inline';   // one line, no box, on every screen (as on a phone)
    const lines = [[{ t: name, size: 11.5, weight: one ? 600 : 500, cls: 'lb-name' }]];
    const sel = st.selection?.type === 'node' && st.selection.id === id;
    // (The hepatic artery's label is its name only: its pressure sits off the venous scale and says little; its flow is in the selection card.)
    const lr = isImaging() || id === 'HA' ? null : layerRuns(f, id, compact);
    const pr = id === 'HA' ? null : lr ? lr.runs : pressureRuns(P, id, compact);
    // A station whose own vessel's flow has reversed carries ⟲ after its value, in the reversed-flow orange (blueprint §6.2).
    const rev = !!pr && revShown.has(STATION_VESSEL[id]);
    if (rev) pr.push({ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 });
    if (pr && one) lines[0].push(...pr.map((r, i) => (i ? r : { ...r, gap: 4 })));
    else if (pr) lines.push(pr);
    // The explained label (tap, label-explain.js) carries its structure's name and live readings as one more line of its own picture.
    const exp = explain.key === 'n:' + id && mode !== 'atlas';
    if (exp) lines.push([{ t: explainText({ name: (meta?.name || NODES[NI[id]].label) !== name ? meta?.name || NODES[NI[id]].label : '', what: 'mean', value: Number.isFinite(P) ? P : NaN, flow: throughput(f.Qf || f.Q, id) }), size: 12, weight: 600, cls: 'lb-explain' }]);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    return { key: 'n:' + id, src: ['node', id, mode, compact], node: id, cls: 'node ' + mode + (one ? ' bare' : ''), lines, w, h: hh, sel, canShort: (!!pr || id === 'HA') && mode !== 'atlas' && !exp,   // (the hepatic artery has no number to drop, but takes its abbreviation, "HA", where it is crowded)
 label: `${NODES[NI[id]].label}${lr ? `: ${lr.runs.filter((r) => r.cls !== 'lb-rev').map((r) => r.t).join(' ')}` : pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}${rev ? ', flow reversed' : ''}`,
      swatch: mode === 'atlas' && pr ? (lr ? lr.color : layerMode() === 'heat' ? heatColor(P - (REF()?.[NI[id]] ?? P)) : pressureColor(P)) : null, bg: mode === 'inline' && !one, padX: mode === 'inline' && !one ? 6 : 3, padY: mode === 'inline' && !one ? 3 : 2 };
  }

  // A number that pulses with each beat, read as its mean over the last few seconds (as a tile or the Doppler shows it).
  const emas = new Map();
  function beatMean(key, x, tau) {
    if (!Number.isFinite(x)) return x;
    const now = performance.now(), e = emas.get(key);
    if (!e || now - e.t > 3000) { emas.set(key, { v: x, t: now, n: 1 }); return x; }
    e.n++; e.v += (x - e.v) * Math.max(1 / e.n, 1 - Math.exp(-(now - e.t) / 1000 / tau)); e.t = now;   // (a plain average until tau has passed: the first beats do not set it)
    return e.v;
  }
  // A vessel's velocity as a callout shows it (cm/s, Doppler peak; now: the live reading): the Doppler's own number while
  // it samples that vessel, else on a slide the slide's own velocity while the model agrees, else a mean over a few beats.
  // So a station's callout and the monitor beside it read one number.
  function shownVelOf(id, f, now) {
    const dop = shownVel.get(id);
    if (dop && !dop.seg && performance.now() - dop.t < 1000) return dop.v;
    const at = pinned()?.at, k = EI[id];
    const fixed = at && Math.abs(edgeVel(at, k)) * dopplerK(EDGES[k]);
    return Number.isFinite(fixed) && Math.abs(now - fixed) < Math.max(4, fixed * 0.12) ? fixed : beatMean('v:' + id, now, 6);
  }
  // A TIPS or DIPS shunt's callout: the velocity through it (cm/s), as Doppler reads it (its own mean while it is on that shunt).
  // point: one of the stent's three points ('proximal' | 'mid' | 'distal'), on a slide that calls out all three (dop.all); each
  // reads what the Doppler's tile for that point reads, and the sampled one is named in the Doppler's green.
  function velItem(sid, f, point = null) {
    const it = nodeItem('RPV', f, 'inline', stageBox().width < 700);
    const dop = shownVel.get(sid), at = pinned()?.at, now = Math.abs(edgeVel(f, EI[sid])) * dopplerK(EDGES[EI[sid]]);
    const fixed = at && Math.abs(edgeVel(at, EI[sid])) * dopplerK(EDGES[EI[sid]]);   // (the slide's own velocity, as its tiles read the slide)
    const live = Number.isFinite(fixed) && Math.abs(now - fixed) < Math.max(4, fixed * 0.12) ? fixed : beatMean('v:' + sid, now, 6);
    // (Between Doppler reports, the callout reads the third the Doppler samples itself, so it never falls back to the open stent's number.)
    const gated = dopGateOf(sid), p = f.viewParams || store.get().params, pt = point || gated, fresh = dop && performance.now() - dop.t < 1000;
    const factor = pt ? stentSegments(1, 1 - (1 - (p?.stenosis?.[sid] || 0)) * (1 - (p?.thrombus?.[sid] || 0)), stentSite(p, sid), STENT_FACTORS)[pt === 'proximal' ? 0 : pt === 'mid' ? 1 : 2] : 1;
    // (The sampled point reads the monitor's own number; the other two, the open stent's velocity the monitor's tiles read them from.)
    const vel = fresh && pt === gated ? dop.v : (fresh && Number.isFinite(dop.open) ? dop.open : live) * factor;
    // (Read by the Doppler at one third of the stent, the callout names it: "TIPS distal".)
    const seg = pt ? ` ${pt}` : '', sampled = !!point && point === gated;
    // (A phone's three points read short, "Prox 99 cm/s", so the column fits beside a small stent.)
    const name = point && stageBox().width < 700 ? { proximal: 'Prox', mid: 'Mid', distal: 'Dist' }[point] : sid + seg;
    // (An occluded stent reads "No flow", as the Doppler's strip does, not "0 cm/s": under 2 cm/s the Doppler calls a stent occluded.)
    const none = judgeFlow(vel, null, null, { stent: true }).none;
    // (A stent's point: its number in the velocity colours against the stent's own normal, sand slow, teal normal, violet fast
    // (c8e89a6), drawn toward the text colour (--vel-ink) so it reads on the label's halo, 4.5:1 at least on the light stage; the point sampled is named in bold: Review 15 Oct.)
    const nv = point ? velNormal(EI[sid], f) : null, tint = nv && !none ? `color-mix(in srgb, ${velocityColor(vel, nv)} var(--vel-ink), var(--text))` : '';
    it.lines = [[{ ...it.lines[0][0], t: name, ...(sampled ? { weight: 750, cls: 'lb-name lb-gate' } : {}) }, ...(none ? [{ t: 'No flow', size: 14, weight: 650, cls: 'lb-val', gap: 4 }]
      : [{ t: fmt(vel, 0), size: 14, weight: 650, cls: 'lb-val', gap: 4, ...(tint ? { fill: tint } : {}) }, { size: 10, weight: 500, cls: 'lb-unit', gap: 2.5, t: 'cm/s' }])]];
    it.key = point ? `n:${sid}:${point}` : `n:${sid}`; it.src = ['vel', sid, point]; it.node = undefined; it.sel = false; it.swatch = null;
    it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
    it.label = (none ? `${sid}${seg}: no flow` : `${sid}${seg}: ${fmt(vel, 0)} centimeters per second`) + (sampled ? ', sampled by the Doppler' : '');
    return it;
  }
  // The FibroScan probe's callout: the live stiffness, beside the waves, in their orange. A fixed width (the digits are tabular
  // and the box is as wide as "88.8 kPa"), so the number eases without the pill ever resizing or moving.
  function scanItem() {
    const k = scan.k ?? F?.metrics?.lsm ?? 0, txt = k >= 100 ? String(Math.round(k)) : k.toFixed(1);
    const val = { size: 14, weight: 700, cls: 'lb-scan-val' }, unit = { size: 10, weight: 600, cls: 'lb-scan-unit', gap: 3, t: 'kPa' };
    const lines = [[{ ...val, t: txt }, unit]];
    return { key: 'scan', src: ['scan'], cls: 'scan', lines, w: lineW([{ ...val, t: '88.8' }, unit]), h: LINE_H(lines[0]), align: 'middle', bg: true, padX: 8, padY: 3,
      label: `FibroScan stiffness ${txt} kPa`, pri: 20 };
  }
  const LADDER_TAG = { SIN_R: 'WHVP', RHV: 'FHVP' };
  const LADDER_KEY = { CONF: 'pv', SIN_R: 'whvp', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
  const ANAT_PRI = { HA: 3, CONF: 10, VAR: 9, SIN_R: 9, RHV: 8, RA: 8, SV: 7, SMV: 7, GV: 7, IVCS: 6, MHV: 5, LHV: 5, RPV: 5, LPV: 5, SIN_L: 5, IMV: 4, LGV: 4, W_R: 12, W_M: 12, W_L: 12 };
  // Stations labelled only when zoomed in enough to give them room, in this order (see updateLabels).
  const ANAT_EXTRA = ['MHV', 'LHV', 'RPV', 'LPV', 'SIN_L', 'IMV', 'LGV'];

  let blockerBoxes = null, blockersAt = -1e9, blockersStale = true;
  const staleBlockers = () => { blockersStale = true; };
  addEventListener('pps:occ', staleBlockers);
  addEventListener('resize', staleBlockers);
  const appStyle = document.getElementById('app')?.style;
  const pzInset = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  // The readings drawn over the figure (a slide's measuring sites and resistors, the HVPG catheter's callouts): the figure's
  // labels keep clear of them. Their boxes are worked out where they are placed (calloutBox), so this reads no layout.
  // (The list is kept and written in place: the one layout that runs reads it, a solve in slices across its frames included, and a layout
  // that begins ends any other first. The probe's boxes are copies, from a pool made once, as many as the probe's own lists hold.)
  const calloutBuf = [], PROBE_BOXES = [];
  for (let i = 0; i < 1600; i++) PROBE_BOXES.push({ x0: 0, y0: 0, x1: 0, y1: 0, probe: true });
  function calloutBoxes() {
    const out = calloutBuf;
    let n = 0;
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) out[n++] = el._box;
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) out[n++] = el._box;
    if (dpr.on && dpr.box) {   // (the Doppler probe's body and its line of sight)
      const marks = dpr.marks;
      for (let i = -1; i < marks.length; i++) {
        const b = i < 0 ? dpr.box : marks[i], c = PROBE_BOXES[i + 1];
        c.x0 = b.x0; c.y0 = b.y0; c.x1 = b.x1; c.y1 = b.y1;
        out[n++] = c;
      }
    }
    out.length = n;
    return out;
  }
  // What the labels' slots depend on: which readings show and how big they are (where they stand follows the camera, which
  // the labels' own key already holds). A new or resized reading lays the labels out afresh, so one under it moves aside.
  // (A number folded from the same things the text was: each reading's class and rounded size in order, then the probe's, so a callout that
  // comes, goes or is resized changes it. No text is made.)
  const sigFold = (h, v) => Math.imul(h ^ (v | 0), 16777619);
  const sigFoldEl = (h, el) => {
    h = sigFold(h, 124);
    const b = el._box;
    if (!b) return h;
    const c = el.className;
    if (typeof c === 'string') for (let i = 0; i < c.length; i++) h = sigFold(h, c.charCodeAt(i));
    return sigFold(sigFold(sigFold(h, 58), Math.round(b.x1 - b.x0)), Math.round(b.y1 - b.y0));
  };
  const calloutSig = () => {
    let h = 2166136261;
    for (const el of sites.made.values()) h = sigFoldEl(h, el);
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) h = sigFoldEl(h, el);
    if (dpr.on && dpr.box) h = sigFold(sigFold(sigFold(h, 100), Math.round((dpr.box.x1 - dpr.box.x0) / 8)), Math.round((dpr.box.y1 - dpr.box.y0) / 8));
    return h;
  };
  let blockersAsk = 0;
  // The boxes come from a fresh IntersectionObserver's first report: the browser hands every box over after its own layout of the
  // frame, so reading them forces no layout (a slide change read them ten times a second, ~385 forced layouts: 2 Nov 2026, "Move
  // everything to GPU").
  const BLOCK_IO = typeof IntersectionObserver === 'function';
  function blockersRead() {
    if (!BLOCK_IO) { blockersAsk = 0; blockersGot(readBlockersRead((el) => el.getBoundingClientRect(), stageBox())); return; }
    const els = [wrap, ...blockerEls()];
    const io = new IntersectionObserver((es) => {
      io.disconnect();
      const rects = new Map(es.map((e) => [e.target, e.boundingClientRect]));
      // (The reading of the boxes, with its style read of the credit, waits for a rest pass: not in the observer's delivery mid-frame.)
      restPass(() => { blockersAsk = 0; blockersGot(readBlockersRead((el) => rects.get(el) || el.getBoundingClientRect(), rects.get(wrap) || stageBox(), els)); });
    });
    for (const el of els) io.observe(el);
  }
  function blockersGot(boxes) {
    blockerBoxes = boxes; blockersAt = performance.now(); blockersStale = false;
    nextFrame(() => { if (F && !camMove && !lz?.isOpen()) updateLabels(F); });   // (a new list: the labels' key changes with it)
  }
  // (Everything whose box the labels keep clear of: the credit, the presenter's pill, the cards and the clock.)
  // (One list of what is chrome over the figure, read by both the observer's targets and the boxes made from them: they must never differ,
  // or a piece one of them forgets, like the view switcher that sits outside its holder's box, is drawn under by a label. 3 Nov 2026.)
  const BLOCKER_SEL = '.stage-blocker:not([hidden]), .pz-shade, #nbViews, .stage-clock';
  const blockerEls = () => [document.querySelector('.stage-credit'), store.get().presenting && document.querySelector('.pz-bar.pzb-pill'),
    ...document.querySelectorAll(BLOCKER_SEL)].filter(Boolean);
  let creditKept = null;
  function readBlockersRead(rectOf, wr, els = null) {
    { const el = document.querySelector('.stage-credit'), r = el && (!els || els.includes(el)) ? rectOf(el) : null;
      creditKept = r?.width && getComputedStyle(el).opacity !== '0' ? { x0: r.left - wr.left - 10, y0: r.top - wr.top - 10, x1: r.right - wr.left + 10, y1: r.bottom - wr.top + 10 } : null; }
    { const el = store.get().presenting && document.querySelector('.pz-bar.pzb-pill'), r = el && (!els || els.includes(el)) ? rectOf(el) : null;
      pillEdge = r?.width ? { m: Math.max(6, Math.round(wr.right - r.right)), top: r.top - wr.top } : null; }
    // (The teaching card's glass, .pz-shade, too: on a phone it reaches 16 px above the words, and a label kept off only the words
    // tucked its top under the glass, SMALL BOWEL on PVT 5 and STOMACH on Variceal bleed 3.)
    // (And the view switcher's holder over the play bar while it holds the switcher: reading labels sat under Circuit / Anatomy /
    // Lobule. By id, not the .stage-blocker class, which the credit and pan starts also read; round 2 review, G3-7.)
    // (And the phone's clock at the bottom left, "Day 30": a label there sat under it. It is display: none off the phone, so no box.)
    return [...document.querySelectorAll(BLOCKER_SEL)].map((el) => {
      if (el.id === 'nbViews' && !el.querySelector('#viewSeg')) return null;
      // A closed card can stay in place, invisible (the patient chart does): it hides nothing. (So does a glass with no words on it.)
      // (Nor does a card on its way out, a panel included: 2 Nov, the organs' names went off for half a second as a slide's panel left,
      // and came back once it had gone.)
      if (getComputedStyle(el).visibility === 'hidden' || (el.classList.contains('pz-shade') && (el.style.opacity === '0' || el.classList.contains('pz-leave'))) || el.classList.contains('pz-leave')) return null;
      if (els && !els.includes(el)) return null;   // (come in since the boxes were asked for: read with the next ask)
      const r = rectOf(el);
      return r.width ? { x0: r.left - wr.left - 4, y0: r.top - wr.top - 4, x1: r.right - wr.left + 4, y1: r.bottom - wr.top + 4 } : null;
    }).filter(Boolean);
  }
  // Where a station's callout attaches: the middle of the vessel it names when that vessel is drawn
  // (see LABEL_VESSEL), else the station itself. `tan` is the vessel's direction there, on screen.
  // (The anchor is one kept record, read at once by every caller; the direction a label keeps is a pair kept for its station, which the
  // layout in hand rewrites for the labels it makes.)
  const ANCHOR = { ax: 0, ay: 0, mid: false, tan: null, w: 0 }, ANCHOR_P = [0, 0], ANCHOR_Q = [0, 0], ANCHOR_TANS = new Map();
  function labelAnchor(id, t) {
    const eid = LABEL_VESSEL[id], x = eid && E[eid], a = ANCHOR;
    if (x && x.vis && !x.ghost && geo[eid]?.cur?.length > 1) {
      // The middle of the vessel along its course (the sinusoids too: the middle of their bed, not their venous half).
      const m = arcMid(geo[eid].cur), wx = m[0], wy = m[1], tx = m[2], ty = m[3];
      worldToLocalInto(ANCHOR_P, wx, wy); worldToLocalInto(ANCHOR_Q, wx + tx, wy + ty);
      const ax = ANCHOR_P[0], ay = ANCHOR_P[1], bx = ANCHOR_Q[0], by = ANCHOR_Q[1];
      const n = Math.hypot(bx - ax, by - ay) || 1;
      let tn = ANCHOR_TANS.get(id);
      if (!tn) ANCHOR_TANS.set(id, tn = [0, 0]);
      tn[0] = (bx - ax) / n; tn[1] = (by - ay) / n;
      a.ax = ax; a.ay = ay; a.mid = true; a.tan = tn; a.w = x.width || 4;
      return a;
    }
    const p = nodePos(id, t);
    worldToLocalInto(ANCHOR_P, p[0], p[1]);
    a.ax = ANCHOR_P[0]; a.ay = ANCHOR_P[1]; a.mid = false; a.tan = null; a.w = 0;
    return a;
  }
  // Whether the esophageal (VAR) or gastric (GV) varices exist yet (the app's "none" cut-off, 2.5 mm),
  // or the learner has selected that station.
  function hasVarices(id, f) {
    const sel = store.get().selection;
    if (id === 'GV' && f.metrics.gastricVarix.d <= 0) return false;   // no gastrorenal shunt: no fundal varices
    if (sel?.type === 'node' && sel.id === id) return true;
    return varicesPresent(f, id);
  }
  // Where a leader stops: it aims at the middle of the label, as if it ran behind the text, and is
  // cut off abruptly (no fade) at a small padding around the label's box.
  // (The point is one kept record, written anew by each call: every caller reads its x and y before it asks again.)
  const LEAD_XY = { x: 0, y: 0 };
  function leaderEnd(r, ax, ay, pad = 6) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const hw = (r.x1 - r.x0) / 2 + pad, hh = (r.y1 - r.y0) / 2 + pad;
    const dx = ax - cx, dy = ay - cy;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    if (t >= 1) { LEAD_XY.x = ax; LEAD_XY.y = ay; } else { LEAD_XY.x = cx + dx * t; LEAD_XY.y = cy + dy * t; }
    return LEAD_XY;
  }
  // The words a Circuit reading's leader reaches, when the reading's text stands at (x, y): the nearer of its lines' runs (a name, a
  // number, a unit), each as wide as its words, to the anchor (ax, ay). The drawn leader and the tidy's trial ones both end on it.
  function leadRectOf(it, x, y, ax, ay) {
    let yy = y, best = null;
    for (const line of it.lines) {
      const lh = LINE_H(line), lw = lineW(line), base = yy + lh * 0.78, lx = it.align === 'end' ? x + it.w - lw : it.align === 'middle' ? x + (it.w - lw) / 2 : x;
      let xx = lx;
      line.forEach((run, i) => {
        if (i) xx += (run.gap ?? 3) * labelK;
        const fp = fontPx(run.size), rw = textW(run.t, fp, run.weight, run.track || 0);
        const lb = { x0: xx, y0: base - 0.72 * fp, x1: xx + rw, y1: base + 0.04 * fp };
        xx += rw;
        const d = Math.hypot(Math.max(lb.y0 - ay, 0, ay - lb.y1), Math.max(lb.x0 - ax, 0, ax - lb.x1));
        if (!best || d < best.d) best = { d, lb };
      });
      yy += lh;
    }
    return best.lb;
  }
  // Where a drawn leader stops: on the edge of what is seen of its label (the pill, or the letters' own box), never short
  // of it and never in under the letters, at any zoom (leader-end.js). (leaderEnd above still decides whether one shows.)
  // A haloed label is seen as its letters: each run of text (a name, a number, a unit) from its tallest figures' tops
  // (0.72 of its font) down to the next line, the last line's to just below its baseline, as wide as the run, plus the halo.
  const LOW = /[acegmnopqrsuvwxyz]/, X_HEIGHT = 0.55;   // (Inter's x-height, 0.546 of its size; its round letters overshoot it a little)
  // (The boxes are a kept pool, written in place, and the list of them a kept list: seenEnd, their one caller, reads them at once.)
  const inkOut = [], inkPool = [];
  for (let i = 0; i < 256; i++) inkPool.push({ x0: 0, y0: 0, x1: 0, y1: 0 });
  const inkBox = (n, x0, y0, x1, y1) => {
    const b = inkPool[n] || (inkPool[n] = { x0: 0, y0: 0, x1: 0, y1: 0 });   // (more than a label has ever held: one more is made)
    b.x0 = x0; b.y0 = y0; b.x1 = x1; b.y1 = y1;
    return b;
  };
  const inkRects = (it) => {
    const out = inkOut, halo = 1, lines = it.lines;
    let y = it.y, n = 0, prevFrom = 0, prevTo = 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lh = LINE_H(line), lw = lineW(line) + (it.swatch ? 7 : 0), base = y + lh * 0.78;
      let x = (it.align === 'end' ? it.x + it.w - lw : it.align === 'middle' ? it.x + (it.w - lw) / 2 : it.x) + (it.swatch ? 7 : 0);
      // (Within a run, letters that stand only to the x-height (a, e, o, v, …) are a box of their own that high: a leader coming down
      // on "vein" from above stopped at the capitals' height, 3 px over the letters it met, as the zoom landed.)
      const rowFrom = n;
      for (let i = 0; i < line.length; i++) {
        const r = line[i];
        const f = fontPx(r.size), tr = r.track || 0, w = textW(r.t, f, r.weight, tr);
        if (i) x += (r.gap ?? 3) * labelK;
        let from = 0;
        if (!r.t.length) { out[n] = inkBox(n, x - halo, base - f * 0.72 - halo, x + w + halo, base + halo); n++; }
        for (let j = 1; j <= r.t.length; j++) {
          if (j < r.t.length && LOW.test(r.t[j]) === LOW.test(r.t[from])) continue;
          const a = from ? textW(r.t.slice(0, from), f, r.weight, tr) : 0, e = j === r.t.length ? w : textW(r.t.slice(0, j), f, r.weight, tr);
          out[n] = inkBox(n, x + a - halo, base - f * (LOW.test(r.t[from]) ? X_HEIGHT : 0.72) - halo, x + e + halo, base + halo); n++;
          from = j;
        }
        x += w;
      }
      let top = Infinity;
      for (let k = rowFrom; k < n; k++) top = Math.min(top, out[k].y0);
      for (let k = prevFrom; k < prevTo; k++) out[k].y1 = Math.max(out[k].y1, top);
      prevFrom = rowFrom; prevTo = n; y += lh;
      if (li === lines.length - 1) for (let k = rowFrom; k < n; k++) out[k].y1 = base + halo;
    }
    out.length = n;
    return out;
  };
  // (The box of a pill and the outer box of the letters, and the point a leader falls back to: kept, read by seenEnd's caller at once.)
  const SEEN_R = { x0: 0, y0: 0, x1: 0, y1: 0 }, SEEN_OUTER = { x0: 0, y0: 0, x1: 0, y1: 0 }, SEEN_XY = { x: 0, y: 0 };
  const seenEnd = (it) => {
    if (it.bg) {
      SEEN_R.x0 = it.x - it.padX; SEEN_R.y0 = it.y - it.padY; SEEN_R.x1 = it.x + it.w + it.padX; SEEN_R.y1 = it.y + it.h + it.padY;
      return edgeOf(SEEN_R, it.ax, it.ay) || (SEEN_XY.x = it.ax, SEEN_XY.y = it.ay, SEEN_XY);
    }
    const rs = inkRects(it), outer = SEEN_OUTER;
    outer.x0 = Infinity; outer.y0 = Infinity; outer.x1 = -Infinity; outer.y1 = -Infinity;
    for (let k = 0; k < rs.length; k++) { const r = rs[k]; outer.x0 = Math.min(outer.x0, r.x0); outer.y0 = Math.min(outer.y0, r.y0); outer.x1 = Math.max(outer.x1, r.x1); outer.y1 = Math.max(outer.y1, r.y1); }
    return edgeOfRects(rs, outer, it.ax, it.ay) || (SEEN_XY.x = it.ax, SEEN_XY.y = it.ay, SEEN_XY);
  };
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
  const SOLVED_A = { sig: null, sc: 0, th: 0, csig: 0, ins: 0 }, SOLVED_B = { sig: null, sc: 0, th: 0, csig: 0, ins: 0 };   // (what updateLabels writes it into, by turns)
  const JOB_NOW = { maxWait: 0 };
  const HAND_STILL_MS = 90;   // (a wheel step is over this long after its last tick: the settle no longer waits the 250 ms of gestureOn)
  const JOB = { g: null, key: null, solvedFor: null, t0: 0 }, jobKeyArr = [], labelKeyArr = [];   // (the solve in slices: one at a time, its key and the key of the layout that stands, kept)
  const keyInto = (to, from) => { to.length = from.length; for (let i = 0; i < from.length; i++) to[i] = from[i]; return to; };
  const labelVis = new Map(); // key → shown last frame (hysteresis against blockers)
  const zoneStick = new Map();   // zone title key -> [world x, y] of its centre at the last layout (sticky placement)
  let lapHid = new Set();     // keys the last layout's overlap pass hid (its hysteresis)
  let labelTurned = false;   // labels remember their side; turning the circuit changes which side is right
  // Levels of detail (Blood menu › Labels). Key: at the home framing only the portal vein, the HVPG pair
  // (wedged sinusoids and the free hepatic vein) and the stations the model flags; zoomed in, every
  // station in view. All: every station at every zoom. None: only a selected station.
  const KEY_NODES = ['CONF', 'SIN_R', 'RHV'];
  // (The zoom the labels' level of detail is read from is the camera at rest: the view a card zoom began at, or where a glide is headed, never the live
  // view part way, so a zoom or glide cannot flip a flag and solve the labels mid-move.)
  function labelRestK() { return zoomBase?.vt ? zoomBase.vt.k : vtGliding && vtTarget ? vtTarget.k : vt.k; }
  const zoomedIn = () => labelRestK() > (homeAt?.k || 1) * 1.3;
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
  let carryClear = false, labelSettleT = 0, solveAsked = false;   // (solveAsked: the next layout is a solve whatever the camera did, with the standing labels carried first)
  // (During a hand's zoom in the Circuit, a carried reading that comes onto a station's ring is placed again by itself (carryReslot),
  // the others carried; once let go every reading is solved again (reslotted). Its rings grow with the zoom while a reading keeps its
  // offset, so a few per cent of a pinch had solved every reading again, nearly every frame: Mohammad, 26 Oct, "the problem is
  // during the zoom itself it's very very choppy", and his pick "Re-place only the bumped reading".)
  let carryReslot = false, reslotted = false;
  // A hand's zoom in the Circuit: the readings ease out as it starts, are not laid out while it lasts, and ease back in, solved for
  // where the view stopped, once it is let go (as a presenter's camera move does: cam-move). Mohammad, 26 Oct, his pick "Both,
  // readings first" for "the problem is during the zoom itself it's very very choppy". A pan alone keeps them, carried.
  let pinchHide = false, pinchT = 0;
  const PINCH_ZOOM = 0.01;   // (a 1 % change of scale under a hand is a zoom; a pan leaves the scale exactly as it was)
  // (What the labels show, as identities: a hand's ride compares it with what it was when the ride began. Not the vessels' widths or
  // geometry, nor the two flags the zoom itself flips (vt.k > 1.35, zoomedIn): on a playing model the widths move every few frames and
  // the zoom crosses the flags, and the signature then ended every ride within a frame or two. Written into kept lists, no string made.)
  const rideKeyA = [], rideKeyB = [];
  function rideKeyInto(k, st) {
    k[0] = st.selection?.type; k[1] = st.selection?.id; k[2] = st.layers.labels; k[3] = st.layers.chips; k[4] = layerMode(); k[5] = st.focus?.label;
    k[6] = st.focus?.edges?.[0]; k[7] = st.focus?.marks; k[8] = st.labelLevel; k[9] = scan.on; k[10] = dop.key; k[11] = fxSig; k[12] = fx; k[13] = st.presenting;
    k[14] = st.presentLabels; k[15] = st.presentTerms; k[16] = st.presentNames; k[17] = st.hiddenLabels; k[18] = labelBase(); k[19] = projecting; k[20] = explain.key;
    return k;
  }
  const rideKeyHeld = (st) => sameDeps(rideKeyA, rideKeyInto(rideKeyB, st));
  let pinchLift = false, pinchLiftT = 0;
  function pinchRelease() {
    clearTimeout(pinchT);
    pinchT = setTimeout(pinchRel, 160);
  }
  function pinchRel() {
    {
      if (gestureOn()) { pinchT = setTimeout(pinchRel, 120); return; }
      // (They are laid out for where the zoom stopped. The labels still standing are carried to this camera first, then solved: solvedFor is
      // kept, with a solve asked for, so that carry runs; solvedFor = null skipped it, and the labels as they stood before the zoom were
      // shown, at their old screen places, over the zoomed vessels when the hide was lifted, till the solve landed.)
      pinchT = 0; pinchHide = false; reslotted = false; solveAsked = true;
      pinchLift = true;
      if (F && !camMove && !lz?.isOpen()) { labelKey = null; updateLabels(F); }
      // (Shown only once that layout has landed (pinchLiftNow, from labelTail). A solve still in its slices after 600 ms keeps its slices: it
      // was finished in one task there, the whole remaining solve on the main thread just as the hand let go (external review EXT-PERF-1).
      // It is looked at again every 200 ms, and after 3 s the labels come back as they stand, so they are never hidden for good.)
      clearTimeout(pinchLiftT);
      pinchLiftN = 0;
      pinchLiftT = setTimeout(pinchLiftCheck, 600);
      pinchLiftNow(false);
    }
  }
  let pinchLiftN = 0;
  function pinchLiftCheck() {
    pinchLiftT = 0;
    if (!pinchLift || pinchHide) return;
    if (labelJob && ++pinchLiftN < 13) { pinchLiftT = setTimeout(pinchLiftCheck, 200); return; }
    pinchLiftNow(true);
  }
  // (Lifts the hide once the labels stand laid out for the camera: no solve running, the layout's key kept. `force`: whatever stands.)
  function pinchLiftNow(force) {
    if (!pinchLift || pinchHide) return;
    if (!force && (labelJob || labelKey == null)) return;
    pinchLift = false; clearTimeout(pinchLiftT); pinchLiftT = 0;
    // (Shown a frame after the last write, where they stay: they fade in.)
    // alloc-rare: one closure when the hide is lifted after a pinch, never per frame
    nextFrame(() => { if (!pinchHide) wrap.classList.remove('pinch-hide'); });
  }
  // (No timer: the labels are solved in the first frame after the hand lets go and any push has landed.)
  function labelSettleSoon() {
    cancelFrame(labelSettleT);
    labelSettleT = nextFrame(labelSettle);
  }
  function labelSettle() {
    if (gestureOn() || drifting) { labelSettleT = nextFrame(labelSettle); return; }
    labelSettleT = 0;
    if (reslotted) { reslotted = false; solvedFor = null; }   // (readings placed one by one mid-gesture: all solved together now)
    if (F && !camMove && !lz?.isOpen()) { labelKey = null; updateLabels(F); }
  }
  // A vessel's width as the labels see it: it moves only once the vessel has changed by 2 px, so a width
  // easing or hovering at a rounding edge does not lay the labels out again on every model update.
  const sigW = new Map();
  function sigWidth(x) {
    const w = x.width || 0, s = sigW.get(x.e.id);
    if (s != null && Math.abs(w - s) < 2) return s;
    sigW.set(x.e.id, Math.round(w));
    return Math.round(w);
  }
  // A stent's velocity callout waits until the stent has grown in and the flow through it has settled: while it draws on,
  // widens, or the presenter eases the model to a new patient, the reading swings through values no scan would show.
  const STENT_CALM_MS = 1200, stentCalm = new Map();
  function stentReady(sid, f) {
    const x = E[sid];
    if (!x?.vis) { stentCalm.delete(sid); return false; }
    const now = performance.now(), c = stentCalm.get(sid);
    if (!c || x.reveal || f.morphing || x.width !== x.wT) { stentCalm.set(sid, now); return false; }
    return now - c >= STENT_CALM_MS;
  }
  // The narrowings' part of the signature, kept per object: a change of parameters always makes new objects (updateParams
  // clones them, and each model frame brings its own), so the same object always gives the same text. The same holds for the
  // slide's marks and terms (the presenter sets new ones per slide) and the cards' boxes (readBlockers returns a new list):
  // their text is built once per object, not on every call (review item 25).
  const paramJSONs = new WeakMap();
  const paramJSON = (o) => { if (!o || typeof o !== 'object') return JSON.stringify(o); let j = paramJSONs.get(o); if (j === undefined) paramJSONs.set(o, (j = JSON.stringify(o))); return j; };
  let labelGeo = 0;
  // (R04, review pass 2: the signature is rebuilt only when one of the things it is made from changed: the frame, the store's
  // revision, the geometry's version, the vessels' shown set (edgeRev), the slide's marks and the few view thresholds it reads. A
  // camera move alone (a pan, a pinch, a glide: every frame) changes none of them, and had rebuilt the whole string, every vessel's
  // id and width joined, on each of its frames. ?labelrev=0: built on every call, as before.)
  let sigText = '';
  const sigDeps = [], sigNow = [];
  function labelSig(f) {
    const st = store.get(), t = easeInOut(morph);
    // (Between the two views the vessels' geometry changes every frame: the labels are carried along with it, and solved again when the
    // change reaches its second half and when it lands, as the geometry's version then stands.)
    if (!(morph > 0 && morph < 1)) labelGeo = geometryVersion;
    const tips = +stentReady('TIPS', f), dips = +stentReady('DIPS', f);
    const d = sigNow;
    d[0] = f; d[1] = store.rev; d[2] = labelGeo; d[3] = t >= 0.5; d[4] = rotU > 0.5; d[5] = labelBase(); d[6] = stageBox().width < 700;
    d[7] = labelRestK() > 1.35; d[8] = zoomedIn(); d[9] = scan.on; d[10] = fxSig; d[11] = fx; d[12] = slideGlow; d[13] = dop.key; d[14] = edgeRev;
    d[15] = tips; d[16] = dips; d[17] = projecting; d[18] = glowSetAt; d[19] = labelRestK() >= 1.9; d[20] = resMask; d[21] = resLitRev; d[22] = !!sites.list;
    if (sigDeps.length === d.length && sameDeps(sigDeps, d)) return sigText;
    for (let i = 0; i < d.length; i++) sigDeps[i] = d[i];
    sigStats.builds++;
    const edges = EV.filter((x) => x.vis).map((x) => `${x.e.id}${sigWidth(x)}${x.ghost ? 'g' : ''}`).join(',');
    return (sigText = [labelGeo, t >= 0.5, rotU > 0.5, labelBase(), stageBox().width < 700, st.selection?.type + ':' + st.selection?.id, paramJSON((f.viewParams || st.params).stenosis), paramJSON((f.viewParams || st.params).stenosisSite),
      isImaging(), st.layers.labels, st.layers.chips, layerMode(), st.focus?.label, st.focus?.edges?.[0], st.focus?.marks && paramJSON(st.focus.marks), fxSig, fx?.steps && slideGlow.map((g) => g.id + g.at).join(), (fx?.organs.some((o) => o.organ === 'spleen') || fx?.calipers.some((c) => c.organ)) && Math.round((f.slow?.spleen ?? 11) * 2), d[7], st.labelLevel, st.presenting && st.presentLabels?.join(','), st.presenting && paramJSON(st.presentTerms || null), st.presenting && st.presentNames, explain.key, scan.on, [...(st.hiddenLabels || [])].join(','), d[8], flagged(f, flagSigBuf).join(','), edges, `${tips}${dips}`, dop.key, d[19]].join('|'));
  }
  const sigStats = { builds: 0 };
  // (A vessel's label width moved by its 2 px step, outside a model frame: the width's own ease, stepWidths. See sigWidth.)
  const sigWidthMoved = (x) => { const s = sigW.get(x.e.id); return s == null || Math.abs((x.width || 0) - s) >= 2; };
  // Layout runs only when one of its inputs changed: the camera and stage box (the CTM), the label
  // signature (geometry, widths, selection, layers, levels...), the morph and turn, the floating panels,
  // fonts, theme and the presenter's insets. Otherwise the last layout stands, and only the live values
  // are refreshed in place (see refreshValues); a value whose text changes shape lays the labels out again.
  let labelKey = null, labelFonts = 0, labelShown = [], noChevBoxes = [], labelPainted = false;   // labelPainted: the last updateLabels painted the callouts and probes
  let cathHidAt = 0;
  const cathHid = () => !!cath.st && !cath.st.keep && wrap.classList.contains('cath-on') && performance.now() - cathHidAt > 300;
  // (What a stent's column of callouts is solved against besides the camera: the cards' insets and boxes. Empty without one.)
  const INS_KEYS = ['--pz-t', '--pz-l', '--pz-b', '--pz-r'];
  const labelIns = () => {   // (a number folded from the insets and the boxes, 0 without a column: no text is made)
    if (!dop.all) return 0;
    let h = 2166136261;
    for (let i = 0; i < 4; i++) h = sigFold(h, Math.round(pzInset(INS_KEYS[i]) / 8));
    if (blockerBoxes) for (let i = 0; i < blockerBoxes.length; i++) { const o = blockerBoxes[i]; h = sigFold(sigFold(sigFold(sigFold(h, Math.round(o.x0 / 8)), Math.round(o.y0 / 8)), Math.round(o.x1 / 8)), Math.round(o.y1 / 8)); }   // (and the cards' boxes, which can arrive a frame after the insets)
    return h || 1;
  };
  const stats = { layouts: 0, skips: 0, values: 0, ms: 0, jobs: 0, slices: 0, drops: 0 };
  // The Circuit's solved slots kept by zoom (a quarter octave a step), pan bucket, turn and what the labels show, a few, least recently used out:
  // a settle at a step already solved commits them at once. Only at rest in the Circuit; every label must still fit (the carry says), else it solves.
  const solCache = new Map();
  function solCacheKey(sig, sc, th, b, csig, ins) {
    if (morph !== 1 || morphTarget !== 1 || xfSolving || viewXf || !(sc > 0)) return null;
    return [sig, Math.round(Math.log2(sc) * 4), Math.round(th * 100), Math.round(CTM.e / (b.width / 4)), Math.round(CTM.f / (b.height / 4)), b.width, b.height, rotU > 0.5, labelFonts, csig, ins].join('|');
  }
  function solCachePut(sf) {
    pre.need = true;   // (what the labels show was solved again: the other view's ahead-of-time solve is made again in idle time)
    if (!sf.ck || !(morph === 1 && morphTarget === 1)) return;
    const m = new Map();
    for (const [k, v] of labelSol) m.set(k, { ...v });
    solCache.delete(sf.ck); solCache.set(sf.ck, m);
    if (solCache.size > 6) solCache.delete(solCache.keys().next().value);
  }
  function solCacheTry(ck, f) {
    const c = solCache.get(ck);
    if (!c) return false;
    const keep = labelSol;
    const m = new Map();
    for (const [k, v] of c) m.set(k, { ...v });
    labelSol = m;
    if (layoutLabels(f, false) !== false) { solCache.delete(ck); solCache.set(ck, c); return true; }
    labelSol = keep;
    return false;
  }
  const handRideRec = { settle: false };   // (the one record of a hand's zoom ridden: handRide points at it while a ride runs)
  function updateLabels(f, force = false) {
    labelPainted = false;
    if (viewXf) return;   // (the change between the views: the new view's labels were solved at the tap for where it lands, and ride it)
    // Laid out once the presenter's camera settles (see camSettle), or at once if its glide was cut short.
    if (camMove) { if (!vtGliding) camSettle(); return; }
    // (Not while the HVPG catheter hides them (cath-on, after its .25 s fade): its view follows the tip every frame, and every frame
    // of it had laid out, drawn and sent to the GPU labels nobody could see. setCatheter lays them out as it goes.)
    if (cathHid()) { labelKey = null; return; }
    const t0 = performance.now();
    refreshCTM();
    const st = store.get(), b = stageBox();
    // (A hand's zoom, in the Circuit as in the anatomy: the labels ride it, solved once the hand lets go. Only at rest in one view or the
    // other, never between them. What the labels show is compared by rideKeyHeld, not the signature: on a playing model that changes every
    // few frames (widths, geometry), and the two flags the zoom itself flips.)
    const restView = morph === 0 || morph === 1;
    // (The hand came back while the settle solve ran: back to riding, the solve dropped, no carry, no ride end and no glide.)
    if (handRide?.settle && gestureOn() && rideCTM && restView && rideKeyHeld(st)) {
      labelJobDrop(); handRide.settle = false; handRideWatch();
      rideStep(); stats.skips++; stats.ms += performance.now() - t0;
      return;
    }
    if (handRide && !handRide.settle) {
      if (rideCTM && gestureOn() && restView && rideKeyHeld(st)) { rideStep(); stats.skips++; stats.ms += performance.now() - t0; return; }
      handRideEnd(); labelKey = null;
    } else if (!handRide && !pinchHide && !pinchLift && gestureOn() && solvedFor && restView && layCTM && Math.abs(Math.log(CTM.sc / Math.hypot(layCTM[0], layCTM[1]))) > PINCH_ZOOM && rideStart(layCTM)) {
      // A playing model may have another solve in slices. The last committed layout can still ride: discard the unfinished solve,
      // rather than hiding the labels or carrying them from the camera of an older solve.
      labelJobDrop();
      rideKeyInto(rideKeyA, st);   // (what the labels show as the ride begins)
      handRideRec.settle = false; handRide = handRideRec;
      handRideWatch();
      rideStep(); stats.skips++; stats.ms += performance.now() - t0;
      return;
    }
    // (Labels are never hidden for a zoom: the anchored ones ride the camera on the GPU (world anchors), the rest are carried and solved as it goes. Mohammad, 4 Nov: "after I zoom there is like 2-3 s until labels show up in the Circuit" was this hide, lifted by a 3 s poll.)
    const sig = labelSig(f);
    if (carrying && solvedFor?.sig !== sig) { carryAbort(); return; }   // (what the labels show changed mid-move: the usual fade, then laid out as it lands)
    // (R04: the key is a list of numbers and identities compared one by one, not a string joined on every camera frame: the camera's
    // part (the transform in hundredths, the stage box, the morph and turn) and the revisions of the rest.)
    const key = labelKeyNow(st, sig, b);
    // (A solve still running in slices for this same view: the labels stand as they are until it lands, and what changed meanwhile (a
    // value, a callout) is taken up after it, as after any solve. A camera that moved (the key's first eight: the transform, the stage
    // box, the morph and the turn) drops it, and the labels carry as they always did.)
    if (labelJob) {
      if (!force && sameView8(labelJob.key, key)) { labelTail(); return; }
      labelJobDrop();
    }
    if (!force && sameKey(key) && (inMotion() ? holdValues(f) : refreshValues(f))) { stats.skips++; stats.ms += performance.now() - t0; }
    else {
      const sc = CTM.sc, th = Math.atan2(CTM.b, CTM.a);
      const csig = calloutSig();
      // (A stent called out at its three points is solved again when the presenter's cards move (the monitor folded or opened): carried,
      // its callouts and the slide's mark would hide under a card or keep spots chosen for another view: Review 16 Oct.)
      const ins = labelIns();
      // (A slow push (ride) carries them however far it zooms, while none comes onto another: a label changing sides mid-push would
      // jump. They are solved again as it lands: driftEnd. A glide whose labels were solved for where it lands (landing) carries them
      // all the way, without that check: one may pass over another for a moment, the overlap pass below showing the more important.)
      // (Between the two views the labels ride with the change however far its camera zooms: solved again at its half and as it lands.)
      const dz = solvedFor && !(morph > 0 && morph < 1) ? Math.abs(Math.log(sc / solvedFor.sc)) : 0, hand = dz > SOLVE_ZOOM && gestureOn(), land = landing() && !hand, ride = (drifting || land || !!zoomBase) && !hand;
      const landingRide = !!handRide?.settle;
      const changed = !solvedFor || solveAsked || solvedFor.sig !== sig || solvedFor.csig !== csig || solvedFor.ins !== ins || Math.abs(th - solvedFor.th) > SOLVE_TURN;
      const solve = changed || (!landingRide && !ride && dz > (hand ? SOLVE_ZOOM_HAND : SOLVE_ZOOM));
      carryClear = hand || landingRide; carryReslot = gestureOn();
      if (ride && !land && dz > SOLVE_ZOOM) carryClear = true;   // (carried, but never onto each other)
      const solved = solve || layoutLabels(f, false) === false;
      carryReslot = false;
      if (solved) {
        carryClear = false;
        // (Written into whichever of two kept records is not the one standing: a solve in slices holds its record until it lands.)
        const sf = solvedFor === SOLVED_A ? SOLVED_B : SOLVED_A;
        sf.sig = sig; sf.sc = sc; sf.th = th; sf.csig = csig; sf.ins = ins; sf.view = morphTarget;
        sf.ck = solCacheKey(sig, sc, th, b, csig, ins);
        // (A zoom back to a step already solved in the Circuit: its recorded slots are carried, with no solve. They stand only if every label still fits.)
        if (sf.ck && solCacheTry(sf.ck, f)) { solvedFor = sf; solveAsked = false; } else {
        // (The labels already standing are carried to this frame's camera first: a solve that does not land inside its slice leaves them as
        // they are, so each frame of a zoom or glide that asked for a fresh solve left them one more frame behind the figure, and
        // dropped the sliced solve the next frame. Mohammad, 2 Nov: "the labels and callouts move slower than the figure camera".)
        if (solvedFor && solvedFor.view === morphTarget && !(morph > 0 && morph < 1)) layoutLabels(f, false);   // (not another view's solution: its anchors are that view's world points, which would stand the labels and their dots where the figure has none)
        preAbort();
        const g = layoutLabelsGen(f, true);
        if (!labelSliceRun(g, xfSolving ? 2 : gestureOn() || drifting || (morph > 0 && morph < 1) ? LABEL_SLICE_MS : LABEL_FIRST_REST_MS)) {   // (at rest the first slice is long: most solves land in it)
          labelJob = JOB; JOB.g = g; JOB.key = keyInto(jobKeyArr, key); JOB.solvedFor = sf; JOB.xfTap = null; JOB.t0 = performance.now(); stats.jobs++;
          mayTask('label solve', labelJobStep, handRide?.settle || !gestureOn() ? JOB_NOW : undefined);   // (at rest the slices run every frame, none waits two)
          stats.ms += performance.now() - t0;
          labelTail();
          return;
        }
        solvedFor = sf; solveAsked = false; solCachePut(sf);
        }
      }
      else if (landingRide) { solvedFor.sc = sc; }
      else if (hand || reslotted) labelSettleSoon();
      if (gpuProbe.on) gpuProbe.note(solved ? COUNTED.labelSolve : COUNTED.labelCarry);
      carryClear = false;
      labelKey = keyInto(labelKeyArr, key); stats.layouts++; stats.ms += performance.now() - t0;
    }
    labelTail();
  }
  // The hand's ride (see updateLabels): watched until the hand lets go, then the labels are laid out for where the view stopped while
  // they still ride, and only once that layout has landed (a sliced solve too) does the ride end, each label gliding on from where it
  // rode (label-gl.js rideEnd, sync). Ending it before would draw the old layout, uncarried, for the frames the solve takes.
  function handRideWatch() {
    cancelFrame(handRideT);
    handRideT = nextFrame(handRideWait);   // (checked every frame, not on a timer: the settle starts in the first frame the hand has been still)
  }
  function handRideWait() {
    if (!handRide || handRide.settle) return;
    if (drag || glide || gestureOn()) {   // (the settle starts once the hand has let go: pointer up, or the wheel quiet, not at any short pause)
      handRideT = nextFrame(handRideWait); return; }
    handRideT = 0; handRide.settle = true;
    if (F && !camMove && !lz?.isOpen()) { labelKey = null; updateLabels(F); } else handRideEnd();
  }
  function handRideEnd() { if (!handRide) return; handRide = null; cancelFrame(handRideT); handRideT = 0; rideStop(); }
  // (What every layout of the labels ends with, a carried, a skipped or a sliced one too: the callouts and probes painted, then the GPU's copy.)
  function labelTail() {
    pinchLiftNow(false);   // (the labels hidden for a zoom that rode no further come back once their layout is down)
    if (handRide?.settle && !labelJob) handRideEnd();   // (the layout for where the hand stopped has landed: the ride ends as it is drawn)
    if (sites.list) sitesPaint();
    if (scan.on) scanPaint();
    dprobePaint();
    labelPainted = true;
    preAsk();
    if (xfHold && !labelJob) xfRelease();
    labelGlSync();   // (last: the probe's place, just written, is drawn in this frame too)
  }
  // The solve running in slices (LABEL_SLICE_MS): its generator, the view's key it was started for and what it was solved for.
  let labelJob = null, sliceEnd = Infinity;
  const sliceOver = () => performance.now() > sliceEnd;
  // (Runs the solve for up to ms; true once it has landed.)
  function labelSliceRun(g, ms) {
    sliceEnd = performance.now() + ms;
    let r;
    try { r = g.next(); } finally { sliceEnd = Infinity; }
    return r.done;
  }
  const sameView8 = (a, b) => { for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return false; return true; };
  function labelJobDrop() { if (!labelJob) return; stats.drops++; const g = labelJob.g; labelJob = null; cancelMay('label solve'); g.return(); }
  // (The running solve finished now, in one go: the labels are laid out for the camera as it stands.)
  function labelJobFinish() {
    const j = labelJob;
    if (!j) return;
    cancelMay('label solve');
    try { while (!labelSliceRun(j.g, 1e6)); } catch (e) { labelJob = null; labelKey = null; throw e; }
    labelJob = null;
    solvedFor = j.solvedFor; solveAsked = false; solCachePut(solvedFor);
    labelKey = keyInto(labelKeyArr, j.key); stats.layouts++;
    labelTail();
  }
  // (A slice in a frame's spare time: true while there is more to do.)
  function labelJobStep(left) {
    const j = labelJob;
    if (!j) return false;
    if (camMove || cathHid() || lz?.isOpen()) { labelJobDrop(); labelKey = null; return false; }
    let done;
    // (A frame with no time to spare gives its slice anyway, and a solve that has run long takes more each time (2 ms, up to 12 ms after a
    // second): on a slow phone, 1 ms slices a few frames apart left another view's layout standing for most of a minute, the Circuit
    // showing two readings and the anatomy's names after the switch.)
    stats.slices++;
    const age = performance.now() - (j.t0 || 0), ms = Math.max(gestureOn() || drifting ? 0 : LABEL_REST_SLICE_MS, Math.min(12, LABEL_SLICE_MS + Math.max(0, age - 250) / 75));   // (at rest a solve takes a longer slice each frame, so it lands in a few frames)
    try { done = labelSliceRun(j.g, Math.max(ms, Math.min(LABEL_SLICE_MS, left || LABEL_SLICE_MS))); } catch (e) { labelJob = null; labelKey = null; throw e; }
    // (Past 400 ms a slice runs every frame, not every third: on a busy frame budget the may task waited its two frames each time, and a
    // Circuit solve took half a minute to land, two readings standing meanwhile.)
    if (!done && (age > 400 || !gestureOn())) { mayTask('label solve', labelJobStep, JOB_NOW); return false; }
    if (!done) return true;
    labelJob = null;
    solvedFor = j.solvedFor; solveAsked = false; solCachePut(solvedFor);
    if (gpuProbe.on) gpuProbe.note(COUNTED.labelSolve);
    labelKey = keyInto(labelKeyArr, j.key); stats.layouts++;
    if (j.xfTap) xfMarkCurrent(j.xfTap);
    labelTail();
    return false;
  }
  // (R04: the labels' key as numbers and identities, written into one kept list. The callouts' boxes fold into one number.)
  const keyBuf = [];
  function labelKeyNow(st, sig, b) {
    const k = keyBuf;
    k[0] = Math.round(CTM.a * 100); k[1] = Math.round(CTM.b * 100); k[2] = Math.round(CTM.e * 100); k[3] = Math.round(CTM.f * 100);
    k[4] = b.width; k[5] = b.height; k[6] = morph; k[7] = rotU; k[8] = labelFonts; k[9] = themeKey(); k[10] = pzInset('--pz-l'); k[11] = pzInset('--pz-t');
    k[12] = st.mode; k[13] = !!st.compareSnap; k[14] = st.compareView; k[15] = paramJSON(blockerBoxes); k[16] = sig;
    let h = 0, n = 0;
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) { h = foldBox(h, el._box); n++; }
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) { h = foldBox(h, el._box); n++; }
    if (dpr.on && dpr.box) { h = foldBox(h, dpr.box); n++; for (const m of dpr.marks) { h = foldBox(h, m); n++; } }
    k[17] = h; k[18] = n;
    return k;
  }
  const foldBox = (h, b) => Math.imul(Math.imul(h ^ Math.round(b.x0 / 8), 16777619) ^ Math.round(b.y0 / 8), 16777619);
  const sameKey = (k) => Array.isArray(labelKey) && labelKey.length === k.length && sameDeps(labelKey, k);
  // (Cached labels while something moves (recs.md item 6, 2 Nov 2026): during a transition (inMotion: a slide's cards thrown, a
  // dive) a laid-out label is left exactly as it is, its places, widths and collisions kept from its last layout and its live values
  // not rebuilt or written into the page, so a moving frame does no label DOM work at all. The values catch up in the first frame
  // after the move ends.)
  let heldF = null, heldWait = null;
  const heldRun = () => { const g = heldF; heldF = null; if (!g || cathHid()) return; if (!refreshValues(g)) labelKey = null; labelGlSync(); };
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
    for (const it of labelShown) {
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
    const shown = labelShown, count = shown.length;
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
  const LAB_VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 }, LAB_PLAIN = { x0: 0, y0: 0, x1: 0, y1: 0 }, LAB_PTVIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const viewOf = (it) => (it.key === 'scan' ? LAB_PLAIN : it.point || (dop.all && /^focus/.test(it.key)) ? LAB_PTVIEW : LAB_VIEW);
  const OBST_BUF = [], PLACED_BUF = [], CLAMP_ALTS = [];
  const FAR_DIRS = ['SE', 'NE', 'SW', 'NW', 'E', 'W', 'S', 'N'];
  const STENT_PTS = ['proximal', 'mid', 'distal'];
  const MARK_DOTS = [[0, 0], [0, 0], [0, 0]];
  const SB_A = [0, 0], SB_B = [0, 0], SB_C = [0, 0], SP_P = [0, 0], SP_Q = [0, 0];
  const SC_R = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const LANE = { ox: 0, oy: 0, ux: 0, uy: 0 };
  const CLAMP_BEST = { n: 0, d: 0, t: 0 }, CLAMP_BB = { x: 0, y: 0, width: 0, height: 0 }, CLAMP_R = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const CLAMP_MEAS = [{ set: false, x: 0, y: 0, bb: { x: 0, y: 0, width: 0, height: 0 } }, { set: false, x: 0, y: 0, bb: { x: 0, y: 0, width: 0, height: 0 } }];
  // (The "60 %" search's steps: every 4 px out to 64 and every 8 along the vessel, -64 to 64, nearest first. The same for every label.)
  const CLAMP_STEPS = [];
  for (let px = 0; px <= 64; px += 4) for (let tp = -64; tp <= 64; tp += 8) CLAMP_STEPS.push([px, tp]);
  CLAMP_STEPS.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  // A stent's point on the screen, written into `out`.
  function pointAtLocal(out, pts, u) { const p = pointAt(pts, u); return worldToLocalInto(out, p[0], p[1]); }
  // (A slide's caliper or bracket: boxes along the line from p to q, pushed on the boxes placed.)
  function segBoxes(p, q, pad) {
    worldToLocalInto(SB_A, p[0], p[1]); worldToLocalInto(SB_B, q[0], q[1]);
    const x0 = SB_A[0], y0 = SB_A[1], x1 = SB_B[0], y1 = SB_B[1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, xa = x0 + (x1 - x0) * u0, xb = x0 + (x1 - x0) * u1, ya = y0 + (y1 - y0) * u0, yb = y0 + (y1 - y0) * u1;
      PLACED_BUF.push({ x0: Math.min(xa, xb) - pad, y0: Math.min(ya, yb) - pad, x1: Math.max(xa, xb) + pad, y1: Math.max(ya, yb) + pad, dot: true });
    }
  }
  // lineW of a line with every figure run read as "000" (the widest a reading's figures can be).
  function lineW000(line) { let w = 0; for (let i = 0; i < line.length; i++) { const r = line[i]; w = w + textW(r.cls === 'lb-val' ? '000' : r.t, fontPx(r.size), r.weight, r.track || 0) + (i ? (r.gap ?? 3) * labelK : 0); } return w; }
  // How badly a stent's three points would stand in a column on `side` of their dots: off the view, under a card, over vessels.
  function colSideScore(side, col, tpl, G, wT, h, view, obstacles) {
    const padX = tpl.padX || 0, padY = tpl.padY || 0;
    let n = 0;
    for (let i = 0; i < 3; i++) {
      pointAtLocal(SB_C, geo[col].cur, STENT_SITES[STENT_PTS[i]]);
      const x = side === 'E' ? SB_C[0] + G : SB_C[0] - G - wT, y = SB_C[1] - h / 2;
      SC_R.x0 = x - padX; SC_R.y0 = y - padY; SC_R.x1 = x + wT + padX; SC_R.y1 = y + h + padY;
      let under = false;
      for (let j = 0; j < obstacles.length; j++) { const o = obstacles[j]; if (!o.probe && hits(SC_R, o)) { under = true; break; } }
      n = n + (within(SC_R, view) ? 0 : 1e3) + (under ? 1e3 : 0) + lineHits(SC_R, 2) * 10;
    }
    return n;
  }
  // The slide's mark (or the first of its marks) that stands on this stent, or null.
  function focusMarkOn(st, col) {
    const fo = st.focus;
    if (!fo) return null;
    const ms = fo.marks;
    if (ms) { for (let i = 0; i < ms.length; i++) if (ms[i].edges?.[0] === col) return ms[i]; return null; }
    return fo.edges?.[0] === col ? fo : null;
  }
  // The lane the slide's mark leaves along at the narrowing (kept record LANE), or null.
  function laneFor(col, st, f) {
    const m = focusMarkOn(st, col);
    if (!m) return null;
    const pp = f.viewParams || st.params, cur = geo[col].cur;
    const pt = pointAt(cur, stenosisAt(col, pp)), x = pt[0], y = pt[1], dx = pt[2], dy = pt[3];
    worldToLocalInto(SB_A, x, y);
    const ox = SB_A[0], oy = SB_A[1];
    pointAtLocal(SB_B, cur, m.seg ? STENT_SITES[stentGate(m.seg, pp, col)] : 0.5);
    if (Math.hypot(SB_B[0] - ox, SB_B[1] - oy) > 12) return null;
    worldToLocalInto(SB_B, x + dx, y + dy);
    const tx = SB_B[0], ty = SB_B[1], n = Math.hypot(tx - ox, ty - oy) || 1;
    pointAtLocal(SB_C, cur, STENT_SITES.mid);
    const cx = SB_C[0], cy = SB_C[1];
    const sg = (cx - ox) * (tx - ox) + (cy - oy) * (ty - oy) > 0 ? -1 : 1;
    LANE.ox = ox; LANE.oy = oy; LANE.ux = (sg * (tx - ox)) / n; LANE.uy = (sg * (ty - oy)) / n;
    return LANE;
  }
  function inLaneBox(lane, r) {
    if (!lane) return false;
    const { ox, oy, ux, uy } = lane, sx = Math.max(1, (r.x1 - r.x0) / 8), sy = Math.max(1, (r.y1 - r.y0) / 4);
    for (let x = r.x0; x <= r.x1 + 0.01; x += sx) for (let y = r.y0; y <= r.y1 + 0.01; y += sy) {
      const a = (x - ox) * ux + (y - oy) * uy;
      if (a > 10 && a < 150 && Math.abs((y - oy) * ux - (x - ox) * uy) < 46) return true;
    }
    return false;
  }
  // (The "60 %" the probe would cover: its box moved by d out and t along the vessel, judged against the probe's boxes, the view and the credit.
  // One label at a time, so the context is kept and the box is a kept record.)
  const CLB = { c: null, base: null, ox: 0, oy: 0, id: '', credit: null, probe: null, view: null };
  const CLB_BASE = { x0: 0, y0: 0, x1: 0, y1: 0 }, CLB_R = { x0: 0, y0: 0, x1: 0, y1: 0 }, BOX_TMP = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const PROBE_BUF = [], CLAMP_SEEN = new Set(), MARK_TRIS = [], MARK_ARROWS = [];
  for (let i = 0; i < 8; i++) MARK_TRIS.push([[0, 0], [0, 0], [0, 0]]);
  const PROBE_STEPS = [];
  for (let px = 0; px <= 80; px += 8) for (let tp = -88; tp <= 88; tp += 8) if (px || tp) PROBE_STEPS.push([px, tp]);
  PROBE_STEPS.sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
  function clBoxAt(d, t) {
    const c = CLB.c, base = CLB.base;
    worldToLocalInto(SB_A, c.x + c.nx * (d - 16) - c.ny * t, c.y + c.ny * (d - 16) + c.nx * t);
    if (!base) return base;
    const bx = SB_A[0], by = SB_A[1], r = CLB_R;
    r.x0 = base.x0 + bx - CLB.ox; r.y0 = base.y0 + by - CLB.oy; r.x1 = base.x1 + bx - CLB.ox; r.y1 = base.y1 + by - CLB.oy;
    return r;
  }
  function clProbeHit(b) { const pr = CLB.probe; for (let i = 0; i < pr.length; i++) if (hits(b, pr[i])) return true; return false; }
  function clFree(b) { return b && !clProbeHit(b) && within(b, CLB.view) && lineHits(b, 6, CLB.id) < 1 && !(CLB.credit && hits(b, CLB.credit)); }
  // An element's box in stage px, `m` px grown, written into `out` (or null when it has none).
  function boxOfElInto(out, el, m = 2) {
    const b = el._txt != null ? clampTextBox(el) : elBoxInto(el, EBOX, clampTextBox);
    if (!b?.width) return null;
    const bx = b.x, by = b.y, bw = b.width, bh = b.height;
    worldToLocalInto(SB_A, bx, by); let x0 = SB_A[0], y0 = SB_A[1], x1 = x0, y1 = y0;
    worldToLocalInto(SB_A, bx + bw, by); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    worldToLocalInto(SB_A, bx, by + bh); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    worldToLocalInto(SB_A, bx + bw, by + bh); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    out.x0 = x0 - m; out.y0 = y0 - m; out.x1 = x1 + m; out.y1 = y1 + m;
    return out;
  }
  function boxOfEl(el, m = 2) { const b = boxOfElInto(BOX_TMP, el, m); return b && { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }
  // How far (x, y) is from the triangle: 0 inside it.
  function triSide(a, b, x, y) { return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); }
  function triDist(x, y, tri) {
    const s0 = triSide(tri[0], tri[1], x, y), s1 = triSide(tri[1], tri[2], x, y), s2 = triSide(tri[2], tri[0], x, y);
    if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return 0;
    let m = Infinity;
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
      m = Math.min(m, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
    }
    return m;
  }
  // (The layout itself, a generator: a solve yields between labels once its slice is spent (sliceOver); run whole, it never yields.)
  function* layoutLabelsGen(f, solve, dry = false) {
    frameNo++;
    const st = store.get();
    const t = easeInOut(morph);
    const circuit = t >= 0.5;
    if ((circuit && rotU > 0.5) !== labelTurned) { labelTurned = !labelTurned; labelSol.clear(); if (!solve) return false; }
    labelK = labelBase() * (circuit ? CIRCUIT_LABEL_K : 1);
    if (labelK !== lbkNum) { lbkNum = labelK; lbkStr = labelK.toFixed(2); }   // (the text made only when the number moved)
    const lbk = lbkStr;
    if (gLabels.dataset.k !== lbk) { gLabels.dataset.k = lbk; gLabels.style.setProperty('--lbk', lbk); }
    const wr = stageBox();
    const W = wr.width, H = wr.height;
    // A solve prefers slots that sit inside the stage as it is now, but never depends on the panels, and a pan
    // alone never searches again. A label a pan later pushes past the edge is pulled back in (see below).
    // (On a wide screen's slide the readings keep the slides' one margin from every edge, as the cards do, and stay above the nav
    // pill's row: 17 Oct design review, a reading had stood 8 px from the right edge, and another level with the pill.)
    const M = st.presenting && pillEdge ? pillEdge.m : 6;
    const view = LAB_VIEW, plain = LAB_PLAIN;
    view.x0 = M; view.y0 = M; view.x1 = W - M; view.y1 = H - M; plain.x0 = 6; plain.y0 = 6; plain.x1 = W - 6; plain.y1 = H - 6;   // plain: the whole stage, for the FibroScan callout, which keeps with its probe (see below)
    if (st.presenting && pillEdge) view.y1 = Math.max(H * 0.5, Math.min(view.y1, pillEdge.top - 8));
    // (A label keeps out of the sensor housing and the rounded corners of a phone held sideways: the stage runs edge to edge under them.)
    { const sa = saSides(); view.x0 = Math.max(view.x0, sa.l - wr.left); view.x1 = Math.min(view.x1, W - Math.max(0, sa.r - (innerWidth - wr.right))); }
    // A presenter slide's words hold the left (a phone: the top) under a fading shade; labels keep clear of it.
    if (st.presenting) { view.x0 = Math.max(view.x0, pzInset('--pz-l') + 30); view.y0 = Math.max(view.y0, pzInset('--pz-t') + 12); }
    // (A stent's point, and the slide's mark beside it, come as near the top card as they may come to any card (4 px past its box, and
    // a pixel to spare), so the point nearest it can still stand level with its dot: Review 16 Oct.)
    const ptView = LAB_PTVIEW;
    ptView.x0 = view.x0; ptView.y0 = st.presenting ? Math.max(6, pzInset('--pz-t') + 5) : view.y0; ptView.x1 = view.x1; ptView.y1 = view.y1;
    const compact = W < 700;
    // Floating panels over the figure (notifications, hint cards, banners): a label under one is hidden.
    // Their boxes are read before this frame's SVG changes (see updateInner), while layout is clean.
    const blockers = blockerBoxes || NO_BLK;   // (none read yet: read first in the next frame, see updateInner)
    const callouts = calloutBoxes();
    const obstacles = OBST_BUF;   // what can hide a label this frame
    obstacles.length = 0;
    for (let i = 0; i < blockers.length; i++) obstacles.push(blockers[i]);
    for (let i = 0; i < callouts.length; i++) obstacles.push(callouts[i]);
    const placed = PLACED_BUF;
    placed.length = 0;
    if (solve) for (let i = 0; i < callouts.length; i++) { const b = callouts[i]; placed.push({ x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3, call: true, probe: !!b.probe }); }
    // (A slide's calipers and brackets (package F) are lines no label may sit on, their own readings included: boxes along each.)
    if (solve && fx) {
      if (!circuit) for (const c of fx.calipers) { const g = caliperSegs(c, f); if (g) for (const [p, q] of g.segs) segBoxes(p, q, 5); }
      if (circuit) for (const sp of fx.spans) {
        const at = spanOf(sp.from, sp.to, fxK());
        if (at) {
          SP_P[0] = at.x0; SP_P[1] = at.y; SP_Q[0] = at.x1; SP_Q[1] = at.y; segBoxes(SP_P, SP_Q, 5);
          SP_P[0] = at.x0; SP_P[1] = at.y - SPAN_TICK; SP_Q[0] = at.x0; SP_Q[1] = at.y; segBoxes(SP_P, SP_Q, 5);
          SP_P[0] = at.x1; SP_P[1] = at.y - SPAN_TICK; SP_Q[0] = at.x1; SP_Q[1] = at.y; segBoxes(SP_P, SP_Q, 5);
        }
      }
    }
    // (The corner credit, where it shows: a stent's column and the slide's mark beside it keep off it where they can, so it holds its
    // spot when another point is picked. It moves whenever a label comes to cover it, and does not come back.)
    // (Its box read with the cards', first in a frame: readBlockersRead.)
    const creditBox = solve && dop.all ? creditKept : null;
    const markDots = solve && dop.all && dop.id && geo[dop.id]?.cur?.length > 1 ? MARK_DOTS : null;   // (the stent's three dots: kept pairs)
    if (markDots) for (let i = 0; i < 3; i++) pointAtLocal(MARK_DOTS[i], geo[dop.id].cur, STENT_SITES[STENT_PTS[i]]);
    const later = [];   // labels placed after the slide's marks (a stent's points other than the sampled one)
    // Where a stent's point goes when nothing near its third is free: a little farther out on a leader that crosses no label (diagonal
    // first, which clears a narrowing's clamp above or below its "60 %"), then farther still.
    // (A stent's point with still no room, on a phone's small stent beside its narrowing: the far spots slid up or down a
    // little, nearest first, so its leader can pass by the narrowing's clamp and its label sit in the gap that is left.)
    const SLID = (far) => [far + 12, far + 48, far + 84].flatMap((gap) => [-24, 24, -48, 48, -72, 72].map((y) => ({ gap, leader: true, uncrossed: true, shift: [0, y] })));
    let stale = false;
    const prevSol = labelSol, nextSol = solve ? labelSolSpare : labelSol;   // (the one that was not kept last time, cleared: the two take turns)
    if (solve) nextSol.clear();
    // (A solve in the anatomy at the zoom, turn and view it was last solved for (a pan, a value that changed what shows): every label
    // whose old spot beside its point is still free keeps it, and only the others are placed again. Solved whole, a pan's release had
    // put CONF, SMV, SV and IMV on other sides of their vessels, the labels sliding against the figure as the hand let go: 3 Nov 2026.)
    const keepSlots = solve && !dry && !circuit && !!solvedFor && solvedFor.view === morphTarget && (morph === 0 || morph === 1)
      && Math.abs(Math.log(CTM.sc / solvedFor.sc)) < 0.03 && Math.abs(Math.atan2(CTM.b, CTM.a) - solvedFor.th) < 0.01;
    const out = [];
    const leaders = [];   // { k, tag, at }: every line, then every dot (paintLeaders)
    let useLines = false, rings = [], ringXY = [];   // rings: the Circuit's stations with a reading (see placeMulti); ringXY: their dots
    const clampAlts = CLAMP_ALTS;   // (the column's "60 %": other spots off the vessels, nearest first, for the slide's mark)
    const buildLines = () => { if (solve && !useLines) { useLines = true; buildSegs(); } };
    // A stent called out at its three points: the three stand in a column beside their own dots, distal to proximal in the stent's
    // own order, on the side with room (off the cards and the stage edge, over the fewest vessels). The side is chosen from the stent
    // and the screen alone, never from the point sampled, so nothing moves when another point is picked; the "60 %" takes the other side.
    if (solve) {
      const col = dop.all && dop.id && E[dop.id]?.vis && EI[dop.id] >= 0 && geo[dop.id]?.cur?.length > 1 ? dop.id : null;
      if (col) {
        buildLines();
        const tpl = velItem(col, f, 'distal'), h = tpl.h, G = colGap(col);
        const wT = lineW000(tpl.lines[0]);
        const e = colSideScore('E', col, tpl, G, wT, h, view, obstacles), w = colSideScore('W', col, tpl, G, wT, h, view, obstacles);
        ptSide = clampFor === col && ptSide === 'W' ? (e + 5 < w ? 'E' : 'W') : (w + 5 < e ? 'W' : 'E');   // (a near tie keeps the side it had)
      } else ptSide = null;
      const away = col ? (ptSide === 'E' ? 'W' : 'E') : null;
      const cws = clampW.children;
      if (away !== clampAway || col !== clampFor) { clampAway = away; clampFor = col; for (let i = 0; i < cws.length; i++) if (cws[i].classList.contains('clamp-label')) clampLabelAt(cws[i]); }
      for (let i = 0; i < cws.length; i++) if (cws[i].classList.contains('clamp-label')) clampFontAt(cws[i]);
      // (The column's "60 %" stands off the vessels on its side (Review 15 Oct: it sat on the grey vein): the nearest spot clear of
      // every vessel but its stent and of the credit, a step farther out or slid along the stent at a time, up to 64 px each way;
      // failing that, the one over the fewest.)
      // (Where the slide's mark points at the narrowing, its leader can only leave along the stent, between the arrows and away from the
      // other dots: the "60 %" keeps out of that lane where it can, so the mark finds a spot there off the vessels: Review 16 Oct.)
      const lane = col ? laneFor(col, st, f) : null;
      if (col) for (let wi = 0; wi < cws.length; wi++) {
        const el = cws[wi];
        if (!el.classList.contains('clamp-label') || el._c?.id !== col) continue;
        const k = 1 / Math.max(CTM.sc, 1e-3), steps = CLAMP_STEPS;
        let hasBest = false;
        const best = CLAMP_BEST;
        // (Where the slide's mark is on this stent, the next few spots off the vessels are kept too: the mark may need the one it takes,
        // and then the "60 %" moves to the nearest of them that frees it (see the focus callout).)
        const markOn = focusMarkOn(st, col) !== null;
        clampAlts.length = 0;
        // (Its box is measured once for each way its text can run; every other step only moves it, so the box moves by the
        // same amount: up to 289 forced layouts in one search had been one per step. Review item 24.)
        const measured = CLAMP_MEAS;
        measured[0].set = false; measured[1].set = false;
        for (let si = 0; si < steps.length; si++) {
          const px = steps[si][0], tp = steps[si][1];
          if (hasBest && !best.n && (!markOn || clampAlts.length >= 12)) break;
          el._d = 16 + px * k; el._t = tp * k;
          const q = clampLabelPos(el);
          if (!q) break;
          const qx = +q.x.toFixed(2), qy = +q.y.toFixed(2), ref = measured[+q.left];
          let bb;
          if (ref.set) { bb = CLAMP_BB; bb.x = ref.bb.x + (qx - ref.x); bb.y = ref.bb.y + (qy - ref.y); bb.width = ref.bb.width; bb.height = ref.bb.height; }
          else {
            clampLabelAt(el);
            bb = clampTextBox(el);
            if (!bb) break;
            ref.set = true; ref.x = qx; ref.y = qy; ref.bb.x = bb.x; ref.bb.y = bb.y; ref.bb.width = bb.width; ref.bb.height = bb.height;
          }
          worldToLocalInto(SB_A, bb.x, bb.y); worldToLocalInto(SB_B, bb.x + bb.width, bb.y + bb.height);
          const r = CLAMP_R;
          r.x0 = Math.min(SB_A[0], SB_B[0]); r.y0 = Math.min(SB_A[1], SB_B[1]); r.x1 = Math.max(SB_A[0], SB_B[0]); r.y1 = Math.max(SB_A[1], SB_B[1]);
          const n = lineHits(r, 8, col) + (within(r, view) ? 0 : 1e3) + (creditBox && hits(r, creditBox) ? 100 : 0) + (inLaneBox(lane, r) ? 0.5 : 0);   // (its 3.5 px halo and 2 px of air past it, and a pixel and a half to spare)
          if (n < 1 && hasBest && best.n < 1) clampAlts.push({ d: el._d, t: el._t, el });
          if (!hasBest || n < best.n) { hasBest = true; best.n = n; best.d = el._d; best.t = el._t; }
        }
        let kept = 0;
        for (let i = 0; i < clampAlts.length; i++) { const a = clampAlts[i]; if (a.d !== (hasBest ? best.d : undefined) || a.t !== (hasBest ? best.t : undefined)) clampAlts[kept++] = a; }
        clampAlts.length = kept;
        if (hasBest) { clampD.set(col, { d: best.d, t: best.t }); el._d = el._t = undefined; clampLabelAt(el); }
      }
    }
    // Stenosis clamps and their percentages are drawn on the figure; keep labels off them. (Beside a stent called out in a column,
    // only the clamp's own arrows and its "60 %", so the callout at the narrowing can stand right by its dot.)
    if (solve && !isImaging()) {
      const stenoses = (f.viewParams || st.params).stenosis;
      for (const id in stenoses) {
        const v = stenoses[id];
        if (!(v > 0) || !E[id]?.vis) continue;
        if (id === clampFor && ptSide) {
          const cks = ov.clamps.children;
          for (let i = 0; i < cks.length; i++) {
            const el = cks[i];
            if (!el.classList.contains('clamp') || el.getAttribute('data-id') !== id) continue;
            const b = boxOfElInto({ x0: 0, y0: 0, x1: 0, y1: 0 }, el, 0);
            if (b) placed.push(b);
          }
          continue;
        }
        pointAtLocal(SB_A, geo[id].cur, stenosisAt(id, f.viewParams || st.params));
        const sx = SB_A[0], sy = SB_A[1];
        placed.push({ x0: sx - 26, y0: sy - 22, x1: sx + 60, y1: sy + 22 });
      }
    }
    // (The clamps' "60 %" again on its own: a station inside the clamp's box above may send a long leader out, but never through it,
    // and no leader passes nearer than 2 px to its halo: Review 15 Oct.)
    // The "60 %" the probe would cover steps out on a leader line (its fade out and in: clampStep); the leader is drawn from the
    // clamp's outer tip (clampLeads, below).
    if (solve && !isImaging()) {
      const probe = PROBE_BUF, seen = CLAMP_SEEN, k = 1 / Math.max(CTM.sc, 1e-3);
      probe.length = 0; seen.clear();
      if (dpr.on && dpr.box) { probe.push(dpr.box); const pm = dpr.marks; for (let i = 0; i < pm.length; i++) probe.push(pm[i]); }
      const cws2 = clampW.children;
      for (let wi = 0; wi < cws2.length; wi++) {
        const el = cws2[wi];
        if (!el.classList.contains('clamp-label')) continue;
        const c = el._c, id = c?.id, m = clampMv.get(id);
        if (!c || id === clampFor || (!probe.length && !m?.cur)) continue;   // (a column's "60 %" has its own spot: clampD)
        seen.add(id);
        buildLines();
        // (The box at the usual spot once, then shifted: a move of d out and t along the vessel is the same move on screen.)
        el._d = 16; el._t = 0; clampLabelAt(el);
        const base = boxOfElInto(CLB_BASE, el, 5);
        worldToLocalInto(SB_B, c.x, c.y);
        el._d = el._t = undefined;
        CLB.c = c; CLB.base = base; CLB.ox = SB_B[0]; CLB.oy = SB_B[1]; CLB.id = id; CLB.credit = creditBox; CLB.probe = probe; CLB.view = view;
        let want = null, probed = false;
        for (let i = 0; i < probe.length; i++) if (hits(clBoxAt(16, 0), probe[i])) { probed = true; break; }
        if (probed) {
          const cur = m?.want;
          if (cur && clFree(clBoxAt(cur.d, cur.t))) want = cur;   // (a spot that still works is kept: nothing hops while the probe stays)
          else {
            const steps = PROBE_STEPS;
            let hit = null;
            for (let i = 0; i < steps.length; i++) if (clFree(clBoxAt(16 + steps[i][0] * k, steps[i][1] * k))) { hit = steps[i]; break; }
            if (hit) want = { d: 16 + hit[0] * k, t: hit[1] * k };
          }
        }
        clampStep(id, want);
        clampLabelAt(el);
      }
      for (const [id, m] of clampMv) if (!seen.has(id) && !m.busy) clampMv.delete(id);
    }
    if (solve && !isImaging()) for (let wi = 0, cwl = clampW.children; wi < cwl.length; wi++) {
      const el = cwl[wi];
      if (!el.classList.contains('clamp-label')) continue;
      const b = boxOfElInto(BOX_TMP, el, 6);
      if (b) placed.push(el._box = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lab: true });
    }
    // (The column's narrowing arrows, for the slide's mark: its leader keeps 6 px off them, as drawn (their triangles, not their
    // boxes, so a leader straight up between them still passes): Review 16 Oct.)
    const markArrows = MARK_ARROWS;
    markArrows.length = 0;
    if (solve && dop.all && clampFor && ptSide) {
      const cks = ov.clamps.children;
      for (let i = 0; i < cks.length; i++) {
        const el = cks[i];
        if (!el.classList.contains('clamp') || el.getAttribute('data-id') !== clampFor) continue;
        const n = (el.getAttribute('d') || '').match(/-?[\d.]+(e-?\d+)?/g);
        if (!n || n.length < 6) continue;
        const tri = MARK_TRIS[markArrows.length] || (MARK_TRIS[markArrows.length] = [[0, 0], [0, 0], [0, 0]]);   // (more arrows than ever: one more is made)
        for (let j = 0; j < 3; j++) worldToLocalInto(tri[j], +n[j * 2], +n[j * 2 + 1]);
        markArrows.push(tri);
      }
    }
    // Slots are searched over every (pass, direction) pair at once: an earlier pass always beats a
    // later one (nearer, no leader, clear of vessels), then the direction order decides. The slot a
    // label held before wins as long as it still collides with nothing: no label, no dot, and (in a
    // clear pass) no vessel. A fresh slot must keep 3 px of air from vessels, the held one needs none.
    // The width a label reserves only grows (a value ticking from 9.9 to 10.0, or a change gaining a
    // digit, would otherwise tip it to another side of its station and back).
    const place = (it, dirs, gap, leader, clear) => placeMulti(it, dirs, (Array.isArray(gap) ? gap : [gap]).map((g, gi) => ({ gap: g, leader, clear, bias: gi * 6 })));
    // (from, to: only those passes are searched this round; a round that is not final gives up without shortening or dropping.)
    const placeMulti = (it, dirs, passes, from = 0, to = passes.length, final = true, maxShort = final ? 2 : 0) => {
      const prev = prevSol.get(it.key);
      let reslot = false;
      if (!solve) {
        // Carry: the label goes where it was put, relative to the figure point it names.
        if (!prev) { stale = true; return false; }
        if (prev.drop) return false;
        if ((prev.short || prev.abbr) && it.canShort) shortenTo(it, +prev.short || 0, prev.abbr);
        if (prev.one) oneLine(it);
        if (it.w > prev.w + 0.5 || it.h > prev.h + 0.5) { stale = true; return false; }
        const [ax, ay] = worldToLocal(prev.wx, prev.wy);
        it.ax = ax; it.ay = ay; it.au = prev.au; it.dir = prev.dir; it.leader = prev.leader; it.onVessel = !!prev.onv;
        const slack = it.rot ? 0 : prev.w - it.w;
        // (Its gap widened or narrowed with its vessel's width on the screen since it was solved: carried as a solve at this zoom would put it.)
        const dvc = prev.vh != null && it.vw > 0 ? PIN_DIR[prev.dir] : null, dh = dvc ? it.vw / 2 - prev.vh : 0;
        it.x = ax + prev.dx + (prev.dir.includes('W') ? slack : prev.dir.includes('E') ? 0 : slack / 2) + (dvc ? dvc[0] * dh : 0);
        it.y = ay + prev.dy + (dvc ? dvc[1] * dh : 0);
        // (A Circuit reading carried onto a station's ring is solved again: the figure eased a few per cent closer or farther since
        // it was solved, and the reading, kept as far from the middle of its vessel, came onto the station's ring at its end. One
        // the solve itself left on a ring (dot) is carried, or it would be solved again every frame.)
        // (During a hand's zoom it is placed again by itself, below, among the spots beside its station (passes 0-2) it was solved
        // into; one solved further out, onto a vessel, or rescued is solved again with the rest, as before.)
        if (circuit && it.key.startsWith('n:') && !prev.dot && placed.some((p) => p.dot && hits(rectOf(it), p))) {
          if (!carryReslot || prev.onv || !(prev.pi >= 0 && prev.pi < 3) || from !== 0 || to > 3) { stale = true; return false; }
          reslot = true;
          if (!useLines) { useLines = true; buildSegs(); }
        }
        if (!reslot) {
          // (Carried past the usual 5 % by a hand's zoom: a label that would come onto another, or onto a slide's callout, is solved again.)
          const box = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it);   // (a turned caption's box is turned too, as when it was solved)
          if (carryClear && (placed.some((p) => !p.dot && hits(box, p)) || callouts.some((b) => hits(box, b)))) { stale = true; return false; }
          // (At a pinch landing a label that rode past the stage's margins (the view the solve keeps every label inside) is solved again, which
          // puts it back inside with its leader: carried only, it stood half off the screen with its leader coming in from beyond it.)
          if (handRide?.settle) { const vw = viewOf(it); if (box.x0 < vw.x0 - 4 || box.y0 < vw.y0 - 4 || box.x1 > vw.x1 + 4 || box.y1 > vw.y1 + 4) { stale = true; return false; } }
          // At a pinch landing, keep a clear reading where it rode. A newly intersecting vessel needs a fresh placement.
          if (handRide?.settle && circuit && it.key.startsWith('n:') && !prev.onv) {
            if (!useLines) { useLines = true; buildSegs(); }
            if (lineHits(box, 2)) { stale = true; return false; }
          }
          placed.push(box); out.push(it);
          return true;
        }
      }
      // (Not a rescued slot's width (pi -1, below): the reading takes its usual spots at its own width again.)
      const wRes = prev && !prev.drop && prev.pi !== -1 && it.w <= prev.w && it.w > prev.w - 28 ? prev.w : it.w;
      // A turned caption (see renderBlock) takes up a box as wide as its text is tall.
      const probe = it.rot ? { ...it, w: it.h, h: it.w } : { ...it, w: wRes };
      let best = null;
      if (keepSlots && prev && !prev.drop && prev.pi >= from && prev.pi < to && it.w <= prev.w + 0.5 && it.h <= prev.h + 0.5 && !it.point && !/^focus/.test(it.key)) {
        // (Its point too: the one on the figure it was solved at, while that is still on the stage. A vessel's label is anchored at the middle of
        // the part in view, which slides along the vessel as the view pans; held there, the label would move against the figure.)
        const V = viewOf(it), [kx, ky] = worldToLocal(prev.wx, prev.wy), atOld = kx >= V.x0 && kx <= V.x1 && ky >= V.y0 && ky <= V.y1;
        const ax = atOld ? kx : it.ax, ay = atOld ? ky : it.ay;
        const r = rectOf({ ...probe, x: ax + prev.dx, y: ay + prev.dy });
        if (within(r, V) && !placed.some((p) => hits(r, p)) && !obstacles.some((o) => hits(r, o)) && !callouts.some((b) => hits(r, b))
          && !(creditBox && hits(r, creditBox)) && !(useLines && !prev.onv && lineHits(r, 0, true))) {
          best = { cost: 0, dx: prev.dx, dy: prev.dy, r, dir: prev.dir, pi: prev.pi, leader: prev.leader };
          if (atOld) { it.ax = ax; it.ay = ay; if (prev.au != null) it.au = prev.au; }
        }
      }
      if (!best) passes.forEach((ps, pi) => pi >= from && pi < to && (ps.dirs || dirs).forEach((dir, i) => {
        // (A spot on the grid around the station is tried once, not per direction, and only until one is free: the grid runs nearest
        // first. The spot the label held is still tried, so it can hold it.)
        if (ps.skip || (ps.at && (i || (best && !(prev && prev.pi === pi))))) return;
        let dx, dy;
        if (ps.at) { dx = ps.at[0] - probe.w / 2; dy = ps.at[1] - probe.h / 2; } else { const o = offset(dir, probe, ps.gap); dx = o[0]; dy = o[1]; }
        if (ps.shift) { dx += ps.shift[0]; dy += ps.shift[1]; }   // (a slot slid up or down from its compass spot)
        let r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy });
        // (A stent's point past the stage's edge, or the slide's mark beside it, is tried where the last pass would pull it back to, so it
        // is never pushed onto its neighbour.)
        if (it.point || (dop.all && /^focus/.test(it.key))) {
          const cx = Math.max(ptView.x0 - r.x0, Math.min(0, ptView.x1 - r.x1)), cy = Math.max(ptView.y0 - r.y0, Math.min(0, ptView.y1 - r.y1));
          if (cx || cy) { dx += cx; dy += cy; r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy }); }
        }
        if (placed.some((p) => !(it.point && p.probe) && (ps.callGap && p.call ? hits(r, { ...p, x0: p.x0 - ps.callGap, x1: p.x1 + ps.callGap }) : hits(r, p)) && !(ps.overZones && p.zone))) return;
        if (ps.credit && creditBox && hits(r, creditBox)) return;
        // (A stent's point, or the slide's mark beside it, never takes a spot a card covers, where it would only hide: the next spot that
        // shows is better.)
        // (It keeps 4 px off a card: with 10, a point near the card's edge was slid off its dot's line: Review 16 Oct.)
        if ((it.point || (dop.all && /^focus/.test(it.key))) && obstacles.some((o) => !(it.point && o.probe) && hits(r, { x0: o.x0 - 4, y0: o.y0 - 4, x1: o.x1 + 4, y1: o.y1 + 4 }))) return;
        // (A long leader may not run through another label: only boxes clear of its own station count, by 8 px, so a clamp's arrows at
        // the station do not.)
        if (ps.uncrossed && placed.some((p) => !(it.point && p.probe) && (p.lab || !(it.ax >= p.x0 - 8 && it.ax <= p.x1 + 8 && it.ay >= p.y0 - 8 && it.ay <= p.y1 + 8)) && crosses(it.ax, it.ay, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, p))) return;
        // (...nor, the slide's mark's, pass within 18 px of another of the stent's dots: Review 15 Oct.)
        if (markDots && /^focus/.test(it.key) && !ps.loose) {
          const le = leaderEnd(r, it.ax, it.ay), ex = le.x - it.ax, ey = le.y - it.ay, L2 = ex * ex + ey * ey || 1;
          if (markDots.some(([px, py]) => { if (Math.hypot(px - it.ax, py - it.ay) < 4) return false; const t = Math.max(0, Math.min(1, ((px - it.ax) * ex + (py - it.ay) * ey) / L2)); return Math.hypot(px - it.ax - ex * t, py - it.ay - ey * t) < 18; })) return;
          const L = Math.sqrt(L2);
          for (let u = 7; ps.clear && u < L && markArrows.length; u += 1.5) {
            const x = it.ax + (ex * u) / L, y = it.ay + (ey * u) / L;
            for (let ti = 0; ti < markArrows.length; ti++) if (triDist(x, y, markArrows[ti]) < 6) return;
          }
        }
        // (The mark moves with the point sampled, so it holds its spot only while its dot stays put.)
        const moved = dop.all && /^focus/.test(it.key) && prev && Math.hypot(...worldToLocal(prev.wx, prev.wy).map((v, j) => v - (j ? it.ay : it.ax))) > 2;
        const V = viewOf(it), inside = within(r, V), held = !moved && !!prev && !prev.drop && prev.dir === dir && prev.pi === pi && (inside || !within({ x0: it.ax, y0: it.ay, x1: it.ax, y1: it.ay }, V));
        // (edge: px inside the stage it keeps; avoid: drawn shapes (an organ, a lit outline) it keeps off, by pad px.)
        if ((ps.edge && !insideBy(r, V, ps.edge)) || (ps.avoid && !clearOf(r, ps.avoid, ps.pad ?? 0))) return;
        // (fans: the targets of a numbered step's group, V10. Each of its leaders, from its target to the box, runs through no label and
        // crosses no other leader, a group's own included.)
        if (ps.fans) {
          const segs = out.flatMap((o) => [...(o.leader && !o.live ? [(() => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return [o.ax, o.ay, e.x, e.y]; })()] : []), ...(o.fans || []).map(([fx, fy]) => { const e = leaderEnd(rectOf(o), fx, fy); return [fx, fy, e.x, e.y]; })]);
          if (ps.fans.some(([fx, fy]) => {
            const le = leaderEnd(r, fx, fy), L = Math.hypot(le.x - fx, le.y - fy);
            if (segs.some((sg) => segsCross(sg, [fx, fy, le.x, le.y]))) return true;
            for (let u = 6; u < L - 2; u += 3) {
              const px = fx + ((le.x - fx) * u) / L, py = fy + ((le.y - fy) * u) / L;
              if (placed.some((p) => !(it.point && p.probe) && !p.dot && hits({ x0: px - 3, y0: py - 3, x1: px + 3, y1: py + 3 }, p))) return true;
            }
            return false;
          })) return;
        }
        const om = ps.strict ? 10 : 0;
        if ((ps.inView && !inside) || ((ps.inView || ps.strict) && obstacles.some((o) => !(o.zone && ps.strict) && !(it.point && o.probe) && hits(r, { x0: o.x0 - om, y0: o.y0 - om, x1: o.x1 + om, y1: o.y1 + om })))) return;   // (in the free space: inside the stage, 10 px from any card, the margin a hidden label needs to show again)
        let onLine = 0;
        if (useLines) {
          // (A clear pass only asks whether any vessel is in the way. The slide's mark beside a stent's three points keeps 2 px off every
          // vessel as drawn (3 with a pixel to spare; a point's callout 4, its halo included), and its leader 2 px off every vessel but
          // its stent: Review 15-16 Oct.)
          const mk = dop.all && /^focus/.test(it.key);
          if (ps.clear) { if (ps.pad != null ? lineHits(r, ps.pad, true) : mk ? lineHits(r, 3, true) : it.point ? lineHits(r, 4, true) : held ? lineHits(r, 0, true) : lineHits(r, 3, true)) return; } else onLine = lineHits(r, 0);
          if (mk && dop.id && lineHits(r, 3, { only: dop.id })) return;   // (and in any pass, 2 px off its own stent as drawn)
          // (A reading out on a ring is joined to its station by a leader: one that would cross a vessel or a label is no use.)
          // A reading moving off its vessel or rescued (passes from 3 on, and the rescue's: strict) keeps 4 px from every other
          // reading, off every other station's ring and every other reading's leader, and its own leader, if it is far enough out
          // to have one, crosses no reading or leader.
          if (ps.inView || ps.strict) {
            // (Nor on another station's ring, where that reading's leader starts.)
            // (A rescued one keeps off its own ring too.)
            if ((ps.strict || ps.resc) && rings.some((o) => (o !== it || ps.resc) && o.ax > r.x0 - 7 && o.ax < r.x1 + 7 && o.ay > r.y0 - 7 && o.ay < r.y1 + 7)) return;
            // (No reading sits on another's leader: 2 px clear of its halo.)
            const others = out.filter((o) => o !== it && o.leader && !o.live).map((o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return [o.ax, o.ay, e.x, e.y]; });
            if (others.some((sg) => segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, ps.strict || ps.resc ? 5 : 2))) return;
            if (ps.inView && placed.some((p) => !(it.point && p.probe) && !p.dot && hits(r, { x0: p.x0 - 4, y0: p.y0 - 4, x1: p.x1 + 4, y1: p.y1 + 4 }))) return;
            const le = leaderEnd(r, it.ax, it.ay), ex = le.x, ey = le.y, L = Math.hypot(ex - it.ax, ey - it.ay);
            const gapPx = Math.hypot(Math.max(r.x0 - it.ax, 0, it.ax - r.x1), Math.max(r.y0 - it.ay, 0, it.ay - r.y1));
            if (gapPx > 10) {
              if (others.some((sg) => segsCross(sg, [it.ax, it.ay, ex, ey]))) return;
              // (A zone title's column that the station itself stands at the edge of (VAR beside "Portal veins" on a phone) does not
              // stop its leader: it starts there.)
              const own = (p) => p.zone && it.ax > p.x0 - 4 && it.ax < p.x1 + 4 && it.ay > p.y0 - 4 && it.ay < p.y1 + 4;
              for (let u = ps.strict || ps.resc ? 0 : 8, q = ps.strict || ps.resc ? 3 : 2; u < L - 2; u += ps.strict || ps.resc ? 2 : 3) {   // (rescued: from its station's ring on, the ring too kept clear)
                const px = it.ax + ((ex - it.ax) * u) / L, py = it.ay + ((ey - it.ay) * u) / L, pr = { x0: px - q, y0: py - q, x1: px + q, y1: py + q };
                if ((ps.ring === 'clean' && lineHits(pr, 0)) || placed.some((p) => !(it.point && p.probe) && !p.dot && !own(p) && hits(pr, p))) return;   // (a leader may pass a station's dot, never a reading)
              }
            }
          } else if (circuit && it.key.startsWith('n:')) {
            // (Beside its station too (passes 0-2), a Circuit reading sits on no other reading's leader, and where it stands far
            // enough out to take a leader (past 18 px: see below), its leader runs through no reading: on a sideways iPad, IVC's
            // leader had run through RA's.)
            const others = out.filter((o) => o !== it && o.leader && !o.live).map((o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; });
            if (others.some((sg) => segHitsBox(sg, r, 2))) return;
            const gapPx = Math.hypot(Math.max(r.x0 - it.ax, 0, it.ax - r.x1), Math.max(r.y0 - it.ay, 0, it.ay - r.y1));
            if (gapPx > 18) {
              const le = leaderEnd(r, it.ax, it.ay), L = Math.hypot(le.x - it.ax, le.y - it.ay);
              for (let u = 8; u < L - 2; u += 3) {
                const px = it.ax + ((le.x - it.ax) * u) / L, py = it.ay + ((le.y - it.ay) * u) / L;
                if (placed.some((p) => !(it.point && p.probe) && !p.dot && !p.zone && hits({ x0: px - 2, y0: py - 2, x1: px + 2, y1: py + 2 }, p))) return;
              }
            }
          }
          if (ps.clear && mk && ps.lead) {
            const le = leaderEnd(r, it.ax, it.ay), L = Math.hypot(le.x - it.ax, le.y - it.ay);
            for (let u = 12; u < L; u += 3) {
              const x = it.ax + ((le.x - it.ax) * u) / L, y = it.ay + ((le.y - it.ay) * u) / L;
              if (lineHits({ x0: x, y0: y, x1: x, y1: y }, 2, dop.id)) return;
            }
          }
        }
        // (A clear pass may share its tier with others, and then the spot nearest its dot wins among them, whatever its direction.)
        // (A stent's point holds its spot only against others of the same pass: a slot it was slid to, while a card opened or the
        // figure moved, never outranks a level one that is free again: Review 16 Oct.)
        const near = ps.tier != null && ps.clear ? Math.hypot((r.x0 + r.x1) / 2 - it.ax, (r.y0 + r.y1) / 2 - it.ay) * 10 : 0;
        const cost = (ps.tier ?? pi) * 1e4 + (inside ? 0 : 2e3) + (ps.clear ? 0 : onLine * 12) + i + near + (ps.bias || 0) - (held ? (ps.clear ? (it.point && it.col ? 5e3 : 1e5) : 4) : 0);
        if (!best || cost < best.cost) best = { cost, dx, dy, r, dir, pi, leader: ps.leader, onLine: ps.clear ? 0 : onLine };
      }));
      // (Placed again by itself mid-gesture: a spot that would want what only a whole solve does (shortening, a rescue, moving off a
      // vessel, room clear of a slide's callout) has the readings solved again together, as before.)
      // (Mohammad, 4 Nov: "when there is no room we shouldn't have labels covering like portal vein and structures completely".) A station's label that could only be
      // placed over a vessel does not cover it: it takes its abbreviation first, then drops its unit and change, and where it still has no room it is left out. A label the
      // reader asked for (selected, or named by a slide) is the exception and keeps its spot.)
      if (best && best.onLine > 0 && it.key.startsWith('n:') && !it.sel && !st.presenting && !(it.node === 'HA' && it.abbr)) best = null;   // (the hepatic artery always shows: once it reads "HA" it keeps its spot)
      if (reslot && (!best || lineHits(best.r, 2) || callouts.some((b) => hits(best.r, b)))) { stale = true; return false; }
      if (!best) {
        // No room with the value: try it without its units and change, then the name alone (up to maxShort), before giving the label up.
        // (A reading with no unit left to drop goes straight to the name alone: where that is more than this round allows (a rescue's
        // maxShort 1), it is put back whole, so the rescue's later tries, the one line among them, still keep its number.)
        if (it.canShort && (it.short || 0) < maxShort) {
          const whole = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr };
          if (shortenItem(it)) { if ((it.short || 0) <= maxShort) return placeMulti(it, dirs, passes, from, to, final, maxShort); Object.assign(it, whole); }
        }
        if (!final) return false;
        nextSol.set(it.key, { drop: true }); return false;
      }
      // The text hugs the station side of its reserved box.
      const slack = it.rot ? 0 : wRes - it.w, dir = best.dir;
      it.x = it.ax + best.dx + (dir.includes('W') ? slack : dir.includes('E') ? 0 : slack / 2);
      it.y = it.ay + best.dy; it.dir = dir;
      // A leader line shows only when the label sits clearly away from its station (label-place.js needsLeader: on past 12 px, off below 8).
      const rr = best.r, gapPx = Math.hypot(Math.max(rr.x0 - it.ax, 0, it.ax - rr.x1), Math.max(rr.y0 - it.ay, 0, it.ay - rr.y1));
      const lead = needsLeader(it.cls === 'organ', gapPx, prev?.lead);
      it.leader = !!best.leader || lead;
      localWorldXY(it.ax, it.ay);
      nextSol.set(it.key, { wx: LW_XY[0], wy: LW_XY[1], dx: best.dx, dy: best.dy, dir, pi: best.pi, w: wRes, h: it.h, leader: it.leader, lead, short: it.short || 0, abbr: !!it.abbr, au: it.au, vh: it.vw > 0 ? it.vw / 2 : null });
      it._r = best.r; placed.push(best.r); out.push(it);
      // (Within 3 px of a vessel it takes the solid halo, as a solved one does.)
      if (reslot) { it.onVessel = lineHits(best.r, 3) > 0; nextSol.get(it.key).onv = it.onVessel; reslotted = true; }
      return true;
    };

    if (!circuit) {
      // ── Anatomy ──
      // The FibroScan probe is screen furniture on the liver: no label sits on it or on the reading shown on its body.
      const tip = scanTipLocal();
      if (tip) placed.push({ x0: tip.tx - 74, y0: tip.y - 74, x1: tip.tx + 12, y1: tip.y + 12 });   // the probe and the reading on its body
      const lvl = st.labelLevel || 'key', zoomed = zoomedIn();
      // A presenter slide names exactly the stations it talks about (store.presentLabels).
      const pres = st.presenting && Array.isArray(st.presentLabels) ? st.presentLabels : null;
      const show = new Set(pres || (lvl === 'none' ? [] : lvl === 'key' && !zoomed ? [...KEY_NODES, ...flagged(f)] : CHIP_NODES));
      // No varices, no varices callout: in a healthy patient the node's pressure is just the balance
      // between the coronary vein and the azygos, and a "varices" label on it would mislead.
      if (!hasVarices('VAR', f)) show.delete('VAR');
      if (!pres && lvl !== 'none' && hasVarices('GV', f)) show.add('GV');
      // The hepatic artery is named at every size and zoom (a plain label, not an optional one): it takes a leader out to the upper right
      // where it has no room beside its vessel, and it is the last of the named stations to give way.
      if (!pres && lvl !== 'none') show.add('HA');
      if (pres && !hasVarices('GV', f)) show.delete('GV');
      // Key, at the home framing on a wide screen: the other major stations too, but only where one fits
      // beside its vessel without a leader (see `minor` below); a phone keeps to the key ones.
      const minor = new Set(!pres && lvl === 'key' && !zoomed && !compact ? CHIP_NODES.filter((id) => !show.has(id) && id !== 'VAR') : []);
      for (const id of minor) show.add(id);
      if (st.selection?.type === 'node') { show.add(st.selection.id); minor.delete(st.selection.id); }
      const [lx] = worldToLocal(ATLAS_COLUMNS[0], 500), [rx] = worldToLocal(ATLAS_COLUMNS[1], 500);
      const colW = 150;
      // Pressures sit beside their vessels at every size (no margin columns with long leaders).
      const atlas = false;
      const items = [];
      for (const id of show) {
        if (!NODE_POS[id] || labelHidden(id)) continue;
        const { ax, ay, mid, w: vw } = labelAnchor(id, t);
        const it = nodeItem(id, f, atlas ? 'atlas' : 'inline', compact);
        it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = it.sel ? 100 : minor.has(id) ? 1 : ANAT_PRI[id] || 5;
        it.minor = minor.has(id);
        if (it.minor) it.canShort = false;   // an optional label shows whole or not at all
        it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
        items.push(it);
      }
      // A TIPS or DIPS shunt gets its own callout: the velocity through it (cm/s), as Doppler reads it.
      for (const sid of ['TIPS', 'DIPS']) {
        if (stentReady(sid, f) && EI[sid] >= 0 && dop.all && dop.id === sid && geo[sid]?.cur?.length > 1) {
          // (A slide that reads the stent at its three points calls out all three, each at its own third, in a column beside their
          // dots, before the slide's mark, which finds its place around them.)
          const vw = labelAnchor(sid, t).w;
          for (const point of ['proximal', 'mid', 'distal']) {
            const [ax, ay] = worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[point]));
            const it = velItem(sid, f, point);
            it.ax = ax; it.ay = ay; it.vw = vw * CTM.sc; it.pri = 8; it.side = 'R'; it.col = ptSide; it.colGap = colGap(sid);
            it.canShort = false; it.point = true;   // (a point's name without its number says nothing: whole, or not at all)
            // (Where a point finds no room in its column, the narrowing's jet tries the spots farther out first.)
            const pp = f.viewParams || st.params;
            it.jet = (pp.stenosis?.[sid] || 0) > 0 && stentSite(pp, sid) === point;
            it.later = false;
            items.push(it);
          }
        } else if (stentReady(sid, f) && EI[sid] >= 0) {
          let { ax, ay, mid, w: vw } = labelAnchor(sid, t);
          // (While the Doppler samples this stent, the callout points at the third its gate reads, where the stent glows.)
          if (dop.id === sid && dop.seg && geo[sid]?.cur?.length > 1) [ax, ay] = worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[dop.seg]));
          // (Its stent out of the frame, no callout: "TIPS 80 cm/s" stood alone at the stomach view's edge, Ten years 16, 31 Oct.)
          if (!within({ x0: ax, y0: ay, x1: ax, y1: ay }, view)) continue;
          const it = velItem(sid, f);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = 9; it.side = 'R';
          items.push(it);
        }
      }
      // Zoomed in, the other stations in view get their pressure too (hepatic veins, portal branches,
      // the left sinusoids...), each only where it stands clear of the labels already there, so they
      // appear as the zoom makes room and the overview stays uncluttered.
      if (!atlas && !pres && lvl !== 'none' && (vt.k > 1.35 || zoomed || lvl === 'all')) {
        const room = compact ? 64 : 80;
        for (const id of ANAT_EXTRA) {
          if (show.has(id) || !NODE_POS[id] || !(NI[id] >= 0) || labelHidden(id)) continue;
          const { ax, ay, mid, w: vw } = labelAnchor(id, t);
          if (items.some((o) => Math.hypot(o.ax - ax, o.ay - ay) < room)) continue;
          const it = nodeItem(id, f, 'inline', compact);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = ANAT_PRI[id] || 4;
          it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
          items.push(it);
        }
      }
      if (atlas) {
        for (const side of ['L', 'R']) {
          const col = items.filter((it) => it.side === side).sort((a, b) => a.ay - b.ay);
          const cx0 = side === 'L' ? lx - colW : rx, cx1 = side === 'L' ? lx : rx + colW;
          let top = 10, bottom = H - 10;
          for (const b of blockers) {
            if (b.x1 < cx0 || b.x0 > cx1) continue;
            if (b.y0 < H / 2) top = Math.max(top, b.y1 + 8); else bottom = Math.min(bottom, b.y0 - 8);
          }
          const gap = 8;
          const need = col.reduce((sum, it) => sum + it.h + gap, 0);
          if (bottom - top < need) { top = 10; bottom = Math.max(top + need, H - 10); }
          for (let i = 0; i < col.length; i++) col[i].y = Math.max(col[i].ay - col[i].h / 2, i ? col[i - 1].y + col[i - 1].h + gap : top);
          for (let i = col.length - 1; i >= 0; i--) col[i].y = Math.min(col[i].y, i < col.length - 1 ? col[i + 1].y - col[i].h - gap : bottom - col[i].h);
          const elbow = side === 'L' ? lx + 12 : rx - 12;
          for (const it of col) {
            it.x = side === 'L' ? lx - 8 - it.w : rx + 8;
            // A floating card over the column hides the labels it covers rather than sitting on them.
            if (blockers.some((b) => hits(rectOf(it), b))) continue;
            it.align = side === 'L' ? 'end' : 'start';
            // Left column: the line starts at the label's left edge, under the text, so it never ends at the right.
            const ly = side === 'L' ? it.y + it.h : it.y + Math.min(it.h / 2, 16);
            const x0 = side === 'L' ? it.x : rx + 4;
            leaders.push({ k: 'al:' + it.key, tag: 'path', at: { class: `leader${it.sel ? ' hl' : ''}`, d: `M${x0.toFixed(1)} ${ly.toFixed(1)} L${elbow.toFixed(1)} ${ly.toFixed(1)} L${it.ax.toFixed(1)} ${it.ay.toFixed(1)}` } },
              { k: 'ad:' + it.key, tag: 'circle', at: { class: 'leader-dot', cx: it.ax.toFixed(1), cy: it.ay.toFixed(1), r: '2.4' } });
            it.fixedLead = true;   // (its leader is drawn here, from where it stands now: it never glides away from it)
            placed.push(rectOf(it));
            out.push(it);
          }
        }
      } else {
        // Inline: dots on the anatomy, labels nearby with short leaders, most important first.
        buildLines();
        for (const it of items) placed.push({ x0: it.ax - 4, y0: it.ay - 4, x1: it.ax + 4, y1: it.ay + 4 });
        for (const it of items.sort((a, b) => b.pri - a.pri)) {
          if (solve && sliceOver()) yield;
          it.align = 'start';
          if (it.later) { later.push(it); continue; }
          // (A stent's point: in its column, level with its dot (Review 15 Oct), a little farther out first (16 px at most) to clear its
          // narrowing's clamp, off the vessels where it can be; slid up or down only where its neighbour leaves no room level.)
          const COL = [0, -6, 6, -12, 12, -18, 18];
          // (The jet's dot has its narrowing's arrows beside it: level just past the arrow before sliding off its dot's line.)
          const level = [...new Set([it.colGap, 12, 14, 16, ...(it.jet ? [20, 24, 28, 32, 36, 40] : [])].filter((g) => g >= it.colGap))];
          const lv = (credit) => [true, false].flatMap((clear) => level.map((gap) => ({ gap, leader: true, clear, credit })));
          const sh = (credit) => [true, false].flatMap((clear) => COL.slice(1).map((y) => ({ gap: it.colGap, leader: true, clear, credit, shift: [0, y] })));
          if (it.point && it.col && placeMulti(it, [it.col], [...lv(true), ...lv(false), ...sh(true), ...sh(false)])) continue;
          const dirs = it.side === 'L' ? ['NW', 'W', 'SW', 'N', 'S', 'NE', 'E', 'SE'] : ['NE', 'E', 'SE', 'N', 'S', 'NW', 'W', 'SW'];
          // Prefer a spot touching no vessel at all, near first; only then accept one that crosses a vessel.
          const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
          if (it.minor) { placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }]); continue; }
          if (placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, { gap: near, leader: false }, { gap: far, leader: true }])) continue;
          // (A sampled stent point, or the jet, with no room by its third tries again farther out, once the slide's mark has its place.)
          if (it.point) { later.unshift(it); continue; }
          if (it.sel) { place(it, ['C'], 0, false) || (out.push(Object.assign(it, { x: it.ax + 8, y: it.ay - it.h / 2 })), true); }
        }
      }
      // Organ names: fixed in their organ, dropped where a label needs the room. Where a drawn vessel runs under the spot (STOMACH under the
      // splenic vein, the K of KIDNEY on the colon's vein, iPad portrait Ascites 5), the name takes the nearest other spot of its own organ
      // that no vessel touches (organ-names.js), and only with none left stays where it was; the vessels never move.
      if (st.layers.labels && t < 0.3) {
        for (const [txt, x, y] of ORGAN_LABELS) {
          if (solve && sliceOver()) yield;
          const [ax, ay] = worldToLocal(x, y);
          const up = txt.toUpperCase();
          // (RIGHT ATRIUM stands on two lines: on one it is wider than the heart's room between the cava that runs up its left side and the
          // varices at its right, so it lay on the cava whatever its spot. Mac and iPhone, decompensated cirrhosis, 1 Nov.)
          const it = { key: 'o:' + txt, cls: 'organ', lines: up.split(NAME_BREAK.has(txt) ? ' ' : '\u0000').map((t) => [{ t, size: 9.5, weight: 600, cls: 'lb-organ', track: 0.06 }]), align: 'middle', padX: 2, padY: 1, ax, ay };
          it.w = Math.max(...it.lines.map(lineW)); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0);
          const spot = { gap: 0, leader: false, clear: true };
          placeMulti(it, ['C'], [spot, ...nameSpots(txt).map(([sx, sy]) => { const [bx, by] = worldToLocal(sx, sy); return { ...spot, at: [bx - ax, by - ay] }; }), { gap: 0, leader: false }]);
        }
      }
    } else {
      // ── Circuit: zone titles, then stations by priority, then resistances ──
      // Turned upright, a direction given on the map (N, E, ...) points somewhere else on the screen.
      const turned = rotU > 0.5, dirOf = (d) => (turned ? TURN_DIR[d] : d);
      // (A title keeps the place it had if it still fits in the visible part of its band (sticky: a small pan never nudges it); else it takes the
      // middle of that part. Kept as a screen coordinate along the band's axis (c) with the band's own key.)
      const zoneKeep = (key, lo, hi, mid, tn, other) => { const p = zoneStick.get(key), q = p ? worldToLocal(p[0], p[1]) : null, k = q ? q[tn ? 1 : 0] : NaN, c = k >= lo && k <= hi ? k : Math.min(hi, Math.max(lo, mid)); zoneStick.set(key, localToWorld(tn ? other : c, tn ? c : other)); return c; };
      for (const [txt, x0, x1] of CIRCUIT_ZONES) {
        const [a, ay0] = worldToLocal(x0, 60), [b, by] = worldToLocal(x1, 60);
        // The liver's and the heart's titles open their cards (there is no organ to click in the circuit).
        const organ = { 'Liver · sinusoids': 'liver', Heart: 'heart' }[txt];
        const it = { key: 'z:' + txt, cls: organ ? 'zonecap link' : 'zonecap', lines: [[{ t: txt, size: 10.5, weight: 650, cls: 'lb-zone' }]], align: 'middle', padX: 2, padY: 2 };
        if (organ) {
          it.onClick = () => onSelect({ type: 'organ', id: organ });
          it.label = `${txt}: open its card`; it.hit = true;
          it.sel = st.selection?.type === 'organ' && st.selection.id === organ;
        }
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // A zone title is a plain figure label (option C, zone-titles-recs.md): world-anchored at the spot the layout gives it, so it moves
        // rigidly with the figure through every pan, pinch and zoom. It is placed again, over the visible part of its band, only at rest.
        const zoneAt = (x, y) => { it.ax = x; it.ay = y; const bx = it.rot ? it.h : it.w, by2 = it.rot ? it.w : it.h; it.x = x - bx / 2; it.y = y - by2 / 2; return rectOf({ ...it, x: it.x, y: it.y, w: bx, h: by2 }); };
        // A narrow zone (a zoomed-out circuit, or large text) takes a shorter title rather than none; one that
        // still does not fit its band is left out rather than run into its neighbour's.
        // (At rest the title is set over the VISIBLE part of its band, not the band's whole width: a band panned half off the screen, or
        // zoomed past it, keeps its title in view. The full or short text is picked by that visible width. Option C, zone-titles-recs.md.)
        const v0 = turned ? Math.max(Math.min(ay0, by), 6) : Math.max(a, 6), v1 = turned ? Math.min(Math.max(ay0, by), H - 6) : Math.min(b, W - 6);
        const span = v1 - v0;
        for (const alt of ZONE_SHORT[txt] || []) {
          if (span > it.w + 6) break;
          it.lines = [[{ ...it.lines[0][0], t: alt }]]; it.w = lineW(it.lines[0]);
        }
        if (turned) {
          if (span <= it.w + 6) continue;
          // Upright, a zone is a horizontal band: its title runs up the map's left edge (text turned to read
          // bottom to top), centred on the band.
          it.rot = true;
          // (On a slide the readings keep out of the whole title column, not just the title's box: 17 Oct design review.)
          if (solve) { const zb = zoneAt((a + b) / 2, (v0 + v1) / 2); placed.push(st.presenting ? { x0: -1e4, y0: Math.min(ay0, by), x1: zb.x1 + 2, y1: Math.max(ay0, by), zone: true } : { ...zb, zone: true }); }
          const zx = Math.max(it.h / 2 + 8, (a + b) / 2), zlo = v0 + it.w / 2 + 3, zhi = v1 - it.w / 2 - 3;
          const zc = zoneKeep(it.key, zlo, zhi, (v0 + v1) / 2, true, zx), zr = zoneAt(zx, zc);
          // (It may slide along its band: see the last pass.)
          it._slide = { at: (c) => zoneAt(zx, c), c: zc, lo: zlo, hi: zhi };
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o)) && !callouts.some((o) => hits(zr, o))) { out.push(it); obstacles.push({ ...zr, zone: true, key: it.key }); it._zr = zr; }
          continue;
        }
        if (b - a > it.w + 6) {
          // (On a slide the readings keep out of the whole header row over the zone, not just the title's box: a reading and its
          // leader had crossed "Portal veins", and the resistances had sat in the row: 17 Oct design review.)
          if (solve) { const zb = zoneAt((v0 + v1) / 2, by), y1 = Math.max(zb.y1, zoneAt((v0 + v1) / 2, Math.max(14, by)).y1); placed.push(st.presenting ? { x0: a, y0: -1e4, x1: b, y1: y1 + 2, zone: true } : { ...zb, zone: true }); }
          const zy = Math.max(14, by), zlo = v0 + it.w / 2 + 3, zhi = v1 - it.w / 2 - 3;
          const zc = zoneKeep(it.key, zlo, zhi, (v0 + v1) / 2, false, zy), zr = zoneAt(zc, zy);
          it._slide = { at: (c) => zoneAt(c, zy), c: zc, lo: zlo, hi: zhi };
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o)) && !callouts.some((o) => hits(zr, o))) { out.push(it); obstacles.push({ ...zr, zone: true, key: it.key }); it._zr = zr; }
        }
      }
      // The resistors' readings (label-gl figure labels at their zigzags, resItem): placed straight, not solved; their boxes are kept clear by the stations after.
      if (sites.list && t >= 0.5) {
        for (const k of ['rGut', 'rColl', 'rLiver']) {
          if (!sites.list.includes(k)) continue;
          const it = resItem(k);
          if (!it || !resPlace(it)) continue;
          out.push(it); placed.push({ ...rectOf(it), res: true });
        }
      }
      buildLines();
      // (A station's ring, 4 px round, stays clear of every reading's halo by 2 px. The halo widens with the text (styles/app.css,
      // #labels .lb.inline.bare text: 4 px a unit of --lbk; 7 px on a vessel, .on-vessel), and only the 3 px beside the words
      // (padX) leave less room than the line's own space above and below them, so the room kept to either side of the ring grows
      // with it: on an upright iPad, LHV's halo had covered its ring.)
      const ringR = 5, ringRX = 3.5 + Math.max(2 * labelK, 3.5);
      // The liver's stations show when zoomed in on it or when one is selected (there is no box to open them).
      const open = liverExpanded();
      const nodes = [], flagC = flagged(f);
      for (const n of NODES) {
        if (!hasDot.has(n.id) || !CIRCUIT_LABELS[n.id]) continue;
        if (!nodeVisible(n.id) || labelHidden(n.id)) continue;
        if ((n.id === 'VAR' || n.id === 'GV') && !hasVarices(n.id, f)) continue;
        if (!open && n.id !== 'HA' && LIVER_INNER.has(n.id) && !(st.selection?.type === 'node' && st.selection.id === n.id)) continue;   // (the hepatic artery's caption stays: it sits between the lobes, not in a lobe)
        // Levels of detail: none shows only a selected station; key, zoomed out, the major ones (and the flagged).
        const isSel = st.selection?.type === 'node' && st.selection.id === n.id, lvlC = st.labelLevel || 'key';
        if (!isSel && (lvlC === 'none' || (lvlC === 'key' && !zoomedIn() && CIRCUIT_LABELS[n.id].pri < (compact ? 8 : 5) && n.id !== 'HA' && !flagC.includes(n.id)))) continue;
        const { ax, ay, mid, tan, w: vw } = labelAnchor(n.id, t);
        // The station dot stays where it is; a callout on a vessel also keeps clear of its own marker.
        const [sx, sy] = worldToLocal(...nodePos(n.id, t));
        placed.push({ x0: sx - ringRX, y0: sy - ringR, x1: sx + ringRX, y1: sy + ringR, dot: true }); ringXY.push([sx, sy, ringRX]);
        if (mid) placed.push({ x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4, dot: true });
        const it = nodeItem(n.id, f, 'station', compact);
        it.align = 'middle'; it.ax = ax; it.ay = ay; it.mid = mid; it.tan = tan; it.vw = vw * CTM.sc; it.pri = it.sel ? 100 : CIRCUIT_LABELS[n.id].pri;
        nodes.push(it);
      }
      // (Every other dot keeps clear of the readings too: a station whose reading is left out at this level of detail, or has none, still
      // has its dot, and a reading had sat on it: the colon bed's, under the spleen's.)
      const labelled = new Set(nodes.map((it) => it.node));
      for (const d of bareDots(NODES.filter((n) => hasDot.has(n.id)), { labelled, shown: nodeVisible, at: (id) => worldToLocal(...nodePos(id, t)), scale: CTM.sc, minX: ringRX, minY: ringR })) {
        placed.push({ ...d.box, dot: true }); ringXY.push([d.x, d.y, ringRX]);
      }
      // Stations by priority, each beside its station: level with it first (beside a vertical run, over a horizontal one).
      // A minor station gives way rather than sit on a vessel or crowd its neighbours.
      const plan = nodes.sort((a, b) => b.pri - a.pri).map((it) => {
        const pref = it.mid ? (Math.abs(it.tan[0]) >= Math.abs(it.tan[1]) ? ['N', 'S'] : ['E', 'W']) : CIRCUIT_LABELS[it.node].dirs.map(dirOf);
        const dirs = [...pref, ...['N', 'S', 'E', 'W', 'NE', 'SE', 'NW', 'SW'].filter((d) => !pref.includes(d))];
        const half = it.vw / 2, minor = it.pri <= 4 && !it.sel, fine = [7, 12, 18, 24, 30, 36].map((g) => g + half), ring = [44, 54, 64, 76].map((g) => g + half);
        // (passes 0-2: beside the station, as always; from 3 on: a reading on a vessel looks for a clear spot, below)
        const passes = [...[7, 18, 30].map((g) => ({ gap: g + half, clear: minor })),
          ...fine.map((gap) => ({ gap, dirs: pref, clear: true, inView: true })), ...fine.map((gap) => ({ gap, clear: true, inView: true })),
          ...ring.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'clean', clear: true, inView: true })), ...ring.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'any', clear: true, inView: true }))].map((ps) => ({ ...ps, leader: false }));
        return { it, dirs, passes, half };
      });
      rings = plan.map(({ it }) => it);
      // As they were (v2): each beside its station, shortened, or given up, where there is no room.
      for (const { it, dirs, passes, half } of plan) {
        if (solve && sliceOver()) yield;
        it._full = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr };   // (its whole form, for the rescue below)
        if (!placeMulti(it, dirs, passes, 0, 3) && it.sel) place(it, dirs, 40 + half, true);
      }
      // Then a reading that sits on a vessel moves to the nearest clear spot, the others staying where they are: beside its
      // station, else a little further out with a short leader (one that crosses no vessel first, then one that crosses no
      // label or leader); with no clear spot near it stays where it was, its halo solid and no flow arrowhead under it
      // (onVessel: renderBlock, noChevBoxes). (A nearer spot on a vessel used to beat a clear one a little further out:
      // "7.8 mmHg" ran into the portal trunk, "4.1" sat on the liver's zigzag, and RA's "mmHg" on its branch.)
      // (A spot outside the free space counts too: the reading is later pulled back into view, onto whatever is there.)
      // (All of them leave their spots first, so a reading moving out is not blocked by one that is about to move too.)
      // (So does one under a card, which the card would hide.)
      const onVessel = solve && useLines ? plan.filter(({ it }) => it._r && out.includes(it) && (lineHits(it._r, 2) || !within(it._r, view) || obstacles.some((o) => !o.zone && hits(it._r, o)))) : [];
      // (Each keeps its old spot reserved until it finds a new one, so one that finds none keeps it.)
      for (const { it } of onVessel) { it._keep = { x: it.x, y: it.y, dir: it.dir, leader: it.leader, sol: nextSol.get(it.key) }; it._r.old = true; out.splice(out.indexOf(it), 1); }
      for (const { it, dirs, passes } of onVessel) {
        if (solve && sliceOver()) yield;
        const r0 = it._r;
        placed.splice(placed.indexOf(r0), 1);
        if (placeMulti(it, dirs, passes, 3, passes.length, false)) continue;
        const k = it._keep;
        const onv = lineHits(r0, 2) > 0;
        Object.assign(it, { x: k.x, y: k.y, dir: k.dir, leader: k.leader, _r: r0, onVessel: onv }); nextSol.set(it.key, { ...k.sol, onv }); placed.push(r0); out.push(it);
      }
      // Last, a reading given up or left without its value is rescued, the others staying where they are: whole (else without
      // its units and change) in the nearest free spot further out, with a leader; else a little further out than its usual
      // spots, on a vessel if it must (with the solid halo); else over a zone's title, which then moves along its band or,
      // with no room there, gives way (see the last pass). Kept 12 px from a callout's row (a lone "Splenic v." 7 px after
      // "R liver ×1.0" read as one line). With no room at all it stays as it was.
      // (Readings already hidden or without their value leave their spots first, as on a vessel above, so a rescue's leader may
      // cross where they were: RA under a phone's data card has room only past IVC's name. One of them that then finds no room
      // goes back to its spot where that is still free, else is given up: it showed no value there either.)
      const rescueOf = [];
      const segOf = (o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; };
      const free = (r) => !placed.some((p) => !p.dot && hits(r, p)) && !out.some((o) => o.leader && !o.live && segHitsBox(segOf(o), r, 2));
      if (solve && useLines) for (const e of plan) {
        const { it } = e, shown = out.includes(it);
        // (Also one under a card or callout, which would hide it.)
        // (And one over a station's ring, its own included: a halo there hides the ring.)
        // (And one outside the free space, which the pull below would set down on whatever is there.)
        const atRisk = shown && it._r && (!within(it._r, view) || obstacles.some((o) => !o.zone && hits(it._r, o)) || rings.some((o) => o.ax > it._r.x0 - 7 && o.ax < it._r.x1 + 7 && o.ay > it._r.y0 - 7 && o.ay < it._r.y1 + 7));
        if (it.sel || (shown && (it.short || 0) < 2 && !atRisk) || !it._full || (it._full.short || 0) >= 2) continue;
        const was = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr, x: it.x, y: it.y, dir: it.dir, leader: it.leader, _r: it._r, sol: nextSol.get(it.key) };
        const early = shown && (it.short || 0) >= 2;   // (a name without its value: off its spot from the start)
        if (early) { out.splice(out.indexOf(it), 1); placed.splice(placed.indexOf(it._r), 1); }
        rescueOf.push({ e, was, shown, early });
      }
      for (const { e: { it, dirs, passes, half }, was, shown, early } of rescueOf) {
        if (solve && sliceOver()) yield;
        if (shown && !early) { out.splice(out.indexOf(it), 1); placed.splice(placed.indexOf(it._r), 1); }
        // (Then further out still, on rings 90 to 118 px round: a station at the edge of the free space, RA under a phone's data card,
        // has no clear spot nearer.)
        const outer = [90, 104, 118].map((g) => g + half);
        const far = [...passes.slice(3), ...outer.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'clean', clear: true, inView: true })), ...outer.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'any', clear: true, inView: true }))].map((ps) => ({ ...ps, callGap: 12, resc: true }));
        const near = [...passes.slice(0, 3), { gap: passes[2].gap + 10 }, { gap: passes[2].gap + 18 }].map((ps) => ({ ...ps, clear: false, strict: true, inView: true, callGap: 12, resc: true }));
        // (Then out on the same rings over a vessel, with the solid halo: on a phone the free space round VAR is all vessels, and
        // nearer than the rings there is no room.)
        const farOn = far.map((ps) => ({ ...ps, clear: false, ring: 'any' }));
        // (Each try is a pass over every spot of its rings: the solve yields between tries, so a slice of the change between the views is never
        // one whole rescue. Entering the Circuit zoomed out, most readings come here, and a rescue in one go held each frame of the change for
        // tens of ms: 5 fps on the way into the Circuit, 60 on the way out. Same tries, same order, same answer.)
        let ok = false;
        const tries1 = [far, near, farOn, near.map((ps) => ({ ...ps, overZones: true }))];
        for (let ti = 0; ti < tries1.length && !ok; ti++) {
          if (solve && sliceOver()) yield;
          const R = tries1[ti];
          Object.assign(it, { lines: it._full.lines, w: it._full.w, h: it._full.h, short: it._full.short, abbr: it._full.abbr, one: false });   // (whole again for each try)
          ok = placeMulti(it, dirs, R, 0, R.length, false, 1);
        }
        if (!ok) {
          const tries2 = [far, near, farOn, far.map((ps) => ({ ...ps, overZones: true })), near.map((ps) => ({ ...ps, overZones: true }))];
          for (let sh = 0; sh < 2 && !ok; sh++) for (let ti = 0; ti < tries2.length && !ok; ti++) {
            if (solve && sliceOver()) yield;
            const R = tries2[ti];
            // (Else on one line, name then value (then without its units): a station at the top of the free space, RA under a phone's
            // data card, has room beside it only for a reading one line tall.)
            Object.assign(it, { lines: it._full.lines, w: it._full.w, h: it._full.h, short: it._full.short, abbr: it._full.abbr, one: false });
            if (sh && !((it.short || 0) < 1 && shortenItem(it, false) && it.short === 1)) continue;
            oneLine(it);
            ok = !!it.one && placeMulti(it, [...dirs, 'EL', 'WL'], R, 0, R.length, false, it.short || 0);
          }
        }
        // (Its slot is not one of the usual passes': marked so the next layout does not take it for one held there.)
        if (ok) { it.onVessel = lineHits(it._r, 2) > 0; const sol = nextSol.get(it.key); if (sol) { sol.onv = it.onVessel; sol.pi = -1; sol.one = !!it.one; } continue; }
        Object.assign(it, { lines: was.lines, w: was.w, h: was.h, short: was.short, abbr: was.abbr, x: was.x, y: was.y, dir: was.dir, leader: was.leader, _r: was._r, one: false });
        if (was.sol) nextSol.set(it.key, was.sol);
        if (shown && (!early || free(was._r))) { out.push(it); placed.push(was._r); } else if (shown) nextSol.set(it.key, { drop: true });
      }
      // Any reading left touching a vessel (within 3 px) takes the solid halo.
      if (solve && useLines) for (const { it } of plan) if (out.includes(it) && it._r && !it.onVessel && lineHits(it._r, 3)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      // (And any left on a station's ring is marked, so the next frames carry it rather than solve again: see placeMulti.)
      if (solve) for (const { it } of plan) { const sol = nextSol.get(it.key); if (sol && !sol.drop && out.includes(it) && placed.some((p) => p.dot && p !== it._r && hits(rectOf(it), p))) sol.dot = true; }
      // One unit rule for the whole circuit (17 Oct design review): where any reading had to drop its unit for room, every reading
      // shows its number alone ("Gut bed 21.1" had stood beside "SMV 18.7 mmHg"). Each one only narrows, toward its station, so it
      // runs into nothing it had cleared; its slot keeps the width it reserved, so the next frames carry it unchanged.
      if (solve) {
        const shown = plan.map(({ it }) => it).filter((it) => out.includes(it) && it.canShort);
        const bare = (l) => l.some((r) => r.cls === 'lb-val') && l.some((r, i) => i && r.cls !== 'lb-val' && r.cls !== 'lb-name');
        if (shown.some((it) => it.short === 1)) for (const it of shown) {
          if (it.short) continue;
          const w0 = it.w;
          if (it.one && bare(it.lines[0])) { it.lines = [it.lines[0].filter((r, i) => !i || r.cls === 'lb-val')]; it.w = lineW(it.lines[0]); it.short = 1; }
          else if (!it.one && it.lines.length === 2 && bare([it.lines[0][0], ...it.lines[1]])) shortenItem(it, false);
          else continue;
          const dw = w0 - it.w;
          it.x += it.dir?.includes('W') ? dw : it.dir?.includes('E') ? 0 : dw / 2;
          const sol = nextSol.get(it.key);
          if (sol && !sol.drop) sol.short = 1;
        }
      }
      // Tidy (3 Nov 2026, "leaders crossing vessels"): a reading whose leader runs through a vessel, whose leader is long, or whose words
      // sit on a vessel moves to the best spot within 120 px that has none of those faults: the least leader first, clear of every
      // other reading, ring, card and leader, its own leader through no reading, no leader and no vessel but the one it starts on.
      // A reading hung from the middle of its vessel may also slide its dot along the vessel (a fifth or so each way, a few px of cost
      // for each step), so its words can stand in the room beside another stretch of it. A reading with no better spot stays where it is.
      // (Solved once and recorded, like the rescue above, so a carry holds it.)
      if (solve && useLines) {
        const TIDY_LONG = 60, TIDY_GAPS = [7, 12, 18, 25, 33, 42, 52, 64, 78, 94, 112], TIDY_R = [24, 33, 42, 52, 64, 78, 94, 112], SLIDE = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        const boxAt = (it, x, y) => ({ x0: x - it.padX, y0: y - it.padY, x1: x + it.w + it.padX, y1: y + it.h + it.padY });   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        // (How many readings' words and other leaders a reading's leader, from (ax, ay) to its words in `r`, runs through; `lines`: the others' leaders.)
        const runsThrough = (it, le, ax, ay, lines, r) => {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          let n = 0;
          for (const p of placed) if (!p.dot && p !== it._r && !(ax >= p.x0 - 8 && ax <= p.x1 + 8 && ay >= p.y0 - 8 && ay <= p.y1 + 8) && crosses(ax, ay, le.x, le.y, p)) n++;
          for (const sg of lines) if (Math.hypot(sg[0] - ax, sg[1] - ay) > 4 && segsCross(sg, [ax, ay, le.x, le.y])) n++;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          for (const sg of lines) if (segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, 1)) n++;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          return n;
        };
        const faults = (it, r, pass, ax, ay, lines) => {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          const le = leaderEnd(leadRectOf(it, r.x0 + it.padX, r.y0 + it.padY, ax, ay), ax, ay, 2), len = Math.hypot(le.x - ax, le.y - ay), drawn = len > 10;
          const vh = drawn ? leaderVesselHits(segIdx, ax, ay, le.x, le.y, 1) : 0, onv = lineHits(r, 2) > 0, xr = drawn ? runsThrough(it, le, ax, ay, lines, r) : 0;
          return { len, drawn, vh, onv, xr, le, cost: (drawn ? len : 0) + Math.min(vh, 3) * 600 + xr * 1500 + (onv ? 300 : 0) + pass };   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        };
        const othersLeaders = (it) => out.filter((o) => o !== it && o.key.startsWith('n:') && !o.live && !o.hide).map((o) => { const e = leaderEnd(leadRectOf(o, o.x, o.y, o.ax, o.ay), o.ax, o.ay, 2); return Math.hypot(e.x - o.ax, e.y - o.ay) > 10 ? [o.ax, o.ay, e.x, e.y] : null; }).filter(Boolean);   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        for (const { it, dirs } of [...plan, ...plan]) {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          if (!out.includes(it) || !it._r) continue;
          if (solve && sliceOver()) yield;
          const lines = othersLeaders(it), now = faults(it, it._r, 0, it.ax, it.ay, lines);
          if (!now.vh && !now.onv && !now.xr && now.len <= TIDY_LONG) continue;
          const old = it._r, was = { ax: it.ax, ay: it.ay, sol: nextSol.get(it.key) };   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          placed.splice(placed.indexOf(old), 1);
          const dotAt = it.mid ? placed.find((p) => p.dot && p.x0 === it.ax - 4 && p.y1 === it.ay + 4 && p.x1 === it.ax + 4) : null;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          if (dotAt) placed.splice(placed.indexOf(dotAt), 1);
          const eid = it.mid ? LABEL_VESSEL[it.node] : null, P = eid && geo[eid]?.cur;
          const anchors = P?.length > 1 ? SLIDE.map((u) => { if (u === 0.5) return [it.ax, it.ay, 0, it.au ?? 0.5]; const m = arcMid(P, u), [x, y] = worldToLocal(m[0], m[1]); return [x, y, Math.abs(u - 0.5) * 50, u]; }) : [[it.ax, it.ay, 0, it.au ?? 0.5]];   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          let best = null;
          for (const [ax, ay, slide, au] of anchors) {
            if (solve && sliceOver()) yield;   // (each of the reading's eleven anchors is 216 spots: a slice ends between them)
            const dot = it.mid ? { x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4 } : null;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
            let rank = 0;
            const tryAt = (dir, gap, pass) => {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              const [dx, dy] = offset(dir, it, gap), r = boxAt(it, ax + dx, ay + dy);
              if (!within(r, view)) return;
              // (The box tests first: they are cheap and reject most spots, and faults() walks every leader and vessel. The same spots pass.)
              if (dot && hits(r, dot)) return;
              if (placed.some((p) => (p.dot ? hits(r, p) : hits(r, { x0: p.x0 - 3, y0: p.y0 - 3, x1: p.x1 + 3, y1: p.y1 + 3 })))) return;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              if (obstacles.some((o) => !o.zone && hits(r, { x0: o.x0 - 10, y0: o.y0 - 10, x1: o.x1 + 10, y1: o.y1 + 10 }))) return;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              if (lines.some((sg) => segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, 3))) return;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              const f = faults(it, r, pass + slide, ax, ay, lines);
              if (f.cost >= now.cost - 1 || (best && f.cost >= best.f.cost)) return;
              best = { f, dx, dy, dir, r, ax, ay, au, dot };   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
            };
            for (const gap of TIDY_GAPS) for (const dir of ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']) tryAt(dir, gap + it.vw / 2, (rank++ % 8) * 0.01 + dirs.indexOf(dir) * 2);   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
            for (const gap of TIDY_R) for (const dir of RING_DIRS) tryAt(dir, gap + it.vw / 2, 8 + (rank++ % 16) * 0.01);
          }
          if (!best) { placed.push(old); if (dotAt) placed.push(dotAt); continue; }
          it.ax = best.ax; it.ay = best.ay; it.au = best.au;   // (au: how far along its vessel the point slid, 0.5 its middle: what the GPU pins the label to)
          it.x = it.ax + best.dx; it.y = it.ay + best.dy; it.dir = best.dir; it.leader = best.f.drawn; it.onVessel = best.f.onv; it._r = best.r;
          placed.push(best.r);
          if (best.dot) placed.push({ ...best.dot, dot: true });   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          const sol = was.sol;
          if (sol) { const [wx, wy] = localToWorld(it.ax, it.ay); nextSol.set(it.key, { ...sol, wx, wy, dx: best.dx, dy: best.dy, dir: best.dir, pi: -1, w: it.w, h: it.h, leader: best.f.drawn, lead: best.f.drawn, onv: best.f.onv, dot: false, au: best.au }); }   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        }
      }
      // Collateral and shunt lanes, captioned along their run.
      for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
        if (solve && sliceOver()) yield;
        const x = E[id];
        if (!x?.vis || x.ghost || labelHidden(id)) continue;
        const it = { key: 'lane:' + id, cls: 'lane', lines: [[{ t: cap, size: 10, weight: 550, cls: 'lb-lane' }]], align: 'middle', padX: 2, padY: 1, ax: 0, ay: 0 };
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // Turned upright, a lane that runs up the screen is captioned along it (text turned to read bottom to top), beside it.
        const at = (u) => { const [lx, ly] = pointAt(geo[id].cur, u); [it.ax, it.ay] = worldToLocal(lx, ly); };
        let vertical = false;
        if (turned) {
          at(laneU[id]);
          const [bx, by] = worldToLocal(...pointAt(geo[id].cur, Math.min(1, laneU[id] + 0.03)));
          vertical = Math.abs(by - it.ay) > Math.abs(bx - it.ax) * 1.2;
        }
        if (vertical) it.rot = true;
        const dirs = vertical ? ['E', 'W'] : [dirOf('N'), dirOf('S')], gaps = [3 + (x.width || 4) / 2, 12 + (x.width || 4) / 2];
        // Try the spots along the lane that no other vessel touches, then settle for the first.
        const spots = [laneU[id], ...(laneAlt[id] || [])];
        // Failing that, the caption rides on its own lane (never on another line).
        if (!spots.some((u) => { at(u); return place(it, dirs, gaps, false, true); })) { at(laneU[id]); place(it, ['C'], 0, false); }
      }
    }
    // (Beside a stent's column of three points the slide's mark keeps off the whole column, the gaps between its callouts included, so
    // the three read as one block in order.)
    if (solve && ptSide) {
      const col = out.filter((o) => o.point).map(rectOf);
      if (col.length > 1) placed.push({ x0: Math.min(...col.map((r) => r.x0)), y0: Math.min(...col.map((r) => r.y0)), x1: Math.max(...col.map((r) => r.x1)), y1: Math.max(...col.map((r) => r.y1)) });
    }
    // Boxes round what a procedure draws, in the stage's px (see the step callout below): the catheter's route as far as the tip has
    // gone, as wide as its balloon, and the vessel the step names, as wide as it is drawn or will be.
    const pinAvoid = (id) => {
      const out = [], box = (q, R) => {
        const [x, y] = worldToLocal(q[0], q[1]), [x2, y2] = worldToLocal(q[0] + R, q[1]), w = Math.hypot(x2 - x, y2 - y) + 3;
        out.push({ x0: x - w, y0: y - w, x1: x + w, y1: y + w });
      };
      const r = cath.st && cath.route, P = geo[id]?.cur;
      if (r) for (let j = 0; j < r.pts.length; j += 2) if (r.cum[j] >= procIn(r)) box(r.pts[j], (r.rad[j] || 2) * 1.4);
      const R = Math.max(E[id]?.width || 0, id === 'TIPS' ? cathRadOf('PVH_R', 0.5) * 1.6 : 0, 4) * 0.7;
      if (P?.length) for (let j = 0; j <= 48; j++) box(pointAt(P, j / 48), R);
      return out;
    };
    // Focus callout
    const foc = st.focus;
    for (const [i, m] of (foc ? foc.marks || [foc] : []).entries()) {
      if (solve && sliceOver()) yield;
      // (ghost: a procedure's step may name a vessel it has not opened yet, the tract before the stent; f: where along it.)
      if (!m.edges?.length || !E[m.edges[0]] || !(E[m.edges[0]].vis || (m.ghost && geo[m.edges[0]]?.cur?.length)) || (i && !m.label)) continue;
      // (A mark on one third of a stent points at that third.)
      const segAt = m.f ?? (m.seg && isStent(EDGES[EI[m.edges[0]]]) ? STENT_SITES[stentGate(m.seg, f.viewParams || st.params, m.edges[0])] : 0.5);
      const [x, y] = pointAt(geo[m.edges[0]].cur, segAt);
      const [ax, ay] = worldToLocal(x, y);
      const key = i || m.kind ? `focus${i}${m.kind || ''}` : 'focus', cls = 'focus' + (m.kind ? ` k-${m.kind}` : '');
      // (A mark whose words carry live readings, deck visuals V8: its words come from the slide's callouts, filled as the model moves.)
      const lk = `${m.edges[0]}|${m.kind || 'block'}`, lv = fx?.live?.[lk];
      const it = lv ? fxPill(key, lv, cls, m.kind === 'note') : { key, cls, lines: [[{ t: m.label || 'Here', size: 11.5, weight: 650, cls: 'lb-focus' }]], align: 'start', bg: true, padX: 8, padY: 4 };
      Object.assign(it, { mk: m.kind, ax, ay });
      if (lv) { it.src = ['fx', key]; fxBuild.set(key, () => fx?.live?.[lk] && fxPill(key, fx.live[lk], cls, m.kind === 'note')); }
      else { it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); }
      // (A free mark stands by itself, with no leader: it names a group of vessels, so a line to the first would single it out.)
      const gap = 18 + (E[m.edges[0]].width || 4);
      // (Beside a stent called out at all three points the mark may stand a little farther off, on a leader that crosses no label.)
      // (...off the vessels first, even where that takes the credit's corner (the credit finds another), then clear of the credit;
      // each spot also nudged 8 or 16 px each way, so a pill that would touch a vessel by a pixel or two slides clear; its leader crosses
      // no label, the "60 %" included, and at each reach it first tries for a leader over no vessel (past the dot's own junction): a
      // short leader beats a long clean one; within a reach, the spot nearest the dot, nudged or not: Review 15 Oct.)
      const NUDGE = [[0, 0], [-8, 0], [0, 8], [8, 0], [0, -8], [-16, 0], [0, 16], [16, 0], [0, -16]];
      // (Where no such spot is off the vessels, any spot within 150 px that is, nearest first, before one over a vessel: Review 16 Oct.)
      const reach = (clear) => [true, false].flatMap((credit) => [gap, gap + 20, gap + 52, gap + 84, gap + 120].flatMap((g) => (clear ? [true, false] : [false]).map((lead) => ({ gap: g, leader: true, uncrossed: true, clear, lead, credit }))));
      const passes = dop.all && [...reach(true), { grid: true }, ...reach(false)].flatMap((ps, tier) => (ps.grid ? MARK_GRID.map((at) => ({ at, gap: 0, leader: true, uncrossed: true, clear: true, tier })) : NUDGE.map((shift) => ({ ...ps, shift, tier }))));
      // (A mark with live readings (package F) keeps its side as its numbers and the vessels under it change: its side first, a little
      // farther out if need be, before it tries another.)
      // (So does a treatment's step callout (pin): it names the vessel the step works on and stays on its side through the steps.)
      const side = (lv || m.pin) && !dop.all && prevSol.get(it.key);
      // (Its pill also touches nothing drawn: 6 px clear of every vessel, a varix's strands and glow included, and 12 px inside the stage.
      // So does a step callout, on a short leader, farther out where the close-up's vessels are wide: his ask, 29 Oct, the
      // "Sclerosant" pill covered the shunt.)
      // (A step callout also keeps off what the procedure draws, which the vessels' lines do not hold: the catheter and its balloon
      // on their route, and the vessel it names, drawn or not yet (the tract and its balloon): his ask, 29 Oct, "Tract dilated" sat on
      // the tract. Where no spot is clear of the vessels too, it still keeps off those.)
      const av = m.pin ? pinAvoid(m.edges[0]) : undefined;
      const tidy = (lv || m.pin) && !dop.all ? [gap, gap + 14, gap + 30, gap + 50, ...(m.pin ? [gap + 80, gap + 120, gap + 170] : [])].map((g) => ({ gap: g, leader: true, clear: true, inView: true, pad: 6, edge: 12, avoid: av }))
        .concat(m.pin ? [gap, gap + 30, gap + 80, gap + 140].map((g) => ({ gap: g, leader: true, inView: true, pad: 6, edge: 12, avoid: av })) : []) : null;
      if (tidy) buildLines();
      let marked = dop.all ? placeMulti(it, FAR_DIRS, passes) : (tidy && ((side && !side.drop && placeMulti(it, [side.dir], tidy)) || placeMulti(it, ['E', 'W', 'NE', 'SE', 'N', 'S', 'NW', 'SW'], tidy))) || (side && !side.drop && place(it, [side.dir], [gap, gap + 16, gap + 32], true)) || place(it, ['E', 'W', 'NE', 'SE', 'N', 'S'], gap, true);
      // (A mark that found no spot off the vessels, where the column's "60 %" blocks its way: the "60 %" tries its next spots off the
      // vessels, nearest first, and keeps the first that lets the mark stand clear; failing all, both stay as they were: Review 16 Oct.)
      if (marked && dop.all && clampAlts.length && clampAlts[0].el._box && placed.includes(clampAlts[0].el._box) && !passes[nextSol.get(it.key)?.pi]?.clear) {
        const el = clampAlts[0].el, keep = clampD.get(el._c.id), old = el._box, at = placed.indexOf(old), clearOnly = passes.map((ps) => (ps.clear ? ps : { ...ps, skip: true }));
        placed.pop(); out.pop();
        let freed = false;
        for (const a of clampAlts) {
          clampD.set(el._c.id, { d: a.d, t: a.t }); clampLabelAt(el);
          const b = boxOfEl(el, 6);
          if (!b || placed.some((p, j) => j !== at && hits(b, p))) continue;
          placed[at] = el._box = { ...b, lab: true };
          if (placeMulti(it, FAR_DIRS, clearOnly)) { freed = true; break; }
        }
        if (!freed) { clampD.set(el._c.id, keep); clampLabelAt(el); placed[at] = el._box = old; marked = placeMulti(it, FAR_DIRS, passes); }
      }
      // (Where no spot is off the vessels (a phone with the monitor open), the pill takes the one over the fewest, and a ring in the
      // stage's colour keeps them 2 px off its edge, as the column's halo does for its callouts: Review 16 Oct.)
      // (Nothing of the column hides: a mark with no spot under those rules takes one whose leader may cross a label or pass near
      // another dot, still off the cards, the labels and its own stent: Review 16 Oct.)
      if (!marked && dop.all) marked = placeMulti(it, FAR_DIRS, passes.map((ps) => (ps.clear ? { ...ps, skip: true } : { ...ps, uncrossed: false, loose: true })));
      const sol = marked && dop.all ? nextSol.get(it.key) : null;
      if (sol && solve) sol.ring = !passes[sol.pi]?.clear && useLines && lineHits(rectOf(it), 3) > 0;   // (only where a vessel comes within reach)
      if (sol?.ring) it.cls += ' ring';
      if (marked && !m.free) it.focusLeader = true;
      it.free = !!m.free;
    }
    // Deck visuals, package F (ext-callouts.js): the slide's marks on organs, its calipers' readings and its steps' numbers on the
    // anatomy, its brackets' readings on the circuit. Each keeps off the vessels where it can, as the stations' readings do.
    if (fx) {
      // (Each set of spots first in the free space only, inside the stage and off the cards, then anywhere.)
      const k = CTM.sc, roomy = (passes) => [...passes.map((ps) => ({ ...ps, inView: true })), ...passes];
      const nearFar = (near) => roomy([{ gap: near, leader: false, clear: true }, { gap: near + 16, leader: true, clear: true }, { gap: near, leader: false }, { gap: near + 16, leader: true }]);
      // A reading's pill touches nothing drawn: 5 px clear of every vessel as drawn (and the lines' boxes), of `avoid` (an organ),
      // and 12 px inside the stage, nearest first, on a short leader once it stands off; only where no such spot is left, the old
      // passes (it never vanishes).
      const clean = (near, avoid, rest) => [...[0, 10, 22, 36, 54, 78].map((d) => ({ gap: near + d, leader: d > 0, clear: true, inView: true, pad: 5, edge: 12, avoid })), ...rest];
      const organBox = (id) => { const a = organAnchor(id, (f.slow?.spleen ?? 11) / 11); if (!a) return null; const [x0, y0] = worldToLocal(a.at[0] - a.half[0], a.at[1] - a.half[1]), [x1, y1] = worldToLocal(a.at[0] + a.half[0], a.at[1] + a.half[1]); return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }; };
      if (!circuit) fx.organs.forEach((m, i) => {
        // A mark on an organ: off the organ's box, on a leader to its middle (the spleen's box grows with it).
        const a = organAnchor(m.organ, (f.slow?.spleen ?? 11) / 11);
        if (!a || (m.organ !== 'ascites' && !organEls[m.organ]) || (m.organ === 'spleen' && (f.viewParams || st.params)?.splenicRx === 2)) return;
        const key = `focusO${i}`, cls = `focus k-${m.kind}`, it = fxPill(key, m, cls, m.kind === 'note');
        const [ax, ay] = worldToLocal(...a.at), gx = a.half[0] * k + 12, gy = a.half[1] * k + 12, gd = Math.min(gx, gy);
        Object.assign(it, { mk: m.kind, ax, ay, src: ['fx', key] });
        fxBuild.set(key, () => fx?.organs?.[i] && fxPill(key, fx.organs[i], cls, m.kind === 'note'));
        const passes = roomy([true, false].flatMap((clear) => [0, 24, 56].flatMap((d) => [{ dirs: ['E', 'W'], gap: gx + d, leader: true, clear }, { dirs: ['N', 'S'], gap: gy + d, leader: true, clear }, { dirs: ['NE', 'SE', 'NW', 'SW'], gap: gd + d, leader: true, clear }])));
        const ob = m.organ !== 'ascites' && organBox(m.organ), av = ob ? [ob] : undefined;
        const tidy = [0, 24, 56].flatMap((d) => [{ dirs: ['E', 'W'], gap: gx + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }, { dirs: ['N', 'S'], gap: gy + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }, { dirs: ['NE', 'SE', 'NW', 'SW'], gap: gd + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }]);
        buildLines();
        if (placeMulti(it, [], [...tidy, ...passes])) it.focusLeader = true;
      });
      if (!circuit) fx.calipers.forEach((c) => {
        // A caliper's reading at the line's middle, never an end: beside the middle where there is room, square to the line and 5 px
        // clear of it, its ticks, every vessel and the stage's edge (inside an organ it measures, as the spleen's); where there is no
        // room (across a narrow stent), called out on a leader from the middle, off the organ, as the slide's other callouts are.
        const g = caliperAt(c, f);
        if (!g) return;
        const [p0, p1] = [worldToLocal(...g.a), worldToLocal(...g.b)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        const key = 'fxc:' + c.id, it = fxPill(key, c, 'fx-cal', true);
        Object.assign(it, { ax: mid[0], ay: mid[1], src: ['fx', key] });
        fxBuild.set(key, () => { const n = fx?.calipers?.find((x) => x.id === c.id); return n && fxPill(key, n, 'fx-cal', true); });
        buildLines();
        const ob = c.organ && organBox(c.organ), av = ob ? [ob] : undefined;
        const beside = [11, 16].map((gap) => ({ gap, leader: false, clear: true, inView: true, pad: 5, edge: 12 }));
        const out = [24, 36, 52, 72, 96].map((gap) => ({ gap, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }));
        placeMulti(it, besideLine(p0, p1), [...beside, ...out, ...nearFar(24)]);
      });
      if (fx.steps) for (const g of stepGroups(slideGlow.filter((x) => E[x.id]?.vis), fx.steps)) {
        // A step's number by the middle of its vessel (the first of its vessels drawn), or on its organ, lit as its glow lights (V10).
        let ax, ay, near, fans = null;
        if (g.organ) {
          const a = !circuit && organEls[g.organ] && organAnchor(g.organ, (f.slow?.spleen ?? 11) / 11);
          if (!a) continue;
          [ax, ay] = worldToLocal(...a.at); near = 4;
        } else {
          const ids = g.ids.filter((x) => geo[x]?.cur?.length > 1 && !E[x].ghost);
          if (!ids.length) continue;
          // (A vein that fades out of its organ (TIP_FADE) is aimed at in the middle of its solid stretch, not at its middle, which is faint.)
          const mids = ids.map((x) => worldToLocal(...arcMid(geo[x].cur, TIP_FADE[x] > 0.5 ? (1 + TIP_FADE[x]) / 2 : 0.5)));
          // (A group's number stands between its vessels, on a leader to the middle of each: fans.)
          if (g.group && mids.length > 1) { fans = mids; ax = mids.reduce((a, p) => a + p[0], 0) / mids.length; ay = mids.reduce((a, p) => a + p[1], 0) / mids.length; near = 4; }
          else { [ax, ay] = mids[0]; near = 4 + ((E[ids[0]].width || 4) * k) / 2; }
        }
        const it = { key: 'fxs:' + g.n, cls: 'fx-step', lines: [[{ t: String(g.n), size: 11.5, weight: 750, cls: 'lb-step' }]], align: 'middle', bg: true, chip: true, padX: 5, padY: 2, ax, ay, pri: 20, delay: g.at, free: true, label: `Step ${g.n}` };   // (free: no dot on the vessel, only a leader when it stands off)
        it.h = LINE_H(it.lines[0]); it.w = Math.max(lineW(it.lines[0]), it.h - 4);
        buildLines();
        // (A group's spots keep its leaders clear first; where none does, it takes the usual ones, so the number never vanishes.)
        if (fans) it.fans = fans;
        placeMulti(it, ['NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W'], fans ? [...nearFar(near).map((ps) => ({ ...ps, fans })), ...nearFar(24).map((ps) => ({ ...ps, fans })), ...nearFar(near)] : nearFar(near));
      }
      if (circuit) fx.spans.forEach((sp, i) => {
        // A bracket's reading, under its middle (above it where the stage ends first).
        const at = spanOf(sp.from, sp.to, fxK());
        if (!at) return;
        // (Turned upright on a phone, the bracket runs down the circuit's right side, where one line of words has no room: the reading
        // then takes two, its words over its number.)
        const turned = rotU > 0.5, D = (d) => (turned ? TURN_DIR[d] : d), split = turned;
        const [ax, ay] = worldToLocal((at.x0 + at.x1) / 2, at.y), key = 'fxb:' + i, it = fxPill(key, sp, 'fx-span', true, split);
        Object.assign(it, { ax, ay, src: ['fx', key] });
        buildLines();
        fxBuild.set(key, () => fx?.spans?.[i] && fxPill(key, fx.spans[i], 'fx-span', true, split));
        // Under the bracket on a leader, kept inside the stage 12 px from its edges and off every vessel; then beside it.
        // (Turned upright there is no room beside the bracket: the reading stands past its lower end instead, on a leader.)
        if (turned) { const [ex, ey] = worldToLocal(at.x0, at.y); it.ax = ex; it.ay = ey; }
        const order = turned ? ['S', 'SW', 'SE', 'W', 'E'] : [D('S'), D('SE'), D('SW'), D('E'), D('W')];
        placeMulti(it, order, clean(18, undefined, roomy([{ gap: 18, leader: true, clear: true }, { gap: 40, leader: true, clear: true }, { gap: 18, leader: true }])));
      });
    }
    // A stent's other two points, where they fit around the sampled point's callout and the slide's mark: off the vessels if they can.
    later.sort((a, b) => (b.pri - a.pri) || (b.jet - a.jet));
    for (const it of later) {
      if (solve && sliceOver()) yield;
      const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
      placeMulti(it, ['NE', 'E', 'SE', 'NW', 'W', 'SW', 'N', 'S'], [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, { gap: near, leader: false }, { gap: far, leader: true }])
        || placeMulti(it, FAR_DIRS, [{ gap: far + 12, leader: true, uncrossed: true }, { gap: far + 48, leader: true, uncrossed: true }])
        || placeMulti(it, FAR_DIRS, SLID(far));
    }
    if (stale) return false;
    if (solve && sliceOver()) yield;   // (the page's part below runs whole, in a slice of its own)
    if (solve) { labelSolSpare = labelSol; labelSol = nextSol; }
    if (dry) return true;
    // (The stations' rings, and the readings given up for want of room with where their stations are, for the browser checks:
    // tests/e2e/smoke.mjs. Written at every layout, a carried one too: written only when solved, they lagged behind a pan since,
    // and a reading carried with its ring looked to stand on where the ring had been.)
    const at = new Map(out.concat(rings).map((o) => [o.key, o]));
    const ringsAt = ringXY.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
    if (gLabels.dataset.rings !== ringsAt) gLabels.dataset.rings = ringsAt;
    const droppedAt = [...labelSol].filter(([k, v]) => v.drop && k.startsWith('n:')).map(([k]) => { const o = at.get(k); return `${k.slice(2)}@${o ? `${Math.round(o.ax)},${Math.round(o.ay)}` : ''}`; }).join(' ');
    if (gLabels.dataset.dropped !== droppedAt) gLabels.dataset.dropped = droppedAt;
    // Which labels show this frame. A slot never moves for a screen-fixed obstacle: a label whose box a
    // panel, card or title covers (or that has panned off the stage) is hidden, and shown again once it is
    // clear of the obstacle by a margin, so it cannot flicker at the edge. A selected label always shows.
    const stage = { x0: 0, y0: 0, x1: W, y1: H };
    // (A Circuit reading that the pull below would set on a station's ring, its own included, where its halo would hide the ring,
    // slides the least it needs instead, any way within 120 px: into the free space, onto no other reading as they will stand, its
    // leader through none of them and none of theirs through it. Failing that it is pulled in as before.)
    const ringPull = new Map();   // (what the ring pass below slid a reading by: part of the screen's edge pull, not of its slot)
    if (circuit && ringXY.length) {
      const ns = out.filter((o) => o.key.startsWith('n:') && !o.live && o.ax >= -8 && o.ax <= W + 8 && o.ay >= -8 && o.ay <= H + 8);
      const pull = new Map(ns.map((o) => { const e = rectOf(o), V = viewOf(o); return [o, [Math.max(V.x0 - e.x0, Math.min(0, V.x1 - e.x1)), Math.max(V.y0 - e.y0, Math.min(0, V.y1 - e.y1))]]; }));
      const pulledBox = (o) => { const [cx, cy] = pull.get(o); return rectOf({ ...o, x: o.x + cx, y: o.y + cy }); };
      const onRing = (r) => ringXY.some(([x, y, rx]) => x > r.x0 - rx && x < r.x1 + rx && y > r.y0 - 5 && y < r.y1 + 5);
      for (const it of ns) {
        const [cx, cy] = pull.get(it);
        if ((!cx && !cy) || !onRing(pulledBox(it))) continue;
        const near = ns.filter((o) => o !== it), others = near.map(pulledBox), V = viewOf(it);
        const lines = near.filter((o) => o.leader || Math.hypot(...pull.get(o)) > 2).map((o) => { const r = pulledBox(o), e = leaderEnd(r, o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; });
        const step = PULL_GRID.find(([dx, dy]) => {
          const r = rectOf({ ...it, x: it.x + cx + dx, y: it.y + cy + dy });
          if (!within(r, V) || onRing(r) || others.some((o) => hits(r, o)) || lines.some((sg) => segHitsBox(sg, r, 2))) return false;
          const e = leaderEnd(r, it.ax, it.ay), sg = { x0: it.ax, y0: it.ay, x1: e.x, y1: e.y };
          return !others.some((o) => segHitsBox(sg, o, 2));
        });
        if (!step) continue;
        it.x += cx + step[0]; it.y += cy + step[1]; it.leader = true; pull.set(it, [0, 0]); ringPull.set(it, [cx + step[0], cy + step[1]]);
        if (solve && useLines && lineHits(rectOf(it), 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }   // (on a vessel: the solid halo)
      }
    }
    for (const it of out) {
      // (How far the stage's edge pulled this label in from its slot: the glide eases the slot, never this, which is fixed to the screen.)
      const rp = ringPull.get(it);
      it.px = rp ? rp[0] : 0; it.py = rp ? rp[1] : 0;
      if (it.live) { it.hide = false; continue; }
      // A label a pan has pushed over the stage edge is pulled back inside (with a leader to its station)
      // so it is never cut off; once its station has left the stage the label goes too.
      // (A caption turned upright takes its box turned too: pulled in by its unturned box, one beside the right edge slid left across the lanes.)
      const edge = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it), V = viewOf(it);
      // An organ's name is pinned inside its organ: where a card or the stage edge covers it, it hides with the organ, never slides.
      // (Shown, it hides as a card first touches it; hidden, it comes back only once 10 px clear of the card as of the stage's edge, so a card
      // easing at its edge cannot flick it on and off.)
      if (it.cls === 'organ') { const was = labelVis.get(it.key) !== false, m = was ? 0 : 10, grown = { x0: edge.x0 - m, y0: edge.y0 - m, x1: edge.x1 + m, y1: edge.y1 + m }; it.hide = !within(grown, V) || obstacles.some((o) => hits(grown, o)); labelVis.set(it.key, !it.hide); continue; }
      const cx = Math.max(V.x0 - edge.x0, Math.min(0, V.x1 - edge.x1)), cy = Math.max(V.y0 - edge.y0, Math.min(0, V.y1 - edge.y1));
      if (cx || cy) { it.x += cx; it.y += cy; it.px += cx; it.py += cy; if (Math.hypot(cx, cy) > 2 && !it.key.startsWith('z:')) it.leader = true; }
      // (A reading pulled in onto a vessel takes the solid halo there too.)
      if ((cx || cy) && solve && useLines && it.key.startsWith('n:') && lineHits(rectOf(it), 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      if (!it.sel && (it.ax < -8 || it.ax > W + 8 || it.ay < -8 || it.ay > H + 8)) { it.hide = true; labelVis.set(it.key, false); continue; }
      if (it.sel) { it.hide = false; continue; }
      const r = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it), was = labelVis.get(it.key) !== false, m = was ? 0 : it.point || (dop.all && /^focus/.test(it.key)) ? 4 : 10;   // (a turned caption: its box turned too; a stent's point or its mark was placed 4 px off the cards)
      // A zone title is a label too: a reading is never hidden by one (the overlap pass below settles any
      // clash, and a reading outranks a zone title); other labels give way to it only where they truly overlap.
      it.hide = !hits(r, stage) || obstacles.some((o) => !(it.point && o.probe) && (o.zone ? !it.key.startsWith('n:') && o.key !== it.key && hits(r, o) : hits(r, { x0: o.x0 - m, y0: o.y0 - m, x1: o.x1 + m, y1: o.y1 + m })));
      // (A stent's point, or the slide's mark beside it, that the figure's move carried under a card is placed again rather than hidden
      // (nothing of the column hides: Review 16 Oct); at most every quarter second, so a card still easing cannot keep it searching.)
      if (it.hide && !solve && dop.all && (it.point || /^focus/.test(it.key)) && performance.now() - colResolve > 250) { colResolve = performance.now(); return false; }
      labelVis.set(it.key, !it.hide);
    }
    // Last pass: no two labels showing may overlap. A pan can pull a label in from the stage edge onto
    // another, and carried slots are not searched again. The more important label keeps its place; the
    // other drops its value and, if that is not enough, hides until there is room.
    const rank = (it) => (it.sel ? 1e3 : it.key.startsWith('focus') ? 900 : it.cls === 'organ' ? 0 : it.cls === 'lane' ? 1 : it.key.startsWith('z:') && !it.sel ? 1.5 : (it.pri ?? 2) + 2);
    const kept = [];
    // A caption turned upright takes its box turned too (it cannot shorten, so it hides when crowded).
    const boxOf = (it) => (it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it));
    // (A label this pass hid at the last layout comes back only with 4 px to spare, so two labels sliding past each other in a pan, a zoom
    // or a glide cannot flick the lesser on and off: 2 Nov.)
    const lapWas = lapHid, crowded = (it, r) => { const p = lapWas.has(it.key) ? 4 : 0; return kept.some((k) => hits({ x0: r.x0 - p, y0: r.y0 - p, x1: r.x1 + p, y1: r.y1 + p }, k)); };
    lapHid = new Set();
    for (const it of out.filter((o) => !o.hide && !o.live).sort((a, b) => rank(b) - rank(a))) {
      let r = boxOf(it);
      if (it.rot) { if (!it.sel && crowded(it, r)) { it.hide = true; lapHid.add(it.key); continue; } kept.push(r); continue; }
      if (crowded(it, r)) {
        const d = it.dir || '';
        for (let w0 = it.w, h0 = it.h; it.canShort && kept.some((k) => hits(r, k)) && shortenItem(it); w0 = it.w, h0 = it.h) {
          it.x += d.includes('W') ? w0 - it.w : d.includes('E') ? 0 : (w0 - it.w) / 2;
          it.y += d.includes('N') ? h0 - it.h : d.includes('S') ? 0 : (h0 - it.h) / 2;
          r = rectOf(it);
        }
        if (!it.sel && crowded(it, r)) { it.hide = true; lapHid.add(it.key); continue; }
        // (Shortened where it stands, a reading may come to sit on a vessel: it takes the solid halo there.)
        if (solve && useLines && it.key.startsWith('n:') && !it.onVessel && lineHits(r, 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      }
      kept.push(r);
    }
    // A zone's title under a reading that had nowhere else to go (placeMulti's overZones) slides along its band to the nearest
    // free spot; with none, it gives way.
    const shownBoxes = (z) => out.filter((o) => !o.hide && !o.live && o !== z).map(boxOf);
    for (const z of out) {
      if (!z._zr || z.sel || z.hide || !out.some((o) => o.key.startsWith('n:') && !o.hide && hits(rectOf(o), z._zr))) continue;
      const busy = shownBoxes(z), { at, c, lo, hi } = z._slide;
      let spot = null;
      for (let d = 4; spot === null && (c - d >= lo || c + d <= hi); d += 4) {
        for (const cc of [c - d, c + d]) {
          if (cc < lo || cc > hi) continue;
          const zr = at(cc);
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !busy.some((k) => hits(zr, { x0: k.x0 - 2, y0: k.y0 - 2, x1: k.x1 + 2, y1: k.y1 + 2 })) && !obstacles.some((o) => !o.zone && hits(zr, o))) { spot = cc; break; }
        }
      }
      if (spot !== null) z._zr = at(spot); else { at(c); z.hide = true; }
    }
    // Leader lines and anchor dots, for the labels showing. (Every line goes down before any dot, so no leader runs over a dot.)
    // (A stent's point: its dot sits on a solid disc of the stage's colour, and every leader that ends there, its own or the slide's
    // mark's, stops 2 px outside the disc; one left shorter than 4 px is not drawn: Review 15 Oct.)
    labelGlide(out);
    // No flow arrowhead runs under a reading that has to sit on its vessel (veins-gl.js noChev; world boxes, 3 px of air: its halo's reach).
    // (Taken where the label is drawn this frame, after its glide, not where it is going: the boxes ran ahead of a gliding
    // label; round 2 review, B8.)
    noChevBoxes = out.filter((it) => it.onVessel && !it.hide).slice(0, 12).map((it) => {
      const r = rectOf(it), c = [[r.x0 - 3, r.y0 - 3], [r.x1 + 3, r.y0 - 3], [r.x0 - 3, r.y1 + 3], [r.x1 + 3, r.y1 + 3]].map(([x, y]) => localToWorld(x, y));
      return [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))];
    });
    const DISC = 5, pts = out.filter((it) => it.point && !it.hide);
    const dots = [];
    const lineFrom = (it, le) => {
      let x0 = it.ax, y0 = it.ay;
      const d = pts.find((p) => Math.hypot(p.ax - x0, p.ay - y0) < DISC + 2);
      if (d) {
        const L = Math.hypot(le.x - d.ax, le.y - d.ay);
        if (L < DISC + 2 + 4) return null;
        x0 = d.ax + ((le.x - d.ax) / L) * (DISC + 2); y0 = d.ay + ((le.y - d.ay) / L) * (DISC + 2);
      }
      return `M${x0.toFixed(1)} ${y0.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}`;
    };
    for (const it of out) {
      if (it.hide || it.live || it.cls === 'organ' || it.cls === 'lane' || it.key === 'scan') continue;
      let r = rectOf(it);
      // (A numbered step's group: a leader from each of its vessels to the number, none to the point between them.)
      if (it.fans) {
        it.fans.forEach(([fx, fy], j) => {
          const le = leaderEnd(r, fx, fy, 6);
          if (Math.hypot(le.x - fx, le.y - fy) > 4) leaders.push({ k: `lf:${it.key}:${j}`, tag: 'path', at: { class: 'leader', 'data-k': it.key, d: `M${fx.toFixed(1)} ${fy.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}` }, fanOf: it });
        });
        continue;
      }
      // (A Circuit reading's leader reaches its text: the nearer of its lines, as wide as that line's words, not the block's box.)
      if (circuit && it.key.startsWith('n:')) r = leadRectOf(it, it.x, it.y, it.ax, it.ay);
      // (Elsewhere the leader stops on the edge of the letters it meets first, run by run: seenEnd.)
      const le0 = leaderEnd(r, it.ax, it.ay, circuit ? 2 : 6), le = circuit ? le0 : seenEnd(it);
      const far = Math.hypot(le0.x - it.ax, le0.y - it.ay) > 5;
      // (In the Circuit a reading more than LEAD_ON (12) px from its station is joined to it, so its ring is never in doubt.)
      const dl = (it.focusLeader || (it.leader && (circuit || far)) || (circuit && Math.hypot(le.x - it.ax, le.y - it.ay) > LEAD_ON)) && lineFrom(it, le);
      if (dl) leaders.push({ k: 'l:' + it.key, tag: 'path', at: { class: it.focusLeader ? `leader focus${it.mk ? ` k-${it.mk}` : ''}` : `leader${it.sel ? ' hl' : ''}`, 'data-k': it.key, d: dl } });
      if (it.focusLeader || it.free) continue;
      const cx = it.ax.toFixed(1), cy = it.ay.toFixed(1);
      if (it.point) dots.push({ k: 'h:' + it.key, tag: 'circle', at: { class: 'leader-dot-halo', 'data-k': it.key, cx, cy, r: String(DISC) } });
      if (!circuit || it.mid) dots.push({ k: 'd:' + it.key, tag: 'circle', at: { class: 'leader-dot', 'data-k': it.key, cx, cy, r: '2.4' } });
    }
    // (A "60 %" that stands off from its clamp, moved off the probe or put where the stent's column of callouts leaves room, is
    // joined to the clamp's nearer outer tip by a leader, fading with it; one at its usual spot has none. Read from the label as it
    // stands now, in a carried layout too, so a pan or a nudge of the figure keeps the line.)
    if (!isImaging()) for (const el of clampW.querySelectorAll('.clamp-label')) {
      const c = el._c, m = c && clampMv.get(c.id), own = c && c.id === clampFor && ptSide && clampD.get(c.id);
      if (!c || m?.busy || !(m?.cur || own)) continue;
      const b = boxOfEl(el, (6 * clampBase) / 12);   // (the leader stops short of the text by the same 6 px at 12 px text, in step with its size)
      if (!b) continue;
      const tips = [[c.x + c.nx * (c.off + 8), c.y + c.ny * (c.off + 8)], [c.x - c.nx * (c.off + 8), c.y - c.ny * (c.off + 8)]].map((q) => worldToLocal(...q));
      const gap = (q) => Math.hypot(Math.max(b.x0 - q[0], 0, q[0] - b.x1), Math.max(b.y0 - q[1], 0, q[1] - b.y1));
      const [ax, ay] = gap(tips[1]) < gap(tips[0]) ? tips[1] : tips[0], le = leaderEnd(b, ax, ay, 1);
      if (Math.hypot(le.x - ax, le.y - ay) > (m?.cur ? 4 : 28)) leaders.push({ k: 'cl:' + c.id, tag: 'path', at: { class: 'leader', d: `M${ax.toFixed(1)} ${ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}` } });
    }
    leaders.push(...dots);
    // (The flow's arrowheads keep out from under the points' callouts, within 17 px of their dots, and 5 px either side of
    // every leader that ends at a point, the slide's mark's included, so no line runs through one: Review 15 Oct.)
    const holes = [], k = 1 / Math.max(CTM.sc, 1e-3);
    for (const it of pts) {
      const r = rectOf(it), [ax, ay] = localToWorld(r.x0, r.y0), [bx, by] = localToWorld(r.x1, r.y1), [dx, dy] = localToWorld(it.ax, it.ay);
      holes.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), 3 * k], [dx, dy, dx, dy, 17 * k]);
    }
    for (const it of out) {
      if (it.hide || it.live || !(it.point || it.focusLeader) || !pts.some((p) => Math.hypot(p.ax - it.ax, p.ay - it.ay) < DISC + 2)) continue;
      const le = leaderEnd(rectOf(it), it.ax, it.ay), [x0, y0] = localToWorld(it.ax, it.ay), [x1, y1] = localToWorld(le.x, le.y);
      holes.push([x0, y0, x1, y1, -5 * k]);
    }
    const hk = holes.map((h) => h.map((v) => v.toFixed(1)).join(',')).join(';');
    if (hk !== holesKey) { holesKey = hk; chevHoles = holes; }
    // (This layout's labels are the whole of what is wanted: a build asked for by an earlier one and not yet made is dropped, or it would
    // make a label nothing then removes.)
    laidFrame = frameNo; blockWant.clear();
    for (const it of out) renderBlock(it);
    lbRects = out.filter((it) => !it.hide && it.w && it.h).map((it) => it._r || rectOf(it));
    colShown = out.some((it) => it.point && !it.hide && it.w && it.h);
    // (A step's number comes in as its vessel lights, deck visuals V10; with reduced motion all at once.)
    for (const it of out) {
      if (it.delay == null || it.hide) continue;
      const b = pool.get(it.key), wait = it.delay - (performance.now() - glowSetAt);
      if (!b || b.fxIn) continue;
      b.fxIn = true;
      if (wait > 0 && !reduceMotion.matches) { b.g.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SURFACE, delay: wait, easing: EASE_ARRIVE, fill: 'backwards' }); labelGL?.hold(b.g, wait + D_SURFACE); }
    }
    const sit = out.find((o) => o.key === 'scan'), sblk = pool.get('scan');
    if (sit && !sit.hide) {
      const le = seenEnd(sit);
      const [lp, ld] = gScan.children;
      lp.setAttribute('d', `M${sit.ax.toFixed(1)} ${sit.ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}`);
      ld.setAttribute('cx', sit.ax.toFixed(1)); ld.setAttribute('cy', sit.ay.toFixed(1));
      gScan.classList.remove('off');
    } else { gScan.classList.add('off'); if (sblk && sblk.seen !== frameNo) sblk.g.classList.add('lb-off'); }   // no callout this frame (circuit view, covered): it fades, never pops
    labelShown = out.filter((it) => it.src && !it.hide);
    // A label no longer wanted fades out (lb-off), then leaves; one wanted again before then simply fades back (renderBlock).
    for (const [k, b] of pool) {
      if (b.seen === frameNo || (k === 'scan' && (scan.leaving || scan.on))) continue;
      b.at = null; b.gl = null;
      b.box = '';   // (gone from the labels the credit avoids: labelBoxStamp)
      if (b.gone || b.g.style.display === 'none') continue;
      if (reduceMotion.matches || camMove) { b.g.style.display = 'none'; continue; }
      b.g.classList.add('lb-off'); labelStop(b, true);
      const tok = b.gone = {};
      setTimeout(() => { if (b.gone === tok) { b.gone = null; b.g.style.display = 'none'; } }, 360);
    }
    glass.hidden = !out.some((it) => it.key === 'liver' && !it.hide);
    paintLeaders(leaders);
    // Keep the camera of every committed layout, including a carry before a sliced solve. A slice itself commits nothing; labelTail
    // must not stamp an old picture with the current camera merely because its solver has finished or was skipped.
    layCTM = stagePx(CTM);
    if (HOVER_LINK && (linkLit.size || vh.id || linkPtr || linkKbd)) { linkHeld(); linkSync(); }   // (a label or leader just built, or one whose class was written again, takes its lift)
    // (A group's leaders come in with its number, as its vessels light.)
    for (const w of leaders) {
      const el = w.fanOf && leadEls.get(w.k), wait = el && w.fanOf.delay - (performance.now() - glowSetAt);
      if (!el || el.fxIn) continue;
      el.fxIn = true;
      if (wait > 0 && !reduceMotion.matches) { el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SURFACE, delay: wait, easing: EASE_ARRIVE, fill: 'backwards' }); labelGL?.hold(el, wait + D_SURFACE); }
    }
    return true;
  }
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
  // (R08, warm-views.js: under the lobule the targets stay WARM_MS, so a quick Lobule → Anatomy makes nothing again; a hidden page
  // gives them back at once. ?warmviews=0: at once, as before.)
  function trimVeins() {
    if (veinsTrimmed || !veins || veins.lost || glowSync) return;
    if (WARM_VIEWS && !document.hidden) {
      const t = performance.now();
      if (!hiddenAt) {
        hiddenAt = t;
        // (Review pass item 8: the warm window is held in the global budget too (gpu-budget.js hold): several warm views at once, or memory
        // over the envelope, give these back before WARM_MS. Its release is this trim, once; showing the figure again drops the hold.)
        veinsHold = gpuHold({ owner: 'veins (under the lobule)', kind: 'warm', gl: veins.gl, bytes: () => (veinsTrimmed ? 0 : vCanvas.width * vCanvas.height * 58), release: () => { veinsHold = null; if (!veinsTrimmed && veins && !veins.lost && !glowSync) { veins.trim(); veinsTrimmed = true; veinsDirty = true; } } });
      }
      if (t - hiddenAt < WARM_MS) return;
    }
    veinsHold?.drop(); veinsHold = null;
    veins.trim(); veinsTrimmed = true; veinsDirty = true;
  }
  function sleep() {
    sleeping = true; clearTimeout(sleepTimer); sleepTimer = setTimeout(wake, 1000);
  }
  function wake() { if (!sleeping) return; sleeping = false; clearTimeout(sleepTimer); askAnimate(); }
  stageWake = wake;
  // (Not woken by a model frame alone: the frame's own update wakes the figure (update: stageWake), and nothing storeVer keys on is in it.
  // Rev 2 step 3.)
  store.on('*', wake, { frames: false });
  store.on('*', () => { storeVer++; }, { frames: false });
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(wake).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  if (appEl) new MutationObserver(wake).observe(appEl, { attributes: true, attributeFilter: ['class'] });

  // Opaque organ shapes (anatomy), as canvas paths; built once, band widths read from the CSS (as the stage is made, coverWRead).
  let organCovers = null;
  const coverW = new Map();
  function coverWRead() {
    let moved = false;
    for (const o of ORGANS) {
      if (!o.band || !organEls[o.id]) continue;
      const w = parseFloat(getComputedStyle(organEls[o.id]).strokeWidth) || 0;
      if (coverW.get(o.id) !== w) { coverW.set(o.id, w); moved = true; }
    }
    if (moved) { organCovers = null; }   // (built again with the widths read)
  }
  coverWRead(); readFrame(coverWRead);
  function getOrganCovers() {
    if (organCovers) return organCovers;
    organCovers = [];
    for (const o of ORGANS) {
      if (o.deco || o.noCover || !organEls[o.id]) continue;
      if (o.circle) { const p = new Path2D(); p.arc(o.circle[0], o.circle[1], o.circle[2], 0, Math.PI * 2); organCovers.push({ p, w: 0, src: { circle: o.circle } }); continue; }
      // (The gut's tubes cover the vessels behind them along their earlier centre lines and widths: ORGANS cover.)
      if (o.cover) { organCovers.push({ p: new Path2D(o.cover.d), w: o.cover.w, src: { d: o.cover.d } }); continue; }
      const w = o.band ? coverW.get(o.id) || 0 : 0;
      if (o.band && w < 4) continue; // the diaphragm is a hairline, not a cover
      organCovers.push({ p: new Path2D(o.d), w, src: { d: o.d } });
    }
    return organCovers;
  }

  // ── Interaction ───────────────────────────────────
  // A click picks a structure (a vessel, else the organ under the pointer, else nothing); a drag
  // pans. The only gestures that stay "armed" are the shunt (from its source to a drop target)
  // and the two paint brushes in the Draw menu, and each shows how to finish or cancel it.
  const pointers = new Map();
  let drag = null;
  let shunt = null; // { src, wx, wy, targets: Map(id → rule), hover }

  const { abdomenEl, cancelShunt, edgeFromEvent, explainAt, explainChanged, gHovO, hitVessel, linkFocus, linkHeld, linkHover, linkSync, organAt, setOrganHover, shuntDrop, shuntDropOn, startShunt, vesselShapes, vhStep } = createHover({ E, EI, EV, GL_ROWS, MQ, SEL_FADE, TIER_ART, TIER_LIFT, TIER_LIFT_FRONT, ascitesLine, ascitesPath, ascitesSvg, clientToWorldFast, defs, easeInOut, explain, gGuides, gLeaders, gSelO, geo, glLines, labelGL, late, lateRun, levelTier, nearbyEdge, nextFrame, nodePos, olSet, onHoverInfo, onSelect, orgTone, organEls, organG, pointAt, polyD, pool, readFrame, refreshCTM, setGlowSrc, spot, spotOn, stageBox, svg, syncPlateLook, updateLabels, vh, wrap }, live);






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

  // Keyboard: the figure is one Tab stop (no element per vessel). Inside it Tab and Shift+Tab walk its items (every vessel shown, then,
  // in the anatomy, the organs a tap opens) and leave it at either end, Enter or Space acts on the item, and the arrows walk along the
  // flow. The item in focus glows as the GPU draws it (the 'key' glow; an organ takes its hover outline) and is read out through #live.
  const figKeys = { cur: null, tabAt: -Infinity, back: false };
  const ORGAN_NAME = new Map(ORGAN_KEYS);
  function figItems() {
    const out = [];
    if (lobuleOn) return out;
    for (const x of EV) if (x.vis && !x.noHit) out.push(x.e.id);
    if (morph < 0.5) for (const [id] of ORGAN_KEYS) out.push('organ:' + id);
    return out;
  }
  const figSay = (msg) => { const el = document.getElementById('live'); if (el && msg) el.textContent = msg; };
  function figWords(item) {
    if (item.startsWith('organ:')) return `${ORGAN_NAME.get(item.slice(6))}. Press Enter for its card.`;
    const e = EI[item] != null ? EDGES[EI[item]] : E[item]?.e;
    if (!e) return '';
    if (!F || EI[item] == null) return `${e.label || item}. Press Enter for actions.`;
    const q = F.Q[EI[item]];
    return `${e.label}: ${fmt(F.P[NI[e.from]], 1)} to ${fmt(F.P[NI[e.to]], 1)} millimeters of mercury, flow ${fmt(q * 0.06, 2)} liters per minute${E[item].rev ? ', reversed' : ''}. Press Enter for actions.`;
  }
  function figShow(item, say = true) {
    const was = figKeys.cur;
    figKeys.cur = item;
    if (was?.startsWith('organ:') && was !== item) setOrganHover(null);
    if (item?.startsWith('organ:')) {
      const org = item.slice(6), sel = store.get().selection;
      setGlowSrc('key', []);
      setOrganHover(sel?.type === 'organ' && sel.id === org ? null : org);
    } else setGlowSrc('key', item ? [{ id: item, col: 'var(--accent)', amt: 1.8, wide: 1.25, top: true, dur: 160 }] : []);
    if (item && say) figSay(figWords(item));
  }
  // (Which way Tab came in: a Tab pressed anywhere just before the figure took focus.)
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Tab') { figKeys.tabAt = performance.now(); figKeys.back = ev.shiftKey; } }, true);
  svg.addEventListener('focus', () => {
    if (!keyStops) return;
    const items = figItems();
    if (performance.now() - figKeys.tabAt < 400) figShow(items.length ? items[figKeys.back ? items.length - 1 : 0] : null);
    else if (figKeys.cur && items.includes(figKeys.cur) && focusSeen()) figShow(figKeys.cur);   // (focus handed back from the keyboard, a closed card's: the item it was on)
  });
  const focusSeen = () => { try { return svg.matches(':focus-visible'); } catch { return true; } };
  // (A pointer on the figure lets go of the keyboard's item: its glow goes, Space is the app's again, and the next Tab starts afresh.)
  svg.addEventListener('pointerdown', () => { if (figKeys.cur) figShow(null, false); });
  svg.addEventListener('blur', () => { if (figKeys.cur) { setGlowSrc('key', []); if (figKeys.cur.startsWith('organ:')) setOrganHover(null); } });
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

  // ── Anchors for the action card ───────────────────
  const ORGAN_ANCHOR = { liver: [470, 360], heart: [650, 118], spleen: [1052, 362], varices: SITES.varix, gastric: SITES.fundus, abdomen: [720, 770] };
  const anchorRings = { key: '', rings: [] };
  function anchorFor(sel) {
    if (!sel) return null;
    if (sel.type === 'lobule') return lz?.anchorFor(sel) || null;
    refreshCTM();
    if (sel.type === 'edge' && geo[sel.id] && E[sel.id]?.vis) {
      const pts = geo[sel.id].cur;
      const [x, y] = worldToLocal(...pointAt(pts, 0.5));
      // The tube and, for a braided bed (varices), each of its strands: the card keeps clear of all of them.
      const toPx = (line) => line.map((q) => worldToLocal(q[0], q[1]));
      const lines = [toPx(pts)];
      for (const sd of E[sel.id].strands || []) if (sd.cur && (sd.live ?? 1) >= 0.5) lines.push(toPx(sd.cur));
      const path = lines.flat();
      // The drawn half-width on screen (lumen and walls), so the card keeps clear of the whole tube (card-place.js).
      const r = (((E[sel.id].width ?? 8) + 3) / 2) * (CTM?.sc || 1);
      return { x, y, path, lines, r };
    }
    if (sel.type === 'organ') {
      const org = { liver: 'liver', heart: 'heart', spleen: 'spleen' }[sel.id];
      const hasLine = org && organEls[org]?.getAttribute('d');
      // An organ with an outline anchors at its own centre (not the clicked point); its leader starts on the outline.
      const w = (hasLine ? ORGAN_ANCHOR[sel.id] : null) || sel.at || ORGAN_ANCHOR[sel.id];
      if (!w) return null;
      const [x, y] = worldToLocal(w[0], w[1]);
      const path = [[x, y]];
      const b = org && organEls[org] ? elBoxInto(organEls[org], EBOX) : null;   // (in script: elBox)
      if (b) {
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) path.push(worldToLocal(b.x + (b.width * i) / 4, b.y + (b.height * j) / 4));
      }
      let outline = null;
      if (hasLine) {
        // The same sampled rings the GPU outline draws (olRings), cached per shape, in screen space.
        const k = olKey(org);
        if (anchorRings.key !== k) { anchorRings.key = k; anchorRings.rings = olRings(org); }
        outline = [];
        for (const r of anchorRings.rings) for (let i = 0; i < r.length; i += 2) outline.push(worldToLocal(r[i][0], r[i][1]));
      }
      return { x, y, path, outline };
    }
    return null;
  }

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
      const hidden = pinchHide || pinchLift || wrap.classList.contains('pinch-hide') || wrap.classList.contains('cam-move'), riding = !!rideCTM;
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
