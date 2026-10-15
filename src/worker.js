import { createCore } from './worker-core.js?v=f966392d8b';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
