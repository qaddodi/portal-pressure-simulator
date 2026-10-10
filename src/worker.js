import { createCore } from './worker-core.js?v=3e5b1bf224';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
