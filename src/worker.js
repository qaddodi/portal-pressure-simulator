import { createCore } from './worker-core.js?v=e16736579e';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
