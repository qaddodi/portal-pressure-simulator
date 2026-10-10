import { createCore } from './worker-core.js?v=90da6c31b1';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
