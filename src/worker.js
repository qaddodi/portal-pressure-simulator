import { createCore } from './worker-core.js?v=2076b64c73';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
