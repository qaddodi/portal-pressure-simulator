import { createCore } from './worker-core.js?v=56bb3affe4';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
