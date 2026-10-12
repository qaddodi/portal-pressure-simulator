import { createCore } from './worker-core.js?v=c0ea950974';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
