import { createCore } from './worker-core.js?v=3633ccddbe';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
