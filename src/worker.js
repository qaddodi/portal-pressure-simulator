import { createCore } from './worker-core.js?v=5fdbf6549f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
