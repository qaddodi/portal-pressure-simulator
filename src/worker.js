import { createCore } from './worker-core.js?v=696ec7289d';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
