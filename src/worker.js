import { createCore } from './worker-core.js?v=92dd6785ea';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
