// Application bootstrap: wires the engine host to the four surfaces (figure + action card,
// timeline, patient chart, instruments) and to Home, the command palette and the menus.

import { startHost, host } from './host.js?v=0917f25b24';
import { store, updateParams, replaceParams, bindParamSender, clearHistory } from './store.js?v=4bf5a96a9d';
import { createStage } from './stage.js?v=a37579ca94';
import { createInspector } from './inspector.js?v=718cafd0b0';
import { createDock } from './dock.js?v=72cb7c42e7';
import { createWhy } from './why.js?v=74679380bf';
import { createTimeline } from './timeline.js?v=2c81ae8bfc';
import { createLearn } from './learn.js?v=38cc26d87b';
import { createCases } from './cases.js?v=4d72427eaf';
import { createCompare } from './compare.js?v=20f877cd73';
import { createCard } from './card.js?v=cc91e1a154';
import { createChart } from './chart.js?v=ae6b0150dc';
import { createHome } from './home.js?v=7248caebfc';
import { applyI18n, setLang, LANGS, t, currentLang } from '../i18n/i18n.js?v=743b542534';
import { describe, announce, setSonify, sonifying, sonifyFrame } from './a11y.js?v=46c08905a9';
import { startLMS } from './lms.js?v=4511ed56b8';
import { APP_VERSION, CONTENT_VERSION, RELEASED, VALIDATION } from '../version.js?v=36ceb4fb38';
import { toolsToVerbs, normalizeSel, shuntable } from './actions.js?v=3aaea708e3';
import { gradientCss, flowCss, flowPos, velocityCss, velPos, heatCss, HEAT_MAX } from './colormap.js?v=5f8590b23c';
import { EDGES, NODES } from '../engine/topology.js?v=6d79260961';
import { $, $$, h, icon, fmt, fmtFlow, toast, tooltipFor, openModal, closeModal, isModalOpen, units, popover, closePopover, menuItem, svgIcon } from './util.js?v=d483888526';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const app = $('#app');
const view = $('#stageView');
const isPhone = () => matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches;
const isNarrow = () => matchMedia('(max-width: 1279px)').matches;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Everything the learner does is a verb on the structure they click (actions.js, card.js). The
// only armed modes left are two paint brushes in the figure's Draw menu, for power users.
const PAINT = {
  fibrosis: { icon: 'fibrosis', label: 'Fibrosis brush', hint: 'Press and hold on a liver lobe to lay down fibrosis in the chosen zone. Hold Shift to remove it.', zones: true },
  thrombus: { icon: 'clot', label: 'Paint clot', hint: 'Press and hold on a vein to grow a clot; drag along to spread it. Hold Shift to dissolve it.' },
};
// Color lenses: [title, what it shows, legend swatch].
const LENSES = {
  pressure: ['Pressure', 'Venous pressure in each vessel', () => gradientCss('to right', 30)],
  delta: ['Change', 'Higher or lower than healthy', () => 'linear-gradient(to right, #2D6CDF, #9696A0, #D22846)'],
  heat: ['Congestion', 'Where pressure has backed up', () => heatCss('to right')],
  drop: ['Pressure drop', 'Where the resistance lives', () => gradientCss('to right', 30)],
  flow: ['Flow volume', 'How much blood; width = flow', () => flowCss('to right')],
  velocity: ['Velocity', 'How fast; red = stagnant', () => velocityCss('to right')],
  direction: ['Direction', 'Toward the liver or away', () => 'linear-gradient(to right, var(--flow-normal) 50%, var(--flow-reversed) 50%)'],
};
const COLOR_MODES = { pressure: 'Pressure', delta: 'Change', heat: 'Congestion', drop: 'Pressure drop', flow: 'Flow volume', velocity: 'Velocity', direction: 'Flow direction' };
const GROUP_COLOR = { Normal: 'var(--ok)', Prehepatic: 'var(--s1)', Presinusoidal: 'var(--s7)', Sinusoidal: 'var(--s5)', Postsinusoidal: 'var(--s2)', Posthepatic: 'var(--s4)', Cardiac: 'var(--s8)' };
const ROLES = [['student', 'Student', 'The model and the clinical orders.'], ['instructor', 'Instructor', 'Adds the physiology knobs and presenter scripts.'], ['researcher', 'Researcher', 'Everything open, with resistances on the cards.']];

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
  dock = createDock({ strip: $('#strip'), head: $('#dockHead'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => host.send({ type: 'probe', id }), onReveal: revealDock, onLobule: () => zoomLobule('R'),
    onOpen: () => openPanel('instruments'), onClose: () => setPanelTab('chart'), isVisible: () => app.classList.contains('dock-open') && panelShown() });
  const api = { beginSession, endSession, onEnd: () => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); }, muteEvents: () => {}, loadPreset, setTool, setAllowedTools, action: doAction, showPane: (id) => dock.show(id, { reveal: true }), setProbe: (id) => host.send({ type: 'probe', id }), openPanel, setBanner, select: (sel) => store.set({ selection: sel }) };
  // A lesson keeps its card in view where the panel covers the figure: instruments it opens are
  // flagged, not forced.
  learn = createLearn({ host: $('#panelLesson'), coach: $('#coach'), stage, panel: $('#panelChart'), dock, inspector, onWhy: (m, el) => why.open(m, el), ...api, showPane: (id) => dock.show(id, { reveal: 'lesson' }) });
  cases = createCases({ root: $('#panelCase'), api });
  presenterL = lazy(() => import('./presenter.js?v=75490b39d5'), ({ createPresenter }) => createPresenter({ loadPreset, updateParams, host, stage, dock, action: doAction,
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
  paletteL = lazy(() => import('./palette.js?v=120ca7583b'), ({ createPalette }) => createPalette({ ctx: {
    select: (sel) => store.set({ selection: sel }), action: doAction, probe: (id) => host.send({ type: 'probe', id }), showPane: (id) => dock.show(id, { reveal: true }),
    wedge: () => { store.set({ selection: { type: 'edge', id: 'RHV_IVC' } }); setTimeout(() => card.trigger(3), 60); },
    jump: (d, l) => timeline.jump(d, l), undo: () => timeline.undo(), pin: () => timeline.togglePin(), lenses: Object.fromEntries(Object.entries(LENSES).map(([k, v]) => [k, v])),
    zoomLobule: () => zoomLobule('R'), figure: () => toggleFigure(true), exportFile: (k) => { toggleFigure(true); setTimeout(() => figure.exportFile(k), 400); }, projector: () => toggleProjector(), instruments: () => dock.toggle(),
    loadPreset: async (id) => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); await loadPreset(id); toast(store.get().presetList.find((p) => p.id === id)?.label); },
    lesson: (id) => startLesson(id), caseStart: (id) => startCase(id), home: () => home.open(), theme: () => toggleTheme(), help: () => openHelp(), share,
  } }));
  figureL = lazy(() => import('./figure.js?v=c8dd729de0'), ({ createFigure }) => createFigure({ app, stage, onClose: () => toggleFigure(false) }));
  card = createCard({
    view, stage, onWhy: (m, el) => why.open(m, el),
    onDetails: (sel) => { store.set({ details: normalizeSel(sel) || sel }); openPanel(); },
    ctx: {
      action: doAction, showPane: (id) => dock.show(id, { reveal: true }), probe: (id) => host.send({ type: 'probe', id }),
      startShunt: (id) => stage.startShunt(id), canShunt: (id) => shuntable(id), select: (sel) => store.set({ selection: sel }),
      zoomLobule: (lobe) => zoomLobule(lobe), paneApi: (id) => dock.pane(id),
    },
  });

  renderPaintHint();
  buildHud();
  wireTopbar();
  wireKeyboard();
  wirePanel();

  host.on('frame', onFrame);
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see the console.', 'bad'); });

  store.on('view', (v) => { stage.setView(v); $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))); });
  store.on('tool', (t) => {
    for (const c of [...view.classList]) if (c.startsWith('tool-')) view.classList.remove(c);
    view.classList.add('tool-' + t);
    renderPaintHint();
  });
  store.on('shunting', renderPaintHint);
  store.on('mode', onMode);
  store.on('layers', () => { app.classList.toggle('chips-off', !store.get().layers.chips); redraw(); });
  store.on('presetId', (id) => { $('#scenarioName').textContent = presets.find((p) => p.id === id)?.label || 'Custom'; });
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
      h('div', {}, h('div', { style: { fontWeight: 600, fontSize: '15px' } }, 'Patient scenarios'), h('div', { class: 'sub' }, 'Grouped by where the resistance sits, from the gut to the heart.')),
      h('span', { class: 'muted', style: { fontSize: '12px', whiteSpace: 'nowrap' } }, `${presets.length} scenarios`)),
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
  if (a.kind === 'paracentesisPrompt') { dock.show('abdomen', { reveal: true }); toast('Choose the volume in the Abdomen instrument, then Drain.'); return; }
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

// ── Draw menu (paint brushes) and the hint for armed gestures ─────
function setTool(id) {
  if (id !== 'select' && !PAINT[id]) id = 'select';
  if (id !== 'select' && store.get().allowedVerbs && !store.get().allowedVerbs.includes(id === 'thrombus' ? 'clot' : id)) { toast('Not available in this step.'); return; }
  store.set({ tool: id });
}
function setAllowedTools(list) {
  store.set({ allowedVerbs: toolsToVerbs(list) });
  if (store.get().tool !== 'select') store.set({ tool: 'select' });
}
function openDraw(anchor) {
  const cur = store.get().tool;
  const item = (id) => {
    const t = PAINT[id];
    const b = h('button', { class: 'tray-item', 'aria-pressed': String(cur === id) }, icon(t.icon), h('span', { class: 'n' }, t.label), h('span', { class: 'd' }, t.hint));
    b.addEventListener('click', () => { closePopover(); setTool(cur === id ? 'select' : id); });
    return b;
  };
  popover(anchor, [h('div', { class: 'menu-title' }, 'Draw on the anatomy'), item('fibrosis'), item('thrombus'),
    h('div', { class: 'ctl-sub', style: { padding: '4px 10px 6px' } }, 'For quick sketches. Every change can also be made by clicking the structure itself.')], { cls: 'tool-tray', align: 'start' });
}
// One hint card for whatever gesture is armed: a shunt waiting for its target, or a brush.
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
  const t = PAINT[st.tool];
  if (!t) { el.hidden = true; redraw(); return; }
  el.hidden = false;
  el.replaceChildren(h('div', { class: 'tc-title' }, icon(t.icon), t.label, h('span', { class: 'sp' }), done('Done', () => setTool('select'))), h('div', {}, t.hint));
  if (t.zones) {
    el.append(h('div', { class: 'seg full', role: 'group', 'aria-label': 'Fibrosis zone' }, [['pre', 'Portal tract'], ['sin', 'Sinusoids'], ['post', 'Central vein']].map(([z, l]) => {
      const b = h('button', { 'aria-pressed': String(store.get().fibrosisZone === z) }, l);
      b.addEventListener('click', () => { store.set({ fibrosisZone: z }); renderPaintHint(); });
      return b;
    })));
  }
  redraw();
}
// The lobule is the deepest level of the figure's semantic zoom (abdomen → liver → lobule).
function zoomLobule(lobe = 'R') { if (app.classList.contains('figure-mode')) toggleFigure(false); stage.zoomLobule(lobe); }

// ── Figure header: view, color, legend; banners ─────
let bleedEl, tipEl, stageClock;
function buildHud() {
  renderLegend();
  store.on('colorMode', () => { $('#colorModeLabel').textContent = COLOR_MODES[store.get().colorMode]; });
  bleedEl = $('#bleedPill');
  tipEl = h('div', { class: 'hover-tip', style: { display: 'none' } });
  view.append(tipEl);
  stageClock = h('div', { class: 'stage-clock', 'aria-hidden': 'true' });
  view.append(stageClock);
  $('#zoomFit').onclick = () => stage.fit();
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => store.set({ view: b.dataset.view })));
  // The legend is the lens switcher: it shows what the colors mean and changes what they show.
  $('#btnLayers').addEventListener('click', (e) => openLayers(e.currentTarget));
  $('#btnLayers').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openLayers(e.currentTarget); } });
  $('#btnFigure').addEventListener('click', () => toggleFigure(true));
  $('#btnDraw').addEventListener('click', (e) => openDraw(e.currentTarget));
  $('#btnInstruments').addEventListener('click', (e) => dock.openGrid(e.currentTarget));
  new ResizeObserver(() => stage.relayout()).observe(view);
}
function legendModel() {
  const st = store.get();
  const imaging = st.imaging;
  const cmp = !!st.compareSnap;
  const m = imaging ? 'neutral' : cmp && st.compareView === 'D' ? 'delta' : st.colorMode;
  const ref = cmp ? 'state A' : 'healthy';
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
    el.replaceChildren(h('div', { class: 'lg-title' }, m === 'pressure' ? 'Venous pressure' : 'Pressure drop', h('small', {}, 'mmHg')),
      m === 'pressure' ? scale(gradientCss('to right', max), [[at(0), '0'], [at(5), '5'], [at(10), '10'], [at(20), '20'], [at(30), '30']], [at(5), at(10), at(12), at(20)])
        : scale(gradientCss('to right', max), [[0, '0'], [100, '12+']]));
    el.setAttribute('aria-label', m === 'pressure' ? 'Legend: venous pressure from 0 to 30 millimeters of mercury, pale blue to dark magenta' : 'Legend: pressure drop across each vessel, 0 to 12 or more millimeters of mercury');
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
  } else if (m === 'neutral') {
    el.replaceChildren(h('div', { class: 'lg-cats' }, h('span', {}, h('i', { style: { background: 'var(--vein-portal)' } }), 'Portal veins'), h('span', {}, h('i', { style: { background: 'var(--vein-systemic)' } }), 'Systemic veins'),
      h('span', { class: 'lg-note' }, svgIcon('info'), 'Pressures unmeasured')));
    el.setAttribute('aria-label', 'Legend: violet portal veins, blue systemic veins. Pressures are unmeasured in this case: investigate with the tools.');
  } else {
    el.replaceChildren(h('div', { class: 'lg-title' }, `Change from ${ref}`, h('small', {}, 'mmHg')),
      scale('linear-gradient(to right, #2D6CDF, #9696A0, #D22846)', [[0, '−12'], [50, '0'], [100, '+12']], [50]));
    el.setAttribute('aria-label', `Legend: change in pressure from ${ref}, blue lower, red higher, up to 12 millimeters of mercury`);
  }
  $('#colorModeLabel').textContent = m === 'neutral' ? 'Anatomy' : m === 'delta' && st().compareSnap ? 'Change A→now' : COLOR_MODES[m];
}
const st = () => store.get();
function openLegend(anchor) {
  const { m, ref } = legendModel();
  const rows = m === 'pressure' ? [
    ['Scale', 'Mean venous pressure, perceptually uniform (OKLab) from 0 to 30 mmHg.'],
    ['Breakpoints', 'The color steps at 5, 10, 12 and 20 mmHg mirror the clinical HVPG thresholds: normal ≤ 5, CSPH ≥ 10, variceal bleeding ≥ 12, high risk ≥ 20. HVPG is a gradient (wedged − free hepatic venous pressure); read it in the HVPG readout, not from a single vessel color.'],
  ] : m === 'drop' ? [['Scale', 'Pressure lost across each vessel (upstream − downstream). Bright segments are where the resistance sits.']]
    : m === 'flow' ? [['Scale', 'Blood flow through each vessel in L/min, log scale; line width also grows with flow (∝ √flow), like traffic volume on a city map. Labels give the flow into each station and its change from healthy.']]
    : m === 'velocity' ? [['Scale', 'Mean velocity (flow ÷ lumen area). Dark red below ~5 cm/s is near-stasis, where thrombosis is likely (e.g. portal vein thrombosis in advanced cirrhosis); green is free-flowing. The liver microcirculation is grey: it is a bed, not a single tube.']]
    : m === 'heat' ? [['Scale', `Congestion: how far pressure has risen above ${ref === 'state A' ? 'state A' : 'healthy'}. Grey is unchanged; the glow marks the territories under the most back-pressure.`]]
    : m === 'direction' ? [['Scale', 'Teal: flow in the physiological direction. Orange: reversed (e.g. hepatofugal portal flow).']]
      : m === 'neutral' ? [['Why no pressures?', 'In this case pressures are unmeasured, as at the bedside. Use the catheter, Doppler or endoscope to investigate.']]
        : [['Scale', 'Pressure now minus the reference (healthy, or state A in Compare). Red higher, blue lower.']];
  popover(anchor, [h('div', { class: 'menu-title' }, 'How to read the figure'),
    h('div', { style: { padding: '2px 10px 8px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-2)', maxWidth: '340px' } },
      rows.map(([k, v]) => h('div', {}, h('b', { style: { color: 'var(--text)' } }, k + '. '), v)),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Flow. '), 'Arrowheads inside each vessel point and move downstream; their speed follows blood velocity, and a vessel without flow has none. Reversed flow turns them orange and runs them the other way. Paused, they hold still and keep their direction.'),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Notation. '), 'Dotted vessels are closed potential collaterals. Line width follows vessel diameter (compressed). Faint lines crossing an organ run behind it. ▲ / ▼ on a label: change in mmHg from healthy (from state A in Compare).'),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Organs. '), 'Organs are drawn as in an anatomy plate, lit from the upper left. On the liver, texture means disease: nodules for cirrhosis, mottling for congestion (nutmeg liver), a darker vignette as sinusoidal pressure rises. The spleen grows with splenomegaly.'),
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Varix ring. '), 'The ring around the esophageal varices closes as their wall tension (pressure × radius ÷ wall thickness) approaches the rupture threshold: amber from 70 %, red from 90 %.'))], { align: 'end', cls: 'legend-pop' });
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
    const s = h('select', { class: 'select', style: { height: '30px', fontSize: '12.5px' }, 'aria-label': kind === 'pressure' ? 'Pressure unit' : 'Flow unit' }, opts.map((u) => h('option', { value: u, selected: units[kind] === u }, u)));
    s.addEventListener('change', () => { units[kind] = s.value; inspector.render(); redraw(); });
    return s;
  };
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Color vessels by', h('span', { class: 'kb' }, 'Shift C cycles')),
    h('div', { class: 'lens-grid' }, Object.keys(LENSES).map(lens)),
    s0.imaging ? h('div', { class: 'ctl-sub', style: { padding: '2px 10px 6px' } }, 'This case shows anatomy only until you measure.') : null,
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Show'),
    cb('flow', 'Flow arrows'), cb('chips', 'Pressure values on labels'), cb('collaterals', 'Potential collaterals (dotted)'), cb('labels', 'Organ names'),
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

// The figure header carries the A / Now / A→Now switch when a moment is pinned; a lesson or
// case shows a slim banner in the top bar with its progress and a way out.
let bannerInfo = null;
function setBanner(info) { bannerInfo = info; renderBanner(); }
function renderBanner() {
  const el = $('#stageBanner');
  const s0 = store.get();
  const kids = [];
  if (s0.compareSnap) {
    kids.push(h('div', { class: 'seg cmp-seg', role: 'group', 'aria-label': 'Show state' }, [['A', 'A', 'The pinned moment A'], ['B', 'Now', 'The live model'], ['D', 'A→Now', 'Change from A to now']].map(([v, l, t]) => {
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
  if (s0.compareSnap && s0.compareView === 'A') view.append(h('div', { class: 'cmp-badge stage-blocker' }, `Showing A · ${s0.compareSnap.when}`));
  redraw();
}

// ── Top bar & transport ─────────────────────────────
function wireTopbar() {
  $('#brandBtn').addEventListener('click', (e) => { e.preventDefault(); home.open(); });
  $('#scenarioBtn').addEventListener('click', (e) => openScenarios(e.currentTarget));
  $('#btnPalette').addEventListener('click', () => palette.open());
  $('#btnShare').addEventListener('click', (e) => popover(e.currentTarget, [
    h('div', { class: 'menu-title' }, 'Share & export'),
    menuItem('Copy a link to this exact state', { icon: 'share', onClick: () => { closePopover(); share(); } }),
    menuItem('Figure view', { icon: 'camera', kb: 'F', onClick: () => { closePopover(); toggleFigure(true); } }),
    menuItem('Export PNG (2×)', { icon: 'download', onClick: () => { closePopover(); toggleFigure(true); setTimeout(() => figure.exportFile('png'), 400); } }),
    menuItem('Export SVG (editable)', { icon: 'download', onClick: () => { closePopover(); toggleFigure(true); setTimeout(() => figure.exportFile('svg'), 400); } }),
    menuItem('Print', { icon: 'print', onClick: () => { closePopover(); toggleFigure(true); setTimeout(() => print(), 400); } }),
    h('div', { class: 'menu-sep' }),
    menuItem('Projector mode', { icon: 'projector', kb: 'Shift F', onClick: () => { closePopover(); toggleProjector(); } }),
  ], { align: 'end' }));
  $('#btnMenu').addEventListener('click', (e) => openMenu(e.currentTarget));
  $('#btnInspector').addEventListener('click', () => (panelShown() ? closePanel() : openPanel()));
  for (const [id, side] of [['#btnPalette', 'bottom'], ['#btnShare', 'bottom'], ['#btnMenu', 'bottom']]) {
    const b = $(id); tooltipFor(b, b.title, side); b.removeAttribute('title');
  }
}
function openMenu(anchor) {
  const cur = document.documentElement.getAttribute('data-theme') || 'system';
  const role = store.get().role;
  const unitSel = (kind, opts) => {
    const sel = h('select', { class: 'select', style: { height: '30px', fontSize: '12.5px' }, 'aria-label': kind === 'pressure' ? 'Pressure unit' : 'Flow unit' }, opts.map((u) => h('option', { value: u, selected: units[kind] === u }, u)));
    sel.addEventListener('change', () => { units[kind] = sel.value; inspector.render(); card.render(); redraw(); });
    return sel;
  };
  popover(anchor, [
    h('div', { class: 'menu-title' }, t('menu.appearance')),
    h('div', { class: 'seg full', style: { margin: '2px 6px 6px' } }, [['light', t('menu.light')], ['dark', t('menu.dark')], ['system', t('menu.system')]].map(([v, l]) => { const b = h('button', { 'aria-pressed': String(cur === v) }, l); b.addEventListener('click', () => { closePopover(); applyTheme(v === 'system' ? null : v, v === 'system'); }); return b; })),
    h('div', { class: 'menu-title' }, 'Units'),
    h('div', { style: { display: 'flex', gap: '6px', padding: '2px 10px 6px' } }, unitSel('pressure', ['mmHg', 'cmH2O', 'kPa']), unitSel('flow', ['L/min', 'mL/min'])),
    h('div', { class: 'menu-title' }, t('menu.language')),
    (() => { const sel = h('select', { class: 'select', style: { height: '30px', fontSize: '12.5px', margin: '2px 10px 6px', width: 'calc(100% - 20px)' }, 'aria-label': t('menu.language') }, LANGS.map(([v, l]) => h('option', { value: v, selected: currentLang() === v }, l))); sel.addEventListener('change', () => { setLang(sel.value); closePopover(); }); return sel; })(),
    h('div', { class: 'menu-title' }, t('menu.access')),
    menuItem(t('menu.describe'), { icon: 'help', kb: 'D', onClick: () => { closePopover(); const d = describe(store.get().frame); announce(d); toast(d); } }),
    menuItem(t('menu.sonify'), { checked: sonifying(), onClick: () => { closePopover(); setSonify(!sonifying()); toast(sonifying() ? 'Sonification on: pitch follows the pressure of the selected vessel (or the portal vein).' : 'Sonification off.'); } }),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, t('menu.role')),
    ...ROLES.map(([v, l, d]) => { const b = menuItem(l, { checked: role === v, onClick: () => { closePopover(); store.set({ role: v }); toast(`${l}: ${d}`); } }); b.title = d; return b; }),
    h('div', { class: 'menu-sep' }),
    menuItem(t('menu.home'), { icon: 'grid', onClick: () => { closePopover(); home.open(); } }),
    menuItem(t('menu.palette'), { icon: 'explore', kb: 'Ctrl K', onClick: () => { closePopover(); palette.open(); } }),
    menuItem(t('menu.guide'), { icon: 'help', kb: '?', onClick: () => { closePopover(); openHelp(); } }),
    menuItem(t('menu.about'), { icon: 'book', onClick: () => { closePopover(); openAbout(); } }),
    menuItem(t('menu.privacy'), { icon: 'lock', onClick: () => { closePopover(); openPrivacy(); } }),
  ], { align: 'end', cls: 'app-menu' });
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
}
function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
// ── Side panel: the patient chart and the instruments, one tab each ───
// Beside the figure on a wide screen; below 1280 px it slides over the figure from the right
// (with a scrim on a phone) and the top bar's Chart button opens it.
function panelShown() { return isNarrow() ? app.classList.contains('panel-open') : !app.classList.contains('panel-collapsed'); }
function syncPanelToggle() {
  const on = panelShown();
  $('#btnInspector').setAttribute('aria-pressed', String(on));
  if (on) $('#btnInspector').classList.remove('ping');
  setTimeout(() => stage?.relayout(), 320);
}
/** Opens the side panel; on the patient chart unless a tab is named. */
function openPanel(tab = 'chart') {
  app.classList.remove('panel-collapsed'); app.classList.add('panel-open');
  setPanelTab(tab);
  syncPanelToggle();
}
function closePanel() { if (isNarrow()) app.classList.remove('panel-open'); else app.classList.add('panel-collapsed'); syncPanelToggle(); }
function setPanelTab(tab) {
  const instr = tab === 'instruments';
  if (instr) dock.ensure();
  const was = app.classList.contains('dock-open');
  app.classList.toggle('dock-open', instr);
  $$('.panel-tabs [role="tab"]').forEach((b) => { const on = b.dataset.ptab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on) b.classList.remove('ping'); });
  if (was !== instr) {
    const f = store.get().frame; if (f && instr) requestAnimationFrame(() => dock.update(f, true));
    setTimeout(() => dispatchEvent(new Event('resize')), 320);
  }
}

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  app.dataset.mode = mode;
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
    if (k === 'a' && !e.shiftKey) { store.set({ view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
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
    if (k === 'p') { timeline.togglePin(); return; }
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
    toast('Projector mode. Press Esc or Exit to leave.');
    const f = store.get().frame; if (f) updateProjector(f);
  } else { bigEl?.remove(); exitEl?.remove(); bigEl = exitEl = null; }
  setTimeout(() => dispatchEvent(new Event('resize')), 50);
}
function updateProjector(f) {
  if (!bigEl) return;
  bigEl.replaceChildren(h('small', {}, 'HVPG'), fmt(f.metrics.hvpg, 1), h('span', { class: 'unit' }, 'mmHg'));
}

// ── Phone & tablet ──────────────────────────────────
// How an instrument is brought forward: 'hard' (a button asked for it) opens it in the side
// panel; 'lesson' does the same where the panel sits beside the figure but only flags it where
// the panel would cover the figure; 'soft' (a click on the figure) never re-frames the figure
// under the pointer, so it only flags the Instruments tab (or the Chart button) when hidden.
function revealDock(mode) {
  const visible = app.classList.contains('dock-open') && panelShown();
  if (visible) return;
  const flag = mode === 'soft' || (mode === 'lesson' && isNarrow());
  if (!flag) { openPanel('instruments'); return; }
  if (panelShown()) $('#tabInstruments').classList.add('ping');
  else { $('#btnInspector').classList.add('ping'); $('#tabInstruments').classList.add('ping'); }
}
function wirePanel() {
  const tabs = $$('.panel-tabs [role="tab"]');
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => setPanelTab(b.dataset.ptab));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); setPanelTab(n.dataset.ptab);
    });
  });
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelScrim').addEventListener('click', closePanel);
  // Below 1280 px the panel starts closed so the figure has the room; wider, it is open.
  if (isNarrow()) app.classList.remove('panel-open');
  setPanelTab('chart');
  syncPanelToggle();
}

// ── Help & first run ────────────────────────────────
function brandMark() {
  const s = document.querySelector('.brand-mark').cloneNode(true);
  s.removeAttribute('class');
  return s;
}
function openHelp() {
  const rows = [
    ['Space', 'Play / pause'], ['[ ]', 'Slower / faster'], ['.', 'Step'], ['Z', 'Settle to equilibrium'], ['A', 'Anatomy ⇄ circuit'],
    ['F', 'Figure view'], ['I', 'Open / close instruments'], ['L', 'Next color lens (Shift: previous)'],
    ['Click', 'Open the actions for a vessel or organ'], ['1 – 9', 'Run an action on the open card'],
    ['Ctrl/⌘ Z', 'Back one change on the timeline (Shift: forward)'], ['P', 'Pin this moment as A / unpin'], ['Esc', 'Cancel · close the card · close'], ['Shift F', 'Projector mode'], ['?', 'This guide'],
    ['Tab · Enter', 'Reach a vessel, open its actions'], ['← →', 'Walk vessels along the flow'], ['Ctrl/⌘ K or /', 'Command palette'],
  ];
  openModal('Guide', h('div', {},
    h('p', {}, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model. Nothing is scripted: change a resistance and watch the consequences propagate.'),
    h('div', { class: 'entry-grid' },
      [['explore', 'Act on the anatomy', 'Click any vessel or organ. A card opens beside it with what you can do there: narrow or clot a vein, make the liver cirrhotic, band varices, wedge a catheter, start a shunt.'],
        ['settle', 'One timeline', 'Play runs the heartbeat-scale model; +1 wk, +1 mo and +6 mo jump the disease ahead. Every change is a marker you can go back to or pin as A to compare.'],
        ['bulb', 'Ask “Why?”', 'Click any readout for a causal breakdown of what is driving it, change by change.']].map(([ic, t, d]) => h('div', { class: 'entry', style: { cursor: 'default' } }, h('span', { class: 'eic' }, icon(ic)), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))),
    h('h3', {}, 'Keyboard'),
    h('div', { class: 'keys' }, rows.map(([k, v]) => h('div', {}, h('span', {}, v), h('kbd', {}, k)))),
    h('h3', {}, 'Reading the figure'),
    h('ul', {},
      h('li', {}, 'Veins are colored by mean pressure on a perceptually uniform scale (0–30 mmHg). Labels give the value in mmHg; ▲ / ▼ is the change from healthy. Arteries are thinner, in a fixed red.'),
      h('li', {}, 'Chevrons inside each vessel show the blood itself: they point and move downstream, faster where blood moves faster, and there are none where it is still. Reversed flow simply runs the other way. Thin vessels carry small arrowheads. Dotted vessels are closed potential collaterals.'),
      h('li', {}, 'Line width follows vessel diameter (compressed, so the cavae don’t drown the portal tree). Watch collaterals and varices swell.'),
      h('li', {}, 'The circuit view is a transit map: pressure falls from left to right; collaterals and shunts run in their own lanes as bypasses.')),
    h('h3', {}, 'Thresholds & references'),
    h('p', { class: 'sub' }, 'Baveno VII consensus on portal hypertension (2022); AASLD guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Physiology after Guyton; Lautt (hepatic arterial buffer response); Bosch & Groszmann (HVPG).'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. The model is simplified and its values are illustrative; do not use it for diagnosis or treatment decisions.')), { wide: true });
}
function openAbout() {
  openModal('About the model', h('div', {},
    h('p', {}, `Portal Pressure Simulator ${APP_VERSION} · content version ${CONTENT_VERSION} (${RELEASED}). A course built on one content version behaves the same all term: the model, patients, lessons and cases change only with a new content version.`),
    h('h3', {}, 'The model'),
    h('p', {}, 'A lumped-parameter hemodynamic network of the splanchnic, portal, hepatic and systemic veins with the heart, arterial inflow and the hepatic arterial buffer; collateral recruitment and remodeling on a disease clock; Starling filtration and lymph for ascites; Laplace wall tension for varices; blood volume, bleeding and transfusion. Every number on screen comes out of it; nothing is scripted.'),
    h('h3', {}, 'Validation targets'),
    h('p', { class: 'sub' }, 'Each is an automated test that must pass before a release:'),
    h('ol', { class: 'refs' }, VALIDATION.map((v) => h('li', {}, v))),
    h('h3', {}, 'Clinical review'),
    h('p', {}, 'Lesson and case content follows the guidance below. An external clinical advisory review with named reviewers is pending; their sign-off per lesson and case will be listed here.'),
    h('h3', {}, 'References'),
    h('ol', { class: 'refs' },
      h('li', {}, 'de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74.'),
      h('li', {}, 'Kaplan DE, et al. AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis. Hepatology 2024;79:1180–1211.'),
      h('li', {}, 'Bosch J, Groszmann RJ, et al. Measurement of portal pressure (HVPG). Hepatology / Semin Liver Dis.'),
      h('li', {}, 'Lautt WW. Hepatic Circulation: Physiology and Pathophysiology. Morgan & Claypool, 2009.'),
      h('li', {}, 'Guyton AC. Venous return and the systemic filling pressure.')),
    h('h3', {}, 'Licenses'),
    h('p', { class: 'sub' }, 'Application code: MIT. Fonts: Inter, JetBrains Mono and Source Serif 4 under the SIL Open Font License, served from this site. Anatomy, pathology art and icons were drawn for this project.'),
    h('p', { class: 'disclaimer' }, t('app.disclaimer'))), { wide: true, sub: `Version ${APP_VERSION}` });
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
