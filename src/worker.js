import { createCore } from './worker-core.js?v=4b697472e7';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
