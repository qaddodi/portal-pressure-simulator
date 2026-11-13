// PSVD or NCPF: is a scope needed? Baveno VIII 8.46 to 8.48 (checked on guidelines/baveno-viii-2026.pdf, 7 Nov 2026):
//   8.46 screening for gastroesophageal varices at diagnosis (strong); repeat every 2 years with no varices, every 1 year with small varices.
//   8.47 at diagnosis and in follow-up, no endoscopy if SSM is <40 kPa and bilirubin <1 mg/dL (<17 µmol/L). A patient at exactly SSM 40,
//        or bilirubin 1, falls on the scope side: the text says "<" for sparing it.
//   8.48 the LSM criteria for cirrhosis must not be used.
// The model gives the spleen stiffness (fp.ssm, as the tile prints it). Bilirubin and what the scope found are the slide's own facts.
import { inheritTone } from './helpers.js';
import { SSM_CUTS } from '../../engine/ssm-cuts.js';

const SSM_SPARE = SSM_CUTS.spareScope;   // 40 kPa
const BILI_SPARE = 1;                    // mg/dL
const num = (v, d) => (v != null && Number.isFinite(+v) ? +v : d);

/** Is a scope needed at diagnosis? */
const scoped = (p) => !(p.ssm < SSM_SPARE && p.bili < BILI_SPARE);

const tree = inheritTone({
  id: 'root', t: 'PSVD or NCPF diagnosed', r: 'Is endoscopy needed?', s: 'The cirrhosis stiffness rules do not apply.', stmt: '8.46–8.48', tone: 'n', kids: [
    { id: 'skip', t: 'SSM <40 kPa and bilirubin <1 mg/dL', r: 'No endoscopy', s: 'Varices are unlikely. At diagnosis and in follow-up.', stmt: '8.47', tone: 'ok', sh: 'No EGD' },
    { id: 'scope', t: 'SSM ≥40 kPa, or bilirubin ≥1 mg/dL', r: 'Endoscopy at diagnosis', stmt: '8.46', tone: 'warn', sh: 'EGD', kids: [
      { id: 'none', t: 'No varices', r: 'Repeat in 2 years', stmt: '8.46', tone: 'ok', sh: 'Repeat 2 y' },
      { id: 'small', t: 'Small varices', r: 'Repeat in 1 year', stmt: '8.46', tone: 'warn', sh: 'Repeat 1 y' }] }] }, 'n');

const mapWords = { skip: ['No', 'EGD'], scope: ['EGD'], none: ['Repeat', '2 y'], small: ['Repeat', '1 y'] };

function lit(p) {
  const L = new Set(['root']);
  if (!scoped(p)) L.add('skip'); else { L.add('scope'); L.add(p.v === 'small' ? 'small' : 'none'); }
  return L;
}
const outcomeOf = (L) => ['skip', 'none', 'small'].find((k) => L.has(k)) || null;

function reading(key, p) {
  const ssm = `SSM ${p.ssm} kPa`, bili = `bilirubin ${num(p.bili, 0).toFixed(1)} mg/dL`;
  if (key === 'skip') return { head: 'No endoscopy', tone: 'ok', stmt: '8.47', why: `${ssm} is <40 and ${bili} is <1.`, next: 'Varices are unlikely. Endoscopy is not needed at follow-up either.' };
  if (key === 'small') return { head: 'Repeat EGD in 1 year', tone: 'warn', stmt: '8.46', why: 'Screening endoscopy at diagnosis showed small varices.', next: 'Repeat endoscopy every year while the varices remain small.' };
  const why = p.ssm >= SSM_SPARE && p.bili >= BILI_SPARE ? `${ssm} is ≥40 and ${bili} is ≥1` : p.ssm >= SSM_SPARE ? `${ssm} is ≥40` : `${bili} is ≥1`;
  return { head: 'Repeat EGD in 2 years', tone: 'ok', stmt: '8.46', why: `${why}, so endoscopy was indicated at diagnosis. It showed no varices.`, next: 'Repeat every 2 years.' };
}

const chips = (p) => [`SSM ${p.ssm} kPa`, `Bilirubin ${p.bili.toFixed(1)} mg/dL`, scoped(p) && (p.v === 'small' ? 'Small varices' : 'No varices')].filter(Boolean);

function patientFor(tool, fp, shown = (k, v) => v) {
  const base = tool?.patient || {};
  return {
    ssm: fp && Number.isFinite(fp.ssm) ? shown('ssm', fp.ssm) : num(base.ssm, 46),
    bili: num(base.bili, 0.8),
    v: base.v === 'small' ? 'small' : 'none',
  };
}

export default {
  id: 'psvdscope',
  label: 'PSVD or NCPF: is endoscopy needed?',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: '',
  tree, mapWords, lit,
  outcomes: ['skip', 'none', 'small'],
  outcomeOf, reading, chips, patientFor,
  worst: { ssm: 99.9, bili: 9.9, v: 'small' },
  notes: 'In porto-sinusoidal vascular disorder (PSVD) and non-cirrhotic portal fibrosis (NCPF) the cirrhosis stiffness rules for avoiding endoscopy must not be used (8.48). Screening for gastroesophageal varices is recommended at diagnosis (8.46, strong). It is not required, at diagnosis or in follow-up, when spleen stiffness is <40 kPa and bilirubin is <1 mg/dL (<17 µmol/L), because varices are unlikely (8.47). A patient exactly at 40 kPa or 1 mg/dL is not spared. When endoscopy is done, it is repeated every 2 years if there are no varices and every year if the varices are small (8.46).',
};
