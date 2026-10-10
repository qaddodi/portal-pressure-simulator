import { createCore } from './worker-core.js?v=c394f5eab9';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
