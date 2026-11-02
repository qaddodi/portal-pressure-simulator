import { createCore } from './worker-core.js?v=dd99640c93';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
