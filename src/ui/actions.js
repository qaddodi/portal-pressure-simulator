// Verbs on the anatomy (object → verb). Every manipulation the learner can make lives here once:
// the action card beside a selected structure, the Treat section of the patient chart, the command
// palette and the presenter all call these same verbs, so each change is made one way and lands
// in the timeline as one entry.
//
// The cards are made once, when this module loads (the catalogue at the foot of the file): a card is a fixed description of a
// structure's verbs, whose readings are functions of the model frame, so choosing a structure looks its card up and a frame reads
// it, and nothing here is built while the app runs. What a frame reads is written in place (see steady, the stats' cells below).

import { EDGES, NODES, SHUNT_PORTAL, SHUNT_SYSTEMIC, dMinOf, edgePresent, isStent, stentSite } from '../engine/topology.js';
import { dopplerVel, flowReversed } from './velNormal.js';
import { store, updateParams, hiddenNow } from './store.js';
import { fmt, fmtFlow, clamp } from './util.js';
import { PREGNANCY_INFO } from '../engine/scenario.js';
import { lobuleState } from './lobule-model.js';
import { oxygenFor } from './blood.js';
import { LABEL_VESSEL, SIN_EDGES } from './anatomy.js';

export const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
export const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

const pct = (v) => `${Math.round(v * 100)}%`;
const mult = (v) => `×${v.toFixed(v < 10 ? 1 : 0)}`;
const weeks = (v) => (v > 0 ? `${Math.round(v)} wk` : 'None');
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
// What a station or a vessel stands for, made once (they are fixed): the selections normalizeSel hands back are these objects, which no
// caller changes. A vessel that stands for itself is handed back as it came.
const NORM_NODE = new Map(), NORM_EDGE = new Map();
for (const id of Object.keys(WEDGE_OF)) NORM_NODE.set(id, { type: 'edge', id: WEDGE_OF[id] });
for (const id of Object.keys(NODE_SEL)) {
  if (NORM_NODE.has(id)) continue;
  const m = NODE_SEL[id];
  NORM_NODE.set(id, m[0] === 'edge' ? { type: 'edge', id: m[1] } : { type: 'organ', id: m[1] });
}
for (const e of EDGES) {
  // A central vein that runs into a hepatic vein is that hepatic vein to the eye: it opens the vein's card and frames it.
  if (POST_TO_HV[e.id]) NORM_EDGE.set(e.id, { type: 'edge', id: POST_TO_HV[e.id] });
  // The drawn sinusoids are a vessel of their own, each side its own target; the liver's other micro-vessels are the liver.
  else if (e.kind === 'liver' && !SIN_EDGES.has(e.id)) NORM_EDGE.set(e.id, { type: 'organ', id: 'liver', lobe: e.lobe === 'L' ? 'L' : e.lobe === 'R' ? 'R' : null, zone: e.zone });
}
/** The structure a selection stands for (liver micro-vessels are the liver; stations their vessel). */
export function normalizeSel(sel) {
  if (!sel) return null;
  if (sel.type === 'node') return NORM_NODE.get(sel.id) || null;
  if (sel.type === 'edge') {
    const e = EDGES[EI[sel.id]];
    if (!e) return null;
    return NORM_EDGE.get(e.id) || sel;
  }
  return sel;
}

// ── What a frame reads of a card ───────────────────────────────────────────
// The card's context (card.js builds it once and passes the same one on every call): the verbs reach it here, when pressed.
let CTX = null;

// The text of a reading is made again only when what it prints changes, not at every new number: a cell holds the key the text was
// made from (x, and y where two things make it) and the text. A key that is NaN never matches, so that reading is made afresh.
// The tenth: what fmt's one decimal prints is the number in tenths, unless it lies within a hair of a tie (where toFixed's exact
// decimal expansion, not the product, decides), or is too large to say, or is not a number: then NaN.
function tenth(x) {
  if (typeof x !== 'number') return NaN;   // (fmt prints a missing number as a dash, not as 0.0)
  const y = x * 10;
  if (!(y > -1e9 && y < 1e9)) return NaN;
  const k = Math.round(y);
  return Math.abs(y - k) > 0.499999 ? NaN : k;
}
const memoKey = (c, k, x, make) => { if (c.x !== k) { c.x = k; c.s = make(x); } return c.s; };
const memoTenth = (c, x, make) => memoKey(c, tenth(x), x, make);
const pctOf = (c, x) => memoKey(c, Math.round(x * 100), x, pct);   // (pct prints Math.round(v * 100): the same key)
function fixedText(c, x, unit) { const k = tenth(x); if (c.x !== k) { c.x = k; c.s = `${fmt(x, 1)} ${unit}`; } return c.s; }
// fmtFlow prints a small real flow as "< 0.1", so a flow in that band is one key of its own (flowNum, below).
const TRICKLE = 1e12;
const newCell = () => ({ x: NaN, y: NaN, s: '' });
/** A reading the card shows as a number and its unit, with no name (the unit says what it is; `label` names the few the unit does not):
 *  text(f, cell) is the number alone. */
function read(unit, text, label = null) { const c = newCell(); return { type: 'read', label, unit, value: (f) => text(f, c) }; }
const FMT0 = (x) => fmt(x, 0);
// A flow's number (fmtFlow's "< 0.1" band is one key of its own, as flowText cuts it), a whole number, and a diameter (one decimal under 10 mm).
function flowNum(c, x) { const a = Math.abs(x), k = a > 0.0005 && a < 0.05 ? TRICKLE : tenth(a); if (c.x !== k) { c.x = k; c.s = fmtFlow(a); } return c.s; }
const intNum = (c, x) => memoKey(c, Math.round(x), x, FMT0);
function mmNum(c, x) { const big = x >= 9.95, k = big ? 1e6 + Math.round(x) : tenth(x); if (c.x !== k) { c.x = k; c.s = fmt(x, big ? 0 : 1); } return c.s; }
// The pressure where the blood comes in and where it leaves, and the drop between them (the card's bar): written into SPAN, a kept
// object the card reads at once. `ok` false: not measured here (the lens hides it, or the case has not measured the HVPG).
const SPAN = { a: 0, b: 0, d: 0, ok: true };
function spanOfEdge(e) {
  const k = EI[e.id], i1 = NI[e.from], i2 = NI[e.to];
  return { el: null, dn: null, cut: null, at: (f) => {
    const PF = f.Pf || f.P, q = f.Qf ? f.Qf[k] : f.Q[k];
    if (q >= 0) { SPAN.a = PF[i1]; SPAN.b = PF[i2]; } else { SPAN.a = PF[i2]; SPAN.b = PF[i1]; }
    SPAN.d = SPAN.a - SPAN.b; SPAN.ok = true;
    return SPAN;
  } };
}
// Across a portosystemic stent the clinical pair: portal vein to IVC, the PPG (the dock's own number, so the two agree).
const SPAN_PPG = { el: ['PV', 'IVC'], dn: 'PPG', cut: 'ppg', at: (f) => { const m = f.metrics; SPAN.a = m.pv; SPAN.b = m.ivc; SPAN.d = m.ppg; SPAN.ok = true; return SPAN; } };
// Across the liver: wedged to free hepatic venous pressure, the HVPG (not shown where the case has not measured it).
const SPAN_HVPG = { el: ['WHVP', 'FHVP'], dn: 'HVPG', cut: 'hvpg', at: (f) => { const m = f.metrics; SPAN.a = m.whvp; SPAN.b = m.fhvp; SPAN.d = m.hvpg; SPAN.ok = !hiddenNow()?.has('trueHVPG'); return SPAN; } };
/** The three readings of a vessel: its flow, its peak velocity (as Doppler reads it) and its diameter. */
function vesselReads(k) {
  return [read('L/min', (f, c) => flowNum(c, (f.Qf ? f.Qf[k] : f.Q[k]) * 0.06)), read('cm/s', (f, c) => intNum(c, Math.abs(dopplerVel(f, k)))), read('mm', (f, c) => mmNum(c, f.D[k]))];
}

// A reading ({ v, u, d, up }: the number, its unit, its change from the reference and whether that is up) is kept in two objects
// per card, one the card shows and one spare: card.js holds on to the reading it last drew (to roll the number to the next), so a
// reading is only ever written into the spare, and only when it is not the one shown. Between changes the same object comes back.
const newHold = () => ({ cur: { v: null, u: null, d: null, up: false }, spare: { v: null, u: null, d: null, up: false }, pc: newPCell() });
function steady(h, s) {
  const c = h.cur, d = s.d ?? null, up = !!s.up;
  if (c.v === s.v && c.u === s.u && c.d === d && c.up === up) return c;
  const n = h.spare;
  n.v = s.v; n.u = s.u; n.d = d; n.up = up;
  h.spare = c; h.cur = n;
  return n;
}
const S = { v: '', u: '', d: null, up: false };   // (a reading being worked out; the next one overwrites it)
// A pressure and its change from the reference r (none when r is null or undefined) into S: the texts are made again only when what
// they print changes (the tenth of P; whether the change reaches 1, its sign and its tenth), and whether P is above r.
const newPCell = () => ({ kP: NaN, kD: NaN, up: false, v: '', d: null, on: false });
// (The change shows from 1 and goes below 0.8: a pressure that beats about 1 mmHg from the reference does not make the change come and go
// with each beat. Its coming and going lays the card's header out again, a line taller or shorter, and every row under it moves.)
function partsP(c, P, r) {
  const kP = tenth(P), dd = P - r, ad = Math.abs(dd);
  const on = r != null && (ad >= 1 || (c.on && ad >= 0.8));
  const kD = on ? (dd > 0 ? 1 : -1) * (tenth(ad) + 1) : 0;
  const up = r != null && P > r;
  if (kP !== c.kP || kD !== c.kD || up !== c.up) {
    c.v = fmt(P, 1);
    c.d = on ? signed(dd, fmt(ad, 1)) : null;
    c.kP = kP; c.kD = kD; c.up = up;
  }
  c.on = on;
  S.v = c.v; S.d = c.d; S.up = up;
}
// A card's pressure reading at one unit.
function readP(h, P, r, u) { partsP(h.pc, P, r); S.u = u; return steady(h, S); }
function plain(h, v, u) { S.v = v; S.u = u; S.d = null; S.up = false; return steady(h, S); }

// The direction word at the card's corner: toward the liver or away from it on the portal side, reversed on the systemic side, open for a shunt.
const ST_STASIS = ['warn', 'Stasis'], ST_REVERSED = ['rev', 'Reversed flow'], ST_PETAL = ['ok', 'Hepatopetal'], ST_FUGAL = ['rev', 'Hepatofugal'], ST_PATENT = ['ok', 'Patent'];
const ST_BLEEDING = ['bad', 'Bleeding'], ST_WALE = ['warn', 'Red wale signs'], ST_CONGESTED = ['warn', 'Congested'];
const NONE = [];

const HEP_ART = new Set(['A_HEP', 'A_HR', 'A_HL']);
function buildEdgeCard(e) {
  const id = e.id, k = EI[id];
  const verbs = [];
  const isColl = e.kind === 'collateral', isShunt = e.kind === 'shunt', isArt = e.kind === 'artery' || e.kind === 'arteriole';
  const narrow = { type: 'slider', id: 'narrow', key: 'stenosis', label: 'Stenosis', icon: 'pinch', min: 0, max: 0.95, step: 0.01, format: pct, def: 0,
    get: (p) => p.stenosis[id] || 0, set: (p, v) => { if (v <= 0.004) delete p.stenosis[id]; else p.stenosis[id] = +v.toFixed(2); }, hist: `${e.label}: stenosis`,
    info: 'Lumen narrowing. Resistance rises with (1 − s)⁻⁴ (Poiseuille).' };
  const clot = { type: 'slider', id: 'clot', key: 'thrombus', label: 'Thrombus', icon: 'clot', min: 0, max: 1, step: 0.01, format: pct, def: 0,
    get: (p) => p.thrombus[id] || 0, set: (p, v) => { if (v <= 0.004) delete p.thrombus[id]; else p.thrombus[id] = +v.toFixed(2); }, hist: `${e.label}: thrombus`,
    info: 'Occlusive thrombus. With anticoagulation it recanalizes slowly on the disease clock.' };
  const doppler = { type: 'button', id: 'doppler', label: 'Doppler', icon: 'doppler', run: () => { CTX.probe(id); CTX.showPane('doppler'); CTX.select(null); } };
  // (Shown on a portal vessel or a systemic vein that can start a shunt; the context says which.)
  const shunt = { type: 'button', id: 'shunt', label: 'Add shunt', short: 'Shunt', icon: 'stent', showIf: () => CTX.canShunt(id), run: () => CTX.startShunt(id) };
  let kicker, why = 'pv', span = spanOfEdge(e);
  const portalSide = SHUNT_PORTAL.includes(e.from) || SHUNT_PORTAL.includes(e.to);
  if (!SIN_EDGES.has(id)) verbs.push(...vesselReads(k));
  if (isArt) {
    kicker = 'Artery';
    // The hepatic artery and its two branches are full vessels, as the veins are: narrow it, clot it, stent it open, read its Doppler.
    if (HEP_ART.has(id)) {
      const open = (p) => (p.stenosis[id] || 0) > 0 || (p.thrombus[id] || 0) > 0;
      verbs.push(narrow, clot);
      verbs.push({ type: 'button', id: 'stent', label: 'Stent open', short: 'Stent', icon: 'stent', showIf: () => open(store.get().params),
        run: () => updateParams((p) => { delete p.stenosis[id]; delete p.thrombus[id]; return p; }, { label: `${e.label}: stented open` }) });
      verbs.push(doppler);
    }
  } else if (isColl) {
    kicker = `Collateral · ${e.code || id}`; why = 'shunt';
    // How far the collateral has opened, from closed to its widest: a meter, read off the model (not a control).
    verbs.push({ type: 'meter', id: 'recruit', label: 'Recruited', icon: 'vessel', share: (f) => clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1) });
    verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: id === 'C5' ? 'Occlude (BRTO)' : 'Occlude (plug)', short: id === 'C5' ? 'BRTO' : 'Occlude', icon: 'occlude',
      get: (p) => !!p.occluded[id], set: (p, v) => { if (v) p.occluded[id] = true; else delete p.occluded[id]; }, hist: `${e.label}: occlusion` });
    if (e.spontaneous || e.variant) verbs.push({ type: 'toggle', id: 'variant', key: 'spontaneous', label: 'Present in this patient', short: 'Present', icon: 'vessel', get: (p) => edgePresent(e, p), set: (p, v) => { p.spontaneous[id] = v; }, hist: `${e.label} present` });
    // (Band and scope from the vessel; the tamponade balloons are on the varices' own card.)
    if (id === 'C1a' || id === 'C1b') verbs.push(...VARIX_ESO_ACTS);
    if (id === 'C2' || id === 'C5') verbs.push(...VARIX_GAS_ACTS);
    verbs.push(doppler);
  } else if (isShunt) {
    kicker = 'Shunt'; why = 'shunt';
    if (id === 'TIPS' || id === 'DIPS') {
      const k = id.toLowerCase();   // the stent's params key: tips or dips
      span = SPAN_PPG;
      verbs.push({ type: 'slider', id: 'diameter', key: k, label: 'Diameter', icon: 'stent', min: 6, max: 12, step: 0.5, def: 8, format: (v) => `${v.toFixed(1)} mm`,   // alloc-rare: the slider's number label, made on the slider's own input event (a drag moves it at pointer rate, not a frame's work)
        get: (p) => p[k].d, set: (p, v) => { p[k].d = v; }, hist: `${id} diameter`, info: 'Resistance ∝ 1/d⁴: an 8 mm stent has well under half the conductance of a 10 mm one.' });
      verbs.push({ type: 'button', id: 'remove', key: k, label: `Remove ${id}`, short: 'Remove', icon: 'close', danger: true, run: () => { updateParams({ [k]: { on: false } }, { label: `Remove ${id}` }); CTX.select(null); } });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
    } else if (e.shunt === 'custom') {
      verbs.push({ type: 'slider', id: 'diameter', key: 'customShunts', label: 'Diameter', icon: 'stent', min: 4, max: 16, step: 0.5, def: 10, format: (v) => `${v.toFixed(1)} mm`,   // alloc-rare: the slider's number label, made on the slider's own input event (a drag moves it at pointer rate, not a frame's work)
        get: (p) => p.customShunts?.[id] || 10, set: (p, v) => { p.customShunts = { ...(p.customShunts || {}), [id]: v }; }, hist: `${e.label} diameter` });   // alloc-rare: the slider's setter, run on the slider's own input event, once per pointer move, never in a frame
      verbs.push({ type: 'button', id: 'remove', key: 'customShunts', label: 'Take down shunt', short: 'Remove', icon: 'close', danger: true, run: () => { updateParams((p) => { const c = { ...(p.customShunts || {}) }; delete c[id]; p.customShunts = c; return p; }, { label: `Remove ${e.label}` }); CTX.select(null); } });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
    }
    // A stent narrows at a short pinch in one of the segments Doppler samples: proximal (portal end), mid or distal.
    if (isStent(e)) {
      const at = verbs.findIndex((v) => v.id === 'remove');
      verbs.splice(at < 0 ? verbs.length : at, 0, { ...narrow, info: 'A short pinch in one segment of the stent. Its resistance rises with (1 − s)⁻⁴, and the jet through it speeds up by (1 − s)⁻².' }, { type: 'seg', id: 'site', label: 'Where', small: true,
        options: [['proximal', 'Proximal'], ['mid', 'Mid'], ['distal', 'Distal']], get: () => stentSite(store.get().params, id),
        set: (val) => updateParams((p) => { p.stenosisSite = { ...(p.stenosisSite || {}), [id]: val }; return p; }, { label: `${e.label} narrowing: ${val}` }) });
    }
    if (['S_PC', 'S_DSR', 'S_MC', 'REX'].includes(id)) {
      const key = { S_PC: 'portocaval', S_DSR: 'dsrs', S_MC: 'mesocaval', REX: 'rex' }[id];
      // A portocaval shunt is made end-to-side (the trunk divided at the liver) or side-to-side (the trunk kept): one model edge, the
      // ligation under it set by portocavalSide (engine.js).
      if (id === 'S_PC') verbs.push({ type: 'seg', id: 'pcKind', label: 'Made', small: true, options: [['end', 'End-to-side'], ['side', 'Side-to-side']],
        get: () => (store.get().params.portocavalSide ? 'side' : 'end'),
        set: (val) => updateParams((p) => { p.portocavalSide = val === 'side'; return p; }, { label: `Portocaval shunt: ${val === 'side' ? 'side-to-side' : 'end-to-side'}` }) });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame
      verbs.push({ type: 'button', id: 'remove', key, label: 'Take down shunt', short: 'Remove', icon: 'close', danger: true, run: () => { updateParams(id === 'S_PC' ? { portocaval: false, portocavalSide: false } : { [key]: false }, { label: `Remove ${e.label}` }); CTX.select(null); } });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
    }
    verbs.push(doppler);
  } else if (SIN_EDGES.has(id)) {
    // Each side's sinusoids: their own card, read at the station, with the liver's cirrhosis and its lobule.
    kicker = 'Liver microcirculation'; why = 'hvpg';
    // (The bar is the drop to the central vein; the bed has no one velocity or diameter, so its flow and resistance read beside it.)
    verbs.push(read('L/min', (f, c) => flowNum(c, bedStats(e, f).q)));
    verbs.push(read('mmHg·min/L', (f, c) => { const r = bedStats(e, f).r; return r == null ? '—' : memoTenth(c, r, FMT1); }));
    verbs.push(...ORGAN_BASE.get('liver').verbs);
  } else {
    kicker = portalSide ? 'Vein · portal system' : 'Vein · systemic';
    if (HEP_VEIN[id]) { kicker = 'Hepatic vein'; why = 'hvpg'; }
    if (['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L'].includes(id)) why = 'pvFlow';
    verbs.push(narrow, clot);
    verbs.push(doppler);
    verbs.push(shunt);
    if (id === 'SV_CONF' || id === 'SV_MID' || id === 'V_SPL') verbs.push({ type: 'link', label: 'Spleen', icon: 'vessel', run: () => CTX.select({ type: 'organ', id: 'spleen' }) });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
  }
  // Dye into this vessel, beside Doppler: a few seconds a press, or as long as it is held.
  if (!SIN_EDGES.has(id)) {
    const dye = { type: 'dye', id: 'dye', label: 'Inject dye', short: 'Dye', icon: 'drop', run: (o) => CTX.injectDye(id, o), release: () => CTX.releaseDye(), busy: () => CTX.dyeInjecting(), showIf: () => !!CTX.injectDye && CTX.canDye?.() !== false };
    const at = verbs.indexOf(doppler);
    if (at >= 0) verbs.splice(at + 1, 0, dye); else verbs.push(dye);
  }
  // (What a vessel is, in words, is in Details: the card shows numbers and verbs only.)
  return {
    key: 'e:' + id, sel: NORM_EDGE.get(id) || { type: 'edge', id }, kicker, title: e.label, why, edge: id, verbs, span,
    value: (f, lens, ref) => edgeValue(e, f, lens, ref, true),
    status: (f) => {
      if (isArt) return null;
      const q = f.Qf ? f.Qf[k] : f.Q[k];
      const refQ = store.get().healthy?.Q?.[k] ?? 1;
      if (Math.abs(q) < 0.05) return ST_STASIS;
      if (isShunt) return ST_PATENT;
      const back = q < -Math.max(0.12, 0.02 * Math.abs(refQ));
      // A collateral carries portal blood away from the liver; a link between two portal veins has no physiological direction (the pressure picks it).
      if (isColl) return back ? ST_PETAL : ST_FUGAL;
      if (e.portal) return null;
      if (portalSide) return back ? ST_FUGAL : ST_PETAL;
      return back ? ST_REVERSED : null;
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
const EV = { v: '', u: '', d: null, up: false };   // (the reading edgeValue hands back: written afresh by every call)
const CARD_HOLD = newHold();   // (the vessel card's reading, kept as steady keeps it)
const PRESS_CELL = newPCell();   // (the pressure lens's texts, made again only when what they print changes)
const SAT_TEXT = Array.from({ length: 101 }, (_, i) => String(i));
const satPct = (s) => { const i = Math.round(s * 100); return SAT_TEXT[i] ?? String(i); };
function edgeReading(e, f, lens, ref, range) {
  const k = EI[e.id], PF = f.Pf || f.P, st = STATION_OF[e.id];
  const P1 = PF[NI[e.from]], P2 = PF[NI[e.to]], P = st ? PF[NI[st]] : (P1 + P2) / 2;
  const q = (f.Qf ? f.Qf[k] : f.Q[k]) * 0.06;
  if (lens === 'flow') {
    const r = store.get().healthy?.Q?.[k];
    const d = r != null && Math.abs(r) > 0.3 ? ((Math.abs(q) - Math.abs(r * 0.06)) / Math.abs(r * 0.06)) * 100 : null;
    EV.v = fmtFlow(Math.abs(q)); EV.u = 'L/min'; EV.d = d != null && Math.abs(d) >= 5 ? signed(d, `${Math.round(Math.abs(d))}%`) : null; EV.up = d > 0;
    return EV;
  }
  if (lens === 'velocity' && e.kind === 'liver') { EV.v = '—'; EV.u = 'cm/s'; EV.d = null; EV.up = false; return EV; }   // a lumped bed has no one velocity
  // Velocity reads as Doppler does (peak, see dopplerK), so it matches the figure callouts and the Doppler monitor.
  if (lens === 'velocity') { EV.v = fmt(Math.abs(dopplerVel(f, k)), 0); EV.u = 'cm/s'; EV.d = null; EV.up = false; return EV; }
  if (lens === 'drop') { EV.v = fmt(P1 - P2, 1); EV.u = 'mmHg drop'; EV.d = null; EV.up = false; return EV; }
  // Oxygen saturation of the blood leaving the vessel (an artery's as it enters its bed); the sinusoids read in → out.
  if (lens === 'oxygen') {
    const o = oxygenFor(EDGES, NODES, f).edge, up = q >= 0 ? 2 * k : 2 * k + 1, dn = q >= 0 ? 2 * k + 1 : 2 * k;
    const a = o[up], b = e.kind === 'artery' || e.kind === 'arteriole' ? o[up] : o[dn];
    EV.v = Math.abs(a - b) >= 0.005 ? `${satPct(a)} → ${satPct(b)}` : satPct(b); EV.u = '% O₂ saturation'; EV.d = null; EV.up = false;
    return EV;
  }
  const p = store.get().params;
  if (range && (p?.thrombus?.[e.id] > 0 || p?.stenosis?.[e.id] > 0)) return { v: `${fmt(P1, 1)} → ${fmt(P2, 1)}`, u: 'mmHg' };
  // The change from the reference reads as the figure's callouts do: signed, one decimal, in the reading's colour.
  const r = ref ? (st ? ref[NI[st]] : (ref[NI[e.from]] + ref[NI[e.to]]) / 2) : null;
  partsP(PRESS_CELL, P, r);
  EV.v = S.v; EV.u = 'mmHg'; EV.d = S.d; EV.up = S.up;
  return EV;
}
/** A vessel's reading { v, u, d, up }. The object is reused: it is only good until the next call (the hover tip reads .v at once). On the
 *  vessel card (range) it is the card's own pair of kept readings, steady between changes, as card.js keeps the one it drew. */
export function edgeValue(e, f, lens, ref, range = false) {
  const r = edgeReading(e, f, lens, ref, range);
  return range ? steady(CARD_HOLD, r) : r;
}

// A capillary bed (each side's sinusoids) is lumped in the model: no one diameter or velocity, so it reads as its
// flow, the pressure it drops from the portal venules' end to the central vein, and its resistance (ΔP / Q).
// (The object is reused: good until the next call.)
const BED = { q: 0, dp: 0, r: null };
export function bedStats(e, f) {
  const k = EI[e.id], PF = f.Pf || f.P, q = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06, dp = PF[NI[e.from]] - PF[NI[e.to]];
  BED.q = q; BED.dp = dp; BED.r = q > 0.005 ? dp / q : null;
  return BED;
}

const BANDS_NOTE = (n) => `${Math.round(n)} band${n >= 1.5 ? 's' : ''} placed`;   // (it reads only Math.round(n): n >= 1.5 is Math.round(n) >= 2)
function buildVarixVerbs(site) {
  const eso = site === 'eso';
  const out = [];
  const bandsCell = newCell();
  if (eso) out.push({ type: 'button', id: 'band', label: 'Band', icon: 'band', run: () => { CTX.action({ kind: 'band' }); }, note: (f) => (f.bands ? memoKey(bandsCell, Math.round(f.bands), f.bands, BANDS_NOTE) : null) });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
  out.push({ type: 'button', id: 'endoscope', label: 'Endoscope', short: 'Scope', icon: 'endoscope', run: () => { CTX.paneApi('endoscopy')?.setView?.('eso'); CTX.showPane('endoscopy'); } });
  // The tamponade tube. Its gastric balloon is the first step: filled in the stomach, the tube drawn up so it seats against the cardia.
  // The esophageal balloon is the second, filled only if that does not hold, and only on a tube whose gastric balloon is up: switching it on
  // brings the gastric one with it, and letting the gastric one down lets the esophageal one down first.
  out.push({ type: 'toggle', id: 'balloon-gas', key: 'balloonGas', label: 'Gastric balloon', short: 'Gastric balloon', icon: 'balloon', get: (p) => !!p.balloonGas, set: (p, v) => { p.balloonGas = v; if (!v) p.balloonEso = false; }, hist: 'Gastric balloon' });
  if (eso) out.push({ type: 'toggle', id: 'balloon', key: 'balloonEso', label: 'Esophageal balloon', icon: 'balloon', get: (p) => !!p.balloonEso, set: (p, v) => { p.balloonEso = v; if (v) p.balloonGas = true; }, hist: 'Esophageal balloon' });
  return out;
}
const VARIX_ESO = buildVarixVerbs('eso'), VARIX_GAS = buildVarixVerbs('gas');
const VARIX_ESO_ACTS = VARIX_ESO.filter((v) => v.type === 'button'), VARIX_GAS_ACTS = VARIX_GAS.filter((v) => v.type === 'button');

const SPLEEN_RX = ['Spleen untreated', 'Partial splenic embolization', 'Splenectomy'];
const REMOVED = { v: 'Removed', u: '' };
const FMT1 = (x) => fmt(x, 1);
const PLATELETS = (n) => `${(Math.round(n) * 1000).toLocaleString('en-US')}/µL`;
function buildOrganCard(id) {
  const sel = { type: 'organ', id };
  if (id === 'liver') {
    const h = newHold();
    return {
      key: 'o:liver', sel, kicker: 'Organ', title: 'Liver', why: 'hvpg',
      value: (f, lens, ref) => readP(h, (f.Pf || f.P)[NI.SIN_R], ref?.[NI.SIN_R], 'mmHg sinusoids'),
      span: SPAN_HVPG,
      verbs: [
        // (Its inflows: the portal vein's and the hepatic artery's.)
        read('L/min', (f, c) => flowNum(c, (f.Qf ? f.Qf[EI.PV_TRUNK] : f.Q[EI.PV_TRUNK]) * 0.06), 'Portal'),
        read('L/min', (f, c) => flowNum(c, (f.Qf ? f.Qf[EI.A_HEP] : f.Q[EI.A_HEP]) * 0.06), 'Arterial'),
        CIRRHOSIS,
        { type: 'button', id: 'lobule', label: 'Open the lobule view', short: 'Lobule', icon: 'zones', run: () => CTX.zoomLobule() },
        { type: 'button', id: 'fibroscan', label: 'FibroScan', short: 'FibroScan', icon: 'probe', run: () => { CTX.showPane('fibroscan'); CTX.select(null); } },
      ],
    };
  }
  if (id === 'heart') {
    const h = newHold();
    const sl = (vid, key, label, short, min, max, def, info) => ({ type: 'slider', id: vid, key, label, short, icon: 'heart', min, max, step: 0.01, def, format: pct, get: (p) => p[key], set: (p, v) => { p[key] = v; }, hist: label, info });
    return {
      key: 'o:heart', sel, kicker: 'Organ', title: 'Right heart', why: 'ra',
      value: (f, lens, ref) => readP(h, (f.Pf || f.P)[NI.RA], ref?.[NI.RA], 'mmHg RA'),
      verbs: [
        sl('contractility', 'contractility', 'Contractility', 'Contractility', 0.15, 1.6, 1, 'Right ventricular contractility (Frank–Starling).'),
        sl('tr', 'tr', 'Tricuspid regurgitation', 'TR', 0, 1, 0, 'Systolic backflow into the right atrium: large v-waves reach the liver.'),
        sl('pericardial', 'pericardial', 'Pericardial constraint', 'Constriction', 0, 1, 0, 'Constrictive pericarditis limits filling.'),
        // On every patient's heart card; it starts at Not pregnant (0 weeks), so no patient changes until it is moved.
        { type: 'slider', id: 'gestation', key: 'gestation', label: 'Pregnancy', icon: 'clock', min: 0, max: 40, step: 1, def: 0, format: weeks, get: (p) => p.gestation || 0, set: (p, v) => { p.gestation = v; }, hist: 'Pregnancy',
          info: PREGNANCY_INFO },
        read('L/min', (f, c) => memoTenth(c, f.metrics.co, FMT1), 'CO'),
      ],
    };
  }
  if (id === 'varices' || id === 'gastric') {
    const h = newHold();
    const eso = id === 'varices';
    const vx = (f) => (eso ? f.metrics.varix : f.metrics.gastricVarix);
    const verbs = [...(eso ? VARIX_ESO : VARIX_GAS)];
    if (!eso) verbs.push({ type: 'toggle', id: 'occlude', key: 'occluded', label: 'Occlude the gastrorenal shunt (BRTO)', short: 'BRTO', icon: 'occlude', showIf: (p) => p.spontaneous.C5 !== false, get: (p) => !!p.occluded.C5, set: (p, v) => { if (v) p.occluded.C5 = true; else delete p.occluded.C5; }, hist: 'BRTO' });
    verbs.push(read('', (f, c) => {
      const v = vx(f);
      if (!v.present) return 'none';
      const k = tenth(v.d);
      if (c.x !== k || c.y !== v.grade.label) { c.x = k; c.y = v.grade.label; c.s = `${v.grade.label} · ${fmt(v.d, 1)} mm`; }
      return c.s;
    }, 'Grade'));
    if (eso) verbs.push({ type: 'link', label: 'Left gastric vein', icon: 'vessel', run: () => CTX.select({ type: 'edge', id: 'LGV_CONF' }) });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
    else verbs.push({ type: 'link', label: 'Short gastric veins', icon: 'vessel', run: () => CTX.select({ type: 'edge', id: 'C2' }) });   // alloc-rare: a click handler (a verb of the open card): runs once per tap, never in a frame; the scan reaches it only through the conservative callback dispatch of the halo step
    const n = NI[eso ? 'VAR' : 'GV'];
    return {
      key: 'o:' + id, sel, kicker: 'Collateral bed', title: eso ? 'Esophageal varices' : 'Fundal varices', why: 'varix', verbs,
      value: (f, lens, ref) => readP(h, (f.Pf || f.P)[n], ref?.[n], 'mmHg'),
      status: (f) => (f.metrics.bleeding && (f.metrics.bleeding.site === 'GV') === !eso ? ST_BLEEDING : vx(f).redWale ? ST_WALE : null),
    };
  }
  if (id === 'spleen') {
    const h = newHold(), lenCell = newCell();
    return {
      key: 'o:spleen', sel, kicker: 'Organ', title: 'Spleen', why: 'spleen',
      value: (f) => (f.metrics.spleen.length > 0 ? plain(h, memoTenth(lenCell, f.metrics.spleen.length, FMT1), 'cm long') : REMOVED),
      verbs: [
        read('', (f, c) => memoKey(c, Math.round(f.metrics.spleen.platelets), f.metrics.spleen.platelets, PLATELETS), 'Platelets'),
        { type: 'seg', label: 'Treat', options: [[0, 'None'], [1, 'Embolize'], [2, 'Splenectomy']], get: () => store.get().params.splenicRx | 0, set: (val) => updateParams((p) => { p.splenicRx = val; return p; }, { label: SPLEEN_RX[val] }) },
        { type: 'slider', id: 'clot', key: 'thrombus', label: 'Splenic vein thrombosis', icon: 'clot', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.thrombus.SV_CONF || 0,
          set: (p, v) => { if (v <= 0.004) delete p.thrombus.SV_CONF; else p.thrombus.SV_CONF = +v.toFixed(2); }, hist: 'Splenic vein thrombus', info: 'Sinistral (left-sided) portal hypertension: splenic outflow decompresses through the short gastric veins.' },
        { type: 'link', label: 'Splenic vein', icon: 'vessel', run: () => CTX.select({ type: 'edge', id: 'SV_CONF' }) },
      ],
    };
  }
  return null;
}

// ── The lobule's parts (the lobule view selects them) ────────────────────
// (Its marks: 40% compensated, 60% clinically significant portal hypertension, 85% decompensated.)
const CIRRHOSIS = { type: 'slider', id: 'cirrhosis', key: 'cirrhosis', label: 'Cirrhosis', icon: 'liver', min: 0, max: 1, step: 0.01, def: 0, format: pct, get: (p) => p.cirrhosis, set: (p, v) => { p.cirrhosis = v; }, hist: 'Cirrhosis',
  ticks: [0.4, 0.6, 0.85], tickNames: '40% compensated, 60% CSPH, 85% decompensated' };
const ZONE_NAME = { pre: 'portal tract', sin: 'sinusoids', post: 'central vein' };
/** Fibrosis in one zone of every lobule (both lobes: one lobule stands for the liver). */
const fibrosisVerb = (z) => ({ type: 'slider', id: 'fibrosis', key: 'fibrosis', label: `Fibrosis · ${ZONE_NAME[z]}`, short: 'Fibrosis', icon: 'fibrosis', min: 1, max: 80, step: 0.5, def: 1, format: mult,
  get: (p) => Math.max(p.fibrosis.R[z], p.fibrosis.L[z]), set: (p, v) => { p.fibrosis.R[z] = v; p.fibrosis.L[z] = v; }, hist: `Fibrosis · ${ZONE_NAME[z]}`,
  info: { pre: 'Resistance before the sinusoids, as in schistosomiasis: portal pressure rises, the WHVP does not.', sin: 'Collagen in the space of Disse and closing fenestrae: resistance in the sinusoids themselves, measured by the HVPG.', post: 'Resistance at the central veins, as in sinusoidal obstruction syndrome: the sinusoids congest from the outflow side.' }[z] });
const FIB_PRE = fibrosisVerb('pre'), FIB_SIN = fibrosisVerb('sin'), FIB_POST = fibrosisVerb('post');
const ZONE_TEXT = ['Zone 1 (periportal) gets blood first, richest in oxygen and nutrients: the first to regenerate, the last to undergo necrosis in ischemia.', 'Zone 2 lies between: intermediate oxygen.', 'Zone 3 (centrilobular) gets blood last, poorest in oxygen: first injured in congestion, shock and drug toxicity (acetaminophen).'];

// The lobule's portal flow runs backward (the same dead band as every other reversed-flow sentence: velNormal.js flowReversed).
const portalBack = (m) => flowReversed(m.portalQ, m.portalRef);

const L = (f) => lobuleState(f, store.get());
const REFM = { P1: 0, P2: 0, P3: 0 };   // (the reference's pressures along the lobule, in the shape of the lobule's own)
const getP1 = (m) => m.P1, getP2 = (m) => m.P2, getP3 = (m) => m.P3;
/** The lobule stat row: text(m, cell) works out its text from the lobule's state. */
function lstat(label, text) { const c = newCell(); return { type: 'stat', label, value: (f) => text(L(f), c) }; }
/** The reading of a pressure along the lobule, against the reference. */
function lpressure(get) {
  const h = newHold();
  return (f, lens, ref) => {
    const x = get(L(f));
    let r = null;
    if (ref) { REFM.P1 = ref[NI.RPV]; REFM.P2 = ref[NI.SIN_R]; REFM.P3 = ref[NI.CV_R]; r = get(REFM); }
    return readP(h, x, r, 'mmHg');
  };
}
/** A part's "what is this and what is happening to it", in plain words: fill(m, out) pushes the sentences that apply, in order (into a
 *  list kept for the card, which reads it at once). */
function lobuleAbout(fill) { const out = []; return { type: 'about', text: (f) => { if (!f) return NONE; out.length = 0; fill(L(f), out); return out; } }; }
/** The same sentence(s) whatever the state. */
function lobuleSaid(...lines) { return { type: 'about', text: (f) => (f ? lines : NONE) }; }

const TRIAD_A = 'Blood enters the lobule here: portal venous blood (about three quarters) and hepatic arterial blood, with a bile ductule carrying bile the other way. Inlet venules run along the lobule’s edge and feed the sinusoids.';
const TRIAD_FIB = (x) => `Portal fibrosis (resistance ×${fmt(x, 1)}) narrows the venules before the sinusoids: pre-sinusoidal portal hypertension, with a near-normal wedged pressure.`;
const TRIAD_BACK = 'Portal flow is reversed: blood leaves the liver through the portal venules (hepatofugal flow).';
const IN_A = 'A branch of the portal venule running along the lobule’s border, feeding the sinusoids it passes.';
const IN_BACK = 'Flow here runs backwards (orange): arterial blood that entered the sinusoids drains out through the portal venules.';
const AN_A = 'A cross-link between sinusoids: blood can go around a local resistance, so one narrowed sinusoid does not leave the hepatocytes beyond it ischemic.';
const SIN_A = 'A leaky capillary lined by fenestrated endothelium, between plates of hepatocytes one cell thick. Sinusoids merge toward the central vein, so blood speeds up as it goes; the highlighted path runs to the central vein.';
const SIN_FIB = 'Capillarization: the fenestrae close and collagen fills the space of Disse (pale sleeve), raising sinusoidal resistance: this is what raises HVPG in cirrhosis.';
const SIN_CONG = 'Zone 3 sinusoids are dilated and engorged: hepatic venous outflow congestion.';
const CV_A = 'Collects the sinusoids and drains into the hepatic veins. Zone 3 around it gets the least oxygen.';
const CV_FIB = (x) => `Fibrosis around the central vein (×${fmt(x, 1)}) makes the resistance post-sinusoidal.`;
const CV_CONG = 'Raised outflow pressure congests zone 3 first: sinusoidal dilation and hepatocyte necrosis give the “nutmeg” liver.';
const HA_A = 'Oxygen-rich blood that empties into the first stretch of the sinusoids (zone 1).';
const HA_BUFFER = (x) => `Hepatic arterial buffer response: with less portal flow, less adenosine is washed out and the arteriole dilates (arterial flow ×${fmt(x, 1)}).`;
const BD_A = 'Bile made by hepatocytes flows in canaliculi between them, toward the triad: against the blood. Not part of the circulation, but it marks the portal tract.';
const LV_A = 'Lymph is plasma that leaks from the sinusoids into the space of Disse, drains out through the tissue to the portal tract and leaves the liver in its lymphatics. It carries the protein that escapes the sinusoids, and returns the fluid to the blood through the thoracic duct.';
const LV_UP = 'Higher sinusoidal pressure forces more fluid out: lymph flow rises to compensate. Beyond lymphatic capacity, the excess transudes from the liver surface as ascites.';
const LV_DOWN = 'Less filtration than the comparison: lymph flow has fallen.';
const SEPTUM_A = 'Bands of collagen laid down by activated stellate cells bridge triad to triad and triad to central vein, cutting the lobules into regenerative nodules and distorting the vessels.';
const HEP_CONG = 'Hepatic venous outflow congestion: sinusoidal dilation and hepatocyte dropout around the central vein.';
const BILE = { v: 'Bile', u: 'flows out to the triad' };
const PLUS_MM = (x) => `+${fmt(x, 1)} mmHg`;

// The lobule's cards depend on the part (and, for a hepatocyte, its zone) alone, so the same card serves every tube and triad of it.
// (They carry no key or selection of their own: nothing reads them.)
const LOBULE_BASE = { kicker: 'Lobule', why: 'hvpg', noDetails: true };
function buildLobuleCards() {
  const cards = new Map();
  const portalPct = (m, c) => (portalBack(m) ? 'reversed' : pctOf(c, Math.max(0, m.portal)));
  const artPct = (m, c) => pctOf(c, m.art);
  const centralMm = (m, c) => fixedText(c, m.P3, 'mmHg');
  {
    const c = newCell();
    cards.set('triad', { ...LOBULE_BASE, title: 'Portal triad', value: lpressure(getP1),
      verbs: [lobuleAbout((m, o) => { o.push(TRIAD_A); if (m.fibPre > 0.1) o.push(memoTenth(c, m.zone.pre, TRIAD_FIB)); if (portalBack(m)) o.push(TRIAD_BACK); }),
        FIB_PRE, lstat('Portal inflow', portalPct), lstat('Arterial inflow', artPct)] });
  }
  cards.set('in', { ...LOBULE_BASE, title: 'Inlet venule', value: lpressure(getP1),
    verbs: [lobuleAbout((m, o) => { o.push(IN_A); if (portalBack(m)) o.push(IN_BACK); }),
      FIB_PRE, lstat('Portal inflow', portalPct)] });
  // (A sinusoid and a cross-link between sinusoids read alike but for the first sentence.)
  for (const part of ['sin', 'an']) {
    const first = part === 'an' ? AN_A : SIN_A;
    cards.set(part, { ...LOBULE_BASE, title: part === 'an' ? 'Sinusoidal anastomosis' : 'Sinusoid', value: lpressure(getP2),
      verbs: [lobuleAbout((m, o) => { o.push(first); if (m.fibSin > 0.1) o.push(SIN_FIB); if (m.congU > 0.1) o.push(SIN_CONG); }),
        { type: 'button', id: 'sinusoid', label: 'Zoom into the sinusoid', short: 'Sinusoid', icon: 'explore', run: () => CTX.askSinusoid() },
        FIB_SIN, CIRRHOSIS, lstat('Into the central vein', centralMm), lstat('Sinusoidal flow', (m, c) => pctOf(c, m.flow))] });
  }
  {
    const c = newCell();
    cards.set('cv', { ...LOBULE_BASE, title: 'Central vein', value: lpressure(getP3),
      status: (f) => (L(f).congU > 0.1 ? ST_CONGESTED : null),
      verbs: [lobuleAbout((m, o) => { o.push(CV_A); if (m.fibPost > 0.1) o.push(memoTenth(c, m.zone.post, CV_FIB)); if (m.congU > 0.1) o.push(CV_CONG); }),
        FIB_POST, lstat('Hepatic vein', (m, cc) => fixedText(cc, m.P4, 'mmHg')),
        lstat('Above normal', (m, cc) => (m.congU > 0.05 ? memoTenth(cc, m.cong, PLUS_MM) : 'none'))] });
  }
  {
    const c = newCell(), h = newHold(), vc = newCell();
    cards.set('ha', { ...LOBULE_BASE, title: 'Hepatic arteriole', value: (f) => plain(h, pctOf(vc, L(f).art), 'of normal flow'),
      verbs: [lobuleAbout((m, o) => { o.push(HA_A); if (m.art > 1.15) o.push(memoTenth(c, m.art, HA_BUFFER)); })] });
  }
  cards.set('bd', { ...LOBULE_BASE, title: 'Bile ductule', value: () => BILE, verbs: [lobuleSaid(BD_A)] });
  {
    const h = newHold();
    cards.set('lv', { ...LOBULE_BASE, title: 'Lymphatic',
      value: (f) => {
        // (Its texts are made again only when what they print changes: the tenth of the lymph; the change's sign and whole percent, when it shows.)
        const m = L(f), c = h.pc, d = m.lymph - m.lymphRef, shown = m.lymphRef > 0 && Math.abs(d) / m.lymphRef >= 0.1;
        const kP = tenth(m.lymph), kD = shown ? (d > 0 ? 1 : -1) * (Math.round(Math.abs(d) / m.lymphRef * 100) + 1) : 0, up = d > 0;
        if (kP !== c.kP || kD !== c.kD || up !== c.up) {
          c.v = fmt(m.lymph, 1);
          c.d = shown ? signed(d, `${Math.round(Math.abs(d) / m.lymphRef * 100)}%`) : null;
          c.kP = kP; c.kD = kD; c.up = up;
        }
        S.v = c.v; S.u = 'mL/min (whole liver)'; S.d = c.d; S.up = up;
        return steady(h, S);
      },
      verbs: [lobuleAbout((m, o) => { o.push(LV_A); if (m.lymph > m.lymphRef * 1.25) o.push(LV_UP); if (m.lymph < m.lymphRef * 0.75) o.push(LV_DOWN); }),
        lstat('Hepatic lymph', (m, c) => fixedText(c, m.lymph, 'mL/min')), lstat('Healthy', (m, c) => fixedText(c, m.lymph0, 'mL/min'))] });
  }
  {
    const h = newHold(), vc = newCell();
    cards.set('septum', { ...LOBULE_BASE, title: 'Fibrous septum', value: (f) => plain(h, pctOf(vc, L(f).s), 'cirrhosis'),
      verbs: [lobuleSaid(SEPTUM_A), CIRRHOSIS] });
  }
  return cards;
}
// A hepatocyte's card, by zone 1 to 3 (the lobule picks only those).
function buildHepCards() {
  const cards = [null];
  for (let z = 1; z <= 3; z++) {
    cards.push({ ...LOBULE_BASE, title: `Hepatocytes · zone ${z}`, value: () => HEP_VALUE[z],
      verbs: [lobuleAbout((m, o) => { o.push(ZONE_TEXT[z - 1]); if (z === 3 && m.congU > 0.1) o.push(HEP_CONG); }), CIRRHOSIS] });
  }
  return cards;
}
const HEP_VALUE = [null, { v: 'Zone 1', u: 'periportal' }, { v: 'Zone 2', u: 'midzonal' }, { v: 'Zone 3', u: 'centrilobular' }];

// ── The catalogue ──────────────────────────────────────────────────────────
// Every card, made once here and looked up by cardFor.
const ORGAN_BASE = new Map(), ORGAN_CARD = new Map(), EDGE_CARD = new Map();
for (const id of ['liver', 'heart', 'varices', 'gastric', 'spleen']) ORGAN_BASE.set(id, buildOrganCard(id));
for (const [id, c] of ORGAN_BASE) ORGAN_CARD.set(id, c);   // (what an organ is, in words, is in Details)
for (const e of EDGES) if (e.kind !== 'wedge') EDGE_CARD.set(e.id, buildEdgeCard(e));
const LOBULE_CARD = buildLobuleCards(), HEP_CARD = buildHepCards();

/**
 * The action-card model for a selection.
 * ctx: { action, showPane, probe, startShunt, canShunt, select, zoomLobule, paneApi }
 * (The model is kept and handed back each time; card.js only reads it.)
 */
export function cardFor(selIn, ctx) {
  CTX = ctx;
  const sel = normalizeSel(selIn);
  if (!sel) return null;
  if (sel.type === 'lobule') return LOBULE_CARD.get(sel.part) || HEP_CARD[sel.zone || 1] || HEP_CARD[1];
  if (sel.type === 'organ') return ORGAN_CARD.get(sel.id) || null;
  return EDGE_CARD.get(sel.id) || null;
}

/** Can a shunt start from this vessel (a portal vessel or a systemic vein)? */
export function shuntable(id) {
  const e = EDGES[EI[id]];
  if (!e || !['vein', 'collateral'].includes(e.kind)) return false;
  return [e.from, e.to].some((n) => SHUNT_PORTAL.includes(n) || SHUNT_SYSTEMIC.includes(n));
}

// ── Clinical orders (the Treat section and the command palette) ────────────
export const DRUG_NOTE = { propranolol: 'Nonselective beta-blocker', carvedilol: 'Beta-blocker + α1 blockade', terlipressin: 'Vasopressin analogue', octreotide: 'Somatostatin analogue' };
