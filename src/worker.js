import { createCore } from './worker-core.js?v=3d883ff8c7';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
