import { createCore } from './worker-core.js?v=70941d5b35';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
