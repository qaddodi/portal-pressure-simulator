import { createCore } from './worker-core.js?v=0d00d08407';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
