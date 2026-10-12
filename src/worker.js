import { createCore } from './worker-core.js?v=cb76c88e20';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
