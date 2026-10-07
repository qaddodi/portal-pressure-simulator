// Assessment contract (blueprint F8). Pure functions, no DOM, so scoring is unit-testable.
//   - Each stable answer key counts once per attempt: the first submitted answer. Revisiting a
//     step can never add or change points; a retry is a new attempt.
//   - Case objectives carry weights (summing to 100) and may be critical: any failed critical
//     objective means "not mastered" whatever the raw score. Raw points are kept on death/timeout.
//   - Mastery is 80 % (and, for cases, every critical objective met). Completed ≠ mastered.
//   - Records store the contract version they were scored under; old records keep their old rule.

export const ASSESSMENT_VERSION = 2;
export const CONTENT_VERSION = '2026.10-b8';
export const MASTERY = 80;
/** Stable activity namespace for xAPI (the live site's own address). */
export const XAPI_BASE = 'https://qaddodi.github.io/portal-pressure-simulator/xapi';

/** First-answer-only sheet keyed by stable assessment keys such as `lesson:hvpg:step-07:q1`. */
export function createAnswerSheet() {
  const a = new Map();
  return {
    /** Records the first answer for a key; later calls for the same key are ignored. */
    record(key, correct) { if (!a.has(key)) a.set(key, !!correct); return a.get(key); },
    has: (key) => a.has(key),
    entries: () => [...a],
    score() {
      const total = a.size, right = [...a.values()].filter(Boolean).length;
      return scoreLesson(right, total);
    },
  };
}

export function scoreLesson(right, total) {
  const score = total ? Math.round((right / total) * 100) : 100;
  return { right, total, score, mastered: score >= MASTERY };
}

/** Weight of each objective: its own `weight`, else an equal share of the remainder up to 100. */
export function weightsOf(objectives) {
  const fixed = objectives.reduce((s, o) => s + (o.weight ?? 0), 0);
  const free = objectives.filter((o) => o.weight == null).length;
  const share = free ? Math.max(0, 100 - fixed) / free : 0;
  const w = objectives.map((o) => o.weight ?? share);
  const sum = w.reduce((s, x) => s + x, 0) || 1;
  return w.map((x) => (x / sum) * 100);
}

/**
 * @param objectives [{ id, weight?, critical? }]
 * @param states     id → 'met' | 'failed' | null
 * @param outcome    'success' | 'death' | 'timeout'
 */
export function scoreCase(objectives, states, outcome) {
  const w = weightsOf(objectives);
  let earned = 0;
  const failedCritical = [];
  objectives.forEach((o, i) => {
    if (states[o.id] === 'met') earned += w[i];
    else if (o.critical) failedCritical.push(o.id);
  });
  const score = Math.round(earned);
  const mastered = outcome === 'success' && score >= MASTERY && !failedCritical.length;
  const status = mastered ? 'mastered' : outcome === 'success' ? 'completed' : outcome;
  return { score, mastered, failedCritical, status, completed: outcome === 'success', weights: Object.fromEntries(objectives.map((o, i) => [o.id, Math.round(w[i] * 10) / 10])) };
}

/** Success and mastery of any stored record, under the contract it was scored with. */
export function recordResult(r) {
  if (r.assessment >= 2) return { completed: r.completed !== false, mastered: !!r.mastered };
  return { completed: true, mastered: r.score != null && r.score >= 50 && r.outcome !== 'death' }; // legacy rule
}

/**
 * What an LMS should hear. `required` is [{kind,id}]: one entry for a single-activity package,
 * every lesson and case for the whole course. Each activity counts by its best attempt (a
 * mastered attempt outranks a higher unmastered one); the course is the mean of those, not a max.
 */
export function lmsReport(list, required) {
  const best = required.map((q) => {
    const rs = list.filter((r) => r.kind === q.kind && r.id === q.id && r.score != null);
    let b = null;
    for (const r of rs) {
      const x = { score: r.score, ...recordResult(r) };
      if (!b || (x.mastered && !b.mastered) || (x.mastered === b.mastered && x.score > b.score)) b = x;
    }
    return b;
  });
  const done = best.filter(Boolean);
  const raw = best.length ? Math.round(best.reduce((s, b) => s + (b ? b.score : 0), 0) / best.length) : 0;
  const complete = done.length === best.length && best.length > 0;
  const mastered = complete && done.every((b) => b.mastered);
  return { raw, complete, mastered, status: !complete ? 'incomplete' : mastered ? 'passed' : 'failed' };
}
