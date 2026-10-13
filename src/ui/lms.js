// LMS bridge, client side only. When the simulator runs inside a SCORM 1.2 package (see
// scripts/scorm.mjs) the LMS exposes an `API` object on a parent frame; we initialize it and finish
// on exit (presentations and patients are ungraded). Outside an LMS this does nothing.
// xAPI statements are available as an export (records.js); LTI 1.3 needs a server and is not part
// of this static build.

import { learnerName, setLearnerName } from './records.js?v=50fb9dd463';

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
  addEventListener('pagehide', () => { try { api.LMSFinish(''); } catch { /* already finished */ } });
  return api;
}
