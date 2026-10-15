import { createCore } from './worker-core.js?v=e650a9ef5a';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
