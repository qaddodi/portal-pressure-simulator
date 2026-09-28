import { createCore } from './worker-core.js?v=ad6533b3df';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
