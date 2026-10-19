import { createCore } from './worker-core.js?v=508ec04d04';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
