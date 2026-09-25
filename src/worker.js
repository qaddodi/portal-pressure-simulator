import { createCore } from './worker-core.js?v=c3d984ada1';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
