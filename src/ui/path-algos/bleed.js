// Acute variceal bleeding from an oesophageal varix or GOV1: Baveno VIII Fig. 3 and 5.4, 5.16, 5.18, 5.20, 5.31, 5.35 to 5.37. Three leaf columns (E3, 7 Nov 2026):
// the gastric half of the figure (GOV2, IGV1; 5.39 to 5.41) is its own chart, gastric.js. Patient { src: 'ov', cp, active, hvpg, ctrl, fit }.
import { PTIPS_HVPG } from '../../engine/pressure-cuts.js';
import { inheritTone, cpClass } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'Suspected variceal bleeding', r: 'Esophageal varix or GOV1', s: 'Vasoactive drug, antibiotics, restrictive transfusion. Endoscopy within 12 h. Band ligation.', stmt: '5.18', tone: 'n', kids: [
    { id: 'ctrl', t: 'Bleeding controlled', tone: 'ok', sh: 'Controlled', kids: [
      { id: 'ptips', t: 'Meets pTIPS criteria', r: 'Preemptive TIPS within 72 h', s: 'Child–Pugh C 10–13, B 8–9 with active bleeding, or HVPG ≥20. Age <75, creatinine <3, no heart failure.', stmt: '5.31', tone: 'bad', sh: 'pTIPS' },
      { id: 'nopt', t: 'Criteria not met', r: 'Carvedilol and banding', s: 'EVL every 2–4 weeks until eradication. Rebleeding: consider TIPS.', stmt: 'Fig. 3', tone: 'ok', sh: 'Banding' }] },
    { id: 'fail', t: 'Not controlled', r: 'Covered stent, then salvage TIPS', s: 'Covered esophageal stent, preferred over balloon tamponade, as a bridge to TIPS or transplant. Evaluate for transplant.', stmt: '5.35, 5.36', tone: 'bad', sh: 'Stent' }] }, 'n');

const crit = (p) => (p.cp >= 10 && p.cp <= 13) || (p.cp >= 8 && p.cp <= 9 && !!p.active) || p.hvpg >= PTIPS_HVPG;

export default {
  id: 'bleed',
  label: 'Acute variceal bleeding',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: 'Fig. 3',
  tree,
  mapWords: { ctrl: ['Controlled'], fail: ['Banding', 'failed'], ptips: ['pTIPS'], nopt: ['Carvedilol,', 'banding'] },
  lit(p) {
    const L = new Set(['root']);
    if (!p.ctrl) { L.add('fail'); return L; }
    L.add('ctrl'); L.add(crit(p) && p.fit ? 'ptips' : 'nopt');
    return L;
  },
  outcomes: ['ptips', 'nopt', 'fail'],
  outcomeOf: (L) => ['ptips', 'nopt', 'fail'].find((k) => L.has(k)) || null,
  reading(key, p) {
    const cls = cpClass(p.cp) + p.cp;
    switch (key) {
      case 'ptips': {
        const w = p.cp >= 10 && p.cp <= 13 ? `Child–Pugh ${cls} is C 10–13` : p.cp >= 8 && p.cp <= 9 && p.active ? `Child–Pugh ${cls} with active bleeding at endoscopy` : `HVPG ${p.hvpg} mmHg is ≥20`;
        return { head: 'Preemptive TIPS', tone: 'bad', stmt: '5.31', why: `Band ligation controlled the bleeding. ${w}, and the patient is a TIPS candidate.`, next: 'Within 72 hours, ideally within 24.' };
      }
      case 'nopt': return { head: 'Carvedilol and banding', tone: 'ok', stmt: 'Fig. 3', why: crit(p) ? 'Band ligation controlled the bleeding. The patient meets the clinical criteria but is not a TIPS candidate.' : 'Band ligation controlled the bleeding, and no preemptive TIPS criterion is met.', next: 'Repeat EVL every 2–4 weeks until eradication. If rebleeding occurs, consider TIPS.' };
      default: return { head: 'Covered stent, then salvage TIPS', tone: 'bad', stmt: '5.35, 5.36', why: 'Band ligation did not control the bleeding.', next: 'A dedicated covered self-expanding metal stent is preferred over balloon tamponade as a bridge to TIPS or liver transplant. Evaluate for transplant.' };
    }
  },
  chips: (p) => ['Esophageal or GOV1', `Child–Pugh ${cpClass(p.cp)}${p.cp}`, p.hvpg != null && `HVPG ${p.hvpg}`, p.active ? 'Active bleeding' : 'No active bleeding', p.ctrl ? 'Controlled' : 'Not controlled', !p.fit && 'Not a TIPS candidate'].filter(Boolean),
  patientFor(t, fp, shown = (k, v) => v) {
    const base = { ...(t?.patient || {}) };
    const live = (k, v) => (fp && Number.isFinite(fp[k]) ? shown(k, fp[k]) : v);
    return { src: 'ov', cp: 8, active: false, ctrl: true, fit: true, ...base, hvpg: base.hvpg === null ? null : live('hvpg', base.hvpg ?? 16) };
  },
  worst: { src: 'ov', cp: 13, active: false, hvpg: 99.9, ctrl: false, fit: false },
  notes: 'The acute variceal bleeding algorithm of Baveno VIII (Fig. 3) for bleeding from an esophageal varix or GOV1: a vasoactive drug, antibiotic prophylaxis and restrictive transfusion, endoscopy within 12 hours and band ligation (5.18). Once bleeding is controlled, preemptive TIPS within 72 hours, ideally within 24, is indicated for Child–Pugh C 10–13, or B 8–9 with active bleeding at endoscopy, or HVPG ≥20 mmHg, in a patient aged <75 with creatinine <3 mg/dL and no heart failure (5.31); otherwise carvedilol with EVL every 2–4 weeks. If bleeding is not controlled, a covered esophageal stent bridges to salvage TIPS (5.35, 5.36).',
};
