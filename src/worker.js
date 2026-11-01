import { createCore } from './worker-core.js?v=5aeea5cf4c';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
