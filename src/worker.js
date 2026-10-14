import { createCore } from './worker-core.js?v=4a3ac024f5';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
