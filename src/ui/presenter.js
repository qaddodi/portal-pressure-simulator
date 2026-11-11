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

import { isResponse } from './nsbb-response.js';
import { store, replaceParams } from './store.js';
import { download } from './download.js';
import { freshPatient } from './slide-motion.js';
import { controlOwnsKey } from './key-owner.js';
import { glWords } from './gl-words.js';
import { h, toast, svgIcon, icon, fmt, clamp, openModal, closeModal, isModalOpen, confirmDialog, askText, popoverOpen, restBox, paintRange, cssVar, swapText, setCanvasBoost, odoOn, STACK_MQ, SHORT_SIDE_MQ, TABLET_UP_MQ, themeChanged } from './util.js';
import { titleParts } from './title-units.js';
import { liveText, wordsOf } from './live-text.js';
import { swipeDir, SWIPE_MIN, SWIPE_RATIO, ownsSideways, ownsTouch, cardSwipe, caseFling, caseFlight, wheelFinger, wheelGesture, ownsWheel } from './swipe.js';
import { createVisuals } from './presenter-visuals.js';
import { createSvgGL, svgModel, viewMap, noteLoop } from './svg-gl.js';
import { chartCtx } from './chart-ctx.js';
import { sinusoidSupported } from './gl-support.js';
import { SCALE_NAME, offeredScales, scaleView, pickedScale } from './scale-switch.js';
import { offeredCutouts, cutoutSubject, plateRects, columnOf } from './cutouts.js';
import { createCutoutFrame } from './cutout-frame-gl.js';
// The spot of the liver the windows are taken from: the open right lobe, between the portal branches and the hepatic veins (fractions of the liver's box in the figure's units).
const PLATE_SPOT = [0.32, 0.5];
import { CIRC_REGIONS, isCamOn, unionBox, regionBox, growBox, camNames } from './cam-frame.js';
import { runSoon } from './class-soon.js';
import { NODE_POS } from './anatomy.js';
import { DISEASE_SRC, diseasePieces } from './diseases.js';
import { nb, listCase, plateletText } from './glue.js';
import { DECKS, DECK_ALIAS, REGIONS, LEVELS, TOPICS, withOverview, siteTag, SITE_TAGS } from './decks.js';
import { fingerprintOf } from '../engine/fingerprint.js';
import { hvpgSev } from '../engine/pressure-cuts.js';
import { createHvpgMonitor } from './hvpg-proc.js';
import { createTools } from './presenter-tools.js';
import { openHandout } from './handout.js';
import { createPresenterLink } from './presenter-view.js';
import { noteResume, resumeFor } from './resume.js';
import { parseDeckSource, checkDeck } from './deck-source.js';
import { cleanEq } from './import-safety.js';
import { NO_ASC, TILE, cutText, tileOf, SCALE, bandsOf, rateOf, COLS, CUT, PRESS, fpv, dirAbs, dirRel, rateAbs, effOf, rateShown, tileShown, tipsGoal, liveSettled, LIVE_MAX, shownSig, sameHead, headOf, cutDp } from './table-marks.js';
import { frameFor, cancelFrame, holdMotion, easeNow } from './frame.js';
import { loadGlyphs, glyphsReady, textWidth } from './text-gl.js';
import { restPass, cancelRest } from './rest-pass.js';
import { createSlidePrep } from './slide-prep.js';
import { createTxns, createLease, createScope } from './slide-txn.js';
import { glEpoch, onGLRestored } from './gl-state.js';
import { prepareShaders, shaderFailures } from './gl-compile.js';
import { createFigureKey } from './figure-key.js';
import { onTheme } from './theme-epoch.js';
import { traceWhen } from './trace-labels.js';
import { flowCss, heatCss, dropCss, gradientCss, oxygenCss } from './colormap.js';
import { EXT, expandIds, stepExtra, markLabel, figureHooks, safe, warmOf } from './slide-ext.js';
import { clotWords } from './callout-math.js';
import { citeText, focusOf, oneLadder } from './teach-extras.js';
import { createProfileTool, createProfileStrip, pillReadings, chartScale } from './tool-profile.js';
import { causeFit } from './cause-fit.js';
import { anchorsOf, roomFor } from './cam-room.js';
import { beatCount, beatView } from './slide-beats.js';
import { clausesOf, revealCount, shownLine } from './reveal.js';
import { COMPACT, WIDE } from './card-type.js';
import { createFlowTime, flowTimeHeight, trailKeys } from './flow-time.js';
import { lapseGraphOf, graphTrail } from './lapse-graph.js';
import { createEventGraph, eventGraphOf } from './event-graph.js';
import { specOf, procKindOf, procBlocked, procOffered, playProcedure, stepMarks } from './proc-anim.js';
import { createInsetHold } from './inset-hold.js';
import { dataPlan, textPlan, keepData, keepText, cardSnap, cardChangedWhy, cardBack } from './card-keep.js';
import { gpuProbe } from './gpu-probe.js';
import { createCardZoom, tapTracker } from './card-zoom.js';
import { sheetPanes } from './sheet-glass.js';
import { createScopeTile } from './scope-tile.js';
import { tileKeys as cardKeys, toolOnly } from './card-tiles.js';
import { D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, RISE_PX, cssCurve, easeIn, easeArrive } from './ease.js';
import { glideOpacity, glideTranslate, glideStop, glideX, glideY } from './script-glide.js';
import { signalMove } from './num-move.js';
import { shownState as pageShown } from './shown.js';
import { createTileShown, tileSmall } from './tile-shown.js';
import { slideFold } from './fold-slide.js';
import { pageOn, followOf, pageIn, swipeHeld } from './card-page.js';
import { throwOut, throwIn, throwBack, throwLeft, throwing, throwStop, throwsOut, THROW_IN, THROW_STAGGER, throwOutNow, throwLeaving, throwHeld, throwPinned, throwRelease, throwState, throwBusy, throwLanded, throwFade, RAIL_GAP, RAIL_MS, easeRail } from './card-throw.js';
import { readAnims, readBox, readCTM, readMetric, readRects, readStyle, readTiming, scrollInto, stageBox } from './layout-snap.js';
import { caught } from './caught.js';
import { createInk } from './ink-gl.js';
const nextFrame = frameFor('presenter');

import { readMine, writeMine, NO_ROOM, enc, dec } from './script-library.js';
// Test decks: on the /preview/ copy only (never the live site), listed under "Testing" in Present. Each plays exactly as
// if imported (an "Outline and objectives" slide in front, so its slide numbers match the imported file's).
const PREVIEW = typeof location !== 'undefined' && /\/preview\//.test(location.pathname);
// (Loaded only there: the live site's bundle carried the 53 KB deck for nothing. The menu reads TESTING when it opens, long after.)
let TESTING = [];
const testingLoad = PREVIEW ? import('./test-decks/demo-all-new-visuals.js').then(({ DEMO_ALL }) => { TESTING = [DEMO_ALL].map((d) => ({ id: 'test-' + d.id, title: d.title, summary: d.summary || '', deck: checkDeck(d), test: true })); }).catch(() => { /* the preview's test deck only */ }) : Promise.resolve();
// alloc-rare: one timer per awaited step of a procedure, seconds apart, not per frame
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NEVER = () => false;   // (a wait nothing cuts: a caller with no change of its own to ask)
import { reduceMotionMQ as reduce, easeMove, COUNT_MS } from './motion.js';
import { createScopeLens } from './scope-lens.js';
import { createWaits } from './wait-cut.js';
import { VIEW_CHANGE_MS } from './view-xf.js';
const ease = easeMove;   // (the tweens and glides of the data card: the one in-out curve, motion.js)
// Waits a newer press can cut (wait-cut.js): waitCut(ms, cut) ends at ms or the first frame in which cut() holds; until(fn, ms) is the same asked the other way.
// Looked at by frame (a hidden tab, which runs none, by a slow poll and the timer), no longer by a 40 ms timer that made every wait about 20 ms late.
const { waitCut, until } = createWaits({ frame: nextFrame });
// The change between Anatomy and Circuit has landed (stage.viewChanging), or ms pass: the longest it can take, VIEW_CHANGE_S, and a margin for a late frame.
const viewSettled = (cut, stage) => waitCut(VIEW_CHANGE_MS + 400, () => cut() || !stage.viewChanging?.());
/** One painted frame (or 100 ms: a hidden tab paints none). */
const painted = () => new Promise((done) => { const t = setTimeout(done, 100); nextFrame(() => { clearTimeout(t); done(); }); });
/** Until the page paints two frames in a row promptly, or ms pass. A card's fade is timed by the clock, not by the frames shown:
 *  one begun just before a long frame (a new organ picture, a lens repainting the figure) is over when that frame lands, and the
 *  card seems to pop. Begun once the frames come smoothly, it is seen whole. */
async function smooth(cut, ms = 700) {
  const need = 2;   // (two prompt frames in a row since 1 Nov 2026: one alone was often the gap between two long ones)
  const t0 = performance.now(); await painted(); let last = performance.now(), run = 0;
  while (!cut() && performance.now() - t0 < ms) { await painted(); const t = performance.now(); run = t - last < 40 ? run + 1 : 0; if (run >= need) return; last = t; }
}
const LOBULE_CAM = /^(lobule|sinusoid)/;

// ── Numbers ────────────────────────────────────────
// A slide's equation (decks.js eq: [MathML, legend]): typeset by the browser's own MathML, the legend under it.
function equation(eq) {
  const box = h('div', { class: 'pz-eq' });
  const [ml, legend] = cleanEq(eq) || ['', ''];   // (imported decks reach here too: only allowlisted MathML is set as markup)
  box.innerHTML = ml ? `<math>${ml}</math>` : '';
  if (legend) box.append(h('p', { class: 'pz-eqk' }, legend));
  return box;
}
// A source line under the words (V23): cite: 'Baveno VIII 1.15, 1.16', in the caveat's small print.
const citeEl = (s) => (citeText(s.cite) ? h('p', { class: 'pz-cite' }, citeText(s.cite)) : null);
// A slide's lens (decks.js lens): what the vessel colours show on that slide, with a key under its line, its name ("Velocity")
// and the two ends, as the legend does in Explore. (Learner-facing words say "colored by", never "lens".)
// Pressure is the default and needs no key.
const LENS_KEY = {
  velocity: ['velocity', [['--vel-slow', 'Slow'], ['--vel-fast', 'Fast']]],
  flow: ['flow volume', () => flowCss('to right'), 'Little', 'Much'],
  direction: ['direction', [['--flow-normal', 'Usual'], ['--flow-reversed', 'Reversed']]],
  heat: ['congestion', () => heatCss('to right'), 'None', 'Backed up'],
  drop: ['pressure drop', () => dropCss('to right'), 'Low', 'High'],
  delta: ['change', () => 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))', 'Lower', 'Higher'],
  oxygen: ['oxygen', () => oxygenCss('to right'), 'Low', 'High'],
  origin: ['origin', [['--origin-smv', 'SMV'], ['--origin-imv', 'IMV'], ['--origin-spleen', 'Spleen', 'SV'], ['--origin-artery', 'Artery', 'HA'], ['--origin-systemic', 'Systemic', 'Sys']]],   // (the short names blood.js ORIGINS uses: a phone's key beside the pill, fitKey)
  firstpass: ['first pass, not ammonia', [['--fp-raw', 'Not cleared', 'Raw'], ['--fp-clear', 'Cleared by the liver', 'Clear'], ['--origin-artery', 'Artery', 'HA'], ['--origin-systemic', 'Systemic', 'Sys']]],   // (gut blood by the path it took: blood.js FIRSTPASS; the name says it is no ammonia level)
};
// (A deck visuals package's lenses (slide-ext.js) after the app's own; a key whose words depend on the slide is a function of it.)
for (const [k, v] of Object.entries(EXT.lenses)) if (!LENS_KEY[k]) LENS_KEY[k] = v;
const lensSpec = (k, s) => { const v = LENS_KEY[k]; return typeof v === 'function' ? safe(() => v(s), null, `lenses.${k}`) : v; };
export const slideLens = (s) => (!s?.visual && LENS_KEY[s?.lens] ? s.lens : 'pressure');
// Pressure's key shows only on a slide with lens buttons (the default needs none).
const PRESSURE_KEY = ['pressure', () => gradientCss('to right', 30), 'Low', 'High'];
const lensButtons = (s) => !!s.compare?.some((o) => o.lens);
const gateButtons = (s) => !!s.compare?.some((o) => o.gate);
const toolButtons = (s) => !!s.compare?.some((o) => o.tool);
/** What a compare slide's button k does. A lens button ({ label, lens }) crossfades the figure to that lens and a gate
 *  button ({ label, gate }) moves the stent Doppler's gate, the model untouched; so does a tool button ({ label, tool: { red: false } }),
 *  which changes the options of the slide's instrument (the slide's own button, { label, own: true }, puts them back). A patient button ({ label, preset, block? })
 *  eases the live model to that patient, computed with the slide's states, and a time-point button ({ label, slide }) to that
 *  slide's state in the same deck (one patient's earlier visit); the slide's own button eases back to the slide's
 *  exact state when the row has a patient button or when it names no params of its own ({ label, own: true }: the slide's
 *  state is its params, Mohammad, 19 Oct: "when i click no tips then tips again the tips doesn't come"). A normal heart is
 *  then a healthy circulation (none of the failing heart's retained fluid or ascites is left behind), and the failing heart
 *  is the slide's numbers exactly. Any other button patches the live model's params with its own.
 *  → { kind: 'lens', lens } | { kind: 'gate', gate } | { kind: 'tool', tool } (tool: null, the slide's own options) | { kind: 'state' } | { kind: 'params', patch } */
export function abChoice(compare, k) {
  const o = compare[k];
  if (o.lens) return { kind: 'lens', lens: o.lens };
  if (o.gate) return { kind: 'gate', gate: o.gate };
  if (o.tool) return { kind: 'tool', tool: o.tool };
  if (o.own && compare.some((p) => p.tool)) return { kind: 'tool', tool: null };
  if (o.preset || o.slide || (o.own && (!o.params || compare.some((p) => p.preset || p.slide)))) return { kind: 'state' };
  return { kind: 'params', patch: o.params || {} };
}
// The key for the small pill on the figure (figure-key.js): the lens named, then its colour scale under it (a gradient has no end words; named swatches keep their names).
// (The pressure-drop key also names its ends, "Low ▬▬ High", as the velocity key does: a bare green bar did not say which end was
// which (17 Oct design review). The other scales keep the bar alone.)
const KEY_ENDS = new Set(['drop']);
function keyNodes(k, s) {
  const [name, bar, lo, hi] = lensSpec(k, s) || PRESSURE_KEY;
  const sw = (v) => h('i', { class: 'pz-lens-sw', style: { background: `var(${v})` } });
  // (Each swatch stays on one line with its words: "Low ▬▬ High" as one piece, a short stroke with its name.)
  const scale = () => h('i', { class: 'pz-lens-bar', style: { background: bar() } });
  return [h('b', {}, name[0].toUpperCase() + name.slice(1)),
    ...(typeof bar === 'function' ? [KEY_ENDS.has(k) ? h('span', { class: 'pz-lens-ends' }, h('span', {}, lo), scale(), h('span', {}, hi)) : scale()]
      // (The named swatches travel as one group: a key that wraps sets its name on one line and all its swatches on the next, never
      // one swatch left alone under the others: Mohammad, 17 Oct, "Reversed" had dropped under "Direction · Usual".)
      // (A swatch may carry a short name, [var, name, short]: a phone's key takes them only to fit beside the pill, fitKey.)
      : [h('span', { class: 'pz-lens-items' }, ...bar.map(([v, t, sh]) => h('span', { class: 'pz-lens-k', title: sh ? t : null }, sw(v), h('span', { class: sh ? 'pz-lk-l' : null }, t), sh ? h('span', { class: 'pz-lk-s', 'aria-hidden': 'true' }, sh) : null)))])];
}
// A string with its disease names set in a pill (see diseases.js).
const diseaseNodes = (t) => diseasePieces(t).map(([x, dz]) => (dz ? h('span', { class: 'pz-dz' }, x) : x));
// A slide's line, typeset. One value goes in a quiet pill: the one the deck marks with {braces}, else the first
// value with a unit (a line of cut-offs leaves the rest to its scale). The slide's own key terms (its highlighted
// tiles, or `bold`) are bold wherever the line names them; the first mention of a term students meet for the first
// time is bold too, at most three bold terms a line, so it stays a sentence and not a list of highlights.
const VAL = String.raw`(?:[<>≥≤]\s?)?\d+(?:\.\d+)?(?:\s(?:to|or)\s\d+(?:\.\d+)?)?\s?(?:mmHg|g\/dL|mL\/min|kPa|cm\/s|mm|%)(?![A-Za-z])`;
const TERMS = ['CSPH', 'SAAG', 'WHVP', 'FHVP', 'central vein', 'portal tracts?', 'fenestrae', 'space of Disse',
  'basement membrane', 'capillarization', 'wedged pressure', 'free pressures?', 'sinusoidal pressure', 'caput medusae',
  'gastrorenal shunt', 'stellate cells?', 'encephalopathy', 'periportal fibrosis', 'intrahepatic resistance', 'hepatopetal', 'hepatofugal',
  'cavernoma', 'a wave', 'pulsatility', 'reflection coefficient', 'Laplace', 'congestion index', 'indeterminate zone', 'red wale marks'];
// A tile's words in a line (the slide's key tiles are its key terms).
const KEYWORDS = { hvpg: 'HVPG', ppg: 'PPG', pv: 'portal pressure', whvp: 'WHVP|wedged pressure', fhvp: 'FHVP|free pressure', ra: 'right atrial pressure|right atrium',
  ivc: 'IVC', varix: 'varix|varices', hr: 'heart rate', map: 'blood pressure', rpp: 'kidney pressure', asc: 'ascites', plt: 'platelets?', lsm: 'stiffness', ssm: 'spleen stiffness|SSM', spleen: 'spleen',
  liver: 'liver blood flow', shunt: 'shunt', sin: 'sinusoidal pressure', saag: 'SAAG', tp: 'protein', hb: 'hemoglobin', hbTo: 'hemoglobin to come', pvFlow: 'portal flow', pvVel: 'portal vein velocity', clot: 'clot',
  co: 'cardiac output', bv: 'blood volume', he: 'encephalopathy risk|HE risk' };
// alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What a word in a line can point at on the figure (a term pill, M1): the station's label (node), the vessels that
// glow (edges) or the organ outlined, in the station's colour (tone: --tr-<tone>), and the words that name it.
const TARGETS = {
  pv: { node: 'CONF', edges: ['PV_TRUNK'], tone: 'pv', words: 'portal vein' },
  sv: { node: 'SV', edges: ['SV_CONF', 'SV_MID', 'V_SPL'], tone: 'sv', words: 'splenic vein|splenic' },
  imv: { node: 'IMV', edges: ['V_IMV'], tone: 'imv', words: 'inferior mesenteric veins?|inferior mesenteric' },
  smv: { node: 'SMV', edges: ['SMV_CONF', 'V_INT'], tone: 'smv', words: 'superior mesenteric veins?|superior mesenteric' },
  sin: { node: 'SIN_R', edges: ['SIN_RR', 'SIN_LL'], tone: 'wedge', words: 'sinusoids?|sinusoidal pressure' },
  whvp: { node: 'SIN_R', organ: 'liver', tone: 'wedge', words: 'WHVP|wedged pressure' },
  fhvp: { node: 'RHV', edges: ['RHV_IVC'], tone: 'hv', words: 'FHVP|free pressure' },
  hv: { node: 'RHV', edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], tone: 'hv', words: 'hepatic veins?' },
  ivc: { node: 'IVCS', edges: ['IVCS_RA', 'IVC_IS'], tone: 'ivc', words: 'IVC|inferior vena cava' },
  ra: { node: 'RA', organ: 'heart', tone: '--tour-sys', words: 'right atrium' },
  varix: { node: 'VAR', edges: ['C1a', 'C1b'], tone: 'var', words: 'esophageal varices|varices|varix' },
  gv: { node: 'GV', edges: ['C2'], tone: 'var', words: 'gastric varices|fundal varices' },
  lgv: { node: 'LGV', edges: ['LGV_CONF', 'V_STO'], tone: 'var', words: 'left gastric vein|coronary vein' },
  // The cavernoma: the periportal collaterals around a clotted portal vein (its own colour, apart from the varices').
  cavernoma: { edges: ['C8'], tone: 'cav', words: 'cavernomas?' },
  azy: { node: 'AZY', edges: ['AZY_SVC'], tone: 'var', words: 'azygos(?: vein)?' },
  // The circuit's resistors (its zigzags): lit in a station colour, not outlined.
  rLiver: { res: 'rLiver', tone: 'wedge', words: 'resistance' },
  rColl: { res: 'rColl', tone: 'var', words: 'collaterals' },
  rGut: { res: 'rGut', site: 'rGut', tone: 'smv', words: 'gut arterioles' },
  // The hepatic artery (both views): one word lights it, in the artery's colour, as the lobule's arterioles are.
  ha: { node: 'HA', edges: ['A_HEP', 'A_HR', 'A_HL'], tone: '--artery', words: 'hepatic arter(?:y|ies)' },
  lpv: { node: 'LPV', edges: ['PVH_L'], tone: 'pv', words: 'left portal vein' },
  lrv: { node: 'LRV', edges: ['LRV_IVC', 'V_KID_L'], tone: 'ivc', words: 'left renal vein' },
  spleen: { organ: 'spleen', tone: 'sv', words: 'spleen' },
  liver: { organ: 'liver', tone: 'wedge', words: 'liver' },
  // The caudate lobe with its veins draining into the IVC; caudateLobe: the lobe alone (a DIPS runs through it).
  caudate: { organ: 'caudate', tone: 'hv', words: 'caudate lobe' },
  caudateLobe: { organ: 'caudate-lobe', tone: 'hv', words: 'caudate lobe' },
  heart: { organ: 'heart', tone: '--tour-sys', words: 'heart' },
  // Inside the liver (lit: the lobule's and the sinusoid's own labels take the colour and a soft glow, .app[data-lit]).
  'lobule:triad': { lit: true, tone: 'pv', words: 'portal tracts?|portal triads?|portal venules?' },
  'lobule:arteriole': { lit: true, tone: '--artery', words: 'hepatic arterioles?|arterioles?' },
  'lobule:ductule': { lit: true, tone: '--bile-duct', words: 'bile ductules?|bile ducts?' },
  'lobule:sinusoid': { lit: true, tone: 'wedge', words: 'sinusoids?' },
  'lobule:central': { lit: true, tone: 'hv', words: 'central veins?|central venules?' },
  'lobule:lymph': { lit: true, tone: 'ivc', words: 'lymphatics?|lymph' },
  'lobule:zone1': { lit: true, tone: 'pv', words: 'zone 1|periportal' },
  'lobule:zone3': { lit: true, tone: 'hv', words: 'zone 3|centrilobular' },
  'sinusoid:fenestrae': { lit: true, tone: 'accent', words: 'fenestrae' },
  'sinusoid:disse': { lit: true, tone: 'accent', words: 'space of Disse' },
  'sinusoid:stellate': { lit: true, tone: 'accent', words: 'stellate cells?' },
  'sinusoid:kupffer': { lit: true, tone: 'accent', words: 'Kupffer cells?' },
  'sinusoid:hepatocyte': { lit: true, tone: 'accent', words: 'hepatocytes?|liver cells' },
  'sinusoid:lymph': { lit: true, tone: 'ivc', words: 'lymph' },
  'sinusoid:lumen': { lit: true, tone: 'wedge', words: 'sinusoids?' },
};
const toneVar = (t) => (t === 'accent' ? 'var(--accent)' : t.startsWith('--') ? `var(${t})` : `var(--tr-${t})`);
// (A deck visuals package's targets (slide-ext.js) after the app's own, before the node names and the station tones.)
for (const [k, t] of Object.entries(EXT.targets)) if (!TARGETS[k]) TARGETS[k] = t;
// Node ids name their target too ([portal vein](CONF) is [portal vein](pv)).
for (const [k, t] of Object.entries(TARGETS)) if (t.node && !TARGETS[t.node]) TARGETS[t.node] = TARGETS[k];
const ORGANS = new Set(['liver', 'caudate', 'caudate-lobe', 'spleen', 'heart', 'heart-ra', ...EXT.organs]);
// A vessel's station colour, for a glow written by hand (glow: ['PV_TRUNK']).
const EDGE_TONE = {};
for (const t of Object.values(TARGETS)) for (const e of t.edges || []) EDGE_TONE[e] ||= t.tone;
// (Collaterals and spontaneous shunts take the varices' colour: one family on the figure.)
for (const e of ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'S_PC', 'S_DSR', 'S_MC']) EDGE_TONE[e] ||= 'var';
EDGE_TONE.REX ||= 'pv';   // (the Meso-Rex graft carries portal blood to the liver: the portal colour)
// A live value's colour ({pv}): the station it is read at; a value with no station (HVPG) is a plain pill.
// The station label each site reading would repeat (an IVC web's lower reading is its own place, so it has none).
export const SITE_NODE = { pv: 'CONF', ivc: 'IVCS', ra: 'RA' };
const VAL_TONE = { pv: 'pv', whvp: 'wedge', sin: 'wedge', fhvp: 'hv', ivc: 'ivc', ra: '--tour-sys' };
// A reading with no station of its own (a size: the spleen, the varices) takes its status colour, as its card
// shows it, on its pill and on its organ's outline; neutral while it is normal.
const BY_RATE = new Set(['spleen', 'varix', 'gv']), RATE_TONE = { hi: '--danger', mid: '--caution' };
const rateTone = (k, fp) => RATE_TONE[rateShown(k, fp)[0]] || null;   // (judged as its pill prints it)
// A filled pill (the patient) takes its tile's rating colour, as the tile's bar shows it: green, amber or red (Mohammad,
// 19 Oct). A value its tile does not rate or rates only as information keeps its station's colour, or none.
const PILL_TONE = { ok: '--ok', mid: '--caution', hi: '--danger' };
const pillRate = (k, fp, tips = false) => (fp?.[k] == null ? null : tips && k === 'ppg' ? tipsGoal(tileShown(k, fp[k]))[0] : rateShown(k, fp)[0]);   // (after TIPS the PPG is read against its target, as its tile reads it)
const valTone = (k, fp, tips) => PILL_TONE[pillRate(k, fp, tips)] || (BY_RATE.has(k) ? null : VAL_TONE[k]);
// A slide's terms: { words: target } (terms: ['pv', 'ra'] takes each target's own words). A word every slide uses the
// same way needs no listing: the cavernoma is always a pill that lights its collaterals.
const AUTO_TERMS = ['cavernoma'];
function termList(s) {
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const t = s.terms || [];
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const own = Array.isArray(t) ? t.map((k) => [TARGETS[k]?.words, k]) : Object.entries(t).map(([w, k]) => [esc(w), k]);
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const have = new Set(own.map(([, k]) => k));
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  return [...own, ...AUTO_TERMS.filter((k) => !have.has(k)).map((k) => [TARGETS[k].words, k])].filter(([w, k]) => w && TARGETS[k]);
}
/** Everything a slide points at on the figure: its terms (as the line names them) and its glow field. */
// On a Doppler slide the vessel being read glows the Doppler's green (as in Explore), over the colour its word would give it.
const isDop = (s) => s?.tool?.kind === 'doppler';
export function slideTargets(s, line = shownLine(s, s.revealed)) {   // (a revealing slide names only the clauses shown so far: reveal.js)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const keys = new Set();
  for (const m of line.matchAll(/\[([^\]]+)\]\(([\w:]+)\)/g)) if (TARGETS[m[2]]) keys.add(m[2]);
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  for (const [w, k] of termList(s)) if (new RegExp(`\\b(?:${w})\\b`, 'i').test(line)) keys.add(k);
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const labels = [], terms = {}, soft = new Set(), glow = new Map(), organs = new Map(), res = new Map(), lit = new Set(), sites = new Set(), groups = [];
  for (const k of keys) {
    const t = TARGETS[k];
    if (t.node) { labels.push(t.node); terms[t.node] = t.tone; }
    if (t.lit) lit.add(k);
    if (t.site) sites.add(t.site);
    if (t.edges?.length) groups.push(t.edges);   // (groups: each thing the slide lights as the vessels that make it up, for the camera's room: cam-room.js)
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    for (const e of t.edges || []) glow.set(e, t.tone);
    if (t.organ) organs.set(t.organ, t.tone);
    if (t.res) res.set(t.res, t.tone);
  }
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  for (const k of s.tint || []) { const t = TARGETS[k]; if (t?.node) terms[t.node] = t.tone; }   // (a label the line does not name, in its colour all the same)
  // glowSeq (ms): the glow field lights in its order, one step apart (pressure passing back from the heart, D6).
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const at = new Map();
  // (An entry may be a list of vessels, a step's group (V10): they light together, at the entry's moment.)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  expandIds(s.glow || []).forEach((g0, i) => { for (const g of Array.isArray(g0) ? expandIds(g0) : [g0]) {   // ('@name': a deck visuals package's named set, slide-ext.js)
    const id = typeof g === 'string' ? g : g.id, tone = typeof g === 'string' ? null : g.tone, ms = s.glowSeq ? i * s.glowSeq : 0;
    // { id, soft: true }: a supporting vessel, lit more gently than the one the slide is about.
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    const add = (e, tn) => { glow.delete(e); glow.set(e, tn); if (ms) at.set(e, ms); if (g.soft) soft.add(e); else soft.delete(e); };
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    if (TARGETS[id]) { const t = TARGETS[id]; if (t.lit) lit.add(id); if (t.res) res.set(t.res, tone || t.tone); if (t.edges?.length) groups.push(t.edges); for (const e of t.edges || []) add(e, tone || t.tone); if (t.organ) organs.set(t.organ, tone || t.tone); }
    else if (ORGANS.has(id)) organs.set(id, tone || TARGETS[id]?.tone);
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    else { groups.push([id]); add(id, tone || EDGE_TONE[id] || 'accent'); }
  } });
  // A lobule slide that lights the portal venule's or the central vein's reading lights the sinusoids' as well: the
  // sinusoidal pressure sits between the two, and the other labels are faded out (Mohammad, 16 Oct).
  if (lit.has('lobule:central') || lit.has('lobule:triad')) lit.add('lobule:sinusoid');
  if (isDop(s)) { const v = s.tool.vessel || 'PV_TRUNK'; if (glow.has(v)) glow.set(v, '--dop-glow'); }
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  return { labels, terms, glow: [...glow].map(([id, tone]) => ({ id, tone, at: at.get(id) || 0, soft: soft.has(id) || undefined })), organs: [...organs].map(([id, tone]) => ({ id, tone })), res: [...res].map(([id, tone]) => ({ id, tone })), lit: [...lit], sites: [...sites], groups };
}
/** What the names of a slide's `cam: { on: [names] }` point at, as { organs, edges, points, unknown }: the vessels, organs and station
 *  places the camera frames ('@name': a named set, slide-ext.js). The same names a glow takes, plus a station's id (CONF, AO). */
// alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
export const camOn = (on) => camNames(expandIds(on), { targets: TARGETS, organs: ORGANS, nodes: NODE_POS });
// A live value pill ({pv}): the model's reading for this slide, to its usual decimal.
// {ppg@before}: the value at another slide of the deck (its id), set by the presenter while a deck plays.
let fpAt = () => null;
const atRe = /^(\w+)@([\w-]+)$/;
function liveVal(k, s, fp) {
  const T = TILE[k], v = fp?.[k];
  if (v == null || !Number.isFinite(v)) return '…';
  const d = T.d ?? 1;
  if (k === 'plt') return plateletText(v);   // (in running text "88,000/µL"; the tile keeps ×10³/µL)
  return `${fmt(v * (T.x || 1), d)}${T.u === '%' ? '%' : T.u ? ` ${T.u}` : ''}`;   // ("75%": no space before the sign)
}
// A line, typeset (see above). Also: {pv} a live value, {>=10 mmHg} a cut-off (outlined), and a term that points
// at the figure, [portal vein](pv) or through the slide's terms field, as a pill in its station's colour.
// The line's tokens, in the order they win where two start at one place: a [link](target), a {marked value}, a disease
// name (so a term or bold word inside one, "portal vein" in "portal vein thrombosis", never takes its violet pill), a
// slide term, a value with a unit, a key word, a first-mention term. Group 5 is the disease name.
// (A group that never matches holds the place of an empty list, so each kind keeps its group number.)
function lineRe(s = {}) {
  const keys = [...(s.key || []).map((k) => KEYWORDS[k]).filter(Boolean), ...(s.bold || []).map(esc)];
  const tl = termList(s), tw = tl.map(([w]) => w.replace(/(^|\|)([a-z])/g, (_, p, c) => `${p}[${c}${c.toUpperCase()}]`));   // (a term may open the sentence)
  const re = new RegExp(String.raw`\[([^\]]+)\]\(([\w:]+)\)|\{([^}]+)\}([,.;:]?)|\b(${DISEASE_SRC})\b` + (tw.length ? `|\\b(${tw.join('|')})\\b` : '|((?!))') + `|(${VAL})([,.;:]?)` + (keys.length ? `|\\b(${keys.join('|')})\\b` : '|((?!))') + `|\\b(${TERMS.join('|')})\\b|${LENS_RE}`, 'g');
  return { re, tl };
}
// A view the words name ("With the vessels colored by congestion"): the view's name is a pill in that view's own colour,
// as its key on the figure draws it (Mohammad, 16 Oct). It points at nothing on the figure, so it lights nothing.
export const LENS_WORDS = { 'pressure drop': 'drop', 'blood origin': 'origin', origin: 'origin', 'first pass': 'firstpass', velocity: 'velocity', 'flow volume': 'flow',
  flow: 'flow', direction: 'direction', congestion: 'heat', change: 'delta', 'vein system': 'system', oxygen: 'oxygen' };
export const LENS_TONE = { velocity: '--vel-normal', flow: '--lens-flow', direction: '--flow-reversed', heat: '--lens-heat', drop: '--lens-drop', delta: '--delta-high', origin: '--origin-spleen', firstpass: '--fp-clear', system: '--tr-var', oxygen: '--lens-oxygen' };
const LENS_RE = String.raw`\b([Cc]olou?red by )(${Object.keys(LENS_WORDS).sort((a, b) => b.length - a.length).join('|')})\b`;
function rich(t, s = {}, fp = null, tips = false, cuts = null) {
  const { re, tl } = lineRe(s);
  const marked = /\{(?!#\d+\})[^}]+\}/.test(t);   // ({#1}, a figure's step marker, is no value: it never keeps a typed number from its pill)
  const out = [], seen = new Set(), seenT = new Set(); let at = 0, bold = 0, pills = 0, m;
  t = nb(t);
  // (cuts: where the clauses of a revealing line end, as offsets in the line as typeset; a CUT in the list marks each: grouped at the end.)
  let ci = 0;
  const plain = (a, b) => { for (; cuts && ci < cuts.length && cuts[ci] <= b; ci++) { if (cuts[ci] > a) { out.push(t.slice(a, cuts[ci]), CL_CUT); a = cuts[ci]; } } out.push(t.slice(a, b)); };
  const flush = (to) => { for (; cuts && ci < cuts.length && cuts[ci] <= to; ci++) out.push(CL_CUT); };
  // A pill keeps the word before it and the stop after it on its line (a no-break space, one unbreakable span).
  const glue = () => { const prev = out[out.length - 1]; if (typeof prev === 'string') out[out.length - 1] = prev.replace(/ $/, '\u00a0'); };
  const pill = (v, stop, cls = '', tone = null, rate = null) => { glue();
    pills++; return h('span', { class: stop ? 'pz-nw pz-stop' : 'pz-nw' }, h('span', { class: `pz-val${cls}${tone ? ' tone' : ''}`, 'data-rate': PILL_TONE[rate] ? rate : null, style: tone ? `--tone: ${toneVar(tone)}` : null }, v.replace(/\s(?=mmHg|g\/dL|mL|kPa|cm\/s|mm\b|%)/, '\u00a0')), stop || ''); };
  // A figure's numbered marker ({#2}, the glow step of that number, V10) in the words: the figure's own black circle and light
  // numeral, sized to the line (styles/app.css .pz-step). It keeps the word before it and the stop after it on its line.
  const stepMark = (n, stop) => { glue(); return h('span', { class: stop ? 'pz-nw pz-stop' : 'pz-nw' }, h('span', { class: 'pz-step', role: 'img', 'aria-label': `Step ${n}` }, String(n)), stop || ''); };
  const termPill = (w, k) => { const tone = TARGETS[k].organ === 'spleen' ? (fp && rateTone('spleen', fp)) || '--text-2' : TARGETS[k].tone;   // (the spleen's word, as its outline)
    return h('span', { class: 'pz-term', 'data-target': k, style: `--tone: ${toneVar(tone)}` }, w); };
  while ((m = re.exec(t))) {
    const [all, lw, lk, mk, mkStop, dz, tword, val, valStop, key, term, lensBy, lensW] = m, w = (key || term)?.toLowerCase().replace(/(?:s|ces)$/, '');
    if (val && (marked || pills || s.pill === false)) continue;
    if (term && (seen.has(w) || bold >= 3)) continue;
    if (key && seen.has(w)) continue;
    const tk = tword ? tl.find(([x]) => new RegExp(`^(?:${x})$`, 'i').test(tword))?.[1] : null;
    if (tword && (!tk || seenT.has(tk))) continue;
    plain(at, m.index);
    if (lensW) out.push(lensBy.replace(/ $/, '\u00a0'), h('span', { class: 'pz-term pz-lens-t', style: `--tone: ${toneVar(LENS_TONE[LENS_WORDS[lensW]])}` }, lensW));
    else if (lw) out.push(TARGETS[lk] ? termPill(lw, lk) : lw);
    else if (tword) { seenT.add(tk); out.push(termPill(tword, tk)); }
    else if (mk && /^#\d+$/.test(mk)) out.push(stepMark(+mk.slice(1), mkStop));
    else if (mk && TILE[mk]) out.push(pill(liveVal(mk, s, fp), mkStop, '', valTone(mk, fp, tips), pillRate(mk, fp, tips)));
    else if (mk && atRe.test(mk) && TILE[mk.match(atRe)[1]]) { const [, k, id] = mk.match(atRe), f = fpAt(id); out.push(pill(liveVal(k, s, f), mkStop, '', valTone(k, f), pillRate(k, f))); }
    else if (mk && /^[<>≥≤]=?/.test(mk)) out.push(pill(cutText(mk), mkStop, ' cut'));   // (a cut-off keeps its sign, "≥10 mmHg": a comparison is a symbol, never "at or above", Mohammad 26 Oct)
    else if (mk) out.push(pill(mk, mkStop, ' cut'));   // (a number typed in braces, {6 to 8 g}: a rule, outlined; only a live value is the patient)
    else if (val) out.push(pill(val, valStop, ' cut'));   // (a typed number is a rule or a figure from the literature, not the patient: outlined)
    else if (dz) out.push(h('span', { class: dz.length <= 25 ? 'pz-dz pz-nw' : 'pz-dz' }, dz));   // (a name never splits across two lines, "heart | failure"; a long one may, rather than run past a narrow card)
    else { seen.add(w); bold++; out.push(h('b', {}, key || term)); }
    at = m.index + all.length;
    // (A term pill keeps the stop or bracket after it on its line.)
    const last = out[out.length - 1];
    if (last?.classList?.contains('pz-term') && /^[),.;:]+/.test(t.slice(at))) { const st = t.slice(at).match(/^[),.;:]+/)[0]; out[out.length - 1] = h('span', { class: 'pz-nw pz-stop' }, last, st); at += st.length; }
    flush(at);
  }
  plain(at, t.length);
  // (The last line never holds a word or a pill alone: the line's last plain space is a no-break space when what follows it is short.)
  for (let i = out.length - 1, tail = 0; i >= 0 && tail <= 12; i--) {
    const x = out[i], j = typeof x === 'string' ? x.lastIndexOf(' ') : -1;
    if (x === CL_CUT) continue;
    if (j < 0) { tail += typeof x === 'string' ? x.length : x.textContent.length; continue; }
    if (tail + x.length - j - 1 <= 12 && /\S/.test(x.slice(0, j))) out[i] = `${x.slice(0, j)}\u00a0${x.slice(j + 1)}`;
    break;
  }
  if (!cuts) return out;
  // Each clause in a span of its own (pz-cl): the reveal fades and lifts them one at a time (revealPaint).
  const parts = [[]];
  for (const x of out) { if (x === CL_CUT) parts.push([]); else parts.at(-1).push(x); }
  return parts.map((p, k) => h('span', { class: 'pz-cl', 'data-cl': String(k) }, ...p));
}
const CL_CUT = Symbol('clause cut');
// A revealing slide's line (reveal.js): the whole line is typeset, so the card is fitted once and never reflows, each clause in a span;
// the first `n` are on, the rest transparent (app.css .pz-cl).
function revealLine(s, fp, tips, n) {
  const cl = clausesOf(s.line), cuts = []; let acc = '';
  for (const c of cl.slice(0, -1)) { acc += c; cuts.push(nb(acc).length); }
  const nodes = rich(cl.join(''), s, fp, tips, cuts);
  paintClauses(nodes, n);
  return nodes;
}
/** Shows the first `n` clauses of a line (its spans, or the paragraph holding them): the rest are transparent and hidden from a reader. */
function paintClauses(line, n) {
  for (const c of Array.isArray(line) ? line : line?.querySelectorAll('.pz-cl') || []) {
    const on = +c.dataset.cl < n;
    c.classList.toggle('on', on);
    if (on) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true');
  }
}
// The still column (D5), for a wedge slide with column: true: one vessel drawn along its path (portal vein, the portal tract's narrowing,
// the sinusoids as fine channels, central vein, hepatic vein, the balloon on its catheter, free blood beyond it). The balloon stops the
// hepatic vein, and the column behind it (in the wedge colour) fills back through the central vein and the sinusoids to the first moving
// blood. Here it stops at the resistance in the portal tract (schistosomiasis), so the wedge never sees it.
function wedgeColumn() {
  const W = 360, L = 5, R = W - 5, xPV1 = 72, xN = 84, xS0 = 96, xS1 = 207, xC1 = 265, bx0 = 286, bx1 = 333, id = `pzwc${++uid}`;
  // The lumen's half-height along the path, smoothed between its stations; the portal vein's end is round.
  const pts = [[L, 9.7], [xPV1 - 4, 9.7], [xN, 2.5], [xN + 6, 2.5], [xS0 + 6, 1.8], [xS1 - 6, 1.8], [xS1 + 6, 6.2], [xC1 - 6, 6.2], [xC1 + 10, 11.4], [R - 1, 11.4]];
  const half = (x) => {
    let hw = pts.at(-1)[1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, h0] = pts[i - 1], [x1, h1] = pts[i], t = Math.max(0, (x - x0) / (x1 - x0)); hw = h0 + (h1 - h0) * t * t * (3 - 2 * t); break; }
    return x < L + 9.7 ? Math.min(hw, Math.sqrt(Math.max(0, 9.7 ** 2 - (L + 9.7 - x) ** 2))) : hw;
  };
  const up = [], dn = [];
  for (let x = L; x <= R - 1 + 0.01; x += 1.5) { up.push(`${x.toFixed(1)} ${(-half(x)).toFixed(1)}`); dn.push(`${x.toFixed(1)} ${half(x).toFixed(1)}`); }
  const sil = `M${up.join(' L')} L${dn.reverse().join(' L')} Z`;
  // The sinusoids: three lanes (drawn from the central vein back, so the column fills along them) and two links between them.
  const xs0 = xS0 + 6, xs1 = xS1 - 6, mid = (xs0 + xs1) / 2, ys = [-8.8, 0, 8.8], fw = bx0 + 8 - xN - 1, idF = `${id}f`;
  const lane = (dy) => `M${xs1} 0 C${xs1 - 16} ${dy * 0.15} ${xs1 - 22} ${dy} ${xs1 - 46} ${dy} H${xs0 + 46} C${xs0 + 22} ${dy} ${xs0 + 16} ${dy * 0.15} ${xs0} 0`;
  const links = `M${mid - 14} ${ys[0]} V${ys[1]} M${mid + 14} ${ys[1]} V${ys[2]}`;
  const lanes = (cls, look) => ys.map((dy) => sv('path', { class: cls, 'data-look': look, d: lane(dy), pathLength: 1 }));
  const fill = sv('rect', { class: 'c-fill', 'data-look': 'card.col.fill', x: xN + 1, y: -16, width: fw, height: 32, style: `transform: translate(${fw}px, 0px)` });
  const art = sv('g', { class: 'c-art', 'data-look': 'card.g' },
    sv('clipPath', { id, 'data-look': 'card.g' }, sv('path', { 'data-look': 'card.g', d: sil })),
    sv('g', { 'clip-path': `url(#${id})`, 'data-look': 'card.g' }, sv('rect', { class: 'c-pv', 'data-look': 'card.col.pv', x: L - 1, y: -16, width: xN - L + 2, height: 32 }), sv('rect', { class: 'c-flow', 'data-look': 'card.col.flow', x: xN + 1, y: -16, width: R - xN, height: 32 })),
    ...lanes('c-lane', 'card.col.lane'), sv('path', { class: 'c-lane c-link-b', 'data-look': 'card.col.link.b', d: links }),
    // (The column fills from the balloon back: its colour slides in from the right inside its own span, eased by the picture from its
    // transition, where a scaleX on SVG was repainted by the page every frame.)
    sv('clipPath', { id: idF, 'data-look': 'card.g' }, sv('rect', { 'data-look': 'card.g', x: xN + 1, y: -16, width: fw, height: 32 })),
    sv('g', { 'clip-path': `url(#${id})`, 'data-look': 'card.g' }, sv('g', { 'clip-path': `url(#${idF})`, 'data-look': 'card.g' }, fill)),
    ...lanes('c-lane-f', 'card.col.lane.f'), sv('path', { class: 'c-lane-f c-link', 'data-look': 'card.col.link.f', d: links }),
    sv('path', { class: 'c-edge', 'data-look': 'card.col.edge', d: sil }),
    sv('path', { class: 'c-blk', 'data-look': 'card.col.blk', d: `M${xN - 5} -11.4 Q${xN} -3.5 ${xN - 5} -1.3 M${xN + 6} -11.4 Q${xN + 1} -3.5 ${xN + 6} -1.3 M${xN - 5} 11.4 Q${xN} 3.5 ${xN - 5} 1.3 M${xN + 6} 11.4 Q${xN + 1} 3.5 ${xN + 6} 1.3` }),
    sv('rect', { class: 'c-bal', 'data-look': 'card.col.bal', x: bx0, y: -14, width: bx1 - bx0, height: 28, rx: 9.7 }),
    sv('path', { class: 'c-cath', 'data-look': 'card.col.cath', d: `M${bx0 + 7} 0 H${W - 1}` }), sv('circle', { class: 'c-tip', 'data-look': 'card.col.tip', cx: bx0 + 7, cy: 0, r: 2.3 }));
  const lead = sv('path', { class: 'c-lead', 'data-look': 'card.col.lead' }), brk = sv('path', { class: 'c-brk', 'data-look': 'card.col.brk' });
  const top = ['Still column:', 'reads the sinusoids'].map((t) => sv('text', { class: 'c-top', 'data-look': 'card.col.top', 'text-anchor': 'middle' }, t));
  const red = ['Resistance in', 'the portal tract'].map((t) => sv('text', { class: 'c-blkt', 'data-look': 'card.col.blkt' }, t));
  const names = [['Portal vein', 'start'], ['Sinusoids', 'middle'], ['Central vein', 'middle'], ['Balloon', 'end']].map(([t, a]) => sv('text', { 'data-look': 'card.col.text', 'text-anchor': a }, t));
  const model = sv('svg', { 'data-look': 'card.root', viewBox: `0 0 ${W} 100`, 'aria-label': 'The still column fills from the balloon back through the central vein and the sinusoids, and stops at the resistance in the portal tract.' },
    art, lead, brk, ...red, ...top, ...names);
  const svg = glBox('pz-col', model, { role: 'img', 'aria-label': model.getAttribute('aria-label'), style: `aspect-ratio: ${W} / 100` }, 'col');
  // The words follow the lettering (the slide's caption size as drawn): two lines over the picture, the names in one row under it.
  // (Widths are measured: the column only lays out while it shows.) The lettering never steps off its role: when the four names do not
  // stand in one row clear of each other they take two rows, and when the two headings do not stand side by side the column's heading
  // goes under the red one (clear of the red leader line); the card's own fit takes the extra height.
  const bL = xN + 10, bR = bx0 + 7;
  fitChart(svg, ({ cap: c0 }, box) => {
    // (A card that zooms its contents down, --pz-fit, takes the lettering down with it, never under 12 px on the screen nor under half its role.)
    const role = c0 * box.width / W, z = parseFloat(svg.closest('.pz-text')?.style.getPropertyValue('--pz-fit')) || 1;
    // (A run's width from Inter's own outlines, as the picture draws it (600, letter spacing .02 em), never asked of the page.)
    const wOf = (e) => (glyphsReady() ? textWidth(e.textContent, { weight: 600, size: c, ls: 0.02 * c }) : est(e.textContent, c)), c = c0 * Math.min(1, Math.max(z, Math.max(12, role * 0.55) / role));
    const place = () => {
      [...red, ...top, ...names].forEach((e) => fsOf(e, c));
      const rW = Math.max(...red.map(wOf)), tW = Math.max(...top.map(wOf)), nW = names.map(wOf), tx = (bL + bR) / 2 + 14;
      const xs = [[L, L + nW[0]], [(xs0 + xs1) / 2 - 8 - nW[1] / 2, (xs0 + xs1) / 2 - 8 + nW[1] / 2], [(xS1 + xC1) / 2 - nW[2] / 2, (xS1 + xC1) / 2 + nW[2] / 2], [W - 5 - nW[3], W - 5]];
      const apart = xs.every((b, i) => !i || b[0] - xs[i - 1][1] >= 6), band = L + rW + 8 <= tx - tW / 2 && tx + tW / 2 <= W - 2;
      return { rW, tW, nW, tx, xs, apart, band };
    };
    const p = place(), lh = 1.2 * c, stack = !p.band, rows2 = !p.apart;
    // (Stacked, the heading stays right of the red leader line at the narrowing and inside the picture.)
    const sx = Math.min(Math.max((bL + bR) / 2, xN + 8 + p.tW / 2), W - 2 - p.tW / 2);
    const y1 = 0.8 * c + 2, yRed2 = y1 + lh, bandEnd = (stack ? yRed2 + 2 * lh : yRed2) + 0.3 * c;
    const brY = bandEnd + 0.4 * c, cy = brY + 8 + 14, base = cy + 14 + 4 + 0.8 * c;
    red.forEach((e, i) => { setA(e, 'x', L); setA(e, 'y', (y1 + i * lh).toFixed(1)); });
    top.forEach((e, i) => { setA(e, 'x', (stack ? sx : p.tx).toFixed(1)); setA(e, 'y', ((stack ? yRed2 + lh : y1) + i * lh).toFixed(1)); });
    names.forEach((e, i) => { setA(e, 'x', i === 0 ? L : i === 3 ? W - 5 : ((p.xs[i][0] + p.xs[i][1]) / 2).toFixed(1)); setA(e, 'y', (base + (rows2 && i % 2 ? lh : 0)).toFixed(1)); });
    setA(art, 'transform', `translate(0 ${cy.toFixed(1)})`);
    setA(lead, 'd', `M${xN + 0.5} ${(yRed2 + 4).toFixed(1)} V${(cy - 14).toFixed(1)}`);
    setA(brk, 'd', `M${bL} ${(brY + 5).toFixed(1)} V${brY.toFixed(1)} H${bR} V${(brY + 5).toFixed(1)}`);
    const vh = (base + (rows2 ? lh : 0) + 0.3 * c + 2).toFixed(1);
    setA(model, 'viewBox', `0 0 ${W} ${vh}`);
    if (svg.style.aspectRatio !== `${W} / ${vh}`) svg.style.aspectRatio = `${W} / ${vh}`;
  }, () => restPass(() => { svg.classList.add('in'); model.classList.add('in'); fill.style.transform = 'translate(0px, 0px)'; svg._svgGL.wake(2600); }));
  if (!glyphsReady()) loadGlyphs().then(() => restPass(() => fitted.forEach((c) => c.svg === svg && (c.fs = null, fitNow(c)))));
  return svg;
}
const tileVal = (k, v) => (v == null ? '—' : fmt(v * (tileOf(k)?.x ?? 1), tileOf(k)?.d ?? 1));
// The live model's numbers in the fingerprint's terms (a time-lapse plays on the live figure): the same function the worker builds a slide's
// state with. It has no starling() here, so the lymph's overflow, take-back and net stay null and the fluid card follows the live frames.
const liveFp = (fr) => fingerprintOf(fr.metrics, { P: fr.Pf || fr.P, Q: fr.Qf || fr.Q, D: fr.D, params: store.get().params });

// A value counts from where it was to where it goes (eased, about a second); reduced motion jumps.
// (Tiles' numbers and bar marks follow the page's shown state: see tileGlide.)
// (A touch's history of points, [x or time, time or distance] pairs the drags read the last 100 ms of: kept pairs are written in place. A pair that
// falls out of a window, or past PT_MAX points, is the next point's, so a drag allocates only for its first points.)
const PT_FREE = [], PT_MAX = 48;
// alloc-rare: the pool is empty only while a gesture's first points arrive (at most the points in its window)
const ptNew = (a, b) => { const p = PT_FREE.pop() || [0, 0]; p[0] = a; p[1] = b; return p; };
const ptPush = (pts, a, b) => { if (pts.length >= PT_MAX) PT_FREE.push(pts.shift()); pts.push(ptNew(a, b)); };
// R19: a live model frame never writes the tiles while their card moves (a slide's slide or fold): the newest is kept and written
// once the card is still. A slide's own paint (its arrival, a new set of tiles) is never held.
// R19: a tile's changing number is drawn on the GPU (gl-words.js: Inter's outlines over the tile's own words, which are made clear and
// take the number back once it holds still), not written into the page on each model frame. A slide's count follows the page's shown state
// (tileGlide), its number and bar mark painted from one follower in each display frame.
// (A record's fields set to another's, in place: the keys it lacks are let go, so it ends equal to `src`, as a fresh copy would, with none made.)
function copyKeys(dst, src) {
  for (const k in dst) if (!(k in src)) delete dst[k];
  for (const k in src) dst[k] = src[k];
  return dst;
}
function tweener(draw) {
  let cur = null, raf = 0;
  const run = (to, ms = COUNT_MS) => {
    cancelFrame(raf);
    if (!cur || reduce.matches || ms === 0) { cur = copyKeys(cur || {}, to); draw(cur); return; }
    const from = { ...cur }, t0 = performance.now();
    const step = (now) => {
      const u = ease(clamp((now - t0) / ms, 0, 1));
      for (const k in to) cur[k] = from[k] == null || to[k] == null ? to[k] : from[k] + (to[k] - from[k]) * u;
      draw(cur);
      if (u < 1) raf = nextFrame(step);
    };
    raf = nextFrame(step);
  };
  run.again = () => { if (cur) draw(cur); };   // (the same frame again, after the geometry moved)
  run.has = () => !!cur;
  run.stop = () => { cancelFrame(raf); raf = 0; };   // (a glide under way ends where it is; nothing is drawn after)
  run.jump = (to) => { cancelFrame(raf); cur = copyKeys(cur || {}, to); draw(cur); };   // (straight to the end, its glide left to the compositor: tileGlide)
  return run;
}

// The deck's own diagrams (the still column, the SAAG map, the two walls, the rail's block) are models drawn on the GPU (svg-gl.js), never
// SVG the page paints (2 Nov 2026, "Move everything to GPU"): sv makes the same tree, of plain elements, hidden; glBox holds it and its picture.
const sv = svgModel;
/** A diagram's box: a block of the diagram's class (its look and size in the stylesheet) holding the model and the GPU picture of it. Its
 *  look is read once it is on the page and laid out (fitChart), and again whenever its lettering is laid out anew. */
function glBox(cls, root, attrs = {}, host = '') {   // (host: the chart's name in the looks table, chart-looks/card.js)
  const box = h('div', { class: cls, ...attrs });
  const gl = createSvgGL(box, { host });
  if (!attrs['aria-label']) { gl.cv.setAttribute('aria-hidden', 'true'); gl.cv.removeAttribute('role'); }
  box.append(root);
  box._model = root;
  return box;
}
let uid = 0;

// A drawn chart lays out in its own units, scaled to its card, so its lettering is set from the slide's type scale as
// drawn: lay(fs) gets each role (--s-cap … --s-big, the text size setting included) in the chart's units and places the
// text and the rows around it. It runs again when the chart is resized or the text size changes, until the scale settles.
const ROLE_NAMES = ['cap', 'lab', 'body', 'val', 'big'];
const fitted = new Set();
// (A chart whose fit throws is counted and left: reFit runs these for every chart before any new card comes in, and one error there left
// the cards unseen with the figure dimmed. 3 Nov 2026.)
const fitNow = (c) => { try { fitLoop(c); if (c.gl && c.fs) { const cx = chartCtx(c.svg); if (c.placed) { c.gl.setCtx(cx); c.gl.relook(); } else { Object.assign(c.gl.local, cx);  c.placed = true; c.gl.place(c.root); c.onPlace?.(); } } } catch (e) { caught('presenter:fit', e); } };
const fitLoop = (c) => {
  const { svg, lay } = c;
  if (!svg.isConnected) { fitted.delete(c); c.ro?.disconnect(); return; }
  for (let n = 0; n < 8; n++) {
    // (Units per css px, before a full card's zoom: the chart's lettering zooms with the rest of its card. A model's box: its viewBox
    // mapped into the box as the picture maps it.)
    const box = readBox(svg), m = c.root ? null : readCTM(svg);
    const k = c.root ? 1 / (viewMap(c.root.getAttribute('viewBox'), c.root.getAttribute('preserveAspectRatio'), box.width, box.height)[0] || Infinity) : m && m.a ? 1 / m.a : 0;
    if (!k || !box.width) return;
    // (A chart in a data card reads the card's own chart sizes, --ch-<role>, where it sets them: a ladder's words at the tiles' small size.)
    const pr = document.createElement('span'), host = svg.closest('.pz-data, .pz-cell') || svg.closest('.pz') || document.body;
    pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    host.append(pr);
    const fs = {};
    // (The screen's matrix carries the card's zoom: a data card whose words zoom down past its fit's last step, --pz-z, has its
    // chart's words drawn that much smaller too.)
    let wz = parseFloat(host.style?.getPropertyValue('--pz-z')) || 1;
    // (A phone's site ladders zoom with their card, --pz-fit, as its words do: read through the matrix alone, the fit's own zoom made
    // their lettering larger in the chart's units, the strips taller, and the card stayed zoomed to half for good.)
    const cellGrid = svg.closest(':is(.pz.stack, .pz.low) .pz-cell')?.parentElement;
    if (cellGrid) wz *= parseFloat(readStyle(cellGrid).zoom) || 1;
    for (const r of ROLE_NAMES) { pr.style.fontSize = `var(--ch-${r}, var(--s-${r}))`; fs[r] = parseFloat(readStyle(pr).fontSize) * k * wz; }
    pr.remove();
    if (c.fs && ROLE_NAMES.every((r) => Math.abs(c.fs[r] - fs[r]) < 0.01 * fs[r]) && Math.abs(c.w - box.width) + Math.abs(c.h - box.height) < 1) return;
    c.fs = fs; c.w = box.width; c.h = box.height; lay(fs, box);
  }
};
// An attribute or a text written only when it changes (a tween's frame rewrote every one of them, same or not).
const setA = (e, k, v) => { v = String(v); if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
const setT = (e, t) => { t = String(t); if (e.textContent !== t) e.textContent = t; };
const est = (t, px, w = 0.6) => String(t).length * px * w;   // (a run's width: Inter averages about 0.6 em a character, 0.66 bold capitals)
function fitChart(svg, lay, onPlace = null) {
  // (A diagram's box (glBox): measured as the box, its model laid out, and its picture's look read once the lettering stands.)
  const c = svg._model ? { svg, lay, fs: null, root: svg._model, gl: svg._svgGL, onPlace } : { svg, lay, fs: null };
  fitted.add(c);
  // (After the observer, not inside it: the new layout changes the chart's own height. A rest pass between frames, rest-pass.js.)
  if (typeof ResizeObserver !== 'undefined') { c.ro = new ResizeObserver(() => { cancelRest(c.raf); c.raf = restPass(() => fitNow(c)); }); c.ro.observe(svg); }
  return c;
}
if (typeof addEventListener !== 'undefined') addEventListener('pps:labelscale', () => restPass(() => fitted.forEach(fitNow)));
/** Lets go of every GPU chart inside a card that is about to be replaced (the column, rail block, quadrant, walls art): its svg-gl picture is
 *  disposed (the module keeps each one live until then), and its fit entry and observer are dropped. Never run on a kept card. */
function dropCharts(el) {
  if (!el) return;
  for (const c of [...fitted]) if (el.contains(c.svg)) { c.ro?.disconnect(); cancelRest(c.raf); fitted.delete(c); }
  for (const b of el.querySelectorAll('.svg-gl-box')) b._svgGL?.dispose();
  if (el._svgGL) el._svgGL.dispose();
}
const fsOf = (el, px) => { el.style.fontSize = px.toFixed(2) + 'px'; el.setAttribute('font-size', px.toFixed(2)); };   // (a model piece's looks come from the table, which takes its size from the attribute)

// The block is a hatched fill: bold diagonal red stripes over a faint red tint (visible in light and dark, no label).
// Shared by the ladders and the level rail, so the block looks the same everywhere.
const hatch = (id, s) => sv('pattern', { id, width: s, height: s, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
  sv('rect', { class: 'pz-hb', 'data-look': 'card.hatch.bg', width: s, height: s }), sv('rect', { class: 'pz-hs', 'data-look': 'card.hatch.stripe', width: s / 2, height: s }));
/** The block on the level rail: the phone ladder's block (rounded, red outline, red hatching) wrapped round the blocked level's whole bar. */
function railBlock() {
  const id = 'pzRailB' + ++uid;
  // (A model drawn on the GPU in px of its box: its viewBox and its block's size are the box's own, set as the box is laid out.)
  const pat = hatch(id, 7), drop = sv('rect', { class: 'pzs-drop', 'data-look': 'card.drop', width: '100%', height: '100%', rx: 6, fill: `url(#${id})` });
  const model = sv('svg', { viewBox: '0 0 100 20', preserveAspectRatio: 'none' }, sv('defs', {}, pat), drop);
  const box = glBox('pz-rail-blk', model, { 'aria-hidden': 'true' });
  fitChart(box, () => {
    const w = readMetric(box, 'offsetWidth'), ht = readMetric(box, 'offsetHeight');
    if (!(w > 0 && ht > 0)) return;
    setA(model, 'viewBox', `0 0 ${w} ${ht}`); setA(drop, 'width', w); setA(drop, 'height', ht);
  });
  return box;
}
/** Big number tiles, each rated; set() counts to the new values. Given ref (an earlier state's numbers), each
 *  tile also says how far it moved from there, green when it went the better way (and plain within normal). */
function bigTiles() {
  const el = h('div', { class: 'pz-tiles' });
  const head = h('span', { class: 'pz-hr', 'data-n': '0' });   // (the same readings, numbers only, for an instrument card's header row)
  let sig = '', parts = [], draw = null, goal = false, tileArgs = null, tileAsk = 0, picT = null, tileRO = null, dead = false, stopShown = null;
  // (The newest paintTiles call's seven arguments, kept in one array written in place: a what-if drag calls it every frame. The paint, a task
  // between frames, reads them; one pass is asked for however many calls land before it.)
  const paintAsk = () => { tileAsk = 0; const a = tileArgs; if (a) paintTilesNow(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); };
  // (R19: a tile's number as shown, and set: through its GPU words while the model ticks, into the page at once (now) while a slide's
  // roll is set up or the fit measures.)
  // (Its value, bar mark and start ring follow the page's shown state, tile-shown.js: painted from what is shown, in the frames while one is on the way.)
  const ts = createTileShown(pageShown);
  const vText = (p) => (p.vw ? p.vw.text : p.v.textContent);
  const vSet = (p, t) => { if (!p.vw) setT(p.v, t); else p.vw.set(t); };
  // After TIPS the PPG is read against its target (below 12 mmHg), so a tile never says "High" under a line that
  // says the target is reached.
  const rated = (k, f) => (goal && k === 'ppg' && f.ppg != null ? tipsGoal(f.ppg) : rateOf(k, f));
  // (A tile's word judges the number it prints: 4.98 L shows "5.0 L", so it reads Grade 3.)
  const ratedShown = (k, f) => (f[k] != null ? rated(k, { ...f, [k]: tileShown(k, f[k]) }) : rated(k, f));
  // Where a value sits on its tile's bar, 0 to 100 (shown units, held inside the bar).
  const at = (k, v) => { const [a, b] = SCALE[k], x = TILE[k]?.x ?? 1; return Math.min(100, Math.max(0, ((v * x - a) / (b - a)) * 100)); };
  // A number and its unit always fit inside their tile: where the tile is too narrow for them at the layout's size, both
  // shrink together (the unit never below 12 px; the number then takes the rest of the cut). Measured with the wider of the
  // number shown and the one it counts to, so the count never runs past the edge; again when the row changes size.
  function fit() {
    for (const p of parts) {
      if (p.pic) continue;   // (the endoscopic view's tile: a picture, its number and unit never placed, so nothing to fit; reading them threw)
      const vu = p.v.parentNode;
      p.v.style.fontSize = p.u.style.fontSize = p.v.style.lineHeight = '';
      const cs = readStyle(p.tile), room = readMetric(p.tile, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      if (!(room > 0)) continue;
      const cur = vText(p), wide = (p.fin || '').length > cur.length ? p.fin : cur;
      // (Written only when the number it counts to is longer: the same text measured as it stands keeps a roll's digit columns.)
      if (wide !== cur) { if (p.vw) p.vw.now(wide); else p.v.textContent = wide; }
      const vw = readBox(p.v).width, uw = p.u.hidden ? 0 : readBox(p.u).width;
      const gap = p.u.hidden ? 0 : parseFloat(readStyle(vu).columnGap) || 0;
      if (wide !== cur) { if (p.vw) p.vw.now(cur); else p.v.textContent = cur; }
      const need = vw + gap + uw;
      if (need <= room) continue;
      const vs = readStyle(p.v), vf = parseFloat(vs.fontSize), uf = parseFloat(readStyle(p.u).fontSize);
      let k = (room - 1) / need, ku = k;
      if (uf * ku < 12) { ku = Math.min(1, 12 / uf); k = Math.max(0, (room - 1 - uw * ku) / (vw + gap)); }
      p.v.style.lineHeight = vs.lineHeight;   // (the line keeps its height, so the tile and its card never change size)
      p.v.style.fontSize = `${Math.max(12, Math.floor(vf * k * 10) / 10)}px`;
      if (ku < 1) p.u.style.fontSize = `${Math.floor(uf * ku * 10) / 10}px`;
    }
  }
  let fitRaf = 0, fitShape = '';
  const fitSoon = () => { if (dead) return; cancelRest(fitRaf); fitRaf = restPass(fit); };   // (measured between frames, never in one: rest-pass.js)
  if (typeof ResizeObserver !== 'undefined') (tileRO = new ResizeObserver(fitSoon)).observe(el);
  document.fonts?.ready?.then(fitSoon);
  function buildTiles(ks, withRef) {
    if (dead) return;
    picT?.stop(); picT = null;
    for (const p of parts || []) { p.vw?.dispose(); p.hw?.dispose(); p.pic?.dispose(); ts.drop(p.k); }   // (recs §8: the tiles they wrote are replaced; their GPU words, scope picture and followers go with them)
    parts = ks.map((k) => {
      const T = tileOf(k) || { t: k, s: '', u: '' };
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, T.u), r = h('span', { class: 'pzt-r' });
      const d = h('span', { class: 'pzt-d' });
      // The scale bar: the tile's bands (coloured by its rating), its cut-offs, a ring where it started (given ref) and a dot
      // where it is. A tile with no scale keeps an empty bar, and every tile keeps its change line (empty on a slide that counts
      // no change), so every tile of every slide is the same height (2 Nov 2026, Mohammad: "the tiles are variable in height").)
      const bands = bandsOf(k) || [], S = SCALE[k];
      const zs = bands.map((z) => h('i', { class: 'pzb-z', style: `left:${at(k, z.a / (T.x ?? 1))}%;width:${at(k, z.b / (T.x ?? 1)) - at(k, z.a / (T.x ?? 1))}%` }));
      const ts = S ? S[2].map((c) => h('i', { class: 'pzb-t', style: `left:${at(k, c / (T.x ?? 1))}%` })) : [];
      const ls = S ? S[2].map((c) => h('span', { class: 'pzb-l', style: `left:${at(k, c / (T.x ?? 1))}%` }, fmt(c, cutDp(c)))) : [];
      const link = withRef ? h('i', { class: 'pzb-link' }) : null, was = withRef ? h('i', { class: 'pzb-was' }) : null, now = h('i', { class: 'pzb-now' });
      const bar = h('span', { class: 'pzt-bar' + (S ? '' : ' empty'), 'aria-hidden': 'true' }, h('span', { class: 'pzb-track' }, h('span', { class: 'pzb-zs' }, zs), ts, link, was, S ? now : null), ls);
      const pic = k === 'scope' ? createScopeTile() : null;   // (the endoscopic view: a picture in place of a number; v, u and r stay unplaced)
      const tile = pic ? h('div', { class: 'pz-tile pz-scope' }, h('span', { class: 'pzt-k' }, T.t), pic.el)
        : h('div', { class: 'pz-tile' + (S ? ' scaled' : '') }, h('span', { class: 'pzt-k', 'data-s': T.n || null }, T.t), h('span', { class: 'pzt-vu' + (T.u === '%' ? ' pct' : '') }, v, u), r, d, bar);
      // (R19: its number's GPU words, laid over the number and its unit's row: their canvas sits in that row, never inside the number,
      // which a roll's digit columns and the fit rewrite.)
      const vw = !pic ? glWords(v, { host: v.parentNode }) : null;
      // (Its reading in the instrument card's header row, numbers only: the short name, the number and its unit, no dot (style A, 7 Nov 2026). The number is
      // its own GPU words, in the rating's ink with the label look's outline (halo); the rating is the item's data-rate, written with the tile's.)
      const hv = h('b', {}), hu = h('small', {}), hi = pic ? null : h('span', { class: 'pz-hi', 'data-rate': 'plain' }, h('span', { class: 'pz-hk' }, T.n || T.t), hv, hu);
      const hw = hi ? glWords(hv, { halo: true, keep: true }) : null;   // (kept: the GPU number stays up, no hand-over to the page's text, as the Doppler numbers)
      return { k, T, tile, v, vw, u, r, d, S, bands, zs, link, was, now, zr: '', pic, hi, hv, hu, hw, sm: tileSmall(T, S), none: false, hasRef: false, sv: NaN, sr: NaN };
    });
    el.replaceChildren(...parts.map((p) => p.tile));
    head.replaceChildren(...parts.filter((p) => p.hi).map((p) => p.hi));
    head.dataset.n = String(head.childElementCount);
    el.classList.remove('pzb-nonum');   // (new bars keep their numbers' row until the card's fit has seen them: fitCards)
    el.dataset.n = String(parts.length);
    // (The numbers, ratings and marks are written at a value's end, never counted frame by frame (2 Nov 2026, "Move everything to GPU": a
    // count wrote each tile's text on every frame); only the endoscopic view, a GPU picture, follows its value through the ease.)
    picT = parts.some((p) => p.pic) ? tweener((f) => parts.forEach((p) => { if (p.pic) p.pic.set(f.varix); })) : null;
    let cur = null;
    draw = { has: () => !!cur, jump: (to) => { cur = { ...to }; write(cur); }, glide: (to) => { cur = { ...to }; write(cur, true); }, go: (to, ms) => { draw.jump(to); picT?.(to, ms); } };
    // (A tile's number and bar mark from the value shown now, v (the model's units): painted by a write at once, and by paintShown in each display
    // frame while the follower is on the way. Always .set on a header reading, never .now: a kept GPU number is redrawn by set alone.)
    const putNum = (p, v) => {
      const hs = p.none ? '—' : tileVal(p.k, v);
      vSet(p, hs);
      if (p.hi) { if (!p.hw) setT(p.hv, hs); else p.hw.set(hs); }
    };
    const putBar = (p, v, v0) => {
      if (!p.S) return;
      const on = p.on, w = on ? at(p.k, v) : 0;
      // (The marks stay whole inside the track: a value past either end of the scale, as platelets of 380 on a bar
      // that stops at 300, rests against that end instead of running half off it. Sweep, 16 Oct.)
      if (p.now._w !== w) { p.now._w = w; p.now.style.translate = `clamp(6px, ${w}%, calc(100% - 6px)) 0`; }   // (written only when it moves; a transform: the mark is the track's width, app.css)
      if (p.was) {
        const ok = p.hasRef, w0 = ok ? at(p.k, v0) : 0;
        if (p.was._w !== w0) { p.was._w = w0; p.was.style.translate = `clamp(4.5px, ${w0}%, calc(100% - 4.5px)) 0`; }
        if (p.link._w !== w || p.link._w0 !== w0) { p.link._w = w; p.link._w0 = w0; p.link.style.translate = `${Math.min(w, w0)}% 0`; p.link.style.scale = `${(Math.abs(w - w0) / 100).toFixed(4)} 1`; }
      }
    };
    // (Each display frame while a tile's follower is on the way: the number and the marks from what is shown, the same filter as the dock's bars.)
    const paintShown = () => {
      for (const p of parts) {
        if (p.pic || !p.on) continue;
        const v = ts.get(p.k, p.sv), v0 = p.hasRef ? ts.get(p.k, p.sr, true) : p.sr;
        if (v === p.sv && v0 === p.sr) continue;
        p.sv = v; p.sr = v0;
        putNum(p, v); putBar(p, v, v0);
      }
    };
    stopShown?.();
    stopShown = ts.onFrame(paintShown);
    // go: the values follow the page's shown state (a slide's change, a kept card's patient); otherwise they are shown at once.
    const write = (f, go = false) => parts.forEach((p) => {
      if (p.pic) return;
      const [cls, word] = ratedShown(p.k, f), none = cls == null && (p.k === 'saag' || p.k === 'tp');
      const on = !none && f[p.k] != null, r0 = p.k === 'hvpgFall' ? null : f['ref_' + p.k], ok = on && r0 != null;
      p.none = none; p.on = on; p.hasRef = ok;
      p.sv = on ? ts.set(p.k, f[p.k], p.sm, go) : f[p.k];
      p.sr = ok ? ts.set(p.k, r0, p.sm, go, true) : r0;
      if (!on) ts.drop(p.k);
      putNum(p, p.sv);
      p.u.hidden = none || !p.T.u;
      setT(p.r, word);
      setA(p.tile, 'data-rate', cls || (none ? 'none' : 'plain'));
      if (p.hi) {
        // (putNum sets the header's number: always .set, never .now, even while the tiles glide in. A kept GPU number is redrawn by set alone; now writes only
        // the page's text, which stays clear under the picture, so a header reading written that way kept showing the number it had before, the slide's start
        // on a time-lapse's end: 7 Nov 2026, "the slide says 15.1 but the readout says 23.7". Nothing measures the header's words, so nothing needs now.)
        p.hu.hidden = none || !p.T.u;
        if (p.hu.textContent !== p.T.u) p.hu.textContent = p.T.u;
        setA(p.hi, 'data-rate', cls || (none ? 'none' : 'plain'));
      }
      // (The response tile's line names the HVPG the fall is counted from.)
      if (p.k === 'hvpgFall') {
        const t = f.respFrom == null ? '' : `from ${fmt(f.respFrom, 1)} mmHg`;
        if (p.d.textContent !== t) p.d.textContent = t;
      }
      if (p.S) {
        p.now.hidden = !on;
        if (p.was) p.was.hidden = p.link.hidden = !ok;
        putBar(p, p.sv, p.sr);
      }
      if (r0 == null || f[p.k] == null) return;
      // (The start as shown: the ring on the bar marks it, the words give its number.)
      const x = p.T.x ?? 1, dg = p.T.d ?? 1, rd = (v) => +(v * x).toFixed(dg), same = Math.abs(rd(f[p.k]) - rd(r0)) < 0.5 * 10 ** -dg;
      const t = same ? 'No change' : `from ${fmt(r0 * x, dg)}${p.T.u === '%' ? '%' : ''}`;
      if (p.d.textContent !== t) p.d.textContent = t;
    });
  }
  // (Since 1 Nov 2026 (Mohammad: "Move everything to GPU"; a 120 Hz frame budget) a change of slide no longer redraws the tiles with the
  // model's own work on each frame of a count: the rating's word and colour take their new value as it starts, and the number, the bar's
  // mark and the start ring follow the page's shown state (tile-shown.js, 8 Nov 2026, recs 15), the filter the dock's bars and the vessels
  // use: the number is drawn by the GPU's words (gl-words.js) and the marks are a translate, both from the same follower in each display
  // frame, so the number, the bar and the figure arrive together. A kept card's polls bend the speed instead of restarting a curve. A
  // number whose shape changes (9.9 to 10.1) simply takes its new text. Not with the endoscopic view (it draws each step), or Reduce Motion.)
  function tileGlide(to, ms = 950) {   // (ms 0: shown at once; any other time is the follower's, not the caller's)
    if (!odoOn() || !draw?.has() || reduce.matches || ms === 0 || parts.some((p) => p.pic)) return false;
    draw.glide(to);
    return true;
  }
  // A band's colour is the rating of its middle (after TIPS the PPG's bands follow its target, as its word does).
  function paintBands(f) {
    for (const p of parts) {
      if (!p.S) continue;
      const rs = p.bands.map((z) => rated(p.k, { ...f, respAt: null, asc: Math.max(f.asc ?? 0, NO_ASC), [p.k]: z.m })[0] || 'info'), sig = rs.join();   // (hvpgFall's bands read the fall alone)
      if (sig === p.zr) continue;
      p.zr = sig;
      p.zs.forEach((e, i) => { e.dataset.rate = rs[i]; });
    }
  }
  // (R19: the card the tiles sit in is moving: its slide or its fold, read from its class and data, never from layout.)
  let held = null, heldObs = null;
  const movingCard = () => el.closest('.pz-sliding, [data-folding]');
  function release() {
    if (movingCard()) return;
    heldObs?.disconnect(); heldObs = null;
    const a = held; held = null;
    if (a) api.paintTiles(...a);
  }
  const api = {
    el,
    head,
    // (Painted between frames, never in one: a slide's new tiles are built and their words written in a rest pass, the latest call's
    // values winning, so a frame writes nothing into the tiles (2 Nov 2026, "Move everything to GPU").)
    /** Lets go of everything the tiles own: their GPU words, the scope picture, its glide, the fit and the held frame. Idempotent. */
    dispose() {
      if (dead) return;
      dead = true;
      cancelRest(tileAsk); tileAsk = 0; cancelRest(fitRaf); fitRaf = 0; tileArgs = null; held = null;
      tileRO?.disconnect(); tileRO = null; heldObs?.disconnect(); heldObs = null;
      picT?.stop(); picT = null;
      stopShown?.(); stopShown = null;
      for (const p of parts) { p.vw?.dispose(); p.hw?.dispose(); p.pic?.dispose(); ts.drop(p.k); }
      parts = []; draw = null;
    },
    paintTiles(f, ks, key, ref, ms, tips, live) {
      if (dead) return;
      // alloc-rare: made once, with the first call
      const a = tileArgs || (tileArgs = [0, 0, 0, 0, 0, 0, 0]);
      a[0] = f; a[1] = ks; a[2] = key; a[3] = ref; a[4] = ms; a[5] = tips; a[6] = live;
      if (!tileAsk) tileAsk = restPass(paintAsk);
    },
  };
  function paintTilesNow(f, ks, key = [], ref = null, ms, tips = false, live = false) {
    {
      // (A live frame while the card moves: kept, the newest only, and painted when the card is still, on the card's own change.)
      if (live && draw && ks.join() + (ref ? '|ref' : '') === sig) {
        const mc = movingCard();
        if (mc) {
          held = [f, ks, key, ref, ms, tips, false];
          if (!heldObs && typeof MutationObserver === 'function') { heldObs = new MutationObserver(release); heldObs.observe(mc, { attributes: true, attributeFilter: ['class', 'data-folding'] }); }
          return;
        }
      }
      held = null;
      goal = !!tips;
      const sg = ks.join() + (ref ? '|ref' : '');
      if (sg !== sig || !draw) { sig = sg; buildTiles(ks, !!ref); }   // (no tiles at all is a build too)
      el.dataset.keys = ks.join();
      parts.forEach((p) => { p.tile.classList.toggle('key', key.includes(p.k)); p.hi?.classList.toggle('key', key.includes(p.k)); });
      paintBands(f);
      const to = Object.fromEntries([...ks, 'asc'].map((k) => [k, f[k]]));
      if (ks.includes('scope')) to.varix = f.varix;   // (the endoscopic view follows the varix's size)
      if (ref) for (const k of ks) to['ref_' + k] = ref[k];
      if (ks.includes('hvpgFall')) Object.assign(to, { respFrom: f.respFrom, respAt: f.respAt });
      for (const p of parts) p.fin = tileVal(p.k, to[p.k]);
      if (!tileGlide(to, ms)) draw.go(to, ms);
      // (Fitted again only when a number's shape changed, its final text or the length of the one shown: measuring the tiles forced a
      // layout on every model frame, with the same answer. A tile's own size change still refits through the observer below.)
      const shape = parts.map((p) => `${p.fin}|${vText(p).length}`).join();
      if (shape !== fitShape) { fitShape = shape; fitSoon(); }
    }
  }
  return api;
}

// The six levels along the route, portal vein to heart: [id, name]. The three middle levels are inside the liver.
const SITES = [
  ['pre', 'Pre-hepatic'],
  ['presin', 'Presinusoidal'],
  ['sin', 'Sinusoidal'],
  ['postsin', 'Postsinusoidal'],
  ['post', 'Post-hepatic'],
  ['cardiac', 'Cardiac'],
];
/** The six levels, portal vein to heart, the liver's three bracketed; mode: 'all' shows each level named,
 *  a level id marks that one as the block, anything else shows the levels unmarked. Each name stays on one
 *  line under its bar (it shrinks to fit the card, and tilts 45° when the card is too narrow). */
function rail(mode) {
  const at = SITES.findIndex(([id]) => id === mode);
  return h('div', { class: 'pz-rail' + (mode === 'all' ? ' all' : at >= 0 ? ' one' : ''), role: 'img', 'aria-label': at >= 0 ? `Resistance: ${SITES[at][1]}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac' },
    h('div', { class: 'pz-rail-liver' }, h('i'), h('span', {}, 'Liver'), h('i')),
    h('ol', {}, SITES.map(([id, name], i) => h('li', { 'data-site': id, class: i === at ? 'on' : null },
      h('i', {}, i === at ? railBlock() : null), h('span', { class: 'n' }, name)))));
}

const { scaleVisual, quadrantVisual, wallsVisual, makeCalc, xKey } = createVisuals({ sv, glBox, est, fitChart, fsOf });

export function createPresenter({ openSettings, loadPreset, host, stage, poke = () => {}, projectorOn, projectorOff, closeHome, stashCards, rerenderHome }) {
  const app = document.getElementById('app'), view = document.getElementById('stageView'), wrap = document.getElementById('stageWrap');
  let calc = null;
  const getCalc = () => (calc ||= makeCalc());
  const cache = new Map();   // deck id → computed states, reused the next time it is presented
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
      kicker: st.kicker || s.title, title: st.title || 'Step', line: st.line || '', causes: st.causes, site: st.site, notes: st.notes || st.tell || '', ask: st.ask, tool: { kind: 'profile' }, key: st.key || [],
    })) };
  }

  // ── Slide states ──
  // stateOf[i]: the slide whose model state slide i shows (itself, or the last one before it that changed the model).
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
  // (before: a slide that plays its procedure also gets the state it opens on, the procedure not done yet: see the landing.)
  const modelStep = (s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' ? trailKeys(s.tool) : graphTrail(s), before: s.procedure ? specOf(procKindOf(s.procedure))?.before : undefined } : {});
  // (With the extra work a deck visuals package asks for at the slide's state, kept with it as st.extra: slide-ext.js stepExtra.)
  const stepOf = (s) => { const x = stepExtra(s); return x ? { ...modelStep(s), ...x } : modelStep(s); };
  let prepRev = 0;   // (bumped each time a presentation's states are set: the slide preparation's manifests belong to one of these)
  function prepare() {
    prepRev++;
    const key = deck.mine ? null : deck.id;
    stateOf = []; let last = 0;
    slides.forEach((s, i) => { if (changes(s) || i === 0) last = i; stateOf[i] = last; });
    // Patients a visual compares that no slide shows ({ preset, params?, days? } rows): computed after the slides, each fresh.
    // (And the patients a compare slide's buttons switch to: { label, preset }.)
    const extraRows = slides.flatMap((s) => [...(s.of || []).filter((o) => typeof o === 'object' && o.preset && !o.id), ...(s.compare || []).filter((o) => o.preset)]);
    const extra = [...new Map(extraRows.map((o) => [xKey(o), o])).values()];
    extraOf = new Map(extra.map((o, k) => [xKey(o), slides.length + k]));
    const hit = key && cache.get(key);
    if (hit) { states = hit.states; waiters = []; return; }
    const mine = []; states = mine; waiters = [];
    const c = getCalc(), steps = [...slides.map(stepOf), ...extra.map((o) => ({ preset: o.preset, params: o.params, days: o.days, relax: o.relax }))];
    const presetAt = []; let pid = store.get().presetId;
    slides.forEach((s, i) => { if (s.preset) pid = s.preset; presetAt[i] = pid; });
    extra.forEach((o, k) => { presetAt[slides.length + k] = o.preset; });
    const deckNow = deck;
    // The preparation failed (a rejected snapshot, a sequence that threw, or slides that could not be computed): this talk's
    // waiters are settled with nothing (never left parked), and the show ends with a word rather than holding its cover up.
    const prepFailed = () => {
      if (c.broken) { c.kill(); if (calc === c) calc = null; }
      if (states !== mine || deck !== deckNow) return;
      for (const w of waiters) w.res(null);
      waiters = [];
      stop();
      toast('This presentation could not be prepared. Reload the page to present it.', 'bad');
    };
    (async () => {
      try {
      const first = slides[0]?.preset ? null : (await host.request('snapshot')).snap;
      if (!base) c.request('presetMetrics', { ids: ['healthy'] }).then((m) => { base = m.result?.healthy || null; });
      const end = await c.sequence(steps, first, (m) => {
        const st = { snap: m.snap, params: m.params, fp: m.fp, trail: m.trail, presetId: presetAt[m.i] };
        if (m.start) st.start = { ...m.start, presetId: presetAt[m.i] };
        if (m.before) st.before = { ...m.before, presetId: presetAt[m.i] };
        if (m.extra) st.extra = m.extra;
        mine[m.i] = st;
        if (states !== mine) return;   // a newer presentation has started
        for (const w of waiters.filter((x) => x.i === m.i)) w.res(st);
        waiters = waiters.filter((x) => x.i !== m.i);
      });
      if (end?.type !== 'error') {
        if (key) cache.set(key, { states: mine });
        // (A data-card chart that runs its own points (a curve over model days) starts now, behind the talk, so it is ready by
        // its slide: slide-ext.js tools' warm.)
        // (recs-production-120hz §16: only the working set, the slide shown and its neighbours, not every slide of a long deck at once;
        // the rest are warmed by the slide preparation as the talk reaches them, its manifests owning them.)
        if (states === mine) slides.forEach((s, i) => { if (Math.abs(i - want) > 2) return; safe(() => warmOf(s, ctxOf(s, i)), null, 'warm')?.catch?.(() => {}); });   // (a rejection here is read by slide-prep's own warm, B16)
        return;
      }
      // The slides could not be computed (most often a page left open across an update): the next try starts a fresh
      // engine, and the show ends with a word rather than holding its cover up for ever.
      prepFailed();
      } catch (err) { console.error(err); prepFailed(); }
    })();
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
    host.send({ type: 'restore', snap: st.snap });
    replaceParams(structuredClone(st.params));
    store.set({ presetId: st.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1 });
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
  }
  // A change of patient on screen eases (the model blends from where it is to the slide's state: lesions grow, sliders,
  // pressures and flows travel, the days run on); a newer slide mid-way eases on from wherever the model has got to.
  // Resolves once the slide's exact state is in, or early (the model left part way) when cut() says a newer slide was asked for.
  const MORPH_MS = 2000;   // motion-scale: own pace (the patient's change under a slide)
  // A slide change is one move (premium-feel R1). Over the plate the cards come in during the
  // camera's last three quarters (CARDS_AT: once a quarter of it has run), so it lands on a finished slide, and a change of patient eases under the glide itself, over
  // MORPH_ONE_MS (the glide's camMs, 480 to 900 ms, and a tail), not 2 s after it lands. A large change keeps easing under the cards:
  // the widths and colours follow it (display-state.js). Kept serial, as before: the lobule's way in and out, a catheter, a case card
  // over a loading patient, a slide with an instrument (it records the slide's own state), and a figure that cannot move smoothly
  // while its organs change (stage.canDrift: no live GPU organs, so a glide over the changing organs would paint them all each frame;
  // there the change still waits for the landing, over MORPH_ONE_MS).
  // (Quick slide, Mohammad 2 Nov 2026, "Do it" to review/slide-motion-recs-2nov: the screen sat with no card for 0.4 to 0.8 s while the
  // glide ran. The cards now come in once a quarter of the glide has run (CARDS_AT 0.75 of it left), the smooth-frames gate gives up after
  // QUICK_SMOOTH ms, not 700, and the new card starts its way in at once, not 120 ms late.)
  const QUICK_SMOOTH = 240;
  const CARDS_AT = 0.75, MORPH_ONE_MS = 1200;   // motion-scale: own pace (the patient's change under a glide)
  // A chart or gauge that only reads the model as it eases (the pressure profile, a relation curve, the flows, the talk's trace, the criteria,
  // the plane) comes in over the change, riding it: its numbers and curve travel with the vessels, as a kept card's do. An instrument that
  // records the patient's flow (Doppler, beat by beat, vitals), plays on arrival, or is a deck package's own, still waits for the slide's state.
  const RIDES_MODEL = new Set(['profile', 'curve', 'flows', 'plane', 'criteria', 'path', 'trace']);
  const underTool = (t) => !t || (RIDES_MODEL.has(t.kind) && !(t.kind === 'trace' && t.range === 'beats'));
  // The same patient over the plate: the slide's labels, glows and marks start once the cards are in sight (their last small step still
  // running, at the arrival curve about 95 percent of the way), not after the title's last frame, which was most of half a second of
  // an empty figure between the cards landing and the slide's own marks arriving.
  const CARDS_SEEN = D_SMALL - 40;
  const CATH_SETTLE_MS = 4000;   // motion-scale: not a move (a longest wait); (at most: a model still drifting never holds the catheter longer)
  // (.app.pz-morph while a change of patient eases: the checks hold the data card to it.)
  async function morphTo(st, cut, ms = MORPH_MS, mark = true) {
    host.send({ type: 'morph', snap: st.snap, ms });
    store.set({ presetId: st.presetId, presetLoading: false });
    if (mark) app.classList.add('pz-morph');
    try {
      await until(cut, ms + 80);
      if (cut()) return false;
      applyState(st);
      await drawn(st);
      return !cut();
    } finally { if (mark) app.classList.remove('pz-morph'); }
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
  const fadeMs = () => (reduce.matches ? 0 : D_SURFACE);
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
  async function toAnatomy(next, cut = () => false) {
    if (cut()) return;
    const st = store.get();
    if (!st.lobule && !st.sinusoid) return;
    // Out of the sinusoid, then back to the lobule's normal framing, and only then out of the lobule: three steps, never one zoom through them.
    if (st.sinusoid) { store.set({ sinusoid: false }); await waitCut(60, cut); await until(() => cut() || (!stage.sinBusy() && !stage.sinusoidOpen()), 4000); if (cut()) return; }
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
    if (next && !reduce.matches && !booting) stage.riseTo(next.box, next.kMax, next.clear);   // (box: a function, asked for when the rise begins)
    store.set({ lobule: false });
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
      if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await viewSettled(cut, stage); if (cut()) return; }   // (the change landed, not 700 ms: it takes VIEW_CHANGE_S)
      // The station this slide frames: the dive lands on it in one move, and (mid-dive) no other station's labels show.
      const part = cam === 'sinusoid' ? 'sinusoid' : cam.split(':')[1] || 'fit', zoom = s.zoom ?? 2.3;
      if (!store.get().lobule) {
        // Anatomy straight down to the slide's station (aim: the dive lands on it in one move, its labels laid out only there, never
        // a stop at the whole lobule first); the sinusoid is gone to from the lobule's normal framing.
        if (cam !== 'sinusoid') stage.lobuleAim(part, { zoom });
        store.set({ lobule: true });
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
      if (sin) { if (!store.get().sinusoid) { store.set({ sinusoid: true }); if (ms) await waitCut(1250 + 400, () => cut() || !stage.sinBusy()); } return; }
      if (store.get().sinusoid) { store.set({ sinusoid: false }); if (ms) await waitCut(1000 + 400, () => cut() || !stage.sinBusy()); if (cut()) return; }
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
    await toAnatomy(v === 'anatomic' ? riseFor(cam, s) : null, cut);
    if (cut()) return;
    // (A switch of view sets off here and the slide's framing is asked of it at once, below: it becomes the change's new end (stage-view.js viewXfRetargetTo),
    // so the camera travels once, on the change's clock, instead of a second glide starting 700 ms into a change that takes 1.3 s.)
    const switching = store.get().view !== v;
    if (switching) store.set({ view: v });
    // (Reduced motion keeps the glide, short: a jump of the whole figure is harder to follow than a quick move. Under the start's
    // cover it is set outright, so the reveal never catches it on its way.)
    const gl = booting ? 0 : ms || 300;
    const held = insets.held;
    insetsGo(true);   // (the room the new cards leave, written as the glide sets off: it frames for it, and the labels wait for its landing)
    frameTo(cam, s, gl);
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
  // (left: only the entrances with more than this many ms still to run count: 0 is all of them; CARDS_SEEN, the cards in sight.)
  // (R01: the cards' way in is card-throw.js's, scheduler-driven inline transform and opacity that getAnimations() never lists: throwState says
  // what the throw of the words, their glass, the panel and the data card has still to run, and the browser's own animations still count.)
  const throwCards = () => [ui?.text, ui?.shade, ui?.panel, ui?.data];
  const throwEnters = (el, left) => { const s = el && !el.hidden ? throwState(el) : null; return !!s && s.kind !== 'out' && s.left > left; };
  const cardsEntering = (left = 0) => throwCards().some((el) => throwEnters(el, left)) || [ui?.text, ui?.panel, ui?.data].some((el) => el && !el.hidden && readAnims(el, { subtree: true }).some((a) => { if (a.playState !== 'running') return false; const t = readTiming(a.effect); return Number.isFinite(t?.endTime) && t.endTime - (t.localTime || 0) > left; }));
  // Where the way out of the lobule should land for a slide: its framing, asked for when the rise begins (null: the fit).
  const riseFor = (cam, s) => (cam === 'fit' ? null : { box: () => camBox(cam, s), kMax: s.kMax || 3.2, clear: !!s.clear });
  // What the figure shows for the slide on screen (fig: { i, s }): the slide itself, framed where its time-lapse ends (lapse.cam) once
  // its days are run or when they are not played (back, a jump back, the first slide). Refits read it, so they keep that framing.
  // push: the slow push under way to lapse.cam, { i, until }.
  let fig = null, push = null;
  const figOf = (i) => (fig && fig.i === i ? fig.s : slides[i]);
  const lapseCam = (s) => (!s?.visual && !s?.cath && s?.lapse?.cam) || null;
  const figView = (s, lap) => (lapseCam(s) && !lap ? { ...s, cam: s.lapse.cam } : s);
  // The push: the camera drifts from the slide's framing to lapse.cam over `ms`, slow and even, the labels riding with it (stage.js
  // drifting). Where it cannot run smoothly (no live GPU organs: each frame of a move over the live drawing paints every organ), with
  // reduced motion, or in the circuit or the liver, the camera stays put and one eased move takes it there as the days end (pushEnd).
  function pushTo(s, to, ms) {
    const pc = lapseCam(s);
    if (!pc) return;
    fig = { i: to, s: { ...s, cam: pc } };
    if (reduce.matches || !stage.canDrift?.() || (s.view || 'anatomic') !== 'anatomic' || store.get().lobule || store.get().sinusoid) return;
    push = { i: to, until: performance.now() + ms };
    frameTo(pc, fig.s, ms, { drift: true });
  }
  // The days have ended (or Next ran them out): what is left of the push takes `ms`; with no push it is one eased move there. Measured
  // afresh, so an organ that grew through the days (the spleen) is framed as it ends.
  function pushEnd(s, to, ms) {
    if (!lapseCam(s) || fig?.i !== to) return;
    const v = fig.s, pc = v.cam, drift = !!push && push.i === to;
    push = drift ? { i: to, until: performance.now() + ms } : null;
    if ((s.view || 'anatomic') !== 'anatomic' || store.get().lobule || store.get().sinusoid) return;
    frameTo(pc, v, drift ? ms : Math.max(ms, reduce.matches ? 300 : 900), drift ? { drift: true } : {});
  }
  // A slide's framing: its region of the plate (or, by name, the box its names fill), grown to take in all of what the slide points
  // at (its outlined organs as drawn now, an enlarged spleen whole), with a little room for the outline's glow, and room for its marks,
  // labels, lit vessels, probe and readings, so none of them stands outside the frame (cam-room.js).
  // The one move to a framing on the plate: the whole figure, or a slide's box (opt.drift: a slow push, see pushTo).
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  function frameTo(cam, s, ms, opt = {}) {
    // (A Circuit slide's cam is a Circuit region, a raw box in circuit units or 'fit'; a name the circuit lacks is the fit.)
    const circ = s.view === 'circuit', cb = circ && cam !== 'fit' ? regionBox(cam, CIRC_REGIONS) : null;
    if (cam === 'fit' || (circ && !cb)) { if (opt.drift) stage.fitDrift(ms); else stage.fitSlow(ms, opt); } else stage.frameBox(circ ? cb : camBox(cam, s), ms, s.kMax || 3.2, !!s.clear, opt);
  }
  function camBox(cam, s) {
    let r = regionBox(isCamOn(cam) ? cam.near : cam, REGIONS);
    if (isCamOn(cam)) {
      // (cam: { on: [names] }: the vessels and organs as drawn now, the stations where they stand; a lone station or a thin vessel still gets room.)
      // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
      const n = camOn(cam.on), pts = unionBox(n.points.map(([x, y]) => [x, y, x, y]));
      // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
      r = growBox(r, unionBox([stage.focusBox(n), pts].filter(Boolean)), 30);
    }
    // (A slide with softly lit supporting veins frames every vessel it lights, so none runs off the edge.)
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    const tg = slideTargets(s), f = stage.focusBox({ organs: tg.organs.map((o) => o.id), edges: tg.glow.some((g) => g.soft) ? tg.glow.map((g) => g.id) : [] });
    return roomFor(growBox(r || REGIONS.route, f), anchorsOf(s, tg));
  }

  // ── The HVPG catheter (stage.setCatheter, as Measure › HVPG draws it), choreographed slide by slide: in along
  // the jugular route with the camera following, the tip close up, the balloon up and the still column, the
  // readings; each step eases on from wherever the last one left it, and it slides out with its slides.
  const CC = { free: 'var(--mon-free)', wedge: 'var(--mon-wedge)', bad: 'var(--mon-alarm)' };   // the procedure's own colours
  const cath = { on: false, raf: 0, t0: 0, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null, keep: false, beside: false };
  // The still column is shaded in the catheter's wedge colour (the WHVP callout's), so it reads as the catheter's
  // column of still blood, not as one more pressure on the map.
  // (Read through the token cache, which a theme change clears: read afresh, it made every catheter frame restyle the page.)
  const wedgeInk = () => cssVar('--tr-wedge');
  function cathTrack(k, to, ms, delay = 0) { cath.tr[k] = { from: cath.v[k], to, t0: performance.now() + delay, ms: reduce.matches ? 0 : ms }; }
  // (The readings kept between frames: a catheter frame builds nothing. They are made again only when the slide's numbers change
  // (cath.fp is a new fingerprint); the wedge reading's words are written into its kept object as the column rises, and the list handed
  // to the stage is one array written in place. The stage reads them in the frame and keeps none of these lists.)
  // (The catheter's state handed to the stage each frame is one kept object, written in place.)
  const cathSt = { u: 0, balloon: 0, column: 0, columnColor: '', ring: null, pulse: 0, clock: 0, opacity: 1, labels: null, ostium: false, probe: 0, follow: false, keep: false };
  const NO_LABELS = [], cathMemo = { fp: null, fh: NaN, wh: NaN, hv: NaN, L: null, wedge: null, wv: NaN, out: [] };
  function cathLabels() {
    const f = cath.fp, v = cath.v, m = cathMemo;
    if (!f) return NO_LABELS;
    if (m.fp !== f || m.fh !== f.fhvp || m.wh !== f.whvp || m.hv !== f.hvpg) {
      m.fp = f; m.fh = f.fhvp; m.wh = f.whvp; m.hv = f.hvpg; m.wv = NaN;
      const sev = hvpgSev(f.hvpg);
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const free = { key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(f.fhvp, 1), unit: 'mmHg', cls: 'free' };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const wedge = { key: 'w', at: 'ahead', kicker: 'WHVP', text: '', unit: 'mmHg', cls: 'wedge' };
      m.wedge = wedge;
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const sum = { key: 's', at: 'sum', rows: [{ ...wedge, text: fmt(f.whvp, 1) }, free], calc: { kicker: 'HVPG', text: fmt(f.hvpg, 1), unit: 'mmHg', cls: 'result ' + sev } };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const occ = { key: 'p', at: 'tip', kicker: 'Hepatic vein', text: 'Occluded', unit: '', cls: 'wedge' };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const abort = { key: 'a', at: 'tip', kicker: 'Unable to cannulate', text: 'No reading', unit: '', cls: 'result danger' };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      m.L = { f: free, w: wedge, sum, occ, abort };
    }
    // (The wedge reading's words follow the column; formatted only when the number moved.)
    const wv = f.fhvp + (f.whvp - f.fhvp) * v.column;
    if (wv !== m.wv) { m.wv = wv; m.wedge.text = fmt(wv, 1); }
    const out = m.out, L = m.L;
    out.length = 0;
    for (const k of cath.show) out.push(L[k]);
    return out;
  }
  function cathFrame() {
    const now = performance.now(), v = cath.v;
    for (const k in cath.tr) {
      const t = cath.tr[k];
      const u = t.ms ? clamp((now - t.t0) / t.ms, 0, 1) : now >= t.t0 ? 1 : 0;
      v[k] = t.from + (t.to - t.from) * ease(u);
      if (u >= 1) delete cath.tr[k];
    }
    // Three short pushes against the clot (Budd–Chiari), each easing in and back out.
    const pk = cath.probeT0 ? clamp((now - cath.probeT0) / 3600, 0, 1) : 1, probe = pk < 1 ? Math.sin(pk * 3 * Math.PI) ** 2 * 0.9 : 0;
    const st = cathSt;
    st.u = v.u; st.balloon = v.balloon; st.column = v.column; st.columnColor = wedgeInk(); st.ring = cath.ring;
    st.pulse = 0.5 + 0.5 * Math.sin((now - cath.t0) / 170); st.clock = now - cath.t0; st.opacity = v.opacity; st.labels = cathLabels(); st.ostium = cath.ostium; st.probe = probe;
    st.keep = cath.keep;
    st.follow = cath.follow;
    stage.setCatheter(st);   // (the view drifts after the tip as the stage lays out this frame: catheter, camera, readings)
    mon?.balloon(v.balloon);   // the monitor's trace rides the same balloon value
    ui?.tools.balloon(v.balloon);   // (and the data card's tracing, on a slide whose tool follows the catheter)
    cath.raf = nextFrame(cathFrame);
  }
  function cathStop() {
    cancelFrame(cath.raf);
    if (cath.on) { stage.setCatheter(null); stage.cathForget(); }
    Object.assign(cath, { on: false, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null, keep: false, beside: false });
  }
  // ── A slide's procedure (proc-anim.js): TIPS, BRTO or BATO played on the live figure, guided by Next (his ask, 29 Oct): on the
  // slide, the first Next puts the catheter in, each Next after it plays the next step, and the Next after the last moves on;
  // Back runs the last step backwards, and from the first puts the slide as it was. The teaching card shows the steps as a row
  // of numbered pills, the one on show lit: progress only, never buttons. Each step holds still in its shot with its callout,
  // the slide's own mark style, on the vessel it works on. It may also start as the slide lands going forward (auto:
  // true). As it passes its change the live model takes it, as a treatment button does (liveSet), and gives it back going back.
  // A slide whose own patient has already had it (the BRTO slides show the shunt closed) plays it from just before: the live
  // model takes it back first (the shunt opens again while the catheter travels), then the procedure puts it back; going back to
  // before the first step puts the slide as it was. Leaving the slide stops it where it is; the next slide's camera takes over.
  let procRun = null, procWait = false, procShown = -1, procDoneAt = -1, procThenAt = -1, procQueued = false, procRunKind = '', procParked = null;
  // (procParked: the run standing at its last stop since Back landed on the slide done, proc-anim.js park: it only shows the scope where the play-through left it and fades it when the slide moves on;
  // it is not a run to step through, so Back from it leaves the slide as it did before, and a swipe back turns the slide.)
  const procHeld = () => !!procRun && procRun !== procParked;
  // (A slide whose procedure is { kind: 'tips', then: 'tipsgrad' } plays a reading after it, as one more step on the same card: the TIPS catheter reads the
  // gradient across the new stent (proc-anim.js MEASURES.tipsgrad, TIPS step 5). procThenAt: the slide whose main run has played through with its reading
  // still to come; procQueued: a Next came while the main run was on its last step, so the reading starts as it ends.)
  const procThen = (s) => { const k = typeof s?.procedure === 'object' ? s.procedure.then : null; return k && specOf(k) ? k : null; };
  const procKind = (s) => procKindOf(s.procedure);   // ('brto' with a target plays that target's spec: proc-anim.js)
  // (home: the slide stays, so the camera glides back and its own marks and names come back through onMark; leaving it, the next
  // slide's camera and marks take over.)
  function procStop(home = false) {
    procQueued = false;
    if (!procRun) return;
    const r = procRun;
    if (home) r.stop({ home }); else { procRun = null; r.stop({ home }); stage.cathForget(); }
    procRun = null; procShown = -1; procPaint();
  }
  // (The step on show is the pressed one; after it has played through, the last stays pressed until the slide changes.)
  function procPaint() {
    ui?.text.querySelectorAll('.pz-proc').forEach((b, k) => { b.classList.toggle('on', k === procShown); b.classList.toggle('done', k < procShown); if (k === procShown) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  // (The slide's treatment buttons press the one that now matches the live model.)
  function procCompare(s) {
    const has = (o, p) => Object.entries(o).every(([k, v]) => (v && typeof v === 'object' ? has(v, p?.[k] || {}) : !!p?.[k] === !!v && (typeof v === 'boolean' || p?.[k] === v)));
    const k = s.compare?.findIndex((o) => o.params && has(o.params, store.get().params)) ?? -1;
    if (k >= 0) ui?.text.querySelectorAll('.pz-abb:not(.pz-proc)').forEach((btn, j) => btn.setAttribute('aria-pressed', String(j === k)));
  }
  // The slide's own callouts and names, as it landed (a clot mark's words as the model now has them).
  const slideMarks = (i) => (markBase?.i === i ? markFocus(clotMarks(markBase.marks, store.get().params)) : null);
  async function procPlay(s, i, to = 0, kind = procKind(s), from = 0, park = false) {
    const isThen = kind !== procKind(s), base = isThen ? specOf(procKind(s)).steps.length : 0, mine = () => !!deck && shown?.i === i && slides[i] === s;
    const drop = () => { if (from) stage.setCatheter(null); };   // (a reading handed the catheter on: if it cannot start, the catheter goes with it)
    if (!specOf(kind) || !mine() || cath.on || procWait) { drop(); return; }
    if (procRun) { procRun.to(to); return; }
    if (lapseOn) stopLapse();
    procWait = true; procPaint();
    try {
      await toAnatomy(null, () => !mine());
      if (!mine()) { drop(); return; }
      if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await viewSettled(() => !mine(), stage); }
    } finally { procWait = false; }
    if (!mine() || procRun) { if (!mine()) drop(); procPaint(); return; }
    const before = structuredClone(store.get().params), names = store.get().presentLabels || [];
    // (Through liveSet as the change itself is: the slide's own state comes back whenever it is shown again.)
    if (!park && specOf(kind).had(before)) liveSet(s, i, specOf(kind).undo(structuredClone(before)));
    procRunKind = kind;
    const run = procRun = playProcedure(stage, kind, {
      stepped: true, to, from, park,
      // (With a reading to follow, the run holds at its last step, the catheter still in the portal vein, and the reading goes on from there: nothing goes in twice.)
      hold: !isThen && !!procThen(s),
      onHold: () => { if (procRun === run && procQueued && mine()) procChain(); },
      apply: () => {
        if (procRun !== run || !mine() || procBlocked(kind, store.get().params, store.get().frame?.metrics)) return;
        liveSet(s, i, specOf(kind).apply(structuredClone(store.get().params)), evRun(s, i)); procCompare(s);
      },
      unapply: () => { if (procRun === run && mine()) { evBack(s); liveSet(s, i, specOf(kind).undo(structuredClone(store.get().params))); procCompare(s); } },
      onStep: (k) => { if (procRun === run) { procShown = base + k; procPaint(); } },
      // (The step's callout stands in for the slide's marks while it plays; its names join the slide's. Then the slide's come back:
      // on the BRTO slides the last step's "Shunt closed" is the slide's own mark, so it stays where it is.)
      // (false: no callout while the catheter travels in, the names for its way kept.)
      read: () => store.get().frame,
      onMark: (m, add, all) => {
        if (procRun !== run || !mine()) return;
        // (Played through, a slide with no mark of its own keeps the last step's callout, which names what the procedure left: "Stent in".)
        const last = specOf(kind).stops.length - 1;
        store.set(m !== null ? { focus: m ? markFocus(all || [m]) : null, presentLabels: [...new Set([...names, ...(add || [])])] }
          : { focus: slideMarks(i) || (run.at === last ? markFocus(stepMarks(kind, last)) : null), presentLabels: names });
      },
      onEnd: ({ done, rewound }) => {
        if (procRun !== run) return;
        procRun = null;
        // (The reading changes nothing in the model: going back from its start only leaves the stent done, its steps lit to the last.)
        if (rewound && mine() && isThen) { procThenAt = i; procShown = base - 1; }
        else if (rewound && mine()) { evBack(s); liveSet(s, i, before); procCompare(s); procShown = -1; procDoneAt = -1; }
        else if (mine() && done && !isThen && procThen(s)) procThenAt = i;   // (the reading comes next)
        else if (mine()) procDoneAt = i;   // (played through: the next Next moves on)
        procPaint();
        if (procQueued && procThenAt === i && mine()) { procQueued = false; procPlay(s, i, 0, procThen(s)); }
      },
    });
    if (park) procParked = run;
    procPaint();
  }
  // Whether the slide's procedure can play on the live patient (as its card shows it).
  function procCan(s) {
    const kind = procKind(s), P = specOf(kind), p = store.get().params, m = store.get().frame?.metrics;
    return !!P && procOffered(kind, p, m) && (P.had(p) || !procBlocked(kind, p, m));
  }
  // Next and Back on a procedure's slide (true: they did a step; false: the slide moves on). Next starts it (the catheter goes
  // in), then plays each next step; once it has played through, Next moves on. (While the figure turns to the anatomy before
  // the first step, a Next waits with it rather than leaving.)
  const procNext = () => {
    if (shown?.i !== want) return false;
    if (procRun) return procRun.next() || procChain();
    if (procWait) return true;
    const s = slides[want];
    // (The stent is in and its reading is still to come: this Next plays it.)
    if (procThenAt === want && procThen(s) && !cath.on) {
      const k = procThen(s);
      if (procBlocked(k, store.get().params, store.get().frame?.metrics)) { procThenAt = -1; procDoneAt = want; return false; }
      procPlay(s, want, 0, k);
      return true;
    }
    if (!s?.procedure || procDoneAt === want || cath.on || !procCan(s)) return false;
    procPlay(s, want, 0);
    return true;
  };
  // (A Next on the main run's last step: it holds there with the catheter in, and the reading goes on from the place it stands. A Next while it is still on its way to that
  // stop waits for it, not a Next lost to the next slide.)
  const procChain = () => {
    const s = slides[want];
    if (!procRun || !procThen(s) || procRunKind !== procKind(s) || shown?.i !== want) return false;
    const c = procRun.release();
    if (!c) return procQueue();
    procRun = null; procQueued = false;
    procPlay(s, want, 0, procThen(s), stage.cathCarry?.(c.u, c.route, specOf(procThen(s)).route || procThen(s)) ?? c.u);   // (the place on the reading's own route, which is longer or shorter than the one the coils were on)
    return true;
  };
  const procQueue = () => {
    const s = slides[want];
    if (!procRun || !procThen(s) || procRunKind !== procKind(s) || procQueued) return false;
    procQueued = true;
    return true;
  };
  const procBack = () => { procQueued = false; return procHeld() && shown?.i === want && procRun.back(); };
  function procEl(s, i, st) {
    const kind = procKind(s), P = specOf(kind), p = st?.params || store.get().params, m = st ? null : store.get().frame?.metrics;
    // (BRTO and BATO only on a patient with gastric varices, or one who has had it already, so it plays from just before.)
    if (P && !procOffered(kind, p, m)) return null;
    const why = !P ? 'Unknown procedure.' : P.had(p) ? '' : procBlocked(kind, p, m);
    // The steps as a line of words, each after its number in the slides' own step circle ({#n}, as the Circulation slides number
    // theirs), the one on show lit: progress, never buttons (his ask, 29 Oct: Next plays them). The callout on the figure carries the
    // same number. One the patient cannot have shows dimmed with why.
    const steps = [...(P?.steps || [['play', kind, '', kind]]), ...(procThen(s) ? specOf(procThen(s)).steps : [])];   // (its reading, if it has one, is one more step)
    // (A procedure whose steps carry a short line, st0[8] (EUS coils and glue), lists them all at once, one under the other: number, word and its line, the
    // steps played at full ink and the one on show lit. His ask, 10 Nov 2026, "do it except 10": nobody hovers in a lecture, so the sentence is on the card
    // from the start, at its full size. The long caption stays the title. On a phone's stacked card (.pz.stack) it is the one-line row again with the
    // lines hidden, so that card does not grow; TIPS, BRTO and BATO have none and keep the row.)
    const list = steps.length > 0 && steps.every((x) => x[8]);
    return h('p', { class: `pz-procs${list ? ' pz-procs-list' : ''}`, role: 'list', 'aria-label': `${P?.name || kind}, step by step: Next plays each step`, ...(why ? { 'data-why': why, title: why } : {}) },
      ...steps.flatMap((st0, k) => [k ? ' ' : null, h('span', { class: `pz-proc${procRun && k === procShown ? ' on' : ''}${procRun && k < procShown ? ' done' : ''}`, role: 'listitem', 'aria-label': `Step ${k + 1}: ${st0[1]}${list ? `, ${st0[8]}` : ''}`, title: why || st0[2] },
        h('span', { class: 'pz-step', 'aria-hidden': 'true' }, String(k + 1)), nb(` ${st0[1]}`),
        list ? h('span', { class: 'pz-proc-line' }, ` ${st0[8]}`) : null)]).filter(Boolean));
  }
  // Out: the readings go, the balloon goes down and the catheter fades (at once when the figure is fading anyway).
  async function cathOut(fading, cut) {
    if (!cath.on) return;
    cath.beside = false;   // (the tracing no longer sets the balloon: it goes down with the catheter)
    if (!fading) {
      cath.show = []; cath.ring = null; cath.follow = false; cath.probeT0 = 0;
      cathTrack('balloon', 0, 400); cathTrack('column', 0, 400); cathTrack('opacity', 0, 650);
      await waitCut(reduce.matches ? 0 : 700, cut || NEVER);
    } else await figureOut(cut);
    cathStop();
  }
  // ── The catheter beside a tracing card. A slide whose data card is the HVPG catheter's tracing (tool: { kind: 'hvpg' }) with no catheter of its own
  // (no cath: step, so the slide's camera stays where it is) shows the catheter on the figure all the same, in the right hepatic vein, with its balloon
  // up while the tracing says "balloon up" (wedge pressure) and down for the free pressure: the card's own balloon (tool-hvpg.js watch) is the figure's.
  // The figure's labels stay on (keep) and the readings stay on the card, so nothing here touches a label. A slide in the lobule has no hepatic vein in view.
  const beside = (s) => s?.tool?.kind === 'hvpg' && !s.tool.catheter && !s.cath && !s.visual && !LOBULE_CAM.test(s.cam || '') && (s.view || 'anatomic') === 'anatomic';
  function cathBeside(b) {
    if (!cath.beside) {
      if (cath.on) return;   // (a procedure's or a catheter slide's own catheter is on the figure)
      cath.on = true; cath.beside = true; cath.keep = true; cath.t0 = performance.now(); cath.fp = null; cath.show = []; cath.cam = null;
      Object.assign(cath.v, { u: 0, balloon: 0, column: 0, opacity: 0 }); cath.ring = CC.free;
      cathFrame();
      cathTrack('opacity', 1, 400); cathTrack('u', 1, 1800);   // (in from the neck along the route, as it does on the catheter slides, the view where it is)
    }
    const v = cath.v;
    v.balloon = b;
    if (b >= 0.999) { cath.ring = CC.wedge; if (v.column < 1 && !cath.tr.column) cathTrack('column', 1, 1400); }   // (the still column fills once the balloon is up)
    else { cath.ring = CC.free; delete cath.tr.column; v.column = 0; }
  }
  // (What the tools hand a tracing card of a slide that has the catheter beside it: the card's balloon moves the figure's, and a card stood up starts the catheter.)
  const besideHook = { move: (v) => { if (cath.beside) cathBeside(v); }, start: (v) => { if (cath.beside || !cath.on) cathBeside(v); } };
  async function cathTo(mode, fp, cut) {
    await toAnatomy(null, cut);
    if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); await viewSettled(cut, stage); }
    if (cut()) return;
    cath.beside = false; cath.keep = false;   // (a catheter kept from a tracing card's slide is this slide's own now)
    if (!cath.on) { cath.on = true; cath.t0 = performance.now(); cath.ostium = mode === 'blocked'; cathFrame(); }
    cath.fp = fp;
    const v = cath.v, ms = (m) => (reduce.matches ? 0 : m);
    // In along the route from wherever the tip is, the view following it down.
    if (v.u < 0.999) {
      cath.show = []; cath.ring = null;
      if (!stage.cathFocus('route', ms(1200), { near: true })) return;
      cath.cam = 'route';
      await waitCut(ms(1000), cut); if (cut()) return;
      const t = 3800 * (1 - v.u);
      cath.follow = true; cathTrack('u', 1, t);
      await waitCut(ms(t + 100), cut); cath.follow = false; if (cut()) return;
    }
    if (mode === 'route') {
      cath.show = []; cath.ring = null; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500);
      if (cath.cam !== 'route') { stage.cathFocus('route', ms(1300)); cath.cam = 'route'; await waitCut(ms(1300), cut); }
      return;
    }
    // The tip close up (again each slide: the data card may have come or gone).
    stage.cathFocus('tip', ms(cath.cam === 'tip' ? 700 : 1500), { both: true }); 
    await waitCut(ms(cath.cam === 'tip' ? 700 : 1500), cut); cath.cam = 'tip';
    if (cut()) return;
    if (mode === 'blocked') {
      cath.show = ['occ']; cath.ring = null; cath.probeT0 = performance.now();
      await waitCut(ms(3800), cut); if (cut()) return;
      cath.show = ['abort']; cath.ring = CC.bad;
      return;
    }
    if (mode === 'free') { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500); return; }
    // Wedge: the balloon goes up just behind the tip, flow stops, the still column fills toward the sinusoids.
    if (v.balloon < 0.999) { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 1, 1800); await waitCut(ms(1900), cut); if (cut()) return; }
    cath.ring = CC.wedge;
    // The still column fills first and the pressure holds on its plateau; only then does the WHVP callout ease in,
    // and for the result slide the HVPG bracket follows it.
    if (v.column < 0.999) { cath.show = ['f']; cathTrack('column', 1, 1800); await waitCut(ms(1900), cut); if (cut()) return; await waitCut(ms(600), cut); if (cut()) return; }
    if (!cath.show.includes('w')) { cath.show = ['f', 'w']; if (mode === 'result') { await waitCut(ms(1500), cut); if (cut()) return; } }
    if (mode === 'result') { cath.show = ['sum']; cath.ring = null; }
  }

  // ── A time-lapse on the live model: its days run on the disease clock (ramped as the off-screen chain ran them),
  // the counter and the numbers follow, then the slide's computed state takes over (the same, to the decimal).
  let lapseOn = false, lapseLeft = 0, lastAt = -1;   // (lapseLeft: days still to run; 0 once Next has sped it up; lastAt: the slide last shown)
  // A compare slide's buttons switch the live model's params (liveOff: it no longer shows the slide's computed state).
  let liveOff = false, abGen = 0;
  // A what-if slider has been moved on this slide, whatever it moves (the model, or an instrument's option, which leaves liveOff alone):
  // from then on only the data card's readings change, and its cards keep the plan they came in with (readingsOnly, cardsStill).
  // Cleared with the next slide (transitionRun).
  let handOn = false;
  // The slide's marks as it landed (markBase), and those marks for the params now: a mark with clot: true names the clot in its
  // first vessel as the model has it (callout-math clotWords), so the what-if slider changes its words, and with no clot it goes.
  let markBase = null;
  const clotMarks = (marks, params) => marks.flatMap((m) => { if (!m.clot) return [m]; const t = clotWords(params?.thrombus?.[m.edges[0]]); return t ? [{ ...m, label: t }] : []; });
  const markFocus = (marks) => (marks.length ? { ...marks[0], marks } : null);
  // The veins a slide shows stented (its `stented`, edge ids or '@sets'): the figure draws the mesh over them and the cross-section its ring.
  // They land with the slide's marks; leaving a slide takes with it only those the next slide does not stent too, so a stent that stays stays.
  const stentedOf = (s) => (!s.visual && Array.isArray(s.stented) ? [...expandIds(s.stented)].filter((id) => typeof id === 'string') : []);
  const stentedKept = (s) => { const next = stentedOf(s); return (store.get().stented || []).filter((id) => next.includes(id)); };
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge({ ...(a[k] || {}) }, v) : v; return a; };
  function abSlow() { abGen++; }
  // The new treatment takes effect on the live figure at real time (a faster clock would make the Doppler and tracings
  // sweep faster while it settles); the ladder and tiles follow it.
  function abPick(s, i, k) {
    if (!deck || shown?.i !== i || slides[i] !== s) return;
    ui?.text.querySelectorAll('.pz-abb').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    const c = abChoice(s.compare, k);
    if (c.kind === 'lens') { lensPick(c.lens, s); return; }
    if (c.kind === 'gate') { store.set({ dopGate: c.gate }); return; }
    if (c.kind === 'tool') { ui.tools.option(c.tool); return; }
    // (A treatment button pressed while the slide's time-lapse still plays ends the lapse first: two clocks must not drive the model.)
    if (lapseOn) stopLapse();
    // (So does a procedure, which glides home: the button's patient is shown as the slide frames it.)
    procStop(true);
    if (c.kind === 'state') { livePatient(s, i, s.compare[k]); return; }
    liveSet(s, i, c.patch);
  }
  const slideAt = (id) => slides.findIndex((x) => x.id === id);   // (a time-point button's slide, { label, slide })
  async function livePatient(s, i, o) {
    const g = ++abGen, mine = () => g === abGen && shown?.i === i && slides[i] === s && !!deck;
    const st = await stateReady(o.preset ? extraOf.get(xKey(o)) : stateOf[o.slide ? slideAt(o.slide) : i]);
    if (!st || !mine()) return;
    liveOff = true;
    const ref = refOf(s, i);
    let easing = true;
    (async () => {
      while (easing && mine()) {
        await waitCut(150, () => !mine());
        const fr = store.get().frame;
        if (easing && fr?.metrics && mine()) dataTo(s, liveFp(fr), ref, 280);
      }
    })();
    const done = await morphTo(st, () => !mine(), reduce.matches ? 0 : 1200, false);
    easing = false;
    if (done && mine()) { dataTo(s, st.fp, ref, 280); abSlow(); }
  }
  // The slide's colour key on the figure (null: none); another lens fades the old key out, the new one in.
  function paintKey(k, s = null) {
    keyNow = k ? [k, s] : null;
    if (!ui) return;
    ui.text.classList.toggle('pz-keyed', !!k);
    ui.figKey.set(!!k, () => {
      ui.fk.replaceChildren(...(k ? keyNodes(k, s) : []));
      // (The key's words can arrive after the fit below, once the old key has faded: fitted again for its own words, not the old ones.)
      queueMicrotask(() => { if (ui) clearPill(); });
      ui.fk.classList.toggle('grad', !!k && typeof (lensSpec(k, s) || PRESSURE_KEY)[1] === 'function');
      { const [nm, bar, lo, hi] = lensSpec(k, s) || PRESSURE_KEY; ui.fk.setAttribute('aria-label', `Vessels colored by ${nm}${typeof bar === 'function' ? `, ${lo} to ${hi}` : ''}`); }
    });
    clearPill();   // (the words make room for the docked key's row, or give it back)
  }
  // A lens button ({ label, lens }): the figure crossfades to that lens and the key under the line follows; the model is untouched.
  function lensPick(l, s = null) {
    const lens = slideLens({ lens: l });
    if (store.get().colorMode !== lens) store.set({ colorMode: lens });
    paintKey(lens, s);
  }
  const LIVE_EASE = 1200, LIVE_SET = { type: 'setParams', params: null, settle: false, ease: LIVE_EASE }, LIVE_RUN = { type: 'run', running: true, clock: 'hemo', speed: 1 };
  // (The keys a what-if slide watches: the same for the slide until the screen changes shape, so made once for each.)
  const LIVE_KEYS = new WeakMap();
  function liveKeys(s) {
    const ph = phone(), c = LIVE_KEYS.get(s);
    if (c && c.ph === ph) return c.keys;
    // alloc-rare: made once for a slide, again only if the screen changes shape
    const keys = [...new Set([...tileKeys(s), ...(s.key || []), ...(s.tool?.kind === 'profile' ? ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'] : [])])];
    // alloc-rare: made once for a slide, again only if the screen changes shape
    LIVE_KEYS.set(s, { ph, keys });
    return keys;
  }
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
    if (mine()) abSlow();
  }
  // A what-if slider (whatIf: { label, param, min, max, step, ends?, unit? }) drags one parameter of the live model
  // (or several together: param an array of paths, e.g. both lobes' fibrosis); the figure, the ladder and the tiles follow
  // it as with the buttons. It starts at the slide's own value (the first path's), and the slide's computed state comes
  // back whenever the slide is shown again.
  // With tool in place of param ({ label, tool: 'air', min, max, step, unit }) it moves one option of the slide's instrument and
  // leaves the model alone (no worker message, no live clock): it starts at the slide's own tool.air, and the instrument is
  // set to the slide's options again whenever the slide is shown.
  function whatIfEl(s, i, st) {
    const w = s.whatIf, paths = [].concat(w.param).map((p) => (p ? p.split('.') : []));   // (a tool slider has no param)
    const v0 = +(w.tool ? s.tool?.[w.tool] ?? w.min : paths[0].reduce((o, k) => o?.[k], st?.params) ?? w.min);
    const patchOf = (x) => paths.reduce((a, path) => merge(a, path.reduceRight((o, k) => ({ [k]: o }), x)), {});
    const input = h('input', { type: 'range', min: w.min, max: w.max, step: w.step ?? (w.max - w.min) / 20, value: v0, 'aria-label': `What if: ${w.label}` });
    // (A label that already names the unit, "Weeks pregnant", shows the bare number: "24", not "24 weeks".)
    const bare = !!w.unit && w.label.toLowerCase().startsWith(w.unit.toLowerCase());
    const fmtV = (x) => (w.unit ? `${fmt(x, w.step >= 1 ? 0 : 1)}${bare ? '' : ` ${w.unit}`}` : '');
    // The value sits in a box as wide as the widest it can take (live-text.js), so the words' row never reflows as a digit comes or goes.
    const out = liveText('output', 'pzi-v', [w.min, (w.min + w.max) / 2, w.max, v0].map(fmtV));
    // The tiles' scale bar made draggable: a dot for now, and a ring where the slide started, which stays behind as the learner
    // drags, so the distance moved shows (Mohammad's pick B, 17 Oct).
    const frac = (x) => (x - w.min) / (w.max - w.min);
    const track = h('div', { class: 'range-wrap', style: { '--s': String(clamp(frac(v0), 0, 1)) } }, h('span', { class: 'sl-start', 'aria-hidden': 'true' }), input);
    const paint = (x) => { paintRange(input, frac(x)); out.set(fmtV(x)); };
    let raf = 0;
    // (The frame's step and the task after it, made once with the slider: a drag's inputs ask for them and make no closure.)
    const sliderLive = () => liveSet(s, i, patchOf(+input.value));
    const sliderFrame = () => { raf = 0; runSoon(sliderLive); };
    input.addEventListener('input', () => {
      handOn = true;   // (before anything else: the instrument's option below leaves liveOff alone)
      paint(+input.value);
      if (w.tool) { ui?.tools.option({ [w.tool]: +input.value }); return; }   // (an instrument's option: the model is left alone)
      // (Paced to the frames, but the model change and what it wakes run in a task of their own straight after the frame: runSoon.)
      if (!raf) raf = nextFrame(sliderFrame);
    });
    // (A finished drag hands the arrow keys back to the slides.)
    input.addEventListener('pointerup', () => input.blur());
    paint(v0);
    return h('div', { class: 'pz-wi', role: 'group', 'aria-label': `What if: ${w.label}` },
      h('span', { class: 'pzi-l' }, h('span', { class: 'pzi-k' }, 'What if'), w.label),
      h('div', { class: 'pzi-t' }, w.ends ? h('span', { class: 'pzi-e' }, w.ends[0]) : null, track, w.ends ? h('span', { class: 'pzi-e' }, w.ends[1]) : null),
      w.unit ? out.el : null);
  }
  function stopLapse() { if (!lapseOn) return; lapseOn = false; host.send({ type: 'lapse', days: 0 }); shownState = -1; paintChrome(); }
  // A hold-to-strain button (strain: true, or { label }; Mohammad's pick, features item 42, 11 Nov 2026): a button that works only while it is held.
  // Pressed, it starts the engine's Valsalva (the chest and belly pressure builds over 1.5 s to 30 mmHg); let go, it falls back over 1.5 s, and
  // the readings follow the live model all the while, as a what-if slider's do. The press ends with the slide: leaving it, a lost pointer, a blur
  // or a hidden page lets go, so the model is never left straining. The engine lets go by itself after 30 s.
  const STRAIN_ON = { type: 'action', action: { kind: 'strain', on: true } }, STRAIN_OFF = { type: 'action', action: { kind: 'strain', on: false } };
  let strainHeld = false, strainGen = 0;
  function strainHold(s, i, on) {
    if (on === strainHeld || !deck || shown?.i !== i || slides[i] !== s) return;
    strainHeld = on;
    if (!on) { host.send(STRAIN_OFF); return; }
    // (A treatment button's rule: two clocks must not drive the model, so a time-lapse or a procedure in play ends first.)
    if (lapseOn) stopLapse();
    procStop(true);
    liveOff = true; handOn = true;
    host.send(LIVE_RUN); host.send(STRAIN_ON);
    strainFollow(s, i);
  }
  // The data card follows the model while the button is held, and until the readings have rested after it is let go (liveSet's rule).
  async function strainFollow(s, i) {
    const g = ++strainGen, ref = refOf(s, i), keys = liveKeys(s), mine = () => g === strainGen && shown?.i === i && !!deck;
    let sig = null, still = performance.now(), freed = 0;
    for (const t0 = performance.now(); mine();) {
      await waitCut(150, () => !mine());
      const fr = store.get().frame, now = performance.now();
      if (fr?.metrics && mine()) {
        const f = liveFp(fr), k = shownSig(f, keys);
        dataTo(s, f, ref, 280);
        if (k !== sig) { sig = k; still = now; }
      }
      if (strainHeld) { freed = 0; continue; }
      if (!freed) freed = now;
      if (liveSettled(now - freed, now - still)) break;
    }
    if (mine()) abSlow();
  }
  const onHidden = () => { if (document.hidden) strainStop(); };
  function strainStop() { if (strainHeld) { strainHeld = false; host.send(STRAIN_OFF); } }
  function strainEl(s, i) {
    const label = typeof s.strain?.label === 'string' && s.strain.label.trim() ? s.strain.label.trim() : 'Hold to strain';
    const b = h('button', { type: 'button', class: 'pz-abb pz-strain-b', 'aria-pressed': 'false', 'aria-label': `${label}: press and hold, let go to recover`, title: 'Press and hold' }, label);
    let down = false;
    const press = () => { if (down) return; down = true; b.setAttribute('aria-pressed', 'true'); strainHold(s, i, true); };
    const release = () => { if (!down) return; down = false; b.setAttribute('aria-pressed', 'false'); strainHold(s, i, false); };
    b.addEventListener('pointerdown', (e) => { if (e.button) return; try { b.setPointerCapture(e.pointerId); } catch { /* (no capture: the leave and cancel events below let go) */ } press(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) b.addEventListener(ev, release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());   // (a long press on a phone must not open a menu while the button is held)
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
    return h('div', { class: 'pz-ab pz-strain', role: 'group', 'aria-label': 'Strain on the live model' }, b);
  }
  // Next during a time-lapse runs the days that are left in about 600 ms (the clock speeds up, the ramp is unchanged) and stops on its end.
  function skipLapse() {
    if (!lapseOn || lapseLeft < 1) return;
    host.send(bedside(slides[want]) ? { type: 'lapseFast', ms: 600 } : { type: 'run', speed: Math.max(1, lapseLeft / 0.6) });
    lapseLeft = 0; paintChrome();
    if (push?.i === want) pushEnd(slides[want], want, 600);   // (the push runs out with the days, from wherever it has reached)
  }
  // (A bedside time-lapse, lapse.clock 'seconds': the ramp plays on the seconds clock, so an instrument such as the Doppler keeps recording.)
  const bedside = (s) => s?.lapse?.clock === 'seconds';
  const lapseWords = (n) => (n >= 60 && n % 30 === 0 ? `${n / 30} months` : `${n} days`);
  const lapseText = (s, d, n, done) => (s.lapse.to ? (done ? s.lapse.to : `${s.lapse.from} → ${s.lapse.to}`) : done ? `${lapseWords(n)} later` : `Day ${Math.round(d)} of ${n}`);
  // The counter under the words: its box is as wide as the widest it says (the last day, or the words after it), so the bar beside it keeps one width
  // as the days run and the words change (live-text.js).
  const lapseRow = (s) => h('div', { class: 'pz-lapse', role: 'status' }, h('span', { class: 'pzl-bar' }, h('i')),
    liveText('span', 'pzl-t', [lapseText(s, 0, s.days, false), lapseText(s, s.days, s.days, false), lapseText(s, s.days, s.days, true)], lapseText(s, 0, s.days, false)).el);
  // ── The time graph on the teaching card (lapse-graph.js) ──
  // A time-lapse slide with no time chart of its own carries one over its bar: the slide's two tiles drawn day by day by the same flow-time
  // chart the Varices and Treating the cause slides have on their data card, its lines growing as the days run (Mohammad, 7 Nov 2026, option A).
  // One at a time, made with the slide's words and let go with them; its lines come from the state's trail (modelStep asks the worker for them).
  let lg = null, lgK = 1, lgLap = false;   // (lgK: how far along the days it is drawn, so a card built again mid-lapse carries on from there)
  function lgDrop() { if (!lg) return; lg.ft.dispose(); lg = null; }
  function lapseGraph(s) {
    const g = lapseGraphOf(s);
    if (!g) return null;
    const ft = createFlowTime();
    lg = { ft, spec: { clock: g.clock, lines: g.lines } };
    return h('div', { class: 'pz-timegraph', role: 'group', 'aria-label': 'What changes over the time-lapse' }, ft.el);
  }
  // (A time-lapse about to play opens on its start; any other way onto the slide shows where its days ended.)
  function lgStart(st) {
    if (!lg) return;
    lgK = lgLap ? 0 : lapseOn ? lgK : 1;
    lg.ft.set(st?.trail ?? null, lgK, lg.spec);
  }
  function lgSet(k, trail) { lgLap = false; lgK = k; lg?.ft.set(trail, k, lg.spec); }
  // ── The procedure's graph on the teaching card (event-graph.js) ──
  // A slide that plays a TIPS, BRTO, BATO or a Meso-Rex bypass carries a graph of its two tiles over its steps, drawn live from the moment the
  // procedure changes the patient (Mohammad, 7 Nov 2026: the PPG and the sinusoidal flow "changing in real time after the TIPS gets placed").
  // Built with the words, its box there from the start so the card keeps its size; it starts where the slide opened, and the procedure's
  // change (procPlay's apply) hands it to liveSet, which gives it each live reading as it gives the tiles theirs. A run played through is
  // kept for the slide (evKept), so coming back to it played through shows the graph whole.
  let evg = null;
  const evKept = new WeakMap();
  function evDrop() { if (!evg) return; if (!evg.tool) evg.ft.dispose(); evg = null; }   // (a graph in the data card's tool is the tool's: it lives with the card, not the words)
  function eventGraph(s, i, st) {
    const g = eventGraphOf(s);
    if (s.tool?.kind === 'evgraph') return null;   // (its graph is in the data card: evAdopt)
    if (!g || !procOffered(g.kind, st?.params || store.get().params, st ? null : store.get().frame?.metrics)) return null;   // (as its steps: none for a patient who cannot have it)
    const ft = createEventGraph();
    evg = { ft, spec: g, s, i };
    return h('div', { class: 'pz-timegraph pz-evtime', role: 'group', 'aria-label': `What the ${specOf(g.kind)?.name || 'procedure'} changes, second by second` }, ft.el);
  }
  // The same graph as the data card's instrument (tool { kind: 'evgraph' }, Mohammad 8 Nov 2026: the pre-emptive TIPS slide's chart moves up into the
  // instrument card where the indications table was): the card's instrument is the chart, driven here exactly as the one on the words.
  function evAdopt(s, i, st) {
    const g = eventGraphOf(s), ft = ui?.tools.current('evgraph');
    if (!g || !ft || !procOffered(g.kind, st?.params || store.get().params, st ? null : store.get().frame?.metrics)) return;
    evg = { ft, spec: g, s, i, tool: true };
    evStart(st);
  }
  // (Where its lines start: the state the slide opened on, its before state on a slide whose own patient has had it. Where they end, when the
  // slide's own state has it done (its scale then holds both); else the scale holds the start, and a fall from it.)
  function evStart(st) {
    if (!evg) return;
    const { spec, s, i } = evg, own = stateOf[i] === i ? states[i] : null, had = !!own?.before;
    const b = (had ? own.before.fp : st?.fp) || null;
    if (!b) return;
    const end = had ? own.fp : null, lines = spec.lines;
    const kept = procDoneAt === evg.i ? evKept.get(s) || null : null;
    evg.ft.set(spec, [b[lines[0]], b[lines[1]]], end ? [end[lines[0]], end[lines[1]]] : null, kept);
  }
  // What liveSet is handed at the change: it lets the model run its own course (no settling) and gives each reading to the graph, until the
  // graph's seconds have run; the tiles stop on the same reading the graph ends on.
  function evRun(s, i) {
    if (!evg || evg.s !== s || evg.i !== i) return null;
    const g = evg;
    g.ft.start();
    return {
      secs: g.ft.secs,
      sample(t, f) { if (evg !== g) return true; g.ft.push(t, f[g.spec.lines[0]], f[g.spec.lines[1]]); return t >= g.ft.secs; },
      end() { if (evg === g) { const k = g.ft.kept(); if (k) evKept.set(g.s, k); } },
    };
  }
  function evBack(s) { if (evg?.s === s) { evg.ft.reset(); evKept.delete(s); } }
  function paintLapse(s, d, n, done = false) {
    const el = ui?.text.querySelector('.pz-lapse');
    if (!el) return;
    el.style.setProperty('--k', (n ? d / n : 0).toFixed(3));
    const t = el.querySelector('.pzl-t > .pzv-t'), words = lapseText(s, d, n, done);
    if (t.textContent !== words) t.textContent = words;
    el.classList.toggle('done', done);
  }
  // (card-tiles.js: a chart over the days drops tiles for its own two lines on a laptop or tablet, a ladder its HVPG and PPG.)
  const tileKeys = (s) => cardKeys(s, phone());
  // The HVPG response tile (slide field hvpgResp: a slide id, or true for the slide before; card C3, 25 Oct): the percent fall in the
  // HVPG from that slide's, read live as the other tiles are (a compare button or a time-lapse moves it).
  function respFp(s, f) {
    if (!s?.hvpgResp || !f) return f;
    const i = slides.indexOf(s), base = i > 0 ? refOf({ delta: s.hvpgResp }, i)?.hvpg : null;
    return base > 0 && f.hvpg != null ? { ...f, hvpgFall: ((base - f.hvpg) / base) * 100, respFrom: base, respAt: tileShown('hvpg', f.hvpg) } : { ...f, hvpgFall: null, respFrom: null, respAt: null };
  }   // (a ladder already brackets the HVPG and PPG: tiles there would repeat them, rounded differently)
  function dataTo(s, f, ref, ms) {
    if (!ui) return;
    if (s.data) ui.tiles.paintTiles(respFp(s, f), tileKeys(s), s.key || [], ref, ms, store.get().params?.tips?.on, true);   // (live: held while the card moves, R19)
    ui.tools.pin(f); ui.scope?.pin(f);   // (an instrument's reading is the tiles' number, the scope view's too)
    // (and the catheter's callouts and its monitor, on a catheter slide whose compare buttons or time-lapse move the model)
    if (s.cath && cath.on && cath.fp) { cath.fp = f; if (s.monitor) mon?.set(s.monitor, f); }
    stage.siteFp?.(f);   // (and a callout's)
    figureHooks('update', f, s);   // (and a deck visuals package's, slide-ext.js)
  }
  async function playLapse(s, to, cut) {
    const end = await stateReady(stateOf[to]);
    if (!end || cut()) return;
    const days = s.days, d0 = store.get().frame?.day ?? 0, ref = refOf(s, to);
    lapseOn = true; lapseLeft = days;
    let seen = false;
    ui?.tools.progress(0, end.trail); lgSet(0, end.trail);
    host.send({ type: 'lapse', days, speed: days / (s.lapse.seconds || 8), ramp: s.ramp || null, bedside: bedside(s) });
    pushTo(s, to, (s.lapse.seconds || 8) * 1000);
    paintChrome();
    figureHooks('lapse', s);   // (a deck visuals package's glow from the days' start: slide-ext.js)
    // (A cap: when no frame has moved the days on for three times the lapse's length, the worker has stalled or a message was lost;
    // the loop ends and the slide lands on its computed end, as for a finished lapse.)
    let dBest = -1, moveAt = performance.now();
    while (lapseOn && !cut()) {
      const fast = lapseLeft === 0;
      await waitCut(fast ? 60 : 150, cut);
      const fr = store.get().frame;
      // (A bedside lapse counts its days in lapseDay, which frames from before it started lack, and frames after it ended lack again.)
      if (fr?.lapseDay != null) seen = true;
      const d = clamp(bedside(s) ? fr?.lapseDay ?? (seen ? days : 0) : (fr?.day ?? d0) - d0, 0, days);
      if (lapseLeft) lapseLeft = days - d;
      paintLapse(s, d, days);
      ui?.tools.progress(d / days); lgSet(d / days);
      // (Only once a day has run: before that the live figure is at the bedside, its numbers swinging with each beat, while
      // the card already shows the settled start.)
      if (fr?.metrics && d >= 1) dataTo(s, liveFp(fr), ref, fast ? 120 : 280);
      if (d >= days && fr?.clock === 'hemo') break;
      if (d > dBest) { dBest = d; moveAt = performance.now(); } else if (performance.now() - moveAt > 3000 * (s.lapse.seconds || 8)) { degrade('lapse-stall'); break; }
    }
    if (!lapseOn || cut()) { stopLapse(); return; }
    lapseOn = false; paintChrome();
    pushEnd(s, to, reduce.matches ? 0 : 600);
    paintLapse(s, days, days, true);
    ui?.tools.progress(1); lgSet(1);
    // (The live days land a hair off the computed end: the last step eases there too.)
    shownState = -1;
    if (!await morphTo(end, cut, reduce.matches ? 0 : 600, false)) return;
    shownState = stateOf[to];
    // A data card held through the days comes in now, already showing where they ended.
    const held = !!ui && 'hold' in ui.data.dataset;
    dataTo(s, end.fp, ref, held ? 0 : 700);
    if (held) releaseData();
  }

  // ── The case card ──
  // (caseLift: set while a case card is up; the first Next, swipe (on the card or anywhere) or tap on the card lifts it rather than changing the slide.)
  // The card goes up first; behind it the camera eases out to the whole patient, and only once it is still does the new patient
  // grow in, seen around the card (a camera move over a changing patient paints the organs whole every frame). The slide's words
  // are fitted unseen meanwhile; the tap lifts the card, the camera makes one eased zoom to the slide's own framing, and the
  // slide's cards come in once it has landed (see caseLifted, caseEnd).
  // The case card comes in and goes out on the frames (3 Nov 2026, "cards trailing behind": its CSS transition ran on the compositor a display
  // frame off the GPU glass drawn under it). Its class says where it ends (app.css .pz-case, .on); this writes the way there, inline, from
  // where it stands if it was still moving, and takes the inline values off once it has landed (the class holds them).
  const RISE_CASE = 14;   // (px: where a case card waits below its place, as app.css .pz-case)
  const caseFadeTokens = new WeakMap();
  function caseFade(c, on, ms) {
    // Replacing a fade resolves the previous glide's promise. Its continuation must not stop or clear the new fade.
    const token = {};   // alloc-rare: once when a case card begins or replaces a fade
    caseFadeTokens.set(c, token);
    if (ms <= 0) { glideStop(c); c.style.removeProperty('opacity'); c.style.removeProperty('translate'); return; }
    glideTranslate(c, 0, on ? RISE_CASE : 0, 0, on ? 0 : RISE_CASE, ms, easeArrive);
    glideOpacity(c, on ? 0 : 1, on ? 1 : 0, ms, easeArrive).then(() => { if (caseFadeTokens.get(c) === token && c.classList.contains('on') === on && on) { glideStop(c); c.style.removeProperty('opacity'); c.style.removeProperty('translate'); } });
  }
  let caseLift = null, caseCard = null, caseHideT = 0;   // (caseHideT: the timer that hides the card once it has faded out, caseShut)
  // The glass card goes up, a case's or a question's: its words fitted before it enters, so it never resizes on screen.
  function cardUp(tag, ...words) {
    const c = ui.vcase, ms = reduce.matches ? 0 : D_SURFACE;
    clearTimeout(caseHideT); caseHideT = 0;   // (the card is shown again: the timer of its last leaving has nothing left to hide)
    c.replaceChildren(h('span', { class: 'pz-site pz-case-tag' }, tag), ...words);
    const fading = c.classList.contains('on') ? false : c.style.opacity !== '' && c.style.opacity !== '0';   // (still fading out: it comes back from where it stands)
    for (const k of ['transform', 'transition']) c.style.removeProperty(k);   // (a card flung off last time comes back whole)
    if (!fading) for (const k of ['opacity', 'translate']) c.style.removeProperty(k);
    c.hidden = false; void readMetric(c, 'offsetWidth');
    // The words run 2.5x the teaching card's; on a short or narrow screen they ease down just enough to fit the card's room (set before it enters, so nothing resizes on screen).
    c.style.removeProperty('--case-k');
    for (let k = parseFloat(readStyle(c).getPropertyValue('--case-max')) || 2.5; k > 1.2 && readMetric(c, 'scrollHeight') > readMetric(c, 'clientHeight') + 1; k -= 0.1) c.style.setProperty('--case-k', k.toFixed(1));
    c.classList.add('on');
    caseFade(c, true, ms);
    // Lifting works from the moment the card is up: a tap, Next or a swipe anywhere fades it out at once, as a fling does, even
    // while the patient still loads behind it (the slide goes on into this same slide, its cards once loading ends). After
    // that Next and a swipe act as on any other slide.
    const card = caseCard = { c, ms, lifted: false };
    caseLift = () => caseGone(card);
    return card;
  }
  async function caseRun(s, si, st, cut, own = false) {
    // (A case may end on one short question of its own, caseQ, on its own line under the case: the card already holds the talk until it is
    // lifted, so the room has the pause to think.)
    const card = cardUp('Case', h('p', { class: 'pz-case-p' }, nb(s.vignette)), s.caseQ ? h('p', { class: 'pz-case-p pz-case-q' }, nb(s.caseQ)) : null);
    // (The figure dips as the card comes up, and stays dim while the camera backs out and the new patient is swapped in unseen: a dip, never a morph between two people.
    // Not figureOut: its loading arc would turn over the card's words. The way back is figureIn, below.)
    if (!own) view.classList.add('pz-out');
    await waitCut(card.ms, cut);
    if (cut()) return false;
    // The leaving slide's cards (faded out, still in place) no longer count for the framing: the wide view is the whole patient
    // around the case card. (The new slide's words set their own space again before the zoom to the slide: settleRun.)
    ui.safe.hidden = true;
    if (ui.data.classList.contains('pz-hide') && !ui.data.hidden) { clearTimeout(dataHideT); dataHideT = 0; ui.data.hidden = true; ui.tools.hide(); }
    // Behind the card: out of the liver, and out to the whole patient (unless the card was already lifted: the slide goes on from here).
    await toAnatomy(null, cut); if (cut()) return false;
    if (!card.lifted) {
      const gl = reduce.matches ? 300 : 1500;
      stage.fitSlow(gl);
      // (One move: the new patient starts as the camera is still, which the glide's own landing says (480 to 900 ms), not 1.5 s after it set off;
      // and at once when it was already the whole patient. Polled, so a card lifted or a newer slide is not waited behind.)
      await until(() => cut() || !stage.gliding(), gl + 600);
      await until(() => cut() || !stage.gliding(), 600); if (cut()) return false;
    }
    // Then, the camera still, the new patient eases in.
    liveOff = false; shownState = -1;
    // (A time-lapse's own start eases in as before, the days playing on from it; a new patient is swapped in under the dip and the figure comes back.)
    if (own) { if (!await morphTo(st, cut, reduce.matches ? 0 : 1200)) return false; }
    else { applyState(st); await drawn(st); if (cut()) return false; figureIn(); }
    shownState = own ? -1 : si;   // (a time-lapse's own start is not a slide's state: the live figure plays the days from it)
    // (The fit follows what the new patient draws, a growing ascites or spleen: once the organs are back on their GPU copy, one
    // short ease takes it in, and none when it already fits.)
    if (!card.lifted) {
      await until(() => cut() || card.lifted || stage.organsSettled(), CATH_SETTLE_MS); if (cut()) return false;
      if (!card.lifted) stage.fitSlow(reduce.matches ? 300 : 900);
    }
    if (view.classList.contains('pz-out')) figureIn(); else loading(false);
    return !cut();
  }
  // A question card (slide field question): the case card's glass, tag and lift, with one question and no new patient. It comes up over the
  // figure as it stands: no camera retreat, no patient morph. The slide's cards wait behind it (the caseCard branches), the camera makes its
  // one move to the slide's framing as it lifts, and a slide that changes the model plays that change then (answerPlay, playLapse).
  async function questionRun(s, cut) {
    await waitCut(cardUp('Question', h('p', { class: 'pz-case-p' }, nb(s.question))).ms, cut);
    return !cut();
  }
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
    const dist = Math.min(innerWidth, readMetric(c, 'offsetWidth') + RAIL_GAP);
    glideStop(c); c.style.removeProperty('transition'); c.style.removeProperty('transform');
    // (The card and its glass read these same frame-clock values, card-throw.js's way: they never part.)
    glideTranslate(c, x, y, x - dist, y, RAIL_MS, easeRail);
    glideOpacity(c, Number.isFinite(o) ? o : 1, 0, Math.round(RAIL_MS * 0.5), easeRail);
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
    const frames = pageIn(k, d, RISE_PX), how = { duration: D_SURFACE, delay: 0, easing: thrown ? EASE_MOVE : EASE_ARRIVE, fill: 'backwards' };
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
  const slidePrep = createSlidePrep({ count: () => slides.length, identity: () => `${deck?.id ?? ''}|${slides.length}|${prepRev}|${document.documentElement.dataset.theme || ''}/${document.documentElement.dataset.palette || ''}|${glEpoch()}`, steps: {
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
  let prepT = 0;
  // (R05: a slide shown before its preparation or its instrument's window was complete says so: the root's data-pz-degraded names what was
  // missing ('prep-preparing', 'prep-failed', 'prep-unprepared', 'window') until the next press, and degraded() counts them. The time limit
  // keeps a Next answered at once; it no longer passes for readiness, and a manifest that failed or never began is prepared afresh.)
  const degraded = { n: 0, last: '' };
  const degrade = (why) => { degraded.n++; degraded.last = why; if (ui) ui.root.dataset.pzDegraded = why; };
  function prepHold(i, then) {
    clearTimeout(prepT);
    const t0 = performance.now(), tx = txn;
    txn?.onRelease(() => { clearTimeout(prepT); prepT = 0; });
    const look = () => { prepT = 0; if (!deck || want !== i || !txnLive(tx)) return; if (slidePrep.ready(i)) then(); else if (performance.now() - t0 >= PREP_MS) { const st = slidePrep.state(i); degrade('prep-' + st); if (st !== 'preparing') slidePrep.aim(i, turn, tx ? tx.live : undefined); then(); } else prepT = setTimeout(look, 16); };
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
    else if (beat < lastBeat(want)) toBeat(beat + 1);   // (the slide's next view of the figure)
    else if (want < slides.length - 1) { firstBeat = true; go(want + 1); firstBeat = false; } else stop();
  };
  const prev = () => { if (procBack()) return; if (beat > 0) toBeat(beat - 1); else if (want > 0) go(want - 1); };
  // (N1: the presenter view's window: the slide on show goes to it, its Next, Back and jumps come back as the keys do.)
  const pview = createPresenterLink({ onBlocked: () => toast('Allow pop-ups to open the presenter view'),
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
    // (a pill in or out, a label lit or not) have run, unseen.
    await until(() => cut() || (store.get().sinusoid ? !!document.querySelector('.sv.on .sv-region') : !document.querySelector('.lz.lz-sin')), 2500);
    await waitCut(80, cut);
    await eased(['opacity', 'pill-in', 'sv-fade-in'], 1500, ':is(.lz-lab, .lz-zone, .sv-region)');
    if (cut()) return;
    hushed = false;
    app.classList.add('pz-hush-in'); app.classList.remove('pz-hush');
    clearTimeout(hushInT); hushInT = setTimeout(() => app.classList.remove('pz-hush-in'), HUSH_IN + 50);
  }
  // The corner credit sits out a slide change (class pz-moving on #app, read by src/ui/credit.js): it fades as the cards leave and
  // comes back once, at its final spot, after the cards are in and the camera has eased to fit around them.
  // (R02: the credit's hold and the camera's home hold are counted leases: every take gives back once, and only its own, so a move that was cut,
  // thrown or finished twice cannot release what a newer move took. creditT: the timer that lifts the credit's hold.)
  let creditT = 0;
  const creditLease = createLease(() => { clearTimeout(creditT); app.classList.add('pz-moving'); }, () => {
    clearTimeout(creditT);
    creditT = setTimeout(() => { if (!creditLease.count()) app.classList.remove('pz-moving'); }, 120);   // (the cards come in after the one camera move; src/ui/credit.js then waits for any card still sliding)
  });
  const homeLease = createLease(() => stage.holdHome(true), () => stage.holdHome(false));
  async function transition(to) {
    // (A card still zoomed as a slide starts, a move that did not come by go, a slide asked for while the days of a time-lapse played, or a new
    // text size: it glides back first, never snaps.)
    // (R02: the deck, the cards and the change this move began under; after any await, a move whose deck or cards are not these is not this move's to touch.)
    const deck0 = deck, ui0 = ui, tx0 = txn;
    if (zoomOn()) { await ui.zoom.close(); if (deck !== deck0 || ui !== ui0 || (tx0 && txn !== tx0)) return; paintZoom(); zoomMissed = false; if (!deck || !ui) return; }
    const homeOff = homeLease.take(), creditOff = creditLease.take();
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
      if (mine && want === to) tx.end();   // (landed, or given up for this slide: its cards' input is given back; a newer change keeps its own)
      creditOff();
    }
  }
  async function transitionRun(to) {
    const g = gen, tx = txn, s = slides[to], cut = () => !deck || want !== to || gen !== g || !txnLive(tx);
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
    tx?.phase('leave');
    if (outMs || thrown) { await painted(); await painted(); }
    if (cut()) return;
    // Words out, and the marks: they belong to the slide that is leaving.
    markBase = null;
    stage.explainClear?.();   // (a label explained by a tap goes with the slide: label-explain.js)
    store.set({ focus: null, stented: stentedKept(s), presentLabels: [], presentTerms: null, lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
    figureHooks('clear');   // (and what a deck visuals package put on the figure: slide-ext.js)
    // The slide's lens: the figure crossfades to its colours (stage.js) while the old words leave. A question, or a
    // visual over the figure, keeps the colours already showing: they change only when a slide's lens does.
    if (!s.visual) { const lens = slideLens(s); if (store.get().colorMode !== lens) store.set({ colorMode: lens }); }
    if (!hushed) delete app.dataset.lit;   // (hushed, the lit set goes straight to the next slide's: a label on both keeps its pill)
    // (Back onto a procedure's slide from the next lands on it done, so Next moves on.)
    strainStop(); stopLapse(); procStop(); abSlow(); handOn = false; procDoneAt = done && s.procedure ? to : -1; procThenAt = -1; procQueued = false;
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
    const outNow = (ct || (cam && !LOBULE_CAM.test(cam))) && (store.get().lobule || store.get().sinusoid) && (!inAnatomy || si !== shownState || liveOff);
    // (The lobule's layers change as this slide asks once the lobule is left, when it is left here: the zone bands the leaving
    // slide showed stay on the lobule through its way out, never switched off and repainted on it just before.)
    if (!outNow) slideLayers(s);
    // The catheter leaves with its slides. (Only a new patient on the first slide or with reduced motion fades the figure, which takes
    // it; otherwise the patient eases in after (morphTo) and the figure never dims, so the catheter retracts and fades on its own.)
    tx?.phase('cath-out');
    if (cath.on && (!ct || si !== shownState)) { await cathOut(si !== shownState && shownState >= 0 && (booting || reduce.matches || freshPatient(s, lap, pre)), cut); if (cut()) return; }
    tx?.phase('to-anatomy');
    if (outNow) { await toAnatomy(inAnatomy ? riseFor(cam, fv) : null, cut); if (cut()) return; slideLayers(s); if (cut()) return; }
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
    else if (s.visual) { await Promise.all(rowIdx(s).map(stateReady)); if (cut()) return; }
    // A new patient's case (s.vignette), going forward: a centred glass card covers the figure while the patient loads behind it
    // (it stays up while the camera glides, once, to the slide's own framing; Next lifts it, and the slide's cards then come in with no further move).
    const skipCase = noCase; noCase = false;
    // (A time-lapse may open on a case too: the card covers the patient as it loads at the time-lapse's own start, and the days play after the lift.
    // That patient needs a start state, which a time-lapse step has only with params: a case slide with a lapse says params: {} at least.)
    let loaded = false;
    if (!skipCase && s.vignette && ui && !booting && (!lap || !!own) && to > lastAt && (si !== shownState || liveOff || !!own)) { if (!await caseRun(s, si, st, cut, !!own)) return; loaded = true; }
    else if (ask) { if (!await questionRun(s, cut)) return; }
    // A new patient, or the same one changed: the figure fades out, the state changes unseen, it fades back in.
    const swap = !loaded && (si !== shownState || liveOff || !!own);
    // (The recording instruments wait for the slide's own state: see the release once it has landed.)
    ui?.tools.hold(swap && !booting);
    // On screen the change eases (morphTo): after the camera has landed and before the cards come in, or for a catheter slide
    // (its cards come in at once) right here. Only the first slide, or with reduced motion, does the figure dim while it changes.
    const dip = swap && !booting && !reduce.matches && !own && freshPatient(s, lap, pre), glide = swap && !booting && !reduce.matches && !dip, later = glide && !ct && !!ui;
    if (swap) {
      liveOff = false;
      tx?.phase('morph');
      if (glide) { shownState = -1; if (!later) { if (!await morphTo(st, cut)) return; shownState = own ? -1 : si; } }
      else {
        if (shownState >= 0 && !view.classList.contains('pz-out')) { await figureOut(cut); if (cut()) return; }
        applyState(st); shownState = own ? -1 : si;
        await drawn(st);
      }
      if (cut()) return;
      // (The state is in: the recording instruments start now, their window filled with the steady state the slide opens on, tools.hold.
      // A slide whose change eases in after the camera lands does it below.)
      if (!later) ui?.tools.hold(false);
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
    await settleRun();
    if (!bare) { await caseEnd(cut); if (cut()) return; cardsIn({ i: to, gen: g }); }
    if (cut()) return;
    // The liver's own labels light with the words, so their glow fades in during the dive rather than after it.
    if (!s.visual) app.dataset.lit = slideTargets(fv).lit.join(' ');
    const lead = swap && !glide && !ct && cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !reduce.matches && !booting ? camera(cam, fv, cut) : null;
    tx?.phase('lead');
    if (lead) { await waitCut(150, cut); if (cut()) return; }
    if (swap || view.classList.contains('pz-out')) figureIn(); else loading(false);
    if (cut()) return;
    // A catheter slide with a new patient changes it before its camera moves (its cards come in at once), and the catheter then drives
    // the camera at once. While the liver and the fluid ease, the organs are the live SVG drawing (stage.js hidePlate), which every camera
    // frame paints again whole, its diaphragm mask stretched over the abdomen by the flank: the route's glide ran at about 1 fps (HVPG
    // slide 9, Budd–Chiari). So the catheter sets off once the organs are back on the GPU copy, as every other slide's camera moves over it.
    if (ct && swap && glide) { await until(() => cut() || stage.organsSettled(), CATH_SETTLE_MS); if (cut()) return; }
    // Behind a case card the camera holds the whole patient until the tap; then it zooms to the slide as the card fades.
    if (caseCard) { await caseLifted(cut); if (cut()) return; }
    // One move: over the plate, outside the liver, the cards come in as the glide ends (plate), and a change of patient eases
    // under the glide (under) where the figure can move smoothly while its organs change. (Not behind a question's card: the change
    // would play out unseen before the lift; there it waits for the landing, as before.)
    const plate = bare && !ct && !!cam && !LOBULE_CAM.test(cam) && !store.get().lobule && !store.get().sinusoid;
    const under = plate && later && !caseCard && underTool(s.tool) && !!stage.canDrift?.() && (fv.view || 'anatomic') === store.get().view;
    let morphP = null;
    if (under) {
      if (keepNow.data && keepNow.swap) followData(s, to, st, cut);
      // (.app.pz-morph-under while it runs: the cards may come in over it, so the checks do not hold the data card to it as to pz-morph.)
      app.classList.add('pz-morph-under');
      morphP = morphTo(st, cut, MORPH_ONE_MS, false).finally(() => app.classList.remove('pz-morph-under'));
    }
    // (Same patient over the plate: the unseen cards' last fitting, two frames and a smooth one, runs under the glide's first frames, so
    // the cards come in once a quarter of it has run on any machine, not after it has landed. A new patient's waits for its change.)
    let prep = null, bareSeen = false;
    const prepWith = plate && !swap && !caseCard ? () => { prep ||= unseenFit(cut); } : null;
    tx?.phase('cath-in');
    if (ct) await cathTo(ct, st.fp, cut);
    else if (lead) await lead;
    else if (cam) await camera(cam, fv, cut, plate ? CARDS_AT : 0, prepWith);
    insetsGo();   // (no glide set off after all, a lobule's or a held one: the room is written now)
    if (cut()) return;
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
      if (swap) { await until(() => cut() || stage.organsSettled(), 1500); if (cut()) return; }
      if (prep) { if (await prep) await smooth(cut, QUICK_SMOOTH); } else await unseen(cut);
      if (cut()) return;
      const filled = await ui.tools.ready(900); if (cut()) return;
      if (!filled) degrade('window');   // (a recording instrument's window is filled before its card comes in: tools.prime)
      await caseEnd(cut); if (cut()) return;
      bare = false; cardsIn({ i: to, gen: g });
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
    shown = { i: to, gen: g }; lastAt = to; shownBeat = b0;
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

  // What a slide calls out on the figure once it has landed (or a scale's view of it, after a flip: flipMove): its marks, labels,
  // the stations its terms name (in their colours), its glows, the lobule's callout and its readings (see slideTargets).
  function paintOverlays(s, to, st, hooks = true) {
    if (!s.visual) {
      // The slide's marks, labels, the stations its terms name (in their colours) and its glows (see slideTargets).
      const tg = slideTargets(s), xc = ctxOf(s, to);
      // (A mark's edges may name a package's set, '@name', and its label goes through the packages' label hooks: slide-ext.js.)
      let marks = (s.marks || (s.mark ? [s.mark] : [])).map((m) => ({ edges: [...expandIds(m.edges)], label: markLabel(m.label, m, xc), kind: m.kind || 'block', free: !!m.free, ...(m.seg ? { seg: m.seg } : {}), ...(m.clot ? { clot: true } : {}) }));
      // A note mark is a pointer: its vessel glows in its station's colour. Where a station label on the slide already
      // names that vessel, the pointer would only repeat it, so it goes (the glow stays).
      if (tg) {
        const named = new Set([...(s.labels || []), ...tg.labels].flatMap((n) => TARGETS[n]?.edges || []));
        for (const m of marks) if (m.kind === 'note') for (const e of m.edges) if (!tg.glow.some((g) => g.id === e)) tg.glow.push({ id: e, tone: EDGE_TONE[e] || 'accent' });
        marks = marks.filter((m) => !(m.kind === 'note' && m.edges.some((e) => named.has(e))));
      }
      // (A site the label stands in for lends it its station colour, so the label is the slide's highlight.)
      if (tg) for (const k of s.sites || []) if (SITE_NODE[k] && [...(s.labels || []), ...tg.labels].includes(SITE_NODE[k])) tg.terms[SITE_NODE[k]] ||= TARGETS[k]?.tone || VAL_TONE[k];
      markBase = { i: to, marks };
      marks = clotMarks(marks, st?.params || store.get().params);
      store.set({ presentLabels: [...new Set([...(s.labels || []), ...tg.labels])], presentTerms: tg.terms || null,
        presentNames: s.tool?.kind === 'profile' || !!s.cath, presentFp: st?.fp || null,
        focus: markFocus(marks), stented: stentedOf(s), lobuleCallout: !s.callout ? null : { kind: 'block', ...s.callout } });
      // (The glows and outlines are the figure's decoration: one that cannot be drawn, as on a device without WebGL2 once, leaves the slide
      // without it rather than half-changed with its cards never in.)
      if (tg) {
        try { stage.setGlow(tg.glow); stage.pinOrgans(tg.organs.map((o) => (o.id === 'spleen' && st?.fp ? { id: o.id, tone: rateTone('spleen', st.fp) } : o))); stage.setResGlow(tg.res); }
        catch (e) { console.warn(`presenter: slide ${to + 1}'s glows and outlines could not be drawn`, e); }
      }
      app.dataset.lit = tg?.lit.join(' ') || '';
      if (hooks) figureHooks('show', xc);   // (a deck visuals package's own marks on the figure: slide-ext.js; a flip leaves them as they are)
    }
    // A site whose station label is already on the slide is not called out twice: the label carries the one reading,
    // in its station's colour, and the pill stays only where no label stands.
    { const named = new Set(store.get().presentLabels || []);
      const ss = !s.visual ? [...new Set([...(s.sites || []), ...slideTargets(s).sites])].filter((k) => !named.has(SITE_NODE[k])) : [];
      if (ss.length && st) stage.setSites(ss, st.fp); }
  }
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
  async function settleRun() {
    await Promise.race([document.fonts?.ready, wait(400)]);
    await new Promise((done) => nextFrame(() => nextFrame(done)));
    if (!ui) return;
    layout();
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
  // Next pressed while the words are still coming in: their entrance (a WAAPI move, above the CSS leave) is stopped where it has got
  // to, held there for one style read, and let go, so the leave starts from where the words are, never from full or after a jump.
  function wordsFreeze() {
    const a = turnAnim; turnAnim = null; turnIn = false;
    const t = ui.text;
    // (The page: the glass and the words are stopped together where their entrance has got to, and leave from there.)
    for (const [el, an] of [[t, a], [ui.shade, shadeAnim]]) {
      if (!an || an.playState === 'finished' || an.playState === 'idle') continue;
      const cs = readStyle(el), o = cs.opacity, tf = cs.transform;
      an.cancel();
      el.style.transition = 'none'; el.style.opacity = o; el.style.transform = tf;
      void readStyle(el).opacity;
      el.style.transition = ''; el.style.opacity = ''; el.style.transform = '';
    }
    shadeAnim = null;
  }
  // What is left, ms, of the longest fade still running on these cards (0 when none).
  const fadeLeft = (els) => els.reduce((m, el) => readAnims(el).reduce((n, a) => { const t = a.playState === 'running' && readTiming(a.effect); return t && Number.isFinite(t.endTime) ? Math.max(n, t.endTime - (t.localTime || 0)) : n; }, m), 0);
  // A slide's tiles can say how far each number moved: from the slide before (delta: true) or a named one. A slide that
  // changes the same patient (a drug, an action, days) counts from the slide before unless it says delta: false.
  const deltaOf = (s, i) => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);
  const refOf = (s, i) => { const d = deltaOf(s, i); return (d === true ? states[stateOf[i - 1]]?.fp : typeof d === 'string' ? fpOf(d) : null) || null; };
  // The data card: the ladder and tiles, a slide's instrument (tool), or both (the tool above the tiles).
  const hasCard = (s) => !s.visual && (s.data === 'tiles' || !!s.tool);
  // A reading tool can show the earlier reading as a ghost (D3): tool.delta, else the slide's own delta.
  const GHOST = { fibroscan: ['lsm', 'kPa', 1], spleen: ['ssm', 'kPa', 1], doppler: ['pvVel', 'cm/s', 0] };
  function toolGhost(s, i) {
    const g = GHOST[s.tool.kind === 'fibroscan' && s.tool.organ === 'spleen' ? 'spleen' : s.tool.kind];
    if (!g || (s.tool.kind === 'doppler' && (s.tool.vessel || 'PV_TRUNK') !== 'PV_TRUNK')) return null;
    if (s.tiles?.includes(g[0])) return null;   // (a tile already gives the change and where it came from)
    const t = s.tool.delta != null ? { ...s, delta: s.tool.delta } : s, d = deltaOf(t, i), r = refOf(t, i);
    if (r?.[g[0]] == null) return null;
    // (The earlier reading only: the instrument's live reading jitters, so a computed change could disagree with it.)
    const from = d === true ? slides[stateOf[i - 1]] : slides.find((x) => x.id === d);
    return { label: s.tool.deltaLabel || (d === true && s.lapse?.from) || from?.kicker || 'Before', value: `${fmt(r[g[0]], g[2])} ${g[1]}` };
  }
  const fullTitle = (s) => s?.dataTitle || (s?.tool ? ui.tools.title(s.tool) : 'The patient');
  // A phone's card title is one short line beside Show: the long name's head, never broken into two lines or a hyphen.
  const SHORT_TITLE = { 'Pressure, portal vein to heart': 'Portal vein to heart', 'Endoscopy, the lower esophagus': 'Endoscopy', 'The varix wall, in cross-section': 'The varix wall',
    'Liver stiffness, FibroScan': 'FibroScan', 'HVPG, catheter tracing': 'HVPG tracing', 'Pressure, beat by beat': 'Beat by beat', 'Portal pressure and flow over time': 'Pressure and flow', 'Doppler, main portal vein': 'Doppler, portal vein',
    'Doppler, superior mesenteric vein': 'Doppler, SMV', 'Doppler, splenic vein, at the hilum': 'Doppler, splenic hilum', 'Doppler, right portal vein': 'Doppler, right PV', 'Doppler, left portal vein': 'Doppler, left PV',
    'Doppler, right hepatic vein': 'Doppler, right HV', 'Doppler, middle hepatic vein': 'Doppler, middle HV', 'Doppler, left hepatic vein': 'Doppler, left HV', 'Doppler, inferior vena cava': 'Doppler, IVC',
    'Doppler, paraumbilical vein': 'Doppler, umbilical v.', 'Two years on one chart': 'Two years', 'The course on one chart': 'The course', 'Pressure over the talk': 'Pressure so far',
    'Pressures over the year': 'The year' };
  // (A phone on its side takes the short title too: its long one wrapped there, at its hyphen, "CROSS-" over "SECTION". A title's
  // hyphen never breaks, on any screen: a non-breaking one. Critique I7, 17 Oct.)
  const cardTitle = (s) => {
    const t = fullTitle(s), small = phone() || (innerWidth > innerHeight && innerHeight <= 500);
    return (small && t.length > 20 ? SHORT_TITLE[t] || (s?.tool && ui.tools.short(s.tool, t)) || t.replace(/ over the (days|year|talk)$/, '').replace(/,.*$/, '') : t).replace(/-/g, '\u2011');
  };
  // (A unit in a title keeps its own case, in a span the style leaves alone: "mL/day", not "ML/DAY".)
  const unitSpans = (el) => { const p = titleParts(el.textContent); if (p.length < 2) return; el.textContent = ''; p.forEach((t, i) => { if (t) el.append(i % 2 ? h('span', { class: 'pz-unit' }, t) : t); }); };
  // The talk so far, for a pressure trace: every state up to slide i, once each.
  // Each carries its time point (the deck's days so far) and what happened there (the first tick among its slides, else its title),
  // and its slide's id and its state's params (for a deck visuals package's chart).
  // (since: a slide's id, the trace's tool.since: the chart starts at that slide's state and counts its days from there, so a
  // deck that moves on to a new patient charts only that patient's course.)
  const whenOf = (k, f0 = -1) => {
    const d = slides.slice(f0 + 1, k + 1).reduce((a, s) => a + (s.days || 0), 0);
    return d && d % 365 === 0 ? `Year ${d / 365}` : d <= 200 ? `Day ${d}` : `Month ${Math.round(d / 30.4)}`;
  };
  // (A state on the same day as the one before it, as a drug started at that visit, says so instead of repeating the day; a slide's `when` words it.)
  const chainTo = (i, since) => { let before = null; const f0 = since ? slides.findIndex((x, j) => j <= i && x.id === since) : -1, k0 = f0 >= 0 ? stateOf[f0] : -1; return [...new Set(stateOf.slice(0, i + 1))].filter((k) => k >= k0 && slides[k]?.visual !== 'outline').map((k) => { const w = whenOf(k, k0), p = { n: k + 1, title: slides[k].title, tick: slides.find((x, j) => stateOf[j] === k && x.tick)?.tick || slides[k].title, mile: slides.find((x, j) => stateOf[j] === k && x.milestone)?.milestone, when: traceWhen(slides[k].when, w, before), day: w, fp: states[k]?.fp, id: slides[k].id, params: states[k]?.params }; before = w; return p; }); };
  // The deck's short name in a tab at the card's top right corner (decks.js TOPICS; your own deck, its title when short):
  // a darker patch of the card's own glass, flush with its top and right edges, only its bottom left corner rounded. It sits in
  // the card's top padding, so it never meets the title. (Not read out on every slide: the outline and the slide list name the talk.)
  const deckTab = () => { const name = deck?.head || (deck?.title?.length <= 24 ? deck.title : ''); return name ? h('span', { class: 'pz-tabname', 'aria-hidden': 'true' }, name) : null; };
  // The catheter's pressure monitor, made once and kept, so its trace carries on from slide to slide.
  let mon = null;
  function monitorFor(s, i) {
    mon ||= createHvpgMonitor();
    // Already up (the slide before measured too): it stays, and glides to its new place under the new words.
    const stay = mon.el.parentNode === ui.text && !ui.text.hidden, y0 = stay ? readBox(mon.el).top : 0;
    mon.el.classList.toggle('pz-stay', stay);
    // (Where it lands is read once, as the slide's words are placed (a microtask: after this pass has put it under them, before any
    // frame paints it there), never in a frame; the glide itself is a transform.)
    if (stay && !reduce.matches) queueMicrotask(() => {
      const dy = y0 - readBox(mon.el).top;
      if (Math.abs(dy) > 1) mon.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: D_SURFACE, easing: EASE_MOVE, composite: 'add' });
    });
    nextFrame(() => mon.set(s.monitor, states[stateOf[i]]?.fp, cath.v.balloon));
    return mon.el;
  }
  // ── The question card ──
  // A slide can carry question: '...' (one short question, no choices, no answer line, nothing stored or scored). Stepped onto going
  // forward it is asked on the case card's glass (questionRun), over the figure as it stands, and the slide is its answer. A slide that
  // changes the model lands holding the state before it, the data card showing those numbers, and plays its change once the card is
  // lifted: its time-lapse, or the eased change a compare button would make (answerPlay), the numbers following. A slide whose answer is
  // a control the learner moves, or a visual, changes nothing. Jumped to, or gone back to, the slide shows as any other, with no card.
  // (Only going forward one step, never onto a slide that brings a patient, a case, a catheter or a live procedure.)
  const questionable = (s, to, ct) => !!ui && !booting && !noCase && typeof s.question === 'string' && !!s.question.trim() && !ct && !s.vignette && !s.preset && !s.procedure && to > 0 && to === lastAt + 1;
  // The change the slide makes to the model, eased in as the numbers follow (what a time-lapse does by its days).
  async function answerPlay(s, i, cut) {
    const end = await stateReady(stateOf[i]);
    if (!end || cut()) return;
    const ref = refOf(s, i);
    let easing = true;
    (async () => { while (easing && !cut()) { await waitCut(150, cut); const fr = store.get().frame; if (easing && fr?.metrics && !cut()) dataTo(s, liveFp(fr), ref, 280); } })();
    shownState = -1;
    const done = await morphTo(end, cut, reduce.matches ? 0 : MORPH_MS, false);
    easing = false;
    if (!done || cut()) return;
    shownState = stateOf[i];
    dataTo(s, end.fp, ref, 280);
  }

  // ── The answer held back ──
  // A question slide (hold: true) keeps back what would name its answer: the Gut to heart chart's red blocks and HVPG and PPG brackets, the
  // Doppler strip's direction, pattern and note, the tiles' rating words and the figure's "no flow" and "stasis" words. They are set out
  // of sight as the slide's cards are built (instant), and the next slide, its answer, comes in still holding them and lets them ease in
  // once its cards have landed (holdEase, see transitionRun).
  let heldNow = false, holdEase = false;
  function holdAnswer(on, instant = false) {
    if (!ui) return;
    heldNow = !!on;
    ui.data.toggleAttribute('data-held-now', !!instant);
    ui.data.toggleAttribute('data-held', heldNow);
    if (app.classList.contains('pz-held') !== heldNow) { app.classList.toggle('pz-held', heldNow); themeChanged(); }   // (.app.pz-held restyles the labels' alerts: label-theme.js)
    ui.tools.holdAnswer(heldNow, instant);
    // alloc-rare: once per instant answer, not per frame
    if (instant) nextFrame(() => nextFrame(() => ui?.data.removeAttribute('data-held-now')));
  }
  // (Held on this slide: its own hold, or an answer slide straight after a held one, held until it lands.)
  const answerAfter = (s, i) => !s.visual && !s.hold && !s.preset && i > 0 && !!slides[i - 1]?.hold && i === lastAt + 1;
  // A slide's cards come in: the teaching card and the data card, each built unseen (pz-prep) and laid out where it will rest. A card the slide
  // keeps from the one before (keepFor) is not built: the data card only follows the patient (dataKept), the words stay as they stand.
  function wordsIn(s, st, i, fresh = false, lap = false, now = st) {
    if (!ui) return;
    keepArgs = { s, st, i, fresh, lap, now };
    ui.scope?.slide(s);   // (the ring on the varices when the slide shows them; a lens left open closes)
    lgLap = lap;
    if (!keepNow.text) textIn(s, st, i);
    if (keepNow.data) dataKept(s, i, now); else dataIn(s, st, i, fresh, lap, now);
    layout();
    keepNote();   // (a kept card this layout changed is put back at once: nothing changed is ever painted)
  }
  // The teaching card's words (or a visual's panel) for slide i, and what stands with them: the scale switch, the level's tab.
  function textIn(s, st, i) {
    const { text, panel } = ui;
    lgDrop(); evDrop();   // (the last slide's time graph is let go before the words are drawn again)
    paintScales(s, i);
    // The slide's level (Presinusoidal, Cardiac...) is a tab in the glass's top left corner, the deck tab's mirror in the level's
    // colour (17 Oct), not a pill over the title: set with the words, gone on a visual slide.
    // (A slide with a level rail names its level on the rail, which a phone held upright hides: there the tab names it instead.)
    const railLvl = !s.visual && s.rail && s.rail !== 'all' && SITE_TAGS[s.site] ? { site: s.site === 'pvt' ? 'pre' : s.site, name: SITE_TAGS[s.site] } : null;
    const lvl = s.visual ? null : siteTag(deck, s) || railLvl, stab = ui.shade.querySelector('.pz-sitetab');
    if (stab) { stab.hidden = !lvl?.site; stab.toggleAttribute('data-rail', !!lvl && lvl === railLvl); if (lvl?.site) { stab.dataset.site = lvl.site; stab.textContent = lvl.name; } }
    // (the panel's own is let go once its new content is in, so it never fades back in with the old; behind a case card the words
    // stay out, never shown for a moment while they are fitted, until the card is lifted: cardsIn)
    // (Thrown in, the words stay out until cardsIn throws them in: let go here, they faded in at rest first and then jumped to the side.)
    if (!caseCard && !bare && !(throwDir && !s.visual)) text.classList.remove('pz-leave');
    if (s.visual) {
      dropCharts(text); dropCharts(panel);
      text.hidden = true; text.replaceChildren(); paintKey(null);
      // A panel that was not there fades in (never pops): unhidden while still faded, then let go.
      if (panel.hidden) { panel.classList.add('pz-leave'); panel.hidden = false; void readMetric(panel, 'offsetWidth'); }
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.dataset.visual = s.visual;
      panel.style.setProperty('--pz-tu', s.visual === 'table' ? String(tableUnits(s)) : '');   // (a table's own width in body-text em, so its card fits it: app.css .pz-panel[data-visual="table"])
      const tab = s.visual !== 'outline' && deckTab();   // (the outline names the talk in full instead)
      panel.classList.toggle('tabbed', !!tab);
      panel.replaceChildren(...(tab ? [tab] : []), h('div', { class: 'pz-ph' }, s.visual === 'outline' ? h('h1', { class: 'pz-dtitle' }, nb(deck.title)) : null, h('h1', { class: 'pz-h' }, ...diseaseNodes(nb(s.title))), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp, !!st?.params?.tips?.on)) : null, s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null, citeEl(s)),
        visualOf(s, i));
      if (!ui.root.classList.contains('pz-prep')) cardIn(panel, 'pz-leave');   // (else once fitted: settle)
      ui.veil.classList.add('on');
    } else {
      dropCharts(panel); dropCharts(text);
      panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); ui.veil.classList.remove('on');
      text.hidden = false;
      const head = h('h1', { class: 'pz-h' }, ...diseaseNodes(nb(s.title)));
      const rv = revealCount(s), line = s.line ? h('p', { class: 'pz-line' }, ...(rv ? revealLine(s, st?.fp, !!st?.params?.tips?.on, Math.min(beat, lastBeat(i)) + 1) : rich(s.line, s, st?.fp, !!st?.params?.tips?.on))) : null;
      if (bare) for (const a of readAnims(text)) a.finish();   // (the old words' leave is finished before the new words go in: the box never shows them mid-fade)
      text.replaceChildren(...[head, s.eq ? equation(s.eq) : null, s.monitor ? monitorFor(s, i) : null,
          line, s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null, citeEl(s),
          s.compare ? h('div', { class: 'pz-ab', role: 'group', 'aria-label': lensButtons(s) ? 'Color the vessels by' : gateButtons(s) ? 'Sample the stent at' : toolButtons(s) ? 'Change the instrument\'s view' : s.compare.some((o) => o.params && 'fenestrae' in o.params) ? 'Open or close the fenestrae on the live model' : isResponse(s.compare) ? 'Change how well the beta-blocker works on the live model' : 'Switch treatment on the live model' },
            s.compare.map((o, k) => h('button', { type: 'button', class: 'pz-abb', 'aria-pressed': String(!!o.own), ...(o.short ? { 'data-full': o.label, 'data-short': o.short, 'aria-label': o.label, title: o.label } : {}), onclick: () => abPick(s, i, k) }, o.label))) : null,
          s.procedure ? eventGraph(s, i, st) : null,
          s.procedure ? procEl(s, i, st) : null,
          s.whatIf ? whatIfEl(s, i, st) : null,
          s.strain ? strainEl(s, i) : null,
          s.column ? wedgeColumn() : null,
          s.lapse && i > 0 ? lapseGraph(s) : null,
          s.lapse && i > 0 ? lapseRow(s) : null,
          s.rail ? rail(s.rail === 'all' ? 'all' : s.site) : null,
          s.causes?.length ? h('p', { class: 'pz-causes' }, h('span', { class: 'pz-sub' }, s.causesHead || 'Causes'), nb(listCase(s.causes))) : null]);
      paintKey((slideLens(s) !== 'pressure' || lensButtons(s)) ? slideLens(s) : null, s);
      lgStart(st); evStart(st);   // (the graph's chart is drawn once its box is in the card: its size is read from it)
      markLong(text, gen !== redrawn);   // (drawn again for a new text size: judged at its full size, as a fresh load does)
      [...text.children].forEach((c, k) => c.style.setProperty('--i', k));
      text.dataset.turn = turnNow || throwDir;   // (the way the new words come in: app.css; '' comes in from the card's edge with the glass, as before)
      turnIn = !!(turnNow || throwDir);   // (its box comes in by wordsTurnIn once the cards come in)
      text.classList.remove('pz-enter'); void readMetric(text, 'offsetWidth'); text.classList.add('pz-enter');
    }
    textOn = textPlan(s);
  }
  // The data card for slide i: its instrument and tiles, or nothing (the card then leaves).
  let dataHideT = 0;   // (the timer that hides the data card once it has faded out)
  function dataIn(s, st, i, fresh, lap, now) {
    const { data } = ui;
    delete data.dataset.hold;
    if (hasCard(s)) {
      // (A time-lapse's numbers wait for its end; an instrument on the card plays the days, so that card comes in with the words.)
      if (lap && !s.tool && ui.root.classList.contains('pz-prep')) data.dataset.hold = '';
      data.classList.add('tiles-only');   // (every card: the old ladder card was the one without it)
      data.classList.toggle('under', under(s));
      data.toggleAttribute('data-sin-tiles', sinTiles(s));
      data.classList.toggle('has-tool', !!s.tool);
      data.classList.toggle('tool-only', toolOnly(s));   // (an instrument card is the instrument alone, one fixed size: its readings stand in its header row, no readings card behind it, no handle)
      // (The portal blood bar takes the card's full width, its tiles under it: beside them its column was too narrow for the
      // segments' names, a 320 px card left it about 120 px, tool-flows.js.)
      // (The fluid balance's capacity window too: its rows of numbers need the card's width; tool-fluid.js. And the criteria card: its rules
      // are sentences.)
      data.classList.remove('pz-beside'); data.removeAttribute('data-beside');   // (no tiles stand beside an instrument now: they are its header's readings)
      data.toggleAttribute('data-ladder', s.tool?.kind === 'profile');   // (Mac and iPad landscape: the Gut to heart chart is never zoomed by the fit, so a pair too tall for it lifts instead, slip.base; layout)
      data.classList.remove('pz-folds');   // (Mac and iPad landscape: folded behind Show only when the pair would not fit, set in layout)
      data.dataset.tn = tileKeys(s).length;   // (Mac and iPad landscape: every instrument with tiles has them stacked beside it; its own readings fold to a short list under its picture)
      data.classList.remove('tool-lead');   // (nothing folds away behind an instrument now)
      data.dataset.tool = ui.tools.sig(s.tool);
      ui.dhT.textContent = cardTitle(s); unitSpans(ui.dhT);
      // (A flow-time chart over a time-lapse starts empty and draws as it plays.)
      if (s.tool) showTool(s, i, lap, i === lastAt + 1); else ui.tools.hide();
      if (s.tool?.kind === 'evgraph') evAdopt(s, i, st);   // (forward: stepped onto from the slide before, so the HVPG card plays its tracing)
      if (s.tool) ui.tools.ghost(toolGhost(s, i));
      // (With a new patient the numbers are set at once, while the card is still out: it fades back in already showing them. So
      // too while the new cards wait, unseen, for the camera to land (bare): their count ran unseen beside the glide, a frame's
      // work each frame of it, and was over before they came in.)
      const ms = fresh || (bare && ui.root.classList.contains('pz-prep')) ? 0 : undefined;
      if (s.data) ui.tiles.paintTiles(respFp(s, now.fp), tileKeys(s), s.key || [], refOf(s, i), ms, now.params?.tips?.on);
      else ui.tiles.paintTiles(now.fp, [], [], null, 0, false);   // (an instrument alone: no readings of the last slide stay in its header row)
      ui.tools.pin(now.fp); ui.scope?.pin(now.fp);
      clearTimeout(dataHideT); dataHideT = 0;   // (a card shown again is not hidden by the timer of its last leaving, while it fades in or waits to)
      if (data.hidden) { data.hidden = false; data.classList.add('pz-hide'); void readMetric(data, 'offsetWidth'); }
      if (!ui.root.classList.contains('pz-prep')) cardIn(data, 'pz-hide', THROW_STAGGER);   // (else once fitted: settle)
      else data.dataset.prep = '1';
      delete data.dataset.gone;
    } else if (!data.hidden) {
      data.dataset.gone = '';
      data.classList.add('pz-hide'); delete data.dataset.colswap;
      // (The timer belongs to the fade that began first: a second leaving with no card shown between lets it run, and one shown between has cleared it.)
      dataHideT ||= setTimeout(() => { dataHideT = 0; if (data.classList.contains('pz-hide')) { data.hidden = true; ui?.tools.hide(); } }, D_SMALL + 20);
    }
    dataOn = planOf(s, i) ?? null;
    holdEase = answerAfter(s, i);
    holdAnswer(!s.visual && (!!s.hold || holdEase), true);
  }
  const showTool = (s, i, lap = false, forward = false) => ui.tools.show(s.tool, { slide: i, stateKey: stateOf[i], forward, chain: chainTo(i, s.tool.kind === 'trace' ? s.tool.since : null), trail: states[stateOf[i]]?.trail ?? null, reveal: lap ? 0 : 1, ctx: ctxOf(s, i), balloon: s.cath ? cath.v.balloon : null, figure: beside(s) ? besideHook : null });

  // ── Cards that stay between slides ──
  // A slide change used to fade both cards out and build both again. When the next slide's data card is the same (the same instrument
  // and options, the same tiles, title and layout: card-keep.js dataPlan) it stays where it is, live, and only the words swap; when the
  // words are the same (textPlan) the data card swaps and the words stay. Chosen as the change begins (keepFor), from the plans of the cards
  // on screen (dataOn, textOn) and of the slide coming; every other change is as it always was.
  // The numbers of a kept data card ease to the slide's: with the same patient the tiles count, and with a new one the card follows the model as it
  // eases (followData), nothing jumping ahead of the figure. A kept card that the new slide's layout would change (its size, fit or fold) is not
  // kept after all: put back as it stood, it leaves and is built again as every card is (keepNote, keepFall).
  const NO_KEEP = { data: false, text: false, swap: false };
  let keepRun = false;   // (the kept data card, the same instrument from slide to slide (the HVPG catheter run included): whatever the new slide's layout does to it, it is never let go and built again)
  let keepNow = NO_KEEP, keepArgs = null, keepSnap = null, keepBad = [], keepCut = () => true;
  let dataOn = null, textOn = null;   // (the plans of the cards on screen: null, no such card, or one built from a slide this plan does not know)
  // What a data card is made of for slide i, or null (no card), or undefined (not yet known: a state its tiles' ring is counted from is still being computed).
  function planOf(s, i) {
    if (!hasCard(s)) return null;
    const d = deltaOf(s, i);
    if (d === true ? i > 0 && !states[stateOf[i - 1]] : typeof d === 'string' && !fpOf(d)) return undefined;
    return dataPlan(s, { keys: tileKeys(s), ref: !!refOf(s, i), title: cardTitle(s), ghost: s.tool ? toolGhost(s, i) : null, under: under(s), sin: sinTiles(s) });
  }
  // A card standing whole (not on its way in or out, not half folded or pulled) can be kept.
  const dataStands = () => { const d = ui.data; return !d.hidden && !throwLeaving(d) && !throwHeld(d) && !d.classList.contains('pz-hide') && !d.classList.contains('pz-sliding') && !['gone', 'prep', 'hold', 'colswap', 'folding'].some((k) => k in d.dataset); };
  const textStands = () => { const t = ui.text; return !t.hidden && !throwBusy(t) && !throwBusy(ui.shade) && !!t.childElementCount && !t.classList.contains('pz-leave') && !ui.root.classList.contains('pz-prep'); };
  // Which cards slide `to` keeps from the slide on screen (prev). A change cut short, a start, a slide drawn again for a new text size, a case card,
  // a catheter, a time-lapse or a question (card-keep.js) keep nothing.
  function keepFor(prev, s, to, swap, o) {
    keepSnap = null; keepBad = []; keepRun = false;
    if (!ui || !prev || booting || reduce.matches || caseLift || caseCard || o.again || !states[stateOf[to]] || (to > 0 && !states[stateOf[to - 1]])) return NO_KEEP;   // (the states a tile's ring and the readings come from must be in)
    const data = dataStands() && keepData({ from: dataOn, to: planOf(s, to), prev, next: s, swap, again: o.again });
    keepRun = !!data;   // (the same instrument stays mounted whatever the new slide's layout does to its size, fold or class: only its data changes)
    const text = textStands() && keepText({ from: textOn, to: textPlan(s), prev, next: s, swap, again: o.again });
    if (!data && !text) return NO_KEEP;
    keepSnap = { data: data ? cardSnap(ui.data) : null, text: text ? cardSnap(ui.text) : null };
    return { data, text, swap };
  }
  // Called after the layout passes with a card kept: one the layout changed is put back as it stood (nothing is painted changed) and noted,
  // and keepFall then lets it leave and builds it again.
  function keepNote() {
    if (!ui || !keepSnap) return;
    for (const k of ['data', 'text']) {
      if (k === 'data' && keepRun) continue;   // (the layout's size, fold or class stand as they are: a snap at worst, never the card leaving and coming back: Mohammad, 4 Nov 2026, "the card shouldn't hide and appear again; it's the same instrument and the data transitions")
      const sn = keepNow[k] && keepSnap[k];
      const why = sn ? cardChangedWhy(sn, k === 'data') : '';
      if (!why) continue;
      gpuProbe.note(`kept ${k} card let go: ${why}`);   // (so a ?perf copy says what changed)
      cardBack(sn);
      if (k === 'data') { clearTimeout(colT); colT = 0; }
      if (!keepBad.includes(k)) keepBad.push(k);
    }
  }
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
  // The data card kept: nothing is rebuilt. With the same patient the tiles take the slide's readings (their count eases) and the instrument is told
  // of the slide, as it is on every slide; with a new one the card waits for the model (followData).
  function dataKept(s, i, now) {
    if (keepNow.swap) return;
    if (s.tool) showTool(s, i);
    if (s.data) ui.tiles.paintTiles(respFp(s, now.fp), tileKeys(s), s.key || [], refOf(s, i), undefined, now.params?.tips?.on);
    ui.tools.pin(now.fp); ui.scope?.pin(now.fp);
  }
  // A kept data card with a new patient: its tiles and instrument ride the live model as it eases to the slide's state,
  // then land on the slide's own numbers.
  function followData(s, to, st, cut) {
    const ref = refOf(s, to);
    (async () => {
      while (!cut() && ui) {
        await waitCut(150, cut);
        if (cut() || !ui) return;
        // (The patient has landed, shownState set: the card takes the slide's own numbers and is done.)
        if (shownState === stateOf[to]) { if (s.tool) showTool(s, to); dataTo(s, st.fp, ref, 280); return; }
        const fr = store.get().frame;
        if (fr?.metrics) dataTo(s, liveFp(fr), ref, 280);
      }
    })();
  }
  // Each row of a table still computing fills in (its cells fade in) as its patient arrives. It is asked for by the table itself, as it is built, so
  // every way a table gets drawn (a slide landing, the card drawn again for a new text size, a kept panel) fills in, and a slide that is slow to
  // land (the model paused, a heavy figure) never leaves its cells blank for good. A table that has left the page is let go.
  const TABLE_WAIT_MS = 1500;   // motion-scale: not a move (a longest wait)
  function watchRows(el, s) {
    for (const k of new Set(rowIdx(s).filter((x) => !states[x]))) {
      // (R15: the rows are published at a safe boundary: not while the cards are still on their throws, then the layout they change is asked for once, R14.)
      stateReady(k).then(async (st) => {
        if (!st || !ui) return;
        if (thrown()) await Promise.all(throwCards().map((c) => c && throwLanded(c)));
        if (!ui || !el.isConnected) return;
        const t = summaryTable(s, k), sc = readMetric(el, 'scrollTop');
        el.replaceWith(t); t.scrollTop = sc;
        // (The new table is fitted as the one it replaces was: its head row set upright where the columns are narrow, the card zoomed to hold it.)
        fitDone.delete(ui.panel);
        if (!cardMoving()) layout(); else if (thrown()) layoutAtLanding();
      });
    }
  }
  const fpOf = (id) => { for (let i = 0; i < slides.length; i++) if (slides[i].id === id) return states[stateOf[i]]?.fp; return null; };
  fpAt = fpOf;   // (for {key@slide} in the words: see liveVal)
  // What a deck visuals package's instrument, visual, column or figure hook gets for slide i (slide-ext.js): the slide, its
  // model state (snapshot, params, fingerprint), its extra work (st.extra, see stepOf), the live params (with any what-if slider
  // or compare button), other slides' fingerprints by id, the healthy fingerprint, and requests to the presenter's own
  // calculation worker (never the live model). P0.md in review/deck-visuals-build has the full list.
  function ctxOf(s, i) {
    const st = states[stateOf[i]] || null, d = deck;
    return {
      slide: s, index: i, deck: d, slides, stage, store, app,
      state: st, snap: st?.snap ?? null, params: st?.params ?? null, fp: st?.fp ?? null,
      // (ref: the fingerprint the slide counts its changes from, its delta or its tool's; the beat-by-beat card draws where the patient stood)
      ref: s.tool || s.delta != null ? refOf(s.tool?.delta != null ? { ...s, delta: s.tool.delta } : s, i) : null,
      extra: states[i]?.extra ?? null,
      whenExtra: () => stateReady(i).then((x) => x?.extra ?? null),
      liveParams: () => store.get().params,
      fpOf, healthy: () => base,
      shown: () => deck === d && shown?.i === i,
      request: (type, payload = {}) => getCalc().request(type, payload),
      // (steps as stepOf makes them; from: the snapshot the first starts from, the slide's own by default. Resolves with each
      // step's { snap, params, fp, extra? }, or null when the worker failed.)
      run: (steps, from = st?.snap ?? null) => { const out = []; return getCalc().sequence(steps, from, (m) => { out[m.i] = { snap: m.snap, params: m.params, fp: m.fp, extra: m.extra, trail: m.trail }; }).then((end) => (end?.type === 'error' ? null : out)); },
    };
  }
  // A visual's rows: the deck's slides by id ('pvt', or { id, name } to name it), or { preset, name } patients that
  // no slide shows, computed after the slides.
  const rowAt = (o) => { const id = typeof o === 'string' ? o : o.id, i = id ? slides.findIndex((x) => x.id === id) : -1; return [i, i >= 0 ? stateOf[i] : extraOf.get(xKey(o))]; };
  const rowIdx = (s) => (s.of || []).map((o) => rowAt(o)[1]).filter((k) => k != null && k >= 0);
  function rowsOf(s) {
    return (s.of || []).map((o) => {
      const [i, k] = rowAt(o), sl = i >= 0 ? slides[i] : null, x = typeof o === 'object' ? o : {};
      if (k == null || k < 0) return null;
      const title = x.title ?? sl?.title ?? '';
      return { i, k, f: states[k]?.fp, kicker: x.kicker ?? sl?.kicker ?? '', title, name: x.name || title, short: x.short, site: x.site ?? sl?.site, note: x.note, blank: x.blank || [], ref: !!x.ref, vs: x.vs, key: x.key, calm: x.calm || [] };
    }).filter(Boolean);
  }
  // The six levels side by side (visual: 'ladders'), each patient's Gut to heart profile in a cell of its own, the healthy line named
  // on each and the resistance hatched red (one chart everywhere: Mohammad, 21 Oct, "Gut to heart is good, unify it"). Each cell's
  // first row names the site and the cause; no HVPG pill, its chart's bracket shows it (Mohammad, 21 Oct: "fit the name of the cause in
  // the first row ... and get rid of the HVPG, because it's on the graph!").
  // (A phone, upright or sideways, draws each case on one line instead, its readings with the red blocks, the stations named once over
  // them: Mohammad, 21 Oct, "for phone, we should just make it one line with the red block of course, similar to what we had before".
  // Two copies of the names, for a phone on its side's two columns.)
  // (The first row's cause steps down to fit beside the site, never under 12 px on the screen, never wrapped or cut. fitRow measures the
  // laid-out row, the site's width and the gap against the cause's own, not an estimate; a cause that still does not fit at 12 px goes
  // under the site, whole, so no case's cause runs out of its card: causeFit. Mohammad, 21 Oct: "SOS doesn't fit text wise".)
  // (A phone's row also holds the case's HVPG and PPG pills at its right end, which the cause keeps clear of: Mohammad, 23 Oct.)
  const fitRow = (k) => {
    const t = k?.querySelector('.pz-cell-t'), tag = k?.firstElementChild, pills = k?.querySelector('.pz-gpills');
    if (!t || !tag) return;
    t.style.removeProperty('font-size'); k.classList.remove('under');
    if (!readMetric(t, 'offsetWidth')) return;
    // (z: the row's zoom on the screen, so the floor is 12 px there; the room is what the row holds, less 1 px for the three widths' rounding)
    const z = Math.min(2, Math.max(0.5, readBox(k).width / readMetric(k, 'offsetWidth') || 1)), fs = parseFloat(readStyle(t).fontSize) || 12;
    const gap = parseFloat(readStyle(k).columnGap) || 0, room = readMetric(k, 'clientWidth') - readMetric(tag, 'offsetWidth') - gap - (readMetric(pills, 'offsetWidth') ? readMetric(pills, 'offsetWidth') + gap : 0) - 1;
    let fit = causeFit(fs, readMetric(t, 'offsetWidth'), room, 12 / z);
    // (Under the site it has the row to itself, as large as that holds, 12 px at least: with the pills at the row's right it is no longer
    // the stepped-down size of a cause squeezed beside them.)
    if (fit.under) fit = { ...causeFit(fs, readMetric(t, 'offsetWidth'), readMetric(k, 'clientWidth') - 1, 12 / z), under: true };
    if (fit.size !== fs) t.style.fontSize = `${fit.size.toFixed(2)}px`;
    k.classList.toggle('under', fit.under);
  };
  const rowRO = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => fitRow(e.target.closest('.pz-cell-k')))) : null;
  // (A wide screen's chart in each cell is the data card's instrument, drawn once at the instrument's own size and scaled down as one piece to its cell
  // (Mohammad, 28 Oct, Sites 10: "each cell to be the instrument drawn exactly, scaled down"): the same layout, label places, plot shape and
  // relative type; chartScale. Its words never come under 12 px on the screen: where the scale would take them, the picture is drawn in
  // larger type by s and scaled by the same k. The holder takes the scaled height; styles/app.css .pz-cc.)
  const fitChart = (cc, P) => {
    const p = cc?.firstElementChild;
    if (!p) return;
    const s0 = parseFloat(cc.style.getPropertyValue('--lad-s')) || 1, W = readMetric(cc, 'clientWidth'), w0 = readMetric(p, 'offsetWidth'), f0 = (parseFloat(readStyle(p).fontSize) || 0) / s0;
    if (!(W > 0 && w0 > 0 && f0 > 0)) return;
    const { k, s } = chartScale(W, w0, f0), ks = k.toFixed(4), ss = s.toFixed(4);
    if (cc.style.getPropertyValue('--lad-k') !== ks) cc.style.setProperty('--lad-k', ks);
    // (The box stays the instrument's, so a new type size is no change of box: the chart is drawn again for it.)
    if (cc.style.getPropertyValue('--lad-s') !== ss) { cc.style.setProperty('--lad-s', ss); P.redraw(); }
  };
  const chartOf = new WeakMap();
  const chartRO = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => { const c = chartOf.get(e.target); if (c) fitChart(c.cc, c.P); })) : null;
  function laddersGrid(s) {
    const grid = h('div', { class: 'pz-grid' });
    grid.append(h('div', { class: 'pz-grid-head', 'aria-hidden': 'true' }, createProfileStrip(true).el, createProfileStrip(true).el));
    for (const r of rowsOf(s)) {
      if (!r.f) continue;
      const P = createProfileTool(), S = createProfileStrip();
      P.configure({ kind: 'profile' }, { fp: r.f, healthy: () => base });
      S.set(r.f, () => base);
      // (A phone shows the case's HVPG and PPG as two pills at the right of this row, tinted as the chart's brackets rate them; a wide screen's
      // chart carries them, so there they stay hidden: styles/app.css .pz-gpills.)
      const k = h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': r.site || 'none' }, headOf(r)),
        h('div', { class: 'pz-cell-t' }, r.name),   // (a row's `name` where its title is too long for the first row: Sites 10 "Sinusoidal obstr. synd.")
        h('div', { class: 'pz-gpills' }, pillReadings(r.f).map((q) => h('span', { class: 'pz-gpill', 'data-k': q.k, 'data-rate': q.rate }, h('span', { class: 'k' }, `${q.name} `), q.v))));
      rowRO?.observe(k); for (const c of k.children) rowRO?.observe(c);   // (and the site, the cause and the pills themselves: a font loading late widens them, not the row)
      const cc = h('div', { class: 'pz-cc' }, P.el);
      chartOf.set(cc, { cc, P }); chartOf.set(P.el, { cc, P });
      chartRO?.observe(cc); chartRO?.observe(P.el);   // (the room it has, and the instrument's own size, which follows the window)
      grid.append(h('div', { class: 'pz-cell' }, k, cc, S.el));
    }
    // (The panel's dimming while one cell is zoomed: out of the grid's flow, over the panel and under the cell that is zoomed; styles/app.css .pz-gscrim.)
    grid.append(h('div', { class: 'pz-gscrim', 'aria-hidden': 'true', onclick: () => ui?.zoom.close().then(paintZoom) }));
    return grid;
  }
  // Purpose-drawn arrows: a solid head on a shaft of real weight, one per symbol; a large change is two arrows side by side.
  // A thin dash means unchanged / normal. Drawn on one grid so they sit on the table's cap height. n: 2 / 1 up, -1 / -2 down, 0 the dash.
  // A change's arrow: one, two, or a level dash, drawn by the stylesheet as plain shapes (app.css .pz-ag: a clip path on a box of
  // its colour, no SVG), composited with the card's own layer.
  function arrowEl(n) {
    const el = document.createElement('span'), m = Math.abs(n);
    el.className = `pz-arr${n < 0 ? ' dn' : ''}${n === 0 ? ' zero' : ''}${m === 2 ? ' two' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    const g = document.createElement('i');
    g.className = 'pz-ag';
    for (let k = 0; k < Math.max(1, m); k++) g.append(document.createElement('i'));
    el.append(g);
    return el;
  }
  // A cell that cannot be measured: a hollow ring, never the dash that means normal.
  const noneEl = () => h('span', { class: 'pz-nm', 'aria-hidden': 'true' });
  // A cell whose patient is still being computed: empty (never "…": no ellipsis anywhere), said so to a screen reader; its numbers fade in
  // when the patient arrives (watchRows).
  // (R15: not blank, and the width of a number: a bar the size of a value, faint, so the row keeps its height and the column its width when the
  // number arrives; the screen reader still hears 'calculating'.)
  const pendEl = () => h('td', { class: 'num pend', 'aria-busy': 'true' }, h('span', { class: 'pz-pendbar', 'aria-hidden': 'true', style: { display: 'inline-block', width: '2.4em', height: '.55em', borderRadius: '.3em', background: 'currentColor', opacity: '0.22', verticalAlign: '-.05em' } }), h('span', { class: 'sr-only' }, 'calculating'));
  // A legend line with its symbols drawn as the table's own: arrows, the dash (•) and the ring (○).
  const withArrows = (t) => t.split(/(↑↑|↓↓|↑|↓|•|○)/).map((x) => (x === '↑↑' ? arrowEl(2) : x === '↓↓' ? arrowEl(-2) : x === '↑' ? arrowEl(1) : x === '↓' ? arrowEl(-1) : x === '•' ? arrowEl(0) : x === '○' ? noneEl() : x));
  const WORD = { 2: 'well above normal', 1: 'above normal', 0: 'normal', '-1': 'below normal', '-2': 'well below normal' };
  const WORDREL = { 2: 'much higher', 1: 'higher', 0: 'unchanged', '-1': 'lower', '-2': 'much lower' };
  const unitOf = (k) => (k === 'varix' || k === 'gv' ? ' mm' : k === 'asc' ? ' L' : k === 'liver' || k === 'shunt' ? '%' : k === 'hr' ? '/min' : k === 'res' ? ' mmHg per L/min' : PRESS.has(k) ? ' mmHg' : TILE[k]?.u ? ` ${TILE[k].u}` : '');
  const UNIT_WORDS = { press: 'pressures in mmHg', varix: 'varix in mm', gv: 'fundal varix in mm', asc: 'ascites in liters', liver: 'liver blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10³/µL',
    lsm: 'stiffness in kPa', ssm: 'spleen stiffness in kPa', hr: 'heart rate in beats/min', pvFlow: 'portal flow in L/min', res: 'liver resistance in mmHg per L/min', spleen: 'spleen in cm', co: 'cardiac output in L/min', bv: 'blood volume in L' };
  const colExt = (k) => (!COLS[k] && Object.hasOwn(EXT.columns, k) ? EXT.columns[k] : null);
  // How wide a table wants to be, in em of its body text: the row names, each value column, a Doppler trace's column, the ascites pair
  // and each note column. The wide card is this wide (never wider than the reading width), so the columns stand close to their content.
  function tableUnits(s) {
    const cols = s.cols || [], notes = s.note ? [s.note].flat().length : 0;
    return 14 + cols.reduce((a, k) => a + (k === 'wave' ? 14 : 8), 0) + ((s.asc ?? !s.cols) ? 16 : 0) + (s.cols ? 0 : 56) + 14 * notes;
  }
  function summaryTable(s, arrived = -1) {
    const cols = s.cols || ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], ascCols = s.asc ?? !s.cols, rows = rowsOf(s);
    const perRow = rows.some((r) => r.vs), rel = s.vs === 'first' || perRow;
    const notes = s.note ? [s.note].flat() : [];
    // Pressures always in whole mmHg (the model is not that precise); litres, kPa and flow keep their decimal.
    const val = (k, f) => { const v = fpv(k, f); return v == null ? '—' : PRESS.has(k) ? fmt(v, 0) : k === 'res' ? fmt(v, 1) : tileVal(k, v); };
    const first = rows[0]?.f;
    // A row's 'vs' names a slide, or the key of a patient row no slide shows (the same liver without collaterals).
    const vsRow = (r) => rows.find((x) => x.key === r.vs || (x.i >= 0 && slides[x.i]?.id === r.vs));
    const refOfRow = (r) => (r.vs ? vsRow(r)?.f ?? fpOf(r.vs) : first);
    // (Lower-cased mid-sentence, but an acronym such as CSPH or TIPS stays as it is.)
    const lc = (t) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
    const vsName = (r) => { const t = vsRow(r); return lc(t?.title || slides.find((x) => x.id === r.vs)?.title || ''); };
    // The reference row (the healthy patient, or the baseline) keeps its numbers, the anchor for the arrows.
    const isRef = (r, n) => !!r.ref || (rel && !r.vs && n === 0);
    // focusRow (V15, opt-in): lights one row; the others recede.
    const focus = focusOf(s);
    const cell = (k, r, n) => {
      if (r.blank.includes(k)) return h('td', { class: 'num blank', title: 'Not measurable' }, noneEl(), h('span', { class: 'sr-only' }, 'not measurable'));
      if (!r.f || (rel && !isRef(r, n) && !refOfRow(r))) return pendEl();
      if (k === 'spleen' && !(fpv(k, r.f) > 0)) return h('td', { class: 'num none' }, 'Removed');
      if (isRef(r, n)) return h('td', { class: 'num ref', 'data-rate': rel ? null : rateAbs(k, dirAbs(k, r.f)) }, val(k, r.f));
      const ref = refOfRow(r), d = rel ? (ref ? dirRel(k, r.f, ref) : 0) : dirAbs(k, r.f), v = val(k, r.f) + unitOf(k);
      // Against normal, the colour follows the arrows (amber above, red well above); against a baseline, better or worse,
      // except where a change is neither ('calm': a meal's small PPG rise, the HVPG's dip as a clot diverts portal flow).
      const calm = (s.calm || []).includes(k) || r.calm.includes(k);
      return h('td', { class: 'num dir' + (d ? '' : ' zero') + (rel ? ' rel' : ''), 'data-rate': rel ? null : rateAbs(k, d), 'data-eff': rel && !calm ? effOf(k, d) : null, title: v },
        arrowEl(d), h('span', { class: 'sr-only' }, `${rel ? WORDREL[d] : WORD[d]}, ${v}`));
    };
    // A column a deck visuals package registers (slide-ext.js columns) for a key the table does not know: its heading, cut-off note,
    // unit words and cells are its own; a row not yet computed waits, and a row's blank columns show the ring, as the others do.
    const extCell = (k, r, n) => {
      if (r.blank.includes(k)) return h('td', { class: 'num blank', title: 'Not measurable' }, noneEl(), h('span', { class: 'sr-only' }, 'not measurable'));
      if (!r.f) return colExt(k).pend?.() ?? pendEl();
      const c = safe(() => colExt(k).cell({ ...r, state: states[r.k] ?? null, ref: refOfRow(r) ?? null, isRef: isRef(r, n) }, ctxOf(s, slides.indexOf(s))), null, `columns.${k}`);
      return c?.tagName === 'TD' ? c : h('td', { class: 'num' }, c ?? '—');
    };
    // Ascites as two columns, SAAG and protein, one arrow each; "None" spans both when there is no fluid.
    const ascCells = (r, n) => {
      if (!r.f) return [pendEl(), pendEl()];
      if (r.f.asc < NO_ASC) return [h('td', { class: 'num none', colspan: '2' }, 'None')];
      const hiS = r.f.saag >= 1.1, hiP = r.f.tp >= 2.5;
      if (isRef(r, n)) return [h('td', { class: 'num ref', 'data-rate': hiS ? 'hi' : null }, fmt(r.f.saag, 1)), h('td', { class: 'num ref' }, fmt(r.f.tp, 1))];
      return [h('td', { class: 'num dir', 'data-rate': hiS ? 'hi' : null, title: `SAAG ${fmt(r.f.saag, 1)} g/dL` }, arrowEl(hiS ? 1 : -1), h('span', { class: 'sr-only' }, `SAAG ${hiS ? '1.1 or more' : 'under 1.1'}, ${fmt(r.f.saag, 1)}`)),
        h('td', { class: 'num dir', title: `Protein ${fmt(r.f.tp, 1)} g/dL` }, arrowEl(hiP ? 1 : -1), h('span', { class: 'sr-only' }, `protein ${hiP ? '2.5 or more' : 'under 2.5'}, ${fmt(r.f.tp, 1)} g/dL`))];
    };
    // One legend, built from the table itself: what the arrows compare with, the reference row's units, the ring.
    const units = [...new Set(cols.map((k) => (PRESS.has(k) ? 'press' : k)).filter((k) => UNIT_WORDS[k]))].map((k) => UNIT_WORDS[k]);
    for (const k of cols) if (colExt(k)?.unit) units.push(colExt(k).unit);
    if (ascCols) units.push('SAAG and protein in g/dL');
    const refTitle = first ? lc(rows[0].title) : 'the baseline';
    const key = rel
      ? `↑ higher, ↓ lower than ${perRow ? 'the row named under each' : refTitle}; ↑↑ ↓↓ by ≥40%; • unchanged${cols.some((k) => k !== 'pvFlow') ? '. Green better, red worse' : ''}`
      : `↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off of that column (tap a heading for it); • within normal`;
    const legend = [key, rows.some((r) => r.blank.length) ? '○ not measurable' : '', units.length && rows.some((r, n) => isRef(r, n)) ? `Top row: ${units.join(', ')}` : '', s.foot || '']
      .filter(Boolean).map((x) => x.replace(/\.$/, '')).join('. ') + '.';
    // A heading's cut-offs: its tooltip on hover, and a line under the legend on a tap (a touch screen shows no tooltip).
    const cutLine = h('span', { class: 'pz-cutl' });
    const showCut = (k) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); e.stopPropagation?.(); cutLine.replaceChildren(h('b', {}, `${COLS[k] || colExt(k)?.heading || k}: `), ...withArrows((CUT[k] ?? colExt(k)?.cut) + '.')); } };
    const cutTh = (k, label, cut) => h('th', { class: 'num', title: cut || null, ...(cut ? { tabindex: '0', onclick: showCut(k), onkeydown: showCut(k) } : {}) }, label);
    const go1 = (r) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); go(r.i); } };
    // (long: seven rows or more; a class, not :has(), which made every table cell part of each restyle the page did)
    // (notecols: few enough columns that an upright tablet keeps each note in a column of its own under its heading, as on its side)
    const noteCols = notes.length && cols.length + (ascCols ? 2 : 0) + notes.length <= 4;
    // (A row under one with the same heading in the same site's colour is a continued row (pz-cont): the heading is printed once, over the first of
    // them, and the rest follow it under a lighter rule, so the learner reads "Non-selective beta-blocker" once, not twice. It stays in the
    // row for a screen reader (the phone's compact rows show the heading over the name in words too, no stroke). table-continued-rows.test.js)
    const el = h('div', { class: 'pz-table' + (rows.length >= 7 ? ' long' : '') + (noteCols ? ' notecols' : '') + (focus ? ' pzv-focused' : '') }, h('table', { style: { '--nc': String(cols.length + (ascCols ? 2 : 0)), '--nn': String(notes.length), '--asc-w': '0px' } },
      h('thead', {}, h('tr', {}, h('th', {}, s.rowHead || 'Level'), cols.map((k) => cutTh(k, COLS[k] || colExt(k)?.heading || k, CUT[k] ?? colExt(k)?.cut)),
        ascCols ? [cutTh('saag', h('abbr', { title: 'Serum−ascites albumin gradient' }, 'SAAG'), CUT.saag), cutTh('tp', h('abbr', { title: 'Ascites protein' }, 'Prot.'), CUT.tp)] : null,
        notes.map((x) => h('th', { class: 'nh' }, x)))),
      h('tbody', {}, rows.map((r, n) => h('tr', { ...(r.i >= 0 ? { tabindex: '0', onclick: go1(r), onkeydown: go1(r), 'aria-label': `${r.title}: go to this slide` } : {}),
          class: [r.i >= 0 ? '' : 'static', focus && (r.key === focus || (r.i >= 0 && slides[r.i]?.id === focus)) ? 'pzv-focus' : '', sameHead(rows[n - 1], r) ? 'pz-cont' : ''].filter(Boolean).join(' ') || null,
          'data-arrived': r.k === arrived || (rel && n > 0 && (r.vs ? vsRow(r)?.k : rows[0].k) === arrived) ? '' : null },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': r.site || 'none' }, headOf(r)), h('span', { class: 'tw' }, h('span', { class: 'tn' }, nb(r.title)),
          r.vs ? h('span', { class: 'vs' }, `vs ${vsName(r)}`) : null)),
        cols.map((k) => (colExt(k) ? extCell(k, r, n) : cell(k, r, n))),
        ascCols ? ascCells(r, n) : null,
        notes.map((_, j) => h('td', { class: 'note' }, [r.note].flat()[j] || '')))))),
    h('p', { class: 'pz-foot' }, withArrows(legend), cutLine));
    watchRows(el, s);
    return el;
  }
  // (A visual a deck visuals package registers (slide-ext.js visuals) is called with the slide and its context; the app's own win.)
  const visualOf = (s, i) => (VISUALS[s.visual] ? VISUALS[s.visual](s) : safe(() => EXT.visuals[s.visual](s, ctxOf(s, i)), null, `visuals.${s.visual}`));
  const VISUALS = {
    table: summaryTable,
    ladders: laddersGrid,
    scale: (s) => scaleVisual(s.scale, rowsOf(s)),
    quadrant: (s) => quadrantVisual(rowsOf(s)),
    walls: () => wallsVisual(),
    // The closing quick check: a few questions to answer from memory; a tap on one shows its answer.
    check: (s) => h('ol', { class: 'pz-check' }, s.checks.map(([q, a], k) => {
      const li = h('li', {}, h('button', { type: 'button', class: 'pzc-q', 'aria-expanded': 'false', 'aria-controls': `pzc-a${k}`,
        // (the answer slides down out from under its question and the rest of the list with it, by transform: fold-slide.js)
        onclick: (e) => { const on = !li.classList.contains('open'); e.currentTarget.setAttribute('aria-expanded', String(on)); slideFold({ item: li, inner: li.querySelector('.pzc-a > p'), root: li.parentElement?.parentElement, open: on, set: (v) => li.classList.toggle('open', v), ms: D_SURFACE }); } },
      h('span', { class: 'pzc-t' }, q), h('span', { class: 'pzc-hint', 'aria-hidden': 'true' }, 'Show answer')),
      h('div', { class: 'pzc-a', id: `pzc-a${k}` }, h('p', {}, a)));
      return li;
    })),
    outline: (s) => h('div', { class: 'pz-outline' },
      h('section', {}, h('h2', { class: 'pz-sub' }, 'Outline'), h('ol', {}, s.outline.map((k) => h('li', {}, k)))),
      s.objectives.length ? h('section', { class: 'pzo-obj' }, h('h2', { class: 'pz-sub' }, 'By the end you can'), h('ul', {}, s.objectives.map((o) => h('li', {}, o)))) : null),
  };

  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  // An upright phone, or a tablet held upright, stacks the words under the figure and the data card over it; a tablet on its
  // side and any phone on its side keep the words at the left and the data card at the right (a small phone on its side had
  // no height for the two stacked). An upright tablet's cards take 70% of the width (class `tab`), centred.
  // (The same breakpoints as the style sheet's (util.js): a 700–767 px window or a near-square upright one stacked by the CSS
  // while these said wide, and the text card took the wrong fit floor and Compact step.)
  const stackMQ = matchMedia(STACK_MQ), shortMQ = matchMedia(SHORT_SIDE_MQ), tabMQ = matchMedia(TABLET_UP_MQ);
  const tabUp = () => tabMQ.matches;
  const phone = () => stackMQ.matches && !shortMQ.matches;
  // Which pill the screen takes (paintChrome): a phone's, an upright tablet's (with back and next) or a wide screen's.
  const pillKind = () => (phone() ? (tabUp() ? 'tab' : 'phone') : 'wide');
  // ── The data card slides out of view and back ──
  // Drag or swipe it away (up on a phone, to the right on a tablet; to the left when it sits under the words) and a sliver
  // stays at the edge: a tap or a drag on the sliver brings it back. It follows the finger, eases to rest, and stays put from
  // slide to slide until brought back. (Driven from script, frame by frame: the card is frosted glass.)
  const GRIP = 34;
  // On a laptop or tablet, and on a phone held sideways (I23, 17 Oct), the words sit on a floating card like the data card (false:
  // the full-height glass panel at the left edge). (An upright phone keeps its words' panel at the foot either way.)
  const TEXT_CARD = true;
  const SHORT_H = 860;   // (a wider screen this tall or less takes the compact layout, .pz.short: css px)
  const SIDEWAYS_WORDS = [[0.62, 0.8], [0.58, 0.72], [0.54, 0.64], [0.5, 0.58]];   // (the words' card's extra steps on a phone held sideways: title and words scales, below Compact)
  const LOW_M = 10;   // (a phone held sideways: its teaching card's margin from the top and bottom, css px; styles/app.css .pz.low)
  // (auto: closed by the layout, a slide whose card does not fit beside the words and the figure; autoKey: the slide it closed on.
  // A card the reader closed stays closed from slide to slide; one the layout closed opens again on the next slide that fits.)
  // (down: on an upright phone or tablet, the slide whose readings' card was just tucked away by a tap on the handle, so the next tap closes
  // the instrument card; cleared when the card opens again and by a new slide.)
  // (lvl: how far out the card is docked, 0 open, 1 closed. During a glide the browser plays it (an animation of the card's translate, on the
  // compositor, dockGlide), and lvl is read from that animation's clock, so no script runs per frame; a finger, a resize or a new glide
  // takes it from there (dockHalt).)
  let lvlSet = 0, glide = null;
  const dock = { get lvl() { return glide ? glideLvl() : lvlSet; }, set lvl(v) { if (glide) dockHalt(); lvlSet = v; }, to: 0, raf: 0, auto: false, autoKey: '', down: -1 };
  let sheetPull = null;   // (the readings' own pull, foldTouch: the closed card's pull carried on brings them out after it)
  // A phone's instrument card with readings shows the instrument first and keeps its tiles (or pressure strip) on a sheet tucked
  // under it: the sheet's edge (LIP px, .pz-lip) shows below the card and carries the handle (Mohammad, 17 Oct: "round 2 A"; "I thought
  // the Doppler will show first with an indication for a card under it?"). Pulled down or tapped, the sheet comes out flush with
  // the card; pushed up, the card slides away to its handle. No Show or Hide.
  const LIP = 24;
  const lipOn = (d) => d.classList.contains('pz-sheet') && !d.classList.contains('tool-open');
  // An upright phone or tablet opens the readings on a card of their own under the instrument's (Mohammad, 17 Oct: "The top data
  // card doesn't truly open as an extended card under the Doppler. It should. ... first close up is to close this under side card";
  // the iPhone too, 17 Oct): the one card's glass is drawn as two pieces (styles/app.css .pz.stack.stack .pz-sheet), the
  // instrument's and the readings'. A push up, or a tap on the handle, from fully open tucks the readings' card away; the next closes
  // the instrument card. A pull down on the closed card brings the instrument card out, and the same pull carried on brings the
  // readings' card out after it (dockTouch, sheetPull: "if I keep sliding I can open both in one swipe").
  // (Mac and iPad landscape too, the data card stacked under the words (pz-wide): the same two cards, its readings' card out as a slide
  // comes in (Mohammad, 22 Oct: "is there a way to build something similar for mac and ipad, stacked card to show the main card and the
  // stacked card behind it"). There the readings' card is tucked behind the instrument card's top edge, its handle on top, and comes out
  // upward: the words' card rises with it and comes back down as it tucks away (Mohammad, 22 Oct: "make so I open the stacked card untuck
  // it to the TOP not to the bottom. Cuz that's easier to pull up and the teaching card goes up"; slip.lift, liftTo).)
  const splitSheet = (d) => !!ui && (ui.root.classList.contains('stack') || ui.root.classList.contains('pz-wide')) && d.classList.contains('pz-sheet');
  const wideSheet = (d) => !!ui?.root.classList.contains('pz-wide') && d.classList.contains('pz-sheet');
  // The readings' card slides out from behind the instrument card and back under it, one solid piece (Mohammad, 17 Oct: "The secondary
  // card should actually be hidden underneath the other card not just pop into existence"): --pz-u on the card is how far out it is,
  // set frame by frame by the finger or here, never by a CSS transition (the card is frosted glass); styles/app.css works out both
  // pieces of glass, the readings' place and where they are cut at the instrument card's foot from it. (d: how far it travels, the
  // readings' share of the card's height; h0: the card's height with them tucked, css px; raf: the ease running.)
  const slip = { d: null, h0: null, raf: 0, lift: 0, base: 0 };
  // (Mac and iPad landscape: the stacked card's height cap is the room under the words and its readings' card's tucked edge, grown by what
  // is out of the readings (--pz-grow, styles/app.css), so the instrument is fitted to the tucked room and keeps that size open or tucked.)
  // (A Gut to heart chart too tall for it grows the cap by slip.base, the room the pair rises by: below.)
  // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
  const capOf = (d, room) => (wideSheet(d) ? `calc(${(room + slip.base).toFixed(1)}px + var(--pz-grow, 0px))` : `${room.toFixed(1)}px`);
  // (The rise, frame by frame with the readings' card: u of the way out lifts the words' card, its glass and the data card's box by u of
  // slip.lift, the readings' travel (layout), so the instrument card stays where it is and the readings come out above it; tucking them
  // brings everything back down the same way. A translate, never their top, which eases on its own.)
  // (slip.base: the rise a Gut to heart chart needs whatever the readings do, its tucked card being taller than the room under the words; the
  // readings add the rest of slip.lift on top, by u.)
  // (Two rises: --pz-lift, the readings' travel, carries the box and the handle, so the instrument card stays put; --pz-rise, the words' card
  // and its glass, is LIP less of the readings' travel: the readings' card already shows its LIP-px edge above the instrument card tucked, so
  // out it needs LIP less than the instrument card's rise to stand the same gap under the words, tucked or out (Mohammad, 22 Oct: "the distance
  // between the untucked and tucked card and teaching card should remain consistent"; it was LIP more out, about 110 px beside 60 px.))
  // (Written on the cards that rise, never on the stage's box: a custom property there is inherited by the whole figure, so each frame of
  // a slide restyled every vessel, and the stage, which watches its box's style, dropped its style snapshot and synced every vessel again,
  // about 10 frames a second on a Mac, Mohammad, 25 Oct: "moving the cards up sliding tucking untucking is very very laggy".)
  // (The glass's view of those rises (glass-gl.js cards.shift): where app.css turns --pz-rise and --pz-lift into a translate, the move they
  // make, from the inline value as written this frame; null where no rule moves the element.)
  // (Cards are glass (Mohammad, 2 Nov 2026: "CARDS ARE GLASS"): a card zoomed up (card-zoom.js data-zoomed) keeps its GPU frost, its panes read
  // at the zoom's scale (sheet-glass.js) and again in each frame of its glide (glass-gl.js LIVE_READ); the words, their glass and the stage's
  // labels step out from under it (app.css .pz-zoomed), so only the frosted figure lies behind it.)
  const risePx = (el, name) => parseFloat(el.style.getPropertyValue(name)) || 0;
  const riseShift = (el) => {
    if (!ui) return null;
    const wide = ui.root.classList.contains('pz-wide');
    const v = el === ui.shade ? (el.classList.contains('pz-card') && !el.classList.contains('stack') && !el.classList.contains('low') ? risePx(el, '--pz-rise') : 0)
      : el === ui.text ? (wide ? risePx(el, '--pz-rise') : 0)
        : el === ui.data ? (wide && el.classList.contains('col') ? risePx(el, '--pz-lift') : 0) : 0;
    return v ? [0, -v] : null;
  };
  // (The two cards a rise is written on, kept and refilled in place: a rise is written every frame the readings slide.)
  const riseOn = (() => {
    const lift = [null, null], words = [null, null];
    return (name) => { if (name === '--pz-lift') { lift[0] = ui?.data; lift[1] = ui?.lip; return lift; } words[0] = ui?.text; words[1] = ui?.shade; return words; };
  })();
  const setRise = (name, w) => { const v = w > 0.5 ? `${w.toFixed(1)}px` : ''; for (const el of riseOn(name)) if (el && el.style.getPropertyValue(name) !== v) { if (v) el.style.setProperty(name, v); else el.style.removeProperty(name); } };
  // (The words' card while a card is zoomed: it stays at its tucked, original place, whatever the readings do under the zoom, and the rise
  // owed to them is taken up once the card is back (Mohammad, 28 Oct: "when the stacked cards are zoomed in and i untuck the stacked card, the
  // TEACHING card in the background is reacting still by going up; ... if the stack is unstacked, and i zoom into it, the teaching card should go
  // back to original location"). words.held: the zoom is up, so the words' rise is slip.base alone; u, trav: the readings' last place and travel
  // (liftTo), what the rise is once released; now: the rise as written.)
  // (A change of that rise that is the zoom's, not a finger's or a slide's, is eased by wordsGlide: the rise is written at once, where it ends,
  // and the card's translate is animated from where it stands to it, in step with the zoom's glide. A rise written per frame by liftTo takes
  // the glide's place.)
  const words = { held: false, u: 0, trav: 0, now: 0, anims: [] };
  const wordsAt = () => slip.base + (words.held ? 0 : words.u) * Math.max(0, words.trav - LIP);
  const stopWords = () => { for (const a of words.anims) a.cancel(); words.anims.length = 0; };
  const setWords = (w) => { if (Math.abs(w - words.now) > 0.5) stopWords(); words.now = w; setRise('--pz-rise', w); };
  function wordsGlide(ms) {
    const to = wordsAt(), els = [ui?.text, ui?.shade].filter(Boolean), from = els.map((el) => readStyle(el).translate), moves = Math.abs(to - words.now) > 0.5;
    stopWords();
    words.now = to; setRise('--pz-rise', to);
    if (!ms || !moves) return;
    slideTell();
    els.forEach((el, i) => {
      const a = el.animate?.([{ translate: from[i] }, { translate: readStyle(el).translate }], { duration: ms, easing: EASE_ARRIVE });
      if (!a) return;
      words.anims.push(a);
      a.onfinish = () => { if (words.anims.includes(a)) { words.anims = words.anims.filter((x) => x !== a); if (!words.anims.length) dispatchEvent(new Event('pps:occ')); } };
    });
  }
  const slideFrame = new Event('pps:slideframe');   // (the glass reads the readings' card's panes in this frame: glass-gl.js onSlideFrame)
  const liftTo = (u) => { const trav = Math.max(0, slip.lift - slip.base), f = u > 0 ? u : 0; setRise('--pz-lift', slip.base + f * trav); words.u = f; words.trav = trav; setWords(wordsAt()); zoomFollow(f, trav); };
  // (Told when the readings' card starts to move, so the Doppler probe is placed against the cards frame by frame as they go: stage.js dprTrack.)
  const slideTell = () => dispatchEvent(new Event('pps:slide'));
  const underU = (d) => (d.classList.contains('pz-sliding') ? parseFloat(d.style.getPropertyValue('--pz-u')) || 0 : d.classList.contains('tool-open') ? 1 : 0);
  function slideUnder(from, to, ms = 360) {
    const d = ui.data;
    cancelFrame(slip.raf);
    if (reduce.matches) ms = 0; else ms *= Math.max(0.4, Math.abs(to - from));
    // alloc-rare: the readings slide begins: once per slide of the card, not per frame
    d.classList.add('pz-sliding'); d.style.setProperty('--pz-u', from.toFixed(4)); liftTo(from); slideTell(); camAt(from);   // (camAt: the view with the card, camFollow)
    const t0 = performance.now();
    // alloc-rare: the readings slide begins: once per slide of the card, not per frame
    const step = (now) => {
      const t = ms ? clamp((now - t0) / ms, 0, 1) : 1;
      if (t < 1) { const u = from + (to - from) * (1 - (1 - t) ** 3); d.style.setProperty('--pz-u', u.toFixed(4)); liftTo(u); camAt(u); slip.raf = nextFrame(step); }
      else stopUnder();
      dispatchEvent(slideFrame);
    };
    slip.raf = nextFrame(step);
  }
  // (At rest the card's class says where the readings are: tool-open, out.)
  function stopUnder() {
    cancelFrame(slip.raf);
    if (!ui?.data.classList.contains('pz-sliding')) return;
    ui.data.style.removeProperty('--pz-u'); ui.data.classList.remove('pz-sliding'); liftTo(underU(ui.data)); camAt(underU(ui.data));
  }
  // How far the readings' card travels: the card's height with them out less its height without them, read in the card's own px (its
  // parts are zoomed by the fit, so their own boxes are not read). (--pz-o: a second part's place under the first, for its cut.)
  function measureUnder(d) {
    // (Never while the card is zoomed to the middle: it answers for the place it rests, so with the readings in and out it reads the same
    // height, their travel comes out none, --pz-d 0, and their room opens above the header: a big empty card running off the bottom. It is
    // measured again the moment the card is back, zoomSettled.)
    if (zoomOn()) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const parts = [...d.children].filter((c) => c.matches('.pz-tiles') && readStyle(c).display !== 'none');
    if (!parts.length || !readRects(d).length) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const kw = readBox(wrap).width / (readMetric(wrap, 'clientWidth') || 1) || 1, hh = () => readBox(d).height / kw;
    // (Without the card's height cap, which is the tucked card's: out, the card is fitted again. The card's own style changes only
    // for the measure, so its watcher is not told: told, it measured again, for ever.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const was = parts.map((c) => c.style.cssText), cap = d.style.maxHeight;
    d.style.maxHeight = 'none';
    parts[0].style.marginTop = wideSheet(d) ? '16px' : '14px';   // (out: styles/app.css)
    // (A part after the first rides under it with no travel of its own: the bleed clock's row, removed 30 Oct. Measured with the card's --pz-d in its
    // margin, the travel read back changed the travel, every write of --pz-d told the watcher again, and the page froze: Variceal bleed 3 to 4.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const c of parts.slice(1)) c.style.marginTop = '0px';
    const h1 = hh(), z = (parseFloat(readStyle(parts[0]).zoom) || 1) * kw;
    const o = parts[1] ? (readBox(parts[1]).top - readBox(parts[0]).top) / z : 0;
    for (const c of parts) c.style.display = 'none';
    const h0 = hh();
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    parts.forEach((c, i) => { c.style.cssText = was[i]; });
    d.style.maxHeight = cap; ui.lipMO?.takeRecords();
    slip.h0 = h0;
    // (Judged against the card's own --pz-d, never only the last measure: a deck started again builds a new card, and one whose
    // readings travel as far as the last deck's had none, so its readings' card stood out unpulled: Liver inflow 2, 18 Oct.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (Math.abs((slip.d ?? -1) - (h1 - h0)) > 0.05 || !d.style.getPropertyValue('--pz-d')) { slip.d = h1 - h0; d.style.setProperty('--pz-d', `${slip.d.toFixed(2)}px`); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (parts[1] && parts[1].style.getPropertyValue('--pz-o') !== `${o.toFixed(2)}px`) parts[1].style.setProperty('--pz-o', `${o.toFixed(2)}px`);
  }
  // The screen's right safe-area inset, read once from a zero-size probe (an unregistered custom property hands env() back unresolved) and again after a resize.
  let insetRight = null, insetLeft = null;
  addEventListener('resize', () => { insetRight = null; insetLeft = null; });
  // (The left one too: a phone on its side keeps its cards clear of the Dynamic Island, 3 Nov 2026.)
  const insetL = () => {
    if (insetLeft == null) {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px)';
      document.body.append(p); insetLeft = parseFloat(readStyle(p).paddingLeft) || 0; p.remove();
    }
    return insetLeft;
  };
  const insetR = () => {
    if (insetRight == null) {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;padding-right:env(safe-area-inset-right,0px)';
      document.body.append(p); insetRight = parseFloat(readStyle(p).paddingRight) || 0; p.remove();
    }
    return insetRight;
  };
  const dockVec = () => {
    const d = ui.data;
    // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
    if (phone()) return [0, GRIP - (lipOn(d) ? LIP : 0) - (readMetric(d, 'offsetTop') + readMetric(d, 'offsetHeight'))];   // (closed: the sheet's edge and 10 px of the card show)
    // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
    if (d.classList.contains('under') || d.classList.contains('col')) return [GRIP - (readMetric(d, 'offsetLeft') + readMetric(d, 'offsetWidth')), 0];
    // (A phone on its side: the strip that stays on show, and its handle, sit inside the island's or notch's inset, not under it.)
    // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
    return [readMetric(wrap, 'clientWidth') - GRIP - (ui.root.classList.contains('low') ? insetR() : 0) - readMetric(d, 'offsetLeft'), 0];
  };
  // (Where the closed card goes, read at rest: by the layout, as a glide starts and as a finger lands. A glide's or a drag's frames
  // only write transforms from it, never read the page. Its offsets are the card's resting box: its translate never changes them.)
  // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
  const dockRest = () => (dock.vec = ui && !ui.data.hidden ? dockVec() : [0, 0]);
  const DOCK_ZERO = [0, 0];
  let rtEl = null, rtX = NaN, rtY = NaN, rtTo = NaN;   // (dockPaint: the rest place last written, and on which card)
  // (A wide screen's stacked pair keeps its rise, --pz-lift, while the card docks: styles/app.css.)
  const dockPos = (lv) => {
    const vec = dock.vec || DOCK_ZERO, x = vec[0], y = vec[1];
    const ly = wideSheet(ui.data) ? ' - var(--pz-lift, 0px)' : '';
    // alloc-rare: a place for the card is written at rest, as a glide starts or lands or a finger moves it, never per frame of a glide
    return lv ? `${(x * lv).toFixed(1)}px ${ly ? `calc(${(y * lv).toFixed(1)}px${ly})` : `${(y * lv).toFixed(1)}px`}` : '';
  };
  const dockPaint = () => {
    if (!ui) return;
    const vec = dock.vec || DOCK_ZERO, x = vec[0], y = vec[1];
    // (During a glide the card's place is where the frames have it now: glideStep writes it each frame.)
    ui.data.style.translate = dockPos(dock.lvl);
    // (Where the glide ends: the camera frames for the card there, util.js translateRest, never where it stands this frame.)
    // (Where it ends is written when the card, its place or its target changes, not on each frame of a glide or a drag.)
    if (rtEl !== ui.data || rtX !== x || rtY !== y || rtTo !== dock.to) {
      rtEl = ui.data; rtX = x; rtY = y; rtTo = dock.to;
      // alloc-rare: only when the card, its rest place or its target changed
      ui.data.dataset.restTranslate = `${(x * dock.to).toFixed(1)} ${(y * dock.to).toFixed(1)}`;
    }
    ui.data.classList.toggle('docked', dock.to === 1);
    dockFade(dock.to === 1);
    lipPaint();
  };
  // A closed card shows only its glass edge and handle: its contents fade out as it goes and back in as it comes out (the sliver
  // had shown the cut-off foot of its readings, under the preview badge too). By the Web Animations API, over the parts' own
  // transitions; a part that arrives while the card is closed (the next slide's) is faded at once.
  const DOCK_FADE = { duration: D_SMALL, easing: EASE_ARRIVE, fill: 'forwards' };
  // (Under a finger the contents follow the card instead: fully there once it is a third of the way out, so a slow pull shows the
  // chart as it comes, never an empty glass until the finger lets go (Mohammad, 1 Nov 2026: "it's empty before it renders"). A paused
  // animation held at the drag's level, so neither the parts' own transitions nor a frame's lag come between the finger and them.)
  const dockShows = () => clamp((1 - dock.lvl) / 0.35, 0, 1);
  function dockFade(shut) {
    for (const c of ui.data.children) {
      if (c.classList.contains('pz-grip') || !c.animate) continue;
      if (dock.drag) {
        if (!c._dockHand) {
          if (c._dockFade) { c._dockFade.cancel(); c._dockFade = null; }
          // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
          c._dockHand = c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, fill: 'both' }); c._dockHand.pause();   // (linear: its time is the drag's level)
        }
        c._dockHand.currentTime = dockShows() * D_SMALL;
        continue;
      }
      let from = null;
      if (c._dockHand) { from = dockShows(); c._dockHand.cancel(); c._dockHand = null; }
      // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
      if (shut && !c._dockFade) c._dockFade = c.animate([{ opacity: from ?? 1 }, { opacity: 0 }], { ...DOCK_FADE, duration: from == null && dock.lvl > 0.5 ? 0 : DOCK_FADE.duration });
      // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
      else if (!shut && c._dockFade) { c._dockFade.cancel(); c._dockFade = null; c.animate([{ opacity: 0 }, { opacity: 1 }], { ...DOCK_FADE, fill: 'none' }); }
      // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
      else if (!shut && from != null && from < 1) c.animate([{ opacity: from }, { opacity: 1 }], { ...DOCK_FADE, fill: 'none' });
    }
  }
  // The sheet's edge is the card's sibling, not its child: inside the card, the card's glass clipped it away on an iPhone (802e093,
  // no edge and no handle under Doppler 7). It stands at the card's foot at the card's width, and moves with the card's own drag.
  function placeLip() {
    const d = ui?.data, l = ui?.lip;
    if (!l || d.hidden || !d.classList.contains('pz-sheet')) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const px = (v) => `${v.toFixed(1)}px`;
    const split = splitSheet(d), open = d.classList.contains('tool-open'), sliding = d.classList.contains('pz-sliding');
    // (Read before the writes below, with the card at rest, open or closed: it never changes while the card docks. Skipped while
    // closed, a slide that came in with its card closed kept its readings in the card's flow and the whole card shrank to fit them,
    // to 74 % on Varices 3 at 375 x 667, until it was opened.)
    if (split && !sliding && dock.lvl === dock.to) measureUnder(d);
    const u = sliding ? parseFloat(d.style.getPropertyValue('--pz-u')) || 0 : 0;
    // (Sliding, at the readings' card's foot to the fraction of a px: the card's own box height is whole px.)
    // (Mac and iPad landscape: over the card's top, in the readings' card's top edge, tucked or out; the rise, --pz-lift, carries it up.)
    const ut = wideSheet(d) ? (sliding ? u : open ? 1 : 0) : 0;
    l.style.left = px(readMetric(d, 'offsetLeft')); l.style.width = px(readMetric(d, 'offsetWidth')); l.style.top = px(wideSheet(d) ? readMetric(d, 'offsetTop') - LIP * (1 - ut) : readMetric(d, 'offsetTop') + (sliding && slip.h0 != null ? slip.h0 + u * slip.d : readMetric(d, 'offsetHeight')));
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (sliding) l.style.setProperty('--pz-u', u.toFixed(4)); else l.style.removeProperty('--pz-u');
    // (Fully open on a phone the edge sits 24 px up, in the card's foot (app.css margin-top, taken at once): the step it makes is eased by a
    // transform from where it stood, on the compositor, never by the margin, a layout each frame.)
    const step = open && !wideSheet(d);
    if (lipStep != null && step !== lipStep && !l.hidden && !d.classList.contains('pz-hide') && !sliding && !reduce.matches)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      l.animate?.([{ transform: `translateY(${step ? LIP : -LIP}px)` }, { transform: 'translateY(0)' }], { duration: D_SURFACE, easing: EASE_ARRIVE, composite: 'add' });
    lipStep = step;
    lipPaint();
  }
  let lipStep = null;
  // (The edge's part of a dock glide's or a drag's frame: it moves with the card's translate and names what a tap on it does. Its
  // place and size are set at rest, placeLip, where nothing moves: nothing is read here.)
  function lipPaint() {
    const d = ui?.data, l = ui?.lip;
    if (!l || d.hidden || !d.classList.contains('pz-sheet')) return;
    const split = splitSheet(d), open = d.classList.contains('tool-open');
    l.style.translate = d.style.translate; l.dataset.restTranslate = d.dataset.restTranslate ?? '0 0';
    const say = dock.to === 1 ? 'Open the card' : wideSheet(d) ? (open ? 'Hide the readings' : 'Show the readings') : open ? (split ? 'Hide the readings' : 'Close the card') : split && dock.down === want ? 'Close the card' : 'Show the rest of the card';
    if (l.getAttribute('aria-label') !== say) l.setAttribute('aria-label', say);
  }
  // The dock glide: the card's translate (and its handle's) written by the frames, on the eases' clock, in the frame the GPU glass reads
  // them in (3 Nov 2026, cards trailing: as one animation each the browser's compositor moved the card from a clock of its own, which
  // can stand a display frame from the page's time, so the glass and the card parted by that frame, 0 or 1 of them from run to run).
  // One string a frame for the card and its handle, the same; no style is read and nothing else is written. The glass takes the inline
  // translate (glass-gl.js moveOf), so the two never part.
  function glideLvl() {
    const g = glide, u = g.ms > 0 ? clamp((easeNow() - g.t0) / g.ms, 0, 1) : 1;
    return g.from + (g.to - g.from) * ease(u);
  }
  // alloc-rare: one string a frame for the card and its handle while a dock glide plays (the translate's text takes the card's place, which no table can hold)
  const glideText = (lv) => { const v = dock.vec || DOCK_ZERO; return `${(v[0] * lv).toFixed(1)}px ${(v[1] * lv).toFixed(1)}px`; };
  function glideStep() {
    dock.raf = 0;
    const g = glide;
    if (!g || !ui) return;
    const u = g.ms > 0 ? clamp((easeNow() - g.t0) / g.ms, 0, 1) : 1;
    if (u >= 1) { glideDone(); return; }
    const t = glideText(g.from + (g.to - g.from) * ease(u));
    ui.data.style.translate = t;
    if (g.lip && ui.lip) ui.lip.style.translate = t;
    dock.raf = nextFrame(glideStep);
  }
  // The glide over, where it was going.
  function glideEnd() {
    const g = glide;
    if (!g) return;
    cancelFrame(dock.raf); dock.raf = 0;
    glide = null; lvlSet = g.to;
    if (ui) { ui.data.style.translate = dockPos(g.to); lipPaint(); }
  }
  const lipSoon = () => ui && placeLip();   // (kept: a glide's landing makes no closure)
  const glideDone = () => { if (!glide) return; glideEnd(); dock.rest = restPass(lipSoon); };   // (landed: the edge measured where the card now rests, between frames)
  /** Whatever glide is under way ends here, the card where it now stands (a finger, a resize or a new glide takes it from there). */
  function dockHalt() {
    cancelFrame(dock.raf); dock.raf = 0;
    const g = glide;
    if (!g) return;
    const v = glideLvl();
    glide = null; lvlSet = v;
    if (ui) { ui.data.style.translate = dockPos(v); lipPaint(); }
  }
  function dockGlide(from, to, ms) {
    const d = ui.data, l = ui.lip;
    // alloc-rare: a dock glide begins: once per glide, not per frame
    glide = { from, to, ms, t0: easeNow(), lip: !!(l && d.classList.contains('pz-sheet')) };
    dock.raf = nextFrame(glideStep);
  }
  function dockTo(to, ms = 380) {
    dockHalt();
    dock.to = to;
    if (!to) dock.down = -1;
    // (Closed from either open state; it opens again on its first step, the sheet tucked under it.)
    if (to === 1 && ui?.data.classList.contains('pz-sheet') && ui.data.classList.contains('tool-open')) ui.setFold(false);
    if (reduce.matches) ms = 0;
    const from = dock.lvl, t0 = performance.now();
    dockRest();
    cancelRest(dock.rest);
    if (ms && from !== to && ui && !ui.data.hidden && !wideSheet(ui.data)) {
      dockGlide(from, to, ms);
      dockPaint();
    } else {
      // (No glide to play, a reduced-motion jump or a wide screen's, which keeps its rise in the translate: stepped by the frames as before.)
      // alloc-rare: a dock glide begins or lands: once per glide, not per step
      const step = (now) => {
        const u = ms ? clamp((now - t0) / ms, 0, 1) : 1;
        lvlSet = from + (to - from) * ease(u);
        dockPaint();
        if (u < 1) dock.raf = nextFrame(step);
        // alloc-rare: a dock glide begins or lands: once per glide, not per step
        else dock.rest = restPass(lipSoon);   // (landed: the edge measured where the card now rests, between frames)
      };
      dock.raf = nextFrame(step);
    }
    layout();   // (the figure frames itself for where the card is going)
    // (V-FIT: and the camera sets off now, on the card's own clock, not once the card's fit pass has run 60 ms on; that pass then finds the camera
    // already headed to the same view. Not while a slide comes in or goes, or a resize is still settling: they frame it themselves.)
    if (ui && shown && shown.i === want && shown.gen === gen && !(busy && !playing) && !leaving && !booting && !reframeT && !zoomOn()) reframe(ms);
    // alloc-rare: a dock glide begins or lands: once per glide, not per step
    clearTimeout(dock.fit); dock.fit = setTimeout(() => restPass(fitRest), 60);
  }
  // (The card's fit lays the chrome out again as a task between frames (rest-pass.js), never in the timer's own turn.)
  function fitRest() { if (ui) onResize(); }
  // A slide whose data card does not fit (phoneTextCap, lowData) comes in closed, its handle showing, never folded to its header
  // behind Show; the next slide that fits brings it back. (After the pass that asked: dockTo lays the cards out again.)
  function autoDock(shut) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const key = `${gen}:${want}`, d = ui.data, ms = d.classList.contains('pz-hide') || d.hidden ? 0 : 380;
    // (Never while the reader's finger or a fold is moving the card: their pull opens the readings, it never closes the card.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (shut && dock.to === 0 && dock.autoKey !== key && !dock.drag && !d.classList.contains('pz-sliding') && !('folding' in d.dataset)) { dock.autoKey = key; dock.auto = true; queueMicrotask(() => ui && dockTo(1, ms)); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    else if (!shut && dock.auto && dock.to === 1) { dock.auto = false; queueMicrotask(() => ui && dockTo(0, ms)); }
  }
  // A phone on its side: a table card's title that ends clear of the deck's tab stands level with it, the tab in the corner beside
  // it, not under it (the six site rows of Sites 10 at 667 x 375 lost their last row to the tab's height). Decided once a slide,
  // and given up for good on the slide should the fitted title reach the tab (then fitted again under it). True while it stands beside.
  let besideKey = '', besideNo = '';
  function tabBeside() {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const pn = ui.panel, key = `${gen}:${want}`, tb = pn.classList.contains('tabbed') && pn.querySelector(':scope > .pz-tabname'), t1 = pn.querySelector(':scope > .pz-ph > .pz-h');
    let on = false;
    if (tb && t1 && besideNo !== key) {
      const rg = document.createRange(); rg.selectNodeContents(t1);
      const clear = readBox(rg).right <= readBox(tb).left - 8;
      if (clear) { on = true; besideKey = key; } else if (besideKey === key) { besideNo = key; besideKey = ''; }
    }
    pn.classList.toggle('tab-beside', on);
    return on;
  }
  // The cards never scroll: when a card's contents are taller or wider than the card, their zoom (--pz-fit) drops until they fit.
  // The height is summed from the children's own boxes (a slide-up does not change a box's height), never read from
  // scrollHeight: WebKit keeps an entry shift's overflow there after the shift has eased away, so the words fitted
  // once at their size and then, on the next layout, shrank. (So a card is judged by where its contents come to rest.)
  const RAIL = '.pz:not(.stack):not(.low) .pz-data.pz-beside';   // (styles/app.css: the tiles stacked beside the instrument)
  function overflowOf(el) {
    const cvs = [...el.querySelectorAll('canvas.trace-gl, canvas.wgl')].map((c) => [c, c.style.display, (c.style.display = 'none')]); try {   // (read with the GPU's picture canvases out of the layout, put back below: trace-gl is laid wider than its box and cut by clip-path, wgl hangs an 18 px pad, and scrollWidth and scrollHeight counted both, so cards with a slider or chart zoomed their words to the floor, Mac 5 Nov 2026)
    const cs = readStyle(el), z = readMetric(el, 'offsetHeight') ? readBox(el).height / readMetric(el, 'offsetHeight') : 1;
    let used = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), n = 0;
    // (An instrument with its tiles beside it shares one row with them: the row is counted once, at its taller side.)
    // (Only while the tool shows beside the tiles: folded, the tiles stand in their row alone, counted like any part.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const rail = el.matches(RAIL), pair = rail && [...el.querySelectorAll(':scope > .pz-tool')].some((c) => readStyle(c).display !== 'none'), side = pair && el.querySelector(':scope > .pz-tiles');
    // (A wide screen's summary table clips what is wider than it, so the card's own scrollWidth never sees it: read from the table, in the
    // card's pixels. The fit then zooms the card until every column is in view. A phone's rows are a grid that fits its width by itself.)
    const wideTable = !ui.root.classList.contains('stack');
    const bigText = parseFloat(readStyle(ui.root).getPropertyValue('--ts')) > 1.001;   // (only a larger text setting can outgrow a phone's columns)
    let sideways = 0;
    for (const c of el.children) {
      if (c === side) continue;
      const s = readStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      if (s.maxHeight === '0px') continue;   // (a folded part, a phone's closed tool: its hidden contents are not overflow)
      const cz = parseFloat(s.zoom) || 1;
      if (wideTable && c.classList.contains('pz-table')) sideways = Math.max(sideways, (readMetric(c, 'scrollWidth') - readMetric(c, 'clientWidth')) * cz);
      // (A phone's grid rows fit their width at the standard text size; at a large one a reading on the reference row can outgrow its
      // column, which the table's clip hides from the card, so the first row's readings are measured and the fit zooms for them.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      else if (bigText && c.classList.contains('pz-table')) for (const td of c.querySelectorAll('tbody tr:first-child td.num')) sideways = Math.max(sideways, (readMetric(td, 'scrollWidth') - readMetric(td, 'clientWidth') - 1) * cz);
      // (A part with a height cap clips by design, and mid-fold its clipped contents are not overflow either: counting them
      // shrank the card while a phone's tool folded, and the shrunk fit then stuck.)
      // (A line's glyphs or a pinned button reaching a pixel or two past its part is not overflow: counted, it shrank every
      // phone instrument card by the fit loop's full eight steps, its words to 0.86.)
      // (The tiles' numbers each have a GPU picture that reaches past its tile, and its size follows the number: the tiles' own
      // scroll height is no overflow either. Counted, a number changing in a drag zoomed the whole card down to half, 7 Nov.)
      // (A card's header grows with its words; only its Show chip's tap area reaches past it, and that is no overflow: counted,
      // it shrank a phone's folded data card to half, its chip to 19 px.)
      const clip = s.maxHeight !== 'none' || c.classList.contains('pz-dh') || c.classList.contains('pz-tiles') ? 0 : Math.max(0, readMetric(c, 'scrollHeight') - readMetric(c, 'clientHeight') - 3);
      // A protected time chart eases to its allocated height. Fit against its destination, so the old height
      // during that ease cannot shrink the card's words and start another fit/resize cycle.
      const chartH = el.classList.contains('pz-flowfit') && c.matches('.pz-tool[data-kind="flowtime"]') ? parseFloat(el.style.getPropertyValue('--ft-room')) : 0;
      used += (chartH || Math.max(readBox(c).height, side && c.classList.contains('pz-tool') ? readBox(side).height : 0) / z) + ((parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0) + clip) * cz;
      n++;
    }
    used += (parseFloat(cs.rowGap) || 0) * Math.max(0, n - 1);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    return { v: used - readMetric(el, 'clientHeight'), h: Math.max(readMetric(el, 'scrollWidth') - readMetric(el, 'clientWidth'), sideways) };
  } finally { for (const [c, d] of cvs) c.style.display = d; } }
  // What a card's fit depends on: its box, its words (digits alike, so a number that eases fits as before) and which parts show.
  // (The readings' plate being out or tucked is not in it, and neither is the data card's live text, only the slide: the card's box is fixed once fitted.)
  // A card whose signature is unchanged keeps its fit without being measured again (measuring forces layouts mid-animation).
  // (A card holding the quick check grows as its answers ease open and shut; it was fitted with every answer open, so its own
  // height is left out (the window's stands in): refitting mid-ease cut the easing short and jolted the words' size.)
  // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
  const fitSig = (el) => `${readMetric(el, 'clientWidth')}x${el.querySelector('.pz-check') ? `q${innerWidth}x${innerHeight}` : readMetric(el, 'clientHeight')}|${el.className.replace(/ ?\b(?:tool-open|pz-sliding)\b/g, '')}|${el.style.maxHeight}|${document.documentElement.style.cssText}|${el.style.getPropertyValue('--pz-reach')},${el.style.getPropertyValue('--pz-fkrow')}|${[...el.children].map((c) => (c.hidden ? 0 : c.className + (readStyle(c).maxHeight !== 'none' ? ':' + readMetric(c, 'offsetHeight') : ''))).join()}|${el === ui?.data ? `s${want}` : (el.querySelector('.pzv') ? wordsOf(el) : el.textContent).replace(/\d/g, '0')}`;
  const fitDone = new WeakMap(), smOf = new WeakMap();
  // A narrow summary table's column heads are 12 px, never smaller: a row whose columns are too narrow for the words in one line
  // sets them upright (tr.th-up, turned to read from the bottom), one way for the whole row. (The phone and upright-tablet layouts read it.)
  // On an upright iPad a head fits when its word keeps 3 px clear of its column's edges, so two neighbours are never closer than 6 px: an
  // iPad mini's nine columns had WHVP and FHVP, SAAG and PROT., touching. A phone's rule is as it was: the word inside its column.
  const headFits = (th) => { const b = readBox(th), g = document.createRange(), m = ui.root.classList.contains('tab') ? 2.5 : -0.5; g.selectNodeContents(th); return [...readRects(g)].every((q) => !q.width || (q.left >= b.left + m && q.right <= b.right - m)); };
  function fitHeadRow(tr) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const ths = [...tr.querySelectorAll('th.num')];
    if (!ths.length || !readBox(tr).width) return;
    tr.classList.remove('th-up');
    if (!ths.every(headFits)) tr.classList.add('th-up');
  }
  // (Fitted again when the row's width settles or the web fonts arrive: a fit made mid-layout or in a fallback font would stay too small.)
  let headRO = null;
  function fitHeads(el) {
    if (!headRO) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      headRO = new ResizeObserver((es) => { for (const e of es) fitHeadRow(e.target); });
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      document.fonts?.ready.then(() => document.querySelectorAll('.pz-table thead tr').forEach(fitHeadRow));
    }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const tr of el.querySelectorAll('.pz-table thead tr')) { headRO.observe(tr); fitHeadRow(tr); }
  }
  // An equation never runs past its card: one wider than its box is set smaller (--eq-k, the share of its size that fits).
  // (Measured at the card's final zoom; the math is a block of its own, so its box is the room the card gives it.)
  function fitEquations(el) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const box of el.querySelectorAll('.pz-eq')) {
      box.style.removeProperty('--eq-k');
      let k = 1;
      for (let n = 0; n < 4; n++) {
        const w = readMetric(box, 'clientWidth'), over = readMetric(box, 'scrollWidth') - w;
        if (!w || over <= 0.5) break;
        k = Math.max(0.4, k * (w / (w + over)) * 0.99);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        box.style.setProperty('--eq-k', k.toFixed(3));
      }
    }
  }
  // (An equation typeset before the math font arrives is wider or narrower than it ends up: fitted again once the fonts are in.)
  document.fonts?.ready.then(() => { for (const c of [ui?.text, ui?.data, ui?.panel]) if (c && !c.hidden) { fitEquations(c); } });
  // A phone on its side: its data card's lettering never under 12 px on the screen (critique I1, 17 Oct: it had zoomed to 8 px,
  // Varices 7, TIPS 3 and 11, Stiffness 4 and 8, Circuit 5). A card too tall for its room first stands its tiles tighter (.pz-lt:
  // less padding, the numbers a step smaller; .pz-lt2: smaller again, the names and units at their size), then zooms only as far as
  // its smallest lettering allows, then comes in closed at the right, its edge and handle showing, as an upright phone's does
  // (autoDock; never folded to its header behind Show). Brought back, or opened fully, it zooms to fit as a last resort: the
  // reader asked for it, over the figure. Returns the smallest zoom the fit may take.
  // (One probe for the caption size, built with the presenter and moved in and out of the card being fitted: no node made per fit.)
  const smProbe = h('span', { style: 'position:absolute;visibility:hidden;font-size:var(--pz-sm, 12px)' });
  const capProbe = h('span', { style: 'position:absolute;visibility:hidden;font-size:var(--s-cap)' });
  function lowData(el) {
    const pr = capProbe; el.append(pr);
    const cap = parseFloat(readStyle(pr).fontSize) || 12; pr.remove();
    const floor = cap > 12 ? Math.ceil(12 / cap * 1000) / 1000 : 1;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fits = () => { const o = overflowOf(el); return o.v <= 1 && o.h <= 1; };
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const chosen = el.classList.contains('tool-open') && el.dataset.openFor === String(want);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const done = (shut, z) => { autoDock(shut); return z; };
    el.classList.remove('pz-lt', 'pz-lt2');
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const c of ['pz-lt', 'pz-lt2']) { if (fits()) return done(false, floor); el.classList.add(c); }
    if (chosen) return 0.5;
    if (fits()) return done(false, floor);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (floor < 1) { el.style.setProperty('--pz-fit', String(floor)); const ok = fits(); el.style.removeProperty('--pz-fit'); if (ok) return done(false, floor); }
    return done(!!el.querySelector(':scope > :not(.pz-dh):not(.pz-grip):not(.pz-lip)'), 0.5);
  }
  // A wide screen too short for its cards, an iPad on its side or a short Mac window (.pz.short, layout): a card too tall for its room
  // first stands tighter (.pz-lt: less padding, its tiles and table rows closer; .pz-lt2: a table's row on one line), then zooms only
  // as far as its smallest lettering stays 12 px on the screen (glitch hunt, 22 Oct: cards zoomed to half there, about 300 pieces of
  // text down to 7 px). Returns the smallest zoom the fit may take for that. (A card that still does not fit zooms further only as a
  // last resort, fitCards, rather than run out of its card.)
  function shortFit(el) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fits = () => { const o = overflowOf(el); return o.v <= 1 && o.h <= 1; };
    el.classList.remove('pz-lt', 'pz-lt2');
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const c of ['pz-lt', 'pz-lt2']) { if (fits()) break; el.classList.add(c); }
    return textFloor(el);
  }
  // The smallest zoom that keeps a card's smallest lettering at 12 px on the screen (1 when it is already at or under that).
  function textFloor(el) {
    const px = minText(el);
    return px > 12 && isFinite(px) ? Math.ceil(12 / px * 1000) / 1000 : 1;
  }
  // The words' card (a wide screen): the smallest zoom its smallest lettering allows at 12 px on the screen, at least a half (1 where there is
  // none to give: the usual text size), and its height at a zoom (css px, held to no cap), for the pair that is too tall (layout).
  function wordsFloor() {
    const ts = ui.text.style, sv = ts.getPropertyValue('--pz-fit');
    ts.removeProperty('--pz-fit');
    const px = minText(ui.text);
    if (sv) ts.setProperty('--pz-fit', sv);
    return px > 12 && isFinite(px) ? Math.max(0.5, Math.ceil(12 / px * 1000) / 1000) : 1;
  }
  function wordsHeightAt(z) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const ts = ui.text.style, sv = [ts.maxHeight, ts.getPropertyValue('--pz-fit'), ts.getPropertyValue('--pz-z')];
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ts.maxHeight = 'none'; ts.removeProperty('--pz-z'); ts.setProperty('--pz-fit', String(z));
    const v = readMetric(ui.text, 'offsetHeight');
    ts.maxHeight = sv[0]; if (sv[1]) ts.setProperty('--pz-fit', sv[1]); else ts.removeProperty('--pz-fit'); if (sv[2]) ts.setProperty('--pz-z', sv[2]);
    return v;
  }
  // The smallest lettering in a card as it reaches the screen: its font size times every zoom on its way (the card's own, its parts',
  // the interface's), or an SVG's drawn scale. (As tests/e2e/text-floor.mjs measures it.)
  function minText(el) {
    let min = Infinity;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const e = n.parentElement;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (!e || !n.textContent.trim() || !readRects(e).length) continue;
      const fs = parseFloat(readStyle(e).fontSize);
      if (!fs) continue;
      let k = 1;
      if (e instanceof SVGElement) { const m = readCTM(e); if (m) k = Math.hypot(m.a, m.b); }
      else for (let a = e; a; a = a.parentElement) k *= parseFloat(readStyle(a).zoom) || 1;
      min = Math.min(min, fs * k);
    }
    return min;
  }
  function fitFlowTime(el) {
    if (el !== ui.data) return;
    const chart = el.querySelector(':scope > .pz-tool[data-kind="flowtime"] > .pz-flowtime');
    const eligible = chart && el.classList.contains('tool-only') && ui.root.classList.contains('pz-wide') && !ui.root.classList.contains('stack') && !ui.root.classList.contains('low');
    el.classList.toggle('pz-flowfit', !!eligible);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const clear = () => { el.style.removeProperty('--ft-room'); el.style.removeProperty('--ft-card'); };
    if (!eligible) { clear(); return; }
    // Measure at full width, without the previous fit. The chart's own height never enters its budget.
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const cs = readStyle(el), px = (v) => parseFloat(v) || 0;
    const z = readMetric(el, 'offsetWidth') ? readBox(el).width / readMetric(el, 'offsetWidth') : 1;
    const f = Math.max(px(readStyle(chart).fontSize), 12 / (z || 1));
    let chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth), n = 0;
    for (const c of el.children) {
      const s = readStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      const cz = parseFloat(s.zoom) || 1;
      chrome += (c === chart.parentElement ? 0 : readBox(c).height / (z || 1)) + (px(s.marginTop) + px(s.marginBottom)) * cz;
      n++;
    }
    chrome += px(cs.rowGap) * Math.max(0, n - 1);
    const room = parseFloat(cs.maxHeight) - chrome - 1;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const h = flowTimeHeight(readMetric(chart, 'clientWidth'), f, room, chart.dataset.lines.split(','), px(readStyle(chart).getPropertyValue('--band-room'))).height;
    if (h == null) { el.classList.remove('pz-flowfit'); clear(); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    else { el.style.setProperty('--ft-room', `${h.toFixed(2)}px`); el.style.setProperty('--ft-card', `${(h + chrome).toFixed(2)}px`); }
  }
  function fitCards(...els) {
    let refit = false;
    for (const el of els) {
      if (!el || el.hidden || 'folding' in el.dataset) continue;   // (a part mid-fold: the card keeps the fit it will rest with)
      // (A readings card of tiles alone, while a what-if slider or a compare button moves its numbers: its size is the one it came in with.
      // A tile that measured taller for a moment (a number changing its length, a rating's word) was read as overflow, the card zoomed down
      // to half and the tiles shrank in the middle of a drag, Circuit "Cirrhosis raises the resistance" on a Mac, 7 Nov. A resize, a turn or a new
      // slide deletes the fit first (fitDone), so they still fit it afresh.)
      if (el === ui?.data && el.classList.contains('tiles-only') && !el.querySelector(':scope > .pz-tool') && fitDone.has(el) && cardsStill()) continue;
      const sig = fitSig(el);
      if (fitDone.get(el) === sig) continue;
      const was = parseFloat(el.style.getPropertyValue('--pz-fit')) || 1;
      el.style.removeProperty('--pz-fit'); el.style.removeProperty('--pz-z');
      fitFlowTime(el);
      // (The stacked card is fitted with its readings' card tucked, against the tucked cap, whatever state it is in: the instrument holds
      // one size open or tucked, and nothing the fit reads comes from the fit before it. Its readings' travel (--pz-d) is measured at each trial
      // fit, so the tucked card nets its readings out exactly, and once more at the fit it ends with.)
      const split = el === ui.data && splitSheet(el);
      const wasOpen = split && el.classList.contains('tool-open'), wasU = split ? el.style.getPropertyValue('--pz-u') : '';
      if (split) { el.classList.remove('tool-open'); if (wasU) el.style.setProperty('--pz-u', '0'); }
      const ovOf = (e) => { if (split) measureUnder(e); return overflowOf(e); };
      // (A tablet's narrow data card: its own grid changes, which a container query on the card cannot do.)
      if (el.classList.contains('pz-data')) el.classList.toggle('pz-narrow', readMetric(el, 'offsetWidth') > 0 && readMetric(el, 'offsetWidth') < 420);
      // (A tile's name in full when it fits on one line in its tile, else its short form: Liver flow, Protein ...)
      // (All read in one layout, then written: the tiles' columns are equal shares of the row, so one tile's short name never
      // changes another's room. Read and written tile by tile, each read laid the card out again.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const names = [...el.querySelectorAll('.pz-tiles .pzt-k[data-s]')];
      for (const k of names) k.classList.remove('short');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const shorts = names.filter((k) => { const t = k.parentElement, cs = readStyle(t), room = readMetric(t, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return room > 0 && readMetric(k, 'scrollWidth') > room + 0.5; });
      for (const k of shorts) k.classList.add('short');
      // (A scale bar's cut-off numbers stay inside the bar, and where two would come within 8 px of each other the bar shows none of
      // them: sweep batch 03, 0.1 and 1.5 sat 6 px apart and read as one, and a lone survivor read as a mystery value (critique D2,
      // 17 Oct). The coloured bands still show where the cut-offs fall.)
      // (Every bar's numbers read in one layout and then written. A number is centred on its cut-off (translate −50 %); .lo sets it
      // to start there (0) and .hi to end there (−100 %), a shift of half its width, worked out rather than measured again.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const bars = [...el.querySelectorAll('.pz-tiles .pzt-bar')].map((bar) => ({ bar, ls: [...bar.querySelectorAll('.pzb-l')] }));
      for (const { ls } of bars) for (const l of ls) l.classList.remove('lo', 'hi', 'off');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      for (const b of bars) { b.B = readBox(b.bar); b.rs = b.ls.map((l) => readBox(l)); }
      for (const { B, ls, rs } of bars) {
        let end = -Infinity, clash = false;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        ls.forEach((l, i) => {
          const r = rs[i];
          if (!r.width) return;
          let left = r.left, right = r.right;
          if (r.left < B.left) { l.classList.add('lo'); left += r.width / 2; right += r.width / 2; } else if (r.right > B.right) { l.classList.add('hi'); left -= r.width / 2; right -= r.width / 2; }
          if (left < end + 8) clash = true; else end = right;
        });
        if (clash) for (const l of ls) l.classList.add('off');
      }
      // (A row of tiles whose bars show no cut-off number keeps no empty row for them under the bars: on a phone that row stood empty
      // under HVPG's bar (5 and 10 too close to number) and, the tiles one height, under WHVP's and FHVP's too, Sites 3 on an iPhone,
      // 20 Oct, where the stacked cards ran into the words. Decided by the bars' widths only, so a tile never resizes as its numbers change.)
      // (Widths only, which the numbers' classes above do not change: the bars' and numbers' read before, then each row written.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const rowW = new Map(bars.map((b) => [b.bar, b]));
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      for (const row of el.querySelectorAll('.pz-tiles')) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        const rb = [...row.querySelectorAll('.pzt-bar')].map((b) => rowW.get(b));
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (!rb.length || rb.some((b) => !b?.B.width)) continue;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        row.classList.toggle('pzb-nonum', !rb.some((b) => b.ls.some((l, i) => !l.classList.contains('off') && b.rs[i].width)));
      }
      fitHeads(el);
      // (A quick check is fitted with every answer open: its words keep one size however many are revealed.)
      const all = el.querySelector('.pz-check'); all?.classList.add('pzc-all', 'pzc-still');
      // (A phone's words never fit below 12 px: the card's height cap leaves them that room, phoneTextCap.)
      // (A phone's words, upright or on its side, and an upright iPad's: two fixed sizes, Regular or Compact (card-type.js), the whole
      // card at once, so its title always reads larger than its words and its buttons never larger (Mohammad, 19 Oct: "Two fixed
      // sizes"; the title had stepped down first and the buttons not at all, so all of them met at 12 to 14 px). Only a slide that
      // does not fit even at Compact goes further, to 12 px on the screen, and on its side, where no cap keeps that room, past it as a
      // last resort rather than run out of its card.)
      const small = el === ui.text && (phone() || ui.root.classList.contains('low'));
      const lowFloor = el === ui.data && ui.root.classList.contains('low') ? lowData(el) : 0;
      const shortFloor = !small && !lowFloor && ui.root.classList.contains('short') ? shortFit(el) : 0;
      if (!shortFloor && !lowFloor) el.classList.remove('pz-lt', 'pz-lt2');   // (a card left tight by a shorter window)
      // (A summary table on a wide screen, too wide or too tall for its card, also zooms only as far as its lettering stays 12 px at first,
      // the compact layout's rule, before it may go past that as a last resort rather than scroll: it never scrolls.)
      const tableFloor = !small && !lowFloor && !shortFloor && el === ui.panel && !ui.root.classList.contains('stack') && el.querySelector(':scope > .pz-table') ? textFloor(el) : 0;
      const ln = small || el === ui.text ? el.querySelector('.pz-line, p') : null, lb = ln ? parseFloat(readStyle(ln).fontSize) : 0;
      const floor = lb > 12 ? Math.ceil(12 / lb * 1000) / 1000 : (el === ui.text ? 1 : 0.5);   // (the words on every device stop at 12 px on the screen, at the deck size)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const mins = [lowFloor || floor];
      if (shortFloor > mins[0]) mins.unshift(shortFloor);   // (the compact layout's 12 px first; past it only as a last resort)
      else if (tableFloor > mins[0]) mins.unshift(tableFloor);
      let k = 1, over = 1;   // (over: the largest fit tried that still overflowed)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const fits = () => { const o = ovOf(el); return o.v <= 1 && o.h <= 1 ? null : o; };
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (small && fits()) { k = over = Math.max(COMPACT, floor); el.style.setProperty('--pz-fit', String(k)); }   // (Compact; over: no search back up past it)
      for (const kMin of mins) {
        for (let n = 0; n < 8 && k > kMin; n++) {
          const o = fits();
          if (!o) break;
          over = k;
          k = Math.max(kMin, k * Math.min(0.97, (readMetric(el, 'clientHeight') / (readMetric(el, 'clientHeight') + Math.max(o.v, 0))) ** 0.9, (readMetric(el, 'clientWidth') / (readMetric(el, 'clientWidth') + Math.max(o.h, 0))) ** 0.9));
          // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
          el.style.setProperty('--pz-fit', k.toFixed(3));
        }
        if (!fits()) break;
      }
      // (The steps above scale by how far the card overflows, but smaller words wrap into fewer lines, so a step overshoots:
      // a phone's words that fit at 0.62 came in at 0.5, under 12 px. Once a fit fits, the largest that still fits is found
      // between it and the last that did not.)
      if (k < over && !fits()) for (let n = 0; n < 6 && over - k > 0.005; n++) {
        const m = (k + over) / 2;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pz-fit', m.toFixed(3));
        if (fits()) over = m; else k = m;
      }
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (k < 1) el.style.setProperty('--pz-fit', k.toFixed(3));
      // (A fit within a hair of the last one keeps the last one, when the card still fits with it: a phone's words had flipped
      // between 0.850 and 0.851 with every pass, moving the card a pixel and restyling the whole page about twice a second.)
      if (was !== k && Math.abs(was - k) < 0.01) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (was < 1) el.style.setProperty('--pz-fit', was.toFixed(3)); else el.style.removeProperty('--pz-fit');
        const o = ovOf(el);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (o.v > 1 || o.h > 1) { if (k < 1) el.style.setProperty('--pz-fit', k.toFixed(3)); else el.style.removeProperty('--pz-fit'); }
      }
      // (Parts whose words keep their size (styles/app.css: zoom var(--pz-z)) let the fit shorten only their pictures; when even
      // the shortest pictures leave the card too full, a large text setting, the words then zoom down too, to half at most.)
      // (Never past the 12 px floor: the card's small size, --pz-sm, zoomed, stays at least 11.5 px.)
      // (Its small size read with a probe once per look of the card and the screen, not on every fit.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const smKey = `${el.className}|${ui.root.className}|${innerWidth}x${innerHeight}|${devicePixelRatio}|${document.documentElement.style.cssText}|${app.style.cssText}|${ui.root.style.cssText}|${el.style.cssText.replace(/--pz-(fit|z):[^;]*;?/g, '')}`;
      let sm = smOf.get(el);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (sm?.k !== smKey) { const pr = smProbe; el.append(pr); sm = { k: smKey, v: parseFloat(readStyle(pr).fontSize) || 12 }; pr.remove(); smOf.set(el, sm); }
      sm = sm.v;
      const zMin = Math.max(0.5, Math.min(1, 11.5 / sm));
      for (let n = 0, z = 1; n < 8 && z > zMin; n++) {
        const o = ovOf(el);
        if (o.v <= 1 && o.h <= 1) break;
        z = Math.max(zMin, z * Math.min(0.97, (readMetric(el, 'clientHeight') / (readMetric(el, 'clientHeight') + Math.max(o.v, 0))) ** 0.9, (readMetric(el, 'clientWidth') / (readMetric(el, 'clientWidth') + Math.max(o.h, 0))) ** 0.9));
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pz-z', z.toFixed(3));
      }
      fitEquations(el);
      // (Closed again with no transition, so the answers start hidden and the card rests at its closed height.)
      if (all) { all.classList.remove('pzc-all'); void readMetric(all, 'offsetHeight'); all.classList.remove('pzc-still'); }
      if (split) {
        measureUnder(el);   // (once, at the fit it ends with)
        if (wasOpen) el.classList.add('tool-open');
        if (wasU) el.style.setProperty('--pz-u', wasU);
        ui.lipMO?.takeRecords();
      }
      fitDone.set(el, fitSig(el));   // (as it rests once fitted: a folding part's height is part of it)
      if (el === ui.data) refit = true;
    }
    if (refit) ui.tools?.refit();   // (the chart in the data card draws at the zoom the fit left, not one it tried on the way)
  }
  // A card whose contents grow after the layout (a time-lapse, the numbers settling) is fitted again.
  // A slide whose data card changes only its readings while it shows: a what-if slider or compare button driving the live model
  // (liveOff), or a time-lapse slide (its days running, or run). Its cards keep the plan made as the slide came in.
  const readingsOnly = () => liveOff || handOn || lapseOn || (!!shown && shown.i === want && !!slides[want]?.lapse);
  // A time-lapse slide in view: as its days run the data card's readings change many times a second, and each change that measured
  // the card a hair different laid every card out again, so on an iPhone the teaching card vibrated as the days passed (Endoscopy 3,
  // 18 Oct). The data card is only fitted again in its own room; the words and their glass stay as they came in. (A resize, a turn or
  // a new text size still lays everything out afresh: onResize.)
  // (The same while a what-if slider or a compare button drives the live model (liveOff): each reading that measured the data card a
  // hair different laid the cards out again and fitted the words afresh, a pixel off each time, so the teaching card's text shook
  // under the finger: Tricuspid leak on slide 60 of the test-all deck on an iPhone, 19 Oct.)
  const cardsStill = () => !!shown && shown.i === want && (liveOff || handOn || !!slides[want]?.lapse) && !!ui && !ui.root.classList.contains('pz-prep');
  // (While the readings' card slides or a part folds, the data card's box changes size on every frame: each change laid every card out
  // again, the words fitted afresh and the figure framed, frame by frame, so the slide ran at about 10 frames a second (Mohammad, 25 Oct).
  // The card moves by its own CSS (--pz-u, --pz-grow) and is laid out once it rests: foldStill.)
  // (And while the card is zoomed to the middle of the screen, zoomHeld below: it too is laid out once it rests.)
  const cardMoving = () => !!ui && (ui.data.classList.contains('pz-sliding') || 'folding' in ui.data.dataset || zoomHeld() || throwCards().some((el) => el && throwing(el)));   // (R01: and a card on a throw, in or out)
  // (R14: a card change that is only wanted (a font that finished loading, a card's box that changed) while the cards are on their throws is
  // not made under them, nor lost: one pass is queued for when they have landed, whichever of them asked and however many did. A real
  // resize still lays out at once, onResize. The talk and the cards it was asked for must still be the ones on screen.)
  const thrown = () => throwCards().some((el) => el && throwing(el));
  let landQ = false;
  function layoutAtLanding() {
    if (landQ || !ui) return;
    landQ = true;
    const u = ui, s = sess;
    Promise.all(throwCards().map((el) => el && throwLanded(el))).then(() => {
      landQ = false;
      if (ui !== u || sess !== s || !s?.live()) return;
      restPass(() => { if (ui !== u || sess !== s) return; if (cardMoving()) { if (thrown()) layoutAtLanding(); return; } if (cardsStill()) fitCards(ui.data); else layout(); });
    });
  }
  // ── The data card zoomed to the middle of the screen (Mac and iPad landscape; src/ui/card-zoom.js; Mohammad, 28 Oct) ──
  // A tap on an empty part of the instrument's card, or its corner icon, glides the card to the middle and grows it as one piece, its words
  // and pictures larger, never smaller; the veil dims the figure behind, which stays where it is. Nothing pauses: the instrument, the model and
  // the figure run on. Only the layout waits (zoomHeld: a pass asked for meanwhile, zoomMissed, runs once the card is back), because the card
  // is then where the glide put it, not where it rests. A slide, a resize, Esc or a tap outside puts it back first.
  let zoomMissed = false;
  const zoomOn = () => !!ui?.zoom.on;
  // The readings' card may come out or tuck away under the zoomed card once its glide in has ended (the handle, a pull up, the trackpad, the arrow
  // keys; Mohammad, 28 Oct: "allow me to untuck the card when zoomed in to instrument stacked cards and adjust the zoom ease"). The zoom is then
  // fitted again to the whole stack on every frame of it (zoomFollow), so the stack stays in the middle of the screen and whole, smaller as it
  // gets taller and larger as it shortens, and nothing snaps. zoomU0: how far out the readings stood as the card zoomed.
  // (Only where the readings' card rises with its travel, slip.lift: the stack the zoom is fitted to then grows upward, as it models.)
  const zoomSteady = () => !!ui?.zoom.steady;
  const zoomFolds = () => zoomSteady() && slip.lift - slip.base > 0.5;
  let zoomU0 = 0;
  const zoomFollow = (f, trav) => {
    if (!zoomFolds()) return;
    ui.zoom.follow((f - zoomU0) * (trav - LIP), (f - zoomU0) * trav);
  };
  let zoomWas = '';   // (the window and deck as the card went up: zoomSettled refits only if one of them, or the card's fit key, changed meanwhile)
  const zoomKey = () => `${innerWidth}x${innerHeight}|${gen}|${want}`;
  const zoomHeld = () => { if (!ui?.zoom.on) return false; if (!zoomMissed) zoomWas = zoomKey(); zoomMissed = true; return true; };
  // The readings' card comes out as the card zooms (false: it stays tucked, behind the instrument card, and a tap on its handle brings it out).
  const ZOOM_OPENS_READINGS = false;
  // Whether the card may zoom now: it stands whole, on a wide screen, with an instrument, and nothing else is going on.
  // (A slide with no data card at all, such as Sites and causes 2 of 14 whose teaching card holds the site bar, zooms the teaching card alone: the zoom is
  // fitted and centred on the words and their glass, main in zoomOpen; Mohammad, 10 Nov 2026: "when i click on this card on this slide it doesn't zoom in
  // view like other cards". It stood on `zoomCard() && dataStands()`, which a slide without a data card never meets.)
  const wordsAlone = () => ui.data.hidden && !ui.text.hidden && !!ui.text.childElementCount && !ui.text.classList.contains('pz-leave');
  const zoomReady = () => !!ui && !!deck && !!shown && shown.i === want && shown.gen === gen && (!busy || playing) && !leaving && !black && !caseStands() && ui.jump.hidden && !isModalOpen()
    && ui.root.classList.contains('pz-wide') && ((zoomCard() && dataStands()) || wordsAlone()) && !ui.root.classList.contains('pz-prep');
  // (A card with an instrument zooms, and so does a tiles-only card, in every talk (Mohammad, 6 Nov 2026: a tap on the teaching card or the tile
  // card of Left-sided portal hypertension did nothing; only the Circuit talk had opted in). A talk may still opt out with zoomTiles: false.)
  const zoomCard = () => ui.data.classList.contains('has-tool') || (deck?.zoomTiles !== false && !ui.data.hidden);
  const caseStands = () => !!caseCard && !caseCard.flown;
  async function zoomOpen(focus) {
    if (!zoomReady() || ui.zoom.on) return;
    const z = ui.zoom;
    if (ZOOM_OPENS_READINGS && wideSheet(ui.data) && !ui.data.classList.contains('tool-open')) {
      ui.setFold(true);
      await until(() => !ui || !('folding' in ui.data.dataset), 1500);
      if (!zoomReady()) return;
    }
    ui.scope?.close();   // (the scope view shuts as a card zooms: it would stand over the card; Mohammad 6 Nov 2026)
    zoomU0 = underU(ui.data);
    // (The teaching card's glass, the shade, stands at the figure's level, under the page's veil: framed, it is veiled by fscrim, laid under the
    // shade, and the page's veil (zscrim) is clear and only takes the tap back (app.css .pz-fscrim). Its glass is then as bright as the data card's
    // zoomed: Mohammad, 6 Nov 2026, "the teaching card zoomed in has more darkness and less glass than when we zoom in to the data card".)
    if (z.open(focus === 'text' ? { main: [ui.text, ui.shade], scrim: [ui.zscrim, ui.fscrim] } : undefined)) paintZoom();
  }
  // (focus 'text': a tap on the teaching card frames and centres it, the data card riding along; otherwise the data card is the one framed.)
  function zoomToggle(focus) { if (!ui) return; if (ui.zoom.up) ui.zoom.close().then(paintZoom); else zoomOpen(focus); }
  // ── One of the six ladders zoomed to the middle (Sites 10, Where-resistance 14; Mohammad, 29 Oct: "on this slide i feel we should be allowed to
  // click individual ladder cards and have them zoom in similar to how we do it in the slides") ──
  // The same zoom as the data card's (src/ui/card-zoom.js), taken to one cell of the panel's grid: a tap on a cell glides it to the middle of
  // the screen and grows it as one piece, its words and chart only larger; the page and the rest of the panel dim under it, which stays where it
  // is. It goes back by a tap on the cell or outside it, Esc, a slide or a resize, as the card does (zoomOn covers both). Where the grid draws
  // each case on a line (a phone, upright or sideways, an upright iPad) there is no chart to enlarge, and no zoom.
  const cellReady = () => !!ui && !!deck && !!shown && shown.i === want && shown.gen === gen && (!busy || playing) && !leaving && !black && !caseStands() && ui.jump.hidden && !isModalOpen()
    && !ui.panel.hidden && !ui.panel.classList.contains('pz-leave') && !ui.root.classList.contains('pz-prep') && !ui.root.classList.contains('stack') && !ui.root.classList.contains('low');
  function cellOpen(cell) {
    if (!cell || !cellReady() || ui.zoom.on) return;
    const own = cell.parentElement?.querySelector(':scope > .pz-gscrim');
    ui.scope?.close();
    ui.zoom.open({ card: cell, along: [], scrim: [ui.pscrim, own].filter(Boolean), part: true });
  }
  // (A tap on the panel: a zoomed cell goes back, whichever part of the panel it lands on; otherwise the cell under it zooms.)
  function cellTap(e) {
    if (!ui) return;
    if (ui.zoom.up) { ui.zoom.close().then(paintZoom); return; }
    cellOpen(e.target?.closest?.('.pz-cell'));
  }
  const paintZoom = () => {
    if (!ui) return;
    const up = ui.zoom.up;
    ui.zbtn.setAttribute('aria-expanded', String(up)); ui.zbtn.setAttribute('aria-label', up ? 'Put the card back' : 'Enlarge this card'); ui.zbtn.title = up ? 'Put back' : 'Enlarge';
  };
  // (The corner credit sits out the glide as it does a slide change, and comes back once the card is.)
  let zoomCreditOff = null;
  const zoomCredit = (on) => {
    if (on) { zoomCreditOff ||= creditLease.take(); return; }
    zoomCreditOff?.(); zoomCreditOff = null;   // (R02: one hold per glide, given back once)
  };
  // (The words' card behind it eases back to its tucked place as the card zooms in, and to where the readings need it as the card comes back:
  // wordsAt, wordsGlide.)
  const zoomBehind = (up, ms) => { words.held = up; wordsGlide(ms); };
  // (The card is back: a layout asked for while it was up runs now, once.)
  const zoomSettled = () => restPass(() => { if (!ui || !zoomMissed || ui.zoom.on) return; zoomMissed = false; if (zoomKey() === zoomWas && fitDone.get(ui.data) === fitSig(ui.data)) return; fitDone.delete(ui.data); onResize(); });   // (nothing changed while it was up: the card keeps its size, no jump after the zoom)
  let shiftLock = null;   // (the stacked pair's centring, keyed as the words' lock: layout)
  let textLock = null, foldHeld = null;   // (foldHeld: the foldKey the data card was last folded for, layout)
  let fitRO = null, fitRaf = 0, clearRO = null, clearT = 0, paneRaf = 0, fitKids = [], clearFor = null;
  const fitWatch = () => {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    fitRO ||= new ResizeObserver(() => {
      cancelRest(fitRaf);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      fitRaf = restPass(() => { if (ui && cardMoving()) { if (thrown()) layoutAtLanding(); return; } if (ui && cardsStill()) { fitCards(ui.data); return; } if (ui && [ui.text, ui.data, ui.panel].some((el) => !el.hidden && fitDone.get(el) !== fitSig(el) && (el.style.getPropertyValue('--pz-fit') || (({ v, h }) => v > 1 || h > 1)(overflowOf(el))))) layout(); });   // (a shrunk card is fitted again when it changes, so it can grow back)
    });
    // (Watched again only when the cards' children changed: observing a box reports it at once, so re-observing on every pass
    // ran the layout again every frame on a slide sitting still, Circuit 7 on an iPhone some four times a second.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const kids = [ui.text, ui.data, ui.panel].flatMap((el) => [...el.children]);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (kids.length !== fitKids.length || kids.some((c, i) => c !== fitKids[i])) { fitRO.disconnect(); for (const c of kids) fitRO.observe(c); fitKids = kids; }
    // A slide that keeps its figure clear of the cards frames it again as the cards settle to their size (a chart arriving, a line wrapping).
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const again = () => { if (!ui) return; if (!shown || 'folding' in ui.data.dataset) { clearT = setTimeout(again, 150); return; }   // (a slide still coming in: once it is in; a card still folding or pulled: once it rests, so the figure and its labels hold still under the finger)
      if (cardSig() !== framedSig) reframe(400); };   // (only when the cards really changed: the camera framed them once; any slide, so a card that grew never covers its box)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const soon = () => { clearTimeout(clearT); clearT = setTimeout(again, 120); };
    // (The words' glass pane and the figure's insets follow a card that grows after the layout, a chart arriving under the words.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    clearRO ||= new ResizeObserver(() => { cancelRest(paneRaf); paneRaf = restPass(() => { if (!ui) return; if (cardMoving()) { if (thrown()) layoutAtLanding(); return; } if (cardsStill()) fitCards(ui.data); else layout(); }); soon(); });
    if (clearFor !== ui) { clearRO.disconnect(); clearRO.observe(ui.data); clearRO.observe(ui.text); clearFor = ui; }
    ui.data.ontransitionend = ui.text.ontransitionend = soon;   // (a card slides into place: its edge is where it ends, not where it was measured)
  };
  // How far a phone's glass reaches above the words (page px): 16 px, or the deck's tab and 8 px more, so the tab never meets
  // the title. The data card and the words' plan leave room for that reach (layout, phoneTextCap): counted as 16 px, an opened
  // stacked card ended 6 px into the glass, under its tab, Sites 3 on an iPhone, 20 Oct.
  // (The level's tab and the deck's share the glass's top edge; where they would come within 8 px of each other, the deck's gives way.)
  // (Judged with the deck's tab shown, as the layout does below: a tight class left from the last pass hides it.)
  const tabsTight = (k) => {
    const tabEl = ui.shade.querySelector('.pz-tabname'), stab = ui.shade.querySelector('.pz-sitetab:not([hidden])'), was = ui.shade.classList.contains('pz-tabs-tight');
    if (was) ui.shade.classList.remove('pz-tabs-tight');
    const tight = !!(stab && tabEl && readBox(stab).right + 8 * k > readBox(tabEl).left);
    if (was) ui.shade.classList.add('pz-tabs-tight');
    return tight;
  };
  const glassLift = (k) => {
    const tabEl = ui.shade.querySelector('.pz-tabname'), stab = ui.shade.querySelector('.pz-sitetab:not([hidden])'), tight = tabsTight(k);
    if (!tabEl && !stab) return 16;
    const was = ui.shade.classList.contains('pz-tabs-tight');
    if (was) ui.shade.classList.remove('pz-tabs-tight');
    const tabH = Math.max(tabEl && !tight ? readMetric(tabEl, 'offsetHeight') : 0, readMetric(stab, 'offsetHeight') || 0);
    if (was) ui.shade.classList.add('pz-tabs-tight');
    return Math.max(16, tabH + 8);
  };
  // The plate the slide shown lays out (null: none): the windows' rects in the figure's box, the room they take, who runs blood. Mac and iPad landscape only.
  const appN = (name) => parseFloat(app.style.getPropertyValue(name)) || 0;
  function cutoutPlan(s, p, W, H, l, rBase) {
    if (s !== plateSlide) { plateSlide = s; plateOpen = true; }   // (a new slide opens its windows)
    if (!s || p || W < 900 || H < 520) return null;
    const kinds = offeredCutouts(s, { landscape: true, lens: slideLens(s), sinusoid: sinusoidSupported() });
    if (!kinds.length) return null;
    const free = { l: 12 + l, t: Math.max(64, appN('--top-safe') + appN('--cmp-h') + 8), r: W - rBase - 12, b: H - Math.max(90, appN('--bot-occ') || 100) - 8 };
    if (free.r - free.l < 420 || free.b - free.t < 260) return null;
    const col = columnOf(free, kinds);
    // (Shut by its x or by a tap on the liver's spot, a window gives its room back to the figure, which frames itself in it; the spot stays, to open it again.)
    return { kinds, free, rects: plateRects(free, kinds, 'plate'), open: plateOpen, take: plateOpen ? col.colW + 16 : 0, reach: rBase + 18 + col.colW + 16, subject: cutoutSubject(s) };
  }
  // The windows the plan names are shown in the figure, and hidden when it names none (a slide with none, a phone, a deck that closes).
  let plateKey = '', platePlan = null, plateGL = null, plateSlide = null, plateOpen = true;
  function plateApply(plan) {
    platePlan = plan;
    const key = plan ? `${plan.kinds}|${plan.subject}|${plan.open}|${Object.values(plan.rects.lobule || {}).map(Math.round)}` : '';
    if (key !== plateKey) {
      plateKey = key;
      stage.plateLobule?.(plan?.open ? plan.rects.lobule || null : null, !!plan && plan.subject === 'lobule');
    }
    stage.onPlateTap?.(plan ? plateTap : null);
    platePlace(plan);
    // (The camera may still be gliding to the liver's place: the ring is put where the liver is once it has landed.)
    if (plan) stimer(() => { if (ui) platePlace(platePlan); }, 1700);
  }
  // The plate's frame: the room the figure frames itself clear of (a DOM strip the camera reads), and the ring round the lobule's window, the ring on the liver and
  // the cone's two lines, which the GPU draws in the figure's own present (cutout-frame-gl.js: the liver's spot is kept in world units and put through each frame's camera).
  function platePlace(plan) {
    if (!plan || !plan.rects.lobule || !ui) plateGL?.set(null);   // (also when the deck closes: the frame leaves the figure's present)
    if (!ui) return;
    ui.psafe.hidden = !plan?.open;
    const win = plan?.rects.lobule;
    ui.pshut.hidden = !plan?.open || !win;
    if (!plan || !win) return;
    ui.psafe.style.width = `${plan.reach.toFixed(0)}px`;
    // (The close control sits on the window's rim at the upper right, a tap target and nothing more: a static button, put where it goes at rest.)
    ui.pshut.style.left = `${(win.x + win.w / 2 + (win.w / 2) * Math.SQRT1_2 - 14).toFixed(1)}px`;
    ui.pshut.style.top = `${(win.y + win.h / 2 - (win.w / 2) * Math.SQRT1_2 - 14).toFixed(1)}px`;
    const b = stage.focusBox?.({ organs: ['liver'] });
    plateGL ??= createCutoutFrame({ top: () => stage.figureTop?.() ?? null, xform: (o) => stage.figureXform(o) });
    plateGL.set({ win, free: plan.free, open: plan.open, spot: b ? [b[0] + (b[2] - b[0]) * PLATE_SPOT[0], b[1] + (b[3] - b[1]) * PLATE_SPOT[1]] : null });
  }
  // (Shut or opened again: by the x, or by a tap on the liver's spot, as the scope view's ring is tapped. The figure frames itself again in the room that is left.)
  function plateSet(open) {
    if (plateOpen === open || !platePlan) return;
    plateOpen = open;
    layout();
  }
  function plateTap(cx, cy) {
    const r = stageBox();
    if (!platePlan || !plateGL || !r || !plateGL.hit(cx - r.left, cy - r.top)) return false;
    plateSet(!plateOpen);
    return true;
  }
  function layout() {
    if (!ui) return;
    if (zoomHeld()) return;   // (the zoomed card is not where it rests: it is laid out once it is back, zoomSettled)
    zoomMissed = false;
    // k: screen px per CSS px of the figure's box (1 unless the page is scaled): rects are screen px, inline sizes are the page's own (screen / k).
    const p = phone(), wr = readBox(wrap), W = wr.width, H = wr.height, k = wr.width / (readMetric(wrap, 'clientWidth') || wr.width) || 1;
    ui.root.classList.toggle('stack', p); ui.shade.classList.toggle('stack', p);
    ui.root.classList.toggle('tab', p && tabUp()); ui.shade.classList.toggle('tab', p && tabUp()); ui.text.classList.toggle('pz-tabgap', !!(ui.shade.querySelector('.pz-tabname') || ui.shade.querySelector('.pz-sitetab:not([hidden])')));   // (a tabbed card keeps half a tab's height clear under the strip: styles/app.css .pz-tabgap)
    // (A phone held sideways takes the Mac and iPad landscape layout, 3 Nov 2026, Mohammad: "the cards on the left both of them, tuck and untuck like Mac":
    // the words' card and the data card stacked at the left, its readings' card tucked under, the compact .pz.short sizes. `low`, the old split
    // layout (words left, instruments right behind Show), is never set now; its branches stay for the one-step revert.)
    const low = false;
    // (A wider screen under 860 px tall, an iPad on its side or a short Mac window: the compact layout, tighter cards at the roles'
    // own sizes whose lettering never zooms under 12 px, shortFit; styles/app.css .pz.short.)
    const short = !p && !low && H / k <= SHORT_H;
    ui.root.classList.toggle('short', short);
    const cardOn = TEXT_CARD && !p;   // (a phone held sideways too: its words in a floating card, not a panel at the edge)
    ui.root.classList.toggle('pz-card', cardOn); ui.shade.classList.toggle('pz-card', cardOn);
    ui.root.classList.toggle('low', low); ui.shade.classList.toggle('low', low);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const off = (el) => el.hidden || (el === ui.data ? 'gone' in el.dataset : el.classList.contains('pz-hide'));   // (a card only easing out and back in for the next slide still counts, where it rests: the camera frames once)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const r = (el) => (off(el) ? null : restBox(el));
    // The words' sizes settle once per slide, before its cards enter: a later pass (a reading ticking, the data card growing)
    // keeps them, so the teaching card's text never changes size while it is in view. (A new text size in Settings is a new layout:
    // kept, a card folded at 200% stayed folded back at 100%.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const at = shown || entering, lockKey = at ? `${at.gen}:${at.i}:${W.toFixed(0)}x${H.toFixed(0)}:${stage.labelScale()}` : null, lock = lockKey && textLock?.key === lockKey ? textLock : null;
    // (A ladder's fold holds for the slide being drawn, from its first measure: keyed by the slide wanted, not the one shown, so
    // the fold found while its cards come in is kept once it shows. Keyed by the slide shown, the card unfolded for a moment
    // as it came in at 200%, then folded again.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const foldKey = `${gen}:${want}:${W.toFixed(0)}x${H.toFixed(0)}:${stage.labelScale()}`;
    ui.text.style.removeProperty('--pz-tk'); ui.text.style.removeProperty('--pz-bk'); ui.text.classList.remove('pz-nocauses');
    ui.text.style.maxHeight = '';   // (the last pass's cap would shrink the words to a room they no longer have)
    // (A phone's words keep clear of the pill and the colour key first: the room they leave (--pz-reach, --pz-fkrow) is part
    // of the fit. Placed only after it, the words were fitted to the last slide's key and kept that fit: Circulation slide 2
    // on an iPhone came in at 0.814 and took 0.847 on the next refit, or the other way round.)
    if (phone()) placeBar();
    // A phone keeps a fixed share of its height for the figure between the data card and the words (FIG_MIN), so the readings a
    // slide teaches always have room to show: the words' card is capped to what is left (their fit then sets them a little
    // smaller), decided once per slide and size, so it never changes while the slide is in view. (Capped only at 62 % before:
    // with a tall data card, a 667 px iPhone kept 24 to 70 px of figure on a dozen slides and Circuit 2 hid its R liver.)
    // (Before the words are measured for the phone's cap: measured with the full names on two rows, the card kept 12 px it no longer needed.)
    abShort(ui.text, true);   // (a row that would wrap takes its compact labels on every screen)
    // (A phone's card with a second part keeps that part on its sheet (.pz-lip, dockVec); each slide arrives partly open.)
    // (Mac and iPad landscape: the same, stacked under the words, every instrument with readings, the Gut to heart chart too: pz-wide.)
    const wide = cardOn && !low;
    ui.root.classList.toggle('pz-wide', wide);
    const dd0 = ui.data, sheet = (p || wide) && dd0.classList.contains('has-tool') && !dd0.classList.contains('tool-only');
    // (An upright phone's or tablet's sheet stays opaque while it is out and fades its parts instead, styles/app.css: a card that
    // becomes one, or stops being one, while it is out takes its new state at once, so its glass never shows, fading, between two slides.)
    if (sheet !== dd0.classList.contains('pz-sheet') && (p || wide) && dd0.classList.contains('pz-hide')) {
      const was = dd0.style.transition;
      dd0.style.transition = 'none'; dd0.classList.toggle('pz-sheet', sheet); void readMetric(dd0, 'offsetWidth'); dd0.style.transition = was;
    }
    dd0.classList.toggle('pz-sheet', sheet);
    if (!p) dd0.classList.toggle('pz-beside', !sheet && dd0.hasAttribute('data-beside') && !dd0.classList.contains('pz-folds'));   // (the readings' card holds the tiles: none beside the instrument)
    if ((p || low) && dd0.classList.contains('pz-folds')) dd0.classList.remove('pz-folds');   // (a wider screen's fold, left by a window made narrow)
    // (Mac and iPad landscape too: each slide comes in with its readings tucked, the words whole; they come out on a pull or a tap.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (sheet && dd0.classList.contains('tool-open') && dd0.dataset.openFor !== String(want)) { stopUnder(); dd0.classList.remove('tool-open'); }
    // (The readings' travel (--pz-d) is measured once, by fitCards at the fit it ends with, never here: 2 Nov 2026's stale-travel case is covered because every new slide refits.)
    const phoneCap = p ? phoneTextCap(lockKey, H, k) : null;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (phoneCap != null) ui.text.style.maxHeight = `${phoneCap.toFixed(1)}px`;
    if (p) autoDock(phoneShut); else if (!low) autoDock(false);
    // A phone held sideways: its card stands level with the data card at the top right (one margin from the top without one), its
    // top padding tall enough for the deck's tab beside the title (padT), one margin from the foot. The words' room is set before
    // they are fitted, the same room the card is given below, so they are fitted once to the room they keep.
    const vm = LOW_M * k;
    let padT = 0, pad0 = 0;
    if (cardOn && low) {
      pad0 = (readMetric(ui.text, 'offsetLeft') - readMetric(ui.shade, 'offsetLeft')) * k; const tab = ui.shade.querySelector('.pz-tabname') || ui.shade.querySelector('.pz-sitetab:not([hidden])');
      padT = Math.max(pad0, readMetric(tab, 'offsetHeight') ? (readMetric(tab, 'offsetHeight') + 6) * k : 0);
      const top = off(ui.data) ? vm : r(ui.data).top - wr.top;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      ui.text.style.maxHeight = `${Math.max(0, (H - top - padT - pad0 - vm) / k).toFixed(1)}px`;
    }
    fitCards(ui.text);
    let t = r(ui.text);
    if (cardOn && low && t && lowKey(t, r(ui.data), padT, pad0, vm, wr, H, k)) { fitDone.delete(ui.text); fitCards(ui.text); t = r(ui.text); }
    const sl = readMetric(ui.shade, 'offsetLeft') * k, sm = Math.min(sl, Math.max(sl - insetL() * k, 8 * k)), pad = cardOn && t ? t.left - wr.left - sl : 0, dd = ui.data, ts = ui.text.style;
    if (!(cardOn && low)) padT = pad;
    // On a laptop or tablet the data card always stacks under the words' card, at its width, a gap below it (0.6 of the margin),
    // above the controls; what does not fit is made smaller in fixed steps, never moved to the top right. A card in view that
    // changes place fades out, moves while unseen and fades back in.
    let below = false, gap = 0, cw = 0, foot = H, wordsCap = Infinity;   // (wordsCap: the height the words' card is held to where the data card needs the room, below)
    slip.base = 0;
    const top0 = cardOn && t ? sm : 0;   // (the cards' top: one margin from the top, as from the side)
    if (cardOn && !low && t && !off(dd)) {
      gap = Math.round(0.6 * sm); cw = t.right - wr.left + pad - sl;
      // (Folding the instrument behind Show is the last step, below: each new measure starts unfolded. It snaps while the card is
      // measured, so the measure sees where it rests; a tap on Show or Hide then eases it.)
      const canFold = dd.classList.contains('has-tool') && !dd.classList.contains('tool-only') && !dd.classList.contains('tool-lead') && !dd.classList.contains('pz-sheet');   // (a stacked card tucks its readings instead)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const setFolds = (on) => {
        if (dd.classList.contains('pz-folds') === on) return;   // (unchanged: a pass mid-ease must not cut a Show or Hide short)
        if (on) dd.classList.remove('pz-lt', 'pz-lt2');   // (folded, the compact layout's steps run again from the loosest)
        const tl = dd.querySelector(':scope > .pz-tool');
        if (tl) tl.style.transition = 'none';
        dd.classList.toggle('pz-folds', on); dd.classList.toggle('pz-beside', !on && dd.hasAttribute('data-beside'));
        if (tl) { void readMetric(tl, 'offsetHeight'); tl.style.transition = ''; }
      };
      // (A card already folded for this slide at this size stays folded until the slide is shown and its words lock: unfolded
      // and folded again on every pass, the foot row under the words was made anew each time, the words fitted without it, and
      // the next pass came at once; the data card flashed in and out and the words' card jumped until the slide had settled.
      // Sites 9 on a Mac, 17 Oct.)
      const held = !lock && foldHeld === foldKey && dd.classList.contains('pz-folds');
      if (!lock && !held && dd.classList.contains('pz-folds')) setFolds(false);
      const q = ui.bar.hidden || !readMetric(ui.bar, 'offsetWidth') ? null : readBox(ui.bar);
      foot = q && q.left - wr.left < sl + cw ? q.top - wr.top - gap : H - sm;
      let ch = colHeight(cw / k) * k, dk = 1;
      const slack = dd.classList.contains('col') ? 8 : 0;
      below = top0 + t.height + 2 * pad + gap + ch <= foot + slack;
      // Too tall to stack: the words' card gives way first, only a little: from Regular to Compact, its title and words each one
      // fixed step (card-type.js WIDE, so every slide reads at one of two sizes and its title always well above its words; its column
      // never widens: every slide keeps one card width), then the data card's blocks step smaller (DK). At the last step the pair
      // stays stacked and the data card's own fit does the rest.
      // (trim: the words' card's last steps, below. 1: the title one step further down (WIDE.tight); 2: and the CAUSES line gone.)
      let trim = 0;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const put = (tk, bk) => { ui.text.style.setProperty('--pz-tk', trim ? Math.min(tk, WIDE.tight) : tk); ui.text.style.setProperty('--pz-bk', bk); ui.text.classList.toggle('pz-nocauses', trim > 1); t = r(ui.text); return top0 + t.height + 2 * pad + gap + ch <= foot; };   // (no slack once shrunk: the data card is never squeezed)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const title = () => put(1, 1) || put(WIDE.title, WIDE.words);   // (Regular, else Compact)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const foldH = (s) => colHeight(cw / k, s);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const stepDk = (s) => { dk = s; ch = foldH(s) * k; };
      // (The words stay Compact while the blocks step down: one size for the words, whatever the data card needs.)
      // (The compact layout steps its blocks tighter instead (.pz-lt, .pz-lt2), never smaller: its lettering stays 12 px, shortFit.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const ladder = () => {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (short) { for (const c of ['pz-lt', 'pz-lt2']) { if (below) break; dd.classList.add(c); ch = colHeight(cw / k) * k; below = put(WIDE.title, WIDE.words); } return; }
        for (const s of DK) { if (below) break; stepDk(s); below = put(WIDE.title, WIDE.words); }   // (the data card's blocks a step or two smaller: no further, or the words would squeeze)
      };
      // When even the smallest blocks leave the pair too tall, the words' card gives way once more before anything is cut off: its title one
      // step down, then the CAUSES line gone, the blocks stepping again from full size under each (Mohammad, 23 Oct, Sites 4 on a Mac at a
      // larger text size: a tall title and a long CAUSES line left the Gut to heart chart cut off). Only a slide the steps above could not fit
      // comes here, so every slide that fitted stays as it was.
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const squeeze = () => {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        for (const n of [1, 2]) {
          trim = n; dd.classList.remove('pz-lt', 'pz-lt2'); stepDk(1);
          below = put(WIDE.title, WIDE.words);
          if (!below && n === 2) ladder();
          if (below) return;
        }
      };
      // The last step when even the smallest blocks leave the pair too tall: the instrument folds behind Show (as on a phone),
      // its tiles in a row under the header at the card's full width, and the steps run again from full size.
      // (Not for a slide whose instrument is its point (tool-lead), nor a card that holds only the instrument.)
      if (lock) {
        for (const [n, v] of lock.vars) if (v) ts.setProperty(n, v);
        ui.text.classList.toggle('pz-nocauses', !!lock.nc);
        if (lock.folds) setFolds(true);
        t = r(ui.text); below = lock.below; dk = lock.dk; cw = t.right - wr.left + pad - sl; ch = foldH(dk) * k;
      } else {
        // (The words at Compact at the one card width, then the steps below; the column never widens.)
        if (held) stepDk(1);
        dd.classList.remove('pz-lt', 'pz-lt2'); ch = foldH(dk) * k;
        below = title();
        if (!below) ladder();
        if (!below) squeeze();
        if (!below && canFold && !held) { setFolds(true); trim = 0; ts.removeProperty('--pz-tk'); ts.removeProperty('--pz-bk'); ui.text.classList.remove('pz-nocauses'); stepDk(1); below = title(); if (!below) ladder(); }
        if (!below && !held && dd.classList.contains('pz-folds')) squeeze();   // (folded just now: the same last steps again)
        // (Still too tall at the smallest step: the pair stays stacked at the one card width, the words at their smallest (the title one step
        // down and no CAUSES line) and the blocks at their smallest step; the data card is never moved to the top right, its own fit (fitCards)
        // makes the rest fit its room.)
        // (A phone held sideways, 3 Nov 2026, Mohammad: "the instrument card should look good even if the text of the teaching card is smaller": the instrument
        // keeps its size and the words' card shrinks further, the title and the words a few steps below Compact, until the pair stands in the 390 px.)
        if (!below && H <= 500 * k) { trim = 2; for (const [tk, bk] of SIDEWAYS_WORDS) { if (below) break; below = put(tk, bk); } }
        if (!below) { put(WIDE.title, WIDE.words); below = true; }
      }
      if (dk < 1) dd.style.setProperty('--pz-dk', dk); else dd.style.removeProperty('--pz-dk');
      foldHeld = dd.classList.contains('pz-folds') ? foldKey : null;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (lockKey && !lock) textLock = { key: lockKey, below, dk, folds: dd.classList.contains('pz-folds'), nc: ui.text.classList.contains('pz-nocauses'), vars: ['--pz-tk', '--pz-bk'].map((n) => [n, ts.getPropertyValue(n)]) };
      // (A Gut to heart chart is drawn at its own size, never zoomed by the fit, and has a smallest height. Where the pair is too tall for it
      // even at the smallest steps, the words' card eases up with the data card, its top slipping behind the screen's top if need be, so the
      // chart stays whole in its card instead of spilling past the screen (Mohammad, 22 Oct: "It's ok if the top of the teaching card slips
      // behind upper part of the screen as the info below is more pertinent"). The readings add their own rise on top, slip.lift.)
      if (wideSheet(dd) && dd.hasAttribute('data-ladder')) {
        const b = Math.max(0, Math.min(top0 + t.height + 2 * pad + gap + ch - foot, t.height + 2 * pad + gap)) / k;
        slip.base = b > 0.5 ? b : 0;
      }
    } else dd.style.removeProperty('--pz-dk');
    const isCol = dd.classList.contains('col');
    if (below !== isCol) {
      if (colT) below = isCol;   // (a move under way: the card moves once it has faded out)
      // (Not after its fade (swapNow: it moves now, though a slow frame left it not quite faded; it had stayed stacked under the
      // words for good when an iPad was turned upright), nor on a resize or a turn, where everything moves at once: faded there,
      // it showed over the words' card for a moment while the words had already moved.)
      else if (!swapNow && !ui.root.classList.contains('pz-turning') && !dd.hidden && !reduce.matches && (dd.classList.contains('pz-sheet') ? !dd.classList.contains('pz-hide') : +readStyle(dd).opacity > 0.05)) {
        below = isCol;
        if (!dd.classList.contains('pz-hide')) {
          dd.classList.add('pz-hide'); dd.dataset.colswap = '';
          // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
          colT = stimer(() => { colT = 0; if (!ui) return; const mine = 'colswap' in ui.data.dataset; delete ui.data.dataset.colswap; swapNow = true; try { layout(); } finally { swapNow = false; } if (mine) ui.data.classList.remove('pz-hide'); }, 340);
        }
      }
    }
    if (below !== isCol) { dd.style.transition = 'none'; dd.classList.toggle('col', below); }
    if (off(dd) || below) delete dd.dataset.safe; else dd.dataset.safe = p ? 'top' : 'right';
    // (The sheet's edge under the card is part of it for the camera: left out, the room between the cards was taken 24 px taller
    // than it is, and the figure sat that much high.)
    if (dd.dataset.safe) ui.lip.dataset.safe = dd.dataset.safe; else delete ui.lip.dataset.safe;
    const lipK = below && wideSheet(dd) ? LIP * k : 0;   // (a wide stacked card: its readings' card's tucked edge above it)
    let y = top0 + t?.height + 2 * pad + gap + lipK;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.left = below ? `${(sl / k).toFixed(1)}px` : '';
    // (One width on every slide: stacked or at the top right, the data card is always the teaching card's width, whatever it holds.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.width = cw ? `${(cw / k).toFixed(1)}px` : '';
    dd.style.maxWidth = cw ? 'none' : '';   // (no per-content cap: tiles, an instrument or a chart never make it narrower)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.top = below ? `${(y / k).toFixed(1)}px` : '';
    dd.style.maxHeight = below ? capOf(dd, (foot - y) / k) : '';
    // (A phone: the data card ends 8 px short of the teaching card (where its glass begins, glassLift), however much it holds: an opened instrument had grown over the words.)
    // (And leaves the figure its share: FIG_MIN between the two cards.)
    // (Partly open, its sheet's edge (LIP) stands below it in that room too. A card that came in closed (phoneShut) leaves the figure
    // its share only while closed: brought back by the reader it may cover the figure, never the words.)
    // (The sheet's edge comes out of the figure's share, not the card's: taken from the card, it shrank the instrument and tiles to
    // 90-99 %, Endoscopy 4 on an iPhone. And 2 px more: the card's border and rounding had left it 99.6 %.)
    if (p && t) { const cs = readStyle(dd), lip = lipOn(dd) ? LIP : 0, fig = phoneCap != null && !phoneShut && !dd.classList.contains('tool-open') && !('folding' in dd.dataset) ? Math.max(0, phoneFig / k - lip - 2) : 0;
      const room = Math.floor((t.top - wr.top) / k - (parseFloat(cs.top) || 0) - glassLift(k) - 8 - lip - fig);
      // (An upright phone's stacked card grows by its readings' card as that slides out or back (--pz-grow, styles/app.css): capped
      // at its tucked height mid-slide, the card's box came out shorter than the instrument, so the instrument card's glass, which ends
      // the readings' travel above the box's foot, cut through the portal blood bar's names, Mohammad on an iPhone, TIPS Doppler 3, 20 Oct.)
      // (Its cap is the tucked card's in every state, readings out or not, and the readings' share is added on top (--pz-grow), never
      // past the room an opened card has: fitted against the opened card's larger room, the instrument came out bigger the moment the
      // readings came out, and its chart snapped to the new size, Sites 3 on an iPhone, 20 Oct. fitCards fits it with --pz-grow at the readings' share (--pz-d),
      // so open or tucked it is fitted against one cap and keeps one size.)
      if (splitSheet(dd)) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        const tuck = cs.getPropertyValue('--pz-cap').trim() || 'none';
        const base = (t.top - wr.top) / k - (parseFloat(cs.top) || 0) - glassLift(k) - 8;
        const roomT = Math.floor(base - LIP - (phoneCap != null && !phoneShut ? Math.max(0, phoneFig / k - LIP - 2) : 0)), roomO = Math.floor(base);
        // (No tucked room at all, a tiny screen or a very large text size: the tucked cap is the card's own, as before, and the opened card's
        // room still caps it, so it never runs under the words. The same cap open or tucked either way, so the fit never changes on opening.)
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        const capT = roomT > 0 ? (tuck === 'none' ? `${roomT}px` : `min(${tuck}, ${roomT}px)`) : tuck;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (roomO > 0) dd.style.maxHeight = capT === 'none' ? `${roomO}px` : `min(calc(${capT} + var(--pz-grow, 0px)), ${roomO}px)`;
        // (A picture's room, --pz-ph: 0.6 of the tucked card's own height cap, worked out from the card's box and its cap here, no content measured.
        // The stylesheet gives each picture min(its height times the fit, this, never under the picture's own least), so none is taller than the card holds.)
        const capPx = Math.min(roomT > 0 ? roomT : Infinity, ...[...tuck.matchAll(/([\d.]+)(%|px)/g)].map((m) => (m[2] === '%' ? m[1] / 100 * wr.height / k : +m[1])));
        if (Number.isFinite(capPx)) dd.style.setProperty('--pz-ph', `${Math.floor(capPx * 0.6)}px`); else dd.style.removeProperty('--pz-ph');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      } else { dd.style.removeProperty('--pz-ph'); if (room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`; } }
    // (A wider screen: a data card at the top right ends 8 px above the colour key standing on the nav pill (a phone held sideways had covered it).)
    if (!p && !below && ui.fk.dataset.empty == null && !ui.bar.hidden) {
      const f = ui.fk, was = f.hidden; f.hidden = false; const q = readBox(f); f.hidden = was;
      const cs = readStyle(dd), room = Math.floor((q.top - wr.top) / k - (parseFloat(cs.top) || 0) - 8 - (lipOn(dd) ? LIP : 0));
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (q.width && room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`;
    }
    if (below !== isCol) { void readMetric(dd, 'offsetWidth'); dd.style.transition = ''; }
    chipRoom(dd);
    const beside = low && tabBeside();
    fitCards(ui.data, ui.panel);
    if (beside && !tabBeside()) { fitDone.delete(ui.panel); fitCards(ui.panel); }
    // The words give way once more for a data card its own fit cannot make whole. At a large text size on a Mac or an iPad on its side, a
    // card holding the Gut to heart chart (drawn at its own size, never zoomed by the fit, with a smallest height) or readings that would
    // have to pass half size still ended below its card, cut off by it, the stacked pair being taller than the screen (HVPG 7 at 200 %: the
    // chart's axis names gone). The words' card, which zooms as a whole, takes what the data card lacks, down to the size where its smallest
    // lettering is still 12 px on the screen (only at a text size above 100 %: the usual size is laid out exactly as it was), and the data card is fitted again in the room
    // that gains it. A card that fits is never touched. (A readings' sheet is measured with its readings tucked, as it rests: its
    // instrument or chart is what the card must hold, and the readings still rise from under it, slip.lift.)
    if (below && t && !off(dd) && !phone() && stage.labelScale() > 1.001) {
      for (let n = 0; n < 3; n++) {
        const cut = overflowOf(dd).v;
        if (!(cut > 1)) break;
        const have = t.height / k, z = wordsFloor();
        if (z >= 1) break;
        const room = Math.max(wordsHeightAt(z), have - cut);
        if (!(room < have - 0.5)) break;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        wordsCap = room; ts.maxHeight = `${room.toFixed(1)}px`;
        fitDone.delete(ui.text); fitCards(ui.text); t = r(ui.text);
        y = top0 + t.height + 2 * pad + gap + lipK;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        dd.style.top = `${(y / k).toFixed(1)}px`; dd.style.maxHeight = capOf(dd, (foot - y) / k);
        fitDone.delete(ui.data); fitCards(ui.data);
      }
    }
    // The stacked pair shorter than the screen is centred top to bottom as one (equal room above and below, never closer than one margin
    // to the top or the controls); a pair that fills the screen stays where it is. Set here, before the cards come in, so nothing moves after.
    let shift = 0;
    if (below && t && !off(dd)) {
      // (A stacked card counts with its readings tucked and their card's foot under it, whatever share of them is out: the pair is centred
      // for the tucked card, and rises from there only as far as the readings need, slip.lift.)
      const ws = wideSheet(dd);
      const dpx = ws ? parseFloat(dd.style.getPropertyValue('--pz-d')) || 0 : 0;
      const tuckH = ws ? readMetric(dd, 'offsetHeight') - underU(dd) * dpx + LIP : readMetric(dd, 'offsetHeight');
      // Centre against the chart's destination too: a chart still growing must not lend its temporary
      // empty space to a downward move that would leave too little room for its final height.
      const cardH = !ws && parseFloat(dd.style.getPropertyValue('--ft-card')) || tuckH;
      const stackH = t.height + 2 * pad + gap + cardH * k;
      shift = Math.max(0, Math.min((H - stackH) / 2 - top0, foot - top0 - stackH));
      // (Centred once per slide: while only the data card's readings change (a time-lapse, a what-if slider), the pair keeps the place
      // it came in at, so the words never ride up and down with a reading that measured a pixel taller.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (lockKey && shiftLock?.key === lockKey && readingsOnly()) shift = shiftLock.v; else if (lockKey) shiftLock = { key: lockKey, v: shift };
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (shift > 0.5) { dd.style.top = `${((y + shift) / k).toFixed(1)}px`; dd.style.maxHeight = capOf(dd, (foot - y - shift) / k); } else shift = 0;
      // (How far the words rise with the readings all out: the readings' whole travel, so the instrument card never moves (Mohammad, 22 Oct:
      // "It's ok if the top of the teaching card slips behind upper part of the screen as the info below is more pertinent").)
      if (ws) slip.lift = dpx + slip.base;   // (in all: a Gut to heart chart's own rise, slip.base, and then the readings' travel)
    }
    if (!(below && t && wideSheet(dd))) { slip.lift = 0; slip.base = 0; }
    liftTo(underU(dd));
    fitWatch();
    const dv = dockRest();
    const d = below ? null : r(ui.data);
    // The words' card is only as tall as the words. With a data card beside or under it, its top is level with the data
    // card's place at the top right and the words start one padding below it; without one, the words stay centred and the card wraps them.
    // (With no data card the card is centred top to bottom, never closer than one margin to either edge.)
    // (A phone held sideways: level with the data card at the top right, or centred with no data card, one margin (LOW_M) from the
    // top and the foot; the deck's tab sits in its taller top padding, padT.)
    const lvl = cardOn && low && t ? (d ? d.top - wr.top : Math.max(vm, (H - t.height - pad - padT) / 2)) + padT
      : cardOn && t ? (d && !below ? d.top - wr.top : off(dd) ? Math.max(sm, (H - t.height - 2 * pad) / 2) : top0 + shift) + pad : null;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ts.top = lvl != null ? `${(lvl / k).toFixed(1)}px` : ''; ts.bottom = ts.marginBlock = lvl != null ? 'auto' : '';
    if (lvl != null) ts.marginBlock = '0';
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ts.maxHeight = lvl != null ? `${Math.min((H - lvl - pad - (low ? vm : sm)) / k, wordsCap).toFixed(1)}px` : phoneCap != null ? `${phoneCap.toFixed(1)}px` : '';   // (one margin at the bottom too)
    if (t) t = r(ui.text);   // (always: the words may already stand there, and the glass is sized to where they are)
    // The words sit on a frosted glass pane: the figure shows through it blurred, behind a crisp edge with a soft
    // shadow. The figure frames itself just past that shadow, so nothing it frames is hidden.
    // (On a phone the words sit at the bottom, over the Back/Next bar, and the data card at the top: B is the height
    // from the words' top edge down to the bottom of the figure.)
    const L = t ? t.right - wr.left : 0, B = t ? H - readMetric(ui.text, 'offsetTop') * k : 0;
    // (The words' card: as far past the words on the right as its left edge is before them.)
    const card = cardOn && t ? L + pad - sl : 0;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ui.shade.style.width = !p && t ? `${(card || L + 36) / k}px` : '';
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ui.shade.style.height = !p && cardOn && t ? `${(t.height + pad + padT) / k}px` : '';
    // (A phone's glass reaches 16 px above the words, or the deck's tab and 8 px more: the tab never meets the title.)
    // (The level's tab and the deck's share the glass's top edge; where they would come within 8 px of each other, a long deck
    // name on a narrow phone, the deck's gives way: the level is what the slide teaches.)
    ui.shade.classList.remove('pz-tabs-tight');
    if (t && tabsTight(k)) ui.shade.classList.add('pz-tabs-tight');
    const lift = p && t ? glassLift(k) : 16;
    // (The words' rect carries the stacked pair's rise, --pz-rise, which the glass takes by its own translate: read back without it.)
    const lf = (parseFloat(ui.text.style.getPropertyValue('--pz-rise')) || 0) * k;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ui.shade.style.top = p && t ? `${readMetric(ui.text, 'offsetTop') - lift}px` : cardOn && t ? `${(t.top - wr.top - padT + lf) / k}px` : '';
    if (ui.shade.style.getPropertyPriority('opacity') !== 'important') ui.shade.style.opacity = t ? '1' : '0';   // (not over a throw's own: card-throw.js writes it important while it moves the glass or holds it out)
    ui.safe.hidden = !t;
    ui.safe.dataset.safe = p ? 'bottom' : 'left';
    frameL = !p && t ? (card ? sl + card + 24 : L + 48) : 0;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ui.safe.style.width = p ? '' : `${frameL / k}px`;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ui.safe.style.height = p ? `${(B + Math.max(34, lift * k + 4)) / k}px` : '';
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const set = (k, v) => { const px = `${Math.max(0, Math.round(v))}px`; insets.put(k, px); };
    set('--pz-l', frameL);
    const rBase = !p && d ? W - (readMetric(ui.data, 'offsetLeft') + dock.to * dv[0]) * k + 8 : 0;   // (where the card comes to rest: past its entry shift, at its dock)
    // Three scales on one plate (slide field cutouts, docs/cutouts.md): the windows take a column beside the data card, and the figure frames in what is left.
    const plan = cutoutPlan(at ? slides[at.i] : null, p, W, H, frameL, rBase);
    set('--pz-r', rBase + (plan ? plan.take : 0));
    plateApply(plan);
    set('--pz-t', p && d ? (readMetric(ui.data, 'offsetTop') + readMetric(ui.data, 'offsetHeight') + (lipOn(ui.data) ? LIP : 0) + dv[1] * dock.to) * k + 4 : 0);   // (offsets: a card coming in is still shifted by its entry transform)
    set('--pz-b', p && t ? B + 34 : 0);
    if (!dock.drag) { dockPaint(); placeLip(); }   // (the edge's place, read here at rest: a glide's frames only move it)
    // (The corner icon is offered where the card has room to grow, and only on a wide screen with an instrument: card-zoom.js.)
    ui.data.classList.toggle('pz-zoomable', wide && !ui.data.hidden && zoomCard() && !!ui.zoom.plan());
    placeBar();
    if (!insets.held) dispatchEvent(new Event('pps:occ'));
  }
  // (2 Nov 2026, the labels thread: the room the new cards leave (--pz-l, --pz-t...) was written as their layout ran, before the camera set
  // off, so the figure's labels were laid out once for the new room under the old camera: an organ's name under the coming card faded out
  // for about 0.3 s, then came back where the glide landed. Through a slide change whose camera moves, that room is held back and written
  // as the glide starts (frameTo reads it then, to frame for it), and the labels are laid out once, where it lands.)
  const insets = createInsetHold(app.style);
  const occ = () => dispatchEvent(new Event('pps:occ'));
  function insetsHold() { insets.hold(occ); }
  /** Writes the held room now; tells the figure (pps:occ) unless `quiet` (the glide about to start tells it once it has). */
  function insetsGo(quiet = false) { if (insets.go() && !quiet) occ(); }
  // A row of choices is one row: where its full names would wrap (five treatments on a 375 to 430 px iPhone), each button that has
  // one takes its compact label (the full name stays its accessible name and tooltip), never a second row or a smaller size.
  function abShort(root, may) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const row of root.querySelectorAll('.pz-ab')) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const bs = [...row.querySelectorAll('.pz-abb[data-short]')];
      if (!bs.length) continue;
      for (const b of bs) b.textContent = b.dataset.full;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const tops = () => new Set([...row.querySelectorAll('.pz-abb')].map((b) => Math.round(readMetric(b, 'offsetTop')))).size;
      if (may && (tops() > 1 || readMetric(row, 'scrollWidth') > readMetric(row, 'clientWidth') + 1)) for (const b of bs) b.textContent = b.dataset.short;
    }
    // (A phone on its side: the row of choices at the largest size that holds it on one line, never under 12 px on the screen nor
    // over its own size; the card's fit, which took the four lens buttons to 11 px at 150 %, never sets it.)
    if (!ui.root.classList.contains('low')) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const row of root.querySelectorAll(':scope > .pz-ab')) {
      const b = row.querySelector('.pz-abb'), host = row.parentElement;
      if (!b || !readMetric(host, 'clientWidth')) continue;
      row.style.zoom = '1'; row.style.flexWrap = 'nowrap'; row.style.width = 'max-content'; row.style.maxWidth = 'none';
      const nat = readBox(row).width + 2, cs = readStyle(host), avail = readMetric(host, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      row.style.flexWrap = row.style.width = row.style.maxWidth = '';
      const fs = parseFloat(readStyle(b).fontSize) || 12;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      row.style.zoom = String(Math.max(12 / fs, Math.min(1, avail / nat)).toFixed(3));
    }
  }
  // The figure's share of a phone's height (between the data card and the words' glass), and the words' cap that keeps it.
  // Where the figure's share, the data card and the words at 12 px or more cannot all fit, the data card folds to its header
  // behind Show (the button that already folds a phone's instrument): the card takes its folded size at once, never easing in view.
  const FIG_MIN = (H) => Math.round(Math.max(170, 0.3 * H));
  // (Words that would fit at Regular with a little of the figure's share take it, down to FIG_REG, rather than drop a whole step to
  // Compact and leave that room empty: PVT in cirrhosis 5 on an iPhone came in at Compact over 100 px of bare figure, Mohammad, 20 Oct:
  // "This teaching card could be larger with larger text".)
  const FIG_REG = (H) => Math.round(Math.max(170, 0.25 * H));
  let phoneLock = null, phoneShut = false, phoneFig = 0;   // (phoneFig: the figure's share the slide's plan keeps, screen px)   // (phoneShut: the slide's data card comes in closed (autoDock), too tall beside the words and the figure)
  function phoneTextCap(key, H, k) {
    const dd = ui.data, ds = dd.style, gone = dd.hidden || 'gone' in dd.dataset;
    const held = key && phoneLock?.key === key ? phoneLock : null;
    // (Also while a what-if slider or a compare button drives the live model (liveOff): its data card changes only its numbers,
    // and re-planned on every live reading that measured a pixel taller, the words' cap stepped and the teaching card shook
    // under the finger on a phone, Sites 4's clot slider. The plan made as the slide came in holds until the next slide.)
    // (And through a time-lapse, while it plays and once it has ended: its data card changes only its readings as the days run, a
    // varix appearing on the scope, and re-planned whenever one measured a pixel taller, the words' cap stepped and the teaching card
    // bounced as the days passed, Endoscopy 3 on an iPhone, 18 Oct.)
    if (held && (held.shut || gone || readingsOnly())) { phoneShut = held.shut; phoneFig = held.fig; return held.cap; }
    phoneShut = false; phoneFig = FIG_MIN(H);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const natural = (el, st, fit = 0) => {   // (as it stands unfitted and uncapped; or at that fit)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const sv = [st.maxHeight, st.getPropertyValue('--pz-fit'), st.getPropertyValue('--pz-z')];
      st.maxHeight = 'none'; st.removeProperty('--pz-fit'); st.removeProperty('--pz-z');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (fit) st.setProperty('--pz-fit', String(fit));
      const v = readMetric(el, 'offsetHeight') * k;
      st.maxHeight = sv[0]; if (sv[1]) st.setProperty('--pz-fit', sv[1]); else st.removeProperty('--pz-fit'); if (sv[2]) st.setProperty('--pz-z', sv[2]);
      return v;
    };
    // (Kept while the slide shows, unless its data card grew past what was planned for it, an instrument or chart built after
    // the slide arrived: Doppler 5 on a 320 px iPhone was planned at 148 px and grew to 284, over the figure's share.)
    // (Not for an instrument the reader opened: that grows by choice, over the figure, and closes again.)
    const lip = lipOn(dd) ? LIP * k : 0;
    // (Nor while its readings' card is pulled or easing out: they grow the card on the way, and re-planned mid-pull the card came out
    // too tall and closed itself under the finger instead of opening the readings, Mohammad on an iPhone, 20 Oct.)
    if (held) { if (dd.classList.contains('tool-open') || dd.classList.contains('pz-sliding') || 'folding' in dd.dataset || natural(dd, ds) + lip <= held.data + 1) { phoneFig = held.fig; return held.cap; } }
    const ts = ui.text.style, was = ts.maxHeight;
    ts.maxHeight = '';
    const css = readStyle(ui.text), own = parseFloat(css.maxHeight) * (css.maxHeight.endsWith('%') ? H / 100 : 1), foot = (parseFloat(css.bottom) || 0) * k;
    ts.maxHeight = was;
    // (The words zoom down to fit (--pz-fit): to Compact (card-type.js), and only where nothing else gives, to 12 px: their body
    // size sets how far.)
    const line = ui.text.querySelector('.pz-line, p'), body = line ? parseFloat(readStyle(line).fontSize) : 0;
    // (Measured at that size, not scaled from the full size: zoomed down, the lines take more words each and the card comes
    // out shorter than its full height times the zoom. Scaled, HVPG 5 on a 667 px iPhone asked 263 px for words that take 230.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const textAt = (z) => (z < 1 ? (() => {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const sv = [ts.maxHeight, ts.getPropertyValue('--pz-fit'), ts.getPropertyValue('--pz-z')];
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      ts.maxHeight = 'none'; ts.removeProperty('--pz-z'); ts.setProperty('--pz-fit', String(z));
      const v = readMetric(ui.text, 'offsetHeight') * k;
      ts.maxHeight = sv[0]; if (sv[1]) ts.setProperty('--pz-fit', sv[1]); else ts.removeProperty('--pz-fit'); if (sv[2]) ts.setProperty('--pz-z', sv[2]);
      return v;
    })() : natural(ui.text, ts)) + 4;
    // (words: at 12 px, whether the data card can stay open beside them, as before; compact: at Compact, the room the words take,
    // from the figure's share when they need it: the figure gives way before the words drop under Compact.)
    const floor = body > 12 ? Math.ceil(12 / body * 1000) / 1000 : 1, words = textAt(floor), compact = textAt(Math.max(COMPACT, floor));
    // (The words' glass starts 16 px above them or higher, glassLift, the data card ends 8 px above that and stands its own top (8 px) from the
    // screen's top: the same room the layout gives it below.) The data card shows at full size or comes in closed: never shrunk to fit.
    // It comes in closed (autoDock, its edge and handle at the top) where it and the words at 12 px cannot both fit beside the figure's
    // share, or where it is taller than its own cap (styles/app.css max-height). (Capped at 45 % of the shared room before, its own fit
    // doing the rest: Treatment 2 on a 667 px iPhone came in at half size, and the 8 px of its top left out shrank hvpg 5's card to 78 % on a 844 px one.)
    // (Never folded to its header behind Show any more: Mohammad, 17 Oct, "The data card should not glitch like this on the iPhone".)
    const dcs = readStyle(dd), dtop = (parseFloat(dcs.top) || 0) * k;
    // (The cap with the readings tucked: out, it grows by their height, styles/app.css .pz-sheet.has-tool.tool-open.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const dmax = (() => { const sv = ds.maxHeight; ds.maxHeight = ''; const m = readStyle(dd).maxHeight; ds.maxHeight = sv; if (m === 'none') return Infinity; let v = 0; m.replace(/(-?[\d.]+)(%|px)/g, (_, n, u) => { v += u === '%' ? n * H / 100 : n * k; }); return v; })()
      - (splitSheet(dd) && dd.classList.contains('tool-open') && dd.classList.contains('has-tool') ? (parseFloat(ds.getPropertyValue('--pz-d')) || 0) * k : 0);
    const reach = glassLift(k) * k;
    let both = H - foot - reach - 8 - dtop - FIG_MIN(H);
    // (Measured as the slide arrives, partly open with its sheet's edge below it, whatever the reader opened: the part's ease held
    // back so the measure sees where it rests.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const arriving = (fit = 0) => {
      const p = dd.classList.contains('pz-sheet') && dd.classList.contains('tool-open') ? ui.partOf() : null;
      if (!p) return natural(dd, ds, fit) + lip;
      const tr = p.style.transition; p.style.transition = 'none'; dd.classList.remove('tool-open');
      const v = natural(dd, ds, fit) + LIP * k;
      dd.classList.add('tool-open'); void readMetric(p, 'offsetHeight'); p.style.transition = tr;
      return v;
    };
    const full = gone ? 0 : arriving(), sheetLip = dd.classList.contains('pz-sheet') ? LIP * k : 0;
    // (Every chart in a phone's card has one size on every slide (styles/app.css .pz.stack .pz-prof, .pz-flows, .pz-flowtime): never
    // given way to 80 % to fit, which drew the Gut to heart ladder small on one slide and large on the next, Mohammad, 21 Oct: "Just
    // make it one version everywhere". A card too tall beside the words borrows from the figure instead, below.)
    const data = full;
    // (A card a little too tall beside the words borrows from the figure, down to FIG_REG, and arrives partly open: only past that
    // does it come in closed. Shut on any shortfall, slides came in closed, Circulation 10 on an iPhone after 8aa5142's taller glass,
    // and others still after fc4a6ab lent only that 14 px, Mohammad, 20 Oct: "the stacked cards started hidden".)
    const short = words - (both - data);
    // (Lent for the words at Compact, the size they then take, not at 12 px: lent only the 12 px room, the words took Compact
    // anyway, stood higher than planned and the card came in at a smaller fit, then grew to full size on a later pass, Circulation 4
    // on an iPhone, Mohammad, 20 Oct: "appears in small version then ... pops further to become larger".)
    const lim = FIG_MIN(H) - FIG_REG(H), lent = Math.min(lim, Math.max(short, compact - (both - data)));
    if (!gone && short > 0 && short <= lim) { both += lent; phoneFig = FIG_MIN(H) - lent; }
    const shut = !gone && (both - data < words || data - sheetLip > dmax + 0.5) && !!dd.querySelector(':scope > :not(.pz-dh):not(.pz-grip):not(.pz-lip)');
    phoneShut = shut;
    // (Words at Compact win over the figure's share and the 62 % cap when nothing else gives; they never reach the data card. Closed,
    // the card leaves them all but its edge (GRIP) at the top, and brought back it stands over the figure down to the words.)
    const room = H - foot - reach - 8, mine = Number.isFinite(own) ? own : 0.62 * H;
    // (Regular, where it needs more than its share but no more than the figure can lend: the figure keeps what is left, at least FIG_REG.)
    const regular = shut ? Infinity : textAt(1), lend = regular - (both - data);
    const reg = lend > 0 && lend <= phoneFig - FIG_REG(H) && regular <= mine && regular <= room - dtop - data;
    if (reg) phoneFig -= lend;
    // (Where the data card stays open and the words fit at 12 px but not at Compact in the room it leaves them, they take that room, between
    // 12 px and Compact, never Compact: Compact stood over the data card's foot, which the layout then cut off (a chart does not give way
    // to fit), the Gut to heart ladder's unit and its sinusoidal brace, Sites 4 on an iPhone at a larger text size, Mohammad, 22 Oct.)
    const floorCap = !gone && !shut ? Math.max(words, Math.min(compact, both - data)) : compact;
    const cap = Math.max(120, shut
      ? Math.min(room - GRIP * k, Math.max(Math.min(mine, room - dtop - Math.min(data, dmax + sheetLip)), compact))
      : reg ? regular : Math.min(room - dtop - data, Math.max(Math.min(mine, both - data), floorCap))) / k;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (key) phoneLock = { key, cap, shut, data: full, fig: phoneFig };   // (data: at full size, as the check above measures it)
    return cap;
  }
  // The free area: the open rectangles of the figure the words, the data card (where it comes to rest) and the controls leave,
  // in wrap px. The camera centres a slide's box in whichever of them shows it largest (stage boxVT).
  let frameL = 0, colT = 0, swapNow = false;
  // The stacked data card's fixed block sizes, largest first (the words beside them stay at Compact: card-type.js WIDE).
  const DK = [0.9, 0.8, 0.7, 0.6];
  // The data card's height at width w (page px) under the words: as it would stand there, at full size (unfitted).
  // A header's Show or Hide keeps its title clear by the chip's own width, not a fixed 64 or 66 px: a larger text size grows the chip,
  // and a title once ran under it (DOPPLER, TH at 200 % on a 390 px phone). Its words' width goes to the stylesheet in ems of the
  // header's own type (--pz-chip-em, the wider of Show and Hide), so the room never changes with the card's zoom or a tap.
  // (Measured from Inter's own advances and kerning, text-gl.js, the font the GPU draws words from: no 2D canvas. Until those are
  // here, the first card uses a wide guess, 0.68 em a letter, and is measured again once they arrive.)
  let chipWait = false;
  function chipRoom(dd) {
    const f = dd.querySelector('.pz-dh > .pz-fold');
    if (!f) return;
    const cs = readStyle(f), fs = parseFloat(cs.fontSize) || 0, ls = parseFloat(cs.letterSpacing) || 0;
    if (!fs) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (!glyphsReady() && !chipWait) { chipWait = true; loadGlyphs().then(() => restPass(() => { if (ui && !ui.data.hidden) chipRoom(ui.data); })).catch(() => {}); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const w = Math.max(...['Show', 'Hide'].map((t) => {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const x = cs.textTransform === 'uppercase' ? t.toUpperCase() : t;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      return (glyphsReady() ? textWidth(x, { weight: cs.fontWeight, size: fs }) : x.length * fs * 0.68) + ls * x.length;
    }));
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.setProperty('--pz-chip-em', (w / fs).toFixed(3));
  }
  function colHeight(w, dk = 1) {
    // (Unfitted, its zoom (--pz-z) cleared with the fit: kept, the card measured at the last fit's zoom, so the words' step depended on
    // what was fitted before (a live text-size change took a larger title than a fresh load at that size).)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const d = ui.data, ds = d.style, sv = [d.className, ds.width, ds.maxHeight, ds.getPropertyValue('--pz-fit'), ds.getPropertyValue('--pz-dk'), ds.getPropertyValue('--pz-z'), ds.getPropertyValue('--pz-u')];
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    d.classList.add('col'); if (dk < 1) ds.setProperty('--pz-dk', dk); else ds.removeProperty('--pz-dk'); ds.width = `${w}px`; ds.maxHeight = 'none'; ds.removeProperty('--pz-fit'); ds.removeProperty('--pz-z');
    // (A stacked card with its readings tucked, their card's foot below it: the room it keeps; brought out, the pair rises to make room for
    // them where the screen is short, slip.lift.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const sheet = d.classList.contains('pz-sheet'), parts = sheet ? [...d.children].filter((c) => c.matches('.pz-tiles')) : [], was = parts.map((c) => c.style.display);
    if (sheet) { d.classList.remove('tool-open', 'pz-sliding'); ds.removeProperty('--pz-u'); for (const c of parts) c.style.display = 'none'; }
    const hh = readMetric(d, 'offsetHeight') + (sheet ? LIP : 0);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    parts.forEach((c, i) => { c.style.display = was[i]; });
    d.className = sv[0]; ds.width = sv[1]; ds.maxHeight = sv[2]; if (sv[3]) ds.setProperty('--pz-fit', sv[3]); if (sv[4]) ds.setProperty('--pz-dk', sv[4]); else ds.removeProperty('--pz-dk'); if (sv[5]) ds.setProperty('--pz-z', sv[5]); if (sv[6]) ds.setProperty('--pz-u', sv[6]);
    ui.lipMO?.takeRecords();
    return hh;
  }
  function freeRects() {
    if (!ui || phone()) return null;
    const wr = readBox(wrap), W = wr.width, H = wr.height, k = W / (readMetric(wrap, 'clientWidth') || W) || 1, G = 12;
    const obs = [], d = ui.data;
    let dk = null, pill = null;
    if (!d.hidden && !('gone' in d.dataset) && !d.classList.contains('under') && !d.classList.contains('col')) {
      const x = readMetric(d, 'offsetLeft') + dock.to * dockVec()[0];
      obs.push(dk = { l: x * k, t: readMetric(d, 'offsetTop') * k, r: (x + readMetric(d, 'offsetWidth')) * k, b: (readMetric(d, 'offsetTop') + readMetric(d, 'offsetHeight') + (lipOn(d) ? LIP : 0)) * k });   // (and its sheet's edge below it, .pz-lip)
    }
    if (!ui.bar.hidden && readMetric(ui.bar, 'offsetWidth')) { const q = readBox(ui.bar); obs.push(pill = { l: q.left - wr.left, t: q.top - wr.top, r: q.right - wr.left, b: q.bottom - wr.top }); }
    // (The colour key stands on the pill: the two are one obstacle. Measured where it will show, even before it fades in.)
    if (pill && ui.fk.dataset.empty == null) {
      const f = ui.fk, was = f.hidden; f.hidden = false; const q = readBox(f); f.hidden = was;
      if (q.width) { pill.t = Math.min(pill.t, q.top - wr.top); pill.l = Math.min(pill.l, q.left - wr.left); }
    }
    // Each obstacle splits a rectangle it overlaps into the open parts left, right, above and below it.
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const split = (q, o) => (o.r <= q.l || o.l >= q.r || o.b <= q.t || o.t >= q.b ? [q]
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      : [{ ...q, r: o.l - G }, { ...q, l: o.r + G }, { ...q, b: o.t - G }, { ...q, t: o.b + G }].filter((x) => x.r - x.l > 0 && x.b - x.t > 0));
    // First choice: the space between the words' card and the data card, full height (clear of the controls), so a subject
    // sits centred between the cards rather than in the strip under a short corner card.
    const ok = (q) => q.r - q.l >= 200 && q.b - q.t >= 150;
    let mid = [{ l: frameL, t: 0, r: dk ? dk.l - G : W, b: H }];
    if (pill) mid = mid.flatMap((q) => split(q, pill));
    // (Marked pref: the camera uses the rest only for a box too big for these at its widest zoom.)
    mid = mid.filter(ok).map((q) => ({ ...q, pref: true }));
    let out = [{ l: frameL, t: 0, r: W, b: H }];
    for (const o of obs) out = out.flatMap((q) => split(q, o));
    return [...mid, ...out.filter(ok)];
  }
  stage.setFreeArea(freeRects);
  const onFonts = () => { if (!ui) return; if (thrown()) layoutAtLanding(); else layout(); };   // (R14: a font that arrives while the cards come in refits them once, when they have landed)
  // Where the cards stand, rounded: the camera framed this space last; the same space needs no second glide.
  let framedSig = '';
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const cardSig = () => (ui ? [ui.text, ui.data].map((el) => (el.hidden ? '-' : ((r) => [r.left, r.top, r.width, r.height].map((v) => Math.round(v / 4)).join())(readBox(el)))).join('|') : '');
  function reframe(ms) {
    const s = figOf(shown.i);
    // (In a talk that opts in (deck keepPinch), a view the learner pinched, dragged or zoomed stays: a card that changed size, a dock or a settling sheet does not pull it back to the
    // slide's framing. Next, Back, a jump, Fit and a turn of the device frame it again: they clear the hand, stage.handClear / the slide's own move.)
    if (deck?.keepPinch && stage.handMoved?.() && !booting) return;
    // (Under the start's cover the framing is set outright: unseen, a glide only kept the reveal waiting, or was caught by it.)
    const cam = s.visual ? s.cam : s.cam || 'fit';
    // (A slide with no framing of its own (the outline, a table) leaves the figure at the stage's fit, which follows the cards:
    // under the cover that fit is set outright too. Left to the stage, it followed the outline's card only after the reveal, on
    // a busy page in one frame: the figure stood behind where the words had been, then jumped to the middle.)
    if (booting && !cam && !store.get().lobule) { stage.fitSlow(0); return; }
    stage.carryProbe?.();   // (a refit to the cards, not a new slide's framing: a Doppler probe that shows rides it out)
    fitAround(s, cam, booting ? 0 : ms);
  }
  // The view follows the stacked card's readings' card frame by frame as they come out or tuck away, under the finger or on their own
  // ease (stage.js followAt; Mohammad, 30 Oct, iPhone: "The view still snaps/jumps when I untuck a stacked card"): the framing for them
  // tucked and for them out are worked out once (stage.aimView, the slide's own camera asked where it would go), and liftTo sets the view
  // between the two at the share the card has travelled. Only for a slide framed at the fit or on a box, its view standing still at that
  // framing; a catheter, a procedure's shot, a time-lapse's push, the lobule, a zoomed card, a dock moving or reduced motion keep the
  // refit glide (foldReframe, foldStill). (Mac and iPad landscape: the figure's column is the same tucked or out, the two framings agree,
  // and nothing follows.)
  // (camSlide: the slide the view follows a card on; a move to another slide ends it, so the card put back for the new slide never takes
  // the view back to the old slide's framing.)
  let camSlide = -1, camSlideGen = -1;   // (the slide's index and generation, as numbers: camAt runs every frame of a slide and builds no key)
  const camAt = (u) => { if (!stage.following?.()) return; if (camSlide === want && camSlideGen === gen && shown?.i === want) stage.followAt(u); else stage.followEnd?.(); };
  const camKind = () => { const s = figOf(shown.i); return s.visual ? s.cam : s.cam || 'fit'; };
  const camFollowOk = () => !!ui && !!shown && shown.i === want && shown.gen === gen && !(busy && !playing) && !leaving && !booting && !reduce.matches
    && dock.to === 0 && dock.lvl === 0 && !zoomOn() && !reframeT && !(deck?.keepPinch && stage.handMoved?.()) && !(cath.on && cath.cam) && !procRun?.running
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    && !(push && push.i === shown.i && push.until > performance.now()) && !store.get().lobule && ((c) => !!c && !LOBULE_CAM.test(c))(camKind());
  // (Where the slide's camera would frame the cards as they stand now: the handle placed at the card's foot first, as it rests.)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const camAim = () => { placeLip(); const s = figOf(shown.i); return stage.aimView?.(() => frameTo(camKind(), s, 400, { steady: true })); };
  // From the view now, framed for the readings as they rest (open: out), to the framing for the cards as they stand now (the other state).
  function camFollow(vNow, open) {
    const vTo = camAim();
    if (!vNow || !vTo || !stage.follow?.(open ? vNow : vTo, open ? vTo : vNow)) return false;
    stage.carryProbe?.();   // (a Doppler probe that shows rides it out)
    camSlide = shown.i; camSlideGen = shown.gen; framedSig = cardSig();
    return true;
  }
  // A finger takes the readings' card at rest: the framing for the other state is worked out with the card turned to it for the measure
  // only (its class and its handle, put back before anything is drawn), so the view can follow the finger from the first move.
  // (Decided as the finger takes the card; the measure is a rest pass right after the move that took it, never inside a touch move:
  // the card measured as it rests, its slide's class off for the measure and back before anything is drawn. The view follows from then.)
  let camGrabT = 0;
  function camGrab() {
    const d = ui?.data;
    if (!d || stage.following?.() || !camFollowOk() || d.classList.contains('pz-sliding')) return;
    cancelRest(camGrabT); camGrabT = restPass(camGrabNow);
  }
  function camGrabNow() {
    const d = ui?.data;
    if (!d || stage.following?.() || !camFollowOk()) return;
    const vNow = stage.viewNow?.();
    if (!vNow) return;
    const open = d.classList.contains('tool-open'), sliding = d.classList.contains('pz-sliding');
    if (sliding) d.classList.remove('pz-sliding');
    d.classList.toggle('tool-open', !open);
    let vOther;
    try { vOther = camAim(); } finally { d.classList.toggle('tool-open', open); if (sliding) d.classList.add('pz-sliding'); placeLip(); ui.lipMO?.takeRecords(); }
    if (vOther && stage.follow?.(open ? vOther : vNow, open ? vNow : vOther)) { stage.carryProbe?.(); camSlide = shown.i; camSlideGen = shown.gen; }
  }
  // The camera eases to fit a slide's framing into the space its cards leave (the lobule refits itself on pps:occ).
  function fitAround(s, cam, ms) {
    framedSig = cardSig();
    // (Steady: timed so a slow frame at its start holds the glide back instead of carrying it part of the way at once, glide-clock.js.)
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    if (cath.on && cath.cam) stage.cathFocus(cath.cam, ms, { both: true, steady: true });
    else if (procRun?.refit(ms)) return;   // (a procedure holds its own shot: the cards changing frame that shot again)
    else if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) {
      // (While a time-lapse pushes, a refit (the cards moved, the screen turned) keeps pushing, to the new fit, over the seconds left.)
      const left = push && push.i === shown?.i ? push.until - performance.now() : 0;
      // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
      frameTo(cam, s, left > 0 ? left : ms, left > 0 ? { drift: true } : { steady: true });
    }
  }
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
  // (The cards follow at once; the camera frames once, when the size has held for 250 ms: a turn fires several resizes, and a
  // glide after each moved the camera two or three times.)
  let reframeT = 0, turnT = 0;
  // (The screen's size as the last resize laid the cards out for: wrapRO lays them out again when the stage settles to another size
  // after the event. Turned on an iPad, Safari's one resize came while the stage still had its upright height: the pair was centred
  // for that height, the data card pushed below the screen until the slide was reloaded (Stiffness 3, 18 Oct).)
  let sizeSeen = '', wrapRO = null;
  const sizeNow = () => { const r = readBox(wrap); return `${innerWidth}x${innerHeight}:${Math.round(r.width)}x${Math.round(r.height)}`; };
  const onResize = (e) => {
    if (!ui) return;
    if (e?.type === 'resize' && zoomOn()) { ui.zoom.reset(); paintZoom(); }   // (a new size: the card is put back, laid out and zoomed again by a tap)
    if (e?.type === 'resize') sizeSeen = sizeNow();
    // (Turned between upright (a phone's or tablet's stacked cards) and a wider layout: a data card closed in the one comes in open in
    // the other, at once with everything else. Kept closed, an iPad's card turned on its side stood off the screen's left edge.)
    if (e?.type === 'resize' && phone() !== ui.root.classList.contains('stack') && dock.to === 1 && !dock.auto) { dockHalt(); dock.to = 0; dock.lvl = 0; dock.down = -1; dockRest(); dockPaint(); placeLip(); }
    clearTimeout(refitT); refitT = stimer(reFit, 250);
    if (ui.data.hasAttribute('data-sin-tiles')) ui.data.classList.toggle('under', !shortSide.matches && phone());   // (turned on or off its side)
    // (For 0.8 s after a resize or a turn the data card takes each new place at once, with no fade or glide: the words' card
    // re-fits in steps as the size settles, and a data card easing after it passed over the words.)
    const turn = e?.type === 'resize';
    if (turn) stage.handClear?.();   // (a turn of the device or a new window size: the camera frames the slide again)
    if (turn) { ui.root.classList.add('pz-turning'); clearTimeout(turnT); turnT = stimer(() => ui?.root.classList.remove('pz-turning'), 800); }
    if (ui.bar.dataset.kind !== pillKind()) paintChrome();   // (turned between a phone's, a tablet's and a wide screen's pill: its buttons change before the words are fitted around it)
    layout();
    // (Judged once the cards have their new layout's classes, then laid out again if that changed the title.)
    if (turn && !ui.text.hidden) { const was = !!ui.text.querySelector('.pz-h.long'); markLong(ui.text); if (was !== !!ui.text.querySelector('.pz-h.long')) { textLock = null; layout(); } }
    setLabels(!turn);
    if (!shown) return;
    // (Under the start's cover, the projector layout landing or a window settling: framed at once, so the reveal shows it framed.)
    if (booting) { clearTimeout(reframeT); reframeT = 0; reframe(0); return; }
    // (Another caller (a card's dock moving, its fit done) frames at once, unless a resize is still settling: then that one look covers both.)
    if (!turn && !reframeT) { reframe(400); return; }
    clearTimeout(reframeT);
    reframeT = stimer(() => { reframeT = 0; if (ui && shown) reframe(400); }, 250);
  };
  // Projector-size labels on the figure, for the screen it is on (2 at 1080 lines).
  // (unchanged: left out when the projector size and the text size are the ones it set last. A card that only folded, docked or settled
  // (onResize with no resize) changes neither, and the figure's labels laid out again and every stage style read again in the very frame
  // the camera's refit to that card began: on a phone a long frame, which carried the glide part of the way at once.)
  let labelsFor = '';
  function setLabels(unchanged = false) {
    const k = (phone() ? 1.15 : clamp(Math.min(innerHeight / 540, innerWidth / 960), 1.25, 2.4));
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const key = `${k}|${stage.labelScale()}`;
    if (unchanged && key === labelsFor) return;
    labelsFor = key;
    stage.setProjection(k);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    { const lv = String(Math.min(k, 2.2) * stage.labelScale()); document.documentElement.style.setProperty('--label-k', lv); document.documentElement.style.setProperty('--label-scale', String(Math.max(1, Math.min(k, 2.2) / 1.5) * stage.labelScale())); }   // (font roles: the projector's size over Explore's, never below it)
    labelling = true; dispatchEvent(new Event('pps:labelscale')); labelling = false;
  }
  // The viewer's own text size (Settings) scales them too: a change there while presenting is re-applied on top.
  let labelling = false;
  // A new text size draws the slide again, as a fresh load at that size does (the words out and back in, laid out from the
  // start, the camera framing around them). Adjusted in place, a card kept what the old size had chosen: a 200% card stayed
  // folded or kept the compact strip at 100%, and a 100% card switched to 200% folded where a fresh load did not.
  // (As when coming back to the slide: a time-lapse shows its end, not playing again.)
  addEventListener('pps:labelscale', () => {
    if (!deck || !ui || labelling) return;
    setLabels();
    if (!shown) return;   // (a slide on its way in lays out at the new size anyway)
    // (Nothing fitted at the old size carries over: each card's fit, the words' steps (a title judged long or not at the old
    // step had kept that size), and each ladder's choice of plot or strip.)
    for (const el of [ui.text, ui.data, ui.panel]) { fitDone.delete(el); for (const n of ['--pz-fit', '--pz-z', '--pz-tk', '--pz-bk', '--pz-dk']) el.style.removeProperty(n); }
    ui.text.classList.remove('pz-nocauses');
    reFit();
    lastAt = Math.max(lastAt, shown.i + 1); redrawn = ++gen;
    if (!busy) run();
  });

  // ── Chrome: counter, progress, controls ──
  // The controls are a small frosted pill (a phone: count, settings, exit; a wide screen adds back and next) at the screen's lower right, on the words'
  // glass; it never moves. Only the words' last line keeps clear of it (see clearPill); slides change by swiping.
  let pillW = 0;
  // Where an element will rest once the entry or exit animations on it and its ancestors (a slide in or out) have ended: its box
  // now, less the shift those animations give it at this moment. Also how long until the last of them ends.
  function restRect(el) {
    let dx = 0, dy = 0, left = 0;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const run = readAnims(n).filter((a) => a.playState === 'running' && Number.isFinite(readTiming(a.effect).endTime));
      if (!run.length) continue;
      for (const a of run) left = Math.max(left, readTiming(a.effect).endTime - (a.currentTime || 0));
      const t = readStyle(n).transform;
      if (!t || t === 'none') continue;
      const m = new DOMMatrixReadOnly(t), z = readMetric(n, 'offsetHeight') ? readBox(n).height / readMetric(n, 'offsetHeight') : 1;   // (in screen px: through any zoom)
      dx += m.e * z; dy += m.f * z;
    }
    const r = readBox(el);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    return { top: r.top - dy, right: r.right - dx, height: r.height, width: r.width, left };
  }
  // The pill's width, for the words' last line to keep clear of (--pz-pill-w); then the words keep clear of it (clearPill).
  function placeBar() {
    if (!ui) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (phone() && readMetric(ui.bar, 'offsetWidth') && readMetric(ui.bar, 'offsetWidth') !== pillW) { pillW = readMetric(ui.bar, 'offsetWidth'); app.style.setProperty('--pz-pill-w', `${pillW}px`); }
    clearPill();
    placeScales();
  }

  // ── The scale switch (slide field scales; scale-switch.js) ──
  // One pill, Anatomy, Lobule, Sinusoid, on a slide that offers more than its own scale. A tap flips the figure to that scale of the
  // same patient with the moves the slides already make (camera: the dive, the sinusoid, the rise), so it eases and the vessels stay
  // where they are; the words, the data card and anything playing go on. Never remembered: Next, Back and a jump open each slide on
  // its own scale (transitionRun clears the pick). Mac and iPad landscape: in the counter's row, 8 px left of it. A phone and an
  // upright iPad: centred 8 px above the teaching card, where the camera keeps clear of it.
  let scalePick = null, flipping = false;
  const scalesOf = (s) => offeredScales(s, { lens: slideLens(s), sinusoid: sinusoidSupported() });
  function paintScales(s, i) {
    if (!ui) return;
    const el = ui.scl, ks = s && !s.visual ? scalesOf(s) : [];
    el.hidden = !ks.length;
    if (!ks.length) { el.replaceChildren(); delete el.dataset.sig; return; }
    const sig = ks.join(' ');
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.replaceChildren(h('i', { class: 'pzs-thumb', 'aria-hidden': 'true' }),
        ...ks.map((k) => h('button', { type: 'button', 'data-scale': k, 'aria-pressed': 'false', onclick: () => flipScale(k) }, SCALE_NAME[k])));
      el.classList.add('pzs-new');   // (a new set of words: the thumb takes its place without easing across)
    }
    paintScaleSel(pickedScale(scalePick, i, s));
    placeScales();
  }
  // The inner pill moves and stretches on the compositor (translate and a horizontal scale of a width laid out once), never a width
  // eased by layout: its laid-out width is the first word's it stood under, kept until the pill is built again.
  function pzsThumb(el, on) {
    const w = readMetric(on, 'offsetWidth');
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (!el._pzsW0 || el.classList.contains('pzs-new')) { el._pzsW0 = w; el.style.setProperty('--pzs-w0', `${w}px`); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    el.style.setProperty('--pzs-x', `${readMetric(on, 'offsetLeft')}px`);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    el.style.setProperty('--pzs-s', (w / el._pzsW0).toFixed(4));
  }
  // The selected word, and the soft inner pill eased under it (as Explore's selection eases from one word to the next).
  function paintScaleSel(k) {
    const el = ui?.scl;
    if (!el || el.hidden) return;
    let on = null;
    // (A sinusoid slide on a device that cannot draw the wall shows the lobule: camera(). Its pill selects Lobule.)
    const want = k === 'sinusoid' && !el.querySelector('[data-scale="sinusoid"]') ? 'lobule' : k;
    for (const b of el.querySelectorAll('button')) { const yes = b.dataset.scale === want; b.setAttribute('aria-pressed', String(yes)); if (yes) on = b; }
    if (on) pzsThumb(el, on);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (el.classList.contains('pzs-new')) { const nf = frameFor('scale select'); nf(() => nf(() => el.classList.remove('pzs-new'))); }
  }
  function placeScales() {
    const el = ui?.scl;
    if (!el || el.hidden) return;
    const p = phone();
    // (A phone's pill stands over the figure, above the teaching card: the camera frames above it, as above the card.)
    el.toggleAttribute('data-safe', p); if (p) el.dataset.safe = 'bottom';
    if (p) {
      const wr = readBox(wrap), k = wr.width / (readMetric(wrap, 'clientWidth') || wr.width) || 1, r = restRect(ui.shade);
      if (r.width) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pzs-b', `${Math.max(0, (wr.bottom - r.top) / k + 8).toFixed(1)}px`);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pzs-cx', `${((r.left + r.width / 2 - wr.left) / k).toFixed(1)}px`);
      }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    } else if (readMetric(ui.bar, 'offsetWidth')) el.style.setProperty('--pzs-r', `${readMetric(ui.bar, 'offsetWidth')}px`);
    const on = el.querySelector('[aria-pressed="true"]');
    if (on) pzsThumb(el, on);
  }
  // A tap on the pill: once the slide has landed (cards in, any case card lifted), and while it shows. A tap while a flip moves
  // turns it to the new scale once its present step ends; Next, Back or a jump cuts it.
  async function flipScale(k) {
    if (!deck || !ui || caseCard || !shown || shown.i !== want || shown.gen !== gen) return;
    if (shownBeat !== beat) return;   // (a beat still on its way)
    const i = shown.i, s = figOf(i);   // (the beat on screen: its scales, and its anatomy view to come back to)
    if (!scalesOf(s).includes(k)) return;
    scalePick = { i, scale: k }; paintScaleSel(k);
    if (flipping) return;
    flipping = true;
    const creditOff = creditLease.take();
    try {
      for (let at = null; deck && want === i && shown?.i === i && scalePick?.i === i && scalePick.scale !== at;) {
        at = scalePick.scale;
        const k0 = at, cut = () => !deck || want !== i || shown?.i !== i || scalePick?.scale !== k0;
        await flipMove(s, i, k0, cut);
      }
    } finally {
      flipping = false;
      creditOff();
    }
  }
  // One flip: the scale's call-outs leave (all the liver's labels out first, as on a slide change), the camera makes the scale's move,
  // then that scale's view calls out what it names (scale-switch.js scaleView: the slide's own at its own scale).
  async function flipMove(s, i, k, cut) {
    const v = scaleView(s, k), cam = v.cam;
    if ((store.get().lobule || store.get().sinusoid) && !booting) hush();
    markBase = null;
    store.set({ focus: null, presentLabels: [], presentTerms: null, lobuleCallout: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
    if (hushed) { await waitCut(Math.max(0, HUSH_OUT - (performance.now() - hushAt)), cut); if (cut()) return; await eased(['opacity'], 600, '.lz-labels'); if (cut()) return; }
    const homeOff = homeLease.take();
    try { await camera(cam, v, cut); } finally { homeOff(); }
    lastCam = cam;
    if (cut()) return;
    paintOverlays(v, i, states[stateOf[i]] || null, false);
    await unhush(cut);
  }
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

  // One more clause of a revealing line (reveal.js, N3): it fades in (or the last one out, going back) and the figure lights the terms the
  // clauses shown name. Nothing else moves: no camera, no cards, no refit (the whole line is typeset from the start). In the liver a
  // change of the lit set runs the labels' hush as a slide change does, so no label shows half lit.
  async function revealMove(i, k) {
    const g = gen, s = slides[i], cut = () => !deck || want !== i || gen !== g || beat !== k || shown?.i !== i;
    const v = beatView(s, k), creditOff = creditLease.take();
    try {
      if (flipping) { await until(() => !flipping, 9000); if (cut()) return; }
      if ((store.get().lobule || store.get().sinusoid) && !booting && slideTargets(v).lit.join(' ') !== (app.dataset.lit || '')) {
        hush();
        await waitCut(Math.max(0, HUSH_OUT - (performance.now() - hushAt)), cut); if (cut()) return; await eased(['opacity'], 600, '.lz-labels'); if (cut()) return;
      }
      fig = { i, s: v };
      paintClauses(ui.text.querySelector('.pz-line'), k + 1);
      paintOverlays(v, i, states[stateOf[i]] || null, false);
      await unhush(cut);
      if (cut()) return;
      shownBeat = k; paintChrome();
    } finally { creditOff(); }
  }

  // The words' last shown block keeps clear of a phone's pill: a line of words (or the station key) ends with a gap the pill's
  // width and as tall as the pill reaches into the words (--pz-reach, measured), on its own line if the last line is too long
  // for it; so the pill only ever meets that last line. A box (buttons, a monitor, a diagram) ends just above the pill instead.
  // Run on every layout (fonts fitted, the screen turned): only a phone shows either.
  // (The one spacer, moved to whichever block ends the words: no node made per layout.)
  const pillGap = h('span', { class: 'pz-pillgap', 'aria-hidden': 'true' });
  function clearPill() {
    const text = ui.text, gap = text.querySelector('.pz-pillgap'), was = text.querySelector('.pz-pillclr');
    let end = null, box = null;
    if (phone() && !text.hidden) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const shown = (c) => readBox(c).height > 0, last = [...text.children].filter(shown).at(-1);   // (an svg has no offsetHeight)
      const tail = last;
      // (A colour key docked at the words' bottom-left (figure-key.js) takes a row of its own beside the pill: the words end above it.)
      if (tail?.matches('p, h1, li, .pz-stk') && ui.fk.dataset.empty != null) end = tail; else box = last || null;
      // (Read from the layout boxes where both rest, never from the screen: a card still easing in or out (pz-leave's 18 px
      // slide) read 18 px more reach, and the words were fitted smaller for it, then grew once the card settled.)
      const wr = restRect(ui.root), k = wr.width / (readMetric(ui.root, 'clientWidth') || wr.width) || 1, bar = ui.bar;
      const reach = readMetric(bar, 'offsetParent') && readMetric(bar, 'offsetParent') === readMetric(text, 'offsetParent') ? readMetric(text, 'offsetTop') + readMetric(text, 'offsetHeight') - readMetric(bar, 'offsetTop')
        : (restRect(text).top + readMetric(text, 'offsetHeight') * k - readBox(bar).top) / k;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      text.style.setProperty('--pz-reach', `${Math.max(0, Math.ceil(reach) + 3)}px`);
      // A box ends 8 px above the pill on a tablet, measured to the fraction (offsetTop rounds; the rounded reach had left it at 5,
      // sweep 03 #23). A phone's
      // keeps the reach's 3 px: its words are fitted to the last pixel, and 5 more cost them a size step (Right heart 7 at 390
      // went from 0.70 to 0.58 and its What-if slider from 236 to 56 px; sweep 01 review).
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      text.style.setProperty('--pz-reach-box', ui.root.classList.contains('tab') ? `${Math.max(0, (restRect(text).top + restRect(text).height - restRect(bar).top) / k + 8).toFixed(2)}px` : `${Math.max(0, Math.ceil(reach) + 3)}px`);
    }
    fitKey();
    if (gap && gap.parentElement !== end) gap.remove();
    if (end && !end.querySelector(':scope > .pz-pillgap')) end.append(pillGap);
    if (was && was !== box) was.classList.remove('pz-pillclr');
    box?.classList.add('pz-pillclr');
  }
  // A key that wraps is balanced: the narrowest width that keeps its number of lines, so no line is left with one word ("Systemic"
  // alone under the other origins, "Reversed" under "Usual": 17 Oct design review). Its lines and height stay as they were.
  function balanceKey(fk, maxW) {
    const h0 = readMetric(fk, 'offsetHeight');
    let lo = Math.floor(maxW / 2), hi = Math.floor(maxW);
    while (hi - lo > 2) {
      const mid = (lo + hi) >> 1;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      fk.style.setProperty('--pz-fk-room', `${mid}px`);
      if (readMetric(fk, 'offsetHeight') > h0 + 1) lo = mid; else hi = mid;
    }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    fk.style.setProperty('--pz-fk-room', `${hi}px`);
  }
  // A phone's docked colour key and the nav pill never overlap. It sits on one line beside the pill when it fits; else on two lines
  // beside it (fk-two, as tall as the pill's row); else on its own row just above the pill's row (fk-up; a 320 px phone), one line,
  // shrunk to the card's width if even that is too narrow. The words end above whatever the key takes (--pz-fkrow).
  function fitKey() {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fk = ui.fk, root = ui.root, set = (two, up, wrap = false, flow = false, short = false) => { root.classList.toggle('fk-two', two); root.classList.toggle('fk-up', up); root.classList.toggle('fk-wrap', wrap); root.classList.toggle('fk-flow', flow); root.classList.toggle('fk-short', short); };
    const on = phone() && !ui.text.hidden && fk.dataset.empty == null;
    if (!on) { set(false, false); return; }
    const was = fk.hidden; fk.hidden = false; set(false, false);
    const wr = restRect(root), k = wr.width / (readMetric(root, 'clientWidth') || wr.width) || 1;
    const w = readMetric(fk, 'offsetWidth'), l = parseFloat(readStyle(fk).left) || 21;
    const bar = readBox(ui.bar), barH = bar.height / k;
    const room = (bar.left - wr.left) / k - l - 8, full = readMetric(root, 'clientWidth') - 2 * l;
    let row;
    // (Beside the pill on one line, a key taller than the pill's row (a larger text size: its name over its scale) reaches above
    // it: the words end 8 px above the key, not 3 px above the pill (Circulation 3 at 150 %: the buttons sat on the key).)
    if (w <= room) row = Math.max(0, Math.ceil((bar.top - readBox(fk).top) / k + 5));
    else if (root.classList.contains('tab')) {
      // (An upright iPad has the width for the key on its own row above the pill, one line across the card, rather than two lines
      // squeezed beside it: 17 Oct design review. Wrapped, and balanced, only if even the card's width is too narrow.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (w > full) fk.style.setProperty('--pz-fk-room', `${Math.floor(full)}px`);
      set(false, true, w > full);
      if (w > full) balanceKey(fk, full);
      row = Math.ceil(readMetric(fk, 'offsetHeight')) + 12;
    } else {
      // (Two lines inside the pill's own height, the two read as one row: its name over its swatches; else name and swatches flowing
      // over both lines; else the same with the swatches' short names (SV, HA, Sys). Only then a row of its own above the pill, which
      // took a whole line from the words and left the room beside the pill empty: Mohammad, 20 Oct, TIPS Doppler 3 on an iPhone,
      // "The legend of the lens could be on two lines ... Can use abbreviations".)
      const sh = !!fk.querySelector('.pz-lk-s');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const two = (flow, short) => { set(true, false, false, flow, short); fk.style.setProperty('--pz-fk-room', `${Math.floor(room)}px`); return readMetric(fk, 'scrollWidth') <= room + .5 && readMetric(fk, 'offsetHeight') <= barH + 1.5; };
      if (two(false, false) || two(true, false) || (sh && (two(false, true) || two(true, true)))) {
        balanceKey(fk, room); row = Math.max(0, readMetric(fk, 'offsetHeight') - barH) + 2; }
      else {
        // (Wider than the card too: wrapped to its width, at its own size; it had been scaled down, its words under 12 px.)
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (w > full) fk.style.setProperty('--pz-fk-room', `${Math.floor(full)}px`);
        set(false, true, w > full);
        if (w > full) balanceKey(fk, full);
        row = Math.ceil(readMetric(fk, 'offsetHeight')) + 12;
      }
    }
    fk.hidden = was;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ui.text.style.setProperty('--pz-fkrow', `${row}px`);
  }
  // A phone held sideways: the colour key stands on the nav pill at the lower right, beside the teaching card. A key too long for
  // the room beside the card wraps there to two lines at its own size, its name over its swatches, 4 px above the pill (not 8:
  // the room under the data card), where that clears the card and the data card; else the words end above it, fitted a little smaller (Mohammad, 18 Oct, "wrap first": Pre-hepatic 6 and TIPS
  // Doppler 3 at 667 x 375 ran the key under the words). True when the words' room was cut, so they are fitted again.
  function lowKey(t, d, padT, pad0, vm, wr, H, k) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fk = ui.fk, root = ui.root, plain = () => { root.classList.remove('fk-side'); fk.style.removeProperty('--pz-fk-room'); };
    plain();
    if (fk.dataset.empty != null) return false;
    const was = fk.hidden; fk.hidden = false;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const card = { left: t.left - pad0, right: t.right + pad0, top: t.top - padT, bottom: t.bottom + pad0 };
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const hits = (q, a, g) => !!a && Math.min(q.right, a.right) - Math.max(q.left, a.left) > -g && Math.min(q.bottom, a.bottom) - Math.max(q.top, a.top) > -g;
    let q = readBox(fk), cut = false;
    if (hits(q, card, 6)) {
      const room = Math.floor((q.right - card.right - 8) / k);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      root.classList.add('fk-side'); fk.style.setProperty('--pz-fk-room', `${room}px`);
      q = readBox(fk);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const lines = new Set([...fk.querySelectorAll(':scope > b, .pz-lens-k')].map((e) => Math.round(readBox(e).top))).size;
      if (room > 0 && lines <= 2 && readMetric(fk, 'scrollWidth') <= readMetric(fk, 'clientWidth') + .5 && !hits(q, card, 6) && !hits(q, d, 4)) balanceKey(fk, room);
      else {
        plain(); q = readBox(fk);
        // (The words end 4 px above the key, wherever the card stands: level with the data card, or centred top to bottom. The key
        // may stand on the card's glass below them, as an upright phone's stands inside its card.)
        const foot = q.top - wr.top - 4, top = d ? d.top - wr.top + padT : vm + padT;
        const h = d ? foot - top : Math.min(foot - top, 2 * (foot + pad0) - H + pad0 - padT);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        ui.text.style.maxHeight = `${Math.max(0, h / k).toFixed(1)}px`; cut = true;
      }
    }
    fk.hidden = was;
    return cut;
  }
  // What a screen reader is told: one line per slide ("Slide 3 of 12: its title"), and only once that slide is on screen. The count on the bar
  // runs ahead (want is the slide asked for), but the cards of the slide before stay until the move has landed, and a jump that fails or is
  // overtaken by the next one never reaches its slide: it was announced all the same, and the page then read out a slide it did not show.
  // (force: a move that ended in an error, whose cards came back; busy: the cards are changing, so a reader waits for them.)
  const landedNow = () => !!shown && shown.i === want && shown.gen === gen;
  function announce(force = false) {
    poke();   // (a change of slide or a beat wakes a resting page, whoever asked: a clicker, the presenter's window)
    if (!ui) return;
    const i = want, t = `Slide ${i + 1} of ${slides.length}${slides[i]?.title ? `: ${slides[i].title}` : ''}`;
    if ((force || landedNow()) && ui.say.textContent !== t) ui.say.textContent = t;
    const moving = String(busy && !landedNow());
    for (const e of [ui.text, ui.data]) if (e.getAttribute('aria-busy') !== moving) e.setAttribute('aria-busy', moving);
  }
  function paintChrome() {
    if (!ui) return;
    const n = slides.length, i = want;
    pview.publish(deck, slides, i, beat, lastBeat(i) + 1);
    ui.prog.style.setProperty('--p', String((i + 1) / n));
    announce();
    const ph = phone(), skip = lapseOn && lapseLeft > 0, more = !skip && beat < lastBeat(i), last = i === n - 1 && !skip && !more;
    // The count opens the slide list (G).
    // (A list still fading out after a pick counts as closed: the count must not stay grey, as if the list were open, on the slide picked.)
    const countLabel = `Slide ${i + 1} of ${n}: list the slides`, listOpen = String(!ui.jump.hidden && !ui.jump.classList.contains('pz-leave'));
    ui.bar.classList.toggle('phone', ph); ui.bar.classList.toggle('pzb-pill', !ph);
    ui.bar.dataset.kind = pillKind();
    const nextLabel = skip ? 'Run the time-lapse to its end' : more ? `Next view, ${beat + 2} of ${lastBeat(i) + 1}` : 'Next slide', nextTitle = skip ? 'Skip to the end of the time-lapse (→)' : 'Next (→)';
    if (ph) ui.bar.classList.remove('idle');
    // The same pill from slide to slide is updated in place, its count crossfading to the new number; it was rebuilt on
    // every slide, its buttons popping out and back (MOTION_HEAT_REVIEW P16). A new layout builds it afresh.
    const tab = ph && tabUp(), sig = `${ph}|${tab}|${!!openSettings}`, k = ui.bar._pill;
    if (k && k.sig === sig && k.count.isConnected) {
      // (The pill's width is measured again once the new count is in: 9 to 10 widens it.)
      swapText(k.count, `${i + 1} / ${n}`, () => { if (ui?.bar._pill === k) placeBar(); });
      k.count.setAttribute('aria-label', countLabel); k.count.setAttribute('aria-expanded', listOpen);
      if (k.prev) k.prev.disabled = i === 0 && beat === 0;
      if (k.next) { k.next.disabled = last; k.next.classList.toggle('skipping', skip); k.next.setAttribute('aria-label', nextLabel); k.next.title = nextTitle; }
      placeBar();
      return;
    }
    const countBtn = h('button', { class: 'pzb-n', 'aria-label': countLabel, title: 'Slide list (G)', 'aria-expanded': listOpen, onclick: () => toggleJump() }, `${i + 1} / ${n}`);
    const prevBtn = () => h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0 && beat === 0, onclick: prev }, icon('chev-left'));
    const nextBtn = () => h('button', { class: `ib pzb-next${skip ? ' skipping' : ''}`, 'aria-label': nextLabel, title: nextTitle, disabled: last, onclick: next }, icon('chev-right'));
    if (ph) {
      // A phone's pill: the count (it opens the slide list), settings, exit. Slides change by swiping. An upright tablet's
      // pill has back and next around the count too, as a wide screen's: an iPad mirrored to a projector is often driven
      // by tapping, and a swipe there competes with the card fold and the figure pan (review U5).
      const kids = tab ? [prevBtn(), countBtn, nextBtn()] : [countBtn];
      ui.bar.replaceChildren(...kids, gear(),
        h('button', { class: 'ib', 'aria-label': 'Exit the presentation', title: 'Exit', onclick: stop }, icon('close')));
      ui.bar._pill = { sig, count: countBtn, prev: tab ? kids[0] : null, next: tab ? kids[2] : null };
      placeBar();
      return;
    }
    // A wide screen's pill, as on a phone at the lower right (Mohammad): back, the count (it opens the slide list), next,
    // settings, exit. (No ask-the-room buttons: he asks the room by voice; full screen is in Settings and on F.)
    const pb = prevBtn(), nxb = nextBtn();
    ui.bar.replaceChildren(
      pb,
      countBtn,
      nxb,
      gear(),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop (Esc)', onclick: stop }, icon('close')));
    ui.bar._pill = { sig, count: countBtn, prev: pb, next: nxb };
    placeBar();
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
      setTimeout(() => { if (j.classList.contains('pz-leave')) j.hidden = true; }, reduce.matches ? 0 : 220);
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
  const turnsSlide = (dx) => dx < 0
    ? !caseLift && !lapseOn && !procHeld() && !procWait && !slides[want]?.procedure && beat >= lastBeat(want) && want < slides.length - 1
    : !procHeld() && !procWait && beat === 0 && want > 0;
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

  // ── Start and stop ──
  function build() {
    const tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker' });
    const dhT = h('span', {}, 'The patient');
    const tools = createTools({ host, stage });
    // On a phone an instrument above tiles folds away (the tiles keep the reading), so the figure is not a strip between
    // two cards; the button opens it, and it stays open for the rest of the talk.
    // The card is fitted once, as it will rest, before the part moves, and keeps that fit until the part is still: its words,
    // tiles and pictures hold their size through the whole open and close. (Fitted as the part eased or followed the finger,
    // the card measured itself against a cap meant for the other state; an iPhone's Doppler card shrank to half mid-pull, then
    // grew back once open.)
    // (A phone's sheet holds what is under the instrument: its tiles.)
    const partOf = () => (data.classList.contains('tool-lead') || (data.classList.contains('pz-sheet') && !data.classList.contains('tool-only')) ? tiles.el : tools.el);
    const setFold = (open) => {
      if (zoomOn() && !zoomFolds()) return;   // (a zoomed card too: the zoom fits the stack again as they move, zoomFollow; not while it glides in or back)
      // (Upright: fitted at rest as it will be, then the readings' card slides there from wherever it stood, slideUnder.)
      if (splitSheet(data)) {
        const u0 = underU(data);
        // (The view as the readings rest now, to follow from: camFollow. Already following (a finger let go), it follows on.)
        const vNow = !stage.following?.() && (u0 === 0 || u0 === 1) && camFollowOk() ? stage.viewNow?.() : null;
        stopUnder();
        // (The handle's own 24 px step to its open or tucked place, placeLip, is not made here: the readings' slide carries the handle all the
        // way, so that step ran against it as a second move and the handle jumped 24 px at the start and wobbled back while the card slid:
        // Mohammad, 3 Nov 2026, "jitter when a card tucks and untucks".)
        lipStep = null;
        // alloc-rare: a card is built or tapped open: once per tap, not per frame
        data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
        // alloc-rare: a card is built or tapped open: once per tap, not per frame
        data.dataset.openFor = String(want);
        delete data.dataset.folding; fitDone.delete(data); layout();
        measureUnder(data);
        if (!stage.following?.() && !(vNow && camFollow(vNow, open))) foldReframe();
        data.dataset.folding = '';
        slideUnder(u0, open ? 1 : 0);
        clearTimeout(foldT); foldT = setTimeout(foldStill, reduce.matches ? 0 : 450);
        return;
      }
      // alloc-rare: a card is built or tapped open: once per tap, not per frame
      const p = partOf(), cs = readStyle(p), from = ['maxHeight', 'opacity', 'marginTop', 'marginBottom'].map((n) => [n, cs[n]]);
      p.style.transition = 'none'; for (const [n] of from) p.style[n] = '';
      // alloc-rare: a card is built or tapped open: once per tap, not per frame
      data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
      // alloc-rare: a card is built or tapped open: once per tap, not per frame
      data.dataset.openFor = String(want);   // (the slide it was tapped on: kept open there, layout and phoneTextCap)
      delete data.dataset.folding; fitDone.delete(data); layout();
      // (Then back to where the part stood, from which it eases to its rest.)
      data.dataset.folding = '';
      for (const [n, v] of from) p.style[n] = v;
      readBox(p); p.style.transition = ''; for (const [n] of from) p.style[n] = '';
      clearTimeout(foldT); foldT = setTimeout(foldStill, reduce.matches ? 0 : 450);
    };
    // The camera starts for the room the cards will leave as the readings' card starts to move, in step with it (Mohammad, 30 Oct, iPhone:
    // "The view still snaps/jumps when I untuck a stacked card"). Framed once the card had come to rest (foldStill, 450 ms or more after the
    // tap), the readings' card slid over the figure and stopped, and only then did the figure move off from under it. Framed here, between
    // the layout and the slide: the card stands as it will rest (its class set, not yet sliding) and its handle is placed at its foot, so the
    // camera reads the room it will have. foldStill's own refit then finds the camera already headed there (frameBox and fitSlow leave a
    // glide to the same view alone). (Not while a slide comes in or goes, a dock moves the card (dockTo frames for where it goes), a zoomed
    // card (it frames itself) or a resize still settling.)
    const foldReframe = () => {
      if (!shown || shown.i !== want || shown.gen !== gen || (busy && !playing) || leaving || dock.to !== 0 || dock.lvl !== 0 || zoomOn() || reframeT) return;
      placeLip();
      reframe(400);
    };
    let foldT = 0;
    const foldStill = () => {
      clearTimeout(foldT);
      if (!('folding' in data.dataset)) return;
      if (data.classList.contains('pz-sliding') || readAnims(partOf()).some((a) => a.playState === 'running')) { foldT = setTimeout(foldStill, 100); return; }   // (still easing: a slow frame)
      stage.followEnd?.();   // (at rest: the view stands at the framing for where it rests, and the refit below finds it there)
      delete data.dataset.folding; fitDone.delete(data); onResize();
    };
    const fold = h('button', { class: 'pz-fold', type: 'button', 'aria-expanded': 'false', onclick: () => setFold(!data.classList.contains('tool-open')) }, 'Show');
    // The corner icon that zooms the instrument's card (Mac and iPad landscape; shown by styles/app.css .pz-zbtn only where the card has room to grow).
    const zbtn = h('button', { class: 'pz-zbtn', type: 'button', 'aria-label': 'Enlarge this card', 'aria-expanded': 'false', title: 'Enlarge', onclick: () => zoomToggle() }, icon('fullscreen'), icon('shrink'));
    // A phone's sheet under the card (.pz-sheet, dockVec): its edge carries the handle. A tap steps through the three states, as the
    // card's own pulls and pushes do: partly open, fully open, closed to its edge at the top, partly open again.
    const lip = h('button', { class: 'pz-lip stage-blocker', type: 'button', hidden: true, 'data-safe-rest': '', 'aria-label': 'Show the rest of the card', onclick: () => {
      if (performance.now() - (dock.tapAt || 0) < 700) return;   // (a touch that already opened the closed card, dockTouch)
      // (On a zoomed card the handle rides with it: a tap brings the readings out or tucks them away there, the zoom fitted to the stack as they go;
      // not while the card glides in or back.)
      if (zoomOn()) { if (zoomFolds() && wideSheet(data)) setFold(!data.classList.contains('tool-open')); return; }
      // (Upright: partly open, fully open, partly open (its readings' card tucked away), closed, partly open again.)
      const split = splitSheet(data);
      // (A tap while the readings are still sliding turns the slide round, it does not step on to "closed": a second tap on Hide while the
      // card was still moving put the whole card away, content and all: Mohammad, 3 Nov 2026, iPhone.)
      if (split && data.classList.contains('pz-sliding')) { setFold(!data.classList.contains('tool-open')); return; }
      if (dock.to === 1) { dock.auto = false; dockTo(0); }
      else if (wideSheet(data)) setFold(!data.classList.contains('tool-open'));   // (Mac and iPad landscape: the handle only brings the readings out or tucks them away)
      else if (data.classList.contains('tool-open')) { if (split) { dock.down = want; setFold(false); } else { dock.auto = false; dockTo(1); } }
      else if (split && dock.down === want) { dock.auto = false; dockTo(1); }
      else setFold(true);
    } });
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', 'data-safe-rest': '', 'data-safe-waits': '', 'data-gone': '', hidden: true, 'aria-label': 'The numbers' },
      h('div', { class: 'pz-dh' }, dhT, tiles.head, fold, zbtn), tools.el, tiles.el, h('span', { class: 'pz-grip', 'aria-hidden': 'true' }));
    const foldHs = foldTouch(data, fold, setFold, partOf, (on) => { if (on) { clearTimeout(foldT); data.dataset.folding = ''; } else foldT = setTimeout(foldStill, reduce.matches ? 0 : 450); }, lip);
    const dockHs = dockTouch(data, lip);
    const cardTouch = [foldHs, dockHs];   // (fold first: it stops the dock drag when it takes a move, as on the card)
    // (Shown with the sheet only, and kept at the card's foot as the card grows or shrinks, a part easing open included.)
    // (Shown with a card already standing (its sheet came on in the pass that let the cards in, or a move was cut short and they came in as it
    // ended), a handle that was display: none starts from its out look, pz-lip-in, and eases in with the card's own fade: it came up at
    // full strength at once, ahead of the cards.)
    const lipSync = () => {
      const was = lip.hidden;
      lip.hidden = data.hidden || !data.classList.contains('pz-sheet');
      const enter = was && !lip.hidden && !data.classList.contains('pz-hide');
      if (enter) lip.classList.add('pz-lip-in');
      placeLip();
      if (enter) { void readMetric(lip, 'offsetWidth'); lip.classList.remove('pz-lip-in'); }
    };
    const lipMO = new MutationObserver(lipSync);
    lipMO.observe(data, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    // (Not while the readings' card slides: each frame's --pz-u already places it, lipMO, from the slide's own sums.)
    const lipRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!data.classList.contains('pz-sliding')) placeLip(); }) : null;
    lipRO?.observe(data, { box: 'border-box' });
    // A part that has finished folding or unfolding: fit the card again from full size (a fit taken mid-fold kept the tiles small).
    data.addEventListener('transitionend', (e) => { if (e.propertyName === 'max-height' && e.target.parentElement === data) { if ('folding' in data.dataset) foldStill(); else { fitDone.delete(data); onResize(); } } });
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true });
    const prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    // (An iPhone's credit: one 12 px line at the teaching card's foot, the same on every slide; styles/app.css .pz-cred.)
    const shade = h('div', { class: 'pz-shade' }, deckTab(), h('span', { class: 'pz-sitetab', hidden: true }), h('span', { class: 'pz-cred', 'aria-hidden': 'true' }, wrap.querySelector('.stage-credit')?.textContent.trim() || ''));
    // What the figure frames itself clear of: the words, the glass and its shadow.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    // (Three scales on one plate: the room the windows' column takes on the right, which the figure frames itself clear of, and the plate's frame: the ring, the spot and the cone are the GPU's: cutout-frame-gl.js.)
    const psafe = h('div', { class: 'pz-safe pz-safe-r', 'data-safe': 'right', 'aria-hidden': 'true', hidden: true });
    const pshut = h('button', { type: 'button', class: 'pz-lens-x', 'aria-label': 'Close the lobule window', hidden: true, onclick: (e) => { e.stopPropagation(); plateSet(false); } }, '×');
    // (Once faded out, its spinner stops (idle) until it is shown again: it had turned, unseen, for the whole talk.)
    const idle = (e) => { if (e.target === load && e.propertyName === 'opacity' && !load.classList.contains('on')) load.classList.add('idle'); };
    const load = h('div', { class: 'pz-load idle', 'aria-hidden': 'true', ontransitionend: idle, ontransitioncancel: idle }, h('i'));
    const jump = h('nav', { class: 'pz-jump stage-blocker', hidden: true, 'aria-label': 'Slides' });
    const vcase = h('section', { class: 'pz-case stage-blocker', hidden: true, onclick: () => { if (performance.now() - caseDragAt > 400) caseLift?.(); } });
    // The slide's colour key, small on the figure (src/ui/figure-key.js fades it in; its words are set by figKey). The figure's labels keep clear of it (stage-blocker).
    const fk = h('div', { class: 'pz-fk stage-blocker', role: 'img', hidden: true, 'data-empty': '', 'aria-hidden': 'true' });
    // One announcement per slide for a screen reader ("Slide 3 of 12: its title"), not the whole card and panel read out each
    // time they are rewritten (they carry no live region of their own).
    const say = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    // The slide's scale switch (slide field scales): Anatomy, Lobule, Sinusoid, as Explore's pill. It comes and goes with the
    // teaching card; the figure's labels keep clear of it, and on a phone the camera frames above it (data-safe, set in placeScales).
    const scl = h('div', { class: 'pz-scales stage-blocker pz-leave', role: 'group', 'aria-label': 'Scale', hidden: true });
    // The zoom's veil sits over the words and the figure and under the card, its handle and the controls: a tap on it puts the card back.
    const zscrim = h('div', { class: 'pz-zscrim', 'aria-hidden': 'true', onclick: () => zoom.close().then(paintZoom) });
    // (A cell of the six ladders zoomed to the middle (cellOpen): the page behind the panel is dimmed by this veil, the panel's own by the one in its grid.
    // The scale is read at the element: a cell sits in the panel's fit zoom, which the card does not.)
    const pscrim = h('div', { class: 'pz-pscrim', 'aria-hidden': 'true', onclick: () => zoom.close().then(paintZoom) });
    // (The veil for the teaching card zoomed as the main card: at the figure's level, just under its glass (the shade), zoomOpen.)
    const fscrim = h('div', { class: 'pz-fscrim', 'aria-hidden': 'true' });
    const zoom = createCardZoom({ card: data, along: [lip], scrim: zscrim, app, area: () => readBox(wrap),
      scale: (el) => (el && el !== data && readMetric(el, 'offsetWidth') ? readBox(el).width / readMetric(el, 'offsetWidth') : readBox(wrap).width / (readMetric(wrap, 'clientWidth') || 1)) || 1,
      reduce: () => reduce.matches, boost: setCanvasBoost, hold: zoomCredit, settled: zoomSettled,
      // (The words' card stays up while the card is zoomed; its words, and its deck tab on the card's edge (the shade holds the tab), are cut away under the card, card-zoom.js, and it rests at slip.base's rise meanwhile.)
      camera: { open: () => !!stage.zoomOpen?.(), at: (s, x, y, dx, dy) => stage.zoomAt?.(s, x, y, dx, dy), end: () => stage.zoomEnd?.(), sharp: (on) => stage.zoomSharp?.(on) }, scene: () => [text, shade], behind: zoomBehind });
    tapTracker(data, { ok: () => zoomReady() || zoom.up, onTap: () => zoomToggle() });
    tapTracker(text, { ok: () => zoomReady() || zoom.up, onTap: () => zoomToggle('text') });   // (a tap on the teaching card is the same zoom as on the data card: both come into view together, 5 Nov 2026)
    tapTracker(panel, { ok: () => cellReady() || zoom.up, onTap: cellTap });
    const root = h('div', { class: 'pz' }, safe, veil, load, fk, text, zscrim, data, lip, panel, vcase, prog, scl, bar, jump, blackEl, say, psafe, pshut);
    root.classList.add('pz-page'); shade.classList.add('pz-page');   // (the teaching card as one page: card-page.js)
    root.classList.add('pz-throw'); shade.classList.add('pz-throw');   // (Next and Back throw the cards: app.css .pz-throw)
    veil.after(pscrim);   // (above the page's veil, under everything else)
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    shade.before(fscrim);
    // The teaching card's glass is the card itself: it leaves and arrives with the words, never resizing in view.
    // (Except while the words turn over on it (pz-turn, glassTurn): then the glass stays and only the words go.)
    const shadeMO = new MutationObserver(() => shade.classList.toggle('pz-leave', text.classList.contains('pz-leave') && !shade.classList.contains('pz-turn')));
    shadeMO.observe(text, { attributes: true, attributeFilter: ['class'] });
    wrap.append(root);
    // The scope view on the figure (scope-lens.js): the ring on the varices of a slide that shows them, and its lens, kept clear of the cards.
    const scope = createScopeLens({ stage, store, root, avoid: () => [text, shade, data, lip, panel, vcase, prog, scl, bar, fk] });
    // (It comes in with the teaching card, in the card's own fade, once the card is fitted (pz-prep gone), and leaves with it.)
    const figKey = createFigureKey({ el: fk, app, watch: [text, root], ready: () => !text.hidden && !text.classList.contains('pz-leave') && !root.classList.contains('pz-prep') });
    // The cards' frosted glass drawn on the GPU under them while it can be (stage.cardGlass, glass-gl.js); else the browser's.
    // (The split readings sheet's glass is its two pseudo-elements', read by sheetPanes; every other card's is its own box.)
    // (Not the teaching card's shade: on an iPhone, moved between the browser's blur and the GPU's as the figure came and went (a fade, the
    // lobule), it lost its outline, tabs and credit and kept only the glass, Safari dropping its own layer's picture (Mohammad, 1 Nov
    // 2026, at 25a4f68f, and a layer of its own did not keep it). It keeps the browser's blur, as it had until that day.)
    // (1 Nov 2026, evening: the shade is on the GPU glass again, as every other card, now that no glass ever goes back to the browser's blur
    // (app.css: where the figure's canvas cannot take it, the shade turns solid; no backdrop-filter is declared anywhere) and the shade keeps one
    // layer of its own throughout, so the swap that lost its picture on an iPhone no longer happens.)
    // alloc-rare: a card is built or tapped open: once per tap, not per frame
    const glass = stage.glass?.add(() => [shade, data, vcase, bar, scl, fk], { card: true, watch: [root, shade], before: shade, low: (e) => e === shade, read: (g) => (g === data || g.dataset?.ghost === 'data' ? sheetPanes(g) : undefined), shift: riseShift }) || null;
    return { root, shade, safe, psafe, pshut, load, text, data, lip, lipRO, lipMO, shadeMO, cardTouch, setFold, zoom, zbtn, pscrim, zscrim, fscrim, partOf, vcase, fk, figKey, glass, dhT, tiles, tools, veil, panel, prog, scl, bar, black: blackEl, jump, say, scope };
  }
  // The start's cover (see start). While it is up (booting) the camera cuts instead of gliding.
  let cover = null, booting = false, coverT = 0, noCase = false;   // (noCase: the slide a start lands on, a reload's included, does not play its case card)
  function coverUp() {
    booting = true;
    clearTimeout(coverT); coverT = setTimeout(() => coverDown(true), 12000);   // (never left up)
    if (!cover) { cover = h('div', { class: 'pz-cover', 'aria-hidden': 'true' }, h('i')); document.body.append(cover); void readMetric(cover, 'offsetWidth'); }
    // (A deck link opened cold: the loading cover is still up, and it lifts onto this one. This cover is on at once, not faded in, so the
    // loading cover never lifts onto the plain app's bars and an empty figure for the length of a fade.)
    const cold = document.documentElement.dataset.boot === 'hold';
    if (cold) cover.classList.add('cut');
    cover.classList.add('on');
    // alloc-rare: boot cover: once per load
    if (cold) { void readMetric(cover, 'offsetWidth'); nextFrame(() => nextFrame(() => cover?.classList.remove('cut'))); }
    return wait(reduce.matches ? 0 : 300);
  }
  // The slides' fonts, every subset they draw from (Latin, Latin Extended, Greek for μ or Δ), are loaded under the start's cover:
  // a subset is otherwise fetched on its first use, and its words show in a stand-in font first, then swap and change size.
  const fontsIn = () => (document.fonts?.load
    ? Promise.race([Promise.all(['400 16px Inter', '600 16px Inter', '600 32px "Source Serif 4"'].map((f) => document.fonts.load(f, 'Aāαἀ').catch(() => {}))), wait(1500)])
    : null);
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
      // (Once more as the entrances end: the slide's own framing, set outright for the cards where they now rest.)
      // alloc-rare: boot cover: once per load
      await new Promise((done) => restPass(() => { try { if (ui && shown && booting) { settle(); clearTimeout(reframeT); reframeT = 0; reframe(0); } } finally { done(); } }));
      // alloc-rare: boot cover: once per load
      await new Promise((done) => nextFrame(() => nextFrame(done)));
    }
    clearTimeout(coverT); booting = false;
    const c = cover; cover = null;
    if (!c) return;
    c.classList.remove('on');
    // alloc-rare: boot cover: once per load
    setTimeout(() => c.remove(), reduce.matches ? 0 : 700);
  }
  // Everything the audience's slides will change, kept so Esc, ✕ or Finish can put the viewer's own settings back (the patient itself returns to healthy, see putHealthy).
  async function capture() {
    const st = store.get(), { snap } = await host.request('snapshot');
    return { snap, params: structuredClone(st.params), presetId: st.presetId, view: st.view, lobule: st.lobule, sinusoid: st.sinusoid, mode: st.mode,
      selection: st.selection, details: st.details, compareSnap: st.compareSnap, compareView: st.compareView, colorMode: st.colorMode,
      lobuleLayers: st.lobuleLayers, running: st.running, speed: st.speed, lapse: st.lapse, clock: st.clock, hvpgMeasured: st.hvpgMeasured, lastHVPG: st.lastHVPG,
      labelK: stage.labelScale(), cam: stage.cameraState() };
  }
  let startGen = 0;
  async function start(id, at = 0, opts = null) {
    // (The slide a start lands on never plays its case card: it was skipped only while the start's cover was up, and the cover
    // gives up after 12 s, so on a slow machine a deep link sat on a case card waiting for a tap no one knew to give.)
    noCase = true;
    const startMine = ++startGen;   // (B14: a start overtaken by a newer one does not install its deck over it)
    // (A talk still fading out is ended by this start, not by its own fade's end, which would otherwise run its restore under
    // the new talk; a return to healthy still under way stops where it is: motion review round 2, RF5.)
    leaving = null; healthyGen++;
    // (An old id opens the deck that took its slides, at slide 1: the slide number it was linked with means nothing there.)
    const aliased = typeof id === 'string' && Object.hasOwn(DECK_ALIAS, id);
    const want0 = aliased ? 0 : Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (aliased ? DECK_ALIAS[id] : id));
    if (!d && typeof id === 'string' && id.startsWith('test-') && !TESTING.length && !opts?.waited) return testingLoad.then(() => start(id, at, { ...opts, waited: true }));   // (a ?script= link to the preview's test deck, asked before it loaded)
    if (!d?.slides?.length) { toast('That presentation could not be found.', 'bad'); return; }
    // The start is one composed reveal: a calm cover fades over the screen, the projector layout, the first patient and
    // the first slide are all set up under it, and the cover fades away once nothing behind it is still moving.
    const up = Promise.all([coverUp(), fontsIn()]);
    // Starting another deck while one runs keeps the state from before the first.
    const before = deck ? saved : await capture();
    await up;
    if (startMine !== startGen) return;
    if (deck) stopNow(false);
    lastAt = -1;
    saved = before;
    if (saved && !saved.cards) saved.cards = stashCards?.();
    deck = d; slides = (d.mine ? d.slides : withOverview(d).slides).map(oneLadder).map(zoneCam);   // (the old ladder card's slides show the Gut to heart profile)
    shown = null; entering = null; shownState = -1; black = false; app.classList.remove('pz-blacked');
    closeHome?.();
    const st0 = store.get();
    if (!layersBefore) layersBefore = { ...st0.lobuleLayers };
    stage.setKeyStops?.(false);   // (the figure is read-only here: no Tab stops on it)
    store.set({ presenting: true, selection: null, details: null, compareSnap: null, colorMode: 'pressure', presentLabels: [], focus: null, stented: [], ...(st0.mode !== 'explore' ? { mode: 'explore' } : {}) });
    if (st0.view !== 'anatomic' && !st0.lobule) store.set({ view: 'anatomic' });
    projectorOn();
    app.classList.add('presenting'); themeChanged();   // (.app.presenting restyles the labels: label-theme.js)
    document.getElementById('stage')?.dispatchEvent(new PointerEvent('pointerleave'));   // a hover lit as the deck starts clears
    getSelection()?.removeAllRanges?.();
    app.classList.toggle('pz-hi', hiCon);
    app.style.setProperty('--pz-wk', String(PW_K[pzWidth]));
    sess?.dispose(); sess = createScope();
    ui = build();
    dataOn = textOn = null; keepNow = NO_KEEP; keepSnap = null; keepBad = []; keepArgs = null;   // (no card on screen yet)
    setLabels();
    prepare();
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onHidden);   // (a held strain lets go with the page)
    inkOf();   // (N2: the pen and spotlight listen from the talk's start, so a press and hold on the iPad finds them)
    sizeSeen = sizeNow();
    wrapRO ||= typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (ui && sizeNow() !== sizeSeen) onResize({ type: 'resize' }); }) : null;
    wrapRO?.observe(wrap);
    document.fonts?.addEventListener('loadingdone', onFonts);   // (a font arriving late changes the words' size: the cards are fitted again)
    go(Math.min(want0, slides.length - 1));
    wake();
  }
  // Ending a talk, the slide's cards fade out first (the exit curve, .2 s), then the app's own bars and zoom pill fade back in,
  // rather than everything swapping in one frame (motion review P2). A new talk started meanwhile ends this one at once.
  let leaving = null;
  function stop(restore = true) {
    if (!deck || leaving) return;
    const els = ui ? [ui.root, ui.shade].filter((el) => el?.animate) : [];
    if (!els.length) { stopNow(restore); chromeIn(); return; }   // (Reduce Motion too: these are fades only, which it keeps)
    for (const el of els) el.inert = true;
    const me = leaving = Promise.all(els.map((el) => glideOpacity(el, 1, 0, D_SMALL, easeIn)));   // (on the eases' clock: the card and its glass fade in one frame)
    me.then(() => { if (leaving !== me) return; stopNow(restore); chromeIn(); });
  }
  function chromeIn() {
    for (const el of app.querySelectorAll('.topbar, .vdock, .stage-bar, #zoomPill, .toolbar')) {
      if (readRects(el).length) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
    }
  }
  function stopNow(restore = true) {
    leaving = null;
    if (!deck) return;
    ink?.dispose(); ink = null;
    pview.end();
    sess?.dispose(); sess = null; colT = refitT = reframeT = turnT = glassT = 0; swapNow = false;   // (R03: this talk's timers stop with it, none left to act on the next)
    if (cover) coverDown(true);
    strainStop(); stopLapse(); procStop(); cathStop(); abSlow(); liveOff = false; handOn = false;   // (before deck is cleared: stopping a time-lapse repaints the bar)
    txn?.end(); txn = null;
    slidePrep.cancel(); clearTimeout(prepT); prepT = 0;   // (recs §6: the preparation stops with the deck; nothing it started publishes after)
    deck = null; shown = null; entering = null; want = 0; gen++;   // (gen: a slide move still in flight is cut where it is, even if another talk starts before it notices)
    for (const w of waiters) w.res(null);
    waiters = [];
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onHidden);
    wrapRO?.disconnect();
    document.fonts?.removeEventListener('loadingdone', onFonts);
    fitRO?.disconnect(); clearRO?.disconnect(); fitKids = []; clearFor = null; clearTimeout(clearT); cancelRest(fitRaf); cancelRest(paneRaf);
    store.set({ presenting: false, presentLabels: null, presentTerms: null, presentNames: false, focus: null, stented: [], lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null); delete app.dataset.lit;
    figureHooks('clear');
    hushed = false; lastCam = null; clearTimeout(hushInT); app.classList.remove('pz-hush', 'pz-hush-in', 'pz-held'); heldNow = false; holdEase = false;
    cancelFrame(slip.raf); slip.d = null; slip.h0 = null; stage.followEnd?.();
    clearTimeout(dataHideT); dataHideT = 0; clearTimeout(widthT); widthT = 0; widthOwn = false;   // (a panel width asked in the talk's last 240 ms: never applied after it, setPanelWidth)
    clearTimeout(idleT); clearTimeout(dock.fit); dockHalt(); dock.lvl = 0; dock.to = 0; dock.drag = false; dock.auto = false; dock.autoKey = '';
    // (The throws let go of with the cards: a card out of sight, held or pinned at an inline 0, was kept by card-throw.js's sets after its talk,
    // with the readings' pictures it carried; a talk that began meanwhile saw its move still running on a card that was gone.)
    if (ui) for (const el of [ui.text, ui.shade, ui.data, ui.panel]) throwStop(el);
    caseShut();   // (R02: a case card left up is shut with its talk here; a move of that talk that ends later no longer does it, transition)
    if (pageHeld) { clearTimeout(pageHeld.t); pageHeld = null; }
    pull = null; pageForce = false; bare = false; throwDir = ''; throwD = 0;
    dataOn = textOn = null; keepNow = NO_KEEP; keepSnap = null; keepBad = []; keepArgs = null;
    pillW = 0; ui?.zoom.reset(); ui?.tools.dispose(); lgDrop(); evDrop(); ui?.scope?.dispose(); ui?.tiles?.dispose(); ui?.figKey.dispose(); ui?.glass?.remove(); ui?.lipRO?.disconnect(); ui?.lipMO?.disconnect(); ui?.shadeMO?.disconnect(); ui?.root.remove(); ui?.shade.remove(); ui?.fscrim.remove(); ui = null; plateApply(null); app.classList.remove('pz-blacked');
    view.classList.remove('pz-out');
    insets.reset();   // (and a room held through the last slide change is never written back after the talk: inset-hold.js)
    stage.lobuleHold?.(false);   // (a way out of the lobule left unfinished: the lobule follows the free space again)
    stage.setProjection(false); labelsFor = '';
    document.documentElement.style.setProperty('--label-k', String(stage.labelEff())); document.documentElement.style.setProperty('--label-scale', String(stage.labelScale()));
    dispatchEvent(new Event('pps:labelscale'));
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.classList.remove('presenting', 'pz-hi'); themeChanged();   // (and pz-held, taken off above)
    stage.setKeyStops?.(true);
    app.style.removeProperty('--pz-wk');
    projectorOff();
    dispatchEvent(new Event('pps:occ'));
    if (restore && saved) putHealthy(saved);
    if (restore) { saved = null; if (layersBefore) store.set({ lobuleLayers: layersBefore }); layersBefore = null; }
    // (The talk is over: a reload, or a tab the phone discarded and brings back, must not start it again from the link that opened it.)
    if (restore) { try { const u = new URL(location.href); if (u.searchParams.has('script')) { u.searchParams.delete('script'); u.searchParams.delete('slide'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) { caught('presenter:5785', e); /* no history here */ } }
  }
  // When the show ends, the app returns to the healthy patient from the start (not to where the viewer was): healthy preset, anatomy view
  // framed to fit, tools and cards closed, nothing from the last slide left on. The viewer's own settings (theme, label size, the
  // lobule layers they chose) stay as they were. The figure dims softly while the patient changes, as between slides, so nothing pops.
  // (A talk started meanwhile takes over: healthyGen moves on, and this return stops at its next step, the figure easing back
  // to full rather than staying dimmed or turning healthy under the new talk; motion review round 2, RF5.)
  let healthyGen = 0;
  async function putHealthy(b) {
    const ms = reduce.matches ? 0 : D_SURFACE;
    const me = ++healthyGen, gone = () => me !== healthyGen && (view.style.opacity = '', true);
    if (ms) { view.style.transition = `opacity ${ms}ms var(--ease)`; view.style.opacity = '.22'; await waitCut(ms, gone); if (gone()) return; }
    const st = store.get();
    store.set({ mode: 'explore', colorMode: 'pressure', selection: null, details: null, compareSnap: null, compareView: 'B', hvpgMeasured: false, lastHVPG: null, lapse: 0, speed: 1 });
    if (st.sinusoid) { store.set({ sinusoid: false }); await waitCut(reduce.matches ? 0 : 1000, gone); if (gone()) return; }
    if (st.lobule) { store.set({ lobule: false }); await until(() => gone() || stage.lobuleSettled(), 2600); await waitCut(80, gone); if (gone()) return; }
    if (b.lobuleLayers) store.set({ lobuleLayers: b.lobuleLayers });
    if (store.get().view !== 'anatomic') { store.set({ view: 'anatomic' }); if (!reduce.matches) await viewSettled(gone, stage); if (gone()) return; }
    host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
    await loadPreset?.('healthy');
    if (gone()) return;
    stage.fitSlow(reduce.matches ? 0 : 700);
    if (ms) { await wait(260); view.style.opacity = ''; await wait(ms + 60); if (me === healthyGen) view.style.transition = ''; }
  }

  // ── Library (the menu's Present column) ──
  function captureStep() {
    const st = store.get();
    return { title: st.presetList?.find((p) => p.id === st.presetId)?.label || 'Step', preset: st.presetId, params: structuredClone(st.params), view: st.view, notes: '' };
  }
  async function newScript() {
    const title = await askText({ title: 'New script', label: 'Name', value: 'My script', yes: 'Create' });
    if (!title) return;
    const list = readMine();
    list.push({ id: 'my-' + Date.now().toString(36), title, summary: 'Built from the live model.', steps: [captureStep()] });
    if (!writeMine(list)) { toast(NO_ROOM, 'bad'); return; }
    rerenderHome?.();
    toast('Script created with the current model as its first slide. Change the model and use “Add current state” to add more.');
  }
  async function addStep(id) {
    if (!readMine().find((x) => x.id === id) || readMine().find((x) => x.id === id).deck) return;
    const step = captureStep();
    const named = await askText({ title: 'Add this state as a slide', label: 'Slide title', value: step.title, yes: 'Add slide' });
    if (!named) return;   // (Cancel, the × and Esc add nothing; the field never answers empty)
    step.title = named;
    const list = readMine(), s = list.find((x) => x.id === id);   // (read again: the dialog was open a while)
    if (!s || s.deck) return;
    s.steps.push(step);
    if (!writeMine(list)) { toast(NO_ROOM, 'bad'); return; }
    rerenderHome?.();
  }
  async function remove(id) {
    // alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
    const s = readMine().find((x) => x.id === id);
    // alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
    if (!await confirmDialog({ title: 'Delete this script?', body: s ? `“${s.title}” and its slides will be removed from this device. A link or an exported file you made of it still opens.` : 'It will be removed from this device.', yes: 'Delete', danger: true })) return;
    // alloc-rare: the saved-scripts list: runs on a user edit (the scan reaches it only through the name remove)
    if (!writeMine(readMine().filter((x) => x.id !== id))) { toast(NO_ROOM, 'bad'); return; }
    rerenderHome?.();
  }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify(s, null, 2), 'application/json'); }
  // (Where the clipboard is not allowed, the link is shown in the app's own dialog, selected, to copy by hand.)
  const showLink = (url) => {
    const f = h('input', { class: 'ask-field', type: 'text', readOnly: true, value: url, 'aria-label': 'Link' });
    f.addEventListener('focus', () => f.select());
    openModal('Copy this link', h('div', {}, h('p', {}, 'Your browser did not allow copying. Select the link and copy it.'), f,
      h('div', { class: 'btn-row end' }, h('button', { class: 'btn primary', onclick: () => closeModal() }, 'Done'))), { compact: true });
    f.focus({ preventScroll: true });
  };
  const copy = (url, msg) => navigator.clipboard?.writeText(url).then(() => toast(msg, '', { present: true }), () => showLink(url)) ?? showLink(url);
  const shareScript = (s) => copy(`${location.origin}${location.pathname}#script=${enc(s)}`, 'Link copied: opening it adds the script to the recipient’s library.');
  // Built-in decks share through their page (c/deck-<id>.html, scripts/share-pages.mjs) on the hosted site, so a link preview shows the deck title.
  const shareDeck = (d) => copy(location.hostname.endsWith('github.io') && /^[\w-]+$/.test(d.id) && !String(d.id).startsWith('my-') ? new URL(`c/deck-${d.id}.html`, location.href).href : `${location.origin}${location.pathname}?script=${d.id}`, 'Link copied: it opens this presentation at its first slide.');
  // Import: a deck .js file (the format of src/ui/decks), a deck or script as .json, or the same text pasted.
  function importFile() {
    const area = h('textarea', { class: 'imp-src', rows: 10, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Deck file contents',
      placeholder: "export const MY_DECK = {\n  title: 'My talk',\n  slides: [ { title: '…', line: '…' } ],\n};" });
    const err = h('p', { class: 'imp-err', role: 'alert', hidden: true });
    const add = (text) => {
      try { addText(text); closeModal(); } catch (e) { err.textContent = e.message || 'That is not a deck or a script.'; err.hidden = false; }
    };
    const inp = h('input', { type: 'file', accept: '.js,.mjs,.json,text/javascript,application/javascript,application/json', hidden: true });
    inp.addEventListener('change', async () => { const f = inp.files[0]; if (f) add(await f.text()); inp.value = ''; });
    openModal('Import a presentation', h('div', { class: 'imp' },
      h('p', {}, 'Choose a deck file (.js, written like the built-in decks) or a script (.json), or paste its contents. The file is read as data and never run.'),
      inp,
      h('button', { class: 'btn', onclick: () => inp.click() }, icon('download'), 'Choose a file…'),
      area, err,
      h('div', { class: 'btn-row end' },
        h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => add(area.value) }, 'Add to your scripts'))), { sub: null });
  }
  // A script (title, steps) as JSON is kept as before; anything else must be a deck.
  function addText(text) {
    let o = null;
    try { o = JSON.parse(text); } catch (e) { caught('presenter:5877', e); /* not JSON */ }
    if (o?.title && Array.isArray(o.steps)) return addToLibrary(o);
    if (o?.deck) return addToLibrary(o);
    return addToLibrary({ deck: parseDeckSource(text) });
  }
  function addToLibrary(s) {
    if (s?.deck) {
      const d = checkDeck(s.deck);
      s = { title: d.title, summary: d.summary || '', deck: d };
    } else if (!s?.title || !Array.isArray(s.steps) || !s.steps.every((st) => st && typeof st === 'object')) throw new Error('That is not a deck or a script.');
    const list = readMine();
    const id = 'my-' + Date.now().toString(36);
    list.push({ ...s, id, builtin: undefined });
    if (!writeMine(list)) throw new Error(NO_ROOM);
    rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
    return id;
  }
  /** A shared link (#script=…) adds its script to this device's library; returns its id (true if it could not be read). */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    let id = true;
    try { id = addToLibrary(dec(m[1])); } catch (e) { toast(e?.message === NO_ROOM ? NO_ROOM : 'The shared script could not be read.', 'bad'); }
    history.replaceState(null, '', location.pathname + location.search);
    return id;
  }

  // What the unified menu (menu.js) lists and does: the presentations, this device's scripts and their actions.
  const library = () => ({ decks: DECKS, topics: TOPICS, levels: LEVELS, mine: readMine(), testing: TESTING, start, shareDeck, notes: (d) => openHandout(d, deckNumbers(d)),
    startView: (id, at) => { pview.open(); return start(id, at); },   // (N1: the window opens inside the tap, then the talk starts)
    scriptNotes: (s) => { const d = fromScript(s); openHandout(d, deckNumbers(d)); }, newScript, importFile, addStep, shareScript, exportScript, remove, current: () => deck?.id ?? null,
    resumeAt: (d) => resumeFor(d.id, (d.mine ? d.slides : withOverview(d).slides).length) });

  return { start, stop, library, readLink, active: () => !!deck, ink: () => ink,
    // Where the show is (for the preview pill's reload): the deck and the slide on screen, or the one it is moving to.
    position: () => (deck ? { id: deck.id, at: shown?.i ?? want } : null),
    // For the browser checks: straight to slide i (0-based) of the deck shown, as the arrow keys move.
    go: (i) => go(i), busy: () => busy, glass: () => ui?.glass ?? null, degraded: () => ({ ...degraded, now: ui?.root.dataset.pzDegraded || '' }), skipLapse: () => skipLapse(),   // (a time-lapse sped to its end, as Next does)
    // What Settings shows while presenting.
    settings: () => ({ width: pzWidth, setWidth: setPanelWidth, contrast: hiCon, setContrast, stacked: phone() }),
    // For the browser checks: the time-lapse slides, and the card's tiles as the slide shown should read them at its start and end.
    probe: () => {
      const txt = (k, f) => (rateOf(k, f)[0] == null && (k === 'saag' || k === 'tp') ? '—' : tileVal(k, f[k]));   // (as bigTiles shows it)
      const i = shown?.i ?? -1, s = slides[i], ks = s ? tileKeys(s) : [], end = s && states[stateOf[i]], start = s?.lapse && i > 0 ? end?.start || states[stateOf[i - 1]] : end;
      return { i, lapses: slides.flatMap((x, j) => (x.lapse && j > 0 && x.data ? [j] : [])), charts: slides.flatMap((x, j) => (x.lapse && j > 0 && x.tool?.kind === 'flowtime' ? [j] : [])), playing: lapseOn, keys: ks,
        start: start ? ks.map((k) => txt(k, respFp(s, start.fp))) : null, end: end ? ks.map((k) => txt(k, respFp(s, end.fp))) : null };
    } };
}
