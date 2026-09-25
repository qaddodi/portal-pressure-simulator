import { createCore } from './worker-core.js?v=142bb04bd7';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
