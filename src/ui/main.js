// Application bootstrap: wires store, engine host, stage, panel, readouts, dock and modes.

import { startHost, host } from './host.js';
import { store, updateParams, replaceParams, bindParamSender, undo, redo, canUndo, canRedo, clearHistory } from './store.js';
import { createStage } from './stage.js';
import { createInspector } from './inspector.js';
import { createDock } from './dock.js';
import { createWhy } from './why.js';
import { createEventsUI } from './events-ui.js';
import { createLearn } from './learn.js';
import { createCases } from './cases.js';
import { gradientCss } from './colormap.js';
import { EDGES, NODES } from '../engine/topology.js';
import { $, $$, h, icon, fmt, toast, tooltipFor, openModal, closeModal, isModalOpen, units, popover, closePopover, menuItem } from './util.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const app = $('#app');
const wrap = $('#stageWrap');
const isPhone = () => matchMedia('(max-width: 767px)').matches;
const isNarrow = () => matchMedia('(max-width: 1279px)').matches;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

// Tools, grouped by what the learner is doing (blueprint §8.1).
const TOOLS = [
  { id: 'select', icon: 'select', key: 'V', label: 'Select', group: 'Inspect', hint: 'Click a vessel or label to inspect it. Hover traces the path blood takes through it. Drag to pan, scroll to zoom.' },
  { id: 'probe', icon: 'probe', key: 'M', label: 'Measure', group: 'Inspect', hint: 'Hover any vessel for live pressure, flow, velocity and diameter.' },
  { id: 'pinch', icon: 'pinch', key: 'P', label: 'Pinch · stenosis', group: 'Disease', hint: 'Press on a vessel and drag away from it to narrow the lumen. Resistance rises with (1 − s)⁻⁴.' },
  { id: 'thrombus', icon: 'clot', key: 'T', label: 'Thrombus', group: 'Disease', hint: 'Press and hold on a vein to grow a clot. Hold Shift to dissolve it.' },
  { id: 'fibrosis', icon: 'fibrosis', key: 'F', label: 'Fibrosis brush', group: 'Disease', hint: 'Press and hold on a liver lobe to lay down fibrosis in the chosen zone. Hold Shift to reverse.', zones: true },
  { id: 'stent', icon: 'stent', key: 'S', label: 'Stent · shunt', group: 'Treat', hint: 'Drag from a portal vessel to a systemic vein. Right portal → hepatic vein makes a TIPS; splenic → left renal a Warren shunt; portal → IVC a portocaval shunt.' },
  { id: 'band', icon: 'band', key: 'B', label: 'Band ligation', group: 'Treat', hint: 'Click the esophageal varices in the lower esophagus to band a column (EVL).' },
  { id: 'occlude', icon: 'occlude', key: 'O', label: 'Occlude collateral', group: 'Treat', hint: 'Click a collateral to plug it. The gastrorenal shunt is the BRTO target.' },
  { id: 'balloon', icon: 'balloon', key: 'L', label: 'Balloon tamponade', group: 'Treat', hint: 'Click the lower esophagus or the gastric fundus to inflate a tamponade balloon.' },
  { id: 'catheter', icon: 'catheter', key: 'C', label: 'Hepatic vein catheter', group: 'Measure', hint: 'Click a hepatic vein to place the catheter (free pressure). Click it again to inflate the balloon and wedge.' },
  { id: 'doppler', icon: 'doppler', key: 'D', label: 'Doppler probe', group: 'Measure', hint: 'Click a vessel to insonate it. The spectrum appears in the Doppler tab.' },
  { id: 'endoscope', icon: 'endoscope', key: 'E', label: 'Endoscope', group: 'Measure', hint: 'Click the esophagus or stomach to look at the varices.' },
  { id: 'needle', icon: 'needle', key: 'N', label: 'Paracentesis', group: 'Measure', hint: 'Click the abdomen, then choose the volume to drain.' },
];

const GROUP_COLOR = { Normal: 'var(--ok)', Prehepatic: 'var(--s1)', Presinusoidal: 'var(--s7)', Sinusoidal: 'var(--s5)', Postsinusoidal: 'var(--s2)', Posthepatic: 'var(--s4)', Cardiac: 'var(--s8)' };

let allowedTools = null;
let stage, inspector, dock, why, eventsUI, learn, cases;

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
    wrap,
    onSelect: (sel, opts) => { store.set({ selection: sel }); if (sel && !opts?.quiet) openPanel(); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id),
    onHoverInfo: hoverInfo,
  });
  inspector = createInspector($('#inspector'), { onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id), onClose: closePanel });
  dock = createDock({ strip: $('#strip'), tabs: $('#dockTabs'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => host.send({ type: 'probe', id }) });
  eventsUI = createEventsUI({ stack: $('#events'), overlay: $('#overlay'), vignette: $('#vignette'), stage, onWhy: (m, el) => why.open(m, el) });
  const api = { loadPreset, setTool, setAllowedTools, action: doAction, showPane: (id) => dock.show(id), setProbe: (id) => host.send({ type: 'probe', id }), openPanel };
  learn = createLearn({ host: $('#panelLesson'), panel: $('#panel'), dock, inspector, onWhy: (m, el) => why.open(m, el), ...api });
  cases = createCases({ root: $('#inspector'), api });

  buildPalette();
  buildHud();
  wireTopbar();
  wireTransport();
  wireKeyboard();
  wireMobile();
  wireDockResize();

  host.on('frame', onFrame);
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see the console.', 'bad'); });

  store.on('view', (v) => { stage.setView(v); $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))); });
  store.on('tool', (t) => { $$('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t))); for (const c of [...wrap.classList]) if (c.startsWith('tool-')) wrap.classList.remove(c); wrap.classList.add('tool-' + t); renderToolCard(); });
  store.on('mode', onMode);
  store.on('historyTick', () => { $('#btnUndo').disabled = !canUndo(); $('#btnRedo').disabled = !canRedo(); });
  store.on('layers', () => app.classList.toggle('chips-off', !store.get().layers.chips));
  store.on('presetId', (id) => { $('#scenarioName').textContent = presets.find((p) => p.id === id)?.label || 'Custom'; });

  // Console handle for educators preparing a class (and for automated screenshots).
  window.pps = { loadPreset, store, updateParams, setTool, dock, stage, host };
  const shared = readShare();
  if (shared) await loadShared(shared);
  firstRun();
}

// ── Frames ──────────────────────────────────────────
let lastClockTxt = '', lastRunning = null;
function onFrame(f) {
  if (f.params) replaceParams(f.params);
  store.set({ frame: f, running: f.running, clock: f.clock });
  stage.update(f);
  dock.update(f);
  inspector.update(f);
  if (f.events?.length) eventsUI.handle(f.events);
  eventsUI.position();
  const txt = f.clock === 'disease' || f.day > 0 ? `Day ${f.day}` : `${fmt(f.t, 1)} s`;
  if (txt !== lastClockTxt) { $('#clockReadout').textContent = txt; lastClockTxt = txt; }
  if (f.running !== lastRunning) {
    lastRunning = f.running;
    $('#btnPlay').replaceChildren(icon(f.running ? 'pause' : 'play'));
    $('#btnPlay').setAttribute('aria-label', f.running ? 'Pause' : 'Play');
  }
  $$('#clockSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clock === f.clock)));
  $('#speedBtn').textContent = `${store.get().speed}×`;
  updateBleedBanner(f);
  if (projector) updateProjector(f);
}

// ── Scenarios & share ───────────────────────────────
function openScenarios(anchor) {
  const presets = store.get().presetList;
  const groups = {};
  for (const p of presets) (groups[p.group] ||= []).push(p);
  const cur = store.get().presetId;
  const body = h('div', {},
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 10px 10px' } },
      h('div', {}, h('div', { style: { fontWeight: 600, fontSize: '15px' } }, 'Patient scenarios'), h('div', { class: 'sub' }, 'Grouped by where the resistance sits, from the gut to the heart.')),
      h('span', { class: 'muted', style: { fontSize: '12px' } }, `${presets.length} scenarios`)),
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

// ── Actions ─────────────────────────────────────────
function doAction(a) {
  if (a.kind === 'probe') { host.send({ type: 'probe', id: a.id }); return; }
  if (a.kind === 'paracentesisPrompt') { dock.show('abdomen'); if (isPhone()) setSheet('charts'); toast('Choose the volume in the Abdomen tab, then Drain.'); return; }
  host.send({ type: 'action', action: a });
  const msgs = { infuse: { crystalloid: '1 L crystalloid running (≈25 % stays intravascular).', prbc: '1 unit of packed red cells running.', albumin: 'Albumin given: plasma oncotic pressure rises.' },
    hemorrhage: 'Hemorrhage: 500 mL lost.', band: 'Band placed on a variceal column.', valsalva: 'Valsalva: intrathoracic and abdominal pressure up for 10 s.' };
  const m = typeof msgs[a.kind] === 'object' ? msgs[a.kind][a.fluid] : msgs[a.kind];
  if (a.kind === 'paracentesis') toast(`Paracentesis: up to ${(a.mL / 1000).toFixed(1)} L drained${a.albumin ? ' with albumin' : ' without albumin'}.`);
  else if (m) toast(m);
}

// ── Tool palette ────────────────────────────────────
function buildPalette() {
  const rail = $('#toolRail');
  let group = null;
  for (const t of TOOLS) {
    if (group && t.group !== group) rail.append(h('div', { class: 'pal-sep', role: 'separator' }));
    group = t.group;
    const b = h('button', { class: 'tool', 'data-tool': t.id, 'aria-label': `${t.label} (${t.key})`, 'aria-pressed': String(t.id === 'select') }, icon(t.icon));
    b.addEventListener('click', () => setTool(t.id));
    tooltipFor(b, { text: t.label, key: t.key }, 'top');
    rail.append(b);
  }
}
function setTool(id) {
  if (allowedTools && !allowedTools.includes(id)) { toast('That tool is locked in this lesson or case.'); return; }
  store.set({ tool: id });
  if (isPhone()) app.classList.remove('rail-open');
}
function setAllowedTools(list) {
  allowedTools = list;
  $$('.tool').forEach((b) => { b.disabled = !!list && !list.includes(b.dataset.tool); });
  if (list && !list.includes(store.get().tool)) store.set({ tool: 'select' });
}
let cardTimer = null;
function renderToolCard() {
  const card = $('#toolHint');
  const t = TOOLS.find((x) => x.id === store.get().tool);
  clearTimeout(cardTimer);
  if (t.id === 'select' || store.get().mode === 'cases') { card.hidden = true; return; }
  card.hidden = false; card.classList.remove('faded');
  card.replaceChildren(h('div', { class: 'tc-title' }, t.label, h('kbd', {}, t.key)), h('div', {}, t.hint));
  if (t.zones) {
    card.append(h('div', { class: 'seg full', role: 'group', 'aria-label': 'Fibrosis zone' }, [['pre', 'Portal tract'], ['sin', 'Sinusoids'], ['post', 'Central vein']].map(([z, l]) => {
      const b = h('button', { 'aria-pressed': String(store.get().fibrosisZone === z) }, l);
      b.addEventListener('click', () => { store.set({ fibrosisZone: z }); renderToolCard(); });
      return b;
    })));
  } else cardTimer = setTimeout(() => card.classList.add('faded'), 9000);
}

// ── HUD: legend, layers, bleed banner, hover tip ────
let bleedEl, tipEl, legendEl;
function buildHud() {
  legendEl = h('div', { class: 'legend glass', 'aria-label': 'Vessel color legend' });
  $('#hudBL').append(legendEl);
  renderLegend();
  store.on('colorMode', renderLegend);
  bleedEl = h('div', { class: 'bleed-banner', role: 'alert', hidden: true });
  $('#hudTC').append(bleedEl);
  tipEl = h('div', { class: 'glass hover-tip', style: { display: 'none' } });
  wrap.append(tipEl);
  $('#zoomIn').onclick = () => stage.zoomIn();
  $('#zoomOut').onclick = () => stage.zoomOut();
  $('#zoomFit').onclick = () => stage.fit();
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => store.set({ view: b.dataset.view })));
  $('#btnLayers').addEventListener('click', (e) => openLayers(e.currentTarget));
}
function renderLegend() {
  const m = store.get().colorMode;
  if (m === 'pressure' || m === 'drop') {
    const max = 30, at = (p) => `${(p / max) * 100}%`;
    const ticks = m === 'pressure'
      ? [[30, '30', ''], [20, '20', 'high risk'], [12, '12', 'bleeding', 'hot', -5], [10, '10', 'CSPH', '', 5], [5, '5', 'normal'], [0, '0', '']]
      : [[30, '12+', 'large drop'], [0, '0', 'no drop']];
    legendEl.replaceChildren(
      h('div', { class: 'legend-title' }, m === 'pressure' ? 'Venous pressure' : 'Pressure drop'), h('div', { class: 'legend-unit' }, 'mmHg'),
      h('div', { class: 'legend-v' }, h('div', { class: 'legend-bar', style: { background: gradientCss('to top', max) } }),
        h('div', { class: 'legend-ticks' }, ticks.map(([p, n, lab, cls, dy]) => h('span', { class: cls || '', style: { bottom: at(p), marginBottom: `${-(dy || 0)}px` } }, h('b', {}, n), lab)))));
  } else if (m === 'direction') {
    legendEl.replaceChildren(h('div', { class: 'legend-title' }, 'Flow direction'),
      h('div', { class: 'legend-cats' }, h('span', {}, h('i', { style: { background: 'var(--flow-normal)' } }), 'Physiological'), h('span', {}, h('i', { style: { background: 'var(--flow-reversed)' } }), '⟲ Reversed')));
  } else {
    legendEl.replaceChildren(h('div', { class: 'legend-title' }, 'Change from healthy'), h('div', { class: 'legend-unit' }, 'mmHg'),
      h('div', { class: 'legend-v' }, h('div', { class: 'legend-bar', style: { background: 'linear-gradient(to top, #2D6CDF, #9696A0, #D22846)' } }),
        h('div', { class: 'legend-ticks' }, [[100, '+12', 'higher'], [50, '0', ''], [0, '−12', 'lower']].map(([y, t, lab]) => h('span', { style: { bottom: y + '%' } }, h('b', {}, t), lab)))));
  }
}
function openLayers(anchor) {
  const st = store.get();
  const cb = (key, label) => {
    const c = h('input', { type: 'checkbox', checked: st.layers[key] });
    c.addEventListener('change', () => store.set({ layers: { ...store.get().layers, [key]: c.checked } }));
    return h('label', { class: 'menu-item' }, c, label);
  };
  const radio = (v, l) => menuItem(l, { checked: store.get().colorMode === v, onClick: () => { store.set({ colorMode: v }); closePopover(); } });
  const unitSel = (kind, opts) => {
    const s = h('select', { class: 'select', style: { height: '28px', fontSize: '12.5px' } }, opts.map((u) => h('option', { value: u, selected: units[kind] === u }, u)));
    s.addEventListener('change', () => { units[kind] = s.value; inspector.render(); });
    return s;
  };
  popover(anchor, [
    h('div', { class: 'menu-title' }, 'Vessel color'),
    radio('pressure', 'Absolute pressure'), radio('drop', 'Pressure drop (where resistance lives)'), radio('direction', 'Flow direction'), radio('delta', 'Change from healthy'),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Show'),
    cb('particles', 'Flowing blood'), cb('chips', 'Pressure labels'), cb('collaterals', 'Potential collaterals (dotted)'), cb('labels', 'Organ names'),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Units'),
    h('div', { style: { display: 'flex', gap: '6px', padding: '2px 10px 6px' } }, unitSel('pressure', ['mmHg', 'cmH2O', 'kPa']), unitSel('flow', ['L/min', 'mL/min'])),
    h('div', { class: 'menu-sep' }),
    menuItem('Projector mode', { icon: 'projector', kb: 'Shift F', onClick: () => { closePopover(); toggleProjector(); } }),
  ], { cls: 'layers-pop' });
}
function updateBleedBanner(f) {
  const b = f.metrics.bleeding;
  bleedEl.hidden = !b;
  if (!b) return;
  bleedEl.replaceChildren(h('span', { class: 'dot' }), h('b', {}, b.site === 'GV' ? 'Gastric variceal bleeding' : 'Esophageal variceal bleeding'),
    h('span', { class: 'num' }, `${Math.round(b.rate)} mL/min`), h('span', { class: 'num' }, `lost ${Math.round(f.metrics.blood.lost)} mL`), h('span', { class: 'num' }, `MAP ${Math.round(f.metrics.map)}`));
}
function hoverInfo(info) {
  const f = store.get().frame;
  const tool = store.get().tool;
  if (!info || !f || !['probe', 'select'].includes(tool) || isPhone()) { tipEl.style.display = 'none'; return; }
  const e = EDGES[EI[info.id]], k = EI[info.id];
  const D = Math.max(0.5, f.D[k]) / 10;
  const v = f.Q[k] / (Math.PI * D * D / 4);
  const r = (a, b) => h('div', { class: 'r' }, a, h('b', {}, b));
  tipEl.replaceChildren(h('div', { class: 't' }, e.label),
    r('Pressure', `${fmt(f.P[NI[e.from]], 1)} → ${fmt(f.P[NI[e.to]], 1)} mmHg`), r('Flow', `${fmt(f.Q[k] * 0.06, 2)} L/min`),
    tool === 'probe' ? [r('ΔP', `${fmt(f.P[NI[e.from]] - f.P[NI[e.to]], 1)} mmHg`), r('Velocity', `${fmt(v, 1)} cm/s`), r('Diameter', `${fmt(f.D[k], 1)} mm`)] : null);
  tipEl.style.display = '';
  const W = wrap.clientWidth;
  tipEl.style.left = Math.min(W - 210, info.x + 18) + 'px';
  tipEl.style.top = (info.y + 18) + 'px';
}

// ── Top bar & transport ─────────────────────────────
function wireTopbar() {
  $$('#modeSeg button').forEach((b) => b.addEventListener('click', () => store.set({ mode: b.dataset.mode })));
  $('#scenarioBtn').addEventListener('click', (e) => openScenarios(e.currentTarget));
  $('#btnUndo').addEventListener('click', () => { const l = undo(); if (l) toast(`Undone${l === true ? '' : `: ${l}`}`); });
  $('#btnRedo').addEventListener('click', () => { const l = redo(); if (l) toast(`Redone${l === true ? '' : `: ${l}`}`); });
  $('#btnUndo').disabled = true; $('#btnRedo').disabled = true;
  $('#btnShare').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#s=${encodeShare()}`;
    try { await navigator.clipboard.writeText(url); toast('Link to this exact scenario copied.'); } catch { history.replaceState(null, '', url); toast('Link placed in the address bar.'); }
  });
  $('#btnTheme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnInspector').addEventListener('click', () => (app.classList.contains('panel-open') ? closePanel() : openPanel()));
  for (const [id, side] of [['#btnUndo', 'bottom'], ['#btnRedo', 'bottom'], ['#btnShare', 'bottom'], ['#btnTheme', 'bottom'], ['#btnHelp', 'bottom'], ['#btnInspector', 'bottom']]) {
    const b = $(id); tooltipFor(b, b.title, side); b.removeAttribute('title');
  }
}
function wireTransport() {
  // Wide screens: playback lives in the top bar so nothing floats over the top of the anatomy.
  const wide = matchMedia('(min-width: 1280px)');
  const place = () => {
    const tr = $('#transport');
    if (wide.matches) $('#modeSeg').after(tr); else $('#hudTC').prepend(tr);
    tr.classList.toggle('in-topbar', wide.matches);
  };
  wide.addEventListener('change', place);
  place();
  $('#btnPlay').addEventListener('click', () => host.send({ type: 'run', running: !store.get().running }));
  $('#speedBtn').addEventListener('click', (e) => {
    popover(e.currentTarget, [h('div', { class: 'menu-title' }, 'Speed'), ...SPEEDS.map((v) => menuItem(`${v}×`, { checked: store.get().speed === v, onClick: () => { setSpeed(v); closePopover(); } }))], { place: 'above', align: 'center' });
  });
  $('#btnSettle').addEventListener('click', () => { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); });
  $$('#clockSeg button').forEach((b) => b.addEventListener('click', () => {
    host.send({ type: 'run', clock: b.dataset.clock, running: true });
    if (b.dataset.clock === 'disease') toast('Disease clock: one simulated day per second. Collaterals, varices, spleen and ascites remodel.');
  }));
  $('#btnAdvance').addEventListener('click', (e) => {
    const go = (v) => { closePopover(); host.send(v === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days: v }); toast(v === 'event' ? 'Advancing until something happens (up to 2 years)…' : `Advanced ${v} days.`); };
    popover(e.currentTarget, [h('div', { class: 'menu-title' }, 'Fast-forward the disease'),
      menuItem('1 week', { onClick: () => go(7) }), menuItem('1 month', { onClick: () => go(30) }), menuItem('6 months', { onClick: () => go(180) }),
      h('div', { class: 'menu-sep' }), menuItem('Until the next event', { onClick: () => go('event') })], { place: 'above', align: 'center' });
  });
  tooltipFor($('#btnAdvance'), 'Fast-forward the disease', 'bottom');
  tooltipFor($('#btnSettle'), { text: 'Settle to equilibrium', key: 'Z' }, 'bottom');
}
function setSpeed(v) { store.set({ speed: v }); host.send({ type: 'run', speed: v }); $('#speedBtn').textContent = `${v}×`; }
function applyTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  try { if (t) localStorage.setItem('pps.theme', t); } catch { /* storage unavailable */ }
  const f = store.get().frame; if (f) { stage?.update(f); dock?.update(f); }
}
function openPanel() {
  app.classList.remove('panel-collapsed'); app.classList.add('panel-open');
  if (isPhone()) setSheet('panel');
}
function closePanel() { if (isNarrow()) app.classList.remove('panel-open'); else app.classList.add('panel-collapsed'); }

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  app.dataset.mode = mode;
  $$('#modeSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  if (mode !== 'cases' && cases?.active()) cases.exit();
  if (mode === 'cases') { cases.mount(); openPanel(); }
  else inspector.render();
  if (mode === 'learn') { learn.render(); if (!learn.active()) learn.openList(); }
  if (mode === 'compare' && !store.get().compareSnap) toast('Take snapshot A in the Compare tab, then change something.');
  if (mode === 'explore') { store.set({ locked: null, hiddenReadouts: null }); setAllowedTools(null); }
  $('#mobilePanelLabel').textContent = { explore: 'Controls', learn: 'Lesson', cases: 'Case', compare: 'Controls' }[mode];
  renderToolCard();
  if (isPhone()) setSheet('panel');
}

// ── Keyboard (§8.5) ─────────────────────────────────
function wireKeyboard() {
  addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === 'Escape') { closePopover(); if (isModalOpen()) closeModal(); else store.set({ selection: null }); return; }
    if (isModalOpen()) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#btnRedo') : $('#btnUndo')).click(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest?.('.v-hit, button, .lbl')) { e.preventDefault(); $('#btnPlay').click(); return; }
    if (e.key === '.') { host.send({ type: 'run', running: true }); setTimeout(() => host.send({ type: 'run', running: false }), 60); return; }
    if (e.key === '[' || e.key === ']') {
      const i = SPEEDS.indexOf(store.get().speed);
      setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 2 : i) + (e.key === ']' ? 1 : -1)))]);
      toast(`Speed ${store.get().speed}×`);
      return;
    }
    if (['1', '2', '3', '4'].includes(e.key)) { store.set({ mode: ['explore', 'learn', 'cases', 'compare'][+e.key - 1] }); return; }
    if (e.key.toLowerCase() === 'a' && !e.shiftKey) { store.set({ view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
    if (e.key.toLowerCase() === 'z') { $('#btnSettle').click(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (e.key === 'F' && e.shiftKey) { toggleProjector(); return; }
    const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (t) setTool(t.id);
  });
}

// ── Projector mode (§4.4) ───────────────────────────
let projector = false, bigEl = null;
function toggleProjector() {
  projector = !projector;
  app.classList.toggle('projector', projector);
  if (projector) { bigEl = h('div', { class: 'big-overlay' }); wrap.append(bigEl); toast('Projector mode. Press Shift+F to leave.'); }
  else { bigEl?.remove(); bigEl = null; }
  setTimeout(() => dispatchEvent(new Event('resize')), 50);
}
function updateProjector(f) {
  if (!bigEl) return;
  bigEl.replaceChildren(h('small', {}, 'HVPG'), fmt(f.metrics.hvpg, 1), h('span', { class: 'unit' }, 'mmHg'));
}

// ── Mobile (§4.3) ───────────────────────────────────
function setSheet(s) {
  app.dataset.sheet = s;
  $$('#mobileTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sheet === s)));
  const f = store.get().frame; if (f) dock.update(f);
}
function wireMobile() {
  $$('#mobileTabs button').forEach((b) => b.addEventListener('click', () => setSheet(b.dataset.sheet)));
  $('#btnTools').addEventListener('click', () => app.classList.toggle('rail-open'));
}
function wireDockResize() {
  const handle = $('#dockResize');
  let y0 = 0, h0 = 0;
  handle.addEventListener('pointerdown', (e) => {
    y0 = e.clientY; h0 = $('#dock').getBoundingClientRect().height; handle.setPointerCapture(e.pointerId);
    app.classList.remove('dock-collapsed');
    handle.onpointermove = (ev) => { const nh = Math.max(150, Math.min(innerHeight * 0.62, h0 + (y0 - ev.clientY))); app.style.setProperty('--dock-h', nh + 'px'); };
  });
  handle.addEventListener('pointerup', () => { handle.onpointermove = null; const f = store.get().frame; if (f) dock.update(f); });
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
    ...TOOLS.map((t) => [t.key, t.label]), ['Ctrl/⌘ Z', 'Undo (Shift to redo)'], ['Esc', 'Clear selection · close'], ['Shift F', 'Projector mode'], ['?', 'This guide'],
    ['Tab · ← →', 'Walk vessels along the flow'], ['+ −', 'Stenosis on the focused vessel'],
  ];
  openModal('Guide', h('div', {},
    h('p', {}, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model. Nothing is scripted: change a resistance and watch the consequences propagate.'),
    h('div', { class: 'entry-grid' },
      [['explore', 'Manipulate the anatomy', 'Pinch vessels, paint clots or fibrosis, drag a TIPS, band varices, wedge a hepatic-vein catheter.'],
        ['settle', 'Two clocks', 'Seconds for hemodynamics. Months for remodeling: collaterals, varices, spleen and ascites.'],
        ['bulb', 'Ask “Why?”', 'Click any readout for a causal breakdown of what is driving it, change by change.']].map(([ic, t, d]) => h('div', { class: 'entry', style: { cursor: 'default' } }, h('span', { class: 'eic' }, icon(ic)), h('span', { class: 't' }, t), h('span', { class: 'd' }, d)))),
    h('h3', {}, 'Keyboard'),
    h('div', { class: 'keys' }, rows.map(([k, v]) => h('div', {}, h('span', {}, v), h('kbd', {}, k)))),
    h('h3', {}, 'Reading the picture'),
    h('ul', {},
      h('li', {}, 'Veins are colored by pressure on a perceptually uniform scale with clinical ticks at 5, 10, 12 and 20 mmHg. Arteries are drawn thinner in a fixed red.'),
      h('li', {}, 'Line width follows vessel diameter (compressed, so the cavae don’t drown the portal tree). Watch collaterals and varices swell.'),
      h('li', {}, 'An orange dashed halo and ⟲ badge mark reversed flow. Dotted vessels are closed potential collaterals.')),
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
      entry('explore', 'Explore freely', 'Pick a patient scenario and start pinching, clotting and stenting.', () => { const b = $('#scenarioBtn'); setTimeout(() => openScenarios(b), 50); }),
      entry('book', 'Take a lesson', '11 short lessons: predict, observe, explain.', () => store.set({ mode: 'learn' })),
      entry('case', 'Manage a case', 'A variceal bleed at 3 a.m., and three diagnostic puzzles.', () => store.set({ mode: 'cases' }))),
    h('p', { class: 'disclaimer', style: { margin: 0 } }, 'Educational simulation. Simplified model with illustrative values; not for diagnosis or treatment decisions.')), { bare: true });
}

main().catch((err) => { console.error(err); document.body.append(h('pre', { style: { position: 'fixed', bottom: 0, left: 0, background: '#fff', color: '#900', padding: '8px', zIndex: 999 } }, String(err.stack || err))); });
