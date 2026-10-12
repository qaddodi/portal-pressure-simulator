import { createCore } from './worker-core.js?v=34c6a5ca8d';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
