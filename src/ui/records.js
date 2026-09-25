// Assessment records: every finished lesson and case is kept on this device and can be exported
// as CSV (for a gradebook) or as xAPI statements (for a learning record store). Nothing is sent
// anywhere; the student hands the file in, or an LMS integration picks it up.

const KEY = 'pps.records';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

export function addRecord(rec) {
  const all = read();
  all.push({ ...rec, date: new Date().toISOString() });
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-500))); } catch { /* storage unavailable */ }
}
export const records = read;
export function learnerName() { try { return localStorage.getItem('pps.learner') || ''; } catch { return ''; } }
export function setLearnerName(n) { try { localStorage.setItem('pps.learner', n); } catch { /* storage unavailable */ } }

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(list = read()) {
  const head = ['date', 'learner', 'kind', 'id', 'title', 'variant', 'score', 'outcome', 'duration_s', 'objectives_met', 'objectives_total', 'details'];
  const rows = list.map((r) => [r.date, learnerName(), r.kind, r.id, r.title, r.variant ?? '', r.score ?? '', r.outcome ?? '', r.duration != null ? Math.round(r.duration) : '', r.met ?? '', r.total ?? '',
    (r.objectives || []).map((o) => `${o.text}: ${o.state}`).concat(r.answers || []).join(' | ')]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

// xAPI 1.0.3 statements. The actor is the name typed on this device; the LMS maps it.
const BASE = 'https://portal-pressure-simulator.example/xapi';
export function toXAPI(list = read()) {
  const name = learnerName() || 'Anonymous learner';
  return list.map((r) => ({
    actor: { objectType: 'Agent', name, account: { homePage: BASE, name } },
    verb: r.outcome === 'death' || (r.score != null && r.score < 50)
      ? { id: 'http://adlnet.gov/expapi/verbs/failed', display: { 'en-US': 'failed' } }
      : { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'en-US': 'completed' } },
    object: { objectType: 'Activity', id: `${BASE}/${r.kind}/${r.id}`, definition: { name: { 'en-US': r.title }, type: r.kind === 'case' ? 'http://adlnet.gov/expapi/activities/simulation' : 'http://adlnet.gov/expapi/activities/lesson' } },
    result: { score: r.score != null ? { scaled: r.score / 100, raw: r.score, min: 0, max: 100 } : undefined, success: r.score != null ? r.score >= 50 : undefined, completion: true, duration: r.duration != null ? `PT${Math.round(r.duration)}S` : undefined,
      extensions: { [`${BASE}/ext/variant`]: r.variant ?? null, [`${BASE}/ext/objectives`]: r.objectives || [] } },
    timestamp: r.date,
  }));
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
