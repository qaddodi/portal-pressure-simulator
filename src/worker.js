import { createCore } from './worker-core.js?v=1cf2ca8c96';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
