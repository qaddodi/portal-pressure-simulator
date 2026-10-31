// The vessel renderer (veins-gl.js) running in a worker on the figure's canvas (worker plan, step 3; figure-worker-start.js starts it,
// figure-link.js is the protocol). The page sends the canvas once, the settings the renderer reads from the page (figure-settings.js),
// then queues of calls. This end applies them in order and answers with the renderer's state.

import { setFigureSettings } from './figure-settings.js?v=68c0336f5f';
import { serveFigure } from './figure-link.js?v=4e0c6f04bb';

let host = null;

self.onmessage = async ({ data: d }) => {
  if (d?.type === 'init') {
    try {
      if (typeof OffscreenCanvas !== 'function') throw new Error('no OffscreenCanvas');
      setFigureSettings(d.settings);
      // (After the settings: the renderer reads its switches when it loads.)
      const { createVeinsGL } = await import('./veins-gl.js?v=fbb9af8ae6');
      const api = createVeinsGL(d.canvas, { tubes: d.tubes, force: d.force !== false });
      if (!api) throw new Error('no WebGL2 here');
      host = serveFigure(api, (m) => self.postMessage(m), d.canvas);
      self.postMessage({ type: 'ready', state: host.snapshot() });
    } catch (e) {
      self.postMessage({ type: 'failed', why: String(e?.message || e) });
    }
    return;
  }
  if (d?.type === 'settings') { setFigureSettings(d.settings); return; }
  host?.handle(d);
};
