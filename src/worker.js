import { createCore } from './worker-core.js?v=ddd5bb1777';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
