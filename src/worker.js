import { createCore } from './worker-core.js?v=81ccd2c11d';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
