import { createCore } from './worker-core.js?v=99bd7d95ed';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
