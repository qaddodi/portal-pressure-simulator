import { createCore } from './worker-core.js?v=868577f1b2';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
