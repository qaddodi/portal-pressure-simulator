// LMS bridge, client side only. When the simulator runs inside a SCORM 1.2 package (see
// scripts/scorm.mjs) the LMS exposes an `API` object on a parent frame; we initialize it, report
// each finished lesson or case as the score, and finish on exit. Outside an LMS this does nothing.
// xAPI statements are available as an export (records.js); LTI 1.3 needs a server and is not part
// of this static build.

import { onRecord, records, learnerName, setLearnerName } from './records.js?v=379d033371';
import { lmsReport, MASTERY } from './assess.js?v=a4326ba599';

function findAPI(win) {
  for (let i = 0; win && i < 10; i++) {
    try { if (win.API) return win.API; } catch { /* cross-origin frame */ }
    if (win.parent === win) break;
    win = win.parent;
  }
  try { return window.opener?.API || null; } catch { return null; }
}

export function startLMS() {
  const api = findAPI(window);
  if (!api) return null;
  try {
    api.LMSInitialize('');
    const name = api.LMSGetValue('cmi.core.student_name');
    if (name && !learnerName()) setLearnerName(name);
    if (api.LMSGetValue('cmi.core.lesson_status') === 'not attempted') api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    api.LMSCommit('');
  } catch { return null; }
  // What this package reports: one activity when launched into it (?lesson= / ?case=), otherwise
  // the whole course (every lesson and case, by best attempt each, never a maximum across them).
  // Presentations are ungraded.
  const q = new URLSearchParams(location.search);
  const single = q.get('lesson') ? { kind: 'lesson', id: q.get('lesson') } : q.get('case') ? { kind: 'case', id: q.get('case') } : null;
  let required = single ? [single] : null;
  const catalog = async () => {
    if (required) return required;
    const [{ LESSONS }, { CASES }] = await Promise.all([import('./learn.js?v=8585ee3963'), import('./cases.js?v=56a5affbf2')]);
    return (required = [...LESSONS.map((l) => ({ kind: 'lesson', id: l.id })), ...CASES.map((c) => ({ kind: 'case', id: c.id }))]);
  };
  if (q.get('script')) return api; // presentations are ungraded
  onRecord(async (r) => {
    if (r.score == null) return;
    try {
      const req = await catalog();
      if (!req.some((x) => x.kind === r.kind && x.id === r.id)) return;
      const rep = lmsReport(records(), req);
      api.LMSSetValue('cmi.core.score.min', '0');
      api.LMSSetValue('cmi.core.score.max', '100');
      api.LMSSetValue('cmi.core.score.raw', String(rep.raw));
      api.LMSSetValue('cmi.core.lesson_status', rep.status === 'incomplete' ? 'incomplete' : rep.status);
      api.LMSSetValue('cmi.suspend_data', JSON.stringify({ mastery: MASTERY, last: { kind: r.kind, id: r.id, score: r.score, mastered: !!r.mastered } }).slice(0, 4000));
      api.LMSCommit('');
    } catch { /* LMS unavailable */ }
  });
  addEventListener('pagehide', () => { try { api.LMSFinish(''); } catch { /* already finished */ } });
  return api;
}
