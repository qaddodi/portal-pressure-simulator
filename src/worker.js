import { createCore } from './worker-core.js?v=4d9170fe70';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
