import { createCore } from './worker-core.js?v=bd61dd886b';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
