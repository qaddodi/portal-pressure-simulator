import { createCore } from './worker-core.js?v=126fd25c8e';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
