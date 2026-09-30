import { createCore } from './worker-core.js?v=4fa8017f56';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
