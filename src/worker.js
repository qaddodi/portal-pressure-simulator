import { createCore } from './worker-core.js?v=8eafc88d6d';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
