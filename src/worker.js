import { createCore } from './worker-core.js?v=ec2d3407b3';

const core = createCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core.handle(e.data);
