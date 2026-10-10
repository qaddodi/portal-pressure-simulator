import { createCore } from './worker-core.js?v=9ce36cd225';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
