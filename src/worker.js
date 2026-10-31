import { createCore } from './worker-core.js?v=93592ee13c';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
