import { createCore } from './worker-core.js?v=471b1a440d';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
