import { createCore } from './worker-core.js?v=5da0fe0faf';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
