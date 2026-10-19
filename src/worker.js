import { createCore } from './worker-core.js?v=c0cfc5e1c9';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
