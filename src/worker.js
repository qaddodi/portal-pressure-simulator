import { createCore } from './worker-core.js';
import { createTestClock } from './test-clock.js';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
// The test clock (src/test-clock.js, pps.testClock): the page sends the time every 16 ms of its own, and this worker's timers and clock run up
// to it, so the model's time keeps the page's in a pane the browser throttles. Each tick is answered, so the page knows how far behind this is.
let tc = null, base = 0, mainBase = 0;
self.onmessage = (e) => {
  const m = e.data;
  if (m && m.type === 'testclock') {
    if (m.off) { tc?.dispose(); tc = null; return; }
    if (!tc) { tc = createTestClock(self, { page: false }); tc.install(); base = tc.now(); mainBase = m.now; }
    tc.advanceTo(base + (m.now - mainBase));
    self.postMessage({ type: 'testclockAck', seq: m.seq });
    return;
  }
  core.handle(m);
};
