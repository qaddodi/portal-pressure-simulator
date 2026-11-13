// The stages of cirrhosis and the way back. Baveno VIII Fig. 2 and 3.1 to 3.5, 4.1 (checked on guidelines/baveno-viii-2026.pdf, 7 Nov 2026):
//   cACLD (LSM ≥10 suggestive, ≥15 indicative; no current or previous decompensation). cACLD with CSPH: LSM ≥25, ANTICIPATE ≥75%,
//   ANTICIPATE-NASH ≥75%, SSM >55 (the figure prints ≥55, the statement says >55), NICER ≥75%, varices, HVPG ≥10, collaterals. First
//   decompensation: ascites, variceal bleeding, overt HE. Further: recurrent or refractory ascites, HRS-AKI or SBP, recurrent overt HE,
//   variceal rebleeding, an event with jaundice, or any two events. The "what it means" line is a short pointer to the statements 3.15 to 3.21, 4.8 and 6.4.
// The patient is the slide's own { s: 0..3 (the stage), rc: recompensated since }. The way back shows for the two decompensated stages only.
import { pickIndex } from './helpers.js';

const steps = [
  ['cACLD', 'LSM ≥10 suggests it, ≥15 indicates it. No decompensation now or before.', 'Treat the etiology. Repeat NITs by etiology.', 'n'],
  ['cACLD with CSPH', 'LSM ≥25, ANTICIPATE ≥75%, SSM >55 kPa, varices, collaterals or HVPG ≥10.', 'Carvedilol preferred. No screening endoscopy while on it.', 'warn'],
  ['First decompensation', 'Ascites, variceal bleeding or overt hepatic encephalopathy.', 'Treat the event. Carvedilol and EVL after a variceal bleed.', 'bad'],
  ['Further decompensation', 'Recurrent or refractory ascites, HRS-AKI or SBP, recurrent OHE, rebleeding, an event with jaundice, or ≥2 events.', 'TIPS and transplant are discussed together.', 'bad'],
];
const back = 'Recompensation: etiology controlled; no ascites or OHE off treatment and no rebleeding for >6 months; Child–Pugh A5 or A6.';
const defaults = { s: 1, rc: false };
const norm = (p) => ({ s: pickIndex(p?.s, steps.length, defaults.s), rc: !!p?.rc });
const backOn = (q) => q.s >= 2;   // (the way back is drawn from the first decompensation on)

export default {
  id: 'ladder',
  label: 'The stages of cirrhosis',
  kind: 'ladder',
  source: 'Baveno VIII',
  cite: 'Fig. 2',
  steps, back, defaults,
  presets: [['Compensated, CSPH', { s: 1, rc: false }], ['First ascites', { s: 2, rc: false }], ['Further events', { s: 3, rc: false }], ['Recompensated', { s: 2, rc: true }]],
  outcomes: steps.map((_, i) => `s${i}`),
  lit(p) { const q = norm(p); return new Set(['root', `s:${q.s}`, ...(backOn(q) && q.rc ? ['back'] : [])]); },
  outcomeOf: (L) => { const id = [...L].find((i) => i.startsWith('s:')); return id ? `s${id.slice(2)}` : null; },
  reading(key, p) {
    const q = norm(p), st = steps[+String(key || `s${q.s}`).slice(1)] || steps[q.s];
    return { head: st[0], tone: st[3], stmt: '3.1–3.5, 4.1', why: st[1], next: backOn(q) && q.rc ? `${st[2]} Recompensated since.` : st[2] };
  },
  chips(p) { const q = norm(p); return [steps[q.s][0], backOn(q) && q.rc && 'Recompensated since'].filter(Boolean); },
  patientFor: (tool) => norm(tool?.patient),
  worst: { s: 3, rc: true },   // (the longest stage name and the way-back chip)
  notes: 'The course of cirrhosis in four stages (Fig. 2): compensated advanced chronic liver disease (cACLD; LSM ≥10 kPa suggests it and ≥15 kPa indicates it, with no decompensation now or before), cACLD with clinically significant portal hypertension (CSPH; for example LSM ≥25 kPa, ANTICIPATE ≥75%, SSM >55 kPa, varices, portosystemic collaterals or HVPG ≥10 mmHg), first decompensation (ascites, variceal bleeding or overt hepatic encephalopathy) and further decompensation (ascites needing ≥3 large-volume paracenteses within 1 year, HRS-AKI or SBP, recurrent overt encephalopathy, variceal rebleeding, a decompensating event with jaundice, or any combination of events; 4.1). A decompensated patient can come back to a compensated state: recompensation needs the etiology removed, controlled or suppressed; no ascites off diuretics, no overt encephalopathy off prophylaxis and no variceal rebleeding (carvedilol or an NSBB allowed) for >6 consecutive months; and Child–Pugh A5 or A6 (3.1 to 3.5, 4.1, 7.4; what each stage means for treatment: 3.15 to 3.21, 4.8, 6.4).',
};
