import { createCore } from './worker-core.js?v=45f27db41f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
