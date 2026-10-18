import { createCore } from './worker-core.js?v=baa720dd6f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
