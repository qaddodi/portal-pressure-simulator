import { createCore } from './worker-core.js?v=f72ec52a24';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
