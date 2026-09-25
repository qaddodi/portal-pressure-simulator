// Inspector (blueprint §4.1, §8.4): selection details or global parameters.

import { EDGES, NODES, COLLATERAL_DMIN_RATIO } from '../engine/topology.js';
import { DRUGS } from '../engine/scenario.js';
import { store, updateParams, isLocked } from './store.js';
import { h, fmt, fp, ff, clamp, tooltipFor, toast } from './util.js';
import { pressureColor } from './colormap.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

export function createInspector(root, { onWhy, onAction, onOpenTab, onClose }) {
  let live = [];        // [el, fn(frame)]
  let lastSel = undefined;
  let openSections = new Set(['active', 'liver', 'interventions']);
  let lastParamsTick = -1;

  const liveText = (fn) => { const el = h('span', { class: 'num' }); live.push([el, fn]); return el; };

  // ── Generic controls ──────────────────────────────
  function slider({ key, label, min, max, step, get, set, format, normal, info, sub, lockKey, defaultValue }) {
    const p = store.get().params;
    const v0 = get(p);
    const input = h('input', { type: 'range', min, max, step, value: v0, 'aria-label': label });
    const val = h('span', { class: 'ctl-val' }, format(v0));
    const reset = h('button', { class: 'reset-dot', title: 'Reset to baseline', 'aria-label': `Reset ${label}` });
    const wrap = h('div', { class: 'ctl' + (defaultValue != null && Math.abs(v0 - defaultValue) > 1e-9 ? ' changed' : '') },
      h('div', { class: 'ctl-top' }, h('span', { class: 'ctl-label' }, label, info ? infoI(info) : null, reset), val),
      h('div', { class: 'range-wrap' }, normal ? h('span', { class: 'normal', style: { left: `${((normal[0] - min) / (max - min)) * 100}%`, width: `${((normal[1] - normal[0]) / (max - min)) * 100}%` } }) : null, input),
      sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    let fresh = true;
    const locked = isLocked(lockKey || key);
    if (locked) { input.disabled = true; wrap.title = 'Locked in this lesson/case'; }
    input.addEventListener('pointerdown', () => { fresh = true; });
    input.addEventListener('keydown', () => { fresh = true; });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      val.textContent = format(v);
      updateParams((pp) => { set(pp, v); return pp; }, { history: fresh, label });
      fresh = false;
      wrap.classList.toggle('changed', defaultValue != null && Math.abs(v - defaultValue) > 1e-9);
    });
    reset.addEventListener('click', () => {
      if (defaultValue == null || locked) return;
      input.value = defaultValue; val.textContent = format(defaultValue);
      updateParams((pp) => { set(pp, defaultValue); return pp; }, { label: `Reset ${label}` });
      wrap.classList.remove('changed');
    });
    wrap._sync = (pp) => { const v = get(pp); if (document.activeElement !== input) { input.value = v; val.textContent = format(v); } wrap.classList.toggle('changed', defaultValue != null && Math.abs(v - defaultValue) > 1e-9); };
    return wrap;
  }
  function toggle({ key, label, get, set, info, sub, lockKey }) {
    const cb = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
    cb.checked = !!get(store.get().params);
    if (isLocked(lockKey || key)) cb.disabled = true;
    cb.addEventListener('change', () => updateParams((pp) => { set(pp, cb.checked); return pp; }, { label: `${label} ${cb.checked ? 'on' : 'off'}` }));
    const row = h('div', { class: 'ctl' }, h('div', { class: 'toggle-row' }, h('span', { class: 'ctl-label' }, label, info ? infoI(info) : null), h('label', { class: 'switch' }, cb, h('span'))), sub ? h('div', { class: 'ctl-sub' }, sub) : null);
    row._sync = (pp) => { cb.checked = !!get(pp); };
    return row;
  }
  function infoI(text) { const b = h('button', { class: 'info-i', type: 'button', 'aria-label': text }, 'i'); tooltipFor(b, text); return b; }
  function section(id, title, ...children) {
    const d = h('details', { class: 'section', 'data-id': id }, h('summary', {}, title), h('div', { class: 'section-body' }, ...children));
    if (openSections.has(id)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) openSections.add(id); else openSections.delete(id); });
    return d;
  }
  const whyBtn = (metric, text = 'Why?') => { const b = h('button', { class: 'btn', onclick: (e) => onWhy(metric, e.currentTarget) }, text); return b; };

  const syncers = [];
  const reg = (el) => { if (el?._sync) syncers.push(el); return el; };

  // ── Global panel ──────────────────────────────────
  function globalPanel() {
    const P = store.get().params;
    const pct = (v) => `${Math.round(v * 100)} %`;
    const mult = (v) => `×${v.toFixed(v < 10 ? 2 : 0)}`;
    const tone = (v) => (Math.abs(v - 1) < 0.01 ? 'normal' : v < 1 ? `×${v.toFixed(2)} dilated` : `×${v.toFixed(2)} constricted`);
    const occl = (id) => ({ get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; } });
    const sten = (id) => ({ get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; } });
    const fibAll = (z) => ({ get: (p) => Math.sqrt(p.fibrosis.R[z] * p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; } });

    const activeBox = h('div');
    const renderActive = (pp) => {
      const active = activeInterventions(pp);
      activeBox.replaceChildren(active.length
        ? h('div', { class: 'chips-list' }, active.map((a) => h('span', { class: 'active-chip' }, a.label, h('button', { 'aria-label': `Remove ${a.label}`, title: 'Remove', onclick: () => updateParams((q) => { a.remove(q); return q; }, { label: `Remove ${a.label}` }) }, '×'))))
        : h('div', { class: 'ctl-sub' }, 'Healthy baseline. Use the tools on the anatomy, or the controls below.'));
    };
    renderActive(P);
    activeBox._sync = renderActive;
    syncers.push(activeBox);
    const els = [];
    els.push(h('div', { class: 'insp-head' }, h('div', { style: { flex: 1, minWidth: 0 } }, h('span', { class: 'kicker' }, 'Global parameters'), h('h2', {}, 'Scenario controls')),
      h('button', { class: 'btn icon', 'aria-label': 'Close inspector', onclick: onClose, title: 'Close' }, '×')));
    els.push(section('active', 'Active changes', activeBox));

    els.push(section('liver', 'Liver',
      reg(slider({ key: 'cirrhosis', label: 'Cirrhosis severity', min: 0, max: 1, step: 0.01, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, format: pct, defaultValue: 0,
        info: 'Macro control: sinusoidal fibrosis & capillarization, stiffer liver, less HABR reserve, arterioportal shunting. Use the Months clock to see collaterals and varices develop.',
        sub: 'Try 40 % (compensated), 60 % (CSPH), 85 % (decompensated)' })),
      reg(slider({ key: 'fibrosis', label: 'Presinusoidal resistance', min: 1, max: 80, step: 0.5, ...fibAll('pre'), format: mult, defaultValue: 1, info: 'Portal tract / portal venule block (e.g. schistosomiasis). Raises portal pressure without raising the wedged pressure.' })),
      reg(slider({ key: 'fibrosis', label: 'Sinusoidal resistance', min: 1, max: 40, step: 0.5, ...fibAll('sin'), format: mult, defaultValue: 1, info: 'Extra sinusoidal resistance on top of the cirrhosis macro.' })),
      reg(slider({ key: 'fibrosis', label: 'Postsinusoidal resistance', min: 1, max: 40, step: 0.5, ...fibAll('post'), format: mult, defaultValue: 1, info: 'Central vein / terminal hepatic venule (e.g. sinusoidal obstruction syndrome).' })),
      reg(slider({ key: 'habrStrength', label: 'Hepatic arterial buffer', min: 0, max: 2, step: 0.05, get: (p) => p.habrStrength, set: (p, v) => { p.habrStrength = v; }, format: mult, defaultValue: 1, info: 'Adenosine washout: when portal flow falls, the hepatic artery dilates to preserve liver perfusion.' })),
      reg(slider({ key: 'apShunt', label: 'Arterioportal shunting', min: 0, max: 1, step: 0.01, get: (p) => p.apShunt, set: (p, v) => { p.apShunt = v; }, format: pct, defaultValue: 0, info: 'Hepatic-artery blood entering portal branches directly. With high sinusoidal resistance it drives the portal vein backwards (hepatofugal).' })),
    ));

    els.push(section('vessels', 'Obstructions',
      reg(slider({ key: 'thrombus', label: 'Portal vein thrombosis', min: 0, max: 1, step: 0.01, ...occl('PV_TRUNK'), format: pct, defaultValue: 0 })),
      reg(slider({ key: 'thrombus', label: 'Splenic vein thrombosis', min: 0, max: 1, step: 0.01, ...occl('SV_CONF'), format: pct, defaultValue: 0 })),
      reg(slider({ key: 'thrombus', label: 'SMV thrombosis', min: 0, max: 1, step: 0.01, ...occl('SMV_CONF'), format: pct, defaultValue: 0 })),
      reg(slider({ key: 'thrombus', label: 'Right hepatic vein occlusion', min: 0, max: 1, step: 0.01, ...occl('RHV_IVC'), format: pct, defaultValue: 0 })),
      reg(slider({ key: 'thrombus', label: 'Middle hepatic vein occlusion', min: 0, max: 1, step: 0.01, ...occl('MHV_IVC'), format: pct, defaultValue: 0 })),
      reg(slider({ key: 'thrombus', label: 'Left hepatic vein occlusion', min: 0, max: 1, step: 0.01, ...occl('LHV_IVC'), format: pct, defaultValue: 0 })),
      reg(slider({ key: 'stenosis', label: 'Suprahepatic IVC stenosis', min: 0, max: 0.95, step: 0.01, ...sten('IVCS_RA'), format: pct, defaultValue: 0, info: 'IVC web / membranous obstruction.' })),
      reg(toggle({ key: 'anticoag', label: 'Anticoagulation', get: (p) => p.anticoag, set: (p, v) => { p.anticoag = v; }, info: 'Thrombi slowly recanalize on the Months clock.' })),
    ));

    els.push(section('inflow', 'Inflow & circulation',
      reg(slider({ key: 'splanchnicTone', label: 'Splanchnic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, get: (p) => p.splanchnicTone, set: (p, v) => { p.splanchnicTone = v; }, format: tone, defaultValue: 1, normal: [0.85, 1.15],
        info: 'Forward-flow theory: splanchnic vasodilation raises portal inflow and pressure.' })),
      reg(slider({ key: 'systemicTone', label: 'Systemic arteriolar tone', min: 0.4, max: 2.5, step: 0.01, get: (p) => p.systemicTone, set: (p, v) => { p.systemicTone = v; }, format: tone, defaultValue: 1, normal: [0.85, 1.15] })),
      reg(slider({ key: 'contractility', label: 'Right-heart contractility', min: 0.15, max: 1.6, step: 0.01, get: (p) => p.contractility, set: (p, v) => { p.contractility = v; }, format: pct, defaultValue: 1, normal: [0.85, 1.2] })),
      reg(slider({ key: 'tr', label: 'Tricuspid regurgitation', min: 0, max: 1, step: 0.01, get: (p) => p.tr, set: (p, v) => { p.tr = v; }, format: pct, defaultValue: 0, info: 'Systolic backflow into the RA: large v-waves that reach the liver (see the pulsatile mode and Doppler).' })),
      reg(slider({ key: 'pericardial', label: 'Pericardial constraint', min: 0, max: 1, step: 0.01, get: (p) => p.pericardial, set: (p, v) => { p.pericardial = v; }, format: pct, defaultValue: 0 })),
    ));

    const fluids = h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => onAction({ kind: 'infuse', fluid: 'crystalloid' }) }, '+ 1 L crystalloid'),
      h('button', { class: 'btn', onclick: () => onAction({ kind: 'infuse', fluid: 'prbc' }) }, '+ 1 unit PRBC'),
      h('button', { class: 'btn', onclick: () => onAction({ kind: 'infuse', fluid: 'albumin' }) }, '+ Albumin'),
      h('button', { class: 'btn danger', onclick: () => onAction({ kind: 'hemorrhage', mL: 500 }) }, '− 500 mL bleed'));
    els.push(section('volume', 'Blood & volume',
      h('dl', { class: 'kv' }, h('dt', {}, 'Blood volume'), h('dd', {}, liveText((f) => `${Math.round(f.metrics.blood.volume)} mL`)), h('dt', {}, 'Hemoglobin'), h('dd', {}, liveText((f) => `${fmt(f.metrics.blood.hb, 1)} g/dL`))),
      fluids,
      reg(slider({ key: 'albumin', label: 'Serum albumin', min: 1.5, max: 5, step: 0.1, get: (p) => p.albumin, set: (p, v) => { p.albumin = v; }, format: (v) => `${v.toFixed(1)} g/dL`, defaultValue: 4, normal: [3.5, 5], info: 'Plasma oncotic pressure opposes filtration from capillaries (Starling).' })),
      reg(toggle({ key: 'diuretics', label: 'Diuretics', get: (p) => p.diuretics, set: (p, v) => { p.diuretics = v; }, info: 'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites.' })),
    ));

    els.push(section('interventions', 'Drugs',
      ...Object.entries(DRUGS).map(([k, d]) => reg(toggle({ key: 'drugs', lockKey: 'drug:' + k, label: d.label, get: (p) => p.drugs[k], set: (p, v) => { p.drugs[k] = v; }, info: d.info })))));

    const tipsSlider = reg(slider({ key: 'tips', label: 'TIPS diameter', min: 6, max: 12, step: 0.5, get: (p) => p.tips.d, set: (p, v) => { p.tips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, defaultValue: 10, info: 'Resistance ∝ 1/d⁴ (Poiseuille): small diameter changes matter a lot.' }));
    const tipsSync = tipsSlider._sync;
    tipsSlider._sync = (pp) => { tipsSync(pp); tipsSlider.style.display = pp.tips.on ? '' : 'none'; };
    tipsSlider._sync(P);
    els.push(section('procedures', 'Procedures',
      reg(toggle({ key: 'tips', label: 'TIPS (right portal → right hepatic vein)', get: (p) => p.tips.on, set: (p, v) => { p.tips.on = v; }, info: 'Transjugular intrahepatic portosystemic shunt. Or drag one with the Stent tool.' })),
      tipsSlider,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => onAction({ kind: 'band' }) }, 'Band varices (EVL)'),
        h('button', { class: 'btn', onclick: () => onAction({ kind: 'paracentesisPrompt' }) }, 'Paracentesis…'),
        h('button', { class: 'btn', onclick: () => onAction({ kind: 'valsalva' }) }, 'Valsalva')),
      reg(toggle({ key: 'balloonEso', label: 'Esophageal balloon tamponade', get: (p) => p.balloonEso, set: (p, v) => { p.balloonEso = v; } })),
      reg(toggle({ key: 'balloonGas', label: 'Gastric balloon tamponade', get: (p) => p.balloonGas, set: (p, v) => { p.balloonGas = v; } })),
      reg(toggle({ key: 'occluded', lockKey: 'brto', label: 'BRTO (occlude gastrorenal shunt)', get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, info: 'Balloon-occluded retrograde transvenous obliteration of the gastrorenal shunt. Watch what happens to portal pressure.' })),
      reg(toggle({ key: 'portocaval', label: 'Portocaval shunt (surgical)', get: (p) => p.portocaval, set: (p, v) => { p.portocaval = v; }, info: 'End-to-side: total diversion, the liver loses all portal perfusion.' })),
      reg(toggle({ key: 'dsrs', label: 'Distal splenorenal (Warren) shunt', get: (p) => p.dsrs, set: (p, v) => { p.dsrs = v; }, info: 'Selective: decompresses gastroesophageal varices while SMV blood still perfuses the liver.' })),
      reg(toggle({ key: 'mesocaval', label: 'Mesocaval shunt', get: (p) => p.mesocaval, set: (p, v) => { p.mesocaval = v; } })),
    ));

    els.push(section('anatomy', 'Anatomical variants',
      reg(toggle({ key: 'spontaneous', label: 'Gastrorenal shunt present', get: (p) => p.spontaneous.C5, set: (p, v) => { p.spontaneous.C5 = v; }, info: 'Present in a subset of patients; drains fundal varices into the left renal vein.' })),
      reg(toggle({ key: 'spontaneous', label: 'Splenorenal shunt present', get: (p) => p.spontaneous.C6, set: (p, v) => { p.spontaneous.C6 = v; } })),
    ));

    els.push(section('env', 'Physiology & simulation',
      reg(toggle({ key: 'pulsatile', label: 'Pulsatile (beat-to-beat) mode', get: (p) => p.pulsatile, set: (p, v) => { p.pulsatile = v; }, info: 'Adds the right-atrial waveform (a, x, v, y). Needed for Doppler pulsatility.' })),
      reg(toggle({ key: 'respiration', label: 'Respiration', get: (p) => p.respiration, set: (p, v) => { p.respiration = v; } })),
      reg(slider({ key: 'respDepth', label: 'Breath depth', min: 0, max: 3, step: 0.1, get: (p) => p.respDepth, set: (p, v) => { p.respDepth = v; }, format: mult, defaultValue: 1 })),
      reg(toggle({ key: 'deterministicRupture', label: 'Deterministic rupture', get: (p) => p.deterministicRupture, set: (p, v) => { p.deterministicRupture = v; }, info: 'Rupture exactly when wall tension exceeds the critical value (instead of a random hazard).' })),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', onclick: () => onAction({ kind: 'rupture', site: 'VAR', tear: 0.6 }) }, 'Trigger variceal rupture')),
      h('p', { class: 'disclaimer' }, 'Educational simulation. Simplified model; values are illustrative and must not be used for diagnosis or treatment decisions.'),
    ));
    return els;
  }

  // ── Selection panels ──────────────────────────────
  function edgePanel(id) {
    const e = EDGES[EI[id]];
    if (!e) return globalPanel();
    const P = store.get().params;
    const k = EI[id];
    const fromN = NODES[NI[e.from]], toN = NODES[NI[e.to]];
    const isColl = e.kind === 'collateral', isArt = e.kind === 'arteriole' || e.kind === 'artery';
    const kicker = isColl ? `Collateral ${e.code}` : isArt ? 'Artery' : e.kind === 'liver' ? 'Liver microcirculation' : e.kind === 'shunt' ? 'Shunt' : 'Vein';
    const dir = (f) => {
      const q = f.Qf[k];
      const ref = store.get().healthy?.Q?.[k] ?? 1;
      if (Math.abs(q) < 0.05) return h('span', { class: 'pill warn' }, 'stagnant');
      if (q < -Math.max(0.12, 0.02 * Math.abs(ref))) return h('span', { class: 'pill rev' }, '⟲ reversed');
      return h('span', { class: 'pill ok' }, '→ physiological');
    };
    const dirEl = h('span');
    live.push([dirEl, (f) => { dirEl.replaceChildren(dir(f)); return null; }]);
    const R = (f) => { const q = f.Q[k]; const dp = f.P[NI[e.from]] - f.P[NI[e.to]]; return Math.abs(q) > 1e-3 ? `${fmt(dp / (q * 0.06), 2)} WU` : '∞'; };
    const els = [
      h('div', { class: 'insp-head' }, h('div', { style: { flex: 1, minWidth: 0 } }, h('span', { class: 'kicker' }, kicker), h('h2', { title: e.label }, e.label)),
        h('button', { class: 'btn', onclick: () => { store.set({ selection: null }); } }, 'Global'), h('button', { class: 'btn icon', 'aria-label': 'Close inspector', onclick: onClose, title: 'Close' }, '×')),
      section('live', 'Live values',
        h('div', {}, dirEl),
        h('dl', { class: 'kv' },
          h('dt', {}, `Pressure: ${fromN.label}`), h('dd', {}, liveText((f) => fp(f.P[NI[e.from]]).join(' '))),
          h('dt', {}, `Pressure: ${toN.label}`), h('dd', {}, liveText((f) => fp(f.P[NI[e.to]]).join(' '))),
          h('dt', {}, 'Pressure drop ΔP'), h('dd', {}, liveText((f) => `${fmt(f.P[NI[e.from]] - f.P[NI[e.to]], 1)} mmHg`)),
          h('dt', {}, 'Flow'), h('dd', {}, liveText((f) => ff(f.Q[k] * 0.06).join(' '))),
          h('dt', {}, 'Mean velocity'), h('dd', {}, liveText((f) => { const D = Math.max(0.5, f.D[k]) / 10; return `${fmt(f.Q[k] / (Math.PI * D * D / 4), 1)} cm/s`; })),
          h('dt', {}, 'Diameter'), h('dd', {}, liveText((f) => `${fmt(f.D[k], 1)} mm`)),
          h('dt', {}, 'Resistance'), h('dd', {}, liveText(R)),
          isColl ? [h('dt', {}, 'Recruitment'), h('dd', {}, liveText((f) => `${Math.round(clamp((f.slow.d[id] - e.dMax * COLLATERAL_DMIN_RATIO) / (e.dMax * (1 - COLLATERAL_DMIN_RATIO)), 0, 1) * 100)} %`))] : null,
        ),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onclick: () => { onAction({ kind: 'probe', id }); onOpenTab('doppler'); } }, 'Doppler here'),
          whyBtn(['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L'].includes(id) ? 'pvFlow' : isColl ? 'shunt' : 'pv', 'Why this pressure?')),
      ),
    ];
    const ctl = [];
    if (!isArt && e.kind !== 'shunt' && e.kind !== 'liver') {
      ctl.push(reg(slider({ key: 'stenosis', label: 'Stenosis', min: 0, max: 1, step: 0.01, get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; }, format: (v) => `${Math.round(v * 100)} %`, defaultValue: 0,
        info: 'Lumen narrowing. Resistance rises with (1 − s)⁻⁴ (Poiseuille) plus turbulence above 70 %.' })));
      ctl.push(reg(slider({ key: 'thrombus', label: 'Thrombus', min: 0, max: 1, step: 0.01, get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; }, format: (v) => `${Math.round(v * 100)} %`, defaultValue: 0 })));
    }
    if (isColl) {
      ctl.push(reg(toggle({ key: 'occluded', label: 'Occlude (plug / BRTO)', get: (p) => !!p.occluded[id], set: (p, v) => { if (v) p.occluded[id] = true; else delete p.occluded[id]; } })));
      if (e.spontaneous) ctl.push(reg(toggle({ key: 'spontaneous', label: 'Present in this patient', get: (p) => p.spontaneous[id], set: (p, v) => { p.spontaneous[id] = v; } })));
      ctl.push(h('p', { class: 'note' }, 'Collaterals grow on the Months clock when the portal-to-systemic gradient exceeds its healthy value by ≈ 7 mmHg. After decompression they regress slowly.'));
    }
    if (e.kind === 'liver' && (e.lobe === 'R' || e.lobe === 'L')) {
      ctl.push(reg(slider({ key: 'fibrosis', label: `Fibrosis multiplier (${e.zone === 'pre' ? 'presinusoidal' : e.zone === 'sin' ? 'sinusoidal' : 'postsinusoidal'}, ${e.lobe === 'R' ? 'right' : 'left'} lobe)`, min: 1, max: 80, step: 0.5,
        get: (p) => p.fibrosis[e.lobe][e.zone], set: (p, v) => { p.fibrosis[e.lobe][e.zone] = v; }, format: (v) => `×${v.toFixed(1)}`, defaultValue: 1 })));
    }
    if (id === 'TIPS') {
      ctl.push(reg(slider({ key: 'tips', label: 'TIPS diameter', min: 6, max: 12, step: 0.5, get: (p) => p.tips.d, set: (p, v) => { p.tips.d = v; }, format: (v) => `${v.toFixed(1)} mm`, defaultValue: 10 })));
      ctl.push(h('button', { class: 'btn danger', onclick: () => { updateParams({ tips: { on: false } }, { label: 'Remove TIPS' }); store.set({ selection: null }); } }, 'Remove TIPS'));
    }
    if (['S_PC', 'S_DSR', 'S_MC'].includes(id)) {
      const key = { S_PC: 'portocaval', S_DSR: 'dsrs', S_MC: 'mesocaval' }[id];
      ctl.push(h('button', { class: 'btn danger', onclick: () => { updateParams({ [key]: false }, { label: 'Remove shunt' }); store.set({ selection: null }); } }, 'Take down shunt'));
    }
    if (['RHV_IVC', 'MHV_IVC', 'LHV_IVC'].includes(id)) {
      const vein = id[0];
      ctl.push(h('button', { class: 'btn', onclick: () => { updateParams({ catheter: { vein, wedged: false } }, { label: 'Catheter placed' }); onOpenTab('hvpg'); } }, 'Place hepatic-vein catheter here'));
    }
    if (ctl.length) els.push(section('ctl', 'Manipulate', ...ctl));
    els.push(section('about', 'About this vessel', h('p', { class: 'ctl-sub' }, aboutEdge(e))));
    openSections.add('live'); openSections.add('ctl');
    return els;
  }

  function nodePanel(id) {
    const n = NODES[NI[id]];
    const els = [
      h('div', { class: 'insp-head' }, h('div', { style: { flex: 1, minWidth: 0 } }, h('span', { class: 'kicker' }, 'Compartment'), h('h2', {}, n.label)),
        h('button', { class: 'btn', onclick: () => store.set({ selection: null }) }, 'Global'), h('button', { class: 'btn icon', 'aria-label': 'Close inspector', onclick: onClose }, '×')),
      section('live', 'Live values',
        h('dl', { class: 'kv' },
          h('dt', {}, 'Pressure'), h('dd', {}, liveText((f) => fp(f.P[NI[id]]).join(' '))),
          h('dt', {}, 'Healthy'), h('dd', {}, liveText(() => { const v = store.get().healthy?.P?.[NI[id]]; return v != null ? `${fmt(v, 1)} mmHg` : '—'; })),
          h('dt', {}, 'External pressure'), h('dd', {}, liveText((f) => `${fmt(f.ext[NI[id]], 1)} mmHg (Δ)`)),
          h('dt', {}, 'Transmural'), h('dd', {}, liveText((f) => `${fmt(f.P[NI[id]] - f.ext[NI[id]], 1)} mmHg`)),
        ),
        h('div', { class: 'btn-row' }, whyBtn(id === 'RA' ? 'ra' : id === 'AO' ? 'map' : id === 'VAR' ? 'varix' : 'pv')),
      ),
      section('connections', 'Connections', h('div', { class: 'btn-row' },
        EDGES.filter((e) => (e.from === id || e.to === id) && e.kind !== 'wedge').map((e) => h('button', { class: 'btn', onclick: () => store.set({ selection: { type: 'edge', id: e.id } }) }, e.label || e.id)))),
    ];
    openSections.add('live'); openSections.add('connections');
    return els;
  }

  function aboutEdge(e) {
    const txt = {
      PV_TRUNK: 'Carries ~75 % of liver blood flow (≈1.1 L/min). Normal mean velocity 15–40 cm/s, hepatopetal. The portal system has no valves: flow goes wherever the gradient points.',
      C1a: 'Left gastric (coronary) vein feeding the esophageal submucosal plexus: the source of esophageal varices.',
      C1b: 'Esophageal varices drain to the azygos vein and SVC. Varix wall tension follows Laplace: T = ΔP·r / w.',
      C2: 'Short and posterior gastric veins connect the splenic vein to the fundus: the route of isolated gastric varices in splenic vein thrombosis.',
      C3: 'The recanalized paraumbilical vein runs from the LEFT portal vein along the falciform ligament to the umbilicus (caput medusae, Cruveilhier–Baumgarten murmur).',
      C4: 'Superior rectal (portal) ↔ middle/inferior rectal (systemic) veins: anorectal varices, not hemorrhoids.',
      C5: 'Gastrorenal shunt: fundal varices → left inferior phrenic/adrenal → left renal vein. The target of BRTO.',
      C6: 'Spontaneous splenorenal shunt: large, can steal portal flow and cause encephalopathy.',
      C7: 'Retroperitoneal veins of Retzius connect mesenteric veins to lumbar/renal veins.',
      C8: 'Periportal (pericholedochal) collaterals bypass an occluded portal vein: cavernous transformation, which is hepatopetal.',
      C9: 'Ascending lumbar–azygos route decompresses the IVC when it is obstructed.',
      TIPS: 'A covered stent from a portal branch to a hepatic vein. Target portosystemic gradient < 12 mmHg. Costs: encephalopathy, liver hypoperfusion, higher cardiac preload.',
      CAUD: 'The caudate lobe drains directly into the IVC through its own short veins, so it is spared (and hypertrophies) in Budd–Chiari syndrome.',
      PRE_R: 'Presinusoidal segment: portal venules in the portal tract. Blocked in schistosomiasis and other non-cirrhotic portal hypertension.',
      SIN_RR: 'Sinusoids: normally low-resistance, fenestrated, compliant. In cirrhosis, collagen in the space of Disse, stellate-cell contraction and capillarization raise resistance.',
    };
    return txt[e.id] || txt[e.id.replace(/_L$|L$/, '')] || `${e.label}. Connects ${NODES[NI[e.from]].label} → ${NODES[NI[e.to]].label} (physiological flow direction).`;
  }

  // ── Render ────────────────────────────────────────
  function render() {
    if (store.get().mode === 'cases') return; // the case panel owns this element
    live = []; syncers.length = 0;
    const sel = store.get().selection;
    let els;
    if (!sel) els = globalPanel();
    else if (sel.type === 'edge') els = edgePanel(sel.id);
    else if (sel.type === 'node') els = nodePanel(sel.id);
    else els = globalPanel();
    const top = root.scrollTop;
    root.replaceChildren(...els.filter(Boolean));
    if (sel === lastSel) root.scrollTop = top;
    lastSel = sel;
    if (store.get().frame) update(store.get().frame);
  }

  function update(f) {
    for (const [el, fn] of live) { const v = fn(f); if (v != null && el.textContent !== v) el.textContent = v; }
  }

  store.on('selection', render);
  store.on('locked', render);
  store.on('params', () => { const p = store.get().params; for (const s of syncers) s._sync(p); });
  render();
  return { render, update };
}

export function activeInterventions(p) {
  const out = [];
  const add = (label, remove) => out.push({ label, remove });
  if (p.cirrhosis > 0) add(`Cirrhosis ${Math.round(p.cirrhosis * 100)} %`, (q) => { q.cirrhosis = 0; });
  for (const lobe of ['R', 'L']) for (const z of ['pre', 'sin', 'post']) if (p.fibrosis[lobe][z] !== 1) add(`${z} fibrosis ${lobe} ×${p.fibrosis[lobe][z].toFixed(0)}`, (q) => { q.fibrosis[lobe][z] = 1; });
  const lab = (id) => EDGES[EI[id]]?.label || id;
  for (const [id, v] of Object.entries(p.stenosis)) add(`${lab(id)} stenosis ${Math.round(v * 100)} %`, (q) => { delete q.stenosis[id]; });
  for (const [id, v] of Object.entries(p.thrombus)) add(`${lab(id)} thrombus ${Math.round(v * 100)} %`, (q) => { delete q.thrombus[id]; });
  for (const [k, on] of Object.entries(p.drugs)) if (on) add(DRUGS[k].label, (q) => { q.drugs[k] = false; });
  if (p.tips.on) add(`TIPS ${p.tips.d} mm`, (q) => { q.tips.on = false; });
  if (p.portocaval) add('Portocaval shunt', (q) => { q.portocaval = false; });
  if (p.dsrs) add('Distal splenorenal shunt', (q) => { q.dsrs = false; });
  if (p.mesocaval) add('Mesocaval shunt', (q) => { q.mesocaval = false; });
  if (p.balloonEso) add('Esophageal balloon', (q) => { q.balloonEso = false; });
  if (p.balloonGas) add('Gastric balloon', (q) => { q.balloonGas = false; });
  for (const id of Object.keys(p.occluded)) add(`${lab(id)} occluded`, (q) => { delete q.occluded[id]; });
  if (p.splanchnicTone !== 1) add(`Splanchnic tone ×${p.splanchnicTone.toFixed(2)}`, (q) => { q.splanchnicTone = 1; });
  if (p.systemicTone !== 1) add(`Systemic tone ×${p.systemicTone.toFixed(2)}`, (q) => { q.systemicTone = 1; });
  if (p.contractility !== 1) add(`Contractility ${Math.round(p.contractility * 100)} %`, (q) => { q.contractility = 1; });
  if (p.tr > 0) add(`TR ${Math.round(p.tr * 100)} %`, (q) => { q.tr = 0; });
  if (p.pericardial > 0) add(`Pericardial ${Math.round(p.pericardial * 100)} %`, (q) => { q.pericardial = 0; });
  if (p.apShunt > 0) add(`AP shunting ${Math.round(p.apShunt * 100)} %`, (q) => { q.apShunt = 0; });
  if (p.albumin !== 4) add(`Albumin ${p.albumin.toFixed(1)}`, (q) => { q.albumin = 4; });
  if (p.diuretics) add('Diuretics', (q) => { q.diuretics = false; });
  if (p.anticoag) add('Anticoagulation', (q) => { q.anticoag = false; });
  if (p.spontaneous.C5) add('Gastrorenal shunt present', (q) => { q.spontaneous.C5 = false; });
  if (p.spontaneous.C6) add('Splenorenal shunt present', (q) => { q.spontaneous.C6 = false; });
  if (p.catheter.vein) add(`Catheter in ${p.catheter.vein}HV${p.catheter.wedged ? ' (wedged)' : ''}`, (q) => { q.catheter = { vein: null, wedged: false }; });
  return out;
}
