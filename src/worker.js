import { createCore } from './worker-core.js?v=dc13d3f996';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
