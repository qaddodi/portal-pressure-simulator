// Controls panel (blueprint §4.1, §8.4): the patient chart and the advanced physiology. (A vessel's or an organ's details are in its own card since 17 Nov 2026: card-details.js.)

import { EDGES } from '../engine/portal/topology.js';
import { DRUGS, PREGNANCY_INFO } from '../engine/portal/scenario.js';
import { store, updateParams } from './store.js';
import { h, tooltipFor, infoButton, icon, paintRange, releaseWords, fadeShown } from './util.js';
import { frameFor, cancelFrame } from './frame.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
import { procLabel } from './procedure-names.js';
import { UNSET, newCell, cachedText, readings as liveReadings } from './live-readings.js';
const nextFrame = frameFor('inspector');

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

export const readings = liveReadings;   // (for tests/inspector-live-text.test.js)
const strMake = (k) => String(k);   // alloc-rare: built once per value
const fnMake = (k, v, fn) => fn(k);   // alloc-rare: the words of a value, built once per value a slider shows
const SPLENIC_RX = ['none', 'partial embolization', 'splenectomy'];

const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `×${v.toFixed(v < 10 ? 2 : 0)}`;
const tone = (v) => (Math.abs(v - 1) < 0.01 ? 'normal' : v < 1 ? `×${v.toFixed(2)} · dilated` : `×${v.toFixed(2)} · constricted`);
const occl = (id) => ({ get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; } });
const sten = (id) => ({ get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; } });
const fibAll = (z) => ({ get: (p) => Math.sqrt(p.fibrosis.R[z] * p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; } });
const prop = (k) => ({ get: (p) => p[k], set: (p, v) => { p[k] = v; } });

// Every global control, addressable by id.
export const CONTROLS = {
  cirrhosis: { type: 'slider', key: 'cirrhosis', label: 'Cirrhosis severity', min: 0, max: 1, step: 0.01, ...prop('cirrhosis'), format: pct, def: 0,
    info: 'Macro control: sinusoidal fibrosis and capillarization, higher liver stiffness, a smaller hepatic arterial buffer reserve and arterioportal shunting. Run the Months clock to watch collaterals and varices develop.',
    sub: '40% compensated · 60% CSPH · 85% decompensated' },
  fibPre: { type: 'slider', key: 'fibrosis', label: 'Presinusoidal', min: 1, max: 80, step: 0.5, ...fibAll('pre'), format: mult, def: 1, info: 'Resistance in the portal tracts and venules (e.g. schistosomiasis). Raises portal pressure without raising the WHVP.' },
  fibSin: { type: 'slider', key: 'fibrosis', label: 'Sinusoidal', min: 1, max: 40, step: 0.5, ...fibAll('sin'), format: mult, def: 1, info: 'Extra sinusoidal resistance on top of the cirrhosis macro.' },
  fibPost: { type: 'slider', key: 'fibrosis', label: 'Postsinusoidal', min: 1, max: 40, step: 0.5, ...fibAll('post'), format: mult, def: 1, info: 'Central vein / terminal hepatic venule (e.g. sinusoidal obstruction syndrome).' },
  pvt: { type: 'slider', key: 'thrombus', label: 'Portal vein', min: 0, max: 1, step: 0.01, ...occl('PV_TRUNK'), format: pct, def: 0 },
  svt: { type: 'slider', key: 'thrombus', label: 'Splenic vein', min: 0, max: 1, step: 0.01, ...occl('SV_CONF'), format: pct, def: 0 },
  smvt: { type: 'slider', key: 'thrombus', label: 'Superior mesenteric vein', min: 0, max: 1, step: 0.01, ...occl('SMV_CONF'), format: pct, def: 0 },
  rhv: { type: 'slider', key: 'thrombus', label: 'Right hepatic vein', min: 0, max: 1, step: 0.01, ...occl('RHV_IVC'), format: pct, def: 0 },
  mhv: { type: 'slider', key: 'thrombus', label: 'Middle hepatic vein', min: 0, max: 1, step: 0.01, ...occl('MHV_IVC'), format: pct, def: 0 },
  lhv: { type: 'slider', key: 'thrombus', label: 'Left hepatic vein', min: 0, max: 1, step: 0.01, ...occl('LHV_IVC'), format: pct, def: 0 },
  ivc: { type: 'slider', key: 'stenosis', label: 'Suprahepatic IVC stenosis', min: 0, max: 0.95, step: 0.01, ...sten('IVCS_RA'), format: pct, def: 0, info: 'IVC web or membrane that narrows the outflow.' },
  anticoag: { type: 'toggle', key: 'anticoag', label: 'Anticoagulation', ...prop('anticoag'), info: 'Thrombi slowly recanalize as time passes.' },
  contractility: { type: 'slider', key: 'contractility', label: 'Right-heart contractility', min: 0.15, max: 1.6, step: 0.01, ...prop('contractility'), format: pct, def: 1, normal: [0.85, 1.2] },
  tr: { type: 'slider', key: 'tr', label: 'Tricuspid regurgitation', min: 0, max: 1, step: 0.01, ...prop('tr'), format: pct, def: 0, info: 'Systolic backflow into the right atrium: large v-waves reach the liver (turn on Pulsatile mode and use the Doppler).' },
  pericardial: { type: 'slider', key: 'pericardial', label: 'Pericardial constraint', min: 0, max: 1, step: 0.01, ...prop('pericardial'), format: pct, def: 0 },
  grShunt: { type: 'toggle', key: 'spontaneous', label: 'Gastrorenal shunt present', get: (p) => p.spontaneous.C5 !== false, set: (p, v) => { p.spontaneous.C5 = v; }, def: false, info: 'Present in most patients with gastric varices (about 80–85%) and required for them: fundal varices drain through it into the left renal vein. It stays small until the portosystemic gradient is high.' },
  srShunt: { type: 'toggle', key: 'spontaneous', label: 'Splenorenal shunt present', get: (p) => p.spontaneous.C6, set: (p, v) => { p.spontaneous.C6 = v; }, info: 'A large spontaneous shunt from the splenic to the left renal vein.' },
  tips: { type: 'toggle', key: 'tips', label: procLabel('tips'), get: (p) => p.tips.on, set: (p, v) => { p.tips.on = v; }, info: 'Transjugular intrahepatic portosystemic shunt, right portal → right hepatic vein. You can also drag one with the Stent tool.' },
  tipsD: { type: 'slider', key: 'tips', label: 'Stent diameter', min: 6, max: 12, step: 0.5, get: (p) => p.tips.d, set: (p, v) => { p.tips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, def: 8, info: 'Resistance ∝ 1/d⁴ (Poiseuille): small changes in diameter matter a lot.', showIf: (p) => p.tips.on },
  dips: { type: 'toggle', key: 'dips', label: procLabel('dips'), get: (p) => p.dips.on, set: (p, v) => { p.dips.on = v; }, info: 'Direct intrahepatic portosystemic shunt, portal vein → intrahepatic IVC through the caudate lobe, below the hepatic veins. For hepatic vein occlusion with an open cava (Budd–Chiari). You can also drag one with the Stent tool.' },
  dipsD: { type: 'slider', key: 'dips', label: 'Stent diameter', min: 6, max: 12, step: 0.5, get: (p) => p.dips.d, set: (p, v) => { p.dips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, def: 8, info: 'The same stent as a TIPS, through a shorter tract: the diameter matters as much.', showIf: (p) => p.dips.on },
  // (The tamponade tube: the gastric balloon is the first step, drawn up against the cardia; the esophageal balloon is the second and goes on a tube
  // whose gastric balloon is up, so it brings the gastric one with it and the gastric one lets it down first.)
  balloonEso: { type: 'toggle', key: 'balloonEso', label: 'Esophageal balloon tamponade (second step)', get: (p) => p.balloonEso, set: (p, v) => { p.balloonEso = v; if (v) p.balloonGas = true; } },
  balloonGas: { type: 'toggle', key: 'balloonGas', label: 'Gastric balloon tamponade (first step)', get: (p) => p.balloonGas, set: (p, v) => { p.balloonGas = v; if (!v) p.balloonEso = false; } },
  brto: { type: 'toggle', key: 'occluded', label: 'BRTO (occlude the gastrorenal shunt)', get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, info: 'Balloon-occluded retrograde transvenous obliteration. Watch what it does to portal pressure.' },
  splenicRx: { type: 'slider', key: 'splenicRx', label: 'Spleen: embolization / splenectomy', min: 0, max: 2, step: 1, get: (p) => p.splenicRx | 0, set: (p, v) => { p.splenicRx = v; }, format: (v) => SPLENIC_RX[v], def: 0, info: 'Cuts splenic artery inflow: partial embolization removes part of the splenic arterial supply, splenectomy removes all of it. Lower splenic inflow lowers portal pressure and variceal inflow.' },
  portocaval: { type: 'toggle', key: 'portocaval', label: 'Portocaval shunt', get: (p) => p.portocaval, set: (p, v) => { p.portocaval = v; if (!v) p.portocavalSide = false; }, info: 'End-to-side: total diversion; the liver loses all portal perfusion. Side-to-side (the shunt\u2019s own card) keeps the portal trunk, which then carries hepatofugal flow out of the liver.' },
  dsrs: { type: 'toggle', key: 'dsrs', label: procLabel('dsrs'), ...prop('dsrs'), info: 'Selective: the coronary vein is ligated and the gastroesophageal varices decompress through the short gastric veins and the splenic vein to the left renal vein, while SMV blood still perfuses the liver.' },
  mesocaval: { type: 'toggle', key: 'mesocaval', label: 'Mesocaval shunt', ...prop('mesocaval') },
  rex: { type: 'toggle', key: 'rex', label: 'Meso-Rex bypass', ...prop('rex'), info: 'A vein graft from the superior mesenteric vein to the left portal vein, past a thrombosed main portal vein, restoring splanchnic inflow to the liver.' },
  gestation: { type: 'slider', key: 'gestation', label: 'Pregnancy', min: 0, max: 40, step: 1, ...prop('gestation'), format: (v) => (v > 0 ? `${Math.round(v)} weeks` : 'Not pregnant'), def: 0, info: PREGNANCY_INFO },
  albumin: { type: 'slider', key: 'albumin', label: 'Serum albumin', min: 1.5, max: 5, step: 0.1, ...prop('albumin'), format: (v) => `${v.toFixed(1)} g/dL`, def: 4, normal: [3.5, 5], info: 'Plasma oncotic pressure opposes filtration out of capillaries (Starling).' },
  diuretics: { type: 'toggle', key: 'diuretics', label: 'Diuretics', ...prop('diuretics'), info: 'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites.' },
  splanchnicTone: { type: 'slider', key: 'splanchnicTone', label: 'Splanchnic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, ...prop('splanchnicTone'), format: tone, def: 1, normal: [0.85, 1.15], info: 'Forward-flow theory: splanchnic vasodilation raises portal inflow, and so portal pressure.' },
  systemicTone: { type: 'slider', key: 'systemicTone', label: 'Systemic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, ...prop('systemicTone'), format: tone, def: 1, normal: [0.85, 1.15] },
  habr: { type: 'slider', key: 'habrStrength', label: 'Hepatic arterial buffer', min: 0, max: 2, step: 0.05, ...prop('habrStrength'), format: mult, def: 1, info: 'Adenosine washout: when portal flow falls the hepatic artery dilates to preserve liver perfusion.' },
  apShunt: { type: 'slider', key: 'apShunt', label: 'Arterioportal shunting', min: 0, max: 1, step: 0.01, ...prop('apShunt'), format: pct, def: 0, info: 'Hepatic-artery blood entering portal branches directly. With high sinusoidal resistance it can reverse portal vein flow (hepatofugal).' },
  pulsatile: { type: 'toggle', key: 'pulsatile', label: 'Pulsatile (beat-to-beat)', ...prop('pulsatile'), info: 'Adds the right-atrial waveform (a, x, v, y). Needed for Doppler pulsatility.' },
  respiration: { type: 'toggle', key: 'respiration', label: 'Respiration', ...prop('respiration') },
  respDepth: { type: 'slider', key: 'respDepth', label: 'Breath depth', min: 0, max: 3, step: 0.1, ...prop('respDepth'), format: mult, def: 1 },
  bleeding: { type: 'toggle', key: 'bleeding', label: 'Variceal bleeding', ...prop('bleeding'), info: 'Off: varices grow but never rupture on their own. On: a varix can rupture once its wall stress exceeds the critical value.' },
  detRupture: { type: 'toggle', key: 'deterministicRupture', label: 'Deterministic rupture', ...prop('deterministicRupture'), info: 'Rupture exactly when wall stress exceeds the critical value, instead of a random hazard.' },
};
for (const k of Object.keys(DRUGS)) CONTROLS['drug:' + k] = { type: 'drug', key: 'drugs', drug: k };

const DRUG_SHORT = { propranolol: 'Nonselective beta-blocker', carvedilol: 'Beta-blocker + α1 blockade', terlipressin: 'Vasopressin analogue', octreotide: 'Somatostatin analogue' };

export function createInspector(root, { onWhy, onAction, onOpenTab, onScenarios, onMode, pinned, chart, onBack }) {
  const syncers = [];
  let lastSel;

  const reg = (el) => { if (el?._sync) syncers.push(el); return el; };

  // ── Control builders ──────────────────────────────
  function slider(c) {
    const { label, min, max, step, get, set, format, normal, info, sub, def } = c;
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label, 'data-def': def ?? null });
    const val = h('span', { class: 'ctl-val' });
    const reset = h('button', { class: 'reset-btn', title: 'Reset', 'aria-label': `Reset ${label}` }, icon('reset'));
    const wrap = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, label, info ? infoButton(info) : null, reset), val),
      // (The normal range is the tiles' green band on the track, placed on the thumb's own scale: its centre runs from half the
      // thumb's width, --tw, to the far end less half of it.)
      h('div', { class: 'range-wrap' }, normal ? h('span', { class: 'normal', title: 'Normal range', style: { left: `calc(var(--tw) / 2 + (100% - var(--tw)) * ${(normal[0] - min) / (max - min)})`, width: `calc((100% - var(--tw)) * ${(normal[1] - normal[0]) / (max - min)})` } }) : null, input),
      sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    const sCell = newCell(), tCell = newCell();   // (the thumb's value and the words beside it, made once per value the slider shows)
    const paint = (v) => {
      const vs = cachedText(sCell, v, strMake, v), vt = cachedText(tCell, v, fnMake, v, format);
      propSoon(input, 'value', vs); if (val.textContent !== vt) { val.textContent = vt; attrSoon(input, 'aria-valuetext', vt); }   // (a screen reader says the words beside the thumb, not its raw number: SHELL-13)
      paintRange(input, (v - min) / (max - min));
      wrap.classList.toggle('changed', def != null && Math.abs(v - def) > 1e-9);
    };
    let fresh = true;
    input.addEventListener('pointerdown', () => { fresh = true; });
    input.addEventListener('keydown', () => { fresh = true; });
    // The thumb and its number follow the pointer at once; the model gets the newest value once per frame, in a task of its own
    // straight after that frame (class-soon runSoon): what the change wakes is built between frames, never inside one.
    let pend = null, raf = 0;
    const send = () => { const p = pend; pend = null; if (p) updateParams((pp) => { set(pp, p.v); return pp; }, { history: p.history, label }); };
    const flush = () => { cancelFrame(raf); raf = 0; if (pend) runSoon(send); };
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      paint(v);
      if (!pend) pend = { history: fresh }; pend.v = v;
      fresh = false;
      if (!raf) raf = nextFrame(flush);
    });
    input.addEventListener('change', flush);
    reset.addEventListener('click', () => {
      if (def == null) return;
      paint(def);
      updateParams((pp) => { set(pp, def); return pp; }, { label: `Reset ${label}` });
    });
    paint(get(store.get().params));
    wrap._sync = (pp) => { if (document.activeElement !== input) paint(get(pp)); if (c.showIf) propSoon(wrap, 'hidden', !c.showIf(pp)); };
    if (c.showIf) fadeShown(wrap, !!c.showIf(store.get().params));   // (a row that depends on another fades in and out: nothing pops)
    return wrap;
  }
  function toggle({ label, get, set, info, sub }) {
    const cb = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
    cb.checked = !!get(store.get().params);
    cb.addEventListener('change', () => updateParams((pp) => { set(pp, cb.checked); return pp; }, { label: `${label} ${cb.checked ? 'on' : 'off'}` }));
    const row = h('div', { class: 'ctl' }, h('label', { class: 'toggle-row' }, h('span', { class: 'ctl-label' }, label, info ? infoButton(info) : null), h('span', { class: 'switch' }, cb, h('span'))), sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    row._sync = (pp) => { propSoon(cb, 'checked', !!get(pp)); };
    return row;
  }
  function drugCard(k) {
    const d = DRUGS[k];
    const b = h('button', { class: 'drug', 'aria-pressed': String(!!store.get().params.drugs[k]) },
      h('span', { class: 'dn' }, d.label, h('span', { class: 'dot' }, icon('check'))), h('span', { class: 'dd' }, DRUG_SHORT[k] || ''));
    tooltipFor(b, d.info);
    b.addEventListener('click', () => updateParams((pp) => { pp.drugs[k] = !pp.drugs[k]; return pp; }, { label: d.label }));
    b._sync = (pp) => attrSoon(b, 'aria-pressed', !!pp.drugs[k]);
    return b;
  }
  /** Build any registered control (used by panels). */
  function build(id) {
    const c = CONTROLS[id];
    if (!c) return null;
    const el = c.type === 'slider' ? slider(c) : c.type === 'toggle' ? toggle(c) : drugCard(c.drug);
    return reg(el);
  }
  // A details request that names nothing known falls back to the patient chart, as an empty one does.
  const ctl = (ids) => ids.map((id) => build(id));
  const home = () => chart.render(ctl);

  // ── Render ────────────────────────────────────────
  function render() {
    syncers.length = 0;
    releaseWords(root);   // (the old panel's GPU words let go before it is replaced)
    const sel = store.get().details;
    const els = sel?.type === 'advanced' ? chart.renderAdvanced(ctl) : home();   // (a vessel's or an organ's details are in its own card now: card-details.js)
    const scroller = root.closest('.panel') || root;
    const top = scroller.scrollTop;
    root.replaceChildren(...els.filter(Boolean));   // alloc-rare: the panel is built when a selection opens (a details change, a tap), never per frame
    if (sel === lastSel) scroller.scrollTop = top;
    lastSel = sel;
    if (store.get().frame) update(store.get().frame);
  }

  function update(f) {
    if (!store.get().details) chart?.update(f);
  }

  store.on('details', render);
  document.addEventListener('pps:rerender-panel', render);
  for (const k of ['presetId', 'mode', 'hiddenReadouts', 'showHvpg']) store.on(k, () => { if (!store.get().details) render(); });
  store.on('params', () => { const p = store.get().params; for (const s of syncers) s._sync(p); });
  return {
    render, update,
    /** Detached controls; they keep themselves in sync with params. */
    buildControls(ids) {
      const els = ids.map((id) => { const c = CONTROLS[id]; if (!c) return null; return c.type === 'slider' ? slider(c) : c.type === 'toggle' ? toggle(c) : drugCard(c.drug); }).filter(Boolean);
      const off = store.on('params', () => { const p = store.get().params; for (const e of els) e._sync?.(p); });
      return { els, dispose: off };
    },
  };
}

// ── What differs from a healthy default patient ─────
// Every change is one record that stays, by its key (a vessel's thrombus is always the same record), and carries its words: a
// change whose number moves is worded once per number (its `t` keeps them), so asking again builds nothing. The list handed back
// is one array, emptied and filled afresh by each call: a caller reads it at once and does not hold it across another call.
const ZONES = ['pre', 'sin', 'post'], FIB_LOBE = ['fib:R:', 'fib:L:'], LOBE_OF = ['R', 'L'];
const ZONE_WORD = { pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' };
const edgeName = (id) => EDGES[EI[id]]?.label || id;
const changes = [];
/** A change worded by a number: pre + the number + suf. */
const numbered = (key, pre, suf, remove) => ({ key, label: '', v: UNSET, t: new Map(), pre, suf, remove });   // alloc-rare: made once, the first time that change is shown (or at load), then kept by its key
/** A change worded in full. */
const worded = (key, label, remove) => ({ key, label, remove });   // alloc-rare: made once, the first time that change is shown (or at load), then kept by its key
const numberLabel = (e, v, scale, digits) => {
  const s = `${e.pre}${digits === -2 ? v : digits < 0 ? Math.round(v * scale) : (v * scale).toFixed(digits)}${e.suf}`;   // alloc-rare: each number of a change is worded once (e.t keeps it)
  if (e.t.size > 256) e.t.clear();
  e.t.set(v, s);
  return s;
};
/** Puts the change in the list, worded for its number (as a percent of `scale`, to `digits` places; -1 whole, -2 as it stands). */
function put(e, v, scale, digits) {
  if (!Object.is(e.v, v)) { e.v = v; e.label = e.t.get(v) ?? numberLabel(e, v, scale, digits); }
  changes.push(e);
}
// (Changes of a vessel or a drug: one record each, made the first time it is seen.)
const BY_ID = { 'fib:': new Map(), 'fib:R:': new Map(), 'fib:L:': new Map(), 'sten:': new Map(), 'thr:': new Map(), 'drug:': new Map(), 'cs:': new Map(), 'occ:': new Map() };
const MAKE_BY_ID = {
  'fib:': (z) => numbered('fib:' + z, `${ZONE_WORD[z]} fibrosis ×`, '', (q) => { q.fibrosis.R[z] = 1; q.fibrosis.L[z] = 1; }),   // alloc-rare: made once per zone
  'fib:R:': (z) => numbered(`fib:R:${z}`, `${ZONE_WORD[z]} fibrosis, right lobe ×`, '', (q) => { q.fibrosis.R[z] = 1; }),   // alloc-rare: made once per zone
  'fib:L:': (z) => numbered(`fib:L:${z}`, `${ZONE_WORD[z]} fibrosis, left lobe ×`, '', (q) => { q.fibrosis.L[z] = 1; }),   // alloc-rare: made once per zone
  'sten:': (id) => numbered('sten:' + id, `${edgeName(id)} narrowed `, '%', (q) => { delete q.stenosis[id]; }),   // alloc-rare: made once per vessel
  'thr:': (id) => numbered('thr:' + id, `${edgeName(id)} thrombus `, '%', (q) => { delete q.thrombus[id]; }),   // alloc-rare: made once per vessel
  'drug:': (k) => worded('drug:' + k, DRUGS[k].label, (q) => { q.drugs[k] = false; }),   // alloc-rare: made once per drug
  'cs:': (id) => numbered('cs:' + id, `${edgeName(id)} `, ' mm', (q) => { const c = { ...(q.customShunts || {}) }; delete c[id]; q.customShunts = c; }),   // alloc-rare: made once per vessel
  'occ:': (id) => worded('occ:' + id, id === 'C5' ? 'BRTO (gastrorenal shunt occluded)' : edgeName(id) + ' occluded', (q) => { delete q.occluded[id]; }),   // alloc-rare: made once per vessel
};
const dyn = (prefix, id) => BY_ID[prefix].get(id) ?? madeDyn(prefix, id);
const madeDyn = (prefix, id) => { const e = MAKE_BY_ID[prefix](id); BY_ID[prefix].set(id, e); return e; };
// (The rest are one record each, made when this file loads.)
const C = {
  cirrhosis: numbered('cirrhosis', 'Cirrhosis ', '%', (q) => { q.cirrhosis = 0; }),
  splenectomy: worded('splenicRx', 'Splenectomy', (q) => { q.splenicRx = 0; }),
  embolization: worded('splenicRx', 'Partial splenic embolization', (q) => { q.splenicRx = 0; }),
  tips: numbered('tips', 'TIPS ', ' mm', (q) => { q.tips.on = false; }),
  dips: numbered('dips', 'DIPS ', ' mm', (q) => { q.dips.on = false; }),
  portocaval: worded('portocaval', 'Portocaval shunt', (q) => { q.portocaval = false; q.portocavalSide = false; }),
  portocavalSide: worded('portocaval', 'Portocaval shunt (side-to-side)', (q) => { q.portocaval = false; q.portocavalSide = false; }),
  dsrs: worded('dsrs', 'Distal splenorenal shunt', (q) => { q.dsrs = false; }),
  mesocaval: worded('mesocaval', 'Mesocaval shunt', (q) => { q.mesocaval = false; }),
  rex: worded('rex', 'Meso-Rex bypass', (q) => { q.rex = false; }),
  balloonGas: worded('balloonGas', 'Gastric balloon', (q) => { q.balloonGas = false; q.balloonEso = false; }),   // (the esophageal balloon goes on a tube whose gastric balloon is up: it comes off with it)
  balloonEso: worded('balloonEso', 'Esophageal balloon', (q) => { q.balloonEso = false; }),
  splTone: numbered('splTone', 'Splanchnic tone ×', '', (q) => { q.splanchnicTone = 1; }),
  meal: worded('meal', 'After a meal', (q) => { q.meal = 0; }),
  sysTone: numbered('sysTone', 'Systemic tone ×', '', (q) => { q.systemicTone = 1; }),
  contractility: numbered('contractility', 'RV contractility ', '%', (q) => { q.contractility = 1; }),
  tr: numbered('tr', 'Tricuspid regurgitation ', '%', (q) => { q.tr = 0; }),
  pericardial: numbered('pericardial', 'Pericardial constraint ', '%', (q) => { q.pericardial = 0; }),
  apShunt: numbered('apShunt', 'Arterioportal shunting ', '%', (q) => { q.apShunt = 0; }),
  habr: numbered('habr', 'Arterial buffer ×', '', (q) => { q.habrStrength = 1; }),
  gestation: numbered('gestation', 'Pregnancy ', ' weeks', (q) => { q.gestation = 0; }),
  albumin: numbered('albumin', 'Albumin ', ' g/dL', (q) => { q.albumin = 4; }),
  diuretics: worded('diuretics', 'Diuretics', (q) => { q.diuretics = false; }),
  anticoag: worded('anticoag', 'Anticoagulation', (q) => { q.anticoag = false; }),
  C5: worded('C5', 'No gastrorenal shunt (no fundal varices)', (q) => { q.spontaneous.C5 = true; }),
  C6: worded('C6', 'Splenorenal shunt', (q) => { q.spontaneous.C6 = false; }),
};

export function activeInterventions(p) {
  changes.length = 0;
  if (p.cirrhosis > 0) put(C.cirrhosis, p.cirrhosis, 100, -1);
  for (let i = 0; i < 3; i++) {
    const z = ZONES[i], r = p.fibrosis.R[z], l = p.fibrosis.L[z];
    if (r !== 1 && Math.abs(r - l) < 1e-9) put(dyn('fib:', z), r, 1, r < 10 ? 1 : 0);
    else for (let j = 0; j < 2; j++) { const x = p.fibrosis[LOBE_OF[j]][z]; if (x !== 1) put(dyn(FIB_LOBE[j], z), x, 1, 1); }
  }
  for (const id in p.stenosis) put(dyn('sten:', id), p.stenosis[id], 100, -1);
  for (const id in p.thrombus) put(dyn('thr:', id), p.thrombus[id], 100, -1);
  for (const k in p.drugs) if (p.drugs[k]) changes.push(dyn('drug:', k));
  if (p.splenicRx) changes.push(p.splenicRx === 2 ? C.splenectomy : C.embolization);
  if (p.tips.on) put(C.tips, p.tips.d, 1, -2);
  if (p.dips.on) put(C.dips, p.dips.d, 1, -2);
  if (p.portocaval) changes.push(p.portocavalSide ? C.portocavalSide : C.portocaval);
  if (p.dsrs) changes.push(C.dsrs);
  if (p.mesocaval) changes.push(C.mesocaval);
  if (p.rex) changes.push(C.rex);
  const cs = p.customShunts;
  if (cs) for (const id in cs) put(dyn('cs:', id), cs[id], 1, -2);
  if (p.balloonGas) changes.push(C.balloonGas);
  if (p.balloonEso) changes.push(C.balloonEso);
  for (const id in p.occluded) changes.push(dyn('occ:', id));
  if (p.splanchnicTone !== 1) put(C.splTone, p.splanchnicTone, 1, 2);
  if (p.meal > 0) changes.push(C.meal);
  if (p.systemicTone !== 1) put(C.sysTone, p.systemicTone, 1, 2);
  if (p.contractility !== 1) put(C.contractility, p.contractility, 100, -1);
  if (p.tr > 0) put(C.tr, p.tr, 100, -1);
  if (p.pericardial > 0) put(C.pericardial, p.pericardial, 100, -1);
  if (p.apShunt > 0) put(C.apShunt, p.apShunt, 100, -1);
  if (p.habrStrength !== 1) put(C.habr, p.habrStrength, 1, 2);
  if (p.gestation > 0) put(C.gestation, p.gestation, 1, -1);
  if (p.albumin !== 4) put(C.albumin, p.albumin, 1, 1);
  if (p.diuretics) changes.push(C.diuretics);
  if (p.anticoag) changes.push(C.anticoag);
  if (p.spontaneous.C5 === false) changes.push(C.C5);
  if (p.spontaneous.C6) changes.push(C.C6);
  return changes;
}
