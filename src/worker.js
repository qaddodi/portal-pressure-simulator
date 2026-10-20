import { createCore } from './worker-core.js?v=c7f1386988';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
