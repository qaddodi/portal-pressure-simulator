import { createCore } from './worker-core.js?v=af204d9ce5';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
