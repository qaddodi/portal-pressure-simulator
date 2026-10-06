import { createCore } from './worker-core.js?v=3d195f834a';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
