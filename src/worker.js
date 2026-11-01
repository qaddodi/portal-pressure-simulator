import { createCore } from './worker-core.js?v=86ca82ae9c';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
