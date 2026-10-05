// Verbs on the anatomy (object → verb). Every manipulation the learner can make lives here once:
// the action card beside a selected structure, the Treat section of the patient chart, the command
// palette, lessons and cases all call these same verbs, so each change is made one way and lands
// in the timeline as one entry.

import { EDGES, NODES, SHUNT_PORTAL, SHUNT_SYSTEMIC, dMinOf, edgePresent } from '../engine/topology.js?v=29d10ad9ef';
import { DRUGS } from '../engine/scenario.js?v=304cd180db';
import { store, updateParams } from './store.js?v=23552bd900';
import { fmt, fmtFlow, clamp, toast } from './util.js?v=d90a6074b7';
import { aboutVessel, aboutOrgan } from './about.js?v=8214f717c4';
import { lobuleState } from './lobule-model.js?v=7d74747a69';
import { LABEL_VESSEL } from './anatomy.js?v=dbe096be7b';

export const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// Lessons and cases name the tools a step allows; these are the verbs they unlock.
const TOOL_VERB = { pinch: 'narrow', thrombus: 'clot', fibrosis: 'fibrosis', stent: 'shunt', band: 'band', occlude: 'occlude', balloon: 'balloon', catheter: 'wedge', doppler: 'doppler', endoscope: 'endoscope', needle: 'paracentesis' };
export const toolsToVerbs = (list) => (list ? [...new Set(list.map((t) => TOOL_VERB[t] || t).filter((v) => v !== 'select' && v !== 'probe'))] : null);

/** Is a verb available now? Lessons and cases restrict verbs; they may also unlock a parameter. */
export function verbEnabled(id, key) {
  const st = store.get();
  const allowed = st.allowedVerbs;
  if (!allowed && !st.locked) return true;
  if (allowed?.includes(id)) return true;
  if (key && st.locked && !st.locked.has('*') && st.locked.has(key)) return true;
  if (!allowed) return !(key && st.locked && ((!st.locked.has('*') && !st.locked.has(key)) || st.locked.has('!' + key)));
  return false;
}

const pct = (v) => `${Math.round(v * 100)} %`;
const mult = (v) => `×${v.toFixed(v < 10 ? 1 : 0)}`;
const HEP_VEIN = { RHV_IVC: 'R', POST_R_RHV: 'R', MHV_IVC: 'M', POST_R_MHV: 'M', POST_L_MHV: 'M', LHV_IVC: 'L', POST_L_LHV: 'L' };
const WEDGE_OF = { W_R: 'RHV_IVC', W_M: 'MHV_IVC', W_L: 'LHV_IVC' };

// A label or station stands for a structure: clicking "Portal vein" opens the portal vein's card.
const NODE_SEL = {
  CONF: ['edge', 'PV_TRUNK'], PVH: ['edge', 'PV_TRUNK'], SV: ['edge', 'SV_CONF'], SMV: ['edge', 'SMV_CONF'], IMV: ['edge', 'V_IMV'], LGV: ['edge', 'LGV_CONF'],
  RPV: ['edge', 'PVH_R'], LPV: ['edge', 'PVH_L'], RHV: ['edge', 'RHV_IVC'], MHV: ['edge', 'MHV_IVC'], LHV: ['edge', 'LHV_IVC'], IVCS: ['edge', 'IVCS_RA'], IVCI: ['edge', 'IVC_IS'],
  SVC: ['edge', 'SVC_RA'], AZY: ['edge', 'AZY_SVC'], ILI: ['edge', 'ILI_IVC'], LRV: ['edge', 'LRV_IVC'], KID_L: ['edge', 'V_KID_L'], COL: ['edge', 'V_COL'], INT: ['edge', 'V_INT'],
  SIN_R: ['organ', 'liver'], SIN_L: ['organ', 'liver'], CV_R: ['organ', 'liver'], CV_L: ['organ', 'liver'], HA: ['organ', 'liver'],
  RA: ['organ', 'heart'], VAR: ['organ', 'varices'], GV: ['organ', 'gastric'], STO: ['organ', 'gastric'], SPL: ['organ', 'spleen'], EPI: ['organ', 'abdomen'],
};
/** The structure a selection stands for (liver micro-vessels are the liver; stations their vessel). */
export function normalizeSel(sel) {
  if (!sel) return null;
  if (sel.type === 'node') {
    if (WEDGE_OF[sel.id]) return { type: 'edge', id: WEDGE_OF[sel.id] };
    const m = NODE_SEL[sel.id];
    return m ? (m[0] === 'edge' ? { type: 'edge', id: m[1] } : { type: 'organ', id: m[1] }) : null;
  }
  if (sel.type === 'edge') {
    const e = EDGES[EI[sel.id]];
    if (!e) return null;
    if (e.kind === 'liver') return { type: 'organ', id: 'liver', lobe: e.lobe === 'L' ? 'L' : e.lobe === 'R' ? 'R' : null, zone: e.zone };
  }
  return sel;
}

const ORGAN_TITLE = { liver: 'Liver', heart: 'Right heart', varices: 'Esophageal varices', gastric: 'Fundal varices', spleen: 'Spleen', abdomen: 'Abdomen & peritoneum' };
export const selTitle = (sel) => { const s = normalizeSel(sel); if (!s) return ''; if (s.type === 'lobule') return 'Lobule'; return s.type === 'organ' ? ORGAN_TITLE[s.id] || s.id : EDGES[EI[s.id]]?.label || s.id; };

/**
 * Build the action-card model for a selection.
 * ctx: { action, showPane, probe, startShunt, canShunt, select, zoomLobule, paneApi }
 */
export function cardFor(selIn, ctx) {
  const sel = normalizeSel(selIn);
  if (!sel) return null;
  if (sel.type === 'lobule') return lobuleCard(sel, ctx);
  if (sel.type === 'organ') {
    const c = organCard(sel, ctx);
    c?.verbs.unshift({ type: 'about', text: (f) => aboutOrgan(sel.id, f, store.get()) });
    return c;
  }
  const e = EDGES[EI[sel.id]];
  if (!e || e.kind === 'wedge') return null;
  const id = e.id, k = EI[id];
  const verbs = [];
  const isColl = e.kind === 'collateral', isShunt = e.kind === 'shunt', isArt = e.kind === 'artery' || e.kind === 'arteriole';
  const narrow = { type: 'slider', id: 'narrow', key: 'stenosis', label: 'Narrow', icon: 'pinch', min: 0, max: 0.95, step: 0.01, format: pct, def: 0,
    get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0.004) delete p.stenosis[id]; else p.stenosis[id] = +v.toFixed(2); }, hist: `${e.label}: stenosis`,
    info: 'Lumen narrowing. Resistance rises with (1 − s)⁻⁴ (Poiseuille).' };
  const clot = { type: 'slider', id: 'clot', key: 'thrombus', label: 'Clot', icon: 'clot', min: 0, max: 1, step: 0.01, format: pct, def: 0,
    get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0.004) delete p.thrombus[id]; else p.thrombus[id] = +v.toFixed(2); }, hist: `${e.label}: thrombus`,
    info: 'Occlusive thrombus. With anticoagulation it recanalizes slowly on the disease clock.' };
  const doppler = { type: 'button', id: 'doppler', label: 'Doppler', icon: 'doppler', run: () => { ctx.probe(id); ctx.showPane('doppler'); ctx.select(null); } };
  const shunt = ctx.canShunt(id) ? { type: 'button', id: 'shunt', label: 'Create shunt…', icon: 'stent', run: () => ctx.startShunt(id) } : null;
  let kicker = 'Vein', why = 'pv';
  if (isArt) {
    kicker = 'Artery';
    verbs.push({ type: 'stat', label: 'Flow', value: (f) => `${fmtFlow(f.Q[k] * 0.06)} L/min` });
  } else if (isColl) {
    kicker = `Collateral · ${e.code || id}`; why = 'shunt';
    verbs.push({ type: 'stat', label: 'Recruitment', value: (f) => `${Math.round(clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1) * 100)} %` });
    verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: id === 'C5' ? 'Occlude (BRTO)' : 'Occlude (plug)', icon: 'occlude',
      get: (p) => !!p.occluded[id], set: (p, v) => { if (v) p.occluded[id] = true; else delete p.occluded[id]; }, hist: `${e.label}: occlusion` });
    if (e.spontaneous || e.variant) verbs.push({ type: 'toggle', id: 'variant', key: 'spontaneous', label: 'Present in this patient', get: (p) => edgePresent(e, p), set: (p, v) => { p.spontaneous[id] = v; }, hist: `${e.label} present` });
    if (id === 'C1a' || id === 'C1b') verbs.push(...varixVerbs('eso', ctx));
    if (id === 'C2' || id === 'C2b' || id === 'C5') verbs.push(...varixVerbs('gas', ctx));
    verbs.push(doppler);
  } else if (isShunt) {
    kicker = 'Shunt'; why = 'shunt';
    if (id === 'TIPS') {
      verbs.push({ type: 'slider', id: 'diameter', key: 'tips', label: 'Stent diameter', min: 6, max: 12, step: 0.5, def: 10, format: (v) => `${v.toFixed(1)} mm`,
        get: (p) => p.tips.d, set: (p, v) => { p.tips.d = v; }, hist: 'TIPS diameter', info: 'Resistance ∝ 1/d⁴: an 8 mm stent has well under half the conductance of a 10 mm one.' });
      verbs.push({ type: 'button', id: 'remove', key: 'tips', label: 'Remove TIPS', icon: 'close', danger: true, run: () => { updateParams({ tips: { on: false } }, { label: 'Remove TIPS' }); ctx.select(null); } });
    } else if (e.shunt === 'custom') {
      verbs.push({ type: 'slider', id: 'diameter', key: 'customShunts', label: 'Shunt diameter', min: 4, max: 16, step: 0.5, def: 10, format: (v) => `${v.toFixed(1)} mm`,
        get: (p) => p.customShunts?.[id] || 10, set: (p, v) => { p.customShunts = { ...(p.customShunts || {}), [id]: v }; }, hist: `${e.label} diameter` });
      verbs.push({ type: 'button', id: 'remove', key: 'customShunts', label: 'Take down shunt', icon: 'close', danger: true, run: () => { updateParams((p) => { const c = { ...(p.customShunts || {}) }; delete c[id]; p.customShunts = c; return p; }, { label: `Remove ${e.label}` }); ctx.select(null); } });
    } else if (['S_PC', 'S_DSR', 'S_MC'].includes(id)) {
      const key = { S_PC: 'portocaval', S_DSR: 'dsrs', S_MC: 'mesocaval' }[id];
      verbs.push({ type: 'button', id: 'remove', key, label: 'Take down shunt', icon: 'close', danger: true, run: () => { updateParams({ [key]: false }, { label: `Remove ${e.label}` }); ctx.select(null); } });
    }
    verbs.push(doppler);
  } else {
    kicker = SHUNT_PORTAL.includes(e.from) || SHUNT_PORTAL.includes(e.to) ? 'Vein · portal system' : 'Vein · systemic';
    if (HEP_VEIN[id]) { kicker = 'Hepatic vein'; why = 'hvpg'; }
    if (['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L'].includes(id)) why = 'pvFlow';
    verbs.push(narrow, clot);
    verbs.push(doppler);
    if (shunt) verbs.push(shunt);
    if (id === 'SV_CONF' || id === 'V_SPL') verbs.push({ type: 'link', label: 'Spleen', run: () => ctx.select({ type: 'organ', id: 'spleen' }) });
  }
  // Dye into this vessel, beside Doppler: a few seconds a press, or as long as it is held.
  if (ctx.injectDye) {
    const dye = { type: 'dye', id: 'dye', label: 'Inject dye', icon: 'drop', run: (o) => ctx.injectDye(id, o), release: () => ctx.releaseDye(), busy: () => ctx.dyeInjecting(), showIf: () => ctx.canDye?.() !== false };
    const at = verbs.indexOf(doppler);
    if (at >= 0) verbs.splice(at + 1, 0, dye); else verbs.push(dye);
  }
  verbs.unshift({ type: 'about', text: (f) => aboutVessel(e, f, store.get()) });
  return {
    key: 'e:' + id, sel, kicker, title: e.label, why, edge: id, verbs,
    value: (f, lens, ref) => edgeValue(e, f, lens, ref),
    status: (f) => {
      if (isArt) return null;
      const q = f.Qf ? f.Qf[k] : f.Q[k];
      const refQ = store.get().healthy?.Q?.[k] ?? 1;
      if (Math.abs(q) < 0.05) return ['warn', 'Stagnant'];
      if (q < -Math.max(0.12, 0.02 * Math.abs(refQ))) return ['rev', 'Reversed flow'];
      return ['ok', 'Physiological direction'];
    },
  };
}

// A vessel that names a station on the figure (the portal vein names the confluence) reads that
// station's pressure, as its label and the readouts do; any other vessel reads the mean of its ends.
// Both use the breath-smoothed pressures the labels show, so the card never disagrees with them.
const STATION_OF = Object.fromEntries(Object.entries(LABEL_VESSEL).map(([n, e]) => [e, n]));
function edgeValue(e, f, lens, ref) {
  const k = EI[e.id], PF = f.Pf || f.P, st = STATION_OF[e.id];
  const P1 = PF[NI[e.from]], P2 = PF[NI[e.to]], P = st ? PF[NI[st]] : (P1 + P2) / 2;
  const q = (f.Qf ? f.Qf[k] : f.Q[k]) * 0.06;
  if (lens === 'flow') {
    const r = store.get().healthy?.Q?.[k];
    const d = r != null && Math.abs(r) > 0.3 ? ((Math.abs(q) - Math.abs(r * 0.06)) / Math.abs(r * 0.06)) * 100 : null;
    return { v: fmtFlow(Math.abs(q)), u: 'L/min', d: d != null && Math.abs(d) >= 5 ? `${d > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d))} %` : null, up: d > 0 };
  }
  if (lens === 'velocity') { const D = Math.max(0.5, f.D[k]) / 10; return { v: fmt(Math.abs((q / 0.06) / (Math.PI * D * D / 4)), 0), u: 'cm/s' }; }
  if (lens === 'drop') return { v: fmt(P1 - P2, 1), u: 'mmHg drop' };
  const r = ref ? (st ? ref[NI[st]] : (ref[NI[e.from]] + ref[NI[e.to]]) / 2) : null;
  return { v: fmt(P, 1), u: 'mmHg', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r };
}

function varixVerbs(site, ctx) {
  const eso = site === 'eso';
  const out = [];
  if (eso) out.push({ type: 'button', id: 'band', label: 'Band', icon: 'band', run: () => { ctx.action({ kind: 'band' }); toast('Band placed on an esophageal varix column.'); }, note: (f) => (f.bands ? `${Math.round(f.bands)} band${f.bands >= 1.5 ? 's' : ''} placed` : null) });
  out.push({ type: 'button', id: 'endoscope', label: 'Endoscope', icon: 'endoscope', run: () => { ctx.paneApi('endoscopy')?.setView?.(eso ? 'eso' : 'fundus'); ctx.showPane('endoscopy'); } });
  const key = eso ? 'balloonEso' : 'balloonGas';
  out.push({ type: 'toggle', id: 'balloon', key, label: eso ? 'Esophageal balloon' : 'Gastric balloon', icon: 'balloon', get: (p) => !!p[key], set: (p, v) => { p[key] = v; }, hist: eso ? 'Esophageal balloon' : 'Gastric balloon' });
  return out;
}

function organCard(sel, ctx) {
  const id = sel.id;
  const stat = (label, value) => ({ type: 'stat', label, value });
  if (id === 'liver') {
    return {
      key: 'o:liver', sel, kicker: 'Organ', title: 'Liver', why: 'hvpg',
      value: (f, lens, ref) => { const P = (f.Pf || f.P)[NI.SIN_R]; const r = ref?.[NI.SIN_R]; return { v: fmt(P, 1), u: 'mmHg sinusoids', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r }; },
      verbs: [
        { type: 'slider', id: 'cirrhosis', key: 'cirrhosis', label: 'Cirrhosis', icon: 'liver', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, hist: 'Cirrhosis',
          sub: '40 % compensated · 60 % CSPH · 85 % decompensated', info: 'Sinusoidal fibrosis, capillarization, a stiffer liver and arterioportal shunting. Jump months ahead on the timeline to watch collaterals open.' },
        { type: 'button', id: 'lobule', label: 'Open the lobule view', icon: 'explore', run: () => ctx.zoomLobule(), note: () => 'Fibrosis of the portal tract, sinusoids or central vein is set there, on each part’s card.' },
        stat('HVPG', (f) => `${fmt(f.metrics.hvpg, 1)} mmHg`),
      ],
    };
  }
  if (id === 'heart') {
    const sl = (vid, key, label, min, max, def, info) => ({ type: 'slider', id: vid, key, label, min, max, step: 0.01, def, format: pct, get: (p) => p[key], set: (p, v) => { p[key] = v; }, hist: label, info });
    return {
      key: 'o:heart', sel, kicker: 'Organ', title: 'Right heart', why: 'ra',
      value: (f, lens, ref) => { const P = (f.Pf || f.P)[NI.RA]; const r = ref?.[NI.RA]; return { v: fmt(P, 1), u: 'mmHg RA', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r }; },
      verbs: [
        sl('contractility', 'contractility', 'Contractility', 0.15, 1.6, 1, 'Right-ventricular pump strength (Frank–Starling).'),
        sl('tr', 'tr', 'Tricuspid regurgitation', 0, 1, 0, 'Systolic backflow into the right atrium: large v-waves reach the liver.'),
        sl('pericardial', 'pericardial', 'Pericardial constraint', 0, 1, 0, 'Constrictive pericarditis limits filling.'),
        stat('Cardiac output', (f) => `${fmt(f.metrics.co, 1)} L/min`),
      ],
    };
  }
  if (id === 'varices' || id === 'gastric') {
    const eso = id === 'varices';
    const vx = (f) => (eso ? f.metrics.varix : f.metrics.gastricVarix);
    const verbs = varixVerbs(eso ? 'eso' : 'gas', ctx);
    if (!eso) verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: 'Occlude the gastrorenal shunt (BRTO)', icon: 'occlude', showIf: (p) => !!p.spontaneous.C5, get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, hist: 'BRTO' });
    verbs.push(stat('Grade', (f) => { const v = vx(f); return v.d < 2.4 ? 'none' : `${v.grade.code} · ${fmt(v.d, 1)} mm`; }), stat('Wall tension', (f) => `${Math.round(vx(f).ratio * 100)} % of rupture`));
    if (eso) verbs.push({ type: 'link', label: 'Coronary vein', run: () => ctx.select({ type: 'edge', id: 'LGV_CONF' }) });
    else verbs.push({ type: 'link', label: 'Short gastric veins', run: () => ctx.select({ type: 'edge', id: 'C2' }) });
    return {
      key: 'o:' + id, sel, kicker: 'Collateral bed', title: eso ? 'Esophageal varices' : 'Fundal varices', why: 'varix', verbs,
      value: (f, lens, ref) => { const n = NI[eso ? 'VAR' : 'GV']; const P = (f.Pf || f.P)[n]; const r = ref?.[n]; return { v: fmt(P, 1), u: 'mmHg', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r }; },
      status: (f) => (f.metrics.bleeding && (f.metrics.bleeding.site === 'GV') === !eso ? ['bad', 'Bleeding'] : vx(f).redWale ? ['warn', 'Red wale signs'] : null),
    };
  }
  if (id === 'spleen') {
    return {
      key: 'o:spleen', sel, kicker: 'Organ', title: 'Spleen', why: 'spleen',
      value: (f) => ({ v: fmt(f.metrics.spleen.length, 1), u: 'cm long' }),
      verbs: [
        stat('Platelets (illustrative)', (f) => `${Math.round(f.metrics.spleen.platelets)} ×10⁹/L`),
        { type: 'slider', id: 'clot', key: 'thrombus', label: 'Clot the splenic vein', icon: 'clot', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.thrombus.SV_CONF || 0,
          set: (p, v) => { if (v <= 0.004) delete p.thrombus.SV_CONF; else p.thrombus.SV_CONF = +v.toFixed(2); }, hist: 'Splenic vein thrombus', info: 'Sinistral (left-sided) portal hypertension: the spleen drains through the short gastric veins.' },
        { type: 'link', label: 'Splenic vein', run: () => ctx.select({ type: 'edge', id: 'SV_CONF' }) },
      ],
    };
  }
  return null;
}

// ── The lobule's parts (the lobule view selects them) ────────────────────
const CIRRHOSIS = { type: 'slider', id: 'cirrhosis', key: 'cirrhosis', label: 'Cirrhosis', icon: 'liver', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, hist: 'Cirrhosis',
  sub: '40 % compensated · 60 % CSPH · 85 % decompensated', info: 'Sinusoidal fibrosis, capillarization, a stiffer liver and arterioportal shunting.' };
const ZONE_NAME = { pre: 'portal tract', sin: 'sinusoids', post: 'central vein' };
/** Fibrosis in one zone of every lobule (both lobes: one lobule stands for the liver). */
export const fibrosisVerb = (z) => ({ type: 'slider', id: 'fibrosis', key: 'fibrosis', label: `Fibrosis · ${ZONE_NAME[z]}`, icon: 'fibrosis', min: 1, max: 80, step: 0.5, def: 1, format: mult,
  get: (p) => Math.max(p.fibrosis.R[z], p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; }, hist: `Fibrosis · ${ZONE_NAME[z]}`,
  info: { pre: 'Resistance before the sinusoids, as in schistosomiasis: portal pressure rises, the wedged pressure does not.', sin: 'Collagen in the space of Disse and closing fenestrae: resistance in the sinusoids themselves, read by HVPG.', post: 'Resistance at the central veins, as in sinusoidal obstruction syndrome: the sinusoids congest from the outflow side.' }[z] });
const ZONE_TEXT = ['Zone 1 (periportal) gets blood first, richest in oxygen and nutrients: the first to regenerate, the last to die in ischemia.', 'Zone 2 lies between: intermediate oxygen.', 'Zone 3 (centrilobular) gets blood last, poorest in oxygen: first to suffer in congestion, shock and drug toxicity (paracetamol).'];

function lobuleCard(sel, ctx) {
  const L = (f) => lobuleState(f, store.get());
  const mm = (v) => `${fmt(v, 1)} mmHg`, pc = (v) => `${Math.round(v * 100)} %`;
  const stat = (label, value) => ({ type: 'stat', label, value: (f) => value(L(f), f) });
  const pv = (v) => (f, lens, ref) => { const m = L(f); const x = v(m); const r = ref ? v({ P1: ref[NI.RPV], P2: ref[NI.SIN_R], P3: ref[NI.CV_R] }) : null; return { v: fmt(x, 1), u: 'mmHg', d: r != null && Math.abs(x - r) >= 1 ? `${x > r ? '▲' : '▼'} ${fmt(Math.abs(x - r), 0)}` : null, up: r != null && x > r }; };
  const about = (fn) => ({ type: 'about', text: (f) => (f ? fn(L(f)) : []) });
  // The lobule's parts have no page of their own in the side panel: no Details link.
  const base = { key: 'l:' + sel.part + ':' + (sel.tube ?? sel.tri ?? sel.zone ?? ''), sel, kicker: 'Lobule', why: 'hvpg', noDetails: true };
  switch (sel.part) {
    case 'triad': return { ...base, title: 'Portal triad', value: pv((m) => m.P1),
      verbs: [about((m) => ['Blood enters the lobule here: portal venous blood (about three quarters) and hepatic arterial blood, with a bile ductule carrying bile the other way. Inlet venules run along the lobule’s edge and feed the sinusoids.',
        m.fibPre > 0.1 ? `Portal fibrosis (resistance ×${fmt(m.zone.pre, 1)}) narrows the venules before the sinusoids: pre-sinusoidal portal hypertension, with a near-normal wedged pressure.` : '',
        m.portal < 0 ? 'Portal flow is reversed: blood leaves the liver through the portal venules (hepatofugal flow).' : ''].filter(Boolean)),
      fibrosisVerb('pre'), stat('Portal inflow', (m) => (m.portal < 0 ? 'reversed' : pc(m.portal))), stat('Arterial inflow', (m) => pc(m.art))] };
    case 'in': return { ...base, title: 'Inlet venule', value: pv((m) => m.P1),
      verbs: [about((m) => ['A branch of the portal venule running along the lobule’s border, feeding the sinusoids it passes.', m.portal < 0 ? 'Flow here runs backwards (orange): arterial blood that entered the sinusoids drains out through the portal venules.' : ''].filter(Boolean)),
        fibrosisVerb('pre'), stat('Portal inflow', (m) => (m.portal < 0 ? 'reversed' : pc(m.portal)))] };
    case 'sin': case 'an': return { ...base, title: sel.part === 'an' ? 'Sinusoidal anastomosis' : 'Sinusoid', value: pv((m) => m.P2),
      verbs: [about((m) => [sel.part === 'an' ? 'A cross-link between sinusoids: blood can go around a local block, so one obstructed sinusoid does not starve the cells beyond it.'
        : 'A leaky capillary lined by fenestrated endothelium, between plates of hepatocytes one cell thick. Sinusoids merge toward the central vein, so blood speeds up as it goes; the highlighted path runs to the central vein.',
      m.fibSin > 0.1 ? 'Capillarization: the fenestrae close and collagen fills the space of Disse (pale sleeve), raising sinusoidal resistance: this is what raises HVPG in cirrhosis.' : '',
      m.congU > 0.1 ? 'Zone 3 sinusoids are dilated and packed with blood: the outflow is backing up.' : ''].filter(Boolean)),
      fibrosisVerb('sin'), CIRRHOSIS, stat('Into the central vein', (m) => mm(m.P3)), stat('Sinusoidal flow', (m) => pc(m.flow))] };
    case 'cv': return { ...base, title: 'Central vein', value: pv((m) => m.P3),
      status: (f) => (L(f).congU > 0.1 ? ['warn', 'Congested'] : null),
      verbs: [about((m) => ['Collects the sinusoids and drains into the hepatic veins. Zone 3 around it gets the least oxygen.',
        m.fibPost > 0.1 ? `Fibrosis around the central vein (×${fmt(m.zone.post, 1)}) makes the block post-sinusoidal.` : '',
        m.congU > 0.1 ? 'Raised outflow pressure congests zone 3 first: dilated sinusoids and dying cells give the “nutmeg” liver.' : ''].filter(Boolean)),
      fibrosisVerb('post'), stat('Hepatic vein', (m) => mm(m.P4)), stat('Above normal', (m) => (m.congU > 0.05 ? `+${fmt(m.cong, 1)} mmHg` : 'none'))] };
    case 'ha': return { ...base, title: 'Hepatic arteriole', value: (f) => ({ v: pc(L(f).art), u: 'of normal flow' }),
      verbs: [about((m) => ['Oxygen-rich blood that empties into the first stretch of the sinusoids (zone 1).', m.art > 1.15 ? `Hepatic arterial buffer response: with less portal flow, less adenosine is washed out and the arteriole dilates (arterial flow ×${fmt(m.art, 1)}).` : ''].filter(Boolean))] };
    case 'bd': return { ...base, title: 'Bile ductule', value: () => ({ v: 'Bile', u: 'flows out to the triad' }),
      verbs: [about(() => ['Bile made by hepatocytes flows in canaliculi between them, toward the triad: against the blood. Not part of the circulation, but it marks the portal tract.'])] };
    case 'lv': return { ...base, title: 'Lymphatic', value: (f) => { const m = L(f), d = m.lymph - m.lymphRef; return { v: fmt(m.lymph, 1), u: 'mL/min (whole liver)', d: m.lymphRef > 0 && Math.abs(d) / m.lymphRef >= 0.1 ? `${d > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d) / m.lymphRef * 100)}%` : null, up: d > 0 }; },
      verbs: [about((m) => ['Lymph is plasma that leaks from the sinusoids into the space of Disse, drains out through the tissue to the portal tract and leaves the liver in its lymphatics. It carries the protein that escapes the sinusoids, and returns the fluid to the blood through the thoracic duct.',
        m.lymph > m.lymphRef * 1.25 ? 'Higher sinusoidal pressure forces more fluid out: lymph flow rises to compensate. Past the lymphatics’ capacity the rest weeps off the liver surface as ascites.' : '',
        m.lymph < m.lymphRef * 0.75 ? 'Less filtration than the comparison: lymph flow has fallen.' : ''].filter(Boolean)),
        stat('Hepatic lymph', (m) => `${fmt(m.lymph, 1)} mL/min`), stat('Healthy', (m) => `${fmt(m.lymph0, 1)} mL/min`)] };
    case 'septum': return { ...base, title: 'Fibrous septum', value: (f) => ({ v: pc(L(f).s), u: 'cirrhosis' }),
      verbs: [about(() => ['Bands of collagen laid down by activated stellate cells bridge triad to triad and triad to central vein, cutting the lobules into regenerative nodules and distorting the vessels.']), CIRRHOSIS] };
    case 'hep': default: {
      const z = sel.zone || 1;
      return { ...base, title: `Hepatocytes · zone ${z}`, value: () => ({ v: `Zone ${z}`, u: ['periportal', 'midzonal', 'centrilobular'][z - 1] }),
        verbs: [about((m) => [ZONE_TEXT[z - 1], z === 3 && m.congU > 0.1 ? 'Here the outflow is backing up: congestion and cell dropout around the central vein.' : ''].filter(Boolean)), CIRRHOSIS] };
    }
  }
}

/** Can a shunt start from this vessel (a portal vessel or a systemic vein)? */
export function shuntable(id) {
  const e = EDGES[EI[id]];
  if (!e || !['vein', 'collateral'].includes(e.kind)) return false;
  return [e.from, e.to].some((n) => SHUNT_PORTAL.includes(n) || SHUNT_SYSTEMIC.includes(n));
}

// ── Clinical orders (the Treat section and the command palette) ────────────
export const DRUG_LIST = Object.keys(DRUGS);
export const DRUG_NOTE = { propranolol: 'Non-selective β-blocker', carvedilol: 'β-blocker + α1 blockade', terlipressin: 'Vasopressin analogue', octreotide: 'Somatostatin analogue' };
