import { createCore } from './worker-core.js?v=da76c8f252';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
