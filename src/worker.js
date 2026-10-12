import { createCore } from './worker-core.js?v=19fa98e79f';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
