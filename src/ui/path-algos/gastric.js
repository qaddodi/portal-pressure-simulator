// Gastric variceal bleeding (GOV2 or IGV1): Baveno VIII Fig. 3 and 5.38 to 5.41. Two phases at once: stop the bleeding, then the definitive
// treatment, TIPS ± embolisation as soon as possible (Child–Pugh C <14, age <75, creatinine <3 mg/dL, no heart failure), else other options
// after a team discussion. Patient { src: 'gv', cp, fit }. Lit exactly as litBleed does for src 'gv' in path-data.js.
import { inheritTone, cpClass } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'Suspected variceal bleed', r: 'GOV2 or IGV1', s: 'High risk. Two phases, started together or kept close.', stmt: '5.39', tone: 'bad', kids: [
    { id: 'acute', t: 'Acute phase', r: 'Stop the bleeding', s: 'EUS-guided coil + cyanoacrylate in experienced centres. Else cyanoacrylate injection.', stmt: '5.40', tone: 'warn', sh: 'Stop bleeding' },
    { id: 'tipsg', t: 'Definitive phase, TIPS suitable', r: 'TIPS ± embolisation', s: 'As soon as possible. Child–Pugh C <14, age <75, creatinine <3, no heart failure.', stmt: '5.41', tone: 'bad', sh: 'TIPS' },
    { id: 'mdt', t: 'Definitive phase, TIPS not possible', r: 'Other definitive options', s: 'Transvenous obliteration, endoscopic (also EUS-guided) or surgical, after MDT discussion.', stmt: '5.41', tone: 'warn', sh: 'MDT' },
  ],
}, 'n');

const DEFAULT = { src: 'gv', cp: 9, fit: true };
const cpOf = (p) => (Number.isFinite(p?.cp) ? p.cp : DEFAULT.cp);

export default {
  id: 'gastric',
  label: 'Gastric variceal bleeding',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: 'Fig. 3',
  tree,
  mapWords: { acute: ['Stop', 'bleeding'], tipsg: ['TIPS'], mdt: ['Other', 'options'] },
  lit(p) {
    const L = new Set(['root', 'acute']);
    L.add(p.cp <= 13 && p.fit ? 'tipsg' : 'mdt');
    return L;
  },
  outcomes: ['tipsg', 'mdt'],
  outcomeOf: (L) => (L.has('tipsg') ? 'tipsg' : L.has('mdt') ? 'mdt' : null),
  reading(key, p) {
    const cls = cpClass(cpOf(p)) + cpOf(p);
    if (key === 'tipsg') return { head: 'Two phases, in parallel', tone: 'bad', stmt: '5.39', why: 'A GOV2 or IGV1 bleed is high risk.', next: 'Stop the bleeding now: EUS-guided coil with cyanoacrylate, else cyanoacrylate injection. Then TIPS ± embolisation as soon as possible.' };
    return { head: 'Two phases, in parallel', tone: 'bad', stmt: '5.39', why: 'A GOV2 or IGV1 bleed is high risk.', next: `Stop the bleeding now: EUS-guided coil with cyanoacrylate, else cyanoacrylate injection. TIPS is not an option (${cpOf(p) > 13 ? `Child–Pugh ${cls}` : 'not fit'}): transvenous obliteration, endoscopic or surgical options after MDT discussion.` };
  },
  chips(p) {
    return ['GOV2 or IGV1', `Child–Pugh ${cpClass(cpOf(p))}${cpOf(p)}`, p?.fit === false && 'Not fit for TIPS'].filter(Boolean);
  },
  patientFor(tool) {
    const base = { ...DEFAULT, ...(tool?.patient || {}), src: 'gv' };
    if (!Number.isFinite(base.cp)) base.cp = DEFAULT.cp;
    base.fit = base.fit !== false;
    return base;
  },
  worst: { src: 'gv', cp: 13, fit: false },
  notes: 'A bleed from a gastric varix of type GOV2 or IGV1 is a high-risk event that needs rapid, structured team management (5.39). Treatment has two phases that may start in parallel; if they are staged, the gap between them should be as short as possible. The acute phase is haemostasis, with conventional cyanoacrylate injection or, where available in experienced centres, EUS-guided coil plus cyanoacrylate (5.40, weak). The definitive phase is TIPS, with or without variceal embolisation, as soon as possible (5.41). Figure 3 limits it to Child–Pugh C <14 (so A and B too), age <75 years, creatinine <3 mg/dL and no heart failure. When TIPS is contraindicated, other definitive options after a team discussion are transvenous obliteration and endoscopic (including EUS-guided) or surgical approaches.',
};
