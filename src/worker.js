import { createCore } from './worker-core.js?v=34853f3e6b';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
