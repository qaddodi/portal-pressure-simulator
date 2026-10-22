import { createCore } from './worker-core.js?v=5b6f8a4fc3';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
