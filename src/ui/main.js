// Application bootstrap: wires the engine host to the four surfaces (figure + action card,
// timeline, patient chart, instruments) and to Home, the command palette and the menus.

import { startHost, host } from './host.js?v=0f6d345282';
import { store, updateParams, replaceParams, bindParamSender, clearHistory, logAction, varicesPresent, hiddenNow } from './store.js?v=3b659e1968';
import { createStage } from './stage.js?v=c1efeb8048';
import { createCreditPlacer } from './credit.js?v=65811225d1';
import { sinusoidSupported } from './sinusoid-view.js?v=2e507f4385';
import { createInspector } from './inspector.js?v=3e6fa85bd0';
import { createDock, CUTOFFS } from './dock.js?v=cd5b2663cd';
import { setHvpgStage } from './hvpg-proc.js?v=3699a77ad6';
import { createWhy } from './why.js?v=79b7992637';
import { createTimeline, LAPSES } from './timeline.js?v=b8bb2e227f';
import { createCompare } from './compare.js?v=9ec14ef778';
import { createCard } from './card.js?v=00709a865b';
import { createChart } from './chart.js?v=503fcce935';
import { createMenu } from './menu.js?v=f8afed30cc';
import { caption } from './a11y.js?v=5be217ba8e';
import { startLMS } from './lms.js?v=284ef81e94';
import { UPDATED, CONTENT_UPDATED, VALIDATION, AUTHOR, AUTHOR_URL } from '../version.js?v=6886ed4265';
import { toolsToVerbs, normalizeSel, shuntable, edgeValue, bedStats } from './actions.js?v=f84a878db7';
import { gradientCss, dropCss, PRESSURE_TICKS, flowCss, flowPos, velocityCss, heatCss, HEAT_MAX } from './colormap.js?v=ec83805fb9';
import { EDGES, PORTAL_TERRITORY } from '../engine/topology.js?v=4044766e96';
import { dopplerVel } from './velNormal.js?v=181dda5594';
import { $, $$, h, icon, fmt, fmtFlow, toast, tooltipFor, openModal, closeModal, isModalOpen, popover, closePopover, popoverOpen, repositionPopover, menuItem, svgIcon, uiScale, markGone, enterAfterGone, enhanceRanges, systemEdge, sinkTo, stopSink } from './util.js?v=e387ad7347';
import { TEXT_STEPS } from './type-scale.js?v=d7cca3fb73';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const app = $('#app');
const view = $('#stageView');
const isPhone = () => matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Everything the learner does is a verb on the structure they click (actions.js, card.js); the
// only armed gesture left is a shunt waiting for its target.
import { debugOptions, debugOn, setDebug, initDebug } from './debug.js?v=c75ad21d13';
import { initTopbarMotion } from './topbar-motion.js?v=f095540bb8';
import { ORIGINS } from './blood.js?v=6c39f43ddf';
import { deepMerge, sanitizeParams } from '../engine/scenario.js?v=6ebaeb46c8';
import { frameFor, perf as framePerf } from './frame.js?v=5efaa2bcc9';
const nextFrame = frameFor('main');

// Color lenses: [title, what it shows, legend swatch].
// SMV, IMV, splenic vein, hepatic artery, systemic: as stage.js BLOOD_COLORS.
const ORIGIN_CSS = ['smv', 'imv', 'spleen', 'artery', 'systemic'].map((o) => `var(--origin-${o})`);   // the order of ORIGINS (blood.js)
const LENSES = {
  pressure: ['Pressure', 'Venous pressure in each vessel', () => gradientCss('to right', 30)],
  delta: ['Change', 'Higher or lower than healthy', () => 'linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))'],
  heat: ['Congestion', 'Where pressure has backed up', () => heatCss('to right')],
  drop: ['Pressure drop', 'Where the resistance lives', () => dropCss('to right')],
  flow: ['Flow volume', 'How much blood; width = flow', () => flowCss('to right')],
  velocity: ['Velocity', 'Against each vessel\'s normal: sand slower, teal normal, violet faster, graded', () => velocityCss('to right')],
  direction: ['Direction', 'Toward the liver or away', () => 'linear-gradient(to right, var(--flow-normal) 50%, var(--flow-reversed) 50%)'],
  origin: ['Blood origin', 'Where each vessel\u2019s blood comes from', () => `linear-gradient(to right, ${ORIGIN_CSS.map((c, i) => `${c} ${i * 20}% ${(i + 1) * 20}%`).join(', ')})`],
};
const COLOR_MODES = { pressure: 'Pressure', delta: 'Change', heat: 'Congestion', drop: 'Pressure drop', flow: 'Flow volume', velocity: 'Velocity', direction: 'Flow direction', origin: 'Blood origin' };

let stage, inspector, dock, why, timeline, compare, card, chart, mainMenu;

// Surfaces most sessions never open (the command palette, the presenter) load
// on first use, so the first paint only waits for the model, the figure and the chart.
function lazy(load, make) {
  let inst = null, pending = null;
  const get = () => (pending ||= load().then((m) => (inst = make(m))));
  // Fetching the module (without creating the surface) once the app is idle keeps it cached for
  // offline use and makes the first open instant.
  return { get, now: () => inst, warm: () => load().catch(() => {}) };
}
let paletteL, presenterL;
const palette = {
  open: () => paletteL.get().then((p) => p.open()),
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
};

async function main() {
  const savedTheme = readLS('pps.theme');
  applyTheme(['dark', 'light', 'soft'].includes(savedTheme) ? savedTheme : null);   // an unknown saved theme falls back to the device's
  startLMS();
  // The Student role was removed (to come back later): an old saved role is dropped, everyone gets the full app.
  try { localStorage.removeItem('pps.role'); } catch { /* storage unavailable */ }
  // Language selection was removed too (English only, to come back later): drop an old saved choice.
  try { localStorage.removeItem('pps.lang'); } catch { /* storage unavailable */ }
  const kind = await startHost();
  console.info(`Engine running in ${kind === 'worker' ? 'a Web Worker' : 'the main thread'}.`);
  app.dataset.engine = kind;
  document.addEventListener('visibilitychange', () => host.send({ type: 'visibility', visible: !document.hidden }));
  host.send({ type: 'visibility', visible: !document.hidden });
  bindParamSender((params, settle) => host.send({ type: 'setParams', params, settle }));

  // Both asked at once: one round trip to the engine before any UI, not two.
  const [healthy, { presets }] = await Promise.all([host.request('healthyProfile'), host.request('presets')]);
  store.set({ healthy: { P: healthy.P, Q: healthy.Q, D: healthy.D, metrics: healthy.metrics } });
  store.set({ presetList: presets });

  why = createWhy($('#whyPop'));
  stage = createStage({
    wrap: view,
    onSelect: (sel, opts) => { select(sel); if (opts?.keyboard) setTimeout(() => card?.focusFirst(), 30); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id, { reveal: 'soft' }),
    onHoverInfo: hoverInfo,
    onViewChange: () => card?.position(),
  });
  setHvpgStage(stage);
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
  });
  inspector = createInspector($('#inspector'), {
    onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id, { reveal: true }),
    onScenarios: () => mainMenu.open('patients'), onMode: (m) => store.set({ mode: m }), chart,
    // Back from a selection's details: to the pinned comparison if there is one, else the panel closes.
    onBack: () => { if (store.get().compareSnap) store.set({ details: null }); else closePanel(); },
  });
  store.on('details', (d) => { const el = $('#panelTitle span'); if (el) el.textContent = d?.type === 'advanced' ? 'Advanced physiology' : d ? 'Details' : 'Compare'; });
  dock = createDock({ strip: $('#strip'), head: $('#dockHead'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => { host.send({ type: 'probe', id }); logAction('probe', id); }, onReveal: revealDock, onLobule: () => zoomLobule('R'),
    onOpen: () => openPanel('instruments'), onClose: () => setPanelTab('chart'), onLayout: () => syncDoppler(), isVisible: () => app.classList.contains('dock-open'),
    marks: () => timeline.entries(), onBeat: () => sendBeat() });
  presenterL = lazy(() => import('./presenter.js?v=5d2cf5f5f3'), ({ createPresenter }) => createPresenter({ openSettings, loadPreset, updateParams, host, stage, dock, action: doAction,
    projectorOn: () => { if (!projector) toggleProjector(); }, projectorOff: () => { if (projector) toggleProjector(); },
    closeHome: () => mainMenu.close(), stashCards, rerenderHome: () => mainMenu.render() }));
  mainMenu = createMenu({
    anchor: $('#btnMenu'), library: presenter.library, libraryNow: presenter.libraryNow,
    onPreset: (id) => openInExplore(id), share, help: (a) => openHelpMenu(a),
    onToggle: (on, sheet) => { closePopover(); app.classList.toggle('menu-sheet-open', on && !!sheet); creditPlacer?.refresh(); },
  });
  paletteL = lazy(() => import('./palette.js?v=b0aa1a3272'), ({ createPalette }) => createPalette({ ctx: {
    select, action: doAction, probe: (id) => { host.send({ type: 'probe', id }); logAction('probe', id); }, showPane: (id) => dock.show(id, { reveal: true }),
    jump: (d, l) => timeline.jump(d, l), undo: () => timeline.undo(), pin: () => timeline.togglePin(), lenses: Object.fromEntries(Object.entries(LENSES).map(([k, v]) => [k, v])),
    zoomLobule: () => zoomLobule('R'), instruments: () => dock.toggle(),
    loadPreset: async (id) => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); await loadPreset(id); toast(store.get().presetList.find((p) => p.id === id)?.label); },
    home: () => mainMenu.open(), theme: () => toggleTheme(), help: () => openHelp(), share, restart: () => restartPatient(), reset: () => resetEverything(),
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
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see the console.', 'bad'); });

  // The Sinusoid button shows only in the Lobule view: it is one level further down.
  const syncViewSeg = () => { const st = store.get(), cur = st.lobule && st.sinusoid ? 'sinusoid' : st.lobule ? 'lobule' : st.view; $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === cur))); $('#viewSeg [data-view="sinusoid"]').hidden = !st.lobule || !sinusoidSupported(); app.classList.toggle('sin-focus', !!(st.lobule && st.sinusoid)); $('#btnSinPlay').hidden = !(st.lobule && st.sinusoid); const inSin = !!(st.lobule && st.sinusoid); $('#zoomIn').disabled = inSin; for (const [id, off, on] of [['#zoomOut', 'Zoom out', 'Back out to the lobule'], ['#zoomFit', 'Fit the figure to the view', 'Back out to the lobule']]) { $(id).title = inSin ? on : off; $(id).setAttribute('aria-label', inSin ? on : off); } };
  store.on('view', (v) => { stage.setView(v); syncViewSeg(); });
  store.on('lobule', syncViewSeg);
  store.on('sinusoid', syncViewSeg);
  // The sinusoid view hides the timeline, so it gets its own play / pause (Space works too).
  const sinPlay = $('#btnSinPlay');
  let sinOn = null, syncSinPlay = () => { const on = store.get().running; if (on === sinOn) return; sinOn = on; sinPlay.setAttribute('aria-label', on ? 'Pause' : 'Play'); sinPlay.replaceChildren(icon(on ? 'pause' : 'play')); };
  sinPlay.addEventListener('click', () => host.send({ type: 'run', running: !store.get().running }));
  store.on('running', syncSinPlay);
  store.on('tool', (t) => {
    for (const c of [...view.classList]) if (c.startsWith('tool-')) view.classList.remove(c);
    view.classList.add('tool-' + t);
    renderPaintHint();
  });
  store.on('shunting', renderPaintHint);
  store.on('mode', onMode);
  store.on('layers', () => { app.classList.toggle('chips-off', !store.get().layers.chips); syncBloodBtn(); redraw(); });
  // A phone shows a short form of a long name (styles), wrapped to two lines if needed: "Decomp. cirrhosis", not "Decomp…".
  const shortName = (s) => s.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '').replace(/^Decompensated\b/, 'Decomp.').replace(/^Compensated\b/, 'Comp.').replace(/^Clinically significant PH$/, 'CSPH');
  const syncScenarioName = () => {
    const st = store.get(), name = presets.find((p) => p.id === st.presetId)?.label || 'Custom';
    $('#scenarioName').replaceChildren(h('span', { class: 'sn-l' }, name), h('span', { class: 'sn-s' }, shortName(name)));
  };
  store.on('presetId', syncScenarioName);
  store.on('mode', syncScenarioName);
  for (const k of ['compareSnap', 'compareView', 'colorMode', 'imaging', 'found', 'sinusoid', 'lobule']) store.on(k, () => { renderLegend(); renderBanner(); redraw(); });
  store.on('compareSnap', () => { if (!store.get().details) inspector.render(); });
  store.on('focus', redraw);
  store.on('labelLevel', redraw);
  store.on('selection', redraw);

  // Console handle for educators preparing a class (and for automated screenshots).
  window.pps = { resumeUrl, loadPreset, store, updateParams, setTool, dock, details: (sel) => { store.set({ details: sel }); openPanel(); }, stage, host, card, timeline, menu: mainMenu, palette, presenter, get perf() { return framePerf(); }, get credit() { return creditPlacer; } };
  const linked = await presenter.readLink();
  if (linked) mainMenu.open('scripts', { mark: typeof linked === 'string' ? linked : null });
  const shared = readShare(), back = new URLSearchParams(location.search).has('back');
  if (shared) await loadShared(shared, { quiet: back }); else timeline.reset();
  inspector.render();
  const deep = await openDeepLink();
  if (!deep) firstRun();
  // The default patient starts without loadPreset, so record what it came with: Treat > Changes then lists its
  // settings under About this patient, not as changes nobody made, and Clear all keeps them (review #18).
  if (!shared && !store.get().presetParams) store.set({ presetParams: { id: store.get().presetId, params: structuredClone(store.get().params) } });
  if (back) { const u = new URL(location.href); for (const k of ['back', 'script', 'slide']) u.searchParams.delete(k); u.hash = ''; history.replaceState(null, '', u.pathname + u.search); }   // (a later plain reload starts fresh)
  // Startup has decided who the patient is (a deep link, a shared link, or the default one): the figure may frame itself.
  store.set({ booted: true });
  // Offline support registers once the figure is up, so its install does not compete with the modules still loading.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const reg = () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    if (window.ppsFigureReady) reg(); else addEventListener('pps:figure-ready', reg, { once: true });
  }
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  setTimeout(() => idle(() => { paletteL.warm(); presenterL.warm(); }), 3000);
}
// Deep links, for an LMS or a syllabus: ?script=<id> (&slide=<n>), ?preset=<id>,
// ?home=explore|present (the menu, open at Patients or Present). They open straight into that activity.
async function openDeepLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('script')) { presenter.start(q.get('script'), Math.max(0, (parseInt(q.get('slide'), 10) || 1) - 1)); return true; }
  if (q.get('preset')) {
    const id = q.get('preset'), list = store.get().presetList || [];
    if (list.some((p) => p.id === id)) { await loadPreset(id); return true; }
    const near = list.find((p) => (p.id + ' ' + p.label).toLowerCase().includes(id.toLowerCase().split(/[-\s]/)[0]));
    toast(`No patient called “${id}”.${near ? ` Showing ${near.label}.` : ''}`, 'bad');
    if (near) { await loadPreset(near.id); return true; }
    return false;
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
let lastPaint = 0, lastDesc = 0;
// The Doppler's vessel glows on the figure while the Doppler instrument is open.
function syncDoppler(f = store.get().frame) { stage?.setDoppler(f && dock?.isOpen('doppler') ? f.probe : null); syncScanProbe(); }
// The FibroScan probe and its shear wave show on the figure while the FibroScan card is open in Explore; the Presenter drives its own.
let scanOwned = false;
function syncScanProbe() {
  const want = store.get().mode === 'explore' && !!dock?.isOpen('fibroscan');
  if (store.get().mode !== 'explore') { scanOwned = false; return; }
  if (want !== scanOwned) { scanOwned = want; stage?.setScanProbe(want); }
}
// Settings no patient could live through (circulatory collapse): a plain warning over the figure, so nobody
// reads numbers off an impossible patient. Hysteresis keeps it from flickering at the edge.
const COLLAPSE = { on: (m) => m.map < 45 || m.co < 1.5, off: (m) => m.map > 50 && m.co > 1.8 };
let collapseEl = null, collapsed = false;
function syncCollapse(m) {
  if (!m || !Number.isFinite(m.map) || !Number.isFinite(m.co)) return;
  // Present (any deck) never shows it: the warning belongs to Patients, where the settings are the viewer's own.
  const next = !store.get().presenting && (collapsed ? !COLLAPSE.off(m) : COLLAPSE.on(m));
  if (!collapseEl) {
    collapseEl = h('div', { class: 'collapse-banner', role: 'status', 'aria-live': 'polite' }, h('b', {}, 'This patient would not survive these settings'), h('span'));
    document.getElementById('stageWrap')?.append(collapseEl);
  }
  if (next) collapseEl.lastChild.textContent = `Blood pressure ${fmt(m.map, 0)} mmHg and cardiac output ${fmt(m.co, 1)} L/min: the circulation has collapsed.`;
  if (next !== collapsed) { collapsed = next; collapseEl.classList.toggle('on', next); }
}
function onFrame(f) {
  if (f.params) replaceParams(f.params);
  if (f.events?.length) { const hid = store.get().hiddenEvents; const ev = hid ? f.events.filter((e) => !hid.has(e.id) && !(hid.has('COLL_*') && e.id.startsWith('COLL_'))) : f.events; if (ev.length) timeline.addEvents(ev); }
  dock?.ingest(f);   // every frame's samples, even one that is not painted
  const now = performance.now();
  if (!f.changed && !f.params && !f.events?.length && now - lastPaint < 80) return;
  lastPaint = now;
  // running and clock only when they change: their listeners (the endoscopy redraw among them) need not re-run every frame.
  const st0 = store.get();
  store.set({ frame: f, ...(st0.running !== f.running ? { running: f.running } : {}), ...(st0.clock !== f.clock ? { clock: f.clock } : {}), ...(f.clock === 'hemo' && st0.lapse ? { lapse: 0, speed: f.speed } : {}) });
  stage.update(viewFrame(f));
  syncCollapse(f.metrics);
  card.update(f);
  dock.update(f);
  syncDoppler(f);
  inspector.update(f);
  compare.update(f);
  timeline.update(f);
  const txt = f.day > 0 ? `Day ${f.day}` : `${fmt(f.t, 0)} s`;
  if (txt !== lastClockTxt) { lastClockTxt = txt; stageClock.textContent = txt; }
  if (tipInfo) hoverInfo(tipInfo);   // the readings popup stays live with the sim
  syncBleeding(f);
  if (projector) updateProjector(f);
  if (now - lastDesc > 3000) { lastDesc = now; $('#stage').setAttribute('aria-description', caption(f)); }
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
  store.set({ presetLoading: true });   // the figure frames itself once the patient has arrived (stage.js)
  dock?.clearTraces();   // the Over time and Doppler traces start over with the new (or restarted) patient
  const res = await host.request('preset', { id, days: opts.days });
  // Patients tapped in quick succession: the engine loads them in order, so only the last one's answer is applied.
  if (gen !== presetGen) return;
  replaceParams(res.params);
  store.set({ presetParams: { id, params: structuredClone(res.params) } });   // what the patient came with (chart.js: About this patient)
  clearHistory();
  store.set({ presetLoading: false, presetId: id, lastHVPG: null, hvpgMeasured: false, selection: store.get().selection, historyTick: (store.get().historyTick || 0) + 1 });
  timeline?.reset(store.get().presetList?.find((x) => x.id === id)?.label);
}

function encodeShare(extra) {
  const st = store.get();
  const payload = { v: 1, preset: st.presetId, params: st.params, view: st.view, ...extra };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readShare() {
  const m = location.hash.match(/#s=([\w-]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
}
async function loadShared(s, { quiet = false } = {}) {
  await loadPreset(s.preset || 'healthy');
  if (s.params) {
    const merged = deepMerge(store.get().params, s.params), clean = sanitizeParams(merged);
    updateParams(() => clean, { settle: true, history: false });
    if (JSON.stringify(clean) !== JSON.stringify(merged)) { timeline.flush(); toast('This link had values out of range; they were set to the nearest allowed values.'); return; }
  }
  if (s.view) store.set({ view: s.view });
  if (s.sel) store.set({ selection: s.sel });
  if (s.cam && !store.get().lobule) stage.setCamera(s.cam, 0);
  timeline.flush();
  if (!quiet) toast('Loaded the shared scenario.');
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
  try { await navigator.clipboard.writeText(url); toast('Link to this exact scenario copied.'); } catch { history.replaceState(null, '', url); toast('Link placed in the address bar.'); }
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
  await loadPreset(id);
  toast(`Restarted: ${store.get().presetList?.find((p) => p.id === id)?.label || 'patient'}.`);
}
function resetEverything() {
  closePopover();
  openModal('Reset everything?', h('div', {},
    h('p', {}, 'This clears the timeline, comparisons and every change, and reloads the simulator with a healthy patient. Your preferences are kept.'),
    h('div', { class: 'btn-row', style: { justifyContent: 'flex-end', marginTop: '8px' } },
      h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => { try { sessionStorage.clear(); } catch { /* storage unavailable */ } location.replace(location.pathname); } }, 'Reset and reload'))), { sub: null });
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
  const msgs = { infuse: { crystalloid: '1 L crystalloid running (≈25 % stays intravascular).', prbc: '1 unit of packed red cells running.', albumin: 'Albumin given: plasma oncotic pressure rises.' },
    hemorrhage: 'Hemorrhage: 500 mL lost.', band: 'Band placed on a variceal column.', valsalva: 'Valsalva: intrathoracic and abdominal pressure up for 10 s.' };
  const m = typeof msgs[a.kind] === 'object' ? msgs[a.kind][a.fluid] : msgs[a.kind];
  if (a.kind === 'paracentesis') toast(`Paracentesis: up to ${(a.mL / 1000).toFixed(1)} L drained${a.albumin ? ' with albumin' : ' without albumin'}.`);
  else if (m) toast(m);
}

// ── Armed gestures ─────
function setTool() { store.set({ tool: 'select' }); }
function setAllowedTools(list) {
  store.set({ allowedVerbs: toolsToVerbs(list) });
  if (store.get().tool !== 'select') store.set({ tool: 'select' });
}
// The hint card for an armed gesture: a shunt waiting for its target.
function renderPaintHint() {
  const el = $('#toolHint');
  const st = store.get();
  const done = (label, fn) => { const b = h('button', { class: 'btn sm' }, label); b.addEventListener('click', fn); return b; };
  if (st.shunting) {
    const only = st.shunting.only;
    el.hidden = false;
    el.replaceChildren(h('div', { class: 'tc-title' }, icon('stent'), only === 'tips' ? 'Place the TIPS' : 'Make a shunt', h('span', { class: 'sp' }), done('Cancel', () => stage.cancelShunt())),
      h('div', {}, only === 'tips' ? 'Click the hepatic vein where the stent should end. Glowing vessels are valid targets.' : 'Click the vein to connect it to. Glowing vessels are valid targets: a portal branch to a hepatic vein makes a TIPS, to the IVC below the hepatic veins a DIPS, splenic to left renal a Warren shunt. Esc cancels.'));
    redraw();
    return;
  }
  el.hidden = true;
  redraw();
}
// The Lobule view: a view of its own beside Anatomy and Circuit.
function zoomLobule() { store.set({ lobule: true, sinusoid: false }); }

// ── Figure header: view, color, legend; banners ─────
let tipEl, stageClock;
function buildHud() {
  // Moving blood: chevrons are remembered per device; ?blood=chevrons turns them on for a link.
  let saved = null;
  // (pps.blood2: chevrons became the default, so a choice saved under the old default starts over.)
  try { saved = JSON.parse(localStorage.getItem('pps.blood2') || 'null'); } catch { /* storage unavailable */ }
  const blood = { look: 'shimmer', phasic: false, chevrons: true, ...(saved && typeof saved === 'object' ? saved : {}) };
  delete blood.origin;   // now the Blood origin lens
  const asked = (new URLSearchParams(location.search).get('blood') || '').split(',');
  if (asked.includes('chevrons')) blood.chevrons = true;
  blood.look = 'shimmer'; blood.phasic = false;   // the Blood menu offers streaks and chevrons only
  store.set({ blood });
  store.on('blood', (v) => {
    try { localStorage.setItem('pps.blood2', JSON.stringify(v)); } catch { /* storage unavailable */ }
    sendBeat(); syncBloodBtn();
    redraw();
  });
  $('#btnBlood').onclick = (e) => openBlood(e.currentTarget);
  $('#btnLobuleLayers').onclick = (e) => openLobuleLayers(e.currentTarget);
  store.on('lobule', (on) => { $('#btnLobuleLayers').hidden = !on; if (!on) closePopover(); });
  syncBloodBtn();
  renderLegend();
  store.on('colorMode', () => { $('#colorModeLabel').textContent = COLOR_MODES[store.get().colorMode]; });
  enhanceRanges();
  tipEl = h('div', { class: 'hover-tip', 'aria-hidden': 'true' });
  view.append(tipEl);
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
function legendModel() {
  const st = store.get();
  const imaging = st.imaging;
  const cmp = !!st.compareSnap;
  // The sinusoid view shows pressure only (it has no lens).
  const m = imaging ? 'neutral' : st.lobule && st.sinusoid ? 'pressure' : cmp && st.compareView === 'D' ? 'delta' : st.colorMode;
  const ref = cmp ? st.compareSnap.when : 'healthy';
  return { m, ref, imaging };
}
function renderLegend() {
  const { m, ref } = legendModel();
  const el = $('#legend');
  const scale = (grad, nums, ticks = []) => h('div', { class: 'lg-scale' }, h('div', { class: 'lg-bar', style: { background: grad } }),
    ticks.map((p) => h('span', { class: 'lg-tick', style: { left: p + '%' } })),
    nums.map(([p, t, opt]) => h('span', { class: 'lg-num' + (p >= 95 ? ' end' : p <= 1 ? ' start' : '') + (opt ? ' opt' : ''), style: { left: p + '%' } }, t)));
  // Where the full title is hidden (narrow screens), a two-word caption keeps the lens and its unit.
  const cap = (k, u) => h('div', { class: 'lg-cap', 'aria-hidden': 'true' }, k, h('small', {}, u));
  if (m === 'pressure' || m === 'drop') {
    const max = 30, at = (p) => (p / max) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, m === 'pressure' ? 'Mean venous pressure' : 'Pressure drop', h('small', {}, 'mmHg')), cap(m === 'pressure' ? 'Pressure' : 'Drop', 'mmHg'),
      m === 'pressure' ? scale(gradientCss('to right', max), PRESSURE_TICKS.map((p) => [at(p), String(p)]), PRESSURE_TICKS.map(at))
        : scale(dropCss('to right'), [[0, '0'], [100, '12+']]));
    el.setAttribute('aria-label', m === 'pressure' ? 'Legend: mean venous pressure at each vessel, 0 to 30 millimeters of mercury, pale blue to dark magenta' : 'Legend: pressure drop across each vessel, 0 to 12 or more millimeters of mercury, pale to deep green');
  } else if (m === 'flow') {
    const at = (v) => flowPos(v) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, 'Flow volume', h('small', {}, 'L/min · width ∝ √flow')), cap('Flow', 'L/min'),
      scale(flowCss('to right'), [[at(0.02), '0.02'], [at(0.5), '0.5'], [at(5), '5']], [at(0.5)]));
    el.setAttribute('aria-label', 'Legend: flow volume from 0.02 to 6 liters per minute on a log scale, pale mint to deep blue; line width grows with flow');
  } else if (m === 'velocity') {
    el.replaceChildren(h('div', { class: 'lg-title' }, 'Velocity', h('small', {}, 'vs normal')), cap('Velocity', 'vs normal'),
      scale(velocityCss('to right'), [[0, 'Slow'], [100, 'Fast']], [33.3, 66.7]));
    el.setAttribute('aria-label', 'Legend: each vessel\'s mean velocity against its normal range: a continuous scale from sand (slower than normal) through teal (normal) to violet (faster), stronger the further from normal; collaterals stay grey');
  } else if (m === 'heat') {
    const at = (v) => (v / HEAT_MAX) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, 'Congestion', h('small', {}, `mmHg above ${ref}`)), cap('Congestion', 'mmHg'),
      scale(heatCss('to right'), [[at(0), '0'], [at(5), '5'], [at(10), '10', 1], [at(15), '15+']], []));
    el.setAttribute('aria-label', `Legend: pressure above ${ref}, 0 to 15 millimeters of mercury, grey to yellow to deep red, with a glow where congestion is highest`);
  } else if (m === 'direction') {
    el.replaceChildren(h('div', { class: 'lg-cats' }, h('span', {}, h('i', { style: { background: 'var(--flow-normal)' } }), 'Physiological'), h('span', {}, h('i', { style: { background: 'var(--flow-reversed)' } }), 'Reversed')));
    el.setAttribute('aria-label', 'Legend: teal is physiological flow direction, orange is reversed');
  } else if (m === 'origin') {
    // Dots and the short names (SMV, IMV, SV, Sys, HA), so the key always fits in the top bar.
    el.replaceChildren(h('div', { class: 'lg-cats lg-dots' }, ...[0, 1, 2, 4, 3].map((i) => h('span', { title: ORIGINS[i][3] }, h('i', { style: { background: ORIGIN_CSS[i] } }), h('b', {}, ORIGINS[i][2])))));
    el.setAttribute('aria-label', 'Legend: blood colored by where it comes from, as streams side by side: amber SMV (with the coronary vein), teal IMV, violet SV (splenic vein), slate blue Sys (systemic), crimson HA (hepatic artery)');
  } else if (m === 'neutral') {
    el.replaceChildren(h('div', { class: 'lg-cats' }, h('span', {}, h('i', { style: { background: 'var(--vein-portal)' } }), 'Portal veins'), h('span', {}, h('i', { style: { background: 'var(--vein-systemic)' } }), 'Systemic veins'),
      h('span', { class: 'lg-note' }, svgIcon('info'), 'Pressures unmeasured')));
    el.setAttribute('aria-label', 'Legend: violet portal veins, blue systemic veins. Pressures are unmeasured in this case: investigate with the tools.');
  } else {
    el.replaceChildren(h('div', { class: 'lg-title' }, `Change from ${ref}`, h('small', {}, 'mmHg')), cap('Change', 'mmHg'),
      scale('linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))', [[0, '−12'], [50, '0'], [100, '+12']], [50]));
    el.setAttribute('aria-label', `Legend: change in pressure from ${ref}, blue lower, red higher, up to 12 millimeters of mercury`);
  }
  $('#colorModeLabel').textContent = m === 'neutral' ? 'Anatomy' : m === 'delta' && st().compareSnap ? 'Change since then' : COLOR_MODES[m];
}
const st = () => store.get();
// ── Moving blood ─────────────────────────────────────
// The heartbeat (the model's pulsatile mode) always runs, so the Over time trace is beat to beat
// from the first moment rather than smooth until a waveform instrument opens.
let beatSent = null;
function sendBeat() {
  const on = true;
  if (on !== beatSent) { beatSent = on; host.send({ type: 'beat', on }); }
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
  const name = sel?.type === 'edge' ? (EDGES.find((e) => e.id === sel.id)?.label || 'the vessel') : 'the gut\u2019s veins';
  toast(`Injecting dye into ${name}`);
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
    h('div', { class: 'menu-title' }, 'Moving blood'),
    toggle(flowOn, 'streaks', 'Streaks', 'Silky streaks carried by the flow', (on) => { store.set({ layers: { ...store.get().layers, flow: on } }); syncBloodBtn(); }),
    toggle(!!b.chevrons, 'chevrons', 'Chevrons', 'Arrowheads moving with the flow; orange where it runs backwards', (on) => setBlood({ chevrons: on })),
    toggle(!!b.keyChevrons, 'chevrons', 'Key chevrons only', 'Only on the portal inflow, liver, hepatic veins and open collaterals', (on) => setBlood({ keyChevrons: on })),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Show on the figure'),
    layer('chips', 'tag', 'Pressure values', 'The number beside each vessel\u2019s name'),
    layer('collaterals', 'route', 'Potential collaterals', 'Dotted routes that open as pressure rises'),
    layer('labels', 'liver', 'Organ names'),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Labels'),
    labelLevelSeg(),
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
      try { localStorage.setItem('pps.labels', v); } catch { /* storage unavailable */ }
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
    h('div', { class: 'menu-title' }, 'Show on the lobule'),
    menuToggle(!!l.zones, 'zones', 'Zones', 'Rappaport zones: 1 periportal (oxygen-rich) to 3 centrilobular', (on) => set({ zones: on })),
    menuToggle(!!l.lymph, 'lymph', 'Lymph', 'Lymph forming in the space of Disse and draining to the portal tract', (on) => set({ lymph: on })),
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
// Active bleeding is a state, not an alarm: the app only notes it (the figure shows the blood itself).
let lastBleed = false;
function syncBleeding(f) {
  const on = !!f.metrics.bleeding;
  if (on === lastBleed) return;
  lastBleed = on;
  app.classList.toggle('bleeding', on);
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
  const place = `${info.x},${info.y}|${lens}`;
  if (place === tipPlace) return;
  tipPlace = place;
  const W = view.clientWidth, H = view.clientHeight, th = tipEl.offsetHeight, tw = tipEl.offsetWidth || 200;
  if (info.peek) {
    // Above the finger, so the finger doesn't hide it; below it only when there is no room above.
    tipEl.style.left = Math.max(8, Math.min(W - tw - 8, info.x - tw / 2)) + 'px';
    tipEl.style.top = (info.y - th - 44 >= 8 ? info.y - th - 44 : Math.min(H - th - 8, info.y + 44)) + 'px';
    return;
  }
  tipEl.style.left = Math.max(8, Math.min(W - tw - 8, info.x + 16)) + 'px';
  tipEl.style.top = Math.max(8, Math.min(H - th - 8, info.y + 16)) + 'px';
}
let tipShape = '', tipVals = [], tipPlace = '';

// The figure header carries the Then / Now / Change switch when a moment is pinned.
function renderBanner() {
  const el = $('#stageBanner');
  const s0 = store.get();
  const kids = [];
  if (s0.compareSnap) {
    kids.push(h('span', { class: 'cmp-label' }, `Comparing with ${s0.compareSnap.when}`));
    const [nA, nB] = s0.compareSnap.names || ['Then', 'Now'];
    kids.push(h('div', { class: 'seg cmp-seg', role: 'group', 'aria-label': `Comparing with ${s0.compareSnap.when}: show` }, [['A', nA, `The model at ${s0.compareSnap.when}`], ['B', nB, 'The live model'], ['D', 'Change', `Change from ${s0.compareSnap.when} to now`]].map(([v, l, t]) => {
      const b = h('button', { 'aria-pressed': String((s0.compareView || 'B') === v), title: t }, h('b', {}, l));
      b.addEventListener('click', () => store.set({ compareView: v }));
      return b;
    })));
    const tbl = h('button', { class: 'btn sm cmp-table-btn', title: 'Every value, then and now, in a table', onclick: () => { openPanel(); $('.cmp-section')?.scrollIntoView({ block: 'start' }); } }, 'Differences');
    kids.push(tbl);
  }
  el.replaceChildren(...kids);
  app.classList.toggle('cmp-on', !!s0.compareSnap);
  // The switch's height, for views that place their own controls under it (the lobule's).
  app.style.setProperty('--cmp-h', s0.compareSnap ? `${$('#stageCenter').offsetHeight + 8}px` : '0px');
  view.querySelector('.cmp-badge')?.remove();
  if (s0.compareSnap && s0.compareView === 'A') view.append(h('div', { class: 'cmp-badge stage-blocker' }, `Showing ${s0.compareSnap.when}`));
  redraw();
}

// ── Top bar & transport ─────────────────────────────
function wireTopbar() {
  initDebug(() => stage.zoomLevel());
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
function openSettings(anchor, withSearch = false) {
  const cur = document.documentElement.getAttribute('data-theme') || 'system';
  // While presenting, only what changes how the talk looks: appearance, full screen, text size, interface zoom.
  const talk = presenter.active();
  popover(anchor, [
    // (From the thumb dock's Settings tab, Search heads the sheet: the dock has no More menu.)
    ...(withSearch ? [menuItem('Search', { icon: 'search', onClick: () => { closePopover(); palette.open(); } })] : []),
    h('div', { class: 'menu-title' }, 'Appearance'),
    h('div', { class: 'seg full menu-seg' }, [['light', 'Light'], ['dark', 'Dark'], ['soft', 'Soft'], ['system', 'System']].map(([v, l]) => { const b = h('button', { 'aria-pressed': String(cur === v) }, l); b.addEventListener('click', () => { applyTheme(v === 'system' ? null : v, v === 'system'); b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }); return b; })),
    fullscreenControl(),
    ...(talk ? presenterSettings() : []),
    h('div', { class: 'menu-title' }, 'Text size on the figure'),
    textSizeControl(),
    h('div', { class: 'menu-title' }, 'Interface zoom'),
    uiZoomControl(),
    ...(talk ? [] : [
      h('div', { class: 'menu-title' }, 'Accessibility'),
      menuToggle(!document.documentElement.hasAttribute('data-noglass'), 'layers', 'Blur effect', 'Frosted glass behind cards and labels. Off: solid cards and glowing labels, lighter on a hot device', (on) => {
        try { localStorage.setItem('pps.noGlass', on ? '0' : '1'); } catch { /* storage unavailable */ }
        document.documentElement.toggleAttribute('data-noglass', !on);
      }),
      menuToggle((() => { try { return localStorage.getItem('pps.saver') === '1'; } catch { return false; } })(), 'activity', 'Battery saver', 'The blood, the lobule, the sinusoid and the FibroScan move at 15 frames a second at a lower resolution, so the device runs cooler', (on) => stage.setSaver(on)),
      menuToggle(store.get().showHvpg, 'gauge', 'Always show HVPG', 'Show the HVPG without measuring it first (Tests › HVPG)', (on) => {
        try { localStorage.setItem('pps.showHvpg', on ? '1' : '0'); } catch { /* storage unavailable */ }
        document.body.classList.remove('hvpg-swap'); void document.body.offsetWidth; document.body.classList.add('hvpg-swap');
        setTimeout(() => document.body.classList.remove('hvpg-swap'), 600);
        store.set({ showHvpg: on });
      }),
      // Debug toggles stay out of the sheet; ?debug in the address brings them back.
      ...(new URLSearchParams(location.search).has('debug') ? [h('div', { class: 'menu-title' }, 'Debug'), ...debugOptions().map(([k, l]) => menuToggle(debugOn(k), 'activity', l, null, (on) => setDebug(k, on)))] : []),
      h('div', { class: 'menu-sep' }),
      menuItem('Advanced physiology', { icon: 'sliders', onClick: () => { closePopover(); closeTreat(); store.set({ selection: null, details: { type: 'advanced' } }); openPanel(); } }),
      h('div', { class: 'menu-sep' }),
      menuItem('Reset everything…', { icon: 'reset', onClick: () => resetEverything() })]),
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
  // A plain button (it acts once, it is not a setting): the label says what the next press does.
  const t = h('span', {}), b = h('button', { class: 'btn block menu-btn', title: 'Hide the browser bars (Esc leaves)' }, svgIcon('fullscreen', 'bo-ic'), t);
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
// Interface zoom: scales the bars, dock, sheets and menus (the figure keeps its own zoom and text size).
// The page applies the saved value before it paints (index.html); --ui-zoom undoes it on the figure.
const UI_ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
function setUiZoom(z) {
  const root = document.documentElement;
  root.style.zoom = z === 1 ? '' : String(z);
  root.style.setProperty('--ui-zoom', String(z));
  try { localStorage.setItem('pps.uiZoom', String(z)); } catch { /* storage unavailable */ }
  dispatchEvent(new Event('resize'));
}
function uiZoomControl() {
  const cur = () => parseFloat(document.documentElement.style.zoom) || 1;
  const at = () => UI_ZOOM_STEPS.reduce((b, v, i) => (Math.abs(v - cur()) < Math.abs(UI_ZOOM_STEPS[b] - cur()) ? i : b), 0);
  const smaller = h('button', { class: 'ts-a ts-sm', 'aria-label': 'Zoom out the interface', title: 'Zoom out the interface' }, '−');
  const reset = h('button', { class: 'ts-reset', 'aria-label': 'Reset interface zoom', title: 'Reset interface zoom' });
  const larger = h('button', { class: 'ts-a ts-lg', 'aria-label': 'Zoom in the interface', title: 'Zoom in the interface' }, '+');
  const paint = () => {
    const i = at();
    smaller.disabled = i === 0; larger.disabled = i === UI_ZOOM_STEPS.length - 1;
    reset.textContent = `${Math.round(cur() * 100)}%`;
    reset.setAttribute('aria-pressed', String(i === UI_ZOOM_STEPS.indexOf(1)));
  };
  // The sheet stays open and re-anchors to the zoomed gear button.
  const apply = (z) => { setUiZoom(z); paint(); nextFrame(repositionPopover); };
  smaller.addEventListener('click', () => apply(UI_ZOOM_STEPS[Math.max(0, at() - 1)]));
  larger.addEventListener('click', () => apply(UI_ZOOM_STEPS[Math.min(UI_ZOOM_STEPS.length - 1, at() + 1)]));
  reset.addEventListener('click', () => apply(1));
  paint();
  return h('div', { class: 'seg full menu-seg text-size ui-zoom', role: 'group', 'aria-label': 'Interface zoom' }, smaller, reset, larger);
}
function openHelpMenu(anchor) {
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Help'),
    menuItem('Guide', { icon: 'book', onClick: () => { closePopover(); openHelp(); } }),
    menuItem('Keyboard shortcuts', { icon: 'grid', kb: '?', onClick: () => { closePopover(); openHelp('keys'); } }),
    menuItem('About the model', { icon: 'info', onClick: () => { closePopover(); openAbout(); } }),
    menuItem('References', { icon: 'case', onClick: () => { closePopover(); openAbout('refs'); } }),
    menuItem('Privacy', { icon: 'lock', onClick: () => { closePopover(); openPrivacy(); } }),
    h('div', { class: 'menu-sep' }),
    h('a', { class: 'menu-credit', href: AUTHOR_URL, target: '_blank', rel: 'noopener', onclick: () => closePopover() },
      h('span', {}, 'Created by ', h('b', {}, AUTHOR)), h('span', { class: 'mc-link' }, 'All my tools ', icon('chev-right'))),
  ], { align: 'start', cls: 'app-menu' });
}
function doUndo() { timeline.undo(); }
function doRedo() { timeline.redo(); }
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
function settle() { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); }
function setSpeed(v, lapse = false) {
  if (lapse) { store.set({ lapse: v }); host.send({ type: 'run', speed: v, clock: 'disease' }); }
  else { store.set({ speed: v, lapse: 0 }); host.send({ type: 'run', speed: v, clock: 'hemo' }); }
}
function applyTheme(t, clear) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  try { if (t) localStorage.setItem('pps.theme', t); else if (clear) localStorage.removeItem('pps.theme'); } catch { /* storage unavailable */ }
  const f = store.get().frame; if (f) { stage?.update(viewFrame(f)); dock?.update(f); }
  syncStatusBar();
}
// The browser's and the installed app's status bar take the color of whatever sits under it: the
// figure (the top bar floats over it). The theme can differ from the system's, so the color comes from the page, not from a media query.
function syncStatusBar() {
  const el = document.getElementById('stageWrap');
  const c = el && getComputedStyle(el).backgroundColor;
  if (!c || c === 'rgba(0, 0, 0, 0)') return;   // colour-exempt: the computed value of transparent
  let m = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!m) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => x.remove());
    m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m);
  }
  if (m.content !== c) m.content = c;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => syncStatusBar());
// (again once the figure's background has finished its .5 s fade)
new MutationObserver(() => { syncStatusBar(); setTimeout(syncStatusBar, 600); }).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });
function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
// ── Patient chart, Treat card and instrument workspace ─
// The chart is a card floating over the right of the figure (a bottom sheet on a phone), opened
// from Findings or by a vessel's Details. It starts closed: the figure
// has the screen until something is asked for.
// Findings, Treat and Measure close the same way: the card plays its way out (CSS .card-leaving)
// while the layout already treats it as closed.
function leave(el) {
  if (el.dataset.swiped) { delete el.dataset.swiped; return; }   // (swiped away: already slid out of sight behind the tab row)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('card-leaving'); void el.offsetWidth;
  el.classList.add('card-leaving');
  markGone(180);
  const done = (e) => { if (e && e.target !== el) return; el.classList.remove('card-leaving'); el.removeEventListener('animationend', done); };
  el.addEventListener('animationend', done);
  setTimeout(done, 400);
}
const arrive = (el) => { el.classList.remove('card-leaving'); enterAfterGone(el); };
function panelShown() { return !app.classList.contains('instrument-focus') && app.classList.contains('panel-open'); }
// The figure re-fits to the space the open cards leave (once as the card starts, again when its sheet has settled).
let refitT = 0;
function refitStage() {
  clearTimeout(refitT);
  nextFrame(() => stage?.refit());
  refitT = setTimeout(() => stage?.refit(), 380);
}
function syncPanelToggle() {
  refitStage();
  setTimeout(() => stage?.relayout(), 320);
}
// Closing a card from the keyboard or its own button hands focus back to what opened it, never to the page (review #24).
// (Safari does not focus a clicked button, so the card's own button stands in for the opener.) A card put away because
// another opens keeps focus where it is.
function giveFocusBack(card, to) {
  const a = document.activeElement;
  if (a && a !== document.body && !card.contains(a)) return;
  if (to?.isConnected && to.getClientRects().length) to.focus({ preventScroll: true });
}
let panelOpener = null;
/** Opens the patient chart; or the instruments when named. */
function openPanel(tab = 'chart') {
  // (What it puts away on a phone goes first, so the instruments come in once it has gone.)
  if (tab === 'instruments') { if (isPhone()) { closePanel(); closeTreat(); } setPanelTab('instruments'); return; }
  // The panel holds a selection's details, the advanced physiology or a pinned comparison; with none of them it stays shut.
  if (!store.get().details && !store.get().compareSnap) return;
  if (app.classList.contains('instrument-focus')) dock.setState('open');
  // A phone has room for one sheet at a time: the chart puts Treat and the instruments away.
  if (isPhone()) { closeTreat(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
  const a = document.activeElement;
  if (!panelShown() && a && a !== document.body && !$('#panel').contains(a)) panelOpener = a;
  arrive($('#panel'));
  app.classList.add('panel-open');
  panelSheet?.open();
  syncPanelToggle();
}
function closePanel({ focus = false } = {}) {
  if (focus) giveFocusBack($('#panel'), panelOpener);
  if (panelShown()) leave($('#panel'));
  app.classList.remove('panel-open'); panelSheet?.closed(); syncPanelToggle();
  // Once it has played out, what it showed is put away, so it never reopens on stale details.
  setTimeout(() => { if (!app.classList.contains('panel-open') && store.get().details) store.set({ details: null }); }, 420);
}
function setPanelTab(tab) {
  const instr = tab === 'instruments';
  if (instr) dock.ensure();
  const was = app.classList.contains('dock-open');
  if (instr) arrive($('#dock')); else if (was && !app.classList.contains('instrument-focus')) leave($('#dock'));
  app.classList.toggle('dock-open', instr);
  $('#tabInstruments').setAttribute('aria-pressed', String(instr));
  if (instr) $('#tabInstruments').classList.remove('ping');
  else app.classList.remove('instrument-focus');
  if (instr && !was) dockSheet?.open();
  if (!instr && was) dockSheet?.closed();
  if (was !== instr) {
    refitStage();
    const f = store.get().frame; if (f && instr) nextFrame(() => dock.update(f, true));
    setTimeout(() => dispatchEvent(new Event('resize')), 320);
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
  let pubRaf = 0;
  const publish = () => {
    pubRaf = 0;
    syncThumb();
    if ($('#vdock').dataset.folding === '1') return;   // the dock is gliding to a height already published
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
    const nbv = $('#nbViews'), nbvH = nbv && nbv.offsetHeight ? Math.max(0, vd.getBoundingClientRect().top - nbv.getBoundingClientRect().top + 8) : 0;
    if (!vd.classList.contains('mini') && vd.offsetHeight) vd.dataset.fullH = String(vd.offsetHeight + nbvH);
    const vdTop = vd.offsetHeight ? $('#stageView').getBoundingClientRect().bottom - vd.getBoundingClientRect().top + nbvH : 0;
    const vdock = vd.offsetHeight ? Math.max(vd.offsetHeight + nbvH, vdTop - gap) : 0, wide = !isPhone();
    // The top bar keeps one row when everything fits at its natural width (with a little to spare,
    // so it does not flip back and forth), else the view and legend move to a second row.
    // Off a phone the bar first compacts step by step (data-fit 1-3: shorter patient name, icon-only
    // buttons), so the view and the lens stay on the one row; two rows only if even that fails.
    const tb = $('#topbar'), cs = getComputedStyle(tb);
    const need = () => $('.tb-id').scrollWidth + ($('#viewSeg').closest('.topbar') ? $('#viewSeg').offsetWidth : 0) + $('.topbar .sb-right').offsetWidth + $('.top-right').scrollWidth + 6 * 8 + 16;
    const avail = tb.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
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
    // Every box is read first and the custom properties written after, so the whole pass costs one layout
    // instead of one per write; a value is written only when it changed, and the occupancy is announced
    // (pps:occ: the cards and the credit place themselves again) only when something did change.
    const tbH = tb.offsetHeight;
    const ws = $('#dock'), wsOn = app.classList.contains('dock-open') && !app.classList.contains('instrument-focus');
    const panelOcc = wide && app.classList.contains('panel-open') ? $('#panel').offsetWidth + gap : 0;
    const instrOcc = wsOn && ws.classList.contains('side') ? ws.offsetWidth + gap : 0;
    const tc = $('#treatCard'), hc = $('#historyCard'), treatOcc = wide && !tc.hidden ? tc.offsetWidth + gap : wide && !hc.hidden ? hc.offsetWidth + gap : 0;
    const sheet = wsOn && !ws.classList.contains('side') && ws.dataset.state !== 'peek' ? ws.offsetHeight + gap : 0;
    // On a phone the instruments sheet rises from the bottom edge, over the vitals dock.
    // (With the thumb dock the sheet sits above the dock instead.)
    const bot = isPhone() && sheet && !thumb ? Math.max(vdock + gap, sheet) : vdock + gap + sheet;
    // The patient chart is a bottom sheet on a phone, over the dock: the corner credit rides above it, unless the
    // sheet is so tall (nearly full screen) that there is no figure left to ride on.
    const pn = $('#panel'), lift = isPhone() && panelShown() && pn.offsetParent ? pn.offsetParent.clientHeight - pn.offsetTop + 8 : 0;
    const tall = !!pn.offsetParent && lift > 0 && pn.offsetParent.clientHeight - lift < tbH + 48;
    const vars = {
      '--top-safe': px(tbH), '--vdock-h': px(vdock), '--vdock-top': px(vd.offsetHeight ? vdTop : 0),
      '--panel-occ': px(panelOcc), '--instr-occ': px(instrOcc), '--right-occ': px(panelOcc + instrOcc + treatOcc), '--bot-occ': px(bot),
      '--panel-h': px(tall || !lift ? 0 : lift + 4), '--panel-cover': tall ? '1' : '0',
    };
    let changed = false;
    for (const k in vars) if (pubVals[k] !== vars[k]) { pubVals[k] = vars[k]; app.style.setProperty(k, vars[k]); changed = true; }
    // (A phone's menu sheets open above the thumb dock, 8 px clear of its top edge like the cards. Measured from the
    // screen's bottom, since the sheets are fixed to it and the dock sits above the home indicator's safe area.)
    // The cards and sheets sit on the tab row's top edge, over the play bar (which they cover), and slide away behind
    // the tab row: --nb-occ from the app's bottom (the cards), --thumb-occ from the screen's (the menu sheets).
    const nbR = thumb && vd.offsetHeight ? $('#thumbBar').getBoundingClientRect() : null;
    // (8 px clear of it: the tab row is its own rounded piece while a card is up, 15 Oct.) The cards also take the tab row's
    // left and right edges on a tablet (--nb-l, --nb-r), so Treat lines up with the bar instead of the screen's margin.
    const ar = app.getBoundingClientRect();
    const nbOcc = px(nbR && nbR.height ? ar.bottom - nbR.top + 8 : 0);
    if (pubVals.nbOcc !== nbOcc) { pubVals.nbOcc = nbOcc; app.style.setProperty('--nb-occ', nbOcc); }
    const nbL = px(nbR && nbR.height ? nbR.left - ar.left : 0), nbRt = px(nbR && nbR.height ? ar.right - nbR.right : 0);
    if (pubVals.nbL !== nbL) { pubVals.nbL = nbL; app.style.setProperty('--nb-l', nbL); }
    if (pubVals.nbR !== nbRt) { pubVals.nbR = nbRt; app.style.setProperty('--nb-r', nbRt); }
    const occ = px(nbR && nbR.height ? (innerHeight - nbR.top) / uiScale() + 8 : 0);
    if (pubVals.occ !== occ) { pubVals.occ = occ; document.documentElement.style.setProperty('--thumb-occ', occ); }
    // (and the top bar's foot, so a tall sheet stops under the view switch and leaves it in reach)
    const topOcc = px(thumb ? tb.getBoundingClientRect().bottom / uiScale() : 0);
    if (pubVals.topOcc !== topOcc) { pubVals.topOcc = topOcc; document.documentElement.style.setProperty('--thumb-top', topOcc); }
    const sig = `${app.className}|${tb.className}|${tb.dataset.fit}`;
    if (changed || sig !== pubSig) { pubSig = sig; dispatchEvent(new Event('pps:occ')); }
  };
  const pubVals = {};
  let pubSig = '';
  const soon = () => { if (!pubRaf) pubRaf = nextFrame(publish); };
  const ro = new ResizeObserver(soon);
  for (const id of ['#topbar', '#vdock', '#dock', '#panel', '#treatCard', '.tb-id', '.top-right', '.topbar .sb-right', '#viewSeg']) ro.observe($(id));
  new MutationObserver(soon).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(soon).observe($('#treatCard'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(soon).observe($('#historyCard'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(soon).observe($('#dock'), { attributes: true, attributeFilter: ['class', 'data-state'] });
  addEventListener('resize', soon);
  // The corner credit finds a free spot on the figure (src/ui/credit.js).
  creditPlacer = createCreditPlacer($('.stage-credit'), { keptStyle: (el) => stage.keptStyle(el) });
  publish();
  panelSheet = sheetBehaviour($('#panel'), { handle: h('button', { class: 'panel-grab', 'aria-label': 'Resize the patient chart' }), drag: '.panel-head', anywhere: true, onClose: closePanel });
  treatSheet = sheetBehaviour($('#treatCard'), { handle: h('button', { class: 'sheet-grab', 'aria-label': 'Resize the Treat card' }), drag: '.tc-head', anywhere: true, onClose: closeTreat, fit: '.tc-body' });
  dockSheet = sheetBehaviour($('#dock'), { handle: h('button', { class: 'sheet-grab', 'aria-label': 'Resize the instruments' }), drag: '.dock-head', anywhere: true, onClose: () => dock.close(), active: () => isPhone() && !$('#dock').classList.contains('side') && !app.classList.contains('instrument-focus') });
  // Focus: dragging, pinching or scrolling the figure fades the floating pieces until it stops.
  let busyT = 0, down = null, moved = false;
  // (Adding a class it already has still counts as a change to the page's observers: every pointer move of a drag or
  // pinch woke four of them and laid the page out again, review #31. So the class is added only when it is missing.)
  const busy = (ms) => { if (!app.classList.contains('stage-busy')) app.classList.add('stage-busy'); clearTimeout(busyT); busyT = setTimeout(() => app.classList.remove('stage-busy'), ms); };
  // On a phone the same gestures also give the figure more room: the vitals dock folds to a small pill in the
  // lower-left corner (play and clock; the zoom buttons take the lower right) and the top bar's second row (view, colour legend) slides away, while the figure moves and
  // for three seconds after. A tap anywhere, or an event on the timeline, brings them back at once.
  let focusT = 0;
  const unfocus = () => { clearTimeout(focusT); if (!app.classList.contains('figure-focus')) return; app.classList.remove('figure-focus'); foldDock(false); };
  const figureFocus = (ms) => {
    clearTimeout(focusT);
    // (The thumb dock stays put: its tab row is how the tools are reached, and it is slim already.)
    if (!isPhone() || app.classList.contains('thumb') || $('#strip').classList.contains('all') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!app.classList.contains('figure-focus')) app.classList.add('figure-focus');
    foldDock(true);
    if (ms) focusT = setTimeout(unfocus, ms);
  };
  // The dock folds to one line and opens again as an ease, never a jump: its old content fades out, the box
  // glides to the new height (bottom edge fixed) while the new content fades in. The framing and the cards read
  // the settled height straight away (published before the glide, which then skips its own per-frame updates).
  const vdockEl = $('#vdock');
  let foldTok = 0, foldAnims = [], foldGoal = false;
  const foldDone = (tok) => { if (tok !== foldTok) return; foldAnims = []; vdockEl.style.overflow = ''; delete vdockEl.dataset.folding; soon(); };
  const foldDock = async (on) => {
    if (on === foldGoal) return;
    foldGoal = on;
    const kids = [...vdockEl.children], tok = ++foldTok;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !vdockEl.animate;
    const r0 = vdockEl.getBoundingClientRect(), h0 = r0.height, w0 = r0.width;
    const from = kids.map((k) => +getComputedStyle(k).opacity);
    foldAnims.forEach((a) => a.cancel());
    foldAnims = [];
    if (reduced || !h0) { vdockEl.classList.toggle('mini', on); foldDone(tok); return; }
    if (vdockEl.classList.contains('mini') === on) {   // changed its mind before the old content was gone: fade it back
      foldAnims = kids.map((k, i) => k.animate([{ opacity: from[i] }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }));
      Promise.all(foldAnims.map((a) => a.finished.catch(() => {}))).then(() => foldDone(tok));
      return;
    }
    vdockEl.style.overflow = 'hidden'; vdockEl.dataset.folding = '1';
    const out = kids.map((k, i) => k.animate([{ opacity: from[i] }, { opacity: 0 }], { duration: Math.round(110 * from[i]) || 1, easing: 'ease-in', fill: 'forwards' }));
    foldAnims = out;
    await Promise.all(out.map((a) => a.finished.catch(() => {})));
    if (tok !== foldTok) return;
    out.forEach((a) => a.cancel());
    vdockEl.classList.toggle('mini', on);
    const r1 = vdockEl.getBoundingClientRect(), h1 = r1.height, w1 = r1.width;
    delete vdockEl.dataset.folding; publish(); vdockEl.dataset.folding = '1';
    const ease = 'cubic-bezier(.2, .8, .2, 1)';
    foldAnims = [
      vdockEl.animate([{ height: `${h0}px`, width: `${w0}px` }, { height: `${h1}px`, width: `${w1}px` }], { duration: 340, easing: ease }),
      ...kids.map((k) => k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 80, easing: 'ease-out', fill: 'backwards' })),
    ];
    Promise.all(foldAnims.map((a) => a.finished.catch(() => {}))).then(() => foldDone(tok));
  };
  // Only the figure itself: a swipe on a card (or one from the phone's edge) leaves the rest alone.
  view.addEventListener('pointerdown', (e) => { down = systemEdge(e) || e.target.closest?.('.stage-blocker, .zoom-pill, button, input, select') ? null : [e.clientX, e.clientY]; moved = false; });
  view.addEventListener('pointermove', (e) => { if (down && e.buttons && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) { busy(5000); moved = true; figureFocus(0); } });
  addEventListener('pointerup', () => { if (down) { down = null; if (app.classList.contains('stage-busy')) busy(600); if (moved) figureFocus(3000); else unfocus(); } });
  addEventListener('pointercancel', () => { if (down) { down = null; busy(300); if (moved) figureFocus(3000); } });
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
function sheetBehaviour(el, { handle, drag, onClose, active = () => true, fit = null, anywhere = false }) {
  const SIZES = [0.32, 0.56, 0.9], THUMB = [0.62, 1];
  const thumb = () => app.classList.contains('thumb') && isPhone();
  const stops = () => (thumb() ? THUMB : SIZES);
  const half = () => stops().length - 2;
  // The room a thumb sheet may fill: the CSS cap (100% - top bar - tab row - 22 px, styles/app.css thumb block).
  const room = () => (thumb() ? app.clientHeight - (parseFloat(app.style.getPropertyValue('--top-safe')) || 0) - (parseFloat(app.style.getPropertyValue('--nb-occ')) || 0) - 22 : 0);
  let size = 1;
  el.prepend(handle);
  const natural = () => {
    if (!fit || !isPhone() || el.hidden) return Infinity;
    const cs = getComputedStyle(el);
    // The body fills the sheet, so its own height says nothing: measure down to its last child.
    const inner = (c) => { const l = c.lastElementChild; if (!l) return 0; const b = parseFloat(getComputedStyle(c).paddingBottom) + parseFloat(getComputedStyle(l).marginBottom); return l.getBoundingClientRect().bottom - c.getBoundingClientRect().top + c.scrollTop + b; };
    return [...el.children].reduce((a, c) => a + (c.matches(fit) ? inner(c) : c.offsetHeight), 0) + parseFloat(cs.paddingBottom) + parseFloat(cs.paddingTop);
  };
  const apply = () => {
    const S = stops(), r = room();
    size = Math.min(size, S.length - 1);   // (a phone turned upright or sideways changes the stops)
    const need = size === half() ? natural() : Infinity;
    el.classList.toggle('sheet-half', thumb() && size === half());   // (a phone's Tests card hides its longer words at Half)
    el.style.setProperty('--sheet-size', need < S[half()] * (r || app.clientHeight) ? `${Math.ceil(need)}px` : r ? `${Math.round(S[size] * r)}px` : `${Math.round(S[size] * 100)}%`);
  };
  // A new tab refits the sheet to its content (the height eases).
  if (fit) el.addEventListener('click', (e) => { if (size === half() && e.target.closest('[role="tab"]')) nextFrame(apply); });
  apply();
  handle.addEventListener('click', () => { if (!isPhone() || !active()) return; size = (size + 1) % stops().length; apply(); });
  let start = null, swallow = 0;
  // Controls keep their own gestures. With `anywhere` (a phone sheet), a vertical drag from any other spot on the
  // card moves it too; a sideways one is left alone, and content scrolled away from its top scrolls back first.
  const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), select, textarea, [role="slider"], [contenteditable]';
  const CONTROLS = 'button, a, input, select, textarea, label, [role="tab"], [role="slider"], [contenteditable]';
  const scroller = (t) => { for (let n = t; n && n !== el; n = n.parentElement) { if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n; } return null; };
  el.addEventListener('pointerdown', (e) => {
    if (start || !active() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const own = e.target === handle || !!e.target.closest(drag);
    // A tab in the head is most of the head on a phone: a vertical drag from it moves the sheet, a tap picks the tab.
    const headTab = own && thumb() && !!e.target.closest('[role="tab"]');
    // (Over the thumb dock buttons and tabs carry the pull too, so Treat moves from anywhere; a tap still clicks.)
    if (e.target !== handle && e.target.closest(thumb() && anywhere ? FIELDS : CONTROLS) && !headTab) return;
    if (!own && !(anywhere && isPhone())) return;
    const r = el.getBoundingClientRect(), mv = (el.style.translate || '0px 0px').split(' ').map(parseFloat);
    start = { id: e.pointerId, t0: performance.now(), x: e.clientX, y: e.clientY, h: r.height, H: room() || app.clientHeight, tx: mv[0] || 0, ty: mv[1] || 0, moved: false, base: 0, loose: !own || headTab, sc: own ? null : scroller(e.target) };
    // (Half's height, as apply() sets it: the content's own height when that is less)
    if (thumb() && size === stops().length - 1 && stops().length > 1) { start.full = true; start.half = Math.min(r.height, natural(), stops()[half()] * room()); }
  });
  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      const sc = start.sc;
      if (start.loose && (Math.abs(dx) > Math.abs(dy) || (sc && (sc.scrollTop > 0 || (dy < 0 && size === stops().length - 1))))) { start = null; return; }
      start.moved = true;
      // (Caught while it is still easing: the pull takes it over from where it is, without a jump. A tap leaves it easing.)
      start.base = thumb() && !start.full ? parseFloat(el.style.getPropertyValue('--sink')) || 0 : 0;
      stopSink(el);
      el.setPointerCapture?.(e.pointerId);   // (only once it moves: captured at once, a tap's click would land on the sheet, not the grabber)
    }
    el.classList.add('dragging');
    start.dy = dy + start.base;
    // Over the thumb dock a pull down slides the card down behind the tab row (--sink: moved and cut at its resting
    // bottom edge in one value, styles/app.css).
    // From Full a pull down shrinks the card the way a pull up grew it (15 Oct, Mohammad): its foot stays on the tab row and
    // its top follows the finger, slowing past Half, where it settles.
    if (thumb() && dy > 0 && start.full) { el.style.removeProperty('--sink'); const lo = start.half, h = start.h - dy; el.style.height = `${Math.max(60, h >= lo ? h : lo - (lo - h) * 0.25)}px`; }
    else if (thumb() && start.dy > 0) { el.style.height = ''; el.style.setProperty('--sink', `${start.dy}px`); }
    else if (isPhone()) { el.style.removeProperty('--sink'); el.style.height = `${Math.max(60, start.h - dy)}px`; }
    else el.style.translate = `${start.tx + dx}px ${start.ty + dy}px`;
  });
  // Once the sheet follows the finger, the page must not scroll under it, and the lift is not a tap.
  // (iOS hands a pull on scrollable content to the page and cancels the pointer before it has moved 6 px: a pull down
  // from anywhere on a thumb card, with its content at the top, is claimed here at once, so it always moves the card.)
  el.addEventListener('touchmove', (e) => {
    if (!start || !e.cancelable) return;
    if (start.moved) { e.preventDefault(); return; }
    const t = e.touches[0], dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (thumb() && dy > 0 && dy >= Math.abs(dx) && !(start.sc && start.sc.scrollTop > 0)) e.preventDefault();
  }, { passive: false });
  // (The click a drag's release makes is not a tap: swallowed if it comes within 350 ms, timed by the clock, not a timer a busy page runs late.)
  el.addEventListener('click', (e) => { if (performance.now() < swallow) { swallow = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  const end = (e) => {
    if (!start || (e && e.pointerId !== start.id)) return;
    const s0 = start; start = null;
    el.classList.remove('dragging');
    if (s0.moved) swallow = performance.now() + 350;
    if (!s0.moved || !isPhone()) return;
    if (thumb() && s0.dy > 0) {
      // (15 Oct, Mohammad) From Full a pull down always settles at Half, however fast; only a second pull, from Half,
      // closes the card: past a short way down or a quick flick. A short pull eases back where it was.
      const S = stops(), fromFull = size === S.length - 1 && S.length > 1;
      const flick = s0.dy / Math.max(1, performance.now() - s0.t0) > 0.9 && s0.dy > 40;
      if (fromFull) {
        // (the card eases from where the finger left it: back to Full after a short pull, to Half otherwise)
        if (s0.dy > 40) size = half();
        el.style.transition = 'height .22s var(--ease)'; apply(); el.style.height = '';
        setTimeout(() => { el.style.transition = ''; }, 240);
        stopSink(el); el.style.removeProperty('--sink');
        return;
      }
      const gone = flick || s0.dy > Math.min(90, s0.h * 0.3);
      if (!gone) { sinkTo(el, 0); return; }
      // Sinks out of sight behind the tab row, then closes (already gone, so the close plays nothing of its own).
      sinkTo(el, el.offsetHeight, 220, () => { el.dataset.swiped = '1'; onClose(); delete el.dataset.swiped; el.style.removeProperty('--sink'); });
      return;
    }
    const frac = el.getBoundingClientRect().height / s0.H, S = stops();
    el.style.height = '';
    if (frac < (thumb() ? 0.4 : SIZES[0] * 0.7)) { onClose(); return; }
    size = S.reduce((best, v, i) => (Math.abs(v - frac) < Math.abs(S[best] - frac) ? i : best), 0);
    apply();
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  // (Opening sizes the sheet at once: its height eases only for a change while it is open, so it never comes in
  // at the last size it had and shrinks into place, and the figure frames once.)
  return { open: () => { if (isPhone()) { size = half(); el.style.transition = 'none'; apply(); void el.offsetHeight; el.style.transition = ''; } }, closed: () => { stopSink(el); el.style.removeProperty('--sink'); el.style.translate = ''; el.style.height = ''; el.style.clipPath = ''; } };
}
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
  // timeline ... slightly above it as a pill and centered"); the sinusoid view hides the bar, so there the same pill sits
  // centred at the bottom, level with the zoom group. While presenting it stays in the top bar.
  const pres = app.classList.contains('presenting');
  const seg = $('#viewSeg'), home = pres ? $('#stageTop .sb-left') : app.classList.contains('sin-focus') ? $('#sinViews') : $('#nbViews');
  if (home && seg.parentElement !== home) home.append(seg);
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
  const treat = tab('treat', 'pill', 'Treat', () => { if (!treatOpen()) clear('treat'); $('#btnTreat').click(); });
  const tests = tab('tests', 'gauge', 'Tests', () => { if (!app.classList.contains('dock-open')) clear('tests'); $('#tabInstruments').click(); });
  const menuTab = (open) => (e) => { const a = e.currentTarget; if (a.getAttribute('aria-expanded') !== 'true') clear(); open(a); };
  const badge = h('span', { class: 'nb-badge', 'aria-hidden': 'true' });
  const hist = tab('history', 'clock', 'History', menuTab((a) => timeline.openHistory(a)));
  hist.append(badge);
  const layers = tab('layers', 'layers', 'Layers', menuTab(openLayersMenu));
  const more = tab('settings', 'gear', 'Settings', menuTab((a) => openSettings(a, true)));
  for (const b of [hist, layers, more]) b.setAttribute('aria-haspopup', 'dialog');
  $('#vdock').prepend(h('div', { class: 'nb-views', id: 'nbViews', 'data-safe': 'bottom', 'data-safe-pad': '12' }));
  $('#vdock').append(h('nav', { class: 'thumb-bar', id: 'thumbBar', 'aria-label': 'Patient tools' }, treat, tests, hist, layers, more));
  $('#stageView').append(h('div', { class: 'sin-views float-ui stage-blocker', id: 'sinViews' }));
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
  thumbMQ.addEventListener?.('change', syncThumb);
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
const treatOpen = () => !$('#treatCard').hidden;
function openTreat() {
  closeHistory();
  const el = $('#treatCard');
  if (isPhone()) { closePanel(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
  closePopover();
  const sync = [];
  const count = h('span', { class: 'card-meta' });
  const paintCount = () => { const n = chart.treatCount(store.get().params); count.textContent = n ? `${n} running` : ''; };
  sync.push(paintCount);
  const [tabs, pane] = chart.treatBody(sync, () => {});
  const body = h('div', { class: 'tc-body' }, pane, chart.treatChanges(sync));
  const grab = el.querySelector('.sheet-grab');
  el.replaceChildren(...[grab, h('div', { class: 'tc-head card-head' }, h('h2', { class: 'card-title' }, svgIcon('pill'), h('span', {}, 'Treat')), count,
    h('button', { class: 'ib card-close', 'aria-label': 'Close Treat', title: 'Close (Esc)', onclick: () => closeTreat({ focus: true }) }, icon('close'))), tabs, body].filter(Boolean));
  paintCount();
  treatOff?.();
  treatOff = store.on('params', () => { for (const fn of sync) fn(); });
  arrive(el);
  el.hidden = false;
  treatSheet?.open();
  $('#btnTreat').setAttribute('aria-expanded', 'true');
  refitStage();
  nextFrame(() => stage.relayout());
}
// Presenter puts every card, sheet and menu away (each fades out) and hands back a function that reopens them on exit.
function stashCards() {
  const was = { panel: panelShown(), treat: !$('#treatCard').hidden, dock: app.classList.contains('dock-open') };
  closePopover(); why?.close(); closeTreat(); closeHistory(); closePanel(); if (was.dock) setPanelTab('chart');
  return () => { if (was.panel) openPanel(); if (was.dock) openPanel('instruments'); if (was.treat) openTreat(); };
}
function closeTreat({ focus = false } = {}) {
  const el = $('#treatCard');
  if (el.hidden) return;
  if (focus) giveFocusBack(el, $('#btnTreat'));
  leave(el);
  el.hidden = true;
  treatOff?.(); treatOff = null;
  treatSheet?.closed();
  $('#btnTreat').setAttribute('aria-expanded', 'false');
  refitStage();
  nextFrame(() => stage.relayout());
}
// ── History card (Mac and iPad landscape) ───────────
// Every change and event, with a way back to each: the same list as the phone's History sheet, as a card in Treat's
// place on the right (one or the other), kept current while it is open.
let historyOff = null, historyPaint = null;
const historyOpen = () => !$('#historyCard').hidden;
function openHistory() {
  closeTreat(); closePopover();
  const el = $('#historyCard');
  const body = h('div', { class: 'tc-body' });
  const paint = () => { const top = body.scrollTop; body.replaceChildren(timeline.historyBody()); body.scrollTop = top; };
  el.replaceChildren(h('div', { class: 'tc-head card-head' }, h('h2', { class: 'card-title' }, svgIcon('clock'), h('span', {}, 'History')),
    h('button', { class: 'ib card-close', 'aria-label': 'Close History', title: 'Close (Esc)', onclick: () => closeHistory({ focus: true }) }, icon('close'))), body);
  paint();
  // (A change or an event adds a row; the count beside the button moves with every entry, including a finished snapshot.)
  const mo = new MutationObserver(() => { if (historyOpen()) paint(); });
  mo.observe($('#timeline .tl-hc'), { characterData: true, childList: true, subtree: true });
  if (!historyPaint) timeline.onChange(() => historyPaint?.());   // (registered once; it paints whichever card is open)
  historyPaint = paint;
  historyOff = () => { mo.disconnect(); historyPaint = () => {}; };
  arrive(el);
  el.hidden = false;
  $('#btnHistory').setAttribute('aria-expanded', 'true');
  refitStage();
}
function closeHistory({ focus = false } = {}) {
  const el = $('#historyCard');
  if (el.hidden) return;
  if (focus) giveFocusBack(el, $('#btnHistory'));
  leave(el);
  el.hidden = true;
  historyOff?.(); historyOff = null;
  $('#btnHistory').setAttribute('aria-expanded', 'false');
  refitStage();
  nextFrame(() => stage.relayout());
}

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  app.dataset.mode = mode;
  store.set({ focus: null });
  if (mode === 'explore') { store.set({ locked: null, hiddenReadouts: null, hiddenEvents: null, imaging: false, found: null }); setAllowedTools(null); }
  store.set({ selection: null, details: null });
  inspector.render();
  renderPaintHint(); renderBanner(); renderLegend();
  setPanelTab('chart');
}

// ── Keyboard (§8.5) ─────────────────────────────────
function wireKeyboard() {
  // J injects dye for as long as it is held (at least a few seconds).
  addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'j') stage.releaseDye(); });
  addEventListener('blur', () => stage.releaseDye());
  addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.isOpen() ? palette.close() : palette.open(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      const z = e.key === '=' || e.key === '+' ? 'in' : e.key === '-' || e.key === '_' ? 'out' : e.key === '0' ? 'fit' : null;
      if (z) { e.preventDefault(); if (z === 'in') stage.zoomIn(); else if (z === 'out') stage.zoomOut(); else stage.fit(); return; }
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') {
      // One Esc closes one thing: an open menu first, and only the menu (review #24).
      if (popoverOpen()) { closePopover(); return; }
      if (isModalOpen()) closeModal();
      else if (mainMenu.isOpen()) mainMenu.close();
      else if (projector) toggleProjector();
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
    if (e.key === '/') { e.preventDefault(); palette.open(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? doRedo : doUndo)(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest?.('.v-hit, button, .lb')) { e.preventDefault(); host.send({ type: 'run', running: !store.get().running }); return; }
    // With a card open, the number keys run its verbs in order.
    if (/^[1-9]$/.test(e.key) && card.isOpen()) { if (card.trigger(+e.key)) e.preventDefault(); return; }
    if (e.key === '.') { host.send({ type: 'run', running: true }); setTimeout(() => host.send({ type: 'run', running: false }), 60); return; }
    if (e.key === '[' || e.key === ']') {
      // One ladder: real-time speeds, then the time-lapse rates.
      const ladder = [...SPEEDS.map((v) => [v, false]), ...LAPSES.map(([d]) => [d, true])];
      const cur = store.get().lapse ? ladder.findIndex(([v, l]) => l && v === store.get().lapse) : ladder.findIndex(([v, l]) => !l && v === store.get().speed);
      const [v, lap] = ladder[Math.max(0, Math.min(ladder.length - 1, (cur < 0 ? 2 : cur) + (e.key === ']' ? 1 : -1)))];
      setSpeed(v, lap);
      toast(lap ? `Time-lapse ${LAPSES.find((l) => l[0] === v)[2]}` : `Speed ${v}×`);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'a' && !e.shiftKey) { if (store.get().sinusoid) return; store.set({ lobule: false, view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
    if ((k === 'l' || (e.key === 'C' && e.shiftKey)) && !store.get().imaging && !(store.get().lobule && store.get().sinusoid)) {
      const ks = lensKeys(), i = ks.indexOf(store.get().colorMode);
      const next = ks[(i + (e.shiftKey && k === 'l' ? ks.length - 1 : 1)) % ks.length];
      store.set({ colorMode: next }); toast(`Lens: ${LENSES[next][0]}. ${LENSES[next][1]}.`); return;
    }
    if (k === 'z') { settle(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (k === 'i') { dock.toggle(); return; }
    if (k === 't') { if (treatOpen()) closeTreat({ focus: true }); else openTreat(); return; }
    if (k === 'p') { timeline.togglePin(); return; }
    if (k === 'j' && !store.get().imaging) { if (!e.repeat) injectDye({ hold: true }); return; }
  });
}

// ── Projector look while presenting (§4.4) ──────────
let projector = false, bigEl = null, exitEl = null;
function toggleProjector() {
  projector = !projector;
  app.classList.toggle('projector', projector);
  if (projector) {
    bigEl = h('div', { class: 'big-overlay stage-blocker' });
    // The top bar (and its menu) is hidden in projector mode, so the way out is on the figure.
    exitEl = h('button', { class: 'btn projector-exit stage-blocker', title: 'Leave projector mode (Esc)', onclick: () => { if (projector) toggleProjector(); } }, icon('close'), 'Exit projector');
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
  const tabs = $$('.panel-tabs [role="tab"]');
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => openPanel(b.dataset.ptab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); openPanel(n.dataset.ptab);
    });
  });
  $('#tabInstruments').addEventListener('click', () => dock.toggle());
  $('#panelClose').addEventListener('click', () => closePanel({ focus: true }));
  $('#panelScrim').addEventListener('click', () => closePanel());
  setPanelTab('chart');
  syncPanelToggle();
}

// ── Help & first run ────────────────────────────────
function openHelp(section) {
  const rows = [
    ['Space', 'Play / pause'], ['[ ]', 'Slower / faster'], ['.', 'Step'], ['Z', 'Settle to equilibrium'], ['A', 'Anatomy ⇄ circuit'],
    ['I', 'Open / close Tests'], ['T', 'Open / close Treat'], ['L', 'Next vessel coloring (Shift: previous)'],
    ['Click', 'Open the actions for a vessel or organ'], ['1 – 9', 'Run an action on the open card'],
    ['Ctrl/⌘ Z', 'Back one change on the timeline (Shift: forward)'], ['P', 'Compare from here / stop comparing'], ['Esc', 'Cancel · close the card · close'], ['?', 'This guide'],
    ['Tab · Enter', 'Reach a vessel, open its actions'], ['← →', 'Walk vessels along the flow'], ['Ctrl/⌘ K or /', 'Search'],
  ];
  openModal('Guide', h('div', {},
    h('p', {}, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model. Nothing is scripted: change a resistance and watch the consequences propagate.'),
    h('div', { class: 'entry-grid' },
      [['explore', 'Act on the anatomy', 'Click any vessel or organ. A card opens beside it with what you can do there: narrow or clot a vein, make the liver cirrhotic, band varices, start a shunt.'],
        ['settle', 'One timeline', 'Play runs the heartbeat-scale model; +1 wk, +1 mo and +6 mo jump the disease ahead. Every change is a marker you can go back to, or compare from.'],
        ['bulb', 'Ask “Why?”', 'Click any readout for a causal breakdown of what is driving it, change by change.']].map(([ic, t, d]) => h('div', { class: 'entry', style: { cursor: 'default' } }, h('span', { class: 'eic' }, icon(ic)), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))),
    h('h3', { 'data-sec': 'keys' }, 'Keyboard'),
    h('div', { class: 'keys' }, rows.map(([k, v]) => h('div', {}, h('span', {}, v), h('kbd', {}, k)))),
    h('h3', {}, 'Reading the figure'),
    h('ul', {},
      h('li', {}, 'Veins are colored by mean pressure on a perceptually uniform scale (0–30 mmHg). Labels give the value in mmHg; ▲ / ▼ is the change from healthy, shown from 5 mmHg. Arteries are thinner, in a fixed red.'),
      h('li', {}, 'Streaks of blood move downstream, brighter where flow is greater, faster where velocity is higher, fastest along the axis (laminar flow); chevrons (Blood menu) point the way. Smoke marks stagnant blood in a large vein. Coloring the vessels by blood origin shows where blood comes from. Tap a vessel and use Inject dye on its card (or press J; hold for longer) to watch dye travel and split. Dotted vessel outlines are closed potential collaterals.'),
      h('li', {}, 'Line width follows vessel diameter (compressed, so the cavae don’t drown the portal tree). Watch collaterals and varices swell.'),
      h('li', {}, 'The circuit view is a transit map: pressure falls from left to right; collaterals and shunts run in their own lanes as bypasses.')),
    h('h3', {}, 'Thresholds & references'),
    h('p', { class: 'sub' }, 'Baveno VIII consensus on portal hypertension (2026), building on Baveno VII (2022); AASLD guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Thresholds apply to gradients (HVPG, direct portal–systemic gradient), never to the pressure at a single vessel. Physiology after Guyton; Lautt (hepatic arterial buffer response); Bosch & Groszmann (HVPG).'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. The model is simplified and its values are illustrative; do not use it for diagnosis or treatment decisions.')), { wide: true });
  scrollToSection(section);
}
// Help and About open at a named section (Keyboard shortcuts, References).
function scrollToSection(section) { if (section) nextFrame(() => $(`#modal [data-sec="${section}"]`)?.scrollIntoView({ block: 'start' })); }
const pmid = (id) => h('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, target: '_blank', rel: 'noopener' }, `PMID ${id}`);
function openAbout(section) {
  openModal('About the model', h('div', {},
    h('p', {}, 'Created by ', h('b', {}, AUTHOR), '. ', h('a', { href: AUTHOR_URL, target: '_blank', rel: 'noopener' }, 'See all of the author’s teaching\u00a0tools'), '.'),
    h('p', {}, `The model, patients and presentations are dated ${CONTENT_UPDATED} and change only when that date does, so a class taught on them behaves the same all term.`),
    h('h3', {}, 'The model'),
    h('p', {}, 'A lumped-parameter hemodynamic network of the splanchnic, portal, hepatic and systemic veins with the heart, arterial inflow and the hepatic arterial buffer; collateral recruitment and remodeling on a disease clock; Starling filtration and lymph for ascites; Laplace wall tension for varices; blood volume, bleeding and transfusion. Every number on screen comes out of it; nothing is scripted.'),
    h('h3', {}, 'Validation targets'),
    h('p', { class: 'sub' }, 'Each is an automated test that must pass before a release:'),
    h('ol', { class: 'refs' }, VALIDATION.map((v) => h('li', {}, v))),
    h('h3', {}, 'Status colors'),
    h('p', { class: 'sub' }, 'Every readout’s dot, bar and status word follow a clinical cut-off; the ticks on its bar mark the cut-offs below. A change (▲ / ▼) is drawn in neutral ink and appears only when a value keeps moving for several seconds, never for the heartbeat or breathing. Red means a threshold has been crossed.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'cut-table' },
      h('thead', {}, h('tr', {}, ['Readout', 'Normal', 'Borderline', 'Past a threshold', 'High risk'].map((x, i) => h('th', {}, i ? h('span', { class: 'cut-h', 'data-sev': ['', 'ok', 'caution', 'danger', 'critical'][i] }, x) : x)))),
      h('tbody', {}, CUTOFFS.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))))),
    h('p', { class: 'sub' }, 'Thresholds belong to gradients, not to the color of a vessel. HVPG ≥ 10 mmHg is clinically significant portal hypertension in cirrhosis. HVPG ≥ 20 mmHg matters as a prognostic finding when measured during an acute variceal bleed. 12 mmHg is not a bleeding threshold: varices can bleed below it, and it is only a usual post-TIPS target for the direct gradient.'),
    h('h3', {}, 'Reference review'),
    h('p', {}, 'The presentations follow Baveno VIII (J Hepatol, August 2026), with AASLD guidance where US practice differs (octreotide). Baveno VIII changed the recompensation criteria (more than 6 months, Child–Pugh A), the gray zone for stiffness (ANTICIPATE probability of 75% or more, or spleen stiffness of 55 kPa or more), the window for pre-emptive TIPS and anticoagulation for portal vein thrombosis. Baveno VIII statements were taken from published summaries; a line-by-line check against the full text is still pending.'),
    h('h3', {}, 'Clinical review'),
    h('p', {}, 'Presentation and patient content follows the guidance below. An external clinical advisory review with named reviewers is pending; their sign-off will be listed here.'),
    h('h3', { 'data-sec': 'refs' }, 'References'),
    h('ol', { class: 'refs' },
      h('li', {}, 'de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74. ', pmid(35120736)),
      h('li', {}, 'Baveno VIII: advancing consensus in portal hypertension. J Hepatol, August 2026. ', pmid(42624290)),
      h('li', {}, 'Kaplan DE, et al. AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis. Hepatology 2024;79:1180–1211.'),
      h('li', {}, 'Bosch J, Groszmann RJ, et al. Measurement of portal pressure (HVPG). Hepatology / Semin Liver Dis.'),
      h('li', {}, 'Prognostic role of endoscopic ultrasound-guided direct portal pressure gradient measurement in porto-sinusoidal vascular disorder. Liver Int 2025. Mean direct gradient 16.7 and mean HVPG 5.5 mmHg. ', pmid(40251984)),
      h('li', {}, 'Directly measured portal pressure gradient and variceal hemorrhage in patients undergoing TIPS: bleeding occurred below 12 mmHg. ', pmid(7485008)),
      h('li', {}, 'Hepatic venous pressure gradient and prognosis in patients with acute variceal bleeding treated with pharmacologic and endoscopic therapy. ', pmid(18093686)),
      h('li', {}, 'Lautt WW. Hepatic Circulation: Physiology and Pathophysiology. Morgan & Claypool, 2009.'),
      h('li', {}, 'Guyton AC. Venous return and the systemic filling pressure.')),
    h('h3', {}, 'Licenses'),
    h('p', { class: 'sub' }, '© 2026 Mohammad Almeqdadi. All rights reserved. Fonts: Inter, JetBrains Mono and Source Serif 4 under the SIL Open Font License, served from this site. Anatomy, pathology art and icons were drawn for this project.'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. Simplified model with illustrative values; not for diagnosis or treatment decisions.')), { wide: true, sub: `Updated ${UPDATED}` });
  scrollToSection(section);
}
function openPrivacy() {
  const keys = (() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('pps.')); } catch { return []; } })();
  openModal('Privacy', h('div', {},
    h('p', {}, 'The simulator runs entirely in your browser. It makes no requests to any other site: no analytics, no trackers, no advertising, no third-party fonts or scripts. There is no account and no server that stores anything about you.'),
    h('p', {}, 'What stays on this device, in your browser’s storage: your preferences (theme) and presenter scripts you create. It leaves the device only when you share it (a link or a script file).'),
    h('p', {}, 'For institutions: no personal data is processed by the publisher, which supports FERPA and GDPR compliance.'),
    h('p', { class: 'sub' }, keys.length ? `Stored now: ${keys.join(', ')}.` : 'Nothing is stored on this device yet.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => { if (!confirm('Delete everything this simulator has stored on this device?')) return; for (const k of keys) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } } closeModal(); toast('Your data on this device has been cleared.'); } }, 'Clear my data on this device'))));
}
// Launch goes straight into the simulator, the first time included. Only a deep link
// (?script=, ?preset=, ?home=) opens anything else.
function firstRun() {
  try { localStorage.setItem('pps.seen', '1'); } catch { /* storage unavailable */ }
}
main().catch((err) => { console.error(err); document.body.append(h('pre', { style: { position: 'fixed', bottom: 0, left: 0, background: 'var(--white)', color: 'var(--critical)', padding: '8px', zIndex: 999 } }, String(err.stack || err))); });
