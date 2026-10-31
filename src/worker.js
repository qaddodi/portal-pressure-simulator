import { createCore } from './worker-core.js?v=8c23c15673';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
