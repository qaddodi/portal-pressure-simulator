import { createCore } from './worker-core.js?v=16317a0c7c';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
