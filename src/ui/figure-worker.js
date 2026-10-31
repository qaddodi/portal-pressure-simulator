// The vessel renderer (veins-gl.js) running in a worker on the figure's canvas (worker plan, step 3; figure-worker-start.js starts it,
// figure-link.js is the protocol). The page sends the canvas once, the settings the renderer reads from the page (figure-settings.js),
// then queues of calls. This end applies them in order and answers with the renderer's state.

import { setFigureSettings } from './figure-settings.js?v=68c0336f5f';
import { serveFigure } from './figure-link.js?v=362fc16e0a';

let host = null;

async function handle(d) {
  if (d?.type === 'probe') {
    // What a renderer can do here, from one on a 1 px canvas, dropped again.
    try {
      if (typeof OffscreenCanvas !== 'function') throw new Error('no OffscreenCanvas');
      setFigureSettings(d.settings);   // (before the renderer loads: it reads its switches then, and the later init gets the same module)
      const { createVeinsGL } = await import('./veins-gl.js?v=4b339fceed');
      const api = createVeinsGL(new OffscreenCanvas(1, 1), { tubes: 1, force: true });
      if (!api) throw new Error('no WebGL2 here');
      const state = serveFigure(api, () => {}).snapshot();
      api.dispose?.({ lose: true });
      self.postMessage({ type: 'probed', state });
    } catch (e) { self.postMessage({ type: 'failed', why: String(e?.message || e) }); }
    return;
  }
  if (d?.type === 'init') {
    try {
      setFigureSettings(d.settings);
      // (After the settings: the renderer reads its switches when it loads.)
      const { createVeinsGL } = await import('./veins-gl.js?v=4b339fceed');
      const api = createVeinsGL(d.canvas, { tubes: d.tubes, force: d.force !== false });
      if (!api) throw new Error('no WebGL2 here');
      host = serveFigure(api, (m) => self.postMessage(m), d.canvas);
    } catch (e) { self.postMessage({ type: 'failed', why: String(e?.message || e) }); }
    return;
  }
  if (d?.type === 'settings') { setFigureSettings(d.settings); return; }
  host?.handle(d);
}

// (One message at a time, in order: the renderer is made by an asynchronous import, and the calls sent after init wait for it.)
let chain = Promise.resolve();
self.onmessage = ({ data }) => { chain = chain.then(() => handle(data)); };
