import { createCore } from './worker-core.js?v=56d1ecca94';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
