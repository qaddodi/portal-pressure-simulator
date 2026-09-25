// Application bootstrap: wires store, engine host, figure, panel, readouts, instruments and modes.

import { startHost, host } from './host.js?v=f1fa2b60df';
import { store, updateParams, replaceParams, bindParamSender, undo, redo, canUndo, canRedo, clearHistory } from './store.js?v=384ec84b1e';
import { createStage } from './stage.js?v=0616975de4';
import { createInspector, activeInterventions } from './inspector.js?v=47209acbd6';
import { createDock } from './dock.js?v=fc98f4cdf2';
import { createWhy } from './why.js?v=0fb45a787b';
import { createEventsUI } from './events-ui.js?v=ad03b28f31';
import { createLearn } from './learn.js?v=4175e7bb4b';
import { createCases } from './cases.js?v=de5c77f6ee';
import { createCompare } from './compare.js?v=50b81a2473';
import { createFigure } from './figure.js?v=d8ed67bdf5';
import { gradientCss, flowCss, flowPos, velocityCss, velPos, heatCss, HEAT_MAX } from './colormap.js?v=fa78a29bc0';
import { EDGES, NODES } from '../engine/topology.js?v=3fdc1306dd';
import { $, $$, h, icon, fmt, toast, tooltipFor, openModal, closeModal, isModalOpen, units, popover, closePopover, menuItem, svgIcon } from './util.js?v=61d6f9c200';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const app = $('#app');
const view = $('#stageView');
const isPhone = () => matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches;
const isNarrow = () => matchMedia('(max-width: 1279px)').matches;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Tools, grouped by what the learner is doing (blueprint §8.1). Select stands alone; the rest
// live in three named groups whose trays list each tool by name, shortcut and purpose.
const TOOLS = [
  { id: 'select', icon: 'select', key: 'V', label: 'Select', group: null, hint: 'Click a vessel or label to inspect it. Hover traces the path blood takes through it. Drag to pan, scroll or pinch to zoom.' },
  { id: 'pinch', icon: 'pinch', key: 'P', label: 'Pinch · stenosis', group: 'Disease', desc: 'Narrow a vessel', hint: 'Press on a vessel and drag away from it to narrow the lumen. Resistance rises with (1 − s)⁻⁴.' },
  { id: 'thrombus', icon: 'clot', key: 'T', label: 'Thrombus', group: 'Disease', desc: 'Grow or dissolve a clot', hint: 'Press and hold on a vein to grow a clot. Hold Shift to dissolve it.' },
  { id: 'fibrosis', icon: 'fibrosis', key: 'F', label: 'Fibrosis brush', group: 'Disease', desc: 'Paint fibrosis on a liver lobe', hint: 'Press and hold on a liver lobe to lay down fibrosis in the chosen zone. Hold Shift to reverse.', zones: true },
  { id: 'stent', icon: 'stent', key: 'S', label: 'Stent · shunt', group: 'Treat', desc: 'TIPS or a surgical shunt', hint: 'Drag from a portal vessel to a systemic vein. Right portal → hepatic vein makes a TIPS; splenic → left renal a Warren shunt; portal → IVC a portocaval shunt.' },
  { id: 'band', icon: 'band', key: 'B', label: 'Band ligation', group: 'Treat', desc: 'Band esophageal varices (EVL)', hint: 'Click the esophageal varices in the lower esophagus to band a column (EVL).' },
  { id: 'occlude', icon: 'occlude', key: 'O', label: 'Occlude collateral', group: 'Treat', desc: 'Plug a collateral (BRTO)', hint: 'Click a collateral to plug it. The gastrorenal shunt is the BRTO target.' },
  { id: 'balloon', icon: 'balloon', key: 'L', label: 'Balloon tamponade', group: 'Treat', desc: 'Esophageal or gastric balloon', hint: 'Click the lower esophagus or the gastric fundus to inflate a tamponade balloon.' },
  { id: 'probe', icon: 'probe', key: 'M', label: 'Measure (hover)', group: 'Measure', desc: 'Live pressure, flow, velocity', hint: 'Hover any vessel for live pressure, flow, velocity and diameter.' },
  { id: 'catheter', icon: 'catheter', key: 'C', label: 'Hepatic vein catheter', group: 'Measure', desc: 'Free and wedged pressure → HVPG', hint: 'Click a hepatic vein to place the catheter (free pressure). Click it again to inflate the balloon and wedge.', pane: 'hvpg' },
  { id: 'doppler', icon: 'doppler', key: 'D', label: 'Doppler probe', group: 'Measure', desc: 'Spectral Doppler of a vessel', hint: 'Click a vessel to insonate it. The spectrum appears in the Doppler instrument.', pane: 'doppler' },
  { id: 'endoscope', icon: 'endoscope', key: 'E', label: 'Endoscope', group: 'Measure', desc: 'Look at the varices', hint: 'Click the esophagus or stomach to look at the varices.', pane: 'endoscopy' },
  { id: 'needle', icon: 'needle', key: 'N', label: 'Paracentesis', group: 'Measure', desc: 'Drain ascites', hint: 'Click the abdomen, then choose the volume to drain.', pane: 'abdomen' },
];
const TOOL_GROUPS = [['Disease', 'pinch'], ['Treat', 'stent'], ['Measure', 'catheter']];
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
const MODE_LABEL = { explore: 'Explore', learn: 'Learn', cases: 'Cases', compare: 'Compare' };
const compactTools = matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
const PANEL_LABEL = { explore: 'Controls', learn: 'Lesson', cases: 'Case', compare: 'Compare' };

let allowedTools = null;
let stage, inspector, dock, why, eventsUI, learn, cases, compare, figure;

async function main() {
  applyTheme(localStorage.getItem('pps.theme'));
  const kind = await startHost();
  console.info(`Engine running in ${kind === 'worker' ? 'a Web Worker' : 'the main thread'}.`);
  bindParamSender((params, settle) => host.send({ type: 'setParams', params, settle }));

  const healthy = await host.request('healthyProfile');
  store.set({ healthy: { P: healthy.P, Q: healthy.Q, metrics: healthy.metrics } });
  const { presets } = await host.request('presets');
  store.set({ presetList: presets });

  why = createWhy($('#whyPop'));
  stage = createStage({
    wrap: view,
    onSelect: (sel, opts) => { store.set({ selection: sel }); if (sel && !opts?.quiet) openPanel(); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id, { reveal: 'soft' }),
    onHoverInfo: hoverInfo,
  });
  eventsUI = createEventsUI({ onWhy: (m, el) => why.open(m, el), onOpenLog: () => dock.show('events', { reveal: true }) });
  inspector = createInspector($('#inspector'), {
    onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id, { reveal: true }), onClose: closePanel,
    onScenarios: () => openScenarios($('#scenarioBtn')), onMode: (m) => store.set({ mode: m }),
    renderAlt: () => (store.get().mode === 'compare' && !store.get().selection ? compare.render() : null), findings: eventsUI,
  });
  dock = createDock({ strip: $('#strip'), head: $('#dockHead'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => host.send({ type: 'probe', id }), onReveal: revealDock });
  compare = createCompare({ onBack: () => store.set({ mode: 'explore' }) });
  const api = { muteEvents: (v) => eventsUI.mute(v), loadPreset, setTool, setAllowedTools, action: doAction, showPane: (id) => dock.show(id, { reveal: true }), setProbe: (id) => host.send({ type: 'probe', id }), openPanel, setBanner };
  // A lesson keeps its card in view on a phone: instruments it opens are flagged, not forced.
  learn = createLearn({ host: $('#panelLesson'), panel: $('#panel'), dock, inspector, onWhy: (m, el) => why.open(m, el), ...api, showPane: (id) => dock.show(id, { reveal: 'lesson' }) });
  cases = createCases({ root: $('#inspector'), api });
  figure = createFigure({ app, stage, onClose: () => toggleFigure(false) });

  buildToolbar();
  buildHud();
  wireTopbar();
  wireTransport();
  wireKeyboard();
  wireMobile();
  wireDockResize();

  host.on('frame', onFrame);
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see the console.', 'bad'); });

  store.on('view', (v) => { stage.setView(v); $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))); });
  store.on('tool', (t) => {
    for (const c of [...view.classList]) if (c.startsWith('tool-')) view.classList.remove(c);
    view.classList.add('tool-' + t);
    renderToolbar(); renderToolCard();
  });
  store.on('mode', onMode);
  store.on('historyTick', () => { $('#btnUndo').disabled = !canUndo(); $('#btnRedo').disabled = !canRedo(); });
  store.on('layers', () => { app.classList.toggle('chips-off', !store.get().layers.chips); redraw(); });
  store.on('presetId', (id) => { $('#scenarioName').textContent = presets.find((p) => p.id === id)?.label || 'Custom'; });
  for (const k of ['compareSnap', 'compareView', 'colorMode', 'imaging']) store.on(k, () => { renderLegend(); renderBanner(); redraw(); });
  store.on('focus', redraw);
  store.on('selection', redraw);

  // Console handle for educators preparing a class (and for automated screenshots).
  window.pps = { loadPreset, store, updateParams, setTool, dock, stage, host, toggleFigure, figure };
  const shared = readShare();
  if (shared) await loadShared(shared);
  firstRun();
}
const redraw = () => { const f = store.get().frame; if (f) stage.update(viewFrame(f)); };

// ── Frames ──────────────────────────────────────────
let lastClockTxt = '', lastRunning = null, lastFig = 0;
function viewFrame(f) {
  const st = store.get();
  if (st.mode === 'compare' && st.compareSnap && st.compareView === 'A') return st.compareSnap.frame;
  return f;
}
// The engine ticks ~30×/s, but pressures ease over seconds, so the anatomy, readouts and panel
// are repainted at most ~10×/s (the chevrons animate separately). Repainting the whole SVG plate
// on every tick kept the main thread busy and the laptop warm for no visible gain.
let lastPaint = 0;
function onFrame(f) {
  if (f.params) replaceParams(f.params);
  if (f.events?.length) eventsUI.handle(f.events);
  const now = performance.now();
  if (!f.params && !f.events?.length && f.running === lastRunning && now - lastPaint < 100) return;
  lastPaint = now;
  store.set({ frame: f, running: f.running, clock: f.clock });
  stage.update(viewFrame(f));
  dock.update(f);
  inspector.update(f);
  compare.update(f);
  const txt = f.clock === 'disease' || f.day > 0 ? `Day ${f.day}` : `${fmt(f.t, 1)} s`;
  if (txt !== lastClockTxt) {
    lastClockTxt = txt;
    $('#clockReadout').replaceChildren(txt, store.get().speed !== 1 ? h('span', { class: 'spd' }, `${store.get().speed}×`) : null);
    stageClock.textContent = txt;
  }
  if (f.running !== lastRunning) {
    lastRunning = f.running;
    $('#btnPlay').replaceChildren(icon(f.running ? 'pause' : 'play'));
    $('#btnPlay').setAttribute('aria-label', f.running ? 'Pause' : 'Play');
  }
  $$('#clockSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clock === f.clock)));
  updateBleedBanner(f);
  if (projector) updateProjector(f);
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
  eventsUI?.clear();
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
  toast('Loaded the shared scenario.');
}
async function share() {
  const url = `${location.origin}${location.pathname}#s=${encodeShare()}`;
  try { await navigator.clipboard.writeText(url); toast('Link to this exact scenario copied.'); } catch { history.replaceState(null, '', url); toast('Link placed in the address bar.'); }
}

// ── Actions ─────────────────────────────────────────
function doAction(a) {
  if (a.kind === 'probe') { host.send({ type: 'probe', id: a.id }); return; }
  if (a.kind === 'paracentesisPrompt') { dock.show('abdomen', { reveal: true }); toast('Choose the volume in the Abdomen instrument, then Drain.'); return; }
  host.send({ type: 'action', action: a });
  const msgs = { infuse: { crystalloid: '1 L crystalloid running (≈25 % stays intravascular).', prbc: '1 unit of packed red cells running.', albumin: 'Albumin given: plasma oncotic pressure rises.' },
    hemorrhage: 'Hemorrhage: 500 mL lost.', band: 'Band placed on a variceal column.', valsalva: 'Valsalva: intrathoracic and abdominal pressure up for 10 s.' };
  const m = typeof msgs[a.kind] === 'object' ? msgs[a.kind][a.fluid] : msgs[a.kind];
  if (a.kind === 'paracentesis') toast(`Paracentesis: up to ${(a.mL / 1000).toFixed(1)} L drained${a.albumin ? ' with albumin' : ' without albumin'}.`);
  else if (m) toast(m);
}

// ── Tool bar ────────────────────────────────────────
function buildToolbar() {
  compactTools.addEventListener('change', renderToolbar);
  renderToolbar();
  renderToolCard();
}
const toolById = (id) => TOOLS.find((t) => t.id === id);
function renderToolbar() {
  const bar = $('#toolbar');
  const cur = store.get().tool;
  const btn = (t, { label = t.label, ic = t.icon, pressed = cur === t.id, onClick, extra = [] } = {}) => {
    const b = h('button', { class: 'tb-btn', 'aria-pressed': String(pressed), 'aria-label': `${label}${t?.key ? ` (${t.key})` : ''}` }, icon(ic), h('span', { class: 'tb-l' }, label), ...extra);
    b.addEventListener('click', onClick || (() => setTool(t.id)));
    return b;
  };
  const kids = [];
  if (compactTools.matches && !allowedTools) {
    // Phone: Select plus one named Tools tray (all three groups inside).
    const active = TOOLS.find((t) => t.id === cur && t.group);
    kids.push(btn(toolById('select')));
    const b = btn(active || { label: 'Tools', icon: 'tools' }, { label: active ? 'Tool' : 'Tools', ic: active ? active.icon : 'tools', pressed: !!active, onClick: (e) => openTray(e.currentTarget, null) });
    b.classList.add('tb-tools');
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-label', active ? `Tools: ${active.label}` : 'Tools');
    kids.push(b);
  } else if (allowedTools) {
    // A lesson or case names the tools it needs: show exactly those, by name.
    for (const id of allowedTools) { const t = toolById(id); if (t) kids.push(btn(t)); }
  } else {
    kids.push(btn(toolById('select')), h('span', { class: 'tb-sep', 'aria-hidden': 'true' }));
    for (const [g, ic] of TOOL_GROUPS) {
      const inGroup = TOOLS.filter((t) => t.group === g);
      const active = inGroup.find((t) => t.id === cur);
      const b = btn(active || { label: g, icon: ic }, {
        label: active ? active.label : g, ic: active ? active.icon : ic, pressed: !!active,
        extra: [svgIcon('chev-down', 'chev')],
        onClick: (e) => openTray(e.currentTarget, g),
      });
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-label', active ? `${g}: ${active.label}` : `${g} tools`);
      b.dataset.group = g;
      kids.push(b);
    }
  }
  bar.classList.toggle('few', !!allowedTools && allowedTools.length <= 3);
  bar.replaceChildren(...kids);
}
function openTray(anchor, group) {
  const cur = store.get().tool;
  const item = (t) => {
    const b = h('button', { class: 'tray-item', 'aria-pressed': String(cur === t.id), disabled: !!allowedTools && !allowedTools.includes(t.id) },
      icon(t.icon), h('span', { class: 'n' }, t.label), h('kbd', {}, t.key), h('span', { class: 'd' }, t.desc));
    b.addEventListener('click', () => { closePopover(); setTool(t.id); });
    return b;
  };
  const groups = group ? [group] : TOOL_GROUPS.map(([g]) => g);
  const content = groups.flatMap((g) => [h('div', { class: 'menu-title' }, g), ...TOOLS.filter((t) => t.group === g).map(item)]);
  const el = popover(anchor, content, { cls: 'tool-tray' + (group ? '' : ' all'), place: 'above', align: group ? 'center' : 'end', onClose: () => anchor.setAttribute('aria-expanded', 'false') });
  el?.querySelector('.tray-item[aria-pressed="true"], .tray-item:not(:disabled)')?.focus();
}
function setTool(id) {
  if (allowedTools && !allowedTools.includes(id)) { toast('That tool is locked in this lesson or case.'); return; }
  store.set({ tool: id });
  const t = toolById(id);
  if (t?.pane && !isPhone()) dock.show(t.pane, { reveal: true });
  if (t?.pane && isPhone()) dock.show(t.pane, { reveal: 'soft' });
}
function setAllowedTools(list) {
  allowedTools = list;
  if (list && !list.includes(store.get().tool)) store.set({ tool: 'select' });
  renderToolbar();
}
function renderToolCard() {
  const card = $('#toolHint');
  const t = toolById(store.get().tool);
  if (!t || t.id === 'select') { card.hidden = true; redraw(); return; }
  card.hidden = false;
  const close = h('button', { class: 'ib', 'aria-label': 'Back to Select', title: 'Back to Select (V)' }, icon('close'));
  close.addEventListener('click', () => setTool('select'));
  card.replaceChildren(h('div', { class: 'tc-title' }, icon(t.icon), t.label, h('kbd', {}, t.key), h('span', { class: 'sp' }), close), h('div', {}, t.hint));
  if (t.zones) {
    card.append(h('div', { class: 'seg full', role: 'group', 'aria-label': 'Fibrosis zone' }, [['pre', 'Portal tract'], ['sin', 'Sinusoids'], ['post', 'Central vein']].map(([z, l]) => {
      const b = h('button', { 'aria-pressed': String(store.get().fibrosisZone === z) }, l);
      b.addEventListener('click', () => { store.set({ fibrosisZone: z }); renderToolCard(); });
      return b;
    })));
  }
  redraw();
}

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
  $('#zoomIn').onclick = () => stage.zoomIn();
  $('#zoomOut').onclick = () => stage.zoomOut();
  $('#zoomFit').onclick = () => stage.fit();
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => store.set({ view: b.dataset.view })));
  $('#btnLayers').addEventListener('click', (e) => openLayers(e.currentTarget));
  $('#legend').addEventListener('click', (e) => openLegend(e.currentTarget));
  $('#btnFigure').addEventListener('click', () => toggleFigure(true));
  new ResizeObserver(() => stage.relayout()).observe(view);
}
function legendModel() {
  const st = store.get();
  const imaging = st.imaging;
  const cmp = st.mode === 'compare' && st.compareSnap;
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
  $('#colorModeLabel').textContent = m === 'neutral' ? 'Anatomy' : m === 'delta' && st().mode === 'compare' ? 'Change A→B' : COLOR_MODES[m];
}
const st = () => store.get();
function openLegend(anchor) {
  const { m } = legendModel();
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
      h('div', {}, h('b', { style: { color: 'var(--text)' } }, 'Notation. '), 'Dotted vessels are closed potential collaterals. Line width follows vessel diameter (compressed). Faint lines crossing an organ run behind it. ▲ / ▼ on a label: change in mmHg from healthy (from state A in Compare).'))], { align: 'end', cls: 'legend-pop' });
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
    h('div', { class: 'menu-title' }, 'Units'),
    h('div', { style: { display: 'flex', gap: '6px', padding: '2px 10px 6px' } }, unitSel('pressure', ['mmHg', 'cmH2O', 'kPa']), unitSel('flow', ['L/min', 'mL/min'])),
    h('div', { class: 'menu-sep' }),
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
  if (!info || !f || !['probe', 'select'].includes(tool) || isPhone() || store.get().imaging) { tipEl.style.display = 'none'; return; }
  const e = EDGES[EI[info.id]], k = EI[info.id];
  const D = Math.max(0.5, f.D[k]) / 10;
  const v = f.Q[k] / (Math.PI * D * D / 4);
  const r = (a, b) => h('div', { class: 'r' }, a, h('b', {}, b));
  tipEl.replaceChildren(h('div', { class: 't' }, e.label),
    r('Pressure', `${fmt(f.P[NI[e.from]], 1)} → ${fmt(f.P[NI[e.to]], 1)} mmHg`), r('Flow', `${fmt(f.Q[k] * 0.06, 2)} L/min`),
    tool === 'probe' ? [r('ΔP', `${fmt(f.P[NI[e.from]] - f.P[NI[e.to]], 1)} mmHg`), r('Velocity', `${fmt(v, 1)} cm/s`), r('Diameter', `${fmt(f.D[k], 1)} mm`)] : null);
  tipEl.style.display = '';
  const W = view.clientWidth, H = view.clientHeight;
  tipEl.style.left = Math.max(8, Math.min(W - 200, info.x + 16)) + 'px';
  tipEl.style.top = Math.max(8, Math.min(H - tipEl.offsetHeight - 8, info.y + 16)) + 'px';
}

// Banner in the figure header: what the current lesson step asks, the case clock, or A/B.
let bannerInfo = null;
function setBanner(info) { bannerInfo = info; renderBanner(); }
function renderBanner() {
  const el = $('#stageBanner');
  const s0 = store.get();
  let kids = [];
  if (s0.mode === 'compare') {
    if (s0.compareSnap) {
      const seg = h('div', { class: 'seg cmp-seg', role: 'group', 'aria-label': 'Show state' }, [['A', 'A', 'State A (snapshot)'], ['B', 'B', 'State B (now)'], ['D', 'A→B', 'Change from A to B']].map(([v, l, t]) => {
        const b = h('button', { 'aria-pressed': String((s0.compareView || 'B') === v), title: t }, h('b', {}, l));
        b.addEventListener('click', () => store.set({ compareView: v }));
        return b;
      }));
      kids = [seg];
    } else kids = [h('div', { class: 'banner' }, h('span', { class: 'b-tag' }, 'Compare'), h('span', { class: 'b-text' }, 'Capture state A in the panel, then change something'))];
  } else if (bannerInfo && (s0.mode === 'learn' || s0.mode === 'cases')) {
    kids = [h('div', { class: 'banner' + (s0.mode === 'cases' ? ' case' : ''), title: bannerInfo.text }, h('span', { class: 'b-tag' }, bannerInfo.tag), h('span', { class: 'b-text' }, bannerInfo.text))];
  }
  el.replaceChildren(...kids);
  // A clear badge when the figure shows the snapshot, not the live model.
  view.querySelector('.cmp-badge')?.remove();
  if (s0.mode === 'compare' && s0.compareSnap && s0.compareView === 'A') view.append(h('div', { class: 'cmp-badge stage-blocker' }, 'Showing state A · snapshot'));
  redraw();
}

// ── Top bar & transport ─────────────────────────────
function wireTopbar() {
  $$('#modeSeg button').forEach((b) => b.addEventListener('click', () => store.set({ mode: b.dataset.mode })));
  $('#modeMenuBtn').addEventListener('click', (e) => {
    popover(e.currentTarget, [h('div', { class: 'menu-title' }, 'Mode'), ...Object.entries(MODE_LABEL).map(([m, l]) => menuItem(l, { checked: store.get().mode === m, onClick: () => { closePopover(); store.set({ mode: m }); } }))]);
  });
  $('#scenarioBtn').addEventListener('click', (e) => openScenarios(e.currentTarget));
  $('#btnUndo').addEventListener('click', doUndo);
  $('#btnRedo').addEventListener('click', doRedo);
  $('#btnUndo').disabled = true; $('#btnRedo').disabled = true;
  $('#btnShare').addEventListener('click', share);
  $('#btnTheme').addEventListener('click', toggleTheme);
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnInspector').addEventListener('click', () => (panelShown() ? closePanel() : openPanel()));
  $('#btnMore').addEventListener('click', (e) => popover(e.currentTarget, [
    menuItem('Undo', { icon: 'undo', onClick: () => { closePopover(); doUndo(); } }), menuItem('Redo', { icon: 'redo', onClick: () => { closePopover(); doRedo(); } }),
    h('div', { class: 'menu-sep' }),
    menuItem('Figure view (export)', { icon: 'camera', onClick: () => { closePopover(); toggleFigure(true); } }),
    menuItem('Copy share link', { icon: 'share', onClick: () => { closePopover(); share(); } }),
    menuItem('Light / dark', { icon: 'theme', onClick: () => { closePopover(); toggleTheme(); } }),
    menuItem('Guide', { icon: 'help', onClick: () => { closePopover(); openHelp(); } }),
  ], { align: 'end' }));
  for (const [id, side] of [['#btnUndo', 'bottom'], ['#btnRedo', 'bottom'], ['#btnShare', 'bottom'], ['#btnTheme', 'bottom'], ['#btnHelp', 'bottom']]) {
    const b = $(id); tooltipFor(b, b.title, side); b.removeAttribute('title');
  }
}
function doUndo() { const l = undo(); if (l) toast(`Undone${l === true ? '' : `: ${l}`}`); }
function doRedo() { const l = redo(); if (l) toast(`Redone${l === true ? '' : `: ${l}`}`); }
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
function wireTransport() {
  $('#btnPlay').addEventListener('click', () => host.send({ type: 'run', running: !store.get().running }));
  $$('#clockSeg button').forEach((b) => b.addEventListener('click', () => {
    host.send({ type: 'run', clock: b.dataset.clock, running: true });
    if (b.dataset.clock === 'disease') toast('Disease clock: one simulated day per second. Collaterals, varices, spleen and ascites remodel.');
  }));
  $('#btnTime').addEventListener('click', (e) => {
    const go = (v) => { closePopover(); host.send(v === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days: v }); toast(v === 'event' ? 'Advancing until something happens (up to 2 years)…' : `Advanced ${v} days.`); };
    popover(e.currentTarget, [
      h('div', { class: 'menu-title' }, 'Fast-forward the disease'),
      menuItem('1 week', { onClick: () => go(7) }), menuItem('1 month', { onClick: () => go(30) }), menuItem('6 months', { onClick: () => go(180) }), menuItem('Until the next event', { onClick: () => go('event') }),
      h('div', { class: 'menu-sep' }),
      menuItem('Settle to equilibrium', { icon: 'settle', kb: 'Z', onClick: () => { closePopover(); settle(); } }),
      h('div', { class: 'menu-sep' }),
      h('div', { class: 'menu-title' }, 'Playback speed'),
      h('div', { class: 'seg full', style: { margin: '2px 6px 6px' }, role: 'group', 'aria-label': 'Speed' }, SPEEDS.map((v) => {
        const b = h('button', { 'aria-pressed': String(store.get().speed === v) }, `${v}×`);
        b.addEventListener('click', () => { setSpeed(v); closePopover(); });
        return b;
      })),
    ], { place: 'above', align: 'start', cls: 'time-pop' });
  });
  tooltipFor($('#btnTime'), 'Speed, fast-forward, settle', 'top');
}
function settle() { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); }
function setSpeed(v) { store.set({ speed: v }); host.send({ type: 'run', speed: v }); lastClockTxt = ''; }
function applyTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  try { if (t) localStorage.setItem('pps.theme', t); } catch { /* storage unavailable */ }
  const f = store.get().frame; if (f) { stage?.update(viewFrame(f)); dock?.update(f); }
}
function panelShown() { return isNarrow() ? app.classList.contains('panel-open') : !app.classList.contains('panel-collapsed'); }
function syncPanelToggle() { $('#btnInspector').setAttribute('aria-pressed', String(panelShown())); setTimeout(() => stage?.relayout(), 320); }
function openPanel() {
  app.classList.remove('panel-collapsed'); app.classList.add('panel-open');
  if (isPhone()) setSheet('panel');
  syncPanelToggle();
}
function closePanel() { if (isNarrow()) app.classList.remove('panel-open'); else app.classList.add('panel-collapsed'); syncPanelToggle(); }

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  app.dataset.mode = mode;
  $$('#modeSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#modeMenuLabel').textContent = MODE_LABEL[mode];
  if (mode !== 'cases' && cases?.active()) cases.exit();
  if (mode !== 'learn' && mode !== 'cases') { bannerInfo = null; store.set({ focus: null }); }
  if (mode === 'cases') { cases.mount(); openPanel(); }
  else inspector.render();
  if (mode === 'learn') { learn.render(); if (!learn.active()) learn.openList(); }
  if (mode === 'compare') openPanel();
  if (mode === 'explore') { store.set({ locked: null, hiddenReadouts: null, imaging: false }); setAllowedTools(null); }
  $('#mobilePanelLabel').textContent = PANEL_LABEL[mode];
  $('#panelToggleLabel').textContent = PANEL_LABEL[mode];
  renderToolCard(); renderBanner(); renderLegend();
  if (isPhone()) setSheet('panel');
}

// ── Keyboard (§8.5) ─────────────────────────────────
function wireKeyboard() {
  addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === 'Escape') {
      closePopover();
      if (isModalOpen()) closeModal();
      else if (app.classList.contains('figure-mode')) toggleFigure(false);
      else if (projector) toggleProjector();
      else if (store.get().tool !== 'select') setTool('select');
      else store.set({ selection: null });
      return;
    }
    if (isModalOpen()) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? doRedo : doUndo)(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest?.('.v-hit, button, .lb')) { e.preventDefault(); $('#btnPlay').click(); return; }
    if (e.key === '.') { host.send({ type: 'run', running: true }); setTimeout(() => host.send({ type: 'run', running: false }), 60); return; }
    if (e.key === '[' || e.key === ']') {
      const i = SPEEDS.indexOf(store.get().speed);
      setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + (e.key === ']' ? 1 : -1)))]);
      toast(`Speed ${store.get().speed}×`);
      return;
    }
    if (['1', '2', '3', '4'].includes(e.key)) { store.set({ mode: ['explore', 'learn', 'cases', 'compare'][+e.key - 1] }); return; }
    if (e.key.toLowerCase() === 'a' && !e.shiftKey) { store.set({ view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
    if (e.key === 'C' && e.shiftKey && !e.ctrlKey && !e.metaKey && !store.get().imaging) {
      const ks = Object.keys(LENSES), i = ks.indexOf(store.get().colorMode);
      const next = ks[(i + 1) % ks.length];
      store.set({ colorMode: next }); toast(`Color: ${LENSES[next][0]}. ${LENSES[next][1]}.`); return;
    }
    if (e.key.toLowerCase() === 'z') { settle(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (e.key === 'F' && e.shiftKey) { toggleProjector(); return; }
    if (e.key === 'f' && !e.shiftKey && store.get().tool === 'select') { toggleFigure(); return; }
    if (e.key === 'i') { dock.toggle(); return; }
    const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (t) setTool(t.id);
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
function setSheet(s) {
  app.dataset.sheet = s;
  app.classList.remove('fig-expanded');
  $('#btnExpand').setAttribute('aria-pressed', 'false');
  $$('#mobileTabs button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.sheet === s)); if (b.dataset.sheet === s) b.classList.remove('ping'); });
  const f = store.get().frame; if (f) requestAnimationFrame(() => dock.update(f, true));
}
// How an instrument is brought forward: 'hard' (a button asked for it) opens it; 'lesson' opens
// the drawer on desktop but only flags it on a phone; 'soft' (a click on the figure) never
// re-frames the figure under the pointer, so it only flags the drawer when it is closed.
function revealDock(mode) {
  if (!isPhone()) {
    if (mode === 'soft' && !app.classList.contains('dock-open')) $('#dockHead .dock-title').classList.add('ping');
    else app.classList.add('dock-open');
    return;
  }
  if (mode === 'soft' || mode === 'lesson') { if (app.dataset.sheet !== 'charts') $('#mobileTabs button[data-sheet="charts"]').classList.add('ping'); }
  else setSheet('charts');
}
function wireMobile() {
  $$('#mobileTabs button').forEach((b) => b.addEventListener('click', () => setSheet(b.dataset.sheet)));
  $('#btnExpand').addEventListener('click', () => {
    const on = !app.classList.contains('fig-expanded');
    app.classList.toggle('fig-expanded', on);
    $('#btnExpand').setAttribute('aria-pressed', String(on));
    $('#btnExpand').setAttribute('aria-label', on ? 'Show panels' : 'Expand figure');
  });
  // Tablet: the panel starts closed so the figure has the width; desktop: open.
  if (isNarrow()) app.classList.remove('panel-open');
  syncPanelToggle();
}
function wireDockResize() {
  const handle = $('#dockResize');
  let y0 = 0, h0 = 0;
  handle.addEventListener('pointerdown', (e) => {
    y0 = e.clientY; h0 = $('#dock').getBoundingClientRect().height; handle.setPointerCapture(e.pointerId);
    $('#dock').style.transition = 'none';
    handle.onpointermove = (ev) => { const nh = Math.max(180, Math.min(innerHeight * 0.6, h0 + (y0 - ev.clientY))); app.style.setProperty('--dock-open-h', nh + 'px'); };
  });
  handle.addEventListener('pointerup', () => { handle.onpointermove = null; $('#dock').style.transition = ''; const f = store.get().frame; if (f) dock.update(f, true); });
}

// ── Help & first run ────────────────────────────────
function brandMark() {
  const s = document.querySelector('.brand-mark').cloneNode(true);
  s.removeAttribute('class');
  return s;
}
function openHelp() {
  const rows = [
    ['Space', 'Play / pause'], ['[ ]', 'Slower / faster'], ['.', 'Step'], ['Z', 'Settle to equilibrium'], ['A', 'Anatomy ⇄ circuit'], ['1 – 4', 'Explore · Learn · Cases · Compare'],
    ['F', 'Figure view'], ['I', 'Open / close instruments'],
    ...TOOLS.map((t) => [t.key, t.label]), ['Ctrl/⌘ Z', 'Undo (Shift to redo)'], ['Esc', 'Back to Select · clear selection · close'], ['Shift F', 'Projector mode'], ['?', 'This guide'],
    ['Tab · ← →', 'Walk vessels along the flow'], ['+ −', 'Stenosis on the focused vessel'],
  ];
  openModal('Guide', h('div', {},
    h('p', {}, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model. Nothing is scripted: change a resistance and watch the consequences propagate.'),
    h('div', { class: 'entry-grid' },
      [['explore', 'Manipulate the anatomy', 'Pick a tool group under the figure: Disease, Treat or Measure. Pinch vessels, paint clots or fibrosis, drag a TIPS, band varices, wedge a catheter.'],
        ['settle', 'Two clocks', 'Seconds for hemodynamics. Months for remodeling: collaterals, varices, spleen and ascites.'],
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
function firstRun() {
  let seen = false;
  try { seen = localStorage.getItem('pps.seen') === '1'; } catch { /* storage unavailable */ }
  if (seen) return;
  const done = () => { try { localStorage.setItem('pps.seen', '1'); } catch { /* storage unavailable */ } closeModal(); };
  const entry = (ic, t, d, fn) => h('button', { class: 'entry', onclick: () => { done(); fn(); } }, h('span', { class: 'eic' }, icon(ic)), h('span', { class: 't' }, t), h('span', { class: 'd' }, d));
  openModal('Welcome', h('div', { class: 'welcome' },
    h('div', { class: 'welcome-hero' }, brandMark(), h('div', {}, h('h1', {}, 'Portal Pressure Simulator'), h('p', { class: 'sub', style: { margin: '4px 0 0' } }, 'A living, physics-based model of the portal circulation.'))),
    h('p', { style: { margin: 0 } }, 'Raise a resistance anywhere from the gut to the heart and blood finds another way: collaterals open, varices swell until they rupture, the portal vein reverses and ascites accumulates. All of it emerges from one hemodynamic model.'),
    h('div', { class: 'entry-grid' },
      entry('explore', 'Explore freely', 'Start from a healthy liver, or pick a patient scenario.', () => {}),
      entry('book', 'Take a lesson', '11 short lessons: predict, observe, explain.', () => store.set({ mode: 'learn' })),
      entry('case', 'Manage a case', 'A variceal bleed at 3 a.m., and three diagnostic puzzles.', () => store.set({ mode: 'cases' }))),
    h('p', { class: 'disclaimer', style: { margin: 0 } }, 'Educational simulation. Simplified model with illustrative values; not for diagnosis or treatment decisions.')), { bare: true });
}

main().catch((err) => { console.error(err); document.body.append(h('pre', { style: { position: 'fixed', bottom: 0, left: 0, background: '#fff', color: '#900', padding: '8px', zIndex: 999 } }, String(err.stack || err))); });
