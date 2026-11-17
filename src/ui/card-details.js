// The details of a structure, inside its own card (17 Nov 2026, Mohammad: "have the card itself slide into these extensive more details... Not make a new pop up").
// A tap on the card's name slides the card's face away and this view in, in the same box; Back slides the face home. It replaced the Details panel (a side panel
// on a Mac or an iPad, a sheet on an iPhone), which said the card's own numbers again under a second name: both pressures and the drop, the flow, the velocity, the
// diameter and a Doppler button. What it keeps is what the card does not say: which two stations the bar's pressures belong to, the vessel's resistance and
// its healthy flow (or how far a collateral has opened), the organ's own numbers the card leaves out, why the value is what it is (the Why? explainer), and
// what the structure is, in words. Built when it is opened, never with the card; its numbers follow the model frame (update), each worded once per value.

import { EDGES, NODES, dMinOf } from '../engine/topology.js';
import { wallShare } from '../engine/wall-read.js';
import { store } from './store.js';
import { h, clamp, icon, putText } from './util.js';
import { newCell, numText, lpmText, Pof, Qof } from './live-readings.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// What the About card says of a vessel: the words by its id, or by its left-hand twin's.
const ABOUT_EDGE = {
    PV_TRUNK: 'Carries about 75% of hepatic blood flow (≈1.1 L/min). Normal Doppler velocity 15 to 40 cm/s, hepatopetal (the mean across the lumen is about 0.57 of that). The portal system has no valves: flow follows the pressure gradient.',
    C1a: 'The left gastric (coronary) vein feeds the esophageal submucosal plexus: the source of esophageal varices.',
    C1b: 'Esophageal varices drain to the azygos vein and SVC. Modeled wall stress follows ΔP · r / w (an educational index, not a measured stress).',
    C2: 'Short and posterior gastric veins connect the splenic vein to the fundus: the route of isolated gastric varices in splenic vein thrombosis.',
    C3: 'The recanalized paraumbilical vein runs from the left portal vein along the falciform ligament to the umbilicus (caput medusae, Cruveilhier–Baumgarten murmur).',
    C4: 'Superior rectal (portal) ↔ middle and inferior rectal (systemic) veins: anorectal varices, not hemorrhoids.',
    C5: 'Gastrorenal shunt: fundal varices → left inferior phrenic / adrenal → left renal vein. The target of BRTO.',
    C6: 'Spontaneous splenorenal shunt: large, can divert portal flow from the liver and cause hepatic encephalopathy.',
    C7: 'Retroperitoneal veins of Retzius connect mesenteric veins to lumbar and renal veins.',
    C8: 'Periportal (pericholedochal) collaterals bypass an occluded portal vein: cavernous transformation, which stays hepatopetal.',
    C9: 'The ascending lumbar–azygos route decompresses the IVC when IVC outflow resistance is high.',
    TIPS: 'A covered stent from a portal branch to a hepatic vein. After a TIPS for variceal bleeding a portosystemic gradient <12 mmHg is the reference (AASLD 2024); for ascites the response decides. Risks: hepatic encephalopathy, reduced hepatic perfusion, increased cardiac preload.',
    CAUD: 'The caudate lobe drains straight into the IVC through its own short veins, so it is spared (and hypertrophies) in Budd–Chiari syndrome.',
    PRE_R: 'Presinusoidal segment: portal venules in the portal tract. Resistance rises here in schistosomiasis and other non-cirrhotic portal hypertension.',
    SIN_RR: 'Sinusoids: normally low-resistance, fenestrated and compliant. In cirrhosis, collagen in the space of Disse, stellate-cell contraction and capillarization raise their resistance.',
};
// (17 Nov 2026, play-test: "Portal vein (where the coronary vein joins it) → Portal vein (hilum)". A node's own label is its figure label; where a vessel is cut into segments,
// two ends carry the same vessel name, so a station is named by its place along the vessel. Every other node keeps its label. tests/card-details.test.js: no segment's two ends read alike.)
const STATION = {
  SMV_R: 'Mesenteric veins, at the retroperitoneal exit', SVD: 'Splenic vein, midway', SV: 'Splenic vein, near the confluence',
  CONF: 'Portal vein, at the confluence', PVT_L: 'Portal vein, at the coronary vein', PVH: 'Portal vein, at the hilum',
  RPV_A: 'Right portal vein, at the arterioportal shunt', RPV_T: 'Right portal vein, at the TIPS origin', RPV: 'Right portal vein, at the liver',
  LPV_A: 'Left portal vein, at the arterioportal shunt', LPV: 'Left portal vein, at the liver',
  RHV: 'Right hepatic vein, near the central veins', RHV_T: 'Right hepatic vein, at the TIPS outflow',
  IVCI: 'IVC, infrahepatic', IVC_D: 'IVC, at the DIPS outflow', IVCS: 'IVC, suprahepatic',
  SVC_E: 'Superior vena cava, at the epigastric veins', ILI_R: 'Common iliac veins, at the retroperitoneal veins', LRV_S: 'Left intrarenal veins, at the splenorenal shunts',
};
/** The place a vessel's end stands, in words: its own label, or its place along a vessel that is cut into segments. */
export const stationName = (id) => STATION[id] || NODES[NI[id]].label;

const aboutEdge = (e) => ABOUT_EDGE[e.id] || ABOUT_EDGE[e.id.replace(/_L$|L$/, '')] || `${e.label}. Connects ${stationName(e.from)} → ${stationName(e.to)} (physiological flow direction).`;   // alloc-rare: the About card is made when a vessel is selected


// What an organ is, in words, and the one or two numbers its card does not carry. (The card's own: the liver's sinusoid pressure, HVPG and inflows; the heart's
// RAP and output; a varix's pressure, grade and size; the spleen's length and platelets.)
const ORGAN_ABOUT = {
  liver: ['Organ', 'Blood crosses three resistances in series: portal venules (presinusoidal), sinusoids and central veins (postsinusoidal). Cirrhosis raises sinusoidal resistance; schistosomiasis raises it in the portal tracts; sinusoidal obstruction syndrome, in the central veins. The hepatic arterial buffer response offsets falls in portal flow.'],
  heart: ['Organ', 'The right atrium receives both venae cavae. Right atrial pressure (RAP) sets the downstream pressure of the whole venous system: right ventricular failure or tricuspid regurgitation raises every pressure upstream, including the FHVP, so the HVPG stays normal.'],
  varices: ['Collateral bed', 'Submucosal veins of the lower esophagus fed by the left gastric (coronary) vein and draining to the azygos. Wall stress follows Laplace: σ = ΔP · r / w, so large thin-walled varices rupture.'],
  gastric: ['Collateral bed', 'Fed by the short and posterior gastric veins, often draining through a gastrorenal shunt to the left renal vein. They bleed at lower pressures than esophageal varices; BRTO occludes the shunt.'],
  spleen: ['Organ', 'Portal hypertension causes congestive splenomegaly and platelet sequestration. Splenic vein thrombosis causes left-sided (sinistral) portal hypertension with fundal varices.'],
};

const ORGAN_STATS = {
  liver: [['Hepatic perfusion', (f, c) => numText(c, f.metrics.liverPerfPct, 0, '%')]],
  heart: [['Mean arterial pressure', (f, c) => numText(c, f.metrics.map, 0, ' mmHg')], ['Heart rate', (f, c) => numText(c, f.metrics.hr, 0, ' /min')]],
  varices: [['Wall stress', (f, c) => numText(c, wallShare(f.metrics.varix) * 100, 0, '% of rupture threshold')]],
  gastric: [['Wall stress', (f, c) => numText(c, wallShare(f.metrics.gastricVarix) * 100, 0, '% of rupture threshold')]],
  spleen: [],
};
const kickerOfEdge = (e) => (e.kind === 'collateral' ? `Collateral · ${e.code}` : e.kind === 'arteriole' || e.kind === 'artery' ? 'Artery' : e.kind === 'liver' ? 'Liver microcirculation' : e.kind === 'shunt' ? 'Shunt' : 'Vein');

/**
 * What a card's details say, as data (no page needed): { kicker, between, stats: [[name, (frame, cell) => text]], about, why } for the card model `m` (actions.js
 * cardFor), or null for a card with no details (a lobule part's). `between` names the two stations a vessel's bar reads, `why` is the card's own Why? id.
 */
export function detailsPlan(m) {
  const edge = m.edge ? EDGES[EI[m.edge]] : null, organ = !edge && m.sel?.type === 'organ' ? ORGAN_ABOUT[m.sel.id] : null;
  if (!edge && !organ) return null;
  if (!edge) return { kicker: organ[0], between: null, stats: ORGAN_STATS[m.sel.id] || [], about: organ[1], why: m.why || null };
  const k = EI[edge.id], iFrom = NI[edge.from], iTo = NI[edge.to];
  return {
    kicker: kickerOfEdge(edge), between: `${stationName(edge.from)} → ${stationName(edge.to)}`, about: aboutEdge(edge), why: m.why || null,
    stats: [
      ['Resistance', (f, c) => { const q = Qof(f)[k]; return Math.abs(q) > 1e-3 ? numText(c, (Pof(f)[iFrom] - Pof(f)[iTo]) / (q * 0.06), 2, ' WU') : '∞'; }],
      // (A collateral: how far it has opened. A shunt: nothing, a healthy patient has none, so its healthy flow is always nought. Any other vessel: its flow in a healthy patient.)
      ...(edge.kind === 'collateral'
        ? [['Recruited', (f, c) => numText(c, clamp(((f.slow.dEff?.[edge.id] ?? f.slow.d[edge.id]) - dMinOf(edge)) / (edge.dMax - dMinOf(edge)), 0, 1) * 100, 0, '%')]]
        : edge.kind === 'shunt' ? [] : [['Healthy flow', (f, c) => { const q = store.get().healthy?.Q?.[k]; return q != null ? lpmText(c, q * 0.06) : '—'; }]]),
    ],
  };
}

/**
 * createCardDetails(m, { onWhy, onBack }) → { el, update(f), focus() } for the card model `m`, or null for a card with no details.
 * `el` is the view the card slides in (class ac-details); onBack() is the card's way home; onWhy(metric, el) opens the Why? explainer beside the tapped button.
 * The numbers are written by update(frame) from the card's own per-frame pass.
 */
export function createCardDetails(m, { onWhy, onBack }) {
  const plan = detailsPlan(m);
  if (!plan) return null;
  const live = [];   // [el, fn(frame, cell), cell]
  const rows = [];
  // (Which two stations the bar's two pressures are: the card prints them without a name.)
  if (plan.between) rows.push(h('p', { class: 'ad-between' }, h('em', {}, 'Between'), plan.between));   // alloc-rare: built when the details open (a tap), never per frame
  if (plan.stats.length) {
    rows.push(h('div', { class: 'ad-stats' }, plan.stats.map(([k, fn]) => {   // alloc-rare: built when the details open
      const v = h('b', { class: 'ad-v' });   // alloc-rare: built when the details open
      live.push([v, fn, newCell()]);
      return h('div', { class: 'ad-stat' }, h('em', {}, k), v);   // alloc-rare: built when the details open
    })));
  }
  const why = plan.why ? h('button', { class: 'ad-why', type: 'button', onclick: (e) => onWhy(plan.why, e.currentTarget) }, icon('bulb'), h('span', {}, 'Why this value?')) : null;   // alloc-rare: built when the details open
  const title = m.title;
  const back = h('button', { class: 'ad-back', type: 'button', 'aria-label': `Back to ${title}`, onclick: onBack }, icon('chev-left'), h('span', {}, title));   // alloc-rare: built when the details open
  const head = h('div', { class: 'ad-head' }, back, h('span', { class: 'ad-kicker' }, plan.kicker));   // alloc-rare: built when the details open
  const el = h('section', { class: 'ac-details', role: 'region', 'aria-label': `${title}: details` }, head, h('div', { class: 'ad-scroll' }, rows, why, h('p', { class: 'ad-about' }, plan.about)));   // alloc-rare: built when the details open
  return {
    el,
    update(f) { if (!f) return; for (let i = 0; i < live.length; i++) { const x = live[i], v = x[1](f, x[2]); if (v != null) putText(x[0], v); } },
    focus() { back.focus({ preventScroll: true }); },
  };
}
