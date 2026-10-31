import { createCore } from './worker-core.js?v=c69d6181df';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
