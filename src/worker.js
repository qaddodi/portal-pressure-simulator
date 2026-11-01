import { createCore } from './worker-core.js?v=5a26888c69';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
