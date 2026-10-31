import { createCore } from './worker-core.js?v=33e79207e0';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
