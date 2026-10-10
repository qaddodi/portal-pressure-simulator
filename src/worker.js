import { createCore } from './worker-core.js?v=b3f3992766';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
