import { createCore } from './worker-core.js?v=1a69cda184';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
