import { createCore } from './worker-core.js?v=630b02aac7';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
