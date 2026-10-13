import { createCore } from './worker-core.js?v=3ebdd4d5c7';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
