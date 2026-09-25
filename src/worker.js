import { createCore } from './worker-core.js?v=17ba6b6409';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
