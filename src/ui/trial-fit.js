// PLACEHOLDER, replaced at merge by the trial-fit agent's file: whether a patient fits a trial's entry rules. This stand-in keeps the API
// (fitTrial(trial, metrics, params) → { verdict: 'fits' | 'no' | 'unknown', rows: [{ rule, state: 'yes' | 'no' | 'na', value }] }) and
// always answers that the model cannot tell.

/** Whether the patient (the model's metrics and params) fits trial t's entry rules. */
export function fitTrial(trial, metrics, params) {
  return { verdict: 'unknown', rows: [] };
}
