import { createCore } from './worker-core.js?v=a5e9bf9971';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
