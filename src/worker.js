import { createCore } from './worker-core.js?v=8214c900dc';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
