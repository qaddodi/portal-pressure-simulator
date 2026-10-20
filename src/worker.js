import { createCore } from './worker-core.js?v=e4b7cf6f74';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
