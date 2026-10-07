import { createCore } from './worker-core.js?v=cf5ca004f0';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
