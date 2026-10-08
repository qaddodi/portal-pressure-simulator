import { createCore } from './worker-core.js?v=bdb0723d3b';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
