import { createCore } from './worker-core.js?v=50d97b6d5e';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
