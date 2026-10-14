import { createCore } from './worker-core.js?v=fd536e46c0';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
