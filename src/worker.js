import { createCore } from './worker-core.js?v=f07b2ee0f5';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
