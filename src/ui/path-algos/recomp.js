// Has the patient recompensated? Baveno VIII Fig. 2 and 7.15 (checked on guidelines/baveno-viii-2026.pdf, 7 Nov 2026): recompensation needs
// all three of (1) cure, control or suppression of the cause, (2) no ascites off diuretics, no overt HE off prophylaxis and no variceal
// bleeding or rebleeding for at least 6 months, and (3) improved liver function, Child-Pugh A5 or A6. CSPH may also resolve (HVPG <10 off
// carvedilol, LSM <10, or LSM <15 with SSM <25: 7.16, 7.19; those numbers stay in the notes, not in the drawn words).
// A checklist: kind 'score' with allOf. The patient is the slide's own answers { ca, ev, lf }, each the index of the option (0 = 'Met').
import { scoreKit } from './helpers.js';

const rows = [
  { k: 'ca', n: 'The etiology is cured, controlled or suppressed', o: [['Met', 1], ['Not met', 0]] },
  { k: 'ev', n: 'No events off treatment for ≥6 months', d: 'No ascites off diuretics, no overt HE off prophylaxis, no variceal bleeding or rebleeding.', o: [['Met', 1], ['Not met', 0]] },
  { k: 'lf', n: 'Liver function has improved', d: 'Child–Pugh A5 or A6.', o: [['Met', 1], ['Not met', 0]] },
];
const zones = [[0, 2, 'Not yet', 'warn'], [3, 3, 'Recompensated', 'ok']];
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const verdict = (t, p, rs) => (t === rs.length
  ? { head: 'Recompensated', tone: 'ok', z: 1, next: 'CSPH may also resolve with time: confirm with HVPG off carvedilol, or with LSM and SSM.' }
  : { head: 'Not recompensated yet', tone: 'warn', z: 0, next: `All three are needed. Missing: ${rs.filter((r) => p[r.k] !== 0).map((r) => lower(r.n)).join('; ')}.` });

const defaults = { ca: 0, ev: 0, lf: 1 };

export default {
  id: 'recomp',
  label: 'Has the patient recompensated?',
  kind: 'score',
  source: 'Baveno VIII',
  cite: 'Fig. 2',
  ...scoreKit({ rows, verdict, zones, allOf: true, defaults, stmt: '7.15' }),
  presets: [['All three met', { ca: 0, ev: 0, lf: 0 }], ['Events not yet 6 months', { ca: 0, ev: 1, lf: 0 }], ['Etiology still active', { ca: 1, ev: 1, lf: 1 }]],
  worst: { ca: 1, ev: 1, lf: 1 },   // (all three missing: the longest list)
  notes: 'Recompensation needs all three criteria together (7.15, Fig. 2): the etiology of the liver disease is cured, controlled or suppressed; there have been no events off treatment for at least 6 months (no ascites off diuretics, no overt hepatic encephalopathy off prophylaxis, no variceal bleeding or rebleeding); and liver function has improved to Child–Pugh A5 or A6. Clinically significant portal hypertension may also resolve over time: HVPG <10 mmHg off carvedilol, or stiffness (LSM <10 kPa, or LSM <15 kPa with SSM <25 kPa), can show it (7.16, 7.19).',
};
