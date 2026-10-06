import { createCore } from './worker-core.js?v=e3366801bf';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
