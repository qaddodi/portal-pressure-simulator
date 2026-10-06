import { createCore } from './worker-core.js?v=4532fbd544';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
