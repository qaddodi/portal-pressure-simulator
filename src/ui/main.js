// Application bootstrap: wires the engine host to the four surfaces (figure + action card,
// timeline, patient chart, instruments) and to Home, the command palette and the menus.

import { motionBudget } from './motion-budget.js';   // (first: counts from the start when ?perf or ?budget=1 asks)
import { budget as gpuBudget, deviceClass, overBudget } from './gpu-budget.js';   // (the render graph's registry and pass counts, R06: before any context is made)
import './gl-state.js';   // (early: every WebGL2 context is recorded from its creation, R09/R06)
import { startHost, host, hostFailed, restartHost } from './host.js';
import { store, updateParams, replaceParams, bindParamSender, clearHistory, logAction, varicesPresent, hiddenNow } from './store.js';
import { createStage } from './stage.js';
import { createCreditPlacer } from './credit.js';
import { whenQuiet, booting, holdCover } from './quiet.js';
import { sinusoidSupported } from './gl-support.js';
import { createInspector } from './inspector.js';
import { createDock, CUTOFFS, savedInstruments } from './dock.js';
import { setHvpgStage } from './hvpg-proc.js';
import { createWhy } from './why.js';
import { createTimeline, LAPSES } from './timeline.js';
import { createCompare } from './compare.js';
import { createCard } from './card.js';
import { createChart } from './chart.js';
import { createMenu } from './menu.js';
import { caption } from './a11y.js';
import { startLMS } from './lms.js';
import { sharpMoving, setSharpMoving } from './adapt-tier.js';
import { UPDATED, RELEASE, CONTENT_UPDATED, VALIDATION, AUTHOR, AUTHOR_URL, FEEDBACK_EMAIL } from '../version.js';
import { normalizeSel, shuntable, edgeValue, bedStats } from './actions.js';
import { gradientCss, dropCss, PRESSURE_TICKS, flowCss, flowPos, velocityCss, heatCss, HEAT_MAX, oxygenCss, OXY_MIN } from './colormap.js';
import { EDGES, PORTAL_TERRITORY } from '../engine/topology.js';
import { dopplerVel } from './velNormal.js';
import { controlOwnsKey } from './key-owner.js';
import { onTheme, themeSettled } from './theme-epoch.js';
import { cssVar, $, $$, h, icon, afterExit, fmt, fmtFlow, toast, TOASTS, loadFailed, tooltipFor, openModal, closeModal, isModalOpen, popover, closePopover, popoverOpen, menuItem, menuSection, svgIcon, isPhoneLayout, TABLET_UP_MQ, markGone, switchIn, enhanceRanges, systemEdge, swapFade, scrollBehavior, reconcile } from './util.js';
import { initMenuGlass, whyGlass } from './menu-glass.js';
import { glidePlateOn, platePieces, glideOnResize } from './plate-glide.js';
import { sheetParts, sheetOffset, setSheetOffset, stopSheet, glideSheet, dragSheet } from './sheet-move.js';
import { releaseSpeed, isFlick, flickAim, carryCurve, D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from './ease.js';
import { morphKey, crossfadeText } from './legend-morph.js';
import { glideNow } from './seg-glide.js';
import './focus-ring.js';
import { knownLook, currentLook, isDarkLook, lastDarkLook, applyLookAttrs } from './looks.js';
import { lookChooser } from './look-chooser.js';
import { TEXT_STEPS } from './type-scale.js';
import { moverOf, cancelMoves } from './num-move.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const app = $('#app');
// The app's classes less stage-busy (the floating pieces' fade while the figure moves: opacity only, nothing to place again).
const appClass = () => app.className.replace(/(?:^|\s)stage-busy(?=\s|$)/g, '');
const view = $('#stageView');
const isPhone = isPhoneLayout;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const NAMED_DETAILS = ['edge', 'node', 'organ'];   // (the selections whose name is the panel's title itself)
const SN_L = { class: 'sn-l' }, SN_S = { class: 'sn-s' }, SN_C = { class: 'sn-c' };   // (the scenario name's three forms)
const NAME_FORMS = ['l', 's', 's2', 'c2'], NAME_FORMS_NARROW = ['s2', 'c2'];   // (the scenario name's forms, widest first)
const FOCUS_NO_SCROLL = { preventScroll: true };
const NOOP = () => {};
const RUN_ON = { type: 'run', running: true }, RUN_OFF = { type: 'run', running: false };   // (host.send posts a copy)
const runOff = () => host.send(RUN_OFF);
const NOATTR = Object.freeze({});   // (the attributes of an element that has none: h() only reads them)
const INSTANT = { instant: true };   // (options for swapFade and the like: read, never written, so one object serves every call)
const TOOL_CLASS = { select: 'tool-select' };   // (the figure's class for each armed tool; only 'select' is ever set, any other is made once on its first use)
const toolClass = (t) => TOOL_CLASS[t] ||= 'tool-' + t;   // alloc-rare: made once per tool value, and only 'select' is ever set (it is in the table)
const ZOOM_TITLES = [['#zoomOut', 'Zoom out', 'Back out to the lobule'], ['#zoomFit', 'Fit the figure to the view', 'Back out to the lobule']];   // (button, title, title in the sinusoid)

// Everything the learner does is a verb on the structure they click (actions.js, card.js); the
// only armed gesture left is a shunt waiting for its target.
import { initDebug } from './debug.js';
import { initTopbarMotion } from './topbar-motion.js';
import { ORIGINS } from './blood.js';
import { parseShare, cleanShare } from './share-link.js';
import { deepMerge, sanitizeParams } from '../engine/scenario.js';
import { createPaintGate } from './paint-gate.js';
import { frameFor, cancelFrame, perf as framePerf, framePart, inMotion, mayTask } from './frame.js';
import { restPass } from './rest-pass.js';
import { classSoon, runSoon } from './class-soon.js';
import { sizeOf, watchSize, rectsSoon, restTask } from './geom.js';
import { feedbackDiagnostics } from './feedback-diag.js';
import { startReport, reportLines } from './report.js';
import { noteJump } from './display-state.js';
import { createIdleRest } from './idle-rest.js';
import { pillState, foldPill, stopFold } from './pill-motion.js';
import { readAnims, readBox, readElAt, readMetric, readStyle, scrollInto } from './layout-snap.js';
import './scroll-edges.js';   // (soft fades at the ends of lists that scroll, only where there is more; ?edges=0 off)
import { caught, caughtNow } from './caught.js';
import { setFpsCounter } from './fps-counter.js';
import { setDockTop } from './sheet-layer.js';
const nextFrame = frameFor('main');

// Color lenses: [title, what it shows, legend swatch].
// SMV, IMV, splenic vein, hepatic artery, systemic: as stage.js BLOOD_COLORS.
const ORIGIN_CSS = ['smv', 'imv', 'spleen', 'artery', 'systemic'].map((o) => `var(--origin-${o})`);   // the order of ORIGINS (blood.js)
const LENSES = {
  pressure: ['Pressure', 'Venous pressure in each vessel', () => gradientCss('to right', 30)],
  delta: ['Change', 'Higher or lower than healthy', () => 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))'],
  heat: ['Congestion', 'Where pressure has backed up', () => heatCss('to right')],
  drop: ['Pressure drop', 'Where the resistance lives', () => dropCss('to right')],
  flow: ['Flow volume', 'Width shows how much blood flows', () => flowCss('to right')],
  velocity: ['Velocity', 'Against each vessel\u2019s own normal', () => velocityCss('to right')],
  direction: ['Flow direction', 'Toward the liver or away', () => 'linear-gradient(to right, var(--flow-normal) 50%, var(--flow-reversed) 50%)'],
  oxygen: ['Oxygen', 'How much oxygen the blood carries', () => oxygenCss('to right')],
  origin: ['Blood origin', 'Where each vessel\u2019s blood comes from', () => `linear-gradient(to right, ${ORIGIN_CSS.map((c, i) => `${c} ${i * 20}% ${(i + 1) * 20}%`).join(', ')})`],
};
const COLOR_MODES = { pressure: 'Pressure', delta: 'Change', heat: 'Congestion', drop: 'Pressure drop', flow: 'Flow volume', velocity: 'Velocity', direction: 'Flow direction', oxygen: 'Oxygen', origin: 'Blood origin' };

let stage, inspector, dock, why, timeline, compare, card, chart, mainMenu, idleRest;

// Surfaces most sessions never open (the command palette, the presenter) load
// on first use, so the first paint only waits for the model, the figure and the chart.
function lazy(load, make) {
  let inst = null, pending = null;
  // (The two steps are made once here, not on each ask.)
  const made = (m) => (inst = make(m));
  const failed = (err) => { pending = null; loadFailed(err); throw err; };
  const get = () => (pending ||= load().then(made).catch(failed));   // (a failed load is tried again on the next ask)
  // Fetching the module (without creating the surface) once the app is idle keeps it cached for
  // offline use and makes the first open instant.
  return { get, now: () => inst, warm: () => load().catch(() => {}) };
}
let paletteL, presenterL, dopplerL, fibroL;
const palette = {
  // alloc-rare: the palette is opened by a key or a tap (its promise and handlers), not in a frame
  open: () => paletteL.get().then((p) => p.open()).catch(() => {}),   // (a part that cannot load has said so: loadFailed)
  close: () => paletteL.now()?.close(),
  isOpen: () => !!paletteL.now()?.isOpen(),
};
const presenter = {
  library: () => presenterL.get().then((p) => p.library()),
  libraryNow: () => presenterL.now()?.library() ?? null,
  start: (id, at, opts) => presenterL.get().then((p) => p.start(id, at, opts)),
  position: () => presenterL.now()?.position() ?? null,
  stop: () => presenterL.now()?.stop(),
  go: (i) => presenterL.now()?.go(i),
  busy: () => !!presenterL.now()?.busy(),
  readLink: () => (/#script=/.test(location.hash) ? presenterL.get().then((p) => p.readLink()) : false),
  active: () => !!presenterL.now()?.active(),
  settings: () => presenterL.now()?.settings() ?? null,
  probe: () => presenterL.now()?.probe() ?? null,
  // (For the browser checks: the cards' GPU glass (its drawn() record, scripts/gate-motion.mjs) and a slide's degraded readiness, R05.)
  glass: () => presenterL.now()?.glass?.() ?? null,
  degraded: () => presenterL.now()?.degraded?.() ?? null,
  ink: () => presenterL.now()?.ink?.() ?? null,   // (N2: the pen and spotlight, for the browser checks)
};

async function main() {
  startReport(() => { const st = store.get(), pos = presenter.position(); return pos ? `${pos.id} slide ${pos.at + 1}` : `${st.mode} ${st.lobule ? (st.sinusoid ? 'sinusoid' : 'lobule') : st.view}`; });   // (PR-03: the ring, the reload count and the heartbeat, before anything else can fail)
  const savedTheme = readLS('pps.theme');
  applyTheme(knownLook(savedTheme));   // an unknown saved theme falls back to the device's
  startLMS();
  // The Student role was removed (to come back later): an old saved role is dropped, everyone gets the full app.
  try { localStorage.removeItem('pps.role'); } catch (e) { caught('main:122', e); /* storage unavailable */ }
  // Language selection was removed too (English only, to come back later): drop an old saved choice.
  try { localStorage.removeItem('pps.lang'); } catch (e) { caught('main:124', e); /* storage unavailable */ }
  // The Doppler and the FibroScan load after the first paint (a tab for one that has not come waits for it, dock.js). One left open when the
  // app was last used is asked for now and waited for with the model's first answers, so its pane is whole with the dock.
  const probeTo = (id) => { host.send({ type: 'probe', id }); logAction('probe', id); };
  dopplerL = lazy(() => import('./doppler.js'), ({ createDoppler }) => createDoppler({ onProbe: probeTo }));
  fibroL = lazy(() => import('./fibroscan.js'), ({ createFibroScan }) => createFibroScan());
  const wasOpen = savedInstruments().open;
  const openAtStart = [];
  if (Array.isArray(wasOpen)) for (const [id, l] of [['doppler', dopplerL], ['fibroscan', fibroL]]) if (wasOpen.includes(id)) openAtStart.push(l.get().catch(() => {}));
  const kind = await startHost();
  console.info(`Engine running in ${kind === 'worker' ? 'a Web Worker' : 'the main thread'}.`);
  // (In learner words: no background worker means the model and the drawing share one thread.)
  if (kind === 'main') toast('This browser runs the model and the figure together, so the figure may stutter.');
  app.dataset.engine = kind;
  document.addEventListener('visibilitychange', () => host.send({ type: 'visibility', visible: !document.hidden }));
  host.send({ type: 'visibility', visible: !document.hidden });
  host.send({ type: 'ackPaint', on: true });   // (each model frame is told back as it is taken in: ingestFrame)
  bindParamSender((params, settle) => host.send({ type: 'setParams', params, settle }));

  // Both asked at once: one round trip to the engine before any UI, not two.
  const [healthy, { presets }] = await Promise.all([host.request('healthyProfile'), host.request('presets'), ...openAtStart]);
  store.set({ healthy: { P: healthy.P, Q: healthy.Q, D: healthy.D, metrics: healthy.metrics } });
  store.set({ presetList: presets });

  why = createWhy($('#whyPop'));
  stage = createStage({
    wrap: view,
    onSelect: (sel, opts) => { if (sel && isPhone() && treatOpen()) closeTreat(); select(sel); if (opts?.keyboard) setTimeout(() => card?.focusFirst(), 30); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id, { reveal: 'soft' }),
    onHoverInfo: hoverInfo,
    onViewChange: () => card?.position(),
  });
  setHvpgStage(stage);
  // Idle rest (idle heat, 1 Nov): left alone 30 s in Explore, the blood eases to a stop, the model holds its numbers (its worker
  // stops stepping, as for a hidden page) and the figure stops drawing; the first input brings it all back from that frame.
  // Never while a talk is open, a time-lapse plays or the patient is still changing.
  idleRest = createIdleRest({
    canRest: () => { const st = store.get(), f = st.frame; return st.mode === 'explore' && !presenter.active() && !st.lapse && !!f && !f.lapseDay && !f.morphing && !f.settling && !f.jump; },
    onRest: () => { stage.rest(true); host.send({ type: 'visibility', visible: false }); },
    onWake: () => { host.send({ type: 'visibility', visible: !document.hidden }); stage.rest(false); },
  });
  compare = createCompare();
  timeline = createTimeline({
    root: $('#timeline'),
    onPlay: () => host.send({ type: 'run', running: !store.get().running }),
    onSpeed: (v, lapse) => setSpeed(v, lapse),
    onJump: (d) => host.send(d === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days: d }),
    onRestart: () => restartPatient(),
    scenarioLabel: () => store.get().presetList?.find((x) => x.id === store.get().presetId)?.label || 'Custom',
  });
  chart = createChart({
    onWhy: (m, el) => why.open(m, el), flash: (ids) => stage.flash(ids), onScenarios: () => mainMenu.open('patients'),
    action: doAction, startShunt: (id, o) => stage.startShunt(id, o), select, timeline, pinned: () => compare.section(),
    // (One card at a time: a patient fact's row puts the Treat card away and opens that vessel's or organ's card.)
    reveal: (sel) => { closeTreat(); select(sel); },
  });
  inspector = createInspector($('#inspector'), {
    onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id, { reveal: true }),
    onScenarios: () => mainMenu.open('patients'), onMode: (m) => store.set({ mode: m }), chart,
    // Back from a selection's details: to the pinned comparison if there is one, else the panel closes.
    onBack: () => { if (store.get().compareSnap) store.set({ details: null }); else closePanel(); },
  });
  store.on('details', (d) => {
    const el = $('#panelTitle span'); if (el) el.textContent = d?.type === 'advanced' ? 'Advanced physiology' : d ? 'Details' : 'Compare';
    // A vessel, compartment or organ is the panel's title itself (its name, its kind small above it), so "Details" is
    // left to screen readers there (17 Oct, V9).
    const named = NAMED_DETAILS.includes(d?.type);
    $('#panelTitle')?.classList.toggle('sr-only', named); $('#panel')?.classList.toggle('named', named);
  });
  // The figure's labels the open menu covers are hidden while it is open: one tucked under its edge showed a sliver, the "S" of
  // Sinusoids R between the screen edge and the menu (sweep batches 02 and 04). The labels keep their places.
  // (The steps are made once and share these, not made again for each open: a second open before the first has its boxes drops the
  // first, as its stale token did, and asks again once the first has landed.)
  let underTok = 0, underQueued = 0, underFlight = 0, underAgain = false;
  const underEls = [];   // (the menu, then the labels: rectsSoon copies the list as it is asked, so one kept list serves each ask)
  let underMenu = null;
  const underApply = (rs) => {
    const stale = underFlight !== underTok;
    underFlight = 0;
    if (stale || !underMenu.isConnected || underMenu.classList.contains('out')) { if (underAgain) { underAgain = false; underStep(); } return; }
    underAgain = false;
    const r = rs[0];
    for (let i = 1; i < underEls.length; i++) { const b = rs[i]; if (b.width && b.right > r.left - 8 && b.left < r.right + 8 && b.bottom > r.top - 8 && b.top < r.bottom + 8) classSoon(underEls[i], 'under-menu', true); }
  };
  const underStep = () => {
    underQueued = 0;
    const m = document.querySelector('.umenu:not(.out)');
    if (!m || underWant !== underTok) return;
    if (underFlight) { underAgain = true; return; }
    underMenu = m;
    underEls.length = 0;
    underEls.push(m);
    const lbs = document.getElementById('labels')?.getElementsByClassName('lb');   // (the labels, in page order: the live list of #labels .lb)
    if (lbs) for (let i = 0; i < lbs.length; i++) underEls.push(lbs[i]);
    underFlight = underWant;
    rectsSoon(underEls).then(underApply);
  };
  let underWant = 0;
  function labelsUnderMenu(on) {
    if (!on) underTok++;
    for (const g of document.querySelectorAll('#labels .lb.under-menu')) g.classList.remove('under-menu');
    // (The menu's box and the labels' come from the browser's own next layout, rectsSoon: nothing is laid out to read them.)
    if (!on) return;
    underWant = ++underTok;
    if (!underQueued) underQueued = nextFrame(underStep);
  }
  dock = createDock({ strip: $('#strip'), head: $('#dockHead'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: probeTo, lazy: { doppler: dopplerL, fibroscan: fibroL }, onReveal: revealDock, onLobule: () => zoomLobule('R'),
    onOpen: () => openPanel('instruments'), onClose: () => setPanelTab('chart'), onLayout: () => syncDoppler(), isVisible: () => app.classList.contains('dock-open'),
    marks: () => timeline.entries(), onBeat: () => sendBeat() });
  presenterL = lazy(() => import('./presenter.js'), ({ createPresenter }) => createPresenter({ openSettings, loadPreset, updateParams, host, stage, dock, action: doAction,
    projectorOn: () => toggleProjector(true), projectorOff: () => toggleProjector(false),
    closeHome: () => mainMenu.close(), stashCards, rerenderHome: () => mainMenu.render() }));
  mainMenu = createMenu({
    anchor: $('#btnMenu'), library: presenter.library, libraryNow: presenter.libraryNow,
    onPreset: (id) => openInExplore(id), share, help: (a) => openHelpMenu(a),
    onToggle: (on, sheet) => { closePopover(); app.classList.toggle('menu-sheet-open', on && !!sheet); creditPlacer?.refresh(); labelsUnderMenu(on); },
  });
  paletteL = lazy(() => import('./palette.js'), ({ createPalette }) => createPalette({ ctx: {
    select, action: doAction, probe: (id) => { host.send({ type: 'probe', id }); logAction('probe', id); }, showPane: (id) => dock.show(id, { reveal: true }),
    jump: (d, l) => timeline.jump(d, l), undo: () => timeline.undo(), pin: () => timeline.togglePin(), lenses: Object.fromEntries(Object.entries(LENSES).map(([k, v]) => [k, v])),
    zoomLobule: () => zoomLobule('R'), instruments: () => dock.toggle(),
    loadPreset: async (id) => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); if (await loadPreset(id)) toast(store.get().presetList.find((p) => p.id === id)?.label); },
    home: () => mainMenu.open(), theme: () => toggleTheme(), look: (id) => switchTheme(id), help: () => openHelp(), share, restart: () => restartPatient(), reset: () => resetEverything(),
    library: presenter.library, libraryNow: presenter.libraryNow, present: (id) => presenter.start(id),
  } }));
  card = createCard({
    view, stage, onWhy: (m, el) => why.open(m, el),
    onDetails: (sel) => { store.set({ details: normalizeSel(sel) || sel }); openPanel(); },
    ctx: {
      action: doAction, showPane: (id) => dock.show(id, { reveal: true }), probe: (id) => { host.send({ type: 'probe', id }); logAction('probe', id); },
      startShunt: (id) => stage.startShunt(id), canShunt: (id) => shuntable(id), select,
      zoomLobule: (lobe) => zoomLobule(lobe), paneApi: (id) => dock.pane(id),
      injectDye: (id, o) => stage.injectDye(id, o), releaseDye: () => stage.releaseDye(), dyeInjecting: () => stage.dyeInjecting(),
      canDye: () => !store.get().imaging,
    },
  });

  renderPaintHint();
  buildHud();
  wireTopbar();
  initTopbarMotion();
  wireThumbBar();
  wireFloating();
  // iOS scrolls the whole page to reveal a focused field, which pushes the top bar up under the
  // status bar of an installed app; the page itself never scrolls, so put it back.
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
  wireKeyboard();
  wirePanel();

  host.on('frame', onFrame);
  // alloc-rare: runs only when the worker reports an error (a toast), never in a frame; the host's dispatch reaches every handler by name
  host.on('error', (m) => { console.error(m.message); toast('The model could not do that. If the figure stops moving, reload the page.', 'bad', { actions: [['Reload', () => location.reload()]] }); });
  // The engine stopped (it threw, or its numbers stopped being numbers): one card that stays until it is used or
  // dismissed, instead of a figure that silently freezes.
  let crashCard = null;
  host.on('crash', (m) => {
    console.error(m.message);
    if (crashCard) return;
    // alloc-rare: the engine crashed (once, until Reload or Restart patient), never in a frame
    crashCard = toast('The model stopped. Reload, or restart this patient.', 'bad', { sticky: true, onClose: () => { crashCard = null; },
      // alloc-rare: as above
      actions: [['Restart patient', () => restartPatient()], ['Reload', () => location.reload()]] });
  });

  // The Sinusoid button shows only in the Lobule view: it is one level further down.
  // (Each change of its buttons plays as one move, pillChange: into or out of the sinusoid the bars slide away or back and the
  // pill glides with them; with the lobule the Sinusoid button slides out of the pill or back into it.)
  // (The change is one step made once, reading these: pillChange runs it at once, so they are the ask's own.)
  let viewSinBtn = null, viewSinHide = false, viewInSin = false, viewBtns = null;
  const viewChange = () => { viewSinBtn.hidden = viewSinHide; app.classList.toggle('sin-focus', viewInSin); };
  const syncViewSeg = () => {
    const st = store.get(), cur = st.lobule && st.sinusoid ? 'sinusoid' : st.lobule ? 'lobule' : st.view, inSin = !!(st.lobule && st.sinusoid);
    const sinBtn = $('#viewSeg [data-view="sinusoid"]'), sinHide = !st.lobule || !sinusoidSupported();
    if (app.classList.contains('sin-focus') !== inSin || sinBtn.hidden !== sinHide) {
      viewSinBtn = sinBtn; viewSinHide = sinHide; viewInSin = inSin;
      pillChange(viewChange);
    }
    viewBtns ||= $$('#viewSeg button[data-view]');   // (the view buttons are the page's own, none comes or goes)
    for (let i = 0; i < viewBtns.length; i++) viewBtns[i].setAttribute('aria-pressed', viewBtns[i].dataset.view === cur ? 'true' : 'false');
    // (The highlight leaves from where it is drawn in this same task, with the fold's row just read: seg-glide.js glideNow.)
    glideNow($('#viewSeg'));
    $('#zoomIn').disabled = inSin;
    for (let i = 0; i < ZOOM_TITLES.length; i++) { const z = ZOOM_TITLES[i], t = inSin ? z[2] : z[1]; $(z[0]).title = t; $(z[0]).setAttribute('aria-label', t); }
  };
  store.on('view', (v) => { stage.setView(v); syncViewSeg(); dispatchEvent(new Event('pps:view')); });   // (pps:view: the ?perf readout's view-switch window)
  store.on('lobule', syncViewSeg);
  // Without WebGL2 the Sinusoid button is hidden: say why, once, the first time the Lobule view opens.
  let sinNoted = false;
  store.on('lobule', (on) => { if (on && !sinNoted && !sinusoidSupported()) { sinNoted = true; toast('This device cannot draw the sinusoid view (it needs WebGL2), so that button is hidden.'); } });
  store.on('sinusoid', syncViewSeg);
  store.on('tool', (t) => {
    // (Walked from the end, so taking one off leaves the places of those still to come: the same ones the copied list had.)
    for (let i = view.classList.length - 1; i >= 0; i--) { const c = view.classList[i]; if (c.startsWith('tool-')) view.classList.remove(c); }
    view.classList.add(toolClass(t));
    renderPaintHint();
  });
  store.on('shunting', renderPaintHint);
  store.on('mode', onMode);
  store.on('layers', () => { app.classList.toggle('chips-off', !store.get().layers.chips); syncBloodBtn(); redraw(); });
  // A phone shows a short form of a long name (styles), wrapped to two lines if needed: "Decomp. cirrhosis", not "Decomp…".
  const shortName = (s) => s.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '').replace(/^Decompensated\b/, 'Decomp.').replace(/^Compensated\b/, 'Comp.').replace(/^Clinically significant PH$/, 'CSPH');
  // The compact form, for the narrowest room (a phone held sideways, 84 px): the short form where two lines of it fit, else a
  // shorter name (a soft hyphen breaks Schistosomiasis across the two lines with a hyphen if it must).
  const COMPACT = { 'Acute portal vein thrombosis': 'Acute PVT', 'Schistosomiasis / NCPH': 'Schisto\u00ADsomiasis', 'Cirrhosis with gastrorenal shunt': 'Gastrorenal shunt', 'Sinusoidal obstruction syndrome': 'SOS' };
  // (A name is one of the presets' labels or "Custom", so each one's forms are made once here, not when the name changes.)
  const nameOf = new Map(), shortOf = new Map();
  for (const p of presets) if (!nameOf.has(p.id)) nameOf.set(p.id, p.label || 'Custom');
  for (const n of [...nameOf.values(), 'Custom']) if (!shortOf.has(n)) shortOf.set(n, shortName(n));
  // (The fill is made once and reads the name asked last, as the swap keeps only the last fill it is given.)
  let scName = '', scShort = '';
  const scFill = () => {
    const el = $('#scenarioName');
    el.replaceChildren(h('span', SN_L, scName), h('span', SN_S, scShort), h('span', SN_C, COMPACT[scShort] ?? scShort));
    fitScenarioName();
  };
  const syncScenarioName = () => {
    const st = store.get(), name = nameOf.get(st.presetId) || 'Custom', short = shortOf.get(name);
    // The new name crossfades in (it swapped in one frame, P8); the pill glides to its width as it lands (topbar-motion.js).
    const el = $('#scenarioName');
    if (el.querySelector('.sn-l')?.textContent === name) return;
    scName = name; scShort = short;
    swapFade(el, scFill);
  };
  store.on('presetId', syncScenarioName);
  store.on('mode', syncScenarioName);
  for (const k of ['compareSnap', 'compareView']) store.on(k, () => { renderLegend(); renderBanner(); redraw(); });
  // (The views (Imaging, a finding, the lobule and its sinusoid) change only which key the legend shows, never the Compare banner, and the lobule's
  // and the sinusoid's are set inside the dive's own frames: the key is built again between frames (rest-pass.js), and only when it is another
  // key; the banner is left alone. Before, each set rebuilt the legend and the banner in the frame the zoom landed in.)
  let legendAsk = 0;
  const legendLater = () => { legendAsk = 0; const lm = legendModel(); if (!legendSame(lm.m, lm.ref)) renderLegend(); };
  for (const k of ['imaging', 'found', 'sinusoid', 'lobule']) store.on(k, () => { legendAsk ||= restPass(legendLater); redraw(); });
  // A lens switch: the key and the lens name move in the key press's own frame, and the figure's full update follows one frame later
  // (it set off with them on the same clock, D_SURFACE, so they still finish together within a frame) rather than holding that first
  // frame (lens key 250 to 270 ms to the first change on CI's profiles). A model frame in between draws it anyway.
  let lensRedraw = 0;
  // (Named steps, one per line: the off-GPU scan reads a callback by its line.)
  const lensRedrawStep = () => { lensRedraw = 0; redraw(); };
  const lensRedrawLater = () => { lensRedraw = nextFrame(lensRedrawStep); };
  store.on('colorMode', () => { renderLegend(); renderBanner(); if (!lensRedraw) lensRedraw = nextFrame(lensRedrawLater); });
  store.on('compareSnap', () => { if (!store.get().details) inspector.render(); });
  // (Only on a new value: a slide change sets focus and selection to null each time, and a full figure update for a value that
  // stayed the same cost a frame's worth of script in the tap.)
  for (const k of ['focus', 'labelLevel', 'selection']) { let was = store.get()[k]; store.on(k, (v) => { if (v === was) return; was = v; redraw(); }); }

  // Console handle for educators preparing a class (and for automated screenshots).
  window.pps = { resumeUrl, loadPreset, store, updateParams, setTool, dock, details: (sel) => { store.set({ details: sel }); openPanel(); }, stage, host, card, timeline, menu: mainMenu, palette, presenter, get perf() { return framePerf(); }, motionBudget, budget: gpuBudget, get credit() { return creditPlacer; }, caught: caughtNow };   // (caught: the app's counted errors; the assignment above had replaced the one caught.js puts on window.pps, so no device report could read them)
  const linked = await presenter.readLink();
  if (linked) mainMenu.open('scripts', { mark: typeof linked === 'string' ? linked : null });
  const shared = readShare(), back = new URLSearchParams(location.search).has('back');
  if (shared) await loadShared(shared, { quiet: back });
  else {
    timeline.reset();
    // (A #s= link the app cannot read, cut short or altered in a message: it opens on the default patient and says so, not in silence.)
    if (/#s=/.test(location.hash) && !back) toast('This shared link could not be read, so the healthy patient opened.', 'bad');
  }
  inspector.render();
  const deep = await openDeepLink();
  if (!deep) firstRun();
  armFeedbackAsk();
  // The default patient starts without loadPreset, so record what it came with: Treat > Changes then lists its
  // settings under About this patient, not as changes nobody made, and Clear all keeps them (review #18).
  if (!shared && !store.get().presetParams) store.set({ presetParams: { id: store.get().presetId, params: structuredClone(store.get().params) } });
  if (back) { const u = new URL(location.href); for (const k of ['back', 'script', 'slide']) u.searchParams.delete(k); u.hash = ''; history.replaceState(null, '', u.pathname + u.search); }   // (a later plain reload starts fresh)
  // Startup has decided who the patient is (a deep link, a shared link, or the default one): the figure may frame itself.
  store.set({ booted: true });
  // B6: a share link pasted into this open tab (the address changes, the page does not reload) is applied as at start.
  let lastShareHash = shared ? location.hash : '';
  window.addEventListener('hashchange', () => {
    if (!/#s=/.test(location.hash) || location.hash === lastShareHash) return;
    lastShareHash = location.hash;
    const next = readShare();
    if (!next) { toast('This shared link could not be read.', 'bad'); return; }
    if (store.get().mode !== 'explore') store.set({ mode: 'explore' });
    loadShared(next);
  });
  // Offline support registers once the figure is up and the page has been left alone a moment, so its install (every file of the app,
  // fetched at once) does not compete with the modules still loading, nor with the first touches. The fonts' other subsets come later
  // still (the worker is asked once it is active, build.mjs 'pps:fill').
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // A new version takes over this tab's files while it is open (the worker claims its pages). The page keeps running the files it began with, and
    // an older tab can no longer fetch the part it has not opened yet (the first talk), so, once, it is offered a reload: not in a talk, and never
    // by itself. (The first install, with no worker before it, is not an update.)
    if (navigator.serviceWorker.controller) {
      let offered = false;
      // (A page opened after a deploy is already on the new files, as the page itself is fetched fresh, and the worker that follows takes over this
      // tab too: that is no update for it. The new worker lists its files; if every hashed file this page loaded is among them, nothing is offered.)
      const holdsMine = (sw) => new Promise((res) => {
        const mine = [...document.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')].map((n) => n.getAttribute('src') || n.getAttribute('href')).filter((u) => /^assets\//.test(u));
        const ch = new MessageChannel(), t = setTimeout(() => res(false), 2000);
        ch.port1.onmessage = (e) => { clearTimeout(t); res(Array.isArray(e.data) && mine.length > 0 && mine.every((u) => e.data.includes(u))); };
        try { sw.postMessage('pps:files', [ch.port2]); } catch { clearTimeout(t); res(false); }
      });
      navigator.serviceWorker.addEventListener('controllerchange', async () => {
        if (offered) return;
        const sw = navigator.serviceWorker.controller;
        if (sw && await holdsMine(sw)) return;
        if (offered) return;
        offered = true;
        const offer = () => { if (presenter.active()) { setTimeout(offer, 30000); return; } toast('A new version of the simulator is ready.', '', { actions: [['Reload', () => location.reload()]] }); };
        offer();
      });
    }
    const reg = () => whenQuiet(() => (window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(() => navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready).then((r) => whenQuiet(() => r.active?.postMessage('pps:fill'), 2000, 1000))
      .catch(() => { /* offline support is optional */ })));
    // (The source site, `npm start`, loads src/ui/main.js and has no worker of its own: the build writes dist/sw.js, so only a built page registers one.)
    const built = !document.querySelector('script[type=module][src^="src/"]');
    if (built) { if (window.ppsFigureReady) reg(); else addEventListener('pps:figure-ready', reg, { once: true }); }
  }
  performance.mark?.('pps:booted');   // (P3: the first figure frame and the first input accepted are read from these marks and the browser's own first-input entry)
  // The surfaces most sessions never open are fetched and read in once the page is idle, one at a time, each only after the page has been
  // left alone for a moment (quiet.js): a module's read-in is tens of ms of script on a phone, and a timer alone put it in a pan or pinch.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  const warmUp = [() => paletteL.warm(), () => presenterL.warm(), () => dock.load()];   // (dock.load reads in the Doppler and FibroScan panes too)
  const warmNext = () => { const step = warmUp.shift(); if (step) whenQuiet(() => idle(() => { step(); warmNext(); })); };
  setTimeout(warmNext, 3000);
  // While the loading cover is still up, the same modules are read in under it (the cover waits for them), not in the first seconds of use.
  const warmUnder = () => { if (!booting()) return; while (warmUp.length) holdCover(Promise.resolve().then(warmUp.shift()).catch(() => {})); };
  if (window.ppsFigureReady) warmUnder(); else addEventListener('pps:figure-ready', warmUnder, { once: true });
}
// Deep links, for an LMS or a syllabus: ?script=<id> (&slide=<n>), ?preset=<id>,
// ?home=explore|present (the menu, open at Patients or Present). They open straight into that activity.
async function openDeepLink() {
  const q = new URLSearchParams(location.search);
  // (data-pz-opening: the deck is on its way; the corner credit waits for it rather than settle on the plain figure first.)
  if (q.get('script')) { const de = document.documentElement; de.dataset.pzOpening = ''; presenter.start(q.get('script'), Math.max(0, (parseInt(q.get('slide'), 10) || 1) - 1)).catch(() => {}).finally(() => delete de.dataset.pzOpening); return true; }
  if (q.get('preset')) {
    const id = q.get('preset'), list = store.get().presetList || [];
    if (list.some((p) => p.id === id)) { await loadPreset(id); return true; }
    // A mistyped link never opens a different patient: it says so and opens Patients, searching for the link's first word.
    toast(`No patient called “${id.slice(0, 60)}”. Pick one from Patients.`, 'bad');
    mainMenu.open('patients', { query: id.split(/[-_\s]/).find(Boolean)?.slice(0, 40) || '' });
    return true;
  }
  if (q.get('home')) { mainMenu.open(q.get('home') === 'present' ? 'present' : 'patients'); return true; }
  return false;
}
const redraw = () => { const f = store.get().frame; if (f) stage.update(viewFrame(f)); };

// ── Frames ──────────────────────────────────────────
let lastClockTxt = '';
// Ascites has one home, the Ascites instrument: selecting the abdomen (the fluid on the figure, a
// station, the command palette) opens it instead of a card that would sit over the vessels.
function select(sel) {
  const n = normalizeSel(sel);
  if (n?.type === 'organ' && n.id === 'abdomen') { store.set({ selection: null }); dock.show('abdomen', { reveal: true }); return; }
  store.set({ selection: sel });
}

function viewFrame(f) {
  const st = store.get();
  if (st.compareSnap && st.compareView === 'A') return st.compareSnap.frame;
  return f;
}
// The engine ticks ~30×/s, but pressures ease over seconds, so the anatomy, readouts and panel
// are repainted at most ~10×/s (the chevrons animate separately). Repainting the whole SVG plate
// on every tick kept the main thread busy and the laptop warm for no visible gain.
let lastDesc = 0;
// The Doppler's vessel glows on the figure while the Doppler instrument is open.
function syncDoppler(f = store.get().frame) { stage?.setDoppler(f && dock?.isOpen('doppler') ? f.probe : null); syncScanProbe(); }
// The FibroScan probe and its shear wave show on the figure while the FibroScan card is open in Explore; the Presenter drives its own.
let scanOwned = false;
function syncScanProbe() {
  const want = store.get().mode === 'explore' && !!dock?.isOpen('fibroscan');
  if (store.get().mode !== 'explore') { scanOwned = false; return; }
  if (want !== scanOwned) { scanOwned = want; stage?.setScanProbe(want); }
}
// Every snapshot is taken in at once (params, events, monitor samples); only the newest waiting one is painted, next frame (paint-gate.js).
const frameGate = createPaintGate({ ingest: ingestFrame, paint: paintFrame, ask: (cb) => frameFor('frame')(cb), cancel: cancelFrame });
function onFrame(f) { frameGate.push(f); }
// (A snapshot that says the model jumped, a reset, a patient, an intervention or a clock change, is never blended into the one before
// it: the shown numbers and traces take the next values at once, display-state.js noteJump. Taken even from a snapshot not painted.)
let jumpSeen = false;
function ingestFrame(f) {
  if (f.jump) jumpSeen = true;
  if (f.params) replaceParams(f.params);
  if (f.events?.length) { const hid = store.get().hiddenEvents; const ev = hid ? f.events.filter((e) => !hid.has(e.id) && !(hid.has('COLL_*') && e.id.startsWith('COLL_'))) : f.events; if (ev.length) timeline.addEvents(ev); }
  dock?.ingest(f);   // every frame's samples, even one that is not painted
  // (Rev 2 step 3: the worker is told a frame is taken in as it is ingested, in the scheduler's frame, not once it is painted: a page that
  // paints late no longer holds the model's next frame back, and the gate paints only the newest anyway.)
  host?.send({ type: 'painted' });
}
// R17: frames for a hidden consumer are kept, not fanned out to it; it takes the newest one the moment it shows.
let inspStale = null, inspSeen = null, cmpStale = null;
function inspectorSeen() {
  if (inspStale && panelShown()) { const f = inspStale; inspStale = null; inspector?.update(f); }
  // (R11, review pass 2: the Compare table sits in the same panel: its rows are not formatted while the panel is shut either.)
  if (cmpStale && panelShown()) { const f = cmpStale; cmpStale = null; compare?.update(f); }
}
function watchInspectorSeen() {
  if (inspSeen || typeof MutationObserver !== 'function') return;
  // (the panel shows by a class on the app: opened, or an instrument's focus let go; one record per class change, no layout read)
  inspSeen = new MutationObserver(inspectorSeen);
  inspSeen.observe(app, { attributes: true, attributeFilter: ['class'] });
}
// (Plan §3.2: the worker builds its next clock frame only once this one is taken in (worker-core.js ackPaint; ingestFrame, rev 2 step 3).)
let frameNext = null;
const storeFrame = () => { const f = frameNext; frameNext = null; store.setFrame(f); };
function paintFrame(f) {
  watchInspectorSeen();
  const now = performance.now();
  if (jumpSeen) { jumpSeen = false; noteJump(); }
  // running and clock only when they change: their listeners (the endoscopy redraw among them) need not re-run every frame.
  const st0 = store.get();
  // (Each a named piece of the frame while frames are watched, framePart: the gate's long frames say which one took the time.)
  // (A frame that changes nothing else is set alone, store.setFrame: no patch, key list or closures made for it, rev 2 step 3.)
  if (st0.running === f.running && st0.clock === f.clock && !(f.clock === 'hemo' && st0.lapse)) { frameNext = f; framePart('store listeners', storeFrame); }
  else framePart('store listeners', () => store.set({ frame: f, ...(st0.running !== f.running ? { running: f.running } : {}), ...(st0.clock !== f.clock ? { clock: f.clock } : {}), ...(f.clock === 'hemo' && st0.lapse ? { lapse: 0, speed: f.speed } : {}) }));
  framePart('figure update', () => stage.update(viewFrame(f)));
  // (Plan "Holding 120 Hz, always" §3.2: the figure takes the model frame in the frame it lands (the blood reads it); everything else
  // that shows it, the cards, the dock, the panel, the timeline, the clock, is a may task of its own (frame.js mayTask), each run after
  // the frame's must work while the budget allows, at most four frames later, and each painting the newest frame it has. A model frame
  // no longer lands as one long frame.)
  for (const [tag, fn] of PAINT_PARTS) mayTask(tag, () => fn(f, now));
}
// (Each part paints the frame it was given: the newest, since asking again replaces the task.)
const PAINT_PARTS = [
  ['card update', (f) => card.update(f)],
  ['dock update', (f) => { dock.update(f); syncDoppler(f); }],
  ['inspector update', (f) => {
    // (R17: the side panel's readings are not worked out or written while the panel is shut or under an instrument; the frame is kept,
    // and painted the moment the panel shows (see inspectorSeen).)
    if (panelShown()) { inspStale = null; inspector.update(f); }
    else inspStale = f;
    // (R11: the Compare table (in the side panel) formats its eleven rows and their signature only while the panel shows; else the
    // newest frame is kept and painted as it opens, with the inspector's.)
    if (panelShown()) { cmpStale = null; compare.update(f); }
    else if (store.get().compareSnap) cmpStale = f;
  }],
  ['timeline update', (f) => timeline.update(f)],
  ['frame chrome', (f, now) => paintChrome(f, now)],
];
function paintChrome(f, now) {
  const txt = f.day > 0 ? `Day ${f.day}` : `${fmt(f.t, 0)} s`;
  if (txt !== lastClockTxt) { lastClockTxt = txt; stageClock.textContent = txt; }
  if (tipInfo) hoverInfo(tipInfo);   // the readings popup stays live with the sim
  syncBleeding(f);
  if (projector) updateProjector(f);
  // (R11: the screen reader's description of the figure is kept, at most every 3 s, but never written in a frame of a transition (a
  // slide's cards moving, a dive): it waits for the first still frame.)
  if (now - lastDesc > 3000 && !inMotion()) { lastDesc = now; $('#stage').setAttribute('aria-description', caption(f)); }
}

// ── Scenarios & share ───────────────────────────────
// The corner credit stays on the figure while the menu's popover is open: src/ui/credit.js finds it a spot clear of the
// panel (fading out, jumping and fading back in), or fades it out when no figure is left.
let creditPlacer = null;
// The menu's patient rows: switch to Explore and load the patient (also used by "Open this patient in Explore").
async function openInExplore(id) {
  if (store.get().mode !== 'explore') store.set({ mode: 'explore' });
  await loadPreset(id);
}
let presetGen = 0;
async function loadPreset(id, opts = {}) {
  const gen = ++presetGen;
  // (A new patient wakes a resting page, whoever asked for it (a menu, a link, the checks' window.pps): its model must step to
  // arrive, and a page left resting held the old patient's numbers with the new one's name.)
  idleRest?.poke();
  store.set({ presetLoading: true });   // the figure frames itself once the patient has arrived (stage.js)
  dock?.clearTraces();   // the Over time and Doppler traces start over with the new (or restarted) patient
  let res;
  try { res = await host.request('preset', { id, days: opts.days }); }
  catch { if (gen === presetGen) store.set({ presetLoading: false }); return false; }   // (the engine stopped: its crash card says so; the figure is not left waiting for a patient)
  // Patients tapped in quick succession: the engine loads them in order, so only the last one's answer is applied.
  if (gen !== presetGen) return false;
  // The traces start from the steady state the patient opens on: its last seconds are made beside the first live ones (backfill.js).
  host.request('history', { secs: 12 }).then((m) => { if (gen === presetGen && m?.samples) dock?.backfillTraces({ ...m.samples, probe: m.probe }); }).catch(() => { /* the traces fill as they record */ });
  replaceParams(res.params);
  store.set({ presetParams: { id, params: structuredClone(res.params) } });   // what the patient came with (chart.js: About this patient)
  clearHistory();
  store.set({ presetLoading: false, presetId: id, lastHVPG: null, hvpgMeasured: false, selection: store.get().selection, historyTick: (store.get().historyTick || 0) + 1 });
  timeline?.reset(store.get().presetList?.find((x) => x.id === id)?.label);
  return true;   // (B1: true only when this load's answer was the one applied; a replaced or failed load answers false)
}

function encodeShare(extra) {
  const st = store.get();
  const payload = { v: 1, preset: st.presetId, params: st.params, view: st.view, ...extra };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// (Read through share-link.js: prototype keys dropped, and only a known patient, view, selection and a finite camera kept.)
function readShare() {
  const m = location.hash.match(/#s=([\w-]+)/);
  return m ? cleanShare(parseShare(m[1]), store.get().presetList?.map((p) => p.id)) : null;
}
async function loadShared(s, { quiet = false } = {}) {
  // B1: a load that was replaced (another patient tapped meanwhile) or failed must not take this link's settings.
  if (!(await loadPreset(s.preset))) return false;
  let clamped = false;
  const missing = s.missing && `This link names a patient the app does not have (“${s.missing}”), so its settings opened on the healthy patient.`;
  if (s.params) {
    const merged = deepMerge(store.get().params, s.params), clean = sanitizeParams(merged);
    updateParams(() => clean, { settle: true, history: false });
    if (JSON.stringify(clean) !== JSON.stringify(merged)) { timeline.flush(); clamped = true; }   // (the view, selection and camera of the link still apply)
  }
  if (s.view) store.set({ view: s.view });
  if (s.sel) store.set({ selection: s.sel });
  if (s.cam && !store.get().lobule) stage.setCamera(s.cam, 0);
  timeline.flush();
  if (clamped) toast(missing || 'This link had values out of range; they were set to the nearest allowed values.', missing ? 'bad' : undefined);
  else if (missing) toast(missing, 'bad');
  else if (!quiet) toast('Loaded the shared scenario.');
  return true;
}
// The orange PREVIEW pill reloads onto the newest build and calls this first: a URL for the same place. In Present, the same
// presentation and slide (?script=&slide=); in Patients, the same patient, settings, view, camera and selection (#s=).
// "back" tells the next load to land there quietly: no case card, no "shared scenario" toast.
function resumeUrl() {
  const u = new URL(location.href), pos = presenter.position();
  for (const k of ['script', 'slide', 'preset', 'home']) u.searchParams.delete(k);
  u.searchParams.set('back', '1');
  if (pos) { u.searchParams.set('script', pos.id); u.searchParams.set('slide', String(pos.at + 1)); u.hash = ''; }
  else { const st = store.get(); u.hash = `#s=${encodeShare({ sel: st.selection || undefined, cam: st.lobule ? undefined : stage.cameraState() })}`; }
  return u.href;
}
async function share() {
  // On the hosted site a built-in patient's link goes through its share page (c/<id>.html, written at deploy
  // by scripts/share-pages.mjs), so iMessage or Slack previews show the patient's name.
  const id = store.get().presetId, page = location.hostname.endsWith('github.io') && store.get().presetList?.some((p) => p.id === id);
  const url = `${page ? new URL(`c/${id}.html`, location.href).href : location.origin + location.pathname}#s=${encodeShare()}`;
  try { await navigator.clipboard.writeText(url); toast('Link to this exact scenario copied.'); } catch { history.replaceState(null, '', location.pathname + location.search + `#s=${encodeShare()}`); toast('Link placed in the address bar.'); }   // (the page's own path: a share page's /c/ path would make every later link /c/c/…)
}

// ── Restart & reset ─────────────────────────────────
// Restart: the current patient from its first moment .
// Reset: everything back to a fresh start, as on a first visit but keeping the preferences
// (theme, progress): the page reloads without its links or state.
async function restartPatient() {
  closePopover();
  store.set({ compareSnap: null, compareView: 'B', selection: null, details: null });
  if (stage.isShunting()) stage.cancelShunt();
  setTool('select');
  const id = store.get().presetId || 'healthy';
  if (hostFailed()) {
    // The worker stopped for good: a new engine first (a fresh worker, or the main thread), told again what the old one knew.
    try { await restartHost(); } catch { toast('The model could not restart. Reload the page.', 'bad', { actions: [['Reload', () => location.reload()]] }); return; }
    host.send({ type: 'ackPaint', on: true });
    host.send({ type: 'visibility', visible: !document.hidden });
    const s = store.get();
    host.send(s.lapse ? { type: 'run', speed: s.lapse, clock: 'disease' } : { type: 'run', speed: s.speed, clock: 'hemo' });
    if (s.running === false) host.send({ type: 'run', running: false });
    if (s.frame?.probe) host.send({ type: 'probe', id: s.frame.probe });   // B3: the Doppler reads the vessel the page shows as picked
  }
  if (!(await loadPreset(id))) return;   // (B2: no "Restarted" for a load that was replaced or failed)
  toast(`Restarted: ${store.get().presetList?.find((p) => p.id === id)?.label || 'patient'}.`);
}
function resetEverything() {
  closePopover();
  // (A question, so a small dialog: Cancel has the focus, and the warning button says what it does.)
  openModal('Reset everything?', h('div', {},
    h('p', {}, 'This clears the timeline, comparisons and every change, and reloads the simulator with a healthy patient. Your preferences are kept.'),
    h('div', { class: 'btn-row end' },
      h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'),
      h('button', { class: 'btn danger-fill', onclick: () => { try { sessionStorage.clear(); } catch (e) { caught('main:618', e); /* storage unavailable */ } location.replace(location.pathname); } }, 'Reset and reload'))), { sub: null, compact: true });
}

// ── Actions ─────────────────────────────────────────
function doAction(a) {
  if (a.kind === 'probe') { host.send({ type: 'probe', id: a.id }); return; }
  if (a.kind === 'paracentesisPrompt') { dock.show('abdomen', { reveal: true }); toast('Choose the volume in Ascites & paracentesis, then Drain.'); return; }
  if (a.kind === 'band') {
    const fr = store.get().frame;
    if (fr?.metrics && !varicesPresent(fr, 'VAR')) { toast('No varices to band.'); return; }
  }
  host.send({ type: 'action', action: a });
  logAction('action', a.kind);
  const tl = { infuse: { crystalloid: '1 L crystalloid', prbc: '1 unit PRBC', albumin: 'Albumin infusion' }, hemorrhage: `Hemorrhage ${a.mL} mL`, band: 'Band ligation', valsalva: 'Valsalva', rupture: 'Varix ruptured (manual)', stopBleed: 'Bleeding stopped',
    paracentesis: `Paracentesis ${((a.mL || 0) / 1000).toFixed(1)} L${a.albumin ? ' + albumin' : ''}` }[a.kind];
  const tlLabel = typeof tl === 'object' ? tl[a.fluid] : tl;
  if (tlLabel) timeline.recordAction(tlLabel);
  const msgs = { infuse: { crystalloid: '1 L crystalloid running (≈25% stays intravascular).', prbc: '1 unit of packed red cells running.', albumin: 'Albumin given: plasma oncotic pressure rises.' },
    valsalva: 'Valsalva: intrathoracic and abdominal pressure up for 10 s.' };
  const m = typeof msgs[a.kind] === 'object' ? msgs[a.kind][a.fluid] : msgs[a.kind];
  if (a.kind === 'paracentesis') toast(`Paracentesis: up to ${(a.mL / 1000).toFixed(1)} L drained${a.albumin ? ' with albumin' : ' without albumin'}.`);
  else if (m) toast(m);
}

// ── Armed gestures ─────
const TOOL_SELECT = { tool: 'select' };   // (store.set reads a patch and keeps none of it)
function setTool() { store.set(TOOL_SELECT); }
// The shunt hint, one target per line with the vein to pick in bold; "Tap" on touch, and Esc only where there is a keyboard.
// (Its lines are made here and set into the card by renderPaintHint, which knows how many there are: 1 for the TIPS, else 4 or 5.)
const SHUNT_ONLY = [null];   // (the TIPS's one line)
const SHUNT_LINES = [null, null, null, null, null];
function shuntHint(only, fine) {
  if (only === 'tips') { SHUNT_ONLY[0] = h('div', NOATTR, fine ? 'Click the ' : 'Tap the ', h('b', NOATTR, 'hepatic vein'), ' where the stent should end. Glowing vessels are valid targets.'); return SHUNT_ONLY; }
  SHUNT_LINES[0] = h('div', NOATTR, fine ? 'Click a glowing vein to connect it to.' : 'Tap a glowing vein to connect it to.');
  SHUNT_LINES[1] = h('div', NOATTR, 'A portal branch to a ', h('b', NOATTR, 'hepatic vein'), ' makes a TIPS.');
  SHUNT_LINES[2] = h('div', NOATTR, 'A portal branch to the ', h('b', NOATTR, 'IVC'), ' below the hepatic veins makes a DIPS.');
  SHUNT_LINES[3] = h('div', NOATTR, 'The splenic vein to the ', h('b', NOATTR, 'left renal vein'), ' makes a Warren shunt.');
  SHUNT_LINES[4] = fine ? h('div', NOATTR, 'Esc cancels.') : null;
  return SHUNT_LINES;
}
const cancelShunt = () => stage.cancelShunt();
const TC_TITLE = { class: 'tc-title' }, TC_SP = { class: 'tc-sp' }, BTN_SM = { class: 'btn sm' };
// The hint fades out where it stands: afterExit's step, made once (the card is the one element).
const hintGone = () => { const el = $('#toolHint'); el.hidden = true; el.classList.remove('leaving'); };
// The hint card for an armed gesture: a shunt waiting for its target.
function renderPaintHint() {
  const el = $('#toolHint');
  const st = store.get();
  if (st.shunting) {
    const only = st.shunting.only;
    clearTimeout(hintT); el.classList.remove('leaving');
    el.hidden = false;
    const cancel = h('button', BTN_SM, 'Cancel'); cancel.addEventListener('click', cancelShunt);
    const title = h('div', TC_TITLE, icon('stent'), only === 'tips' ? 'Place the TIPS' : 'Make a shunt', h('span', TC_SP), cancel);
    const lines = shuntHint(only, matchMedia('(hover: hover) and (pointer: fine)').matches);
    if (lines === SHUNT_ONLY) el.replaceChildren(title, lines[0]);
    else if (lines[4]) el.replaceChildren(title, lines[0], lines[1], lines[2], lines[3], lines[4]);
    else el.replaceChildren(title, lines[0], lines[1], lines[2], lines[3]);
    redraw();
    return;
  }
  // (It fades out where it stands, as it came in, rather than vanishing: P20.)
  if (!el.hidden && !el.classList.contains('leaving')) { el.classList.add('leaving'); hintT = afterExit(el, 'leaving', hintGone); }
  redraw();
}
let hintT = 0;
// The Lobule view: a view of its own beside Anatomy and Circuit.
function zoomLobule() { store.set({ lobule: true, sinusoid: false }); }

// ── Figure header: view, color, legend; banners ─────
let tipEl, stageClock;
function buildHud() {
  // Moving blood: chevrons are remembered per device.
  let saved = null;
  // (pps.blood2: chevrons became the default, so a choice saved under the old default starts over.)
  try { saved = JSON.parse(localStorage.getItem('pps.blood2') || 'null'); } catch (e) { caught('main:684', e); /* storage unavailable */ }
  const blood = { look: 'shimmer', phasic: false, chevrons: true, ...(saved && typeof saved === 'object' ? saved : {}) };
  delete blood.origin;   // now the Blood origin lens
  blood.look = 'shimmer'; blood.phasic = false;   // the Blood menu offers streaks and chevrons only
  store.set({ blood });
  store.on('blood', (v) => {
    try { localStorage.setItem('pps.blood2', JSON.stringify(v)); } catch (e) { caught('main:690', e); /* storage unavailable */ }   // alloc-rare: the saved choice is written when the Blood menu changes it, never per frame
    sendBeat(); syncBloodBtn();
    redraw();
  });
  // A chip that opens a menu says so: aria-expanded from the start (popover() keeps it), which app.css turns into a turned chevron and a held tint.
  document.documentElement.classList.add('chip-open'); for (const id of ['btnBlood', 'btnLobuleLayers', 'btnLayers']) $('#' + id).setAttribute('aria-expanded', 'false');
  // Press and hover on every other control eases and answers a finger (app.css, html.press-fx).
  document.documentElement.classList.add('press-fx');
  document.documentElement.classList.add('model-contain');
  $('#btnBlood').onclick = (e) => openBlood(e.currentTarget);
  $('#btnLobuleLayers').onclick = (e) => openLobuleLayers(e.currentTarget);
  store.on('lobule', (on) => { $('#btnLobuleLayers').hidden = !on; if (!on) closePopover(); });
  syncBloodBtn();
  renderLegend();
  enhanceRanges();
  tipEl = h('div', { class: 'hover-tip', 'aria-hidden': 'true' });
  watchSize(tipEl, () => { if (tipInfo && tipEl.classList.contains('on')) hoverInfo(tipInfo); });
  view.append(tipEl);
  watchSize(view);
  stageClock = h('div', { class: 'stage-clock', 'aria-hidden': 'true' });
  view.append(stageClock);
  $('#zoomFit').onclick = () => stage.fit();
  $('#zoomIn').onclick = () => stage.zoomIn();
  $('#zoomOut').onclick = () => stage.zoomOut();
  const rotateBtn = $('#rotateCircuit');
  const syncRotate = () => rotateBtn.setAttribute('aria-pressed', String(stage.circuitRotated()));
  rotateBtn.onclick = () => { stage.setCircuitRotated(!stage.circuitRotated()); syncRotate(); };
  syncRotate();
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => (b.dataset.view === 'lobule' ? zoomLobule() : b.dataset.view === 'sinusoid' ? (store.get().lobule ? store.set({ sinusoid: true }) : stage.diveToSinusoid()) : b.dataset.view === 'anatomic' && store.get().sinusoid ? stage.exitSinusoid() : store.set({ lobule: false, view: b.dataset.view }))));
  // The legend is the lens switcher: it shows what the colors mean and changes what they show.
  const sinLens = () => store.get().lobule && store.get().sinusoid;   // no lens in the sinusoid view
  $('#btnLayers').addEventListener('click', (e) => { if (!sinLens()) openLayers(e.currentTarget); });
  $('#btnLayers').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !sinLens()) { e.preventDefault(); e.stopPropagation(); openLayers(e.currentTarget); } });
  new ResizeObserver(() => stage.relayout()).observe(view);
}
// (The model is one kept object, written in place: its readers take what they need at once and keep none of it.)
const LEGEND = { m: 'pressure', ref: 'healthy', imaging: false };
function legendModel() {
  const st = store.get();
  const imaging = st.imaging;
  const cmp = !!st.compareSnap;
  // The sinusoid view shows pressure only (it has no lens).
  LEGEND.m = imaging ? 'neutral' : st.lobule && st.sinusoid ? 'pressure' : cmp && st.compareView === 'D' ? 'delta' : st.colorMode;
  LEGEND.ref = cmp ? st.compareSnap.when : 'healthy';
  LEGEND.imaging = imaging;
  return LEGEND;
}
// A new lens or reference moves the key and the lens name on the figure's own 420 ms clock rather than swapping them in one frame
// (motion review P11, premium-feel R12): the name crossfades, a bar mixes its colours in OKLab and slides its numbers, legend-morph.js.
// The same key built again simply replaces itself.
// (The key names only what the legend shows: the lens, and the reference only in the Congestion and Change keys. It is kept as the
// two, compared, not as one string built from them.)
let legendM = null, legendRef = null;
const legendSame = (m, ref) => m === legendM && (!(m === 'heat' || m === 'delta') || ref === legendRef);
// The pieces of a key that never change are made once, here at load: attribute sets that h() only reads (so every build shares them),
// and each scale's ticks and numbers with their places as styles. A build then makes only the nodes.
const NOT_INSTANT = { instant: false };
const LG_TITLE = { class: 'lg-title' }, LG_CAP = { class: 'lg-cap', 'aria-hidden': 'true' }, LG_CATS = { class: 'lg-cats' }, LG_DOTS = { class: 'lg-cats lg-dots' }, LG_NOTE = { class: 'lg-note' };
const LG_BAR_STYLE = { background: '' }, LG_BAR = { class: 'lg-bar', style: LG_BAR_STYLE };   // (the bar's colours are written into the one style before each build)
const LG_DOT = { normal: { style: { background: 'var(--flow-normal)' } }, reversed: { style: { background: 'var(--flow-reversed)' } }, portal: { style: { background: 'var(--vein-portal)' } }, systemic: { style: { background: 'var(--vein-systemic)' } } };
const LG_ORIGIN_ORDER = [0, 1, 2, 4, 3];
const LG_ORIGIN = ORIGINS.map((o, i) => ({ span: { title: o[3] }, dot: { style: { background: ORIGIN_CSS[i] } }, name: o[2] }));
// (Every number is centred on its tick; the scale stands in from its neighbours by half its end numbers' width (ch: a digit,
// the scale's own font being the numbers'), so the first and last are never pulled in off their ticks: "30" had sat 7.5 px left of its tick.)
// (One rule for every scale: the bar's own ends mark its first and last numbers; a short notch under the bar marks each
// number between them, and any extra tick a key asks for (Velocity's normal band). A notch never crosses the colours.)
function lgScaleSpec(nums, ticks = []) {
  const marks = [...new Map([...ticks.map((p) => [p, false]), ...nums.filter(([p]) => p > 1 && p < 99).map(([p, , opt]) => [p, !!opt])]).entries()].filter(([p]) => p > 1 && p < 99);
  return {
    attrs: { class: 'lg-scale', style: { marginLeft: `${String(nums[0]?.[1] ?? '').length / 2}ch`, marginRight: `${String(nums.at(-1)?.[1] ?? '').length / 2}ch` } },
    ticks: marks.map(([p, opt]) => ({ class: 'lg-tick' + (opt ? ' opt' : ''), style: { left: p + '%' } })),
    nums: nums.map(([p, t, opt]) => ({ attrs: { class: 'lg-num' + (p >= 95 ? ' end' : p <= 1 ? ' start' : '') + (opt ? ' opt' : ''), style: { left: p + '%' } }, text: t })),
  };
}
const LG_MAX = 30, LG_AT_P = (p) => (p / LG_MAX) * 100, LG_AT_FLOW = (v) => flowPos(v) * 100, LG_AT_HEAT = (v) => (v / HEAT_MAX) * 100, LG_AT_OXY = (p) => ((p / 100 - OXY_MIN) / (1 - OXY_MIN)) * 100;
const LG_SCALE = {
  pressure: lgScaleSpec(PRESSURE_TICKS.map((p) => [LG_AT_P(p), String(p)]), PRESSURE_TICKS.map(LG_AT_P)),
  drop: lgScaleSpec([[0, '0'], [100, '≥12']]),
  flow: lgScaleSpec([[LG_AT_FLOW(0.02), '0.02'], [LG_AT_FLOW(0.5), '0.5'], [LG_AT_FLOW(5), '5']], [LG_AT_FLOW(0.5)]),
  velocity: lgScaleSpec([[0, 'Slow'], [100, 'Fast']], [33.3, 66.7]),
  heat: lgScaleSpec([[LG_AT_HEAT(0), '0'], [LG_AT_HEAT(5), '5'], [LG_AT_HEAT(10), '10', 1], [LG_AT_HEAT(15), '≥15']], []),
  oxygen: lgScaleSpec([[LG_AT_OXY(60), '60'], [LG_AT_OXY(80), '80'], [LG_AT_OXY(100), '100']], [LG_AT_OXY(80)]),
  delta: lgScaleSpec([[0, '−12'], [50, '0'], [100, '+12']], [50]),
};
// (Each bar's colours, as CSS: asked of colormap.js once, on the lens's first showing. Its ramps are read from the page's styles once
// and kept there, so the same text comes back each time.)
const LG_GRAD = {};
const LG_DELTA_GRAD = 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))';
// The wording that names the reference (Congestion, Change): made again only when the reference is another one.
let lgRef = null, lgHeatUnit = '', lgHeatAria = '', lgDeltaTitle = '', lgDeltaAria = '';
function lgRefWords(ref) {
  if (ref === lgRef) return;
  lgRef = ref;
  lgHeatUnit = `mmHg above ${ref}`;   // alloc-rare: made only when the reference changes
  lgHeatAria = `Legend: pressure above ${ref}, 0 to 15 millimeters of mercury, gray to yellow to deep red, with a glow where congestion is highest`;   // alloc-rare: made only when the reference changes
  lgDeltaTitle = `Change from ${ref}`;   // alloc-rare: made only when the reference changes
  lgDeltaAria = `Legend: change in pressure from ${ref}, blue lower, red higher, up to 12 millimeters of mercury`;   // alloc-rare: made only when the reference changes
}
lgRefWords('healthy');
const lgScale = (grad, spec) => {
  LG_BAR_STYLE.background = grad;
  const bar = h('div', LG_BAR);
  bar._ramp = grad;
  const sc = h('div', spec.attrs, bar);
  for (let i = 0; i < spec.ticks.length; i++) sc.append(h('span', spec.ticks[i]));
  for (let i = 0; i < spec.nums.length; i++) sc.append(h('span', spec.nums[i].attrs, spec.nums[i].text));
  return sc;
};
// Where the full title is hidden (narrow screens), a two-word caption keeps the lens and its unit.
const lgCap = (k, u) => h('div', LG_CAP, k, h('small', NOATTR, u));
const lgTitle = (t, u) => h('div', LG_TITLE, t, h('small', NOATTR, u));
const legendKids = [];   // (what a key is made of, handed to morphKey, which uses it before it returns, or in the one fill that a swap keeps)
const lgPut = (el, same, a, b, c) => {
  legendKids.length = 0;
  legendKids.push(a);
  if (b) legendKids.push(b, c);
  morphKey(el, legendKids, same ? INSTANT : NOT_INSTANT);
};
function renderLegend() {
  const { m, ref } = legendModel();
  // (The key names only what the legend shows: the reference appears in the Congestion and Change keys alone, so turning
  // Compare on or off no longer fades an unchanged key out and in; round 2 review, NP8.)
  const el = $('#legend'), same = legendSame(m, ref);
  legendM = m; legendRef = ref;
  if (m === 'pressure' || m === 'drop') {
    if (m === 'pressure') LG_GRAD.pressure ||= gradientCss('to right', LG_MAX); else LG_GRAD.drop ||= dropCss('to right');
    lgPut(el, same, lgTitle(m === 'pressure' ? 'Mean venous pressure' : 'Pressure drop', 'mmHg'), lgCap(m === 'pressure' ? 'Pressure' : 'Drop', 'mmHg'), lgScale(m === 'pressure' ? LG_GRAD.pressure : LG_GRAD.drop, m === 'pressure' ? LG_SCALE.pressure : LG_SCALE.drop));
    el.setAttribute('aria-label', m === 'pressure' ? 'Legend: mean venous pressure at each vessel, 0 to 30 millimeters of mercury, pale blue to dark magenta' : 'Legend: pressure drop across each vessel, 0 to 12 or more millimeters of mercury, pale to deep green');
  } else if (m === 'flow') {
    LG_GRAD.flow ||= flowCss('to right');
    lgPut(el, same, lgTitle('Flow volume', 'L/min · width ∝ √flow'), lgCap('Flow', 'L/min'), lgScale(LG_GRAD.flow, LG_SCALE.flow));
    el.setAttribute('aria-label', 'Legend: flow volume from 0.02 to 6 liters per minute on a log scale, pale mint to deep blue; line width grows with flow');
  } else if (m === 'velocity') {
    LG_GRAD.velocity ||= velocityCss('to right');
    lgPut(el, same, lgTitle('Velocity', 'vs normal'), lgCap('Velocity', 'vs normal'), lgScale(LG_GRAD.velocity, LG_SCALE.velocity));
    el.setAttribute('aria-label', 'Legend: each vessel\'s mean velocity against its normal range: a continuous scale from sand (slower than normal) through teal (normal) to violet (faster), stronger the further from normal; collaterals stay gray');
  } else if (m === 'heat') {
    lgRefWords(ref);
    LG_GRAD.heat ||= heatCss('to right');
    lgPut(el, same, lgTitle('Congestion', lgHeatUnit), lgCap('Congestion', 'mmHg'), lgScale(LG_GRAD.heat, LG_SCALE.heat));
    el.setAttribute('aria-label', lgHeatAria);
  } else if (m === 'oxygen') {
    LG_GRAD.oxygen ||= oxygenCss('to right');
    lgPut(el, same, lgTitle('Oxygen saturation', '%'), lgCap('Oxygen', '%'), lgScale(LG_GRAD.oxygen, LG_SCALE.oxygen));
    el.setAttribute('aria-label', 'Legend: oxygen saturation of the blood in each vessel, 60 to 100 percent, blue (hepatic venous blood, about 65) to red (arterial, 98); portal blood is about 85');
  } else if (m === 'direction') {
    lgPut(el, same, h('div', LG_CATS, h('span', NOATTR, h('i', LG_DOT.normal), 'Physiological'), h('span', NOATTR, h('i', LG_DOT.reversed), 'Reversed')));
    el.setAttribute('aria-label', 'Legend: teal is physiological flow direction, orange is reversed');
  } else if (m === 'origin') {
    // Dots and the short names (SMV, IMV, SV, Sys, HA), so the key always fits in the top bar.
    const cats = h('div', LG_DOTS);
    for (let k = 0; k < LG_ORIGIN_ORDER.length; k++) { const o = LG_ORIGIN[LG_ORIGIN_ORDER[k]]; cats.append(h('span', o.span, h('i', o.dot), h('b', NOATTR, o.name))); }
    lgPut(el, same, cats);
    el.setAttribute('aria-label', 'Legend: blood colored by where it comes from, as streams side by side: amber SMV (with the coronary vein), teal IMV, violet SV (splenic vein), slate blue Sys (systemic), crimson HA (hepatic artery)');
  } else if (m === 'neutral') {
    lgPut(el, same, h('div', LG_CATS, h('span', NOATTR, h('i', LG_DOT.portal), 'Portal veins'), h('span', NOATTR, h('i', LG_DOT.systemic), 'Systemic veins'),
      h('span', LG_NOTE, svgIcon('info'), 'Pressures unmeasured')));
    el.setAttribute('aria-label', 'Legend: violet portal veins, blue systemic veins. Pressures are unmeasured in this case: investigate with the tools.');
  } else {
    lgRefWords(ref);
    lgPut(el, same, lgTitle(lgDeltaTitle, 'mmHg'), lgCap('Change', 'mmHg'), lgScale(LG_DELTA_GRAD, LG_SCALE.delta));
    el.setAttribute('aria-label', lgDeltaAria);
  }
  const lab = $('#colorModeLabel'), name = m === 'neutral' ? 'Anatomy' : m === 'delta' && st().compareSnap ? 'Change since then' : COLOR_MODES[m];
  crossfadeText(lab, name, lab.textContent === name ? INSTANT : NOT_INSTANT);
}
const st = () => store.get();
// ── Moving blood ─────────────────────────────────────
// The heartbeat (the model's pulsatile mode) always runs, so the Over time trace is beat to beat
// from the first moment rather than smooth until a waveform instrument opens.
let beatSent = null;
const BEAT_ON = { type: 'beat', on: true };   // (host.send posts a copy)
function sendBeat() {
  const on = true;
  if (on !== beatSent) { beatSent = on; host.send(BEAT_ON); }
}
const setBlood = (patch) => store.set({ blood: { ...store.get().blood, ...patch } });
function syncBloodBtn() {
  const b = $('#btnBlood');
  if (!b) return;
  const on = store.get().layers.flow !== false;
  b.classList.toggle('off', !on);
}
function injectDye({ hold = false } = {}) {
  const sel = store.get().selection;
  stage.injectDye(sel?.type === 'edge' ? sel.id : null, { hold });
}
// A row of a Blood or Layers menu: an icon, a name, a line under it, and a checkbox.
function menuToggle(checked, ic, label, sub, onChange) {
  let on = !!checked;
  const b = h('button', { class: 'lens lens-opt' + (on ? ' on' : ''), role: 'menuitemcheckbox', 'aria-checked': String(on) },
    svgIcon(ic, 'bo-ic'), h('span', { class: 'lens-t' }, label), sub ? h('span', { class: 'lens-d' }, sub) : null, h('span', { class: 'mt-sw', 'aria-hidden': 'true' }));
  b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); onChange(on); });
  return b;
}
function openBlood(anchor) { popover(anchor, bloodItems(), { cls: 'blood-pop' }); }
function bloodItems() {
  const st = store.get(), b = st.blood || {};
  const flowOn = st.layers.flow !== false;
  const toggle = menuToggle;
  const layer = (key, ic, label, sub) => toggle(st.layers[key] !== false, ic, label, sub, (on) => store.set({ layers: { ...store.get().layers, [key]: on } }));
  return [
    menuSection('Moving blood',
      toggle(flowOn, 'streaks', 'Streaks', 'Silky streaks carried by the flow', (on) => { store.set({ layers: { ...store.get().layers, flow: on } }); syncBloodBtn(); }),
      toggle(!!b.chevrons, 'chevrons', 'Chevrons', 'Flow arrows, orange where reversed', (on) => setBlood({ chevrons: on })),
      toggle(!!b.keyChevrons, 'chevrons', 'Key chevrons only', 'Just the main routes, not every vessel', (on) => setBlood({ keyChevrons: on }))),
    menuSection('Show on the figure',
      layer('chips', 'tag', 'Pressure values', 'The number beside each vessel\u2019s name'),
      layer('collaterals', 'route', 'Potential collaterals', 'Dotted routes that open with pressure'),
      layer('labels', 'liver', 'Organ names', 'The caption on each organ')),
    menuSection('Labels', labelLevelSeg()),
  ];
}
// Which stations are labelled: the key ones (portal vein, the HVPG pair, what is abnormal; everything once
// zoomed in), all of them at every zoom, or none.
function labelLevelSeg() {
  const cur = store.get().labelLevel;
  return h('div', { class: 'seg full menu-seg', role: 'group', 'aria-label': 'Labels on the figure' }, [['key', 'Key'], ['all', 'All'], ['none', 'None']].map(([v, l]) => {
    const b = h('button', { 'aria-pressed': String(cur === v), 'data-labels': v, title: { key: 'Portal vein, the HVPG pair and what is abnormal; every station once zoomed in', all: 'Every station at every zoom', none: 'No station labels' }[v] }, l);
    b.addEventListener('click', () => {
      store.set({ labelLevel: v });
      try { localStorage.setItem('pps.labels', v); } catch (e) { caught('main:857', e); /* storage unavailable */ }
      b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    return b;
  }));
}
// The Lobule view's layers, in the same kind of menu: the zone bands and the lymph.
function openLobuleLayers(anchor) { popover(anchor, lobuleLayerItems(), { cls: 'blood-pop' }); }
function lobuleLayerItems() {
  const l = store.get().lobuleLayers || {};
  const set = (patch) => store.set({ lobuleLayers: { ...store.get().lobuleLayers, ...patch } });
  return [
    menuSection('Show on the lobule',
      menuToggle(!!l.zones, 'zones', 'Zones', 'Zones 1 to 3, portal to central vein', (on) => set({ zones: on })),
      menuToggle(!!l.lymph, 'lymph', 'Lymph', 'Where lymph forms and drains', (on) => set({ lymph: on }))),
  ];
}
function lensKeys() { return Object.keys(LENSES); }
function openLayers(anchor) {
  const s0 = store.get();
  const cur = store.get().colorMode;
  const lens = (v) => {
    const [title, desc, sw] = LENSES[v];
    const b = h('button', { class: 'lens' + (cur === v ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(cur === v), onclick: (e) => { store.set({ colorMode: v }); const g = e.currentTarget.parentElement; g.querySelectorAll('.lens').forEach((x) => { const on = x === e.currentTarget; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); } },
      h('span', { class: 'lens-sw', style: { background: sw() } }),
      h('span', { class: 'lens-t' }, title), h('span', { class: 'lens-d' }, desc));
    return b;
  };
  popover(anchor, [
    h('div', { class: 'lens-grid' }, lensKeys().map(lens)),
    s0.imaging ? h('div', { class: 'ctl-sub', style: { padding: '2px 10px 6px' } }, 'This view shows anatomy only until you measure.') : null,
  ], { cls: 'layers-pop' });
}
// Active bleeding is a state, not an alarm: the figure shows the blood itself; the readings are drawn again when it starts or stops.
let lastBleed = false;
function syncBleeding(f) {
  const on = !!f.metrics.bleeding;
  if (on === lastBleed) return;
  lastBleed = on;
  redraw();
}
let tipInfo = null;
function hoverInfo(info) {
  tipInfo = info;
  const f = store.get().frame;
  const tool = store.get().tool;
  // A long press (info.peek) shows the readings on any screen, above the finger; hovering only where there is a pointer.
  if (!info || !f || tool !== 'select' || store.get().shunting || (isPhone() && !info.peek) || store.get().imaging) { tipEl.classList.remove('on'); tipPlace = ''; return; }
  const e = EDGES[EI[info.id]], k = EI[info.id];
  const v = dopplerVel(f, k);   // as Doppler reads it (peak), like the callouts and Details
  const liver = e.kind === 'liver', b = liver ? bedStats(e, f) : null;
  const vals = [edgeValue(e, f, 'pressure', null).v, fmtFlow((f.Qf ? f.Qf[k] : f.Q[k]) * 0.06),
    ...(liver ? [fmt(b.dp, 1), b.r == null ? '—' : fmt(b.r, 1)] : [fmt(v, 1), fmt(f.D[k], 1)])].map(String);
  // Built once per vessel; while it stays hovered each frame only changes the numbers, and the tip is measured
  // and placed again only when the pointer moves or a number changes its length.
  const shape = `${info.id}|${info.peek ? 1 : 0}`;
  if (tipShape !== shape) {
    tipShape = shape;
    // Same language as the menu panel and the data card: tabular numbers, units smaller and muted.
    const r = (a, u) => h('div', { class: 'r' }, h('span', { class: 'k' }, a), h('b', {}, '', h('span', { class: 'u' }, u)));
    const art = e.kind === 'artery' || e.kind === 'arteriole';
    const acc = art ? 'var(--artery)' : PORTAL_TERRITORY.has(e.from) || PORTAL_TERRITORY.has(e.to) ? 'var(--vein-portal)' : 'var(--vein-systemic)';
    tipEl.style.setProperty('--acc', acc);
    // A lumped bed (the sinusoids) has no one diameter or velocity: its pressure drop and resistance instead.
    const rows = [r('Pressure', 'mmHg'), r('Flow', 'L/min'), ...(liver ? [r('Drop to central v.', 'mmHg'), r('Resistance', 'mmHg·min/L')] : [r('Velocity', 'cm/s'), r('Diameter', 'mm')])];
    tipEl.replaceChildren(h('div', { class: 't' }, e.label),
      h('div', { class: 'rows' }, ...rows), h('div', { class: 'hint' }, info.peek ? 'Tap for actions' : 'Click or right-click for actions'));
    tipVals = rows.map((row) => row.lastChild.firstChild);
    tipPlace = '';
  }
  let lens = '';
  vals.forEach((t, i) => { const n = tipVals[i]; if (n.data !== t) n.data = t; lens += t.length + ','; });
  tipEl.classList.add('on');
  tipEl.classList.toggle('peek', !!info.peek);
  // (The view's and the tip's sizes are the ones the browser reported after its last layout, geom.js sizeOf: nothing is laid
  // out to place it. A new size, a new number's width say, places it again as it is reported, before that frame is painted. It moves
  // by translate, on the compositor, never by left and top.)
  const vs = sizeOf(view), ts = sizeOf(tipEl);
  const W = vs ? vs.w : innerWidth, H = vs ? vs.h : innerHeight, th = ts ? ts.h : 0, tw = (ts && ts.w) || 200;
  const place = `${info.x},${info.y}|${lens}|${W}x${H}|${tw}x${th}`;
  if (place === tipPlace) return;
  tipPlace = place;
  const x = info.peek ? Math.max(8, Math.min(W - tw - 8, info.x - tw / 2)) : Math.max(8, Math.min(W - tw - 8, info.x + 16));
  // (A long press: above the finger, so the finger doesn't hide it; below it only when there is no room above.)
  const y = info.peek ? (info.y - th - 44 >= 8 ? info.y - th - 44 : Math.min(H - th - 8, info.y + 44)) : Math.max(8, Math.min(H - th - 8, info.y + 16));
  tipEl.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
}
let tipShape = '', tipVals = [], tipPlace = '';

// The figure header carries the Then / Now / Change switch when a moment is pinned.
let cmpWatched = false;
let cmpHNum = 0, cmpHStr = '0px';   // (the header's height as written, and as text: made again only when the height changes)
function syncCmpH() {
  const c = $('#stageCenter');
  if (!cmpWatched && c) { cmpWatched = true; watchSize(c, syncCmpH); }
  const z = sizeOf(c);
  let v = '0px';
  if (store.get().compareSnap && z) {
    const n = Math.round(z.h) + 8;
    if (n !== cmpHNum) { cmpHNum = n; cmpHStr = `${n}px`; }   // alloc-rare: the text is made only when the header's height changes
    v = cmpHStr;
  }
  if (app.style.getPropertyValue('--cmp-h') !== v) app.style.setProperty('--cmp-h', v);
}
// (Scrolled between frames, rest-pass.js: scrollIntoView lays the page out.)
const SCROLL_CMP = { block: 'start', behavior: 'auto' };   // (options read by scrollInto at once: the behaviour is written before each use)
function scrollCmp() { SCROLL_CMP.behavior = scrollBehavior(); scrollInto($('.cmp-section'), SCROLL_CMP); }
// The Compare banner. Its words name the pinned moment, so they are made again only when the moment, or the names of its two ends, change.
const CMP_NAMES = ['Then', 'Now'];
const CMP_LABEL = { class: 'cmp-label' }, CMP_SEG = { class: 'seg cmp-seg', role: 'group', 'aria-label': '' };
const CMP_BTN = [{ 'aria-pressed': 'false', title: '' }, { 'aria-pressed': 'false', title: '' }, { 'aria-pressed': 'false', title: '' }];   // (written before each build: h() reads them at once)
const CMP_SET = [{ compareView: 'A' }, { compareView: 'B' }, { compareView: 'D' }];
const cmpSetA = () => store.set(CMP_SET[0]), cmpSetB = () => store.set(CMP_SET[1]), cmpSetD = () => store.set(CMP_SET[2]);
const CMP_CLICK = [cmpSetA, cmpSetB, cmpSetD];
const cmpTableLater = () => restPass(scrollCmp);
const cmpTable = () => {
  // (The table scrolls into view once the card has come in, not while it is still sliding: P22.)
  const was = panelShown(); openPanel();
  setTimeout(cmpTableLater, was ? 0 : 260);
};
const CMP_TABLE = { class: 'btn sm cmp-table-btn', title: 'Every value, then and now, in a table', onclick: cmpTable };
const CMP_BADGE = { class: 'cmp-badge stage-blocker' };
const BANNER_IN = [{ opacity: 0 }, { opacity: 1 }], BANNER_IN_OPTS = { duration: D_SMALL, easing: EASE_ARRIVE };
let cmpWhen = null, cmpNA = null, cmpNB = null, cmpLabel = '', cmpAria = '', cmpTitleA = '', cmpTitleD = '', cmpShowing = '';
function cmpWords(when, nA, nB) {
  if (when !== cmpWhen) {
    cmpWhen = when;
    cmpLabel = `Comparing with ${when}`;   // alloc-rare: made when the pinned moment changes
    cmpAria = `Comparing with ${when}: show`;   // alloc-rare: made when the pinned moment changes
    cmpTitleA = `The model at ${when}`;   // alloc-rare: made when the pinned moment changes
    cmpTitleD = `Change from ${when} to now`;   // alloc-rare: made when the pinned moment changes
    cmpShowing = `Showing ${when}`;   // alloc-rare: made when the pinned moment changes
  }
  cmpNA = nA; cmpNB = nB;
}
let bannerEl = null, bannerOn = false, bannerLabel = null, bannerSeg = null, bannerTable = null;
const bannerFill = () => { if (bannerOn) bannerEl.replaceChildren(bannerLabel, bannerSeg, bannerTable); else bannerEl.replaceChildren(); };
const bannerClear = () => bannerEl.replaceChildren();
function renderBanner() {
  const el = $('#stageBanner');
  const s0 = store.get();
  bannerEl = el;
  bannerOn = !!s0.compareSnap;
  if (s0.compareSnap) {
    const names = s0.compareSnap.names || CMP_NAMES;
    cmpWords(s0.compareSnap.when, names[0], names[1]);
    bannerLabel = h('span', CMP_LABEL, cmpLabel);
    CMP_SEG['aria-label'] = cmpAria;
    const cur = s0.compareView || 'B';
    CMP_BTN[0]['aria-pressed'] = cur === 'A' ? 'true' : 'false'; CMP_BTN[0].title = cmpTitleA;
    CMP_BTN[1]['aria-pressed'] = cur === 'B' ? 'true' : 'false'; CMP_BTN[1].title = 'The live model';
    CMP_BTN[2]['aria-pressed'] = cur === 'D' ? 'true' : 'false'; CMP_BTN[2].title = cmpTitleD;
    bannerSeg = h('div', CMP_SEG);
    for (let i = 0; i < 3; i++) {
      const b = h('button', CMP_BTN[i], h('b', NOATTR, i === 0 ? cmpNA : i === 1 ? cmpNB : 'Change'));
      b.addEventListener('click', CMP_CLICK[i]);
      bannerSeg.append(b);
    }
    bannerTable = h('button', CMP_TABLE, 'Differences');
  }
  // The switch fades in when a moment is pinned and out when it is let go (it popped: P20).
  const had = !!el.firstChild;
  if (had && !bannerOn) swapFade(el, bannerClear);
  else { swapFade(el, bannerFill, INSTANT); if (!had && bannerOn) el.animate?.(BANNER_IN, BANNER_IN_OPTS); }
  // The switch's height, for views that place their own controls under it (the lobule's).
  // (Its height as the browser last reported it, geom.js: the switch just built is reported after this layout and written again then.)
  syncCmpH();
  // "Showing <then>" fades in and out (styles: .cmp-badge) instead of popping.
  const badge = view.querySelector('.cmp-badge:not(.leaving)');
  if (s0.compareSnap && s0.compareView === 'A') {
    const t = cmpShowing;
    if (badge) { if (badge.textContent !== t) badge.textContent = t; } else view.append(h('div', CMP_BADGE, t));
  } else if (badge) {
    badge.classList.add('leaving');
    badge._gone ||= () => badge.remove();   // alloc-rare: one per badge, made as it leaves (a pinned moment let go, or another view chosen)
    afterExit(badge, 'leaving', badge._gone);
  }
  redraw();
}

// ── Top bar & transport ─────────────────────────────
function wireTopbar() {
  initDebug(() => stage.zoomLevel());
  // ?perf in the address: the readout of what blocks frames after a pan or pinch (perf-readout.js). Without it, never loaded.
  // (And the frame-time overlay beside it, frame-hud.js: fps, 1% low, interval and script percentiles, surfaces, throttle.)
  if (new URLSearchParams(location.search).has('perf')) import('./frame-hud.js').then(({ startFrameHud }) => startFrameHud()).catch(() => { /* a measuring aid only */ });
  // High Refresh (high-refresh.js): on a touch screen the first tap goes full screen, past the browser's 60 Hz hold for pages.
  import('./high-refresh.js').then(({ startHighRefresh }) => startHighRefresh()).catch(() => { /* full screen is a bonus */ });
  if (new URLSearchParams(location.search).has('perf')) import('./perf-readout.js').then(({ startPerfReadout }) => startPerfReadout({ zoom: () => stage.zoomLevel() })).catch(() => { /* a measuring aid only */ });
  // ?offgpu=1 in the address: the live count of work off the GPU, flashing red when it happens during motion (offgpu-overlay.js). Without it, never loaded.
  if (/[?&]offgpu=1\b/.test(location.search)) import('./offgpu-overlay.js').then(({ startOffGpuOverlay }) => startOffGpuOverlay()).catch(() => { /* a measuring aid only */ });
  $('#btnMenu').addEventListener('click', () => mainMenu.toggle());
  $('#btnSettings').addEventListener('click', (e) => openSettings(e.currentTarget));
  $('#btnPalette').addEventListener('click', () => palette.open());
  $('#btnTreat').addEventListener('click', () => (treatOpen() ? closeTreat({ focus: true }) : openTreat()));
  // History, beside Treat and Tests: its own card on the right (a phone held sideways keeps the menu sheet).
  $('#btnHistory').addEventListener('click', (e) => (isPhone() ? timeline.openHistory(e.currentTarget) : historyOpen() ? closeHistory({ focus: true }) : openHistory()));
  for (const [id, side] of [['#btnPalette', 'bottom'], ['#btnTreat', 'bottom'], ['#zoomIn', 'left'], ['#zoomOut', 'left'], ['#zoomFit', 'left'], ['#rotateCircuit', 'left']]) {
    const b = $(id); tooltipFor(b, b.title, side); b.removeAttribute('title');
  }
}
// Two menus with one job each: Settings (how the simulator looks and reads) and Help (how to
// use it, what it is, and who made it).
// Settings › Show frame breakdown: the frame-time panel (frame-hud.js, as ?perf shows it), started and stopped here. Nothing is loaded or run while it is off.
let hudEl = null, hudBusy = false;
function setFrameBreakdown(on) {
  if (!on) { hudEl?.stop?.(); hudEl = null; return; }
  if (hudEl || hudBusy) return;
  hudBusy = true;
  import('./frame-hud.js').then(({ startFrameHud }) => { hudEl = startFrameHud(); }).catch(() => { /* a measuring aid only */ }).finally(() => { hudBusy = false; });
}
const fpsOn = () => { try { return localStorage.getItem('pps.fps') === '1'; } catch { return false; } };
setFpsCounter(fpsOn());
function openSettings(anchor, withSearch = false) {
  const cur = currentLook() || 'system';
  // While presenting, only what changes how the talk looks (appearance, full screen, text size, blur effect), and Send feedback.
  const talk = presenter.active();
  // Settings is sorted by what a row does, one titled group each (the revamp, 4 Nov 2026): the one-shot actions first, then how it looks, the
  // display switches, the model, the measuring aids, and Reset last. ("Accessibility" had held Blur effect and the two measuring aids.)
  const toggleStored = (key, caught_) => (on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { caught(caught_, e); /* storage unavailable */ } };
  popover(anchor, [
    // (Send feedback heads the sheet in every mode and on every device, above the dock's Search and Help, talks included, so a tester reaches it in one tap from any Settings button.)
    // (From the thumb dock's Settings tab, Search and Help follow it: the dock has no More menu, and a touch keyboard has no ?. Enter full screen acts once, so it sits with them.)
    menuSection(null,
      ...(FEEDBACK_EMAIL ? [menuItem('Send feedback', { icon: 'mail', onClick: () => { closePopover(); sendFeedback(); } })] : []),
      ...(withSearch ? [menuItem('Search', { icon: 'search', onClick: () => { closePopover(); palette.open(); } }),
        menuItem('Help', { icon: 'help', onClick: () => { closePopover(); openHelpMenu(anchor, { place: 'above', align: 'end', cls: 'app-menu' }); } })] : []),
      fullscreenControl()),
    menuSection('Appearance',
      lookChooser(cur, (v) => switchTheme(v === 'system' ? null : v, v === 'system')),
      ...(talk ? presenterSettings() : []),
      h('div', { class: 'menu-title' }, 'Text size on the figure'),
      textSizeControl()),
    // (The figure's resolution choices and performance switches (frame.js) are not in Settings (premium-feel R14, 31 Oct): what a build stored for them is cleared at
    // start (index.html), so they stay at their defaults: Full, and off. Their code stays.)
    // (Blur effect is one setting for the app and the talks: the same switch and the same stored value in both.)
    menuSection('Display',
      menuToggle(!document.documentElement.hasAttribute('data-noglass'), 'layers', 'Blur effect', 'Frosted glass on cards and labels. Off runs cooler', (on) => {
        toggleStored('pps.noGlass', 'main:1038')(!on);   // (stored inverted: 1 means the blur is off)
        document.documentElement.toggleAttribute('data-noglass', !on);
        document.documentElement.removeAttribute('data-noglass-auto');   // (chosen now: no longer the software renderer's own choice, blur-guard.js)
      }),
      menuToggle(sharpMoving(), 'layers', 'Sharp while moving', 'Draw the figure at full resolution during a pan or zoom, even if frames run long', (on) => { toggleStored('pps.sharp', 'main:sharp')(on); setSharpMoving(on); })),
    // (What the model shows and how far it goes has its own heading; none of it is in a talk.)
    ...(talk ? [] : [menuSection('Model',
      menuToggle(store.get().showHvpg, 'gauge', 'Always show HVPG', 'Show HVPG without measuring it first', (on) => {
        toggleStored('pps.showHvpg', 'main:1047')(on);
        document.body.classList.remove('hvpg-swap'); void readMetric(document.body, 'offsetWidth'); document.body.classList.add('hvpg-swap');
        setTimeout(() => classSoon(document.body, 'hvpg-swap', false), 600);
        store.set({ showHvpg: on });
      }),
      menuItem('Advanced physiology', { icon: 'sliders', onClick: () => { closePopover(); closeTreat(); store.set({ selection: null, details: { type: 'advanced' } }); openPanel(); } }))]),
    menuSection('Performance',
      menuToggle(fpsOn(), 'gauge', 'Show frame rate', 'A small counter in the bottom-left corner', (on) => { toggleStored('pps.fps', 'main:fps')(on); setFpsCounter(on); }),
      menuToggle(!!hudEl, 'gauge', 'Show frame breakdown', 'Frame time, script time, which surfaces cost most, and whether the GPU or the script is the limit', (on) => { setFrameBreakdown(on); })),
    ...(talk ? [] : [menuSection(null, menuItem('Reset everything…', { icon: 'reset', onClick: () => resetEverything() }))]),
  ], withSearch ? { place: 'above', align: 'end', cls: 'app-menu' } : { align: 'start', cls: 'app-menu' });
}
// While presenting: no extra settings for now (panel width and high contrast were taken out of slides).
function presenterSettings() { return []; }
// Text size: smaller and larger in even steps, and the middle shows the size and resets it.
// (100 % is the design size; the steps only go up, so no text drops under 11 px. src/ui/type-scale.js)
function textSizeControl() {
  const at = () => TEXT_STEPS.reduce((b, v, i) => (Math.abs(v - stage.labelScale()) < Math.abs(TEXT_STEPS[b] - stage.labelScale()) ? i : b), 0);
  const smaller = h('button', { class: 'ts-a ts-sm', 'aria-label': 'Smaller text', title: 'Smaller text' }, 'A');
  const reset = h('button', { class: 'ts-reset', 'aria-label': 'Reset text size', title: 'Reset text size' });
  const larger = h('button', { class: 'ts-a ts-lg', 'aria-label': 'Larger text', title: 'Larger text' }, 'A');
  const paint = () => {
    const i = at();
    smaller.disabled = i === 0; larger.disabled = i === TEXT_STEPS.length - 1;
    reset.textContent = `${Math.round(stage.labelScale() * 100)}%`;
    reset.setAttribute('aria-pressed', String(i === TEXT_STEPS.indexOf(1)));
  };
  const step = (d) => { stage.setLabelScale(TEXT_STEPS[Math.max(0, Math.min(TEXT_STEPS.length - 1, at() + d))]); paint(); };
  smaller.addEventListener('click', () => step(-1));
  larger.addEventListener('click', () => step(1));
  reset.addEventListener('click', () => { stage.setLabelScale(1); paint(); });
  paint();
  return h('div', { class: 'seg full menu-seg text-size', role: 'group', 'aria-label': 'Text size on the figure' }, smaller, reset, larger);
}
// Full screen through the browser. iPhone Safari has no full screen for pages, so there the
// sheet says how to get the same room: Add to Home Screen opens the app without browser bars.
function fullscreenControl() {
  const root = document.documentElement;
  if (!document.fullscreenEnabled || !root.requestFullscreen) {
    return /iPhone|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches
      ? h('small', { class: 'mm-role-note fs-hint' }, 'For full screen on iPhone: Share › Add to Home Screen.') : null;
  }
  // A plain row like the others (it acts once, it is not a setting): the label says what the next press does.
  // (It was a bordered button under the .menu-btn rules, the only centred, borderless-by-accident row in the sheet.)
  const b = menuItem('Enter full screen', { icon: 'fullscreen' }), t = b.querySelector('span');
  b.title = 'Hide the browser bars (Esc leaves)';
  const sync = () => { t.textContent = document.fullscreenElement ? 'Exit full screen' : 'Enter full screen'; };
  sync();
  b.addEventListener('click', () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
    p?.catch?.(() => sync());
  });
  // One document listener for the session; it updates whichever Settings button is showing (each open builds a new one).
  fsSync = sync;
  if (!fsListening) { fsListening = true; document.addEventListener('fullscreenchange', () => fsSync?.()); }
  return b;
}
let fsSync = null, fsListening = false;
function openHelpMenu(anchor, at = { align: 'start', cls: 'app-menu' }) {
  popover(anchor, [
    menuSection('Help',
      menuItem('Guide', { icon: 'book', onClick: () => { closePopover(); openHelp(); } }),
      menuItem('Keyboard shortcuts', { icon: 'grid', kb: '?', onClick: () => { closePopover(); openHelp('keys'); } }),
      menuItem('About the model', { icon: 'info', onClick: () => { closePopover(); openAbout(); } }),
      menuItem('References', { icon: 'case', onClick: () => { closePopover(); openAbout('refs'); } }),
      menuItem('Privacy', { icon: 'lock', onClick: () => { closePopover(); openPrivacy(); } })),
    menuSection(null,
      h('a', { class: 'menu-credit', href: AUTHOR_URL, target: '_blank', rel: 'noopener', onclick: () => closePopover() },
        h('span', {}, 'Created by ', h('b', {}, AUTHOR)), h('span', { class: 'mc-link' }, 'More teaching tools ', icon('chev-right')))),
  ], at);
}
// Send feedback: a draft in the viewer's own email app, addressed to the author, with what a bug report needs underneath
// (the build from the preview pill, the device, the screen and a link back to this exact view). The app itself sends
// nothing, so the Privacy page stays true.
function sendFeedback() {
  try { localStorage.setItem(ASK_KEY, 'done'); } catch (e) { caught('main:1120', e); /* storage unavailable */ }   // (sent once: the timed ask never comes)
  const build = document.getElementById('preview-badge')?.textContent.trim() || 'Live site';
  const theme = currentLook() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const body = ['What happened, and what did you expect to happen?', '', '', '',
    'Please keep these details:', `Build: ${build}`, `Device: ${navigator.userAgent}`,
    `Screen: ${innerWidth} × ${innerHeight} at ${devicePixelRatio}×, ${theme} theme`, `View: ${resumeUrl()}`,
    ...feedbackDiagnostics({ perf: framePerf, blurWhy: (el) => stage.blurWhy?.(el) ?? null }), ...reportLines()].join('\n');
  location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Portal Pressure Simulator feedback')}&body=${encodeURIComponent(body)}`;
}
function doUndo() { timeline.undo(); }
function doRedo() { timeline.redo(); }
function toggleTheme() {
  const cur = currentLook() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  switchTheme(isDarkLook(cur) ? 'light' : lastDarkLook());   // (a dark look goes to Light; from any other, back to the dark look last worn)
}
function settle() { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); }
function setSpeed(v, lapse = false) {
  if (lapse) { store.set({ lapse: v }); host.send({ type: 'run', speed: v, clock: 'disease' }); }
  else { store.set({ speed: v, lapse: 0 }); host.send({ type: 'run', speed: v, clock: 'hemo' }); }
}
// A theme chosen in the app crossfades the whole page (.45 s): the old look is held as a still picture at full resolution and
// fades over the live new one (View Transitions, styles/app.css). Where that is not supported it changes at once, as before
// (motion review P1). Page load and a change of the device's own theme apply at once.
// (PR-16: only on the desktop, and never over the memory budget. A crossfade holds the old 8 MP page as a texture beside the new one, two
// more full-page surfaces on a phone or iPad already near its envelope; there the change applies at once, as under reduced motion.)
const canCrossfade = () => !!document.startViewTransition && !document.hidden && deviceClass() === 'desktop' && !overBudget();
function switchTheme(t, clear) {
  if (!canCrossfade()) { applyTheme(t, clear); return; }
  // (The new page is whole before the crossfade captures it: every surface has drawn the look, themeSettled in theme-epoch.js, capped.)
  crossfade(() => { applyTheme(t, clear); return themeSettled(); });
}
// While a crossfade plays, its pictures cover the page, so a tap would land on <html>: lost, and taken as a tap outside the
// open Settings, which closed. Such a tap ends the crossfade and goes to whatever is under it once the live page shows again.
// (A window capture listener added at startup runs before the popovers' own outside-tap listeners; motion review round 2, RF1.)
let pageFade = null;
function crossfade(fn) {
  const vt = pageFade = document.startViewTransition(fn);
  // (A crossfade the next one skips rejects its ready promise, an AbortError nobody awaits, and one whose update threw rejects the others: none of them is news here.)
  vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
  vt.finished.catch(() => {}).finally(() => { if (pageFade === vt) pageFade = null; });
}
addEventListener('pointerdown', (e) => {
  const vt = pageFade;
  if (!vt) return;
  pageFade = null;
  e.stopImmediatePropagation(); e.preventDefault();
  const { clientX: x, clientY: y } = e;
  vt.skipTransition();
  vt.finished.catch(() => {}).finally(() => readElAt(x, y)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window })));
}, true);
function applyTheme(t, clear) {
  applyLookAttrs(document.documentElement, t);   // (data-theme, and data-palette for Navy and Black: looks.js)
  try { if (t) localStorage.setItem('pps.theme', t); else if (clear) localStorage.removeItem('pps.theme'); } catch (e) { caught('main:1168', e); /* storage unavailable */ }
  const f = store.get().frame; if (f) { stage?.update(viewFrame(f)); dock?.update(f); }
}
// The browser's and the installed app's status bar take the color of whatever sits under it: the
// figure (the top bar floats over it). The theme can differ from the system's, so the color comes from the page, not from a media query.
function syncStatusBar() {
  const c = cssVar('--stage-bg');   // (the stage's ground comes from the look alone: the token cache, read again for each theme epoch)
  if (!c) return;
  let m = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!m) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => x.remove());
    m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m);
  }
  if (m.content !== c) m.content = c;
}
// A change of the device's light or dark setting applies at once (no crossfade), and the figure is drawn again in the same task,
// hidden or not: an iPhone or iPad turns the page light and back while it takes the app switcher's pictures, often with the
// page in the background and the model paused, so no frame came to redraw the organs and vessels in the colours now.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const f = store.get().frame; if (f) { stage?.update(viewFrame(f)); dock?.update(f); }   // (the instruments too: with the model paused no frame comes to repaint their canvases)
});
// (2 Nov 2026, glitch audit TH2: only for a new look, in the theme epoch's frame (theme-epoch.js). The stage's colour depends on the look
// alone, so a card, a sheet or a presenting change on the app no longer costs a style pass, nor a second one 600 ms later.)
onTheme(syncStatusBar);
syncStatusBar();
function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
// ── Patient chart, Treat card and instrument workspace ─
// The chart is a card floating over the right of the figure (a bottom sheet on a phone), opened
// from Findings or by a vessel's Details. It starts closed: the figure
// has the screen until something is asked for.
// Findings, Treat and Measure close the same way: the card plays its way out (CSS .card-leaving)
// while the layout already treats it as closed.
function leave(el) {
  if (el.dataset.swiped) { delete el.dataset.swiped; return; }   // (swiped away: already slid out of sight behind the tab row)
  // (With Reduce Motion it fades where it stands: app.css turns the leaving keyframes into fades.)
  // (A leave already playing starts again from its first frame: its own animations are set back to the start, no reflow to restart it.)
  if (el.classList.contains('card-leaving')) { const as = readAnims(el); if (as) for (const a of as) if (a.animationName) a.currentTime = 0; }
  el.classList.add('card-leaving');
  markGone(D_SMALL, el);
  // (Each card has its own step, made on its first leave and kept: adding the same listener again is a no-op, and it takes itself off as before.)
  const done = el._leaveDone ||= (e) => { if (e && e.target !== el) return; el.classList.remove('card-leaving'); el.removeEventListener('animationend', el._leaveDone); };   // alloc-rare: one per card, made on its first leave
  el.addEventListener('animationend', done);
  setTimeout(done, 400);
}
const arrive = (el) => { el.classList.remove('card-leaving'); switchIn(el); };
function panelShown() { return !app.classList.contains('instrument-focus') && app.classList.contains('panel-open'); }
// The figure re-fits to the space the open cards leave (once as the card starts, again when its sheet has settled).
// The patient's name in the top bar shows whole, never cut with "…" (sweep, 16 Oct: "Budd–Chiari (he…" on a phone held
// sideways). It takes the first form that fits its room: the full name on one line, the short form on one line, the short
// form on two lines at 12 px, then the compact form on two lines. An upright phone starts at the short form on two lines,
// as it always has. (styles: .scenario-v[data-form])
function fitScenarioName() {
  const e = document.getElementById('scenarioName');
  if (!e?.querySelector('.sn-c') || !readMetric(e, 'offsetParent')) return;
  const forms = matchMedia('(max-width: 480px)').matches ? NAME_FORMS_NARROW : NAME_FORMS;
  for (const f of forms) {
    e.dataset.form = f;
    if (readMetric(e, 'scrollWidth') <= readMetric(e, 'clientWidth') + 0.5 && readMetric(e, 'scrollHeight') <= readMetric(e, 'clientHeight') + 0.5) return;
  }
}
let refitT = 0;
// (The steps the layout's timers run are made once here, not for each call.)
const stageRefit = () => stage?.refit();
const stageRelayoutSoon = () => stage?.relayout();
const stageRelayout = () => stage.relayout();
let dockFrame = null;   // (the frame the Tests card is brought up to date with, as asked last)
const dockUpdate = () => dock.update(dockFrame, true);
const RESIZE_EVENT = new Event('resize');   // (dispatched again each time: nothing keeps it)
const fireResize = () => dispatchEvent(RESIZE_EVENT);
function refitStage() {
  clearTimeout(refitT);
  nextFrame(stageRefit);
  refitT = setTimeout(stageRefit, 380);
}
function syncPanelToggle() {
  refitStage();
  setTimeout(stageRelayoutSoon, 320);
}
// Closing a card from the keyboard or its own button hands focus back to what opened it, never to the page (review #24).
// (Safari does not focus a clicked button, so the card's own button stands in for the opener.) A card put away because
// another opens keeps focus where it is.
function giveFocusBack(card, to) {
  const a = document.activeElement;
  if (a && a !== document.body && !card.contains(a)) return;
  // (A button that is not drawn takes no focus: focus() leaves it where it is, with no box read to ask first.)
  if (to?.isConnected) to.focus(FOCUS_NO_SCROLL);
}
let panelOpener = null;
/** Opens the patient chart; or the instruments when named. */
// A finger's wide screen (an iPad held sideways) sets its right-hand cards side by side: Details, Tests (380 px, or 38% of a 1200+ screen),
// Treat or History (400 px), 12 px apart. A vessel card needs 300 px beside them (316 with its margin). Where the open cards and the one
// opening would leave less, the others give way one at a time, Treat or History first, then Tests, then Details, each easing out, until it
// fits: on a 1024 iPad that is one card at a time. (opening: 'treat', 'dock' or 'panel'.)
function rightShort(opening) {
  // (A maximised Tests card fills the screen and the figure is hidden: there is no vessel card to leave a strip for, and the stretched card is not 380 px wide.)
  if (isPhone() || !matchMedia('(pointer: coarse)').matches || app.classList.contains('instrument-focus')) return false;
  const dock = $('#dock'), onPanel = opening === 'panel' || panelShown(), onDock = opening === 'dock' || (app.classList.contains('dock-open') && dock.classList.contains('side')), onTreat = opening === 'treat' || treatOpen() || historyOpen();
  // (The cards' widths as the browser last reported them, geom.js: none is laid out to ask.)
  const pw = sizeOf($('#panel'))?.w, dw = sizeOf(dock)?.w;
  // (The widths of the cards open, counted and summed as they are met.)
  let n = 0, sum = 0;
  if (onPanel) { n++; sum += Math.round(pw || 0) || 380; }
  if (onDock) { n++; sum += Math.round(dw || 0) || (innerWidth < 1200 ? 380 : Math.max(440, innerWidth * 0.38)); }
  if (onTreat) { n++; sum += 400; }
  return n > 1 && innerWidth - sum - (n + 1) * 12 < 316;
}
const GIVE_ORDER = ['treat', 'dock', 'panel'];
function giveWay(opening) {
  for (const k of GIVE_ORDER) {
    if (!rightShort(opening)) return;
    if (k === opening) continue;
    // (A card put away with focus inside it, a control of its own that opened the other one: focus goes to the opening card's button, never to the page.)
    const a = document.activeElement, held = !!a && a !== document.body && !!a.closest(k === 'treat' ? '#treatCard, #historyCard' : k === 'dock' ? '#dock' : '#panel');
    if (k === 'treat') { closeTreat(); closeHistory(); }
    else if (k === 'dock') { if (app.classList.contains('dock-open')) setPanelTab('chart'); }
    else closePanel();
    const to = held && (opening === 'treat' ? $('#btnTreat') : opening === 'dock' ? $('#tabInstruments') : panelOpener);
    if (to?.isConnected) to.focus(FOCUS_NO_SCROLL);
  }
}
function openPanel(tab = 'chart') {
  // (What it puts away on a phone goes first, so the instruments come in once it has gone.)
  if (tab === 'instruments') { if (isPhone()) { closePanel(); closeTreat(); } setPanelTab('instruments'); return; }
  // The panel holds a selection's details, the advanced physiology or a pinned comparison; with none of them it stays shut.
  if (!store.get().details && !store.get().compareSnap) return;
  if (app.classList.contains('instrument-focus')) dock.setState('open');
  // A phone has room for one sheet at a time: the chart puts Treat and the instruments away.
  if (isPhone()) { closeTreat(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
  else giveWay('panel');
  const a = document.activeElement;
  if (!panelShown() && a && a !== document.body && !$('#panel').contains(a)) panelOpener = a;
  arrive($('#panel'));
  app.classList.add('panel-open');
  panelSheet?.open();
  syncPanelToggle();
}
const DETAILS_NULL = { details: null };
const panelDetailsClear = () => { if (!app.classList.contains('panel-open') && store.get().details) store.set(DETAILS_NULL); };
function closePanel(opts) {
  const focus = opts?.focus;
  if (focus) giveFocusBack($('#panel'), panelOpener);
  if (panelShown()) leave($('#panel'));
  app.classList.remove('panel-open'); panelSheet?.closed(); syncPanelToggle();
  // Once it has played out, what it showed is put away, so it never reopens on stale details.
  setTimeout(panelDetailsClear, 420);
}
function setPanelTab(tab) {
  const instr = tab === 'instruments';
  if (instr) dock.ensure();
  const was = app.classList.contains('dock-open');
  if (instr && !was) giveWay('dock');   // (the other right-hand cards give way when they would leave the vessel card no strip)
  if (instr) arrive($('#dock')); else if (was && !app.classList.contains('instrument-focus')) leave($('#dock'));
  app.classList.toggle('dock-open', instr);
  $('#tabInstruments').setAttribute('aria-pressed', instr ? 'true' : 'false');
  if (instr) $('#tabInstruments').classList.remove('ping');
  else app.classList.remove('instrument-focus');
  if (instr && !was) dockSheet?.open();
  if (!instr && was) dockSheet?.closed();
  if (was !== instr) {
    // Opening Tests frames the figure into the space left. Closing it (any way) fits again only a view that was fitted;
    // one the learner zoomed or panned stays where it is, and a refit still pending from the open is dropped (Mohammad, 17 Oct).
    // (Opening Tests keeps the camera where it is, outside a slide, which frames itself: stage.keepView, Mohammad 20 Oct.)
    if (instr && !app.classList.contains('presenting')) { stage?.keepView(true); clearTimeout(refitT); }
    else {
      stage?.keepView(false);
      if (instr || stage?.closeView()) refitStage(); else clearTimeout(refitT);
    }
    const f = store.get().frame; if (f && instr) { dockFrame = f; nextFrame(dockUpdate); }
    setTimeout(fireResize, 320);
  }
}

// ── Floating pieces ─────────────────────────────────
// The top bar and the vitals dock publish their heights (--top-safe, --vdock-h), so the cards,
// the Fit button and the toasts keep clear of them; Fit itself reads data-safe (stage.js).
let panelSheet = null, treatSheet = null, dockSheet = null;
function wireFloating() {
  // Besides the two heights: how much of the right edge the open cards take (--panel-occ for the
  // chart, --instr-occ for the instruments, --right-occ for all of them with Treat) and how much of the
  // bottom (--bot-occ: the vitals dock, or a sheet of instruments above it). The cards stack from the
  // right without covering each other; the zoom buttons and a vessel's card keep clear of them all.
  const px = (v) => `${Math.max(0, Math.round(v))}px`;
  const publish = () => {
    syncThumb();
    const gap = isPhone() ? 8 : 12;
    // The dock's height, plus on an iPhone the home indicator's strip under it (the rules that use it add
    // the gap themselves), so nothing above it is placed behind it.
    // The dock's full height is kept while it is folded to one line (figureFocus below): the framing reads it
    // (stage.js safeInsets), so the figure does not jump each time the dock folds and opens.
    const vd = $('#vdock');
    // (The view switch's pill floats just above the dock and counts as part of it, with 8 px more kept clear above it: what sits
    // above the dock clears the pill too, the figure's readings by 8 px (12 for the framing: a reading's box stops short of its
    // descenders), the zoom group by 16 px. A phone held sideways frames the circuit by its vessels, and its italic vessel names
    // hang below them: there the framing keeps 24 px.)
    const nbvPad = innerHeight <= 500 && innerWidth > innerHeight ? '24' : '12';
    if ($('#nbViews') && $('#nbViews').dataset.safePad !== nbvPad) $('#nbViews').dataset.safePad = nbvPad;
    const nbv = $('#nbViews'), nbvH = nbv && readMetric(nbv, 'offsetHeight') ? Math.max(0, readBox(vd).top - readBox(nbv).top + 8) : 0;
    // (The dock as it rests, the sinusoid view included: it keeps the dock, 2 Nov.)
    const vdH = readMetric(vd, 'offsetHeight');
    if (!vd.classList.contains('mini') && vdH) vd.dataset.fullH = String(vdH + nbvH);
    const vdTop = vdH ? readBox($('#stageView')).bottom - readBox(vd).top + nbvH : 0;
    const vdock = vdH ? Math.max(vdH + nbvH, vdTop - gap) : 0, wide = !isPhone();
    // The top bar keeps one row when everything fits at its natural width (with a little to spare,
    // so it does not flip back and forth), else the view and legend move to a second row.
    // Off a phone the bar first compacts step by step (data-fit 1-3: shorter patient name, icon-only
    // buttons), so the view and the lens stay on the one row; two rows only if even that fails.
    const tb = $('#topbar'), cs = readStyle(tb);
    // (Measured with the patient's full name, as always, so the name's form, picked after, never moves the bar's step.)
    if ($('#scenarioName').dataset.form) $('#scenarioName').dataset.form = 'l';
    const need = () => readMetric($('.tb-id'), 'scrollWidth') + ($('#viewSeg').closest('.topbar') ? readMetric($('#viewSeg'), 'offsetWidth') : 0) + readMetric($('.topbar .sb-right'), 'offsetWidth') + readMetric($('.top-right'), 'scrollWidth') + 6 * 8 + 16;
    const avail = readMetric(tb, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const was = +(tb.dataset.fit || 0) + (tb.classList.contains('two-rows') ? 1 : 0);
    tb.classList.remove('two-rows');
    let fit = 0;
    // A phone held sideways has the width for one row too, once the bar compacts.
    const steps = wide || matchMedia('(orientation: landscape)').matches ? 3 : 0;
    // With the thumb dock the bar is two corner chips, the patient and the key: always one row.
    const thumb = app.classList.contains('thumb');
    if (thumb) tb.dataset.fit = '0';
    else {
      for (; fit <= steps; fit++) {
        tb.dataset.fit = String(fit);
        if (need() <= avail - (fit < was ? 24 : 0)) break;
      }
      if (fit > steps) { tb.dataset.fit = String(steps); tb.classList.add('two-rows'); }
    }
    fitScenarioName();
    // Every box is read first and the custom properties written after, so the whole pass costs one layout
    // instead of one per write; a value is written only when it changed, and the occupancy is announced
    // (pps:occ: the cards and the credit place themselves again) only when something did change.
    const tbH = readMetric(tb, 'offsetHeight');
    const ws = $('#dock'), wsOn = app.classList.contains('dock-open') && !app.classList.contains('instrument-focus');
    const panelOcc = wide && app.classList.contains('panel-open') ? readMetric($('#panel'), 'offsetWidth') + gap : 0;
    const instrOcc = wsOn && ws.classList.contains('side') ? readMetric(ws, 'offsetWidth') + gap : 0;
    const tc = $('#treatCard'), hc = $('#historyCard'), treatOcc = wide && !tc.hidden ? readMetric(tc, 'offsetWidth') + gap : wide && !hc.hidden ? readMetric(hc, 'offsetWidth') + gap : 0;
    const sheet = wsOn && !ws.classList.contains('side') && ws.dataset.state !== 'peek' ? readMetric(ws, 'offsetHeight') + gap : 0;
    // On a phone the instruments sheet rises from the bottom edge, over the vitals dock.
    // (With the thumb dock the sheet sits above the dock instead.)
    // (Over the thumb dock a sheet sits on the tab row's top edge, so a card above it rests on the sheet, not above the whole dock.)
    const nbR = thumb && vdH ? readBox(vd) : null;   // (the dock's box, 4 Nov: cards and menus rest on its top edge, not the tab row's)
    const ar = readBox(app), tabOcc = nbR && nbR.height ? ar.bottom - nbR.top + 8 : 0;
    const bot = isPhone() && sheet && !thumb ? Math.max(vdock + gap, sheet) : tabOcc && sheet ? tabOcc + sheet : vdock + gap + sheet;
    // The patient chart is a bottom sheet on a phone, over the dock: the corner credit rides above it, unless the
    // sheet is so tall (nearly full screen) that there is no figure left to ride on.
    const pn = $('#panel'), lift = isPhone() && panelShown() && readMetric(pn, 'offsetParent') ? readMetric(readMetric(pn, 'offsetParent'), 'clientHeight') - readMetric(pn, 'offsetTop') + 8 : 0;
    const tall = !!readMetric(pn, 'offsetParent') && lift > 0 && readMetric(readMetric(pn, 'offsetParent'), 'clientHeight') - lift < tbH + 48;
    const vars = {
      '--top-safe': px(tbH), '--vdock-h': px(vdock), '--vdock-top': px(readMetric(vd, 'offsetHeight') ? vdTop : 0),
      '--panel-occ': px(panelOcc), '--instr-occ': px(instrOcc), '--right-occ': px(panelOcc + instrOcc + treatOcc), '--bot-occ': px(bot),
      '--panel-h': px(tall || !lift ? 0 : lift + 4), '--panel-cover': tall ? '1' : '0',
    };
    let changed = false;
    for (const k in vars) if (pubVals[k] !== vars[k]) { pubVals[k] = vars[k]; app.style.setProperty(k, vars[k]); changed = true; }
    // (A phone's menu sheets open above the thumb dock, 8 px clear of its top edge like the cards. Measured from the
    // screen's bottom, since the sheets are fixed to it and the dock sits above the home indicator's safe area.)
    // The cards and sheets rest 8 px above the dock's top edge (the play bar, the timeline, the readouts and the tab row stay
    // up and live; only the view pill steps aside) and slide away behind the dock: --nb-occ (= --sheet-foot) from the app's
    // bottom (the cards), --thumb-occ from the screen's (the menu sheets).
    const nbOcc = px(tabOcc);
    if (pubVals.nbOcc !== nbOcc) { pubVals.nbOcc = nbOcc; app.style.setProperty('--nb-occ', nbOcc); app.style.setProperty('--sheet-foot', nbOcc); }
    const occ = px(nbR && nbR.height ? innerHeight - nbR.top + 8 : 0);
    setDockTop(nbR && nbR.height ? nbR.top : null);   // (the one sheet layer and the menus' GPU glass are cut on this line: sheet-layer.js)
    if (pubVals.occ !== occ) { pubVals.occ = occ; document.documentElement.style.setProperty('--thumb-occ', occ); document.documentElement.style.setProperty('--sheet-foot-screen', occ); }
    // (and the top bar's foot, so a tall sheet stops under the view switch and leaves it in reach)
    const topOcc = px(thumb ? readBox(tb).bottom : 0);
    if (pubVals.topOcc !== topOcc) { pubVals.topOcc = topOcc; document.documentElement.style.setProperty('--thumb-top', topOcc); }
    const sig = `${appClass()}|${tb.className}|${tb.dataset.fit}`;
    if (changed || sig !== pubSig) { pubSig = sig; dispatchEvent(new Event('pps:occ')); }
  };
  const pubVals = {};
  let pubSig = '';
  // (Published in a task of its own once a change has been laid out, never in a frame: its reads then find the page laid out
  // already, and nothing it measures runs in a frame or under a moving finger. geom.js restTask.)
  const soon = () => restTask(publish);
  const ro = new ResizeObserver(soon);
  for (const id of ['#topbar', '#vdock', '#dock', '#panel', '#treatCard', '.tb-id', '.top-right', '.topbar .sb-right', '#viewSeg']) ro.observe($(id));
  // (Not for stage-busy, the floating pieces' fade while the figure moves: it changes only their opacity. Announced, every
  // card, the credit, the labels' blockers and the framing were measured and placed again as the menus faded back in, a
  // beat after each pan or pinch, and the figure hitched (Mohammad, 21 Oct: "the hitch syncs with the menu fading back in").)
  let appCls = appClass();
  new MutationObserver(() => { const c = appClass(); if (c !== appCls) { appCls = c; soon(); } }).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(soon).observe($('#treatCard'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(soon).observe($('#historyCard'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(soon).observe($('#dock'), { attributes: true, attributeFilter: ['class', 'data-state'] });
  addEventListener('resize', soon);
  // The corner credit finds a free spot on the figure (src/ui/credit.js).
  creditPlacer = createCreditPlacer($('.stage-credit'), { keptStyle: (el) => stage.keptStyle(el) });
  publish();
  panelSheet = sheetBehaviour($('#panel'), { handle: h('button', { class: 'panel-grab', 'aria-label': 'Resize the patient chart' }), drag: '.panel-head', anywhere: true, onClose: closePanel });
  treatSheet = sheetBehaviour($('#treatCard'), { handle: h('button', { class: 'sheet-grab', 'aria-label': 'Resize the Treat card' }), drag: '.tc-head', anywhere: true, onClose: closeTreat, fit: '.tc-body' });
  dockSheet = sheetBehaviour($('#dock'), { handle: h('button', { class: 'sheet-grab', 'aria-label': 'Resize the Tests card' }), drag: '.dock-head', anywhere: true, onClose: () => dock.close(), grow: true, active: () => isPhone() && !$('#dock').classList.contains('side') && !app.classList.contains('instrument-focus') });
  sheetGlass();
  toastGlass();
  chromeGlass();
  initMenuGlass(stage?.glass);
  whyGlass();
  // Focus: dragging, pinching or scrolling the figure fades the floating pieces until it stops.
  let busyT = 0, armT = 0, down = null, moved = false;
  // (Adding a class it already has still counts as a change to the page's observers: every pointer move of a drag or
  // pinch woke four of them and laid the page out again, review #31. So the class is added only when it is missing.)
  // The pieces dim only once the figure has moved for BUSY_DELAY (premium-feel R7): a tap, or a drag that is over inside it, dims nothing.
  const BUSY_DELAY = 120;
  const busyOff = () => { clearTimeout(armT); armT = 0; classSoon(app, 'stage-busy', false); };
  const busyArmed = () => { armT = 0; if (!app.classList.contains('stage-busy')) classSoon(app, 'stage-busy', true); };
  const busy = (ms) => {
    clearTimeout(busyT); busyT = setTimeout(busyOff, ms);
    if (!armT && !app.classList.contains('stage-busy')) armT = setTimeout(busyArmed, BUSY_DELAY);
  };
  // A gesture over: the pieces already dimmed stay so for ms more; ones still waiting to dim never do.
  const busyEnd = (ms) => { if (app.classList.contains('stage-busy')) busy(ms); else { clearTimeout(armT); armT = 0; clearTimeout(busyT); } };
  // On a phone the same gestures also give the figure more room: the vitals dock folds to a small pill in the
  // lower-left corner (play and clock; the zoom buttons take the lower right) and the top bar's second row (view, colour legend) slides away, while the figure moves and
  // for three seconds after. A tap anywhere, or an event on the timeline, brings them back at once.
  let focusT = 0;
  let focused = false;   // (the class itself is put on and taken off between frames, class-soon.js: this holds the state meanwhile)
  const unfocus = () => { clearTimeout(focusT); if (!focused) return; focused = false; classSoon(app, 'figure-focus', false); foldSoon(false); };
  const figureFocus = (ms) => {
    clearTimeout(focusT);
    // (The thumb dock stays put: its tab row is how the tools are reached, and it is slim already.)
    if (!isPhone() || app.classList.contains('thumb') || $('#strip').classList.contains('all') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!focused) { focused = true; classSoon(app, 'figure-focus', true); }
    foldSoon(true);
    if (ms) focusT = setTimeout(unfocus, ms);
  };
  // The dock folds to one line and opens again as an ease, never a jump: its old content fades out, the box takes its new size at
  // once (laid out once, so the framing and the cards read the settled size straight away) and its glass glides there from the
  // old size by transform (plate-glide.js: nine pieces of one plate slide and stretch, bottom left corner still) while the new
  // content fades in. Nothing is measured by the fold itself: the sizes come from the bar's ResizeObserver (geom.js).
  // The zoom pill grows and folds by transform when a button comes or goes (the circuit's turn upright): plate-glide.js glideOnResize.
  { const zp = document.getElementById('zoomPill'); if (zp) glideOnResize(zp, { R: parseFloat(readStyle(zp).borderTopLeftRadius) || 16 }); }
  const vdockEl = $('#vdock');
  const vdockPlate = vdockEl ? platePieces(vdockEl) : null;   // (its glass's pieces, put in once here: a fold that starts in a frame adds nothing to the page)
  let foldTok = 0, foldAnims = [], foldGoal = false, foldEnd = null;
  watchSize(vdockEl, () => {});   // (keeps sizeOf(vdockEl) current)
  const foldDone = (tok) => { if (tok !== foldTok) return; foldAnims = []; soon(); };
  // The bar's size once the browser has laid out a change (the observer reports it before that frame is painted).
  const sizeAfter = () => new Promise((ok) => {
    const ro = new ResizeObserver((es) => { ro.disconnect(); const bb = es[0]?.borderBoxSize?.[0]; ok(bb ? { w: bb.inlineSize, h: bb.blockSize } : null); });
    ro.observe(vdockEl);
  });
  let shown = 1;   // (how much of the dock's content shows: 1 at rest, 0 once faded for a fold)
  // (The fold starts in a task of its own, never inside the gesture's move that asked for it: it begins by fading the content out, so one task's wait shows nothing.)
  const foldOn = () => foldDock(true), foldOff = () => foldDock(false);
  const foldSoon = (on) => runSoon(on ? foldOn : foldOff);
  const foldDock = async (on) => {
    if (on === foldGoal) return;
    foldGoal = on;
    const kids = [...vdockEl.children].filter((k) => !k.classList.contains('pg-piece')), tok = ++foldTok;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !vdockEl.animate;
    const s0 = sizeOf(vdockEl);
    foldAnims.forEach((a) => a.cancel());
    foldAnims = [];
    if (reduced || !s0?.h) { foldEnd?.(); vdockEl.classList.toggle('mini', on); shown = 1; foldDone(tok); return; }
    if (vdockEl.classList.contains('mini') === on) {   // changed its mind before the old content was gone: fade it back
      foldAnims = kids.map((k) => k.animate([{ opacity: shown }, { opacity: 1 }], { duration: D_FLIP, easing: EASE_ARRIVE }));
      shown = 1;
      Promise.all(foldAnims.map((a) => a.finished.catch(() => {}))).then(() => foldDone(tok));
      return;
    }
    const out = kids.map((k) => k.animate([{ opacity: shown }, { opacity: 0 }], { duration: Math.round(D_FLIP * shown) || 1, easing: EASE_IN, fill: 'forwards' }));
    foldAnims = [...out];
    await Promise.all(out.map((a) => a.finished.catch(() => {})));
    if (tok !== foldTok) return;
    shown = 0;
    // (The glass as it is drawn now: the last glide's pieces, if one is still under way, end where the box stands.)
    foldEnd?.();
    const from = sizeOf(vdockEl) || s0;
    const next = sizeAfter();
    vdockEl.classList.toggle('mini', on);
    const s1 = await next;
    if (tok !== foldTok) { foldAnims.forEach((a) => a.cancel()); return; }
    foldAnims.forEach((a) => a.cancel());
    // (Bottom left corner still: in the new box the old one stood from its left edge, its foot on the new one's.)
    if (s1 && (Math.abs(s1.w - from.w) > 0.5 || Math.abs(s1.h - from.h) > 0.5)) {
      foldEnd = glidePlateOn(vdockEl, vdockPlate, { x: 0, y: s1.h - from.h, w: from.w, h: from.h }, { x: 0, y: 0, w: s1.w, h: s1.h }, { R: 16, done: () => { foldEnd = null; } });
    }
    // (The new words come in as the glass is nearly there, so they never show past it.)
    foldAnims = kids.map((k) => k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, delay: D_FLIP, easing: EASE_ARRIVE, fill: 'backwards' }));
    shown = 1;
    Promise.all(foldAnims.map((a) => a.finished.catch(() => {}))).then(() => foldDone(tok));
  };
  // Only the figure itself: a swipe on a card (or one from the phone's edge) leaves the rest alone.
  view.addEventListener('pointerdown', (e) => { down = systemEdge(e) || e.target.closest?.('.stage-blocker, .zoom-pill, button, input, select') ? null : [e.clientX, e.clientY]; moved = false; });
  view.addEventListener('pointermove', (e) => { if (down && e.buttons && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) { busy(5000); moved = true; figureFocus(0); } });
  addEventListener('pointerup', () => { if (down) { down = null; busyEnd(600); if (moved) figureFocus(3000); else unfocus(); } });
  addEventListener('pointercancel', () => { if (down) { down = null; busyEnd(300); if (moved) figureFocus(3000); } });
  view.addEventListener('wheel', () => { busy(800); figureFocus(3000); }, { passive: true });
  $('#vdock').addEventListener('pointerdown', (e) => { if (!(vdockEl.classList.contains('mini') && e.target.closest('.play'))) unfocus(); });   // (play and pause work from the folded pill without opening it)
  $('#topbar').addEventListener('pointerdown', unfocus);
}
// Phone: the chart and Treat are bottom sheets with three heights; a drag on the handle (or the
// head) moves between them, and below the lowest closes the sheet. Wider: the head drags the card
// aside, and it returns to its place when it closes.
// fit: the scrolling body's selector; at the middle stop the sheet is only as tall as its content.
// Over the thumb dock (an upright phone) a sheet has two heights, Half and Full, as shares of the room between the
// top bar and the dock: the release is measured against that same room, so it lands where the finger left it.
// No visible grabber over the thumb dock: a drag from anywhere moves the sheet (a tap on a tab still picks it); the hidden button toggles them from the keyboard.
const tabletMQ = matchMedia(TABLET_UP_MQ);
// The phone's Details, Treat and Tests sheets wear frosted GPU glass, like every card (Mohammad, 2 Nov 2026, "CARDS ARE GLASS"): each
// sheet's paper (its plate, sheet-move.js) is drawn by the cards' glass in the figure's canvas (stage.cardGlass, glass-gl.js), following
// the plate's slide from its translate and its eases, never a read in a frame. It is cut at the sheet's still foot (cut: the sheet's box, read with the
// glass's other boxes when the page is read, not in each frame), as the sheet's own clip cuts what slides below it on the page. Where the figure's canvas cannot take it, the plate keeps its paper (app.css).
const SHEETS = ['#panel', '#treatCard', '#dock', '.action-card'];   // (the vessel card's plate is on the glass only while it is docked: a phone's card)
let sheetGL = null;
function sheetGlass() {
  if (sheetGL) return;
  const els = SHEETS.map((q) => $(q)).filter(Boolean);
  if (!els.length) return;
  const plates = () => els.filter((el) => !el.hidden && el.classList.contains('has-plate') && (!el.classList.contains('action-card') || el.classList.contains('docked'))).map((el) => el.querySelector(':scope > .sheet-plate')).filter(Boolean);
  // (glass.add asks again by itself while the figure's canvas is not made yet.)
  sheetGL = stage?.glass?.add(plates, { watch: els, before: els[0], cut: (g) => { const el = g.parentElement; const b = el && readBox(el); return b ? { bottom: b.bottom } : null; } }) || null;
}
// The toasts wear the same frosted GPU glass (Mohammad, 3 Nov 2026: "100% GPU", "CARDS ARE GLASS"): each card's tint, edge and shadow are drawn
// in the figure's canvas, the words and buttons by the toast's own GPU picture (toast-gl.js). The card's box is read like any card's, and
// it follows its slide and fade as the others do.
let toastGL = null;
function toastGlass() {
  if (toastGL) return;
  const wrap = $('#toasts');
  if (!wrap) return;
  toastGL = stage?.glass?.add(() => TOASTS, { watch: wrap, before: wrap }) || null;
}
// The figure's own chrome wears the same frosted GPU glass (Mohammad, 4 Nov 2026, "Use the glass for all the menus", "Including UI elements", "Like timeline
// and stuff"): the top bar's pills (the patient, the view switcher, the Blood/Layers/colour key pill, Treat/Tests/History/Settings/Search), the zoom
// controls, the bottom dock (timeline, play, speed and readouts) and the view switcher folded into it, and the sinusoid's legend. Each pill's frost is
// drawn in the figure's canvas under it (stage.glass.add), tinted with --frost; its words, buttons, ring and shadow stay the page's. Where the canvas
// cannot take it (no region yet, the GPU lost, Blur effect off) the pill keeps its --glass fill (app.css), never a CSS blur.
const CHROME = ['.topbar .tb-face:not([data-ghost])', '.topbar .float-pill:not(.has-face):not(.tb-id)', '.topbar #viewSeg', '.topbar .lens-btn:not(.sb-right > .lens-btn)', '.zoom-pill', '.vdock', '.nb-views > .vp-face', '.sv-legend'].join(', ');
let chromeGL = null;
function chromeGlass() {
  if (chromeGL) return;
  const roots = ['#topbar', '#vdock', '#zoomPill'].map((q) => $(q)).filter(Boolean);
  if (!roots.length) return;
  const list = [];
  let at = -1e9;
  // (Not #stageView: its labels and layers write styles every frame, each one a measure of every glass.)
  // (The set changes only when a pill is made or goes (a face is added, the legend comes with the lobule): looked up twice a second, not in each frame.)
  const live = () => { const t = performance.now(); if (t - at > 500) { at = t; list.length = 0; for (const el of document.querySelectorAll(CHROME)) list.push(el); } return list; };
  chromeGL = stage?.glass?.add(live, { watch: roots, before: roots[0], tint: (_g, cs) => cs.getPropertyValue('--frost') }) || null;
}
import { sheetBehaviour } from './dock-sheet.js';
// ── The thumb dock (15 Oct) ─────────────────────────
// A phone, or a tablet held upright, in Patients: the top keeps only the patient (left) and the Colored-by key
// (right), and Treat, Tests, History, Layers and Settings sit in a tab row at the foot of the dock, under the play bar,
// in reach of a thumb. The sheets open above the dock, so the tab row and HVPG and PPG never move or hide.
// Off a phone and an upright tablet (Mac, iPad landscape, a phone sideways) nothing changes.
// An iPhone opened from the Home Screen has no browser bars: class `iphone-app` lets the phone's teaching card sit at the screen's edge
// with the screen's own bottom corners (styles/app.css, --pz-sb). Safari keeps the card above its bar as before.
const appMQ = matchMedia('(display-mode: standalone)');
const syncIphoneApp = () => document.documentElement.classList.toggle('iphone-app', /iPhone|iPod/.test(navigator.userAgent) && (appMQ.matches || navigator.standalone === true));
syncIphoneApp(); appMQ.addEventListener?.('change', syncIphoneApp);
const thumbMQ = matchMedia('(max-width: 1100px) and (orientation: portrait)');
const thumbOn = () => thumbMQ.matches && !app.classList.contains('presenting');
function syncThumb() {
  const on = thumbOn();
  if (app.classList.contains('thumb') !== on) app.classList.toggle('thumb', on);
  document.documentElement.classList.toggle('thumb-ui', on);   // (the menus and sheets live outside #app)
  // The view switch is its own centred pill just above the play bar, on every screen (16 Oct, Mohammad: "detached from the
  // timeline ... slightly above it as a pill and centered"), the sinusoid view included, which keeps the bar (2 Nov, Mohammad:
  // "keep the timeline even in sinusoid view"). While presenting it stays in the top bar.
  const pres = app.classList.contains('presenting');
  const seg = $('#viewSeg'), home = pres ? $('#stageTop .sb-left') : $('#nbViews');
  if (home && seg.parentElement !== home) { if (pres) stopFold(); home.append(seg); }
}
const pillHome = () => { const b = $('#viewSeg')?.parentElement; return b && b.id === 'nbViews' && readMetric(b, 'offsetWidth') ? b : null; };
// One change of the pill's buttons: kind 'in' / 'out' (into or out of the sinusoid: Anatomy and Circuit fold into the pill or back
// out of it), 'down' / 'up' (into or out of the lobule: the Sinusoid button slides out of the pill or back into it, 17 Oct, Mohammad:
// it "should slide out not just appear snap"). What the pill draws is read first, then the buttons change, then the fold plays from
// there to where it now rests (pill-motion.js FOLD_MS). The sinusoid view keeps the dock, its timeline and readouts, where they are
// (2 Nov, Mohammad), so nothing else moves: the pill stays in its home above the dock.
function pillChange(change) {
  const seg = $('#viewSeg'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box0 = pillHome(), before = reduce || !box0 ? null : pillState(seg, box0);
  change();
  syncThumb();
  const box1 = pillHome();
  if (before && box1) foldPill(seg, box1, before);
  else stopFold();
}
function wireThumbBar() {
  const tab = (id, ic, label, onclick) => h('button', { class: 'nb-tab', type: 'button', 'data-tab': id, onclick }, svgIcon(ic), h('span', { class: 'nb-l' }, label));
  // One card or menu at a time above the dock: a tab first puts away whatever else is open (it plays its way out,
  // and the new one comes in once it has gone), and a second tap on the same tab closes its own.
  const clear = (keep) => {
    closePopover();
    if (store.get().selection) store.set({ selection: null });   // (a vessel's or organ's card goes too)
    if (keep !== 'treat') closeTreat();
    if (keep !== 'tests' && app.classList.contains('dock-open')) setPanelTab('chart');
    if (panelShown()) closePanel();
  };
  // (Treat, Tests and Layers belong to the lobule and the anatomy: from the sinusoid view, which keeps the dock, 2 Nov, they first go
  // back out to the lobule, and open there. History and Settings open over the sinusoid itself.)
  const outOfSin = () => { if (store.get().sinusoid) store.set({ sinusoid: false }); };
  const treat = tab('treat', 'pill', 'Treat', () => { outOfSin(); if (!treatOpen()) clear('treat'); $('#btnTreat').click(); });
  const tests = tab('tests', 'gauge', 'Tests', () => { outOfSin(); if (!app.classList.contains('dock-open')) clear('tests'); $('#tabInstruments').click(); });
  const menuTab = (open) => (e) => { const a = e.currentTarget; if (a.getAttribute('aria-expanded') !== 'true') clear(); open(a); };
  const badge = h('span', { class: 'nb-badge', 'aria-hidden': 'true' });
  const hist = tab('history', 'clock', 'History', menuTab((a) => timeline.openHistory(a)));
  hist.append(badge);
  const layers = tab('layers', 'layers', 'Layers', menuTab((a) => { outOfSin(); openLayersMenu(a); }));
  const more = tab('settings', 'gear', 'Settings', menuTab((a) => openSettings(a, true)));
  for (const b of [hist, layers, more]) b.setAttribute('aria-haspopup', 'dialog');
  $('#vdock').prepend(h('div', { class: 'nb-views', id: 'nbViews', 'data-safe': 'bottom', 'data-safe-pad': '12' }, h('span', { class: 'vp-face', 'aria-hidden': 'true' })));
  $('#vdock').append(h('nav', { class: 'thumb-bar', id: 'thumbBar', 'aria-label': 'Patient tools' }, treat, tests, hist, layers, more));
  // The tabs follow the cards they open (and History's count), however those were opened or closed.
  const sync = () => {
    const t = String(treatOpen()), i = String(app.classList.contains('dock-open'));
    if (treat.getAttribute('aria-pressed') !== t) treat.setAttribute('aria-pressed', t);
    if (tests.getAttribute('aria-pressed') !== i) tests.setAttribute('aria-pressed', i);
    const n = $('#timeline .tl-hc')?.textContent || '';
    if (badge.textContent !== n) badge.textContent = n;
    const tb = $('#btnHistory .tb-hc');
    if (tb && tb.textContent !== n) tb.textContent = n;
  };
  new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe($('#treatCard'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(sync).observe($('#timeline'), { subtree: true, characterData: true, childList: true });
  thumbMQ.addEventListener?.('change', (e) => {
    syncThumb();
    closePopover(); why?.close();   // (a menu or Why? placed for the other turn has lost its button: put away, as iOS puts a popover away on a turn)
    if (!e.matches) return;
    // Upright has room for one sheet, as openPanel and openTreat keep it: History has no sheet there; then Treat, Details, Tests.
    closeHistory();
    if (treatOpen()) { closePanel(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
    else if (panelShown() && app.classList.contains('dock-open')) setPanelTab('chart');
  });
  syncThumb(); sync();
}
// Layers: Fit and the circuit's turn upright, then what is drawn on the figure (the moving blood and what it shows, or the
// lobule's layers). The view switch itself stays in the top bar, one tap away (15 Oct, Mohammad). Fitting or turning
// closes the menu, so the figure is seen moving; the layers switch in place.
function openLayersMenu(anchor) {
  const act = (fn) => () => { closePopover(); fn(); };
  const st = store.get(), circuit = !st.lobule && st.view === 'circuit';
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Layers'),
    menuItem('Fit to screen', { icon: 'fit', onClick: act(() => $('#zoomFit').click()) }),
    circuit ? menuItem('Turn upright', { icon: 'rotate', checked: stage.circuitRotated(), onClick: act(() => $('#rotateCircuit').click()) }) : null,
    h('div', { class: 'menu-sep' }),
    ...(st.lobule ? lobuleLayerItems() : bloodItems())],
  { cls: 'blood-pop layers-pop', place: 'above', align: 'center' });
}
// ── Treat card ──────────────────────────────────────
let treatOff = null;
let runningN = 0, runningText = '';   // (the Treat card's "<n> running", as last made)
const treatOpen = () => !$('#treatCard').hidden;
function openTreat() {
  closeHistory();
  const el = $('#treatCard');
  if (isPhone()) { closePanel(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
  else giveWay('treat');
  closePopover();
  const sync = [];
  const count = h('span', { class: 'card-meta' });
  const paintCount = () => {
    const n = chart.treatCount(store.get().params);
    if (n && n !== runningN) { runningN = n; runningText = `${n} running`; }   // alloc-rare: the text is made only when the number of treatments running changes
    count.textContent = n ? runningText : '';
  };
  sync.push(paintCount);
  const [tabs, pane] = chart.treatBody(sync, () => {});
  const body = h('div', { class: 'tc-body' }, pane, chart.treatChanges(sync));
  const grab = el.querySelector('.sheet-grab'), plate = el.querySelector(':scope > .sheet-plate');   // (the plate stays: put in once at setup, sheetParts; dropped, the sheet had no paper and the bar and pill showed through it)
  el.replaceChildren(...[plate, grab, h('div', { class: 'tc-head card-head' }, h('h2', { class: 'card-title' }, h('span', {}, 'Treat')), count,
    h('button', { class: 'ib card-close', 'aria-label': 'Close Treat', title: 'Close (Esc)', onclick: () => closeTreat({ focus: true }) }, icon('close'))), tabs, body].filter(Boolean));
  paintCount();
  treatOff?.();
  treatOff = store.on('params', () => { for (const fn of sync) fn(); });
  arrive(el);
  el.hidden = false;
  treatSheet?.open();
  $('#btnTreat').setAttribute('aria-expanded', 'true');
  refitStage();
  nextFrame(stageRelayout);
}
// Presenter puts every card, sheet and menu away (each fades out) and hands back a function that reopens them on exit.
function stashCards() {
  const was = { panel: panelShown(), treat: !$('#treatCard').hidden, dock: app.classList.contains('dock-open') };
  closePopover(); why?.close(); closeTreat(); closeHistory(); closePanel(); if (was.dock) setPanelTab('chart');
  return () => { if (was.panel) openPanel(); if (was.dock) openPanel('instruments'); if (was.treat) openTreat(); };
}
function closeTreat(opts) {
  const focus = opts?.focus;
  const el = $('#treatCard');
  if (el.hidden) return;
  if (focus) giveFocusBack(el, $('#btnTreat'));
  leave(el);
  el.hidden = true;
  treatOff?.(); treatOff = null;
  treatSheet?.closed();
  $('#btnTreat').setAttribute('aria-expanded', 'false');
  refitStage();
  nextFrame(stageRelayout);
}
// ── History card (Mac and iPad landscape) ───────────
// Every change and event, with a way back to each: the same list as the phone's History sheet, as a card in Treat's
// place on the right (one or the other), kept current while it is open.
let historyOff = null, historyPaint = null;
const historyOpen = () => !$('#historyCard').hidden;
function openHistory() {
  closeTreat(); closePopover();
  giveWay('treat');
  const el = $('#historyCard');
  const body = h('div', { class: 'tc-body' });
  // (The list is updated in place: a new entry rises in at the top, the rest stay put, P18.)
  const paint = () => {
    const next = timeline.historyBody(), cur = body.firstElementChild;
    if (cur?.classList.contains('tl-history')) reconcile(cur, [...next.children]); else body.replaceChildren(next);
  };
  el.replaceChildren(h('div', { class: 'tc-head card-head' }, h('h2', { class: 'card-title' }, h('span', {}, 'History')),
    h('button', { class: 'ib card-close', 'aria-label': 'Close History', title: 'Close (Esc)', onclick: () => closeHistory({ focus: true }) }, icon('close'))), body);
  paint();
  // (A change or an event adds a row; the count beside the button moves with every entry, including a finished snapshot.)
  // (2 Nov 2026: painted between frames (rest-pass.js), not in the observer's microtask: reconcile reads the rows' boxes.)
  let paintAsk = 0;
  const paintRest = () => { paintAsk = 0; if (historyOpen()) paint(); };
  const mo = new MutationObserver(() => { if (!paintAsk) paintAsk = restPass(paintRest); });
  mo.observe($('#timeline .tl-hc'), { characterData: true, childList: true, subtree: true });
  if (!historyPaint) timeline.onChange(() => historyPaint?.());   // (registered once; it paints whichever card is open)
  historyPaint = paint;
  historyOff = () => { mo.disconnect(); historyPaint = NOOP; };
  arrive(el);
  el.hidden = false;
  $('#btnHistory').setAttribute('aria-expanded', 'true');
  refitStage();
}
function closeHistory(opts) {
  const focus = opts?.focus;
  const el = $('#historyCard');
  if (el.hidden) return;
  if (focus) giveFocusBack(el, $('#btnHistory'));
  leave(el);
  el.hidden = true;
  historyOff?.(); historyOff = null;
  $('#btnHistory').setAttribute('aria-expanded', 'false');
  refitStage();
  nextFrame(stageRelayout);
}

// ── Modes ───────────────────────────────────────────
const FOCUS_NULL = { focus: null }, EXPLORE_RESET = { hiddenReadouts: null, hiddenEvents: null, imaging: false, found: null }, SELECTION_NULL = { selection: null, details: null };   // (store.set patches: read, never kept)
function onMode(mode) {
  store.set(FOCUS_NULL);
  if (mode === 'explore') { store.set(EXPLORE_RESET); if (store.get().tool !== 'select') setTool(); }
  store.set(SELECTION_NULL);
  inspector.render();
  renderPaintHint(); renderBanner(); renderLegend();
  setPanelTab('chart');
}

// ── Keyboard (§8.5) ─────────────────────────────────
// The letter a key stands for: its character where that is a Latin letter, else its place on the board (an Arabic or Russian layout has no A, L or Z
// to name, but the key in that place is the same one).
// (Only a letter of another script falls back to its place: on a Dvorak or Colemak board the key that makes ; sits where Z is, and ; is not Z.)
const letterOf = (e) => /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : /^\p{L}$/u.test(e.key || '') && /^Key[A-Z]$/.test(e.code || '') ? e.code[3].toLowerCase() : (e.key || '').toLowerCase();
// Inputs that are controls, not text: a slider, a switch, a button. They keep their own keys (the arrows, Space) and leave the rest to the page.
const NON_TEXT_INPUT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'file']);
function wireKeyboard() {
  // (iOS Safari draws a control's :active press only once the page listens for touches: an empty passive listener, nothing else.)
  addEventListener('touchstart', () => {}, { passive: true });
  // J injects dye for as long as it is held (at least a few seconds).
  addEventListener('keyup', (e) => { if (letterOf(e) === 'j') stage.releaseDye(); });
  addEventListener('blur', () => stage.releaseDye());
  addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;   // (an input method is composing: its Enter and Esc are its own)
    const tag = (e.target.tagName || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.isOpen() ? palette.close() : palette.open(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !presenter.active() && !isModalOpen() && !mainMenu.isOpen()) {   // (in a dialog the browser's own zoom is the text's)
      const z = e.key === '=' || e.key === '+' ? 'in' : e.key === '-' || e.key === '_' ? 'out' : e.key === '0' ? 'fit' : null;
      if (z) { e.preventDefault(); if (z === 'in') stage.zoomIn(); else if (z === 'out') stage.zoomOut(); else stage.fit(); return; }
    }
    const inputType = tag === 'input' ? (e.target.type || 'text') : '';
    if (tag === 'select' || tag === 'textarea' || e.target.isContentEditable || (tag === 'input' && !NON_TEXT_INPUT.has(inputType))) {
      // (A dialog's one-line field, a name or a link, cancels its dialog with Esc as the old prompt did; a longer text box blurs first.)
      if (e.key === 'Escape') { if (tag === 'input' && isModalOpen() && e.target.closest?.('#modalBack')) { e.preventDefault(); closeModal(); } else e.target.blur(); }
      return;
    }
    // A slider or a switch left with focus (Chrome keeps it after a click or a drag) keeps the keys it uses; the rest, Cmd Z, Space, the letters, are the page's.
    if (tag === 'input' && (inputType === 'range' ? /^(Arrow(Left|Right|Up|Down)|Home|End|Page(Up|Down))$/ : /^(Arrow(Left|Right|Up|Down)| |Enter)$/).test(e.key)) return;
    // Search open with focus on one of its results: Esc closes it, and no letter reaches the figure behind it.
    if (palette.isOpen()) { if (e.key === 'Escape') { e.preventDefault(); palette.close(); } return; }
    if (e.key === 'Escape') {
      // One Esc closes one thing: an open menu first, and only the menu (review #24).
      if (popoverOpen()) { closePopover(); return; }
      if (isModalOpen()) closeModal();
      else if (mainMenu.isOpen()) mainMenu.close();
      else if (projector) toggleProjector(false);
      else if (app.classList.contains('instrument-focus')) dock.setState('open');
      else if (treatOpen()) closeTreat({ focus: true });
      else if (historyOpen()) closeHistory({ focus: true });
      else if (stage.isShunting()) stage.cancelShunt();
      else if (store.get().tool !== 'select') setTool('select');
      else if (app.classList.contains('dock-open') && dock) dock.close();   // Tests (it hands focus back to its tab)
      else if (store.get().sinusoid && !store.get().selection) store.set({ sinusoid: false });
      else if (panelShown() && !store.get().selection) closePanel({ focus: true });   // the patient chart (its close button says Esc)
      else store.set({ selection: null });
      return;
    }
    if (isModalOpen() || mainMenu.isOpen()) return;
    // A talk owns the keyboard (presenter.js onKey takes its own keys): undo, speed, view, lens, dye, settle and the rest would change the
    // slide's scripted model under it, and nothing puts it back. Search (/) and the guide (?) stay.
    if (presenter.active() && e.key !== '/' && e.key !== '?') return;
    if (e.key === '/') { e.preventDefault(); palette.open(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? doRedo : doUndo)(); return; }
    // (A held key is one press: Space does not flicker play and pause, a number does not run its verb twenty times. J has its own rule below.)
    // (The figure's item in focus and a label act on Space themselves; a button the keyboard reached does too, one that was clicked does not. A held Space is still ours: it must not scroll the panel behind.)
    const spaceIsOurs = e.key === ' ' && !e.altKey && !controlOwnsKey(e.target, ' ') && !e.target.closest?.('.lb') && !(e.target.id === 'stage' && stage?.keyItem?.());
    if (e.repeat && !(e.ctrlKey || e.metaKey) && letterOf(e) !== 'j') { if (spaceIsOurs) e.preventDefault(); return; }
    // (The speed keys [ and ] need Option on a German, French or Spanish layout: the character they make is the key, so Option alone is no reason to drop them. On Windows the
    // same layouts make them with AltGr, which reports Ctrl and Alt together; AltGr makes other characters too (a Polish ą), and those are not the letter's key.)
    const altGr = !!e.getModifierState?.('AltGraph');
    if (altGr ? e.key !== '[' && e.key !== ']' : e.ctrlKey || e.metaKey || (e.altKey && e.key !== '[' && e.key !== ']')) return;
    if (spaceIsOurs) { e.preventDefault(); host.send({ type: 'run', running: !store.get().running }); return; }
    // With a card open, the number keys run its verbs in order.
    if (/^[1-9]$/.test(e.key) && card.isOpen()) { if (card.trigger(+e.key)) e.preventDefault(); return; }
    if (e.key === '.') { host.send(RUN_ON); setTimeout(runOff, 60); return; }
    if (e.key === '[' || e.key === ']') {
      // One ladder: real-time speeds, then the time-lapse rates.
      const ladder = [...SPEEDS.map((v) => [v, false]), ...LAPSES.map(([d]) => [d, true])];
      const cur = store.get().lapse ? ladder.findIndex(([v, l]) => l && v === store.get().lapse) : ladder.findIndex(([v, l]) => !l && v === store.get().speed);
      const [v, lap] = ladder[Math.max(0, Math.min(ladder.length - 1, (cur < 0 ? 2 : cur) + (e.key === ']' ? 1 : -1)))];
      setSpeed(v, lap);
      toast(lap ? `Time-lapse ${LAPSES.find((l) => l[0] === v)[2]}` : `Speed ${v}×`);
      return;
    }
    const k = letterOf(e);
    if (k === 'a' && !e.shiftKey) { if (store.get().sinusoid) return; store.set({ lobule: false, view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
    if ((k === 'l' || (e.key === 'C' && e.shiftKey)) && !store.get().imaging && !(store.get().lobule && store.get().sinusoid)) {
      const ks = lensKeys(), i = ks.indexOf(store.get().colorMode);
      const next = ks[(i + (e.shiftKey && k === 'l' ? ks.length - 1 : 1)) % ks.length];
      store.set({ colorMode: next }); toast(`Colored by ${LENSES[next][0].toLowerCase()}. ${LENSES[next][1]}.`); return;
    }
    if (k === 'z') { settle(); return; }
    if (e.key === '?') { openHelp(presenter.active() ? 'present' : undefined); return; }
    if (k === 'i') { dock.toggle(); return; }
    if (k === 't') { if (treatOpen()) closeTreat({ focus: true }); else openTreat(); return; }
    if (k === 'p') { timeline.togglePin(); return; }
    if (k === 'j' && !store.get().imaging) { if (!e.repeat) injectDye({ hold: true }); return; }
  });
}

// ── Projector look while presenting (§4.4) ──────────
let projector = false, bigEl = null, exitEl = null;
// The switch crossfades the whole page, as a theme change does (the bars and cards came and went in one frame: P20);
// where View Transitions are missing it switches at once.
// (The state asked for, not a flip: starting a second talk asks "off" for the first and "on" for the second in one task, and the
// crossfade runs both after it; the last ask wins, so the second talk keeps the projector layout. Asked twice before it ran: once.)
let projWant = false;
function toggleProjector(on = !projector) {
  if (on === projWant && on === projector) return;
  projWant = on;
  const go = () => { if (projector !== projWant) flipProjector(); };
  if (!canCrossfade()) { go(); return; }
  crossfade(go);
}
function flipProjector() {
  projector = !projector;
  app.classList.toggle('projector', projector);
  if (projector) {
    bigEl = h('div', { class: 'big-overlay stage-blocker' });
    // The top bar (and its menu) is hidden in projector mode, so the way out is on the figure.
    exitEl = h('button', { class: 'btn projector-exit stage-blocker', title: 'Leave projector mode (Esc)', onclick: () => { if (projector) toggleProjector(false); } }, icon('close'), 'Exit projector');
    view.append(bigEl, exitEl);
    if (!presenter.active()) toast('Projector mode. Press Esc or Exit to leave.');
    const f = store.get().frame; if (f) updateProjector(f);
  } else { bigEl?.remove(); exitEl?.remove(); bigEl = exitEl = null; }
  setTimeout(() => dispatchEvent(new Event('resize')), 50);
}
function updateProjector(f) {
  if (!bigEl) return;
  const hid = hiddenNow()?.has('trueHVPG'), v = hid ? '—' : fmt(f.metrics.hvpg, 1), u = hid ? 'not measured' : 'mmHg';
  // Rebuilt only when it reads differently: new nodes on every model frame restyled the page each time.
  if (bigEl.shown === v + u) return;
  bigEl.shown = v + u;
  bigEl.replaceChildren(h('small', {}, 'HVPG'), v, h('span', { class: 'unit' }, u));
}

// ── Phone & tablet ──────────────────────────────────
// Instruments share space with the figure. A soft vessel hover/click can flag the launcher;
// explicit tools open the workspace without a scrim.
function revealDock(mode) {
  if (app.classList.contains('dock-open')) return;
  if (mode === 'soft') { $('#tabInstruments').classList.add('ping'); return; }
  openPanel('instruments');
}
function wirePanel() {
  $('#tabInstruments').addEventListener('click', () => dock.toggle());
  $('#panelClose').addEventListener('click', () => closePanel({ focus: true }));
  $('#panelScrim').addEventListener('click', () => closePanel());
  setPanelTab('chart');
  syncPanelToggle();
}

// ── Help & first run ────────────────────────────────
// The presenter's keys (src/ui/presenter.js, onKey), for the Guide's "While presenting" block.
const PRESENT_KEYS = [
  ['→ · Space · Enter', 'Next slide (during a time-lapse, run it to its end)'], ['← · Backspace', 'Previous slide'],
  ['↑ · ↓', 'Show / tuck the readings under the instrument card (Mac, iPad on its side)'],
  ['Home · End', 'First / last slide'], ['Number, then Enter', 'Jump to that slide'], ['G', 'The slide list'], ['P', 'Presenter view: notes, next slide and clocks in a second window'],
  ['B or .', 'Black screen'], ['F', 'Full screen'], ['Hold L', 'Spotlight on the pointer (iPad: press and hold)'], ['D · E', 'Pen on / off · erase the pen'], ['?', 'This guide'], ['Esc', 'Put an enlarged card back, then stop presenting'],
];
function openHelp(section) {
  // (Grouped by what a person is doing, so the list reads down a column: run it, change the view, reach and act. Every row is a key the handler takes.)
  const groups = [
    ['Run the model', [['Space', 'Play / pause'], ['[ ]', 'Slower / faster'], ['.', 'Step'], ['Z', 'Settle to equilibrium'], ['Ctrl/⌘ Z', 'Back one change on the timeline (Shift: forward)'],
      ['P', 'Compare from here / stop comparing'], ['J', 'Inject dye (hold for longer)']]],
    ['Change the view', [['A', 'Anatomy ⇄ circuit'], ['L', 'Next vessel coloring (Shift: previous)'], ['I', 'Open / close Tests'], ['T', 'Open / close Treat'],
      ['Ctrl/⌘ + / − / 0', 'Zoom in / out / fit the figure'], ['Ctrl/⌘ K or /', 'Search'], ['?', 'This guide']]],
    ['Reach and act', [['Click', 'Open the actions for a vessel or organ'], ['1 – 9', 'Run an action on the open card'], ['Tab · Enter', 'Reach a vessel, open its actions'],
      ['← →', 'Walk vessels along the flow'], ['Esc', 'Cancel · close the card · close']]],
  ];
  openModal('Guide', h('div', {},
    h('p', { class: 'lede' }, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model. Nothing is scripted: change a resistance and watch the consequences propagate.'),
    h('div', { class: 'entry-grid' },
      [['explore', 'Act on the anatomy', 'Click any vessel or organ. A card opens beside it with what you can do there: narrow or clot a vein, make the liver cirrhotic, band varices, start a shunt.'],
        ['settle', 'One timeline', 'Play runs the heartbeat-scale model; +1 wk, +1 mo and +6 mo jump the disease ahead. Every change is a marker you can go back to, or compare from.'],
        ['bulb', 'Ask “Why?”', 'Click any readout for a causal breakdown of what is driving it, change by change.']].map(([ic, t, d]) => h('div', { class: 'entry' }, h('span', { class: 'eic' }, icon(ic)), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))),
    h('h3', { 'data-sec': 'keys' }, 'Keyboard'),
    ...groups.map(([name, rows]) => h('section', { class: 'keys-g' }, h('h4', {}, name), h('div', { class: 'keys' }, rows.map(([k, v]) => h('div', {}, h('span', {}, v), h('kbd', {}, k)))))),
    h('h3', { 'data-sec': 'present' }, 'While presenting'),
    h('p', { class: 'sub' }, 'A presentation clicker sends the same keys. On a touch screen, swipe sideways on the slide to go on or back.'),
    h('div', { class: 'keys' }, PRESENT_KEYS.map(([k, v]) => h('div', {}, h('span', {}, v), h('kbd', {}, k)))),
    h('h3', {}, 'Reading the figure'),
    h('ul', {},
      h('li', {}, 'Veins are colored by mean pressure on a perceptually uniform scale (0–30 mmHg), and the legend names the unit once. A label gives a station’s value. Select the station, color by Change or compare with an earlier moment to see ▲ / ▼, the change from healthy, shown from 5 mmHg. Arteries are thinner, in a fixed red.'),
      h('li', {}, 'Streaks of blood move downstream, brighter where flow is greater, faster where velocity is higher, fastest along the axis (laminar flow); chevrons (Blood menu) point the way. Smoke marks stagnant blood in a large vein. Coloring the vessels by blood origin shows where blood comes from. Tap a vessel and use Inject dye on its card (or press J; hold for longer) to watch dye travel and split. Dotted vessel outlines are closed potential collaterals.'),
      h('li', {}, 'Line width follows vessel diameter (compressed, so the cavae don’t drown the portal tree). Watch collaterals and varices swell.'),
      h('li', {}, 'The circuit view is a transit map: pressure falls from left to right; collaterals and shunts run in their own lanes as bypasses.')),
    h('h3', {}, 'Thresholds & references'),
    h('p', { class: 'sub' }, 'Baveno VIII consensus on portal hypertension (2026), building on Baveno VII (2022); AASLD guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Thresholds apply to gradients (HVPG, direct portal–systemic gradient), never to the pressure at a single vessel. Physiology after Guyton; Lautt (hepatic arterial buffer response); Bosch & Groszmann (HVPG).'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. The model is simplified and its values are illustrative; do not use it for diagnosis or treatment decisions.')), { wide: true });
  scrollToSection(section);
}
// Help and About open at a named section (Keyboard shortcuts, References).
// (2 Nov 2026: scrolled between frames (rest-pass.js), never inside one: scrollIntoView lays the page out.)
let sectionWant = null;   // (the section to scroll to, as asked last: the scroll is made after the frame, whichever asked)
const sectionNow = () => sectionInView(sectionWant);
const sectionRest = () => restPass(sectionNow);
function scrollToSection(section) { if (section) { sectionWant = section; nextFrame(sectionRest); } }
function sectionInView(section) { scrollInto($(`#modal [data-sec="${section}"]`), { block: 'start' }); }
const pmid = (id) => h('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, target: '_blank', rel: 'noopener' }, `PMID ${id}`);
const CUT_HEADS = ['Readout', 'Normal', 'Borderline', 'Past a threshold', 'High risk'], CUT_SEV = ['', 'ok', 'caution', 'danger', 'critical'];
function openAbout(section) {
  openModal('About the model', h('div', {},
    h('p', {}, 'Created by ', h('b', {}, AUTHOR), '. ', h('a', { href: AUTHOR_URL, target: '_blank', rel: 'noopener' }, 'See all of the author’s teaching\u00a0tools'), '.'),
    h('p', {}, `The model, patients and presentations are dated ${CONTENT_UPDATED} and change only when that date does, so a class taught on them behaves the same all term.`),
    h('h3', {}, 'The model'),
    h('p', {}, 'A lumped-parameter hemodynamic network of the splanchnic, portal, hepatic and systemic veins with the heart, arterial inflow and the hepatic arterial buffer; collateral recruitment and remodeling on a disease clock; Starling filtration and lymph for ascites; Laplace wall stress for varices; blood volume, bleeding and transfusion. Every number on screen comes out of it; nothing is scripted.'),
    h('h3', {}, 'Validation targets'),
    h('p', { class: 'sub' }, 'Each is an automated test that must pass before a release:'),
    h('ol', { class: 'refs' }, VALIDATION.map((v) => h('li', {}, v))),
    h('h3', {}, 'Status colors'),
    h('p', { class: 'sub' }, 'Every readout’s bar and status word follow a clinical cut-off; the ticks on its bar mark the cut-offs below. A change (▲ / ▼) is drawn in neutral ink and appears only when a value keeps moving for several seconds, never for the heartbeat or breathing. Amber is borderline; red means a threshold has been crossed.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'cut-table' },
      h('thead', {}, h('tr', {}, CUT_HEADS.map((x, i) => h('th', {}, i ? h('span', { class: 'cut-h', 'data-sev': CUT_SEV[i] }, x) : x)))),
      // (On a phone each row stacks, its readout over four labelled lines, and an empty band is left out: five columns did not fit and the table scrolled sideways, cut off at the edge.)
      h('tbody', {}, CUTOFFS.map((r) => h('tr', {}, r.map((c, i) => h('td', i ? { 'data-label': CUT_HEADS[i], 'data-sev': CUT_SEV[i], class: c === '—' ? 'none' : '' } : {}, c))))))),
    h('p', { class: 'sub' }, 'Thresholds belong to gradients, not to the color of a vessel. HVPG ≥ 10 mmHg is clinically significant portal hypertension in cirrhosis. HVPG ≥ 20 mmHg matters as a prognostic finding when measured during an acute variceal bleed. 12 mmHg is not a bleeding threshold: varices can bleed below it, and it is only a usual post-TIPS target for the direct gradient.'),
    h('h3', {}, 'Reference review'),
    h('p', {}, 'The presentations follow Baveno VIII (J Hepatol, August 2026), with AASLD guidance where US practice differs (octreotide). Baveno VIII changed the recompensation criteria (>6 months, Child–Pugh A), the gray zone for stiffness (ANTICIPATE probability ≥75%, or spleen stiffness >55 kPa on the 100 Hz probe), the window for pre-emptive TIPS and anticoagulation for portal vein thrombosis. Baveno VIII statements were taken from published summaries; a line-by-line check against the full text is still pending.'),
    h('h3', {}, 'Clinical review'),
    h('p', {}, 'Presentation and patient content follows the guidance below. An external clinical advisory review with named reviewers is pending; their sign-off will be listed here.'),
    h('h3', { 'data-sec': 'refs' }, 'References'),
    h('ol', { class: 'refs' },
      h('li', {}, 'de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74. ', pmid(35120736)),
      h('li', {}, 'Baveno VIII: advancing consensus in portal hypertension. J Hepatol, August 2026. ', pmid(42624290)),
      h('li', {}, 'Kaplan DE, et al. AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis. Hepatology 2024;79:1180–1211.'),
      h('li', {}, 'Bosch J, Groszmann RJ, et al. Measurement of portal pressure (HVPG). Hepatology / Semin Liver Dis.'),
      h('li', {}, 'Prognostic role of endoscopic ultrasound-guided direct portal pressure gradient measurement in porto-sinusoidal vascular disorder. Liver Int 2025. Mean direct gradient 16.7 and mean HVPG 5.5 mmHg. ', pmid(40251984)),
      h('li', {}, 'Directly measured portal pressure gradient and variceal hemorrhage in patients undergoing TIPS: bleeding occurred at <12 mmHg. ', pmid(7485008)),
      h('li', {}, 'Hepatic venous pressure gradient and prognosis in patients with acute variceal bleeding treated with pharmacologic and endoscopic therapy. ', pmid(18093686)),
      h('li', {}, 'Lautt WW. Hepatic Circulation: Physiology and Pathophysiology. Morgan & Claypool, 2009.'),
      h('li', {}, 'Guyton AC. Venous return and the systemic filling pressure.')),
    h('h3', {}, 'Licenses'),
    h('p', { class: 'sub' }, '© 2026 Mohammad Almeqdadi. All rights reserved. Fonts: Inter, JetBrains Mono and Source Serif 4 under the SIL Open Font License, served from this site. Anatomy, pathology art and icons were drawn for this project.'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. Simplified model with illustrative values; not for diagnosis or treatment decisions.')), { wide: true, sub: `Updated ${UPDATED} · ${RELEASE}` });
  scrollToSection(section);
}
function openPrivacy() {
  const keys = (() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('pps.')); } catch { return []; } })();
  openModal('Privacy', h('div', {},
    h('p', {}, 'The simulator runs entirely in your browser. It makes no requests to any other site: no analytics, no trackers, no advertising, no third-party fonts or scripts. There is no account and no server that stores anything about you.'),
    h('p', {}, 'What stays on this device, in your browser’s storage: your preferences (theme) and presenter scripts you create. It leaves the device only when you share it (a link or a script file).'),
    FEEDBACK_EMAIL ? h('p', {}, 'Send feedback (in Settings) opens a draft in your own email app with your device, screen size, how fast the page is running, which blurs the browser is drawing, a short list of recent errors and page reloads, and a link to the view you were on. Nothing is sent unless you send that email yourself.') : null,
    h('p', {}, 'For institutions: no personal data is processed by the publisher, which supports FERPA and GDPR compliance.'),
    h('p', { class: 'sub' }, keys.length ? `Stored now: ${keys.join(', ')}.` : 'Nothing is stored on this device yet.'),
    clearRow(keys)));
}
// "Clear my data on this device" asks in place, in the dialog's own words, not with the browser's box: the button gives way to the
// question and its two answers, and Cancel brings it back.
function clearRow(keys) {
  const row = h('div', { class: 'btn-row' });
  const ask = () => {
    const msg = h('p', { class: 'clear-q', role: 'alert' }, 'Delete everything this simulator has stored on this device?');
    const go = h('button', { class: 'btn danger-fill', onclick: () => { for (const k of keys) { try { localStorage.removeItem(k); } catch (e) { caught('main:2167', e); /* storage unavailable */ } } closeModal(); toast('Your data on this device has been cleared.'); } }, 'Delete it');
    const no = h('button', { class: 'btn', onclick: () => { row.replaceChildren(start); start.focus({ preventScroll: true }); } }, 'Keep it');
    row.replaceChildren(msg, h('div', { class: 'btn-row' }, no, go));
    no.focus({ preventScroll: true });
  };
  const start = h('button', { class: 'btn', onclick: ask }, 'Clear my data on this device');
  row.append(start);
  return row;
}
// Launch goes straight into the simulator, the first time included. Only a deep link
// (?script=, ?preset=, ?home=) opens anything else.
function firstRun() {
  showFirstHint();
}
// The first-run hint: once per device, in the message card under the top bars (never over the bottom bar), until the
// first vessel or organ is picked or the card is dismissed. Its own key, so devices that opened the app before see it once.
// (Not under automation: the browser checks and visual references start from a fresh browser every time.)
const HINT_KEY = 'pps.hint';
function showFirstHint() {
  if (navigator.webdriver) return;
  let seen = true;
  try { seen = !!localStorage.getItem(HINT_KEY); } catch (e) { caught('main:2188', e); /* storage unavailable: no hint */ }
  if (seen) return;
  const show = () => {
    if (store.get().selection || presenter.active()) return;
    const verb = matchMedia('(hover: hover) and (pointer: fine)').matches ? 'Click' : 'Tap';
    let off = null, offTalk = null;
    const done = (why) => { off?.(); off = null; offTalk?.(); offTalk = null; if (why === 'talk') return; try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { caught('main:2194', e); /* storage unavailable */ } };
    const close = toast(`${verb} a vessel or the liver to change it.`, '', { sticky: true, onClose: done });
    off = store.on('selection', (sel) => { if (sel) close(); });
    // A talk beginning takes the hint away with the Explore screen it spoke of (it stayed over the slides, sticky). It is not counted as
    // read: a person who went straight to a talk meets it on their next visit to Explore.
    offTalk = store.on('presenting', (on) => { if (on) close('talk'); });
  };
  if (window.ppsFigureReady) setTimeout(show, 600); else addEventListener('pps:figure-ready', () => setTimeout(show, 600), { once: true });
}
// The feedback ask: after FEEDBACK_ASK_MIN minutes of active use in one visit (the page visible and a touch, click, key or
// scroll within the last minute), a message card asks for feedback, once per device; "Not now" (or dismissing it) asks once
// more on a later visit, then never again. Only the person's own answer counts: a card pushed out by newer messages
// asks again after another FEEDBACK_ASK_MIN active minutes. It waits out a drag, a talk and projector mode, and never pauses the model.
// It also waits while any surface the person is working in is open, on every screen (Tests, a side panel, Treat, History, a menu or a
// dialog): the card stood over the top of Tests on a Mac and an iPad, where only a phone had held it back.
const FEEDBACK_ASK_MIN = 10;
const ASK_KEY = 'pps.feedbackAsk';   // (absent: never asked · 'later': asked once, once more on a later visit · 'done')
function armFeedbackAsk() {
  if (!FEEDBACK_EMAIL || navigator.webdriver) return;
  let was = null;
  try { was = localStorage.getItem(ASK_KEY); } catch { return; }   // (no storage: it could not remember, so it never asks)
  if (was === 'done') return;
  const TICK = 5000, IDLE = 60000;
  let active = 0, lastInput = 0, last = performance.now(), down = 0, timer = 0;
  const input = () => { lastInput = performance.now(); };
  const press = () => { down++; input(); }, lift = () => { down = Math.max(0, down - 1); input(); };
  for (const t of ['keydown', 'wheel', 'pointermove']) addEventListener(t, input, { capture: true, passive: true });
  addEventListener('pointerdown', press, { capture: true, passive: true });
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, lift, { capture: true, passive: true });
  const tick = () => {
    const now = performance.now(), dt = Math.min(now - last, TICK * 2);   // (a sleeping tab's gap is not counted)
    last = now;
    if (document.visibilityState === 'visible' && now - lastInput < IDLE) active += dt;
    if (now - lastInput > 5000) down = 0;   // (a lift the page never heard, outside the window, does not hold the ask forever)
    if (active < FEEDBACK_ASK_MIN * 60000 || down || presenter.active() || projector || app.classList.contains('dock-open') || panelShown() || treatOpen() || historyOpen() || popoverOpen() || document.getElementById('modalBack')?.classList.contains('show')) return;
    clearInterval(timer);
    toast('Anything look wrong or confusing so far? A short email helps the author fix it.', '', askToast);
  };
  // (The card's answers and options are made once, with the timer, not each time it asks.)
  const answer = (v) => { try { localStorage.setItem(ASK_KEY, v); } catch (e) { caught('main:2230', e); /* storage unavailable */ } };
  const askToast = {
    sticky: true,
    actions: [['Send feedback', () => sendFeedback()], ['Not now', () => {}]],
    onClose: (why) => {
      if (why === 'pushed') { active = 0; last = performance.now(); timer = setInterval(tick, TICK); return; }   // (not an answer)
      try { if (localStorage.getItem(ASK_KEY) !== 'done') answer(was === 'later' ? 'done' : 'later'); } catch (e) { caught('main:2235', e); /* storage unavailable */ }
    },
  };
  timer = setInterval(tick, TICK);
}
(/[?&]presenter-view(?:[=&]|$)/.test(location.search) ? import('./presenter-view-page.js').then((m) => m.run()) : main()).catch((err) => {   // (N1: ?presenter-view is the presenter's second window, text only)
  // (Told to the page's own boot card too, so a failed start shows "couldn't start / Reload" at once, not a pulsing logo for 15 s and then an empty shell.)
  (window.ppsBootErrors ||= []).push(String(err?.message || err).slice(0, 300)); window.ppsBootFail?.();
  console.error(err); document.body.append(h('pre', { style: { position: 'fixed', bottom: 0, left: 0, background: 'var(--white)', color: 'var(--critical)', padding: '8px', zIndex: 'var(--z-diag)' } }, String(err.stack || err))); });
