import { createCore } from './worker-core.js?v=2f04f8ec00';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
