import { createCore } from './worker-core.js?v=d9405668f4';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
