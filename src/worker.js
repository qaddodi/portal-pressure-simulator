import { createCore } from './worker-core.js?v=8ebe29170f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
