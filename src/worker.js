import { createCore } from './worker-core.js?v=d1b15943e0';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
