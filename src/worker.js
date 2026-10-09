import { createCore } from './worker-core.js?v=d71e49cd68';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
