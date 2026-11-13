// Recurrent or refractory ascites: Baveno VIII 6.3 to 6.11 (hydrothorax 6.7, age ≥70 years 6.8). TIPS first; if it is not possible or not
// enough, long-term albumin, a transplant discussion, and a home drainage device for a patient who is no transplant candidate.
// Patient { tips, lt }. The figure-less algorithm: the foot says nothing.
import { inheritTone } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'Recurrent or refractory ascites', r: 'Consider TIPS', s: 'Discuss TIPS and transplant together. Check renal function first (eGFR, CKD stage).', stmt: '6.3, 6.4, 6.9', tone: 'n', kids: [
    { id: 'tips', t: 'TIPS possible', r: 'TIPS, dilated only as needed', s: 'Smallest diameter that gives a response. Dilate stepwise if ascites does not improve.', stmt: '6.5, 6.6', tone: 'ok', sh: 'TIPS' },
    { id: 'nt', t: 'TIPS not possible, or not enough', r: 'Consider long-term albumin', stmt: '6.10', tone: 'warn', sh: 'No TIPS', kids: [
      { id: 'lt', t: 'Transplant candidate', r: 'Transplant discussion', s: 'Albumin until then.', stmt: '6.4', tone: 'ok', sh: 'Transplant' },
      { id: 'drain', t: 'Not a transplant candidate', r: 'Home drainage device', s: 'Tunneled peritoneal catheter or low-flow pump, instead of repeated large-volume paracentesis.', stmt: '6.11', tone: 'bad', sh: 'Drain' },
    ] },
  ],
}, 'n');

const DEFAULT = { tips: true, lt: true };

export default {
  id: 'ascites',
  label: 'Recurrent or refractory ascites',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree,
  mapWords: { tips: ['TIPS'], nt: ['No TIPS'], lt: ['Transplant'], drain: ['Home', 'drain'] },
  lit(p) {
    const L = new Set(['root']);
    if (p?.tips !== false) L.add('tips');
    else { L.add('nt'); L.add(p?.lt === false ? 'drain' : 'lt'); }
    return L;
  },
  outcomes: ['tips', 'lt', 'drain'],
  outcomeOf: (L) => ['tips', 'lt', 'drain'].find((k) => L.has(k)) || null,
  reading(key) {
    if (key === 'tips') return { head: 'TIPS', tone: 'ok', stmt: '6.3, 6.5', why: 'Recurrent or refractory ascites, and TIPS is possible.', next: 'Dilate the stent only to the smallest diameter that gives an adequate response, and dilate it stepwise if ascites does not improve. Discuss transplant at the same time.' };
    if (key === 'lt') return { head: 'Transplant discussion', tone: 'ok', stmt: '6.4, 6.10', why: 'TIPS is not possible or did not help, and the patient is a transplant candidate.', next: 'Meanwhile, long-term albumin may improve ascites control and reduce ascites-related complications.' };
    return { head: 'Home drainage device', tone: 'bad', stmt: '6.11, 6.10', why: 'TIPS is contraindicated or did not work, and the patient is not a transplant candidate.', next: 'A tunneled peritoneal catheter or a low-flow pump, instead of repeated large-volume paracentesis. Long-term albumin may be considered.' };
  },
  chips(p) {
    const noTips = p?.tips === false;
    return ['Refractory ascites', noTips ? 'No TIPS' : 'TIPS possible', noTips && (p?.lt === false ? 'Not a transplant candidate' : 'Transplant candidate')].filter(Boolean);
  },
  patientFor(tool) {
    const b = { ...DEFAULT, ...(tool?.patient || {}) };
    return { tips: b.tips !== false, lt: b.lt !== false };
  },
  worst: { tips: false, lt: false },
  notes: 'In recurrent or refractory ascites TIPS should be considered (6.3, strong), and TIPS and liver transplant discussed together (6.4). Renal function is assessed first and chronic kidney disease staged by eGFR (6.9). To limit overshunting (hepatic encephalopathy, heart failure) the stent may be dilated only to the smallest diameter that gives an adequate response (6.5, weak), and dilated stepwise when ascites does not improve (6.6). TIPS is also advised for refractory hepatic hydrothorax (6.7), and may be considered case by case in selected adults aged ≥70 (6.8). If the patient is not a TIPS candidate, long-term albumin may be considered (6.10, weak). If TIPS is contraindicated or inadequate and the patient is not a transplant candidate, a home drainage device (tunneled peritoneal catheter or low-flow pump) may replace repeated large-volume paracentesis (6.11, weak). The branches for encephalopathy, HRS-AKI and SBP (6.12 to 6.22) are separate algorithms.',
};
