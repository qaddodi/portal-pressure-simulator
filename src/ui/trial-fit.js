// Whether a landmark trial (trials.js) enrolled a patient like the one on screen: each of the trial's entry rules checked against the model's
// own numbers, where the model has the fact, and left open where it does not. Read by the Trials tab of the Tests card (trials-pane.js) and by
// the deck's trial slides. Pure: the same trial, metrics and params always give the same answer.
//
// A trial's `entry` is [{ rule, test, value? }]: `rule` the words the card shows ("HVPG 10 mmHg or more"), `test` one of the names below (or
// null: a rule the model has no field for, such as Child–Pugh class, a past bleed or the creatinine), `value` the number a test needs.
//   cirrhosis              the model's cirrhosis setting is on (params.cirrhosis above 0.1, as the explainer counts it)
//   hvpg_ge                the HVPG is at least `value` mmHg (metrics.hvpg; not known when it is hidden, not measured or the hepatic veins are
//                          thrombosed: hvBlocked)
//   compensated            never decompensated. The model knows only part of it: ascites or a bleed now rule it out ('no'); the absence of both
//                          proves nothing about an earlier decompensation (ascites, bleeding, encephalopathy, jaundice), so it stays 'na' until a
//                          case author supplies the fact (`facts.decompensated: false`, see below). "No ascites" is true; it is not "compensated".
//   ascites                ascites (grade 1 or more)
//   varices_not_high_risk  no high-risk esophageal varix: not Large (the model's grading, metrics.js varixGrade: Small under 5 mm, Large from 5) and no
//                          red wale signs. A Large varix or red wale rules it out; a varix that is not Large with the red wale signs unknown stays 'na'.
//   varices_medium_large   a large esophageal varix (5 mm or more)
//   gastric_varices        fundal varices present
//   acute_bleed            bleeding now
//   tips / no_tips         a TIPS in place, or none
// Facts the model does not have (a past bleed, a prior decompensation, the Child–Pugh class) come in as the fourth argument of fitTrial, `facts`, from a
// case author (a slide's trial tool: `facts: { decompensated: false }`), never from the model: { decompensated?: boolean }. A fact the author did not
// supply stays unknown, and a row that rests on one says so in its value ("case history") and in `source: 'case'`; a row that rests on the model's own
// numbers has `source: 'model'`. Only real booleans count as a fact.
// A rule may also carry `minor: true`: fine print that does not define who was enrolled (an age band, a platelet floor, the timing of
// randomization, the treatment given first). Every other rule is a defining rule: the population itself.
// Each rule comes back with its state for this patient: 'yes' (met), 'no' (not met) or 'na' (the model cannot tell), and the model's value in
// words. The verdict: 'no' when any rule the model can check fails; 'fits' only when EVERY defining rule was checked and met (15 Nov 2026, TR-5:
// "cirrhosis" alone used to make a compensated patient fit both early-TIPS trials); 'unknown' otherwise, that is when a defining rule is open
// (the model cannot tell) or the trial lists no rules. 'unknown' is never shown as eligible.
// Even 'fits' is not "eligible" or "enrolled": the entry list is the audited abstract's, not the protocol's whole eligibility set, so the words for it
// (FITS_WORDS) read "Matches the modeled criteria. Eligibility is incomplete." and name the rules still open (R01, external review 15 Nov 2026).

import { hvBlocked } from '../engine/pressure-cuts.js';
import { varixGrade, ascitesGrade, VARIX_NONE_MM } from '../engine/metrics.js';

export const NOT_IN_MODEL = 'Not in the model';
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
const varixWords = (vx) => {
  const d = vx?.d, g = vx?.grade?.label ?? (Number.isFinite(d) ? varixGrade(d).label : null);
  if (!g) return null;
  if (g === 'None' || vx?.present === false) return 'No varices';
  return Number.isFinite(d) ? `${g}, ${one(d)} mm` : g;
};
const varixLabel = (vx) => vx?.grade?.label ?? (Number.isFinite(vx?.d) ? varixGrade(vx.d).label : null);
const ascitesGradeOf = (a) => (a && Number.isFinite(a.grade) ? a.grade : null);
const ascitesWords = (a) => (ascitesGradeOf(a) ? `Ascites ${one((a.volume || 0) / 1000)} L` : 'No ascites');
const isBool = (v) => v === true || v === false;

// Each test: (rule, metrics, params) → [state, value]. A fact the record does not carry answers 'na'.
const TESTS = {
  cirrhosis: (r, m, p) => (Number.isFinite(p?.cirrhosis) ? (p.cirrhosis > 0.1 ? ['yes', 'Cirrhosis'] : ['no', 'No cirrhosis']) : ['na', NOT_IN_MODEL]),
  hvpg_ge: (r, m, p) => {
    if (hvBlocked(p)) return ['na', 'HVPG not measurable'];
    const v = m?.hvpg;
    if (!Number.isFinite(v) || !Number.isFinite(r.value)) return ['na', 'HVPG not measured'];
    return [v >= r.value ? 'yes' : 'no', `HVPG ${one(v)} mmHg`];
  },
  // (Ascites or a bleed now: decompensated, known. Neither: the model has no history, so only a case author's `decompensated: false` can make it 'yes'.)
  compensated: (r, m, p, facts) => {
    const g = ascitesGradeOf(m?.ascites);
    if (g >= 1) return ['no', ascitesWords(m.ascites)];
    if (m?.bleeding) return ['no', 'Bleeding now'];
    if (facts?.decompensated === true) return ['no', 'Decompensated before (case history)'];
    if (facts?.decompensated === false && g === 0) return ['yes', 'No decompensation (case history)'];
    return ['na', g === 0 ? 'No ascites; earlier decompensation not in the model' : NOT_IN_MODEL];
  },
  ascites: (r, m) => { const g = ascitesGradeOf(m?.ascites); return g == null ? ['na', NOT_IN_MODEL] : [g >= 1 ? 'yes' : 'no', ascitesWords(m.ascites)]; },
  // (Large, or red wale signs on any varix: high risk, known. No varices: nothing to be high risk. Otherwise the red wale signs must be known to say 'yes'.)
  varices_not_high_risk: (r, m) => {
    const vx = m?.varix, g = varixLabel(vx);
    if (g == null) return ['na', NOT_IN_MODEL];
    if (g === 'Large') return ['no', varixWords(vx)];
    if (vx.present === false || g === 'None') return ['yes', varixWords(vx)];
    if (vx.redWale === true) return ['no', `${varixWords(vx)}, red wale signs`];
    return isBool(vx.redWale) ? ['yes', `${varixWords(vx)}, no red wale signs`] : ['na', `${varixWords(vx)}; red wale signs not recorded`];
  },
  varices_medium_large: (r, m) => { const g = varixLabel(m?.varix); return g == null ? ['na', NOT_IN_MODEL] : [g === 'Large' && m.varix.present !== false ? 'yes' : 'no', varixWords(m.varix)]; },
  gastric_varices: (r, m) => (m?.gastricVarix ? (m.gastricVarix.present ? ['yes', 'Fundal varices'] : ['no', 'No fundal varices']) : ['na', NOT_IN_MODEL]),
  acute_bleed: (r, m) => (m && 'bleeding' in m ? (m.bleeding ? ['yes', 'Bleeding now'] : ['no', 'Not bleeding']) : ['na', NOT_IN_MODEL]),
  tips: (r, m, p) => (p?.tips ? (p.tips.on ? ['yes', 'TIPS in place'] : ['no', 'No TIPS']) : ['na', NOT_IN_MODEL]),
  no_tips: (r, m, p) => (p?.tips ? (p.tips.on ? ['no', 'TIPS in place'] : ['yes', 'No TIPS']) : ['na', NOT_IN_MODEL]),
};
/** The test names fitTrial knows. */
export const FIT_TESTS = Object.freeze(Object.keys(TESTS));

/** The trial's entry rules checked against the model: { verdict: 'fits' | 'no' | 'unknown', rows: [{ rule, state: 'yes' | 'no' | 'na', value,
 *  defining }] }. 'fits' needs every defining rule checked and met; one rule that fails is 'no'; anything else is 'unknown'. */
export function fitTrial(trial, metrics, params, facts = null) {
  const rows = [];
  let failed = 0, defining = 0, defined = 0;
  for (const e of trial?.entry ?? []) {
    const fn = e && typeof e.test === 'string' && Object.hasOwn(TESTS, e.test) ? TESTS[e.test] : null;
    const [state, value] = fn ? fn(e, metrics, params, facts) : ['na', NOT_IN_MODEL];
    const isDefining = e?.minor !== true;
    if (state === 'no') failed++;
    if (isDefining) { defining++; if (state === 'yes') defined++; }
    const row = { rule: String(e?.rule ?? ''), state, value: value ?? NOT_IN_MODEL, defining: isDefining, source: /\(case history\)/.test(value ?? '') ? 'case' : fn && state !== 'na' ? 'model' : null };
    if (e?.test === 'hvpg_ge' && Number.isFinite(e.value)) row.need = `≥${e.value}`;
    rows.push(row);
  }
  // met / of: the defining rules the model checked and found met, out of all the defining rules ("2 of 5 entry rules checked").
  return { verdict: failed ? 'no' : defining && defined === defining ? 'fits' : 'unknown', rows, met: defined, of: defining };
}

/** What a fit that matches every defining rule may say: never eligible, never enrolled (R01). */
export const FITS_HEAD = 'Matches the modeled criteria';
export const FITS_WORDS = `${FITS_HEAD}. Eligibility is incomplete.`;
/** "Still needed: …": the rules the model cannot check, defining rules first, or '' when none is open. */
export const stillNeeded = (fit) => { const o = openRows(fit); return o.length ? `Still needed: ${o.map((x) => lcFirst(x.rule)).join(', ')}` : ''; };
/** A fit that matches in full, in one line: the head, that eligibility is incomplete, what is still needed, and which rules rest on a case author's word. */
export const fitsWords = (fit) => {
  const n = stillNeeded(fit), c = fit.rows.filter((x) => x.source === 'case' && x.state === 'yes');
  return [FITS_WORDS, n && `${n}.`, c.length && `From the case history: ${c.map((x) => lcFirst(x.rule)).join(', ')}.`].filter(Boolean).join(' ');
};

/** The pane's group for a fit: 'fits', 'possible' (not every defining rule could be checked, but some were and all of those were met), 'no' or
 *  'unknown' (nothing that defines the trial could be checked). */
export const groupOf = (fit) => (fit.verdict === 'unknown' && fit.met > 0 ? 'possible' : fit.verdict);
/** "Possibly fits: 2 of 5 entry rules checked". */
export const possiblyWords = (fit) => `Possibly fits: ${fit.met} of ${fit.of} entry rule${fit.of === 1 ? '' : 's'} checked`;
/** A rule's words with a lower-case start, except a name that starts with a capital for a reason (HVPG, Child–Pugh). */
export const lcFirst = (s) => (/^[A-Z][a-z]*(?=[\s,.;:]|$)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
/** The one rule that keeps the patient out, as a line: "HVPG 8.2, needs ≥10" (the first rule that fails), or null when none fails. */
export function whyNot(fit) {
  const r = fit?.rows?.find((x) => x.state === 'no');
  if (!r) return null;
  return r.need ? `${r.value.replace(/ mmHg$/, '')}, needs ${r.need}` : `${r.value}, needs ${lcFirst(r.rule)}`;
}

/** The rows that are open: a rule the model cannot check, defining rules first. */
export const openRows = (fit) => fit.rows.filter((r) => r.state === 'na').sort((a, b) => Number(b.defining) - Number(a.defining));

/** A slide's patient (its fingerprint, fingerprint.js: hvpg, varix and gv diameters in mm, asc in mL) in the shape fitTrial reads, so a deck's
 *  card and the Tests card ask the same tests. A fact the fingerprint does not carry (bleeding now) stays out, and its row answers 'na'. */
export function metricsOfFp(fp) {
  if (!fp) return null;
  const m = {};
  if ('hvpg' in fp) m.hvpg = fp.hvpg;
  if (Number.isFinite(fp.varix)) m.varix = { d: fp.varix, grade: varixGrade(fp.varix), present: fp.varix >= VARIX_NONE_MM, ...(typeof fp.redWale === 'boolean' ? { redWale: fp.redWale } : {}) };
  if (Number.isFinite(fp.gv)) m.gastricVarix = { d: fp.gv, present: fp.gv >= VARIX_NONE_MM };
  if (Number.isFinite(fp.asc)) m.ascites = { volume: fp.asc, grade: ascitesGrade(fp.asc).grade };
  return m;
}

/** The rows that keep a patient out of the trial (state 'no'), for the "Not this patient" reason. */
export const failedRows = (fit) => fit.rows.filter((r) => r.state === 'no');
