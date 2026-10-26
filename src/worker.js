import { createCore } from './worker-core.js?v=1dd66c524e';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
