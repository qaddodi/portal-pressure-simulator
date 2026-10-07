import { createCore } from './worker-core.js?v=dcefee51f1';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
