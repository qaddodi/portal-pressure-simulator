import { createCore } from './worker-core.js?v=0dca4739ac';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
