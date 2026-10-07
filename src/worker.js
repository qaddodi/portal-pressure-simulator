import { createCore } from './worker-core.js?v=01fdb5c825';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
