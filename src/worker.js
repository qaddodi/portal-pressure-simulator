import { createCore } from './worker-core.js?v=a02b247db5';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
