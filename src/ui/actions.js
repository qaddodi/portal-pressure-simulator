// Verbs on the anatomy (object → verb). Every manipulation the learner can make lives here once:
// the action card beside a selected structure, the Treat section of the patient chart, the command
// palette, lessons and cases all call these same verbs, so each change is made one way and lands
// in the timeline as one entry.

import { EDGES, NODES, SHUNT_PORTAL, SHUNT_SYSTEMIC, dMinOf, edgePresent } from '../engine/topology.js?v=6d79260961';
import { DRUGS } from '../engine/scenario.js?v=8fc90f782f';
import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { fmt, clamp, toast } from './util.js?v=13768f12bf';

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
export const selTitle = (sel) => { const s = normalizeSel(sel); if (!s) return ''; return s.type === 'organ' ? ORGAN_TITLE[s.id] || s.id : EDGES[EI[s.id]]?.label || s.id; };

/**
 * Build the action-card model for a selection.
 * ctx: { action, showPane, probe, startShunt, canShunt, select, zoomLobule, paneApi }
 */
export function cardFor(selIn, ctx) {
  const sel = normalizeSel(selIn);
  if (!sel) return null;
  if (sel.type === 'organ') return organCard(sel, ctx);
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
  const doppler = { type: 'button', id: 'doppler', label: 'Doppler', icon: 'doppler', run: () => { ctx.probe(id); ctx.showPane('doppler'); } };
  const shunt = ctx.canShunt(id) ? { type: 'button', id: 'shunt', label: 'Shunt from here', icon: 'stent', run: () => ctx.startShunt(id) } : null;
  let kicker = 'Vein', why = 'pv';
  if (isArt) {
    kicker = 'Artery';
    verbs.push({ type: 'stat', label: 'Flow', value: (f) => `${fmt(f.Q[k] * 0.06, 2)} L/min` });
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
    if (HEP_VEIN[id]) verbs.push(wedgeVerb(HEP_VEIN[id], ctx));
    verbs.push(doppler);
    if (shunt) verbs.push(shunt);
    if (id === 'SV_CONF' || id === 'V_SPL') verbs.push({ type: 'link', label: 'Spleen', run: () => ctx.select({ type: 'organ', id: 'spleen' }) });
  }
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

function edgeValue(e, f, lens, ref) {
  const k = EI[e.id];
  const P1 = f.P[NI[e.from]], P2 = f.P[NI[e.to]], P = (P1 + P2) / 2;
  const q = (f.Qf ? f.Qf[k] : f.Q[k]) * 0.06;
  if (lens === 'flow') {
    const r = store.get().healthy?.Q?.[k];
    const d = r != null && Math.abs(r) > 0.3 ? ((Math.abs(q) - Math.abs(r * 0.06)) / Math.abs(r * 0.06)) * 100 : null;
    return { v: fmt(Math.abs(q), Math.abs(q) < 0.1 ? 3 : 2), u: 'L/min', d: d != null && Math.abs(d) >= 5 ? `${d > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d))} %` : null, up: d > 0 };
  }
  if (lens === 'velocity') { const D = Math.max(0.5, f.D[k]) / 10; return { v: fmt(Math.abs((q / 0.06) / (Math.PI * D * D / 4)), 0), u: 'cm/s' }; }
  if (lens === 'drop') return { v: fmt(P1 - P2, 1), u: 'mmHg drop' };
  const r = ref ? (ref[NI[e.from]] + ref[NI[e.to]]) / 2 : null;
  return { v: fmt(P, 1), u: 'mmHg', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r };
}

function wedgeVerb(vein, ctx) {
  return {
    type: 'button', id: 'wedge', key: 'catheter', label: 'Wedge → HVPG', icon: 'catheter',
    on: (p) => p.catheter.vein === vein,
    labelFor: (p) => (p.catheter.vein !== vein ? 'Wedge → HVPG' : p.catheter.wedged ? 'Remove catheter' : 'Inflate balloon'),
    note: (f, p) => {
      if (p.catheter.vein !== vein) return 'Transjugular catheter: free pressure, then wedged. HVPG = WHVP − FHVP.';
      const m = store.get().lastHVPG;
      if (m && m.vein === vein) return `HVPG ${fmt(m.hvpg, 1)} mmHg (WHVP ${fmt(m.whvp, 1)} − FHVP ${fmt(m.fhvp, 1)})`;
      return p.catheter.wedged ? 'Balloon inflated: waiting for the wedged plateau…' : 'Free hepatic venous pressure; the balloon inflates in a moment.';
    },
    run: () => {
      const c = store.get().params.catheter;
      if (c.vein === vein && c.wedged) { updateParams({ catheter: { vein: null, wedged: false } }, { label: 'Remove catheter' }); return; }
      if (c.vein === vein) { updateParams({ catheter: { vein, wedged: true } }, { label: 'Wedge catheter' }); return; }
      updateParams({ catheter: { vein, wedged: false } }, { label: `Catheter in ${vein}HV` });
      ctx.showPane('hvpg');
      // The procedure runs itself: free pressure first, then the balloon.
      setTimeout(() => { const cc = store.get().params.catheter; if (cc.vein === vein && !cc.wedged) updateParams({ catheter: { vein, wedged: true } }, { label: 'Wedge catheter', history: false }); }, 3500);
    },
  };
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
    const ui = ctx.ui('liver', { zone: sel.zone && sel.zone !== 'inter' ? sel.zone : 'sin', scope: sel.lobe || 'both' });
    const zoneName = { pre: 'portal tract', sin: 'sinusoids', post: 'central veins' };
    const lobes = () => (ui.scope === 'both' ? ['R', 'L'] : [ui.scope]);
    return {
      key: 'o:liver', sel, kicker: 'Organ', title: 'Liver', why: 'hvpg',
      value: (f, lens, ref) => { const P = f.P[NI.SIN_R]; const r = ref?.[NI.SIN_R]; return { v: fmt(P, 1), u: 'mmHg sinusoids', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r }; },
      verbs: [
        { type: 'slider', id: 'cirrhosis', key: 'cirrhosis', label: 'Cirrhosis', icon: 'liver', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, hist: 'Cirrhosis',
          sub: '40 % compensated · 60 % CSPH · 85 % decompensated', info: 'Sinusoidal fibrosis, capillarization, a stiffer liver and arterioportal shunting. Jump months ahead on the timeline to watch collaterals open.' },
        { type: 'seg', id: 'zone', label: 'Where is the block?', options: [['pre', 'Portal tract'], ['sin', 'Sinusoid'], ['post', 'Central vein']], get: () => ui.zone, set: (v) => { ui.zone = v; } },
        { type: 'seg', id: 'scope', label: null, small: true, options: [['both', 'Both lobes'], ['R', 'Right'], ['L', 'Left']], get: () => ui.scope, set: (v) => { ui.scope = v; } },
        { type: 'slider', id: 'fibrosis', key: 'fibrosis', label: () => `Fibrosis · ${zoneName[ui.zone]}`, icon: 'fibrosis', min: 1, max: 60, step: 0.5, def: 1, format: mult,
          get: (p) => Math.max(...lobes().map((l) => p.fibrosis[l][ui.zone])), set: (p, v) => { for (const l of lobes()) p.fibrosis[l][ui.zone] = v; }, hist: 'Fibrosis',
          info: 'Extra resistance in one zone. Presinusoidal: schistosomiasis. Postsinusoidal: sinusoidal obstruction syndrome.' },
        { type: 'button', id: 'lobule', label: 'Zoom into the lobule', icon: 'explore', run: () => ctx.zoomLobule(sel.lobe || 'R') },
        stat('HVPG', (f) => `${fmt(f.metrics.hvpg, 1)} mmHg`),
      ],
    };
  }
  if (id === 'heart') {
    const sl = (vid, key, label, min, max, def, info) => ({ type: 'slider', id: vid, key, label, min, max, step: 0.01, def, format: pct, get: (p) => p[key], set: (p, v) => { p[key] = v; }, hist: label, info });
    return {
      key: 'o:heart', sel, kicker: 'Organ', title: 'Right heart', why: 'ra',
      value: (f, lens, ref) => { const P = f.P[NI.RA]; const r = ref?.[NI.RA]; return { v: fmt(P, 1), u: 'mmHg RA', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r }; },
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
      value: (f, lens, ref) => { const n = NI[eso ? 'VAR' : 'GV']; const P = f.P[n]; const r = ref?.[n]; return { v: fmt(P, 1), u: 'mmHg', d: r != null && Math.abs(P - r) >= 1 ? `${P > r ? '▲' : '▼'} ${fmt(Math.abs(P - r), 0)}` : null, up: r != null && P > r }; },
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
  if (id === 'abdomen') {
    return {
      key: 'o:abdomen', sel, kicker: 'Peritoneum', title: 'Abdomen & ascites', why: 'ascites',
      value: (f) => ({ v: fmt(f.metrics.ascites.volume / 1000, 1), u: 'L ascites' }),
      status: (f) => (f.metrics.ascites.iap >= 12 ? ['bad', `IAP ${fmt(f.metrics.ascites.iap, 0)} mmHg`] : f.metrics.ascites.grade ? ['warn', f.metrics.ascites.label] : null),
      verbs: [
        { type: 'drain', id: 'paracentesis', label: 'Paracentesis', icon: 'needle' },
        { type: 'slider', id: 'albumin', key: 'albumin', label: 'Serum albumin', min: 1.5, max: 5, step: 0.1, def: 4, format: (v) => `${v.toFixed(1)} g/dL`, get: (p) => p.albumin, set: (p, v) => { p.albumin = v; }, hist: 'Serum albumin' },
        { type: 'toggle', id: 'diuretics', key: 'diuretics', label: 'Diuretics', icon: 'drop', get: (p) => !!p.diuretics, set: (p, v) => { p.diuretics = v; }, hist: 'Diuretics' },
        stat('Formation', (f) => `${fmt(f.metrics.ascites.ratePerDay, 0)} mL/day`),
      ],
    };
  }
  return null;
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
