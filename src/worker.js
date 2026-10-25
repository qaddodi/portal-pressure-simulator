import { createCore } from './worker-core.js?v=76e93f8d04';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
