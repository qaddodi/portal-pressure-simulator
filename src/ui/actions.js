// Verbs on the anatomy (object → verb). Every manipulation the learner can make lives here once:
// the action card beside a selected structure, the Treat section of the patient chart, the command
// palette and the presenter all call these same verbs, so each change is made one way and lands
// in the timeline as one entry.

import { EDGES, NODES, SHUNT_PORTAL, SHUNT_SYSTEMIC, dMinOf, edgePresent, isStent, stentSite } from '../engine/topology.js?v=4044766e96';
import { dopplerVel, flowReversed } from './velNormal.js?v=97920ddf3f';
import { store, updateParams, hiddenNow } from './store.js?v=a926bea9d4';
import { fmt, fmtFlow, clamp } from './util.js?v=e88848482f';
import { PREGNANCY_INFO } from '../engine/scenario.js?v=d7d3ea5b70';
import { aboutVessel, aboutOrgan } from './about.js?v=ba0624cf81';
import { lobuleState } from './lobule-model.js?v=d4d297f77f';
import { oxygenFor } from './blood.js?v=96774a5b6a';
import { LABEL_VESSEL, SIN_EDGES } from './anatomy.js?v=97811cb4dd';

export const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

const pct = (v) => `${Math.round(v * 100)} %`;
const mult = (v) => `×${v.toFixed(v < 10 ? 1 : 0)}`;
const weeks = (v) => (v > 0 ? `${Math.round(v)} weeks` : 'Not pregnant');
const HEP_VEIN = { RHV_IVC: 'R', POST_R_RHV: 'R', MHV_IVC: 'M', POST_R_MHV: 'M', POST_L_MHV: 'M', LHV_IVC: 'L', POST_L_LHV: 'L' };
const POST_TO_HV = { POST_R_RHV: 'RHV_IVC', POST_R_MHV: 'MHV_IVC', POST_L_MHV: 'MHV_IVC', POST_L_LHV: 'LHV_IVC' };
const WEDGE_OF = { W_R: 'RHV_IVC', W_M: 'MHV_IVC', W_L: 'LHV_IVC' };

// A label or station stands for a structure: clicking "Portal vein" opens the portal vein's card.
const NODE_SEL = {
  CONF: ['edge', 'PV_TRUNK'], PVH: ['edge', 'PV_TRUNK'], SV: ['edge', 'SV_CONF'], SMV: ['edge', 'SMV_CONF'], IMV: ['edge', 'V_IMV'], LGV: ['edge', 'LGV_CONF'],
  RPV: ['edge', 'PVH_R'], LPV: ['edge', 'PVH_L'], RHV: ['edge', 'RHV_IVC'], MHV: ['edge', 'MHV_IVC'], LHV: ['edge', 'LHV_IVC'], IVCS: ['edge', 'IVCS_RA'], IVCI: ['edge', 'IVC_IS'],
  SVC: ['edge', 'SVC_RA'], AZY: ['edge', 'AZY_SVC'], ILI: ['edge', 'ILI_IVC'], LRV: ['edge', 'LRV_IVC'], KID_L: ['edge', 'V_KID_L'], COL: ['edge', 'V_COL'], INT: ['edge', 'V_INT'],
  SIN_R: ['edge', 'SIN_RR'], SIN_L: ['edge', 'SIN_LL'], CV_R: ['organ', 'liver'], CV_L: ['organ', 'liver'], HA: ['organ', 'liver'],
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
    // A central vein that runs into a hepatic vein is that hepatic vein to the eye: it opens the vein's card and frames it.
    if (POST_TO_HV[e.id]) return { type: 'edge', id: POST_TO_HV[e.id] };
    // The drawn sinusoids are a vessel of their own, each side its own target; the liver's other micro-vessels are the liver.
    if (e.kind === 'liver' && !SIN_EDGES.has(e.id)) return { type: 'organ', id: 'liver', lobe: e.lobe === 'L' ? 'L' : e.lobe === 'R' ? 'R' : null, zone: e.zone };
  }
  return sel;
}

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
  const shunt = ctx.canShunt(id) ? { type: 'button', id: 'shunt', label: 'Add shunt', icon: 'stent', run: () => ctx.startShunt(id) } : null;
  let kicker, why = 'pv';
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
    if (id === 'C2' || id === 'C5') verbs.push(...varixVerbs('gas', ctx));
    verbs.push(doppler);
  } else if (isShunt) {
    kicker = 'Shunt'; why = 'shunt';
    if (id === 'TIPS' || id === 'DIPS') {
      const k = id.toLowerCase();   // the stent's params key: tips or dips
      verbs.push({ type: 'slider', id: 'diameter', key: k, label: 'Stent diameter', min: 6, max: 12, step: 0.5, def: 8, format: (v) => `${v.toFixed(1)} mm`,
        get: (p) => p[k].d, set: (p, v) => { p[k].d = v; }, hist: `${id} diameter`, info: 'Resistance ∝ 1/d⁴: an 8 mm stent has well under half the conductance of a 10 mm one.' });
      verbs.push({ type: 'button', id: 'remove', key: k, label: `Remove ${id}`, icon: 'close', danger: true, run: () => { updateParams({ [k]: { on: false } }, { label: `Remove ${id}` }); ctx.select(null); } });
    } else if (e.shunt === 'custom') {
      verbs.push({ type: 'slider', id: 'diameter', key: 'customShunts', label: 'Shunt diameter', min: 4, max: 16, step: 0.5, def: 10, format: (v) => `${v.toFixed(1)} mm`,
        get: (p) => p.customShunts?.[id] || 10, set: (p, v) => { p.customShunts = { ...(p.customShunts || {}), [id]: v }; }, hist: `${e.label} diameter` });
      verbs.push({ type: 'button', id: 'remove', key: 'customShunts', label: 'Take down shunt', icon: 'close', danger: true, run: () => { updateParams((p) => { const c = { ...(p.customShunts || {}) }; delete c[id]; p.customShunts = c; return p; }, { label: `Remove ${e.label}` }); ctx.select(null); } });
    }
    // A stent narrows at a short pinch in one of the segments Doppler samples: proximal (portal end), mid or distal.
    if (isStent(e)) {
      const at = verbs.findIndex((v) => v.id === 'remove');
      verbs.splice(at < 0 ? verbs.length : at, 0, { ...narrow, info: 'A short pinch in one segment of the stent. Its resistance rises with (1 − s)⁻⁴, and the jet through it speeds up by (1 − s)⁻².' }, { type: 'seg', id: 'site', label: 'Where', small: true,
        options: [['proximal', 'Proximal'], ['mid', 'Mid'], ['distal', 'Distal']], get: () => stentSite(store.get().params, id),
        set: (val) => updateParams((p) => { p.stenosisSite = { ...(p.stenosisSite || {}), [id]: val }; return p; }, { label: `${e.label} narrowing: ${val}` }) });
    }
    if (['S_PC', 'S_DSR', 'S_MC'].includes(id)) {
      const key = { S_PC: 'portocaval', S_DSR: 'dsrs', S_MC: 'mesocaval' }[id];
      verbs.push({ type: 'button', id: 'remove', key, label: 'Take down shunt', icon: 'close', danger: true, run: () => { updateParams({ [key]: false }, { label: `Remove ${e.label}` }); ctx.select(null); } });
    }
    verbs.push(doppler);
  } else if (SIN_EDGES.has(id)) {
    // Each side's sinusoids: their own card, read at the station, with the liver's cirrhosis and its lobule.
    kicker = 'Liver microcirculation'; why = 'hvpg';
    verbs.push({ type: 'stat', label: 'Flow', value: (f) => `${fmtFlow(bedStats(e, f).q)} L/min` });
    verbs.push({ type: 'stat', label: 'Drop to central vein', value: (f) => `${fmt(bedStats(e, f).dp, 1)} mmHg` });
    verbs.push({ type: 'stat', label: 'Resistance', value: (f) => { const r = bedStats(e, f).r; return r == null ? '—' : `${fmt(r, 1)} mmHg·min/L`; } });
    verbs.push(...organCard({ type: 'organ', id: 'liver' }, ctx).verbs);
  } else {
    kicker = SHUNT_PORTAL.includes(e.from) || SHUNT_PORTAL.includes(e.to) ? 'Vein · portal system' : 'Vein · systemic';
    if (HEP_VEIN[id]) { kicker = 'Hepatic vein'; why = 'hvpg'; }
    if (['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L'].includes(id)) why = 'pvFlow';
    verbs.push(narrow, clot);
    verbs.push(doppler);
    if (shunt) verbs.push(shunt);
    if (id === 'SV_CONF' || id === 'SV_MID' || id === 'V_SPL') verbs.push({ type: 'link', label: 'Spleen', run: () => ctx.select({ type: 'organ', id: 'spleen' }) });
  }
  // Dye into this vessel, beside Doppler: a few seconds a press, or as long as it is held.
  if (ctx.injectDye && !SIN_EDGES.has(id)) {
    const dye = { type: 'dye', id: 'dye', label: 'Inject dye', icon: 'drop', run: (o) => ctx.injectDye(id, o), release: () => ctx.releaseDye(), busy: () => ctx.dyeInjecting(), showIf: () => ctx.canDye?.() !== false };
    const at = verbs.indexOf(doppler);
    if (at >= 0) verbs.splice(at + 1, 0, dye); else verbs.push(dye);
  }
  verbs.unshift({ type: 'about', text: (f) => aboutVessel(e, f, store.get()) });
  return {
    key: 'e:' + id, sel, kicker, title: e.label, why, edge: id, verbs,
    value: (f, lens, ref) => edgeValue(e, f, lens, ref, true),
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
// On the vessel card (range), a clotted or narrowed vessel reads in → out instead: across a clot the mean of
// its ends is a pressure found nowhere in it.
const STATION_OF = Object.fromEntries(Object.entries(LABEL_VESSEL).map(([n, e]) => [e, n]));
const signed = (d, txt) => `${d > 0 ? '+' : '−'}${txt}`;
export function edgeValue(e, f, lens, ref, range = false) {
  const k = EI[e.id], PF = f.Pf || f.P, st = STATION_OF[e.id];
  const P1 = PF[NI[e.from]], P2 = PF[NI[e.to]], P = st ? PF[NI[st]] : (P1 + P2) / 2;
  const q = (f.Qf ? f.Qf[k] : f.Q[k]) * 0.06;
  if (lens === 'flow') {
    const r = store.get().healthy?.Q?.[k];
    const d = r != null && Math.abs(r) > 0.3 ? ((Math.abs(q) - Math.abs(r * 0.06)) / Math.abs(r * 0.06)) * 100 : null;
    return { v: fmtFlow(Math.abs(q)), u: 'L/min', d: d != null && Math.abs(d) >= 5 ? signed(d, `${Math.round(Math.abs(d))} %`) : null, up: d > 0 };
  }
  if (lens === 'velocity' && e.kind === 'liver') return { v: '—', u: 'cm/s' };   // a lumped bed has no one velocity
  // Velocity reads as Doppler does (peak, see dopplerK), so it matches the figure callouts and the Doppler monitor.
  if (lens === 'velocity') return { v: fmt(Math.abs(dopplerVel(f, k)), 0), u: 'cm/s' };
  if (lens === 'drop') return { v: fmt(P1 - P2, 1), u: 'mmHg drop' };
  // Oxygen saturation of the blood leaving the vessel (an artery's as it enters its bed); the sinusoids read in → out.
  if (lens === 'oxygen') {
    const o = oxygenFor(EDGES, NODES, f).edge, up = q >= 0 ? 2 * k : 2 * k + 1, dn = q >= 0 ? 2 * k + 1 : 2 * k;
    const pc = (s) => String(Math.round(s * 100));
    const a = o[up], b = e.kind === 'artery' || e.kind === 'arteriole' ? o[up] : o[dn];
    return { v: Math.abs(a - b) >= 0.005 ? `${pc(a)} → ${pc(b)}` : pc(b), u: '% O₂ saturation' };
  }
  const p = store.get().params;
  if (range && (p?.thrombus?.[e.id] > 0 || p?.stenosis?.[e.id] > 0)) return { v: `${fmt(P1, 1)} → ${fmt(P2, 1)}`, u: 'mmHg' };
  // The change from the reference reads as the figure's callouts do: signed, one decimal, in the reading's colour.
  const r = ref ? (st ? ref[NI[st]] : (ref[NI[e.from]] + ref[NI[e.to]]) / 2) : null;
  return { v: fmt(P, 1), u: 'mmHg', d: r != null && Math.abs(P - r) >= 1 ? signed(P - r, fmt(Math.abs(P - r), 1)) : null, up: r != null && P > r };
}

// A capillary bed (each side's sinusoids) is lumped in the model: no one diameter or velocity, so it reads as its
// flow, the pressure it drops from the portal venules' end to the central vein, and its resistance (ΔP / Q).
export function bedStats(e, f) {
  const k = EI[e.id], PF = f.Pf || f.P, q = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06, dp = PF[NI[e.from]] - PF[NI[e.to]];
  return { q, dp, r: q > 0.005 ? dp / q : null };
}

function varixVerbs(site, ctx) {
  const eso = site === 'eso';
  const out = [];
  if (eso) out.push({ type: 'button', id: 'band', label: 'Band', icon: 'band', run: () => { ctx.action({ kind: 'band' }); }, note: (f) => (f.bands ? `${Math.round(f.bands)} band${f.bands >= 1.5 ? 's' : ''} placed` : null) });
  out.push({ type: 'button', id: 'endoscope', label: 'Endoscope', icon: 'endoscope', run: () => { ctx.paneApi('endoscopy')?.setView?.('eso'); ctx.showPane('endoscopy'); } });
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
      value: (f, lens, ref) => { const P = (f.Pf || f.P)[NI.SIN_R]; const r = ref?.[NI.SIN_R]; return { v: fmt(P, 1), u: 'mmHg sinusoids', d: r != null && Math.abs(P - r) >= 1 ? signed(P - r, fmt(Math.abs(P - r), 1)) : null, up: r != null && P > r }; },
      verbs: [
        { type: 'slider', id: 'cirrhosis', key: 'cirrhosis', label: 'Cirrhosis', icon: 'liver', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, hist: 'Cirrhosis',
          sub: '40 % compensated · 60 % CSPH · 85 % decompensated', info: 'Sinusoidal fibrosis, capillarization, a stiffer liver and arterioportal shunting. Jump months ahead on the timeline to watch collaterals open.' },
        { type: 'button', id: 'lobule', label: 'Open the lobule view', icon: 'explore', run: () => ctx.zoomLobule(), note: () => 'Fibrosis of the portal tract, sinusoids or central vein is set there, on each part’s card.' },
        stat('HVPG', (f) => (hiddenNow()?.has('trueHVPG') ? 'Not measured' : `${fmt(f.metrics.hvpg, 1)} mmHg`)),
      ],
    };
  }
  if (id === 'heart') {
    const sl = (vid, key, label, min, max, def, info) => ({ type: 'slider', id: vid, key, label, min, max, step: 0.01, def, format: pct, get: (p) => p[key], set: (p, v) => { p[key] = v; }, hist: label, info });
    return {
      key: 'o:heart', sel, kicker: 'Organ', title: 'Right heart', why: 'ra',
      value: (f, lens, ref) => { const P = (f.Pf || f.P)[NI.RA]; const r = ref?.[NI.RA]; return { v: fmt(P, 1), u: 'mmHg RA', d: r != null && Math.abs(P - r) >= 1 ? signed(P - r, fmt(Math.abs(P - r), 1)) : null, up: r != null && P > r }; },
      verbs: [
        sl('contractility', 'contractility', 'Contractility', 0.15, 1.6, 1, 'Right-ventricular pump strength (Frank–Starling).'),
        sl('tr', 'tr', 'Tricuspid regurgitation', 0, 1, 0, 'Systolic backflow into the right atrium: large v-waves reach the liver.'),
        sl('pericardial', 'pericardial', 'Pericardial constraint', 0, 1, 0, 'Constrictive pericarditis limits filling.'),
        // On every patient's heart card; it starts at Not pregnant (0 weeks), so no patient changes until it is moved.
        { type: 'slider', id: 'gestation', key: 'gestation', label: 'Pregnancy', min: 0, max: 40, step: 1, def: 0, format: weeks, get: (p) => p.gestation || 0, set: (p, v) => { p.gestation = v; }, hist: 'Pregnancy',
          info: PREGNANCY_INFO },
        stat('Cardiac output', (f) => `${fmt(f.metrics.co, 1)} L/min`),
      ],
    };
  }
  if (id === 'varices' || id === 'gastric') {
    const eso = id === 'varices';
    const vx = (f) => (eso ? f.metrics.varix : f.metrics.gastricVarix);
    const verbs = varixVerbs(eso ? 'eso' : 'gas', ctx);
    if (!eso) verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: 'Occlude the gastrorenal shunt (BRTO)', icon: 'occlude', showIf: (p) => p.spontaneous.C5 !== false, get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, hist: 'BRTO' });
    verbs.push(stat('Grade', (f) => { const v = vx(f); return !v.present ? 'none' : `${v.grade.label} · ${fmt(v.d, 1)} mm`; }));
    if (eso) verbs.push({ type: 'link', label: 'Coronary vein', run: () => ctx.select({ type: 'edge', id: 'LGV_CONF' }) });
    else verbs.push({ type: 'link', label: 'Short gastric veins', run: () => ctx.select({ type: 'edge', id: 'C2' }) });
    return {
      key: 'o:' + id, sel, kicker: 'Collateral bed', title: eso ? 'Esophageal varices' : 'Fundal varices', why: 'varix', verbs,
      value: (f, lens, ref) => { const n = NI[eso ? 'VAR' : 'GV']; const P = (f.Pf || f.P)[n]; const r = ref?.[n]; return { v: fmt(P, 1), u: 'mmHg', d: r != null && Math.abs(P - r) >= 1 ? signed(P - r, fmt(Math.abs(P - r), 1)) : null, up: r != null && P > r }; },
      status: (f) => (f.metrics.bleeding && (f.metrics.bleeding.site === 'GV') === !eso ? ['bad', 'Bleeding'] : vx(f).redWale ? ['warn', 'Red wale signs'] : null),
    };
  }
  if (id === 'spleen') {
    return {
      key: 'o:spleen', sel, kicker: 'Organ', title: 'Spleen', why: 'spleen',
      value: (f) => (f.metrics.spleen.length > 0 ? { v: fmt(f.metrics.spleen.length, 1), u: 'cm long' } : { v: 'Removed', u: '' }),
      verbs: [
        stat('Platelets (illustrative)', (f) => `${(Math.round(f.metrics.spleen.platelets) * 1000).toLocaleString('en-US')}/µL`),
        { type: 'seg', label: 'Treat the spleen', options: [[0, 'None'], [1, 'Embolize'], [2, 'Splenectomy']], get: () => store.get().params.splenicRx | 0, set: (val) => updateParams((p) => { p.splenicRx = val; return p; }, { label: ['Spleen untreated', 'Partial splenic embolization', 'Splenectomy'][val] }) },
        { type: 'about', text: () => ['Partial embolization closes branches of the splenic artery and infarcts part of the spleen; splenectomy removes it. Both cut splenic inflow, so portal pressure and flow to the varices fall (splenectomy more than embolization).'] },
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
const fibrosisVerb = (z) => ({ type: 'slider', id: 'fibrosis', key: 'fibrosis', label: `Fibrosis · ${ZONE_NAME[z]}`, icon: 'fibrosis', min: 1, max: 80, step: 0.5, def: 1, format: mult,
  get: (p) => Math.max(p.fibrosis.R[z], p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; }, hist: `Fibrosis · ${ZONE_NAME[z]}`,
  info: { pre: 'Resistance before the sinusoids, as in schistosomiasis: portal pressure rises, the wedged pressure does not.', sin: 'Collagen in the space of Disse and closing fenestrae: resistance in the sinusoids themselves, read by HVPG.', post: 'Resistance at the central veins, as in sinusoidal obstruction syndrome: the sinusoids congest from the outflow side.' }[z] });
const ZONE_TEXT = ['Zone 1 (periportal) gets blood first, richest in oxygen and nutrients: the first to regenerate, the last to die in ischemia.', 'Zone 2 lies between: intermediate oxygen.', 'Zone 3 (centrilobular) gets blood last, poorest in oxygen: first to suffer in congestion, shock and drug toxicity (acetaminophen).'];

// The lobule's portal flow runs backward (the same dead band as every other reversed-flow sentence: velNormal.js flowReversed).
const portalBack = (m) => flowReversed(m.portalQ, m.portalRef);

function lobuleCard(sel, ctx) {
  const L = (f) => lobuleState(f, store.get());
  const mm = (v) => `${fmt(v, 1)} mmHg`, pc = (v) => `${Math.round(v * 100)} %`;
  const stat = (label, value) => ({ type: 'stat', label, value: (f) => value(L(f), f) });
  const pv = (v) => (f, lens, ref) => { const m = L(f); const x = v(m); const r = ref ? v({ P1: ref[NI.RPV], P2: ref[NI.SIN_R], P3: ref[NI.CV_R] }) : null; return { v: fmt(x, 1), u: 'mmHg', d: r != null && Math.abs(x - r) >= 1 ? signed(x - r, fmt(Math.abs(x - r), 1)) : null, up: r != null && x > r }; };
  const about = (fn) => ({ type: 'about', text: (f) => (f ? fn(L(f)) : []) });
  // The lobule's parts have no page of their own in the side panel: no Details link.
  const base = { key: 'l:' + sel.part + ':' + (sel.tube ?? sel.tri ?? sel.zone ?? ''), sel, kicker: 'Lobule', why: 'hvpg', noDetails: true };
  switch (sel.part) {
    case 'triad': return { ...base, title: 'Portal triad', value: pv((m) => m.P1),
      verbs: [about((m) => ['Blood enters the lobule here: portal venous blood (about three quarters) and hepatic arterial blood, with a bile ductule carrying bile the other way. Inlet venules run along the lobule’s edge and feed the sinusoids.',
        m.fibPre > 0.1 ? `Portal fibrosis (resistance ×${fmt(m.zone.pre, 1)}) narrows the venules before the sinusoids: pre-sinusoidal portal hypertension, with a near-normal wedged pressure.` : '',
        portalBack(m) ? 'Portal flow is reversed: blood leaves the liver through the portal venules (hepatofugal flow).' : ''].filter(Boolean)),
      fibrosisVerb('pre'), stat('Portal inflow', (m) => (portalBack(m) ? 'reversed' : pc(Math.max(0, m.portal)))), stat('Arterial inflow', (m) => pc(m.art))] };
    case 'in': return { ...base, title: 'Inlet venule', value: pv((m) => m.P1),
      verbs: [about((m) => ['A branch of the portal venule running along the lobule’s border, feeding the sinusoids it passes.', portalBack(m) ? 'Flow here runs backwards (orange): arterial blood that entered the sinusoids drains out through the portal venules.' : ''].filter(Boolean)),
        fibrosisVerb('pre'), stat('Portal inflow', (m) => (portalBack(m) ? 'reversed' : pc(Math.max(0, m.portal))))] };
    case 'sin': case 'an': return { ...base, title: sel.part === 'an' ? 'Sinusoidal anastomosis' : 'Sinusoid', value: pv((m) => m.P2),
      verbs: [about((m) => [sel.part === 'an' ? 'A cross-link between sinusoids: blood can go around a local block, so one blocked sinusoid does not starve the cells beyond it.'
        : 'A leaky capillary lined by fenestrated endothelium, between plates of hepatocytes one cell thick. Sinusoids merge toward the central vein, so blood speeds up as it goes; the highlighted path runs to the central vein.',
      m.fibSin > 0.1 ? 'Capillarization: the fenestrae close and collagen fills the space of Disse (pale sleeve), raising sinusoidal resistance: this is what raises HVPG in cirrhosis.' : '',
      m.congU > 0.1 ? 'Zone 3 sinusoids are dilated and packed with blood: the outflow is backing up.' : ''].filter(Boolean)),
      { type: 'button', id: 'sinusoid', label: 'Zoom into the sinusoid', icon: 'explore', run: () => store.set({ sinusoid: true }), note: () => 'Its wall up close: fenestrae, the space of Disse, a stellate cell and the hepatocytes.' },
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
    case 'lv': return { ...base, title: 'Lymphatic', value: (f) => { const m = L(f), d = m.lymph - m.lymphRef; return { v: fmt(m.lymph, 1), u: 'mL/min (whole liver)', d: m.lymphRef > 0 && Math.abs(d) / m.lymphRef >= 0.1 ? signed(d, `${Math.round(Math.abs(d) / m.lymphRef * 100)}%`) : null, up: d > 0 }; },
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
export const DRUG_NOTE = { propranolol: 'Non-selective β-blocker', carvedilol: 'β-blocker + α1 blockade', terlipressin: 'Vasopressin analogue', octreotide: 'Somatostatin analogue' };
