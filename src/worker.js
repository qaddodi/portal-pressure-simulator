import { createCore } from './worker-core.js?v=7582bd5fd2';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
