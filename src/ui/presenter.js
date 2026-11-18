// Presenter: projector-first presentations on the live model (decks.js) and the instructor's own scripts.
//
// A slide is one idea: a big headline, one line, a few causes, and a figure that explains it. Every
// slide's model state is computed off screen first (a second engine in its own worker, worker-core.js
// 'sequence'), each from the slide before, so the live figure only ever shows finished states and
// forward, back and jump always agree. Between slides the words fade over; a change of patient dims the
// figure (never to blank) and brings it back; then the camera travels: to a region of the plate, or down into the lobule and
// on to a portal tract, the sinusoids or a central vein. The pressure ladder and the tiles count to their
// new values.
//
// Keys (clickers send the same): → Page Down Space Enter next (during a time-lapse the first runs it to its end),
// ← Page Up back (↑ and ↓ move no slide), a number then
// Enter jumps, G the slide list, Home End, B or . black screen, F full screen, ? the Guide, Esc. (The Guide lists them: PRESENT_KEYS in
// main.js.) On a touch screen a sideways swipe anywhere on the slide goes on or back.

import { store, replaceParams, setViewKey } from './store.js';
import { freshPatient } from './slide-motion.js';
import { controlOwnsKey } from './key-owner.js';
import { startChange } from './change-order.js';
import { h, toast, svgIcon, icon, clamp, isModalOpen, popoverOpen, SHORT_SIDE_MQ } from './util.js';
import { swipeDir, SWIPE_MIN, SWIPE_RATIO, ownsSideways, ownsTouch, cardSwipe, caseFling, caseFlight, wheelFinger, wheelGesture, ownsWheel } from './swipe.js';
import { createVisuals } from './presenter-visuals.js';
import { sinusoidSupported } from './gl-support.js';
import { pickedScale } from './scale-switch.js';
// The spot of the liver the windows are taken from: the open right lobe, between the portal branches and the hepatic veins (fractions of the liver's box in the figure's units).
import { CIRC_REGIONS } from './cam-frame.js';
import { nb } from './glue.js';
import { DECKS, withOverview } from './decks.js';
import { createPresenterLink } from './presenter-view.js';
import { noteResume } from './resume.js';
import { checkDeck } from './deck-source.js';
import { rateOf, liveSettled, LIVE_MAX, shownSig } from './table-marks.js';
import { frameFor, cancelFrame, holdMotion, inMotion, beginChange } from './frame.js';
import { loadGlyphs } from './text-gl.js';
import { restPass } from './rest-pass.js';
import { createSlidePrep } from './slide-prep.js';
import { createTxns, createLease, slowSteps } from './slide-txn.js';
import { cathInstant } from './cath-arrival.js';
import { gpuProbe } from './gpu-probe.js';
import { glEpoch, onGLRestored } from './gl-state.js';
import { prepareShaders, shaderFailures } from './gl-compile.js';
import { onTheme } from './theme-epoch.js';
import { stepExtra, figureHooks, safe, warmOf, trailOf } from './slide-ext.js';
import { beatCount, beatView } from './slide-beats.js';
import { revealCount } from './reveal.js';
import { trailKeys } from './flow-time.js';
import { eventGraphOf } from './event-graph.js';
import { specOf, procKindOf, procOffered } from './proc-anim.js';
import { keepData } from './card-keep.js';
import { D_SMALL, D_SURFACE, EASE_ARRIVE, RISE_PX, cssCurve, easeArrive } from './ease.js';
import { glideOpacity, glideTranslate, glideStop, glideX, glideY } from './script-glide.js';
import { signalMove } from './num-move.js';
import { pageOn, followOf, pageIn, swipeHeld } from './card-page.js';
import { throwOut, throwIn, throwBack, throwLeft, throwing, throwStop, throwsOut, THROW_IN, THROW_STAGGER, throwOutNow, throwPinned, throwRelease, throwLanded, throwFade, RAIL_GAP, RAIL_MS, throwReach } from './card-throw.js';
import { readAnims, readBox, readMetric, readStyle, readTiming, scrollInto } from './layout-snap.js';
import { calmFrames, cardsLanded, createFrameGates } from './cover-lift.js';
import { createSolveLane } from './solve-lane.js';
import { caught } from './caught.js';
import { createInk } from './ink-gl.js';
const nextFrame = frameFor('presenter');

import { readMine } from './script-library.js';
// Test decks: on the /preview/ copy only (never the live site), listed under "Testing" in Present. Each plays exactly as
// if imported (an "Outline and objectives" slide in front, so its slide numbers match the imported file's).
const PREVIEW = typeof location !== 'undefined' && /\/preview\//.test(location.pathname);
// (Loaded only there: the live site's bundle carried the 53 KB deck for nothing. The menu reads TESTING when it opens, long after.)
let TESTING = [];
const testingLoad = PREVIEW ? import('./test-decks/demo-all-new-visuals.js').then(({ DEMO_ALL }) => { TESTING = [DEMO_ALL].map((d) => ({ id: 'test-' + d.id, title: d.title, summary: d.summary || '', deck: checkDeck(d), test: true })); }).catch(() => { /* the preview's test deck only */ }) : Promise.resolve();
// alloc-rare: one timer per awaited step of a procedure, seconds apart, not per frame
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NEVER = () => false;   // (a wait nothing cuts: a caller with no change of its own to ask)
import { reduceMotionMQ as reduce, easeMove, fadeMs as fadeLen } from './motion.js';
let panelGoTok = null;   // (the visual panel's fade out to a words slide: the token of the timer that empties it)
import { createWaits } from './wait-cut.js';
import { VIEW_CHANGE_MS } from './view-xf.js';
import { tileVal, liveFp, PT_FREE, ptPush, sv, glBox, fitted, fitNow, est, fitChart, fsOf } from './presenter-cards.js';
import { LOBULE_CAM, lensSpec, PRESSURE_KEY, keyNodes, slideLens, slideTargets } from './presenter-words.js';
import { createLibrary } from './presenter-library.js';
import { createStart } from './presenter-start.js';
import { instrumentOf } from './slide-instrument.js';
import { oneLadder } from './teach-extras.js';
import { createScales } from './presenter-scales.js';
import { createLadders } from './presenter-ladders.js';
import { createZoom } from './presenter-zoom.js';
import { createQuestion } from './presenter-question.js';
import { createCase } from './presenter-case.js';
import { createLapse } from './presenter-lapse.js';
import { createProc } from './presenter-proc.js';
import { createOverlays } from './presenter-overlays.js';
export { slideLens, abChoice, SITE_NODE, slideTargets, camOn, LENS_WORDS, LENS_TONE } from './presenter-words.js';
const ease = easeMove;   // (the tweens and glides of the data card: the one in-out curve, motion.js)
// Waits a newer press can cut (wait-cut.js): waitCut(ms, cut) ends at ms or the first frame in which cut() holds; until(fn, ms) is the same asked the other way.
// Looked at by frame (a hidden tab, which runs none, by a slow poll and the timer), no longer by a 40 ms timer that made every wait about 20 ms late.
const { waitCut, until } = createWaits({ frame: nextFrame });
// The change between Anatomy and Circuit has landed (stage.viewChanging), or ms pass: the longest it can take, VIEW_CHANGE_S, and a margin for a late frame.
const viewSettled = (cut, stage) => waitCut(VIEW_CHANGE_MS + 400, () => cut() || !stage.viewChanging?.());
const { painted, smooth } = createFrameGates(nextFrame);   // (cover-lift.js: one painted frame; the wait for smooth frames)
const { scaleVisual, quadrantVisual, wallsVisual, makeCalc, xKey } = createVisuals({ sv, glBox, est, fitChart, fsOf });

export function createPresenter({ openSettings, loadPreset, host, stage, poke = () => {}, projectorOn, projectorOff, closeHome, stashCards, rerenderHome, patientHistory = null, restartTraces = null }) {
  // <stage-split live>
  // The shared lets (and consts made after a part), read at the moment of use by the part files: never copied, so a part cannot draw a frame late.
  const live = {
    get deck() { return deck; }, set deck(v) { deck = v; },
    get TESTING() { return TESTING; }, set TESTING(v) { TESTING = v; },
    get bare() { return bare; }, set bare(v) { bare = v; },
    get black() { return black; }, set black(v) { black = v; },
    get booting() { return booting; }, set booting(v) { booting = v; },
    get busy() { return busy; }, set busy(v) { busy = v; },
    get caseDragAt() { return caseDragAt; }, set caseDragAt(v) { caseDragAt = v; },
    get caseLift() { return caseLift; }, set caseLift(v) { caseLift = v; },
    get clearFor() { return clearFor; }, set clearFor(v) { clearFor = v; },
    get clearRO() { return clearRO; }, set clearRO(v) { clearRO = v; },
    get clearT() { return clearT; }, set clearT(v) { clearT = v; },
    get colT() { return colT; }, set colT(v) { colT = v; },
    get cover() { return cover; }, set cover(v) { cover = v; },
    get coverT() { return coverT; }, set coverT(v) { coverT = v; },
    get dataHideT() { return dataHideT; }, set dataHideT(v) { dataHideT = v; },
    get dataOn() { return dataOn; }, set dataOn(v) { dataOn = v; },
    get entering() { return entering; }, set entering(v) { entering = v; },
    get fitKids() { return fitKids; }, set fitKids(v) { fitKids = v; },
    get fitRaf() { return fitRaf; }, set fitRaf(v) { fitRaf = v; },
    get fitRO() { return fitRO; }, set fitRO(v) { fitRO = v; },
    get gen() { return gen; }, set gen(v) { gen = v; },
    get glassT() { return glassT; }, set glassT(v) { glassT = v; },
    get handOn() { return handOn; }, set handOn(v) { handOn = v; },
    get heldNow() { return heldNow; }, set heldNow(v) { heldNow = v; },
    get hiCon() { return hiCon; }, set hiCon(v) { hiCon = v; },
    get holdEase() { return holdEase; }, set holdEase(v) { holdEase = v; },
    get hushed() { return hushed; }, set hushed(v) { hushed = v; },
    get hushInT() { return hushInT; }, set hushInT(v) { hushInT = v; },
    get idleT() { return idleT; },
    get ink() { return ink; }, set ink(v) { ink = v; },
    get keepArgs() { return keepArgs; }, set keepArgs(v) { keepArgs = v; },
    get keepBad() { return keepBad; }, set keepBad(v) { keepBad = v; },
    get keepNow() { return keepNow; }, set keepNow(v) { keepNow = v; },
    get keepSnap() { return keepSnap; }, set keepSnap(v) { keepSnap = v; },
    get labelsFor() { return labelsFor; }, set labelsFor(v) { labelsFor = v; },
    get lastAt() { return lastAt; }, set lastAt(v) { lastAt = v; },
    get lastCam() { return lastCam; }, set lastCam(v) { lastCam = v; },
    get layersBefore() { return layersBefore; }, set layersBefore(v) { layersBefore = v; },
    get leaving() { return leaving; }, set leaving(v) { leaving = v; },
    get lipStep() { return lipStep; }, set lipStep(v) { lipStep = v; },
    get liveOff() { return liveOff; }, set liveOff(v) { liveOff = v; },
    get noCase() { return noCase; }, set noCase(v) { noCase = v; },
    get pageForce() { return pageForce; }, set pageForce(v) { pageForce = v; },
    get pageHeld() { return pageHeld; }, set pageHeld(v) { pageHeld = v; },
    get paneRaf() { return paneRaf; }, set paneRaf(v) { paneRaf = v; },
    get pillW() { return pillW; }, set pillW(v) { pillW = v; },
    get playing() { return playing; }, set playing(v) { playing = v; },
    get prepT() { return prepT; }, set prepT(v) { prepT = v; },
    get pull() { return pull; }, set pull(v) { pull = v; },
    get pzWidth() { return pzWidth; }, set pzWidth(v) { pzWidth = v; },
    get refitT() { return refitT; }, set refitT(v) { refitT = v; },
    get reframeT() { return reframeT; }, set reframeT(v) { reframeT = v; },
    get saved() { return saved; }, set saved(v) { saved = v; },
    get sess() { return sess; }, set sess(v) { sess = v; },
    get shown() { return shown; }, set shown(v) { shown = v; },
    get shownState() { return shownState; }, set shownState(v) { shownState = v; },
    get sizeSeen() { return sizeSeen; }, set sizeSeen(v) { sizeSeen = v; },
    get slides() { return slides; }, set slides(v) { slides = v; },
    get swapNow() { return swapNow; }, set swapNow(v) { swapNow = v; },
    get textOn() { return textOn; }, set textOn(v) { textOn = v; },
    get throwD() { return throwD; }, set throwD(v) { throwD = v; },
    get throwDir() { return throwDir; }, set throwDir(v) { throwDir = v; },
    get turnT() { return turnT; }, set turnT(v) { turnT = v; },
    get txn() { return txn; }, set txn(v) { txn = v; },
    get ui() { return ui; }, set ui(v) { ui = v; },
    get waiters() { return waiters; }, set waiters(v) { waiters = v; },
    get want() { return want; }, set want(v) { want = v; },
    get widthOwn() { return widthOwn; }, set widthOwn(v) { widthOwn = v; },
    get widthT() { return widthT; }, set widthT(v) { widthT = v; },
    get wrapRO() { return wrapRO; }, set wrapRO(v) { wrapRO = v; },
    get beat() { return beat; }, set beat(v) { beat = v; },
    get caseCard() { return caseCard; }, set caseCard(v) { caseCard = v; },
    get fig() { return fig; }, set fig(v) { fig = v; },
    get flipping() { return flipping; }, set flipping(v) { flipping = v; },
    get gear() { return gear; },
    get hushAt() { return hushAt; }, set hushAt(v) { hushAt = v; },
    get lapseLeft() { return lapseLeft; }, set lapseLeft(v) { lapseLeft = v; },
    get lapseOn() { return lapseOn; }, set lapseOn(v) { lapseOn = v; },
    get markBase() { return markBase; }, set markBase(v) { markBase = v; },
    get redrawn() { return redrawn; }, set redrawn(v) { redrawn = v; },
    get scalePick() { return scalePick; }, set scalePick(v) { scalePick = v; },
    get shownBeat() { return shownBeat; }, set shownBeat(v) { shownBeat = v; },
    get stateOf() { return stateOf; }, set stateOf(v) { stateOf = v; },
    get states() { return states; }, set states(v) { states = v; },
    get textLock() { return textLock; }, set textLock(v) { textLock = v; },
    get foldHeld() { return foldHeld; }, set foldHeld(v) { foldHeld = v; },
    get framedSig() { return framedSig; }, set framedSig(v) { framedSig = v; },
    get frameL() { return frameL; }, set frameL(v) { frameL = v; },
    get onResize() { return onResize; },
    get procRun() { return procRun; }, set procRun(v) { procRun = v; },
    get push() { return push; }, set push(v) { push = v; },
    get zoomMissed() { return zoomMissed; }, set zoomMissed(v) { zoomMissed = v; },
    get camAt() { return camAt; },
    get cardMoving() { return cardMoving; },
    get cardsStill() { return cardsStill; },
    get zoomFollow() { return zoomFollow; },
    get zoomOn() { return zoomOn; },
    get base() { return base; }, set base(v) { base = v; },
    get extraOf() { return extraOf; }, set extraOf(v) { extraOf = v; },
    get fitDone() { return fitDone; },
    get mon() { return mon; }, set mon(v) { mon = v; },
    get paintZoom() { return paintZoom; },
    get panelGoTok() { return panelGoTok; }, set panelGoTok(v) { panelGoTok = v; },
    get phone() { return phone; },
    get shadeAnim() { return shadeAnim; }, set shadeAnim(v) { shadeAnim = v; },
    get thrown() { return thrown; },
    get turnAnim() { return turnAnim; }, set turnAnim(v) { turnAnim = v; },
    get turnIn() { return turnIn; }, set turnIn(v) { turnIn = v; },
    get turnNow() { return turnNow; }, set turnNow(v) { turnNow = v; },
    get visualOf() { return visualOf; },
    get caseHideT() { return caseHideT; }, set caseHideT(v) { caseHideT = v; },
    get degrade() { return degrade; },
    get evg() { return evg; }, set evg(v) { evg = v; },
    get procDoneAt() { return procDoneAt; }, set procDoneAt(v) { procDoneAt = v; },
    get refOf() { return refOf; },
    get abGen() { return abGen; }, set abGen(v) { abGen = v; },
    get keyNow() { return keyNow; }, set keyNow(v) { keyNow = v; },
    get procQueued() { return procQueued; }, set procQueued(v) { procQueued = v; },
    get tileKeys() { return tileKeys; },
    get caseExit() { return caseExit; }, set caseExit(v) { caseExit = v; },
    get clotMarks() { return clotMarks; },
    get markFocus() { return markFocus; },
    get procParked() { return procParked; }, set procParked(v) { procParked = v; },
    get procQueue() { return procQueue; },
    get procRing() { return procRing; }, set procRing(v) { procRing = v; },
    get procRingAt() { return procRingAt; }, set procRingAt(v) { procRingAt = v; },
    get procRunBase() { return procRunBase; }, set procRunBase(v) { procRunBase = v; },
    get procRunKind() { return procRunKind; }, set procRunKind(v) { procRunKind = v; },
    get procShown() { return procShown; }, set procShown(v) { procShown = v; },
    get procShownAt() { return procShownAt; }, set procShownAt(v) { procShownAt = v; },
    get procSteps() { return procSteps; },
    get procThenAt() { return procThenAt; }, set procThenAt(v) { procThenAt = v; },
    get procWait() { return procWait; }, set procWait(v) { procWait = v; },
  };
  // </stage-split live>
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → { states, done }: computed states, reused the next time it is presented
  // (The lane a deck's states are computed on, solve-lane.js: one deck at a time, the one being opened first, never the engine the cards' instruments ask.)
  const lane = createSolveLane({ makeCalc, cache });
  const LANE_MINE = '@mine';   // (a script the person imported: not cached, but it keeps the lane while it is opened)
  let deck = null, slides = [], states = [], waiters = [], stateOf = [], base = null, extraOf = new Map();
  // `gen` counts redraws asked of the slide in place: a transition under way for an older one starts over.
  let want = 0, shown = null, shownState = -1, busy = false, playing = false, gen = 0, redrawn = -1;   // (redrawn: the cards drawn again for a new text size, see pps:labelscale)
  let entering = null;   // (the slide whose cards are coming in, from their last unseen layout: its sizes hold from there, see layout's lockKey)
  let ui = null, black = false, digits = '', digitT = 0;
  let keyNow = null;   // (the colour key on show, [lens, slide]: a new look draws a gradient key again from the new look's ramp)
  onTheme(() => { if (ui && keyNow && typeof (lensSpec(keyNow[0], keyNow[1]) || PRESSURE_KEY)[1] === 'function') ui.fk.replaceChildren(...keyNodes(keyNow[0], keyNow[1])); });
  let saved = null, layersBefore = null;   // (the viewer's own lobule layers, put back when the show ends)
  // High contrast: a deeper shade, stronger text, ratings as filled chips (pz-hi). Off for now; no control offers it.
  const PROJ = 'pps.projector';
  let hiCon = false;   // (off for now: no control offers it; a saved choice is ignored)
  // Panel width: fixed at medium for now. A phone's panel spans the screen.
  const PW = 'pps.pzWidth', PW_K = { narrow: 0.8, medium: 1, wide: 1.3 };
  let pzWidth = 'medium';   // (fixed for now: no control offers it; a saved choice is ignored)

  // A Circuit slide with a `zone` and no `cam` frames that zone's region (cam-frame.js CIRC_REGIONS).
  const zoneCam = (s) => (!s.visual && s.view === 'circuit' && !s.cam && CIRC_REGIONS[s.zone] ? { ...s, cam: s.zone } : s);

  const all = () => [...DECKS, ...[...TESTING, ...readMine()].map(fromScript)];
  // An instructor's script (captured model states) as slides: its own titles and notes, the Gut to heart profile beside.
  // An imported deck file (s.deck: the full deck format, read without running it by deck-source.js) keeps every feature.
  function fromScript(s) {
    if (s.deck) return { ...s.deck, id: s.id, title: s.title, level: 'yours', mine: true, full: true, slides: withOverview(s.deck).slides };
    return { ...s, level: 'yours', mine: true, slides: (s.steps || []).map((st) => ({
      preset: st.preset, presetDays: st.presetDays, params: st.params, action: st.action, days: st.days, view: st.view, cam: st.view === 'circuit' ? 'fit' : st.cam || 'fit',
      kicker: st.kicker || s.title, title: st.title || 'Step', line: st.line || '', causes: st.causes, site: st.site, notes: st.notes || st.tell || '', ask: st.ask, tool: Array.isArray(st.spans) ? { kind: 'profile', spans: st.spans } : { kind: 'profile' }, key: st.key || [],
    })) };
  }

  // ── Slide states ──
  // stateOf[i]: the slide whose model state slide i shows (itself, or the last one before it that changed the model).
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
  // (before: a slide that plays its procedure also gets the state it opens on, the procedure not done yet: see the landing.)
  const modelStep = (s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' ? trailKeys(s.tool) : trailOf(s), before: s.procedure ? specOf(procKindOf(s.procedure))?.before : undefined } : {});
  // (With the extra work a deck visuals package asks for at the slide's state, kept with it as st.extra: slide-ext.js stepExtra.)
  const stepOf = (s) => { const x = stepExtra(s); return x ? { ...modelStep(s), ...x } : modelStep(s); };
  let prepRev = 0;   // (bumped each time a presentation's states are set: the slide preparation's manifests belong to one of these)
  function prepare() {
    prepRev++;
    const key = deck.mine ? null : deck.id;
    stateOf = []; let last = 0;
    slides.forEach((s, i) => { if (changes(s) || i === 0) last = i; stateOf[i] = last; });
    const pl = solvePlan(slides);
    extraOf = new Map(pl.extra.map((o, k) => [xKey(o), slides.length + k]));
    const hit = key && cache.get(key);   // (a deck warmed ahead from the Present menu, or presented before: its states, and those still being computed, are this talk's)
    if (hit) { states = hit.states; waiters = []; return; }
    const mine = []; states = mine; waiters = [];
    solve(deck, slides, mine, pl);
  }
  // The calc's steps for a list of slides: each slide's model step, then the patients a visual compares that no slide shows (and a compare slide's buttons switch to), each fresh.
  function solvePlan(sl) {
    const extraRows = sl.flatMap((s) => [...(s.of || []).filter((o) => typeof o === 'object' && o.preset && !o.id), ...(s.of || []).filter((o) => typeof o === 'object' && o.at?.preset), ...(s.compare || []).filter((o) => o.preset)].map((o) => (o.at?.preset ? o.at : o)));
    const extra = [...new Map(extraRows.map((o) => [xKey(o), o])).values()], presetAt = []; let pid = store.get().presetId;
    sl.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    extra.forEach((o, k) => { presetAt[sl.length + k] = o.preset; });
    return { extra, presetAt, steps: [...sl.map(stepOf), ...extra.map((o) => ({ preset: o.preset, params: o.params, days: o.days, relax: o.relax }))] };
  }
  // Computes a deck's states into `mine`; the cache has it from the start, so a start while it runs joins it (prepare adopts the same array, and the waiters it leaves are
  // settled here as each state arrives). A deck that is not the one on show only fills the cache. A failure settles the talk's waiters with nothing and ends it with a word.
  async function solve(d, sl, mine, pl) {
    const key = d.mine ? null : d.id, c = lane.begin(key ?? LANE_MINE); if (key) cache.set(key, { states: mine, done: false });
    const failed = () => {
      lane.end(key ?? LANE_MINE);
      if (mine.cancelled) return;   // (a warm another row's rest called off, solve-lane.js: nobody waits for it)
      if (key && cache.get(key)?.states === mine) cache.delete(key);
      if (c.broken) lane.broken(c);
      if (states !== mine || deck?.id !== d.id) return;
      for (const w of waiters) w.res(null);
      waiters = []; stop(); toast('This presentation could not be prepared. Reload the page to present it.', 'bad');
    };
    try {
      const first = sl[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; });
      const end = await c.sequence(pl.steps, first, (m) => {
        const st = { snap: m.snap, base: m.base, params: m.params, fp: m.fp, trail: m.trail, presetId: pl.presetAt[m.i] };
        if (m.start) st.start = { ...m.start, presetId: pl.presetAt[m.i] };
        if (m.before) st.before = { ...m.before, presetId: pl.presetAt[m.i] };
        if (m.extra) st.extra = m.extra;
        mine[m.i] = st;
        if (states !== mine) return;   // a newer presentation has started
        for (const w of waiters.filter((x) => x.i === m.i)) w.res(st);
        waiters = waiters.filter((x) => x.i !== m.i);
      });
      // (Only the working set, the slide shown and its neighbours, warms its data-card charts now; the rest are warmed by the slide preparation as the talk reaches them: recs-production-120hz §16, B16.)
      if (end?.type !== 'error') { lane.end(key ?? LANE_MINE); if (key && cache.get(key)?.states === mine) cache.get(key).done = true; if (states === mine) slides.forEach((s, i) => { if (Math.abs(i - want) <= 2) safe(() => warmOf(s, ctxOf(s, i)), null, 'warm')?.catch?.(() => {}); }); return; }
      failed();   // (the slides could not be computed, most often a page left open across an update: the next try starts a fresh engine)
    } catch (err) { console.error(err); failed(); }
  }
  // A deck's states computed ahead, behind the Present menu (the row the pointer or focus is on): the 3 to 8 s wait after the press was the first slide's patient being
  // worked out. Only a deck whose first slide names its patient (the calc needs nothing of the viewer's own), with no talk on, once.
  // (Only once the pointer has rested on the row, and one deck at a time: solve-lane.js. A row crossed in passing queued a whole deck's states each, and a deck opened then waited for all of them.)
  function warm(id) {
    if (typeof id !== 'string' || deck || cache.has(id)) return;
    lane.warm(id, () => {
      const d = !deck && !cache.has(id) ? DECKS.find((x) => x.id === id) : null, sl = d?.slides?.length ? withOverview(d).slides.map(oneLadder).map(zoneCam).map(instrumentOf) : null;
      if (sl?.[0]?.preset) solve(d, sl, [], solvePlan(sl));
    });
  }
  // Each slide's numbers for the printed notes (handout.js): the deck computed as presenting it computes it, or the states
  // it was last presented with, so the values in the handout's words are the ones its slides show.
  async function deckNumbers(d) {
    const sl = d.mine ? d.slides : withOverview(d).slides, own = []; let last = 0;
    sl.forEach((s, i) => { if (changes(s) || i === 0) last = i; own[i] = last; });
    let st = !d.mine && cache.get(d.id)?.states;
    if (!st) {
      st = [];
      const first = sl[0]?.preset ? null : (await host.request('snapshot')).snap;
      await getCalc().sequence(sl.map(modelStep), first, (m) => { st[m.i] = { fp: m.fp }; });
    }
    return sl.map((_, i) => st[own[i]]?.fp ?? null);
  }
  const stateReady = (i) => (states[i] ? Promise.resolve(states[i]) : new Promise((res) => waiters.push({ i, res })));

  function applyState(st) {
    host.send({ type: 'restore', snap: st.snap, keepBeat: true });   // (the heart goes on from the beat it is at: the easing carried it)
    replaceParams(structuredClone(st.params));
    store.set({ presetId: st.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  }
  // A change of patient on screen eases (the model blends from where it is to the slide's state: lesions grow, sliders,
  // pressures and flows travel, the days run on); a newer slide mid-way eases on from wherever the model has got to.
  // Resolves once the slide's exact state is in, or early (the model left part way) when cut() says a newer slide was asked for.
  const MORPH_MS = 2000;   // motion-scale: own pace (the patient's change under a slide)
  // A slide change is one move (premium-feel R1). Over the plate the cards come in during the
  // camera's move (CARDS_AT: as it sets off), so it lands on a finished slide, and a change of patient eases under the glide itself, over
  // MORPH_ONE_MS (the glide's camMs, 480 to 900 ms, and a tail), not 2 s after it lands. A large change keeps easing under the cards:
  // the widths and colours follow it (display-state.js). Kept serial, as before: the lobule's way in and out, a catheter, a case card
  // over a loading patient, a slide with an instrument (it records the slide's own state), and a figure that cannot move smoothly
  // while its organs change (stage.canDrift: no live GPU organs, so a glide over the changing organs would paint them all each frame;
  // there the change still waits for the landing, over MORPH_ONE_MS).
  // (Quick slide, Mohammad 2 Nov 2026, "Do it" to review/slide-motion-recs-2nov: the screen sat with no card for 0.4 to 0.8 s while the
  // glide ran. The cards came in once a quarter of the glide had run, the smooth-frames gate gives up after QUICK_SMOOTH ms, not 700, and the
  // new card starts its way in at once, not 120 ms late.)
  // (16 Nov 2026, Sites and causes 2 to 3 on his Mac: the cards' entry, a quarter in plus the smooth-frames gate, made a long frame in the last
  // fifth of the glide, which landed the rest of the move in one jump. They now start their way in as the glide sets off (CARDS_AT 1: all of
  // it left), where the quintic barely moves, and stage-glide.js holds any glide through a long frame rather than skipping part of it.)
  const QUICK_SMOOTH = 240;
  const CARDS_AT = 1, MORPH_ONE_MS = 1200;   // motion-scale: own pace (the patient's change under a glide)
  // A chart or gauge that only reads the model as it eases (the pressure profile, a relation curve, the flows, the talk's trace, the criteria,
  // the plane) comes in over the change, riding it: its numbers and curve travel with the vessels, as a kept card's do. An instrument that
  // records the patient's flow (Doppler, beat by beat, vitals), plays on arrival, or is a deck package's own, still waits for the slide's state.
  const RIDES_MODEL = new Set(['profile', 'curve', 'flows', 'plane', 'criteria', 'path', 'trace', 'trial', 'spans']);
  const underTool = (t) => !t || (RIDES_MODEL.has(t.kind) && !(t.kind === 'trace' && t.range === 'beats'));
  // The same patient over the plate: the slide's labels, glows and marks start once the cards are in sight (their last small step still
  // running, at the arrival curve about 95 percent of the way), not after the title's last frame, which was most of half a second of
  // an empty figure between the cards landing and the slide's own marks arriving.
  const CARDS_SEEN = D_SMALL - 40;
  const CATH_SETTLE_MS = 4000;   // motion-scale: not a move (a longest wait); (at most: a model still drifting never holds the catheter longer)
  // (data-pz-morph on #app while a change of patient eases: the checks hold the data card to it. An attribute, never a class: rules-lint.mjs, 16 Nov 2026.)
  async function morphTo(st, cut, ms = MORPH_MS, mark = true) {
    // (N1, change-order.js: the change keeps the one order: the colour sets off from its cause, the collaterals after it.)
    startChange(store.get().params, st.params);
    host.send({ type: 'morph', snap: st.snap, ms });
    store.set({ presetId: st.presetId, presetLoading: false });
    if (mark) app.toggleAttribute('data-pz-morph', true);
    try {
      await until(cut, ms + 80);
      if (cut()) return false;
      applyState(st);
      await drawn(st);
      return !cut();
    } finally { if (mark) app.toggleAttribute('data-pz-morph', false); }
  }
  // The live engine has sent a frame of the new state (its portal pressure is the slide's), and two more frames have painted it.
  let frames = 0;
  store.on('frame', () => { frames++; });
  async function drawn(st) {
    const n0 = frames;
    await until(() => frames > n0 && Math.abs((store.get().frame?.metrics?.pv ?? -99) - st.fp.pv) < 0.6, 900);
    await new Promise((done) => nextFrame(() => nextFrame(done)));
  }

  // ── The figure's moves ──
  const fadeMs = () => fadeLen(D_SURFACE);   // (Reduce Motion too: the figure dims and comes back, never swaps in one frame; owner, 15 Nov 2026)
  // A quiet arc over the figure's free space while a new patient settles (it fades in and out with the dim, never pops).
  const loading = (on) => { ui?.load.classList.toggle('on', on); if (on) ui?.load.classList.remove('idle'); };
  async function figureOut(cut) { loading(true); view.classList.add('pz-out'); await waitCut(fadeMs(), cut || NEVER); }
  function figureIn() { view.classList.remove('pz-out'); loading(false); }
  // (next: the slide being moved to, if it frames the plate, so the way out of the lobule lands on that framing
  // in one zoom rather than stopping at the fit first.)
  const RISE_FIT_MS = 450;   // (the zoom back to the whole lobule before a rise: about the rise's own speed where they meet)   // motion-scale: own pace (the zoom back before a rise, about the rise's own speed)
  const RISE_AHEAD_MS = 1200;   // (a lobule slide settled this long: its way out's organ picture is made ahead)   // motion-scale: not a move (a wait)
  let prepAheadT = 0;
  const RISE_READY_MS = 2500;   // (the longest the rise waits for the organs' picture: past it, the live drawing shows, as before)   // motion-scale: not a move (a longest wait)
  // (cut: the owning transition was replaced or stopped. Checked after every wait and before every write, so a stale exit stops
  // where it is and touches neither the camera nor the store; the newer transition owns the hold from then on.)
  // (next.box: a function, asked for when the rise begins; next.vt: the view itself, measured then: a catheter slide's first shot, cathRise.)
  const riseOn = (next) => (next.vt ? stage.riseToVT(next.vt) : stage.riseTo(next.box, next.kMax, next.clear, next.subject));
  // (to: 'circuit' for a slide whose view is the Circuit: the way out of the lobule then asks for the Circuit as it goes, and the stage begins the change while the last of
  // the rise is still settling (stage.js circGo, RISE_CIRC_T): the zoom out and the turn to the Circuit are one move, not a stop at the whole anatomy between them.)
  async function toAnatomy(next, cut = () => false, to = 'anatomy') {
    if (cut()) return;
    const st = store.get();
    if (!st.lobule && !st.sinusoid) return;
    // Out of the sinusoid and out of the lobule is one glide (Mohammad, 16 Nov 2026: "sinusoid to anatomy should be one glide if possible"; it was three steps with a stop at
    // each): the way out is made ready first (below), then the stage's zoom out of the sinusoid carries straight on into the rise (stage.exitSinusoid). The old steps remain
    // only where the lobule is not at its fit (the stage falls back to them itself).
    if (st.sinusoid) {
      stage.prepRise?.();
      stage.lobuleHold?.(true);
      if (stage.riseReady && !booting) { await until(() => cut() || stage.riseReady(), RISE_READY_MS); if (cut()) return; }
      if (next && !reduce.matches && !booting) riseOn(next);
      stage.exitSinusoid(to);
      await waitCut(60, cut);
      if (to === 'circuit') { await until(() => cut() || (!store.get().lobule && !store.get().sinusoid && stage.morphTargetNow?.() === 1), 9000); return; }
      await until(() => cut() || (!store.get().lobule && !store.get().sinusoid && stage.lobuleSettled()), 9000);
      if (!cut()) await waitCut(80, cut);
      return;
    }
    // The anatomy under the lobule is brought up to the patient now and its organs' picture made, unseen (begun in camera() as the
    // new cards come in); the rise waits for it (stage.js prepRise), so the organs fade in as they are, never swapped in one frame at landing.
    if (cut()) return;
    stage.prepRise?.();
    stage.lobuleHold?.(true);   // (the lobule's framing stays where the leaving slide left it: the way out only zooms out, see transitionRun)
    // (Waited for before the glide, at rest: the glide runs straight on into the rise, never stopping at the whole lobule.)
    if (stage.riseReady && !booting) { await until(() => cut() || stage.riseReady(), RISE_READY_MS); if (cut()) return; }
    // (The way back to the fit eases in only: it reaches the fit still moving and the rise, which moves from its first frame, carries
    // straight on. Eased out as well, the zoom came to rest at the whole lobule and set off again: it stopped midway (Mohammad, 20 Oct,
    // Circulation 9 to 10).)
    if (stage.lobuleOpen()) { const ms = reduce.matches || booting ? 0 : RISE_FIT_MS; if (stage.lobuleFocus('fit', { ms, ease: 'in' })) { await waitCut(ms + 150, () => cut() || !stage.lobuleGlide?.()); if (cut()) return; } }
    if (next && !reduce.matches && !booting) riseOn(next);
    if (to === 'circuit') { setViewKey('circuit'); await until(() => cut() || stage.morphTargetNow?.() === 1, 6000); return; }
    setViewKey('anatomy');
    await until(() => cut() || stage.lobuleSettled(), 6000); if (!cut()) await waitCut(80, cut);
  }
  // Glide the camera to a slide's framing; resolves when it has landed (cut(): a newer slide was asked for).
  // (early: a share of the glide over the plate; camera() resolves once only that much of it is left, the glide running on: one move, above.)
  async function camera(cam, s, cut, early = 0, begun = null) {
    const ms = reduce.matches || booting ? 0 : 1500;
    if (LOBULE_CAM.test(cam)) {
      stage.lobuleHold?.(false);   // (a way out called off: the lobule follows this slide's cards again)
      // (A slide's layers: ['zones'] shows the lobule's zone bands; any other lobule slide has them off.)
      const zonesWant = !!s.layers?.includes('zones');
      if (!!store.get().lobuleLayers?.zones !== zonesWant) store.set({ lobuleLayers: { ...store.get().lobuleLayers, zones: zonesWant } });
      if (store.get().view !== 'anatomic') { setViewKey('anatomy'); await viewSettled(cut, stage); if (cut()) return; }   // (the change landed, not 700 ms: it takes VIEW_CHANGE_S)
      // The station this slide frames: the dive lands on it in one move, and (mid-dive) no other station's labels show.
      const part = cam === 'sinusoid' ? 'sinusoid' : cam.split(':')[1] || 'fit', zoom = s.zoom ?? 2.3;
      if (!store.get().lobule) {
        // Anatomy straight down to the slide's station (aim: the dive lands on it in one move, its labels laid out only there, never
        // a stop at the whole lobule first); the sinusoid is gone to from the lobule's normal framing.
        if (cam !== 'sinusoid') stage.lobuleAim(part, { zoom });
        setViewKey('lobule');
        // (A first dive also loads the lobule, which a slow tablet can take several seconds over.)
        await until(() => cut() || (stage.lobuleSettled() && stage.lobuleOpen()), 12000);
        if (cut()) return;
        await waitCut(120, cut);
      } else {
        await until(() => cut() || stage.lobuleOpen(), 9000);
      }
      if (cut()) return;
      const sin = cam === 'sinusoid' && sinusoidSupported() && stage.lobuleOpen();
      // (Each wait ends when the stage says the move has landed (the zoom into the sinusoid, out of it, the lobule's glide), never a number; the
      // number is only the longest it may take, and a newer press cuts it at once.)
      if (sin) { if (!store.get().sinusoid) { setViewKey('sinusoid'); if (ms) await waitCut(1250 + 400, () => cut() || !stage.sinBusy()); } return; }
      if (store.get().sinusoid) { setViewKey('lobule'); if (ms) await waitCut(1000 + 400, () => cut() || !stage.sinBusy()); if (cut()) return; }
      if (stage.lobuleFocus(part, { zoom, ms })) await waitCut(ms + 300, () => cut() || !stage.lobuleGlide?.());
      return;
    }
    const v = s.view || 'anatomic';
    // (The rise lands where the box fits the space the cards leave, measured as it begins: the new slide's cards are let come in
    // first, or they would settle a little larger after it and the camera would glide again to the fit they leave.)
    if ((store.get().lobule || store.get().sinusoid) && ms > 0) {
      if (!store.get().sinusoid) stage.prepRise?.();   // (begun now, while the cards come in: see toAnatomy)
      const t0 = performance.now();
      await until(() => cut() || !cardsEntering(), 1200);
      // (And their size has stopped moving: a chart or a wrapped line that lands during the rise would change the fit it was aimed at.
      // The two waits together stay under 1.8 s, so the rise still begins promptly.)
      let sig = cardSig(), since = performance.now();
      await until(() => { const n = cardSig(); if (n !== sig) { sig = n; since = performance.now(); } return cut() || performance.now() - since > 250; }, Math.max(0, 1800 - (performance.now() - t0)));
    }
    if (cut()) return;
    const viaRise = v === 'circuit' && ms > 0 && store.get().lobule;   // (out of the lobule or the sinusoid into the Circuit slide: one move, see toAnatomy)
    await toAnatomy(v === 'anatomic' ? riseFor(cam, s) : null, cut, viaRise ? 'circuit' : 'anatomy');
    if (cut()) return;
    // (A switch of view sets off here and the slide's framing is asked of it at once, below: it becomes the change's new end (stage-view.js viewXfRetargetTo),
    // so the camera travels once, on the change's clock, instead of a second glide starting 700 ms into a change that takes 1.3 s.)
    const switching = viaRise || store.get().view !== v;
    if (store.get().view !== v) setViewKey(v === 'circuit' ? 'circuit' : 'anatomy');
    // (Reduced motion keeps the glide, short: a jump of the whole figure is harder to follow than a quick move. Under the start's
    // cover it is set outright, so the reveal never catches it on its way.)
    const gl = booting ? 0 : ms || 300;
    const held = insets.held;
    insetsGo(true);   // (the room the new cards leave, written as the glide sets off: it frames for it, and the labels wait for its landing)
    stage.camSteps?.(txn?.trail);   // (the change's steps so far, kept with the move's record: where a late start spent its time, pps.cameraGate)
    frameTo(cam, s, gl, SLIDE_OPT);   // (the slide's one move: stage-glide.js holds every other framing asked while it runs)
    caseExit = false;   // (asked of this framing only)
    begun?.(); if (held) dispatchEvent(new Event('pps:occ'));   // (the glide has set off: the cards' last fitting runs under it, see transitionRun)
    // (Timed by the glide itself, camMs or an arc's stretch, never the 1.5 s asked: the camera had landed long before that wait ended.)
    if (early && gl) {
      // (One timer to the point asked for, then a look: polled alone every 40 ms, a busy glide's late timers put the cards after its landing.)
      const g0 = stage.glideLeft?.();
      if (g0?.ms) await waitCut(Math.max(0, g0.left - g0.ms * early - 40), cut);
      else if (switching) await viewSettled(cut, stage);   // (no camera move to time it by, a change of view with the camera where it is: its landing)
      await until(() => { if (cut()) return true; const g = stage.glideLeft?.(); return !g || g.left <= g.ms * early; }, gl + 1500); return;
    }
    // (A camera beat or a flip of the scale, which wait for no cards: its call-outs come once the glide has landed, 480 to 900 ms and an arc's
    // stretch, not 1.5 s after it set off; and at once when the framing did not change, where no glide began. Polled, so a beat pressed
    // again while this one moves is noticed within a frame or two, not after the glide: nothing waits on the exact frame it lands.)
    // (A switch of view still morphing with the camera nowhere to go is moving too: viewChanging.)
    if (gl) { await until(() => cut() || (!stage.gliding() && !stage.viewChanging?.()), gl + 1500); return; }
    if (switching) await viewSettled(cut, stage);
    else await waitCut(gl, cut);
  }
    // What the figure shows for the slide on screen (fig: { i, s }): the slide itself, framed where its time-lapse ends (lapse.cam) once
  // its days are run or when they are not played (back, a jump back, the first slide). Refits read it, so they keep that framing.
  // push: the slow push under way to lapse.cam, { i, until }.
  let fig = null, push = null;
    // A slide's framing: its region of the plate (or, by name, the box its names fill), grown to take in all of what the slide points
  // at (its outlined organs as drawn now, an enlarged spleen whole), with a little room for the outline's glow, and room for its marks,
  // labels, lit vessels, probe and readings, so none of them stands outside the frame (cam-room.js).
  // The one move to a framing on the plate: the whole figure, or a slide's box (opt.drift: a slow push, see pushTo).
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  // (A slide's move never follows a vessel path: one straight glide, stage-glide.js. The T4 vessel-following glide was taken out on 16 Nov 2026.)
  const SLIDE_OPT = { slide: true };   // (read only)
  let caseExit = false;   // (caseExit: the next framing is the move in from a case card's whole patient, spent by camera())
    // ── A slide's procedure (proc-anim.js): TIPS, BRTO or BATO played on the live figure, guided by Next (his ask, 29 Oct): on the
  // slide, the first Next puts the catheter in, each Next after it plays the next step, and the Next after the last moves on;
  // Back runs the last step backwards, and from the first puts the slide as it was. The teaching card shows the steps as a row
  // of numbered pills, the one on show lit: progress only, never buttons. Each step holds still in its shot with its callout,
  // the slide's own mark style, on the vessel it works on. It may also start as the slide lands going forward (auto:
  // true). As it passes its change the live model takes it, as a treatment button does (liveSet), and gives it back going back.
  // A slide whose own patient has already had it (the BRTO slides show the shunt closed) plays it from just before: the live
  // model takes it back first (the shunt opens again while the catheter travels), then the procedure puts it back; going back to
  // before the first step puts the slide as it was. Leaving the slide stops it where it is; the next slide's camera takes over.
  let procRun = null, procRunBase = 0, procWait = false, procShown = -1, procShownAt = -1, procRing = -1, procRingAt = -1, procDoneAt = -1, procThenAt = -1, procQueued = false, procRunKind = '', procParked = null;
      // ── A time-lapse on the live model: its days run on the disease clock (ramped as the off-screen chain ran them),
  // the counter and the numbers follow, then the slide's computed state takes over (the same, to the decimal).
  let lapseOn = false, lapseLeft = 0, lastAt = -1;   // (lapseLeft: days still to run; 0 once Next has sped it up; lastAt: the slide last shown)
    // The slide's marks as it landed (markBase), and those marks for the params now: a mark with clot: true names the clot in its
  // first vessel as the model has it (callout-math clotWords), so the what-if slider changes its words, and with no clot it goes.
  let markBase = null;
        // The catheter's pressure monitor, made once and kept, so its trace carries on from slide to slide.
  let mon = null;
  const { CC, cardsEntering, cath, cathFrame, cathStop, cathTrack, figOf, figView, frameTo: frameTo$, procAtOf, procHeld, procKind, procNext, procPaint, procPlay, procRingOf, procStop, procTarget, procThen, pushEnd, pushTo, riseFor, throwCards } = createProc({ ease, evBack, evRun, liveSet, nextFrame, stage, stopLapse, toAnatomy, viewSettled }, live);
  function frameTo(...a) { return frameTo$(...a); }   // <stage-split stub>

  // (A run with no stop to hold at (the IVC reading, which ends in its own withdrawal) plays out before the reading starts: a Next on its last step waits for that, the ring
  // already on the reading's first step, and a Next while it waits is swallowed, never the slide moving on: Mohammad, 13 Nov 2026, the direct PPG slide, "1, 2, then it just moves to the next slide".)
  const procQueue = () => {
    const s = slides[want];
    if (!procRun || !procRun.running || !procThen(s) || procRunKind !== procKind(s)) return false;   // (a run that is over holds nothing back: a Next never waits on it)
    if (!procQueued) { procQueued = true; procRing = specOf(procKind(s)).steps.length; procRingAt = want; procPaint(); }
    procRun.rush();   // (the reading plays out at speed and waits for no camera: Mohammad, 13 Nov 2026, "it's refusing to go to step 4 or 5": the ten seconds of the IVC's own withdrawal swallowed every Next)
    return true;
  };
    // A compare slide's buttons switch the live model's params (liveOff: it no longer shows the slide's computed state).
  let liveOff = false, abGen = 0;
    // A what-if slider has been moved on this slide, whatever it moves (the model, or an instrument's option, which leaves liveOff alone):
  // from then on only the data card's readings change, and its cards keep the plan they came in with (readingsOnly, cardsStill).
  // Cleared with the next slide (transitionRun).
  let handOn = false;
    // ── The procedure's graph, an instrument card (event-graph.js, tool { kind: 'evgraph' }) ──
  // A slide that plays a TIPS, BRTO, BATO or a Meso-Rex bypass carries a graph of its two tiles over its steps, drawn live from the moment the
  // procedure changes the patient (Mohammad, 7 Nov 2026: the PPG and the sinusoidal flow "changing in real time after the TIPS gets placed").
  // It is the slide's instrument card, never part of the teaching card (15 Nov 2026, PC-6; slide-instrument.js gives a slide that names no
  // instrument this one). It starts where the slide opened, and the procedure's change (procPlay's apply) hands it to liveSet, which gives it
  // each live reading as it gives the tiles theirs. A run played through is kept for the slide (evKept), so coming back to it played through
  // shows the graph whole.
  let evg = null;
  const { LIVE_EASE, LIVE_RUN, LIVE_SET, abPick, abSlow, bedside, beside, besideHook, cathOut, cathRise, cathTo, clotMarks, evDrop, evKept, lapseRow, lapseText, liveKeys, markFocus, merge, onHidden, paintKey, procBack, procEl, procSteps, skipLapse, stentedKept, stentedOf, stopLapse: stopLapse$, strainEl, strainStop, whatIfEl } = createLapse({ CC, NEVER, cath, cathFrame, cathStop, cathTrack, clearPill, dataTo, figureOut, host, liveSet, morphTo, nextFrame, paintChrome, procAtOf, procHeld, procKind, procRingOf, procStop, procTarget, procThen, pushEnd, stage, stateReady, toAnatomy, viewSettled, waitCut, xKey }, live);
  function stopLapse(...a) { return stopLapse$(...a); }   // <stage-split stub>

  // ev (evRun): a procedure's change, played on the model's own course (ease 0: no settling, so the pressures fall as the model's physics has
  // them) and read every 100 ms by its graph, model seconds from the change; the readings stop with the graph's last.
  async function liveSet(s, i, patch, ev = null) {
    if (!deck || shown?.i !== i || slides[i] !== s) return;
    const g = ++abGen, ref = refOf(s, i), mine = () => g === abGen && shown?.i === i && !!deck;
    liveOff = true;
    replaceParams(merge(structuredClone(store.get().params), patch || {}));
    // (A clot mark takes its new words at once, as the slider moves; the stage fades them in, and fades the mark out at no clot.)
    if (markBase?.i === i && markBase.marks.some((m) => m.clot)) {
      const ms = clotMarks(markBase.marks, store.get().params);
      if (ms.map((m) => m.label).join('|') !== (store.get().focus?.marks || []).map((m) => m.label).join('|')) store.set({ focus: markFocus(ms) });
    }
    LIVE_SET.params = store.get().params; LIVE_SET.ease = ev ? 0 : LIVE_EASE; host.send(LIVE_SET);   // (the host copies a message as it posts it: one kept message)
    host.send(LIVE_RUN);
    const keys = liveKeys(s), m0 = store.get().frame?.t;
    let sig = null, still = performance.now();
    for (const t0 = performance.now(); mine();) {
      await waitCut(ev ? 100 : 150, () => !mine());
      const fr = store.get().frame, now = performance.now();
      if (fr?.metrics && mine()) {
        const f = liveFp(fr), k = shownSig(f, keys);
        dataTo(s, f, ref, 280);
        if (k !== sig) { sig = k; still = now; }
        if (ev && Number.isFinite(m0) && ev.sample(fr.t - m0, f)) break;
      }
      if (ev ? now - t0 >= LIVE_MAX : liveSettled(now - t0, now - still)) break;
    }
    if (ev && mine()) ev.end();
    if (!mine()) return false;
    abSlow();
    return true;   // (settled, and not replaced by a later press: abPick then sets the words and pills to the settled state)
  }
  // The same graph as the data card's instrument (tool { kind: 'evgraph' }, Mohammad 8 Nov 2026: the preemptive TIPS slide's chart moves up into the
  // instrument card where the indications table was): the card's instrument is the chart, driven here exactly as the one on the words.
  function evAdopt(s, i, st) {
    const g = eventGraphOf(s), ft = ui?.tools.current('evgraph');
    if (!g || !ft || !procOffered(g.kind, st?.params || store.get().params, st ? null : store.get().frame?.metrics)) return;
    evg = { ft, spec: g, s, i };
    evStart(st);
  }
    let caseLift = null, caseCard = null, caseHideT = 0;   // (caseHideT: the timer that hides the card once it has faded out, caseShut)
      // The data card for slide i: its instrument and tiles, or nothing (the card then leaves).
  let dataHideT = 0;   // (the timer that hides the data card once it has faded out)
  const { caseFade, caseFadeTokens, caseRun, dataTo: dataTo$, evBack: evBack$, evRun: evRun$, evStart: evStart$, paintLapse, playLapse, questionRun, respFp, tileKeys } = createCase({ CATH_SETTLE_MS, announce, applyState, bedside, caseGone, cath, drawn, evKept, figureIn, host, lapseText, loading, morphTo, paintChrome, pushEnd, pushTo, releaseData, stage, stateReady, stopLapse, toAnatomy, until, view, waitCut }, live);
  function evStart(...a) { return evStart$(...a); }   // <stage-split stub>
  function evRun(...a) { return evRun$(...a); }   // <stage-split stub>
  function evBack(...a) { return evBack$(...a); }   // <stage-split stub>
  function dataTo(...a) { return dataTo$(...a); }   // <stage-split stub>

  // Lifted (tap, Next, a swipe anywhere): the card leaves now, while the slide carries on behind it.
  // (Mohammad, 5 Nov 2026: "when i click arrow next in a case card ... the case card text remains in screen while the transition is happening".
  // It used to fade where it stood, over D_SURFACE, with a 14 px drop, as the camera set off for the slide: its words sat over the moving
  // figure. It is now thrown out to the left on the slide cards' rail, as the teaching card goes on Next, glass and words as one, fading
  // as it goes, so its words are gone in the first frames of the camera's move. Reduce Motion: gone at once.)
  function caseGone(card) {
    if (caseLift && caseCard === card) caseLift = null;
    card.lifted = true;
    if (card.flown) return;
    card.c.classList.remove('on');
    card.flown = performance.now() + caseThrow(card.c, card.ms);
  }
  function caseThrow(c, ms) {
    if (ms <= 0) { caseFade(c, false, 0); return 0; }
    caseFadeTokens.set(c, {});   // (a fade still running in lets go: its ending must not take the throw's inline values off)
    const gx = glideX(c), gy = glideY(c), x = Number.isFinite(gx) ? gx : 0, y = Number.isFinite(gy) ? gy : 0, o = parseFloat(c.style.opacity);
    const dist = throwReach(readBox(c), 'next', innerWidth, Math.min(innerWidth, readMetric(c, 'offsetWidth') + RAIL_GAP), 0.95);   // (never cut at the screen's edge: card-throw.js throwReach)
    glideStop(c); c.style.removeProperty('transition'); c.style.removeProperty('transform');
    // (The card and its glass read these same frame-clock values, card-throw.js's way: they never part.)
    glideTranslate(c, x, y, x - dist, y, RAIL_MS, easeArrive);
    glideOpacity(c, Number.isFinite(o) ? o : 1, 0, Math.round(RAIL_MS * 0.5), easeArrive);
    return RAIL_MS;
  }
  // The card leaves: no longer a case card for Next to lift; it fades out and is hidden once it has.
  // A card already flung off waits only for the rest of its flight.
  function caseShut() {
    const card = caseCard;
    if (!card) return 0;
    caseCard = null; caseLift = null;
    card.c.classList.remove('on');
    if (!card.flown) caseFade(card.c, false, card.ms);
    const ms = card.flown ? Math.max(0, Math.ceil(card.flown - performance.now())) : card.ms;
    // (One card element serves every case: a timer of an earlier leaving would hide it in the middle of this one's.)
    clearTimeout(caseHideT);
    caseHideT = setTimeout(() => { caseHideT = 0; if (!card.c.classList.contains('on')) card.c.hidden = true; }, ms);
    return ms;
  }
  // Swiped: the card flies off sideways from where the finger let go and lifts as a tap does (during the glide behind it
  // too: the glide runs on and the slide's cards still wait for it to land). Too short a drag springs it back with an ease.
  // (It carries on from where the finger let go at the finger's own speed, then eases out as it fades to nothing; a slow
  // let-go still takes long enough to be seen leaving, never a pop. The card is hidden only once the flight is over.)
  function caseFly(card, dir, v, w) {   // (w: the card's width, read at rest: as the finger landed, or before a wheel's throw)
    const c = card.c, dist = innerWidth / 2 + w, gx = glideX(c), gy = glideY(c);
    const x = Number.isFinite(gx) ? gx : (card.dx || 0), y = Number.isFinite(gy) ? gy : (card.dragY || 0), opacity = parseFloat(c.style.opacity);
    const left = Math.max(1, Math.abs(dir * dist - x));
    // (With reduced motion it only fades where it was let go.)
    const ms = reduce.matches ? 300 : caseFlight(left, v);
    const slope = (Math.abs(v) * ms) / left;   // the finger's speed as the curve's starting slope
    const curve = cssCurve(`cubic-bezier(.33,${clamp(0.33 * slope, 0.12, 0.9).toFixed(2)},.45,1)`);   // motion-scale: own pace (the finger's speed is the curve's slope)
    caseFadeTokens.set(c, {}); glideStop(c);
    c.style.removeProperty('transition'); c.style.removeProperty('transform');
    // The card and its glass read these same frame-clock values. Rotation cannot be followed by the glass's translation model.
    glideTranslate(c, x, y, reduce.matches ? x : dir * dist, y, ms, reduce.matches ? cssCurve('linear') : curve);
    // (No fade: the card, glass and words, flies off whole and is hidden once it is out of sight. Its opacity is held where it was, so the leave class's own 0 never shows.)
    const o1 = Number.isFinite(opacity) ? opacity : 1;
    glideOpacity(c, o1, o1, ms, cssCurve('linear'));
    card.flown = performance.now() + ms; caseGone(card);
  }
  function caseBack(card) {
    const c = card.c;
    const x = card.dx || 0, y = card.dragY || 0, opacity = parseFloat(c.style.opacity), token = {};
    caseFadeTokens.set(c, token); glideStop(c);
    c.style.removeProperty('transition'); c.style.removeProperty('transform');
    glideTranslate(c, x, y, 0, 0, D_SURFACE, easeArrive, () => { if (caseFadeTokens.get(c) === token && !card.flown && !card.drag) c.style.removeProperty('translate'); });
    glideOpacity(c, Number.isFinite(opacity) ? opacity : 1, 1, D_SURFACE, easeArrive).then(() => { if (caseFadeTokens.get(c) === token && !card.flown && !card.drag) c.style.removeProperty('opacity'); });
    card.dx = 0; card.dragY = 0;
  }
  // Before the slide's camera move: waits for the tap (the card fades as the camera sets off), and for the organs to be back on
  // their GPU copy, so the zoom to the slide is smooth even after a quick tap while the patient was still easing in.
  async function caseLifted(cut) {
    const card = caseCard;
    if (!card) return;
    if (!card.lifted) await until(() => cut() || card.lifted, 864e5);
    if (cut()) return;
    // (The card is out of sight before the camera sets off. Its throw runs on the frame clock, and the camera's first frames, a dive into the
    // sinusoid or the lobule, are long ones that hold it where it stood while the figure's glass leaves the canvas for the dive: the glass body
    // gone, its shadow and words left standing over the move. Mohammad, 6 Nov 2026: "on slide 2 of ascites; after i hit keyboard right on the
    // case card; the card disappears but the shadow and the text remains while the slide transitions to intra sinusoid". Its words are gone in
    // the throw's first part (a fade over half of RAIL_MS on the rail's curve), a swipe's flight at its end: a few frames for a tap or a key.)
    await until(() => cut() || !caseShows(card), RAIL_MS);
    if (cut()) return;
    await until(() => cut() || stage.organsSettled(), CATH_SETTLE_MS);
  }
  // Whether a lifted card is still to be seen: its opacity is above a hair (a throw fades it out; a swipe's flight holds it, so it shows to the flight's end).
  function caseShows(card) {
    if (!card.flown) return false;
    if (performance.now() >= card.flown) return false;
    const o = parseFloat(card.c.style.opacity);
    return !Number.isFinite(o) || o > 0.02;
  }
  // Once the slide is ready behind the card (patient in, camera landed): waits for the tap, then lifts the card whole before the slide's cards come in.
  async function caseEnd(cut) {
    await keepFall(cut);   // (the last gate before the cards come in: a kept card the final layout changed falls first, and is built again)
    if (cut()) return;
    const card = caseCard;
    if (!card) return;
    if (!card.lifted) await until(() => cut() || card.lifted, 864e5);
    if (cut()) return;
    await waitCut(caseShut(), cut);
  }

  // ── Slides ──
  // Camera beats (slide field beats, slide-beats.js): the slide's views of the figure, one per Next. beat: the one asked for on slide
  // want; shownBeat: the one on screen once it has landed. A slide opens on its first going forward one at a time (opening: 0), and on
  // its last any other way (Back from the next slide, a jump, a reload), so it stands with its whole point made.
  let beat = 0, shownBeat = 0, firstBeat = false;
  // Which way the talk is going, for the card motion (Mohammad, 1 Nov, review/card-motion-spec-1nov.md): Next turns the words out to the
  // left and the new ones in from the right, Back the other way, a jump further (the slide list, a typed number, Home, End) neither, they rise.
  // turn: the way of the slide move asked last; turnNow: the way the move under way
  // turns its words while the teaching card's glass stays up, '' when the card leaves and comes back whole (as every card did before).
  let turn = 'jump', turnNow = '', glassT = 0, turnIn = false, turnAnim = null;
  // The words' box comes in after a turn (app.css: its lines stay at rest, so the fit, done unseen, measures them where they will stand;
  // a line offset sideways read as overflow and the words were fitted small, then grew in view): one composited move of the box,
  // from the side the talk comes from, with its fade, held at its start through the entrance's short delay.
  // How far the words may move sideways: the slide's own step (--pz-turn-d). px.
  // (As one page the glass goes with its words, so they have the slide's whole step, and no box is read.)
  const turnRoom = () => parseFloat(readStyle(ui.root).getPropertyValue('--pz-turn-d')) || 20;
  function wordsTurnIn() {
    pageCaught();   // (a swipe's throw over: the way in is the slide's own distance)
    if (!turnIn || !ui) return;
    turnIn = false;
    const t = ui.text, k = t.dataset.turn, thrown = !!throwDir && (k === 'next' || k === 'back');
    const d = thrown ? THROW_IN : parseFloat(readStyle(t).getPropertyValue('--pz-turn-d')) || 20;   // (thrown: from further, and no style read)
    // (The page: the glass and its words come in as one card, the same keyframes on both, started in the same frame.)
    if (thrown) {
      // (Thrown: the words and their glass come in on card-throw.js's clock, together, from the side the talk comes from.)
      // (Only a card that shows: a visual slide hides the words, and its glass stays out.)
      if (!t.hidden && t.childElementCount) {
        throwIn(t, k, 0);
        throwIn(ui.shade, k, 0);
      }
      turnAnim = null; shadeAnim = null;
      return;
    }
    const frames = pageIn(k, d, RISE_PX), how = { duration: D_SURFACE, delay: 0, easing: EASE_ARRIVE, fill: 'backwards' };   // (not thrown here: a thrown card returned above)
    // (No delay on the glass's own fade either, so it never runs on after the keyframes end and dips: app.css gives it .12s.)
    if (ui.shade.style.transitionDelay !== '0s') ui.shade.style.transitionDelay = '0s';
    turnAnim = t.animate?.(frames, how) || null;
    shadeAnim = ui.shade.animate?.(frames, how) || null;
  }
  // The teaching card as one page (src/ui/card-page.js): the glass and the words move together, follow, leave and enter, and only
  // transform and opacity change while they move.
  // A folding card's part follows a finger by transform and opacity, its height set once at each end (foldTouch).
  const FOLD_SLIDE = 10;
  // (A swipe let go past its distance: the card is held where the finger left it (its inline transform and opacity kept) until the slide's
  // leave is set on the words and the glass, and the hold is dropped in that same style change, so the leave carries on from the finger.
  // Dropped at the touch's end, as before, the glass was laid out at rest for a frame before its leave came (go() reaches wordsOut after a
  // task or two): it jumped back to the middle and slid out again from there, behind words that went on from the finger.)
  let pageHeld = null;
  // Next and Back throw the whole card out and bring the new one in (Mohammad, 2 Nov 2026: "Why don't we make the whole card go out throw
  // away just like the question and case card"; "throw to the left ... reappear from the right to the left"; "Same for outline and tables
  // and graphs conclusion cards too"): on Next every card leaving (the teaching card with its glass, a data card that changes, an outline,
  // table or conclusion panel) is thrown out to the left, gathering pace and fading (app.css .pz-throw), and the new one comes in from the
  // right, moving left, speeding up and slowing to rest evenly with no overshoot (THROW_IN, EASE_MOVE: not ease-arrive, whose first fifth
  // of the time covers four fifths of the way, which read as the card snapping in and settling like a spring). Back mirrors it; a jump still fades and rises in place.
  // A data card that stays (the same instrument) stays put. Transform and opacity only.
  // (Moved by card-throw.js, on one clock with the GPU glass: their inline transform and opacity written in the scheduler's frame.)
  let throwDir = '', throwD = 0;
  let thrownNow = false;   // (wordsOut: every card that leaves is on card-throw.js's way out, so throwsOut() times the leave and wordsOut asks for no floor)
  // alloc-rare: once per swipe, cached in pull.els as the first move lands
  const pageEls = () => [ui.text, ui.shade];
  // (A swipe takes every card that shows with the words, the data card and the panel too, on the finger's one move, and lets them go
  // together (Mohammad, 2 Nov 2026: "the cards are not following the text throwing swiping").)
  // alloc-rare: once per swipe, cached in pull.els as the first move lands
  const swipeEls = () => [...pageEls(), ...[ui.data, ui.panel].filter((el) => el && !(el === ui.data && keepsOnSwipe(swipeDx)) && !el.hidden && el.childElementCount && !el.classList.contains('pz-leave') && !el.classList.contains('pz-hide') && !('zoomed' in el.dataset))];
  let shadeAnim = null, pageForce = false;   // (the glass's entrance; pageForce: a swipe the card followed out, so its words leave even if the next slide's are the same)
  const lastBeat = (i) => beatCount(slides[i]) - 1;
  // (R05: the slide going in and its neighbours prepared as one set ahead of the press; a newer press cancels an older one's jobs.
  // slide-prep.js.)
  // (recs-production-120hz §6: the tool's warm is returned, so its completion is awaited; the manifests belong to this deck, this
  // presentation's states and this look: identity.)
  const slidePrep = createSlidePrep({ count: () => slides.length, calm: () => !inMotion() && !busy && !prepT, identity: () => `${deck?.id ?? ''}|${slides.length}|${prepRev}|${document.documentElement.dataset.theme || ''}/${document.documentElement.dataset.palette || ''}|${glEpoch()}`, steps: {
    state: (i) => stateReady(i),
    glyphs: () => loadGlyphs(),
    tool: (i) => { const s = slides[i]; return s ? warmOf(s, ctxOf(s, i)) : null; },   // (B16: a throw or rejection reaches slide-prep, which marks the manifest failed; safe() would have turned it into null = ready)
    shadersFailed: () => shaderFailures(),
    shaders: (ms = 4) => prepareShaders(ms),
  } });
  // (B17: a GL context lost and restored drops every slide's readiness (its glyph, shader and card resources were that context's), and the
  // slide in view and its neighbours are prepared afresh; glEpoch() is part of the identity above.)
  onGLRestored(() => slidePrep.refresh());
  // (Review pass 2, priority 3: each Next, Back or jump is one transaction, slide-txn.js. Its id supersedes the one before at once: that
  // change's jobs stop, its prep hold lets go, and the move in flight is cut at its next step (cut() asks txn.live()). The cards on their
  // way out are disowned (inert) from the press until this change's cards come in, so a card leaving or held out of sight takes no tap.)
  const txns = createTxns();
  let txn = null;
  const phaseNote = () => { const q = txns.stats(); return q.phase ? ` (stuck in ${q.phase} for ${Math.round(q.since)} ms)` : ''; };
  // (R03: the timers one talk starts belong to its scope, which stopNow disposes; a timer also acts only on the cards it was set for.)
  let sess = null;
  const stimer = (fn, ms) => { const u = ui; return sess ? sess.timer(() => { if (ui === u) fn(); }, ms) : 0; };
  const txnLive = (t) => !t || t.live();
  function go(i) {
    if (!deck || leaving) return;
    dispatchEvent(new Event('pps:go'));   // (the ?perf readout's slide-change window; nothing listens otherwise)
    ink?.clear();   // (N2: the pen's strokes belong to the slide they were drawn on)
    ui?.scope?.close();   // (the scope view shuts as the slide turns, not when the next one lands; Mohammad 6 Nov 2026)
    // (A case or question card standing is lifted by the press, as a tap would: a pick from the slide list, a typed number, Back, Home or End
    // must go to the slide asked for. The new slide's change waits for the card's lift (caseLifted, caseEnd), so with the card left standing it
    // waited for a swipe that never came. Mohammad, 6 Nov 2026: "i click slide selector and switch to a different slide it doesn't obey".)
    if (caseCard && !caseCard.lifted) caseGone(caseCard);
    turn = i === want + 1 || firstBeat ? 'next' : i === want - 1 ? 'back' : 'jump';   // (the slide before or after, by whatever key or button: a turn; further: a jump)
    want = clamp(i, 0, slides.length - 1);
    const tx = (txn = txns.begin({ to: want, dir: turn }));
    slidePrep.aim(want, turn, tx ? tx.live : undefined);
    noteResume(deck.id, want, slides.length);   // (the Present menu offers to resume here; the first or last slide forgets it)
    if (ui) delete ui.root.dataset.pzDegraded;   // (R05: a press starts clean)
    beat = firstBeat ? 0 : lastBeat(want);
    paintChrome();
    // (A zoomed card glides back first: the slide is laid out, and its cards kept or changed, with the card where it rests.)
    // (R02: the change and the deck it began under; a continuation after a newer change or another talk does nothing, that one lays out its own.)
    if (zoomOn()) { const d0 = deck; ui.zoom.close().then(() => { if (deck !== d0 || !txnLive(tx) || txn !== tx) return; paintZoom(); zoomMissed = false; if (deck && !busy) run(); }); return; }   // (the slide lays everything out afresh)
    const goOn = () => {
      clearTimeout(prepT); prepT = 0;   // (a wait for an earlier press that has not ended: this press is answered now, so nothing is waiting)
      if (busy) outNow();
      if (!busy) run();
    };
    // (The cards that show are thrown on the press, before the wait for the slide's preparation: the throw takes about 170 ms to clear, which covers
    // most of the PREP_MS hold, so a Next on a slide not yet prepared answers at once. Push B, item 4 step 3. A card the plan is not known for stays.)
    if (!slidePrep.ready(want)) { outNow(); prepHold(want, goOn); } else goOn();
  }
  // (R05: the cards that show stay where they are until the slide going in is prepared (slide-prep.js ready: its state, glyphs, data card
  // and shaders), so the new card never comes in empty; at most PREP_MS, so a Next is still answered at once. A newer press takes over.)
  const PREP_MS = 160;   // motion-scale: not a move (a budget for a slide's preparation)
  // (A talk opening has nothing to answer: its cover is up, so the first slide waits for its preparation up to PREP_BOOT_MS, not PREP_MS. On Mohammad's
  // iPhone the lap of 13 Nov 2026 showed the opening slide unprepared ("prep-preparing"): its data card and shaders needed more than 160 ms.)
  const PREP_BOOT_MS = 1500;   // motion-scale: not a move (a budget for the opening slide's preparation, under the cover)
  let prepT = 0;
  // (R05: a slide shown before its preparation or its instrument's window was complete says so: the root's data-pz-degraded names what was
  // missing ('prep-preparing', 'prep-failed', 'prep-unprepared', 'window') until the next press, and degraded() counts them. The time limit
  // keeps a Next answered at once; it no longer passes for readiness, and a manifest that failed or never began is prepared afresh.)
  const degraded = { n: 0, last: '', clipped: [] };   // (clipped: the cards that ended their fit with words cut off, 'card-clipped:<slide>:<card>', each once)
  const degrade = (why) => { degraded.n++; degraded.last = why; if (ui) ui.root.dataset.pzDegraded = why; };
  function prepHold(i, then) {
    clearTimeout(prepT);
    const t0 = performance.now(), tx = txn, budget = booting ? PREP_BOOT_MS : PREP_MS;
    txn?.onRelease(() => { clearTimeout(prepT); prepT = 0; });
    const look = () => { prepT = 0; if (!deck || want !== i || !txnLive(tx)) return; if (slidePrep.ready(i)) then(); else if (performance.now() - t0 >= budget) { const st = slidePrep.state(i); degrade('prep-' + st); if (st !== 'preparing') slidePrep.aim(i, turn, tx ? tx.live : undefined); then(); } else prepT = setTimeout(look, 16); };
    prepT = setTimeout(look, 16);
  }
  // (Mohammad, 2 Nov 2026: "when i hit next it takes time to move out of the way. it should all be responsive". A Next while the last
  // change still runs (its landing and after-steps: busy) went to it only once that had finished. The cards that show leave now, on the
  // tap, together, as wordsOut throws them; the change for the new slide takes them from there (card-throw.js throwOutNow). ?instant=0:
  // as before.)
  // (A slide change is under way from the press, not from run(): a press whose slide is not prepared yet waits in prepHold, up to PREP_MS,
  // with busy still false. A swipe let go in that wait was taken for a swipe that changes nothing: its card eased back to the middle, and
  // then, when the wait ended, left from there, and pageForce was dropped so a slide with the same words kept its card. 2 Nov 2026.)
  const changing = () => busy || !!prepT;
  function outNow() {
    if (!ui || reduce.matches || (turn !== 'next' && turn !== 'back')) return;
    const showing = (el) => !el.hidden && !!el.childElementCount && !el.classList.contains('pz-leave') && !el.classList.contains('pz-hide') && !throwing(el) && !throwPinned(el);
    // (A data card the next slide keeps (card-keep.js keepData: the same instrument, a patient it can ride to) stays where it is and glides
    // to the new numbers, never thrown out and built again (Mohammad, 2 Nov 2026: "if the graph is gonna change, it should TRANSITION not just
    // pop out and in").)
    const nx = slides[want], pl = nx ? planOf(nx, want) : null;
    // (A plan not yet known (undefined: a state its tiles' ring is counted from is still being computed, as on a phone at the press) is not "thrown out": the card
    // waits where it is, and the slide's own change keeps it or lets it go, as it does for a card the press found stays. Thrown out on the press and then kept
    // a moment later, it left and came back: Mohammad, 3 Nov 2026, the iPhone's Next with the same instrument on the next slide.)
    const keeps = !!nx && !!shown && (pl === undefined && !!dataOn || keepData({ from: dataOn, to: pl, prev: slides[shown.i], next: nx, swap: stateOf[want] !== shownState || liveOff }));
    const els = [ui.text, keeps ? null : ui.data, ui.panel].filter((el) => el && showing(el));
    if (!els.length) return;
    if (els.includes(ui.text) && !ui.shade.classList.contains('pz-leave') && ui.shade.style.opacity !== '0') els.push(ui.shade);
    const wOf = (el) => (el === ui.panel ? Math.min(readMetric(el, 'offsetWidth'), innerWidth * 0.5) : readMetric(el, 'offsetWidth'));
    throwDir = turn;
    throwD = Math.min(innerWidth, Math.max(120, ...els.filter((el) => el !== ui.shade).map(wOf)) + RAIL_GAP);
    for (const el of els) throwOutNow(el, turn, throwD);
    txn?.own(els);   // (out on the tap: no tap reaches them on their way)
  }
  const next = () => {
    if (caseLift) { caseLift(); return; }
    if (lapseOn && lapseLeft > 0 && shown?.i === want) skipLapse();
    else if (procNext()) return;   // (a procedure's next step: proc-anim.js)
    else if (shown?.i === want && ui.tools?.step(1)) return;   // (the card's next reading: the HVPG tracing, tool-hvpg.js)
    else if (beat < lastBeat(want)) toBeat(beat + 1);   // (the slide's next view of the figure)
    else if (want < slides.length - 1) { firstBeat = true; go(want + 1); firstBeat = false; } else stop();
  };
  const prev = () => { if (procBack() || (shown?.i === want && ui.tools?.step(-1))) return; if (beat > 0) toBeat(beat - 1); else if (want > 0) go(want - 1); };
  // (N1: the presenter view's window: the slide on show goes to it, its Next, Back and jumps come back as the keys do.)
  const pview = createPresenterLink({ onBlocked: () => toast('Allow pop-ups to open the presenter view', '', { present: true }),
    onCmd: (m) => { if (!deck || leaving) return; if (m.c === 'next') next(); else if (m.c === 'prev') prev(); else if (m.c === 'go' && Number.isFinite(m.i)) go(clamp(m.i | 0, 0, slides.length - 1)); } });
  // A beat asked for: the cards stay, the figure moves (beatMove, run). A zoomed card glides back first, as for a slide.
  function toBeat(k) {
    if (!deck || leaving) return;
    dispatchEvent(new Event('pps:go'));
    beat = clamp(k, 0, lastBeat(want));
    paintChrome();
    if (zoomOn()) { const d0 = deck, t0 = txn; ui.zoom.close().then(() => { if (deck !== d0 || txn !== t0 || !txnLive(t0)) return; paintZoom(); zoomMissed = false; if (deck && !busy) run(); }); return; }
    if (!busy) run();
  }
  async function run() {
    busy = true; announce();   // (the cards are changing: a reader waits for them, aria-busy)
    try {
      // (A move that ends without landing and without being cut, for the same slide twice running, is not tried a third time: a
      // slide that could not land had the loop rebuild it without end, and the talk froze. Next or a jump tries it again.)
      // (The transaction's id is in the key: a newer press for the same slide is a new try, never counted against the one it cut.)
      let tries = 0, key = '';
      while (deck && (!shown || shown.i !== want || shown.gen !== gen || shownBeat !== beat)) {
        const landed = !!shown && shown.i === want && shown.gen === gen, k = `${want}|${gen}|${txn?.id || 0}|${landed ? beat : ''}`;
        tries = k === key ? tries + 1 : 1; key = k;
        if (tries > 2 && landed) { console.warn(`presenter: slide ${want + 1}, view ${beat + 1}, did not land${phaseNote()}`); break; }
        if (tries > 2) { console.warn(`presenter: slide ${want + 1} did not land${phaseNote()}`); break; }
        if (landed) await beatMove(want, beat); else await transition(want);
      }
    } catch (e) {
      // (A slide that threw has put its cards back (transition's last step), and the talk goes on: Next or a jump tries again.)
      console.error(`presenter: slide ${want + 1} could not be shown`, e);
      busy = false; announce(true);
    } finally { busy = false; announce(); }
  }
  // Inside the liver a slide change is one sequence: every label (text, pill, ring, leader) eases out together, the
  // camera moves and the lit set changes with nothing showing, then only the new slide's labels ease in together
  // (.app.pz-hush; while it holds, no other state can bring a label back for a frame).
  const HUSH_OUT = D_SMALL, HUSH_IN = D_SURFACE;   // (app.css .pz-hush: the labels out over a small step, back over a surface step)
  let hushed = false, hushAt = 0, hushInT = 0, lastCam = null;
  // The liver labels' own eases still running (by property or animation name); getAnimations also starts any pending one.
  // (sel: only the eases of what matches it; the label fades are opacities, app.css, so they are told apart by what they move.)
  async function eased(props, cap, sel) {
    const run = readAnims(document).filter((a) => a.effect?.target?.closest?.('.lz, .sv') && (!sel || a.effect.target.matches?.(sel)) && (props.includes(a.transitionProperty) || props.includes(a.animationName)));
    if (run.length) await Promise.race([Promise.all(run.map((a) => a.finished.catch(() => {}))), wait(cap)]);
  }
  function hush() {
    if (hushed) return;
    hushed = true; hushAt = performance.now(); clearTimeout(hushInT);
    app.classList.remove('pz-hush-in'); app.classList.add('pz-hush');
  }
  async function unhush(cut) {
    if (!hushed) return;
    // Back only once the camera or the sinusoid has landed (its labels laid out there) and the lit set's own eases
    // (a label lit or not, a caption's entrance) have run, unseen.
    await until(() => cut() || (store.get().sinusoid ? !!document.querySelector('.sv.on .sv-region') : !document.querySelector('.lz.lz-sin')), 2500);
    await waitCut(80, cut);
    await eased(['opacity', 'sv-fade-in'], 1500, ':is(.lz-lab, .lz-zone, .sv-region)');
    if (cut()) return;
    hushed = false;
    app.classList.add('pz-hush-in'); app.classList.remove('pz-hush');
    clearTimeout(hushInT); hushInT = setTimeout(() => app.classList.remove('pz-hush-in'), HUSH_IN + 50);
  }
  // The corner credit sits out a slide change (data-pz-moving on #app, read by src/ui/credit.js): it fades as the cards leave and
  // comes back once, at its final spot, after the cards are in and the camera has eased to fit around them.
  // (R02: the credit's hold and the camera's home hold are counted leases: every take gives back once, and only its own, so a move that was cut,
  // thrown or finished twice cannot release what a newer move took. creditT: the timer that lifts the credit's hold.)
  let creditT = 0, endChange = null;   // (endChange: the running change's end for settling(), given back as the slide lands, not when its time-lapse has played)
  const creditLease = createLease(() => { clearTimeout(creditT); app.toggleAttribute('data-pz-moving', true); }, () => {
    clearTimeout(creditT);
    creditT = setTimeout(() => { if (!creditLease.count()) app.toggleAttribute('data-pz-moving', false); }, 120);   // (the cards come in after the one camera move; src/ui/credit.js then waits for any card still sliding)
  });
  const homeLease = createLease(() => stage.holdHome(true), () => stage.holdHome(false));
  async function transition(to) {
    // (A card still zoomed as a slide starts, a move that did not come by go, a slide asked for while the days of a time-lapse played, or a new
    // text size: it glides back first, never snaps.)
    // (R02: the deck, the cards and the change this move began under; after any await, a move whose deck or cards are not these is not this move's to touch.)
    const deck0 = deck, ui0 = ui, tx0 = txn;
    if (zoomOn()) { await ui.zoom.close(); if (deck !== deck0 || ui !== ui0 || (tx0 && txn !== tx0)) return; paintZoom(); zoomMissed = false; if (!deck || !ui) return; }
    const homeOff = homeLease.take(), creditOff = creditLease.take(), changeOff = (endChange = beginChange());   // (changeOff: background work that can wait does, until this change lands: frame.js settling)
    // (A move that did not come by go (a new text size, a redraw) is a transaction of its own too.)
    if (!txn?.live()) txn = txns.begin({ to, dir: 'redraw' });
    const tx = txn;
    try { await transitionRun(to); } finally {
      // (R02: what this move took is given back whatever ended it; what is on screen and shared (the kept cards, the case card, the glass, the
      // figure) is changed only while this move is still the current change of the same talk, never by one that a newer move or another deck replaced.)
      homeOff();
      const mine = !!tx?.live() && deck === deck0 && ui === ui0;
      if (mine) { keepNow = NO_KEEP; keepSnap = null; keepBad = []; keepArgs = null; caseShut(); }
      // (A move cut by a newer slide leaves its cards unseen: that move fades nothing out, and Next pressed in a row waits no step for cards
      // that were brought in for a moment. A move that ends otherwise still brings its cards in.)
      if (mine && bare && want === to) { bare = false; layout(); cardsIn(); }
      // (3 Nov 2026, his iPhone: the figure stood dimmed behind a card that stopped part way in. A move that ended any way but landing, a throw
      // from one of its steps, left the figure faded out (figureOut), with only figureIn, further down the move, to bring it back: a move that
      // is the current one and is over gives the figure back whatever ended it.)
      if (mine && want === to && view.classList.contains('pz-out')) figureIn();
      if (mine) turnDone();
      if (mine && want === to) for (const [step, ms] of slowSteps(tx.trail, performance.now())) if (ms >= 400) gpuProbe.note(`slow slide step: ${step}`, ms);   // (?perf: where a slow change spent its time)
      if (mine && want === to) tx.end();   // (landed, or given up for this slide: its cards' input is given back; a newer change keeps its own)
      creditOff(); changeOff();
    }
  }
  async function transitionRun(to) {
    const g = gen, tx = txn, s = slides[to], cut = () => !deck || want !== to || gen !== g || !txnLive(tx);
    caseExit = false;
    stage.railEnd?.();   // (the last slide's one move lets go: this slide's framing, catheter or procedure moves are its own)
    // The slide on screen is leaving, so a move cut short never counts as showing it: going back and forward again to that
    // slide (summary table included) draws it afresh instead of leaving the half-changed screen.
    stage.handClear?.();   // (a new slide frames the figure itself: a pinch on the last one does not hold)
    scalePick = null; const was = shown;   // (a flip of the scale is a detour: every slide opens on its own scale; was: the slide on screen, for the cards it may keep)
    shown = null; entering = null;
    // A time-lapse starts from the slide before's state; a catheter slide drives its own camera.
    // Coming back to it from a later slide shows its end at once: it plays only going forward.
    const back = to < lastAt, lap = !!s.lapse && to > 0 && !back, ct = !s.visual ? s.cath || null : null;
    // (What the figure shows: the slide, framed where its days end when they are not played: lapse.cam.)
    const b0 = Math.min(beat, lastBeat(to)), fv = figView(beatView(s, b0), lap); fig = { i: to, s: fv }; push = null;
    const cam = fv.visual ? fv.cam || null : fv.cam || 'fit';
    // Leaving the lobule: the organs' picture for the way out is begun at once, while the old words leave and the new ones come in,
    // so the rise does not wait for it (stage.js prepRise; it does nothing outside a landed lobule).
    if (!LOBULE_CAM.test(cam || '')) stage.prepRise?.();
    insetsGo();   // (a change cut short: its held room goes now)
    if (cam && !ct && !LOBULE_CAM.test(cam) && !booting && !reduce.matches && !store.get().lobule && !store.get().sinusoid) insetsHold();
    // And the lobule's framing is held in the space the leaving slide's cards left, before the new cards change it: they come in
    // before the rise, and a lobule that followed them zoomed in and down before going out (Mohammad, 21 Oct, Ascites 4 to 5).
    if ((!s.visual && s.cath) || (cam && !LOBULE_CAM.test(cam))) stage.lobuleHold?.(true);
    // A question card is shown only stepping onto the slide going forward (never on a jump or Back). A slide that changes the model then lands
    // holding the state before it, and its change plays once the card is lifted (answerPlay, or its time-lapse). A slide whose answer is a
    // control the learner moves, or a visual, changes nothing and holds nothing.
    const ask = questionable(s, to, ct), holdQ = ask && !s.visual && (!!s.lapse || changes(s));
    // A slide without breathing stops it on the live figure at once, before its probe is placed: otherwise its Doppler
    // trace records the leaving patient's breathing until the slide's own state eases in (the Doppler talk's meal slide).
    if (s.params?.respiration === false && store.get().params?.respiration !== false) {
      host.send({ type: 'breath', on: false }); replaceParams({ ...store.get().params, respiration: false });
    }
    // In the liver, with a new framing or new lit labels: all labels out first (see hush).
    const inLiver = store.get().lobule || store.get().sinusoid;
    const litNext = !s.visual ? slideTargets(fv).lit.join(' ') : '';
    if (inLiver && !booting && (hushed || cam !== lastCam || litNext !== (app.dataset.lit || '') || s.visual || ct)) hush();
    // The cards fade out first, and are on screen fading (two frames painted) before anything changes on the figure: the marks,
    // the lens and the glows can each cost a long frame, which would otherwise swallow the fade.
    // Which cards stay: the data card when this slide's is the same instrument and tiles, the words when they are the same (keepFor).
    // (The patient changes as transitionRun counts it below: a time-lapse plays from the slide before's state, or from a start of its own.)
    // (A slide that plays its procedure, going forward, opens on its state before it: no TIPS yet, the shunt still open. The stent or
    // the closed shunt appears only at the step that makes it, and its words keep the numbers it ends on: his ask, 29 Oct.)
    // (Only Back from the slide after it lands on it done; a jump back to it, like any other way in, opens before it.)
    const done = back && lastAt === to + 1, pre = !lap && !done && to > 0 && !!s.procedure && stateOf[to] === to && !holdQ;
    const si = lap || holdQ ? stateOf[to - 1] : stateOf[to];
    keepNow = keepFor(was && slides[was.i], s, to, si !== shownState || liveOff || (lap && !!states[stateOf[to]]?.start) || (pre && !!states[to]?.before), { again: !was || was.i === to }); keepCut = cut;
    // (A swipe the card followed out never leaves its words standing: they go on out from the finger, and the next slide's come in.)
    if (pageForce) { pageForce = false; if (keepNow.text) keepNow = { ...keepNow, text: false }; }
    glassTurn(s, ask, ct);
    if (ui) tx?.own([keepNow.text ? null : ui.text, keepNow.text ? null : ui.shade, keepNow.data ? null : ui.data, ui.panel]);   // (leaving: no input until this change's cards come in)
    // (Thrown cards: wordsOut asks for no fixed floor (outMs 0). throwsOut() below ends when they are out of sight on the eases' clock, about 170 ms
    // in, not at the D_SMALL + 20 the fade needed: the 90 ms after that were an empty slot. The two painted frames stay: the throw is seen begun
    // before the marks and the lens can make a long frame.)
    const outAt = performance.now(), outMs = wordsOut(s), thrown = thrownNow;
    // A new patient that dims the figure while it changes (dip, below): the figure starts to dim with the old cards' leave, not after it, so the
    // slide's camera move, which frames the new patient's organs, sets off one fade sooner after the press (16 Nov 2026, his Mac: Sites and causes
    // 9 to 10, Acute variceal bleed 3 to 2 and 16 to 17 started 0.9 to 1.3 s after it). Not behind a case or question card (it covers the change),
    // nor with a catheter up (its own way out dims the figure).
    const dimmed = !booting && !reduce.matches && !!ui && freshPatient(s, lap, pre) && shownState >= 0 && (si !== shownState || liveOff) && !ask && !(s.vignette && !noCase && to > lastAt) && !cath.on && !view.classList.contains('pz-out') ? figureOut(cut) : null;
    tx?.phase('leave');
    if (outMs || thrown) { await painted(); await painted(); }
    tx?.phase('left-painted');   // (the two frames the leave is seen begun in: each step of the leave is named, so a slow one is found by its name)
    if (cut()) return;
    // Words out, and the marks: they belong to the slide that is leaving.
    markBase = null;
    stage.explainClear?.();   // (a label explained by a tap goes with the slide: label-explain.js)
    store.set({ focus: null, stented: stentedKept(s), presentLabels: [], presentTerms: null, lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
    figureHooks('clear');   // (and what a deck visuals package put on the figure: slide-ext.js)
    // The slide's lens belongs to its scene (T1, A6): the leaving scene keeps its own colours until it has gone, and the new one arrives in
    // its own. The figure crossfades to the slide's colours (stage.js) once, as its scene comes in: under the dip or the case card as a new
    // patient is put in, as a patient's change starts, or else with the camera's move to the slide. (It changed here, as the old words left,
    // and the leaving scene, its catheter and readings still up, was recoloured in place: the blue hepatic veins turned teal.) A visual over
    // the figure keeps the colours already showing.
    let lensDone = !!s.visual;
    const lensGo = () => { if (lensDone || cut()) return; lensDone = true; const lens = slideLens(s); if (store.get().colorMode !== lens) store.set({ colorMode: lens }); };
    if (!hushed) delete app.dataset.lit;   // (hushed, the lit set goes straight to the next slide's: a label on both keeps its pill)
    // (Back onto a procedure's slide from the next lands on it done, so Next moves on.)
    strainStop(); stopLapse(); procStop(); abSlow(); handOn = false; procDoneAt = done && s.procedure ? to : -1; procThenAt = -1; procQueued = false;
    // (Landed on done, the last step is the one on show, as it stands after the play-through; a slide arrived at forward shows none until its first Next.)
    procShown = procRing = procDoneAt === to ? procSteps(s).length - 1 : -1; procShownAt = procRingAt = procDoneAt === to ? to : -1;
    tx?.phase('fade-out');
    if (outMs) await waitCut(Math.max(0, outMs - (performance.now() - outAt)), cut);
    if (throwDir) await throwsOut();   // (thrown: until the old cards are out of sight on the eases' clock, never mid-flight: card-throw.js)
    // (Nothing in the liver changes until its labels are gone.)
    tx?.phase('hush-out');
    if (hushed) { await waitCut(Math.max(0, HUSH_OUT - (performance.now() - hushAt)), cut); if (cut()) return; await eased(['opacity'], 600, '.lz-labels'); if (cut()) return; }
    if (cut()) return;
    // (A flip of the scale still moving stops at its next step, cut by this slide: its camera is let finish before the slide's own.)
    if (flipping) { await until(() => !flipping, 9000); if (cut()) return; }
    // Out of the lobule while the old patient is still there, so the rise reads as leaving the liver. (With the same patient it waits
    // for the new slide's words, which set the space the camera frames into, so the rise is one zoom straight to the slide's framing:
    // see camera.)
    const inAnatomy = !ct && cam && !LOBULE_CAM.test(cam) && (s.view || 'anatomic') === 'anatomic';
    // (A Circuit slide with the same patient waits for camera() too: it frames the Circuit region as the lobule is left, one move, see toAnatomy.)
    const inView = inAnatomy || (!ct && !!cam && !LOBULE_CAM.test(cam) && s.view === 'circuit');
    const outNow = (ct || (cam && !LOBULE_CAM.test(cam))) && (store.get().lobule || store.get().sinusoid) && (!inView || si !== shownState || liveOff);
    // (The lobule's layers change as this slide asks once the lobule is left, when it is left here: the zone bands the leaving
    // slide showed stay on the lobule through its way out, never switched off and repainted on it just before.)
    if (!outNow) slideLayers(s);
    // The catheter leaves with its slides. (Only a new patient on the first slide or with reduced motion fades the figure, which takes
    // it; otherwise the patient eases in after (morphTo) and the figure never dims, so the catheter retracts and fades on its own.)
    if (!!s.wash !== !!store.get().sinusoidWash) store.set1('sinusoidWash', !!s.wash && !s.visual);   // (the wedged column's wash in the sinusoid view: only a slide that says wash)
    tx?.phase('cath-out');
    // (Onto a slide with no catheter of its own, where the figure does not dim: the catheter's way out, 700 ms, runs under the slide's camera move,
    // which sets off with the press, and is waited for before the cards come in. 16 Nov 2026, his Mac: Carvedilol 5 to 4 started 3 s after the
    // press. A tracing card's own catheter (beside) waits for this one to have gone, as before.)
    const cathAside = cath.on && !ct && !beside(s) && !(si !== shownState && shownState >= 0 && (booting || reduce.matches || freshPatient(s, lap, pre)));
    const keepAt = s.cathKeep && !ct ? to : -1, cathGone = cathAside ? cathOut(false, cut, keepAt) : null;
    if (!cathAside && cath.on && (!ct || si !== shownState)) { await cathOut(si !== shownState && shownState >= 0 && (booting || reduce.matches || freshPatient(s, lap, pre)), cut, keepAt); if (cut()) return; }
    tx?.phase('to-anatomy');
    // (A Circuit slide on a new patient leaves the lobule into the Circuit in the same move, and asks the running change for the slide's region at once: the cards' last fitting is a small refit
    // after, as for an anatomy slide, see riseFor.)
    const circNew = outNow && !ct && !!cam && !LOBULE_CAM.test(cam) && s.view === 'circuit' && store.get().lobule && !reduce.matches && !booting;
    if (outNow) { await toAnatomy(inAnatomy ? riseFor(cam, fv) : ct ? cathRise(ct, cathInstant(to, lastAt), lastAt) : null, cut, circNew ? 'circuit' : 'anatomy'); if (cut()) return; if (circNew) frameTo(cam, fv, 1500, SLIDE_OPT); slideLayers(s); if (cut()) return; }
    // (A patient still being computed off screen: after a short wait the arc shows.)
    const lateT = states[si] && (!lap || states[stateOf[to]]) ? 0 : stimer(() => { if (!cut()) loading(true); }, 260);
    // (A time-lapse with its own params plays from them set and settled: the chain's start state, not the slide before's.)
    let own, st;
    try {
      tx?.phase('state-ready');
      own = lap ? (await stateReady(stateOf[to]))?.start || null : pre ? (await stateReady(to))?.before || null : null;
      st = own || await stateReady(si);
    } finally { clearTimeout(lateT); }   // (R03: also when a wait throws or the move is cut; the cover is not raised late for a move that has gone)
    if (!st || cut()) return;
    // A visual waits for every patient it compares (some are computed after the slides).
    // (A table waits too, but only so long: a patient still being computed after TABLE_WAIT_MS leaves its row's cells blank, and the
    // table fills them in the moment it arrives, wherever the table was built: watchRows.)
    if (s.visual === 'table') {
      await Promise.race([Promise.all(rowIdx(s).map(stateReady)), wait(TABLE_WAIT_MS)]); if (cut()) return;
      if (rowIdx(s).some((x) => !states[x])) degrade('table-rows');   // (R15: shown with placeholders for the rows still computing, and said so)
    }
    else if (s.visual || (s.tool && s.of)) { await Promise.all(rowIdx(s).map(stateReady)); if (cut()) return; }   // (a tool that plots other slides' patients, the SAAG plane, waits for them as a visual does)
    // A new patient's case (s.vignette), going forward: a centred glass card covers the figure while the patient loads behind it
    // (it stays up while the camera glides, once, to the slide's own framing; Next lifts it, and the slide's cards then come in with no further move).
    const skipCase = noCase; noCase = false;
    // (A time-lapse may open on a case too: the card covers the patient as it loads at the time-lapse's own start, and the days play after the lift.
    // That patient needs a start state, which a time-lapse step has only with params: a case slide with a lapse says params: {} at least.)
    let loaded = false;
    if (!skipCase && s.vignette && ui && !booting && (!lap || !!own) && to > lastAt && (si !== shownState || liveOff || !!own)) { if (!await caseRun(s, si, st, cut, !!own, lensGo)) return; loaded = true; }
    else if (ask) { if (!await questionRun(s, cut)) return; }
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = !loaded && (si !== shownState || liveOff || !!own);
    // (The recording instruments wait for the slide's own state: see the release once it has landed.)
    ui?.tools.hold(swap && !booting);
    // On screen the change eases (morphTo): after the camera has landed and before the cards come in, or for a catheter slide
    // (its cards come in at once) right here. Only the first slide, or with reduced motion, does the figure dim while it changes.
    const dip = swap && !booting && !reduce.matches && !own && freshPatient(s, lap, pre), glide = swap && !booting && !reduce.matches && !dip, later = glide && !ct && !!ui;
    // (The new cards, built and settled unseen: a new patient's while the figure dims (below), so the camera, which frames into the room
    // they leave, need not wait for them after the change. 16 Nov 2026, circuit 8 to 7 and 8 to 9: the cards were built only once the dim
    // and the new patient's first frame were done, and the move set off 0.9 s after the press.)
    const wordsUp = async (said) => {
      ui?.root.classList.add('pz-prep');
      // (A catheter slide comes in at once: its teaching card carries the live tracing, which stays on screen through the
      // measurement while the catheter drives the camera.)
      bare = !booting && !!ui && !ct;
      wordsIn(s, said, to, swap, lap, st);
      // (Bare, the teaching card and its glass stay out whole until the camera has landed, never an empty card first. Behind a case
      // card they also stay out until it is lifted, a catheter slide's included: its words would otherwise come in under the case.)
      if (keepNow.text) { /* (kept words stay on screen as they are) */ }
      else if (bare || caseCard) { ui.text.classList.add('pz-leave'); ui.root.dataset.bare = ''; }
      tx?.phase('settle');
      await settleRun(tx);
    };
    let morphCt = null, drawnP = null;
    let wordsP = null;
    if (swap) {
      liveOff = false;
      tx?.phase('morph');
      // (A catheter slide's cards come in over the patient's change, not after it, where the organs are on the GPU and a frame stays short: the words carry the slide's own readings. The catheter still waits for the change, below.)
      if (glide) { shownState = -1; if (!later) { lensGo(); if (ct && stage.canDrift?.()) { morphCt = morphTo(st, cut); } else { if (!await morphTo(st, cut)) return; shownState = own ? -1 : si; } } }
      else {
        if (dip && ui && !lap && !holdQ && !own) wordsP = wordsUp(st);   // (built while the figure dims: a new patient's words are its own state's)
        if (dimmed) { await dimmed; if (cut()) return; }   // (begun with the old cards' leave)
        tx?.phase('dimmed');
        if (shownState >= 0 && !view.classList.contains('pz-out')) { await figureOut(cut); if (cut()) return; }
        lensGo(); applyState(st); shownState = own ? -1 : si;
        // (The camera frames the new patient's organs, which the engine's first frame of the new state draws (its sizes come with the state); the
        // figure stays dim until that state's pressures have also come through (drawn), which can take most of a beat. 16 Nov 2026: circuit 6 to 7,
        // the camera waited 840 ms for them under the dim before it set off. It now sets off on the first frame, and the dim lifts after drawn.)
        drawnP = drawn(st);
        { const n0 = frames; await until(() => cut() || frames > n0, 300); await new Promise((done) => nextFrame(done)); }
        if (!dip) await drawnP;
      }
      if (cut()) return;
      // (The state is in: the recording instruments start now, their window filled with the steady state the slide opens on, tools.hold.
      // A slide whose change eases in after the camera lands does it below.)
      if (!later && !morphCt) { if (drawnP) drawnP.then(() => { if (!cut()) ui?.tools.hold(false); }); else ui?.tools.hold(false); }   // (a new patient's: once its pressures are drawn)
    }
    // With a new patient and a move over the plate, the glide starts while the figure is still dim and runs on
    // through its fade back in, so the eye sees one motion, not a fade and then a move.
    // (The words come first: they set the space the camera frames into.)
    // A time-lapse's words tell where it ends ("six months on, the HVPG is {hvpg}"), so their values are the end state's.
    const said = lap || holdQ || own ? await stateReady(stateOf[to]) : st;
    if (!said || cut()) return;
    // (Its card starts from the state the time-lapse plays from, and climbs with it.)
    // The new cards are built unseen (pz-prep) and fitted at their final size before they fade in, so they never grow on screen
    // and the camera frames once, into the space they really leave (see settle).
    // The new cards are laid out and measured where they will rest while still unseen (bare), so the camera makes one eased move
    // straight to the framing that fits around them; only then do they come in, whole, and the camera stays put.
    if (wordsP) { await wordsP; if (cut()) return; } else await wordsUp(said);
    if (!bare) { await caseEnd(cut); if (cut()) return; cardsIn({ i: to, gen: g }); }
    if (cut()) return; tx?.phase(bare ? 'camera' : 'cards-in');
    // The liver's own labels light with the words, so their glow fades in during the dive rather than after it.
    if (!s.visual) app.dataset.lit = slideTargets(fv).lit.join(' ');
    let prep = null; const lead = swap && !glide && !ct && cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !reduce.matches && !booting ? (prep = bare ? unseenFit(cut) : null, Promise.resolve(prep).then((ok) => (bare && !ok ? null : camera(cam, fv, cut)))) : null;
    tx?.phase('lead');
    if (lead) { await waitCut(150, cut); if (cut()) return; }
    if (drawnP) { await drawnP; if (cut()) return; }   // (the new patient's pressures are drawn before the dim lifts, as before)
    if (swap || view.classList.contains('pz-out')) figureIn(); else loading(false);
    if (cut()) return;
    // A catheter slide with a new patient changes it before its camera moves (its cards come in at once), and the catheter then drives
    // the camera at once. While the liver and the fluid ease, the organs are the live SVG drawing (stage.js hidePlate), which every camera
    // frame paints again whole, its diaphragm mask stretched over the abdomen by the flank: the route's glide ran at about 1 fps (HVPG
    // slide 9, Budd–Chiari). So the catheter sets off once the organs are back on the GPU copy, as every other slide's camera moves over it.
    if (morphCt) { if (!await morphCt) return; shownState = own ? -1 : si; ui?.tools.hold(false); }   // (the change that ran under the cards has landed: the catheter and the instruments now start)
    if (ct && swap && glide) { await until(() => cut() || stage.organsSettled(), CATH_SETTLE_MS); if (cut()) return; }
    // Behind a case card the camera holds the whole patient until the tap; then it zooms to the slide as the card fades.
    if (caseCard) { await caseLifted(cut); if (cut()) return; caseExit = true; }   // (the camera is at the whole patient, not at the last slide's framing: the move in takes the time the move out took)
    // (The scene's colours cross with the camera's move to the slide, when no change of patient brought them in already.)
    lensGo();
    // One move: over the plate, outside the liver, the cards come in as the glide ends (plate), and a change of patient eases
    // under the glide (under) where the figure can move smoothly while its organs change. (Not behind a question's card: the change
    // would play out unseen before the lift; there it waits for the landing, as before.)
    const plate = bare && !ct && !!cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !store.get().sinusoid;
    const under = plate && later && !caseCard && underTool(s.tool) && !!stage.canDrift?.() && (fv.view || 'anatomic') === store.get().view;
    let morphP = null;
    if (under) {
      if (keepNow.data && keepNow.swap) followData(s, to, st, cut);
      // (data-pz-morph-under on #app while it runs: the cards may come in over it, so the checks do not hold the data card to it as to data-pz-morph.)
      app.toggleAttribute('data-pz-morph-under', true);
      morphP = morphTo(st, cut, MORPH_ONE_MS, false).finally(() => app.toggleAttribute('data-pz-morph-under', false));
    }
    // (Same patient over the plate: the unseen cards' last fitting, two frames and a smooth one, runs under the glide's first frames, so
    // the cards come in once a quarter of it has run on any machine, not after it has landed. A new patient's waits for its change.)
    let bareSeen = false;
    const prepWith = plate;   // (the unseen cards' last fitting runs BEFORE the camera frames, never under its first frames: a fitting that changed the room after the framing sent the camera back the way it came, Mohammad, 16 Nov 2026, Carvedilol 3 to 4)
    // A way out of the lobule or sinusoid onto the plate (same patient): the cards come in first, then the camera zooms out (camera() expects them in); they used to wait for the whole 2 to 6 s way out. 16 Nov 2026 play-test, Circulation 6 to 7.
    if (bare && !!ui && !ct && !swap && !caseCard && !!cam && !LOBULE_CAM.test(cam) && (store.get().lobule || store.get().sinusoid)) { stage.lobuleHold?.(true); await unseen(cut); if (cut()) return; if (!await ui.tools.ready(900)) degrade('window'); await caseEnd(cut); if (cut()) return; const at = { i: to, gen: g }; bare = false; cardsIn(at); tx?.phase('cards-in'); await waitCut(60, cut); await until(() => cut() || !cardsEntering(), 1200); if (cut()) return; }
    tx?.phase('cath-in');
    if (ct) await cathTo(ct, st.fp, cut, cathInstant(to, lastAt), lastAt);
    else if (lead) await lead;
    else if (cam) { if (prepWith) { prep ||= unseenFit(cut); if (!await prep) return; } await camera(cam, fv, cut, plate ? CARDS_AT : 0); }
    insetsGo();   // (no glide set off after all, a lobule's or a held one: the room is written now)
    if (cut()) return;
    if (cathGone) { await cathGone; if (cut()) return; }   // (the catheter that went out under the move has gone before the cards come in)
    if (bare) {
      // (A glide's last frame can land just after the wait that timed it: the cards wait for the camera to be still. In one move they
      // come in over its last part instead, unless the patient changes after the landing: that change must not start mid-glide.)
      if (!plate || (later && !under)) await until(() => cut() || !stage.gliding(), 1500);
      if (cut()) return;
      // The camera is still: the patient changes now, unhurried, and the cards come in only once it has.
      // (A kept data card stays up through it, its readings riding the model as it eases: followData.)
      if (later && !under && keepNow.data && keepNow.swap) followData(s, to, st, cut);
      if (later && !under) { if (!await morphTo(st, cut, MORPH_ONE_MS)) return; shownState = own ? -1 : si; ui?.tools.hold(false); }
      // The cards fade in once the figure is quiet: after a new patient, once the organs' picture is redrawn (its long frame
      // had eaten the fade), and in any case only when frames come smoothly (see smooth).
      if (swap && !under) { await until(() => cut() || stage.organsSettled(), 1500); if (cut()) return; }   // (not under a glide: under one the organs change as the cards come in, and the smooth-frames gate below is the only wait: a card was out of sight for the whole change)
      if (prep && !swap && !caseCard) { if (await prep) await smooth(cut, QUICK_SMOOTH); } else await unseen(cut);   // (a new patient's or a case's cards are fitted again once it is in)
      if (cut()) return;
      const filled = await ui.tools.ready(900); if (cut()) return;
      if (!filled) degrade('window');   // (a recording instrument's window is filled before its card comes in: tools.prime)
      await caseEnd(cut); if (cut()) return;
      bare = false; cardsIn({ i: to, gen: g }); tx?.phase('cards-in');
      // (Once they are in, so the size they settle at is the one the camera already framed: no second move.)
      bareSeen = plate && !swap && !caseCard;   // (no change of patient under them: the slide's marks need no model to wait for)
      await waitCut(60, cut); await until(() => cut() || !cardsEntering(bareSeen ? CARDS_SEEN : 0), 1200);
      if (cut()) return;
      // (One move: the glide the cards came in over has landed, and the change of patient under it has eased in.)
      if (plate) { await until(() => cut() || !stage.gliding(), 1500); if (cut()) return; }
      if (morphP) { if (!await morphP) return; shownState = own ? -1 : si; ui?.tools.hold(false); }
    }
    // The slide's state has landed (the recording instruments were let go at the landing, never with the leaving state's flow).
    ui?.tools.hold(false);
    if (cut()) return;   // (the marks and glows are published by the change that is current only)
    paintOverlays(fv, to, st);
    if (holdEase) { holdEase = false; holdAnswer(false); }   // (an answer slide: what its question slide held back eases in now)
    // (The cards' last step: their size is read where they rest, after it, never mid-slide.)
    // (R01: a full landing is the throws' own promise, then whatever the browser's animations still run.)
    if (bareSeen) { await Promise.race([Promise.all(throwCards().map((el) => el && throwLanded(el))), wait(1200)]); if (cut()) return; await until(() => cut() || !cardsEntering(), 1200); if (cut()) return; }
    lastCam = cam; framedSig = cardSig();
    tx?.phase('unhush');
    await unhush(cut);
    if (cut()) return;
    shown = { i: to, gen: g }; lastAt = to; shownBeat = b0; endChange?.();   // (landed: the background work that waited goes on, frame.js settling)
    // A lobule slide whose next slide leaves the lobule: once it has settled, the organs' picture for the way out is made ahead,
    // unseen under the lobule, so Next goes straight out with no wait (see toAnatomy).
    { const nx = slides[to + 1], nCam = nx ? (nx.visual ? nx.cam || null : nx.cam || 'fit') : null;
      if (nx && LOBULE_CAM.test(cam || '') && !LOBULE_CAM.test(nCam || '')) { clearTimeout(prepAheadT); prepAheadT = setTimeout(() => { if (shown?.i === to && shown.gen === g && gen === g) stage.prepRise?.(); }, RISE_AHEAD_MS); } }
    // (One pass keyed to the slide now shown, so its fold and words' room are kept from here on: a tap on Show or Hide then
    // eases the card it planned, not one measured afresh with the instrument open. The pass changes nothing on screen.)
    if (ui && phone()) layout();
    paintChrome();
    if (s.lapse && to > 0 && back) paintLapse(s, s.days, s.days, true);
    if (booting) await coverDown();
    // (The slide stands whole while its days or its answer play on the live figure: the card may zoom meanwhile, zoomReady.)
    playing = true;
    try {
      if (lap) await playLapse(s, to, cut);
      else if (holdQ) await answerPlay(s, to, cut);
      else if (s.lapse) figureHooks('lapse', s);   // (back or jumped to the slide: it shows where its days ended, the glow with it)
    } finally { playing = false; }
    if (s.procedure?.auto && !back && !cut()) procPlay(s, to);   // (like a time-lapse, it plays only going forward)
    // (Back onto a played-through slide whose scope stays parked (eusglue): the scope stands over the varix as the play-through left it, his ask, 10 Nov 2026, eus-glue-steps item 5.)
    else if (back && procDoneAt === to && specOf(procKind(s))?.parkMs && !procThen(s) && !cut()) procPlay(s, to, specOf(procKind(s)).stops.length - 1, procKind(s), 0, true);
  }

  const { paintOverlays: paintOverlays$ } = createOverlays({ app, clotMarks, ctxOf, markFocus, stage, stentedOf }, live);
  function paintOverlays(...a) { return paintOverlays$(...a); }   // <stage-split stub>
  // The fonts in and two frames for the cards' charts and refits to run, then one last fit; then the cards show (eased in).
  // (The cards were fitted unseen; once in place, every chart is lettered again for its size, before the next paint.)
  const reFit = () => { if (zoomHeld()) return; fitted.forEach(fitNow); };
  // (at: the slide coming in. Its last layout, here while it is still unseen, keys the words' lock, so the size the cards come in
  // at is the size they keep: keyed only once the slide was shown, the passes while the cards eased in measured afresh, and on a
  // tight iPad a reading settling or a chart lettered stepped the title or folded the ladder, so the card came in and then snapped.)
  // (While they fade in, the work that can wait does: frame.js holdMotion, the delay and the fade, app.css .pz-text.pz-enter.)
  function cardsIn(at) { if (ui) { if (!reduce.matches) holdMotion(D_SURFACE + 220); if (at) { entering = at; layout(); } reFit(); if (!bare) { ui.text.classList.remove('pz-leave'); txn?.restore(); wordsTurnIn(); ui.scl.classList.remove('pz-leave'); delete ui.root.dataset.bare; } ui.root.classList.remove('pz-prep'); cardIn(ui.panel, 'pz-leave'); if (ui.data.dataset.prep && !('hold' in ui.data.dataset)) { const p = ui.data.dataset.prep; delete ui.data.dataset.prep; if (!cardIn(ui.data, 'pz-hide', THROW_STAGGER)) ui.data.dataset.prep = p; } if (!bare) { const dir = throwDir || 'next'; for (const el of [ui.text, ui.shade, ui.data, ui.panel]) if (throwPinned(el)) { if (!el.hidden && el.childElementCount !== 0 && !el.classList.contains('pz-leave') && !el.classList.contains('pz-hide')) throwIn(el, dir, 0, throwD); else throwRelease(el); } throwDir = ''; } } }   // (bare: the words come in later, thrown too)
  // (A data card or panel coming in: thrown in from the side the talk goes when the old cards were thrown, else as before.
  // Its way out is forgotten in the same style change, so the leave's place never runs back across the screen under the way in.)
  function cardIn(el, cls, delay = 0) {
    if (!el.classList.contains(cls)) return true;
    // (Instant: bare, the words come in only once the camera lands, and a card thrown with them waits to come in with them, in that later
    // pass of cardsIn: out together, in together.)
    if (bare && throwDir && !el.hidden && el.childElementCount && !ui.text.hidden && ui.text.childElementCount && ui.text.classList.contains('pz-leave')) return false;
    // (Bare, the words come in only once the camera lands: a card on the rail waits to ride with them, never on ahead of them. Mohammad,
    // 2 Nov 2026: "the data card and the teaching cards move out at different paces; should go together".)
    if (throwDir && !el.hidden && el.childElementCount) throwIn(el, throwDir, delay);
    else fadeIn(el);
    delete el.dataset.out;
    el.classList.remove(cls);
    return true;
  }
  // (No way to come from (no Next or Back): the card fades in where it stands on card-throw.js's clock, not its class's CSS fade, which the
  // compositor ran on through a long frame while the card's GPU glass waited: words over no frost, then the frost in one step. card-throw.js
  // throwFade. Reduced motion keeps the class's own short fade.)
  function fadeIn(el) { if (!reduce.matches && !el.hidden && el.childElementCount && !throwing(el)) throwFade(el); }
  // The last refits that used to run as the cards came in (a ladder's strip given back its plot, the charts lettered again, the
  // layout their new sizes call for, a frame later) run while the cards are still unseen, so they come in at their final size and
  // never snap to it in view (an upright iPad's teaching card did). cardsIn's own reFit then finds nothing left to change.
  async function unseen(cut) {
    if (ui) { reFit(); layout(); await painted(); await painted(); if (cut() || !ui) return; layout(); }
    await smooth(cut, QUICK_SMOOTH);
  }
  // The same, in two parts for a move over the plate: the fitting (true once the cards are fitted, still unseen) runs under the glide's
  // first frames, and the smooth-frames gate runs where it always did, right before the cards come in.
  async function unseenFit(cut) {
    if (ui) { reFit(); layout(); await painted(); await painted(); if (cut() || !ui) return false; layout(); }
    return true;
  }
  // A time-lapse whose data card is only numbers holds that card back (unseen, at its resting place) until the days have run.
  function releaseData() { if (!ui || !('hold' in ui.data.dataset)) return; delete ui.data.dataset.hold; if (ui.data.dataset.prep) { delete ui.data.dataset.prep; if (ui.data.classList.contains('pz-hide')) fadeIn(ui.data); ui.data.classList.remove('pz-hide'); } }
  // While bare, the new slide's cards are fitted at their resting place but unseen, and the camera frames around them (see transitionRun).
  let bare = false;
  async function settleRun(tx = null) {
    if (document.fonts?.status === 'loading') { tx?.phase('fonts'); await Promise.race([document.fonts.ready, wait(400)]); }   // (only while a face is loading: its step is named)
    tx?.phase('settle-frames');
    await new Promise((done) => nextFrame(() => nextFrame(done)));
    if (!ui) return;
    layout();
    tx?.phase('keep-fall');
    await keepFall(keepCut);   // (a kept card this layout would change leaves after all, and is built again)
  }
  // A slide's lobule layers (layers: ['zones', 'lymph'] turns those on); otherwise zones off and lymph as the viewer had it.
  function slideLayers(s) {
    if (!layersBefore) return;
    const want = { ...layersBefore, zones: false, ...Object.fromEntries((s.layers || []).map((k) => [k, true])) }, now = store.get().lobuleLayers || {};
    if (Object.keys(want).some((k) => !!want[k] !== !!now[k])) store.set({ lobuleLayers: want });
  }

  // ── The slide's words, data and visual ──
  // On a phone, tiles beside a sinusoid sit under the words, so the vessel has the width of the screen.
  // (Not on a phone on its side, nor on a tablet or computer: there they sit at the top right as on other slides,
  // and the camera centres the vessel between the two cards.)
  const shortSide = matchMedia(SHORT_SIDE_MQ);
  const sinTiles = (s) => s.data === 'tiles' && !s.visual && /^sinusoid/.test(s.cam || '');
  const under = (s) => sinTiles(s) && !shortSide.matches && phone();
  // The teaching card's glass stays up through a slide change when the slide coming has a teaching card of the same kind: only the
  // words turn over, sideways the way the talk goes (turn), and the glass eases to its new size with the camera's glide (app.css
  // .pz-shade.pz-turn). It still leaves whole, as before, for a reading card or a case or question card (another kind of card), a
  // catheter or monitor slide (their words come in at once with the live tracing), with reduced motion (fades only), and when it is not
  // up to begin with. (pz-turn on the root and the glass: the words' leave and the glass's geometry ease; data-out/data-turn on the
  // words: which way they leave and come in, kept on them until they next leave or are built again, so nothing restarts their entrance.)
  function glassTurn(s, ask, ct) {
    if (!ui) return;
    const up = !ui.text.hidden && ui.shade.style.opacity !== '0' && !ui.shade.classList.contains('pz-leave');
    // (Every kind of slide coming, a question, a case, a visual, a new patient, gets the same leave: only a catheter or monitor slide,
    // whose words come in at once with the live tracing, and a case card still up (the words are already out) keep their own.)
    // (As one page, catheter and monitor slides too: only a monitor kept in place across the change keeps the old way.)
    const monKept = !!mon && !!s.monitor && !s.visual && mon.el.parentNode === ui.text;
    const on = up && !booting && !reduce.matches && pageOn({ up, caseCard: !!caseCard, monKept });
    turnNow = on ? turn : '';
    if (on) ui.text.style.setProperty('--pz-turn-d', `${turnRoom().toFixed(1)}px`);
    if (!on) turnIn = false;   // (a slide that keeps its words, or leaves whole, never fires a stale entrance)
    clearTimeout(glassT);
    setTurn(on);
  }
  function setTurn(on) {
    if (!ui) return;
    // (The glass itself always leaves and comes back with the words, never resized in view: easing a blurred glass's size made iPhone
    // Safari redraw its backdrop every frame (the camera's glide ran at a few frames a second) and drop it at once, Mohammad, 1 Nov.)
    ui.root.classList.toggle('pz-turn', on); ui.shade.classList.toggle('pz-turnfade', on);
    ui.shade.classList.toggle('pz-leave', ui.text.classList.contains('pz-leave'));
  }
  // (Once a move has landed, the glass's eases are let finish (its size: the camera's step at most) before they are switched off again,
  // so a resize or a turn of the device later moves it at once, as before; switched off mid-ease, a transition would jump to its end.)
  const turnDone = () => { clearTimeout(glassT); turnNow = ''; glassT = stimer(() => { if (ui && !busy) setTurn(false); }, D_SURFACE + 520); };
  // (Starts the cards' fade out and returns how long it runs, ms: 0 when nothing is showing.)
  function wordsOut(next) {
    thrownNow = false;
    if (!ui) return 0;
    // (A card the next slide would build the same stays where it is and leaves nothing to fade: keepFor, card-keep.js.)
    const out = [ui.text, ui.panel].filter((el) => !(keepNow.text && el === ui.text)), data = ui.data;
    pageCaught();
    if (!keepNow.text) wordsFreeze();
    // (The way the talk goes, by the key or swipe, whether or not the glass turns as a page: glassTurn leaves it off for a catheter or
    // monitor slide, a reading card and the like, and those cards are thrown too.)
    throwDir = !reduce.matches && (turn === 'next' || turn === 'back') ? turn : '';
    const up = (el) => !el.hidden && !!el.childElementCount && !el.classList.contains('pz-leave');
    const textUp = !keepNow.text && up(ui.text), panelUp = up(ui.panel);
    // The data card leaves with the words on every slide change, whole (the same ease and pace), and comes back in with the new cards:
    // never left standing while the words go, nor changed in place.
    const dataOut = !keepNow.data && !data.hidden && !data.classList.contains('pz-hide');
    if (dataOut) { data.classList.add('pz-hide'); delete data.dataset.colswap; }
    if (!keepNow.text) ui.scl.classList.add('pz-leave');   // (the scale switch leaves with the words, in their fade)
    // Leaving a visual for the figure: the veil lifts with the panel, not after it.
    if (!next?.visual) ui.veil.classList.remove('on');
    if (!dataOut && out.every((el) => el.hidden || !el.childElementCount)) return 0;
    // The catheter's monitor stays up from one measuring slide to the next: only the words around it go.
    const keep = mon && next?.monitor && !next.visual && mon.el.parentNode === ui.text;
    // Cards already on their way out or fully out (the slide was asked for again before the last one's cards came back: Next
    // pressed in a row) have nothing new to fade: the move waits only for what is still fading, never a whole step more.
    const leaving = !dataOut && !out.some((el) => !el.hidden && el.childElementCount && !(keep && el === ui.text ? [...el.children].every((c) => c === mon.el || c.classList.contains('pz-leave')) : el.classList.contains('pz-leave')));
    // (Cards on card-throw.js's way out are timed by throwsOut() when they are out of sight, not by the rest of their 560 ms: only the browser's own fades are counted here.)
    const byThrow = throwDir && !keep;
    const fading = leaving ? Math.max(fadeLeft([...out, data, ui.scl, ui.shade]), ...(byThrow ? [] : [...out, data, ui.shade].map(throwLeft))) : 0;
    if (leaving && byThrow && [...out, data, ui.shade].some((el) => throwLeft(el) > 0)) thrownNow = true;
    if (!keepNow.text) ui.text.dataset.out = turnNow;   // (set with the leave, in the same style change, so the words go the right way at once)
    // (Thrown: the data card and a panel go the same way as the words.)
    for (const el of [data, ui.panel]) { if (throwDir) el.dataset.out = throwDir; else delete el.dataset.out; }
    if (!keepNow.text) {
      // (The glass goes the same way and the same distance as its words, as one card.)
      ui.shade.dataset.out = turnNow;
      const d = ui.text.style.getPropertyValue('--pz-turn-d');
      if (d) ui.shade.style.setProperty('--pz-turn-d', d.trim()); else ui.shade.style.removeProperty('--pz-turn-d');
    }
    for (const el of out) {
      if (keep && el === ui.text) { for (const c of el.children) if (c !== mon.el) c.classList.add('pz-leave'); }
      else el.classList.add('pz-leave');
    }
    {
      // (The glass takes its leave now, with the words, in the same style change, not in the class observer's microtask after them: a
      // style read in between (the glass's own observer reads the page) laid the glass at rest for a frame, so after a swipe it jumped
      // back to the middle and slid out from there. A swipe's hold, if any, goes in the same change.)
      const goes = !keepNow.text && ui.text.classList.contains('pz-leave');
      if (goes) ui.shade.classList.add('pz-leave');
      if (pageHeld) pageHand(goes);
    }
    let threw = false;
    if (throwDir && !leaving) {
      // (Thrown, each on card-throw.js's clock from where it stands (a swipe's finger included): the words and their glass as one, a data
      // card that changes and a panel with them. Not the words around a catheter's monitor kept up: they fade around it as before.)
      const goes = [];
      if (textUp && !keep) { goes.push(ui.text); if (ui.shade.classList.contains('pz-leave')) goes.push(ui.shade); }
      if (dataOut) goes.push(data);
      if (panelUp) goes.push(ui.panel);
      // (Every card leaving sets off in this task, the tap's, on one clock and one distance, so the words,
      // their glass, a data card and a panel go together (Mohammad, 2 Nov 2026: "should go together", "it should all be responsive"):
      // a card's width and a gap, so an upright phone's card clears the screen, and the next cards come in from as far.)
      const wOf = (el) => (el === ui.panel ? Math.min(readMetric(el, 'offsetWidth'), innerWidth * 0.5) : readMetric(el, 'offsetWidth'));
      const sized = goes.filter((el) => el !== ui.shade);
      const dist = (throwD = Math.min(innerWidth, Math.max(120, ...sized.map(wOf)) + RAIL_GAP));
      for (const el of goes) throwOut(el, throwDir, dist);
      threw = goes.length > 0 && !keep;
    }
    if (leaving) return fading ? fading + 20 : 0;
    // (Every card that leaves is thrown: no floor. The move waits for throwsOut(), which is the cards' own end of sight, not a number sized for the fade.)
    if (threw) { thrownNow = true; return 0; }
    return D_SMALL + 20;   // (the words leave at the data card's pace, one small step; with reduced motion they still fade, without sliding: app.css)
  }
    // ── The answer held back ──
  // A question slide (hold: true) keeps back what would name its answer: the Gut to heart chart's red blocks and HVPG and PPG brackets, the
  // Doppler strip's direction, pattern and note, the tiles' rating words and the figure's "no flow" and "stasis" words. They are set out
  // of sight as the slide's cards are built (instant), and the next slide, its answer, comes in still holding them and lets them ease in
  // once its cards have landed (holdEase, see transitionRun).
  let heldNow = false, holdEase = false;
    let dataOn = null, textOn = null;   // (the plans of the cards on screen: null, no such card, or one built from a slide this plan does not know)
            // The start's cover (see start). While it is up (booting) the camera cuts instead of gliding.
  let cover = null, booting = false, coverT = 0, noCase = false;   // (noCase: the slide a start lands on, a reload's included, does not play its case card)
      // The free area: the open rectangles of the figure the words, the data card (where it comes to rest) and the controls leave,
  // in wrap px. The camera centres a slide's box in whichever of them shows it largest (stage boxVT).
  let frameL = 0, colT = 0, swapNow = false;
  const { NO_KEEP, TABLE_WAIT_MS, ctxOf: ctxOf$, dataIn, dataStands, deckTab, fadeLeft, followData: followData$, holdAnswer: holdAnswer$, keepFor: keepFor$, keepNote, laddersGrid, planOf: planOf$, questionable, refOf, rowIdx, rowsOf, summaryTable, textIn, wordsFreeze: wordsFreeze$, wordsIn: wordsIn$ } = createQuestion({ abPick, app, beside, besideHook, cardIn, cath, changes, dataTo, evAdopt, evDrop, getCalc, go, lapseRow, lastBeat, layout, layoutAtLanding, markLong, nextFrame, paintKey, paintScales, procEl, respFp, sinTiles, stage, stateReady, strainEl, throwCards, tileKeys, under, waitCut, whatIfEl, xKey }, live);
  function wordsFreeze(...a) { return wordsFreeze$(...a); }   // <stage-split stub>
  function holdAnswer(...a) { return holdAnswer$(...a); }   // <stage-split stub>
  function wordsIn(...a) { return wordsIn$(...a); }   // <stage-split stub>
  function planOf(...a) { return planOf$(...a); }   // <stage-split stub>
  function keepFor(...a) { return keepFor$(...a); }   // <stage-split stub>
  function followData(...a) { return followData$(...a); }   // <stage-split stub>
  function ctxOf(...a) { return ctxOf$(...a); }   // <stage-split stub>
  // The change the slide makes to the model, eased in as the numbers follow (what a time-lapse does by its days).
  async function answerPlay(s, i, cut) {
    const end = await stateReady(stateOf[i]);
    if (!end || cut()) return;
    const ref = refOf(s, i);
    let easing = true;
    (async () => { while (easing && !cut()) { await waitCut(150, cut); const fr = store.get().frame; if (easing && fr?.metrics && !cut()) dataTo(s, liveFp(fr), ref, 280); } })();
    shownState = -1;
    const done = await morphTo(end, cut, fadeLen(MORPH_MS), false);   // (a model's change is a value cross-fade: kept short, never a jump, under Reduce Motion)
    easing = false;
    if (!done || cut()) return;
    shownState = stateOf[i];
    dataTo(s, end.fp, ref, 280);
  }


  let keepNow = NO_KEEP, keepArgs = null, keepSnap = null, keepBad = [], keepCut = () => true;
  async function keepFall(cut) {
    keepNote();
    if (!ui || !keepBad.length) return false;
    const bad = keepBad; keepBad = [];
    for (const k of bad) keepNow = { ...keepNow, [k]: false };
    if (bad.includes('data')) { ui.data.classList.add('pz-hide'); delete ui.data.dataset.colswap; }
    if (bad.includes('text')) { ui.text.classList.add('pz-leave'); ui.scl.classList.add('pz-leave'); }
    await waitCut(D_SMALL + 20, cut);
    if (cut() || !ui || !keepArgs) return false;
    const { s, st, i, fresh, lap, now } = keepArgs;
    if (bad.includes('text')) { textIn(s, st, i); ui.text.classList.add('pz-leave'); ui.root.dataset.bare = ''; }
    if (bad.includes('data')) dataIn(s, st, i, fresh, lap, now);
    layout();
    // (Fitted as every card is before it shows: the sizes it comes in at are the sizes it keeps.)
    reFit(); await painted(); await painted();
    if (cut() || !ui) return true;
    layout();
    return true;
  }
    let lipStep = null;
      // (The cards follow at once; the camera frames once, when the size has held for 250 ms: a turn fires several resizes, and a
  // glide after each moved the camera two or three times.)
  let reframeT = 0, turnT = 0;
        // Ending a talk, the slide's cards fade out first (the exit curve, .2 s), then the app's own bars and zoom pill fade back in,
  // rather than everything swapping in one frame (motion review P2). A new talk started meanwhile ends this one at once.
  let leaving = null;
  const { GRIP, LIP, LOW_M, SHORT_H, TEXT_CARD, autoDock, capOf, dock, dockHalt, dockPaint, dockRest, dockTo, dockVec, fitCards, fitDone, fitSig, insetL, liftTo, lipOn, measureUnder, minText, overflowOf, phone, pillKind, placeLip, riseShift, slideTell, slideUnder, slip, splitSheet, stopUnder, tabBeside, tabUp, underU, visualOf, wideSheet, words, wordsFloor, wordsGlide, wordsHeightAt } = createZoom({ app, ctxOf, degrade, degraded, ease, laddersGrid, layout, nextFrame, quadrantVisual, reframe, rowsOf, scaleVisual, summaryTable, wallsVisual, wrap }, live);

  let sheetPull = null;   // (the readings' own pull, foldTouch: the closed card's pull carried on brings them out after it)
    // ── The data card zoomed to the middle of the screen (Mac and iPad landscape; src/ui/card-zoom.js; Mohammad, 28 Oct) ──
  // A tap on an empty part of the instrument's card, or its corner icon, glides the card to the middle and grows it as one piece, its words
  // and pictures larger, never smaller; the veil dims the figure behind, which stays where it is. Nothing pauses: the instrument, the model and
  // the figure run on. Only the layout waits (zoomHeld: a pass asked for meanwhile, zoomMissed, runs once the card is back), because the card
  // is then where the glide put it, not where it rests. A slide, a resize, Esc or a tap outside puts it back first.
  let zoomMissed = false;
    let textLock = null, foldHeld = null;   // (foldHeld: the foldKey the data card was last folded for, layout)
    let fitRO = null, fitRaf = 0, clearRO = null, clearT = 0, paneRaf = 0, fitKids = [], clearFor = null;
    // Where the cards stand, rounded: the camera framed this space last; the same space needs no second glide.
  let framedSig = '';
  const { camAt, camFollow, camFollowOk, camGrab, cardMoving, cardSig, cardsStill, cellReady, cellTap, insets, insetsGo: insetsGo$, insetsHold: insetsHold$, layout: layout$, layoutAtLanding: layoutAtLanding$, onFonts, paintZoom, reframe: reframe$, thrown, zoomBehind, zoomCredit, zoomFolds, zoomFollow, zoomHeld, zoomOn, zoomReady, zoomSettled, zoomToggle } = createLadders({ GRIP, LIP, LOW_M, SHORT_H, TEXT_CARD, app, autoDock, capOf, cath, creditLease, dataStands, dock, dockPaint, dockRest, dockVec, figOf, fitCards, fitDone, fitSig, frameTo, insetL, liftTo, lipOn, lowKey, minText, overflowOf, phone, placeBar, placeLip, slip, splitSheet, stage, stimer, stopUnder, tabBeside, tabUp, throwCards, underU, until, wideSheet, words, wordsFloor, wordsGlide, wordsHeightAt, wrap }, live);
  function layoutAtLanding(...a) { return layoutAtLanding$(...a); }   // <stage-split stub>
  function layout(...a) { return layout$(...a); }   // <stage-split stub>
  function insetsHold(...a) { return insetsHold$(...a); }   // <stage-split stub>
  function insetsGo(...a) { return insetsGo$(...a); }   // <stage-split stub>
  function reframe(...a) { return reframe$(...a); }   // <stage-split stub>
  // (A resize or a turn letters every chart again for its new size.)
  let refitT = 0;
  // A title of three or more lines on a wider screen is set a size smaller (long). Judged at the title's full size; again after a
  // resize or a turn, so a turned iPad sets its titles as a fresh load at that size does (turned sideways it had kept them big,
  // and the data card under them shorter).
  function markLong(text, asSet = false) {
    const ttl = text.querySelector('.pz-h');
    if (!ttl) return;
    ttl.classList.remove('long');
    if (phone()) return;
    // (asSet: a slide just shown is judged with the words' step as it stands, as it always was)
    const tk = asSet ? '' : text.style.getPropertyValue('--pz-tk'); if (tk) text.style.removeProperty('--pz-tk');
    const lh = parseFloat(readStyle(ttl).lineHeight) || readMetric(ttl, 'offsetHeight');
    if (readMetric(ttl, 'offsetHeight') > lh * 2.4) ttl.classList.add('long');
    if (tk) text.style.setProperty('--pz-tk', tk);
  }
  // (The screen's size as the last resize laid the cards out for: wrapRO lays them out again when the stage settles to another size
  // after the event. Turned on an iPad, Safari's one resize came while the stage still had its upright height: the pair was centred
  // for that height, the data card pushed below the screen until the slide was reloaded (Stiffness 3, 18 Oct).)
  let sizeSeen = '', wrapRO = null;
    // Projector-size labels on the figure, for the screen it is on (2 at 1080 lines).
  // (unchanged: left out when the projector size and the text size are the ones it set last. A card that only folded, docked or settled
  // (onResize with no resize) changes neither, and the figure's labels laid out again and every stage style read again in the very frame
  // the camera's refit to that card began: on a phone a long frame, which carried the glide part of the way at once.)
  let labelsFor = '';
    // ── Chrome: counter, progress, controls ──
  // The controls are a small frosted pill (a phone: count, settings, exit; a wide screen adds back and next) at the screen's lower right, on the words'
  // glass; it never moves. Only the words' last line keeps clear of it (see clearPill); slides change by swiping.
  let pillW = 0;
    // ── The scale switch (slide field scales; scale-switch.js) ──
  // One pill, Anatomy, Lobule, Sinusoid, on a slide that offers more than its own scale. A tap flips the figure to that scale of the
  // same patient with the moves the slides already make (camera: the dive, the sinusoid, the rise), so it eases and the vessels stay
  // where they are; the words, the data card and anything playing go on. Never remembered: Next, Back and a jump open each slide on
  // its own scale (transitionRun clears the pick). Mac and iPad landscape: in the counter's row, 8 px left of it. A phone and an
  // upright iPad: centred 8 px above the teaching card, where the camera keeps clear of it.
  let scalePick = null, flipping = false;
  const { announce: announce$, clearPill: clearPill$, lowKey: lowKey$, onResize, paintChrome: paintChrome$, paintScaleSel, paintScales: paintScales$, placeBar: placeBar$, revealMove, setLabels, sizeNow } = createScales({ HUSH_OUT, app, camera, creditLease, dock, dockHalt, dockPaint, dockRest, eased, figOf, fitDone, homeLease, hush, lastBeat, layout, markLong, next, openSettings, paintOverlays, paintZoom, phone, pillKind, placeLip, poke, prev, pview, reFit, reframe, run, shortSide, stage, stimer, stop, tabUp, toggleJump, unhush, until, waitCut, wrap, zoomOn }, live);
  function placeBar(...a) { return placeBar$(...a); }   // <stage-split stub>
  function paintScales(...a) { return paintScales$(...a); }   // <stage-split stub>
  function clearPill(...a) { return clearPill$(...a); }   // <stage-split stub>
  function lowKey(...a) { return lowKey$(...a); }   // <stage-split stub>
  function announce(...a) { return announce$(...a); }   // <stage-split stub>
  function paintChrome(...a) { return paintChrome$(...a); }   // <stage-split stub>


  // One beat (slide-beats.js): as a flip does, the slide's call-outs leave (in the liver, all its labels first), the camera makes the
  // beat's move and the beat calls out what it names. The words, the data card and the model stay as they are. A flip of the scale
  // is a detour that ends here: the beat opens on the slide's own scale.
  async function beatMove(i, k) {
    if (revealCount(slides[i])) return revealMove(i, k);   // (a revealing line: one more clause, no camera: reveal.js)
    const g = gen, s = slides[i], cut = () => !deck || want !== i || gen !== g || beat !== k || shown?.i !== i;
    const v = beatView(s, k), cam = v.cam || 'fit';
    if (scalePick) { scalePick = null; paintScaleSel(pickedScale(null, i, v)); }
    if (flipping) { await until(() => !flipping, 9000); if (cut()) return; }
    const creditOff = creditLease.take();
    try {
      if ((store.get().lobule || store.get().sinusoid) && !booting) hush();
      markBase = null;
      store.set({ focus: null, presentLabels: [], presentTerms: null, lobuleCallout: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
      figureHooks('clear');
      if (hushed) { await waitCut(Math.max(0, HUSH_OUT - (performance.now() - hushAt)), cut); if (cut()) return; await eased(['opacity'], 600, '.lz-labels'); if (cut()) return; }
      fig = { i, s: v };
      const homeOff = homeLease.take();
      try { await camera(cam, v, cut); } finally { homeOff(); }
      if (cut()) return;
      lastCam = cam; framedSig = cardSig();
      paintOverlays(v, i, states[stateOf[i]] || null);
      await unhush(cut);
      if (cut()) return;
      shownBeat = k; paintChrome();
    } finally {
      creditOff();
    }
  }


  // Settings while presenting (appearance, text size, full screen): the app's own sheet, opened from the bar.
  const gear = () => (openSettings ? h('button', { class: 'ib', 'aria-label': 'Settings', 'aria-haspopup': 'dialog', title: 'Settings', onclick: (e) => openSettings(e.currentTarget) }, svgIcon('gear')) : null);
  let idleT = 0;
  function wake() {
    if (!ui) return;
    ui.bar.classList.remove('idle');
    clearTimeout(idleT);
    // (The pill never hides, on a phone or a wide screen, as it is small and out of the way.)
  }
  function setContrast(on = !hiCon) {
    hiCon = !!on;
    try { localStorage.setItem(PROJ, hiCon ? '1' : '0'); } catch (e) { caught('presenter:4957', e); /* storage unavailable */ }
    app.classList.toggle('pz-hi', hiCon);
    paintChrome();
  }
  // The panel's width changes under cover: the words fade out, the panel takes its new width (the glass behind eases to it),
  // and the words fade back in. Nothing jumps and nothing is measured mid-way.
  // (widthOwn: the words' fade out is this function's, so it brings them back. A change that follows another within the 240 ms finds the
  // words already leaving, and must not take that for a slide's fade: it keeps what the first found. A change coming between the timer and the
  // next frame leaves the bringing back to its own timer, so the words never show at the old width in the middle of it.)
  let widthT = 0, widthOwn = false;
  function setPanelWidth(w) {
    if (!PW_K[w] || w === pzWidth) return;
    pzWidth = w;
    try { localStorage.setItem(PW, w); } catch (e) { caught('presenter:4970', e); /* storage unavailable */ }
    if (!ui) { app.style.setProperty('--pz-wk', String(PW_K[w])); return; }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const apply = () => { app.style.setProperty('--pz-wk', String(PW_K[pzWidth])); layout(); setLabels(); };
    if (phone() || ui.text.hidden || reduce.matches) { apply(); return; }
    clearTimeout(widthT);
    if (!widthOwn) widthOwn = !ui.text.classList.contains('pz-leave');
    ui.text.classList.add('pz-leave');
    widthT = setTimeout(() => {
      widthT = 0;
      if (!ui) { widthOwn = false; return; }   // (the talk ended inside the 240 ms: its width is set already, and Explore keeps its own label size)
      apply();
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      nextFrame(() => { if (widthT || !widthOwn) return; widthOwn = false; ui?.text.classList.remove('pz-leave'); });
    }, 240);
  }
  // (The page carries it too, for the credit's rule: a :has() over the whole page was looked at again on every "on" anywhere in it.)
  function toggleBlack(on = !black) { black = on; ui?.black.classList.toggle('on', black); app.classList.toggle('pz-blacked', black && !!ui); }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  addEventListener('pointermove', () => { if (deck) wake(); });
  addEventListener('pointerdown', () => { if (deck) wake(); });

  // ── The slide list (G, or the count): every title, grouped under its kicker; a tap or Enter goes there ──
  function toggleJump(on = ui?.jump.hidden) {
    if (!ui) return;
    const j = ui.jump;
    if (!on) {
      if (j.hidden) return;
      j.classList.add('pz-leave');
      setTimeout(() => { if (j.classList.contains('pz-leave')) j.hidden = true; }, 220);   // (after its fade, Reduce Motion too)
      paintChrome();
      return;
    }
    const groups = [];
    slides.forEach((s, i) => { const k = s.kicker || ''; if (groups.at(-1)?.k !== k) groups.push({ k, items: [] }); groups.at(-1).items.push(i); });
    j.replaceChildren(h('div', { class: 'pzj-h' }, h('span', {}, deck.title), h('button', { class: 'ib', 'aria-label': 'Close the slide list', onclick: () => toggleJump(false) }, icon('close'))),
      h('div', { class: 'pzj-list' }, groups.map((g) => h('section', {}, g.k ? h('h3', {}, g.k) : null,
        h('ol', {}, g.items.map((i) => h('li', {}, h('button', { type: 'button', 'aria-current': i === want ? 'true' : null, onclick: () => { toggleJump(false); go(i); } },
          h('span', { class: 'n' }, String(i + 1)), h('span', { class: 't' }, nb(slides[i].title))))))))));
    j.classList.add('pz-leave'); j.hidden = false; void readMetric(j, 'offsetWidth'); j.classList.remove('pz-leave');
    const curBtn = j.querySelector('[aria-current]');
    curBtn?.focus({ preventScroll: true }); scrollInto(curBtn, { block: 'center' });
    paintChrome();
  }
  function jumpKey(e) {
    const k = e.key, btns = [...ui.jump.querySelectorAll('.pzj-list button')], at = btns.indexOf(document.activeElement);
    if (k === 'Escape' || k.toLowerCase?.() === 'g') toggleJump(false);
    else if (k === 'ArrowDown' || k === 'ArrowUp') btns[clamp(at + (k === 'ArrowDown' ? 1 : -1), 0, btns.length - 1)]?.focus();
    else return;   // (Enter and Space press the focused title, Tab moves as usual)
    e.preventDefault(); e.stopImmediatePropagation();
  }

  // ── Swipe: a quick, mostly sideways one-finger move anywhere on the slide (figure, words, bar) goes on (left) or back
  // (right). Left alone: sliders, the slide list, sideways-scrolling boxes, and the card where it docks sideways (its
  // drag, handle included, is its own); pans and pinches that are not mostly sideways stay with the figure. ──
  // (Touch events, not pointer events: the browser keeps its pans on the stage while presenting, which cancels pointers.)
  let sw = null;
  wrap.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    sw = deck && e.touches.length === 1 && !caseOn(e) && !ownsSideways(e.target, { stop: wrap, cardSideways: ui && !ui.data.hidden && !phone() && !ui.root.classList.contains('pz-wide') })
      ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
  }, { passive: true, capture: true });

  // ── The case card on a touch screen: it follows a finger sideways and flies off when let go far enough
  // out or flicked, either way (caseFling in src/ui/swipe.js); a shorter drag, or one carried back, springs back. A vertical
  // move, a second finger or a cancelled touch leaves it where it was. The slide swipe above leaves the card's touches alone,
  // and the click after a drag is swallowed. Touch events only, so a mouse on the Mac still just clicks. ──
  let cd = null, caseDragAt = -1e9;
  const caseOn = (e) => !!caseCard && !caseCard.flown && e.target.closest?.('.pz-case') === caseCard.c;
  const caseLet = (fly) => {
    const g = cd; cd = null;
    if (!g?.on) return;
    g.card.drag = false; caseDragAt = performance.now();
    if (g.card.flown || caseCard !== g.card) return;
    const p = g.pts, a = p[0], b = p[p.length - 1], v = b[1] - a[1] >= 16 ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
    const dir = fly ? caseFling(g.card.dx, v, g.w) : 0;
    if (dir) caseFly(g.card, dir, v, g.w); else caseBack(g.card);
  };
  wrap.addEventListener('touchstart', (e) => {
    if (cd) { caseLet(false); return; }   // (a second finger: back it goes)
    if (!deck || e.touches.length !== 1 || !caseOn(e)) return;
    const t = e.touches[0];
    cd = { card: caseCard, x: t.clientX, y: t.clientY, on: false, pts: [[t.clientX, performance.now()]] };
    cd.w = readMetric(caseCard.c, 'offsetWidth') || 1;   // (its width, read once as the finger lands: the drag reads nothing)
  }, { passive: true, capture: true });
  wrap.addEventListener('touchmove', (e) => {
    if (!cd) return;
    if (e.touches.length !== 1 || cd.card.flown) { caseLet(false); return; }
    const t = e.touches[0], moveX = t.clientX - cd.x, dy = t.clientY - cd.y, now = performance.now();
    if (!cd.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(moveX)) { cd = null; return; }   // up or down first: not a card drag
      if (Math.abs(moveX) < 8) return;
      const x0 = glideX(cd.card.c), y0 = glideY(cd.card.c);
      cd.baseX = Number.isFinite(x0) ? x0 : 0; cd.card.dragY = Number.isFinite(y0) ? y0 : 0;
      const opacity = parseFloat(cd.card.c.style.opacity);
      cd.opacity = Number.isFinite(opacity) ? opacity : 1;
      caseFadeTokens.set(cd.card.c, {}); glideStop(cd.card.c);
      cd.card.c.style.translate = cd.card.dragY ? `0px ${cd.card.dragY}px` : '';
      cd.on = true; cd.card.drag = true;
      cd.card.c.style.transition = 'none';
    }
    if (e.cancelable) e.preventDefault();
    ptPush(cd.pts, t.clientX, now);
    while (cd.pts.length > 2 && now - cd.pts[0][1] > 100) PT_FREE.push(cd.pts.shift());
    const c = cd.card.c, w = cd.w, dx = (cd.baseX || 0) + moveX;
    cd.card.dx = dx;
    c.style.transform = `translateX(${dx}px)`;
    // (Whole under the finger: the glass and the words move as one piece and the frost is never faded.)
    c.style.opacity = String(cd.opacity);
    signalMove();
  }, { passive: false, capture: true });
  wrap.addEventListener('touchend', (e) => { if (cd && !e.touches.length) caseLet(true); }, { passive: true, capture: true });
  wrap.addEventListener('touchcancel', () => { if (cd) caseLet(false); }, { passive: true, capture: true });
  // The words follow the finger while a sideways swipe is under way (Mohammad, 1 Nov, card motion spec 8): the teaching card's words
  // (their box, one composited layer) move a quarter of the finger's travel, 32 px at most, fading toward 40 %, so the swipe shows what it will do and can be pulled back.
  // The glass, the data card, the figure and its vessels stay where they are. Let go past the swipe's distance (or flicked): the words
  // carry on from where the finger left them into their way out (app.css data-out, the same transform, eased from where it stands); short
  // of it, they ease back. At the first slide, where Back goes nowhere, they follow a tenth of the finger and do not fade. Only while
  // nothing is moving (no slide change, no case card) and the words are in.
  let pull = null, swipeDx = 0;   // (swipeDx: the finger's way, for swipeEls)
  // (A data card the slide the swipe goes to keeps (the same instrument: card-keep.js keepData) stays where it is: it does not follow the finger,
  // as it is not thrown out on Next. Mohammad, 3 Nov 2026, the iPhone: "it's moving with my finger".)
  const keepsOnSwipe = (dx) => {
    const to = dx < 0 ? want + 1 : want - 1, nx = slides[to];
    if (!nx || !shown || !dataOn) return false;
    const pl = planOf(nx, to);
    return pl === undefined || keepData({ from: dataOn, to: pl, prev: slides[shown.i], next: nx, swap: stateOf[to] !== shownState || liveOff });
  };
  // (Only a swipe that will change the slide moves the words: one that plays a procedure's next step, a beat of the figure, the rest of a
  // time-lapse or lifts a case card leaves them where they are, never following the finger and then springing back: Mohammad, 1 Nov, BRTO steps.)
  // (A card that takes its readings one Next at a time, the HVPG tracing, steps before the slide does: its Next is a step, not a change, so a swipe for it lifts nothing.
  // Mohammad, 16 Nov 2026, Varices 6/11: "the upper card moves then springs back".)
  const toolStep = (d) => shown?.i === want && !!ui?.tools?.canStep(d);
  const turnsSlide = (dx) => dx < 0
    ? !caseLift && !lapseOn && !procHeld() && !procWait && !slides[want]?.procedure && !toolStep(1) && beat >= lastBeat(want) && want < slides.length - 1
    : !procHeld() && !procWait && !toolStep(-1) && beat === 0 && want > 0;
  const pullCan = (dx) => turnsSlide(dx) && !!ui && !changing() && !caseCard && !zoomOn() && !ui.text.hidden && !!ui.text.childElementCount && !ui.text.classList.contains('pz-leave') && !ui.root.classList.contains('pz-prep');
  function pullTo(dx) {
    // (The page: the glass and the words follow as one card, transform and opacity only, nothing read from the layout.)
    const f = followOf(dx);
    swipeDx = dx;
    pull.x = f.x; pull.o = f.o;
    for (const el of (pull.els ??= swipeEls())) { throwStop(el); el.style.transition = 'none'; el.style.transform = `translateX(${f.x.toFixed(1)}px)`; el.style.opacity = f.o.toFixed(3); }
    signalMove();
  }
  // (Let go: the inline styles go in one style change with the slide's own leave (gone: the words carry on out from where they stand),
  // or, staying, the lines ease back from where they are and the words' opacity eases back by the card's own transition.)
  function pullLet(gone) {
    const g = pull; pull = null;
    if (!g?.on || !ui) return;
    const x = g.x;
    // (Let go: the card goes on out from where the finger left it, the glass and words together (their leave starts from the inline
    // values, dropped in the same style change; further than the leave's own way, it carries on from there), or, the swipe given up,
    // both ease back from there.)
    const els = g.els || pageEls(), o = g.o ?? 1, out = gone && ui.text.classList.contains('pz-leave');
    if (out && throwing(ui.text)) {
      // (thrown: already going on out from the finger, card-throw.js. A card the swipe took along that the new slide keeps (the same
      // data card) is not thrown: it eases back from the finger to its place.)
      // alloc-rare: a swipe is let go: once per gesture
      for (const el of els) if (!throwing(el) && !throwPinned(el) && el.style.transform) { const o0 = parseFloat(el.style.opacity); throwBack(el, x, Number.isFinite(o0) ? o0 : 1); }   // (on card-throw.js's clock: the glass and the words part for no frame)
      return;
    }
    // alloc-rare: a swipe is let go: once per gesture
    if (swipeHeld({ gone, changing: changing(), out })) {
      // (The slide is on its way: held here until its leave comes (wordsOut, pageHand); one that never comes eases back.)
      clearTimeout(pageHeld?.t);
      // alloc-rare: a swipe is let go: once per gesture
      pageHeld = { x, o, els, t: setTimeout(() => { if (pageHeld) pageHand(false); }, 600) };
      return;
    }
    if (!out && (Math.abs(x) > 0.5 || o < 0.999)) { for (const el of els) throwBack(el, x, o); return; }   // (short of the swipe: the card eases back on card-throw.js's clock, from where the finger left it)
    for (const el of els) { el.style.removeProperty('transition'); el.style.removeProperty('opacity'); el.style.removeProperty('transform'); }
    signalMove();
    if (out) pageThrow(x, els);
  }
  // (A swipe's throw: the card carries on out from where the finger left it, the leave's own way further, decelerating from the finger's
  // pace (app.css pz-thrown: --ease-arrive, not the leave's --ease-in, which stood the card still at the finger before it went on). The
  // way in keeps the slide's own distance (pageThrown, put back by wordsTurnIn).)
  let pageThrown = null;
  function pageThrow(x, els) {
    const d0 = ui.text.style.getPropertyValue('--pz-turn-d'), d = parseFloat(d0) || 20;
    // alloc-rare: a swipe is let go: once per gesture
    pageThrown = d0.trim();
    // alloc-rare: a swipe is let go: once per gesture
    for (const el of els) { el.style.setProperty('--pz-turn-d', `${(Math.abs(x) + d).toFixed(1)}px`); el.classList.add('pz-thrown'); }
  }
  function pageCaught() {
    if (pageThrown == null || !ui) return;
    for (const el of [ui.text, ui.shade, ui.data, ui.panel]) { if (!el) continue; el.classList.remove('pz-thrown'); if (pageThrown) el.style.setProperty('--pz-turn-d', pageThrown); else el.style.removeProperty('--pz-turn-d'); }
    pageThrown = null;
  }
  // (The held swipe let go: out, the leave just set carries on from the finger, further than its own way if the finger went further; not
  // out, the card eases back from there.)
  function pageHand(out) {
    const h = pageHeld; pageHeld = null;
    if (!h) return;
    clearTimeout(h.t);
    if (out && throwDir) return;   // (thrown: the card goes on out from the finger's place, on card-throw.js's clock: wordsOut)
    if (!out && (Math.abs(h.x) > 0.5 || h.o < 0.999)) { for (const el of h.els) throwBack(el, h.x, h.o); return; }
    for (const el of h.els) { el.style.removeProperty('transition'); el.style.removeProperty('opacity'); el.style.removeProperty('transform'); }
    signalMove();
    if (out) pageThrow(h.x, h.els);
  }
  wrap.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) { sw = null; if (pull) pullLet(false); return; }
    const g = sw, t = e.touches[0];
    if (!g || !t || !deck) { if (pull) pullLet(false); return; }
    const dx = t.clientX - g.x, dy = t.clientY - g.y, now = performance.now();
    if (!pull) {
      if (Math.abs(dx) < 8 || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy) || !pullCan(dx)) return;
      // alloc-rare: a swipe takes hold: once per gesture
      pull = { on: true, x: 0, pts: [] };
    }
    ptPush(pull.pts, t.clientX, now);
    while (pull.pts.length > 2 && now - pull.pts[0][1] > 80) PT_FREE.push(pull.pts.shift());
    pullTo(dx);
  }, { passive: true, capture: true });
  wrap.addEventListener('touchcancel', () => { sw = null; if (pull) pullLet(false); }, { passive: true, capture: true });
  wrap.addEventListener('touchend', (e) => {
    const g = sw, t = e.changedTouches[0], p = pull; sw = null;
    if (!g || !deck || !t || e.touches.length) { if (p) pullLet(false); return; }
    const dx = t.clientX - g.x, dy = t.clientY - g.y, now = performance.now();
    let d = swipeDir(dx, dy, now - g.t);
    // (A swipe the words have followed also counts when slower than a quick swipe, once past its distance, or when flicked: 0.3 px/ms
    // over its last 80 ms and at least half the distance.)
    if (!d && p?.on && Math.abs(dx) > SWIPE_RATIO * Math.abs(dy)) {
      const [x0, t0] = p.pts[0] || [t.clientX, now], v = (t.clientX - x0) / Math.max(1, now - t0);
      if (Math.abs(dx) >= SWIPE_MIN || (Math.abs(v) >= 0.3 && Math.abs(dx) >= SWIPE_MIN / 2 && Math.sign(v) === Math.sign(dx))) d = dx < 0 ? 1 : -1;
    }
    // (A swipe the card followed: its words leave even when the next slide's are the same, so the card never goes back where it was.)
    if (d && p?.on && Math.abs(p.x) > 0.5) pageForce = true;
    if (d > 0) next(); else if (d < 0) prev();
    if (!changing()) pageForce = false;   // (nothing moved: a stale force never reaches a later change)
    if (p) pullLet(!!d);
  }, { passive: true, capture: true });

  // ── A swipe up or down anywhere else on an upright slide (the figure, the teaching card, the space around them) works the
  // data card exactly as a drag on its handle does: down pulls it open, up pushes it shut, following the finger, and it eases the
  // rest of the way on release (Mohammad, 21 Oct: "Swiping down or up anywhere on the slide should trigger as if I'm holding the
  // handle"). The card's own touch handlers (foldTouch, dockTouch) are fed the same touch, from where the finger first came down.
  // Only once the move is clearly up or down (cardSwipe); a sideways move stays the slide swipe, a second finger lets the card
  // ease back to where it was going, and a touch that starts on a control (a button, tab, slider, chart) stays the control's
  // (ownsTouch). Upright only: where the card docks sideways its handle is a sideways drag. The figure is read-only while
  // presenting, so its vertical drags are free. (Touch events only, as the slide swipe: a mouse never drags the card.) ──
  let far = null;
  // (The touch handed to the card is one kept event, written in place; the handlers read it as it is fed and keep none of it.)
  const farT = { clientX: 0, clientY: 0 }, farLive = [farT], farNone = [], farTouches = [farT], farFlags = { stopped: false, kept: false };
  const farE = { type: '', target: null, touches: farNone, changedTouches: farTouches, cancelable: true,
    preventDefault: () => { farFlags.kept = true; }, stopImmediatePropagation: () => { farFlags.stopped = true; } };
  const farFeed = (type, x, y) => {
    farFlags.stopped = farFlags.kept = false;
    farT.clientX = x; farT.clientY = y;
    farE.type = type; farE.target = ui.data; farE.touches = type === 'touchstart' || type === 'touchmove' ? farLive : farNone;
    for (const hs of ui.cardTouch) { hs[type]?.(farE); if (farFlags.stopped) break; }
    return farFlags.kept;
  };
  const farLet = (type, x, y) => { const g = far; far = null; if (g?.on && ui) farFeed(type, x ?? g.lx, y ?? g.ly); };
  wrap.addEventListener('touchstart', (e) => {
    if (far) { farLet('touchcancel'); return; }   // (a second finger: a pinch, not a swipe)
    const d = ui?.data;
    if (!deck || !d || (zoomOn() && !zoomFolds()) || e.touches.length !== 1 || !(phone() || wideSheet(d)) || d.hidden || d.classList.contains('pz-hide') || !ui.cardTouch
      || d.contains(e.target) || ui.lip.contains(e.target) || caseOn(e) || ownsTouch(e.target, { stop: wrap })) return;
    const t = e.touches[0];
    far = { x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, on: false };
  }, { passive: true, capture: true });
  wrap.addEventListener('touchmove', (e) => {
    if (!far) return;
    if (e.touches.length !== 1 || !ui) { farLet('touchcancel'); return; }
    const t = e.touches[0];
    if (!far.on) {
      const k = cardSwipe(t.clientX - far.x, t.clientY - far.y);
      if (k < 0) { far = null; return; }
      if (!k) return;
      far.on = true; sw = null;   // (up or down: not a slide change)
      farFeed('touchstart', far.x, far.y);
    }
    far.lx = t.clientX; far.ly = t.clientY;
    if (farFeed('touchmove', t.clientX, t.clientY) && e.cancelable) e.preventDefault();
  }, { passive: false, capture: true });
  wrap.addEventListener('touchend', (e) => { if (far && !e.touches.length) farLet('touchend'); }, { passive: true, capture: true });
  wrap.addEventListener('touchcancel', () => { if (far) farLet('touchcancel'); }, { passive: true, capture: true });

  // ── A trackpad or wheel on a Mac works the slide as a finger does (Mohammad, 22 Oct): fingers up anywhere bring the stacked card's
  // fingers sideways go on or back, or throw a case card off that way. One action
  // a gesture, and a gesture lasts until the wheel goes quiet, the glide after the fingers lift included (swipe.js, wheelGesture); eased as
  // the finger's are (setFold, caseFly, go); a box that scrolls itself keeps its wheel (ownsWheel), and a pinch (ctrl) stays the
  // figure's. A fresh swipe to the left on the last slide ends the talk, as the touch swipe and Next do. ──
  let wheelG = null;
  const wheelStop = { stop: wrap };   // (ownsWheel's options, kept: the wheel's events make none)
  wrap.addEventListener('wheel', (e) => {
    if (!deck || !ui || e.ctrlKey || e.metaKey || leaving || !ui.jump.hidden || isModalOpen()) return;
    const now = e.timeStamp > 0 ? e.timeStamp : performance.now();   // (the event's own time: a slow frame must not stretch a gap inside one glide)
    const [fx, fy] = wheelFinger(e.deltaX, e.deltaY, e.deltaMode, e.webkitDirectionInvertedFromDevice, innerHeight);
    if (ownsWheel(e.target, Math.abs(fx) > Math.abs(fy) ? 'x' : 'y', wheelStop)) { if (wheelG?.spent) wheelG.t = now; else wheelG = null; return; }   // (a glide that has acted stays spent under whatever the slide's change brings under the pointer)
    if (e.cancelable) e.preventDefault();   // (the browser's own back and forward glide, and the page's scroll, stay out of the talk)
    const r = wheelGesture(wheelG, fx, fy, now);
    wheelG = r.g;
    const a = r.act;
    if (!a) return;
    // (The gesture's one action runs as its own task right after this event, where the slide's cards are measured once before they
    // move (rest-pass.js): the wheel's events, dozens a second, read nothing.)
    // alloc-rare: the wheel gesture's one action: once per gesture
    const wheelDeck = deck, wheelGen = gen;
    restPass(() => { if (deck === wheelDeck && gen === wheelGen) wheelAct(a); });
  }, { passive: false, capture: true });
  function wheelAct(a) {
    if (!deck || !ui || leaving) return;
    const card = caseCard && !caseCard.flown ? caseCard : null;
    if (a.axis === 'x') {
      if (card) caseFly(card, a.dir, 1.2, readMetric(card.c, 'offsetWidth'));   // (fingers right: off to the right)
      else if (a.dir < 0) next();   // (on the last slide a fresh swipe ends the talk, as the touch swipe does; the glide that reached it is spent and never also closes)
      else prev();
    }   // (fingers up or down do nothing: no readings card comes out or tucks away now)
  }

  // ── Hands off: while presenting, the figure only points (hover glow); taps, drags, pans and zooms that would
  // move it off the slide's script are swallowed. The swipe above uses touch events, so it still works. ──
  const offFig = (e) => deck && e.target.closest?.('#stageView') && !e.target.closest('#overlay');
  // The figure is read-only here: no hover highlight or glow, no vessel popup, no pick, no actions menu, no text selection.
  // (Gated at the input layer, so the figure's own handlers never run. Pointer leaves are left alone, so a hover that was
  // lit as the deck started still clears. The bar's wake-on-move listens on the window, so a move over the figure wakes it here.)
  // (A tap on a label no longer explains it: Mohammad, 6 Nov 2026, "remove the feature to click on labels in the deck slides to view more
  // information". A tap on the figure is swallowed like the rest.)
  let scopeDown = null;
  for (const t of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'dblclick', 'wheel', 'gesturestart',
    'pointermove', 'pointerover', 'pointerout', 'mousemove', 'mouseover', 'mouseout', 'contextmenu', 'selectstart', 'dragstart'])
    wrap.addEventListener(t, (e) => {
      if (!offFig(e)) return;
      if (t === 'pointermove') { wake(); ui?.scope?.hover(e.clientX, e.clientY, e.pointerType); }
      // The one tap the figure takes in a talk: the scope view's ring (scope-lens.js; Mohammad 6 Nov 2026, "I can't click on the scope
      // lens icon"). A press that stays put and lifts on the ring opens or shuts its lens; any other press is swallowed as before.
      else if (t === 'pointerdown') scopeDown = e.isPrimary ? [e.clientX, e.clientY] : null;
      else if (t === 'pointerup' && scopeDown) { const [x0, y0] = scopeDown; scopeDown = null; if (Math.hypot(e.clientX - x0, e.clientY - y0) < 12) ui?.scope?.tap(e.clientX, e.clientY); }
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true, passive: false });
  // Keyboard focus never lands on a vessel (its focus ring is a highlight too).
  wrap.addEventListener('focusin', (e) => { if (deck && offFig(e) && e.target.closest('#stage')) e.target.blur?.(); }, true);

  // ── Keys ──
  function onKey(e) {
    if (!deck || e.ctrlKey || e.metaKey || e.altKey) return;
    if (leaving) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // (the talk is fading out: no key starts anything in it)
    // (A dialog over the talk, such as the Guide that ? opens, keeps its keys: Esc closes it rather than ending the talk.)
    if (isModalOpen()) return;
    if (ui && !ui.jump.hidden) { jumpKey(e); return; }
    const tag = e.target?.tagName?.toLowerCase?.();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    // A control the keyboard reached with Tab keeps its Enter and Space (the pill's buttons, the Settings rows, a table row);
    // after a mouse click :focus-visible is off, so a clicker's Space still moves on. An open Settings sheet closes with its own Esc.
    if (controlOwnsKey(e.target, k, digits)) return;
    if (k === 'Escape' && popoverOpen()) return;
    let used = true;
    if (/^[0-9]$/.test(k)) { digits = (digits + k).slice(-3); clearTimeout(digitT); digitT = setTimeout(() => { digits = ''; }, 2500); toast(`Slide ${digits}: press Enter`, '', { present: true }); }
    else if (k === 'Enter' && digits) { const n = +digits; digits = ''; if (n >= 1) go(n - 1); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { if (!e.repeat) next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { if (!e.repeat) prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(slides.length - 1);
    else if (lk === 'b' || k === '.' || lk === 'w') toggleBlack();
    else if (lk === 'f') fullscreen();
    else if (lk === 'g') toggleJump(true);
    else if (lk === 'l') { if (!e.repeat) inkOf().toggleSpot(); }   // (N2: L switches the laser on and off)
    else if (lk === 'p') pview.open();   // (N1: the presenter view)
    else if (lk === 'n' || lk === 's') { /* the app's own N and S stay off while presenting */ }
    else if (k === 'F5') { /* a clicker's "start show": never reload the page */ }
    else if (k === 'Escape' && ui?.scope?.isOpen()) ui.scope.close();   // (an open scope view shuts first)
    else if (k === 'Escape') { if (black) toggleBlack(false); else if (zoomOn()) ui.zoom.close().then(paintZoom); else stop(); }   // (a zoomed card first glides back)
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  addEventListener('keydown', onKey, true);
  let ink = null;   // (N2: the pointer's spotlight and the pen, made at their first key: ink-gl.js)
  const inkOf = () => ink ??= createInk({ host: view, xform: (o) => stage.figureXform(o), top: () => stage.figureTop?.() ?? null, active: () => !!deck && !!ui && !black, onFigure: (e) => !!offFig(e) });

  // The card's own touch: along its axis it follows the finger (docking past half way or on a quick flick); a tap on the sliver opens it.
  function dockTouch(el, ...more) {   // (more: the card's sheet edge, its sibling, takes the same touch)
    let g = null;
    const reset = () => { g = null; dock.drag = false; };
    // (A drag in progress that is cut short, by a second finger or by the system: the card goes on to where it was heading, never left part way.)
    const landCut = (gg) => { if (gg?.on) dockTo(dock.to, 300); if (gg?.pull) sheetPull.settle(gg.pull, false); };
    const abort = () => { landCut(g); reset(); };
    const hs = {}, on = (type, fn, opts) => { hs[type] = fn; for (const t of [el, ...more]) t.addEventListener(type, fn, opts); };   // (hs: a swipe elsewhere on the slide is fed the same, farTouch)
    on('touchstart', (e) => {
      if (e.touches.length > 1) abort();   // (a second finger: a drag under way lands first)
      if (e.touches.length !== 1 || !deck || ui?.root.classList.contains('pz-wide')) { reset(); return; }   // (Mac and iPad landscape: the card never closes to the side, Mohammad, 22 Oct)
      const t = e.touches[0], vec = dockRest(), k = readBox(wrap).width / (readMetric(wrap, 'clientWidth') || 1) || 1;
      // alloc-rare: once per gesture (a finger landing or lifting), not per move
      g = { x: t.clientX, y: t.clientY, t: performance.now(), lvl0: dock.lvl, vec, k, on: false, last: 0 };
    }, { passive: true });
    on('touchmove', (e) => {
      if (!g) return;
      // alloc-rare: once per gesture (a finger landing or lifting), not per move
      if (e.touches.length > 1) { const gg = g; reset(); restPass(() => landCut(gg)); return; }   // (landed between frames: a touch move lays nothing out)
      const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y, vert = !!g.vec[1];
      const along = vert ? dy : dx, across = vert ? dx : dy, comp = vert ? g.vec[1] : g.vec[0];
      if (!g.on) {
        if (Math.abs(along) < 8 || Math.abs(across) > Math.abs(along) * 1.2) return;   // (not yet, or a cross-wise move: leave it)
        g.on = true; dock.drag = true; dockHalt();
      }
      if (e.cancelable) e.preventDefault();
      g.dl = along / g.k / comp;
      dock.lvl = clamp(g.lvl0 + g.dl, 0, 1);
      // alloc-rare: the history is made once, as a drag starts
      ptPush(g.pts ||= [], performance.now(), along);
      dockPaint();
      // Upright, a pull down on the closed card carried on past where the instrument card rests brings the readings' card out
      // after it, following the same finger (Mohammad, 17 Oct: "when I open I open the main card first but if I keep sliding I
      // can open both in one swipe"). Back above that point, they tuck away again under the finger.
      const past = (g.lvl0 + g.dl) * comp;   // (px beyond the card's rest, down positive; comp is the closed card's offset, up)
      if (g.lvl0 > 0 && vert && sheetPull && (g.pull || (past > 0 && splitSheet(el) && !el.classList.contains('tool-open')))) {
        g.pull ||= sheetPull.begin();
        sheetPull.follow(g.pull, Math.max(0, past));
      }
    }, { passive: false });
    on('touchend', (e) => {
      const gg = g; reset();
      if (!gg || e.touches.length) return;
      const dt = performance.now() - gg.t;
      if (gg.on) {
        // A quick flick (over 0.5 px/ms across the last 100 ms, just before letting go) decides by its direction; otherwise how far it got.
        // alloc-rare: once per gesture (a finger landing or lifting), not per move
        const now = performance.now(), end = gg.pts.at(-1), from = gg.pts.find((q) => end[0] - q[0] <= 100) || end;
        const v = end[0] > from[0] ? (end[1] - from[1]) / (end[0] - from[0]) : 0;
        const flick = now - end[0] < 100 && Math.abs(v) > 0.5 ? Math.sign(v / gg.vec[gg.vec[1] ? 1 : 0]) : 0;   // (toward docking is +1)
        dock.auto = false;   // (the reader's own choice: kept from slide to slide, autoDock)
        const to = flick > 0 ? 1 : flick < 0 ? 0 : dock.lvl > 0.5 ? 1 : 0;
        // (Pulled on into the readings: they come out with a quick flick down or past half way, the card always with them;
        // otherwise they tuck away from where the finger left them, the card easing to where it goes.)
        if (gg.pull) { const show = !to && (flick < 0 || gg.pull.u > 0.5); dockTo(to, 300); sheetPull.settle(gg.pull, show); }
        else dockTo(to, 300);
      } else if (dock.to === 1 && dt < 500) { dock.auto = false; dock.tapAt = performance.now(); dockTo(0); }   // (tapAt: the click that follows is this tap's, .pz-lip)
    }, { passive: true });
    on('touchcancel', abort, { passive: true });
    return hs;
  }

  // A phone's foldable card also opens and closes by a swipe anywhere on it: down pulls the folded part open, up pushes it
  // shut, following the finger, and it eases the rest of the way on release. A swipe the fold can't take (up on a shut card)
  // is left to the card's dock drag; sideways moves are left alone, so slide swipes and the figure pan work as before.
  // (A card with its part on a sheet (.pz-sheet): a pull down brings the sheet out; any push up, partly or fully open, closes the
  // whole card by the dock drag, and it opens again partly, dockTo. Upright, a push up from fully open tucks the readings' card
  // away first, and a pull down on the closed card carried on past its rest brings them out in the same pull, splitSheet.)
  function foldTouch(el, btn, setFold, part, hold, ...more) {
    let g = null;
    const hs = {}, on = (type, fn, opts) => { hs[type] = fn; for (const t of [el, ...more]) t.addEventListener(type, fn, opts); };   // (hs: a swipe elsewhere on the slide is fed the same, farTouch)
    // (Upright, the readings' card follows the finger over the whole of its travel, from wherever it is: an ease the finger catches
    // is taken up where it stands.)
    const grab = (x, y, open) => {
      const p = part(), split = splitSheet(el);
      // alloc-rare: once per gesture (a finger landing or lifting), not per move
      return { x, y, p, open, shown: open, split, u0: split ? underU(el) : open ? 1 : 0, full: split ? slip.d || readMetric(p, 'scrollHeight') : Math.min(readMetric(p, 'scrollHeight'), innerHeight * 0.4), on: false, pts: [] };   // (open: its part shown, the tiles under a lead instrument or the instrument over its tiles)
    };
    // (A card that folds in place, not a sheet (an iPad upright, a short screen): the part takes its full height once as the finger
    // starts, as a tap on Show gives the card its new size at once, and follows the finger by opacity and a short slide only, its
    // height written again once at release (settle, setFold). No height is ever written per move.)
    // alloc-rare: once per gesture (a finger landing or lifting), not per move
    const take = (gg) => { gg.on = true; if (gg.split) { cancelFrame(slip.raf); slideTell(); } else { gg.p.style.transition = 'none'; gg.xf = true; gg.fade = el.classList.contains('pz-folds'); if (gg.fade) gg.p.style.opacity = String(gg.u0); gg.p.classList.add('pz-follow'); } if (gg.split && (gg.u0 === 0 || gg.u0 === 1)) camGrab(); hold(true); };   // (camGrab: the view follows the finger, from rest)   // (fade: a part folded away fades in and out; a sheet's tiles, already in view, only slide)
    // (dy: how far the finger has moved since the part began to follow it, down positive.)
    const foldFollow = (gg, dy) => {
      const u = clamp(gg.u0 * gg.full + dy, 0, gg.full) / (gg.full || 1);
      gg.u = u; ptPush(gg.pts, performance.now(), dy);
      if (gg.split) { el.classList.add('pz-sliding'); el.style.setProperty('--pz-u', u.toFixed(4)); liftTo(u); camAt(u); return; }
      if (gg.xf) { gg.p.style.translate = `0 ${(-(1 - u) * FOLD_SLIDE).toFixed(1)}px`; if (gg.fade) gg.p.style.opacity = u.toFixed(3); }
    };
    // (From where the finger left it to the class's own state: the part's transition, or the readings' card's slide, eases the
    // rest. setFold reads where the finger left it before letting go of it.)
    const settle = (gg, show) => {
      if (gg.xf) { gg.xf = false; gg.p.classList.remove('pz-follow'); gg.p.style.translate = ''; }   // (its height back to its state's, once; the opacity eases on from where the finger left it)
      if (show !== gg.open) { if (gg.split && !show) dock.down = want; setFold(show); return; }
      if (gg.split) { slideUnder(gg.u ?? gg.u0, gg.open ? 1 : 0); hold(false); return; }
      readBox(gg.p); gg.p.style.transition = '';
      gg.p.style.maxHeight = ''; gg.p.style.opacity = '';
      hold(false);
    };
    // (The closed card's own pull hands on to the readings once the instrument card is out, dockTouch.)
    sheetPull = { begin: () => { const gg = grab(0, 0, false); take(gg); return gg; }, follow: foldFollow, settle };
    on('touchstart', (e) => {
      if (g?.on) { const gg = g; g = null; settle(gg, gg.shown); return; }   // (a second finger on a fold being followed: it goes back to where it began, not left part way with its inline height and opacity)
      g = null;
      const sheet = el.classList.contains('pz-sheet'), open = el.classList.contains('tool-open');
      const split = splitSheet(el);
      if (e.touches.length !== 1 || (!readMetric(btn, 'offsetWidth') && !sheet) || (sheet && open && !split) || dock.lvl > 0 || btn.contains(e.target) || (zoomOn() && !zoomFolds())) return;
      const t = e.touches[0];
      g = grab(t.clientX, t.clientY, open);
      // (The readings still sliding, either way: a push up takes them where they are and tucks them, it does not fall through to the dock drag and
      // close the whole card, content and all: Mohammad, 3 Nov 2026, iPhone, "swiping".)
      if (split && el.classList.contains('pz-sliding')) g.shown = true;
      g.zk = zoomOn() ? ui.zoom.scale : 1;   // (a zoomed card's readings travel that much further on the screen: the finger is followed by that much less)
      g.dir = wideSheet(el) ? -1 : 1;   // (Mac and iPad landscape: the readings come out upward, a pull up; a push down tucks them)
    }, { passive: true });
    on('touchmove', (e) => {
      if (!g) return;
      const t = e.touches[0], dy = t.clientY - g.y, dx = t.clientX - g.x;
      if (!g.on) {
        if (Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) || (dy * g.dir > 0) === g.shown) { g = null; return; }   // (sideways, or nothing to fold that way)
        take(g);
      }
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
      foldFollow(g, dy * g.dir / (g.zk || 1));
    }, { passive: false });
    const end = (e) => {
      const gg = g; g = null;
      if (!gg?.on) return;
      e.stopImmediatePropagation();
      // alloc-rare: once per gesture (a finger landing or lifting), not per move
      const last = gg.pts.at(-1), from = gg.pts.find((q) => last[0] - q[0] <= 100) || last;
      const v = last[0] > from[0] ? (last[1] - from[1]) / (last[0] - from[0]) : 0;
      // (A card folded behind Show has nothing to follow the finger: a pull of 24 px or more opens it, a push shuts it.)
      const show = Math.abs(v) > 0.4 ? v > 0 : gg.full ? gg.u > 0.5 : gg.shown ? last[1] > -24 : last[1] >= 24;
      settle(gg, show);
    };
    on('touchend', end, { passive: true });
    on('touchcancel', end, { passive: true });
    return hs;
  }

  const { start, stop: stop$ } = createStart({ claimLane: (k) => lane.claim(k), patientHistory, restartTraces, NO_KEEP, PW_K, abSlow, all, app, camFollow, camFollowOk, caseShut, cathStop, cellReady, cellTap, closeHome, coverDown, deckTab, dock, dockHalt, dockTo, dockTouch, evDrop, fitDone, foldTouch, go, host, inkOf, insets, layout, loadPreset, measureUnder, nextFrame, onFonts, onHidden, onResize, paintZoom, placeLip, prepare, procStop, projectorOff, projectorOn, pview, reframe, riseShift, setLabels, sizeNow, slidePrep, slideUnder, slip, splitSheet, stage, stashCards, stopLapse, stopUnder, strainStop, testingLoad, toggleBlack, underU, until, view, viewSettled, wait, waitCut, wake, wideSheet, wrap, zoneCam, zoomBehind, zoomCredit, zoomFolds, zoomOn, zoomReady, zoomSettled, zoomToggle }, live);
  function stop(...a) { return stop$(...a); }   // <stage-split stub>
  async function coverDown(now = false) {
    if (!now) {
      // Under the cover: the figure has refitted to the projector layout (its framing holds still) and the slide's
      // own entrances (the words, the card, the glass) have finished, so the reveal shows a finished slide.
      // The framing is taken for the stage and the cards as they stand at the reveal: a size the stage settled to after its last
      // resize (the projector layout landing), or cards that settled after the camera framed them, are framed again under the
      // cover, outright. Left to the looks that follow those changes, the figure showed beside where it belonged and then moved
      // to the middle just after the reveal.
      // alloc-rare: boot cover: once per load
      const T = () => document.getElementById('world')?.getAttribute('transform') || '';
      // alloc-rare: boot cover: once per load
      const settle = () => { if (!ui || !shown) return; if (sizeNow() !== sizeSeen) onResize({ type: 'resize' }); else if (cardSig() !== framedSig) reframe(0); };
      let a = T(), same = 0;
      // (Each settle is a task between frames (rest-pass.js): the layout it makes is never built in a timer's own turn.)
      // alloc-rare: boot cover: once per load
      for (let i = 0; i < 40 && same < 5; i++) { await wait(60); await new Promise((done) => restPass(() => { try { settle(); } finally { done(); } })); const c = T(); same = c === a ? same + 1 : 0; a = c; }
      // alloc-rare: boot cover: once per load
      const runs = ui ? [...readAnims(ui.root, { subtree: true }), ...readAnims(ui.shade)].filter((x) => readTiming(x.effect).iterations !== Infinity) : [];
      // alloc-rare: boot cover: once per load
      await Promise.race([Promise.all(runs.map((x) => x.finished.catch(() => {}))), wait(1200)]);
      // alloc-rare: boot cover: once per load
      await cardsLanded({ until, alive: () => !!ui, entering: cardsEntering });   // (cover-lift.js: the cards' own way in is on card-throw.js's clock, which getAnimations() never lists)
      // (Once more as the entrances end: the slide's own framing, set outright for the cards where they now rest.)
      // alloc-rare: boot cover: once per load
      await new Promise((done) => restPass(() => { try { if (ui && shown && booting) { settle(); clearTimeout(reframeT); reframeT = 0; reframe(0); } } finally { done(); } }));
      // alloc-rare: boot cover: once per load
      await new Promise((done) => nextFrame(() => nextFrame(done)));
      // alloc-rare: boot cover: once per load
      await calmFrames({ smooth, alive: () => !!ui });   // (cover-lift.js: the cover's fade is on the clock too: it lifts on smooth frames, as the cards' fades do)
    }
    clearTimeout(coverT); booting = false;
    // (The cards fade in with the veil leaving, on card-throw.js's clock, in the task that shows them: they came in under the cover unseen, whole, and showed at once as it lifted. 17 Nov 2026, the
    // tester: the first panel and the title at opacity 0 and then 1 in one step. Hidden until here so no words show through the loader's own; written at 0 before they show, so none is seen whole first.)
    if (ui && !now && !reduce.matches) for (const el of [ui.shade, ui.text, ui.data, ui.panel]) if (el && !el.hidden && (el === ui.shade ? !ui.text.hidden && ui.text.childElementCount : el.childElementCount) && !throwing(el) && !el.classList.contains('pz-leave') && !el.classList.contains('pz-hide')) throwFade(el, 0, D_SMALL);   // alloc-rare: boot cover: once per load (the glass with its words)
    document.documentElement.classList.remove('pz-covered');   // (the cards show as the cover fades off them: it is 90 % opaque, so they come up with it, whole, never popping)
    const c = cover; cover = null;
    if (!c) return;
    c.classList.remove('on');
    // alloc-rare: boot cover: once per load
    setTimeout(() => c.remove(), 700);   // (after its fade, Reduce Motion too)
  }

  const { library, readLink } = createLibrary({ deckNumbers, fromScript, pview, rerenderHome, start, warm }, live);


  return { start, stop, library, readLink, active: () => !!deck, ink: () => ink,
    // Where the show is (for the preview pill's reload): the deck and the slide on screen, or the one it is moving to.
    position: () => (deck ? { id: deck.id, at: shown?.i ?? want } : null),
    // For the browser checks: straight to slide i (0-based) of the deck shown, as the arrow keys move.
    go: (i) => go(i), count: () => slides.length, busy: () => busy, glass: () => ui?.glass ?? null, degraded: () => ({ ...degraded, clipped: [...degraded.clipped], now: ui?.root.dataset.pzDegraded || '' }), skipLapse: () => skipLapse(),   // (a time-lapse sped to its end, as Next does)
    // What Settings shows while presenting.
    settings: () => ({ width: pzWidth, setWidth: setPanelWidth, contrast: hiCon, setContrast, stacked: phone() }),
    // For the browser checks: the time-lapse slides, and the card's tiles as the slide shown should read them at its start and end.
    probe: () => {
      const txt = (k, f) => (rateOf(k, f)[0] == null && (k === 'saag' || k === 'tp') ? '—' : tileVal(k, f[k], f));   // (as bigTiles shows it)
      const i = shown?.i ?? -1, s = slides[i], ks = s ? tileKeys(s) : [], end = s && states[stateOf[i]], start = s?.lapse && i > 0 ? end?.start || states[stateOf[i - 1]] : end;
      return { i, lapses: slides.flatMap((x, j) => (x.lapse && j > 0 && x.data ? [j] : [])), charts: slides.flatMap((x, j) => (x.lapse && j > 0 && x.tool?.kind === 'flowtime' ? [j] : [])), playing: lapseOn, keys: ks,
        start: start ? ks.map((k) => txt(k, respFp(s, start.fp))) : null, end: end ? ks.map((k) => txt(k, respFp(s, end.fp))) : null };
    } };
}
