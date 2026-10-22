import { createCore } from './worker-core.js?v=2b5122e2dd';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
