import { createCore } from './worker-core.js?v=e7b463551f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
