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
// Each rule comes back with its state for this patient: 'yes' (met), 'no' (not met) or 'na' (the model cannot tell), and the model's value in
// words. The verdict: 'no' when any rule the model can check fails; 'fits' when every rule it can check is met and it could check at least one;
// 'unknown' when it could check none. 'unknown' is never shown as eligible.

import { hvBlocked } from '../engine/pressure-cuts.js';
import { varixGrade } from '../engine/metrics.js';

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

/** The trial's entry rules checked against the model: { verdict: 'fits' | 'no' | 'unknown', rows: [{ rule, state: 'yes' | 'no' | 'na', value }] }. */
export function fitTrial(trial, metrics, params) {
  const rows = [];
  let checked = 0, failed = 0;
  for (const e of trial?.entry ?? []) {
    const fn = e && typeof e.test === 'string' && Object.hasOwn(TESTS, e.test) ? TESTS[e.test] : null;
    const [state, value] = fn ? fn(e, metrics, params) : ['na', NOT_IN_MODEL];
    if (state !== 'na') { checked++; if (state === 'no') failed++; }
    rows.push({ rule: String(e?.rule ?? ''), state, value: value ?? NOT_IN_MODEL });
  }
  return { verdict: failed ? 'no' : checked ? 'fits' : 'unknown', rows };
}

/** The rows that keep a patient out of the trial (state 'no'), for the "Not this patient" reason. */
export const failedRows = (fit) => fit.rows.filter((r) => r.state === 'no');
