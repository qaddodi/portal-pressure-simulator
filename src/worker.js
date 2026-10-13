import { createCore } from './worker-core.js?v=f867bd14bd';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
