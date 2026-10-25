import { createCore } from './worker-core.js?v=e5ecd47091';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
