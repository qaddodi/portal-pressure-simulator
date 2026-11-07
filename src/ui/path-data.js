// The guideline path card's two algorithms and the patient's place on them (7 Nov 2026, Mohammad's pick: the whole chart on a Mac or
// an iPad held sideways, the map and a reading on a phone; mocks at artifact QxXCFjXnD8dSki5UWgYWxG and G8n2ujW8wXL8sVxXpmygqx).
// Plain data and plain functions, no page: tool-path.js draws them, tests/path-card.test.js holds them.
//
// Checked on the PDFs in guidelines/ (Baveno VIII, J Hepatol 2026):
//   first visit  Fig. 1 and 1.3, 1.14 to 1.17, 1.19: LSM <10 kPa rules cACLD out; LSM ≤15 kPa with platelets ≥150 ×10⁹/L rules CSPH out;
//                LSM ≥25 kPa rules CSPH in (viral, alcohol, non-obese MASLD); between, or with platelets <150, is the gray zone, where an
//                ANTICIPATE (ANTICIPATE-NASH at a BMI ≥30) or NICER probability ≥75%, or an SSM >55 kPa rules CSPH in (the figure prints
//                ≥55; the statement, 1.16c, and SSM_CUTS use >55). With nothing ruling it in: repeat the tests at 12 months or add SSM, and
//                a patient who cannot take a beta-blocker has the screening scope unless LSM <20 kPa with platelets ≥150, or SSM <40 kPa.
//   acute bleed  Fig. 3 and 5.4, 5.16, 5.18, 5.20, 5.31, 5.35 to 5.37, 5.39 to 5.41: a bleed from an oesophageal varix or GOV1 is banded;
//                controlled, a pre-emptive TIPS within 72 h (ideally 24) for Child–Pugh C 10–13, or B 8–9 with active bleeding at endoscopy,
//                or HVPG ≥20 mmHg, with age <75, creatinine <3 mg/dL and no heart failure; otherwise carvedilol with banding every 2–4
//                weeks. Not controlled: a covered stent as a bridge, then salvage TIPS. GOV2 or IGV1: two phases in parallel, the acute one
//                (EUS-guided coil with cyanoacrylate, else cyanoacrylate) and the definitive one, TIPS ± embolisation as soon as possible
//                for Child–Pugh C <14 with the same age, creatinine and heart conditions, else other options after a team discussion.
// Not in the model, so a slide states them as the case's own facts: the ANTICIPATE probability, a BMI, the Child–Pugh score, active
// bleeding at endoscopy, whether banding controlled the bleed, and fitness for TIPS.

import { PTIPS_HVPG } from '../engine/pressure-cuts.js';

const act = (id, t, o = {}) => ({ id, t, act: true, sh: t, ...o });

/** A node: id, t (its condition), r (its verdict), s (its detail), stmt (the statement), tone ('n' | 'ok' | 'warn' | 'bad', inherited by its
 *  children), sh (a short name), kids. */
export const FIRST_VISIT = {
  id: 'root', t: 'cACLD suspected', s: 'Fasting liver stiffness (LSM) and platelet count.', tone: 'n', kids: [
    { id: 'b1', t: 'LSM <10 kPa', r: 'Rules cACLD out', s: 'Consider PSVD if there are signs of portal hypertension.', stmt: '1.3', tone: 'n', sh: 'LSM <10', kids: [act('a1', 'Repeat NITs by cause')] },
    { id: 'b2', t: 'LSM ≤15 kPa and platelets ≥150', r: 'Rules CSPH out', stmt: '1.15', tone: 'ok', sh: 'LSM ≤15, PLT ≥150', kids: [act('a2', 'Repeat LSM in 12 months')] },
    { id: 'b3', t: 'LSM 15–25 kPa, or platelets <150', r: 'Gray zone', stmt: '1.17', tone: 'warn', sh: 'Gray zone', kids: [
      { id: 'g1', t: 'ANTICIPATE ≥75%', r: 'Rules CSPH in', s: 'ANTICIPATE-NASH if BMI ≥30. Or NICER ≥75%, or SSM >55 kPa.', stmt: '1.14, 1.16', tone: 'bad', sh: 'Model or SSM', kids: [act('a3', 'Start NSBB, carvedilol preferred')] },
      { id: 'g2', t: 'No test rules it in', r: 'CSPH still open', stmt: '1.17', tone: 'warn', sh: 'Neither', kids: [act('a4', 'Repeat NITs in 12 months, or add SSM', { s: 'If NSBB is not possible: scope for varices, unless LSM <20 with platelets ≥150, or SSM <40 kPa.', stmt: '1.19' })] }] },
    { id: 'b4', t: 'LSM ≥25 kPa', r: 'Rules CSPH in', s: 'Viral, alcohol, or non-obese MASLD.', stmt: '1.16b', tone: 'bad', sh: 'LSM ≥25', kids: [act('a6', 'Start NSBB, carvedilol preferred')] }] };

export const BLEED = {
  id: 'root', t: 'Suspected variceal bleed', s: 'Vasoactive drug, antibiotics, restrictive transfusion. Endoscopy within 12 h.', stmt: '5.18', tone: 'n', kids: [
    { id: 'ov', t: 'Oesophageal varix or GOV1', r: 'Band ligation', stmt: 'Fig. 3', tone: 'n', sh: 'OV or GOV1', kids: [
      { id: 'ctrl', t: 'Bleeding controlled', tone: 'ok', sh: 'Controlled', kids: [
        { id: 'ptips', t: 'Meets pTIPS criteria', r: 'Pre-emptive TIPS within 72 h', s: 'Child–Pugh C 10–13, B 8–9 with active bleeding, or HVPG ≥20. Age <75, creatinine <3, no heart failure.', stmt: '5.31', tone: 'bad', sh: 'pTIPS' },
        { id: 'nopt', t: 'Criteria not met', r: 'Carvedilol and banding', s: 'Band every 2–4 weeks.', stmt: 'Fig. 3', tone: 'ok', sh: 'Banding' }] },
      { id: 'fail', t: 'Not controlled', r: 'Covered stent, then salvage TIPS', s: 'A dedicated covered stent is preferred over a balloon, as a bridge to TIPS or liver transplant.', stmt: '5.35, 5.36', tone: 'bad', sh: 'Stent' }] },
    { id: 'gv', t: 'GOV2 or IGV1', r: 'High-risk: two phases in parallel', stmt: '5.39', tone: 'bad', sh: 'GOV2 or IGV1', kids: [
      { id: 'acute', t: 'Acute phase', r: 'Stop the bleeding', s: 'EUS-guided coil + cyanoacrylate in experienced centres, else cyanoacrylate injection.', stmt: '5.40', tone: 'warn', sh: 'Stop bleeding' },
      { id: 'tipsg', t: 'Definitive phase', r: 'TIPS ± embolisation', s: 'As soon as possible. Child–Pugh C <14, age <75, creatinine <3, no heart failure.', stmt: '5.41', tone: 'bad', sh: 'TIPS' },
      { id: 'mdt', t: 'TIPS contraindicated', r: 'Other definitive options', s: 'Transvenous obliteration, endoscopic or surgical, after MDT discussion.', stmt: '5.41', tone: 'warn', sh: 'MDT' }] }] };

/** A node's tone passed down to children that have none of their own (an action takes its branch's). */
(function inherit(n, t) { n.tone = n.tone || t; (n.kids || []).forEach((k) => inherit(k, n.tone)); })(FIRST_VISIT, 'n');
(function inherit(n, t) { n.tone = n.tone || t; (n.kids || []).forEach((k) => inherit(k, n.tone)); })(BLEED, 'n');

/** The algorithms by the name a slide gives (tool { kind: 'path', of }). */
export const PATHS = {
  'first-visit': { tree: FIRST_VISIT, kick: 'Baveno VIII Fig. 1', foot: 'Baveno VIII Fig. 1, statements 1.3 and 1.14 to 1.19', label: 'First visit with cACLD' },
  bleed: { tree: BLEED, kick: 'Baveno VIII Fig. 3', foot: 'Baveno VIII Fig. 3, statements 5.4 and 5.16 to 5.41', label: 'Acute variceal bleeding' },
};

/** The words under each node of the phone's map (one or two short lines). */
export const MAP_WORDS = {
  b1: ['LSM', '<10'], b2: ['LSM ≤15', 'PLT ≥150'], b3: ['Gray', 'zone'], b4: ['LSM', '≥25'], g1: ['Model or', 'SSM'], g2: ['Neither'],
  a1: ['Repeat', 'NITs'], a2: ['Repeat LSM', '12 months'], a3: ['Start', 'carvedilol'], a4: ['Repeat or', 'add SSM'], a6: ['Start', 'carvedilol'],
  ov: ['OV or', 'GOV1'], gv: ['GOV2 or', 'IGV1'], ctrl: ['Controlled'], fail: ['Banding', 'failed'], ptips: ['pTIPS'], nopt: ['Carvedilol,', 'banding'],
  acute: ['Stop', 'bleeding'], tipsg: ['TIPS'], mdt: ['MDT'],
};

export const cpClass = (cp) => (cp <= 6 ? 'A' : cp <= 9 ? 'B' : 'C');
const crit = (p) => (p.cp >= 10 && p.cp <= 13) || (p.cp >= 8 && p.cp <= 9 && !!p.active) || p.hvpg >= PTIPS_HVPG;

/** The nodes lit for a first-visit patient { lsm, plt, bmi, ant, ssm }: lsm in kPa, plt in ×10⁹/L, ant: ANTICIPATE (or -NASH) ≥75%,
 *  ssm: spleen stiffness >55 kPa, bmi: BMI ≥30. Readings are as the tiles print them. */
export function litFirst(p) {
  const L = new Set(['root']);
  if (!(p.lsm >= 0)) return L;
  if (p.lsm < 10) { L.add('b1'); L.add('a1'); }
  else if (p.lsm >= 25 && !p.bmi) { L.add('b4'); L.add('a6'); }
  else if (p.lsm <= 15 && p.plt >= 150) { L.add('b2'); L.add('a2'); }
  else { L.add('b3'); if (p.ant || p.ssm) { L.add('g1'); L.add('a3'); } else { L.add('g2'); L.add('a4'); } }
  return L;
}
/** The nodes lit for a bleeding patient { src: 'ov' | 'gv', cp, active, hvpg, ctrl, fit }. */
export function litBleed(p) {
  const L = new Set(['root']);
  if (p.src === 'gv') { L.add('gv'); L.add('acute'); L.add(p.cp <= 13 && p.fit ? 'tipsg' : 'mdt'); return L; }
  L.add('ov');
  if (!p.ctrl) { L.add('fail'); return L; }
  L.add('ctrl'); L.add(crit(p) && p.fit ? 'ptips' : 'nopt');
  return L;
}
export const litOf = (of, p) => (of === 'bleed' ? litBleed(p) : litFirst(p));

/** The outcome a lit set ends in: the leaf the phone's reading is written for. */
export function outcomeOf(of, L) {
  if (of !== 'bleed') return ['a1', 'a2', 'a3', 'a4', 'a6'].find((k) => L.has(k)) || null;
  if (L.has('gv')) return L.has('tipsg') ? 'gv-tips' : 'gv-mdt';
  return ['ptips', 'nopt', 'fail'].find((k) => L.has(k)) || null;
}
export const OUTCOMES = { 'first-visit': ['a1', 'a2', 'a3', 'a4', 'a6'], bleed: ['ptips', 'nopt', 'fail', 'gv-tips', 'gv-mdt'] };

/** The phone's reading for one outcome: { head, tone, stmt, why, next }, in words, from the patient's own numbers. */
export function readingFor(of, key, p) {
  if (of !== 'bleed') {
    switch (key) {
      case 'a1': return { head: 'Rules cACLD out', tone: 'n', stmt: '1.3', why: `LSM ${p.lsm} kPa is <10.`, next: 'Repeat NITs by cause. Think of PSVD if there are signs of portal hypertension.' };
      case 'a2': return { head: 'Rules CSPH out', tone: 'ok', stmt: '1.15', why: `LSM ${p.lsm} kPa is ≤15 and platelets are ${p.plt}, ≥150.`, next: 'Repeat the stiffness in 12 months.' };
      case 'a3': return { head: 'Rules CSPH in', tone: 'bad', stmt: '1.14, 1.16', why: `LSM ${p.lsm} kPa with platelets ${p.plt} leaves it open, but ${p.ant ? (p.bmi ? 'ANTICIPATE-NASH is ≥75%' : 'ANTICIPATE is ≥75%') : 'spleen stiffness is >55 kPa'}.`, next: 'Start a beta-blocker, carvedilol preferred.' };
      case 'a4': return { head: 'CSPH still open', tone: 'warn', stmt: '1.17', why: `LSM ${p.lsm} kPa with platelets ${p.plt} falls between the rules, and no model or spleen stiffness settles it.`, next: 'Repeat the tests in 12 months, or add spleen stiffness. Off a beta-blocker, scope for varices unless LSM <20 with platelets ≥150, or SSM <40 kPa.' };
      default: return { head: 'Rules CSPH in', tone: 'bad', stmt: '1.16b', why: `LSM ${p.lsm} kPa is ≥25.`, next: 'Start a beta-blocker, carvedilol preferred.' };
    }
  }
  const cls = cpClass(p.cp) + p.cp;
  switch (key) {
    case 'ptips': {
      const w = p.cp >= 10 && p.cp <= 13 ? `Child–Pugh ${cls} is C 10–13` : p.cp >= 8 && p.cp <= 9 && p.active ? `Child–Pugh ${cls} with active bleeding at endoscopy` : `HVPG ${p.hvpg} is ≥20`;
      return { head: 'Pre-emptive TIPS', tone: 'bad', stmt: '5.31', why: `Banding controlled the bleed. ${w}, and the patient is fit for TIPS.`, next: 'Within 72 hours, ideally within 24.' };
    }
    case 'nopt': return { head: 'Carvedilol and banding', tone: 'ok', stmt: 'Fig. 3', why: crit(p) ? 'Banding controlled the bleed. The patient meets the clinical criteria but is not fit for TIPS.' : 'Banding controlled the bleed, and no pre-emptive TIPS criterion is met.', next: 'Band every 2–4 weeks.' };
    case 'fail': return { head: 'Covered stent, then salvage TIPS', tone: 'bad', stmt: '5.35, 5.36', why: 'Banding did not control the bleeding.', next: 'A dedicated covered metal stent is preferred over a balloon, as a bridge to TIPS or liver transplant.' };
    case 'gv-tips': return { head: 'Two phases, in parallel', tone: 'bad', stmt: '5.39', why: 'A GOV2 or IGV1 bleed is high risk.', next: 'Stop the bleeding now: EUS-guided coil with cyanoacrylate, else cyanoacrylate injection. Then TIPS ± embolisation as soon as possible.' };
    default: return { head: 'Two phases, in parallel', tone: 'bad', stmt: '5.39', why: 'A GOV2 or IGV1 bleed is high risk.', next: `Stop the bleeding now: EUS-guided coil with cyanoacrylate, else cyanoacrylate injection. TIPS is not an option (${p.cp > 13 ? `Child–Pugh ${cls}` : 'not fit'}): transvenous obliteration, endoscopic or surgical options after MDT discussion.` };
  }
}

/** The patient's numbers as a short list of words ('LSM 31 kPa', 'Child–Pugh C11'), for the card's header. */
export function chipsOf(of, p) {
  if (of !== 'bleed') return [`LSM ${p.lsm} kPa`, `Platelets ${p.plt}`, p.bmi && 'BMI ≥30', p.ant && (p.bmi ? 'ANTICIPATE-NASH ≥75%' : 'ANTICIPATE ≥75%'), p.ssm && 'SSM >55 kPa'].filter(Boolean);
  return [p.src === 'gv' ? 'GOV2 or IGV1' : 'Oesophageal or GOV1', `Child–Pugh ${cpClass(p.cp)}${p.cp}`, p.hvpg != null && `HVPG ${p.hvpg}`, p.active ? 'Active bleeding' : 'No active bleeding', p.src !== 'gv' && (p.ctrl ? 'Controlled' : 'Not controlled'), !p.fit && 'Not fit for TIPS'].filter(Boolean);
}

/** Leaves under a node (a node with none counts one). */
export const leavesOf = (n) => (n.kids ? n.kids.reduce((s, k) => s + leavesOf(k), 0) : 1);

/** The patient a slide's tool names: the slide's own facts (tool.patient), over which the live model's readings go where it has them
 *  (fp: lsm, plt, ssm, hvpg), each as the tile prints it (shown(key, v)). A reading the model does not have leaves the slide's own. */
export function patientFor(t, fp, shown = (k, v) => v) {
  const base = { ...(t?.patient || {}) };
  const live = (k, v) => (fp && Number.isFinite(fp[k]) ? shown(k, fp[k]) : v);
  if (t?.of === 'bleed') return { src: 'ov', cp: 8, active: false, ctrl: true, fit: true, ...base, hvpg: base.hvpg === null ? null : live('hvpg', base.hvpg ?? 16) };
  const ssm = live('ssm', null);
  return { lsm: live('lsm', base.lsm ?? 12), plt: live('plt', base.plt ?? 200), bmi: !!base.bmi, ant: !!base.ant, ssm: ssm != null ? ssm > 55 : !!base.ssm };
}
