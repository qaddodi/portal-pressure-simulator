// Assessment records: every finished lesson and case is kept on this device and can be exported
// as CSV (for a gradebook) or as xAPI statements (for a learning record store). Nothing is sent
// anywhere; the student hands the file in, or an LMS integration picks it up.

import { XAPI_BASE as BASE, recordResult } from './assess.js?v=7f4afcf446';

const KEY = 'pps.records';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

const listeners = [];
/** Called with every new record (the LMS bridge reports scores this way). */
export const onRecord = (fn) => listeners.push(fn);
export function addRecord(rec) {
  const all = read();
  const r = { ...rec, date: new Date().toISOString() };
  all.push(r);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-500))); } catch { /* storage unavailable */ }
  for (const fn of listeners) { try { fn(r); } catch { /* a listener must not break the record */ } }
}
export const records = read;
export function learnerName() { try { return localStorage.getItem('pps.learner') || ''; } catch { return ''; } }
export function setLearnerName(n) { try { localStorage.setItem('pps.learner', n); } catch { /* storage unavailable */ } }

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCSV(list = read()) {
  const head = ['date', 'learner', 'kind', 'id', 'title', 'variant', 'score', 'outcome', 'duration_s', 'objectives_met', 'objectives_total', 'mastered', 'content_version', 'wall_duration_s', 'details'];
  const rows = list.map((r) => [r.date, learnerName(), r.kind, r.id, r.title, r.variant ?? '', r.score ?? '', r.outcome ?? '', r.duration != null ? Math.round(r.duration) : '', r.met ?? '', r.total ?? '', r.assessment >= 2 ? r.mastered : '', r.contentVersion ?? '', r.wallDuration != null ? Math.round(r.wallDuration) : '',
    (r.objectives || []).map((o) => `${o.text}: ${o.state}`).concat(r.answers || []).join(' | ')]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

// xAPI 1.0.3 statements. The actor is the name typed on this device; the LMS maps it.
function toXAPI(list = read()) {
  const name = learnerName() || 'Anonymous learner';
  return list.map((r) => {
    const { mastered } = recordResult(r);
    const verb = mastered ? ['passed', 'passed'] : r.assessment >= 2 && r.completed !== false ? ['completed', 'completed'] : ['failed', 'failed'];
    return {
      actor: { objectType: 'Agent', name, account: { homePage: BASE, name } },
      verb: { id: `http://adlnet.gov/expapi/verbs/${verb[0]}`, display: { 'en-US': verb[1] } },
      object: { objectType: 'Activity', id: `${BASE}/${r.kind}/${r.id}`, definition: { name: { 'en-US': r.title }, type: r.kind === 'case' ? 'http://adlnet.gov/expapi/activities/simulation' : 'http://adlnet.gov/expapi/activities/lesson' } },
      result: { score: r.score != null ? { scaled: r.score / 100, raw: r.score, min: 0, max: 100 } : undefined, success: r.score != null ? mastered : undefined, completion: r.completed !== false, duration: r.duration != null ? `PT${Math.round(r.duration)}S` : undefined,
        extensions: { [`${BASE}/ext/variant`]: r.variant ?? null, [`${BASE}/ext/seed`]: r.seed ?? r.variant ?? null, [`${BASE}/ext/objectives`]: r.objectives || [],
          [`${BASE}/ext/assessment-version`]: r.assessment ?? 1, [`${BASE}/ext/content-version`]: r.contentVersion ?? null, [`${BASE}/ext/weights`]: r.weights ?? null,
          [`${BASE}/ext/mastered`]: mastered, [`${BASE}/ext/outcome`]: r.outcome ?? null, [`${BASE}/ext/simulated-duration-s`]: r.duration != null ? Math.round(r.duration) : null, [`${BASE}/ext/wall-duration-s`]: r.wallDuration != null ? Math.round(r.wallDuration) : null } },
      timestamp: r.date,
    };
  });
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function exportCSV() { download('portal-simulator-records.csv', toCSV(), 'text/csv'); }
export function exportXAPI() { download('portal-simulator-xapi.json', JSON.stringify(toXAPI(), null, 2), 'application/json'); }
