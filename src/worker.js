import { createCore } from './worker-core.js?v=09bc3c907f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
