// Whether a landmark trial (trials.js) enrolled a patient like the one on screen: each of the trial's entry rules checked against the model's
// own numbers, where the model has the fact, and left open where it does not. Read by the Trials tab of the Tests card (trials-pane.js) and by
// the deck's trial slides. Pure: the same trial, metrics and params always give the same answer.
//
// A trial's `entry` is [{ rule, test, value? }]: `rule` the words the card shows ("HVPG 10 mmHg or more"), `test` one of the names below (or
// null: a rule the model has no field for, such as Child–Pugh class, a past bleed or the creatinine), `value` the number a test needs.
//   cirrhosis              the model's cirrhosis setting is on (params.cirrhosis above 0.1, as the explainer counts it)
//   hvpg_ge                the HVPG is at least `value` mmHg (metrics.hvpg; not known when it is hidden, not measured or the hepatic veins are
//                          thrombosed: hvBlocked)
//   compensated            no ascites (ascites grade 0)
//   ascites                ascites (grade 1 or more)
//   varices_not_high_risk  no large esophageal varix (the model's grading, metrics.js varixGrade: Small under 5 mm, Large from 5)
//   varices_medium_large   a large esophageal varix (5 mm or more)
//   gastric_varices        fundal varices present
//   acute_bleed            bleeding now
//   tips / no_tips         a TIPS in place, or none
// A rule may also carry `minor: true`: fine print that does not define who was enrolled (an age band, a platelet floor, the timing of
// randomization, the treatment given first). Every other rule is a defining rule: the population itself.
// Each rule comes back with its state for this patient: 'yes' (met), 'no' (not met) or 'na' (the model cannot tell), and the model's value in
// words. The verdict: 'no' when any rule the model can check fails; 'fits' only when EVERY defining rule was checked and met (15 Nov 2026, TR-5:
// "cirrhosis" alone used to make a compensated patient fit both early-TIPS trials); 'unknown' otherwise, that is when a defining rule is open
// (the model cannot tell) or the trial lists no rules. 'unknown' is never shown as eligible.

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

// Each test: (rule, metrics, params) → [state, value]. A fact the record does not carry answers 'na'.
const TESTS = {
  cirrhosis: (r, m, p) => (Number.isFinite(p?.cirrhosis) ? (p.cirrhosis > 0.1 ? ['yes', 'Cirrhosis'] : ['no', 'No cirrhosis']) : ['na', NOT_IN_MODEL]),
  hvpg_ge: (r, m, p) => {
    if (hvBlocked(p)) return ['na', 'HVPG not measurable'];
    const v = m?.hvpg;
    if (!Number.isFinite(v) || !Number.isFinite(r.value)) return ['na', 'HVPG not measured'];
    return [v >= r.value ? 'yes' : 'no', `HVPG ${one(v)} mmHg`];
  },
  compensated: (r, m) => { const g = ascitesGradeOf(m?.ascites); return g == null ? ['na', NOT_IN_MODEL] : [g === 0 ? 'yes' : 'no', ascitesWords(m.ascites)]; },
  ascites: (r, m) => { const g = ascitesGradeOf(m?.ascites); return g == null ? ['na', NOT_IN_MODEL] : [g >= 1 ? 'yes' : 'no', ascitesWords(m.ascites)]; },
  varices_not_high_risk: (r, m) => { const g = varixLabel(m?.varix); return g == null ? ['na', NOT_IN_MODEL] : [g === 'Large' ? 'no' : 'yes', varixWords(m.varix)]; },
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
export function fitTrial(trial, metrics, params) {
  const rows = [];
  let failed = 0, defining = 0, defined = 0;
  for (const e of trial?.entry ?? []) {
    const fn = e && typeof e.test === 'string' && Object.hasOwn(TESTS, e.test) ? TESTS[e.test] : null;
    const [state, value] = fn ? fn(e, metrics, params) : ['na', NOT_IN_MODEL];
    const isDefining = e?.minor !== true;
    if (state === 'no') failed++;
    if (isDefining) { defining++; if (state === 'yes') defined++; }
    const row = { rule: String(e?.rule ?? ''), state, value: value ?? NOT_IN_MODEL, defining: isDefining };
    if (e?.test === 'hvpg_ge' && Number.isFinite(e.value)) row.need = `≥${e.value}`;
    rows.push(row);
  }
  // met / of: the defining rules the model checked and found met, out of all the defining rules ("2 of 5 entry rules checked").
  return { verdict: failed ? 'no' : defining && defined === defining ? 'fits' : 'unknown', rows, met: defined, of: defining };
}

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
  if (Number.isFinite(fp.varix)) m.varix = { d: fp.varix, grade: varixGrade(fp.varix), present: fp.varix >= VARIX_NONE_MM };
  if (Number.isFinite(fp.gv)) m.gastricVarix = { d: fp.gv, present: fp.gv >= VARIX_NONE_MM };
  if (Number.isFinite(fp.asc)) m.ascites = { volume: fp.asc, grade: ascitesGrade(fp.asc).grade };
  return m;
}

/** The rows that keep a patient out of the trial (state 'no'), for the "Not this patient" reason. */
export const failedRows = (fit) => fit.rows.filter((r) => r.state === 'no');
