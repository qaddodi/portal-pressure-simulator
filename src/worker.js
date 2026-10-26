import { createCore } from './worker-core.js?v=8a06c43c7a';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
