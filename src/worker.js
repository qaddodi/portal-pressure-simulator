import { createCore } from './worker-core.js?v=ef333b316a';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
