import { createCore } from './worker-core.js?v=82070e9bbf';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
