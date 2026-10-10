import { createCore } from './worker-core.js?v=b37c4c9f5e';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
