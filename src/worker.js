import { createCore } from './worker-core.js?v=1f9a533e2a';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
