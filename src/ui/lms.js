// LMS bridge, client side only. When the simulator runs inside a SCORM 1.2 package (see
// scripts/scorm.mjs) the LMS exposes an `API` object on a parent frame; we initialize it, report
// each finished lesson or case as the score, and finish on exit. Outside an LMS this does nothing.
// xAPI statements are available as an export (records.js); LTI 1.3 needs a server and is not part
// of this static build.

import { onRecord, learnerName, setLearnerName } from './records.js?v=26ab8fb634';

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
  let best = 0;
  onRecord((r) => {
    if (r.score == null) return;
    best = Math.max(best, r.score);
    try {
      api.LMSSetValue('cmi.core.score.min', '0');
      api.LMSSetValue('cmi.core.score.max', '100');
      api.LMSSetValue('cmi.core.score.raw', String(best));
      api.LMSSetValue('cmi.core.lesson_status', best >= 50 ? 'passed' : 'failed');
      api.LMSSetValue('cmi.suspend_data', JSON.stringify({ last: { kind: r.kind, id: r.id, score: r.score } }).slice(0, 4000));
      api.LMSCommit('');
    } catch { /* LMS unavailable */ }
  });
  addEventListener('pagehide', () => { try { api.LMSFinish(''); } catch { /* already finished */ } });
  return api;
}
