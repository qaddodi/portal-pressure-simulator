import { createCore } from './worker-core.js?v=b3c10ff1ea';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
