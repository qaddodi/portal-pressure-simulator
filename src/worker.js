import { createCore } from './worker-core.js?v=78f59b6fc0';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
