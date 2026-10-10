import { createCore } from './worker-core.js?v=acf379f9cb';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
