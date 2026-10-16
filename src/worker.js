import { createCore } from './worker-core.js?v=aa5565daa8';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
