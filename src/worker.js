import { createCore } from './worker-core.js?v=773cc8d82f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
