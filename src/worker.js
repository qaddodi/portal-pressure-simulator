import { createCore } from './worker-core.js?v=56f5d707c1';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
