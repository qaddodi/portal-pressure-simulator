import { createCore } from './worker-core.js?v=cb6829d893';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
