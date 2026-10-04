import { createCore } from './worker-core.js?v=4172e8fef4';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
