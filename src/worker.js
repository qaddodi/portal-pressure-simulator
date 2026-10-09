import { createCore } from './worker-core.js?v=6f2fdbc240';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
