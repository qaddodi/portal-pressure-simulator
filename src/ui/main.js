// Application bootstrap: wires the engine host to the four surfaces (figure + action card,
// timeline, patient chart, instruments) and to Home, the command palette and the menus.

import { startHost, host } from './host.js?v=b54d9b1fcc';
import { store, updateParams, replaceParams, bindParamSender, clearHistory, logAction, varicesPresent, hiddenNow } from './store.js?v=edbdbfb0c8';
import { createStage } from './stage.js?v=9b03251eb8';
import { sinusoidSupported } from './sinusoid-view.js?v=467482282d';
import { createInspector } from './inspector.js?v=fbb0750c20';
import { createDock, CUTOFFS } from './dock.js?v=1a65604bfc';
import { setHvpgStage } from './hvpg-proc.js?v=2f69b82b82';
import { createWhy } from './why.js?v=6e2456299a';
import { createTimeline, LAPSES } from './timeline.js?v=55e9506496';
import { createLearn } from './learn.js?v=1f6b87c7d2';
import { createCases } from './cases.js?v=e22b3978f2';
import { createCompare } from './compare.js?v=96506c9464';
import { createCard } from './card.js?v=3597b7a412';
import { createChart, computeFindings } from './chart.js?v=60d03ef991';
import { createHome, ROLES } from './home.js?v=82df67c62d';
import { applyI18n, setLang, LANGS, t, currentLang } from '../i18n/i18n.js?v=424fa7e848';
import { describe, caption, announce, setSonify, sonifying, sonifyFrame } from './a11y.js?v=ee3689fa2e';
import { startLMS } from './lms.js?v=45983df90a';
import { APP_VERSION, CONTENT_VERSION, RELEASED, VALIDATION, AUTHOR, AUTHOR_URL } from '../version.js?v=1ecade66d2';
import { toolsToVerbs, normalizeSel, shuntable } from './actions.js?v=c318d652d9';
import { gradientCss, PRESSURE_TICKS, flowCss, flowPos, velocityCss, velPos, heatCss, HEAT_MAX } from './colormap.js?v=6d64a94345';
import { EDGES, NODES } from '../engine/topology.js?v=dc393aabea';
import { $, $$, h, icon, fmt, fmtFlow, toast, popupsOn, setPopups, tooltipFor, openModal, closeModal, isModalOpen, popover, closePopover, menuItem, svgIcon, enhanceRanges, systemEdge } from './util.js?v=e803df99cd';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const app = $('#app');
const view = $('#stageView');
const isPhone = () => matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Everything the learner does is a verb on the structure they click (actions.js, card.js); the
// only armed gesture left is a shunt waiting for its target.
import { debugOptions, debugOn, setDebug, initDebug } from './debug.js?v=0166e06ffb';
import { initTopbarMotion } from './topbar-motion.js?v=a7ab34f946';
import { ORIGINS } from './blood.js?v=6c39f43ddf';

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
    onSelect: (sel, opts) => { select(sel); if (opts?.keyboard) setTimeout(() => card?.focusFirst(), 30); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id, { reveal: 'soft' }),
    onHoverInfo: hoverInfo,
    onViewChange: () => card?.position(),
  });
  setHvpgStage(stage);
  compare = createCompare();
  timeline = createTimeline({
    root: $('#timeline'), onWhy: (m, el) => why.open(m, el),
    onPlay: () => host.send({ type: 'run', running: !store.get().running }),
    onSpeed: (v, lapse) => setSpeed(v, lapse),
    onJump: (d) => host.send(d === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days: d }),
    onRestart: () => restartPatient(),
    canRevert: () => store.get().mode !== 'cases',
    scenarioLabel: () => store.get().presetList?.find((x) => x.id === store.get().presetId)?.label || 'Custom',
  });
  chart = createChart({
    onWhy: (m, el) => why.open(m, el), flash: (ids) => stage.flash(ids), onScenarios: (el) => openScenarios(el),
    action: doAction, startShunt: (id, o) => stage.startShunt(id, o), select, timeline, pinned: () => compare.section(),
  });
  inspector = createInspector($('#inspector'), {
    onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id, { reveal: true }),
    onScenarios: () => openScenarios($('#scenarioBtn')), onMode: (m) => store.set({ mode: m }), chart,
  });
  dock = createDock({ strip: $('#strip'), head: $('#dockHead'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => { host.send({ type: 'probe', id }); logAction('probe', id); }, onReveal: revealDock, onLobule: () => zoomLobule('R'),
    onOpen: () => openPanel('instruments'), onClose: () => setPanelTab('chart'), onLayout: () => syncDoppler(), isVisible: () => app.classList.contains('dock-open'),
    marks: () => timeline.entries(), onBeat: () => sendBeat() });
  const api = { beginSession, endSession, onEnd: () => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); }, muteEvents: () => {}, loadPreset, setTool, setAllowedTools, action: doAction, showPane: (id) => dock.show(id, { reveal: true }), setProbe: (id) => host.send({ type: 'probe', id }), openPanel, setBanner, select: (sel) => store.set({ selection: sel }) };
  // A lesson keeps its card in view where the panel covers the figure: instruments it opens are
  // flagged, not forced.
  learn = createLearn({ host: $('#panelLesson'), coach: $('#coach'), stage, panel: $('#panelChart'), dock, inspector, onWhy: (m, el) => why.open(m, el), ...api, showPane: (id) => dock.show(id, { reveal: 'lesson' }) });
  cases = createCases({ root: $('#panelCase'), api });
  presenterL = lazy(() => import('./presenter.js?v=7698699ddc'), ({ createPresenter }) => createPresenter({ loadPreset, updateParams, host, stage, dock, action: doAction,
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
  paletteL = lazy(() => import('./palette.js?v=0acb72b298'), ({ createPalette }) => createPalette({ ctx: {
    select, action: doAction, probe: (id) => { host.send({ type: 'probe', id }); logAction('probe', id); }, showPane: (id) => dock.show(id, { reveal: true }),
    jump: (d, l) => timeline.jump(d, l), undo: () => timeline.undo(), pin: () => timeline.togglePin(), lenses: Object.fromEntries(Object.entries(LENSES).map(([k, v]) => [k, v])),
    zoomLobule: () => zoomLobule('R'), instruments: () => dock.toggle(),
    loadPreset: async (id) => { if (store.get().mode !== 'explore') store.set({ mode: 'explore' }); await loadPreset(id); toast(store.get().presetList.find((p) => p.id === id)?.label); },
    lesson: (id) => startLesson(id), caseStart: (id) => startCase(id), home: () => home.open(), theme: () => toggleTheme(), help: () => openHelp(), share, restart: () => restartPatient(), reset: () => resetEverything(),
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
  wireFloating();
  // iOS scrolls the whole page to reveal a focused field, which pushes the top bar up under the
  // status bar of an installed app; the page itself never scrolls, so put it back.
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }, { passive: true });
  wireKeyboard();
  wirePanel();

  host.on('frame', onFrame);
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see the console.', 'bad'); });

  // The Sinusoid button shows only in the Lobule view: it is one level further down.
  const syncViewSeg = () => { const st = store.get(), cur = st.lobule && st.sinusoid ? 'sinusoid' : st.lobule ? 'lobule' : st.view; $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === cur))); $('#viewSeg [data-view="sinusoid"]').hidden = !st.lobule || !sinusoidSupported(); app.classList.toggle('sin-focus', !!(st.lobule && st.sinusoid)); $('#btnSinPlay').hidden = !(st.lobule && st.sinusoid); };
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
  store.on('presetId', (id) => { $('#scenarioName').textContent = presets.find((p) => p.id === id)?.label || 'Custom'; });
  store.on('role', (r) => { try { localStorage.setItem('pps.role', r); localStorage.removeItem('pps.narrator'); } catch { /* storage unavailable */ } narrPref = null; app.dataset.role = r; card.render(); narrate(store.get().frame, performance.now(), true); });
  $('#narratorWhy').addEventListener('click', (e) => why.open('pv', e.currentTarget));
  app.dataset.role = store.get().role;
  for (const k of ['compareSnap', 'compareView', 'colorMode', 'imaging', 'sinusoid', 'lobule']) store.on(k, () => { renderLegend(); renderBanner(); redraw(); });
  store.on('compareSnap', () => { if (!store.get().details) inspector.render(); });
  store.on('focus', redraw);
  store.on('labelLevel', redraw);
  store.on('selection', redraw);

  // Console handle for educators preparing a class (and for automated screenshots).
  window.pps = { loadPreset, store, updateParams, setTool, dock, stage, host, card, timeline, home, palette, startLesson, startCase, presenter };
  if (await presenter.readLink()) home.open('present');
  const shared = readShare();
  if (shared) await loadShared(shared); else timeline.reset();
  inspector.render();
  if (!(await openDeepLink())) firstRun();
  // Startup has decided who the patient is (a deep link, a shared link, or the default one): the figure may frame itself.
  store.set({ booted: true });
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  setTimeout(() => idle(() => { paletteL.warm(); presenterL.warm(); }), 3000);
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
let lastPaint = 0, lastDesc = 0, homeStale = false;
// The Doppler's vessel glows on the figure while the Doppler instrument is open.
function syncDoppler(f = store.get().frame) { stage?.setDoppler(f && dock?.isOpen('doppler') ? f.probe : null); }
function onFrame(f) {
  if (f.params) replaceParams(f.params);
  if (f.events?.length) { const hid = store.get().hiddenEvents; const ev = hid ? f.events.filter((e) => !hid.has(e.id) && !(hid.has('COLL_*') && e.id.startsWith('COLL_'))) : f.events; if (ev.length) timeline.addEvents(ev); }
  dock?.ingest(f);   // every frame's samples, even one that is not painted (or while Home covers everything)
  const now = performance.now();
  if (!f.changed && !f.params && !f.events?.length && now - lastPaint < 80) return;
  lastPaint = now;
  store.set({ frame: f, running: f.running, clock: f.clock, ...(f.clock === 'hemo' && store.get().lapse ? { lapse: 0, speed: f.speed } : {}) });
  // Home covers the whole workspace: keep the latest frame, paint it when Home closes.
  if (home?.isOpen()) { homeStale = true; return; }
  stage.update(viewFrame(f));
  card.update(f);
  dock.update(f);
  syncDoppler(f);
  inspector.update(f);
  compare.update(f);
  timeline.update(f);
  const txt = f.day > 0 ? `Day ${f.day}` : `${fmt(f.t, 0)} s`;
  if (txt !== lastClockTxt) { lastClockTxt = txt; stageClock.textContent = txt; }
  if (tipInfo) hoverInfo(tipInfo);   // the readings popup stays live with the sim
  updateBleedBanner(f);
  updateFindBadge(f);
  syncModeName();
  if (projector) updateProjector(f);
  sonifyFrame(f);
  if (now - lastDesc > 3000) { lastDesc = now; $('#stage').setAttribute('aria-description', describe(f)); }
  narrate(f, now);
}

// Narrator (blueprint E1): the Describe reading as one live line above the timeline, refreshed on
// events and changes (at most twice a second otherwise). On by default for Student and Instructor,
// off for Researcher; the Settings toggle overrides it until the role changes.
const NARRATOR_DEFAULT = { student: true, instructor: true, researcher: false };
let lastNarr = 0, narrPref;
const narratorOn = () => { const v = narrPref === undefined ? (narrPref = readLS('pps.narrator')) : narrPref; return v ? v === '1' : NARRATOR_DEFAULT[store.get().role || 'student'] !== false; };
function narrate(f, now = performance.now(), force = false) {
  const el = $('#narrator');
  const on = narratorOn() && !presenter.active();
  if (el.hidden === on) el.hidden = !on;
  if (!on || !f || (!force && !f.events?.length && !f.params && now - lastNarr < 500)) return;
  lastNarr = now;
  const txt = caption(f), t = $('#narratorText');
  if (el.title !== txt) { el.title = txt; t.replaceChildren(h('span', { class: 'nr-s' }, txt.slice(0, txt.length - caption(f, { scenario: false }).length)), caption(f, { scenario: false })); }
  $('#narratorWhy').hidden = !!store.get().hiddenReadouts?.has('pv');
}
function setNarrator(on) {
  narrPref = on ? '1' : '0';
  try { localStorage.setItem('pps.narrator', narrPref); } catch { /* storage unavailable */ }
  narrate(store.get().frame, performance.now(), true);
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
  store.set({ presetLoading: true });   // the figure frames itself once the patient has arrived (stage.js)
  dock?.clearTraces();   // the Over time and Doppler traces start over with the new (or restarted) patient
  const res = await host.request('preset', { id, days: opts.days });
  replaceParams(res.params);
  clearHistory();
  store.set({ presetLoading: false, presetId: id, lastHVPG: null, hvpgMeasured: false, selection: store.get().mode === 'cases' ? null : store.get().selection, historyTick: (store.get().historyTick || 0) + 1 });
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
// (theme, language, role, progress): the page reloads without its links or state.
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
  const back = () => { closeModal(); host.send({ type: 'restore', snap: saved.snap }); replaceParams(saved.snap.params); clearHistory(); store.set({ presetId: saved.presetId, lastHVPG: null, hvpgMeasured: false, historyTick: (store.get().historyTick || 0) + 1 }); timeline.load(saved.tl); toast('Back where you were before the ' + noun + '.'); };
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
let bleedEl, tipEl, stageClock;
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
  bleedEl = $('#bleedPill');
  enhanceRanges();
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
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => (b.dataset.view === 'lobule' ? zoomLobule() : b.dataset.view === 'sinusoid' ? store.set({ sinusoid: true }) : store.set({ lobule: false, view: b.dataset.view }))));
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
    nums.map(([p, t]) => h('span', { class: 'lg-num' + (p >= 99 ? ' end' : p <= 1 ? ' start' : ''), style: { left: p + '%' } }, t)));
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
    // Dots and the short names (SMV, IMV, SV, Sys, HA), so the key always fits in the top bar.
    el.replaceChildren(h('div', { class: 'lg-cats lg-dots' }, ...[0, 1, 2, 4, 3].map((i) => h('span', { title: ORIGINS[i][3] }, h('i', { style: { background: ORIGIN_CSS[i] } }), h('b', {}, ORIGINS[i][2])))));
    el.setAttribute('aria-label', 'Legend: blood colored by where it comes from, as streams side by side: amber SMV (with the coronary vein), teal IMV, violet SV (splenic vein), slate blue Sys (systemic), crimson HA (hepatic artery)');
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
    svgIcon(ic, 'bo-ic'), h('span', { class: 'lens-t' }, label), sub ? h('span', { class: 'lens-d' }, sub) : null);
  b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); onChange(on); });
  return b;
}
function openBlood(anchor) {
  const st = store.get(), b = st.blood || {};
  const flowOn = st.layers.flow !== false;
  const toggle = menuToggle;
  const layer = (key, ic, label, sub) => toggle(st.layers[key] !== false, ic, label, sub, (on) => store.set({ layers: { ...store.get().layers, [key]: on } }));
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Moving blood'),
    toggle(flowOn, 'streaks', 'Streaks', 'Silky streaks carried by the flow', (on) => { store.set({ layers: { ...store.get().layers, flow: on } }); syncBloodBtn(); }),
    toggle(!!b.chevrons, 'chevrons', 'Chevrons', 'Arrowheads moving with the flow; orange where it runs backwards', (on) => setBlood({ chevrons: on })),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Show on the figure'),
    layer('chips', 'tag', 'Pressure values', 'The number beside each vessel\u2019s name'),
    layer('collaterals', 'route', 'Potential collaterals', 'Dotted routes that open as pressure rises'),
    layer('labels', 'liver', 'Organ names'),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Labels'),
    labelLevelSeg(),
  ], { cls: 'blood-pop' });
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
function openLobuleLayers(anchor) {
  const l = store.get().lobuleLayers || {};
  const set = (patch) => store.set({ lobuleLayers: { ...store.get().lobuleLayers, ...patch } });
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Show on the lobule'),
    menuToggle(!!l.zones, 'zones', 'Zones', 'Rappaport zones: 1 periportal (oxygen-rich) to 3 centrilobular', (on) => set({ zones: on })),
    menuToggle(!!l.lymph, 'lymph', 'Lymph', 'Lymph forming in the space of Disse and draining to the portal tract', (on) => set({ lymph: on })),
  ], { cls: 'blood-pop' });
}
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
    h('div', { class: 'lens-grid' }, Object.keys(LENSES).map(lens)),
    s0.imaging ? h('div', { class: 'ctl-sub', style: { padding: '2px 10px 6px' } }, s0.blind ? 'The numbers appear once you answer.' : 'This case shows anatomy only until you measure.') : null,
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
let tipInfo = null;
function hoverInfo(info) {
  tipInfo = info;
  const f = store.get().frame;
  const tool = store.get().tool;
  // A long press (info.peek) shows the readings on any screen, above the finger; hovering only where there is a pointer.
  if (!info || !f || tool !== 'select' || store.get().shunting || (isPhone() && !info.peek) || store.get().imaging) { tipEl.style.display = 'none'; tipEl.classList.remove('peek'); return; }
  const e = EDGES[EI[info.id]], k = EI[info.id];
  const D = Math.max(0.5, f.D[k]) / 10;
  const v = f.Q[k] / (Math.PI * D * D / 4);
  const r = (a, b) => h('div', { class: 'r' }, a, h('b', {}, b));
  tipEl.replaceChildren(h('div', { class: 't' }, e.label),
    r('Pressure', `${fmt(f.P[NI[e.from]], 1)} → ${fmt(f.P[NI[e.to]], 1)} mmHg`), r('Flow', `${fmtFlow(f.Q[k] * 0.06)} L/min`),
    r('Velocity', `${fmt(v, 1)} cm/s`), r('Diameter', `${fmt(f.D[k], 1)} mm`), h('div', { class: 'hint' }, info.peek ? 'Tap for actions' : 'Click or right-click for actions'));
  tipEl.style.display = '';
  tipEl.classList.toggle('peek', !!info.peek);
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
    const tbl = h('button', { class: 'btn sm cmp-table-btn', title: 'Every value, then and now, in a table', onclick: () => { openPanel(); $('.cmp-section')?.scrollIntoView({ block: 'start' }); } }, 'Differences');
    kids.push(tbl);
  }
  el.replaceChildren(...kids);
  // The switch's height, for views that place their own controls under it (the lobule's).
  app.style.setProperty('--cmp-h', s0.compareSnap ? `${$('#stageCenter').offsetHeight + 8}px` : '0px');
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
  initDebug(() => stage.zoomLevel());
  $('#btnMenu').addEventListener('click', (e) => openMainMenu(e.currentTarget));
  $('#scenarioBtn').addEventListener('click', (e) => openScenarios(e.currentTarget));
  $('#btnSettings').addEventListener('click', (e) => openSettings(e.currentTarget));
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
      modeItem('present', 'present', 'projector', 'Presenter', 'A self-running tour: where is the block?')),
    h('div', { class: 'menu-title' }, t('menu.role')),
    roleControl(),
    h('div', { class: 'menu-sep' }),
    menuItem('Home page', { icon: 'grid', onClick: () => { closePopover(); home.open(); } }),
    h('div', { class: 'menu-sep' }),
    menuItem('Copy a link to this exact state', { icon: 'share', onClick: () => { closePopover(); share(); } }),
    h('div', { class: 'menu-sep' }),
    menuItem(t('menu.help') + '…', { icon: 'help', kb: '?', onClick: () => { closePopover(); setTimeout(() => openHelpMenu(anchor), 0); } }),
  ], { cls: 'main-menu', align: 'start' });
}
// The role ("I am a…") from the main menu, in any mode. It is the same setting Home shows: choosing
// one sets store.role, and the 'role' listener saves it and redraws the cards and the chart.
function roleControl() {
  const cur = () => store.get().role || 'student';
  const seg = h('div', { class: 'seg full menu-seg', role: 'group', 'aria-label': t('menu.role') }, ROLES.map(([v, l]) => h('button', { 'data-role': v, onclick: () => { store.set({ role: v }); paint(); } }, l)));
  const note = h('small', { class: 'mm-role-note' });
  function paint() {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === cur())));
    note.textContent = ROLES.find(([v]) => v === cur())?.[2] || '';
  }
  paint();
  return h('div', { class: 'mm-role' }, seg, note);
}
// Two menus with one job each: Settings (how the simulator looks and reads) and Help (how to
// use it, what it is, and who made it). The role also lives on Home, where a session starts.
function openSettings(anchor) {
  const cur = document.documentElement.getAttribute('data-theme') || 'system';
  popover(anchor, [
    h('div', { class: 'menu-title' }, t('menu.appearance')),
    h('div', { class: 'seg full menu-seg' }, [['light', t('menu.light')], ['dark', t('menu.dark')], ['system', t('menu.system')]].map(([v, l]) => { const b = h('button', { 'aria-pressed': String(cur === v) }, l); b.addEventListener('click', () => { applyTheme(v === 'system' ? null : v, v === 'system'); b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }); return b; })),
    h('div', { class: 'menu-title' }, 'Text size on the figure'),
    textSizeControl(),
    h('div', { class: 'menu-title' }, t('menu.language')),
    (() => { const sel = h('select', { class: 'select menu-select', 'aria-label': t('menu.language') }, LANGS.map(([v, l]) => h('option', { value: v, selected: currentLang() === v }, l))); sel.addEventListener('change', () => { setLang(sel.value); }); return sel; })(),
    h('div', { class: 'menu-title' }, t('menu.access')),
    menuItem(t('menu.describe'), { icon: 'info', kb: 'D', onClick: () => { closePopover(); const d = describe(store.get().frame); announce(d); toast(d); } }),
    menuToggle(narratorOn(), 'info', t('menu.narrator'), 'One line under the figure saying what it shows now', (on) => setNarrator(on)),
    menuToggle(popupsOn(), 'info', 'Pop-up notices', 'Show messages as cards at the top instead of in the line above the timeline', (on) => setPopups(on)),
    menuToggle(store.get().showHvpg, 'gauge', 'Always show HVPG', 'Show the HVPG without measuring it first (Measure › HVPG)', (on) => {
      try { localStorage.setItem('pps.showHvpg', on ? '1' : '0'); } catch { /* storage unavailable */ }
      document.body.classList.remove('hvpg-swap'); void document.body.offsetWidth; document.body.classList.add('hvpg-swap');
      setTimeout(() => document.body.classList.remove('hvpg-swap'), 600);
      store.set({ showHvpg: on });
    }),
    menuItem(t('menu.sonify'), { icon: 'activity', checked: sonifying(), onClick: (e) => { setSonify(!sonifying()); e?.currentTarget?.setAttribute('aria-checked', String(sonifying())); toast(sonifying() ? 'Sonification on: pitch follows the pressure of the selected vessel (or the portal vein).' : 'Sonification off.'); } }),
    h('div', { class: 'menu-title' }, 'Debug'),
    ...debugOptions().map(([k, l]) => menuToggle(debugOn(k), 'activity', l, null, (on) => setDebug(k, on))),
    h('div', { class: 'menu-sep' }),
    menuItem(t('menu.reset'), { icon: 'reset', onClick: () => resetEverything() }),
  ], { align: 'start', cls: 'app-menu' });
}
// Text size: smaller and larger in even steps, and the middle shows the size and resets it.
const TEXT_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
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
// Findings, Treat and Measure close the same way: the card plays its way out (CSS .card-leaving)
// while the layout already treats it as closed.
function leave(el) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('card-leaving'); void el.offsetWidth;
  el.classList.add('card-leaving');
  const done = (e) => { if (e && e.target !== el) return; el.classList.remove('card-leaving'); el.removeEventListener('animationend', done); };
  el.addEventListener('animationend', done);
  setTimeout(done, 400);
}
const arrive = (el) => el.classList.remove('card-leaving');
function panelShown() { return !app.classList.contains('instrument-focus') && app.classList.contains('panel-open'); }
// The figure re-fits to the space the open cards leave (once as the card starts, again when its sheet has settled).
let refitT = 0;
function refitStage() {
  clearTimeout(refitT);
  requestAnimationFrame(() => stage?.refit());
  refitT = setTimeout(() => stage?.refit(), 380);
}
function syncPanelToggle() {
  refitStage();
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
  arrive($('#panel'));
  app.classList.add('panel-open');
  panelSheet?.open();
  syncPanelToggle();
}
function closePanel() { if (panelShown()) leave($('#panel')); app.classList.remove('panel-open'); panelSheet?.closed(); syncPanelToggle(); }
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
    const f = store.get().frame; if (f && instr) requestAnimationFrame(() => dock.update(f, true));
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
    const gap = isPhone() ? 8 : 12;
    // The dock's height, plus on an iPhone the home indicator's strip under it (the rules that use it add
    // the gap themselves), so nothing above it is placed behind it.
    // The dock's full height is kept while it is folded to one line (figureFocus below): the framing reads it
    // (stage.js safeInsets), so the figure does not jump each time the dock folds and opens.
    const vd = $('#vdock');
    if (!vd.classList.contains('mini') && vd.offsetHeight) vd.dataset.fullH = String(vd.offsetHeight);
    const vdTop = vd.offsetHeight ? $('#stageView').getBoundingClientRect().bottom - vd.getBoundingClientRect().top : 0;
    const vdock = vd.offsetHeight ? Math.max(vd.offsetHeight, vdTop - gap) : 0, wide = !isPhone();
    // The top bar keeps one row when everything fits at its natural width (with a little to spare,
    // so it does not flip back and forth), else the view and legend move to a second row.
    // Off a phone the bar first compacts step by step (data-fit 1-3: shorter patient name, icon-only
    // buttons), so the view and the lens stay on the one row; two rows only if even that fails.
    const tb = $('#topbar'), cs = getComputedStyle(tb);
    const need = () => $('.tb-id').scrollWidth + $('#viewSeg').offsetWidth + $('.topbar .sb-right').offsetWidth + $('.top-right').scrollWidth + 6 * 8 + 16;
    const avail = tb.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const was = +(tb.dataset.fit || 0) + (tb.classList.contains('two-rows') ? 1 : 0);
    tb.classList.remove('two-rows');
    let fit = 0;
    const steps = wide ? 3 : 0;
    for (; fit <= steps; fit++) {
      tb.dataset.fit = String(fit);
      if (need() <= avail - (fit < was ? 24 : 0)) break;
    }
    if (fit > steps) { tb.dataset.fit = String(steps); tb.classList.add('two-rows'); }
    app.style.setProperty('--top-safe', px($('#topbar').offsetHeight));
    app.style.setProperty('--vdock-h', px(vdock));
    app.style.setProperty('--vdock-top', px(vd.offsetHeight ? vdTop : 0));
    const ws = $('#dock'), wsOn = app.classList.contains('dock-open') && !app.classList.contains('instrument-focus');
    const panelOcc = wide && app.classList.contains('panel-open') ? $('#panel').offsetWidth + gap : 0;
    const instrOcc = wsOn && ws.classList.contains('side') ? ws.offsetWidth + gap : 0;
    const tc = $('#treatCard'), treatOcc = wide && !tc.hidden ? tc.offsetWidth + gap : 0;
    app.style.setProperty('--panel-occ', px(panelOcc));
    app.style.setProperty('--instr-occ', px(instrOcc));
    // The presenter tour's card: at the right on a wide screen, a sheet over the bottom on a phone.
    const tour = $('.tour-card:not(.summary)'), tourSide = innerWidth >= 768, tourOcc = tour ? tour.offsetWidth + gap : 0;
    app.style.setProperty('--right-occ', px(panelOcc + instrOcc + treatOcc + (tourSide ? tourOcc : 0)));
    const sheet = wsOn && !ws.classList.contains('side') && ws.dataset.state !== 'peek' ? ws.offsetHeight + gap : 0;
    // On a phone the instruments sheet rises from the bottom edge, over the vitals dock.
    let bot = isPhone() && sheet ? Math.max(vdock + gap, sheet) : vdock + gap + sheet;
    if (tour && !tourSide) bot = Math.max(bot, tour.offsetHeight + gap);
    app.style.setProperty('--bot-occ', px(bot));
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
  dockSheet = sheetBehaviour($('#dock'), { handle: h('button', { class: 'sheet-grab', 'aria-label': 'Resize the instruments' }), drag: '.dock-head', onClose: () => dock.close(), active: () => isPhone() && !$('#dock').classList.contains('side') && !app.classList.contains('instrument-focus') });
  // Focus: dragging, pinching or scrolling the figure fades the floating pieces until it stops.
  let busyT = 0, down = null, moved = false;
  const busy = (ms) => { app.classList.add('stage-busy'); clearTimeout(busyT); busyT = setTimeout(() => app.classList.remove('stage-busy'), ms); };
  // On a phone the same gestures also give the figure more room: the vitals dock folds to one line (play,
  // clock, HVPG) and the top bar's second row (view, colour legend) slides away, while the figure moves and
  // for three seconds after. A tap anywhere, or an event on the timeline, brings them back at once.
  let focusT = 0;
  const unfocus = () => { clearTimeout(focusT); if (!app.classList.contains('figure-focus')) return; app.classList.remove('figure-focus'); $('#vdock').classList.remove('mini'); };
  const figureFocus = (ms) => {
    clearTimeout(focusT);
    if (!isPhone() || $('#strip').classList.contains('all') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    app.classList.add('figure-focus'); $('#vdock').classList.add('mini');
    if (ms) focusT = setTimeout(unfocus, ms);
  };
  // Only the figure itself: a swipe on a card (or one from the phone's edge) leaves the rest alone.
  view.addEventListener('pointerdown', (e) => { down = systemEdge(e) || e.target.closest?.('.stage-blocker, .zoom-pill, button, input, select') ? null : [e.clientX, e.clientY]; moved = false; });
  view.addEventListener('pointermove', (e) => { if (down && e.buttons && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) { busy(5000); moved = true; figureFocus(0); } });
  addEventListener('pointerup', () => { if (down) { down = null; if (app.classList.contains('stage-busy')) busy(600); if (moved) figureFocus(3000); else unfocus(); } });
  addEventListener('pointercancel', () => { if (down) { down = null; busy(300); if (moved) figureFocus(3000); } });
  view.addEventListener('wheel', () => { busy(800); figureFocus(3000); }, { passive: true });
  $('#vdock').addEventListener('pointerdown', unfocus);
  $('#topbar').addEventListener('pointerdown', unfocus);
  addEventListener('pps:event', unfocus);
}
// Phone: the chart and Treat are bottom sheets with three heights; a drag on the handle (or the
// head) moves between them, and below the lowest closes the sheet. Wider: the head drags the card
// aside, and it returns to its place when it closes.
function sheetBehaviour(el, { handle, drag, onClose, active = () => true }) {
  const SIZES = [0.32, 0.56, 0.9];
  let size = 1;
  el.prepend(handle);
  const apply = () => el.style.setProperty('--sheet-size', `${Math.round(SIZES[size] * 100)}%`);
  apply();
  handle.addEventListener('click', () => { if (!isPhone() || !active()) return; size = (size + 1) % SIZES.length; apply(); });
  let start = null;
  const grabbed = (e) => e.target === handle || (e.target.closest(drag) && !e.target.closest('button, a, input, select, [role="tab"]'));
  el.addEventListener('pointerdown', (e) => {
    if (!grabbed(e) || !active() || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
  const found = unknown ? [] : computeFindings(f.metrics, hiddenNow());
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
  const count = h('span', { class: 'card-meta' });
  const paintCount = () => { const n = chart.treatCount(store.get().params); count.textContent = n ? `${n} running` : ''; };
  sync.push(paintCount);
  const body = h('div', { class: 'tc-body' }, chart.treatBody(sync, () => {}));
  const grab = el.querySelector('.sheet-grab');
  el.replaceChildren(...[grab, h('div', { class: 'tc-head card-head' }, h('h2', { class: 'card-title' }, svgIcon('pill'), h('span', {}, 'Treat')), count,
    h('button', { class: 'ib card-close', 'aria-label': 'Close Treat', title: 'Close (Esc)', onclick: () => closeTreat() }, icon('close'))), body].filter(Boolean));
  paintCount();
  treatOff?.();
  treatOff = store.on('params', () => { for (const fn of sync) fn(); });
  arrive(el);
  el.hidden = false;
  treatSheet?.open();
  $('#btnTreat').setAttribute('aria-expanded', 'true');
  refitStage();
  requestAnimationFrame(() => stage.relayout());
}
function closeTreat() {
  const el = $('#treatCard');
  if (el.hidden) return;
  leave(el);
  el.hidden = true;
  treatOff?.(); treatOff = null;
  treatSheet?.closed();
  $('#btnTreat').setAttribute('aria-expanded', 'false');
  refitStage();
  requestAnimationFrame(() => stage.relayout());
}

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  app.dataset.mode = mode;
  const ptitle = document.querySelector('#panelTitle span'); if (ptitle) ptitle.textContent = mode === 'cases' ? 'Patient' : 'Findings';
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      const z = e.key === '=' || e.key === '+' ? 'in' : e.key === '-' || e.key === '_' ? 'out' : e.key === '0' ? 'fit' : null;
      if (z) { e.preventDefault(); if (z === 'in') stage.zoomIn(); else if (z === 'out') stage.zoomOut(); else stage.fit(); return; }
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') {
      closePopover();
      if (isModalOpen()) closeModal();
      else if (home.isOpen()) home.close();
      else if (projector) toggleProjector();
      else if (app.classList.contains('instrument-focus')) dock.setState('open');
      else if (treatOpen()) closeTreat();
      else if (stage.isShunting()) stage.cancelShunt();
      else if (store.get().tool !== 'select') setTool('select');
      else if (store.get().sinusoid && !store.get().selection) store.set({ sinusoid: false });
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
      const ks = Object.keys(LENSES), i = ks.indexOf(store.get().colorMode);
      const next = ks[(i + (e.shiftKey && k === 'l' ? ks.length - 1 : 1)) % ks.length];
      store.set({ colorMode: next }); toast(`Lens: ${LENSES[next][0]}. ${LENSES[next][1]}.`); return;
    }
    if (k === 'z') { settle(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (k === 'i') { dock.toggle(); return; }
    if (k === 't') { if (treatOpen()) closeTreat(); else openTreat(); return; }
    if (k === 'p') { timeline.togglePin(); return; }
    if (k === 'j' && !store.get().imaging) { if (!e.repeat) injectDye({ hold: true }); return; }
    if (k === 'd') { const d = describe(store.get().frame); announce(d); toast(d); return; }
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
  const hid = hiddenNow()?.has('trueHVPG');
  bigEl.replaceChildren(h('small', {}, 'HVPG'), hid ? '—' : fmt(f.metrics.hvpg, 1), h('span', { class: 'unit' }, hid ? 'not measured' : 'mmHg'));
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
    ['I', 'Open / close Measure'], ['T', 'Open / close Treat'], ['L', 'Next color lens (Shift: previous)'],
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
    h('p', { class: 'sub' }, '© 2026 Mohammad Almeqdadi. All rights reserved. Fonts: Inter, JetBrains Mono and Source Serif 4 under the SIL Open Font License, served from this site. Anatomy, pathology art and icons were drawn for this project.'),
    h('p', { class: 'disclaimer' }, t('app.disclaimer'))), { wide: true, sub: `Version ${APP_VERSION}` });
  scrollToSection(section);
}
function openPrivacy() {
  const keys = (() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('pps.')); } catch { return []; } })();
  openModal('Privacy', h('div', {},
    h('p', {}, 'The simulator runs entirely in your browser. It makes no requests to any other site: no analytics, no trackers, no advertising, no third-party fonts or scripts. There is no account and no server that stores anything about you.'),
    h('p', {}, 'What stays on this device, in your browser’s storage: your preferences (theme, language, role), lesson progress and case scores, your assessment records and the name you type for them, and presenter scripts you create. It leaves the device only when you export it (CSV, xAPI, a shared link or a script file) or when your institution runs the simulator inside its LMS, which then receives your score.'),
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
