import { createCore } from './worker-core.js?v=ac3ae7f485';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
