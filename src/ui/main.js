// Application bootstrap: wires store, engine host, stage, inspector, dock and modes.

import { startHost, host } from './host.js';
import { store, updateParams, replaceParams, bindParamSender, undo, redo, canUndo, canRedo, clearHistory } from './store.js';
import { createStage } from './stage.js';
import { createInspector } from './inspector.js';
import { createDock } from './dock.js';
import { createWhy } from './why.js';
import { createEventsUI } from './events-ui.js';
import { createLearn } from './learn.js';
import { createCases } from './cases.js';
import { PRESSURE_TICKS, gradientCss, pressureColor } from './colormap.js';
import { EDGES, NODES } from '../engine/topology.js';
import { $, $$, h, icon, fmt, toast, tooltipFor, openModal, closeModal, units } from './util.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const app = $('#app');
const wrap = $('#stageWrap');
const isPhone = () => matchMedia('(max-width: 767px)').matches;

const TOOLS = [
  { id: 'select', icon: 'select', key: 'V', label: 'Select / inspect', hint: '<b>Select:</b> tap a vessel to inspect it. Hover to trace its upstream and downstream path. Drag the background to pan, scroll to zoom.' },
  { id: 'probe', icon: 'probe', key: 'M', label: 'Measure', hint: '<b>Measure:</b> hover any vessel for live pressure, flow, velocity and diameter.' },
  { id: 'pinch', icon: 'pinch', key: 'P', label: 'Pinch (stenosis)', hint: '<b>Pinch:</b> press on a vessel and drag sideways to narrow it. Resistance rises with (1 − s)⁻⁴.' },
  { id: 'thrombus', icon: 'clot', key: 'T', label: 'Thrombus brush', hint: '<b>Thrombus:</b> press and hold on a vein to grow a clot. Shift-hold to dissolve.' },
  { id: 'fibrosis', icon: 'fibrosis', key: 'F', label: 'Fibrosis brush', hint: '<b>Fibrosis:</b> press and hold on a liver lobe. Shift-hold to reverse. Zone:', zones: true },
  { id: 'stent', icon: 'stent', key: 'S', label: 'Stent / shunt', hint: '<b>Stent:</b> drag from a portal vessel to a systemic vein: right portal → hepatic vein makes a TIPS; splenic → left renal a Warren shunt; portal → IVC a portocaval shunt.' },
  { id: 'band', icon: 'band', key: 'B', label: 'Band ligation (EVL)', hint: '<b>Band:</b> tap the esophageal varices (lower esophagus).' },
  { id: 'occlude', icon: 'occlude', key: 'O', label: 'Occlude collateral (BRTO / plug)', hint: '<b>Occlude:</b> tap a collateral vessel to plug it (e.g. the gastrorenal shunt = BRTO).' },
  { id: 'balloon', icon: 'balloon', key: 'L', label: 'Balloon tamponade', hint: '<b>Balloon:</b> tap the lower esophagus or the gastric fundus.' },
  { id: 'catheter', icon: 'catheter', key: 'C', label: 'Hepatic vein catheter', hint: '<b>Catheter:</b> tap a hepatic vein to place the catheter (FHVP). Tap it again to inflate the balloon and wedge (WHVP).' },
  { id: 'doppler', icon: 'doppler', key: 'D', label: 'Doppler probe', hint: '<b>Doppler:</b> tap a vessel to insonate it.' },
  { id: 'endoscope', icon: 'endoscope', key: 'E', label: 'Endoscope', hint: '<b>Endoscope:</b> tap the esophagus or stomach.' },
  { id: 'needle', icon: 'needle', key: 'N', label: 'Paracentesis needle', hint: '<b>Paracentesis:</b> tap the abdomen, then choose the volume.' },
];

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
  buildPresetSelect(presets);

  why = createWhy($('#whyPop'));
  stage = createStage({
    wrap,
    onSelect: (sel, opts) => { store.set({ selection: sel }); if (sel && !opts?.quiet) openInspector(); },
    onAction: doAction,
    onOpenTab: (id) => dock.show(id),
    onHoverInfo: hoverInfo,
  });
  inspector = createInspector($('#inspector'), { onWhy: (m, el) => why.open(m, el), onAction: doAction, onOpenTab: (id) => dock.show(id), onClose: closeInspector });
  dock = createDock({ strip: $('#strip'), tabs: $('#dockTabs'), body: $('#dockBody'), onWhy: (m, el) => why.open(m, el), onAction: doAction, onProbe: (id) => host.send({ type: 'probe', id }) });
  eventsUI = createEventsUI({ overlay: $('#overlay'), vignette: $('#vignette'), stage, onWhy: (m, el) => why.open(m, el) });
  const api = { loadPreset, setTool, setAllowedTools, action: doAction, showPane: (id) => dock.show(id), setProbe: (id) => host.send({ type: 'probe', id }) };
  learn = createLearn({ cardHost: $('#hudTL'), mobileHost: $('#lessonDock'), dock, onWhy: (m, el) => why.open(m, el), ...api });
  cases = createCases({ root: $('#inspector'), api });

  buildRail();
  buildHud();
  wireTopbar();
  wireKeyboard();
  wireMobile();
  wireDockResize();

  host.on('frame', onFrame);
  host.on('error', (m) => { console.error(m.message); toast('Engine error: see console', 'bad'); });

  store.on('view', (v) => { stage.setView(v); $$('#viewSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))); });
  store.on('tool', (t) => { $$('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t))); wrap.className = 'stage-wrap tool-' + t; renderToolHint(); });
  store.on('mode', onMode);
  store.on('historyTick', () => { $('#btnUndo').disabled = !canUndo(); $('#btnRedo').disabled = !canRedo(); });
  store.on('layers', () => { app.classList.toggle('chips-off', !store.get().layers.chips); });

  if (isPhone()) store.set({ view: 'circuit' });
  const shared = readShare();
  if (shared) await loadShared(shared);
  firstRun();
}

// ── Frames ──────────────────────────────────────────
let lastClockTxt = '';
function onFrame(f) {
  if (f.params) replaceParams(f.params);
  store.set({ frame: f, running: f.running, clock: f.clock });
  stage.update(f);
  dock.update(f);
  inspector.update(f);
  if (f.events?.length) eventsUI.handle(f.events);
  eventsUI.position();
  const txt = f.clock === 'disease' || f.day > 0 ? `day ${f.day} · ${fmt(f.t, 0)} s` : `t ${fmt(f.t, 1)} s`;
  if (txt !== lastClockTxt) { $('#clockReadout').textContent = txt; lastClockTxt = txt; }
  $('#btnPlay').innerHTML = ''; $('#btnPlay').append(icon(f.running ? 'pause' : 'play'));
  $('#btnPlay').setAttribute('aria-label', f.running ? 'Pause' : 'Play');
  $$('#clockSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clock === f.clock)));
  updateBleedBanner(f);
  if (projector) updateProjector(f);
}

// ── Presets & share ─────────────────────────────────
function buildPresetSelect(presets) {
  const sel = $('#presetSelect');
  const groups = {};
  for (const p of presets) (groups[p.group] ||= []).push(p);
  sel.replaceChildren(...Object.entries(groups).map(([g, ps]) => h('optgroup', { label: g }, ps.map((p) => h('option', { value: p.id, title: p.summary }, p.label)))));
  sel.addEventListener('change', async () => {
    await loadPreset(sel.value);
    const p = presets.find((x) => x.id === sel.value);
    toast(p.summary + (p.days ? ` (${p.days} simulated days applied)` : ''));
  });
  store.set({ presetList: presets });
}

async function loadPreset(id, opts = {}) {
  const res = await host.request('preset', { id, days: opts.days });
  replaceParams(res.params);
  clearHistory();
  store.set({ presetId: id, lastHVPG: null, selection: store.get().mode === 'cases' ? null : store.get().selection, compareSnap: store.get().compareSnap, historyTick: (store.get().historyTick || 0) + 1 });
  $('#presetSelect').value = id;
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
  toast('Loaded shared scenario.');
}

// ── Actions ─────────────────────────────────────────
function doAction(a) {
  if (a.kind === 'probe') { host.send({ type: 'probe', id: a.id }); return; }
  if (a.kind === 'paracentesisPrompt') { dock.show('abdomen'); toast('Choose the volume in the Abdomen panel, then Drain.'); return; }
  host.send({ type: 'action', action: a });
  const msgs = { infuse: { crystalloid: '1 L crystalloid running (~25 % stays intravascular).', prbc: '1 unit PRBC running.', albumin: 'Albumin given: plasma oncotic pressure up.' },
    hemorrhage: 'Hemorrhage 500 mL.', band: 'Band ligation performed.', valsalva: 'Valsalva: intrathoracic and abdominal pressure up for 10 s.' };
  const m = typeof msgs[a.kind] === 'object' ? msgs[a.kind][a.fluid] : msgs[a.kind];
  if (a.kind === 'paracentesis') toast(`Paracentesis: up to ${(a.mL / 1000).toFixed(1)} L drained${a.albumin ? ' with albumin' : ' WITHOUT albumin'}.`);
  else if (m) toast(m);
}

// ── Tool rail ───────────────────────────────────────
function buildRail() {
  const rail = $('#toolRail');
  TOOLS.forEach((t, i) => {
    if (i === 2 || i === 6 || i === 9) rail.append(h('div', { class: 'rail-sep' }));
    const b = h('button', { class: 'tool', 'data-tool': t.id, 'aria-label': `${t.label} (${t.key})`, 'aria-pressed': String(t.id === 'select') }, icon(t.icon), h('span', { class: 'key' }, t.key));
    b.addEventListener('click', () => setTool(t.id));
    tooltipFor(b, `${t.label}  ·  ${t.key}`);
    rail.append(b);
  });
}
function setTool(id) {
  if (allowedTools && !allowedTools.includes(id)) { toast('That tool is locked in this lesson/case.'); return; }
  store.set({ tool: id });
  if (isPhone()) app.classList.remove('rail-open');
}
function setAllowedTools(list) {
  allowedTools = list;
  $$('.tool').forEach((b) => { b.disabled = !!list && !list.includes(b.dataset.tool); });
  if (list && !list.includes(store.get().tool)) store.set({ tool: 'select' });
}

// ── HUD ─────────────────────────────────────────────
let hintEl, legendEl, bleedEl, tipEl;
function buildHud() {
  hintEl = h('div', { class: 'panel-float tool-hint', role: 'status' });
  $('#hudTL').append(hintEl);
  renderToolHint();
  legendEl = h('div', { class: 'panel-float legend', 'aria-label': 'Pressure legend' });
  const bar = h('div', { class: 'legend-bar', style: { background: gradientCss('to top') } });
  const nudge = { 10: -7, 12: 7 };
  const ticks = h('div', { class: 'legend-ticks' }, PRESSURE_TICKS.filter(([p]) => p > 0).map(([p, lab]) => h('span', { style: { bottom: `calc(${(p / 35) * 100}% + ${nudge[p] || 0}px)` } }, h('b', {}, p), lab)));
  legendEl.append(h('div', {}, h('div', { class: 'legend-title' }, 'Pressure · mmHg'), h('div', { style: { display: 'flex', gap: '8px' } }, bar, ticks)));
  $('#hudTR').append(legendEl);
  store.on('colorMode', (m) => {
    const t = { pressure: 'Pressure · mmHg', drop: 'Pressure drop ΔP', direction: 'Flow direction', delta: 'Change vs healthy' }[m];
    legendEl.querySelector('.legend-title').textContent = t;
    bar.style.background = m === 'direction' ? 'linear-gradient(to top, var(--flow-normal) 50%, var(--flow-reversed) 50%)' : m === 'delta' ? 'linear-gradient(to top, #2D6CDF, #9696A0, #D22846)' : gradientCss('to top');
    ticks.style.display = m === 'pressure' ? '' : 'none';
  });
  bleedEl = h('div', { class: 'panel-float bleed-banner', style: { display: 'none' }, role: 'alert' });
  $('#hudBL').append(bleedEl);
  tipEl = h('div', { class: 'panel-float hover-tip', style: { display: 'none' } });
  wrap.append(tipEl);
  $('#zoomIn').onclick = () => stage.zoomIn();
  $('#zoomOut').onclick = () => stage.zoomOut();
  $('#zoomFit').onclick = () => stage.fit();
}
let hintTimer = null;
function renderToolHint() {
  const t = TOOLS.find((x) => x.id === store.get().tool);
  hintEl.innerHTML = t.hint;
  hintEl.classList.remove('faded');
  clearTimeout(hintTimer);
  if (!t.zones) hintTimer = setTimeout(() => hintEl.classList.add('faded'), t.id === 'select' ? 7000 : 12000);
  if (t.zones) {
    const seg = h('span', { class: 'seg', style: { marginLeft: '6px' } }, [['pre', 'Portal'], ['sin', 'Sinusoidal'], ['post', 'Central']].map(([z, l]) => {
      const b = h('button', { 'aria-pressed': String(store.get().fibrosisZone === z) }, l);
      b.addEventListener('click', () => { store.set({ fibrosisZone: z }); renderToolHint(); });
      return b;
    }));
    hintEl.append(seg);
  }
}
function updateBleedBanner(f) {
  const b = f.metrics.bleeding;
  if (!b) { bleedEl.style.display = 'none'; return; }
  bleedEl.style.display = '';
  bleedEl.replaceChildren('● Active variceal bleeding', h('span', { class: 'num' }, `${Math.round(b.rate)} mL/min`), h('span', { class: 'num' }, `lost ${Math.round(f.metrics.blood.lost)} mL`), h('span', { class: 'num' }, `MAP ${Math.round(f.metrics.map)}`));
}
function hoverInfo(info) {
  const f = store.get().frame;
  const tool = store.get().tool;
  if (!info || !f || !['probe', 'select'].includes(tool)) { tipEl.style.display = 'none'; return; }
  if (tool === 'select' && isPhone()) return;
  const e = EDGES[EI[info.id]], k = EI[info.id];
  const D = Math.max(0.5, f.D[k]) / 10;
  const v = f.Q[k] / (Math.PI * D * D / 4);
  const r = (a, b) => h('div', { class: 'r' }, a, h('b', {}, b));
  tipEl.replaceChildren(h('div', { class: 't' }, e.label),
    r('Pressure', `${fmt(f.P[NI[e.from]], 1)} → ${fmt(f.P[NI[e.to]], 1)}`), r('ΔP', `${fmt(f.P[NI[e.from]] - f.P[NI[e.to]], 1)} mmHg`),
    r('Flow', `${fmt(f.Q[k] * 0.06, 2)} L/min`), tool === 'probe' ? [r('Velocity', `${fmt(v, 1)} cm/s`), r('Diameter', `${fmt(f.D[k], 1)} mm`)] : null);
  tipEl.style.display = '';
  const W = wrap.clientWidth;
  tipEl.style.left = Math.min(W - 200, info.x + 16) + 'px';
  tipEl.style.top = (info.y + 16) + 'px';
}

// ── Top bar ─────────────────────────────────────────
function wireTopbar() {
  $$('#modeSeg button').forEach((b) => b.addEventListener('click', () => store.set({ mode: b.dataset.mode })));
  $('#btnPlay').addEventListener('click', () => host.send({ type: 'run', running: !store.get().running }));
  $('#speedSelect').addEventListener('change', (e) => { store.set({ speed: +e.target.value }); host.send({ type: 'run', speed: +e.target.value }); });
  $('#btnSettle').addEventListener('click', () => { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); });
  $$('#clockSeg button').forEach((b) => b.addEventListener('click', () => { host.send({ type: 'run', clock: b.dataset.clock, running: true }); if (b.dataset.clock === 'disease') toast('Disease clock: 1 simulated day per second × speed. Collaterals, varices, spleen and ascites remodel.'); }));
  const adv = $('#advMenu');
  $('#btnAdvance').addEventListener('click', (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); adv.style.top = r.bottom + 6 + 'px'; adv.style.left = Math.min(innerWidth - 176, r.left) + 'px'; adv.hidden = !adv.hidden; });
  addEventListener('pointerdown', (e) => { if (!adv.hidden && !adv.contains(e.target) && e.target.closest('#btnAdvance') == null) adv.hidden = true; });
  $$('#advMenu button').forEach((b) => b.addEventListener('click', () => {
    adv.hidden = true;
    const v = b.dataset.ff;
    host.send(v === 'event' ? { type: 'advance', untilEvent: true } : { type: 'advance', days: +v });
    toast(v === 'event' ? 'Advancing until something happens (max 2 years)…' : `Advanced ${v} days.`);
  }));
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => store.set({ view: b.dataset.view })));
  $('#btnUndo').addEventListener('click', () => { const l = undo(); if (l) toast(`Undo: ${l === true ? '' : l}`); });
  $('#btnRedo').addEventListener('click', () => { const l = redo(); if (l) toast(`Redo: ${l === true ? '' : l}`); });
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
  $('#btnInspector').addEventListener('click', () => (app.classList.contains('insp-collapsed') || (!app.classList.contains('insp-open') && matchMedia('(max-width:1279px)').matches) ? openInspector() : closeInspector()));
  $('#btnLayers').addEventListener('click', (e) => toggleLayers(e.currentTarget));
}
function applyTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  try { if (t) localStorage.setItem('pps.theme', t); } catch { /* ignore */ }
  const f = store.get().frame; if (f) { stage?.update(f); dock?.update(f); }
}
function openInspector() { app.classList.remove('insp-collapsed'); app.classList.add('insp-open'); if (isPhone()) setSheet('controls'); }
function closeInspector() { if (matchMedia('(max-width:1279px)').matches) app.classList.remove('insp-open'); else app.classList.add('insp-collapsed'); }

let layersEl = null;
function toggleLayers(anchor) {
  if (layersEl) { layersEl.remove(); layersEl = null; return; }
  const st = store.get();
  const cb = (key, label) => { const c = h('input', { type: 'checkbox', checked: st.layers[key] }); c.addEventListener('change', () => store.set({ layers: { ...store.get().layers, [key]: c.checked } })); return h('label', { class: 'toggle-row', style: { gap: '8px', justifyContent: 'flex-start' } }, c, label); };
  const modes = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [['pressure', 'Absolute pressure'], ['drop', 'Pressure drop (where resistance lives)'], ['direction', 'Flow direction (teal ⇄ orange)'], ['delta', 'Change vs healthy']].map(([v, l]) => {
    const r = h('input', { type: 'radio', name: 'cm', checked: st.colorMode === v }); r.addEventListener('change', () => store.set({ colorMode: v }));
    return h('label', { class: 'toggle-row', style: { gap: '8px', justifyContent: 'flex-start' } }, r, l);
  }));
  const pu = h('select', { class: 'select' }, ['mmHg', 'cmH2O', 'kPa'].map((u) => h('option', { value: u, selected: units.pressure === u }, u)));
  pu.addEventListener('change', () => { units.pressure = pu.value; });
  const fu = h('select', { class: 'select' }, ['L/min', 'mL/min'].map((u) => h('option', { value: u, selected: units.flow === u }, u)));
  fu.addEventListener('change', () => { units.flow = fu.value; });
  layersEl = h('div', { class: 'panel-float', style: { position: 'fixed', zIndex: 70, padding: '12px 14px', width: '280px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' } },
    h('b', {}, 'Layers'), cb('particles', 'Flowing blood cells'), cb('chips', 'Pressure values on vessels'), cb('collaterals', 'Potential collaterals (ghosted)'), cb('labels', 'Organ labels'),
    h('b', {}, 'Vessel color'), modes, h('b', {}, 'Units'), h('div', { class: 'btn-row' }, pu, fu),
    h('button', { class: 'btn', onclick: () => toggleProjector() }, 'Projector mode (F)'));
  document.body.append(layersEl);
  const r = anchor.getBoundingClientRect();
  layersEl.style.top = r.bottom + 8 + 'px';
  layersEl.style.left = Math.min(innerWidth - 292, r.left - 120) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (layersEl && !layersEl.contains(e.target) && e.target !== anchor) { layersEl.remove(); layersEl = null; removeEventListener('pointerdown', off); } }), 0);
}

// ── Modes ───────────────────────────────────────────
function onMode(mode) {
  $$('#modeSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  if (mode !== 'cases' && cases?.active()) cases.exit();
  if (mode === 'cases') { cases.mount(); openInspector(); hintEl.style.display = 'none'; }
  else { inspector.render(); hintEl.style.display = ''; }
  if (mode === 'learn') { learn.render(); if (!learn.active()) learn.openList(); }
  if (mode === 'compare') { if (!store.get().compareSnap) toast('Take snapshot A in the Compare panel, then change something.'); }
  if (mode === 'explore') { store.set({ locked: null, hiddenReadouts: null }); setAllowedTools(null); }
  if (isPhone()) setSheet(mode === 'learn' ? 'lesson' : 'controls');
}

// ── Keyboard (§8.5) ─────────────────────────────────
function wireKeyboard() {
  addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#btnRedo') : $('#btnUndo')).click(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest?.('.v-hit, button')) { e.preventDefault(); $('#btnPlay').click(); return; }
    if (e.key === '.') { host.send({ type: 'run', running: true }); setTimeout(() => host.send({ type: 'run', running: false }), 60); return; }
    if (e.key === '[' || e.key === ']') {
      const opts = [0.25, 0.5, 1, 2, 4, 8]; const i = opts.indexOf(store.get().speed);
      const n = opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === ']' ? 1 : -1)))];
      $('#speedSelect').value = String(n); $('#speedSelect').dispatchEvent(new Event('change')); return;
    }
    if (['1', '2', '3', '4'].includes(e.key)) { store.set({ mode: ['explore', 'learn', 'cases', 'compare'][+e.key - 1] }); return; }
    if (e.key.toLowerCase() === 'a' && !e.shiftKey) { store.set({ view: store.get().view === 'circuit' ? 'anatomic' : 'circuit' }); return; }
    if (e.key.toLowerCase() === 'z') { $('#btnSettle').click(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (e.key === 'Escape') { store.set({ selection: null }); closeModal(); return; }
    if (e.key === 'F' && e.shiftKey) { toggleProjector(); return; }
    const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (t) { if (t.id === 'fibrosis' && e.key === 'F') return; setTool(t.id); }
  });
}

// ── Projector mode (§4.4) ───────────────────────────
let projector = false, bigEl = null;
function toggleProjector() {
  projector = !projector;
  app.classList.toggle('projector', projector);
  if (projector) { bigEl = h('div', { class: 'big-overlay', style: { left: '32px', bottom: '32px' } }); wrap.append(bigEl); toast('Projector mode: Shift+F or Esc-less toggle via Layers to exit.'); }
  else { bigEl?.remove(); bigEl = null; }
}
function updateProjector(f) {
  if (!bigEl) return;
  bigEl.replaceChildren(h('small', {}, 'HVPG'), `${fmt(f.metrics.hvpg, 1)} mmHg`);
}

// ── Mobile (§4.3) ───────────────────────────────────
function setSheet(s) {
  if (s === 'tools') { app.classList.toggle('rail-open'); return; }
  app.dataset.sheet = s;
  $$('#mobileTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sheet === s)));
  const f = store.get().frame; if (f) dock.update(f);
}
function wireMobile() {
  $$('#mobileTabs button').forEach((b) => b.addEventListener('click', () => setSheet(b.dataset.sheet)));
}
function wireDockResize() {
  const handle = $('#dockResize');
  let y0 = 0, h0 = 0;
  handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; h0 = $('#dock').getBoundingClientRect().height; handle.setPointerCapture(e.pointerId); handle.onpointermove = (ev) => { const nh = Math.max(110, Math.min(innerHeight * 0.7, h0 + (y0 - ev.clientY))); app.style.setProperty('--dock-h', nh + 'px'); }; });
  handle.addEventListener('pointerup', () => { handle.onpointermove = null; const f = store.get().frame; if (f) dock.update(f); });
}

// ── Help & first run ────────────────────────────────
function openHelp() {
  const rows = [
    ['Space', 'Play / pause'], ['[  ]', 'Slower / faster'], ['.', 'Step'], ['Z', 'Settle to equilibrium'], ['A', 'Anatomy ⇄ circuit view'], ['1–4', 'Explore · Learn · Cases · Compare'],
    ...TOOLS.map((t) => [t.key, t.label]), ['Ctrl/⌘ Z · Shift', 'Undo · redo'], ['Esc', 'Clear selection'], ['?', 'This help'],
    ['Tab / ← →', 'Move focus through vessels along the flow'], ['+ / −', 'Stenosis on the focused vessel'],
  ];
  openModal('Portal Pressure Simulator', h('div', {},
    h('p', {}, 'A living model of the portal circulation. Every pressure, flow, collateral and varix comes out of one lumped-parameter hemodynamic model: nothing is scripted.'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Manipulate the anatomy'), ': pinch vessels, paint clots or fibrosis, drag a TIPS, band varices, wedge a hepatic-vein catheter.'),
      h('li', {}, h('b', {}, 'Two clocks'), ': Seconds for hemodynamics, Months for remodeling (collaterals, varices, spleen, ascites).'),
      h('li', {}, h('b', {}, 'Why?'), ': click any readout tile for a causal breakdown of what is driving it.'),
      h('li', {}, h('b', {}, 'Learn & Cases'), ': guided lessons and clinical scenarios with debriefs.')),
    h('h3', {}, 'Keyboard'),
    h('div', { class: 'kv', style: { gridTemplateColumns: 'auto 1fr', maxWidth: '520px' } }, rows.map(([k, v]) => [h('dt', { class: 'num' }, k), h('dd', { style: { textAlign: 'left', fontFamily: 'inherit', fontWeight: 400 } }, v)])),
    h('h3', {}, 'References for thresholds'),
    h('p', { class: 'ctl-sub' }, 'Baveno VII consensus on portal hypertension (2022); AASLD practice guidance on risk stratification and management of portal hypertension and varices in cirrhosis (2024). Physiology after Guyton; Lautt (hepatic arterial buffer response); Bosch & Groszmann (HVPG).'),
    h('p', { class: 'disclaimer' }, 'Educational simulation. Simplified model; values are illustrative and must not be used for diagnosis or treatment decisions.')), { wide: true });
}
function firstRun() {
  let seen = false;
  try { seen = localStorage.getItem('pps.seen') === '1'; } catch { /* ignore */ }
  if (seen) return;
  openModal('Welcome', h('div', {},
    h('p', {}, 'This is an ', h('b', {}, 'educational simulation'), ' of portal hemodynamics. It is simplified, its values are illustrative, and it must not be used for diagnosis or treatment decisions.'),
    h('p', {}, 'Start by choosing a scenario in the top bar (e.g. ', h('i', {}, 'Decompensated cirrhosis'), '), switch to ', h('b', {}, 'Learn'), ' for guided lessons, or grab a tool on the left and start pinching vessels.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => { try { localStorage.setItem('pps.seen', '1'); } catch { /* ignore */ } closeModal(); } }, 'Start exploring'),
      h('button', { class: 'btn', onclick: () => { try { localStorage.setItem('pps.seen', '1'); } catch { /* ignore */ } closeModal(); store.set({ mode: 'learn' }); } }, 'Take a lesson'))));
}

main().catch((err) => { console.error(err); document.body.append(h('pre', { style: { position: 'fixed', bottom: 0, left: 0, background: '#fff', color: '#900', padding: '8px', zIndex: 999 } }, String(err.stack || err))); });
