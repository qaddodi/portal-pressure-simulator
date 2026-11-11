// The rule of five for CSPH, AASLD 2024 Fig. 3 and guidance statement 7 (checked on guidelines/aasld-2024-portal-hypertension.pdf, 7 Nov 2026).
// The figure: CSPH ruled out at LSM <15 kPa with platelets ≥150 ×10⁹/L; ruled in at LSM ≥25, at 20 to <25 with platelets <150, or at
// 15 to <20 with platelets <110. The text of 4.2 says "platelets >150" for the rule-out and "LSM >25" for the first rule-in, while its guidance
// statement 7 says "≥25"; the card follows the figure, so a patient at exactly platelets 150 is ruled out and one at exactly LSM 25 is ruled in.
// LSM by transient elastography; the model's live LSM and platelets ride the card.
import { inheritTone } from './helpers.js';

const num = (v, d) => (v != null && Number.isFinite(+v) ? +v : d);

/** Which rule of five side a patient is on: 'in', 'out', or 'gray'. */
export const side = (p) => {
  if (p.lsm >= 25 || (p.lsm >= 20 && p.plt < 150) || (p.lsm >= 15 && p.lsm < 20 && p.plt < 110)) return 'in';
  return p.lsm < 15 && p.plt >= 150 ? 'out' : 'gray';
};

const tree = inheritTone({
  id: 'root', t: 'Compensated, stiffness and platelets', r: 'Is CSPH present?', stmt: 'Fig. 3', tone: 'n', kids: [
    { id: 'in', t: 'Rule of five met', r: 'CSPH presumed', s: 'LSM ≥25, or 20–25 with platelets <150, or 15–20 with platelets <110.', stmt: 'Fig. 3', tone: 'bad', sh: 'Presumed' },
    { id: 'gray', t: 'Neither', r: 'Not settled', s: 'Spleen stiffness or HVPG can decide.', stmt: 'Fig. 3', tone: 'warn', sh: 'Not settled' },
    { id: 'out', t: 'LSM <15 and platelets ≥150', r: 'CSPH excluded', stmt: 'Fig. 3', tone: 'ok', sh: 'Excluded' }] }, 'n');

const mapWords = { in: ['CSPH', 'presumed'], gray: ['Not', 'settled'], out: ['CSPH', 'excluded'] };
const lit = (p) => new Set(['root', side(p)]);
const outcomeOf = (L) => ['in', 'gray', 'out'].find((k) => L.has(k)) || null;

function reading(key, p) {
  const both = `LSM ${p.lsm} kPa with platelets ${p.plt}`;
  if (key === 'in') {
    const band = p.lsm >= 25 ? `LSM ${p.lsm} kPa is ≥25, whatever the platelets (${p.plt}).` : p.lsm >= 20 ? `LSM ${p.lsm} kPa is 20–25 and platelets ${p.plt} are <150.` : `LSM ${p.lsm} kPa is 15–20 and platelets ${p.plt} are <110.`;
    return { head: 'CSPH presumed', tone: 'bad', stmt: 'Fig. 3, guidance 7 and 12', why: band, next: 'Carvedilol can be considered to prevent decompensation.' };
  }
  if (key === 'out') return { head: 'CSPH excluded', tone: 'ok', stmt: 'Fig. 3', why: `LSM ${p.lsm} kPa is <15 and platelets ${p.plt} are ≥150.`, next: 'The same values also rule out varices needing treatment, so no screening scope.' };
  return { head: 'Not settled', tone: 'warn', stmt: 'Fig. 3', why: `${both} meets neither side.`, next: 'Spleen stiffness or HVPG can settle it.' };
}

const chips = (p) => [`LSM ${p.lsm} kPa`, `Platelets ${p.plt}`];

function patientFor(tool, fp, shown = (k, v) => v) {
  const base = tool?.patient || {};
  const live = (k, d) => (fp && Number.isFinite(fp[k]) ? shown(k, fp[k]) : num(base[k], d));
  return { lsm: live('lsm', 22), plt: live('plt', 130) };
}

/** The Baveno VIII verdict for the same patient, as one line in plain words. */
export function compare(p) {
  const bv = p.lsm < 10 ? 'rules cACLD out' : p.lsm <= 15 && p.plt >= 150 ? 'rules CSPH out' : p.lsm >= 25 ? 'rules CSPH in' : 'indeterminate zone';
  return `Baveno VIII, same patient: ${bv}`;
}

export default {
  id: 'aasld',
  label: 'Rule of five: stiffness and platelets',
  kind: 'tree',
  source: 'AASLD 2024',
  cite: 'Fig. 3',
  tree, mapWords, lit,
  outcomes: ['in', 'gray', 'out'],
  outcomeOf, reading, chips, patientFor, compare,
  worst: { lsm: 99.9, plt: 1000 },
  notes: 'The AASLD 2024 guidance (Fig. 3, guidance statement 7) uses liver stiffness by transient elastography with the platelet count, the rule of five. CSPH is presumed at LSM ≥25 kPa whatever the platelets, at 20–25 kPa with platelets <150, or at 15–20 kPa with platelets <110 (×10⁹/L). It is excluded at LSM <15 kPa with platelets ≥150. Between them lies an indeterminate zone, where spleen stiffness or HVPG can decide. Baveno VIII draws its first-visit rules differently: it rules CSPH out at LSM ≤15 kPa with platelets ≥150 and in at LSM ≥25 kPa, so the two differ at exactly 15 kPa. Take care in obesity with MASLD, ALT >3 times the upper limit, and primary sclerosing cholangitis with a dominant stricture, where the rule is less well calibrated.',
};
