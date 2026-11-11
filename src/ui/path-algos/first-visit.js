// First visit with suspected cACLD: Baveno VIII Fig. 1 and 1.3, 1.14 to 1.19 (see the notes in path-data.js). Moved out of path-data.js unchanged
// (7 Nov 2026) so every algorithm is one module of the same shape (path-algos/README in the contract: tree, mapWords, lit, outcomes, reading, chips, patientFor, worst).
import { act, inheritTone } from './helpers.js';

const tree = inheritTone({
  id: 'root', t: 'cACLD suspected', s: 'Fasting liver stiffness (LSM) and platelet count.', tone: 'n', kids: [
    { id: 'b1', t: 'LSM <10 kPa', r: 'Rules cACLD out', s: 'Consider PSVD if portal hypertension.', stmt: '1.3', tone: 'n', sh: 'LSM <10', kids: [act('a1', 'Repeat NITs by cause')] },
    { id: 'b2', t: 'LSM ≤15 kPa and platelets ≥150', r: 'Rules CSPH out', stmt: '1.15', tone: 'ok', sh: 'LSM ≤15, PLT ≥150', kids: [act('a2', 'Repeat LSM in 12 months')] },
    { id: 'b3', t: 'LSM 15–25 kPa, or platelets <150', r: 'Indeterminate zone', stmt: '1.17', tone: 'warn', sh: 'Indeterminate zone', kids: [
      { id: 'g1', t: 'ANTICIPATE ≥75%', r: 'Rules CSPH in', s: 'Or NICER ≥75%, SSM >55 kPa.', stmt: '1.14, 1.16', tone: 'bad', sh: 'Model or SSM', kids: [act('a3', 'Start NSBB, carvedilol preferred')] },
      { id: 'g2', t: 'No test rules it in', r: 'CSPH still open', stmt: '1.17', tone: 'warn', sh: 'Neither', kids: [act('a4', 'Repeat NITs in 12 months, or add SSM', { s: 'No NSBB? Scope unless LSM <20 & PLT ≥150, or SSM <40.', stmt: '1.19' })] }] },
    { id: 'b4', t: 'LSM ≥25 kPa', r: 'Rules CSPH in', s: 'Viral, alcohol, non-obese MASLD.', stmt: '1.16b', tone: 'bad', sh: 'LSM ≥25', kids: [act('a6', 'Start NSBB, carvedilol preferred')] }] }, 'n');

export default {
  id: 'first-visit',
  label: 'First visit with cACLD',
  kind: 'tree',
  source: 'Baveno VIII',
  cite: 'Fig. 1',
  tree,
  mapWords: {
    b1: ['LSM', '<10'], b2: ['LSM ≤15', 'PLT ≥150'], b3: ['Indeterminate', 'zone'], b4: ['LSM', '≥25'], g1: ['Model or', 'SSM'], g2: ['Neither'],
    a1: ['Repeat', 'NITs'], a2: ['Repeat LSM', '12 months'], a3: ['Start', 'carvedilol'], a4: ['Repeat or', 'add SSM'], a6: ['Start', 'carvedilol'],
  },
  /** The nodes lit for a first-visit patient { lsm, plt, bmi, ant, ssm }: lsm in kPa, plt in ×10⁹/L, ant: ANTICIPATE (or -NASH) ≥75%, ssm: spleen stiffness >55 kPa, bmi: BMI ≥30. */
  lit(p) {
    const L = new Set(['root']);
    if (!(p.lsm >= 0)) return L;
    if (p.lsm < 10) { L.add('b1'); L.add('a1'); }
    else if (p.lsm >= 25 && !p.bmi) { L.add('b4'); L.add('a6'); }
    else if (p.lsm <= 15 && p.plt >= 150) { L.add('b2'); L.add('a2'); }
    else { L.add('b3'); if (p.ant || p.ssm) { L.add('g1'); L.add('a3'); } else { L.add('g2'); L.add('a4'); } }
    return L;
  },
  outcomes: ['a1', 'a2', 'a3', 'a4', 'a6'],
  outcomeOf: (L) => ['a1', 'a2', 'a3', 'a4', 'a6'].find((k) => L.has(k)) || null,
  reading(key, p) {
    switch (key) {
      case 'a1': return { head: 'Rules cACLD out', tone: 'n', stmt: '1.3', why: `LSM ${p.lsm} kPa is <10.`, next: 'Repeat NITs by cause. Think of PSVD if there are signs of portal hypertension.' };
      case 'a2': return { head: 'Rules CSPH out', tone: 'ok', stmt: '1.15', why: `LSM ${p.lsm} kPa is ≤15 and platelets are ${p.plt}, ≥150.`, next: 'Repeat the stiffness in 12 months.' };
      case 'a3': return { head: 'Rules CSPH in', tone: 'bad', stmt: '1.14, 1.16', why: `LSM ${p.lsm} kPa with platelets ${p.plt} leaves it open, but ${p.ant ? (p.bmi ? 'ANTICIPATE-NASH is ≥75%' : 'ANTICIPATE is ≥75%') : 'spleen stiffness is >55 kPa'}.`, next: 'Start a beta-blocker, carvedilol preferred.' };
      case 'a4': return { head: 'CSPH still open', tone: 'warn', stmt: '1.17', why: `LSM ${p.lsm} kPa with platelets ${p.plt} falls between the rules, and no model or spleen stiffness settles it.`, next: 'Repeat the tests in 12 months, or add spleen stiffness. Off a beta-blocker, scope for varices unless LSM <20 with platelets ≥150, or SSM <40 kPa.' };
      default: return { head: 'Rules CSPH in', tone: 'bad', stmt: '1.16b', why: `LSM ${p.lsm} kPa is ≥25.`, next: 'Start a beta-blocker, carvedilol preferred.' };
    }
  },
  chips: (p) => [`LSM ${p.lsm} kPa`, `Platelets ${p.plt}`, p.bmi && 'BMI ≥30', p.ant && (p.bmi ? 'ANTICIPATE-NASH ≥75%' : 'ANTICIPATE ≥75%'), p.ssm && 'SSM >55 kPa'].filter(Boolean),
  /** The slide's own facts (tool.patient), over which the live model's readings go where it has them (fp: lsm, plt, ssm), each as the tile prints it. */
  patientFor(t, fp, shown = (k, v) => v) {
    const base = { ...(t?.patient || {}) };
    const live = (k, v) => (fp && Number.isFinite(fp[k]) ? shown(k, fp[k]) : v);
    const ssm = live('ssm', null);
    return { lsm: live('lsm', base.lsm ?? 12), plt: live('plt', base.plt ?? 200), bmi: !!base.bmi, ant: !!base.ant, ssm: ssm != null ? ssm > 55 : !!base.ssm };
  },
  worst: { lsm: 100, plt: 1000, bmi: true, ant: true, ssm: true },
  notes: 'The first-visit chart of Baveno VIII (Fig. 1) for a patient with suspected compensated advanced chronic liver disease: LSM <10 kPa rules cACLD out (1.3); LSM ≤15 kPa with platelets ≥150 rules CSPH out (1.15); LSM ≥25 kPa rules CSPH in (1.16); in between, ANTICIPATE ≥75%, NICER ≥75% or SSM >55 kPa rules it in, otherwise repeat the tests in 12 months or add spleen stiffness (1.17), and the screening scope is spared when LSM <20 with platelets ≥150 or SSM <40 kPa (1.19).',
};
