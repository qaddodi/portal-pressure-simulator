import { createCore } from './worker-core.js?v=07b9e7a4e1';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
