// Degree of portal vein occlusion by the VALDIG PVT criteria, Baveno VIII 9.3 (checked on guidelines/baveno-viii-2026.pdf, 7 Nov 2026):
// the remnant lumen (RL) as a percentage of the vein's largest diameter, on CT or MRI in the portal venous phase, in a plane strictly
// perpendicular to the main portal vein. Minimal if RL ≥50% (the PDF prints "> −50%", a lost "≥"), partial if RL <50%, complete if RL = 0%.
import { inheritTone } from './helpers.js';

const num = (v, d) => (v != null && Number.isFinite(+v) ? +v : d);
const tree = inheritTone({
  id: 'root', t: 'Portal vein thrombosis on CT or MRI', r: 'Remnant lumen (RL)', s: 'Against the widest diameter, in a plane perpendicular to the main portal vein.', stmt: '9.3', tone: 'n', kids: [
    { id: 'min', t: 'RL ≥50%', r: 'Minimal occlusion', tone: 'ok', sh: 'Minimal', stmt: '9.3' },
    { id: 'par', t: 'RL <50%, not 0%', r: 'Partial occlusion', tone: 'warn', sh: 'Partial', stmt: '9.3' },
    { id: 'com', t: 'RL = 0%', r: 'Complete occlusion', tone: 'bad', sh: 'Complete', stmt: '9.3' }] }, 'n');

const mapWords = { min: ['Minimal'], par: ['Partial'], com: ['Complete'] };
const lit = (p) => new Set(['root', p.rl >= 50 ? 'min' : p.rl > 0 ? 'par' : 'com']);
const outcomeOf = (L) => ['min', 'par', 'com'].find((k) => L.has(k)) || null;
const how = 'Measured against the widest diameter of the vein, in a plane perpendicular to it.';

function reading(key, p) {
  if (key === 'min') return { head: 'Minimal occlusion', tone: 'ok', stmt: '9.3', why: `Remnant lumen ${p.rl}% is ≥50%.`, next: how };
  if (key === 'par') return { head: 'Partial occlusion', tone: 'warn', stmt: '9.3', why: `Remnant lumen ${p.rl}% is <50% but not 0%.`, next: how };
  return { head: 'Complete occlusion', tone: 'bad', stmt: '9.3', why: 'No remnant lumen: RL is 0%.', next: how };
}

const chips = (p) => [`Remnant lumen ${p.rl}%`];
const patientFor = (tool) => ({ rl: Math.min(100, Math.max(0, num(tool?.patient?.rl, 30))) });

export default {
  id: 'pvtocc',
  label: 'Degree of portal vein occlusion',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree, mapWords, lit,
  outcomes: ['min', 'par', 'com'],
  outcomeOf, reading, chips, patientFor,
  worst: { rl: 99.9 },
  notes: 'By the VALDIG portal vein thrombosis criteria, the degree of occlusion is the percentage of remnant portal lumen (RL) against its largest diameter, read on CT or MRI in the portal venous phase, in a plane strictly perpendicular to the main portal vein (9.3). Minimal occlusion is RL ≥50%, partial occlusion is RL <50%, and complete occlusion is RL = 0%.',
};
