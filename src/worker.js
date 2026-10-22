import { createCore } from './worker-core.js?v=6bb336c41d';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
