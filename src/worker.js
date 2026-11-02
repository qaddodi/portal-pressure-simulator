import { createCore } from './worker-core.js?v=efbb9ec33c';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
