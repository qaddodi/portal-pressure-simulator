import { createCore } from './worker-core.js?v=6b65908ed3';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
