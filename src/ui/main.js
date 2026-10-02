// Application bootstrap: wires the engine host to the four surfaces (figure + action card,
// timeline, patient chart, instruments) and to Home, the command palette and the menus.

import { startHost, host } from './host.js?v=d292ccefe8';
import { store, updateParams, replaceParams, bindParamSender, clearHistory } from './store.js?v=f9424489c6';
import { createStage } from './stage.js?v=abc676313a';
import { createInspector } from './inspector.js?v=208b6a3592';
import { createDock, CUTOFFS } from './dock.js?v=3d7d80691a';
import { createWhy } from './why.js?v=bf0f24a7a5';
import { createTimeline } from './timeline.js?v=7bf66ab2fb';
import { createLearn } from './learn.js?v=a48578b939';
import { createCases } from './cases.js?v=02646abf69';
import { createCompare } from './compare.js?v=730844b101';
import { createCard } from './card.js?v=b4e4866d47';
import { createChart, computeFindings } from './chart.js?v=4a51ff6198';
import { createHome } from './home.js?v=5538efbe12';
import { applyI18n, setLang, LANGS, t, currentLang } from '../i18n/i18n.js?v=1ad6d8253b';
import { describe, announce, setSonify, sonifying, sonifyFrame } from './a11y.js?v=e7e5c98a1c';
import { startLMS } from './lms.js?v=4511ed56b8';
import { APP_VERSION, CONTENT_VERSION, RELEASED, VALIDATION, AUTHOR, AUTHOR_URL } from '../version.js?v=1ecade66d2';
import { toolsToVerbs, normalizeSel, shuntable } from './actions.js?v=455d2754a5';
import { gradientCss, PRESSURE_TICKS, flowCss, flowPos, velocityCss, velPos, heatCss, HEAT_MAX } from './colormap.js?v=6d64a94345';
import { EDGES, NODES } from '../engine/topology.js?v=29d10ad9ef';
import { $, $$, h, icon, fmt, fmtFlow, toast, tooltipFor, openModal, closeModal, isModalOpen, units, popover, closePopover, menuItem, svgIcon } from './util.js?v=fe164f31f1';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const app = $('#app');
const view = $('#stageView');
const isPhone = () => matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Everything the learner does is a verb on the structure they click (actions.js, card.js); the
// only armed gesture left is a shunt waiting for its target.
import { ORIGINS } from './blood.js?v=3acf4e936e';

// Color lenses: [title, what it shows, legend swatch].
// SMV, IMV, splenic vein, hepatic artery, systemic: as stage.js BLOOD_COLORS.
const ORIGIN_CSS = ['rgb(230, 153, 41)', 'rgb(23, 158, 140)', 'rgb(125, 92, 219)', 'rgb(214, 51, 71)', 'rgb(112, 143, 191)'];
const LENSES = {
  pressure: ['Pressure', 'Venous pressure in each vessel', () => gradientCss('to right', 30)],
  delta: ['Change', 'Higher or lower than healthy', () => 'linear-gradient(to right, #2D6CDF, #9696A0, #D22846)'],
  heat: ['Congestion', 'Where pressure has backed up', () => heatCss('to right')],
  drop: ['Pressure drop', 'Where the resistance lives', () => gradientCss('to right', 30)],
  flow: ['Flow volume', 'How much blood; width = flow', () => flowCss('to right')],
  velocity: ['Velocity', 'How fast; red = stagnant', () => velocityCss('to right')],
  direction: ['Direction', 'Toward the liver or away', () => 'linear-gradient(to right, var(--flow-normal) 50%, var(--flow-reversed) 50%)'],
  origin: ['Blood origin', 'Where each vessel\u2019s blood comes from', () => `linear-gradient(to right, ${ORIGIN_CSS.map((c, i) => `${c} ${i * 20}% ${(i + 1) * 20}%`).join(', ')})`],
};
const COLOR_MODES = { pressure: 'Pressure', delta: 'Change', heat: 'Congestion', drop: 'Pressure drop', flow: 'Flow volume', velocity: 'Velocity', direction: 'Flow direction', origin: 'Blood origin' };
const GROUP_COLOR = { Normal: 'var(--ok)', Prehepatic: 'var(--s1)', Presinusoidal: 'var(--s7)', Sinusoidal: 'var(--s5)', Postsinusoidal: 'var(--s2)', Posthepatic: 'var(--s4)', Cardiac: 'var(--s8)' };

let stage, inspector, dock, why, timeline, learn, cases, compare, card, chart, home;

// Surfaces most sessions never open (the command palette, the figure plate, the presenter) load
// on first use, so the first paint only waits for the model, the figure and the chart.
function lazy(load, make) {
  let inst = null, pending = null;
  const get = () => (pending ||= load().then((m) => (inst = make(m))));
  // Fetching the module (without creating the surface) once the app is idle keeps it cached for
  // offline use and makes the first open instant.
  return { get, now: () => inst, warm: () => load().catch(() => {}) };
}
let paletteL, figureL, presenterL;
const palette = {
  open: () => paletteL.get().then((p) => p.open()),
  close: () => paletteL.now()?.close(),
  isOpen: () => !!paletteL.now()?.isOpen(),
};
const figure = {
  open: () => figureL.get().then((f) => { if (app.classList.contains('figure-mode')) { f.open(); const fr = store.get().frame; if (fr) f.update(fr); } }),
  close: () => figureL.now()?.close(),
  update: (f) => figureL.now()?.update(f),
  exportFile: (k) => figureL.get().then((f) => f.exportFile(k)),
  buildSVG: (...a) => figureL.get().then((f) => f.buildSVG(...a)),
};
const presenter = {
  home: () => presenterL.now()?.home() ?? (presenterL.get().then(() => { if (home.isOpen()) home.render(); }), h('div', { class: 'home-loading' }, 'Loading…')),
  start: (id) => presenterL.get().then((p) => p.start(id)),
  stop: () => presenterL.now()?.stop(),
  readLink: () => (/#script=/.test(location.hash) ? presenterL.get().then((p) => p.readLink()) : false),
  active: () => !!presenterL.now()?.active(),
};

async function main() {
  applyTheme(readLS('pps.theme'));
  applyI18n();
  startLMS();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  store.set({ role: readLS('pps.role') || 'student' });
  const kind = await startHost();
  console.info(`Engine running in ${kind === 'worker' ? 'a Web Worker' : 'the main thread'}.`);
  app.dataset.engine = kind;
  document.addEventListener('visibilitychange', () => host.send({ type: 'visibility', visible: !document.hidden }));
  host.send({ type: 'visibility', visible: !document.hidden });
  bindParamSender((params, settle) => host.send({ type: 'setParams', params, settle }));

  const healthy = await host.request('healthyProfile');
  store.set({ healthy: { P: healthy.P, Q: healthy.Q, metrics: healthy.metrics } });
  const { presets } = await host.request('presets');
  store.set({ presetList: presets });

  why = createWhy($('#whyPop'));
  stage = createStage({
    wrap: view,
    onSelect: (sel, opts) => { store.set({ selection: sel }); if (opts?.keyboard) setTimeout(() => card?.focusFirst(), 30); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id, { reveal: 'soft' }),
    onHoverInfo: hoverInfo,
    onViewChange: () => card?.position(),
  });
  compare = createCompare();
  timeline = createTimeline({
    root: $('#timeline'), onWhy: (m, el) => why.open(m, el),
    onPlay: () => host.send({ type: 'run', running: !store.get().running }),
    onSpeed: (v) => setSpeed(v),
    onJump: (d) => host.send(d === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days: d }),
    onRestart: () => restartPatient(),
    canRevert: () => store.get().mode !== 'cases',
    scenarioLabel: () => store.get().presetList?.find((x) => x.id === store.get().presetId)?.label || 'Custom',
  });
  chart = createChart({
    onWhy: (m, el) => why.open(m, el), flash: (ids) => stage.flash(ids), onScenarios: (el) => openScenarios(el),
    action: doAction, startShunt: (id, o) => stage.startShunt(id, o), select: (sel) => store.set({ selection: sel }), timeline, pinned: () => compare.section(),
  });
  inspector = createInspector($('#inspector'), {
    onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id, { reveal: true }),
    onScenarios: () => openScenarios($('#scenarioBtn')), onMode: (m) => store.set({ mode: m }), chart,
  });
  dock = createDock({ strip: $('#strip'), head: $('#dockHead'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => host.send({ type: 'probe', id }), onReveal: revealDock, onLobule: () => zoomLobule('R'), onCompare: () => timeline.togglePin(), onRun: () => host.send({ type: 'run', running: !store.get().running }),
    onOpen: () => openPanel('instruments'), onClose: () => setPanelTab('chart'), isVisible: () => app.classList.contains('dock-open'),
    marks: () => timeline.entries(), onBeat: (on) => { dockBeat = on; sendBeat(); } });
  const api = { beginSession, endSession, onEnd: () => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); }, muteEvents: () => {}, loadPreset, setTool, setAllowedTools, action: doAction, showPane: (id) => dock.show(id, { reveal: true }), setProbe: (id) => host.send({ type: 'probe', id }), openPanel, setBanner, select: (sel) => store.set({ selection: sel }) };
  // A lesson keeps its card in view where the panel covers the figure: instruments it opens are
  // flagged, not forced.
  learn = createLearn({ host: $('#panelLesson'), coach: $('#coach'), stage, panel: $('#panelChart'), dock, inspector, onWhy: (m, el) => why.open(m, el), ...api, showPane: (id) => dock.show(id, { reveal: 'lesson' }) });
  cases = createCases({ root: $('#panelCase'), api });
  presenterL = lazy(() => import('./presenter.js?v=bb270a7c6c'), ({ createPresenter }) => createPresenter({ loadPreset, updateParams, host, stage, dock, action: doAction,
    projectorOn: () => { if (!projector) toggleProjector(); }, projectorOff: () => { if (projector) toggleProjector(); },
    closeHome: () => home.close(), rerenderHome: () => { if (home.isOpen()) home.render(); } }));
  home = createHome({
    el: $('#home'), brandMark,
    onPreset: async (id) => { home.close(); if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); await loadPreset(id); },
    onLesson: (id) => { home.close(); startLesson(id); },
    onCase: (id) => { home.close(); startCase(id); },
    onPresenter: () => presenter.home(),
    onClose: () => home.close(),
    onClosed: () => { if (homeStale) { homeStale = false; const f = store.get().frame; if (f) { lastPaint = 0; onFrame({ ...f, changed: true, events: [], params: undefined }); } } },
  });
  paletteL = lazy(() => import('./palette.js?v=7cedcafea1'), ({ createPalette }) => createPalette({ ctx: {
    select: (sel) => store.set({ selection: sel }), action: doAction, probe: (id) => host.send({ type: 'probe', id }), showPane: (id) => dock.show(id, { reveal: true }),
    wedge: () => { store.set({ selection: { type: 'edge', id: 'RHV_IVC' } }); setTimeout(() => card.trigger(3), 60); },
    jump: (d, l) => timeline.jump(d, l), undo: () => timeline.undo(), pin: () => timeline.togglePin(), lenses: Object.fromEntries(Object.entries(LENSES).map(([k, v]) => [k, v])),
    zoomLobule: () => zoomLobule('R'), figure: () => toggleFigure(true), exportFile: (k) => { toggleFigure(true); setTimeout(() => figure.exportFile(k), 400); }, projector: () => toggleProjector(), instruments: () => dock.toggle(),
    loadPreset: async (id) => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); await loadPreset(id); toast(store.get().presetList.find((p) => p.id === id)?.label); },
    lesson: (id) => startLesson(id), caseStart: (id) => startCase(id), home: () => home.open(), theme: () => toggleTheme(), help: () => openHelp(), share, restart: () => restartPatient(), reset: () => resetEverything(),
  } }));
  figureL = lazy(() => import('./figure.js?v=29443541e4'), ({ createFigure }) => createFigure({ app, stage, onClose: () => toggleFigure(false) }));
  card = createCard({
    view, stage, onWhy: (m, el) => why.open(m, el),
    onDetails: (sel) => { store.set({ details: normalizeSel(sel) || sel }); openPanel(); },
    ctx: {
      action: doAction, showPane: (id) => dock.show(id, { reveal: true }), probe: (id) => host.send({ type: 'probe', id }),
      startShunt: (id) => stage.startShunt(id), canShunt: (id) => shuntable(id), select: (sel) => store.set({ selection: sel }),
      zoomLobule: (lobe) => zoomLobule(lobe), paneApi: (id) => dock.pane(id),
      injectDye: (id, o) => stage.injectDye(id, o), releaseDye: () => stage.releaseDye(), dyeInjecting: () => stage.dyeInjecting(),
      canDye: () => !store.get().imaging,
    },
  });

  renderPaintHint();
  buildHud();
  wireTopbar();
  wireFloating();
  // iOS scrolls the whole page to reveal a focused field, which pushes the top bar up under the
  // status bar of an installed app; the page itself never scrolls, so put it back.
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
  wireKeyboard();
  wirePanel();

  host.on('frame', onFrame);
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see the console.', 'bad'); });

  const syncViewSeg = () => { const st = store.get(), cur = st.lobule ? 'lobule' : st.view; $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === cur))); };
  store.on('view', (v) => { stage.setView(v); syncViewSeg(); });
  store.on('lobule', syncViewSeg);
  store.on('tool', (t) => {
    for (const c of [...view.classList]) if (c.startsWith('tool-')) view.classList.remove(c);
    view.classList.add('tool-' + t);
    renderPaintHint();
  });
  store.on('shunting', renderPaintHint);
  store.on('mode', onMode);
  store.on('layers', () => { app.classList.toggle('chips-off', !store.get().layers.chips); syncBloodBtn(); redraw(); });
  store.on('presetId', (id) => { $('#scenarioName').textContent = $('#panelName').textContent = presets.find((p) => p.id === id)?.label || 'Custom'; });
  store.on('role', (r) => { try { localStorage.setItem('pps.role', r); } catch { /* storage unavailable */ } app.dataset.role = r; card.render(); });
  app.dataset.role = store.get().role;
  for (const k of ['compareSnap', 'compareView', 'colorMode', 'imaging']) store.on(k, () => { renderLegend(); renderBanner(); redraw(); });
  store.on('compareSnap', () => { if (!store.get().details) inspector.render(); });
  store.on('focus', redraw);
  store.on('selection', redraw);

  // Console handle for educators preparing a class (and for automated screenshots).
  window.pps = { loadPreset, store, updateParams, setTool, dock, stage, host, toggleFigure, figure, card, timeline, home, palette, startLesson, startCase, presenter };
  if (await presenter.readLink()) home.open('present');
  const shared = readShare();
  if (shared) await loadShared(shared); else timeline.reset();
  inspector.render();
  if (!(await openDeepLink())) firstRun();
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  setTimeout(() => idle(() => { paletteL.warm(); figureL.warm(); presenterL.warm(); }), 3000);
  addEventListener('pps:lang', () => { if (home.isOpen()) home.render(); });
  if (readLS('pps.sonify') === '1') addEventListener('pointerdown', () => setSonify(true), { once: true });
}
// Deep links, for an LMS or a syllabus: ?lesson=<id>, ?case=<id>, ?script=<id>, ?preset=<id>,
// ?home=explore|learn|cases|present. They open straight into that activity.
async function openDeepLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('lesson')) { startLesson(q.get('lesson')); return true; }
  if (q.get('case')) { startCase(q.get('case')); return true; }
  if (q.get('script')) { presenter.start(q.get('script')); return true; }
  if (q.get('preset')) {
    const id = q.get('preset'), list = store.get().presetList || [];
    if (list.some((p) => p.id === id)) { await loadPreset(id); return true; }
    const near = list.find((p) => (p.id + ' ' + p.label).toLowerCase().includes(id.toLowerCase().split(/[-\s]/)[0]));
    toast(`No patient called “${id}”.${near ? ` Showing ${near.label}.` : ''}`, 'bad');
    if (near) { await loadPreset(near.id); return true; }
    return false;
  }
  if (q.get('home')) { home.open(q.get('home')); return true; }
  return false;
}
const redraw = () => { const f = store.get().frame; if (f) stage.update(viewFrame(f)); };

// ── Frames ──────────────────────────────────────────
let lastClockTxt = '', lastFig = 0;
function viewFrame(f) {
  const st = store.get();
  if (st.compareSnap && st.compareView === 'A') return st.compareSnap.frame;
  return f;
}
// The engine ticks ~30×/s, but pressures ease over seconds, so the anatomy, readouts and panel
// are repainted at most ~10×/s (the chevrons animate separately). Repainting the whole SVG plate
// on every tick kept the main thread busy and the laptop warm for no visible gain.
let lastPaint = 0, lastDesc = 0, homeStale = false;
function onFrame(f) {
  if (f.params) replaceParams(f.params);
  if (f.events?.length) { const hid = store.get().hiddenEvents; const ev = hid ? f.events.filter((e) => !hid.has(e.id)) : f.events; if (ev.length) timeline.addEvents(ev); }
  const now = performance.now();
  if (!f.changed && !f.params && !f.events?.length && now - lastPaint < 80) return;
  lastPaint = now;
  store.set({ frame: f, running: f.running, clock: f.clock });
  // Home covers the whole workspace: keep the latest frame, paint it when Home closes.
  if (home?.isOpen()) { homeStale = true; return; }
  stage.update(viewFrame(f));
  card.update(f);
  dock.update(f);
  inspector.update(f);
  compare.update(f);
  timeline.update(f);
  const txt = f.day > 0 ? `Day ${f.day}` : `${fmt(f.t, 0)} s`;
  if (txt !== lastClockTxt) { lastClockTxt = txt; stageClock.textContent = txt; }
  updateBleedBanner(f);
  updateFindBadge(f);
  syncModeName();
  if (projector) updateProjector(f);
  sonifyFrame(f);
  if (now - lastDesc > 3000) { lastDesc = now; $('#stage').setAttribute('aria-description', describe(f)); }
  if (app.classList.contains('figure-mode') && performance.now() - lastFig > 500) { lastFig = performance.now(); figure.update(f); }
}

// ── Scenarios & share ───────────────────────────────
function openScenarios(anchor) {
  const presets = store.get().presetList;
  const groups = {};
  for (const p of presets) (groups[p.group] ||= []).push(p);
  const cur = store.get().presetId;
  const body = h('div', {},
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 10px 10px', gap: '12px' } },
      h('div', {}, h('div', { style: { fontWeight: 600, fontSize: 'var(--fs-16)' } }, 'Patient scenarios'), h('div', { class: 'sub' }, 'Grouped by where the resistance sits, from the gut to the heart.')),
      h('span', { class: 'muted', style: { fontSize: 'var(--fs-12)', whiteSpace: 'nowrap' } }, `${presets.length} scenarios`)),
    h('div', { class: 'scenario-grid' }, Object.entries(groups).map(([g, ps]) => h('div', { class: 'scn-group' },
      h('div', { class: 'menu-title' }, h('i', { style: { background: GROUP_COLOR[g] || 'var(--text-3)' } }), g),
      ps.map((p) => h('button', { class: 'scn', 'aria-current': String(p.id === cur), onclick: async () => {
        closePopover();
        await loadPreset(p.id);
        toast(p.days ? `${p.label}: ${p.days} simulated days applied.` : p.label);
      } }, h('span', { class: 't' }, p.label), h('span', { class: 'd' }, p.summary)))))));
  popover(anchor, body, { cls: 'scenario-pop', align: 'end' });
}

async function loadPreset(id, opts = {}) {
  const res = await host.request('preset', { id, days: opts.days });
  replaceParams(res.params);
  clearHistory();
  store.set({ presetId: id, lastHVPG: null, selection: store.get().mode === 'cases' ? null : store.get().selection, historyTick: (store.get().historyTick || 0) + 1 });
  timeline?.reset(store.get().presetList?.find((x) => x.id === id)?.label);
}

function encodeShare() {
  const st = store.get();
  const payload = { v: 1, preset: st.presetId, params: st.params, view: st.view };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readShare() {
  const m = location.hash.match(/#s=([\w-]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
}
async function loadShared(s) {
  await loadPreset(s.preset || 'healthy');
  if (s.params) updateParams(s.params, { settle: true, history: false });
  if (s.view) store.set({ view: s.view });
  timeline.flush();
  toast('Loaded the shared scenario.');
}
async function share() {
  const url = `${location.origin}${location.pathname}#s=${encodeShare()}`;
  try { await navigator.clipboard.writeText(url); toast('Link to this exact scenario copied.'); } catch { history.replaceState(null, '', url); toast('Link placed in the address bar.'); }
}

// ── Restart & reset ─────────────────────────────────
// Restart: the current patient from its first moment (during a lesson or case, its own start).
// Reset: everything back to a fresh start, as on a first visit but keeping the preferences
// (theme, units, language, role, progress): the page reloads without its links or state.
async function restartPatient() {
  const mode = store.get().mode;
  if (mode === 'cases') { toast('A case runs once. Exit the case to restart the patient.'); return; }
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
    h('p', {}, 'This leaves any lesson or case, clears the timeline, comparisons and every change, and reloads the simulator with a healthy patient. Your preferences, lesson progress and case scores are kept.'),
    h('div', { class: 'btn-row', style: { justifyContent: 'flex-end', marginTop: '8px' } },
      h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => { try { sessionStorage.clear(); } catch { /* storage unavailable */ } location.replace(location.pathname); } }, 'Reset and reload'))), { sub: null });
}

// ── Session boundaries ──────────────────────────────
// Entering a lesson or case remembers the model as it was; leaving one always asks whether to
// keep that patient or go back, so a running bleed never follows the learner into Explore.
let session = null;
async function beginSession(kind) {
  if (session) return;
  const { snap } = await host.request('snapshot');
  timeline.flush();
  session = { kind, snap, presetId: store.get().presetId, view: store.get().view, tl: timeline.save() };
}
function endSession(kind) {
  if (!session || session.kind !== kind) return;
  const saved = session;
  session = null;
  const f = store.get().frame;
  const bleeding = !!f?.metrics?.bleeding;
  const noun = kind === 'case' ? 'case' : 'lesson';
  const back = () => { closeModal(); host.send({ type: 'restore', snap: saved.snap }); replaceParams(saved.snap.params); clearHistory(); store.set({ presetId: saved.presetId, lastHVPG: null, historyTick: (store.get().historyTick || 0) + 1 }); timeline.load(saved.tl); toast('Back where you were before the ' + noun + '.'); };
  const keep = () => { closeModal(); toast(bleeding ? 'Kept the patient. The variceal bleed is still running.' : 'Kept this patient.'); };
  openModal(`Leaving the ${noun}`, h('div', {},
    h('p', {}, `Keep this patient to explore it further, or return to the model as it was before the ${noun}.`),
    bleeding ? h('div', { class: 'callout-note', style: { marginBottom: '12px', color: 'var(--danger)' } }, 'This patient is still bleeding from varices. Keeping them keeps the bleed running.') : null,
    h('div', { class: 'btn-row', style: { justifyContent: 'flex-end', marginTop: '8px' } },
      h('button', { class: 'btn', onclick: keep }, 'Keep this patient'),
      h('button', { class: 'btn primary', onclick: back }, 'Return to where I was'))), { sub: null });
}

function startLesson(id) { if (store.get().mode === 'cases') cases.exit(); store.set({ mode: 'learn' }); learn.start(id); }
function startCase(id) { if (store.get().mode === 'learn') learn.stop(); store.set({ mode: 'cases' }); cases.start(id); openPanel(); }

// ── Actions ─────────────────────────────────────────
function doAction(a) {
  if (a.kind === 'probe') { host.send({ type: 'probe', id: a.id }); return; }
  if (a.kind === 'paracentesisPrompt') { dock.show('abdomen', { reveal: true }); toast('Choose the volume in Ascites & paracentesis, then Drain.'); return; }
  host.send({ type: 'action', action: a });
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
      h('div', {}, only === 'tips' ? 'Click the hepatic vein where the stent should end. Glowing vessels are valid targets.' : 'Click the vein to connect it to. Glowing vessels are valid targets: a portal branch to a hepatic vein makes a TIPS, splenic to left renal a Warren shunt. Esc cancels.'));
    redraw();
    return;
  }
  el.hidden = true;
  redraw();
}
// The Lobule view: a view of its own beside Anatomy and Circuit.
function zoomLobule() { if (app.classList.contains('figure-mode')) toggleFigure(false); store.set({ lobule: true }); }

// ── Figure header: view, color, legend; banners ─────
let bleedEl, tipEl, stageClock;
function buildHud() {
  // Moving blood: chevrons are remembered per device; ?blood=chevrons turns them on for a link.
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('pps.blood') || 'null'); } catch { /* storage unavailable */ }
  const blood = { look: 'shimmer', phasic: false, chevrons: false, ...(saved && typeof saved === 'object' ? saved : {}) };
  delete blood.origin;   // now the Blood origin lens
  const asked = (new URLSearchParams(location.search).get('blood') || '').split(',');
  if (asked.includes('chevrons')) blood.chevrons = true;
  blood.look = 'shimmer'; blood.phasic = false;   // the Blood menu offers streaks and chevrons only
  store.set({ blood });
  store.on('blood', (v) => {
    try { localStorage.setItem('pps.blood', JSON.stringify(v)); } catch { /* storage unavailable */ }
    sendBeat(); syncBloodBtn();
    redraw();
  });
  $('#btnBlood').onclick = (e) => openBlood(e.currentTarget);
  syncBloodBtn();
  renderLegend();
  store.on('colorMode', () => { $('#colorModeLabel').textContent = COLOR_MODES[store.get().colorMode]; });
  bleedEl = $('#bleedPill');
  tipEl = h('div', { class: 'hover-tip', style: { display: 'none' } });
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
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => (b.dataset.view === 'lobule' ? zoomLobule() : store.set({ lobule: false, view: b.dataset.view }))));
  // The legend is the lens switcher: it shows what the colors mean and changes what they show.
  $('#btnLayers').addEventListener('click', (e) => openLayers(e.currentTarget));
  $('#btnLayers').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openLayers(e.currentTarget); } });
  new ResizeObserver(() => stage.relayout()).observe(view);
}
function legendModel() {
  const st = store.get();
  const imaging = st.imaging;
  const cmp = !!st.compareSnap;
  const m = imaging ? 'neutral' : cmp && st.compareView === 'D' ? 'delta' : st.colorMode;
  const ref = cmp ? st.compareSnap.when : 'healthy';
  return { m, ref, imaging };
}
function renderLegend() {
  const { m, ref } = legendModel();
  const el = $('#legend');
  const scale = (grad, nums, ticks = []) => h('div', { class: 'lg-scale' }, h('div', { class: 'lg-bar', style: { background: grad } }),
    ticks.map((p) => h('span', { class: 'lg-tick', style: { left: p + '%' } })),
    nums.map(([p, t]) => h('span', { class: 'lg-num', style: { left: p + '%' } }, t)));
  if (m === 'pressure' || m === 'drop') {
    const max = 30, at = (p) => (p / max) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, m === 'pressure' ? 'Mean venous pressure' : 'Pressure drop', h('small', {}, 'mmHg')),
      m === 'pressure' ? scale(gradientCss('to right', max), PRESSURE_TICKS.map((p) => [at(p), String(p)]), PRESSURE_TICKS.map(at))
        : scale(gradientCss('to right', max), [[0, '0'], [100, '12+']]));
    el.setAttribute('aria-label', m === 'pressure' ? 'Legend: mean venous pressure at each vessel, 0 to 30 millimeters of mercury, pale blue to dark magenta' : 'Legend: pressure drop across each vessel, 0 to 12 or more millimeters of mercury');
  } else if (m === 'flow') {
    const at = (v) => flowPos(v) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, 'Flow volume', h('small', {}, 'L/min · width ∝ √flow')),
      scale(flowCss('to right'), [[at(0.02), '0.02'], [at(0.1), '0.1'], [at(0.5), '0.5'], [at(1), '1'], [at(5), '5']], [at(0.1), at(1)]));
    el.setAttribute('aria-label', 'Legend: flow volume from 0.02 to 6 liters per minute on a log scale, pale mint to deep blue; line width grows with flow');
  } else if (m === 'velocity') {
    const at = (v) => velPos(v) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, 'Mean velocity', h('small', {}, 'cm/s')),
      scale(velocityCss('to right'), [[at(0), '0'], [at(5), '5'], [at(15), '15'], [at(30), '30'], [at(60), '60']], [at(5)]));
    el.setAttribute('aria-label', 'Legend: mean blood velocity from 0 to 60 centimeters per second; dark red is stagnant (below 5), green is free-flowing');
  } else if (m === 'heat') {
    const at = (v) => (v / HEAT_MAX) * 100;
    el.replaceChildren(h('div', { class: 'lg-title' }, 'Congestion', h('small', {}, `mmHg above ${ref}`)),
      scale(heatCss('to right'), [[at(0), '0'], [at(5), '5'], [at(10), '10'], [at(15), '15+']], []));
    el.setAttribute('aria-label', `Legend: pressure above ${ref}, 0 to 15 millimeters of mercury, grey to yellow to deep red, with a glow where congestion is highest`);
  } else if (m === 'direction') {
    el.replaceChildren(h('div', { class: 'lg-cats' }, h('span', {}, h('i', { style: { background: 'var(--flow-normal)' } }), 'Physiological'), h('span', {}, h('i', { style: { background: 'var(--flow-reversed)' } }), 'Reversed')));
    el.setAttribute('aria-label', 'Legend: teal is physiological flow direction, orange is reversed');
  } else if (m === 'origin') {
    // Dots, and on a narrow screen the short names (SMV, IMV, SV, HA, Sys), so the five fit.
    el.replaceChildren(h('div', { class: 'lg-cats lg-dots' }, ...ORIGINS.map(([, title, short], i) => h('span', { title }, h('i', { style: { background: ORIGIN_CSS[i] } }), h('b', { class: 'lg-long' }, title), h('b', { class: 'lg-short' }, short)))));
    el.setAttribute('aria-label', 'Legend: blood colored by where it comes from, as streams side by side: amber SMV (with the coronary vein), teal IMV, violet splenic vein, crimson hepatic artery, slate blue systemic');
  } else if (m === 'neutral') {
    el.replaceChildren(h('div', { class: 'lg-cats' }, h('span', {}, h('i', { style: { background: 'var(--vein-portal)' } }), 'Portal veins'), h('span', {}, h('i', { style: { background: 'var(--vein-systemic)' } }), 'Systemic veins'),
      h('span', { class: 'lg-note' }, svgIcon('info'), 'Pressures unmeasured')));
    el.setAttribute('aria-label', 'Legend: violet portal veins, blue systemic veins. Pressures are unmeasured in this case: investigate with the tools.');
  } else {
    el.replaceChildren(h('div', { class: 'lg-title' }, `Change from ${ref}`, h('small', {}, 'mmHg')),
      scale('linear-gradient(to right, #2D6CDF, #9696A0, #D22846)', [[0, '−12'], [50, '0'], [100, '+12']], [50]));
    el.setAttribute('aria-label', `Legend: change in pressure from ${ref}, blue lower, red higher, up to 12 millimeters of mercury`);
  }
  $('#colorModeLabel').textContent = m === 'neutral' ? 'Anatomy' : m === 'delta' && st().compareSnap ? 'Change since then' : COLOR_MODES[m];
}
const st = () => store.get();
function openLegend(anchor) {
  const { m, ref } = legendModel();
  const rows = m === 'pressure' ? [
    ['Scale', 'Mean venous pressure, perceptually uniform (OKLab) from 0 to 30 mmHg.'],
    ['Not a threshold', 'The color is the absolute pressure at that vessel, with numeric ticks only. Clinical thresholds apply to gradients, which are different measurements: HVPG (wedged − free hepatic venous pressure) and the direct portal–systemic gradient (portal vein − suprahepatic IVC). They are read in their own readouts, and compared side by side in the Pressure landscape and the Figure view.'],
  ] : m === 'drop' ? [['Scale', 'Pressure lost across each vessel (upstream − downstream). Bright segments are where the resistance sits.']]
    : m === 'flow' ? [['Scale', 'Blood flow through each vessel in L/min, log scale; line width also grows with flow (∝ √flow), like traffic volume on a city map. Labels give the flow into each station and its change from healthy.']]
    : m === 'velocity' ? [['Scale', 'Mean velocity (flow ÷ lumen area). Dark red below ~5 cm/s is near-stasis, where thrombosis is likely (e.g. portal vein thrombosis in advanced cirrhosis); green is free-flowing. The liver microcirculation is grey: it is a bed, not a single tube.']]
    : m === 'heat' ? [['Scale', `Congestion: how far pressure has risen above ${ref}. Grey is unchanged; the glow marks the territories under the most back-pressure.`]]
    : m === 'direction' ? [['Scale', 'Teal: flow in the physiological direction. Orange: reversed (e.g. hepatofugal portal flow).']]
      : m === 'neutral' ? [['Why no pressures?', 'In this case pressures are unmeasured, as at the bedside. Use the catheter, Doppler or endoscope to investigate.']]
        : [['Scale', 'Pressure now minus the reference (healthy, or the moment you compare from). Red higher, blue lower.']];
  popover(anchor, [h('div', { class: 'menu-title' }, 'How to read the figure'),
    h('div', { style: { padding: '2px 10px 8px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--fs-14)', lineHeight: 1.5, color: 'var(--text-2)', maxWidth: '340px' } },
      rows.map(([k, v]) => h('div', {}, h('b', { style: { color: 'var(--text)' } }, k + '. '), v)),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Moving blood. '), 'Blood moves the way the model\u2019s flow goes, as silky streaks, brighter where more blood passes. Lanes near the axis run faster than those near the wall (laminar flow: the centre at twice the mean). Time is slowed and speed compressed (it grows with \u221Avelocity), so the order of speeds is right but not their ratio. Where flow runs backwards (against its healthy direction) the moving blood turns orange. Drifting smoke marks slow flow (under ~5 cm/s) in a large vein, where clots can form. Pause and reduced motion hold the blood still; the Direction lens gives a static cue. The Blood menu above the figure switches the streaks and the chevrons (arrowheads) on or off. The Blood origin lens colors the blood by where it comes from (SMV, IMV, splenic vein, hepatic artery, systemic). A vessel\u2019s card injects dye into that vessel (hold to go on).'),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Notation. '), 'Dotted vessels are closed potential collaterals. In Flow volume, line width represents flow rate (square-root scale); in other lenses it follows vessel diameter (compressed). Faint lines crossing an organ run behind it. ▲ / ▼ on a label: change in mmHg from healthy, shown once it reaches 5 mmHg (while comparing, every change from the moment you compare from).'),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Organs. '), 'Organs are drawn as in an anatomy plate, lit from the upper left. On the liver, texture means disease: nodules for cirrhosis, mottling for congestion (nutmeg liver), a darker vignette as sinusoidal pressure rises. The spleen grows with splenomegaly.'),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Varix ring. '), 'The ring around the esophageal varices closes as their wall tension (pressure × radius ÷ wall thickness) approaches the rupture threshold: amber from 70 %, red from 90 %.'))], { align: 'end', cls: 'legend-pop' });
}
// ── Moving blood ─────────────────────────────────────
// The heartbeat (the model's pulsatile mode) runs while a waveform instrument is open, or while
// the blood is shown breathing and beating.
let dockBeat = false, beatSent = null;
function sendBeat() {
  const on = dockBeat || !!store.get().blood?.phasic;
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
function openBlood(anchor) {
  const st = store.get(), b = st.blood || {};
  const flowOn = st.layers.flow !== false;
  const toggle = (checked, label, sub, onChange) => {
    const c = h('input', { type: 'checkbox', checked });
    c.addEventListener('change', () => onChange(c.checked));
    return h('label', { class: 'menu-item blood-opt' }, c, h('span', {}, label, h('small', {}, sub)));
  };
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Moving blood'),
    toggle(flowOn, 'Streaks', 'Silky streaks carried by the flow', (on) => { store.set({ layers: { ...store.get().layers, flow: on } }); syncBloodBtn(); }),
    toggle(!!b.chevrons, 'Chevrons', 'Arrowheads moving with the flow; orange where it runs backwards', (on) => setBlood({ chevrons: on })),
  ], { cls: 'blood-pop' });
}
function openLayers(anchor) {
  const s0 = store.get();
  const cb = (key, label) => {
    const c = h('input', { type: 'checkbox', checked: s0.layers[key] !== false });
    c.addEventListener('change', () => store.set({ layers: { ...store.get().layers, [key]: c.checked } }));
    return h('label', { class: 'menu-item' }, c, label);
  };
  const cur = store.get().colorMode;
  const lens = (v) => {
    const [title, desc, sw] = LENSES[v];
    const b = h('button', { class: 'lens' + (cur === v ? ' on' : ''), role: 'menuitemradio', 'aria-checked': String(cur === v), onclick: () => { store.set({ colorMode: v }); closePopover(); } },
      h('span', { class: 'lens-sw', style: { background: sw() } }),
      h('span', { class: 'lens-t' }, title), h('span', { class: 'lens-d' }, desc));
    return b;
  };
  const unitSel = (kind, opts) => {
    const s = h('select', { class: 'select', style: { height: '30px', fontSize: 'var(--fs-14)' }, 'aria-label': kind === 'pressure' ? 'Pressure unit' : 'Flow unit' }, opts.map((u) => h('option', { value: u, selected: units[kind] === u }, u)));
    s.addEventListener('change', () => { units[kind] = s.value; inspector.render(); redraw(); });
    return s;
  };
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Color vessels by', h('span', { class: 'kb' }, 'Shift C cycles')),
    h('div', { class: 'lens-grid' }, Object.keys(LENSES).map(lens)),
    s0.imaging ? h('div', { class: 'ctl-sub', style: { padding: '2px 10px 6px' } }, 'This case shows anatomy only until you measure.') : null,
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Show'),
    cb('flow', 'Moving blood'), cb('chips', 'Pressure values on labels'), cb('collaterals', 'Potential collaterals (dotted)'), cb('labels', 'Organ names'),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, t('menu.units')),
    h('div', { style: { display: 'flex', gap: '6px', padding: '2px 10px 6px' } }, unitSel('pressure', ['mmHg', 'cmH2O', 'kPa']), unitSel('flow', ['L/min', 'mL/min'])),
    h('div', { class: 'menu-sep' }),
    menuItem('How to read the figure', { icon: 'info', onClick: () => { const a = $('#btnLayers'); closePopover(); openLegend(a); } }),
    menuItem('Figure view (export)', { icon: 'camera', kb: 'F', onClick: () => { closePopover(); toggleFigure(true); } }),
    menuItem('Projector mode', { icon: 'projector', kb: 'Shift F', onClick: () => { closePopover(); toggleProjector(); } }),
  ], { cls: 'layers-pop' });
}
// Active bleeding is a state, not an alarm: a steady status in the figure header.
let lastBleed = '';
function updateBleedBanner(f) {
  const b = f.metrics.bleeding;
  const txt = b ? `${b.site === 'GV' ? 'Gastric' : 'Variceal'} bleed · ${Math.round(b.rate)} mL/min` : '';
  if (txt === lastBleed) return;
  const changed = !!txt !== !!lastBleed;
  lastBleed = txt;
  bleedEl.hidden = !b;
  app.classList.toggle('bleeding', !!b);
  bleedEl.replaceChildren(h('span', { class: 'bp-dot' }), txt);
  bleedEl.title = b ? `${b.site === 'GV' ? 'Gastric' : 'Esophageal'} variceal bleeding: ${Math.round(b.rate)} mL/min, ${Math.round(f.metrics.blood.lost)} mL lost so far` : '';
  if (changed) redraw();
}
function hoverInfo(info) {
  const f = store.get().frame;
  const tool = store.get().tool;
  if (!info || !f || tool !== 'select' || store.get().shunting || isPhone() || store.get().imaging) { tipEl.style.display = 'none'; return; }
  const e = EDGES[EI[info.id]], k = EI[info.id];
  const D = Math.max(0.5, f.D[k]) / 10;
  const v = f.Q[k] / (Math.PI * D * D / 4);
  const r = (a, b) => h('div', { class: 'r' }, a, h('b', {}, b));
  tipEl.replaceChildren(h('div', { class: 't' }, e.label),
    r('Pressure', `${fmt(f.P[NI[e.from]], 1)} → ${fmt(f.P[NI[e.to]], 1)} mmHg`), r('Flow', `${fmtFlow(f.Q[k] * 0.06)} L/min`),
    r('Velocity', `${fmt(v, 1)} cm/s`), r('Diameter', `${fmt(f.D[k], 1)} mm`), h('div', { class: 'hint' }, 'Click for actions'));
  tipEl.style.display = '';
  const W = view.clientWidth, H = view.clientHeight;
  tipEl.style.left = Math.max(8, Math.min(W - 200, info.x + 16)) + 'px';
  tipEl.style.top = Math.max(8, Math.min(H - tipEl.offsetHeight - 8, info.y + 16)) + 'px';
}

// The figure header carries the Then / Now / Change switch when a moment is pinned; a lesson or
// case shows a slim banner in the top bar with its progress and a way out.
let bannerInfo = null;
function setBanner(info) { bannerInfo = info; renderBanner(); }
function renderBanner() {
  const el = $('#stageBanner');
  const s0 = store.get();
  const kids = [];
  if (s0.compareSnap) {
    kids.push(h('span', { class: 'cmp-label' }, `Comparing with ${s0.compareSnap.when}`));
    kids.push(h('div', { class: 'seg cmp-seg', role: 'group', 'aria-label': `Comparing with ${s0.compareSnap.when}: show` }, [['A', 'Then', `The model at ${s0.compareSnap.when}`], ['B', 'Now', 'The live model'], ['D', 'Change', `Change from ${s0.compareSnap.when} to now`]].map(([v, l, t]) => {
      const b = h('button', { 'aria-pressed': String((s0.compareView || 'B') === v), title: t }, h('b', {}, l));
      b.addEventListener('click', () => store.set({ compareView: v }));
      return b;
    })));
  }
  el.replaceChildren(...kids);
  const bar = $('#sessionBar');
  const inSession = bannerInfo && (s0.mode === 'learn' || s0.mode === 'cases');
  bar.hidden = !inSession;
  if (inSession) {
    const exit = h('button', { class: 'btn sm', onclick: () => (s0.mode === 'cases' ? cases.exit() : learn.stop()) }, `Exit ${s0.mode === 'cases' ? 'case' : 'lesson'}`);
    bar.replaceChildren(h('span', { class: 'b-tag' + (s0.mode === 'cases' ? ' case' : '') }, bannerInfo.tag), h('span', { class: 'b-text', title: bannerInfo.text }, bannerInfo.text), exit);
  }
  app.classList.toggle('in-session', !!inSession);
  view.querySelector('.cmp-badge')?.remove();
  if (s0.compareSnap && s0.compareView === 'A') view.append(h('div', { class: 'cmp-badge stage-blocker' }, `Showing ${s0.compareSnap.when}`));
  redraw();
}

// ── Top bar & transport ─────────────────────────────
function wireTopbar() {
  $('#btnMenu').addEventListener('click', (e) => openMainMenu(e.currentTarget));
  $('#scenarioBtn').addEventListener('click', (e) => openScenarios(e.currentTarget));
  $('#btnPalette').addEventListener('click', () => palette.open());
  $('#btnInspector').addEventListener('click', () => { if (panelShown() && !store.get().details) closePanel(); else { store.set({ details: null }); openPanel(); } });
  $('#btnTreat').addEventListener('click', () => (treatOpen() ? closeTreat() : openTreat()));
  for (const [id, side] of [['#btnPalette', 'bottom'], ['#btnTreat', 'bottom'], ['#btnInspector', 'bottom'], ['#zoomIn', 'left'], ['#zoomOut', 'left'], ['#zoomFit', 'left'], ['#rotateCircuit', 'left']]) {
    const b = $(id); tooltipFor(b, b.title, side); b.removeAttribute('title');
  }
}
// The main menu (the button at the top left, named after the current mode): where to go (Explore,
// Lessons, Cases, Presenter, Home), what to do with the figure (share, export, present), and the
// settings and help. It replaces the logo (which gave no sign it was a menu) and three icons.
const MODE_NAME = { explore: 'Explore', learn: 'Lesson', cases: 'Case', compare: 'Explore' };
function syncModeName() {
  const n = presenter.active() ? 'Presenter' : MODE_NAME[store.get().mode] || 'Explore', el = $('#modeName');
  if (el.textContent !== n) el.textContent = n;
}
function openMainMenu(anchor) {
  const mode = store.get().mode;
  const go = (tab) => () => { closePopover(); home.open(tab); };
  const sub = (label, ic, fn, d) => { const b = menuItem(label, { icon: ic, onClick: () => { closePopover(); fn(); } }); if (d) b.append(h('small', { class: 'mi-d' }, d)); return b; };
  const modeItem = (id, tab, ic, label, d) => { const b = sub(label, ic, go(tab), d); b.classList.add('mm-mode'); if (mode === id) b.setAttribute('aria-current', 'true'); return b; };
  popover(anchor, [
    h('div', { class: 'mm-head' }, brandMark(), h('div', {}, h('b', {}, 'Portal Pressure Simulator'), h('small', {}, 'Choose what to do'))),
    h('div', { class: 'mm-modes' },
      modeItem('explore', 'explore', 'explore', 'Explore a patient', 'Any of the patients, from healthy to Budd–Chiari'),
      modeItem('learn', 'learn', 'book', 'Lessons', 'Predict, observe, explain'),
      modeItem('cases', 'cases', 'case', 'Cases', 'A bleed at 3 a.m. and diagnostic puzzles'),
      modeItem('present', 'present', 'projector', 'Presenter', 'Step through a live model with a class')),
    menuItem('Home page', { icon: 'grid', onClick: () => { closePopover(); home.open(); } }),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Share & export'),
    menuItem('Copy a link to this exact state', { icon: 'share', onClick: () => { closePopover(); share(); } }),
    menuItem('Figure view', { icon: 'camera', kb: 'F', onClick: () => { closePopover(); toggleFigure(true); } }),
    menuItem('Export PNG (2×)', { icon: 'download', onClick: () => { closePopover(); toggleFigure(true); setTimeout(() => figure.exportFile('png'), 400); } }),
    menuItem('Export SVG (editable)', { icon: 'download', onClick: () => { closePopover(); toggleFigure(true); setTimeout(() => figure.exportFile('svg'), 400); } }),
    menuItem('Print', { icon: 'print', onClick: () => { closePopover(); toggleFigure(true); setTimeout(() => print(), 400); } }),
    menuItem('Projector mode', { icon: 'projector', kb: 'Shift F', onClick: () => { closePopover(); toggleProjector(); } }),
    h('div', { class: 'menu-sep' }),
    menuItem(t('menu.settings') + '…', { icon: 'gear', onClick: () => { closePopover(); setTimeout(() => openSettings(anchor), 0); } }),
    menuItem(t('menu.help') + '…', { icon: 'help', kb: '?', onClick: () => { closePopover(); setTimeout(() => openHelpMenu(anchor), 0); } }),
  ], { cls: 'main-menu', align: 'start' });
}
// Two menus with one job each: Settings (how the simulator looks and reads) and Help (how to
// use it, what it is, and who made it). The role ("I am a…") lives on Home, where a session starts.
function openSettings(anchor) {
  const cur = document.documentElement.getAttribute('data-theme') || 'system';
  const unitSel = (kind, opts) => {
    const sel = h('select', { class: 'select', 'aria-label': kind === 'pressure' ? 'Pressure unit' : 'Flow unit' }, opts.map((u) => h('option', { value: u, selected: units[kind] === u }, u)));
    sel.addEventListener('change', () => { units[kind] = sel.value; inspector.render(); card.render(); redraw(); });
    return sel;
  };
  popover(anchor, [
    h('div', { class: 'menu-title' }, t('menu.appearance')),
    h('div', { class: 'seg full menu-seg' }, [['light', t('menu.light')], ['dark', t('menu.dark')], ['system', t('menu.system')]].map(([v, l]) => { const b = h('button', { 'aria-pressed': String(cur === v) }, l); b.addEventListener('click', () => { closePopover(); applyTheme(v === 'system' ? null : v, v === 'system'); }); return b; })),
    h('div', { class: 'menu-title' }, 'Text size on the figure'),
    h('div', { class: 'seg full menu-seg', role: 'group', 'aria-label': 'Text size on the figure' }, [[0.85, 'Small'], [1, 'Default'], [1.15, 'Large'], [1.3, 'Larger']].map(([v, l]) => {
      const b = h('button', { 'aria-pressed': String(Math.abs(stage.labelScale() - v) < 0.01) }, l);
      b.addEventListener('click', () => { stage.setLabelScale(v); b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      return b;
    })),
    h('div', { class: 'menu-title' }, t('menu.units')),
    h('div', { class: 'menu-row' }, unitSel('pressure', ['mmHg', 'cmH2O', 'kPa']), unitSel('flow', ['L/min', 'mL/min'])),
    h('div', { class: 'menu-title' }, t('menu.language')),
    (() => { const sel = h('select', { class: 'select menu-select', 'aria-label': t('menu.language') }, LANGS.map(([v, l]) => h('option', { value: v, selected: currentLang() === v }, l))); sel.addEventListener('change', () => { setLang(sel.value); closePopover(); }); return sel; })(),
    h('div', { class: 'menu-title' }, t('menu.access')),
    menuItem(t('menu.describe'), { icon: 'info', kb: 'D', onClick: () => { closePopover(); const d = describe(store.get().frame); announce(d); toast(d); } }),
    menuItem(t('menu.sonify'), { icon: 'activity', checked: sonifying(), onClick: () => { closePopover(); setSonify(!sonifying()); toast(sonifying() ? 'Sonification on: pitch follows the pressure of the selected vessel (or the portal vein).' : 'Sonification off.'); } }),
    h('div', { class: 'menu-sep' }),
    menuItem(t('menu.reset'), { icon: 'reset', onClick: () => resetEverything() }),
  ], { align: 'start', cls: 'app-menu' });
}
function openHelpMenu(anchor) {
  popover(anchor, [
    h('div', { class: 'menu-title' }, t('menu.help')),
    menuItem(t('menu.guide'), { icon: 'book', onClick: () => { closePopover(); openHelp(); } }),
    menuItem(t('menu.shortcuts'), { icon: 'grid', kb: '?', onClick: () => { closePopover(); openHelp('keys'); } }),
    menuItem(t('menu.about'), { icon: 'info', onClick: () => { closePopover(); openAbout(); } }),
    menuItem(t('menu.refs'), { icon: 'case', onClick: () => { closePopover(); openAbout('refs'); } }),
    menuItem(t('menu.privacy'), { icon: 'lock', onClick: () => { closePopover(); openPrivacy(); } }),
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
function setSpeed(v) { store.set({ speed: v }); host.send({ type: 'run', speed: v, clock: 'hemo' }); }
function applyTheme(t, clear) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  try { if (t) localStorage.setItem('pps.theme', t); else if (clear) localStorage.removeItem('pps.theme'); } catch { /* storage unavailable */ }
  const f = store.get().frame; if (f) { stage?.update(viewFrame(f)); dock?.update(f); }
  syncStatusBar();
}
// The browser's and the installed app's status bar take the color of whatever sits under it: the
// figure (the top bar floats over it), or the start screen when it is open. The theme can differ from the system's, so the
// color comes from the page, not from a media query.
function syncStatusBar() {
  const homeEl = document.getElementById('home');
  const el = homeEl && !homeEl.hidden ? homeEl : document.getElementById('stageWrap');
  const c = el && getComputedStyle(el).backgroundColor;
  if (!c || c === 'rgba(0, 0, 0, 0)') return;
  let m = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!m) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => x.remove());
    m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m);
  }
  if (m.content !== c) m.content = c;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => syncStatusBar());
new MutationObserver(() => syncStatusBar()).observe(document.getElementById('home'), { attributes: true, attributeFilter: ['hidden'] });
// (again once the figure's background has finished its .5 s fade)
new MutationObserver(() => { syncStatusBar(); setTimeout(syncStatusBar, 600); }).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });
function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
// ── Patient chart, Treat card and instrument workspace ─
// The chart is a card floating over the right of the figure (a bottom sheet on a phone), opened
// from Findings, by a lesson or a case, or by a vessel's Details. It starts closed: the figure
// has the screen until something is asked for.
function panelShown() { return !app.classList.contains('instrument-focus') && app.classList.contains('panel-open'); }
function syncPanelToggle() {
  const on = panelShown();
  $('#btnInspector').setAttribute('aria-pressed', String(on));
  if (on) $('#btnInspector').classList.remove('ping');
  setTimeout(() => stage?.relayout(), 320);
}
/** Opens the patient chart; or the instruments when named. */
function openPanel(tab = 'chart') {
  if (tab === 'instruments') { setPanelTab('instruments'); if (isPhone()) { closePanel(); closeTreat(); } return; }
  if (app.classList.contains('instrument-focus')) dock.setState('open');
  // A phone has room for one sheet at a time: the chart puts Treat and the instruments away.
  if (isPhone()) { closeTreat(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
  app.classList.add('panel-open');
  panelSheet?.open();
  syncPanelToggle();
}
function closePanel() { app.classList.remove('panel-open'); panelSheet?.closed(); syncPanelToggle(); }
function setPanelTab(tab) {
  const instr = tab === 'instruments';
  if (instr) dock.ensure();
  const was = app.classList.contains('dock-open');
  app.classList.toggle('dock-open', instr);
  $('#tabInstruments').setAttribute('aria-pressed', String(instr));
  if (instr) $('#tabInstruments').classList.remove('ping');
  else app.classList.remove('instrument-focus');
  if (was !== instr) {
    const f = store.get().frame; if (f && instr) requestAnimationFrame(() => dock.update(f, true));
    setTimeout(() => dispatchEvent(new Event('resize')), 320);
  }
}

// ── Floating pieces ─────────────────────────────────
// The top bar and the vitals dock publish their heights (--top-safe, --vdock-h), so the cards,
// the Fit button and the toasts keep clear of them; Fit itself reads data-safe (stage.js).
let panelSheet = null, treatSheet = null;
function wireFloating() {
  // Besides the two heights: how much of the right edge the open cards take (--panel-occ for the
  // chart, --instr-occ for the instruments, --right-occ for all of them with Treat) and how much of the
  // bottom (--bot-occ: the vitals dock, or a sheet of instruments above it). The cards stack from the
  // right without covering each other; the zoom buttons and a vessel's card keep clear of them all.
  const px = (v) => `${Math.max(0, Math.round(v))}px`;
  let pubRaf = 0;
  const publish = () => {
    pubRaf = 0;
    const gap = isPhone() ? 8 : 12;
    const vdock = $('#vdock').offsetHeight, wide = !isPhone();
    // The top bar keeps one row when everything fits at its natural width (with a little to spare,
    // so it does not flip back and forth), else the view and legend move to a second row.
    const tb = $('#topbar'), cs = getComputedStyle(tb);
    const need = $('.tb-id').scrollWidth + $('#viewSeg').offsetWidth + $('.topbar .sb-right').offsetWidth + $('.top-right').scrollWidth + 6 * 8 + 16;
    const avail = tb.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const two = tb.classList.contains('two-rows') ? need > avail - 24 : need > avail;
    if (two !== tb.classList.contains('two-rows')) tb.classList.toggle('two-rows', two);
    app.style.setProperty('--top-safe', px($('#topbar').offsetHeight));
    app.style.setProperty('--vdock-h', px(vdock));
    const ws = $('#dock'), wsOn = app.classList.contains('dock-open') && !app.classList.contains('instrument-focus');
    const panelOcc = wide && app.classList.contains('panel-open') ? $('#panel').offsetWidth + gap : 0;
    const instrOcc = wsOn && ws.classList.contains('side') ? ws.offsetWidth + gap : 0;
    const tc = $('#treatCard'), treatOcc = wide && !tc.hidden ? tc.offsetWidth + gap : 0;
    app.style.setProperty('--panel-occ', px(panelOcc));
    app.style.setProperty('--instr-occ', px(instrOcc));
    app.style.setProperty('--right-occ', px(panelOcc + instrOcc + treatOcc));
    const sheet = wsOn && !ws.classList.contains('side') && ws.dataset.state !== 'peek' ? ws.offsetHeight + gap : 0;
    app.style.setProperty('--bot-occ', px(vdock + gap + sheet));
    dispatchEvent(new Event('pps:occ'));
  };
  const soon = () => { if (!pubRaf) pubRaf = requestAnimationFrame(publish); };
  const ro = new ResizeObserver(soon);
  for (const id of ['#topbar', '#vdock', '#dock', '#panel', '#treatCard', '.tb-id', '.top-right', '.topbar .sb-right', '#viewSeg']) ro.observe($(id));
  new MutationObserver(soon).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(soon).observe($('#treatCard'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(soon).observe($('#dock'), { attributes: true, attributeFilter: ['class', 'data-state'] });
  addEventListener('resize', soon);
  publish();
  panelSheet = sheetBehaviour($('#panel'), { handle: h('button', { class: 'panel-grab', 'aria-label': 'Resize the patient chart' }), drag: '.panel-head', onClose: closePanel });
  treatSheet = sheetBehaviour($('#treatCard'), { handle: h('button', { class: 'sheet-grab', 'aria-label': 'Resize the Treat card' }), drag: '.tc-head', onClose: closeTreat });
  // Focus: dragging, pinching or scrolling the figure fades the floating pieces until it stops.
  let busyT = 0, down = null;
  const busy = (ms) => { app.classList.add('stage-busy'); clearTimeout(busyT); busyT = setTimeout(() => app.classList.remove('stage-busy'), ms); };
  view.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  view.addEventListener('pointermove', (e) => { if (down && e.buttons && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) busy(5000); });
  addEventListener('pointerup', () => { if (down) { down = null; if (app.classList.contains('stage-busy')) busy(600); } });
  addEventListener('pointercancel', () => { down = null; busy(300); });
  view.addEventListener('wheel', () => busy(800), { passive: true });
  // A tap outside the Treat card (but not on its button) puts it away, as a menu would be.
  addEventListener('pointerdown', (e) => {
    if (!treatOpen() || isPhone()) return;
    if (e.target.closest('#treatCard, #btnTreat, .popover, .tooltip, .modal-back, .toast-wrap')) return;
    closeTreat();
  }, true);
}
// Phone: the chart and Treat are bottom sheets with three heights; a drag on the handle (or the
// head) moves between them, and below the lowest closes the sheet. Wider: the head drags the card
// aside, and it returns to its place when it closes.
function sheetBehaviour(el, { handle, drag, onClose }) {
  const SIZES = [0.32, 0.56, 0.9];
  let size = 1;
  el.prepend(handle);
  const apply = () => el.style.setProperty('--sheet-size', `${Math.round(SIZES[size] * 100)}%`);
  apply();
  handle.addEventListener('click', () => { if (!isPhone()) return; size = (size + 1) % SIZES.length; apply(); });
  let start = null;
  const grabbed = (e) => e.target === handle || (e.target.closest(drag) && !e.target.closest('button, a, input, select, [role="tab"]'));
  el.addEventListener('pointerdown', (e) => {
    if (!grabbed(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = el.getBoundingClientRect(), mv = (el.style.translate || '0px 0px').split(' ').map(parseFloat);
    start = { x: e.clientX, y: e.clientY, h: r.height, H: app.clientHeight, tx: mv[0] || 0, ty: mv[1] || 0, moved: false };
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    start.moved = true;
    el.classList.add('dragging');
    if (isPhone()) el.style.height = `${Math.max(60, start.h - dy)}px`;
    else el.style.translate = `${start.tx + dx}px ${start.ty + dy}px`;
  });
  const end = () => {
    if (!start) return;
    const s0 = start; start = null;
    el.classList.remove('dragging');
    if (!s0.moved || !isPhone()) return;
    const frac = el.getBoundingClientRect().height / s0.H;
    el.style.height = '';
    if (frac < SIZES[0] * 0.7) { onClose(); return; }
    size = SIZES.reduce((best, v, i) => (Math.abs(v - frac) < Math.abs(SIZES[best] - frac) ? i : best), 0);
    apply();
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return { open: () => { if (isPhone()) { size = 1; apply(); } }, closed: () => { el.style.translate = ''; el.style.height = ''; } };
}
// The findings badge: a check when nothing is abnormal, else how many findings, in the color of the worst.
let lastFindKey = '', lastFindN = 0;
function updateFindBadge(f) {
  // In a case where pressures are unmeasured, a check would claim more than is known.
  const unknown = !!store.get().imaging;
  const found = unknown ? [] : computeFindings(f.metrics, store.get().hiddenReadouts);
  const sev = unknown ? 'none' : found[0]?.sev || 'ok', n = found.length, key = `${n}|${sev}`;
  if (key === lastFindKey) return;
  lastFindKey = key;
  const el = $('#findBadge');
  el.dataset.sev = sev;
  el.replaceChildren(unknown ? '–' : n ? String(n) : svgIcon('check'));
  if (n > lastFindN) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  lastFindN = n;
  $('#btnInspector').setAttribute('aria-label', unknown ? 'Patient chart' : n ? `Patient chart: ${n} finding${n > 1 ? 's' : ''}` : 'Patient chart: nothing abnormal');
}
// ── Treat card ──────────────────────────────────────
let treatOff = null;
const treatOpen = () => !$('#treatCard').hidden;
function openTreat() {
  const el = $('#treatCard');
  if (isPhone()) { closePanel(); if (app.classList.contains('dock-open')) setPanelTab('chart'); }
  closePopover();
  const sync = [];
  const count = h('span', { class: 'tc-active' });
  const paintCount = () => { const n = chart.treatCount(store.get().params); count.textContent = n ? `${n} running` : ''; };
  sync.push(paintCount);
  const body = h('div', { class: 'tc-body' }, chart.treatBody(sync, () => { if (isPhone()) closeTreat(); }));
  const grab = el.querySelector('.sheet-grab');
  el.replaceChildren(...[grab, h('div', { class: 'tc-head' }, h('h2', {}, svgIcon('pill'), 'Treat'), count,
    h('button', { class: 'ib', 'aria-label': 'Close Treat', title: 'Close (Esc)', onclick: () => closeTreat() }, icon('close'))), body].filter(Boolean));
  paintCount();
  treatOff?.();
  treatOff = store.on('params', () => { for (const fn of sync) fn(); });
  el.hidden = false;
  treatSheet?.open();
  $('#btnTreat').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => stage.relayout());
}
function closeTreat() {
  const el = $('#treatCard');
  if (el.hidden) return;
  el.hidden = true;
  treatOff?.(); treatOff = null;
  treatSheet?.closed();
  $('#btnTreat').setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => stage.relayout());
}

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  app.dataset.mode = mode;
  syncModeName();
  if (mode !== 'cases' && cases?.active()) cases.exit();
  if (mode !== 'learn' && learn?.active()) learn.stop();
  if (mode !== 'learn' && mode !== 'cases') { bannerInfo = null; store.set({ focus: null }); }
  if (mode === 'cases') cases.mount();
  learn.render();
  if (mode === 'explore') { store.set({ locked: null, hiddenReadouts: null, hiddenEvents: null, imaging: false }); setAllowedTools(null); }
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
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') {
      closePopover();
      if (isModalOpen()) closeModal();
      else if (home.isOpen()) home.close();
      else if (app.classList.contains('figure-mode')) toggleFigure(false);
      else if (projector) toggleProjector();
      else if (app.classList.contains('instrument-focus')) dock.setState('open');
      else if (treatOpen()) closeTreat();
      else if (stage.isShunting()) stage.cancelShunt();
      else if (store.get().tool !== 'select') setTool('select');
      else store.set({ selection: null });
      return;
    }
    if (isModalOpen() || home.isOpen()) return;
    if (e.key === '/') { e.preventDefault(); palette.open(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? doRedo : doUndo)(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest?.('.v-hit, button, .lb')) { e.preventDefault(); host.send({ type: 'run', running: !store.get().running }); return; }
    // With a card open, the number keys run its verbs in order.
    if (/^[1-9]$/.test(e.key) && card.isOpen()) { if (card.trigger(+e.key)) e.preventDefault(); return; }
    if (e.key === '.') { host.send({ type: 'run', running: true }); setTimeout(() => host.send({ type: 'run', running: false }), 60); return; }
    if (e.key === '[' || e.key === ']') {
      const i = SPEEDS.indexOf(store.get().speed);
      setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + (e.key === ']' ? 1 : -1)))]);
      toast(`Speed ${store.get().speed}×`);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'a' && !e.shiftKey) { store.set({ lobule: false, view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
    if ((k === 'l' || (e.key === 'C' && e.shiftKey)) && !store.get().imaging) {
      const ks = Object.keys(LENSES), i = ks.indexOf(store.get().colorMode);
      const next = ks[(i + (e.shiftKey && k === 'l' ? ks.length - 1 : 1)) % ks.length];
      store.set({ colorMode: next }); toast(`Lens: ${LENSES[next][0]}. ${LENSES[next][1]}.`); return;
    }
    if (k === 'z') { settle(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (e.key === 'F' && e.shiftKey) { toggleProjector(); return; }
    if (k === 'f' && !e.shiftKey) { toggleFigure(); return; }
    if (k === 'i') { dock.toggle(); return; }
    if (k === 't') { if (treatOpen()) closeTreat(); else openTreat(); return; }
    if (k === 'p') { timeline.togglePin(); return; }
    if (k === 'j' && !store.get().imaging) { if (!e.repeat) injectDye({ hold: true }); return; }
    if (k === 'd') { const d = describe(store.get().frame); announce(d); toast(d); return; }
  });
}

// ── Figure view (clean plate to present or export) ──
function toggleFigure(on = !app.classList.contains('figure-mode')) {
  closePopover();
  app.classList.toggle('figure-mode', on);
  if (on) figure.open(); else figure.close();
  setTimeout(() => { dispatchEvent(new Event('resize')); stage.relayout(); }, 30);
}

// ── Projector mode (§4.4) ───────────────────────────
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
  bigEl.replaceChildren(h('small', {}, 'HVPG'), fmt(f.metrics.hvpg, 1), h('span', { class: 'unit' }, 'mmHg'));
}

// ── Phone & tablet ──────────────────────────────────
// Instruments share space with the figure. A soft vessel hover/click can flag the launcher;
// explicit tools and lesson steps open the workspace without a scrim.
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
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelScrim').addEventListener('click', closePanel);
  setPanelTab('chart');
  syncPanelToggle();
}

// ── Help & first run ────────────────────────────────
function brandMark() {
  const s = document.querySelector('.brand-mark').cloneNode(true);
  s.removeAttribute('class'); s.removeAttribute('hidden');
  return s;
}
function openHelp(section) {
  const rows = [
    ['Space', 'Play / pause'], ['[ ]', 'Slower / faster'], ['.', 'Step'], ['Z', 'Settle to equilibrium'], ['A', 'Anatomy ⇄ circuit'],
    ['F', 'Figure view'], ['I', 'Open / close Measure'], ['T', 'Open / close Treat'], ['L', 'Next color lens (Shift: previous)'],
    ['Click', 'Open the actions for a vessel or organ'], ['1 – 9', 'Run an action on the open card'],
    ['Ctrl/⌘ Z', 'Back one change on the timeline (Shift: forward)'], ['P', 'Compare from here / stop comparing'], ['Esc', 'Cancel · close the card · close'], ['Shift F', 'Projector mode'], ['?', 'This guide'],
    ['Tab · Enter', 'Reach a vessel, open its actions'], ['← →', 'Walk vessels along the flow'], ['Ctrl/⌘ K or /', 'Search'],
  ];
  openModal('Guide', h('div', {},
    h('p', {}, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model. Nothing is scripted: change a resistance and watch the consequences propagate.'),
    h('div', { class: 'entry-grid' },
      [['explore', 'Act on the anatomy', 'Click any vessel or organ. A card opens beside it with what you can do there: narrow or clot a vein, make the liver cirrhotic, band varices, wedge a catheter, start a shunt.'],
        ['settle', 'One timeline', 'Play runs the heartbeat-scale model; +1 wk, +1 mo and +6 mo jump the disease ahead. Every change is a marker you can go back to, or compare from.'],
        ['bulb', 'Ask “Why?”', 'Click any readout for a causal breakdown of what is driving it, change by change.']].map(([ic, t, d]) => h('div', { class: 'entry', style: { cursor: 'default' } }, h('span', { class: 'eic' }, icon(ic)), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))),
    h('h3', { 'data-sec': 'keys' }, 'Keyboard'),
    h('div', { class: 'keys' }, rows.map(([k, v]) => h('div', {}, h('span', {}, v), h('kbd', {}, k)))),
    h('h3', {}, 'Reading the figure'),
    h('ul', {},
      h('li', {}, 'Veins are colored by mean pressure on a perceptually uniform scale (0–30 mmHg). Labels give the value in mmHg; ▲ / ▼ is the change from healthy, shown from 5 mmHg. Arteries are thinner, in a fixed red.'),
      h('li', {}, 'Streaks of blood move downstream, brighter where flow is greater, faster where velocity is higher, fastest along the axis (laminar flow); chevrons (Blood menu) point the way. Smoke marks stagnant blood in a large vein. The Blood origin lens shows where blood comes from. Tap a vessel and use Inject dye on its card (or press J; hold for longer) to watch dye travel and split. Dotted vessel outlines are closed potential collaterals.'),
      h('li', {}, 'Line width follows vessel diameter (compressed, so the cavae don’t drown the portal tree). Watch collaterals and varices swell.'),
      h('li', {}, 'The circuit view is a transit map: pressure falls from left to right; collaterals and shunts run in their own lanes as bypasses.')),
    h('h3', {}, 'Thresholds & references'),
    h('p', { class: 'sub' }, 'Baveno VII consensus on portal hypertension (2022), reviewed against Baveno VIII (August 2026); AASLD guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Thresholds apply to gradients (HVPG, direct portal–systemic gradient), never to the pressure at a single vessel. Physiology after Guyton; Lautt (hepatic arterial buffer response); Bosch & Groszmann (HVPG).'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. The model is simplified and its values are illustrative; do not use it for diagnosis or treatment decisions.')), { wide: true });
  scrollToSection(section);
}
// Help and About open at a named section (Keyboard shortcuts, References).
function scrollToSection(section) { if (section) requestAnimationFrame(() => $(`#modal [data-sec="${section}"]`)?.scrollIntoView({ block: 'start' })); }
const pmid = (id) => h('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, target: '_blank', rel: 'noopener' }, `PMID ${id}`);
function openAbout(section) {
  openModal('About the model', h('div', {},
    h('p', {}, 'Created by ', h('b', {}, AUTHOR), '. ', h('a', { href: AUTHOR_URL, target: '_blank', rel: 'noopener' }, 'See all of the author’s teaching tools'), '.'),
    h('p', {}, `Portal Pressure Simulator ${APP_VERSION} · content version ${CONTENT_VERSION} (${RELEASED}). A course built on one content version behaves the same all term: the model, patients, lessons and cases change only with a new content version.`),
    h('h3', {}, 'The model'),
    h('p', {}, 'A lumped-parameter hemodynamic network of the splanchnic, portal, hepatic and systemic veins with the heart, arterial inflow and the hepatic arterial buffer; collateral recruitment and remodeling on a disease clock; Starling filtration and lymph for ascites; Laplace wall tension for varices; blood volume, bleeding and transfusion. Every number on screen comes out of it; nothing is scripted.'),
    h('h3', {}, 'Validation targets'),
    h('p', { class: 'sub' }, 'Each is an automated test that must pass before a release:'),
    h('ol', { class: 'refs' }, VALIDATION.map((v) => h('li', {}, v))),
    h('h3', {}, 'Status colors'),
    h('p', { class: 'sub' }, 'Every readout’s dot, bar and status word follow a clinical cut-off; the ticks on its bar mark the cut-offs below. A change (▲ / ▼) is drawn in neutral ink and appears only when a value keeps moving for several seconds, never for the heartbeat or breathing. Red means a threshold has been crossed.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'cut-table' },
      h('thead', {}, h('tr', {}, ['Readout', 'Normal', 'Borderline', 'Past a threshold', 'High risk'].map((x, i) => h('th', {}, i ? h('span', { class: 'cut-h' }, h('i', { class: 'dot', 'data-sev': ['', 'ok', 'caution', 'danger', 'critical'][i] }), x) : x)))),
      h('tbody', {}, CUTOFFS.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))))),
    h('p', { class: 'sub' }, 'Thresholds belong to gradients, not to the color of a vessel. HVPG ≥ 10 mmHg is clinically significant portal hypertension in cirrhosis. HVPG ≥ 20 mmHg matters as a prognostic finding when measured during an acute variceal bleed. 12 mmHg is not a bleeding threshold: varices can bleed below it, and it is only a usual post-TIPS target for the direct gradient.'),
    h('h3', {}, 'Reference review'),
    h('p', {}, 'Baveno VII (2022) is the basis for the thresholds above. They were reviewed against Baveno VIII (J Hepatol, August 2026), whose abstract states that earlier HVPG measurement recommendations remain valid where they were not revised. A line-by-line check of each statement against the full Baveno VIII text is still pending.'),
    h('h3', {}, 'Clinical review'),
    h('p', {}, 'Lesson and case content follows the guidance below. An external clinical advisory review with named reviewers is pending; their sign-off per lesson and case will be listed here.'),
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
    h('p', { class: 'sub' }, 'Application code: MIT. Fonts: Inter, JetBrains Mono and Source Serif 4 under the SIL Open Font License, served from this site. Anatomy, pathology art and icons were drawn for this project.'),
    h('p', { class: 'disclaimer' }, t('app.disclaimer'))), { wide: true, sub: `Version ${APP_VERSION}` });
  scrollToSection(section);
}
function openPrivacy() {
  const keys = (() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('pps.')); } catch { return []; } })();
  openModal('Privacy', h('div', {},
    h('p', {}, 'The simulator runs entirely in your browser. It makes no requests to any other site: no analytics, no trackers, no advertising, no third-party fonts or scripts. There is no account and no server that stores anything about you.'),
    h('p', {}, 'What stays on this device, in your browser’s storage: your preferences (theme, units, language, role), lesson progress and case scores, your assessment records and the name you type for them, and presenter scripts you create. It leaves the device only when you export it (CSV, xAPI, a shared link or a script file) or when your institution runs the simulator inside its LMS, which then receives your score.'),
    h('p', {}, 'For institutions: no personal data is processed by the publisher, which supports FERPA and GDPR compliance; the LMS remains the system of record.'),
    h('p', { class: 'sub' }, keys.length ? `Stored now: ${keys.join(', ')}.` : 'Nothing is stored on this device yet.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => { if (!confirm('Delete everything this simulator has stored on this device?')) return; for (const k of keys) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } } closeModal(); toast('Your data on this device has been cleared.'); } }, 'Clear my data on this device'))));
}
function firstRun() {
  if (readLS('pps.seen') === '1' || readShare()) return;
  try { localStorage.setItem('pps.seen', '1'); } catch { /* storage unavailable */ }
  home.open('explore');
}
main().catch((err) => { console.error(err); document.body.append(h('pre', { style: { position: 'fixed', bottom: 0, left: 0, background: '#fff', color: '#900', padding: '8px', zIndex: 999 } }, String(err.stack || err))); });
