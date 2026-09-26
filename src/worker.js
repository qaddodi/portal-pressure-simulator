import { createCore } from './worker-core.js?v=5b4df37da0';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
