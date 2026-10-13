import { createCore } from './worker-core.js?v=c4e8a823f7';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
