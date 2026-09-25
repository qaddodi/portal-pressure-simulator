// Controls panel (blueprint §4.1, §8.4): global parameters in three tabs, or the selected vessel.

import { EDGES, NODES, COLLATERAL_DMIN_RATIO, dMinOf } from '../engine/topology.js?v=44e0aca402';
import { DRUGS } from '../engine/scenario.js?v=3bed5bf285';
import { store, updateParams, isLocked } from './store.js?v=609dde7847';
import { h, fmt, fp, ff, clamp, tooltipFor, icon, svgIcon } from './util.js?v=61d6f9c200';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

const pct = (v) => `${Math.round(v * 100)} %`;
const mult = (v) => `×${v.toFixed(v < 10 ? 2 : 0)}`;
const tone = (v) => (Math.abs(v - 1) < 0.01 ? 'normal' : v < 1 ? `×${v.toFixed(2)} · dilated` : `×${v.toFixed(2)} · constricted`);
const occl = (id) => ({ get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; } });
const sten = (id) => ({ get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; } });
const fibAll = (z) => ({ get: (p) => Math.sqrt(p.fibrosis.R[z] * p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; } });
const prop = (k) => ({ get: (p) => p[k], set: (p, v) => { p[k] = v; } });

// Every global control, addressable by id so lessons can embed the one they ask for.
export const CONTROLS = {
  cirrhosis: { type: 'slider', key: 'cirrhosis', label: 'Cirrhosis severity', min: 0, max: 1, step: 0.01, ...prop('cirrhosis'), format: pct, def: 0,
    info: 'Macro control: sinusoidal fibrosis and capillarization, a stiffer liver, less buffer reserve and arterioportal shunting. Run the Months clock to watch collaterals and varices develop.',
    sub: '40 % compensated · 60 % CSPH · 85 % decompensated' },
  fibPre: { type: 'slider', key: 'fibrosis', label: 'Presinusoidal', min: 1, max: 80, step: 0.5, ...fibAll('pre'), format: mult, def: 1, info: 'Portal tract / portal venule block (e.g. schistosomiasis). Raises portal pressure without raising the wedged pressure.' },
  fibSin: { type: 'slider', key: 'fibrosis', label: 'Sinusoidal', min: 1, max: 40, step: 0.5, ...fibAll('sin'), format: mult, def: 1, info: 'Extra sinusoidal resistance on top of the cirrhosis macro.' },
  fibPost: { type: 'slider', key: 'fibrosis', label: 'Postsinusoidal', min: 1, max: 40, step: 0.5, ...fibAll('post'), format: mult, def: 1, info: 'Central vein / terminal hepatic venule (e.g. sinusoidal obstruction syndrome).' },
  pvt: { type: 'slider', key: 'thrombus', label: 'Portal vein', min: 0, max: 1, step: 0.01, ...occl('PV_TRUNK'), format: pct, def: 0 },
  svt: { type: 'slider', key: 'thrombus', label: 'Splenic vein', min: 0, max: 1, step: 0.01, ...occl('SV_CONF'), format: pct, def: 0 },
  smvt: { type: 'slider', key: 'thrombus', label: 'Superior mesenteric vein', min: 0, max: 1, step: 0.01, ...occl('SMV_CONF'), format: pct, def: 0 },
  rhv: { type: 'slider', key: 'thrombus', label: 'Right hepatic vein', min: 0, max: 1, step: 0.01, ...occl('RHV_IVC'), format: pct, def: 0 },
  mhv: { type: 'slider', key: 'thrombus', label: 'Middle hepatic vein', min: 0, max: 1, step: 0.01, ...occl('MHV_IVC'), format: pct, def: 0 },
  lhv: { type: 'slider', key: 'thrombus', label: 'Left hepatic vein', min: 0, max: 1, step: 0.01, ...occl('LHV_IVC'), format: pct, def: 0 },
  ivc: { type: 'slider', key: 'stenosis', label: 'Suprahepatic IVC stenosis', min: 0, max: 0.95, step: 0.01, ...sten('IVCS_RA'), format: pct, def: 0, info: 'IVC web or membranous obstruction.' },
  anticoag: { type: 'toggle', key: 'anticoag', label: 'Anticoagulation', ...prop('anticoag'), info: 'Thrombi slowly recanalize on the Months clock.' },
  contractility: { type: 'slider', key: 'contractility', label: 'Right-heart contractility', min: 0.15, max: 1.6, step: 0.01, ...prop('contractility'), format: pct, def: 1, normal: [0.85, 1.2] },
  tr: { type: 'slider', key: 'tr', label: 'Tricuspid regurgitation', min: 0, max: 1, step: 0.01, ...prop('tr'), format: pct, def: 0, info: 'Systolic backflow into the right atrium: large v-waves reach the liver (turn on Pulsatile mode and use the Doppler).' },
  pericardial: { type: 'slider', key: 'pericardial', label: 'Pericardial constraint', min: 0, max: 1, step: 0.01, ...prop('pericardial'), format: pct, def: 0 },
  grShunt: { type: 'toggle', key: 'spontaneous', label: 'Gastrorenal shunt present', get: (p) => p.spontaneous.C5, set: (p, v) => { p.spontaneous.C5 = v; }, info: 'Present in a subset of patients: drains fundal varices into the left renal vein.' },
  srShunt: { type: 'toggle', key: 'spontaneous', label: 'Splenorenal shunt present', get: (p) => p.spontaneous.C6, set: (p, v) => { p.spontaneous.C6 = v; }, info: 'A large spontaneous shunt from the splenic to the left renal vein.' },
  tips: { type: 'toggle', key: 'tips', label: 'TIPS', get: (p) => p.tips.on, set: (p, v) => { p.tips.on = v; }, info: 'Transjugular intrahepatic portosystemic shunt, right portal → right hepatic vein. You can also drag one with the Stent tool.' },
  tipsD: { type: 'slider', key: 'tips', label: 'Stent diameter', min: 6, max: 12, step: 0.5, get: (p) => p.tips.d, set: (p, v) => { p.tips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, def: 10, info: 'Resistance ∝ 1/d⁴ (Poiseuille): small changes in diameter matter a lot.', showIf: (p) => p.tips.on },
  balloonEso: { type: 'toggle', key: 'balloonEso', label: 'Esophageal balloon tamponade', ...prop('balloonEso') },
  balloonGas: { type: 'toggle', key: 'balloonGas', label: 'Gastric balloon tamponade', ...prop('balloonGas') },
  brto: { type: 'toggle', key: 'occluded', lockKey: 'brto', label: 'BRTO (occlude the gastrorenal shunt)', get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, info: 'Balloon-occluded retrograde transvenous obliteration. Watch what it does to portal pressure.' },
  portocaval: { type: 'toggle', key: 'portocaval', label: 'Portocaval shunt', ...prop('portocaval'), info: 'End-to-side: total diversion; the liver loses all portal perfusion.' },
  dsrs: { type: 'toggle', key: 'dsrs', label: 'Distal splenorenal (Warren)', ...prop('dsrs'), info: 'Selective: decompresses gastroesophageal varices while SMV blood still perfuses the liver.' },
  mesocaval: { type: 'toggle', key: 'mesocaval', label: 'Mesocaval shunt', ...prop('mesocaval') },
  albumin: { type: 'slider', key: 'albumin', label: 'Serum albumin', min: 1.5, max: 5, step: 0.1, ...prop('albumin'), format: (v) => `${v.toFixed(1)} g/dL`, def: 4, normal: [3.5, 5], info: 'Plasma oncotic pressure opposes filtration out of capillaries (Starling).' },
  diuretics: { type: 'toggle', key: 'diuretics', label: 'Diuretics', ...prop('diuretics'), info: 'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites.' },
  splanchnicTone: { type: 'slider', key: 'splanchnicTone', label: 'Splanchnic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, ...prop('splanchnicTone'), format: tone, def: 1, normal: [0.85, 1.15], info: 'Forward-flow theory: splanchnic vasodilation raises portal inflow, and so portal pressure.' },
  systemicTone: { type: 'slider', key: 'systemicTone', label: 'Systemic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, ...prop('systemicTone'), format: tone, def: 1, normal: [0.85, 1.15] },
  habr: { type: 'slider', key: 'habrStrength', label: 'Hepatic arterial buffer', min: 0, max: 2, step: 0.05, ...prop('habrStrength'), format: mult, def: 1, info: 'Adenosine washout: when portal flow falls the hepatic artery dilates to preserve liver perfusion.' },
  apShunt: { type: 'slider', key: 'apShunt', label: 'Arterioportal shunting', min: 0, max: 1, step: 0.01, ...prop('apShunt'), format: pct, def: 0, info: 'Hepatic-artery blood entering portal branches directly. With high sinusoidal resistance it can drive the portal vein backwards.' },
  pulsatile: { type: 'toggle', key: 'pulsatile', label: 'Pulsatile (beat-to-beat)', ...prop('pulsatile'), info: 'Adds the right-atrial waveform (a, x, v, y). Needed for Doppler pulsatility.' },
  respiration: { type: 'toggle', key: 'respiration', label: 'Respiration', ...prop('respiration') },
  respDepth: { type: 'slider', key: 'respDepth', label: 'Breath depth', min: 0, max: 3, step: 0.1, ...prop('respDepth'), format: mult, def: 1 },
  detRupture: { type: 'toggle', key: 'deterministicRupture', label: 'Deterministic rupture', ...prop('deterministicRupture'), info: 'Rupture exactly when wall tension exceeds the critical value, instead of a random hazard.' },
};
for (const k of Object.keys(DRUGS)) CONTROLS['drug:' + k] = { type: 'drug', key: 'drugs', lockKey: 'drug:' + k, drug: k };

const DRUG_SHORT = { propranolol: 'Non-selective β-blocker', carvedilol: 'β-blocker + α1 blockade', terlipressin: 'Vasopressin analogue', octreotide: 'Somatostatin analogue' };

export function createInspector(root, { onWhy, onAction, onOpenTab, onClose, onScenarios, onMode, pinned, chart }) {
  let live = [];        // [el, fn(frame)]
  let syncers = [];
  let lastSel;
  let tab = 'therapy';
  const openSections = new Set(['liver', 'drugs', 'procedures', 'inflow', 'live', 'ctl']);

  const liveText = (fn) => { const el = h('span', { class: 'num' }); live.push([el, fn]); return el; };
  const reg = (el) => { if (el?._sync) syncers.push(el); return el; };

  // ── Control builders ──────────────────────────────
  function infoI(text) { const b = h('button', { class: 'info-i', type: 'button', 'aria-label': text }, icon('info')); tooltipFor(b, text); return b; }
  function slider(c) {
    const { key, label, min, max, step, get, set, format, normal, info, sub, lockKey, def } = c;
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
    const val = h('span', { class: 'ctl-val' });
    const reset = h('button', { class: 'reset-btn', title: 'Reset', 'aria-label': `Reset ${label}` }, icon('reset'));
    const wrap = h('div', { class: 'ctl' },
      h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, label, info ? infoI(info) : null, reset), val),
      h('div', { class: 'range-wrap' }, normal ? h('span', { class: 'normal', title: 'Normal range', style: { left: `calc(${((normal[0] - min) / (max - min)) * 100}% + 2px)`, width: `calc(${((normal[1] - normal[0]) / (max - min)) * 100}% - 4px)` } }) : null, input),
      sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    const paint = (v) => {
      input.value = v; val.textContent = format(v);
      input.style.setProperty('--pct', `${((v - min) / (max - min)) * 100}%`);
      wrap.classList.toggle('changed', def != null && Math.abs(v - def) > 1e-9);
    };
    let fresh = true;
    const locked = isLocked(lockKey || key);
    if (locked) { input.disabled = true; wrap.title = 'Locked in this lesson or case'; }
    input.addEventListener('pointerdown', () => { fresh = true; });
    input.addEventListener('keydown', () => { fresh = true; });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      paint(v);
      updateParams((pp) => { set(pp, v); return pp; }, { history: fresh, label });
      fresh = false;
    });
    reset.addEventListener('click', () => {
      if (def == null || locked) return;
      paint(def);
      updateParams((pp) => { set(pp, def); return pp; }, { label: `Reset ${label}` });
    });
    paint(get(store.get().params));
    wrap._sync = (pp) => { if (document.activeElement !== input) paint(get(pp)); if (c.showIf) wrap.hidden = !c.showIf(pp); };
    if (c.showIf) wrap.hidden = !c.showIf(store.get().params);
    return wrap;
  }
  function toggle({ key, label, get, set, info, sub, lockKey }) {
    const cb = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
    cb.checked = !!get(store.get().params);
    if (isLocked(lockKey || key)) cb.disabled = true;
    cb.addEventListener('change', () => updateParams((pp) => { set(pp, cb.checked); return pp; }, { label: `${label} ${cb.checked ? 'on' : 'off'}` }));
    const row = h('div', { class: 'ctl' }, h('label', { class: 'toggle-row' }, h('span', { class: 'ctl-label' }, label, info ? infoI(info) : null), h('span', { class: 'switch' }, cb, h('span'))), sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    row._sync = (pp) => { cb.checked = !!get(pp); };
    return row;
  }
  function drugCard(k) {
    const d = DRUGS[k];
    const b = h('button', { class: 'drug', 'aria-pressed': String(!!store.get().params.drugs[k]) },
      h('span', { class: 'dn' }, d.label, h('span', { class: 'dot' }, icon('check'))), h('span', { class: 'dd' }, DRUG_SHORT[k] || ''));
    if (isLocked('drug:' + k)) b.disabled = true;
    tooltipFor(b, d.info);
    b.addEventListener('click', () => updateParams((pp) => { pp.drugs[k] = !pp.drugs[k]; return pp; }, { label: d.label }));
    b._sync = (pp) => b.setAttribute('aria-pressed', String(!!pp.drugs[k]));
    return b;
  }
  /** Build any registered control (used by panels and by lesson steps). */
  function build(id) {
    const c = CONTROLS[id];
    if (!c) return null;
    const el = c.type === 'slider' ? slider(c) : c.type === 'toggle' ? toggle(c) : drugCard(c.drug);
    return reg(el);
  }
  function section(id, title, ic, count, ...children) {
    const d = h('details', { class: 'section', 'data-id': id },
      h('summary', {}, ic ? svgIcon(ic, 'sec-ic') : null, title, count ? h('span', { class: 'count' }, count) : null, svgIcon('chev-down', 'chev')),
      h('div', { class: 'section-body' }, ...children));
    if (openSections.has(id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) openSections.add(id); else openSections.delete(id); });
    return d;
  }
  const changedCount = (ids) => { const p = store.get().params; const n = ids.filter((id) => { const c = CONTROLS[id]; if (!c) return false; const v = c.type === 'drug' ? p.drugs[c.drug] : c.get(p); return c.type === 'slider' ? Math.abs(v - c.def) > 1e-9 : !!v; }).length; return n || null; };
  const whyBtn = (metric, text = 'Why this value?') => h('button', { class: 'btn sm', onclick: (e) => onWhy(metric, e.currentTarget) }, icon('bulb'), text);

  // ── Global panel ──────────────────────────────────
  function globalPanel() {
    const P = store.get().params;
    const activeBox = h('div', { class: 'changes' });
    const renderActive = (pp) => {
      const active = activeInterventions(pp);
      activeBox.replaceChildren(
        h('div', { class: 'changes-head' }, h('span', { class: 'overline' }, active.length ? `Active changes · ${active.length}` : 'Active changes'),
          active.length ? h('button', { class: 'link', style: { fontSize: '12px' }, onclick: () => updateParams((q) => { for (const a of activeInterventions(q)) a.remove(q); return q; }, { label: 'Clear all changes' }) }, 'Clear all') : null),
        active.length
          ? h('div', { class: 'chips-list' }, active.map((a) => h('span', { class: 'active-chip' }, a.label, h('button', { 'aria-label': `Remove ${a.label}`, title: 'Remove', onclick: () => updateParams((q) => { a.remove(q); return q; }, { label: `Remove ${a.label}` }) }, icon('close')))))
          : h('div', { class: 'ctl-sub' }, 'Healthy baseline. Change something with the tools on the anatomy or the controls below.'));
    };
    renderActive(P);
    activeBox._sync = renderActive;
    syncers.push(activeBox);

    const tabs = h('div', { class: 'seg full', role: 'tablist', 'aria-label': 'Control groups' }, [['therapy', 'Therapy'], ['physiology', 'Physiology']].map(([id, l]) => {
      const b = h('button', { role: 'tab', 'aria-selected': String(tab === id) }, l);
      b.addEventListener('click', () => { tab = id; render(); });
      return b;
    }));
    const scen = store.get().presetList?.find((x) => x.id === store.get().presetId)?.label || 'Custom';
    const head = h('div', { class: 'p-head' },
      h('div', { class: 'p-head-row' }, h('div', { class: 'p-title' }, h('span', { class: 'kicker' }, `Patient · ${scen}`), h('h2', {}, 'Controls')),
        h('button', { class: 'ib show-md', 'aria-label': 'Close panel', onclick: onClose, title: 'Close' }, icon('close'))),
      tabs);
    let body;
    if (tab === 'therapy') {
      const fluids = h('div', { class: 'action-grid' },
        h('button', { class: 'btn', onclick: () => onAction({ kind: 'infuse', fluid: 'crystalloid' }) }, '+ 1 L crystalloid'),
        h('button', { class: 'btn', onclick: () => onAction({ kind: 'infuse', fluid: 'prbc' }) }, '+ 1 unit PRBC'),
        h('button', { class: 'btn', onclick: () => onAction({ kind: 'infuse', fluid: 'albumin' }) }, '+ Albumin'),
        h('button', { class: 'btn danger', onclick: () => onAction({ kind: 'hemorrhage', mL: 500 }) }, '− 500 mL bleed'));
      body = [
        h('div', { class: 'callout-note', style: { margin: '14px 0 4px' } }, 'Disease is set on the anatomy: click the liver, a vein, the heart or the varices and use the card beside it.'),
        section('drugs', 'Drugs', 'pill', changedCount([...Object.keys(DRUGS).map((k) => 'drug:' + k), 'anticoag']), h('div', { class: 'drug-grid' }, Object.keys(DRUGS).map((k) => build('drug:' + k))), build('anticoag')),
        section('procedures', 'Procedures', 'stent', changedCount(['tips', 'balloonEso', 'balloonGas', 'brto', 'portocaval', 'dsrs', 'mesocaval']),
          build('tips'), build('tipsD'),
          h('div', { class: 'action-grid' },
            h('button', { class: 'btn', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band varices'),
            h('button', { class: 'btn', onclick: () => onAction({ kind: 'paracentesisPrompt' }) }, icon('needle'), 'Paracentesis…')),
          h('div', { class: 'subhead' }, 'Tamponade & embolization'), build('balloonEso'), build('balloonGas'), build('brto'),
          h('div', { class: 'subhead' }, 'Surgical shunts'), build('portocaval'), build('dsrs'), build('mesocaval')),
        section('volume', 'Volume & ascites', 'drop', changedCount(['albumin', 'diuretics']),
          h('div', { class: 'stat-grid' },
            h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Blood volume'), h('span', { class: 'v' }, liveText((f) => `${fmt(f.metrics.blood.volume / 1000, 2)} L`))),
            h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Hemoglobin'), h('span', { class: 'v' }, liveText((f) => `${fmt(f.metrics.blood.hb, 1)} g/dL`)))),
          fluids, build('albumin'), build('diuretics')),
      ];
    } else {
      body = [
        section('inflow', 'Inflow & vascular tone', 'activity', changedCount(['splanchnicTone', 'systemicTone']), build('splanchnicTone'), build('systemicTone')),
        section('hepatic', 'Hepatic circulation', 'liver', changedCount(['habr', 'apShunt']), build('habr'), build('apShunt')),
        section('anatomy', 'Anatomical variants', null, changedCount(['grShunt', 'srShunt']), build('grShunt'), build('srShunt')),
        section('env', 'Simulation', 'settle', null, build('pulsatile'), build('respiration'), build('respDepth'), build('detRupture'),
          h('div', { class: 'action-grid' },
            h('button', { class: 'btn', onclick: () => onAction({ kind: 'valsalva' }) }, 'Valsalva'),
            h('button', { class: 'btn danger', onclick: () => onAction({ kind: 'rupture', site: 'VAR', tear: 0.6 }) }, 'Rupture a varix'))),
        h('p', { class: 'disclaimer', style: { margin: '16px 0 0' } }, 'Educational simulation. The model is simplified and its values are illustrative; do not use it for diagnosis or treatment decisions.'),
      ];
    }
    return [head, pinned?.(), activeBox, h('div', { class: 'p-body' }, body)];
  }

  // ── Selection panels ──────────────────────────────
  function selectionHead(kicker, title, extra) {
    return h('div', { class: 'p-head' },
      h('div', { class: 'p-head-row' },
        h('button', { class: 'ib', 'aria-label': 'Back', title: 'Back', onclick: () => store.set({ details: null }) }, icon('arrow-left')),
        h('div', { class: 'p-title' }, h('span', { class: 'kicker' }, kicker), h('h2', { title }, title)),
        h('button', { class: 'ib show-md', 'aria-label': 'Close panel', onclick: onClose, title: 'Close' }, icon('close'))),
      extra);
  }
  function stat(k, fn, wide) { return h('div', { class: 'stat' + (wide ? ' wide' : '') }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, liveText(fn))); }

  function edgePanel(id) {
    const e = EDGES[EI[id]];
    if (!e) return globalPanel();
    const k = EI[id];
    const fromN = NODES[NI[e.from]], toN = NODES[NI[e.to]];
    const isColl = e.kind === 'collateral', isArt = e.kind === 'arteriole' || e.kind === 'artery';
    const kicker = isColl ? `Collateral · ${e.code}` : isArt ? 'Artery' : e.kind === 'liver' ? 'Liver microcirculation' : e.kind === 'shunt' ? 'Shunt' : 'Vein';
    const dirEl = h('div');
    live.push([dirEl, (f) => {
      const q = f.Qf[k];
      const ref = store.get().healthy?.Q?.[k] ?? 1;
      const cls = Math.abs(q) < 0.05 ? ['warn', 'Stagnant'] : q < -Math.max(0.12, 0.02 * Math.abs(ref)) ? ['rev', 'Reversed flow'] : ['ok', 'Physiological direction'];
      if (dirEl._c !== cls[1]) { dirEl.replaceChildren(h('span', { class: 'pill ' + cls[0] }, cls[1])); dirEl._c = cls[1]; }
      return null;
    }]);
    const R = (f) => { const q = f.Q[k]; const dp = f.P[NI[e.from]] - f.P[NI[e.to]]; return Math.abs(q) > 1e-3 ? `${fmt(dp / (q * 0.06), 2)} WU` : '∞'; };
    const els = [
      selectionHead(kicker, e.label, dirEl),
      h('div', { class: 'p-body' },
        section('live', 'Live values', null, null,
          h('div', { class: 'stat-grid' },
            stat(`In · ${fromN.label}`, (f) => fp(f.P[NI[e.from]]).join(' '), true),
            stat(`Out · ${toN.label}`, (f) => fp(f.P[NI[e.to]]).join(' '), true),
            stat('Pressure drop', (f) => `${fmt(f.P[NI[e.from]] - f.P[NI[e.to]], 1)} mmHg`),
            stat('Flow', (f) => ff(f.Q[k] * 0.06).join(' ')),
            stat('Mean velocity', (f) => { const D = Math.max(0.5, f.D[k]) / 10; return `${fmt(f.Q[k] / (Math.PI * D * D / 4), 1)} cm/s`; }),
            stat('Diameter', (f) => `${fmt(f.D[k], 1)} mm`),
            stat('Resistance', R),
            isColl ? stat('Recruitment', (f) => `${Math.round(clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1) * 100)} %`) : stat('Healthy flow', () => { const q = store.get().healthy?.Q?.[k]; return q != null ? `${fmt(q * 0.06, 2)} L/min` : '—'; })),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn sm', onclick: () => { onAction({ kind: 'probe', id }); onOpenTab('doppler'); } }, icon('doppler'), 'Doppler here'),
            whyBtn(['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L'].includes(id) ? 'pvFlow' : isColl ? 'shunt' : 'pv'))),
      ),
    ];
    const body = els[1];
    body.append(h('p', { class: 'ctl-sub', style: { margin: '12px 0 0' } }, 'Change this vessel from its card on the figure.'));
    body.append(section('about', 'About this vessel', null, null, h('p', { class: 'sub', style: { margin: 0 } }, aboutEdge(e))));
    openSections.add('about');
    return els;
  }

  function nodePanel(id) {
    const n = NODES[NI[id]];
    return [
      selectionHead('Compartment', n.label),
      h('div', { class: 'p-body' },
        section('live', 'Live values', null, null,
          h('div', { class: 'stat-grid' },
            stat('Pressure', (f) => fp(f.P[NI[id]]).join(' ')),
            stat('Healthy', () => { const v = store.get().healthy?.P?.[NI[id]]; return v != null ? `${fmt(v, 1)} mmHg` : '—'; }),
            stat('External pressure (Δ)', (f) => `${fmt(f.ext[NI[id]], 1)} mmHg`),
            stat('Transmural', (f) => `${fmt(f.P[NI[id]] - f.ext[NI[id]], 1)} mmHg`)),
          h('div', { class: 'btn-row' }, whyBtn(id === 'RA' ? 'ra' : id === 'AO' ? 'map' : id === 'VAR' ? 'varix' : 'pv'))),
        section('connections', 'Connected vessels', null, null, h('div', { class: 'btn-row' },
          EDGES.filter((e) => (e.from === id || e.to === id) && e.kind !== 'wedge').map((e) => h('button', { class: 'btn sm', onclick: () => store.set({ details: { type: 'edge', id: e.id }, selection: { type: 'edge', id: e.id } }) }, e.label || e.id))))),
    ];
  }

  const ORGAN_ABOUT = {
    liver: ['Organ', 'Liver', 'Blood crosses three resistances in series: portal venules (presinusoidal), sinusoids and central veins (postsinusoidal). Cirrhosis raises sinusoidal resistance; schistosomiasis blocks the portal tracts; sinusoidal obstruction syndrome the central veins. The hepatic artery buffers falls in portal flow.', [['Sinusoids (R)', (f) => fp(f.P[NI.SIN_R]).join(' ')], ['HVPG', (f) => `${fmt(f.metrics.hvpg, 1)} mmHg`], ['Liver perfusion', (f) => `${Math.round(f.metrics.liverPerfPct)} %`], ['Hepatic artery flow', (f) => `${fmt(f.metrics.arterialIn, 2)} L/min`]], 'hvpg'],
    heart: ['Organ', 'Right heart', 'The right atrium is where both cavae end. Its pressure is the floor of the whole venous system: a failing right ventricle or tricuspid regurgitation raises every pressure upstream, including the hepatic veins, so the HVPG stays normal.', [['Right atrium', (f) => fp(f.P[NI.RA]).join(' ')], ['Cardiac output', (f) => `${fmt(f.metrics.co, 2)} L/min`], ['MAP', (f) => `${fmt(f.metrics.map, 0)} mmHg`], ['Heart rate', (f) => `${fmt(f.metrics.hr, 0)} /min`]], 'ra'],
    varices: ['Collateral bed', 'Esophageal varices', 'Submucosal veins of the lower esophagus fed by the left gastric (coronary) vein and draining to the azygos. Wall tension follows Laplace: T = ΔP · r / w, so large thin-walled varices rupture.', [['Pressure', (f) => fp(f.P[NI.VAR]).join(' ')], ['Diameter', (f) => `${fmt(f.metrics.varix.d, 1)} mm`], ['Wall tension', (f) => `${Math.round(f.metrics.varix.ratio * 100)} % of rupture`], ['Grade', (f) => f.metrics.varix.grade.code]], 'varix'],
    gastric: ['Collateral bed', 'Fundal varices', 'Fed by the short and posterior gastric veins, often draining through a gastrorenal shunt to the left renal vein. They bleed at lower pressures than esophageal varices; BRTO occludes the shunt.', [['Pressure', (f) => fp(f.P[NI.GV]).join(' ')], ['Diameter', (f) => `${fmt(f.metrics.gastricVarix.d, 1)} mm`], ['Wall tension', (f) => `${Math.round(f.metrics.gastricVarix.ratio * 100)} % of rupture`]], 'varix'],
    spleen: ['Organ', 'Spleen', 'Portal hypertension congests and enlarges the spleen, which sequesters platelets. Splenic vein thrombosis isolates it: sinistral portal hypertension with fundal varices.', [['Length', (f) => `${fmt(f.metrics.spleen.length, 1)} cm`], ['Platelets (illustrative)', (f) => `${Math.round(f.metrics.spleen.platelets)} ×10⁹/L`]], 'spleen'],
    abdomen: ['Peritoneum', 'Abdomen & ascites', 'Ascites forms when filtration from the sinusoids and gut capillaries outpaces lymph drainage (Starling). Sinusoidal pressure and albumin decide the balance; intra-abdominal pressure rises as it accumulates.', [['Ascites', (f) => `${fmt(f.metrics.ascites.volume / 1000, 2)} L`], ['Formation', (f) => `${fmt(f.metrics.ascites.ratePerDay, 0)} mL/day`], ['IAP', (f) => `${fmt(f.metrics.ascites.iap, 1)} mmHg`], ['Hepatic lymph', (f) => `${fmt(f.metrics.ascites.hepLymph, 1)} mL/min`]], 'ascites'],
  };
  function organPanel(id) {
    const o = ORGAN_ABOUT[id];
    if (!o) return globalPanel();
    const [kicker, title, about, stats, why] = o;
    return [selectionHead(kicker, title), h('div', { class: 'p-body' },
      section('live', 'Live values', null, null, h('div', { class: 'stat-grid' }, stats.map(([k, fn]) => stat(k, fn))), h('div', { class: 'btn-row' }, whyBtn(why))),
      section('about', 'About', null, null, h('p', { class: 'sub', style: { margin: 0 } }, about)))];
  }

  function aboutEdge(e) {
    const txt = {
      PV_TRUNK: 'Carries about 75 % of liver blood flow (≈ 1.1 L/min). Normal mean velocity 15–40 cm/s, toward the liver. The portal system has no valves: flow goes wherever the gradient points.',
      C1a: 'The left gastric (coronary) vein feeds the esophageal submucosal plexus: the source of esophageal varices.',
      C1b: 'Esophageal varices drain to the azygos vein and SVC. Wall tension follows Laplace: T = ΔP · r / w.',
      C2: 'Short and posterior gastric veins connect the splenic vein to the fundus: the route of isolated gastric varices in splenic vein thrombosis.',
      C3: 'The recanalized paraumbilical vein runs from the left portal vein along the falciform ligament to the umbilicus (caput medusae, Cruveilhier–Baumgarten murmur).',
      C4: 'Superior rectal (portal) ↔ middle and inferior rectal (systemic) veins: anorectal varices, not hemorrhoids.',
      C5: 'Gastrorenal shunt: fundal varices → left inferior phrenic / adrenal → left renal vein. The target of BRTO.',
      C6: 'Spontaneous splenorenal shunt: large, can steal portal flow and cause encephalopathy.',
      C7: 'Retroperitoneal veins of Retzius connect mesenteric veins to lumbar and renal veins.',
      C8: 'Periportal (pericholedochal) collaterals bypass an occluded portal vein: cavernous transformation, which stays hepatopetal.',
      C9: 'The ascending lumbar–azygos route decompresses the IVC when it is obstructed.',
      TIPS: 'A covered stent from a portal branch to a hepatic vein. Target portosystemic gradient < 12 mmHg. Costs: encephalopathy, liver hypoperfusion, higher cardiac preload.',
      CAUD: 'The caudate lobe drains straight into the IVC through its own short veins, so it is spared (and hypertrophies) in Budd–Chiari syndrome.',
      PRE_R: 'Presinusoidal segment: portal venules in the portal tract. Blocked in schistosomiasis and other non-cirrhotic portal hypertension.',
      SIN_RR: 'Sinusoids: normally low-resistance, fenestrated and compliant. In cirrhosis, collagen in the space of Disse, stellate-cell contraction and capillarization raise their resistance.',
    };
    return txt[e.id] || txt[e.id.replace(/_L$|L$/, '')] || `${e.label}. Connects ${NODES[NI[e.from]].label} → ${NODES[NI[e.to]].label} (physiological flow direction).`;
  }

  // ── Render ────────────────────────────────────────
  function render() {
    if (store.get().mode === 'cases') return; // the case panel owns this element
    live = []; syncers = [];
    const sel = store.get().details;
    const els = (!sel ? (chart ? chart.render((ids) => ids.map((id) => build(id))) : globalPanel()) : sel.type === 'edge' ? edgePanel(sel.id) : sel.type === 'node' ? nodePanel(sel.id) : sel.type === 'organ' ? organPanel(sel.id) : globalPanel());
    const scroller = root.closest('.panel') || root;
    const top = scroller.scrollTop;
    root.replaceChildren(...els.filter(Boolean));
    if (sel === lastSel) scroller.scrollTop = top;
    lastSel = sel;
    if (store.get().frame) update(store.get().frame);
  }

  function update(f) {
    for (const [el, fn] of live) { const v = fn(f); if (v != null && el.textContent !== v) el.textContent = v; }
    if (!store.get().details) chart?.update(f);
  }

  store.on('details', render);
  store.on('locked', render);
  document.addEventListener('pps:rerender-panel', render);
  for (const k of ['presetId', 'role', 'mode', 'allowedVerbs', 'hiddenReadouts']) store.on(k, () => { if (!store.get().details && store.get().mode !== 'cases') render(); });
  store.on('params', () => { const p = store.get().params; for (const s of syncers) s._sync(p); });
  if (!chart) render();
  return {
    render, update,
    /** Detached controls for a lesson card; they keep themselves in sync with params. */
    buildControls(ids) {
      const els = ids.map((id) => { const c = CONTROLS[id]; if (!c) return null; return c.type === 'slider' ? slider(c) : c.type === 'toggle' ? toggle(c) : drugCard(c.drug); }).filter(Boolean);
      const off = store.on('params', () => { const p = store.get().params; for (const e of els) e._sync?.(p); });
      return { els, dispose: off };
    },
  };
}

export function activeInterventions(p) {
  const out = [];
  const add = (key, label, remove) => out.push({ key, label, remove });
  const zn = { pre: 'Presinusoidal', sin: 'Sinusoidal', post: 'Postsinusoidal' };
  if (p.cirrhosis > 0) add('cirrhosis', `Cirrhosis ${Math.round(p.cirrhosis * 100)} %`, (q) => { q.cirrhosis = 0; });
  for (const z of ['pre', 'sin', 'post']) {
    const r = p.fibrosis.R[z], l = p.fibrosis.L[z];
    if (r !== 1 && Math.abs(r - l) < 1e-9) add('fib:' + z, `${zn[z]} fibrosis ×${r.toFixed(r < 10 ? 1 : 0)}`, (q) => { q.fibrosis.R[z] = 1; q.fibrosis.L[z] = 1; });
    else for (const lobe of ['R', 'L']) if (p.fibrosis[lobe][z] !== 1) add(`fib:${lobe}:${z}`, `${zn[z]} fibrosis, ${lobe === 'R' ? 'right' : 'left'} lobe ×${p.fibrosis[lobe][z].toFixed(1)}`, (q) => { q.fibrosis[lobe][z] = 1; });
  }
  const lab = (id) => EDGES[EI[id]]?.label || id;
  for (const [id, v] of Object.entries(p.stenosis)) add('sten:' + id, `${lab(id)} narrowed ${Math.round(v * 100)} %`, (q) => { delete q.stenosis[id]; });
  for (const [id, v] of Object.entries(p.thrombus)) add('thr:' + id, `${lab(id)} thrombus ${Math.round(v * 100)} %`, (q) => { delete q.thrombus[id]; });
  for (const [k, on] of Object.entries(p.drugs)) if (on) add('drug:' + k, DRUGS[k].label, (q) => { q.drugs[k] = false; });
  if (p.tips.on) add('tips', `TIPS ${p.tips.d} mm`, (q) => { q.tips.on = false; });
  if (p.portocaval) add('portocaval', 'Portocaval shunt', (q) => { q.portocaval = false; });
  if (p.dsrs) add('dsrs', 'Distal splenorenal shunt', (q) => { q.dsrs = false; });
  if (p.mesocaval) add('mesocaval', 'Mesocaval shunt', (q) => { q.mesocaval = false; });
  for (const [id, d] of Object.entries(p.customShunts || {})) add('cs:' + id, `${lab(id)} ${d} mm`, (q) => { const c = { ...(q.customShunts || {}) }; delete c[id]; q.customShunts = c; });
  if (p.balloonEso) add('balloonEso', 'Esophageal balloon', (q) => { q.balloonEso = false; });
  if (p.balloonGas) add('balloonGas', 'Gastric balloon', (q) => { q.balloonGas = false; });
  for (const id of Object.keys(p.occluded)) add('occ:' + id, `${id === 'C5' ? 'BRTO (gastrorenal shunt occluded)' : lab(id) + ' occluded'}`, (q) => { delete q.occluded[id]; });
  if (p.splanchnicTone !== 1) add('splTone', `Splanchnic tone ×${p.splanchnicTone.toFixed(2)}`, (q) => { q.splanchnicTone = 1; });
  if (p.systemicTone !== 1) add('sysTone', `Systemic tone ×${p.systemicTone.toFixed(2)}`, (q) => { q.systemicTone = 1; });
  if (p.contractility !== 1) add('contractility', `RV contractility ${Math.round(p.contractility * 100)} %`, (q) => { q.contractility = 1; });
  if (p.tr > 0) add('tr', `Tricuspid regurgitation ${Math.round(p.tr * 100)} %`, (q) => { q.tr = 0; });
  if (p.pericardial > 0) add('pericardial', `Pericardial constraint ${Math.round(p.pericardial * 100)} %`, (q) => { q.pericardial = 0; });
  if (p.apShunt > 0) add('apShunt', `Arterioportal shunting ${Math.round(p.apShunt * 100)} %`, (q) => { q.apShunt = 0; });
  if (p.habrStrength !== 1) add('habr', `Arterial buffer ×${p.habrStrength.toFixed(2)}`, (q) => { q.habrStrength = 1; });
  if (p.albumin !== 4) add('albumin', `Albumin ${p.albumin.toFixed(1)} g/dL`, (q) => { q.albumin = 4; });
  if (p.diuretics) add('diuretics', 'Diuretics', (q) => { q.diuretics = false; });
  if (p.anticoag) add('anticoag', 'Anticoagulation', (q) => { q.anticoag = false; });
  if (p.spontaneous.C5) add('C5', 'Gastrorenal shunt', (q) => { q.spontaneous.C5 = false; });
  if (p.spontaneous.C6) add('C6', 'Splenorenal shunt', (q) => { q.spontaneous.C6 = false; });
  if (p.catheter.vein) add('catheter', `Catheter in ${p.catheter.vein}HV${p.catheter.wedged ? ' (wedged)' : ''}`, (q) => { q.catheter = { vein: null, wedged: false }; });
  return out;
}
